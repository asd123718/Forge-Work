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
import { Delayer, disposableTimeout, raceCancellation } from "../../../../../../base/common/async.js";
import { decodeBase64, encodeBase64, VSBuffer } from "../../../../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { getErrorCode, isCancellationError } from "../../../../../../base/common/errors.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { getChatErrorDetailsFromMeta, getCopilotPlanFromEntitlement } from "../../../common/chatErrorMessages.js";
import { Disposable, DisposableMap, DisposableResourceMap, DisposableStore, MutableDisposable, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ResourceMap, ResourceSet } from "../../../../../../base/common/map.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { equals } from "../../../../../../base/common/objects.js";
import { autorun, autorunPerKeyedItem, constObservable, derived, derivedOpts, observableValue, transaction, waitForState } from "../../../../../../base/common/observable.js";
import { extUriBiasedIgnorePathCase, isEqual } from "../../../../../../base/common/resources.js";
import { StopWatch } from "../../../../../../base/common/stopwatch.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { isLocation } from "../../../../../../editor/common/languages.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { localize } from "../../../../../../nls.js";
import { AgentHostAllowSignedOutWhenUsableSettingId, AgentSession, CODEX_AGENT_PROVIDER_ID } from "../../../../../../platform/agentHost/common/agentService.js";
import { agentHostAuthority } from "../../../../../../platform/agentHost/common/agentHostUri.js";
import { isCustomizationEnabled } from "../../../../../../platform/agentHost/common/customizationEnablement.js";
import { findDeepestContainingWorkingDirectory } from "../../../../../../platform/agentHost/common/agentHostWorkingDirectories.js";
import { AgentHostElementAttachmentDisplayKind, getElementAttachmentCorrelationId, toElementAttachmentMeta } from "../../../../../../platform/agentHost/common/meta/agentElementAttachments.js";
import { AgentFeedbackAttachmentDisplayKind, AgentFeedbackAttachmentMetadataKey } from "../../../../../../platform/agentHost/common/meta/agentFeedbackAttachments.js";
import { BrowserViewAttachmentDisplayKind, BrowserViewAttachmentMetadataKey } from "../../../../../../platform/agentHost/common/meta/browserViewAttachments.js";
import { readToolCallMeta } from "../../../../../../platform/agentHost/common/meta/agentToolCallMeta.js";
import { readCompletionAttachmentMeta } from "../../../../../../platform/agentHost/common/meta/agentCompletionAttachmentMeta.js";
import { IRemoteAgentHostService } from "../../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { SessionConfigKey } from "../../../../../../platform/agentHost/common/sessionConfigKeys.js";
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME, RUNTIME_TOOL_SEARCH_TOOL_NAME } from "../../../../../../platform/agentHost/common/toolSearchConstants.js";
import { observableFromSubscription } from "../../../../../../platform/agentHost/common/state/agentSubscription.js";
import { CompletionItemKind as AhpCompletionItemKind, ContentEncoding } from "../../../../../../platform/agentHost/common/state/protocol/commands.js";
import { ConfirmationOptionKind, CustomizationType, McpServerStatus, SessionInputRequestKind, TerminalClaimKind, ToolCallContributorKind, ToolResultContentType } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { ActionType, isChatAction } from "../../../../../../platform/agentHost/common/state/sessionActions.js";
import { AHP_AUTH_REQUIRED, ProtocolError } from "../../../../../../platform/agentHost/common/state/sessionProtocol.js";
import { buildSubagentChatUri, ChatOriginKind, getInlineToolInput, getToolSubagentContent, isChatReadOnly, isMessageHiddenFromTranscript, MessageAttachmentKind, MessageKind, PendingMessageKind, ResponsePartKind, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, SessionStatus, StateComponents, ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallStatus, TurnState, parseChatUri, mergeSessionWithDefaultChat, readUsageInfoMeta, withMessageHiddenFromTranscript } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { ExtensionIdentifier } from "../../../../../../platform/extensions/common/extensions.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { packErrorForTelemetry } from "../../../../../../platform/telemetry/common/errorTelemetry.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { IPathService } from "../../../../../services/path/common/pathService.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustRequestService } from "../../../../../../platform/workspace/common/workspaceTrust.js";
import { IAgentHostTerminalService } from "../../../../terminal/browser/agentHostTerminalService.js";
import { ITerminalChatService } from "../../../../terminal/browser/terminal.js";
import {
  AgentHostCompletionReferenceKind,
  ChatTranscriptContextAttachmentDisplayKind,
  getAgentHostCompletionReferenceKind,
  isAgentFeedbackVariableEntry,
  isBrowserViewVariableEntry,
  isChatReferenceVariableEntry,
  isChatTranscriptContextVariableEntry,
  isImageVariableEntry,
  toChatTranscriptContextAttachmentMeta
} from "../../../common/attachments/chatVariableEntries.js";
import { coerceImageBuffer } from "../../../common/chatImageExtraction.js";
import { ChatRequestQueueKind, ElicitationState, IChatService, IChatToolInvocation, ToolConfirmKind } from "../../../common/chatService/chatService.js";
import { isTerminalCommandPrompt, SessionType } from "../../../common/chatSessionsService.js";
import { IChatEntitlementService } from "../../../../../services/chat/common/chatEntitlementService.js";
import { IWorkingCopyService } from "../../../../../services/workingCopy/common/workingCopyService.js";
import { ChatMode } from "../../../common/chatModes.js";
import { CHAT_SUBAGENT_RESOURCE_QUERY_PARAM, ChatAgentLocation, ChatConfiguration, ChatModeKind } from "../../../common/constants.js";
import { IChatEditingService } from "../../../common/editing/chatEditingService.js";
import { getLanguageModelDisplayNameWithProvider, ILanguageModelsService } from "../../../common/languageModels.js";
import { ChatInputStateOrigin, reviveSerializableInputState } from "../../../common/model/chatModel.js";
import { ChatElicitationRequestPart } from "../../../common/model/chatProgressTypes/chatElicitationRequestPart.js";
import { ChatToolInvocation } from "../../../common/model/chatProgressTypes/chatToolInvocation.js";
import { getChatSessionType, isUntitledChatSession } from "../../../common/model/chatUri.js";
import { IChatAgentService } from "../../../common/participants/chatAgents.js";
import { ILanguageModelToolsService, stringifyPromptTsxPart, ToolInvocationPresentation } from "../../../common/tools/languageModelToolsService.js";
import { IChatWidgetService } from "../../chat.js";
import { getAgentSessionProviderIcon } from "../agentSessions.js";
import { IAgentHostActiveClientService } from "./agentHostActiveClientService.js";
import { IAgentHostCustomizationService } from "./agentHostCustomizationService.js";
import { IAgentHostSessionWorkingDirectoryResolver } from "./agentHostSessionWorkingDirectoryResolver.js";
import { IAgentHostSessionWorkingDirectorySynchronizer } from "./agentHostSessionWorkingDirectorySynchronizer.js";
import { IAgentHostNewSessionFolderService, computeWorkingDirectories } from "./agentHostNewSessionFolderService.js";
import { AgentHostSnapshotController } from "./agentHostSnapshotController.js";
import { AgentHostResponseFileChangesProvider } from "./agentHostResponseFileChanges.js";
import { IChatResponseFileChangesService } from "../../chatResponseFileChangesService.js";
import { AgentHostSessionReferenceAttachmentDisplayKind, AgentHostSessionReferenceTrajectoryAttachmentDisplayKind, toSessionReferenceAttachmentMeta, toSessionReferenceModelRepresentation } from "./agentHostSessionReferenceAttachment.js";
import { buildHostLocalEventsPath } from "../../copilotCliEventsUri.js";
import { toolDataToDefinition } from "./agentHostToolUtils.js";
import { IAgentHostUntitledProvisionalSessionService } from "./agentHostUntitledProvisionalSessionService.js";
import { IAgentHostImportConversationStore } from "./agentHostImportConversationStore.js";
import { activeTurnToProgress, BOOLEAN_TRUE_OPTION_ID, completedToolCallToEditParts, completedToolCallToSerialized, containsAutomaticReplyAnswer, convertProtocolAnswers, convertProtocolPlanReviewResult, createInputRequestCarousel, createInputRequestPlanReview, finalizeToolInvocation, formatTurnResponseDetails, getTerminalContent, getUrlInputRequestPresentation, isSubagentTool, makeAhpTerminalToolSessionId, messageAttachmentsToVariableData, messageToRequestOrigin, messageToVariableData, parseAhpTerminalToolSessionId, rewriteAgentHostLinkTarget, shouldObserveSubagentChat, stringOrMarkdownToString, systemNotificationToChatPart, toolCallAuthenticationServer, toolCallStateToInvocation, toolCallStateToPreparedInvocation, toolCallStateToStreamingInvocation, turnsToHistory, updateRunningToolSpecificData, updateStreamingToolInvocation, usageInfoToAutoModeResolution, usageInfoToChatUsage, usageInfoToQuotas } from "./stateToProgressAdapter.js";
import { resolveMcpServerAuthentication, agentHostMcpServerId, modelRequiresAgentAuthentication } from "./agentHostAuth.js";
const MAX_INLINED_UNSAVED_EDITOR_BYTES = 1024 * 1024;
const CHAT_ACTIVITY_PROGRESS_ID = "agentHost.chatActivity";
const UNOBSERVED_CLIENT_TOOL_GRACE_MS = 5e3;
function getMcpAuthenticationRequiredServers(sessionResource, state) {
  const servers = state?.customizations?.flatMap((c) => c.type === CustomizationType.McpServer ? [c] : c.children?.filter((c2) => c2.type === CustomizationType.McpServer) ?? []) ?? [];
  const toolAuthServerIds = new Set(state?.inputNeeded?.filter((request) => request.kind === SessionInputRequestKind.ToolAuthentication).map((request) => request.kind === SessionInputRequestKind.ToolAuthentication ? request.toolCall.contributor.customizationId : void 0).filter((id) => id !== void 0));
  return servers.filter((server) => isCustomizationEnabled(server) && server.state.kind === McpServerStatus.AuthRequired && !toolAuthServerIds.has(server.id)).map((server) => {
    const state2 = server.state;
    return {
      id: sessionResource.authority + "/" + server.id,
      name: server.name,
      resource: state2.resource.resource,
      oauthClient: state2.oauthClient,
      authorizationServers: state2.resource.authorization_servers,
      supportedScopes: state2.resource.scopes_supported,
      requiredScopes: state2.requiredScopes,
      reason: state2.reason
    };
  });
}
function parseTimestamp(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : void 0;
}
function getSubagentTiming(state) {
  const turns = state.activeTurn ? [...state.turns, state.activeTurn] : state.turns;
  const starts = turns.map((turn) => turn.startedAt ? Date.parse(turn.startedAt) : void 0).filter((timestamp) => timestamp !== void 0 && Number.isFinite(timestamp));
  const startedAt = starts.length > 0 ? Math.min(...starts) : void 0;
  if (startedAt === void 0 || state.activeTurn) {
    return { startedAt, duration: void 0 };
  }
  const ends = state.turns.flatMap((turn) => {
    const turnStartedAt = turn.startedAt ? Date.parse(turn.startedAt) : void 0;
    return turnStartedAt !== void 0 && Number.isFinite(turnStartedAt) && typeof turn.duration === "number" && Number.isFinite(turn.duration) ? [turnStartedAt + Math.max(0, turn.duration)] : [];
  });
  const endedAt = ends.length > 0 ? Math.max(...ends) : void 0;
  return { startedAt, duration: endedAt !== void 0 ? Math.max(0, endedAt - startedAt) : void 0 };
}
function userOriginMessage(text, attachments) {
  return attachments?.length ? { text, origin: { kind: MessageKind.User }, attachments: [...attachments] } : { text, origin: { kind: MessageKind.User } };
}
function unwrapSessionLoadErrorMessage(err) {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : void 0;
  if (!message) {
    return void 0;
  }
  return message.replace(/^Failed to restore session .+?: /, "");
}
function resolveRestoredSubagentChatResource(parentSession, toolCallId, catalogResource, persistedResource) {
  if (catalogResource) {
    return catalogResource;
  }
  if (persistedResource) {
    const parsed = parseChatUri(persistedResource);
    if (parsed?.session === parentSession && parsed.chatId === `subagent/${toolCallId}`) {
      return persistedResource;
    }
  }
  return buildSubagentChatUri(parentSession, toolCallId);
}
function lastTurnModelSelection(state) {
  return lastTurnMessage(state)?.model;
}
function isFirstVisibleProgressPart(part) {
  return part.kind === "markdownContent" || part.kind === "thinking" || part.kind === "toolInvocation";
}
function lastTurnMessage(state) {
  return state?.activeTurn?.message ?? (state && state.turns.length ? state.turns[state.turns.length - 1].message : void 0);
}
function emptyDraftFromLastTurn(state) {
  const message = lastTurnMessage(state);
  if (!message?.model && !message?.agent) {
    return void 0;
  }
  return {
    text: "",
    origin: { kind: MessageKind.User },
    ...message.model ? { model: message.model } : {},
    ...message.agent ? { agent: message.agent } : {}
  };
}
function sameDraftUserContent(a, b) {
  return (a?.text ?? "") === (b?.text ?? "") && equals(a?.attachments, b?.attachments);
}
function confirmedReasonToProtocol(reason) {
  switch (reason?.type) {
    case ToolConfirmKind.ConfirmationNotNeeded:
      return ToolCallConfirmationReason.NotNeeded;
    case ToolConfirmKind.Setting:
    case ToolConfirmKind.LmServicePerTool:
      return ToolCallConfirmationReason.Setting;
    default:
      return ToolCallConfirmationReason.UserAction;
  }
}
function getClientToolPreApproval(toolCall) {
  if (readToolCallMeta(toolCall).autoApproveBySetting === true) {
    return { type: ToolConfirmKind.Setting, id: SessionConfigKey.AutoApprove };
  }
  switch (toolCall.status) {
    case ToolCallStatus.Running:
    case ToolCallStatus.AuthRequired:
      switch (toolCall.confirmed) {
        case ToolCallConfirmationReason.NotNeeded:
          return { type: ToolConfirmKind.ConfirmationNotNeeded };
        case ToolCallConfirmationReason.Setting:
          return { type: ToolConfirmKind.Setting, id: SessionConfigKey.AutoApprove };
        case ToolCallConfirmationReason.UserAction:
          return { type: ToolConfirmKind.UserAction };
      }
  }
  return void 0;
}
function metaWithoutToolSearchCandidates(source) {
  const meta = { ...source._meta };
  delete meta["toolSearchCandidates"];
  return meta;
}
async function resolveToolInput(connection, toolInput) {
  if (toolInput === void 0) {
    return "{}";
  }
  if (typeof toolInput === "string") {
    return toolInput;
  }
  const result = await connection.resourceRead(URI.parse(toolInput.uri));
  return result.encoding === ContentEncoding.Base64 ? decodeBase64(result.data).toString() : result.data;
}
function convertCarouselAnswers(raw, questions = []) {
  const answers = {};
  const questionKinds = new Map(questions.map((question) => [question.id, question.kind]));
  for (const [qId, answer] of Object.entries(raw)) {
    if (typeof answer === "string") {
      answers[qId] = {
        state: ChatInputAnswerState.Submitted,
        value: { kind: ChatInputAnswerValueKind.Text, value: answer }
      };
    } else if (answer && typeof answer === "object") {
      const multi = answer;
      const single = answer;
      if (Array.isArray(multi.selectedValues)) {
        answers[qId] = {
          state: ChatInputAnswerState.Submitted,
          value: {
            kind: ChatInputAnswerValueKind.SelectedMany,
            value: multi.selectedValues,
            freeformValues: multi.freeformValue ? [multi.freeformValue] : void 0
          }
        };
      } else if (single.selectedValue && questionKinds.get(qId) === ChatInputQuestionKind.Boolean) {
        answers[qId] = {
          state: ChatInputAnswerState.Submitted,
          value: {
            kind: ChatInputAnswerValueKind.Boolean,
            value: single.selectedValue === BOOLEAN_TRUE_OPTION_ID
          }
        };
      } else if (single.selectedValue) {
        answers[qId] = {
          state: ChatInputAnswerState.Submitted,
          value: {
            kind: ChatInputAnswerValueKind.Selected,
            value: single.selectedValue,
            freeformValues: single.freeformValue ? [single.freeformValue] : void 0
          }
        };
      } else if (single.freeformValue) {
        answers[qId] = {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Text, value: single.freeformValue }
        };
      }
    }
  }
  return answers;
}
function getPlanReviewAction(planReview, actionId, actionLabel) {
  if (actionId) {
    const action = planReview.actions.find((a) => a.id === actionId);
    if (action) {
      return action;
    }
  }
  if (actionLabel) {
    return planReview.actions.find((a) => a.label === actionLabel);
  }
  return void 0;
}
function submittedTextAnswer(value) {
  return {
    state: ChatInputAnswerState.Submitted,
    value: { kind: ChatInputAnswerValueKind.Text, value }
  };
}
function submittedSelectedAnswer(value, feedback) {
  return {
    state: ChatInputAnswerState.Submitted,
    value: {
      kind: ChatInputAnswerValueKind.Selected,
      value,
      ...feedback ? { freeformValues: [feedback] } : {}
    }
  };
}
function convertPlanReviewResult(planReview, result) {
  const feedback = result.feedback?.trim();
  if (feedback) {
    const action2 = getPlanReviewAction(planReview, result.actionId, result.action);
    return {
      response: ChatInputResponseKind.Accept,
      answers: {
        [planReview.answerQuestionId]: action2 ? submittedSelectedAnswer(action2.id, feedback) : submittedTextAnswer(feedback)
      }
    };
  }
  if (result.rejected) {
    return { response: ChatInputResponseKind.Decline };
  }
  const action = getPlanReviewAction(planReview, result.actionId, result.action);
  if (!action) {
    return { response: ChatInputResponseKind.Decline };
  }
  return {
    response: ChatInputResponseKind.Accept,
    answers: {
      [planReview.answerQuestionId]: submittedSelectedAnswer(action.id)
    }
  };
}
function inputRequestResponsePartKey(part) {
  return `ir:${part.request.id}:${JSON.stringify({ ...part.request, answers: void 0 })}`;
}
let AgentHostChatSession = class extends Disposable {
  constructor(sessionResource, history, title, sessionSubscription, chatSubscription, _promptCacheNotification, _forkSession, _renameSession, inputState, initialProgress, historySubagentObservations, onDispose, interruptActiveResponse, _logService) {
    super();
    this.sessionResource = sessionResource;
    this.history = history;
    this.title = title;
    this._promptCacheNotification = _promptCacheNotification;
    this._forkSession = _forkSession;
    this._renameSession = _renameSession;
    this._logService = _logService;
    this.progressObs = observableValue("agentHostProgress", []);
    this.isCompleteObs = observableValue("agentHostComplete", true);
    this._sessionState = observableValue(this, constObservable(void 0));
    this._chatState = observableValue(this, constObservable(void 0));
    this._promptCacheTracking = this._register(new MutableDisposable());
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this._onDidStartServerRequest = this._register(new Emitter());
    this.onDidStartServerRequest = this._onDidStartServerRequest.event;
    this.setStateSubscriptions(sessionSubscription, chatSubscription);
    this.isReadOnly = derived(this, (reader) => {
      const sessionArchived = Boolean((this._sessionState.read(reader).read(reader)?.status ?? 0) & SessionStatus.IsArchived);
      return isChatReadOnly(this._chatState.read(reader).read(reader)?.interactivity, sessionArchived);
    });
    const hasActiveTurn = initialProgress !== void 0;
    this.transferredState = inputState ? { editingSession: void 0, inputState } : void 0;
    if (hasActiveTurn) {
      this.isCompleteObs.set(false, void 0);
      this.progressObs.set(initialProgress, void 0);
    }
    this._register(historySubagentObservations);
    this._register(toDisposable(onDispose));
    this.interruptActiveResponseCallback = async () => interruptActiveResponse();
    this.forkSession = this._forkSession;
    this.renameSession = this._renameSession;
  }
  setStateSubscriptions(sessionSubscription, chatSubscription) {
    this._promptCacheTracking.clear();
    this._promptCacheTracking.value = sessionSubscription ? this._promptCacheNotification?.trackSession(this.sessionResource, sessionSubscription) : void 0;
    transaction((tx) => {
      this._sessionState.set(sessionSubscription ? observableFromSubscription(this, sessionSubscription) : constObservable(void 0), tx);
      this._chatState.set(chatSubscription ? observableFromSubscription(this, chatSubscription) : constObservable(void 0), tx);
    });
  }
  dispose() {
    if (!this._store.isDisposed) {
      this._onWillDispose.fire();
    }
    super.dispose();
  }
  /**
   * Registers a disposable to be cleaned up when this session is disposed.
   */
  registerDisposable(disposable) {
    return this._register(disposable);
  }
  /**
   * Appends new progress items to the observable. Used by the reconnection
   * flow to stream ongoing state changes into the chat UI.
   */
  appendProgress(items) {
    const current = this.progressObs.get();
    this.progressObs.set([...current, ...items], void 0);
  }
  /**
   * Marks the active turn as complete.
   */
  complete() {
    this.isCompleteObs.set(true, void 0);
  }
  /**
   * Called by the session handler when a server-initiated turn starts.
   * Resets the progress observable and signals listeners to create a new
   * request+response pair in the chat model. `turnId` is the provider's turn
   * id and is adopted as the chat request id, so features that address a turn
   * by request id (side chats, forks) can resolve it against the host.
   */
  startServerRequest(turnId, prompt, variableData, options) {
    this._logService.info("[AgentHost] Server-initiated request started");
    transaction((tx) => {
      this.progressObs.set([], tx);
      this.isCompleteObs.set(false, tx);
    });
    this._onDidStartServerRequest.fire({
      id: turnId,
      prompt,
      variableData,
      isSystemInitiated: options?.isSystemInitiated,
      isHidden: options?.isHidden,
      timestamp: options?.timestamp,
      isTerminalRequest: options?.isTerminalRequest,
      origin: options?.origin
    });
  }
};
AgentHostChatSession = __decorateClass([
  __decorateParam(13, ILogService)
], AgentHostChatSession);
function offsetToPosition(text, offset) {
  let lineNumber = 1;
  let column = 1;
  const limit = Math.min(offset, text.length);
  for (let i = 0; i < limit; i++) {
    if (text.charCodeAt(i) === 10) {
      lineNumber++;
      column = 1;
    } else {
      column++;
    }
  }
  return { lineNumber, column };
}
class ActiveClientEntry extends Disposable {
  constructor(_scope, clientId, debounceDelay, _getSessionState, _dispatch) {
    super();
    this._scope = _scope;
    this._getSessionState = _getSessionState;
    this._dispatch = _dispatch;
    this._state = observableValue(this, true);
    this._cancellation = new CancellationTokenSource();
    this._reconcileSignal = observableValue(this, 0);
    this._stateSubscription = this._register(new MutableDisposable());
    this._claimRequested = false;
    this._activeClient = _scope.activeClient(clientId);
    this._publishDelayer = this._register(new Delayer(debounceDelay));
    this._register(_scope);
    this._register(toDisposable(() => this._cancellation.dispose(true)));
    this._register(autorun((reader) => {
      if (!this._scope.isResolved.read(reader)) {
        return;
      }
      this._activeClient.read(reader);
      this._reconcileSignal.read(reader);
      this._requestReconciliation();
    }));
  }
  /** Snapshot of the composed active-client view. */
  getActiveClient() {
    return this._activeClient.get();
  }
  /** Resolves once no active-client publish is pending. */
  async whenSettled() {
    await waitForState(this._state, (state) => !state, void 0, this._cancellation.token);
  }
  /** Binds the backend session and requests this client join it. */
  claim(backendSession) {
    this._backendSession = backendSession;
    this._claimRequested = true;
    this._requestReconciliation();
  }
  /** Binds the backend session and reconciles without claiming it. */
  attach(backendSession, sessionSubscription) {
    this._backendSession = backendSession;
    this._stateSubscription.value = sessionSubscription?.onDidChange(() => {
      this._reconcileSignal.set(this._reconcileSignal.get() + 1, void 0);
    });
    this._requestReconciliation();
  }
  _requestReconciliation() {
    if (this._cancellation.token.isCancellationRequested) {
      return;
    }
    if (!this._scope.isResolved.get()) {
      this._state.set(true, void 0);
      return;
    }
    if (!this._backendSession) {
      this._state.set(false, void 0);
      return;
    }
    this._state.set(true, void 0);
    this._publishDelayer.trigger(async () => {
      try {
        if (this._cancellation.token.isCancellationRequested) {
          return;
        }
        const backendSession = this._backendSession;
        if (!backendSession || !this._scope.isResolved.get()) {
          return;
        }
        const activeClient = this._activeClient.get();
        const existing = this._getSessionState(backendSession)?.activeClients.find((client) => client.clientId === activeClient.clientId);
        if (!existing && !this._claimRequested) {
          return;
        }
        if (equals(existing, activeClient)) {
          this._lastPublished = void 0;
          return;
        }
        if (equals(this._lastPublished, activeClient)) {
          return;
        }
        this._dispatch(backendSession, {
          type: ActionType.SessionActiveClientSet,
          activeClient
        });
        this._lastPublished = activeClient;
      } finally {
        if (this._scope.isResolved.get()) {
          this._state.set(false, void 0);
        }
      }
    }).catch(() => {
    });
  }
}
let AgentHostSessionHandler = class extends Disposable {
  constructor(config, _chatAgentService, _chatService, _chatEditingService, _logService, _workspaceContextService, _instantiationService, _terminalChatService, _agentHostTerminalService, _workingDirectoryResolver, _workingDirectorySynchronizer, _newSessionFolderService, _provisionalService, _importConversationStore, _toolsService, _chatWidgetService, _languageModelsService, _openerService, _activeClientService, _chatEntitlementService, _workspaceTrustRequestService, _modelService, _workingCopyService, _configurationService, _chatResponseFileChangesService, _pathService, _remoteAgentHostService, _customizationService, _telemetryService) {
    super();
    this._chatAgentService = _chatAgentService;
    this._chatService = _chatService;
    this._chatEditingService = _chatEditingService;
    this._logService = _logService;
    this._workspaceContextService = _workspaceContextService;
    this._instantiationService = _instantiationService;
    this._terminalChatService = _terminalChatService;
    this._agentHostTerminalService = _agentHostTerminalService;
    this._workingDirectoryResolver = _workingDirectoryResolver;
    this._workingDirectorySynchronizer = _workingDirectorySynchronizer;
    this._newSessionFolderService = _newSessionFolderService;
    this._provisionalService = _provisionalService;
    this._importConversationStore = _importConversationStore;
    this._toolsService = _toolsService;
    this._chatWidgetService = _chatWidgetService;
    this._languageModelsService = _languageModelsService;
    this._openerService = _openerService;
    this._activeClientService = _activeClientService;
    this._chatEntitlementService = _chatEntitlementService;
    this._workspaceTrustRequestService = _workspaceTrustRequestService;
    this._modelService = _modelService;
    this._workingCopyService = _workingCopyService;
    this._configurationService = _configurationService;
    this._chatResponseFileChangesService = _chatResponseFileChangesService;
    this._pathService = _pathService;
    this._remoteAgentHostService = _remoteAgentHostService;
    this._customizationService = _customizationService;
    this._telemetryService = _telemetryService;
    this._activeSessions = new ResourceMap();
    this._chatURIsBySessionResource = new ResourceMap();
    /** Per-session subscription to chat model pending request changes. */
    this._pendingMessageSubscriptions = this._register(new DisposableResourceMap());
    this._remotePendingMessageProjections = new ResourceSet();
    /** Per-session debounced sync from chat input state to AHP draft state. */
    this._draftSyncSubscriptions = this._register(new DisposableResourceMap());
    /** Per-session subscription watching for server-initiated turns. */
    this._serverTurnWatchers = this._register(new DisposableResourceMap());
    /** Per-session subscription silently resolving existing MCP authentication grants. */
    this._mcpAuthWatchers = this._register(new DisposableResourceMap());
    /**
     * Ownership of actionable protocol requests, keyed by backend session URI
     * string. `inputNeeded` is a session-level queue and the single caller of
     * {@link invokeTool} for client tools, so it must be handled exactly once
     * per backend session no matter how many sibling chat resources (default
     * chat, peer chats, subagent chats) are open against it. Each such resource
     * holds a reference; the shared watcher stays alive while any reference
     * remains and is disposed only when the last one is released.
     */
    this._inputNeededWatchers = /* @__PURE__ */ new Map();
    /**
     * Backend session each open resource's {@link _inputNeededWatchers}
     * reference belongs to, recorded when the reference is installed. Teardown
     * uses this to release the right reference without re-deriving the backend
     * session via {@link _resolveSessionUri}, whose provisional mapping may
     * already be cleared by then.
     */
    this._inputNeededWatcherBackends = new ResourceMap();
    /** One reconciliation owner per active session. */
    this._activeClientEntries = new ResourceMap();
    /** Historical turns with file edits, pending hydration into the editing session. */
    this._pendingHistoryTurns = new ResourceMap();
    /**
     * Requests a turn observer is currently rendering, keyed by
     * {@link _toolCallKey} for tool calls and {@link _inputRequestKey} for chat
     * input requests (the two key shapes differ in arity, so they cannot
     * collide). The value is the claiming observer's session resource, which
     * the session-level responder uses as the chat context when it executes a
     * client tool so the tool runs against the chat that is actually rendering
     * it. The session-level responder defers to those observers so the inline
     * UI stays in charge of answering.
     */
    this._renderedRequests = observableValue(this, /* @__PURE__ */ new Map());
    /** Tool calls whose protocol outcome has already been dispatched. */
    this._resolvedToolCalls = /* @__PURE__ */ new Set();
    /**
     * A single {@link ChatToolInvocation} per client tool call, keyed by
     * {@link _toolCallKey}. Created lazily by whichever of the session-level
     * watcher or the turn observer arrives first, so both act on one object:
     * the observer renders it while the watcher executes it. Entries are
     * dropped once the call resolves so a later call with the same ids is not
     * mistaken for it.
     */
    this._clientToolInvocations = /* @__PURE__ */ new Map();
    /**
     * Live `inputNeeded` requests per tool call, keyed by {@link _toolCallKey}.
     * One tool call is represented by a succession of requests — a confirmation
     * is replaced by a client execution once approved — so the shared state
     * above is only released when the last of them goes away.
     */
    this._clientToolRetainCounts = /* @__PURE__ */ new Map();
    /**
     * Per-session set of MCP server ids that already had an authentication
     * prompt surfaced in the current conversation. A server is removed from the
     * set once it reaches the running state ({@link McpServerStatus.Ready}), so
     * that a later auth requirement for the same server prompts again instead of
     * the prompt repeating on every message.
     */
    this._surfacedMcpAuthServers = new ResourceMap();
    this._pendingMcpAutoAuthentication = /* @__PURE__ */ new Map();
    /** Turn IDs dispatched by this client, used to distinguish server-originated turns. */
    this._clientDispatchedTurnIds = /* @__PURE__ */ new Set();
    this._turnStopWatches = /* @__PURE__ */ new Map();
    /** Active session subscriptions, keyed by backend session URI string. */
    this._sessionSubscriptions = /* @__PURE__ */ new Map();
    /**
     * Working-directory synchronizer registrations, keyed by session URI. Each
     * lives exactly as long as that session's {@link _sessionSubscriptions} entry.
     */
    this._workingDirectoryRegistrations = this._register(new DisposableMap());
    /**
     * Active default-chat subscriptions, keyed by backend session URI string.
     * Multi-chat is not yet surfaced: every session is served by a single
     * implicit default chat that carries the conversation contents (turns,
     * active turn, pending/queued messages, input requests). We subscribe to
     * it alongside the session and merge both into the {@link ISessionWithDefaultChat}
     * view returned by {@link _getSessionState}.
     */
    this._defaultChatSubscriptions = /* @__PURE__ */ new Map();
    /**
     * Active subscriptions for additional (non-default) peer chats, keyed by
     * the chat channel URI string. Populated when a chat widget is opened for
     * a resource that carries a chatId fragment.
     */
    this._additionalChatSubscriptions = /* @__PURE__ */ new Map();
    /**
     * Backend session URIs with an in-flight {@link provideChatSessionContent}
     * call, keyed by session URI string with a refcount value. While a chat is
     * still hydrating its subscriptions, a sibling chat of the same session
     * closing must not tear down the shared session subscription out from under
     * it (see {@link _releaseChatSessionSubscriptions} / {@link _hasOtherSessionHold}).
     */
    this._hydratingChatSessions = /* @__PURE__ */ new Map();
    this._config = config;
    this._register(toDisposable(() => {
      for (const { store } of this._inputNeededWatchers.values()) {
        store.dispose();
      }
      this._inputNeededWatchers.clear();
      this._inputNeededWatcherBackends.clear();
    }));
    this._register(this._customizationService.onDidChangeCustomizations(() => this._reconcileSurfacedMcpAuthServers()));
    this._register(toDisposable(() => {
      for (const entry of this._activeClientEntries.values()) {
        entry.dispose();
      }
      this._activeClientEntries.clear();
    }));
    this._register(this._terminalChatService.onDidContinueInBackground((terminalToolSessionId) => {
      const parsed = parseAhpTerminalToolSessionId(terminalToolSessionId);
      if (!parsed) {
        return;
      }
      this._logService.info(`[AgentHost] Continue in background: terminal=${parsed.terminal}, session=${parsed.session}`);
      this._config.connection.dispatch(parsed.terminal, {
        type: ActionType.TerminalClaimed,
        claim: {
          kind: TerminalClaimKind.Session,
          session: parsed.session
        }
      });
    }));
    this._register(this._chatEditingService.registerEditingSessionProvider(
      config.sessionType,
      {
        createEditingSession: (chatSessionResource) => {
          return this._instantiationService.createInstance(
            AgentHostSnapshotController,
            chatSessionResource,
            config.connectionAuthority
          );
        }
      }
    ));
    this._register(this._chatResponseFileChangesService.registerProvider(
      config.sessionType,
      this._register(new AgentHostResponseFileChangesProvider(
        config.connection,
        config.connectionAuthority,
        (sessionResource) => this._resolveSessionUri(sessionResource),
        (sessionResource) => {
          const chatURI = this._chatURIsBySessionResource.get(sessionResource);
          return chatURI ? URI.parse(chatURI) : void 0;
        }
      ))
    ));
    this._registerAgent();
  }
  /**
   * Resolves the signed-in user's plan context for chat error formatting.
   * The agent host does not know the user's plan, so quota/rate-limit
   * messages are personalized here from `IChatEntitlementService`.
   */
  _chatErrorContext() {
    const quotas = this._chatEntitlementService.quotas;
    return {
      copilotPlan: getCopilotPlanFromEntitlement(this._chatEntitlementService.entitlement),
      isUsageBasedBilling: quotas.usageBasedBilling,
      quotaResetDate: quotas.resetDate
    };
  }
  async provideChatInputCompletions(sessionResource, params, token) {
    let backendSession;
    if (isUntitledChatSession(sessionResource)) {
      const provisionalSession = await raceCancellation(this._provisionalService.waitForPending(sessionResource), token);
      if (token.isCancellationRequested) {
        return void 0;
      }
      if (!provisionalSession) {
        return void 0;
      }
      backendSession = provisionalSession;
    } else {
      backendSession = this._resolveSessionUri(sessionResource);
    }
    const result = await this._config.connection.completions({
      kind: AhpCompletionItemKind.UserMessage,
      channel: backendSession.toString(),
      text: params.text,
      offset: params.offset
    });
    if (token.isCancellationRequested) {
      return void 0;
    }
    const items = [];
    for (const raw of result.items) {
      const mapped = this._toChatInputCompletionItem(raw, params.text);
      if (mapped) {
        items.push(mapped);
      }
    }
    return { items };
  }
  provideChatInputCompletionTriggerCharacters() {
    return this._config.connection.getCompletionTriggerCharacters();
  }
  _createCompletionItem(raw, text, attachment, label) {
    const item = {
      insertText: raw.insertText,
      attachment
    };
    if (label !== void 0) {
      item.label = label;
    }
    if (raw.rangeStart !== void 0) {
      item.start = offsetToPosition(text, raw.rangeStart);
    }
    if (raw.rangeEnd !== void 0) {
      item.end = offsetToPosition(text, raw.rangeEnd);
    }
    return item;
  }
  _toChatInputCompletionItem(raw, text) {
    const attachment = raw.attachment;
    switch (attachment.type) {
      case MessageAttachmentKind.Simple: {
        const completionMeta = readCompletionAttachmentMeta(attachment);
        if (completionMeta?.kind === "command") {
          return this._createCompletionItem(raw, text, {
            kind: "command",
            command: completionMeta.command,
            description: completionMeta.description ?? "",
            ...attachment._meta !== void 0 && { _meta: attachment._meta }
          }, attachment.label !== raw.insertText ? attachment.label : void 0);
        }
        if (completionMeta?.kind === "skill") {
          return this._createCompletionItem(raw, text, {
            kind: "skill",
            uri: URI.parse(completionMeta.uri),
            ...completionMeta.displayName !== void 0 ? { displayName: completionMeta.displayName } : {},
            ...completionMeta.description !== void 0 ? { description: completionMeta.description } : {},
            ...attachment._meta !== void 0 && { _meta: attachment._meta }
          });
        }
        return void 0;
      }
      case MessageAttachmentKind.Resource: {
        const uri = typeof attachment.uri === "string" ? URI.parse(attachment.uri) : URI.from(attachment.uri);
        return this._createCompletionItem(raw, text, {
          kind: "resource",
          uri,
          displayName: attachment.label,
          isDirectory: attachment.displayKind === "directory",
          ...attachment._meta !== void 0 && { _meta: attachment._meta }
        });
      }
      case MessageAttachmentKind.Chat: {
        return this._createCompletionItem(raw, text, {
          kind: "chat",
          uri: URI.parse(attachment.resource),
          endTurn: attachment.endTurn,
          title: attachment.label,
          displayName: attachment.label,
          ...attachment._meta !== void 0 && { _meta: attachment._meta }
        });
      }
      default:
        return void 0;
    }
  }
  async provideChatSessionContent(sessionResource, token) {
    if (sessionResource.path.substring(1).startsWith("untitled-")) {
      throw new Error(`Agent host chat sessions must be created by the sessions provider: ${sessionResource.toString()}`);
    }
    const resolvedSession = this._resolveSessionUri(sessionResource);
    let chatURI;
    const isNewSession = this._isNewSessionResource(sessionResource);
    const history = [];
    let initialProgress;
    let initialResponsePartCount = 0;
    let activeTurnId;
    let sessionTitle;
    let draftInputState;
    let sessionSubscription;
    let chatSubscription;
    const historySubagentObservations = new DisposableStore();
    const hydrationKey = resolvedSession.toString();
    if (isNewSession) {
      this._ensureActiveClientEntry(sessionResource);
    }
    this._hydratingChatSessions.set(hydrationKey, (this._hydratingChatSessions.get(hydrationKey) ?? 0) + 1);
    try {
      if (!isNewSession) {
        try {
          const sub = this._ensureSessionSubscription(resolvedSession.toString());
          sessionSubscription = sub;
          await this._whenSubscriptionHydrated(sub, token);
          if (sub.value instanceof Error) {
            throw sub.value;
          }
          const rawState = this._getRawSessionState(resolvedSession.toString());
          if (!rawState) {
            throw new Error(`Session state did not hydrate for ${resolvedSession.toString()}`);
          }
          chatURI = this._resolveChatUriFromState(sessionResource, rawState);
          this._setChatURI(sessionResource, chatURI);
          const chatSub = this._ensureChatSubscription(resolvedSession.toString(), chatURI);
          chatSubscription = chatSub;
          await this._whenSubscriptionHydrated(chatSub, token);
          const sessionState = this._getSessionState(resolvedSession.toString(), chatURI);
          if (sessionState) {
            sessionTitle = sessionState.title;
            const draft = sessionState.draft ?? emptyDraftFromLastTurn(sessionState);
            draftInputState = this._draftToInputState(sessionResource, draft);
            if (!sessionState.draft && draft) {
              this._config.connection.dispatch(chatURI, { type: ActionType.ChatDraftChanged, draft });
            }
            const fallbackRawModelId = lastTurnModelSelection(sessionState)?.id;
            const lookup = this._createTurnModelLookup(sessionResource, fallbackRawModelId);
            history.push(...turnsToHistory(
              resolvedSession,
              sessionState.turns,
              this._config.agentId,
              this._config.connectionAuthority,
              lookup,
              this._chatErrorContext(),
              this._config.connection.initializeResult.get()?.terminalCommandPrefix
            ));
            await this._enrichHistoryWithSubagentCalls(history, resolvedSession, sessionResource, sessionState, historySubagentObservations);
            if (sessionState.turns.length > 0) {
              this._pendingHistoryTurns.set(sessionResource, sessionState.turns);
            }
            if (sessionState.activeTurn) {
              activeTurnId = sessionState.activeTurn.id;
              const activeRawModelId = sessionState.activeTurn.usage?.model ?? fallbackRawModelId;
              history.push({
                id: sessionState.activeTurn.id,
                type: "request",
                prompt: sessionState.activeTurn.message.text,
                participant: this._config.agentId,
                modelId: lookup.toLanguageModelId(activeRawModelId),
                timestamp: parseTimestamp(sessionState.activeTurn.startedAt),
                variableData: messageToVariableData(sessionState.activeTurn.message, this._config.connectionAuthority),
                isSystemInitiated: sessionState.activeTurn.message.origin.kind === MessageKind.SystemNotification,
                origin: messageToRequestOrigin(resolvedSession, sessionState.activeTurn.message, this._config.agentId)
              });
              history.push({
                type: "response",
                parts: [],
                participant: this._config.agentId,
                details: lookup.toResponseDetails(activeRawModelId, sessionState.activeTurn.usage)
              });
              initialProgress = activeTurnToProgress(
                resolvedSession,
                sessionState.activeTurn,
                this._config.connectionAuthority,
                sessionResource.authority,
                this._otherClientToolInvocationOptions(resolvedSession, chatURI, sessionState.activeTurn.id),
                lookup
              );
              initialResponsePartCount = sessionState.activeTurn.responseParts.length;
              const actualModelId = this._toLanguageModelId(sessionResource, sessionState.activeTurn.usage?.model);
              if (actualModelId) {
                for (const p of initialProgress) {
                  if (p.kind === "usage") {
                    p.actualModelId = actualModelId;
                  }
                }
              }
              this._logService.info(`[AgentHost] Reconnecting to active turn ${activeTurnId} for session ${resolvedSession.toString()}`);
            }
          }
        } catch (err) {
          this._logService.warn(`[AgentHost] Failed to subscribe to existing session: ${resolvedSession.toString()}`, err);
          if (history.length === 0) {
            history.push({
              type: "request",
              prompt: "",
              participant: this._config.agentId,
              isSystemInitiated: true,
              systemInitiatedLabel: localize("agentHost.sessionLoadFailedLabel", "Couldn't open session")
            });
            history.push({
              type: "response",
              parts: [],
              participant: this._config.agentId,
              errorDetails: { message: unwrapSessionLoadErrorMessage(err) ?? localize("agentHost.sessionLoadFailed", "This session couldn't be loaded.") }
            });
          }
        }
      }
    } finally {
      const remaining = (this._hydratingChatSessions.get(hydrationKey) ?? 1) - 1;
      if (remaining > 0) {
        this._hydratingChatSessions.set(hydrationKey, remaining);
      } else {
        this._hydratingChatSessions.delete(hydrationKey);
      }
    }
    let session;
    try {
      session = this._instantiationService.createInstance(
        AgentHostChatSession,
        sessionResource,
        history,
        sessionTitle,
        sessionSubscription,
        chatSubscription,
        this._config.promptCacheNotification,
        (request, token2) => {
          if (!this._getSessionState(resolvedSession.toString())) {
            throw new Error("Cannot fork session before the initial request");
          }
          return this._forkSession(sessionResource, resolvedSession, request, token2);
        },
        (title, _token) => {
          this._config.connection.dispatch(resolvedSession.toString(), {
            type: ActionType.SessionTitleChanged,
            title
          });
          return Promise.resolve();
        },
        draftInputState,
        initialProgress,
        historySubagentObservations,
        () => {
          this._activeSessions.delete(sessionResource);
          this._disposeActiveClientEntry(sessionResource);
          this._pendingMessageSubscriptions.deleteAndDispose(sessionResource);
          this._draftSyncSubscriptions.deleteAndDispose(sessionResource);
          this._serverTurnWatchers.deleteAndDispose(sessionResource);
          this._mcpAuthWatchers.deleteAndDispose(sessionResource);
          this._releaseSessionInputNeeded(sessionResource);
          this._pendingHistoryTurns.delete(sessionResource);
          this._surfacedMcpAuthServers.delete(sessionResource);
          const chatURI2 = this._chatURIsBySessionResource.get(sessionResource);
          this._chatURIsBySessionResource.delete(sessionResource);
          if (chatURI2) {
            this._releaseChatSessionSubscriptions(resolvedSession.toString(), chatURI2);
          }
        },
        () => {
          const sessionKey = resolvedSession.toString();
          const chatURI2 = this._chatURIsBySessionResource.get(sessionResource);
          if (!chatURI2) {
            return true;
          }
          const turnId = this._getSessionState(sessionKey, chatURI2)?.activeTurn?.id;
          if (!turnId) {
            return true;
          }
          this._logService.info(`[AgentHost] Cancellation requested for ${sessionKey}, dispatching turnCancelled`);
          this._config.connection.dispatch(chatURI2, {
            type: ActionType.ChatTurnCancelled,
            turnId,
            duration: this._turnDuration(chatURI2, turnId)
          });
          return true;
        }
      );
    } catch (err) {
      historySubagentObservations.dispose();
      this._disposeActiveClientEntry(sessionResource);
      throw err;
    }
    this._activeSessions.set(sessionResource, session);
    this._configureActiveClientReconciliation(sessionResource, resolvedSession, sessionSubscription);
    if (!isNewSession) {
      if (chatURI !== void 0) {
        this._ensurePendingMessageSubscription(sessionResource, resolvedSession);
        this._ensureDraftSyncSubscription(sessionResource, resolvedSession, chatURI);
      }
      if (this._pendingHistoryTurns.has(sessionResource)) {
        if (this._chatService.getSession(sessionResource)) {
          this._ensureSnapshotController(sessionResource);
        } else {
          const sub = this._chatService.onDidCreateModel((model) => {
            if (isEqual(model.sessionResource, sessionResource)) {
              sub.dispose();
              this._ensureSnapshotController(sessionResource);
            }
          });
          session.registerDisposable(sub);
        }
      }
      if (activeTurnId && initialProgress !== void 0) {
        this._reconnectToActiveTurn(resolvedSession, activeTurnId, session, initialProgress, initialResponsePartCount);
      }
      if (chatURI !== void 0) {
        this._watchForServerInitiatedTurns(resolvedSession, sessionResource);
      }
    }
    return session;
  }
  // ---- Agent registration -------------------------------------------------
  _registerAgent() {
    const agentData = {
      id: this._config.agentId,
      name: this._config.agentId,
      fullName: this._config.fullName,
      description: this._config.description,
      extensionId: new ExtensionIdentifier(this._config.extensionId ?? "vscode.agent-host"),
      extensionVersion: void 0,
      extensionPublisherId: "vscode",
      extensionDisplayName: this._config.extensionDisplayName ?? "Agent Host",
      isDefault: false,
      isDynamic: true,
      isCore: true,
      metadata: { themeIcon: getAgentSessionProviderIcon(this._config.sessionType) },
      slashCommands: [],
      locations: [ChatAgentLocation.Chat],
      modes: [ChatModeKind.Agent],
      disambiguation: []
    };
    const agentImpl = {
      invoke: async (request, progress, _history, cancellationToken) => {
        return this._invokeAgent(request, progress, cancellationToken);
      }
    };
    this._register(this._chatAgentService.registerDynamicAgent(agentData, agentImpl));
  }
  async _invokeAgent(request, progress, cancellationToken) {
    this._logService.info(`[AgentHost] _invokeAgent called for resource: ${request.sessionResource.toString()}`);
    if (!await this._ensureWorkspaceTrust(request.sessionResource)) {
      return {};
    }
    const preparingStatus = new MutableDisposable();
    let failureStage = "resolveSession";
    try {
      failureStage = "provisionalSession";
      await raceCancellation(this._provisionalService.waitForPending(request.sessionResource), cancellationToken);
      if (cancellationToken.isCancellationRequested) {
        return {};
      }
      const resolvedSession = this._resolveSessionUri(request.sessionResource);
      const sessionKey = resolvedSession.toString();
      const provisionalBackend = this._provisionalService.get(request.sessionResource);
      if (provisionalBackend) {
        this._ensureSessionSubscription(sessionKey);
      }
      failureStage = "sessionState";
      const existingState = await this._readEagerlyCreatedSessionState(resolvedSession, cancellationToken);
      if (cancellationToken.isCancellationRequested) {
        return {};
      }
      if (!existingState) {
        const imported = this._importConversationStore.take(request.sessionResource);
        if (imported) {
          preparingStatus.value = disposableTimeout(() => {
            progress([{ kind: "progressMessage", content: new MarkdownString(localize("agentHost.preparingSession", "Preparing session\u2026")), shimmer: true }]);
          }, 500);
        }
        const model = imported?.model ?? this._createModelSelection(request.userSelectedModelId, request.modelConfiguration);
        const initialConfig = {
          ...this._provisionalService.getInitialSessionConfig(),
          ...request.agentHostSessionConfig
        };
        await this._createAndSubscribe(
          request.sessionResource,
          model,
          void 0,
          Object.keys(initialConfig).length > 0 ? initialConfig : void 0,
          imported ? { turns: imported.turns, model: imported.model } : void 0,
          (stage) => failureStage = stage
        );
      } else {
        failureStage = "authentication";
        await this._ensureRequiredAuthentication(this._createModelSelection(request.userSelectedModelId, request.modelConfiguration));
        failureStage = "subscribeSession";
        const sessionSub = this._ensureSessionSubscription(sessionKey);
        const chatURI = this._resolveChatUriFromState(request.sessionResource, existingState);
        this._setChatURI(request.sessionResource, chatURI);
        const chatSub = this._ensureChatSubscription(sessionKey, chatURI);
        this._activeSessions.get(request.sessionResource)?.setStateSubscriptions(sessionSub, chatSub);
        this._ensurePendingMessageSubscription(request.sessionResource, resolvedSession);
        this._watchForServerInitiatedTurns(resolvedSession, request.sessionResource);
        if (request.agentHostSessionConfig && Object.keys(request.agentHostSessionConfig).length > 0) {
          this._dispatchAction(resolvedSession, {
            type: ActionType.SessionConfigChanged,
            config: request.agentHostSessionConfig
          });
        }
      }
      const stopWatch = StopWatch.create(false);
      let firstProgress;
      const measuredProgress = (parts) => {
        preparingStatus.clear();
        if (firstProgress === void 0 && parts.some(isFirstVisibleProgressPart)) {
          firstProgress = stopWatch.elapsed();
        }
        progress(parts);
      };
      failureStage = "prepareTurn";
      const completedTurn = await this._handleTurn(resolvedSession, request, measuredProgress, cancellationToken, (stage) => failureStage = stage);
      const details = this._getTurnResponseDetails(request.sessionResource, resolvedSession, completedTurn);
      const errorDetails = this._getTurnErrorDetails(completedTurn);
      return {
        timings: { firstProgress, totalElapsed: stopWatch.elapsed() },
        ...details ? { details } : {},
        ...errorDetails ? { errorDetails } : {}
      };
    } catch (error) {
      if (!isCancellationError(error)) {
        this._reportInvocationFailure(request, failureStage, error);
      }
      throw error;
    } finally {
      preparingStatus.dispose();
    }
  }
  _reportInvocationFailure(request, failureStage, error) {
    const packed = packErrorForTelemetry(error);
    const requests = this._chatService.getSession(request.sessionResource)?.getRequests();
    this._telemetryService.publicLogError2("agentHost.invocationFailed", {
      requestId: request.requestId,
      provider: this._config.provider,
      failureStage,
      isFirstRequest: requests?.[0]?.id === request.requestId,
      hasUserSelectedModel: request.userSelectedModelId !== void 0,
      errorName: error instanceof Error ? error.name : typeof error,
      errorCode: getErrorCode(error),
      msg: packed.msg,
      callstack: packed.callstack
    });
  }
  /**
   * Builds the {@link IChatResponseErrorDetails} for a failed turn so the
   * chat response renders a proper error (and, for quota errors, the upgrade
   * affordance via `ChatQuotaExceededPart`). Returns `undefined` for
   * non-error turns. Falls back to the raw error when no structured chat
   * error was forwarded in `_meta`.
   */
  _getTurnErrorDetails(turn) {
    if (turn?.state !== TurnState.Error || !turn.error) {
      return void 0;
    }
    return getChatErrorDetailsFromMeta(turn.error, this._chatErrorContext()) ?? { message: localize("agentHost.turnError", "Error: ({0}) {1}", turn.error.errorType, turn.error.message) };
  }
  /**
   * Returns the {@link SessionState} for a session that was eagerly created
   * at folder-pick time, or `undefined` if no such session exists. Uses the
   * unmanaged subscription accessor so we don't accidentally open a fresh
   * subscription (which would issue a duplicate snapshot fetch on the wire,
   * and in tests would synthesise placeholder state via the mock's auto-
   * hydration path).
   *
   * If the eager subscription exists but hasn't received its first snapshot
   * yet (creation in flight), waits for it to hydrate or error before
   * returning. This closes a race where the chat request arrives between
   * `createSession` resolving and the snapshot landing.
   */
  async _readEagerlyCreatedSessionState(resolvedSession, token) {
    const inflight = this._config.connection.getInflightSessionCreate?.(resolvedSession);
    if (inflight) {
      try {
        await inflight;
      } catch {
      }
      if (token.isCancellationRequested) {
        return void 0;
      }
    }
    const sub = this._config.connection.getSubscriptionUnmanaged(StateComponents.Session, resolvedSession);
    if (!sub) {
      return void 0;
    }
    if (sub.value !== void 0) {
      return sub.value instanceof Error ? void 0 : sub.value;
    }
    const pinRef = this._config.connection.getSubscription(StateComponents.Session, resolvedSession, "AgentHostSessionHandler");
    try {
      await this._whenSubscriptionHydrated(pinRef.object, token);
      const value = pinRef.object.value;
      this._logService.info(`[AgentHost] _readEagerlyCreatedSessionState: hydrated value=${value === void 0 ? "undefined" : value instanceof Error ? `error(${value.message})` : "state"} cancelled=${token.isCancellationRequested} for ${resolvedSession.toString()}`);
      return value instanceof Error ? void 0 : value;
    } finally {
      pinRef.dispose();
    }
  }
  // ---- Pending message sync -----------------------------------------------
  /**
   * Diffs the chat model's pending requests against the protocol state in
   * `_clientState` and dispatches Set/Removed/Reordered actions as needed.
   */
  _syncPendingMessages(sessionResource, backendSession) {
    if (this._remotePendingMessageProjections.has(sessionResource)) {
      return;
    }
    const chatModel = this._chatService.getSession(sessionResource);
    if (!chatModel) {
      return;
    }
    const session = backendSession.toString();
    const chatURI = this._getChatURI(sessionResource);
    const pending = chatModel.getPendingRequests();
    const protocolState = this._getSessionState(session, chatURI);
    const prevSteering = protocolState?.steeringMessage;
    const prevQueued = protocolState?.queuedMessages ?? [];
    let currentSteering;
    const currentQueued = [];
    for (const p of pending) {
      const variables = p.request.variableData?.variables ?? [];
      const messageAttachments = this._variableEntriesToAttachments(variables, sessionResource, p.request.message.text);
      const attachments = messageAttachments.length > 0 ? messageAttachments : void 0;
      const snapshot = { id: p.request.id, message: userOriginMessage(p.request.message.text, attachments) };
      if (p.kind === ChatRequestQueueKind.Steering) {
        currentSteering = snapshot;
      } else {
        currentQueued.push(snapshot);
      }
    }
    if (currentSteering) {
      if (currentSteering.id !== prevSteering?.id || !equals(currentSteering.message, prevSteering.message)) {
        this._dispatchAction(backendSession, {
          type: ActionType.ChatPendingMessageSet,
          kind: PendingMessageKind.Steering,
          id: currentSteering.id,
          message: currentSteering.message
        }, chatURI);
      }
    } else if (prevSteering) {
      this._dispatchAction(backendSession, {
        type: ActionType.ChatPendingMessageRemoved,
        kind: PendingMessageKind.Steering,
        id: prevSteering.id
      }, chatURI);
    }
    const currentQueuedIds = new Set(currentQueued.map((q) => q.id));
    for (const prev of prevQueued) {
      if (!currentQueuedIds.has(prev.id)) {
        this._dispatchAction(backendSession, {
          type: ActionType.ChatPendingMessageRemoved,
          kind: PendingMessageKind.Queued,
          id: prev.id
        }, chatURI);
      }
    }
    const prevQueuedById = new Map(prevQueued.map((q) => [q.id, q]));
    for (const q of currentQueued) {
      const prev = prevQueuedById.get(q.id);
      if (!prev || !equals(q.message, prev.message)) {
        this._dispatchAction(backendSession, {
          type: ActionType.ChatPendingMessageSet,
          kind: PendingMessageKind.Queued,
          id: q.id,
          message: q.message
        }, chatURI);
      }
    }
    const updatedProtocol = this._getSessionState(session, chatURI);
    const updatedQueued = updatedProtocol?.queuedMessages ?? [];
    if (updatedQueued.length > 1 && currentQueued.length === updatedQueued.length) {
      const needsReorder = currentQueued.some((q, i) => q.id !== updatedQueued[i].id);
      if (needsReorder) {
        this._dispatchAction(backendSession, {
          type: ActionType.ChatQueuedMessagesReordered,
          order: currentQueued.map((q) => q.id)
        }, chatURI);
      }
    }
  }
  /**
   * Projects protocol pending messages into the chat model.
   * The protocol is authoritative, so matching local state is a no-op.
   */
  _applyRemotePendingMessages(sessionResource, backendSession) {
    if (!this._chatService.getSession(sessionResource)) {
      return;
    }
    const chatURI = this._chatURIsBySessionResource.get(sessionResource);
    if (!chatURI) {
      return;
    }
    const state = this._getSessionState(backendSession.toString(), chatURI);
    if (!state) {
      return;
    }
    const toRemote = (pending, kind) => ({
      id: pending.id,
      kind,
      message: pending.message.text,
      variableData: messageToVariableData(pending.message, this._config.connectionAuthority)
    });
    const remote = [];
    if (state.steeringMessage) {
      remote.push(toRemote(state.steeringMessage, ChatRequestQueueKind.Steering));
    }
    for (const queued of state.queuedMessages ?? []) {
      remote.push(toRemote(queued, ChatRequestQueueKind.Queued));
    }
    this._remotePendingMessageProjections.add(sessionResource);
    try {
      this._chatService.syncPendingRequestsFromRemote(sessionResource, remote);
    } finally {
      this._remotePendingMessageProjections.delete(sessionResource);
    }
  }
  _dispatchAction(channel, action, chatURI) {
    const target = isChatAction(action) ? this._requireChatURI(chatURI, action.type) : channel.toString();
    this._config.connection.dispatch(target, action);
  }
  _requireChatURI(chatURI, actionType) {
    if (!chatURI) {
      throw new Error(`Cannot dispatch ${actionType} without a resolved AHP chat channel`);
    }
    return chatURI;
  }
  _resolveChatUriFromState(sessionResource, state) {
    if (sessionResource.fragment) {
      const explicitChatUri = new URLSearchParams(sessionResource.query).get(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM);
      if (explicitChatUri) {
        const parsed = parseChatUri(explicitChatUri);
        if (!parsed || parsed.chatId !== sessionResource.fragment) {
          throw new Error(`Subagent chat URI does not match editor chat '${sessionResource.fragment}'`);
        }
        const owningSession = URI.parse(parsed.session);
        const expectedSession = this._resolveSessionUri(sessionResource);
        if (!isEqual(owningSession, expectedSession)) {
          throw new Error(`Subagent chat belongs to ${owningSession.toString()}, expected ${expectedSession.toString()}`);
        }
        return explicitChatUri;
      }
      const match = state.chats.find((summary) => parseChatUri(summary.resource)?.chatId === sessionResource.fragment);
      if (!match) {
        throw new Error(`Cannot resolve chat '${sessionResource.fragment}' from session state for ${sessionResource.toString()}`);
      }
      return match.resource.toString();
    }
    if (!state.defaultChat) {
      throw new Error(`Session ${sessionResource.toString()} has no default chat`);
    }
    return state.defaultChat.toString();
  }
  _setChatURI(sessionResource, chatURI) {
    this._chatURIsBySessionResource.set(sessionResource, chatURI);
  }
  _getChatURI(sessionResource) {
    const chatURI = this._chatURIsBySessionResource.get(sessionResource);
    if (!chatURI) {
      throw new Error(`No AHP chat URI mapped for ${sessionResource.toString()}`);
    }
    return chatURI;
  }
  _getCurrentActiveClient(sessionResource) {
    const entry = this._activeClientEntries.get(sessionResource);
    if (entry) {
      return entry.getActiveClient();
    }
    return {
      clientId: this._config.connection.clientId,
      tools: [],
      customizations: []
    };
  }
  _ensureActiveClient(sessionResource, backendSession) {
    const entry = this._ensureActiveClientEntry(sessionResource);
    if (!entry) {
      return void 0;
    }
    entry.claim(backendSession);
    return entry;
  }
  _ensureActiveClientEntry(sessionResource) {
    const existing = this._activeClientEntries.get(sessionResource);
    if (existing) {
      return existing;
    }
    const scope = this._activeClientService.acquireScope(this._config.sessionType, this._resolveCustomizationScopeRoots(sessionResource));
    if (!scope) {
      return void 0;
    }
    const entry = new ActiveClientEntry(
      scope,
      this._config.connection.clientId,
      AgentHostSessionHandler.ACTIVE_CLIENT_RECONCILIATION_DEBOUNCE_MS,
      (backendSession) => this._getSessionState(backendSession.toString()),
      (backendSession, action) => this._dispatchAction(backendSession, action)
    );
    this._activeClientEntries.set(sessionResource, entry);
    return entry;
  }
  _configureActiveClientReconciliation(sessionResource, backendSession, sessionSubscription) {
    const entry = this._ensureActiveClientEntry(sessionResource);
    if (!entry) {
      return;
    }
    entry.attach(backendSession, sessionSubscription);
  }
  _disposeActiveClientEntry(sessionResource) {
    const entry = this._activeClientEntries.get(sessionResource);
    if (entry) {
      this._activeClientEntries.delete(sessionResource);
      entry.dispose();
    }
  }
  // ---- Server-initiated turn detection ------------------------------------
  /**
   * Sets up a persistent listener on the session's protocol state that
   * detects server-initiated turns (e.g. auto-consumed queued messages).
   * When a new `activeTurn` appears whose `turnId` was NOT dispatched by
   * this client, it signals the {@link AgentHostChatSession} to create a
   * new request in the chat model, removes the consumed pending request
   * if applicable, and pipes turn progress through `progressObs`.
   */
  _watchForServerInitiatedTurns(backendSession, sessionResource) {
    const sessionStr = backendSession.toString();
    const chatURI = this._getChatURI(sessionResource);
    this._watchForMcpAuthentication(backendSession, sessionResource, chatURI);
    this._watchForSessionInputNeeded(backendSession, sessionResource);
    const currentState = this._getSessionState(sessionStr, chatURI);
    let lastSeenTurnId = currentState?.activeTurn?.id;
    let previousQueuedIds;
    let previousSteeringId = currentState?.steeringMessage?.id;
    let previousTitle = currentState?.title;
    const disposables = new DisposableStore();
    const turnProgressDisposable = new MutableDisposable();
    disposables.add(turnProgressDisposable);
    const sessionSub = this._ensureSessionSubscription(sessionStr);
    const chatSub = this._ensureChatSubscription(sessionStr, chatURI);
    const onChange = () => {
      const state = this._getSessionState(sessionStr, chatURI);
      if (!state) {
        return;
      }
      const e = { session: sessionStr, state };
      const currentQueuedIds = new Set((e.state.queuedMessages ?? []).map((m) => m.id));
      const currentSteeringId = e.state.steeringMessage?.id;
      if (previousSteeringId && previousSteeringId !== currentSteeringId) {
        this._chatService.removePendingRequest(sessionResource, previousSteeringId);
      }
      previousSteeringId = currentSteeringId;
      const currentTitle = e.state.title;
      if (currentTitle && currentTitle !== previousTitle) {
        this._chatService.setChatSessionTitle(sessionResource, currentTitle);
      }
      previousTitle = currentTitle;
      const activeTurn = e.state.activeTurn;
      if (!activeTurn || activeTurn.id === lastSeenTurnId) {
        previousQueuedIds = currentQueuedIds;
        return;
      }
      lastSeenTurnId = activeTurn.id;
      if (this._clientDispatchedTurnIds.has(activeTurn.id)) {
        previousQueuedIds = currentQueuedIds;
        return;
      }
      const chatSession = this._activeSessions.get(sessionResource);
      if (!chatSession) {
        previousQueuedIds = currentQueuedIds;
        return;
      }
      this._logService.info(`[AgentHost] Server-initiated turn detected: ${activeTurn.id}`);
      if (previousQueuedIds) {
        for (const prevId of previousQueuedIds) {
          if (!currentQueuedIds.has(prevId)) {
            this._chatService.removePendingRequest(sessionResource, prevId);
          }
        }
      }
      previousQueuedIds = currentQueuedIds;
      chatSession.startServerRequest(
        activeTurn.id,
        activeTurn.message.text,
        messageToVariableData(activeTurn.message, this._config.connectionAuthority),
        {
          isSystemInitiated: activeTurn.message.origin.kind === MessageKind.SystemNotification,
          isHidden: isMessageHiddenFromTranscript(activeTurn.message),
          timestamp: parseTimestamp(activeTurn.startedAt),
          isTerminalRequest: isTerminalCommandPrompt(activeTurn.message.text, this._config.connection.initializeResult.get()?.terminalCommandPrefix),
          origin: messageToRequestOrigin(backendSession, activeTurn.message, this._config.agentId)
        }
      );
      const turnStore = new DisposableStore();
      turnProgressDisposable.value = turnStore;
      this._trackServerTurnProgress(backendSession, activeTurn.id, chatSession, turnStore);
    };
    disposables.add(sessionSub.onDidChange(onChange));
    disposables.add(chatSub.onDidChange(onChange));
    this._serverTurnWatchers.set(sessionResource, disposables);
  }
  _watchForMcpAuthentication(backendSession, sessionResource, chatURI) {
    const sessionSub = this._ensureSessionSubscription(backendSession.toString());
    let previousServers;
    const reconcile = () => {
      const servers = getMcpAuthenticationRequiredServers(sessionResource, this._getSessionState(backendSession.toString(), chatURI));
      if (equals(previousServers, servers)) {
        return;
      }
      previousServers = servers;
      void this._filterAutoGrantedMcpAuthentication(sessionResource, servers);
    };
    const disposables = new DisposableStore();
    disposables.add(sessionSub.onDidChange(reconcile));
    reconcile();
    this._mcpAuthWatchers.set(sessionResource, disposables);
  }
  _watchForSessionInputNeeded(backendSession, sessionResource) {
    this._inputNeededWatcherBackends.set(sessionResource, backendSession);
    const sessionKey = backendSession.toString();
    const existing = this._inputNeededWatchers.get(sessionKey);
    if (existing) {
      existing.refs.add(sessionResource.toString());
      return;
    }
    const sessionSub = this._ensureSessionSubscription(sessionKey);
    const state = observableFromSubscription(this, sessionSub);
    const store = new DisposableStore();
    this._inputNeededWatchers.set(sessionKey, { store, refs: /* @__PURE__ */ new Set([sessionResource.toString()]) });
    const requests = derivedOpts(
      { equalsFn: equals },
      (reader) => (state.read(reader)?.inputNeeded ?? []).map((request) => {
        if (request.kind === SessionInputRequestKind.ToolConfirmation && request.toolCall.status === ToolCallStatus.PendingConfirmation && request.toolCall.contributor?.kind === ToolCallContributorKind.Client) {
          return {
            ...request,
            kind: SessionInputRequestKind.ToolClientExecution,
            clientId: request.toolCall.contributor.clientId
          };
        }
        return request;
      })
    );
    const startedClientToolCalls = /* @__PURE__ */ new Set();
    const clientToolExecutions = /* @__PURE__ */ new Map();
    const releaseClientToolExecution = (key, execution) => {
      if (clientToolExecutions.get(key) !== execution) {
        return;
      }
      clientToolExecutions.delete(key);
      execution.retain.dispose();
      if (execution.activeAttempts === 0) {
        execution.source.dispose();
      }
    };
    store.add(toDisposable(() => {
      for (const execution of clientToolExecutions.values()) {
        execution.source.dispose(true);
        execution.retain.dispose();
      }
      clientToolExecutions.clear();
    }));
    store.add(autorunPerKeyedItem(requests, (request) => request.id, (_requestId, request$, itemStore) => {
      const initial = request$.get();
      const chatURI = initial.chat.toString();
      if (initial.kind === SessionInputRequestKind.ChatInput) {
        const inputKey = this._inputRequestKey(chatURI, initial.request.id);
        let cancelled = false;
        itemStore.add(disposableTimeout(() => {
          if (cancelled || this._renderedRequests.get().has(inputKey)) {
            return;
          }
          cancelled = true;
          this._logService.warn(`[AgentHost] Cancelling chat input request ${initial.request.id}: no session claimed it within ${UNOBSERVED_CLIENT_TOOL_GRACE_MS}ms`);
          this._dispatchAction(backendSession, {
            type: ActionType.ChatInputCompleted,
            requestId: initial.request.id,
            response: ChatInputResponseKind.Cancel
          }, chatURI);
        }, UNOBSERVED_CLIENT_TOOL_GRACE_MS));
        return;
      }
      const key = this._toolCallKey(chatURI, initial.turnId, initial.toolCall.toolCallId);
      const requestLifecycle = itemStore.add(new MutableDisposable());
      itemStore.add(this._retainToolCall(key));
      if (initial.kind === SessionInputRequestKind.ToolClientExecution) {
        if (initial.clientId !== this._config.connection.clientId) {
          return;
        }
        let execution = clientToolExecutions.get(key);
        if (!execution) {
          execution = { source: new CancellationTokenSource(), retain: this._retainToolCall(key), activeAttempts: 0 };
          clientToolExecutions.set(key, execution);
        }
        const targetsConfirmation = initial.toolCall.status === ToolCallStatus.PendingConfirmation;
        requestLifecycle.value = toDisposable(() => {
          const state2 = this._clientToolInvocations.get(key)?.state.get();
          const targetsState = state2?.type === IChatToolInvocation.StateKind.Streaming || state2?.type === (targetsConfirmation ? IChatToolInvocation.StateKind.WaitingForConfirmation : IChatToolInvocation.StateKind.Executing) || execution.activeAttempts > 0 && (state2?.type === IChatToolInvocation.StateKind.Cancelled || state2?.type === IChatToolInvocation.StateKind.Completed);
          if (targetsState) {
            execution.source.cancel();
          }
          if (!targetsConfirmation || state2?.type !== IChatToolInvocation.StateKind.Executing) {
            releaseClientToolExecution(key, execution);
          }
        });
        let generation = 0;
        let observedRequest;
        let startedRequest;
        let invocationStarted = false;
        const unobservedTimer = itemStore.add(new MutableDisposable());
        itemStore.add(autorun((reader) => {
          const request = request$.read(reader);
          const claimant = this._renderedRequests.read(reader).get(key);
          if (request.kind !== SessionInputRequestKind.ToolClientExecution || request.clientId !== this._config.connection.clientId) {
            generation++;
            observedRequest = void 0;
            startedRequest = void 0;
            invocationStarted = false;
            unobservedTimer.clear();
            return;
          }
          if (startedClientToolCalls.has(key)) {
            startedRequest = request;
            unobservedTimer.clear();
            return;
          }
          if (!equals(observedRequest, request)) {
            observedRequest = request;
            if (invocationStarted) {
              return;
            }
            generation++;
            startedRequest = void 0;
            unobservedTimer.clear();
          }
          if (startedRequest) {
            return;
          }
          if (request.toolCall.toolName === RUNTIME_TOOL_SEARCH_TOOL_NAME && readToolCallMeta(request.toolCall).toolSearchCandidates === void 0) {
            return;
          }
          const execute = (contextSessionResource) => {
            startedRequest = request;
            unobservedTimer.clear();
            const requestGeneration = generation;
            execution.activeAttempts++;
            void this._executeClientTool(
              request,
              contextSessionResource,
              execution.source.token,
              () => requestGeneration === generation && (invocationStarted || equals(request$.read(void 0), request)),
              () => {
                if (requestGeneration === generation) {
                  invocationStarted = true;
                  startedClientToolCalls.add(key);
                }
              }
            ).finally(() => {
              execution.activeAttempts--;
              const invocation = this._clientToolInvocations.get(key);
              if (execution.activeAttempts === 0 && invocation && IChatToolInvocation.isComplete(invocation)) {
                releaseClientToolExecution(key, execution);
              } else if (execution.activeAttempts === 0 && clientToolExecutions.get(key) !== execution) {
                execution.source.dispose();
              }
            });
          };
          if (claimant) {
            execute(claimant);
          } else if (!this._clientToolRequiresConfirmation(request.toolCall)) {
            execute(void 0);
          } else if (!unobservedTimer.value) {
            const requestGeneration = generation;
            unobservedTimer.value = disposableTimeout(() => {
              if (requestGeneration === generation && !startedRequest) {
                startedRequest = request;
                startedClientToolCalls.add(key);
                this._denyClientTool(request);
              }
            }, UNOBSERVED_CLIENT_TOOL_GRACE_MS);
          }
        }));
      } else if (initial.kind === SessionInputRequestKind.ToolAuthentication) {
        itemStore.add(disposableTimeout(() => {
          if (!this._renderedRequests.get().has(key)) {
            this._logService.warn(`[AgentHost] Cancelling MCP authentication for ${initial.toolCall.toolName} (callId=${initial.toolCall.toolCallId}): no session claimed it within ${UNOBSERVED_CLIENT_TOOL_GRACE_MS}ms`);
            this._resolveToolCall(chatURI, initial.turnId, initial.toolCall.toolCallId, {
              type: ActionType.ChatToolCallComplete,
              turnId: initial.turnId,
              toolCallId: initial.toolCall.toolCallId,
              result: {
                success: false,
                pastTenseMessage: localize("agentHost.mcpToolAuthentication.cancelled", "Cancelled tool call"),
                error: { message: localize("agentHost.mcpToolAuthentication.cancelledError", "MCP authentication was cancelled"), code: "cancelled" }
              }
            });
          }
        }, UNOBSERVED_CLIENT_TOOL_GRACE_MS));
      } else {
        itemStore.add(disposableTimeout(() => {
          if (!this._renderedRequests.get().has(key)) {
            this._logService.warn(`[AgentHost] Denying confirmation for ${initial.toolCall.toolName} (callId=${initial.toolCall.toolCallId}): no session claimed it within ${UNOBSERVED_CLIENT_TOOL_GRACE_MS}ms`);
            this._resolveToolCall(chatURI, initial.turnId, initial.toolCall.toolCallId, {
              type: ActionType.ChatToolCallConfirmed,
              turnId: initial.turnId,
              toolCallId: initial.toolCall.toolCallId,
              approved: false,
              reason: ToolCallCancellationReason.Denied
            });
          }
        }, UNOBSERVED_CLIENT_TOOL_GRACE_MS));
      }
    }));
  }
  /**
   * Releases this resource's reference to the shared per-backend-session
   * {@link _watchForSessionInputNeeded} watcher, disposing it only once the
   * last sibling resource has let go.
   */
  _releaseSessionInputNeeded(sessionResource) {
    const backendSession = this._inputNeededWatcherBackends.get(sessionResource);
    this._inputNeededWatcherBackends.delete(sessionResource);
    if (!backendSession) {
      return;
    }
    const sessionKey = backendSession.toString();
    const entry = this._inputNeededWatchers.get(sessionKey);
    if (!entry) {
      return;
    }
    entry.refs.delete(sessionResource.toString());
    if (entry.refs.size === 0) {
      this._inputNeededWatchers.delete(sessionKey);
      entry.store.dispose();
    }
  }
  /**
   * Holds the shared state for a tool call while an `inputNeeded` request
   * references it. Once the host stops asking — the request disappears, or the
   * watcher is disposed — the outcome is settled, so the dispatch-funnel entry
   * and the shared invocation are dropped and a later call with the same ids
   * is never mistaken for this one.
   */
  _retainToolCall(key) {
    this._clientToolRetainCounts.set(key, (this._clientToolRetainCounts.get(key) ?? 0) + 1);
    return toDisposable(() => {
      const remaining = (this._clientToolRetainCounts.get(key) ?? 1) - 1;
      if (remaining > 0) {
        this._clientToolRetainCounts.set(key, remaining);
        return;
      }
      this._clientToolRetainCounts.delete(key);
      this._forgetResolvedToolCall(key);
      this._clientToolInvocations.delete(key);
    });
  }
  /**
   * Returns the shared {@link ChatToolInvocation} for a client tool call,
   * creating it on first use via {@link ILanguageModelToolsService.beginToolCall}.
   * `sessionResource` is deliberately omitted so `beginToolCall` does not
   * append progress into a chat model (which throws once the owning request
   * is complete); it still registers the invocation, so a later `invokeTool`
   * with a matching `chatStreamToolCallId` attaches to this same object. The
   * observer that renders the call and the watcher that executes it therefore
   * act on one invocation.
   */
  _ensureClientToolInvocation(chatURI, turnId, toolCallId, toolId, subagentInvocationId) {
    const key = this._toolCallKey(chatURI, turnId, toolCallId);
    const existing = this._clientToolInvocations.get(key);
    if (existing) {
      return existing;
    }
    const invocation = this._toolsService.beginToolCall({
      toolCallId,
      toolId,
      subagentInvocationId,
      sessionResource: void 0,
      force: true
    });
    if (invocation) {
      this._clientToolInvocations.set(key, invocation);
    }
    return invocation;
  }
  /**
   * Whether an unclaimed client tool must wait for a rendering observer
   * before running. There is no protocol field for this, so we use the tool's
   * static {@link IToolData.canRequestPreApproval} signal: a tool that might
   * ask for pre-approval could pop a confirmation, which only makes sense
   * inside a live chat request. Limitation: this is a "might" signal — a tool
   * may set it yet auto-approve at runtime — so an unclaimed such tool is
   * conservatively made to wait (and denied on timeout) rather than risk a
   * headless modal nobody can answer. Only consulted for the unclaimed case;
   * a claimed call always runs with context regardless.
   */
  _clientToolRequiresConfirmation(toolCall) {
    const clientToolName = toolCall.toolName === RUNTIME_TOOL_SEARCH_TOOL_NAME ? CLIENT_TOOL_SEARCH_REFERENCE_NAME : toolCall.toolName;
    return this._toolsService.getToolByName(clientToolName)?.canRequestPreApproval === true;
  }
  /**
   * The one place a client tool is actually invoked. Ensures the shared
   * invocation exists, parses the protocol input (preserving the tool-search
   * candidate handling), invokes the tool, and dispatches the protocol
   * completion. `contextSessionResource` is set when a turn observer is
   * rendering the call: a live chat request then exists, so confirmation
   * renders in the tool part, any pre-approval is honored, and side effects
   * attribute to that observer's chat. Without it the tool runs headlessly,
   * independent of whether the owning turn is live.
   */
  async _executeClientTool(request, contextSessionResource, token, isCurrent, markInvocationStarted) {
    const chatURI = request.chat.toString();
    const toolCall = request.toolCall;
    const toolName = toolCall.toolName;
    const isToolSearch = toolName === RUNTIME_TOOL_SEARCH_TOOL_NAME;
    const clientToolName = isToolSearch ? CLIENT_TOOL_SEARCH_REFERENCE_NAME : toolName;
    const toolData = this._toolsService.getToolByName(clientToolName);
    const completionMeta = isToolSearch ? { _meta: metaWithoutToolSearchCandidates(toolCall) } : {};
    const invocation = toolData ? this._ensureClientToolInvocation(chatURI, request.turnId, toolCall.toolCallId, toolData.id, void 0) : void 0;
    const fail = (message, code) => {
      const pastTenseMessage = localize("agentHost.clientTool.pastTense", "Couldn't run {0}", toolCall.displayName);
      const result2 = {
        content: [],
        toolResultError: message,
        toolResultMessage: pastTenseMessage
      };
      void invocation?.didExecuteTool(result2);
      this._resolveToolCall(chatURI, request.turnId, toolCall.toolCallId, {
        type: ActionType.ChatToolCallComplete,
        turnId: request.turnId,
        toolCallId: toolCall.toolCallId,
        result: {
          success: false,
          pastTenseMessage,
          error: { message, code }
        },
        ...completionMeta
      });
    };
    if (!toolData) {
      fail(localize("agentHost.clientTool.unknown", 'Tool "{0}" is not available on this client.', toolName), "toolUnavailable");
      return;
    }
    if (!invocation) {
      fail(localize("agentHost.clientTool.beginFailed", 'Could not create invocation for client tool "{0}".', toolName), "invocationFailed");
      return;
    }
    const toolInput = "toolInput" in toolCall ? toolCall.toolInput : void 0;
    let rawInput;
    try {
      rawInput = await resolveToolInput(this._config.connection, toolInput);
    } catch (error2) {
      if (!isCurrent() || token.isCancellationRequested || invocation.state.get().type === IChatToolInvocation.StateKind.Cancelled) {
        return;
      }
      const message = error2 instanceof Error ? error2.message : String(error2);
      this._logService.warn(`[AgentHost] Failed to read client tool input: ${toolName}`, error2);
      fail(message, "inputReadFailed");
      return;
    }
    if (!isCurrent() || token.isCancellationRequested || invocation.state.get().type === IChatToolInvocation.StateKind.Cancelled) {
      return;
    }
    let parameters;
    try {
      const parsed = JSON.parse(rawInput);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("expected JSON object");
      }
      parameters = parsed;
    } catch {
      fail(localize("agentHost.clientTool.badInput", 'Invalid tool input for "{0}": expected JSON object parameters.', toolName), "invalidInput");
      return;
    }
    const toolSearchCandidates = isToolSearch ? readToolCallMeta(toolCall).toolSearchCandidates : void 0;
    if (toolSearchCandidates !== void 0) {
      parameters = { ...parameters, candidateTools: toolSearchCandidates };
    }
    this._logService.info(`[AgentHost] Running client tool: ${toolName} (callId=${toolCall.toolCallId}, withContext=${contextSessionResource !== void 0})`);
    let result;
    let error;
    try {
      markInvocationStarted();
      result = await this._toolsService.invokeTool({
        callId: toolCall.toolCallId,
        toolId: toolData.id,
        parameters,
        context: contextSessionResource ? { sessionResource: contextSessionResource } : void 0,
        chatStreamToolCallId: toolCall.toolCallId,
        preApproved: toolCall.status === ToolCallStatus.PendingConfirmation ? void 0 : getClientToolPreApproval(toolCall)
      }, async () => 0, token);
    } catch (err) {
      error = err;
    }
    if (!isCurrent() || token.isCancellationRequested || invocation.state.get().type === IChatToolInvocation.StateKind.Cancelled) {
      return;
    }
    if (error !== void 0) {
      if (!isCancellationError(error)) {
        this._logService.warn(`[AgentHost] Client tool failed: ${toolName}`, error);
      }
      result = { content: [], toolResultError: error instanceof Error ? error.message : String(error) };
    }
    this._resolveToolCall(chatURI, request.turnId, toolCall.toolCallId, {
      type: ActionType.ChatToolCallComplete,
      turnId: request.turnId,
      toolCallId: toolCall.toolCallId,
      result: toolResultToProtocol(result ?? { content: [] }, toolName),
      ...completionMeta
    });
  }
  /**
   * Denies a client tool call that needs confirmation but that no sub/agent
   * observer claimed within the grace window: there is no live surface to
   * answer it, so report a failed completion rather than pop a headless
   * modal.
   */
  _denyClientTool(request) {
    const toolCall = request.toolCall;
    this._logService.warn(`[AgentHost] Denying client tool ${toolCall.toolName} (callId=${toolCall.toolCallId}): it can request confirmation but no session claimed it within ${UNOBSERVED_CLIENT_TOOL_GRACE_MS}ms`);
    this._resolveToolCall(request.chat.toString(), request.turnId, toolCall.toolCallId, {
      type: ActionType.ChatToolCallComplete,
      turnId: request.turnId,
      toolCallId: toolCall.toolCallId,
      result: {
        success: false,
        pastTenseMessage: localize("agentHost.clientTool.unclaimed", "Couldn't run {0}", toolCall.displayName),
        error: {
          message: localize("agentHost.clientTool.unclaimedError", "{0} needs confirmation but no session was available to answer it.", toolCall.displayName),
          code: "clientUnavailable"
        }
      }
    });
    this._clientToolInvocations.delete(this._toolCallKey(request.chat.toString(), request.turnId, toolCall.toolCallId));
  }
  /**
   * Tracks protocol state changes for a specific server-initiated turn and
   * pushes `IChatProgress[]` items into the session's `progressObs`.
   * When the turn finishes, sets `isCompleteObs` to true.
   */
  _trackServerTurnProgress(backendSession, turnId, chatSession, turnDisposables) {
    const cts = new CancellationTokenSource();
    turnDisposables.add(toDisposable(() => cts.dispose(true)));
    turnDisposables.add(this._observeTurn({
      backendSession,
      sessionResource: chatSession.sessionResource,
      chatURI: this._getChatURI(chatSession.sessionResource),
      turnId,
      sink: (parts) => chatSession.appendProgress(parts),
      cancellationToken: cts.token,
      onTurnEnded: () => chatSession.isCompleteObs.set(true, void 0)
    }));
  }
  _turnStopWatchKey(chatURI, turnId) {
    return `${chatURI}\0${turnId}`;
  }
  _ensureTurnStopWatch(chatURI, turnId) {
    const key = this._turnStopWatchKey(chatURI, turnId);
    let stopWatch = this._turnStopWatches.get(key);
    if (!stopWatch) {
      stopWatch = StopWatch.create(false);
      this._turnStopWatches.set(key, stopWatch);
    }
    return stopWatch;
  }
  _turnDuration(chatURI, turnId) {
    const elapsed = this._turnStopWatches.get(this._turnStopWatchKey(chatURI, turnId))?.elapsed();
    return typeof elapsed === "number" && Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  }
  _clearTurnStopWatch(chatURI, turnId) {
    this._turnStopWatches.delete(this._turnStopWatchKey(chatURI, turnId));
  }
  // ---- Turn handling (state-driven) ---------------------------------------
  async _handleTurn(session, request, progress, cancellationToken, onFailureStage) {
    if (cancellationToken.isCancellationRequested) {
      return;
    }
    onFailureStage("prepareTurn");
    await this._workingDirectorySynchronizer.reconcile(session, cancellationToken);
    if (cancellationToken.isCancellationRequested) {
      return;
    }
    const turnId = request.requestId;
    this._clientDispatchedTurnIds.add(turnId);
    const chatURI = this._getChatURI(request.sessionResource);
    const turnChannel = chatURI;
    const messageAttachments = await this._convertVariablesToAttachments(request);
    if (cancellationToken.isCancellationRequested) {
      return;
    }
    this._ensureActiveClient(request.sessionResource, session);
    const selectedModel = this._createModelSelection(request.userSelectedModelId, request.modelConfiguration);
    const requestedAgentUri = request.modeInstructions?.uri?.toString();
    const chatModel = this._chatService.getSession(request.sessionResource);
    const protocolState = this._getSessionState(session.toString(), chatURI);
    if (chatModel && protocolState?.turns.length) {
      const previousRequestIndex = chatModel.getRequests().findIndex((i) => i.id === request.requestId) - 1;
      const previousRequest = previousRequestIndex >= 0 ? chatModel.getRequests()[previousRequestIndex] : void 0;
      if (!previousRequest && protocolState.turns.length > 0) {
        const truncateAction = {
          type: ActionType.ChatTruncated
        };
        this._config.connection.dispatch(turnChannel, truncateAction);
      } else {
        const seenAtIndex = protocolState.turns.findIndex((t) => t.id === previousRequest.id);
        if (seenAtIndex !== -1 && seenAtIndex < protocolState.turns.length - 1) {
          const truncateAction = {
            type: ActionType.ChatTruncated,
            turnId: previousRequest.id
          };
          this._config.connection.dispatch(turnChannel, truncateAction);
        }
      }
    }
    const turnAction = {
      type: ActionType.ChatTurnStarted,
      turnId,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      message: withMessageHiddenFromTranscript({
        ...userOriginMessage(request.message, messageAttachments),
        ...selectedModel ? { model: selectedModel } : {},
        ...requestedAgentUri ? { agent: { uri: requestedAgentUri } } : {}
      }, request.hideFromTranscript)
    };
    this._ensureTurnStopWatch(turnChannel, turnId);
    onFailureStage("dispatchTurn");
    this._config.connection.dispatch(turnChannel, turnAction);
    this._ensureSnapshotController(request.sessionResource)?.ensureRequestCheckpoint(request.requestId);
    onFailureStage("observeTurn");
    return new Promise((resolve) => {
      const store = new DisposableStore();
      const cancelSub = store.add(cancellationToken.onCancellationRequested(() => {
        cancelSub.dispose();
        this._logService.info(`[AgentHost] Cancellation requested for ${session.toString()}, dispatching turnCancelled`);
        this._config.connection.dispatch(turnChannel, {
          type: ActionType.ChatTurnCancelled,
          turnId,
          duration: this._turnDuration(turnChannel, turnId)
        });
      }));
      store.add(this._observeTurn({
        backendSession: session,
        sessionResource: request.sessionResource,
        chatURI,
        turnId,
        sink: progress,
        cancellationToken,
        suppressErrorMarkdown: true,
        onTurnEnded: (lastTurn) => {
          store.dispose();
          this._clientDispatchedTurnIds.delete(turnId);
          this._activeSessions.get(request.sessionResource)?.isCompleteObs.set(true, void 0);
          resolve(lastTurn);
        },
        onFileEdits: (tc) => {
          const editParts = this._hydrateFileEdits(request.sessionResource, request.requestId, tc);
          if (editParts.length > 0) {
            progress(editParts);
          }
        }
      }));
    });
  }
  // ---- Tool confirmation --------------------------------------------------
  /**
   * Awaits user confirmation on a PendingConfirmation tool call invocation
   * and dispatches `ChatToolCallConfirmed` back to the server.
   */
  _awaitToolConfirmation(invocation, toolCallId, session, turnId, cancellationToken, getProtocolOptions, chatURI) {
    IChatToolInvocation.awaitConfirmation(invocation, cancellationToken).then((reason) => {
      let selectedOption;
      const protocolOptions = getProtocolOptions();
      if (reason.type === ToolConfirmKind.UserAction && reason.selectedButton && protocolOptions) {
        selectedOption = protocolOptions.find((o) => o.id === reason.selectedButton);
      }
      const approved = selectedOption ? selectedOption.kind === ConfirmationOptionKind.Approve : reason.type !== ToolConfirmKind.Denied && reason.type !== ToolConfirmKind.Skipped;
      this._logService.info(`[AgentHost] Tool confirmation: toolCallId=${toolCallId}, approved=${approved}, selectedOptionId=${selectedOption?.id}`);
      const target = this._requireChatURI(chatURI, ActionType.ChatToolCallConfirmed);
      this._resolveToolCall(target, turnId, toolCallId, approved ? {
        type: ActionType.ChatToolCallConfirmed,
        turnId,
        toolCallId,
        approved: true,
        confirmed: ToolCallConfirmationReason.UserAction,
        ...selectedOption ? { selectedOptionId: selectedOption.id } : {}
      } : {
        type: ActionType.ChatToolCallConfirmed,
        turnId,
        toolCallId,
        approved: false,
        reason: ToolCallCancellationReason.Denied,
        ...selectedOption ? { selectedOptionId: selectedOption.id } : {}
      });
    }).catch((err) => {
      this._logService.warn(`[AgentHost] Tool confirmation failed for toolCallId=${toolCallId}`, err);
    });
  }
  // ---- Per-turn observable graph ------------------------------------------
  /**
   * Installs the always-on observable graph that translates session state
   * into `IChatProgress[]` for a specific turn. The same graph is used for:
   *   - live turns started by the user via {@link _handleTurn},
   *   - reconnect to an in-flight turn from {@link provideChatSessionContent},
   *   - server-initiated turns detected by {@link _watchForServerInitiatedTurns}.
   *
   * Differences are captured in {@link IObserveTurnOptions.sink} (where
   * progress is delivered) and {@link IObserveTurnOptions.adoptInvocations} /
   * {@link IObserveTurnOptions.seedEmittedLengths} (snapshot continuity for
   * the reconnect case).
   *
   * The returned disposable owns the entire per-turn graph, including the
   * underlying session subscription reference.
   */
  _observeTurn(opts) {
    const sessionKey = opts.backendSession.toString();
    const store = new DisposableStore();
    this._ensureTurnStopWatch(opts.chatURI, opts.turnId);
    const sub = this._ensureSessionSubscription(sessionKey);
    const chatURI = opts.chatURI;
    const chatSub = this._ensureChatSubscription(sessionKey, chatURI);
    const sessionState$ = observableFromSubscription(this, sub);
    const chatState$ = observableFromSubscription(this, chatSub);
    const mergedState$ = derived((reader) => {
      const session = sessionState$.read(reader);
      if (!session) {
        return void 0;
      }
      return mergeSessionWithDefaultChat(session, chatState$.read(reader));
    });
    const turn$ = derived((reader) => {
      const state = mergedState$.read(reader);
      if (!state) {
        return void 0;
      }
      return state.activeTurn?.id === opts.turnId ? state.activeTurn : state.turns.find((t) => t.id === opts.turnId);
    });
    const responseParts$ = derived((reader) => turn$.read(reader)?.responseParts ?? []);
    const usage$ = derived((reader) => turn$.read(reader)?.usage);
    store.add(autorun((reader) => {
      const state = mergedState$.read(reader);
      if (state?.turns.some((turn) => turn.id === opts.turnId)) {
        this._clearTurnStopWatch(opts.chatURI, opts.turnId);
      }
    }));
    const mcpAuthRequired$ = derivedOpts({ equalsFn: equals }, (reader) => {
      return getMcpAuthenticationRequiredServers(opts.sessionResource, mergedState$.read(reader));
    });
    const mcpStarting$ = derivedOpts({ equalsFn: equals }, (reader) => {
      const state = mergedState$.read(reader);
      const servers = state?.customizations?.flatMap((c) => c.type === CustomizationType.McpServer ? [c] : c.children?.filter((c2) => c2.type === CustomizationType.McpServer) ?? []) ?? [];
      return servers.filter((server) => isCustomizationEnabled(server) && server.state.kind === McpServerStatus.Starting).map((server) => ({
        id: opts.sessionResource.authority + "/" + server.id,
        name: server.name
      }));
    });
    const subagentContext = {
      observations: store.add(new DisposableMap())
    };
    store.add(autorunPerKeyedItem(
      responseParts$,
      (rp) => rp.kind === ResponsePartKind.ToolCall ? `tc:${rp.toolCall.toolCallId}` : rp.kind === ResponsePartKind.Markdown ? `md:${rp.id}` : rp.kind === ResponsePartKind.Reasoning ? `rs:${rp.id}` : rp.kind === ResponsePartKind.InputRequest ? inputRequestResponsePartKey(rp) : `other:${responseParts$.get().indexOf(rp)}`,
      (_key, part$, partStore) => {
        const initial = part$.get();
        switch (initial.kind) {
          case ResponsePartKind.Markdown:
            if (opts.subAgentInvocationId !== void 0) {
              break;
            }
            this._setupMarkdownPart(part$, partStore, opts);
            break;
          case ResponsePartKind.Reasoning:
            if (opts.subAgentInvocationId !== void 0) {
              break;
            }
            this._setupReasoningPart(part$, partStore, opts);
            break;
          case ResponsePartKind.ToolCall:
            this._setupToolCallPart(part$, partStore, opts, subagentContext);
            break;
          case ResponsePartKind.InputRequest:
            if (opts.subAgentInvocationId === void 0) {
              this._setupInputRequestPart(part$, partStore, opts);
            }
            break;
          case ResponsePartKind.SystemNotification:
            if (responseParts$.get().indexOf(initial) >= (opts.initialResponsePartCount ?? 0) && opts.subAgentInvocationId === void 0) {
              const progress = systemNotificationToChatPart(initial.content, this._config.connectionAuthority, initial._meta);
              if (progress) {
                opts.sink([progress]);
              }
            }
            break;
        }
      }
    ));
    if (opts.subAgentInvocationId === void 0) {
      let lastUsage;
      let lastAutoModeResolution;
      const modelLookup = this._createTurnModelLookup(opts.sessionResource, void 0);
      this._setupMcpAuthPrompt(mcpAuthRequired$, store, opts);
      store.add(autorun((reader) => {
        const activity = chatState$.read(reader)?.activity;
        if (!activity || responseParts$.read(reader).length > 0) {
          return;
        }
        opts.sink([{
          kind: "progressMessage",
          id: CHAT_ACTIVITY_PROGRESS_ID,
          content: new MarkdownString().appendText(activity),
          shimmer: true
        }]);
      }));
      store.add(autorun((reader) => {
        const resolution = modelLookup.toAutoModeResolution?.(usage$.read(reader));
        if (!resolution || equals(lastAutoModeResolution, resolution)) {
          return;
        }
        lastAutoModeResolution = resolution;
        opts.sink([resolution]);
      }));
      {
        const MCP_STARTING_GRACE_MS = 5e3;
        let didAppend = false;
        const hasContent$ = responseParts$.map((r) => r.length > 0);
        const hasServersStarting$ = mcpStarting$.map((s) => s.length > 0);
        const serversStartingInput = observableValue("mcpStartingServersInput", constObservable([]));
        store.add(autorun((reader) => {
          if (hasContent$.read(reader) || !hasServersStarting$.read(reader)) {
            serversStartingInput.set(constObservable([]), void 0);
            return;
          }
          reader.store.add(disposableTimeout(() => {
            serversStartingInput.set(mcpStarting$, void 0);
            if (!didAppend) {
              didAppend = true;
              opts.sink([{
                kind: "mcpServersStartingSlow",
                sessionResource: opts.sessionResource,
                servers: serversStartingInput.map((o, r) => o.read(r))
              }]);
            }
          }, MCP_STARTING_GRACE_MS));
        }));
        store.add(toDisposable(() => serversStartingInput.set(constObservable([]), void 0)));
      }
      store.add(autorun((reader) => {
        const rawUsage = usage$.read(reader);
        const usage = usageInfoToChatUsage(rawUsage, modelLookup.toModelDisplayName);
        if (!usage) {
          return;
        }
        const actualModelId = this._toLanguageModelId(opts.sessionResource, rawUsage?.model);
        if (actualModelId) {
          usage.actualModelId = actualModelId;
        }
        if (lastUsage && lastUsage.promptTokens === usage.promptTokens && lastUsage.completionTokens === usage.completionTokens && lastUsage.outputBuffer === usage.outputBuffer && lastUsage.copilotCredits === usage.copilotCredits && lastUsage.sessionCopilotCredits === usage.sessionCopilotCredits && equals(lastUsage.promptTokenDetails, usage.promptTokenDetails) && equals(lastUsage.modelTotals, usage.modelTotals)) {
          return;
        }
        lastUsage = usage;
        opts.sink([usage]);
      }));
      let lastQuotaSignature;
      store.add(autorun((reader) => {
        const quotaUpdate = usageInfoToQuotas(usage$.read(reader));
        if (!quotaUpdate) {
          return;
        }
        const signature = JSON.stringify(quotaUpdate);
        if (signature === lastQuotaSignature) {
          return;
        }
        lastQuotaSignature = signature;
        this._chatEntitlementService.acceptQuotas({
          ...this._chatEntitlementService.quotas,
          ...quotaUpdate
        });
      }));
    }
    if (opts.subAgentInvocationId !== void 0 && opts.subAgentCreditsAccumulator) {
      const accumulator = opts.subAgentCreditsAccumulator;
      let lastCredits = 0;
      store.add(autorun((reader) => {
        const rawUsage = usage$.read(reader);
        const credits = usageInfoToChatUsage(rawUsage)?.copilotCredits;
        if (typeof credits === "number" && credits !== lastCredits) {
          const delta = credits - lastCredits;
          lastCredits = credits;
          if (delta > 0) {
            transaction((tx) => {
              accumulator.set(accumulator.read(void 0) + delta, tx);
            });
          }
        }
      }));
    }
    if (opts.subAgentInvocationId !== void 0 && opts.subAgentModelObservable) {
      const modelObservable = opts.subAgentModelObservable;
      store.add(autorun((reader) => {
        const rawUsage = usage$.read(reader);
        const modelId = this._toLanguageModelId(opts.sessionResource, rawUsage?.model);
        const modelName = this._getLanguageModelDisplayName(modelId);
        if (modelName && modelName !== modelObservable.read(void 0)) {
          transaction((tx) => modelObservable.set(modelName, tx));
        }
      }));
    }
    let terminated = false;
    let seenActive = false;
    const finish = (lastTurn) => {
      if (terminated) {
        return;
      }
      terminated = true;
      queueMicrotask(() => {
        try {
          opts.onTurnEnded?.(lastTurn);
        } finally {
          store.dispose();
        }
      });
    };
    store.add(autorun((reader) => {
      if (terminated) {
        return;
      }
      const state = mergedState$.read(reader);
      if (!state) {
        return;
      }
      if (state.activeTurn?.id === opts.turnId) {
        seenActive = true;
        return;
      }
      const lastTurn = state.turns.find((t) => t.id === opts.turnId);
      if (lastTurn) {
        seenActive = true;
      }
      if (!seenActive) {
        return;
      }
      if (!opts.suppressErrorMarkdown && lastTurn?.state === TurnState.Error && lastTurn.error) {
        const forwarded = getChatErrorDetailsFromMeta(lastTurn.error, this._chatErrorContext());
        const content = forwarded ? new MarkdownString(`

${forwarded.message}`) : new MarkdownString(`

Error: (${lastTurn.error.errorType}) ${lastTurn.error.message}`);
        opts.sink([{ kind: "markdownContent", content }]);
      }
      finish(lastTurn);
    }));
    store.add(opts.cancellationToken.onCancellationRequested(() => {
      const current = turn$.get();
      finish(current ? { state: TurnState.Cancelled, ...current } : void 0);
    }));
    return store;
  }
  /**
   * Surfaces the "MCP server … requires authentication" prompt for a turn.
   *
   * Each server is prompted at most once per conversation: {@link mcpAuthRequired$}
   * is session-wide, so without this guard the prompt would repeat on every
   * message. The per-session {@link _surfacedMcpAuthServers surfaced set} tracks
   * which servers were already prompted; it is pruned by
   * {@link _reconcileSurfacedMcpAuthServers} once a server reaches the running
   * state, so a server that is re-required after being authenticated (e.g.
   * after a restart) prompts again.
   *
   * The emitted part lists only the servers it introduced and shrinks as they
   * authenticate.
   */
  _setupMcpAuthPrompt(mcpAuthRequired$, store, opts) {
    let part;
    let ownedIds = /* @__PURE__ */ new Set();
    let runId = 0;
    store.add(autorun((reader) => {
      const pendingAuth = mcpAuthRequired$.read(reader);
      const currentRunId = ++runId;
      this._filterAutoGrantedMcpAuthentication(opts.sessionResource, pendingAuth).then((servers) => {
        if (currentRunId !== runId) {
          return;
        }
        const surfaced = this._getSurfacedMcpAuthServers(opts.sessionResource);
        const newServers = servers.filter((server) => !surfaced.has(server.id));
        if (!newServers.length && (!part || part.isUsed)) {
          return;
        }
        if (!part || part.isUsed) {
          ownedIds = /* @__PURE__ */ new Set();
          part = {
            kind: "mcpAuthenticationRequired",
            sessionResource: opts.sessionResource.toJSON(),
            isUsed: false,
            servers: observableValue("mcpAuthNeededServers", [])
          };
          opts.sink([part]);
        }
        for (const server of newServers) {
          surfaced.add(server.id);
          ownedIds.add(server.id);
        }
        part.servers.set(servers.filter((server) => ownedIds.has(server.id)), void 0);
      });
    }));
  }
  /**
   * Returns the mutable set of MCP server ids already surfaced for
   * authentication in the given session, creating it on first use.
   */
  _getSurfacedMcpAuthServers(sessionResource) {
    let surfaced = this._surfacedMcpAuthServers.get(sessionResource);
    if (!surfaced) {
      surfaced = /* @__PURE__ */ new Set();
      this._surfacedMcpAuthServers.set(sessionResource, surfaced);
    }
    return surfaced;
  }
  /**
   * Prunes servers that reached the running ({@link McpServerStatus.Ready})
   * state from every session's {@link _surfacedMcpAuthServers surfaced set} so
   * a subsequent auth requirement surfaces a fresh prompt instead of being
   * suppressed. Only the running state counts as actioned — a server that
   * merely left {@link McpServerStatus.AuthRequired} for an error/stopped
   * state was not authenticated and stays suppressed.
   */
  _reconcileSurfacedMcpAuthServers() {
    for (const [sessionResource, surfaced] of this._surfacedMcpAuthServers) {
      if (surfaced.size === 0) {
        continue;
      }
      const ready = new Set(this._customizationService.getMcpServers(sessionResource).filter((server) => server.status === McpServerStatus.Ready).map((server) => server.id));
      for (const id of surfaced) {
        if (ready.has(id)) {
          surfaced.delete(id);
        }
      }
    }
  }
  async _filterAutoGrantedMcpAuthentication(sessionResource, servers) {
    const remaining = [];
    for (const server of servers) {
      if (!await this._autoAuthenticateMcpServer(sessionResource, server)) {
        remaining.push(server);
      }
    }
    return remaining;
  }
  async _autoAuthenticateMcpServer(sessionResource, server) {
    const key = JSON.stringify([
      agentHostMcpServerId(sessionResource.authority, server.name, server.resource),
      [...server.requiredScopes ?? []].sort(),
      server.oauthClient?.clientId
    ]);
    const pending = this._pendingMcpAutoAuthentication.get(key);
    if (pending) {
      return pending;
    }
    const operation = this._instantiationService.invokeFunction(resolveMcpServerAuthentication, {
      resource: server.resource,
      resource_name: server.name,
      authorization_servers: server.authorizationServers ? [...server.authorizationServers] : void 0,
      scopes_supported: server.supportedScopes ? [...server.supportedScopes] : void 0
    }, {
      allowInteraction: false,
      logPrefix: "[AgentHost]",
      mcpServerId: agentHostMcpServerId(sessionResource.authority, server.name, server.resource),
      mcpServerName: server.name,
      mcpServerUrl: server.resource,
      oauthClient: server.oauthClient,
      scopes: server.requiredScopes ?? [],
      agentHost: { scheme: sessionResource.scheme, authority: sessionResource.authority },
      authenticate: (request) => this._config.connection.authenticate(request)
    }).catch((err) => {
      this._logService.error(`[AgentHost] Failed to auto-authenticate MCP server '${server.name}'`, err);
      return false;
    });
    this._pendingMcpAutoAuthentication.set(key, operation);
    try {
      return await operation;
    } finally {
      if (this._pendingMcpAutoAuthentication.get(key) === operation) {
        this._pendingMcpAutoAuthentication.delete(key);
      }
    }
  }
  _setupMarkdownPart(part$, store, opts) {
    let lastEmitted = opts.seedEmittedLengths?.get(part$.get().id) ?? 0;
    store.add(autorun((reader) => {
      const content = part$.read(reader).content;
      if (content.length <= lastEmitted) {
        return;
      }
      const delta = content.substring(lastEmitted);
      lastEmitted = content.length;
      opts.sink([{ kind: "markdownContent", content: new MarkdownString(delta) }]);
    }));
  }
  _setupReasoningPart(part$, store, opts) {
    const partId = part$.get().id;
    let lastEmitted = opts.seedEmittedLengths?.get(partId) ?? 0;
    store.add(autorun((reader) => {
      const content = part$.read(reader).content;
      if (content.length <= lastEmitted) {
        return;
      }
      const delta = content.substring(lastEmitted);
      lastEmitted = content.length;
      opts.sink([{ kind: "thinking", value: delta, id: partId }]);
    }));
  }
  _setupToolCallPart(part$, store, opts, subagentContext) {
    const initial = part$.get().toolCall;
    const contributor = initial.contributor;
    if (contributor?.kind === ToolCallContributorKind.Client && contributor.clientId === this._config.connection.clientId) {
      this._setupClientToolCall(initial, part$, store, opts, subagentContext);
      store.add(this._markToolCallRendered(opts.chatURI, opts.turnId, initial.toolCallId, opts.sessionResource));
    } else if (contributor?.kind === ToolCallContributorKind.Client) {
      this._setupOtherClientToolCall(initial, part$, store, opts);
    } else {
      store.add(this._markToolCallRendered(opts.chatURI, opts.turnId, initial.toolCallId, opts.sessionResource));
      this._setupServerToolCall(initial, part$, store, opts, subagentContext);
    }
  }
  _toolCallKey(chatURI, turnId, toolCallId) {
    return `${chatURI}\0${turnId}\0${toolCallId}`;
  }
  _inputRequestKey(chatURI, requestId) {
    return `${chatURI}\0${requestId}`;
  }
  /** Claims a request as rendered until the returned disposable is disposed. */
  _markRendered(key, sessionResource) {
    this._renderedRequests.set(new Map(this._renderedRequests.get()).set(key, sessionResource), void 0);
    return toDisposable(() => {
      const next = new Map(this._renderedRequests.get());
      next.delete(key);
      this._renderedRequests.set(next, void 0);
    });
  }
  /**
   * Records that a turn observer is rendering this chat input request, so the
   * session-level responder leaves its inline elicitation UI in charge.
   */
  _markInputRequestRendered(chatURI, requestId, sessionResource) {
    return this._markRendered(this._inputRequestKey(chatURI, requestId), sessionResource);
  }
  /**
   * Records that a turn observer is rendering this tool call, so the
   * session-level responder leaves its inline UI in charge. Releasing the
   * claim also forgets the funnel entries, which is the only cleanup a tool
   * call that never reached `inputNeeded` ever gets.
   */
  _markToolCallRendered(chatURI, turnId, toolCallId, sessionResource) {
    const key = this._toolCallKey(chatURI, turnId, toolCallId);
    const rendered = this._markRendered(key, sessionResource);
    return toDisposable(() => {
      rendered.dispose();
      this._forgetResolvedToolCall(key);
    });
  }
  /**
   * Single funnel for tool-call outcomes, so an inline invocation and the
   * session-level responder can both offer the action while the protocol
   * only ever sees the first answer. Confirming and completing are distinct
   * outcomes, so each is tracked separately.
   */
  _resolveToolCall(chatURI, turnId, toolCallId, action) {
    const key = `${this._toolCallKey(chatURI, turnId, toolCallId)}\0${action.type}`;
    if (this._resolvedToolCalls.has(key)) {
      this._logService.trace(`[AgentHost] Tool call outcome was already dispatched: ${toolCallId} (${action.type})`);
      return;
    }
    this._resolvedToolCalls.add(key);
    this._config.connection.dispatch(chatURI, action);
  }
  _forgetResolvedToolCall(toolCallKey) {
    for (const key of this._resolvedToolCalls) {
      if (key.startsWith(`${toolCallKey}\0`)) {
        this._resolvedToolCalls.delete(key);
      }
    }
  }
  _setupOtherClientToolCall(initial, part$, store, opts) {
    const toolCallId = initial.toolCallId;
    const adopted = opts.adoptInvocations?.get(toolCallId);
    const invocation = adopted ?? toolCallStateToInvocation(
      initial,
      opts.subAgentInvocationId,
      opts.backendSession,
      this._config.connectionAuthority,
      opts.sessionResource.authority,
      this._otherClientToolInvocationOptions(opts.backendSession, opts.chatURI, opts.turnId)
    );
    if (!adopted) {
      opts.sink([invocation]);
    }
    store.add(autorun((reader) => {
      const toolCall = part$.read(reader).toolCall;
      if ((toolCall.status === ToolCallStatus.Completed || toolCall.status === ToolCallStatus.Cancelled) && !IChatToolInvocation.isComplete(invocation)) {
        const fileEdits = finalizeToolInvocation(invocation, toolCall, opts.backendSession, this._config.connectionAuthority);
        if (fileEdits.length > 0) {
          opts.onFileEdits?.(toolCall, fileEdits);
        }
      }
    }));
    store.add(toDisposable(() => {
      if (!IChatToolInvocation.isComplete(invocation)) {
        invocation.didExecuteTool(void 0);
      }
    }));
  }
  _otherClientToolInvocationOptions(backendSession, chatURI, turnId) {
    return {
      currentClientId: this._config.connection.clientId,
      cancelOtherClientToolCall: (toolCall) => {
        const reasonMessage = localize("agentHost.otherClientTool.skippedError", "{0} was skipped from another client", toolCall.displayName);
        this._dispatchAction(backendSession, toolCall.status === ToolCallStatus.PendingConfirmation ? {
          type: ActionType.ChatToolCallConfirmed,
          turnId,
          toolCallId: toolCall.toolCallId,
          approved: false,
          reason: ToolCallCancellationReason.Skipped,
          reasonMessage
        } : {
          type: ActionType.ChatToolCallComplete,
          turnId,
          toolCallId: toolCall.toolCallId,
          result: {
            success: false,
            pastTenseMessage: localize("agentHost.otherClientTool.skipped", "Skipped {0}", toolCall.displayName),
            error: { message: reasonMessage, code: "cancelled" }
          }
        }, chatURI);
      }
    };
  }
  /**
   * Per-call setup for a server-driven tool. Adopts a snapshot
   * {@link ChatToolInvocation} when present (reconnect parity); otherwise
   * emits a fresh one. Reacts to status transitions for re-confirmation,
   * terminal revival, finalization, and subagent observation.
   */
  _setupServerToolCall(initial, part$, store, opts, subagentContext) {
    const toolCallId = initial.toolCallId;
    const subAgentInvocationId = opts.subAgentInvocationId;
    const adopted = opts.adoptInvocations?.get(toolCallId);
    let confirmationOptions = initial.status === ToolCallStatus.PendingConfirmation ? initial.options : void 0;
    let invocation;
    if (adopted) {
      invocation = adopted;
    } else if (initial.status === ToolCallStatus.Streaming) {
      invocation = toolCallStateToStreamingInvocation(initial, subAgentInvocationId, opts.backendSession, this._config.connectionAuthority, opts.sessionResource.authority);
      opts.sink([invocation]);
    } else {
      invocation = toolCallStateToInvocation(initial, subAgentInvocationId, opts.backendSession, this._config.connectionAuthority, opts.sessionResource.authority);
      opts.sink([invocation]);
    }
    if (initial.status === ToolCallStatus.PendingConfirmation && !IChatToolInvocation.isComplete(invocation)) {
      this._awaitToolConfirmation(invocation, toolCallId, opts.backendSession, opts.turnId, opts.cancellationToken, () => confirmationOptions, opts.chatURI);
    }
    this._tryObserveSubagentToolCall(initial, invocation, store, opts, subagentContext);
    const outputTerminalAttachment = {
      disposable: store.add(new MutableDisposable())
    };
    let previousStatus = initial.status;
    store.add(autorun((reader) => {
      const tc = part$.read(reader).toolCall;
      const status = tc.status;
      const priorStatus = previousStatus;
      if (status === ToolCallStatus.PendingConfirmation) {
        confirmationOptions = tc.options;
      }
      const enteringConfirmation = status === ToolCallStatus.PendingConfirmation && previousStatus !== ToolCallStatus.PendingConfirmation;
      previousStatus = status;
      if (status === ToolCallStatus.Streaming) {
        updateStreamingToolInvocation(invocation, tc, this._config.connectionAuthority);
      } else if (enteringConfirmation) {
        this._forgetResolvedToolCall(this._toolCallKey(opts.chatURI, opts.turnId, toolCallId));
        if (!IChatToolInvocation.isComplete(invocation)) {
          const prepared = toolCallStateToPreparedInvocation(tc, opts.backendSession, this._config.connectionAuthority, opts.sessionResource.authority);
          invocation.requestConfirmation(prepared);
          this._awaitToolConfirmation(invocation, toolCallId, opts.backendSession, opts.turnId, opts.cancellationToken, () => confirmationOptions, opts.chatURI);
        }
      } else if (status === ToolCallStatus.PendingConfirmation) {
        const prepared = toolCallStateToPreparedInvocation(tc, opts.backendSession, this._config.connectionAuthority, opts.sessionResource.authority);
        invocation.updatePreparedInvocation(prepared, invocation.parameters);
      } else if (status === ToolCallStatus.AuthRequired) {
        this._ensureLeftStreaming(invocation, tc, opts);
        invocation.setAuthenticationRequired(toolCallAuthenticationServer(tc, opts.sessionResource.authority), () => {
          this._dispatchAction(opts.backendSession, {
            type: ActionType.ChatToolCallComplete,
            turnId: opts.turnId,
            toolCallId,
            result: {
              success: false,
              pastTenseMessage: localize("agentHost.mcpToolAuthentication.cancelled", "Cancelled tool call"),
              error: { message: localize("agentHost.mcpToolAuthentication.cancelledError", "MCP authentication was cancelled"), code: "cancelled" }
            }
          }, opts.chatURI);
        });
      } else if (status === ToolCallStatus.Running || status === ToolCallStatus.PendingResultConfirmation) {
        if (priorStatus === ToolCallStatus.AuthRequired) {
          invocation.setAuthenticationResolved();
        }
        this._ensureLeftStreaming(invocation, tc, opts);
        const invocationMessage = stringOrMarkdownToString(tc.invocationMessage, this._config.connectionAuthority);
        const previousInvocationMessage = typeof invocation.invocationMessage === "string" ? invocation.invocationMessage : invocation.invocationMessage.value;
        const nextInvocationMessage = typeof invocationMessage === "string" ? invocationMessage : invocationMessage?.value;
        const invocationMessageChanged = nextInvocationMessage !== void 0 && nextInvocationMessage !== previousInvocationMessage;
        if (invocationMessage !== void 0) {
          invocation.invocationMessage = invocationMessage;
        }
        this._reviveTerminalIfNeeded(invocation, tc, opts.backendSession, outputTerminalAttachment);
        updateRunningToolSpecificData(invocation, tc, opts.backendSession, this._config.connectionAuthority);
        if (invocationMessageChanged) {
          invocation.notifyToolSpecificDataChanged();
        }
      }
      this._tryObserveSubagentToolCall(tc, invocation, store, opts, subagentContext);
      if ((status === ToolCallStatus.Completed || status === ToolCallStatus.Cancelled) && !IChatToolInvocation.isComplete(invocation)) {
        if (status === ToolCallStatus.Completed) {
          this._ensureLeftStreaming(invocation, tc, opts);
        }
        this._reviveTerminalIfNeeded(invocation, tc, opts.backendSession, outputTerminalAttachment);
        const fileEdits = finalizeToolInvocation(invocation, tc, opts.backendSession, this._config.connectionAuthority);
        if (fileEdits.length > 0) {
          opts.onFileEdits?.(tc, fileEdits);
        }
      }
    }));
    store.add(toDisposable(() => {
      if (!IChatToolInvocation.isComplete(invocation)) {
        invocation.didExecuteTool(void 0);
      }
    }));
  }
  /** Transitions an invocation from streaming once its AHP tool call is ready. */
  _ensureLeftStreaming(invocation, tc, opts) {
    if (invocation.state.read(void 0).type !== IChatToolInvocation.StateKind.Streaming) {
      return;
    }
    const prepared = toolCallStateToPreparedInvocation(tc, opts.backendSession, this._config.connectionAuthority, opts.sessionResource.authority);
    invocation.transitionFromStreaming(prepared, void 0, void 0);
  }
  /**
   * Observes the child chat for any subagent-spawning tool, including client-provided delegated tasks.
   */
  _tryObserveSubagentToolCall(toolCall, invocation, store, opts, subagentContext) {
    const toolCallId = toolCall.toolCallId;
    const hasSubagentContent = (toolCall.status === ToolCallStatus.Running || toolCall.status === ToolCallStatus.Completed) && !!getToolSubagentContent(toolCall);
    if (!isSubagentTool(toolCall) && !hasSubagentContent) {
      return;
    }
    const isObserved = subagentContext.observations.has(toolCallId);
    const currentData = invocation.toolSpecificData?.kind === "subagent" ? invocation.toolSpecificData : void 0;
    const prepared = toolCallStateToPreparedInvocation(toolCall, opts.backendSession, this._config.connectionAuthority, opts.sessionResource.authority);
    const protocolData = prepared.toolSpecificData?.kind === "subagent" ? prepared.toolSpecificData : void 0;
    if (!protocolData) {
      return;
    }
    const chatResource = protocolData.chatResource ?? currentData?.chatResource;
    const description = protocolData.description ?? currentData?.description;
    const agentName = protocolData.agentName ?? currentData?.agentName;
    if (!currentData || currentData.chatResource !== chatResource || currentData.description !== description || currentData.agentName !== agentName) {
      invocation.toolSpecificData = {
        ...currentData,
        ...protocolData,
        chatResource,
        description,
        agentName,
        isActive: currentData?.isActive ?? isObserved
      };
      invocation.notifyToolSpecificDataChanged();
    }
    if (isObserved && !shouldObserveSubagentChat(toolCall)) {
      subagentContext.observations.deleteAndDispose(toolCallId);
      return;
    }
    if (isObserved) {
      return;
    }
    if (!shouldObserveSubagentChat(toolCall)) {
      return;
    }
    const subagentData = invocation.toolSpecificData;
    if (subagentData?.kind !== "subagent") {
      return;
    }
    const observationStore = new DisposableStore();
    subagentContext.observations.set(toolCallId, observationStore);
    subagentData.isActive = true;
    invocation.notifyToolSpecificDataChanged();
    const perInvocationCredits = observableValue("subagentInvocationCredits", 0);
    observationStore.add(autorun((reader) => {
      const total = perInvocationCredits.read(reader);
      if (total > 0 && invocation.toolSpecificData?.kind === "subagent" && invocation.toolSpecificData.credits !== total) {
        invocation.toolSpecificData.credits = total;
        invocation.notifyToolSpecificDataChanged();
      }
    }));
    const perInvocationModel = observableValue("subagentInvocationModel", void 0);
    observationStore.add(autorun((reader) => {
      const modelName = perInvocationModel.read(reader);
      if (modelName && invocation.toolSpecificData?.kind === "subagent" && invocation.toolSpecificData.modelName !== modelName) {
        invocation.toolSpecificData.modelName = modelName;
        invocation.notifyToolSpecificDataChanged();
      }
    }));
    const rootInvocationId = opts.subAgentInvocationId ?? toolCallId;
    const childChatUri = subagentData.chatResource || buildSubagentChatUri(opts.backendSession.toString(), toolCallId);
    this._observeSubagentSession(opts.sessionResource, opts.backendSession, toolCallId, childChatUri, rootInvocationId, invocation, opts.sink, observationStore, subagentContext, perInvocationCredits, perInvocationModel);
  }
  /**
   * Per-call setup for a client-provided tool. The observer only renders: it
   * obtains the shared {@link ChatToolInvocation} (created by whichever of
   * this observer or the session-level watcher arrives first), emits it into
   * this chat so it renders in the correct group, drives subagent
   * presentation, and dispatches `ChatToolCallConfirmed` from the
   * invocation's confirmation gate. It never invokes the tool — the
   * session-level watcher owns execution.
   */
  _setupClientToolCall(initial, part$, store, opts, subagentContext) {
    const toolCallId = initial.toolCallId;
    const toolName = initial.toolName;
    const adopted = opts.adoptInvocations?.get(toolCallId);
    if (adopted && !IChatToolInvocation.isComplete(adopted)) {
      adopted.didExecuteTool(void 0);
    }
    const clientToolName = toolName === RUNTIME_TOOL_SEARCH_TOOL_NAME ? CLIENT_TOOL_SEARCH_REFERENCE_NAME : toolName;
    const toolData = this._toolsService.getToolByName(clientToolName);
    if (!toolData) {
      this._logService.warn(`[AgentHost] Client tool call for unknown tool: ${toolName}`);
      this._dispatchAction(opts.backendSession, {
        type: ActionType.ChatToolCallComplete,
        turnId: opts.turnId,
        toolCallId,
        result: {
          success: false,
          pastTenseMessage: `Tool "${toolName}" is not available`,
          error: { message: `Tool "${toolName}" is not available on this client` }
        }
      }, opts.chatURI);
      return;
    }
    const invocation = this._ensureClientToolInvocation(opts.chatURI, opts.turnId, toolCallId, toolData.id, opts.subAgentInvocationId);
    if (!invocation) {
      this._logService.warn(`[AgentHost] Failed to begin client tool invocation: ${toolName}`);
      this._dispatchAction(opts.backendSession, {
        type: ActionType.ChatToolCallComplete,
        turnId: opts.turnId,
        toolCallId,
        result: {
          success: false,
          pastTenseMessage: `Failed to start ${toolName}`,
          error: { message: `Could not create invocation for client tool "${toolName}"` }
        }
      }, opts.chatURI);
      return;
    }
    if (isSubagentTool(initial)) {
      const prepared = toolCallStateToPreparedInvocation(initial, opts.backendSession, this._config.connectionAuthority, opts.sessionResource.authority);
      if (prepared.toolSpecificData?.kind === "subagent") {
        invocation.toolSpecificData = prepared.toolSpecificData;
      }
    }
    this._tryObserveSubagentToolCall(initial, invocation, store, opts, subagentContext);
    opts.sink([invocation]);
    let confirmationDispatched = false;
    store.add(autorun((reader) => {
      const state = invocation.state.read(reader);
      if (confirmationDispatched) {
        return;
      }
      if (state.type === IChatToolInvocation.StateKind.Executing) {
        confirmationDispatched = true;
        const selectedOptionId = state.confirmed.type === ToolConfirmKind.UserAction ? state.confirmed.selectedButton : void 0;
        const approved = state.confirmed.type !== ToolConfirmKind.UserAction || state.confirmed.selectedButtonKind !== ConfirmationOptionKind.Deny;
        this._resolveToolCall(opts.chatURI, opts.turnId, toolCallId, approved ? {
          type: ActionType.ChatToolCallConfirmed,
          turnId: opts.turnId,
          toolCallId,
          approved: true,
          confirmed: confirmedReasonToProtocol(state.confirmed),
          ...selectedOptionId ? { selectedOptionId } : {}
        } : {
          type: ActionType.ChatToolCallConfirmed,
          turnId: opts.turnId,
          toolCallId,
          approved: false,
          reason: ToolCallCancellationReason.Denied,
          ...selectedOptionId ? { selectedOptionId } : {}
        });
      } else if (state.type === IChatToolInvocation.StateKind.Cancelled) {
        confirmationDispatched = true;
        const status = part$.read(void 0).toolCall.status;
        if (status === ToolCallStatus.Cancelled || status === ToolCallStatus.Completed) {
          return;
        }
        this._resolveToolCall(opts.chatURI, opts.turnId, toolCallId, {
          type: ActionType.ChatToolCallConfirmed,
          turnId: opts.turnId,
          toolCallId,
          approved: false,
          reason: ToolCallCancellationReason.Denied
        });
      }
    }));
    store.add(autorun((reader) => {
      const tc = part$.read(reader).toolCall;
      this._tryObserveSubagentToolCall(tc, invocation, store, opts, subagentContext);
      const cancellation = tc.status === ToolCallStatus.Cancelled ? {
        reason: tc.reason === ToolCallCancellationReason.Skipped ? ToolConfirmKind.Skipped : ToolConfirmKind.Denied,
        reasonMessage: tc.reasonMessage ? stringOrMarkdownToString(tc.reasonMessage, this._config.connectionAuthority) : void 0
      } : tc.status === ToolCallStatus.Completed && !tc.success && tc.error?.code === "cancelled" ? { reason: ToolConfirmKind.Skipped, reasonMessage: tc.error.message } : void 0;
      if (cancellation && !invocation.cancelFromStreaming(cancellation.reason, cancellation.reasonMessage)) {
        IChatToolInvocation.confirmWith(invocation, { type: cancellation.reason });
      }
      if ((tc.status === ToolCallStatus.Cancelled || tc.status === ToolCallStatus.Completed) && !IChatToolInvocation.isComplete(invocation, reader)) {
        const fileEdits = finalizeToolInvocation(invocation, tc, opts.backendSession, this._config.connectionAuthority);
        if (fileEdits.length > 0) {
          opts.onFileEdits?.(tc, fileEdits);
        }
      }
    }));
  }
  _setupInputRequestPart(part$, store, opts) {
    const inputReq = part$.get().request;
    store.add(this._markInputRequestRendered(opts.chatURI, inputReq.id, opts.sessionResource));
    const planReview = inputReq.planReview;
    if (planReview) {
      this._setupPlanReviewInputRequest(part$, planReview, store, opts);
      return;
    }
    if (inputReq.url) {
      this._setupUrlInputRequest(part$, inputReq.url, store, opts);
      return;
    }
    const carousel = createInputRequestCarousel(inputReq, this._config.connectionAuthority);
    opts.sink([carousel]);
    let completedFromServer = false;
    store.add(autorun((reader) => {
      const part = part$.read(reader);
      if (part.response === void 0) {
        return;
      }
      completedFromServer = true;
      const protocolAnswers = part.response === ChatInputResponseKind.Accept ? part.request.answers : void 0;
      const carouselAnswers = convertProtocolAnswers(protocolAnswers);
      const wasUsed = carousel.isUsed;
      carousel.data = carouselAnswers ?? {};
      carousel.isUsed = true;
      carousel.answeredExternally = part.response === ChatInputResponseKind.Accept && !carouselAnswers;
      carousel.autoReply = containsAutomaticReplyAnswer(protocolAnswers);
      carousel.answeredExternally ||= carousel.autoReply;
      carousel.draftAnswers = void 0;
      carousel.draftCurrentIndex = void 0;
      carousel.draftCollapsed = void 0;
      carousel.completion.complete({ answers: carouselAnswers });
      if (!wasUsed) {
        this._chatWidgetService.getWidgetBySessionResource(opts.sessionResource)?.input.clearQuestionCarousel(void 0, inputReq.id);
      }
    }));
    carousel.completion.p.then((result) => {
      if (store.isDisposed || completedFromServer) {
        return;
      }
      if (!result.answers) {
        this._config.connection.dispatch(opts.chatURI, {
          type: ActionType.ChatInputCompleted,
          requestId: inputReq.id,
          response: ChatInputResponseKind.Cancel
        });
      } else {
        const answers = convertCarouselAnswers(result.answers, inputReq.questions);
        this._config.connection.dispatch(opts.chatURI, {
          type: ActionType.ChatInputCompleted,
          requestId: inputReq.id,
          response: ChatInputResponseKind.Accept,
          answers
        });
      }
    });
    if (opts.cancellationToken.isCancellationRequested) {
      carousel.completion.complete({ answers: void 0 });
    } else {
      const tokenListener = opts.cancellationToken.onCancellationRequested(() => {
        carousel.completion.complete({ answers: void 0 });
      });
      carousel.completion.p.finally(() => tokenListener.dispose());
    }
    store.add(toDisposable(() => {
      if (carousel.isUsed) {
        return;
      }
      carousel.data = {};
      carousel.isUsed = true;
      carousel.draftAnswers = void 0;
      carousel.draftCurrentIndex = void 0;
      carousel.draftCollapsed = void 0;
      carousel.completion.complete({ answers: void 0 });
      this._chatWidgetService.getWidgetBySessionResource(opts.sessionResource)?.input.clearQuestionCarousel(void 0, inputReq.id);
    }));
  }
  _setupPlanReviewInputRequest(part$, planReview, store, opts) {
    const inputReq = part$.get().request;
    const review = createInputRequestPlanReview(inputReq, planReview);
    opts.sink([review]);
    let inputCompleted = false;
    let latestResult = convertProtocolPlanReviewResult(planReview, ChatInputResponseKind.Accept, inputReq.answers);
    let planReviewCleared = false;
    const clearPlanReview = () => {
      if (planReviewCleared) {
        return;
      }
      planReviewCleared = true;
      this._chatWidgetService.getWidgetBySessionResource(opts.sessionResource)?.input.clearPlanReview(void 0, inputReq.id);
    };
    store.add(autorun((reader) => {
      const part = part$.read(reader);
      if (part.response === void 0) {
        return;
      }
      inputCompleted = true;
      latestResult = convertProtocolPlanReviewResult(planReview, part.response, part.request.answers);
      review.data = latestResult;
      review.isUsed = true;
      review.draftFeedback = void 0;
      review.draftCollapsed = void 0;
      void review.completion.complete(latestResult);
      clearPlanReview();
    }));
    review.completion.p.then((result) => {
      if (store.isDisposed || inputCompleted) {
        return;
      }
      const completion = result ? convertPlanReviewResult(planReview, result) : { response: ChatInputResponseKind.Cancel };
      this._config.connection.dispatch(opts.chatURI, {
        type: ActionType.ChatInputCompleted,
        requestId: inputReq.id,
        ...completion
      });
    });
    if (opts.cancellationToken.isCancellationRequested) {
      review.dismiss();
    } else {
      const tokenListener = opts.cancellationToken.onCancellationRequested(() => review.dismiss());
      review.completion.p.finally(() => tokenListener.dispose());
    }
    store.add(toDisposable(() => {
      if (!review.isUsed) {
        if (inputCompleted) {
          review.data = latestResult;
          review.isUsed = true;
          review.draftFeedback = void 0;
          review.draftCollapsed = void 0;
          void review.completion.complete(latestResult);
        } else {
          review.dismiss();
        }
      }
      clearPlanReview();
    }));
  }
  /**
   * Handle a URL-style {@link ChatInputRequest} by rendering a
   * {@link ChatElicitationRequestPart} that prompts the user to open the
   * URL. Clicking the accept button opens the URL via {@link IOpenerService}
   * and dispatches `ChatInputCompleted` with `Accept`; reject dispatches
   * `Decline`; abandonment / cancellation dispatches `Cancel`.
   */
  _setupUrlInputRequest(responsePart$, url, store, opts) {
    const inputReq = responsePart$.get().request;
    let completionDispatched = false;
    let completedFromServer = false;
    const settle = (response) => {
      if (completionDispatched || completedFromServer) {
        return;
      }
      completionDispatched = true;
      this._config.connection.dispatch(opts.chatURI, {
        type: ActionType.ChatInputCompleted,
        requestId: inputReq.id,
        response
      });
    };
    const presentation = getUrlInputRequestPresentation(inputReq, url);
    const part = new ChatElicitationRequestPart(
      localize("agentHost.elicit.url.title", "Authorization Required"),
      presentation.message,
      "",
      localize("agentHost.elicit.url.open", "Open {0}", presentation.authority),
      localize("agentHost.elicit.url.cancel", "Cancel"),
      async () => {
        try {
          const opened = await this._openerService.open(url, { allowCommands: false });
          if (opened) {
            settle(ChatInputResponseKind.Accept);
            return ElicitationState.Accepted;
          }
          settle(ChatInputResponseKind.Decline);
          return ElicitationState.Rejected;
        } catch {
          settle(ChatInputResponseKind.Decline);
          return ElicitationState.Rejected;
        }
      },
      async () => {
        settle(ChatInputResponseKind.Decline);
        return ElicitationState.Rejected;
      }
    );
    opts.sink([part]);
    store.add(autorun((reader) => {
      const response = responsePart$.read(reader).response;
      if (response === void 0) {
        return;
      }
      completedFromServer = true;
      part.state.set(response === ChatInputResponseKind.Accept ? ElicitationState.Accepted : ElicitationState.Rejected, void 0);
      part.hide();
    }));
    if (opts.cancellationToken.isCancellationRequested) {
      settle(ChatInputResponseKind.Cancel);
      part.hide();
    } else {
      const tokenListener = opts.cancellationToken.onCancellationRequested(() => {
        settle(ChatInputResponseKind.Cancel);
        part.hide();
      });
      store.add(toDisposable(() => tokenListener.dispose()));
    }
    store.add(toDisposable(() => {
      settle(ChatInputResponseKind.Cancel);
      part.hide();
    }));
  }
  /**
   * Synchronizes PTY and non-PTY terminal content, including the live-to-retained output handoff, and updates invocation metadata.
   */
  _reviveTerminalIfNeeded(invocation, tc, backendSession, outputTerminalAttachment) {
    if (tc.status !== ToolCallStatus.Running && tc.status !== ToolCallStatus.Completed && tc.status !== ToolCallStatus.PendingResultConfirmation) {
      return;
    }
    const terminalContent = getTerminalContent(tc.content);
    const terminalUri = terminalContent?.resource;
    const toolInput = getInlineToolInput(tc.toolInput);
    if (!terminalContent || !terminalUri || !toolInput) {
      return;
    }
    invocation.presentation = void 0;
    const sessionId = makeAhpTerminalToolSessionId(terminalUri, backendSession);
    const terminalCommandUri = URI.parse(terminalUri);
    const isPty = terminalContent.isPty !== false;
    const terminalInstance = isPty ? this._ensureTerminalInstance(terminalUri, sessionId) : void 0;
    const hasRetainedNonPtySnapshot = tc.status === ToolCallStatus.Completed && !isPty && terminalContent.result?.exitCode !== void 0 && terminalContent.result.preview !== void 0;
    if (hasRetainedNonPtySnapshot) {
      outputTerminalAttachment.disposable.clear();
      outputTerminalAttachment.sessionId = void 0;
    } else if (!isPty && outputTerminalAttachment.sessionId !== sessionId) {
      outputTerminalAttachment.disposable.value = this._agentHostTerminalService.attachOutputTerminal(this._config.connection, terminalCommandUri, sessionId);
      outputTerminalAttachment.sessionId = sessionId;
    }
    const existing = invocation.toolSpecificData?.kind === "terminal" ? invocation.toolSpecificData : void 0;
    const identityChanged = !!existing && (existing.commandLine.original !== toolInput || existing.terminalToolSessionId !== sessionId || existing.terminalCommandUri?.toString() !== terminalCommandUri.toString());
    if (!existing || identityChanged) {
      invocation.toolSpecificData = {
        ...existing,
        kind: "terminal",
        commandLine: { original: toolInput },
        language: "shellscript",
        terminalToolSessionId: sessionId,
        terminalCommandUri,
        isPty,
        terminalCommandId: identityChanged ? void 0 : existing?.terminalCommandId,
        terminalCommandOutput: identityChanged ? void 0 : existing?.terminalCommandOutput,
        terminalCommandState: identityChanged ? void 0 : existing?.terminalCommandState,
        terminalTheme: identityChanged ? void 0 : existing?.terminalTheme
      };
      invocation.notifyToolSpecificDataChanged();
    }
    const current = invocation.toolSpecificData?.kind === "terminal" ? invocation.toolSpecificData : void 0;
    if (!terminalInstance || current?.terminalCommandId) {
      if (terminalInstance) {
        void terminalInstance.catch((error) => this._logService.error(`[AgentHost] Failed to revive terminal '${terminalUri}'`, error));
      }
      return;
    }
    void terminalInstance.then(() => {
      const current2 = invocation.toolSpecificData?.kind === "terminal" ? invocation.toolSpecificData : void 0;
      if (!current2 || current2.terminalToolSessionId !== sessionId || current2.terminalCommandId) {
        return;
      }
      const source = this._terminalChatService.getAhpCommandSource(sessionId);
      const command = source?.executingCommandObject ?? source?.commands[source.commands.length - 1];
      if (command?.id) {
        invocation.toolSpecificData = { ...current2, terminalCommandId: command.id };
        invocation.notifyToolSpecificDataChanged();
      }
    }, (error) => this._logService.error(`[AgentHost] Failed to revive terminal '${terminalUri}'`, error));
  }
  // ---- Subagent child session observation ---------------------------------
  /**
   * Enriches serialized history with inner tool calls from subagent child
   * sessions. For each subagent tool call found in the history, subscribes
   * to the corresponding child session and appends its inner tool calls
   * (with `subAgentInvocationId` set) to the response parts.
   */
  async _enrichHistoryWithSubagentCalls(history, parentSession, sessionResource, sessionState, observations) {
    const parentSessionStr = parentSession.toString();
    const parentToolCalls = /* @__PURE__ */ new Map();
    for (const turn of sessionState.turns) {
      for (const responsePart of turn.responseParts) {
        if (responsePart.kind === ResponsePartKind.ToolCall) {
          parentToolCalls.set(responsePart.toolCall.toolCallId, responsePart.toolCall);
        }
      }
    }
    const subagentChats = new Map(sessionState.chats.flatMap(
      (chat) => chat.origin?.kind === ChatOriginKind.Tool ? [[chat.origin.toolCallId, chat]] : []
    ));
    const subagentInsertions = [];
    for (const item of history) {
      if (item.type !== "response") {
        continue;
      }
      for (let i = 0; i < item.parts.length; i++) {
        const part = item.parts[i];
        if (part.kind !== "toolInvocationSerialized") {
          continue;
        }
        const subagentChat = subagentChats.get(part.toolCallId);
        if (subagentChat) {
          const existing = part.toolSpecificData?.kind === "subagent" ? part.toolSpecificData : void 0;
          const parentToolCall = parentToolCalls.get(part.toolCallId);
          const taskDescription = parentToolCall ? readToolCallMeta(parentToolCall).subagentDescription?.trim() : void 0;
          part.toolSpecificData = {
            ...existing,
            kind: "subagent",
            description: taskDescription || subagentChat.title || existing?.description || (typeof part.invocationMessage === "string" ? part.invocationMessage : part.invocationMessage.value),
            chatResource: subagentChat.resource.toString()
          };
        }
        if (part.toolSpecificData?.kind === "subagent") {
          const childChatUri = resolveRestoredSubagentChatResource(
            parentSessionStr,
            part.toolCallId,
            subagentChat?.resource.toString(),
            part.toolSpecificData.chatResource
          );
          part.toolSpecificData.chatResource = childChatUri;
          subagentInsertions.push({ item, index: i, toolCallId: part.toolCallId, childChatUri });
        }
      }
    }
    if (subagentInsertions.length === 0) {
      return;
    }
    const childStateByUri = /* @__PURE__ */ new Map();
    const getChildState = (childChatUri) => {
      let existing = childStateByUri.get(childChatUri);
      if (!existing) {
        existing = this._loadSubagentState(parentSessionStr, childChatUri).then((state) => state ? observations.add(state) : void 0);
        childStateByUri.set(childChatUri, existing);
      }
      return existing;
    };
    const enrichedInsertions = await Promise.all(subagentInsertions.map(async ({ item, index, toolCallId, childChatUri }) => {
      try {
        const observedState = await getChildState(childChatUri);
        const childState = observedState?.getState();
        let parentPart = item.parts[index];
        if (childState) {
          this._applySubagentUsageToHistoryPart(parentPart, sessionResource, childState);
        }
        const parentToolCall = parentToolCalls.get(toolCallId);
        if (childState?.activeTurn && parentToolCall && parentPart.kind === "toolInvocationSerialized") {
          const serialized = parentPart;
          const invocation = toolCallStateToInvocation(parentToolCall, void 0, parentSession, this._config.connectionAuthority);
          finalizeToolInvocation(invocation, parentToolCall, parentSession, this._config.connectionAuthority);
          invocation.presentation = serialized.presentation;
          if (serialized.toolSpecificData?.kind === "subagent") {
            invocation.toolSpecificData = serialized.toolSpecificData;
          }
          item.parts[index] = invocation;
          parentPart = invocation;
        }
        const innerParts = childState ? this._getSubagentInnerParts(childChatUri, toolCallId, childState) : [];
        if (observedState && childState && (parentPart instanceof ChatToolInvocation || innerParts.some((part) => part instanceof ChatToolInvocation))) {
          observations.add(observedState.onDidChange(() => {
            const latestState = observedState.getState();
            if (latestState) {
              this._refreshRestoredSubagentParts(parentPart, innerParts, sessionResource, childChatUri, latestState);
            }
          }));
        }
        return { item, index, innerParts };
      } catch (err) {
        this._logService.warn(`[AgentHost] Failed to enrich history with subagent calls: ${childChatUri}`, err);
        return { item, index, innerParts: [] };
      }
    }));
    for (const { item, index, innerParts } of enrichedInsertions.sort((a, b) => b.index - a.index)) {
      if (innerParts.length > 0) {
        item.parts.splice(index + 1, 0, ...innerParts);
      }
    }
  }
  async _loadSubagentState(parentSessionUri, childChatUri) {
    const childSub = this._ensureSessionSubscription(parentSessionUri);
    try {
      await this._whenSubscriptionHydrated(childSub, CancellationToken.None);
      if (childSub.value instanceof Error) {
        throw childSub.value;
      }
      const childChatSub = this._ensureChatSubscription(parentSessionUri, childChatUri);
      await this._whenSubscriptionHydrated(childChatSub, CancellationToken.None);
      if (childChatSub.value instanceof Error) {
        throw childChatSub.value;
      }
      const store = new DisposableStore();
      const onDidChange = store.add(new Emitter());
      store.add(childSub.onDidChange(() => onDidChange.fire()));
      store.add(childChatSub.onDidChange(() => onDidChange.fire()));
      store.add(toDisposable(() => this._releaseChatSessionSubscriptions(parentSessionUri, childChatUri)));
      return {
        onDidChange: onDidChange.event,
        getState: () => this._getSessionState(parentSessionUri, childChatUri),
        dispose: () => store.dispose()
      };
    } catch (error) {
      this._releaseChatSessionSubscriptions(parentSessionUri, childChatUri);
      throw error;
    }
  }
  /**
   * Writes a subagent's accumulated cost (AIC) and model — summed across its
   * child session's turns — onto its serialized subagent tool call so the
   * hover survives a reload. Mirrors the live observers in
   * {@link _setupServerToolCall}.
   */
  _applySubagentUsageToHistoryPart(part, sessionResource, childState) {
    if (part.kind !== "toolInvocationSerialized" && part.kind !== "toolInvocation" || part.toolSpecificData?.kind !== "subagent") {
      return;
    }
    let credits = 0;
    let modelName;
    const turns = childState.activeTurn && !childState.turns.some((turn) => turn.id === childState.activeTurn?.id) ? [...childState.turns, childState.activeTurn] : childState.turns;
    for (const turn of turns) {
      const turnCredits = usageInfoToChatUsage(turn.usage)?.copilotCredits;
      if (typeof turnCredits === "number") {
        credits += turnCredits;
      }
      const turnModelId = this._toLanguageModelId(sessionResource, turn.usage?.model);
      const turnModelName = this._getLanguageModelDisplayName(turnModelId);
      if (turnModelName) {
        modelName = turnModelName;
      }
    }
    if (credits > 0) {
      part.toolSpecificData.credits = credits;
    }
    if (modelName && !part.toolSpecificData.modelName) {
      part.toolSpecificData.modelName = modelName;
    }
    const timing = getSubagentTiming(childState);
    part.toolSpecificData.isActive = !!childState.activeTurn;
    part.toolSpecificData.startedAt = timing.startedAt;
    part.toolSpecificData.duration = timing.duration;
    if (part instanceof ChatToolInvocation) {
      part.notifyToolSpecificDataChanged();
    }
  }
  _refreshRestoredSubagentParts(parentPart, innerParts, sessionResource, childChatUri, childState) {
    this._applySubagentUsageToHistoryPart(parentPart, sessionResource, childState);
    const toolCalls = /* @__PURE__ */ new Map();
    const turns = childState.activeTurn && !childState.turns.some((turn) => turn.id === childState.activeTurn?.id) ? [...childState.turns, childState.activeTurn] : childState.turns;
    for (const turn of turns) {
      for (const responsePart of turn.responseParts) {
        if (responsePart.kind === ResponsePartKind.ToolCall) {
          toolCalls.set(responsePart.toolCall.toolCallId, responsePart.toolCall);
        }
      }
    }
    const childResource = URI.parse(childChatUri);
    for (const part of innerParts) {
      if (!(part instanceof ChatToolInvocation)) {
        continue;
      }
      const toolCall = toolCalls.get(part.toolCallId);
      if (!toolCall) {
        continue;
      }
      if ((toolCall.status === ToolCallStatus.Completed || toolCall.status === ToolCallStatus.Cancelled) && !IChatToolInvocation.isComplete(part)) {
        finalizeToolInvocation(part, toolCall, childResource, this._config.connectionAuthority);
      } else if (toolCall.status === ToolCallStatus.Running) {
        updateRunningToolSpecificData(part, toolCall, childResource, this._config.connectionAuthority);
        part.notifyToolSpecificDataChanged();
      }
    }
  }
  _getSubagentInnerParts(childSessionUri, toolCallId, childState) {
    const innerParts = [];
    const turns = childState.activeTurn && !childState.turns.some((turn) => turn.id === childState.activeTurn?.id) ? [...childState.turns, childState.activeTurn] : childState.turns;
    for (const turn of turns) {
      for (const rp of turn.responseParts) {
        if (rp.kind === ResponsePartKind.ToolCall) {
          const tc = rp.toolCall;
          if (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Cancelled) {
            const completedTc = tc;
            const fileEditParts = completedToolCallToEditParts(completedTc, this._config.connectionAuthority);
            const serialized = completedToolCallToSerialized(completedTc, toolCallId, URI.parse(childSessionUri), this._config.connectionAuthority);
            if (fileEditParts.length > 0) {
              serialized.presentation = ToolInvocationPresentation.Hidden;
            }
            innerParts.push(serialized);
            innerParts.push(...fileEditParts);
          } else {
            innerParts.push(toolCallStateToInvocation(tc, toolCallId, URI.parse(childSessionUri), this._config.connectionAuthority));
          }
        }
      }
    }
    return innerParts;
  }
  /**
   * Subscribes to a child subagent session and forwards its tool calls
   * as progress parts into the parent session's response, with
   * `subAgentInvocationId` set so the renderer groups them under the parent
   * subagent widget.
   *
   * Implementation: builds a per-turn-id keyed observation over the child
   * session's `turns` and `activeTurn`. Each turn id discovered gets its
   * own {@link _observeTurn} instance running in subagent mode (which skips
   * markdown/reasoning/input-request emission and tags tool calls with the
   * parent tool call id). Each per-turn observer self-disposes when its
   * turn reaches a terminal state; the outer observation is torn down when
   * the caller disposes `disposables`.
   */
  _observeSubagentSession(sessionResource, parentSession, parentToolCallId, childChatUri, rootInvocationId, parentInvocation, emitProgress, disposables, subagentContext, perInvocationCreditsAccumulator, perInvocationModel) {
    const parentSessionUri = parentSession.toString();
    const cts = new CancellationTokenSource();
    disposables.add(toDisposable(() => cts.dispose(true)));
    disposables.add(toDisposable(() => {
      if (parentInvocation.toolSpecificData?.kind === "subagent" && parentInvocation.toolSpecificData.isActive) {
        parentInvocation.toolSpecificData.isActive = false;
        parentInvocation.notifyToolSpecificDataChanged();
      }
    }));
    try {
      const childSub = this._ensureSessionSubscription(parentSessionUri);
      const childChatSub = this._ensureChatSubscription(parentSessionUri, childChatUri);
      disposables.add(toDisposable(() => this._releaseChatSessionSubscriptions(parentSessionUri, childChatUri)));
      const childSessionState$ = observableFromSubscription(this, childSub);
      const childChatState$ = observableFromSubscription(this, childChatSub);
      const childState$ = derived((reader) => {
        const session = childSessionState$.read(reader);
        if (!session) {
          return void 0;
        }
        return mergeSessionWithDefaultChat(session, childChatState$.read(reader));
      });
      disposables.add(autorun((reader) => {
        const state = childState$.read(reader);
        if (!state || !state.activeTurn && state.turns.length === 0) {
          return;
        }
        const isActive = !!state.activeTurn;
        if (parentInvocation.toolSpecificData?.kind === "subagent") {
          const timing = getSubagentTiming(state);
          const lastResponsePart = state.activeTurn?.responseParts.at(-1);
          const activity = lastResponsePart?.kind === ResponsePartKind.Markdown ? "markdown" : lastResponsePart?.kind === ResponsePartKind.Reasoning ? "reasoning" : void 0;
          const fallbackDuration = !isActive && timing.duration === void 0 && parentInvocation.toolSpecificData.isActive && parentInvocation.toolSpecificData.startedAt !== void 0 ? Date.now() - parentInvocation.toolSpecificData.startedAt : timing.duration;
          if (parentInvocation.toolSpecificData.isActive !== isActive || parentInvocation.toolSpecificData.activity !== activity || parentInvocation.toolSpecificData.startedAt !== timing.startedAt || parentInvocation.toolSpecificData.duration !== fallbackDuration) {
            parentInvocation.toolSpecificData.isActive = isActive;
            if (activity) {
              parentInvocation.toolSpecificData.activity = activity;
            } else {
              delete parentInvocation.toolSpecificData.activity;
            }
            parentInvocation.toolSpecificData.startedAt = timing.startedAt;
            parentInvocation.toolSpecificData.duration = fallbackDuration;
            parentInvocation.notifyToolSpecificDataChanged();
          }
        }
      }));
      const childTurnIds$ = derived((reader) => {
        const state = childState$.read(reader);
        if (!state) {
          return [];
        }
        const ids = state.turns.map((t) => ({ id: t.id }));
        const activeId = state.activeTurn?.id;
        if (activeId !== void 0 && !state.turns.some((t) => t.id === activeId)) {
          ids.push({ id: activeId });
        }
        return ids;
      });
      disposables.add(autorunPerKeyedItem(
        childTurnIds$,
        (t) => t.id,
        (turnId, _t$, turnStore) => {
          turnStore.add(this._observeTurn({
            backendSession: parentSession,
            sessionResource,
            chatURI: childChatUri,
            turnId,
            sink: emitProgress,
            cancellationToken: cts.token,
            subAgentInvocationId: rootInvocationId,
            subAgentCreditsAccumulator: perInvocationCreditsAccumulator,
            subAgentModelObservable: perInvocationModel
          }));
        }
      ));
    } catch (err) {
      subagentContext.observations.deleteAndDispose(parentToolCallId);
      this._logService.warn(`[AgentHost] Failed to subscribe to subagent chat: ${childChatUri}`, err);
    }
  }
  // ---- Reconnection to active turn ----------------------------------------
  /**
   * Wires up an ongoing state listener that streams incremental progress
   * from an already-running turn into the chat session's progressObs.
   * This is the reconnection counterpart of {@link _handleTurn}, which
   * handles newly-initiated turns.
   */
  _reconnectToActiveTurn(backendSession, turnId, chatSession, initialProgress, initialResponsePartCount) {
    const sessionKey = backendSession.toString();
    const chatURI = this._getChatURI(chatSession.sessionResource);
    const adoptInvocations = /* @__PURE__ */ new Map();
    for (const item of initialProgress) {
      if (item instanceof ChatToolInvocation) {
        adoptInvocations.set(item.toolCallId, item);
      }
    }
    const seedEmittedLengths = /* @__PURE__ */ new Map();
    const currentState = this._getSessionState(sessionKey, chatURI);
    if (currentState?.activeTurn) {
      for (const rp of currentState.activeTurn.responseParts) {
        if (rp.kind === ResponsePartKind.Markdown || rp.kind === ResponsePartKind.Reasoning) {
          seedEmittedLengths.set(rp.id, rp.content.length);
        }
      }
    }
    const cts = new CancellationTokenSource();
    const reconnectStore = chatSession.registerDisposable(new DisposableStore());
    reconnectStore.add(toDisposable(() => cts.dispose(true)));
    reconnectStore.add(this._observeTurn({
      backendSession,
      sessionResource: chatSession.sessionResource,
      chatURI,
      turnId,
      sink: (parts) => chatSession.appendProgress(parts),
      cancellationToken: cts.token,
      adoptInvocations,
      seedEmittedLengths,
      initialResponsePartCount,
      onTurnEnded: () => {
        chatSession.complete();
        reconnectStore.dispose();
      }
    }));
  }
  // ---- File edit routing ---------------------------------------------------
  /**
   * Ensures the chat model has a snapshot controller bound (creating one
   * via our registered editing-session provider if needed) and returns it.
   * Hydrates the controller from any pending history turns on first access.
   */
  _ensureSnapshotController(sessionResource) {
    const chatModel = this._chatService.getSession(sessionResource);
    if (!chatModel) {
      return void 0;
    }
    if (!chatModel.editingSession) {
      chatModel.startEditingSession();
    }
    const editingSession = chatModel.editingSession;
    if (!(editingSession instanceof AgentHostSnapshotController)) {
      return void 0;
    }
    const pendingTurns = this._pendingHistoryTurns.get(sessionResource);
    if (pendingTurns) {
      this._pendingHistoryTurns.delete(sessionResource);
      for (const turn of pendingTurns) {
        editingSession.ensureRequestCheckpoint(turn.id);
        for (const rp of turn.responseParts) {
          if (rp.kind === ResponsePartKind.ToolCall) {
            editingSession.addToolCallEdits(turn.id, rp.toolCall);
          }
        }
      }
    }
    return editingSession;
  }
  /**
   * Records snapshot data for a completed tool call (so restore-snapshot
   * works) and returns the {@link IChatExternalEdit} progress parts to
   * render the per-file edit pills.
   */
  _hydrateFileEdits(sessionResource, requestId, tc) {
    const controller = this._ensureSnapshotController(sessionResource);
    controller?.addToolCallEdits(requestId, tc);
    if (tc.status !== ToolCallStatus.Completed) {
      return [];
    }
    return completedToolCallToEditParts(tc, this._config.connectionAuthority);
  }
  // ---- Session resolution -------------------------------------------------
  /**
   * Attaches to an existing server-side terminal via the agent host
   * terminal service and registers it with the terminal chat service.
   *
   * Returns the terminal instance created or reused by the terminal service.
   */
  _ensureTerminalInstance(terminalUri, terminalToolSessionId) {
    return this._agentHostTerminalService.reviveTerminal(
      this._config.connection,
      URI.parse(terminalUri),
      terminalToolSessionId
    );
  }
  /** Maps a UI session resource to a backend provider URI. */
  _resolveSessionUri(sessionResource) {
    const provisionalSession = this._provisionalService.get(sessionResource);
    if (provisionalSession) {
      return provisionalSession;
    }
    const rawId = sessionResource.path.substring(1);
    return AgentSession.uri(this._config.backendSessionScheme ?? this._config.provider, rawId);
  }
  _isNewSessionResource(sessionResource) {
    return !!this._config.isNewSession?.(sessionResource) || this._workingDirectoryResolver.isNewSession(sessionResource);
  }
  /**
   * Forks a session at the given request point by creating a new backend
   * session with the `fork` parameter. Returns an {@link IChatSessionItem}
   * pointing to the newly created session.
   */
  async _forkSession(sessionResource, backendSession, request, token) {
    if (token.isCancellationRequested) {
      throw new Error("Cancelled");
    }
    const protocolState = this._getSessionState(backendSession.toString());
    let turnIndex;
    if (request) {
      const requestIdx = protocolState?.turns.findIndex((t) => t.id === request.id);
      if (requestIdx === void 0 || requestIdx < 0) {
        throw new Error(`Cannot fork: turn for request ${request.id} not found in protocol state`);
      }
      turnIndex = requestIdx - 1;
      if (turnIndex < 0) {
        throw new Error("Cannot fork: cannot fork before the first request");
      }
    } else if (protocolState?.turns.length) {
      turnIndex = protocolState.turns.length - 1;
    }
    if (turnIndex === void 0) {
      throw new Error("Cannot fork: no turns to fork from");
    }
    const turnId = protocolState.turns[turnIndex].id;
    if (!protocolState.defaultChat) {
      throw new Error("Cannot fork: source session has no default chat");
    }
    const chatModel = this._chatService.getSession(sessionResource);
    const forkedSession = await this._createAndSubscribe(sessionResource, lastTurnModelSelection(protocolState), {
      session: backendSession,
      chat: URI.parse(protocolState.defaultChat),
      turnIndex,
      turnId
    });
    const forkedRawId = AgentSession.id(forkedSession);
    const forkedResource = URI.from({ scheme: this._config.sessionType, path: `/${forkedRawId}` });
    const now = Date.now();
    const forkedTitle = this._getSessionState(forkedSession.toString())?.title;
    const forkedLabel = forkedTitle || chatModel?.title || localize("agentHost.forkedSessionLabel", "Forked Session");
    return {
      resource: forkedResource,
      label: forkedLabel,
      iconPath: getAgentSessionProviderIcon(this._config.sessionType),
      timing: { created: now, lastRequestStarted: now, lastRequestEnded: now }
    };
  }
  async _ensureRequiredAuthentication(model) {
    const agentInfo = this._getRootState()?.agents.find((a) => a.provider === this._config.provider);
    const protectedResources = agentInfo?.protectedResources ?? [];
    const allowSignedOutWhenUsable = this._configurationService.getValue(AgentHostAllowSignedOutWhenUsableSettingId) === true;
    if (modelRequiresAgentAuthentication(agentInfo, model, allowSignedOutWhenUsable) && this._config.resolveAuthentication) {
      const authenticated = await this._config.resolveAuthentication(protectedResources);
      if (!authenticated) {
        throw new Error(localize("agentHost.authRequired", "Authentication is required to start a session. Please sign in and try again."));
      }
    }
    return protectedResources;
  }
  /** Creates a new backend session and subscribes to its state. */
  async _createAndSubscribe(sessionResource, model, fork, config, importConversation, onFailureStage) {
    const workingDirectories = this._resolveRequestedWorkingDirectories(sessionResource);
    const requestedSession = fork ? void 0 : this._resolveSessionUri(sessionResource);
    this._logService.trace(`[AgentHost] Creating new session, model=${model?.id ?? "(default)"}, provider=${this._config.provider}${fork ? `, fork from ${fork.session.toString()} at index ${fork.turnIndex}` : ""}`);
    onFailureStage?.("authentication");
    const protectedResources = await this._ensureRequiredAuthentication(model);
    const activeClientEntry = this._ensureActiveClientEntry(sessionResource);
    if (activeClientEntry) {
      await activeClientEntry.whenSettled();
    }
    const activeClient = this._getCurrentActiveClient(sessionResource);
    const progressToken = generateUuid();
    let session;
    onFailureStage?.("createSession");
    try {
      session = await this._config.connection.createSession({
        session: requestedSession,
        _meta: this._provisionalService.getInitialSessionMetadata(),
        model,
        provider: this._config.provider,
        workingDirectories,
        fork,
        config,
        importConversation,
        activeClient,
        progressToken
      });
    } catch (err) {
      if (this._isAuthRequiredError(err) && this._config.resolveAuthentication) {
        onFailureStage?.("authentication");
        this._logService.info("[AgentHost] Authentication required, prompting user...");
        const authenticated = await this._config.resolveAuthentication(protectedResources);
        if (authenticated) {
          onFailureStage?.("createSession");
          session = await this._config.connection.createSession({
            session: requestedSession,
            _meta: this._provisionalService.getInitialSessionMetadata(),
            model,
            provider: this._config.provider,
            workingDirectories,
            fork,
            config,
            importConversation,
            activeClient,
            progressToken
          });
        } else {
          throw new Error(localize("agentHost.authRequired", "Authentication is required to start a session. Please sign in and try again."));
        }
      } else {
        throw err;
      }
    }
    if (requestedSession && !isEqual(session, requestedSession)) {
      throw new Error(`Agent host returned unexpected session URI. Expected ${requestedSession.toString()}, got ${session.toString()}`);
    }
    this._logService.trace(`[AgentHost] Created session: ${session.toString()}`);
    onFailureStage?.("subscribeSession");
    const newSub = this._ensureSessionSubscription(session.toString());
    this._configureActiveClientReconciliation(sessionResource, session, newSub);
    if (!this._getSessionState(session.toString())) {
      await this._whenSubscriptionHydrated(newSub, CancellationToken.None);
    }
    const rawState = this._requireRawSessionState(session.toString());
    const chatURI = this._resolveChatUriFromState(sessionResource, rawState);
    this._setChatURI(sessionResource, chatURI);
    const chatSub = this._ensureChatSubscription(session.toString(), chatURI);
    if (!fork) {
      this._activeSessions.get(sessionResource)?.setStateSubscriptions(newSub, chatSub);
    }
    this._ensurePendingMessageSubscription(sessionResource, session);
    this._watchForServerInitiatedTurns(session, sessionResource);
    return session;
  }
  /**
   * Keeps chat model and protocol pending messages synchronized in both directions.
   * No-ops if already subscribed.
   */
  _ensurePendingMessageSubscription(sessionResource, backendSession) {
    if (this._pendingMessageSubscriptions.has(sessionResource)) {
      return;
    }
    const chatModel = this._chatService?.getSession(sessionResource);
    if (chatModel) {
      const store = new DisposableStore();
      this._pendingMessageSubscriptions.set(sessionResource, store);
      this._applyRemotePendingMessages(sessionResource, backendSession);
      store.add(chatModel.onDidChangePendingRequests(() => {
        this._syncPendingMessages(sessionResource, backendSession);
      }));
      this._syncPendingMessages(sessionResource, backendSession);
      const sessionStr = backendSession.toString();
      const chatURI = this._chatURIsBySessionResource.get(sessionResource);
      if (chatURI) {
        const onRemoteChange = () => this._applyRemotePendingMessages(sessionResource, backendSession);
        store.add(this._ensureSessionSubscription(sessionStr).onDidChange(onRemoteChange));
        store.add(this._ensureChatSubscription(sessionStr, chatURI).onDidChange(onRemoteChange));
      }
      return;
    }
    this._pendingMessageSubscriptions.set(sessionResource, this._chatService.onDidCreateModel((model) => {
      if (!isEqual(model.sessionResource, sessionResource)) {
        return;
      }
      this._pendingMessageSubscriptions.deleteAndDispose(sessionResource);
      this._ensurePendingMessageSubscription(sessionResource, backendSession);
    }));
  }
  _ensureDraftSyncSubscription(sessionResource, backendSession, chatKey) {
    if (this._draftSyncSubscriptions.has(sessionResource)) {
      return;
    }
    const store = new DisposableStore();
    this._draftSyncSubscriptions.set(sessionResource, store);
    this._acquireOrWaitForSession(sessionResource, store).then((chatModel) => {
      if (!chatModel || store.isDisposed) {
        return;
      }
      this._installDraftSync(sessionResource, chatModel, backendSession, chatKey, store);
    }, (err) => {
      if (!store.isDisposed) {
        this._logService.error(`[AgentHost] Failed to wait for chat model for draft sync: ${sessionResource.toString()}`, err);
      }
    });
  }
  async _acquireOrWaitForSession(sessionResource, owner) {
    const existing = this._chatService.getSession(sessionResource);
    if (existing) {
      return existing;
    }
    const waitStore = owner.add(new DisposableStore());
    try {
      return await new Promise((resolve) => {
        waitStore.add(toDisposable(() => resolve(void 0)));
        waitStore.add(this._chatService.onDidCreateModel((model) => {
          if (isEqual(model.sessionResource, sessionResource)) {
            resolve(model);
          }
        }));
      });
    } finally {
      waitStore.dispose();
    }
  }
  _installDraftSync(sessionResource, chatModel, backendSession, chatKey, store) {
    const inputModel = chatModel.inputModel;
    if (!inputModel) {
      return;
    }
    const delayer = store.add(new Delayer(AgentHostSessionHandler.DRAFT_SYNC_DEBOUNCE_MS));
    const chatSubscription = this._ensureChatSubscription(backendSession.toString(), chatKey);
    const readRemoteDraft = () => {
      const value = chatSubscription.value;
      return value && !(value instanceof Error) ? value.draft : void 0;
    };
    let syncedDraft = readRemoteDraft();
    let lastRemoteDraft = syncedDraft;
    let appliedRemoteDraft;
    const syncDraft = (state) => {
      if (state?.origin === ChatInputStateOrigin.Remote) {
        return;
      }
      const draft = this._inputStateToDraft(sessionResource, state);
      if (equals(syncedDraft, draft)) {
        return;
      }
      if (appliedRemoteDraft && sameDraftUserContent(draft, appliedRemoteDraft)) {
        syncedDraft = draft;
        return;
      }
      appliedRemoteDraft = void 0;
      syncedDraft = draft;
      this._config.connection.dispatch(chatKey, {
        type: ActionType.ChatDraftChanged,
        draft
      });
    };
    store.add(autorun((reader) => {
      const state = inputModel.state.read(reader);
      delayer.trigger(() => syncDraft(state)).catch(() => {
      });
    }));
    store.add(chatSubscription.onDidChange(() => {
      const remoteDraft = readRemoteDraft();
      if (remoteDraft === lastRemoteDraft) {
        return;
      }
      lastRemoteDraft = remoteDraft;
      if (equals(syncedDraft, remoteDraft)) {
        return;
      }
      const localDraft = this._inputStateToDraft(sessionResource, inputModel.state.get());
      if (!equals(syncedDraft, localDraft)) {
        return;
      }
      syncedDraft = remoteDraft;
      appliedRemoteDraft = remoteDraft;
      this._applyRemoteDraft(inputModel, sessionResource, remoteDraft);
    }));
    store.add(toDisposable(() => {
      delayer.cancel();
      syncDraft(inputModel.state.get());
    }));
  }
  /** Applies a remote draft without replacing local input state the protocol does not carry. */
  _applyRemoteDraft(inputModel, sessionResource, draft) {
    if (!draft) {
      inputModel.setState({
        inputText: "",
        selections: [],
        attachments: [],
        origin: ChatInputStateOrigin.Remote
      });
      return;
    }
    const serializedState = this._draftToInputState(sessionResource, draft);
    if (!serializedState) {
      return;
    }
    const state = reviveSerializableInputState(serializedState);
    const partialState = {
      inputText: state.inputText,
      selections: state.selections,
      attachments: state.attachments,
      mode: state.mode,
      origin: ChatInputStateOrigin.Remote
    };
    if (state.selectedModel) {
      partialState.selectedModel = state.selectedModel;
      partialState.modelConfiguration = state.modelConfiguration;
    }
    inputModel.setState(partialState);
  }
  _inputStateToDraft(sessionResource, state) {
    if (!state) {
      return void 0;
    }
    const model = this._createModelSelection(state.selectedModel?.identifier, state.modelConfiguration);
    const agentUri = state.mode.kind === ChatModeKind.Agent && state.mode.id !== ChatMode.Agent.id ? state.mode.id : void 0;
    const attachments = this._variableEntriesToAttachments(state.attachments, sessionResource, state.inputText, false);
    if (!state.inputText && !model && !agentUri && attachments.length === 0) {
      return void 0;
    }
    return {
      text: state.inputText,
      origin: { kind: MessageKind.User },
      ...attachments.length > 0 ? { attachments } : {},
      ...model ? { model } : {},
      ...agentUri ? { agent: { uri: agentUri } } : {}
    };
  }
  /**
   * Check if an error is an "authentication required" error.
   * Checks for the AHP_AUTH_REQUIRED error code when available,
   * with a message-based fallback for transports that don't preserve
   * structured error codes (e.g. ProxyChannel).
   */
  _isAuthRequiredError(err) {
    if (err instanceof ProtocolError && err.code === AHP_AUTH_REQUIRED) {
      return true;
    }
    if (err instanceof Error && err.message.includes("Authentication required")) {
      return true;
    }
    return false;
  }
  _createModelSelection(languageModelIdentifier, modelConfiguration) {
    const rawModelId = this._extractRawModelId(languageModelIdentifier);
    if (!rawModelId) {
      return void 0;
    }
    const config = {};
    for (const [key, value] of Object.entries(modelConfiguration ?? {})) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
        config[key] = value;
      }
    }
    return Object.keys(config).length > 0 ? { id: rawModelId, config } : { id: rawModelId };
  }
  _draftToInputState(sessionResource, draft) {
    if (!draft) {
      return void 0;
    }
    const modelId = this._toLanguageModelId(sessionResource, draft.model?.id);
    const metadata = modelId ? this._languageModelsService.lookupLanguageModel(modelId) : void 0;
    const variableData = messageAttachmentsToVariableData(draft.attachments, this._config.connectionAuthority, draft.text);
    const cursor = offsetToPosition(draft.text, draft.text.length);
    return {
      attachments: variableData?.variables ?? [],
      contrib: {},
      inputText: draft.text,
      mode: { id: draft.agent?.uri ?? ChatMode.Agent.id, kind: ChatModeKind.Agent },
      selectedModel: modelId && metadata ? {
        identifier: modelId,
        metadata,
        ...draft.model?.config ? { modelConfiguration: draft.model.config } : {}
      } : void 0,
      selections: [{
        selectionStartLineNumber: cursor.lineNumber,
        selectionStartColumn: cursor.column,
        positionLineNumber: cursor.lineNumber,
        positionColumn: cursor.column
      }]
    };
  }
  /**
   * Extracts the raw model id from a language-model service identifier.
   * E.g. "agent-host-copilot:claude-sonnet-4-20250514" → "claude-sonnet-4-20250514".
   * Foreign extension-host identifiers (`${vendor}/${id}`) are dropped so
   * the agent host falls back to its default model.
   */
  _extractRawModelId(languageModelIdentifier) {
    if (!languageModelIdentifier) {
      return void 0;
    }
    const prefix = this._config.sessionType + ":";
    if (languageModelIdentifier.startsWith(prefix)) {
      return languageModelIdentifier.substring(prefix.length);
    }
    if (languageModelIdentifier.includes("/")) {
      this._logService.warn(`[AgentHost] Dropping foreign model identifier '${languageModelIdentifier}' for session type '${this._config.sessionType}'; falling back to default model.`);
      return void 0;
    }
    return languageModelIdentifier;
  }
  _toLanguageModelId(sessionResource, rawModelId) {
    if (!rawModelId) {
      return void 0;
    }
    const prefix = `${getChatSessionType(sessionResource)}:`;
    return rawModelId.startsWith(prefix) ? rawModelId : `${prefix}${rawModelId}`;
  }
  _getLanguageModelDisplayName(modelIdentifier) {
    if (!modelIdentifier) {
      return void 0;
    }
    const metadata = this._languageModelsService.lookupLanguageModel(modelIdentifier);
    return metadata ? getLanguageModelDisplayNameWithProvider({ identifier: modelIdentifier, metadata }, this._languageModelsService) : void 0;
  }
  _getTurnResponseDetails(sessionResource, backendSession, turn) {
    const fallbackRawModelId = turn?.message?.model?.id ?? lastTurnModelSelection(this._getSessionState(backendSession.toString()))?.id;
    return this._createTurnModelLookup(sessionResource, fallbackRawModelId).toResponseDetails(turn?.usage?.model, turn?.usage);
  }
  /**
   * Builds a per-turn model lookup that namespaces raw AHP model ids into
   * chat-layer language-model ids and resolves human-readable display
   * names via the registered language-model providers (so the chat UI's
   * per-response footer can show e.g. "Claude Opus 4.7" instead of the
   * raw model id). `fallbackRawModelId` is used when a turn's
   * `usage?.model` is not yet set (e.g. older sessions or turns that
   * never reported usage).
   */
  _createTurnModelLookup(sessionResource, fallbackRawModelId) {
    const resolveRaw = (rawModelId) => rawModelId ?? fallbackRawModelId;
    const lookupRawModel = (rawModelId) => {
      const normalizedRaw = rawModelId?.replace(/-(\d+)$/, ".$1");
      for (const candidate of [rawModelId, normalizedRaw !== rawModelId ? normalizedRaw : void 0]) {
        const modelId = this._toLanguageModelId(sessionResource, candidate);
        if (!modelId) {
          continue;
        }
        const model = this._languageModelsService.lookupLanguageModel(modelId);
        if (model) {
          return { identifier: modelId, model, resolvedFromRaw: true };
        }
      }
      return void 0;
    };
    const lookupModel = (rawModelId) => {
      const rawModel = lookupRawModel(rawModelId);
      if (rawModel) {
        return rawModel;
      }
      const fallbackModelId = this._toLanguageModelId(sessionResource, fallbackRawModelId);
      if (fallbackModelId) {
        const model = this._languageModelsService.lookupLanguageModel(fallbackModelId);
        if (model) {
          return { identifier: fallbackModelId, model, resolvedFromRaw: false };
        }
      }
      return void 0;
    };
    return {
      toLanguageModelId: (rawModelId) => this._toLanguageModelId(sessionResource, resolveRaw(rawModelId)),
      toModelDisplayName: (rawModelId) => lookupRawModel(rawModelId)?.model.name,
      toResponseDetails: (rawModelId, usage) => {
        const resolved = lookupModel(rawModelId);
        const billedModelId = resolved && !resolved.resolvedFromRaw ? rawModelId : void 0;
        const responseModel = resolved ? {
          name: getLanguageModelDisplayNameWithProvider({ identifier: resolved.identifier, metadata: resolved.model }, this._languageModelsService),
          pricing: resolved.model.pricing
        } : void 0;
        return formatTurnResponseDetails(responseModel, billedModelId, usage);
      },
      toAutoModeResolution: (usage) => {
        const resolution = readUsageInfoMeta(usage).autoModeResolved;
        const resolved = resolution ? lookupModel(resolution.chosenModel) : void 0;
        const resolvedModelName = resolved?.resolvedFromRaw ? resolved.model.name : void 0;
        return usageInfoToAutoModeResolution(usage, resolvedModelName);
      }
    };
  }
  _resolveRequestedWorkingDirectory(sessionResource) {
    return this._config.resolveWorkingDirectory?.(sessionResource) ?? this._newSessionFolderService?.getFolder(sessionResource) ?? this._workingDirectoryResolver?.resolve(sessionResource) ?? this._newSessionFolderService?.getDefaultFolder() ?? this._workspaceContextService.getWorkspace().folders[0]?.uri;
  }
  /** `undefined` is preserved for createSession to let the host choose its working directories. */
  _resolveRequestedWorkingDirectories(sessionResource) {
    const primary = this._resolveRequestedWorkingDirectory(sessionResource);
    return computeWorkingDirectories(primary, this._workspaceContextService.getWorkspace().folders.map((folder) => folder.uri), this._getRootState(), this._config.provider);
  }
  /**
   * Scope roots always describe a concrete customization lookup. This differs
   * from `_resolveRequestedWorkingDirectories`: its `undefined` is protocol
   * meaningful and lets the host choose working directories for createSession.
   *
   * An existing session's roots are fixed at creation and persisted in its
   * state, so they are read from there rather than recomputed from the current
   * workspace — otherwise a single-folder session opened inside a multi-root
   * workspace would pick up the other workspace folders. New sessions have no
   * state yet, so they fall back to the workspace-derived set they will be
   * created with.
   */
  _resolveCustomizationScopeRoots(sessionResource) {
    if (!this._isNewSessionResource(sessionResource)) {
      const own = this._existingSessionWorkingDirectories(sessionResource);
      if (own !== void 0) {
        return own;
      }
    }
    return this._resolveRequestedWorkingDirectories(sessionResource) ?? [];
  }
  /**
   * The working directories an already-created session was started with, read
   * from its authoritative (hydrated) state.
   *
   * Returns `undefined` when the session's working directories are absent — no
   * hydrated state yet, or a session that inherits its directories — so callers
   * fall back to the workspace-derived set. An explicit empty set is
   * authoritative and returned as `[]`: a workspace-less session must not
   * inherit the current workspace's roots. This mirrors the host-side
   * `undefined` (inherit) vs `[]` (explicitly none) distinction.
   */
  _existingSessionWorkingDirectories(sessionResource) {
    const backendSession = this._resolveSessionUri(sessionResource);
    const dirs = this._getRawSessionState(backendSession.toString())?.workingDirectories;
    if (dirs === void 0) {
      return void 0;
    }
    return dirs.map((directory) => typeof directory === "string" ? URI.parse(directory) : directory);
  }
  /**
   * Ensures the workspace/folder the agent will run in is trusted before a
   * session is spawned. Returns `false` if the user declines.
   *
   * When the agent runs inside the currently open workspace (editor window),
   * gate on workspace trust to match how extension-host chat is gated. When
   * it targets a standalone folder outside the open workspace (Agents window
   * per-session folders), gate on that folder's trust instead. Both request
   * helpers resolve immediately when the target is already trusted, so this
   * never double-prompts.
   */
  async _ensureWorkspaceTrust(sessionResource) {
    const message = localize("agentHost.workspaceTrust", "AI features are currently only supported in trusted workspaces.");
    const workingDirectory = this._resolveRequestedWorkingDirectory(sessionResource);
    if (!workingDirectory || this._workspaceContextService.getWorkspaceFolder(workingDirectory)) {
      return !!await this._workspaceTrustRequestService.requestWorkspaceTrust({ message });
    }
    return !!await this._workspaceTrustRequestService.requestResourcesTrust({ uri: workingDirectory, message });
  }
  _convertVariablesToAttachments(request) {
    const attachments = this._variableEntriesToAttachments(request.variables.variables, request.sessionResource, request.message);
    const explicitCount = attachments.length;
    this._appendActiveEditorAttachments(attachments, request);
    if (attachments.length !== explicitCount) {
      this._logService.trace(`[AgentHost] Forwarded ${attachments.length - explicitCount} active editor attachment(s); ${attachments.length} total`);
    }
    return attachments;
  }
  /**
   * Forward the active editor (which the suggested-context flow omits in agent mode) as ambient context, deduped
   * against files the user attached explicitly. Gated on
   * {@link ChatConfiguration.ImplicitContextActiveEditor} (on by default, off in the Agents window).
   * Unsaved handling lives in {@link _convertVariableToAttachment}.
   */
  _appendActiveEditorAttachments(attachments, request) {
    if (!this._configurationService.getValue(ChatConfiguration.ImplicitContextActiveEditor)) {
      return;
    }
    const implicitContext = this._chatWidgetService.getWidgetBySessionResource(request.sessionResource)?.input.implicitContext;
    if (!implicitContext) {
      return;
    }
    const existingKeys = /* @__PURE__ */ new Set();
    for (const v of request.variables.variables) {
      const key = this._fileEntryDedupeKey(v, request.sessionResource);
      if (key) {
        existingKeys.add(key);
      }
    }
    const skipUntitled = !this._backendInlinesUnsavedEditors();
    for (const entry of implicitContext.values) {
      if (entry.value === void 0) {
        continue;
      }
      if (entry.uri?.scheme === Schemas.vscodeBrowser) {
        continue;
      }
      if (skipUntitled && entry.uri?.scheme === Schemas.untitled) {
        continue;
      }
      const key = this._fileEntryDedupeKey(entry, request.sessionResource);
      if (key) {
        if (existingKeys.has(key)) {
          continue;
        }
        existingKeys.add(key);
      }
      const attachment = this._convertVariableToAttachment(entry, request.sessionResource, request.message);
      if (!Array.isArray(attachment) && attachment) {
        attachments.push(attachment);
      }
    }
  }
  /** Dedupe identity for a file/implicit entry: rebased URI, suffixed with the range for a selection. */
  _fileEntryDedupeKey(entry, sessionResource) {
    if (entry.kind !== "file" && entry.kind !== "implicit") {
      return void 0;
    }
    const value = entry.value;
    const uri = isLocation(value) ? value.uri : value instanceof URI ? value : void 0;
    if (!uri) {
      return void 0;
    }
    const selection = this._entrySelection(entry);
    return this._attachmentDedupeKey(this._rebaseAttachmentUri(uri, sessionResource).toString(), selection);
  }
  /** The selection range carried by a file/implicit entry, or `undefined` for whole-document references. */
  _entrySelection(entry) {
    const location = this._entrySelectionLocation(entry);
    return location ? { range: this._toTextRange(location.range) } : void 0;
  }
  /** Dedupe identity: the bare URI for a whole document, suffixed with the range for a selection. */
  _attachmentDedupeKey(uri, selection) {
    if (!selection) {
      return uri;
    }
    const { start, end } = selection.range;
    return `${uri}#${start.line}:${start.character}-${end.line}:${end.character}`;
  }
  /**
   * Whether this backend reads referenced files from disk (rather than seeing the editor's
   * in-memory buffer) and therefore needs the live text of an unsaved / dirty editor inlined as
   * an embedded resource. Copilot CLI and Codex both run as separate processes with only disk
   * access, so a `@path` mention (or an `untitled:` URI) would give them stale or missing content.
   */
  _backendInlinesUnsavedEditors() {
    return this._config.provider === SessionType.CopilotCLI || this._config.provider === CODEX_AGENT_PROVIDER_ID;
  }
  /** A resource is unsaved when it's untitled or a saved file with in-memory (dirty) changes. */
  _isUnsavedResource(uri) {
    return uri.scheme === Schemas.untitled || this._workingCopyService.isDirty(uri);
  }
  /**
   * Inline the live (in-memory) text of an unsaved editor as an embedded resource so a path-reading backend still
   * gets current content, preserving the entry's selection, range and `_meta`. Selection entries inline only the
   * selected text; whole-document entries inline the full buffer. Returns `undefined` when no loaded text model is
   * available or the inlined text exceeds {@link MAX_INLINED_UNSAVED_EDITOR_BYTES}.
   */
  _buildUnsavedEditorAttachment(uri, v, range) {
    const model = this._modelService.getModel(uri);
    if (!model) {
      return void 0;
    }
    const text = this._getUnsavedEditorAttachmentText(model, this._entryModelSelectionRange(v));
    const buffer = text === void 0 ? void 0 : VSBuffer.fromString(text);
    if (!buffer || buffer.byteLength > MAX_INLINED_UNSAVED_EDITOR_BYTES) {
      this._logService.trace(`[AgentHost] Skipping inline of unsaved editor ${uri.toString()}: exceeds ${MAX_INLINED_UNSAVED_EDITOR_BYTES} byte cap`);
      return void 0;
    }
    const selection = this._entrySelection(v);
    const attachment = {
      type: MessageAttachmentKind.EmbeddedResource,
      label: v.name,
      displayKind: selection ? "selection" : "document",
      data: encodeBase64(buffer),
      contentType: "text/plain"
    };
    if (selection) {
      attachment.selection = selection;
    }
    if (range) {
      attachment.range = range;
    }
    if (v._meta) {
      attachment._meta = v._meta;
    }
    return attachment;
  }
  /**
   * The inline text to send for an unsaved editor: the selected text for a selection, else the whole buffer. Uses the
   * model length APIs so an over-cap buffer is skipped (returns `undefined`) without ever being materialized.
   */
  _getUnsavedEditorAttachmentText(model, range) {
    if (range) {
      const selection = model.validateRange(range);
      const selectionLength = model.getValueLengthInRange(selection);
      if (selectionLength > 0) {
        return selectionLength > MAX_INLINED_UNSAVED_EDITOR_BYTES ? void 0 : model.getValueInRange(selection);
      }
    }
    return model.getValueLength() > MAX_INLINED_UNSAVED_EDITOR_BYTES ? void 0 : model.getValue();
  }
  /** The editor range of a file/implicit selection entry, used to slice the live model; `undefined` otherwise. */
  _entryModelSelectionRange(entry) {
    return this._entrySelectionLocation(entry)?.range;
  }
  /** The {@link Location} of a file/implicit entry that represents a selection, or `undefined` for whole documents. */
  _entrySelectionLocation(entry) {
    const value = entry.value;
    const isSelectionEntry = (entry.kind === "file" || entry.kind === "implicit" && entry.isSelection) && isLocation(value);
    return isSelectionEntry ? value : void 0;
  }
  _variableEntriesToAttachments(variables, sessionResource, messageText, materializePastes = true) {
    const attachments = [];
    for (const v of variables) {
      const attachment = this._convertVariableToAttachment(v, sessionResource, messageText, materializePastes);
      if (Array.isArray(attachment)) {
        attachments.push(...attachment);
      } else if (attachment) {
        attachments.push(attachment);
      }
    }
    if (attachments.length > 0) {
      this._logService.trace(`[AgentHost] Converted ${attachments.length} attachments from ${variables.length} explicit variables`);
    }
    return attachments;
  }
  _convertVariableToAttachment(v, sessionResource, messageText, materializePastes = true) {
    const referenceRange = this._toAttachmentReferenceRange(messageText, v.range);
    if ((v.kind === "file" || v.kind === "implicit") && this._backendInlinesUnsavedEditors()) {
      const uri = isLocation(v.value) ? v.value.uri : v.value instanceof URI ? v.value : void 0;
      if (uri && this._isUnsavedResource(uri)) {
        const embedded = this._buildUnsavedEditorAttachment(uri, v, referenceRange);
        if (embedded) {
          return embedded;
        }
        if (uri.scheme !== Schemas.file) {
          return void 0;
        }
      }
    }
    if ((v.kind === "file" || v.kind === "implicit" && v.isSelection) && isLocation(v.value)) {
      return this._toSelectionAttachment(v.value, v.name, "selection", sessionResource, v._meta, referenceRange);
    }
    if (v.kind === "implicit" && isLocation(v.value)) {
      return this._toResourceAttachment(v.value.uri, v.name, "document", sessionResource, v._meta, referenceRange);
    }
    if ((v.kind === "file" || v.kind === "implicit") && v.value instanceof URI) {
      return this._toResourceAttachment(v.value, v.name, "document", sessionResource, v._meta, referenceRange);
    }
    if (v.kind === "directory" && v.value instanceof URI) {
      return this._toResourceAttachment(v.value, v.name, "directory", sessionResource, v._meta, referenceRange);
    }
    if (v.kind === "symbol" && isLocation(v.value)) {
      return this._toSelectionAttachment(v.value, v.name, "symbol", sessionResource, v._meta, referenceRange);
    }
    if (v.kind === "promptFile" && v.value instanceof URI) {
      return this._toResourceAttachment(v.value, v.name, "document", sessionResource, v._meta, referenceRange);
    }
    if (isImageVariableEntry(v)) {
      return this._toImageAttachment(v, sessionResource, referenceRange);
    }
    if (isAgentFeedbackVariableEntry(v)) {
      return this._toAgentFeedbackAttachment(v);
    }
    if (v.kind === "sessionReference" && v.value instanceof URI) {
      const trajectoryPath = this._toSessionReferenceTrajectoryPath(v.value);
      if (!trajectoryPath) {
        return void 0;
      }
      return this._toSessionReferenceAttachments(v, v.value, trajectoryPath, referenceRange);
    }
    if (isBrowserViewVariableEntry(v)) {
      return this._toSimpleAttachment(
        v.name,
        v.modelDescription ?? `Browser page: ${v.name}. The pageId is "${v.browserId}".`,
        {
          ...v._meta,
          [BrowserViewAttachmentMetadataKey]: { browserId: v.browserId, browserUri: v.value.toString() }
        },
        BrowserViewAttachmentDisplayKind,
        referenceRange
      );
    }
    if (v.kind === "element") {
      const correlationId = getElementAttachmentCorrelationId(v) ?? v.id;
      const metadata = { ...v._meta, ...toElementAttachmentMeta(correlationId) };
      const elementAttachment = this._toSimpleAttachment(v.name, v.value, metadata, AgentHostElementAttachmentDisplayKind, referenceRange);
      const imageAttachment = this._toElementImageAttachment(v, sessionResource, metadata);
      return imageAttachment ? [elementAttachment, imageAttachment] : elementAttachment;
    }
    if (v.kind === "paste") {
      return materializePastes ? this._toEmbeddedTextAttachment(v.name, v.code, v._meta, referenceRange) : this._toSimpleAttachment(v.name, v.code, v._meta, void 0, referenceRange);
    }
    if (v.kind === "promptText") {
      return this._toSimpleAttachment(v.name, v.value, v._meta, void 0, referenceRange);
    }
    if (v.kind === "workspace") {
      return this._toSimpleAttachment(v.name, v.value, v._meta, "workspace", referenceRange);
    }
    if (isChatTranscriptContextVariableEntry(v)) {
      return this._toSimpleAttachment(v.name, v.value, toChatTranscriptContextAttachmentMeta(v), ChatTranscriptContextAttachmentDisplayKind, referenceRange);
    }
    if (v.kind === "string" && typeof v.value === "string") {
      return this._toSimpleAttachment(v.name, v.value, v._meta, void 0, referenceRange);
    }
    const agentHostCompletionKind = getAgentHostCompletionReferenceKind(v);
    if (agentHostCompletionKind === AgentHostCompletionReferenceKind.Command) {
      return this._toSimpleAttachment(v.name, void 0, v._meta, "command", referenceRange);
    }
    if (agentHostCompletionKind === AgentHostCompletionReferenceKind.Skill) {
      return this._toSimpleAttachment(v.name, void 0, v._meta, "skill", referenceRange);
    }
    if (isChatReferenceVariableEntry(v)) {
      return this._toChatReferenceAttachment(v, referenceRange);
    }
    return void 0;
  }
  _toChatReferenceAttachment(v, range) {
    const attachment = {
      type: MessageAttachmentKind.Chat,
      resource: v.value.toString(),
      label: v.name
    };
    if (v.endTurn !== void 0) {
      attachment.endTurn = v.endTurn;
    }
    if (range) {
      attachment.range = range;
    }
    if (v._meta) {
      attachment._meta = v._meta;
    }
    return attachment;
  }
  _toElementImageAttachment(v, sessionResource, metadata) {
    if (v.imageData instanceof Uint8Array) {
      return {
        type: MessageAttachmentKind.EmbeddedResource,
        label: `${v.name} screenshot`,
        displayKind: "image",
        data: encodeBase64(VSBuffer.wrap(v.imageData)),
        contentType: v.imageMimeType ?? "image/png",
        _meta: metadata
      };
    }
    if (URI.isUri(v.imageData)) {
      return this._toResourceAttachment(v.imageData, `${v.name} screenshot`, "image", sessionResource, metadata);
    }
    return void 0;
  }
  _toSessionReferenceAttachment(v, sessionResource, trajectoryPath, range) {
    return this._toSimpleAttachment(
      v.name,
      toSessionReferenceModelRepresentation(v.name, sessionResource, trajectoryPath),
      { ...v._meta ?? {}, ...toSessionReferenceAttachmentMeta(sessionResource) },
      AgentHostSessionReferenceAttachmentDisplayKind,
      range
    );
  }
  _toSessionReferenceAttachments(v, sessionResource, trajectoryPath, range) {
    return [
      this._toSessionReferenceAttachment(v, sessionResource, trajectoryPath, range),
      this._toSessionReferenceTrajectoryAttachment(v, sessionResource, trajectoryPath)
    ];
  }
  _toSessionReferenceTrajectoryAttachment(v, sessionResource, trajectoryPath) {
    return {
      type: MessageAttachmentKind.Resource,
      uri: URI.file(trajectoryPath).toString(),
      label: `${v.name} trajectory`,
      displayKind: AgentHostSessionReferenceTrajectoryAttachmentDisplayKind,
      _meta: { ...v._meta ?? {}, ...toSessionReferenceAttachmentMeta(sessionResource) }
    };
  }
  _toSessionReferenceTrajectoryPath(sessionResource) {
    return buildHostLocalEventsPath(
      sessionResource,
      this._pathService.userHome({ preferLocal: true }),
      (authority) => this._remoteAgentHostService.connections.find((connection) => agentHostAuthority(connection.address) === authority)
    );
  }
  _toResourceAttachment(uri, label, displayKind, sessionResource, _meta, range) {
    const attachmentUri = this._rebaseAttachmentUri(uri, sessionResource);
    const attachment = { type: MessageAttachmentKind.Resource, uri: attachmentUri.toString(), label, displayKind };
    if (range) {
      attachment.range = range;
    }
    if (_meta) {
      attachment._meta = _meta;
    }
    return attachment;
  }
  _toSelectionAttachment(location, label, displayKind, sessionResource, _meta, range) {
    const attachmentUri = this._rebaseAttachmentUri(location.uri, sessionResource);
    const attachment = {
      type: MessageAttachmentKind.Resource,
      uri: attachmentUri.toString(),
      label,
      displayKind,
      selection: { range: this._toTextRange(location.range) }
    };
    if (range) {
      attachment.range = range;
    }
    if (_meta) {
      attachment._meta = _meta;
    }
    return attachment;
  }
  _toImageAttachment(v, sessionResource, range) {
    const buffer = coerceImageBuffer(v.value);
    const contentType = v.mimeType ?? "image/png";
    if (buffer) {
      const attachment = {
        type: MessageAttachmentKind.EmbeddedResource,
        label: v.name,
        displayKind: "image",
        data: encodeBase64(VSBuffer.wrap(buffer)),
        contentType
      };
      if (range) {
        attachment.range = range;
      }
      if (v._meta) {
        attachment._meta = v._meta;
      }
      return attachment;
    }
    const refUri = v.references?.find((r) => URI.isUri(r.reference))?.reference;
    if (URI.isUri(refUri)) {
      return this._toResourceAttachment(refUri, v.name, "image", sessionResource, v._meta, range);
    }
    return void 0;
  }
  _toAgentFeedbackAttachment(v) {
    const annotationsResource = v.annotationsResource?.toString();
    if (annotationsResource && v.feedbackItems.length > 0) {
      return v.feedbackItems.map((item) => {
        const itemMeta = {
          id: item.id,
          text: item.text,
          resourceUri: item.resourceUri.toString(),
          range: this._toTextRange(item.range),
          ...item.replies?.length ? { replies: [...item.replies] } : {}
        };
        return {
          type: MessageAttachmentKind.Annotations,
          label: v.name,
          displayKind: AgentFeedbackAttachmentDisplayKind,
          resource: annotationsResource,
          annotationIds: [item.id],
          _meta: {
            ...v._meta ?? {},
            [AgentFeedbackAttachmentMetadataKey]: {
              sessionResource: v.sessionResource.toString(),
              feedbackItems: [itemMeta]
            }
          }
        };
      });
    }
    const feedbackItems = v.feedbackItems.map((item) => ({
      id: item.id,
      text: item.text,
      resourceUri: item.resourceUri.toString(),
      range: this._toTextRange(item.range),
      ...item.replies?.length ? { replies: [...item.replies] } : {}
    }));
    return this._toSimpleAttachment(
      v.name,
      typeof v.value === "string" ? v.value : void 0,
      {
        ...v._meta ?? {},
        [AgentFeedbackAttachmentMetadataKey]: {
          sessionResource: v.sessionResource.toString(),
          feedbackItems
        }
      },
      AgentFeedbackAttachmentDisplayKind
    );
  }
  _toSimpleAttachment(label, modelRepresentation, _meta, displayKind, range) {
    const attachment = { type: MessageAttachmentKind.Simple, label };
    if (modelRepresentation !== void 0) {
      attachment.modelRepresentation = modelRepresentation;
    }
    if (range) {
      attachment.range = range;
    }
    if (displayKind) {
      attachment.displayKind = displayKind;
    }
    if (_meta) {
      attachment._meta = _meta;
    }
    return attachment;
  }
  _toEmbeddedTextAttachment(label, text, _meta, range) {
    const attachment = {
      type: MessageAttachmentKind.EmbeddedResource,
      label,
      data: encodeBase64(VSBuffer.fromString(text)),
      contentType: "text/plain"
    };
    if (range) {
      attachment.range = range;
    }
    if (_meta) {
      attachment._meta = _meta;
    }
    return attachment;
  }
  _toAttachmentReferenceRange(messageText, range) {
    if (!messageText || !range || range.start < 0 || range.endExclusive > messageText.length || range.start > range.endExclusive) {
      return void 0;
    }
    const start = offsetToPosition(messageText, range.start);
    const end = offsetToPosition(messageText, range.endExclusive);
    return {
      start: { line: start.lineNumber - 1, character: start.column - 1 },
      end: { line: end.lineNumber - 1, character: end.column - 1 }
    };
  }
  _toTextRange(range) {
    return {
      start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
      end: { line: range.endLineNumber - 1, character: range.endColumn - 1 }
    };
  }
  /**
   * Rebase a `file:`-scheme attachment URI from the session's requested
   * working directory onto the server-resolved working directory. This
   * matters on the first turn of a worktree-isolated session, where the
   * provider creates a worktree under a different path than the workspace
   * folder the workbench attached the file from. Returns the URI unchanged
   * if the requested and resolved directories match, the URI is not under
   * the requested directory, or either side is unavailable.
   */
  _rebaseAttachmentUri(uri, sessionResource) {
    const requestedDirectories = this._resolveRequestedWorkingDirectories(sessionResource);
    const requestedDir = requestedDirectories?.[0];
    if (!requestedDir || requestedDir.scheme !== "file") {
      return uri;
    }
    const owningRequestedDirectory = findDeepestContainingWorkingDirectory(uri, requestedDirectories);
    if (!owningRequestedDirectory || !extUriBiasedIgnorePathCase.isEqual(owningRequestedDirectory, requestedDir)) {
      return uri;
    }
    const backendSession = this._resolveSessionUri(sessionResource);
    const rawResolvedDir = this._getSessionState(backendSession.toString())?.workingDirectories?.[0];
    const resolvedDir = typeof rawResolvedDir === "string" ? URI.parse(rawResolvedDir) : rawResolvedDir;
    if (!resolvedDir || resolvedDir.scheme !== "file") {
      return uri;
    }
    if (extUriBiasedIgnorePathCase.isEqual(requestedDir, resolvedDir)) {
      return uri;
    }
    const rel = extUriBiasedIgnorePathCase.relativePath(requestedDir, uri);
    if (rel === void 0) {
      return uri;
    }
    if (rel === "") {
      return resolvedDir;
    }
    return URI.joinPath(resolvedDir, ...rel.split("/"));
  }
  // ---- Lifecycle ----------------------------------------------------------
  // ---- Session subscription helpers ----------------------------------------
  /**
   * Get or create a session subscription. The first call for a given URI
   * triggers a server subscribe; subsequent calls increment the refcount.
   */
  _ensureSessionSubscription(sessionUri) {
    let ref = this._sessionSubscriptions.get(sessionUri);
    if (ref?.object.value instanceof Error) {
      this._sessionSubscriptions.delete(sessionUri);
      ref.dispose();
      this._workingDirectoryRegistrations.deleteAndDispose(sessionUri);
      ref = void 0;
    }
    if (!ref) {
      ref = this._config.connection.getSubscription(StateComponents.Session, URI.parse(sessionUri), "AgentHostSessionHandler");
      this._sessionSubscriptions.set(sessionUri, ref);
      this._workingDirectoryRegistrations.set(sessionUri, this._workingDirectorySynchronizer.register({
        session: URI.parse(sessionUri),
        provider: this._config.provider,
        connection: this._config.connection,
        subscription: ref.object
      }));
    }
    return ref.object;
  }
  /**
   * Get or create the default-chat subscription for a session. Mirrors the
   * refcount lifecycle of {@link _ensureSessionSubscription}.
   */
  _ensureDefaultChatSubscription(sessionUri) {
    let ref = this._defaultChatSubscriptions.get(sessionUri);
    if (ref?.object.value instanceof Error) {
      this._defaultChatSubscriptions.delete(sessionUri);
      ref.dispose();
      ref = void 0;
    }
    if (!ref) {
      const state = this._requireRawSessionState(sessionUri);
      const defaultChat = state.defaultChat;
      if (!defaultChat) {
        throw new Error(`Session ${sessionUri} has no default chat`);
      }
      const chatUri = URI.parse(defaultChat.toString());
      ref = this._config.connection.getSubscription(StateComponents.Chat, chatUri, "AgentHostSessionHandler");
      this._defaultChatSubscriptions.set(sessionUri, ref);
    }
    return ref.object;
  }
  /**
   * Release the subscriptions held by a single chat session on dispose.
   *
   * Unlike {@link _releaseSessionSubscription} (which tears down every chat
   * of a session at once), this only releases the disposed chat's own
   * conversation subscription and never touches sibling peer chats: closing
   * one chat of a multi-chat session must not strand another chat — including
   * one that is concurrently hydrating in {@link provideChatSessionContent} —
   * on a disposed subscription. The session summary subscription (and its
   * lockstep default-chat subscription) is shared by every chat of the
   * session, so it is only torn down once no sibling chat session is still
   * active or mid-hydration for the same backend session.
   */
  _releaseChatSessionSubscriptions(sessionUri, chatUri) {
    if (chatUri !== this._getRawSessionState(sessionUri)?.defaultChat?.toString()) {
      const chatRef2 = this._additionalChatSubscriptions.get(chatUri);
      if (chatRef2) {
        this._additionalChatSubscriptions.delete(chatUri);
        chatRef2.dispose();
      }
    }
    if (this._hasOtherSessionHold(sessionUri)) {
      return;
    }
    const ref = this._sessionSubscriptions.get(sessionUri);
    if (ref) {
      this._sessionSubscriptions.delete(sessionUri);
      ref.dispose();
      this._workingDirectoryRegistrations.deleteAndDispose(sessionUri);
    }
    const chatRef = this._defaultChatSubscriptions.get(sessionUri);
    if (chatRef) {
      this._defaultChatSubscriptions.delete(sessionUri);
      chatRef.dispose();
    }
  }
  /**
   * Returns whether another chat session for the given backend session URI is
   * still active or in the middle of hydrating its subscriptions, so the
   * shared session subscription must be kept alive. Callers invoke this after
   * removing their own entry from {@link _activeSessions}.
   */
  _hasOtherSessionHold(sessionUri) {
    if ((this._hydratingChatSessions.get(sessionUri) ?? 0) > 0) {
      return true;
    }
    for (const resource of this._activeSessions.keys()) {
      if (this._resolveSessionUri(resource).toString() === sessionUri) {
        return true;
      }
    }
    return false;
  }
  /**
   * Read the current optimistic session state for a backend session URI,
   * merged with its default chat so conversation contents (turns, active
   * turn, pending/queued messages, input requests) are visible.
   */
  /**
   * Resolves once a subscription has received its first snapshot (its
   * `value` is no longer `undefined`) — i.e. it has hydrated with state or
   * an error. Resolves immediately if already hydrated or if cancellation
   * is requested.
   */
  _whenSubscriptionHydrated(sub, token) {
    if (sub.value !== void 0 || token.isCancellationRequested) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const store = new DisposableStore();
      const settle = () => {
        store.dispose();
        resolve();
      };
      store.add(sub.onDidChange(() => {
        if (sub.value !== void 0) {
          settle();
        }
      }));
      const onDidError = sub.onDidError;
      if (onDidError) {
        store.add(onDidError(settle));
      }
      store.add(token.onCancellationRequested(settle));
      if (sub.value !== void 0) {
        settle();
      }
    });
  }
  _getSessionState(sessionUri, chatUri) {
    const value = this._getRawSessionState(sessionUri);
    if (!value) {
      return void 0;
    }
    const defaultChat = value.defaultChat?.toString();
    const chatState = chatUri && chatUri !== defaultChat ? this._getAdditionalChatState(chatUri) : this._getDefaultChatState(sessionUri);
    return mergeSessionWithDefaultChat(value, chatState);
  }
  _getRawSessionState(sessionUri) {
    const ref = this._sessionSubscriptions.get(sessionUri);
    const value = ref?.object.value;
    return value && !(value instanceof Error) ? value : void 0;
  }
  _requireRawSessionState(sessionUri) {
    const state = this._getRawSessionState(sessionUri);
    if (!state) {
      throw new Error(`Session state is not hydrated for ${sessionUri}`);
    }
    return state;
  }
  _requireDefaultChatUri(sessionUri) {
    const defaultChat = this._requireRawSessionState(sessionUri).defaultChat;
    if (!defaultChat) {
      throw new Error(`Session ${sessionUri} has no default chat`);
    }
    return defaultChat.toString();
  }
  /** Read the current optimistic default-chat state for a backend session URI. */
  _getDefaultChatState(sessionUri) {
    const ref = this._defaultChatSubscriptions.get(sessionUri);
    if (!ref) {
      return void 0;
    }
    const value = ref.object.value;
    return value && !(value instanceof Error) ? value : void 0;
  }
  /** Read the current optimistic state for an additional peer chat URI. */
  _getAdditionalChatState(chatUri) {
    const ref = this._additionalChatSubscriptions.get(chatUri);
    if (!ref) {
      return void 0;
    }
    const value = ref.object.value;
    return value && !(value instanceof Error) ? value : void 0;
  }
  /**
   * Get or create the subscription for an additional peer chat, keyed by the
   * chat channel URI. Mirrors {@link _ensureDefaultChatSubscription} but for
   * non-default chats so their conversation contents hydrate independently.
   */
  _ensureAdditionalChatSubscription(chatUri) {
    let ref = this._additionalChatSubscriptions.get(chatUri);
    if (ref?.object.value instanceof Error) {
      this._additionalChatSubscriptions.delete(chatUri);
      ref.dispose();
      ref = void 0;
    }
    if (!ref) {
      ref = this._config.connection.getSubscription(StateComponents.Chat, URI.parse(chatUri), "AgentHostSessionHandler");
      this._additionalChatSubscriptions.set(chatUri, ref);
    }
    return ref.object;
  }
  /**
   * Subscribe to the conversation channel of `sessionResource`'s chat and
   * return the {@link IAgentSubscription}. Routes to the default-chat
   * subscription (fragment-less resource) or to an additional peer chat.
   */
  _ensureChatSubscription(sessionUri, chatUri) {
    return chatUri === this._requireDefaultChatUri(sessionUri) ? this._ensureDefaultChatSubscription(sessionUri) : this._ensureAdditionalChatSubscription(chatUri);
  }
  resolveChatResponseUri(_sessionResource, href, _kind) {
    return rewriteAgentHostLinkTarget(href, this._config.connectionAuthority);
  }
  /**
   * Read the current root state.
   */
  _getRootState() {
    const value = this._config.connection.rootState.value;
    return value && !(value instanceof Error) ? value : void 0;
  }
  dispose() {
    for (const [, session] of this._activeSessions) {
      session.dispose();
    }
    this._activeSessions.clear();
    for (const ref of this._sessionSubscriptions.values()) {
      ref.dispose();
    }
    this._sessionSubscriptions.clear();
    for (const ref of this._defaultChatSubscriptions.values()) {
      ref.dispose();
    }
    this._defaultChatSubscriptions.clear();
    for (const ref of this._additionalChatSubscriptions.values()) {
      ref.dispose();
    }
    this._additionalChatSubscriptions.clear();
    super.dispose();
  }
};
AgentHostSessionHandler.DRAFT_SYNC_DEBOUNCE_MS = 500;
AgentHostSessionHandler.ACTIVE_CLIENT_RECONCILIATION_DEBOUNCE_MS = 5;
AgentHostSessionHandler = __decorateClass([
  __decorateParam(1, IChatAgentService),
  __decorateParam(2, IChatService),
  __decorateParam(3, IChatEditingService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, ITerminalChatService),
  __decorateParam(8, IAgentHostTerminalService),
  __decorateParam(9, IAgentHostSessionWorkingDirectoryResolver),
  __decorateParam(10, IAgentHostSessionWorkingDirectorySynchronizer),
  __decorateParam(11, IAgentHostNewSessionFolderService),
  __decorateParam(12, IAgentHostUntitledProvisionalSessionService),
  __decorateParam(13, IAgentHostImportConversationStore),
  __decorateParam(14, ILanguageModelToolsService),
  __decorateParam(15, IChatWidgetService),
  __decorateParam(16, ILanguageModelsService),
  __decorateParam(17, IOpenerService),
  __decorateParam(18, IAgentHostActiveClientService),
  __decorateParam(19, IChatEntitlementService),
  __decorateParam(20, IWorkspaceTrustRequestService),
  __decorateParam(21, IModelService),
  __decorateParam(22, IWorkingCopyService),
  __decorateParam(23, IConfigurationService),
  __decorateParam(24, IChatResponseFileChangesService),
  __decorateParam(25, IPathService),
  __decorateParam(26, IRemoteAgentHostService),
  __decorateParam(27, IAgentHostCustomizationService),
  __decorateParam(28, ITelemetryService)
], AgentHostSessionHandler);
function toolResultToProtocol(result, toolName) {
  const isError = !!result.toolResultError;
  const defaultPastTense = isError ? `${toolName} failed` : `Ran ${toolName}`;
  const pastTense = typeof result.toolResultMessage === "string" ? result.toolResultMessage : result.toolResultMessage ? { markdown: result.toolResultMessage.value } : defaultPastTense;
  const content = [];
  for (const part of result.content) {
    if (part.kind === "text") {
      content.push({ type: ToolResultContentType.Text, text: part.value });
    } else if (part.kind === "promptTsx") {
      content.push({ type: ToolResultContentType.Text, text: stringifyPromptTsxPart(part) });
    } else if (part.kind === "data") {
      content.push({
        type: ToolResultContentType.EmbeddedResource,
        data: encodeBase64(part.value.data),
        contentType: part.value.mimeType
      });
    }
  }
  return {
    success: !isError,
    pastTenseMessage: pastTense,
    content: content.length > 0 ? content : void 0,
    error: isError ? { message: typeof result.toolResultError === "string" ? result.toolResultError : `${toolName} encountered an error` } : void 0
  };
}
export {
  AgentHostSessionHandler,
  UNOBSERVED_CLIENT_TOOL_GRACE_MS,
  convertCarouselAnswers,
  resolveRestoredSubagentChatResource,
  toolDataToDefinition,
  toolResultToProtocol,
  unwrapSessionLoadErrorMessage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50SG9zdFxcYWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEZWxheWVyLCBkaXNwb3NhYmxlVGltZW91dCwgcmFjZUNhbmNlbGxhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGRlY29kZUJhc2U2NCwgZW5jb2RlQmFzZTY0LCBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZ2V0RXJyb3JDb2RlLCBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0RXJyb3JEZXRhaWxzRnJvbU1ldGEsIGdldENvcGlsb3RQbGFuRnJvbUVudGl0bGVtZW50LCBJQ2hhdEVycm9yQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0RXJyb3JNZXNzYWdlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlUmVzb3VyY2VNYXAsIERpc3Bvc2FibGVTdG9yZSwgSVJlZmVyZW5jZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSwgdHlwZSBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCwgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBhdXRvcnVuUGVyS2V5ZWRJdGVtLCBjb25zdE9ic2VydmFibGUsIGRlcml2ZWQsIGRlcml2ZWRPcHRzLCBJT2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlLCB0cmFuc2FjdGlvbiwgd2FpdEZvclN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSwgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgTXV0YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IElSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBpc0xvY2F0aW9uLCB0eXBlIExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHR5cGUgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RBbGxvd1NpZ25lZE91dFdoZW5Vc2FibGVTZXR0aW5nSWQsIEFnZW50UHJvdmlkZXIsIEFnZW50U2Vzc2lvbiwgQ09ERVhfQUdFTlRfUFJPVklERVJfSUQsIHR5cGUgSUFnZW50Q29ubmVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFnZW50SG9zdEF1dGhvcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0VXJpLmpzJztcbmltcG9ydCB7IGlzQ3VzdG9taXphdGlvbkVuYWJsZWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2N1c3RvbWl6YXRpb25FbmFibGVtZW50LmpzJztcbmltcG9ydCB7IGZpbmREZWVwZXN0Q29udGFpbmluZ1dvcmtpbmdEaXJlY3RvcnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFdvcmtpbmdEaXJlY3Rvcmllcy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RFbGVtZW50QXR0YWNobWVudERpc3BsYXlLaW5kLCBnZXRFbGVtZW50QXR0YWNobWVudENvcnJlbGF0aW9uSWQsIHRvRWxlbWVudEF0dGFjaG1lbnRNZXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9tZXRhL2FnZW50RWxlbWVudEF0dGFjaG1lbnRzLmpzJztcbmltcG9ydCB7IEFnZW50RmVlZGJhY2tBdHRhY2htZW50RGlzcGxheUtpbmQsIEFnZW50RmVlZGJhY2tBdHRhY2htZW50TWV0YWRhdGFLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL21ldGEvYWdlbnRGZWVkYmFja0F0dGFjaG1lbnRzLmpzJztcbmltcG9ydCB7IEJyb3dzZXJWaWV3QXR0YWNobWVudERpc3BsYXlLaW5kLCBCcm93c2VyVmlld0F0dGFjaG1lbnRNZXRhZGF0YUtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vbWV0YS9icm93c2VyVmlld0F0dGFjaG1lbnRzLmpzJztcbmltcG9ydCB7IHJlYWRUb29sQ2FsbE1ldGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL21ldGEvYWdlbnRUb29sQ2FsbE1ldGEuanMnO1xuaW1wb3J0IHsgcmVhZENvbXBsZXRpb25BdHRhY2htZW50TWV0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vbWV0YS9hZ2VudENvbXBsZXRpb25BdHRhY2htZW50TWV0YS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vcmVtb3RlQWdlbnRIb3N0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5pbXBvcnQgeyBDTElFTlRfVE9PTF9TRUFSQ0hfUkVGRVJFTkNFX05BTUUsIFJVTlRJTUVfVE9PTF9TRUFSQ0hfVE9PTF9OQU1FIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi90b29sU2VhcmNoQ29uc3RhbnRzLmpzJztcbmltcG9ydCB0eXBlIHsgQ2hhdElucHV0UmVxdWVzdFdpdGhQbGFuUmV2aWV3LCBJQWdlbnRIb3N0UGxhblJldmlldyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0UGxhblJldmlldy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTdWJzY3JpcHRpb24sIG9ic2VydmFibGVGcm9tU3Vic2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9hZ2VudFN1YnNjcmlwdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0VHJ1bmNhdGVkQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25JdGVtS2luZCBhcyBBaHBDb21wbGV0aW9uSXRlbUtpbmQsIENvbnRlbnRFbmNvZGluZywgdHlwZSBDb21wbGV0aW9uSXRlbSBhcyBBaHBDb21wbGV0aW9uSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29uZmlybWF0aW9uT3B0aW9uS2luZCwgQ3VzdG9taXphdGlvblR5cGUsIEpzb25QcmltaXRpdmUsIE1jcFNlcnZlckF1dGhSZXF1aXJlZFN0YXRlLCBNY3BTZXJ2ZXJTdGF0dXMsIFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLCBUZXJtaW5hbENsYWltS2luZCwgVG9vbENhbGxDb250cmlidXRvcktpbmQsIFRvb2xSZXN1bHRDb250ZW50VHlwZSwgdHlwZSBDb25maXJtYXRpb25PcHRpb24sIHR5cGUgUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSwgdHlwZSBTZXNzaW9uQWN0aXZlQ2xpZW50LCB0eXBlIFNlc3Npb25JbnB1dFJlcXVlc3QsIHR5cGUgU2Vzc2lvblRvb2xDbGllbnRFeGVjdXRpb25SZXF1ZXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlLCBDaGF0VHVyblN0YXJ0ZWRBY3Rpb24sIGlzQ2hhdEFjdGlvbiwgdHlwZSBDbGllbnRDaGF0QWN0aW9uLCB0eXBlIENsaWVudFNlc3Npb25BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IEFIUF9BVVRIX1JFUVVJUkVELCBQcm90b2NvbEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgYnVpbGRTdWJhZ2VudENoYXRVcmksIENoYXRPcmlnaW5LaW5kLCBnZXRJbmxpbmVUb29sSW5wdXQsIGdldFRvb2xTdWJhZ2VudENvbnRlbnQsIGlzQ2hhdFJlYWRPbmx5LCBpc01lc3NhZ2VIaWRkZW5Gcm9tVHJhbnNjcmlwdCwgTWVzc2FnZUF0dGFjaG1lbnRLaW5kLCBNZXNzYWdlS2luZCwgUGVuZGluZ01lc3NhZ2VLaW5kLCBSZXNwb25zZVBhcnRLaW5kLCBDaGF0SW5wdXRBbnN3ZXJTdGF0ZSwgQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLCBDaGF0SW5wdXRRdWVzdGlvbktpbmQsIENoYXRJbnB1dFJlc3BvbnNlS2luZCwgU2Vzc2lvblN0YXR1cywgU3RhdGVDb21wb25lbnRzLCBUb29sQ2FsbENhbmNlbGxhdGlvblJlYXNvbiwgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24sIFRvb2xDYWxsU3RhdHVzLCBUdXJuU3RhdGUsIHBhcnNlQ2hhdFVyaSwgbWVyZ2VTZXNzaW9uV2l0aERlZmF1bHRDaGF0LCByZWFkVXNhZ2VJbmZvTWV0YSwgd2l0aE1lc3NhZ2VIaWRkZW5Gcm9tVHJhbnNjcmlwdCwgdHlwZSBDaGF0U3RhdGUsIHR5cGUgSVNlc3Npb25XaXRoRGVmYXVsdENoYXQsIHR5cGUgSUNvbXBsZXRlZFRvb2xDYWxsLCB0eXBlIElucHV0UmVxdWVzdFJlc3BvbnNlUGFydCwgdHlwZSBNYXJrZG93blJlc3BvbnNlUGFydCwgdHlwZSBNZXNzYWdlLCB0eXBlIE1lc3NhZ2VBdHRhY2htZW50LCB0eXBlIE1lc3NhZ2VBbm5vdGF0aW9uc0F0dGFjaG1lbnQsIHR5cGUgTWVzc2FnZUNoYXRBdHRhY2htZW50LCB0eXBlIE1lc3NhZ2VSZXNvdXJjZUF0dGFjaG1lbnQsIHR5cGUgTWVzc2FnZUVtYmVkZGVkUmVzb3VyY2VBdHRhY2htZW50LCB0eXBlIE1vZGVsU2VsZWN0aW9uLCB0eXBlIFBlbmRpbmdNZXNzYWdlLCB0eXBlIFJlYXNvbmluZ1Jlc3BvbnNlUGFydCwgdHlwZSBSb290U3RhdGUsIHR5cGUgQ2hhdElucHV0QW5zd2VyLCB0eXBlIENoYXRJbnB1dFF1ZXN0aW9uLCB0eXBlIENoYXRJbnB1dFJlcXVlc3QsIHR5cGUgU2Vzc2lvblN0YXRlLCB0eXBlIFN0cmluZ09yTWFya2Rvd24sIHR5cGUgVG9vbENhbGxSZXNwb25zZVBhcnQsIHR5cGUgVG9vbENhbGxTdGF0ZSwgdHlwZSBUb29sSW5wdXQsIHR5cGUgVHVybiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgcGFja0Vycm9yRm9yVGVsZW1ldHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi9lcnJvclRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci9hZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsQ2hhdFNlcnZpY2UsIHR5cGUgSVRlcm1pbmFsSW5zdGFuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7XG5cdEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kLFxuXHRDaGF0VHJhbnNjcmlwdENvbnRleHRBdHRhY2htZW50RGlzcGxheUtpbmQsXG5cdGdldEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kLFxuXHRpc0FnZW50RmVlZGJhY2tWYXJpYWJsZUVudHJ5LFxuXHRpc0Jyb3dzZXJWaWV3VmFyaWFibGVFbnRyeSxcblx0aXNDaGF0UmVmZXJlbmNlVmFyaWFibGVFbnRyeSxcblx0aXNDaGF0VHJhbnNjcmlwdENvbnRleHRWYXJpYWJsZUVudHJ5LFxuXHRpc0ltYWdlVmFyaWFibGVFbnRyeSxcblx0dG9DaGF0VHJhbnNjcmlwdENvbnRleHRBdHRhY2htZW50TWV0YSxcblx0dHlwZSBJQWdlbnRGZWVkYmFja1ZhcmlhYmxlRW50cnksXG5cdHR5cGUgSUNoYXRSZXF1ZXN0Q2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnksXG5cdHR5cGUgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSxcblx0dHlwZSBJRWxlbWVudFZhcmlhYmxlRW50cnksXG5cdHR5cGUgSUltYWdlVmFyaWFibGVFbnRyeVxufSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBjb2VyY2VJbWFnZUJ1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0SW1hZ2VFeHRyYWN0aW9uLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0UXVldWVLaW5kLCBDb25maXJtZWRSZWFzb24sIEVsaWNpdGF0aW9uU3RhdGUsIElDaGF0UHJvZ3Jlc3MsIElDaGF0UXVlc3Rpb25BbnN3ZXJzLCBJQ2hhdFNlcnZpY2UsIElDaGF0VG9vbEludm9jYXRpb24sIElSZW1vdGVQZW5kaW5nUmVxdWVzdCwgVG9vbENvbmZpcm1LaW5kLCB0eXBlIElDaGF0QXV0b01vZGVSZXNvbHV0aW9uUGFydCwgdHlwZSBJQ2hhdE1jcEF1dGhlbnRpY2F0aW9uUmVxdWlyZWQsIHR5cGUgSUNoYXRNY3BBdXRoZW50aWNhdGlvblJlcXVpcmVkU2VydmVyLCB0eXBlIElDaGF0TWNwU3RhcnRpbmdTZXJ2ZXIsIHR5cGUgSUNoYXRNdWx0aVNlbGVjdEFuc3dlciwgdHlwZSBJQ2hhdFBsYW5SZXZpZXdSZXN1bHQsIHR5cGUgSUNoYXRSZXNwb25zZUVycm9yRGV0YWlscywgdHlwZSBJQ2hhdFNpbmdsZVNlbGVjdEFuc3dlciwgdHlwZSBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbiwgSUNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyLCBJQ2hhdFNlc3Npb25IaXN0b3J5SXRlbSwgSUNoYXRTZXNzaW9uSXRlbSwgSUNoYXRTZXNzaW9uUmVxdWVzdEhpc3RvcnlJdGVtLCBpc1Rlcm1pbmFsQ29tbWFuZFByb21wdCwgU2Vzc2lvblR5cGUsIHR5cGUgSUNoYXRJbnB1dENvbXBsZXRpb25JdGVtLCB0eXBlIElDaGF0SW5wdXRDb21wbGV0aW9uc1BhcmFtcywgdHlwZSBJQ2hhdElucHV0Q29tcGxldGlvbnNSZXN1bHQsIHR5cGUgSUNoYXRTZXNzaW9uU2VydmVyUmVxdWVzdCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0TW9kZXMuanMnO1xuaW1wb3J0IHsgQ0hBVF9TVUJBR0VOVF9SRVNPVVJDRV9RVUVSWV9QQVJBTSwgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRDb25maWd1cmF0aW9uLCBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElDaGF0RWRpdGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0TGFuZ3VhZ2VNb2RlbERpc3BsYXlOYW1lV2l0aFByb3ZpZGVyLCBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBDaGF0SW5wdXRTdGF0ZU9yaWdpbiwgcmV2aXZlU2VyaWFsaXphYmxlSW5wdXRTdGF0ZSwgdHlwZSBJQ2hhdE1vZGVsLCB0eXBlIElDaGF0TW9kZWxJbnB1dFN0YXRlLCB0eXBlIElDaGF0UmVxdWVzdFZhcmlhYmxlRGF0YSwgdHlwZSBJSW5wdXRNb2RlbCwgdHlwZSBJU2VyaWFsaXphYmxlQ2hhdE1vZGVsSW5wdXRTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdEVsaWNpdGF0aW9uUmVxdWVzdFBhcnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFByb2dyZXNzVHlwZXMvY2hhdEVsaWNpdGF0aW9uUmVxdWVzdFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFRvb2xJbnZvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRUb29sSW52b2NhdGlvbi5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUsIGlzVW50aXRsZWRDaGF0U2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IElDaGF0QWdlbnREYXRhLCBJQ2hhdEFnZW50SW1wbGVtZW50YXRpb24sIElDaGF0QWdlbnRSZXF1ZXN0LCBJQ2hhdEFnZW50UmVzdWx0LCBJQ2hhdEFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgSVRvb2xSZXN1bHQsIHN0cmluZ2lmeVByb21wdFRzeFBhcnQsIFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBnZXRBZ2VudFNlc3Npb25Qcm92aWRlckljb24gfSBmcm9tICcuLi9hZ2VudFNlc3Npb25zLmpzJztcbmltcG9ydCB7IElBZ2VudEN1c3RvbWl6YXRpb25TY29wZSwgSUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZXNvbHZlciB9IGZyb20gJy4vYWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTeW5jaHJvbml6ZXIgfSBmcm9tICcuL2FnZW50SG9zdFNlc3Npb25Xb3JraW5nRGlyZWN0b3J5U3luY2hyb25pemVyLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3ROZXdTZXNzaW9uRm9sZGVyU2VydmljZSwgY29tcHV0ZVdvcmtpbmdEaXJlY3RvcmllcyB9IGZyb20gJy4vYWdlbnRIb3N0TmV3U2Vzc2lvbkZvbGRlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U25hcHNob3RDb250cm9sbGVyIH0gZnJvbSAnLi9hZ2VudEhvc3RTbmFwc2hvdENvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0UmVzcG9uc2VGaWxlQ2hhbmdlc1Byb3ZpZGVyIH0gZnJvbSAnLi9hZ2VudEhvc3RSZXNwb25zZUZpbGVDaGFuZ2VzLmpzJztcbmltcG9ydCB0eXBlIHsgQWdlbnRIb3N0UHJvbXB0Q2FjaGVOb3RpZmljYXRpb24gfSBmcm9tICcuL2FnZW50SG9zdFByb21wdENhY2hlTm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U2Vzc2lvblJlZmVyZW5jZUF0dGFjaG1lbnREaXNwbGF5S2luZCwgQWdlbnRIb3N0U2Vzc2lvblJlZmVyZW5jZVRyYWplY3RvcnlBdHRhY2htZW50RGlzcGxheUtpbmQsIHRvU2Vzc2lvblJlZmVyZW5jZUF0dGFjaG1lbnRNZXRhLCB0b1Nlc3Npb25SZWZlcmVuY2VNb2RlbFJlcHJlc2VudGF0aW9uIH0gZnJvbSAnLi9hZ2VudEhvc3RTZXNzaW9uUmVmZXJlbmNlQXR0YWNobWVudC5qcyc7XG5pbXBvcnQgeyBidWlsZEhvc3RMb2NhbEV2ZW50c1BhdGggfSBmcm9tICcuLi8uLi9jb3BpbG90Q2xpRXZlbnRzVXJpLmpzJztcbmltcG9ydCB7IHRvb2xEYXRhVG9EZWZpbml0aW9uIH0gZnJvbSAnLi9hZ2VudEhvc3RUb29sVXRpbHMuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZSB9IGZyb20gJy4vYWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZSB9IGZyb20gJy4vYWdlbnRIb3N0SW1wb3J0Q29udmVyc2F0aW9uU3RvcmUuanMnO1xuaW1wb3J0IHsgYWN0aXZlVHVyblRvUHJvZ3Jlc3MsIEJPT0xFQU5fVFJVRV9PUFRJT05fSUQsIGNvbXBsZXRlZFRvb2xDYWxsVG9FZGl0UGFydHMsIGNvbXBsZXRlZFRvb2xDYWxsVG9TZXJpYWxpemVkLCBjb250YWluc0F1dG9tYXRpY1JlcGx5QW5zd2VyLCBjb252ZXJ0UHJvdG9jb2xBbnN3ZXJzLCBjb252ZXJ0UHJvdG9jb2xQbGFuUmV2aWV3UmVzdWx0LCBjcmVhdGVJbnB1dFJlcXVlc3RDYXJvdXNlbCwgY3JlYXRlSW5wdXRSZXF1ZXN0UGxhblJldmlldywgZmluYWxpemVUb29sSW52b2NhdGlvbiwgZm9ybWF0VHVyblJlc3BvbnNlRGV0YWlscywgZ2V0VGVybWluYWxDb250ZW50LCBnZXRVcmxJbnB1dFJlcXVlc3RQcmVzZW50YXRpb24sIGlzU3ViYWdlbnRUb29sLCBtYWtlQWhwVGVybWluYWxUb29sU2Vzc2lvbklkLCBtZXNzYWdlQXR0YWNobWVudHNUb1ZhcmlhYmxlRGF0YSwgbWVzc2FnZVRvUmVxdWVzdE9yaWdpbiwgbWVzc2FnZVRvVmFyaWFibGVEYXRhLCBwYXJzZUFocFRlcm1pbmFsVG9vbFNlc3Npb25JZCwgcmV3cml0ZUFnZW50SG9zdExpbmtUYXJnZXQsIHNob3VsZE9ic2VydmVTdWJhZ2VudENoYXQsIHN0cmluZ09yTWFya2Rvd25Ub1N0cmluZywgc3lzdGVtTm90aWZpY2F0aW9uVG9DaGF0UGFydCwgdG9vbENhbGxBdXRoZW50aWNhdGlvblNlcnZlciwgdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbiwgdG9vbENhbGxTdGF0ZVRvUHJlcGFyZWRJbnZvY2F0aW9uLCB0b29sQ2FsbFN0YXRlVG9TdHJlYW1pbmdJbnZvY2F0aW9uLCB0dXJuc1RvSGlzdG9yeSwgdXBkYXRlUnVubmluZ1Rvb2xTcGVjaWZpY0RhdGEsIHVwZGF0ZVN0cmVhbWluZ1Rvb2xJbnZvY2F0aW9uLCB1c2FnZUluZm9Ub0F1dG9Nb2RlUmVzb2x1dGlvbiwgdXNhZ2VJbmZvVG9DaGF0VXNhZ2UsIHVzYWdlSW5mb1RvUXVvdGFzLCB0eXBlIElBZ2VudEhvc3RUb29sSW52b2NhdGlvbk9wdGlvbnMsIHR5cGUgSVRvb2xDYWxsRmlsZUVkaXQsIHR5cGUgVHVybk1vZGVsTG9va3VwIH0gZnJvbSAnLi9zdGF0ZVRvUHJvZ3Jlc3NBZGFwdGVyLmpzJztcbmltcG9ydCB7IHJlc29sdmVNY3BTZXJ2ZXJBdXRoZW50aWNhdGlvbiwgYWdlbnRIb3N0TWNwU2VydmVySWQsIG1vZGVsUmVxdWlyZXNBZ2VudEF1dGhlbnRpY2F0aW9uIH0gZnJvbSAnLi9hZ2VudEhvc3RBdXRoLmpzJztcbmV4cG9ydCB7IHRvb2xEYXRhVG9EZWZpbml0aW9uIH07XG5cbi8qKlxuICogVXBwZXIgYm91bmQgb24gdGhlIGxpdmUgZWRpdG9yIHRleHQgd2UgaW5saW5lIGZvciBhbiB1bnNhdmVkIGRvY3VtZW50LCBtYXRjaGluZyB0aGUgMSBNQiBwZXItZmlsZSBjYXAgY2hhdCB1c2VzXG4gKiBlbHNld2hlcmUgKGBjaGF0UmVwb0luZm9gKS4gTGFyZ2VyIGJ1ZmZlcnMgYXJlIG5vdCBpbmxpbmVkOyBhIGRpcnR5IHNhdmVkIGZpbGUgdGhlbiBmYWxscyBiYWNrIHRvIGl0cyBvbi1kaXNrIHBhdGguXG4gKi9cbmNvbnN0IE1BWF9JTkxJTkVEX1VOU0FWRURfRURJVE9SX0JZVEVTID0gMTAyNCAqIDEwMjQ7XG5cbi8qKiBTdGFibGUgaWQgb2YgdGhlIHByb2dyZXNzIHJvdyBtaXJyb3JpbmcgdGhlIGhvc3QncyBjaGF0IGFjdGl2aXR5LCBzbyB1cGRhdGVzIHJlcGxhY2UgaXQgaW4gcGxhY2UuICovXG5jb25zdCBDSEFUX0FDVElWSVRZX1BST0dSRVNTX0lEID0gJ2FnZW50SG9zdC5jaGF0QWN0aXZpdHknO1xuXG5leHBvcnQgY29uc3QgVU5PQlNFUlZFRF9DTElFTlRfVE9PTF9HUkFDRV9NUyA9IDUwMDA7XG50eXBlIEFnZW50SG9zdEludm9jYXRpb25GYWlsdXJlU3RhZ2UgPSAncmVzb2x2ZVNlc3Npb24nIHwgJ3Byb3Zpc2lvbmFsU2Vzc2lvbicgfCAnc2Vzc2lvblN0YXRlJyB8ICdhdXRoZW50aWNhdGlvbicgfCAnY3JlYXRlU2Vzc2lvbicgfCAnc3Vic2NyaWJlU2Vzc2lvbicgfCAncHJlcGFyZVR1cm4nIHwgJ2Rpc3BhdGNoVHVybicgfCAnb2JzZXJ2ZVR1cm4nO1xuXG5pbnRlcmZhY2UgSVJlc3RvcmVkU3ViYWdlbnRTdGF0ZSBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHZvaWQ+O1xuXHRnZXRTdGF0ZSgpOiBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCB8IHVuZGVmaW5lZDtcbn1cblxudHlwZSBBZ2VudEhvc3RJbnZvY2F0aW9uRmFpbGVkRXZlbnQgPSB7XG5cdHJlcXVlc3RJZDogc3RyaW5nO1xuXHRwcm92aWRlcjogc3RyaW5nO1xuXHRmYWlsdXJlU3RhZ2U6IEFnZW50SG9zdEludm9jYXRpb25GYWlsdXJlU3RhZ2U7XG5cdGlzRmlyc3RSZXF1ZXN0OiBib29sZWFuO1xuXHRoYXNVc2VyU2VsZWN0ZWRNb2RlbDogYm9vbGVhbjtcblx0ZXJyb3JOYW1lOiBzdHJpbmc7XG5cdGVycm9yQ29kZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRtc2c6IHN0cmluZztcblx0Y2FsbHN0YWNrOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59O1xuXG50eXBlIEFnZW50SG9zdEludm9jYXRpb25GYWlsZWRDbGFzc2lmaWNhdGlvbiA9IHtcblx0cmVxdWVzdElkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGNoYXQgcmVxdWVzdCBpZGVudGlmaWVyLCB1c2VkIHRvIGNvcnJlbGF0ZSB0aGlzIGZhaWx1cmUgd2l0aCBwcm92aWRlciBhbmQgaG9zdCB0dXJuIHRlbGVtZXRyeS4nIH07XG5cdHByb3ZpZGVyOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGFnZW50IGhvc3QgcHJvdmlkZXIgaGFuZGxpbmcgdGhlIHJlcXVlc3QuJyB9O1xuXHRmYWlsdXJlU3RhZ2U6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgYm91bmRlZCB3b3JrYmVuY2ggYWRhcHRlciBzdGFnZSBhdCB3aGljaCB0aGUgcmVxdWVzdCBmYWlsZWQuJyB9O1xuXHRpc0ZpcnN0UmVxdWVzdDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1doZXRoZXIgdGhpcyB3YXMgdGhlIGZpcnN0IHJlcXVlc3QgaW4gdGhlIGNoYXQgc2Vzc2lvbi4nIH07XG5cdGhhc1VzZXJTZWxlY3RlZE1vZGVsOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnV2hldGhlciB0aGUgd29ya2JlbmNoIHJlcXVlc3QgY2FycmllZCBhIHNlbGVjdGVkIGxhbmd1YWdlIG1vZGVsIGlkZW50aWZpZXIuJyB9O1xuXHRlcnJvck5hbWU6IHsgY2xhc3NpZmljYXRpb246ICdDYWxsc3RhY2tPckV4Y2VwdGlvbic7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgbmFtZSBvZiB0aGUgZXhjZXB0aW9uLicgfTtcblx0ZXJyb3JDb2RlOiB7IGNsYXNzaWZpY2F0aW9uOiAnQ2FsbHN0YWNrT3JFeGNlcHRpb24nOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGV4Y2VwdGlvbiBvciBwcm90b2NvbCBlcnJvciBjb2RlLCB3aGVuIGF2YWlsYWJsZS4nIH07XG5cdG1zZzogeyBjbGFzc2lmaWNhdGlvbjogJ0NhbGxzdGFja09yRXhjZXB0aW9uJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBlcnJvciBtZXNzYWdlLiBWUyBDb2RlIHRlbGVtZXRyeSBzY3J1YnMgZmlsZSBwYXRocyBhbmQgbGlrZWx5IHNlY3JldHMgYmVmb3JlIHRyYW5zbWlzc2lvbi4nIH07XG5cdGNhbGxzdGFjazogeyBjbGFzc2lmaWNhdGlvbjogJ0NhbGxzdGFja09yRXhjZXB0aW9uJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBlcnJvciBzdGFjay4gVlMgQ29kZSB0ZWxlbWV0cnkgc2NydWJzIGZpbGUgcGF0aHMgYW5kIGxpa2VseSBzZWNyZXRzIGJlZm9yZSB0cmFuc21pc3Npb24uJyB9O1xuXHRvd25lcjogJ3JvYmxvdXJlbnMnO1xuXHRjb21tZW50OiAnQ2FwdHVyZXMgZXJyb3JzIHRoYXQgcHJldmVudCBhbiBhZ2VudCBob3N0IHJlcXVlc3QgZnJvbSByZWFjaGluZyBhIHRlcm1pbmFsIGhvc3QgdHVybi4nO1xufTtcblxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gQWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIgLSByZW5kZXJlci1zaWRlIGhhbmRsZXIgZm9yIGEgc2luZ2xlIGFnZW50IGhvc3Rcbi8vIGNoYXQgc2Vzc2lvbiB0eXBlLiBCcmlkZ2VzIHRoZSBwcm90b2NvbCBzdGF0ZSBsYXllciB3aXRoIHRoZSBjaGF0IFVJOlxuLy8gc3Vic2NyaWJlcyB0byBzZXNzaW9uIHN0YXRlLCBkZXJpdmVzIElDaGF0UHJvZ3Jlc3NbXSBmcm9tIGltbXV0YWJsZSBzdGF0ZVxuLy8gY2hhbmdlcywgYW5kIGRpc3BhdGNoZXMgY2xpZW50IGFjdGlvbnMgKHR1cm5TdGFydGVkLCB0b29sQ2FsbENvbmZpcm1lZCxcbi8vIHR1cm5DYW5jZWxsZWQpIGJhY2sgdG8gdGhlIHNlcnZlci5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogT3B0aW9ucyB0aHJlYWRlZCBpbnRvIHtAbGluayBBZ2VudEhvc3RTZXNzaW9uSGFuZGxlci5fb2JzZXJ2ZVR1cm59LiBUaGVcbiAqIHNhbWUgb2JzZXJ2YXRpb24gcGlwZWxpbmUgaXMgdXNlZCBmb3IgbGl2ZSAoYF9oYW5kbGVUdXJuYCksIHJlY29ubmVjdGVkXG4gKiAoc25hcHNob3QgZnJvbSBgcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudGApLCBhbmQgc2VydmVyLWluaXRpYXRlZCB0dXJuc1xuICogKGBfd2F0Y2hGb3JTZXJ2ZXJJbml0aWF0ZWRUdXJuc2ApLiBUaGUgZGlmZmVyZW5jZXMgYXJlIGNhcHR1cmVkIGhlcmU6XG4gKlxuICogLSB7QGxpbmsgc2lua30gcm91dGVzIGVtaXR0ZWQgcHJvZ3Jlc3MgdG8gZWl0aGVyIHRoZSBhZ2VudCBpbnZva2VcbiAqICAgY2FsbGJhY2sgKGxpdmUpIG9yIGBjaGF0U2Vzc2lvbi5hcHBlbmRQcm9ncmVzc2AgKHJlY29ubmVjdCAvXG4gKiAgIHNlcnZlci1pbml0aWF0ZWQpLlxuICogLSB7QGxpbmsgYWRvcHRJbnZvY2F0aW9uc30gY2FycmllcyBgQ2hhdFRvb2xJbnZvY2F0aW9uYCBpbnN0YW5jZXMgdGhhdFxuICogICBgYWN0aXZlVHVyblRvUHJvZ3Jlc3NgIGFscmVhZHkgcHJvZHVjZWQgc28gcGVyLXRvb2wgc2V0dXAgYWRvcHRzIHRoZW1cbiAqICAgcmF0aGVyIHRoYW4gcmVjcmVhdGluZyBVSSBoYW5kbGVzLlxuICogLSB7QGxpbmsgc2VlZEVtaXR0ZWRMZW5ndGhzfSBwcmV2ZW50cyB0aGUgYWx3YXlzLW9uIGdyYXBoIGZyb20gcmUtZW1pdHRpbmdcbiAqICAgbWFya2Rvd24gLyByZWFzb25pbmcgcHJlZml4ZXMgYWxyZWFkeSBjb3ZlcmVkIGJ5IHRoZSBzbmFwc2hvdC5cbiAqIC0ge0BsaW5rIG9uVHVybkVuZGVkfSBmaXJlcyBvbmNlIHdoZW4gdGhlIHR1cm4gcmVhY2hlcyBhIHRlcm1pbmFsIHN0YXRlLlxuICovXG5pbnRlcmZhY2UgSU9ic2VydmVUdXJuT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGJhY2tlbmRTZXNzaW9uOiBVUkk7XG5cdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogVVJJO1xuXHQvKipcblx0ICogVGhlIGNoYXQgY2hhbm5lbCBVUkkgKGFzIGEgc3RyaW5nKSB0aGlzIHR1cm4ncyBjb252ZXJzYXRpb24gYWN0aW9uc1xuXHQgKiAodHVybiBsaWZlY3ljbGUsIHRvb2wgY2FsbHMsIGlucHV0IGFuc3dlcnMpIGRpc3BhdGNoIHRvLiBGb3IgYSBzZXNzaW9uJ3Ncblx0ICogZGVmYXVsdCBjaGF0IHRoaXMgaXMgdGhlIGRlZmF1bHQgY2hhdCBVUkk7IGZvciBhbiBhZGRpdGlvbmFsIHBlZXIgY2hhdCBpdFxuXHQgKiBpcyB0aGF0IGNoYXQncyBVUkkuIFJlc29sdmVkIGZyb20gdGhlIHVwc3RyZWFtIHNlc3Npb24vY2hhdCBzdGF0ZSBhbmRcblx0ICogc3RvcmVkIGluIHtAbGluayBBZ2VudEhvc3RTZXNzaW9uSGFuZGxlci5fY2hhdFVSSXNCeVNlc3Npb25SZXNvdXJjZX0uXG5cdCAqL1xuXHRyZWFkb25seSBjaGF0VVJJOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHR1cm5JZDogc3RyaW5nO1xuXHRyZWFkb25seSBzaW5rOiAocGFydHM6IElDaGF0UHJvZ3Jlc3NbXSkgPT4gdm9pZDtcblx0cmVhZG9ubHkgY2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuO1xuXHRyZWFkb25seSBhZG9wdEludm9jYXRpb25zPzogUmVhZG9ubHlNYXA8c3RyaW5nLCBDaGF0VG9vbEludm9jYXRpb24+O1xuXHRyZWFkb25seSBzZWVkRW1pdHRlZExlbmd0aHM/OiBSZWFkb25seU1hcDxzdHJpbmcsIG51bWJlcj47XG5cdHJlYWRvbmx5IGluaXRpYWxSZXNwb25zZVBhcnRDb3VudD86IG51bWJlcjtcblx0cmVhZG9ubHkgb25UdXJuRW5kZWQ/OiAobGFzdFR1cm46IFR1cm4gfCB1bmRlZmluZWQpID0+IHZvaWQ7XG5cdHJlYWRvbmx5IG9uRmlsZUVkaXRzPzogKHRjOiBUb29sQ2FsbFN0YXRlLCBmaWxlRWRpdHM6IElUb29sQ2FsbEZpbGVFZGl0W10pID0+IHZvaWQ7XG5cdC8qKlxuXHQgKiBXaGVuIHNldCwgYSBmYWlsZWQgdHVybiBkb2VzIE5PVCBlbWl0IGl0cyBlcnJvciBhcyBhIG1hcmtkb3duIHByb2dyZXNzXG5cdCAqIHBhcnQuIFRoZSBjYWxsZXIgc3VyZmFjZXMgaXQgaW5zdGVhZCBhcyB0aGUgYWdlbnQgcmVzdWx0J3Ncblx0ICogYGVycm9yRGV0YWlsc2AgKGUuZy4gc28gcXVvdGEgZXJyb3JzIHJlbmRlciB0aGUgdXBncmFkZSBhZmZvcmRhbmNlKS5cblx0ICovXG5cdHJlYWRvbmx5IHN1cHByZXNzRXJyb3JNYXJrZG93bj86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBXaGVuIHNldCwgdGhpcyB0dXJuIGlzIGJlaW5nIG9ic2VydmVkIGFzIHBhcnQgb2YgYSBzdWJhZ2VudCBzZXNzaW9uLlxuXHQgKiBUb29sIGNhbGxzIGVtaXR0ZWQgaW50byB7QGxpbmsgc2lua30gYXJlIHRhZ2dlZCB3aXRoIHRoaXMgaWQgc28gdGhlXG5cdCAqIHJlbmRlcmVyIGdyb3VwcyB0aGVtIHVuZGVyIHRoZSBwYXJlbnQgc3ViYWdlbnQgd2lkZ2V0LiBNYXJrZG93bixcblx0ICogcmVhc29uaW5nLCBhbmQgaW5wdXQgcmVxdWVzdHMgYXJlIG5vdCBmb3J3YXJkZWQgKHRoZSBzdWJhZ2VudCdzIG93blxuXHQgKiBzZXNzaW9uIHZpZXcgcmVuZGVycyB0aG9zZSk7IG5lc3RlZCBzdWJhZ2VudHMgYXJlIG9ic2VydmVkIHJlY3Vyc2l2ZWx5LlxuXHQgKi9cblx0cmVhZG9ubHkgc3ViQWdlbnRJbnZvY2F0aW9uSWQ/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBXaGVuIHNldCBvbiBhIHN1YmFnZW50IHR1cm4gb2JzZXJ2ZXIsIGFuIG9ic2VydmFibGUgdGhhdCBhY2N1bXVsYXRlc1xuXHQgKiBjb3BpbG90IGNyZWRpdHMgcmVwb3J0ZWQgYnkgdGhpcyBzdWJhZ2VudCdzIHR1cm5zLiBTdWJhZ2VudCB0dXJuXG5cdCAqIG9ic2VydmVycyBhZGQgdGhlaXIgY3JlZGl0cyBoZXJlOyB0aGUgdmFsdWUgaXMgc3VyZmFjZWQgb24gdGhlIHN1YmFnZW50XG5cdCAqIHRvb2wncyBob3ZlciBhbmQgZm9yd2FyZGVkIGludG8gdGhlIHBhcmVudCB0dXJuJ3Mgc2hhcmVkIGFjY3VtdWxhdG9yIHNvXG5cdCAqIHRoZSBzZXNzaW9uIGNvc3Qgc3RpbGwgaW5jbHVkZXMgdGhlbS5cblx0ICovXG5cdHJlYWRvbmx5IHN1YkFnZW50Q3JlZGl0c0FjY3VtdWxhdG9yPzogSVNldHRhYmxlT2JzZXJ2YWJsZTxudW1iZXI+O1xuXHQvKipcblx0ICogV2hlbiBzZXQgb24gYSBzdWJhZ2VudCB0dXJuIG9ic2VydmVyLCBhbiBvYnNlcnZhYmxlIHRoYXQgcmVjZWl2ZXMgdGhlXG5cdCAqIGRpc3BsYXkgbmFtZSBvZiB0aGUgbGFuZ3VhZ2UgbW9kZWwgdGhpcyBzdWJhZ2VudCdzIHR1cm5zIHJhbiBvbi4gVXNlZCB0b1xuXHQgKiBzdXJmYWNlIHRoZSBtb2RlbCBvbiB0aGUgc3ViYWdlbnQgdG9vbCdzIGhvdmVyIChtaXJyb3JzIHRoZSBsb2NhbFxuXHQgKiBzdWJhZ2VudCBwYXRoLCB3aGljaCBzZXRzIGBtb2RlbE5hbWVgIGRpcmVjdGx5KS5cblx0ICovXG5cdHJlYWRvbmx5IHN1YkFnZW50TW9kZWxPYnNlcnZhYmxlPzogSVNldHRhYmxlT2JzZXJ2YWJsZTxzdHJpbmcgfCB1bmRlZmluZWQ+O1xufVxuXG4vKipcbiAqIFNoYXJlZCBjb250ZXh0IGZvciBzdWJhZ2VudCBvYnNlcnZhdGlvbiB3aXRoaW4gYSBwYXJlbnQgdHVybi4gVHJhY2tzIHdoaWNoXG4gKiBzdWJhZ2VudCB0b29sIGNhbGxzIGFscmVhZHkgaGF2ZSBvYnNlcnZlcnMgc28gdGhleSBhcmVuJ3QgZG91YmxlLXN1YnNjcmliZWQuXG4gKi9cbmludGVyZmFjZSBJU3ViYWdlbnRDb250ZXh0IHtcblx0LyoqIEFjdGl2ZSBjaGlsZC1jaGF0IG9ic2VydmVycyBrZXllZCBieSB0aGVpciBzcGF3bmluZyB0b29sIGNhbGwuICovXG5cdHJlYWRvbmx5IG9ic2VydmF0aW9uczogRGlzcG9zYWJsZU1hcDxzdHJpbmc+O1xufVxuXG5pbnRlcmZhY2UgSU91dHB1dFRlcm1pbmFsQXR0YWNobWVudCB7XG5cdHNlc3Npb25JZD86IHN0cmluZztcblx0cmVhZG9ubHkgZGlzcG9zYWJsZTogTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+O1xufVxuXG5mdW5jdGlvbiBnZXRNY3BBdXRoZW50aWNhdGlvblJlcXVpcmVkU2VydmVycyhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgc3RhdGU6IElTZXNzaW9uV2l0aERlZmF1bHRDaGF0IHwgdW5kZWZpbmVkKTogSUNoYXRNY3BBdXRoZW50aWNhdGlvblJlcXVpcmVkU2VydmVyW10ge1xuXHRjb25zdCBzZXJ2ZXJzID0gc3RhdGU/LmN1c3RvbWl6YXRpb25zPy5mbGF0TWFwKGMgPT4gYy50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXJcblx0XHQ/IFtjXVxuXHRcdDogYy5jaGlsZHJlbj8uZmlsdGVyKGMgPT4gYy50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpID8/IFtdKSA/PyBbXTtcblx0Y29uc3QgdG9vbEF1dGhTZXJ2ZXJJZHMgPSBuZXcgU2V0KHN0YXRlPy5pbnB1dE5lZWRlZFxuXHRcdD8uZmlsdGVyKHJlcXVlc3QgPT4gcmVxdWVzdC5raW5kID09PSBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZC5Ub29sQXV0aGVudGljYXRpb24pXG5cdFx0Lm1hcChyZXF1ZXN0ID0+IHJlcXVlc3Qua2luZCA9PT0gU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQuVG9vbEF1dGhlbnRpY2F0aW9uXG5cdFx0XHQ/IHJlcXVlc3QudG9vbENhbGwuY29udHJpYnV0b3IuY3VzdG9taXphdGlvbklkXG5cdFx0XHQ6IHVuZGVmaW5lZClcblx0XHQuZmlsdGVyKGlkID0+IGlkICE9PSB1bmRlZmluZWQpKTtcblx0cmV0dXJuIHNlcnZlcnNcblx0XHQuZmlsdGVyKHNlcnZlciA9PiBpc0N1c3RvbWl6YXRpb25FbmFibGVkKHNlcnZlcikgJiYgc2VydmVyLnN0YXRlLmtpbmQgPT09IE1jcFNlcnZlclN0YXR1cy5BdXRoUmVxdWlyZWQgJiYgIXRvb2xBdXRoU2VydmVySWRzLmhhcyhzZXJ2ZXIuaWQpKVxuXHRcdC5tYXAoKHNlcnZlcik6IElDaGF0TWNwQXV0aGVudGljYXRpb25SZXF1aXJlZFNlcnZlciA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHNlcnZlci5zdGF0ZSBhcyBNY3BTZXJ2ZXJBdXRoUmVxdWlyZWRTdGF0ZTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiBzZXNzaW9uUmVzb3VyY2UuYXV0aG9yaXR5ICsgJy8nICsgc2VydmVyLmlkLFxuXHRcdFx0XHRuYW1lOiBzZXJ2ZXIubmFtZSxcblx0XHRcdFx0cmVzb3VyY2U6IHN0YXRlLnJlc291cmNlLnJlc291cmNlLFxuXHRcdFx0XHRvYXV0aENsaWVudDogc3RhdGUub2F1dGhDbGllbnQsXG5cdFx0XHRcdGF1dGhvcml6YXRpb25TZXJ2ZXJzOiBzdGF0ZS5yZXNvdXJjZS5hdXRob3JpemF0aW9uX3NlcnZlcnMsXG5cdFx0XHRcdHN1cHBvcnRlZFNjb3Blczogc3RhdGUucmVzb3VyY2Uuc2NvcGVzX3N1cHBvcnRlZCxcblx0XHRcdFx0cmVxdWlyZWRTY29wZXM6IHN0YXRlLnJlcXVpcmVkU2NvcGVzLFxuXHRcdFx0XHRyZWFzb246IHN0YXRlLnJlYXNvbixcblx0XHRcdH07XG5cdFx0fSk7XG59XG5cbmludGVyZmFjZSBJU3RhcnRTZXJ2ZXJSZXF1ZXN0T3B0aW9ucyB7XG5cdHJlYWRvbmx5IGlzU3lzdGVtSW5pdGlhdGVkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNIaWRkZW4/OiBib29sZWFuO1xuXHRyZWFkb25seSB0aW1lc3RhbXA/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGlzVGVybWluYWxSZXF1ZXN0PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgb3JpZ2luPzogSUNoYXRTZXNzaW9uU2VydmVyUmVxdWVzdFsnb3JpZ2luJ107XG59XG5cbmZ1bmN0aW9uIHBhcnNlVGltZXN0YW1wKHZhbHVlOiBzdHJpbmcpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRjb25zdCB0aW1lc3RhbXAgPSBEYXRlLnBhcnNlKHZhbHVlKTtcblx0cmV0dXJuIE51bWJlci5pc0Zpbml0ZSh0aW1lc3RhbXApID8gdGltZXN0YW1wIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBnZXRTdWJhZ2VudFRpbWluZyhzdGF0ZTogSVNlc3Npb25XaXRoRGVmYXVsdENoYXQpOiB7IHN0YXJ0ZWRBdDogbnVtYmVyIHwgdW5kZWZpbmVkOyBkdXJhdGlvbjogbnVtYmVyIHwgdW5kZWZpbmVkIH0ge1xuXHRjb25zdCB0dXJucyA9IHN0YXRlLmFjdGl2ZVR1cm4gPyBbLi4uc3RhdGUudHVybnMsIHN0YXRlLmFjdGl2ZVR1cm5dIDogc3RhdGUudHVybnM7XG5cdGNvbnN0IHN0YXJ0cyA9IHR1cm5zXG5cdFx0Lm1hcCh0dXJuID0+IHR1cm4uc3RhcnRlZEF0ID8gRGF0ZS5wYXJzZSh0dXJuLnN0YXJ0ZWRBdCkgOiB1bmRlZmluZWQpXG5cdFx0LmZpbHRlcigodGltZXN0YW1wKTogdGltZXN0YW1wIGlzIG51bWJlciA9PiB0aW1lc3RhbXAgIT09IHVuZGVmaW5lZCAmJiBOdW1iZXIuaXNGaW5pdGUodGltZXN0YW1wKSk7XG5cdGNvbnN0IHN0YXJ0ZWRBdCA9IHN0YXJ0cy5sZW5ndGggPiAwID8gTWF0aC5taW4oLi4uc3RhcnRzKSA6IHVuZGVmaW5lZDtcblx0aWYgKHN0YXJ0ZWRBdCA9PT0gdW5kZWZpbmVkIHx8IHN0YXRlLmFjdGl2ZVR1cm4pIHtcblx0XHRyZXR1cm4geyBzdGFydGVkQXQsIGR1cmF0aW9uOiB1bmRlZmluZWQgfTtcblx0fVxuXHRjb25zdCBlbmRzID0gc3RhdGUudHVybnMuZmxhdE1hcCh0dXJuID0+IHtcblx0XHRjb25zdCB0dXJuU3RhcnRlZEF0ID0gdHVybi5zdGFydGVkQXQgPyBEYXRlLnBhcnNlKHR1cm4uc3RhcnRlZEF0KSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gdHVyblN0YXJ0ZWRBdCAhPT0gdW5kZWZpbmVkICYmIE51bWJlci5pc0Zpbml0ZSh0dXJuU3RhcnRlZEF0KSAmJiB0eXBlb2YgdHVybi5kdXJhdGlvbiA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzRmluaXRlKHR1cm4uZHVyYXRpb24pXG5cdFx0XHQ/IFt0dXJuU3RhcnRlZEF0ICsgTWF0aC5tYXgoMCwgdHVybi5kdXJhdGlvbildXG5cdFx0XHQ6IFtdO1xuXHR9KTtcblx0Y29uc3QgZW5kZWRBdCA9IGVuZHMubGVuZ3RoID4gMCA/IE1hdGgubWF4KC4uLmVuZHMpIDogdW5kZWZpbmVkO1xuXHRyZXR1cm4geyBzdGFydGVkQXQsIGR1cmF0aW9uOiBlbmRlZEF0ICE9PSB1bmRlZmluZWQgPyBNYXRoLm1heCgwLCBlbmRlZEF0IC0gc3RhcnRlZEF0KSA6IHVuZGVmaW5lZCB9O1xufVxuXG5mdW5jdGlvbiB1c2VyT3JpZ2luTWVzc2FnZSh0ZXh0OiBzdHJpbmcsIGF0dGFjaG1lbnRzOiByZWFkb25seSBNZXNzYWdlQXR0YWNobWVudFtdIHwgdW5kZWZpbmVkKTogTWVzc2FnZSB7XG5cdHJldHVybiBhdHRhY2htZW50cz8ubGVuZ3RoXG5cdFx0PyB7IHRleHQsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sIGF0dGFjaG1lbnRzOiBbLi4uYXR0YWNobWVudHNdIH1cblx0XHQ6IHsgdGV4dCwgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9O1xufVxuXG4vKipcbiAqIEV4dHJhY3RzIGEgdXNlci1mYWNpbmcgbWVzc2FnZSBmcm9tIGEgc2Vzc2lvbi1sb2FkIGZhaWx1cmUgc28gdGhlIGFjdHVhbCBjYXVzZVxuICogKGUuZy4gYSBnaXQgd29ya3RyZWUtcmVjcmVhdGlvbiBlcnJvcikgaXMgc2hvd24gaW5zdGVhZCBvZiBhIGdlbmVyaWMgbWVzc2FnZS5cbiAqIFN0cmlwcyB0aGUgYEZhaWxlZCB0byByZXN0b3JlIHNlc3Npb24gPHVyaT46IGAgd3JhcHBlciB0aGF0IGBBZ2VudFNlcnZpY2VgXG4gKiBhZGRzIGFyb3VuZCByZXN0b3JlIGZhaWx1cmVzLiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gbm8gbWVzc2FnZSBpcyBhdmFpbGFibGUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1bndyYXBTZXNzaW9uTG9hZEVycm9yTWVzc2FnZShlcnI6IHVua25vd24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCBtZXNzYWdlID0gZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6ICh0eXBlb2YgZXJyID09PSAnc3RyaW5nJyA/IGVyciA6IHVuZGVmaW5lZCk7XG5cdGlmICghbWVzc2FnZSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvLyBUaGUgc2Vzc2lvbiBVUkkgaW4gdGhlIHByZWZpeCBjb250YWlucyBgc2NoZW1lOi9cdTIwMjZgIChjb2xvbi1zbGFzaCksIG5ldmVyXG5cdC8vIGA6IGAgKGNvbG9uLXNwYWNlKSwgc28gdGhlIG5vbi1ncmVlZHkgbWF0Y2ggc3RvcHMgYXQgdGhlIHdyYXBwZXIgc2VwYXJhdG9yLlxuXHRyZXR1cm4gbWVzc2FnZS5yZXBsYWNlKC9eRmFpbGVkIHRvIHJlc3RvcmUgc2Vzc2lvbiAuKz86IC8sICcnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVSZXN0b3JlZFN1YmFnZW50Q2hhdFJlc291cmNlKHBhcmVudFNlc3Npb246IHN0cmluZywgdG9vbENhbGxJZDogc3RyaW5nLCBjYXRhbG9nUmVzb3VyY2U6IHN0cmluZyB8IHVuZGVmaW5lZCwgcGVyc2lzdGVkUmVzb3VyY2U6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdGlmIChjYXRhbG9nUmVzb3VyY2UpIHtcblx0XHRyZXR1cm4gY2F0YWxvZ1Jlc291cmNlO1xuXHR9XG5cdGlmIChwZXJzaXN0ZWRSZXNvdXJjZSkge1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ2hhdFVyaShwZXJzaXN0ZWRSZXNvdXJjZSk7XG5cdFx0aWYgKHBhcnNlZD8uc2Vzc2lvbiA9PT0gcGFyZW50U2Vzc2lvbiAmJiBwYXJzZWQuY2hhdElkID09PSBgc3ViYWdlbnQvJHt0b29sQ2FsbElkfWApIHtcblx0XHRcdHJldHVybiBwZXJzaXN0ZWRSZXNvdXJjZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHBhcmVudFNlc3Npb24sIHRvb2xDYWxsSWQpO1xufVxuXG4vKipcbiAqIFJlc29sdmVzIGEgc2Vzc2lvbidzIGxhc3QtdXNlZCBtb2RlbCBzZWxlY3Rpb24gZnJvbSBpdHMgbGl2ZSB0dXJucy4gTW9kZWxcbiAqIHNlbGVjdGlvbiBtb3ZlZCBvZmYgdGhlIHNlc3Npb24vY2hhdCBzdW1tYXJ5IGFuZCBvbnRvIGVhY2gge0BsaW5rIE1lc3NhZ2V9O1xuICogdGhlIHZhbHVlIHRvIGRlZmF1bHQgdG8gaXMgdGhlIG9uZSBjYXJyaWVkIGJ5IHRoZSBtb3N0IHJlY2VudCB0dXJuICh0aGVcbiAqIGFjdGl2ZSB0dXJuIGlmIG9uZSBpcyBydW5uaW5nLCBlbHNlIHRoZSBsYXN0IGNvbXBsZXRlZCB0dXJuKS5cbiAqL1xuZnVuY3Rpb24gbGFzdFR1cm5Nb2RlbFNlbGVjdGlvbihzdGF0ZTogSVNlc3Npb25XaXRoRGVmYXVsdENoYXQgfCB1bmRlZmluZWQpOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBsYXN0VHVybk1lc3NhZ2Uoc3RhdGUpPy5tb2RlbDtcbn1cblxuLyoqXG4gKiBXaGV0aGVyIGEgcHJvZ3Jlc3MgZW1pc3Npb24gY291bnRzIGFzIHRoZSB0dXJuJ3MgZmlyc3QgdmlzaWJsZSBwcm9ncmVzc1xuICogZm9yIHRpbWUtdG8tZmlyc3QtcHJvZ3Jlc3MgdGVsZW1ldHJ5LiBNaXJyb3JzIHRoZSBhZ2VudCBob3N0J3Mgb3duXG4gKiBkZWZpbml0aW9uICh0ZXh0IGRlbHRhLCByZXNwb25zZSBwYXJ0LCB0b29sIGNhbGwgc3RhcnQsIG9yIHJlYXNvbmluZykuXG4gKi9cbmZ1bmN0aW9uIGlzRmlyc3RWaXNpYmxlUHJvZ3Jlc3NQYXJ0KHBhcnQ6IElDaGF0UHJvZ3Jlc3MpOiBib29sZWFuIHtcblx0cmV0dXJuIHBhcnQua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcgfHwgcGFydC5raW5kID09PSAndGhpbmtpbmcnIHx8IHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJztcbn1cblxuZnVuY3Rpb24gbGFzdFR1cm5NZXNzYWdlKHN0YXRlOiBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCB8IHVuZGVmaW5lZCk6IE1lc3NhZ2UgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gc3RhdGU/LmFjdGl2ZVR1cm4/Lm1lc3NhZ2UgPz8gKHN0YXRlICYmIHN0YXRlLnR1cm5zLmxlbmd0aCA/IHN0YXRlLnR1cm5zW3N0YXRlLnR1cm5zLmxlbmd0aCAtIDFdLm1lc3NhZ2UgOiB1bmRlZmluZWQpO1xufVxuXG5mdW5jdGlvbiBlbXB0eURyYWZ0RnJvbUxhc3RUdXJuKHN0YXRlOiBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCk6IE1lc3NhZ2UgfCB1bmRlZmluZWQge1xuXHRjb25zdCBtZXNzYWdlID0gbGFzdFR1cm5NZXNzYWdlKHN0YXRlKTtcblx0aWYgKCFtZXNzYWdlPy5tb2RlbCAmJiAhbWVzc2FnZT8uYWdlbnQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiB7XG5cdFx0dGV4dDogJycsXG5cdFx0b3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSxcblx0XHQuLi4obWVzc2FnZS5tb2RlbCA/IHsgbW9kZWw6IG1lc3NhZ2UubW9kZWwgfSA6IHt9KSxcblx0XHQuLi4obWVzc2FnZS5hZ2VudCA/IHsgYWdlbnQ6IG1lc3NhZ2UuYWdlbnQgfSA6IHt9KSxcblx0fTtcbn1cblxuLyoqXG4gKiBXaGV0aGVyIHR3byBkcmFmdHMgY2FycnkgdGhlIHNhbWUgdXNlci1hdXRob3JlZCBjb250ZW50LCBpZ25vcmluZyB0aGVcbiAqIHtAbGluayBNZXNzYWdlLm1vZGVsIHwgbW9kZWx9IC8ge0BsaW5rIE1lc3NhZ2UuYWdlbnQgfCBhZ2VudH0gc2VsZWN0aW9uLlxuICpcbiAqIFVzZWQgdG8gcmVjb2duaXplIGEgZHJhZnQgdGhhdCBkaWZmZXJzIGZyb20gYW4gYXBwbGllZCByZW1vdGUgb25lIG9ubHlcbiAqIGJlY2F1c2UgdGhpcyBjbGllbnQgc3Vic3RpdHV0ZWQgYSBtb2RlbCBpdCBjb3VsZCByZXNvbHZlIGxvY2FsbHksIHdoaWNoIG11c3RcbiAqIG5vdCBiZSBwdWJsaXNoZWQgYmFjayBvdmVyIHRoZSBvcmlnaW5hdGluZyBjbGllbnQncyBzZWxlY3Rpb24uXG4gKi9cbmZ1bmN0aW9uIHNhbWVEcmFmdFVzZXJDb250ZW50KGE6IE1lc3NhZ2UgfCB1bmRlZmluZWQsIGI6IE1lc3NhZ2UgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0cmV0dXJuIChhPy50ZXh0ID8/ICcnKSA9PT0gKGI/LnRleHQgPz8gJycpICYmIGVxdWFscyhhPy5hdHRhY2htZW50cywgYj8uYXR0YWNobWVudHMpO1xufVxuXG4vKipcbiAqIE1hcCBhIGxvY2FsIHtAbGluayBDb25maXJtZWRSZWFzb259IChob3cgdGhlIHtAbGluayBDaGF0VG9vbEludm9jYXRpb259XG4gKiByZXNvbHZlZCBpdHMgY29uZmlybWF0aW9uIGdhdGUpIHRvIHRoZSBwcm90b2NvbCdzXG4gKiB7QGxpbmsgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb259LiBPbmx5IGNhbGxlZCBmb3IgYXBwcm92ZWQgcmVhc29uc1xuICogKHtAbGluayBUb29sQ29uZmlybUtpbmQuRGVuaWVkfSAvIHtAbGluayBUb29sQ29uZmlybUtpbmQuU2tpcHBlZH0gYXJlXG4gKiBoYW5kbGVkIGJ5IHRoZSBgYXBwcm92ZWQ6IGZhbHNlYCBicmFuY2gpLlxuICovXG5mdW5jdGlvbiBjb25maXJtZWRSZWFzb25Ub1Byb3RvY29sKHJlYXNvbjogQ29uZmlybWVkUmVhc29uIHwgdW5kZWZpbmVkKTogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24ge1xuXHRzd2l0Y2ggKHJlYXNvbj8udHlwZSkge1xuXHRcdGNhc2UgVG9vbENvbmZpcm1LaW5kLkNvbmZpcm1hdGlvbk5vdE5lZWRlZDpcblx0XHRcdHJldHVybiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQ7XG5cdFx0Y2FzZSBUb29sQ29uZmlybUtpbmQuU2V0dGluZzpcblx0XHRjYXNlIFRvb2xDb25maXJtS2luZC5MbVNlcnZpY2VQZXJUb29sOlxuXHRcdFx0cmV0dXJuIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLlNldHRpbmc7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Vc2VyQWN0aW9uO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldENsaWVudFRvb2xQcmVBcHByb3ZhbCh0b29sQ2FsbDogVG9vbENhbGxTdGF0ZSk6IENvbmZpcm1lZFJlYXNvbiB8IHVuZGVmaW5lZCB7XG5cdGlmIChyZWFkVG9vbENhbGxNZXRhKHRvb2xDYWxsKS5hdXRvQXBwcm92ZUJ5U2V0dGluZyA9PT0gdHJ1ZSkge1xuXHRcdHJldHVybiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5TZXR0aW5nLCBpZDogU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZSB9O1xuXHR9XG5cblx0Ly8gT25seSB0cnVzdCBgUnVubmluZ2AgYW5kIGBBdXRoUmVxdWlyZWRgIGFzIGV2aWRlbmNlIG9mIGEgZ2VudWluZVxuXHQvLyBhcHByb3ZhbDogdGhleSBjYW4gb25seSBiZSBlbnRlcmVkIGFmdGVyIHRoZSBhZ2VudCBob3N0IGNvbmZpcm1lZCB0aGVcblx0Ly8gY2FsbCwgc28gdGhlaXIgYGNvbmZpcm1lZGAgcmVhc29uIGlzIGF1dGhvcml0YXRpdmUuIGBDb21wbGV0ZWRgIGFuZFxuXHQvLyBgUGVuZGluZ1Jlc3VsdENvbmZpcm1hdGlvbmAgYXJlIGV4Y2x1ZGVkIGJlY2F1c2UgdGhlIHJlZHVjZXJcblx0Ly8gc3ludGhlc2l6ZXMgYSBgTm90TmVlZGVkYCBjb25maXJtYXRpb24gd2hlbiBhIGBDaGF0VG9vbENhbGxDb21wbGV0ZWBcblx0Ly8gYXJyaXZlcyB3aGlsZSB0aGUgY2FsbCBpcyBzdGlsbCBgUGVuZGluZ0NvbmZpcm1hdGlvbmAsIHdoaWNoIHdvdWxkXG5cdC8vIG90aGVyd2lzZSBsZXQgdXMgZmFsc2VseSBjb25maXJtIGFuZCBleGVjdXRlIGEgY2FsbCB0aGF0IHdhcyBuZXZlclxuXHQvLyBhcHByb3ZlZC5cblx0c3dpdGNoICh0b29sQ2FsbC5zdGF0dXMpIHtcblx0XHRjYXNlIFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmc6XG5cdFx0Y2FzZSBUb29sQ2FsbFN0YXR1cy5BdXRoUmVxdWlyZWQ6XG5cdFx0XHRzd2l0Y2ggKHRvb2xDYWxsLmNvbmZpcm1lZCkge1xuXHRcdFx0XHRjYXNlIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZDpcblx0XHRcdFx0XHRyZXR1cm4geyB0eXBlOiBUb29sQ29uZmlybUtpbmQuQ29uZmlybWF0aW9uTm90TmVlZGVkIH07XG5cdFx0XHRcdGNhc2UgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uU2V0dGluZzpcblx0XHRcdFx0XHRyZXR1cm4geyB0eXBlOiBUb29sQ29uZmlybUtpbmQuU2V0dGluZywgaWQ6IFNlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmUgfTtcblx0XHRcdFx0Y2FzZSBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Vc2VyQWN0aW9uOlxuXHRcdFx0XHRcdHJldHVybiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uIH07XG5cdFx0XHR9XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIFJldHVybnMgdGhlIHRvb2wgY2FsbCdzIGBfbWV0YWAgd2l0aCB0aGUgdHJhbnNpZW50XG4gKiB7QGxpbmsgSVRvb2xDYWxsTWV0YS50b29sU2VhcmNoQ2FuZGlkYXRlc30gY29ycHVzIHJlbW92ZWQuIEFsd2F5cyByZXR1cm5zIGFuXG4gKiBvYmplY3QgKG5ldmVyIGB1bmRlZmluZWRgKSBzbyBhIGNvbXBsZXRpb24gYWN0aW9uIGNhbiBmb3JjZS1yZXBsYWNlIHRoZSBwcmlvclxuICogYF9tZXRhYCBcdTIwMTQgdGhlIHJlZHVjZXIga2VlcHMgdGhlIGV4aXN0aW5nIGJhZyB3aGVuIGFuIGFjdGlvbiBvbWl0cyBvbmUsIHNvIGFuXG4gKiBleHBsaWNpdCBlbXB0eSByZXBsYWNlbWVudCBpcyB3aGF0IGFjdHVhbGx5IGRyb3BzIHRoZSBjYW5kaWRhdGVzLlxuICovXG5mdW5jdGlvbiBtZXRhV2l0aG91dFRvb2xTZWFyY2hDYW5kaWRhdGVzKHNvdXJjZTogeyByZWFkb25seSBfbWV0YT86IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH0pOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XG5cdGNvbnN0IG1ldGEgPSB7IC4uLnNvdXJjZS5fbWV0YSB9O1xuXHRkZWxldGUgbWV0YVsndG9vbFNlYXJjaENhbmRpZGF0ZXMnXTtcblx0cmV0dXJuIG1ldGE7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHJlc29sdmVUb29sSW5wdXQoY29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbiwgdG9vbElucHV0OiBUb29sSW5wdXQgfCB1bmRlZmluZWQpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRpZiAodG9vbElucHV0ID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gJ3t9Jztcblx0fVxuXHRpZiAodHlwZW9mIHRvb2xJbnB1dCA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gdG9vbElucHV0O1xuXHR9XG5cdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNvbm5lY3Rpb24ucmVzb3VyY2VSZWFkKFVSSS5wYXJzZSh0b29sSW5wdXQudXJpKSk7XG5cdHJldHVybiByZXN1bHQuZW5jb2RpbmcgPT09IENvbnRlbnRFbmNvZGluZy5CYXNlNjQgPyBkZWNvZGVCYXNlNjQocmVzdWx0LmRhdGEpLnRvU3RyaW5nKCkgOiByZXN1bHQuZGF0YTtcbn1cblxuLyoqXG4gKiBDb252ZXJ0cyBjYXJvdXNlbCBhbnN3ZXJzIChJQ2hhdFF1ZXN0aW9uQW5zd2VycykgdG8gcHJvdG9jb2xcbiAqIENoYXRJbnB1dEFuc3dlciByZWNvcmRzLCBoYW5kbGluZyB0ZXh0LCBzaW5nbGUtc2VsZWN0LFxuICogYm9vbGVhbiwgYW5kIG11bHRpLXNlbGVjdCBhbnN3ZXIgc2hhcGVzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY29udmVydENhcm91c2VsQW5zd2VycyhyYXc6IElDaGF0UXVlc3Rpb25BbnN3ZXJzLCBxdWVzdGlvbnM6IHJlYWRvbmx5IENoYXRJbnB1dFF1ZXN0aW9uW10gPSBbXSk6IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4ge1xuXHRjb25zdCBhbnN3ZXJzOiBSZWNvcmQ8c3RyaW5nLCBDaGF0SW5wdXRBbnN3ZXI+ID0ge307XG5cdGNvbnN0IHF1ZXN0aW9uS2luZHMgPSBuZXcgTWFwKHF1ZXN0aW9ucy5tYXAocXVlc3Rpb24gPT4gW3F1ZXN0aW9uLmlkLCBxdWVzdGlvbi5raW5kXSkpO1xuXHRmb3IgKGNvbnN0IFtxSWQsIGFuc3dlcl0gb2YgT2JqZWN0LmVudHJpZXMocmF3KSkge1xuXHRcdGlmICh0eXBlb2YgYW5zd2VyID09PSAnc3RyaW5nJykge1xuXHRcdFx0YW5zd2Vyc1txSWRdID0ge1xuXHRcdFx0XHRzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLFxuXHRcdFx0XHR2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuVGV4dCwgdmFsdWU6IGFuc3dlciB9LFxuXHRcdFx0fTtcblx0XHR9IGVsc2UgaWYgKGFuc3dlciAmJiB0eXBlb2YgYW5zd2VyID09PSAnb2JqZWN0Jykge1xuXHRcdFx0Y29uc3QgbXVsdGkgPSBhbnN3ZXIgYXMgSUNoYXRNdWx0aVNlbGVjdEFuc3dlcjtcblx0XHRcdGNvbnN0IHNpbmdsZSA9IGFuc3dlciBhcyBJQ2hhdFNpbmdsZVNlbGVjdEFuc3dlcjtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KG11bHRpLnNlbGVjdGVkVmFsdWVzKSkge1xuXHRcdFx0XHQvLyBNdWx0aS1zZWxlY3QgYW5zd2VyXG5cdFx0XHRcdGFuc3dlcnNbcUlkXSA9IHtcblx0XHRcdFx0XHRzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLFxuXHRcdFx0XHRcdHZhbHVlOiB7XG5cdFx0XHRcdFx0XHRraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuU2VsZWN0ZWRNYW55LFxuXHRcdFx0XHRcdFx0dmFsdWU6IG11bHRpLnNlbGVjdGVkVmFsdWVzLFxuXHRcdFx0XHRcdFx0ZnJlZWZvcm1WYWx1ZXM6IG11bHRpLmZyZWVmb3JtVmFsdWUgPyBbbXVsdGkuZnJlZWZvcm1WYWx1ZV0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSBpZiAoc2luZ2xlLnNlbGVjdGVkVmFsdWUgJiYgcXVlc3Rpb25LaW5kcy5nZXQocUlkKSA9PT0gQ2hhdElucHV0UXVlc3Rpb25LaW5kLkJvb2xlYW4pIHtcblx0XHRcdFx0YW5zd2Vyc1txSWRdID0ge1xuXHRcdFx0XHRcdHN0YXRlOiBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQsXG5cdFx0XHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0XHRcdGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5Cb29sZWFuLFxuXHRcdFx0XHRcdFx0dmFsdWU6IHNpbmdsZS5zZWxlY3RlZFZhbHVlID09PSBCT09MRUFOX1RSVUVfT1BUSU9OX0lELFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2UgaWYgKHNpbmdsZS5zZWxlY3RlZFZhbHVlKSB7XG5cdFx0XHRcdC8vIFNpbmdsZS1zZWxlY3QgYW5zd2VyXG5cdFx0XHRcdGFuc3dlcnNbcUlkXSA9IHtcblx0XHRcdFx0XHRzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLFxuXHRcdFx0XHRcdHZhbHVlOiB7XG5cdFx0XHRcdFx0XHRraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuU2VsZWN0ZWQsXG5cdFx0XHRcdFx0XHR2YWx1ZTogc2luZ2xlLnNlbGVjdGVkVmFsdWUsXG5cdFx0XHRcdFx0XHRmcmVlZm9ybVZhbHVlczogc2luZ2xlLmZyZWVmb3JtVmFsdWUgPyBbc2luZ2xlLmZyZWVmb3JtVmFsdWVdIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2UgaWYgKHNpbmdsZS5mcmVlZm9ybVZhbHVlKSB7XG5cdFx0XHRcdC8vIEZyZWVmb3JtLW9ubHkgYW5zd2VyIChubyBzZWxlY3Rpb24pXG5cdFx0XHRcdGFuc3dlcnNbcUlkXSA9IHtcblx0XHRcdFx0XHRzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLFxuXHRcdFx0XHRcdHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0LCB2YWx1ZTogc2luZ2xlLmZyZWVmb3JtVmFsdWUgfSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIGFuc3dlcnM7XG59XG5cbnR5cGUgUGxhblJldmlld0lucHV0Q29tcGxldGlvbiA9IHsgcmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZDsgYW5zd2Vycz86IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4gfTtcblxuZnVuY3Rpb24gZ2V0UGxhblJldmlld0FjdGlvbihwbGFuUmV2aWV3OiBJQWdlbnRIb3N0UGxhblJldmlldywgYWN0aW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgYWN0aW9uTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRpZiAoYWN0aW9uSWQpIHtcblx0XHRjb25zdCBhY3Rpb24gPSBwbGFuUmV2aWV3LmFjdGlvbnMuZmluZChhID0+IGEuaWQgPT09IGFjdGlvbklkKTtcblx0XHRpZiAoYWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4gYWN0aW9uO1xuXHRcdH1cblx0fVxuXHRpZiAoYWN0aW9uTGFiZWwpIHtcblx0XHRyZXR1cm4gcGxhblJldmlldy5hY3Rpb25zLmZpbmQoYSA9PiBhLmxhYmVsID09PSBhY3Rpb25MYWJlbCk7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gc3VibWl0dGVkVGV4dEFuc3dlcih2YWx1ZTogc3RyaW5nKTogQ2hhdElucHV0QW5zd2VyIHtcblx0cmV0dXJuIHtcblx0XHRzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLFxuXHRcdHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0LCB2YWx1ZSB9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiBzdWJtaXR0ZWRTZWxlY3RlZEFuc3dlcih2YWx1ZTogc3RyaW5nLCBmZWVkYmFjaz86IHN0cmluZyk6IENoYXRJbnB1dEFuc3dlciB7XG5cdHJldHVybiB7XG5cdFx0c3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCxcblx0XHR2YWx1ZToge1xuXHRcdFx0a2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlNlbGVjdGVkLFxuXHRcdFx0dmFsdWUsXG5cdFx0XHQuLi4oZmVlZGJhY2sgPyB7IGZyZWVmb3JtVmFsdWVzOiBbZmVlZGJhY2tdIH0gOiB7fSksXG5cdFx0fSxcblx0fTtcbn1cblxuZnVuY3Rpb24gY29udmVydFBsYW5SZXZpZXdSZXN1bHQocGxhblJldmlldzogSUFnZW50SG9zdFBsYW5SZXZpZXcsIHJlc3VsdDogSUNoYXRQbGFuUmV2aWV3UmVzdWx0KTogUGxhblJldmlld0lucHV0Q29tcGxldGlvbiB7XG5cdGNvbnN0IGZlZWRiYWNrID0gcmVzdWx0LmZlZWRiYWNrPy50cmltKCk7XG5cdGlmIChmZWVkYmFjaykge1xuXHRcdGNvbnN0IGFjdGlvbiA9IGdldFBsYW5SZXZpZXdBY3Rpb24ocGxhblJldmlldywgcmVzdWx0LmFjdGlvbklkLCByZXN1bHQuYWN0aW9uKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQsXG5cdFx0XHRhbnN3ZXJzOiB7XG5cdFx0XHRcdFtwbGFuUmV2aWV3LmFuc3dlclF1ZXN0aW9uSWRdOiBhY3Rpb25cblx0XHRcdFx0XHQ/IHN1Ym1pdHRlZFNlbGVjdGVkQW5zd2VyKGFjdGlvbi5pZCwgZmVlZGJhY2spXG5cdFx0XHRcdFx0OiBzdWJtaXR0ZWRUZXh0QW5zd2VyKGZlZWRiYWNrKSxcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdGlmIChyZXN1bHQucmVqZWN0ZWQpIHtcblx0XHRyZXR1cm4geyByZXNwb25zZTogQ2hhdElucHV0UmVzcG9uc2VLaW5kLkRlY2xpbmUgfTtcblx0fVxuXG5cdGNvbnN0IGFjdGlvbiA9IGdldFBsYW5SZXZpZXdBY3Rpb24ocGxhblJldmlldywgcmVzdWx0LmFjdGlvbklkLCByZXN1bHQuYWN0aW9uKTtcblx0aWYgKCFhY3Rpb24pIHtcblx0XHRyZXR1cm4geyByZXNwb25zZTogQ2hhdElucHV0UmVzcG9uc2VLaW5kLkRlY2xpbmUgfTtcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0cmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQsXG5cdFx0YW5zd2Vyczoge1xuXHRcdFx0W3BsYW5SZXZpZXcuYW5zd2VyUXVlc3Rpb25JZF06IHN1Ym1pdHRlZFNlbGVjdGVkQW5zd2VyKGFjdGlvbi5pZCksXG5cdFx0fSxcblx0fTtcbn1cblxuZnVuY3Rpb24gaW5wdXRSZXF1ZXN0UmVzcG9uc2VQYXJ0S2V5KHBhcnQ6IElucHV0UmVxdWVzdFJlc3BvbnNlUGFydCk6IHN0cmluZyB7XG5cdHJldHVybiBgaXI6JHtwYXJ0LnJlcXVlc3QuaWR9OiR7SlNPTi5zdHJpbmdpZnkoeyAuLi5wYXJ0LnJlcXVlc3QsIGFuc3dlcnM6IHVuZGVmaW5lZCB9KX1gO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gQ2hhdCBzZXNzaW9uXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5jbGFzcyBBZ2VudEhvc3RDaGF0U2Vzc2lvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhdFNlc3Npb24ge1xuXHRyZWFkb25seSBwcm9ncmVzc09icyA9IG9ic2VydmFibGVWYWx1ZTxJQ2hhdFByb2dyZXNzW10+KCdhZ2VudEhvc3RQcm9ncmVzcycsIFtdKTtcblx0cmVhZG9ubHkgaXNDb21wbGV0ZU9icyA9IG9ic2VydmFibGVWYWx1ZTxib29sZWFuPignYWdlbnRIb3N0Q29tcGxldGUnLCB0cnVlKTtcblx0cmVhZG9ubHkgaXNSZWFkT25seTogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25TdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTxJT2JzZXJ2YWJsZTxTZXNzaW9uU3RhdGUgfCB1bmRlZmluZWQ+Pih0aGlzLCBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRTdGF0ZSA9IG9ic2VydmFibGVWYWx1ZTxJT2JzZXJ2YWJsZTxDaGF0U3RhdGUgfCB1bmRlZmluZWQ+Pih0aGlzLCBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb21wdENhY2hlVHJhY2tpbmcgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8SURpc3Bvc2FibGU+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbERpc3Bvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25XaWxsRGlzcG9zZSA9IHRoaXMuX29uV2lsbERpc3Bvc2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTdGFydFNlcnZlclJlcXVlc3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ2hhdFNlc3Npb25TZXJ2ZXJSZXF1ZXN0PigpKTtcblx0cmVhZG9ubHkgb25EaWRTdGFydFNlcnZlclJlcXVlc3QgPSB0aGlzLl9vbkRpZFN0YXJ0U2VydmVyUmVxdWVzdC5ldmVudDtcblxuXHRyZWFkb25seSBpbnRlcnJ1cHRBY3RpdmVSZXNwb25zZUNhbGxiYWNrOiBJQ2hhdFNlc3Npb25bJ2ludGVycnVwdEFjdGl2ZVJlc3BvbnNlQ2FsbGJhY2snXTtcblx0cmVhZG9ubHkgZm9ya1Nlc3Npb246IElDaGF0U2Vzc2lvblsnZm9ya1Nlc3Npb24nXTtcblx0cmVhZG9ubHkgcmVuYW1lU2Vzc2lvbjogSUNoYXRTZXNzaW9uWydyZW5hbWVTZXNzaW9uJ107XG5cdHJlYWRvbmx5IHRyYW5zZmVycmVkU3RhdGU6IElDaGF0U2Vzc2lvblsndHJhbnNmZXJyZWRTdGF0ZSddO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogVVJJLFxuXHRcdHJlYWRvbmx5IGhpc3Rvcnk6IHJlYWRvbmx5IElDaGF0U2Vzc2lvbkhpc3RvcnlJdGVtW10sXG5cdFx0cmVhZG9ubHkgdGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRzZXNzaW9uU3Vic2NyaXB0aW9uOiBJQWdlbnRTdWJzY3JpcHRpb248U2Vzc2lvblN0YXRlPiB8IHVuZGVmaW5lZCxcblx0XHRjaGF0U3Vic2NyaXB0aW9uOiBJQWdlbnRTdWJzY3JpcHRpb248Q2hhdFN0YXRlPiB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm9tcHRDYWNoZU5vdGlmaWNhdGlvbjogQWdlbnRIb3N0UHJvbXB0Q2FjaGVOb3RpZmljYXRpb24gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZm9ya1Nlc3Npb246ICgocmVxdWVzdDogSUNoYXRTZXNzaW9uUmVxdWVzdEhpc3RvcnlJdGVtIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb21pc2U8SUNoYXRTZXNzaW9uSXRlbT4pLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3JlbmFtZVNlc3Npb246ICgodGl0bGU6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm9taXNlPHZvaWQ+KSxcblx0XHRpbnB1dFN0YXRlOiBJU2VyaWFsaXphYmxlQ2hhdE1vZGVsSW5wdXRTdGF0ZSB8IHVuZGVmaW5lZCxcblx0XHRpbml0aWFsUHJvZ3Jlc3M6IElDaGF0UHJvZ3Jlc3NbXSB8IHVuZGVmaW5lZCxcblx0XHRoaXN0b3J5U3ViYWdlbnRPYnNlcnZhdGlvbnM6IElEaXNwb3NhYmxlLFxuXHRcdG9uRGlzcG9zZTogKCkgPT4gdm9pZCxcblx0XHRpbnRlcnJ1cHRBY3RpdmVSZXNwb25zZTogKCkgPT4gYm9vbGVhbixcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnNldFN0YXRlU3Vic2NyaXB0aW9ucyhzZXNzaW9uU3Vic2NyaXB0aW9uLCBjaGF0U3Vic2NyaXB0aW9uKTtcblx0XHR0aGlzLmlzUmVhZE9ubHkgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uQXJjaGl2ZWQgPSBCb29sZWFuKCh0aGlzLl9zZXNzaW9uU3RhdGUucmVhZChyZWFkZXIpLnJlYWQocmVhZGVyKT8uc3RhdHVzID8/IDApICYgU2Vzc2lvblN0YXR1cy5Jc0FyY2hpdmVkKTtcblx0XHRcdHJldHVybiBpc0NoYXRSZWFkT25seSh0aGlzLl9jaGF0U3RhdGUucmVhZChyZWFkZXIpLnJlYWQocmVhZGVyKT8uaW50ZXJhY3Rpdml0eSwgc2Vzc2lvbkFyY2hpdmVkKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGhhc0FjdGl2ZVR1cm4gPSBpbml0aWFsUHJvZ3Jlc3MgIT09IHVuZGVmaW5lZDtcblx0XHR0aGlzLnRyYW5zZmVycmVkU3RhdGUgPSBpbnB1dFN0YXRlID8geyBlZGl0aW5nU2Vzc2lvbjogdW5kZWZpbmVkLCBpbnB1dFN0YXRlIH0gOiB1bmRlZmluZWQ7XG5cdFx0aWYgKGhhc0FjdGl2ZVR1cm4pIHtcblx0XHRcdHRoaXMuaXNDb21wbGV0ZU9icy5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLnByb2dyZXNzT2JzLnNldChpbml0aWFsUHJvZ3Jlc3MsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoaGlzdG9yeVN1YmFnZW50T2JzZXJ2YXRpb25zKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUob25EaXNwb3NlKSk7XG5cblx0XHQvLyBBbHdheXMgcHJvdmlkZSBhbiBpbnRlcnJ1cHQgY2FsbGJhY2sgc28gdGhlIGNoYXQgVUkncyBzdG9wIGJ1dHRvblxuXHRcdC8vIGNhbiBjYW5jZWwgYSByZW1vdGUgdHVybiBhdCBhbnkgdGltZS4gVGhlIGNhbGxiYWNrIHJlc29sdmVzIHRoZVxuXHRcdC8vIGN1cnJlbnQgYWN0aXZlIHR1cm4gYXQgY2FsbCB0aW1lIGFuZCBkaXNwYXRjaGVzIENoYXRUdXJuQ2FuY2VsbGVkLlxuXHRcdHRoaXMuaW50ZXJydXB0QWN0aXZlUmVzcG9uc2VDYWxsYmFjayA9IGFzeW5jICgpID0+IGludGVycnVwdEFjdGl2ZVJlc3BvbnNlKCk7XG5cblx0XHR0aGlzLmZvcmtTZXNzaW9uID0gdGhpcy5fZm9ya1Nlc3Npb247XG5cdFx0dGhpcy5yZW5hbWVTZXNzaW9uID0gdGhpcy5fcmVuYW1lU2Vzc2lvbjtcblx0fVxuXG5cdHNldFN0YXRlU3Vic2NyaXB0aW9ucyhzZXNzaW9uU3Vic2NyaXB0aW9uOiBJQWdlbnRTdWJzY3JpcHRpb248U2Vzc2lvblN0YXRlPiB8IHVuZGVmaW5lZCwgY2hhdFN1YnNjcmlwdGlvbjogSUFnZW50U3Vic2NyaXB0aW9uPENoYXRTdGF0ZT4gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9wcm9tcHRDYWNoZVRyYWNraW5nLmNsZWFyKCk7XG5cdFx0dGhpcy5fcHJvbXB0Q2FjaGVUcmFja2luZy52YWx1ZSA9IHNlc3Npb25TdWJzY3JpcHRpb24gPyB0aGlzLl9wcm9tcHRDYWNoZU5vdGlmaWNhdGlvbj8udHJhY2tTZXNzaW9uKHRoaXMuc2Vzc2lvblJlc291cmNlLCBzZXNzaW9uU3Vic2NyaXB0aW9uKSA6IHVuZGVmaW5lZDtcblx0XHR0cmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uU3RhdGUuc2V0KHNlc3Npb25TdWJzY3JpcHRpb24gPyBvYnNlcnZhYmxlRnJvbVN1YnNjcmlwdGlvbih0aGlzLCBzZXNzaW9uU3Vic2NyaXB0aW9uKSA6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLCB0eCk7XG5cdFx0XHR0aGlzLl9jaGF0U3RhdGUuc2V0KGNoYXRTdWJzY3JpcHRpb24gPyBvYnNlcnZhYmxlRnJvbVN1YnNjcmlwdGlvbih0aGlzLCBjaGF0U3Vic2NyaXB0aW9uKSA6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLCB0eCk7XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdC8vIEZpcmUgYG9uV2lsbERpc3Bvc2VgIEJFRk9SRSBgc3VwZXIuZGlzcG9zZSgpYCBzbyBsaXN0ZW5lcnMgKG5vdGFibHlcblx0XHQvLyBgQ29udHJpYnV0ZWRDaGF0U2Vzc2lvbkRhdGFgIGluIGBDaGF0U2Vzc2lvbnNTZXJ2aWNlYCkgY2FuIGV2aWN0XG5cdFx0Ly8gdGhpcyBzZXNzaW9uIGZyb20gdGhlaXIgY2FjaGVzLlxuXHRcdGlmICghdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0dGhpcy5fb25XaWxsRGlzcG9zZS5maXJlKCk7XG5cdFx0fVxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWdpc3RlcnMgYSBkaXNwb3NhYmxlIHRvIGJlIGNsZWFuZWQgdXAgd2hlbiB0aGlzIHNlc3Npb24gaXMgZGlzcG9zZWQuXG5cdCAqL1xuXHRyZWdpc3RlckRpc3Bvc2FibGU8VCBleHRlbmRzIElEaXNwb3NhYmxlPihkaXNwb3NhYmxlOiBUKTogVCB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGVuZHMgbmV3IHByb2dyZXNzIGl0ZW1zIHRvIHRoZSBvYnNlcnZhYmxlLiBVc2VkIGJ5IHRoZSByZWNvbm5lY3Rpb25cblx0ICogZmxvdyB0byBzdHJlYW0gb25nb2luZyBzdGF0ZSBjaGFuZ2VzIGludG8gdGhlIGNoYXQgVUkuXG5cdCAqL1xuXHRhcHBlbmRQcm9ncmVzcyhpdGVtczogSUNoYXRQcm9ncmVzc1tdKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudCA9IHRoaXMucHJvZ3Jlc3NPYnMuZ2V0KCk7XG5cdFx0dGhpcy5wcm9ncmVzc09icy5zZXQoWy4uLmN1cnJlbnQsIC4uLml0ZW1zXSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNYXJrcyB0aGUgYWN0aXZlIHR1cm4gYXMgY29tcGxldGUuXG5cdCAqL1xuXHRjb21wbGV0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmlzQ29tcGxldGVPYnMuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvKipcblx0ICogQ2FsbGVkIGJ5IHRoZSBzZXNzaW9uIGhhbmRsZXIgd2hlbiBhIHNlcnZlci1pbml0aWF0ZWQgdHVybiBzdGFydHMuXG5cdCAqIFJlc2V0cyB0aGUgcHJvZ3Jlc3Mgb2JzZXJ2YWJsZSBhbmQgc2lnbmFscyBsaXN0ZW5lcnMgdG8gY3JlYXRlIGEgbmV3XG5cdCAqIHJlcXVlc3QrcmVzcG9uc2UgcGFpciBpbiB0aGUgY2hhdCBtb2RlbC4gYHR1cm5JZGAgaXMgdGhlIHByb3ZpZGVyJ3MgdHVyblxuXHQgKiBpZCBhbmQgaXMgYWRvcHRlZCBhcyB0aGUgY2hhdCByZXF1ZXN0IGlkLCBzbyBmZWF0dXJlcyB0aGF0IGFkZHJlc3MgYSB0dXJuXG5cdCAqIGJ5IHJlcXVlc3QgaWQgKHNpZGUgY2hhdHMsIGZvcmtzKSBjYW4gcmVzb2x2ZSBpdCBhZ2FpbnN0IHRoZSBob3N0LlxuXHQgKi9cblx0c3RhcnRTZXJ2ZXJSZXF1ZXN0KHR1cm5JZDogc3RyaW5nLCBwcm9tcHQ6IHN0cmluZywgdmFyaWFibGVEYXRhPzogSUNoYXRSZXF1ZXN0VmFyaWFibGVEYXRhLCBvcHRpb25zPzogSVN0YXJ0U2VydmVyUmVxdWVzdE9wdGlvbnMpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ1tBZ2VudEhvc3RdIFNlcnZlci1pbml0aWF0ZWQgcmVxdWVzdCBzdGFydGVkJyk7XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0dGhpcy5wcm9ncmVzc09icy5zZXQoW10sIHR4KTtcblx0XHRcdHRoaXMuaXNDb21wbGV0ZU9icy5zZXQoZmFsc2UsIHR4KTtcblx0XHR9KTtcblx0XHR0aGlzLl9vbkRpZFN0YXJ0U2VydmVyUmVxdWVzdC5maXJlKHtcblx0XHRcdGlkOiB0dXJuSWQsXG5cdFx0XHRwcm9tcHQsXG5cdFx0XHR2YXJpYWJsZURhdGEsXG5cdFx0XHRpc1N5c3RlbUluaXRpYXRlZDogb3B0aW9ucz8uaXNTeXN0ZW1Jbml0aWF0ZWQsXG5cdFx0XHRpc0hpZGRlbjogb3B0aW9ucz8uaXNIaWRkZW4sXG5cdFx0XHR0aW1lc3RhbXA6IG9wdGlvbnM/LnRpbWVzdGFtcCxcblx0XHRcdGlzVGVybWluYWxSZXF1ZXN0OiBvcHRpb25zPy5pc1Rlcm1pbmFsUmVxdWVzdCxcblx0XHRcdG9yaWdpbjogb3B0aW9ucz8ub3JpZ2luLFxuXHRcdH0pO1xuXHR9XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBTZXNzaW9uIGhhbmRsZXJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50SG9zdFNlc3Npb25IYW5kbGVyQ29uZmlnIHtcblx0cmVhZG9ubHkgcHJvdmlkZXI6IEFnZW50UHJvdmlkZXI7XG5cdC8qKlxuXHQgKiBUaGUgVVJJIHNjaGVtZSB0aGUgaG9zdCBhZGRyZXNzZXMgc2Vzc2lvbnMgdW5kZXIsIHdoZW4gaXQgZGlmZmVycyBmcm9tXG5cdCAqIHtAbGluayBwcm92aWRlcn0uIERlZmF1bHRzIHRvIHtAbGluayBwcm92aWRlcn0uXG5cdCAqXG5cdCAqIFNlc3Npb24gVVJJcyBhcmUgY2xpZW50LWNob3Nlbi4gRm9yIGFnZW50cyBjb3JlIHNwYXducywgY29yZSBwaWNrcyB0aGUgVVJJIGFuZFxuXHQgKiB1c2VzIHRoZSBwcm92aWRlciBhcyB0aGUgc2NoZW1lLiBGb3Igc2Vzc2lvbnMgY29yZSAqam9pbnMqIHJhdGhlciB0aGFuIGNyZWF0ZXNcblx0ICogKGNsb3VkIHNhbmRib3gsIHdoZXJlIE1pc3Npb24gQ29udHJvbCBjcmVhdGVkIHRoZSBzZXNzaW9uIGFzIGBhaHAtc2Vzc2lvbjovPGlkPmApLFxuXHQgKiB0aGUgY3JlYXRvcidzIHNjaGVtZSBtdXN0IGJlIHVzZWQgYmVjYXVzZSB0aGUgaG9zdCdzIHJlZ2lzdHJ5IGlzIGtleWVkIGJ5IHRoZVxuXHQgKiBleGFjdCBVUkkgXHUyMDE0IHdoaWxlIHRoZSBVSSBzdGlsbCByb3V0ZXMgdGhlIHNlc3Npb24gdG8gdGhlIGBjb3BpbG90YCBwcm92aWRlci5cblx0ICovXG5cdHJlYWRvbmx5IGJhY2tlbmRTZXNzaW9uU2NoZW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBhZ2VudElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNlc3Npb25UeXBlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGZ1bGxOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdC8qKiBUaGUgYWdlbnQgY29ubmVjdGlvbiB0byB1c2UgZm9yIHRoaXMgaGFuZGxlci4gKi9cblx0cmVhZG9ubHkgY29ubmVjdGlvbjogSUFnZW50Q29ubmVjdGlvbjtcblx0LyoqIFNhbml0aXplZCBjb25uZWN0aW9uIGF1dGhvcml0eSBmb3IgY29uc3RydWN0aW5nIHZzY29kZS1hZ2VudC1ob3N0Oi8vIFVSSXMuICovXG5cdHJlYWRvbmx5IGNvbm5lY3Rpb25BdXRob3JpdHk6IHN0cmluZztcblx0LyoqIEV4dGVuc2lvbiBpZGVudGlmaWVyIGZvciB0aGUgcmVnaXN0ZXJlZCBhZ2VudC4gRGVmYXVsdHMgdG8gJ3ZzY29kZS5hZ2VudC1ob3N0Jy4gKi9cblx0cmVhZG9ubHkgZXh0ZW5zaW9uSWQ/OiBzdHJpbmc7XG5cdC8qKiBFeHRlbnNpb24gZGlzcGxheSBuYW1lIGZvciB0aGUgcmVnaXN0ZXJlZCBhZ2VudC4gRGVmYXVsdHMgdG8gJ0FnZW50IEhvc3QnLiAqL1xuXHRyZWFkb25seSBleHRlbnNpb25EaXNwbGF5TmFtZT86IHN0cmluZztcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGNhbGxiYWNrIHRvIHJlc29sdmUgYSB3b3JraW5nIGRpcmVjdG9yeSBmb3IgYSBuZXcgc2Vzc2lvbi5cblx0ICogSWYgbm90IHByb3ZpZGVkIG9yIHVucmVzb2x2ZWQsIHNlc3Npb24gcmVzb3VyY2UgcmVzb2x2ZXJzIGFyZSBjb25zdWx0ZWQgYmVmb3JlXG5cdCAqIGZhbGxpbmcgYmFjayB0byB0aGUgZmlyc3Qgd29ya3NwYWNlIGZvbGRlci5cblx0ICovXG5cdHJlYWRvbmx5IHJlc29sdmVXb3JraW5nRGlyZWN0b3J5PzogKHNlc3Npb25SZXNvdXJjZTogVVJJKSA9PiBVUkkgfCB1bmRlZmluZWQ7XG5cdC8qKiBXaGV0aGVyIGEgZmluYWwtbG9va2luZyBjaGF0IHJlc291cmNlIGlzIHN0aWxsIGEgY2xpZW50LXNpZGUgZHJhZnQuICovXG5cdHJlYWRvbmx5IGlzTmV3U2Vzc2lvbj86IChzZXNzaW9uUmVzb3VyY2U6IFVSSSkgPT4gYm9vbGVhbjtcblx0LyoqXG5cdCAqIE9wdGlvbmFsIGNhbGxiYWNrIGludm9rZWQgd2hlbiB0aGUgc2VydmVyIHJlamVjdHMgYW4gb3BlcmF0aW9uIGJlY2F1c2Vcblx0ICogYXV0aGVudGljYXRpb24gaXMgcmVxdWlyZWQuIFNob3VsZCB0cmlnZ2VyIGludGVyYWN0aXZlIGF1dGhlbnRpY2F0aW9uXG5cdCAqIGFuZCByZXR1cm4gdHJ1ZSBpZiB0aGUgdXNlciBhdXRoZW50aWNhdGVkIHN1Y2Nlc3NmdWxseS5cblx0ICpcblx0ICogQHBhcmFtIHByb3RlY3RlZFJlc291cmNlcyBUaGUgcHJvdGVjdGVkIHJlc291cmNlcyBmcm9tIHRoZSBhZ2VudCdzIHJvb3Rcblx0ICogICBzdGF0ZSB0aGF0IHJlcXVpcmUgYXV0aGVudGljYXRpb24uXG5cdCAqL1xuXHRyZWFkb25seSByZXNvbHZlQXV0aGVudGljYXRpb24/OiAocHJvdGVjdGVkUmVzb3VyY2VzOiBQcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhW10pID0+IFByb21pc2U8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IHByb21wdENhY2hlTm90aWZpY2F0aW9uPzogQWdlbnRIb3N0UHJvbXB0Q2FjaGVOb3RpZmljYXRpb247XG59XG5cbi8qKlxuICogQ29udmVydHMgYSBVVEYtMTYgY29kZS11bml0IG9mZnNldCBpbiBgdGV4dGAgdG8gYSAxLWJhc2VkIE1vbmFjb1xuICogYElQb3NpdGlvbmAuIFVzZWQgdG8gdHJhbnNsYXRlIEFIUCBjb21wbGV0aW9uLWl0ZW0gcmFuZ2VzICh3aGljaCB1c2VcbiAqIG9mZnNldHMpIGludG8gTW9uYWNvLXN0eWxlIHBvc2l0aW9ucyBmb3IgdGhlIGNoYXQgaW5wdXQuXG4gKi9cbmZ1bmN0aW9uIG9mZnNldFRvUG9zaXRpb24odGV4dDogc3RyaW5nLCBvZmZzZXQ6IG51bWJlcik6IElQb3NpdGlvbiB7XG5cdGxldCBsaW5lTnVtYmVyID0gMTtcblx0bGV0IGNvbHVtbiA9IDE7XG5cdGNvbnN0IGxpbWl0ID0gTWF0aC5taW4ob2Zmc2V0LCB0ZXh0Lmxlbmd0aCk7XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgbGltaXQ7IGkrKykge1xuXHRcdGlmICh0ZXh0LmNoYXJDb2RlQXQoaSkgPT09IDEwIC8qIFxcbiAqLykge1xuXHRcdFx0bGluZU51bWJlcisrO1xuXHRcdFx0Y29sdW1uID0gMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29sdW1uKys7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB7IGxpbmVOdW1iZXIsIGNvbHVtbiB9O1xufVxuXG5jbGFzcyBBY3RpdmVDbGllbnRFbnRyeSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZUNsaWVudDogSU9ic2VydmFibGU8U2Vzc2lvbkFjdGl2ZUNsaWVudD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHRydWUpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jYW5jZWxsYXRpb24gPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVjb25jaWxlU2lnbmFsID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIDApO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZVN1YnNjcmlwdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3B1Ymxpc2hEZWxheWVyOiBEZWxheWVyPHZvaWQ+O1xuXHRwcml2YXRlIF9iYWNrZW5kU2Vzc2lvbjogVVJJIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jbGFpbVJlcXVlc3RlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9sYXN0UHVibGlzaGVkOiBTZXNzaW9uQWN0aXZlQ2xpZW50IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Njb3BlOiBJQWdlbnRDdXN0b21pemF0aW9uU2NvcGUsXG5cdFx0Y2xpZW50SWQ6IHN0cmluZyxcblx0XHRkZWJvdW5jZURlbGF5OiBudW1iZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2V0U2Vzc2lvblN0YXRlOiAoYmFja2VuZFNlc3Npb246IFVSSSkgPT4gU2Vzc2lvblN0YXRlIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3BhdGNoOiAoYmFja2VuZFNlc3Npb246IFVSSSwgYWN0aW9uOiBDbGllbnRTZXNzaW9uQWN0aW9uKSA9PiB2b2lkLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2FjdGl2ZUNsaWVudCA9IF9zY29wZS5hY3RpdmVDbGllbnQoY2xpZW50SWQpO1xuXHRcdHRoaXMuX3B1Ymxpc2hEZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXI8dm9pZD4oZGVib3VuY2VEZWxheSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF9zY29wZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX2NhbmNlbGxhdGlvbi5kaXNwb3NlKHRydWUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9zY29wZS5pc1Jlc29sdmVkLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9hY3RpdmVDbGllbnQucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fcmVjb25jaWxlU2lnbmFsLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX3JlcXVlc3RSZWNvbmNpbGlhdGlvbigpO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKiBTbmFwc2hvdCBvZiB0aGUgY29tcG9zZWQgYWN0aXZlLWNsaWVudCB2aWV3LiAqL1xuXHRnZXRBY3RpdmVDbGllbnQoKTogU2Vzc2lvbkFjdGl2ZUNsaWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGl2ZUNsaWVudC5nZXQoKTtcblx0fVxuXG5cdC8qKiBSZXNvbHZlcyBvbmNlIG5vIGFjdGl2ZS1jbGllbnQgcHVibGlzaCBpcyBwZW5kaW5nLiAqL1xuXHRhc3luYyB3aGVuU2V0dGxlZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUodGhpcy5fc3RhdGUsIHN0YXRlID0+ICFzdGF0ZSwgdW5kZWZpbmVkLCB0aGlzLl9jYW5jZWxsYXRpb24udG9rZW4pO1xuXHR9XG5cblx0LyoqIEJpbmRzIHRoZSBiYWNrZW5kIHNlc3Npb24gYW5kIHJlcXVlc3RzIHRoaXMgY2xpZW50IGpvaW4gaXQuICovXG5cdGNsYWltKGJhY2tlbmRTZXNzaW9uOiBVUkkpOiB2b2lkIHtcblx0XHR0aGlzLl9iYWNrZW5kU2Vzc2lvbiA9IGJhY2tlbmRTZXNzaW9uO1xuXHRcdHRoaXMuX2NsYWltUmVxdWVzdGVkID0gdHJ1ZTtcblx0XHR0aGlzLl9yZXF1ZXN0UmVjb25jaWxpYXRpb24oKTtcblx0fVxuXG5cdC8qKiBCaW5kcyB0aGUgYmFja2VuZCBzZXNzaW9uIGFuZCByZWNvbmNpbGVzIHdpdGhvdXQgY2xhaW1pbmcgaXQuICovXG5cdGF0dGFjaChiYWNrZW5kU2Vzc2lvbjogVVJJLCBzZXNzaW9uU3Vic2NyaXB0aW9uOiBJQWdlbnRTdWJzY3JpcHRpb248U2Vzc2lvblN0YXRlPiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX2JhY2tlbmRTZXNzaW9uID0gYmFja2VuZFNlc3Npb247XG5cdFx0dGhpcy5fc3RhdGVTdWJzY3JpcHRpb24udmFsdWUgPSBzZXNzaW9uU3Vic2NyaXB0aW9uPy5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZWNvbmNpbGVTaWduYWwuc2V0KHRoaXMuX3JlY29uY2lsZVNpZ25hbC5nZXQoKSArIDEsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVxdWVzdFJlY29uY2lsaWF0aW9uKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXF1ZXN0UmVjb25jaWxpYXRpb24oKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NhbmNlbGxhdGlvbi50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX3Njb3BlLmlzUmVzb2x2ZWQuZ2V0KCkpIHtcblx0XHRcdHRoaXMuX3N0YXRlLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX2JhY2tlbmRTZXNzaW9uKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZS5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3N0YXRlLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX3B1Ymxpc2hEZWxheWVyLnRyaWdnZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKHRoaXMuX2NhbmNlbGxhdGlvbi50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IHRoaXMuX2JhY2tlbmRTZXNzaW9uO1xuXHRcdFx0XHRpZiAoIWJhY2tlbmRTZXNzaW9uIHx8ICF0aGlzLl9zY29wZS5pc1Jlc29sdmVkLmdldCgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZUNsaWVudCA9IHRoaXMuX2FjdGl2ZUNsaWVudC5nZXQoKTtcblx0XHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9nZXRTZXNzaW9uU3RhdGUoYmFja2VuZFNlc3Npb24pPy5hY3RpdmVDbGllbnRzLmZpbmQoY2xpZW50ID0+IGNsaWVudC5jbGllbnRJZCA9PT0gYWN0aXZlQ2xpZW50LmNsaWVudElkKTtcblx0XHRcdFx0aWYgKCFleGlzdGluZyAmJiAhdGhpcy5fY2xhaW1SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGVxdWFscyhleGlzdGluZywgYWN0aXZlQ2xpZW50KSkge1xuXHRcdFx0XHRcdHRoaXMuX2xhc3RQdWJsaXNoZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlcXVhbHModGhpcy5fbGFzdFB1Ymxpc2hlZCwgYWN0aXZlQ2xpZW50KSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9kaXNwYXRjaChiYWNrZW5kU2Vzc2lvbiwge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdFx0XHRhY3RpdmVDbGllbnQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLl9sYXN0UHVibGlzaGVkID0gYWN0aXZlQ2xpZW50O1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aWYgKHRoaXMuX3Njb3BlLmlzUmVzb2x2ZWQuZ2V0KCkpIHtcblx0XHRcdFx0XHR0aGlzLl9zdGF0ZS5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KS5jYXRjaCgoKSA9PiB7IC8qIGRlbGF5ZXIgZGlzcG9zZWQgKi8gfSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEFnZW50SG9zdFNlc3Npb25IYW5kbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlciB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRFJBRlRfU1lOQ19ERUJPVU5DRV9NUyA9IDUwMDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQUNUSVZFX0NMSUVOVF9SRUNPTkNJTElBVElPTl9ERUJPVU5DRV9NUyA9IDU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlU2Vzc2lvbnMgPSBuZXcgUmVzb3VyY2VNYXA8QWdlbnRIb3N0Q2hhdFNlc3Npb24+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRVUklzQnlTZXNzaW9uUmVzb3VyY2UgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPigpO1xuXHQvKiogUGVyLXNlc3Npb24gc3Vic2NyaXB0aW9uIHRvIGNoYXQgbW9kZWwgcGVuZGluZyByZXF1ZXN0IGNoYW5nZXMuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdNZXNzYWdlU3Vic2NyaXB0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlUmVzb3VyY2VNYXAoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbW90ZVBlbmRpbmdNZXNzYWdlUHJvamVjdGlvbnMgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0LyoqIFBlci1zZXNzaW9uIGRlYm91bmNlZCBzeW5jIGZyb20gY2hhdCBpbnB1dCBzdGF0ZSB0byBBSFAgZHJhZnQgc3RhdGUuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RyYWZ0U3luY1N1YnNjcmlwdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVJlc291cmNlTWFwKCkpO1xuXHQvKiogUGVyLXNlc3Npb24gc3Vic2NyaXB0aW9uIHdhdGNoaW5nIGZvciBzZXJ2ZXItaW5pdGlhdGVkIHR1cm5zLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXJ2ZXJUdXJuV2F0Y2hlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVJlc291cmNlTWFwKCkpO1xuXHQvKiogUGVyLXNlc3Npb24gc3Vic2NyaXB0aW9uIHNpbGVudGx5IHJlc29sdmluZyBleGlzdGluZyBNQ1AgYXV0aGVudGljYXRpb24gZ3JhbnRzLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tY3BBdXRoV2F0Y2hlcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVJlc291cmNlTWFwKCkpO1xuXHQvKipcblx0ICogT3duZXJzaGlwIG9mIGFjdGlvbmFibGUgcHJvdG9jb2wgcmVxdWVzdHMsIGtleWVkIGJ5IGJhY2tlbmQgc2Vzc2lvbiBVUklcblx0ICogc3RyaW5nLiBgaW5wdXROZWVkZWRgIGlzIGEgc2Vzc2lvbi1sZXZlbCBxdWV1ZSBhbmQgdGhlIHNpbmdsZSBjYWxsZXIgb2Zcblx0ICoge0BsaW5rIGludm9rZVRvb2x9IGZvciBjbGllbnQgdG9vbHMsIHNvIGl0IG11c3QgYmUgaGFuZGxlZCBleGFjdGx5IG9uY2Vcblx0ICogcGVyIGJhY2tlbmQgc2Vzc2lvbiBubyBtYXR0ZXIgaG93IG1hbnkgc2libGluZyBjaGF0IHJlc291cmNlcyAoZGVmYXVsdFxuXHQgKiBjaGF0LCBwZWVyIGNoYXRzLCBzdWJhZ2VudCBjaGF0cykgYXJlIG9wZW4gYWdhaW5zdCBpdC4gRWFjaCBzdWNoIHJlc291cmNlXG5cdCAqIGhvbGRzIGEgcmVmZXJlbmNlOyB0aGUgc2hhcmVkIHdhdGNoZXIgc3RheXMgYWxpdmUgd2hpbGUgYW55IHJlZmVyZW5jZVxuXHQgKiByZW1haW5zIGFuZCBpcyBkaXNwb3NlZCBvbmx5IHdoZW4gdGhlIGxhc3Qgb25lIGlzIHJlbGVhc2VkLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfaW5wdXROZWVkZWRXYXRjaGVycyA9IG5ldyBNYXA8c3RyaW5nLCB7IHJlYWRvbmx5IHN0b3JlOiBEaXNwb3NhYmxlU3RvcmU7IHJlYWRvbmx5IHJlZnM6IFNldDxzdHJpbmc+IH0+KCk7XG5cdC8qKlxuXHQgKiBCYWNrZW5kIHNlc3Npb24gZWFjaCBvcGVuIHJlc291cmNlJ3Mge0BsaW5rIF9pbnB1dE5lZWRlZFdhdGNoZXJzfVxuXHQgKiByZWZlcmVuY2UgYmVsb25ncyB0bywgcmVjb3JkZWQgd2hlbiB0aGUgcmVmZXJlbmNlIGlzIGluc3RhbGxlZC4gVGVhcmRvd25cblx0ICogdXNlcyB0aGlzIHRvIHJlbGVhc2UgdGhlIHJpZ2h0IHJlZmVyZW5jZSB3aXRob3V0IHJlLWRlcml2aW5nIHRoZSBiYWNrZW5kXG5cdCAqIHNlc3Npb24gdmlhIHtAbGluayBfcmVzb2x2ZVNlc3Npb25Vcml9LCB3aG9zZSBwcm92aXNpb25hbCBtYXBwaW5nIG1heVxuXHQgKiBhbHJlYWR5IGJlIGNsZWFyZWQgYnkgdGhlbi5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lucHV0TmVlZGVkV2F0Y2hlckJhY2tlbmRzID0gbmV3IFJlc291cmNlTWFwPFVSST4oKTtcblx0LyoqIE9uZSByZWNvbmNpbGlhdGlvbiBvd25lciBwZXIgYWN0aXZlIHNlc3Npb24uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZUNsaWVudEVudHJpZXMgPSBuZXcgUmVzb3VyY2VNYXA8QWN0aXZlQ2xpZW50RW50cnk+KCk7XG5cdC8qKiBIaXN0b3JpY2FsIHR1cm5zIHdpdGggZmlsZSBlZGl0cywgcGVuZGluZyBoeWRyYXRpb24gaW50byB0aGUgZWRpdGluZyBzZXNzaW9uLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nSGlzdG9yeVR1cm5zID0gbmV3IFJlc291cmNlTWFwPHJlYWRvbmx5IFR1cm5bXT4oKTtcblx0LyoqXG5cdCAqIFJlcXVlc3RzIGEgdHVybiBvYnNlcnZlciBpcyBjdXJyZW50bHkgcmVuZGVyaW5nLCBrZXllZCBieVxuXHQgKiB7QGxpbmsgX3Rvb2xDYWxsS2V5fSBmb3IgdG9vbCBjYWxscyBhbmQge0BsaW5rIF9pbnB1dFJlcXVlc3RLZXl9IGZvciBjaGF0XG5cdCAqIGlucHV0IHJlcXVlc3RzICh0aGUgdHdvIGtleSBzaGFwZXMgZGlmZmVyIGluIGFyaXR5LCBzbyB0aGV5IGNhbm5vdFxuXHQgKiBjb2xsaWRlKS4gVGhlIHZhbHVlIGlzIHRoZSBjbGFpbWluZyBvYnNlcnZlcidzIHNlc3Npb24gcmVzb3VyY2UsIHdoaWNoXG5cdCAqIHRoZSBzZXNzaW9uLWxldmVsIHJlc3BvbmRlciB1c2VzIGFzIHRoZSBjaGF0IGNvbnRleHQgd2hlbiBpdCBleGVjdXRlcyBhXG5cdCAqIGNsaWVudCB0b29sIHNvIHRoZSB0b29sIHJ1bnMgYWdhaW5zdCB0aGUgY2hhdCB0aGF0IGlzIGFjdHVhbGx5IHJlbmRlcmluZ1xuXHQgKiBpdC4gVGhlIHNlc3Npb24tbGV2ZWwgcmVzcG9uZGVyIGRlZmVycyB0byB0aG9zZSBvYnNlcnZlcnMgc28gdGhlIGlubGluZVxuXHQgKiBVSSBzdGF5cyBpbiBjaGFyZ2Ugb2YgYW5zd2VyaW5nLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVuZGVyZWRSZXF1ZXN0cyA9IG9ic2VydmFibGVWYWx1ZTxSZWFkb25seU1hcDxzdHJpbmcsIFVSST4+KHRoaXMsIG5ldyBNYXAoKSk7XG5cdC8qKiBUb29sIGNhbGxzIHdob3NlIHByb3RvY29sIG91dGNvbWUgaGFzIGFscmVhZHkgYmVlbiBkaXNwYXRjaGVkLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvbHZlZFRvb2xDYWxscyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHQvKipcblx0ICogQSBzaW5nbGUge0BsaW5rIENoYXRUb29sSW52b2NhdGlvbn0gcGVyIGNsaWVudCB0b29sIGNhbGwsIGtleWVkIGJ5XG5cdCAqIHtAbGluayBfdG9vbENhbGxLZXl9LiBDcmVhdGVkIGxhemlseSBieSB3aGljaGV2ZXIgb2YgdGhlIHNlc3Npb24tbGV2ZWxcblx0ICogd2F0Y2hlciBvciB0aGUgdHVybiBvYnNlcnZlciBhcnJpdmVzIGZpcnN0LCBzbyBib3RoIGFjdCBvbiBvbmUgb2JqZWN0OlxuXHQgKiB0aGUgb2JzZXJ2ZXIgcmVuZGVycyBpdCB3aGlsZSB0aGUgd2F0Y2hlciBleGVjdXRlcyBpdC4gRW50cmllcyBhcmVcblx0ICogZHJvcHBlZCBvbmNlIHRoZSBjYWxsIHJlc29sdmVzIHNvIGEgbGF0ZXIgY2FsbCB3aXRoIHRoZSBzYW1lIGlkcyBpcyBub3Rcblx0ICogbWlzdGFrZW4gZm9yIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY2xpZW50VG9vbEludm9jYXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIENoYXRUb29sSW52b2NhdGlvbj4oKTtcblx0LyoqXG5cdCAqIExpdmUgYGlucHV0TmVlZGVkYCByZXF1ZXN0cyBwZXIgdG9vbCBjYWxsLCBrZXllZCBieSB7QGxpbmsgX3Rvb2xDYWxsS2V5fS5cblx0ICogT25lIHRvb2wgY2FsbCBpcyByZXByZXNlbnRlZCBieSBhIHN1Y2Nlc3Npb24gb2YgcmVxdWVzdHMgXHUyMDE0IGEgY29uZmlybWF0aW9uXG5cdCAqIGlzIHJlcGxhY2VkIGJ5IGEgY2xpZW50IGV4ZWN1dGlvbiBvbmNlIGFwcHJvdmVkIFx1MjAxNCBzbyB0aGUgc2hhcmVkIHN0YXRlXG5cdCAqIGFib3ZlIGlzIG9ubHkgcmVsZWFzZWQgd2hlbiB0aGUgbGFzdCBvZiB0aGVtIGdvZXMgYXdheS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NsaWVudFRvb2xSZXRhaW5Db3VudHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHQvKipcblx0ICogUGVyLXNlc3Npb24gc2V0IG9mIE1DUCBzZXJ2ZXIgaWRzIHRoYXQgYWxyZWFkeSBoYWQgYW4gYXV0aGVudGljYXRpb25cblx0ICogcHJvbXB0IHN1cmZhY2VkIGluIHRoZSBjdXJyZW50IGNvbnZlcnNhdGlvbi4gQSBzZXJ2ZXIgaXMgcmVtb3ZlZCBmcm9tIHRoZVxuXHQgKiBzZXQgb25jZSBpdCByZWFjaGVzIHRoZSBydW5uaW5nIHN0YXRlICh7QGxpbmsgTWNwU2VydmVyU3RhdHVzLlJlYWR5fSksIHNvXG5cdCAqIHRoYXQgYSBsYXRlciBhdXRoIHJlcXVpcmVtZW50IGZvciB0aGUgc2FtZSBzZXJ2ZXIgcHJvbXB0cyBhZ2FpbiBpbnN0ZWFkIG9mXG5cdCAqIHRoZSBwcm9tcHQgcmVwZWF0aW5nIG9uIGV2ZXJ5IG1lc3NhZ2UuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdXJmYWNlZE1jcEF1dGhTZXJ2ZXJzID0gbmV3IFJlc291cmNlTWFwPFNldDxzdHJpbmc+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nTWNwQXV0b0F1dGhlbnRpY2F0aW9uID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8Ym9vbGVhbj4+KCk7XG5cdC8qKiBUdXJuIElEcyBkaXNwYXRjaGVkIGJ5IHRoaXMgY2xpZW50LCB1c2VkIHRvIGRpc3Rpbmd1aXNoIHNlcnZlci1vcmlnaW5hdGVkIHR1cm5zLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jbGllbnREaXNwYXRjaGVkVHVybklkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90dXJuU3RvcFdhdGNoZXMgPSBuZXcgTWFwPHN0cmluZywgU3RvcFdhdGNoPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25maWc6IElBZ2VudEhvc3RTZXNzaW9uSGFuZGxlckNvbmZpZztcblxuXHQvKiogQWN0aXZlIHNlc3Npb24gc3Vic2NyaXB0aW9ucywga2V5ZWQgYnkgYmFja2VuZCBzZXNzaW9uIFVSSSBzdHJpbmcuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25TdWJzY3JpcHRpb25zID0gbmV3IE1hcDxzdHJpbmcsIElSZWZlcmVuY2U8SUFnZW50U3Vic2NyaXB0aW9uPFNlc3Npb25TdGF0ZT4+PigpO1xuXHQvKipcblx0ICogV29ya2luZy1kaXJlY3Rvcnkgc3luY2hyb25pemVyIHJlZ2lzdHJhdGlvbnMsIGtleWVkIGJ5IHNlc3Npb24gVVJJLiBFYWNoXG5cdCAqIGxpdmVzIGV4YWN0bHkgYXMgbG9uZyBhcyB0aGF0IHNlc3Npb24ncyB7QGxpbmsgX3Nlc3Npb25TdWJzY3JpcHRpb25zfSBlbnRyeS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtpbmdEaXJlY3RvcnlSZWdpc3RyYXRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nPigpKTtcblxuXHQvKipcblx0ICogQWN0aXZlIGRlZmF1bHQtY2hhdCBzdWJzY3JpcHRpb25zLCBrZXllZCBieSBiYWNrZW5kIHNlc3Npb24gVVJJIHN0cmluZy5cblx0ICogTXVsdGktY2hhdCBpcyBub3QgeWV0IHN1cmZhY2VkOiBldmVyeSBzZXNzaW9uIGlzIHNlcnZlZCBieSBhIHNpbmdsZVxuXHQgKiBpbXBsaWNpdCBkZWZhdWx0IGNoYXQgdGhhdCBjYXJyaWVzIHRoZSBjb252ZXJzYXRpb24gY29udGVudHMgKHR1cm5zLFxuXHQgKiBhY3RpdmUgdHVybiwgcGVuZGluZy9xdWV1ZWQgbWVzc2FnZXMsIGlucHV0IHJlcXVlc3RzKS4gV2Ugc3Vic2NyaWJlIHRvXG5cdCAqIGl0IGFsb25nc2lkZSB0aGUgc2Vzc2lvbiBhbmQgbWVyZ2UgYm90aCBpbnRvIHRoZSB7QGxpbmsgSVNlc3Npb25XaXRoRGVmYXVsdENoYXR9XG5cdCAqIHZpZXcgcmV0dXJuZWQgYnkge0BsaW5rIF9nZXRTZXNzaW9uU3RhdGV9LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdENoYXRTdWJzY3JpcHRpb25zID0gbmV3IE1hcDxzdHJpbmcsIElSZWZlcmVuY2U8SUFnZW50U3Vic2NyaXB0aW9uPENoYXRTdGF0ZT4+PigpO1xuXG5cdC8qKlxuXHQgKiBBY3RpdmUgc3Vic2NyaXB0aW9ucyBmb3IgYWRkaXRpb25hbCAobm9uLWRlZmF1bHQpIHBlZXIgY2hhdHMsIGtleWVkIGJ5XG5cdCAqIHRoZSBjaGF0IGNoYW5uZWwgVVJJIHN0cmluZy4gUG9wdWxhdGVkIHdoZW4gYSBjaGF0IHdpZGdldCBpcyBvcGVuZWQgZm9yXG5cdCAqIGEgcmVzb3VyY2UgdGhhdCBjYXJyaWVzIGEgY2hhdElkIGZyYWdtZW50LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYWRkaXRpb25hbENoYXRTdWJzY3JpcHRpb25zID0gbmV3IE1hcDxzdHJpbmcsIElSZWZlcmVuY2U8SUFnZW50U3Vic2NyaXB0aW9uPENoYXRTdGF0ZT4+PigpO1xuXG5cdC8qKlxuXHQgKiBCYWNrZW5kIHNlc3Npb24gVVJJcyB3aXRoIGFuIGluLWZsaWdodCB7QGxpbmsgcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudH1cblx0ICogY2FsbCwga2V5ZWQgYnkgc2Vzc2lvbiBVUkkgc3RyaW5nIHdpdGggYSByZWZjb3VudCB2YWx1ZS4gV2hpbGUgYSBjaGF0IGlzXG5cdCAqIHN0aWxsIGh5ZHJhdGluZyBpdHMgc3Vic2NyaXB0aW9ucywgYSBzaWJsaW5nIGNoYXQgb2YgdGhlIHNhbWUgc2Vzc2lvblxuXHQgKiBjbG9zaW5nIG11c3Qgbm90IHRlYXIgZG93biB0aGUgc2hhcmVkIHNlc3Npb24gc3Vic2NyaXB0aW9uIG91dCBmcm9tIHVuZGVyXG5cdCAqIGl0IChzZWUge0BsaW5rIF9yZWxlYXNlQ2hhdFNlc3Npb25TdWJzY3JpcHRpb25zfSAvIHtAbGluayBfaGFzT3RoZXJTZXNzaW9uSG9sZH0pLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfaHlkcmF0aW5nQ2hhdFNlc3Npb25zID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb25maWc6IElBZ2VudEhvc3RTZXNzaW9uSGFuZGxlckNvbmZpZyxcblx0XHRASUNoYXRBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdEFnZW50U2VydmljZTogSUNoYXRBZ2VudFNlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdEVkaXRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRFZGl0aW5nU2VydmljZTogSUNoYXRFZGl0aW5nU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRlcm1pbmFsQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxDaGF0U2VydmljZTogSVRlcm1pbmFsQ2hhdFNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlOiBJQWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlSZXNvbHZlciBwcml2YXRlIHJlYWRvbmx5IF93b3JraW5nRGlyZWN0b3J5UmVzb2x2ZXI6IElBZ2VudEhvc3RTZXNzaW9uV29ya2luZ0RpcmVjdG9yeVJlc29sdmVyLFxuXHRcdEBJQWdlbnRIb3N0U2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTeW5jaHJvbml6ZXIgcHJpdmF0ZSByZWFkb25seSBfd29ya2luZ0RpcmVjdG9yeVN5bmNocm9uaXplcjogSUFnZW50SG9zdFNlc3Npb25Xb3JraW5nRGlyZWN0b3J5U3luY2hyb25pemVyLFxuXHRcdEBJQWdlbnRIb3N0TmV3U2Vzc2lvbkZvbGRlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbmV3U2Vzc2lvbkZvbGRlclNlcnZpY2U6IElBZ2VudEhvc3ROZXdTZXNzaW9uRm9sZGVyU2VydmljZSxcblx0XHRASUFnZW50SG9zdFVudGl0bGVkUHJvdmlzaW9uYWxTZXNzaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm92aXNpb25hbFNlcnZpY2U6IElBZ2VudEhvc3RVbnRpdGxlZFByb3Zpc2lvbmFsU2Vzc2lvblNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZSBwcml2YXRlIHJlYWRvbmx5IF9pbXBvcnRDb252ZXJzYXRpb25TdG9yZTogSUFnZW50SG9zdEltcG9ydENvbnZlcnNhdGlvblN0b3JlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90b29sc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0QWN0aXZlQ2xpZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVDbGllbnRTZXJ2aWNlOiBJQWdlbnRIb3N0QWN0aXZlQ2xpZW50U2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX21vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASVdvcmtpbmdDb3B5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3JraW5nQ29weVNlcnZpY2U6IElXb3JraW5nQ29weVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZTogSUNoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZSxcblx0XHRASVBhdGhTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3BhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3JlbW90ZUFnZW50SG9zdFNlcnZpY2U6IElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY3VzdG9taXphdGlvblNlcnZpY2U6IElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fY29uZmlnID0gY29uZmlnO1xuXG5cdFx0Ly8gVGhlIGBpbnB1dE5lZWRlZGAgd2F0Y2hlcnMgbGl2ZSBpbiBhIHBsYWluIG1hcCAodGhleSBhcmUgc2hhcmVkIGFuZFxuXHRcdC8vIHJlZi1jb3VudGVkIGFjcm9zcyBzaWJsaW5nIHJlc291cmNlcyksIHNvIGRpc3Bvc2UgYW55IHRoYXQgc3Vydml2ZVxuXHRcdC8vIHdoZW4gdGhlIGhhbmRsZXIgZ29lcyBhd2F5LlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHsgc3RvcmUgfSBvZiB0aGlzLl9pbnB1dE5lZWRlZFdhdGNoZXJzLnZhbHVlcygpKSB7XG5cdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2lucHV0TmVlZGVkV2F0Y2hlcnMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX2lucHV0TmVlZGVkV2F0Y2hlckJhY2tlbmRzLmNsZWFyKCk7XG5cdFx0fSkpO1xuXHRcdC8vIERyb3AgTUNQIHNlcnZlcnMgZnJvbSB0aGUgcGVyLXNlc3Npb24gc3VyZmFjZWQgc2V0IG9uY2UgdGhleSByZWFjaCB0aGVcblx0XHQvLyBydW5uaW5nIHN0YXRlIHNvIGEgbGF0ZXIgYXV0aCByZXF1aXJlbWVudCBmb3IgdGhlIHNhbWUgc2VydmVyIHByb21wdHNcblx0XHQvLyBhZ2Fpbi5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jdXN0b21pemF0aW9uU2VydmljZS5vbkRpZENoYW5nZUN1c3RvbWl6YXRpb25zKCgpID0+IHRoaXMuX3JlY29uY2lsZVN1cmZhY2VkTWNwQXV0aFNlcnZlcnMoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5fYWN0aXZlQ2xpZW50RW50cmllcy52YWx1ZXMoKSkge1xuXHRcdFx0XHRlbnRyeS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9hY3RpdmVDbGllbnRFbnRyaWVzLmNsZWFyKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gV2hlbiB0aGUgdXNlciBjbGlja3MgXCJDb250aW51ZSBpbiBCYWNrZ3JvdW5kXCIgb24gYW4gQUhQIHRlcm1pbmFsXG5cdFx0Ly8gdG9vbCwgbmFycm93IHRoZSB0ZXJtaW5hbCBjbGFpbSBzbyB0aGUgc2VydmVyLXNpZGUgdG9vbCBoYW5kbGVyXG5cdFx0Ly8gY2FuIGRldGVjdCBpdCBhbmQgcmV0dXJuIGVhcmx5LlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2Uub25EaWRDb250aW51ZUluQmFja2dyb3VuZCh0ZXJtaW5hbFRvb2xTZXNzaW9uSWQgPT4ge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VBaHBUZXJtaW5hbFRvb2xTZXNzaW9uSWQodGVybWluYWxUb29sU2Vzc2lvbklkKTtcblx0XHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0FnZW50SG9zdF0gQ29udGludWUgaW4gYmFja2dyb3VuZDogdGVybWluYWw9JHtwYXJzZWQudGVybWluYWx9LCBzZXNzaW9uPSR7cGFyc2VkLnNlc3Npb259YCk7XG5cdFx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbi5kaXNwYXRjaChwYXJzZWQudGVybWluYWwsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbENsYWltZWQsXG5cdFx0XHRcdGNsYWltOiB7XG5cdFx0XHRcdFx0a2luZDogVGVybWluYWxDbGFpbUtpbmQuU2Vzc2lvbixcblx0XHRcdFx0XHRzZXNzaW9uOiBwYXJzZWQuc2Vzc2lvbixcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlZ2lzdGVyIGFuIGVkaXRpbmcgc2Vzc2lvbiBwcm92aWRlciBmb3IgdGhpcyBoYW5kbGVyJ3Mgc2Vzc2lvbiB0eXBlXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2hhdEVkaXRpbmdTZXJ2aWNlLnJlZ2lzdGVyRWRpdGluZ1Nlc3Npb25Qcm92aWRlcihcblx0XHRcdGNvbmZpZy5zZXNzaW9uVHlwZSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdGluZ1Nlc3Npb246IChjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkpID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFx0XHRBZ2VudEhvc3RTbmFwc2hvdENvbnRyb2xsZXIsXG5cdFx0XHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdFx0Y29uZmlnLmNvbm5lY3Rpb25BdXRob3JpdHksXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0KSk7XG5cblx0XHQvLyBTdXBwbHkgdGhlIHBlci1yZXNwb25zZSBcIkNoYW5nZWQgTiBmaWxlc1wiIGNoYXQgc3VtbWFyeSBmcm9tIHRoZVxuXHRcdC8vIGF1dGhvcml0YXRpdmUgc2VydmVyLWNvbXB1dGVkIHBlci10dXJuIGNoYW5nZXNldCAodGhlIHNhbWUgc291cmNlIGFzXG5cdFx0Ly8gdGhlIEFnZW50cy1hcHAgQ2hhbmdlcyB2aWV3KSBpbnN0ZWFkIG9mIHRoZSBlZGl0aW5nIHNlc3Npb24uXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoXG5cdFx0XHRjb25maWcuc2Vzc2lvblR5cGUsXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihuZXcgQWdlbnRIb3N0UmVzcG9uc2VGaWxlQ2hhbmdlc1Byb3ZpZGVyKFxuXHRcdFx0XHRjb25maWcuY29ubmVjdGlvbixcblx0XHRcdFx0Y29uZmlnLmNvbm5lY3Rpb25BdXRob3JpdHksXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZSA9PiB0aGlzLl9yZXNvbHZlU2Vzc2lvblVyaShzZXNzaW9uUmVzb3VyY2UpLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGNoYXRVUkkgPSB0aGlzLl9jaGF0VVJJc0J5U2Vzc2lvblJlc291cmNlLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRcdHJldHVybiBjaGF0VVJJID8gVVJJLnBhcnNlKGNoYXRVUkkpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR9LFxuXHRcdFx0KSksXG5cdFx0KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlckFnZW50KCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZXMgdGhlIHNpZ25lZC1pbiB1c2VyJ3MgcGxhbiBjb250ZXh0IGZvciBjaGF0IGVycm9yIGZvcm1hdHRpbmcuXG5cdCAqIFRoZSBhZ2VudCBob3N0IGRvZXMgbm90IGtub3cgdGhlIHVzZXIncyBwbGFuLCBzbyBxdW90YS9yYXRlLWxpbWl0XG5cdCAqIG1lc3NhZ2VzIGFyZSBwZXJzb25hbGl6ZWQgaGVyZSBmcm9tIGBJQ2hhdEVudGl0bGVtZW50U2VydmljZWAuXG5cdCAqL1xuXHRwcml2YXRlIF9jaGF0RXJyb3JDb250ZXh0KCk6IElDaGF0RXJyb3JDb250ZXh0IHtcblx0XHRjb25zdCBxdW90YXMgPSB0aGlzLl9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcztcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29waWxvdFBsYW46IGdldENvcGlsb3RQbGFuRnJvbUVudGl0bGVtZW50KHRoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQpLFxuXHRcdFx0aXNVc2FnZUJhc2VkQmlsbGluZzogcXVvdGFzLnVzYWdlQmFzZWRCaWxsaW5nLFxuXHRcdFx0cXVvdGFSZXNldERhdGU6IHF1b3Rhcy5yZXNldERhdGUsXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVDaGF0SW5wdXRDb21wbGV0aW9ucyhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgcGFyYW1zOiBJQ2hhdElucHV0Q29tcGxldGlvbnNQYXJhbXMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SUNoYXRJbnB1dENvbXBsZXRpb25zUmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0bGV0IGJhY2tlbmRTZXNzaW9uOiBVUkk7XG5cdFx0aWYgKGlzVW50aXRsZWRDaGF0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHQvLyBQcm92aXNpb25hbCBVUklzIGFyZSBvcGFxdWU7IHdhaXQgZm9yIHRoZSBjdXJyZW50IGdlbmVyYXRpb24gaW5zdGVhZCBvZiBkZXJpdmluZyBvbmUuXG5cdFx0XHRjb25zdCBwcm92aXNpb25hbFNlc3Npb24gPSBhd2FpdCByYWNlQ2FuY2VsbGF0aW9uKHRoaXMuX3Byb3Zpc2lvbmFsU2VydmljZS53YWl0Rm9yUGVuZGluZyhzZXNzaW9uUmVzb3VyY2UpLCB0b2tlbik7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGlmICghcHJvdmlzaW9uYWxTZXNzaW9uKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRiYWNrZW5kU2Vzc2lvbiA9IHByb3Zpc2lvbmFsU2Vzc2lvbjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YmFja2VuZFNlc3Npb24gPSB0aGlzLl9yZXNvbHZlU2Vzc2lvblVyaShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdH1cblx0XHQvLyBOb3RlOiB3ZSBkb24ndCBmb3J3YXJkIGB0b2tlbmAgYWNyb3NzIElQQyBcXHUyMDE0IGNhbmNlbGxhdGlvbiB0b2tlbnNcblx0XHQvLyBkb24ndCByb3VuZC10cmlwIHRocm91Z2ggdGhlIHByb3h5IGNoYW5uZWwgdG9kYXkuIFRoZSBwb3N0LWF3YWl0XG5cdFx0Ly8gYGlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkYCBjaGVjayBiZWxvdyBpcyBlbm91Z2ggdG8gZHJvcCBhIHN0YWxlXG5cdFx0Ly8gcmVzdWx0IGlmIHRoZSB1c2VyIGtlcHQgdHlwaW5nIHdoaWxlIHRoZSByZXF1ZXN0IHdhcyBpbiBmbGlnaHQuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uY29tcGxldGlvbnMoe1xuXHRcdFx0a2luZDogQWhwQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXJNZXNzYWdlLFxuXHRcdFx0Y2hhbm5lbDogYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdHRleHQ6IHBhcmFtcy50ZXh0LFxuXHRcdFx0b2Zmc2V0OiBwYXJhbXMub2Zmc2V0LFxuXHRcdH0pO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgaXRlbXM6IElDaGF0SW5wdXRDb21wbGV0aW9uSXRlbVtdID0gW107XG5cdFx0Zm9yIChjb25zdCByYXcgb2YgcmVzdWx0Lml0ZW1zKSB7XG5cdFx0XHRjb25zdCBtYXBwZWQgPSB0aGlzLl90b0NoYXRJbnB1dENvbXBsZXRpb25JdGVtKHJhdywgcGFyYW1zLnRleHQpO1xuXHRcdFx0aWYgKG1hcHBlZCkge1xuXHRcdFx0XHRpdGVtcy5wdXNoKG1hcHBlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7IGl0ZW1zIH07XG5cdH1cblxuXHRwcm92aWRlQ2hhdElucHV0Q29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzKCk6IFByb21pc2U8cmVhZG9ubHkgc3RyaW5nW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uZ2V0Q29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVDb21wbGV0aW9uSXRlbShyYXc6IEFocENvbXBsZXRpb25JdGVtLCB0ZXh0OiBzdHJpbmcsIGF0dGFjaG1lbnQ6IElDaGF0SW5wdXRDb21wbGV0aW9uSXRlbVsnYXR0YWNobWVudCddLCBsYWJlbD86IHN0cmluZyk6IElDaGF0SW5wdXRDb21wbGV0aW9uSXRlbSB7XG5cdFx0Y29uc3QgaXRlbTogTXV0YWJsZTxJQ2hhdElucHV0Q29tcGxldGlvbkl0ZW0+ID0ge1xuXHRcdFx0aW5zZXJ0VGV4dDogcmF3Lmluc2VydFRleHQsXG5cdFx0XHRhdHRhY2htZW50XG5cdFx0fTtcblx0XHRpZiAobGFiZWwgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aXRlbS5sYWJlbCA9IGxhYmVsO1xuXHRcdH1cblx0XHRpZiAocmF3LnJhbmdlU3RhcnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aXRlbS5zdGFydCA9IG9mZnNldFRvUG9zaXRpb24odGV4dCwgcmF3LnJhbmdlU3RhcnQpO1xuXHRcdH1cblx0XHRpZiAocmF3LnJhbmdlRW5kICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGl0ZW0uZW5kID0gb2Zmc2V0VG9Qb3NpdGlvbih0ZXh0LCByYXcucmFuZ2VFbmQpO1xuXHRcdH1cblx0XHRyZXR1cm4gaXRlbTtcblx0fVxuXG5cdHByaXZhdGUgX3RvQ2hhdElucHV0Q29tcGxldGlvbkl0ZW0ocmF3OiBBaHBDb21wbGV0aW9uSXRlbSwgdGV4dDogc3RyaW5nKTogSUNoYXRJbnB1dENvbXBsZXRpb25JdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhdHRhY2htZW50ID0gcmF3LmF0dGFjaG1lbnQ7XG5cdFx0c3dpdGNoIChhdHRhY2htZW50LnR5cGUpIHtcblx0XHRcdGNhc2UgTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZToge1xuXHRcdFx0XHRjb25zdCBjb21wbGV0aW9uTWV0YSA9IHJlYWRDb21wbGV0aW9uQXR0YWNobWVudE1ldGEoYXR0YWNobWVudCk7XG5cdFx0XHRcdGlmIChjb21wbGV0aW9uTWV0YT8ua2luZCA9PT0gJ2NvbW1hbmQnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZUNvbXBsZXRpb25JdGVtKHJhdywgdGV4dCwge1xuXHRcdFx0XHRcdFx0a2luZDogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdFx0Y29tbWFuZDogY29tcGxldGlvbk1ldGEuY29tbWFuZCxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBjb21wbGV0aW9uTWV0YS5kZXNjcmlwdGlvbiA/PyAnJyxcblx0XHRcdFx0XHRcdC4uLihhdHRhY2htZW50Ll9tZXRhICE9PSB1bmRlZmluZWQgJiYgeyBfbWV0YTogYXR0YWNobWVudC5fbWV0YSB9KSxcblx0XHRcdFx0XHR9LCBhdHRhY2htZW50LmxhYmVsICE9PSByYXcuaW5zZXJ0VGV4dCA/IGF0dGFjaG1lbnQubGFiZWwgOiB1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjb21wbGV0aW9uTWV0YT8ua2luZCA9PT0gJ3NraWxsJykge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9jcmVhdGVDb21wbGV0aW9uSXRlbShyYXcsIHRleHQsIHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdza2lsbCcsXG5cdFx0XHRcdFx0XHR1cmk6IFVSSS5wYXJzZShjb21wbGV0aW9uTWV0YS51cmkpLFxuXHRcdFx0XHRcdFx0Li4uKGNvbXBsZXRpb25NZXRhLmRpc3BsYXlOYW1lICE9PSB1bmRlZmluZWQgPyB7IGRpc3BsYXlOYW1lOiBjb21wbGV0aW9uTWV0YS5kaXNwbGF5TmFtZSB9IDoge30pLFxuXHRcdFx0XHRcdFx0Li4uKGNvbXBsZXRpb25NZXRhLmRlc2NyaXB0aW9uICE9PSB1bmRlZmluZWQgPyB7IGRlc2NyaXB0aW9uOiBjb21wbGV0aW9uTWV0YS5kZXNjcmlwdGlvbiB9IDoge30pLFxuXHRcdFx0XHRcdFx0Li4uKGF0dGFjaG1lbnQuX21ldGEgIT09IHVuZGVmaW5lZCAmJiB7IF9tZXRhOiBhdHRhY2htZW50Ll9tZXRhIH0pLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZToge1xuXHRcdFx0XHRjb25zdCB1cmkgPSB0eXBlb2YgYXR0YWNobWVudC51cmkgPT09ICdzdHJpbmcnID8gVVJJLnBhcnNlKGF0dGFjaG1lbnQudXJpKSA6IFVSSS5mcm9tKGF0dGFjaG1lbnQudXJpKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZUNvbXBsZXRpb25JdGVtKHJhdywgdGV4dCwge1xuXHRcdFx0XHRcdGtpbmQ6ICdyZXNvdXJjZScsXG5cdFx0XHRcdFx0dXJpLFxuXHRcdFx0XHRcdGRpc3BsYXlOYW1lOiBhdHRhY2htZW50LmxhYmVsLFxuXHRcdFx0XHRcdGlzRGlyZWN0b3J5OiBhdHRhY2htZW50LmRpc3BsYXlLaW5kID09PSAnZGlyZWN0b3J5Jyxcblx0XHRcdFx0XHQuLi4oYXR0YWNobWVudC5fbWV0YSAhPT0gdW5kZWZpbmVkICYmIHsgX21ldGE6IGF0dGFjaG1lbnQuX21ldGEgfSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBNZXNzYWdlQXR0YWNobWVudEtpbmQuQ2hhdDoge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlQ29tcGxldGlvbkl0ZW0ocmF3LCB0ZXh0LCB7XG5cdFx0XHRcdFx0a2luZDogJ2NoYXQnLFxuXHRcdFx0XHRcdHVyaTogVVJJLnBhcnNlKGF0dGFjaG1lbnQucmVzb3VyY2UpLFxuXHRcdFx0XHRcdGVuZFR1cm46IGF0dGFjaG1lbnQuZW5kVHVybixcblx0XHRcdFx0XHR0aXRsZTogYXR0YWNobWVudC5sYWJlbCxcblx0XHRcdFx0XHRkaXNwbGF5TmFtZTogYXR0YWNobWVudC5sYWJlbCxcblx0XHRcdFx0XHQuLi4oYXR0YWNobWVudC5fbWV0YSAhPT0gdW5kZWZpbmVkICYmIHsgX21ldGE6IGF0dGFjaG1lbnQuX21ldGEgfSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0Ly8gRW1iZWRkZWQgcmVzb3VyY2VzIHdpbGwgYmUgYWRkZWQgd2hlbiB0aGUgd29ya2JlbmNoIGdyb3dzIGZpcnN0LWNsYXNzIHN1cHBvcnQgZm9yIHRoZW0uXG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIHVua25vd24gYXR0YWNobWVudCB0eXBlXG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdFNlc3Npb24+IHtcblx0XHRpZiAoc2Vzc2lvblJlc291cmNlLnBhdGguc3Vic3RyaW5nKDEpLnN0YXJ0c1dpdGgoJ3VudGl0bGVkLScpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEFnZW50IGhvc3QgY2hhdCBzZXNzaW9ucyBtdXN0IGJlIGNyZWF0ZWQgYnkgdGhlIHNlc3Npb25zIHByb3ZpZGVyOiAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdH1cblxuXHRcdC8vIEZvciBuZXcgc2Vzc2lvbnMsIGRlZmVyIGJhY2tlbmQgc2Vzc2lvbiBjcmVhdGlvbiB1bnRpbCB0aGUgZmlyc3QgcmVxdWVzdFxuXHRcdC8vIGFycml2ZXMgc28gdGhlIHVzZXItc2VsZWN0ZWQgbW9kZWwgaXMgYXZhaWxhYmxlLiBUaGUgY2hhdCByZXNvdXJjZSBzdGlsbFxuXHRcdC8vIGNhcnJpZXMgdGhlIHJhdyBzZXNzaW9uIGlkIHRoYXQgd2lsbCBiZSB1c2VkIHdoZW4gY3JlYXRlU2Vzc2lvbiBydW5zLlxuXHRcdGNvbnN0IHJlc29sdmVkU2Vzc2lvbiA9IHRoaXMuX3Jlc29sdmVTZXNzaW9uVXJpKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0bGV0IGNoYXRVUkk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRcdC8vIFRoZSBwb2ludCBvZiB0aGlzIGlzIHRvIGNoZWNrIHdpdGggdGhlIHNlc3Npb24gcHJvdmlkZXIgb3IgY29udHJvbGxlclxuXHRcdC8vIHdoZXRoZXIgdGhpcyBzZXNzaW9uIHJlc291cmNlIHJlcHJlc2VudHMgYSBuZXcgc2Vzc2lvbiB0aGF0IGhhc24ndCB5ZXRcblx0XHQvLyBiZWVuIGNyZWF0ZWQgb24gdGhlIGJhY2tlbmQuXG5cdFx0Y29uc3QgaXNOZXdTZXNzaW9uID0gdGhpcy5faXNOZXdTZXNzaW9uUmVzb3VyY2Uoc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBoaXN0b3J5OiBJQ2hhdFNlc3Npb25IaXN0b3J5SXRlbVtdID0gW107XG5cdFx0bGV0IGluaXRpYWxQcm9ncmVzczogSUNoYXRQcm9ncmVzc1tdIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBpbml0aWFsUmVzcG9uc2VQYXJ0Q291bnQgPSAwO1xuXHRcdGxldCBhY3RpdmVUdXJuSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgc2Vzc2lvblRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGRyYWZ0SW5wdXRTdGF0ZTogSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGUgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHNlc3Npb25TdWJzY3JpcHRpb246IElBZ2VudFN1YnNjcmlwdGlvbjxTZXNzaW9uU3RhdGU+IHwgdW5kZWZpbmVkO1xuXHRcdGxldCBjaGF0U3Vic2NyaXB0aW9uOiBJQWdlbnRTdWJzY3JpcHRpb248Q2hhdFN0YXRlPiB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBoaXN0b3J5U3ViYWdlbnRPYnNlcnZhdGlvbnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Ly8gTWFyayB0aGlzIHNlc3Npb24gYXMgaHlkcmF0aW5nIHNvIHRoYXQgYSBzaWJsaW5nIGNoYXQgb2YgdGhlIHNhbWVcblx0XHQvLyBzZXNzaW9uIGNsb3Npbmcgd2hpbGUgd2UgYXdhaXQgb3VyIHN1YnNjcmlwdGlvbnMgZG9lcyBub3QgdGVhciBkb3duXG5cdFx0Ly8gdGhlIHNoYXJlZCBzZXNzaW9uIHN1YnNjcmlwdGlvbiAod2hpY2ggd291bGQgc3RyYW5kIHVzIGZvcmV2ZXIpLlxuXHRcdGNvbnN0IGh5ZHJhdGlvbktleSA9IHJlc29sdmVkU2Vzc2lvbi50b1N0cmluZygpO1xuXHRcdC8vIEV4aXN0aW5nIHNlc3Npb25zIG5lZWQgaHlkcmF0ZWQgc3RhdGUgYmVmb3JlIHRoZWlyIGN1c3RvbWl6YXRpb24gc2NvcGUgY2FuIGJlIHJlc29sdmVkLlxuXHRcdGlmIChpc05ld1Nlc3Npb24pIHtcblx0XHRcdHRoaXMuX2Vuc3VyZUFjdGl2ZUNsaWVudEVudHJ5KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fVxuXHRcdHRoaXMuX2h5ZHJhdGluZ0NoYXRTZXNzaW9ucy5zZXQoaHlkcmF0aW9uS2V5LCAodGhpcy5faHlkcmF0aW5nQ2hhdFNlc3Npb25zLmdldChoeWRyYXRpb25LZXkpID8/IDApICsgMSk7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghaXNOZXdTZXNzaW9uKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3Qgc3ViID0gdGhpcy5fZW5zdXJlU2Vzc2lvblN1YnNjcmlwdGlvbihyZXNvbHZlZFNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0c2Vzc2lvblN1YnNjcmlwdGlvbiA9IHN1Yjtcblx0XHRcdFx0XHQvLyBXYWl0IGZvciBib3RoIHRoZSBzZXNzaW9uIHN1bW1hcnkgYW5kIGl0cyBkZWZhdWx0LWNoYXRcblx0XHRcdFx0XHQvLyBjb252ZXJzYXRpb24gc3RhdGUgdG8gaHlkcmF0ZSBmcm9tIHRoZSBzZXJ2ZXIuIEFmdGVyIHRoZVxuXHRcdFx0XHRcdC8vIG11bHRpLWNoYXQgcHJvdG9jb2wgYWRvcHRpb24sIHR1cm5zL2FjdGl2ZVR1cm4gbGl2ZSBvbiB0aGVcblx0XHRcdFx0XHQvLyBzZXBhcmF0ZSBjaGF0IGNoYW5uZWwsIHNvIHJlYWRpbmcgdGhlbSBiZWZvcmUgdGhlIGNoYXRcblx0XHRcdFx0XHQvLyBzdWJzY3JpcHRpb24gbGFuZHMgd291bGQgeWllbGQgYW4gZW1wdHkgaGlzdG9yeS5cblx0XHRcdFx0XHRhd2FpdCB0aGlzLl93aGVuU3Vic2NyaXB0aW9uSHlkcmF0ZWQoc3ViLCB0b2tlbik7XG5cdFx0XHRcdFx0Ly8gQSBmYWlsZWQgc3Vic2NyaXB0aW9uIHN1cmZhY2VzIGFzIGFuIGBFcnJvcmAgdmFsdWU7IHJldGhyb3cgaXRcblx0XHRcdFx0XHQvLyBzbyB0aGUgcmVhbCByZWFzb24gKGUuZy4gdGhlIHdvcmtpbmcgZGlyZWN0b3J5IG5vIGxvbmdlclxuXHRcdFx0XHRcdC8vIGV4aXN0cykgaXMgbG9nZ2VkIGFuZCByZW5kZXJlZCBpbnN0ZWFkIG9mIGEgZ2VuZXJpYyBtZXNzYWdlLlxuXHRcdFx0XHRcdGlmIChzdWIudmFsdWUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0XHRcdFx0dGhyb3cgc3ViLnZhbHVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCByYXdTdGF0ZSA9IHRoaXMuX2dldFJhd1Nlc3Npb25TdGF0ZShyZXNvbHZlZFNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0aWYgKCFyYXdTdGF0ZSkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBTZXNzaW9uIHN0YXRlIGRpZCBub3QgaHlkcmF0ZSBmb3IgJHtyZXNvbHZlZFNlc3Npb24udG9TdHJpbmcoKX1gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2hhdFVSSSA9IHRoaXMuX3Jlc29sdmVDaGF0VXJpRnJvbVN0YXRlKHNlc3Npb25SZXNvdXJjZSwgcmF3U3RhdGUpO1xuXHRcdFx0XHRcdHRoaXMuX3NldENoYXRVUkkoc2Vzc2lvblJlc291cmNlLCBjaGF0VVJJKTtcblx0XHRcdFx0XHRjb25zdCBjaGF0U3ViID0gdGhpcy5fZW5zdXJlQ2hhdFN1YnNjcmlwdGlvbihyZXNvbHZlZFNlc3Npb24udG9TdHJpbmcoKSwgY2hhdFVSSSk7XG5cdFx0XHRcdFx0Y2hhdFN1YnNjcmlwdGlvbiA9IGNoYXRTdWI7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fd2hlblN1YnNjcmlwdGlvbkh5ZHJhdGVkKGNoYXRTdWIsIHRva2VuKTtcblx0XHRcdFx0XHRjb25zdCBzZXNzaW9uU3RhdGUgPSB0aGlzLl9nZXRTZXNzaW9uU3RhdGUocmVzb2x2ZWRTZXNzaW9uLnRvU3RyaW5nKCksIGNoYXRVUkkpO1xuXHRcdFx0XHRcdGlmIChzZXNzaW9uU3RhdGUpIHtcblx0XHRcdFx0XHRcdHNlc3Npb25UaXRsZSA9IHNlc3Npb25TdGF0ZS50aXRsZTtcblx0XHRcdFx0XHRcdGNvbnN0IGRyYWZ0ID0gc2Vzc2lvblN0YXRlLmRyYWZ0ID8/IGVtcHR5RHJhZnRGcm9tTGFzdFR1cm4oc2Vzc2lvblN0YXRlKTtcblx0XHRcdFx0XHRcdGRyYWZ0SW5wdXRTdGF0ZSA9IHRoaXMuX2RyYWZ0VG9JbnB1dFN0YXRlKHNlc3Npb25SZXNvdXJjZSwgZHJhZnQpO1xuXHRcdFx0XHRcdFx0aWYgKCFzZXNzaW9uU3RhdGUuZHJhZnQgJiYgZHJhZnQpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uZGlzcGF0Y2goY2hhdFVSSSwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXREcmFmdENoYW5nZWQsIGRyYWZ0IH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgZmFsbGJhY2tSYXdNb2RlbElkID0gbGFzdFR1cm5Nb2RlbFNlbGVjdGlvbihzZXNzaW9uU3RhdGUpPy5pZDtcblx0XHRcdFx0XHRcdGNvbnN0IGxvb2t1cCA9IHRoaXMuX2NyZWF0ZVR1cm5Nb2RlbExvb2t1cChzZXNzaW9uUmVzb3VyY2UsIGZhbGxiYWNrUmF3TW9kZWxJZCk7XG5cdFx0XHRcdFx0XHRoaXN0b3J5LnB1c2goLi4udHVybnNUb0hpc3RvcnkoXG5cdFx0XHRcdFx0XHRcdHJlc29sdmVkU2Vzc2lvbixcblx0XHRcdFx0XHRcdFx0c2Vzc2lvblN0YXRlLnR1cm5zLFxuXHRcdFx0XHRcdFx0XHR0aGlzLl9jb25maWcuYWdlbnRJZCxcblx0XHRcdFx0XHRcdFx0dGhpcy5fY29uZmlnLmNvbm5lY3Rpb25BdXRob3JpdHksXG5cdFx0XHRcdFx0XHRcdGxvb2t1cCxcblx0XHRcdFx0XHRcdFx0dGhpcy5fY2hhdEVycm9yQ29udGV4dCgpLFxuXHRcdFx0XHRcdFx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbi5pbml0aWFsaXplUmVzdWx0LmdldCgpPy50ZXJtaW5hbENvbW1hbmRQcmVmaXgsXG5cdFx0XHRcdFx0XHQpKTtcblxuXHRcdFx0XHRcdFx0Ly8gRW5yaWNoIGhpc3Rvcnkgd2l0aCBpbm5lciB0b29sIGNhbGxzIGZyb20gc3ViYWdlbnRcblx0XHRcdFx0XHRcdC8vIGNoaWxkIHNlc3Npb25zLiBTdWJzY3JpYmVzIHRvIGVhY2ggY2hpbGQgc2Vzc2lvbiBzb1xuXHRcdFx0XHRcdFx0Ly8gaXRzIHRvb2wgY2FsbHMgYXBwZWFyIGdyb3VwZWQgdW5kZXIgdGhlIHBhcmVudCB3aWRnZXQuXG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9lbnJpY2hIaXN0b3J5V2l0aFN1YmFnZW50Q2FsbHMoaGlzdG9yeSwgcmVzb2x2ZWRTZXNzaW9uLCBzZXNzaW9uUmVzb3VyY2UsIHNlc3Npb25TdGF0ZSwgaGlzdG9yeVN1YmFnZW50T2JzZXJ2YXRpb25zKTtcblxuXHRcdFx0XHRcdFx0Ly8gU3RvcmUgaGlzdG9yaWNhbCB0dXJucyBzbyB0aGUgZWRpdGluZyBzZXNzaW9uIGNhbiBzZWVkIGFcblx0XHRcdFx0XHRcdC8vIHJlcXVlc3QtbGV2ZWwgY2hlY2twb2ludCBmb3IgZWFjaCB0dXJuICh3aXRoIGZpbGUgZWRpdHNcblx0XHRcdFx0XHRcdC8vIGZvbGRlZCBpbikgd2hlbiB0aGUgY29udHJvbGxlciBpcyBjcmVhdGVkIGxhemlseS4gV2Ugc2VlZFxuXHRcdFx0XHRcdFx0Ly8gZm9yIGV2ZXJ5IHR1cm4gXHUyMDE0IG5vdCBqdXN0IHRob3NlIHdpdGggZWRpdHMgXHUyMDE0IHNvIFwiUmVzdG9yZVxuXHRcdFx0XHRcdFx0Ly8gQ2hlY2twb2ludFwiIG9uIGFueSBoaXN0b3JpY2FsIHJlcXVlc3QgY2FuIGZpbmQgYSBib3VuZGFyeVxuXHRcdFx0XHRcdFx0Ly8gdG8gbmF2aWdhdGUgdG8uXG5cdFx0XHRcdFx0XHRpZiAoc2Vzc2lvblN0YXRlLnR1cm5zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fcGVuZGluZ0hpc3RvcnlUdXJucy5zZXQoc2Vzc2lvblJlc291cmNlLCBzZXNzaW9uU3RhdGUudHVybnMpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBJZiB0aGVyZSdzIGFuIGFjdGl2ZSB0dXJuLCBpbmNsdWRlIGl0cyByZXF1ZXN0IGluIGhpc3Rvcnlcblx0XHRcdFx0XHRcdC8vIHdpdGggYW4gZW1wdHkgcmVzcG9uc2Ugc28gdGhlIGNoYXQgc2VydmljZSBjcmVhdGVzIGFcblx0XHRcdFx0XHRcdC8vIHBlbmRpbmcgcmVxdWVzdCwgdGhlbiBwcm92aWRlIGFjY3VtdWxhdGVkIHByb2dyZXNzIHZpYVxuXHRcdFx0XHRcdFx0Ly8gcHJvZ3Jlc3NPYnMgZm9yIGxpdmUgc3RyZWFtaW5nLlxuXHRcdFx0XHRcdFx0aWYgKHNlc3Npb25TdGF0ZS5hY3RpdmVUdXJuKSB7XG5cdFx0XHRcdFx0XHRcdGFjdGl2ZVR1cm5JZCA9IHNlc3Npb25TdGF0ZS5hY3RpdmVUdXJuLmlkO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBhY3RpdmVSYXdNb2RlbElkID0gc2Vzc2lvblN0YXRlLmFjdGl2ZVR1cm4udXNhZ2U/Lm1vZGVsID8/IGZhbGxiYWNrUmF3TW9kZWxJZDtcblx0XHRcdFx0XHRcdFx0aGlzdG9yeS5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRpZDogc2Vzc2lvblN0YXRlLmFjdGl2ZVR1cm4uaWQsXG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3JlcXVlc3QnLFxuXHRcdFx0XHRcdFx0XHRcdHByb21wdDogc2Vzc2lvblN0YXRlLmFjdGl2ZVR1cm4ubWVzc2FnZS50ZXh0LFxuXHRcdFx0XHRcdFx0XHRcdHBhcnRpY2lwYW50OiB0aGlzLl9jb25maWcuYWdlbnRJZCxcblx0XHRcdFx0XHRcdFx0XHRtb2RlbElkOiBsb29rdXAudG9MYW5ndWFnZU1vZGVsSWQoYWN0aXZlUmF3TW9kZWxJZCksXG5cdFx0XHRcdFx0XHRcdFx0dGltZXN0YW1wOiBwYXJzZVRpbWVzdGFtcChzZXNzaW9uU3RhdGUuYWN0aXZlVHVybi5zdGFydGVkQXQpLFxuXHRcdFx0XHRcdFx0XHRcdHZhcmlhYmxlRGF0YTogbWVzc2FnZVRvVmFyaWFibGVEYXRhKHNlc3Npb25TdGF0ZS5hY3RpdmVUdXJuLm1lc3NhZ2UsIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5KSxcblx0XHRcdFx0XHRcdFx0XHRpc1N5c3RlbUluaXRpYXRlZDogc2Vzc2lvblN0YXRlLmFjdGl2ZVR1cm4ubWVzc2FnZS5vcmlnaW4ua2luZCA9PT0gTWVzc2FnZUtpbmQuU3lzdGVtTm90aWZpY2F0aW9uLFxuXHRcdFx0XHRcdFx0XHRcdG9yaWdpbjogbWVzc2FnZVRvUmVxdWVzdE9yaWdpbihyZXNvbHZlZFNlc3Npb24sIHNlc3Npb25TdGF0ZS5hY3RpdmVUdXJuLm1lc3NhZ2UsIHRoaXMuX2NvbmZpZy5hZ2VudElkKSxcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRcdGhpc3RvcnkucHVzaCh7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3Jlc3BvbnNlJyxcblx0XHRcdFx0XHRcdFx0XHRwYXJ0czogW10sXG5cdFx0XHRcdFx0XHRcdFx0cGFydGljaXBhbnQ6IHRoaXMuX2NvbmZpZy5hZ2VudElkLFxuXHRcdFx0XHRcdFx0XHRcdGRldGFpbHM6IGxvb2t1cC50b1Jlc3BvbnNlRGV0YWlscyhhY3RpdmVSYXdNb2RlbElkLCBzZXNzaW9uU3RhdGUuYWN0aXZlVHVybi51c2FnZSksXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRpbml0aWFsUHJvZ3Jlc3MgPSBhY3RpdmVUdXJuVG9Qcm9ncmVzcyhcblx0XHRcdFx0XHRcdFx0XHRyZXNvbHZlZFNlc3Npb24sXG5cdFx0XHRcdFx0XHRcdFx0c2Vzc2lvblN0YXRlLmFjdGl2ZVR1cm4sXG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fY29uZmlnLmNvbm5lY3Rpb25BdXRob3JpdHksXG5cdFx0XHRcdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlLmF1dGhvcml0eSxcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9vdGhlckNsaWVudFRvb2xJbnZvY2F0aW9uT3B0aW9ucyhyZXNvbHZlZFNlc3Npb24sIGNoYXRVUkksIHNlc3Npb25TdGF0ZS5hY3RpdmVUdXJuLmlkKSxcblx0XHRcdFx0XHRcdFx0XHRsb29rdXAsXG5cdFx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRcdGluaXRpYWxSZXNwb25zZVBhcnRDb3VudCA9IHNlc3Npb25TdGF0ZS5hY3RpdmVUdXJuLnJlc3BvbnNlUGFydHMubGVuZ3RoO1xuXHRcdFx0XHRcdFx0XHQvLyBFbnJpY2ggdXNhZ2UgZW50cmllcyB3aXRoIHRoZSBhY3R1YWwgbW9kZWwgc28gdGhlXG5cdFx0XHRcdFx0XHRcdC8vIGNvbnRleHQtdXNhZ2Ugd2lkZ2V0IHJlc29sdmVzIHRoZSByaWdodCBjb250ZXh0IHdpbmRvd1xuXHRcdFx0XHRcdFx0XHQvLyBvbiByZWNvbm5lY3Rpb24gKHNhbWUgZW5yaWNobWVudCBhcyBfb2JzZXJ2ZVR1cm4pLlxuXHRcdFx0XHRcdFx0XHRjb25zdCBhY3R1YWxNb2RlbElkID0gdGhpcy5fdG9MYW5ndWFnZU1vZGVsSWQoc2Vzc2lvblJlc291cmNlLCBzZXNzaW9uU3RhdGUuYWN0aXZlVHVybi51c2FnZT8ubW9kZWwpO1xuXHRcdFx0XHRcdFx0XHRpZiAoYWN0dWFsTW9kZWxJZCkge1xuXHRcdFx0XHRcdFx0XHRcdGZvciAoY29uc3QgcCBvZiBpbml0aWFsUHJvZ3Jlc3MpIHtcblx0XHRcdFx0XHRcdFx0XHRcdGlmIChwLmtpbmQgPT09ICd1c2FnZScpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cC5hY3R1YWxNb2RlbElkID0gYWN0dWFsTW9kZWxJZDtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRIb3N0XSBSZWNvbm5lY3RpbmcgdG8gYWN0aXZlIHR1cm4gJHthY3RpdmVUdXJuSWR9IGZvciBzZXNzaW9uICR7cmVzb2x2ZWRTZXNzaW9uLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RdIEZhaWxlZCB0byBzdWJzY3JpYmUgdG8gZXhpc3Rpbmcgc2Vzc2lvbjogJHtyZXNvbHZlZFNlc3Npb24udG9TdHJpbmcoKX1gLCBlcnIpO1xuXHRcdFx0XHRcdC8vIFN1cmZhY2UgYSBoYXJkIGxvYWQgZmFpbHVyZSBhcyBhIHZpc2libGUgY2hhdCBlcnJvciBpbnN0ZWFkIG9mXG5cdFx0XHRcdFx0Ly8gYSBzaWxlbnRseSBlbXB0eSBzZXNzaW9uLiBPbmx5IHdoZW4gbm90aGluZyBlbHNlIHJlbmRlcmVkLCBzbyBhXG5cdFx0XHRcdFx0Ly8gcGFydGlhbGx5LWh5ZHJhdGVkIGhpc3RvcnkgaXNuJ3QgY2xvYmJlcmVkLiBBIGJhcmUgcmVzcG9uc2UgaXNcblx0XHRcdFx0XHQvLyBkcm9wcGVkIHdpdGhvdXQgYSBwcmVjZWRpbmcgcmVxdWVzdCwgc28gYW5jaG9yIGl0IHdpdGggYVxuXHRcdFx0XHRcdC8vIHN5c3RlbS1pbml0aWF0ZWQgcmVxdWVzdCAocmVuZGVycyBhcyBhIGNvbXBhY3Qgbm90aWNlLCBub3QgYVxuXHRcdFx0XHRcdC8vIHVzZXIgYnViYmxlKSBhbmQgYXR0YWNoIHRoZSBlcnJvciB0byBpdHMgcmVzcG9uc2UuIFByZWZlciB0aGVcblx0XHRcdFx0XHQvLyB1bmRlcmx5aW5nIGVycm9yIG1lc3NhZ2UgKGUuZy4gdGhlIGdpdCB3b3JrdHJlZS1yZWNyZWF0aW9uXG5cdFx0XHRcdFx0Ly8gZmFpbHVyZSkgc28gdGhlIHVzZXIgc2VlcyB0aGUgYWN0dWFsIGNhdXNlLCBmYWxsaW5nIGJhY2sgdG8gYVxuXHRcdFx0XHRcdC8vIGdlbmVyaWMgbWVzc2FnZS5cblx0XHRcdFx0XHRpZiAoaGlzdG9yeS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdGhpc3RvcnkucHVzaCh7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdyZXF1ZXN0Jyxcblx0XHRcdFx0XHRcdFx0cHJvbXB0OiAnJyxcblx0XHRcdFx0XHRcdFx0cGFydGljaXBhbnQ6IHRoaXMuX2NvbmZpZy5hZ2VudElkLFxuXHRcdFx0XHRcdFx0XHRpc1N5c3RlbUluaXRpYXRlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0c3lzdGVtSW5pdGlhdGVkTGFiZWw6IGxvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkxvYWRGYWlsZWRMYWJlbCcsIFwiQ291bGRuJ3Qgb3BlbiBzZXNzaW9uXCIpLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRoaXN0b3J5LnB1c2goe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAncmVzcG9uc2UnLFxuXHRcdFx0XHRcdFx0XHRwYXJ0czogW10sXG5cdFx0XHRcdFx0XHRcdHBhcnRpY2lwYW50OiB0aGlzLl9jb25maWcuYWdlbnRJZCxcblx0XHRcdFx0XHRcdFx0ZXJyb3JEZXRhaWxzOiB7IG1lc3NhZ2U6IHVud3JhcFNlc3Npb25Mb2FkRXJyb3JNZXNzYWdlKGVycikgPz8gbG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uTG9hZEZhaWxlZCcsIFwiVGhpcyBzZXNzaW9uIGNvdWxkbid0IGJlIGxvYWRlZC5cIikgfSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjb25zdCByZW1haW5pbmcgPSAodGhpcy5faHlkcmF0aW5nQ2hhdFNlc3Npb25zLmdldChoeWRyYXRpb25LZXkpID8/IDEpIC0gMTtcblx0XHRcdGlmIChyZW1haW5pbmcgPiAwKSB7XG5cdFx0XHRcdHRoaXMuX2h5ZHJhdGluZ0NoYXRTZXNzaW9ucy5zZXQoaHlkcmF0aW9uS2V5LCByZW1haW5pbmcpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5faHlkcmF0aW5nQ2hhdFNlc3Npb25zLmRlbGV0ZShoeWRyYXRpb25LZXkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRsZXQgc2Vzc2lvbjogQWdlbnRIb3N0Q2hhdFNlc3Npb247XG5cdFx0dHJ5IHtcblx0XHRcdHNlc3Npb24gPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0QWdlbnRIb3N0Q2hhdFNlc3Npb24sXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0aGlzdG9yeSxcblx0XHRcdFx0c2Vzc2lvblRpdGxlLFxuXHRcdFx0XHRzZXNzaW9uU3Vic2NyaXB0aW9uLFxuXHRcdFx0XHRjaGF0U3Vic2NyaXB0aW9uLFxuXHRcdFx0XHR0aGlzLl9jb25maWcucHJvbXB0Q2FjaGVOb3RpZmljYXRpb24sXG5cdFx0XHRcdChyZXF1ZXN0OiBJQ2hhdFNlc3Npb25SZXF1ZXN0SGlzdG9yeUl0ZW0gfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRcdGlmICghdGhpcy5fZ2V0U2Vzc2lvblN0YXRlKHJlc29sdmVkU2Vzc2lvbi50b1N0cmluZygpKSkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgZm9yayBzZXNzaW9uIGJlZm9yZSB0aGUgaW5pdGlhbCByZXF1ZXN0Jyk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2ZvcmtTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgcmVzb2x2ZWRTZXNzaW9uLCByZXF1ZXN0LCB0b2tlbik7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdCh0aXRsZTogc3RyaW5nLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uZGlzcGF0Y2gocmVzb2x2ZWRTZXNzaW9uLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCxcblx0XHRcdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0ZHJhZnRJbnB1dFN0YXRlLFxuXHRcdFx0XHRpbml0aWFsUHJvZ3Jlc3MsXG5cdFx0XHRcdGhpc3RvcnlTdWJhZ2VudE9ic2VydmF0aW9ucyxcblx0XHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2FjdGl2ZVNlc3Npb25zLmRlbGV0ZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRcdHRoaXMuX2Rpc3Bvc2VBY3RpdmVDbGllbnRFbnRyeShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdNZXNzYWdlU3Vic2NyaXB0aW9ucy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdFx0dGhpcy5fZHJhZnRTeW5jU3Vic2NyaXB0aW9ucy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdFx0dGhpcy5fc2VydmVyVHVybldhdGNoZXJzLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0XHR0aGlzLl9tY3BBdXRoV2F0Y2hlcnMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRcdHRoaXMuX3JlbGVhc2VTZXNzaW9uSW5wdXROZWVkZWQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nSGlzdG9yeVR1cm5zLmRlbGV0ZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRcdHRoaXMuX3N1cmZhY2VkTWNwQXV0aFNlcnZlcnMuZGVsZXRlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdFx0Y29uc3QgY2hhdFVSSSA9IHRoaXMuX2NoYXRVUklzQnlTZXNzaW9uUmVzb3VyY2UuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdFx0dGhpcy5fY2hhdFVSSXNCeVNlc3Npb25SZXNvdXJjZS5kZWxldGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0XHRpZiAoY2hhdFVSSSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fcmVsZWFzZUNoYXRTZXNzaW9uU3Vic2NyaXB0aW9ucyhyZXNvbHZlZFNlc3Npb24udG9TdHJpbmcoKSwgY2hhdFVSSSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgc2Vzc2lvbktleSA9IHJlc29sdmVkU2Vzc2lvbi50b1N0cmluZygpO1xuXHRcdFx0XHRcdGNvbnN0IGNoYXRVUkkgPSB0aGlzLl9jaGF0VVJJc0J5U2Vzc2lvblJlc291cmNlLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRcdGlmICghY2hhdFVSSSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHR1cm5JZCA9IHRoaXMuX2dldFNlc3Npb25TdGF0ZShzZXNzaW9uS2V5LCBjaGF0VVJJKT8uYWN0aXZlVHVybj8uaWQ7XG5cdFx0XHRcdFx0aWYgKCF0dXJuSWQpIHtcblx0XHRcdFx0XHRcdC8vIE5vIGFjdGl2ZSB0dXJuIChsaWtlbHkgYSByYWNlIHdpdGggY29tcGxldGlvbikuIE5vb3Atc3VjY2Vzcy5cblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtBZ2VudEhvc3RdIENhbmNlbGxhdGlvbiByZXF1ZXN0ZWQgZm9yICR7c2Vzc2lvbktleX0sIGRpc3BhdGNoaW5nIHR1cm5DYW5jZWxsZWRgKTtcblx0XHRcdFx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbi5kaXNwYXRjaChjaGF0VVJJLCB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkLFxuXHRcdFx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRcdFx0ZHVyYXRpb246IHRoaXMuX3R1cm5EdXJhdGlvbihjaGF0VVJJLCB0dXJuSWQpLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGhpc3RvcnlTdWJhZ2VudE9ic2VydmF0aW9ucy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9kaXNwb3NlQWN0aXZlQ2xpZW50RW50cnkoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cdFx0dGhpcy5fYWN0aXZlU2Vzc2lvbnMuc2V0KHNlc3Npb25SZXNvdXJjZSwgc2Vzc2lvbik7XG5cdFx0dGhpcy5fY29uZmlndXJlQWN0aXZlQ2xpZW50UmVjb25jaWxpYXRpb24oc2Vzc2lvblJlc291cmNlLCByZXNvbHZlZFNlc3Npb24sIHNlc3Npb25TdWJzY3JpcHRpb24pO1xuXG5cdFx0aWYgKCFpc05ld1Nlc3Npb24pIHtcblx0XHRcdC8vIE9ubHkgd2lyZSB1cCBwZW5kaW5nLW1lc3NhZ2UvZHJhZnQgc3luYyBvbmNlIHRoZSBjaGF0IFVSSSBoYXMgYmVlblxuXHRcdFx0Ly8gcmVzb2x2ZWQuIFdoZW4gaHlkcmF0aW9uIGZhaWxlZCAoc2VlIHRoZSBjYXRjaCBhYm92ZSksIGBjaGF0VVJJYFxuXHRcdFx0Ly8gc3RheXMgdW5kZWZpbmVkOyBzdWJzY3JpYmluZyBhbnl3YXkgd291bGQgbGF0ZXIgaW52b2tlXG5cdFx0XHQvLyBgX3N5bmNQZW5kaW5nTWVzc2FnZXNgLCB3aG9zZSBgX2dldENoYXRVUklgIGxvb2t1cCB0aHJvd3MgYmVjYXVzZSBub1xuXHRcdFx0Ly8gbWFwcGluZyB3YXMgZXZlciBzdG9yZWQgZm9yIHRoaXMgc2Vzc2lvbiByZXNvdXJjZS5cblx0XHRcdGlmIChjaGF0VVJJICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fZW5zdXJlUGVuZGluZ01lc3NhZ2VTdWJzY3JpcHRpb24oc2Vzc2lvblJlc291cmNlLCByZXNvbHZlZFNlc3Npb24pO1xuXHRcdFx0XHR0aGlzLl9lbnN1cmVEcmFmdFN5bmNTdWJzY3JpcHRpb24oc2Vzc2lvblJlc291cmNlLCByZXNvbHZlZFNlc3Npb24sIGNoYXRVUkkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBFYWdlcmx5IGNyZWF0ZSB0aGUgc25hcHNob3QgY29udHJvbGxlciBvbmNlIHRoZSBDaGF0TW9kZWwgZm9yXG5cdFx0XHQvLyB0aGlzIHNlc3Npb24gaXMgYXZhaWxhYmxlIHNvIHRoYXQgXCJSZXN0b3JlIENoZWNrcG9pbnRcIiB3b3Jrc1xuXHRcdFx0Ly8gb24gaGlzdG9yaWNhbCB0dXJucy4gVGhlIG1vZGVsIG1heSBhbHJlYWR5IGV4aXN0IChpbiB3aGljaFxuXHRcdFx0Ly8gY2FzZSB3ZSBydW4gc3luY2hyb25vdXNseSkgb3IgaXQgbWF5IGJlIGNyZWF0ZWQgc2hvcnRseSBhZnRlclxuXHRcdFx0Ly8gdGhpcyBjb2RlIHJ1bnMgXHUyMDE0IHdlIGtlZXAgdGhlIGxpc3RlbmVyIGFsaXZlIHVudGlsIG91ciBzZXNzaW9uXG5cdFx0XHQvLyBtYXRjaGVzLCBzaW5jZSBgRXZlbnQub25jZWAgd291bGQgYmUgY29uc3VtZWQgYnkgYW4gdW5yZWxhdGVkXG5cdFx0XHQvLyBtb2RlbCBjcmVhdGVkIGZpcnN0LlxuXHRcdFx0aWYgKHRoaXMuX3BlbmRpbmdIaXN0b3J5VHVybnMuaGFzKHNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdFx0aWYgKHRoaXMuX2NoYXRTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHRcdHRoaXMuX2Vuc3VyZVNuYXBzaG90Q29udHJvbGxlcihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IHN1YiA9IHRoaXMuX2NoYXRTZXJ2aWNlLm9uRGlkQ3JlYXRlTW9kZWwobW9kZWwgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGlzRXF1YWwobW9kZWwuc2Vzc2lvblJlc291cmNlLCBzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2Vuc3VyZVNuYXBzaG90Q29udHJvbGxlcihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHNlc3Npb24ucmVnaXN0ZXJEaXNwb3NhYmxlKHN1Yik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgcmVjb25uZWN0aW5nIHRvIGFuIGFjdGl2ZSB0dXJuLCB3aXJlIHVwIGFuIG9uZ29pbmcgc3RhdGUgbGlzdGVuZXJcblx0XHRcdC8vIHRvIHN0cmVhbSBuZXcgcHJvZ3Jlc3MgaW50byB0aGUgc2Vzc2lvbidzIHByb2dyZXNzT2JzLlxuXHRcdFx0aWYgKGFjdGl2ZVR1cm5JZCAmJiBpbml0aWFsUHJvZ3Jlc3MgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9yZWNvbm5lY3RUb0FjdGl2ZVR1cm4ocmVzb2x2ZWRTZXNzaW9uLCBhY3RpdmVUdXJuSWQsIHNlc3Npb24sIGluaXRpYWxQcm9ncmVzcywgaW5pdGlhbFJlc3BvbnNlUGFydENvdW50KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRm9yIGV4aXN0aW5nIHNlc3Npb25zLCBzdGFydCB3YXRjaGluZyBmb3Igc2VydmVyLWluaXRpYXRlZCB0dXJuc1xuXHRcdFx0Ly8gaW1tZWRpYXRlbHkuIEZvciBuZXcgc2Vzc2lvbnMsIHRoaXMgaXMgZGVmZXJyZWQgdG8gX2NyZWF0ZUFuZFN1YnNjcmliZS5cblx0XHRcdGlmIChjaGF0VVJJICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fd2F0Y2hGb3JTZXJ2ZXJJbml0aWF0ZWRUdXJucyhyZXNvbHZlZFNlc3Npb24sIHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNlc3Npb247XG5cdH1cblxuXHQvLyAtLS0tIEFnZW50IHJlZ2lzdHJhdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJBZ2VudCgpOiB2b2lkIHtcblx0XHRjb25zdCBhZ2VudERhdGE6IElDaGF0QWdlbnREYXRhID0ge1xuXHRcdFx0aWQ6IHRoaXMuX2NvbmZpZy5hZ2VudElkLFxuXHRcdFx0bmFtZTogdGhpcy5fY29uZmlnLmFnZW50SWQsXG5cdFx0XHRmdWxsTmFtZTogdGhpcy5fY29uZmlnLmZ1bGxOYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IHRoaXMuX2NvbmZpZy5kZXNjcmlwdGlvbixcblx0XHRcdGV4dGVuc2lvbklkOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcih0aGlzLl9jb25maWcuZXh0ZW5zaW9uSWQgPz8gJ3ZzY29kZS5hZ2VudC1ob3N0JyksXG5cdFx0XHRleHRlbnNpb25WZXJzaW9uOiB1bmRlZmluZWQsXG5cdFx0XHRleHRlbnNpb25QdWJsaXNoZXJJZDogJ3ZzY29kZScsXG5cdFx0XHRleHRlbnNpb25EaXNwbGF5TmFtZTogdGhpcy5fY29uZmlnLmV4dGVuc2lvbkRpc3BsYXlOYW1lID8/ICdBZ2VudCBIb3N0Jyxcblx0XHRcdGlzRGVmYXVsdDogZmFsc2UsXG5cdFx0XHRpc0R5bmFtaWM6IHRydWUsXG5cdFx0XHRpc0NvcmU6IHRydWUsXG5cdFx0XHRtZXRhZGF0YTogeyB0aGVtZUljb246IGdldEFnZW50U2Vzc2lvblByb3ZpZGVySWNvbih0aGlzLl9jb25maWcuc2Vzc2lvblR5cGUpIH0sXG5cdFx0XHRzbGFzaENvbW1hbmRzOiBbXSxcblx0XHRcdGxvY2F0aW9uczogW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdLFxuXHRcdFx0bW9kZXM6IFtDaGF0TW9kZUtpbmQuQWdlbnRdLFxuXHRcdFx0ZGlzYW1iaWd1YXRpb246IFtdLFxuXHRcdH07XG5cblx0XHRjb25zdCBhZ2VudEltcGw6IElDaGF0QWdlbnRJbXBsZW1lbnRhdGlvbiA9IHtcblx0XHRcdGludm9rZTogYXN5bmMgKHJlcXVlc3QsIHByb2dyZXNzLCBfaGlzdG9yeSwgY2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2ludm9rZUFnZW50KHJlcXVlc3QsIHByb2dyZXNzLCBjYW5jZWxsYXRpb25Ub2tlbik7XG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyRHluYW1pY0FnZW50KGFnZW50RGF0YSwgYWdlbnRJbXBsKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pbnZva2VBZ2VudChcblx0XHRyZXF1ZXN0OiBJQ2hhdEFnZW50UmVxdWVzdCxcblx0XHRwcm9ncmVzczogKHBhcnRzOiBJQ2hhdFByb2dyZXNzW10pID0+IHZvaWQsXG5cdFx0Y2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuXHQpOiBQcm9taXNlPElDaGF0QWdlbnRSZXN1bHQ+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtBZ2VudEhvc3RdIF9pbnZva2VBZ2VudCBjYWxsZWQgZm9yIHJlc291cmNlOiAke3JlcXVlc3Quc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cblx0XHQvLyBHYXRlIHNwYXduaW5nIGFuIGFnZW50IG9uIHdvcmtzcGFjZSB0cnVzdC4gVmlld2luZyBjaGF0IGFuZCB0aGVcblx0XHQvLyBhZ2VudCBsaXN0IGRvZXMgbm90IHJlcXVpcmUgdHJ1c3QsIGJ1dCBzZW5kaW5nIGEgbWVzc2FnZSBkb2VzLCBzaW5jZVxuXHRcdC8vIHRoZSBhZ2VudCByZWFkcyBmaWxlcywgcnVucyBjb21tYW5kcywgYW5kIG1ha2VzIGNoYW5nZXMgaW4gdGhlXG5cdFx0Ly8gdGFyZ2V0IGZvbGRlci4gTWlycm9ycyBob3cgZXh0ZW5zaW9uLWhvc3QgY2hhdCBpcyBnYXRlZC4gSWYgdGhlIHVzZXJcblx0XHQvLyBkZWNsaW5lcywgYWJvcnQgd2l0aG91dCBzdGFydGluZyBhIHNlc3Npb24uXG5cdFx0aWYgKCFhd2FpdCB0aGlzLl9lbnN1cmVXb3Jrc3BhY2VUcnVzdChyZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cblx0XHQvLyBBIFwiQ29udGludWUgaW5cdTIwMjZcIiBtaWdyYXRpb24gZnJvbSBhIGxvY2FsIGNoYXQgc2VlZHMgdGhlIHdob2xlIGltcG9ydGVkXG5cdFx0Ly8gY29udmVyc2F0aW9uIGVhZ2VybHkgKENMSSBzcGF3biwgc2VlZGluZyB0dXJucykgYmVmb3JlIGFueSB0dXJuIHByb2dyZXNzXG5cdFx0Ly8gc3RyZWFtcywgbGVhdmluZyB0aGUgd2lkZ2V0IHRyYW5zaWVudGx5IGVtcHR5LiBPbmx5IGZvciB0aGF0IG1pZ3JhdGlvblxuXHRcdC8vIGNhc2Ugc2hvdyBhIHNoaW1tZXJpbmcgc3RhdHVzIGlmIHRoZSB0dXJuIGlzIHNsb3cgdG8gc3RhcnQsIGNhbmNlbGxlZCBhc1xuXHRcdC8vIHNvb24gYXMgcmVhbCBwcm9ncmVzcyBzdHJlYW1zLiBOb3JtYWwgYWdlbnQtaG9zdCBzZXNzaW9ucyBcdTIwMTQgd2hvc2UgZmlyc3Rcblx0XHQvLyB0dXJuIGlzIGFsc28gc2xvdyB0byBzcGF3biBcdTIwMTQgbmV2ZXIgZmxhc2ggaXQuXG5cdFx0Y29uc3QgcHJlcGFyaW5nU3RhdHVzID0gbmV3IE11dGFibGVEaXNwb3NhYmxlKCk7XG5cdFx0bGV0IGZhaWx1cmVTdGFnZTogQWdlbnRIb3N0SW52b2NhdGlvbkZhaWx1cmVTdGFnZSA9ICdyZXNvbHZlU2Vzc2lvbic7XG5cblx0XHR0cnkge1xuXHRcdFx0ZmFpbHVyZVN0YWdlID0gJ3Byb3Zpc2lvbmFsU2Vzc2lvbic7XG5cdFx0XHQvLyBUaGUgY2hhdC1pbnB1dCBwaWNrZXIgbWF5IGhhdmUgcHJlLWNyZWF0ZWQgYSBwcm92aXNpb25hbCBzZXNzaW9uXG5cdFx0XHQvLyBhZ2FpbnN0IHRoaXMgcmVzb3VyY2UgKGBJQWdlbnRIb3N0VW50aXRsZWRQcm92aXNpb25hbFNlc3Npb25TZXJ2aWNlLmdldE9yQ3JlYXRlYCkuXG5cdFx0XHQvLyBJbiB0aGF0IGNhc2UgdGhlIGFnZW50IGFscmVhZHkgaGFzIHRoZSBzZXNzaW9uICsgdGhlIHVzZXIncyBjaGlwXG5cdFx0XHQvLyBzZWxlY3Rpb25zIGluIGBzdGF0ZS5jb25maWcudmFsdWVzYDsgZW5zdXJlIHdlIGhvbGQgYSByZWZjb3VudGVkXG5cdFx0XHQvLyBzdWJzY3JpcHRpb24gb24gaXQgc28gdGhlIHJlc3Qgb2YgdGhlIGhhbmRsZXIgb2JzZXJ2ZXMgdGhvc2UuXG5cdFx0XHRhd2FpdCByYWNlQ2FuY2VsbGF0aW9uKHRoaXMuX3Byb3Zpc2lvbmFsU2VydmljZS53YWl0Rm9yUGVuZGluZyhyZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSksIGNhbmNlbGxhdGlvblRva2VuKTtcblx0XHRcdGlmIChjYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4ge307XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXNvbHZlZFNlc3Npb24gPSB0aGlzLl9yZXNvbHZlU2Vzc2lvblVyaShyZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uS2V5ID0gcmVzb2x2ZWRTZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBwcm92aXNpb25hbEJhY2tlbmQgPSB0aGlzLl9wcm92aXNpb25hbFNlcnZpY2UuZ2V0KHJlcXVlc3Quc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmIChwcm92aXNpb25hbEJhY2tlbmQpIHtcblx0XHRcdFx0dGhpcy5fZW5zdXJlU2Vzc2lvblN1YnNjcmlwdGlvbihzZXNzaW9uS2V5KTtcblx0XHRcdH1cblxuXHRcdFx0ZmFpbHVyZVN0YWdlID0gJ3Nlc3Npb25TdGF0ZSc7XG5cdFx0XHQvLyBUaGUgc2Vzc2lvbnMgcHJvdmlkZXIgbWF5IGhhdmUgZWFnZXJseSBjcmVhdGVkIHRoaXMgc2Vzc2lvbiBhdFxuXHRcdFx0Ly8gZm9sZGVyLXBpY2sgdGltZSBhbmQgaXMgaG9sZGluZyB0aGUgY29ubmVjdGlvbi1sZXZlbCBzdWJzY3JpcHRpb25cblx0XHRcdC8vIG9wZW4gd2l0aCBoeWRyYXRlZCBzdGF0ZS4gVXNlIHRoZSB1bm1hbmFnZWQgYWNjZXNzb3IgdG8gcGVla1xuXHRcdFx0Ly8gd2l0aG91dCB0YWtpbmcgYSBmcmVzaCBzdWJzY3JpcHRpb24sIHdoaWNoIHdvdWxkIHRyaWdnZXIgYVxuXHRcdFx0Ly8gZHVwbGljYXRlIHNuYXBzaG90IGZldGNoIGFuZCAoaW4gdGVzdHMpIHVucmVsYXRlZCBtb2NrIGJlaGF2aW91ci5cblx0XHRcdGNvbnN0IGV4aXN0aW5nU3RhdGUgPSBhd2FpdCB0aGlzLl9yZWFkRWFnZXJseUNyZWF0ZWRTZXNzaW9uU3RhdGUocmVzb2x2ZWRTZXNzaW9uLCBjYW5jZWxsYXRpb25Ub2tlbik7XG5cdFx0XHRpZiAoY2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHt9O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWV4aXN0aW5nU3RhdGUpIHtcblx0XHRcdFx0Ly8gRWFnZXItY3JlYXRlIGRpZCBub3QgcHJvZHVjZSBzZXJ2ZXItc2lkZSBzdGF0ZSAoZS5nLiBub1xuXHRcdFx0XHQvLyBzZXNzaW9ucyBwcm92aWRlciBpbnZvbHZlZCwgYWdlbnQgaG9zdCBub3QgY29ubmVjdGVkIGF0XG5cdFx0XHRcdC8vIGZvbGRlci1waWNrIHRpbWUsIG9yIHRoaXMgc2Vzc2lvbiB3YXMgY3JlYXRlZCB2aWEgYSBsZWdhY3kvXG5cdFx0XHRcdC8vIHRlc3QgcGF0aCkuIEZhbGwgYmFjayB0byB0aGUgb3JpZ2luYWwgY3JlYXRlLXRoZW4tc3Vic2NyaWJlXG5cdFx0XHRcdC8vIGZsb3cuXG5cdFx0XHRcdC8vXG5cdFx0XHRcdC8vIElmIGEgY29udmVyc2F0aW9uIHdhcyBpbXBvcnRlZCAoXCJDb250aW51ZSBpblx1MjAyNlwiKSBpbnRvIHRoaXNcblx0XHRcdFx0Ly8gc2Vzc2lvbiwgc2VlZCBpdCBhcyByZWFsIGVkaXRhYmxlIGhpc3RvcnkgYXQgY3JlYXRpb24gdGltZS5cblx0XHRcdFx0Y29uc3QgaW1wb3J0ZWQgPSB0aGlzLl9pbXBvcnRDb252ZXJzYXRpb25TdG9yZS50YWtlKHJlcXVlc3Quc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0aWYgKGltcG9ydGVkKSB7XG5cdFx0XHRcdFx0Ly8gTWlncmF0aW9uIGNhc2U6IG1hdGVyaWFsaXppbmcgdGhlIGltcG9ydGVkIGNvbnZlcnNhdGlvbiBpcyB0aGVcblx0XHRcdFx0XHQvLyBzbG93LCB2aXN1YWxseS1ibGFuayBwaGFzZSBcdTIwMTQgYXJtIHRoZSBcIlByZXBhcmluZyBzZXNzaW9uXHUyMDI2XCIgc3RhdHVzLlxuXHRcdFx0XHRcdHByZXBhcmluZ1N0YXR1cy52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRcdHByb2dyZXNzKFt7IGtpbmQ6ICdwcm9ncmVzc01lc3NhZ2UnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2FnZW50SG9zdC5wcmVwYXJpbmdTZXNzaW9uJywgXCJQcmVwYXJpbmcgc2Vzc2lvblx1MjAyNlwiKSksIHNoaW1tZXI6IHRydWUgfV0pO1xuXHRcdFx0XHRcdH0sIDUwMCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBpbXBvcnRlZD8ubW9kZWwgPz8gdGhpcy5fY3JlYXRlTW9kZWxTZWxlY3Rpb24ocmVxdWVzdC51c2VyU2VsZWN0ZWRNb2RlbElkLCByZXF1ZXN0Lm1vZGVsQ29uZmlndXJhdGlvbik7XG5cdFx0XHRcdGNvbnN0IGluaXRpYWxDb25maWcgPSB7XG5cdFx0XHRcdFx0Li4udGhpcy5fcHJvdmlzaW9uYWxTZXJ2aWNlLmdldEluaXRpYWxTZXNzaW9uQ29uZmlnKCksXG5cdFx0XHRcdFx0Li4ucmVxdWVzdC5hZ2VudEhvc3RTZXNzaW9uQ29uZmlnLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9jcmVhdGVBbmRTdWJzY3JpYmUoXG5cdFx0XHRcdFx0cmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0bW9kZWwsXG5cdFx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHRcdE9iamVjdC5rZXlzKGluaXRpYWxDb25maWcpLmxlbmd0aCA+IDAgPyBpbml0aWFsQ29uZmlnIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGltcG9ydGVkID8geyB0dXJuczogaW1wb3J0ZWQudHVybnMsIG1vZGVsOiBpbXBvcnRlZC5tb2RlbCB9IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHN0YWdlID0+IGZhaWx1cmVTdGFnZSA9IHN0YWdlLFxuXHRcdFx0XHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZmFpbHVyZVN0YWdlID0gJ2F1dGhlbnRpY2F0aW9uJztcblx0XHRcdFx0YXdhaXQgdGhpcy5fZW5zdXJlUmVxdWlyZWRBdXRoZW50aWNhdGlvbih0aGlzLl9jcmVhdGVNb2RlbFNlbGVjdGlvbihyZXF1ZXN0LnVzZXJTZWxlY3RlZE1vZGVsSWQsIHJlcXVlc3QubW9kZWxDb25maWd1cmF0aW9uKSk7XG5cblx0XHRcdFx0ZmFpbHVyZVN0YWdlID0gJ3N1YnNjcmliZVNlc3Npb24nO1xuXHRcdFx0XHQvLyBFYWdlci1jcmVhdGVkIHNlc3Npb246IHRha2UgYSByZWZjb3VudGVkIHN1YnNjcmlwdGlvbiBzbyB0aGVcblx0XHRcdFx0Ly8gaGFuZGxlciBvYnNlcnZlcyBzdGF0ZSBjaGFuZ2VzIGZvciB0aGUgZHVyYXRpb24gb2YgdGhlIGNoYXRcblx0XHRcdFx0Ly8gc2Vzc2lvbiwgdGhlbiB3aXJlIHVwIHRoZSBwZXItdHVybiBtYWNoaW5lcnkgdGhhdFxuXHRcdFx0XHQvLyBgX2NyZWF0ZUFuZFN1YnNjcmliZWAgd291bGQgbm9ybWFsbHkgc2V0IHVwLlxuXHRcdFx0XHRjb25zdCBzZXNzaW9uU3ViID0gdGhpcy5fZW5zdXJlU2Vzc2lvblN1YnNjcmlwdGlvbihzZXNzaW9uS2V5KTtcblx0XHRcdFx0Y29uc3QgY2hhdFVSSSA9IHRoaXMuX3Jlc29sdmVDaGF0VXJpRnJvbVN0YXRlKHJlcXVlc3Quc2Vzc2lvblJlc291cmNlLCBleGlzdGluZ1N0YXRlKTtcblx0XHRcdFx0dGhpcy5fc2V0Q2hhdFVSSShyZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSwgY2hhdFVSSSk7XG5cdFx0XHRcdGNvbnN0IGNoYXRTdWIgPSB0aGlzLl9lbnN1cmVDaGF0U3Vic2NyaXB0aW9uKHNlc3Npb25LZXksIGNoYXRVUkkpO1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVTZXNzaW9ucy5nZXQocmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UpPy5zZXRTdGF0ZVN1YnNjcmlwdGlvbnMoc2Vzc2lvblN1YiwgY2hhdFN1Yik7XG5cdFx0XHRcdHRoaXMuX2Vuc3VyZVBlbmRpbmdNZXNzYWdlU3Vic2NyaXB0aW9uKHJlcXVlc3Quc2Vzc2lvblJlc291cmNlLCByZXNvbHZlZFNlc3Npb24pO1xuXHRcdFx0XHR0aGlzLl93YXRjaEZvclNlcnZlckluaXRpYXRlZFR1cm5zKHJlc29sdmVkU2Vzc2lvbiwgcmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0XHRcdC8vIEluIHRoZSBBZ2VudHMgd2luZG93LCB0aGUgc2Vzc2lvbnMgcHJvdmlkZXIgc3VwcGxpZXMgcGVyLXJlcXVlc3Rcblx0XHRcdFx0Ly8gY29uZmlnIHZpYSBgcmVxdWVzdC5hZ2VudEhvc3RTZXNzaW9uQ29uZmlnYCAoZS5nLiB0aGUgdXNlcidzXG5cdFx0XHRcdC8vIHBlcm1pc3Npb24gbGV2ZWwpLiBQdXNoIGl0IHRvIHRoZSBhZ2VudCBzbyBpdHMgcHJvdmlzaW9uYWwgcmVjb3JkXG5cdFx0XHRcdC8vIG1hdGVyaWFsaXplcyB3aXRoIHRob3NlIHZhbHVlcy4gV29ya2JlbmNoIGRlZmF1bHRzIChgaXNvbGF0aW9uYCxcblx0XHRcdFx0Ly8gYGF1dG9BcHByb3ZlYCkgYXJlIHNlZWRlZCB1cHN0cmVhbSBhdCBwcm92aXNpb25hbCBgY3JlYXRlU2Vzc2lvbmBcblx0XHRcdFx0Ly8gdGltZSwgc28gd2UgZG9uJ3QgbmVlZCB0byBtZXJnZSB0aGVtIGhlcmUuIFBpY2tlciBzZWxlY3Rpb25zXG5cdFx0XHRcdC8vIGFscmVhZHkgbGl2ZSBpbiBgZXhpc3RpbmdTdGF0ZS5jb25maWc/LnZhbHVlc2AgYW5kIGRvbid0IG5lZWQgdG9cblx0XHRcdFx0Ly8gYmUgcmUtZGlzcGF0Y2hlZC5cblx0XHRcdFx0aWYgKHJlcXVlc3QuYWdlbnRIb3N0U2Vzc2lvbkNvbmZpZyAmJiBPYmplY3Qua2V5cyhyZXF1ZXN0LmFnZW50SG9zdFNlc3Npb25Db25maWcpLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHR0aGlzLl9kaXNwYXRjaEFjdGlvbihyZXNvbHZlZFNlc3Npb24sIHtcblx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkNvbmZpZ0NoYW5nZWQsXG5cdFx0XHRcdFx0XHRjb25maWc6IHJlcXVlc3QuYWdlbnRIb3N0U2Vzc2lvbkNvbmZpZyxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBNZWFzdXJlIHR1cm4gdGltaW5ncyBzbyB0aGUgY29yZSBgaW50ZXJhY3RpdmVTZXNzaW9uUHJvdmlkZXJJbnZva2VkYFxuXHRcdFx0Ly8gdGVsZW1ldHJ5IGV2ZW50IGlzIHBvcHVsYXRlZCBmb3IgYWdlbnQtaG9zdCBwcm92aWRlcnMuXG5cdFx0XHRjb25zdCBzdG9wV2F0Y2ggPSBTdG9wV2F0Y2guY3JlYXRlKGZhbHNlKTtcblx0XHRcdGxldCBmaXJzdFByb2dyZXNzOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBtZWFzdXJlZFByb2dyZXNzID0gKHBhcnRzOiBJQ2hhdFByb2dyZXNzW10pID0+IHtcblx0XHRcdFx0Ly8gUmVhbCBwcm9ncmVzcyBoYXMgc3RhcnRlZCBcdTIwMTQgY2FuY2VsIHRoZSBwZW5kaW5nIFwicHJlcGFyaW5nXCIgc3RhdHVzLlxuXHRcdFx0XHRwcmVwYXJpbmdTdGF0dXMuY2xlYXIoKTtcblx0XHRcdFx0aWYgKGZpcnN0UHJvZ3Jlc3MgPT09IHVuZGVmaW5lZCAmJiBwYXJ0cy5zb21lKGlzRmlyc3RWaXNpYmxlUHJvZ3Jlc3NQYXJ0KSkge1xuXHRcdFx0XHRcdGZpcnN0UHJvZ3Jlc3MgPSBzdG9wV2F0Y2guZWxhcHNlZCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHByb2dyZXNzKHBhcnRzKTtcblx0XHRcdH07XG5cblx0XHRcdGZhaWx1cmVTdGFnZSA9ICdwcmVwYXJlVHVybic7XG5cdFx0XHRjb25zdCBjb21wbGV0ZWRUdXJuID0gYXdhaXQgdGhpcy5faGFuZGxlVHVybihyZXNvbHZlZFNlc3Npb24sIHJlcXVlc3QsIG1lYXN1cmVkUHJvZ3Jlc3MsIGNhbmNlbGxhdGlvblRva2VuLCBzdGFnZSA9PiBmYWlsdXJlU3RhZ2UgPSBzdGFnZSk7XG5cdFx0XHRjb25zdCBkZXRhaWxzID0gdGhpcy5fZ2V0VHVyblJlc3BvbnNlRGV0YWlscyhyZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSwgcmVzb2x2ZWRTZXNzaW9uLCBjb21wbGV0ZWRUdXJuKTtcblx0XHRcdGNvbnN0IGVycm9yRGV0YWlscyA9IHRoaXMuX2dldFR1cm5FcnJvckRldGFpbHMoY29tcGxldGVkVHVybik7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHRpbWluZ3M6IHsgZmlyc3RQcm9ncmVzcywgdG90YWxFbGFwc2VkOiBzdG9wV2F0Y2guZWxhcHNlZCgpIH0sXG5cdFx0XHRcdC4uLihkZXRhaWxzID8geyBkZXRhaWxzIH0gOiB7fSksXG5cdFx0XHRcdC4uLihlcnJvckRldGFpbHMgPyB7IGVycm9yRGV0YWlscyB9IDoge30pLFxuXHRcdFx0fTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSkge1xuXHRcdFx0XHR0aGlzLl9yZXBvcnRJbnZvY2F0aW9uRmFpbHVyZShyZXF1ZXN0LCBmYWlsdXJlU3RhZ2UsIGVycm9yKTtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHQvLyBBbHdheXMgY2FuY2VsIHRoZSBwZW5kaW5nIFwicHJlcGFyaW5nXCIgc3RhdHVzIFx1MjAxNCBpbmNsdWRpbmcgd2hlbiBhblxuXHRcdFx0Ly8gYXdhaXQgYWJvdmUgKHN0YXRlIHJlYWQsIGNyZWF0ZS9zdWJzY3JpYmUsIHR1cm4gaGFuZGxpbmcpIHJlamVjdHMgXHUyMDE0XG5cdFx0XHQvLyBzbyBhIHN0YWxlIHN0YXR1cyBjYW4gbmV2ZXIgZmlyZSBhZnRlciB0aGUgaW52b2NhdGlvbiBoYXMgZW5kZWQuXG5cdFx0XHRwcmVwYXJpbmdTdGF0dXMuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlcG9ydEludm9jYXRpb25GYWlsdXJlKHJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0LCBmYWlsdXJlU3RhZ2U6IEFnZW50SG9zdEludm9jYXRpb25GYWlsdXJlU3RhZ2UsIGVycm9yOiB1bmtub3duKTogdm9pZCB7XG5cdFx0Y29uc3QgcGFja2VkID0gcGFja0Vycm9yRm9yVGVsZW1ldHJ5KGVycm9yKTtcblx0XHRjb25zdCByZXF1ZXN0cyA9IHRoaXMuX2NoYXRTZXJ2aWNlLmdldFNlc3Npb24ocmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UpPy5nZXRSZXF1ZXN0cygpO1xuXHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nRXJyb3IyPEFnZW50SG9zdEludm9jYXRpb25GYWlsZWRFdmVudCwgQWdlbnRIb3N0SW52b2NhdGlvbkZhaWxlZENsYXNzaWZpY2F0aW9uPignYWdlbnRIb3N0Lmludm9jYXRpb25GYWlsZWQnLCB7XG5cdFx0XHRyZXF1ZXN0SWQ6IHJlcXVlc3QucmVxdWVzdElkLFxuXHRcdFx0cHJvdmlkZXI6IHRoaXMuX2NvbmZpZy5wcm92aWRlcixcblx0XHRcdGZhaWx1cmVTdGFnZSxcblx0XHRcdGlzRmlyc3RSZXF1ZXN0OiByZXF1ZXN0cz8uWzBdPy5pZCA9PT0gcmVxdWVzdC5yZXF1ZXN0SWQsXG5cdFx0XHRoYXNVc2VyU2VsZWN0ZWRNb2RlbDogcmVxdWVzdC51c2VyU2VsZWN0ZWRNb2RlbElkICE9PSB1bmRlZmluZWQsXG5cdFx0XHRlcnJvck5hbWU6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5uYW1lIDogdHlwZW9mIGVycm9yLFxuXHRcdFx0ZXJyb3JDb2RlOiBnZXRFcnJvckNvZGUoZXJyb3IpLFxuXHRcdFx0bXNnOiBwYWNrZWQubXNnLFxuXHRcdFx0Y2FsbHN0YWNrOiBwYWNrZWQuY2FsbHN0YWNrLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJ1aWxkcyB0aGUge0BsaW5rIElDaGF0UmVzcG9uc2VFcnJvckRldGFpbHN9IGZvciBhIGZhaWxlZCB0dXJuIHNvIHRoZVxuXHQgKiBjaGF0IHJlc3BvbnNlIHJlbmRlcnMgYSBwcm9wZXIgZXJyb3IgKGFuZCwgZm9yIHF1b3RhIGVycm9ycywgdGhlIHVwZ3JhZGVcblx0ICogYWZmb3JkYW5jZSB2aWEgYENoYXRRdW90YUV4Y2VlZGVkUGFydGApLiBSZXR1cm5zIGB1bmRlZmluZWRgIGZvclxuXHQgKiBub24tZXJyb3IgdHVybnMuIEZhbGxzIGJhY2sgdG8gdGhlIHJhdyBlcnJvciB3aGVuIG5vIHN0cnVjdHVyZWQgY2hhdFxuXHQgKiBlcnJvciB3YXMgZm9yd2FyZGVkIGluIGBfbWV0YWAuXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRUdXJuRXJyb3JEZXRhaWxzKHR1cm46IFR1cm4gfCB1bmRlZmluZWQpOiBJQ2hhdFJlc3BvbnNlRXJyb3JEZXRhaWxzIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodHVybj8uc3RhdGUgIT09IFR1cm5TdGF0ZS5FcnJvciB8fCAhdHVybi5lcnJvcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIGdldENoYXRFcnJvckRldGFpbHNGcm9tTWV0YSh0dXJuLmVycm9yLCB0aGlzLl9jaGF0RXJyb3JDb250ZXh0KCkpXG5cdFx0XHQ/PyB7IG1lc3NhZ2U6IGxvY2FsaXplKCdhZ2VudEhvc3QudHVybkVycm9yJywgXCJFcnJvcjogKHswfSkgezF9XCIsIHR1cm4uZXJyb3IuZXJyb3JUeXBlLCB0dXJuLmVycm9yLm1lc3NhZ2UpIH07XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUge0BsaW5rIFNlc3Npb25TdGF0ZX0gZm9yIGEgc2Vzc2lvbiB0aGF0IHdhcyBlYWdlcmx5IGNyZWF0ZWRcblx0ICogYXQgZm9sZGVyLXBpY2sgdGltZSwgb3IgYHVuZGVmaW5lZGAgaWYgbm8gc3VjaCBzZXNzaW9uIGV4aXN0cy4gVXNlcyB0aGVcblx0ICogdW5tYW5hZ2VkIHN1YnNjcmlwdGlvbiBhY2Nlc3NvciBzbyB3ZSBkb24ndCBhY2NpZGVudGFsbHkgb3BlbiBhIGZyZXNoXG5cdCAqIHN1YnNjcmlwdGlvbiAod2hpY2ggd291bGQgaXNzdWUgYSBkdXBsaWNhdGUgc25hcHNob3QgZmV0Y2ggb24gdGhlIHdpcmUsXG5cdCAqIGFuZCBpbiB0ZXN0cyB3b3VsZCBzeW50aGVzaXNlIHBsYWNlaG9sZGVyIHN0YXRlIHZpYSB0aGUgbW9jaydzIGF1dG8tXG5cdCAqIGh5ZHJhdGlvbiBwYXRoKS5cblx0ICpcblx0ICogSWYgdGhlIGVhZ2VyIHN1YnNjcmlwdGlvbiBleGlzdHMgYnV0IGhhc24ndCByZWNlaXZlZCBpdHMgZmlyc3Qgc25hcHNob3Rcblx0ICogeWV0IChjcmVhdGlvbiBpbiBmbGlnaHQpLCB3YWl0cyBmb3IgaXQgdG8gaHlkcmF0ZSBvciBlcnJvciBiZWZvcmVcblx0ICogcmV0dXJuaW5nLiBUaGlzIGNsb3NlcyBhIHJhY2Ugd2hlcmUgdGhlIGNoYXQgcmVxdWVzdCBhcnJpdmVzIGJldHdlZW5cblx0ICogYGNyZWF0ZVNlc3Npb25gIHJlc29sdmluZyBhbmQgdGhlIHNuYXBzaG90IGxhbmRpbmcuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZWFkRWFnZXJseUNyZWF0ZWRTZXNzaW9uU3RhdGUocmVzb2x2ZWRTZXNzaW9uOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8U2Vzc2lvblN0YXRlIHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gSWYgdGhlIHNlc3Npb25zIHByb3ZpZGVyJ3MgZWFnZXIgYGNyZWF0ZVNlc3Npb25gIGlzIHN0aWxsIGluIGZsaWdodCwgd2FpdCBmb3IgaXQgc28gaXRzIElJRkUgaGFzIGEgY2hhbmNlIHRvXG5cdFx0Ly8gb3BlbiB0aGUgc3RhdGUgc3Vic2NyaXB0aW9uIGJlZm9yZSB3ZSBmYWxsIHRocm91Z2ggdG8gYSBkdXBsaWNhdGUgYF9jcmVhdGVBbmRTdWJzY3JpYmVgIGJlbG93LiBCb3RoIHdlIGFuZFxuXHRcdC8vIHRoZSBJSUZFIGF3YWl0IHRoZSBzYW1lIHByb21pc2Ugb2JqZWN0LCBzbyBtaWNyb3Rhc2sgRklGTyBydW5zIHRoZSBJSUZFJ3MgY29udGludWF0aW9uIGZpcnN0IChpdCByZWdpc3RlcmVkXG5cdFx0Ly8gYmFjayBpbiBgX3N0YXJ0TmV3U2Vzc2lvbkJhY2tlbmRgKSBcdTIwMTQgaXQgb3BlbnMgdGhlIHN1YnNjcmlwdGlvbiwgdGhlbiB3ZSBvYnNlcnZlIGl0IChpc3N1ZSAjMzE5NzY0KS5cblx0XHRjb25zdCBpbmZsaWdodCA9IHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uLmdldEluZmxpZ2h0U2Vzc2lvbkNyZWF0ZT8uKHJlc29sdmVkU2Vzc2lvbik7XG5cdFx0aWYgKGluZmxpZ2h0KSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBpbmZsaWdodDtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBTd2FsbG93IFx1MjAxNCBgZ2V0U3Vic2NyaXB0aW9uVW5tYW5hZ2VkYCByZXR1cm5zIHVuZGVmaW5lZCBmb3IgYSBmYWlsZWQgY3JlYXRlLCBtYXRjaGluZyBmYWxsLXRocm91Z2guXG5cdFx0XHR9XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBzdWIgPSB0aGlzLl9jb25maWcuY29ubmVjdGlvbi5nZXRTdWJzY3JpcHRpb25Vbm1hbmFnZWQoU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIHJlc29sdmVkU2Vzc2lvbik7XG5cdFx0aWYgKCFzdWIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChzdWIudmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHN1Yi52YWx1ZSBpbnN0YW5jZW9mIEVycm9yID8gdW5kZWZpbmVkIDogc3ViLnZhbHVlO1xuXHRcdH1cblxuXHRcdC8vIFNuYXBzaG90IGlzIGluIGZsaWdodC4gUGluIHRoZSBzdWJzY3JpcHRpb24gd2l0aCBhIGZyZXNoXG5cdFx0Ly8gcmVmY291bnQgZm9yIHRoZSBkdXJhdGlvbiBvZiB0aGUgYXdhaXQgc28gdGhlIGVhZ2VyIGhvbGRlclxuXHRcdC8vIHJlbGVhc2luZyBjb25jdXJyZW50bHkgY2FuJ3QgdGVhciBkb3duIHRoZSB1bmRlcmx5aW5nIGVtaXR0ZXJcblx0XHQvLyAod2hpY2ggd291bGQgbGVhdmUgYG9uRGlkQ2hhbmdlYCBzaWxlbnQgYW5kIGhhbmcgdGhlIGF3YWl0KS5cblx0XHRjb25zdCBwaW5SZWYgPSB0aGlzLl9jb25maWcuY29ubmVjdGlvbi5nZXRTdWJzY3JpcHRpb24oU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIHJlc29sdmVkU2Vzc2lvbiwgJ0FnZW50SG9zdFNlc3Npb25IYW5kbGVyJyk7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIFNldHRsZSBvbiBzbmFwc2hvdCwgZXJyb3IsIG9yIGNhbmNlbGxhdGlvbi4gTGlzdGVuaW5nIGZvciB0aGVcblx0XHRcdC8vIGVycm9yIHRyYW5zaXRpb24gaXMgZXNzZW50aWFsOiBhIGZhaWxlZCBzdWJzY3JpYmUgZmxpcHMgdGhlXG5cdFx0XHQvLyBzdWJzY3JpcHRpb24gdmlhIGBzZXRFcnJvcmAsIHdoaWNoIGZpcmVzIGBvbkRpZEVycm9yYCBidXQgTk9UXG5cdFx0XHQvLyBgb25EaWRDaGFuZ2VgLCBzbyBhbiBgb25EaWRDaGFuZ2VgLW9ubHkgd2FpdCB3b3VsZCBoYW5nIGZvciB0aGVcblx0XHRcdC8vIGZ1bGwgdHVybiB0aW1lb3V0IChpc3N1ZSAjNTI0MikuXG5cdFx0XHRhd2FpdCB0aGlzLl93aGVuU3Vic2NyaXB0aW9uSHlkcmF0ZWQocGluUmVmLm9iamVjdCwgdG9rZW4pO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBwaW5SZWYub2JqZWN0LnZhbHVlO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRIb3N0XSBfcmVhZEVhZ2VybHlDcmVhdGVkU2Vzc2lvblN0YXRlOiBoeWRyYXRlZCB2YWx1ZT0ke3ZhbHVlID09PSB1bmRlZmluZWQgPyAndW5kZWZpbmVkJyA6IHZhbHVlIGluc3RhbmNlb2YgRXJyb3IgPyBgZXJyb3IoJHt2YWx1ZS5tZXNzYWdlfSlgIDogJ3N0YXRlJ30gY2FuY2VsbGVkPSR7dG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWR9IGZvciAke3Jlc29sdmVkU2Vzc2lvbi50b1N0cmluZygpfWApO1xuXHRcdFx0cmV0dXJuIHZhbHVlIGluc3RhbmNlb2YgRXJyb3IgPyB1bmRlZmluZWQgOiB2YWx1ZTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cGluUmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0tIFBlbmRpbmcgbWVzc2FnZSBzeW5jIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIERpZmZzIHRoZSBjaGF0IG1vZGVsJ3MgcGVuZGluZyByZXF1ZXN0cyBhZ2FpbnN0IHRoZSBwcm90b2NvbCBzdGF0ZSBpblxuXHQgKiBgX2NsaWVudFN0YXRlYCBhbmQgZGlzcGF0Y2hlcyBTZXQvUmVtb3ZlZC9SZW9yZGVyZWQgYWN0aW9ucyBhcyBuZWVkZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9zeW5jUGVuZGluZ01lc3NhZ2VzKHNlc3Npb25SZXNvdXJjZTogVVJJLCBiYWNrZW5kU2Vzc2lvbjogVVJJKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3JlbW90ZVBlbmRpbmdNZXNzYWdlUHJvamVjdGlvbnMuaGFzKHNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY2hhdE1vZGVsID0gdGhpcy5fY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghY2hhdE1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb24gPSBiYWNrZW5kU2Vzc2lvbi50b1N0cmluZygpO1xuXHRcdGNvbnN0IGNoYXRVUkkgPSB0aGlzLl9nZXRDaGF0VVJJKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgcGVuZGluZyA9IGNoYXRNb2RlbC5nZXRQZW5kaW5nUmVxdWVzdHMoKTtcblx0XHRjb25zdCBwcm90b2NvbFN0YXRlID0gdGhpcy5fZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24sIGNoYXRVUkkpO1xuXHRcdGNvbnN0IHByZXZTdGVlcmluZyA9IHByb3RvY29sU3RhdGU/LnN0ZWVyaW5nTWVzc2FnZTtcblx0XHRjb25zdCBwcmV2UXVldWVkID0gcHJvdG9jb2xTdGF0ZT8ucXVldWVkTWVzc2FnZXMgPz8gW107XG5cblx0XHQvLyBDb21wdXRlIGN1cnJlbnQgc3RhdGUgZnJvbSBjaGF0IG1vZGVsXG5cdFx0aW50ZXJmYWNlIElQZW5kaW5nU25hcHNob3QgeyBpZDogc3RyaW5nOyBtZXNzYWdlOiBNZXNzYWdlIH1cblx0XHRsZXQgY3VycmVudFN0ZWVyaW5nOiBJUGVuZGluZ1NuYXBzaG90IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGN1cnJlbnRRdWV1ZWQ6IElQZW5kaW5nU25hcHNob3RbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcCBvZiBwZW5kaW5nKSB7XG5cdFx0XHRjb25zdCB2YXJpYWJsZXMgPSBwLnJlcXVlc3QudmFyaWFibGVEYXRhPy52YXJpYWJsZXMgPz8gW107XG5cdFx0XHRjb25zdCBtZXNzYWdlQXR0YWNobWVudHMgPSB0aGlzLl92YXJpYWJsZUVudHJpZXNUb0F0dGFjaG1lbnRzKHZhcmlhYmxlcywgc2Vzc2lvblJlc291cmNlLCBwLnJlcXVlc3QubWVzc2FnZS50ZXh0KTtcblx0XHRcdGNvbnN0IGF0dGFjaG1lbnRzID0gbWVzc2FnZUF0dGFjaG1lbnRzLmxlbmd0aCA+IDAgPyBtZXNzYWdlQXR0YWNobWVudHMgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBzbmFwc2hvdDogSVBlbmRpbmdTbmFwc2hvdCA9IHsgaWQ6IHAucmVxdWVzdC5pZCwgbWVzc2FnZTogdXNlck9yaWdpbk1lc3NhZ2UocC5yZXF1ZXN0Lm1lc3NhZ2UudGV4dCwgYXR0YWNobWVudHMpIH07XG5cdFx0XHRpZiAocC5raW5kID09PSBDaGF0UmVxdWVzdFF1ZXVlS2luZC5TdGVlcmluZykge1xuXHRcdFx0XHRjdXJyZW50U3RlZXJpbmcgPSBzbmFwc2hvdDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGN1cnJlbnRRdWV1ZWQucHVzaChzbmFwc2hvdCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gLS0tIFN0ZWVyaW5nIC0tLVxuXHRcdGlmIChjdXJyZW50U3RlZXJpbmcpIHtcblx0XHRcdGlmIChjdXJyZW50U3RlZXJpbmcuaWQgIT09IHByZXZTdGVlcmluZz8uaWQgfHwgIWVxdWFscyhjdXJyZW50U3RlZXJpbmcubWVzc2FnZSwgcHJldlN0ZWVyaW5nLm1lc3NhZ2UpKSB7XG5cdFx0XHRcdHRoaXMuX2Rpc3BhdGNoQWN0aW9uKGJhY2tlbmRTZXNzaW9uLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VTZXQsXG5cdFx0XHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlN0ZWVyaW5nLFxuXHRcdFx0XHRcdGlkOiBjdXJyZW50U3RlZXJpbmcuaWQsXG5cdFx0XHRcdFx0bWVzc2FnZTogY3VycmVudFN0ZWVyaW5nLm1lc3NhZ2UsXG5cdFx0XHRcdH0sIGNoYXRVUkkpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAocHJldlN0ZWVyaW5nKSB7XG5cdFx0XHR0aGlzLl9kaXNwYXRjaEFjdGlvbihiYWNrZW5kU2Vzc2lvbiwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVJlbW92ZWQsXG5cdFx0XHRcdGtpbmQ6IFBlbmRpbmdNZXNzYWdlS2luZC5TdGVlcmluZyxcblx0XHRcdFx0aWQ6IHByZXZTdGVlcmluZy5pZCxcblx0XHRcdH0sIGNoYXRVUkkpO1xuXHRcdH1cblxuXHRcdC8vIC0tLSBRdWV1ZWQ6IHJlbW92YWxzIC0tLVxuXHRcdGNvbnN0IGN1cnJlbnRRdWV1ZWRJZHMgPSBuZXcgU2V0KGN1cnJlbnRRdWV1ZWQubWFwKHEgPT4gcS5pZCkpO1xuXHRcdGZvciAoY29uc3QgcHJldiBvZiBwcmV2UXVldWVkKSB7XG5cdFx0XHRpZiAoIWN1cnJlbnRRdWV1ZWRJZHMuaGFzKHByZXYuaWQpKSB7XG5cdFx0XHRcdHRoaXMuX2Rpc3BhdGNoQWN0aW9uKGJhY2tlbmRTZXNzaW9uLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VSZW1vdmVkLFxuXHRcdFx0XHRcdGtpbmQ6IFBlbmRpbmdNZXNzYWdlS2luZC5RdWV1ZWQsXG5cdFx0XHRcdFx0aWQ6IHByZXYuaWQsXG5cdFx0XHRcdH0sIGNoYXRVUkkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIC0tLSBRdWV1ZWQ6IGFkZGl0aW9ucyAtLS1cblx0XHRjb25zdCBwcmV2UXVldWVkQnlJZCA9IG5ldyBNYXAocHJldlF1ZXVlZC5tYXAocSA9PiBbcS5pZCwgcV0pKTtcblx0XHRmb3IgKGNvbnN0IHEgb2YgY3VycmVudFF1ZXVlZCkge1xuXHRcdFx0Y29uc3QgcHJldiA9IHByZXZRdWV1ZWRCeUlkLmdldChxLmlkKTtcblx0XHRcdGlmICghcHJldiB8fCAhZXF1YWxzKHEubWVzc2FnZSwgcHJldi5tZXNzYWdlKSkge1xuXHRcdFx0XHR0aGlzLl9kaXNwYXRjaEFjdGlvbihiYWNrZW5kU2Vzc2lvbiwge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFBlbmRpbmdNZXNzYWdlU2V0LFxuXHRcdFx0XHRcdGtpbmQ6IFBlbmRpbmdNZXNzYWdlS2luZC5RdWV1ZWQsXG5cdFx0XHRcdFx0aWQ6IHEuaWQsXG5cdFx0XHRcdFx0bWVzc2FnZTogcS5tZXNzYWdlLFxuXHRcdFx0XHR9LCBjaGF0VVJJKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyAtLS0gUXVldWVkOiByZW9yZGVyaW5nIC0tLVxuXHRcdC8vIEFmdGVyIGFkZGl0aW9ucy9yZW1vdmFscywgY2hlY2sgaWYgdGhlIHJlbWFpbmluZyBjb21tb24gaXRlbXMgY2hhbmdlZCBvcmRlci5cblx0XHQvLyBSZS1yZWFkIHByb3RvY29sIHN0YXRlIHNpbmNlIGRpc3BhdGNoZXMgYWJvdmUgbWF5IGhhdmUgbXV0YXRlZCBpdC5cblx0XHRjb25zdCB1cGRhdGVkUHJvdG9jb2wgPSB0aGlzLl9nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbiwgY2hhdFVSSSk7XG5cdFx0Y29uc3QgdXBkYXRlZFF1ZXVlZCA9IHVwZGF0ZWRQcm90b2NvbD8ucXVldWVkTWVzc2FnZXMgPz8gW107XG5cdFx0aWYgKHVwZGF0ZWRRdWV1ZWQubGVuZ3RoID4gMSAmJiBjdXJyZW50UXVldWVkLmxlbmd0aCA9PT0gdXBkYXRlZFF1ZXVlZC5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IG5lZWRzUmVvcmRlciA9IGN1cnJlbnRRdWV1ZWQuc29tZSgocSwgaSkgPT4gcS5pZCAhPT0gdXBkYXRlZFF1ZXVlZFtpXS5pZCk7XG5cdFx0XHRpZiAobmVlZHNSZW9yZGVyKSB7XG5cdFx0XHRcdHRoaXMuX2Rpc3BhdGNoQWN0aW9uKGJhY2tlbmRTZXNzaW9uLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UXVldWVkTWVzc2FnZXNSZW9yZGVyZWQsXG5cdFx0XHRcdFx0b3JkZXI6IGN1cnJlbnRRdWV1ZWQubWFwKHEgPT4gcS5pZCksXG5cdFx0XHRcdH0sIGNoYXRVUkkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBQcm9qZWN0cyBwcm90b2NvbCBwZW5kaW5nIG1lc3NhZ2VzIGludG8gdGhlIGNoYXQgbW9kZWwuXG5cdCAqIFRoZSBwcm90b2NvbCBpcyBhdXRob3JpdGF0aXZlLCBzbyBtYXRjaGluZyBsb2NhbCBzdGF0ZSBpcyBhIG5vLW9wLlxuXHQgKi9cblx0cHJpdmF0ZSBfYXBwbHlSZW1vdGVQZW5kaW5nTWVzc2FnZXMoc2Vzc2lvblJlc291cmNlOiBVUkksIGJhY2tlbmRTZXNzaW9uOiBVUkkpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NoYXRTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjaGF0VVJJID0gdGhpcy5fY2hhdFVSSXNCeVNlc3Npb25SZXNvdXJjZS5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIWNoYXRVUkkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9nZXRTZXNzaW9uU3RhdGUoYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSwgY2hhdFVSSSk7XG5cdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRvUmVtb3RlID0gKHBlbmRpbmc6IFBlbmRpbmdNZXNzYWdlLCBraW5kOiBDaGF0UmVxdWVzdFF1ZXVlS2luZCk6IElSZW1vdGVQZW5kaW5nUmVxdWVzdCA9PiAoe1xuXHRcdFx0aWQ6IHBlbmRpbmcuaWQsXG5cdFx0XHRraW5kLFxuXHRcdFx0bWVzc2FnZTogcGVuZGluZy5tZXNzYWdlLnRleHQsXG5cdFx0XHR2YXJpYWJsZURhdGE6IG1lc3NhZ2VUb1ZhcmlhYmxlRGF0YShwZW5kaW5nLm1lc3NhZ2UsIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5KSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlbW90ZTogSVJlbW90ZVBlbmRpbmdSZXF1ZXN0W10gPSBbXTtcblx0XHRpZiAoc3RhdGUuc3RlZXJpbmdNZXNzYWdlKSB7XG5cdFx0XHRyZW1vdGUucHVzaCh0b1JlbW90ZShzdGF0ZS5zdGVlcmluZ01lc3NhZ2UsIENoYXRSZXF1ZXN0UXVldWVLaW5kLlN0ZWVyaW5nKSk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgcXVldWVkIG9mIHN0YXRlLnF1ZXVlZE1lc3NhZ2VzID8/IFtdKSB7XG5cdFx0XHRyZW1vdGUucHVzaCh0b1JlbW90ZShxdWV1ZWQsIENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZCkpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlbW90ZVBlbmRpbmdNZXNzYWdlUHJvamVjdGlvbnMuYWRkKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMuX2NoYXRTZXJ2aWNlLnN5bmNQZW5kaW5nUmVxdWVzdHNGcm9tUmVtb3RlKHNlc3Npb25SZXNvdXJjZSwgcmVtb3RlKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fcmVtb3RlUGVuZGluZ01lc3NhZ2VQcm9qZWN0aW9ucy5kZWxldGUoc2Vzc2lvblJlc291cmNlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9kaXNwYXRjaEFjdGlvbihjaGFubmVsOiBVUkksIGFjdGlvbjogQ2xpZW50U2Vzc2lvbkFjdGlvbiB8IENsaWVudENoYXRBY3Rpb24sIGNoYXRVUkk/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCB0YXJnZXQgPSBpc0NoYXRBY3Rpb24oYWN0aW9uKVxuXHRcdFx0PyB0aGlzLl9yZXF1aXJlQ2hhdFVSSShjaGF0VVJJLCBhY3Rpb24udHlwZSlcblx0XHRcdDogY2hhbm5lbC50b1N0cmluZygpO1xuXHRcdHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uLmRpc3BhdGNoKHRhcmdldCwgYWN0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlcXVpcmVDaGF0VVJJKGNoYXRVUkk6IHN0cmluZyB8IHVuZGVmaW5lZCwgYWN0aW9uVHlwZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRpZiAoIWNoYXRVUkkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IGRpc3BhdGNoICR7YWN0aW9uVHlwZX0gd2l0aG91dCBhIHJlc29sdmVkIEFIUCBjaGF0IGNoYW5uZWxgKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNoYXRVUkk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlQ2hhdFVyaUZyb21TdGF0ZShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgc3RhdGU6IFNlc3Npb25TdGF0ZSk6IHN0cmluZyB7XG5cdFx0aWYgKHNlc3Npb25SZXNvdXJjZS5mcmFnbWVudCkge1xuXHRcdFx0Y29uc3QgZXhwbGljaXRDaGF0VXJpID0gbmV3IFVSTFNlYXJjaFBhcmFtcyhzZXNzaW9uUmVzb3VyY2UucXVlcnkpLmdldChDSEFUX1NVQkFHRU5UX1JFU09VUkNFX1FVRVJZX1BBUkFNKTtcblx0XHRcdGlmIChleHBsaWNpdENoYXRVcmkpIHtcblx0XHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDaGF0VXJpKGV4cGxpY2l0Q2hhdFVyaSk7XG5cdFx0XHRcdGlmICghcGFyc2VkIHx8IHBhcnNlZC5jaGF0SWQgIT09IHNlc3Npb25SZXNvdXJjZS5mcmFnbWVudCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgU3ViYWdlbnQgY2hhdCBVUkkgZG9lcyBub3QgbWF0Y2ggZWRpdG9yIGNoYXQgJyR7c2Vzc2lvblJlc291cmNlLmZyYWdtZW50fSdgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBvd25pbmdTZXNzaW9uID0gVVJJLnBhcnNlKHBhcnNlZC5zZXNzaW9uKTtcblx0XHRcdFx0Y29uc3QgZXhwZWN0ZWRTZXNzaW9uID0gdGhpcy5fcmVzb2x2ZVNlc3Npb25Vcmkoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0aWYgKCFpc0VxdWFsKG93bmluZ1Nlc3Npb24sIGV4cGVjdGVkU2Vzc2lvbikpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFN1YmFnZW50IGNoYXQgYmVsb25ncyB0byAke293bmluZ1Nlc3Npb24udG9TdHJpbmcoKX0sIGV4cGVjdGVkICR7ZXhwZWN0ZWRTZXNzaW9uLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGV4cGxpY2l0Q2hhdFVyaTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1hdGNoID0gc3RhdGUuY2hhdHMuZmluZChzdW1tYXJ5ID0+IHBhcnNlQ2hhdFVyaShzdW1tYXJ5LnJlc291cmNlKT8uY2hhdElkID09PSBzZXNzaW9uUmVzb3VyY2UuZnJhZ21lbnQpO1xuXHRcdFx0aWYgKCFtYXRjaCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCByZXNvbHZlIGNoYXQgJyR7c2Vzc2lvblJlc291cmNlLmZyYWdtZW50fScgZnJvbSBzZXNzaW9uIHN0YXRlIGZvciAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG1hdGNoLnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0fVxuXHRcdGlmICghc3RhdGUuZGVmYXVsdENoYXQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfSBoYXMgbm8gZGVmYXVsdCBjaGF0YCk7XG5cdFx0fVxuXHRcdHJldHVybiBzdGF0ZS5kZWZhdWx0Q2hhdC50b1N0cmluZygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Q2hhdFVSSShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgY2hhdFVSSTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fY2hhdFVSSXNCeVNlc3Npb25SZXNvdXJjZS5zZXQoc2Vzc2lvblJlc291cmNlLCBjaGF0VVJJKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldENoYXRVUkkoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGNoYXRVUkkgPSB0aGlzLl9jaGF0VVJJc0J5U2Vzc2lvblJlc291cmNlLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghY2hhdFVSSSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBBSFAgY2hhdCBVUkkgbWFwcGVkIGZvciAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gY2hhdFVSSTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEN1cnJlbnRBY3RpdmVDbGllbnQoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBTZXNzaW9uQWN0aXZlQ2xpZW50IHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2FjdGl2ZUNsaWVudEVudHJpZXMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRyZXR1cm4gZW50cnkuZ2V0QWN0aXZlQ2xpZW50KCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGNsaWVudElkOiB0aGlzLl9jb25maWcuY29ubmVjdGlvbi5jbGllbnRJZCxcblx0XHRcdHRvb2xzOiBbXSxcblx0XHRcdGN1c3RvbWl6YXRpb25zOiBbXSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlQWN0aXZlQ2xpZW50KHNlc3Npb25SZXNvdXJjZTogVVJJLCBiYWNrZW5kU2Vzc2lvbjogVVJJKTogQWN0aXZlQ2xpZW50RW50cnkgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fZW5zdXJlQWN0aXZlQ2xpZW50RW50cnkoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRlbnRyeS5jbGFpbShiYWNrZW5kU2Vzc2lvbik7XG5cdFx0cmV0dXJuIGVudHJ5O1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlQWN0aXZlQ2xpZW50RW50cnkoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBBY3RpdmVDbGllbnRFbnRyeSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9hY3RpdmVDbGllbnRFbnRyaWVzLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNjb3BlID0gdGhpcy5fYWN0aXZlQ2xpZW50U2VydmljZS5hY3F1aXJlU2NvcGUodGhpcy5fY29uZmlnLnNlc3Npb25UeXBlLCB0aGlzLl9yZXNvbHZlQ3VzdG9taXphdGlvblNjb3BlUm9vdHMoc2Vzc2lvblJlc291cmNlKSk7XG5cdFx0aWYgKCFzY29wZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBlbnRyeSA9IG5ldyBBY3RpdmVDbGllbnRFbnRyeShcblx0XHRcdHNjb3BlLFxuXHRcdFx0dGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uY2xpZW50SWQsXG5cdFx0XHRBZ2VudEhvc3RTZXNzaW9uSGFuZGxlci5BQ1RJVkVfQ0xJRU5UX1JFQ09OQ0lMSUFUSU9OX0RFQk9VTkNFX01TLFxuXHRcdFx0YmFja2VuZFNlc3Npb24gPT4gdGhpcy5fZ2V0U2Vzc2lvblN0YXRlKGJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCkpLFxuXHRcdFx0KGJhY2tlbmRTZXNzaW9uLCBhY3Rpb24pID0+IHRoaXMuX2Rpc3BhdGNoQWN0aW9uKGJhY2tlbmRTZXNzaW9uLCBhY3Rpb24pLFxuXHRcdCk7XG5cdFx0dGhpcy5fYWN0aXZlQ2xpZW50RW50cmllcy5zZXQoc2Vzc2lvblJlc291cmNlLCBlbnRyeSk7XG5cdFx0cmV0dXJuIGVudHJ5O1xuXHR9XG5cblx0cHJpdmF0ZSBfY29uZmlndXJlQWN0aXZlQ2xpZW50UmVjb25jaWxpYXRpb24oc2Vzc2lvblJlc291cmNlOiBVUkksIGJhY2tlbmRTZXNzaW9uOiBVUkksIHNlc3Npb25TdWJzY3JpcHRpb246IElBZ2VudFN1YnNjcmlwdGlvbjxTZXNzaW9uU3RhdGU+IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9lbnN1cmVBY3RpdmVDbGllbnRFbnRyeShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0ZW50cnkuYXR0YWNoKGJhY2tlbmRTZXNzaW9uLCBzZXNzaW9uU3Vic2NyaXB0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc3Bvc2VBY3RpdmVDbGllbnRFbnRyeShzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fYWN0aXZlQ2xpZW50RW50cmllcy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoZW50cnkpIHtcblx0XHRcdHRoaXMuX2FjdGl2ZUNsaWVudEVudHJpZXMuZGVsZXRlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRlbnRyeS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tLSBTZXJ2ZXItaW5pdGlhdGVkIHR1cm4gZGV0ZWN0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBTZXRzIHVwIGEgcGVyc2lzdGVudCBsaXN0ZW5lciBvbiB0aGUgc2Vzc2lvbidzIHByb3RvY29sIHN0YXRlIHRoYXRcblx0ICogZGV0ZWN0cyBzZXJ2ZXItaW5pdGlhdGVkIHR1cm5zIChlLmcuIGF1dG8tY29uc3VtZWQgcXVldWVkIG1lc3NhZ2VzKS5cblx0ICogV2hlbiBhIG5ldyBgYWN0aXZlVHVybmAgYXBwZWFycyB3aG9zZSBgdHVybklkYCB3YXMgTk9UIGRpc3BhdGNoZWQgYnlcblx0ICogdGhpcyBjbGllbnQsIGl0IHNpZ25hbHMgdGhlIHtAbGluayBBZ2VudEhvc3RDaGF0U2Vzc2lvbn0gdG8gY3JlYXRlIGFcblx0ICogbmV3IHJlcXVlc3QgaW4gdGhlIGNoYXQgbW9kZWwsIHJlbW92ZXMgdGhlIGNvbnN1bWVkIHBlbmRpbmcgcmVxdWVzdFxuXHQgKiBpZiBhcHBsaWNhYmxlLCBhbmQgcGlwZXMgdHVybiBwcm9ncmVzcyB0aHJvdWdoIGBwcm9ncmVzc09ic2AuXG5cdCAqL1xuXHRwcml2YXRlIF93YXRjaEZvclNlcnZlckluaXRpYXRlZFR1cm5zKGJhY2tlbmRTZXNzaW9uOiBVUkksIHNlc3Npb25SZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvblN0ciA9IGJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgY2hhdFVSSSA9IHRoaXMuX2dldENoYXRVUkkoc2Vzc2lvblJlc291cmNlKTtcblx0XHR0aGlzLl93YXRjaEZvck1jcEF1dGhlbnRpY2F0aW9uKGJhY2tlbmRTZXNzaW9uLCBzZXNzaW9uUmVzb3VyY2UsIGNoYXRVUkkpO1xuXHRcdHRoaXMuX3dhdGNoRm9yU2Vzc2lvbklucHV0TmVlZGVkKGJhY2tlbmRTZXNzaW9uLCBzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0Ly8gU2VlZCBmcm9tIHRoZSBjdXJyZW50IHN0YXRlIHNvIHdlIGRvbid0IHRyZWF0IGFueSBwcmUtZXhpc3RpbmcgYWN0aXZlXG5cdFx0Ly8gdHVybiAoZS5nLiBvbmUgYmVpbmcgaGFuZGxlZCBieSBfcmVjb25uZWN0VG9BY3RpdmVUdXJuKSBhcyBuZXcuXG5cdFx0Y29uc3QgY3VycmVudFN0YXRlID0gdGhpcy5fZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25TdHIsIGNoYXRVUkkpO1xuXHRcdGxldCBsYXN0U2VlblR1cm5JZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gY3VycmVudFN0YXRlPy5hY3RpdmVUdXJuPy5pZDtcblx0XHRsZXQgcHJldmlvdXNRdWV1ZWRJZHM6IFNldDxzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXHRcdGxldCBwcmV2aW91c1N0ZWVyaW5nSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IGN1cnJlbnRTdGF0ZT8uc3RlZXJpbmdNZXNzYWdlPy5pZDtcblx0XHRsZXQgcHJldmlvdXNUaXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gY3VycmVudFN0YXRlPy50aXRsZTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Ly8gTXV0YWJsZURpc3Bvc2FibGUgZm9yIHBlci10dXJuIHByb2dyZXNzIHRyYWNraW5nIChyZXBsYWNlZCBlYWNoIHR1cm4pXG5cdFx0Y29uc3QgdHVyblByb2dyZXNzRGlzcG9zYWJsZSA9IG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxEaXNwb3NhYmxlU3RvcmU+KCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHR1cm5Qcm9ncmVzc0Rpc3Bvc2FibGUpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblN1YiA9IHRoaXMuX2Vuc3VyZVNlc3Npb25TdWJzY3JpcHRpb24oc2Vzc2lvblN0cik7XG5cdFx0Y29uc3QgY2hhdFN1YiA9IHRoaXMuX2Vuc3VyZUNoYXRTdWJzY3JpcHRpb24oc2Vzc2lvblN0ciwgY2hhdFVSSSk7XG5cdFx0Ly8gQ29udmVyc2F0aW9uIGNvbnRlbnRzIG5vdyBsaXZlIG9uIHRoZSBkZWZhdWx0IGNoYXQsIHdoaWxlIHRpdGxlIGFuZFxuXHRcdC8vIG90aGVyIHNlc3Npb24tc2NvcGVkIGZpZWxkcyBzdGF5IG9uIHRoZSBzZXNzaW9uLiBSZS1ldmFsdWF0ZSBvbiBhXG5cdFx0Ly8gY2hhbmdlIHRvIGVpdGhlciBjaGFubmVsLCByZWFkaW5nIHRoZSBtZXJnZWQgdmlldy5cblx0XHRjb25zdCBvbkNoYW5nZSA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25TdHIsIGNoYXRVUkkpO1xuXHRcdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlID0geyBzZXNzaW9uOiBzZXNzaW9uU3RyLCBzdGF0ZSB9O1xuXG5cdFx0XHQvLyBUcmFjayBxdWV1ZWQgbWVzc2FnZSBJRHMgc28gd2UgY2FuIGRldGVjdCB3aGljaCBvbmUgd2FzIGNvbnN1bWVkXG5cdFx0XHRjb25zdCBjdXJyZW50UXVldWVkSWRzID0gbmV3IFNldCgoZS5zdGF0ZS5xdWV1ZWRNZXNzYWdlcyA/PyBbXSkubWFwKG0gPT4gbS5pZCkpO1xuXHRcdFx0Y29uc3QgY3VycmVudFN0ZWVyaW5nSWQgPSBlLnN0YXRlLnN0ZWVyaW5nTWVzc2FnZT8uaWQ7XG5cblx0XHRcdC8vIERldGVjdCBzdGVlcmluZyBtZXNzYWdlIHJlbW92YWwgb3IgcmVwbGFjZW1lbnQgcmVnYXJkbGVzcyBvZiB0dXJuIGNoYW5nZXNcblx0XHRcdGlmIChwcmV2aW91c1N0ZWVyaW5nSWQgJiYgcHJldmlvdXNTdGVlcmluZ0lkICE9PSBjdXJyZW50U3RlZXJpbmdJZCkge1xuXHRcdFx0XHR0aGlzLl9jaGF0U2VydmljZS5yZW1vdmVQZW5kaW5nUmVxdWVzdChzZXNzaW9uUmVzb3VyY2UsIHByZXZpb3VzU3RlZXJpbmdJZCk7XG5cdFx0XHR9XG5cdFx0XHRwcmV2aW91c1N0ZWVyaW5nSWQgPSBjdXJyZW50U3RlZXJpbmdJZDtcblxuXHRcdFx0Y29uc3QgY3VycmVudFRpdGxlID0gZS5zdGF0ZS50aXRsZTtcblx0XHRcdGlmIChjdXJyZW50VGl0bGUgJiYgY3VycmVudFRpdGxlICE9PSBwcmV2aW91c1RpdGxlKSB7XG5cdFx0XHRcdHRoaXMuX2NoYXRTZXJ2aWNlLnNldENoYXRTZXNzaW9uVGl0bGUoc2Vzc2lvblJlc291cmNlLCBjdXJyZW50VGl0bGUpO1xuXHRcdFx0fVxuXHRcdFx0cHJldmlvdXNUaXRsZSA9IGN1cnJlbnRUaXRsZTtcblxuXHRcdFx0Y29uc3QgYWN0aXZlVHVybiA9IGUuc3RhdGUuYWN0aXZlVHVybjtcblx0XHRcdGlmICghYWN0aXZlVHVybiB8fCBhY3RpdmVUdXJuLmlkID09PSBsYXN0U2VlblR1cm5JZCkge1xuXHRcdFx0XHRwcmV2aW91c1F1ZXVlZElkcyA9IGN1cnJlbnRRdWV1ZWRJZHM7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGxhc3RTZWVuVHVybklkID0gYWN0aXZlVHVybi5pZDtcblxuXHRcdFx0Ly8gSWYgd2UgZGlzcGF0Y2hlZCB0aGlzIHR1cm4sIHRoZSBleGlzdGluZyBfaGFuZGxlVHVybiBmbG93IGhhbmRsZXMgaXRcblx0XHRcdGlmICh0aGlzLl9jbGllbnREaXNwYXRjaGVkVHVybklkcy5oYXMoYWN0aXZlVHVybi5pZCkpIHtcblx0XHRcdFx0cHJldmlvdXNRdWV1ZWRJZHMgPSBjdXJyZW50UXVldWVkSWRzO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNoYXRTZXNzaW9uID0gdGhpcy5fYWN0aXZlU2Vzc2lvbnMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoIWNoYXRTZXNzaW9uKSB7XG5cdFx0XHRcdHByZXZpb3VzUXVldWVkSWRzID0gY3VycmVudFF1ZXVlZElkcztcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtBZ2VudEhvc3RdIFNlcnZlci1pbml0aWF0ZWQgdHVybiBkZXRlY3RlZDogJHthY3RpdmVUdXJuLmlkfWApO1xuXG5cdFx0XHQvLyBEZXRlcm1pbmUgd2hpY2ggcXVldWVkIG1lc3NhZ2Ugd2FzIGNvbnN1bWVkIGJ5IGRpZmZpbmcgcXVldWUgc3RhdGVcblx0XHRcdGlmIChwcmV2aW91c1F1ZXVlZElkcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHByZXZJZCBvZiBwcmV2aW91c1F1ZXVlZElkcykge1xuXHRcdFx0XHRcdGlmICghY3VycmVudFF1ZXVlZElkcy5oYXMocHJldklkKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fY2hhdFNlcnZpY2UucmVtb3ZlUGVuZGluZ1JlcXVlc3Qoc2Vzc2lvblJlc291cmNlLCBwcmV2SWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cHJldmlvdXNRdWV1ZWRJZHMgPSBjdXJyZW50UXVldWVkSWRzO1xuXG5cdFx0XHQvLyBTaWduYWwgdGhlIHNlc3Npb24gdG8gY3JlYXRlIGEgbmV3IHJlcXVlc3QrcmVzcG9uc2UgcGFpclxuXHRcdFx0Y2hhdFNlc3Npb24uc3RhcnRTZXJ2ZXJSZXF1ZXN0KFxuXHRcdFx0XHRhY3RpdmVUdXJuLmlkLFxuXHRcdFx0XHRhY3RpdmVUdXJuLm1lc3NhZ2UudGV4dCxcblx0XHRcdFx0bWVzc2FnZVRvVmFyaWFibGVEYXRhKGFjdGl2ZVR1cm4ubWVzc2FnZSwgdGhpcy5fY29uZmlnLmNvbm5lY3Rpb25BdXRob3JpdHkpLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aXNTeXN0ZW1Jbml0aWF0ZWQ6IGFjdGl2ZVR1cm4ubWVzc2FnZS5vcmlnaW4ua2luZCA9PT0gTWVzc2FnZUtpbmQuU3lzdGVtTm90aWZpY2F0aW9uLFxuXHRcdFx0XHRcdGlzSGlkZGVuOiBpc01lc3NhZ2VIaWRkZW5Gcm9tVHJhbnNjcmlwdChhY3RpdmVUdXJuLm1lc3NhZ2UpLFxuXHRcdFx0XHRcdHRpbWVzdGFtcDogcGFyc2VUaW1lc3RhbXAoYWN0aXZlVHVybi5zdGFydGVkQXQpLFxuXHRcdFx0XHRcdGlzVGVybWluYWxSZXF1ZXN0OiBpc1Rlcm1pbmFsQ29tbWFuZFByb21wdChhY3RpdmVUdXJuLm1lc3NhZ2UudGV4dCwgdGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uaW5pdGlhbGl6ZVJlc3VsdC5nZXQoKT8udGVybWluYWxDb21tYW5kUHJlZml4KSxcblx0XHRcdFx0XHRvcmlnaW46IG1lc3NhZ2VUb1JlcXVlc3RPcmlnaW4oYmFja2VuZFNlc3Npb24sIGFjdGl2ZVR1cm4ubWVzc2FnZSwgdGhpcy5fY29uZmlnLmFnZW50SWQpLFxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gU2V0IHVwIHR1cm4gcHJvZ3Jlc3MgdHJhY2tpbmcgXHUyMDE0IHJldXNlIHRoZSBzYW1lIHN0YXRlLXRvLXByb2dyZXNzXG5cdFx0XHQvLyB0cmFuc2xhdGlvbiBhcyBfaGFuZGxlVHVybiwgYnV0IHBpcGUgb3V0cHV0IHRvIHByb2dyZXNzT2JzL2lzQ29tcGxldGVPYnNcblx0XHRcdGNvbnN0IHR1cm5TdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdHR1cm5Qcm9ncmVzc0Rpc3Bvc2FibGUudmFsdWUgPSB0dXJuU3RvcmU7XG5cdFx0XHR0aGlzLl90cmFja1NlcnZlclR1cm5Qcm9ncmVzcyhiYWNrZW5kU2Vzc2lvbiwgYWN0aXZlVHVybi5pZCwgY2hhdFNlc3Npb24sIHR1cm5TdG9yZSk7XG5cdFx0fTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2Vzc2lvblN1Yi5vbkRpZENoYW5nZShvbkNoYW5nZSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChjaGF0U3ViLm9uRGlkQ2hhbmdlKG9uQ2hhbmdlKSk7XG5cblx0XHR0aGlzLl9zZXJ2ZXJUdXJuV2F0Y2hlcnMuc2V0KHNlc3Npb25SZXNvdXJjZSwgZGlzcG9zYWJsZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfd2F0Y2hGb3JNY3BBdXRoZW50aWNhdGlvbihiYWNrZW5kU2Vzc2lvbjogVVJJLCBzZXNzaW9uUmVzb3VyY2U6IFVSSSwgY2hhdFVSSTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvblN1YiA9IHRoaXMuX2Vuc3VyZVNlc3Npb25TdWJzY3JpcHRpb24oYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0bGV0IHByZXZpb3VzU2VydmVyczogcmVhZG9ubHkgSUNoYXRNY3BBdXRoZW50aWNhdGlvblJlcXVpcmVkU2VydmVyW10gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcmVjb25jaWxlID0gKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmVycyA9IGdldE1jcEF1dGhlbnRpY2F0aW9uUmVxdWlyZWRTZXJ2ZXJzKHNlc3Npb25SZXNvdXJjZSwgdGhpcy5fZ2V0U2Vzc2lvblN0YXRlKGJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCksIGNoYXRVUkkpKTtcblx0XHRcdGlmIChlcXVhbHMocHJldmlvdXNTZXJ2ZXJzLCBzZXJ2ZXJzKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRwcmV2aW91c1NlcnZlcnMgPSBzZXJ2ZXJzO1xuXHRcdFx0dm9pZCB0aGlzLl9maWx0ZXJBdXRvR3JhbnRlZE1jcEF1dGhlbnRpY2F0aW9uKHNlc3Npb25SZXNvdXJjZSwgc2VydmVycyk7XG5cdFx0fTtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2Vzc2lvblN1Yi5vbkRpZENoYW5nZShyZWNvbmNpbGUpKTtcblx0XHRyZWNvbmNpbGUoKTtcblx0XHR0aGlzLl9tY3BBdXRoV2F0Y2hlcnMuc2V0KHNlc3Npb25SZXNvdXJjZSwgZGlzcG9zYWJsZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfd2F0Y2hGb3JTZXNzaW9uSW5wdXROZWVkZWQoYmFja2VuZFNlc3Npb246IFVSSSwgc2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHQvLyBSZWNvcmQgd2hpY2ggYmFja2VuZCBzZXNzaW9uIHRoaXMgcmVzb3VyY2UncyByZWZlcmVuY2UgYmVsb25ncyB0byBzb1xuXHRcdC8vIHRlYXJkb3duIGNhbiByZWxlYXNlIGl0IGV2ZW4gYWZ0ZXIgcHJvdmlzaW9uYWwgc3RhdGUgaXMgY2xlYXJlZC5cblx0XHR0aGlzLl9pbnB1dE5lZWRlZFdhdGNoZXJCYWNrZW5kcy5zZXQoc2Vzc2lvblJlc291cmNlLCBiYWNrZW5kU2Vzc2lvbik7XG5cblx0XHRjb25zdCBzZXNzaW9uS2V5ID0gYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKTtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2lucHV0TmVlZGVkV2F0Y2hlcnMuZ2V0KHNlc3Npb25LZXkpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0Ly8gU2libGluZyByZXNvdXJjZXMgYWdhaW5zdCB0aGUgc2FtZSBiYWNrZW5kIHNlc3Npb24gc2hhcmUgdGhlIG9uZVxuXHRcdFx0Ly8gd2F0Y2hlcjogb25seSBhZGQgYSByZWZlcmVuY2Ugc28gdGhlIHNpbmdsZSBzZXNzaW9uLWxldmVsIHF1ZXVlXG5cdFx0XHQvLyBpcyBub3QgaGFuZGxlZCBcdTIwMTQgYW5kIGNsaWVudCB0b29scyBub3QgZXhlY3V0ZWQgXHUyMDE0IG1vcmUgdGhhbiBvbmNlLlxuXHRcdFx0ZXhpc3RpbmcucmVmcy5hZGQoc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25TdWIgPSB0aGlzLl9lbnN1cmVTZXNzaW9uU3Vic2NyaXB0aW9uKHNlc3Npb25LZXkpO1xuXHRcdGNvbnN0IHN0YXRlID0gb2JzZXJ2YWJsZUZyb21TdWJzY3JpcHRpb24odGhpcywgc2Vzc2lvblN1Yik7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5faW5wdXROZWVkZWRXYXRjaGVycy5zZXQoc2Vzc2lvbktleSwgeyBzdG9yZSwgcmVmczogbmV3IFNldChbc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCldKSB9KTtcblxuXHRcdC8vIFJlcXVlc3RzIHRoYXQgd2Ugb3duIHNob3VsZCBiZSAnaW52b2tlZCcgd2hlbiBwZW5kaW5nIGNvbmZpcm1hdGlvbiBpbW1lZGlhdGVseSBiZWNhdXNlXG5cdFx0Ly8gd2UgaGFuZGxlIHNob3dpbmcgdGhlaXIgVUkgZGlyZWN0bHkuIEZvciBzaW1wbGljaXR5IGluIGxhdGVyIHRvb2wgY2FsbCBmbG93cywgcmV3cml0ZSB0aGVtLlxuXHRcdGNvbnN0IHJlcXVlc3RzID0gZGVyaXZlZE9wdHMoeyBlcXVhbHNGbjogZXF1YWxzIH0sIHJlYWRlciA9PlxuXHRcdFx0KHN0YXRlLnJlYWQocmVhZGVyKT8uaW5wdXROZWVkZWQgPz8gW10pLm1hcCgocmVxdWVzdCk6IFNlc3Npb25JbnB1dFJlcXVlc3QgPT4ge1xuXHRcdFx0XHRpZiAocmVxdWVzdC5raW5kID09PSBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZC5Ub29sQ29uZmlybWF0aW9uXG5cdFx0XHRcdFx0JiYgcmVxdWVzdC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb25cblx0XHRcdFx0XHQmJiByZXF1ZXN0LnRvb2xDYWxsLmNvbnRyaWJ1dG9yPy5raW5kID09PSBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Li4ucmVxdWVzdCxcblx0XHRcdFx0XHRcdGtpbmQ6IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xDbGllbnRFeGVjdXRpb24sXG5cdFx0XHRcdFx0XHRjbGllbnRJZDogcmVxdWVzdC50b29sQ2FsbC5jb250cmlidXRvci5jbGllbnRJZCxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiByZXF1ZXN0O1xuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0Y29uc3Qgc3RhcnRlZENsaWVudFRvb2xDYWxscyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IGNsaWVudFRvb2xFeGVjdXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIHsgcmVhZG9ubHkgc291cmNlOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZTsgcmVhZG9ubHkgcmV0YWluOiBJRGlzcG9zYWJsZTsgYWN0aXZlQXR0ZW1wdHM6IG51bWJlciB9PigpO1xuXHRcdGNvbnN0IHJlbGVhc2VDbGllbnRUb29sRXhlY3V0aW9uID0gKGtleTogc3RyaW5nLCBleGVjdXRpb246IHsgcmVhZG9ubHkgc291cmNlOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZTsgcmVhZG9ubHkgcmV0YWluOiBJRGlzcG9zYWJsZTsgYWN0aXZlQXR0ZW1wdHM6IG51bWJlciB9KSA9PiB7XG5cdFx0XHRpZiAoY2xpZW50VG9vbEV4ZWN1dGlvbnMuZ2V0KGtleSkgIT09IGV4ZWN1dGlvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjbGllbnRUb29sRXhlY3V0aW9ucy5kZWxldGUoa2V5KTtcblx0XHRcdGV4ZWN1dGlvbi5yZXRhaW4uZGlzcG9zZSgpO1xuXHRcdFx0aWYgKGV4ZWN1dGlvbi5hY3RpdmVBdHRlbXB0cyA9PT0gMCkge1xuXHRcdFx0XHRleGVjdXRpb24uc291cmNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBleGVjdXRpb24gb2YgY2xpZW50VG9vbEV4ZWN1dGlvbnMudmFsdWVzKCkpIHtcblx0XHRcdFx0ZXhlY3V0aW9uLnNvdXJjZS5kaXNwb3NlKHRydWUpO1xuXHRcdFx0XHRleGVjdXRpb24ucmV0YWluLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdGNsaWVudFRvb2xFeGVjdXRpb25zLmNsZWFyKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVGhpcyB3YXRjaGVyIGlzIHRoZSBzaW5nbGUgcG9pbnQgb2YgdHJ1dGggZm9yIGhvdyBjbGllbnQgdG9vbHNcblx0XHQvLyBleGVjdXRlLiBBIHR1cm4gb2JzZXJ2ZXIgb25seSBldmVyIHJlbmRlcnMgdGhlIHNoYXJlZCBpbnZvY2F0aW9uOyBpdFxuXHRcdC8vIG5ldmVyIGludm9rZXMgdGhlIHRvb2wuIEVhY2ggb3V0c3RhbmRpbmcgYmxvY2tlciBpcyBoYW5kbGVkIGhlcmVcblx0XHQvLyBleGFjdGx5IG9uY2UsIGtleWVkIGJ5IGl0cyByZXF1ZXN0IGlkLlxuXHRcdHN0b3JlLmFkZChhdXRvcnVuUGVyS2V5ZWRJdGVtKHJlcXVlc3RzLCByZXF1ZXN0ID0+IHJlcXVlc3QuaWQsIChfcmVxdWVzdElkLCByZXF1ZXN0JCwgaXRlbVN0b3JlKSA9PiB7XG5cdFx0XHRjb25zdCBpbml0aWFsID0gcmVxdWVzdCQuZ2V0KCk7XG5cdFx0XHRjb25zdCBjaGF0VVJJID0gaW5pdGlhbC5jaGF0LnRvU3RyaW5nKCk7XG5cblx0XHRcdGlmIChpbml0aWFsLmtpbmQgPT09IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLkNoYXRJbnB1dCkge1xuXHRcdFx0XHQvLyBBIHVzZXItZmFjaW5nIGVsaWNpdGF0aW9uIHdpdGggbm8gdG9vbCBjYWxsLiBJZiBubyB0dXJuXG5cdFx0XHRcdC8vIG9ic2VydmVyIHJlbmRlcnMgaXQgd2l0aGluIHRoZSBncmFjZSB3aW5kb3csIG5vYm9keSBjb3VsZFxuXHRcdFx0XHQvLyBhbnN3ZXIgaXQsIHNvIGNhbmNlbCBpdCAodGhlIGFnZW50IGFza2VkOyBub2JvZHkgd2FzIHRoZXJlKS5cblx0XHRcdFx0Y29uc3QgaW5wdXRLZXkgPSB0aGlzLl9pbnB1dFJlcXVlc3RLZXkoY2hhdFVSSSwgaW5pdGlhbC5yZXF1ZXN0LmlkKTtcblx0XHRcdFx0bGV0IGNhbmNlbGxlZCA9IGZhbHNlO1xuXHRcdFx0XHRpdGVtU3RvcmUuYWRkKGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRpZiAoY2FuY2VsbGVkIHx8IHRoaXMuX3JlbmRlcmVkUmVxdWVzdHMuZ2V0KCkuaGFzKGlucHV0S2V5KSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYW5jZWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdF0gQ2FuY2VsbGluZyBjaGF0IGlucHV0IHJlcXVlc3QgJHtpbml0aWFsLnJlcXVlc3QuaWR9OiBubyBzZXNzaW9uIGNsYWltZWQgaXQgd2l0aGluICR7VU5PQlNFUlZFRF9DTElFTlRfVE9PTF9HUkFDRV9NU31tc2ApO1xuXHRcdFx0XHRcdHRoaXMuX2Rpc3BhdGNoQWN0aW9uKGJhY2tlbmRTZXNzaW9uLCB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRJbnB1dENvbXBsZXRlZCxcblx0XHRcdFx0XHRcdHJlcXVlc3RJZDogaW5pdGlhbC5yZXF1ZXN0LmlkLFxuXHRcdFx0XHRcdFx0cmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZC5DYW5jZWwsXG5cdFx0XHRcdFx0fSwgY2hhdFVSSSk7XG5cdFx0XHRcdH0sIFVOT0JTRVJWRURfQ0xJRU5UX1RPT0xfR1JBQ0VfTVMpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBrZXkgPSB0aGlzLl90b29sQ2FsbEtleShjaGF0VVJJLCBpbml0aWFsLnR1cm5JZCwgaW5pdGlhbC50b29sQ2FsbC50b29sQ2FsbElkKTtcblx0XHRcdGNvbnN0IHJlcXVlc3RMaWZlY3ljbGUgPSBpdGVtU3RvcmUuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4oKSk7XG5cdFx0XHRpdGVtU3RvcmUuYWRkKHRoaXMuX3JldGFpblRvb2xDYWxsKGtleSkpO1xuXG5cdFx0XHRpZiAoaW5pdGlhbC5raW5kID09PSBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZC5Ub29sQ2xpZW50RXhlY3V0aW9uKSB7XG5cdFx0XHRcdGlmIChpbml0aWFsLmNsaWVudElkICE9PSB0aGlzLl9jb25maWcuY29ubmVjdGlvbi5jbGllbnRJZCkge1xuXHRcdFx0XHRcdHJldHVybjsgLy8gQSBkaWZmZXJlbnQgY2xpZW50IG93bnMgdGhpcyBjYWxsLlxuXHRcdFx0XHR9XG5cdFx0XHRcdGxldCBleGVjdXRpb24gPSBjbGllbnRUb29sRXhlY3V0aW9ucy5nZXQoa2V5KTtcblx0XHRcdFx0aWYgKCFleGVjdXRpb24pIHtcblx0XHRcdFx0XHRleGVjdXRpb24gPSB7IHNvdXJjZTogbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCksIHJldGFpbjogdGhpcy5fcmV0YWluVG9vbENhbGwoa2V5KSwgYWN0aXZlQXR0ZW1wdHM6IDAgfTtcblx0XHRcdFx0XHRjbGllbnRUb29sRXhlY3V0aW9ucy5zZXQoa2V5LCBleGVjdXRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHRhcmdldHNDb25maXJtYXRpb24gPSBpbml0aWFsLnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbjtcblx0XHRcdFx0cmVxdWVzdExpZmVjeWNsZS52YWx1ZSA9IHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9jbGllbnRUb29sSW52b2NhdGlvbnMuZ2V0KGtleSk/LnN0YXRlLmdldCgpO1xuXHRcdFx0XHRcdGNvbnN0IHRhcmdldHNTdGF0ZSA9IHN0YXRlPy50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5TdHJlYW1pbmdcblx0XHRcdFx0XHRcdHx8IHN0YXRlPy50eXBlID09PSAodGFyZ2V0c0NvbmZpcm1hdGlvblxuXHRcdFx0XHRcdFx0XHQ/IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb25cblx0XHRcdFx0XHRcdFx0OiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcpXG5cdFx0XHRcdFx0XHR8fCAoZXhlY3V0aW9uLmFjdGl2ZUF0dGVtcHRzID4gMFxuXHRcdFx0XHRcdFx0XHQmJiAoc3RhdGU/LnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNhbmNlbGxlZFxuXHRcdFx0XHRcdFx0XHRcdHx8IHN0YXRlPy50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5Db21wbGV0ZWQpKTtcblx0XHRcdFx0XHRpZiAodGFyZ2V0c1N0YXRlKSB7XG5cdFx0XHRcdFx0XHRleGVjdXRpb24uc291cmNlLmNhbmNlbCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIXRhcmdldHNDb25maXJtYXRpb24gfHwgc3RhdGU/LnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZykge1xuXHRcdFx0XHRcdFx0cmVsZWFzZUNsaWVudFRvb2xFeGVjdXRpb24oa2V5LCBleGVjdXRpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGxldCBnZW5lcmF0aW9uID0gMDtcblx0XHRcdFx0bGV0IG9ic2VydmVkUmVxdWVzdDogU2Vzc2lvblRvb2xDbGllbnRFeGVjdXRpb25SZXF1ZXN0IHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRsZXQgc3RhcnRlZFJlcXVlc3Q6IFNlc3Npb25Ub29sQ2xpZW50RXhlY3V0aW9uUmVxdWVzdCB8IHVuZGVmaW5lZDtcblx0XHRcdFx0bGV0IGludm9jYXRpb25TdGFydGVkID0gZmFsc2U7XG5cdFx0XHRcdGNvbnN0IHVub2JzZXJ2ZWRUaW1lciA9IGl0ZW1TdG9yZS5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0XHRcdFx0aXRlbVN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcmVxdWVzdCA9IHJlcXVlc3QkLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRjb25zdCBjbGFpbWFudCA9IHRoaXMuX3JlbmRlcmVkUmVxdWVzdHMucmVhZChyZWFkZXIpLmdldChrZXkpO1xuXHRcdFx0XHRcdGlmIChyZXF1ZXN0LmtpbmQgIT09IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xDbGllbnRFeGVjdXRpb24gfHwgcmVxdWVzdC5jbGllbnRJZCAhPT0gdGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uY2xpZW50SWQpIHtcblx0XHRcdFx0XHRcdGdlbmVyYXRpb24rKztcblx0XHRcdFx0XHRcdG9ic2VydmVkUmVxdWVzdCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdHN0YXJ0ZWRSZXF1ZXN0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0aW52b2NhdGlvblN0YXJ0ZWQgPSBmYWxzZTtcblx0XHRcdFx0XHRcdHVub2JzZXJ2ZWRUaW1lci5jbGVhcigpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoc3RhcnRlZENsaWVudFRvb2xDYWxscy5oYXMoa2V5KSkge1xuXHRcdFx0XHRcdFx0c3RhcnRlZFJlcXVlc3QgPSByZXF1ZXN0O1xuXHRcdFx0XHRcdFx0dW5vYnNlcnZlZFRpbWVyLmNsZWFyKCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICghZXF1YWxzKG9ic2VydmVkUmVxdWVzdCwgcmVxdWVzdCkpIHtcblx0XHRcdFx0XHRcdG9ic2VydmVkUmVxdWVzdCA9IHJlcXVlc3Q7XG5cdFx0XHRcdFx0XHRpZiAoaW52b2NhdGlvblN0YXJ0ZWQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Z2VuZXJhdGlvbisrO1xuXHRcdFx0XHRcdFx0c3RhcnRlZFJlcXVlc3QgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHR1bm9ic2VydmVkVGltZXIuY2xlYXIoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHN0YXJ0ZWRSZXF1ZXN0KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChyZXF1ZXN0LnRvb2xDYWxsLnRvb2xOYW1lID09PSBSVU5USU1FX1RPT0xfU0VBUkNIX1RPT0xfTkFNRVxuXHRcdFx0XHRcdFx0JiYgcmVhZFRvb2xDYWxsTWV0YShyZXF1ZXN0LnRvb2xDYWxsKS50b29sU2VhcmNoQ2FuZGlkYXRlcyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGV4ZWN1dGUgPSAoY29udGV4dFNlc3Npb25SZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkKSA9PiB7XG5cdFx0XHRcdFx0XHRzdGFydGVkUmVxdWVzdCA9IHJlcXVlc3Q7XG5cdFx0XHRcdFx0XHR1bm9ic2VydmVkVGltZXIuY2xlYXIoKTtcblx0XHRcdFx0XHRcdGNvbnN0IHJlcXVlc3RHZW5lcmF0aW9uID0gZ2VuZXJhdGlvbjtcblx0XHRcdFx0XHRcdGV4ZWN1dGlvbi5hY3RpdmVBdHRlbXB0cysrO1xuXHRcdFx0XHRcdFx0dm9pZCB0aGlzLl9leGVjdXRlQ2xpZW50VG9vbChcblx0XHRcdFx0XHRcdFx0cmVxdWVzdCxcblx0XHRcdFx0XHRcdFx0Y29udGV4dFNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHRcdFx0ZXhlY3V0aW9uLnNvdXJjZS50b2tlbixcblx0XHRcdFx0XHRcdFx0KCkgPT4gcmVxdWVzdEdlbmVyYXRpb24gPT09IGdlbmVyYXRpb24gJiYgKGludm9jYXRpb25TdGFydGVkIHx8IGVxdWFscyhyZXF1ZXN0JC5yZWFkKHVuZGVmaW5lZCksIHJlcXVlc3QpKSxcblx0XHRcdFx0XHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChyZXF1ZXN0R2VuZXJhdGlvbiA9PT0gZ2VuZXJhdGlvbikge1xuXHRcdFx0XHRcdFx0XHRcdFx0aW52b2NhdGlvblN0YXJ0ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRcdFx0c3RhcnRlZENsaWVudFRvb2xDYWxscy5hZGQoa2V5KTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHQpLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRleGVjdXRpb24uYWN0aXZlQXR0ZW1wdHMtLTtcblx0XHRcdFx0XHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRoaXMuX2NsaWVudFRvb2xJbnZvY2F0aW9ucy5nZXQoa2V5KTtcblx0XHRcdFx0XHRcdFx0aWYgKGV4ZWN1dGlvbi5hY3RpdmVBdHRlbXB0cyA9PT0gMCAmJiBpbnZvY2F0aW9uICYmIElDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZShpbnZvY2F0aW9uKSkge1xuXHRcdFx0XHRcdFx0XHRcdHJlbGVhc2VDbGllbnRUb29sRXhlY3V0aW9uKGtleSwgZXhlY3V0aW9uKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIGlmIChleGVjdXRpb24uYWN0aXZlQXR0ZW1wdHMgPT09IDAgJiYgY2xpZW50VG9vbEV4ZWN1dGlvbnMuZ2V0KGtleSkgIT09IGV4ZWN1dGlvbikge1xuXHRcdFx0XHRcdFx0XHRcdGV4ZWN1dGlvbi5zb3VyY2UuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdGlmIChjbGFpbWFudCkge1xuXHRcdFx0XHRcdFx0ZXhlY3V0ZShjbGFpbWFudCk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICghdGhpcy5fY2xpZW50VG9vbFJlcXVpcmVzQ29uZmlybWF0aW9uKHJlcXVlc3QudG9vbENhbGwpKSB7XG5cdFx0XHRcdFx0XHRleGVjdXRlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICghdW5vYnNlcnZlZFRpbWVyLnZhbHVlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCByZXF1ZXN0R2VuZXJhdGlvbiA9IGdlbmVyYXRpb247XG5cdFx0XHRcdFx0XHR1bm9ic2VydmVkVGltZXIudmFsdWUgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmIChyZXF1ZXN0R2VuZXJhdGlvbiA9PT0gZ2VuZXJhdGlvbiAmJiAhc3RhcnRlZFJlcXVlc3QpIHtcblx0XHRcdFx0XHRcdFx0XHRzdGFydGVkUmVxdWVzdCA9IHJlcXVlc3Q7XG5cdFx0XHRcdFx0XHRcdFx0c3RhcnRlZENsaWVudFRvb2xDYWxscy5hZGQoa2V5KTtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9kZW55Q2xpZW50VG9vbChyZXF1ZXN0KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSwgVU5PQlNFUlZFRF9DTElFTlRfVE9PTF9HUkFDRV9NUyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9IGVsc2UgaWYgKGluaXRpYWwua2luZCA9PT0gU2Vzc2lvbklucHV0UmVxdWVzdEtpbmQuVG9vbEF1dGhlbnRpY2F0aW9uKSB7XG5cdFx0XHRcdC8vIEFuIE1DUCB0b29sIGNhbGwgYmxvY2tlZCBvbiBhdXRoZW50aWNhdGlvbi4gVGhlIHRva2VuIGlzXG5cdFx0XHRcdC8vIHB1c2hlZCBvdXQtb2YtYmFuZCB2aWEgdGhlIGBhdXRoZW50aWNhdGVgIGNvbW1hbmQsIHNvIHRoaXNcblx0XHRcdFx0Ly8gd2F0Y2hlciBkb2VzIG5vdCByZXNvbHZlIGl0IFx1MjAxNCBidXQgaWYgbm8gb2JzZXJ2ZXIgcmVuZGVycyB0aGVcblx0XHRcdFx0Ly8gY2FsbCB3aXRoaW4gdGhlIGdyYWNlIHdpbmRvdyBub2JvZHkgY2FuIGRyaXZlIHRoYXQgZmxvdywgc29cblx0XHRcdFx0Ly8gY2FuY2VsIHRoZSBjYWxsIHJhdGhlciB0aGFuIGxlYXZlIHRoZSBhZ2VudCBibG9ja2VkIGZvcmV2ZXIuXG5cdFx0XHRcdGl0ZW1TdG9yZS5hZGQoZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdGlmICghdGhpcy5fcmVuZGVyZWRSZXF1ZXN0cy5nZXQoKS5oYXMoa2V5KSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0XSBDYW5jZWxsaW5nIE1DUCBhdXRoZW50aWNhdGlvbiBmb3IgJHtpbml0aWFsLnRvb2xDYWxsLnRvb2xOYW1lfSAoY2FsbElkPSR7aW5pdGlhbC50b29sQ2FsbC50b29sQ2FsbElkfSk6IG5vIHNlc3Npb24gY2xhaW1lZCBpdCB3aXRoaW4gJHtVTk9CU0VSVkVEX0NMSUVOVF9UT09MX0dSQUNFX01TfW1zYCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZXNvbHZlVG9vbENhbGwoY2hhdFVSSSwgaW5pdGlhbC50dXJuSWQsIGluaXRpYWwudG9vbENhbGwudG9vbENhbGxJZCwge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0XHRcdFx0XHR0dXJuSWQ6IGluaXRpYWwudHVybklkLFxuXHRcdFx0XHRcdFx0XHR0b29sQ2FsbElkOiBpbml0aWFsLnRvb2xDYWxsLnRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGxvY2FsaXplKCdhZ2VudEhvc3QubWNwVG9vbEF1dGhlbnRpY2F0aW9uLmNhbmNlbGxlZCcsIFwiQ2FuY2VsbGVkIHRvb2wgY2FsbFwiKSxcblx0XHRcdFx0XHRcdFx0XHRlcnJvcjogeyBtZXNzYWdlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0Lm1jcFRvb2xBdXRoZW50aWNhdGlvbi5jYW5jZWxsZWRFcnJvcicsIFwiTUNQIGF1dGhlbnRpY2F0aW9uIHdhcyBjYW5jZWxsZWRcIiksIGNvZGU6ICdjYW5jZWxsZWQnIH0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIFVOT0JTRVJWRURfQ0xJRU5UX1RPT0xfR1JBQ0VfTVMpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIEEgY29uZmlybWF0aW9uIHRoYXQgbm8gc3ViL2FnZW50IG9ic2VydmVyIGNsYWltcyB3aXRoaW4gdGhlXG5cdFx0XHRcdC8vIGdyYWNlIHdpbmRvdyBpcyBhdXRvLWRlbmllZCBzbyB0aGUgYWdlbnQgaXMgbm90IGxlZnQgYmxvY2tlZFxuXHRcdFx0XHQvLyBvbiBhIHN1cmZhY2UgdGhhdCBuZXZlciByZW5kZXJzLlxuXHRcdFx0XHRpdGVtU3RvcmUuYWRkKGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRpZiAoIXRoaXMuX3JlbmRlcmVkUmVxdWVzdHMuZ2V0KCkuaGFzKGtleSkpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdF0gRGVueWluZyBjb25maXJtYXRpb24gZm9yICR7aW5pdGlhbC50b29sQ2FsbC50b29sTmFtZX0gKGNhbGxJZD0ke2luaXRpYWwudG9vbENhbGwudG9vbENhbGxJZH0pOiBubyBzZXNzaW9uIGNsYWltZWQgaXQgd2l0aGluICR7VU5PQlNFUlZFRF9DTElFTlRfVE9PTF9HUkFDRV9NU31tc2ApO1xuXHRcdFx0XHRcdFx0dGhpcy5fcmVzb2x2ZVRvb2xDYWxsKGNoYXRVUkksIGluaXRpYWwudHVybklkLCBpbml0aWFsLnRvb2xDYWxsLnRvb2xDYWxsSWQsIHtcblx0XHRcdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQsXG5cdFx0XHRcdFx0XHRcdHR1cm5JZDogaW5pdGlhbC50dXJuSWQsXG5cdFx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6IGluaXRpYWwudG9vbENhbGwudG9vbENhbGxJZCxcblx0XHRcdFx0XHRcdFx0YXBwcm92ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRyZWFzb246IFRvb2xDYWxsQ2FuY2VsbGF0aW9uUmVhc29uLkRlbmllZCxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSwgVU5PQlNFUlZFRF9DTElFTlRfVE9PTF9HUkFDRV9NUykpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWxlYXNlcyB0aGlzIHJlc291cmNlJ3MgcmVmZXJlbmNlIHRvIHRoZSBzaGFyZWQgcGVyLWJhY2tlbmQtc2Vzc2lvblxuXHQgKiB7QGxpbmsgX3dhdGNoRm9yU2Vzc2lvbklucHV0TmVlZGVkfSB3YXRjaGVyLCBkaXNwb3NpbmcgaXQgb25seSBvbmNlIHRoZVxuXHQgKiBsYXN0IHNpYmxpbmcgcmVzb3VyY2UgaGFzIGxldCBnby5cblx0ICovXG5cdHByaXZhdGUgX3JlbGVhc2VTZXNzaW9uSW5wdXROZWVkZWQoc2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IHRoaXMuX2lucHV0TmVlZGVkV2F0Y2hlckJhY2tlbmRzLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHRoaXMuX2lucHV0TmVlZGVkV2F0Y2hlckJhY2tlbmRzLmRlbGV0ZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghYmFja2VuZFNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvbktleSA9IGJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9pbnB1dE5lZWRlZFdhdGNoZXJzLmdldChzZXNzaW9uS2V5KTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGVudHJ5LnJlZnMuZGVsZXRlKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRpZiAoZW50cnkucmVmcy5zaXplID09PSAwKSB7XG5cdFx0XHR0aGlzLl9pbnB1dE5lZWRlZFdhdGNoZXJzLmRlbGV0ZShzZXNzaW9uS2V5KTtcblx0XHRcdGVudHJ5LnN0b3JlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogSG9sZHMgdGhlIHNoYXJlZCBzdGF0ZSBmb3IgYSB0b29sIGNhbGwgd2hpbGUgYW4gYGlucHV0TmVlZGVkYCByZXF1ZXN0XG5cdCAqIHJlZmVyZW5jZXMgaXQuIE9uY2UgdGhlIGhvc3Qgc3RvcHMgYXNraW5nIFx1MjAxNCB0aGUgcmVxdWVzdCBkaXNhcHBlYXJzLCBvciB0aGVcblx0ICogd2F0Y2hlciBpcyBkaXNwb3NlZCBcdTIwMTQgdGhlIG91dGNvbWUgaXMgc2V0dGxlZCwgc28gdGhlIGRpc3BhdGNoLWZ1bm5lbCBlbnRyeVxuXHQgKiBhbmQgdGhlIHNoYXJlZCBpbnZvY2F0aW9uIGFyZSBkcm9wcGVkIGFuZCBhIGxhdGVyIGNhbGwgd2l0aCB0aGUgc2FtZSBpZHNcblx0ICogaXMgbmV2ZXIgbWlzdGFrZW4gZm9yIHRoaXMgb25lLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmV0YWluVG9vbENhbGwoa2V5OiBzdHJpbmcpOiBJRGlzcG9zYWJsZSB7XG5cdFx0dGhpcy5fY2xpZW50VG9vbFJldGFpbkNvdW50cy5zZXQoa2V5LCAodGhpcy5fY2xpZW50VG9vbFJldGFpbkNvdW50cy5nZXQoa2V5KSA/PyAwKSArIDEpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVtYWluaW5nID0gKHRoaXMuX2NsaWVudFRvb2xSZXRhaW5Db3VudHMuZ2V0KGtleSkgPz8gMSkgLSAxO1xuXHRcdFx0aWYgKHJlbWFpbmluZyA+IDApIHtcblx0XHRcdFx0dGhpcy5fY2xpZW50VG9vbFJldGFpbkNvdW50cy5zZXQoa2V5LCByZW1haW5pbmcpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jbGllbnRUb29sUmV0YWluQ291bnRzLmRlbGV0ZShrZXkpO1xuXHRcdFx0dGhpcy5fZm9yZ2V0UmVzb2x2ZWRUb29sQ2FsbChrZXkpO1xuXHRcdFx0dGhpcy5fY2xpZW50VG9vbEludm9jYXRpb25zLmRlbGV0ZShrZXkpO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHNoYXJlZCB7QGxpbmsgQ2hhdFRvb2xJbnZvY2F0aW9ufSBmb3IgYSBjbGllbnQgdG9vbCBjYWxsLFxuXHQgKiBjcmVhdGluZyBpdCBvbiBmaXJzdCB1c2UgdmlhIHtAbGluayBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5iZWdpblRvb2xDYWxsfS5cblx0ICogYHNlc3Npb25SZXNvdXJjZWAgaXMgZGVsaWJlcmF0ZWx5IG9taXR0ZWQgc28gYGJlZ2luVG9vbENhbGxgIGRvZXMgbm90XG5cdCAqIGFwcGVuZCBwcm9ncmVzcyBpbnRvIGEgY2hhdCBtb2RlbCAod2hpY2ggdGhyb3dzIG9uY2UgdGhlIG93bmluZyByZXF1ZXN0XG5cdCAqIGlzIGNvbXBsZXRlKTsgaXQgc3RpbGwgcmVnaXN0ZXJzIHRoZSBpbnZvY2F0aW9uLCBzbyBhIGxhdGVyIGBpbnZva2VUb29sYFxuXHQgKiB3aXRoIGEgbWF0Y2hpbmcgYGNoYXRTdHJlYW1Ub29sQ2FsbElkYCBhdHRhY2hlcyB0byB0aGlzIHNhbWUgb2JqZWN0LiBUaGVcblx0ICogb2JzZXJ2ZXIgdGhhdCByZW5kZXJzIHRoZSBjYWxsIGFuZCB0aGUgd2F0Y2hlciB0aGF0IGV4ZWN1dGVzIGl0IHRoZXJlZm9yZVxuXHQgKiBhY3Qgb24gb25lIGludm9jYXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9lbnN1cmVDbGllbnRUb29sSW52b2NhdGlvbihjaGF0VVJJOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nLCB0b29sQ2FsbElkOiBzdHJpbmcsIHRvb2xJZDogc3RyaW5nLCBzdWJhZ2VudEludm9jYXRpb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogQ2hhdFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBrZXkgPSB0aGlzLl90b29sQ2FsbEtleShjaGF0VVJJLCB0dXJuSWQsIHRvb2xDYWxsSWQpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fY2xpZW50VG9vbEludm9jYXRpb25zLmdldChrZXkpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHRcdH1cblx0XHRjb25zdCBpbnZvY2F0aW9uID0gdGhpcy5fdG9vbHNTZXJ2aWNlLmJlZ2luVG9vbENhbGwoe1xuXHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdHRvb2xJZCxcblx0XHRcdHN1YmFnZW50SW52b2NhdGlvbklkLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiB1bmRlZmluZWQsXG5cdFx0XHRmb3JjZTogdHJ1ZSxcblx0XHR9KSBhcyBDaGF0VG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGludm9jYXRpb24pIHtcblx0XHRcdHRoaXMuX2NsaWVudFRvb2xJbnZvY2F0aW9ucy5zZXQoa2V5LCBpbnZvY2F0aW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIGludm9jYXRpb247XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciBhbiB1bmNsYWltZWQgY2xpZW50IHRvb2wgbXVzdCB3YWl0IGZvciBhIHJlbmRlcmluZyBvYnNlcnZlclxuXHQgKiBiZWZvcmUgcnVubmluZy4gVGhlcmUgaXMgbm8gcHJvdG9jb2wgZmllbGQgZm9yIHRoaXMsIHNvIHdlIHVzZSB0aGUgdG9vbCdzXG5cdCAqIHN0YXRpYyB7QGxpbmsgSVRvb2xEYXRhLmNhblJlcXVlc3RQcmVBcHByb3ZhbH0gc2lnbmFsOiBhIHRvb2wgdGhhdCBtaWdodFxuXHQgKiBhc2sgZm9yIHByZS1hcHByb3ZhbCBjb3VsZCBwb3AgYSBjb25maXJtYXRpb24sIHdoaWNoIG9ubHkgbWFrZXMgc2Vuc2Vcblx0ICogaW5zaWRlIGEgbGl2ZSBjaGF0IHJlcXVlc3QuIExpbWl0YXRpb246IHRoaXMgaXMgYSBcIm1pZ2h0XCIgc2lnbmFsIFx1MjAxNCBhIHRvb2xcblx0ICogbWF5IHNldCBpdCB5ZXQgYXV0by1hcHByb3ZlIGF0IHJ1bnRpbWUgXHUyMDE0IHNvIGFuIHVuY2xhaW1lZCBzdWNoIHRvb2wgaXNcblx0ICogY29uc2VydmF0aXZlbHkgbWFkZSB0byB3YWl0IChhbmQgZGVuaWVkIG9uIHRpbWVvdXQpIHJhdGhlciB0aGFuIHJpc2sgYVxuXHQgKiBoZWFkbGVzcyBtb2RhbCBub2JvZHkgY2FuIGFuc3dlci4gT25seSBjb25zdWx0ZWQgZm9yIHRoZSB1bmNsYWltZWQgY2FzZTtcblx0ICogYSBjbGFpbWVkIGNhbGwgYWx3YXlzIHJ1bnMgd2l0aCBjb250ZXh0IHJlZ2FyZGxlc3MuXG5cdCAqL1xuXHRwcml2YXRlIF9jbGllbnRUb29sUmVxdWlyZXNDb25maXJtYXRpb24odG9vbENhbGw6IFRvb2xDYWxsU3RhdGUpOiBib29sZWFuIHtcblx0XHRjb25zdCBjbGllbnRUb29sTmFtZSA9IHRvb2xDYWxsLnRvb2xOYW1lID09PSBSVU5USU1FX1RPT0xfU0VBUkNIX1RPT0xfTkFNRSA/IENMSUVOVF9UT09MX1NFQVJDSF9SRUZFUkVOQ0VfTkFNRSA6IHRvb2xDYWxsLnRvb2xOYW1lO1xuXHRcdHJldHVybiB0aGlzLl90b29sc1NlcnZpY2UuZ2V0VG9vbEJ5TmFtZShjbGllbnRUb29sTmFtZSk/LmNhblJlcXVlc3RQcmVBcHByb3ZhbCA9PT0gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgb25lIHBsYWNlIGEgY2xpZW50IHRvb2wgaXMgYWN0dWFsbHkgaW52b2tlZC4gRW5zdXJlcyB0aGUgc2hhcmVkXG5cdCAqIGludm9jYXRpb24gZXhpc3RzLCBwYXJzZXMgdGhlIHByb3RvY29sIGlucHV0IChwcmVzZXJ2aW5nIHRoZSB0b29sLXNlYXJjaFxuXHQgKiBjYW5kaWRhdGUgaGFuZGxpbmcpLCBpbnZva2VzIHRoZSB0b29sLCBhbmQgZGlzcGF0Y2hlcyB0aGUgcHJvdG9jb2xcblx0ICogY29tcGxldGlvbi4gYGNvbnRleHRTZXNzaW9uUmVzb3VyY2VgIGlzIHNldCB3aGVuIGEgdHVybiBvYnNlcnZlciBpc1xuXHQgKiByZW5kZXJpbmcgdGhlIGNhbGw6IGEgbGl2ZSBjaGF0IHJlcXVlc3QgdGhlbiBleGlzdHMsIHNvIGNvbmZpcm1hdGlvblxuXHQgKiByZW5kZXJzIGluIHRoZSB0b29sIHBhcnQsIGFueSBwcmUtYXBwcm92YWwgaXMgaG9ub3JlZCwgYW5kIHNpZGUgZWZmZWN0c1xuXHQgKiBhdHRyaWJ1dGUgdG8gdGhhdCBvYnNlcnZlcidzIGNoYXQuIFdpdGhvdXQgaXQgdGhlIHRvb2wgcnVucyBoZWFkbGVzc2x5LFxuXHQgKiBpbmRlcGVuZGVudCBvZiB3aGV0aGVyIHRoZSBvd25pbmcgdHVybiBpcyBsaXZlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZXhlY3V0ZUNsaWVudFRvb2wocmVxdWVzdDogU2Vzc2lvblRvb2xDbGllbnRFeGVjdXRpb25SZXF1ZXN0LCBjb250ZXh0U2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgaXNDdXJyZW50OiAoKSA9PiBib29sZWFuLCBtYXJrSW52b2NhdGlvblN0YXJ0ZWQ6ICgpID0+IHZvaWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjaGF0VVJJID0gcmVxdWVzdC5jaGF0LnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgdG9vbENhbGwgPSByZXF1ZXN0LnRvb2xDYWxsO1xuXHRcdGNvbnN0IHRvb2xOYW1lID0gdG9vbENhbGwudG9vbE5hbWU7XG5cdFx0Y29uc3QgaXNUb29sU2VhcmNoID0gdG9vbE5hbWUgPT09IFJVTlRJTUVfVE9PTF9TRUFSQ0hfVE9PTF9OQU1FO1xuXHRcdGNvbnN0IGNsaWVudFRvb2xOYW1lID0gaXNUb29sU2VhcmNoID8gQ0xJRU5UX1RPT0xfU0VBUkNIX1JFRkVSRU5DRV9OQU1FIDogdG9vbE5hbWU7XG5cdFx0Y29uc3QgdG9vbERhdGEgPSB0aGlzLl90b29sc1NlcnZpY2UuZ2V0VG9vbEJ5TmFtZShjbGllbnRUb29sTmFtZSk7XG5cblx0XHQvLyBBIHRvb2wtc2VhcmNoIGNvbXBsZXRpb24gKHN1Y2Nlc3Mgb3IgZmFpbHVyZSkgbXVzdCBkcm9wIHRoZSB0cmFuc2llbnRcblx0XHQvLyBjYW5kaWRhdGUgY29ycHVzIGZyb20gYF9tZXRhYCB3aGlsZSBwcmVzZXJ2aW5nIGFueSBvdGhlciBtZXRhZGF0YS5cblx0XHRjb25zdCBjb21wbGV0aW9uTWV0YSA9IGlzVG9vbFNlYXJjaCA/IHsgX21ldGE6IG1ldGFXaXRob3V0VG9vbFNlYXJjaENhbmRpZGF0ZXModG9vbENhbGwpIH0gOiB7fTtcblxuXHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sRGF0YVxuXHRcdFx0PyB0aGlzLl9lbnN1cmVDbGllbnRUb29sSW52b2NhdGlvbihjaGF0VVJJLCByZXF1ZXN0LnR1cm5JZCwgdG9vbENhbGwudG9vbENhbGxJZCwgdG9vbERhdGEuaWQsIHVuZGVmaW5lZClcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGZhaWwgPSAobWVzc2FnZTogc3RyaW5nLCBjb2RlOiBzdHJpbmcpID0+IHtcblx0XHRcdGNvbnN0IHBhc3RUZW5zZU1lc3NhZ2UgPSBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNsaWVudFRvb2wucGFzdFRlbnNlJywgXCJDb3VsZG4ndCBydW4gezB9XCIsIHRvb2xDYWxsLmRpc3BsYXlOYW1lKTtcblx0XHRcdGNvbnN0IHJlc3VsdDogSVRvb2xSZXN1bHQgPSB7XG5cdFx0XHRcdGNvbnRlbnQ6IFtdLFxuXHRcdFx0XHR0b29sUmVzdWx0RXJyb3I6IG1lc3NhZ2UsXG5cdFx0XHRcdHRvb2xSZXN1bHRNZXNzYWdlOiBwYXN0VGVuc2VNZXNzYWdlLFxuXHRcdFx0fTtcblx0XHRcdHZvaWQgaW52b2NhdGlvbj8uZGlkRXhlY3V0ZVRvb2wocmVzdWx0KTtcblx0XHRcdHRoaXMuX3Jlc29sdmVUb29sQ2FsbChjaGF0VVJJLCByZXF1ZXN0LnR1cm5JZCwgdG9vbENhbGwudG9vbENhbGxJZCwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0XHR0dXJuSWQ6IHJlcXVlc3QudHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkOiB0b29sQ2FsbC50b29sQ2FsbElkLFxuXHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlLFxuXHRcdFx0XHRcdGVycm9yOiB7IG1lc3NhZ2UsIGNvZGUgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Li4uY29tcGxldGlvbk1ldGEsXG5cdFx0XHR9KTtcblx0XHR9O1xuXG5cdFx0aWYgKCF0b29sRGF0YSkge1xuXHRcdFx0ZmFpbChsb2NhbGl6ZSgnYWdlbnRIb3N0LmNsaWVudFRvb2wudW5rbm93bicsIFwiVG9vbCBcXFwiezB9XFxcIiBpcyBub3QgYXZhaWxhYmxlIG9uIHRoaXMgY2xpZW50LlwiLCB0b29sTmFtZSksICd0b29sVW5hdmFpbGFibGUnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIWludm9jYXRpb24pIHtcblx0XHRcdGZhaWwobG9jYWxpemUoJ2FnZW50SG9zdC5jbGllbnRUb29sLmJlZ2luRmFpbGVkJywgXCJDb3VsZCBub3QgY3JlYXRlIGludm9jYXRpb24gZm9yIGNsaWVudCB0b29sIFxcXCJ7MH1cXFwiLlwiLCB0b29sTmFtZSksICdpbnZvY2F0aW9uRmFpbGVkJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8taW4tb3BlcmF0b3Jcblx0XHRjb25zdCB0b29sSW5wdXQgPSAndG9vbElucHV0JyBpbiB0b29sQ2FsbCA/IHRvb2xDYWxsLnRvb2xJbnB1dCA6IHVuZGVmaW5lZDtcblx0XHRsZXQgcmF3SW5wdXQ6IHN0cmluZztcblx0XHR0cnkge1xuXHRcdFx0cmF3SW5wdXQgPSBhd2FpdCByZXNvbHZlVG9vbElucHV0KHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uLCB0b29sSW5wdXQpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoIWlzQ3VycmVudCgpIHx8IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8IGludm9jYXRpb24uc3RhdGUuZ2V0KCkudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ2FuY2VsbGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RdIEZhaWxlZCB0byByZWFkIGNsaWVudCB0b29sIGlucHV0OiAke3Rvb2xOYW1lfWAsIGVycm9yKTtcblx0XHRcdGZhaWwobWVzc2FnZSwgJ2lucHV0UmVhZEZhaWxlZCcpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIWlzQ3VycmVudCgpIHx8IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8IGludm9jYXRpb24uc3RhdGUuZ2V0KCkudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuQ2FuY2VsbGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHBhcmFtZXRlcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXJzZWQ6IHVua25vd24gPSBKU09OLnBhcnNlKHJhd0lucHV0KTtcblx0XHRcdGlmICghcGFyc2VkIHx8IHR5cGVvZiBwYXJzZWQgIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkocGFyc2VkKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2V4cGVjdGVkIEpTT04gb2JqZWN0Jyk7XG5cdFx0XHR9XG5cdFx0XHRwYXJhbWV0ZXJzID0gcGFyc2VkIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0ZmFpbChsb2NhbGl6ZSgnYWdlbnRIb3N0LmNsaWVudFRvb2wuYmFkSW5wdXQnLCBcIkludmFsaWQgdG9vbCBpbnB1dCBmb3IgXFxcInswfVxcXCI6IGV4cGVjdGVkIEpTT04gb2JqZWN0IHBhcmFtZXRlcnMuXCIsIHRvb2xOYW1lKSwgJ2ludmFsaWRJbnB1dCcpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRvb2xTZWFyY2hDYW5kaWRhdGVzID0gaXNUb29sU2VhcmNoID8gcmVhZFRvb2xDYWxsTWV0YSh0b29sQ2FsbCkudG9vbFNlYXJjaENhbmRpZGF0ZXMgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKHRvb2xTZWFyY2hDYW5kaWRhdGVzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHBhcmFtZXRlcnMgPSB7IC4uLnBhcmFtZXRlcnMsIGNhbmRpZGF0ZVRvb2xzOiB0b29sU2VhcmNoQ2FuZGlkYXRlcyB9O1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0FnZW50SG9zdF0gUnVubmluZyBjbGllbnQgdG9vbDogJHt0b29sTmFtZX0gKGNhbGxJZD0ke3Rvb2xDYWxsLnRvb2xDYWxsSWR9LCB3aXRoQ29udGV4dD0ke2NvbnRleHRTZXNzaW9uUmVzb3VyY2UgIT09IHVuZGVmaW5lZH0pYCk7XG5cdFx0bGV0IHJlc3VsdDogSVRvb2xSZXN1bHQgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGVycm9yOiB1bmtub3duO1xuXHRcdHRyeSB7XG5cdFx0XHRtYXJrSW52b2NhdGlvblN0YXJ0ZWQoKTtcblx0XHRcdHJlc3VsdCA9IGF3YWl0IHRoaXMuX3Rvb2xzU2VydmljZS5pbnZva2VUb29sKHtcblx0XHRcdFx0Y2FsbElkOiB0b29sQ2FsbC50b29sQ2FsbElkLFxuXHRcdFx0XHR0b29sSWQ6IHRvb2xEYXRhLmlkLFxuXHRcdFx0XHRwYXJhbWV0ZXJzLFxuXHRcdFx0XHRjb250ZXh0OiBjb250ZXh0U2Vzc2lvblJlc291cmNlID8geyBzZXNzaW9uUmVzb3VyY2U6IGNvbnRleHRTZXNzaW9uUmVzb3VyY2UgfSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y2hhdFN0cmVhbVRvb2xDYWxsSWQ6IHRvb2xDYWxsLnRvb2xDYWxsSWQsXG5cdFx0XHRcdHByZUFwcHJvdmVkOiB0b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24gPyB1bmRlZmluZWQgOiBnZXRDbGllbnRUb29sUHJlQXBwcm92YWwodG9vbENhbGwpLFxuXHRcdFx0fSwgYXN5bmMgKCkgPT4gMCwgdG9rZW4pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0ZXJyb3IgPSBlcnI7XG5cdFx0fVxuXG5cdFx0aWYgKCFpc0N1cnJlbnQoKSB8fCB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCB8fCBpbnZvY2F0aW9uLnN0YXRlLmdldCgpLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkNhbmNlbGxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZXJyb3IgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RdIENsaWVudCB0b29sIGZhaWxlZDogJHt0b29sTmFtZX1gLCBlcnJvcik7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQgPSB7IGNvbnRlbnQ6IFtdLCB0b29sUmVzdWx0RXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSB9O1xuXHRcdH1cblxuXHRcdHRoaXMuX3Jlc29sdmVUb29sQ2FsbChjaGF0VVJJLCByZXF1ZXN0LnR1cm5JZCwgdG9vbENhbGwudG9vbENhbGxJZCwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdHR1cm5JZDogcmVxdWVzdC50dXJuSWQsXG5cdFx0XHR0b29sQ2FsbElkOiB0b29sQ2FsbC50b29sQ2FsbElkLFxuXHRcdFx0cmVzdWx0OiB0b29sUmVzdWx0VG9Qcm90b2NvbChyZXN1bHQgPz8geyBjb250ZW50OiBbXSB9LCB0b29sTmFtZSksXG5cdFx0XHQuLi5jb21wbGV0aW9uTWV0YSxcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEZW5pZXMgYSBjbGllbnQgdG9vbCBjYWxsIHRoYXQgbmVlZHMgY29uZmlybWF0aW9uIGJ1dCB0aGF0IG5vIHN1Yi9hZ2VudFxuXHQgKiBvYnNlcnZlciBjbGFpbWVkIHdpdGhpbiB0aGUgZ3JhY2Ugd2luZG93OiB0aGVyZSBpcyBubyBsaXZlIHN1cmZhY2UgdG9cblx0ICogYW5zd2VyIGl0LCBzbyByZXBvcnQgYSBmYWlsZWQgY29tcGxldGlvbiByYXRoZXIgdGhhbiBwb3AgYSBoZWFkbGVzc1xuXHQgKiBtb2RhbC5cblx0ICovXG5cdHByaXZhdGUgX2RlbnlDbGllbnRUb29sKHJlcXVlc3Q6IFNlc3Npb25Ub29sQ2xpZW50RXhlY3V0aW9uUmVxdWVzdCk6IHZvaWQge1xuXHRcdGNvbnN0IHRvb2xDYWxsID0gcmVxdWVzdC50b29sQ2FsbDtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RdIERlbnlpbmcgY2xpZW50IHRvb2wgJHt0b29sQ2FsbC50b29sTmFtZX0gKGNhbGxJZD0ke3Rvb2xDYWxsLnRvb2xDYWxsSWR9KTogaXQgY2FuIHJlcXVlc3QgY29uZmlybWF0aW9uIGJ1dCBubyBzZXNzaW9uIGNsYWltZWQgaXQgd2l0aGluICR7VU5PQlNFUlZFRF9DTElFTlRfVE9PTF9HUkFDRV9NU31tc2ApO1xuXHRcdHRoaXMuX3Jlc29sdmVUb29sQ2FsbChyZXF1ZXN0LmNoYXQudG9TdHJpbmcoKSwgcmVxdWVzdC50dXJuSWQsIHRvb2xDYWxsLnRvb2xDYWxsSWQsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHR0dXJuSWQ6IHJlcXVlc3QudHVybklkLFxuXHRcdFx0dG9vbENhbGxJZDogdG9vbENhbGwudG9vbENhbGxJZCxcblx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogbG9jYWxpemUoJ2FnZW50SG9zdC5jbGllbnRUb29sLnVuY2xhaW1lZCcsIFwiQ291bGRuJ3QgcnVuIHswfVwiLCB0b29sQ2FsbC5kaXNwbGF5TmFtZSksXG5cdFx0XHRcdGVycm9yOiB7XG5cdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2FnZW50SG9zdC5jbGllbnRUb29sLnVuY2xhaW1lZEVycm9yJywgXCJ7MH0gbmVlZHMgY29uZmlybWF0aW9uIGJ1dCBubyBzZXNzaW9uIHdhcyBhdmFpbGFibGUgdG8gYW5zd2VyIGl0LlwiLCB0b29sQ2FsbC5kaXNwbGF5TmFtZSksXG5cdFx0XHRcdFx0Y29kZTogJ2NsaWVudFVuYXZhaWxhYmxlJyxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0dGhpcy5fY2xpZW50VG9vbEludm9jYXRpb25zLmRlbGV0ZSh0aGlzLl90b29sQ2FsbEtleShyZXF1ZXN0LmNoYXQudG9TdHJpbmcoKSwgcmVxdWVzdC50dXJuSWQsIHRvb2xDYWxsLnRvb2xDYWxsSWQpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUcmFja3MgcHJvdG9jb2wgc3RhdGUgY2hhbmdlcyBmb3IgYSBzcGVjaWZpYyBzZXJ2ZXItaW5pdGlhdGVkIHR1cm4gYW5kXG5cdCAqIHB1c2hlcyBgSUNoYXRQcm9ncmVzc1tdYCBpdGVtcyBpbnRvIHRoZSBzZXNzaW9uJ3MgYHByb2dyZXNzT2JzYC5cblx0ICogV2hlbiB0aGUgdHVybiBmaW5pc2hlcywgc2V0cyBgaXNDb21wbGV0ZU9ic2AgdG8gdHJ1ZS5cblx0ICovXG5cdHByaXZhdGUgX3RyYWNrU2VydmVyVHVyblByb2dyZXNzKFxuXHRcdGJhY2tlbmRTZXNzaW9uOiBVUkksXG5cdFx0dHVybklkOiBzdHJpbmcsXG5cdFx0Y2hhdFNlc3Npb246IEFnZW50SG9zdENoYXRTZXNzaW9uLFxuXHRcdHR1cm5EaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLFxuXHQpOiB2b2lkIHtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0dXJuRGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSkpO1xuXHRcdHR1cm5EaXNwb3NhYmxlcy5hZGQodGhpcy5fb2JzZXJ2ZVR1cm4oe1xuXHRcdFx0YmFja2VuZFNlc3Npb24sXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGNoYXRTZXNzaW9uLnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdGNoYXRVUkk6IHRoaXMuX2dldENoYXRVUkkoY2hhdFNlc3Npb24uc2Vzc2lvblJlc291cmNlKSxcblx0XHRcdHR1cm5JZCxcblx0XHRcdHNpbms6IHBhcnRzID0+IGNoYXRTZXNzaW9uLmFwcGVuZFByb2dyZXNzKHBhcnRzKSxcblx0XHRcdGNhbmNlbGxhdGlvblRva2VuOiBjdHMudG9rZW4sXG5cdFx0XHRvblR1cm5FbmRlZDogKCkgPT4gY2hhdFNlc3Npb24uaXNDb21wbGV0ZU9icy5zZXQodHJ1ZSwgdW5kZWZpbmVkKSxcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF90dXJuU3RvcFdhdGNoS2V5KGNoYXRVUkk6IHN0cmluZywgdHVybklkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHtjaGF0VVJJfVxcMCR7dHVybklkfWA7XG5cdH1cblxuXHRwcml2YXRlIF9lbnN1cmVUdXJuU3RvcFdhdGNoKGNoYXRVUkk6IHN0cmluZywgdHVybklkOiBzdHJpbmcpOiBTdG9wV2F0Y2gge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuX3R1cm5TdG9wV2F0Y2hLZXkoY2hhdFVSSSwgdHVybklkKTtcblx0XHRsZXQgc3RvcFdhdGNoID0gdGhpcy5fdHVyblN0b3BXYXRjaGVzLmdldChrZXkpO1xuXHRcdGlmICghc3RvcFdhdGNoKSB7XG5cdFx0XHRzdG9wV2F0Y2ggPSBTdG9wV2F0Y2guY3JlYXRlKGZhbHNlKTtcblx0XHRcdHRoaXMuX3R1cm5TdG9wV2F0Y2hlcy5zZXQoa2V5LCBzdG9wV2F0Y2gpO1xuXHRcdH1cblx0XHRyZXR1cm4gc3RvcFdhdGNoO1xuXHR9XG5cblx0cHJpdmF0ZSBfdHVybkR1cmF0aW9uKGNoYXRVUkk6IHN0cmluZywgdHVybklkOiBzdHJpbmcpOiBudW1iZXIge1xuXHRcdGNvbnN0IGVsYXBzZWQgPSB0aGlzLl90dXJuU3RvcFdhdGNoZXMuZ2V0KHRoaXMuX3R1cm5TdG9wV2F0Y2hLZXkoY2hhdFVSSSwgdHVybklkKSk/LmVsYXBzZWQoKTtcblx0XHRyZXR1cm4gdHlwZW9mIGVsYXBzZWQgPT09ICdudW1iZXInICYmIE51bWJlci5pc0Zpbml0ZShlbGFwc2VkKSA/IE1hdGgubWF4KDAsIGVsYXBzZWQpIDogMDtcblx0fVxuXG5cdHByaXZhdGUgX2NsZWFyVHVyblN0b3BXYXRjaChjaGF0VVJJOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fdHVyblN0b3BXYXRjaGVzLmRlbGV0ZSh0aGlzLl90dXJuU3RvcFdhdGNoS2V5KGNoYXRVUkksIHR1cm5JZCkpO1xuXHR9XG5cblx0Ly8gLS0tLSBUdXJuIGhhbmRsaW5nIChzdGF0ZS1kcml2ZW4pIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZVR1cm4oXG5cdFx0c2Vzc2lvbjogVVJJLFxuXHRcdHJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0LFxuXHRcdHByb2dyZXNzOiAocGFydHM6IElDaGF0UHJvZ3Jlc3NbXSkgPT4gdm9pZCxcblx0XHRjYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdFx0b25GYWlsdXJlU3RhZ2U6IChzdGFnZTogQWdlbnRIb3N0SW52b2NhdGlvbkZhaWx1cmVTdGFnZSkgPT4gdm9pZCxcblx0KTogUHJvbWlzZTxUdXJuIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKGNhbmNlbGxhdGlvblRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0b25GYWlsdXJlU3RhZ2UoJ3ByZXBhcmVUdXJuJyk7XG5cdFx0Ly8gVGhpcyB3YWl0cyBvbmx5IGZvciBsb2NhbCB0cnVzdCBjaGVja3MgYW5kIG9yZGVyZWQgb3B0aW1pc3RpYyBkaXNwYXRjaDtcblx0XHQvLyB3b3JraW5nLWRpcmVjdG9yeSBhY3Rpb24gZW52ZWxvcGVzIGFyZSBub3QgYSB0dXJuLXN0YXJ0IGJhcnJpZXIuXG5cdFx0YXdhaXQgdGhpcy5fd29ya2luZ0RpcmVjdG9yeVN5bmNocm9uaXplci5yZWNvbmNpbGUoc2Vzc2lvbiwgY2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRcdGlmIChjYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB0dXJuSWQgPSByZXF1ZXN0LnJlcXVlc3RJZDtcblx0XHR0aGlzLl9jbGllbnREaXNwYXRjaGVkVHVybklkcy5hZGQodHVybklkKTtcblx0XHRjb25zdCBjaGF0VVJJID0gdGhpcy5fZ2V0Q2hhdFVSSShyZXF1ZXN0LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgdHVybkNoYW5uZWwgPSBjaGF0VVJJO1xuXHRcdGNvbnN0IG1lc3NhZ2VBdHRhY2htZW50cyA9IGF3YWl0IHRoaXMuX2NvbnZlcnRWYXJpYWJsZXNUb0F0dGFjaG1lbnRzKHJlcXVlc3QpO1xuXHRcdGlmIChjYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEFkZCB0aGlzIGNvbm5lY3Rpb24gYXMgYW4gYWN0aXZlIGNsaWVudCBmb3IgdGhlIHNlc3Npb24gYmVmb3JlIHRoZVxuXHRcdC8vIHR1cm4gZ29lcyBvdXQuIFdlIG9ubHkgZG8gdGhpcyBvbiB0dXJuIHN0YXJ0IChub3Qgb24gc2Vzc2lvbiBvcGVuKVxuXHRcdC8vIHNvIHRoYXQgb3BlbmluZyBhIHNlc3Npb24gZG9lc24ndCBlYWdlcmx5IHJlZ2lzdGVyIHRoaXMgY2xpZW50IHdoaWxlXG5cdFx0Ly8gYW5vdGhlciBjbGllbnQgaXMgaW4gdGhlIG1pZGRsZSBvZiBhIHR1cm4uXG5cdFx0dGhpcy5fZW5zdXJlQWN0aXZlQ2xpZW50KHJlcXVlc3Quc2Vzc2lvblJlc291cmNlLCBzZXNzaW9uKTtcblxuXHRcdC8vIE1vZGVsIGFuZCBhZ2VudCBzZWxlY3Rpb24gbm93IHRyYXZlbCBvbiB0aGUgdHVybiBtZXNzYWdlIGl0c2VsZiByYXRoZXJcblx0XHQvLyB0aGFuIHZpYSB0aGUgcmVtb3ZlZCBgc2Vzc2lvbi9tb2RlbENoYW5nZWRgIC8gYHNlc3Npb24vYWdlbnRDaGFuZ2VkYFxuXHRcdC8vIGFjdGlvbnMuIFRoZSBob3N0IGFwcGxpZXMgdGhlIHNlbGVjdGlvbiBjYXJyaWVkIGJ5IHRoZSBtZXNzYWdlIGJlZm9yZVxuXHRcdC8vIHNlbmRpbmcgdGhlIHR1cm4gdG8gdGhlIGFnZW50IGJhY2tlbmQuXG5cdFx0Y29uc3Qgc2VsZWN0ZWRNb2RlbCA9IHRoaXMuX2NyZWF0ZU1vZGVsU2VsZWN0aW9uKHJlcXVlc3QudXNlclNlbGVjdGVkTW9kZWxJZCwgcmVxdWVzdC5tb2RlbENvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbnN0IHJlcXVlc3RlZEFnZW50VXJpID0gcmVxdWVzdC5tb2RlSW5zdHJ1Y3Rpb25zPy51cmk/LnRvU3RyaW5nKCk7XG5cblx0XHQvLyBJZiB0aGUgY2hhdCBtb2RlbCBoYXMgZmV3ZXIgcHJldmlvdXMgcmVxdWVzdHMgdGhhbiB0aGUgcHJvdG9jb2wgaGFzXG5cdFx0Ly8gdHVybnMsIGEgY2hlY2twb2ludCB3YXMgcmVzdG9yZWQgb3IgYSBtZXNzYWdlIHdhcyBlZGl0ZWQuIERpc3BhdGNoXG5cdFx0Ly8gc2Vzc2lvbi90cnVuY2F0ZWQgc28gdGhlIHNlcnZlciBkcm9wcyB0aGUgc3RhbGUgdGFpbC5cblx0XHRjb25zdCBjaGF0TW9kZWwgPSB0aGlzLl9jaGF0U2VydmljZS5nZXRTZXNzaW9uKHJlcXVlc3Quc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBwcm90b2NvbFN0YXRlID0gdGhpcy5fZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSwgY2hhdFVSSSk7XG5cdFx0aWYgKGNoYXRNb2RlbCAmJiBwcm90b2NvbFN0YXRlPy50dXJucy5sZW5ndGgpIHtcblx0XHRcdC8vIC0yIHNpbmNlIC0xIHdpbGwgYWxyZWFkeSBiZSB0aGUgY3VycmVudCByZXF1ZXN0XG5cdFx0XHRjb25zdCBwcmV2aW91c1JlcXVlc3RJbmRleCA9IGNoYXRNb2RlbC5nZXRSZXF1ZXN0cygpLmZpbmRJbmRleChpID0+IGkuaWQgPT09IHJlcXVlc3QucmVxdWVzdElkKSAtIDE7XG5cdFx0XHRjb25zdCBwcmV2aW91c1JlcXVlc3QgPSBwcmV2aW91c1JlcXVlc3RJbmRleCA+PSAwID8gY2hhdE1vZGVsLmdldFJlcXVlc3RzKClbcHJldmlvdXNSZXF1ZXN0SW5kZXhdIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKCFwcmV2aW91c1JlcXVlc3QgJiYgcHJvdG9jb2xTdGF0ZS50dXJucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IHRydW5jYXRlQWN0aW9uOiBDaGF0VHJ1bmNhdGVkQWN0aW9uID0ge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRydW5jYXRlZCxcblx0XHRcdFx0fTtcblx0XHRcdFx0dGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uZGlzcGF0Y2godHVybkNoYW5uZWwsIHRydW5jYXRlQWN0aW9uKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHNlZW5BdEluZGV4ID0gcHJvdG9jb2xTdGF0ZS50dXJucy5maW5kSW5kZXgodCA9PiB0LmlkID09PSBwcmV2aW91c1JlcXVlc3QhLmlkKTtcblx0XHRcdFx0aWYgKHNlZW5BdEluZGV4ICE9PSAtMSAmJiBzZWVuQXRJbmRleCA8IHByb3RvY29sU3RhdGUudHVybnMubGVuZ3RoIC0gMSkge1xuXHRcdFx0XHRcdGNvbnN0IHRydW5jYXRlQWN0aW9uOiBDaGF0VHJ1bmNhdGVkQWN0aW9uID0ge1xuXHRcdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHJ1bmNhdGVkLFxuXHRcdFx0XHRcdFx0dHVybklkOiBwcmV2aW91c1JlcXVlc3QhLmlkLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0dGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uZGlzcGF0Y2godHVybkNoYW5uZWwsIHRydW5jYXRlQWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIERpc3BhdGNoIHNlc3Npb24vdHVyblN0YXJ0ZWQgXHUyMDE0IHRoZSBzZXJ2ZXIgd2lsbCBjYWxsIHNlbmRNZXNzYWdlIG9uXG5cdFx0Ly8gdGhlIHByb3ZpZGVyIGFzIGEgc2lkZSBlZmZlY3QuXG5cdFx0Y29uc3QgdHVybkFjdGlvbjogQ2hhdFR1cm5TdGFydGVkQWN0aW9uID0ge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHR0dXJuSWQsXG5cdFx0XHRzdGFydGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdG1lc3NhZ2U6IHdpdGhNZXNzYWdlSGlkZGVuRnJvbVRyYW5zY3JpcHQoe1xuXHRcdFx0XHQuLi51c2VyT3JpZ2luTWVzc2FnZShyZXF1ZXN0Lm1lc3NhZ2UsIG1lc3NhZ2VBdHRhY2htZW50cyksXG5cdFx0XHRcdC4uLihzZWxlY3RlZE1vZGVsID8geyBtb2RlbDogc2VsZWN0ZWRNb2RlbCB9IDoge30pLFxuXHRcdFx0XHQuLi4ocmVxdWVzdGVkQWdlbnRVcmkgPyB7IGFnZW50OiB7IHVyaTogcmVxdWVzdGVkQWdlbnRVcmkgfSB9IDoge30pLFxuXHRcdFx0fSwgcmVxdWVzdC5oaWRlRnJvbVRyYW5zY3JpcHQpLFxuXHRcdH07XG5cdFx0dGhpcy5fZW5zdXJlVHVyblN0b3BXYXRjaCh0dXJuQ2hhbm5lbCwgdHVybklkKTtcblx0XHRvbkZhaWx1cmVTdGFnZSgnZGlzcGF0Y2hUdXJuJyk7XG5cdFx0dGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uZGlzcGF0Y2godHVybkNoYW5uZWwsIHR1cm5BY3Rpb24pO1xuXG5cdFx0Ly8gRW5zdXJlIHRoZSBzbmFwc2hvdCBjb250cm9sbGVyIHJlY29yZHMgYSBzZW50aW5lbCBjaGVja3BvaW50IGZvciB0aGlzXG5cdFx0Ly8gcmVxdWVzdCBzbyBpdCBhcHBlYXJzIGluIHJlcXVlc3REaXNhYmxlbWVudCBldmVuIGlmIHRoZSB0dXJuXG5cdFx0Ly8gcHJvZHVjZXMgbm8gZmlsZSBlZGl0cy5cblx0XHR0aGlzLl9lbnN1cmVTbmFwc2hvdENvbnRyb2xsZXIocmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UpXG5cdFx0XHQ/LmVuc3VyZVJlcXVlc3RDaGVja3BvaW50KHJlcXVlc3QucmVxdWVzdElkKTtcblxuXHRcdC8vIFdhaXQgZm9yIHRoZSB0dXJuIHRvIHJlYWNoIGEgdGVybWluYWwgc3RhdGUuIFRoZSBvYnNlcnZhYmxlIGdyYXBoXG5cdFx0Ly8gaW5zdGFsbGVkIGJlbG93IGRyaXZlcyBhbGwgcHJvZ3Jlc3MgZW1pc3Npb24gdmlhIHRoZSBgcHJvZ3Jlc3NgXG5cdFx0Ly8gc2luayBhbmQgcmVzb2x2ZXMgdGhlIHByb21pc2UgZnJvbSBgb25UdXJuRW5kZWRgLiBDYW5jZWxsYXRpb24gaXNcblx0XHQvLyBzdXJmYWNlZCB0aHJvdWdoIHRoZSBzYW1lIHBhdGg6IHRoZSBvYnNlcnZlciBkaXNwb3NlcyBpdHNlbGYgd2hlblxuXHRcdC8vIGBjYW5jZWxsYXRpb25Ub2tlbmAgZmlyZXMsIHRoZW4gY2FsbHMgYG9uVHVybkVuZGVkKHVuZGVmaW5lZClgLlxuXHRcdG9uRmFpbHVyZVN0YWdlKCdvYnNlcnZlVHVybicpO1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTxUdXJuIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0Y29uc3QgY2FuY2VsU3ViID0gc3RvcmUuYWRkKGNhbmNlbGxhdGlvblRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdFx0Y2FuY2VsU3ViLmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRIb3N0XSBDYW5jZWxsYXRpb24gcmVxdWVzdGVkIGZvciAke3Nlc3Npb24udG9TdHJpbmcoKX0sIGRpc3BhdGNoaW5nIHR1cm5DYW5jZWxsZWRgKTtcblx0XHRcdFx0dGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uZGlzcGF0Y2godHVybkNoYW5uZWwsIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkLFxuXHRcdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0XHRkdXJhdGlvbjogdGhpcy5fdHVybkR1cmF0aW9uKHR1cm5DaGFubmVsLCB0dXJuSWQpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pKTtcblxuXHRcdFx0c3RvcmUuYWRkKHRoaXMuX29ic2VydmVUdXJuKHtcblx0XHRcdFx0YmFja2VuZFNlc3Npb246IHNlc3Npb24sXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogcmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdGNoYXRVUkksXG5cdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0c2luazogcHJvZ3Jlc3MsXG5cdFx0XHRcdGNhbmNlbGxhdGlvblRva2VuLFxuXHRcdFx0XHRzdXBwcmVzc0Vycm9yTWFya2Rvd246IHRydWUsXG5cdFx0XHRcdG9uVHVybkVuZGVkOiAobGFzdFR1cm4pID0+IHtcblx0XHRcdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0dGhpcy5fY2xpZW50RGlzcGF0Y2hlZFR1cm5JZHMuZGVsZXRlKHR1cm5JZCk7XG5cdFx0XHRcdFx0dGhpcy5fYWN0aXZlU2Vzc2lvbnMuZ2V0KHJlcXVlc3Quc2Vzc2lvblJlc291cmNlKT8uaXNDb21wbGV0ZU9icy5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRyZXNvbHZlKGxhc3RUdXJuKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b25GaWxlRWRpdHM6ICh0YykgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGVkaXRQYXJ0cyA9IHRoaXMuX2h5ZHJhdGVGaWxlRWRpdHMocmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3QucmVxdWVzdElkLCB0Yyk7XG5cdFx0XHRcdFx0aWYgKGVkaXRQYXJ0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRwcm9ncmVzcyhlZGl0UGFydHMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdH0pKTtcblx0XHR9KTtcblx0fVxuXG5cdC8vIC0tLS0gVG9vbCBjb25maXJtYXRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogQXdhaXRzIHVzZXIgY29uZmlybWF0aW9uIG9uIGEgUGVuZGluZ0NvbmZpcm1hdGlvbiB0b29sIGNhbGwgaW52b2NhdGlvblxuXHQgKiBhbmQgZGlzcGF0Y2hlcyBgQ2hhdFRvb2xDYWxsQ29uZmlybWVkYCBiYWNrIHRvIHRoZSBzZXJ2ZXIuXG5cdCAqL1xuXHRwcml2YXRlIF9hd2FpdFRvb2xDb25maXJtYXRpb24oXG5cdFx0aW52b2NhdGlvbjogQ2hhdFRvb2xJbnZvY2F0aW9uLFxuXHRcdHRvb2xDYWxsSWQ6IHN0cmluZyxcblx0XHRzZXNzaW9uOiBVUkksXG5cdFx0dHVybklkOiBzdHJpbmcsXG5cdFx0Y2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuXHRcdGdldFByb3RvY29sT3B0aW9uczogKCkgPT4gQ29uZmlybWF0aW9uT3B0aW9uW10gfCB1bmRlZmluZWQsXG5cdFx0Y2hhdFVSST86IHN0cmluZyxcblx0KTogdm9pZCB7XG5cdFx0SUNoYXRUb29sSW52b2NhdGlvbi5hd2FpdENvbmZpcm1hdGlvbihpbnZvY2F0aW9uLCBjYW5jZWxsYXRpb25Ub2tlbikudGhlbihyZWFzb24gPT4ge1xuXHRcdFx0Ly8gV2hlbiB0aGUgdXNlciBwaWNrZWQgYSBjdXN0b20gYnV0dG9uLCByZXNvbHZlIHRoZSBtYXRjaGluZ1xuXHRcdFx0Ly8gcHJvdG9jb2wgb3B0aW9uIHNvIHdlIGNhbiBmb3J3YXJkIGBzZWxlY3RlZE9wdGlvbklkYCBhbmRcblx0XHRcdC8vIGRlcml2ZSBhcHByb3ZlL2RlbnkgZnJvbSB0aGUgb3B0aW9uJ3Mga2luZC5cblx0XHRcdGxldCBzZWxlY3RlZE9wdGlvbjogQ29uZmlybWF0aW9uT3B0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcHJvdG9jb2xPcHRpb25zID0gZ2V0UHJvdG9jb2xPcHRpb25zKCk7XG5cdFx0XHRpZiAocmVhc29uLnR5cGUgPT09IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uICYmIHJlYXNvbi5zZWxlY3RlZEJ1dHRvbiAmJiBwcm90b2NvbE9wdGlvbnMpIHtcblx0XHRcdFx0c2VsZWN0ZWRPcHRpb24gPSBwcm90b2NvbE9wdGlvbnMuZmluZChvID0+IG8uaWQgPT09IHJlYXNvbi5zZWxlY3RlZEJ1dHRvbik7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFwcHJvdmVkID0gc2VsZWN0ZWRPcHRpb25cblx0XHRcdFx0PyBzZWxlY3RlZE9wdGlvbi5raW5kID09PSBDb25maXJtYXRpb25PcHRpb25LaW5kLkFwcHJvdmVcblx0XHRcdFx0OiByZWFzb24udHlwZSAhPT0gVG9vbENvbmZpcm1LaW5kLkRlbmllZCAmJiByZWFzb24udHlwZSAhPT0gVG9vbENvbmZpcm1LaW5kLlNraXBwZWQ7XG5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0FnZW50SG9zdF0gVG9vbCBjb25maXJtYXRpb246IHRvb2xDYWxsSWQ9JHt0b29sQ2FsbElkfSwgYXBwcm92ZWQ9JHthcHByb3ZlZH0sIHNlbGVjdGVkT3B0aW9uSWQ9JHtzZWxlY3RlZE9wdGlvbj8uaWR9YCk7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLl9yZXF1aXJlQ2hhdFVSSShjaGF0VVJJLCBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCk7XG5cdFx0XHR0aGlzLl9yZXNvbHZlVG9vbENhbGwodGFyZ2V0LCB0dXJuSWQsIHRvb2xDYWxsSWQsIGFwcHJvdmVkXG5cdFx0XHRcdD8ge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkLFxuXHRcdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRcdGFwcHJvdmVkOiB0cnVlLFxuXHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uVXNlckFjdGlvbixcblx0XHRcdFx0XHQuLi4oc2VsZWN0ZWRPcHRpb24gPyB7IHNlbGVjdGVkT3B0aW9uSWQ6IHNlbGVjdGVkT3B0aW9uLmlkIH0gOiB7fSksXG5cdFx0XHRcdH1cblx0XHRcdFx0OiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQsXG5cdFx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0YXBwcm92ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdHJlYXNvbjogVG9vbENhbGxDYW5jZWxsYXRpb25SZWFzb24uRGVuaWVkLFxuXHRcdFx0XHRcdC4uLihzZWxlY3RlZE9wdGlvbiA/IHsgc2VsZWN0ZWRPcHRpb25JZDogc2VsZWN0ZWRPcHRpb24uaWQgfSA6IHt9KSxcblx0XHRcdFx0fSk7XG5cdFx0fSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdF0gVG9vbCBjb25maXJtYXRpb24gZmFpbGVkIGZvciB0b29sQ2FsbElkPSR7dG9vbENhbGxJZH1gLCBlcnIpO1xuXHRcdH0pO1xuXHR9XG5cblx0Ly8gLS0tLSBQZXItdHVybiBvYnNlcnZhYmxlIGdyYXBoIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBJbnN0YWxscyB0aGUgYWx3YXlzLW9uIG9ic2VydmFibGUgZ3JhcGggdGhhdCB0cmFuc2xhdGVzIHNlc3Npb24gc3RhdGVcblx0ICogaW50byBgSUNoYXRQcm9ncmVzc1tdYCBmb3IgYSBzcGVjaWZpYyB0dXJuLiBUaGUgc2FtZSBncmFwaCBpcyB1c2VkIGZvcjpcblx0ICogICAtIGxpdmUgdHVybnMgc3RhcnRlZCBieSB0aGUgdXNlciB2aWEge0BsaW5rIF9oYW5kbGVUdXJufSxcblx0ICogICAtIHJlY29ubmVjdCB0byBhbiBpbi1mbGlnaHQgdHVybiBmcm9tIHtAbGluayBwcm92aWRlQ2hhdFNlc3Npb25Db250ZW50fSxcblx0ICogICAtIHNlcnZlci1pbml0aWF0ZWQgdHVybnMgZGV0ZWN0ZWQgYnkge0BsaW5rIF93YXRjaEZvclNlcnZlckluaXRpYXRlZFR1cm5zfS5cblx0ICpcblx0ICogRGlmZmVyZW5jZXMgYXJlIGNhcHR1cmVkIGluIHtAbGluayBJT2JzZXJ2ZVR1cm5PcHRpb25zLnNpbmt9ICh3aGVyZVxuXHQgKiBwcm9ncmVzcyBpcyBkZWxpdmVyZWQpIGFuZCB7QGxpbmsgSU9ic2VydmVUdXJuT3B0aW9ucy5hZG9wdEludm9jYXRpb25zfSAvXG5cdCAqIHtAbGluayBJT2JzZXJ2ZVR1cm5PcHRpb25zLnNlZWRFbWl0dGVkTGVuZ3Roc30gKHNuYXBzaG90IGNvbnRpbnVpdHkgZm9yXG5cdCAqIHRoZSByZWNvbm5lY3QgY2FzZSkuXG5cdCAqXG5cdCAqIFRoZSByZXR1cm5lZCBkaXNwb3NhYmxlIG93bnMgdGhlIGVudGlyZSBwZXItdHVybiBncmFwaCwgaW5jbHVkaW5nIHRoZVxuXHQgKiB1bmRlcmx5aW5nIHNlc3Npb24gc3Vic2NyaXB0aW9uIHJlZmVyZW5jZS5cblx0ICovXG5cdHByaXZhdGUgX29ic2VydmVUdXJuKG9wdHM6IElPYnNlcnZlVHVybk9wdGlvbnMpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3Qgc2Vzc2lvbktleSA9IG9wdHMuYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9lbnN1cmVUdXJuU3RvcFdhdGNoKG9wdHMuY2hhdFVSSSwgb3B0cy50dXJuSWQpO1xuXHRcdC8vIGBfZW5zdXJlU2Vzc2lvblN1YnNjcmlwdGlvbmAgcmV0dXJucyBhIHByb2Nlc3Mtc2hhcmVkLCBub24tcmVmY291bnRlZFxuXHRcdC8vIHN1YnNjcmlwdGlvbiBvd25lZCBieSB0aGUgY2hhdCBzZXNzaW9uIGxpZmVjeWNsZS4gRG8gTk9UIHJlbGVhc2UgaXRcblx0XHQvLyBmcm9tIGhlcmUgXHUyMDE0IG90aGVyIGNhbGxlcnMgKHRoZSBzZXJ2ZXItdHVybiB3YXRjaGVyLCByZWNvbm5lY3QsIHRoZVxuXHRcdC8vIGhpc3RvcnkgaHlkcmF0aW9uIGNvZGUpIHNoYXJlIHRoZSBzYW1lIGluc3RhbmNlIGFuZCB3b3VsZCBsb3NlXG5cdFx0Ly8gdGhlaXIgc3RhdGUgaWYgd2UgdG9yZSBpdCBkb3duLlxuXHRcdGNvbnN0IHN1YiA9IHRoaXMuX2Vuc3VyZVNlc3Npb25TdWJzY3JpcHRpb24oc2Vzc2lvbktleSk7XG5cdFx0Y29uc3QgY2hhdFVSSSA9IG9wdHMuY2hhdFVSSTtcblx0XHRjb25zdCBjaGF0U3ViID0gdGhpcy5fZW5zdXJlQ2hhdFN1YnNjcmlwdGlvbihzZXNzaW9uS2V5LCBjaGF0VVJJKTtcblxuXHRcdGNvbnN0IHNlc3Npb25TdGF0ZSQgPSBvYnNlcnZhYmxlRnJvbVN1YnNjcmlwdGlvbih0aGlzLCBzdWIpO1xuXHRcdGNvbnN0IGNoYXRTdGF0ZSQgPSBvYnNlcnZhYmxlRnJvbVN1YnNjcmlwdGlvbih0aGlzLCBjaGF0U3ViKTtcblx0XHQvLyBNZXJnZSB0aGUgc2Vzc2lvbiB3aXRoIHRoaXMgcmVzb3VyY2UncyBjaGF0IHNvIGNvbnZlcnNhdGlvbiBjb250ZW50c1xuXHRcdC8vIGFyZSBvYnNlcnZhYmxlIGZyb20gb25lIHBsYWNlLlxuXHRcdGNvbnN0IG1lcmdlZFN0YXRlJCA9IGRlcml2ZWQocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9uU3RhdGUkLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG1lcmdlU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdChzZXNzaW9uLCBjaGF0U3RhdGUkLnJlYWQocmVhZGVyKSk7XG5cdFx0fSk7XG5cdFx0Y29uc3QgdHVybiQgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IG1lcmdlZFN0YXRlJC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gc3RhdGUuYWN0aXZlVHVybj8uaWQgPT09IG9wdHMudHVybklkXG5cdFx0XHRcdD8gc3RhdGUuYWN0aXZlVHVyblxuXHRcdFx0XHQ6IHN0YXRlLnR1cm5zLmZpbmQodCA9PiB0LmlkID09PSBvcHRzLnR1cm5JZCk7XG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVzcG9uc2VQYXJ0cyQgPSBkZXJpdmVkKHJlYWRlciA9PiB0dXJuJC5yZWFkKHJlYWRlcik/LnJlc3BvbnNlUGFydHMgPz8gW10pO1xuXHRcdGNvbnN0IHVzYWdlJCA9IGRlcml2ZWQocmVhZGVyID0+IHR1cm4kLnJlYWQocmVhZGVyKT8udXNhZ2UpO1xuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IG1lcmdlZFN0YXRlJC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoc3RhdGU/LnR1cm5zLnNvbWUodHVybiA9PiB0dXJuLmlkID09PSBvcHRzLnR1cm5JZCkpIHtcblx0XHRcdFx0dGhpcy5fY2xlYXJUdXJuU3RvcFdhdGNoKG9wdHMuY2hhdFVSSSwgb3B0cy50dXJuSWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRjb25zdCBtY3BBdXRoUmVxdWlyZWQkID0gZGVyaXZlZE9wdHMoeyBlcXVhbHNGbjogZXF1YWxzIH0sIHJlYWRlciA9PiB7XG5cdFx0XHRyZXR1cm4gZ2V0TWNwQXV0aGVudGljYXRpb25SZXF1aXJlZFNlcnZlcnMob3B0cy5zZXNzaW9uUmVzb3VyY2UsIG1lcmdlZFN0YXRlJC5yZWFkKHJlYWRlcikpO1xuXHRcdH0pO1xuXHRcdGNvbnN0IG1jcFN0YXJ0aW5nJCA9IGRlcml2ZWRPcHRzKHsgZXF1YWxzRm46IGVxdWFscyB9LCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBtZXJnZWRTdGF0ZSQucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc2VydmVycyA9IHN0YXRlPy5jdXN0b21pemF0aW9ucz8uZmxhdE1hcChjID0+IGMudHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyXG5cdFx0XHRcdD8gW2NdXG5cdFx0XHRcdDogYy5jaGlsZHJlbj8uZmlsdGVyKGMgPT4gYy50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpID8/IFtdKSA/PyBbXTtcblx0XHRcdHJldHVybiBzZXJ2ZXJzXG5cdFx0XHRcdC5maWx0ZXIoc2VydmVyID0+IGlzQ3VzdG9taXphdGlvbkVuYWJsZWQoc2VydmVyKSAmJiBzZXJ2ZXIuc3RhdGUua2luZCA9PT0gTWNwU2VydmVyU3RhdHVzLlN0YXJ0aW5nKVxuXHRcdFx0XHQubWFwKChzZXJ2ZXIpOiBJQ2hhdE1jcFN0YXJ0aW5nU2VydmVyID0+ICh7XG5cdFx0XHRcdFx0aWQ6IG9wdHMuc2Vzc2lvblJlc291cmNlLmF1dGhvcml0eSArICcvJyArIHNlcnZlci5pZCxcblx0XHRcdFx0XHRuYW1lOiBzZXJ2ZXIubmFtZSxcblx0XHRcdFx0fSkpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gU3ViYWdlbnQgb2JzZXJ2YXRpb24gY29udGV4dDogZGVkdXBzIHN1YmFnZW50IHRvb2wgY2FsbHMgc28gZWFjaCBpc1xuXHRcdC8vIG9ic2VydmVkIG9uY2UuXG5cdFx0Y29uc3Qgc3ViYWdlbnRDb250ZXh0OiBJU3ViYWdlbnRDb250ZXh0ID0ge1xuXHRcdFx0b2JzZXJ2YXRpb25zOiBzdG9yZS5hZGQobmV3IERpc3Bvc2FibGVNYXAoKSksXG5cdFx0fTtcblxuXHRcdC8vIFBlciByZXNwb25zZSBwYXJ0LiBNYXJrZG93biAvIHJlYXNvbmluZyAvIHRvb2wgY2FsbHMgZWFjaCBnZXQgYVxuXHRcdC8vIGRlZGljYXRlZCBzZXR1cCBrZXllZCBieSB0aGVpciBzdGFibGUgaWQuIFBlci1rZXkgY2xvc3VyZXMgcmVwbGFjZVxuXHRcdC8vIHRoZSBgTWFwPHN0cmluZywgQ2hhdFRvb2xJbnZvY2F0aW9uPmAgYW5kIGBNYXA8c3RyaW5nLCBudW1iZXI+XG5cdFx0Ly8gbGFzdEVtaXR0ZWRMZW5ndGhzYCBib29ra2VlcGluZyB0aGF0IHVzZWQgdG8gbGl2ZSBvbiBldmVyeSBjYWxsXG5cdFx0Ly8gc2l0ZSBvZiBgX3Byb2Nlc3NTZXNzaW9uU3RhdGVgLlxuXHRcdHN0b3JlLmFkZChhdXRvcnVuUGVyS2V5ZWRJdGVtKFxuXHRcdFx0cmVzcG9uc2VQYXJ0cyQsXG5cdFx0XHRycCA9PiBycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsXG5cdFx0XHRcdD8gYHRjOiR7cnAudG9vbENhbGwudG9vbENhbGxJZH1gXG5cdFx0XHRcdDogcnAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93blxuXHRcdFx0XHRcdD8gYG1kOiR7cnAuaWR9YFxuXHRcdFx0XHRcdDogcnAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5SZWFzb25pbmdcblx0XHRcdFx0XHRcdD8gYHJzOiR7cnAuaWR9YFxuXHRcdFx0XHRcdFx0OiBycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLklucHV0UmVxdWVzdFxuXHRcdFx0XHRcdFx0XHQ/IGlucHV0UmVxdWVzdFJlc3BvbnNlUGFydEtleShycClcblx0XHRcdFx0XHRcdFx0OiBgb3RoZXI6JHtyZXNwb25zZVBhcnRzJC5nZXQoKS5pbmRleE9mKHJwKX1gLFxuXHRcdFx0KF9rZXksIHBhcnQkLCBwYXJ0U3RvcmUpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5pdGlhbCA9IHBhcnQkLmdldCgpO1xuXHRcdFx0XHRzd2l0Y2ggKGluaXRpYWwua2luZCkge1xuXHRcdFx0XHRcdGNhc2UgUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93bjpcblx0XHRcdFx0XHRcdC8vIFN1YmFnZW50IG9ic2VydmVycyBkb24ndCBmb3J3YXJkIG1hcmtkb3duIGludG8gdGhlXG5cdFx0XHRcdFx0XHQvLyBwYXJlbnQncyBwcm9ncmVzcyBcdTIwMTQgaXQgYmVsb25ncyB0byB0aGUgc3ViYWdlbnQncyBvd25cblx0XHRcdFx0XHRcdC8vIHNlc3Npb24gdmlldy5cblx0XHRcdFx0XHRcdGlmIChvcHRzLnN1YkFnZW50SW52b2NhdGlvbklkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0aGlzLl9zZXR1cE1hcmtkb3duUGFydChwYXJ0JCBhcyBJT2JzZXJ2YWJsZTxNYXJrZG93blJlc3BvbnNlUGFydD4sIHBhcnRTdG9yZSwgb3B0cyk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nOlxuXHRcdFx0XHRcdFx0aWYgKG9wdHMuc3ViQWdlbnRJbnZvY2F0aW9uSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRoaXMuX3NldHVwUmVhc29uaW5nUGFydChwYXJ0JCBhcyBJT2JzZXJ2YWJsZTxSZWFzb25pbmdSZXNwb25zZVBhcnQ+LCBwYXJ0U3RvcmUsIG9wdHMpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsOlxuXHRcdFx0XHRcdFx0dGhpcy5fc2V0dXBUb29sQ2FsbFBhcnQocGFydCQgYXMgSU9ic2VydmFibGU8VG9vbENhbGxSZXNwb25zZVBhcnQ+LCBwYXJ0U3RvcmUsIG9wdHMsIHN1YmFnZW50Q29udGV4dCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIFJlc3BvbnNlUGFydEtpbmQuSW5wdXRSZXF1ZXN0OlxuXHRcdFx0XHRcdFx0aWYgKG9wdHMuc3ViQWdlbnRJbnZvY2F0aW9uSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9zZXR1cElucHV0UmVxdWVzdFBhcnQocGFydCQgYXMgSU9ic2VydmFibGU8SW5wdXRSZXF1ZXN0UmVzcG9uc2VQYXJ0PiwgcGFydFN0b3JlLCBvcHRzKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgUmVzcG9uc2VQYXJ0S2luZC5TeXN0ZW1Ob3RpZmljYXRpb246XG5cdFx0XHRcdFx0XHQvLyBTeXN0ZW0gbm90aWZpY2F0aW9ucyBkb24ndCBoYXZlIGFuIGlkLCBzbyB3ZSBoYXZlIHRvIGlkZW50aWZ5IGl0IGJ5IGluZGV4XG5cdFx0XHRcdFx0XHRpZiAocmVzcG9uc2VQYXJ0cyQuZ2V0KCkuaW5kZXhPZihpbml0aWFsKSA+PSAob3B0cy5pbml0aWFsUmVzcG9uc2VQYXJ0Q291bnQgPz8gMCkgJiYgb3B0cy5zdWJBZ2VudEludm9jYXRpb25JZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHByb2dyZXNzID0gc3lzdGVtTm90aWZpY2F0aW9uVG9DaGF0UGFydChpbml0aWFsLmNvbnRlbnQsIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5LCBpbml0aWFsLl9tZXRhKTtcblx0XHRcdFx0XHRcdFx0aWYgKHByb2dyZXNzKSB7XG5cdFx0XHRcdFx0XHRcdFx0b3B0cy5zaW5rKFtwcm9ncmVzc10pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHQpKTtcblxuXHRcdC8vIFBlci10dXJuIGFkanVuY3RzIHNraXBwZWQgZm9yIHN1YmFnZW50IG9ic2VydmVycy5cblx0XHRpZiAob3B0cy5zdWJBZ2VudEludm9jYXRpb25JZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRsZXQgbGFzdFVzYWdlOiBSZXR1cm5UeXBlPHR5cGVvZiB1c2FnZUluZm9Ub0NoYXRVc2FnZT47XG5cdFx0XHRsZXQgbGFzdEF1dG9Nb2RlUmVzb2x1dGlvbjogSUNoYXRBdXRvTW9kZVJlc29sdXRpb25QYXJ0IHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgbW9kZWxMb29rdXAgPSB0aGlzLl9jcmVhdGVUdXJuTW9kZWxMb29rdXAob3B0cy5zZXNzaW9uUmVzb3VyY2UsIHVuZGVmaW5lZCk7XG5cblx0XHRcdHRoaXMuX3NldHVwTWNwQXV0aFByb21wdChtY3BBdXRoUmVxdWlyZWQkLCBzdG9yZSwgb3B0cyk7XG5cblx0XHRcdC8vIFN1cmZhY2UgdGhlIGhvc3QncyBjaGF0IGFjdGl2aXR5IFx1MjAxNCBlLmcuIHRoZSBsaXZlIFwiQ3JlYXRpbmdcblx0XHRcdC8vIGlzb2xhdGVkIHdvcmt0cmVlICg0MiUpXCIgcHJvZ3Jlc3MgcmVwb3J0ZWQgd2hpbGUgdGhlIHNlc3Npb24nc1xuXHRcdFx0Ly8gd29ya3RyZWUgaXMgYmVpbmcgY3JlYXRlZCBcdTIwMTQgaW5zdGVhZCBvZiB0aGUgZ2VuZXJpYyB3b3JraW5nXG5cdFx0XHQvLyBwbGFjZWhvbGRlciB0aGUgd2lkZ2V0IHdvdWxkIG90aGVyd2lzZSBzaG93LiBSZXN0cmljdGVkIHRvIHRoZVxuXHRcdFx0Ly8gd2luZG93IGJlZm9yZSB0aGUgYWdlbnQgcHJvZHVjZXMgYW55IGNvbnRlbnQsIHNpbmNlIGZyb20gdGhlbiBvblxuXHRcdFx0Ly8gaXRzIG93biBwYXJ0cyB0ZWxsIHRoZSBzdG9yeS4gVGhlIHN0YWJsZSBpZCBtYWtlcyBlYWNoIHVwZGF0ZVxuXHRcdFx0Ly8gcmVwbGFjZSB0aGUgcHJldmlvdXMgcm93IHJhdGhlciB0aGFuIHN0YWNrIGFub3RoZXIgb25lLCBhbmQgdGhlXG5cdFx0XHQvLyByb3cgaGlkZXMgaXRzZWxmIGFzIHNvb24gYXMgcmVhbCBjb250ZW50IGZvbGxvd3MgaXQuXG5cdFx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBhY3Rpdml0eSA9IGNoYXRTdGF0ZSQucmVhZChyZWFkZXIpPy5hY3Rpdml0eTtcblx0XHRcdFx0aWYgKCFhY3Rpdml0eSB8fCByZXNwb25zZVBhcnRzJC5yZWFkKHJlYWRlcikubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRvcHRzLnNpbmsoW3tcblx0XHRcdFx0XHRraW5kOiAncHJvZ3Jlc3NNZXNzYWdlJyxcblx0XHRcdFx0XHRpZDogQ0hBVF9BQ1RJVklUWV9QUk9HUkVTU19JRCxcblx0XHRcdFx0XHRjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KGFjdGl2aXR5KSxcblx0XHRcdFx0XHRzaGltbWVyOiB0cnVlLFxuXHRcdFx0XHR9XSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc29sdXRpb24gPSBtb2RlbExvb2t1cC50b0F1dG9Nb2RlUmVzb2x1dGlvbj8uKHVzYWdlJC5yZWFkKHJlYWRlcikpO1xuXHRcdFx0XHRpZiAoIXJlc29sdXRpb24gfHwgZXF1YWxzKGxhc3RBdXRvTW9kZVJlc29sdXRpb24sIHJlc29sdXRpb24pKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxhc3RBdXRvTW9kZVJlc29sdXRpb24gPSByZXNvbHV0aW9uO1xuXHRcdFx0XHRvcHRzLnNpbmsoW3Jlc29sdXRpb25dKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0Ly8gU3VyZmFjZSBhIFwiU3RhcnRpbmcgTUNQIHNlcnZlcnMgXHUyMDI2XCIgcHJvZ3Jlc3MgaGludCB3aGVuIHNlcnZlcnNcblx0XHRcdC8vIHJlbWFpbiBpbiB0aGUgYFN0YXJ0aW5nYCBzdGF0ZSBwYXN0IGEgc2hvcnQgZ3JhY2UgcGVyaW9kIGFmdGVyIHRoZVxuXHRcdFx0Ly8gdHVybiBiZWdpbnMgd2l0aG91dCBhbnkgY29udGVudCBhcnJpdmluZyBmcm9tIHRoZSBob3N0LiBUaGUgcGFydFxuXHRcdFx0Ly8gdXBkYXRlcyBhcyBzZXJ2ZXJzIGZpbmlzaCBhbmQgaGlkZXMgb25jZSBldmVyeSBzZXJ2ZXIgaGFzIHN0YXJ0ZWQsXG5cdFx0XHQvLyBjb250ZW50IHN0YXJ0cyBiZWluZyByZWNlaXZlZCwgb3IgdGhlIHR1cm4gZW5kcyBcdTIwMTQgd2hpY2hldmVyIGNvbWVzXG5cdFx0XHQvLyBmaXJzdC4gSXQgY2FycmllcyBubyBpbnRlcmFjdGl2ZSBhZmZvcmRhbmNlIChubyBcIlNraXBcIikuXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IE1DUF9TVEFSVElOR19HUkFDRV9NUyA9IDUwMDA7XG5cblx0XHRcdFx0bGV0IGRpZEFwcGVuZCA9IGZhbHNlO1xuXHRcdFx0XHRjb25zdCBoYXNDb250ZW50JCA9IHJlc3BvbnNlUGFydHMkLm1hcChyID0+IHIubGVuZ3RoID4gMCk7XG5cdFx0XHRcdGNvbnN0IGhhc1NlcnZlcnNTdGFydGluZyQgPSBtY3BTdGFydGluZyQubWFwKHMgPT4gcy5sZW5ndGggPiAwKTtcblx0XHRcdFx0Y29uc3Qgc2VydmVyc1N0YXJ0aW5nSW5wdXQgPSBvYnNlcnZhYmxlVmFsdWUoJ21jcFN0YXJ0aW5nU2VydmVyc0lucHV0JywgY29uc3RPYnNlcnZhYmxlPElDaGF0TWNwU3RhcnRpbmdTZXJ2ZXJbXT4oW10pKTtcblxuXHRcdFx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRcdGlmIChoYXNDb250ZW50JC5yZWFkKHJlYWRlcikgfHwgIWhhc1NlcnZlcnNTdGFydGluZyQucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdFx0XHRzZXJ2ZXJzU3RhcnRpbmdJbnB1dC5zZXQoY29uc3RPYnNlcnZhYmxlKFtdKSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZWFkZXIuc3RvcmUuYWRkKGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRcdHNlcnZlcnNTdGFydGluZ0lucHV0LnNldChtY3BTdGFydGluZyQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHRpZiAoIWRpZEFwcGVuZCkge1xuXHRcdFx0XHRcdFx0XHRkaWRBcHBlbmQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRvcHRzLnNpbmsoW3tcblx0XHRcdFx0XHRcdFx0XHRraW5kOiAnbWNwU2VydmVyc1N0YXJ0aW5nU2xvdycsXG5cdFx0XHRcdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBvcHRzLnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0XHRcdFx0XHRzZXJ2ZXJzOiBzZXJ2ZXJzU3RhcnRpbmdJbnB1dC5tYXAoKG8sIHIpID0+IG8ucmVhZChyKSksXG5cdFx0XHRcdFx0XHRcdH1dKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdH0sIE1DUF9TVEFSVElOR19HUkFDRV9NUykpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBzZXJ2ZXJzU3RhcnRpbmdJbnB1dC5zZXQoY29uc3RPYnNlcnZhYmxlKFtdKSwgdW5kZWZpbmVkKSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCByYXdVc2FnZSA9IHVzYWdlJC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdC8vIFRoZSBwYXJlbnQgdHVybidzIHVzYWdlIGFscmVhZHkgYWdncmVnYXRlcyB0aGUgcGFyZW50IGFnZW50J3Ncblx0XHRcdFx0Ly8gY2FsbHMgcGx1cyBldmVyeSBzdWJhZ2VudCdzIGNhbGxzICh0aGUgYWdlbnQgaG9zdCBmb2xkc1xuXHRcdFx0XHQvLyBzdWJhZ2VudCB1c2FnZSBpbnRvIHRoZSBwYXJlbnQgdHVybiB1bmRlciBzY29wZSBgJydgKSwgc28gaXQgaXNcblx0XHRcdFx0Ly8gZW1pdHRlZCBhcy1pcyBcdTIwMTQgbm8gc2VwYXJhdGUgcmUtYWdncmVnYXRpb24gb2Ygc3ViYWdlbnQgY3JlZGl0cy5cblx0XHRcdFx0Y29uc3QgdXNhZ2UgPSB1c2FnZUluZm9Ub0NoYXRVc2FnZShyYXdVc2FnZSwgbW9kZWxMb29rdXAudG9Nb2RlbERpc3BsYXlOYW1lKTtcblx0XHRcdFx0aWYgKCF1c2FnZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBDYXJyeSB0aHJvdWdoIHRoZSBhY3R1YWwgbW9kZWwgc28gdGhlIGNvbnRleHQtdXNhZ2Ugd2lkZ2V0XG5cdFx0XHRcdC8vIGNhbiBsb29rIHVwIGNvbnRleHQgd2luZG93IG1ldGFkYXRhIHdoZW4gdGhlIHJlcXVlc3QtbGV2ZWxcblx0XHRcdFx0Ly8gbW9kZWwgKGUuZy4gXCJhdXRvXCIpIGRvZXNuJ3QgZXhwb3NlIG9uZS5cblx0XHRcdFx0Y29uc3QgYWN0dWFsTW9kZWxJZCA9IHRoaXMuX3RvTGFuZ3VhZ2VNb2RlbElkKG9wdHMuc2Vzc2lvblJlc291cmNlLCByYXdVc2FnZT8ubW9kZWwpO1xuXHRcdFx0XHRpZiAoYWN0dWFsTW9kZWxJZCkge1xuXHRcdFx0XHRcdHVzYWdlLmFjdHVhbE1vZGVsSWQgPSBhY3R1YWxNb2RlbElkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChsYXN0VXNhZ2Vcblx0XHRcdFx0XHQmJiBsYXN0VXNhZ2UucHJvbXB0VG9rZW5zID09PSB1c2FnZS5wcm9tcHRUb2tlbnNcblx0XHRcdFx0XHQmJiBsYXN0VXNhZ2UuY29tcGxldGlvblRva2VucyA9PT0gdXNhZ2UuY29tcGxldGlvblRva2Vuc1xuXHRcdFx0XHRcdCYmIGxhc3RVc2FnZS5vdXRwdXRCdWZmZXIgPT09IHVzYWdlLm91dHB1dEJ1ZmZlclxuXHRcdFx0XHRcdCYmIGxhc3RVc2FnZS5jb3BpbG90Q3JlZGl0cyA9PT0gdXNhZ2UuY29waWxvdENyZWRpdHNcblx0XHRcdFx0XHQmJiBsYXN0VXNhZ2Uuc2Vzc2lvbkNvcGlsb3RDcmVkaXRzID09PSB1c2FnZS5zZXNzaW9uQ29waWxvdENyZWRpdHNcblx0XHRcdFx0XHQmJiBlcXVhbHMobGFzdFVzYWdlLnByb21wdFRva2VuRGV0YWlscywgdXNhZ2UucHJvbXB0VG9rZW5EZXRhaWxzKVxuXHRcdFx0XHRcdC8vIEEgc3ViYWdlbnQncyBjYWxsIGxlYXZlcyB0aGUgcGFyZW50J3Mgb3duIHRva2VuIGNvdW50cyB1bmNoYW5nZWQsIHNvXG5cdFx0XHRcdFx0Ly8gd2l0aG91dCBjb21wYXJpbmcgdGhlIHdob2xlLXR1cm4gdG90YWxzIGl0cyBjb250cmlidXRpb24gbmV2ZXIgbGFuZHMuXG5cdFx0XHRcdFx0JiYgZXF1YWxzKGxhc3RVc2FnZS5tb2RlbFRvdGFscywgdXNhZ2UubW9kZWxUb3RhbHMpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxhc3RVc2FnZSA9IHVzYWdlO1xuXHRcdFx0XHRvcHRzLnNpbmsoW3VzYWdlXSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIFN1cmZhY2UgdGhlIGFjY291bnQgcXVvdGEgc25hcHNob3RzIHRoZSBhZ2VudCBob3N0IHJlcG9ydHMgb24gZWFjaCBtb2RlbC1jYWxsIHVzYWdlIGV2ZW50XG5cdFx0XHQvLyBpbnRvIHRoZSBlbnRpdGxlbWVudCBzZXJ2aWNlLCBrZWVwaW5nIHRoZSBxdW90YSBVSSBjdXJyZW50IGZvciBhZ2VudC1ob3N0IHNlc3Npb25zIChtaXJyb3JzXG5cdFx0XHQvLyB0aGUgZXh0ZW5zaW9uLWhvc3QgQ0xJIHBhdGgpLiBgYWNjZXB0UXVvdGFzYCByZXBsYWNlcyB0b3AtbGV2ZWwgc3RhdGUgYW5kIG1lcmdlcyBmaWVsZHNcblx0XHRcdC8vIHdpdGhpbiBlYWNoIHByb3ZpZGVkIGNhdGVnb3J5IHNuYXBzaG90LlxuXHRcdFx0bGV0IGxhc3RRdW90YVNpZ25hdHVyZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgcXVvdGFVcGRhdGUgPSB1c2FnZUluZm9Ub1F1b3Rhcyh1c2FnZSQucmVhZChyZWFkZXIpKTtcblx0XHRcdFx0aWYgKCFxdW90YVVwZGF0ZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzaWduYXR1cmUgPSBKU09OLnN0cmluZ2lmeShxdW90YVVwZGF0ZSk7XG5cdFx0XHRcdGlmIChzaWduYXR1cmUgPT09IGxhc3RRdW90YVNpZ25hdHVyZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRsYXN0UXVvdGFTaWduYXR1cmUgPSBzaWduYXR1cmU7XG5cdFx0XHRcdHRoaXMuX2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuYWNjZXB0UXVvdGFzKHtcblx0XHRcdFx0XHQuLi50aGlzLl9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnF1b3Rhcyxcblx0XHRcdFx0XHQuLi5xdW90YVVwZGF0ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KSk7XG5cblx0XHR9XG5cblx0XHQvLyBGb3Igc3ViYWdlbnQgb2JzZXJ2ZXJzOiBhY2N1bXVsYXRlIGNvcGlsb3QgY3JlZGl0cyBmcm9tIGNoaWxkIHR1cm5zXG5cdFx0Ly8gaW50byB0aGUgcGFyZW50J3MgYWNjdW11bGF0b3Igc28gdGhlIHNlc3Npb24gY29zdCBpbmNsdWRlcyB0aGVtLCBhbmRcblx0XHQvLyBzdXJmYWNlIHRoZSBwZXItc3ViYWdlbnQgdG90YWwgb24gaXRzIHRvb2wgaG92ZXIuXG5cdFx0Ly9cblx0XHQvLyBOT1RFOiB0aGlzIGRlcGVuZHMgb24gdGhlIGFnZW50IGhvc3QgcmVwb3J0aW5nIHVzYWdlIG9uIHRoZSBzdWJhZ2VudCdzXG5cdFx0Ly8gb3duIGNoaWxkIHR1cm5zLiBTb21lIGhvc3RzIChlLmcuIGNvcGlsb3RjbGkpIGluc3RlYWQgYnVuZGxlIGFcblx0XHQvLyBzdWJhZ2VudCdzIG1vZGVsLWNhbGwgY29zdCBpbnRvIHRoZSAqcGFyZW50KiB0dXJuJ3MgdXNhZ2UgYW5kIGxlYXZlIHRoZVxuXHRcdC8vIGNoaWxkIHR1cm4ncyB1c2FnZSBlbXB0eTsgZm9yIHRob3NlIHRoaXMgb2JzZXJ2ZXIgc3RheXMgaW5lcnQgYW5kIHRoZVxuXHRcdC8vIHN1YmFnZW50J3MgY29zdCBpcyBzdGlsbCByZWZsZWN0ZWQgaW4gdGhlIG92ZXJhbGwgc2Vzc2lvbiBjb3N0IHZpYSB0aGVcblx0XHQvLyBwYXJlbnQgdHVybi4gVGhlIHdpcmluZyBsaWdodHMgdXAgYXV0b21hdGljYWxseSBmb3IgaG9zdHMgdGhhdCBkb1xuXHRcdC8vIHJlcG9ydCBjaGlsZC10dXJuIHVzYWdlLlxuXHRcdGlmIChvcHRzLnN1YkFnZW50SW52b2NhdGlvbklkICE9PSB1bmRlZmluZWQgJiYgb3B0cy5zdWJBZ2VudENyZWRpdHNBY2N1bXVsYXRvcikge1xuXHRcdFx0Y29uc3QgYWNjdW11bGF0b3IgPSBvcHRzLnN1YkFnZW50Q3JlZGl0c0FjY3VtdWxhdG9yO1xuXHRcdFx0bGV0IGxhc3RDcmVkaXRzID0gMDtcblx0XHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHJhd1VzYWdlID0gdXNhZ2UkLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgY3JlZGl0cyA9IHVzYWdlSW5mb1RvQ2hhdFVzYWdlKHJhd1VzYWdlKT8uY29waWxvdENyZWRpdHM7XG5cdFx0XHRcdGlmICh0eXBlb2YgY3JlZGl0cyA9PT0gJ251bWJlcicgJiYgY3JlZGl0cyAhPT0gbGFzdENyZWRpdHMpIHtcblx0XHRcdFx0XHRjb25zdCBkZWx0YSA9IGNyZWRpdHMgLSBsYXN0Q3JlZGl0cztcblx0XHRcdFx0XHRsYXN0Q3JlZGl0cyA9IGNyZWRpdHM7XG5cdFx0XHRcdFx0aWYgKGRlbHRhID4gMCkge1xuXHRcdFx0XHRcdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHRcdFx0XHRhY2N1bXVsYXRvci5zZXQoYWNjdW11bGF0b3IucmVhZCh1bmRlZmluZWQpICsgZGVsdGEsIHR4KTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIEZvciBzdWJhZ2VudCBvYnNlcnZlcnM6IHN1cmZhY2UgdGhlIGxhbmd1YWdlIG1vZGVsIHRoaXMgc3ViYWdlbnQgcmFuXG5cdFx0Ly8gb24gc28gaXQgY2FuIGJlIHNob3duIG9uIHRoZSBzdWJhZ2VudCB0b29sJ3MgaG92ZXIuIExpa2UgdGhlIGNyZWRpdHNcblx0XHQvLyBvYnNlcnZlciBhYm92ZSwgdGhpcyBkZXBlbmRzIG9uIHRoZSBob3N0IHJlcG9ydGluZyB0aGUgbW9kZWwgb24gdGhlXG5cdFx0Ly8gc3ViYWdlbnQncyBvd24gY2hpbGQgdHVybnMgKGhvc3RzIHRoYXQgYnVuZGxlIGludG8gdGhlIHBhcmVudCB0dXJuXG5cdFx0Ly8gbGVhdmUgdGhpcyBlbXB0eSkuXG5cdFx0aWYgKG9wdHMuc3ViQWdlbnRJbnZvY2F0aW9uSWQgIT09IHVuZGVmaW5lZCAmJiBvcHRzLnN1YkFnZW50TW9kZWxPYnNlcnZhYmxlKSB7XG5cdFx0XHRjb25zdCBtb2RlbE9ic2VydmFibGUgPSBvcHRzLnN1YkFnZW50TW9kZWxPYnNlcnZhYmxlO1xuXHRcdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgcmF3VXNhZ2UgPSB1c2FnZSQucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBtb2RlbElkID0gdGhpcy5fdG9MYW5ndWFnZU1vZGVsSWQob3B0cy5zZXNzaW9uUmVzb3VyY2UsIHJhd1VzYWdlPy5tb2RlbCk7XG5cdFx0XHRcdGNvbnN0IG1vZGVsTmFtZSA9IHRoaXMuX2dldExhbmd1YWdlTW9kZWxEaXNwbGF5TmFtZShtb2RlbElkKTtcblx0XHRcdFx0aWYgKG1vZGVsTmFtZSAmJiBtb2RlbE5hbWUgIT09IG1vZGVsT2JzZXJ2YWJsZS5yZWFkKHVuZGVmaW5lZCkpIHtcblx0XHRcdFx0XHR0cmFuc2FjdGlvbih0eCA9PiBtb2RlbE9ic2VydmFibGUuc2V0KG1vZGVsTmFtZSwgdHgpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblxuXHRcdC8vIERldGVjdCB0ZXJtaW5hbCB0dXJuIHN0YXRlLiBUaGUgdHVybiBpcyBvdmVyIHdoZW4gdGhlIGFjdGl2ZSB0dXJuXG5cdFx0Ly8gaWQgbm8gbG9uZ2VyIG1hdGNoZXMgb3VyIHR1cm4gaWQ7IHRoZSBjb21wbGV0ZWQgdHVybiAoaWYgcHJlc2VudFxuXHRcdC8vIGluIGB0dXJuc2ApIHN1cmZhY2VzIGFueSBlcnJvciBtZXNzYWdlLlxuXHRcdC8vXG5cdFx0Ly8gYHNlZW5BY3RpdmVgIGd1YXJkcyBhZ2FpbnN0IGZpcmluZyBgZmluaXNoYCBvbiB0aGUgaW5zdGFsbCBwYXNzOlxuXHRcdC8vIGBfaGFuZGxlVHVybmAgY2FsbHMgdXMgcmlnaHQgYWZ0ZXIgZGlzcGF0Y2hpbmcgYENoYXRUdXJuU3RhcnRlZGBcblx0XHQvLyBidXQgYmVmb3JlIHRoZSBhY3Rpb24gaGFzIGJlZW4gZWNob2VkIGJhY2ssIHNvIHRoZSB2ZXJ5IGZpcnN0XG5cdFx0Ly8gcmVhZGluZyBvZiBzdGF0ZSBtYXkgbm90IHlldCBjb250YWluIG91ciB0dXJuLiBXZSBtdXN0IHdhaXQgdW50aWxcblx0XHQvLyB3ZSd2ZSBzZWVuIG91ciB0dXJuIGJlY29tZSBhY3RpdmUgYXQgbGVhc3Qgb25jZSBiZWZvcmUgdHJlYXRpbmdcblx0XHQvLyBpdHMgYWJzZW5jZSBhcyBhIHRlcm1pbmFsIHRyYW5zaXRpb24uXG5cdFx0bGV0IHRlcm1pbmF0ZWQgPSBmYWxzZTtcblx0XHRsZXQgc2VlbkFjdGl2ZSA9IGZhbHNlO1xuXHRcdGNvbnN0IGZpbmlzaCA9IChsYXN0VHVybjogVHVybiB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0aWYgKHRlcm1pbmF0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGVybWluYXRlZCA9IHRydWU7XG5cdFx0XHQvLyBEZWZlciB0byBhIG1pY3JvdGFzayBzbyBhbnkgb3RoZXIgYXV0b3J1bnMgcmVhY3RpbmcgdG8gdGhlXG5cdFx0XHQvLyBzYW1lIHN0YXRlIHVwZGF0ZSAoZS5nLiB0b29sIGNhbGwgZmluYWxpemF0aW9uKSBmaW5pc2ggZmlyc3QuXG5cdFx0XHQvLyBTZWxmLWRpc3Bvc2UgYWZ0ZXJ3YXJkcyBzbyBjYWxsZXJzIGRvIG5vdCBuZWVkIHRvIHRyYWNrIHVzXG5cdFx0XHQvLyBhY3Jvc3MgdGhlIG5hdHVyYWwtY29tcGxldGlvbiBwYXRoOyBjYW5jZWxsYXRpb24gcGF0aHMgY2FuXG5cdFx0XHQvLyBzdGlsbCBjYWxsIGBkaXNwb3NlKClgIHByb2FjdGl2ZWx5IChpZGVtcG90ZW50KS5cblx0XHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRvcHRzLm9uVHVybkVuZGVkPy4obGFzdFR1cm4pO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fTtcblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0aWYgKHRlcm1pbmF0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBtZXJnZWRTdGF0ZSQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoc3RhdGUuYWN0aXZlVHVybj8uaWQgPT09IG9wdHMudHVybklkKSB7XG5cdFx0XHRcdHNlZW5BY3RpdmUgPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBBbHNvIHRyZWF0IGEgY29tcGxldGVkIHR1cm4gd2UgZGlzY292ZXIgaW4gYHR1cm5zYCBhc1xuXHRcdFx0Ly8gXCJoYXZpbmcgc2VlbiBpdFwiLCBzbyByZWNvbm5lY3QgLyBzZXJ2ZXItaW5pdGlhdGVkIHBhdGhzIHRoYXRcblx0XHRcdC8vIGluc3RhbGwgdXMgYWdhaW5zdCBhbiBhbHJlYWR5LWNvbXBsZXRlZCB0dXJuIHN0aWxsIGZpbmlzaC5cblx0XHRcdGNvbnN0IGxhc3RUdXJuID0gc3RhdGUudHVybnMuZmluZCh0ID0+IHQuaWQgPT09IG9wdHMudHVybklkKTtcblx0XHRcdGlmIChsYXN0VHVybikge1xuXHRcdFx0XHRzZWVuQWN0aXZlID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdGlmICghc2VlbkFjdGl2ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIW9wdHMuc3VwcHJlc3NFcnJvck1hcmtkb3duICYmIGxhc3RUdXJuPy5zdGF0ZSA9PT0gVHVyblN0YXRlLkVycm9yICYmIGxhc3RUdXJuLmVycm9yKSB7XG5cdFx0XHRcdGNvbnN0IGZvcndhcmRlZCA9IGdldENoYXRFcnJvckRldGFpbHNGcm9tTWV0YShsYXN0VHVybi5lcnJvciwgdGhpcy5fY2hhdEVycm9yQ29udGV4dCgpKTtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IGZvcndhcmRlZFxuXHRcdFx0XHRcdD8gbmV3IE1hcmtkb3duU3RyaW5nKGBcXG5cXG4ke2ZvcndhcmRlZC5tZXNzYWdlfWApXG5cdFx0XHRcdFx0OiBuZXcgTWFya2Rvd25TdHJpbmcoYFxcblxcbkVycm9yOiAoJHtsYXN0VHVybi5lcnJvci5lcnJvclR5cGV9KSAke2xhc3RUdXJuLmVycm9yLm1lc3NhZ2V9YCk7XG5cdFx0XHRcdG9wdHMuc2luayhbeyBraW5kOiAnbWFya2Rvd25Db250ZW50JywgY29udGVudCB9XSk7XG5cdFx0XHR9XG5cdFx0XHRmaW5pc2gobGFzdFR1cm4pO1xuXHRcdH0pKTtcblxuXHRcdHN0b3JlLmFkZChvcHRzLmNhbmNlbGxhdGlvblRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdC8vIE9uIGNhbmNlbGxhdGlvbiB0aGUgcHJvdG9jb2wgdHVybiBoYXMgbm90IGJlZW4gZmluYWxpemVkIHlldFxuXHRcdFx0Ly8gKHRoZSBgQ2hhdFR1cm5DYW5jZWxsZWRgIGRpc3BhdGNoIHJvdW5kLXRyaXBzIGFzeW5jaHJvbm91c2x5KSwgc29cblx0XHRcdC8vIHJlc29sdmUgd2l0aCB0aGUgY3VycmVudCB0dXJuIHJhdGhlciB0aGFuIGB1bmRlZmluZWRgLiBUaGlzIGtlZXBzXG5cdFx0XHQvLyB0aGUgdHVybidzIGFjY3VtdWxhdGVkIGB1c2FnZWAgc28gdGhlIHJlc3BvbnNlIGZvb3RlciBzdGlsbCBzaG93c1xuXHRcdFx0Ly8gdGhlIG1vZGVsIGFuZCB0aGUgY3JlZGl0cyBjb25zdW1lZCBiZWZvcmUgdGhlIGludGVycnVwdGlvbi5cblx0XHRcdC8vIE1hcmsgaXQgYENhbmNlbGxlZGAgc28gZXJyb3ItZGV0YWlsIGV4dHJhY3Rpb24gdHJlYXRzIGl0IGFzIGFcblx0XHRcdC8vIG5vbi1lcnJvciB0ZXJtaW5hbCB0dXJuIChhbiBhbHJlYWR5LWZpbmFsaXplZCB0dXJuIGtlZXBzIGl0cyBvd25cblx0XHRcdC8vIHN0YXRlKS5cblx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0dXJuJC5nZXQoKTtcblx0XHRcdGZpbmlzaChjdXJyZW50ID8geyBzdGF0ZTogVHVyblN0YXRlLkNhbmNlbGxlZCwgLi4uY3VycmVudCB9IDogdW5kZWZpbmVkKTtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gc3RvcmU7XG5cdH1cblxuXHQvKipcblx0ICogU3VyZmFjZXMgdGhlIFwiTUNQIHNlcnZlciBcdTIwMjYgcmVxdWlyZXMgYXV0aGVudGljYXRpb25cIiBwcm9tcHQgZm9yIGEgdHVybi5cblx0ICpcblx0ICogRWFjaCBzZXJ2ZXIgaXMgcHJvbXB0ZWQgYXQgbW9zdCBvbmNlIHBlciBjb252ZXJzYXRpb246IHtAbGluayBtY3BBdXRoUmVxdWlyZWQkfVxuXHQgKiBpcyBzZXNzaW9uLXdpZGUsIHNvIHdpdGhvdXQgdGhpcyBndWFyZCB0aGUgcHJvbXB0IHdvdWxkIHJlcGVhdCBvbiBldmVyeVxuXHQgKiBtZXNzYWdlLiBUaGUgcGVyLXNlc3Npb24ge0BsaW5rIF9zdXJmYWNlZE1jcEF1dGhTZXJ2ZXJzIHN1cmZhY2VkIHNldH0gdHJhY2tzXG5cdCAqIHdoaWNoIHNlcnZlcnMgd2VyZSBhbHJlYWR5IHByb21wdGVkOyBpdCBpcyBwcnVuZWQgYnlcblx0ICoge0BsaW5rIF9yZWNvbmNpbGVTdXJmYWNlZE1jcEF1dGhTZXJ2ZXJzfSBvbmNlIGEgc2VydmVyIHJlYWNoZXMgdGhlIHJ1bm5pbmdcblx0ICogc3RhdGUsIHNvIGEgc2VydmVyIHRoYXQgaXMgcmUtcmVxdWlyZWQgYWZ0ZXIgYmVpbmcgYXV0aGVudGljYXRlZCAoZS5nLlxuXHQgKiBhZnRlciBhIHJlc3RhcnQpIHByb21wdHMgYWdhaW4uXG5cdCAqXG5cdCAqIFRoZSBlbWl0dGVkIHBhcnQgbGlzdHMgb25seSB0aGUgc2VydmVycyBpdCBpbnRyb2R1Y2VkIGFuZCBzaHJpbmtzIGFzIHRoZXlcblx0ICogYXV0aGVudGljYXRlLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2V0dXBNY3BBdXRoUHJvbXB0KFxuXHRcdG1jcEF1dGhSZXF1aXJlZCQ6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElDaGF0TWNwQXV0aGVudGljYXRpb25SZXF1aXJlZFNlcnZlcltdPixcblx0XHRzdG9yZTogRGlzcG9zYWJsZVN0b3JlLFxuXHRcdG9wdHM6IElPYnNlcnZlVHVybk9wdGlvbnMsXG5cdCk6IHZvaWQge1xuXHRcdGxldCBwYXJ0OiBJQ2hhdE1jcEF1dGhlbnRpY2F0aW9uUmVxdWlyZWQgJiB7IHNlcnZlcnM6IElTZXR0YWJsZU9ic2VydmFibGU8SUNoYXRNY3BBdXRoZW50aWNhdGlvblJlcXVpcmVkU2VydmVyW10+IH0gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IG93bmVkSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0bGV0IHJ1bklkID0gMDtcblxuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBwZW5kaW5nQXV0aCA9IG1jcEF1dGhSZXF1aXJlZCQucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgY3VycmVudFJ1bklkID0gKytydW5JZDtcblx0XHRcdHRoaXMuX2ZpbHRlckF1dG9HcmFudGVkTWNwQXV0aGVudGljYXRpb24ob3B0cy5zZXNzaW9uUmVzb3VyY2UsIHBlbmRpbmdBdXRoKS50aGVuKHNlcnZlcnMgPT4ge1xuXHRcdFx0XHQvLyBJZ25vcmUgc3RhbGUgY29tcGxldGlvbnM6IGEgbmV3ZXIgcnVuIGhhcyBzdXBlcnNlZGVkIHRoaXMgb25lXG5cdFx0XHRcdC8vIChndWFyZHMgYWdhaW5zdCBvdXQtb2Ytb3JkZXIgcmVzb2x1dGlvbiBvZiB0aGUgYXN5bmMgZmlsdGVyKS5cblx0XHRcdFx0aWYgKGN1cnJlbnRSdW5JZCAhPT0gcnVuSWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgc3VyZmFjZWQgPSB0aGlzLl9nZXRTdXJmYWNlZE1jcEF1dGhTZXJ2ZXJzKG9wdHMuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0Y29uc3QgbmV3U2VydmVycyA9IHNlcnZlcnMuZmlsdGVyKHNlcnZlciA9PiAhc3VyZmFjZWQuaGFzKHNlcnZlci5pZCkpO1xuXHRcdFx0XHQvLyBOb3RoaW5nIG5ldyB0byBwcm9tcHQgYW5kIG5vIGxpdmUgcHJvbXB0IHRvIHVwZGF0ZS9oaWRlLlxuXHRcdFx0XHRpZiAoIW5ld1NlcnZlcnMubGVuZ3RoICYmICghcGFydCB8fCBwYXJ0LmlzVXNlZCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFwYXJ0IHx8IHBhcnQuaXNVc2VkKSB7XG5cdFx0XHRcdFx0b3duZWRJZHMgPSBuZXcgU2V0KCk7XG5cdFx0XHRcdFx0cGFydCA9IHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdtY3BBdXRoZW50aWNhdGlvblJlcXVpcmVkJyxcblx0XHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogb3B0cy5zZXNzaW9uUmVzb3VyY2UudG9KU09OKCksXG5cdFx0XHRcdFx0XHRpc1VzZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdFx0c2VydmVyczogb2JzZXJ2YWJsZVZhbHVlKCdtY3BBdXRoTmVlZGVkU2VydmVycycsIFtdKSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdG9wdHMuc2luayhbcGFydF0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIG5ld1NlcnZlcnMpIHtcblx0XHRcdFx0XHRzdXJmYWNlZC5hZGQoc2VydmVyLmlkKTtcblx0XHRcdFx0XHRvd25lZElkcy5hZGQoc2VydmVyLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRwYXJ0LnNlcnZlcnMuc2V0KHNlcnZlcnMuZmlsdGVyKHNlcnZlciA9PiBvd25lZElkcy5oYXMoc2VydmVyLmlkKSksIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgbXV0YWJsZSBzZXQgb2YgTUNQIHNlcnZlciBpZHMgYWxyZWFkeSBzdXJmYWNlZCBmb3Jcblx0ICogYXV0aGVudGljYXRpb24gaW4gdGhlIGdpdmVuIHNlc3Npb24sIGNyZWF0aW5nIGl0IG9uIGZpcnN0IHVzZS5cblx0ICovXG5cdHByaXZhdGUgX2dldFN1cmZhY2VkTWNwQXV0aFNlcnZlcnMoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBTZXQ8c3RyaW5nPiB7XG5cdFx0bGV0IHN1cmZhY2VkID0gdGhpcy5fc3VyZmFjZWRNY3BBdXRoU2VydmVycy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIXN1cmZhY2VkKSB7XG5cdFx0XHRzdXJmYWNlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0dGhpcy5fc3VyZmFjZWRNY3BBdXRoU2VydmVycy5zZXQoc2Vzc2lvblJlc291cmNlLCBzdXJmYWNlZCk7XG5cdFx0fVxuXHRcdHJldHVybiBzdXJmYWNlZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBQcnVuZXMgc2VydmVycyB0aGF0IHJlYWNoZWQgdGhlIHJ1bm5pbmcgKHtAbGluayBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHl9KVxuXHQgKiBzdGF0ZSBmcm9tIGV2ZXJ5IHNlc3Npb24ncyB7QGxpbmsgX3N1cmZhY2VkTWNwQXV0aFNlcnZlcnMgc3VyZmFjZWQgc2V0fSBzb1xuXHQgKiBhIHN1YnNlcXVlbnQgYXV0aCByZXF1aXJlbWVudCBzdXJmYWNlcyBhIGZyZXNoIHByb21wdCBpbnN0ZWFkIG9mIGJlaW5nXG5cdCAqIHN1cHByZXNzZWQuIE9ubHkgdGhlIHJ1bm5pbmcgc3RhdGUgY291bnRzIGFzIGFjdGlvbmVkIFx1MjAxNCBhIHNlcnZlciB0aGF0XG5cdCAqIG1lcmVseSBsZWZ0IHtAbGluayBNY3BTZXJ2ZXJTdGF0dXMuQXV0aFJlcXVpcmVkfSBmb3IgYW4gZXJyb3Ivc3RvcHBlZFxuXHQgKiBzdGF0ZSB3YXMgbm90IGF1dGhlbnRpY2F0ZWQgYW5kIHN0YXlzIHN1cHByZXNzZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9yZWNvbmNpbGVTdXJmYWNlZE1jcEF1dGhTZXJ2ZXJzKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW3Nlc3Npb25SZXNvdXJjZSwgc3VyZmFjZWRdIG9mIHRoaXMuX3N1cmZhY2VkTWNwQXV0aFNlcnZlcnMpIHtcblx0XHRcdGlmIChzdXJmYWNlZC5zaXplID09PSAwKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVhZHkgPSBuZXcgU2V0KHRoaXMuX2N1c3RvbWl6YXRpb25TZXJ2aWNlLmdldE1jcFNlcnZlcnMoc2Vzc2lvblJlc291cmNlKVxuXHRcdFx0XHQuZmlsdGVyKHNlcnZlciA9PiBzZXJ2ZXIuc3RhdHVzID09PSBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHkpXG5cdFx0XHRcdC5tYXAoc2VydmVyID0+IHNlcnZlci5pZCkpO1xuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiBzdXJmYWNlZCkge1xuXHRcdFx0XHRpZiAocmVhZHkuaGFzKGlkKSkge1xuXHRcdFx0XHRcdHN1cmZhY2VkLmRlbGV0ZShpZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9maWx0ZXJBdXRvR3JhbnRlZE1jcEF1dGhlbnRpY2F0aW9uKHNlc3Npb25SZXNvdXJjZTogVVJJLCBzZXJ2ZXJzOiByZWFkb25seSBJQ2hhdE1jcEF1dGhlbnRpY2F0aW9uUmVxdWlyZWRTZXJ2ZXJbXSk6IFByb21pc2U8cmVhZG9ubHkgSUNoYXRNY3BBdXRoZW50aWNhdGlvblJlcXVpcmVkU2VydmVyW10+IHtcblx0XHRjb25zdCByZW1haW5pbmc6IElDaGF0TWNwQXV0aGVudGljYXRpb25SZXF1aXJlZFNlcnZlcltdID0gW107XG5cdFx0Zm9yIChjb25zdCBzZXJ2ZXIgb2Ygc2VydmVycykge1xuXHRcdFx0aWYgKCFhd2FpdCB0aGlzLl9hdXRvQXV0aGVudGljYXRlTWNwU2VydmVyKHNlc3Npb25SZXNvdXJjZSwgc2VydmVyKSkge1xuXHRcdFx0XHRyZW1haW5pbmcucHVzaChzZXJ2ZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVtYWluaW5nO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYXV0b0F1dGhlbnRpY2F0ZU1jcFNlcnZlcihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgc2VydmVyOiBJQ2hhdE1jcEF1dGhlbnRpY2F0aW9uUmVxdWlyZWRTZXJ2ZXIpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBrZXkgPSBKU09OLnN0cmluZ2lmeShbXG5cdFx0XHRhZ2VudEhvc3RNY3BTZXJ2ZXJJZChzZXNzaW9uUmVzb3VyY2UuYXV0aG9yaXR5LCBzZXJ2ZXIubmFtZSwgc2VydmVyLnJlc291cmNlKSxcblx0XHRcdFsuLi4oc2VydmVyLnJlcXVpcmVkU2NvcGVzID8/IFtdKV0uc29ydCgpLFxuXHRcdFx0c2VydmVyLm9hdXRoQ2xpZW50Py5jbGllbnRJZCxcblx0XHRdKTtcblx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fcGVuZGluZ01jcEF1dG9BdXRoZW50aWNhdGlvbi5nZXQoa2V5KTtcblx0XHRpZiAocGVuZGluZykge1xuXHRcdFx0cmV0dXJuIHBlbmRpbmc7XG5cdFx0fVxuXHRcdGNvbnN0IG9wZXJhdGlvbiA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHJlc29sdmVNY3BTZXJ2ZXJBdXRoZW50aWNhdGlvbiwge1xuXHRcdFx0cmVzb3VyY2U6IHNlcnZlci5yZXNvdXJjZSxcblx0XHRcdHJlc291cmNlX25hbWU6IHNlcnZlci5uYW1lLFxuXHRcdFx0YXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBzZXJ2ZXIuYXV0aG9yaXphdGlvblNlcnZlcnMgPyBbLi4uc2VydmVyLmF1dGhvcml6YXRpb25TZXJ2ZXJzXSA6IHVuZGVmaW5lZCxcblx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6IHNlcnZlci5zdXBwb3J0ZWRTY29wZXMgPyBbLi4uc2VydmVyLnN1cHBvcnRlZFNjb3Blc10gOiB1bmRlZmluZWQsXG5cdFx0fSwge1xuXHRcdFx0YWxsb3dJbnRlcmFjdGlvbjogZmFsc2UsXG5cdFx0XHRsb2dQcmVmaXg6ICdbQWdlbnRIb3N0XScsXG5cdFx0XHRtY3BTZXJ2ZXJJZDogYWdlbnRIb3N0TWNwU2VydmVySWQoc2Vzc2lvblJlc291cmNlLmF1dGhvcml0eSwgc2VydmVyLm5hbWUsIHNlcnZlci5yZXNvdXJjZSksXG5cdFx0XHRtY3BTZXJ2ZXJOYW1lOiBzZXJ2ZXIubmFtZSxcblx0XHRcdG1jcFNlcnZlclVybDogc2VydmVyLnJlc291cmNlLFxuXHRcdFx0b2F1dGhDbGllbnQ6IHNlcnZlci5vYXV0aENsaWVudCxcblx0XHRcdHNjb3Blczogc2VydmVyLnJlcXVpcmVkU2NvcGVzID8/IFtdLFxuXHRcdFx0YWdlbnRIb3N0OiB7IHNjaGVtZTogc2Vzc2lvblJlc291cmNlLnNjaGVtZSwgYXV0aG9yaXR5OiBzZXNzaW9uUmVzb3VyY2UuYXV0aG9yaXR5IH0sXG5cdFx0XHRhdXRoZW50aWNhdGU6IHJlcXVlc3QgPT4gdGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uYXV0aGVudGljYXRlKHJlcXVlc3QpLFxuXHRcdH0pLmNhdGNoKGVyciA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQWdlbnRIb3N0XSBGYWlsZWQgdG8gYXV0by1hdXRoZW50aWNhdGUgTUNQIHNlcnZlciAnJHtzZXJ2ZXIubmFtZX0nYCwgZXJyKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9KTtcblx0XHR0aGlzLl9wZW5kaW5nTWNwQXV0b0F1dGhlbnRpY2F0aW9uLnNldChrZXksIG9wZXJhdGlvbik7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBvcGVyYXRpb247XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlmICh0aGlzLl9wZW5kaW5nTWNwQXV0b0F1dGhlbnRpY2F0aW9uLmdldChrZXkpID09PSBvcGVyYXRpb24pIHtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ01jcEF1dG9BdXRoZW50aWNhdGlvbi5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXR1cE1hcmtkb3duUGFydChcblx0XHRwYXJ0JDogSU9ic2VydmFibGU8TWFya2Rvd25SZXNwb25zZVBhcnQ+LFxuXHRcdHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUsXG5cdFx0b3B0czogSU9ic2VydmVUdXJuT3B0aW9ucyxcblx0KTogdm9pZCB7XG5cdFx0Ly8gU2VlZCBmcm9tIHRoZSBzbmFwc2hvdCBsZW5ndGggc28gdGhlIGFsd2F5cy1vbiBncmFwaCBkb2VzIG5vdFxuXHRcdC8vIHJlLWVtaXQgY29udGVudCBhbHJlYWR5IGNvdmVyZWQgYnkgYGFjdGl2ZVR1cm5Ub1Byb2dyZXNzYCBvblxuXHRcdC8vIHJlY29ubmVjdC5cblx0XHRsZXQgbGFzdEVtaXR0ZWQgPSBvcHRzLnNlZWRFbWl0dGVkTGVuZ3Rocz8uZ2V0KHBhcnQkLmdldCgpLmlkKSA/PyAwO1xuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gcGFydCQucmVhZChyZWFkZXIpLmNvbnRlbnQ7XG5cdFx0XHRpZiAoY29udGVudC5sZW5ndGggPD0gbGFzdEVtaXR0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGVsdGEgPSBjb250ZW50LnN1YnN0cmluZyhsYXN0RW1pdHRlZCk7XG5cdFx0XHRsYXN0RW1pdHRlZCA9IGNvbnRlbnQubGVuZ3RoO1xuXHRcdFx0b3B0cy5zaW5rKFt7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoZGVsdGEpIH1dKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXR1cFJlYXNvbmluZ1BhcnQoXG5cdFx0cGFydCQ6IElPYnNlcnZhYmxlPFJlYXNvbmluZ1Jlc3BvbnNlUGFydD4sXG5cdFx0c3RvcmU6IERpc3Bvc2FibGVTdG9yZSxcblx0XHRvcHRzOiBJT2JzZXJ2ZVR1cm5PcHRpb25zLFxuXHQpOiB2b2lkIHtcblx0XHRjb25zdCBwYXJ0SWQgPSBwYXJ0JC5nZXQoKS5pZDtcblx0XHRsZXQgbGFzdEVtaXR0ZWQgPSBvcHRzLnNlZWRFbWl0dGVkTGVuZ3Rocz8uZ2V0KHBhcnRJZCkgPz8gMDtcblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IHBhcnQkLnJlYWQocmVhZGVyKS5jb250ZW50O1xuXHRcdFx0aWYgKGNvbnRlbnQubGVuZ3RoIDw9IGxhc3RFbWl0dGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRlbHRhID0gY29udGVudC5zdWJzdHJpbmcobGFzdEVtaXR0ZWQpO1xuXHRcdFx0bGFzdEVtaXR0ZWQgPSBjb250ZW50Lmxlbmd0aDtcblx0XHRcdG9wdHMuc2luayhbeyBraW5kOiAndGhpbmtpbmcnLCB2YWx1ZTogZGVsdGEsIGlkOiBwYXJ0SWQgfV0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldHVwVG9vbENhbGxQYXJ0KFxuXHRcdHBhcnQkOiBJT2JzZXJ2YWJsZTxUb29sQ2FsbFJlc3BvbnNlUGFydD4sXG5cdFx0c3RvcmU6IERpc3Bvc2FibGVTdG9yZSxcblx0XHRvcHRzOiBJT2JzZXJ2ZVR1cm5PcHRpb25zLFxuXHRcdHN1YmFnZW50Q29udGV4dDogSVN1YmFnZW50Q29udGV4dCxcblx0KTogdm9pZCB7XG5cdFx0Y29uc3QgaW5pdGlhbCA9IHBhcnQkLmdldCgpLnRvb2xDYWxsO1xuXHRcdGNvbnN0IGNvbnRyaWJ1dG9yID0gaW5pdGlhbC5jb250cmlidXRvcjtcblx0XHRpZiAoY29udHJpYnV0b3I/LmtpbmQgPT09IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCAmJiBjb250cmlidXRvci5jbGllbnRJZCA9PT0gdGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uY2xpZW50SWQpIHtcblx0XHRcdC8vIFNldCB1cCBiZWZvcmUgY2xhaW1pbmc6IHRoZSBjbGFpbSBpcyB3aGF0IHRlbGxzIHRoZSBzZXNzaW9uLWxldmVsXG5cdFx0XHQvLyB3YXRjaGVyIGl0IG1heSBleGVjdXRlIHRoaXMgY2FsbCwgYW5kIGl0IG11c3QgZmluZCB0aGUgc2hhcmVkXG5cdFx0XHQvLyBpbnZvY2F0aW9uIGFscmVhZHkgY3JlYXRlZCB3aGVuIGl0IGRvZXMuXG5cdFx0XHR0aGlzLl9zZXR1cENsaWVudFRvb2xDYWxsKGluaXRpYWwsIHBhcnQkLCBzdG9yZSwgb3B0cywgc3ViYWdlbnRDb250ZXh0KTtcblx0XHRcdHN0b3JlLmFkZCh0aGlzLl9tYXJrVG9vbENhbGxSZW5kZXJlZChvcHRzLmNoYXRVUkksIG9wdHMudHVybklkLCBpbml0aWFsLnRvb2xDYWxsSWQsIG9wdHMuc2Vzc2lvblJlc291cmNlKSk7XG5cdFx0fSBlbHNlIGlmIChjb250cmlidXRvcj8ua2luZCA9PT0gVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50KSB7XG5cdFx0XHR0aGlzLl9zZXR1cE90aGVyQ2xpZW50VG9vbENhbGwoaW5pdGlhbCwgcGFydCQsIHN0b3JlLCBvcHRzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c3RvcmUuYWRkKHRoaXMuX21hcmtUb29sQ2FsbFJlbmRlcmVkKG9wdHMuY2hhdFVSSSwgb3B0cy50dXJuSWQsIGluaXRpYWwudG9vbENhbGxJZCwgb3B0cy5zZXNzaW9uUmVzb3VyY2UpKTtcblx0XHRcdHRoaXMuX3NldHVwU2VydmVyVG9vbENhbGwoaW5pdGlhbCwgcGFydCQsIHN0b3JlLCBvcHRzLCBzdWJhZ2VudENvbnRleHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Rvb2xDYWxsS2V5KGNoYXRVUkk6IHN0cmluZywgdHVybklkOiBzdHJpbmcsIHRvb2xDYWxsSWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke2NoYXRVUkl9XFwwJHt0dXJuSWR9XFwwJHt0b29sQ2FsbElkfWA7XG5cdH1cblxuXHRwcml2YXRlIF9pbnB1dFJlcXVlc3RLZXkoY2hhdFVSSTogc3RyaW5nLCByZXF1ZXN0SWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke2NoYXRVUkl9XFwwJHtyZXF1ZXN0SWR9YDtcblx0fVxuXG5cdC8qKiBDbGFpbXMgYSByZXF1ZXN0IGFzIHJlbmRlcmVkIHVudGlsIHRoZSByZXR1cm5lZCBkaXNwb3NhYmxlIGlzIGRpc3Bvc2VkLiAqL1xuXHRwcml2YXRlIF9tYXJrUmVuZGVyZWQoa2V5OiBzdHJpbmcsIHNlc3Npb25SZXNvdXJjZTogVVJJKTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuX3JlbmRlcmVkUmVxdWVzdHMuc2V0KG5ldyBNYXAodGhpcy5fcmVuZGVyZWRSZXF1ZXN0cy5nZXQoKSkuc2V0KGtleSwgc2Vzc2lvblJlc291cmNlKSwgdW5kZWZpbmVkKTtcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGNvbnN0IG5leHQgPSBuZXcgTWFwKHRoaXMuX3JlbmRlcmVkUmVxdWVzdHMuZ2V0KCkpO1xuXHRcdFx0bmV4dC5kZWxldGUoa2V5KTtcblx0XHRcdHRoaXMuX3JlbmRlcmVkUmVxdWVzdHMuc2V0KG5leHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVjb3JkcyB0aGF0IGEgdHVybiBvYnNlcnZlciBpcyByZW5kZXJpbmcgdGhpcyBjaGF0IGlucHV0IHJlcXVlc3QsIHNvIHRoZVxuXHQgKiBzZXNzaW9uLWxldmVsIHJlc3BvbmRlciBsZWF2ZXMgaXRzIGlubGluZSBlbGljaXRhdGlvbiBVSSBpbiBjaGFyZ2UuXG5cdCAqL1xuXHRwcml2YXRlIF9tYXJrSW5wdXRSZXF1ZXN0UmVuZGVyZWQoY2hhdFVSSTogc3RyaW5nLCByZXF1ZXN0SWQ6IHN0cmluZywgc2Vzc2lvblJlc291cmNlOiBVUkkpOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHRoaXMuX21hcmtSZW5kZXJlZCh0aGlzLl9pbnB1dFJlcXVlc3RLZXkoY2hhdFVSSSwgcmVxdWVzdElkKSwgc2Vzc2lvblJlc291cmNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWNvcmRzIHRoYXQgYSB0dXJuIG9ic2VydmVyIGlzIHJlbmRlcmluZyB0aGlzIHRvb2wgY2FsbCwgc28gdGhlXG5cdCAqIHNlc3Npb24tbGV2ZWwgcmVzcG9uZGVyIGxlYXZlcyBpdHMgaW5saW5lIFVJIGluIGNoYXJnZS4gUmVsZWFzaW5nIHRoZVxuXHQgKiBjbGFpbSBhbHNvIGZvcmdldHMgdGhlIGZ1bm5lbCBlbnRyaWVzLCB3aGljaCBpcyB0aGUgb25seSBjbGVhbnVwIGEgdG9vbFxuXHQgKiBjYWxsIHRoYXQgbmV2ZXIgcmVhY2hlZCBgaW5wdXROZWVkZWRgIGV2ZXIgZ2V0cy5cblx0ICovXG5cdHByaXZhdGUgX21hcmtUb29sQ2FsbFJlbmRlcmVkKGNoYXRVUkk6IHN0cmluZywgdHVybklkOiBzdHJpbmcsIHRvb2xDYWxsSWQ6IHN0cmluZywgc2Vzc2lvblJlc291cmNlOiBVUkkpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3Qga2V5ID0gdGhpcy5fdG9vbENhbGxLZXkoY2hhdFVSSSwgdHVybklkLCB0b29sQ2FsbElkKTtcblx0XHRjb25zdCByZW5kZXJlZCA9IHRoaXMuX21hcmtSZW5kZXJlZChrZXksIHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRyZW5kZXJlZC5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9mb3JnZXRSZXNvbHZlZFRvb2xDYWxsKGtleSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogU2luZ2xlIGZ1bm5lbCBmb3IgdG9vbC1jYWxsIG91dGNvbWVzLCBzbyBhbiBpbmxpbmUgaW52b2NhdGlvbiBhbmQgdGhlXG5cdCAqIHNlc3Npb24tbGV2ZWwgcmVzcG9uZGVyIGNhbiBib3RoIG9mZmVyIHRoZSBhY3Rpb24gd2hpbGUgdGhlIHByb3RvY29sXG5cdCAqIG9ubHkgZXZlciBzZWVzIHRoZSBmaXJzdCBhbnN3ZXIuIENvbmZpcm1pbmcgYW5kIGNvbXBsZXRpbmcgYXJlIGRpc3RpbmN0XG5cdCAqIG91dGNvbWVzLCBzbyBlYWNoIGlzIHRyYWNrZWQgc2VwYXJhdGVseS5cblx0ICovXG5cdHByaXZhdGUgX3Jlc29sdmVUb29sQ2FsbChjaGF0VVJJOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nLCB0b29sQ2FsbElkOiBzdHJpbmcsIGFjdGlvbjogQ2xpZW50Q2hhdEFjdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IGAke3RoaXMuX3Rvb2xDYWxsS2V5KGNoYXRVUkksIHR1cm5JZCwgdG9vbENhbGxJZCl9XFwwJHthY3Rpb24udHlwZX1gO1xuXHRcdGlmICh0aGlzLl9yZXNvbHZlZFRvb2xDYWxscy5oYXMoa2V5KSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50SG9zdF0gVG9vbCBjYWxsIG91dGNvbWUgd2FzIGFscmVhZHkgZGlzcGF0Y2hlZDogJHt0b29sQ2FsbElkfSAoJHthY3Rpb24udHlwZX0pYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Jlc29sdmVkVG9vbENhbGxzLmFkZChrZXkpO1xuXHRcdHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uLmRpc3BhdGNoKGNoYXRVUkksIGFjdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIF9mb3JnZXRSZXNvbHZlZFRvb2xDYWxsKHRvb2xDYWxsS2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiB0aGlzLl9yZXNvbHZlZFRvb2xDYWxscykge1xuXHRcdFx0aWYgKGtleS5zdGFydHNXaXRoKGAke3Rvb2xDYWxsS2V5fVxcMGApKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc29sdmVkVG9vbENhbGxzLmRlbGV0ZShrZXkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldHVwT3RoZXJDbGllbnRUb29sQ2FsbChcblx0XHRpbml0aWFsOiBUb29sQ2FsbFN0YXRlLFxuXHRcdHBhcnQkOiBJT2JzZXJ2YWJsZTxUb29sQ2FsbFJlc3BvbnNlUGFydD4sXG5cdFx0c3RvcmU6IERpc3Bvc2FibGVTdG9yZSxcblx0XHRvcHRzOiBJT2JzZXJ2ZVR1cm5PcHRpb25zLFxuXHQpOiB2b2lkIHtcblx0XHRjb25zdCB0b29sQ2FsbElkID0gaW5pdGlhbC50b29sQ2FsbElkO1xuXHRcdGNvbnN0IGFkb3B0ZWQgPSBvcHRzLmFkb3B0SW52b2NhdGlvbnM/LmdldCh0b29sQ2FsbElkKTtcblx0XHRjb25zdCBpbnZvY2F0aW9uID0gYWRvcHRlZCA/PyB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKFxuXHRcdFx0aW5pdGlhbCxcblx0XHRcdG9wdHMuc3ViQWdlbnRJbnZvY2F0aW9uSWQsXG5cdFx0XHRvcHRzLmJhY2tlbmRTZXNzaW9uLFxuXHRcdFx0dGhpcy5fY29uZmlnLmNvbm5lY3Rpb25BdXRob3JpdHksXG5cdFx0XHRvcHRzLnNlc3Npb25SZXNvdXJjZS5hdXRob3JpdHksXG5cdFx0XHR0aGlzLl9vdGhlckNsaWVudFRvb2xJbnZvY2F0aW9uT3B0aW9ucyhvcHRzLmJhY2tlbmRTZXNzaW9uLCBvcHRzLmNoYXRVUkksIG9wdHMudHVybklkKSxcblx0XHQpO1xuXHRcdGlmICghYWRvcHRlZCkge1xuXHRcdFx0b3B0cy5zaW5rKFtpbnZvY2F0aW9uXSk7XG5cdFx0fVxuXG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHRvb2xDYWxsID0gcGFydCQucmVhZChyZWFkZXIpLnRvb2xDYWxsO1xuXHRcdFx0aWYgKCh0b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCB8fCB0b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNhbmNlbGxlZCkgJiYgIUlDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZShpbnZvY2F0aW9uKSkge1xuXHRcdFx0XHRjb25zdCBmaWxlRWRpdHMgPSBmaW5hbGl6ZVRvb2xJbnZvY2F0aW9uKGludm9jYXRpb24sIHRvb2xDYWxsLCBvcHRzLmJhY2tlbmRTZXNzaW9uLCB0aGlzLl9jb25maWcuY29ubmVjdGlvbkF1dGhvcml0eSk7XG5cdFx0XHRcdGlmIChmaWxlRWRpdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdG9wdHMub25GaWxlRWRpdHM/Lih0b29sQ2FsbCwgZmlsZUVkaXRzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKCFJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUoaW52b2NhdGlvbikpIHtcblx0XHRcdFx0aW52b2NhdGlvbi5kaWRFeGVjdXRlVG9vbCh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX290aGVyQ2xpZW50VG9vbEludm9jYXRpb25PcHRpb25zKGJhY2tlbmRTZXNzaW9uOiBVUkksIGNoYXRVUkk6IHN0cmluZywgdHVybklkOiBzdHJpbmcpOiBJQWdlbnRIb3N0VG9vbEludm9jYXRpb25PcHRpb25zIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Y3VycmVudENsaWVudElkOiB0aGlzLl9jb25maWcuY29ubmVjdGlvbi5jbGllbnRJZCxcblx0XHRcdGNhbmNlbE90aGVyQ2xpZW50VG9vbENhbGw6IHRvb2xDYWxsID0+IHtcblx0XHRcdFx0Y29uc3QgcmVhc29uTWVzc2FnZSA9IGxvY2FsaXplKCdhZ2VudEhvc3Qub3RoZXJDbGllbnRUb29sLnNraXBwZWRFcnJvcicsIFwiezB9IHdhcyBza2lwcGVkIGZyb20gYW5vdGhlciBjbGllbnRcIiwgdG9vbENhbGwuZGlzcGxheU5hbWUpO1xuXHRcdFx0XHR0aGlzLl9kaXNwYXRjaEFjdGlvbihiYWNrZW5kU2Vzc2lvbiwgdG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uXG5cdFx0XHRcdFx0PyB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCxcblx0XHRcdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6IHRvb2xDYWxsLnRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0XHRhcHByb3ZlZDogZmFsc2UsXG5cdFx0XHRcdFx0XHRyZWFzb246IFRvb2xDYWxsQ2FuY2VsbGF0aW9uUmVhc29uLlNraXBwZWQsXG5cdFx0XHRcdFx0XHRyZWFzb25NZXNzYWdlLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQ6IHtcblx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiB0b29sQ2FsbC50b29sQ2FsbElkLFxuXHRcdFx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0Lm90aGVyQ2xpZW50VG9vbC5za2lwcGVkJywgXCJTa2lwcGVkIHswfVwiLCB0b29sQ2FsbC5kaXNwbGF5TmFtZSksXG5cdFx0XHRcdFx0XHRcdGVycm9yOiB7IG1lc3NhZ2U6IHJlYXNvbk1lc3NhZ2UsIGNvZGU6ICdjYW5jZWxsZWQnIH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sIGNoYXRVUkkpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFBlci1jYWxsIHNldHVwIGZvciBhIHNlcnZlci1kcml2ZW4gdG9vbC4gQWRvcHRzIGEgc25hcHNob3Rcblx0ICoge0BsaW5rIENoYXRUb29sSW52b2NhdGlvbn0gd2hlbiBwcmVzZW50IChyZWNvbm5lY3QgcGFyaXR5KTsgb3RoZXJ3aXNlXG5cdCAqIGVtaXRzIGEgZnJlc2ggb25lLiBSZWFjdHMgdG8gc3RhdHVzIHRyYW5zaXRpb25zIGZvciByZS1jb25maXJtYXRpb24sXG5cdCAqIHRlcm1pbmFsIHJldml2YWwsIGZpbmFsaXphdGlvbiwgYW5kIHN1YmFnZW50IG9ic2VydmF0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2V0dXBTZXJ2ZXJUb29sQ2FsbChcblx0XHRpbml0aWFsOiBUb29sQ2FsbFN0YXRlLFxuXHRcdHBhcnQkOiBJT2JzZXJ2YWJsZTxUb29sQ2FsbFJlc3BvbnNlUGFydD4sXG5cdFx0c3RvcmU6IERpc3Bvc2FibGVTdG9yZSxcblx0XHRvcHRzOiBJT2JzZXJ2ZVR1cm5PcHRpb25zLFxuXHRcdHN1YmFnZW50Q29udGV4dDogSVN1YmFnZW50Q29udGV4dCxcblx0KTogdm9pZCB7XG5cdFx0Y29uc3QgdG9vbENhbGxJZCA9IGluaXRpYWwudG9vbENhbGxJZDtcblx0XHRjb25zdCBzdWJBZ2VudEludm9jYXRpb25JZCA9IG9wdHMuc3ViQWdlbnRJbnZvY2F0aW9uSWQ7XG5cdFx0Y29uc3QgYWRvcHRlZCA9IG9wdHMuYWRvcHRJbnZvY2F0aW9ucz8uZ2V0KHRvb2xDYWxsSWQpO1xuXHRcdGxldCBjb25maXJtYXRpb25PcHRpb25zID0gaW5pdGlhbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24gPyBpbml0aWFsLm9wdGlvbnMgOiB1bmRlZmluZWQ7XG5cdFx0Ly8gVG9vbHMgdGhhdCBzdHJlYW0gdGhlaXIgYXJndW1lbnRzIChyZWxpYWJseTogdGVybWluYWwvYmFzaCBjb21tYW5kcylcblx0XHQvLyBhcmUgZmlyc3Qgb2JzZXJ2ZWQgaW4gYFN0cmVhbWluZ2AuIFJlcHJlc2VudCB0aGVtIHdpdGggYSBuYXRpdmVcblx0XHQvLyBzdHJlYW1pbmcgYENoYXRUb29sSW52b2NhdGlvbmAgYW5kIGxhdGVyIGRyaXZlIGl0IHRocm91Z2hcblx0XHQvLyBgdHJhbnNpdGlvbkZyb21TdHJlYW1pbmdgIChzZWUgdGhlIGF1dG9ydW4gYmVsb3cpLCBzbyBhIHNpbmdsZSBjYXJkXG5cdFx0Ly8gc3BhbnMgdGhlIHdob2xlIGxpZmVjeWNsZSBpbnN0ZWFkIG9mIGEgc2V0dGxlZCBwbGFjZWhvbGRlciBwbHVzIGFcblx0XHQvLyBzZXBhcmF0ZSBjb25maXJtYXRpb24gY2FyZCAoIzMxNDg1OCkuXG5cdFx0bGV0IGludm9jYXRpb246IENoYXRUb29sSW52b2NhdGlvbjtcblx0XHRpZiAoYWRvcHRlZCkge1xuXHRcdFx0aW52b2NhdGlvbiA9IGFkb3B0ZWQ7XG5cdFx0fSBlbHNlIGlmIChpbml0aWFsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuU3RyZWFtaW5nKSB7XG5cdFx0XHRpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvU3RyZWFtaW5nSW52b2NhdGlvbihpbml0aWFsLCBzdWJBZ2VudEludm9jYXRpb25JZCwgb3B0cy5iYWNrZW5kU2Vzc2lvbiwgdGhpcy5fY29uZmlnLmNvbm5lY3Rpb25BdXRob3JpdHksIG9wdHMuc2Vzc2lvblJlc291cmNlLmF1dGhvcml0eSk7XG5cdFx0XHRvcHRzLnNpbmsoW2ludm9jYXRpb25dKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24oaW5pdGlhbCwgc3ViQWdlbnRJbnZvY2F0aW9uSWQsIG9wdHMuYmFja2VuZFNlc3Npb24sIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5LCBvcHRzLnNlc3Npb25SZXNvdXJjZS5hdXRob3JpdHkpO1xuXHRcdFx0b3B0cy5zaW5rKFtpbnZvY2F0aW9uXSk7XG5cdFx0fVxuXG5cdFx0Ly8gSG9vayB1cCBhIHRvb2wgZmlyc3Qgb2JzZXJ2ZWQgYWZ0ZXIgaXQgYWxyZWFkeSBlbnRlcmVkIGNvbmZpcm1hdGlvbi5cblx0XHRpZiAoaW5pdGlhbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24gJiYgIUlDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZShpbnZvY2F0aW9uKSkge1xuXHRcdFx0dGhpcy5fYXdhaXRUb29sQ29uZmlybWF0aW9uKGludm9jYXRpb24sIHRvb2xDYWxsSWQsIG9wdHMuYmFja2VuZFNlc3Npb24sIG9wdHMudHVybklkLCBvcHRzLmNhbmNlbGxhdGlvblRva2VuLCAoKSA9PiBjb25maXJtYXRpb25PcHRpb25zLCBvcHRzLmNoYXRVUkkpO1xuXHRcdH1cblx0XHR0aGlzLl90cnlPYnNlcnZlU3ViYWdlbnRUb29sQ2FsbChpbml0aWFsLCBpbnZvY2F0aW9uLCBzdG9yZSwgb3B0cywgc3ViYWdlbnRDb250ZXh0KTtcblx0XHRjb25zdCBvdXRwdXRUZXJtaW5hbEF0dGFjaG1lbnQ6IElPdXRwdXRUZXJtaW5hbEF0dGFjaG1lbnQgPSB7XG5cdFx0XHRkaXNwb3NhYmxlOiBzdG9yZS5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpXG5cdFx0fTtcblxuXHRcdC8vIFJldXNlIHRoZSBpbnZvY2F0aW9uIHdoZW5ldmVyIGEgdG9vbCBlbnRlcnMgY29uZmlybWF0aW9uIHRvIGF2b2lkIGR1cGxpY2F0ZSBjYXJkcy5cblx0XHRsZXQgcHJldmlvdXNTdGF0dXM6IFRvb2xDYWxsU3RhdHVzIHwgdW5kZWZpbmVkID0gaW5pdGlhbC5zdGF0dXM7XG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHRjID0gcGFydCQucmVhZChyZWFkZXIpLnRvb2xDYWxsO1xuXHRcdFx0Y29uc3Qgc3RhdHVzID0gdGMuc3RhdHVzO1xuXHRcdFx0Y29uc3QgcHJpb3JTdGF0dXMgPSBwcmV2aW91c1N0YXR1cztcblx0XHRcdGlmIChzdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24pIHtcblx0XHRcdFx0Y29uZmlybWF0aW9uT3B0aW9ucyA9IHRjLm9wdGlvbnM7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlbnRlcmluZ0NvbmZpcm1hdGlvbiA9IHN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvblxuXHRcdFx0XHQmJiBwcmV2aW91c1N0YXR1cyAhPT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbjtcblx0XHRcdHByZXZpb3VzU3RhdHVzID0gc3RhdHVzO1xuXG5cdFx0XHRpZiAoc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcpIHtcblx0XHRcdFx0dXBkYXRlU3RyZWFtaW5nVG9vbEludm9jYXRpb24oaW52b2NhdGlvbiwgdGMsIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5KTtcblx0XHRcdH0gZWxzZSBpZiAoZW50ZXJpbmdDb25maXJtYXRpb24pIHtcblx0XHRcdFx0Ly8gQSByZS1hc2sgaXMgYSBmcmVzaCBvYmxpZ2F0aW9uLCBzbyBhIHByZXZpb3VzIGFuc3dlciBtdXN0IG5vdFxuXHRcdFx0XHQvLyBzdXBwcmVzcyB0aGlzIG9uZS5cblx0XHRcdFx0dGhpcy5fZm9yZ2V0UmVzb2x2ZWRUb29sQ2FsbCh0aGlzLl90b29sQ2FsbEtleShvcHRzLmNoYXRVUkksIG9wdHMudHVybklkLCB0b29sQ2FsbElkKSk7XG5cdFx0XHRcdGlmICghSUNoYXRUb29sSW52b2NhdGlvbi5pc0NvbXBsZXRlKGludm9jYXRpb24pKSB7XG5cdFx0XHRcdFx0Y29uc3QgcHJlcGFyZWQgPSB0b29sQ2FsbFN0YXRlVG9QcmVwYXJlZEludm9jYXRpb24odGMsIG9wdHMuYmFja2VuZFNlc3Npb24sIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5LCBvcHRzLnNlc3Npb25SZXNvdXJjZS5hdXRob3JpdHkpO1xuXHRcdFx0XHRcdGludm9jYXRpb24ucmVxdWVzdENvbmZpcm1hdGlvbihwcmVwYXJlZCk7XG5cdFx0XHRcdFx0dGhpcy5fYXdhaXRUb29sQ29uZmlybWF0aW9uKGludm9jYXRpb24sIHRvb2xDYWxsSWQsIG9wdHMuYmFja2VuZFNlc3Npb24sIG9wdHMudHVybklkLCBvcHRzLmNhbmNlbGxhdGlvblRva2VuLCAoKSA9PiBjb25maXJtYXRpb25PcHRpb25zLCBvcHRzLmNoYXRVUkkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbikge1xuXHRcdFx0XHQvLyBUaGUgcHJvdG9jb2wgY2FuIHJlZnJlc2ggYSBwZW5kaW5nIHRvb2wncyBjb21tYW5kIHdpdGhvdXQgYW5cblx0XHRcdFx0Ly8gaW50ZXJ2ZW5pbmcgc3RhdHVzIHRyYW5zaXRpb24uIFJlZnJlc2ggdGhlIHdob2xlIHByZXNlbnRhdGlvbiwgbm90XG5cdFx0XHRcdC8vIGp1c3QgaXRzIG1lc3NhZ2UsIHNvIE9tbmkgYW5kIHZvaWNlIGV4cG9zZSB0aGUgY29tbWFuZCB0aGF0IGlzXG5cdFx0XHRcdC8vIGFjdHVhbGx5IGF3YWl0aW5nIGFwcHJvdmFsIHdoaWxlIHByZXNlcnZpbmcgdGhlIGN1cnJlbnQgZ2F0ZS5cblx0XHRcdFx0Y29uc3QgcHJlcGFyZWQgPSB0b29sQ2FsbFN0YXRlVG9QcmVwYXJlZEludm9jYXRpb24odGMsIG9wdHMuYmFja2VuZFNlc3Npb24sIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5LCBvcHRzLnNlc3Npb25SZXNvdXJjZS5hdXRob3JpdHkpO1xuXHRcdFx0XHRpbnZvY2F0aW9uLnVwZGF0ZVByZXBhcmVkSW52b2NhdGlvbihwcmVwYXJlZCwgaW52b2NhdGlvbi5wYXJhbWV0ZXJzKTtcblx0XHRcdH0gZWxzZSBpZiAoc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5BdXRoUmVxdWlyZWQpIHtcblx0XHRcdFx0dGhpcy5fZW5zdXJlTGVmdFN0cmVhbWluZyhpbnZvY2F0aW9uLCB0Yywgb3B0cyk7XG5cdFx0XHRcdGludm9jYXRpb24uc2V0QXV0aGVudGljYXRpb25SZXF1aXJlZCh0b29sQ2FsbEF1dGhlbnRpY2F0aW9uU2VydmVyKHRjLCBvcHRzLnNlc3Npb25SZXNvdXJjZS5hdXRob3JpdHkpLCAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fZGlzcGF0Y2hBY3Rpb24ob3B0cy5iYWNrZW5kU2Vzc2lvbiwge1xuXHRcdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0XHRcdHR1cm5JZDogb3B0cy50dXJuSWQsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0Lm1jcFRvb2xBdXRoZW50aWNhdGlvbi5jYW5jZWxsZWQnLCBcIkNhbmNlbGxlZCB0b29sIGNhbGxcIiksXG5cdFx0XHRcdFx0XHRcdGVycm9yOiB7IG1lc3NhZ2U6IGxvY2FsaXplKCdhZ2VudEhvc3QubWNwVG9vbEF1dGhlbnRpY2F0aW9uLmNhbmNlbGxlZEVycm9yJywgXCJNQ1AgYXV0aGVudGljYXRpb24gd2FzIGNhbmNlbGxlZFwiKSwgY29kZTogJ2NhbmNlbGxlZCcgfSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSwgb3B0cy5jaGF0VVJJKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2UgaWYgKHN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUnVubmluZyB8fCBzdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdSZXN1bHRDb25maXJtYXRpb24pIHtcblx0XHRcdFx0aWYgKHByaW9yU3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5BdXRoUmVxdWlyZWQpIHtcblx0XHRcdFx0XHRpbnZvY2F0aW9uLnNldEF1dGhlbnRpY2F0aW9uUmVzb2x2ZWQoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9lbnN1cmVMZWZ0U3RyZWFtaW5nKGludm9jYXRpb24sIHRjLCBvcHRzKTtcblx0XHRcdFx0Y29uc3QgaW52b2NhdGlvbk1lc3NhZ2UgPSBzdHJpbmdPck1hcmtkb3duVG9TdHJpbmcodGMuaW52b2NhdGlvbk1lc3NhZ2UsIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5KTtcblx0XHRcdFx0Y29uc3QgcHJldmlvdXNJbnZvY2F0aW9uTWVzc2FnZSA9IHR5cGVvZiBpbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlID09PSAnc3RyaW5nJyA/IGludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2UgOiBpbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlLnZhbHVlO1xuXHRcdFx0XHRjb25zdCBuZXh0SW52b2NhdGlvbk1lc3NhZ2UgPSB0eXBlb2YgaW52b2NhdGlvbk1lc3NhZ2UgPT09ICdzdHJpbmcnID8gaW52b2NhdGlvbk1lc3NhZ2UgOiBpbnZvY2F0aW9uTWVzc2FnZT8udmFsdWU7XG5cdFx0XHRcdGNvbnN0IGludm9jYXRpb25NZXNzYWdlQ2hhbmdlZCA9IG5leHRJbnZvY2F0aW9uTWVzc2FnZSAhPT0gdW5kZWZpbmVkICYmIG5leHRJbnZvY2F0aW9uTWVzc2FnZSAhPT0gcHJldmlvdXNJbnZvY2F0aW9uTWVzc2FnZTtcblx0XHRcdFx0aWYgKGludm9jYXRpb25NZXNzYWdlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRpbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlID0gaW52b2NhdGlvbk1lc3NhZ2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcmV2aXZlVGVybWluYWxJZk5lZWRlZChpbnZvY2F0aW9uLCB0Yywgb3B0cy5iYWNrZW5kU2Vzc2lvbiwgb3V0cHV0VGVybWluYWxBdHRhY2htZW50KTtcblx0XHRcdFx0dXBkYXRlUnVubmluZ1Rvb2xTcGVjaWZpY0RhdGEoaW52b2NhdGlvbiwgdGMsIG9wdHMuYmFja2VuZFNlc3Npb24sIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5KTtcblx0XHRcdFx0aWYgKGludm9jYXRpb25NZXNzYWdlQ2hhbmdlZCkge1xuXHRcdFx0XHRcdGludm9jYXRpb24ubm90aWZ5VG9vbFNwZWNpZmljRGF0YUNoYW5nZWQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl90cnlPYnNlcnZlU3ViYWdlbnRUb29sQ2FsbCh0YywgaW52b2NhdGlvbiwgc3RvcmUsIG9wdHMsIHN1YmFnZW50Q29udGV4dCk7XG5cblx0XHRcdGlmICgoc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgfHwgc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5DYW5jZWxsZWQpICYmICFJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUoaW52b2NhdGlvbikpIHtcblx0XHRcdFx0Ly8gRGV0YWNoIGxpdmUgbm9uLVBUWSBvdXRwdXQgYmVmb3JlIGNvbXBsZXRpb24gc3luY2hyb25vdXNseSByZWJ1aWxkcyB0aGUgdGVybWluYWwgc3VicGFydC5cblx0XHRcdFx0aWYgKHN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fZW5zdXJlTGVmdFN0cmVhbWluZyhpbnZvY2F0aW9uLCB0Yywgb3B0cyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcmV2aXZlVGVybWluYWxJZk5lZWRlZChpbnZvY2F0aW9uLCB0Yywgb3B0cy5iYWNrZW5kU2Vzc2lvbiwgb3V0cHV0VGVybWluYWxBdHRhY2htZW50KTtcblx0XHRcdFx0Y29uc3QgZmlsZUVkaXRzID0gZmluYWxpemVUb29sSW52b2NhdGlvbihpbnZvY2F0aW9uLCB0Yywgb3B0cy5iYWNrZW5kU2Vzc2lvbiwgdGhpcy5fY29uZmlnLmNvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHRcdFx0XHRpZiAoZmlsZUVkaXRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRvcHRzLm9uRmlsZUVkaXRzPy4odGMsIGZpbGVFZGl0cyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBJZiB0aGUgdHVybiBlbmRzIHdpdGggdGhlIHRvb2wgc3RpbGwgbWlkLWZsaWdodCAoZS5nLiBleHRlcm5hbFxuXHRcdC8vIGNhbmNlbGxhdGlvbiksIHNldHRsZSB0aGUgaW52b2NhdGlvbiBzbyB0aGUgVUkgZG9lcyBub3QgZ2V0IHN0dWNrLlxuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKCFJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUoaW52b2NhdGlvbikpIHtcblx0XHRcdFx0aW52b2NhdGlvbi5kaWRFeGVjdXRlVG9vbCh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKiBUcmFuc2l0aW9ucyBhbiBpbnZvY2F0aW9uIGZyb20gc3RyZWFtaW5nIG9uY2UgaXRzIEFIUCB0b29sIGNhbGwgaXMgcmVhZHkuICovXG5cdHByaXZhdGUgX2Vuc3VyZUxlZnRTdHJlYW1pbmcoXG5cdFx0aW52b2NhdGlvbjogQ2hhdFRvb2xJbnZvY2F0aW9uLFxuXHRcdHRjOiBUb29sQ2FsbFN0YXRlLFxuXHRcdG9wdHM6IElPYnNlcnZlVHVybk9wdGlvbnMsXG5cdCk6IHZvaWQge1xuXHRcdGlmIChpbnZvY2F0aW9uLnN0YXRlLnJlYWQodW5kZWZpbmVkKS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5TdHJlYW1pbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcHJlcGFyZWQgPSB0b29sQ2FsbFN0YXRlVG9QcmVwYXJlZEludm9jYXRpb24odGMsIG9wdHMuYmFja2VuZFNlc3Npb24sIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5LCBvcHRzLnNlc3Npb25SZXNvdXJjZS5hdXRob3JpdHkpO1xuXHRcdGludm9jYXRpb24udHJhbnNpdGlvbkZyb21TdHJlYW1pbmcocHJlcGFyZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBPYnNlcnZlcyB0aGUgY2hpbGQgY2hhdCBmb3IgYW55IHN1YmFnZW50LXNwYXduaW5nIHRvb2wsIGluY2x1ZGluZyBjbGllbnQtcHJvdmlkZWQgZGVsZWdhdGVkIHRhc2tzLlxuXHQgKi9cblx0cHJpdmF0ZSBfdHJ5T2JzZXJ2ZVN1YmFnZW50VG9vbENhbGwoXG5cdFx0dG9vbENhbGw6IFRvb2xDYWxsU3RhdGUsXG5cdFx0aW52b2NhdGlvbjogQ2hhdFRvb2xJbnZvY2F0aW9uLFxuXHRcdHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUsXG5cdFx0b3B0czogSU9ic2VydmVUdXJuT3B0aW9ucyxcblx0XHRzdWJhZ2VudENvbnRleHQ6IElTdWJhZ2VudENvbnRleHQsXG5cdCk6IHZvaWQge1xuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSB0b29sQ2FsbC50b29sQ2FsbElkO1xuXHRcdGNvbnN0IGhhc1N1YmFnZW50Q29udGVudCA9ICh0b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcgfHwgdG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQpXG5cdFx0XHQmJiAhIWdldFRvb2xTdWJhZ2VudENvbnRlbnQodG9vbENhbGwpO1xuXHRcdGlmICghaXNTdWJhZ2VudFRvb2wodG9vbENhbGwpICYmICFoYXNTdWJhZ2VudENvbnRlbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc09ic2VydmVkID0gc3ViYWdlbnRDb250ZXh0Lm9ic2VydmF0aW9ucy5oYXModG9vbENhbGxJZCk7XG5cdFx0Y29uc3QgY3VycmVudERhdGEgPSBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcgPyBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcHJlcGFyZWQgPSB0b29sQ2FsbFN0YXRlVG9QcmVwYXJlZEludm9jYXRpb24odG9vbENhbGwsIG9wdHMuYmFja2VuZFNlc3Npb24sIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5LCBvcHRzLnNlc3Npb25SZXNvdXJjZS5hdXRob3JpdHkpO1xuXHRcdGNvbnN0IHByb3RvY29sRGF0YSA9IHByZXBhcmVkLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcgPyBwcmVwYXJlZC50b29sU3BlY2lmaWNEYXRhIDogdW5kZWZpbmVkO1xuXHRcdGlmICghcHJvdG9jb2xEYXRhKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNoYXRSZXNvdXJjZSA9IHByb3RvY29sRGF0YS5jaGF0UmVzb3VyY2UgPz8gY3VycmVudERhdGE/LmNoYXRSZXNvdXJjZTtcblx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHByb3RvY29sRGF0YS5kZXNjcmlwdGlvbiA/PyBjdXJyZW50RGF0YT8uZGVzY3JpcHRpb247XG5cdFx0Y29uc3QgYWdlbnROYW1lID0gcHJvdG9jb2xEYXRhLmFnZW50TmFtZSA/PyBjdXJyZW50RGF0YT8uYWdlbnROYW1lO1xuXHRcdGlmICghY3VycmVudERhdGFcblx0XHRcdHx8IGN1cnJlbnREYXRhLmNoYXRSZXNvdXJjZSAhPT0gY2hhdFJlc291cmNlXG5cdFx0XHR8fCBjdXJyZW50RGF0YS5kZXNjcmlwdGlvbiAhPT0gZGVzY3JpcHRpb25cblx0XHRcdHx8IGN1cnJlbnREYXRhLmFnZW50TmFtZSAhPT0gYWdlbnROYW1lKSB7XG5cdFx0XHRpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgPSB7XG5cdFx0XHRcdC4uLmN1cnJlbnREYXRhLFxuXHRcdFx0XHQuLi5wcm90b2NvbERhdGEsXG5cdFx0XHRcdGNoYXRSZXNvdXJjZSxcblx0XHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRcdGFnZW50TmFtZSxcblx0XHRcdFx0aXNBY3RpdmU6IGN1cnJlbnREYXRhPy5pc0FjdGl2ZSA/PyBpc09ic2VydmVkLFxuXHRcdFx0fTtcblx0XHRcdGludm9jYXRpb24ubm90aWZ5VG9vbFNwZWNpZmljRGF0YUNoYW5nZWQoKTtcblx0XHR9XG5cblx0XHRpZiAoaXNPYnNlcnZlZCAmJiAhc2hvdWxkT2JzZXJ2ZVN1YmFnZW50Q2hhdCh0b29sQ2FsbCkpIHtcblx0XHRcdHN1YmFnZW50Q29udGV4dC5vYnNlcnZhdGlvbnMuZGVsZXRlQW5kRGlzcG9zZSh0b29sQ2FsbElkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGlzT2JzZXJ2ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFzaG91bGRPYnNlcnZlU3ViYWdlbnRDaGF0KHRvb2xDYWxsKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN1YmFnZW50RGF0YSA9IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YTtcblx0XHRpZiAoc3ViYWdlbnREYXRhPy5raW5kICE9PSAnc3ViYWdlbnQnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG9ic2VydmF0aW9uU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3ViYWdlbnRDb250ZXh0Lm9ic2VydmF0aW9ucy5zZXQodG9vbENhbGxJZCwgb2JzZXJ2YXRpb25TdG9yZSk7XG5cdFx0c3ViYWdlbnREYXRhLmlzQWN0aXZlID0gdHJ1ZTtcblx0XHRpbnZvY2F0aW9uLm5vdGlmeVRvb2xTcGVjaWZpY0RhdGFDaGFuZ2VkKCk7XG5cblx0XHRjb25zdCBwZXJJbnZvY2F0aW9uQ3JlZGl0cyA9IG9ic2VydmFibGVWYWx1ZTxudW1iZXI+KCdzdWJhZ2VudEludm9jYXRpb25DcmVkaXRzJywgMCk7XG5cdFx0b2JzZXJ2YXRpb25TdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgdG90YWwgPSBwZXJJbnZvY2F0aW9uQ3JlZGl0cy5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAodG90YWwgPiAwICYmIGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50JyAmJiBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuY3JlZGl0cyAhPT0gdG90YWwpIHtcblx0XHRcdFx0aW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmNyZWRpdHMgPSB0b3RhbDtcblx0XHRcdFx0aW52b2NhdGlvbi5ub3RpZnlUb29sU3BlY2lmaWNEYXRhQ2hhbmdlZCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHBlckludm9jYXRpb25Nb2RlbCA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmcgfCB1bmRlZmluZWQ+KCdzdWJhZ2VudEludm9jYXRpb25Nb2RlbCcsIHVuZGVmaW5lZCk7XG5cdFx0b2JzZXJ2YXRpb25TdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWxOYW1lID0gcGVySW52b2NhdGlvbk1vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChtb2RlbE5hbWUgJiYgaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnICYmIGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5tb2RlbE5hbWUgIT09IG1vZGVsTmFtZSkge1xuXHRcdFx0XHRpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEubW9kZWxOYW1lID0gbW9kZWxOYW1lO1xuXHRcdFx0XHRpbnZvY2F0aW9uLm5vdGlmeVRvb2xTcGVjaWZpY0RhdGFDaGFuZ2VkKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgcm9vdEludm9jYXRpb25JZCA9IG9wdHMuc3ViQWdlbnRJbnZvY2F0aW9uSWQgPz8gdG9vbENhbGxJZDtcblx0XHRjb25zdCBjaGlsZENoYXRVcmkgPSBzdWJhZ2VudERhdGEuY2hhdFJlc291cmNlXG5cdFx0XHR8fCBidWlsZFN1YmFnZW50Q2hhdFVyaShvcHRzLmJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCksIHRvb2xDYWxsSWQpO1xuXHRcdHRoaXMuX29ic2VydmVTdWJhZ2VudFNlc3Npb24ob3B0cy5zZXNzaW9uUmVzb3VyY2UsIG9wdHMuYmFja2VuZFNlc3Npb24sIHRvb2xDYWxsSWQsIGNoaWxkQ2hhdFVyaSwgcm9vdEludm9jYXRpb25JZCwgaW52b2NhdGlvbiwgb3B0cy5zaW5rLCBvYnNlcnZhdGlvblN0b3JlLCBzdWJhZ2VudENvbnRleHQsIHBlckludm9jYXRpb25DcmVkaXRzLCBwZXJJbnZvY2F0aW9uTW9kZWwpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFBlci1jYWxsIHNldHVwIGZvciBhIGNsaWVudC1wcm92aWRlZCB0b29sLiBUaGUgb2JzZXJ2ZXIgb25seSByZW5kZXJzOiBpdFxuXHQgKiBvYnRhaW5zIHRoZSBzaGFyZWQge0BsaW5rIENoYXRUb29sSW52b2NhdGlvbn0gKGNyZWF0ZWQgYnkgd2hpY2hldmVyIG9mXG5cdCAqIHRoaXMgb2JzZXJ2ZXIgb3IgdGhlIHNlc3Npb24tbGV2ZWwgd2F0Y2hlciBhcnJpdmVzIGZpcnN0KSwgZW1pdHMgaXQgaW50b1xuXHQgKiB0aGlzIGNoYXQgc28gaXQgcmVuZGVycyBpbiB0aGUgY29ycmVjdCBncm91cCwgZHJpdmVzIHN1YmFnZW50XG5cdCAqIHByZXNlbnRhdGlvbiwgYW5kIGRpc3BhdGNoZXMgYENoYXRUb29sQ2FsbENvbmZpcm1lZGAgZnJvbSB0aGVcblx0ICogaW52b2NhdGlvbidzIGNvbmZpcm1hdGlvbiBnYXRlLiBJdCBuZXZlciBpbnZva2VzIHRoZSB0b29sIFx1MjAxNCB0aGVcblx0ICogc2Vzc2lvbi1sZXZlbCB3YXRjaGVyIG93bnMgZXhlY3V0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2V0dXBDbGllbnRUb29sQ2FsbChcblx0XHRpbml0aWFsOiBUb29sQ2FsbFN0YXRlLFxuXHRcdHBhcnQkOiBJT2JzZXJ2YWJsZTxUb29sQ2FsbFJlc3BvbnNlUGFydD4sXG5cdFx0c3RvcmU6IERpc3Bvc2FibGVTdG9yZSxcblx0XHRvcHRzOiBJT2JzZXJ2ZVR1cm5PcHRpb25zLFxuXHRcdHN1YmFnZW50Q29udGV4dDogSVN1YmFnZW50Q29udGV4dCxcblx0KTogdm9pZCB7XG5cdFx0Y29uc3QgdG9vbENhbGxJZCA9IGluaXRpYWwudG9vbENhbGxJZDtcblx0XHRjb25zdCB0b29sTmFtZSA9IGluaXRpYWwudG9vbE5hbWU7XG5cblx0XHQvLyBSZWNvbm5lY3QgYWRvcHRpb246IHNldHRsZSBhbnkgc25hcHNob3QgaW52b2NhdGlvbiBzbyB0aGUgc2hhcmVkXG5cdFx0Ly8gaW52b2NhdGlvbiBjYW4gdGFrZSBvdmVyIHRoZSBVSSBzbG90IHJhdGhlciB0aGFuIGxlYXZpbmcgdGhlIG9sZFxuXHRcdC8vIGluc3RhbmNlIG9ycGhhbmVkLlxuXHRcdGNvbnN0IGFkb3B0ZWQgPSBvcHRzLmFkb3B0SW52b2NhdGlvbnM/LmdldCh0b29sQ2FsbElkKTtcblx0XHRpZiAoYWRvcHRlZCAmJiAhSUNoYXRUb29sSW52b2NhdGlvbi5pc0NvbXBsZXRlKGFkb3B0ZWQpKSB7XG5cdFx0XHRhZG9wdGVkLmRpZEV4ZWN1dGVUb29sKHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2xpZW50VG9vbE5hbWUgPSB0b29sTmFtZSA9PT0gUlVOVElNRV9UT09MX1NFQVJDSF9UT09MX05BTUUgPyBDTElFTlRfVE9PTF9TRUFSQ0hfUkVGRVJFTkNFX05BTUUgOiB0b29sTmFtZTtcblx0XHRjb25zdCB0b29sRGF0YSA9IHRoaXMuX3Rvb2xzU2VydmljZS5nZXRUb29sQnlOYW1lKGNsaWVudFRvb2xOYW1lKTtcblx0XHRpZiAoIXRvb2xEYXRhKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RdIENsaWVudCB0b29sIGNhbGwgZm9yIHVua25vd24gdG9vbDogJHt0b29sTmFtZX1gKTtcblx0XHRcdHRoaXMuX2Rpc3BhdGNoQWN0aW9uKG9wdHMuYmFja2VuZFNlc3Npb24sIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiBvcHRzLnR1cm5JZCxcblx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogYFRvb2wgXCIke3Rvb2xOYW1lfVwiIGlzIG5vdCBhdmFpbGFibGVgLFxuXHRcdFx0XHRcdGVycm9yOiB7IG1lc3NhZ2U6IGBUb29sIFwiJHt0b29sTmFtZX1cIiBpcyBub3QgYXZhaWxhYmxlIG9uIHRoaXMgY2xpZW50YCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwgb3B0cy5jaGF0VVJJKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpbnZvY2F0aW9uID0gdGhpcy5fZW5zdXJlQ2xpZW50VG9vbEludm9jYXRpb24ob3B0cy5jaGF0VVJJLCBvcHRzLnR1cm5JZCwgdG9vbENhbGxJZCwgdG9vbERhdGEuaWQsIG9wdHMuc3ViQWdlbnRJbnZvY2F0aW9uSWQpO1xuXHRcdGlmICghaW52b2NhdGlvbikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0XSBGYWlsZWQgdG8gYmVnaW4gY2xpZW50IHRvb2wgaW52b2NhdGlvbjogJHt0b29sTmFtZX1gKTtcblx0XHRcdHRoaXMuX2Rpc3BhdGNoQWN0aW9uKG9wdHMuYmFja2VuZFNlc3Npb24sIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiBvcHRzLnR1cm5JZCxcblx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogYEZhaWxlZCB0byBzdGFydCAke3Rvb2xOYW1lfWAsXG5cdFx0XHRcdFx0ZXJyb3I6IHsgbWVzc2FnZTogYENvdWxkIG5vdCBjcmVhdGUgaW52b2NhdGlvbiBmb3IgY2xpZW50IHRvb2wgXCIke3Rvb2xOYW1lfVwiYCB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwgb3B0cy5jaGF0VVJJKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaXNTdWJhZ2VudFRvb2woaW5pdGlhbCkpIHtcblx0XHRcdGNvbnN0IHByZXBhcmVkID0gdG9vbENhbGxTdGF0ZVRvUHJlcGFyZWRJbnZvY2F0aW9uKGluaXRpYWwsIG9wdHMuYmFja2VuZFNlc3Npb24sIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5LCBvcHRzLnNlc3Npb25SZXNvdXJjZS5hdXRob3JpdHkpO1xuXHRcdFx0aWYgKHByZXBhcmVkLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcpIHtcblx0XHRcdFx0aW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhID0gcHJlcGFyZWQudG9vbFNwZWNpZmljRGF0YTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fdHJ5T2JzZXJ2ZVN1YmFnZW50VG9vbENhbGwoaW5pdGlhbCwgaW52b2NhdGlvbiwgc3RvcmUsIG9wdHMsIHN1YmFnZW50Q29udGV4dCk7XG5cblx0XHQvLyBUaGUgc2hhcmVkIGludm9jYXRpb24gaXMgY3JlYXRlZCB3aXRoIG5vIGBzZXNzaW9uUmVzb3VyY2VgLCBzbyBpdFxuXHRcdC8vIGRvZXMgbm90IGBhcHBlbmRQcm9ncmVzc2AgaW50byBhIGNoYXQgbW9kZWwuIEVtaXQgaXQgZXhwbGljaXRseSBzbyBpdFxuXHRcdC8vIHJlbmRlcnMgaW4gdGhpcyBjaGF0IC8gc3ViYWdlbnQgZ3JvdXAgKG1pcnJvcnMgYF9zZXR1cFNlcnZlclRvb2xDYWxsYCkuXG5cdFx0b3B0cy5zaW5rKFtpbnZvY2F0aW9uXSk7XG5cblx0XHRsZXQgY29uZmlybWF0aW9uRGlzcGF0Y2hlZCA9IGZhbHNlO1xuXG5cdFx0Ly8gRHJpdmUgYENoYXRUb29sQ2FsbENvbmZpcm1lZGAgZnJvbSB0aGUgaW52b2NhdGlvbidzIGNvbmZpcm1hdGlvblxuXHRcdC8vIGdhdGUuIFRoZSB3YXRjaGVyJ3MgYGludm9rZVRvb2xgIHRyYW5zaXRpb25zIHRoZSBzaGFyZWQgaW52b2NhdGlvbjtcblx0XHQvLyB0aGlzIHJlcG9ydHMgdGhlIG91dGNvbWUgdG8gdGhlIHByb3RvY29sLiBUaGUgYXV0b3J1biBydW5zXG5cdFx0Ly8gc3luY2hyb25vdXNseSBtYW55IHRpbWVzOyB0aGUgZ3VhcmQga2VlcHMgaXQgaWRlbXBvdGVudC5cblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBpbnZvY2F0aW9uLnN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChjb25maXJtYXRpb25EaXNwYXRjaGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcpIHtcblx0XHRcdFx0Y29uZmlybWF0aW9uRGlzcGF0Y2hlZCA9IHRydWU7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGVkT3B0aW9uSWQgPSBzdGF0ZS5jb25maXJtZWQudHlwZSA9PT0gVG9vbENvbmZpcm1LaW5kLlVzZXJBY3Rpb24gPyBzdGF0ZS5jb25maXJtZWQuc2VsZWN0ZWRCdXR0b24gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IGFwcHJvdmVkID0gc3RhdGUuY29uZmlybWVkLnR5cGUgIT09IFRvb2xDb25maXJtS2luZC5Vc2VyQWN0aW9uXG5cdFx0XHRcdFx0fHwgc3RhdGUuY29uZmlybWVkLnNlbGVjdGVkQnV0dG9uS2luZCAhPT0gQ29uZmlybWF0aW9uT3B0aW9uS2luZC5EZW55O1xuXHRcdFx0XHR0aGlzLl9yZXNvbHZlVG9vbENhbGwob3B0cy5jaGF0VVJJLCBvcHRzLnR1cm5JZCwgdG9vbENhbGxJZCwgYXBwcm92ZWRcblx0XHRcdFx0XHQ/IHtcblx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkLFxuXHRcdFx0XHRcdFx0dHVybklkOiBvcHRzLnR1cm5JZCxcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0XHRhcHByb3ZlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdGNvbmZpcm1lZDogY29uZmlybWVkUmVhc29uVG9Qcm90b2NvbChzdGF0ZS5jb25maXJtZWQpLFxuXHRcdFx0XHRcdFx0Li4uKHNlbGVjdGVkT3B0aW9uSWQgPyB7IHNlbGVjdGVkT3B0aW9uSWQgfSA6IHt9KSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0OiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbmZpcm1lZCxcblx0XHRcdFx0XHRcdHR1cm5JZDogb3B0cy50dXJuSWQsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRcdFx0YXBwcm92ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdFx0cmVhc29uOiBUb29sQ2FsbENhbmNlbGxhdGlvblJlYXNvbi5EZW5pZWQsXG5cdFx0XHRcdFx0XHQuLi4oc2VsZWN0ZWRPcHRpb25JZCA/IHsgc2VsZWN0ZWRPcHRpb25JZCB9IDoge30pLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5DYW5jZWxsZWQpIHtcblx0XHRcdFx0Ly8gUHJlLWV4ZWN1dGlvbiBjYW5jZWxsYXRpb24gKGEgZGVuaWVkIGNvbmZpcm1hdGlvbikuIElmIHRoZVxuXHRcdFx0XHQvLyBwcm90b2NvbCBjYWxsIGFscmVhZHkgcmVhY2hlZCBhIHRlcm1pbmFsIHN0YXRlIHRoZSBzZXJ2ZXJcblx0XHRcdFx0Ly8gZHJvdmUgaXQsIHNvIHN1cHByZXNzIHRoZSBkaXNwYXRjaC5cblx0XHRcdFx0Y29uZmlybWF0aW9uRGlzcGF0Y2hlZCA9IHRydWU7XG5cdFx0XHRcdGNvbnN0IHN0YXR1cyA9IHBhcnQkLnJlYWQodW5kZWZpbmVkKS50b29sQ2FsbC5zdGF0dXM7XG5cdFx0XHRcdGlmIChzdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNhbmNlbGxlZCB8fCBzdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9yZXNvbHZlVG9vbENhbGwob3B0cy5jaGF0VVJJLCBvcHRzLnR1cm5JZCwgdG9vbENhbGxJZCwge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkLFxuXHRcdFx0XHRcdHR1cm5JZDogb3B0cy50dXJuSWQsXG5cdFx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0XHRhcHByb3ZlZDogZmFsc2UsXG5cdFx0XHRcdFx0cmVhc29uOiBUb29sQ2FsbENhbmNlbGxhdGlvblJlYXNvbi5EZW5pZWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IHBhcnQkLnJlYWQocmVhZGVyKS50b29sQ2FsbDtcblx0XHRcdHRoaXMuX3RyeU9ic2VydmVTdWJhZ2VudFRvb2xDYWxsKHRjLCBpbnZvY2F0aW9uLCBzdG9yZSwgb3B0cywgc3ViYWdlbnRDb250ZXh0KTtcblx0XHRcdGNvbnN0IGNhbmNlbGxhdGlvbiA9IHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ2FuY2VsbGVkXG5cdFx0XHRcdD8ge1xuXHRcdFx0XHRcdHJlYXNvbjogdGMucmVhc29uID09PSBUb29sQ2FsbENhbmNlbGxhdGlvblJlYXNvbi5Ta2lwcGVkID8gVG9vbENvbmZpcm1LaW5kLlNraXBwZWQgOiBUb29sQ29uZmlybUtpbmQuRGVuaWVkLFxuXHRcdFx0XHRcdHJlYXNvbk1lc3NhZ2U6IHRjLnJlYXNvbk1lc3NhZ2UgPyBzdHJpbmdPck1hcmtkb3duVG9TdHJpbmcodGMucmVhc29uTWVzc2FnZSwgdGhpcy5fY29uZmlnLmNvbm5lY3Rpb25BdXRob3JpdHkpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9IGFzIGNvbnN0XG5cdFx0XHRcdDogdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgJiYgIXRjLnN1Y2Nlc3MgJiYgdGMuZXJyb3I/LmNvZGUgPT09ICdjYW5jZWxsZWQnXG5cdFx0XHRcdFx0PyB7IHJlYXNvbjogVG9vbENvbmZpcm1LaW5kLlNraXBwZWQsIHJlYXNvbk1lc3NhZ2U6IHRjLmVycm9yLm1lc3NhZ2UgfSBhcyBjb25zdFxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGNhbmNlbGxhdGlvbiAmJiAhaW52b2NhdGlvbi5jYW5jZWxGcm9tU3RyZWFtaW5nKGNhbmNlbGxhdGlvbi5yZWFzb24sIGNhbmNlbGxhdGlvbi5yZWFzb25NZXNzYWdlKSkge1xuXHRcdFx0XHRJQ2hhdFRvb2xJbnZvY2F0aW9uLmNvbmZpcm1XaXRoKGludm9jYXRpb24sIHsgdHlwZTogY2FuY2VsbGF0aW9uLnJlYXNvbiB9KTtcblx0XHRcdH1cblx0XHRcdGlmICgodGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5DYW5jZWxsZWQgfHwgdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQpXG5cdFx0XHRcdCYmICFJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUoaW52b2NhdGlvbiwgcmVhZGVyKSkge1xuXHRcdFx0XHRjb25zdCBmaWxlRWRpdHMgPSBmaW5hbGl6ZVRvb2xJbnZvY2F0aW9uKGludm9jYXRpb24sIHRjLCBvcHRzLmJhY2tlbmRTZXNzaW9uLCB0aGlzLl9jb25maWcuY29ubmVjdGlvbkF1dGhvcml0eSk7XG5cdFx0XHRcdGlmIChmaWxlRWRpdHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdG9wdHMub25GaWxlRWRpdHM/Lih0YywgZmlsZUVkaXRzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldHVwSW5wdXRSZXF1ZXN0UGFydChcblx0XHRwYXJ0JDogSU9ic2VydmFibGU8SW5wdXRSZXF1ZXN0UmVzcG9uc2VQYXJ0Pixcblx0XHRzdG9yZTogRGlzcG9zYWJsZVN0b3JlLFxuXHRcdG9wdHM6IElPYnNlcnZlVHVybk9wdGlvbnMsXG5cdCk6IHZvaWQge1xuXHRcdGNvbnN0IGlucHV0UmVxID0gcGFydCQuZ2V0KCkucmVxdWVzdDtcblx0XHQvLyBDbGFpbSB0aGUgZWxpY2l0YXRpb24gc28gdGhlIHNlc3Npb24tbGV2ZWwgcmVzcG9uZGVyIGRvZXMgbm90IGNhbmNlbFxuXHRcdC8vIGl0IHdoaWxlIGFuIG9ic2VydmVyIGlzIHJlbmRlcmluZyBpdC4gVGhpcyBjb3ZlcnMgYWxsIHRocmVlIHJlbmRlclxuXHRcdC8vIHBhdGhzIGJlbG93LCBzaW5jZSBlYWNoIGlzIHJlYWNoZWQgb25seSB0aHJvdWdoIHRoaXMgbWV0aG9kLlxuXHRcdHN0b3JlLmFkZCh0aGlzLl9tYXJrSW5wdXRSZXF1ZXN0UmVuZGVyZWQob3B0cy5jaGF0VVJJLCBpbnB1dFJlcS5pZCwgb3B0cy5zZXNzaW9uUmVzb3VyY2UpKTtcblx0XHRjb25zdCBwbGFuUmV2aWV3ID0gKGlucHV0UmVxIGFzIENoYXRJbnB1dFJlcXVlc3RXaXRoUGxhblJldmlldykucGxhblJldmlldztcblx0XHRpZiAocGxhblJldmlldykge1xuXHRcdFx0dGhpcy5fc2V0dXBQbGFuUmV2aWV3SW5wdXRSZXF1ZXN0KHBhcnQkLCBwbGFuUmV2aWV3LCBzdG9yZSwgb3B0cyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGlucHV0UmVxLnVybCkge1xuXHRcdFx0dGhpcy5fc2V0dXBVcmxJbnB1dFJlcXVlc3QocGFydCQsIGlucHV0UmVxLnVybCwgc3RvcmUsIG9wdHMpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlSW5wdXRSZXF1ZXN0Q2Fyb3VzZWwoaW5wdXRSZXEsIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5KTtcblx0XHRvcHRzLnNpbmsoW2Nhcm91c2VsXSk7XG5cblx0XHRsZXQgY29tcGxldGVkRnJvbVNlcnZlciA9IGZhbHNlO1xuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gcGFydCQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHBhcnQucmVzcG9uc2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb21wbGV0ZWRGcm9tU2VydmVyID0gdHJ1ZTtcblx0XHRcdGNvbnN0IHByb3RvY29sQW5zd2VycyA9IHBhcnQucmVzcG9uc2UgPT09IENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHRcblx0XHRcdFx0PyBwYXJ0LnJlcXVlc3QuYW5zd2Vyc1xuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGNhcm91c2VsQW5zd2VycyA9IGNvbnZlcnRQcm90b2NvbEFuc3dlcnMocHJvdG9jb2xBbnN3ZXJzKTtcblx0XHRcdGNvbnN0IHdhc1VzZWQgPSBjYXJvdXNlbC5pc1VzZWQ7XG5cdFx0XHRjYXJvdXNlbC5kYXRhID0gY2Fyb3VzZWxBbnN3ZXJzID8/IHt9O1xuXHRcdFx0Y2Fyb3VzZWwuaXNVc2VkID0gdHJ1ZTtcblx0XHRcdGNhcm91c2VsLmFuc3dlcmVkRXh0ZXJuYWxseSA9IHBhcnQucmVzcG9uc2UgPT09IENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQgJiYgIWNhcm91c2VsQW5zd2Vycztcblx0XHRcdGNhcm91c2VsLmF1dG9SZXBseSA9IGNvbnRhaW5zQXV0b21hdGljUmVwbHlBbnN3ZXIocHJvdG9jb2xBbnN3ZXJzKTtcblx0XHRcdGNhcm91c2VsLmFuc3dlcmVkRXh0ZXJuYWxseSB8fD0gY2Fyb3VzZWwuYXV0b1JlcGx5O1xuXHRcdFx0Y2Fyb3VzZWwuZHJhZnRBbnN3ZXJzID0gdW5kZWZpbmVkO1xuXHRcdFx0Y2Fyb3VzZWwuZHJhZnRDdXJyZW50SW5kZXggPSB1bmRlZmluZWQ7XG5cdFx0XHRjYXJvdXNlbC5kcmFmdENvbGxhcHNlZCA9IHVuZGVmaW5lZDtcblx0XHRcdGNhcm91c2VsLmNvbXBsZXRpb24uY29tcGxldGUoeyBhbnN3ZXJzOiBjYXJvdXNlbEFuc3dlcnMgfSk7XG5cdFx0XHRpZiAoIXdhc1VzZWQpIHtcblx0XHRcdFx0dGhpcy5fY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2Uob3B0cy5zZXNzaW9uUmVzb3VyY2UpPy5pbnB1dC5jbGVhclF1ZXN0aW9uQ2Fyb3VzZWwodW5kZWZpbmVkLCBpbnB1dFJlcS5pZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y2Fyb3VzZWwuY29tcGxldGlvbi5wLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGlmIChzdG9yZS5pc0Rpc3Bvc2VkIHx8IGNvbXBsZXRlZEZyb21TZXJ2ZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFyZXN1bHQuYW5zd2Vycykge1xuXHRcdFx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbi5kaXNwYXRjaChvcHRzLmNoYXRVUkksIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRJbnB1dENvbXBsZXRlZCxcblx0XHRcdFx0XHRyZXF1ZXN0SWQ6IGlucHV0UmVxLmlkLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQ2FuY2VsLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IGFuc3dlcnMgPSBjb252ZXJ0Q2Fyb3VzZWxBbnN3ZXJzKHJlc3VsdC5hbnN3ZXJzLCBpbnB1dFJlcS5xdWVzdGlvbnMpO1xuXHRcdFx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbi5kaXNwYXRjaChvcHRzLmNoYXRVUkksIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRJbnB1dENvbXBsZXRlZCxcblx0XHRcdFx0XHRyZXF1ZXN0SWQ6IGlucHV0UmVxLmlkLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQWNjZXB0LFxuXHRcdFx0XHRcdGFuc3dlcnMsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKG9wdHMuY2FuY2VsbGF0aW9uVG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdGNhcm91c2VsLmNvbXBsZXRpb24uY29tcGxldGUoeyBhbnN3ZXJzOiB1bmRlZmluZWQgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHRva2VuTGlzdGVuZXIgPSBvcHRzLmNhbmNlbGxhdGlvblRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdFx0Y2Fyb3VzZWwuY29tcGxldGlvbi5jb21wbGV0ZSh7IGFuc3dlcnM6IHVuZGVmaW5lZCB9KTtcblx0XHRcdH0pO1xuXHRcdFx0Y2Fyb3VzZWwuY29tcGxldGlvbi5wLmZpbmFsbHkoKCkgPT4gdG9rZW5MaXN0ZW5lci5kaXNwb3NlKCkpO1xuXHRcdH1cblxuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKGNhcm91c2VsLmlzVXNlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjYXJvdXNlbC5kYXRhID0ge307XG5cdFx0XHRjYXJvdXNlbC5pc1VzZWQgPSB0cnVlO1xuXHRcdFx0Y2Fyb3VzZWwuZHJhZnRBbnN3ZXJzID0gdW5kZWZpbmVkO1xuXHRcdFx0Y2Fyb3VzZWwuZHJhZnRDdXJyZW50SW5kZXggPSB1bmRlZmluZWQ7XG5cdFx0XHRjYXJvdXNlbC5kcmFmdENvbGxhcHNlZCA9IHVuZGVmaW5lZDtcblx0XHRcdGNhcm91c2VsLmNvbXBsZXRpb24uY29tcGxldGUoeyBhbnN3ZXJzOiB1bmRlZmluZWQgfSk7XG5cdFx0XHR0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeVNlc3Npb25SZXNvdXJjZShvcHRzLnNlc3Npb25SZXNvdXJjZSk/LmlucHV0LmNsZWFyUXVlc3Rpb25DYXJvdXNlbCh1bmRlZmluZWQsIGlucHV0UmVxLmlkKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXR1cFBsYW5SZXZpZXdJbnB1dFJlcXVlc3QoXG5cdFx0cGFydCQ6IElPYnNlcnZhYmxlPElucHV0UmVxdWVzdFJlc3BvbnNlUGFydD4sXG5cdFx0cGxhblJldmlldzogSUFnZW50SG9zdFBsYW5SZXZpZXcsXG5cdFx0c3RvcmU6IERpc3Bvc2FibGVTdG9yZSxcblx0XHRvcHRzOiBJT2JzZXJ2ZVR1cm5PcHRpb25zLFxuXHQpOiB2b2lkIHtcblx0XHRjb25zdCBpbnB1dFJlcSA9IHBhcnQkLmdldCgpLnJlcXVlc3Q7XG5cdFx0Y29uc3QgcmV2aWV3ID0gY3JlYXRlSW5wdXRSZXF1ZXN0UGxhblJldmlldyhpbnB1dFJlcSwgcGxhblJldmlldyk7XG5cdFx0b3B0cy5zaW5rKFtyZXZpZXddKTtcblxuXHRcdGxldCBpbnB1dENvbXBsZXRlZCA9IGZhbHNlO1xuXHRcdGxldCBsYXRlc3RSZXN1bHQ6IElDaGF0UGxhblJldmlld1Jlc3VsdCB8IHVuZGVmaW5lZCA9IGNvbnZlcnRQcm90b2NvbFBsYW5SZXZpZXdSZXN1bHQocGxhblJldmlldywgQ2hhdElucHV0UmVzcG9uc2VLaW5kLkFjY2VwdCwgaW5wdXRSZXEuYW5zd2Vycyk7XG5cdFx0bGV0IHBsYW5SZXZpZXdDbGVhcmVkID0gZmFsc2U7XG5cdFx0Y29uc3QgY2xlYXJQbGFuUmV2aWV3ID0gKCkgPT4ge1xuXHRcdFx0aWYgKHBsYW5SZXZpZXdDbGVhcmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHBsYW5SZXZpZXdDbGVhcmVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKG9wdHMuc2Vzc2lvblJlc291cmNlKT8uaW5wdXQuY2xlYXJQbGFuUmV2aWV3KHVuZGVmaW5lZCwgaW5wdXRSZXEuaWQpO1xuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcGFydCA9IHBhcnQkLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChwYXJ0LnJlc3BvbnNlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aW5wdXRDb21wbGV0ZWQgPSB0cnVlO1xuXHRcdFx0bGF0ZXN0UmVzdWx0ID0gY29udmVydFByb3RvY29sUGxhblJldmlld1Jlc3VsdChwbGFuUmV2aWV3LCBwYXJ0LnJlc3BvbnNlLCBwYXJ0LnJlcXVlc3QuYW5zd2Vycyk7XG5cdFx0XHRyZXZpZXcuZGF0YSA9IGxhdGVzdFJlc3VsdDtcblx0XHRcdHJldmlldy5pc1VzZWQgPSB0cnVlO1xuXHRcdFx0cmV2aWV3LmRyYWZ0RmVlZGJhY2sgPSB1bmRlZmluZWQ7XG5cdFx0XHRyZXZpZXcuZHJhZnRDb2xsYXBzZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR2b2lkIHJldmlldy5jb21wbGV0aW9uLmNvbXBsZXRlKGxhdGVzdFJlc3VsdCk7XG5cdFx0XHRjbGVhclBsYW5SZXZpZXcoKTtcblx0XHR9KSk7XG5cblx0XHRyZXZpZXcuY29tcGxldGlvbi5wLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGlmIChzdG9yZS5pc0Rpc3Bvc2VkIHx8IGlucHV0Q29tcGxldGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbXBsZXRpb24gPSByZXN1bHRcblx0XHRcdFx0PyBjb252ZXJ0UGxhblJldmlld1Jlc3VsdChwbGFuUmV2aWV3LCByZXN1bHQpXG5cdFx0XHRcdDogeyByZXNwb25zZTogQ2hhdElucHV0UmVzcG9uc2VLaW5kLkNhbmNlbCB9O1xuXHRcdFx0dGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uZGlzcGF0Y2gob3B0cy5jaGF0VVJJLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0Q29tcGxldGVkLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6IGlucHV0UmVxLmlkLFxuXHRcdFx0XHQuLi5jb21wbGV0aW9uLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRpZiAob3B0cy5jYW5jZWxsYXRpb25Ub2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV2aWV3LmRpc21pc3MoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgdG9rZW5MaXN0ZW5lciA9IG9wdHMuY2FuY2VsbGF0aW9uVG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gcmV2aWV3LmRpc21pc3MoKSk7XG5cdFx0XHRyZXZpZXcuY29tcGxldGlvbi5wLmZpbmFsbHkoKCkgPT4gdG9rZW5MaXN0ZW5lci5kaXNwb3NlKCkpO1xuXHRcdH1cblxuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0aWYgKCFyZXZpZXcuaXNVc2VkKSB7XG5cdFx0XHRcdGlmIChpbnB1dENvbXBsZXRlZCkge1xuXHRcdFx0XHRcdHJldmlldy5kYXRhID0gbGF0ZXN0UmVzdWx0O1xuXHRcdFx0XHRcdHJldmlldy5pc1VzZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHJldmlldy5kcmFmdEZlZWRiYWNrID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHJldmlldy5kcmFmdENvbGxhcHNlZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR2b2lkIHJldmlldy5jb21wbGV0aW9uLmNvbXBsZXRlKGxhdGVzdFJlc3VsdCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmV2aWV3LmRpc21pc3MoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y2xlYXJQbGFuUmV2aWV3KCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZSBhIFVSTC1zdHlsZSB7QGxpbmsgQ2hhdElucHV0UmVxdWVzdH0gYnkgcmVuZGVyaW5nIGFcblx0ICoge0BsaW5rIENoYXRFbGljaXRhdGlvblJlcXVlc3RQYXJ0fSB0aGF0IHByb21wdHMgdGhlIHVzZXIgdG8gb3BlbiB0aGVcblx0ICogVVJMLiBDbGlja2luZyB0aGUgYWNjZXB0IGJ1dHRvbiBvcGVucyB0aGUgVVJMIHZpYSB7QGxpbmsgSU9wZW5lclNlcnZpY2V9XG5cdCAqIGFuZCBkaXNwYXRjaGVzIGBDaGF0SW5wdXRDb21wbGV0ZWRgIHdpdGggYEFjY2VwdGA7IHJlamVjdCBkaXNwYXRjaGVzXG5cdCAqIGBEZWNsaW5lYDsgYWJhbmRvbm1lbnQgLyBjYW5jZWxsYXRpb24gZGlzcGF0Y2hlcyBgQ2FuY2VsYC5cblx0ICovXG5cdHByaXZhdGUgX3NldHVwVXJsSW5wdXRSZXF1ZXN0KFxuXHRcdHJlc3BvbnNlUGFydCQ6IElPYnNlcnZhYmxlPElucHV0UmVxdWVzdFJlc3BvbnNlUGFydD4sXG5cdFx0dXJsOiBzdHJpbmcsXG5cdFx0c3RvcmU6IERpc3Bvc2FibGVTdG9yZSxcblx0XHRvcHRzOiBJT2JzZXJ2ZVR1cm5PcHRpb25zLFxuXHQpOiB2b2lkIHtcblx0XHRjb25zdCBpbnB1dFJlcSA9IHJlc3BvbnNlUGFydCQuZ2V0KCkucmVxdWVzdDtcblx0XHRsZXQgY29tcGxldGlvbkRpc3BhdGNoZWQgPSBmYWxzZTtcblx0XHRsZXQgY29tcGxldGVkRnJvbVNlcnZlciA9IGZhbHNlO1xuXHRcdGNvbnN0IHNldHRsZSA9IChyZXNwb25zZTogQ2hhdElucHV0UmVzcG9uc2VLaW5kKSA9PiB7XG5cdFx0XHRpZiAoY29tcGxldGlvbkRpc3BhdGNoZWQgfHwgY29tcGxldGVkRnJvbVNlcnZlcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb21wbGV0aW9uRGlzcGF0Y2hlZCA9IHRydWU7XG5cdFx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbi5kaXNwYXRjaChvcHRzLmNoYXRVUkksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0SW5wdXRDb21wbGV0ZWQsXG5cdFx0XHRcdHJlcXVlc3RJZDogaW5wdXRSZXEuaWQsXG5cdFx0XHRcdHJlc3BvbnNlLFxuXHRcdFx0fSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHByZXNlbnRhdGlvbiA9IGdldFVybElucHV0UmVxdWVzdFByZXNlbnRhdGlvbihpbnB1dFJlcSwgdXJsKTtcblxuXHRcdGNvbnN0IHBhcnQgPSBuZXcgQ2hhdEVsaWNpdGF0aW9uUmVxdWVzdFBhcnQoXG5cdFx0XHRsb2NhbGl6ZSgnYWdlbnRIb3N0LmVsaWNpdC51cmwudGl0bGUnLCBcIkF1dGhvcml6YXRpb24gUmVxdWlyZWRcIiksXG5cdFx0XHRwcmVzZW50YXRpb24ubWVzc2FnZSxcblx0XHRcdCcnLFxuXHRcdFx0bG9jYWxpemUoJ2FnZW50SG9zdC5lbGljaXQudXJsLm9wZW4nLCBcIk9wZW4gezB9XCIsIHByZXNlbnRhdGlvbi5hdXRob3JpdHkpLFxuXHRcdFx0bG9jYWxpemUoJ2FnZW50SG9zdC5lbGljaXQudXJsLmNhbmNlbCcsIFwiQ2FuY2VsXCIpLFxuXHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IG9wZW5lZCA9IGF3YWl0IHRoaXMuX29wZW5lclNlcnZpY2Uub3Blbih1cmwsIHsgYWxsb3dDb21tYW5kczogZmFsc2UgfSk7XG5cdFx0XHRcdFx0aWYgKG9wZW5lZCkge1xuXHRcdFx0XHRcdFx0c2V0dGxlKENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIEVsaWNpdGF0aW9uU3RhdGUuQWNjZXB0ZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHNldHRsZShDaGF0SW5wdXRSZXNwb25zZUtpbmQuRGVjbGluZSk7XG5cdFx0XHRcdFx0cmV0dXJuIEVsaWNpdGF0aW9uU3RhdGUuUmVqZWN0ZWQ7XG5cdFx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRcdHNldHRsZShDaGF0SW5wdXRSZXNwb25zZUtpbmQuRGVjbGluZSk7XG5cdFx0XHRcdFx0cmV0dXJuIEVsaWNpdGF0aW9uU3RhdGUuUmVqZWN0ZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldHRsZShDaGF0SW5wdXRSZXNwb25zZUtpbmQuRGVjbGluZSk7XG5cdFx0XHRcdHJldHVybiBFbGljaXRhdGlvblN0YXRlLlJlamVjdGVkO1xuXHRcdFx0fSxcblx0XHQpO1xuXG5cdFx0b3B0cy5zaW5rKFtwYXJ0XSk7XG5cblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSByZXNwb25zZVBhcnQkLnJlYWQocmVhZGVyKS5yZXNwb25zZTtcblx0XHRcdGlmIChyZXNwb25zZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbXBsZXRlZEZyb21TZXJ2ZXIgPSB0cnVlO1xuXHRcdFx0cGFydC5zdGF0ZS5zZXQocmVzcG9uc2UgPT09IENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQgPyBFbGljaXRhdGlvblN0YXRlLkFjY2VwdGVkIDogRWxpY2l0YXRpb25TdGF0ZS5SZWplY3RlZCwgdW5kZWZpbmVkKTtcblx0XHRcdHBhcnQuaGlkZSgpO1xuXHRcdH0pKTtcblxuXHRcdGlmIChvcHRzLmNhbmNlbGxhdGlvblRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRzZXR0bGUoQ2hhdElucHV0UmVzcG9uc2VLaW5kLkNhbmNlbCk7XG5cdFx0XHRwYXJ0LmhpZGUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgdG9rZW5MaXN0ZW5lciA9IG9wdHMuY2FuY2VsbGF0aW9uVG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRzZXR0bGUoQ2hhdElucHV0UmVzcG9uc2VLaW5kLkNhbmNlbCk7XG5cdFx0XHRcdHBhcnQuaGlkZSgpO1xuXHRcdFx0fSk7XG5cdFx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRva2VuTGlzdGVuZXIuZGlzcG9zZSgpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gRGlzcG9zYWwgKHR1cm4gZW5kZWQpOiBpZiB0aGUgdXNlciBuZXZlciByZXNvbHZlZCB0aGUgcmVxdWVzdCxcblx0XHQvLyBkaXNwYXRjaCBDYW5jZWwgc28gdGhlIHNlcnZlciBpc24ndCBsZWZ0IGhhbmdpbmcuXG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRzZXR0bGUoQ2hhdElucHV0UmVzcG9uc2VLaW5kLkNhbmNlbCk7XG5cdFx0XHRwYXJ0LmhpZGUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogU3luY2hyb25pemVzIFBUWSBhbmQgbm9uLVBUWSB0ZXJtaW5hbCBjb250ZW50LCBpbmNsdWRpbmcgdGhlIGxpdmUtdG8tcmV0YWluZWQgb3V0cHV0IGhhbmRvZmYsIGFuZCB1cGRhdGVzIGludm9jYXRpb24gbWV0YWRhdGEuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXZpdmVUZXJtaW5hbElmTmVlZGVkKFxuXHRcdGludm9jYXRpb246IENoYXRUb29sSW52b2NhdGlvbixcblx0XHR0YzogVG9vbENhbGxTdGF0ZSxcblx0XHRiYWNrZW5kU2Vzc2lvbjogVVJJLFxuXHRcdG91dHB1dFRlcm1pbmFsQXR0YWNobWVudDogSU91dHB1dFRlcm1pbmFsQXR0YWNobWVudCxcblx0KTogdm9pZCB7XG5cdFx0Ly8gY29udGVudCBpcyBvbmx5IHByZXNlbnQgb24gUnVubmluZy9Db21wbGV0ZWQvUGVuZGluZ1Jlc3VsdENvbmZpcm1hdGlvbi5cblx0XHQvLyB0b29sSW5wdXQgaXMgcHJlc2VudCBvbiBhbGwgcG9zdC1zdHJlYW1pbmcgc3RhdGVzLlxuXHRcdGlmICh0Yy5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcgJiYgdGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgJiYgdGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nUmVzdWx0Q29uZmlybWF0aW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRlcm1pbmFsQ29udGVudCA9IGdldFRlcm1pbmFsQ29udGVudCh0Yy5jb250ZW50KTtcblx0XHRjb25zdCB0ZXJtaW5hbFVyaSA9IHRlcm1pbmFsQ29udGVudD8ucmVzb3VyY2U7XG5cdFx0Y29uc3QgdG9vbElucHV0ID0gZ2V0SW5saW5lVG9vbElucHV0KHRjLnRvb2xJbnB1dCk7XG5cdFx0aWYgKCF0ZXJtaW5hbENvbnRlbnQgfHwgIXRlcm1pbmFsVXJpIHx8ICF0b29sSW5wdXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aW52b2NhdGlvbi5wcmVzZW50YXRpb24gPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gbWFrZUFocFRlcm1pbmFsVG9vbFNlc3Npb25JZCh0ZXJtaW5hbFVyaSwgYmFja2VuZFNlc3Npb24pO1xuXHRcdGNvbnN0IHRlcm1pbmFsQ29tbWFuZFVyaSA9IFVSSS5wYXJzZSh0ZXJtaW5hbFVyaSk7XG5cdFx0Y29uc3QgaXNQdHkgPSB0ZXJtaW5hbENvbnRlbnQuaXNQdHkgIT09IGZhbHNlO1xuXHRcdGNvbnN0IHRlcm1pbmFsSW5zdGFuY2UgPSBpc1B0eSA/IHRoaXMuX2Vuc3VyZVRlcm1pbmFsSW5zdGFuY2UodGVybWluYWxVcmksIHNlc3Npb25JZCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgaGFzUmV0YWluZWROb25QdHlTbmFwc2hvdCA9IHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkXG5cdFx0XHQmJiAhaXNQdHlcblx0XHRcdCYmIHRlcm1pbmFsQ29udGVudC5yZXN1bHQ/LmV4aXRDb2RlICE9PSB1bmRlZmluZWRcblx0XHRcdCYmIHRlcm1pbmFsQ29udGVudC5yZXN1bHQucHJldmlldyAhPT0gdW5kZWZpbmVkO1xuXHRcdGlmIChoYXNSZXRhaW5lZE5vblB0eVNuYXBzaG90KSB7XG5cdFx0XHRvdXRwdXRUZXJtaW5hbEF0dGFjaG1lbnQuZGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdFx0b3V0cHV0VGVybWluYWxBdHRhY2htZW50LnNlc3Npb25JZCA9IHVuZGVmaW5lZDtcblx0XHR9IGVsc2UgaWYgKCFpc1B0eSAmJiBvdXRwdXRUZXJtaW5hbEF0dGFjaG1lbnQuc2Vzc2lvbklkICE9PSBzZXNzaW9uSWQpIHtcblx0XHRcdG91dHB1dFRlcm1pbmFsQXR0YWNobWVudC5kaXNwb3NhYmxlLnZhbHVlID0gdGhpcy5fYWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlLmF0dGFjaE91dHB1dFRlcm1pbmFsKHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uLCB0ZXJtaW5hbENvbW1hbmRVcmksIHNlc3Npb25JZCk7XG5cdFx0XHRvdXRwdXRUZXJtaW5hbEF0dGFjaG1lbnQuc2Vzc2lvbklkID0gc2Vzc2lvbklkO1xuXHRcdH1cblx0XHRjb25zdCBleGlzdGluZyA9IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3Rlcm1pbmFsJ1xuXHRcdFx0PyBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgYXMgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgaWRlbnRpdHlDaGFuZ2VkID0gISFleGlzdGluZyAmJiAoXG5cdFx0XHRleGlzdGluZy5jb21tYW5kTGluZS5vcmlnaW5hbCAhPT0gdG9vbElucHV0XG5cdFx0XHR8fCBleGlzdGluZy50ZXJtaW5hbFRvb2xTZXNzaW9uSWQgIT09IHNlc3Npb25JZFxuXHRcdFx0fHwgZXhpc3RpbmcudGVybWluYWxDb21tYW5kVXJpPy50b1N0cmluZygpICE9PSB0ZXJtaW5hbENvbW1hbmRVcmkudG9TdHJpbmcoKVxuXHRcdCk7XG5cdFx0aWYgKCFleGlzdGluZyB8fCBpZGVudGl0eUNoYW5nZWQpIHtcblx0XHRcdGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSA9IHtcblx0XHRcdFx0Li4uZXhpc3RpbmcsXG5cdFx0XHRcdGtpbmQ6ICd0ZXJtaW5hbCcsXG5cdFx0XHRcdGNvbW1hbmRMaW5lOiB7IG9yaWdpbmFsOiB0b29sSW5wdXQgfSxcblx0XHRcdFx0bGFuZ3VhZ2U6ICdzaGVsbHNjcmlwdCcsXG5cdFx0XHRcdHRlcm1pbmFsVG9vbFNlc3Npb25JZDogc2Vzc2lvbklkLFxuXHRcdFx0XHR0ZXJtaW5hbENvbW1hbmRVcmksXG5cdFx0XHRcdGlzUHR5LFxuXHRcdFx0XHR0ZXJtaW5hbENvbW1hbmRJZDogaWRlbnRpdHlDaGFuZ2VkID8gdW5kZWZpbmVkIDogZXhpc3Rpbmc/LnRlcm1pbmFsQ29tbWFuZElkLFxuXHRcdFx0XHR0ZXJtaW5hbENvbW1hbmRPdXRwdXQ6IGlkZW50aXR5Q2hhbmdlZCA/IHVuZGVmaW5lZCA6IGV4aXN0aW5nPy50ZXJtaW5hbENvbW1hbmRPdXRwdXQsXG5cdFx0XHRcdHRlcm1pbmFsQ29tbWFuZFN0YXRlOiBpZGVudGl0eUNoYW5nZWQgPyB1bmRlZmluZWQgOiBleGlzdGluZz8udGVybWluYWxDb21tYW5kU3RhdGUsXG5cdFx0XHRcdHRlcm1pbmFsVGhlbWU6IGlkZW50aXR5Q2hhbmdlZCA/IHVuZGVmaW5lZCA6IGV4aXN0aW5nPy50ZXJtaW5hbFRoZW1lLFxuXHRcdFx0fTtcblx0XHRcdGludm9jYXRpb24ubm90aWZ5VG9vbFNwZWNpZmljRGF0YUNoYW5nZWQoKTtcblx0XHR9XG5cdFx0Y29uc3QgY3VycmVudCA9IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3Rlcm1pbmFsJ1xuXHRcdFx0PyBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGFcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGlmICghdGVybWluYWxJbnN0YW5jZSB8fCBjdXJyZW50Py50ZXJtaW5hbENvbW1hbmRJZCkge1xuXHRcdFx0aWYgKHRlcm1pbmFsSW5zdGFuY2UpIHtcblx0XHRcdFx0dm9pZCB0ZXJtaW5hbEluc3RhbmNlLmNhdGNoKGVycm9yID0+IHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtBZ2VudEhvc3RdIEZhaWxlZCB0byByZXZpdmUgdGVybWluYWwgJyR7dGVybWluYWxVcml9J2AsIGVycm9yKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHZvaWQgdGVybWluYWxJbnN0YW5jZS50aGVuKCgpID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICd0ZXJtaW5hbCdcblx0XHRcdFx0PyBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGFcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoIWN1cnJlbnQgfHwgY3VycmVudC50ZXJtaW5hbFRvb2xTZXNzaW9uSWQgIT09IHNlc3Npb25JZCB8fCBjdXJyZW50LnRlcm1pbmFsQ29tbWFuZElkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNvdXJjZSA9IHRoaXMuX3Rlcm1pbmFsQ2hhdFNlcnZpY2UuZ2V0QWhwQ29tbWFuZFNvdXJjZShzZXNzaW9uSWQpO1xuXHRcdFx0Y29uc3QgY29tbWFuZCA9IHNvdXJjZT8uZXhlY3V0aW5nQ29tbWFuZE9iamVjdCA/PyBzb3VyY2U/LmNvbW1hbmRzW3NvdXJjZS5jb21tYW5kcy5sZW5ndGggLSAxXTtcblx0XHRcdGlmIChjb21tYW5kPy5pZCkge1xuXHRcdFx0XHRpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgPSB7IC4uLmN1cnJlbnQsIHRlcm1pbmFsQ29tbWFuZElkOiBjb21tYW5kLmlkIH07XG5cdFx0XHRcdGludm9jYXRpb24ubm90aWZ5VG9vbFNwZWNpZmljRGF0YUNoYW5nZWQoKTtcblx0XHRcdH1cblx0XHR9LCBlcnJvciA9PiB0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQWdlbnRIb3N0XSBGYWlsZWQgdG8gcmV2aXZlIHRlcm1pbmFsICcke3Rlcm1pbmFsVXJpfSdgLCBlcnJvcikpO1xuXHR9XG5cblx0Ly8gLS0tLSBTdWJhZ2VudCBjaGlsZCBzZXNzaW9uIG9ic2VydmF0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBFbnJpY2hlcyBzZXJpYWxpemVkIGhpc3Rvcnkgd2l0aCBpbm5lciB0b29sIGNhbGxzIGZyb20gc3ViYWdlbnQgY2hpbGRcblx0ICogc2Vzc2lvbnMuIEZvciBlYWNoIHN1YmFnZW50IHRvb2wgY2FsbCBmb3VuZCBpbiB0aGUgaGlzdG9yeSwgc3Vic2NyaWJlc1xuXHQgKiB0byB0aGUgY29ycmVzcG9uZGluZyBjaGlsZCBzZXNzaW9uIGFuZCBhcHBlbmRzIGl0cyBpbm5lciB0b29sIGNhbGxzXG5cdCAqICh3aXRoIGBzdWJBZ2VudEludm9jYXRpb25JZGAgc2V0KSB0byB0aGUgcmVzcG9uc2UgcGFydHMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9lbnJpY2hIaXN0b3J5V2l0aFN1YmFnZW50Q2FsbHMoXG5cdFx0aGlzdG9yeTogSUNoYXRTZXNzaW9uSGlzdG9yeUl0ZW1bXSxcblx0XHRwYXJlbnRTZXNzaW9uOiBVUkksXG5cdFx0c2Vzc2lvblJlc291cmNlOiBVUkksXG5cdFx0c2Vzc2lvblN0YXRlOiBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCxcblx0XHRvYnNlcnZhdGlvbnM6IERpc3Bvc2FibGVTdG9yZSxcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcGFyZW50U2Vzc2lvblN0ciA9IHBhcmVudFNlc3Npb24udG9TdHJpbmcoKTtcblx0XHRjb25zdCBwYXJlbnRUb29sQ2FsbHMgPSBuZXcgTWFwPHN0cmluZywgVG9vbENhbGxTdGF0ZT4oKTtcblx0XHRmb3IgKGNvbnN0IHR1cm4gb2Ygc2Vzc2lvblN0YXRlLnR1cm5zKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHJlc3BvbnNlUGFydCBvZiB0dXJuLnJlc3BvbnNlUGFydHMpIHtcblx0XHRcdFx0aWYgKHJlc3BvbnNlUGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKSB7XG5cdFx0XHRcdFx0cGFyZW50VG9vbENhbGxzLnNldChyZXNwb25zZVBhcnQudG9vbENhbGwudG9vbENhbGxJZCwgcmVzcG9uc2VQYXJ0LnRvb2xDYWxsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBzdWJhZ2VudENoYXRzID0gbmV3IE1hcChzZXNzaW9uU3RhdGUuY2hhdHMuZmxhdE1hcChjaGF0ID0+XG5cdFx0XHRjaGF0Lm9yaWdpbj8ua2luZCA9PT0gQ2hhdE9yaWdpbktpbmQuVG9vbCA/IFtbY2hhdC5vcmlnaW4udG9vbENhbGxJZCwgY2hhdF0gYXMgY29uc3RdIDogW11cblx0XHQpKTtcblx0XHRjb25zdCBzdWJhZ2VudEluc2VydGlvbnM6IHsgaXRlbTogRXh0cmFjdDxJQ2hhdFNlc3Npb25IaXN0b3J5SXRlbSwgeyB0eXBlOiAncmVzcG9uc2UnIH0+OyBpbmRleDogbnVtYmVyOyB0b29sQ2FsbElkOiBzdHJpbmc7IGNoaWxkQ2hhdFVyaTogc3RyaW5nIH1bXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGhpc3RvcnkpIHtcblx0XHRcdGlmIChpdGVtLnR5cGUgIT09ICdyZXNwb25zZScpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaXRlbS5wYXJ0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBwYXJ0ID0gaXRlbS5wYXJ0c1tpXTtcblx0XHRcdFx0aWYgKHBhcnQua2luZCAhPT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzdWJhZ2VudENoYXQgPSBzdWJhZ2VudENoYXRzLmdldChwYXJ0LnRvb2xDYWxsSWQpO1xuXHRcdFx0XHRpZiAoc3ViYWdlbnRDaGF0KSB7XG5cdFx0XHRcdFx0Y29uc3QgZXhpc3RpbmcgPSBwYXJ0LnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcgPyBwYXJ0LnRvb2xTcGVjaWZpY0RhdGEgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Y29uc3QgcGFyZW50VG9vbENhbGwgPSBwYXJlbnRUb29sQ2FsbHMuZ2V0KHBhcnQudG9vbENhbGxJZCk7XG5cdFx0XHRcdFx0Y29uc3QgdGFza0Rlc2NyaXB0aW9uID0gcGFyZW50VG9vbENhbGwgPyByZWFkVG9vbENhbGxNZXRhKHBhcmVudFRvb2xDYWxsKS5zdWJhZ2VudERlc2NyaXB0aW9uPy50cmltKCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0cGFydC50b29sU3BlY2lmaWNEYXRhID0ge1xuXHRcdFx0XHRcdFx0Li4uZXhpc3RpbmcsXG5cdFx0XHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IHRhc2tEZXNjcmlwdGlvbiB8fCBzdWJhZ2VudENoYXQudGl0bGUgfHwgZXhpc3Rpbmc/LmRlc2NyaXB0aW9uIHx8ICh0eXBlb2YgcGFydC5pbnZvY2F0aW9uTWVzc2FnZSA9PT0gJ3N0cmluZycgPyBwYXJ0Lmludm9jYXRpb25NZXNzYWdlIDogcGFydC5pbnZvY2F0aW9uTWVzc2FnZS52YWx1ZSksXG5cdFx0XHRcdFx0XHRjaGF0UmVzb3VyY2U6IHN1YmFnZW50Q2hhdC5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHBhcnQudG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0XHRcdGNvbnN0IGNoaWxkQ2hhdFVyaSA9IHJlc29sdmVSZXN0b3JlZFN1YmFnZW50Q2hhdFJlc291cmNlKFxuXHRcdFx0XHRcdFx0cGFyZW50U2Vzc2lvblN0cixcblx0XHRcdFx0XHRcdHBhcnQudG9vbENhbGxJZCxcblx0XHRcdFx0XHRcdHN1YmFnZW50Q2hhdD8ucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdHBhcnQudG9vbFNwZWNpZmljRGF0YS5jaGF0UmVzb3VyY2UsXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRwYXJ0LnRvb2xTcGVjaWZpY0RhdGEuY2hhdFJlc291cmNlID0gY2hpbGRDaGF0VXJpO1xuXHRcdFx0XHRcdHN1YmFnZW50SW5zZXJ0aW9ucy5wdXNoKHsgaXRlbSwgaW5kZXg6IGksIHRvb2xDYWxsSWQ6IHBhcnQudG9vbENhbGxJZCwgY2hpbGRDaGF0VXJpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHN1YmFnZW50SW5zZXJ0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjaGlsZFN0YXRlQnlVcmkgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTxJUmVzdG9yZWRTdWJhZ2VudFN0YXRlIHwgdW5kZWZpbmVkPj4oKTtcblx0XHRjb25zdCBnZXRDaGlsZFN0YXRlID0gKGNoaWxkQ2hhdFVyaTogc3RyaW5nKTogUHJvbWlzZTxJUmVzdG9yZWRTdWJhZ2VudFN0YXRlIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRsZXQgZXhpc3RpbmcgPSBjaGlsZFN0YXRlQnlVcmkuZ2V0KGNoaWxkQ2hhdFVyaSk7XG5cdFx0XHRpZiAoIWV4aXN0aW5nKSB7XG5cdFx0XHRcdGV4aXN0aW5nID0gdGhpcy5fbG9hZFN1YmFnZW50U3RhdGUocGFyZW50U2Vzc2lvblN0ciwgY2hpbGRDaGF0VXJpKS50aGVuKHN0YXRlID0+IHN0YXRlID8gb2JzZXJ2YXRpb25zLmFkZChzdGF0ZSkgOiB1bmRlZmluZWQpO1xuXHRcdFx0XHRjaGlsZFN0YXRlQnlVcmkuc2V0KGNoaWxkQ2hhdFVyaSwgZXhpc3RpbmcpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHRcdH07XG5cblx0XHRjb25zdCBlbnJpY2hlZEluc2VydGlvbnMgPSBhd2FpdCBQcm9taXNlLmFsbChzdWJhZ2VudEluc2VydGlvbnMubWFwKGFzeW5jICh7IGl0ZW0sIGluZGV4LCB0b29sQ2FsbElkLCBjaGlsZENoYXRVcmkgfSkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgb2JzZXJ2ZWRTdGF0ZSA9IGF3YWl0IGdldENoaWxkU3RhdGUoY2hpbGRDaGF0VXJpKTtcblx0XHRcdFx0Y29uc3QgY2hpbGRTdGF0ZSA9IG9ic2VydmVkU3RhdGU/LmdldFN0YXRlKCk7XG5cdFx0XHRcdGxldCBwYXJlbnRQYXJ0ID0gaXRlbS5wYXJ0c1tpbmRleF07XG5cdFx0XHRcdGlmIChjaGlsZFN0YXRlKSB7XG5cdFx0XHRcdFx0dGhpcy5fYXBwbHlTdWJhZ2VudFVzYWdlVG9IaXN0b3J5UGFydChwYXJlbnRQYXJ0LCBzZXNzaW9uUmVzb3VyY2UsIGNoaWxkU3RhdGUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHBhcmVudFRvb2xDYWxsID0gcGFyZW50VG9vbENhbGxzLmdldCh0b29sQ2FsbElkKTtcblx0XHRcdFx0aWYgKGNoaWxkU3RhdGU/LmFjdGl2ZVR1cm4gJiYgcGFyZW50VG9vbENhbGwgJiYgcGFyZW50UGFydC5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykge1xuXHRcdFx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSBwYXJlbnRQYXJ0O1xuXHRcdFx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHBhcmVudFRvb2xDYWxsLCB1bmRlZmluZWQsIHBhcmVudFNlc3Npb24sIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5KTtcblx0XHRcdFx0XHRmaW5hbGl6ZVRvb2xJbnZvY2F0aW9uKGludm9jYXRpb24sIHBhcmVudFRvb2xDYWxsLCBwYXJlbnRTZXNzaW9uLCB0aGlzLl9jb25maWcuY29ubmVjdGlvbkF1dGhvcml0eSk7XG5cdFx0XHRcdFx0aW52b2NhdGlvbi5wcmVzZW50YXRpb24gPSBzZXJpYWxpemVkLnByZXNlbnRhdGlvbjtcblx0XHRcdFx0XHRpZiAoc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnKSB7XG5cdFx0XHRcdFx0XHRpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgPSBzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGE7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGl0ZW0ucGFydHNbaW5kZXhdID0gaW52b2NhdGlvbjtcblx0XHRcdFx0XHRwYXJlbnRQYXJ0ID0gaW52b2NhdGlvbjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBpbm5lclBhcnRzID0gY2hpbGRTdGF0ZSA/IHRoaXMuX2dldFN1YmFnZW50SW5uZXJQYXJ0cyhjaGlsZENoYXRVcmksIHRvb2xDYWxsSWQsIGNoaWxkU3RhdGUpIDogW107XG5cdFx0XHRcdGlmIChvYnNlcnZlZFN0YXRlICYmIGNoaWxkU3RhdGUgJiYgKHBhcmVudFBhcnQgaW5zdGFuY2VvZiBDaGF0VG9vbEludm9jYXRpb24gfHwgaW5uZXJQYXJ0cy5zb21lKHBhcnQgPT4gcGFydCBpbnN0YW5jZW9mIENoYXRUb29sSW52b2NhdGlvbikpKSB7XG5cdFx0XHRcdFx0b2JzZXJ2YXRpb25zLmFkZChvYnNlcnZlZFN0YXRlLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGxhdGVzdFN0YXRlID0gb2JzZXJ2ZWRTdGF0ZS5nZXRTdGF0ZSgpO1xuXHRcdFx0XHRcdFx0aWYgKGxhdGVzdFN0YXRlKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3JlZnJlc2hSZXN0b3JlZFN1YmFnZW50UGFydHMocGFyZW50UGFydCwgaW5uZXJQYXJ0cywgc2Vzc2lvblJlc291cmNlLCBjaGlsZENoYXRVcmksIGxhdGVzdFN0YXRlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHsgaXRlbSwgaW5kZXgsIGlubmVyUGFydHMgfTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RdIEZhaWxlZCB0byBlbnJpY2ggaGlzdG9yeSB3aXRoIHN1YmFnZW50IGNhbGxzOiAke2NoaWxkQ2hhdFVyaX1gLCBlcnIpO1xuXHRcdFx0XHRyZXR1cm4geyBpdGVtLCBpbmRleCwgaW5uZXJQYXJ0czogW10gfTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRmb3IgKGNvbnN0IHsgaXRlbSwgaW5kZXgsIGlubmVyUGFydHMgfSBvZiBlbnJpY2hlZEluc2VydGlvbnMuc29ydCgoYSwgYikgPT4gYi5pbmRleCAtIGEuaW5kZXgpKSB7XG5cdFx0XHRpZiAoaW5uZXJQYXJ0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGl0ZW0ucGFydHMuc3BsaWNlKGluZGV4ICsgMSwgMCwgLi4uaW5uZXJQYXJ0cyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfbG9hZFN1YmFnZW50U3RhdGUocGFyZW50U2Vzc2lvblVyaTogc3RyaW5nLCBjaGlsZENoYXRVcmk6IHN0cmluZyk6IFByb21pc2U8SVJlc3RvcmVkU3ViYWdlbnRTdGF0ZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGNoaWxkU3ViID0gdGhpcy5fZW5zdXJlU2Vzc2lvblN1YnNjcmlwdGlvbihwYXJlbnRTZXNzaW9uVXJpKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fd2hlblN1YnNjcmlwdGlvbkh5ZHJhdGVkKGNoaWxkU3ViLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGlmIChjaGlsZFN1Yi52YWx1ZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRcdHRocm93IGNoaWxkU3ViLnZhbHVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY2hpbGRDaGF0U3ViID0gdGhpcy5fZW5zdXJlQ2hhdFN1YnNjcmlwdGlvbihwYXJlbnRTZXNzaW9uVXJpLCBjaGlsZENoYXRVcmkpO1xuXHRcdFx0YXdhaXQgdGhpcy5fd2hlblN1YnNjcmlwdGlvbkh5ZHJhdGVkKGNoaWxkQ2hhdFN1YiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRpZiAoY2hpbGRDaGF0U3ViLnZhbHVlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgY2hpbGRDaGF0U3ViLnZhbHVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBvbkRpZENoYW5nZSA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRcdHN0b3JlLmFkZChjaGlsZFN1Yi5vbkRpZENoYW5nZSgoKSA9PiBvbkRpZENoYW5nZS5maXJlKCkpKTtcblx0XHRcdHN0b3JlLmFkZChjaGlsZENoYXRTdWIub25EaWRDaGFuZ2UoKCkgPT4gb25EaWRDaGFuZ2UuZmlyZSgpKSk7XG5cdFx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX3JlbGVhc2VDaGF0U2Vzc2lvblN1YnNjcmlwdGlvbnMocGFyZW50U2Vzc2lvblVyaSwgY2hpbGRDaGF0VXJpKSkpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0b25EaWRDaGFuZ2U6IG9uRGlkQ2hhbmdlLmV2ZW50LFxuXHRcdFx0XHRnZXRTdGF0ZTogKCkgPT4gdGhpcy5fZ2V0U2Vzc2lvblN0YXRlKHBhcmVudFNlc3Npb25VcmksIGNoaWxkQ2hhdFVyaSksXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHN0b3JlLmRpc3Bvc2UoKSxcblx0XHRcdH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX3JlbGVhc2VDaGF0U2Vzc2lvblN1YnNjcmlwdGlvbnMocGFyZW50U2Vzc2lvblVyaSwgY2hpbGRDaGF0VXJpKTtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBXcml0ZXMgYSBzdWJhZ2VudCdzIGFjY3VtdWxhdGVkIGNvc3QgKEFJQykgYW5kIG1vZGVsIFx1MjAxNCBzdW1tZWQgYWNyb3NzIGl0c1xuXHQgKiBjaGlsZCBzZXNzaW9uJ3MgdHVybnMgXHUyMDE0IG9udG8gaXRzIHNlcmlhbGl6ZWQgc3ViYWdlbnQgdG9vbCBjYWxsIHNvIHRoZVxuXHQgKiBob3ZlciBzdXJ2aXZlcyBhIHJlbG9hZC4gTWlycm9ycyB0aGUgbGl2ZSBvYnNlcnZlcnMgaW5cblx0ICoge0BsaW5rIF9zZXR1cFNlcnZlclRvb2xDYWxsfS5cblx0ICovXG5cdHByaXZhdGUgX2FwcGx5U3ViYWdlbnRVc2FnZVRvSGlzdG9yeVBhcnQocGFydDogSUNoYXRQcm9ncmVzcywgc2Vzc2lvblJlc291cmNlOiBVUkksIGNoaWxkU3RhdGU6IElTZXNzaW9uV2l0aERlZmF1bHRDaGF0KTogdm9pZCB7XG5cdFx0aWYgKChwYXJ0LmtpbmQgIT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnICYmIHBhcnQua2luZCAhPT0gJ3Rvb2xJbnZvY2F0aW9uJykgfHwgcGFydC50b29sU3BlY2lmaWNEYXRhPy5raW5kICE9PSAnc3ViYWdlbnQnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCBjcmVkaXRzID0gMDtcblx0XHRsZXQgbW9kZWxOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgdHVybnMgPSBjaGlsZFN0YXRlLmFjdGl2ZVR1cm4gJiYgIWNoaWxkU3RhdGUudHVybnMuc29tZSh0dXJuID0+IHR1cm4uaWQgPT09IGNoaWxkU3RhdGUuYWN0aXZlVHVybj8uaWQpXG5cdFx0XHQ/IFsuLi5jaGlsZFN0YXRlLnR1cm5zLCBjaGlsZFN0YXRlLmFjdGl2ZVR1cm5dXG5cdFx0XHQ6IGNoaWxkU3RhdGUudHVybnM7XG5cdFx0Zm9yIChjb25zdCB0dXJuIG9mIHR1cm5zKSB7XG5cdFx0XHRjb25zdCB0dXJuQ3JlZGl0cyA9IHVzYWdlSW5mb1RvQ2hhdFVzYWdlKHR1cm4udXNhZ2UpPy5jb3BpbG90Q3JlZGl0cztcblx0XHRcdGlmICh0eXBlb2YgdHVybkNyZWRpdHMgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdGNyZWRpdHMgKz0gdHVybkNyZWRpdHM7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0dXJuTW9kZWxJZCA9IHRoaXMuX3RvTGFuZ3VhZ2VNb2RlbElkKHNlc3Npb25SZXNvdXJjZSwgdHVybi51c2FnZT8ubW9kZWwpO1xuXHRcdFx0Y29uc3QgdHVybk1vZGVsTmFtZSA9IHRoaXMuX2dldExhbmd1YWdlTW9kZWxEaXNwbGF5TmFtZSh0dXJuTW9kZWxJZCk7XG5cdFx0XHRpZiAodHVybk1vZGVsTmFtZSkge1xuXHRcdFx0XHRtb2RlbE5hbWUgPSB0dXJuTW9kZWxOYW1lO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoY3JlZGl0cyA+IDApIHtcblx0XHRcdHBhcnQudG9vbFNwZWNpZmljRGF0YS5jcmVkaXRzID0gY3JlZGl0cztcblx0XHR9XG5cdFx0aWYgKG1vZGVsTmFtZSAmJiAhcGFydC50b29sU3BlY2lmaWNEYXRhLm1vZGVsTmFtZSkge1xuXHRcdFx0cGFydC50b29sU3BlY2lmaWNEYXRhLm1vZGVsTmFtZSA9IG1vZGVsTmFtZTtcblx0XHR9XG5cdFx0Y29uc3QgdGltaW5nID0gZ2V0U3ViYWdlbnRUaW1pbmcoY2hpbGRTdGF0ZSk7XG5cdFx0cGFydC50b29sU3BlY2lmaWNEYXRhLmlzQWN0aXZlID0gISFjaGlsZFN0YXRlLmFjdGl2ZVR1cm47XG5cdFx0cGFydC50b29sU3BlY2lmaWNEYXRhLnN0YXJ0ZWRBdCA9IHRpbWluZy5zdGFydGVkQXQ7XG5cdFx0cGFydC50b29sU3BlY2lmaWNEYXRhLmR1cmF0aW9uID0gdGltaW5nLmR1cmF0aW9uO1xuXHRcdGlmIChwYXJ0IGluc3RhbmNlb2YgQ2hhdFRvb2xJbnZvY2F0aW9uKSB7XG5cdFx0XHRwYXJ0Lm5vdGlmeVRvb2xTcGVjaWZpY0RhdGFDaGFuZ2VkKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVmcmVzaFJlc3RvcmVkU3ViYWdlbnRQYXJ0cyhwYXJlbnRQYXJ0OiBJQ2hhdFByb2dyZXNzLCBpbm5lclBhcnRzOiBJQ2hhdFByb2dyZXNzW10sIHNlc3Npb25SZXNvdXJjZTogVVJJLCBjaGlsZENoYXRVcmk6IHN0cmluZywgY2hpbGRTdGF0ZTogSVNlc3Npb25XaXRoRGVmYXVsdENoYXQpOiB2b2lkIHtcblx0XHR0aGlzLl9hcHBseVN1YmFnZW50VXNhZ2VUb0hpc3RvcnlQYXJ0KHBhcmVudFBhcnQsIHNlc3Npb25SZXNvdXJjZSwgY2hpbGRTdGF0ZSk7XG5cdFx0Y29uc3QgdG9vbENhbGxzID0gbmV3IE1hcDxzdHJpbmcsIFRvb2xDYWxsU3RhdGU+KCk7XG5cdFx0Y29uc3QgdHVybnMgPSBjaGlsZFN0YXRlLmFjdGl2ZVR1cm4gJiYgIWNoaWxkU3RhdGUudHVybnMuc29tZSh0dXJuID0+IHR1cm4uaWQgPT09IGNoaWxkU3RhdGUuYWN0aXZlVHVybj8uaWQpXG5cdFx0XHQ/IFsuLi5jaGlsZFN0YXRlLnR1cm5zLCBjaGlsZFN0YXRlLmFjdGl2ZVR1cm5dXG5cdFx0XHQ6IGNoaWxkU3RhdGUudHVybnM7XG5cdFx0Zm9yIChjb25zdCB0dXJuIG9mIHR1cm5zKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHJlc3BvbnNlUGFydCBvZiB0dXJuLnJlc3BvbnNlUGFydHMpIHtcblx0XHRcdFx0aWYgKHJlc3BvbnNlUGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKSB7XG5cdFx0XHRcdFx0dG9vbENhbGxzLnNldChyZXNwb25zZVBhcnQudG9vbENhbGwudG9vbENhbGxJZCwgcmVzcG9uc2VQYXJ0LnRvb2xDYWxsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBjaGlsZFJlc291cmNlID0gVVJJLnBhcnNlKGNoaWxkQ2hhdFVyaSk7XG5cdFx0Zm9yIChjb25zdCBwYXJ0IG9mIGlubmVyUGFydHMpIHtcblx0XHRcdGlmICghKHBhcnQgaW5zdGFuY2VvZiBDaGF0VG9vbEludm9jYXRpb24pKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdG9vbENhbGwgPSB0b29sQ2FsbHMuZ2V0KHBhcnQudG9vbENhbGxJZCk7XG5cdFx0XHRpZiAoIXRvb2xDYWxsKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCh0b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCB8fCB0b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNhbmNlbGxlZCkgJiYgIUlDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZShwYXJ0KSkge1xuXHRcdFx0XHRmaW5hbGl6ZVRvb2xJbnZvY2F0aW9uKHBhcnQsIHRvb2xDYWxsLCBjaGlsZFJlc291cmNlLCB0aGlzLl9jb25maWcuY29ubmVjdGlvbkF1dGhvcml0eSk7XG5cdFx0XHR9IGVsc2UgaWYgKHRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUnVubmluZykge1xuXHRcdFx0XHR1cGRhdGVSdW5uaW5nVG9vbFNwZWNpZmljRGF0YShwYXJ0LCB0b29sQ2FsbCwgY2hpbGRSZXNvdXJjZSwgdGhpcy5fY29uZmlnLmNvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHRcdFx0XHRwYXJ0Lm5vdGlmeVRvb2xTcGVjaWZpY0RhdGFDaGFuZ2VkKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U3ViYWdlbnRJbm5lclBhcnRzKGNoaWxkU2Vzc2lvblVyaTogc3RyaW5nLCB0b29sQ2FsbElkOiBzdHJpbmcsIGNoaWxkU3RhdGU6IElTZXNzaW9uV2l0aERlZmF1bHRDaGF0KTogSUNoYXRQcm9ncmVzc1tdIHtcblx0XHRjb25zdCBpbm5lclBhcnRzOiBJQ2hhdFByb2dyZXNzW10gPSBbXTtcblx0XHRjb25zdCB0dXJucyA9IGNoaWxkU3RhdGUuYWN0aXZlVHVybiAmJiAhY2hpbGRTdGF0ZS50dXJucy5zb21lKHR1cm4gPT4gdHVybi5pZCA9PT0gY2hpbGRTdGF0ZS5hY3RpdmVUdXJuPy5pZClcblx0XHRcdD8gWy4uLmNoaWxkU3RhdGUudHVybnMsIGNoaWxkU3RhdGUuYWN0aXZlVHVybl1cblx0XHRcdDogY2hpbGRTdGF0ZS50dXJucztcblx0XHRmb3IgKGNvbnN0IHR1cm4gb2YgdHVybnMpIHtcblx0XHRcdGZvciAoY29uc3QgcnAgb2YgdHVybi5yZXNwb25zZVBhcnRzKSB7XG5cdFx0XHRcdGlmIChycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGMgPSBycC50b29sQ2FsbDtcblx0XHRcdFx0XHRpZiAodGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgfHwgdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5DYW5jZWxsZWQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGNvbXBsZXRlZFRjID0gdGMgYXMgSUNvbXBsZXRlZFRvb2xDYWxsO1xuXHRcdFx0XHRcdFx0Y29uc3QgZmlsZUVkaXRQYXJ0cyA9IGNvbXBsZXRlZFRvb2xDYWxsVG9FZGl0UGFydHMoY29tcGxldGVkVGMsIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5KTtcblx0XHRcdFx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSBjb21wbGV0ZWRUb29sQ2FsbFRvU2VyaWFsaXplZChjb21wbGV0ZWRUYywgdG9vbENhbGxJZCwgVVJJLnBhcnNlKGNoaWxkU2Vzc2lvblVyaSksIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5KTtcblx0XHRcdFx0XHRcdGlmIChmaWxlRWRpdFBhcnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdFx0c2VyaWFsaXplZC5wcmVzZW50YXRpb24gPSBUb29sSW52b2NhdGlvblByZXNlbnRhdGlvbi5IaWRkZW47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpbm5lclBhcnRzLnB1c2goc2VyaWFsaXplZCk7XG5cdFx0XHRcdFx0XHRpbm5lclBhcnRzLnB1c2goLi4uZmlsZUVkaXRQYXJ0cyk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGlubmVyUGFydHMucHVzaCh0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjLCB0b29sQ2FsbElkLCBVUkkucGFyc2UoY2hpbGRTZXNzaW9uVXJpKSwgdGhpcy5fY29uZmlnLmNvbm5lY3Rpb25BdXRob3JpdHkpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGlubmVyUGFydHM7XG5cdH1cblxuXHQvKipcblx0ICogU3Vic2NyaWJlcyB0byBhIGNoaWxkIHN1YmFnZW50IHNlc3Npb24gYW5kIGZvcndhcmRzIGl0cyB0b29sIGNhbGxzXG5cdCAqIGFzIHByb2dyZXNzIHBhcnRzIGludG8gdGhlIHBhcmVudCBzZXNzaW9uJ3MgcmVzcG9uc2UsIHdpdGhcblx0ICogYHN1YkFnZW50SW52b2NhdGlvbklkYCBzZXQgc28gdGhlIHJlbmRlcmVyIGdyb3VwcyB0aGVtIHVuZGVyIHRoZSBwYXJlbnRcblx0ICogc3ViYWdlbnQgd2lkZ2V0LlxuXHQgKlxuXHQgKiBJbXBsZW1lbnRhdGlvbjogYnVpbGRzIGEgcGVyLXR1cm4taWQga2V5ZWQgb2JzZXJ2YXRpb24gb3ZlciB0aGUgY2hpbGRcblx0ICogc2Vzc2lvbidzIGB0dXJuc2AgYW5kIGBhY3RpdmVUdXJuYC4gRWFjaCB0dXJuIGlkIGRpc2NvdmVyZWQgZ2V0cyBpdHNcblx0ICogb3duIHtAbGluayBfb2JzZXJ2ZVR1cm59IGluc3RhbmNlIHJ1bm5pbmcgaW4gc3ViYWdlbnQgbW9kZSAod2hpY2ggc2tpcHNcblx0ICogbWFya2Rvd24vcmVhc29uaW5nL2lucHV0LXJlcXVlc3QgZW1pc3Npb24gYW5kIHRhZ3MgdG9vbCBjYWxscyB3aXRoIHRoZVxuXHQgKiBwYXJlbnQgdG9vbCBjYWxsIGlkKS4gRWFjaCBwZXItdHVybiBvYnNlcnZlciBzZWxmLWRpc3Bvc2VzIHdoZW4gaXRzXG5cdCAqIHR1cm4gcmVhY2hlcyBhIHRlcm1pbmFsIHN0YXRlOyB0aGUgb3V0ZXIgb2JzZXJ2YXRpb24gaXMgdG9ybiBkb3duIHdoZW5cblx0ICogdGhlIGNhbGxlciBkaXNwb3NlcyBgZGlzcG9zYWJsZXNgLlxuXHQgKi9cblx0cHJpdmF0ZSBfb2JzZXJ2ZVN1YmFnZW50U2Vzc2lvbihcblx0XHRzZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0XHRwYXJlbnRTZXNzaW9uOiBVUkksXG5cdFx0cGFyZW50VG9vbENhbGxJZDogc3RyaW5nLFxuXHRcdGNoaWxkQ2hhdFVyaTogc3RyaW5nLFxuXHRcdHJvb3RJbnZvY2F0aW9uSWQ6IHN0cmluZyxcblx0XHRwYXJlbnRJbnZvY2F0aW9uOiBDaGF0VG9vbEludm9jYXRpb24sXG5cdFx0ZW1pdFByb2dyZXNzOiAocGFydHM6IElDaGF0UHJvZ3Jlc3NbXSkgPT4gdm9pZCxcblx0XHRkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLFxuXHRcdHN1YmFnZW50Q29udGV4dDogSVN1YmFnZW50Q29udGV4dCxcblx0XHRwZXJJbnZvY2F0aW9uQ3JlZGl0c0FjY3VtdWxhdG9yOiBJU2V0dGFibGVPYnNlcnZhYmxlPG51bWJlcj4sXG5cdFx0cGVySW52b2NhdGlvbk1vZGVsOiBJU2V0dGFibGVPYnNlcnZhYmxlPHN0cmluZyB8IHVuZGVmaW5lZD4sXG5cdCk6IHZvaWQge1xuXHRcdGNvbnN0IHBhcmVudFNlc3Npb25VcmkgPSBwYXJlbnRTZXNzaW9uLnRvU3RyaW5nKCk7XG5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGN0cy5kaXNwb3NlKHRydWUpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpZiAocGFyZW50SW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnICYmIHBhcmVudEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5pc0FjdGl2ZSkge1xuXHRcdFx0XHRwYXJlbnRJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuaXNBY3RpdmUgPSBmYWxzZTtcblx0XHRcdFx0cGFyZW50SW52b2NhdGlvbi5ub3RpZnlUb29sU3BlY2lmaWNEYXRhQ2hhbmdlZCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjaGlsZFN1YiA9IHRoaXMuX2Vuc3VyZVNlc3Npb25TdWJzY3JpcHRpb24ocGFyZW50U2Vzc2lvblVyaSk7XG5cdFx0XHRjb25zdCBjaGlsZENoYXRTdWIgPSB0aGlzLl9lbnN1cmVDaGF0U3Vic2NyaXB0aW9uKHBhcmVudFNlc3Npb25VcmksIGNoaWxkQ2hhdFVyaSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX3JlbGVhc2VDaGF0U2Vzc2lvblN1YnNjcmlwdGlvbnMocGFyZW50U2Vzc2lvblVyaSwgY2hpbGRDaGF0VXJpKSkpO1xuXG5cdFx0XHRjb25zdCBjaGlsZFNlc3Npb25TdGF0ZSQgPSBvYnNlcnZhYmxlRnJvbVN1YnNjcmlwdGlvbih0aGlzLCBjaGlsZFN1Yik7XG5cdFx0XHRjb25zdCBjaGlsZENoYXRTdGF0ZSQgPSBvYnNlcnZhYmxlRnJvbVN1YnNjcmlwdGlvbih0aGlzLCBjaGlsZENoYXRTdWIpO1xuXHRcdFx0Y29uc3QgY2hpbGRTdGF0ZSQgPSBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBjaGlsZFNlc3Npb25TdGF0ZSQucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBtZXJnZVNlc3Npb25XaXRoRGVmYXVsdENoYXQoc2Vzc2lvbiwgY2hpbGRDaGF0U3RhdGUkLnJlYWQocmVhZGVyKSk7XG5cdFx0XHR9KTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gY2hpbGRTdGF0ZSQucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoIXN0YXRlIHx8ICghc3RhdGUuYWN0aXZlVHVybiAmJiBzdGF0ZS50dXJucy5sZW5ndGggPT09IDApKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGlzQWN0aXZlID0gISFzdGF0ZS5hY3RpdmVUdXJuO1xuXHRcdFx0XHRpZiAocGFyZW50SW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGltaW5nID0gZ2V0U3ViYWdlbnRUaW1pbmcoc3RhdGUpO1xuXHRcdFx0XHRcdGNvbnN0IGxhc3RSZXNwb25zZVBhcnQgPSBzdGF0ZS5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLmF0KC0xKTtcblx0XHRcdFx0XHRjb25zdCBhY3Rpdml0eSA9IGxhc3RSZXNwb25zZVBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd25cblx0XHRcdFx0XHRcdD8gJ21hcmtkb3duJ1xuXHRcdFx0XHRcdFx0OiBsYXN0UmVzcG9uc2VQYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlJlYXNvbmluZ1xuXHRcdFx0XHRcdFx0XHQ/ICdyZWFzb25pbmcnXG5cdFx0XHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnN0IGZhbGxiYWNrRHVyYXRpb24gPSAhaXNBY3RpdmUgJiYgdGltaW5nLmR1cmF0aW9uID09PSB1bmRlZmluZWQgJiYgcGFyZW50SW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmlzQWN0aXZlICYmIHBhcmVudEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5zdGFydGVkQXQgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0PyBEYXRlLm5vdygpIC0gcGFyZW50SW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLnN0YXJ0ZWRBdFxuXHRcdFx0XHRcdFx0OiB0aW1pbmcuZHVyYXRpb247XG5cdFx0XHRcdFx0aWYgKHBhcmVudEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5pc0FjdGl2ZSAhPT0gaXNBY3RpdmVcblx0XHRcdFx0XHRcdHx8IHBhcmVudEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5hY3Rpdml0eSAhPT0gYWN0aXZpdHlcblx0XHRcdFx0XHRcdHx8IHBhcmVudEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5zdGFydGVkQXQgIT09IHRpbWluZy5zdGFydGVkQXRcblx0XHRcdFx0XHRcdHx8IHBhcmVudEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5kdXJhdGlvbiAhPT0gZmFsbGJhY2tEdXJhdGlvbikge1xuXHRcdFx0XHRcdFx0cGFyZW50SW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmlzQWN0aXZlID0gaXNBY3RpdmU7XG5cdFx0XHRcdFx0XHRpZiAoYWN0aXZpdHkpIHtcblx0XHRcdFx0XHRcdFx0cGFyZW50SW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmFjdGl2aXR5ID0gYWN0aXZpdHk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRkZWxldGUgcGFyZW50SW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmFjdGl2aXR5O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cGFyZW50SW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLnN0YXJ0ZWRBdCA9IHRpbWluZy5zdGFydGVkQXQ7XG5cdFx0XHRcdFx0XHRwYXJlbnRJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuZHVyYXRpb24gPSBmYWxsYmFja0R1cmF0aW9uO1xuXHRcdFx0XHRcdFx0cGFyZW50SW52b2NhdGlvbi5ub3RpZnlUb29sU3BlY2lmaWNEYXRhQ2hhbmdlZCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCBjaGlsZFR1cm5JZHMkID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IGNoaWxkU3RhdGUkLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBpZHM6IHsgaWQ6IHN0cmluZyB9W10gPSBzdGF0ZS50dXJucy5tYXAodCA9PiAoeyBpZDogdC5pZCB9KSk7XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZUlkID0gc3RhdGUuYWN0aXZlVHVybj8uaWQ7XG5cdFx0XHRcdGlmIChhY3RpdmVJZCAhPT0gdW5kZWZpbmVkICYmICFzdGF0ZS50dXJucy5zb21lKHQgPT4gdC5pZCA9PT0gYWN0aXZlSWQpKSB7XG5cdFx0XHRcdFx0aWRzLnB1c2goeyBpZDogYWN0aXZlSWQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGlkcztcblx0XHRcdH0pO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoYXV0b3J1blBlcktleWVkSXRlbShcblx0XHRcdFx0Y2hpbGRUdXJuSWRzJCxcblx0XHRcdFx0dCA9PiB0LmlkLFxuXHRcdFx0XHQodHVybklkLCBfdCQsIHR1cm5TdG9yZSkgPT4ge1xuXHRcdFx0XHRcdHR1cm5TdG9yZS5hZGQodGhpcy5fb2JzZXJ2ZVR1cm4oe1xuXHRcdFx0XHRcdFx0YmFja2VuZFNlc3Npb246IHBhcmVudFNlc3Npb24sXG5cdFx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRjaGF0VVJJOiBjaGlsZENoYXRVcmksXG5cdFx0XHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdFx0XHRzaW5rOiBlbWl0UHJvZ3Jlc3MsXG5cdFx0XHRcdFx0XHRjYW5jZWxsYXRpb25Ub2tlbjogY3RzLnRva2VuLFxuXHRcdFx0XHRcdFx0c3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHJvb3RJbnZvY2F0aW9uSWQsXG5cdFx0XHRcdFx0XHRzdWJBZ2VudENyZWRpdHNBY2N1bXVsYXRvcjogcGVySW52b2NhdGlvbkNyZWRpdHNBY2N1bXVsYXRvcixcblx0XHRcdFx0XHRcdHN1YkFnZW50TW9kZWxPYnNlcnZhYmxlOiBwZXJJbnZvY2F0aW9uTW9kZWwsXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9LFxuXHRcdFx0KSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBSZW1vdmUgZnJvbSBvYnNlcnZlZCBzZXQgc28gYSBsYXRlciBzdGF0ZSBjaGFuZ2UgY2FuIHJldHJ5XG5cdFx0XHRzdWJhZ2VudENvbnRleHQub2JzZXJ2YXRpb25zLmRlbGV0ZUFuZERpc3Bvc2UocGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RdIEZhaWxlZCB0byBzdWJzY3JpYmUgdG8gc3ViYWdlbnQgY2hhdDogJHtjaGlsZENoYXRVcml9YCwgZXJyKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0tIFJlY29ubmVjdGlvbiB0byBhY3RpdmUgdHVybiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIFdpcmVzIHVwIGFuIG9uZ29pbmcgc3RhdGUgbGlzdGVuZXIgdGhhdCBzdHJlYW1zIGluY3JlbWVudGFsIHByb2dyZXNzXG5cdCAqIGZyb20gYW4gYWxyZWFkeS1ydW5uaW5nIHR1cm4gaW50byB0aGUgY2hhdCBzZXNzaW9uJ3MgcHJvZ3Jlc3NPYnMuXG5cdCAqIFRoaXMgaXMgdGhlIHJlY29ubmVjdGlvbiBjb3VudGVycGFydCBvZiB7QGxpbmsgX2hhbmRsZVR1cm59LCB3aGljaFxuXHQgKiBoYW5kbGVzIG5ld2x5LWluaXRpYXRlZCB0dXJucy5cblx0ICovXG5cdHByaXZhdGUgX3JlY29ubmVjdFRvQWN0aXZlVHVybihcblx0XHRiYWNrZW5kU2Vzc2lvbjogVVJJLFxuXHRcdHR1cm5JZDogc3RyaW5nLFxuXHRcdGNoYXRTZXNzaW9uOiBBZ2VudEhvc3RDaGF0U2Vzc2lvbixcblx0XHRpbml0aWFsUHJvZ3Jlc3M6IElDaGF0UHJvZ3Jlc3NbXSxcblx0XHRpbml0aWFsUmVzcG9uc2VQYXJ0Q291bnQ6IG51bWJlcixcblx0KTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbktleSA9IGJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgY2hhdFVSSSA9IHRoaXMuX2dldENoYXRVUkkoY2hhdFNlc3Npb24uc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdC8vIEV4dHJhY3QgbGl2ZSBDaGF0VG9vbEludm9jYXRpb24gb2JqZWN0cyBmcm9tIHRoZSBpbml0aWFsIHByb2dyZXNzXG5cdFx0Ly8gYXJyYXkgc28gcGVyLXRvb2wgc2V0dXAgYWRvcHRzIHRoZSBzYW1lIGluc3RhbmNlcyB0aGUgY2hhdCBVSSBob2xkcy5cblx0XHRjb25zdCBhZG9wdEludm9jYXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIENoYXRUb29sSW52b2NhdGlvbj4oKTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgaW5pdGlhbFByb2dyZXNzKSB7XG5cdFx0XHRpZiAoaXRlbSBpbnN0YW5jZW9mIENoYXRUb29sSW52b2NhdGlvbikge1xuXHRcdFx0XHRhZG9wdEludm9jYXRpb25zLnNldChpdGVtLnRvb2xDYWxsSWQsIGl0ZW0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFNlZWQgbGFzdC1lbWl0dGVkIG1hcmtkb3duL3JlYXNvbmluZyBsZW5ndGhzIGZyb20gdGhlIHNuYXBzaG90IHNvXG5cdFx0Ly8gcGVyLXBhcnQgc2V0dXAgb25seSBlbWl0cyBjb250ZW50IGJleW9uZCB3aGF0IGBhY3RpdmVUdXJuVG9Qcm9ncmVzc2Bcblx0XHQvLyBhbHJlYWR5IHByb2R1Y2VkLlxuXHRcdGNvbnN0IHNlZWRFbWl0dGVkTGVuZ3RocyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0Y29uc3QgY3VycmVudFN0YXRlID0gdGhpcy5fZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25LZXksIGNoYXRVUkkpO1xuXHRcdGlmIChjdXJyZW50U3RhdGU/LmFjdGl2ZVR1cm4pIHtcblx0XHRcdGZvciAoY29uc3QgcnAgb2YgY3VycmVudFN0YXRlLmFjdGl2ZVR1cm4ucmVzcG9uc2VQYXJ0cykge1xuXHRcdFx0XHRpZiAocnAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biB8fCBycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlJlYXNvbmluZykge1xuXHRcdFx0XHRcdHNlZWRFbWl0dGVkTGVuZ3Rocy5zZXQocnAuaWQsIHJwLmNvbnRlbnQubGVuZ3RoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IHJlY29ubmVjdFN0b3JlID0gY2hhdFNlc3Npb24ucmVnaXN0ZXJEaXNwb3NhYmxlKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0cmVjb25uZWN0U3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSkpO1xuXHRcdHJlY29ubmVjdFN0b3JlLmFkZCh0aGlzLl9vYnNlcnZlVHVybih7XG5cdFx0XHRiYWNrZW5kU2Vzc2lvbixcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogY2hhdFNlc3Npb24uc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0Y2hhdFVSSSxcblx0XHRcdHR1cm5JZCxcblx0XHRcdHNpbms6IHBhcnRzID0+IGNoYXRTZXNzaW9uLmFwcGVuZFByb2dyZXNzKHBhcnRzKSxcblx0XHRcdGNhbmNlbGxhdGlvblRva2VuOiBjdHMudG9rZW4sXG5cdFx0XHRhZG9wdEludm9jYXRpb25zLFxuXHRcdFx0c2VlZEVtaXR0ZWRMZW5ndGhzLFxuXHRcdFx0aW5pdGlhbFJlc3BvbnNlUGFydENvdW50LFxuXHRcdFx0b25UdXJuRW5kZWQ6ICgpID0+IHtcblx0XHRcdFx0Y2hhdFNlc3Npb24uY29tcGxldGUoKTtcblx0XHRcdFx0cmVjb25uZWN0U3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0fSxcblx0XHR9KSk7XG5cdH1cblxuXHQvLyAtLS0tIEZpbGUgZWRpdCByb3V0aW5nIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBFbnN1cmVzIHRoZSBjaGF0IG1vZGVsIGhhcyBhIHNuYXBzaG90IGNvbnRyb2xsZXIgYm91bmQgKGNyZWF0aW5nIG9uZVxuXHQgKiB2aWEgb3VyIHJlZ2lzdGVyZWQgZWRpdGluZy1zZXNzaW9uIHByb3ZpZGVyIGlmIG5lZWRlZCkgYW5kIHJldHVybnMgaXQuXG5cdCAqIEh5ZHJhdGVzIHRoZSBjb250cm9sbGVyIGZyb20gYW55IHBlbmRpbmcgaGlzdG9yeSB0dXJucyBvbiBmaXJzdCBhY2Nlc3MuXG5cdCAqL1xuXHRwcml2YXRlIF9lbnN1cmVTbmFwc2hvdENvbnRyb2xsZXIoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBBZ2VudEhvc3RTbmFwc2hvdENvbnRyb2xsZXIgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNoYXRNb2RlbCA9IHRoaXMuX2NoYXRTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIWNoYXRNb2RlbCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBTdGFydCB0aGUgZWRpdGluZyBzZXNzaW9uIGlmIG5vdCBhbHJlYWR5IHN0YXJ0ZWQgXHUyMDE0IHRoaXMgd2lsbCB1c2Vcblx0XHQvLyBvdXIgcmVnaXN0ZXJlZCBwcm92aWRlciB0byBjcmVhdGUgYW4gQWdlbnRIb3N0U25hcHNob3RDb250cm9sbGVyLlxuXHRcdGlmICghY2hhdE1vZGVsLmVkaXRpbmdTZXNzaW9uKSB7XG5cdFx0XHRjaGF0TW9kZWwuc3RhcnRFZGl0aW5nU2Vzc2lvbigpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRpbmdTZXNzaW9uID0gY2hhdE1vZGVsLmVkaXRpbmdTZXNzaW9uO1xuXHRcdGlmICghKGVkaXRpbmdTZXNzaW9uIGluc3RhbmNlb2YgQWdlbnRIb3N0U25hcHNob3RDb250cm9sbGVyKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBIeWRyYXRlIGZyb20gaGlzdG9yaWNhbCB0dXJucyBpZiB0aGlzIGlzIHRoZSBmaXJzdCB0aW1lXG5cdFx0Ly8gdGhlIGNvbnRyb2xsZXIgaXMgYWNjZXNzZWQgZm9yIHRoaXMgY2hhdCBzZXNzaW9uLiBXZSBzZWVkIGFcblx0XHQvLyByZXF1ZXN0LWxldmVsIGNoZWNrcG9pbnQgZm9yIGV2ZXJ5IHR1cm4gKG5vdCBqdXN0IHR1cm5zIHdpdGhcblx0XHQvLyBlZGl0cykgc28gXCJSZXN0b3JlIENoZWNrcG9pbnRcIiBvbiBhbnkgaGlzdG9yaWNhbCByZXF1ZXN0IGNhblxuXHRcdC8vIGZpbmQgYSBib3VuZGFyeSBhbmQgbWFyayBzdWJzZXF1ZW50IHJlcXVlc3RzIGFzIGRpc2FibGVkIHZpYVxuXHRcdC8vIHJlcXVlc3REaXNhYmxlbWVudC5cblx0XHRjb25zdCBwZW5kaW5nVHVybnMgPSB0aGlzLl9wZW5kaW5nSGlzdG9yeVR1cm5zLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmIChwZW5kaW5nVHVybnMpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdIaXN0b3J5VHVybnMuZGVsZXRlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRmb3IgKGNvbnN0IHR1cm4gb2YgcGVuZGluZ1R1cm5zKSB7XG5cdFx0XHRcdGVkaXRpbmdTZXNzaW9uLmVuc3VyZVJlcXVlc3RDaGVja3BvaW50KHR1cm4uaWQpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHJwIG9mIHR1cm4ucmVzcG9uc2VQYXJ0cykge1xuXHRcdFx0XHRcdGlmIChycC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKSB7XG5cdFx0XHRcdFx0XHRlZGl0aW5nU2Vzc2lvbi5hZGRUb29sQ2FsbEVkaXRzKHR1cm4uaWQsIHJwLnRvb2xDYWxsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZWRpdGluZ1Nlc3Npb247XG5cdH1cblxuXHQvKipcblx0ICogUmVjb3JkcyBzbmFwc2hvdCBkYXRhIGZvciBhIGNvbXBsZXRlZCB0b29sIGNhbGwgKHNvIHJlc3RvcmUtc25hcHNob3Rcblx0ICogd29ya3MpIGFuZCByZXR1cm5zIHRoZSB7QGxpbmsgSUNoYXRFeHRlcm5hbEVkaXR9IHByb2dyZXNzIHBhcnRzIHRvXG5cdCAqIHJlbmRlciB0aGUgcGVyLWZpbGUgZWRpdCBwaWxscy5cblx0ICovXG5cdHByaXZhdGUgX2h5ZHJhdGVGaWxlRWRpdHMoXG5cdFx0c2Vzc2lvblJlc291cmNlOiBVUkksXG5cdFx0cmVxdWVzdElkOiBzdHJpbmcsXG5cdFx0dGM6IFRvb2xDYWxsU3RhdGUsXG5cdCk6IElDaGF0UHJvZ3Jlc3NbXSB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IHRoaXMuX2Vuc3VyZVNuYXBzaG90Q29udHJvbGxlcihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnRyb2xsZXI/LmFkZFRvb2xDYWxsRWRpdHMocmVxdWVzdElkLCB0Yyk7XG5cdFx0aWYgKHRjLnN0YXR1cyAhPT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHJldHVybiBjb21wbGV0ZWRUb29sQ2FsbFRvRWRpdFBhcnRzKHRjIGFzIElDb21wbGV0ZWRUb29sQ2FsbCwgdGhpcy5fY29uZmlnLmNvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHR9XG5cblx0Ly8gLS0tLSBTZXNzaW9uIHJlc29sdXRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBBdHRhY2hlcyB0byBhbiBleGlzdGluZyBzZXJ2ZXItc2lkZSB0ZXJtaW5hbCB2aWEgdGhlIGFnZW50IGhvc3Rcblx0ICogdGVybWluYWwgc2VydmljZSBhbmQgcmVnaXN0ZXJzIGl0IHdpdGggdGhlIHRlcm1pbmFsIGNoYXQgc2VydmljZS5cblx0ICpcblx0ICogUmV0dXJucyB0aGUgdGVybWluYWwgaW5zdGFuY2UgY3JlYXRlZCBvciByZXVzZWQgYnkgdGhlIHRlcm1pbmFsIHNlcnZpY2UuXG5cdCAqL1xuXHRwcml2YXRlIF9lbnN1cmVUZXJtaW5hbEluc3RhbmNlKHRlcm1pbmFsVXJpOiBzdHJpbmcsIHRlcm1pbmFsVG9vbFNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTxJVGVybWluYWxJbnN0YW5jZT4ge1xuXHRcdHJldHVybiB0aGlzLl9hZ2VudEhvc3RUZXJtaW5hbFNlcnZpY2UucmV2aXZlVGVybWluYWwoXG5cdFx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbixcblx0XHRcdFVSSS5wYXJzZSh0ZXJtaW5hbFVyaSksXG5cdFx0XHR0ZXJtaW5hbFRvb2xTZXNzaW9uSWRcblx0XHQpO1xuXHR9XG5cblx0LyoqIE1hcHMgYSBVSSBzZXNzaW9uIHJlc291cmNlIHRvIGEgYmFja2VuZCBwcm92aWRlciBVUkkuICovXG5cdHByaXZhdGUgX3Jlc29sdmVTZXNzaW9uVXJpKHNlc3Npb25SZXNvdXJjZTogVVJJKTogVVJJIHtcblx0XHRjb25zdCBwcm92aXNpb25hbFNlc3Npb24gPSB0aGlzLl9wcm92aXNpb25hbFNlcnZpY2UuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKHByb3Zpc2lvbmFsU2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIHByb3Zpc2lvbmFsU2Vzc2lvbjtcblx0XHR9XG5cdFx0Y29uc3QgcmF3SWQgPSBzZXNzaW9uUmVzb3VyY2UucGF0aC5zdWJzdHJpbmcoMSk7XG5cdFx0cmV0dXJuIEFnZW50U2Vzc2lvbi51cmkodGhpcy5fY29uZmlnLmJhY2tlbmRTZXNzaW9uU2NoZW1lID8/IHRoaXMuX2NvbmZpZy5wcm92aWRlciwgcmF3SWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNOZXdTZXNzaW9uUmVzb3VyY2Uoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLl9jb25maWcuaXNOZXdTZXNzaW9uPy4oc2Vzc2lvblJlc291cmNlKVxuXHRcdFx0fHwgdGhpcy5fd29ya2luZ0RpcmVjdG9yeVJlc29sdmVyLmlzTmV3U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZvcmtzIGEgc2Vzc2lvbiBhdCB0aGUgZ2l2ZW4gcmVxdWVzdCBwb2ludCBieSBjcmVhdGluZyBhIG5ldyBiYWNrZW5kXG5cdCAqIHNlc3Npb24gd2l0aCB0aGUgYGZvcmtgIHBhcmFtZXRlci4gUmV0dXJucyBhbiB7QGxpbmsgSUNoYXRTZXNzaW9uSXRlbX1cblx0ICogcG9pbnRpbmcgdG8gdGhlIG5ld2x5IGNyZWF0ZWQgc2Vzc2lvbi5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2ZvcmtTZXNzaW9uKFxuXHRcdHNlc3Npb25SZXNvdXJjZTogVVJJLFxuXHRcdGJhY2tlbmRTZXNzaW9uOiBVUkksXG5cdFx0cmVxdWVzdDogSUNoYXRTZXNzaW9uUmVxdWVzdEhpc3RvcnlJdGVtIHwgdW5kZWZpbmVkLFxuXHRcdHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbixcblx0KTogUHJvbWlzZTxJQ2hhdFNlc3Npb25JdGVtPiB7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NhbmNlbGxlZCcpO1xuXHRcdH1cblxuXHRcdC8vIERldGVybWluZSB0aGUgdHVybiBpbmRleCB0byBmb3JrIGF0LiBJZiBhIHNwZWNpZmljIHJlcXVlc3QgaXNcblx0XHQvLyBwcm92aWRlZCwgZm9yayBCRUZPUkUgaXQgKGtlZXBpbmcgdHVybnMgdXAgdG8gdGhlIHByZXZpb3VzIG9uZSkuXG5cdFx0Ly8gVGhpcyBtYXRjaGVzIHRoZSBub24tY29udHJpYnV0ZWQgcGF0aCBpbiBGb3JrQ29udmVyc2F0aW9uQWN0aW9uXG5cdFx0Ly8gd2hpY2ggdXNlcyBgcmVxdWVzdEluZGV4IC0gMWAuIElmIG5vIHJlcXVlc3QgaXMgcHJvdmlkZWQsIGZvcmtcblx0XHQvLyB0aGUgZW50aXJlIHNlc3Npb24uXG5cdFx0Y29uc3QgcHJvdG9jb2xTdGF0ZSA9IHRoaXMuX2dldFNlc3Npb25TdGF0ZShiYWNrZW5kU2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRsZXQgdHVybkluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHJlcXVlc3QpIHtcblx0XHRcdGNvbnN0IHJlcXVlc3RJZHggPSBwcm90b2NvbFN0YXRlPy50dXJucy5maW5kSW5kZXgodCA9PiB0LmlkID09PSByZXF1ZXN0LmlkKTtcblx0XHRcdGlmIChyZXF1ZXN0SWR4ID09PSB1bmRlZmluZWQgfHwgcmVxdWVzdElkeCA8IDApIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgZm9yazogdHVybiBmb3IgcmVxdWVzdCAke3JlcXVlc3QuaWR9IG5vdCBmb3VuZCBpbiBwcm90b2NvbCBzdGF0ZWApO1xuXHRcdFx0fVxuXHRcdFx0Ly8gRm9yayBiZWZvcmUgdGhpcyByZXF1ZXN0IFx1MjAxNCBrZWVwIHR1cm5zIFswLi5yZXF1ZXN0SWR4LTFdXG5cdFx0XHR0dXJuSW5kZXggPSByZXF1ZXN0SWR4IC0gMTtcblx0XHRcdGlmICh0dXJuSW5kZXggPCAwKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IGZvcms6IGNhbm5vdCBmb3JrIGJlZm9yZSB0aGUgZmlyc3QgcmVxdWVzdCcpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAocHJvdG9jb2xTdGF0ZT8udHVybnMubGVuZ3RoKSB7XG5cdFx0XHR0dXJuSW5kZXggPSBwcm90b2NvbFN0YXRlLnR1cm5zLmxlbmd0aCAtIDE7XG5cdFx0fVxuXG5cdFx0aWYgKHR1cm5JbmRleCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBmb3JrOiBubyB0dXJucyB0byBmb3JrIGZyb20nKTtcblx0XHR9XG5cblx0XHRjb25zdCB0dXJuSWQgPSBwcm90b2NvbFN0YXRlIS50dXJuc1t0dXJuSW5kZXhdLmlkO1xuXHRcdGlmICghcHJvdG9jb2xTdGF0ZSEuZGVmYXVsdENoYXQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IGZvcms6IHNvdXJjZSBzZXNzaW9uIGhhcyBubyBkZWZhdWx0IGNoYXQnKTtcblx0XHR9XG5cdFx0Y29uc3QgY2hhdE1vZGVsID0gdGhpcy5fY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0Y29uc3QgZm9ya2VkU2Vzc2lvbiA9IGF3YWl0IHRoaXMuX2NyZWF0ZUFuZFN1YnNjcmliZShzZXNzaW9uUmVzb3VyY2UsIGxhc3RUdXJuTW9kZWxTZWxlY3Rpb24ocHJvdG9jb2xTdGF0ZSksIHtcblx0XHRcdHNlc3Npb246IGJhY2tlbmRTZXNzaW9uLFxuXHRcdFx0Y2hhdDogVVJJLnBhcnNlKHByb3RvY29sU3RhdGUhLmRlZmF1bHRDaGF0KSxcblx0XHRcdHR1cm5JbmRleCxcblx0XHRcdHR1cm5JZCxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGZvcmtlZFJhd0lkID0gQWdlbnRTZXNzaW9uLmlkKGZvcmtlZFNlc3Npb24pO1xuXHRcdGNvbnN0IGZvcmtlZFJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IHRoaXMuX2NvbmZpZy5zZXNzaW9uVHlwZSwgcGF0aDogYC8ke2ZvcmtlZFJhd0lkfWAgfSk7XG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblxuXHRcdGNvbnN0IGZvcmtlZFRpdGxlID0gdGhpcy5fZ2V0U2Vzc2lvblN0YXRlKGZvcmtlZFNlc3Npb24udG9TdHJpbmcoKSk/LnRpdGxlO1xuXHRcdGNvbnN0IGZvcmtlZExhYmVsID0gZm9ya2VkVGl0bGUgfHwgY2hhdE1vZGVsPy50aXRsZSB8fCBsb2NhbGl6ZSgnYWdlbnRIb3N0LmZvcmtlZFNlc3Npb25MYWJlbCcsIFwiRm9ya2VkIFNlc3Npb25cIik7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2U6IGZvcmtlZFJlc291cmNlLFxuXHRcdFx0bGFiZWw6IGZvcmtlZExhYmVsLFxuXHRcdFx0aWNvblBhdGg6IGdldEFnZW50U2Vzc2lvblByb3ZpZGVySWNvbih0aGlzLl9jb25maWcuc2Vzc2lvblR5cGUpLFxuXHRcdFx0dGltaW5nOiB7IGNyZWF0ZWQ6IG5vdywgbGFzdFJlcXVlc3RTdGFydGVkOiBub3csIGxhc3RSZXF1ZXN0RW5kZWQ6IG5vdyB9LFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9lbnN1cmVSZXF1aXJlZEF1dGhlbnRpY2F0aW9uKG1vZGVsOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZCk6IFByb21pc2U8UHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YVtdPiB7XG5cdFx0Y29uc3QgYWdlbnRJbmZvID0gdGhpcy5fZ2V0Um9vdFN0YXRlKCk/LmFnZW50cy5maW5kKGEgPT4gYS5wcm92aWRlciA9PT0gdGhpcy5fY29uZmlnLnByb3ZpZGVyKTtcblx0XHRjb25zdCBwcm90ZWN0ZWRSZXNvdXJjZXMgPSBhZ2VudEluZm8/LnByb3RlY3RlZFJlc291cmNlcyA/PyBbXTtcblx0XHRjb25zdCBhbGxvd1NpZ25lZE91dFdoZW5Vc2FibGUgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBZ2VudEhvc3RBbGxvd1NpZ25lZE91dFdoZW5Vc2FibGVTZXR0aW5nSWQpID09PSB0cnVlO1xuXHRcdGlmIChtb2RlbFJlcXVpcmVzQWdlbnRBdXRoZW50aWNhdGlvbihhZ2VudEluZm8sIG1vZGVsLCBhbGxvd1NpZ25lZE91dFdoZW5Vc2FibGUpICYmIHRoaXMuX2NvbmZpZy5yZXNvbHZlQXV0aGVudGljYXRpb24pIHtcblx0XHRcdGNvbnN0IGF1dGhlbnRpY2F0ZWQgPSBhd2FpdCB0aGlzLl9jb25maWcucmVzb2x2ZUF1dGhlbnRpY2F0aW9uKHByb3RlY3RlZFJlc291cmNlcyk7XG5cdFx0XHRpZiAoIWF1dGhlbnRpY2F0ZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdhZ2VudEhvc3QuYXV0aFJlcXVpcmVkJywgXCJBdXRoZW50aWNhdGlvbiBpcyByZXF1aXJlZCB0byBzdGFydCBhIHNlc3Npb24uIFBsZWFzZSBzaWduIGluIGFuZCB0cnkgYWdhaW4uXCIpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHByb3RlY3RlZFJlc291cmNlcztcblx0fVxuXG5cdC8qKiBDcmVhdGVzIGEgbmV3IGJhY2tlbmQgc2Vzc2lvbiBhbmQgc3Vic2NyaWJlcyB0byBpdHMgc3RhdGUuICovXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZUFuZFN1YnNjcmliZShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgbW9kZWw6IE1vZGVsU2VsZWN0aW9uIHwgdW5kZWZpbmVkLCBmb3JrPzogeyBzZXNzaW9uOiBVUkk7IGNoYXQ6IFVSSTsgdHVybkluZGV4OiBudW1iZXI7IHR1cm5JZDogc3RyaW5nIH0sIGNvbmZpZz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCBpbXBvcnRDb252ZXJzYXRpb24/OiB7IHJlYWRvbmx5IHR1cm5zOiByZWFkb25seSBUdXJuW107IHJlYWRvbmx5IG1vZGVsPzogTW9kZWxTZWxlY3Rpb24gfSwgb25GYWlsdXJlU3RhZ2U/OiAoc3RhZ2U6IEFnZW50SG9zdEludm9jYXRpb25GYWlsdXJlU3RhZ2UpID0+IHZvaWQpOiBQcm9taXNlPFVSST4ge1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcmllcyA9IHRoaXMuX3Jlc29sdmVSZXF1ZXN0ZWRXb3JraW5nRGlyZWN0b3JpZXMoc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCByZXF1ZXN0ZWRTZXNzaW9uID0gZm9yayA/IHVuZGVmaW5lZCA6IHRoaXMuX3Jlc29sdmVTZXNzaW9uVXJpKHNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRIb3N0XSBDcmVhdGluZyBuZXcgc2Vzc2lvbiwgbW9kZWw9JHttb2RlbD8uaWQgPz8gJyhkZWZhdWx0KSd9LCBwcm92aWRlcj0ke3RoaXMuX2NvbmZpZy5wcm92aWRlcn0ke2ZvcmsgPyBgLCBmb3JrIGZyb20gJHtmb3JrLnNlc3Npb24udG9TdHJpbmcoKX0gYXQgaW5kZXggJHtmb3JrLnR1cm5JbmRleH1gIDogJyd9YCk7XG5cblx0XHRvbkZhaWx1cmVTdGFnZT8uKCdhdXRoZW50aWNhdGlvbicpO1xuXHRcdGNvbnN0IHByb3RlY3RlZFJlc291cmNlcyA9IGF3YWl0IHRoaXMuX2Vuc3VyZVJlcXVpcmVkQXV0aGVudGljYXRpb24obW9kZWwpO1xuXG5cdFx0Y29uc3QgYWN0aXZlQ2xpZW50RW50cnkgPSB0aGlzLl9lbnN1cmVBY3RpdmVDbGllbnRFbnRyeShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmIChhY3RpdmVDbGllbnRFbnRyeSkge1xuXHRcdFx0YXdhaXQgYWN0aXZlQ2xpZW50RW50cnkud2hlblNldHRsZWQoKTtcblx0XHR9XG5cdFx0Y29uc3QgYWN0aXZlQ2xpZW50ID0gdGhpcy5fZ2V0Q3VycmVudEFjdGl2ZUNsaWVudChzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0Ly8gT3B0IGluIHRvIGJyaW5nLXVwIHByb2dyZXNzIChjaGllZmx5IHRoZSBsYXp5IGZpcnN0LXVzZSBTREsgZG93bmxvYWQpXG5cdFx0Ly8gc28gdGhlIGVkaXRvciB3aW5kb3cgc3VyZmFjZXMgdGhlIHNhbWUgZG93bmxvYWQgbm90aWZpY2F0aW9uIHRoZVxuXHRcdC8vIEFnZW50cyB3aW5kb3cgZG9lcy4gVGhlIGhvc3QgZWNob2VzIHRoZSBkb3dubG9hZCdzIG93biBpZGVudGl0eSBvblxuXHRcdC8vIGVhY2ggZnJhbWU7IHRoaXMgdG9rZW4gb25seSByZWNvcmRzIGludGVyZXN0LlxuXHRcdGNvbnN0IHByb2dyZXNzVG9rZW4gPSBnZW5lcmF0ZVV1aWQoKTtcblxuXHRcdGxldCBzZXNzaW9uOiBVUkk7XG5cdFx0b25GYWlsdXJlU3RhZ2U/LignY3JlYXRlU2Vzc2lvbicpO1xuXHRcdHRyeSB7XG5cdFx0XHRzZXNzaW9uID0gYXdhaXQgdGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdHNlc3Npb246IHJlcXVlc3RlZFNlc3Npb24sXG5cdFx0XHRcdF9tZXRhOiB0aGlzLl9wcm92aXNpb25hbFNlcnZpY2UuZ2V0SW5pdGlhbFNlc3Npb25NZXRhZGF0YSgpLFxuXHRcdFx0XHRtb2RlbCxcblx0XHRcdFx0cHJvdmlkZXI6IHRoaXMuX2NvbmZpZy5wcm92aWRlcixcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzLFxuXHRcdFx0XHRmb3JrLFxuXHRcdFx0XHRjb25maWcsXG5cdFx0XHRcdGltcG9ydENvbnZlcnNhdGlvbixcblx0XHRcdFx0YWN0aXZlQ2xpZW50LFxuXHRcdFx0XHRwcm9ncmVzc1Rva2VuLFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBJZiBhdXRoZW50aWNhdGlvbiBpcyByZXF1aXJlZCAoZS5nLiB0b2tlbiBleHBpcmVkKSwgdHJ5IGludGVyYWN0aXZlIGF1dGggYW5kIHJldHJ5IG9uY2Vcblx0XHRcdGlmICh0aGlzLl9pc0F1dGhSZXF1aXJlZEVycm9yKGVycikgJiYgdGhpcy5fY29uZmlnLnJlc29sdmVBdXRoZW50aWNhdGlvbikge1xuXHRcdFx0XHRvbkZhaWx1cmVTdGFnZT8uKCdhdXRoZW50aWNhdGlvbicpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ1tBZ2VudEhvc3RdIEF1dGhlbnRpY2F0aW9uIHJlcXVpcmVkLCBwcm9tcHRpbmcgdXNlci4uLicpO1xuXHRcdFx0XHRjb25zdCBhdXRoZW50aWNhdGVkID0gYXdhaXQgdGhpcy5fY29uZmlnLnJlc29sdmVBdXRoZW50aWNhdGlvbihwcm90ZWN0ZWRSZXNvdXJjZXMpO1xuXHRcdFx0XHRpZiAoYXV0aGVudGljYXRlZCkge1xuXHRcdFx0XHRcdG9uRmFpbHVyZVN0YWdlPy4oJ2NyZWF0ZVNlc3Npb24nKTtcblx0XHRcdFx0XHRzZXNzaW9uID0gYXdhaXQgdGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uY3JlYXRlU2Vzc2lvbih7XG5cdFx0XHRcdFx0XHRzZXNzaW9uOiByZXF1ZXN0ZWRTZXNzaW9uLFxuXHRcdFx0XHRcdFx0X21ldGE6IHRoaXMuX3Byb3Zpc2lvbmFsU2VydmljZS5nZXRJbml0aWFsU2Vzc2lvbk1ldGFkYXRhKCksXG5cdFx0XHRcdFx0XHRtb2RlbCxcblx0XHRcdFx0XHRcdHByb3ZpZGVyOiB0aGlzLl9jb25maWcucHJvdmlkZXIsXG5cdFx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXMsXG5cdFx0XHRcdFx0XHRmb3JrLFxuXHRcdFx0XHRcdFx0Y29uZmlnLFxuXHRcdFx0XHRcdFx0aW1wb3J0Q29udmVyc2F0aW9uLFxuXHRcdFx0XHRcdFx0YWN0aXZlQ2xpZW50LFxuXHRcdFx0XHRcdFx0cHJvZ3Jlc3NUb2tlbixcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ2FnZW50SG9zdC5hdXRoUmVxdWlyZWQnLCBcIkF1dGhlbnRpY2F0aW9uIGlzIHJlcXVpcmVkIHRvIHN0YXJ0IGEgc2Vzc2lvbi4gUGxlYXNlIHNpZ24gaW4gYW5kIHRyeSBhZ2Fpbi5cIikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHJlcXVlc3RlZFNlc3Npb24gJiYgIWlzRXF1YWwoc2Vzc2lvbiwgcmVxdWVzdGVkU2Vzc2lvbikpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQWdlbnQgaG9zdCByZXR1cm5lZCB1bmV4cGVjdGVkIHNlc3Npb24gVVJJLiBFeHBlY3RlZCAke3JlcXVlc3RlZFNlc3Npb24udG9TdHJpbmcoKX0sIGdvdCAke3Nlc3Npb24udG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRIb3N0XSBDcmVhdGVkIHNlc3Npb246ICR7c2Vzc2lvbi50b1N0cmluZygpfWApO1xuXG5cdFx0Ly8gU3Vic2NyaWJlIHRvIHRoZSBuZXcgc2Vzc2lvbidzIHN0YXRlXG5cdFx0b25GYWlsdXJlU3RhZ2U/Lignc3Vic2NyaWJlU2Vzc2lvbicpO1xuXHRcdGNvbnN0IG5ld1N1YiA9IHRoaXMuX2Vuc3VyZVNlc3Npb25TdWJzY3JpcHRpb24oc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHR0aGlzLl9jb25maWd1cmVBY3RpdmVDbGllbnRSZWNvbmNpbGlhdGlvbihzZXNzaW9uUmVzb3VyY2UsIHNlc3Npb24sIG5ld1N1Yik7XG5cdFx0aWYgKCF0aGlzLl9nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKSkge1xuXHRcdFx0Ly8gV2FpdCBmb3IgdGhlIHN1YnNjcmlwdGlvbiB0byBoeWRyYXRlLiBgX3doZW5TdWJzY3JpcHRpb25IeWRyYXRlZGBcblx0XHRcdC8vIHNldHRsZXMgb24gc25hcHNob3QsIGVycm9yLCBvciBjYW5jZWxsYXRpb24gYW5kIGF0dGFjaGVzIGl0c1xuXHRcdFx0Ly8gbGlzdGVuZXJzIGJlZm9yZSByZS1jaGVja2luZyB0aGUgdmFsdWUsIGNsb3NpbmcgdGhlIHJhY2Ugd2hlcmUgYVxuXHRcdFx0Ly8gY29uY3VycmVudCBjb25zdW1lciAoZS5nLiB0aGUgY2hhdC1pbnB1dCBwaWNrZXIpIGh5ZHJhdGVzIHRoZVxuXHRcdFx0Ly8gc3Vic2NyaXB0aW9uIGJldHdlZW4gb3VyIGNoZWNrIGFuZCB0aGUgbGlzdGVuZXIgYXR0YWNobWVudC4gSXRcblx0XHRcdC8vIGFsc28gc2V0dGxlcyBvbiBgb25EaWRFcnJvcmAgXHUyMDE0IGEgZmFpbGVkIHN1YnNjcmliZSBmbGlwcyB0aGVcblx0XHRcdC8vIHN1YnNjcmlwdGlvbiB2aWEgYHNldEVycm9yYCwgd2hpY2ggZmlyZXMgYG9uRGlkRXJyb3JgIGJ1dCBOT1Rcblx0XHRcdC8vIGBvbkRpZENoYW5nZWAsIHNvIGFuIGBvbkRpZENoYW5nZWAtb25seSB3YWl0IHdvdWxkIGhhbmcgZm9yIHRoZVxuXHRcdFx0Ly8gZnVsbCB0dXJuIHRpbWVvdXQgKGlzc3VlICM1MjQyKS5cblx0XHRcdGF3YWl0IHRoaXMuX3doZW5TdWJzY3JpcHRpb25IeWRyYXRlZChuZXdTdWIsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJhd1N0YXRlID0gdGhpcy5fcmVxdWlyZVJhd1Nlc3Npb25TdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IGNoYXRVUkkgPSB0aGlzLl9yZXNvbHZlQ2hhdFVyaUZyb21TdGF0ZShzZXNzaW9uUmVzb3VyY2UsIHJhd1N0YXRlKTtcblx0XHR0aGlzLl9zZXRDaGF0VVJJKHNlc3Npb25SZXNvdXJjZSwgY2hhdFVSSSk7XG5cdFx0Y29uc3QgY2hhdFN1YiA9IHRoaXMuX2Vuc3VyZUNoYXRTdWJzY3JpcHRpb24oc2Vzc2lvbi50b1N0cmluZygpLCBjaGF0VVJJKTtcblx0XHRpZiAoIWZvcmspIHtcblx0XHRcdHRoaXMuX2FjdGl2ZVNlc3Npb25zLmdldChzZXNzaW9uUmVzb3VyY2UpPy5zZXRTdGF0ZVN1YnNjcmlwdGlvbnMobmV3U3ViLCBjaGF0U3ViKTtcblx0XHR9XG5cblx0XHQvLyBTdGFydCBzeW5jaW5nIHRoZSBjaGF0IG1vZGVsJ3MgcGVuZGluZyByZXF1ZXN0cyB0byB0aGUgcHJvdG9jb2xcblx0XHR0aGlzLl9lbnN1cmVQZW5kaW5nTWVzc2FnZVN1YnNjcmlwdGlvbihzZXNzaW9uUmVzb3VyY2UsIHNlc3Npb24pO1xuXG5cdFx0Ly8gU3RhcnQgd2F0Y2hpbmcgZm9yIHNlcnZlci1pbml0aWF0ZWQgdHVybnMgb24gdGhpcyBzZXNzaW9uXG5cdFx0dGhpcy5fd2F0Y2hGb3JTZXJ2ZXJJbml0aWF0ZWRUdXJucyhzZXNzaW9uLCBzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0cmV0dXJuIHNlc3Npb247XG5cdH1cblxuXHQvKipcblx0ICogS2VlcHMgY2hhdCBtb2RlbCBhbmQgcHJvdG9jb2wgcGVuZGluZyBtZXNzYWdlcyBzeW5jaHJvbml6ZWQgaW4gYm90aCBkaXJlY3Rpb25zLlxuXHQgKiBOby1vcHMgaWYgYWxyZWFkeSBzdWJzY3JpYmVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfZW5zdXJlUGVuZGluZ01lc3NhZ2VTdWJzY3JpcHRpb24oc2Vzc2lvblJlc291cmNlOiBVUkksIGJhY2tlbmRTZXNzaW9uOiBVUkkpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcGVuZGluZ01lc3NhZ2VTdWJzY3JpcHRpb25zLmhhcyhzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNoYXRNb2RlbCA9IHRoaXMuX2NoYXRTZXJ2aWNlPy5nZXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKGNoYXRNb2RlbCkge1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHR0aGlzLl9wZW5kaW5nTWVzc2FnZVN1YnNjcmlwdGlvbnMuc2V0KHNlc3Npb25SZXNvdXJjZSwgc3RvcmUpO1xuXG5cdFx0XHQvLyBIeWRyYXRlIGZpcnN0IHNvIHRoZSBpbml0aWFsIG91dGJvdW5kIGRpZmYgY2Fubm90IHJlbW92ZSBhbm90aGVyIGNsaWVudCdzIG1lc3NhZ2VzLlxuXHRcdFx0dGhpcy5fYXBwbHlSZW1vdGVQZW5kaW5nTWVzc2FnZXMoc2Vzc2lvblJlc291cmNlLCBiYWNrZW5kU2Vzc2lvbik7XG5cblx0XHRcdHN0b3JlLmFkZChjaGF0TW9kZWwub25EaWRDaGFuZ2VQZW5kaW5nUmVxdWVzdHMoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9zeW5jUGVuZGluZ01lc3NhZ2VzKHNlc3Npb25SZXNvdXJjZSwgYmFja2VuZFNlc3Npb24pO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fc3luY1BlbmRpbmdNZXNzYWdlcyhzZXNzaW9uUmVzb3VyY2UsIGJhY2tlbmRTZXNzaW9uKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblN0ciA9IGJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBjaGF0VVJJID0gdGhpcy5fY2hhdFVSSXNCeVNlc3Npb25SZXNvdXJjZS5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmIChjaGF0VVJJKSB7XG5cdFx0XHRcdGNvbnN0IG9uUmVtb3RlQ2hhbmdlID0gKCkgPT4gdGhpcy5fYXBwbHlSZW1vdGVQZW5kaW5nTWVzc2FnZXMoc2Vzc2lvblJlc291cmNlLCBiYWNrZW5kU2Vzc2lvbik7XG5cdFx0XHRcdHN0b3JlLmFkZCh0aGlzLl9lbnN1cmVTZXNzaW9uU3Vic2NyaXB0aW9uKHNlc3Npb25TdHIpLm9uRGlkQ2hhbmdlKG9uUmVtb3RlQ2hhbmdlKSk7XG5cdFx0XHRcdHN0b3JlLmFkZCh0aGlzLl9lbnN1cmVDaGF0U3Vic2NyaXB0aW9uKHNlc3Npb25TdHIsIGNoYXRVUkkpLm9uRGlkQ2hhbmdlKG9uUmVtb3RlQ2hhbmdlKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcGVuZGluZ01lc3NhZ2VTdWJzY3JpcHRpb25zLnNldChzZXNzaW9uUmVzb3VyY2UsIHRoaXMuX2NoYXRTZXJ2aWNlLm9uRGlkQ3JlYXRlTW9kZWwobW9kZWwgPT4ge1xuXHRcdFx0aWYgKCFpc0VxdWFsKG1vZGVsLnNlc3Npb25SZXNvdXJjZSwgc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wZW5kaW5nTWVzc2FnZVN1YnNjcmlwdGlvbnMuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0dGhpcy5fZW5zdXJlUGVuZGluZ01lc3NhZ2VTdWJzY3JpcHRpb24oc2Vzc2lvblJlc291cmNlLCBiYWNrZW5kU2Vzc2lvbik7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlRHJhZnRTeW5jU3Vic2NyaXB0aW9uKHNlc3Npb25SZXNvdXJjZTogVVJJLCBiYWNrZW5kU2Vzc2lvbjogVVJJLCBjaGF0S2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZHJhZnRTeW5jU3Vic2NyaXB0aW9ucy5oYXMoc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9kcmFmdFN5bmNTdWJzY3JpcHRpb25zLnNldChzZXNzaW9uUmVzb3VyY2UsIHN0b3JlKTtcblx0XHR0aGlzLl9hY3F1aXJlT3JXYWl0Rm9yU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UsIHN0b3JlKS50aGVuKGNoYXRNb2RlbCA9PiB7XG5cdFx0XHRpZiAoIWNoYXRNb2RlbCB8fCBzdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2luc3RhbGxEcmFmdFN5bmMoc2Vzc2lvblJlc291cmNlLCBjaGF0TW9kZWwsIGJhY2tlbmRTZXNzaW9uLCBjaGF0S2V5LCBzdG9yZSk7XG5cdFx0fSwgZXJyID0+IHtcblx0XHRcdGlmICghc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQWdlbnRIb3N0XSBGYWlsZWQgdG8gd2FpdCBmb3IgY2hhdCBtb2RlbCBmb3IgZHJhZnQgc3luYzogJHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX1gLCBlcnIpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYWNxdWlyZU9yV2FpdEZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkksIG93bmVyOiBEaXNwb3NhYmxlU3RvcmUpOiBQcm9taXNlPElDaGF0TW9kZWwgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2NoYXRTZXJ2aWNlLmdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cdFx0Y29uc3Qgd2FpdFN0b3JlID0gb3duZXIuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBuZXcgUHJvbWlzZTxJQ2hhdE1vZGVsIHwgdW5kZWZpbmVkPihyZXNvbHZlID0+IHtcblx0XHRcdFx0d2FpdFN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcmVzb2x2ZSh1bmRlZmluZWQpKSk7XG5cdFx0XHRcdHdhaXRTdG9yZS5hZGQodGhpcy5fY2hhdFNlcnZpY2Uub25EaWRDcmVhdGVNb2RlbChtb2RlbCA9PiB7XG5cdFx0XHRcdFx0aWYgKGlzRXF1YWwobW9kZWwuc2Vzc2lvblJlc291cmNlLCBzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKG1vZGVsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR3YWl0U3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2luc3RhbGxEcmFmdFN5bmMoc2Vzc2lvblJlc291cmNlOiBVUkksIGNoYXRNb2RlbDogSUNoYXRNb2RlbCwgYmFja2VuZFNlc3Npb246IFVSSSwgY2hhdEtleTogc3RyaW5nLCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5wdXRNb2RlbCA9IGNoYXRNb2RlbC5pbnB1dE1vZGVsO1xuXHRcdGlmICghaW5wdXRNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkZWxheWVyID0gc3RvcmUuYWRkKG5ldyBEZWxheWVyPHZvaWQ+KEFnZW50SG9zdFNlc3Npb25IYW5kbGVyLkRSQUZUX1NZTkNfREVCT1VOQ0VfTVMpKTtcblx0XHRjb25zdCBjaGF0U3Vic2NyaXB0aW9uID0gdGhpcy5fZW5zdXJlQ2hhdFN1YnNjcmlwdGlvbihiYWNrZW5kU2Vzc2lvbi50b1N0cmluZygpLCBjaGF0S2V5KTtcblx0XHRjb25zdCByZWFkUmVtb3RlRHJhZnQgPSAoKTogTWVzc2FnZSB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGNoYXRTdWJzY3JpcHRpb24udmFsdWU7XG5cdFx0XHRyZXR1cm4gdmFsdWUgJiYgISh2YWx1ZSBpbnN0YW5jZW9mIEVycm9yKSA/IHZhbHVlLmRyYWZ0IDogdW5kZWZpbmVkO1xuXHRcdH07XG5cdFx0bGV0IHN5bmNlZERyYWZ0ID0gcmVhZFJlbW90ZURyYWZ0KCk7XG5cdFx0Ly8gVGhlIGxhc3QgYGRyYWZ0YCBvYmplY3Qgc2VlbiBvbiB0aGUgY2hhdCBjaGFubmVsLiBQcm90b2NvbCBzdGF0ZSBpc1xuXHRcdC8vIGltbXV0YWJsZSwgc28gYW4gaWRlbnRpY2FsIHJlZmVyZW5jZSBtZWFucyB0aGUgZHJhZnQgZGlkIG5vdCBjaGFuZ2UgXHUyMDE0XG5cdFx0Ly8gbGV0dGluZyB0aGUgbGlzdGVuZXIgYmFpbCBvbiBhIHJlZmVyZW5jZSBjaGVjayBpbnN0ZWFkIG9mIGEgZGVlcFxuXHRcdC8vIGNvbXBhcmUsIHdoaWNoIG1hdHRlcnMgYmVjYXVzZSBpdCBydW5zIG9uIGV2ZXJ5IGNoYXQgc3RhdGUgY2hhbmdlXG5cdFx0Ly8gKGVhY2ggc3RyZWFtaW5nIGRlbHRhKSwgbm90IGp1c3QgZHJhZnQgY2hhbmdlcy5cblx0XHRsZXQgbGFzdFJlbW90ZURyYWZ0ID0gc3luY2VkRHJhZnQ7XG5cdFx0bGV0IGFwcGxpZWRSZW1vdGVEcmFmdDogTWVzc2FnZSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzeW5jRHJhZnQgPSAoc3RhdGU6IElDaGF0TW9kZWxJbnB1dFN0YXRlIHwgdW5kZWZpbmVkKTogdm9pZCA9PiB7XG5cdFx0XHRpZiAoc3RhdGU/Lm9yaWdpbiA9PT0gQ2hhdElucHV0U3RhdGVPcmlnaW4uUmVtb3RlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRyYWZ0ID0gdGhpcy5faW5wdXRTdGF0ZVRvRHJhZnQoc2Vzc2lvblJlc291cmNlLCBzdGF0ZSk7XG5cdFx0XHRpZiAoZXF1YWxzKHN5bmNlZERyYWZ0LCBkcmFmdCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFwcGxpZWRSZW1vdGVEcmFmdCAmJiBzYW1lRHJhZnRVc2VyQ29udGVudChkcmFmdCwgYXBwbGllZFJlbW90ZURyYWZ0KSkge1xuXHRcdFx0XHRzeW5jZWREcmFmdCA9IGRyYWZ0O1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRhcHBsaWVkUmVtb3RlRHJhZnQgPSB1bmRlZmluZWQ7XG5cdFx0XHRzeW5jZWREcmFmdCA9IGRyYWZ0O1xuXG5cdFx0XHR0aGlzLl9jb25maWcuY29ubmVjdGlvbi5kaXNwYXRjaChjaGF0S2V5LCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdERyYWZ0Q2hhbmdlZCxcblx0XHRcdFx0ZHJhZnQsXG5cdFx0XHR9KTtcblx0XHR9O1xuXHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IGlucHV0TW9kZWwuc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0ZGVsYXllci50cmlnZ2VyKCgpID0+IHN5bmNEcmFmdChzdGF0ZSkpLmNhdGNoKCgpID0+IHsgLyogZGVsYXllciBkaXNwb3NlZCAqLyB9KTtcblx0XHR9KSk7XG5cdFx0c3RvcmUuYWRkKGNoYXRTdWJzY3JpcHRpb24ub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVtb3RlRHJhZnQgPSByZWFkUmVtb3RlRHJhZnQoKTtcblx0XHRcdGlmIChyZW1vdGVEcmFmdCA9PT0gbGFzdFJlbW90ZURyYWZ0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGxhc3RSZW1vdGVEcmFmdCA9IHJlbW90ZURyYWZ0O1xuXHRcdFx0aWYgKGVxdWFscyhzeW5jZWREcmFmdCwgcmVtb3RlRHJhZnQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxvY2FsRHJhZnQgPSB0aGlzLl9pbnB1dFN0YXRlVG9EcmFmdChzZXNzaW9uUmVzb3VyY2UsIGlucHV0TW9kZWwuc3RhdGUuZ2V0KCkpO1xuXHRcdFx0aWYgKCFlcXVhbHMoc3luY2VkRHJhZnQsIGxvY2FsRHJhZnQpKSB7XG5cdFx0XHRcdC8vIFRoZSBwZW5kaW5nIG91dGJvdW5kIGRlYm91bmNlIHdpbGwgcHVibGlzaCB0aGUgbG9jYWwgZWRpdCAobGFzdCB3cml0ZXIgd2lucykuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHN5bmNlZERyYWZ0ID0gcmVtb3RlRHJhZnQ7XG5cdFx0XHRhcHBsaWVkUmVtb3RlRHJhZnQgPSByZW1vdGVEcmFmdDtcblx0XHRcdHRoaXMuX2FwcGx5UmVtb3RlRHJhZnQoaW5wdXRNb2RlbCwgc2Vzc2lvblJlc291cmNlLCByZW1vdGVEcmFmdCk7XG5cdFx0fSkpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0ZGVsYXllci5jYW5jZWwoKTtcblx0XHRcdHN5bmNEcmFmdChpbnB1dE1vZGVsLnN0YXRlLmdldCgpKTtcblx0XHR9KSk7XG5cdH1cblxuXHQvKiogQXBwbGllcyBhIHJlbW90ZSBkcmFmdCB3aXRob3V0IHJlcGxhY2luZyBsb2NhbCBpbnB1dCBzdGF0ZSB0aGUgcHJvdG9jb2wgZG9lcyBub3QgY2FycnkuICovXG5cdHByaXZhdGUgX2FwcGx5UmVtb3RlRHJhZnQoaW5wdXRNb2RlbDogSUlucHV0TW9kZWwsIHNlc3Npb25SZXNvdXJjZTogVVJJLCBkcmFmdDogTWVzc2FnZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghZHJhZnQpIHtcblx0XHRcdGlucHV0TW9kZWwuc2V0U3RhdGUoe1xuXHRcdFx0XHRpbnB1dFRleHQ6ICcnLFxuXHRcdFx0XHRzZWxlY3Rpb25zOiBbXSxcblx0XHRcdFx0YXR0YWNobWVudHM6IFtdLFxuXHRcdFx0XHRvcmlnaW46IENoYXRJbnB1dFN0YXRlT3JpZ2luLlJlbW90ZSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXJpYWxpemVkU3RhdGUgPSB0aGlzLl9kcmFmdFRvSW5wdXRTdGF0ZShzZXNzaW9uUmVzb3VyY2UsIGRyYWZ0KTtcblx0XHRpZiAoIXNlcmlhbGl6ZWRTdGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzdGF0ZSA9IHJldml2ZVNlcmlhbGl6YWJsZUlucHV0U3RhdGUoc2VyaWFsaXplZFN0YXRlKTtcblx0XHRjb25zdCBwYXJ0aWFsU3RhdGU6IFBhcnRpYWw8SUNoYXRNb2RlbElucHV0U3RhdGU+ID0ge1xuXHRcdFx0aW5wdXRUZXh0OiBzdGF0ZS5pbnB1dFRleHQsXG5cdFx0XHRzZWxlY3Rpb25zOiBzdGF0ZS5zZWxlY3Rpb25zLFxuXHRcdFx0YXR0YWNobWVudHM6IHN0YXRlLmF0dGFjaG1lbnRzLFxuXHRcdFx0bW9kZTogc3RhdGUubW9kZSxcblx0XHRcdG9yaWdpbjogQ2hhdElucHV0U3RhdGVPcmlnaW4uUmVtb3RlLFxuXHRcdH07XG5cdFx0aWYgKHN0YXRlLnNlbGVjdGVkTW9kZWwpIHtcblx0XHRcdHBhcnRpYWxTdGF0ZS5zZWxlY3RlZE1vZGVsID0gc3RhdGUuc2VsZWN0ZWRNb2RlbDtcblx0XHRcdHBhcnRpYWxTdGF0ZS5tb2RlbENvbmZpZ3VyYXRpb24gPSBzdGF0ZS5tb2RlbENvbmZpZ3VyYXRpb247XG5cdFx0fVxuXHRcdGlucHV0TW9kZWwuc2V0U3RhdGUocGFydGlhbFN0YXRlKTtcblx0fVxuXG5cdHByaXZhdGUgX2lucHV0U3RhdGVUb0RyYWZ0KHNlc3Npb25SZXNvdXJjZTogVVJJLCBzdGF0ZTogSUNoYXRNb2RlbElucHV0U3RhdGUgfCB1bmRlZmluZWQpOiBNZXNzYWdlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2NyZWF0ZU1vZGVsU2VsZWN0aW9uKHN0YXRlLnNlbGVjdGVkTW9kZWw/LmlkZW50aWZpZXIsIHN0YXRlLm1vZGVsQ29uZmlndXJhdGlvbik7XG5cdFx0Y29uc3QgYWdlbnRVcmkgPSBzdGF0ZS5tb2RlLmtpbmQgPT09IENoYXRNb2RlS2luZC5BZ2VudCAmJiBzdGF0ZS5tb2RlLmlkICE9PSBDaGF0TW9kZS5BZ2VudC5pZCA/IHN0YXRlLm1vZGUuaWQgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYXR0YWNobWVudHMgPSB0aGlzLl92YXJpYWJsZUVudHJpZXNUb0F0dGFjaG1lbnRzKHN0YXRlLmF0dGFjaG1lbnRzLCBzZXNzaW9uUmVzb3VyY2UsIHN0YXRlLmlucHV0VGV4dCwgZmFsc2UpO1xuXHRcdGlmICghc3RhdGUuaW5wdXRUZXh0ICYmICFtb2RlbCAmJiAhYWdlbnRVcmkgJiYgYXR0YWNobWVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0dGV4dDogc3RhdGUuaW5wdXRUZXh0LFxuXHRcdFx0b3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSxcblx0XHRcdC4uLihhdHRhY2htZW50cy5sZW5ndGggPiAwID8geyBhdHRhY2htZW50cyB9IDoge30pLFxuXHRcdFx0Li4uKG1vZGVsID8geyBtb2RlbCB9IDoge30pLFxuXHRcdFx0Li4uKGFnZW50VXJpID8geyBhZ2VudDogeyB1cmk6IGFnZW50VXJpIH0gfSA6IHt9KSxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrIGlmIGFuIGVycm9yIGlzIGFuIFwiYXV0aGVudGljYXRpb24gcmVxdWlyZWRcIiBlcnJvci5cblx0ICogQ2hlY2tzIGZvciB0aGUgQUhQX0FVVEhfUkVRVUlSRUQgZXJyb3IgY29kZSB3aGVuIGF2YWlsYWJsZSxcblx0ICogd2l0aCBhIG1lc3NhZ2UtYmFzZWQgZmFsbGJhY2sgZm9yIHRyYW5zcG9ydHMgdGhhdCBkb24ndCBwcmVzZXJ2ZVxuXHQgKiBzdHJ1Y3R1cmVkIGVycm9yIGNvZGVzIChlLmcuIFByb3h5Q2hhbm5lbCkuXG5cdCAqL1xuXHRwcml2YXRlIF9pc0F1dGhSZXF1aXJlZEVycm9yKGVycjogdW5rbm93bik6IGJvb2xlYW4ge1xuXHRcdGlmIChlcnIgaW5zdGFuY2VvZiBQcm90b2NvbEVycm9yICYmIGVyci5jb2RlID09PSBBSFBfQVVUSF9SRVFVSVJFRCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChlcnIgaW5zdGFuY2VvZiBFcnJvciAmJiBlcnIubWVzc2FnZS5pbmNsdWRlcygnQXV0aGVudGljYXRpb24gcmVxdWlyZWQnKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZU1vZGVsU2VsZWN0aW9uKGxhbmd1YWdlTW9kZWxJZGVudGlmaWVyOiBzdHJpbmcgfCB1bmRlZmluZWQsIG1vZGVsQ29uZmlndXJhdGlvbjogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmF3TW9kZWxJZCA9IHRoaXMuX2V4dHJhY3RSYXdNb2RlbElkKGxhbmd1YWdlTW9kZWxJZGVudGlmaWVyKTtcblx0XHRpZiAoIXJhd01vZGVsSWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gRm9yd2FyZCBtb2RlbC1zcGVjaWZpYyBjb25maWcgdmFsdWVzIGFzLWlzLiBNb3N0IHBpY2tlcnMgcHJvZHVjZSBzdHJpbmdzLFxuXHRcdC8vIGJ1dCBhIHN5bnRoZXNpemVkIG51bWVyaWMgcGlja2VyIChlLmcuIHRoZSBjb250ZXh0LXNpemUgcGlja2VyLCB3aG9zZSBlbnVtXG5cdFx0Ly8gdmFsdWVzIGFyZSB0b2tlbiBjb3VudHMpIGhhbmRzIGJhY2sgYSBudW1iZXI7IHRoZSBwcm90b2NvbCBgY29uZmlnYCBiYWdcblx0XHQvLyBjYXJyaWVzIEpTT04gcHJpbWl0aXZlcywgc28gdGhlIHNlbGVjdGlvbiBzdXJ2aXZlcyBpbnRvIGl0IChhbmQgaXMgbWFwcGVkXG5cdFx0Ly8gdG8gdGhlIFNESyBjb250ZXh0IHRpZXIgYnkgdGhlIGFnZW50J3MgYGdldENvcGlsb3RDb250ZXh0VGllcmApLlxuXHRcdGNvbnN0IGNvbmZpZzogUmVjb3JkPHN0cmluZywgSnNvblByaW1pdGl2ZT4gPSB7fTtcblx0XHRmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhtb2RlbENvbmZpZ3VyYXRpb24gPz8ge30pKSB7XG5cdFx0XHRpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyB8fCB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInIHx8IHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nIHx8IHZhbHVlID09PSBudWxsKSB7XG5cdFx0XHRcdGNvbmZpZ1trZXldID0gdmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIE9iamVjdC5rZXlzKGNvbmZpZykubGVuZ3RoID4gMCA/IHsgaWQ6IHJhd01vZGVsSWQsIGNvbmZpZyB9IDogeyBpZDogcmF3TW9kZWxJZCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZHJhZnRUb0lucHV0U3RhdGUoc2Vzc2lvblJlc291cmNlOiBVUkksIGRyYWZ0OiBNZXNzYWdlIHwgdW5kZWZpbmVkKTogSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdGlmICghZHJhZnQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsSWQgPSB0aGlzLl90b0xhbmd1YWdlTW9kZWxJZChzZXNzaW9uUmVzb3VyY2UsIGRyYWZ0Lm1vZGVsPy5pZCk7XG5cdFx0Y29uc3QgbWV0YWRhdGEgPSBtb2RlbElkID8gdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwobW9kZWxJZCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgdmFyaWFibGVEYXRhID0gbWVzc2FnZUF0dGFjaG1lbnRzVG9WYXJpYWJsZURhdGEoZHJhZnQuYXR0YWNobWVudHMsIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5LCBkcmFmdC50ZXh0KTtcblx0XHRjb25zdCBjdXJzb3IgPSBvZmZzZXRUb1Bvc2l0aW9uKGRyYWZ0LnRleHQsIGRyYWZ0LnRleHQubGVuZ3RoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0YXR0YWNobWVudHM6IHZhcmlhYmxlRGF0YT8udmFyaWFibGVzID8/IFtdLFxuXHRcdFx0Y29udHJpYjoge30sXG5cdFx0XHRpbnB1dFRleHQ6IGRyYWZ0LnRleHQsXG5cdFx0XHRtb2RlOiB7IGlkOiBkcmFmdC5hZ2VudD8udXJpID8/IENoYXRNb2RlLkFnZW50LmlkLCBraW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQgfSxcblx0XHRcdHNlbGVjdGVkTW9kZWw6IG1vZGVsSWQgJiYgbWV0YWRhdGEgPyB7XG5cdFx0XHRcdGlkZW50aWZpZXI6IG1vZGVsSWQsXG5cdFx0XHRcdG1ldGFkYXRhLFxuXHRcdFx0XHQuLi4oZHJhZnQubW9kZWw/LmNvbmZpZyA/IHsgbW9kZWxDb25maWd1cmF0aW9uOiBkcmFmdC5tb2RlbC5jb25maWcgfSA6IHt9KSxcblx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRzZWxlY3Rpb25zOiBbe1xuXHRcdFx0XHRzZWxlY3Rpb25TdGFydExpbmVOdW1iZXI6IGN1cnNvci5saW5lTnVtYmVyLFxuXHRcdFx0XHRzZWxlY3Rpb25TdGFydENvbHVtbjogY3Vyc29yLmNvbHVtbixcblx0XHRcdFx0cG9zaXRpb25MaW5lTnVtYmVyOiBjdXJzb3IubGluZU51bWJlcixcblx0XHRcdFx0cG9zaXRpb25Db2x1bW46IGN1cnNvci5jb2x1bW4sXG5cdFx0XHR9XSxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEV4dHJhY3RzIHRoZSByYXcgbW9kZWwgaWQgZnJvbSBhIGxhbmd1YWdlLW1vZGVsIHNlcnZpY2UgaWRlbnRpZmllci5cblx0ICogRS5nLiBcImFnZW50LWhvc3QtY29waWxvdDpjbGF1ZGUtc29ubmV0LTQtMjAyNTA1MTRcIiBcdTIxOTIgXCJjbGF1ZGUtc29ubmV0LTQtMjAyNTA1MTRcIi5cblx0ICogRm9yZWlnbiBleHRlbnNpb24taG9zdCBpZGVudGlmaWVycyAoYCR7dmVuZG9yfS8ke2lkfWApIGFyZSBkcm9wcGVkIHNvXG5cdCAqIHRoZSBhZ2VudCBob3N0IGZhbGxzIGJhY2sgdG8gaXRzIGRlZmF1bHQgbW9kZWwuXG5cdCAqL1xuXHRwcml2YXRlIF9leHRyYWN0UmF3TW9kZWxJZChsYW5ndWFnZU1vZGVsSWRlbnRpZmllcjogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWxhbmd1YWdlTW9kZWxJZGVudGlmaWVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBwcmVmaXggPSB0aGlzLl9jb25maWcuc2Vzc2lvblR5cGUgKyAnOic7XG5cdFx0aWYgKGxhbmd1YWdlTW9kZWxJZGVudGlmaWVyLnN0YXJ0c1dpdGgocHJlZml4KSkge1xuXHRcdFx0cmV0dXJuIGxhbmd1YWdlTW9kZWxJZGVudGlmaWVyLnN1YnN0cmluZyhwcmVmaXgubGVuZ3RoKTtcblx0XHR9XG5cdFx0aWYgKGxhbmd1YWdlTW9kZWxJZGVudGlmaWVyLmluY2x1ZGVzKCcvJykpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdF0gRHJvcHBpbmcgZm9yZWlnbiBtb2RlbCBpZGVudGlmaWVyICcke2xhbmd1YWdlTW9kZWxJZGVudGlmaWVyfScgZm9yIHNlc3Npb24gdHlwZSAnJHt0aGlzLl9jb25maWcuc2Vzc2lvblR5cGV9JzsgZmFsbGluZyBiYWNrIHRvIGRlZmF1bHQgbW9kZWwuYCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gbGFuZ3VhZ2VNb2RlbElkZW50aWZpZXI7XG5cdH1cblxuXHRwcml2YXRlIF90b0xhbmd1YWdlTW9kZWxJZChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgcmF3TW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXJhd01vZGVsSWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHByZWZpeCA9IGAke2dldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpfTpgO1xuXHRcdHJldHVybiByYXdNb2RlbElkLnN0YXJ0c1dpdGgocHJlZml4KSA/IHJhd01vZGVsSWQgOiBgJHtwcmVmaXh9JHtyYXdNb2RlbElkfWA7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRMYW5ndWFnZU1vZGVsRGlzcGxheU5hbWUobW9kZWxJZGVudGlmaWVyOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghbW9kZWxJZGVudGlmaWVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBtZXRhZGF0YSA9IHRoaXMuX2xhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKG1vZGVsSWRlbnRpZmllcik7XG5cdFx0cmV0dXJuIG1ldGFkYXRhID8gZ2V0TGFuZ3VhZ2VNb2RlbERpc3BsYXlOYW1lV2l0aFByb3ZpZGVyKHsgaWRlbnRpZmllcjogbW9kZWxJZGVudGlmaWVyLCBtZXRhZGF0YSB9LCB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VHVyblJlc3BvbnNlRGV0YWlscyhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgYmFja2VuZFNlc3Npb246IFVSSSwgdHVybjogVHVybiB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZmFsbGJhY2tSYXdNb2RlbElkID0gdHVybj8ubWVzc2FnZT8ubW9kZWw/LmlkID8/IGxhc3RUdXJuTW9kZWxTZWxlY3Rpb24odGhpcy5fZ2V0U2Vzc2lvblN0YXRlKGJhY2tlbmRTZXNzaW9uLnRvU3RyaW5nKCkpKT8uaWQ7XG5cdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZVR1cm5Nb2RlbExvb2t1cChzZXNzaW9uUmVzb3VyY2UsIGZhbGxiYWNrUmF3TW9kZWxJZCkudG9SZXNwb25zZURldGFpbHModHVybj8udXNhZ2U/Lm1vZGVsLCB0dXJuPy51c2FnZSk7XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGRzIGEgcGVyLXR1cm4gbW9kZWwgbG9va3VwIHRoYXQgbmFtZXNwYWNlcyByYXcgQUhQIG1vZGVsIGlkcyBpbnRvXG5cdCAqIGNoYXQtbGF5ZXIgbGFuZ3VhZ2UtbW9kZWwgaWRzIGFuZCByZXNvbHZlcyBodW1hbi1yZWFkYWJsZSBkaXNwbGF5XG5cdCAqIG5hbWVzIHZpYSB0aGUgcmVnaXN0ZXJlZCBsYW5ndWFnZS1tb2RlbCBwcm92aWRlcnMgKHNvIHRoZSBjaGF0IFVJJ3Ncblx0ICogcGVyLXJlc3BvbnNlIGZvb3RlciBjYW4gc2hvdyBlLmcuIFwiQ2xhdWRlIE9wdXMgNC43XCIgaW5zdGVhZCBvZiB0aGVcblx0ICogcmF3IG1vZGVsIGlkKS4gYGZhbGxiYWNrUmF3TW9kZWxJZGAgaXMgdXNlZCB3aGVuIGEgdHVybidzXG5cdCAqIGB1c2FnZT8ubW9kZWxgIGlzIG5vdCB5ZXQgc2V0IChlLmcuIG9sZGVyIHNlc3Npb25zIG9yIHR1cm5zIHRoYXRcblx0ICogbmV2ZXIgcmVwb3J0ZWQgdXNhZ2UpLlxuXHQgKi9cblx0cHJpdmF0ZSBfY3JlYXRlVHVybk1vZGVsTG9va3VwKHNlc3Npb25SZXNvdXJjZTogVVJJLCBmYWxsYmFja1Jhd01vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFR1cm5Nb2RlbExvb2t1cCB7XG5cdFx0Y29uc3QgcmVzb2x2ZVJhdyA9IChyYXdNb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4gcmF3TW9kZWxJZCA/PyBmYWxsYmFja1Jhd01vZGVsSWQ7XG5cdFx0Ly8gVHJ5IHRoZSByYXcgYmlsbGVkIGlkIGFuZCBpdHMgZG90cy1ub3JtYWxpc2VkIGZvcm0gKHNsdWcgbWlzbWF0Y2g6XG5cdFx0Ly8gYGNsYXVkZS1zb25uZXQtNC02YCBcdTIxOTIgYC42YCkgYmVmb3JlIGZhbGxpbmcgYmFjayB0byB0aGUgcGlja2VkIG1vZGVsLlxuXHRcdGNvbnN0IGxvb2t1cFJhd01vZGVsID0gKHJhd01vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHsgaWRlbnRpZmllcjogc3RyaW5nOyBtb2RlbDogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE7IHJlc29sdmVkRnJvbVJhdzogdHJ1ZSB9IHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdGNvbnN0IG5vcm1hbGl6ZWRSYXcgPSByYXdNb2RlbElkPy5yZXBsYWNlKC8tKFxcZCspJC8sICcuJDEnKTtcblx0XHRcdGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIFtyYXdNb2RlbElkLCBub3JtYWxpemVkUmF3ICE9PSByYXdNb2RlbElkID8gbm9ybWFsaXplZFJhdyA6IHVuZGVmaW5lZF0pIHtcblx0XHRcdFx0Y29uc3QgbW9kZWxJZCA9IHRoaXMuX3RvTGFuZ3VhZ2VNb2RlbElkKHNlc3Npb25SZXNvdXJjZSwgY2FuZGlkYXRlKTtcblx0XHRcdFx0aWYgKCFtb2RlbElkKSB7IGNvbnRpbnVlOyB9XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwobW9kZWxJZCk7XG5cdFx0XHRcdGlmIChtb2RlbCkgeyByZXR1cm4geyBpZGVudGlmaWVyOiBtb2RlbElkLCBtb2RlbCwgcmVzb2x2ZWRGcm9tUmF3OiB0cnVlIH07IH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fTtcblx0XHRjb25zdCBsb29rdXBNb2RlbCA9IChyYXdNb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB7IGlkZW50aWZpZXI6IHN0cmluZzsgbW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhOyByZXNvbHZlZEZyb21SYXc6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRjb25zdCByYXdNb2RlbCA9IGxvb2t1cFJhd01vZGVsKHJhd01vZGVsSWQpO1xuXHRcdFx0aWYgKHJhd01vZGVsKSB7XG5cdFx0XHRcdHJldHVybiByYXdNb2RlbDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZhbGxiYWNrTW9kZWxJZCA9IHRoaXMuX3RvTGFuZ3VhZ2VNb2RlbElkKHNlc3Npb25SZXNvdXJjZSwgZmFsbGJhY2tSYXdNb2RlbElkKTtcblx0XHRcdGlmIChmYWxsYmFja01vZGVsSWQpIHtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChmYWxsYmFja01vZGVsSWQpO1xuXHRcdFx0XHRpZiAobW9kZWwpIHsgcmV0dXJuIHsgaWRlbnRpZmllcjogZmFsbGJhY2tNb2RlbElkLCBtb2RlbCwgcmVzb2x2ZWRGcm9tUmF3OiBmYWxzZSB9OyB9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH07XG5cdFx0cmV0dXJuIHtcblx0XHRcdHRvTGFuZ3VhZ2VNb2RlbElkOiAocmF3TW9kZWxJZCkgPT4gdGhpcy5fdG9MYW5ndWFnZU1vZGVsSWQoc2Vzc2lvblJlc291cmNlLCByZXNvbHZlUmF3KHJhd01vZGVsSWQpKSxcblx0XHRcdHRvTW9kZWxEaXNwbGF5TmFtZTogcmF3TW9kZWxJZCA9PiBsb29rdXBSYXdNb2RlbChyYXdNb2RlbElkKT8ubW9kZWwubmFtZSxcblx0XHRcdHRvUmVzcG9uc2VEZXRhaWxzOiAocmF3TW9kZWxJZCwgdXNhZ2UpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBsb29rdXBNb2RlbChyYXdNb2RlbElkKTtcblx0XHRcdFx0Ly8gcmVzb2x2ZWRGcm9tUmF3PWZhbHNlIG1lYW5zIHdlIGZlbGwgYmFjayB0byB0aGUgcGlja2VkIG1vZGVsOyBzdXJmYWNlIGJpbGxlZE1vZGVsSWQgc29cblx0XHRcdFx0Ly8gZS5nLiBhbiBcIkF1dG9cIiBwaWNrIHJlYWRzIFwiQXV0byAocmFwdG9yLW1pbmkpXCIuXG5cdFx0XHRcdGNvbnN0IGJpbGxlZE1vZGVsSWQgPSByZXNvbHZlZCAmJiAhcmVzb2x2ZWQucmVzb2x2ZWRGcm9tUmF3ID8gcmF3TW9kZWxJZCA6IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgcmVzcG9uc2VNb2RlbCA9IHJlc29sdmVkID8ge1xuXHRcdFx0XHRcdG5hbWU6IGdldExhbmd1YWdlTW9kZWxEaXNwbGF5TmFtZVdpdGhQcm92aWRlcih7IGlkZW50aWZpZXI6IHJlc29sdmVkLmlkZW50aWZpZXIsIG1ldGFkYXRhOiByZXNvbHZlZC5tb2RlbCB9LCB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UpLFxuXHRcdFx0XHRcdHByaWNpbmc6IHJlc29sdmVkLm1vZGVsLnByaWNpbmcsXG5cdFx0XHRcdH0gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdHJldHVybiBmb3JtYXRUdXJuUmVzcG9uc2VEZXRhaWxzKHJlc3BvbnNlTW9kZWwsIGJpbGxlZE1vZGVsSWQsIHVzYWdlKTtcblx0XHRcdH0sXG5cdFx0XHR0b0F1dG9Nb2RlUmVzb2x1dGlvbjogdXNhZ2UgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNvbHV0aW9uID0gcmVhZFVzYWdlSW5mb01ldGEodXNhZ2UpLmF1dG9Nb2RlUmVzb2x2ZWQ7XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkID0gcmVzb2x1dGlvbiA/IGxvb2t1cE1vZGVsKHJlc29sdXRpb24uY2hvc2VuTW9kZWwpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZE1vZGVsTmFtZSA9IHJlc29sdmVkPy5yZXNvbHZlZEZyb21SYXcgPyByZXNvbHZlZC5tb2RlbC5uYW1lIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRyZXR1cm4gdXNhZ2VJbmZvVG9BdXRvTW9kZVJlc29sdXRpb24odXNhZ2UsIHJlc29sdmVkTW9kZWxOYW1lKTtcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVSZXF1ZXN0ZWRXb3JraW5nRGlyZWN0b3J5KHNlc3Npb25SZXNvdXJjZTogVVJJKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlnLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5Py4oc2Vzc2lvblJlc291cmNlKVxuXHRcdFx0Pz8gdGhpcy5fbmV3U2Vzc2lvbkZvbGRlclNlcnZpY2U/LmdldEZvbGRlcihzZXNzaW9uUmVzb3VyY2UpXG5cdFx0XHQ/PyB0aGlzLl93b3JraW5nRGlyZWN0b3J5UmVzb2x2ZXI/LnJlc29sdmUoc2Vzc2lvblJlc291cmNlKVxuXHRcdFx0Pz8gdGhpcy5fbmV3U2Vzc2lvbkZvbGRlclNlcnZpY2U/LmdldERlZmF1bHRGb2xkZXIoKVxuXHRcdFx0Pz8gdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVyc1swXT8udXJpO1xuXHR9XG5cblx0LyoqIGB1bmRlZmluZWRgIGlzIHByZXNlcnZlZCBmb3IgY3JlYXRlU2Vzc2lvbiB0byBsZXQgdGhlIGhvc3QgY2hvb3NlIGl0cyB3b3JraW5nIGRpcmVjdG9yaWVzLiAqL1xuXHRwcml2YXRlIF9yZXNvbHZlUmVxdWVzdGVkV29ya2luZ0RpcmVjdG9yaWVzKHNlc3Npb25SZXNvdXJjZTogVVJJKTogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHByaW1hcnkgPSB0aGlzLl9yZXNvbHZlUmVxdWVzdGVkV29ya2luZ0RpcmVjdG9yeShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHJldHVybiBjb21wdXRlV29ya2luZ0RpcmVjdG9yaWVzKHByaW1hcnksIHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubWFwKGZvbGRlciA9PiBmb2xkZXIudXJpKSwgdGhpcy5fZ2V0Um9vdFN0YXRlKCksIHRoaXMuX2NvbmZpZy5wcm92aWRlcik7XG5cdH1cblxuXHQvKipcblx0ICogU2NvcGUgcm9vdHMgYWx3YXlzIGRlc2NyaWJlIGEgY29uY3JldGUgY3VzdG9taXphdGlvbiBsb29rdXAuIFRoaXMgZGlmZmVyc1xuXHQgKiBmcm9tIGBfcmVzb2x2ZVJlcXVlc3RlZFdvcmtpbmdEaXJlY3Rvcmllc2A6IGl0cyBgdW5kZWZpbmVkYCBpcyBwcm90b2NvbFxuXHQgKiBtZWFuaW5nZnVsIGFuZCBsZXRzIHRoZSBob3N0IGNob29zZSB3b3JraW5nIGRpcmVjdG9yaWVzIGZvciBjcmVhdGVTZXNzaW9uLlxuXHQgKlxuXHQgKiBBbiBleGlzdGluZyBzZXNzaW9uJ3Mgcm9vdHMgYXJlIGZpeGVkIGF0IGNyZWF0aW9uIGFuZCBwZXJzaXN0ZWQgaW4gaXRzXG5cdCAqIHN0YXRlLCBzbyB0aGV5IGFyZSByZWFkIGZyb20gdGhlcmUgcmF0aGVyIHRoYW4gcmVjb21wdXRlZCBmcm9tIHRoZSBjdXJyZW50XG5cdCAqIHdvcmtzcGFjZSBcdTIwMTQgb3RoZXJ3aXNlIGEgc2luZ2xlLWZvbGRlciBzZXNzaW9uIG9wZW5lZCBpbnNpZGUgYSBtdWx0aS1yb290XG5cdCAqIHdvcmtzcGFjZSB3b3VsZCBwaWNrIHVwIHRoZSBvdGhlciB3b3Jrc3BhY2UgZm9sZGVycy4gTmV3IHNlc3Npb25zIGhhdmUgbm9cblx0ICogc3RhdGUgeWV0LCBzbyB0aGV5IGZhbGwgYmFjayB0byB0aGUgd29ya3NwYWNlLWRlcml2ZWQgc2V0IHRoZXkgd2lsbCBiZVxuXHQgKiBjcmVhdGVkIHdpdGguXG5cdCAqL1xuXHRwcml2YXRlIF9yZXNvbHZlQ3VzdG9taXphdGlvblNjb3BlUm9vdHMoc2Vzc2lvblJlc291cmNlOiBVUkkpOiByZWFkb25seSBVUklbXSB7XG5cdFx0aWYgKCF0aGlzLl9pc05ld1Nlc3Npb25SZXNvdXJjZShzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRjb25zdCBvd24gPSB0aGlzLl9leGlzdGluZ1Nlc3Npb25Xb3JraW5nRGlyZWN0b3JpZXMoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdC8vIEFuIGVtcHR5IHNldCBpcyBtZWFuaW5nZnVsIChhIHdvcmtzcGFjZS1sZXNzIHNlc3Npb24pLCBzbyBvbmx5IGFcblx0XHRcdC8vIG1pc3NpbmcgKGB1bmRlZmluZWRgKSByZXN1bHQgZmFsbHMgYmFjayB0byB0aGUgd29ya3NwYWNlLWRlcml2ZWQgc2V0LlxuXHRcdFx0aWYgKG93biAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiBvd247XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZXNvbHZlUmVxdWVzdGVkV29ya2luZ0RpcmVjdG9yaWVzKHNlc3Npb25SZXNvdXJjZSkgPz8gW107XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHdvcmtpbmcgZGlyZWN0b3JpZXMgYW4gYWxyZWFkeS1jcmVhdGVkIHNlc3Npb24gd2FzIHN0YXJ0ZWQgd2l0aCwgcmVhZFxuXHQgKiBmcm9tIGl0cyBhdXRob3JpdGF0aXZlIChoeWRyYXRlZCkgc3RhdGUuXG5cdCAqXG5cdCAqIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgc2Vzc2lvbidzIHdvcmtpbmcgZGlyZWN0b3JpZXMgYXJlIGFic2VudCBcdTIwMTQgbm9cblx0ICogaHlkcmF0ZWQgc3RhdGUgeWV0LCBvciBhIHNlc3Npb24gdGhhdCBpbmhlcml0cyBpdHMgZGlyZWN0b3JpZXMgXHUyMDE0IHNvIGNhbGxlcnNcblx0ICogZmFsbCBiYWNrIHRvIHRoZSB3b3Jrc3BhY2UtZGVyaXZlZCBzZXQuIEFuIGV4cGxpY2l0IGVtcHR5IHNldCBpc1xuXHQgKiBhdXRob3JpdGF0aXZlIGFuZCByZXR1cm5lZCBhcyBgW11gOiBhIHdvcmtzcGFjZS1sZXNzIHNlc3Npb24gbXVzdCBub3Rcblx0ICogaW5oZXJpdCB0aGUgY3VycmVudCB3b3Jrc3BhY2UncyByb290cy4gVGhpcyBtaXJyb3JzIHRoZSBob3N0LXNpZGVcblx0ICogYHVuZGVmaW5lZGAgKGluaGVyaXQpIHZzIGBbXWAgKGV4cGxpY2l0bHkgbm9uZSkgZGlzdGluY3Rpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9leGlzdGluZ1Nlc3Npb25Xb3JraW5nRGlyZWN0b3JpZXMoc2Vzc2lvblJlc291cmNlOiBVUkkpOiByZWFkb25seSBVUklbXSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYmFja2VuZFNlc3Npb24gPSB0aGlzLl9yZXNvbHZlU2Vzc2lvblVyaShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IGRpcnMgPSB0aGlzLl9nZXRSYXdTZXNzaW9uU3RhdGUoYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSk/LndvcmtpbmdEaXJlY3Rvcmllcztcblx0XHRpZiAoZGlycyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gZGlycy5tYXAoZGlyZWN0b3J5ID0+IHR5cGVvZiBkaXJlY3RvcnkgPT09ICdzdHJpbmcnID8gVVJJLnBhcnNlKGRpcmVjdG9yeSkgOiBkaXJlY3RvcnkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEVuc3VyZXMgdGhlIHdvcmtzcGFjZS9mb2xkZXIgdGhlIGFnZW50IHdpbGwgcnVuIGluIGlzIHRydXN0ZWQgYmVmb3JlIGFcblx0ICogc2Vzc2lvbiBpcyBzcGF3bmVkLiBSZXR1cm5zIGBmYWxzZWAgaWYgdGhlIHVzZXIgZGVjbGluZXMuXG5cdCAqXG5cdCAqIFdoZW4gdGhlIGFnZW50IHJ1bnMgaW5zaWRlIHRoZSBjdXJyZW50bHkgb3BlbiB3b3Jrc3BhY2UgKGVkaXRvciB3aW5kb3cpLFxuXHQgKiBnYXRlIG9uIHdvcmtzcGFjZSB0cnVzdCB0byBtYXRjaCBob3cgZXh0ZW5zaW9uLWhvc3QgY2hhdCBpcyBnYXRlZC4gV2hlblxuXHQgKiBpdCB0YXJnZXRzIGEgc3RhbmRhbG9uZSBmb2xkZXIgb3V0c2lkZSB0aGUgb3BlbiB3b3Jrc3BhY2UgKEFnZW50cyB3aW5kb3dcblx0ICogcGVyLXNlc3Npb24gZm9sZGVycyksIGdhdGUgb24gdGhhdCBmb2xkZXIncyB0cnVzdCBpbnN0ZWFkLiBCb3RoIHJlcXVlc3Rcblx0ICogaGVscGVycyByZXNvbHZlIGltbWVkaWF0ZWx5IHdoZW4gdGhlIHRhcmdldCBpcyBhbHJlYWR5IHRydXN0ZWQsIHNvIHRoaXNcblx0ICogbmV2ZXIgZG91YmxlLXByb21wdHMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9lbnN1cmVXb3Jrc3BhY2VUcnVzdChzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSBsb2NhbGl6ZSgnYWdlbnRIb3N0LndvcmtzcGFjZVRydXN0JywgXCJBSSBmZWF0dXJlcyBhcmUgY3VycmVudGx5IG9ubHkgc3VwcG9ydGVkIGluIHRydXN0ZWQgd29ya3NwYWNlcy5cIik7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IHRoaXMuX3Jlc29sdmVSZXF1ZXN0ZWRXb3JraW5nRGlyZWN0b3J5KHNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHRpZiAoIXdvcmtpbmdEaXJlY3RvcnkgfHwgdGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKHdvcmtpbmdEaXJlY3RvcnkpKSB7XG5cdFx0XHRyZXR1cm4gISFhd2FpdCB0aGlzLl93b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLnJlcXVlc3RXb3Jrc3BhY2VUcnVzdCh7IG1lc3NhZ2UgfSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICEhYXdhaXQgdGhpcy5fd29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5yZXF1ZXN0UmVzb3VyY2VzVHJ1c3QoeyB1cmk6IHdvcmtpbmdEaXJlY3RvcnksIG1lc3NhZ2UgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9jb252ZXJ0VmFyaWFibGVzVG9BdHRhY2htZW50cyhyZXF1ZXN0OiBJQ2hhdEFnZW50UmVxdWVzdCk6IE1lc3NhZ2VBdHRhY2htZW50W10ge1xuXHRcdGNvbnN0IGF0dGFjaG1lbnRzID0gdGhpcy5fdmFyaWFibGVFbnRyaWVzVG9BdHRhY2htZW50cyhyZXF1ZXN0LnZhcmlhYmxlcy52YXJpYWJsZXMsIHJlcXVlc3Quc2Vzc2lvblJlc291cmNlLCByZXF1ZXN0Lm1lc3NhZ2UpO1xuXHRcdGNvbnN0IGV4cGxpY2l0Q291bnQgPSBhdHRhY2htZW50cy5sZW5ndGg7XG5cdFx0dGhpcy5fYXBwZW5kQWN0aXZlRWRpdG9yQXR0YWNobWVudHMoYXR0YWNobWVudHMsIHJlcXVlc3QpO1xuXHRcdGlmIChhdHRhY2htZW50cy5sZW5ndGggIT09IGV4cGxpY2l0Q291bnQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtBZ2VudEhvc3RdIEZvcndhcmRlZCAke2F0dGFjaG1lbnRzLmxlbmd0aCAtIGV4cGxpY2l0Q291bnR9IGFjdGl2ZSBlZGl0b3IgYXR0YWNobWVudChzKTsgJHthdHRhY2htZW50cy5sZW5ndGh9IHRvdGFsYCk7XG5cdFx0fVxuXHRcdHJldHVybiBhdHRhY2htZW50cztcblx0fVxuXG5cdC8qKlxuXHQgKiBGb3J3YXJkIHRoZSBhY3RpdmUgZWRpdG9yICh3aGljaCB0aGUgc3VnZ2VzdGVkLWNvbnRleHQgZmxvdyBvbWl0cyBpbiBhZ2VudCBtb2RlKSBhcyBhbWJpZW50IGNvbnRleHQsIGRlZHVwZWRcblx0ICogYWdhaW5zdCBmaWxlcyB0aGUgdXNlciBhdHRhY2hlZCBleHBsaWNpdGx5LiBHYXRlZCBvblxuXHQgKiB7QGxpbmsgQ2hhdENvbmZpZ3VyYXRpb24uSW1wbGljaXRDb250ZXh0QWN0aXZlRWRpdG9yfSAob24gYnkgZGVmYXVsdCwgb2ZmIGluIHRoZSBBZ2VudHMgd2luZG93KS5cblx0ICogVW5zYXZlZCBoYW5kbGluZyBsaXZlcyBpbiB7QGxpbmsgX2NvbnZlcnRWYXJpYWJsZVRvQXR0YWNobWVudH0uXG5cdCAqL1xuXHRwcml2YXRlIF9hcHBlbmRBY3RpdmVFZGl0b3JBdHRhY2htZW50cyhhdHRhY2htZW50czogTWVzc2FnZUF0dGFjaG1lbnRbXSwgcmVxdWVzdDogSUNoYXRBZ2VudFJlcXVlc3QpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkltcGxpY2l0Q29udGV4dEFjdGl2ZUVkaXRvcikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaW1wbGljaXRDb250ZXh0ID0gdGhpcy5fY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UocmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UpPy5pbnB1dC5pbXBsaWNpdENvbnRleHQ7XG5cdFx0aWYgKCFpbXBsaWNpdENvbnRleHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gS2V5IG9uIHNvdXJjZSBlbnRyaWVzIChub3QgcHJvZHVjZWQgYXR0YWNobWVudHMpIHNvIGlubGluZWQgdW5zYXZlZCBidWZmZXJzIChubyBVUkkpIHN0aWxsIGRlZHVwZS5cblx0XHRjb25zdCBleGlzdGluZ0tleXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IHYgb2YgcmVxdWVzdC52YXJpYWJsZXMudmFyaWFibGVzKSB7XG5cdFx0XHRjb25zdCBrZXkgPSB0aGlzLl9maWxlRW50cnlEZWR1cGVLZXkodiwgcmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKGtleSkge1xuXHRcdFx0XHRleGlzdGluZ0tleXMuYWRkKGtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIEJhY2tlbmRzIHRoYXQgcmVhZCBmaWxlcyBmcm9tIGRpc2sgY2FuJ3Qgc2VlIGFuIHVudGl0bGVkIGJ1ZmZlciwgc28gZG9uJ3QgZm9yd2FyZCBpdCBhcyBhXG5cdFx0Ly8gYnJva2VuIHBhdGggdW5sZXNzIHdlIGlubGluZSBpdHMgbGl2ZSB0ZXh0IGJlbG93LlxuXHRcdGNvbnN0IHNraXBVbnRpdGxlZCA9ICF0aGlzLl9iYWNrZW5kSW5saW5lc1Vuc2F2ZWRFZGl0b3JzKCk7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBpbXBsaWNpdENvbnRleHQudmFsdWVzKSB7XG5cdFx0XHRpZiAoZW50cnkudmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChlbnRyeS51cmk/LnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVCcm93c2VyKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNraXBVbnRpdGxlZCAmJiBlbnRyeS51cmk/LnNjaGVtZSA9PT0gU2NoZW1hcy51bnRpdGxlZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGtleSA9IHRoaXMuX2ZpbGVFbnRyeURlZHVwZUtleShlbnRyeSwgcmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKGtleSkge1xuXHRcdFx0XHRpZiAoZXhpc3RpbmdLZXlzLmhhcyhrZXkpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZXhpc3RpbmdLZXlzLmFkZChrZXkpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYXR0YWNobWVudCA9IHRoaXMuX2NvbnZlcnRWYXJpYWJsZVRvQXR0YWNobWVudChlbnRyeSwgcmVxdWVzdC5zZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3QubWVzc2FnZSk7XG5cdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkoYXR0YWNobWVudCkgJiYgYXR0YWNobWVudCkge1xuXHRcdFx0XHRhdHRhY2htZW50cy5wdXNoKGF0dGFjaG1lbnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKiBEZWR1cGUgaWRlbnRpdHkgZm9yIGEgZmlsZS9pbXBsaWNpdCBlbnRyeTogcmViYXNlZCBVUkksIHN1ZmZpeGVkIHdpdGggdGhlIHJhbmdlIGZvciBhIHNlbGVjdGlvbi4gKi9cblx0cHJpdmF0ZSBfZmlsZUVudHJ5RGVkdXBlS2V5KGVudHJ5OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LCBzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGVudHJ5LmtpbmQgIT09ICdmaWxlJyAmJiBlbnRyeS5raW5kICE9PSAnaW1wbGljaXQnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB2YWx1ZSA9IGVudHJ5LnZhbHVlO1xuXHRcdGNvbnN0IHVyaSA9IGlzTG9jYXRpb24odmFsdWUpID8gdmFsdWUudXJpIDogKHZhbHVlIGluc3RhbmNlb2YgVVJJID8gdmFsdWUgOiB1bmRlZmluZWQpO1xuXHRcdGlmICghdXJpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLl9lbnRyeVNlbGVjdGlvbihlbnRyeSk7XG5cdFx0cmV0dXJuIHRoaXMuX2F0dGFjaG1lbnREZWR1cGVLZXkodGhpcy5fcmViYXNlQXR0YWNobWVudFVyaSh1cmksIHNlc3Npb25SZXNvdXJjZSkudG9TdHJpbmcoKSwgc2VsZWN0aW9uKTtcblx0fVxuXG5cdC8qKiBUaGUgc2VsZWN0aW9uIHJhbmdlIGNhcnJpZWQgYnkgYSBmaWxlL2ltcGxpY2l0IGVudHJ5LCBvciBgdW5kZWZpbmVkYCBmb3Igd2hvbGUtZG9jdW1lbnQgcmVmZXJlbmNlcy4gKi9cblx0cHJpdmF0ZSBfZW50cnlTZWxlY3Rpb24oZW50cnk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkpOiBNZXNzYWdlRW1iZWRkZWRSZXNvdXJjZUF0dGFjaG1lbnRbJ3NlbGVjdGlvbiddIHtcblx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMuX2VudHJ5U2VsZWN0aW9uTG9jYXRpb24oZW50cnkpO1xuXHRcdHJldHVybiBsb2NhdGlvbiA/IHsgcmFuZ2U6IHRoaXMuX3RvVGV4dFJhbmdlKGxvY2F0aW9uLnJhbmdlKSB9IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqIERlZHVwZSBpZGVudGl0eTogdGhlIGJhcmUgVVJJIGZvciBhIHdob2xlIGRvY3VtZW50LCBzdWZmaXhlZCB3aXRoIHRoZSByYW5nZSBmb3IgYSBzZWxlY3Rpb24uICovXG5cdHByaXZhdGUgX2F0dGFjaG1lbnREZWR1cGVLZXkodXJpOiBzdHJpbmcsIHNlbGVjdGlvbj86IE1lc3NhZ2VSZXNvdXJjZUF0dGFjaG1lbnRbJ3NlbGVjdGlvbiddKTogc3RyaW5nIHtcblx0XHRpZiAoIXNlbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuIHVyaTtcblx0XHR9XG5cdFx0Y29uc3QgeyBzdGFydCwgZW5kIH0gPSBzZWxlY3Rpb24ucmFuZ2U7XG5cdFx0cmV0dXJuIGAke3VyaX0jJHtzdGFydC5saW5lfToke3N0YXJ0LmNoYXJhY3Rlcn0tJHtlbmQubGluZX06JHtlbmQuY2hhcmFjdGVyfWA7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGlzIGJhY2tlbmQgcmVhZHMgcmVmZXJlbmNlZCBmaWxlcyBmcm9tIGRpc2sgKHJhdGhlciB0aGFuIHNlZWluZyB0aGUgZWRpdG9yJ3Ncblx0ICogaW4tbWVtb3J5IGJ1ZmZlcikgYW5kIHRoZXJlZm9yZSBuZWVkcyB0aGUgbGl2ZSB0ZXh0IG9mIGFuIHVuc2F2ZWQgLyBkaXJ0eSBlZGl0b3IgaW5saW5lZCBhc1xuXHQgKiBhbiBlbWJlZGRlZCByZXNvdXJjZS4gQ29waWxvdCBDTEkgYW5kIENvZGV4IGJvdGggcnVuIGFzIHNlcGFyYXRlIHByb2Nlc3NlcyB3aXRoIG9ubHkgZGlza1xuXHQgKiBhY2Nlc3MsIHNvIGEgYEBwYXRoYCBtZW50aW9uIChvciBhbiBgdW50aXRsZWQ6YCBVUkkpIHdvdWxkIGdpdmUgdGhlbSBzdGFsZSBvciBtaXNzaW5nIGNvbnRlbnQuXG5cdCAqL1xuXHRwcml2YXRlIF9iYWNrZW5kSW5saW5lc1Vuc2F2ZWRFZGl0b3JzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWcucHJvdmlkZXIgPT09IFNlc3Npb25UeXBlLkNvcGlsb3RDTEkgfHwgdGhpcy5fY29uZmlnLnByb3ZpZGVyID09PSBDT0RFWF9BR0VOVF9QUk9WSURFUl9JRDtcblx0fVxuXG5cdC8qKiBBIHJlc291cmNlIGlzIHVuc2F2ZWQgd2hlbiBpdCdzIHVudGl0bGVkIG9yIGEgc2F2ZWQgZmlsZSB3aXRoIGluLW1lbW9yeSAoZGlydHkpIGNoYW5nZXMuICovXG5cdHByaXZhdGUgX2lzVW5zYXZlZFJlc291cmNlKHVyaTogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHVyaS5zY2hlbWUgPT09IFNjaGVtYXMudW50aXRsZWQgfHwgdGhpcy5fd29ya2luZ0NvcHlTZXJ2aWNlLmlzRGlydHkodXJpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbmxpbmUgdGhlIGxpdmUgKGluLW1lbW9yeSkgdGV4dCBvZiBhbiB1bnNhdmVkIGVkaXRvciBhcyBhbiBlbWJlZGRlZCByZXNvdXJjZSBzbyBhIHBhdGgtcmVhZGluZyBiYWNrZW5kIHN0aWxsXG5cdCAqIGdldHMgY3VycmVudCBjb250ZW50LCBwcmVzZXJ2aW5nIHRoZSBlbnRyeSdzIHNlbGVjdGlvbiwgcmFuZ2UgYW5kIGBfbWV0YWAuIFNlbGVjdGlvbiBlbnRyaWVzIGlubGluZSBvbmx5IHRoZVxuXHQgKiBzZWxlY3RlZCB0ZXh0OyB3aG9sZS1kb2N1bWVudCBlbnRyaWVzIGlubGluZSB0aGUgZnVsbCBidWZmZXIuIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiBubyBsb2FkZWQgdGV4dCBtb2RlbCBpc1xuXHQgKiBhdmFpbGFibGUgb3IgdGhlIGlubGluZWQgdGV4dCBleGNlZWRzIHtAbGluayBNQVhfSU5MSU5FRF9VTlNBVkVEX0VESVRPUl9CWVRFU30uXG5cdCAqL1xuXHRwcml2YXRlIF9idWlsZFVuc2F2ZWRFZGl0b3JBdHRhY2htZW50KHVyaTogVVJJLCB2OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LCByYW5nZTogTWVzc2FnZUF0dGFjaG1lbnRbJ3JhbmdlJ10pOiBNZXNzYWdlQXR0YWNobWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9tb2RlbFNlcnZpY2UuZ2V0TW9kZWwodXJpKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB0ZXh0ID0gdGhpcy5fZ2V0VW5zYXZlZEVkaXRvckF0dGFjaG1lbnRUZXh0KG1vZGVsLCB0aGlzLl9lbnRyeU1vZGVsU2VsZWN0aW9uUmFuZ2UodikpO1xuXHRcdGNvbnN0IGJ1ZmZlciA9IHRleHQgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IFZTQnVmZmVyLmZyb21TdHJpbmcodGV4dCk7XG5cdFx0aWYgKCFidWZmZXIgfHwgYnVmZmVyLmJ5dGVMZW5ndGggPiBNQVhfSU5MSU5FRF9VTlNBVkVEX0VESVRPUl9CWVRFUykge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50SG9zdF0gU2tpcHBpbmcgaW5saW5lIG9mIHVuc2F2ZWQgZWRpdG9yICR7dXJpLnRvU3RyaW5nKCl9OiBleGNlZWRzICR7TUFYX0lOTElORURfVU5TQVZFRF9FRElUT1JfQllURVN9IGJ5dGUgY2FwYCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLl9lbnRyeVNlbGVjdGlvbih2KTtcblx0XHRjb25zdCBhdHRhY2htZW50OiBNZXNzYWdlRW1iZWRkZWRSZXNvdXJjZUF0dGFjaG1lbnQgPSB7XG5cdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuRW1iZWRkZWRSZXNvdXJjZSxcblx0XHRcdGxhYmVsOiB2Lm5hbWUsXG5cdFx0XHRkaXNwbGF5S2luZDogc2VsZWN0aW9uID8gJ3NlbGVjdGlvbicgOiAnZG9jdW1lbnQnLFxuXHRcdFx0ZGF0YTogZW5jb2RlQmFzZTY0KGJ1ZmZlciksXG5cdFx0XHRjb250ZW50VHlwZTogJ3RleHQvcGxhaW4nLFxuXHRcdH07XG5cdFx0aWYgKHNlbGVjdGlvbikge1xuXHRcdFx0YXR0YWNobWVudC5zZWxlY3Rpb24gPSBzZWxlY3Rpb247XG5cdFx0fVxuXHRcdGlmIChyYW5nZSkge1xuXHRcdFx0YXR0YWNobWVudC5yYW5nZSA9IHJhbmdlO1xuXHRcdH1cblx0XHRpZiAodi5fbWV0YSkge1xuXHRcdFx0YXR0YWNobWVudC5fbWV0YSA9IHYuX21ldGE7XG5cdFx0fVxuXHRcdHJldHVybiBhdHRhY2htZW50O1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBpbmxpbmUgdGV4dCB0byBzZW5kIGZvciBhbiB1bnNhdmVkIGVkaXRvcjogdGhlIHNlbGVjdGVkIHRleHQgZm9yIGEgc2VsZWN0aW9uLCBlbHNlIHRoZSB3aG9sZSBidWZmZXIuIFVzZXMgdGhlXG5cdCAqIG1vZGVsIGxlbmd0aCBBUElzIHNvIGFuIG92ZXItY2FwIGJ1ZmZlciBpcyBza2lwcGVkIChyZXR1cm5zIGB1bmRlZmluZWRgKSB3aXRob3V0IGV2ZXIgYmVpbmcgbWF0ZXJpYWxpemVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2V0VW5zYXZlZEVkaXRvckF0dGFjaG1lbnRUZXh0KG1vZGVsOiBJVGV4dE1vZGVsLCByYW5nZTogSVJhbmdlIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAocmFuZ2UpIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IG1vZGVsLnZhbGlkYXRlUmFuZ2UocmFuZ2UpO1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uTGVuZ3RoID0gbW9kZWwuZ2V0VmFsdWVMZW5ndGhJblJhbmdlKHNlbGVjdGlvbik7XG5cdFx0XHRpZiAoc2VsZWN0aW9uTGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZXR1cm4gc2VsZWN0aW9uTGVuZ3RoID4gTUFYX0lOTElORURfVU5TQVZFRF9FRElUT1JfQllURVMgPyB1bmRlZmluZWQgOiBtb2RlbC5nZXRWYWx1ZUluUmFuZ2Uoc2VsZWN0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG1vZGVsLmdldFZhbHVlTGVuZ3RoKCkgPiBNQVhfSU5MSU5FRF9VTlNBVkVEX0VESVRPUl9CWVRFUyA/IHVuZGVmaW5lZCA6IG1vZGVsLmdldFZhbHVlKCk7XG5cdH1cblxuXHQvKiogVGhlIGVkaXRvciByYW5nZSBvZiBhIGZpbGUvaW1wbGljaXQgc2VsZWN0aW9uIGVudHJ5LCB1c2VkIHRvIHNsaWNlIHRoZSBsaXZlIG1vZGVsOyBgdW5kZWZpbmVkYCBvdGhlcndpc2UuICovXG5cdHByaXZhdGUgX2VudHJ5TW9kZWxTZWxlY3Rpb25SYW5nZShlbnRyeTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSk6IElSYW5nZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2VudHJ5U2VsZWN0aW9uTG9jYXRpb24oZW50cnkpPy5yYW5nZTtcblx0fVxuXG5cdC8qKiBUaGUge0BsaW5rIExvY2F0aW9ufSBvZiBhIGZpbGUvaW1wbGljaXQgZW50cnkgdGhhdCByZXByZXNlbnRzIGEgc2VsZWN0aW9uLCBvciBgdW5kZWZpbmVkYCBmb3Igd2hvbGUgZG9jdW1lbnRzLiAqL1xuXHRwcml2YXRlIF9lbnRyeVNlbGVjdGlvbkxvY2F0aW9uKGVudHJ5OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5KTogTG9jYXRpb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHZhbHVlID0gZW50cnkudmFsdWU7XG5cdFx0Y29uc3QgaXNTZWxlY3Rpb25FbnRyeSA9IChlbnRyeS5raW5kID09PSAnZmlsZScgfHwgKGVudHJ5LmtpbmQgPT09ICdpbXBsaWNpdCcgJiYgZW50cnkuaXNTZWxlY3Rpb24pKSAmJiBpc0xvY2F0aW9uKHZhbHVlKTtcblx0XHRyZXR1cm4gaXNTZWxlY3Rpb25FbnRyeSA/IHZhbHVlIGFzIExvY2F0aW9uIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfdmFyaWFibGVFbnRyaWVzVG9BdHRhY2htZW50cyh2YXJpYWJsZXM6IHJlYWRvbmx5IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSwgc2Vzc2lvblJlc291cmNlOiBVUkksIG1lc3NhZ2VUZXh0Pzogc3RyaW5nLCBtYXRlcmlhbGl6ZVBhc3RlcyA9IHRydWUpOiBNZXNzYWdlQXR0YWNobWVudFtdIHtcblx0XHRjb25zdCBhdHRhY2htZW50czogTWVzc2FnZUF0dGFjaG1lbnRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgdiBvZiB2YXJpYWJsZXMpIHtcblx0XHRcdGNvbnN0IGF0dGFjaG1lbnQgPSB0aGlzLl9jb252ZXJ0VmFyaWFibGVUb0F0dGFjaG1lbnQodiwgc2Vzc2lvblJlc291cmNlLCBtZXNzYWdlVGV4dCwgbWF0ZXJpYWxpemVQYXN0ZXMpO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoYXR0YWNobWVudCkpIHtcblx0XHRcdFx0YXR0YWNobWVudHMucHVzaCguLi5hdHRhY2htZW50KTtcblx0XHRcdH0gZWxzZSBpZiAoYXR0YWNobWVudCkge1xuXHRcdFx0XHRhdHRhY2htZW50cy5wdXNoKGF0dGFjaG1lbnQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoYXR0YWNobWVudHMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50SG9zdF0gQ29udmVydGVkICR7YXR0YWNobWVudHMubGVuZ3RofSBhdHRhY2htZW50cyBmcm9tICR7dmFyaWFibGVzLmxlbmd0aH0gZXhwbGljaXQgdmFyaWFibGVzYCk7XG5cdFx0fVxuXHRcdHJldHVybiBhdHRhY2htZW50cztcblx0fVxuXG5cdHByaXZhdGUgX2NvbnZlcnRWYXJpYWJsZVRvQXR0YWNobWVudCh2OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LCBzZXNzaW9uUmVzb3VyY2U6IFVSSSwgbWVzc2FnZVRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgbWF0ZXJpYWxpemVQYXN0ZXMgPSB0cnVlKTogTWVzc2FnZUF0dGFjaG1lbnQgfCBNZXNzYWdlQXR0YWNobWVudFtdIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZWZlcmVuY2VSYW5nZSA9IHRoaXMuX3RvQXR0YWNobWVudFJlZmVyZW5jZVJhbmdlKG1lc3NhZ2VUZXh0LCB2LnJhbmdlKTtcblx0XHQvLyBDb3BpbG90IENMSSBhbmQgQ29kZXggY2FuJ3QgcmVhZCB1bnNhdmVkIGNvbnRlbnQgZnJvbSBkaXNrLCBzbyBpbmxpbmUgdGhlIGxpdmUgYnVmZmVyOyBkcm9wIHVucmVhZGFibGUgc2NoZW1lcy5cblx0XHRpZiAoKHYua2luZCA9PT0gJ2ZpbGUnIHx8IHYua2luZCA9PT0gJ2ltcGxpY2l0JykgJiYgdGhpcy5fYmFja2VuZElubGluZXNVbnNhdmVkRWRpdG9ycygpKSB7XG5cdFx0XHRjb25zdCB1cmkgPSBpc0xvY2F0aW9uKHYudmFsdWUpID8gdi52YWx1ZS51cmkgOiAodi52YWx1ZSBpbnN0YW5jZW9mIFVSSSA/IHYudmFsdWUgOiB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKHVyaSAmJiB0aGlzLl9pc1Vuc2F2ZWRSZXNvdXJjZSh1cmkpKSB7XG5cdFx0XHRcdGNvbnN0IGVtYmVkZGVkID0gdGhpcy5fYnVpbGRVbnNhdmVkRWRpdG9yQXR0YWNobWVudCh1cmksIHYsIHJlZmVyZW5jZVJhbmdlKTtcblx0XHRcdFx0aWYgKGVtYmVkZGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGVtYmVkZGVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh1cmkuc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vIEZpbGUvaW1wbGljaXQ6IGEgc2VsZWN0aW9uIExvY2F0aW9uIFx1MjE5MiAnc2VsZWN0aW9uJzsgYSB3aG9sZSBkb2N1bWVudC9VUkkgXHUyMTkyICdkb2N1bWVudCcgKHJhbmdlIGRyb3BwZWQpLlxuXHRcdGlmICgodi5raW5kID09PSAnZmlsZScgfHwgKHYua2luZCA9PT0gJ2ltcGxpY2l0JyAmJiB2LmlzU2VsZWN0aW9uKSkgJiYgaXNMb2NhdGlvbih2LnZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3RvU2VsZWN0aW9uQXR0YWNobWVudCh2LnZhbHVlLCB2Lm5hbWUsICdzZWxlY3Rpb24nLCBzZXNzaW9uUmVzb3VyY2UsIHYuX21ldGEsIHJlZmVyZW5jZVJhbmdlKTtcblx0XHR9XG5cdFx0aWYgKHYua2luZCA9PT0gJ2ltcGxpY2l0JyAmJiBpc0xvY2F0aW9uKHYudmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdG9SZXNvdXJjZUF0dGFjaG1lbnQodi52YWx1ZS51cmksIHYubmFtZSwgJ2RvY3VtZW50Jywgc2Vzc2lvblJlc291cmNlLCB2Ll9tZXRhLCByZWZlcmVuY2VSYW5nZSk7XG5cdFx0fVxuXHRcdGlmICgodi5raW5kID09PSAnZmlsZScgfHwgdi5raW5kID09PSAnaW1wbGljaXQnKSAmJiB2LnZhbHVlIGluc3RhbmNlb2YgVVJJKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdG9SZXNvdXJjZUF0dGFjaG1lbnQodi52YWx1ZSwgdi5uYW1lLCAnZG9jdW1lbnQnLCBzZXNzaW9uUmVzb3VyY2UsIHYuX21ldGEsIHJlZmVyZW5jZVJhbmdlKTtcblx0XHR9XG5cdFx0aWYgKHYua2luZCA9PT0gJ2RpcmVjdG9yeScgJiYgdi52YWx1ZSBpbnN0YW5jZW9mIFVSSSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3RvUmVzb3VyY2VBdHRhY2htZW50KHYudmFsdWUsIHYubmFtZSwgJ2RpcmVjdG9yeScsIHNlc3Npb25SZXNvdXJjZSwgdi5fbWV0YSwgcmVmZXJlbmNlUmFuZ2UpO1xuXHRcdH1cblx0XHQvLyBTeW1ib2w6IGEgTG9jYXRpb24gd2l0aCBhICdzeW1ib2wnIGRpc3BsYXkgaGludC5cblx0XHRpZiAodi5raW5kID09PSAnc3ltYm9sJyAmJiBpc0xvY2F0aW9uKHYudmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdG9TZWxlY3Rpb25BdHRhY2htZW50KHYudmFsdWUsIHYubmFtZSwgJ3N5bWJvbCcsIHNlc3Npb25SZXNvdXJjZSwgdi5fbWV0YSwgcmVmZXJlbmNlUmFuZ2UpO1xuXHRcdH1cblx0XHQvLyBQcm9tcHQgZmlsZXMgKC5wcm9tcHQubWQpIFx1MjAxNCB0cmVhdGVkIGFzIGEgcmVmZXJlbmNlZCBkb2N1bWVudC5cblx0XHRpZiAodi5raW5kID09PSAncHJvbXB0RmlsZScgJiYgdi52YWx1ZSBpbnN0YW5jZW9mIFVSSSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3RvUmVzb3VyY2VBdHRhY2htZW50KHYudmFsdWUsIHYubmFtZSwgJ2RvY3VtZW50Jywgc2Vzc2lvblJlc291cmNlLCB2Ll9tZXRhLCByZWZlcmVuY2VSYW5nZSk7XG5cdFx0fVxuXHRcdC8vIEltYWdlOiBzZW5kIGlubGluZSBhcyBiYXNlNjQgd2hlbiB3ZSBoYXZlIHRoZSBieXRlczsgb3RoZXJ3aXNlIGZhbGxcblx0XHQvLyBiYWNrIHRvIGEgZmlsZSByZXNvdXJjZSByZWZlcmVuY2UuXG5cdFx0aWYgKGlzSW1hZ2VWYXJpYWJsZUVudHJ5KHYpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdG9JbWFnZUF0dGFjaG1lbnQodiwgc2Vzc2lvblJlc291cmNlLCByZWZlcmVuY2VSYW5nZSk7XG5cdFx0fVxuXHRcdGlmIChpc0FnZW50RmVlZGJhY2tWYXJpYWJsZUVudHJ5KHYpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdG9BZ2VudEZlZWRiYWNrQXR0YWNobWVudCh2KTtcblx0XHR9XG5cdFx0aWYgKHYua2luZCA9PT0gJ3Nlc3Npb25SZWZlcmVuY2UnICYmIHYudmFsdWUgaW5zdGFuY2VvZiBVUkkpIHtcblx0XHRcdGNvbnN0IHRyYWplY3RvcnlQYXRoID0gdGhpcy5fdG9TZXNzaW9uUmVmZXJlbmNlVHJhamVjdG9yeVBhdGgodi52YWx1ZSk7XG5cdFx0XHRpZiAoIXRyYWplY3RvcnlQYXRoKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5fdG9TZXNzaW9uUmVmZXJlbmNlQXR0YWNobWVudHModiwgdi52YWx1ZSwgdHJhamVjdG9yeVBhdGgsIHJlZmVyZW5jZVJhbmdlKTtcblx0XHR9XG5cdFx0Ly8gQnJvd3NlciB2aWV3cyBhcmUgbGl2ZSBwYWdlcyByYXRoZXIgdGhhbiBmaWxlc3lzdGVtIHJlc291cmNlcy4gUHJlc2VydmVcblx0XHQvLyB0aGUgcGFnZSBJRCBhcyBtb2RlbC1yZWFkYWJsZSBjb250ZXh0IHNvIHRoZSBhZ2VudCBjYW4gYWRkcmVzcyB0aGUgcGFnZVxuXHRcdC8vIHdpdGggYnJvd3NlciB0b29scyB3aXRob3V0IHRyeWluZyB0byByZWFkIHRoZSB2c2NvZGUtYnJvd3NlciBVUkkuXG5cdFx0aWYgKGlzQnJvd3NlclZpZXdWYXJpYWJsZUVudHJ5KHYpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdG9TaW1wbGVBdHRhY2htZW50KFxuXHRcdFx0XHR2Lm5hbWUsXG5cdFx0XHRcdHYubW9kZWxEZXNjcmlwdGlvbiA/PyBgQnJvd3NlciBwYWdlOiAke3YubmFtZX0uIFRoZSBwYWdlSWQgaXMgXCIke3YuYnJvd3NlcklkfVwiLmAsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHQuLi52Ll9tZXRhLFxuXHRcdFx0XHRcdFtCcm93c2VyVmlld0F0dGFjaG1lbnRNZXRhZGF0YUtleV06IHsgYnJvd3NlcklkOiB2LmJyb3dzZXJJZCwgYnJvd3NlclVyaTogdi52YWx1ZS50b1N0cmluZygpIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdEJyb3dzZXJWaWV3QXR0YWNobWVudERpc3BsYXlLaW5kLFxuXHRcdFx0XHRyZWZlcmVuY2VSYW5nZSxcblx0XHRcdCk7XG5cdFx0fVxuXHRcdGlmICh2LmtpbmQgPT09ICdlbGVtZW50Jykge1xuXHRcdFx0Y29uc3QgY29ycmVsYXRpb25JZCA9IGdldEVsZW1lbnRBdHRhY2htZW50Q29ycmVsYXRpb25JZCh2KSA/PyB2LmlkO1xuXHRcdFx0Y29uc3QgbWV0YWRhdGEgPSB7IC4uLnYuX21ldGEsIC4uLnRvRWxlbWVudEF0dGFjaG1lbnRNZXRhKGNvcnJlbGF0aW9uSWQpIH07XG5cdFx0XHRjb25zdCBlbGVtZW50QXR0YWNobWVudCA9IHRoaXMuX3RvU2ltcGxlQXR0YWNobWVudCh2Lm5hbWUsIHYudmFsdWUsIG1ldGFkYXRhLCBBZ2VudEhvc3RFbGVtZW50QXR0YWNobWVudERpc3BsYXlLaW5kLCByZWZlcmVuY2VSYW5nZSk7XG5cdFx0XHRjb25zdCBpbWFnZUF0dGFjaG1lbnQgPSB0aGlzLl90b0VsZW1lbnRJbWFnZUF0dGFjaG1lbnQodiwgc2Vzc2lvblJlc291cmNlLCBtZXRhZGF0YSk7XG5cdFx0XHRyZXR1cm4gaW1hZ2VBdHRhY2htZW50ID8gW2VsZW1lbnRBdHRhY2htZW50LCBpbWFnZUF0dGFjaG1lbnRdIDogZWxlbWVudEF0dGFjaG1lbnQ7XG5cdFx0fVxuXHRcdC8vIFBhc3RlZCB0ZXh0IGlzIG1hdGVyaWFsaXplZCBieSB0aGUgYWdlbnQgaG9zdCBzbyBsYXJnZSBwYXlsb2FkcyBzdGF5IG91dCBvZiBzeW5jaHJvbml6ZWQgc3RhdGUuXG5cdFx0aWYgKHYua2luZCA9PT0gJ3Bhc3RlJykge1xuXHRcdFx0cmV0dXJuIG1hdGVyaWFsaXplUGFzdGVzXG5cdFx0XHRcdD8gdGhpcy5fdG9FbWJlZGRlZFRleHRBdHRhY2htZW50KHYubmFtZSwgdi5jb2RlLCB2Ll9tZXRhLCByZWZlcmVuY2VSYW5nZSlcblx0XHRcdFx0OiB0aGlzLl90b1NpbXBsZUF0dGFjaG1lbnQodi5uYW1lLCB2LmNvZGUsIHYuX21ldGEsIHVuZGVmaW5lZCwgcmVmZXJlbmNlUmFuZ2UpO1xuXHRcdH1cblx0XHRpZiAodi5raW5kID09PSAncHJvbXB0VGV4dCcpIHtcblx0XHRcdHJldHVybiB0aGlzLl90b1NpbXBsZUF0dGFjaG1lbnQodi5uYW1lLCB2LnZhbHVlLCB2Ll9tZXRhLCB1bmRlZmluZWQsIHJlZmVyZW5jZVJhbmdlKTtcblx0XHR9XG5cdFx0aWYgKHYua2luZCA9PT0gJ3dvcmtzcGFjZScpIHtcblx0XHRcdHJldHVybiB0aGlzLl90b1NpbXBsZUF0dGFjaG1lbnQodi5uYW1lLCB2LnZhbHVlLCB2Ll9tZXRhLCAnd29ya3NwYWNlJywgcmVmZXJlbmNlUmFuZ2UpO1xuXHRcdH1cblx0XHRpZiAoaXNDaGF0VHJhbnNjcmlwdENvbnRleHRWYXJpYWJsZUVudHJ5KHYpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdG9TaW1wbGVBdHRhY2htZW50KHYubmFtZSwgdi52YWx1ZSwgdG9DaGF0VHJhbnNjcmlwdENvbnRleHRBdHRhY2htZW50TWV0YSh2KSwgQ2hhdFRyYW5zY3JpcHRDb250ZXh0QXR0YWNobWVudERpc3BsYXlLaW5kLCByZWZlcmVuY2VSYW5nZSk7XG5cdFx0fVxuXHRcdGlmICh2LmtpbmQgPT09ICdzdHJpbmcnICYmIHR5cGVvZiB2LnZhbHVlID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3RvU2ltcGxlQXR0YWNobWVudCh2Lm5hbWUsIHYudmFsdWUsIHYuX21ldGEsIHVuZGVmaW5lZCwgcmVmZXJlbmNlUmFuZ2UpO1xuXHRcdH1cblx0XHRjb25zdCBhZ2VudEhvc3RDb21wbGV0aW9uS2luZCA9IGdldEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kKHYpO1xuXHRcdGlmIChhZ2VudEhvc3RDb21wbGV0aW9uS2luZCA9PT0gQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQuQ29tbWFuZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3RvU2ltcGxlQXR0YWNobWVudCh2Lm5hbWUsIHVuZGVmaW5lZCwgdi5fbWV0YSwgJ2NvbW1hbmQnLCByZWZlcmVuY2VSYW5nZSk7XG5cdFx0fVxuXHRcdGlmIChhZ2VudEhvc3RDb21wbGV0aW9uS2luZCA9PT0gQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQuU2tpbGwpIHtcblx0XHRcdHJldHVybiB0aGlzLl90b1NpbXBsZUF0dGFjaG1lbnQodi5uYW1lLCB1bmRlZmluZWQsIHYuX21ldGEsICdza2lsbCcsIHJlZmVyZW5jZVJhbmdlKTtcblx0XHR9XG5cdFx0aWYgKGlzQ2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnkodikpIHtcblx0XHRcdHJldHVybiB0aGlzLl90b0NoYXRSZWZlcmVuY2VBdHRhY2htZW50KHYsIHJlZmVyZW5jZVJhbmdlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3RvQ2hhdFJlZmVyZW5jZUF0dGFjaG1lbnQodjogSUNoYXRSZXF1ZXN0Q2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnksIHJhbmdlPzogTWVzc2FnZUF0dGFjaG1lbnRbJ3JhbmdlJ10pOiBNZXNzYWdlQXR0YWNobWVudCB7XG5cdFx0Y29uc3QgYXR0YWNobWVudDogTWVzc2FnZUNoYXRBdHRhY2htZW50ID0ge1xuXHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkNoYXQsXG5cdFx0XHRyZXNvdXJjZTogdi52YWx1ZS50b1N0cmluZygpLFxuXHRcdFx0bGFiZWw6IHYubmFtZSxcblx0XHR9O1xuXHRcdGlmICh2LmVuZFR1cm4gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0YXR0YWNobWVudC5lbmRUdXJuID0gdi5lbmRUdXJuO1xuXHRcdH1cblx0XHRpZiAocmFuZ2UpIHtcblx0XHRcdGF0dGFjaG1lbnQucmFuZ2UgPSByYW5nZTtcblx0XHR9XG5cdFx0aWYgKHYuX21ldGEpIHtcblx0XHRcdGF0dGFjaG1lbnQuX21ldGEgPSB2Ll9tZXRhO1xuXHRcdH1cblx0XHRyZXR1cm4gYXR0YWNobWVudDtcblx0fVxuXG5cdHByaXZhdGUgX3RvRWxlbWVudEltYWdlQXR0YWNobWVudCh2OiBJRWxlbWVudFZhcmlhYmxlRW50cnksIHNlc3Npb25SZXNvdXJjZTogVVJJLCBtZXRhZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBNZXNzYWdlQXR0YWNobWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHYuaW1hZ2VEYXRhIGluc3RhbmNlb2YgVWludDhBcnJheSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkVtYmVkZGVkUmVzb3VyY2UsXG5cdFx0XHRcdGxhYmVsOiBgJHt2Lm5hbWV9IHNjcmVlbnNob3RgLFxuXHRcdFx0XHRkaXNwbGF5S2luZDogJ2ltYWdlJyxcblx0XHRcdFx0ZGF0YTogZW5jb2RlQmFzZTY0KFZTQnVmZmVyLndyYXAodi5pbWFnZURhdGEpKSxcblx0XHRcdFx0Y29udGVudFR5cGU6IHYuaW1hZ2VNaW1lVHlwZSA/PyAnaW1hZ2UvcG5nJyxcblx0XHRcdFx0X21ldGE6IG1ldGFkYXRhLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0aWYgKFVSSS5pc1VyaSh2LmltYWdlRGF0YSkpIHtcblx0XHRcdHJldHVybiB0aGlzLl90b1Jlc291cmNlQXR0YWNobWVudCh2LmltYWdlRGF0YSwgYCR7di5uYW1lfSBzY3JlZW5zaG90YCwgJ2ltYWdlJywgc2Vzc2lvblJlc291cmNlLCBtZXRhZGF0YSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF90b1Nlc3Npb25SZWZlcmVuY2VBdHRhY2htZW50KHY6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIHNlc3Npb25SZXNvdXJjZTogVVJJLCB0cmFqZWN0b3J5UGF0aDogc3RyaW5nLCByYW5nZT86IE1lc3NhZ2VBdHRhY2htZW50WydyYW5nZSddKTogTWVzc2FnZUF0dGFjaG1lbnQge1xuXHRcdHJldHVybiB0aGlzLl90b1NpbXBsZUF0dGFjaG1lbnQoXG5cdFx0XHR2Lm5hbWUsXG5cdFx0XHR0b1Nlc3Npb25SZWZlcmVuY2VNb2RlbFJlcHJlc2VudGF0aW9uKHYubmFtZSwgc2Vzc2lvblJlc291cmNlLCB0cmFqZWN0b3J5UGF0aCksXG5cdFx0XHR7IC4uLih2Ll9tZXRhID8/IHt9KSwgLi4udG9TZXNzaW9uUmVmZXJlbmNlQXR0YWNobWVudE1ldGEoc2Vzc2lvblJlc291cmNlKSB9LFxuXHRcdFx0QWdlbnRIb3N0U2Vzc2lvblJlZmVyZW5jZUF0dGFjaG1lbnREaXNwbGF5S2luZCxcblx0XHRcdHJhbmdlXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX3RvU2Vzc2lvblJlZmVyZW5jZUF0dGFjaG1lbnRzKHY6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIHNlc3Npb25SZXNvdXJjZTogVVJJLCB0cmFqZWN0b3J5UGF0aDogc3RyaW5nLCByYW5nZT86IE1lc3NhZ2VBdHRhY2htZW50WydyYW5nZSddKTogTWVzc2FnZUF0dGFjaG1lbnRbXSB7XG5cdFx0cmV0dXJuIFtcblx0XHRcdHRoaXMuX3RvU2Vzc2lvblJlZmVyZW5jZUF0dGFjaG1lbnQodiwgc2Vzc2lvblJlc291cmNlLCB0cmFqZWN0b3J5UGF0aCwgcmFuZ2UpLFxuXHRcdFx0dGhpcy5fdG9TZXNzaW9uUmVmZXJlbmNlVHJhamVjdG9yeUF0dGFjaG1lbnQodiwgc2Vzc2lvblJlc291cmNlLCB0cmFqZWN0b3J5UGF0aCksXG5cdFx0XTtcblx0fVxuXG5cdHByaXZhdGUgX3RvU2Vzc2lvblJlZmVyZW5jZVRyYWplY3RvcnlBdHRhY2htZW50KHY6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIHNlc3Npb25SZXNvdXJjZTogVVJJLCB0cmFqZWN0b3J5UGF0aDogc3RyaW5nKTogTWVzc2FnZUF0dGFjaG1lbnQge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UsXG5cdFx0XHR1cmk6IFVSSS5maWxlKHRyYWplY3RvcnlQYXRoKS50b1N0cmluZygpLFxuXHRcdFx0bGFiZWw6IGAke3YubmFtZX0gdHJhamVjdG9yeWAsXG5cdFx0XHRkaXNwbGF5S2luZDogQWdlbnRIb3N0U2Vzc2lvblJlZmVyZW5jZVRyYWplY3RvcnlBdHRhY2htZW50RGlzcGxheUtpbmQsXG5cdFx0XHRfbWV0YTogeyAuLi4odi5fbWV0YSA/PyB7fSksIC4uLnRvU2Vzc2lvblJlZmVyZW5jZUF0dGFjaG1lbnRNZXRhKHNlc3Npb25SZXNvdXJjZSkgfSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9TZXNzaW9uUmVmZXJlbmNlVHJhamVjdG9yeVBhdGgoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdC8vIFRPRE86IFN1cHBvcnQgbm9uLUNvcGlsb3QtQ0xJIHNlc3Npb24gcmVmZXJlbmNlcyB0aHJvdWdoIElDaGF0TW9kZWwgb3IgYSBmaXJzdC1jbGFzcyBBSFAgYXR0YWNobWVudCBwYXRoLlxuXHRcdC8vIFRPRE86IFN1cHBvcnQgZnVsbCBFSC10by1BSCBzZXNzaW9uIHBvcnRpbmcgZm9yIGNvbnRpbnVlL3Jlc3VtZSBmbG93cy5cblx0XHRyZXR1cm4gYnVpbGRIb3N0TG9jYWxFdmVudHNQYXRoKFxuXHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0dGhpcy5fcGF0aFNlcnZpY2UudXNlckhvbWUoeyBwcmVmZXJMb2NhbDogdHJ1ZSB9KSxcblx0XHRcdGF1dGhvcml0eSA9PiB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbm5lY3Rpb25zLmZpbmQoY29ubmVjdGlvbiA9PiBhZ2VudEhvc3RBdXRob3JpdHkoY29ubmVjdGlvbi5hZGRyZXNzKSA9PT0gYXV0aG9yaXR5KSxcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9SZXNvdXJjZUF0dGFjaG1lbnQodXJpOiBVUkksIGxhYmVsOiBzdHJpbmcsIGRpc3BsYXlLaW5kOiBzdHJpbmcsIHNlc3Npb25SZXNvdXJjZTogVVJJLCBfbWV0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQsIHJhbmdlPzogTWVzc2FnZUF0dGFjaG1lbnRbJ3JhbmdlJ10pOiBNZXNzYWdlQXR0YWNobWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYXR0YWNobWVudFVyaSA9IHRoaXMuX3JlYmFzZUF0dGFjaG1lbnRVcmkodXJpLCBzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IGF0dGFjaG1lbnQ6IE1lc3NhZ2VBdHRhY2htZW50ID0geyB0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UsIHVyaTogYXR0YWNobWVudFVyaS50b1N0cmluZygpLCBsYWJlbCwgZGlzcGxheUtpbmQgfTtcblx0XHRpZiAocmFuZ2UpIHtcblx0XHRcdGF0dGFjaG1lbnQucmFuZ2UgPSByYW5nZTtcblx0XHR9XG5cdFx0aWYgKF9tZXRhKSB7XG5cdFx0XHRhdHRhY2htZW50Ll9tZXRhID0gX21ldGE7XG5cdFx0fVxuXHRcdHJldHVybiBhdHRhY2htZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9TZWxlY3Rpb25BdHRhY2htZW50KGxvY2F0aW9uOiBMb2NhdGlvbiwgbGFiZWw6IHN0cmluZywgZGlzcGxheUtpbmQ6IHN0cmluZywgc2Vzc2lvblJlc291cmNlOiBVUkksIF9tZXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCwgcmFuZ2U/OiBNZXNzYWdlQXR0YWNobWVudFsncmFuZ2UnXSk6IE1lc3NhZ2VBdHRhY2htZW50IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhdHRhY2htZW50VXJpID0gdGhpcy5fcmViYXNlQXR0YWNobWVudFVyaShsb2NhdGlvbi51cmksIHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgYXR0YWNobWVudDogTWVzc2FnZUF0dGFjaG1lbnQgPSB7XG5cdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UsXG5cdFx0XHR1cmk6IGF0dGFjaG1lbnRVcmkudG9TdHJpbmcoKSxcblx0XHRcdGxhYmVsLFxuXHRcdFx0ZGlzcGxheUtpbmQsXG5cdFx0XHRzZWxlY3Rpb246IHsgcmFuZ2U6IHRoaXMuX3RvVGV4dFJhbmdlKGxvY2F0aW9uLnJhbmdlKSB9LFxuXHRcdH07XG5cdFx0aWYgKHJhbmdlKSB7XG5cdFx0XHRhdHRhY2htZW50LnJhbmdlID0gcmFuZ2U7XG5cdFx0fVxuXHRcdGlmIChfbWV0YSkge1xuXHRcdFx0YXR0YWNobWVudC5fbWV0YSA9IF9tZXRhO1xuXHRcdH1cblx0XHRyZXR1cm4gYXR0YWNobWVudDtcblx0fVxuXG5cdHByaXZhdGUgX3RvSW1hZ2VBdHRhY2htZW50KHY6IElJbWFnZVZhcmlhYmxlRW50cnksIHNlc3Npb25SZXNvdXJjZTogVVJJLCByYW5nZT86IE1lc3NhZ2VBdHRhY2htZW50WydyYW5nZSddKTogTWVzc2FnZUF0dGFjaG1lbnQgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGJ1ZmZlciA9IGNvZXJjZUltYWdlQnVmZmVyKHYudmFsdWUpO1xuXHRcdGNvbnN0IGNvbnRlbnRUeXBlID0gdi5taW1lVHlwZSA/PyAnaW1hZ2UvcG5nJztcblx0XHRpZiAoYnVmZmVyKSB7XG5cdFx0XHRjb25zdCBhdHRhY2htZW50OiBNZXNzYWdlQXR0YWNobWVudCA9IHtcblx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkVtYmVkZGVkUmVzb3VyY2UsXG5cdFx0XHRcdGxhYmVsOiB2Lm5hbWUsXG5cdFx0XHRcdGRpc3BsYXlLaW5kOiAnaW1hZ2UnLFxuXHRcdFx0XHRkYXRhOiBlbmNvZGVCYXNlNjQoVlNCdWZmZXIud3JhcChidWZmZXIpKSxcblx0XHRcdFx0Y29udGVudFR5cGUsXG5cdFx0XHR9O1xuXHRcdFx0aWYgKHJhbmdlKSB7XG5cdFx0XHRcdGF0dGFjaG1lbnQucmFuZ2UgPSByYW5nZTtcblx0XHRcdH1cblx0XHRcdGlmICh2Ll9tZXRhKSB7XG5cdFx0XHRcdGF0dGFjaG1lbnQuX21ldGEgPSB2Ll9tZXRhO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGF0dGFjaG1lbnQ7XG5cdFx0fVxuXHRcdC8vIE5vIGlubGluZSBieXRlcyBcdTIwMTQgZmFsbCBiYWNrIHRvIGEgZmlsZSByZWZlcmVuY2UgaWYgb25lIGlzIGF2YWlsYWJsZS5cblx0XHRjb25zdCByZWZVcmkgPSB2LnJlZmVyZW5jZXM/LmZpbmQociA9PiBVUkkuaXNVcmkoci5yZWZlcmVuY2UpKT8ucmVmZXJlbmNlO1xuXHRcdGlmIChVUkkuaXNVcmkocmVmVXJpKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3RvUmVzb3VyY2VBdHRhY2htZW50KHJlZlVyaSwgdi5uYW1lLCAnaW1hZ2UnLCBzZXNzaW9uUmVzb3VyY2UsIHYuX21ldGEsIHJhbmdlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3RvQWdlbnRGZWVkYmFja0F0dGFjaG1lbnQodjogSUFnZW50RmVlZGJhY2tWYXJpYWJsZUVudHJ5KTogTWVzc2FnZUF0dGFjaG1lbnQgfCBNZXNzYWdlQXR0YWNobWVudFtdIHtcblx0XHQvLyBBZ2VudC1ob3N0IHNlc3Npb25zIGJhY2sgdGhlaXIgZmVlZGJhY2sgd2l0aCBhbm5vdGF0aW9ucyBvbiB0aGVcblx0XHQvLyBzZXNzaW9uJ3MgYW5ub3RhdGlvbnMgY2hhbm5lbC4gRW1pdCBvbmUgTWVzc2FnZUFubm90YXRpb25zQXR0YWNobWVudFxuXHRcdC8vIHBlciBjb21tZW50LCByZWZlcmVuY2luZyB0aGUgc3BlY2lmaWMgYW5ub3RhdGlvbiBpZCwgc28gdGhlIGFnZW50IGNhblxuXHRcdC8vIHJlYWQgdGhlbSB2aWEgdGhlIGBsaXN0Q29tbWVudHNgIHRvb2wgYW5kIGFjdCBvbiBleGFjdGx5IHRoZXNlXG5cdFx0Ly8gY29tbWVudHMuIEVhY2ggaXRlbSBpZCBpcyB0aGUgYW5ub3RhdGlvbiBpZC5cblx0XHRjb25zdCBhbm5vdGF0aW9uc1Jlc291cmNlID0gdi5hbm5vdGF0aW9uc1Jlc291cmNlPy50b1N0cmluZygpO1xuXHRcdGlmIChhbm5vdGF0aW9uc1Jlc291cmNlICYmIHYuZmVlZGJhY2tJdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gdi5mZWVkYmFja0l0ZW1zLm1hcCgoaXRlbSk6IE1lc3NhZ2VBbm5vdGF0aW9uc0F0dGFjaG1lbnQgPT4ge1xuXHRcdFx0XHRjb25zdCBpdGVtTWV0YSA9IHtcblx0XHRcdFx0XHRpZDogaXRlbS5pZCxcblx0XHRcdFx0XHR0ZXh0OiBpdGVtLnRleHQsXG5cdFx0XHRcdFx0cmVzb3VyY2VVcmk6IGl0ZW0ucmVzb3VyY2VVcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRyYW5nZTogdGhpcy5fdG9UZXh0UmFuZ2UoaXRlbS5yYW5nZSksXG5cdFx0XHRcdFx0Li4uKGl0ZW0ucmVwbGllcz8ubGVuZ3RoID8geyByZXBsaWVzOiBbLi4uaXRlbS5yZXBsaWVzXSB9IDoge30pLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5Bbm5vdGF0aW9ucyxcblx0XHRcdFx0XHRsYWJlbDogdi5uYW1lLFxuXHRcdFx0XHRcdGRpc3BsYXlLaW5kOiBBZ2VudEZlZWRiYWNrQXR0YWNobWVudERpc3BsYXlLaW5kLFxuXHRcdFx0XHRcdHJlc291cmNlOiBhbm5vdGF0aW9uc1Jlc291cmNlLFxuXHRcdFx0XHRcdGFubm90YXRpb25JZHM6IFtpdGVtLmlkXSxcblx0XHRcdFx0XHRfbWV0YToge1xuXHRcdFx0XHRcdFx0Li4uKHYuX21ldGEgPz8ge30pLFxuXHRcdFx0XHRcdFx0W0FnZW50RmVlZGJhY2tBdHRhY2htZW50TWV0YWRhdGFLZXldOiB7XG5cdFx0XHRcdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogdi5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdFx0ZmVlZGJhY2tJdGVtczogW2l0ZW1NZXRhXSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIEZhbGxiYWNrOiBubyBhbm5vdGF0aW9ucyBjaGFubmVsIHJlc29sdmVkIFx1MjAxNCBzZW5kIHRoZSBmZWVkYmFjayBpbmxpbmVcblx0XHQvLyBhcyBhIHNpbmdsZSBzaW1wbGUgYXR0YWNobWVudCBjYXJyeWluZyB0aGUgbW9kZWwgcmVwcmVzZW50YXRpb24uXG5cdFx0Y29uc3QgZmVlZGJhY2tJdGVtcyA9IHYuZmVlZGJhY2tJdGVtcy5tYXAoaXRlbSA9PiAoe1xuXHRcdFx0aWQ6IGl0ZW0uaWQsXG5cdFx0XHR0ZXh0OiBpdGVtLnRleHQsXG5cdFx0XHRyZXNvdXJjZVVyaTogaXRlbS5yZXNvdXJjZVVyaS50b1N0cmluZygpLFxuXHRcdFx0cmFuZ2U6IHRoaXMuX3RvVGV4dFJhbmdlKGl0ZW0ucmFuZ2UpLFxuXHRcdFx0Li4uKGl0ZW0ucmVwbGllcz8ubGVuZ3RoID8geyByZXBsaWVzOiBbLi4uaXRlbS5yZXBsaWVzXSB9IDoge30pLFxuXHRcdH0pKTtcblx0XHRyZXR1cm4gdGhpcy5fdG9TaW1wbGVBdHRhY2htZW50KFxuXHRcdFx0di5uYW1lLFxuXHRcdFx0dHlwZW9mIHYudmFsdWUgPT09ICdzdHJpbmcnID8gdi52YWx1ZSA6IHVuZGVmaW5lZCxcblx0XHRcdHtcblx0XHRcdFx0Li4uKHYuX21ldGEgPz8ge30pLFxuXHRcdFx0XHRbQWdlbnRGZWVkYmFja0F0dGFjaG1lbnRNZXRhZGF0YUtleV06IHtcblx0XHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHYuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0ZmVlZGJhY2tJdGVtcyxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRBZ2VudEZlZWRiYWNrQXR0YWNobWVudERpc3BsYXlLaW5kLFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF90b1NpbXBsZUF0dGFjaG1lbnQobGFiZWw6IHN0cmluZywgbW9kZWxSZXByZXNlbnRhdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLCBfbWV0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQsIGRpc3BsYXlLaW5kPzogc3RyaW5nLCByYW5nZT86IE1lc3NhZ2VBdHRhY2htZW50WydyYW5nZSddKTogTWVzc2FnZUF0dGFjaG1lbnQge1xuXHRcdGNvbnN0IGF0dGFjaG1lbnQ6IE1lc3NhZ2VBdHRhY2htZW50ID0geyB0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlLCBsYWJlbCB9O1xuXHRcdGlmIChtb2RlbFJlcHJlc2VudGF0aW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGF0dGFjaG1lbnQubW9kZWxSZXByZXNlbnRhdGlvbiA9IG1vZGVsUmVwcmVzZW50YXRpb247XG5cdFx0fVxuXHRcdGlmIChyYW5nZSkge1xuXHRcdFx0YXR0YWNobWVudC5yYW5nZSA9IHJhbmdlO1xuXHRcdH1cblx0XHRpZiAoZGlzcGxheUtpbmQpIHtcblx0XHRcdGF0dGFjaG1lbnQuZGlzcGxheUtpbmQgPSBkaXNwbGF5S2luZDtcblx0XHR9XG5cdFx0aWYgKF9tZXRhKSB7XG5cdFx0XHRhdHRhY2htZW50Ll9tZXRhID0gX21ldGE7XG5cdFx0fVxuXHRcdHJldHVybiBhdHRhY2htZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9FbWJlZGRlZFRleHRBdHRhY2htZW50KGxhYmVsOiBzdHJpbmcsIHRleHQ6IHN0cmluZywgX21ldGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkLCByYW5nZT86IE1lc3NhZ2VBdHRhY2htZW50WydyYW5nZSddKTogTWVzc2FnZUVtYmVkZGVkUmVzb3VyY2VBdHRhY2htZW50IHtcblx0XHRjb25zdCBhdHRhY2htZW50OiBNZXNzYWdlRW1iZWRkZWRSZXNvdXJjZUF0dGFjaG1lbnQgPSB7XG5cdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuRW1iZWRkZWRSZXNvdXJjZSxcblx0XHRcdGxhYmVsLFxuXHRcdFx0ZGF0YTogZW5jb2RlQmFzZTY0KFZTQnVmZmVyLmZyb21TdHJpbmcodGV4dCkpLFxuXHRcdFx0Y29udGVudFR5cGU6ICd0ZXh0L3BsYWluJyxcblx0XHR9O1xuXHRcdGlmIChyYW5nZSkge1xuXHRcdFx0YXR0YWNobWVudC5yYW5nZSA9IHJhbmdlO1xuXHRcdH1cblx0XHRpZiAoX21ldGEpIHtcblx0XHRcdGF0dGFjaG1lbnQuX21ldGEgPSBfbWV0YTtcblx0XHR9XG5cdFx0cmV0dXJuIGF0dGFjaG1lbnQ7XG5cdH1cblxuXHRwcml2YXRlIF90b0F0dGFjaG1lbnRSZWZlcmVuY2VSYW5nZShtZXNzYWdlVGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkLCByYW5nZTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVsncmFuZ2UnXSk6IE1lc3NhZ2VBdHRhY2htZW50WydyYW5nZSddIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIW1lc3NhZ2VUZXh0IHx8ICFyYW5nZSB8fCByYW5nZS5zdGFydCA8IDAgfHwgcmFuZ2UuZW5kRXhjbHVzaXZlID4gbWVzc2FnZVRleHQubGVuZ3RoIHx8IHJhbmdlLnN0YXJ0ID4gcmFuZ2UuZW5kRXhjbHVzaXZlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzdGFydCA9IG9mZnNldFRvUG9zaXRpb24obWVzc2FnZVRleHQsIHJhbmdlLnN0YXJ0KTtcblx0XHRjb25zdCBlbmQgPSBvZmZzZXRUb1Bvc2l0aW9uKG1lc3NhZ2VUZXh0LCByYW5nZS5lbmRFeGNsdXNpdmUpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRzdGFydDogeyBsaW5lOiBzdGFydC5saW5lTnVtYmVyIC0gMSwgY2hhcmFjdGVyOiBzdGFydC5jb2x1bW4gLSAxIH0sXG5cdFx0XHRlbmQ6IHsgbGluZTogZW5kLmxpbmVOdW1iZXIgLSAxLCBjaGFyYWN0ZXI6IGVuZC5jb2x1bW4gLSAxIH0sXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3RvVGV4dFJhbmdlKHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogbnVtYmVyOyBzdGFydENvbHVtbjogbnVtYmVyOyBlbmRMaW5lTnVtYmVyOiBudW1iZXI7IGVuZENvbHVtbjogbnVtYmVyIH0pIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0c3RhcnQ6IHsgbGluZTogcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gMSwgY2hhcmFjdGVyOiByYW5nZS5zdGFydENvbHVtbiAtIDEgfSxcblx0XHRcdGVuZDogeyBsaW5lOiByYW5nZS5lbmRMaW5lTnVtYmVyIC0gMSwgY2hhcmFjdGVyOiByYW5nZS5lbmRDb2x1bW4gLSAxIH0sXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWJhc2UgYSBgZmlsZTpgLXNjaGVtZSBhdHRhY2htZW50IFVSSSBmcm9tIHRoZSBzZXNzaW9uJ3MgcmVxdWVzdGVkXG5cdCAqIHdvcmtpbmcgZGlyZWN0b3J5IG9udG8gdGhlIHNlcnZlci1yZXNvbHZlZCB3b3JraW5nIGRpcmVjdG9yeS4gVGhpc1xuXHQgKiBtYXR0ZXJzIG9uIHRoZSBmaXJzdCB0dXJuIG9mIGEgd29ya3RyZWUtaXNvbGF0ZWQgc2Vzc2lvbiwgd2hlcmUgdGhlXG5cdCAqIHByb3ZpZGVyIGNyZWF0ZXMgYSB3b3JrdHJlZSB1bmRlciBhIGRpZmZlcmVudCBwYXRoIHRoYW4gdGhlIHdvcmtzcGFjZVxuXHQgKiBmb2xkZXIgdGhlIHdvcmtiZW5jaCBhdHRhY2hlZCB0aGUgZmlsZSBmcm9tLiBSZXR1cm5zIHRoZSBVUkkgdW5jaGFuZ2VkXG5cdCAqIGlmIHRoZSByZXF1ZXN0ZWQgYW5kIHJlc29sdmVkIGRpcmVjdG9yaWVzIG1hdGNoLCB0aGUgVVJJIGlzIG5vdCB1bmRlclxuXHQgKiB0aGUgcmVxdWVzdGVkIGRpcmVjdG9yeSwgb3IgZWl0aGVyIHNpZGUgaXMgdW5hdmFpbGFibGUuXG5cdCAqL1xuXHRwcml2YXRlIF9yZWJhc2VBdHRhY2htZW50VXJpKHVyaTogVVJJLCBzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFVSSSB7XG5cdFx0Y29uc3QgcmVxdWVzdGVkRGlyZWN0b3JpZXMgPSB0aGlzLl9yZXNvbHZlUmVxdWVzdGVkV29ya2luZ0RpcmVjdG9yaWVzKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgcmVxdWVzdGVkRGlyID0gcmVxdWVzdGVkRGlyZWN0b3JpZXM/LlswXTtcblx0XHRpZiAoIXJlcXVlc3RlZERpciB8fCByZXF1ZXN0ZWREaXIuc2NoZW1lICE9PSAnZmlsZScpIHtcblx0XHRcdHJldHVybiB1cmk7XG5cdFx0fVxuXHRcdGNvbnN0IG93bmluZ1JlcXVlc3RlZERpcmVjdG9yeSA9IGZpbmREZWVwZXN0Q29udGFpbmluZ1dvcmtpbmdEaXJlY3RvcnkodXJpLCByZXF1ZXN0ZWREaXJlY3Rvcmllcyk7XG5cdFx0aWYgKCFvd25pbmdSZXF1ZXN0ZWREaXJlY3RvcnkgfHwgIWV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWwob3duaW5nUmVxdWVzdGVkRGlyZWN0b3J5LCByZXF1ZXN0ZWREaXIpKSB7XG5cdFx0XHRyZXR1cm4gdXJpO1xuXHRcdH1cblx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IHRoaXMuX3Jlc29sdmVTZXNzaW9uVXJpKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgcmF3UmVzb2x2ZWREaXIgPSB0aGlzLl9nZXRTZXNzaW9uU3RhdGUoYmFja2VuZFNlc3Npb24udG9TdHJpbmcoKSk/LndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdO1xuXHRcdGNvbnN0IHJlc29sdmVkRGlyID0gdHlwZW9mIHJhd1Jlc29sdmVkRGlyID09PSAnc3RyaW5nJyA/IFVSSS5wYXJzZShyYXdSZXNvbHZlZERpcikgOiByYXdSZXNvbHZlZERpcjtcblx0XHRpZiAoIXJlc29sdmVkRGlyIHx8IHJlc29sdmVkRGlyLnNjaGVtZSAhPT0gJ2ZpbGUnKSB7XG5cdFx0XHRyZXR1cm4gdXJpO1xuXHRcdH1cblx0XHRpZiAoZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbChyZXF1ZXN0ZWREaXIsIHJlc29sdmVkRGlyKSkge1xuXHRcdFx0cmV0dXJuIHVyaTtcblx0XHR9XG5cdFx0Y29uc3QgcmVsID0gZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UucmVsYXRpdmVQYXRoKHJlcXVlc3RlZERpciwgdXJpKTtcblx0XHRpZiAocmVsID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1cmk7XG5cdFx0fVxuXHRcdGlmIChyZWwgPT09ICcnKSB7XG5cdFx0XHRyZXR1cm4gcmVzb2x2ZWREaXI7XG5cdFx0fVxuXHRcdHJldHVybiBVUkkuam9pblBhdGgocmVzb2x2ZWREaXIsIC4uLnJlbC5zcGxpdCgnLycpKTtcblx0fVxuXG5cdC8vIC0tLS0gTGlmZWN5Y2xlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvLyAtLS0tIFNlc3Npb24gc3Vic2NyaXB0aW9uIGhlbHBlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBHZXQgb3IgY3JlYXRlIGEgc2Vzc2lvbiBzdWJzY3JpcHRpb24uIFRoZSBmaXJzdCBjYWxsIGZvciBhIGdpdmVuIFVSSVxuXHQgKiB0cmlnZ2VycyBhIHNlcnZlciBzdWJzY3JpYmU7IHN1YnNlcXVlbnQgY2FsbHMgaW5jcmVtZW50IHRoZSByZWZjb3VudC5cblx0ICovXG5cdHByaXZhdGUgX2Vuc3VyZVNlc3Npb25TdWJzY3JpcHRpb24oc2Vzc2lvblVyaTogc3RyaW5nKTogSUFnZW50U3Vic2NyaXB0aW9uPFNlc3Npb25TdGF0ZT4ge1xuXHRcdGxldCByZWYgPSB0aGlzLl9zZXNzaW9uU3Vic2NyaXB0aW9ucy5nZXQoc2Vzc2lvblVyaSk7XG5cdFx0aWYgKHJlZj8ub2JqZWN0LnZhbHVlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdHRoaXMuX3Nlc3Npb25TdWJzY3JpcHRpb25zLmRlbGV0ZShzZXNzaW9uVXJpKTtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl93b3JraW5nRGlyZWN0b3J5UmVnaXN0cmF0aW9ucy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb25VcmkpO1xuXHRcdFx0cmVmID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoIXJlZikge1xuXHRcdFx0cmVmID0gdGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uZ2V0U3Vic2NyaXB0aW9uKFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCBVUkkucGFyc2Uoc2Vzc2lvblVyaSksICdBZ2VudEhvc3RTZXNzaW9uSGFuZGxlcicpO1xuXHRcdFx0dGhpcy5fc2Vzc2lvblN1YnNjcmlwdGlvbnMuc2V0KHNlc3Npb25VcmksIHJlZik7XG5cdFx0XHR0aGlzLl93b3JraW5nRGlyZWN0b3J5UmVnaXN0cmF0aW9ucy5zZXQoc2Vzc2lvblVyaSwgdGhpcy5fd29ya2luZ0RpcmVjdG9yeVN5bmNocm9uaXplci5yZWdpc3Rlcih7XG5cdFx0XHRcdHNlc3Npb246IFVSSS5wYXJzZShzZXNzaW9uVXJpKSxcblx0XHRcdFx0cHJvdmlkZXI6IHRoaXMuX2NvbmZpZy5wcm92aWRlcixcblx0XHRcdFx0Y29ubmVjdGlvbjogdGhpcy5fY29uZmlnLmNvbm5lY3Rpb24sXG5cdFx0XHRcdHN1YnNjcmlwdGlvbjogcmVmLm9iamVjdCxcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlZi5vYmplY3Q7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IG9yIGNyZWF0ZSB0aGUgZGVmYXVsdC1jaGF0IHN1YnNjcmlwdGlvbiBmb3IgYSBzZXNzaW9uLiBNaXJyb3JzIHRoZVxuXHQgKiByZWZjb3VudCBsaWZlY3ljbGUgb2Yge0BsaW5rIF9lbnN1cmVTZXNzaW9uU3Vic2NyaXB0aW9ufS5cblx0ICovXG5cdHByaXZhdGUgX2Vuc3VyZURlZmF1bHRDaGF0U3Vic2NyaXB0aW9uKHNlc3Npb25Vcmk6IHN0cmluZyk6IElBZ2VudFN1YnNjcmlwdGlvbjxDaGF0U3RhdGU+IHtcblx0XHRsZXQgcmVmID0gdGhpcy5fZGVmYXVsdENoYXRTdWJzY3JpcHRpb25zLmdldChzZXNzaW9uVXJpKTtcblx0XHRpZiAocmVmPy5vYmplY3QudmFsdWUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0dGhpcy5fZGVmYXVsdENoYXRTdWJzY3JpcHRpb25zLmRlbGV0ZShzZXNzaW9uVXJpKTtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHRyZWYgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghcmVmKSB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3JlcXVpcmVSYXdTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk7XG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IHN0YXRlLmRlZmF1bHRDaGF0O1xuXHRcdFx0aWYgKCFkZWZhdWx0Q2hhdCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gJHtzZXNzaW9uVXJpfSBoYXMgbm8gZGVmYXVsdCBjaGF0YCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjaGF0VXJpID0gVVJJLnBhcnNlKGRlZmF1bHRDaGF0LnRvU3RyaW5nKCkpO1xuXHRcdFx0cmVmID0gdGhpcy5fY29uZmlnLmNvbm5lY3Rpb24uZ2V0U3Vic2NyaXB0aW9uKFN0YXRlQ29tcG9uZW50cy5DaGF0LCBjaGF0VXJpLCAnQWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXInKTtcblx0XHRcdHRoaXMuX2RlZmF1bHRDaGF0U3Vic2NyaXB0aW9ucy5zZXQoc2Vzc2lvblVyaSwgcmVmKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlZi5vYmplY3Q7XG5cdH1cblxuXHQvKipcblx0ICogUmVsZWFzZSB0aGUgc3Vic2NyaXB0aW9ucyBoZWxkIGJ5IGEgc2luZ2xlIGNoYXQgc2Vzc2lvbiBvbiBkaXNwb3NlLlxuXHQgKlxuXHQgKiBVbmxpa2Uge0BsaW5rIF9yZWxlYXNlU2Vzc2lvblN1YnNjcmlwdGlvbn0gKHdoaWNoIHRlYXJzIGRvd24gZXZlcnkgY2hhdFxuXHQgKiBvZiBhIHNlc3Npb24gYXQgb25jZSksIHRoaXMgb25seSByZWxlYXNlcyB0aGUgZGlzcG9zZWQgY2hhdCdzIG93blxuXHQgKiBjb252ZXJzYXRpb24gc3Vic2NyaXB0aW9uIGFuZCBuZXZlciB0b3VjaGVzIHNpYmxpbmcgcGVlciBjaGF0czogY2xvc2luZ1xuXHQgKiBvbmUgY2hhdCBvZiBhIG11bHRpLWNoYXQgc2Vzc2lvbiBtdXN0IG5vdCBzdHJhbmQgYW5vdGhlciBjaGF0IFx1MjAxNCBpbmNsdWRpbmdcblx0ICogb25lIHRoYXQgaXMgY29uY3VycmVudGx5IGh5ZHJhdGluZyBpbiB7QGxpbmsgcHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudH0gXHUyMDE0XG5cdCAqIG9uIGEgZGlzcG9zZWQgc3Vic2NyaXB0aW9uLiBUaGUgc2Vzc2lvbiBzdW1tYXJ5IHN1YnNjcmlwdGlvbiAoYW5kIGl0c1xuXHQgKiBsb2Nrc3RlcCBkZWZhdWx0LWNoYXQgc3Vic2NyaXB0aW9uKSBpcyBzaGFyZWQgYnkgZXZlcnkgY2hhdCBvZiB0aGVcblx0ICogc2Vzc2lvbiwgc28gaXQgaXMgb25seSB0b3JuIGRvd24gb25jZSBubyBzaWJsaW5nIGNoYXQgc2Vzc2lvbiBpcyBzdGlsbFxuXHQgKiBhY3RpdmUgb3IgbWlkLWh5ZHJhdGlvbiBmb3IgdGhlIHNhbWUgYmFja2VuZCBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVsZWFzZUNoYXRTZXNzaW9uU3Vic2NyaXB0aW9ucyhzZXNzaW9uVXJpOiBzdHJpbmcsIGNoYXRVcmk6IHN0cmluZyk6IHZvaWQge1xuXHRcdC8vIFJlbGVhc2UgdGhpcyBjaGF0J3Mgb3duIGNvbnZlcnNhdGlvbiBzdWJzY3JpcHRpb24uIFRoZSBkZWZhdWx0IGNoYXQnc1xuXHRcdC8vIHN1YnNjcmlwdGlvbiBpcyBrZXllZCBieSBzZXNzaW9uIFVSSSBhbmQgdG9ybiBkb3duIHRvZ2V0aGVyIHdpdGggdGhlXG5cdFx0Ly8gc2hhcmVkIHNlc3Npb24gc3Vic2NyaXB0aW9uIGJlbG93OyBwZWVyIGNoYXRzIG93biBhIGRlZGljYXRlZCBlbnRyeS5cblx0XHRpZiAoY2hhdFVyaSAhPT0gdGhpcy5fZ2V0UmF3U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5kZWZhdWx0Q2hhdD8udG9TdHJpbmcoKSkge1xuXHRcdFx0Y29uc3QgY2hhdFJlZiA9IHRoaXMuX2FkZGl0aW9uYWxDaGF0U3Vic2NyaXB0aW9ucy5nZXQoY2hhdFVyaSk7XG5cdFx0XHRpZiAoY2hhdFJlZikge1xuXHRcdFx0XHR0aGlzLl9hZGRpdGlvbmFsQ2hhdFN1YnNjcmlwdGlvbnMuZGVsZXRlKGNoYXRVcmkpO1xuXHRcdFx0XHRjaGF0UmVmLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gS2VlcCB0aGUgc2hhcmVkIHNlc3Npb24gc3Vic2NyaXB0aW9uIGFsaXZlIHdoaWxlIGFueSBzaWJsaW5nIGNoYXQgb2Zcblx0XHQvLyB0aGUgc2FtZSBiYWNrZW5kIHNlc3Npb24gaXMgc3RpbGwgYWN0aXZlIG9yIGh5ZHJhdGluZy5cblx0XHRpZiAodGhpcy5faGFzT3RoZXJTZXNzaW9uSG9sZChzZXNzaW9uVXJpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZWYgPSB0aGlzLl9zZXNzaW9uU3Vic2NyaXB0aW9ucy5nZXQoc2Vzc2lvblVyaSk7XG5cdFx0aWYgKHJlZikge1xuXHRcdFx0dGhpcy5fc2Vzc2lvblN1YnNjcmlwdGlvbnMuZGVsZXRlKHNlc3Npb25VcmkpO1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3dvcmtpbmdEaXJlY3RvcnlSZWdpc3RyYXRpb25zLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvblVyaSk7XG5cdFx0fVxuXHRcdGNvbnN0IGNoYXRSZWYgPSB0aGlzLl9kZWZhdWx0Q2hhdFN1YnNjcmlwdGlvbnMuZ2V0KHNlc3Npb25VcmkpO1xuXHRcdGlmIChjaGF0UmVmKSB7XG5cdFx0XHR0aGlzLl9kZWZhdWx0Q2hhdFN1YnNjcmlwdGlvbnMuZGVsZXRlKHNlc3Npb25VcmkpO1xuXHRcdFx0Y2hhdFJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgd2hldGhlciBhbm90aGVyIGNoYXQgc2Vzc2lvbiBmb3IgdGhlIGdpdmVuIGJhY2tlbmQgc2Vzc2lvbiBVUkkgaXNcblx0ICogc3RpbGwgYWN0aXZlIG9yIGluIHRoZSBtaWRkbGUgb2YgaHlkcmF0aW5nIGl0cyBzdWJzY3JpcHRpb25zLCBzbyB0aGVcblx0ICogc2hhcmVkIHNlc3Npb24gc3Vic2NyaXB0aW9uIG11c3QgYmUga2VwdCBhbGl2ZS4gQ2FsbGVycyBpbnZva2UgdGhpcyBhZnRlclxuXHQgKiByZW1vdmluZyB0aGVpciBvd24gZW50cnkgZnJvbSB7QGxpbmsgX2FjdGl2ZVNlc3Npb25zfS5cblx0ICovXG5cdHByaXZhdGUgX2hhc090aGVyU2Vzc2lvbkhvbGQoc2Vzc2lvblVyaTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKCh0aGlzLl9oeWRyYXRpbmdDaGF0U2Vzc2lvbnMuZ2V0KHNlc3Npb25VcmkpID8/IDApID4gMCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgdGhpcy5fYWN0aXZlU2Vzc2lvbnMua2V5cygpKSB7XG5cdFx0XHRpZiAodGhpcy5fcmVzb2x2ZVNlc3Npb25VcmkocmVzb3VyY2UpLnRvU3RyaW5nKCkgPT09IHNlc3Npb25VcmkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkIHRoZSBjdXJyZW50IG9wdGltaXN0aWMgc2Vzc2lvbiBzdGF0ZSBmb3IgYSBiYWNrZW5kIHNlc3Npb24gVVJJLFxuXHQgKiBtZXJnZWQgd2l0aCBpdHMgZGVmYXVsdCBjaGF0IHNvIGNvbnZlcnNhdGlvbiBjb250ZW50cyAodHVybnMsIGFjdGl2ZVxuXHQgKiB0dXJuLCBwZW5kaW5nL3F1ZXVlZCBtZXNzYWdlcywgaW5wdXQgcmVxdWVzdHMpIGFyZSB2aXNpYmxlLlxuXHQgKi9cblx0LyoqXG5cdCAqIFJlc29sdmVzIG9uY2UgYSBzdWJzY3JpcHRpb24gaGFzIHJlY2VpdmVkIGl0cyBmaXJzdCBzbmFwc2hvdCAoaXRzXG5cdCAqIGB2YWx1ZWAgaXMgbm8gbG9uZ2VyIGB1bmRlZmluZWRgKSBcdTIwMTQgaS5lLiBpdCBoYXMgaHlkcmF0ZWQgd2l0aCBzdGF0ZSBvclxuXHQgKiBhbiBlcnJvci4gUmVzb2x2ZXMgaW1tZWRpYXRlbHkgaWYgYWxyZWFkeSBoeWRyYXRlZCBvciBpZiBjYW5jZWxsYXRpb25cblx0ICogaXMgcmVxdWVzdGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfd2hlblN1YnNjcmlwdGlvbkh5ZHJhdGVkPFQ+KHN1YjogSUFnZW50U3Vic2NyaXB0aW9uPFQ+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoc3ViLnZhbHVlICE9PSB1bmRlZmluZWQgfHwgdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRjb25zdCBzZXR0bGUgPSAoKSA9PiB7IHN0b3JlLmRpc3Bvc2UoKTsgcmVzb2x2ZSgpOyB9O1xuXHRcdFx0c3RvcmUuYWRkKHN1Yi5vbkRpZENoYW5nZSgoKSA9PiB7IGlmIChzdWIudmFsdWUgIT09IHVuZGVmaW5lZCkgeyBzZXR0bGUoKTsgfSB9KSk7XG5cdFx0XHRjb25zdCBvbkRpZEVycm9yID0gc3ViLm9uRGlkRXJyb3I7XG5cdFx0XHRpZiAob25EaWRFcnJvcikge1xuXHRcdFx0XHRzdG9yZS5hZGQob25EaWRFcnJvcihzZXR0bGUpKTtcblx0XHRcdH1cblx0XHRcdHN0b3JlLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZChzZXR0bGUpKTtcblx0XHRcdGlmIChzdWIudmFsdWUgIT09IHVuZGVmaW5lZCkgeyBzZXR0bGUoKTsgfVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25Vcmk6IHN0cmluZywgY2hhdFVyaT86IHN0cmluZyk6IElTZXNzaW9uV2l0aERlZmF1bHRDaGF0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuX2dldFJhd1Nlc3Npb25TdGF0ZShzZXNzaW9uVXJpKTtcblx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IHZhbHVlLmRlZmF1bHRDaGF0Py50b1N0cmluZygpO1xuXHRcdGNvbnN0IGNoYXRTdGF0ZSA9IGNoYXRVcmkgJiYgY2hhdFVyaSAhPT0gZGVmYXVsdENoYXRcblx0XHRcdD8gdGhpcy5fZ2V0QWRkaXRpb25hbENoYXRTdGF0ZShjaGF0VXJpKVxuXHRcdFx0OiB0aGlzLl9nZXREZWZhdWx0Q2hhdFN0YXRlKHNlc3Npb25VcmkpO1xuXHRcdHJldHVybiBtZXJnZVNlc3Npb25XaXRoRGVmYXVsdENoYXQodmFsdWUsIGNoYXRTdGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRSYXdTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaTogc3RyaW5nKTogU2Vzc2lvblN0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZWYgPSB0aGlzLl9zZXNzaW9uU3Vic2NyaXB0aW9ucy5nZXQoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgdmFsdWUgPSByZWY/Lm9iamVjdC52YWx1ZTtcblx0XHRyZXR1cm4gdmFsdWUgJiYgISh2YWx1ZSBpbnN0YW5jZW9mIEVycm9yKSA/IHZhbHVlIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVxdWlyZVJhd1Nlc3Npb25TdGF0ZShzZXNzaW9uVXJpOiBzdHJpbmcpOiBTZXNzaW9uU3RhdGUge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fZ2V0UmF3U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpO1xuXHRcdGlmICghc3RhdGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiBzdGF0ZSBpcyBub3QgaHlkcmF0ZWQgZm9yICR7c2Vzc2lvblVyaX1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHN0YXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVxdWlyZURlZmF1bHRDaGF0VXJpKHNlc3Npb25Vcmk6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgZGVmYXVsdENoYXQgPSB0aGlzLl9yZXF1aXJlUmF3U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpLmRlZmF1bHRDaGF0O1xuXHRcdGlmICghZGVmYXVsdENoYXQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiAke3Nlc3Npb25Vcml9IGhhcyBubyBkZWZhdWx0IGNoYXRgKTtcblx0XHR9XG5cdFx0cmV0dXJuIGRlZmF1bHRDaGF0LnRvU3RyaW5nKCk7XG5cdH1cblxuXHQvKiogUmVhZCB0aGUgY3VycmVudCBvcHRpbWlzdGljIGRlZmF1bHQtY2hhdCBzdGF0ZSBmb3IgYSBiYWNrZW5kIHNlc3Npb24gVVJJLiAqL1xuXHRwcml2YXRlIF9nZXREZWZhdWx0Q2hhdFN0YXRlKHNlc3Npb25Vcmk6IHN0cmluZyk6IENoYXRTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVmID0gdGhpcy5fZGVmYXVsdENoYXRTdWJzY3JpcHRpb25zLmdldChzZXNzaW9uVXJpKTtcblx0XHRpZiAoIXJlZikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgdmFsdWUgPSByZWYub2JqZWN0LnZhbHVlO1xuXHRcdHJldHVybiAodmFsdWUgJiYgISh2YWx1ZSBpbnN0YW5jZW9mIEVycm9yKSkgPyB2YWx1ZSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKiBSZWFkIHRoZSBjdXJyZW50IG9wdGltaXN0aWMgc3RhdGUgZm9yIGFuIGFkZGl0aW9uYWwgcGVlciBjaGF0IFVSSS4gKi9cblx0cHJpdmF0ZSBfZ2V0QWRkaXRpb25hbENoYXRTdGF0ZShjaGF0VXJpOiBzdHJpbmcpOiBDaGF0U3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJlZiA9IHRoaXMuX2FkZGl0aW9uYWxDaGF0U3Vic2NyaXB0aW9ucy5nZXQoY2hhdFVyaSk7XG5cdFx0aWYgKCFyZWYpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHZhbHVlID0gcmVmLm9iamVjdC52YWx1ZTtcblx0XHRyZXR1cm4gKHZhbHVlICYmICEodmFsdWUgaW5zdGFuY2VvZiBFcnJvcikpID8gdmFsdWUgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IG9yIGNyZWF0ZSB0aGUgc3Vic2NyaXB0aW9uIGZvciBhbiBhZGRpdGlvbmFsIHBlZXIgY2hhdCwga2V5ZWQgYnkgdGhlXG5cdCAqIGNoYXQgY2hhbm5lbCBVUkkuIE1pcnJvcnMge0BsaW5rIF9lbnN1cmVEZWZhdWx0Q2hhdFN1YnNjcmlwdGlvbn0gYnV0IGZvclxuXHQgKiBub24tZGVmYXVsdCBjaGF0cyBzbyB0aGVpciBjb252ZXJzYXRpb24gY29udGVudHMgaHlkcmF0ZSBpbmRlcGVuZGVudGx5LlxuXHQgKi9cblx0cHJpdmF0ZSBfZW5zdXJlQWRkaXRpb25hbENoYXRTdWJzY3JpcHRpb24oY2hhdFVyaTogc3RyaW5nKTogSUFnZW50U3Vic2NyaXB0aW9uPENoYXRTdGF0ZT4ge1xuXHRcdGxldCByZWYgPSB0aGlzLl9hZGRpdGlvbmFsQ2hhdFN1YnNjcmlwdGlvbnMuZ2V0KGNoYXRVcmkpO1xuXHRcdGlmIChyZWY/Lm9iamVjdC52YWx1ZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHR0aGlzLl9hZGRpdGlvbmFsQ2hhdFN1YnNjcmlwdGlvbnMuZGVsZXRlKGNoYXRVcmkpO1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdHJlZiA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKCFyZWYpIHtcblx0XHRcdHJlZiA9IHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uLmdldFN1YnNjcmlwdGlvbihTdGF0ZUNvbXBvbmVudHMuQ2hhdCwgVVJJLnBhcnNlKGNoYXRVcmkpLCAnQWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXInKTtcblx0XHRcdHRoaXMuX2FkZGl0aW9uYWxDaGF0U3Vic2NyaXB0aW9ucy5zZXQoY2hhdFVyaSwgcmVmKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlZi5vYmplY3Q7XG5cdH1cblxuXHQvKipcblx0ICogU3Vic2NyaWJlIHRvIHRoZSBjb252ZXJzYXRpb24gY2hhbm5lbCBvZiBgc2Vzc2lvblJlc291cmNlYCdzIGNoYXQgYW5kXG5cdCAqIHJldHVybiB0aGUge0BsaW5rIElBZ2VudFN1YnNjcmlwdGlvbn0uIFJvdXRlcyB0byB0aGUgZGVmYXVsdC1jaGF0XG5cdCAqIHN1YnNjcmlwdGlvbiAoZnJhZ21lbnQtbGVzcyByZXNvdXJjZSkgb3IgdG8gYW4gYWRkaXRpb25hbCBwZWVyIGNoYXQuXG5cdCAqL1xuXHRwcml2YXRlIF9lbnN1cmVDaGF0U3Vic2NyaXB0aW9uKHNlc3Npb25Vcmk6IHN0cmluZywgY2hhdFVyaTogc3RyaW5nKTogSUFnZW50U3Vic2NyaXB0aW9uPENoYXRTdGF0ZT4ge1xuXHRcdHJldHVybiBjaGF0VXJpID09PSB0aGlzLl9yZXF1aXJlRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSlcblx0XHRcdD8gdGhpcy5fZW5zdXJlRGVmYXVsdENoYXRTdWJzY3JpcHRpb24oc2Vzc2lvblVyaSlcblx0XHRcdDogdGhpcy5fZW5zdXJlQWRkaXRpb25hbENoYXRTdWJzY3JpcHRpb24oY2hhdFVyaSk7XG5cdH1cblxuXHRyZXNvbHZlQ2hhdFJlc3BvbnNlVXJpKF9zZXNzaW9uUmVzb3VyY2U6IFVSSSwgaHJlZjogc3RyaW5nLCBfa2luZDogJ2xpbmsnIHwgJ2ltYWdlJyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHJld3JpdGVBZ2VudEhvc3RMaW5rVGFyZ2V0KGhyZWYsIHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uQXV0aG9yaXR5KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkIHRoZSBjdXJyZW50IHJvb3Qgc3RhdGUuXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRSb290U3RhdGUoKTogUm9vdFN0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuX2NvbmZpZy5jb25uZWN0aW9uLnJvb3RTdGF0ZS52YWx1ZTtcblx0XHRyZXR1cm4gKHZhbHVlICYmICEodmFsdWUgaW5zdGFuY2VvZiBFcnJvcikpID8gdmFsdWUgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgWywgc2Vzc2lvbl0gb2YgdGhpcy5fYWN0aXZlU2Vzc2lvbnMpIHtcblx0XHRcdHNlc3Npb24uZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9hY3RpdmVTZXNzaW9ucy5jbGVhcigpO1xuXHRcdGZvciAoY29uc3QgcmVmIG9mIHRoaXMuX3Nlc3Npb25TdWJzY3JpcHRpb25zLnZhbHVlcygpKSB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9zZXNzaW9uU3Vic2NyaXB0aW9ucy5jbGVhcigpO1xuXHRcdGZvciAoY29uc3QgcmVmIG9mIHRoaXMuX2RlZmF1bHRDaGF0U3Vic2NyaXB0aW9ucy52YWx1ZXMoKSkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fZGVmYXVsdENoYXRTdWJzY3JpcHRpb25zLmNsZWFyKCk7XG5cdFx0Zm9yIChjb25zdCByZWYgb2YgdGhpcy5fYWRkaXRpb25hbENoYXRTdWJzY3JpcHRpb25zLnZhbHVlcygpKSB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9hZGRpdGlvbmFsQ2hhdFN1YnNjcmlwdGlvbnMuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIENsaWVudC1wcm92aWRlZCB0b29sIGhlbHBlcnNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogQ29udmVydHMgYW4gaW50ZXJuYWwge0BsaW5rIElUb29sUmVzdWx0fSB0byBhIHByb3RvY29sXG4gKiB7QGxpbmsgaW1wb3J0KCcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJykuVG9vbENhbGxSZXN1bHR9LlxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9vbFJlc3VsdFRvUHJvdG9jb2wocmVzdWx0OiBJVG9vbFJlc3VsdCwgdG9vbE5hbWU6IHN0cmluZyk6IHtcblx0c3VjY2VzczogYm9vbGVhbjtcblx0cGFzdFRlbnNlTWVzc2FnZTogU3RyaW5nT3JNYXJrZG93bjtcblx0Y29udGVudD86ICh7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0OyB0ZXh0OiBzdHJpbmcgfSB8IHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLkVtYmVkZGVkUmVzb3VyY2U7IGRhdGE6IHN0cmluZzsgY29udGVudFR5cGU6IHN0cmluZyB9KVtdO1xuXHRlcnJvcj86IHsgbWVzc2FnZTogc3RyaW5nIH07XG59IHtcblx0Y29uc3QgaXNFcnJvciA9ICEhcmVzdWx0LnRvb2xSZXN1bHRFcnJvcjtcblx0Y29uc3QgZGVmYXVsdFBhc3RUZW5zZSA9IGlzRXJyb3IgPyBgJHt0b29sTmFtZX0gZmFpbGVkYCA6IGBSYW4gJHt0b29sTmFtZX1gO1xuXHRjb25zdCBwYXN0VGVuc2U6IFN0cmluZ09yTWFya2Rvd24gPSB0eXBlb2YgcmVzdWx0LnRvb2xSZXN1bHRNZXNzYWdlID09PSAnc3RyaW5nJ1xuXHRcdD8gcmVzdWx0LnRvb2xSZXN1bHRNZXNzYWdlXG5cdFx0OiByZXN1bHQudG9vbFJlc3VsdE1lc3NhZ2Vcblx0XHRcdD8geyBtYXJrZG93bjogcmVzdWx0LnRvb2xSZXN1bHRNZXNzYWdlLnZhbHVlIH1cblx0XHRcdDogZGVmYXVsdFBhc3RUZW5zZTtcblxuXHRjb25zdCBjb250ZW50OiAoeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dDsgdGV4dDogc3RyaW5nIH0gfCB7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5FbWJlZGRlZFJlc291cmNlOyBkYXRhOiBzdHJpbmc7IGNvbnRlbnRUeXBlOiBzdHJpbmcgfSlbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IHBhcnQgb2YgcmVzdWx0LmNvbnRlbnQpIHtcblx0XHRpZiAocGFydC5raW5kID09PSAndGV4dCcpIHtcblx0XHRcdGNvbnRlbnQucHVzaCh7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiBwYXJ0LnZhbHVlIH0pO1xuXHRcdH0gZWxzZSBpZiAocGFydC5raW5kID09PSAncHJvbXB0VHN4Jykge1xuXHRcdFx0Y29udGVudC5wdXNoKHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6IHN0cmluZ2lmeVByb21wdFRzeFBhcnQocGFydCkgfSk7XG5cdFx0fSBlbHNlIGlmIChwYXJ0LmtpbmQgPT09ICdkYXRhJykge1xuXHRcdFx0Y29udGVudC5wdXNoKHtcblx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLkVtYmVkZGVkUmVzb3VyY2UsXG5cdFx0XHRcdGRhdGE6IGVuY29kZUJhc2U2NChwYXJ0LnZhbHVlLmRhdGEpLFxuXHRcdFx0XHRjb250ZW50VHlwZTogcGFydC52YWx1ZS5taW1lVHlwZSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB7XG5cdFx0c3VjY2VzczogIWlzRXJyb3IsXG5cdFx0cGFzdFRlbnNlTWVzc2FnZTogcGFzdFRlbnNlLFxuXHRcdGNvbnRlbnQ6IGNvbnRlbnQubGVuZ3RoID4gMCA/IGNvbnRlbnQgOiB1bmRlZmluZWQsXG5cdFx0ZXJyb3I6IGlzRXJyb3Jcblx0XHRcdD8geyBtZXNzYWdlOiB0eXBlb2YgcmVzdWx0LnRvb2xSZXN1bHRFcnJvciA9PT0gJ3N0cmluZycgPyByZXN1bHQudG9vbFJlc3VsdEVycm9yIDogYCR7dG9vbE5hbWV9IGVuY291bnRlcmVkIGFuIGVycm9yYCB9XG5cdFx0XHQ6IHVuZGVmaW5lZCxcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxTQUFTLG1CQUFtQix3QkFBd0I7QUFDN0QsU0FBUyxjQUFjLGNBQWMsZ0JBQWdCO0FBQ3JELFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGNBQWMsMkJBQTJCO0FBQ2xELFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBNkIscUNBQXdEO0FBQzlGLFNBQVMsWUFBWSxlQUFlLHVCQUF1QixpQkFBNkIsbUJBQW1CLG9CQUFzQztBQUNqSixTQUFTLGFBQWEsbUJBQW1CO0FBQ3pDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxTQUFTLHFCQUFxQixpQkFBaUIsU0FBUyxh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QUFDckMsZUFBVyxPQUFPLEtBQUssNkJBQTZCLE9BQU8sR0FBRztBQUM3RCxVQUFJLFFBQVE7QUFBQSxJQUNiO0FBQ0EsU0FBSyw2QkFBNkIsTUFBTTtBQUN4QyxVQUFNLFFBQVE7QUFBQSxFQUNmO0FBQ0Q7QUFyeUthLHdCQUVZLHlCQUF5QjtBQUZyQyx3QkFHWSwyQ0FBMkM7QUFIdkQsMEJBQU47QUFBQSxFQXFISjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBaEpVO0FBK3lLTixTQUFTLHFCQUFxQixRQUFxQixVQUt4RDtBQUNELFFBQU0sVUFBVSxDQUFDLENBQUMsT0FBTztBQUN6QixRQUFNLG1CQUFtQixVQUFVLEdBQUcsUUFBUSxZQUFZLE9BQU8sUUFBUTtBQUN6RSxRQUFNLFlBQThCLE9BQU8sT0FBTyxzQkFBc0IsV0FDckUsT0FBTyxvQkFDUCxPQUFPLG9CQUNOLEVBQUUsVUFBVSxPQUFPLGtCQUFrQixNQUFNLElBQzNDO0FBRUosUUFBTSxVQUF3SixDQUFDO0FBQy9KLGFBQVcsUUFBUSxPQUFPLFNBQVM7QUFDbEMsUUFBSSxLQUFLLFNBQVMsUUFBUTtBQUN6QixjQUFRLEtBQUssRUFBRSxNQUFNLHNCQUFzQixNQUFNLE1BQU0sS0FBSyxNQUFNLENBQUM7QUFBQSxJQUNwRSxXQUFXLEtBQUssU0FBUyxhQUFhO0FBQ3JDLGNBQVEsS0FBSyxFQUFFLE1BQU0sc0JBQXNCLE1BQU0sTUFBTSx1QkFBdUIsSUFBSSxFQUFFLENBQUM7QUFBQSxJQUN0RixXQUFXLEtBQUssU0FBUyxRQUFRO0FBQ2hDLGNBQVEsS0FBSztBQUFBLFFBQ1osTUFBTSxzQkFBc0I7QUFBQSxRQUM1QixNQUFNLGFBQWEsS0FBSyxNQUFNLElBQUk7QUFBQSxRQUNsQyxhQUFhLEtBQUssTUFBTTtBQUFBLE1BQ3pCLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUVBLFNBQU87QUFBQSxJQUNOLFNBQVMsQ0FBQztBQUFBLElBQ1Ysa0JBQWtCO0FBQUEsSUFDbEIsU0FBUyxRQUFRLFNBQVMsSUFBSSxVQUFVO0FBQUEsSUFDeEMsT0FBTyxVQUNKLEVBQUUsU0FBUyxPQUFPLE9BQU8sb0JBQW9CLFdBQVcsT0FBTyxrQkFBa0IsR0FBRyxRQUFRLHdCQUF3QixJQUNwSDtBQUFBLEVBQ0o7QUFDRDsiLAogICJuYW1lcyI6IFsiYyIsICJzdGF0ZSIsICJhY3Rpb24iLCAidG9rZW4iLCAiY2hhdFVSSSIsICJyZXN1bHQiLCAiZXJyb3IiLCAiY3VycmVudCIsICJjaGF0UmVmIl0KfQo=
