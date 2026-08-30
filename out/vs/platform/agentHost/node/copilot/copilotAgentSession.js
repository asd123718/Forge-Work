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
import { raceCancellation, RunOnceScheduler, Sequencer, SequencerByKey, Throttler } from "../../../../base/common/async.js";
import { encodeBase64, VSBuffer } from "../../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter } from "../../../../base/common/event.js";
import { CancellationError, getErrorMessage } from "../../../../base/common/errors.js";
import { escapeMarkdownSyntaxTokens } from "../../../../base/common/htmlContent.js";
import { Disposable, DisposableMap, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { isAuthorizationProtectedResourceMetadata } from "../../../../base/common/oauth.js";
import { safeStringify } from "../../../../base/common/objects.js";
import { isAbsolute, join } from "../../../../base/common/path.js";
import { extUriBiasedIgnorePathCase, normalizePath } from "../../../../base/common/resources.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { splitLinesIncludeSeparators } from "../../../../base/common/strings.js";
import { hasKey, isDefined, isObject, isString } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { INativeEnvironmentService } from "../../../environment/common/environment.js";
import { IFileService } from "../../../files/common/files.js";
import { IInstantiationService } from "../../../instantiation/common/instantiation.js";
import { ILogService, LogLevel } from "../../../log/common/log.js";
import { ITelemetryService } from "../../../telemetry/common/telemetry.js";
import { getCopilotHomePath } from "../../common/copilotHome.js";
import { CopilotCliConfigKey, copilotCliConfigSchema } from "../../common/copilotCliConfig.js";
import { gitHubMcpServerUrl } from "../../common/githubEndpoints.js";
import { AgentHostSandboxConfigKey, sandboxConfigSchema } from "../../common/sandboxConfigSchema.js";
import { AgentHostGlobalAutoApproveEnabledConfigKey, AgentHostAutoReplyAnswer, AgentHostAutoReplyEnabledConfigKey, AgentHostDisableRepoInfoTelemetryConfigKey, platformRootSchema, platformSessionSchema } from "../../common/agentHostSchema.js";
import { createUnknownAgentHostClientTelemetryContext } from "../../common/agentHostTelemetry.js";
import { AgentSession } from "../../common/agent.js";
import { META_DIFF_BASE_BRANCH } from "../../common/agentHostGitService.js";
import { stripRedundantCdPrefix } from "../../common/commandLineHelpers.js";
import { toToolCallMeta } from "../../common/meta/agentToolCallMeta.js";
import { OtelData } from "../../common/otlp/otlpLogEmitter.js";
import { SessionConfigKey } from "../../common/sessionConfigKeys.js";
import { resolveCopilotConfigSlashCommandOnSend } from "../../common/copilotConfigSlashCommands.js";
import { STREAMING_TOOL_DISPLAY_INTERVAL_MS, streamingToolDisplayText } from "../../common/streamingToolCallDisplay.js";
import { isAgentFeedbackAnnotationsAttachment, renderAgentFeedbackAnnotationsAttachment } from "../../common/meta/agentFeedbackAttachments.js";
import { ISessionDataService } from "../../common/sessionDataService.js";
import { IAgentHostOTelService } from "../../common/otel/agentHostOTelService.js";
import { MessageAttachmentKind, ToolCallContributorKind } from "../../common/state/protocol/state.js";
import { ActionType, isChatAction } from "../../common/state/sessionActions.js";
import { MessageKind, ResponsePartKind, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputRequestPurpose, ChatInputResponseKind, ToolCallConfirmationReason, ToolCallRiskAssessmentKind, ToolCallRiskAssessmentStatus, ToolCallStatus, ToolResultContentType, buildSubagentSessionUri, isSubagentSession } from "../../common/state/sessionState.js";
import { IAgentConfigurationService } from "../agentConfigurationService.js";
import { clientToolNamesFromSnapshot } from "./copilotSessionLauncher.js";
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME, NON_DEFERRED_CLIENT_TOOL_NAMES, RUNTIME_TOOL_SEARCH_TOOL_NAME } from "./toolSearchDeferral.js";
import { ActiveClientToolSet } from "../activeClientState.js";
import { AgentHostTelemetryReporter, toInitiatorTelemetry } from "../agentHostTelemetryReporter.js";
import { AgentHostRepoInfoTelemetry } from "../agentHostRepoInfoTelemetry.js";
import { PendingRequestRegistry } from "../../common/pendingRequestRegistry.js";
import { buildCopilotSystemNotification } from "./copilotSystemNotification.js";
import { parseLeadingSlashCommand } from "../../common/agentHostSlashCommand.js";
import { NonPtyShellTerminalStreams } from "./copilotNonPtyShellTerminals.js";
import { buildSandboxConfigForSdk } from "./sandboxConfigForSdk.js";
import { getEditFilePaths, getInvocationMessage, getPastTenseMessage, getPermissionDisplay, getShellIntention, getShellLanguage, getStreamingInvocationMessage, getSubagentMetadata, getTaskCompleteMarkdown, getToolDisplayName, getToolInputString, getToolKind, isAgentCoordinationTool, isCopilotSdkToolOutputFile, isEditTool, isHiddenTool, isShellTool, isTaskCompleteTool, parseCopilotStreamingToolInput, synthesizeSkillToolCall, tryStringify } from "./copilotToolDisplay.js";
import { FileEditTracker } from "../shared/fileEditTracker.js";
import { ICopilotApiService } from "../shared/copilotApiService.js";
import { buildChatErrorInfoFromCopilotSdkFields } from "./copilotSdkChatError.js";
import { McpCustomizationController } from "../shared/mcpCustomizationController.js";
import { getSdkMcpServerEnablement, resolveCustomizationEnablement, targetForMcpServer } from "../shared/customizationEnablementGate.js";
import { appendSdkToolResultContent, mapSessionEvents } from "./mapSessionEvents.js";
import { addAttachmentDisplayKindToMimeType, addSimpleAttachmentDisplayKindToMimeType } from "./copilotAttachmentUtils.js";
import { buildPendingEditContentUri } from "./pendingEditContentStore.js";
import { IAgentHostCustomizationEnablementService } from "../agentHostCustomizationEnablementService.js";
import { IAgentHostPromptCache } from "../agentHostPromptCache.js";
import { AgentHostClientType } from "../../common/agentHostClientInfo.js";
import { McpAuthRequiredReason, McpServerStatus } from "../../common/state/protocol/channels-session/state.js";
import { CopilotSlashCommandProvider } from "./copilotSlashCommandProvider.js";
import { createCopilotFailureCorrelation, reportCopilotModelCallFailure, reportCopilotSdkSessionError } from "./copilotFailureTelemetry.js";
import { reportCopilotTodoStoreOperation } from "./copilotTodoStoreTelemetry.js";
function isCopilotSdkAuthRejection(error) {
  return (error.errorType === "authentication" || error.errorType === "authorization") && error.statusCode === 401;
}
const SESSION_STATE_DIRECTORY = "session-state";
const EMPTY_TOOL_RESULT_TEXT = "<empty />";
const USER_DENIED_PERMISSION_RESULT = { kind: "reject", feedback: "The user denied permission." };
function isPermissionDeniedKind(kind) {
  switch (kind) {
    case "cancelled":
    case "denied-by-rules":
    case "denied-no-approval-rule-and-could-not-request-from-user":
    case "denied-interactively-by-user":
    case "denied-by-content-exclusion-policy":
    case "denied-by-permission-request-hook":
      return true;
    default:
      return false;
  }
}
function mapPermissionResultToConfirmKind(kind, resolvedByHook) {
  if (kind === void 0) {
    return "confirmationNotNeeded";
  }
  if (isPermissionDeniedKind(kind)) {
    return "denied";
  }
  if (kind === "approved-for-session" || kind === "approved-for-location") {
    return "setting";
  }
  return resolvedByHook ? "confirmationNotNeeded" : "userAction";
}
function normalizeMcpServerUrl(value) {
  if (!URL.canParse(value)) {
    return void 0;
  }
  const url = new URL(value);
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href;
}
function getEmptyToolResultText(binaryResults) {
  if (!binaryResults?.length) {
    return EMPTY_TOOL_RESULT_TEXT;
  }
  const hasImage = binaryResults.some((result) => result.type === "image");
  const hasFile = binaryResults.some((result) => result.type === "resource");
  if (hasImage && hasFile) {
    return "Tool produced the attached image and file";
  }
  if (hasImage) {
    return "Tool produced the attached image";
  }
  return "Tool produced the attached file";
}
function getPlanActionDescription(actionId) {
  switch (actionId) {
    case "autopilot":
      return {
        label: localize("agentHost.planReview.autopilot.label", "Implement with Autopilot"),
        description: localize("agentHost.planReview.autopilot.description", "Continue autonomously until done, using the selected approval level.")
      };
    case "autopilot_fleet":
      return {
        label: localize("agentHost.planReview.autopilotFleet.label", "Implement with Autopilot Fleet"),
        description: localize("agentHost.planReview.autopilotFleet.description", "Continue autonomously with fleet management, using the selected approval level.")
      };
    case "interactive":
      return {
        label: localize("agentHost.planReview.interactive.label", "Implement Plan"),
        description: localize("agentHost.planReview.interactive.description", "Implement the plan, asking for input and approval for each action.")
      };
    case "exit_only":
      return {
        label: localize("agentHost.planReview.exitOnly.label", "Approve Plan Only"),
        description: localize("agentHost.planReview.exitOnly.description", "Approve the plan without executing it. I will implement it myself.")
      };
    default:
      return void 0;
  }
}
function getToolCommand(input) {
  const command = isObject(input.toolArgs) ? Reflect.get(input.toolArgs, "command") : void 0;
  return isString(command) ? command : void 0;
}
function toCopilotSdkMode(mode) {
  mode = mode?.toLowerCase() === "goal" ? "plan" : mode;
  switch (mode) {
    case "interactive":
    case "plan":
    case "autopilot":
      return mode;
    default:
      return void 0;
  }
}
function elicitationFieldToQuestion(fieldName, field, required) {
  const base = {
    id: fieldName,
    title: field.title ?? fieldName,
    message: field.description ?? field.title ?? fieldName,
    required
  };
  switch (field.type) {
    case "boolean":
      return { ...base, kind: ChatInputQuestionKind.Boolean, defaultValue: field.default };
    case "integer":
    case "number":
      return {
        ...base,
        kind: field.type === "integer" ? ChatInputQuestionKind.Integer : ChatInputQuestionKind.Number,
        min: field.minimum,
        max: field.maximum,
        defaultValue: field.default
      };
    case "array": {
      const options = hasKey(field.items, { enum: true }) ? field.items.enum.map((value) => ({ id: value, label: value })) : field.items.anyOf.map((option) => ({ id: option.const, label: option.title }));
      return {
        ...base,
        kind: ChatInputQuestionKind.MultiSelect,
        options,
        min: field.minItems,
        max: field.maxItems
      };
    }
    case "string": {
      if (hasKey(field, { enum: true })) {
        const enumNames = field.enumNames;
        const options = field.enum.map((value, idx) => ({ id: value, label: enumNames?.[idx] ?? value }));
        return { ...base, kind: ChatInputQuestionKind.SingleSelect, options };
      }
      if (hasKey(field, { oneOf: true })) {
        const options = field.oneOf.map((option) => ({ id: option.const, label: option.title }));
        return { ...base, kind: ChatInputQuestionKind.SingleSelect, options };
      }
      return {
        ...base,
        kind: ChatInputQuestionKind.Text,
        format: field.format,
        min: field.minLength,
        max: field.maxLength,
        defaultValue: field.default
      };
    }
  }
}
function elicitationAnswerToFieldValue(field, answer) {
  if (!answer || answer.state === ChatInputAnswerState.Skipped) {
    return void 0;
  }
  const value = answer.value;
  if (field.type === "boolean") {
    if (value.kind === ChatInputAnswerValueKind.Boolean) {
      return value.value;
    }
    if (value.kind === ChatInputAnswerValueKind.Text) {
      if (value.value === "true") {
        return true;
      }
      if (value.value === "false") {
        return false;
      }
      return void 0;
    }
    return void 0;
  }
  if (field.type === "number" || field.type === "integer") {
    if (value.kind === ChatInputAnswerValueKind.Number) {
      return field.type === "integer" ? Math.trunc(value.value) : value.value;
    }
    if (value.kind === ChatInputAnswerValueKind.Text) {
      if (value.value.trim() === "") {
        return void 0;
      }
      const n = Number(value.value);
      return Number.isFinite(n) ? field.type === "integer" ? Math.trunc(n) : n : void 0;
    }
    return void 0;
  }
  if (field.type === "array") {
    if (value.kind === ChatInputAnswerValueKind.SelectedMany) {
      return [...value.value, ...value.freeformValues ?? []];
    }
    if (value.kind === ChatInputAnswerValueKind.Selected) {
      return value.value ? [value.value, ...value.freeformValues ?? []] : [...value.freeformValues ?? []];
    }
    if (value.kind === ChatInputAnswerValueKind.Text) {
      return value.value ? [value.value] : [];
    }
    return void 0;
  }
  if (value.kind === ChatInputAnswerValueKind.Text) {
    return value.value;
  }
  if (value.kind === ChatInputAnswerValueKind.Selected) {
    return value.value;
  }
  return void 0;
}
function getCopilotCLISessionStateDir(userHome) {
  return join(getCopilotHomePath(userHome, process.env), SESSION_STATE_DIRECTORY);
}
function isCopilotSdkToolOutputTempFile(filePath, tmpDir) {
  const fileUri = normalizePath(URI.file(filePath));
  const tmpDirUri = normalizePath(URI.file(tmpDir));
  const parentUri = normalizePath(URI.joinPath(fileUri, ".."));
  if (!extUriBiasedIgnorePathCase.isEqual(parentUri, tmpDirUri)) {
    return false;
  }
  return isCopilotSdkToolOutputFile(filePath);
}
class CopilotTurn {
  constructor(id, ordinal, senderClientId, clientContext) {
    this.id = id;
    this.ordinal = ordinal;
    this.senderClientId = senderClientId;
    this.clientContext = clientContext;
    this._state = "pending";
    this._stopWatch = StopWatch.create(false);
    /**
     * This turn's own Copilot cost in nano-AIU, summed from the `copilotUsage`
     * carried by the model calls the turn caused — its own, every subagent's,
     * and any compaction that ran mid-turn.
     *
     * Accumulated synchronously as each event arrives rather than derived from
     * the SDK's session-wide total: that total is read asynchronously, and the
     * terminal `session.idle` can close the turn while a read is in flight,
     * which would drop the turn's last model call from its reported cost.
     */
    this.copilotNanoAiu = 0;
    /**
     * Per-subagent component cost, in nano-AIU, keyed by `parentToolCallId`.
     * The SDK's session metrics are session-wide and carry no per-agent
     * breakdown, so a subagent's own running total is still accumulated from
     * its usage events in order to report it on the subagent's child session.
     */
    this.subagentNanoAiuByToolCallId = /* @__PURE__ */ new Map();
    /**
     * Whole-turn token consumption keyed by model id. Every model call in the
     * turn contributes — the parent agent's calls, every subagent's calls, and
     * the summarization call a compaction performs — so the totals describe what
     * the turn as a whole consumed rather than just its last call. Subagents may
     * run on a different model than the parent, hence the per-model keying.
     */
    this._tokenTotalsByModel = /* @__PURE__ */ new Map();
    /**
     * Current markdown response part IDs for this turn, keyed by
     * `parentToolCallId ?? ''`. Parent and subagent text stream through the
     * same SDK session but land in different AHP sessions, so their markdown
     * part state must not mask or append to each other.
     */
    this.markdownPartIds = /* @__PURE__ */ new Map();
    /** Current reasoning response part IDs for this turn, keyed by `parentToolCallId ?? ''`. */
    this.reasoningPartIds = /* @__PURE__ */ new Map();
    /**
     * Per-turn tool-call aggregate accumulated across the turn's `assistant.message` rounds (main
     * agent only), for the restricted `toolCallDetails` telemetry. `toolCounts` is keyed by tool name.
     */
    this.toolCounts = /* @__PURE__ */ new Map();
    this.toolCallRounds = 0;
    this.totalToolCalls = 0;
    this.parallelToolCallRounds = 0;
    this.parallelToolCallsTotal = 0;
    this.toolCallDetailsReported = false;
  }
  /**
   * Folds one model call's token counts into the turn's per-model totals.
   * Calls without a model id are ignored: they cannot be attributed, and every
   * usage-reporting path this session has carries one.
   */
  addTokenTotals(model, tokens) {
    if (!model) {
      return;
    }
    let total = this._tokenTotalsByModel.get(model);
    if (!total) {
      total = { model, inputTokens: 0, cachedTokens: 0, outputTokens: 0 };
      this._tokenTotalsByModel.set(model, total);
    }
    total.inputTokens += toTokenCount(tokens.inputTokens);
    total.cachedTokens += toTokenCount(tokens.cacheReadTokens);
    total.outputTokens += toTokenCount(tokens.outputTokens);
  }
  /**
   * The turn's per-model totals, or `undefined` when nothing has been recorded.
   * Rows are cloned: the map keeps mutating its own copies as further calls are
   * recorded, and an already-emitted or already-compared usage object must not
   * change retroactively underneath its consumers.
   */
  get tokenTotals() {
    return this._tokenTotalsByModel.size > 0 ? [...this._tokenTotalsByModel.values()].map((total) => ({ ...total })) : void 0;
  }
  get clientType() {
    return this.clientContext.clientType;
  }
  get state() {
    return this._state;
  }
  get isPending() {
    return this._state === "pending";
  }
  get isRunning() {
    return this._state === "running";
  }
  get duration() {
    return Math.max(0, this._stopWatch.elapsed());
  }
  /** Transition `pending → running` on the first SDK event. No-op once running/finished. */
  markRunning() {
    if (this._state === "pending") {
      this._state = "running";
    }
  }
  markCompleted() {
    this._state = "completed";
  }
  markAborted() {
    this._state = "aborted";
  }
}
let CopilotAgentSession = class extends Disposable {
  constructor(options, _instantiationService, _logService, _sessionDataService, _fileService, _environmentService, _configurationService, _customizationEnablementService, _promptCache, _telemetryService, _copilotApiService, _otelService) {
    super();
    this._instantiationService = _instantiationService;
    this._logService = _logService;
    this._sessionDataService = _sessionDataService;
    this._fileService = _fileService;
    this._environmentService = _environmentService;
    this._configurationService = _configurationService;
    this._customizationEnablementService = _customizationEnablementService;
    this._promptCache = _promptCache;
    this._telemetryService = _telemetryService;
    this._copilotApiService = _copilotApiService;
    this._otelService = _otelService;
    /** Tracks active tool invocations so we can produce past-tense messages on completion. */
    this._activeToolCalls = /* @__PURE__ */ new Map();
    this._streamingToolCalls = /* @__PURE__ */ new Map();
    this._streamingToolDisplaySchedulers = this._register(new DisposableMap());
    /**
     * Maps a subagent's stable `agentId` to its parent tool call id. Completion
     * ends the current subagent turn, but steering can start another turn with
     * the same id, so mappings live until session teardown.
     */
    this._parentToolCallIdsByAgentId = /* @__PURE__ */ new Map();
    this._activeSubagentAgentIds = /* @__PURE__ */ new Set();
    this._unroutableSubagentToolCallIds = /* @__PURE__ */ new Set();
    this._autoApprovals = /* @__PURE__ */ new Map();
    this._pendingAutoApprovals = new PendingRequestRegistry();
    /** Correlates tool execution with the SDK permission lifecycle for `chat.toolApproval` telemetry. */
    this._toolApprovalRecords = /* @__PURE__ */ new Map();
    /** Pending permission requests awaiting a renderer-side decision. */
    this._pendingPermissions = new PendingRequestRegistry();
    /** Cancels callbacks that began before or during an SDK abort. */
    this._abortCts = this._register(new MutableDisposable());
    /**
     * Signatures ({@link safeStringify}) of user-approved `read`/`write`
     * permission requests, keyed by tool call id. The Copilot CLI runtime emits
     * two identical `permission.requested` events for a single file read or
     * write (an internal `path` prompt followed by a `read`/`write` prompt), so
     * without this the user would be asked to approve the same operation twice
     * (issue #324477). An entry is single-use: it auto-approves exactly one
     * subsequent request that is byte-identical to the approved one, then is
     * removed, so approval never carries across a different tool call, a changed
     * path/diff/contents, or a different kind.
     */
    this._approvedDuplicablePermissionSignatures = /* @__PURE__ */ new Map();
    /** Pending user input requests awaiting a renderer-side answer. */
    this._pendingUserInputs = new PendingRequestRegistry();
    /**
     * Pending elicitation requests awaiting a renderer-side answer. Keyed
     * by request id; the schema is retained so the completion handler can
     * project the submitted {@link ChatInputAnswer}s back into the
     * SDK's {@link ElicitationResult.content} shape.
     */
    this._pendingElicitations = new PendingRequestRegistry();
    /**
     * Pending plan-review requests originating from the CLI's
     * `exitPlanMode.request` RPC. Tracked separately from
     * {@link _pendingUserInputs} so the completion handler can resolve the
     * RPC with a structured {@link CopilotExitPlanModeResponse} (which the CLI
     * forwards to `session.respondToExitPlanMode`) rather than feeding it
     * back through the SDK's `ask_user` callback.
     */
    this._pendingPlanReviews = new PendingRequestRegistry();
    /** Monotonic 0-based ordinal assigned to each turn as it starts, for numeric `turnIndex` telemetry parity. */
    this._nextTurnOrdinal = 0;
    /**
     * Latest session-wide nano-AIU total reported by the SDK's usage metrics
     * (`rpc.usage.getMetrics`), which is authoritative for what the session as a
     * whole has been billed: it folds in every model call plus compaction,
     * covers work billed while no turn was active, and survives resume.
     *
     * Deliberately *not* used to derive per-turn cost. It is session-scoped and
     * read asynchronously, so differencing it against a previous reading races
     * turn boundaries — the SDK's terminal `session.idle` can close a turn while
     * a read is still in flight. Per-turn cost comes from the synchronous
     * per-event `copilotUsage` instead (see {@link CopilotTurn.copilotNanoAiu}).
     */
    this._sessionTotalNanoAiu = 0;
    this._promptCacheRefreshGeneration = 0;
    /**
     * Serializes the metrics reads behind {@link _refreshSessionUsageMetrics}. Several
     * handlers refresh the total, so without this their RPCs overlap and an older
     * one resolving last would publish a session cost that visibly regresses. A
     * high-water mark cannot be used to reject stale reads instead, because the
     * total is legitimately non-monotonic (see the truncation note below). Keeping
     * one read in flight makes out-of-order resolution impossible, and coalesces
     * the redundant reads that a burst of usage events would otherwise issue.
     */
    this._sessionUsageMetricsRefreshThrottler = this._register(new Throttler());
    this._autoApprovalExperimentalModeEnabled = false;
    this._permissionModeSequencer = new Sequencer();
    this._mcpEnablementSequencer = new Sequencer();
    this._mcpServerLifecycleSequencer = new SequencerByKey();
    this._steeringMessagesInFlight = /* @__PURE__ */ new Set();
    /**
     * Steering messages that have been accepted by the SDK but not yet
     * surfaced to the chat UI as a separate user message. When the SDK
     * echoes a steering through a `user.message` event whose `content`
     * matches one of these entries, we finalize the in-flight turn and
     * dispatch a new {@link ActionType.ChatTurnStarted} whose
     * `userMessage` is the steering content. The reducer also removes
     * the pending steering via the action's `queuedMessageId`.
     *
     * Entries left here at abort/dispose time are flushed as
     * `steering_consumed` signals so the chat UI's pending state still
     * clears in cleanup paths where we never observe the echo.
     */
    this._pendingSteeringFlips = /* @__PURE__ */ new Map();
    /** Tool-search decision supplied by the launcher that built this SDK session. */
    this._toolSearchActive = false;
    /** Deferred promises for pending client tool calls, keyed by toolCallId. */
    this._pendingClientToolCalls = new PendingRequestRegistry();
    /** Pending SDK MCP auth handler promises, keyed by SDK auth request id. */
    this._pendingMcpAuthRequests = new PendingRequestRegistry();
    /** `pending-edit-content:` URIs written during permission requests, keyed
     *  by toolCallId. Cleaned up when the permission resolves or the session
     *  is disposed. */
    this._pendingEditContentUris = /* @__PURE__ */ new Map();
    /**
     * Fans MCP server notifications (today: `notifications/tools/list_changed`)
     * up to the agent and on to the protocol server. Fired by the
     * `onToolsUpdated` listener once per ready MCP channel.
     */
    this._onMcpNotification = this._register(new Emitter());
    this.onMcpNotification = this._onMcpNotification.event;
    this._onDidRequireAuth = this._register(new Emitter());
    this.onDidRequireAuth = this._onDidRequireAuth.event;
    /**
     * Pending MCP `sampling/createMessage` requests received over the
     * AHP `mcp://` channel, keyed by the cancellation handle we passed
     * into {@link rpc.mcp.executeSampling}. Tracked so that session
     * teardown can issue a best-effort
     * {@link rpc.mcp.cancelSamplingExecution} for each one instead of
     * leaving the SDK-side promise (and the upstream App) hanging.
     */
    this._pendingMcpSamplings = /* @__PURE__ */ new Set();
    /** Tracks whether a non-empty activity has been published, so we only emit a clear when needed. */
    this._hasActivity = false;
    /**
     * Last SDK-reported MCP status logged for each server (keyed by server
     * name). Used to suppress duplicate lifecycle log records when the SDK
     * re-reports an unchanged status — the `rpc.mcp.list` seed and the
     * `session.mcp_servers_loaded` event routinely carry the same snapshot.
     */
    this._lastLoggedMcpStatus = /* @__PURE__ */ new Map();
    this._abortCts.value = new CancellationTokenSource();
    this.sessionId = options.rawSessionId;
    this._ownerSessionUri = options.sessionUri;
    this.resourceUri = options.resource ?? options.sessionUri;
    this._slashCommandProvider = new CopilotSlashCommandProvider(() => this._wrapper.session.rpc.commands.list({ includeBuiltins: true, includeSkills: true, includeClientCommands: true }).then((c) => c.commands), this._logService);
    this._chatChannelUri = options.chatChannelUri;
    this._storageUri = this.resourceUri;
    this._onDidSessionProgress = options.onDidSessionProgress;
    this._sessionLauncher = options.sessionLauncher;
    this._launchPlan = options.launchPlan;
    this._isLaunchTokenStillCurrent = options.isLaunchTokenCurrent ?? (() => true);
    this._onTurnEnded = options.onTurnEnded ?? (() => {
    });
    this._shellManager = options.shellManager;
    this._nonPtyShellTerminals = this._register(this._instantiationService.createInstance(NonPtyShellTerminalStreams, options.sessionUri));
    this._workingDirectory = options.workingDirectory;
    this._customizationDirectory = options.customizationDirectory;
    this._serverToolHost = options.serverToolHost;
    this._hostCustomizations = options.hostCustomizations ?? (() => []);
    this._platform = options.platform ?? process.platform;
    this._telemetryReporter = new AgentHostTelemetryReporter(this._telemetryService);
    this._repoInfoTelemetry = this._register(this._instantiationService.createInstance(AgentHostRepoInfoTelemetry, this._telemetryReporter));
    this._appliedSnapshot = options.clientSnapshot ?? { tools: [], plugins: [], mcpServers: {} };
    this._appliedAdditionalDirectories = [...this._launchPlan.additionalDirectories ?? []];
    this._clientToolNames = clientToolNamesFromSnapshot(this._appliedSnapshot);
    this._activeClientToolSet = options.activeClientToolSet ?? new ActiveClientToolSet();
    this._clientReachesChat = options.clientReachesChat ?? (() => true);
    this._databaseRef = this._sessionDataService.openDatabase(this._storageUri);
    this._register(toDisposable(() => this._databaseRef.dispose()));
    this._editTracker = this._instantiationService.createInstance(
      FileEditTracker,
      this._storageUri.toString(),
      this._databaseRef.object
    );
    const pluginMcpServerSources = new Map((options.clientSnapshot?.plugins ?? []).flatMap((plugin) => {
      const sourceUri = plugin.sourceUri;
      return sourceUri === void 0 ? [] : plugin.mcpServers.map((server) => [server.name, sourceUri.toString()]);
    }));
    this._mcpCustomizations = this._register(this._instantiationService.createInstance(McpCustomizationController, {
      providerId: this.resourceUri.scheme,
      sessionId: this.sessionId,
      sessionUri: this.resourceUri,
      emit: (action) => this._emitAction(action),
      pluginMcpServerSources: () => pluginMcpServerSources,
      resolveEnablement: (server, owningPluginUri) => {
        const resolution = this._customizationEnablementService.resolve(this._ownerSessionUri.toString(), targetForMcpServer(server, owningPluginUri, false));
        return resolution.kind === "resolved" ? resolution.enablement : void 0;
      }
    }));
    this._register(toDisposable(() => this._cancelAllPendingInteractions()));
    this._register(toDisposable(() => this._shellManager?.dispose()));
    this._register(toDisposable(() => this._drainPendingSteeringFlips()));
    if (this._shellManager) {
      this._register(this._shellManager.onDidAssociateTerminal(({ toolCallId, terminalUri, displayName }) => {
        const tracked = this._activeToolCalls.get(toolCallId);
        if (!tracked) {
          return;
        }
        tracked.content.push({
          type: ToolResultContentType.Terminal,
          resource: terminalUri,
          title: displayName
        });
        this._emitAction({
          type: ActionType.ChatToolCallContentChanged,
          turnId: this._turnId,
          toolCallId,
          content: tracked.content
        });
      }));
    }
  }
  get ownerSessionUri() {
    return this._ownerSessionUri;
  }
  /** @deprecated Compatibility alias for SDK callbacks; this is the exact persistence resource. */
  get sessionUri() {
    return this.resourceUri;
  }
  get chatChannelUri() {
    return this._chatChannelUri;
  }
  bindChatChannel(chatChannelUri) {
    this._chatChannelUri = chatChannelUri;
  }
  /** Working directory this session operates in, if any. */
  get workingDirectory() {
    return this._workingDirectory;
  }
  /**
   * Protocol turn ID of the active turn, or `''` when idle. Used by file
   * edit tracking and emitted on per-turn actions.
   */
  get _turnId() {
    return this._currentTurn?.id ?? "";
  }
  /** 0-based ordinal of the active turn within the session, or `0` when idle. */
  get _turnOrdinal() {
    return this._currentTurn?.ordinal ?? 0;
  }
  /**
   * Whether the session currently has an in-flight turn. Used by
   * non-destructive idle release to avoid disconnecting mid-turn.
   */
  get hasActiveTurn() {
    return this._currentTurn !== void 0;
  }
  get chatUri() {
    return this._chatChannelUri;
  }
  get currentTurnId() {
    return this._currentTurn?.id;
  }
  get currentTurnClientType() {
    return this._currentTurn?.clientType ?? AgentHostClientType.Unknown;
  }
  get currentTurnClientContext() {
    return this._currentTurn?.clientContext;
  }
  get mcpServerStates() {
    return this._mcpCustomizations.runtimeStates;
  }
  // ---- AgentSignal helpers ------------------------------------------------
  /** Wraps a {@link SessionAction} in an {@link AgentSignal} envelope and emits it. */
  /** todo@connor4312: AHP is missing a chat activity update action which is needed to drop `SessionAction` here */
  _emitAction(action, parentToolCallId) {
    this._onDidSessionProgress.fire({
      kind: "action",
      resource: isChatAction(action) ? this._chatChannelUri : this._ownerSessionUri,
      action,
      parentToolCallId
    });
  }
  /**
   * Promotes a pending steering message into its own protocol turn:
   * closes the in-flight turn (so its responseParts settle into history)
   * and dispatches {@link ActionType.ChatTurnStarted} for a fresh
   * turn whose user message is the steering content. The action's
   * `queuedMessageId` atomically clears the corresponding pending
   * steering message from the session state.
   *
   * All subsequent SDK events (message deltas, tool calls, …) emitted
   * by the agent now reference the new `_turnId`, so the steering
   * response lands in the new turn rather than being folded into the
   * original.
   *
   * Returns the new turn id so callers (notably the `user.message`
   * handler) can associate the SDK event id with the steering turn for
   * history.truncate / sessions.fork mapping.
   */
  _beginSteeringTurn(steering) {
    this._completeActiveTurn();
    const newTurnId = generateUuid();
    this._emitAction({
      type: ActionType.ChatTurnStarted,
      turnId: newTurnId,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      message: steering.message,
      queuedMessageId: steering.id
    });
    this.resetTurnState(newTurnId);
    if (this._currentTurn) {
      this._currentTurn.messageCharLen = steering.message.text.length;
      this._currentTurn.markRunning();
    }
    return newTurnId;
  }
  /**
   * Drains any steering messages we acknowledged to the SDK but never
   * promoted to their own turn (e.g. on abort or session dispose). Fires
   * `steering_consumed` so the chat UI removes the lingering pending
   * steering bubble even when no fresh `user.message` arrives.
   */
  _drainPendingSteeringFlips() {
    if (this._pendingSteeringFlips.size === 0) {
      return;
    }
    const ids = [...this._pendingSteeringFlips.keys()];
    this._pendingSteeringFlips.clear();
    for (const id of ids) {
      this._onDidSessionProgress.fire({
        kind: "steering_consumed",
        chat: this._chatChannelUri,
        id
      });
    }
  }
  /**
   * Pops the buffered steering message whose text matches the SDK
   * `user.message` content we just observed. Matching by content (rather
   * than just popping FIFO) keeps us robust against the SDK reordering
   * or coalescing entries — concurrent steering messages with different
   * texts are still matched to the correct one. Returns `undefined` if
   * no buffered entry matches; the caller treats the `user.message` as
   * an ordinary echo and skips the turn flip.
   */
  _takeMatchingPendingSteering(content) {
    if (this._pendingSteeringFlips.size === 0) {
      return void 0;
    }
    for (const [id, msg] of this._pendingSteeringFlips) {
      if (msg.message.text === content) {
        this._pendingSteeringFlips.delete(id);
        return msg;
      }
    }
    return void 0;
  }
  _parentToolCallIdForSubagentEvent(e) {
    return e.agentId ? this._parentToolCallIdsByAgentId.get(e.agentId) : void 0;
  }
  _resumeSubagentForEvent(e, message) {
    if (!e.agentId || this._activeSubagentAgentIds.has(e.agentId)) {
      return;
    }
    const parentToolCallId = this._parentToolCallIdsByAgentId.get(e.agentId);
    if (!parentToolCallId) {
      return;
    }
    this._activeSubagentAgentIds.add(e.agentId);
    this._onDidSessionProgress.fire({
      kind: "subagent_resumed",
      chat: this._chatChannelUri,
      toolCallId: parentToolCallId,
      message
    });
  }
  _completeSubagentTurn(agentId, toolCallId) {
    if (agentId) {
      if (!this._activeSubagentAgentIds.delete(agentId)) {
        return;
      }
    } else if (!toolCallId) {
      return;
    }
    const parentToolCallId = toolCallId ?? (agentId ? this._parentToolCallIdsByAgentId.get(agentId) : void 0);
    if (!parentToolCallId) {
      return;
    }
    this._onDidSessionProgress.fire({
      kind: "subagent_completed",
      chat: this._chatChannelUri,
      toolCallId: parentToolCallId
    });
  }
  _shouldDropUnmappedSubagentEvent(e, eventName) {
    const parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
    if (!parentToolCallId && e.agentId) {
      this._logService.warn(`[Copilot:${this.sessionId}] Dropping ${eventName} for unknown subagent agentId=${e.agentId}`);
      return true;
    }
    return false;
  }
  /** Resolves the owning client for a chat-scoped tool call, honoring host-published chat membership. */
  _resolveClientToolOwner(toolName) {
    const chat = this._chatChannelUri;
    const provides = (clientId) => this._activeClientToolSet.get(clientId).some((tool) => tool.name === toolName);
    const preferred = this._currentTurn?.senderClientId;
    if (preferred && this._clientReachesChat(preferred, chat) && provides(preferred)) {
      return preferred;
    }
    for (const clientId of this._activeClientToolSet.clientIds()) {
      if (this._clientReachesChat(clientId, chat) && provides(clientId)) {
        return clientId;
      }
    }
    return void 0;
  }
  _getToolCallContributor(toolName, mcpServerName) {
    const clientToolName = this._clientToolName(toolName);
    if (this._clientToolNames.has(clientToolName)) {
      const clientId = this._resolveClientToolOwner(clientToolName);
      return clientId ? { kind: ToolCallContributorKind.Client, clientId } : void 0;
    }
    if (mcpServerName) {
      const customizationId = this._mcpCustomizations.customizationIdForServer(mcpServerName);
      return customizationId ? { kind: ToolCallContributorKind.MCP, customizationId } : void 0;
    }
    return void 0;
  }
  _createToolCallMeta(toolName, parameters) {
    const toolKind = getToolKind(toolName, parameters);
    const subagentMeta = toolKind === "subagent" ? getSubagentMetadata(parameters) : void 0;
    return {
      toolKind,
      language: toolKind === "terminal" ? getShellLanguage(toolName) : void 0,
      subagentDescription: subagentMeta?.description,
      subagentAgentName: subagentMeta?.agentName
    };
  }
  _getStreamingToolCallDisplay(toolName, input) {
    const partialInput = parseCopilotStreamingToolInput(input);
    const parameters = partialInput !== null && typeof partialInput === "object" && !Array.isArray(partialInput) ? partialInput : void 0;
    return {
      parameters,
      meta: this._createToolCallMeta(toolName, parameters),
      invocationMessage: getStreamingInvocationMessage(toolName, getToolDisplayName(toolName), partialInput, (path) => this._resolveEditFilePath(path))
    };
  }
  _emitStreamingToolCallDisplay(toolCallId, streaming) {
    if (!streaming.toolName) {
      return;
    }
    const display = this._getStreamingToolCallDisplay(streaming.toolName, streaming.input);
    streaming.displayedInputLength = streaming.input.length;
    const message = streamingToolDisplayText(display.invocationMessage);
    if (message === streaming.displayedMessage) {
      return;
    }
    streaming.displayedMessage = message;
    this._emitAction({
      type: ActionType.ChatToolCallDelta,
      turnId: this._turnId,
      toolCallId,
      content: "",
      invocationMessage: display.invocationMessage,
      _meta: toToolCallMeta(display.meta)
    }, streaming.parentToolCallId);
  }
  _scheduleStreamingToolCallDisplay(toolCallId) {
    let scheduler = this._streamingToolDisplaySchedulers.get(toolCallId);
    if (!scheduler) {
      scheduler = new RunOnceScheduler(() => {
        const streaming = this._streamingToolCalls.get(toolCallId);
        if (!streaming?.started || !streaming.toolName) {
          return;
        }
        if (streaming.displayedInputLength === streaming.input.length) {
          return;
        }
        this._emitStreamingToolCallDisplay(toolCallId, streaming);
      }, STREAMING_TOOL_DISPLAY_INTERVAL_MS);
      this._streamingToolDisplaySchedulers.set(toolCallId, scheduler);
    }
    if (!scheduler.isScheduled()) {
      scheduler.schedule();
    }
  }
  _beginToolCallRound(parentToolCallId) {
    const scope = parentToolCallId ?? "";
    this._currentTurn?.markdownPartIds.delete(scope);
    this._currentTurn?.reasoningPartIds.delete(scope);
  }
  /**
   * Starts a fresh `pending` turn, discarding any per-turn streaming state
   * from a previous turn so the next text/reasoning chunk allocates a new
   * response part. The turn becomes `running` on the first SDK event.
   */
  resetTurnState(turnId, senderClientId, clientType = AgentHostClientType.Unknown, clientContext = createUnknownAgentHostClientTelemetryContext(clientType)) {
    this._streamingToolCalls.clear();
    this._streamingToolDisplaySchedulers.clearAndDisposeAll();
    this._currentTurn = new CopilotTurn(turnId, this._nextTurnOrdinal++, senderClientId, clientContext);
  }
  /** Refreshes prompt-cache state and the session-wide nano-AIU total from the SDK's authoritative usage metrics. */
  async _refreshSessionUsageMetrics() {
    try {
      return await this._sessionUsageMetricsRefreshThrottler.queue(async () => {
        const promptCacheRefreshGeneration = this._promptCacheRefreshGeneration;
        const metrics = await this._wrapper.session.rpc.usage.getMetrics();
        const modelId = metrics.currentModel;
        if (!this._store.isDisposed && modelId && promptCacheRefreshGeneration === this._promptCacheRefreshGeneration) {
          const cacheExpiresAt = metrics.modelMetrics[modelId]?.cacheExpiresAt;
          this._setPromptCacheState(cacheExpiresAt ? { modelId, cacheExpiresAt } : void 0);
        }
        const total = metrics.totalNanoAiu;
        if (typeof total !== "number" || !Number.isFinite(total) || total < 0 || total === this._sessionTotalNanoAiu) {
          return false;
        }
        this._sessionTotalNanoAiu = total;
        return true;
      });
    } catch (err) {
      this._logService.trace(`[Copilot:${this.sessionId}] usage.getMetrics RPC failed: ${getErrorMessage(err)}`);
      return false;
    }
  }
  /**
   * The parent-scope Copilot billing metadata for the active turn: the turn's
   * own accumulated cost plus the SDK's session-wide total. Absent until
   * something has actually been billed.
   */
  _parentCopilotUsageMeta() {
    const turnNanoAiu = this._currentTurn?.copilotNanoAiu ?? 0;
    if (!turnNanoAiu && !this._sessionTotalNanoAiu) {
      return void 0;
    }
    return {
      ...turnNanoAiu ? { totalNanoAiu: turnNanoAiu } : {},
      ...this._sessionTotalNanoAiu ? { sessionTotalNanoAiu: this._sessionTotalNanoAiu } : {}
    };
  }
  /** Reads the SDK's per-source context-window attribution, or `undefined` when unavailable. */
  async _readContextAttribution() {
    let attribution;
    try {
      attribution = (await this._wrapper.session.rpc.metadata.getContextAttribution())?.contextAttribution ?? void 0;
    } catch (err) {
      this._logService.trace(`[Copilot:${this.sessionId}] contextAttribution RPC failed: ${getErrorMessage(err)}`);
      return void 0;
    }
    if (!attribution) {
      this._logService.trace(`[Copilot:${this.sessionId}] contextAttribution: null/empty`);
      return void 0;
    }
    if (this._logService.getLevel() <= LogLevel.Trace) {
      this._logService.trace(`[Copilot:${this.sessionId}] contextAttribution: totalTokens=${attribution.totalTokens}, entries=${JSON.stringify(attribution.entries.map((e) => ({ kind: e.kind, id: e.id, label: e.label, tokens: e.tokens, parentId: e.parentId })))}`);
    }
    return attribution;
  }
  _completeActiveTurn() {
    const turn = this._currentTurn;
    if (!turn) {
      return;
    }
    turn.markCompleted();
    this._reportToolCallDetails(turn, "success");
    this._emitAction({
      type: ActionType.ChatTurnComplete,
      turnId: turn.id,
      duration: turn.duration
    });
    this._clearActiveTurn();
  }
  failActiveTurn(error) {
    const turn = this._currentTurn;
    if (!turn) {
      return void 0;
    }
    this._reportToolCallDetails(turn, "failed");
    this._emitAction({
      type: ActionType.ChatError,
      turnId: turn.id,
      duration: turn.duration,
      error
    });
    this._clearActiveTurn();
    return turn.id;
  }
  discardActiveTurn() {
    if (this._currentTurn) {
      this._clearActiveTurn();
    }
  }
  /**
   * Drops the active turn and reports that this chat is now idle. Every
   * transition out of an in-flight turn must go through here so work the
   * agent defers while a turn runs — notably a pending CLI client restart —
   * is not stranded waiting on a turn that already ended.
   */
  _clearActiveTurn() {
    this._currentTurn = void 0;
    this._streamingToolCalls.clear();
    this._streamingToolDisplaySchedulers.clearAndDisposeAll();
    try {
      this._onTurnEnded();
    } catch (err) {
      this._logService.error(err, `[Copilot:${this.sessionId}] onTurnEnded callback failed`);
    }
  }
  _reportToolCallDetails(turn, responseType) {
    if (turn.toolCallDetailsReported) {
      return;
    }
    turn.toolCallDetailsReported = true;
    void this._telemetryReporter.toolCallDetails({
      clientContext: turn.clientContext,
      provider: "copilot",
      session: this.resourceUri.toString(),
      turnId: turn.id,
      clientType: turn.clientType,
      model: turn.lastModel,
      responseType,
      toolCounts: Object.fromEntries(turn.toolCounts),
      availableTools: this._appliedSnapshot.tools.map((tool) => tool.name),
      numRequests: turn.toolCallRounds,
      turnIndex: turn.ordinal,
      turnDuration: turn.duration,
      messageCharLen: turn.messageCharLen,
      totalToolCalls: turn.totalToolCalls,
      parallelToolCallRounds: turn.parallelToolCallRounds,
      parallelToolCallsTotal: turn.parallelToolCallsTotal
    }).catch((err) => this._logService.trace(`[Copilot:${this.sessionId}] Telemetry emission failed: ${getErrorMessage(err)}`));
  }
  _reportToolApproval(toolCallId, toolName, mcpServerName) {
    const record = this._toolApprovalRecords.get(toolCallId);
    if (!toolName || isHiddenTool(toolName) || record?.reported) {
      return;
    }
    const confirmKind = mapPermissionResultToConfirmKind(record?.resultKind, record?.resolvedByHook === true);
    this._telemetryReporter.toolApproval({
      clientContext: this._currentTurn?.clientContext,
      provider: "copilot",
      session: this.resourceUri.toString(),
      turnId: this._turnId,
      toolId: toolName,
      toolSourceKind: this._toolSourceKindFor(toolName, mcpServerName),
      confirmKind,
      confirmationNotNeededReason: confirmKind === "confirmationNotNeeded" && record?.resolvedByHook ? "other" : void 0,
      requestUnsandboxedExecution: record?.requestSandboxBypass ? true : void 0
    });
    if (record) {
      record.reported = true;
    }
  }
  _reportToolApprovalIfNoPermission(toolCallId) {
    const record = this._toolApprovalRecords.get(toolCallId);
    if (record && !record.permissionRequested) {
      this._reportToolApproval(toolCallId, record.toolName, record.mcpServerName);
    }
  }
  _toolSourceKindFor(toolName, mcpServerName) {
    if (mcpServerName) {
      return "mcp";
    }
    if (this._clientToolNames.has(this._clientToolName(toolName))) {
      return "client";
    }
    return "internal";
  }
  _getEditFilePaths(parameters) {
    return getEditFilePaths(parameters).map((path) => this._resolveEditFilePath(path));
  }
  _resolveEditFilePath(path) {
    if (isAbsolute(path) || !this._workingDirectory || this._workingDirectory.scheme !== Schemas.file) {
      return path;
    }
    return join(this._workingDirectory.fsPath, path);
  }
  /**
   * Emits a synthetic markdown content block for the active turn and
   * makes it the current markdown response part so that subsequent SDK
   * deltas append to it. Used by the agent to surface one-shot host
   * messages (e.g. the worktree-created announcement) at the top of the
   * first response.
   */
  emitInitialMarkdown(content) {
    this._emitMarkdownDelta(content);
  }
  /**
   * Emits a streaming text delta. The first delta of a turn allocates a
   * markdown response part; subsequent deltas append to it.
   */
  _emitMarkdownDelta(content, parentToolCallId) {
    const turn = this._currentTurn;
    if (!turn) {
      this._logService.error(`[Copilot:${this.sessionId}] Markdown delta emitted with no active turn; dropping`);
      return;
    }
    const markdownScope = parentToolCallId ?? "";
    let partId = turn.markdownPartIds.get(markdownScope);
    if (!partId) {
      partId = generateUuid();
      turn.markdownPartIds.set(markdownScope, partId);
      this._emitAction({
        type: ActionType.ChatResponsePart,
        turnId: turn.id,
        part: { kind: ResponsePartKind.Markdown, id: partId, content }
      }, parentToolCallId);
      return;
    }
    this._emitAction({
      type: ActionType.ChatDelta,
      turnId: turn.id,
      partId,
      content
    }, parentToolCallId);
  }
  /** Emits a reasoning delta, similar to {@link _emitMarkdownDelta} but for reasoning parts. */
  _emitReasoningDelta(content, parentToolCallId) {
    const turn = this._currentTurn;
    if (!turn) {
      this._logService.error(`[Copilot:${this.sessionId}] Reasoning delta emitted with no active turn; dropping`);
      return;
    }
    const reasoningScope = parentToolCallId ?? "";
    let partId = turn.reasoningPartIds.get(reasoningScope);
    if (!partId) {
      partId = generateUuid();
      turn.reasoningPartIds.set(reasoningScope, partId);
      this._emitAction({
        type: ActionType.ChatResponsePart,
        turnId: turn.id,
        part: { kind: ResponsePartKind.Reasoning, id: partId, content }
      }, parentToolCallId);
      return;
    }
    this._emitAction({
      type: ActionType.ChatReasoning,
      turnId: turn.id,
      partId,
      content
    }, parentToolCallId);
  }
  /**
   * The snapshot of client contributions captured when this session was
   * created. Used by the agent to detect when the session is 1stale.
   */
  get appliedSnapshot() {
    return this._appliedSnapshot;
  }
  /**
   * Secondary roots granted when this live SDK session was created or resumed.
   * The primary process root is immutable and therefore excluded.
   */
  get appliedAdditionalDirectories() {
    return this._appliedAdditionalDirectories;
  }
  get customizationDirectory() {
    return this._customizationDirectory;
  }
  /**
   * Creates SDK {@link Tool} objects for the client-provided tools in the
   * applied snapshot. The handler parks a request in
   * {@link _pendingClientToolCalls} and waits for the client to dispatch
   * `session/toolCallComplete`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _createClientSdkTools(toolSearchActive) {
    this._toolSearchActive = toolSearchActive;
    const tools = this._appliedSnapshot.tools;
    if (tools.length === 0) {
      return [];
    }
    const sessionTools = toolSearchActive ? tools : tools.filter((def) => def.name !== CLIENT_TOOL_SEARCH_REFERENCE_NAME);
    return sessionTools.map((def) => {
      if (toolSearchActive && def.name === CLIENT_TOOL_SEARCH_REFERENCE_NAME) {
        return {
          name: RUNTIME_TOOL_SEARCH_TOOL_NAME,
          description: def.description ?? "",
          parameters: def.inputSchema ?? { type: "object", properties: {} },
          overridesBuiltInTool: true,
          defer: "never",
          skipPermission: true,
          handler: this._guarded(async (_args, invocation) => {
            try {
              const candidates = this._toToolSearchCandidates(invocation.availableTools);
              const clientResult = await this._pendingClientToolCalls.registerAndFire(
                invocation.toolCallId,
                () => this._emitToolSearchReady(invocation.toolCallId, candidates)
              );
              return this._toToolSearchResult(clientResult, invocation.availableTools);
            } catch (error) {
              this._logService.error(error, `[Copilot:${this.sessionId}] Failed in tool-search handler: toolCallId=${invocation.toolCallId}`);
              return this._toolSearchFailure(getErrorMessage(error));
            }
          }, this._toolSearchFailure("Tool call cancelled: session is aborting"), "tool-search")
        };
      }
      const defer = toolSearchActive ? NON_DEFERRED_CLIENT_TOOL_NAMES.has(def.name) ? "never" : "auto" : void 0;
      return {
        name: def.name,
        description: def.description ?? "",
        parameters: def.inputSchema ?? { type: "object", properties: {} },
        defer,
        handler: this._guarded(async (_args, { toolCallId }) => {
          try {
            return await this._pendingClientToolCalls.register(toolCallId);
          } catch (error) {
            this._logService.error(error, `[Copilot:${this.sessionId}] Failed in client tool handler: tool=${def.name}, toolCallId=${toolCallId}`);
            throw error;
          }
        }, this._toolSearchFailure("Tool call cancelled: session is aborting"), "client-tool")
      };
    });
  }
  _isToolSearchActive() {
    return this._toolSearchActive;
  }
  get _abortToken() {
    return this._abortCts.value?.token ?? CancellationToken.Cancelled;
  }
  _beginAbort() {
    if (this._abortToken.isCancellationRequested) {
      return;
    }
    this._abortCts.value?.cancel();
    this._cancelAllPendingInteractions();
  }
  _resetAbortToken() {
    this._abortCts.value = new CancellationTokenSource();
  }
  /**
   * Guards SDK callbacks against aborts: the synchronous pre-check avoids the `shortcutEvent` macrotask for already-cancelled tokens, while the race releases callbacks that park after the abort sweep.
   * The post-race check catches handler completions that win the cancellation macrotask because promise continuations run as microtasks.
   */
  _guarded(handler, cancelled, label) {
    return async (...args) => {
      const token = this._abortToken;
      if (token.isCancellationRequested) {
        this._logService.info(`[Copilot:${this.sessionId}] Discarding ${label} callback received while aborting`);
        return cancelled;
      }
      const result = await raceCancellation(handler(...args), token, cancelled);
      if (token.isCancellationRequested) {
        this._logService.info(`[Copilot:${this.sessionId}] Discarding ${label} callback result after abort`);
        return cancelled;
      }
      return result;
    };
  }
  _clientToolName(toolName) {
    return this._isToolSearchActive() && toolName === RUNTIME_TOOL_SEARCH_TOOL_NAME ? CLIENT_TOOL_SEARCH_REFERENCE_NAME : toolName;
  }
  _toToolSearchCandidates(availableTools) {
    return (availableTools ?? []).filter((tool) => tool.deferLoading).map((tool) => ({
      name: tool.name,
      description: tool.description ?? ""
    }));
  }
  _emitToolSearchReady(toolCallId, candidates) {
    const tracked = this._activeToolCalls.get(toolCallId);
    if (!tracked) {
      throw new Error(`Tool-search call '${toolCallId}' was not tracked.`);
    }
    this._emitAction({
      type: ActionType.ChatToolCallReady,
      turnId: this._turnId,
      toolCallId,
      ...tracked.contributor ? { contributor: tracked.contributor } : {},
      ...tracked.intention !== void 0 ? { intention: tracked.intention } : {},
      invocationMessage: getInvocationMessage(tracked.toolName, tracked.displayName, tracked.parameters, (path) => this._resolveEditFilePath(path)),
      toolInput: getToolInputString(tracked.toolName, tracked.parameters, tracked.parameters ? tryStringify(tracked.parameters) : void 0),
      confirmed: ToolCallConfirmationReason.NotNeeded,
      _meta: toToolCallMeta({ ...tracked.meta ?? {}, toolSearchCandidates: candidates })
    }, tracked.parentToolCallId);
  }
  _toolSearchFailure(message) {
    return { textResultForLlm: message, resultType: "failure", error: message, toolReferences: [] };
  }
  _toToolSearchResult(clientResult, availableTools) {
    const deferred = /* @__PURE__ */ new Map();
    for (const tool of availableTools ?? []) {
      if (tool.deferLoading) {
        deferred.set(tool.name, tool.name);
        if (tool.namespacedName) {
          deferred.set(tool.namespacedName, tool.name);
        }
      }
    }
    const parsedClientNames = this._parseToolSearchNames(clientResult.textResultForLlm);
    const clientNames = parsedClientNames ?? [];
    const toolReferences = [...new Set(clientNames.map((name) => deferred.get(name)).filter(isDefined))];
    this._logService.info(`[Copilot:${this.sessionId}] tool_search override: availableTools=${availableTools?.length ?? 0}, deferred=${deferred.size}, clientMatched=[${clientNames.join(", ")}] -> toolReferences=[${toolReferences.join(", ")}]`);
    return {
      ...clientResult,
      ...clientResult.resultType === "success" && parsedClientNames !== void 0 ? { textResultForLlm: JSON.stringify(toolReferences) } : {},
      toolReferences
    };
  }
  _parseToolSearchNames(text) {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed.filter((name) => typeof name === "string") : void 0;
    } catch {
      return void 0;
    }
  }
  /**
   * Builds SDK tool handlers for the agent host's server tools. Each handler
   * executes the tool against this session's state via the
   * {@link IAgentServerToolHost} and returns its textual result. Returns an
   * empty list when no server-tool host is wired (e.g. test / standalone
   * construction).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _createServerSdkTools() {
    const host = this._serverToolHost;
    if (!host) {
      return [];
    }
    return host.definitions.map((def) => ({
      name: def.name,
      description: def.description ?? "",
      parameters: def.inputSchema ?? { type: "object", properties: {} },
      defer: "never",
      handler: async (args) => {
        try {
          const text = host.executeTool(this._chatChannelUri.toString(), def.name, args);
          return { textResultForLlm: await text, resultType: "success" };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this._logService.error(error, `[Copilot:${this.sessionId}] Failed in server tool handler: tool=${def.name}`);
          return { textResultForLlm: message, resultType: "failure", error: message };
        }
      }
    }));
  }
  /**
   * Resolves a pending client tool call. If the SDK handler has not yet
   * registered for `toolCallId`, the result is buffered so the handler
   * resolves immediately once it does.
   */
  handleClientToolCallComplete(toolCallId, result) {
    this._approvedDuplicablePermissionSignatures.delete(toolCallId);
    if (!result.success && this._cancelMcpAuthenticationForToolCall(toolCallId)) {
      this._activeToolCalls.delete(toolCallId);
      return;
    }
    const textContent = result.content?.filter((c) => c.type === ToolResultContentType.Text).map((c) => c.text).join("\n") ?? "";
    const binaryResults = result.content?.filter((c) => c.type === ToolResultContentType.EmbeddedResource).map((c) => ({ data: c.data, mimeType: c.contentType, type: /^image(\/|$)/.test(c.contentType) ? "image" : "resource" }));
    const textResultForLlm = textContent.trim() ? textContent : getEmptyToolResultText(binaryResults);
    if (result.success) {
      this._pendingClientToolCalls.respondOrBuffer(toolCallId, {
        textResultForLlm,
        resultType: "success",
        binaryResultsForLlm: binaryResults?.length ? binaryResults : void 0
      });
    } else {
      this._pendingClientToolCalls.respondOrBuffer(toolCallId, {
        textResultForLlm: textContent.trim() ? textContent : result.error?.message || "Tool call failed",
        resultType: "failure",
        error: result.error?.message,
        binaryResultsForLlm: binaryResults?.length ? binaryResults : void 0
      });
    }
    if (this._pendingPermissions.getMetadata(toolCallId)?.managedApprovalRequired !== true) {
      this.respondToPermissionRequest(toolCallId, true);
    }
  }
  _cancelMcpAuthenticationForToolCall(toolCallId) {
    for (const [requestId, pending] of this._pendingMcpAuthRequests.entries()) {
      const toolCallIndex = pending.toolCalls.findIndex((toolCall) => toolCall.toolCallId === toolCallId);
      if (toolCallIndex === -1) {
        continue;
      }
      pending.toolCalls.splice(toolCallIndex, 1);
      if (pending.toolCalls.length === 0) {
        this._pendingMcpAuthRequests.respond(requestId, { kind: "cancelled" });
      }
      return true;
    }
    return false;
  }
  /**
   * Creates (or resumes) the SDK session via the injected launcher and
   * wires up all event listeners. Must be called exactly once after
   * construction before using the session.
   */
  async initializeSession() {
    await this._customizationEnablementService.initializeSession(this._ownerSessionUri.toString());
    const wrapper = await this._sessionLauncher.launch(this._launchPlan, this._createRuntimeAdapter());
    if (this._store.isDisposed) {
      wrapper.dispose();
      throw new CancellationError();
    }
    this._wrapper = this._register(wrapper);
    this._register(this._customizationEnablementService.onDidChange((event) => {
      if (!event.sessions.includes(this._ownerSessionUri.toString())) {
        return;
      }
      this._reconcileMcpServerEnablement().catch((error) => this._logService.error(error, `[Copilot:${this.sessionId}] Failed to reconcile MCP enablement after customizations changed`));
    }));
    this._subscribeToEvents();
    this._subscribeForLogging();
    this._subscribeForMemoInvalidation();
    this._subscribeForInstructionsCollectedTelemetry();
    this._subscribeToPermissionConfigChanges();
    this._promptCacheState = this._promptCache.read(this.resourceUri);
    if (this._launchPlan.kind === "resume") {
      await this._refreshSessionUsageMetrics();
      if (this._store.isDisposed) {
        throw new CancellationError();
      }
    }
    this._serverToolHost?.advertise(this._storageUri.toString());
  }
  /** Updates the GitHub credentials used by this live SDK session. */
  async updateGitHubCredentials(host, token) {
    return this._wrapper.session.rpc.gitHubAuth.setCredentials({
      credentials: { type: "token", host, token }
    });
  }
  _setPromptCacheState(promptCache) {
    this._promptCacheState = this._promptCache.write(this.resourceUri, promptCache);
  }
  _createRuntimeAdapter() {
    return {
      handlePermissionRequest: this._guarded((request) => this._handlePermissionRequest(request), { kind: "reject" }, "permission"),
      handleExitPlanModeRequest: this._guarded((request, invocation) => this._handleExitPlanModeRequest(request, invocation), { approved: false }, "exit-plan-mode"),
      handleUserInputRequest: this._guarded((request, invocation) => this._handleUserInputRequest(request, invocation), { answer: "", wasFreeform: true }, "user-input"),
      handleElicitationRequest: this._guarded((context) => this._handleElicitationRequest(context), { action: "cancel" }, "elicitation"),
      handleMcpAuthRequest: this._guarded((request) => this._handleMcpAuthRequest(request), { kind: "cancelled" }, "mcp-auth"),
      requestUnsandboxedCommandConfirmation: this._guarded((request) => this._requestUnsandboxedCommandConfirmation(request), false, "unsandboxed-command-confirmation"),
      createClientSdkTools: (toolSearchActive) => this._createClientSdkTools(toolSearchActive),
      createServerSdkTools: () => this._createServerSdkTools(),
      handlePreToolUse: (input) => this._handlePreToolUse(input),
      handlePostToolUse: (input) => this._handlePostToolUse(input),
      handleUserPromptSubmitted: () => this.handleUserPromptSubmitted()
    };
  }
  async resolveMcpAuthentication(params) {
    let resolved = false;
    for (const [requestId, pending] of this._pendingMcpAuthRequests.entries()) {
      if (pending.resource.resource !== params.resource || !this._scopesSatisfy(params.scopes, pending.requiredScopes)) {
        continue;
      }
      for (const toolCall of pending.toolCalls) {
        this._emitAction({
          type: ActionType.ChatToolCallAuthResolved,
          turnId: toolCall.turnId,
          toolCallId: toolCall.toolCallId
        }, toolCall.parentToolCallId);
      }
      resolved = this._pendingMcpAuthRequests.respond(requestId, { kind: "token", accessToken: params.token }) || resolved;
    }
    return resolved;
  }
  async _handleMcpAuthRequest(request) {
    const customizationId = this._mcpCustomizations.customizationIdForServer(request.serverName);
    const enablement = getSdkMcpServerEnablement(resolveCustomizationEnablement(
      this._customizationEnablementService,
      this._ownerSessionUri,
      this._hostCustomizations(),
      void 0,
      void 0,
      this._mcpCustomizations.pluginMcpServerSources
    ));
    if (customizationId !== void 0 && enablement.get(customizationId) === false) {
      this._logService.info(`[Copilot:${this.sessionId}] Suppressed authentication request from disabled MCP server '${request.serverName}'`);
      return null;
    }
    if (customizationId === void 0 || enablement.get(customizationId) === void 0) {
      this._logService.trace(`[Copilot:${this.sessionId}] Allowing authentication request from MCP server '${request.serverName}' without resolved enablement`);
    }
    const githubToken = request.reason === "initial" && this._scopesFromChallenge(request.wwwAuthenticateParams?.scope).length === 0 ? await this._initialGitHubMcpToken(request) : void 0;
    if (githubToken) {
      this._logService.info(`[Copilot:${this.sessionId}] Reusing the existing GitHub token for initial GitHub MCP authentication`);
      return { kind: "token", accessToken: githubToken };
    }
    const resource = this._protectedResourceFromMcpAuthRequest(request);
    const requiredScopes = this._scopesFromChallenge(request.wwwAuthenticateParams?.scope);
    const oauthClient = request.staticClientConfig?.publicClient ? { clientId: request.staticClientConfig.clientId } : request.staticClientConfig?.clientSecret ? { clientId: request.staticClientConfig.clientId, clientSecret: request.staticClientConfig.clientSecret } : void 0;
    const auth = {
      reason: this._mcpAuthRequiredReason(request.reason),
      ...oauthClient ? { oauthClient } : {},
      resource,
      requiredScopes: requiredScopes.length ? [...requiredScopes] : void 0,
      description: request.wwwAuthenticateParams?.error
    };
    const toolCalls = this._activeMcpToolCalls(request.serverName);
    const result = this._pendingMcpAuthRequests.register(request.requestId, {
      serverName: request.serverName,
      resource,
      requiredScopes,
      toolCalls
    });
    this._mcpCustomizations.applyOne({
      name: request.serverName,
      state: {
        kind: McpServerStatus.AuthRequired,
        ...auth
      }
    });
    for (const toolCall of toolCalls) {
      this._emitAction({
        type: ActionType.ChatToolCallAuthRequired,
        turnId: toolCall.turnId,
        toolCallId: toolCall.toolCallId,
        auth
      }, toolCall.parentToolCallId);
    }
    this._logService.info(`[Copilot:${this.sessionId}] MCP server '${request.serverName}' requires authentication for ${resource.resource}`);
    return result;
  }
  _activeMcpToolCalls(serverName) {
    if (!this._turnId) {
      return [];
    }
    const result = [];
    for (const [toolCallId, toolCall] of this._activeToolCalls) {
      if (toolCall.mcpServerName === serverName) {
        result.push({ turnId: this._turnId, toolCallId, parentToolCallId: toolCall.parentToolCallId });
      }
    }
    return result;
  }
  async _initialGitHubMcpToken(request) {
    const githubToken = this._launchPlan.githubToken;
    const requestUrl = normalizeMcpServerUrl(request.serverUrl);
    if (!githubToken || requestUrl === void 0) {
      return void 0;
    }
    const configuredUrls = [gitHubMcpServerUrl(void 0)];
    try {
      const resolvedUrl = gitHubMcpServerUrl(await this._copilotApiService.resolveApiEndpoint(githubToken));
      if (resolvedUrl) {
        configuredUrls.push(resolvedUrl);
      }
    } catch (error) {
      this._logService.warn(`[Copilot:${this.sessionId}] Failed to resolve the GitHub MCP server URL: ${getErrorMessage(error)}`);
      return void 0;
    }
    return configuredUrls.some((u) => u && requestUrl === normalizeMcpServerUrl(u)) ? githubToken : void 0;
  }
  _protectedResourceFromMcpAuthRequest(request) {
    if (request.resourceMetadata) {
      try {
        const parsed = JSON.parse(request.resourceMetadata);
        if (isAuthorizationProtectedResourceMetadata(parsed)) {
          return parsed;
        }
        this._logService.warn(`[Copilot:${this.sessionId}] Ignoring invalid MCP protected-resource metadata for '${request.serverName}'`);
      } catch (err) {
        this._logService.warn(`[Copilot:${this.sessionId}] Failed to parse MCP protected-resource metadata for '${request.serverName}'`, err);
      }
    }
    const scopes = this._scopesFromChallenge(request.wwwAuthenticateParams?.scope);
    return {
      resource: request.serverUrl,
      resource_name: request.serverName,
      scopes_supported: scopes.length ? scopes.slice() : void 0
    };
  }
  _scopesFromChallenge(scope) {
    return scope?.split(/\s+/).map((s) => s.trim()).filter((s) => s.length > 0) ?? [];
  }
  _mcpAuthRequiredReason(reason) {
    switch (reason) {
      case "refresh":
      case "reauth":
        return McpAuthRequiredReason.Expired;
      case "upscope":
        return McpAuthRequiredReason.InsufficientScope;
      case "initial":
      default:
        return McpAuthRequiredReason.Required;
    }
  }
  _scopesSatisfy(provided, required) {
    if (required.length === 0 || provided === void 0) {
      return true;
    }
    const providedSet = new Set(provided);
    return required.every((scope) => providedSet.has(scope));
  }
  _cancelPendingMcpAuthRequests() {
    this._pendingMcpAuthRequests.denyAll({ kind: "cancelled" });
  }
  _cancelPendingMcpAuthRequestsForServer(serverName) {
    for (const [requestId, pending] of this._pendingMcpAuthRequests.entries()) {
      if (pending.serverName !== serverName) {
        continue;
      }
      for (const toolCall of pending.toolCalls) {
        this._emitAction({
          type: ActionType.ChatToolCallAuthResolved,
          turnId: toolCall.turnId,
          toolCallId: toolCall.toolCallId
        }, toolCall.parentToolCallId);
      }
      this._pendingMcpAuthRequests.respond(requestId, { kind: "cancelled" });
    }
  }
  // ---- session operations -------------------------------------------------
  async send(prompt, attachments, turnId, mode, senderClientId, clientType = AgentHostClientType.Unknown, hostInstructions, clientContext = createUnknownAgentHostClientTelemetryContext(clientType)) {
    this._resetAbortToken();
    if (turnId && this._currentTurn?.id !== turnId) {
      this.resetTurnState(turnId, senderClientId, clientType, clientContext);
    }
    if (this._currentTurn) {
      this._currentTurn.messageCharLen = prompt.length;
    }
    const turn = this._currentTurn;
    this._hostInstructions = hostInstructions;
    try {
      await this._send(prompt, attachments, mode);
    } catch (err) {
      if (turn && this._currentTurn === turn) {
        this._clearActiveTurn();
      }
      this._hostInstructions = void 0;
      throw err;
    }
  }
  handleUserPromptSubmitted() {
    const additionalContext = this._hostInstructions?.join("\n\n");
    this._hostInstructions = void 0;
    return additionalContext ? { additionalContext } : void 0;
  }
  async _send(prompt, attachments, mode) {
    this._logService.info(`[Copilot:${this.sessionId}] sendMessage called: "${prompt.substring(0, 100)}${prompt.length > 100 ? "..." : ""}" (${attachments?.length ?? 0} attachments)`);
    const slashCommand = parseLeadingSlashCommand(prompt);
    if (slashCommand?.command === "compact") {
      try {
        const result = await this._wrapper.session.rpc.history.compact();
        const usedTokens = result.contextWindow?.currentTokens;
        if (typeof usedTokens === "number") {
          await this._refreshSessionUsageMetrics();
          const copilotUsage = this._parentCopilotUsageMeta();
          const turnTokenTotals = this._currentTurn?.tokenTotals;
          const meta = {
            ...copilotUsage ? { copilotUsage } : {},
            ...turnTokenTotals ? { turnTokenTotals } : {}
          };
          this._emitAction({
            type: ActionType.ChatUsage,
            turnId: this._turnId,
            usage: {
              inputTokens: usedTokens,
              outputTokens: 0,
              model: this._lastSeenModelId,
              ...Object.keys(meta).length > 0 ? { _meta: meta } : {}
            }
          });
        }
        this.emitInitialMarkdown(localize("copilotAgent.compactionCompleted", "Compaction completed"));
      } catch (err) {
        if (getErrorMessage(err).toLowerCase().includes("nothing to compact")) {
          this.emitInitialMarkdown(localize("copilotAgent.compactionCompleted", "Compaction completed"));
          this._completeActiveTurn();
          return;
        }
        this._logService.error(err, `[Copilot:${this.sessionId}] rpc.history.compact failed`);
        throw err;
      }
      this._completeActiveTurn();
      return;
    }
    const configAction = slashCommand ? resolveCopilotConfigSlashCommandOnSend(slashCommand.command, slashCommand.rawRest) : void 0;
    if (configAction) {
      const sdkMode = toCopilotSdkMode(configAction.applyConfig[SessionConfigKey.Mode]);
      if (sdkMode) {
        mode = sdkMode;
      }
      prompt = configAction.strippedPrompt;
    } else if (slashCommand) {
      const runtimeSlashCommand = await this._slashCommandProvider.resolveSlashCommand(slashCommand.command);
      if (runtimeSlashCommand && runtimeSlashCommand.kind !== "skill") {
        let result;
        try {
          result = await this._wrapper.session.rpc.commands.invoke({
            name: runtimeSlashCommand.name,
            ...slashCommand.rawRest.length > 0 ? { input: slashCommand.rawRest } : {}
          });
        } catch (err) {
          this._logService.error(err, `[Copilot:${this.sessionId}] rpc.commands.invoke(${slashCommand.command}) failed`);
          throw err;
        }
        switch (result.kind) {
          case "text":
            this._emitMarkdownDelta(result.markdown === true ? result.text : escapeMarkdownSyntaxTokens(result.text));
            break;
          case "completed":
            if (result.message) {
              this._emitMarkdownDelta(result.message);
            }
            break;
          case "agent-prompt": {
            const runtimeMode = toCopilotSdkMode(result.mode);
            if (runtimeMode) {
              mode = runtimeMode;
            }
            prompt = result.prompt;
            break;
          }
          case "select-subcommand":
            this._emitMarkdownDelta(localize(
              "copilotSlashCommand.selectSubcommandResult",
              "The /{0} command requires selecting a subcommand. Available options: {1}",
              result.command,
              result.options.map((option) => option.name).join(", ")
            ));
            break;
          default:
            this._logService.warn(`[Copilot:${this.sessionId}] Unhandled slash command result kind: ${result.kind}`);
            break;
        }
        if (result.runtimeSettingsChanged === true) {
          this._slashCommandProvider.clearCache();
        }
        if (result.kind !== "agent-prompt") {
          this._completeActiveTurn();
          return;
        }
      }
    }
    const sdkAttachments = await this._toSdkAttachments(attachments);
    await this.applyMode(mode);
    await this.syncPermissionMode("turn-start");
    await this._applyEffectiveSandboxConfig();
    await this._reconcileMcpServerEnablement();
    const traceContext = this._otelService.getSessionTraceContext(this.sessionId, this.resourceUri.toString());
    await this._otelService.withTraceContext(traceContext, () => this._wrapper.session.send({ prompt, attachments: sdkAttachments?.length ? sdkAttachments : void 0 }));
    this._logService.info(`[Copilot:${this.sessionId}] session.send() returned`);
  }
  async _toSdkAttachments(attachments) {
    const sdkAttachments = attachments?.length ? (await Promise.all(attachments.map((attachment) => this._toSdkAttachment(attachment)))).filter(isDefined) : void 0;
    if (sdkAttachments?.length) {
      this._logService.trace(`[Copilot:${this.sessionId}] Attachments: ${JSON.stringify(sdkAttachments.map((attachment) => ({ type: attachment.type })))}`);
    }
    return sdkAttachments;
  }
  async hasRuntimeSlashCommand(command) {
    try {
      return !!await this._slashCommandProvider.resolveSlashCommand(command);
    } catch (err) {
      this._logService.warn(`[Copilot:${this.sessionId}] rpc.commands.list failed`, err);
      return false;
    }
  }
  async getRuntimeSlashCommands(options) {
    try {
      return await this._slashCommandProvider.getSlashCommands(options);
    } catch (err) {
      this._logService.warn(`[Copilot:${this.sessionId}] rpc.commands.list failed`, err);
      return [];
    }
  }
  /**
   * Translate a protocol {@link MessageAttachment} into the Copilot CLI SDK's `attachments` payload shape. Resource
   * attachments map to the SDK's reference-style `file`/`directory`/`selection` variants (the
   * {@link MessageAttachmentBase.displayKind} advisory hint controls which one). Embedded resources (e.g. inline
   * image bytes, or unsaved editor content) map to the SDK's `blob` variant, and simple attachments with a model
   * representation map to `text/plain` blob attachments.
   *
   * Any Resource attachment carrying a {@link TextSelection} (e.g. `displayKind === 'selection'` or `'symbol'`) is
   * mapped to the SDK's `selection` variant so the range survives the round-trip — keying off the `selection` field
   * rather than just `displayKind` avoids symbol attachments degrading to a plain file reference (#315193). For those
   * we read the resource content from disk and slice it by the carried range (the protocol's {@link TextSelection}
   * only carries the range, not the inline text); on read failure the selection downgrades to a plain file reference.
   * A textual embedded resource already carries the exact inline text to send (the whole live buffer for a document,
   * or just the selected text for a selection), so it is forwarded as-is without further slicing.
   */
  async _toSdkAttachment(attachment) {
    if (isAgentFeedbackAnnotationsAttachment(attachment)) {
      const rendered = renderAgentFeedbackAnnotationsAttachment(attachment);
      if (!rendered) {
        return void 0;
      }
      return {
        type: "blob",
        data: encodeBase64(VSBuffer.fromString(rendered)),
        mimeType: addAttachmentDisplayKindToMimeType(attachment.displayKind),
        displayName: attachment.label
      };
    }
    if (attachment.type === MessageAttachmentKind.Simple) {
      if (attachment.modelRepresentation) {
        return {
          type: "blob",
          data: encodeBase64(VSBuffer.fromString(attachment.modelRepresentation)),
          mimeType: addSimpleAttachmentDisplayKindToMimeType(attachment),
          displayName: attachment.label
        };
      }
      return void 0;
    }
    if (attachment.type === MessageAttachmentKind.EmbeddedResource) {
      return { type: "blob", data: attachment.data, mimeType: attachment.contentType, displayName: attachment.label };
    }
    if (attachment.type !== MessageAttachmentKind.Resource) {
      return void 0;
    }
    const uri = URI.parse(attachment.uri);
    const path = uri.scheme === "file" ? uri.fsPath : uri.toString();
    const displayName = attachment.label ?? path;
    if (attachment.selection) {
      try {
        const text = await this._readSelectedText(uri, attachment.selection.range);
        return { type: "selection", filePath: path, displayName, text, selection: attachment.selection.range };
      } catch (err) {
        this._logService.warn(`[Copilot:${this.sessionId}] Failed to read selected text for ${uri.toString()}: ${err}`);
        return { type: "file", path, displayName };
      }
    }
    if (attachment.displayKind === "selection") {
      return { type: "file", path, displayName };
    }
    const type = attachment.displayKind === "directory" ? "directory" : "file";
    return { type, path, displayName };
  }
  async _readSelectedText(uri, range) {
    const content = await this._fileService.readFile(uri);
    const text = content.value.toString();
    const lines = splitLinesIncludeSeparators(text);
    const start = this._getOffsetAt(lines, range.start);
    const end = this._getOffsetAt(lines, range.end);
    return text.substring(start, Math.max(start, end));
  }
  _getOffsetAt(lines, position) {
    const line = Math.max(0, Math.min(position.line, lines.length - 1));
    let offset = 0;
    for (let i = 0; i < line; i++) {
      offset += lines[i].length;
    }
    const lineText = lines[line].replace(/\r\n|\r|\n$/, "");
    return offset + Math.max(0, Math.min(position.character, lineText.length));
  }
  /**
   * Pushes `mode` to the SDK via `rpc.mode.set` if it differs from the
   * last applied value. Failures are logged and swallowed so that mode
   * propagation does not block the turn.
   */
  async applyMode(mode) {
    if (!mode || mode === this._lastAppliedMode) {
      return;
    }
    try {
      await this._wrapper.session.rpc.mode.set({ mode });
      this._lastAppliedMode = mode;
      this._logService.info(`[Copilot:${this.sessionId}] rpc.mode.set succeeded: mode=${mode}`);
    } catch (err) {
      this._logService.error(err, `[Copilot:${this.sessionId}] rpc.mode.set failed: mode=${mode}`);
    }
  }
  /**
   * `true` when the session's effective `mode` is `autopilot` — the
   * autonomous, continue-until-done mode in which no user is available to
   * answer questions or fill in elicitation forms.
   */
  _isAutopilotMode() {
    return this._configurationService.getEffectiveValue(this._ownerSessionUri.toString(), platformSessionSchema, SessionConfigKey.Mode) === "autopilot";
  }
  /**
   * Whether VS Code's auto-reply setting is enabled in the root config.
   */
  _isAutoReplyEnabled() {
    return this._configurationService.getRootValue(platformRootSchema, AgentHostAutoReplyEnabledConfigKey) === true;
  }
  async sendSteering(steeringMessage) {
    if (this._steeringMessagesInFlight.has(steeringMessage.id) || this._pendingSteeringFlips.has(steeringMessage.id)) {
      return;
    }
    this._steeringMessagesInFlight.add(steeringMessage.id);
    this._logService.info(`[Copilot:${this.sessionId}] Sending steering message: "${steeringMessage.message.text.substring(0, 100)}"`);
    try {
      await this._reconcileMcpServerEnablement();
      this._pendingSteeringFlips.set(steeringMessage.id, steeringMessage);
      const sdkAttachments = await this._toSdkAttachments(steeringMessage.message.attachments);
      await this._wrapper.session.send({
        prompt: steeringMessage.message.text,
        attachments: sdkAttachments?.length ? sdkAttachments : void 0,
        mode: "immediate"
      });
    } catch (err) {
      this._pendingSteeringFlips.delete(steeringMessage.id);
      this._logService.error(`[Copilot:${this.sessionId}] Steering message failed`, err);
    } finally {
      this._steeringMessagesInFlight.delete(steeringMessage.id);
    }
  }
  async getMessages() {
    const result = await this._getMappedEvents();
    return result.turns;
  }
  async getSubagentMessages(parentToolCallId) {
    const result = await this._getMappedEvents();
    const turns = result.subagentTurnsByToolCallId.get(parentToolCallId) ?? [];
    return turns;
  }
  _getMappedEvents() {
    if (!this._mappedEventsMemo) {
      const pending = this._computeMappedEvents();
      this._mappedEventsMemo = pending;
      pending.catch(() => {
        if (this._mappedEventsMemo === pending) {
          this._mappedEventsMemo = void 0;
        }
      });
    }
    return this._mappedEventsMemo;
  }
  async _computeMappedEvents() {
    const events = await this._wrapper.session.getEvents();
    let db;
    try {
      db = this._databaseRef.object;
    } catch {
    }
    const result = await mapSessionEvents(this._storageUri, db, events, {
      workingDirectory: this._workingDirectory,
      model: this._launchPlan.kind === "create" ? this._launchPlan.model : this._launchPlan.fallback.model
    });
    return result;
  }
  /** Drop the memoized event reconstruction; the next read rebuilds it. */
  _invalidateMappedEvents() {
    this._mappedEventsMemo = void 0;
  }
  async abort() {
    this._logService.info(`[Copilot:${this.sessionId}] Aborting session...`);
    this._beginAbort();
    this._drainPendingSteeringFlips();
    try {
      await this._wrapper.session.abort();
    } catch (error) {
      this._resetAbortToken();
      throw error;
    }
  }
  /**
   * Aborts before tearing down so that in-flight {@link _guarded} callbacks
   * settle rather than hang: disposing the {@link _abortCts} would drop each
   * racing `onCancellationRequested` listener without ever firing it, leaving
   * a callback that parks its deferred after the teardown sweep with nothing
   * left to resolve it. The sweep registered in the constructor stays as the
   * backstop, since {@link _beginAbort} no-ops when already aborted.
   */
  dispose() {
    void this._editTracker.flushAttribution().catch((error) => {
      this._logService.warn(`[Copilot:${this.sessionId}] Failed to flush edit attribution: ${error}`);
    });
    this._beginAbort();
    super.dispose();
  }
  /**
   * Explicitly destroys the underlying SDK session and waits for cleanup
   * to complete. Call this before {@link dispose} when you need to ensure
   * the session's on-disk data is no longer locked (e.g. before
   * truncation or fork operations that modify the session files).
   */
  async destroySession() {
    try {
      await this._editTracker.flushAttribution();
    } catch (error) {
      this._logService.warn(`[Copilot:${this.sessionId}] Failed to flush edit attribution: ${error}`);
    }
    await this._wrapper.disconnect();
  }
  async setModel(model, reasoningEffort, contextTier) {
    this._logService.info(`[Copilot:${this.sessionId}] Changing model to: ${model}`);
    this._lastSeenModelId = model;
    await this._wrapper.session.setModel(model, { reasoningEffort, contextTier });
  }
  /**
   * Dispatches an MCP JSON-RPC method received on the `mcp://` side
   * channel to the Copilot SDK's `session.rpc.mcp.*` surface.
   *
   * Mapping:
   *  - `tools/list` → `rpc.mcp.apps.listTools`
   *  - `tools/call` → `rpc.mcp.apps.callTool`
   *  - `resources/read` → `rpc.mcp.apps.readResource`
   *  - `resources/list` → `rpc.mcp.apps.listResources` (empty list fallback)
   *  - `resources/templates/list` → `rpc.mcp.apps.listResourceTemplates` (empty list fallback)
   *  - `sampling/createMessage` → `rpc.mcp.executeSampling`
   *
   * Other MCP methods are rejected with `Method not found` (the caller
   * translates that into a JSON-RPC `-32601`).
   */
  async handleMcpRequest(serverName, method, params) {
    const apps = this._wrapper.session.rpc.mcp.apps;
    switch (method) {
      case "tools/list":
        return apps.listTools({ serverName, originServerName: serverName });
      case "tools/call": {
        const name = params && typeof params["name"] === "string" ? params["name"] : void 0;
        if (!name) {
          throw new Error(`tools/call missing 'name' parameter`);
        }
        const rawArgs = params ? params["arguments"] : void 0;
        const args = isObject(rawArgs) ? rawArgs : void 0;
        return apps.callTool({ serverName, toolName: name, arguments: args, originServerName: serverName });
      }
      case "resources/read": {
        const uri = params && typeof params["uri"] === "string" ? params["uri"] : void 0;
        if (!uri) {
          throw new Error(`resources/read missing 'uri' parameter`);
        }
        return apps.readResource({ serverName, uri });
      }
      case "resources/list": {
        return { resources: [] };
      }
      case "resources/templates/list": {
        return { resourceTemplates: [] };
      }
      case "sampling/createMessage":
        return this._handleSamplingCreateMessage(serverName, params);
      default:
        throw new Error(`Method not found: ${method}`);
    }
  }
  async startMcpServer(id) {
    const serverName = this._mcpCustomizations.serverNameForCustomizationId(id);
    if (!serverName) {
      this._logService.warn(`[Copilot:${this.sessionId}] Cannot start unknown MCP server customization ${id}`);
      return;
    }
    return this._mcpServerLifecycleSequencer.queue(serverName, async () => {
      try {
        await this._wrapper.session.rpc.mcp.startServer({ serverName });
      } finally {
        this._seedMcpServersFromRpc();
      }
    });
  }
  _reconcileMcpServerEnablement() {
    return this._mcpEnablementSequencer.queue(() => this._doReconcileMcpServerEnablement());
  }
  async _doReconcileMcpServerEnablement() {
    const desiredCustomizations = this._hostCustomizations();
    const desiredEnablement = getSdkMcpServerEnablement(resolveCustomizationEnablement(
      this._customizationEnablementService,
      this._ownerSessionUri,
      desiredCustomizations,
      void 0,
      void 0,
      this._mcpCustomizations.pluginMcpServerSources
    ));
    if (desiredEnablement.size === 0) {
      return;
    }
    await this._refreshMcpServersFromRpc();
    let changed = false;
    for (const server of this._mcpCustomizations.serverEnablement()) {
      const desired = desiredEnablement.get(server.customizationId);
      if (desired === void 0 || desired === server.enabled) {
        continue;
      }
      try {
        if (desired) {
          changed = true;
          await this._wrapper.session.rpc.mcp.enable({ serverName: server.serverName });
        } else {
          await this._disableMcpServer(server.serverName);
          changed = true;
        }
      } catch (e) {
        this._logService.error(e, `[Copilot:${this.sessionId}] Failed to ${desired ? "enable" : "disable"} MCP server ${server.serverName}`);
      }
    }
    if (changed) {
      await this._refreshMcpServersFromRpc();
    }
  }
  async _disableMcpServer(serverName) {
    this._cancelPendingMcpAuthRequestsForServer(serverName);
    await this._wrapper.session.rpc.mcp.disable({ serverName });
  }
  async stopMcpServer(id) {
    const serverName = this._mcpCustomizations.serverNameForCustomizationId(id);
    if (!serverName) {
      this._logService.warn(`[Copilot:${this.sessionId}] Cannot stop unknown MCP server customization ${id}`);
      return;
    }
    return this._mcpServerLifecycleSequencer.queue(serverName, async () => {
      await this._wrapper.session.rpc.mcp.stopServer({ serverName });
      this._mcpCustomizations.applyOne({ name: serverName, state: { kind: McpServerStatus.Stopped } });
    });
  }
  /**
   * Forwards an App→host `sampling/createMessage` request received
   * over the AHP `mcp://` channel to `rpc.mcp.executeSampling`. The
   * Copilot runtime owns the MCP→chat-completion conversion and the
   * sampling response shape, so we pass the raw MCP params through
   * untouched and return the SDK's result directly.
   *
   * Resolves the JSON-RPC request with the `CreateMessageResult` on
   * success and rejects on failure/cancellation, mirroring the
   * `sampling/createMessage` MCP contract.
   */
  async _handleSamplingCreateMessage(serverName, params) {
    if (!params) {
      throw new Error(`sampling/createMessage missing params`);
    }
    const requestId = generateUuid();
    const mcpRequestId = generateUuid();
    this._pendingMcpSamplings.add(requestId);
    try {
      const result = await this._wrapper.session.rpc.mcp.executeSampling({
        requestId,
        serverName,
        mcpRequestId,
        request: params
      });
      if (result.action === "success") {
        return result.result ?? null;
      }
      throw new Error(`sampling/createMessage ${result.action}${result.error ? `: ${result.error}` : ""}`);
    } finally {
      this._pendingMcpSamplings.delete(requestId);
    }
  }
  /**
   * Selects (or clears) a custom agent on the live SDK session.
   * Mirrors the SDK's `rpc.agent.select` / `rpc.agent.deselect` pair.
   */
  async setAgent(agentName) {
    if (agentName) {
      const name = agentName;
      this._logService.info(`[Copilot:${this.sessionId}] Selecting custom agent: ${name}`);
      try {
        await this._wrapper.session.rpc.agent.select({ name });
      } catch (err) {
        this._logService.error(err, `[Copilot:${this.sessionId}] rpc.agent.select failed: name=${name}`);
        throw err;
      }
    } else {
      this._logService.info(`[Copilot:${this.sessionId}] Clearing custom agent selection`);
      try {
        await this._wrapper.session.rpc.agent.deselect();
      } catch (err) {
        this._logService.error(err, `[Copilot:${this.sessionId}] rpc.agent.deselect failed`);
        throw err;
      }
    }
  }
  // ---- permission handling ------------------------------------------------
  /**
   * Handles a permission request from the SDK by firing a `tool_ready` event
   * (which transitions the tool to PendingConfirmation) and waiting for the
   * side-effects layer to respond via {@link respondToPermissionRequest}.
   */
  async _handlePermissionRequest(request) {
    try {
      const toolCallId = request.toolCallId;
      if (!toolCallId) {
        this._logService.warn(`[Copilot:${this.sessionId}] Permission request without toolCallId, auto-denying: kind=${request.kind}`);
        return { kind: "reject" };
      }
      if (this._unroutableSubagentToolCallIds.delete(toolCallId)) {
        this._logService.error(`[Copilot:${this.sessionId}] Rejecting permission request for unroutable subagent tool call: toolCallId=${toolCallId}, kind=${request.kind}`);
        return { kind: "reject" };
      }
      const managedApprovalRequired = request.managedApprovalRequired === true;
      const requestSandboxBypass = request.kind === "shell" || request.kind === "write" || request.kind === "read" || request.kind === "url" ? request.requestSandboxBypass : void 0;
      const autoApproval = !managedApprovalRequired && this._lastAppliedPermissionMode === "auto" ? await this._takeAutoApproval(toolCallId) : void 0;
      const recommendation = autoApproval?.recommendation;
      if (recommendation === "approve" && !requestSandboxBypass) {
        if (request.kind === "custom-tool" && typeof request.toolName === "string" && this._clientToolNames.has(this._clientToolName(request.toolName))) {
          const trackedToolCall2 = this._activeToolCalls.get(toolCallId);
          const displayName = trackedToolCall2?.displayName ?? getToolDisplayName(request.toolName);
          const parameters = trackedToolCall2?.parameters;
          const parentToolCallId2 = trackedToolCall2?.parentToolCallId;
          this._onDidSessionProgress.fire({
            kind: "pending_confirmation",
            chat: this._chatChannelUri,
            state: {
              status: ToolCallStatus.PendingConfirmation,
              toolCallId,
              toolName: request.toolName,
              displayName,
              invocationMessage: getInvocationMessage(request.toolName, displayName, parameters, (path) => this._resolveEditFilePath(path)),
              toolInput: getToolInputString(request.toolName, parameters, tryStringify(parameters)),
              riskAssessment: autoApproval?.reason ? {
                kind: ToolCallRiskAssessmentKind.Judge,
                status: ToolCallRiskAssessmentStatus.Complete,
                reason: autoApproval.reason,
                safety: 1
              } : void 0
            },
            parentToolCallId: parentToolCallId2
          });
        }
        return { kind: "approve-once" };
      }
      const approvedSignature = this._approvedDuplicablePermissionSignatures.get(toolCallId);
      if (approvedSignature !== void 0) {
        this._approvedDuplicablePermissionSignatures.delete(toolCallId);
        if (!managedApprovalRequired && (request.kind === "write" || request.kind === "read") && safeStringify(request) === approvedSignature) {
          this._logService.info(`[Copilot:${this.sessionId}] Auto-approving duplicate ${request.kind} permission request for tool call ${toolCallId}`);
          return { kind: "approve-once" };
        }
      }
      const sessionResourcePath = this._getInternalSessionResourcePath(request);
      if (!managedApprovalRequired && sessionResourcePath) {
        this._logService.info(`[Copilot:${this.sessionId}] Auto-approving internal session resource ${sessionResourcePath}`);
        return { kind: "approve-once" };
      }
      if (!managedApprovalRequired && request.kind === "read" && typeof request.path === "string") {
        if (isCopilotSdkToolOutputTempFile(request.path, this._environmentService.tmpDir.fsPath)) {
          this._logService.info(`[Copilot:${this.sessionId}] Auto-approving Copilot SDK tool-output temp file ${request.path}`);
          return { kind: "approve-once" };
        }
      }
      const serverToolHost = this._serverToolHost;
      const serverToolName = request.kind === "custom-tool" && typeof request.toolName === "string" && serverToolHost?.toolNames.includes(request.toolName) ? request.toolName : void 0;
      if (serverToolHost && serverToolName) {
        const canRequireConfirmation = serverToolHost.canRequireConfirmation(serverToolName);
        if (canRequireConfirmation && !serverToolHost.requiresConfirmation(this._chatChannelUri.toString(), serverToolName)) {
          this._logService.info(`[Copilot:${this.sessionId}] Auto-approving server tool ${serverToolName} because it has nothing to confirm`);
          return { kind: "approve-once" };
        }
        if (!canRequireConfirmation && !managedApprovalRequired) {
          this._logService.info(`[Copilot:${this.sessionId}] Auto-approving server tool ${serverToolName}`);
          return { kind: "approve-once" };
        }
      }
      const customShellToolName = request.kind === "custom-tool" && typeof request.toolName === "string" && isShellTool(request.toolName) ? request.toolName : void 0;
      const isShellRequest = request.kind === "shell" || customShellToolName !== void 0;
      const trackedToolName = this._activeToolCalls.get(toolCallId)?.toolName;
      const shellToolName = request.kind === "shell" ? trackedToolName : customShellToolName;
      const shellLanguage = isShellRequest && (shellToolName === "bash" || shellToolName === "powershell") ? shellToolName : void 0;
      if (isShellRequest && shellLanguage === void 0) {
        this._logService.warn(`[Copilot:${this.sessionId}] Shell permission request has no recognized shell tool name; requiring confirmation: toolCallId=${toolCallId}, toolName=${shellToolName ?? "(missing)"}`);
      }
      if (!managedApprovalRequired && request.kind === "custom-tool" && typeof request.toolName === "string" && this._clientToolNames.has(this._clientToolName(request.toolName)) && this._pendingClientToolCalls.hasBufferedResult(toolCallId)) {
        this._logService.info(`[Copilot:${this.sessionId}] Auto-approving client tool ${request.toolName} because its result arrived before the permission request`);
        return { kind: "approve-once" };
      }
      this._logService.info(`[Copilot:${this.sessionId}] Requesting confirmation for tool call: ${toolCallId}`);
      const pendingPermission = this._pendingPermissions.register(toolCallId, { managedApprovalRequired });
      if (!managedApprovalRequired && isShellRequest && !requestSandboxBypass && await this._isShellSandboxedByDefault()) {
        if (this._pendingPermissions.has(toolCallId)) {
          this._pendingPermissions.respond(toolCallId, { kind: "approve-once" });
          this._logService.info(`[Copilot:${this.sessionId}] Auto-approving sandboxed shell command for tool call ${toolCallId}`);
          return { kind: "approve-once" };
        }
        return { kind: "reject" };
      }
      const edits = await this._buildEditsForPermission(request, toolCallId);
      if (!this._pendingPermissions.has(toolCallId)) {
        return { kind: "reject" };
      }
      const isNewFile = edits?.items.some((edit) => !edit.before && !!edit.after);
      const { confirmationTitle, invocationMessage, toolInput, permissionKind, permissionPath } = getPermissionDisplay(request, this._workingDirectory, isNewFile);
      const toolName = request.kind === "mcp" || request.kind === "custom-tool" || request.kind === "hook" ? request.toolName ?? request.kind : request.kind;
      const trackedToolCall = this._activeToolCalls.get(toolCallId);
      const parentToolCallId = trackedToolCall?.parentToolCallId;
      this._onDidSessionProgress.fire({
        kind: "pending_confirmation",
        chat: this._chatChannelUri,
        state: {
          status: ToolCallStatus.PendingConfirmation,
          toolCallId,
          toolName,
          displayName: getToolDisplayName(toolName),
          contributor: trackedToolCall?.contributor,
          intention: trackedToolCall?.intention,
          invocationMessage,
          toolInput,
          confirmationTitle,
          riskAssessment: autoApproval?.reason ? {
            kind: ToolCallRiskAssessmentKind.Judge,
            status: ToolCallRiskAssessmentStatus.Complete,
            reason: autoApproval.reason,
            safety: recommendation === "approve" ? 1 : 0
          } : void 0,
          edits
        },
        permissionKind,
        permissionPath,
        managedApprovalRequired,
        requestSandboxBypass,
        shellLanguage,
        parentToolCallId
      });
      const result = await pendingPermission;
      this._logService.info(`[Copilot:${this.sessionId}] Permission response: toolCallId=${toolCallId}, result=${result.kind}`);
      if (!managedApprovalRequired && result.kind === "approve-once" && (request.kind === "write" || request.kind === "read")) {
        this._approvedDuplicablePermissionSignatures.set(toolCallId, safeStringify(request));
      }
      return result;
    } catch (error) {
      this._logService.error(error, `[Copilot:${this.sessionId}] Failed to handle permission request: kind=${request.kind}, toolCallId=${request.toolCallId ?? "missing"}`);
      throw error;
    }
  }
  _getInternalSessionResourcePath(request) {
    let permissionPath;
    if (request.kind === "read") {
      permissionPath = typeof request.path === "string" ? request.path : void 0;
    } else if (request.kind === "write") {
      permissionPath = typeof request.fileName === "string" ? request.fileName : void 0;
    }
    if (!permissionPath) {
      return void 0;
    }
    const sessionStateDir = normalizePath(URI.file(getCopilotCLISessionStateDir(this._environmentService.userHome.fsPath)));
    const sessionDir = normalizePath(URI.joinPath(sessionStateDir, this.sessionId));
    if (!extUriBiasedIgnorePathCase.isEqualOrParent(sessionDir, sessionStateDir)) {
      return void 0;
    }
    const permissionUri = normalizePath(URI.file(permissionPath));
    return extUriBiasedIgnorePathCase.isEqualOrParent(permissionUri, sessionDir) ? permissionPath : void 0;
  }
  /**
   * Returns true when shell commands run inside a sandbox by default — either
   * through the AgentHost's own {@link TerminalSandboxEngine} (when the custom
   * terminal tool is enabled) or through the SDK's built-in shell tool wrapped
   * by the `sandboxConfig` we pushed via `session.options.update`.
   *
   * Callers use this to auto-approve shell permission prompts that the sandbox
   * already contains. Commands that explicitly opt out of the sandbox
   * (`requestSandboxBypass`) are excluded by the caller, since the
   * sandbox no longer contains them.
   *
   * Returns false when neither sandbox path is configured, so the standard
   * confirmation flow is preserved.
   */
  async _isShellSandboxedByDefault() {
    if (this._isCustomTerminalToolEnabled()) {
      if (!this._shellManager) {
        return false;
      }
      return this._shellManager.getOrCreateSandboxEngine().isEnabled();
    }
    return this._computeSdkSandboxConfig() !== void 0;
  }
  /**
   * `true` when the AgentHost's own shell tools (wrapped by
   * {@link TerminalSandboxEngine}) replace the SDK's built-in shell. In that
   * mode the SDK sandbox config is unused, so we neither forward nor toggle it.
   */
  _isCustomTerminalToolEnabled() {
    return this._configurationService.getRootValue(copilotCliConfigSchema, CopilotCliConfigKey.EnableCustomTerminalTool) === true;
  }
  /**
   * The SDK-shaped sandbox policy for this session, mirroring
   * {@link CopilotSessionLauncher}'s computation: `undefined` when the custom
   * terminal tool is enabled (the host's own terminal sandbox engine handles
   * containment) or when the host sandbox config evaluates to disabled
   * (including on Windows, where the sandbox is not supported).
   */
  _computeSdkSandboxConfig() {
    if (this._isCustomTerminalToolEnabled()) {
      return void 0;
    }
    const sandbox = this._configurationService.getRootValue(sandboxConfigSchema, AgentHostSandboxConfigKey.Sandbox);
    return buildSandboxConfigForSdk(this._platform, sandbox);
  }
  /**
   * `true` when the session runs with bypass approvals — either the global
   * auto-approve setting or the session's `autoApprove` ("Allow All")
   * level. Agent mode is an orthogonal axis and does not affect approvals.
   */
  _isBypassApprovals() {
    if (this._configurationService.getRootValue(platformRootSchema, AgentHostGlobalAutoApproveEnabledConfigKey) === true) {
      return true;
    }
    return this._configurationService.getEffectiveValue(this._ownerSessionUri.toString(), platformSessionSchema, SessionConfigKey.AutoApprove) === "autoApprove";
  }
  _getSdkPermissionMode() {
    if (this._isBypassApprovals()) {
      return "on";
    }
    return this._getConfiguredApprovalLevel() === "assisted" ? "auto" : "off";
  }
  _getConfiguredApprovalLevel() {
    return this._configurationService.getEffectiveValue(this._ownerSessionUri.toString(), platformSessionSchema, SessionConfigKey.AutoApprove) ?? "default";
  }
  _getConfiguredAgentMode() {
    return this._configurationService.getEffectiveValue(this._ownerSessionUri.toString(), platformSessionSchema, SessionConfigKey.Mode) ?? "interactive";
  }
  _subscribeToPermissionConfigChanges() {
    this._register(this._configurationService.onDidRootConfigChange(() => {
      void this._syncPermissionModeAfterConfigChange();
    }));
    this._register(this._configurationService.onDidSessionConfigChange((event) => {
      if (event.session === this._ownerSessionUri.toString() && Object.hasOwn(event.config, SessionConfigKey.AutoApprove)) {
        void this._syncPermissionModeAfterConfigChange();
      }
    }));
  }
  async _syncPermissionModeAfterConfigChange() {
    try {
      await this.syncPermissionMode("config-change");
      await this._applyEffectiveSandboxConfig(true);
    } catch (error) {
      this._logService.error(error, `[Copilot:${this.sessionId}] Failed to apply permission config change; aborting active turn`);
      try {
        await this.abort();
      } catch (abortError) {
        this._logService.error(abortError, `[Copilot:${this.sessionId}] Failed to abort after permission config sync failure`);
      }
    }
  }
  async _takeAutoApproval(toolCallId) {
    if (this._autoApprovals.has(toolCallId)) {
      const autoApproval = this._autoApprovals.get(toolCallId) ?? void 0;
      this._autoApprovals.delete(toolCallId);
      return autoApproval;
    }
    return this._pendingAutoApprovals.register(toolCallId);
  }
  _recordAutoApproval(toolCallId, autoApproval) {
    if (this._pendingAutoApprovals.respond(toolCallId, autoApproval)) {
      return;
    }
    this._autoApprovals.set(toolCallId, autoApproval ?? null);
  }
  syncPermissionMode(source) {
    return this._permissionModeSequencer.queue(async () => {
      const mode = this._getSdkPermissionMode();
      const configuredLevel = this._getConfiguredApprovalLevel();
      this._logService.info(`[Copilot:${this.sessionId}] Syncing permission mode: source=${source}, agentMode=${this._getConfiguredAgentMode()}, configuredLevel=${configuredLevel}, sdkMode=${mode}, previousSdkMode=${this._lastAppliedPermissionMode ?? "unknown"}, globalAutoApprove=${this._configurationService.getRootValue(platformRootSchema, AgentHostGlobalAutoApproveEnabledConfigKey) === true}`);
      const experimentalModeEnabled = mode === "auto";
      if (this._autoApprovalExperimentalModeEnabled !== experimentalModeEnabled) {
        const experimentalResult = await this._wrapper.session.rpc.options.update({ isExperimentalMode: experimentalModeEnabled });
        if (!experimentalResult.success) {
          throw new Error(`Copilot SDK rejected experimental mode update required by permission mode '${mode}'`);
        }
        this._autoApprovalExperimentalModeEnabled = experimentalModeEnabled;
        this._logService.info(`[Copilot:${this.sessionId}] ${experimentalModeEnabled ? "Enabled" : "Disabled"} SDK experimental mode for permission mode '${mode}'`);
      }
      if (this._lastAppliedPermissionMode === mode) {
        return;
      }
      const result = await this._wrapper.session.rpc.permissions.setAllowAll({ mode });
      if (!result.success || result.mode !== void 0 && result.mode !== mode) {
        throw new Error(`Copilot SDK rejected permission mode '${mode}'`);
      }
      this._lastAppliedPermissionMode = mode;
    });
  }
  /**
   * Apply the SDK sandbox policy for the request that is about to be sent.
   *
   * Skips the SDK sandbox entirely when the custom terminal tool is enabled
   * (the host's own terminal sandbox engine handles containment and the SDK's
   * built-in shell is unused). Otherwise it always pushes the effective state
   * so the SDK never retains a stale or auto-discovered sandbox: the
   * configured policy unless the request runs with bypass approvals, or an
   * explicitly disabled sandbox when no sandbox is configured (setting off,
   * or Windows).
   */
  async _applyEffectiveSandboxConfig(failOnError = false) {
    if (this._isCustomTerminalToolEnabled()) {
      return;
    }
    const sandbox = this._configurationService.getRootValue(sandboxConfigSchema, AgentHostSandboxConfigKey.Sandbox);
    const base = buildSandboxConfigForSdk(this._platform, sandbox);
    const sandboxConfig = base && !this._isBypassApprovals() ? base : { enabled: false };
    try {
      const result = await this._wrapper.session.rpc.options.update({ sandboxConfig });
      if (!result.success) {
        throw new Error("Copilot SDK rejected sandbox config update");
      }
    } catch (err) {
      if (failOnError) {
        throw err;
      }
      this._logService.warn(`[Copilot:${this.sessionId}] Failed to update sandbox config for request`, err);
    }
  }
  /**
   * Builds an {@link FileEdit} preview for a write permission request.
   *
   * The `before` side references the existing file on disk directly (if it
   * exists); the `after` side is written to the `pending-edit-content:`
   * in-memory filesystem so the client can fetch it via `resourceRead`.
   *
   * Returns `undefined` for permission kinds that don't describe file
   * edits or when the request is missing the fields needed to build a
   * preview. If the permission request is no longer pending by the time
   * the in-memory write completes (e.g. the session was aborted), the
   * just-written entry is deleted so it cannot leak.
   */
  async _buildEditsForPermission(request, toolCallId) {
    if (request.kind !== "write") {
      return void 0;
    }
    const filePath = typeof request.fileName === "string" ? request.fileName : void 0;
    const newFileContents = typeof request.newFileContents === "string" ? request.newFileContents : void 0;
    if (!filePath || newFileContents === void 0) {
      return void 0;
    }
    const fileUri = URI.file(filePath);
    const fileUriStr = fileUri.toString();
    let beforeExists = false;
    try {
      beforeExists = await this._fileService.exists(fileUri);
    } catch (err) {
      this._logService.warn(`[Copilot:${this.sessionId}] Failed to check file for edit preview: ${filePath}`, err);
    }
    const afterUri = buildPendingEditContentUri(this._storageUri.toString(), toolCallId, filePath);
    try {
      await this._fileService.writeFile(afterUri, VSBuffer.fromString(newFileContents));
    } catch (err) {
      this._logService.warn(`[Copilot:${this.sessionId}] Failed to write pending edit content for ${filePath}`, err);
      return void 0;
    }
    if (!this._pendingPermissions.has(toolCallId)) {
      this._fileService.del(afterUri).catch((err) => {
        this._logService.warn(`[Copilot:${this.sessionId}] Failed to delete orphaned pending edit content: ${afterUri.toString()}`, err);
      });
      return void 0;
    }
    this._pendingEditContentUris.set(toolCallId, afterUri);
    const diffCounts = typeof request.diff === "string" ? countUnifiedDiffLines(request.diff) : void 0;
    const edit = {
      ...beforeExists ? { before: { uri: fileUriStr, content: { uri: fileUriStr } } } : {},
      after: { uri: fileUriStr, content: { uri: afterUri.toString() } },
      ...diffCounts ? { diff: diffCounts } : {}
    };
    return { items: [edit] };
  }
  respondToPermissionRequest(requestId, approved) {
    if (this._pendingPermissions.respond(requestId, approved ? { kind: "approve-once" } : USER_DENIED_PERMISSION_RESULT)) {
      this._deletePendingEditContent(requestId);
      return true;
    }
    return false;
  }
  async _requestUnsandboxedCommandConfirmation(request) {
    const pendingPermission = this._pendingPermissions.register(request.toolCallId, { managedApprovalRequired: false });
    const displayName = getToolDisplayName(request.toolName);
    const blockedDomains = request.blockedDomains?.length ? request.blockedDomains.join(", ") : void 0;
    const confirmationTitle = blockedDomains ? localize("agentHost.unsandboxedCommandConfirmation.title.blockedDomains", "Run Command Outside the Sandbox to Access {0}?", blockedDomains) : localize("agentHost.unsandboxedCommandConfirmation.title.generic", "Run Command Outside the Sandbox?");
    const invocationMessage = request.reason ? localize("agentHost.unsandboxedCommandConfirmation.reason", "Reason for leaving the sandbox: {0}", request.reason) : blockedDomains ? localize("agentHost.unsandboxedCommandConfirmation.blockedDomains", "This command needs to access blocked network domain(s): {0}.", blockedDomains) : localize("agentHost.unsandboxedCommandConfirmation.generic", "This command needs to run outside the sandbox.");
    const parentToolCallId = this._activeToolCalls.get(request.toolCallId)?.parentToolCallId;
    this._onDidSessionProgress.fire({
      kind: "pending_confirmation",
      chat: this._chatChannelUri,
      state: {
        status: ToolCallStatus.PendingConfirmation,
        toolCallId: request.toolCallId,
        toolName: request.toolName,
        displayName,
        invocationMessage,
        toolInput: request.command,
        confirmationTitle
      },
      // Intentionally omit `permissionKind: 'shell'`: that would route this
      // through the shell rule-based auto-approver and silently approve
      // common safe commands (`pwd`, `ls`, etc.) without prompting.
      // Mirrors the workbench's sandbox-aware analyzer, which forces
      // `isAutoApproveAllowed: false` whenever `requiresUnsandboxConfirmation`
      // is set.
      parentToolCallId
    });
    return (await pendingPermission).kind === "approve-once";
  }
  // ---- user input handling ------------------------------------------------
  /**
   * Handles a user input request from the SDK (ask_user tool). Auto-answers when the user is unavailable; otherwise waits for the renderer to respond via {@link respondToUserInputRequest}.
   */
  async _handleUserInputRequest(request, _invocation) {
    const requestId = generateUuid();
    const questionId = generateUuid();
    const inputRequest = {
      id: requestId,
      questions: [
        request.choices && request.choices.length > 0 ? {
          kind: ChatInputQuestionKind.SingleSelect,
          id: questionId,
          message: request.question,
          required: true,
          options: request.choices.map((c) => ({ id: c, label: c })),
          allowFreeformInput: request.allowFreeform ?? true
        } : {
          kind: ChatInputQuestionKind.Text,
          id: questionId,
          message: request.question,
          required: true
        }
      ]
    };
    const isAutopilot = this._isAutopilotMode();
    if (isAutopilot || this._isAutoReplyEnabled()) {
      this._emitAction({
        type: ActionType.ChatInputRequested,
        request: inputRequest
      });
      this._emitAction({
        type: ActionType.ChatInputCompleted,
        requestId,
        response: ChatInputResponseKind.Accept,
        answers: {
          [questionId]: {
            state: ChatInputAnswerState.Submitted,
            value: {
              kind: ChatInputAnswerValueKind.Text,
              value: AgentHostAutoReplyAnswer
            }
          }
        }
      });
      return {
        answer: AgentHostAutoReplyAnswer,
        wasFreeform: true
      };
    }
    if (!this.hasActiveTurn) {
      this._logService.warn(`[Copilot:${this.sessionId}] Rejecting user input request without an active turn`);
      return { answer: "No active turn", wasFreeform: true };
    }
    const questionPreview = request.question.substring(0, 100);
    try {
      this._logService.info(`[Copilot:${this.sessionId}] User input request: requestId=${requestId}, question="${questionPreview}"`);
      const pendingInput = this._pendingUserInputs.register(requestId, { questionId });
      this._emitAction({
        type: ActionType.ChatInputRequested,
        request: { ...inputRequest, purpose: ChatInputRequestPurpose.AskUser }
      });
      const result = await pendingInput;
      this._logService.info(`[Copilot:${this.sessionId}] User input response: requestId=${requestId}, response=${result.response}`);
      if (result.response !== ChatInputResponseKind.Accept || !result.answers) {
        return { answer: "", wasFreeform: true };
      }
      const answer = result.answers[questionId];
      if (!answer || answer.state === ChatInputAnswerState.Skipped) {
        return { answer: "", wasFreeform: true };
      }
      const { value: val } = answer;
      if (val.kind === ChatInputAnswerValueKind.Text) {
        return { answer: val.value, wasFreeform: true };
      } else if (val.kind === ChatInputAnswerValueKind.Selected) {
        const wasFreeform = !request.choices?.includes(val.value);
        return { answer: val.value, wasFreeform };
      }
      return { answer: "", wasFreeform: true };
    } catch (error) {
      this._logService.error(error, `[Copilot:${this.sessionId}] Failed to handle user input request: question="${questionPreview}"`);
      throw error;
    }
  }
  /**
   * Handles an elicitation request from the SDK (MCP server / tool prompt)
   * by firing a `session/inputRequested` action and waiting for the
   * renderer to respond via {@link respondToUserInputRequest}.
   *
   * - `form` mode requests are projected from the SDK's
   *   {@link ElicitationSchema} into a list of
   *   {@link ChatInputQuestion}s.
   * - `url` mode requests surface as a question-less input request whose
   *   {@link ChatInputRequest.url} drives the renderer's "open URL"
   *   affordance.
   *
   * Under autopilot the request is auto-cancelled — there is no user
   * available to fill in a form, and accepting with empty content would
   * be misleading to the MCP server.
   */
  async _handleElicitationRequest(context) {
    const isAutopilot = this._isAutopilotMode();
    if (isAutopilot) {
      return { action: "cancel" };
    }
    if (!this.hasActiveTurn) {
      this._logService.warn(`[Copilot:${this.sessionId}] Rejecting elicitation request without an active turn`);
      return { action: "decline" };
    }
    const messagePreview = context.message.substring(0, 100);
    try {
      const requestId = generateUuid();
      this._logService.info(`[Copilot:${this.sessionId}] Elicitation request: requestId=${requestId}, mode=${context.mode ?? "form"}, source=${context.elicitationSource ?? "<unknown>"}, message="${messagePreview}"`);
      const schema = context.mode === "url" ? void 0 : context.requestedSchema;
      const requiredSet = new Set(schema?.required ?? []);
      const questions = schema ? Object.entries(schema.properties).map(([fieldName, field]) => elicitationFieldToQuestion(fieldName, field, requiredSet.has(fieldName))) : void 0;
      const pendingElicitation = this._pendingElicitations.register(requestId, { schema });
      const inputRequest = {
        id: requestId,
        purpose: ChatInputRequestPurpose.Elicitation,
        message: context.message,
        ...context.mode === "url" && context.url ? { url: context.url } : {},
        ...questions && questions.length > 0 ? { questions } : {}
      };
      this._emitAction({
        type: ActionType.ChatInputRequested,
        request: inputRequest
      });
      const result = await pendingElicitation;
      this._logService.info(`[Copilot:${this.sessionId}] Elicitation response: requestId=${requestId}, response=${result.response}`);
      if (result.response === ChatInputResponseKind.Decline) {
        return { action: "decline" };
      }
      if (result.response !== ChatInputResponseKind.Accept) {
        return { action: "cancel" };
      }
      const answers = result.answers ?? {};
      if (!schema) {
        const freeform = answers.answer;
        if (freeform && freeform.state !== ChatInputAnswerState.Skipped && freeform.value.kind === ChatInputAnswerValueKind.Text) {
          return { action: "accept", content: { answer: freeform.value.value } };
        }
        return { action: "accept" };
      }
      const content = {};
      for (const [fieldName, field] of Object.entries(schema.properties)) {
        const value = elicitationAnswerToFieldValue(field, answers[fieldName]);
        if (value !== void 0) {
          content[fieldName] = value;
        }
      }
      return { action: "accept", content };
    } catch (error) {
      this._logService.error(error, `[Copilot:${this.sessionId}] Failed to handle elicitation request: message="${messagePreview}"`);
      throw error;
    }
  }
  respondToUserInputRequest(requestId, response, answers) {
    const pendingPlanReview = this._pendingPlanReviews.getMetadata(requestId);
    if (pendingPlanReview) {
      return this._pendingPlanReviews.respond(requestId, this._resolveExitPlanMode(pendingPlanReview, response, answers));
    }
    if (this._pendingElicitations.respond(requestId, { response, answers })) {
      return true;
    }
    if (this._pendingUserInputs.respond(requestId, { response, answers })) {
      return true;
    }
    return false;
  }
  /**
   * Maps an `exit_plan_mode` input response back to an
   * {@link CopilotExitPlanModeResponse} that the CLI can feed into
   * `session.respondToExitPlanMode`. Mapping rules:
   *
   *  - Decline / Cancel / no answer → `{ approved: false }` (model gets a
   *    rejection result and stays in plan mode).
   *  - Accept + freeform feedback → `{ approved: false, feedback, selectedAction? }`
   *    (the SDK treats this as a revision request and re-emits
   *    `exit_plan_mode.requested` after revising the plan).
   *  - Accept + selected option → `{ approved: true, selectedAction, autoApproveEdits }`
   *    where `autoApproveEdits` is set for the autopilot variants.
   *
   * `selectedAction` is validated against the SDK's offered `actions`; an
   * unknown value is treated as a decline so the SDK isn't fed a value it
   * cannot handle.
   */
  _resolveExitPlanMode(pending, response, answers) {
    if (response !== ChatInputResponseKind.Accept) {
      return { approved: false };
    }
    const answer = answers?.[pending.questionId];
    if (!answer || answer.state === ChatInputAnswerState.Skipped) {
      return { approved: false };
    }
    const value = answer.value;
    let candidateAction;
    let feedback;
    if (value.kind === ChatInputAnswerValueKind.Selected) {
      candidateAction = value.value;
      const freeform = value.freeformValues?.find((s) => s.trim().length > 0)?.trim();
      feedback = freeform;
    } else if (value.kind === ChatInputAnswerValueKind.Text) {
      feedback = value.value.trim() || void 0;
    } else {
      return { approved: false };
    }
    const selectedAction = candidateAction && pending.actions.includes(candidateAction) ? candidateAction : pending.actions.includes(pending.recommendedAction) ? pending.recommendedAction : void 0;
    if (feedback) {
      return {
        approved: false,
        feedback,
        ...selectedAction ? { selectedAction } : {}
      };
    }
    if (!selectedAction) {
      return { approved: false };
    }
    this._syncAhpModeFromExitPlanAction(selectedAction);
    const isAutopilot = selectedAction === "autopilot" || selectedAction === "autopilot_fleet";
    return {
      approved: true,
      selectedAction,
      ...isAutopilot && this._isBypassApprovals() ? { autoApproveEdits: true } : {}
    };
  }
  /**
   * Translates an approved `exit_plan_mode` action into the AHP `mode` axis
   * and writes it so the mode picker reflects the choice immediately:
   *
   *  - `autopilot` / `autopilot_fleet` → `mode='autopilot'`.
   *  - `interactive` → `mode='interactive'`.
   *  - `exit_only` (approve plan without executing) leaves the mode untouched.
   */
  _syncAhpModeFromExitPlanAction(selectedAction) {
    switch (selectedAction) {
      case "autopilot":
      case "autopilot_fleet":
        this._syncAhpConfigFromSdkMode("autopilot");
        break;
      case "interactive":
        this._syncAhpConfigFromSdkMode("interactive");
        break;
    }
  }
  async _handlePreToolUse(input) {
    try {
      if (isEditTool(input.toolName, getToolCommand(input))) {
        const filePaths = this._getEditFilePaths(input.toolArgs);
        const mode = this._getConfiguredAgentMode();
        await Promise.all(filePaths.map((p) => this._editTracker.trackEditStart(p, mode)));
      }
    } catch (error) {
      this._logService.error(error, `[Copilot:${this.sessionId}] Failed in onPreToolUse: tool=${input.toolName}`);
      throw error;
    }
  }
  async _handlePostToolUse(input) {
    try {
      if (isEditTool(input.toolName, getToolCommand(input))) {
        const filePaths = this._getEditFilePaths(input.toolArgs);
        await Promise.all(filePaths.map((p) => this._editTracker.completeEdit(p)));
      }
    } catch (error) {
      this._logService.error(error, `[Copilot:${this.sessionId}] Failed in onPostToolUse: tool=${input.toolName}`);
      throw error;
    }
  }
  async _beginRepoInfoTelemetry(telemetryMessageId, clientType, isCurrent) {
    let resolved;
    try {
      resolved = await this._resolveRepoInfoTelemetryContext();
    } catch (error) {
      this._logService.warn(`[Copilot:${this.sessionId}] Failed to resolve repository info telemetry context: ${getErrorMessage(error)}`);
      return void 0;
    }
    if (!resolved || this._store.isDisposed || !isCurrent()) {
      return void 0;
    }
    await this._repoInfoTelemetry.reportBegin(resolved.context, this.resourceUri.toString(), telemetryMessageId, clientType, this._workingDirectory, resolved.baseBranch, isCurrent, (paths) => this._wrapper.session.rpc.contentExclusion.checkPaths({ paths: [...paths] }));
    return resolved;
  }
  async _endRepoInfoTelemetry(telemetryMessageId, resolved, isCurrent) {
    if (!resolved || this._store.isDisposed || !isCurrent()) {
      return;
    }
    await this._repoInfoTelemetry.reportEnd(resolved.context, this.resourceUri.toString(), telemetryMessageId, this._workingDirectory, resolved.baseBranch, isCurrent, (paths) => this._wrapper.session.rpc.contentExclusion.checkPaths({ paths: [...paths] }));
  }
  _completeActiveRepoInfoTelemetry() {
    const turn = this._activeRepoInfoTurn;
    if (!turn) {
      return;
    }
    this._activeRepoInfoTurn = void 0;
    const isCurrent = () => !turn.cancelled && this._isLaunchTokenCurrent();
    void turn.begin.then((resolved) => this._endRepoInfoTelemetry(turn.telemetryMessageId, resolved, isCurrent));
  }
  _cancelActiveRepoInfoTelemetry() {
    const turn = this._activeRepoInfoTurn;
    if (!turn) {
      return;
    }
    this._activeRepoInfoTurn = void 0;
    turn.cancelled = true;
    void turn.begin.finally(() => this._repoInfoTelemetry.clearTurn(turn.telemetryMessageId));
  }
  async _resolveRepoInfoTelemetryContext() {
    if (this._configurationService.getRootValue(platformRootSchema, AgentHostDisableRepoInfoTelemetryConfigKey) === true) {
      return void 0;
    }
    const githubToken = this._launchPlan.githubToken;
    if (!githubToken) {
      return void 0;
    }
    const [rawContext, baseBranch] = await Promise.all([
      this._copilotApiService.resolveRestrictedTelemetryContext(githubToken),
      this._databaseRef.object.getMetadata(META_DIFF_BASE_BRANCH)
    ]);
    if (!rawContext.restrictedTelemetryEnabled && !rawContext.isInternal) {
      return void 0;
    }
    return { context: this._toRepoInfoTelemetryContext(rawContext), baseBranch };
  }
  _isLaunchTokenCurrent() {
    return this._launchPlan.githubToken !== void 0 && this._isLaunchTokenStillCurrent();
  }
  _toRepoInfoTelemetryContext(context) {
    return {
      restrictedTelemetryEnabled: context.restrictedTelemetryEnabled,
      trackingId: context.trackingId,
      telemetryEndpoint: context.telemetryEndpoint ? `${context.telemetryEndpoint.replace(/\/+$/, "")}/telemetry` : void 0,
      isInternal: context.isInternal === true,
      userName: context.userName,
      isVscodeTeamMember: context.isVscodeTeamMember === true,
      copilotIgnoreEnabled: context.copilotIgnoreEnabled
    };
  }
  // ---- event wiring -------------------------------------------------------
  _subscribeToEvents() {
    const wrapper = this._wrapper;
    const sessionId = this.sessionId;
    this._register(wrapper.onSystemNotification((e) => {
      const notification = buildCopilotSystemNotification(e);
      if (!notification) {
        this._logService.trace(`[Copilot:${sessionId}] Ignoring system.notification kind=${e.data.kind.type}`);
        return;
      }
      this._logService.info(`[Copilot:${sessionId}] System notification received: kind=${e.data.kind.type}`);
      if (this._turnId) {
        this._emitAction({
          type: ActionType.ChatResponsePart,
          turnId: this._turnId,
          part: {
            kind: ResponsePartKind.SystemNotification,
            content: notification.messageText
          }
        });
        return;
      }
      if (!notification.startsTurn) {
        this._logService.trace(`[Copilot:${sessionId}] Ignoring passive system.notification kind=${e.data.kind.type} without an active turn`);
        return;
      }
      const turnId = generateUuid();
      this.resetTurnState(turnId);
      this._emitAction({
        type: ActionType.ChatTurnStarted,
        turnId,
        startedAt: (/* @__PURE__ */ new Date()).toISOString(),
        message: {
          text: notification.messageText,
          origin: { kind: MessageKind.SystemNotification }
        }
      });
    }));
    this._register(wrapper.onUserMessage((e) => {
      if (e.agentId) {
        this._resumeSubagentForEvent(e, { text: e.data.content, origin: { kind: MessageKind.User } });
        return;
      }
      if (e.data.source && e.data.source.toLowerCase() !== "user") {
        return;
      }
      this._currentTurn?.markRunning();
      const steering = this._takeMatchingPendingSteering(e.data.content);
      if (steering) {
        this._beginSteeringTurn(steering);
      }
      if (this._turnId) {
        this._databaseRef.object.setTurnEventId(this._turnId, e.id);
      }
    }));
    this._register(wrapper.onMessageDelta((e) => {
      this._logService.trace(`[Copilot:${sessionId}] delta: ${e.data.deltaContent}`);
      this._resumeSubagentForEvent(e);
      if (this._shouldDropUnmappedSubagentEvent(e, "assistant.message_delta")) {
        return;
      }
      this._emitMarkdownDelta(e.data.deltaContent, this._parentToolCallIdForSubagentEvent(e));
    }));
    this._register(wrapper.onMessage((e) => {
      this._logService.info(`[Copilot:${sessionId}] Full message received: ${e.data.content.length} chars`);
      this._resumeSubagentForEvent(e);
      if (!e.agentId) {
        const clientType = this._currentTurn?.clientType ?? AgentHostClientType.Unknown;
        void this._telemetryReporter.assistantMessageReceived(this.resourceUri.toString(), clientType, e.data.clientRequestId, this._appliedSnapshot.tools).catch((err) => this._logService.trace(`[Copilot:${this.sessionId}] Telemetry emission failed: ${getErrorMessage(err)}`));
        void this._telemetryReporter.modelMessageText(this.resourceUri.toString(), clientType, e.data.content, this._turnOrdinal, e.data.clientRequestId).catch((err) => this._logService.trace(`[Copilot:${this.sessionId}] Telemetry emission failed: ${getErrorMessage(err)}`));
        const turn = this._currentTurn;
        if (turn) {
          turn.toolCallRounds++;
          if (e.data.model) {
            turn.lastModel = e.data.model;
          }
          const toolRequests = e.data.toolRequests;
          if (toolRequests?.length) {
            turn.totalToolCalls += toolRequests.length;
            if (toolRequests.length > 1) {
              turn.parallelToolCallRounds++;
              turn.parallelToolCallsTotal += toolRequests.length;
            }
            for (const req of toolRequests) {
              turn.toolCounts.set(req.name, (turn.toolCounts.get(req.name) ?? 0) + 1);
            }
          }
        }
      }
      if (this._shouldDropUnmappedSubagentEvent(e, "assistant.message")) {
        return;
      }
      const parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
      const markdownScope = parentToolCallId ?? "";
      if (e.data.content && !this._currentTurn?.markdownPartIds.has(markdownScope)) {
        const partId = generateUuid();
        this._currentTurn?.markdownPartIds.set(markdownScope, partId);
        this._emitAction({
          type: ActionType.ChatResponsePart,
          turnId: this._turnId,
          part: { kind: ResponsePartKind.Markdown, id: partId, content: e.data.content }
        }, parentToolCallId);
      }
      if (e.data.toolRequests?.length) {
        this._beginToolCallRound(parentToolCallId);
      }
    }));
    this._register(wrapper.onPermissionRequested((e) => {
      const toolCallId = e.data.permissionRequest.toolCallId;
      if (!toolCallId) {
        return;
      }
      this._recordAutoApproval(toolCallId, e.data.promptRequest?.autoApproval);
      const existing = this._toolApprovalRecords.get(toolCallId);
      const permissionRequest = e.data.permissionRequest;
      this._toolApprovalRecords.set(toolCallId, {
        permissionRequested: true,
        resolvedByHook: existing?.resolvedByHook || e.data.resolvedByHook === true,
        requestSandboxBypass: existing?.requestSandboxBypass || permissionRequest.requestSandboxBypass === true,
        resultKind: existing?.resultKind,
        toolName: existing?.toolName ?? permissionRequest.toolName,
        mcpServerName: existing?.mcpServerName,
        reported: existing?.reported ?? false
      });
    }));
    this._register(wrapper.onPermissionCompleted((e) => {
      const toolCallId = e.data.toolCallId;
      if (!toolCallId) {
        return;
      }
      const existing = this._toolApprovalRecords.get(toolCallId);
      const record = {
        permissionRequested: existing?.permissionRequested ?? true,
        resolvedByHook: existing?.resolvedByHook ?? false,
        requestSandboxBypass: existing?.requestSandboxBypass ?? false,
        resultKind: e.data.result.kind,
        toolName: existing?.toolName,
        mcpServerName: existing?.mcpServerName,
        reported: existing?.reported ?? false
      };
      this._toolApprovalRecords.set(toolCallId, record);
      this._reportToolApproval(toolCallId, record.toolName, record.mcpServerName);
      if (isPermissionDeniedKind(record.resultKind)) {
        this._toolApprovalRecords.delete(toolCallId);
      }
    }));
    this._register(wrapper.onToolCallDelta((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Tool call delta: ${e.data.toolName ?? "<pending>"} (${e.data.toolCallId})`);
      this._resumeSubagentForEvent(e);
      if (this._shouldDropUnmappedSubagentEvent(e, "assistant.tool_call_delta")) {
        return;
      }
      const existing = this._streamingToolCalls.get(e.data.toolCallId);
      const streaming = existing ?? {
        input: "",
        toolName: void 0,
        parentToolCallId: void 0,
        started: false,
        displayedInputLength: 0,
        displayedMessage: void 0
      };
      streaming.input += e.data.inputDelta;
      if (e.data.toolName) {
        if (streaming.toolName && streaming.toolName !== e.data.toolName) {
          this._logService.warn(`[Copilot:${sessionId}] Tool call ${e.data.toolCallId} changed name while streaming from ${streaming.toolName} to ${e.data.toolName}`);
        } else {
          streaming.toolName = e.data.toolName;
        }
      }
      this._streamingToolCalls.set(e.data.toolCallId, streaming);
      const toolName = streaming.toolName;
      if (!toolName || isHiddenTool(toolName) || isTaskCompleteTool(toolName) || this._clientToolNames.has(this._clientToolName(toolName))) {
        return;
      }
      if (!streaming.started) {
        streaming.parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
      }
      if (!streaming.started) {
        streaming.started = true;
        this._emitAction({
          type: ActionType.ChatToolCallStart,
          turnId: this._turnId,
          toolCallId: e.data.toolCallId,
          toolName,
          displayName: getToolDisplayName(toolName),
          contributor: this._getToolCallContributor(toolName, void 0),
          _meta: toToolCallMeta(this._createToolCallMeta(toolName, void 0))
        }, streaming.parentToolCallId);
        this._emitStreamingToolCallDisplay(e.data.toolCallId, streaming);
        return;
      }
      this._scheduleStreamingToolCallDisplay(e.data.toolCallId);
    }));
    this._register(wrapper.onToolStart((e) => {
      if (isHiddenTool(e.data.toolName)) {
        this._streamingToolDisplaySchedulers.deleteAndDispose(e.data.toolCallId);
        this._streamingToolCalls.delete(e.data.toolCallId);
        this._logService.trace(`[Copilot:${sessionId}] Tool started (hidden): ${e.data.toolName}`);
        return;
      }
      this._logService.info(`[Copilot:${sessionId}] Tool started: ${e.data.toolName}`);
      let toolArgs = e.data.arguments !== void 0 ? tryStringify(e.data.arguments) : void 0;
      let parameters;
      if (toolArgs) {
        try {
          parameters = JSON.parse(toolArgs);
        } catch {
        }
      }
      if (stripRedundantCdPrefix(e.data.toolName, parameters, this._workingDirectory)) {
        toolArgs = tryStringify(parameters);
      }
      const displayName = getToolDisplayName(e.data.toolName);
      const streamed = this._streamingToolCalls.get(e.data.toolCallId);
      this._streamingToolDisplaySchedulers.deleteAndDispose(e.data.toolCallId);
      if (streamed?.started && streamed.displayedInputLength < streamed.input.length) {
        this._emitStreamingToolCallDisplay(e.data.toolCallId, streamed);
      }
      this._streamingToolCalls.delete(e.data.toolCallId);
      if (streamed?.toolName && streamed.toolName !== e.data.toolName) {
        this._logService.warn(`[Copilot:${sessionId}] Tool call ${e.data.toolCallId} started as ${e.data.toolName} after streaming as ${streamed.toolName}`);
      }
      this._resumeSubagentForEvent(e);
      if (!streamed?.started && this._shouldDropUnmappedSubagentEvent(e, "tool.execution_start")) {
        this._unroutableSubagentToolCallIds.add(e.data.toolCallId);
        return;
      }
      const parentToolCallId = streamed?.parentToolCallId ?? this._parentToolCallIdForSubagentEvent(e);
      const clientToolName = this._clientToolName(e.data.toolName);
      const isClientTool = this._clientToolNames.has(clientToolName);
      const isToolSearch = this._isToolSearchActive() && e.data.toolName === RUNTIME_TOOL_SEARCH_TOOL_NAME;
      const contributor = this._getToolCallContributor(e.data.toolName, e.data.mcpServerName);
      const intention = getShellIntention(e.data.toolName, parameters);
      this._activeToolCalls.set(e.data.toolCallId, {
        toolName: e.data.toolName,
        displayName,
        parameters,
        content: [],
        parentToolCallId,
        mcpServerName: e.data.mcpServerName,
        contributor,
        intention,
        meta: void 0
      });
      const existingApproval = this._toolApprovalRecords.get(e.data.toolCallId);
      const approvalRecord = {
        permissionRequested: existingApproval?.permissionRequested ?? false,
        resolvedByHook: existingApproval?.resolvedByHook ?? false,
        requestSandboxBypass: existingApproval?.requestSandboxBypass ?? false,
        resultKind: existingApproval?.resultKind,
        toolName: e.data.toolName,
        mcpServerName: e.data.mcpServerName,
        reported: existingApproval?.reported ?? false
      };
      this._toolApprovalRecords.set(e.data.toolCallId, approvalRecord);
      if (approvalRecord.resultKind !== void 0) {
        this._reportToolApproval(e.data.toolCallId, e.data.toolName, e.data.mcpServerName);
      }
      if (isShellTool(e.data.toolName)) {
        this._nonPtyShellTerminals.track(e.data.toolCallId, displayName);
      }
      if (isTaskCompleteTool(e.data.toolName)) {
        this._beginToolCallRound(parentToolCallId);
        return;
      }
      if (!streamed?.started) {
        this._beginToolCallRound(parentToolCallId);
      }
      const meta = this._createToolCallMeta(e.data.toolName, parameters);
      if (e.data.mcpServerName) {
        meta.mcpServerName = e.data.mcpServerName;
      }
      if (e.data.mcpToolName) {
        meta.mcpToolName = e.data.mcpToolName;
      }
      const resourceUri = e.data.toolDescription?._meta?.ui?.resourceUri;
      this._setToolCallUiMeta(meta, resourceUri, e.data.mcpServerName);
      const tracked = this._activeToolCalls.get(e.data.toolCallId);
      if (tracked) {
        tracked.meta = meta;
      }
      if (!streamed?.started) {
        this._emitAction({
          type: ActionType.ChatToolCallStart,
          turnId: this._turnId,
          toolCallId: e.data.toolCallId,
          toolName: e.data.toolName,
          displayName,
          intention,
          contributor,
          _meta: toToolCallMeta(meta)
        }, parentToolCallId);
      }
      if (isClientTool && !contributor) {
        this._logService.warn(`[Copilot:${sessionId}] Client tool '${e.data.toolName}' started with no connected client; failing it immediately.`);
        this._reportToolApprovalIfNoPermission(e.data.toolCallId);
        this._toolApprovalRecords.delete(e.data.toolCallId);
        this._activeToolCalls.delete(e.data.toolCallId);
        this._emitAction({
          type: ActionType.ChatToolCallReady,
          turnId: this._turnId,
          toolCallId: e.data.toolCallId,
          ...contributor ? { contributor } : {},
          ...intention !== void 0 ? { intention } : {},
          invocationMessage: getInvocationMessage(e.data.toolName, displayName, parameters, (path) => this._resolveEditFilePath(path)),
          toolInput: getToolInputString(e.data.toolName, parameters, toolArgs),
          confirmed: ToolCallConfirmationReason.NotNeeded,
          _meta: toToolCallMeta(meta)
        }, parentToolCallId);
        this._emitAction({
          type: ActionType.ChatToolCallComplete,
          turnId: this._turnId,
          toolCallId: e.data.toolCallId,
          result: {
            success: false,
            pastTenseMessage: `${displayName} failed`,
            error: { message: `No client was connected to run ${displayName}` }
          }
        }, parentToolCallId);
        this._pendingClientToolCalls.respondOrBuffer(e.data.toolCallId, {
          textResultForLlm: `No client was connected to run ${displayName}.`,
          resultType: "failure",
          error: "No client connected"
        });
        return;
      }
      const clientToolAutoApproved = contributor?.kind === ToolCallContributorKind.Client && this._lastAppliedPermissionMode === "on";
      if (isToolSearch && clientToolAutoApproved) {
        meta.autoApproveBySetting = true;
      }
      const shouldWaitForClientToolReady = contributor?.kind === ToolCallContributorKind.Client && !isAgentCoordinationTool(e.data.toolName) && (isToolSearch || !clientToolAutoApproved);
      if (shouldWaitForClientToolReady) {
        return;
      }
      this._emitAction({
        type: ActionType.ChatToolCallReady,
        turnId: this._turnId,
        toolCallId: e.data.toolCallId,
        ...contributor ? { contributor } : {},
        ...intention !== void 0 ? { intention } : {},
        invocationMessage: getInvocationMessage(e.data.toolName, displayName, parameters, (path) => this._resolveEditFilePath(path)),
        toolInput: getToolInputString(e.data.toolName, parameters, toolArgs),
        confirmed: ToolCallConfirmationReason.NotNeeded,
        _meta: toToolCallMeta(clientToolAutoApproved ? { ...meta, autoApproveBySetting: true } : meta)
      }, parentToolCallId);
    }));
    this._register(wrapper.onToolComplete(async (e) => {
      this._approvedDuplicablePermissionSignatures.delete(e.data.toolCallId);
      const tracked = this._activeToolCalls.get(e.data.toolCallId);
      if (!tracked) {
        this._unroutableSubagentToolCallIds.delete(e.data.toolCallId);
        return;
      }
      const parentToolCallId = tracked.parentToolCallId ?? this._parentToolCallIdForSubagentEvent(e);
      if (!parentToolCallId && e.agentId) {
        this._logService.warn(`[Copilot:${this.sessionId}] Dropping tool.execution_complete for unknown subagent agentId=${e.agentId}`);
        return;
      }
      if (e.data.success && tracked.contributor === void 0) {
        const telemetrySession = parentToolCallId ? URI.parse(buildSubagentSessionUri(this._storageUri.toString(), parentToolCallId)) : this.resourceUri;
        reportCopilotTodoStoreOperation(this._telemetryService, telemetrySession, e.data.toolCallId, tracked.toolName, tracked.parameters, this._currentTurn?.clientContext);
      }
      this._logService.info(`[Copilot:${sessionId}] Tool completed: ${e.data.toolCallId}`);
      this._reportToolApprovalIfNoPermission(e.data.toolCallId);
      this._activeToolCalls.delete(e.data.toolCallId);
      this._autoApprovals.delete(e.data.toolCallId);
      this._toolApprovalRecords.delete(e.data.toolCallId);
      this._pendingAutoApprovals.respond(e.data.toolCallId, void 0);
      const displayName = tracked.displayName;
      const toolOutput = e.data.error?.message ?? e.data.result?.content;
      if (isTaskCompleteTool(tracked.toolName)) {
        const summary = getTaskCompleteMarkdown(tracked.parameters, toolOutput);
        if (summary) {
          this._emitAction({
            type: ActionType.ChatResponsePart,
            turnId: this._turnId,
            part: { kind: ResponsePartKind.Markdown, id: generateUuid(), content: summary }
          });
        }
        return;
      }
      const content = [...tracked.content];
      if (toolOutput !== void 0) {
        content.push({ type: ToolResultContentType.Text, text: toolOutput });
      }
      const isShellCommandTool = isShellTool(tracked.toolName);
      const ptyTerminalUri = isShellCommandTool ? this._shellManager?.getTerminalUriForToolCall(e.data.toolCallId) : void 0;
      let retireNonPtyShellTracking = !!ptyTerminalUri;
      if (ptyTerminalUri && !content.some((c) => c.type === ToolResultContentType.Terminal)) {
        content.push({
          type: ToolResultContentType.Terminal,
          resource: ptyTerminalUri,
          title: tracked.displayName
        });
      }
      const shellExit = appendSdkToolResultContent(
        content,
        e.data.result?.contents,
        isShellCommandTool ? { session: this.resourceUri, toolCallId: e.data.toolCallId, title: tracked.displayName } : void 0
      );
      if (isShellCommandTool && !ptyTerminalUri) {
        const completion = this._nonPtyShellTerminals.completeToolCall(e.data.toolCallId, toolOutput, shellExit);
        if (completion) {
          retireNonPtyShellTracking = completion.shouldRetire;
          const terminalIndex = content.findIndex((c) => c.type === ToolResultContentType.Terminal);
          if (terminalIndex === -1) {
            content.push({
              type: ToolResultContentType.Terminal,
              resource: completion.uri,
              title: tracked.displayName,
              isPty: false,
              ...completion.result ? { result: completion.result } : {}
            });
          } else if (completion.result) {
            const terminalBlock = content[terminalIndex];
            content[terminalIndex] = { ...terminalBlock, result: completion.result };
          }
        }
      }
      const command = isString(tracked.parameters?.command) ? tracked.parameters.command : void 0;
      const filePaths = isEditTool(tracked.toolName, command) ? this._getEditFilePaths(tracked.parameters) : [];
      for (const filePath of filePaths) {
        try {
          const fileEdit = await this._editTracker.takeCompletedEdit(this._turnId, e.data.toolCallId, filePath, tracked.toolName, tracked.parameters, this._lastSeenModelId, this._currentTurn?.clientContext);
          if (fileEdit) {
            content.push(fileEdit);
          }
        } catch (err) {
          this._logService.warn(`[Copilot:${sessionId}] Failed to take completed edit`, err);
        }
      }
      this._emitAction({
        type: ActionType.ChatToolCallComplete,
        turnId: this._turnId,
        toolCallId: e.data.toolCallId,
        result: {
          success: e.data.success,
          pastTenseMessage: getPastTenseMessage(tracked.toolName, displayName, tracked.parameters, e.data.success, e.data.success ? toolOutput : void 0, (path) => this._resolveEditFilePath(path)),
          content: content.length > 0 ? content : void 0,
          error: e.data.error
        },
        _meta: tracked.meta ? toToolCallMeta(tracked.meta) : void 0
      }, parentToolCallId);
      if (retireNonPtyShellTracking) {
        this._nonPtyShellTerminals.retire(e.data.toolCallId);
      }
    }));
    this._register(wrapper.onIdle((e) => {
      this._logService.info(`[Copilot:${sessionId}] Session idle`);
      if (e.data.aborted) {
        this._resetAbortToken();
      }
      if (this._hasActivity) {
        this._hasActivity = false;
        this._emitAction({
          type: ActionType.SessionActivityChanged,
          activity: void 0
        });
      }
      const turn = this._currentTurn;
      if (!turn) {
        return;
      }
      if (e.data.aborted) {
        this._cancelActiveRepoInfoTelemetry();
        if (turn.isRunning) {
          this._logService.trace(`[Copilot:${sessionId}] Idle from abort; tearing down running turn ${turn.id}`);
          this._reportToolCallDetails(turn, "cancelled");
          turn.markAborted();
          this._clearActiveTurn();
        } else {
          this._logService.trace(`[Copilot:${sessionId}] Idle from abort; leaving ${turn.state} turn ${turn.id} open`);
        }
        return;
      }
      this._completeActiveRepoInfoTelemetry();
      this._completeActiveTurn();
    }));
    this._register(wrapper.onSkillInvoked((e) => {
      this._logService.info(`[Copilot:${sessionId}] Skill invoked: ${e.data.name} (${e.data.path})`);
      this._resumeSubagentForEvent(e);
      if (this._shouldDropUnmappedSubagentEvent(e, "skill.invoked")) {
        return;
      }
      if (!e.agentId) {
        this._telemetryReporter.skillContentRead({
          clientType: this._currentTurn?.clientType ?? AgentHostClientType.Unknown,
          name: e.data.name,
          path: e.data.path,
          content: e.data.content,
          source: e.data.source,
          pluginName: e.data.pluginName,
          pluginVersion: e.data.pluginVersion
        });
      }
      const parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
      const synth = synthesizeSkillToolCall(e.data, e.id);
      this._emitAction({
        type: ActionType.ChatToolCallStart,
        turnId: this._turnId,
        toolCallId: synth.toolCallId,
        toolName: synth.toolName,
        displayName: synth.displayName
      }, parentToolCallId);
      this._emitAction({
        type: ActionType.ChatToolCallReady,
        turnId: this._turnId,
        toolCallId: synth.toolCallId,
        invocationMessage: synth.invocationMessage,
        confirmed: ToolCallConfirmationReason.NotNeeded
      }, parentToolCallId);
      this._emitAction({
        type: ActionType.ChatToolCallComplete,
        turnId: this._turnId,
        toolCallId: synth.toolCallId,
        result: {
          success: true,
          pastTenseMessage: synth.pastTenseMessage
        }
      }, parentToolCallId);
    }));
    this._register(wrapper.onSubagentStarted((e) => {
      if (e.agentId) {
        this._parentToolCallIdsByAgentId.set(e.agentId, e.data.toolCallId);
        this._activeSubagentAgentIds.add(e.agentId);
      }
      this._logService.info(`[Copilot:${sessionId}] Subagent started: toolCallId=${e.data.toolCallId}, agent=${e.data.agentName}`);
      const tracked = this._activeToolCalls.get(e.data.toolCallId);
      this._onDidSessionProgress.fire({
        kind: "subagent_started",
        chat: this._chatChannelUri,
        toolCallId: e.data.toolCallId,
        agentName: e.data.agentName,
        agentDisplayName: e.data.agentDisplayName,
        agentDescription: e.data.agentDescription,
        // Use the spawning Task tool's short description as the subagent chat title.
        taskDescription: tracked?.meta?.subagentDescription,
        // Seed the subagent chat with the spawning tool's full delegated prompt.
        taskPrompt: typeof tracked?.parameters?.prompt === "string" ? tracked.parameters.prompt : void 0,
        // Preserve the immediate parent tool-call edge so discovery content routes to the right ancestor chat.
        parentToolCallId: tracked?.parentToolCallId
      });
    }));
    this._register(wrapper.onSessionError((e) => {
      this._logService.error(`[Copilot:${sessionId}] Session error: ${e.data.errorType} - ${e.data.message}`);
      if (isCopilotSdkAuthRejection(e.data)) {
        this._onDidRequireAuth.fire();
      }
      reportCopilotSdkSessionError(this._telemetryService, e, createCopilotFailureCorrelation(this.resourceUri, this._chatChannelUri, this._turnId, this.sessionId, this._currentTurn?.clientContext));
      if (this._currentTurn) {
        this._reportToolCallDetails(this._currentTurn, "failed");
      }
      this._emitAction({
        type: ActionType.ChatError,
        turnId: this._turnId,
        duration: this._currentTurn?.duration ?? 0,
        error: buildChatErrorInfoFromCopilotSdkFields(e.data)
      });
    }));
    this._register(wrapper.onModelCallFailure((e) => {
      reportCopilotModelCallFailure(this._telemetryService, e, createCopilotFailureCorrelation(this.resourceUri, this._chatChannelUri, this._turnId, this.sessionId, this._currentTurn?.clientContext));
    }));
    let lastParentUsage;
    let lastParentUsageTurnId;
    let autoModeResolved;
    this._register(wrapper.onAutoModeResolved((e) => {
      this._lastSeenModelId = e.data.chosenModel;
      const turnId = this._turnId;
      this._logService.info(`[Copilot:${sessionId}] Auto mode resolved to ${e.data.chosenModel}${e.data.reasoningBucket ? ` (${e.data.reasoningBucket})` : ""}`);
      if (!turnId) {
        return;
      }
      if (!e.agentId) {
        this._telemetryReporter.autoModeRouterDecision({
          session: this.resourceUri.toString(),
          turnId,
          clientType: this._currentTurn?.clientType ?? AgentHostClientType.Unknown,
          chosenModel: e.data.chosenModel,
          predictedLabel: e.data.predictedLabel,
          confidence: e.data.confidence,
          candidateModels: e.data.candidateModels,
          categoryScores: e.data.categoryScores,
          routingMethod: e.data.routingMethod,
          availableModels: e.data.availableModels,
          fallback: e.data.fallback,
          fallbackReason: e.data.fallbackReason,
          stickyOverride: e.data.stickyOverride,
          routerLatencyMs: e.data.routerLatencyMs,
          endToEndLatencyMs: e.data.endToEndLatencyMs,
          chosenShortfall: e.data.chosenShortfall,
          hasImage: e.data.hasImage
        });
      }
      autoModeResolved = { turnId, data: e.data };
      const priorUsage = lastParentUsageTurnId === turnId ? lastParentUsage : void 0;
      const usage = {
        ...priorUsage,
        model: e.data.chosenModel,
        _meta: {
          ...priorUsage?._meta ?? {},
          autoModeResolved: e.data
        }
      };
      lastParentUsage = usage;
      lastParentUsageTurnId = turnId;
      this._emitAction({
        type: ActionType.ChatUsage,
        turnId,
        usage
      });
    }));
    this._register(wrapper.onUsage((e) => {
      this._resumeSubagentForEvent(e);
      const parentToolCallId = this._parentToolCallIdForSubagentEvent(e);
      if (!parentToolCallId && !e.agentId && !e.data.parentToolCallId) {
        this._promptCacheRefreshGeneration++;
        if (e.data.model && e.data.cacheExpiresAt) {
          this._setPromptCacheState({ modelId: e.data.model, cacheExpiresAt: e.data.cacheExpiresAt });
        } else if (e.data.model && this._promptCacheState?.modelId !== e.data.model) {
          this._setPromptCacheState(void 0);
        }
      }
      const copilotUsage = readCopilotUsage(e.data);
      const quotaSnapshots = normalizeQuotaSnapshots(e.data.quotaSnapshots);
      const turn = this._currentTurn;
      if (typeof e.data.model === "string" && e.data.model) {
        this._lastSeenModelId = e.data.model;
      }
      const eventContext = {
        inputTokens: e.data.inputTokens,
        outputTokens: e.data.outputTokens,
        model: e.data.model,
        cacheReadTokens: e.data.cacheReadTokens,
        ...typeof e.data.cost === "number" ? { cost: e.data.cost } : {}
      };
      if (!parentToolCallId && turn) {
        turn.parentContextUsage = eventContext;
      }
      turn?.addTokenTotals(eventContext.model, eventContext);
      const buildUsage = (context, scopedCopilotUsage, isParentScope) => {
        const metadata = {};
        if (typeof context.cost === "number") {
          metadata.cost = context.cost;
        }
        if (isParentScope && autoModeResolved?.turnId === this._turnId) {
          metadata.autoModeResolved = autoModeResolved.data;
        }
        if (scopedCopilotUsage) {
          metadata.copilotUsage = scopedCopilotUsage;
        }
        if (quotaSnapshots) {
          metadata.quotaSnapshots = quotaSnapshots;
        }
        const turnTokenTotals = isParentScope ? turn?.tokenTotals : void 0;
        if (turnTokenTotals) {
          metadata.turnTokenTotals = turnTokenTotals;
        }
        return {
          inputTokens: context.inputTokens,
          outputTokens: context.outputTokens,
          model: context.model,
          cacheReadTokens: context.cacheReadTokens,
          ...Object.keys(metadata).length > 0 ? { _meta: metadata } : {}
        };
      };
      if (turn && copilotUsage) {
        turn.copilotNanoAiu += copilotUsage.totalNanoAiu;
        if (parentToolCallId) {
          const scopedTotal = (turn.subagentNanoAiuByToolCallId.get(parentToolCallId) ?? 0) + copilotUsage.totalNanoAiu;
          turn.subagentNanoAiuByToolCallId.set(parentToolCallId, scopedTotal);
        }
      }
      const parentContext = parentToolCallId ? turn?.parentContextUsage ?? {} : eventContext;
      const parentUsage = buildUsage(parentContext, this._parentCopilotUsageMeta(), true);
      lastParentUsage = parentUsage;
      lastParentUsageTurnId = this._turnId;
      this._emitAction({
        type: ActionType.ChatUsage,
        turnId: this._turnId,
        usage: parentUsage
      });
      if (parentToolCallId) {
        const scopedTotal = turn?.subagentNanoAiuByToolCallId.get(parentToolCallId);
        const subagentCopilotUsage = copilotUsage && scopedTotal !== void 0 ? { ...copilotUsage, totalNanoAiu: scopedTotal } : void 0;
        this._emitAction({
          type: ActionType.ChatUsage,
          turnId: this._turnId,
          usage: buildUsage(eventContext, subagentCopilotUsage, false)
        }, parentToolCallId);
      }
    }));
    this._register(wrapper.onUsage(async (e) => {
      const isSubagentEvent = !!this._parentToolCallIdForSubagentEvent(e);
      const turnId = this._turnId;
      const baseUsage = lastParentUsageTurnId === turnId ? lastParentUsage : void 0;
      const usage = baseUsage ?? {
        inputTokens: e.data.inputTokens,
        outputTokens: e.data.outputTokens,
        model: e.data.model,
        cacheReadTokens: e.data.cacheReadTokens
      };
      await this._refreshSessionUsageMetrics();
      const attribution = isSubagentEvent ? void 0 : await this._readContextAttribution();
      if (!turnId) {
        return;
      }
      if (turnId !== this._turnId || usage !== lastParentUsage || lastParentUsageTurnId !== turnId) {
        return;
      }
      const copilotUsage = this._parentCopilotUsageMeta();
      if (!attribution && !copilotUsage) {
        return;
      }
      const enriched = {
        ...usage,
        _meta: {
          ...usage._meta ?? {},
          ...copilotUsage ? { copilotUsage } : {},
          ...attribution ? { contextAttribution: attribution } : {}
        }
      };
      lastParentUsage = enriched;
      lastParentUsageTurnId = turnId;
      this._emitAction({
        type: ActionType.ChatUsage,
        turnId,
        usage: enriched
      });
    }));
    this._register(wrapper.onSessionCompactionComplete(async (e) => {
      if (e.agentId || e.data.success === false) {
        return;
      }
      const copilotUsage = readCopilotUsage(e.data.compactionTokensUsed);
      const turn = this._currentTurn;
      const compactionTokens = e.data.compactionTokensUsed;
      turn?.addTokenTotals(compactionTokens?.model ?? this._lastSeenModelId, {
        inputTokens: compactionTokens?.inputTokens,
        outputTokens: compactionTokens?.outputTokens,
        cacheReadTokens: compactionTokens?.cacheReadTokens
      });
      const emitParentUsage = () => {
        const turnId = this._turnId;
        const parentCopilotUsage = this._parentCopilotUsageMeta();
        const turnTokenTotals = this._currentTurn?.tokenTotals;
        if (!turnId || !parentCopilotUsage && !turnTokenTotals) {
          return void 0;
        }
        const base = lastParentUsageTurnId === turnId ? lastParentUsage : void 0;
        const usage = {
          ...base,
          model: base?.model ?? this._lastSeenModelId,
          _meta: {
            ...base?._meta ?? {},
            ...parentCopilotUsage ? { copilotUsage: parentCopilotUsage } : {},
            ...turnTokenTotals ? { turnTokenTotals } : {}
          }
        };
        lastParentUsage = usage;
        lastParentUsageTurnId = turnId;
        this._emitAction({
          type: ActionType.ChatUsage,
          turnId,
          usage
        });
        return turnId;
      };
      if (turn && copilotUsage) {
        turn.copilotNanoAiu += copilotUsage.totalNanoAiu;
        emitParentUsage();
      }
      const turnIdBeforeRefresh = this._turnId;
      if (await this._refreshSessionUsageMetrics() && turnIdBeforeRefresh === this._turnId) {
        emitParentUsage();
      }
    }));
    this._register(wrapper.onReasoningDelta((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Reasoning delta: ${e.data.deltaContent.length} chars`);
      this._resumeSubagentForEvent(e);
      if (this._shouldDropUnmappedSubagentEvent(e, "assistant.reasoning_delta")) {
        return;
      }
      this._emitReasoningDelta(e.data.deltaContent, this._parentToolCallIdForSubagentEvent(e));
    }));
    this._register(wrapper.onSessionModeChanged((e) => {
      if (e.agentId) {
        this._logService.trace(`[Copilot:${sessionId}] Ignoring subagent session.mode_changed: agentId=${e.agentId}, ${e.data.previousMode} -> ${e.data.newMode}`);
        return;
      }
      this._logService.info(`[Copilot:${sessionId}] session.mode_changed: ${e.data.previousMode} -> ${e.data.newMode}`);
      const newMode = e.data.newMode;
      if (newMode !== "interactive" && newMode !== "plan" && newMode !== "autopilot") {
        return;
      }
      this._lastAppliedMode = newMode;
      this._syncAhpConfigFromSdkMode(newMode);
    }));
    this._register(wrapper.onMcpServersLoaded((e) => {
      this._logMcpServersSnapshot(e.data.servers.map((s) => ({
        name: s.name,
        status: s.status,
        error: s.error,
        source: s.source,
        transport: s.transport,
        pluginName: s.pluginName,
        pluginVersion: s.pluginVersion
      })), "loaded");
      this._applyMcpServerList(e.data.servers);
    }));
    this._register(wrapper.onMcpServerStatusChanged((e) => {
      this._logMcpServerLifecycle({ name: e.data.serverName, status: e.data.status, error: e.data.error, origin: "statusChanged" });
      const server = this._toSdkMcpServer(e.data.serverName, e.data.status, e.data.error);
      if (!server) {
        this._mcpCustomizations.remove(e.data.serverName);
        return;
      }
      this._mcpCustomizations.applyOne(server);
    }));
    this._register(wrapper.onToolsUpdated(() => {
      this._slashCommandProvider.clearCache();
      this._fireMcpToolsListChanged();
    }));
    this._register(wrapper.onCommandsChanged(() => {
      this._slashCommandProvider.clearCache();
    }));
    this._seedMcpServersFromRpc();
  }
  /**
   * One-shot fetch of `rpc.mcp.list` at subscription time. Best-effort:
   * any failure is logged and the inventory simply stays empty until the
   * next live event arrives.
   */
  _seedMcpServersFromRpc() {
    this._refreshMcpServersFromRpc().catch((err) => {
      this._logService.warn(`[Copilot:${this.sessionId}] Failed to seed MCP server inventory`, err);
    });
  }
  async _refreshMcpServersFromRpc() {
    const mcpRpc = this._wrapper.session.rpc?.mcp;
    if (!mcpRpc) {
      return;
    }
    const result = await mcpRpc.list();
    if (!this._store.isDisposed) {
      this._logMcpServersSnapshot(result.servers.map((s) => ({
        name: s.name,
        status: s.status,
        error: s.error,
        source: s.source,
        pluginName: s.sourcePlugin,
        pluginVersion: s.sourcePluginVersion
      })), "inventory");
      this._applyMcpServerList(result.servers);
    }
  }
  _applyMcpServerList(servers) {
    const sdkServers = servers.map((s) => this._toSdkMcpServer(s.name, s.status, s.error));
    this._mcpCustomizations.applyAll(sdkServers);
  }
  /**
   * Logs a full MCP inventory snapshot ({@link _logMcpServerLifecycle} per
   * server), then forgets the dedup entry for any server that dropped out of
   * the snapshot so a later re-add re-logs its arrival.
   */
  _logMcpServersSnapshot(servers, origin) {
    const seen = /* @__PURE__ */ new Set();
    for (const server of servers) {
      seen.add(server.name);
      this._logMcpServerLifecycle({ ...server, origin });
    }
    for (const name of [...this._lastLoggedMcpStatus.keys()]) {
      if (!seen.has(name)) {
        this._lastLoggedMcpStatus.delete(name);
      }
    }
  }
  /**
   * Emits a single structured MCP lifecycle log record for `server`,
   * deduplicated by SDK status so an unchanged re-report stays quiet. Failed
   * servers log at `error` (carrying the failure text in the body and an
   * `errorType` attribute); every other transition logs at `info`. Records
   * flow through {@link ILogService} to the agent host's OTLP log stream.
   */
  _logMcpServerLifecycle(server) {
    if (this._lastLoggedMcpStatus.get(server.name) === server.status) {
      return;
    }
    this._lastLoggedMcpStatus.set(server.name, server.status);
    const state = this._translateSdkMcpStatus(server.name, server.status, server.error);
    const attributes = {
      mcpEvent: server.origin,
      mcpServer: server.name,
      mcpStatus: server.status,
      mcpState: state.kind
    };
    if (server.source) {
      attributes.mcpSource = server.source;
    }
    if (server.transport) {
      attributes.mcpTransport = server.transport;
    }
    if (server.pluginName) {
      attributes.mcpPlugin = server.pluginName;
    }
    if (server.pluginVersion) {
      attributes.mcpPluginVersion = server.pluginVersion;
    }
    if (state.kind === McpServerStatus.Error) {
      attributes.errorType = state.error.errorType;
    }
    const detail = server.error ? `: ${server.error}` : "";
    const message = `[Copilot:${this.sessionId}] MCP server '${server.name}' ${server.status} (${state.kind})${detail}`;
    if (server.status === "failed") {
      this._logService.error(message, new OtelData(attributes));
    } else {
      this._logService.info(message, new OtelData(attributes));
    }
  }
  _setToolCallUiMeta(meta, resourceUri, mcpServerName) {
    if (!resourceUri) {
      return;
    }
    const ui = { resourceUri };
    if (mcpServerName) {
      const channel = this._mcpCustomizations.channelForServer(mcpServerName);
      if (channel !== void 0) {
        ui.channel = channel;
      }
    }
    meta.ui = ui;
  }
  /**
   * Broadcasts `notifications/tools/list_changed` for every MCP server
   * currently in the `Ready` state. The SDK's `session.tools_updated`
   * event is a coarse "tools refreshed" hint that doesn't identify
   * which server changed, so we fan out to all ready channels. Clients
   * are expected to refetch `tools/list` on each notification.
   */
  _fireMcpToolsListChanged() {
    for (const { channel } of this._mcpCustomizations.readyChannels()) {
      this._onMcpNotification.fire({
        channel,
        method: "notifications/tools/list_changed"
      });
    }
  }
  /** Snapshot of MCP servers that have no plugin-derived child entry. */
  topLevelMcpCustomizations() {
    return this._mcpCustomizations.topLevelCustomizations();
  }
  mcpServerOwners() {
    return this._mcpCustomizations.pluginMcpServerSources;
  }
  /**
   * Translates the SDK's flat MCP status string into AHP's discriminated
   * {@link McpServerState} union.
   */
  _toSdkMcpServer(name, status, error) {
    return {
      name,
      state: this._translateSdkMcpStatus(name, status, error),
      enabled: status !== "disabled"
    };
  }
  _translateSdkMcpStatus(name, status, error) {
    switch (status) {
      case "connected":
        return { kind: McpServerStatus.Ready };
      case "failed":
        return {
          kind: McpServerStatus.Error,
          error: {
            errorType: "mcp-server-failed",
            message: error ?? "MCP server failed to start"
          }
        };
      case "pending":
      case "needs-auth": {
        const previous = this._mcpCustomizations.stateForServer(name);
        if (previous?.kind === McpServerStatus.AuthRequired) {
          return previous;
        }
        return { kind: McpServerStatus.Starting };
      }
      case "disabled":
      case "not_configured":
        return { kind: McpServerStatus.Stopped };
      default:
        return { kind: McpServerStatus.Stopped };
    }
  }
  /**
   * Translates the SDK's three-mode space (`interactive` / `plan` /
   * `autopilot`) to AHP's `mode` axis directly:
   *
   *  - SDK `plan` → AHP `mode='plan'`.
   *  - SDK `interactive` → AHP `mode='interactive'`.
   *  - SDK `autopilot` → AHP `mode='autopilot'`.
   *
   * Autopilot lives on the `mode` axis; the orthogonal `autoApprove` axis
   * (Default / Bypass) is left untouched so the user's chosen
   * approval level is preserved across SDK mode transitions.
   *
   * Patches that already match the current AHP values are still
   * dispatched (the reducer is a no-op in that case) but written values
   * propagate to all subscribed clients via `session/configChanged`.
   */
  _syncAhpConfigFromSdkMode(sdkMode) {
    const sessionUri = this._ownerSessionUri.toString();
    const patch = {};
    switch (sdkMode) {
      case "plan":
        patch[SessionConfigKey.Mode] = "plan";
        break;
      case "autopilot":
        patch[SessionConfigKey.Mode] = "autopilot";
        break;
      case "interactive":
        patch[SessionConfigKey.Mode] = "interactive";
        break;
    }
    this._configurationService.updateSessionConfig(sessionUri, patch);
  }
  /**
   * Handles the CLI's `exitPlanMode.request` RPC by surfacing it as a
   * {@link ChatInputRequest} and awaiting the client's response. The
   * resolved {@link CopilotExitPlanModeResponse} flows back to the CLI, which
   * calls `session.respondToExitPlanMode` internally — that resumes the
   * paused `exit_plan_mode` tool call and (on accept) updates the SDK's
   * `currentMode` so the model can continue with implementation.
   */
  async _handleExitPlanModeRequest(data, _invocation) {
    const turnId = this._currentTurn?.id;
    if (!turnId) {
      this._logService.warn(`[Copilot:${this.sessionId}] Rejecting plan review request without an active turn`);
      return { approved: false };
    }
    const requestId = generateUuid();
    const questionId = generateUuid();
    this._logService.info(`[Copilot:${this.sessionId}] exitPlanMode.request: rpcId=${requestId}, actions=[${data.actions.join(",")}], recommended=${data.recommendedAction}`);
    let planPath = null;
    try {
      const planRead = await this._wrapper.session.rpc.plan.read();
      planPath = planRead.path ?? null;
    } catch (err) {
      this._logService.warn(`[Copilot:${this.sessionId}] rpc.plan.read failed for exit_plan_mode: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (this._currentTurn?.id !== turnId) {
      this._logService.warn(`[Copilot:${this.sessionId}] Rejecting plan review request after its turn ended`);
      return { approved: false };
    }
    const options = data.actions.map((actionId) => {
      const desc = getPlanActionDescription(actionId);
      return {
        id: actionId,
        label: desc?.label ?? actionId,
        description: desc?.description,
        recommended: actionId === data.recommendedAction
      };
    });
    const actions = options.map((option) => ({
      id: option.id,
      label: option.label,
      ...option.description ? { description: option.description } : {},
      ...option.recommended ? { default: true } : {}
    }));
    const inputRequest = {
      id: requestId,
      purpose: ChatInputRequestPurpose.PlanReview,
      planReview: {
        title: localize("agentHost.planReview.title", "Review Plan"),
        content: data.summary || localize("agentHost.planReview.fallbackSummary", "A plan is ready for review."),
        actions,
        canProvideFeedback: true,
        answerQuestionId: questionId,
        ...planPath ? { planUri: URI.file(planPath).toString() } : {}
      },
      questions: [{
        kind: ChatInputQuestionKind.SingleSelect,
        id: questionId,
        title: localize("agentHost.planReview.title", "Review Plan"),
        message: localize("agentHost.planReview.questionMessage", "How would you like to proceed?"),
        required: true,
        options,
        allowFreeformInput: true
      }]
    };
    const pendingPlanReview = this._pendingPlanReviews.register(requestId, {
      actions: data.actions,
      recommendedAction: data.recommendedAction,
      questionId
    });
    this._onDidSessionProgress.fire({
      kind: "action",
      resource: this._chatChannelUri,
      action: {
        type: ActionType.ChatInputRequested,
        request: inputRequest
      }
    });
    try {
      return await pendingPlanReview;
    } catch (err) {
      this._logService.error(err, `[Copilot:${this.sessionId}] exitPlanMode.request handler failed: rpcId=${requestId}`);
      return { approved: false };
    }
  }
  /**
   * Drop the memoized event reconstruction whenever the persisted event log
   * could have changed, so {@link _getMappedEvents} never serves stale turns
   * once the session resumes activity. While the session is idle (e.g. during
   * a historical session open) none of these fire, so the whole restore wave
   * coalesces to a single reconstruction.
   */
  _subscribeForMemoInvalidation() {
    const wrapper = this._wrapper;
    const invalidate = () => this._invalidateMappedEvents();
    this._register(wrapper.onUserMessage(invalidate));
    this._register(wrapper.onTurnStart(invalidate));
    this._register(wrapper.onMessage(invalidate));
    this._register(wrapper.onToolStart(invalidate));
    this._register(wrapper.onToolComplete(invalidate));
    this._register(wrapper.onSubagentStarted(invalidate));
    this._register(wrapper.onSubagentCompleted(invalidate));
    this._register(wrapper.onSubagentFailed(invalidate));
    this._register(wrapper.onTurnEnd(invalidate));
    this._register(wrapper.onSessionError(invalidate));
    this._register(wrapper.onSessionCompactionComplete(invalidate));
    this._register(wrapper.onSessionTruncation(invalidate));
    this._register(wrapper.onSessionSnapshotRewind(invalidate));
  }
  /**
   * Emits `instructionsCollected` per user message.
   * Attempts to match local chat's `ComputeAutomaticInstructions`
   * emitter (`src/vs/workbench/contrib/chat/common/promptSyntax/computeAutomaticInstructions.ts`)
   */
  _subscribeForInstructionsCollectedTelemetry() {
    const wrapper = this._wrapper;
    const sessionId = this.sessionId;
    this._register(wrapper.onUserMessage((e) => {
      if (e.agentId || e.data.source && e.data.source.toLowerCase() !== "user") {
        return;
      }
      const clientContext = this._currentTurn?.clientContext;
      void (async () => {
        let sources;
        try {
          sources = (await wrapper.session.rpc.instructions.getSources()).sources;
        } catch (err) {
          this._logService.trace(`[Copilot:${sessionId}] Failed to fetch instruction sources for telemetry: ${getErrorMessage(err)}`);
          return;
        }
        let agentInstructionsCount = 0;
        let applyingInstructionsCount = 0;
        let referencedInstructionsCount = 0;
        let claudeMdCount = 0;
        for (const s of sources) {
          if (s.type === "home" || s.type === "repo" || s.type === "model") {
            agentInstructionsCount++;
          }
          if (s.applyTo && s.applyTo.length > 0) {
            applyingInstructionsCount++;
          }
          if (s.type === "child-instructions" || s.type === "nested-agents") {
            referencedInstructionsCount++;
          }
          const lastSep = Math.max(s.sourcePath.lastIndexOf("/"), s.sourcePath.lastIndexOf("\\"));
          const filename = lastSep >= 0 ? s.sourcePath.slice(lastSep + 1) : s.sourcePath;
          if (filename === "CLAUDE.md") {
            claudeMdCount++;
          }
        }
        this._telemetryService.publicLog2("agentHost.instructionsCollected", {
          ...toInitiatorTelemetry(clientContext),
          provider: this.resourceUri.scheme,
          agentSessionId: AgentSession.id(this.resourceUri),
          isSubagentSession: isSubagentSession(this.resourceUri),
          totalInstructionsCount: sources.length,
          agentInstructionsCount,
          applyingInstructionsCount,
          referencedInstructionsCount,
          claudeMdCount
        });
      })().catch((err) => {
        this._logService.trace(`[Copilot:${sessionId}] instructionsCollected telemetry failed: ${getErrorMessage(err)}`);
      });
    }));
  }
  _subscribeForLogging() {
    const wrapper = this._wrapper;
    const sessionId = this.sessionId;
    this._register(wrapper.onUnhandledEvent((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Unhandled SDK event: ${safeStringify(e)}`);
    }));
    this._register(wrapper.onSessionStart((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Session started: model=${e.data.selectedModel ?? "default"}, producer=${e.data.producer}`);
    }));
    this._register(wrapper.onSessionResume((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Session resumed: eventCount=${e.data.eventCount}`);
    }));
    this._register(wrapper.onSessionInfo((e) => {
      const attributes = { infoType: e.data.infoType };
      if (e.data.tip) {
        attributes.tip = e.data.tip;
      }
      const message = `[Copilot:${sessionId}] [${e.data.infoType}]: ${e.data.message}`;
      const otelData = new OtelData(attributes);
      if (e.data.infoType === "mcp") {
        this._logService.info(message, otelData);
      } else {
        this._logService.trace(message, otelData);
      }
    }));
    this._register(wrapper.onSessionWarning((e) => {
      this._logService.warn(`[Copilot:${sessionId}] ${e.data.message}`, new OtelData({ warningType: e.data.warningType }));
    }));
    this._register(wrapper.onSessionModelChange((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Model changed: ${e.data.previousModel ?? "(none)"} -> ${e.data.newModel}`);
      if (!e.agentId) {
        this._promptCacheRefreshGeneration++;
        if (e.data.previousModel !== e.data.newModel) {
          this._setPromptCacheState(void 0);
        }
        void this._refreshSessionUsageMetrics();
      }
    }));
    this._register(wrapper.onManagedSettingsResolved((e) => {
      this._logService.info(`[Copilot:${sessionId}] Managed settings resolved: source=${e.data.source}, managedKeys=${e.data.managedKeys.join(",") || "(none)"}, bypassPermissionsDisabled=${e.data.bypassPermissionsDisabled}, failClosed=${e.data.failClosed}`);
    }));
    this._register(wrapper.onManagedSettingsEnforced((e) => {
      this._logService.warn(`[Copilot:${sessionId}] Managed settings enforced: action=${e.data.action}, setting=${e.data.setting}, escalation=${e.data.escalation ?? "(none)"}, failClosed=${e.data.failClosed}, message=${e.data.message}`);
    }));
    this._register(wrapper.onSessionHandoff((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Session handoff: sourceType=${e.data.sourceType}, remoteSessionId=${e.data.remoteSessionId ?? "(none)"}`);
    }));
    this._register(wrapper.onSessionTruncation((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Session truncation: removed ${e.data.tokensRemovedDuringTruncation} tokens, ${e.data.messagesRemovedDuringTruncation} messages`);
    }));
    this._register(wrapper.onSessionSnapshotRewind((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Snapshot rewind: upTo=${e.data.upToEventId}, eventsRemoved=${e.data.eventsRemoved}`);
    }));
    this._register(wrapper.onSessionShutdown((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Session shutdown: type=${e.data.shutdownType}, apiDuration=${e.data.totalApiDurationMs}ms`);
    }));
    this._register(wrapper.onSessionUsageInfo((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Usage info: ${e.data.currentTokens}/${e.data.tokenLimit} tokens, ${e.data.messagesLength} messages`);
    }));
    this._register(wrapper.onSessionCompactionStart(() => {
      this._logService.trace(`[Copilot:${sessionId}] Compaction started`);
    }));
    this._register(wrapper.onSessionCompactionComplete((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Compaction complete: success=${e.data.success}, tokensRemoved=${e.data.tokensRemoved ?? "?"}`);
    }));
    this._register(wrapper.onUserMessage((e) => {
      this._logService.trace(`[Copilot:${sessionId}] User message: ${e.data.content.length} chars, ${e.data.attachments?.length ?? 0} attachments`);
      if (!e.agentId && (!e.data.source || e.data.source.toLowerCase() === "user")) {
        void this._telemetryReporter.userMessageText(this.resourceUri.toString(), this._currentTurn?.clientType ?? AgentHostClientType.Unknown, e.data.content, this._turnOrdinal).catch((err) => this._logService.trace(`[Copilot:${this.sessionId}] Telemetry emission failed: ${getErrorMessage(err)}`));
      }
    }));
    this._register(wrapper.onPendingMessagesModified(() => {
      this._logService.trace(`[Copilot:${sessionId}] Pending messages modified`);
    }));
    this._register(wrapper.onTurnStart((e) => {
      this._currentTurn?.markRunning();
      this._logService.trace(`[Copilot:${sessionId}] Turn started: ${e.data.turnId}`);
      if (!e.agentId) {
        const telemetryMessageId = this._currentTurn?.id ?? e.data.turnId;
        if (this._activeRepoInfoTurn?.telemetryMessageId === telemetryMessageId) {
          return;
        }
        this._cancelActiveRepoInfoTelemetry();
        const turn = {
          telemetryMessageId,
          cancelled: false,
          begin: Promise.resolve(void 0)
        };
        const isCurrent = () => !turn.cancelled && this._isLaunchTokenCurrent();
        turn.begin = this._beginRepoInfoTelemetry(telemetryMessageId, this._currentTurn?.clientType ?? AgentHostClientType.Unknown, isCurrent);
        this._activeRepoInfoTurn = turn;
      }
    }));
    this._register(wrapper.onIntent((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Intent: ${e.data.intent}`);
      const activity = e.data.intent || void 0;
      if (activity === void 0 && !this._hasActivity) {
        return;
      }
      this._hasActivity = activity !== void 0;
      this._emitAction({
        type: ActionType.SessionActivityChanged,
        activity
      });
    }));
    this._register(wrapper.onReasoning((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Reasoning: ${e.data.content.length} chars`);
    }));
    this._register(wrapper.onTurnEnd((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Turn ended: ${e.data.turnId}`);
    }));
    this._register(wrapper.onAbort((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Aborted: ${e.data.reason}`);
      this._cancelActiveRepoInfoTelemetry();
      if (this._currentTurn?.isRunning) {
        this._reportToolCallDetails(this._currentTurn, "cancelled");
      }
    }));
    this._register(wrapper.onToolUserRequested((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Tool user-requested: ${e.data.toolName} (${e.data.toolCallId})`);
    }));
    this._register(wrapper.onToolPartialResult((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Tool partial result: ${e.data.toolCallId} (${e.data.partialOutput.length} chars)`);
      const tracked = this._activeToolCalls.get(e.data.toolCallId);
      if (!tracked || !isShellTool(tracked.toolName)) {
        return;
      }
      if (this._shellManager?.getTerminalUriForToolCall(e.data.toolCallId)) {
        return;
      }
      const appended = this._nonPtyShellTerminals.append(e.data.toolCallId, e.data.partialOutput);
      if (appended?.created) {
        const { uri } = appended;
        tracked.content.push({
          type: ToolResultContentType.Terminal,
          resource: uri,
          title: tracked.displayName,
          isPty: false
        });
        this._emitAction({
          type: ActionType.ChatToolCallContentChanged,
          turnId: this._turnId,
          toolCallId: e.data.toolCallId,
          content: tracked.content
        }, tracked.parentToolCallId);
      }
    }));
    this._register(wrapper.onToolProgress((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Tool progress: ${e.data.toolCallId} - ${e.data.progressMessage}`);
    }));
    this._register(wrapper.onSkillInvoked((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Skill invoked: ${e.data.name} (${e.data.path})`);
    }));
    this._register(wrapper.onSubagentStarted((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Subagent started: ${e.data.agentName} (${e.data.agentDisplayName})`);
    }));
    this._register(wrapper.onSubagentCompleted((e) => {
      this._completeSubagentTurn(e.agentId, e.data.toolCallId);
      this._logService.trace(`[Copilot:${sessionId}] Subagent completed: ${e.data.agentName}`);
    }));
    this._register(wrapper.onSubagentFailed((e) => {
      this._completeSubagentTurn(e.agentId, e.data.toolCallId);
      this._logService.error(`[Copilot:${sessionId}] Subagent failed: ${e.data.agentName} - ${e.data.error}`);
    }));
    this._register(wrapper.onSubagentSelected((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Subagent selected: ${e.data.agentName}`);
    }));
    this._register(wrapper.onHookStart((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Hook started: ${e.data.hookType} (${e.data.hookInvocationId})`);
    }));
    this._register(wrapper.onHookEnd((e) => {
      this._logService.trace(`[Copilot:${sessionId}] Hook ended: ${e.data.hookType} (${e.data.hookInvocationId}), success=${e.data.success}`);
      if (e.data.hookType === "agentStop") {
        this._completeSubagentTurn(e.agentId);
      }
    }));
    this._register(wrapper.onSystemMessage((e) => {
      this._logService.trace(`[Copilot:${sessionId}] System message [${e.data.role}]: ${e.data.content.length} chars`);
    }));
  }
  // ---- SDK event ID tracking & truncation ---------------------------------
  /**
   * Returns the SDK event ID for the turn inserted after the given turn,
   * or `undefined` if it's the last turn.
   */
  getNextTurnEventId(turnId) {
    return this._databaseRef.object.getNextTurnEventId(turnId);
  }
  /**
   * Returns the SDK event ID associated with the given protocol turn.
   */
  getTurnEventId(turnId) {
    return this._databaseRef.object.getTurnEventId(turnId);
  }
  /**
   * Returns the SDK event ID of the earliest turn.
   */
  getFirstTurnEventId() {
    return this._databaseRef.object.getFirstTurnEventId();
  }
  /**
   * Truncates the session history via the SDK's RPC and cleans up
   * stale turns from the session database.
   *
   * @param eventId The SDK event ID at which to truncate. This event
   *        and all events after it are removed.
   * @param keepTurnId If provided, turns inserted after this turn are
   *        deleted from the DB. If omitted, all turns are deleted.
   */
  async truncateAtEventId(eventId, keepTurnId) {
    this._logService.info(`[Copilot:${this.sessionId}] Truncating via SDK RPC at eventId=${eventId}`);
    const result = await this._wrapper.session.rpc.history.truncate({ eventId });
    this._logService.info(`[Copilot:${this.sessionId}] SDK truncation removed ${result.eventsRemoved} events`);
    if (keepTurnId) {
      await this._databaseRef.object.deleteTurnsAfter(keepTurnId);
    } else {
      await this._databaseRef.object.deleteAllTurns();
    }
  }
  /**
   * Bulk-remaps turn IDs in this session's database.
   * Used after file-copying a source session's database for a fork.
   */
  async remapTurnIds(mapping) {
    await this._databaseRef.object.remapTurnIds(mapping);
  }
  // ---- cleanup ------------------------------------------------------------
  /**
   * Cancels every pending interaction for abort and dispose. This completes synchronously before any awaiter resumes, so ordering is not significant.
   */
  _cancelAllPendingInteractions() {
    this._cancelPendingAutoApprovals();
    this._denyPendingPermissions();
    this._cancelPendingUserInputs();
    this._cancelPendingElicitations();
    this._cancelPendingPlanReviews();
    this._cancelPendingMcpAuthRequests();
    this._cancelPendingMcpSamplings();
    this._cancelPendingClientToolCalls();
  }
  _cancelPendingAutoApprovals() {
    this._pendingAutoApprovals.denyAll(void 0);
    this._autoApprovals.clear();
  }
  _denyPendingPermissions() {
    for (const [toolCallId] of this._pendingPermissions.entries()) {
      this._deletePendingEditContent(toolCallId);
    }
    this._pendingPermissions.denyAll({ kind: "reject" });
    this._approvedDuplicablePermissionSignatures.clear();
  }
  /**
   * Removes any `pending-edit-content:` entries associated with a resolved
   * (approved, denied, or cancelled) permission request.
   */
  _deletePendingEditContent(toolCallId) {
    const uri = this._pendingEditContentUris.get(toolCallId);
    if (!uri) {
      return;
    }
    this._pendingEditContentUris.delete(toolCallId);
    this._fileService.del(uri).catch((err) => {
      this._logService.warn(`[Copilot:${this.sessionId}] Failed to delete pending edit content: ${uri.toString()}`, err);
    });
  }
  _cancelPendingUserInputs() {
    this._pendingUserInputs.denyAll({ response: ChatInputResponseKind.Cancel });
  }
  _cancelPendingElicitations() {
    this._pendingElicitations.denyAll({ response: ChatInputResponseKind.Cancel });
  }
  _cancelPendingPlanReviews() {
    this._pendingPlanReviews.denyAll({ approved: false });
  }
  _cancelPendingMcpSamplings() {
    const pending = Array.from(this._pendingMcpSamplings);
    this._pendingMcpSamplings.clear();
    for (const requestId of pending) {
      this._wrapper.session.rpc.mcp.cancelSamplingExecution({ requestId }).catch(() => {
      });
    }
  }
  _cancelPendingClientToolCalls() {
    this._pendingClientToolCalls.denyAll({ textResultForLlm: "Tool call cancelled: session ended", resultType: "failure", error: "Session ended" });
  }
};
CopilotAgentSession = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ILogService),
  __decorateParam(3, ISessionDataService),
  __decorateParam(4, IFileService),
  __decorateParam(5, INativeEnvironmentService),
  __decorateParam(6, IAgentConfigurationService),
  __decorateParam(7, IAgentHostCustomizationEnablementService),
  __decorateParam(8, IAgentHostPromptCache),
  __decorateParam(9, ITelemetryService),
  __decorateParam(10, ICopilotApiService),
  __decorateParam(11, IAgentHostOTelService)
], CopilotAgentSession);
function countUnifiedDiffLines(diff) {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }
    if (line.startsWith("+")) {
      added++;
    } else if (line.startsWith("-")) {
      removed++;
    }
  }
  if (added === 0 && removed === 0) {
    return void 0;
  }
  return { added, removed };
}
function readCopilotUsage(raw) {
  if (!raw || typeof raw !== "object") {
    return void 0;
  }
  const usage = raw.copilotUsage;
  if (!usage || typeof usage !== "object") {
    return void 0;
  }
  const totalNanoAiu = usage.totalNanoAiu;
  if (typeof totalNanoAiu !== "number" || !Number.isFinite(totalNanoAiu) || totalNanoAiu < 0) {
    return void 0;
  }
  return { ...usage, totalNanoAiu };
}
function toTokenCount(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
}
function normalizeQuotaSnapshots(raw) {
  if (!raw || typeof raw !== "object") {
    return void 0;
  }
  const result = {};
  let hasAny = false;
  for (const [quotaType, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") {
      continue;
    }
    const v = value;
    const resetDateRaw = v.resetDate;
    const resetDate = typeof resetDateRaw === "string" ? resetDateRaw : resetDateRaw instanceof Date ? resetDateRaw.toISOString() : void 0;
    result[quotaType] = {
      isUnlimitedEntitlement: typeof v.isUnlimitedEntitlement === "boolean" ? v.isUnlimitedEntitlement : void 0,
      entitlementRequests: typeof v.entitlementRequests === "number" ? v.entitlementRequests : void 0,
      usedRequests: typeof v.usedRequests === "number" ? v.usedRequests : void 0,
      remainingPercentage: typeof v.remainingPercentage === "number" ? v.remainingPercentage : void 0,
      overage: typeof v.overage === "number" ? v.overage : void 0,
      overageAllowedWithExhaustedQuota: typeof v.overageAllowedWithExhaustedQuota === "boolean" ? v.overageAllowedWithExhaustedQuota : void 0,
      resetDate
    };
    hasAny = true;
  }
  return hasAny ? result : void 0;
}
export {
  CopilotAgentSession
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjb3BpbG90XFxjb3BpbG90QWdlbnRTZXNzaW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBDb3BpbG90U2Vzc2lvbiwgQ3VycmVudFRvb2xNZXRhZGF0YSwgRWxpY2l0YXRpb25Db250ZXh0LCBFbGljaXRhdGlvbkZpZWxkVmFsdWUsIEVsaWNpdGF0aW9uUmVzdWx0LCBFbGljaXRhdGlvblNjaGVtYSwgRWxpY2l0YXRpb25TY2hlbWFGaWVsZCwgRXhpdFBsYW5Nb2RlQ29tcGxldGVkRGF0YSwgRXhpdFBsYW5Nb2RlUmVxdWVzdCwgRXhpdFBsYW5Nb2RlUmVzdWx0LCBKc29uVmFsdWUsIE1jcFNlcnZlcnNMb2FkZWRTZXJ2ZXIsIE1lc3NhZ2VPcHRpb25zLCBQZXJtaXNzaW9uQWxsb3dBbGxNb2RlLCBQZXJtaXNzaW9uQXV0b0FwcHJvdmFsLCBQZXJtaXNzaW9uUmVxdWVzdCwgUGVybWlzc2lvblJlcXVlc3RSZXN1bHQsIFBlcm1pc3Npb25SZXN1bHQsIFNlc3Npb25Db25maWcsIFNlc3Npb25Ib29rcywgU2Vzc2lvbk1vZGUgYXMgQ29waWxvdFNka01vZGUsIFRvb2wsIFRvb2xSZXN1bHRPYmplY3QsIE1jcFNlcnZlclN0YXR1cyBhcyBTZGtNY3BTZXJ2ZXJTdGF0dXMgfSBmcm9tICdAZ2l0aHViL2NvcGlsb3Qtc2RrJztcbmltcG9ydCB7IHJhY2VDYW5jZWxsYXRpb24sIFJ1bk9uY2VTY2hlZHVsZXIsIFNlcXVlbmNlciwgU2VxdWVuY2VyQnlLZXksIFRocm90dGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGVuY29kZUJhc2U2NCwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciwgZ2V0RXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgSVJlZmVyZW5jZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBpc0F1dGhvcml6YXRpb25Qcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2F1dGguanMnO1xuaW1wb3J0IHsgc2FmZVN0cmluZ2lmeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgaXNBYnNvbHV0ZSwgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UsIG5vcm1hbGl6ZVBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IHNwbGl0TGluZXNJbmNsdWRlU2VwYXJhdG9ycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgaGFzS2V5LCBpc0RlZmluZWQsIGlzT2JqZWN0LCBpc1N0cmluZywgdHlwZSBNdXRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTG9nTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGdldENvcGlsb3RIb21lUGF0aCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb3BpbG90SG9tZS5qcyc7XG5pbXBvcnQgeyBDb3BpbG90Q2xpQ29uZmlnS2V5LCBjb3BpbG90Q2xpQ29uZmlnU2NoZW1hIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvcGlsb3RDbGlDb25maWcuanMnO1xuaW1wb3J0IHR5cGUgeyBDaGF0SW5wdXRSZXF1ZXN0V2l0aFBsYW5SZXZpZXcsIElBZ2VudEhvc3RQbGFuUmV2aWV3QWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFBsYW5SZXZpZXcuanMnO1xuaW1wb3J0IHsgZ2l0SHViTWNwU2VydmVyVXJsIH0gZnJvbSAnLi4vLi4vY29tbW9uL2dpdGh1YkVuZHBvaW50cy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTYW5kYm94Q29uZmlnS2V5LCBzYW5kYm94Q29uZmlnU2NoZW1hIH0gZnJvbSAnLi4vLi4vY29tbW9uL3NhbmRib3hDb25maWdTY2hlbWEuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0R2xvYmFsQXV0b0FwcHJvdmVFbmFibGVkQ29uZmlnS2V5LCBBZ2VudEhvc3RBdXRvUmVwbHlBbnN3ZXIsIEFnZW50SG9zdEF1dG9SZXBseUVuYWJsZWRDb25maWdLZXksIEFnZW50SG9zdERpc2FibGVSZXBvSW5mb1RlbGVtZXRyeUNvbmZpZ0tleSwgcGxhdGZvcm1Sb290U2NoZW1hLCBwbGF0Zm9ybVNlc3Npb25TY2hlbWEgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcbmltcG9ydCB7IGNyZWF0ZVVua25vd25BZ2VudEhvc3RDbGllbnRUZWxlbWV0cnlDb250ZXh0LCB0eXBlIElBZ2VudEhvc3RDbGllbnRUZWxlbWV0cnlDb250ZXh0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24sIEFnZW50U2lnbmFsLCBBdXRoZW50aWNhdGVQYXJhbXMsIElNY3BOb3RpZmljYXRpb24sIHR5cGUgSUFnZW50VG9vbFBlbmRpbmdDb25maXJtYXRpb25TaWduYWwgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnQuanMnO1xuaW1wb3J0IHsgTUVUQV9ESUZGX0JBU0VfQlJBTkNIIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdEdpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgc3RyaXBSZWR1bmRhbnRDZFByZWZpeCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb21tYW5kTGluZUhlbHBlcnMuanMnO1xuaW1wb3J0IHsgdG9Ub29sQ2FsbE1ldGEsIHR5cGUgSVRvb2xDYWxsTWV0YSwgdHlwZSBJVG9vbENhbGxVaU1ldGEsIHR5cGUgSVRvb2xTZWFyY2hDYW5kaWRhdGUgfSBmcm9tICcuLi8uLi9jb21tb24vbWV0YS9hZ2VudFRvb2xDYWxsTWV0YS5qcyc7XG5pbXBvcnQgeyBPdGVsRGF0YSwgdHlwZSBPdGVsQXR0cmlidXRlVmFsdWUgfSBmcm9tICcuLi8uLi9jb21tb24vb3RscC9vdGxwTG9nRW1pdHRlci5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25Db25maWdLZXlzLmpzJztcbmltcG9ydCB7IHJlc29sdmVDb3BpbG90Q29uZmlnU2xhc2hDb21tYW5kT25TZW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvcGlsb3RDb25maWdTbGFzaENvbW1hbmRzLmpzJztcbmltcG9ydCB7IFNUUkVBTUlOR19UT09MX0RJU1BMQVlfSU5URVJWQUxfTVMsIHN0cmVhbWluZ1Rvb2xEaXNwbGF5VGV4dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdHJlYW1pbmdUb29sQ2FsbERpc3BsYXkuanMnO1xuaW1wb3J0IHsgaXNBZ2VudEZlZWRiYWNrQW5ub3RhdGlvbnNBdHRhY2htZW50LCByZW5kZXJBZ2VudEZlZWRiYWNrQW5ub3RhdGlvbnNBdHRhY2htZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL21ldGEvYWdlbnRGZWVkYmFja0F0dGFjaG1lbnRzLmpzJztcbmltcG9ydCB7IElTZXNzaW9uRGF0YWJhc2UsIElTZXNzaW9uRGF0YVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RPVGVsU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9vdGVsL2FnZW50SG9zdE9UZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VBdHRhY2htZW50S2luZCwgVG9vbENhbGxDb250cmlidXRvcktpbmQsIHR5cGUgRmlsZUVkaXQsIHR5cGUgTWVzc2FnZUF0dGFjaG1lbnQsIHR5cGUgVG9vbENhbGxDb250cmlidXRvciB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlLCBpc0NoYXRBY3Rpb24sIHR5cGUgQ2hhdEFjdGlvbiwgdHlwZSBTZXNzaW9uQWN0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VLaW5kLCBSZXNwb25zZVBhcnRLaW5kLCBDaGF0SW5wdXRBbnN3ZXJTdGF0ZSwgQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLCBDaGF0SW5wdXRRdWVzdGlvbktpbmQsIENoYXRJbnB1dFJlcXVlc3RQdXJwb3NlLCBDaGF0SW5wdXRSZXNwb25zZUtpbmQsIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLCBUb29sQ2FsbFJpc2tBc3Nlc3NtZW50S2luZCwgVG9vbENhbGxSaXNrQXNzZXNzbWVudFN0YXR1cywgVG9vbENhbGxTdGF0dXMsIFRvb2xSZXN1bHRDb250ZW50VHlwZSwgYnVpbGRTdWJhZ2VudFNlc3Npb25VcmksIGlzU3ViYWdlbnRTZXNzaW9uLCB0eXBlIEN1c3RvbWl6YXRpb24sIHR5cGUgTWVzc2FnZSwgdHlwZSBQZW5kaW5nTWVzc2FnZSwgdHlwZSBDaGF0SW5wdXRBbnN3ZXIsIHR5cGUgQ2hhdElucHV0T3B0aW9uLCB0eXBlIENoYXRJbnB1dFF1ZXN0aW9uLCB0eXBlIENoYXRJbnB1dFJlcXVlc3QsIHR5cGUgVG9vbENhbGxSZXN1bHQsIHR5cGUgVG9vbFJlc3VsdENvbnRlbnQsIHR5cGUgVG9vbFJlc3VsdFRlcm1pbmFsQ29udGVudCwgdHlwZSBUdXJuLCB0eXBlIElUdXJuVG9rZW5Ub3RhbCwgdHlwZSBVc2FnZUluZm8sIHR5cGUgVXNhZ2VJbmZvTWV0YSwgdHlwZSBJQ29udGV4dEF0dHJpYnV0aW9uRGF0YSwgdHlwZSBJU2Vzc2lvblByb21wdENhY2hlU3RhdGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb3BpbG90U2Vzc2lvbldyYXBwZXIgfSBmcm9tICcuL2NvcGlsb3RTZXNzaW9uV3JhcHBlci5qcyc7XG5pbXBvcnQgeyBjbGllbnRUb29sTmFtZXNGcm9tU25hcHNob3QsIHR5cGUgQ29waWxvdFNlc3Npb25MYXVuY2hQbGFuLCB0eXBlIElBY3RpdmVDbGllbnRTbmFwc2hvdCwgdHlwZSBJQ29waWxvdFNlc3Npb25MYXVuY2hlciwgdHlwZSBJQ29waWxvdFNlc3Npb25SdW50aW1lIH0gZnJvbSAnLi9jb3BpbG90U2Vzc2lvbkxhdW5jaGVyLmpzJztcbmltcG9ydCB7IENMSUVOVF9UT09MX1NFQVJDSF9SRUZFUkVOQ0VfTkFNRSwgTk9OX0RFRkVSUkVEX0NMSUVOVF9UT09MX05BTUVTLCBSVU5USU1FX1RPT0xfU0VBUkNIX1RPT0xfTkFNRSB9IGZyb20gJy4vdG9vbFNlYXJjaERlZmVycmFsLmpzJztcbmltcG9ydCB7IEFjdGl2ZUNsaWVudFRvb2xTZXQgfSBmcm9tICcuLi9hY3RpdmVDbGllbnRTdGF0ZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlciwgdG9Jbml0aWF0b3JUZWxlbWV0cnksIHR5cGUgSUFnZW50SG9zdEluaXRpYXRvckNsYXNzaWZpY2F0aW9uLCB0eXBlIElBZ2VudEhvc3RJbml0aWF0b3JUZWxlbWV0cnkgfSBmcm9tICcuLi9hZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RSZXBvSW5mb1RlbGVtZXRyeSB9IGZyb20gJy4uL2FnZW50SG9zdFJlcG9JbmZvVGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IFBlbmRpbmdSZXF1ZXN0UmVnaXN0cnkgfSBmcm9tICcuLi8uLi9jb21tb24vcGVuZGluZ1JlcXVlc3RSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBidWlsZENvcGlsb3RTeXN0ZW1Ob3RpZmljYXRpb24gfSBmcm9tICcuL2NvcGlsb3RTeXN0ZW1Ob3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgcGFyc2VMZWFkaW5nU2xhc2hDb21tYW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdFNsYXNoQ29tbWFuZC5qcyc7XG5pbXBvcnQgdHlwZSB7IElVbnNhbmRib3hlZENvbW1hbmRDb25maXJtYXRpb25SZXF1ZXN0LCBTaGVsbE1hbmFnZXIgfSBmcm9tICcuL2NvcGlsb3RTaGVsbFRvb2xzLmpzJztcbmltcG9ydCB7IE5vblB0eVNoZWxsVGVybWluYWxTdHJlYW1zIH0gZnJvbSAnLi9jb3BpbG90Tm9uUHR5U2hlbGxUZXJtaW5hbHMuanMnO1xuaW1wb3J0IHsgYnVpbGRTYW5kYm94Q29uZmlnRm9yU2RrLCB0eXBlIENvcGlsb3RTYW5kYm94Q29uZmlnIH0gZnJvbSAnLi9zYW5kYm94Q29uZmlnRm9yU2RrLmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50U2VydmVyVG9vbEhvc3QgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRTZXJ2ZXJUb29scy5qcyc7XG5pbXBvcnQgeyBnZXRFZGl0RmlsZVBhdGhzLCBnZXRJbnZvY2F0aW9uTWVzc2FnZSwgZ2V0UGFzdFRlbnNlTWVzc2FnZSwgZ2V0UGVybWlzc2lvbkRpc3BsYXksIGdldFNoZWxsSW50ZW50aW9uLCBnZXRTaGVsbExhbmd1YWdlLCBnZXRTdHJlYW1pbmdJbnZvY2F0aW9uTWVzc2FnZSwgZ2V0U3ViYWdlbnRNZXRhZGF0YSwgZ2V0VGFza0NvbXBsZXRlTWFya2Rvd24sIGdldFRvb2xEaXNwbGF5TmFtZSwgZ2V0VG9vbElucHV0U3RyaW5nLCBnZXRUb29sS2luZCwgaXNBZ2VudENvb3JkaW5hdGlvblRvb2wsIGlzQ29waWxvdFNka1Rvb2xPdXRwdXRGaWxlLCBpc0VkaXRUb29sLCBpc0hpZGRlblRvb2wsIGlzU2hlbGxUb29sLCBpc1Rhc2tDb21wbGV0ZVRvb2wsIHBhcnNlQ29waWxvdFN0cmVhbWluZ1Rvb2xJbnB1dCwgc3ludGhlc2l6ZVNraWxsVG9vbENhbGwsIHRyeVN0cmluZ2lmeSB9IGZyb20gJy4vY29waWxvdFRvb2xEaXNwbGF5LmpzJztcbmltcG9ydCB7IEZpbGVFZGl0VHJhY2tlciB9IGZyb20gJy4uL3NoYXJlZC9maWxlRWRpdFRyYWNrZXIuanMnO1xuaW1wb3J0IHsgSUNvcGlsb3RBcGlTZXJ2aWNlLCB0eXBlIElSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dCB9IGZyb20gJy4uL3NoYXJlZC9jb3BpbG90QXBpU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudEhvc3RSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dCB9IGZyb20gJy4uL2FnZW50SG9zdFJlc3RyaWN0ZWRUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgYnVpbGRDaGF0RXJyb3JJbmZvRnJvbUNvcGlsb3RTZGtGaWVsZHMgfSBmcm9tICcuL2NvcGlsb3RTZGtDaGF0RXJyb3IuanMnO1xuaW1wb3J0IHsgTWNwQ3VzdG9taXphdGlvbkNvbnRyb2xsZXIsIHR5cGUgSVNka01jcFNlcnZlciB9IGZyb20gJy4uL3NoYXJlZC9tY3BDdXN0b21pemF0aW9uQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBnZXRTZGtNY3BTZXJ2ZXJFbmFibGVtZW50LCByZXNvbHZlQ3VzdG9taXphdGlvbkVuYWJsZW1lbnQsIHRhcmdldEZvck1jcFNlcnZlciB9IGZyb20gJy4uL3NoYXJlZC9jdXN0b21pemF0aW9uRW5hYmxlbWVudEdhdGUuanMnO1xuaW1wb3J0IHsgYXBwZW5kU2RrVG9vbFJlc3VsdENvbnRlbnQsIG1hcFNlc3Npb25FdmVudHMgfSBmcm9tICcuL21hcFNlc3Npb25FdmVudHMuanMnO1xuaW1wb3J0IHsgYWRkQXR0YWNobWVudERpc3BsYXlLaW5kVG9NaW1lVHlwZSwgYWRkU2ltcGxlQXR0YWNobWVudERpc3BsYXlLaW5kVG9NaW1lVHlwZSB9IGZyb20gJy4vY29waWxvdEF0dGFjaG1lbnRVdGlscy5qcyc7XG5pbXBvcnQgeyBidWlsZFBlbmRpbmdFZGl0Q29udGVudFVyaSB9IGZyb20gJy4vcGVuZGluZ0VkaXRDb250ZW50U3RvcmUuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uL2FnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0UHJvbXB0Q2FjaGUgfSBmcm9tICcuLi9hZ2VudEhvc3RQcm9tcHRDYWNoZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDbGllbnRUeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdENsaWVudEluZm8uanMnO1xuaW1wb3J0IHsgTWNwQXV0aFJlcXVpcmVkUmVhc29uLCBNY3BTZXJ2ZXJTdGF0dXMsIHR5cGUgTWNwQXV0aFJlcXVpcmVtZW50LCB0eXBlIE1jcFNlcnZlclN0YXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NoYW5uZWxzLXNlc3Npb24vc3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBFcnJvckluZm8sIFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbW9uL3N0YXRlLmpzJztcbmltcG9ydCB7IENvcGlsb3RTbGFzaENvbW1hbmRQcm92aWRlciB9IGZyb20gJy4vY29waWxvdFNsYXNoQ29tbWFuZFByb3ZpZGVyLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNvcGlsb3RGYWlsdXJlQ29ycmVsYXRpb24sIHJlcG9ydENvcGlsb3RNb2RlbENhbGxGYWlsdXJlLCByZXBvcnRDb3BpbG90U2RrU2Vzc2lvbkVycm9yIH0gZnJvbSAnLi9jb3BpbG90RmFpbHVyZVRlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyByZXBvcnRDb3BpbG90VG9kb1N0b3JlT3BlcmF0aW9uIH0gZnJvbSAnLi9jb3BpbG90VG9kb1N0b3JlVGVsZW1ldHJ5LmpzJztcblxudHlwZSBDb3BpbG90U2RrQXR0YWNobWVudCA9IFJlcXVpcmVkPE1lc3NhZ2VPcHRpb25zPlsnYXR0YWNobWVudHMnXVtudW1iZXJdO1xudHlwZSBDb3BpbG90Q29tbWFuZEludm9jYXRpb25SZXN1bHQgPSBBd2FpdGVkPFJldHVyblR5cGU8Q29waWxvdFNlc3Npb25bJ3JwYyddWydjb21tYW5kcyddWydpbnZva2UnXT4+O1xudHlwZSBSdW50aW1lU2xhc2hDb21tYW5kSW5mbyA9IEF3YWl0ZWQ8UmV0dXJuVHlwZTxDb3BpbG90U2Vzc2lvblsncnBjJ11bJ2NvbW1hbmRzJ11bJ2xpc3QnXT4+Wydjb21tYW5kcyddW251bWJlcl07XG50eXBlIEdpdEh1YkNyZWRlbnRpYWxzVXBkYXRlUmVzdWx0ID0gQXdhaXRlZDxSZXR1cm5UeXBlPENvcGlsb3RTZXNzaW9uWydycGMnXVsnZ2l0SHViQXV0aCddWydzZXRDcmVkZW50aWFscyddPj47XG50eXBlIE1jcEF1dGhIYW5kbGVyID0gTm9uTnVsbGFibGU8U2Vzc2lvbkNvbmZpZ1snb25NY3BBdXRoUmVxdWVzdCddPjtcbnR5cGUgTWNwQXV0aFJlcXVlc3QgPSBQYXJhbWV0ZXJzPE1jcEF1dGhIYW5kbGVyPlswXTtcbnR5cGUgTWNwQXV0aFJlc3VsdCA9IEF3YWl0ZWQ8UmV0dXJuVHlwZTxNY3BBdXRoSGFuZGxlcj4+O1xuaW50ZXJmYWNlIENvcGlsb3RFeGl0UGxhbk1vZGVSZXNwb25zZSBleHRlbmRzIEV4aXRQbGFuTW9kZVJlc3VsdCB7XG5cdHJlYWRvbmx5IGF1dG9BcHByb3ZlRWRpdHM/OiBFeGl0UGxhbk1vZGVDb21wbGV0ZWREYXRhWydhdXRvQXBwcm92ZUVkaXRzJ107XG59XG5cbmZ1bmN0aW9uIGlzQ29waWxvdFNka0F1dGhSZWplY3Rpb24oZXJyb3I6IHsgcmVhZG9ubHkgZXJyb3JUeXBlOiBzdHJpbmc7IHJlYWRvbmx5IHN0YXR1c0NvZGU/OiBudW1iZXIgfSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gKGVycm9yLmVycm9yVHlwZSA9PT0gJ2F1dGhlbnRpY2F0aW9uJyB8fCBlcnJvci5lcnJvclR5cGUgPT09ICdhdXRob3JpemF0aW9uJykgJiYgZXJyb3Iuc3RhdHVzQ29kZSA9PT0gNDAxO1xufVxuXG5pbnRlcmZhY2UgSVBlbmRpbmdNY3BBdXRoUmVxdWVzdCB7XG5cdHJlYWRvbmx5IHNlcnZlck5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgcmVzb3VyY2U6IFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGE7XG5cdHJlYWRvbmx5IHJlcXVpcmVkU2NvcGVzOiByZWFkb25seSBzdHJpbmdbXTtcblx0cmVhZG9ubHkgdG9vbENhbGxzOiBJTWNwQXV0aFRvb2xDYWxsW107XG59XG5cbmludGVyZmFjZSBJTWNwQXV0aFRvb2xDYWxsIHtcblx0cmVhZG9ubHkgdHVybklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRvb2xDYWxsSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgcGFyZW50VG9vbENhbGxJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5pbnRlcmZhY2UgSUNvcGlsb3RBY3RpdmVUb29sQ2FsbCB7XG5cdHJlYWRvbmx5IHRvb2xOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRpc3BsYXlOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBhcmFtZXRlcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBjb250ZW50OiBUb29sUmVzdWx0Q29udGVudFtdO1xuXHRyZWFkb25seSBwYXJlbnRUb29sQ2FsbElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG1jcFNlcnZlck5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY29udHJpYnV0b3I6IFRvb2xDYWxsQ29udHJpYnV0b3IgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGludGVudGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRtZXRhOiBJVG9vbENhbGxNZXRhIHwgdW5kZWZpbmVkO1xufVxuXG5pbnRlcmZhY2UgSUNvcGlsb3RTdHJlYW1pbmdUb29sQ2FsbCB7XG5cdGlucHV0OiBzdHJpbmc7XG5cdHRvb2xOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHBhcmVudFRvb2xDYWxsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0c3RhcnRlZDogYm9vbGVhbjtcblx0ZGlzcGxheWVkSW5wdXRMZW5ndGg6IG51bWJlcjtcblx0ZGlzcGxheWVkTWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5jb25zdCBTRVNTSU9OX1NUQVRFX0RJUkVDVE9SWSA9ICdzZXNzaW9uLXN0YXRlJztcbmNvbnN0IEVNUFRZX1RPT0xfUkVTVUxUX1RFWFQgPSAnPGVtcHR5IC8+JztcbmNvbnN0IFVTRVJfREVOSUVEX1BFUk1JU1NJT05fUkVTVUxUID0geyBraW5kOiAncmVqZWN0JywgZmVlZGJhY2s6ICdUaGUgdXNlciBkZW5pZWQgcGVybWlzc2lvbi4nIH0gc2F0aXNmaWVzIFBlcm1pc3Npb25SZXF1ZXN0UmVzdWx0O1xuXG5mdW5jdGlvbiBpc1Blcm1pc3Npb25EZW5pZWRLaW5kKGtpbmQ6IFBlcm1pc3Npb25SZXN1bHRbJ2tpbmQnXSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRzd2l0Y2ggKGtpbmQpIHtcblx0XHRjYXNlICdjYW5jZWxsZWQnOlxuXHRcdGNhc2UgJ2RlbmllZC1ieS1ydWxlcyc6XG5cdFx0Y2FzZSAnZGVuaWVkLW5vLWFwcHJvdmFsLXJ1bGUtYW5kLWNvdWxkLW5vdC1yZXF1ZXN0LWZyb20tdXNlcic6XG5cdFx0Y2FzZSAnZGVuaWVkLWludGVyYWN0aXZlbHktYnktdXNlcic6XG5cdFx0Y2FzZSAnZGVuaWVkLWJ5LWNvbnRlbnQtZXhjbHVzaW9uLXBvbGljeSc6XG5cdFx0Y2FzZSAnZGVuaWVkLWJ5LXBlcm1pc3Npb24tcmVxdWVzdC1ob29rJzpcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuZnVuY3Rpb24gbWFwUGVybWlzc2lvblJlc3VsdFRvQ29uZmlybUtpbmQoa2luZDogUGVybWlzc2lvblJlc3VsdFsna2luZCddIHwgdW5kZWZpbmVkLCByZXNvbHZlZEJ5SG9vazogYm9vbGVhbik6ICd1c2VyQWN0aW9uJyB8ICdzZXR0aW5nJyB8ICdjb25maXJtYXRpb25Ob3ROZWVkZWQnIHwgJ2RlbmllZCcge1xuXHRpZiAoa2luZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuICdjb25maXJtYXRpb25Ob3ROZWVkZWQnO1xuXHR9XG5cdGlmIChpc1Blcm1pc3Npb25EZW5pZWRLaW5kKGtpbmQpKSB7XG5cdFx0cmV0dXJuICdkZW5pZWQnO1xuXHR9XG5cdGlmIChraW5kID09PSAnYXBwcm92ZWQtZm9yLXNlc3Npb24nIHx8IGtpbmQgPT09ICdhcHByb3ZlZC1mb3ItbG9jYXRpb24nKSB7XG5cdFx0cmV0dXJuICdzZXR0aW5nJztcblx0fVxuXHRyZXR1cm4gcmVzb2x2ZWRCeUhvb2sgPyAnY29uZmlybWF0aW9uTm90TmVlZGVkJyA6ICd1c2VyQWN0aW9uJztcbn1cblxuXG5mdW5jdGlvbiBub3JtYWxpemVNY3BTZXJ2ZXJVcmwodmFsdWU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICghVVJMLmNhblBhcnNlKHZhbHVlKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgdXJsID0gbmV3IFVSTCh2YWx1ZSk7XG5cdHVybC5oYXNoID0gJyc7XG5cdHVybC5wYXRobmFtZSA9IHVybC5wYXRobmFtZS5yZXBsYWNlKC9cXC8rJC8sICcnKTtcblx0cmV0dXJuIHVybC5ocmVmO1xufVxuXG50eXBlIElNYXBwZWRTZXNzaW9uRXZlbnRzID0geyB0dXJuczogVHVybltdOyBzdWJhZ2VudFR1cm5zQnlUb29sQ2FsbElkOiBSZWFkb25seU1hcDxzdHJpbmcsIFR1cm5bXT4gfTtcblxuZnVuY3Rpb24gZ2V0RW1wdHlUb29sUmVzdWx0VGV4dChiaW5hcnlSZXN1bHRzOiByZWFkb25seSB7IHJlYWRvbmx5IHR5cGU6ICdpbWFnZScgfCAncmVzb3VyY2UnIH1bXSB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdGlmICghYmluYXJ5UmVzdWx0cz8ubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIEVNUFRZX1RPT0xfUkVTVUxUX1RFWFQ7XG5cdH1cblxuXHRjb25zdCBoYXNJbWFnZSA9IGJpbmFyeVJlc3VsdHMuc29tZShyZXN1bHQgPT4gcmVzdWx0LnR5cGUgPT09ICdpbWFnZScpO1xuXHRjb25zdCBoYXNGaWxlID0gYmluYXJ5UmVzdWx0cy5zb21lKHJlc3VsdCA9PiByZXN1bHQudHlwZSA9PT0gJ3Jlc291cmNlJyk7XG5cdGlmIChoYXNJbWFnZSAmJiBoYXNGaWxlKSB7XG5cdFx0cmV0dXJuICdUb29sIHByb2R1Y2VkIHRoZSBhdHRhY2hlZCBpbWFnZSBhbmQgZmlsZSc7XG5cdH1cblx0aWYgKGhhc0ltYWdlKSB7XG5cdFx0cmV0dXJuICdUb29sIHByb2R1Y2VkIHRoZSBhdHRhY2hlZCBpbWFnZSc7XG5cdH1cblx0cmV0dXJuICdUb29sIHByb2R1Y2VkIHRoZSBhdHRhY2hlZCBmaWxlJztcbn1cblxuLyoqXG4gKiBEaXNwbGF5IGxhYmVscyBhbmQgZGVzY3JpcHRpb25zIGZvciB0aGUgU0RLJ3MgYGV4aXRfcGxhbl9tb2RlYCBhY3Rpb24gaWRzLlxuICogS2V5cyBub3QgcHJlc2VudCBoZXJlIGZhbGwgYmFjayB0byB0aGUgcmF3IGFjdGlvbiBpZC5cbiAqL1xuZnVuY3Rpb24gZ2V0UGxhbkFjdGlvbkRlc2NyaXB0aW9uKGFjdGlvbklkOiBzdHJpbmcpOiB7IGxhYmVsOiBzdHJpbmc7IGRlc2NyaXB0aW9uOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdHN3aXRjaCAoYWN0aW9uSWQpIHtcblx0XHRjYXNlICdhdXRvcGlsb3QnOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhZ2VudEhvc3QucGxhblJldmlldy5hdXRvcGlsb3QubGFiZWwnLCBcIkltcGxlbWVudCB3aXRoIEF1dG9waWxvdFwiKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudEhvc3QucGxhblJldmlldy5hdXRvcGlsb3QuZGVzY3JpcHRpb24nLCBcIkNvbnRpbnVlIGF1dG9ub21vdXNseSB1bnRpbCBkb25lLCB1c2luZyB0aGUgc2VsZWN0ZWQgYXBwcm92YWwgbGV2ZWwuXCIpLFxuXHRcdFx0fTtcblx0XHRjYXNlICdhdXRvcGlsb3RfZmxlZXQnOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhZ2VudEhvc3QucGxhblJldmlldy5hdXRvcGlsb3RGbGVldC5sYWJlbCcsIFwiSW1wbGVtZW50IHdpdGggQXV0b3BpbG90IEZsZWV0XCIpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5wbGFuUmV2aWV3LmF1dG9waWxvdEZsZWV0LmRlc2NyaXB0aW9uJywgXCJDb250aW51ZSBhdXRvbm9tb3VzbHkgd2l0aCBmbGVldCBtYW5hZ2VtZW50LCB1c2luZyB0aGUgc2VsZWN0ZWQgYXBwcm92YWwgbGV2ZWwuXCIpLFxuXHRcdFx0fTtcblx0XHRjYXNlICdpbnRlcmFjdGl2ZSc6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FnZW50SG9zdC5wbGFuUmV2aWV3LmludGVyYWN0aXZlLmxhYmVsJywgXCJJbXBsZW1lbnQgUGxhblwiKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudEhvc3QucGxhblJldmlldy5pbnRlcmFjdGl2ZS5kZXNjcmlwdGlvbicsIFwiSW1wbGVtZW50IHRoZSBwbGFuLCBhc2tpbmcgZm9yIGlucHV0IGFuZCBhcHByb3ZhbCBmb3IgZWFjaCBhY3Rpb24uXCIpLFxuXHRcdFx0fTtcblx0XHRjYXNlICdleGl0X29ubHknOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdhZ2VudEhvc3QucGxhblJldmlldy5leGl0T25seS5sYWJlbCcsIFwiQXBwcm92ZSBQbGFuIE9ubHlcIiksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnBsYW5SZXZpZXcuZXhpdE9ubHkuZGVzY3JpcHRpb24nLCBcIkFwcHJvdmUgdGhlIHBsYW4gd2l0aG91dCBleGVjdXRpbmcgaXQuIEkgd2lsbCBpbXBsZW1lbnQgaXQgbXlzZWxmLlwiKSxcblx0XHRcdH07XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxudHlwZSBVc2VySW5wdXRIYW5kbGVyID0gTm9uTnVsbGFibGU8U2Vzc2lvbkNvbmZpZ1snb25Vc2VySW5wdXRSZXF1ZXN0J10+O1xudHlwZSBVc2VySW5wdXRSZXF1ZXN0ID0gUGFyYW1ldGVyczxVc2VySW5wdXRIYW5kbGVyPlswXTtcbnR5cGUgVXNlcklucHV0UmVzcG9uc2UgPSBBd2FpdGVkPFJldHVyblR5cGU8VXNlcklucHV0SGFuZGxlcj4+O1xudHlwZSBQcmVUb29sVXNlSG9va0lucHV0ID0gUGFyYW1ldGVyczxOb25OdWxsYWJsZTxTZXNzaW9uSG9va3NbJ29uUHJlVG9vbFVzZSddPj5bMF07XG50eXBlIFBvc3RUb29sVXNlSG9va0lucHV0ID0gUGFyYW1ldGVyczxOb25OdWxsYWJsZTxTZXNzaW9uSG9va3NbJ29uUG9zdFRvb2xVc2UnXT4+WzBdO1xudHlwZSBUb29sVXNlSG9va0lucHV0ID0gUHJlVG9vbFVzZUhvb2tJbnB1dCB8IFBvc3RUb29sVXNlSG9va0lucHV0O1xuXG5mdW5jdGlvbiBnZXRUb29sQ29tbWFuZChpbnB1dDogVG9vbFVzZUhvb2tJbnB1dCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGNvbW1hbmQgPSBpc09iamVjdChpbnB1dC50b29sQXJncykgPyBSZWZsZWN0LmdldChpbnB1dC50b29sQXJncywgJ2NvbW1hbmQnKSA6IHVuZGVmaW5lZDtcblx0cmV0dXJuIGlzU3RyaW5nKGNvbW1hbmQpID8gY29tbWFuZCA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gdG9Db3BpbG90U2RrTW9kZShtb2RlOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBDb3BpbG90U2RrTW9kZSB8IHVuZGVmaW5lZCB7XG5cdG1vZGUgPSBtb2RlPy50b0xvd2VyQ2FzZSgpID09PSAnZ29hbCcgPyAncGxhbicgOiBtb2RlO1xuXHRzd2l0Y2ggKG1vZGUpIHtcblx0XHRjYXNlICdpbnRlcmFjdGl2ZSc6XG5cdFx0Y2FzZSAncGxhbic6XG5cdFx0Y2FzZSAnYXV0b3BpbG90Jzpcblx0XHRcdHJldHVybiBtb2RlO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8qKlxuICogUHJvamVjdHMgYW4ge0BsaW5rIEVsaWNpdGF0aW9uU2NoZW1hfSBmaWVsZCBpbnRvIGFcbiAqIHtAbGluayBDaGF0SW5wdXRRdWVzdGlvbn0uIFRoZSBzY2hlbWEncyBwcm9wZXJ0eSBrZXkgYmVjb21lcyB0aGVcbiAqIHF1ZXN0aW9uIGlkIHNvIHdlIGNhbiByb3V0ZSB0aGUgYW5zd2VyIGJhY2sgYnkgZmllbGQgbmFtZS5cbiAqL1xuZnVuY3Rpb24gZWxpY2l0YXRpb25GaWVsZFRvUXVlc3Rpb24oZmllbGROYW1lOiBzdHJpbmcsIGZpZWxkOiBFbGljaXRhdGlvblNjaGVtYUZpZWxkLCByZXF1aXJlZDogYm9vbGVhbik6IENoYXRJbnB1dFF1ZXN0aW9uIHtcblx0Y29uc3QgYmFzZSA9IHtcblx0XHRpZDogZmllbGROYW1lLFxuXHRcdHRpdGxlOiBmaWVsZC50aXRsZSA/PyBmaWVsZE5hbWUsXG5cdFx0bWVzc2FnZTogZmllbGQuZGVzY3JpcHRpb24gPz8gZmllbGQudGl0bGUgPz8gZmllbGROYW1lLFxuXHRcdHJlcXVpcmVkLFxuXHR9O1xuXG5cdHN3aXRjaCAoZmllbGQudHlwZSkge1xuXHRcdGNhc2UgJ2Jvb2xlYW4nOlxuXHRcdFx0cmV0dXJuIHsgLi4uYmFzZSwga2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLkJvb2xlYW4sIGRlZmF1bHRWYWx1ZTogZmllbGQuZGVmYXVsdCB9O1xuXHRcdGNhc2UgJ2ludGVnZXInOlxuXHRcdGNhc2UgJ251bWJlcic6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5iYXNlLFxuXHRcdFx0XHRraW5kOiBmaWVsZC50eXBlID09PSAnaW50ZWdlcicgPyBDaGF0SW5wdXRRdWVzdGlvbktpbmQuSW50ZWdlciA6IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5OdW1iZXIsXG5cdFx0XHRcdG1pbjogZmllbGQubWluaW11bSxcblx0XHRcdFx0bWF4OiBmaWVsZC5tYXhpbXVtLFxuXHRcdFx0XHRkZWZhdWx0VmFsdWU6IGZpZWxkLmRlZmF1bHQsXG5cdFx0XHR9O1xuXHRcdGNhc2UgJ2FycmF5Jzoge1xuXHRcdFx0Y29uc3Qgb3B0aW9uczogQ2hhdElucHV0T3B0aW9uW10gPSBoYXNLZXkoZmllbGQuaXRlbXMsIHsgZW51bTogdHJ1ZSB9KVxuXHRcdFx0XHQ/IGZpZWxkLml0ZW1zLmVudW0ubWFwKHZhbHVlID0+ICh7IGlkOiB2YWx1ZSwgbGFiZWw6IHZhbHVlIH0pKVxuXHRcdFx0XHQ6IGZpZWxkLml0ZW1zLmFueU9mLm1hcChvcHRpb24gPT4gKHsgaWQ6IG9wdGlvbi5jb25zdCwgbGFiZWw6IG9wdGlvbi50aXRsZSB9KSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5iYXNlLFxuXHRcdFx0XHRraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuTXVsdGlTZWxlY3QsXG5cdFx0XHRcdG9wdGlvbnMsXG5cdFx0XHRcdG1pbjogZmllbGQubWluSXRlbXMsXG5cdFx0XHRcdG1heDogZmllbGQubWF4SXRlbXMsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjYXNlICdzdHJpbmcnOiB7XG5cdFx0XHRpZiAoaGFzS2V5KGZpZWxkLCB7IGVudW06IHRydWUgfSkpIHtcblx0XHRcdFx0Y29uc3QgZW51bU5hbWVzID0gZmllbGQuZW51bU5hbWVzO1xuXHRcdFx0XHRjb25zdCBvcHRpb25zOiBDaGF0SW5wdXRPcHRpb25bXSA9IGZpZWxkLmVudW0ubWFwKCh2YWx1ZSwgaWR4KSA9PiAoeyBpZDogdmFsdWUsIGxhYmVsOiBlbnVtTmFtZXM/LltpZHhdID8/IHZhbHVlIH0pKTtcblx0XHRcdFx0cmV0dXJuIHsgLi4uYmFzZSwga2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLlNpbmdsZVNlbGVjdCwgb3B0aW9ucyB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGhhc0tleShmaWVsZCwgeyBvbmVPZjogdHJ1ZSB9KSkge1xuXHRcdFx0XHRjb25zdCBvcHRpb25zOiBDaGF0SW5wdXRPcHRpb25bXSA9IGZpZWxkLm9uZU9mLm1hcChvcHRpb24gPT4gKHsgaWQ6IG9wdGlvbi5jb25zdCwgbGFiZWw6IG9wdGlvbi50aXRsZSB9KSk7XG5cdFx0XHRcdHJldHVybiB7IC4uLmJhc2UsIGtpbmQ6IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5TaW5nbGVTZWxlY3QsIG9wdGlvbnMgfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLmJhc2UsXG5cdFx0XHRcdGtpbmQ6IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5UZXh0LFxuXHRcdFx0XHRmb3JtYXQ6IGZpZWxkLmZvcm1hdCxcblx0XHRcdFx0bWluOiBmaWVsZC5taW5MZW5ndGgsXG5cdFx0XHRcdG1heDogZmllbGQubWF4TGVuZ3RoLFxuXHRcdFx0XHRkZWZhdWx0VmFsdWU6IGZpZWxkLmRlZmF1bHQsXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIFByb2plY3RzIGEge0BsaW5rIENoYXRJbnB1dEFuc3dlcn0gYmFjayBpbnRvIHRoZVxuICoge0BsaW5rIEVsaWNpdGF0aW9uRmllbGRWYWx1ZX0gc2hhcGUgZXhwZWN0ZWQgYnkgdGhlIFNESyBmb3IgdGhlIGdpdmVuXG4gKiBzY2hlbWEgZmllbGQuIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgYW5zd2VyIGlzIG1pc3Npbmcvc2tpcHBlZCBvclxuICogY2Fubm90IGJlIGNvZXJjZWQgdG8gdGhlIGZpZWxkJ3MgZGVjbGFyZWQgdHlwZS5cbiAqL1xuZnVuY3Rpb24gZWxpY2l0YXRpb25BbnN3ZXJUb0ZpZWxkVmFsdWUoZmllbGQ6IEVsaWNpdGF0aW9uU2NoZW1hRmllbGQsIGFuc3dlcjogQ2hhdElucHV0QW5zd2VyIHwgdW5kZWZpbmVkKTogRWxpY2l0YXRpb25GaWVsZFZhbHVlIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFhbnN3ZXIgfHwgYW5zd2VyLnN0YXRlID09PSBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5Ta2lwcGVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB2YWx1ZSA9IGFuc3dlci52YWx1ZTtcblx0aWYgKGZpZWxkLnR5cGUgPT09ICdib29sZWFuJykge1xuXHRcdGlmICh2YWx1ZS5raW5kID09PSBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuQm9vbGVhbikgeyByZXR1cm4gdmFsdWUudmFsdWU7IH1cblx0XHRpZiAodmFsdWUua2luZCA9PT0gQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQpIHtcblx0XHRcdGlmICh2YWx1ZS52YWx1ZSA9PT0gJ3RydWUnKSB7IHJldHVybiB0cnVlOyB9XG5cdFx0XHRpZiAodmFsdWUudmFsdWUgPT09ICdmYWxzZScpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmIChmaWVsZC50eXBlID09PSAnbnVtYmVyJyB8fCBmaWVsZC50eXBlID09PSAnaW50ZWdlcicpIHtcblx0XHRpZiAodmFsdWUua2luZCA9PT0gQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLk51bWJlcikge1xuXHRcdFx0cmV0dXJuIGZpZWxkLnR5cGUgPT09ICdpbnRlZ2VyJyA/IE1hdGgudHJ1bmModmFsdWUudmFsdWUpIDogdmFsdWUudmFsdWU7XG5cdFx0fVxuXHRcdGlmICh2YWx1ZS5raW5kID09PSBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuVGV4dCkge1xuXHRcdFx0aWYgKHZhbHVlLnZhbHVlLnRyaW0oKSA9PT0gJycpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0Y29uc3QgbiA9IE51bWJlcih2YWx1ZS52YWx1ZSk7XG5cdFx0XHRyZXR1cm4gTnVtYmVyLmlzRmluaXRlKG4pID8gKGZpZWxkLnR5cGUgPT09ICdpbnRlZ2VyJyA/IE1hdGgudHJ1bmMobikgOiBuKSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAoZmllbGQudHlwZSA9PT0gJ2FycmF5Jykge1xuXHRcdGlmICh2YWx1ZS5raW5kID09PSBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuU2VsZWN0ZWRNYW55KSB7XG5cdFx0XHRyZXR1cm4gWy4uLnZhbHVlLnZhbHVlLCAuLi4odmFsdWUuZnJlZWZvcm1WYWx1ZXMgPz8gW10pXTtcblx0XHR9XG5cdFx0aWYgKHZhbHVlLmtpbmQgPT09IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5TZWxlY3RlZCkge1xuXHRcdFx0cmV0dXJuIHZhbHVlLnZhbHVlID8gW3ZhbHVlLnZhbHVlLCAuLi4odmFsdWUuZnJlZWZvcm1WYWx1ZXMgPz8gW10pXSA6IFsuLi4odmFsdWUuZnJlZWZvcm1WYWx1ZXMgPz8gW10pXTtcblx0XHR9XG5cdFx0aWYgKHZhbHVlLmtpbmQgPT09IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0KSB7XG5cdFx0XHRyZXR1cm4gdmFsdWUudmFsdWUgPyBbdmFsdWUudmFsdWVdIDogW107XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Ly8gZmllbGQudHlwZSA9PT0gJ3N0cmluZydcblx0aWYgKHZhbHVlLmtpbmQgPT09IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0KSB7IHJldHVybiB2YWx1ZS52YWx1ZTsgfVxuXHRpZiAodmFsdWUua2luZCA9PT0gQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlNlbGVjdGVkKSB7IHJldHVybiB2YWx1ZS52YWx1ZTsgfVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBnZXRDb3BpbG90Q0xJU2Vzc2lvblN0YXRlRGlyKHVzZXJIb21lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gam9pbihnZXRDb3BpbG90SG9tZVBhdGgodXNlckhvbWUsIHByb2Nlc3MuZW52KSwgU0VTU0lPTl9TVEFURV9ESVJFQ1RPUlkpO1xufVxuXG5mdW5jdGlvbiBpc0NvcGlsb3RTZGtUb29sT3V0cHV0VGVtcEZpbGUoZmlsZVBhdGg6IHN0cmluZywgdG1wRGlyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0Y29uc3QgZmlsZVVyaSA9IG5vcm1hbGl6ZVBhdGgoVVJJLmZpbGUoZmlsZVBhdGgpKTtcblx0Y29uc3QgdG1wRGlyVXJpID0gbm9ybWFsaXplUGF0aChVUkkuZmlsZSh0bXBEaXIpKTtcblx0Y29uc3QgcGFyZW50VXJpID0gbm9ybWFsaXplUGF0aChVUkkuam9pblBhdGgoZmlsZVVyaSwgJy4uJykpO1xuXHRpZiAoIWV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWwocGFyZW50VXJpLCB0bXBEaXJVcmkpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiBpc0NvcGlsb3RTZGtUb29sT3V0cHV0RmlsZShmaWxlUGF0aCk7XG59XG5cbi8qKlxuICogT3B0aW9ucyBmb3IgY29uc3RydWN0aW5nIGEge0BsaW5rIENvcGlsb3RBZ2VudFNlc3Npb259LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElDb3BpbG90QWdlbnRTZXNzaW9uT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHNlc3Npb25Vcmk6IFVSSTtcblx0cmVhZG9ubHkgY2hhdENoYW5uZWxVcmk6IFVSSTtcblx0LyoqIEV4YWN0IHBlcnNpc3RlbmNlL2NvbmZpZyBzY29wZSBmb3IgdGhpcyBjaGF0IChgSUFnZW50Q2hhdENvbnRleHQucmVzb3VyY2VgIHdoZW4gc3VwcGxpZWQpLiAqL1xuXHRyZWFkb25seSByZXNvdXJjZT86IFVSSTtcblx0cmVhZG9ubHkgcmF3U2Vzc2lvbklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG9uRGlkU2Vzc2lvblByb2dyZXNzOiBFbWl0dGVyPEFnZW50U2lnbmFsPjtcblx0cmVhZG9ubHkgc2Vzc2lvbkxhdW5jaGVyOiBJQ29waWxvdFNlc3Npb25MYXVuY2hlcjtcblx0cmVhZG9ubHkgbGF1bmNoUGxhbjogQ29waWxvdFNlc3Npb25MYXVuY2hQbGFuO1xuXHRyZWFkb25seSBzaGVsbE1hbmFnZXI6IFNoZWxsTWFuYWdlciB8IHVuZGVmaW5lZDtcblx0LyoqIFdvcmtpbmcgZGlyZWN0b3J5IGFzc29jaWF0ZWQgd2l0aCB0aGUgc2Vzc2lvbiwgdXNlZCB0byBzdHJpcCByZWR1bmRhbnQgYGNkYCBwcmVmaXhlcyBmcm9tIHNoZWxsIGNvbW1hbmRzLiAqL1xuXHRyZWFkb25seSB3b3JraW5nRGlyZWN0b3J5PzogVVJJO1xuXHQvKiogRGlyZWN0b3J5IHVzZWQgdG8gcmVzb2x2ZSB3b3Jrc3BhY2Utc2NvcGVkIGN1c3RvbWl6YXRpb25zIGZvciB0aGlzIHNlc3Npb24uICovXG5cdHJlYWRvbmx5IGN1c3RvbWl6YXRpb25EaXJlY3Rvcnk/OiBVUkk7XG5cdC8qKiBTbmFwc2hvdCBvZiB0aGUgYWN0aXZlIGNsaWVudCdzIHRvb2xzIGFuZCBwbHVnaW5zIGF0IHNlc3Npb24gY3JlYXRpb24gdGltZS4gKi9cblx0cmVhZG9ubHkgY2xpZW50U25hcHNob3Q/OiBJQWN0aXZlQ2xpZW50U25hcHNob3Q7XG5cdC8qKiBSZXR1cm5zIHdoZXRoZXIgYSBob3N0LXB1Ymxpc2hlZCBjbGllbnQgbWVtYmVyc2hpcCBpbmNsdWRlcyB0aGlzIGNoYXQuICovXG5cdHJlYWRvbmx5IGNsaWVudFJlYWNoZXNDaGF0PzogKGNsaWVudElkOiBzdHJpbmcsIGNoYXQ6IFVSSSkgPT4gYm9vbGVhbjtcblx0LyoqIFJlYWRzIHRoZSByZXRhaW5lZCBob3N0IHNuYXBzaG90IHRoaXMgc2Vzc2lvbiB1c2VzIGZvciBNQ1AgZW5hYmxlbWVudCByZWNvbmNpbGUuICovXG5cdHJlYWRvbmx5IGhvc3RDdXN0b21pemF0aW9ucz86ICgpID0+IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXTtcblx0LyoqXG5cdCAqIExpdmUgcmVnaXN0cnkgb2YgZXZlcnkgYWN0aXZlIGNsaWVudCdzIHRvb2wgY29udHJpYnV0aW9ucywgc2hhcmVkIGJ5XG5cdCAqIHJlZmVyZW5jZSB3aXRoIHRoZSBhZ2VudCdzIHBlci1zZXNzaW9uIHtAbGluayBBY3RpdmVDbGllbnR9LiBSZWFkIGF0XG5cdCAqIHRvb2wtY2FsbCBzdGFtcCB0aW1lIHNvIGEgd2luZG93IHJlbG9hZCAobmV3IGBjbGllbnRJZGAsIGlkZW50aWNhbFxuXHQgKiB0b29scykgc3RhbXBzIHdpdGggdGhlIGN1cnJlbnQgb3duaW5nIGlkLCBhbmQgc28gZWFjaCB0b29sIGNhbGwgaXNcblx0ICogYXR0cmlidXRlZCB0byB3aGljaGV2ZXIgY2xpZW50IGNvbnRyaWJ1dGVkIGl0LiBXaGVuIG9taXR0ZWQsIGEgZnJlc2hcblx0ICogZW1wdHkgcmVnaXN0cnkgaXMgdXNlZCAodGVzdCAvIHN0YW5kYWxvbmUgcGF0aCkgYW5kIGNsaWVudCB0b29sIGNhbGxzXG5cdCAqIGFyZSBsZWZ0IHVuc3RhbXBlZC5cblx0ICovXG5cdHJlYWRvbmx5IGFjdGl2ZUNsaWVudFRvb2xTZXQ/OiBBY3RpdmVDbGllbnRUb29sU2V0O1xuXHQvKipcblx0ICogU2VydmVyLXNpZGUgaG9zdCBmb3IgdGhlIGFnZW50IGhvc3QncyBzZXJ2ZXIgdG9vbHMuIFdoZW4gcHJvdmlkZWQsIHRoZVxuXHQgKiBzZXNzaW9uIGFkdmVydGlzZXMgdGhlIHNlcnZlciB0b29scyAoZmVlZGJhY2sgXCJjb21tZW50c1wiIHRvZGF5LCBtb3JlIGluXG5cdCAqIHRoZSBmdXR1cmUpIGFuZCBleHBvc2VzIFNESyB0b29sIGhhbmRsZXJzIHRoYXQgZXhlY3V0ZSB0aGVtIGluLXByb2Nlc3MuXG5cdCAqL1xuXHRyZWFkb25seSBzZXJ2ZXJUb29sSG9zdD86IElBZ2VudFNlcnZlclRvb2xIb3N0O1xuXHQvKiogUmV0dXJucyB3aGV0aGVyIHRoZSB0b2tlbiB0aGF0IGxhdW5jaGVkIHRoaXMgc2Vzc2lvbiBpcyBzdGlsbCB0aGUgYWN0aXZlIGFjY291bnQgdG9rZW4uICovXG5cdHJlYWRvbmx5IGlzTGF1bmNoVG9rZW5DdXJyZW50PzogKCkgPT4gYm9vbGVhbjtcblxuXHQvKipcblx0ICogSW52b2tlZCB3aGVuZXZlciB0aGlzIGNoYXQncyBpbi1mbGlnaHQgdHVybiBlbmRzIFx1MjAxNCBub3JtYWwgY29tcGxldGlvbixcblx0ICogYWJvcnQsIG9yIGVycm9yIFx1MjAxNCBsZWF2aW5nIHRoZSBjaGF0IGlkbGUuIExldHMgdGhlIGFnZW50IHJ1biB3b3JrIHRoYXRcblx0ICogbXVzdCBub3QgaW50ZXJydXB0IGEgbGl2ZSB0dXJuLCBub3RhYmx5IGEgQ0xJIGNsaWVudCByZXN0YXJ0IGRlZmVycmVkXG5cdCAqIHdoaWxlIHRoZSB0dXJuIHdhcyBydW5uaW5nLiBDYWxsZWQgc3luY2hyb25vdXNseSBmcm9tIHRoZSBzZXNzaW9uJ3MgU0RLXG5cdCAqIGV2ZW50IGhhbmRsaW5nLCBzbyB0aGUgYWdlbnQgbXVzdCBzY2hlZHVsZSBhbnl0aGluZyB0aGF0IGNvdWxkIGRpc3Bvc2Vcblx0ICogdGhpcyBzZXNzaW9uIG9mZiB0aGUgY3VycmVudCBzdGFjay5cblx0ICovXG5cdHJlYWRvbmx5IG9uVHVybkVuZGVkPzogKCkgPT4gdm9pZDtcblxuXHQvKipcblx0ICogUGxhdGZvcm0gdXNlZCB0byBjb21wdXRlIHRoZSBTREsgc2FuZGJveCBwb2xpY3kuIERlZmF1bHRzIHRvXG5cdCAqIGBwcm9jZXNzLnBsYXRmb3JtYDsgaW5qZWN0YWJsZSBzbyB0ZXN0cyBjYW4gZXhlcmNpc2UgdGhlIHBlci1PUyBnYXRpbmdcblx0ICogKG5vdGFibHkgdGhhdCB0aGUgc2FuZGJveCBpcyBpZ25vcmVkIG9uIFdpbmRvd3MpIGRldGVybWluaXN0aWNhbGx5LlxuXHQgKi9cblx0cmVhZG9ubHkgcGxhdGZvcm0/OiBOb2RlSlMuUGxhdGZvcm07XG59XG5cbi8qKlxuICogTGlmZWN5Y2xlIHN0YXRlIG9mIGEge0BsaW5rIENvcGlsb3RUdXJufS5cbiAqXG4gKiAgLSBgcGVuZGluZ2AgICBcdTIwMTQgdGhlIGhvc3QgaGFzIGRpc3BhdGNoZWQgdGhlIG1lc3NhZ2UgKGBzZW5kKClgKSwgYnV0IHRoZSBTREtcbiAqICAgICAgICAgICAgICAgICAgaGFzIG5vdCB5ZXQgZW1pdHRlZCBhbnkgZXZlbnQgZm9yIHRoaXMgdHVybidzIGFnZW50aWMgbG9vcC5cbiAqICAtIGBydW5uaW5nYCAgIFx1MjAxNCB0aGUgU0RLIGhhcyBlbWl0dGVkIGF0IGxlYXN0IG9uZSBldmVudCBmb3IgdGhpcyB0dXJuLlxuICogIC0gYGNvbXBsZXRlZGAgXHUyMDE0IHRoZSB0dXJuIGZpbmlzaGVkIG5vcm1hbGx5ICh0aGUgbG9vcCB3ZW50IGlkbGUpLlxuICogIC0gYGFib3J0ZWRgICAgXHUyMDE0IHRoZSB0dXJuJ3MgbG9vcCB3YXMgY2FuY2VsbGVkIHZpYSBhbiBhYm9ydC5cbiAqL1xudHlwZSBDb3BpbG90VHVyblN0YXRlID0gJ3BlbmRpbmcnIHwgJ3J1bm5pbmcnIHwgJ2NvbXBsZXRlZCcgfCAnYWJvcnRlZCc7XG5cbi8qKlxuICogRW5jYXBzdWxhdGVzIGFsbCBwZXItdHVybiBib29ra2VlcGluZyBmb3IgYSBzaW5nbGUgcHJvdG9jb2wgdHVybiwgcGx1cyBhblxuICogZXhwbGljaXQgbGlmZWN5Y2xlIHtAbGluayBDb3BpbG90VHVybi5zdGF0ZX0uIEhvbGRpbmcgdGhpcyBzdGF0ZSBvbiBvbmVcbiAqIG9iamVjdCAoY3JlYXRlZCBmcmVzaCBwZXIgdHVybikgcmF0aGVyIHRoYW4gYXMgYSBoYW5kZnVsIG9mIG11dGFibGUgc2Vzc2lvblxuICogZmllbGRzIG1lYW5zIHRoZXJlIGlzIGEgc2luZ2xlLCBhdG9taWMgbm90aW9uIG9mIFwidGhlIGN1cnJlbnQgdHVyblwiOiB0aGVyZVxuICogaXMgbm8gc2V0IG9mIGNvdW50ZXJzL21hcHMgdGhhdCBtdXN0IGJlIHJlc2V0IGluIGxvY2tzdGVwLCBhbmQgdHVyblxuICogdHJhbnNpdGlvbnMgKHJ1bm5pbmcvY29tcGxldGVkL2Fib3J0ZWQpIGFyZSBleHBsaWNpdCBhbmQgY2hlY2thYmxlLlxuICpcbiAqIFRoZSBgcGVuZGluZyBcdTIxOTIgcnVubmluZ2AgZGlzdGluY3Rpb24gZ3VhcmRzIHR1cm4gY29tcGxldGlvbiBhZ2FpbnN0IGEgc3RyYXlcbiAqIGlkbGU6IGFuIGFib3J0J3MgdGVybWluYWwgYHNlc3Npb24uaWRsZWAgZmluZHMgYSBxdWV1ZWQgbWVzc2FnZSdzIHR1cm4gc3RpbGxcbiAqIGBwZW5kaW5nYCAodGhlIFNESyBoYXMgbm90IGJlZ3VuIGl0KSBhbmQgbGVhdmVzIGl0IG9wZW4sIHJhdGhlciB0aGFuXG4gKiBjb21wbGV0aW5nIGl0IGFuZCBvcnBoYW5pbmcgaXRzIHJlYWwgcmVzcG9uc2UuIEEgbm9uLWFib3J0IGlkbGUgc3RpbGxcbiAqIGNvbXBsZXRlcyBhIGBwZW5kaW5nYCB0dXJuIGRlZmVuc2l2ZWx5LCBzbyBhIGRlZ2VuZXJhdGUgbm8tb3Agc2VuZCBjYW5ub3RcbiAqIGhhbmcgdGhlIHNlc3Npb24uXG4gKi9cblxuLyoqXG4gKiBUaGUgdG9rZW4vbW9kZWwvY29zdCBjb250ZXh0IGZvciBhIHNpbmdsZSBtb2RlbCBjYWxsLCB1c2VkIHRvIGJ1aWxkIGFcbiAqIGBVc2FnZUluZm9gLiBBbGwgZmllbGRzIGFyZSBvcHRpb25hbCBzbyBhIHBhcnRpYWwgb3IgZW1wdHkgY29udGV4dCAoZS5nLiBhXG4gKiBzdWJhZ2VudCB1c2FnZSBldmVudCBzZWVuIGJlZm9yZSB0aGUgcGFyZW50J3Mgb3duIGNvbnRleHQpIGlzIHJlcHJlc2VudGFibGUuXG4gKi9cbmludGVyZmFjZSBVc2FnZUNvbnRleHQge1xuXHRpbnB1dFRva2Vucz86IG51bWJlcjtcblx0b3V0cHV0VG9rZW5zPzogbnVtYmVyO1xuXHRtb2RlbD86IHN0cmluZztcblx0Y2FjaGVSZWFkVG9rZW5zPzogbnVtYmVyO1xuXHRjb3N0PzogbnVtYmVyO1xufVxuXG4vKiogV2hpY2ggU0RLIHNvdXJjZSBwcm9kdWNlZCBhbiBNQ1AgbGlmZWN5Y2xlIGxvZyByZWNvcmQuICovXG50eXBlIE1jcExpZmVjeWNsZU9yaWdpbiA9ICdsb2FkZWQnIHwgJ3N0YXR1c0NoYW5nZWQnIHwgJ2ludmVudG9yeSc7XG5cbi8qKlxuICogU0RLLW5ldXRyYWwgZmllbGRzIGNhcnJpZWQgaW50byBhIHNpbmdsZSBNQ1AgbGlmZWN5Y2xlIGxvZyByZWNvcmQuIFRoZVxuICogYHNlc3Npb24ubWNwX3NlcnZlcnNfbG9hZGVkYCBldmVudCwgdGhlIGBzZXNzaW9uLm1jcF9zZXJ2ZXJfc3RhdHVzX2NoYW5nZWRgXG4gKiBldmVudCwgYW5kIHRoZSBgcnBjLm1jcC5saXN0YCBpbnZlbnRvcnkgZWFjaCBwb3B1bGF0ZSB0aGUgc3Vic2V0IHRoZXkgY2FycnkuXG4gKi9cbmludGVyZmFjZSBJTWNwTGlmZWN5Y2xlTG9nSW5mbyB7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgc3RhdHVzOiBTZGtNY3BTZXJ2ZXJTdGF0dXM7XG5cdHJlYWRvbmx5IGVycm9yPzogc3RyaW5nO1xuXHRyZWFkb25seSBzb3VyY2U/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRyYW5zcG9ydD86IHN0cmluZztcblx0cmVhZG9ubHkgcGx1Z2luTmFtZT86IHN0cmluZztcblx0cmVhZG9ubHkgcGx1Z2luVmVyc2lvbj86IHN0cmluZztcbn1cblxuY2xhc3MgQ29waWxvdFR1cm4ge1xuXG5cdHByaXZhdGUgX3N0YXRlOiBDb3BpbG90VHVyblN0YXRlID0gJ3BlbmRpbmcnO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdG9wV2F0Y2ggPSBTdG9wV2F0Y2guY3JlYXRlKGZhbHNlKTtcblxuXHQvKipcblx0ICogVGhpcyB0dXJuJ3Mgb3duIENvcGlsb3QgY29zdCBpbiBuYW5vLUFJVSwgc3VtbWVkIGZyb20gdGhlIGBjb3BpbG90VXNhZ2VgXG5cdCAqIGNhcnJpZWQgYnkgdGhlIG1vZGVsIGNhbGxzIHRoZSB0dXJuIGNhdXNlZCBcdTIwMTQgaXRzIG93biwgZXZlcnkgc3ViYWdlbnQncyxcblx0ICogYW5kIGFueSBjb21wYWN0aW9uIHRoYXQgcmFuIG1pZC10dXJuLlxuXHQgKlxuXHQgKiBBY2N1bXVsYXRlZCBzeW5jaHJvbm91c2x5IGFzIGVhY2ggZXZlbnQgYXJyaXZlcyByYXRoZXIgdGhhbiBkZXJpdmVkIGZyb21cblx0ICogdGhlIFNESydzIHNlc3Npb24td2lkZSB0b3RhbDogdGhhdCB0b3RhbCBpcyByZWFkIGFzeW5jaHJvbm91c2x5LCBhbmQgdGhlXG5cdCAqIHRlcm1pbmFsIGBzZXNzaW9uLmlkbGVgIGNhbiBjbG9zZSB0aGUgdHVybiB3aGlsZSBhIHJlYWQgaXMgaW4gZmxpZ2h0LFxuXHQgKiB3aGljaCB3b3VsZCBkcm9wIHRoZSB0dXJuJ3MgbGFzdCBtb2RlbCBjYWxsIGZyb20gaXRzIHJlcG9ydGVkIGNvc3QuXG5cdCAqL1xuXHRjb3BpbG90TmFub0FpdSA9IDA7XG5cblx0LyoqXG5cdCAqIFBlci1zdWJhZ2VudCBjb21wb25lbnQgY29zdCwgaW4gbmFuby1BSVUsIGtleWVkIGJ5IGBwYXJlbnRUb29sQ2FsbElkYC5cblx0ICogVGhlIFNESydzIHNlc3Npb24gbWV0cmljcyBhcmUgc2Vzc2lvbi13aWRlIGFuZCBjYXJyeSBubyBwZXItYWdlbnRcblx0ICogYnJlYWtkb3duLCBzbyBhIHN1YmFnZW50J3Mgb3duIHJ1bm5pbmcgdG90YWwgaXMgc3RpbGwgYWNjdW11bGF0ZWQgZnJvbVxuXHQgKiBpdHMgdXNhZ2UgZXZlbnRzIGluIG9yZGVyIHRvIHJlcG9ydCBpdCBvbiB0aGUgc3ViYWdlbnQncyBjaGlsZCBzZXNzaW9uLlxuXHQgKi9cblx0cmVhZG9ubHkgc3ViYWdlbnROYW5vQWl1QnlUb29sQ2FsbElkID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblxuXHQvKipcblx0ICogV2hvbGUtdHVybiB0b2tlbiBjb25zdW1wdGlvbiBrZXllZCBieSBtb2RlbCBpZC4gRXZlcnkgbW9kZWwgY2FsbCBpbiB0aGVcblx0ICogdHVybiBjb250cmlidXRlcyBcdTIwMTQgdGhlIHBhcmVudCBhZ2VudCdzIGNhbGxzLCBldmVyeSBzdWJhZ2VudCdzIGNhbGxzLCBhbmRcblx0ICogdGhlIHN1bW1hcml6YXRpb24gY2FsbCBhIGNvbXBhY3Rpb24gcGVyZm9ybXMgXHUyMDE0IHNvIHRoZSB0b3RhbHMgZGVzY3JpYmUgd2hhdFxuXHQgKiB0aGUgdHVybiBhcyBhIHdob2xlIGNvbnN1bWVkIHJhdGhlciB0aGFuIGp1c3QgaXRzIGxhc3QgY2FsbC4gU3ViYWdlbnRzIG1heVxuXHQgKiBydW4gb24gYSBkaWZmZXJlbnQgbW9kZWwgdGhhbiB0aGUgcGFyZW50LCBoZW5jZSB0aGUgcGVyLW1vZGVsIGtleWluZy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rva2VuVG90YWxzQnlNb2RlbCA9IG5ldyBNYXA8c3RyaW5nLCBNdXRhYmxlPElUdXJuVG9rZW5Ub3RhbD4+KCk7XG5cblx0LyoqXG5cdCAqIEZvbGRzIG9uZSBtb2RlbCBjYWxsJ3MgdG9rZW4gY291bnRzIGludG8gdGhlIHR1cm4ncyBwZXItbW9kZWwgdG90YWxzLlxuXHQgKiBDYWxscyB3aXRob3V0IGEgbW9kZWwgaWQgYXJlIGlnbm9yZWQ6IHRoZXkgY2Fubm90IGJlIGF0dHJpYnV0ZWQsIGFuZCBldmVyeVxuXHQgKiB1c2FnZS1yZXBvcnRpbmcgcGF0aCB0aGlzIHNlc3Npb24gaGFzIGNhcnJpZXMgb25lLlxuXHQgKi9cblx0YWRkVG9rZW5Ub3RhbHMobW9kZWw6IHN0cmluZyB8IHVuZGVmaW5lZCwgdG9rZW5zOiB7IGlucHV0VG9rZW5zPzogbnVtYmVyOyBvdXRwdXRUb2tlbnM/OiBudW1iZXI7IGNhY2hlUmVhZFRva2Vucz86IG51bWJlciB9KTogdm9pZCB7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgdG90YWwgPSB0aGlzLl90b2tlblRvdGFsc0J5TW9kZWwuZ2V0KG1vZGVsKTtcblx0XHRpZiAoIXRvdGFsKSB7XG5cdFx0XHR0b3RhbCA9IHsgbW9kZWwsIGlucHV0VG9rZW5zOiAwLCBjYWNoZWRUb2tlbnM6IDAsIG91dHB1dFRva2VuczogMCB9O1xuXHRcdFx0dGhpcy5fdG9rZW5Ub3RhbHNCeU1vZGVsLnNldChtb2RlbCwgdG90YWwpO1xuXHRcdH1cblx0XHR0b3RhbC5pbnB1dFRva2VucyArPSB0b1Rva2VuQ291bnQodG9rZW5zLmlucHV0VG9rZW5zKTtcblx0XHR0b3RhbC5jYWNoZWRUb2tlbnMgKz0gdG9Ub2tlbkNvdW50KHRva2Vucy5jYWNoZVJlYWRUb2tlbnMpO1xuXHRcdHRvdGFsLm91dHB1dFRva2VucyArPSB0b1Rva2VuQ291bnQodG9rZW5zLm91dHB1dFRva2Vucyk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHR1cm4ncyBwZXItbW9kZWwgdG90YWxzLCBvciBgdW5kZWZpbmVkYCB3aGVuIG5vdGhpbmcgaGFzIGJlZW4gcmVjb3JkZWQuXG5cdCAqIFJvd3MgYXJlIGNsb25lZDogdGhlIG1hcCBrZWVwcyBtdXRhdGluZyBpdHMgb3duIGNvcGllcyBhcyBmdXJ0aGVyIGNhbGxzIGFyZVxuXHQgKiByZWNvcmRlZCwgYW5kIGFuIGFscmVhZHktZW1pdHRlZCBvciBhbHJlYWR5LWNvbXBhcmVkIHVzYWdlIG9iamVjdCBtdXN0IG5vdFxuXHQgKiBjaGFuZ2UgcmV0cm9hY3RpdmVseSB1bmRlcm5lYXRoIGl0cyBjb25zdW1lcnMuXG5cdCAqL1xuXHRnZXQgdG9rZW5Ub3RhbHMoKTogcmVhZG9ubHkgSVR1cm5Ub2tlblRvdGFsW10gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl90b2tlblRvdGFsc0J5TW9kZWwuc2l6ZSA+IDBcblx0XHRcdD8gWy4uLnRoaXMuX3Rva2VuVG90YWxzQnlNb2RlbC52YWx1ZXMoKV0ubWFwKHRvdGFsID0+ICh7IC4uLnRvdGFsIH0pKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHBhcmVudCAobWFpbi1hZ2VudCkgdHVybidzIG93biBsYXN0IGNvbnRleHQgdXNhZ2UgXHUyMDE0IG1vZGVsIHBsdXMgdG9rZW5cblx0ICogY291bnRzIGFuZCBwZXItZXZlbnQgY29zdC4gQSBzdWJhZ2VudCdzIG1vZGVsIGNhbGwgY29udHJpYnV0ZXMgdG8gdGhlXG5cdCAqIHR1cm4ncyBjcmVkaXRzICh0aGUgU0RLJ3Mgc2Vzc2lvbiBtZXRyaWNzIGFscmVhZHkgaW5jbHVkZSBpdCkgYnV0IG11c3Qgbm90XG5cdCAqIG92ZXJ3cml0ZSB0aGUgcGFyZW50IHR1cm4ncyBtb2RlbC9jb250ZXh0LXRva2VuIHVzYWdlLiBSZXRhaW5pbmcgdGhlXG5cdCAqIHBhcmVudCdzIG93biBsYXN0IHZhbHVlcyBsZXRzIGVhY2ggc3ViYWdlbnQgdXNhZ2UgZXZlbnQgcmVmcmVzaCB0aGUgcGFyZW50XG5cdCAqIGFnZ3JlZ2F0ZSdzIGNyZWRpdCB0b3RhbCB3aGlsZSBwcmVzZXJ2aW5nIHRoZSBtb2RlbCB0aGF0IHByb2R1Y2VkIHRoZVxuXHQgKiBwYXJlbnQgcmVzcG9uc2UuXG5cdCAqL1xuXHRwYXJlbnRDb250ZXh0VXNhZ2U6IFVzYWdlQ29udGV4dCB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogQ3VycmVudCBtYXJrZG93biByZXNwb25zZSBwYXJ0IElEcyBmb3IgdGhpcyB0dXJuLCBrZXllZCBieVxuXHQgKiBgcGFyZW50VG9vbENhbGxJZCA/PyAnJ2AuIFBhcmVudCBhbmQgc3ViYWdlbnQgdGV4dCBzdHJlYW0gdGhyb3VnaCB0aGVcblx0ICogc2FtZSBTREsgc2Vzc2lvbiBidXQgbGFuZCBpbiBkaWZmZXJlbnQgQUhQIHNlc3Npb25zLCBzbyB0aGVpciBtYXJrZG93blxuXHQgKiBwYXJ0IHN0YXRlIG11c3Qgbm90IG1hc2sgb3IgYXBwZW5kIHRvIGVhY2ggb3RoZXIuXG5cdCAqL1xuXHRyZWFkb25seSBtYXJrZG93blBhcnRJZHMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG5cdC8qKiBDdXJyZW50IHJlYXNvbmluZyByZXNwb25zZSBwYXJ0IElEcyBmb3IgdGhpcyB0dXJuLCBrZXllZCBieSBgcGFyZW50VG9vbENhbGxJZCA/PyAnJ2AuICovXG5cdHJlYWRvbmx5IHJlYXNvbmluZ1BhcnRJZHMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG5cdC8qKlxuXHQgKiBQZXItdHVybiB0b29sLWNhbGwgYWdncmVnYXRlIGFjY3VtdWxhdGVkIGFjcm9zcyB0aGUgdHVybidzIGBhc3Npc3RhbnQubWVzc2FnZWAgcm91bmRzIChtYWluXG5cdCAqIGFnZW50IG9ubHkpLCBmb3IgdGhlIHJlc3RyaWN0ZWQgYHRvb2xDYWxsRGV0YWlsc2AgdGVsZW1ldHJ5LiBgdG9vbENvdW50c2AgaXMga2V5ZWQgYnkgdG9vbCBuYW1lLlxuXHQgKi9cblx0cmVhZG9ubHkgdG9vbENvdW50cyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdHRvb2xDYWxsUm91bmRzID0gMDtcblx0dG90YWxUb29sQ2FsbHMgPSAwO1xuXHRwYXJhbGxlbFRvb2xDYWxsUm91bmRzID0gMDtcblx0cGFyYWxsZWxUb29sQ2FsbHNUb3RhbCA9IDA7XG5cdHRvb2xDYWxsRGV0YWlsc1JlcG9ydGVkID0gZmFsc2U7XG5cdG1lc3NhZ2VDaGFyTGVuOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdC8qKiBNb2RlbCBvZiB0aGUgbW9zdCByZWNlbnQgcm91bmQsIHJlcG9ydGVkIGFzIHRoZSB0dXJuJ3MgbW9kZWwuICovXG5cdGxhc3RNb2RlbDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGlkOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgb3JkaW5hbDogbnVtYmVyLFxuXHRcdHJlYWRvbmx5IHNlbmRlckNsaWVudElkOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cmVhZG9ubHkgY2xpZW50Q29udGV4dDogSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQsXG5cdCkgeyB9XG5cblx0Z2V0IGNsaWVudFR5cGUoKTogQWdlbnRIb3N0Q2xpZW50VHlwZSB7IHJldHVybiB0aGlzLmNsaWVudENvbnRleHQuY2xpZW50VHlwZTsgfVxuXHRnZXQgc3RhdGUoKTogQ29waWxvdFR1cm5TdGF0ZSB7IHJldHVybiB0aGlzLl9zdGF0ZTsgfVxuXHRnZXQgaXNQZW5kaW5nKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fc3RhdGUgPT09ICdwZW5kaW5nJzsgfVxuXHRnZXQgaXNSdW5uaW5nKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fc3RhdGUgPT09ICdydW5uaW5nJzsgfVxuXHRnZXQgZHVyYXRpb24oKTogbnVtYmVyIHsgcmV0dXJuIE1hdGgubWF4KDAsIHRoaXMuX3N0b3BXYXRjaC5lbGFwc2VkKCkpOyB9XG5cblx0LyoqIFRyYW5zaXRpb24gYHBlbmRpbmcgXHUyMTkyIHJ1bm5pbmdgIG9uIHRoZSBmaXJzdCBTREsgZXZlbnQuIE5vLW9wIG9uY2UgcnVubmluZy9maW5pc2hlZC4gKi9cblx0bWFya1J1bm5pbmcoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlID09PSAncGVuZGluZycpIHtcblx0XHRcdHRoaXMuX3N0YXRlID0gJ3J1bm5pbmcnO1xuXHRcdH1cblx0fVxuXG5cdG1hcmtDb21wbGV0ZWQoKTogdm9pZCB7IHRoaXMuX3N0YXRlID0gJ2NvbXBsZXRlZCc7IH1cblx0bWFya0Fib3J0ZWQoKTogdm9pZCB7IHRoaXMuX3N0YXRlID0gJ2Fib3J0ZWQnOyB9XG59XG5cbi8qKlxuICogRW5jYXBzdWxhdGVzIGEgc2luZ2xlIENvcGlsb3QgU0RLIHNlc3Npb24gYW5kIGFsbCBpdHMgYXNzb2NpYXRlZCBib29ra2VlcGluZy5cbiAqXG4gKiBDcmVhdGVkIGJ5IHtAbGluayBDb3BpbG90QWdlbnR9LCBvbmUgaW5zdGFuY2UgcGVyIGFjdGl2ZSBzZXNzaW9uLiBEaXNwb3NpbmdcbiAqIHRoaXMgY2xhc3MgdGVhcnMgZG93biBhbGwgcGVyLXNlc3Npb24gcmVzb3VyY2VzIChTREsgd3JhcHBlciwgZWRpdCB0cmFja2VyLFxuICogZGF0YWJhc2UgcmVmZXJlbmNlLCBwZW5kaW5nIHBlcm1pc3Npb25zKS5cbiAqL1xuZXhwb3J0IGNsYXNzIENvcGlsb3RBZ2VudFNlc3Npb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfaG9zdEluc3RydWN0aW9uczogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHNlc3Npb25JZDogc3RyaW5nO1xuXHRyZWFkb25seSByZXNvdXJjZVVyaTogVVJJO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vd25lclNlc3Npb25Vcmk6IFVSSTtcblx0Z2V0IG93bmVyU2Vzc2lvblVyaSgpOiBVUkkgeyByZXR1cm4gdGhpcy5fb3duZXJTZXNzaW9uVXJpOyB9XG5cdC8qKiBAZGVwcmVjYXRlZCBDb21wYXRpYmlsaXR5IGFsaWFzIGZvciBTREsgY2FsbGJhY2tzOyB0aGlzIGlzIHRoZSBleGFjdCBwZXJzaXN0ZW5jZSByZXNvdXJjZS4gKi9cblx0Z2V0IHNlc3Npb25VcmkoKTogVVJJIHsgcmV0dXJuIHRoaXMucmVzb3VyY2VVcmk7IH1cblx0cHJpdmF0ZSBfY2hhdENoYW5uZWxVcmk6IFVSSTtcblx0LyoqIEZpeGVkIHBlcnNpc3RlbmNlIHNjb3BlIGZvciB0aGlzIGNoYXQ7IG5ldmVyIHJlLWRlcml2ZWQgZnJvbSB0aGUgbXV0YWJsZSByb3V0aW5nIGNoYW5uZWwuIENvbmZpZyByZWFkcy93cml0ZXMgbXVzdCB1c2Uge0BsaW5rIF9vd25lclNlc3Npb25Vcml9IGluc3RlYWQgXHUyMDE0IHBlZXIgY2hhdHMgc2hhcmUgdGhhdCBzY29wZSBidXQgaGF2ZSBkaXN0aW5jdCBzdG9yYWdlLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlVXJpOiBVUkk7XG5cblx0Z2V0IGNoYXRDaGFubmVsVXJpKCk6IFVSSSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoYXRDaGFubmVsVXJpO1xuXHR9XG5cblx0YmluZENoYXRDaGFubmVsKGNoYXRDaGFubmVsVXJpOiBVUkkpOiB2b2lkIHtcblx0XHR0aGlzLl9jaGF0Q2hhbm5lbFVyaSA9IGNoYXRDaGFubmVsVXJpO1xuXHR9XG5cblx0LyoqIFdvcmtpbmcgZGlyZWN0b3J5IHRoaXMgc2Vzc2lvbiBvcGVyYXRlcyBpbiwgaWYgYW55LiAqL1xuXHRnZXQgd29ya2luZ0RpcmVjdG9yeSgpOiBVUkkgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fd29ya2luZ0RpcmVjdG9yeTsgfVxuXG5cdC8qKiBUcmFja3MgYWN0aXZlIHRvb2wgaW52b2NhdGlvbnMgc28gd2UgY2FuIHByb2R1Y2UgcGFzdC10ZW5zZSBtZXNzYWdlcyBvbiBjb21wbGV0aW9uLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVUb29sQ2FsbHMgPSBuZXcgTWFwPHN0cmluZywgSUNvcGlsb3RBY3RpdmVUb29sQ2FsbD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RyZWFtaW5nVG9vbENhbGxzID0gbmV3IE1hcDxzdHJpbmcsIElDb3BpbG90U3RyZWFtaW5nVG9vbENhbGw+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0cmVhbWluZ1Rvb2xEaXNwbGF5U2NoZWR1bGVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZywgUnVuT25jZVNjaGVkdWxlcj4oKSk7XG5cdC8qKlxuXHQgKiBNYXBzIGEgc3ViYWdlbnQncyBzdGFibGUgYGFnZW50SWRgIHRvIGl0cyBwYXJlbnQgdG9vbCBjYWxsIGlkLiBDb21wbGV0aW9uXG5cdCAqIGVuZHMgdGhlIGN1cnJlbnQgc3ViYWdlbnQgdHVybiwgYnV0IHN0ZWVyaW5nIGNhbiBzdGFydCBhbm90aGVyIHR1cm4gd2l0aFxuXHQgKiB0aGUgc2FtZSBpZCwgc28gbWFwcGluZ3MgbGl2ZSB1bnRpbCBzZXNzaW9uIHRlYXJkb3duLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGFyZW50VG9vbENhbGxJZHNCeUFnZW50SWQgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVTdWJhZ2VudEFnZW50SWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Vucm91dGFibGVTdWJhZ2VudFRvb2xDYWxsSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2F1dG9BcHByb3ZhbHMgPSBuZXcgTWFwPHN0cmluZywgUGVybWlzc2lvbkF1dG9BcHByb3ZhbCB8IG51bGw+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdBdXRvQXBwcm92YWxzID0gbmV3IFBlbmRpbmdSZXF1ZXN0UmVnaXN0cnk8UGVybWlzc2lvbkF1dG9BcHByb3ZhbCB8IHVuZGVmaW5lZD4oKTtcblx0LyoqIENvcnJlbGF0ZXMgdG9vbCBleGVjdXRpb24gd2l0aCB0aGUgU0RLIHBlcm1pc3Npb24gbGlmZWN5Y2xlIGZvciBgY2hhdC50b29sQXBwcm92YWxgIHRlbGVtZXRyeS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfdG9vbEFwcHJvdmFsUmVjb3JkcyA9IG5ldyBNYXA8c3RyaW5nLCB7XG5cdFx0cGVybWlzc2lvblJlcXVlc3RlZDogYm9vbGVhbjtcblx0XHRyZXNvbHZlZEJ5SG9vazogYm9vbGVhbjtcblx0XHRyZXF1ZXN0U2FuZGJveEJ5cGFzczogYm9vbGVhbjtcblx0XHRyZXN1bHRLaW5kOiBQZXJtaXNzaW9uUmVzdWx0WydraW5kJ10gfCB1bmRlZmluZWQ7XG5cdFx0dG9vbE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRtY3BTZXJ2ZXJOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0cmVwb3J0ZWQ6IGJvb2xlYW47XG5cdH0+KCk7XG5cdC8qKiBQZW5kaW5nIHBlcm1pc3Npb24gcmVxdWVzdHMgYXdhaXRpbmcgYSByZW5kZXJlci1zaWRlIGRlY2lzaW9uLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nUGVybWlzc2lvbnMgPSBuZXcgUGVuZGluZ1JlcXVlc3RSZWdpc3RyeTxQZXJtaXNzaW9uUmVxdWVzdFJlc3VsdCwge1xuXHRcdHJlYWRvbmx5IG1hbmFnZWRBcHByb3ZhbFJlcXVpcmVkOiBib29sZWFuO1xuXHR9PigpO1xuXHQvKiogQ2FuY2VscyBjYWxsYmFja3MgdGhhdCBiZWdhbiBiZWZvcmUgb3IgZHVyaW5nIGFuIFNESyBhYm9ydC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYWJvcnRDdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCkpO1xuXHQvKipcblx0ICogU2lnbmF0dXJlcyAoe0BsaW5rIHNhZmVTdHJpbmdpZnl9KSBvZiB1c2VyLWFwcHJvdmVkIGByZWFkYC9gd3JpdGVgXG5cdCAqIHBlcm1pc3Npb24gcmVxdWVzdHMsIGtleWVkIGJ5IHRvb2wgY2FsbCBpZC4gVGhlIENvcGlsb3QgQ0xJIHJ1bnRpbWUgZW1pdHNcblx0ICogdHdvIGlkZW50aWNhbCBgcGVybWlzc2lvbi5yZXF1ZXN0ZWRgIGV2ZW50cyBmb3IgYSBzaW5nbGUgZmlsZSByZWFkIG9yXG5cdCAqIHdyaXRlIChhbiBpbnRlcm5hbCBgcGF0aGAgcHJvbXB0IGZvbGxvd2VkIGJ5IGEgYHJlYWRgL2B3cml0ZWAgcHJvbXB0KSwgc29cblx0ICogd2l0aG91dCB0aGlzIHRoZSB1c2VyIHdvdWxkIGJlIGFza2VkIHRvIGFwcHJvdmUgdGhlIHNhbWUgb3BlcmF0aW9uIHR3aWNlXG5cdCAqIChpc3N1ZSAjMzI0NDc3KS4gQW4gZW50cnkgaXMgc2luZ2xlLXVzZTogaXQgYXV0by1hcHByb3ZlcyBleGFjdGx5IG9uZVxuXHQgKiBzdWJzZXF1ZW50IHJlcXVlc3QgdGhhdCBpcyBieXRlLWlkZW50aWNhbCB0byB0aGUgYXBwcm92ZWQgb25lLCB0aGVuIGlzXG5cdCAqIHJlbW92ZWQsIHNvIGFwcHJvdmFsIG5ldmVyIGNhcnJpZXMgYWNyb3NzIGEgZGlmZmVyZW50IHRvb2wgY2FsbCwgYSBjaGFuZ2VkXG5cdCAqIHBhdGgvZGlmZi9jb250ZW50cywgb3IgYSBkaWZmZXJlbnQga2luZC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FwcHJvdmVkRHVwbGljYWJsZVBlcm1pc3Npb25TaWduYXR1cmVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0LyoqIFBlbmRpbmcgdXNlciBpbnB1dCByZXF1ZXN0cyBhd2FpdGluZyBhIHJlbmRlcmVyLXNpZGUgYW5zd2VyLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nVXNlcklucHV0cyA9IG5ldyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PFxuXHRcdHsgcmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZDsgYW5zd2Vycz86IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4gfSxcblx0XHR7IHF1ZXN0aW9uSWQ6IHN0cmluZyB9XG5cdD4oKTtcblx0LyoqXG5cdCAqIFBlbmRpbmcgZWxpY2l0YXRpb24gcmVxdWVzdHMgYXdhaXRpbmcgYSByZW5kZXJlci1zaWRlIGFuc3dlci4gS2V5ZWRcblx0ICogYnkgcmVxdWVzdCBpZDsgdGhlIHNjaGVtYSBpcyByZXRhaW5lZCBzbyB0aGUgY29tcGxldGlvbiBoYW5kbGVyIGNhblxuXHQgKiBwcm9qZWN0IHRoZSBzdWJtaXR0ZWQge0BsaW5rIENoYXRJbnB1dEFuc3dlcn1zIGJhY2sgaW50byB0aGVcblx0ICogU0RLJ3Mge0BsaW5rIEVsaWNpdGF0aW9uUmVzdWx0LmNvbnRlbnR9IHNoYXBlLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0VsaWNpdGF0aW9ucyA9IG5ldyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PFxuXHRcdHsgcmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZDsgYW5zd2Vycz86IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4gfSxcblx0XHR7IHNjaGVtYTogRWxpY2l0YXRpb25TY2hlbWEgfCB1bmRlZmluZWQgfVxuXHQ+KCk7XG5cdC8qKlxuXHQgKiBQZW5kaW5nIHBsYW4tcmV2aWV3IHJlcXVlc3RzIG9yaWdpbmF0aW5nIGZyb20gdGhlIENMSSdzXG5cdCAqIGBleGl0UGxhbk1vZGUucmVxdWVzdGAgUlBDLiBUcmFja2VkIHNlcGFyYXRlbHkgZnJvbVxuXHQgKiB7QGxpbmsgX3BlbmRpbmdVc2VySW5wdXRzfSBzbyB0aGUgY29tcGxldGlvbiBoYW5kbGVyIGNhbiByZXNvbHZlIHRoZVxuXHQgKiBSUEMgd2l0aCBhIHN0cnVjdHVyZWQge0BsaW5rIENvcGlsb3RFeGl0UGxhbk1vZGVSZXNwb25zZX0gKHdoaWNoIHRoZSBDTElcblx0ICogZm9yd2FyZHMgdG8gYHNlc3Npb24ucmVzcG9uZFRvRXhpdFBsYW5Nb2RlYCkgcmF0aGVyIHRoYW4gZmVlZGluZyBpdFxuXHQgKiBiYWNrIHRocm91Z2ggdGhlIFNESydzIGBhc2tfdXNlcmAgY2FsbGJhY2suXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nUGxhblJldmlld3MgPSBuZXcgUGVuZGluZ1JlcXVlc3RSZWdpc3RyeTxcblx0XHRDb3BpbG90RXhpdFBsYW5Nb2RlUmVzcG9uc2UsXG5cdFx0e1xuXHRcdFx0cmVhZG9ubHkgYWN0aW9uczogcmVhZG9ubHkgc3RyaW5nW107XG5cdFx0XHRyZWFkb25seSByZWNvbW1lbmRlZEFjdGlvbjogc3RyaW5nO1xuXHRcdFx0cmVhZG9ubHkgcXVlc3Rpb25JZDogc3RyaW5nO1xuXHRcdH1cblx0PigpO1xuXHQvKiogRmlsZSBlZGl0IHRyYWNrZXIgZm9yIHRoaXMgc2Vzc2lvbi4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdFRyYWNrZXI6IEZpbGVFZGl0VHJhY2tlcjtcblx0LyoqIFNlc3Npb24gZGF0YWJhc2UgcmVmZXJlbmNlLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kYXRhYmFzZVJlZjogSVJlZmVyZW5jZTxJU2Vzc2lvbkRhdGFiYXNlPjtcblx0LyoqXG5cdCAqIFRoZSBjdXJyZW50IHByb3RvY29sIHR1cm4gYW5kIGl0cyBwZXItdHVybiBib29ra2VlcGluZywgb3IgYHVuZGVmaW5lZGBcblx0ICogd2hlbiB0aGUgc2Vzc2lvbiBpcyBpZGxlIChubyBhY3RpdmUgdHVybikuIFJlcGxhY2VzIHRoZSBmb3JtZXIgc2V0IG9mXG5cdCAqIGxvb3NlbHktY291cGxlZCBwZXItdHVybiBmaWVsZHMgKGBfdHVybklkYCwgdXNhZ2UgY291bnRlciwgc3RyZWFtaW5nXG5cdCAqIHBhcnQtaWQgbWFwcykgd2l0aCBhIHNpbmdsZSBvYmplY3QgY2FycnlpbmcgYW4gZXhwbGljaXRcblx0ICoge0BsaW5rIENvcGlsb3RUdXJuLnN0YXRlfSBsaWZlY3ljbGUuIENyZWF0ZWQgKGBwZW5kaW5nYCkgYnlcblx0ICoge0BsaW5rIHJlc2V0VHVyblN0YXRlfSwgZmluYWxpemVkIGJ5IHtAbGluayBfY29tcGxldGVBY3RpdmVUdXJufS5cblx0ICovXG5cdHByaXZhdGUgX2N1cnJlbnRUdXJuOiBDb3BpbG90VHVybiB8IHVuZGVmaW5lZDtcblx0LyoqIE1vbm90b25pYyAwLWJhc2VkIG9yZGluYWwgYXNzaWduZWQgdG8gZWFjaCB0dXJuIGFzIGl0IHN0YXJ0cywgZm9yIG51bWVyaWMgYHR1cm5JbmRleGAgdGVsZW1ldHJ5IHBhcml0eS4gKi9cblx0cHJpdmF0ZSBfbmV4dFR1cm5PcmRpbmFsID0gMDtcblx0LyoqXG5cdCAqIFByb3RvY29sIHR1cm4gSUQgb2YgdGhlIGFjdGl2ZSB0dXJuLCBvciBgJydgIHdoZW4gaWRsZS4gVXNlZCBieSBmaWxlXG5cdCAqIGVkaXQgdHJhY2tpbmcgYW5kIGVtaXR0ZWQgb24gcGVyLXR1cm4gYWN0aW9ucy5cblx0ICovXG5cdHByaXZhdGUgZ2V0IF90dXJuSWQoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuX2N1cnJlbnRUdXJuPy5pZCA/PyAnJzsgfVxuXHQvKiogMC1iYXNlZCBvcmRpbmFsIG9mIHRoZSBhY3RpdmUgdHVybiB3aXRoaW4gdGhlIHNlc3Npb24sIG9yIGAwYCB3aGVuIGlkbGUuICovXG5cdHByaXZhdGUgZ2V0IF90dXJuT3JkaW5hbCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fY3VycmVudFR1cm4/Lm9yZGluYWwgPz8gMDsgfVxuXHQvKipcblx0ICogV2hldGhlciB0aGUgc2Vzc2lvbiBjdXJyZW50bHkgaGFzIGFuIGluLWZsaWdodCB0dXJuLiBVc2VkIGJ5XG5cdCAqIG5vbi1kZXN0cnVjdGl2ZSBpZGxlIHJlbGVhc2UgdG8gYXZvaWQgZGlzY29ubmVjdGluZyBtaWQtdHVybi5cblx0ICovXG5cdGdldCBoYXNBY3RpdmVUdXJuKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5fY3VycmVudFR1cm4gIT09IHVuZGVmaW5lZDsgfVxuXHRnZXQgY2hhdFVyaSgpOiBVUkkgeyByZXR1cm4gdGhpcy5fY2hhdENoYW5uZWxVcmk7IH1cblx0Z2V0IGN1cnJlbnRUdXJuSWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX2N1cnJlbnRUdXJuPy5pZDsgfVxuXHRnZXQgY3VycmVudFR1cm5DbGllbnRUeXBlKCk6IEFnZW50SG9zdENsaWVudFR5cGUgeyByZXR1cm4gdGhpcy5fY3VycmVudFR1cm4/LmNsaWVudFR5cGUgPz8gQWdlbnRIb3N0Q2xpZW50VHlwZS5Vbmtub3duOyB9XG5cdGdldCBjdXJyZW50VHVybkNsaWVudENvbnRleHQoKTogSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fY3VycmVudFR1cm4/LmNsaWVudENvbnRleHQ7IH1cblx0LyoqXG5cdCAqIExhc3QgbW9kZWwgaWQgc2VlbiBvbiB0aGUgU0RLJ3MgcGVyLUxMTS1jYWxsIGBVc2FnZWAgZXZlbnQgKG9yIGFcblx0ICogZGlyZWN0IHtAbGluayBzZXRNb2RlbH0gY2FsbCkuIFdlIHJlbHkgb24gdGhlXG5cdCAqIGBVc2FnZWAgZXZlbnQgcmF0aGVyIHRoYW4gdGhlIHRvb2wtY2FsbCBldmVudCBpdHNlbGYgYmVjYXVzZVxuXHQgKiB0b29sLWNhbGwgZXZlbnRzIGRvbid0IGNhcnJ5IHRoZSBtb2RlbCBpZDsgdGhlIGBVc2FnZWAgZXZlbnQgZm9yXG5cdCAqIGFuIExMTSB0dXJuIHByZWNlZGVzIHRoYXQgdHVybidzIGB0b29sX3VzZWAgZXZlbnRzLlxuXHQgKi9cblx0cHJpdmF0ZSBfbGFzdFNlZW5Nb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBMYXRlc3Qgc2Vzc2lvbi13aWRlIG5hbm8tQUlVIHRvdGFsIHJlcG9ydGVkIGJ5IHRoZSBTREsncyB1c2FnZSBtZXRyaWNzXG5cdCAqIChgcnBjLnVzYWdlLmdldE1ldHJpY3NgKSwgd2hpY2ggaXMgYXV0aG9yaXRhdGl2ZSBmb3Igd2hhdCB0aGUgc2Vzc2lvbiBhcyBhXG5cdCAqIHdob2xlIGhhcyBiZWVuIGJpbGxlZDogaXQgZm9sZHMgaW4gZXZlcnkgbW9kZWwgY2FsbCBwbHVzIGNvbXBhY3Rpb24sXG5cdCAqIGNvdmVycyB3b3JrIGJpbGxlZCB3aGlsZSBubyB0dXJuIHdhcyBhY3RpdmUsIGFuZCBzdXJ2aXZlcyByZXN1bWUuXG5cdCAqXG5cdCAqIERlbGliZXJhdGVseSAqbm90KiB1c2VkIHRvIGRlcml2ZSBwZXItdHVybiBjb3N0LiBJdCBpcyBzZXNzaW9uLXNjb3BlZCBhbmRcblx0ICogcmVhZCBhc3luY2hyb25vdXNseSwgc28gZGlmZmVyZW5jaW5nIGl0IGFnYWluc3QgYSBwcmV2aW91cyByZWFkaW5nIHJhY2VzXG5cdCAqIHR1cm4gYm91bmRhcmllcyBcdTIwMTQgdGhlIFNESydzIHRlcm1pbmFsIGBzZXNzaW9uLmlkbGVgIGNhbiBjbG9zZSBhIHR1cm4gd2hpbGVcblx0ICogYSByZWFkIGlzIHN0aWxsIGluIGZsaWdodC4gUGVyLXR1cm4gY29zdCBjb21lcyBmcm9tIHRoZSBzeW5jaHJvbm91c1xuXHQgKiBwZXItZXZlbnQgYGNvcGlsb3RVc2FnZWAgaW5zdGVhZCAoc2VlIHtAbGluayBDb3BpbG90VHVybi5jb3BpbG90TmFub0FpdX0pLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2Vzc2lvblRvdGFsTmFub0FpdSA9IDA7XG5cdHByaXZhdGUgX3Byb21wdENhY2hlU3RhdGU6IElTZXNzaW9uUHJvbXB0Q2FjaGVTdGF0ZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcHJvbXB0Q2FjaGVSZWZyZXNoR2VuZXJhdGlvbiA9IDA7XG5cdC8qKiBSZWFkcyB0aGUgbGF0ZXN0IHJldGFpbmVkIGhvc3Qgc25hcHNob3QgZm9yIHRoaXMgc2Vzc2lvbi4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfaG9zdEN1c3RvbWl6YXRpb25zOiAoKSA9PiByZWFkb25seSBDdXN0b21pemF0aW9uW107XG5cdC8qKlxuXHQgKiBTZXJpYWxpemVzIHRoZSBtZXRyaWNzIHJlYWRzIGJlaGluZCB7QGxpbmsgX3JlZnJlc2hTZXNzaW9uVXNhZ2VNZXRyaWNzfS4gU2V2ZXJhbFxuXHQgKiBoYW5kbGVycyByZWZyZXNoIHRoZSB0b3RhbCwgc28gd2l0aG91dCB0aGlzIHRoZWlyIFJQQ3Mgb3ZlcmxhcCBhbmQgYW4gb2xkZXJcblx0ICogb25lIHJlc29sdmluZyBsYXN0IHdvdWxkIHB1Ymxpc2ggYSBzZXNzaW9uIGNvc3QgdGhhdCB2aXNpYmx5IHJlZ3Jlc3Nlcy4gQVxuXHQgKiBoaWdoLXdhdGVyIG1hcmsgY2Fubm90IGJlIHVzZWQgdG8gcmVqZWN0IHN0YWxlIHJlYWRzIGluc3RlYWQsIGJlY2F1c2UgdGhlXG5cdCAqIHRvdGFsIGlzIGxlZ2l0aW1hdGVseSBub24tbW9ub3RvbmljIChzZWUgdGhlIHRydW5jYXRpb24gbm90ZSBiZWxvdykuIEtlZXBpbmdcblx0ICogb25lIHJlYWQgaW4gZmxpZ2h0IG1ha2VzIG91dC1vZi1vcmRlciByZXNvbHV0aW9uIGltcG9zc2libGUsIGFuZCBjb2FsZXNjZXNcblx0ICogdGhlIHJlZHVuZGFudCByZWFkcyB0aGF0IGEgYnVyc3Qgb2YgdXNhZ2UgZXZlbnRzIHdvdWxkIG90aGVyd2lzZSBpc3N1ZS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25Vc2FnZU1ldHJpY3NSZWZyZXNoVGhyb3R0bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlcigpKTtcblx0LyoqIFNESyBzZXNzaW9uIHdyYXBwZXIsIHNldCBieSB7QGxpbmsgaW5pdGlhbGl6ZVNlc3Npb259LiAqL1xuXHRwcml2YXRlIF93cmFwcGVyITogQ29waWxvdFNlc3Npb25XcmFwcGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zbGFzaENvbW1hbmRQcm92aWRlcjogQ29waWxvdFNsYXNoQ29tbWFuZFByb3ZpZGVyO1xuXHQvKiogTGFzdCBhZ2VudCBtb2RlIHB1c2hlZCB0byB0aGUgU0RLIHZpYSB7QGxpbmsgYXBwbHlNb2RlfSwgdG8gZWxpZGUgcmVkdW5kYW50IGBycGMubW9kZS5zZXRgIGNhbGxzLiAqL1xuXHRwcml2YXRlIF9sYXN0QXBwbGllZE1vZGU6IENvcGlsb3RTZGtNb2RlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9sYXN0QXBwbGllZFBlcm1pc3Npb25Nb2RlOiBQZXJtaXNzaW9uQWxsb3dBbGxNb2RlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hdXRvQXBwcm92YWxFeHBlcmltZW50YWxNb2RlRW5hYmxlZCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZXJtaXNzaW9uTW9kZVNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXIoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbWNwRW5hYmxlbWVudFNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXIoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbWNwU2VydmVyTGlmZWN5Y2xlU2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlckJ5S2V5PHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RlZXJpbmdNZXNzYWdlc0luRmxpZ2h0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdC8qKlxuXHQgKiBTdGVlcmluZyBtZXNzYWdlcyB0aGF0IGhhdmUgYmVlbiBhY2NlcHRlZCBieSB0aGUgU0RLIGJ1dCBub3QgeWV0XG5cdCAqIHN1cmZhY2VkIHRvIHRoZSBjaGF0IFVJIGFzIGEgc2VwYXJhdGUgdXNlciBtZXNzYWdlLiBXaGVuIHRoZSBTREtcblx0ICogZWNob2VzIGEgc3RlZXJpbmcgdGhyb3VnaCBhIGB1c2VyLm1lc3NhZ2VgIGV2ZW50IHdob3NlIGBjb250ZW50YFxuXHQgKiBtYXRjaGVzIG9uZSBvZiB0aGVzZSBlbnRyaWVzLCB3ZSBmaW5hbGl6ZSB0aGUgaW4tZmxpZ2h0IHR1cm4gYW5kXG5cdCAqIGRpc3BhdGNoIGEgbmV3IHtAbGluayBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZH0gd2hvc2Vcblx0ICogYHVzZXJNZXNzYWdlYCBpcyB0aGUgc3RlZXJpbmcgY29udGVudC4gVGhlIHJlZHVjZXIgYWxzbyByZW1vdmVzXG5cdCAqIHRoZSBwZW5kaW5nIHN0ZWVyaW5nIHZpYSB0aGUgYWN0aW9uJ3MgYHF1ZXVlZE1lc3NhZ2VJZGAuXG5cdCAqXG5cdCAqIEVudHJpZXMgbGVmdCBoZXJlIGF0IGFib3J0L2Rpc3Bvc2UgdGltZSBhcmUgZmx1c2hlZCBhc1xuXHQgKiBgc3RlZXJpbmdfY29uc3VtZWRgIHNpZ25hbHMgc28gdGhlIGNoYXQgVUkncyBwZW5kaW5nIHN0YXRlIHN0aWxsXG5cdCAqIGNsZWFycyBpbiBjbGVhbnVwIHBhdGhzIHdoZXJlIHdlIG5ldmVyIG9ic2VydmUgdGhlIGVjaG8uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nU3RlZXJpbmdGbGlwcyA9IG5ldyBNYXA8c3RyaW5nLCBQZW5kaW5nTWVzc2FnZT4oKTtcblxuXHQvKiogU25hcHNob3QgY2FwdHVyZWQgYXQgc2Vzc2lvbiBjcmVhdGlvbiBmb3IgcmVmcmVzaCBkZXRlY3Rpb24uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FwcGxpZWRTbmFwc2hvdDogSUFjdGl2ZUNsaWVudFNuYXBzaG90O1xuXHQvKiogU2Vjb25kYXJ5IGZpbGVzeXN0ZW0gcm9vdHMgc3VjY2Vzc2Z1bGx5IGFwcGxpZWQgYnkgdGhlIGxhdW5jaCB0cmFuc2FjdGlvbi4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYXBwbGllZEFkZGl0aW9uYWxEaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW107XG5cdC8qKlxuXHQgKiBMaXZlIG93bmluZy1jbGllbnQgaWRlbnRpdHksIHJlYWQgYXQgdG9vbC1jYWxsIHN0YW1wIHRpbWUgc28gYSB3aW5kb3dcblx0ICogcmVsb2FkIHRoYXQgcmUtcHVzaGVzIGlkZW50aWNhbCB0b29scyB3aXRoIGEgbmV3IGBjbGllbnRJZGAgc3RhbXBzXG5cdCAqIHN1YnNlcXVlbnQgY2xpZW50IHRvb2wgY2FsbHMgd2l0aCB0aGUgY3VycmVudCBpZCByYXRoZXIgdGhhbiB0aGUgb25lXG5cdCAqIGZyb3plbiBpbnRvIHtAbGluayBfYXBwbGllZFNuYXBzaG90fS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZUNsaWVudFRvb2xTZXQ6IEFjdGl2ZUNsaWVudFRvb2xTZXQ7XG5cdC8qKiBXaGV0aGVyIGEgY2xpZW50J3MgaG9zdC1wdWJsaXNoZWQgbWVtYmVyc2hpcCBpbmNsdWRlcyB0aGlzIGNoYXQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NsaWVudFJlYWNoZXNDaGF0OiAoY2xpZW50SWQ6IHN0cmluZywgY2hhdDogVVJJKSA9PiBib29sZWFuO1xuXHQvKiogVG9vbCBuYW1lcyB0aGF0IGFyZSBjbGllbnQtcHJvdmlkZWQsIGRlcml2ZWQgZnJvbSBzbmFwc2hvdC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY2xpZW50VG9vbE5hbWVzOiBSZWFkb25seVNldDxzdHJpbmc+O1xuXHQvKiogVG9vbC1zZWFyY2ggZGVjaXNpb24gc3VwcGxpZWQgYnkgdGhlIGxhdW5jaGVyIHRoYXQgYnVpbHQgdGhpcyBTREsgc2Vzc2lvbi4gKi9cblx0cHJpdmF0ZSBfdG9vbFNlYXJjaEFjdGl2ZSA9IGZhbHNlO1xuXHQvKiogRGVmZXJyZWQgcHJvbWlzZXMgZm9yIHBlbmRpbmcgY2xpZW50IHRvb2wgY2FsbHMsIGtleWVkIGJ5IHRvb2xDYWxsSWQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdDbGllbnRUb29sQ2FsbHMgPSBuZXcgUGVuZGluZ1JlcXVlc3RSZWdpc3RyeTxUb29sUmVzdWx0T2JqZWN0PigpO1xuXHQvKiogUGVuZGluZyBTREsgTUNQIGF1dGggaGFuZGxlciBwcm9taXNlcywga2V5ZWQgYnkgU0RLIGF1dGggcmVxdWVzdCBpZC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ01jcEF1dGhSZXF1ZXN0cyA9IG5ldyBQZW5kaW5nUmVxdWVzdFJlZ2lzdHJ5PE1jcEF1dGhSZXN1bHQgfCBudWxsIHwgdW5kZWZpbmVkLCBJUGVuZGluZ01jcEF1dGhSZXF1ZXN0PigpO1xuXHQvKiogYHBlbmRpbmctZWRpdC1jb250ZW50OmAgVVJJcyB3cml0dGVuIGR1cmluZyBwZXJtaXNzaW9uIHJlcXVlc3RzLCBrZXllZFxuXHQgKiAgYnkgdG9vbENhbGxJZC4gQ2xlYW5lZCB1cCB3aGVuIHRoZSBwZXJtaXNzaW9uIHJlc29sdmVzIG9yIHRoZSBzZXNzaW9uXG5cdCAqICBpcyBkaXNwb3NlZC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0VkaXRDb250ZW50VXJpcyA9IG5ldyBNYXA8c3RyaW5nLCBVUkk+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTZXNzaW9uUHJvZ3Jlc3M6IEVtaXR0ZXI8QWdlbnRTaWduYWw+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uTGF1bmNoZXI6IElDb3BpbG90U2Vzc2lvbkxhdW5jaGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYXVuY2hQbGFuOiBDb3BpbG90U2Vzc2lvbkxhdW5jaFBsYW47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzTGF1bmNoVG9rZW5TdGlsbEN1cnJlbnQ6ICgpID0+IGJvb2xlYW47XG5cdC8qKiBOb3RpZmllcyB0aGUgYWdlbnQgdGhhdCB0aGlzIGNoYXQncyB0dXJuIGVuZGVkLiBTZWUge0BsaW5rIElDb3BpbG90QWdlbnRTZXNzaW9uT3B0aW9ucy5vblR1cm5FbmRlZH0uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uVHVybkVuZGVkOiAoKSA9PiB2b2lkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zaGVsbE1hbmFnZXI6IFNoZWxsTWFuYWdlciB8IHVuZGVmaW5lZDtcblx0LyoqIFN0cmVhbXMgcnVudGltZS1leGVjdXRlZCBzaGVsbCBvdXRwdXQgaW50byBvdXRwdXQtb25seSAobm9uLXB0eSkgdGVybWluYWwgY2hhbm5lbHMuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX25vblB0eVNoZWxsVGVybWluYWxzOiBOb25QdHlTaGVsbFRlcm1pbmFsU3RyZWFtcztcblx0cHJpdmF0ZSByZWFkb25seSBfd29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdXN0b21pemF0aW9uRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlcnZlclRvb2xIb3N0OiBJQWdlbnRTZXJ2ZXJUb29sSG9zdCB8IHVuZGVmaW5lZDtcblx0LyoqIEJyaWRnZXMgU0RLLXJlcG9ydGVkIE1DUCBzZXJ2ZXIgc3RhdGUgaW50byBBSFAgY3VzdG9taXphdGlvbiBhY3Rpb25zLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tY3BDdXN0b21pemF0aW9uczogTWNwQ3VzdG9taXphdGlvbkNvbnRyb2xsZXI7XG5cblx0LyoqXG5cdCAqIEZhbnMgTUNQIHNlcnZlciBub3RpZmljYXRpb25zICh0b2RheTogYG5vdGlmaWNhdGlvbnMvdG9vbHMvbGlzdF9jaGFuZ2VkYClcblx0ICogdXAgdG8gdGhlIGFnZW50IGFuZCBvbiB0byB0aGUgcHJvdG9jb2wgc2VydmVyLiBGaXJlZCBieSB0aGVcblx0ICogYG9uVG9vbHNVcGRhdGVkYCBsaXN0ZW5lciBvbmNlIHBlciByZWFkeSBNQ1AgY2hhbm5lbC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTWNwTm90aWZpY2F0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU1jcE5vdGlmaWNhdGlvbj4oKSk7XG5cdHJlYWRvbmx5IG9uTWNwTm90aWZpY2F0aW9uID0gdGhpcy5fb25NY3BOb3RpZmljYXRpb24uZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVxdWlyZUF1dGggPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXF1aXJlQXV0aCA9IHRoaXMuX29uRGlkUmVxdWlyZUF1dGguZXZlbnQ7XG5cblx0LyoqXG5cdCAqIFBlbmRpbmcgTUNQIGBzYW1wbGluZy9jcmVhdGVNZXNzYWdlYCByZXF1ZXN0cyByZWNlaXZlZCBvdmVyIHRoZVxuXHQgKiBBSFAgYG1jcDovL2AgY2hhbm5lbCwga2V5ZWQgYnkgdGhlIGNhbmNlbGxhdGlvbiBoYW5kbGUgd2UgcGFzc2VkXG5cdCAqIGludG8ge0BsaW5rIHJwYy5tY3AuZXhlY3V0ZVNhbXBsaW5nfS4gVHJhY2tlZCBzbyB0aGF0IHNlc3Npb25cblx0ICogdGVhcmRvd24gY2FuIGlzc3VlIGEgYmVzdC1lZmZvcnRcblx0ICoge0BsaW5rIHJwYy5tY3AuY2FuY2VsU2FtcGxpbmdFeGVjdXRpb259IGZvciBlYWNoIG9uZSBpbnN0ZWFkIG9mXG5cdCAqIGxlYXZpbmcgdGhlIFNESy1zaWRlIHByb21pc2UgKGFuZCB0aGUgdXBzdHJlYW0gQXBwKSBoYW5naW5nLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ01jcFNhbXBsaW5ncyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdC8qKiBUcmFja3Mgd2hldGhlciBhIG5vbi1lbXB0eSBhY3Rpdml0eSBoYXMgYmVlbiBwdWJsaXNoZWQsIHNvIHdlIG9ubHkgZW1pdCBhIGNsZWFyIHdoZW4gbmVlZGVkLiAqL1xuXHRwcml2YXRlIF9oYXNBY3Rpdml0eSA9IGZhbHNlO1xuXG5cdC8qKlxuXHQgKiBMYXN0IFNESy1yZXBvcnRlZCBNQ1Agc3RhdHVzIGxvZ2dlZCBmb3IgZWFjaCBzZXJ2ZXIgKGtleWVkIGJ5IHNlcnZlclxuXHQgKiBuYW1lKS4gVXNlZCB0byBzdXBwcmVzcyBkdXBsaWNhdGUgbGlmZWN5Y2xlIGxvZyByZWNvcmRzIHdoZW4gdGhlIFNES1xuXHQgKiByZS1yZXBvcnRzIGFuIHVuY2hhbmdlZCBzdGF0dXMgXHUyMDE0IHRoZSBgcnBjLm1jcC5saXN0YCBzZWVkIGFuZCB0aGVcblx0ICogYHNlc3Npb24ubWNwX3NlcnZlcnNfbG9hZGVkYCBldmVudCByb3V0aW5lbHkgY2FycnkgdGhlIHNhbWUgc25hcHNob3QuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYXN0TG9nZ2VkTWNwU3RhdHVzID0gbmV3IE1hcDxzdHJpbmcsIFNka01jcFNlcnZlclN0YXR1cz4oKTtcblxuXHQvKiogUGxhdGZvcm0gdXNlZCB0byBjb21wdXRlIHRoZSBTREsgc2FuZGJveCBwb2xpY3kgKGluamVjdGFibGUgZm9yIHRlc3RzKS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGxhdGZvcm06IE5vZGVKUy5QbGF0Zm9ybTtcblxuXHRnZXQgbWNwU2VydmVyU3RhdGVzKCkge1xuXHRcdHJldHVybiB0aGlzLl9tY3BDdXN0b21pemF0aW9ucy5ydW50aW1lU3RhdGVzO1xuXHR9XG5cblx0LyoqIFN0YXRlbGVzcyByZXBvcnRlciB1c2VkIHRvIGVtaXQgcmVzdHJpY3RlZCBHSC9NU0ZUIHRlbGVtZXRyeSBmb3IgdGhpcyBzZXNzaW9uJ3MgbW9kZWwgY2FsbHMuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVJlcG9ydGVyOiBBZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVwb0luZm9UZWxlbWV0cnk6IEFnZW50SG9zdFJlcG9JbmZvVGVsZW1ldHJ5O1xuXHRwcml2YXRlIF9hY3RpdmVSZXBvSW5mb1R1cm46IHtcblx0XHRyZWFkb25seSB0ZWxlbWV0cnlNZXNzYWdlSWQ6IHN0cmluZztcblx0XHRjYW5jZWxsZWQ6IGJvb2xlYW47XG5cdFx0YmVnaW46IFByb21pc2U8eyByZWFkb25seSBjb250ZXh0OiBJQWdlbnRIb3N0UmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQ7IHJlYWRvbmx5IGJhc2VCcmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkPjtcblx0fSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJQ29waWxvdEFnZW50U2Vzc2lvbk9wdGlvbnMsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVNlc3Npb25EYXRhU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uRGF0YVNlcnZpY2U6IElTZXNzaW9uRGF0YVNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSxcblx0XHRASUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2N1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZTogSUFnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRASUFnZW50SG9zdFByb21wdENhY2hlIHByaXZhdGUgcmVhZG9ubHkgX3Byb21wdENhY2hlOiBJQWdlbnRIb3N0UHJvbXB0Q2FjaGUsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJQ29waWxvdEFwaVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29waWxvdEFwaVNlcnZpY2U6IElDb3BpbG90QXBpU2VydmljZSxcblx0XHRASUFnZW50SG9zdE9UZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX290ZWxTZXJ2aWNlOiBJQWdlbnRIb3N0T1RlbFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fYWJvcnRDdHMudmFsdWUgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLnNlc3Npb25JZCA9IG9wdGlvbnMucmF3U2Vzc2lvbklkO1xuXHRcdHRoaXMuX293bmVyU2Vzc2lvblVyaSA9IG9wdGlvbnMuc2Vzc2lvblVyaTtcblx0XHR0aGlzLnJlc291cmNlVXJpID0gb3B0aW9ucy5yZXNvdXJjZSA/PyBvcHRpb25zLnNlc3Npb25Vcmk7XG5cdFx0dGhpcy5fc2xhc2hDb21tYW5kUHJvdmlkZXIgPSBuZXcgQ29waWxvdFNsYXNoQ29tbWFuZFByb3ZpZGVyKCgpID0+IHRoaXMuX3dyYXBwZXIuc2Vzc2lvbi5ycGMuY29tbWFuZHMubGlzdCh7IGluY2x1ZGVCdWlsdGluczogdHJ1ZSwgaW5jbHVkZVNraWxsczogdHJ1ZSwgaW5jbHVkZUNsaWVudENvbW1hbmRzOiB0cnVlIH0pLnRoZW4oYyA9PiBjLmNvbW1hbmRzKSwgdGhpcy5fbG9nU2VydmljZSk7XG5cdFx0dGhpcy5fY2hhdENoYW5uZWxVcmkgPSBvcHRpb25zLmNoYXRDaGFubmVsVXJpO1xuXHRcdHRoaXMuX3N0b3JhZ2VVcmkgPSB0aGlzLnJlc291cmNlVXJpO1xuXHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzID0gb3B0aW9ucy5vbkRpZFNlc3Npb25Qcm9ncmVzcztcblx0XHR0aGlzLl9zZXNzaW9uTGF1bmNoZXIgPSBvcHRpb25zLnNlc3Npb25MYXVuY2hlcjtcblx0XHR0aGlzLl9sYXVuY2hQbGFuID0gb3B0aW9ucy5sYXVuY2hQbGFuO1xuXHRcdHRoaXMuX2lzTGF1bmNoVG9rZW5TdGlsbEN1cnJlbnQgPSBvcHRpb25zLmlzTGF1bmNoVG9rZW5DdXJyZW50ID8/ICgoKSA9PiB0cnVlKTtcblx0XHR0aGlzLl9vblR1cm5FbmRlZCA9IG9wdGlvbnMub25UdXJuRW5kZWQgPz8gKCgpID0+IHsgfSk7XG5cdFx0dGhpcy5fc2hlbGxNYW5hZ2VyID0gb3B0aW9ucy5zaGVsbE1hbmFnZXI7XG5cdFx0dGhpcy5fbm9uUHR5U2hlbGxUZXJtaW5hbHMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb25QdHlTaGVsbFRlcm1pbmFsU3RyZWFtcywgb3B0aW9ucy5zZXNzaW9uVXJpKSk7XG5cdFx0dGhpcy5fd29ya2luZ0RpcmVjdG9yeSA9IG9wdGlvbnMud29ya2luZ0RpcmVjdG9yeTtcblx0XHR0aGlzLl9jdXN0b21pemF0aW9uRGlyZWN0b3J5ID0gb3B0aW9ucy5jdXN0b21pemF0aW9uRGlyZWN0b3J5O1xuXHRcdHRoaXMuX3NlcnZlclRvb2xIb3N0ID0gb3B0aW9ucy5zZXJ2ZXJUb29sSG9zdDtcblx0XHR0aGlzLl9ob3N0Q3VzdG9taXphdGlvbnMgPSBvcHRpb25zLmhvc3RDdXN0b21pemF0aW9ucyA/PyAoKCkgPT4gW10pO1xuXHRcdHRoaXMuX3BsYXRmb3JtID0gb3B0aW9ucy5wbGF0Zm9ybSA/PyBwcm9jZXNzLnBsYXRmb3JtO1xuXHRcdHRoaXMuX3RlbGVtZXRyeVJlcG9ydGVyID0gbmV3IEFnZW50SG9zdFRlbGVtZXRyeVJlcG9ydGVyKHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlcG9JbmZvVGVsZW1ldHJ5ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0UmVwb0luZm9UZWxlbWV0cnksIHRoaXMuX3RlbGVtZXRyeVJlcG9ydGVyKSk7XG5cblx0XHR0aGlzLl9hcHBsaWVkU25hcHNob3QgPSBvcHRpb25zLmNsaWVudFNuYXBzaG90ID8/IHsgdG9vbHM6IFtdLCBwbHVnaW5zOiBbXSwgbWNwU2VydmVyczoge30gfTtcblx0XHR0aGlzLl9hcHBsaWVkQWRkaXRpb25hbERpcmVjdG9yaWVzID0gWy4uLih0aGlzLl9sYXVuY2hQbGFuLmFkZGl0aW9uYWxEaXJlY3RvcmllcyA/PyBbXSldO1xuXHRcdC8vIFJvdXRpbmcga2VlcHMgdGhlIHVuZmlsdGVyZWQgc2V0IFx1MjAxNCB0aGUgcnVudGltZSBpcyB0aGUgZW5mb3JjZW1lbnQgcG9pbnQuXG5cdFx0dGhpcy5fY2xpZW50VG9vbE5hbWVzID0gY2xpZW50VG9vbE5hbWVzRnJvbVNuYXBzaG90KHRoaXMuX2FwcGxpZWRTbmFwc2hvdCk7XG5cdFx0Ly8gU2hhcmUgdGhlIGFnZW50J3MgbGl2ZSBBY3RpdmVDbGllbnRUb29sU2V0IHdoZW4gcHJvdmlkZWQgc28gY2xpZW50XG5cdFx0Ly8gY29udHJpYnV0aW9ucyAoYW5kIG93bmVyIGlkZW50aXR5KSBhcmUgb2JzZXJ2ZWQgYXQgc3RhbXAgdGltZS5cblx0XHQvLyBTdGFuZGFsb25lIC8gdGVzdCBjb25zdHJ1Y3Rpb24gdXNlcyBhIGZyZXNoIGVtcHR5IHJlZ2lzdHJ5LCB3aGljaFxuXHRcdC8vIGxlYXZlcyBjbGllbnQgdG9vbCBjYWxscyB1bnN0YW1wZWQgKG5vIG93bmluZyBjbGllbnQpLlxuXHRcdHRoaXMuX2FjdGl2ZUNsaWVudFRvb2xTZXQgPSBvcHRpb25zLmFjdGl2ZUNsaWVudFRvb2xTZXQgPz8gbmV3IEFjdGl2ZUNsaWVudFRvb2xTZXQoKTtcblx0XHR0aGlzLl9jbGllbnRSZWFjaGVzQ2hhdCA9IG9wdGlvbnMuY2xpZW50UmVhY2hlc0NoYXQgPz8gKCgpID0+IHRydWUpO1xuXG5cdFx0dGhpcy5fZGF0YWJhc2VSZWYgPSB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKHRoaXMuX3N0b3JhZ2VVcmkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9kYXRhYmFzZVJlZi5kaXNwb3NlKCkpKTtcblx0XHR0aGlzLl9lZGl0VHJhY2tlciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0RmlsZUVkaXRUcmFja2VyLFxuXHRcdFx0dGhpcy5fc3RvcmFnZVVyaS50b1N0cmluZygpLFxuXHRcdFx0dGhpcy5fZGF0YWJhc2VSZWYub2JqZWN0LFxuXHRcdCk7XG5cblx0XHRjb25zdCBwbHVnaW5NY3BTZXJ2ZXJTb3VyY2VzID0gbmV3IE1hcCgob3B0aW9ucy5jbGllbnRTbmFwc2hvdD8ucGx1Z2lucyA/PyBbXSkuZmxhdE1hcChwbHVnaW4gPT4ge1xuXHRcdFx0Y29uc3Qgc291cmNlVXJpID0gcGx1Z2luLnNvdXJjZVVyaTtcblx0XHRcdHJldHVybiBzb3VyY2VVcmkgPT09IHVuZGVmaW5lZCA/IFtdIDogcGx1Z2luLm1jcFNlcnZlcnMubWFwKHNlcnZlciA9PiBbc2VydmVyLm5hbWUsIHNvdXJjZVVyaS50b1N0cmluZygpXSBhcyBjb25zdCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX21jcEN1c3RvbWl6YXRpb25zID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwQ3VzdG9taXphdGlvbkNvbnRyb2xsZXIsIHtcblx0XHRcdHByb3ZpZGVySWQ6IHRoaXMucmVzb3VyY2VVcmkuc2NoZW1lLFxuXHRcdFx0c2Vzc2lvbklkOiB0aGlzLnNlc3Npb25JZCxcblx0XHRcdHNlc3Npb25Vcmk6IHRoaXMucmVzb3VyY2VVcmksXG5cdFx0XHRlbWl0OiBhY3Rpb24gPT4gdGhpcy5fZW1pdEFjdGlvbihhY3Rpb24pLFxuXHRcdFx0cGx1Z2luTWNwU2VydmVyU291cmNlczogKCkgPT4gcGx1Z2luTWNwU2VydmVyU291cmNlcyxcblx0XHRcdHJlc29sdmVFbmFibGVtZW50OiAoc2VydmVyLCBvd25pbmdQbHVnaW5VcmkpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb2x1dGlvbiA9IHRoaXMuX2N1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZS5yZXNvbHZlKHRoaXMuX293bmVyU2Vzc2lvblVyaS50b1N0cmluZygpLCB0YXJnZXRGb3JNY3BTZXJ2ZXIoc2VydmVyLCBvd25pbmdQbHVnaW5VcmksIGZhbHNlKSk7XG5cdFx0XHRcdHJldHVybiByZXNvbHV0aW9uLmtpbmQgPT09ICdyZXNvbHZlZCcgPyByZXNvbHV0aW9uLmVuYWJsZW1lbnQgOiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9jYW5jZWxBbGxQZW5kaW5nSW50ZXJhY3Rpb25zKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fc2hlbGxNYW5hZ2VyPy5kaXNwb3NlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5fZHJhaW5QZW5kaW5nU3RlZXJpbmdGbGlwcygpKSk7XG5cblx0XHQvLyBXaGVuIGEgc2hlbGwgdG9vbCBhc3NvY2lhdGVzIGEgdGVybWluYWwgd2l0aCBhIHRvb2wgY2FsbCwgZmlyZSBhXG5cdFx0Ly8gdG9vbF9jb250ZW50X2NoYW5nZWQgZXZlbnQgc28gdGhlIFVJIGNhbiBjb25uZWN0IHRvIHRoZSB0ZXJtaW5hbFxuXHRcdC8vIHdoaWxlIHRoZSBjb21tYW5kIGlzIHN0aWxsIHJ1bm5pbmcuXG5cdFx0aWYgKHRoaXMuX3NoZWxsTWFuYWdlcikge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc2hlbGxNYW5hZ2VyLm9uRGlkQXNzb2NpYXRlVGVybWluYWwoKHsgdG9vbENhbGxJZCwgdGVybWluYWxVcmksIGRpc3BsYXlOYW1lIH0pID0+IHtcblx0XHRcdFx0Y29uc3QgdHJhY2tlZCA9IHRoaXMuX2FjdGl2ZVRvb2xDYWxscy5nZXQodG9vbENhbGxJZCk7XG5cdFx0XHRcdGlmICghdHJhY2tlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRyYWNrZWQuY29udGVudC5wdXNoKHtcblx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwsXG5cdFx0XHRcdFx0cmVzb3VyY2U6IHRlcm1pbmFsVXJpLFxuXHRcdFx0XHRcdHRpdGxlOiBkaXNwbGF5TmFtZSxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb250ZW50Q2hhbmdlZCxcblx0XHRcdFx0XHR0dXJuSWQ6IHRoaXMuX3R1cm5JZCxcblx0XHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IHRyYWNrZWQuY29udGVudCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tLSBBZ2VudFNpZ25hbCBoZWxwZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKiBXcmFwcyBhIHtAbGluayBTZXNzaW9uQWN0aW9ufSBpbiBhbiB7QGxpbmsgQWdlbnRTaWduYWx9IGVudmVsb3BlIGFuZCBlbWl0cyBpdC4gKi9cblx0LyoqIHRvZG9AY29ubm9yNDMxMjogQUhQIGlzIG1pc3NpbmcgYSBjaGF0IGFjdGl2aXR5IHVwZGF0ZSBhY3Rpb24gd2hpY2ggaXMgbmVlZGVkIHRvIGRyb3AgYFNlc3Npb25BY3Rpb25gIGhlcmUgKi9cblx0cHJpdmF0ZSBfZW1pdEFjdGlvbihhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uLCBwYXJlbnRUb29sQ2FsbElkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRTZXNzaW9uUHJvZ3Jlc3MuZmlyZSh7XG5cdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdHJlc291cmNlOiBpc0NoYXRBY3Rpb24oYWN0aW9uKSA/IHRoaXMuX2NoYXRDaGFubmVsVXJpIDogdGhpcy5fb3duZXJTZXNzaW9uVXJpLFxuXHRcdFx0YWN0aW9uLFxuXHRcdFx0cGFyZW50VG9vbENhbGxJZCxcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQcm9tb3RlcyBhIHBlbmRpbmcgc3RlZXJpbmcgbWVzc2FnZSBpbnRvIGl0cyBvd24gcHJvdG9jb2wgdHVybjpcblx0ICogY2xvc2VzIHRoZSBpbi1mbGlnaHQgdHVybiAoc28gaXRzIHJlc3BvbnNlUGFydHMgc2V0dGxlIGludG8gaGlzdG9yeSlcblx0ICogYW5kIGRpc3BhdGNoZXMge0BsaW5rIEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkfSBmb3IgYSBmcmVzaFxuXHQgKiB0dXJuIHdob3NlIHVzZXIgbWVzc2FnZSBpcyB0aGUgc3RlZXJpbmcgY29udGVudC4gVGhlIGFjdGlvbidzXG5cdCAqIGBxdWV1ZWRNZXNzYWdlSWRgIGF0b21pY2FsbHkgY2xlYXJzIHRoZSBjb3JyZXNwb25kaW5nIHBlbmRpbmdcblx0ICogc3RlZXJpbmcgbWVzc2FnZSBmcm9tIHRoZSBzZXNzaW9uIHN0YXRlLlxuXHQgKlxuXHQgKiBBbGwgc3Vic2VxdWVudCBTREsgZXZlbnRzIChtZXNzYWdlIGRlbHRhcywgdG9vbCBjYWxscywgXHUyMDI2KSBlbWl0dGVkXG5cdCAqIGJ5IHRoZSBhZ2VudCBub3cgcmVmZXJlbmNlIHRoZSBuZXcgYF90dXJuSWRgLCBzbyB0aGUgc3RlZXJpbmdcblx0ICogcmVzcG9uc2UgbGFuZHMgaW4gdGhlIG5ldyB0dXJuIHJhdGhlciB0aGFuIGJlaW5nIGZvbGRlZCBpbnRvIHRoZVxuXHQgKiBvcmlnaW5hbC5cblx0ICpcblx0ICogUmV0dXJucyB0aGUgbmV3IHR1cm4gaWQgc28gY2FsbGVycyAobm90YWJseSB0aGUgYHVzZXIubWVzc2FnZWBcblx0ICogaGFuZGxlcikgY2FuIGFzc29jaWF0ZSB0aGUgU0RLIGV2ZW50IGlkIHdpdGggdGhlIHN0ZWVyaW5nIHR1cm4gZm9yXG5cdCAqIGhpc3RvcnkudHJ1bmNhdGUgLyBzZXNzaW9ucy5mb3JrIG1hcHBpbmcuXG5cdCAqL1xuXHRwcml2YXRlIF9iZWdpblN0ZWVyaW5nVHVybihzdGVlcmluZzogUGVuZGluZ01lc3NhZ2UpOiBzdHJpbmcge1xuXHRcdHRoaXMuX2NvbXBsZXRlQWN0aXZlVHVybigpO1xuXHRcdGNvbnN0IG5ld1R1cm5JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHR0dXJuSWQ6IG5ld1R1cm5JZCxcblx0XHRcdHN0YXJ0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0bWVzc2FnZTogc3RlZXJpbmcubWVzc2FnZSxcblx0XHRcdHF1ZXVlZE1lc3NhZ2VJZDogc3RlZXJpbmcuaWQsXG5cdFx0fSk7XG5cdFx0Ly8gTWlycm9yIGByZXNldFR1cm5TdGF0ZWAgc28gcGVyLXR1cm4gY291bnRlcnMvbWFwcGluZ3MgKHVzYWdlIHRvdGFsLFxuXHRcdC8vIHN0cmVhbWluZyBwYXJ0IGlkcykgZG9uJ3QgYmxlZWQgZnJvbSB0aGUgcHJlZW1wdGVkIHR1cm4gaW50byB0aGUgbmV3XG5cdFx0Ly8gc3RlZXJpbmcgdHVybi4gVGhlIHN0ZWVyaW5nIHR1cm4gaXMgY3JlYXRlZCBtaWQtbG9vcCBpbiByZXNwb25zZSB0byBhblxuXHRcdC8vIFNESyBgdXNlci5tZXNzYWdlYCBldmVudCwgc28gdGhlIFNESyBpcyBhbHJlYWR5IGFjdGl2ZWx5IHByb2R1Y2luZyBpdHNcblx0XHQvLyByZXNwb25zZTogbWFyayBpdCBgcnVubmluZ2AgaW1tZWRpYXRlbHkgcmF0aGVyIHRoYW4gbGVhdmluZyBpdFxuXHRcdC8vIGBwZW5kaW5nYCwgb3RoZXJ3aXNlIGFuIGFib3J0IGR1cmluZyB0aGUgc3RlZXJpbmcgdHVybiB3b3VsZCB0cmVhdCBpdFxuXHRcdC8vIGFzIGEgbm90LXlldC1zdGFydGVkIHF1ZXVlZCB0dXJuIGFuZCBsZWF2ZSBpdCBvcGVuLlxuXHRcdHRoaXMucmVzZXRUdXJuU3RhdGUobmV3VHVybklkKTtcblx0XHRpZiAodGhpcy5fY3VycmVudFR1cm4pIHtcblx0XHRcdHRoaXMuX2N1cnJlbnRUdXJuLm1lc3NhZ2VDaGFyTGVuID0gc3RlZXJpbmcubWVzc2FnZS50ZXh0Lmxlbmd0aDtcblx0XHRcdHRoaXMuX2N1cnJlbnRUdXJuLm1hcmtSdW5uaW5nKCk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXdUdXJuSWQ7XG5cdH1cblxuXHQvKipcblx0ICogRHJhaW5zIGFueSBzdGVlcmluZyBtZXNzYWdlcyB3ZSBhY2tub3dsZWRnZWQgdG8gdGhlIFNESyBidXQgbmV2ZXJcblx0ICogcHJvbW90ZWQgdG8gdGhlaXIgb3duIHR1cm4gKGUuZy4gb24gYWJvcnQgb3Igc2Vzc2lvbiBkaXNwb3NlKS4gRmlyZXNcblx0ICogYHN0ZWVyaW5nX2NvbnN1bWVkYCBzbyB0aGUgY2hhdCBVSSByZW1vdmVzIHRoZSBsaW5nZXJpbmcgcGVuZGluZ1xuXHQgKiBzdGVlcmluZyBidWJibGUgZXZlbiB3aGVuIG5vIGZyZXNoIGB1c2VyLm1lc3NhZ2VgIGFycml2ZXMuXG5cdCAqL1xuXHRwcml2YXRlIF9kcmFpblBlbmRpbmdTdGVlcmluZ0ZsaXBzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wZW5kaW5nU3RlZXJpbmdGbGlwcy5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGlkcyA9IFsuLi50aGlzLl9wZW5kaW5nU3RlZXJpbmdGbGlwcy5rZXlzKCldO1xuXHRcdHRoaXMuX3BlbmRpbmdTdGVlcmluZ0ZsaXBzLmNsZWFyKCk7XG5cdFx0Zm9yIChjb25zdCBpZCBvZiBpZHMpIHtcblx0XHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmZpcmUoe1xuXHRcdFx0XHRraW5kOiAnc3RlZXJpbmdfY29uc3VtZWQnLFxuXHRcdFx0XHRjaGF0OiB0aGlzLl9jaGF0Q2hhbm5lbFVyaSxcblx0XHRcdFx0aWQsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUG9wcyB0aGUgYnVmZmVyZWQgc3RlZXJpbmcgbWVzc2FnZSB3aG9zZSB0ZXh0IG1hdGNoZXMgdGhlIFNES1xuXHQgKiBgdXNlci5tZXNzYWdlYCBjb250ZW50IHdlIGp1c3Qgb2JzZXJ2ZWQuIE1hdGNoaW5nIGJ5IGNvbnRlbnQgKHJhdGhlclxuXHQgKiB0aGFuIGp1c3QgcG9wcGluZyBGSUZPKSBrZWVwcyB1cyByb2J1c3QgYWdhaW5zdCB0aGUgU0RLIHJlb3JkZXJpbmdcblx0ICogb3IgY29hbGVzY2luZyBlbnRyaWVzIFx1MjAxNCBjb25jdXJyZW50IHN0ZWVyaW5nIG1lc3NhZ2VzIHdpdGggZGlmZmVyZW50XG5cdCAqIHRleHRzIGFyZSBzdGlsbCBtYXRjaGVkIHRvIHRoZSBjb3JyZWN0IG9uZS4gUmV0dXJucyBgdW5kZWZpbmVkYCBpZlxuXHQgKiBubyBidWZmZXJlZCBlbnRyeSBtYXRjaGVzOyB0aGUgY2FsbGVyIHRyZWF0cyB0aGUgYHVzZXIubWVzc2FnZWAgYXNcblx0ICogYW4gb3JkaW5hcnkgZWNobyBhbmQgc2tpcHMgdGhlIHR1cm4gZmxpcC5cblx0ICovXG5cdHByaXZhdGUgX3Rha2VNYXRjaGluZ1BlbmRpbmdTdGVlcmluZyhjb250ZW50OiBzdHJpbmcpOiBQZW5kaW5nTWVzc2FnZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdTdGVlcmluZ0ZsaXBzLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgW2lkLCBtc2ddIG9mIHRoaXMuX3BlbmRpbmdTdGVlcmluZ0ZsaXBzKSB7XG5cdFx0XHRpZiAobXNnLm1lc3NhZ2UudGV4dCA9PT0gY29udGVudCkge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nU3RlZXJpbmdGbGlwcy5kZWxldGUoaWQpO1xuXHRcdFx0XHRyZXR1cm4gbXNnO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGFyZW50VG9vbENhbGxJZEZvclN1YmFnZW50RXZlbnQoZTogeyByZWFkb25seSBhZ2VudElkPzogc3RyaW5nIH0pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBlLmFnZW50SWQgPyB0aGlzLl9wYXJlbnRUb29sQ2FsbElkc0J5QWdlbnRJZC5nZXQoZS5hZ2VudElkKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc3VtZVN1YmFnZW50Rm9yRXZlbnQoZTogeyByZWFkb25seSBhZ2VudElkPzogc3RyaW5nIH0sIG1lc3NhZ2U/OiBNZXNzYWdlKTogdm9pZCB7XG5cdFx0aWYgKCFlLmFnZW50SWQgfHwgdGhpcy5fYWN0aXZlU3ViYWdlbnRBZ2VudElkcy5oYXMoZS5hZ2VudElkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwYXJlbnRUb29sQ2FsbElkID0gdGhpcy5fcGFyZW50VG9vbENhbGxJZHNCeUFnZW50SWQuZ2V0KGUuYWdlbnRJZCk7XG5cdFx0aWYgKCFwYXJlbnRUb29sQ2FsbElkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2FjdGl2ZVN1YmFnZW50QWdlbnRJZHMuYWRkKGUuYWdlbnRJZCk7XG5cdFx0dGhpcy5fb25EaWRTZXNzaW9uUHJvZ3Jlc3MuZmlyZSh7XG5cdFx0XHRraW5kOiAnc3ViYWdlbnRfcmVzdW1lZCcsXG5cdFx0XHRjaGF0OiB0aGlzLl9jaGF0Q2hhbm5lbFVyaSxcblx0XHRcdHRvb2xDYWxsSWQ6IHBhcmVudFRvb2xDYWxsSWQsXG5cdFx0XHRtZXNzYWdlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29tcGxldGVTdWJhZ2VudFR1cm4oYWdlbnRJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCB0b29sQ2FsbElkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKGFnZW50SWQpIHtcblx0XHRcdGlmICghdGhpcy5fYWN0aXZlU3ViYWdlbnRBZ2VudElkcy5kZWxldGUoYWdlbnRJZCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoIXRvb2xDYWxsSWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcGFyZW50VG9vbENhbGxJZCA9IHRvb2xDYWxsSWQgPz8gKGFnZW50SWQgPyB0aGlzLl9wYXJlbnRUb29sQ2FsbElkc0J5QWdlbnRJZC5nZXQoYWdlbnRJZCkgOiB1bmRlZmluZWQpO1xuXHRcdGlmICghcGFyZW50VG9vbENhbGxJZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZFNlc3Npb25Qcm9ncmVzcy5maXJlKHtcblx0XHRcdGtpbmQ6ICdzdWJhZ2VudF9jb21wbGV0ZWQnLFxuXHRcdFx0Y2hhdDogdGhpcy5fY2hhdENoYW5uZWxVcmksXG5cdFx0XHR0b29sQ2FsbElkOiBwYXJlbnRUb29sQ2FsbElkLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvdWxkRHJvcFVubWFwcGVkU3ViYWdlbnRFdmVudChlOiB7IHJlYWRvbmx5IGFnZW50SWQ/OiBzdHJpbmcgfSwgZXZlbnROYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBwYXJlbnRUb29sQ2FsbElkID0gdGhpcy5fcGFyZW50VG9vbENhbGxJZEZvclN1YmFnZW50RXZlbnQoZSk7XG5cdFx0aWYgKCFwYXJlbnRUb29sQ2FsbElkICYmIGUuYWdlbnRJZCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gRHJvcHBpbmcgJHtldmVudE5hbWV9IGZvciB1bmtub3duIHN1YmFnZW50IGFnZW50SWQ9JHtlLmFnZW50SWR9YCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0LyoqIFJlc29sdmVzIHRoZSBvd25pbmcgY2xpZW50IGZvciBhIGNoYXQtc2NvcGVkIHRvb2wgY2FsbCwgaG9ub3JpbmcgaG9zdC1wdWJsaXNoZWQgY2hhdCBtZW1iZXJzaGlwLiAqL1xuXHRwcml2YXRlIF9yZXNvbHZlQ2xpZW50VG9vbE93bmVyKHRvb2xOYW1lOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNoYXQgPSB0aGlzLl9jaGF0Q2hhbm5lbFVyaTtcblx0XHRjb25zdCBwcm92aWRlcyA9IChjbGllbnRJZDogc3RyaW5nKSA9PiB0aGlzLl9hY3RpdmVDbGllbnRUb29sU2V0LmdldChjbGllbnRJZCkuc29tZSh0b29sID0+IHRvb2wubmFtZSA9PT0gdG9vbE5hbWUpO1xuXHRcdGNvbnN0IHByZWZlcnJlZCA9IHRoaXMuX2N1cnJlbnRUdXJuPy5zZW5kZXJDbGllbnRJZDtcblx0XHRpZiAocHJlZmVycmVkICYmIHRoaXMuX2NsaWVudFJlYWNoZXNDaGF0KHByZWZlcnJlZCwgY2hhdCkgJiYgcHJvdmlkZXMocHJlZmVycmVkKSkge1xuXHRcdFx0cmV0dXJuIHByZWZlcnJlZDtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBjbGllbnRJZCBvZiB0aGlzLl9hY3RpdmVDbGllbnRUb29sU2V0LmNsaWVudElkcygpKSB7XG5cdFx0XHRpZiAodGhpcy5fY2xpZW50UmVhY2hlc0NoYXQoY2xpZW50SWQsIGNoYXQpICYmIHByb3ZpZGVzKGNsaWVudElkKSkge1xuXHRcdFx0XHRyZXR1cm4gY2xpZW50SWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRUb29sQ2FsbENvbnRyaWJ1dG9yKHRvb2xOYW1lOiBzdHJpbmcsIG1jcFNlcnZlck5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFRvb2xDYWxsQ29udHJpYnV0b3IgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNsaWVudFRvb2xOYW1lID0gdGhpcy5fY2xpZW50VG9vbE5hbWUodG9vbE5hbWUpO1xuXHRcdGlmICh0aGlzLl9jbGllbnRUb29sTmFtZXMuaGFzKGNsaWVudFRvb2xOYW1lKSkge1xuXHRcdFx0Y29uc3QgY2xpZW50SWQgPSB0aGlzLl9yZXNvbHZlQ2xpZW50VG9vbE93bmVyKGNsaWVudFRvb2xOYW1lKTtcblx0XHRcdHJldHVybiBjbGllbnRJZCA/IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZCB9IDogdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAobWNwU2VydmVyTmFtZSkge1xuXHRcdFx0Y29uc3QgY3VzdG9taXphdGlvbklkID0gdGhpcy5fbWNwQ3VzdG9taXphdGlvbnMuY3VzdG9taXphdGlvbklkRm9yU2VydmVyKG1jcFNlcnZlck5hbWUpO1xuXHRcdFx0cmV0dXJuIGN1c3RvbWl6YXRpb25JZCA/IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuTUNQLCBjdXN0b21pemF0aW9uSWQgfSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVRvb2xDYWxsTWV0YSh0b29sTmFtZTogc3RyaW5nLCBwYXJhbWV0ZXJzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCk6IE11dGFibGU8SVRvb2xDYWxsTWV0YT4ge1xuXHRcdGNvbnN0IHRvb2xLaW5kID0gZ2V0VG9vbEtpbmQodG9vbE5hbWUsIHBhcmFtZXRlcnMpO1xuXHRcdGNvbnN0IHN1YmFnZW50TWV0YSA9IHRvb2xLaW5kID09PSAnc3ViYWdlbnQnID8gZ2V0U3ViYWdlbnRNZXRhZGF0YShwYXJhbWV0ZXJzKSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dG9vbEtpbmQsXG5cdFx0XHRsYW5ndWFnZTogdG9vbEtpbmQgPT09ICd0ZXJtaW5hbCcgPyBnZXRTaGVsbExhbmd1YWdlKHRvb2xOYW1lKSA6IHVuZGVmaW5lZCxcblx0XHRcdHN1YmFnZW50RGVzY3JpcHRpb246IHN1YmFnZW50TWV0YT8uZGVzY3JpcHRpb24sXG5cdFx0XHRzdWJhZ2VudEFnZW50TmFtZTogc3ViYWdlbnRNZXRhPy5hZ2VudE5hbWUsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFN0cmVhbWluZ1Rvb2xDYWxsRGlzcGxheSh0b29sTmFtZTogc3RyaW5nLCBpbnB1dDogc3RyaW5nKSB7XG5cdFx0Y29uc3QgcGFydGlhbElucHV0ID0gcGFyc2VDb3BpbG90U3RyZWFtaW5nVG9vbElucHV0KGlucHV0KTtcblx0XHRjb25zdCBwYXJhbWV0ZXJzID0gcGFydGlhbElucHV0ICE9PSBudWxsICYmIHR5cGVvZiBwYXJ0aWFsSW5wdXQgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHBhcnRpYWxJbnB1dClcblx0XHRcdD8gcGFydGlhbElucHV0IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+XG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cGFyYW1ldGVycyxcblx0XHRcdG1ldGE6IHRoaXMuX2NyZWF0ZVRvb2xDYWxsTWV0YSh0b29sTmFtZSwgcGFyYW1ldGVycyksXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogZ2V0U3RyZWFtaW5nSW52b2NhdGlvbk1lc3NhZ2UodG9vbE5hbWUsIGdldFRvb2xEaXNwbGF5TmFtZSh0b29sTmFtZSksIHBhcnRpYWxJbnB1dCwgcGF0aCA9PiB0aGlzLl9yZXNvbHZlRWRpdEZpbGVQYXRoKHBhdGgpKSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZW1pdFN0cmVhbWluZ1Rvb2xDYWxsRGlzcGxheSh0b29sQ2FsbElkOiBzdHJpbmcsIHN0cmVhbWluZzogSUNvcGlsb3RTdHJlYW1pbmdUb29sQ2FsbCk6IHZvaWQge1xuXHRcdGlmICghc3RyZWFtaW5nLnRvb2xOYW1lKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGRpc3BsYXkgPSB0aGlzLl9nZXRTdHJlYW1pbmdUb29sQ2FsbERpc3BsYXkoc3RyZWFtaW5nLnRvb2xOYW1lLCBzdHJlYW1pbmcuaW5wdXQpO1xuXHRcdHN0cmVhbWluZy5kaXNwbGF5ZWRJbnB1dExlbmd0aCA9IHN0cmVhbWluZy5pbnB1dC5sZW5ndGg7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IHN0cmVhbWluZ1Rvb2xEaXNwbGF5VGV4dChkaXNwbGF5Lmludm9jYXRpb25NZXNzYWdlKTtcblx0XHRpZiAobWVzc2FnZSA9PT0gc3RyZWFtaW5nLmRpc3BsYXllZE1lc3NhZ2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0c3RyZWFtaW5nLmRpc3BsYXllZE1lc3NhZ2UgPSBtZXNzYWdlO1xuXHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YSxcblx0XHRcdHR1cm5JZDogdGhpcy5fdHVybklkLFxuXHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdGNvbnRlbnQ6ICcnLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGRpc3BsYXkuaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRfbWV0YTogdG9Ub29sQ2FsbE1ldGEoZGlzcGxheS5tZXRhKSxcblx0XHR9LCBzdHJlYW1pbmcucGFyZW50VG9vbENhbGxJZCk7XG5cdH1cblxuXHRwcml2YXRlIF9zY2hlZHVsZVN0cmVhbWluZ1Rvb2xDYWxsRGlzcGxheSh0b29sQ2FsbElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRsZXQgc2NoZWR1bGVyID0gdGhpcy5fc3RyZWFtaW5nVG9vbERpc3BsYXlTY2hlZHVsZXJzLmdldCh0b29sQ2FsbElkKTtcblx0XHRpZiAoIXNjaGVkdWxlcikge1xuXHRcdFx0c2NoZWR1bGVyID0gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzdHJlYW1pbmcgPSB0aGlzLl9zdHJlYW1pbmdUb29sQ2FsbHMuZ2V0KHRvb2xDYWxsSWQpO1xuXHRcdFx0XHRpZiAoIXN0cmVhbWluZz8uc3RhcnRlZCB8fCAhc3RyZWFtaW5nLnRvb2xOYW1lKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzdHJlYW1pbmcuZGlzcGxheWVkSW5wdXRMZW5ndGggPT09IHN0cmVhbWluZy5pbnB1dC5sZW5ndGgpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fZW1pdFN0cmVhbWluZ1Rvb2xDYWxsRGlzcGxheSh0b29sQ2FsbElkLCBzdHJlYW1pbmcpO1xuXHRcdFx0fSwgU1RSRUFNSU5HX1RPT0xfRElTUExBWV9JTlRFUlZBTF9NUyk7XG5cdFx0XHR0aGlzLl9zdHJlYW1pbmdUb29sRGlzcGxheVNjaGVkdWxlcnMuc2V0KHRvb2xDYWxsSWQsIHNjaGVkdWxlcik7XG5cdFx0fVxuXHRcdGlmICghc2NoZWR1bGVyLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdHNjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2JlZ2luVG9vbENhbGxSb3VuZChwYXJlbnRUb29sQ2FsbElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBzY29wZSA9IHBhcmVudFRvb2xDYWxsSWQgPz8gJyc7XG5cdFx0dGhpcy5fY3VycmVudFR1cm4/Lm1hcmtkb3duUGFydElkcy5kZWxldGUoc2NvcGUpO1xuXHRcdHRoaXMuX2N1cnJlbnRUdXJuPy5yZWFzb25pbmdQYXJ0SWRzLmRlbGV0ZShzY29wZSk7XG5cdH1cblxuXHQvKipcblx0ICogU3RhcnRzIGEgZnJlc2ggYHBlbmRpbmdgIHR1cm4sIGRpc2NhcmRpbmcgYW55IHBlci10dXJuIHN0cmVhbWluZyBzdGF0ZVxuXHQgKiBmcm9tIGEgcHJldmlvdXMgdHVybiBzbyB0aGUgbmV4dCB0ZXh0L3JlYXNvbmluZyBjaHVuayBhbGxvY2F0ZXMgYSBuZXdcblx0ICogcmVzcG9uc2UgcGFydC4gVGhlIHR1cm4gYmVjb21lcyBgcnVubmluZ2Agb24gdGhlIGZpcnN0IFNESyBldmVudC5cblx0ICovXG5cdHJlc2V0VHVyblN0YXRlKHR1cm5JZDogc3RyaW5nLCBzZW5kZXJDbGllbnRJZD86IHN0cmluZywgY2xpZW50VHlwZSA9IEFnZW50SG9zdENsaWVudFR5cGUuVW5rbm93biwgY2xpZW50Q29udGV4dCA9IGNyZWF0ZVVua25vd25BZ2VudEhvc3RDbGllbnRUZWxlbWV0cnlDb250ZXh0KGNsaWVudFR5cGUpKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RyZWFtaW5nVG9vbENhbGxzLmNsZWFyKCk7XG5cdFx0dGhpcy5fc3RyZWFtaW5nVG9vbERpc3BsYXlTY2hlZHVsZXJzLmNsZWFyQW5kRGlzcG9zZUFsbCgpO1xuXHRcdHRoaXMuX2N1cnJlbnRUdXJuID0gbmV3IENvcGlsb3RUdXJuKHR1cm5JZCwgdGhpcy5fbmV4dFR1cm5PcmRpbmFsKyssIHNlbmRlckNsaWVudElkLCBjbGllbnRDb250ZXh0KTtcblx0fVxuXG5cdC8qKiBSZWZyZXNoZXMgcHJvbXB0LWNhY2hlIHN0YXRlIGFuZCB0aGUgc2Vzc2lvbi13aWRlIG5hbm8tQUlVIHRvdGFsIGZyb20gdGhlIFNESydzIGF1dGhvcml0YXRpdmUgdXNhZ2UgbWV0cmljcy4gKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVmcmVzaFNlc3Npb25Vc2FnZU1ldHJpY3MoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9zZXNzaW9uVXNhZ2VNZXRyaWNzUmVmcmVzaFRocm90dGxlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHByb21wdENhY2hlUmVmcmVzaEdlbmVyYXRpb24gPSB0aGlzLl9wcm9tcHRDYWNoZVJlZnJlc2hHZW5lcmF0aW9uO1xuXHRcdFx0XHRjb25zdCBtZXRyaWNzID0gYXdhaXQgdGhpcy5fd3JhcHBlci5zZXNzaW9uLnJwYy51c2FnZS5nZXRNZXRyaWNzKCk7XG5cdFx0XHRcdGNvbnN0IG1vZGVsSWQgPSBtZXRyaWNzLmN1cnJlbnRNb2RlbDtcblx0XHRcdFx0aWYgKCF0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkICYmIG1vZGVsSWQgJiYgcHJvbXB0Q2FjaGVSZWZyZXNoR2VuZXJhdGlvbiA9PT0gdGhpcy5fcHJvbXB0Q2FjaGVSZWZyZXNoR2VuZXJhdGlvbikge1xuXHRcdFx0XHRcdGNvbnN0IGNhY2hlRXhwaXJlc0F0ID0gbWV0cmljcy5tb2RlbE1ldHJpY3NbbW9kZWxJZF0/LmNhY2hlRXhwaXJlc0F0O1xuXHRcdFx0XHRcdHRoaXMuX3NldFByb21wdENhY2hlU3RhdGUoY2FjaGVFeHBpcmVzQXQgPyB7IG1vZGVsSWQsIGNhY2hlRXhwaXJlc0F0IH0gOiB1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdG90YWwgPSBtZXRyaWNzLnRvdGFsTmFub0FpdTtcblx0XHRcdFx0aWYgKHR5cGVvZiB0b3RhbCAhPT0gJ251bWJlcicgfHwgIU51bWJlci5pc0Zpbml0ZSh0b3RhbCkgfHwgdG90YWwgPCAwIHx8IHRvdGFsID09PSB0aGlzLl9zZXNzaW9uVG90YWxOYW5vQWl1KSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3Nlc3Npb25Ub3RhbE5hbm9BaXUgPSB0b3RhbDtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIEFsc28gY292ZXJzIHRoZSByZWplY3Rpb24gZnJvbSBhIHRocm90dGxlciBkaXNwb3NlZCBtaWQtcmVhZC5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSB1c2FnZS5nZXRNZXRyaWNzIFJQQyBmYWlsZWQ6ICR7Z2V0RXJyb3JNZXNzYWdlKGVycil9YCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBwYXJlbnQtc2NvcGUgQ29waWxvdCBiaWxsaW5nIG1ldGFkYXRhIGZvciB0aGUgYWN0aXZlIHR1cm46IHRoZSB0dXJuJ3Ncblx0ICogb3duIGFjY3VtdWxhdGVkIGNvc3QgcGx1cyB0aGUgU0RLJ3Mgc2Vzc2lvbi13aWRlIHRvdGFsLiBBYnNlbnQgdW50aWxcblx0ICogc29tZXRoaW5nIGhhcyBhY3R1YWxseSBiZWVuIGJpbGxlZC5cblx0ICovXG5cdHByaXZhdGUgX3BhcmVudENvcGlsb3RVc2FnZU1ldGEoKTogVXNhZ2VJbmZvTWV0YVsnY29waWxvdFVzYWdlJ10gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHR1cm5OYW5vQWl1ID0gdGhpcy5fY3VycmVudFR1cm4/LmNvcGlsb3ROYW5vQWl1ID8/IDA7XG5cdFx0aWYgKCF0dXJuTmFub0FpdSAmJiAhdGhpcy5fc2Vzc2lvblRvdGFsTmFub0FpdSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLih0dXJuTmFub0FpdSA/IHsgdG90YWxOYW5vQWl1OiB0dXJuTmFub0FpdSB9IDoge30pLFxuXHRcdFx0Li4uKHRoaXMuX3Nlc3Npb25Ub3RhbE5hbm9BaXUgPyB7IHNlc3Npb25Ub3RhbE5hbm9BaXU6IHRoaXMuX3Nlc3Npb25Ub3RhbE5hbm9BaXUgfSA6IHt9KSxcblx0XHR9O1xuXHR9XG5cblx0LyoqIFJlYWRzIHRoZSBTREsncyBwZXItc291cmNlIGNvbnRleHQtd2luZG93IGF0dHJpYnV0aW9uLCBvciBgdW5kZWZpbmVkYCB3aGVuIHVuYXZhaWxhYmxlLiAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZWFkQ29udGV4dEF0dHJpYnV0aW9uKCk6IFByb21pc2U8SUNvbnRleHRBdHRyaWJ1dGlvbkRhdGEgfCB1bmRlZmluZWQ+IHtcblx0XHRsZXQgYXR0cmlidXRpb246IElDb250ZXh0QXR0cmlidXRpb25EYXRhIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhdHRyaWJ1dGlvbiA9IChhd2FpdCB0aGlzLl93cmFwcGVyLnNlc3Npb24ucnBjLm1ldGFkYXRhLmdldENvbnRleHRBdHRyaWJ1dGlvbigpKT8uY29udGV4dEF0dHJpYnV0aW9uID8/IHVuZGVmaW5lZDtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBjb250ZXh0QXR0cmlidXRpb24gUlBDIGZhaWxlZDogJHtnZXRFcnJvck1lc3NhZ2UoZXJyKX1gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghYXR0cmlidXRpb24pIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBjb250ZXh0QXR0cmlidXRpb246IG51bGwvZW1wdHlgKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9sb2dTZXJ2aWNlLmdldExldmVsKCkgPD0gTG9nTGV2ZWwuVHJhY2UpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBjb250ZXh0QXR0cmlidXRpb246IHRvdGFsVG9rZW5zPSR7YXR0cmlidXRpb24udG90YWxUb2tlbnN9LCBlbnRyaWVzPSR7SlNPTi5zdHJpbmdpZnkoYXR0cmlidXRpb24uZW50cmllcy5tYXAoZSA9PiAoeyBraW5kOiBlLmtpbmQsIGlkOiBlLmlkLCBsYWJlbDogZS5sYWJlbCwgdG9rZW5zOiBlLnRva2VucywgcGFyZW50SWQ6IGUucGFyZW50SWQgfSkpKX1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIGF0dHJpYnV0aW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBfY29tcGxldGVBY3RpdmVUdXJuKCk6IHZvaWQge1xuXHRcdGNvbnN0IHR1cm4gPSB0aGlzLl9jdXJyZW50VHVybjtcblx0XHRpZiAoIXR1cm4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHVybi5tYXJrQ29tcGxldGVkKCk7XG5cdFx0dGhpcy5fcmVwb3J0VG9vbENhbGxEZXRhaWxzKHR1cm4sICdzdWNjZXNzJyk7XG5cdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsXG5cdFx0XHR0dXJuSWQ6IHR1cm4uaWQsXG5cdFx0XHRkdXJhdGlvbjogdHVybi5kdXJhdGlvbixcblx0XHR9KTtcblx0XHR0aGlzLl9jbGVhckFjdGl2ZVR1cm4oKTtcblx0fVxuXG5cdGZhaWxBY3RpdmVUdXJuKGVycm9yOiBFcnJvckluZm8pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHR1cm4gPSB0aGlzLl9jdXJyZW50VHVybjtcblx0XHRpZiAoIXR1cm4pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuX3JlcG9ydFRvb2xDYWxsRGV0YWlscyh0dXJuLCAnZmFpbGVkJyk7XG5cdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRFcnJvcixcblx0XHRcdHR1cm5JZDogdHVybi5pZCxcblx0XHRcdGR1cmF0aW9uOiB0dXJuLmR1cmF0aW9uLFxuXHRcdFx0ZXJyb3IsXG5cdFx0fSk7XG5cdFx0dGhpcy5fY2xlYXJBY3RpdmVUdXJuKCk7XG5cdFx0cmV0dXJuIHR1cm4uaWQ7XG5cdH1cblxuXHRkaXNjYXJkQWN0aXZlVHVybigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY3VycmVudFR1cm4pIHtcblx0XHRcdHRoaXMuX2NsZWFyQWN0aXZlVHVybigpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBEcm9wcyB0aGUgYWN0aXZlIHR1cm4gYW5kIHJlcG9ydHMgdGhhdCB0aGlzIGNoYXQgaXMgbm93IGlkbGUuIEV2ZXJ5XG5cdCAqIHRyYW5zaXRpb24gb3V0IG9mIGFuIGluLWZsaWdodCB0dXJuIG11c3QgZ28gdGhyb3VnaCBoZXJlIHNvIHdvcmsgdGhlXG5cdCAqIGFnZW50IGRlZmVycyB3aGlsZSBhIHR1cm4gcnVucyBcdTIwMTQgbm90YWJseSBhIHBlbmRpbmcgQ0xJIGNsaWVudCByZXN0YXJ0IFx1MjAxNFxuXHQgKiBpcyBub3Qgc3RyYW5kZWQgd2FpdGluZyBvbiBhIHR1cm4gdGhhdCBhbHJlYWR5IGVuZGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfY2xlYXJBY3RpdmVUdXJuKCk6IHZvaWQge1xuXHRcdHRoaXMuX2N1cnJlbnRUdXJuID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3N0cmVhbWluZ1Rvb2xDYWxscy5jbGVhcigpO1xuXHRcdHRoaXMuX3N0cmVhbWluZ1Rvb2xEaXNwbGF5U2NoZWR1bGVycy5jbGVhckFuZERpc3Bvc2VBbGwoKTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fb25UdXJuRW5kZWQoKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIFRoZSB0dXJuIGlzIGFscmVhZHkgY2xlYXJlZCwgc28gdGhlIHNlc3Npb24ncyBvd24gc3RhdGUgaXNcblx0XHRcdC8vIGNvbnNpc3RlbnQuIENvbnRhaW4gdGhlIGZhaWx1cmUgdG8gdGhlIGFnZW50J3MgYm9va2tlZXBpbmcgcmF0aGVyXG5cdFx0XHQvLyB0aGFuIGxldHRpbmcgaXQgZXNjYXBlIGludG8gU0RLIGV2ZW50IGhhbmRsaW5nIFx1MjAxNCBvciwgb24gdGhlXG5cdFx0XHQvLyBgc2VuZCgpYCBmYWlsdXJlIHBhdGgsIHJlcGxhY2UgdGhlIGVycm9yIHdlIGFyZSBwcm9wYWdhdGluZy5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyLCBgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIG9uVHVybkVuZGVkIGNhbGxiYWNrIGZhaWxlZGApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlcG9ydFRvb2xDYWxsRGV0YWlscyh0dXJuOiBDb3BpbG90VHVybiwgcmVzcG9uc2VUeXBlOiAnc3VjY2VzcycgfCAnY2FuY2VsbGVkJyB8ICdmYWlsZWQnKTogdm9pZCB7XG5cdFx0aWYgKHR1cm4udG9vbENhbGxEZXRhaWxzUmVwb3J0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHVybi50b29sQ2FsbERldGFpbHNSZXBvcnRlZCA9IHRydWU7XG5cdFx0dm9pZCB0aGlzLl90ZWxlbWV0cnlSZXBvcnRlci50b29sQ2FsbERldGFpbHMoe1xuXHRcdFx0Y2xpZW50Q29udGV4dDogdHVybi5jbGllbnRDb250ZXh0LFxuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHRcdHNlc3Npb246IHRoaXMucmVzb3VyY2VVcmkudG9TdHJpbmcoKSxcblx0XHRcdHR1cm5JZDogdHVybi5pZCxcblx0XHRcdGNsaWVudFR5cGU6IHR1cm4uY2xpZW50VHlwZSxcblx0XHRcdG1vZGVsOiB0dXJuLmxhc3RNb2RlbCxcblx0XHRcdHJlc3BvbnNlVHlwZSxcblx0XHRcdHRvb2xDb3VudHM6IE9iamVjdC5mcm9tRW50cmllcyh0dXJuLnRvb2xDb3VudHMpLFxuXHRcdFx0YXZhaWxhYmxlVG9vbHM6IHRoaXMuX2FwcGxpZWRTbmFwc2hvdC50b29scy5tYXAodG9vbCA9PiB0b29sLm5hbWUpLFxuXHRcdFx0bnVtUmVxdWVzdHM6IHR1cm4udG9vbENhbGxSb3VuZHMsXG5cdFx0XHR0dXJuSW5kZXg6IHR1cm4ub3JkaW5hbCxcblx0XHRcdHR1cm5EdXJhdGlvbjogdHVybi5kdXJhdGlvbixcblx0XHRcdG1lc3NhZ2VDaGFyTGVuOiB0dXJuLm1lc3NhZ2VDaGFyTGVuLFxuXHRcdFx0dG90YWxUb29sQ2FsbHM6IHR1cm4udG90YWxUb29sQ2FsbHMsXG5cdFx0XHRwYXJhbGxlbFRvb2xDYWxsUm91bmRzOiB0dXJuLnBhcmFsbGVsVG9vbENhbGxSb3VuZHMsXG5cdFx0XHRwYXJhbGxlbFRvb2xDYWxsc1RvdGFsOiB0dXJuLnBhcmFsbGVsVG9vbENhbGxzVG90YWwsXG5cdFx0fSkuY2F0Y2goZXJyID0+IHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBUZWxlbWV0cnkgZW1pc3Npb24gZmFpbGVkOiAke2dldEVycm9yTWVzc2FnZShlcnIpfWApKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlcG9ydFRvb2xBcHByb3ZhbCh0b29sQ2FsbElkOiBzdHJpbmcsIHRvb2xOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQsIG1jcFNlcnZlck5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHJlY29yZCA9IHRoaXMuX3Rvb2xBcHByb3ZhbFJlY29yZHMuZ2V0KHRvb2xDYWxsSWQpO1xuXHRcdGlmICghdG9vbE5hbWUgfHwgaXNIaWRkZW5Ub29sKHRvb2xOYW1lKSB8fCByZWNvcmQ/LnJlcG9ydGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNvbmZpcm1LaW5kID0gbWFwUGVybWlzc2lvblJlc3VsdFRvQ29uZmlybUtpbmQocmVjb3JkPy5yZXN1bHRLaW5kLCByZWNvcmQ/LnJlc29sdmVkQnlIb29rID09PSB0cnVlKTtcblx0XHR0aGlzLl90ZWxlbWV0cnlSZXBvcnRlci50b29sQXBwcm92YWwoe1xuXHRcdFx0Y2xpZW50Q29udGV4dDogdGhpcy5fY3VycmVudFR1cm4/LmNsaWVudENvbnRleHQsXG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3QnLFxuXHRcdFx0c2Vzc2lvbjogdGhpcy5yZXNvdXJjZVVyaS50b1N0cmluZygpLFxuXHRcdFx0dHVybklkOiB0aGlzLl90dXJuSWQsXG5cdFx0XHR0b29sSWQ6IHRvb2xOYW1lLFxuXHRcdFx0dG9vbFNvdXJjZUtpbmQ6IHRoaXMuX3Rvb2xTb3VyY2VLaW5kRm9yKHRvb2xOYW1lLCBtY3BTZXJ2ZXJOYW1lKSxcblx0XHRcdGNvbmZpcm1LaW5kLFxuXHRcdFx0Y29uZmlybWF0aW9uTm90TmVlZGVkUmVhc29uOiBjb25maXJtS2luZCA9PT0gJ2NvbmZpcm1hdGlvbk5vdE5lZWRlZCcgJiYgcmVjb3JkPy5yZXNvbHZlZEJ5SG9vayA/ICdvdGhlcicgOiB1bmRlZmluZWQsXG5cdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRFeGVjdXRpb246IHJlY29yZD8ucmVxdWVzdFNhbmRib3hCeXBhc3MgPyB0cnVlIDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHRcdGlmIChyZWNvcmQpIHtcblx0XHRcdHJlY29yZC5yZXBvcnRlZCA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVwb3J0VG9vbEFwcHJvdmFsSWZOb1Blcm1pc3Npb24odG9vbENhbGxJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVjb3JkID0gdGhpcy5fdG9vbEFwcHJvdmFsUmVjb3Jkcy5nZXQodG9vbENhbGxJZCk7XG5cdFx0aWYgKHJlY29yZCAmJiAhcmVjb3JkLnBlcm1pc3Npb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRoaXMuX3JlcG9ydFRvb2xBcHByb3ZhbCh0b29sQ2FsbElkLCByZWNvcmQudG9vbE5hbWUsIHJlY29yZC5tY3BTZXJ2ZXJOYW1lKTtcblx0XHR9XG5cdH1cblx0cHJpdmF0ZSBfdG9vbFNvdXJjZUtpbmRGb3IodG9vbE5hbWU6IHN0cmluZywgbWNwU2VydmVyTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRpZiAobWNwU2VydmVyTmFtZSkge1xuXHRcdFx0cmV0dXJuICdtY3AnO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY2xpZW50VG9vbE5hbWVzLmhhcyh0aGlzLl9jbGllbnRUb29sTmFtZSh0b29sTmFtZSkpKSB7XG5cdFx0XHRyZXR1cm4gJ2NsaWVudCc7XG5cdFx0fVxuXHRcdHJldHVybiAnaW50ZXJuYWwnO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RWRpdEZpbGVQYXRocyhwYXJhbWV0ZXJzOiB1bmtub3duKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBnZXRFZGl0RmlsZVBhdGhzKHBhcmFtZXRlcnMpLm1hcChwYXRoID0+IHRoaXMuX3Jlc29sdmVFZGl0RmlsZVBhdGgocGF0aCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZUVkaXRGaWxlUGF0aChwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdGlmIChpc0Fic29sdXRlKHBhdGgpIHx8ICF0aGlzLl93b3JraW5nRGlyZWN0b3J5IHx8IHRoaXMuX3dvcmtpbmdEaXJlY3Rvcnkuc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdHJldHVybiBwYXRoO1xuXHRcdH1cblx0XHRyZXR1cm4gam9pbih0aGlzLl93b3JraW5nRGlyZWN0b3J5LmZzUGF0aCwgcGF0aCk7XG5cdH1cblxuXHQvKipcblx0ICogRW1pdHMgYSBzeW50aGV0aWMgbWFya2Rvd24gY29udGVudCBibG9jayBmb3IgdGhlIGFjdGl2ZSB0dXJuIGFuZFxuXHQgKiBtYWtlcyBpdCB0aGUgY3VycmVudCBtYXJrZG93biByZXNwb25zZSBwYXJ0IHNvIHRoYXQgc3Vic2VxdWVudCBTREtcblx0ICogZGVsdGFzIGFwcGVuZCB0byBpdC4gVXNlZCBieSB0aGUgYWdlbnQgdG8gc3VyZmFjZSBvbmUtc2hvdCBob3N0XG5cdCAqIG1lc3NhZ2VzIChlLmcuIHRoZSB3b3JrdHJlZS1jcmVhdGVkIGFubm91bmNlbWVudCkgYXQgdGhlIHRvcCBvZiB0aGVcblx0ICogZmlyc3QgcmVzcG9uc2UuXG5cdCAqL1xuXHRlbWl0SW5pdGlhbE1hcmtkb3duKGNvbnRlbnQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2VtaXRNYXJrZG93bkRlbHRhKGNvbnRlbnQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEVtaXRzIGEgc3RyZWFtaW5nIHRleHQgZGVsdGEuIFRoZSBmaXJzdCBkZWx0YSBvZiBhIHR1cm4gYWxsb2NhdGVzIGFcblx0ICogbWFya2Rvd24gcmVzcG9uc2UgcGFydDsgc3Vic2VxdWVudCBkZWx0YXMgYXBwZW5kIHRvIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSBfZW1pdE1hcmtkb3duRGVsdGEoY29udGVudDogc3RyaW5nLCBwYXJlbnRUb29sQ2FsbElkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdHVybiA9IHRoaXMuX2N1cnJlbnRUdXJuO1xuXHRcdGlmICghdHVybikge1xuXHRcdFx0Ly8gQSBtYXJrZG93biBkZWx0YSBzaG91bGQgb25seSBldmVyIGFycml2ZSB3aGlsZSBhIHR1cm4gaXMgYWN0aXZlLlxuXHRcdFx0Ly8gV2l0aG91dCBhIHR1cm4gd2UgY2FuJ3QgcGVyc2lzdCB0aGUgcGFydCBpZCAoc28gZXZlcnkgZGVsdGEgd291bGRcblx0XHRcdC8vIGFsbG9jYXRlIGEgZnJlc2ggcGFydCkgYW5kIHRoZSBhY3Rpb24gd291bGQgY2FycnkgYW4gZW1wdHkgdHVybklkLlxuXHRcdFx0Ly8gRHJvcCBpdCBhbmQgc3VyZmFjZSB0aGUgdW5leHBlY3RlZCBzdGF0ZS5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBNYXJrZG93biBkZWx0YSBlbWl0dGVkIHdpdGggbm8gYWN0aXZlIHR1cm47IGRyb3BwaW5nYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG1hcmtkb3duU2NvcGUgPSBwYXJlbnRUb29sQ2FsbElkID8/ICcnO1xuXHRcdGxldCBwYXJ0SWQgPSB0dXJuLm1hcmtkb3duUGFydElkcy5nZXQobWFya2Rvd25TY29wZSk7XG5cdFx0aWYgKCFwYXJ0SWQpIHtcblx0XHRcdHBhcnRJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdFx0dHVybi5tYXJrZG93blBhcnRJZHMuc2V0KG1hcmtkb3duU2NvcGUsIHBhcnRJZCk7XG5cdFx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0LFxuXHRcdFx0XHR0dXJuSWQ6IHR1cm4uaWQsXG5cdFx0XHRcdHBhcnQ6IHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6IHBhcnRJZCwgY29udGVudCB9LFxuXHRcdFx0fSwgcGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0RGVsdGEsXG5cdFx0XHR0dXJuSWQ6IHR1cm4uaWQsXG5cdFx0XHRwYXJ0SWQsXG5cdFx0XHRjb250ZW50LFxuXHRcdH0sIHBhcmVudFRvb2xDYWxsSWQpO1xuXHR9XG5cblx0LyoqIEVtaXRzIGEgcmVhc29uaW5nIGRlbHRhLCBzaW1pbGFyIHRvIHtAbGluayBfZW1pdE1hcmtkb3duRGVsdGF9IGJ1dCBmb3IgcmVhc29uaW5nIHBhcnRzLiAqL1xuXHRwcml2YXRlIF9lbWl0UmVhc29uaW5nRGVsdGEoY29udGVudDogc3RyaW5nLCBwYXJlbnRUb29sQ2FsbElkPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdHVybiA9IHRoaXMuX2N1cnJlbnRUdXJuO1xuXHRcdGlmICghdHVybikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIFJlYXNvbmluZyBkZWx0YSBlbWl0dGVkIHdpdGggbm8gYWN0aXZlIHR1cm47IGRyb3BwaW5nYCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlYXNvbmluZ1Njb3BlID0gcGFyZW50VG9vbENhbGxJZCA/PyAnJztcblx0XHRsZXQgcGFydElkID0gdHVybi5yZWFzb25pbmdQYXJ0SWRzLmdldChyZWFzb25pbmdTY29wZSk7XG5cdFx0aWYgKCFwYXJ0SWQpIHtcblx0XHRcdHBhcnRJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdFx0dHVybi5yZWFzb25pbmdQYXJ0SWRzLnNldChyZWFzb25pbmdTY29wZSwgcGFydElkKTtcblx0XHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQsXG5cdFx0XHRcdHR1cm5JZDogdHVybi5pZCxcblx0XHRcdFx0cGFydDogeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlJlYXNvbmluZywgaWQ6IHBhcnRJZCwgY29udGVudCB9LFxuXHRcdFx0fSwgcGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UmVhc29uaW5nLFxuXHRcdFx0dHVybklkOiB0dXJuLmlkLFxuXHRcdFx0cGFydElkLFxuXHRcdFx0Y29udGVudCxcblx0XHR9LCBwYXJlbnRUb29sQ2FsbElkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgc25hcHNob3Qgb2YgY2xpZW50IGNvbnRyaWJ1dGlvbnMgY2FwdHVyZWQgd2hlbiB0aGlzIHNlc3Npb24gd2FzXG5cdCAqIGNyZWF0ZWQuIFVzZWQgYnkgdGhlIGFnZW50IHRvIGRldGVjdCB3aGVuIHRoZSBzZXNzaW9uIGlzIDFzdGFsZS5cblx0ICovXG5cdGdldCBhcHBsaWVkU25hcHNob3QoKTogSUFjdGl2ZUNsaWVudFNuYXBzaG90IHtcblx0XHRyZXR1cm4gdGhpcy5fYXBwbGllZFNuYXBzaG90O1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlY29uZGFyeSByb290cyBncmFudGVkIHdoZW4gdGhpcyBsaXZlIFNESyBzZXNzaW9uIHdhcyBjcmVhdGVkIG9yIHJlc3VtZWQuXG5cdCAqIFRoZSBwcmltYXJ5IHByb2Nlc3Mgcm9vdCBpcyBpbW11dGFibGUgYW5kIHRoZXJlZm9yZSBleGNsdWRlZC5cblx0ICovXG5cdGdldCBhcHBsaWVkQWRkaXRpb25hbERpcmVjdG9yaWVzKCk6IHJlYWRvbmx5IFVSSVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fYXBwbGllZEFkZGl0aW9uYWxEaXJlY3Rvcmllcztcblx0fVxuXG5cdGdldCBjdXN0b21pemF0aW9uRGlyZWN0b3J5KCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1c3RvbWl6YXRpb25EaXJlY3Rvcnk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlcyBTREsge0BsaW5rIFRvb2x9IG9iamVjdHMgZm9yIHRoZSBjbGllbnQtcHJvdmlkZWQgdG9vbHMgaW4gdGhlXG5cdCAqIGFwcGxpZWQgc25hcHNob3QuIFRoZSBoYW5kbGVyIHBhcmtzIGEgcmVxdWVzdCBpblxuXHQgKiB7QGxpbmsgX3BlbmRpbmdDbGllbnRUb29sQ2FsbHN9IGFuZCB3YWl0cyBmb3IgdGhlIGNsaWVudCB0byBkaXNwYXRjaFxuXHQgKiBgc2Vzc2lvbi90b29sQ2FsbENvbXBsZXRlYC5cblx0ICovXG5cdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdHByaXZhdGUgX2NyZWF0ZUNsaWVudFNka1Rvb2xzKHRvb2xTZWFyY2hBY3RpdmU6IGJvb2xlYW4pOiBUb29sPGFueT5bXSB7XG5cdFx0dGhpcy5fdG9vbFNlYXJjaEFjdGl2ZSA9IHRvb2xTZWFyY2hBY3RpdmU7XG5cdFx0Y29uc3QgdG9vbHMgPSB0aGlzLl9hcHBsaWVkU25hcHNob3QudG9vbHM7XG5cdFx0aWYgKHRvb2xzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uVG9vbHMgPSB0b29sU2VhcmNoQWN0aXZlXG5cdFx0XHQ/IHRvb2xzXG5cdFx0XHQ6IHRvb2xzLmZpbHRlcihkZWYgPT4gZGVmLm5hbWUgIT09IENMSUVOVF9UT09MX1NFQVJDSF9SRUZFUkVOQ0VfTkFNRSk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRyZXR1cm4gc2Vzc2lvblRvb2xzLm1hcCgoZGVmKTogVG9vbDxhbnk+ID0+IHtcblx0XHRcdGlmICh0b29sU2VhcmNoQWN0aXZlICYmIGRlZi5uYW1lID09PSBDTElFTlRfVE9PTF9TRUFSQ0hfUkVGRVJFTkNFX05BTUUpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRuYW1lOiBSVU5USU1FX1RPT0xfU0VBUkNIX1RPT0xfTkFNRSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZGVmLmRlc2NyaXB0aW9uID8/ICcnLFxuXHRcdFx0XHRcdHBhcmFtZXRlcnM6IGRlZi5pbnB1dFNjaGVtYSA/PyB7IHR5cGU6ICdvYmplY3QnIGFzIGNvbnN0LCBwcm9wZXJ0aWVzOiB7fSB9LFxuXHRcdFx0XHRcdG92ZXJyaWRlc0J1aWx0SW5Ub29sOiB0cnVlLFxuXHRcdFx0XHRcdGRlZmVyOiAnbmV2ZXInLFxuXHRcdFx0XHRcdHNraXBQZXJtaXNzaW9uOiB0cnVlLFxuXHRcdFx0XHRcdGhhbmRsZXI6IHRoaXMuX2d1YXJkZWQoYXN5bmMgKF9hcmdzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgaW52b2NhdGlvbikgPT4ge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgY2FuZGlkYXRlcyA9IHRoaXMuX3RvVG9vbFNlYXJjaENhbmRpZGF0ZXMoaW52b2NhdGlvbi5hdmFpbGFibGVUb29scyk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNsaWVudFJlc3VsdCA9IGF3YWl0IHRoaXMuX3BlbmRpbmdDbGllbnRUb29sQ2FsbHMucmVnaXN0ZXJBbmRGaXJlKFxuXHRcdFx0XHRcdFx0XHRcdGludm9jYXRpb24udG9vbENhbGxJZCxcblx0XHRcdFx0XHRcdFx0XHQoKSA9PiB0aGlzLl9lbWl0VG9vbFNlYXJjaFJlYWR5KGludm9jYXRpb24udG9vbENhbGxJZCwgY2FuZGlkYXRlcyksXG5cdFx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLl90b1Rvb2xTZWFyY2hSZXN1bHQoY2xpZW50UmVzdWx0LCBpbnZvY2F0aW9uLmF2YWlsYWJsZVRvb2xzKTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyb3IsIGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gRmFpbGVkIGluIHRvb2wtc2VhcmNoIGhhbmRsZXI6IHRvb2xDYWxsSWQ9JHtpbnZvY2F0aW9uLnRvb2xDYWxsSWR9YCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLl90b29sU2VhcmNoRmFpbHVyZShnZXRFcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LCB0aGlzLl90b29sU2VhcmNoRmFpbHVyZSgnVG9vbCBjYWxsIGNhbmNlbGxlZDogc2Vzc2lvbiBpcyBhYm9ydGluZycpLCAndG9vbC1zZWFyY2gnKSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRlZmVyOiAnYXV0bycgfCAnbmV2ZXInIHwgdW5kZWZpbmVkID0gdG9vbFNlYXJjaEFjdGl2ZVxuXHRcdFx0XHQ/IChOT05fREVGRVJSRURfQ0xJRU5UX1RPT0xfTkFNRVMuaGFzKGRlZi5uYW1lKSA/ICduZXZlcicgOiAnYXV0bycpXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bmFtZTogZGVmLm5hbWUsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBkZWYuZGVzY3JpcHRpb24gPz8gJycsXG5cdFx0XHRcdHBhcmFtZXRlcnM6IGRlZi5pbnB1dFNjaGVtYSA/PyB7IHR5cGU6ICdvYmplY3QnIGFzIGNvbnN0LCBwcm9wZXJ0aWVzOiB7fSB9LFxuXHRcdFx0XHRkZWZlcixcblx0XHRcdFx0aGFuZGxlcjogdGhpcy5fZ3VhcmRlZChhc3luYyAoX2FyZ3M6IFJlY29yZDxzdHJpbmcsIHVua25vd24+LCB7IHRvb2xDYWxsSWQgfSkgPT4ge1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fcGVuZGluZ0NsaWVudFRvb2xDYWxscy5yZWdpc3Rlcih0b29sQ2FsbElkKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnJvciwgYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBGYWlsZWQgaW4gY2xpZW50IHRvb2wgaGFuZGxlcjogdG9vbD0ke2RlZi5uYW1lfSwgdG9vbENhbGxJZD0ke3Rvb2xDYWxsSWR9YCk7XG5cdFx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIHRoaXMuX3Rvb2xTZWFyY2hGYWlsdXJlKCdUb29sIGNhbGwgY2FuY2VsbGVkOiBzZXNzaW9uIGlzIGFib3J0aW5nJyksICdjbGllbnQtdG9vbCcpLFxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2lzVG9vbFNlYXJjaEFjdGl2ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdG9vbFNlYXJjaEFjdGl2ZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IF9hYm9ydFRva2VuKCk6IENhbmNlbGxhdGlvblRva2VuIHtcblx0XHRyZXR1cm4gdGhpcy5fYWJvcnRDdHMudmFsdWU/LnRva2VuID8/IENhbmNlbGxhdGlvblRva2VuLkNhbmNlbGxlZDtcblx0fVxuXG5cdHByaXZhdGUgX2JlZ2luQWJvcnQoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2Fib3J0VG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYWJvcnRDdHMudmFsdWU/LmNhbmNlbCgpO1xuXHRcdHRoaXMuX2NhbmNlbEFsbFBlbmRpbmdJbnRlcmFjdGlvbnMoKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc2V0QWJvcnRUb2tlbigpOiB2b2lkIHtcblx0XHR0aGlzLl9hYm9ydEN0cy52YWx1ZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEd1YXJkcyBTREsgY2FsbGJhY2tzIGFnYWluc3QgYWJvcnRzOiB0aGUgc3luY2hyb25vdXMgcHJlLWNoZWNrIGF2b2lkcyB0aGUgYHNob3J0Y3V0RXZlbnRgIG1hY3JvdGFzayBmb3IgYWxyZWFkeS1jYW5jZWxsZWQgdG9rZW5zLCB3aGlsZSB0aGUgcmFjZSByZWxlYXNlcyBjYWxsYmFja3MgdGhhdCBwYXJrIGFmdGVyIHRoZSBhYm9ydCBzd2VlcC5cblx0ICogVGhlIHBvc3QtcmFjZSBjaGVjayBjYXRjaGVzIGhhbmRsZXIgY29tcGxldGlvbnMgdGhhdCB3aW4gdGhlIGNhbmNlbGxhdGlvbiBtYWNyb3Rhc2sgYmVjYXVzZSBwcm9taXNlIGNvbnRpbnVhdGlvbnMgcnVuIGFzIG1pY3JvdGFza3MuXG5cdCAqL1xuXHRwcml2YXRlIF9ndWFyZGVkPEEgZXh0ZW5kcyB1bmtub3duW10sIFI+KGhhbmRsZXI6ICguLi5hcmdzOiBBKSA9PiBQcm9taXNlPFI+LCBjYW5jZWxsZWQ6IFIsIGxhYmVsOiBzdHJpbmcpOiAoLi4uYXJnczogQSkgPT4gUHJvbWlzZTxSPiB7XG5cdFx0cmV0dXJuIGFzeW5jICguLi5hcmdzKSA9PiB7XG5cdFx0XHRjb25zdCB0b2tlbiA9IHRoaXMuX2Fib3J0VG9rZW47XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gRGlzY2FyZGluZyAke2xhYmVsfSBjYWxsYmFjayByZWNlaXZlZCB3aGlsZSBhYm9ydGluZ2ApO1xuXHRcdFx0XHRyZXR1cm4gY2FuY2VsbGVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmFjZUNhbmNlbGxhdGlvbihoYW5kbGVyKC4uLmFyZ3MpLCB0b2tlbiwgY2FuY2VsbGVkKTtcblx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBEaXNjYXJkaW5nICR7bGFiZWx9IGNhbGxiYWNrIHJlc3VsdCBhZnRlciBhYm9ydGApO1xuXHRcdFx0XHRyZXR1cm4gY2FuY2VsbGVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xpZW50VG9vbE5hbWUodG9vbE5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2lzVG9vbFNlYXJjaEFjdGl2ZSgpXG5cdFx0XHQmJiB0b29sTmFtZSA9PT0gUlVOVElNRV9UT09MX1NFQVJDSF9UT09MX05BTUVcblx0XHRcdD8gQ0xJRU5UX1RPT0xfU0VBUkNIX1JFRkVSRU5DRV9OQU1FXG5cdFx0XHQ6IHRvb2xOYW1lO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9Ub29sU2VhcmNoQ2FuZGlkYXRlcyhhdmFpbGFibGVUb29sczogcmVhZG9ubHkgQ3VycmVudFRvb2xNZXRhZGF0YVtdIHwgdW5kZWZpbmVkKTogcmVhZG9ubHkgSVRvb2xTZWFyY2hDYW5kaWRhdGVbXSB7XG5cdFx0cmV0dXJuIChhdmFpbGFibGVUb29scyA/PyBbXSlcblx0XHRcdC5maWx0ZXIodG9vbCA9PiB0b29sLmRlZmVyTG9hZGluZylcblx0XHRcdC5tYXAodG9vbCA9PiAoe1xuXHRcdFx0XHRuYW1lOiB0b29sLm5hbWUsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB0b29sLmRlc2NyaXB0aW9uID8/ICcnLFxuXHRcdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW1pdFRvb2xTZWFyY2hSZWFkeSh0b29sQ2FsbElkOiBzdHJpbmcsIGNhbmRpZGF0ZXM6IHJlYWRvbmx5IElUb29sU2VhcmNoQ2FuZGlkYXRlW10pOiB2b2lkIHtcblx0XHRjb25zdCB0cmFja2VkID0gdGhpcy5fYWN0aXZlVG9vbENhbGxzLmdldCh0b29sQ2FsbElkKTtcblx0XHRpZiAoIXRyYWNrZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVG9vbC1zZWFyY2ggY2FsbCAnJHt0b29sQ2FsbElkfScgd2FzIG5vdCB0cmFja2VkLmApO1xuXHRcdH1cblx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHR0dXJuSWQ6IHRoaXMuX3R1cm5JZCxcblx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHQuLi4odHJhY2tlZC5jb250cmlidXRvciA/IHsgY29udHJpYnV0b3I6IHRyYWNrZWQuY29udHJpYnV0b3IgfSA6IHt9KSxcblx0XHRcdC4uLih0cmFja2VkLmludGVudGlvbiAhPT0gdW5kZWZpbmVkID8geyBpbnRlbnRpb246IHRyYWNrZWQuaW50ZW50aW9uIH0gOiB7fSksXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogZ2V0SW52b2NhdGlvbk1lc3NhZ2UodHJhY2tlZC50b29sTmFtZSwgdHJhY2tlZC5kaXNwbGF5TmFtZSwgdHJhY2tlZC5wYXJhbWV0ZXJzLCBwYXRoID0+IHRoaXMuX3Jlc29sdmVFZGl0RmlsZVBhdGgocGF0aCkpLFxuXHRcdFx0dG9vbElucHV0OiBnZXRUb29sSW5wdXRTdHJpbmcodHJhY2tlZC50b29sTmFtZSwgdHJhY2tlZC5wYXJhbWV0ZXJzLCB0cmFja2VkLnBhcmFtZXRlcnMgPyB0cnlTdHJpbmdpZnkodHJhY2tlZC5wYXJhbWV0ZXJzKSA6IHVuZGVmaW5lZCksXG5cdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdF9tZXRhOiB0b1Rvb2xDYWxsTWV0YSh7IC4uLih0cmFja2VkLm1ldGEgPz8ge30pLCB0b29sU2VhcmNoQ2FuZGlkYXRlczogY2FuZGlkYXRlcyB9KSxcblx0XHR9LCB0cmFja2VkLnBhcmVudFRvb2xDYWxsSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9vbFNlYXJjaEZhaWx1cmUobWVzc2FnZTogc3RyaW5nKTogVG9vbFJlc3VsdE9iamVjdCB7XG5cdFx0cmV0dXJuIHsgdGV4dFJlc3VsdEZvckxsbTogbWVzc2FnZSwgcmVzdWx0VHlwZTogJ2ZhaWx1cmUnLCBlcnJvcjogbWVzc2FnZSwgdG9vbFJlZmVyZW5jZXM6IFtdIH07XG5cdH1cblxuXHRwcml2YXRlIF90b1Rvb2xTZWFyY2hSZXN1bHQoY2xpZW50UmVzdWx0OiBUb29sUmVzdWx0T2JqZWN0LCBhdmFpbGFibGVUb29sczogcmVhZG9ubHkgQ3VycmVudFRvb2xNZXRhZGF0YVtdIHwgdW5kZWZpbmVkKTogVG9vbFJlc3VsdE9iamVjdCB7XG5cdFx0Y29uc3QgZGVmZXJyZWQgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgdG9vbCBvZiBhdmFpbGFibGVUb29scyA/PyBbXSkge1xuXHRcdFx0aWYgKHRvb2wuZGVmZXJMb2FkaW5nKSB7XG5cdFx0XHRcdGRlZmVycmVkLnNldCh0b29sLm5hbWUsIHRvb2wubmFtZSk7XG5cdFx0XHRcdGlmICh0b29sLm5hbWVzcGFjZWROYW1lKSB7XG5cdFx0XHRcdFx0ZGVmZXJyZWQuc2V0KHRvb2wubmFtZXNwYWNlZE5hbWUsIHRvb2wubmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgcGFyc2VkQ2xpZW50TmFtZXMgPSB0aGlzLl9wYXJzZVRvb2xTZWFyY2hOYW1lcyhjbGllbnRSZXN1bHQudGV4dFJlc3VsdEZvckxsbSk7XG5cdFx0Y29uc3QgY2xpZW50TmFtZXMgPSBwYXJzZWRDbGllbnROYW1lcyA/PyBbXTtcblx0XHRjb25zdCB0b29sUmVmZXJlbmNlcyA9IFsuLi5uZXcgU2V0KGNsaWVudE5hbWVzLm1hcChuYW1lID0+IGRlZmVycmVkLmdldChuYW1lKSkuZmlsdGVyKGlzRGVmaW5lZCkpXTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSB0b29sX3NlYXJjaCBvdmVycmlkZTogYXZhaWxhYmxlVG9vbHM9JHthdmFpbGFibGVUb29scz8ubGVuZ3RoID8/IDB9LCBkZWZlcnJlZD0ke2RlZmVycmVkLnNpemV9LCBjbGllbnRNYXRjaGVkPVske2NsaWVudE5hbWVzLmpvaW4oJywgJyl9XSAtPiB0b29sUmVmZXJlbmNlcz1bJHt0b29sUmVmZXJlbmNlcy5qb2luKCcsICcpfV1gKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uY2xpZW50UmVzdWx0LFxuXHRcdFx0Li4uKGNsaWVudFJlc3VsdC5yZXN1bHRUeXBlID09PSAnc3VjY2VzcycgJiYgcGFyc2VkQ2xpZW50TmFtZXMgIT09IHVuZGVmaW5lZCA/IHsgdGV4dFJlc3VsdEZvckxsbTogSlNPTi5zdHJpbmdpZnkodG9vbFJlZmVyZW5jZXMpIH0gOiB7fSksXG5cdFx0XHR0b29sUmVmZXJlbmNlcyxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfcGFyc2VUb29sU2VhcmNoTmFtZXModGV4dDogc3RyaW5nKTogc3RyaW5nW10gfCB1bmRlZmluZWQge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKHRleHQpO1xuXHRcdFx0cmV0dXJuIEFycmF5LmlzQXJyYXkocGFyc2VkKSA/IHBhcnNlZC5maWx0ZXIoKG5hbWUpOiBuYW1lIGlzIHN0cmluZyA9PiB0eXBlb2YgbmFtZSA9PT0gJ3N0cmluZycpIDogdW5kZWZpbmVkO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGRzIFNESyB0b29sIGhhbmRsZXJzIGZvciB0aGUgYWdlbnQgaG9zdCdzIHNlcnZlciB0b29scy4gRWFjaCBoYW5kbGVyXG5cdCAqIGV4ZWN1dGVzIHRoZSB0b29sIGFnYWluc3QgdGhpcyBzZXNzaW9uJ3Mgc3RhdGUgdmlhIHRoZVxuXHQgKiB7QGxpbmsgSUFnZW50U2VydmVyVG9vbEhvc3R9IGFuZCByZXR1cm5zIGl0cyB0ZXh0dWFsIHJlc3VsdC4gUmV0dXJucyBhblxuXHQgKiBlbXB0eSBsaXN0IHdoZW4gbm8gc2VydmVyLXRvb2wgaG9zdCBpcyB3aXJlZCAoZS5nLiB0ZXN0IC8gc3RhbmRhbG9uZVxuXHQgKiBjb25zdHJ1Y3Rpb24pLlxuXHQgKi9cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0cHJpdmF0ZSBfY3JlYXRlU2VydmVyU2RrVG9vbHMoKTogVG9vbDxhbnk+W10ge1xuXHRcdGNvbnN0IGhvc3QgPSB0aGlzLl9zZXJ2ZXJUb29sSG9zdDtcblx0XHRpZiAoIWhvc3QpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIGhvc3QuZGVmaW5pdGlvbnMubWFwKGRlZiA9PiAoe1xuXHRcdFx0bmFtZTogZGVmLm5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogZGVmLmRlc2NyaXB0aW9uID8/ICcnLFxuXHRcdFx0cGFyYW1ldGVyczogZGVmLmlucHV0U2NoZW1hID8/IHsgdHlwZTogJ29iamVjdCcgYXMgY29uc3QsIHByb3BlcnRpZXM6IHt9IH0sXG5cdFx0XHRkZWZlcjogJ25ldmVyJyBhcyBjb25zdCxcblx0XHRcdGhhbmRsZXI6IGFzeW5jIChhcmdzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IFByb21pc2U8VG9vbFJlc3VsdE9iamVjdD4gPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHRleHQgPSBob3N0LmV4ZWN1dGVUb29sKHRoaXMuX2NoYXRDaGFubmVsVXJpLnRvU3RyaW5nKCksIGRlZi5uYW1lLCBhcmdzKTtcblx0XHRcdFx0XHRyZXR1cm4geyB0ZXh0UmVzdWx0Rm9yTGxtOiBhd2FpdCB0ZXh0LCByZXN1bHRUeXBlOiAnc3VjY2VzcycgfTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyb3IsIGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gRmFpbGVkIGluIHNlcnZlciB0b29sIGhhbmRsZXI6IHRvb2w9JHtkZWYubmFtZX1gKTtcblx0XHRcdFx0XHRyZXR1cm4geyB0ZXh0UmVzdWx0Rm9yTGxtOiBtZXNzYWdlLCByZXN1bHRUeXBlOiAnZmFpbHVyZScsIGVycm9yOiBtZXNzYWdlIH07XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0fSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIGEgcGVuZGluZyBjbGllbnQgdG9vbCBjYWxsLiBJZiB0aGUgU0RLIGhhbmRsZXIgaGFzIG5vdCB5ZXRcblx0ICogcmVnaXN0ZXJlZCBmb3IgYHRvb2xDYWxsSWRgLCB0aGUgcmVzdWx0IGlzIGJ1ZmZlcmVkIHNvIHRoZSBoYW5kbGVyXG5cdCAqIHJlc29sdmVzIGltbWVkaWF0ZWx5IG9uY2UgaXQgZG9lcy5cblx0ICovXG5cdGhhbmRsZUNsaWVudFRvb2xDYWxsQ29tcGxldGUodG9vbENhbGxJZDogc3RyaW5nLCByZXN1bHQ6IFRvb2xDYWxsUmVzdWx0KSB7XG5cdFx0dGhpcy5fYXBwcm92ZWREdXBsaWNhYmxlUGVybWlzc2lvblNpZ25hdHVyZXMuZGVsZXRlKHRvb2xDYWxsSWQpO1xuXHRcdGlmICghcmVzdWx0LnN1Y2Nlc3MgJiYgdGhpcy5fY2FuY2VsTWNwQXV0aGVudGljYXRpb25Gb3JUb29sQ2FsbCh0b29sQ2FsbElkKSkge1xuXHRcdFx0dGhpcy5fYWN0aXZlVG9vbENhbGxzLmRlbGV0ZSh0b29sQ2FsbElkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGV4dENvbnRlbnQgPSByZXN1bHQuY29udGVudFxuXHRcdFx0Py5maWx0ZXIoYyA9PiBjLnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0KVxuXHRcdFx0Lm1hcChjID0+IGMudGV4dClcblx0XHRcdC5qb2luKCdcXG4nKSA/PyAnJztcblxuXHRcdGNvbnN0IGJpbmFyeVJlc3VsdHMgPSByZXN1bHQuY29udGVudFxuXHRcdFx0Py5maWx0ZXIoYyA9PiBjLnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5FbWJlZGRlZFJlc291cmNlKVxuXHRcdFx0Lm1hcChjID0+ICh7IGRhdGE6IGMuZGF0YSwgbWltZVR5cGU6IGMuY29udGVudFR5cGUsIHR5cGU6ICgvXmltYWdlKFxcL3wkKS8udGVzdChjLmNvbnRlbnRUeXBlKSA/ICdpbWFnZScgOiAncmVzb3VyY2UnKSBhcyAnaW1hZ2UnIHwgJ3Jlc291cmNlJyB9KSk7XG5cdFx0Y29uc3QgdGV4dFJlc3VsdEZvckxsbSA9IHRleHRDb250ZW50LnRyaW0oKSA/IHRleHRDb250ZW50IDogZ2V0RW1wdHlUb29sUmVzdWx0VGV4dChiaW5hcnlSZXN1bHRzKTtcblxuXHRcdGlmIChyZXN1bHQuc3VjY2Vzcykge1xuXHRcdFx0dGhpcy5fcGVuZGluZ0NsaWVudFRvb2xDYWxscy5yZXNwb25kT3JCdWZmZXIodG9vbENhbGxJZCwge1xuXHRcdFx0XHR0ZXh0UmVzdWx0Rm9yTGxtLFxuXHRcdFx0XHRyZXN1bHRUeXBlOiAnc3VjY2VzcycsXG5cdFx0XHRcdGJpbmFyeVJlc3VsdHNGb3JMbG06IGJpbmFyeVJlc3VsdHM/Lmxlbmd0aCA/IGJpbmFyeVJlc3VsdHMgOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcGVuZGluZ0NsaWVudFRvb2xDYWxscy5yZXNwb25kT3JCdWZmZXIodG9vbENhbGxJZCwge1xuXHRcdFx0XHR0ZXh0UmVzdWx0Rm9yTGxtOiB0ZXh0Q29udGVudC50cmltKCkgPyB0ZXh0Q29udGVudCA6IHJlc3VsdC5lcnJvcj8ubWVzc2FnZSB8fCAnVG9vbCBjYWxsIGZhaWxlZCcsXG5cdFx0XHRcdHJlc3VsdFR5cGU6ICdmYWlsdXJlJyxcblx0XHRcdFx0ZXJyb3I6IHJlc3VsdC5lcnJvcj8ubWVzc2FnZSxcblx0XHRcdFx0YmluYXJ5UmVzdWx0c0ZvckxsbTogYmluYXJ5UmVzdWx0cz8ubGVuZ3RoID8gYmluYXJ5UmVzdWx0cyA6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIFN0aWxsIHBlbmRpbmcgcGVybWlzc2lvbiwgc28gdGhpcyBjYWxsIG1heSBoYXZlIGVycm9yZWQgd2hpbGUgZ2V0dGluZyBwZXJtaXNzaW9uLlxuXHRcdC8vIEdvIGFoZWFkIGFuZCBhbGxvdyB0aGUgY2FsbCB3aGljaCB3aWxsIGltbWVkaWF0ZWx5IHNlZSB0aGUgYnVmZmVyZWQgdmFsdWUuXG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdQZXJtaXNzaW9ucy5nZXRNZXRhZGF0YSh0b29sQ2FsbElkKT8ubWFuYWdlZEFwcHJvdmFsUmVxdWlyZWQgIT09IHRydWUpIHtcblx0XHRcdHRoaXMucmVzcG9uZFRvUGVybWlzc2lvblJlcXVlc3QodG9vbENhbGxJZCwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2FuY2VsTWNwQXV0aGVudGljYXRpb25Gb3JUb29sQ2FsbCh0b29sQ2FsbElkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRmb3IgKGNvbnN0IFtyZXF1ZXN0SWQsIHBlbmRpbmddIG9mIHRoaXMuX3BlbmRpbmdNY3BBdXRoUmVxdWVzdHMuZW50cmllcygpKSB7XG5cdFx0XHRjb25zdCB0b29sQ2FsbEluZGV4ID0gcGVuZGluZy50b29sQ2FsbHMuZmluZEluZGV4KHRvb2xDYWxsID0+IHRvb2xDYWxsLnRvb2xDYWxsSWQgPT09IHRvb2xDYWxsSWQpO1xuXHRcdFx0aWYgKHRvb2xDYWxsSW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0cGVuZGluZy50b29sQ2FsbHMuc3BsaWNlKHRvb2xDYWxsSW5kZXgsIDEpO1xuXHRcdFx0aWYgKHBlbmRpbmcudG9vbENhbGxzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nTWNwQXV0aFJlcXVlc3RzLnJlc3BvbmQocmVxdWVzdElkLCB7IGtpbmQ6ICdjYW5jZWxsZWQnIH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIChvciByZXN1bWVzKSB0aGUgU0RLIHNlc3Npb24gdmlhIHRoZSBpbmplY3RlZCBsYXVuY2hlciBhbmRcblx0ICogd2lyZXMgdXAgYWxsIGV2ZW50IGxpc3RlbmVycy4gTXVzdCBiZSBjYWxsZWQgZXhhY3RseSBvbmNlIGFmdGVyXG5cdCAqIGNvbnN0cnVjdGlvbiBiZWZvcmUgdXNpbmcgdGhlIHNlc3Npb24uXG5cdCAqL1xuXHRhc3luYyBpbml0aWFsaXplU2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9jdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UuaW5pdGlhbGl6ZVNlc3Npb24odGhpcy5fb3duZXJTZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IHdyYXBwZXIgPSBhd2FpdCB0aGlzLl9zZXNzaW9uTGF1bmNoZXIubGF1bmNoKHRoaXMuX2xhdW5jaFBsYW4sIHRoaXMuX2NyZWF0ZVJ1bnRpbWVBZGFwdGVyKCkpO1xuXHRcdC8vIFRoZSBzZXNzaW9uIG1heSBoYXZlIGJlZW4gZGlzcG9zZWQgd2hpbGUgd2Ugd2VyZSBhd2FpdGluZyB0aGVcblx0XHQvLyBsYXVuY2hlci4gSWYgc28sIGRpc3Bvc2UgdGhlIGZyZXNobHktY3JlYXRlZCB3cmFwcGVyIGFuZFxuXHRcdC8vIHNraXAgc3Vic2NyaWJpbmcgXHUyMDE0IHJlZ2lzdGVyaW5nIG9uIGEgZGlzcG9zZWQgc3RvcmUgd291bGQgbGVhay5cblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0d3JhcHBlci5kaXNwb3NlKCk7XG5cdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHR9XG5cdFx0dGhpcy5fd3JhcHBlciA9IHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2N1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZS5vbkRpZENoYW5nZShldmVudCA9PiB7XG5cdFx0XHRpZiAoIWV2ZW50LnNlc3Npb25zLmluY2x1ZGVzKHRoaXMuX293bmVyU2Vzc2lvblVyaS50b1N0cmluZygpKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9yZWNvbmNpbGVNY3BTZXJ2ZXJFbmFibGVtZW50KCkuY2F0Y2goZXJyb3IgPT4gdGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnJvciwgYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBGYWlsZWQgdG8gcmVjb25jaWxlIE1DUCBlbmFibGVtZW50IGFmdGVyIGN1c3RvbWl6YXRpb25zIGNoYW5nZWRgKSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3N1YnNjcmliZVRvRXZlbnRzKCk7XG5cdFx0dGhpcy5fc3Vic2NyaWJlRm9yTG9nZ2luZygpO1xuXHRcdHRoaXMuX3N1YnNjcmliZUZvck1lbW9JbnZhbGlkYXRpb24oKTtcblx0XHR0aGlzLl9zdWJzY3JpYmVGb3JJbnN0cnVjdGlvbnNDb2xsZWN0ZWRUZWxlbWV0cnkoKTtcblx0XHR0aGlzLl9zdWJzY3JpYmVUb1Blcm1pc3Npb25Db25maWdDaGFuZ2VzKCk7XG5cdFx0dGhpcy5fcHJvbXB0Q2FjaGVTdGF0ZSA9IHRoaXMuX3Byb21wdENhY2hlLnJlYWQodGhpcy5yZXNvdXJjZVVyaSk7XG5cdFx0aWYgKHRoaXMuX2xhdW5jaFBsYW4ua2luZCA9PT0gJ3Jlc3VtZScpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3JlZnJlc2hTZXNzaW9uVXNhZ2VNZXRyaWNzKCk7XG5cdFx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBZHZlcnRpc2UgdGhlIGFnZW50IGhvc3QncyBzZXJ2ZXIgdG9vbHMgZm9yIHRoaXMgc2Vzc2lvbiBzbyBjbGllbnRzXG5cdFx0Ly8gc2VlIHRoZW0gYXMgc2VydmVyLXByb3ZpZGVkLiBFeGVjdXRpb24gaGFwcGVucyBpbi1wcm9jZXNzIHZpYSB0aGUgU0RLXG5cdFx0Ly8gdG9vbCBoYW5kbGVycyBidWlsdCBpbiBgX2NyZWF0ZVNlcnZlclNka1Rvb2xzYC5cblx0XHR0aGlzLl9zZXJ2ZXJUb29sSG9zdD8uYWR2ZXJ0aXNlKHRoaXMuX3N0b3JhZ2VVcmkudG9TdHJpbmcoKSk7XG5cdH1cblxuXHQvKiogVXBkYXRlcyB0aGUgR2l0SHViIGNyZWRlbnRpYWxzIHVzZWQgYnkgdGhpcyBsaXZlIFNESyBzZXNzaW9uLiAqL1xuXHRhc3luYyB1cGRhdGVHaXRIdWJDcmVkZW50aWFscyhob3N0OiBzdHJpbmcsIHRva2VuOiBzdHJpbmcpOiBQcm9taXNlPEdpdEh1YkNyZWRlbnRpYWxzVXBkYXRlUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dyYXBwZXIuc2Vzc2lvbi5ycGMuZ2l0SHViQXV0aC5zZXRDcmVkZW50aWFscyh7XG5cdFx0XHRjcmVkZW50aWFsczogeyB0eXBlOiAndG9rZW4nLCBob3N0LCB0b2tlbiB9LFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0UHJvbXB0Q2FjaGVTdGF0ZShwcm9tcHRDYWNoZTogSVNlc3Npb25Qcm9tcHRDYWNoZVN0YXRlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Ly8gYHJlc291cmNlVXJpYCBjYW4gYmUgc2hhcmVkLCBzbyBwZXJzaXN0IGFuZCByZS1yZWFkIHRocm91Z2ggdGhlIHNoYXJlZCBwcm9tcHQtY2FjaGUgc2VhbS5cblx0XHR0aGlzLl9wcm9tcHRDYWNoZVN0YXRlID0gdGhpcy5fcHJvbXB0Q2FjaGUud3JpdGUodGhpcy5yZXNvdXJjZVVyaSwgcHJvbXB0Q2FjaGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlUnVudGltZUFkYXB0ZXIoKTogSUNvcGlsb3RTZXNzaW9uUnVudGltZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGhhbmRsZVBlcm1pc3Npb25SZXF1ZXN0OiB0aGlzLl9ndWFyZGVkKHJlcXVlc3QgPT4gdGhpcy5faGFuZGxlUGVybWlzc2lvblJlcXVlc3QocmVxdWVzdCksIHsga2luZDogJ3JlamVjdCcgfSBzYXRpc2ZpZXMgUGVybWlzc2lvblJlcXVlc3RSZXN1bHQsICdwZXJtaXNzaW9uJyksXG5cdFx0XHRoYW5kbGVFeGl0UGxhbk1vZGVSZXF1ZXN0OiB0aGlzLl9ndWFyZGVkKChyZXF1ZXN0LCBpbnZvY2F0aW9uKSA9PiB0aGlzLl9oYW5kbGVFeGl0UGxhbk1vZGVSZXF1ZXN0KHJlcXVlc3QsIGludm9jYXRpb24pLCB7IGFwcHJvdmVkOiBmYWxzZSB9IHNhdGlzZmllcyBDb3BpbG90RXhpdFBsYW5Nb2RlUmVzcG9uc2UsICdleGl0LXBsYW4tbW9kZScpLFxuXHRcdFx0aGFuZGxlVXNlcklucHV0UmVxdWVzdDogdGhpcy5fZ3VhcmRlZCgocmVxdWVzdCwgaW52b2NhdGlvbikgPT4gdGhpcy5faGFuZGxlVXNlcklucHV0UmVxdWVzdChyZXF1ZXN0LCBpbnZvY2F0aW9uKSwgeyBhbnN3ZXI6ICcnLCB3YXNGcmVlZm9ybTogdHJ1ZSB9IHNhdGlzZmllcyBVc2VySW5wdXRSZXNwb25zZSwgJ3VzZXItaW5wdXQnKSxcblx0XHRcdGhhbmRsZUVsaWNpdGF0aW9uUmVxdWVzdDogdGhpcy5fZ3VhcmRlZChjb250ZXh0ID0+IHRoaXMuX2hhbmRsZUVsaWNpdGF0aW9uUmVxdWVzdChjb250ZXh0KSwgeyBhY3Rpb246ICdjYW5jZWwnIH0gc2F0aXNmaWVzIEVsaWNpdGF0aW9uUmVzdWx0LCAnZWxpY2l0YXRpb24nKSxcblx0XHRcdGhhbmRsZU1jcEF1dGhSZXF1ZXN0OiB0aGlzLl9ndWFyZGVkKHJlcXVlc3QgPT4gdGhpcy5faGFuZGxlTWNwQXV0aFJlcXVlc3QocmVxdWVzdCksIHsga2luZDogJ2NhbmNlbGxlZCcgfSBzYXRpc2ZpZXMgTWNwQXV0aFJlc3VsdCwgJ21jcC1hdXRoJyksXG5cdFx0XHRyZXF1ZXN0VW5zYW5kYm94ZWRDb21tYW5kQ29uZmlybWF0aW9uOiB0aGlzLl9ndWFyZGVkKHJlcXVlc3QgPT4gdGhpcy5fcmVxdWVzdFVuc2FuZGJveGVkQ29tbWFuZENvbmZpcm1hdGlvbihyZXF1ZXN0KSwgZmFsc2UsICd1bnNhbmRib3hlZC1jb21tYW5kLWNvbmZpcm1hdGlvbicpLFxuXHRcdFx0Y3JlYXRlQ2xpZW50U2RrVG9vbHM6IHRvb2xTZWFyY2hBY3RpdmUgPT4gdGhpcy5fY3JlYXRlQ2xpZW50U2RrVG9vbHModG9vbFNlYXJjaEFjdGl2ZSksXG5cdFx0XHRjcmVhdGVTZXJ2ZXJTZGtUb29sczogKCkgPT4gdGhpcy5fY3JlYXRlU2VydmVyU2RrVG9vbHMoKSxcblx0XHRcdGhhbmRsZVByZVRvb2xVc2U6IGlucHV0ID0+IHRoaXMuX2hhbmRsZVByZVRvb2xVc2UoaW5wdXQpLFxuXHRcdFx0aGFuZGxlUG9zdFRvb2xVc2U6IGlucHV0ID0+IHRoaXMuX2hhbmRsZVBvc3RUb29sVXNlKGlucHV0KSxcblx0XHRcdGhhbmRsZVVzZXJQcm9tcHRTdWJtaXR0ZWQ6ICgpID0+IHRoaXMuaGFuZGxlVXNlclByb21wdFN1Ym1pdHRlZCgpLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyByZXNvbHZlTWNwQXV0aGVudGljYXRpb24ocGFyYW1zOiBBdXRoZW50aWNhdGVQYXJhbXMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRsZXQgcmVzb2x2ZWQgPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IFtyZXF1ZXN0SWQsIHBlbmRpbmddIG9mIHRoaXMuX3BlbmRpbmdNY3BBdXRoUmVxdWVzdHMuZW50cmllcygpKSB7XG5cdFx0XHRpZiAocGVuZGluZy5yZXNvdXJjZS5yZXNvdXJjZSAhPT0gcGFyYW1zLnJlc291cmNlIHx8ICF0aGlzLl9zY29wZXNTYXRpc2Z5KHBhcmFtcy5zY29wZXMsIHBlbmRpbmcucmVxdWlyZWRTY29wZXMpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCB0b29sQ2FsbCBvZiBwZW5kaW5nLnRvb2xDYWxscykge1xuXHRcdFx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbEF1dGhSZXNvbHZlZCxcblx0XHRcdFx0XHR0dXJuSWQ6IHRvb2xDYWxsLnR1cm5JZCxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiB0b29sQ2FsbC50b29sQ2FsbElkLFxuXHRcdFx0XHR9LCB0b29sQ2FsbC5wYXJlbnRUb29sQ2FsbElkKTtcblx0XHRcdH1cblx0XHRcdHJlc29sdmVkID0gdGhpcy5fcGVuZGluZ01jcEF1dGhSZXF1ZXN0cy5yZXNwb25kKHJlcXVlc3RJZCwgeyBraW5kOiAndG9rZW4nLCBhY2Nlc3NUb2tlbjogcGFyYW1zLnRva2VuIH0pIHx8IHJlc29sdmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzb2x2ZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVNY3BBdXRoUmVxdWVzdChyZXF1ZXN0OiBNY3BBdXRoUmVxdWVzdCk6IFByb21pc2U8TWNwQXV0aFJlc3VsdCB8IG51bGwgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjdXN0b21pemF0aW9uSWQgPSB0aGlzLl9tY3BDdXN0b21pemF0aW9ucy5jdXN0b21pemF0aW9uSWRGb3JTZXJ2ZXIocmVxdWVzdC5zZXJ2ZXJOYW1lKTtcblx0XHRjb25zdCBlbmFibGVtZW50ID0gZ2V0U2RrTWNwU2VydmVyRW5hYmxlbWVudChyZXNvbHZlQ3VzdG9taXphdGlvbkVuYWJsZW1lbnQoXG5cdFx0XHR0aGlzLl9jdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0XHR0aGlzLl9vd25lclNlc3Npb25VcmksXG5cdFx0XHR0aGlzLl9ob3N0Q3VzdG9taXphdGlvbnMoKSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHRoaXMuX21jcEN1c3RvbWl6YXRpb25zLnBsdWdpbk1jcFNlcnZlclNvdXJjZXMsXG5cdFx0KSk7XG5cdFx0aWYgKGN1c3RvbWl6YXRpb25JZCAhPT0gdW5kZWZpbmVkICYmIGVuYWJsZW1lbnQuZ2V0KGN1c3RvbWl6YXRpb25JZCkgPT09IGZhbHNlKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBTdXBwcmVzc2VkIGF1dGhlbnRpY2F0aW9uIHJlcXVlc3QgZnJvbSBkaXNhYmxlZCBNQ1Agc2VydmVyICcke3JlcXVlc3Quc2VydmVyTmFtZX0nYCk7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0aWYgKGN1c3RvbWl6YXRpb25JZCA9PT0gdW5kZWZpbmVkIHx8IGVuYWJsZW1lbnQuZ2V0KGN1c3RvbWl6YXRpb25JZCkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEFsbG93aW5nIGF1dGhlbnRpY2F0aW9uIHJlcXVlc3QgZnJvbSBNQ1Agc2VydmVyICcke3JlcXVlc3Quc2VydmVyTmFtZX0nIHdpdGhvdXQgcmVzb2x2ZWQgZW5hYmxlbWVudGApO1xuXHRcdH1cblx0XHRjb25zdCBnaXRodWJUb2tlbiA9IHJlcXVlc3QucmVhc29uID09PSAnaW5pdGlhbCcgJiYgdGhpcy5fc2NvcGVzRnJvbUNoYWxsZW5nZShyZXF1ZXN0Lnd3d0F1dGhlbnRpY2F0ZVBhcmFtcz8uc2NvcGUpLmxlbmd0aCA9PT0gMFxuXHRcdFx0PyBhd2FpdCB0aGlzLl9pbml0aWFsR2l0SHViTWNwVG9rZW4ocmVxdWVzdClcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGlmIChnaXRodWJUb2tlbikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gUmV1c2luZyB0aGUgZXhpc3RpbmcgR2l0SHViIHRva2VuIGZvciBpbml0aWFsIEdpdEh1YiBNQ1AgYXV0aGVudGljYXRpb25gKTtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICd0b2tlbicsIGFjY2Vzc1Rva2VuOiBnaXRodWJUb2tlbiB9O1xuXHRcdH1cblx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMuX3Byb3RlY3RlZFJlc291cmNlRnJvbU1jcEF1dGhSZXF1ZXN0KHJlcXVlc3QpO1xuXHRcdGNvbnN0IHJlcXVpcmVkU2NvcGVzID0gdGhpcy5fc2NvcGVzRnJvbUNoYWxsZW5nZShyZXF1ZXN0Lnd3d0F1dGhlbnRpY2F0ZVBhcmFtcz8uc2NvcGUpO1xuXHRcdGNvbnN0IG9hdXRoQ2xpZW50OiBNY3BBdXRoUmVxdWlyZW1lbnRbJ29hdXRoQ2xpZW50J10gPSByZXF1ZXN0LnN0YXRpY0NsaWVudENvbmZpZz8ucHVibGljQ2xpZW50XG5cdFx0XHQ/IHsgY2xpZW50SWQ6IHJlcXVlc3Quc3RhdGljQ2xpZW50Q29uZmlnLmNsaWVudElkIH1cblx0XHRcdDogcmVxdWVzdC5zdGF0aWNDbGllbnRDb25maWc/LmNsaWVudFNlY3JldFxuXHRcdFx0XHQ/IHsgY2xpZW50SWQ6IHJlcXVlc3Quc3RhdGljQ2xpZW50Q29uZmlnLmNsaWVudElkLCBjbGllbnRTZWNyZXQ6IHJlcXVlc3Quc3RhdGljQ2xpZW50Q29uZmlnLmNsaWVudFNlY3JldCB9XG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGF1dGg6IE1jcEF1dGhSZXF1aXJlbWVudCA9IHtcblx0XHRcdHJlYXNvbjogdGhpcy5fbWNwQXV0aFJlcXVpcmVkUmVhc29uKHJlcXVlc3QucmVhc29uKSxcblx0XHRcdC4uLihvYXV0aENsaWVudCA/IHsgb2F1dGhDbGllbnQgfSA6IHt9KSxcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0cmVxdWlyZWRTY29wZXM6IHJlcXVpcmVkU2NvcGVzLmxlbmd0aCA/IFsuLi5yZXF1aXJlZFNjb3Blc10gOiB1bmRlZmluZWQsXG5cdFx0XHRkZXNjcmlwdGlvbjogcmVxdWVzdC53d3dBdXRoZW50aWNhdGVQYXJhbXM/LmVycm9yLFxuXHRcdH07XG5cdFx0Y29uc3QgdG9vbENhbGxzID0gdGhpcy5fYWN0aXZlTWNwVG9vbENhbGxzKHJlcXVlc3Quc2VydmVyTmFtZSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5fcGVuZGluZ01jcEF1dGhSZXF1ZXN0cy5yZWdpc3RlcihyZXF1ZXN0LnJlcXVlc3RJZCwge1xuXHRcdFx0c2VydmVyTmFtZTogcmVxdWVzdC5zZXJ2ZXJOYW1lLFxuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRyZXF1aXJlZFNjb3Blcyxcblx0XHRcdHRvb2xDYWxscyxcblx0XHR9KTtcblx0XHR0aGlzLl9tY3BDdXN0b21pemF0aW9ucy5hcHBseU9uZSh7XG5cdFx0XHRuYW1lOiByZXF1ZXN0LnNlcnZlck5hbWUsXG5cdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuQXV0aFJlcXVpcmVkLFxuXHRcdFx0XHQuLi5hdXRoLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRmb3IgKGNvbnN0IHRvb2xDYWxsIG9mIHRvb2xDYWxscykge1xuXHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQXV0aFJlcXVpcmVkLFxuXHRcdFx0XHR0dXJuSWQ6IHRvb2xDYWxsLnR1cm5JZCxcblx0XHRcdFx0dG9vbENhbGxJZDogdG9vbENhbGwudG9vbENhbGxJZCxcblx0XHRcdFx0YXV0aCxcblx0XHRcdH0sIHRvb2xDYWxsLnBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBNQ1Agc2VydmVyICcke3JlcXVlc3Quc2VydmVyTmFtZX0nIHJlcXVpcmVzIGF1dGhlbnRpY2F0aW9uIGZvciAke3Jlc291cmNlLnJlc291cmNlfWApO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9hY3RpdmVNY3BUb29sQ2FsbHMoc2VydmVyTmFtZTogc3RyaW5nKTogSU1jcEF1dGhUb29sQ2FsbFtdIHtcblx0XHRpZiAoIXRoaXMuX3R1cm5JZCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQ6IElNY3BBdXRoVG9vbENhbGxbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW3Rvb2xDYWxsSWQsIHRvb2xDYWxsXSBvZiB0aGlzLl9hY3RpdmVUb29sQ2FsbHMpIHtcblx0XHRcdGlmICh0b29sQ2FsbC5tY3BTZXJ2ZXJOYW1lID09PSBzZXJ2ZXJOYW1lKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHsgdHVybklkOiB0aGlzLl90dXJuSWQsIHRvb2xDYWxsSWQsIHBhcmVudFRvb2xDYWxsSWQ6IHRvb2xDYWxsLnBhcmVudFRvb2xDYWxsSWQgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pbml0aWFsR2l0SHViTWNwVG9rZW4ocmVxdWVzdDogTWNwQXV0aFJlcXVlc3QpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGdpdGh1YlRva2VuID0gdGhpcy5fbGF1bmNoUGxhbi5naXRodWJUb2tlbjtcblx0XHRjb25zdCByZXF1ZXN0VXJsID0gbm9ybWFsaXplTWNwU2VydmVyVXJsKHJlcXVlc3Quc2VydmVyVXJsKTtcblx0XHRpZiAoIWdpdGh1YlRva2VuIHx8IHJlcXVlc3RVcmwgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgY29uZmlndXJlZFVybHMgPSBbZ2l0SHViTWNwU2VydmVyVXJsKHVuZGVmaW5lZCldO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXNvbHZlZFVybCA9IGdpdEh1Yk1jcFNlcnZlclVybChhd2FpdCB0aGlzLl9jb3BpbG90QXBpU2VydmljZS5yZXNvbHZlQXBpRW5kcG9pbnQoZ2l0aHViVG9rZW4pKTtcblx0XHRcdGlmIChyZXNvbHZlZFVybCkge1xuXHRcdFx0XHRjb25maWd1cmVkVXJscy5wdXNoKHJlc29sdmVkVXJsKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gRmFpbGVkIHRvIHJlc29sdmUgdGhlIEdpdEh1YiBNQ1Agc2VydmVyIFVSTDogJHtnZXRFcnJvck1lc3NhZ2UoZXJyb3IpfWApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIGNvbmZpZ3VyZWRVcmxzLnNvbWUodSA9PiB1ICYmIHJlcXVlc3RVcmwgPT09IG5vcm1hbGl6ZU1jcFNlcnZlclVybCh1KSkgPyBnaXRodWJUb2tlbiA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3Byb3RlY3RlZFJlc291cmNlRnJvbU1jcEF1dGhSZXF1ZXN0KHJlcXVlc3Q6IE1jcEF1dGhSZXF1ZXN0KTogUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YSB7XG5cdFx0aWYgKHJlcXVlc3QucmVzb3VyY2VNZXRhZGF0YSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyZXF1ZXN0LnJlc291cmNlTWV0YWRhdGEpO1xuXHRcdFx0XHRpZiAoaXNBdXRob3JpemF0aW9uUHJvdGVjdGVkUmVzb3VyY2VNZXRhZGF0YShwYXJzZWQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHBhcnNlZDtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBJZ25vcmluZyBpbnZhbGlkIE1DUCBwcm90ZWN0ZWQtcmVzb3VyY2UgbWV0YWRhdGEgZm9yICcke3JlcXVlc3Quc2VydmVyTmFtZX0nYCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gRmFpbGVkIHRvIHBhcnNlIE1DUCBwcm90ZWN0ZWQtcmVzb3VyY2UgbWV0YWRhdGEgZm9yICcke3JlcXVlc3Quc2VydmVyTmFtZX0nYCwgZXJyKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3Qgc2NvcGVzID0gdGhpcy5fc2NvcGVzRnJvbUNoYWxsZW5nZShyZXF1ZXN0Lnd3d0F1dGhlbnRpY2F0ZVBhcmFtcz8uc2NvcGUpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZXNvdXJjZTogcmVxdWVzdC5zZXJ2ZXJVcmwsXG5cdFx0XHRyZXNvdXJjZV9uYW1lOiByZXF1ZXN0LnNlcnZlck5hbWUsXG5cdFx0XHRzY29wZXNfc3VwcG9ydGVkOiBzY29wZXMubGVuZ3RoID8gc2NvcGVzLnNsaWNlKCkgOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3Njb3Blc0Zyb21DaGFsbGVuZ2Uoc2NvcGU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHJlYWRvbmx5IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gc2NvcGU/LnNwbGl0KC9cXHMrLykubWFwKHMgPT4gcy50cmltKCkpLmZpbHRlcihzID0+IHMubGVuZ3RoID4gMCkgPz8gW107XG5cdH1cblxuXHRwcml2YXRlIF9tY3BBdXRoUmVxdWlyZWRSZWFzb24ocmVhc29uOiBNY3BBdXRoUmVxdWVzdFsncmVhc29uJ10pOiBNY3BBdXRoUmVxdWlyZWRSZWFzb24ge1xuXHRcdHN3aXRjaCAocmVhc29uKSB7XG5cdFx0XHRjYXNlICdyZWZyZXNoJzpcblx0XHRcdGNhc2UgJ3JlYXV0aCc6XG5cdFx0XHRcdHJldHVybiBNY3BBdXRoUmVxdWlyZWRSZWFzb24uRXhwaXJlZDtcblx0XHRcdGNhc2UgJ3Vwc2NvcGUnOlxuXHRcdFx0XHRyZXR1cm4gTWNwQXV0aFJlcXVpcmVkUmVhc29uLkluc3VmZmljaWVudFNjb3BlO1xuXHRcdFx0Y2FzZSAnaW5pdGlhbCc6XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gTWNwQXV0aFJlcXVpcmVkUmVhc29uLlJlcXVpcmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Njb3Blc1NhdGlzZnkocHJvdmlkZWQ6IHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkLCByZXF1aXJlZDogcmVhZG9ubHkgc3RyaW5nW10pOiBib29sZWFuIHtcblx0XHRpZiAocmVxdWlyZWQubGVuZ3RoID09PSAwIHx8IHByb3ZpZGVkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBwcm92aWRlZFNldCA9IG5ldyBTZXQocHJvdmlkZWQpO1xuXHRcdHJldHVybiByZXF1aXJlZC5ldmVyeShzY29wZSA9PiBwcm92aWRlZFNldC5oYXMoc2NvcGUpKTtcblx0fVxuXG5cdHByaXZhdGUgX2NhbmNlbFBlbmRpbmdNY3BBdXRoUmVxdWVzdHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ01jcEF1dGhSZXF1ZXN0cy5kZW55QWxsKHsga2luZDogJ2NhbmNlbGxlZCcgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9jYW5jZWxQZW5kaW5nTWNwQXV0aFJlcXVlc3RzRm9yU2VydmVyKHNlcnZlck5hbWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW3JlcXVlc3RJZCwgcGVuZGluZ10gb2YgdGhpcy5fcGVuZGluZ01jcEF1dGhSZXF1ZXN0cy5lbnRyaWVzKCkpIHtcblx0XHRcdGlmIChwZW5kaW5nLnNlcnZlck5hbWUgIT09IHNlcnZlck5hbWUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHRvb2xDYWxsIG9mIHBlbmRpbmcudG9vbENhbGxzKSB7XG5cdFx0XHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQXV0aFJlc29sdmVkLFxuXHRcdFx0XHRcdHR1cm5JZDogdG9vbENhbGwudHVybklkLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6IHRvb2xDYWxsLnRvb2xDYWxsSWQsXG5cdFx0XHRcdH0sIHRvb2xDYWxsLnBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcGVuZGluZ01jcEF1dGhSZXF1ZXN0cy5yZXNwb25kKHJlcXVlc3RJZCwgeyBraW5kOiAnY2FuY2VsbGVkJyB9KTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0tIHNlc3Npb24gb3BlcmF0aW9ucyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0YXN5bmMgc2VuZChwcm9tcHQ6IHN0cmluZywgYXR0YWNobWVudHM/OiByZWFkb25seSBNZXNzYWdlQXR0YWNobWVudFtdLCB0dXJuSWQ/OiBzdHJpbmcsIG1vZGU/OiBDb3BpbG90U2RrTW9kZSwgc2VuZGVyQ2xpZW50SWQ/OiBzdHJpbmcsIGNsaWVudFR5cGUgPSBBZ2VudEhvc3RDbGllbnRUeXBlLlVua25vd24sIGhvc3RJbnN0cnVjdGlvbnM/OiByZWFkb25seSBzdHJpbmdbXSwgY2xpZW50Q29udGV4dCA9IGNyZWF0ZVVua25vd25BZ2VudEhvc3RDbGllbnRUZWxlbWV0cnlDb250ZXh0KGNsaWVudFR5cGUpKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fcmVzZXRBYm9ydFRva2VuKCk7XG5cdFx0aWYgKHR1cm5JZCAmJiB0aGlzLl9jdXJyZW50VHVybj8uaWQgIT09IHR1cm5JZCkge1xuXHRcdFx0Ly8gRXN0YWJsaXNoIHRoZSBgcGVuZGluZ2AgdHVybiBmb3IgdGhpcyBtZXNzYWdlLiBDYWxsZXJzIG5vcm1hbGx5XG5cdFx0XHQvLyBjYWxsIGByZXNldFR1cm5TdGF0ZWAganVzdCBiZWZvcmUgYHNlbmQoKWA7IHRoaXMgY292ZXJzIHRoZVxuXHRcdFx0Ly8gZGlyZWN0LXNlbmQgcGF0aCBhbmQgaXMgYSBuby1vcCB3aGVuIHRoZSB0dXJuIGFscmVhZHkgZXhpc3RzLlxuXHRcdFx0dGhpcy5yZXNldFR1cm5TdGF0ZSh0dXJuSWQsIHNlbmRlckNsaWVudElkLCBjbGllbnRUeXBlLCBjbGllbnRDb250ZXh0KTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRUdXJuKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50VHVybi5tZXNzYWdlQ2hhckxlbiA9IHByb21wdC5sZW5ndGg7XG5cdFx0fVxuXHRcdGNvbnN0IHR1cm4gPSB0aGlzLl9jdXJyZW50VHVybjtcblx0XHR0aGlzLl9ob3N0SW5zdHJ1Y3Rpb25zID0gaG9zdEluc3RydWN0aW9ucztcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fc2VuZChwcm9tcHQsIGF0dGFjaG1lbnRzLCBtb2RlKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIEEgcmVqZWN0ZWQgc2VuZCBuZXZlciByZWFjaGVzIHRoZSBTREsncyBhZ2VudGljIGxvb3AsIHNvIG5vXG5cdFx0XHQvLyBgc2Vzc2lvbi5pZGxlYCB3aWxsIGV2ZXIgYXJyaXZlIHRvIGNsb3NlIHRoaXMgdHVybi4gVGhlIGhvc3QgdHVybnNcblx0XHRcdC8vIHRoZSByZWplY3Rpb24gaW50byBhIGBDaGF0RXJyb3JgIHRoYXQgZmluYWxpemVzIHRoZSBwcm90b2NvbCB0dXJuLFxuXHRcdFx0Ly8gc28gZHJvcCBvdXIgaGFuZGxlIHRvIG1hdGNoOiBsZWF2aW5nIGl0IHNldCBtYWtlcyB0aGUgY2hhdCBsb29rXG5cdFx0XHQvLyBidXN5IGZvcmV2ZXIsIHdoaWNoIGJsb2NrcyBpZGxlIGV2aWN0aW9uIGFuZCBwYXJrcyBhbnkgZGVmZXJyZWRcblx0XHRcdC8vIGNsaWVudCByZXN0YXJ0IGZvciB0aGUgcmVzdCBvZiB0aGUgcHJvY2VzcydzIGxpZmUuXG5cdFx0XHRpZiAodHVybiAmJiB0aGlzLl9jdXJyZW50VHVybiA9PT0gdHVybikge1xuXHRcdFx0XHR0aGlzLl9jbGVhckFjdGl2ZVR1cm4oKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2hvc3RJbnN0cnVjdGlvbnMgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHR9XG5cblx0aGFuZGxlVXNlclByb21wdFN1Ym1pdHRlZCgpOiB7IHJlYWRvbmx5IGFkZGl0aW9uYWxDb250ZXh0OiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYWRkaXRpb25hbENvbnRleHQgPSB0aGlzLl9ob3N0SW5zdHJ1Y3Rpb25zPy5qb2luKCdcXG5cXG4nKTtcblx0XHR0aGlzLl9ob3N0SW5zdHJ1Y3Rpb25zID0gdW5kZWZpbmVkO1xuXHRcdHJldHVybiBhZGRpdGlvbmFsQ29udGV4dCA/IHsgYWRkaXRpb25hbENvbnRleHQgfSA6IHVuZGVmaW5lZDtcblx0fVxuXHRwcml2YXRlIGFzeW5jIF9zZW5kKHByb21wdDogc3RyaW5nLCBhdHRhY2htZW50czogcmVhZG9ubHkgTWVzc2FnZUF0dGFjaG1lbnRbXSB8IHVuZGVmaW5lZCwgbW9kZTogQ29waWxvdFNka01vZGUgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBzZW5kTWVzc2FnZSBjYWxsZWQ6IFwiJHtwcm9tcHQuc3Vic3RyaW5nKDAsIDEwMCl9JHtwcm9tcHQubGVuZ3RoID4gMTAwID8gJy4uLicgOiAnJ31cIiAoJHthdHRhY2htZW50cz8ubGVuZ3RoID8/IDB9IGF0dGFjaG1lbnRzKWApO1xuXG5cdFx0Y29uc3Qgc2xhc2hDb21tYW5kID0gcGFyc2VMZWFkaW5nU2xhc2hDb21tYW5kKHByb21wdCk7XG5cdFx0aWYgKHNsYXNoQ29tbWFuZD8uY29tbWFuZCA9PT0gJ2NvbXBhY3QnKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl93cmFwcGVyLnNlc3Npb24ucnBjLmhpc3RvcnkuY29tcGFjdCgpO1xuXHRcdFx0XHQvLyBDb21wYWN0aW9uIHJlZHVjZXMgdGhlIG51bWJlciBvZiB0b2tlbnMgY3VycmVudGx5IG9jY3VweWluZyB0aGUgY29udGV4dCB3aW5kb3cuIFJlcG9ydCB0aGVcblx0XHRcdFx0Ly8gbmV3IG9jY3VwYW5jeSBzbyB0aGUgY29udGV4dC11c2FnZSB3aWRnZXQgcmVmcmVzaGVzIGltbWVkaWF0ZWx5LiBFbWl0dGVkIGJlZm9yZVxuXHRcdFx0XHQvLyBgX2NvbXBsZXRlQWN0aXZlVHVybmAgc2luY2UgdGhlIHJlZHVjZXIgZHJvcHMgdXNhZ2UgZm9yIGEgbm9uLWFjdGl2ZSB0dXJuLlxuXHRcdFx0XHRjb25zdCB1c2VkVG9rZW5zID0gcmVzdWx0LmNvbnRleHRXaW5kb3c/LmN1cnJlbnRUb2tlbnM7XG5cdFx0XHRcdGlmICh0eXBlb2YgdXNlZFRva2VucyA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHQvLyBgc2Vzc2lvbi5jb21wYWN0aW9uX2NvbXBsZXRlYCBoYXMgYWxyZWFkeSBmb2xkZWQgdGhlIHN1bW1hcml6YXRpb24gY2FsbCdzXG5cdFx0XHRcdFx0Ly8gY29zdCBpbnRvIHRoZSB0dXJuIGJ5IHRoZSB0aW1lIHRoaXMgUlBDIHJlc29sdmVzOyByZWZyZXNoIHRoZSBzZXNzaW9uIHRvdGFsXG5cdFx0XHRcdFx0Ly8gc28gdGhlIHJlcG9ydCBjYXJyaWVzIGJvdGguXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fcmVmcmVzaFNlc3Npb25Vc2FnZU1ldHJpY3MoKTtcblx0XHRcdFx0XHRjb25zdCBjb3BpbG90VXNhZ2UgPSB0aGlzLl9wYXJlbnRDb3BpbG90VXNhZ2VNZXRhKCk7XG5cdFx0XHRcdFx0Ly8gVGhpcyBlbWl0IHJlcGxhY2VzIHRoZSB0dXJuJ3MgdXNhZ2UgaW4gdGhlIHJlZHVjZXIsIHNvIGNhcnJ5IHRoZVxuXHRcdFx0XHRcdC8vIHdob2xlLXR1cm4gdG9rZW4gdG90YWxzIGFjY3VtdWxhdGVkIHNvIGZhciB0b28uXG5cdFx0XHRcdFx0Y29uc3QgdHVyblRva2VuVG90YWxzID0gdGhpcy5fY3VycmVudFR1cm4/LnRva2VuVG90YWxzO1xuXHRcdFx0XHRcdGNvbnN0IG1ldGE6IFVzYWdlSW5mb01ldGEgPSB7XG5cdFx0XHRcdFx0XHQuLi4oY29waWxvdFVzYWdlID8geyBjb3BpbG90VXNhZ2UgfSA6IHt9KSxcblx0XHRcdFx0XHRcdC4uLih0dXJuVG9rZW5Ub3RhbHMgPyB7IHR1cm5Ub2tlblRvdGFscyB9IDoge30pLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRVc2FnZSxcblx0XHRcdFx0XHRcdHR1cm5JZDogdGhpcy5fdHVybklkLFxuXHRcdFx0XHRcdFx0dXNhZ2U6IHtcblx0XHRcdFx0XHRcdFx0aW5wdXRUb2tlbnM6IHVzZWRUb2tlbnMsXG5cdFx0XHRcdFx0XHRcdG91dHB1dFRva2VuczogMCxcblx0XHRcdFx0XHRcdFx0bW9kZWw6IHRoaXMuX2xhc3RTZWVuTW9kZWxJZCxcblx0XHRcdFx0XHRcdFx0Li4uKE9iamVjdC5rZXlzKG1ldGEpLmxlbmd0aCA+IDAgPyB7IF9tZXRhOiBtZXRhIH0gOiB7fSksXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuZW1pdEluaXRpYWxNYXJrZG93bihsb2NhbGl6ZSgnY29waWxvdEFnZW50LmNvbXBhY3Rpb25Db21wbGV0ZWQnLCBcIkNvbXBhY3Rpb24gY29tcGxldGVkXCIpKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRpZiAoZ2V0RXJyb3JNZXNzYWdlKGVycikudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnbm90aGluZyB0byBjb21wYWN0JykpIHtcblx0XHRcdFx0XHR0aGlzLmVtaXRJbml0aWFsTWFya2Rvd24obG9jYWxpemUoJ2NvcGlsb3RBZ2VudC5jb21wYWN0aW9uQ29tcGxldGVkJywgXCJDb21wYWN0aW9uIGNvbXBsZXRlZFwiKSk7XG5cdFx0XHRcdFx0dGhpcy5fY29tcGxldGVBY3RpdmVUdXJuKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyLCBgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIHJwYy5oaXN0b3J5LmNvbXBhY3QgZmFpbGVkYCk7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblx0XHRcdC8vIGAvY29tcGFjdGAgaXMgaGFuZGxlZCBpbmxpbmUgdmlhIHRoZSBoaXN0b3J5IFJQQyByYXRoZXIgdGhhbiBieVxuXHRcdFx0Ly8gZHJpdmluZyBhbiBTREsgdHVybiwgc28gdGhlIFNESyBuZXZlciBmaXJlcyBgb25JZGxlYCB0byBjbG9zZSB0aGVcblx0XHRcdC8vIHR1cm4uIENvbXBsZXRlIHRoZSB0dXJuIGhlcmUgc28gdGhlIHNlc3Npb24gcmV0dXJucyB0byBpZGxlXG5cdFx0XHQvLyBpbnN0ZWFkIG9mIHNwaW5uaW5nIGZvcmV2ZXIuXG5cdFx0XHR0aGlzLl9jb21wbGV0ZUFjdGl2ZVR1cm4oKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY29uZmlnQWN0aW9uID0gc2xhc2hDb21tYW5kID8gcmVzb2x2ZUNvcGlsb3RDb25maWdTbGFzaENvbW1hbmRPblNlbmQoc2xhc2hDb21tYW5kLmNvbW1hbmQsIHNsYXNoQ29tbWFuZC5yYXdSZXN0KSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoY29uZmlnQWN0aW9uKSB7XG5cdFx0XHQvLyBXb3JrYmVuY2ggY29uZmlnLWFjdGlvbiBjb21tYW5kIChwZXJtaXNzaW9uL21vZGUgdG9nZ2xlLCBlLmcuXG5cdFx0XHQvLyBgL2F1dG9waWxvdCA8cHJvbXB0PmAsIGAvcGxhbmAsIGAveW9sb2ApLiBUaGUgY29uZmlnIGlzIGFwcGxpZWRcblx0XHRcdC8vIGNsaWVudC1zaWRlIG9uIGFjY2VwdCB2aWEgdGhlIHNlc3Npb24gcHJvdmlkZXI7IGhlcmUgd2UgcmUtYXBwbHkgdGhlXG5cdFx0XHQvLyBtb2RlIGZvciB0aGlzIHR1cm4gKGJlbHQtYW5kLXN1c3BlbmRlcnMpIGFuZCBzdHJpcCB0aGUgY29tbWFuZCB0b2tlblxuXHRcdFx0Ly8gc28gaXQgaXMgbm90IGRpc3BhdGNoZWQgdG8gdGhlIHJ1bnRpbWUgYXMgYSBydW50aW1lIGNvbW1hbmQuXG5cdFx0XHQvLyBgYXV0b0FwcHJvdmVgIGNoYW5nZXMgYXJlIGFscmVhZHkgcmVmbGVjdGVkIGluIHRoZSBzZXNzaW9uIGNvbmZpZyBhbmRcblx0XHRcdC8vIGFwcGxpZWQgYnkgYHN5bmNQZXJtaXNzaW9uTW9kZSgndHVybi1zdGFydCcpYCBiZWxvdy5cblx0XHRcdGNvbnN0IHNka01vZGUgPSB0b0NvcGlsb3RTZGtNb2RlKGNvbmZpZ0FjdGlvbi5hcHBseUNvbmZpZ1tTZXNzaW9uQ29uZmlnS2V5Lk1vZGVdKTtcblx0XHRcdGlmIChzZGtNb2RlKSB7XG5cdFx0XHRcdG1vZGUgPSBzZGtNb2RlO1xuXHRcdFx0fVxuXHRcdFx0cHJvbXB0ID0gY29uZmlnQWN0aW9uLnN0cmlwcGVkUHJvbXB0O1xuXHRcdH0gZWxzZSBpZiAoc2xhc2hDb21tYW5kKSB7XG5cdFx0XHRjb25zdCBydW50aW1lU2xhc2hDb21tYW5kID0gYXdhaXQgdGhpcy5fc2xhc2hDb21tYW5kUHJvdmlkZXIucmVzb2x2ZVNsYXNoQ29tbWFuZChzbGFzaENvbW1hbmQuY29tbWFuZCk7XG5cdFx0XHQvLyBTa2lsbHMgY2FuIGJlIHBhc3NlZCBhcyBpcyB0byB0aGUgcnVudGltZS5cblx0XHRcdGlmIChydW50aW1lU2xhc2hDb21tYW5kICYmIHJ1bnRpbWVTbGFzaENvbW1hbmQua2luZCAhPT0gJ3NraWxsJykge1xuXHRcdFx0XHRsZXQgcmVzdWx0OiBDb3BpbG90Q29tbWFuZEludm9jYXRpb25SZXN1bHQ7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5fd3JhcHBlci5zZXNzaW9uLnJwYy5jb21tYW5kcy5pbnZva2Uoe1xuXHRcdFx0XHRcdFx0bmFtZTogcnVudGltZVNsYXNoQ29tbWFuZC5uYW1lLFxuXHRcdFx0XHRcdFx0Li4uKHNsYXNoQ29tbWFuZC5yYXdSZXN0Lmxlbmd0aCA+IDAgPyB7IGlucHV0OiBzbGFzaENvbW1hbmQucmF3UmVzdCB9IDoge30pLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVyciwgYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBycGMuY29tbWFuZHMuaW52b2tlKCR7c2xhc2hDb21tYW5kLmNvbW1hbmR9KSBmYWlsZWRgKTtcblx0XHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3dpdGNoIChyZXN1bHQua2luZCkge1xuXHRcdFx0XHRcdGNhc2UgJ3RleHQnOlxuXHRcdFx0XHRcdFx0dGhpcy5fZW1pdE1hcmtkb3duRGVsdGEocmVzdWx0Lm1hcmtkb3duID09PSB0cnVlID8gcmVzdWx0LnRleHQgOiBlc2NhcGVNYXJrZG93blN5bnRheFRva2VucyhyZXN1bHQudGV4dCkpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnY29tcGxldGVkJzpcblx0XHRcdFx0XHRcdGlmIChyZXN1bHQubWVzc2FnZSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9lbWl0TWFya2Rvd25EZWx0YShyZXN1bHQubWVzc2FnZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdhZ2VudC1wcm9tcHQnOiB7XG5cdFx0XHRcdFx0XHRjb25zdCBydW50aW1lTW9kZSA9IHRvQ29waWxvdFNka01vZGUocmVzdWx0Lm1vZGUpO1xuXHRcdFx0XHRcdFx0aWYgKHJ1bnRpbWVNb2RlKSB7XG5cdFx0XHRcdFx0XHRcdG1vZGUgPSBydW50aW1lTW9kZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHByb21wdCA9IHJlc3VsdC5wcm9tcHQ7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSAnc2VsZWN0LXN1YmNvbW1hbmQnOlxuXHRcdFx0XHRcdFx0dGhpcy5fZW1pdE1hcmtkb3duRGVsdGEobG9jYWxpemUoXG5cdFx0XHRcdFx0XHRcdCdjb3BpbG90U2xhc2hDb21tYW5kLnNlbGVjdFN1YmNvbW1hbmRSZXN1bHQnLFxuXHRcdFx0XHRcdFx0XHRcIlRoZSAvezB9IGNvbW1hbmQgcmVxdWlyZXMgc2VsZWN0aW5nIGEgc3ViY29tbWFuZC4gQXZhaWxhYmxlIG9wdGlvbnM6IHsxfVwiLFxuXHRcdFx0XHRcdFx0XHRyZXN1bHQuY29tbWFuZCxcblx0XHRcdFx0XHRcdFx0cmVzdWx0Lm9wdGlvbnMubWFwKG9wdGlvbiA9PiBvcHRpb24ubmFtZSkuam9pbignLCAnKSxcblx0XHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdC8vIFRoZSBydW50aW1lIGNhbiBiZSBuZXdlciB0aGFuIHRoZXNlIGNvbXBpbGVkIFNESyB0eXBlcywgc28gYW5cblx0XHRcdFx0XHRcdC8vIHVua25vd24ga2luZCBtdXN0IGJlIGxvZ2dlZCByYXRoZXIgdGhhbiBzaWxlbnRseSBzd2FsbG93ZWQgKHRoZVxuXHRcdFx0XHRcdFx0Ly8gdHVybiB3b3VsZCBvdGhlcndpc2UgY29tcGxldGUgd2l0aCBubyB1c2VyLWZhY2luZyBvdXRwdXQpLlxuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gVW5oYW5kbGVkIHNsYXNoIGNvbW1hbmQgcmVzdWx0IGtpbmQ6ICR7KHJlc3VsdCBhcyB7IGtpbmQ6IHN0cmluZyB9KS5raW5kfWApO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHJlc3VsdC5ydW50aW1lU2V0dGluZ3NDaGFuZ2VkID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2xhc2hDb21tYW5kUHJvdmlkZXIuY2xlYXJDYWNoZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChyZXN1bHQua2luZCAhPT0gJ2FnZW50LXByb21wdCcpIHtcblx0XHRcdFx0XHR0aGlzLl9jb21wbGV0ZUFjdGl2ZVR1cm4oKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBzZGtBdHRhY2htZW50cyA9IGF3YWl0IHRoaXMuX3RvU2RrQXR0YWNobWVudHMoYXR0YWNobWVudHMpO1xuXG5cdFx0YXdhaXQgdGhpcy5hcHBseU1vZGUobW9kZSk7XG5cdFx0YXdhaXQgdGhpcy5zeW5jUGVybWlzc2lvbk1vZGUoJ3R1cm4tc3RhcnQnKTtcblx0XHRhd2FpdCB0aGlzLl9hcHBseUVmZmVjdGl2ZVNhbmRib3hDb25maWcoKTtcblx0XHRhd2FpdCB0aGlzLl9yZWNvbmNpbGVNY3BTZXJ2ZXJFbmFibGVtZW50KCk7XG5cdFx0Y29uc3QgdHJhY2VDb250ZXh0ID0gdGhpcy5fb3RlbFNlcnZpY2UuZ2V0U2Vzc2lvblRyYWNlQ29udGV4dCh0aGlzLnNlc3Npb25JZCwgdGhpcy5yZXNvdXJjZVVyaS50b1N0cmluZygpKTtcblx0XHRhd2FpdCB0aGlzLl9vdGVsU2VydmljZS53aXRoVHJhY2VDb250ZXh0KHRyYWNlQ29udGV4dCwgKCkgPT4gdGhpcy5fd3JhcHBlci5zZXNzaW9uLnNlbmQoeyBwcm9tcHQsIGF0dGFjaG1lbnRzOiBzZGtBdHRhY2htZW50cz8ubGVuZ3RoID8gc2RrQXR0YWNobWVudHMgOiB1bmRlZmluZWQgfSkpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIHNlc3Npb24uc2VuZCgpIHJldHVybmVkYCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF90b1Nka0F0dGFjaG1lbnRzKGF0dGFjaG1lbnRzOiByZWFkb25seSBNZXNzYWdlQXR0YWNobWVudFtdIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxDb3BpbG90U2RrQXR0YWNobWVudFtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgc2RrQXR0YWNobWVudHMgPSBhdHRhY2htZW50cz8ubGVuZ3RoXG5cdFx0XHQ/IChhd2FpdCBQcm9taXNlLmFsbChhdHRhY2htZW50cy5tYXAoYXR0YWNobWVudCA9PiB0aGlzLl90b1Nka0F0dGFjaG1lbnQoYXR0YWNobWVudCkpKSkuZmlsdGVyKGlzRGVmaW5lZClcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGlmIChzZGtBdHRhY2htZW50cz8ubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gQXR0YWNobWVudHM6ICR7SlNPTi5zdHJpbmdpZnkoc2RrQXR0YWNobWVudHMubWFwKGF0dGFjaG1lbnQgPT4gKHsgdHlwZTogYXR0YWNobWVudC50eXBlIH0pKSl9YCk7XG5cdFx0fVxuXHRcdHJldHVybiBzZGtBdHRhY2htZW50cztcblx0fVxuXG5cdGFzeW5jIGhhc1J1bnRpbWVTbGFzaENvbW1hbmQoY29tbWFuZDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiAhIShhd2FpdCB0aGlzLl9zbGFzaENvbW1hbmRQcm92aWRlci5yZXNvbHZlU2xhc2hDb21tYW5kKGNvbW1hbmQpKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIHJwYy5jb21tYW5kcy5saXN0IGZhaWxlZGAsIGVycik7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0UnVudGltZVNsYXNoQ29tbWFuZHMob3B0aW9ucz86IHsgcmVhZG9ubHkgbWF4V2FpdE1zPzogbnVtYmVyIH0pOiBQcm9taXNlPHJlYWRvbmx5IFJ1bnRpbWVTbGFzaENvbW1hbmRJbmZvW10+IHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3NsYXNoQ29tbWFuZFByb3ZpZGVyLmdldFNsYXNoQ29tbWFuZHMob3B0aW9ucyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBycGMuY29tbWFuZHMubGlzdCBmYWlsZWRgLCBlcnIpO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBUcmFuc2xhdGUgYSBwcm90b2NvbCB7QGxpbmsgTWVzc2FnZUF0dGFjaG1lbnR9IGludG8gdGhlIENvcGlsb3QgQ0xJIFNESydzIGBhdHRhY2htZW50c2AgcGF5bG9hZCBzaGFwZS4gUmVzb3VyY2Vcblx0ICogYXR0YWNobWVudHMgbWFwIHRvIHRoZSBTREsncyByZWZlcmVuY2Utc3R5bGUgYGZpbGVgL2BkaXJlY3RvcnlgL2BzZWxlY3Rpb25gIHZhcmlhbnRzICh0aGVcblx0ICoge0BsaW5rIE1lc3NhZ2VBdHRhY2htZW50QmFzZS5kaXNwbGF5S2luZH0gYWR2aXNvcnkgaGludCBjb250cm9scyB3aGljaCBvbmUpLiBFbWJlZGRlZCByZXNvdXJjZXMgKGUuZy4gaW5saW5lXG5cdCAqIGltYWdlIGJ5dGVzLCBvciB1bnNhdmVkIGVkaXRvciBjb250ZW50KSBtYXAgdG8gdGhlIFNESydzIGBibG9iYCB2YXJpYW50LCBhbmQgc2ltcGxlIGF0dGFjaG1lbnRzIHdpdGggYSBtb2RlbFxuXHQgKiByZXByZXNlbnRhdGlvbiBtYXAgdG8gYHRleHQvcGxhaW5gIGJsb2IgYXR0YWNobWVudHMuXG5cdCAqXG5cdCAqIEFueSBSZXNvdXJjZSBhdHRhY2htZW50IGNhcnJ5aW5nIGEge0BsaW5rIFRleHRTZWxlY3Rpb259IChlLmcuIGBkaXNwbGF5S2luZCA9PT0gJ3NlbGVjdGlvbidgIG9yIGAnc3ltYm9sJ2ApIGlzXG5cdCAqIG1hcHBlZCB0byB0aGUgU0RLJ3MgYHNlbGVjdGlvbmAgdmFyaWFudCBzbyB0aGUgcmFuZ2Ugc3Vydml2ZXMgdGhlIHJvdW5kLXRyaXAgXHUyMDE0IGtleWluZyBvZmYgdGhlIGBzZWxlY3Rpb25gIGZpZWxkXG5cdCAqIHJhdGhlciB0aGFuIGp1c3QgYGRpc3BsYXlLaW5kYCBhdm9pZHMgc3ltYm9sIGF0dGFjaG1lbnRzIGRlZ3JhZGluZyB0byBhIHBsYWluIGZpbGUgcmVmZXJlbmNlICgjMzE1MTkzKS4gRm9yIHRob3NlXG5cdCAqIHdlIHJlYWQgdGhlIHJlc291cmNlIGNvbnRlbnQgZnJvbSBkaXNrIGFuZCBzbGljZSBpdCBieSB0aGUgY2FycmllZCByYW5nZSAodGhlIHByb3RvY29sJ3Mge0BsaW5rIFRleHRTZWxlY3Rpb259XG5cdCAqIG9ubHkgY2FycmllcyB0aGUgcmFuZ2UsIG5vdCB0aGUgaW5saW5lIHRleHQpOyBvbiByZWFkIGZhaWx1cmUgdGhlIHNlbGVjdGlvbiBkb3duZ3JhZGVzIHRvIGEgcGxhaW4gZmlsZSByZWZlcmVuY2UuXG5cdCAqIEEgdGV4dHVhbCBlbWJlZGRlZCByZXNvdXJjZSBhbHJlYWR5IGNhcnJpZXMgdGhlIGV4YWN0IGlubGluZSB0ZXh0IHRvIHNlbmQgKHRoZSB3aG9sZSBsaXZlIGJ1ZmZlciBmb3IgYSBkb2N1bWVudCxcblx0ICogb3IganVzdCB0aGUgc2VsZWN0ZWQgdGV4dCBmb3IgYSBzZWxlY3Rpb24pLCBzbyBpdCBpcyBmb3J3YXJkZWQgYXMtaXMgd2l0aG91dCBmdXJ0aGVyIHNsaWNpbmcuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF90b1Nka0F0dGFjaG1lbnQoYXR0YWNobWVudDogTWVzc2FnZUF0dGFjaG1lbnQpOiBQcm9taXNlPENvcGlsb3RTZGtBdHRhY2htZW50IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKGlzQWdlbnRGZWVkYmFja0Fubm90YXRpb25zQXR0YWNobWVudChhdHRhY2htZW50KSkge1xuXHRcdFx0Y29uc3QgcmVuZGVyZWQgPSByZW5kZXJBZ2VudEZlZWRiYWNrQW5ub3RhdGlvbnNBdHRhY2htZW50KGF0dGFjaG1lbnQpO1xuXHRcdFx0aWYgKCFyZW5kZXJlZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogJ2Jsb2InIGFzIGNvbnN0LFxuXHRcdFx0XHRkYXRhOiBlbmNvZGVCYXNlNjQoVlNCdWZmZXIuZnJvbVN0cmluZyhyZW5kZXJlZCkpLFxuXHRcdFx0XHRtaW1lVHlwZTogYWRkQXR0YWNobWVudERpc3BsYXlLaW5kVG9NaW1lVHlwZShhdHRhY2htZW50LmRpc3BsYXlLaW5kKSxcblx0XHRcdFx0ZGlzcGxheU5hbWU6IGF0dGFjaG1lbnQubGFiZWwsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRpZiAoYXR0YWNobWVudC50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlKSB7XG5cdFx0XHRpZiAoYXR0YWNobWVudC5tb2RlbFJlcHJlc2VudGF0aW9uKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dHlwZTogJ2Jsb2InIGFzIGNvbnN0LFxuXHRcdFx0XHRcdGRhdGE6IGVuY29kZUJhc2U2NChWU0J1ZmZlci5mcm9tU3RyaW5nKGF0dGFjaG1lbnQubW9kZWxSZXByZXNlbnRhdGlvbikpLFxuXHRcdFx0XHRcdG1pbWVUeXBlOiBhZGRTaW1wbGVBdHRhY2htZW50RGlzcGxheUtpbmRUb01pbWVUeXBlKGF0dGFjaG1lbnQpLFxuXHRcdFx0XHRcdGRpc3BsYXlOYW1lOiBhdHRhY2htZW50LmxhYmVsLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKGF0dGFjaG1lbnQudHlwZSA9PT0gTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkVtYmVkZGVkUmVzb3VyY2UpIHtcblx0XHRcdHJldHVybiB7IHR5cGU6ICdibG9iJyBhcyBjb25zdCwgZGF0YTogYXR0YWNobWVudC5kYXRhLCBtaW1lVHlwZTogYXR0YWNobWVudC5jb250ZW50VHlwZSwgZGlzcGxheU5hbWU6IGF0dGFjaG1lbnQubGFiZWwgfTtcblx0XHR9XG5cdFx0aWYgKGF0dGFjaG1lbnQudHlwZSAhPT0gTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoYXR0YWNobWVudC51cmkpO1xuXHRcdGNvbnN0IHBhdGggPSB1cmkuc2NoZW1lID09PSAnZmlsZScgPyB1cmkuZnNQYXRoIDogdXJpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBhdHRhY2htZW50LmxhYmVsID8/IHBhdGg7XG5cdFx0aWYgKGF0dGFjaG1lbnQuc2VsZWN0aW9uKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gYXdhaXQgdGhpcy5fcmVhZFNlbGVjdGVkVGV4dCh1cmksIGF0dGFjaG1lbnQuc2VsZWN0aW9uLnJhbmdlKTtcblx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ3NlbGVjdGlvbicgYXMgY29uc3QsIGZpbGVQYXRoOiBwYXRoLCBkaXNwbGF5TmFtZSwgdGV4dCwgc2VsZWN0aW9uOiBhdHRhY2htZW50LnNlbGVjdGlvbi5yYW5nZSB9O1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEZhaWxlZCB0byByZWFkIHNlbGVjdGVkIHRleHQgZm9yICR7dXJpLnRvU3RyaW5nKCl9OiAke2Vycn1gKTtcblx0XHRcdFx0cmV0dXJuIHsgdHlwZTogJ2ZpbGUnIGFzIGNvbnN0LCBwYXRoLCBkaXNwbGF5TmFtZSB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoYXR0YWNobWVudC5kaXNwbGF5S2luZCA9PT0gJ3NlbGVjdGlvbicpIHtcblx0XHRcdHJldHVybiB7IHR5cGU6ICdmaWxlJyBhcyBjb25zdCwgcGF0aCwgZGlzcGxheU5hbWUgfTtcblx0XHR9XG5cdFx0Y29uc3QgdHlwZSA9IGF0dGFjaG1lbnQuZGlzcGxheUtpbmQgPT09ICdkaXJlY3RvcnknID8gJ2RpcmVjdG9yeScgOiAnZmlsZSc7XG5cdFx0cmV0dXJuIHsgdHlwZSwgcGF0aCwgZGlzcGxheU5hbWUgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlYWRTZWxlY3RlZFRleHQodXJpOiBVUkksIHJhbmdlOiB7IHJlYWRvbmx5IHN0YXJ0OiB7IHJlYWRvbmx5IGxpbmU6IG51bWJlcjsgcmVhZG9ubHkgY2hhcmFjdGVyOiBudW1iZXIgfTsgcmVhZG9ubHkgZW5kOiB7IHJlYWRvbmx5IGxpbmU6IG51bWJlcjsgcmVhZG9ubHkgY2hhcmFjdGVyOiBudW1iZXIgfSB9KTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUodXJpKTtcblx0XHRjb25zdCB0ZXh0ID0gY29udGVudC52YWx1ZS50b1N0cmluZygpO1xuXHRcdC8vIEFIUCBjYXJyaWVzIHRoZSByZXNvdXJjZSByYW5nZTsgdGhlIHB1YmxpYyBTREsgY2FuIGNhcnJ5IHRoZSBzZWxlY3RlZCB0ZXh0IHRvby5cblx0XHQvLyBUaGlzIHJlYWRzIHRoZSByZXNvdXJjZSBVUkksIHNvIHVuc2F2ZWQgZWRpdG9yIGNoYW5nZXMgYXJlIG5vdCBpbmNsdWRlZC5cblx0XHRjb25zdCBsaW5lcyA9IHNwbGl0TGluZXNJbmNsdWRlU2VwYXJhdG9ycyh0ZXh0KTtcblx0XHRjb25zdCBzdGFydCA9IHRoaXMuX2dldE9mZnNldEF0KGxpbmVzLCByYW5nZS5zdGFydCk7XG5cdFx0Y29uc3QgZW5kID0gdGhpcy5fZ2V0T2Zmc2V0QXQobGluZXMsIHJhbmdlLmVuZCk7XG5cdFx0cmV0dXJuIHRleHQuc3Vic3RyaW5nKHN0YXJ0LCBNYXRoLm1heChzdGFydCwgZW5kKSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRPZmZzZXRBdChsaW5lczogcmVhZG9ubHkgc3RyaW5nW10sIHBvc2l0aW9uOiB7IHJlYWRvbmx5IGxpbmU6IG51bWJlcjsgcmVhZG9ubHkgY2hhcmFjdGVyOiBudW1iZXIgfSk6IG51bWJlciB7XG5cdFx0Y29uc3QgbGluZSA9IE1hdGgubWF4KDAsIE1hdGgubWluKHBvc2l0aW9uLmxpbmUsIGxpbmVzLmxlbmd0aCAtIDEpKTtcblx0XHRsZXQgb2Zmc2V0ID0gMDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxpbmU7IGkrKykge1xuXHRcdFx0b2Zmc2V0ICs9IGxpbmVzW2ldLmxlbmd0aDtcblx0XHR9XG5cdFx0Y29uc3QgbGluZVRleHQgPSBsaW5lc1tsaW5lXS5yZXBsYWNlKC9cXHJcXG58XFxyfFxcbiQvLCAnJyk7XG5cdFx0cmV0dXJuIG9mZnNldCArIE1hdGgubWF4KDAsIE1hdGgubWluKHBvc2l0aW9uLmNoYXJhY3RlciwgbGluZVRleHQubGVuZ3RoKSk7XG5cdH1cblxuXHQvKipcblx0ICogUHVzaGVzIGBtb2RlYCB0byB0aGUgU0RLIHZpYSBgcnBjLm1vZGUuc2V0YCBpZiBpdCBkaWZmZXJzIGZyb20gdGhlXG5cdCAqIGxhc3QgYXBwbGllZCB2YWx1ZS4gRmFpbHVyZXMgYXJlIGxvZ2dlZCBhbmQgc3dhbGxvd2VkIHNvIHRoYXQgbW9kZVxuXHQgKiBwcm9wYWdhdGlvbiBkb2VzIG5vdCBibG9jayB0aGUgdHVybi5cblx0ICovXG5cdGFzeW5jIGFwcGx5TW9kZShtb2RlOiBDb3BpbG90U2RrTW9kZSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghbW9kZSB8fCBtb2RlID09PSB0aGlzLl9sYXN0QXBwbGllZE1vZGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX3dyYXBwZXIuc2Vzc2lvbi5ycGMubW9kZS5zZXQoeyBtb2RlIH0pO1xuXHRcdFx0dGhpcy5fbGFzdEFwcGxpZWRNb2RlID0gbW9kZTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIHJwYy5tb2RlLnNldCBzdWNjZWVkZWQ6IG1vZGU9JHttb2RlfWApO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIsIGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gcnBjLm1vZGUuc2V0IGZhaWxlZDogbW9kZT0ke21vZGV9YCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIGB0cnVlYCB3aGVuIHRoZSBzZXNzaW9uJ3MgZWZmZWN0aXZlIGBtb2RlYCBpcyBgYXV0b3BpbG90YCBcdTIwMTQgdGhlXG5cdCAqIGF1dG9ub21vdXMsIGNvbnRpbnVlLXVudGlsLWRvbmUgbW9kZSBpbiB3aGljaCBubyB1c2VyIGlzIGF2YWlsYWJsZSB0b1xuXHQgKiBhbnN3ZXIgcXVlc3Rpb25zIG9yIGZpbGwgaW4gZWxpY2l0YXRpb24gZm9ybXMuXG5cdCAqL1xuXHRwcml2YXRlIF9pc0F1dG9waWxvdE1vZGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEVmZmVjdGl2ZVZhbHVlKHRoaXMuX293bmVyU2Vzc2lvblVyaS50b1N0cmluZygpLCBwbGF0Zm9ybVNlc3Npb25TY2hlbWEsIFNlc3Npb25Db25maWdLZXkuTW9kZSkgPT09ICdhdXRvcGlsb3QnO1xuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgVlMgQ29kZSdzIGF1dG8tcmVwbHkgc2V0dGluZyBpcyBlbmFibGVkIGluIHRoZSByb290IGNvbmZpZy5cblx0ICovXG5cdHByaXZhdGUgX2lzQXV0b1JlcGx5RW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKHBsYXRmb3JtUm9vdFNjaGVtYSwgQWdlbnRIb3N0QXV0b1JlcGx5RW5hYmxlZENvbmZpZ0tleSkgPT09IHRydWU7XG5cdH1cblxuXHRhc3luYyBzZW5kU3RlZXJpbmcoc3RlZXJpbmdNZXNzYWdlOiBQZW5kaW5nTWVzc2FnZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9zdGVlcmluZ01lc3NhZ2VzSW5GbGlnaHQuaGFzKHN0ZWVyaW5nTWVzc2FnZS5pZCkgfHwgdGhpcy5fcGVuZGluZ1N0ZWVyaW5nRmxpcHMuaGFzKHN0ZWVyaW5nTWVzc2FnZS5pZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc3RlZXJpbmdNZXNzYWdlc0luRmxpZ2h0LmFkZChzdGVlcmluZ01lc3NhZ2UuaWQpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIFNlbmRpbmcgc3RlZXJpbmcgbWVzc2FnZTogXCIke3N0ZWVyaW5nTWVzc2FnZS5tZXNzYWdlLnRleHQuc3Vic3RyaW5nKDAsIDEwMCl9XCJgKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVjb25jaWxlTWNwU2VydmVyRW5hYmxlbWVudCgpO1xuXHRcdFx0dGhpcy5fcGVuZGluZ1N0ZWVyaW5nRmxpcHMuc2V0KHN0ZWVyaW5nTWVzc2FnZS5pZCwgc3RlZXJpbmdNZXNzYWdlKTtcblx0XHRcdGNvbnN0IHNka0F0dGFjaG1lbnRzID0gYXdhaXQgdGhpcy5fdG9TZGtBdHRhY2htZW50cyhzdGVlcmluZ01lc3NhZ2UubWVzc2FnZS5hdHRhY2htZW50cyk7XG5cdFx0XHRhd2FpdCB0aGlzLl93cmFwcGVyLnNlc3Npb24uc2VuZCh7XG5cdFx0XHRcdHByb21wdDogc3RlZXJpbmdNZXNzYWdlLm1lc3NhZ2UudGV4dCxcblx0XHRcdFx0YXR0YWNobWVudHM6IHNka0F0dGFjaG1lbnRzPy5sZW5ndGggPyBzZGtBdHRhY2htZW50cyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0bW9kZTogJ2ltbWVkaWF0ZScsXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdTdGVlcmluZ0ZsaXBzLmRlbGV0ZShzdGVlcmluZ01lc3NhZ2UuaWQpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIFN0ZWVyaW5nIG1lc3NhZ2UgZmFpbGVkYCwgZXJyKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fc3RlZXJpbmdNZXNzYWdlc0luRmxpZ2h0LmRlbGV0ZShzdGVlcmluZ01lc3NhZ2UuaWQpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGdldE1lc3NhZ2VzKCk6IFByb21pc2U8cmVhZG9ubHkgVHVybltdPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fZ2V0TWFwcGVkRXZlbnRzKCk7XG5cdFx0cmV0dXJuIHJlc3VsdC50dXJucztcblx0fVxuXG5cdGFzeW5jIGdldFN1YmFnZW50TWVzc2FnZXMocGFyZW50VG9vbENhbGxJZDogc3RyaW5nKTogUHJvbWlzZTxyZWFkb25seSBUdXJuW10+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9nZXRNYXBwZWRFdmVudHMoKTtcblx0XHRjb25zdCB0dXJucyA9IHJlc3VsdC5zdWJhZ2VudFR1cm5zQnlUb29sQ2FsbElkLmdldChwYXJlbnRUb29sQ2FsbElkKSA/PyBbXTtcblx0XHRyZXR1cm4gdHVybnM7XG5cdH1cblxuXHQvKipcblx0ICogTWVtb2l6ZWQgYGdldEV2ZW50cygpYCArIHtAbGluayBtYXBTZXNzaW9uRXZlbnRzfSByZXN1bHQsIHNoYXJlZCBieVxuXHQgKiB7QGxpbmsgZ2V0TWVzc2FnZXN9IGFuZCB7QGxpbmsgZ2V0U3ViYWdlbnRNZXNzYWdlc30uIEEgc2luZ2xlIHNlc3Npb24gb3BlbiByZWFkcyBhbmRcblx0ICogcmVjb25zdHJ1Y3RzIHRoZSBmdWxsIHBhcmVudCBldmVudCBsb2cgb25jZSBpbnN0ZWFkIG9mIG9uY2UgcGVyXG5cdCAqIHN1YmFnZW50LiBUaGUgbWVtbyBpcyBzY29wZWQgdG8gdGhlIHJlc3VtZS9yZXN0b3JlIHdhdmU6IGl0IGlzIGRyb3BwZWRcblx0ICogd2hlbmV2ZXIgdGhlIHBlcnNpc3RlZCBldmVudCBsb2cgY291bGQgY2hhbmdlIChzZWVcblx0ICoge0BsaW5rIF9pbnZhbGlkYXRlTWFwcGVkRXZlbnRzfSkgYW5kIG9uIGRpc3Bvc2UsIHNvIGl0IG5ldmVyIHNlcnZlc1xuXHQgKiBzdGFsZSB0dXJucyBmb3IgYW4gYWN0aXZlbHktcnVubmluZyBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfbWFwcGVkRXZlbnRzTWVtbzogUHJvbWlzZTxJTWFwcGVkU2Vzc2lvbkV2ZW50cz4gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfZ2V0TWFwcGVkRXZlbnRzKCk6IFByb21pc2U8SU1hcHBlZFNlc3Npb25FdmVudHM+IHtcblx0XHRpZiAoIXRoaXMuX21hcHBlZEV2ZW50c01lbW8pIHtcblx0XHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLl9jb21wdXRlTWFwcGVkRXZlbnRzKCk7XG5cdFx0XHR0aGlzLl9tYXBwZWRFdmVudHNNZW1vID0gcGVuZGluZztcblx0XHRcdC8vIERvbid0IGNhY2hlIGEgcmVqZWN0ZWQgcmVjb25zdHJ1Y3Rpb24gXHUyMDE0IGxldCB0aGUgbmV4dCBjYWxsZXIgcmV0cnkuXG5cdFx0XHRwZW5kaW5nLmNhdGNoKCgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuX21hcHBlZEV2ZW50c01lbW8gPT09IHBlbmRpbmcpIHtcblx0XHRcdFx0XHR0aGlzLl9tYXBwZWRFdmVudHNNZW1vID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21hcHBlZEV2ZW50c01lbW87XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jb21wdXRlTWFwcGVkRXZlbnRzKCk6IFByb21pc2U8SU1hcHBlZFNlc3Npb25FdmVudHM+IHtcblx0XHRjb25zdCBldmVudHMgPSBhd2FpdCB0aGlzLl93cmFwcGVyLnNlc3Npb24uZ2V0RXZlbnRzKCk7XG5cdFx0bGV0IGRiOiBJU2Vzc2lvbkRhdGFiYXNlIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRkYiA9IHRoaXMuX2RhdGFiYXNlUmVmLm9iamVjdDtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIERhdGFiYXNlIG1heSBub3QgZXhpc3QgeWV0IFx1MjAxNCB0aGF0J3MgZmluZVxuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHRoaXMuX3N0b3JhZ2VVcmksIGRiLCBldmVudHMsIHtcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHRoaXMuX3dvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRtb2RlbDogdGhpcy5fbGF1bmNoUGxhbi5raW5kID09PSAnY3JlYXRlJ1xuXHRcdFx0XHQ/IHRoaXMuX2xhdW5jaFBsYW4ubW9kZWxcblx0XHRcdFx0OiB0aGlzLl9sYXVuY2hQbGFuLmZhbGxiYWNrLm1vZGVsLFxuXHRcdH0pO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKiogRHJvcCB0aGUgbWVtb2l6ZWQgZXZlbnQgcmVjb25zdHJ1Y3Rpb247IHRoZSBuZXh0IHJlYWQgcmVidWlsZHMgaXQuICovXG5cdHByaXZhdGUgX2ludmFsaWRhdGVNYXBwZWRFdmVudHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fbWFwcGVkRXZlbnRzTWVtbyA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGFib3J0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEFib3J0aW5nIHNlc3Npb24uLi5gKTtcblx0XHR0aGlzLl9iZWdpbkFib3J0KCk7XG5cdFx0dGhpcy5fZHJhaW5QZW5kaW5nU3RlZXJpbmdGbGlwcygpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl93cmFwcGVyLnNlc3Npb24uYWJvcnQoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fcmVzZXRBYm9ydFRva2VuKCk7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQWJvcnRzIGJlZm9yZSB0ZWFyaW5nIGRvd24gc28gdGhhdCBpbi1mbGlnaHQge0BsaW5rIF9ndWFyZGVkfSBjYWxsYmFja3Ncblx0ICogc2V0dGxlIHJhdGhlciB0aGFuIGhhbmc6IGRpc3Bvc2luZyB0aGUge0BsaW5rIF9hYm9ydEN0c30gd291bGQgZHJvcCBlYWNoXG5cdCAqIHJhY2luZyBgb25DYW5jZWxsYXRpb25SZXF1ZXN0ZWRgIGxpc3RlbmVyIHdpdGhvdXQgZXZlciBmaXJpbmcgaXQsIGxlYXZpbmdcblx0ICogYSBjYWxsYmFjayB0aGF0IHBhcmtzIGl0cyBkZWZlcnJlZCBhZnRlciB0aGUgdGVhcmRvd24gc3dlZXAgd2l0aCBub3RoaW5nXG5cdCAqIGxlZnQgdG8gcmVzb2x2ZSBpdC4gVGhlIHN3ZWVwIHJlZ2lzdGVyZWQgaW4gdGhlIGNvbnN0cnVjdG9yIHN0YXlzIGFzIHRoZVxuXHQgKiBiYWNrc3RvcCwgc2luY2Uge0BsaW5rIF9iZWdpbkFib3J0fSBuby1vcHMgd2hlbiBhbHJlYWR5IGFib3J0ZWQuXG5cdCAqL1xuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHZvaWQgdGhpcy5fZWRpdFRyYWNrZXIuZmx1c2hBdHRyaWJ1dGlvbigpLmNhdGNoKGVycm9yID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEZhaWxlZCB0byBmbHVzaCBlZGl0IGF0dHJpYnV0aW9uOiAke2Vycm9yfWApO1xuXHRcdH0pO1xuXHRcdHRoaXMuX2JlZ2luQWJvcnQoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHQvKipcblx0ICogRXhwbGljaXRseSBkZXN0cm95cyB0aGUgdW5kZXJseWluZyBTREsgc2Vzc2lvbiBhbmQgd2FpdHMgZm9yIGNsZWFudXBcblx0ICogdG8gY29tcGxldGUuIENhbGwgdGhpcyBiZWZvcmUge0BsaW5rIGRpc3Bvc2V9IHdoZW4geW91IG5lZWQgdG8gZW5zdXJlXG5cdCAqIHRoZSBzZXNzaW9uJ3Mgb24tZGlzayBkYXRhIGlzIG5vIGxvbmdlciBsb2NrZWQgKGUuZy4gYmVmb3JlXG5cdCAqIHRydW5jYXRpb24gb3IgZm9yayBvcGVyYXRpb25zIHRoYXQgbW9kaWZ5IHRoZSBzZXNzaW9uIGZpbGVzKS5cblx0ICovXG5cdGFzeW5jIGRlc3Ryb3lTZXNzaW9uKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9lZGl0VHJhY2tlci5mbHVzaEF0dHJpYnV0aW9uKCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEZhaWxlZCB0byBmbHVzaCBlZGl0IGF0dHJpYnV0aW9uOiAke2Vycm9yfWApO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl93cmFwcGVyLmRpc2Nvbm5lY3QoKTtcblx0fVxuXG5cdGFzeW5jIHNldE1vZGVsKG1vZGVsOiBzdHJpbmcsIHJlYXNvbmluZ0VmZm9ydD86IFNlc3Npb25Db25maWdbJ3JlYXNvbmluZ0VmZm9ydCddLCBjb250ZXh0VGllcj86IFNlc3Npb25Db25maWdbJ2NvbnRleHRUaWVyJ10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBDaGFuZ2luZyBtb2RlbCB0bzogJHttb2RlbH1gKTtcblx0XHR0aGlzLl9sYXN0U2Vlbk1vZGVsSWQgPSBtb2RlbDtcblx0XHRhd2FpdCB0aGlzLl93cmFwcGVyLnNlc3Npb24uc2V0TW9kZWwobW9kZWwsIHsgcmVhc29uaW5nRWZmb3J0LCBjb250ZXh0VGllciB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEaXNwYXRjaGVzIGFuIE1DUCBKU09OLVJQQyBtZXRob2QgcmVjZWl2ZWQgb24gdGhlIGBtY3A6Ly9gIHNpZGVcblx0ICogY2hhbm5lbCB0byB0aGUgQ29waWxvdCBTREsncyBgc2Vzc2lvbi5ycGMubWNwLipgIHN1cmZhY2UuXG5cdCAqXG5cdCAqIE1hcHBpbmc6XG5cdCAqICAtIGB0b29scy9saXN0YCBcdTIxOTIgYHJwYy5tY3AuYXBwcy5saXN0VG9vbHNgXG5cdCAqICAtIGB0b29scy9jYWxsYCBcdTIxOTIgYHJwYy5tY3AuYXBwcy5jYWxsVG9vbGBcblx0ICogIC0gYHJlc291cmNlcy9yZWFkYCBcdTIxOTIgYHJwYy5tY3AuYXBwcy5yZWFkUmVzb3VyY2VgXG5cdCAqICAtIGByZXNvdXJjZXMvbGlzdGAgXHUyMTkyIGBycGMubWNwLmFwcHMubGlzdFJlc291cmNlc2AgKGVtcHR5IGxpc3QgZmFsbGJhY2spXG5cdCAqICAtIGByZXNvdXJjZXMvdGVtcGxhdGVzL2xpc3RgIFx1MjE5MiBgcnBjLm1jcC5hcHBzLmxpc3RSZXNvdXJjZVRlbXBsYXRlc2AgKGVtcHR5IGxpc3QgZmFsbGJhY2spXG5cdCAqICAtIGBzYW1wbGluZy9jcmVhdGVNZXNzYWdlYCBcdTIxOTIgYHJwYy5tY3AuZXhlY3V0ZVNhbXBsaW5nYFxuXHQgKlxuXHQgKiBPdGhlciBNQ1AgbWV0aG9kcyBhcmUgcmVqZWN0ZWQgd2l0aCBgTWV0aG9kIG5vdCBmb3VuZGAgKHRoZSBjYWxsZXJcblx0ICogdHJhbnNsYXRlcyB0aGF0IGludG8gYSBKU09OLVJQQyBgLTMyNjAxYCkuXG5cdCAqL1xuXHRhc3luYyBoYW5kbGVNY3BSZXF1ZXN0KHNlcnZlck5hbWU6IHN0cmluZywgbWV0aG9kOiBzdHJpbmcsIHBhcmFtczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRjb25zdCBhcHBzID0gdGhpcy5fd3JhcHBlci5zZXNzaW9uLnJwYy5tY3AuYXBwcztcblx0XHRzd2l0Y2ggKG1ldGhvZCkge1xuXHRcdFx0Y2FzZSAndG9vbHMvbGlzdCc6XG5cdFx0XHRcdHJldHVybiBhcHBzLmxpc3RUb29scyh7IHNlcnZlck5hbWUsIG9yaWdpblNlcnZlck5hbWU6IHNlcnZlck5hbWUgfSk7XG5cdFx0XHRjYXNlICd0b29scy9jYWxsJzoge1xuXHRcdFx0XHRjb25zdCBuYW1lID0gcGFyYW1zICYmIHR5cGVvZiBwYXJhbXNbJ25hbWUnXSA9PT0gJ3N0cmluZycgPyBwYXJhbXNbJ25hbWUnXSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKCFuYW1lKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGB0b29scy9jYWxsIG1pc3NpbmcgJ25hbWUnIHBhcmFtZXRlcmApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJhd0FyZ3MgPSBwYXJhbXMgPyBwYXJhbXNbJ2FyZ3VtZW50cyddIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBhcmdzID0gaXNPYmplY3QocmF3QXJncykgPyByYXdBcmdzIGFzIFJlY29yZDxzdHJpbmcsIEpzb25WYWx1ZT4gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdHJldHVybiBhcHBzLmNhbGxUb29sKHsgc2VydmVyTmFtZSwgdG9vbE5hbWU6IG5hbWUsIGFyZ3VtZW50czogYXJncywgb3JpZ2luU2VydmVyTmFtZTogc2VydmVyTmFtZSB9KTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3Jlc291cmNlcy9yZWFkJzoge1xuXHRcdFx0XHRjb25zdCB1cmkgPSBwYXJhbXMgJiYgdHlwZW9mIHBhcmFtc1sndXJpJ10gPT09ICdzdHJpbmcnID8gcGFyYW1zWyd1cmknXSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKCF1cmkpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYHJlc291cmNlcy9yZWFkIG1pc3NpbmcgJ3VyaScgcGFyYW1ldGVyYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGFwcHMucmVhZFJlc291cmNlKHsgc2VydmVyTmFtZSwgdXJpIH0pO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAncmVzb3VyY2VzL2xpc3QnOiB7XG5cdFx0XHRcdC8vIE5vdCBpbXBsZW1lbnRlZCBpbiB0aGUgU0RLIHlldFxuXHRcdFx0XHRyZXR1cm4geyByZXNvdXJjZXM6IFtdIH07XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdyZXNvdXJjZXMvdGVtcGxhdGVzL2xpc3QnOiB7XG5cdFx0XHRcdC8vIE5vdCBpbXBsZW1lbnRlZCBpbiB0aGUgU0RLIHlldFxuXHRcdFx0XHRyZXR1cm4geyByZXNvdXJjZVRlbXBsYXRlczogW10gfTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3NhbXBsaW5nL2NyZWF0ZU1lc3NhZ2UnOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5faGFuZGxlU2FtcGxpbmdDcmVhdGVNZXNzYWdlKHNlcnZlck5hbWUsIHBhcmFtcyk7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE1ldGhvZCBub3QgZm91bmQ6ICR7bWV0aG9kfWApO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHN0YXJ0TWNwU2VydmVyKGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXJ2ZXJOYW1lID0gdGhpcy5fbWNwQ3VzdG9taXphdGlvbnMuc2VydmVyTmFtZUZvckN1c3RvbWl6YXRpb25JZChpZCk7XG5cdFx0aWYgKCFzZXJ2ZXJOYW1lKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBDYW5ub3Qgc3RhcnQgdW5rbm93biBNQ1Agc2VydmVyIGN1c3RvbWl6YXRpb24gJHtpZH1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21jcFNlcnZlckxpZmVjeWNsZVNlcXVlbmNlci5xdWV1ZShzZXJ2ZXJOYW1lLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl93cmFwcGVyLnNlc3Npb24ucnBjLm1jcC5zdGFydFNlcnZlcih7IHNlcnZlck5hbWUgfSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHQvLyBSZWNvbmNpbGUgYWdhaW5zdCB0aGUgU0RLJ3MgcmVhbCBzdGF0ZS4gVGhlIGxpdmVcblx0XHRcdFx0Ly8gYHNlc3Npb24ubWNwX3NlcnZlcl9zdGF0dXNfY2hhbmdlZGAgc3RyZWFtIGFscmVhZHkgcmVwb3J0cyB0aGVcblx0XHRcdFx0Ly8gY29ubmVjdCAoYHBlbmRpbmdgIC0+IGBjb25uZWN0ZWRgL2BmYWlsZWRgKTsgdGhpcyBjb3ZlcnMgdGhlIGNhc2Vcblx0XHRcdFx0Ly8gd2hlcmUgdGhlIHN0YXJ0IHJlamVjdHMgYmVmb3JlIGFueSBzdGF0dXMgaXMgZW1pdHRlZC5cblx0XHRcdFx0dGhpcy5fc2VlZE1jcFNlcnZlcnNGcm9tUnBjKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWNvbmNpbGVNY3BTZXJ2ZXJFbmFibGVtZW50KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9tY3BFbmFibGVtZW50U2VxdWVuY2VyLnF1ZXVlKCgpID0+IHRoaXMuX2RvUmVjb25jaWxlTWNwU2VydmVyRW5hYmxlbWVudCgpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2RvUmVjb25jaWxlTWNwU2VydmVyRW5hYmxlbWVudCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkZXNpcmVkQ3VzdG9taXphdGlvbnMgPSB0aGlzLl9ob3N0Q3VzdG9taXphdGlvbnMoKTtcblx0XHRjb25zdCBkZXNpcmVkRW5hYmxlbWVudCA9IGdldFNka01jcFNlcnZlckVuYWJsZW1lbnQocmVzb2x2ZUN1c3RvbWl6YXRpb25FbmFibGVtZW50KFxuXHRcdFx0dGhpcy5fY3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdFx0dGhpcy5fb3duZXJTZXNzaW9uVXJpLFxuXHRcdFx0ZGVzaXJlZEN1c3RvbWl6YXRpb25zLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dGhpcy5fbWNwQ3VzdG9taXphdGlvbnMucGx1Z2luTWNwU2VydmVyU291cmNlcyxcblx0XHQpKTtcblx0XHRpZiAoZGVzaXJlZEVuYWJsZW1lbnQuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9yZWZyZXNoTWNwU2VydmVyc0Zyb21ScGMoKTtcblx0XHRsZXQgY2hhbmdlZCA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3Qgc2VydmVyIG9mIHRoaXMuX21jcEN1c3RvbWl6YXRpb25zLnNlcnZlckVuYWJsZW1lbnQoKSkge1xuXHRcdFx0Y29uc3QgZGVzaXJlZCA9IGRlc2lyZWRFbmFibGVtZW50LmdldChzZXJ2ZXIuY3VzdG9taXphdGlvbklkKTtcblx0XHRcdGlmIChkZXNpcmVkID09PSB1bmRlZmluZWQgfHwgZGVzaXJlZCA9PT0gc2VydmVyLmVuYWJsZWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAoZGVzaXJlZCkge1xuXHRcdFx0XHRcdC8vIFJlLWVuYWJsaW5nIHJlc3RhcnRzIHRoZSBzZXJ2ZXIuIFRoZSBTREsgcmVwb3J0cyB0aGVcblx0XHRcdFx0XHQvLyBjb25uZWN0IGxpdmUgKGBwZW5kaW5nYCAtPiBgY29ubmVjdGVkYC9gZmFpbGVkYCksIHNvIG5vXG5cdFx0XHRcdFx0Ly8gb3B0aW1pc3RpYyBzdGF0ZSBpcyB3cml0dGVuIGhlcmUuIE1hcmsgYGNoYW5nZWRgIG5vd1xuXHRcdFx0XHRcdC8vIChiZWZvcmUgdGhlIGVuYWJsZSkgc28gdGhlIHRyYWlsaW5nIHJlZnJlc2ggYWx3YXlzIHJ1bnNcblx0XHRcdFx0XHQvLyBldmVuIGlmIHRoZSBlbmFibGUgcmVqZWN0cy5cblx0XHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl93cmFwcGVyLnNlc3Npb24ucnBjLm1jcC5lbmFibGUoeyBzZXJ2ZXJOYW1lOiBzZXJ2ZXIuc2VydmVyTmFtZSB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9kaXNhYmxlTWNwU2VydmVyKHNlcnZlci5zZXJ2ZXJOYW1lKTtcblx0XHRcdFx0XHRjaGFuZ2VkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGUsIGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gRmFpbGVkIHRvICR7ZGVzaXJlZCA/ICdlbmFibGUnIDogJ2Rpc2FibGUnfSBNQ1Agc2VydmVyICR7c2VydmVyLnNlcnZlck5hbWV9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChjaGFuZ2VkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZWZyZXNoTWNwU2VydmVyc0Zyb21ScGMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kaXNhYmxlTWNwU2VydmVyKHNlcnZlck5hbWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIGRpc2FibGUoKSBoYW5ncyB1bnRpbCBwZW5kaW5nIGF1dGggcmVxdWVzdHMgaGF2ZSByZXNvbHZlZC5cblx0XHQvLyByZXBvcnRlZCB0byB0aGUgU0RLIGZvbGtzIHRob3VnaCBhcmd1YWJsZSB3aGV0aGVyIGl0J3MgYSBidWcgb3Igbm90Li4uXG5cdFx0dGhpcy5fY2FuY2VsUGVuZGluZ01jcEF1dGhSZXF1ZXN0c0ZvclNlcnZlcihzZXJ2ZXJOYW1lKTtcblx0XHRhd2FpdCB0aGlzLl93cmFwcGVyLnNlc3Npb24ucnBjLm1jcC5kaXNhYmxlKHsgc2VydmVyTmFtZSB9KTtcblx0fVxuXG5cdGFzeW5jIHN0b3BNY3BTZXJ2ZXIoaWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlcnZlck5hbWUgPSB0aGlzLl9tY3BDdXN0b21pemF0aW9ucy5zZXJ2ZXJOYW1lRm9yQ3VzdG9taXphdGlvbklkKGlkKTtcblx0XHRpZiAoIXNlcnZlck5hbWUpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIENhbm5vdCBzdG9wIHVua25vd24gTUNQIHNlcnZlciBjdXN0b21pemF0aW9uICR7aWR9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9tY3BTZXJ2ZXJMaWZlY3ljbGVTZXF1ZW5jZXIucXVldWUoc2VydmVyTmFtZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy5fd3JhcHBlci5zZXNzaW9uLnJwYy5tY3Auc3RvcFNlcnZlcih7IHNlcnZlck5hbWUgfSk7XG5cdFx0XHR0aGlzLl9tY3BDdXN0b21pemF0aW9ucy5hcHBseU9uZSh7IG5hbWU6IHNlcnZlck5hbWUsIHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5TdG9wcGVkIH0gfSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogRm9yd2FyZHMgYW4gQXBwXHUyMTkyaG9zdCBgc2FtcGxpbmcvY3JlYXRlTWVzc2FnZWAgcmVxdWVzdCByZWNlaXZlZFxuXHQgKiBvdmVyIHRoZSBBSFAgYG1jcDovL2AgY2hhbm5lbCB0byBgcnBjLm1jcC5leGVjdXRlU2FtcGxpbmdgLiBUaGVcblx0ICogQ29waWxvdCBydW50aW1lIG93bnMgdGhlIE1DUFx1MjE5MmNoYXQtY29tcGxldGlvbiBjb252ZXJzaW9uIGFuZCB0aGVcblx0ICogc2FtcGxpbmcgcmVzcG9uc2Ugc2hhcGUsIHNvIHdlIHBhc3MgdGhlIHJhdyBNQ1AgcGFyYW1zIHRocm91Z2hcblx0ICogdW50b3VjaGVkIGFuZCByZXR1cm4gdGhlIFNESydzIHJlc3VsdCBkaXJlY3RseS5cblx0ICpcblx0ICogUmVzb2x2ZXMgdGhlIEpTT04tUlBDIHJlcXVlc3Qgd2l0aCB0aGUgYENyZWF0ZU1lc3NhZ2VSZXN1bHRgIG9uXG5cdCAqIHN1Y2Nlc3MgYW5kIHJlamVjdHMgb24gZmFpbHVyZS9jYW5jZWxsYXRpb24sIG1pcnJvcmluZyB0aGVcblx0ICogYHNhbXBsaW5nL2NyZWF0ZU1lc3NhZ2VgIE1DUCBjb250cmFjdC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZVNhbXBsaW5nQ3JlYXRlTWVzc2FnZShzZXJ2ZXJOYW1lOiBzdHJpbmcsIHBhcmFtczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQpOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRpZiAoIXBhcmFtcykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBzYW1wbGluZy9jcmVhdGVNZXNzYWdlIG1pc3NpbmcgcGFyYW1zYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVxdWVzdElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgbWNwUmVxdWVzdElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0dGhpcy5fcGVuZGluZ01jcFNhbXBsaW5ncy5hZGQocmVxdWVzdElkKTtcblx0XHR0cnkge1xuXHRcdFx0dHlwZSBNY3BFeGVjdXRlU2FtcGxpbmdQYXJhbXMgPSBQYXJhbWV0ZXJzPHR5cGVvZiB0aGlzLl93cmFwcGVyLnNlc3Npb24ucnBjLm1jcC5leGVjdXRlU2FtcGxpbmc+WzBdO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fd3JhcHBlci5zZXNzaW9uLnJwYy5tY3AuZXhlY3V0ZVNhbXBsaW5nKHtcblx0XHRcdFx0cmVxdWVzdElkLFxuXHRcdFx0XHRzZXJ2ZXJOYW1lLFxuXHRcdFx0XHRtY3BSZXF1ZXN0SWQ6IG1jcFJlcXVlc3RJZCBhcyB1bmtub3duIGFzIE1jcEV4ZWN1dGVTYW1wbGluZ1BhcmFtc1snbWNwUmVxdWVzdElkJ10sXG5cdFx0XHRcdHJlcXVlc3Q6IHBhcmFtcyxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKHJlc3VsdC5hY3Rpb24gPT09ICdzdWNjZXNzJykge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0LnJlc3VsdCA/PyBudWxsO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBzYW1wbGluZy9jcmVhdGVNZXNzYWdlICR7cmVzdWx0LmFjdGlvbn0ke3Jlc3VsdC5lcnJvciA/IGA6ICR7cmVzdWx0LmVycm9yfWAgOiAnJ31gKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fcGVuZGluZ01jcFNhbXBsaW5ncy5kZWxldGUocmVxdWVzdElkKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU2VsZWN0cyAob3IgY2xlYXJzKSBhIGN1c3RvbSBhZ2VudCBvbiB0aGUgbGl2ZSBTREsgc2Vzc2lvbi5cblx0ICogTWlycm9ycyB0aGUgU0RLJ3MgYHJwYy5hZ2VudC5zZWxlY3RgIC8gYHJwYy5hZ2VudC5kZXNlbGVjdGAgcGFpci5cblx0ICovXG5cdGFzeW5jIHNldEFnZW50KGFnZW50TmFtZT86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChhZ2VudE5hbWUpIHtcblx0XHRcdGNvbnN0IG5hbWUgPSBhZ2VudE5hbWU7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBTZWxlY3RpbmcgY3VzdG9tIGFnZW50OiAke25hbWV9YCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl93cmFwcGVyLnNlc3Npb24ucnBjLmFnZW50LnNlbGVjdCh7IG5hbWUgfSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIsIGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gcnBjLmFnZW50LnNlbGVjdCBmYWlsZWQ6IG5hbWU9JHtuYW1lfWApO1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIENsZWFyaW5nIGN1c3RvbSBhZ2VudCBzZWxlY3Rpb25gKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3dyYXBwZXIuc2Vzc2lvbi5ycGMuYWdlbnQuZGVzZWxlY3QoKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVyciwgYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBycGMuYWdlbnQuZGVzZWxlY3QgZmFpbGVkYCk7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyAtLS0tIHBlcm1pc3Npb24gaGFuZGxpbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgYSBwZXJtaXNzaW9uIHJlcXVlc3QgZnJvbSB0aGUgU0RLIGJ5IGZpcmluZyBhIGB0b29sX3JlYWR5YCBldmVudFxuXHQgKiAod2hpY2ggdHJhbnNpdGlvbnMgdGhlIHRvb2wgdG8gUGVuZGluZ0NvbmZpcm1hdGlvbikgYW5kIHdhaXRpbmcgZm9yIHRoZVxuXHQgKiBzaWRlLWVmZmVjdHMgbGF5ZXIgdG8gcmVzcG9uZCB2aWEge0BsaW5rIHJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0fS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZVBlcm1pc3Npb25SZXF1ZXN0KFxuXHRcdHJlcXVlc3Q6IFBlcm1pc3Npb25SZXF1ZXN0LFxuXHQpOiBQcm9taXNlPFBlcm1pc3Npb25SZXF1ZXN0UmVzdWx0PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHRvb2xDYWxsSWQgPSByZXF1ZXN0LnRvb2xDYWxsSWQ7XG5cdFx0XHRpZiAoIXRvb2xDYWxsSWQpIHtcblx0XHRcdFx0Ly8gVE9ETzogaGFuZGxlIHBlcm1pc3Npb24gcmVxdWVzdHMgd2l0aG91dCBhIHRvb2xDYWxsSWQgYnkgY3JlYXRpbmcgYSBzeW50aGV0aWMgdG9vbCBjYWxsXG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIFBlcm1pc3Npb24gcmVxdWVzdCB3aXRob3V0IHRvb2xDYWxsSWQsIGF1dG8tZGVueWluZzoga2luZD0ke3JlcXVlc3Qua2luZH1gKTtcblx0XHRcdFx0cmV0dXJuIHsga2luZDogJ3JlamVjdCcgfTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl91bnJvdXRhYmxlU3ViYWdlbnRUb29sQ2FsbElkcy5kZWxldGUodG9vbENhbGxJZCkpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIFJlamVjdGluZyBwZXJtaXNzaW9uIHJlcXVlc3QgZm9yIHVucm91dGFibGUgc3ViYWdlbnQgdG9vbCBjYWxsOiB0b29sQ2FsbElkPSR7dG9vbENhbGxJZH0sIGtpbmQ9JHtyZXF1ZXN0LmtpbmR9YCk7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdyZWplY3QnIH07XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1hbmFnZWRBcHByb3ZhbFJlcXVpcmVkID0gcmVxdWVzdC5tYW5hZ2VkQXBwcm92YWxSZXF1aXJlZCA9PT0gdHJ1ZTtcblx0XHRcdGNvbnN0IHJlcXVlc3RTYW5kYm94QnlwYXNzID0gcmVxdWVzdC5raW5kID09PSAnc2hlbGwnIHx8IHJlcXVlc3Qua2luZCA9PT0gJ3dyaXRlJyB8fCByZXF1ZXN0LmtpbmQgPT09ICdyZWFkJyB8fCByZXF1ZXN0LmtpbmQgPT09ICd1cmwnXG5cdFx0XHRcdD8gcmVxdWVzdC5yZXF1ZXN0U2FuZGJveEJ5cGFzc1xuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGF1dG9BcHByb3ZhbCA9ICFtYW5hZ2VkQXBwcm92YWxSZXF1aXJlZCAmJiB0aGlzLl9sYXN0QXBwbGllZFBlcm1pc3Npb25Nb2RlID09PSAnYXV0bydcblx0XHRcdFx0PyBhd2FpdCB0aGlzLl90YWtlQXV0b0FwcHJvdmFsKHRvb2xDYWxsSWQpXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcmVjb21tZW5kYXRpb24gPSBhdXRvQXBwcm92YWw/LnJlY29tbWVuZGF0aW9uO1xuXHRcdFx0aWYgKHJlY29tbWVuZGF0aW9uID09PSAnYXBwcm92ZScgJiYgIXJlcXVlc3RTYW5kYm94QnlwYXNzKSB7XG5cdFx0XHRcdGlmIChyZXF1ZXN0LmtpbmQgPT09ICdjdXN0b20tdG9vbCdcblx0XHRcdFx0XHQmJiB0eXBlb2YgcmVxdWVzdC50b29sTmFtZSA9PT0gJ3N0cmluZydcblx0XHRcdFx0XHQmJiB0aGlzLl9jbGllbnRUb29sTmFtZXMuaGFzKHRoaXMuX2NsaWVudFRvb2xOYW1lKHJlcXVlc3QudG9vbE5hbWUpKVxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHRjb25zdCB0cmFja2VkVG9vbENhbGwgPSB0aGlzLl9hY3RpdmVUb29sQ2FsbHMuZ2V0KHRvb2xDYWxsSWQpO1xuXHRcdFx0XHRcdGNvbnN0IGRpc3BsYXlOYW1lID0gdHJhY2tlZFRvb2xDYWxsPy5kaXNwbGF5TmFtZSA/PyBnZXRUb29sRGlzcGxheU5hbWUocmVxdWVzdC50b29sTmFtZSk7XG5cdFx0XHRcdFx0Y29uc3QgcGFyYW1ldGVycyA9IHRyYWNrZWRUb29sQ2FsbD8ucGFyYW1ldGVycztcblx0XHRcdFx0XHRjb25zdCBwYXJlbnRUb29sQ2FsbElkID0gdHJhY2tlZFRvb2xDYWxsPy5wYXJlbnRUb29sQ2FsbElkO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmZpcmUoe1xuXHRcdFx0XHRcdFx0a2luZDogJ3BlbmRpbmdfY29uZmlybWF0aW9uJyxcblx0XHRcdFx0XHRcdGNoYXQ6IHRoaXMuX2NoYXRDaGFubmVsVXJpLFxuXHRcdFx0XHRcdFx0c3RhdGU6IHtcblx0XHRcdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRcdFx0XHR0b29sTmFtZTogcmVxdWVzdC50b29sTmFtZSxcblx0XHRcdFx0XHRcdFx0ZGlzcGxheU5hbWUsXG5cdFx0XHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBnZXRJbnZvY2F0aW9uTWVzc2FnZShyZXF1ZXN0LnRvb2xOYW1lLCBkaXNwbGF5TmFtZSwgcGFyYW1ldGVycywgcGF0aCA9PiB0aGlzLl9yZXNvbHZlRWRpdEZpbGVQYXRoKHBhdGgpKSxcblx0XHRcdFx0XHRcdFx0dG9vbElucHV0OiBnZXRUb29sSW5wdXRTdHJpbmcocmVxdWVzdC50b29sTmFtZSwgcGFyYW1ldGVycywgdHJ5U3RyaW5naWZ5KHBhcmFtZXRlcnMpKSxcblx0XHRcdFx0XHRcdFx0cmlza0Fzc2Vzc21lbnQ6IGF1dG9BcHByb3ZhbD8ucmVhc29uXG5cdFx0XHRcdFx0XHRcdFx0PyB7XG5cdFx0XHRcdFx0XHRcdFx0XHRraW5kOiBUb29sQ2FsbFJpc2tBc3Nlc3NtZW50S2luZC5KdWRnZSxcblx0XHRcdFx0XHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxSaXNrQXNzZXNzbWVudFN0YXR1cy5Db21wbGV0ZSxcblx0XHRcdFx0XHRcdFx0XHRcdHJlYXNvbjogYXV0b0FwcHJvdmFsLnJlYXNvbixcblx0XHRcdFx0XHRcdFx0XHRcdHNhZmV0eTogMSxcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0cGFyZW50VG9vbENhbGxJZCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAnYXBwcm92ZS1vbmNlJyB9O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhcHByb3ZlZFNpZ25hdHVyZSA9IHRoaXMuX2FwcHJvdmVkRHVwbGljYWJsZVBlcm1pc3Npb25TaWduYXR1cmVzLmdldCh0b29sQ2FsbElkKTtcblx0XHRcdGlmIChhcHByb3ZlZFNpZ25hdHVyZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX2FwcHJvdmVkRHVwbGljYWJsZVBlcm1pc3Npb25TaWduYXR1cmVzLmRlbGV0ZSh0b29sQ2FsbElkKTtcblx0XHRcdFx0aWYgKCFtYW5hZ2VkQXBwcm92YWxSZXF1aXJlZCAmJiAocmVxdWVzdC5raW5kID09PSAnd3JpdGUnIHx8IHJlcXVlc3Qua2luZCA9PT0gJ3JlYWQnKSAmJiBzYWZlU3RyaW5naWZ5KHJlcXVlc3QpID09PSBhcHByb3ZlZFNpZ25hdHVyZSkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEF1dG8tYXBwcm92aW5nIGR1cGxpY2F0ZSAke3JlcXVlc3Qua2luZH0gcGVybWlzc2lvbiByZXF1ZXN0IGZvciB0b29sIGNhbGwgJHt0b29sQ2FsbElkfWApO1xuXHRcdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdhcHByb3ZlLW9uY2UnIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlUGF0aCA9IHRoaXMuX2dldEludGVybmFsU2Vzc2lvblJlc291cmNlUGF0aChyZXF1ZXN0KTtcblx0XHRcdGlmICghbWFuYWdlZEFwcHJvdmFsUmVxdWlyZWQgJiYgc2Vzc2lvblJlc291cmNlUGF0aCkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBBdXRvLWFwcHJvdmluZyBpbnRlcm5hbCBzZXNzaW9uIHJlc291cmNlICR7c2Vzc2lvblJlc291cmNlUGF0aH1gKTtcblx0XHRcdFx0cmV0dXJuIHsga2luZDogJ2FwcHJvdmUtb25jZScgfTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQXV0by1hcHByb3ZlIHJlYWRzIG9mIGxhcmdlLXRvb2wtb3V0cHV0IHRlbXAgZmlsZXMgd3JpdHRlbiBieSB0aGVcblx0XHRcdC8vIENvcGlsb3QgU0RLIGl0c2VsZi4gVGhlIFNESyBzcGlsbHMgb3ZlcnNpemVkIHRvb2wgcmVzdWx0cyB0b1xuXHRcdFx0Ly8gYG9zLnRtcGRpcigpL2NvcGlsb3QtdG9vbC1vdXRwdXQtXHUyMDI2dHh0YCBhbmQgdGhlbiBhc2tzIHRoZSBtb2RlbFxuXHRcdFx0Ly8gdG8gcmVhZCB0aGVtIGJhY2sgaW4gYSBmb2xsb3ctdXAgdHVybiBcdTIwMTQgbm8gbmVlZCB0byBjb25maXJtLlxuXHRcdFx0aWYgKCFtYW5hZ2VkQXBwcm92YWxSZXF1aXJlZCAmJiByZXF1ZXN0LmtpbmQgPT09ICdyZWFkJyAmJiB0eXBlb2YgcmVxdWVzdC5wYXRoID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRpZiAoaXNDb3BpbG90U2RrVG9vbE91dHB1dFRlbXBGaWxlKHJlcXVlc3QucGF0aCwgdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnRtcERpci5mc1BhdGgpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gQXV0by1hcHByb3ZpbmcgQ29waWxvdCBTREsgdG9vbC1vdXRwdXQgdGVtcCBmaWxlICR7cmVxdWVzdC5wYXRofWApO1xuXHRcdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdhcHByb3ZlLW9uY2UnIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2VydmVyVG9vbEhvc3QgPSB0aGlzLl9zZXJ2ZXJUb29sSG9zdDtcblx0XHRcdGNvbnN0IHNlcnZlclRvb2xOYW1lID0gcmVxdWVzdC5raW5kID09PSAnY3VzdG9tLXRvb2wnICYmIHR5cGVvZiByZXF1ZXN0LnRvb2xOYW1lID09PSAnc3RyaW5nJ1xuXHRcdFx0XHQmJiBzZXJ2ZXJUb29sSG9zdD8udG9vbE5hbWVzLmluY2x1ZGVzKHJlcXVlc3QudG9vbE5hbWUpXG5cdFx0XHRcdD8gcmVxdWVzdC50b29sTmFtZVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChzZXJ2ZXJUb29sSG9zdCAmJiBzZXJ2ZXJUb29sTmFtZSkge1xuXHRcdFx0XHRjb25zdCBjYW5SZXF1aXJlQ29uZmlybWF0aW9uID0gc2VydmVyVG9vbEhvc3QuY2FuUmVxdWlyZUNvbmZpcm1hdGlvbihzZXJ2ZXJUb29sTmFtZSk7XG5cdFx0XHRcdC8vIEEgdG9vbCB0aGF0IG5vcm1hbGx5IGNvbmZpcm1zIGJ1dCBoYXMgbm90aGluZyB0byBjb25maXJtIHJpZ2h0XG5cdFx0XHRcdC8vIG5vdyBwb3NlcyBubyBxdWVzdGlvbiB0byB0aGUgdXNlciwgc28gaXQgcnVucyB3aXRob3V0IHByb21wdGluZ1xuXHRcdFx0XHQvLyBldmVuIHVuZGVyIG1hbmFnZWQgYXBwcm92YWwuXG5cdFx0XHRcdGlmIChjYW5SZXF1aXJlQ29uZmlybWF0aW9uXG5cdFx0XHRcdFx0JiYgIXNlcnZlclRvb2xIb3N0LnJlcXVpcmVzQ29uZmlybWF0aW9uKHRoaXMuX2NoYXRDaGFubmVsVXJpLnRvU3RyaW5nKCksIHNlcnZlclRvb2xOYW1lKVxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBBdXRvLWFwcHJvdmluZyBzZXJ2ZXIgdG9vbCAke3NlcnZlclRvb2xOYW1lfSBiZWNhdXNlIGl0IGhhcyBub3RoaW5nIHRvIGNvbmZpcm1gKTtcblx0XHRcdFx0XHRyZXR1cm4geyBraW5kOiAnYXBwcm92ZS1vbmNlJyB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFNlcnZlciB0b29scyB0aGF0IG5ldmVyIGNvbmZpcm0gb25seSByZWFkIG9yIG11dGF0ZSB0aGVcblx0XHRcdFx0Ly8gc2Vzc2lvbidzIG93biBzZXJ2ZXItaGVsZCBzdGF0ZSBhbmQgbmV2ZXIgdG91Y2ggdGhlIHdvcmtzcGFjZSxcblx0XHRcdFx0Ly8gc2hlbGwsIG9yIG5ldHdvcmssIHNvIHByb21wdGluZyBmb3IgdGhlbSBpcyByZWR1bmRhbnQgbm9pc2UuXG5cdFx0XHRcdGlmICghY2FuUmVxdWlyZUNvbmZpcm1hdGlvbiAmJiAhbWFuYWdlZEFwcHJvdmFsUmVxdWlyZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBBdXRvLWFwcHJvdmluZyBzZXJ2ZXIgdG9vbCAke3NlcnZlclRvb2xOYW1lfWApO1xuXHRcdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdhcHByb3ZlLW9uY2UnIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gVGhlIFNESydzIGJ1aWx0LWluIHRlcm1pbmFsIHJlcG9ydHMgYGtpbmQ6ICdzaGVsbCdgLiBUaGUgQWdlbnQgSG9zdCdzXG5cdFx0XHQvLyB0ZXJtaW5hbCBvdmVycmlkZSBpcyByZWdpc3RlcmVkIGFzIGFuIFNESyBjdXN0b20gdG9vbCBuYW1lZCBgYmFzaGAgb3Jcblx0XHRcdC8vIGBwb3dlcnNoZWxsYCwgc28gaXQgcmVwb3J0cyBga2luZDogJ2N1c3RvbS10b29sJ2AgaW5zdGVhZC5cblx0XHRcdGNvbnN0IGN1c3RvbVNoZWxsVG9vbE5hbWUgPSByZXF1ZXN0LmtpbmQgPT09ICdjdXN0b20tdG9vbCdcblx0XHRcdFx0JiYgdHlwZW9mIHJlcXVlc3QudG9vbE5hbWUgPT09ICdzdHJpbmcnXG5cdFx0XHRcdCYmIGlzU2hlbGxUb29sKHJlcXVlc3QudG9vbE5hbWUpXG5cdFx0XHRcdD8gcmVxdWVzdC50b29sTmFtZVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGlzU2hlbGxSZXF1ZXN0ID0gcmVxdWVzdC5raW5kID09PSAnc2hlbGwnIHx8IGN1c3RvbVNoZWxsVG9vbE5hbWUgIT09IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHRyYWNrZWRUb29sTmFtZSA9IHRoaXMuX2FjdGl2ZVRvb2xDYWxscy5nZXQodG9vbENhbGxJZCk/LnRvb2xOYW1lO1xuXHRcdFx0Y29uc3Qgc2hlbGxUb29sTmFtZSA9IHJlcXVlc3Qua2luZCA9PT0gJ3NoZWxsJ1xuXHRcdFx0XHQ/IHRyYWNrZWRUb29sTmFtZVxuXHRcdFx0XHQ6IGN1c3RvbVNoZWxsVG9vbE5hbWU7XG5cdFx0XHQvLyBPbmx5IGVtaXQgYSBsYW5ndWFnZSB3aGVuIHRoZSBleGVjdXRpbmcgc2hlbGwgdG9vbCBpcyBrbm93bi5cblx0XHRcdC8vIE1pc3NpbmcgbGFuZ3VhZ2UgZmFpbHMgY2xvc2VkIGluIFNlc3Npb25QZXJtaXNzaW9uTWFuYWdlci5cblx0XHRcdGNvbnN0IHNoZWxsTGFuZ3VhZ2U6IElBZ2VudFRvb2xQZW5kaW5nQ29uZmlybWF0aW9uU2lnbmFsWydzaGVsbExhbmd1YWdlJ10gPVxuXHRcdFx0XHRpc1NoZWxsUmVxdWVzdCAmJiAoc2hlbGxUb29sTmFtZSA9PT0gJ2Jhc2gnIHx8IHNoZWxsVG9vbE5hbWUgPT09ICdwb3dlcnNoZWxsJylcblx0XHRcdFx0XHQ/IHNoZWxsVG9vbE5hbWVcblx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChpc1NoZWxsUmVxdWVzdCAmJiBzaGVsbExhbmd1YWdlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gU2hlbGwgcGVybWlzc2lvbiByZXF1ZXN0IGhhcyBubyByZWNvZ25pemVkIHNoZWxsIHRvb2wgbmFtZTsgcmVxdWlyaW5nIGNvbmZpcm1hdGlvbjogdG9vbENhbGxJZD0ke3Rvb2xDYWxsSWR9LCB0b29sTmFtZT0ke3NoZWxsVG9vbE5hbWUgPz8gJyhtaXNzaW5nKSd9YCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghbWFuYWdlZEFwcHJvdmFsUmVxdWlyZWQgJiYgcmVxdWVzdC5raW5kID09PSAnY3VzdG9tLXRvb2wnXG5cdFx0XHRcdCYmIHR5cGVvZiByZXF1ZXN0LnRvb2xOYW1lID09PSAnc3RyaW5nJ1xuXHRcdFx0XHQmJiB0aGlzLl9jbGllbnRUb29sTmFtZXMuaGFzKHRoaXMuX2NsaWVudFRvb2xOYW1lKHJlcXVlc3QudG9vbE5hbWUpKVxuXHRcdFx0XHQmJiB0aGlzLl9wZW5kaW5nQ2xpZW50VG9vbENhbGxzLmhhc0J1ZmZlcmVkUmVzdWx0KHRvb2xDYWxsSWQpXG5cdFx0XHQpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gQXV0by1hcHByb3ZpbmcgY2xpZW50IHRvb2wgJHtyZXF1ZXN0LnRvb2xOYW1lfSBiZWNhdXNlIGl0cyByZXN1bHQgYXJyaXZlZCBiZWZvcmUgdGhlIHBlcm1pc3Npb24gcmVxdWVzdGApO1xuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAnYXBwcm92ZS1vbmNlJyB9O1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBSZXF1ZXN0aW5nIGNvbmZpcm1hdGlvbiBmb3IgdG9vbCBjYWxsOiAke3Rvb2xDYWxsSWR9YCk7XG5cblx0XHRcdGNvbnN0IHBlbmRpbmdQZXJtaXNzaW9uID0gdGhpcy5fcGVuZGluZ1Blcm1pc3Npb25zLnJlZ2lzdGVyKHRvb2xDYWxsSWQsIHsgbWFuYWdlZEFwcHJvdmFsUmVxdWlyZWQgfSk7XG5cblx0XHRcdC8vIEF1dG8tYXBwcm92ZSBzaGVsbCBjb21tYW5kcyB0aGF0IHJ1biBzYW5kYm94ZWQgYnkgZGVmYXVsdCwgc2luY2UgdGhlXG5cdFx0XHQvLyBzYW5kYm94IGFscmVhZHkgY29udGFpbnMgdGhlbS4gQ29tbWFuZHMgdGhhdCBvcHRlZCBPVVQgb2YgdGhlIHNhbmRib3hcblx0XHRcdC8vIChgcmVxdWVzdFNhbmRib3hCeXBhc3NgKSBhcmUgYW4gZWxldmF0aW9uIG9mIHByaXZpbGVnZSBhbmQgbXVzdFxuXHRcdFx0Ly8gZmFsbCB0aHJvdWdoIHRvIHRoZSBub3JtYWwgY29uZmlybWF0aW9uIGZsb3cgXHUyMDE0IG90aGVyd2lzZSBlbmFibGluZ1xuXHRcdFx0Ly8gYHNhbmRib3guYWxsb3dCeXBhc3NgIHdvdWxkIGxldCB0aGUgbW9kZWwgZXNjYXBlIHRoZSBzYW5kYm94IHdpdGggbm9cblx0XHRcdC8vIHByb21wdCBhdCBhbGwuXG5cdFx0XHRpZiAoIW1hbmFnZWRBcHByb3ZhbFJlcXVpcmVkICYmIGlzU2hlbGxSZXF1ZXN0ICYmICFyZXF1ZXN0U2FuZGJveEJ5cGFzcyAmJiBhd2FpdCB0aGlzLl9pc1NoZWxsU2FuZGJveGVkQnlEZWZhdWx0KCkpIHtcblx0XHRcdFx0Ly8gU2Vzc2lvbiBtYXkgaGF2ZSBiZWVuIGRpc3Bvc2VkIHdoaWxlIHdlIGF3YWl0ZWQgdGhlIGVuZ2luZVxuXHRcdFx0XHQvLyBjaGVjazsgaWYgc28gdGhlIGRlZmVycmVkIGhhcyBhbHJlYWR5IGJlZW4gc2V0dGxlZCBhbmRcblx0XHRcdFx0Ly8gcmVtb3ZlZCwgc28gbGVhdmUgaXQgYWxvbmUuXG5cdFx0XHRcdGlmICh0aGlzLl9wZW5kaW5nUGVybWlzc2lvbnMuaGFzKHRvb2xDYWxsSWQpKSB7XG5cdFx0XHRcdFx0dGhpcy5fcGVuZGluZ1Blcm1pc3Npb25zLnJlc3BvbmQodG9vbENhbGxJZCwgeyBraW5kOiAnYXBwcm92ZS1vbmNlJyB9KTtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBBdXRvLWFwcHJvdmluZyBzYW5kYm94ZWQgc2hlbGwgY29tbWFuZCBmb3IgdG9vbCBjYWxsICR7dG9vbENhbGxJZH1gKTtcblx0XHRcdFx0XHRyZXR1cm4geyBraW5kOiAnYXBwcm92ZS1vbmNlJyB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdyZWplY3QnIH07XG5cdFx0XHR9XG5cblx0XHRcdC8vIEZvciB3cml0ZSBwZXJtaXNzaW9uIHJlcXVlc3RzLCBidWlsZCBhIEZpbGVFZGl0IHByZXZpZXcgc28gdGhlXG5cdFx0XHQvLyBjbGllbnQgY2FuIHNob3cgYSBkaWZmIGJlZm9yZSB0aGUgdXNlciBhcHByb3ZlcyBvciBkZW5pZXMuIFRoaXNcblx0XHRcdC8vIGF3YWl0cyBhc3luYyBmaWxlc3lzdGVtIG9wZXJhdGlvbnM7IHRoZSBTREsgYWxyZWFkeSBjYWxsc1xuXHRcdFx0Ly8gYGhhbmRsZVBlcm1pc3Npb25SZXF1ZXN0YCBmcm9tIGFuIGFyYml0cmFyeSBhc3luYyBjb250ZXh0LCBzbyB0aGVcblx0XHRcdC8vIGV4dHJhIGF3YWl0IGhlcmUgaXMgZmluZS5cblx0XHRcdGNvbnN0IGVkaXRzID0gYXdhaXQgdGhpcy5fYnVpbGRFZGl0c0ZvclBlcm1pc3Npb24ocmVxdWVzdCwgdG9vbENhbGxJZCk7XG5cblx0XHRcdC8vIElmIHRoZSBzZXNzaW9uIHdhcyBhYm9ydGVkL2Rpc3Bvc2VkIHdoaWxlIHdlIHdlcmUgYnVpbGRpbmcgdGhlXG5cdFx0XHQvLyBwcmV2aWV3LCB0aGUgZGVmZXJyZWQgaGFzIGFscmVhZHkgYmVlbiByZXNvbHZlZCBhbmQgdGhlXG5cdFx0XHQvLyBgcGVuZGluZy1lZGl0LWNvbnRlbnQ6YCBlbnRyeSBoYXMgYmVlbiBjbGVhbmVkIHVwLiBCYWlsIHdpdGhvdXRcblx0XHRcdC8vIGZpcmluZyB0b29sX3JlYWR5LlxuXHRcdFx0aWYgKCF0aGlzLl9wZW5kaW5nUGVybWlzc2lvbnMuaGFzKHRvb2xDYWxsSWQpKSB7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdyZWplY3QnIH07XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGlzTmV3RmlsZSA9IGVkaXRzPy5pdGVtcy5zb21lKGVkaXQgPT4gIWVkaXQuYmVmb3JlICYmICEhZWRpdC5hZnRlcik7XG5cdFx0XHRjb25zdCB7IGNvbmZpcm1hdGlvblRpdGxlLCBpbnZvY2F0aW9uTWVzc2FnZSwgdG9vbElucHV0LCBwZXJtaXNzaW9uS2luZCwgcGVybWlzc2lvblBhdGggfSA9IGdldFBlcm1pc3Npb25EaXNwbGF5KHJlcXVlc3QsIHRoaXMuX3dvcmtpbmdEaXJlY3RvcnksIGlzTmV3RmlsZSk7XG5cblx0XHRcdC8vIEZpcmUgYSBwZW5kaW5nX2NvbmZpcm1hdGlvbiBzaWduYWwgdG8gdHJhbnNpdGlvbiB0aGUgdG9vbCB0byBQZW5kaW5nQ29uZmlybWF0aW9uXG5cdFx0XHRjb25zdCB0b29sTmFtZSA9IHJlcXVlc3Qua2luZCA9PT0gJ21jcCcgfHwgcmVxdWVzdC5raW5kID09PSAnY3VzdG9tLXRvb2wnIHx8IHJlcXVlc3Qua2luZCA9PT0gJ2hvb2snXG5cdFx0XHRcdD8gcmVxdWVzdC50b29sTmFtZSA/PyByZXF1ZXN0LmtpbmRcblx0XHRcdFx0OiByZXF1ZXN0LmtpbmQ7XG5cdFx0XHQvLyBGb3J3YXJkIHRoZSB0b29sJ3MgcGFyZW50VG9vbENhbGxJZCAoaWYgYW55KSBzbyB0aGUgaG9zdCBjYW5cblx0XHRcdC8vIHJvdXRlIHRoZSByZXN1bHRpbmcgQ2hhdFRvb2xDYWxsUmVhZHkgdG8gdGhlIGNvcnJlY3Rcblx0XHRcdC8vIHN1YmFnZW50IHNlc3Npb24gXHUyMDE0IHdpdGhvdXQgaXQgdGhlIGFjdGlvbiB3b3VsZCBsYW5kIG9uIHRoZVxuXHRcdFx0Ly8gcGFyZW50IHNlc3Npb24sIHdoaWNoIGhhcyBubyBtYXRjaGluZyBDaGF0VG9vbENhbGxTdGFydC5cblx0XHRcdGNvbnN0IHRyYWNrZWRUb29sQ2FsbCA9IHRoaXMuX2FjdGl2ZVRvb2xDYWxscy5nZXQodG9vbENhbGxJZCk7XG5cdFx0XHRjb25zdCBwYXJlbnRUb29sQ2FsbElkID0gdHJhY2tlZFRvb2xDYWxsPy5wYXJlbnRUb29sQ2FsbElkO1xuXHRcdFx0dGhpcy5fb25EaWRTZXNzaW9uUHJvZ3Jlc3MuZmlyZSh7XG5cdFx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdGNoYXQ6IHRoaXMuX2NoYXRDaGFubmVsVXJpLFxuXHRcdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRcdHRvb2xOYW1lLFxuXHRcdFx0XHRcdGRpc3BsYXlOYW1lOiBnZXRUb29sRGlzcGxheU5hbWUodG9vbE5hbWUpLFxuXHRcdFx0XHRcdGNvbnRyaWJ1dG9yOiB0cmFja2VkVG9vbENhbGw/LmNvbnRyaWJ1dG9yLFxuXHRcdFx0XHRcdGludGVudGlvbjogdHJhY2tlZFRvb2xDYWxsPy5pbnRlbnRpb24sXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdFx0dG9vbElucHV0LFxuXHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlLFxuXHRcdFx0XHRcdHJpc2tBc3Nlc3NtZW50OiBhdXRvQXBwcm92YWw/LnJlYXNvblxuXHRcdFx0XHRcdFx0PyB7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6IFRvb2xDYWxsUmlza0Fzc2Vzc21lbnRLaW5kLkp1ZGdlLFxuXHRcdFx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsUmlza0Fzc2Vzc21lbnRTdGF0dXMuQ29tcGxldGUsXG5cdFx0XHRcdFx0XHRcdHJlYXNvbjogYXV0b0FwcHJvdmFsLnJlYXNvbixcblx0XHRcdFx0XHRcdFx0c2FmZXR5OiByZWNvbW1lbmRhdGlvbiA9PT0gJ2FwcHJvdmUnID8gMSA6IDAsXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRlZGl0cyxcblx0XHRcdFx0fSxcblx0XHRcdFx0cGVybWlzc2lvbktpbmQsXG5cdFx0XHRcdHBlcm1pc3Npb25QYXRoLFxuXHRcdFx0XHRtYW5hZ2VkQXBwcm92YWxSZXF1aXJlZCxcblx0XHRcdFx0cmVxdWVzdFNhbmRib3hCeXBhc3MsXG5cdFx0XHRcdHNoZWxsTGFuZ3VhZ2UsXG5cdFx0XHRcdHBhcmVudFRvb2xDYWxsSWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcGVuZGluZ1Blcm1pc3Npb247XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBQZXJtaXNzaW9uIHJlc3BvbnNlOiB0b29sQ2FsbElkPSR7dG9vbENhbGxJZH0sIHJlc3VsdD0ke3Jlc3VsdC5raW5kfWApO1xuXHRcdFx0aWYgKCFtYW5hZ2VkQXBwcm92YWxSZXF1aXJlZCAmJiByZXN1bHQua2luZCA9PT0gJ2FwcHJvdmUtb25jZScgJiYgKHJlcXVlc3Qua2luZCA9PT0gJ3dyaXRlJyB8fCByZXF1ZXN0LmtpbmQgPT09ICdyZWFkJykpIHtcblx0XHRcdFx0dGhpcy5fYXBwcm92ZWREdXBsaWNhYmxlUGVybWlzc2lvblNpZ25hdHVyZXMuc2V0KHRvb2xDYWxsSWQsIHNhZmVTdHJpbmdpZnkocmVxdWVzdCkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnJvciwgYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBGYWlsZWQgdG8gaGFuZGxlIHBlcm1pc3Npb24gcmVxdWVzdDoga2luZD0ke3JlcXVlc3Qua2luZH0sIHRvb2xDYWxsSWQ9JHtyZXF1ZXN0LnRvb2xDYWxsSWQgPz8gJ21pc3NpbmcnfWApO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0SW50ZXJuYWxTZXNzaW9uUmVzb3VyY2VQYXRoKHJlcXVlc3Q6IFBlcm1pc3Npb25SZXF1ZXN0KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgcGVybWlzc2lvblBhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAocmVxdWVzdC5raW5kID09PSAncmVhZCcpIHtcblx0XHRcdHBlcm1pc3Npb25QYXRoID0gdHlwZW9mIHJlcXVlc3QucGF0aCA9PT0gJ3N0cmluZycgPyByZXF1ZXN0LnBhdGggOiB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIGlmIChyZXF1ZXN0LmtpbmQgPT09ICd3cml0ZScpIHtcblx0XHRcdHBlcm1pc3Npb25QYXRoID0gdHlwZW9mIHJlcXVlc3QuZmlsZU5hbWUgPT09ICdzdHJpbmcnID8gcmVxdWVzdC5maWxlTmFtZSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoIXBlcm1pc3Npb25QYXRoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25TdGF0ZURpciA9IG5vcm1hbGl6ZVBhdGgoVVJJLmZpbGUoZ2V0Q29waWxvdENMSVNlc3Npb25TdGF0ZURpcih0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UudXNlckhvbWUuZnNQYXRoKSkpO1xuXHRcdGNvbnN0IHNlc3Npb25EaXIgPSBub3JtYWxpemVQYXRoKFVSSS5qb2luUGF0aChzZXNzaW9uU3RhdGVEaXIsIHRoaXMuc2Vzc2lvbklkKSk7XG5cdFx0aWYgKCFleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsT3JQYXJlbnQoc2Vzc2lvbkRpciwgc2Vzc2lvblN0YXRlRGlyKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBwZXJtaXNzaW9uVXJpID0gbm9ybWFsaXplUGF0aChVUkkuZmlsZShwZXJtaXNzaW9uUGF0aCkpO1xuXHRcdHJldHVybiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsT3JQYXJlbnQocGVybWlzc2lvblVyaSwgc2Vzc2lvbkRpcikgPyBwZXJtaXNzaW9uUGF0aCA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRydWUgd2hlbiBzaGVsbCBjb21tYW5kcyBydW4gaW5zaWRlIGEgc2FuZGJveCBieSBkZWZhdWx0IFx1MjAxNCBlaXRoZXJcblx0ICogdGhyb3VnaCB0aGUgQWdlbnRIb3N0J3Mgb3duIHtAbGluayBUZXJtaW5hbFNhbmRib3hFbmdpbmV9ICh3aGVuIHRoZSBjdXN0b21cblx0ICogdGVybWluYWwgdG9vbCBpcyBlbmFibGVkKSBvciB0aHJvdWdoIHRoZSBTREsncyBidWlsdC1pbiBzaGVsbCB0b29sIHdyYXBwZWRcblx0ICogYnkgdGhlIGBzYW5kYm94Q29uZmlnYCB3ZSBwdXNoZWQgdmlhIGBzZXNzaW9uLm9wdGlvbnMudXBkYXRlYC5cblx0ICpcblx0ICogQ2FsbGVycyB1c2UgdGhpcyB0byBhdXRvLWFwcHJvdmUgc2hlbGwgcGVybWlzc2lvbiBwcm9tcHRzIHRoYXQgdGhlIHNhbmRib3hcblx0ICogYWxyZWFkeSBjb250YWlucy4gQ29tbWFuZHMgdGhhdCBleHBsaWNpdGx5IG9wdCBvdXQgb2YgdGhlIHNhbmRib3hcblx0ICogKGByZXF1ZXN0U2FuZGJveEJ5cGFzc2ApIGFyZSBleGNsdWRlZCBieSB0aGUgY2FsbGVyLCBzaW5jZSB0aGVcblx0ICogc2FuZGJveCBubyBsb25nZXIgY29udGFpbnMgdGhlbS5cblx0ICpcblx0ICogUmV0dXJucyBmYWxzZSB3aGVuIG5laXRoZXIgc2FuZGJveCBwYXRoIGlzIGNvbmZpZ3VyZWQsIHNvIHRoZSBzdGFuZGFyZFxuXHQgKiBjb25maXJtYXRpb24gZmxvdyBpcyBwcmVzZXJ2ZWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9pc1NoZWxsU2FuZGJveGVkQnlEZWZhdWx0KCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0aGlzLl9pc0N1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWQoKSkge1xuXHRcdFx0aWYgKCF0aGlzLl9zaGVsbE1hbmFnZXIpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuX3NoZWxsTWFuYWdlci5nZXRPckNyZWF0ZVNhbmRib3hFbmdpbmUoKS5pc0VuYWJsZWQoKTtcblx0XHR9XG5cdFx0Ly8gU0RLLW1hbmFnZWQgc2hlbGwgcGF0aDogZ2F0ZSBvbiB0aGUgc2FtZSBob3N0IGNvbmZpZyB0aGF0XG5cdFx0Ly8gYENvcGlsb3RTZXNzaW9uTGF1bmNoZXJgIHJlYWRzIHdoZW4gZm9yd2FyZGluZyBgc2FuZGJveENvbmZpZ2AgdG9cblx0XHQvLyB0aGUgU0RLLCBzbyB0aGUgdHdvIHN0YXkgaW4gbG9jay1zdGVwLlxuXHRcdHJldHVybiB0aGlzLl9jb21wdXRlU2RrU2FuZGJveENvbmZpZygpICE9PSB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogYHRydWVgIHdoZW4gdGhlIEFnZW50SG9zdCdzIG93biBzaGVsbCB0b29scyAod3JhcHBlZCBieVxuXHQgKiB7QGxpbmsgVGVybWluYWxTYW5kYm94RW5naW5lfSkgcmVwbGFjZSB0aGUgU0RLJ3MgYnVpbHQtaW4gc2hlbGwuIEluIHRoYXRcblx0ICogbW9kZSB0aGUgU0RLIHNhbmRib3ggY29uZmlnIGlzIHVudXNlZCwgc28gd2UgbmVpdGhlciBmb3J3YXJkIG5vciB0b2dnbGUgaXQuXG5cdCAqL1xuXHRwcml2YXRlIF9pc0N1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShjb3BpbG90Q2xpQ29uZmlnU2NoZW1hLCBDb3BpbG90Q2xpQ29uZmlnS2V5LkVuYWJsZUN1c3RvbVRlcm1pbmFsVG9vbCkgPT09IHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIFNESy1zaGFwZWQgc2FuZGJveCBwb2xpY3kgZm9yIHRoaXMgc2Vzc2lvbiwgbWlycm9yaW5nXG5cdCAqIHtAbGluayBDb3BpbG90U2Vzc2lvbkxhdW5jaGVyfSdzIGNvbXB1dGF0aW9uOiBgdW5kZWZpbmVkYCB3aGVuIHRoZSBjdXN0b21cblx0ICogdGVybWluYWwgdG9vbCBpcyBlbmFibGVkICh0aGUgaG9zdCdzIG93biB0ZXJtaW5hbCBzYW5kYm94IGVuZ2luZSBoYW5kbGVzXG5cdCAqIGNvbnRhaW5tZW50KSBvciB3aGVuIHRoZSBob3N0IHNhbmRib3ggY29uZmlnIGV2YWx1YXRlcyB0byBkaXNhYmxlZFxuXHQgKiAoaW5jbHVkaW5nIG9uIFdpbmRvd3MsIHdoZXJlIHRoZSBzYW5kYm94IGlzIG5vdCBzdXBwb3J0ZWQpLlxuXHQgKi9cblx0cHJpdmF0ZSBfY29tcHV0ZVNka1NhbmRib3hDb25maWcoKTogQ29waWxvdFNhbmRib3hDb25maWcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9pc0N1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3Qgc2FuZGJveCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShzYW5kYm94Q29uZmlnU2NoZW1hLCBBZ2VudEhvc3RTYW5kYm94Q29uZmlnS2V5LlNhbmRib3gpO1xuXHRcdHJldHVybiBidWlsZFNhbmRib3hDb25maWdGb3JTZGsodGhpcy5fcGxhdGZvcm0sIHNhbmRib3gpO1xuXHR9XG5cblx0LyoqXG5cdCAqIGB0cnVlYCB3aGVuIHRoZSBzZXNzaW9uIHJ1bnMgd2l0aCBieXBhc3MgYXBwcm92YWxzIFx1MjAxNCBlaXRoZXIgdGhlIGdsb2JhbFxuXHQgKiBhdXRvLWFwcHJvdmUgc2V0dGluZyBvciB0aGUgc2Vzc2lvbidzIGBhdXRvQXBwcm92ZWAgKFwiQWxsb3cgQWxsXCIpXG5cdCAqIGxldmVsLiBBZ2VudCBtb2RlIGlzIGFuIG9ydGhvZ29uYWwgYXhpcyBhbmQgZG9lcyBub3QgYWZmZWN0IGFwcHJvdmFscy5cblx0ICovXG5cdHByaXZhdGUgX2lzQnlwYXNzQXBwcm92YWxzKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUocGxhdGZvcm1Sb290U2NoZW1hLCBBZ2VudEhvc3RHbG9iYWxBdXRvQXBwcm92ZUVuYWJsZWRDb25maWdLZXkpID09PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEVmZmVjdGl2ZVZhbHVlKHRoaXMuX293bmVyU2Vzc2lvblVyaS50b1N0cmluZygpLCBwbGF0Zm9ybVNlc3Npb25TY2hlbWEsIFNlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmUpID09PSAnYXV0b0FwcHJvdmUnO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U2RrUGVybWlzc2lvbk1vZGUoKTogUGVybWlzc2lvbkFsbG93QWxsTW9kZSB7XG5cdFx0aWYgKHRoaXMuX2lzQnlwYXNzQXBwcm92YWxzKCkpIHtcblx0XHRcdHJldHVybiAnb24nO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZ2V0Q29uZmlndXJlZEFwcHJvdmFsTGV2ZWwoKSA9PT0gJ2Fzc2lzdGVkJ1xuXHRcdFx0PyAnYXV0bydcblx0XHRcdDogJ29mZic7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDb25maWd1cmVkQXBwcm92YWxMZXZlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRFZmZlY3RpdmVWYWx1ZSh0aGlzLl9vd25lclNlc3Npb25VcmkudG9TdHJpbmcoKSwgcGxhdGZvcm1TZXNzaW9uU2NoZW1hLCBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlKSA/PyAnZGVmYXVsdCc7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDb25maWd1cmVkQWdlbnRNb2RlKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEVmZmVjdGl2ZVZhbHVlKHRoaXMuX293bmVyU2Vzc2lvblVyaS50b1N0cmluZygpLCBwbGF0Zm9ybVNlc3Npb25TY2hlbWEsIFNlc3Npb25Db25maWdLZXkuTW9kZSkgPz8gJ2ludGVyYWN0aXZlJztcblx0fVxuXG5cdHByaXZhdGUgX3N1YnNjcmliZVRvUGVybWlzc2lvbkNvbmZpZ0NoYW5nZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRSb290Q29uZmlnQ2hhbmdlKCgpID0+IHtcblx0XHRcdHZvaWQgdGhpcy5fc3luY1Blcm1pc3Npb25Nb2RlQWZ0ZXJDb25maWdDaGFuZ2UoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRTZXNzaW9uQ29uZmlnQ2hhbmdlKGV2ZW50ID0+IHtcblx0XHRcdGlmIChldmVudC5zZXNzaW9uID09PSB0aGlzLl9vd25lclNlc3Npb25VcmkudG9TdHJpbmcoKSAmJiBPYmplY3QuaGFzT3duKGV2ZW50LmNvbmZpZywgU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZSkpIHtcblx0XHRcdFx0dm9pZCB0aGlzLl9zeW5jUGVybWlzc2lvbk1vZGVBZnRlckNvbmZpZ0NoYW5nZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3N5bmNQZXJtaXNzaW9uTW9kZUFmdGVyQ29uZmlnQ2hhbmdlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLnN5bmNQZXJtaXNzaW9uTW9kZSgnY29uZmlnLWNoYW5nZScpO1xuXHRcdFx0YXdhaXQgdGhpcy5fYXBwbHlFZmZlY3RpdmVTYW5kYm94Q29uZmlnKHRydWUpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVycm9yLCBgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEZhaWxlZCB0byBhcHBseSBwZXJtaXNzaW9uIGNvbmZpZyBjaGFuZ2U7IGFib3J0aW5nIGFjdGl2ZSB0dXJuYCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmFib3J0KCk7XG5cdFx0XHR9IGNhdGNoIChhYm9ydEVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYWJvcnRFcnJvciwgYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBGYWlsZWQgdG8gYWJvcnQgYWZ0ZXIgcGVybWlzc2lvbiBjb25maWcgc3luYyBmYWlsdXJlYCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfdGFrZUF1dG9BcHByb3ZhbCh0b29sQ2FsbElkOiBzdHJpbmcpOiBQcm9taXNlPFBlcm1pc3Npb25BdXRvQXBwcm92YWwgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5fYXV0b0FwcHJvdmFscy5oYXModG9vbENhbGxJZCkpIHtcblx0XHRcdGNvbnN0IGF1dG9BcHByb3ZhbCA9IHRoaXMuX2F1dG9BcHByb3ZhbHMuZ2V0KHRvb2xDYWxsSWQpID8/IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2F1dG9BcHByb3ZhbHMuZGVsZXRlKHRvb2xDYWxsSWQpO1xuXHRcdFx0cmV0dXJuIGF1dG9BcHByb3ZhbDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3BlbmRpbmdBdXRvQXBwcm92YWxzLnJlZ2lzdGVyKHRvb2xDYWxsSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVjb3JkQXV0b0FwcHJvdmFsKHRvb2xDYWxsSWQ6IHN0cmluZywgYXV0b0FwcHJvdmFsOiBQZXJtaXNzaW9uQXV0b0FwcHJvdmFsIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdBdXRvQXBwcm92YWxzLnJlc3BvbmQodG9vbENhbGxJZCwgYXV0b0FwcHJvdmFsKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9hdXRvQXBwcm92YWxzLnNldCh0b29sQ2FsbElkLCBhdXRvQXBwcm92YWwgPz8gbnVsbCk7XG5cdH1cblxuXHRzeW5jUGVybWlzc2lvbk1vZGUoc291cmNlOiAnY29uZmlnLWNoYW5nZScgfCAndHVybi1zdGFydCcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcGVybWlzc2lvbk1vZGVTZXF1ZW5jZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZSA9IHRoaXMuX2dldFNka1Blcm1pc3Npb25Nb2RlKCk7XG5cdFx0XHRjb25zdCBjb25maWd1cmVkTGV2ZWwgPSB0aGlzLl9nZXRDb25maWd1cmVkQXBwcm92YWxMZXZlbCgpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gU3luY2luZyBwZXJtaXNzaW9uIG1vZGU6IHNvdXJjZT0ke3NvdXJjZX0sIGFnZW50TW9kZT0ke3RoaXMuX2dldENvbmZpZ3VyZWRBZ2VudE1vZGUoKX0sIGNvbmZpZ3VyZWRMZXZlbD0ke2NvbmZpZ3VyZWRMZXZlbH0sIHNka01vZGU9JHttb2RlfSwgcHJldmlvdXNTZGtNb2RlPSR7dGhpcy5fbGFzdEFwcGxpZWRQZXJtaXNzaW9uTW9kZSA/PyAndW5rbm93bid9LCBnbG9iYWxBdXRvQXBwcm92ZT0ke3RoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShwbGF0Zm9ybVJvb3RTY2hlbWEsIEFnZW50SG9zdEdsb2JhbEF1dG9BcHByb3ZlRW5hYmxlZENvbmZpZ0tleSkgPT09IHRydWV9YCk7XG5cdFx0XHRjb25zdCBleHBlcmltZW50YWxNb2RlRW5hYmxlZCA9IG1vZGUgPT09ICdhdXRvJztcblx0XHRcdGlmICh0aGlzLl9hdXRvQXBwcm92YWxFeHBlcmltZW50YWxNb2RlRW5hYmxlZCAhPT0gZXhwZXJpbWVudGFsTW9kZUVuYWJsZWQpIHtcblx0XHRcdFx0Y29uc3QgZXhwZXJpbWVudGFsUmVzdWx0ID0gYXdhaXQgdGhpcy5fd3JhcHBlci5zZXNzaW9uLnJwYy5vcHRpb25zLnVwZGF0ZSh7IGlzRXhwZXJpbWVudGFsTW9kZTogZXhwZXJpbWVudGFsTW9kZUVuYWJsZWQgfSk7XG5cdFx0XHRcdGlmICghZXhwZXJpbWVudGFsUmVzdWx0LnN1Y2Nlc3MpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvcGlsb3QgU0RLIHJlamVjdGVkIGV4cGVyaW1lbnRhbCBtb2RlIHVwZGF0ZSByZXF1aXJlZCBieSBwZXJtaXNzaW9uIG1vZGUgJyR7bW9kZX0nYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fYXV0b0FwcHJvdmFsRXhwZXJpbWVudGFsTW9kZUVuYWJsZWQgPSBleHBlcmltZW50YWxNb2RlRW5hYmxlZDtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gJHtleHBlcmltZW50YWxNb2RlRW5hYmxlZCA/ICdFbmFibGVkJyA6ICdEaXNhYmxlZCd9IFNESyBleHBlcmltZW50YWwgbW9kZSBmb3IgcGVybWlzc2lvbiBtb2RlICcke21vZGV9J2ApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX2xhc3RBcHBsaWVkUGVybWlzc2lvbk1vZGUgPT09IG1vZGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fd3JhcHBlci5zZXNzaW9uLnJwYy5wZXJtaXNzaW9ucy5zZXRBbGxvd0FsbCh7IG1vZGUgfSk7XG5cdFx0XHRpZiAoIXJlc3VsdC5zdWNjZXNzIHx8IChyZXN1bHQubW9kZSAhPT0gdW5kZWZpbmVkICYmIHJlc3VsdC5tb2RlICE9PSBtb2RlKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvcGlsb3QgU0RLIHJlamVjdGVkIHBlcm1pc3Npb24gbW9kZSAnJHttb2RlfSdgKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xhc3RBcHBsaWVkUGVybWlzc2lvbk1vZGUgPSBtb2RlO1xuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGx5IHRoZSBTREsgc2FuZGJveCBwb2xpY3kgZm9yIHRoZSByZXF1ZXN0IHRoYXQgaXMgYWJvdXQgdG8gYmUgc2VudC5cblx0ICpcblx0ICogU2tpcHMgdGhlIFNESyBzYW5kYm94IGVudGlyZWx5IHdoZW4gdGhlIGN1c3RvbSB0ZXJtaW5hbCB0b29sIGlzIGVuYWJsZWRcblx0ICogKHRoZSBob3N0J3Mgb3duIHRlcm1pbmFsIHNhbmRib3ggZW5naW5lIGhhbmRsZXMgY29udGFpbm1lbnQgYW5kIHRoZSBTREsnc1xuXHQgKiBidWlsdC1pbiBzaGVsbCBpcyB1bnVzZWQpLiBPdGhlcndpc2UgaXQgYWx3YXlzIHB1c2hlcyB0aGUgZWZmZWN0aXZlIHN0YXRlXG5cdCAqIHNvIHRoZSBTREsgbmV2ZXIgcmV0YWlucyBhIHN0YWxlIG9yIGF1dG8tZGlzY292ZXJlZCBzYW5kYm94OiB0aGVcblx0ICogY29uZmlndXJlZCBwb2xpY3kgdW5sZXNzIHRoZSByZXF1ZXN0IHJ1bnMgd2l0aCBieXBhc3MgYXBwcm92YWxzLCBvciBhblxuXHQgKiBleHBsaWNpdGx5IGRpc2FibGVkIHNhbmRib3ggd2hlbiBubyBzYW5kYm94IGlzIGNvbmZpZ3VyZWQgKHNldHRpbmcgb2ZmLFxuXHQgKiBvciBXaW5kb3dzKS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2FwcGx5RWZmZWN0aXZlU2FuZGJveENvbmZpZyhmYWlsT25FcnJvciA9IGZhbHNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2lzQ3VzdG9tVGVybWluYWxUb29sRW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNhbmRib3ggPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUoc2FuZGJveENvbmZpZ1NjaGVtYSwgQWdlbnRIb3N0U2FuZGJveENvbmZpZ0tleS5TYW5kYm94KTtcblx0XHRjb25zdCBiYXNlID0gYnVpbGRTYW5kYm94Q29uZmlnRm9yU2RrKHRoaXMuX3BsYXRmb3JtLCBzYW5kYm94KTtcblx0XHRjb25zdCBzYW5kYm94Q29uZmlnOiBDb3BpbG90U2FuZGJveENvbmZpZyB8IHsgZW5hYmxlZDogZmFsc2UgfSA9IChiYXNlICYmICF0aGlzLl9pc0J5cGFzc0FwcHJvdmFscygpKSA/IGJhc2UgOiB7IGVuYWJsZWQ6IGZhbHNlIH07XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX3dyYXBwZXIuc2Vzc2lvbi5ycGMub3B0aW9ucy51cGRhdGUoeyBzYW5kYm94Q29uZmlnIH0pO1xuXHRcdFx0aWYgKCFyZXN1bHQuc3VjY2Vzcykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NvcGlsb3QgU0RLIHJlamVjdGVkIHNhbmRib3ggY29uZmlnIHVwZGF0ZScpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKGZhaWxPbkVycm9yKSB7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEZhaWxlZCB0byB1cGRhdGUgc2FuZGJveCBjb25maWcgZm9yIHJlcXVlc3RgLCBlcnIpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZHMgYW4ge0BsaW5rIEZpbGVFZGl0fSBwcmV2aWV3IGZvciBhIHdyaXRlIHBlcm1pc3Npb24gcmVxdWVzdC5cblx0ICpcblx0ICogVGhlIGBiZWZvcmVgIHNpZGUgcmVmZXJlbmNlcyB0aGUgZXhpc3RpbmcgZmlsZSBvbiBkaXNrIGRpcmVjdGx5IChpZiBpdFxuXHQgKiBleGlzdHMpOyB0aGUgYGFmdGVyYCBzaWRlIGlzIHdyaXR0ZW4gdG8gdGhlIGBwZW5kaW5nLWVkaXQtY29udGVudDpgXG5cdCAqIGluLW1lbW9yeSBmaWxlc3lzdGVtIHNvIHRoZSBjbGllbnQgY2FuIGZldGNoIGl0IHZpYSBgcmVzb3VyY2VSZWFkYC5cblx0ICpcblx0ICogUmV0dXJucyBgdW5kZWZpbmVkYCBmb3IgcGVybWlzc2lvbiBraW5kcyB0aGF0IGRvbid0IGRlc2NyaWJlIGZpbGVcblx0ICogZWRpdHMgb3Igd2hlbiB0aGUgcmVxdWVzdCBpcyBtaXNzaW5nIHRoZSBmaWVsZHMgbmVlZGVkIHRvIGJ1aWxkIGFcblx0ICogcHJldmlldy4gSWYgdGhlIHBlcm1pc3Npb24gcmVxdWVzdCBpcyBubyBsb25nZXIgcGVuZGluZyBieSB0aGUgdGltZVxuXHQgKiB0aGUgaW4tbWVtb3J5IHdyaXRlIGNvbXBsZXRlcyAoZS5nLiB0aGUgc2Vzc2lvbiB3YXMgYWJvcnRlZCksIHRoZVxuXHQgKiBqdXN0LXdyaXR0ZW4gZW50cnkgaXMgZGVsZXRlZCBzbyBpdCBjYW5ub3QgbGVhay5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2J1aWxkRWRpdHNGb3JQZXJtaXNzaW9uKHJlcXVlc3Q6IFBlcm1pc3Npb25SZXF1ZXN0LCB0b29sQ2FsbElkOiBzdHJpbmcpOiBQcm9taXNlPHsgaXRlbXM6IEZpbGVFZGl0W10gfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChyZXF1ZXN0LmtpbmQgIT09ICd3cml0ZScpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGZpbGVQYXRoID0gdHlwZW9mIHJlcXVlc3QuZmlsZU5hbWUgPT09ICdzdHJpbmcnID8gcmVxdWVzdC5maWxlTmFtZSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBuZXdGaWxlQ29udGVudHMgPSB0eXBlb2YgcmVxdWVzdC5uZXdGaWxlQ29udGVudHMgPT09ICdzdHJpbmcnID8gcmVxdWVzdC5uZXdGaWxlQ29udGVudHMgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFmaWxlUGF0aCB8fCBuZXdGaWxlQ29udGVudHMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBmaWxlVXJpID0gVVJJLmZpbGUoZmlsZVBhdGgpO1xuXHRcdGNvbnN0IGZpbGVVcmlTdHIgPSBmaWxlVXJpLnRvU3RyaW5nKCk7XG5cblx0XHRsZXQgYmVmb3JlRXhpc3RzID0gZmFsc2U7XG5cdFx0dHJ5IHtcblx0XHRcdGJlZm9yZUV4aXN0cyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyhmaWxlVXJpKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEZhaWxlZCB0byBjaGVjayBmaWxlIGZvciBlZGl0IHByZXZpZXc6ICR7ZmlsZVBhdGh9YCwgZXJyKTtcblx0XHR9XG5cblx0XHRjb25zdCBhZnRlclVyaSA9IGJ1aWxkUGVuZGluZ0VkaXRDb250ZW50VXJpKHRoaXMuX3N0b3JhZ2VVcmkudG9TdHJpbmcoKSwgdG9vbENhbGxJZCwgZmlsZVBhdGgpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS53cml0ZUZpbGUoYWZ0ZXJVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcobmV3RmlsZUNvbnRlbnRzKSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBGYWlsZWQgdG8gd3JpdGUgcGVuZGluZyBlZGl0IGNvbnRlbnQgZm9yICR7ZmlsZVBhdGh9YCwgZXJyKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlIHJlcXVlc3Qgd2FzIGFscmVhZHkgcmVzb2x2ZWQgKGFib3J0ZWQvZGlzcG9zZWQpIHdoaWxlIHdlXG5cdFx0Ly8gd2VyZSBhd2FpdGluZyB0aGUgd3JpdGUsIGRyb3AgdGhlIGluLW1lbW9yeSBlbnRyeSBpbW1lZGlhdGVseTtcblx0XHQvLyBgX2RlbGV0ZVBlbmRpbmdFZGl0Q29udGVudGAgaGFzIGFscmVhZHkgcnVuIGFuZCB3b24ndCBydW4gYWdhaW4uXG5cdFx0aWYgKCF0aGlzLl9wZW5kaW5nUGVybWlzc2lvbnMuaGFzKHRvb2xDYWxsSWQpKSB7XG5cdFx0XHR0aGlzLl9maWxlU2VydmljZS5kZWwoYWZ0ZXJVcmkpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEZhaWxlZCB0byBkZWxldGUgb3JwaGFuZWQgcGVuZGluZyBlZGl0IGNvbnRlbnQ6ICR7YWZ0ZXJVcmkudG9TdHJpbmcoKX1gLCBlcnIpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nRWRpdENvbnRlbnRVcmlzLnNldCh0b29sQ2FsbElkLCBhZnRlclVyaSk7XG5cblx0XHRjb25zdCBkaWZmQ291bnRzID0gdHlwZW9mIHJlcXVlc3QuZGlmZiA9PT0gJ3N0cmluZycgPyBjb3VudFVuaWZpZWREaWZmTGluZXMocmVxdWVzdC5kaWZmKSA6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGVkaXQ6IEZpbGVFZGl0ID0ge1xuXHRcdFx0Li4uKGJlZm9yZUV4aXN0cyA/IHsgYmVmb3JlOiB7IHVyaTogZmlsZVVyaVN0ciwgY29udGVudDogeyB1cmk6IGZpbGVVcmlTdHIgfSB9IH0gOiB7fSksXG5cdFx0XHRhZnRlcjogeyB1cmk6IGZpbGVVcmlTdHIsIGNvbnRlbnQ6IHsgdXJpOiBhZnRlclVyaS50b1N0cmluZygpIH0gfSxcblx0XHRcdC4uLihkaWZmQ291bnRzID8geyBkaWZmOiBkaWZmQ291bnRzIH0gOiB7fSksXG5cdFx0fTtcblx0XHRyZXR1cm4geyBpdGVtczogW2VkaXRdIH07XG5cdH1cblxuXHRyZXNwb25kVG9QZXJtaXNzaW9uUmVxdWVzdChyZXF1ZXN0SWQ6IHN0cmluZywgYXBwcm92ZWQ6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fcGVuZGluZ1Blcm1pc3Npb25zLnJlc3BvbmQocmVxdWVzdElkLCBhcHByb3ZlZCA/IHsga2luZDogJ2FwcHJvdmUtb25jZScgfSA6IFVTRVJfREVOSUVEX1BFUk1JU1NJT05fUkVTVUxUKSkge1xuXHRcdFx0dGhpcy5fZGVsZXRlUGVuZGluZ0VkaXRDb250ZW50KHJlcXVlc3RJZCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVxdWVzdFVuc2FuZGJveGVkQ29tbWFuZENvbmZpcm1hdGlvbihyZXF1ZXN0OiBJVW5zYW5kYm94ZWRDb21tYW5kQ29uZmlybWF0aW9uUmVxdWVzdCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHBlbmRpbmdQZXJtaXNzaW9uID0gdGhpcy5fcGVuZGluZ1Blcm1pc3Npb25zLnJlZ2lzdGVyKHJlcXVlc3QudG9vbENhbGxJZCwgeyBtYW5hZ2VkQXBwcm92YWxSZXF1aXJlZDogZmFsc2UgfSk7XG5cblx0XHRjb25zdCBkaXNwbGF5TmFtZSA9IGdldFRvb2xEaXNwbGF5TmFtZShyZXF1ZXN0LnRvb2xOYW1lKTtcblx0XHRjb25zdCBibG9ja2VkRG9tYWlucyA9IHJlcXVlc3QuYmxvY2tlZERvbWFpbnM/Lmxlbmd0aCA/IHJlcXVlc3QuYmxvY2tlZERvbWFpbnMuam9pbignLCAnKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb25maXJtYXRpb25UaXRsZSA9IGJsb2NrZWREb21haW5zXG5cdFx0XHQ/IGxvY2FsaXplKCdhZ2VudEhvc3QudW5zYW5kYm94ZWRDb21tYW5kQ29uZmlybWF0aW9uLnRpdGxlLmJsb2NrZWREb21haW5zJywgXCJSdW4gQ29tbWFuZCBPdXRzaWRlIHRoZSBTYW5kYm94IHRvIEFjY2VzcyB7MH0/XCIsIGJsb2NrZWREb21haW5zKVxuXHRcdFx0OiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnVuc2FuZGJveGVkQ29tbWFuZENvbmZpcm1hdGlvbi50aXRsZS5nZW5lcmljJywgXCJSdW4gQ29tbWFuZCBPdXRzaWRlIHRoZSBTYW5kYm94P1wiKTtcblx0XHRjb25zdCBpbnZvY2F0aW9uTWVzc2FnZSA9IHJlcXVlc3QucmVhc29uXG5cdFx0XHQ/IGxvY2FsaXplKCdhZ2VudEhvc3QudW5zYW5kYm94ZWRDb21tYW5kQ29uZmlybWF0aW9uLnJlYXNvbicsIFwiUmVhc29uIGZvciBsZWF2aW5nIHRoZSBzYW5kYm94OiB7MH1cIiwgcmVxdWVzdC5yZWFzb24pXG5cdFx0XHQ6IGJsb2NrZWREb21haW5zXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2FnZW50SG9zdC51bnNhbmRib3hlZENvbW1hbmRDb25maXJtYXRpb24uYmxvY2tlZERvbWFpbnMnLCBcIlRoaXMgY29tbWFuZCBuZWVkcyB0byBhY2Nlc3MgYmxvY2tlZCBuZXR3b3JrIGRvbWFpbihzKTogezB9LlwiLCBibG9ja2VkRG9tYWlucylcblx0XHRcdFx0OiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnVuc2FuZGJveGVkQ29tbWFuZENvbmZpcm1hdGlvbi5nZW5lcmljJywgXCJUaGlzIGNvbW1hbmQgbmVlZHMgdG8gcnVuIG91dHNpZGUgdGhlIHNhbmRib3guXCIpO1xuXG5cdFx0Y29uc3QgcGFyZW50VG9vbENhbGxJZCA9IHRoaXMuX2FjdGl2ZVRvb2xDYWxscy5nZXQocmVxdWVzdC50b29sQ2FsbElkKT8ucGFyZW50VG9vbENhbGxJZDtcblx0XHR0aGlzLl9vbkRpZFNlc3Npb25Qcm9ncmVzcy5maXJlKHtcblx0XHRcdGtpbmQ6ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicsXG5cdFx0XHRjaGF0OiB0aGlzLl9jaGF0Q2hhbm5lbFVyaSxcblx0XHRcdHN0YXRlOiB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0dG9vbENhbGxJZDogcmVxdWVzdC50b29sQ2FsbElkLFxuXHRcdFx0XHR0b29sTmFtZTogcmVxdWVzdC50b29sTmFtZSxcblx0XHRcdFx0ZGlzcGxheU5hbWUsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHR0b29sSW5wdXQ6IHJlcXVlc3QuY29tbWFuZCxcblx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGUsXG5cdFx0XHR9LFxuXHRcdFx0Ly8gSW50ZW50aW9uYWxseSBvbWl0IGBwZXJtaXNzaW9uS2luZDogJ3NoZWxsJ2A6IHRoYXQgd291bGQgcm91dGUgdGhpc1xuXHRcdFx0Ly8gdGhyb3VnaCB0aGUgc2hlbGwgcnVsZS1iYXNlZCBhdXRvLWFwcHJvdmVyIGFuZCBzaWxlbnRseSBhcHByb3ZlXG5cdFx0XHQvLyBjb21tb24gc2FmZSBjb21tYW5kcyAoYHB3ZGAsIGBsc2AsIGV0Yy4pIHdpdGhvdXQgcHJvbXB0aW5nLlxuXHRcdFx0Ly8gTWlycm9ycyB0aGUgd29ya2JlbmNoJ3Mgc2FuZGJveC1hd2FyZSBhbmFseXplciwgd2hpY2ggZm9yY2VzXG5cdFx0XHQvLyBgaXNBdXRvQXBwcm92ZUFsbG93ZWQ6IGZhbHNlYCB3aGVuZXZlciBgcmVxdWlyZXNVbnNhbmRib3hDb25maXJtYXRpb25gXG5cdFx0XHQvLyBpcyBzZXQuXG5cdFx0XHRwYXJlbnRUb29sQ2FsbElkLFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIChhd2FpdCBwZW5kaW5nUGVybWlzc2lvbikua2luZCA9PT0gJ2FwcHJvdmUtb25jZSc7XG5cdH1cblxuXHQvLyAtLS0tIHVzZXIgaW5wdXQgaGFuZGxpbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgYSB1c2VyIGlucHV0IHJlcXVlc3QgZnJvbSB0aGUgU0RLIChhc2tfdXNlciB0b29sKS4gQXV0by1hbnN3ZXJzIHdoZW4gdGhlIHVzZXIgaXMgdW5hdmFpbGFibGU7IG90aGVyd2lzZSB3YWl0cyBmb3IgdGhlIHJlbmRlcmVyIHRvIHJlc3BvbmQgdmlhIHtAbGluayByZXNwb25kVG9Vc2VySW5wdXRSZXF1ZXN0fS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZVVzZXJJbnB1dFJlcXVlc3QoXG5cdFx0cmVxdWVzdDogVXNlcklucHV0UmVxdWVzdCxcblx0XHRfaW52b2NhdGlvbjogeyBzZXNzaW9uSWQ6IHN0cmluZyB9LFxuXHQpOiBQcm9taXNlPFVzZXJJbnB1dFJlc3BvbnNlPiB7XG5cdFx0Y29uc3QgcmVxdWVzdElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgcXVlc3Rpb25JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IGlucHV0UmVxdWVzdDogQ2hhdElucHV0UmVxdWVzdCA9IHtcblx0XHRcdGlkOiByZXF1ZXN0SWQsXG5cdFx0XHRxdWVzdGlvbnM6IFtyZXF1ZXN0LmNob2ljZXMgJiYgcmVxdWVzdC5jaG9pY2VzLmxlbmd0aCA+IDBcblx0XHRcdFx0PyB7XG5cdFx0XHRcdFx0a2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLlNpbmdsZVNlbGVjdCxcblx0XHRcdFx0XHRpZDogcXVlc3Rpb25JZCxcblx0XHRcdFx0XHRtZXNzYWdlOiByZXF1ZXN0LnF1ZXN0aW9uLFxuXHRcdFx0XHRcdHJlcXVpcmVkOiB0cnVlLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHJlcXVlc3QuY2hvaWNlcy5tYXAoYyA9PiAoeyBpZDogYywgbGFiZWw6IGMgfSkpLFxuXHRcdFx0XHRcdGFsbG93RnJlZWZvcm1JbnB1dDogcmVxdWVzdC5hbGxvd0ZyZWVmb3JtID8/IHRydWUsXG5cdFx0XHRcdH1cblx0XHRcdFx0OiB7XG5cdFx0XHRcdFx0a2luZDogQ2hhdElucHV0UXVlc3Rpb25LaW5kLlRleHQsXG5cdFx0XHRcdFx0aWQ6IHF1ZXN0aW9uSWQsXG5cdFx0XHRcdFx0bWVzc2FnZTogcmVxdWVzdC5xdWVzdGlvbixcblx0XHRcdFx0XHRyZXF1aXJlZDogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IGlzQXV0b3BpbG90ID0gdGhpcy5faXNBdXRvcGlsb3RNb2RlKCk7XG5cdFx0aWYgKGlzQXV0b3BpbG90IHx8IHRoaXMuX2lzQXV0b1JlcGx5RW5hYmxlZCgpKSB7XG5cdFx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0SW5wdXRSZXF1ZXN0ZWQsXG5cdFx0XHRcdHJlcXVlc3Q6IGlucHV0UmVxdWVzdCxcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0Q29tcGxldGVkLFxuXHRcdFx0XHRyZXF1ZXN0SWQsXG5cdFx0XHRcdHJlc3BvbnNlOiBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQWNjZXB0LFxuXHRcdFx0XHRhbnN3ZXJzOiB7XG5cdFx0XHRcdFx0W3F1ZXN0aW9uSWRdOiB7XG5cdFx0XHRcdFx0XHRzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLFxuXHRcdFx0XHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0XHRcdFx0a2luZDogQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQsXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiBBZ2VudEhvc3RBdXRvUmVwbHlBbnN3ZXIsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGFuc3dlcjogQWdlbnRIb3N0QXV0b1JlcGx5QW5zd2VyLFxuXHRcdFx0XHR3YXNGcmVlZm9ybTogdHJ1ZSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGlmICghdGhpcy5oYXNBY3RpdmVUdXJuKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBSZWplY3RpbmcgdXNlciBpbnB1dCByZXF1ZXN0IHdpdGhvdXQgYW4gYWN0aXZlIHR1cm5gKTtcblx0XHRcdHJldHVybiB7IGFuc3dlcjogJ05vIGFjdGl2ZSB0dXJuJywgd2FzRnJlZWZvcm06IHRydWUgfTtcblx0XHR9XG5cblx0XHRjb25zdCBxdWVzdGlvblByZXZpZXcgPSByZXF1ZXN0LnF1ZXN0aW9uLnN1YnN0cmluZygwLCAxMDApO1xuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBVc2VyIGlucHV0IHJlcXVlc3Q6IHJlcXVlc3RJZD0ke3JlcXVlc3RJZH0sIHF1ZXN0aW9uPVwiJHtxdWVzdGlvblByZXZpZXd9XCJgKTtcblxuXHRcdFx0Y29uc3QgcGVuZGluZ0lucHV0ID0gdGhpcy5fcGVuZGluZ1VzZXJJbnB1dHMucmVnaXN0ZXIocmVxdWVzdElkLCB7IHF1ZXN0aW9uSWQgfSk7XG5cblx0XHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRJbnB1dFJlcXVlc3RlZCxcblx0XHRcdFx0cmVxdWVzdDogeyAuLi5pbnB1dFJlcXVlc3QsIHB1cnBvc2U6IENoYXRJbnB1dFJlcXVlc3RQdXJwb3NlLkFza1VzZXIgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwZW5kaW5nSW5wdXQ7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBVc2VyIGlucHV0IHJlc3BvbnNlOiByZXF1ZXN0SWQ9JHtyZXF1ZXN0SWR9LCByZXNwb25zZT0ke3Jlc3VsdC5yZXNwb25zZX1gKTtcblxuXHRcdFx0aWYgKHJlc3VsdC5yZXNwb25zZSAhPT0gQ2hhdElucHV0UmVzcG9uc2VLaW5kLkFjY2VwdCB8fCAhcmVzdWx0LmFuc3dlcnMpIHtcblx0XHRcdFx0cmV0dXJuIHsgYW5zd2VyOiAnJywgd2FzRnJlZWZvcm06IHRydWUgfTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRXh0cmFjdCB0aGUgYW5zd2VyIGZvciBvdXIgc2luZ2xlIHF1ZXN0aW9uXG5cdFx0XHRjb25zdCBhbnN3ZXIgPSByZXN1bHQuYW5zd2Vyc1txdWVzdGlvbklkXTtcblx0XHRcdGlmICghYW5zd2VyIHx8IGFuc3dlci5zdGF0ZSA9PT0gQ2hhdElucHV0QW5zd2VyU3RhdGUuU2tpcHBlZCkge1xuXHRcdFx0XHRyZXR1cm4geyBhbnN3ZXI6ICcnLCB3YXNGcmVlZm9ybTogdHJ1ZSB9O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB7IHZhbHVlOiB2YWwgfSA9IGFuc3dlcjtcblx0XHRcdGlmICh2YWwua2luZCA9PT0gQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQpIHtcblx0XHRcdFx0cmV0dXJuIHsgYW5zd2VyOiB2YWwudmFsdWUsIHdhc0ZyZWVmb3JtOiB0cnVlIH07XG5cdFx0XHR9IGVsc2UgaWYgKHZhbC5raW5kID09PSBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuU2VsZWN0ZWQpIHtcblx0XHRcdFx0Y29uc3Qgd2FzRnJlZWZvcm0gPSAhcmVxdWVzdC5jaG9pY2VzPy5pbmNsdWRlcyh2YWwudmFsdWUpO1xuXHRcdFx0XHRyZXR1cm4geyBhbnN3ZXI6IHZhbC52YWx1ZSwgd2FzRnJlZWZvcm0gfTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHsgYW5zd2VyOiAnJywgd2FzRnJlZWZvcm06IHRydWUgfTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnJvciwgYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBGYWlsZWQgdG8gaGFuZGxlIHVzZXIgaW5wdXQgcmVxdWVzdDogcXVlc3Rpb249XCIke3F1ZXN0aW9uUHJldmlld31cImApO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgYW4gZWxpY2l0YXRpb24gcmVxdWVzdCBmcm9tIHRoZSBTREsgKE1DUCBzZXJ2ZXIgLyB0b29sIHByb21wdClcblx0ICogYnkgZmlyaW5nIGEgYHNlc3Npb24vaW5wdXRSZXF1ZXN0ZWRgIGFjdGlvbiBhbmQgd2FpdGluZyBmb3IgdGhlXG5cdCAqIHJlbmRlcmVyIHRvIHJlc3BvbmQgdmlhIHtAbGluayByZXNwb25kVG9Vc2VySW5wdXRSZXF1ZXN0fS5cblx0ICpcblx0ICogLSBgZm9ybWAgbW9kZSByZXF1ZXN0cyBhcmUgcHJvamVjdGVkIGZyb20gdGhlIFNESydzXG5cdCAqICAge0BsaW5rIEVsaWNpdGF0aW9uU2NoZW1hfSBpbnRvIGEgbGlzdCBvZlxuXHQgKiAgIHtAbGluayBDaGF0SW5wdXRRdWVzdGlvbn1zLlxuXHQgKiAtIGB1cmxgIG1vZGUgcmVxdWVzdHMgc3VyZmFjZSBhcyBhIHF1ZXN0aW9uLWxlc3MgaW5wdXQgcmVxdWVzdCB3aG9zZVxuXHQgKiAgIHtAbGluayBDaGF0SW5wdXRSZXF1ZXN0LnVybH0gZHJpdmVzIHRoZSByZW5kZXJlcidzIFwib3BlbiBVUkxcIlxuXHQgKiAgIGFmZm9yZGFuY2UuXG5cdCAqXG5cdCAqIFVuZGVyIGF1dG9waWxvdCB0aGUgcmVxdWVzdCBpcyBhdXRvLWNhbmNlbGxlZCBcdTIwMTQgdGhlcmUgaXMgbm8gdXNlclxuXHQgKiBhdmFpbGFibGUgdG8gZmlsbCBpbiBhIGZvcm0sIGFuZCBhY2NlcHRpbmcgd2l0aCBlbXB0eSBjb250ZW50IHdvdWxkXG5cdCAqIGJlIG1pc2xlYWRpbmcgdG8gdGhlIE1DUCBzZXJ2ZXIuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVFbGljaXRhdGlvblJlcXVlc3QoY29udGV4dDogRWxpY2l0YXRpb25Db250ZXh0KTogUHJvbWlzZTxFbGljaXRhdGlvblJlc3VsdD4ge1xuXHRcdGNvbnN0IGlzQXV0b3BpbG90ID0gdGhpcy5faXNBdXRvcGlsb3RNb2RlKCk7XG5cdFx0aWYgKGlzQXV0b3BpbG90KSB7XG5cdFx0XHRyZXR1cm4geyBhY3Rpb246ICdjYW5jZWwnIH07XG5cdFx0fVxuXHRcdGlmICghdGhpcy5oYXNBY3RpdmVUdXJuKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBSZWplY3RpbmcgZWxpY2l0YXRpb24gcmVxdWVzdCB3aXRob3V0IGFuIGFjdGl2ZSB0dXJuYCk7XG5cdFx0XHRyZXR1cm4geyBhY3Rpb246ICdkZWNsaW5lJyB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IG1lc3NhZ2VQcmV2aWV3ID0gY29udGV4dC5tZXNzYWdlLnN1YnN0cmluZygwLCAxMDApO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXF1ZXN0SWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEVsaWNpdGF0aW9uIHJlcXVlc3Q6IHJlcXVlc3RJZD0ke3JlcXVlc3RJZH0sIG1vZGU9JHtjb250ZXh0Lm1vZGUgPz8gJ2Zvcm0nfSwgc291cmNlPSR7Y29udGV4dC5lbGljaXRhdGlvblNvdXJjZSA/PyAnPHVua25vd24+J30sIG1lc3NhZ2U9XCIke21lc3NhZ2VQcmV2aWV3fVwiYCk7XG5cblx0XHRcdGNvbnN0IHNjaGVtYSA9IGNvbnRleHQubW9kZSA9PT0gJ3VybCcgPyB1bmRlZmluZWQgOiBjb250ZXh0LnJlcXVlc3RlZFNjaGVtYTtcblx0XHRcdGNvbnN0IHJlcXVpcmVkU2V0ID0gbmV3IFNldChzY2hlbWE/LnJlcXVpcmVkID8/IFtdKTtcblx0XHRcdGNvbnN0IHF1ZXN0aW9uczogQ2hhdElucHV0UXVlc3Rpb25bXSB8IHVuZGVmaW5lZCA9IHNjaGVtYVxuXHRcdFx0XHQ/IE9iamVjdC5lbnRyaWVzKHNjaGVtYS5wcm9wZXJ0aWVzKS5tYXAoKFtmaWVsZE5hbWUsIGZpZWxkXSkgPT4gZWxpY2l0YXRpb25GaWVsZFRvUXVlc3Rpb24oZmllbGROYW1lLCBmaWVsZCwgcmVxdWlyZWRTZXQuaGFzKGZpZWxkTmFtZSkpKVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgcGVuZGluZ0VsaWNpdGF0aW9uID0gdGhpcy5fcGVuZGluZ0VsaWNpdGF0aW9ucy5yZWdpc3RlcihyZXF1ZXN0SWQsIHsgc2NoZW1hIH0pO1xuXG5cdFx0XHRjb25zdCBpbnB1dFJlcXVlc3Q6IENoYXRJbnB1dFJlcXVlc3QgPSB7XG5cdFx0XHRcdGlkOiByZXF1ZXN0SWQsXG5cdFx0XHRcdHB1cnBvc2U6IENoYXRJbnB1dFJlcXVlc3RQdXJwb3NlLkVsaWNpdGF0aW9uLFxuXHRcdFx0XHRtZXNzYWdlOiBjb250ZXh0Lm1lc3NhZ2UsXG5cdFx0XHRcdC4uLihjb250ZXh0Lm1vZGUgPT09ICd1cmwnICYmIGNvbnRleHQudXJsID8geyB1cmw6IGNvbnRleHQudXJsIH0gOiB7fSksXG5cdFx0XHRcdC4uLihxdWVzdGlvbnMgJiYgcXVlc3Rpb25zLmxlbmd0aCA+IDAgPyB7IHF1ZXN0aW9ucyB9IDoge30pLFxuXHRcdFx0fTtcblxuXHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdElucHV0UmVxdWVzdGVkLFxuXHRcdFx0XHRyZXF1ZXN0OiBpbnB1dFJlcXVlc3QsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcGVuZGluZ0VsaWNpdGF0aW9uO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gRWxpY2l0YXRpb24gcmVzcG9uc2U6IHJlcXVlc3RJZD0ke3JlcXVlc3RJZH0sIHJlc3BvbnNlPSR7cmVzdWx0LnJlc3BvbnNlfWApO1xuXG5cdFx0XHRpZiAocmVzdWx0LnJlc3BvbnNlID09PSBDaGF0SW5wdXRSZXNwb25zZUtpbmQuRGVjbGluZSkge1xuXHRcdFx0XHRyZXR1cm4geyBhY3Rpb246ICdkZWNsaW5lJyB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc3VsdC5yZXNwb25zZSAhPT0gQ2hhdElucHV0UmVzcG9uc2VLaW5kLkFjY2VwdCkge1xuXHRcdFx0XHRyZXR1cm4geyBhY3Rpb246ICdjYW5jZWwnIH07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhbnN3ZXJzID0gcmVzdWx0LmFuc3dlcnMgPz8ge307XG5cdFx0XHRpZiAoIXNjaGVtYSkge1xuXHRcdFx0XHRjb25zdCBmcmVlZm9ybSA9IGFuc3dlcnMuYW5zd2VyO1xuXHRcdFx0XHRpZiAoZnJlZWZvcm0gJiYgZnJlZWZvcm0uc3RhdGUgIT09IENoYXRJbnB1dEFuc3dlclN0YXRlLlNraXBwZWQgJiYgZnJlZWZvcm0udmFsdWUua2luZCA9PT0gQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQpIHtcblx0XHRcdFx0XHRyZXR1cm4geyBhY3Rpb246ICdhY2NlcHQnLCBjb250ZW50OiB7IGFuc3dlcjogZnJlZWZvcm0udmFsdWUudmFsdWUgfSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7IGFjdGlvbjogJ2FjY2VwdCcgfTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbnRlbnQ6IFJlY29yZDxzdHJpbmcsIEVsaWNpdGF0aW9uRmllbGRWYWx1ZT4gPSB7fTtcblx0XHRcdGZvciAoY29uc3QgW2ZpZWxkTmFtZSwgZmllbGRdIG9mIE9iamVjdC5lbnRyaWVzKHNjaGVtYS5wcm9wZXJ0aWVzKSkge1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IGVsaWNpdGF0aW9uQW5zd2VyVG9GaWVsZFZhbHVlKGZpZWxkLCBhbnN3ZXJzW2ZpZWxkTmFtZV0pO1xuXHRcdFx0XHRpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGNvbnRlbnRbZmllbGROYW1lXSA9IHZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBhY3Rpb246ICdhY2NlcHQnLCBjb250ZW50IH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyb3IsIGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gRmFpbGVkIHRvIGhhbmRsZSBlbGljaXRhdGlvbiByZXF1ZXN0OiBtZXNzYWdlPVwiJHttZXNzYWdlUHJldmlld31cImApO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0cmVzcG9uZFRvVXNlcklucHV0UmVxdWVzdChyZXF1ZXN0SWQ6IHN0cmluZywgcmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZCwgYW5zd2Vycz86IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4pOiBib29sZWFuIHtcblx0XHRjb25zdCBwZW5kaW5nUGxhblJldmlldyA9IHRoaXMuX3BlbmRpbmdQbGFuUmV2aWV3cy5nZXRNZXRhZGF0YShyZXF1ZXN0SWQpO1xuXHRcdGlmIChwZW5kaW5nUGxhblJldmlldykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3BlbmRpbmdQbGFuUmV2aWV3cy5yZXNwb25kKHJlcXVlc3RJZCwgdGhpcy5fcmVzb2x2ZUV4aXRQbGFuTW9kZShwZW5kaW5nUGxhblJldmlldywgcmVzcG9uc2UsIGFuc3dlcnMpKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fcGVuZGluZ0VsaWNpdGF0aW9ucy5yZXNwb25kKHJlcXVlc3RJZCwgeyByZXNwb25zZSwgYW5zd2VycyB9KSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdVc2VySW5wdXRzLnJlc3BvbmQocmVxdWVzdElkLCB7IHJlc3BvbnNlLCBhbnN3ZXJzIH0pKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1hcHMgYW4gYGV4aXRfcGxhbl9tb2RlYCBpbnB1dCByZXNwb25zZSBiYWNrIHRvIGFuXG5cdCAqIHtAbGluayBDb3BpbG90RXhpdFBsYW5Nb2RlUmVzcG9uc2V9IHRoYXQgdGhlIENMSSBjYW4gZmVlZCBpbnRvXG5cdCAqIGBzZXNzaW9uLnJlc3BvbmRUb0V4aXRQbGFuTW9kZWAuIE1hcHBpbmcgcnVsZXM6XG5cdCAqXG5cdCAqICAtIERlY2xpbmUgLyBDYW5jZWwgLyBubyBhbnN3ZXIgXHUyMTkyIGB7IGFwcHJvdmVkOiBmYWxzZSB9YCAobW9kZWwgZ2V0cyBhXG5cdCAqICAgIHJlamVjdGlvbiByZXN1bHQgYW5kIHN0YXlzIGluIHBsYW4gbW9kZSkuXG5cdCAqICAtIEFjY2VwdCArIGZyZWVmb3JtIGZlZWRiYWNrIFx1MjE5MiBgeyBhcHByb3ZlZDogZmFsc2UsIGZlZWRiYWNrLCBzZWxlY3RlZEFjdGlvbj8gfWBcblx0ICogICAgKHRoZSBTREsgdHJlYXRzIHRoaXMgYXMgYSByZXZpc2lvbiByZXF1ZXN0IGFuZCByZS1lbWl0c1xuXHQgKiAgICBgZXhpdF9wbGFuX21vZGUucmVxdWVzdGVkYCBhZnRlciByZXZpc2luZyB0aGUgcGxhbikuXG5cdCAqICAtIEFjY2VwdCArIHNlbGVjdGVkIG9wdGlvbiBcdTIxOTIgYHsgYXBwcm92ZWQ6IHRydWUsIHNlbGVjdGVkQWN0aW9uLCBhdXRvQXBwcm92ZUVkaXRzIH1gXG5cdCAqICAgIHdoZXJlIGBhdXRvQXBwcm92ZUVkaXRzYCBpcyBzZXQgZm9yIHRoZSBhdXRvcGlsb3QgdmFyaWFudHMuXG5cdCAqXG5cdCAqIGBzZWxlY3RlZEFjdGlvbmAgaXMgdmFsaWRhdGVkIGFnYWluc3QgdGhlIFNESydzIG9mZmVyZWQgYGFjdGlvbnNgOyBhblxuXHQgKiB1bmtub3duIHZhbHVlIGlzIHRyZWF0ZWQgYXMgYSBkZWNsaW5lIHNvIHRoZSBTREsgaXNuJ3QgZmVkIGEgdmFsdWUgaXRcblx0ICogY2Fubm90IGhhbmRsZS5cblx0ICovXG5cdHByaXZhdGUgX3Jlc29sdmVFeGl0UGxhbk1vZGUoXG5cdFx0cGVuZGluZzogeyBhY3Rpb25zOiByZWFkb25seSBzdHJpbmdbXTsgcmVjb21tZW5kZWRBY3Rpb246IHN0cmluZzsgcXVlc3Rpb25JZDogc3RyaW5nIH0sXG5cdFx0cmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZCxcblx0XHRhbnN3ZXJzPzogUmVjb3JkPHN0cmluZywgQ2hhdElucHV0QW5zd2VyPixcblx0KTogQ29waWxvdEV4aXRQbGFuTW9kZVJlc3BvbnNlIHtcblx0XHRpZiAocmVzcG9uc2UgIT09IENoYXRJbnB1dFJlc3BvbnNlS2luZC5BY2NlcHQpIHtcblx0XHRcdHJldHVybiB7IGFwcHJvdmVkOiBmYWxzZSB9O1xuXHRcdH1cblx0XHRjb25zdCBhbnN3ZXIgPSBhbnN3ZXJzPy5bcGVuZGluZy5xdWVzdGlvbklkXTtcblx0XHRpZiAoIWFuc3dlciB8fCBhbnN3ZXIuc3RhdGUgPT09IENoYXRJbnB1dEFuc3dlclN0YXRlLlNraXBwZWQpIHtcblx0XHRcdHJldHVybiB7IGFwcHJvdmVkOiBmYWxzZSB9O1xuXHRcdH1cblx0XHRjb25zdCB2YWx1ZSA9IGFuc3dlci52YWx1ZTtcblxuXHRcdC8vIERldGVybWluZSB0aGUgc2VsZWN0ZWQgYWN0aW9uIGFuZCBhbnkgZnJlZWZvcm0gZmVlZGJhY2suIFRoZVxuXHRcdC8vIGBzaW5nbGUtc2VsZWN0YCBxdWVzdGlvbiBtYXkgY2FycnkgYm90aCAod2hlbiB0aGUgdXNlciBwaWNrcyBhblxuXHRcdC8vIG9wdGlvbiBBTkQgdHlwZXMgZmVlZGJhY2spLCBvciBqdXN0IGZyZWVmb3JtIHRleHQgKHdoZW4gdGhlXG5cdFx0Ly8gdXNlciB0eXBlcyBpbnN0ZWFkIG9mIHBpY2tpbmcpLiBOb3JtYWxpemUgdG8gb25lIHNoYXBlLlxuXHRcdGxldCBjYW5kaWRhdGVBY3Rpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZmVlZGJhY2s6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAodmFsdWUua2luZCA9PT0gQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlNlbGVjdGVkKSB7XG5cdFx0XHRjYW5kaWRhdGVBY3Rpb24gPSB2YWx1ZS52YWx1ZTtcblx0XHRcdGNvbnN0IGZyZWVmb3JtID0gdmFsdWUuZnJlZWZvcm1WYWx1ZXM/LmZpbmQocyA9PiBzLnRyaW0oKS5sZW5ndGggPiAwKT8udHJpbSgpO1xuXHRcdFx0ZmVlZGJhY2sgPSBmcmVlZm9ybTtcblx0XHR9IGVsc2UgaWYgKHZhbHVlLmtpbmQgPT09IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0KSB7XG5cdFx0XHRmZWVkYmFjayA9IHZhbHVlLnZhbHVlLnRyaW0oKSB8fCB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB7IGFwcHJvdmVkOiBmYWxzZSB9O1xuXHRcdH1cblxuXHRcdC8vIENsYW1wIGBzZWxlY3RlZEFjdGlvbmAgdG8gdGhlIFNESydzIG9mZmVyZWQgc2V0LiBBbnl0aGluZyBlbHNlXG5cdFx0Ly8gKGluY2x1ZGluZyBmcmVlZm9ybSB0ZXh0IHNtdWdnbGVkIGludG8gdGhlIGB2YWx1ZWAgZmllbGQpIGZhbGxzXG5cdFx0Ly8gYmFjayB0byB0aGUgcmVjb21tZW5kZWQgYWN0aW9uIHNvIHdlIG5ldmVyIGZlZWQgdGhlIFNESyBhIHZhbHVlXG5cdFx0Ly8gaXQgY2FuJ3QgYWN0IG9uLlxuXHRcdGNvbnN0IHNlbGVjdGVkQWN0aW9uID0gY2FuZGlkYXRlQWN0aW9uICYmIHBlbmRpbmcuYWN0aW9ucy5pbmNsdWRlcyhjYW5kaWRhdGVBY3Rpb24pXG5cdFx0XHQ/IGNhbmRpZGF0ZUFjdGlvblxuXHRcdFx0OiBwZW5kaW5nLmFjdGlvbnMuaW5jbHVkZXMocGVuZGluZy5yZWNvbW1lbmRlZEFjdGlvbilcblx0XHRcdFx0PyBwZW5kaW5nLnJlY29tbWVuZGVkQWN0aW9uXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0Ly8gRnJlZWZvcm0gZmVlZGJhY2sgPT4gcmV2aXNpb24gcmVxdWVzdC4gVGhlIFNESyBzZW1hbnRpY3MgYXJlXG5cdFx0Ly8gYGFwcHJvdmVkOiBmYWxzZWAgd2l0aCBhIG5vbi1lbXB0eSBgZmVlZGJhY2tgOyBpdCB3aWxsIHJldmlzZVxuXHRcdC8vIHRoZSBwbGFuIGFuZCByZS1lbWl0IGBleGl0X3BsYW5fbW9kZS5yZXF1ZXN0ZWRgLlxuXHRcdGlmIChmZWVkYmFjaykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0YXBwcm92ZWQ6IGZhbHNlLFxuXHRcdFx0XHRmZWVkYmFjayxcblx0XHRcdFx0Li4uKHNlbGVjdGVkQWN0aW9uID8geyBzZWxlY3RlZEFjdGlvbiB9IDoge30pLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBObyBzZWxlY3RhYmxlIGFjdGlvbiBhbmQgbm8gZmVlZGJhY2sgXHUyMDE0IG5vdGhpbmcgYWN0aW9uYWJsZS5cblx0XHRpZiAoIXNlbGVjdGVkQWN0aW9uKSB7XG5cdFx0XHRyZXR1cm4geyBhcHByb3ZlZDogZmFsc2UgfTtcblx0XHR9XG5cblx0XHQvLyBSZWZsZWN0IHRoZSBjaG9zZW4gaW1wbGVtZW50YXRpb24gcGF0aCBvbiB0aGUgQUhQIGBtb2RlYCBheGlzIHJpZ2h0XG5cdFx0Ly8gYXdheSBzbyB0aGUgbW9kZSBwaWNrZXIgdXBkYXRlcyBhcyBzb29uIGFzIHRoZSB1c2VyIGFwcHJvdmVzIHRoZVxuXHRcdC8vIHBsYW4gKGUuZy4gUGxhbiBcdTIxOTIgQXV0b3BpbG90IHdoZW4gdGhleSBwaWNrIFwiSW1wbGVtZW50IHdpdGhcblx0XHQvLyBBdXRvcGlsb3RcIikuIFRoZSBTREsgYWxzbyBmaXJlcyBgc2Vzc2lvbi5tb2RlX2NoYW5nZWRgLCBidXQgdGhhdCBpc1xuXHRcdC8vIGFzeW5jOyB3cml0aW5nIGhlcmUgbWFrZXMgdGhlIFVJIHVwZGF0ZSBkZXRlcm1pbmlzdGljLiBUaGUgcGF0Y2ggaXNcblx0XHQvLyBpZGVtcG90ZW50LCBzbyB0aGUgbGF0ZXIgZXZlbnQgaXMgYSBuby1vcC5cblx0XHR0aGlzLl9zeW5jQWhwTW9kZUZyb21FeGl0UGxhbkFjdGlvbihzZWxlY3RlZEFjdGlvbik7XG5cblx0XHRjb25zdCBpc0F1dG9waWxvdCA9IHNlbGVjdGVkQWN0aW9uID09PSAnYXV0b3BpbG90JyB8fCBzZWxlY3RlZEFjdGlvbiA9PT0gJ2F1dG9waWxvdF9mbGVldCc7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGFwcHJvdmVkOiB0cnVlLFxuXHRcdFx0c2VsZWN0ZWRBY3Rpb24sXG5cdFx0XHQuLi4oaXNBdXRvcGlsb3QgJiYgdGhpcy5faXNCeXBhc3NBcHByb3ZhbHMoKSA/IHsgYXV0b0FwcHJvdmVFZGl0czogdHJ1ZSB9IDoge30pLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogVHJhbnNsYXRlcyBhbiBhcHByb3ZlZCBgZXhpdF9wbGFuX21vZGVgIGFjdGlvbiBpbnRvIHRoZSBBSFAgYG1vZGVgIGF4aXNcblx0ICogYW5kIHdyaXRlcyBpdCBzbyB0aGUgbW9kZSBwaWNrZXIgcmVmbGVjdHMgdGhlIGNob2ljZSBpbW1lZGlhdGVseTpcblx0ICpcblx0ICogIC0gYGF1dG9waWxvdGAgLyBgYXV0b3BpbG90X2ZsZWV0YCBcdTIxOTIgYG1vZGU9J2F1dG9waWxvdCdgLlxuXHQgKiAgLSBgaW50ZXJhY3RpdmVgIFx1MjE5MiBgbW9kZT0naW50ZXJhY3RpdmUnYC5cblx0ICogIC0gYGV4aXRfb25seWAgKGFwcHJvdmUgcGxhbiB3aXRob3V0IGV4ZWN1dGluZykgbGVhdmVzIHRoZSBtb2RlIHVudG91Y2hlZC5cblx0ICovXG5cdHByaXZhdGUgX3N5bmNBaHBNb2RlRnJvbUV4aXRQbGFuQWN0aW9uKHNlbGVjdGVkQWN0aW9uOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRzd2l0Y2ggKHNlbGVjdGVkQWN0aW9uKSB7XG5cdFx0XHRjYXNlICdhdXRvcGlsb3QnOlxuXHRcdFx0Y2FzZSAnYXV0b3BpbG90X2ZsZWV0Jzpcblx0XHRcdFx0dGhpcy5fc3luY0FocENvbmZpZ0Zyb21TZGtNb2RlKCdhdXRvcGlsb3QnKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdpbnRlcmFjdGl2ZSc6XG5cdFx0XHRcdHRoaXMuX3N5bmNBaHBDb25maWdGcm9tU2RrTW9kZSgnaW50ZXJhY3RpdmUnKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlUHJlVG9vbFVzZShpbnB1dDogUHJlVG9vbFVzZUhvb2tJbnB1dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoaXNFZGl0VG9vbChpbnB1dC50b29sTmFtZSwgZ2V0VG9vbENvbW1hbmQoaW5wdXQpKSkge1xuXHRcdFx0XHRjb25zdCBmaWxlUGF0aHMgPSB0aGlzLl9nZXRFZGl0RmlsZVBhdGhzKGlucHV0LnRvb2xBcmdzKTtcblx0XHRcdFx0Y29uc3QgbW9kZSA9IHRoaXMuX2dldENvbmZpZ3VyZWRBZ2VudE1vZGUoKTtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoZmlsZVBhdGhzLm1hcChwID0+IHRoaXMuX2VkaXRUcmFja2VyLnRyYWNrRWRpdFN0YXJ0KHAsIG1vZGUpKSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyb3IsIGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gRmFpbGVkIGluIG9uUHJlVG9vbFVzZTogdG9vbD0ke2lucHV0LnRvb2xOYW1lfWApO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlUG9zdFRvb2xVc2UoaW5wdXQ6IFBvc3RUb29sVXNlSG9va0lucHV0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGlmIChpc0VkaXRUb29sKGlucHV0LnRvb2xOYW1lLCBnZXRUb29sQ29tbWFuZChpbnB1dCkpKSB7XG5cdFx0XHRcdGNvbnN0IGZpbGVQYXRocyA9IHRoaXMuX2dldEVkaXRGaWxlUGF0aHMoaW5wdXQudG9vbEFyZ3MpO1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChmaWxlUGF0aHMubWFwKHAgPT4gdGhpcy5fZWRpdFRyYWNrZXIuY29tcGxldGVFZGl0KHApKSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyb3IsIGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gRmFpbGVkIGluIG9uUG9zdFRvb2xVc2U6IHRvb2w9JHtpbnB1dC50b29sTmFtZX1gKTtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2JlZ2luUmVwb0luZm9UZWxlbWV0cnkodGVsZW1ldHJ5TWVzc2FnZUlkOiBzdHJpbmcsIGNsaWVudFR5cGU6IEFnZW50SG9zdENsaWVudFR5cGUsIGlzQ3VycmVudDogKCkgPT4gYm9vbGVhbik6IFByb21pc2U8eyByZWFkb25seSBjb250ZXh0OiBJQWdlbnRIb3N0UmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQ7IHJlYWRvbmx5IGJhc2VCcmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0bGV0IHJlc29sdmVkOiB7IHJlYWRvbmx5IGNvbnRleHQ6IElBZ2VudEhvc3RSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dDsgcmVhZG9ubHkgYmFzZUJyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkIH0gfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdHJlc29sdmVkID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVJlcG9JbmZvVGVsZW1ldHJ5Q29udGV4dCgpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBGYWlsZWQgdG8gcmVzb2x2ZSByZXBvc2l0b3J5IGluZm8gdGVsZW1ldHJ5IGNvbnRleHQ6ICR7Z2V0RXJyb3JNZXNzYWdlKGVycm9yKX1gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghcmVzb2x2ZWQgfHwgdGhpcy5fc3RvcmUuaXNEaXNwb3NlZCB8fCAhaXNDdXJyZW50KCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX3JlcG9JbmZvVGVsZW1ldHJ5LnJlcG9ydEJlZ2luKHJlc29sdmVkLmNvbnRleHQsIHRoaXMucmVzb3VyY2VVcmkudG9TdHJpbmcoKSwgdGVsZW1ldHJ5TWVzc2FnZUlkLCBjbGllbnRUeXBlLCB0aGlzLl93b3JraW5nRGlyZWN0b3J5LCByZXNvbHZlZC5iYXNlQnJhbmNoLCBpc0N1cnJlbnQsIHBhdGhzID0+IHRoaXMuX3dyYXBwZXIuc2Vzc2lvbi5ycGMuY29udGVudEV4Y2x1c2lvbi5jaGVja1BhdGhzKHsgcGF0aHM6IFsuLi5wYXRoc10gfSkpO1xuXHRcdHJldHVybiByZXNvbHZlZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2VuZFJlcG9JbmZvVGVsZW1ldHJ5KHRlbGVtZXRyeU1lc3NhZ2VJZDogc3RyaW5nLCByZXNvbHZlZDogeyByZWFkb25seSBjb250ZXh0OiBJQWdlbnRIb3N0UmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQ7IHJlYWRvbmx5IGJhc2VCcmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkLCBpc0N1cnJlbnQ6ICgpID0+IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXJlc29sdmVkIHx8IHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQgfHwgIWlzQ3VycmVudCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX3JlcG9JbmZvVGVsZW1ldHJ5LnJlcG9ydEVuZChyZXNvbHZlZC5jb250ZXh0LCB0aGlzLnJlc291cmNlVXJpLnRvU3RyaW5nKCksIHRlbGVtZXRyeU1lc3NhZ2VJZCwgdGhpcy5fd29ya2luZ0RpcmVjdG9yeSwgcmVzb2x2ZWQuYmFzZUJyYW5jaCwgaXNDdXJyZW50LCBwYXRocyA9PiB0aGlzLl93cmFwcGVyLnNlc3Npb24ucnBjLmNvbnRlbnRFeGNsdXNpb24uY2hlY2tQYXRocyh7IHBhdGhzOiBbLi4ucGF0aHNdIH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbXBsZXRlQWN0aXZlUmVwb0luZm9UZWxlbWV0cnkoKTogdm9pZCB7XG5cdFx0Y29uc3QgdHVybiA9IHRoaXMuX2FjdGl2ZVJlcG9JbmZvVHVybjtcblx0XHRpZiAoIXR1cm4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYWN0aXZlUmVwb0luZm9UdXJuID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGlzQ3VycmVudCA9ICgpID0+ICF0dXJuLmNhbmNlbGxlZCAmJiB0aGlzLl9pc0xhdW5jaFRva2VuQ3VycmVudCgpO1xuXHRcdHZvaWQgdHVybi5iZWdpbi50aGVuKHJlc29sdmVkID0+IHRoaXMuX2VuZFJlcG9JbmZvVGVsZW1ldHJ5KHR1cm4udGVsZW1ldHJ5TWVzc2FnZUlkLCByZXNvbHZlZCwgaXNDdXJyZW50KSk7XG5cdH1cblxuXHRwcml2YXRlIF9jYW5jZWxBY3RpdmVSZXBvSW5mb1RlbGVtZXRyeSgpOiB2b2lkIHtcblx0XHRjb25zdCB0dXJuID0gdGhpcy5fYWN0aXZlUmVwb0luZm9UdXJuO1xuXHRcdGlmICghdHVybikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9hY3RpdmVSZXBvSW5mb1R1cm4gPSB1bmRlZmluZWQ7XG5cdFx0dHVybi5jYW5jZWxsZWQgPSB0cnVlO1xuXHRcdHZvaWQgdHVybi5iZWdpbi5maW5hbGx5KCgpID0+IHRoaXMuX3JlcG9JbmZvVGVsZW1ldHJ5LmNsZWFyVHVybih0dXJuLnRlbGVtZXRyeU1lc3NhZ2VJZCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVJlcG9JbmZvVGVsZW1ldHJ5Q29udGV4dCgpOiBQcm9taXNlPHsgcmVhZG9ubHkgY29udGV4dDogSUFnZW50SG9zdFJlc3RyaWN0ZWRUZWxlbWV0cnlDb250ZXh0OyByZWFkb25seSBiYXNlQnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUocGxhdGZvcm1Sb290U2NoZW1hLCBBZ2VudEhvc3REaXNhYmxlUmVwb0luZm9UZWxlbWV0cnlDb25maWdLZXkpID09PSB0cnVlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBnaXRodWJUb2tlbiA9IHRoaXMuX2xhdW5jaFBsYW4uZ2l0aHViVG9rZW47XG5cdFx0aWYgKCFnaXRodWJUb2tlbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgW3Jhd0NvbnRleHQsIGJhc2VCcmFuY2hdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0dGhpcy5fY29waWxvdEFwaVNlcnZpY2UucmVzb2x2ZVJlc3RyaWN0ZWRUZWxlbWV0cnlDb250ZXh0KGdpdGh1YlRva2VuKSxcblx0XHRcdHRoaXMuX2RhdGFiYXNlUmVmLm9iamVjdC5nZXRNZXRhZGF0YShNRVRBX0RJRkZfQkFTRV9CUkFOQ0gpLFxuXHRcdF0pO1xuXHRcdGlmICghcmF3Q29udGV4dC5yZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZCAmJiAhcmF3Q29udGV4dC5pc0ludGVybmFsKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4geyBjb250ZXh0OiB0aGlzLl90b1JlcG9JbmZvVGVsZW1ldHJ5Q29udGV4dChyYXdDb250ZXh0KSwgYmFzZUJyYW5jaCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNMYXVuY2hUb2tlbkN1cnJlbnQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2xhdW5jaFBsYW4uZ2l0aHViVG9rZW4gIT09IHVuZGVmaW5lZCAmJiB0aGlzLl9pc0xhdW5jaFRva2VuU3RpbGxDdXJyZW50KCk7XG5cdH1cblxuXHRwcml2YXRlIF90b1JlcG9JbmZvVGVsZW1ldHJ5Q29udGV4dChjb250ZXh0OiBJUmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQpOiBJQWdlbnRIb3N0UmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZDogY29udGV4dC5yZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZCxcblx0XHRcdHRyYWNraW5nSWQ6IGNvbnRleHQudHJhY2tpbmdJZCxcblx0XHRcdHRlbGVtZXRyeUVuZHBvaW50OiBjb250ZXh0LnRlbGVtZXRyeUVuZHBvaW50ID8gYCR7Y29udGV4dC50ZWxlbWV0cnlFbmRwb2ludC5yZXBsYWNlKC9cXC8rJC8sICcnKX0vdGVsZW1ldHJ5YCA6IHVuZGVmaW5lZCxcblx0XHRcdGlzSW50ZXJuYWw6IGNvbnRleHQuaXNJbnRlcm5hbCA9PT0gdHJ1ZSxcblx0XHRcdHVzZXJOYW1lOiBjb250ZXh0LnVzZXJOYW1lLFxuXHRcdFx0aXNWc2NvZGVUZWFtTWVtYmVyOiBjb250ZXh0LmlzVnNjb2RlVGVhbU1lbWJlciA9PT0gdHJ1ZSxcblx0XHRcdGNvcGlsb3RJZ25vcmVFbmFibGVkOiBjb250ZXh0LmNvcGlsb3RJZ25vcmVFbmFibGVkLFxuXHRcdH07XG5cdH1cblxuXHQvLyAtLS0tIGV2ZW50IHdpcmluZyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBfc3Vic2NyaWJlVG9FdmVudHMoKTogdm9pZCB7XG5cdFx0Y29uc3Qgd3JhcHBlciA9IHRoaXMuX3dyYXBwZXI7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gdGhpcy5zZXNzaW9uSWQ7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uU3lzdGVtTm90aWZpY2F0aW9uKGUgPT4ge1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uID0gYnVpbGRDb3BpbG90U3lzdGVtTm90aWZpY2F0aW9uKGUpO1xuXHRcdFx0aWYgKCFub3RpZmljYXRpb24pIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBJZ25vcmluZyBzeXN0ZW0ubm90aWZpY2F0aW9uIGtpbmQ9JHtlLmRhdGEua2luZC50eXBlfWApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBTeXN0ZW0gbm90aWZpY2F0aW9uIHJlY2VpdmVkOiBraW5kPSR7ZS5kYXRhLmtpbmQudHlwZX1gKTtcblx0XHRcdGlmICh0aGlzLl90dXJuSWQpIHtcblx0XHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0LFxuXHRcdFx0XHRcdHR1cm5JZDogdGhpcy5fdHVybklkLFxuXHRcdFx0XHRcdHBhcnQ6IHtcblx0XHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuU3lzdGVtTm90aWZpY2F0aW9uLFxuXHRcdFx0XHRcdFx0Y29udGVudDogbm90aWZpY2F0aW9uLm1lc3NhZ2VUZXh0LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIW5vdGlmaWNhdGlvbi5zdGFydHNUdXJuKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gSWdub3JpbmcgcGFzc2l2ZSBzeXN0ZW0ubm90aWZpY2F0aW9uIGtpbmQ9JHtlLmRhdGEua2luZC50eXBlfSB3aXRob3V0IGFuIGFjdGl2ZSB0dXJuYCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdHVybklkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0XHR0aGlzLnJlc2V0VHVyblN0YXRlKHR1cm5JZCk7XG5cdFx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0c3RhcnRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0XHR0ZXh0OiBub3RpZmljYXRpb24ubWVzc2FnZVRleHQsXG5cdFx0XHRcdFx0b3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlN5c3RlbU5vdGlmaWNhdGlvbiB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSGFuZGxlIGB1c2VyLm1lc3NhZ2VgIGV2ZW50cyB3aXRoIHRocmVlIHJlc3BvbnNpYmlsaXRpZXM6XG5cdFx0Ly9cblx0XHQvLyAxLiBTa2lwIHN1YmFnZW50IGFuZCBTREstaW5qZWN0ZWQgKGBzb3VyY2UgIT09ICd1c2VyJ2ApIG1lc3NhZ2VzXG5cdFx0Ly8gICAgb3V0cmlnaHQgXHUyMDE0IG5laXRoZXIgcmVwcmVzZW50cyBhIHJvb3QgdXNlciB0dXJuIGFuZCBuZWl0aGVyIG1heVxuXHRcdC8vICAgIGJlIGFzc29jaWF0ZWQgd2l0aCB0aGUgcm9vdCB0dXJuIGJvdW5kYXJ5LlxuXHRcdC8vXG5cdFx0Ly8gMi4gSWYgdGhlIGNvbnRlbnQgbWF0Y2hlcyBhIHN0ZWVyaW5nIG1lc3NhZ2Ugd2UgYWNrbm93bGVkZ2VkXG5cdFx0Ly8gICAgdmlhIHtAbGluayBzZW5kU3RlZXJpbmd9LCBwcm9tb3RlIGl0IHRvIGl0cyBvd24gcHJvdG9jb2xcblx0XHQvLyAgICB0dXJuIChjbG9zaW5nIHRoZSBpbi1mbGlnaHQgdHVybikgQkVGT1JFIHN0ZXAgMyBzbyB0aGVcblx0XHQvLyAgICBldmVudCBpZCBpcyByZWNvcmRlZCBhZ2FpbnN0IHRoZSBuZXcgc3RlZXJpbmcgdHVybiByYXRoZXJcblx0XHQvLyAgICB0aGFuIHRoZSBwcmVlbXB0ZWQgb25lLlxuXHRcdC8vXG5cdFx0Ly8gMy4gUmVjb3JkIHRoZSBTREsgZXZlbnQgaWQgYWdhaW5zdCB0aGUgY3VycmVudCB0dXJuIHNvIHRoZVxuXHRcdC8vICAgIGBoaXN0b3J5LnRydW5jYXRlYCAvIGBzZXNzaW9ucy5mb3JrYCBSUENzIGNhbiB0YXJnZXQgdGhlXG5cdFx0Ly8gICAgcmlnaHQgYm91bmRhcnkuIFRoZSBEQiBvbmx5IHNldHMgYGV2ZW50X2lkYCB3aGVuIGl0J3MgTlVMTCxcblx0XHQvLyAgICBzbyBkb2luZyB0aGlzIGZvciBzeW50aGV0aWMgaW5qZWN0aW9ucyB3b3VsZCBwZXJtYW5lbnRseVxuXHRcdC8vICAgIHBpbiB0aGUgd3JvbmcgZXZlbnQgdG8gdGhlIHR1cm4uXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblVzZXJNZXNzYWdlKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWdlbnRJZCkge1xuXHRcdFx0XHR0aGlzLl9yZXN1bWVTdWJhZ2VudEZvckV2ZW50KGUsIHsgdGV4dDogZS5kYXRhLmNvbnRlbnQsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChlLmRhdGEuc291cmNlICYmIGUuZGF0YS5zb3VyY2UudG9Mb3dlckNhc2UoKSAhPT0gJ3VzZXInKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIEZpcnN0IFNESyBldmVudCBmb3IgdGhlIGxvb3A6IHByb21vdGUgdGhlIHR1cm4gb3V0IG9mIGBwZW5kaW5nYC5cblx0XHRcdHRoaXMuX2N1cnJlbnRUdXJuPy5tYXJrUnVubmluZygpO1xuXHRcdFx0Y29uc3Qgc3RlZXJpbmcgPSB0aGlzLl90YWtlTWF0Y2hpbmdQZW5kaW5nU3RlZXJpbmcoZS5kYXRhLmNvbnRlbnQpO1xuXHRcdFx0aWYgKHN0ZWVyaW5nKSB7XG5cdFx0XHRcdHRoaXMuX2JlZ2luU3RlZXJpbmdUdXJuKHN0ZWVyaW5nKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl90dXJuSWQpIHtcblx0XHRcdFx0dGhpcy5fZGF0YWJhc2VSZWYub2JqZWN0LnNldFR1cm5FdmVudElkKHRoaXMuX3R1cm5JZCwgZS5pZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vbk1lc3NhZ2VEZWx0YShlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gZGVsdGE6ICR7ZS5kYXRhLmRlbHRhQ29udGVudH1gKTtcblx0XHRcdHRoaXMuX3Jlc3VtZVN1YmFnZW50Rm9yRXZlbnQoZSk7XG5cdFx0XHRpZiAodGhpcy5fc2hvdWxkRHJvcFVubWFwcGVkU3ViYWdlbnRFdmVudChlLCAnYXNzaXN0YW50Lm1lc3NhZ2VfZGVsdGEnKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9lbWl0TWFya2Rvd25EZWx0YShlLmRhdGEuZGVsdGFDb250ZW50LCB0aGlzLl9wYXJlbnRUb29sQ2FsbElkRm9yU3ViYWdlbnRFdmVudChlKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vbk1lc3NhZ2UoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gRnVsbCBtZXNzYWdlIHJlY2VpdmVkOiAke2UuZGF0YS5jb250ZW50Lmxlbmd0aH0gY2hhcnNgKTtcblx0XHRcdHRoaXMuX3Jlc3VtZVN1YmFnZW50Rm9yRXZlbnQoZSk7XG5cdFx0XHQvLyBSZXBvcnQgdGhlIGVuaGFuY2VkIEdIIGByZXF1ZXN0Lm9wdGlvbnMudG9vbHNgIGV2ZW50IGZvciB0aGlzIG1vZGVsIGNhbGwgXHUyMDE0IHBhcml0eSB3aXRoXG5cdFx0XHQvLyB0aGUgQ29waWxvdCBleHRlbnNpb24sIHdoaWNoIGVtaXRzIGl0IHBlciBMTE0gcmVxdWVzdC4gYGFzc2lzdGFudC5tZXNzYWdlYCBpcyB0aGVcblx0XHRcdC8vIGFnZW50LWhvc3QncyBwZXItbW9kZWwtY2FsbCBib3VuZGFyeTsgd2UgY29ycmVsYXRlIG9uIGl0cyBjbGllbnQtbWludGVkIGB4LXJlcXVlc3QtaWRgLlxuXHRcdFx0Ly8gTWFpbiBhZ2VudCBvbmx5OiBgX2FwcGxpZWRTbmFwc2hvdC50b29sc2AgaXMgdGhlIHNlc3Npb24ncyB0b29sIHNldCwgd2hpY2ggZG9lcyBub3Rcblx0XHRcdC8vIGRlc2NyaWJlIGEgc3ViYWdlbnQncyBtb2RlbCBjYWxsLCBzbyBzdWJhZ2VudCBtZXNzYWdlcyAobWFwcGVkIG9yIGRyb3BwZWQpIGFyZSBza2lwcGVkLlxuXHRcdFx0aWYgKCFlLmFnZW50SWQpIHtcblx0XHRcdFx0Y29uc3QgY2xpZW50VHlwZSA9IHRoaXMuX2N1cnJlbnRUdXJuPy5jbGllbnRUeXBlID8/IEFnZW50SG9zdENsaWVudFR5cGUuVW5rbm93bjtcblx0XHRcdFx0dm9pZCB0aGlzLl90ZWxlbWV0cnlSZXBvcnRlci5hc3Npc3RhbnRNZXNzYWdlUmVjZWl2ZWQodGhpcy5yZXNvdXJjZVVyaS50b1N0cmluZygpLCBjbGllbnRUeXBlLCBlLmRhdGEuY2xpZW50UmVxdWVzdElkLCB0aGlzLl9hcHBsaWVkU25hcHNob3QudG9vbHMpLmNhdGNoKGVyciA9PiB0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gVGVsZW1ldHJ5IGVtaXNzaW9uIGZhaWxlZDogJHtnZXRFcnJvck1lc3NhZ2UoZXJyKX1gKSk7XG5cdFx0XHRcdC8vIFJlc3RyaWN0ZWQgYGNvbnZlcnNhdGlvbi5tZXNzYWdlVGV4dGAgKHNvdXJjZT1tb2RlbCk6IHRoZSBtb2RlbCdzIHJhdyByZXNwb25zZSB0ZXh0LlxuXHRcdFx0XHR2b2lkIHRoaXMuX3RlbGVtZXRyeVJlcG9ydGVyLm1vZGVsTWVzc2FnZVRleHQodGhpcy5yZXNvdXJjZVVyaS50b1N0cmluZygpLCBjbGllbnRUeXBlLCBlLmRhdGEuY29udGVudCwgdGhpcy5fdHVybk9yZGluYWwsIGUuZGF0YS5jbGllbnRSZXF1ZXN0SWQpLmNhdGNoKGVyciA9PiB0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gVGVsZW1ldHJ5IGVtaXNzaW9uIGZhaWxlZDogJHtnZXRFcnJvck1lc3NhZ2UoZXJyKX1gKSk7XG5cdFx0XHRcdC8vIEFjY3VtdWxhdGUgdGhlIHBlci10dXJuIHRvb2wtY2FsbCBhZ2dyZWdhdGUgZm9yIHRoZSByZXN0cmljdGVkIGB0b29sQ2FsbERldGFpbHNgIGV2ZW50LlxuXHRcdFx0XHQvLyBFdmVyeSBtYWluLWFnZW50IGBhc3Npc3RhbnQubWVzc2FnZWAgaXMgb25lIG1vZGVsLWNhbGwgcm91bmQgKG1hdGNoZXMgdGhlIGV4dGVuc2lvbidzXG5cdFx0XHRcdC8vIGBudW1SZXF1ZXN0cyA9IHRvb2xDYWxsUm91bmRzLmxlbmd0aGAsIHdoaWNoIGNvdW50cyB0aGUgZmluYWwgdG9vbC1mcmVlIHJlc3BvbnNlIHJvdW5kXG5cdFx0XHRcdC8vIHRvbyk7IHRoZSB0b29sLWNvdW50IHN0YXRzIG9ubHkgYXBwbHkgdG8gcm91bmRzIHRoYXQgY2FycmllZCB0b29sIHJlcXVlc3RzLlxuXHRcdFx0XHRjb25zdCB0dXJuID0gdGhpcy5fY3VycmVudFR1cm47XG5cdFx0XHRcdGlmICh0dXJuKSB7XG5cdFx0XHRcdFx0dHVybi50b29sQ2FsbFJvdW5kcysrO1xuXHRcdFx0XHRcdGlmIChlLmRhdGEubW9kZWwpIHtcblx0XHRcdFx0XHRcdHR1cm4ubGFzdE1vZGVsID0gZS5kYXRhLm1vZGVsO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCB0b29sUmVxdWVzdHMgPSBlLmRhdGEudG9vbFJlcXVlc3RzO1xuXHRcdFx0XHRcdGlmICh0b29sUmVxdWVzdHM/Lmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0dHVybi50b3RhbFRvb2xDYWxscyArPSB0b29sUmVxdWVzdHMubGVuZ3RoO1xuXHRcdFx0XHRcdFx0aWYgKHRvb2xSZXF1ZXN0cy5sZW5ndGggPiAxKSB7XG5cdFx0XHRcdFx0XHRcdHR1cm4ucGFyYWxsZWxUb29sQ2FsbFJvdW5kcysrO1xuXHRcdFx0XHRcdFx0XHR0dXJuLnBhcmFsbGVsVG9vbENhbGxzVG90YWwgKz0gdG9vbFJlcXVlc3RzLmxlbmd0aDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGZvciAoY29uc3QgcmVxIG9mIHRvb2xSZXF1ZXN0cykge1xuXHRcdFx0XHRcdFx0XHR0dXJuLnRvb2xDb3VudHMuc2V0KHJlcS5uYW1lLCAodHVybi50b29sQ291bnRzLmdldChyZXEubmFtZSkgPz8gMCkgKyAxKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIFRoZSBTREsgZmlyZXMgYSBgbWVzc2FnZWAgZXZlbnQgd2l0aCB0aGUgZnVsbCBhc3NlbWJsZWQgY29udGVudCBhZnRlclxuXHRcdFx0Ly8gc3RyZWFtaW5nIGRlbHRhcy4gSWYgZGVsdGFzIGFscmVhZHkgY3JlYXRlZCBhIG1hcmtkb3duIHBhcnQgZm9yIHRoaXNcblx0XHRcdC8vIHR1cm4sIHRoZSBsaXZlIHN0YXRlIGlzIHVwIHRvIGRhdGUgYW5kIHdlIHNraXAuIE9ubHkgZW1pdCBhIGZyZXNoXG5cdFx0XHQvLyBwYXJ0IHdoZW4gbm8gZGVsdGFzIHByZWNlZGVkIHRoZSBtZXNzYWdlIChlLmcuIHRleHQgYWZ0ZXIgdG9vbCBjYWxsc1xuXHRcdFx0Ly8gd2hlcmUgdGhlIFNESyBkZWxpdmVyZWQgdGhlIGZ1bGwgbWVzc2FnZSBhdCBvbmNlKS5cblx0XHRcdC8vXG5cdFx0XHQvLyBPdGhlciBmaWVsZHMgKHRvb2xSZXF1ZXN0cywgcmVhc29uaW5nVGV4dCwgZW5jcnlwdGVkQ29udGVudCkgYXJlXG5cdFx0XHQvLyBvbmx5IHVzZWQgZm9yIGhpc3RvcnkgcmVjb25zdHJ1Y3Rpb24gYW5kIGxpdmUgdG9vbCBjYWxscyBmaXJlIHRoZWlyXG5cdFx0XHQvLyBvd24gdG9vbF9zdGFydCBldmVudHMsIHNvIHdlIGNhbiBzYWZlbHkgZHJvcCB0aGVtIGhlcmUuXG5cdFx0XHRpZiAodGhpcy5fc2hvdWxkRHJvcFVubWFwcGVkU3ViYWdlbnRFdmVudChlLCAnYXNzaXN0YW50Lm1lc3NhZ2UnKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwYXJlbnRUb29sQ2FsbElkID0gdGhpcy5fcGFyZW50VG9vbENhbGxJZEZvclN1YmFnZW50RXZlbnQoZSk7XG5cdFx0XHRjb25zdCBtYXJrZG93blNjb3BlID0gcGFyZW50VG9vbENhbGxJZCA/PyAnJztcblx0XHRcdGlmIChlLmRhdGEuY29udGVudCAmJiAhdGhpcy5fY3VycmVudFR1cm4/Lm1hcmtkb3duUGFydElkcy5oYXMobWFya2Rvd25TY29wZSkpIHtcblx0XHRcdFx0Y29uc3QgcGFydElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRUdXJuPy5tYXJrZG93blBhcnRJZHMuc2V0KG1hcmtkb3duU2NvcGUsIHBhcnRJZCk7XG5cdFx0XHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCxcblx0XHRcdFx0XHR0dXJuSWQ6IHRoaXMuX3R1cm5JZCxcblx0XHRcdFx0XHRwYXJ0OiB7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiBwYXJ0SWQsIGNvbnRlbnQ6IGUuZGF0YS5jb250ZW50IH0sXG5cdFx0XHRcdH0sIHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuZGF0YS50b29sUmVxdWVzdHM/Lmxlbmd0aCkge1xuXHRcdFx0XHQvLyBXYWl0IGZvciB0aGUgZnVsbCBtZXNzYWdlIGJvdW5kYXJ5OyBjbGVhcmluZyBvbiBhbiBlYXJsaWVyIHRvb2wgZGVsdGEgd291bGQgZHVwbGljYXRlIGFzc2VtYmxlZCBtYXJrZG93bi5cblx0XHRcdFx0dGhpcy5fYmVnaW5Ub29sQ2FsbFJvdW5kKHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFRPRE9AY29ubm9yNDMxMjogUmVtb3ZlIHRoaXMgY29ycmVsYXRpb24gb25jZSB0aGUgU0RLIHBlcm1pc3Npb24gY2FsbGJhY2sgaW5jbHVkZXMgYXV0by1hcHByb3ZhbCBkYXRhLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25QZXJtaXNzaW9uUmVxdWVzdGVkKGUgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbENhbGxJZCA9IGUuZGF0YS5wZXJtaXNzaW9uUmVxdWVzdC50b29sQ2FsbElkO1xuXHRcdFx0aWYgKCF0b29sQ2FsbElkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3JlY29yZEF1dG9BcHByb3ZhbCh0b29sQ2FsbElkLCBlLmRhdGEucHJvbXB0UmVxdWVzdD8uYXV0b0FwcHJvdmFsKTtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fdG9vbEFwcHJvdmFsUmVjb3Jkcy5nZXQodG9vbENhbGxJZCk7XG5cdFx0XHRjb25zdCBwZXJtaXNzaW9uUmVxdWVzdCA9IGUuZGF0YS5wZXJtaXNzaW9uUmVxdWVzdCBhcyB7IHJlcXVlc3RTYW5kYm94QnlwYXNzPzogYm9vbGVhbjsgdG9vbE5hbWU/OiBzdHJpbmcgfTtcblx0XHRcdHRoaXMuX3Rvb2xBcHByb3ZhbFJlY29yZHMuc2V0KHRvb2xDYWxsSWQsIHtcblx0XHRcdFx0cGVybWlzc2lvblJlcXVlc3RlZDogdHJ1ZSxcblx0XHRcdFx0cmVzb2x2ZWRCeUhvb2s6IGV4aXN0aW5nPy5yZXNvbHZlZEJ5SG9vayB8fCBlLmRhdGEucmVzb2x2ZWRCeUhvb2sgPT09IHRydWUsXG5cdFx0XHRcdHJlcXVlc3RTYW5kYm94QnlwYXNzOiBleGlzdGluZz8ucmVxdWVzdFNhbmRib3hCeXBhc3MgfHwgcGVybWlzc2lvblJlcXVlc3QucmVxdWVzdFNhbmRib3hCeXBhc3MgPT09IHRydWUsXG5cdFx0XHRcdHJlc3VsdEtpbmQ6IGV4aXN0aW5nPy5yZXN1bHRLaW5kLFxuXHRcdFx0XHR0b29sTmFtZTogZXhpc3Rpbmc/LnRvb2xOYW1lID8/IHBlcm1pc3Npb25SZXF1ZXN0LnRvb2xOYW1lLFxuXHRcdFx0XHRtY3BTZXJ2ZXJOYW1lOiBleGlzdGluZz8ubWNwU2VydmVyTmFtZSxcblx0XHRcdFx0cmVwb3J0ZWQ6IGV4aXN0aW5nPy5yZXBvcnRlZCA/PyBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25QZXJtaXNzaW9uQ29tcGxldGVkKGUgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbENhbGxJZCA9IGUuZGF0YS50b29sQ2FsbElkO1xuXHRcdFx0aWYgKCF0b29sQ2FsbElkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fdG9vbEFwcHJvdmFsUmVjb3Jkcy5nZXQodG9vbENhbGxJZCk7XG5cdFx0XHRjb25zdCByZWNvcmQgPSB7XG5cdFx0XHRcdHBlcm1pc3Npb25SZXF1ZXN0ZWQ6IGV4aXN0aW5nPy5wZXJtaXNzaW9uUmVxdWVzdGVkID8/IHRydWUsXG5cdFx0XHRcdHJlc29sdmVkQnlIb29rOiBleGlzdGluZz8ucmVzb2x2ZWRCeUhvb2sgPz8gZmFsc2UsXG5cdFx0XHRcdHJlcXVlc3RTYW5kYm94QnlwYXNzOiBleGlzdGluZz8ucmVxdWVzdFNhbmRib3hCeXBhc3MgPz8gZmFsc2UsXG5cdFx0XHRcdHJlc3VsdEtpbmQ6IGUuZGF0YS5yZXN1bHQua2luZCxcblx0XHRcdFx0dG9vbE5hbWU6IGV4aXN0aW5nPy50b29sTmFtZSxcblx0XHRcdFx0bWNwU2VydmVyTmFtZTogZXhpc3Rpbmc/Lm1jcFNlcnZlck5hbWUsXG5cdFx0XHRcdHJlcG9ydGVkOiBleGlzdGluZz8ucmVwb3J0ZWQgPz8gZmFsc2UsXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5fdG9vbEFwcHJvdmFsUmVjb3Jkcy5zZXQodG9vbENhbGxJZCwgcmVjb3JkKTtcblx0XHRcdHRoaXMuX3JlcG9ydFRvb2xBcHByb3ZhbCh0b29sQ2FsbElkLCByZWNvcmQudG9vbE5hbWUsIHJlY29yZC5tY3BTZXJ2ZXJOYW1lKTtcblx0XHRcdGlmIChpc1Blcm1pc3Npb25EZW5pZWRLaW5kKHJlY29yZC5yZXN1bHRLaW5kKSkge1xuXHRcdFx0XHR0aGlzLl90b29sQXBwcm92YWxSZWNvcmRzLmRlbGV0ZSh0b29sQ2FsbElkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uVG9vbENhbGxEZWx0YShlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gVG9vbCBjYWxsIGRlbHRhOiAke2UuZGF0YS50b29sTmFtZSA/PyAnPHBlbmRpbmc+J30gKCR7ZS5kYXRhLnRvb2xDYWxsSWR9KWApO1xuXHRcdFx0dGhpcy5fcmVzdW1lU3ViYWdlbnRGb3JFdmVudChlKTtcblx0XHRcdGlmICh0aGlzLl9zaG91bGREcm9wVW5tYXBwZWRTdWJhZ2VudEV2ZW50KGUsICdhc3Npc3RhbnQudG9vbF9jYWxsX2RlbHRhJykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3N0cmVhbWluZ1Rvb2xDYWxscy5nZXQoZS5kYXRhLnRvb2xDYWxsSWQpO1xuXHRcdFx0Y29uc3Qgc3RyZWFtaW5nID0gZXhpc3RpbmcgPz8ge1xuXHRcdFx0XHRpbnB1dDogJycsXG5cdFx0XHRcdHRvb2xOYW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBhcmVudFRvb2xDYWxsSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0c3RhcnRlZDogZmFsc2UsXG5cdFx0XHRcdGRpc3BsYXllZElucHV0TGVuZ3RoOiAwLFxuXHRcdFx0XHRkaXNwbGF5ZWRNZXNzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdFx0c3RyZWFtaW5nLmlucHV0ICs9IGUuZGF0YS5pbnB1dERlbHRhO1xuXHRcdFx0aWYgKGUuZGF0YS50b29sTmFtZSkge1xuXHRcdFx0XHRpZiAoc3RyZWFtaW5nLnRvb2xOYW1lICYmIHN0cmVhbWluZy50b29sTmFtZSAhPT0gZS5kYXRhLnRvb2xOYW1lKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFRvb2wgY2FsbCAke2UuZGF0YS50b29sQ2FsbElkfSBjaGFuZ2VkIG5hbWUgd2hpbGUgc3RyZWFtaW5nIGZyb20gJHtzdHJlYW1pbmcudG9vbE5hbWV9IHRvICR7ZS5kYXRhLnRvb2xOYW1lfWApO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHN0cmVhbWluZy50b29sTmFtZSA9IGUuZGF0YS50b29sTmFtZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc3RyZWFtaW5nVG9vbENhbGxzLnNldChlLmRhdGEudG9vbENhbGxJZCwgc3RyZWFtaW5nKTtcblxuXHRcdFx0Y29uc3QgdG9vbE5hbWUgPSBzdHJlYW1pbmcudG9vbE5hbWU7XG5cdFx0XHRpZiAoIXRvb2xOYW1lIHx8IGlzSGlkZGVuVG9vbCh0b29sTmFtZSkgfHwgaXNUYXNrQ29tcGxldGVUb29sKHRvb2xOYW1lKSB8fCB0aGlzLl9jbGllbnRUb29sTmFtZXMuaGFzKHRoaXMuX2NsaWVudFRvb2xOYW1lKHRvb2xOYW1lKSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFzdHJlYW1pbmcuc3RhcnRlZCkge1xuXHRcdFx0XHRzdHJlYW1pbmcucGFyZW50VG9vbENhbGxJZCA9IHRoaXMuX3BhcmVudFRvb2xDYWxsSWRGb3JTdWJhZ2VudEV2ZW50KGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXN0cmVhbWluZy5zdGFydGVkKSB7XG5cdFx0XHRcdHN0cmVhbWluZy5zdGFydGVkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0XHR0dXJuSWQ6IHRoaXMuX3R1cm5JZCxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiBlLmRhdGEudG9vbENhbGxJZCxcblx0XHRcdFx0XHR0b29sTmFtZSxcblx0XHRcdFx0XHRkaXNwbGF5TmFtZTogZ2V0VG9vbERpc3BsYXlOYW1lKHRvb2xOYW1lKSxcblx0XHRcdFx0XHRjb250cmlidXRvcjogdGhpcy5fZ2V0VG9vbENhbGxDb250cmlidXRvcih0b29sTmFtZSwgdW5kZWZpbmVkKSxcblx0XHRcdFx0XHRfbWV0YTogdG9Ub29sQ2FsbE1ldGEodGhpcy5fY3JlYXRlVG9vbENhbGxNZXRhKHRvb2xOYW1lLCB1bmRlZmluZWQpKSxcblx0XHRcdFx0fSwgc3RyZWFtaW5nLnBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0XHR0aGlzLl9lbWl0U3RyZWFtaW5nVG9vbENhbGxEaXNwbGF5KGUuZGF0YS50b29sQ2FsbElkLCBzdHJlYW1pbmcpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zY2hlZHVsZVN0cmVhbWluZ1Rvb2xDYWxsRGlzcGxheShlLmRhdGEudG9vbENhbGxJZCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblRvb2xTdGFydChlID0+IHtcblx0XHRcdGlmIChpc0hpZGRlblRvb2woZS5kYXRhLnRvb2xOYW1lKSkge1xuXHRcdFx0XHR0aGlzLl9zdHJlYW1pbmdUb29sRGlzcGxheVNjaGVkdWxlcnMuZGVsZXRlQW5kRGlzcG9zZShlLmRhdGEudG9vbENhbGxJZCk7XG5cdFx0XHRcdHRoaXMuX3N0cmVhbWluZ1Rvb2xDYWxscy5kZWxldGUoZS5kYXRhLnRvb2xDYWxsSWQpO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFRvb2wgc3RhcnRlZCAoaGlkZGVuKTogJHtlLmRhdGEudG9vbE5hbWV9YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBUb29sIHN0YXJ0ZWQ6ICR7ZS5kYXRhLnRvb2xOYW1lfWApO1xuXHRcdFx0bGV0IHRvb2xBcmdzID0gZS5kYXRhLmFyZ3VtZW50cyAhPT0gdW5kZWZpbmVkID8gdHJ5U3RyaW5naWZ5KGUuZGF0YS5hcmd1bWVudHMpIDogdW5kZWZpbmVkO1xuXHRcdFx0bGV0IHBhcmFtZXRlcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHRvb2xBcmdzKSB7XG5cdFx0XHRcdHRyeSB7IHBhcmFtZXRlcnMgPSBKU09OLnBhcnNlKHRvb2xBcmdzKSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjsgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cdFx0XHR9XG5cdFx0XHQvLyBTdHJpcCByZWR1bmRhbnQgYGNkIDx3b3JraW5nRGlyZWN0b3J5PiAmJiBcdTIwMjZgIHByZWZpeGVzIGZyb20gc2hlbGwgdG9vbFxuXHRcdFx0Ly8gY29tbWFuZHMgc28gY2xpZW50cyBzZWUgdGhlIHNpbXBsaWZpZWQgZm9ybS4gTWlycm9ycyB0aGUgbG9naWMgaW5cblx0XHRcdC8vIG1hcFNlc3Npb25FdmVudHMgKHdoaWNoIGhhbmRsZXMgdGhlIGhpc3RvcnktcmVwbGF5IHBhdGgpLlxuXHRcdFx0aWYgKHN0cmlwUmVkdW5kYW50Q2RQcmVmaXgoZS5kYXRhLnRvb2xOYW1lLCBwYXJhbWV0ZXJzLCB0aGlzLl93b3JraW5nRGlyZWN0b3J5KSkge1xuXHRcdFx0XHR0b29sQXJncyA9IHRyeVN0cmluZ2lmeShwYXJhbWV0ZXJzKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRpc3BsYXlOYW1lID0gZ2V0VG9vbERpc3BsYXlOYW1lKGUuZGF0YS50b29sTmFtZSk7XG5cdFx0XHRjb25zdCBzdHJlYW1lZCA9IHRoaXMuX3N0cmVhbWluZ1Rvb2xDYWxscy5nZXQoZS5kYXRhLnRvb2xDYWxsSWQpO1xuXHRcdFx0dGhpcy5fc3RyZWFtaW5nVG9vbERpc3BsYXlTY2hlZHVsZXJzLmRlbGV0ZUFuZERpc3Bvc2UoZS5kYXRhLnRvb2xDYWxsSWQpO1xuXHRcdFx0aWYgKHN0cmVhbWVkPy5zdGFydGVkICYmIHN0cmVhbWVkLmRpc3BsYXllZElucHV0TGVuZ3RoIDwgc3RyZWFtZWQuaW5wdXQubGVuZ3RoKSB7XG5cdFx0XHRcdHRoaXMuX2VtaXRTdHJlYW1pbmdUb29sQ2FsbERpc3BsYXkoZS5kYXRhLnRvb2xDYWxsSWQsIHN0cmVhbWVkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3N0cmVhbWluZ1Rvb2xDYWxscy5kZWxldGUoZS5kYXRhLnRvb2xDYWxsSWQpO1xuXHRcdFx0aWYgKHN0cmVhbWVkPy50b29sTmFtZSAmJiBzdHJlYW1lZC50b29sTmFtZSAhPT0gZS5kYXRhLnRvb2xOYW1lKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBUb29sIGNhbGwgJHtlLmRhdGEudG9vbENhbGxJZH0gc3RhcnRlZCBhcyAke2UuZGF0YS50b29sTmFtZX0gYWZ0ZXIgc3RyZWFtaW5nIGFzICR7c3RyZWFtZWQudG9vbE5hbWV9YCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9yZXN1bWVTdWJhZ2VudEZvckV2ZW50KGUpO1xuXHRcdFx0aWYgKCFzdHJlYW1lZD8uc3RhcnRlZCAmJiB0aGlzLl9zaG91bGREcm9wVW5tYXBwZWRTdWJhZ2VudEV2ZW50KGUsICd0b29sLmV4ZWN1dGlvbl9zdGFydCcpKSB7XG5cdFx0XHRcdHRoaXMuX3Vucm91dGFibGVTdWJhZ2VudFRvb2xDYWxsSWRzLmFkZChlLmRhdGEudG9vbENhbGxJZCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhcmVudFRvb2xDYWxsSWQgPSBzdHJlYW1lZD8ucGFyZW50VG9vbENhbGxJZCA/PyB0aGlzLl9wYXJlbnRUb29sQ2FsbElkRm9yU3ViYWdlbnRFdmVudChlKTtcblx0XHRcdGNvbnN0IGNsaWVudFRvb2xOYW1lID0gdGhpcy5fY2xpZW50VG9vbE5hbWUoZS5kYXRhLnRvb2xOYW1lKTtcblx0XHRcdGNvbnN0IGlzQ2xpZW50VG9vbCA9IHRoaXMuX2NsaWVudFRvb2xOYW1lcy5oYXMoY2xpZW50VG9vbE5hbWUpO1xuXHRcdFx0Y29uc3QgaXNUb29sU2VhcmNoID0gdGhpcy5faXNUb29sU2VhcmNoQWN0aXZlKCkgJiYgZS5kYXRhLnRvb2xOYW1lID09PSBSVU5USU1FX1RPT0xfU0VBUkNIX1RPT0xfTkFNRTtcblx0XHRcdGNvbnN0IGNvbnRyaWJ1dG9yID0gdGhpcy5fZ2V0VG9vbENhbGxDb250cmlidXRvcihlLmRhdGEudG9vbE5hbWUsIGUuZGF0YS5tY3BTZXJ2ZXJOYW1lKTtcblx0XHRcdGNvbnN0IGludGVudGlvbiA9IGdldFNoZWxsSW50ZW50aW9uKGUuZGF0YS50b29sTmFtZSwgcGFyYW1ldGVycyk7XG5cdFx0XHR0aGlzLl9hY3RpdmVUb29sQ2FsbHMuc2V0KGUuZGF0YS50b29sQ2FsbElkLCB7XG5cdFx0XHRcdHRvb2xOYW1lOiBlLmRhdGEudG9vbE5hbWUsXG5cdFx0XHRcdGRpc3BsYXlOYW1lLFxuXHRcdFx0XHRwYXJhbWV0ZXJzLFxuXHRcdFx0XHRjb250ZW50OiBbXSxcblx0XHRcdFx0cGFyZW50VG9vbENhbGxJZCxcblx0XHRcdFx0bWNwU2VydmVyTmFtZTogZS5kYXRhLm1jcFNlcnZlck5hbWUsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yLFxuXHRcdFx0XHRpbnRlbnRpb24sXG5cdFx0XHRcdG1ldGE6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdBcHByb3ZhbCA9IHRoaXMuX3Rvb2xBcHByb3ZhbFJlY29yZHMuZ2V0KGUuZGF0YS50b29sQ2FsbElkKTtcblx0XHRcdGNvbnN0IGFwcHJvdmFsUmVjb3JkID0ge1xuXHRcdFx0XHRwZXJtaXNzaW9uUmVxdWVzdGVkOiBleGlzdGluZ0FwcHJvdmFsPy5wZXJtaXNzaW9uUmVxdWVzdGVkID8/IGZhbHNlLFxuXHRcdFx0XHRyZXNvbHZlZEJ5SG9vazogZXhpc3RpbmdBcHByb3ZhbD8ucmVzb2x2ZWRCeUhvb2sgPz8gZmFsc2UsXG5cdFx0XHRcdHJlcXVlc3RTYW5kYm94QnlwYXNzOiBleGlzdGluZ0FwcHJvdmFsPy5yZXF1ZXN0U2FuZGJveEJ5cGFzcyA/PyBmYWxzZSxcblx0XHRcdFx0cmVzdWx0S2luZDogZXhpc3RpbmdBcHByb3ZhbD8ucmVzdWx0S2luZCxcblx0XHRcdFx0dG9vbE5hbWU6IGUuZGF0YS50b29sTmFtZSxcblx0XHRcdFx0bWNwU2VydmVyTmFtZTogZS5kYXRhLm1jcFNlcnZlck5hbWUsXG5cdFx0XHRcdHJlcG9ydGVkOiBleGlzdGluZ0FwcHJvdmFsPy5yZXBvcnRlZCA/PyBmYWxzZSxcblx0XHRcdH07XG5cdFx0XHR0aGlzLl90b29sQXBwcm92YWxSZWNvcmRzLnNldChlLmRhdGEudG9vbENhbGxJZCwgYXBwcm92YWxSZWNvcmQpO1xuXHRcdFx0aWYgKGFwcHJvdmFsUmVjb3JkLnJlc3VsdEtpbmQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLl9yZXBvcnRUb29sQXBwcm92YWwoZS5kYXRhLnRvb2xDYWxsSWQsIGUuZGF0YS50b29sTmFtZSwgZS5kYXRhLm1jcFNlcnZlck5hbWUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzU2hlbGxUb29sKGUuZGF0YS50b29sTmFtZSkpIHtcblx0XHRcdFx0dGhpcy5fbm9uUHR5U2hlbGxUZXJtaW5hbHMudHJhY2soZS5kYXRhLnRvb2xDYWxsSWQsIGRpc3BsYXlOYW1lKTtcblx0XHRcdH1cblx0XHRcdGlmIChpc1Rhc2tDb21wbGV0ZVRvb2woZS5kYXRhLnRvb2xOYW1lKSkge1xuXHRcdFx0XHR0aGlzLl9iZWdpblRvb2xDYWxsUm91bmQocGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFzdHJlYW1lZD8uc3RhcnRlZCkge1xuXHRcdFx0XHR0aGlzLl9iZWdpblRvb2xDYWxsUm91bmQocGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1ldGEgPSB0aGlzLl9jcmVhdGVUb29sQ2FsbE1ldGEoZS5kYXRhLnRvb2xOYW1lLCBwYXJhbWV0ZXJzKTtcblx0XHRcdGlmIChlLmRhdGEubWNwU2VydmVyTmFtZSkge1xuXHRcdFx0XHRtZXRhLm1jcFNlcnZlck5hbWUgPSBlLmRhdGEubWNwU2VydmVyTmFtZTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmRhdGEubWNwVG9vbE5hbWUpIHtcblx0XHRcdFx0bWV0YS5tY3BUb29sTmFtZSA9IGUuZGF0YS5tY3BUb29sTmFtZTtcblx0XHRcdH1cblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLXVudHlwZWQtbWV0YS1hY2Nlc3MgLS0gQ29waWxvdCBTREsncyBvd24gdHlwZWQgYF9tZXRhYCwgbm90IHRoZSBBSFAgcHJvdG9jb2wgYmFnLlxuXHRcdFx0Y29uc3QgcmVzb3VyY2VVcmkgPSBlLmRhdGEudG9vbERlc2NyaXB0aW9uPy5fbWV0YT8udWk/LnJlc291cmNlVXJpO1xuXHRcdFx0dGhpcy5fc2V0VG9vbENhbGxVaU1ldGEobWV0YSwgcmVzb3VyY2VVcmksIGUuZGF0YS5tY3BTZXJ2ZXJOYW1lKTtcblxuXHRcdFx0Ly8gU3Rhc2ggdGhlIHN0YXJ0LXRpbWUgbWV0YSBvbiB0aGUgdHJhY2tlZCB0b29sIGNhbGwgc28gdGhlXG5cdFx0XHQvLyBgdG9vbC5leGVjdXRpb25fY29tcGxldGVgIGVtaXNzaW9uIGJlbG93IGNhbiBtZXJnZSBhbnlcblx0XHRcdC8vIGFkZGl0aW9uYWwgbmFtZXNwYWNlcyAoZS5nLiBgdWlgKSBvbiB0b3Agd2l0aG91dCBkcm9wcGluZ1xuXHRcdFx0Ly8gd2hhdCB3ZSBhbHJlYWR5IHB1Ymxpc2hlZCBhdCBzdGFydCB0aW1lLlxuXHRcdFx0Y29uc3QgdHJhY2tlZCA9IHRoaXMuX2FjdGl2ZVRvb2xDYWxscy5nZXQoZS5kYXRhLnRvb2xDYWxsSWQpO1xuXHRcdFx0aWYgKHRyYWNrZWQpIHtcblx0XHRcdFx0dHJhY2tlZC5tZXRhID0gbWV0YTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFzdHJlYW1lZD8uc3RhcnRlZCkge1xuXHRcdFx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHRcdHR1cm5JZDogdGhpcy5fdHVybklkLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6IGUuZGF0YS50b29sQ2FsbElkLFxuXHRcdFx0XHRcdHRvb2xOYW1lOiBlLmRhdGEudG9vbE5hbWUsXG5cdFx0XHRcdFx0ZGlzcGxheU5hbWUsXG5cdFx0XHRcdFx0aW50ZW50aW9uLFxuXHRcdFx0XHRcdGNvbnRyaWJ1dG9yLFxuXHRcdFx0XHRcdF9tZXRhOiB0b1Rvb2xDYWxsTWV0YShtZXRhKSxcblx0XHRcdFx0fSwgcGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE5vIGNsaWVudCBpcyBjb25uZWN0ZWQgdG8gcnVuIHRoaXMgY2xpZW50IHRvb2wuIEZhaWwgaXRcblx0XHRcdC8vIGltbWVkaWF0ZWx5IGluc3RlYWQgb2YgbGVhdmluZyBpdCBwZW5kaW5nIHVudGlsIHRoZVxuXHRcdFx0Ly8gc2VydmVyLXNpZGUgZGlzY29ubmVjdCB0aW1lb3V0IGZpcmVzLiBXZSBlbWl0IHRoZSBjb21wbGV0aW9uXG5cdFx0XHQvLyBvdXJzZWx2ZXMgYW5kIGRyb3AgdGhlIGFjdGl2ZS10b29sIGVudHJ5IHNvIHRoZSBTREsncyBvd25cblx0XHRcdC8vIHRvb2wuZXhlY3V0aW9uX2NvbXBsZXRlIGZvciB0aGlzIGlkIGlzIHN1cHByZXNzZWQuXG5cdFx0XHRpZiAoaXNDbGllbnRUb29sICYmICFjb250cmlidXRvcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gQ2xpZW50IHRvb2wgJyR7ZS5kYXRhLnRvb2xOYW1lfScgc3RhcnRlZCB3aXRoIG5vIGNvbm5lY3RlZCBjbGllbnQ7IGZhaWxpbmcgaXQgaW1tZWRpYXRlbHkuYCk7XG5cdFx0XHRcdHRoaXMuX3JlcG9ydFRvb2xBcHByb3ZhbElmTm9QZXJtaXNzaW9uKGUuZGF0YS50b29sQ2FsbElkKTtcblx0XHRcdFx0dGhpcy5fdG9vbEFwcHJvdmFsUmVjb3Jkcy5kZWxldGUoZS5kYXRhLnRvb2xDYWxsSWQpO1xuXHRcdFx0XHR0aGlzLl9hY3RpdmVUb29sQ2FsbHMuZGVsZXRlKGUuZGF0YS50b29sQ2FsbElkKTtcblx0XHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0XHR0dXJuSWQ6IHRoaXMuX3R1cm5JZCxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiBlLmRhdGEudG9vbENhbGxJZCxcblx0XHRcdFx0XHQuLi4oY29udHJpYnV0b3IgPyB7IGNvbnRyaWJ1dG9yIH0gOiB7fSksXG5cdFx0XHRcdFx0Li4uKGludGVudGlvbiAhPT0gdW5kZWZpbmVkID8geyBpbnRlbnRpb24gfSA6IHt9KSxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogZ2V0SW52b2NhdGlvbk1lc3NhZ2UoZS5kYXRhLnRvb2xOYW1lLCBkaXNwbGF5TmFtZSwgcGFyYW1ldGVycywgcGF0aCA9PiB0aGlzLl9yZXNvbHZlRWRpdEZpbGVQYXRoKHBhdGgpKSxcblx0XHRcdFx0XHR0b29sSW5wdXQ6IGdldFRvb2xJbnB1dFN0cmluZyhlLmRhdGEudG9vbE5hbWUsIHBhcmFtZXRlcnMsIHRvb2xBcmdzKSxcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0XHRfbWV0YTogdG9Ub29sQ2FsbE1ldGEobWV0YSksXG5cdFx0XHRcdH0sIHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0XHRcdHR1cm5JZDogdGhpcy5fdHVybklkLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6IGUuZGF0YS50b29sQ2FsbElkLFxuXHRcdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBgJHtkaXNwbGF5TmFtZX0gZmFpbGVkYCxcblx0XHRcdFx0XHRcdGVycm9yOiB7IG1lc3NhZ2U6IGBObyBjbGllbnQgd2FzIGNvbm5lY3RlZCB0byBydW4gJHtkaXNwbGF5TmFtZX1gIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSwgcGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdDbGllbnRUb29sQ2FsbHMucmVzcG9uZE9yQnVmZmVyKGUuZGF0YS50b29sQ2FsbElkLCB7XG5cdFx0XHRcdFx0dGV4dFJlc3VsdEZvckxsbTogYE5vIGNsaWVudCB3YXMgY29ubmVjdGVkIHRvIHJ1biAke2Rpc3BsYXlOYW1lfS5gLFxuXHRcdFx0XHRcdHJlc3VsdFR5cGU6ICdmYWlsdXJlJyxcblx0XHRcdFx0XHRlcnJvcjogJ05vIGNsaWVudCBjb25uZWN0ZWQnLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjbGllbnRUb29sQXV0b0FwcHJvdmVkID0gY29udHJpYnV0b3I/LmtpbmQgPT09IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCAmJiB0aGlzLl9sYXN0QXBwbGllZFBlcm1pc3Npb25Nb2RlID09PSAnb24nO1xuXHRcdFx0aWYgKGlzVG9vbFNlYXJjaCAmJiBjbGllbnRUb29sQXV0b0FwcHJvdmVkKSB7XG5cdFx0XHRcdG1ldGEuYXV0b0FwcHJvdmVCeVNldHRpbmcgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2hvdWxkV2FpdEZvckNsaWVudFRvb2xSZWFkeSA9IGNvbnRyaWJ1dG9yPy5raW5kID09PSBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnRcblx0XHRcdFx0JiYgIWlzQWdlbnRDb29yZGluYXRpb25Ub29sKGUuZGF0YS50b29sTmFtZSlcblx0XHRcdFx0JiYgKGlzVG9vbFNlYXJjaCB8fCAhY2xpZW50VG9vbEF1dG9BcHByb3ZlZCk7XG5cdFx0XHRpZiAoc2hvdWxkV2FpdEZvckNsaWVudFRvb2xSZWFkeSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6IHRoaXMuX3R1cm5JZCxcblx0XHRcdFx0dG9vbENhbGxJZDogZS5kYXRhLnRvb2xDYWxsSWQsXG5cdFx0XHRcdC4uLihjb250cmlidXRvciA/IHsgY29udHJpYnV0b3IgfSA6IHt9KSxcblx0XHRcdFx0Li4uKGludGVudGlvbiAhPT0gdW5kZWZpbmVkID8geyBpbnRlbnRpb24gfSA6IHt9KSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGdldEludm9jYXRpb25NZXNzYWdlKGUuZGF0YS50b29sTmFtZSwgZGlzcGxheU5hbWUsIHBhcmFtZXRlcnMsIHBhdGggPT4gdGhpcy5fcmVzb2x2ZUVkaXRGaWxlUGF0aChwYXRoKSksXG5cdFx0XHRcdHRvb2xJbnB1dDogZ2V0VG9vbElucHV0U3RyaW5nKGUuZGF0YS50b29sTmFtZSwgcGFyYW1ldGVycywgdG9vbEFyZ3MpLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0X21ldGE6IHRvVG9vbENhbGxNZXRhKGNsaWVudFRvb2xBdXRvQXBwcm92ZWQgPyB7IC4uLm1ldGEsIGF1dG9BcHByb3ZlQnlTZXR0aW5nOiB0cnVlIH0gOiBtZXRhKSxcblx0XHRcdH0sIHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25Ub29sQ29tcGxldGUoYXN5bmMgZSA9PiB7XG5cdFx0XHR0aGlzLl9hcHByb3ZlZER1cGxpY2FibGVQZXJtaXNzaW9uU2lnbmF0dXJlcy5kZWxldGUoZS5kYXRhLnRvb2xDYWxsSWQpO1xuXHRcdFx0Y29uc3QgdHJhY2tlZCA9IHRoaXMuX2FjdGl2ZVRvb2xDYWxscy5nZXQoZS5kYXRhLnRvb2xDYWxsSWQpO1xuXHRcdFx0aWYgKCF0cmFja2VkKSB7XG5cdFx0XHRcdHRoaXMuX3Vucm91dGFibGVTdWJhZ2VudFRvb2xDYWxsSWRzLmRlbGV0ZShlLmRhdGEudG9vbENhbGxJZCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhcmVudFRvb2xDYWxsSWQgPSB0cmFja2VkLnBhcmVudFRvb2xDYWxsSWQgPz8gdGhpcy5fcGFyZW50VG9vbENhbGxJZEZvclN1YmFnZW50RXZlbnQoZSk7XG5cdFx0XHRpZiAoIXBhcmVudFRvb2xDYWxsSWQgJiYgZS5hZ2VudElkKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIERyb3BwaW5nIHRvb2wuZXhlY3V0aW9uX2NvbXBsZXRlIGZvciB1bmtub3duIHN1YmFnZW50IGFnZW50SWQ9JHtlLmFnZW50SWR9YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChlLmRhdGEuc3VjY2VzcyAmJiB0cmFja2VkLmNvbnRyaWJ1dG9yID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3QgdGVsZW1ldHJ5U2Vzc2lvbiA9IHBhcmVudFRvb2xDYWxsSWRcblx0XHRcdFx0XHQ/IFVSSS5wYXJzZShidWlsZFN1YmFnZW50U2Vzc2lvblVyaSh0aGlzLl9zdG9yYWdlVXJpLnRvU3RyaW5nKCksIHBhcmVudFRvb2xDYWxsSWQpKVxuXHRcdFx0XHRcdDogdGhpcy5yZXNvdXJjZVVyaTtcblx0XHRcdFx0cmVwb3J0Q29waWxvdFRvZG9TdG9yZU9wZXJhdGlvbih0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCB0ZWxlbWV0cnlTZXNzaW9uLCBlLmRhdGEudG9vbENhbGxJZCwgdHJhY2tlZC50b29sTmFtZSwgdHJhY2tlZC5wYXJhbWV0ZXJzLCB0aGlzLl9jdXJyZW50VHVybj8uY2xpZW50Q29udGV4dCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gVG9vbCBjb21wbGV0ZWQ6ICR7ZS5kYXRhLnRvb2xDYWxsSWR9YCk7XG5cdFx0XHR0aGlzLl9yZXBvcnRUb29sQXBwcm92YWxJZk5vUGVybWlzc2lvbihlLmRhdGEudG9vbENhbGxJZCk7XG5cdFx0XHR0aGlzLl9hY3RpdmVUb29sQ2FsbHMuZGVsZXRlKGUuZGF0YS50b29sQ2FsbElkKTtcblx0XHRcdHRoaXMuX2F1dG9BcHByb3ZhbHMuZGVsZXRlKGUuZGF0YS50b29sQ2FsbElkKTtcblx0XHRcdHRoaXMuX3Rvb2xBcHByb3ZhbFJlY29yZHMuZGVsZXRlKGUuZGF0YS50b29sQ2FsbElkKTtcblx0XHRcdHRoaXMuX3BlbmRpbmdBdXRvQXBwcm92YWxzLnJlc3BvbmQoZS5kYXRhLnRvb2xDYWxsSWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBkaXNwbGF5TmFtZSA9IHRyYWNrZWQuZGlzcGxheU5hbWU7XG5cdFx0XHRjb25zdCB0b29sT3V0cHV0ID0gZS5kYXRhLmVycm9yPy5tZXNzYWdlID8/IGUuZGF0YS5yZXN1bHQ/LmNvbnRlbnQ7XG5cblx0XHRcdGlmIChpc1Rhc2tDb21wbGV0ZVRvb2wodHJhY2tlZC50b29sTmFtZSkpIHtcblx0XHRcdFx0Y29uc3Qgc3VtbWFyeSA9IGdldFRhc2tDb21wbGV0ZU1hcmtkb3duKHRyYWNrZWQucGFyYW1ldGVycywgdG9vbE91dHB1dCk7XG5cdFx0XHRcdGlmIChzdW1tYXJ5KSB7XG5cdFx0XHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQsXG5cdFx0XHRcdFx0XHR0dXJuSWQ6IHRoaXMuX3R1cm5JZCxcblx0XHRcdFx0XHRcdHBhcnQ6IHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6IGdlbmVyYXRlVXVpZCgpLCBjb250ZW50OiBzdW1tYXJ5IH0sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb250ZW50OiBUb29sUmVzdWx0Q29udGVudFtdID0gWy4uLnRyYWNrZWQuY29udGVudF07XG5cdFx0XHRpZiAodG9vbE91dHB1dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnRlbnQucHVzaCh7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiB0b29sT3V0cHV0IH0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBdHRhY2ggdGhlIHB0eSB0ZXJtaW5hbCByZWZlcmVuY2UgZm9yIHNoZWxsIHRvb2xzIGJlZm9yZSBmb2xkaW5nIGluXG5cdFx0XHQvLyBTREsgcmVzdWx0IGNvbnRlbnQsIHNvIGEgYHNoZWxsX2V4aXRgIGxhbmRzIGl0cyBjb21wbGV0aW9uIGRhdGEgb25cblx0XHRcdC8vIHRoZSB0ZXJtaW5hbCBibG9jayAoc2tpcCBpZiBhbnkgdGVybWluYWwgYmxvY2sgd2FzIGFscmVhZHkgYWRkZWRcblx0XHRcdC8vIHdoaWxlIHRoZSB0b29sIHdhcyBydW5uaW5nKS5cblx0XHRcdGNvbnN0IGlzU2hlbGxDb21tYW5kVG9vbCA9IGlzU2hlbGxUb29sKHRyYWNrZWQudG9vbE5hbWUpO1xuXHRcdFx0Y29uc3QgcHR5VGVybWluYWxVcmkgPSBpc1NoZWxsQ29tbWFuZFRvb2wgPyB0aGlzLl9zaGVsbE1hbmFnZXI/LmdldFRlcm1pbmFsVXJpRm9yVG9vbENhbGwoZS5kYXRhLnRvb2xDYWxsSWQpIDogdW5kZWZpbmVkO1xuXHRcdFx0bGV0IHJldGlyZU5vblB0eVNoZWxsVHJhY2tpbmcgPSAhIXB0eVRlcm1pbmFsVXJpO1xuXHRcdFx0aWYgKHB0eVRlcm1pbmFsVXJpICYmICFjb250ZW50LnNvbWUoYyA9PiBjLnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCkpIHtcblx0XHRcdFx0Y29udGVudC5wdXNoKHtcblx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwsXG5cdFx0XHRcdFx0cmVzb3VyY2U6IHB0eVRlcm1pbmFsVXJpLFxuXHRcdFx0XHRcdHRpdGxlOiB0cmFja2VkLmRpc3BsYXlOYW1lLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2hlbGxFeGl0ID0gYXBwZW5kU2RrVG9vbFJlc3VsdENvbnRlbnQoXG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdGUuZGF0YS5yZXN1bHQ/LmNvbnRlbnRzLFxuXHRcdFx0XHRpc1NoZWxsQ29tbWFuZFRvb2wgPyB7IHNlc3Npb246IHRoaXMucmVzb3VyY2VVcmksIHRvb2xDYWxsSWQ6IGUuZGF0YS50b29sQ2FsbElkLCB0aXRsZTogdHJhY2tlZC5kaXNwbGF5TmFtZSB9IDogdW5kZWZpbmVkLFxuXHRcdFx0KTtcblx0XHRcdGlmIChpc1NoZWxsQ29tbWFuZFRvb2wgJiYgIXB0eVRlcm1pbmFsVXJpKSB7XG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRpb24gPSB0aGlzLl9ub25QdHlTaGVsbFRlcm1pbmFscy5jb21wbGV0ZVRvb2xDYWxsKGUuZGF0YS50b29sQ2FsbElkLCB0b29sT3V0cHV0LCBzaGVsbEV4aXQpO1xuXHRcdFx0XHRpZiAoY29tcGxldGlvbikge1xuXHRcdFx0XHRcdHJldGlyZU5vblB0eVNoZWxsVHJhY2tpbmcgPSBjb21wbGV0aW9uLnNob3VsZFJldGlyZTtcblx0XHRcdFx0XHRjb25zdCB0ZXJtaW5hbEluZGV4ID0gY29udGVudC5maW5kSW5kZXgoYyA9PiBjLnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCk7XG5cdFx0XHRcdFx0aWYgKHRlcm1pbmFsSW5kZXggPT09IC0xKSB7XG5cdFx0XHRcdFx0XHRjb250ZW50LnB1c2goe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwsXG5cdFx0XHRcdFx0XHRcdHJlc291cmNlOiBjb21wbGV0aW9uLnVyaSxcblx0XHRcdFx0XHRcdFx0dGl0bGU6IHRyYWNrZWQuZGlzcGxheU5hbWUsXG5cdFx0XHRcdFx0XHRcdGlzUHR5OiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0Li4uKGNvbXBsZXRpb24ucmVzdWx0ID8geyByZXN1bHQ6IGNvbXBsZXRpb24ucmVzdWx0IH0gOiB7fSksXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGNvbXBsZXRpb24ucmVzdWx0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0ZXJtaW5hbEJsb2NrID0gY29udGVudFt0ZXJtaW5hbEluZGV4XSBhcyBUb29sUmVzdWx0VGVybWluYWxDb250ZW50O1xuXHRcdFx0XHRcdFx0Y29udGVudFt0ZXJtaW5hbEluZGV4XSA9IHsgLi4udGVybWluYWxCbG9jaywgcmVzdWx0OiBjb21wbGV0aW9uLnJlc3VsdCB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb21tYW5kID0gaXNTdHJpbmcodHJhY2tlZC5wYXJhbWV0ZXJzPy5jb21tYW5kKSA/IHRyYWNrZWQucGFyYW1ldGVycy5jb21tYW5kIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgZmlsZVBhdGhzID0gaXNFZGl0VG9vbCh0cmFja2VkLnRvb2xOYW1lLCBjb21tYW5kKSA/IHRoaXMuX2dldEVkaXRGaWxlUGF0aHModHJhY2tlZC5wYXJhbWV0ZXJzKSA6IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBmaWxlUGF0aCBvZiBmaWxlUGF0aHMpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBmaWxlRWRpdCA9IGF3YWl0IHRoaXMuX2VkaXRUcmFja2VyLnRha2VDb21wbGV0ZWRFZGl0KHRoaXMuX3R1cm5JZCwgZS5kYXRhLnRvb2xDYWxsSWQsIGZpbGVQYXRoLCB0cmFja2VkLnRvb2xOYW1lLCB0cmFja2VkLnBhcmFtZXRlcnMsIHRoaXMuX2xhc3RTZWVuTW9kZWxJZCwgdGhpcy5fY3VycmVudFR1cm4/LmNsaWVudENvbnRleHQpO1xuXHRcdFx0XHRcdGlmIChmaWxlRWRpdCkge1xuXHRcdFx0XHRcdFx0Y29udGVudC5wdXNoKGZpbGVFZGl0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBGYWlsZWQgdG8gdGFrZSBjb21wbGV0ZWQgZWRpdGAsIGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZDogdGhpcy5fdHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBlLmRhdGEudG9vbENhbGxJZCxcblx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0c3VjY2VzczogZS5kYXRhLnN1Y2Nlc3MsXG5cdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogZ2V0UGFzdFRlbnNlTWVzc2FnZSh0cmFja2VkLnRvb2xOYW1lLCBkaXNwbGF5TmFtZSwgdHJhY2tlZC5wYXJhbWV0ZXJzLCBlLmRhdGEuc3VjY2VzcywgZS5kYXRhLnN1Y2Nlc3MgPyB0b29sT3V0cHV0IDogdW5kZWZpbmVkLCBwYXRoID0+IHRoaXMuX3Jlc29sdmVFZGl0RmlsZVBhdGgocGF0aCkpLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IGNvbnRlbnQubGVuZ3RoID4gMCA/IGNvbnRlbnQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZXJyb3I6IGUuZGF0YS5lcnJvcixcblx0XHRcdFx0fSxcblx0XHRcdFx0X21ldGE6IHRyYWNrZWQubWV0YSA/IHRvVG9vbENhbGxNZXRhKHRyYWNrZWQubWV0YSkgOiB1bmRlZmluZWQsXG5cdFx0XHR9LCBwYXJlbnRUb29sQ2FsbElkKTtcblx0XHRcdGlmIChyZXRpcmVOb25QdHlTaGVsbFRyYWNraW5nKSB7XG5cdFx0XHRcdC8vIFByZXNlcnZlIHRoZSB0ZXJtaW5hbCByZXN1bHQgaW4gY2hhdCBzdGF0ZSBiZWZvcmUgcmVtb3ZpbmcgaXRzXG5cdFx0XHRcdC8vIG5vdy1yZWR1bmRhbnQgbGl2ZSBvdXRwdXQgcmVzb3VyY2UgZnJvbSB0aGUgaG9zdC5cblx0XHRcdFx0dGhpcy5fbm9uUHR5U2hlbGxUZXJtaW5hbHMucmV0aXJlKGUuZGF0YS50b29sQ2FsbElkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uSWRsZShlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBTZXNzaW9uIGlkbGVgKTtcblx0XHRcdGlmIChlLmRhdGEuYWJvcnRlZCkge1xuXHRcdFx0XHR0aGlzLl9yZXNldEFib3J0VG9rZW4oKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9oYXNBY3Rpdml0eSkge1xuXHRcdFx0XHR0aGlzLl9oYXNBY3Rpdml0eSA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3Rpdml0eUNoYW5nZWQsXG5cdFx0XHRcdFx0YWN0aXZpdHk6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0dXJuID0gdGhpcy5fY3VycmVudFR1cm47XG5cdFx0XHRpZiAoIXR1cm4pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQW4gYWJvcnQgZHJpdmVzIHRoZSBsb29wIHRvIGlkbGUuIFRoYXQgdGVybWluYWwgaWRsZSBtdXN0IG5ldmVyXG5cdFx0XHQvLyBjb21wbGV0ZSBhIHR1cm46XG5cdFx0XHQvLyAgLSBpZiBgdHVybmAgaXMgdGhlIGFib3J0ZWQgKHJ1bm5pbmcpIHR1cm4sIHRoZSBjbGllbnQtZGlzcGF0Y2hlZFxuXHRcdFx0Ly8gICAgYENoYXRUdXJuQ2FuY2VsbGVkYCBmaW5hbGl6ZXMgdGhlIHByb3RvY29sIHR1cm47IGRyb3Agb3VyIGhhbmRsZVxuXHRcdFx0Ly8gICAgc28gYSBsYXRlciBpZGxlIGNhbid0IGNvbXBsZXRlIGl0LlxuXHRcdFx0Ly8gIC0gaWYgYHR1cm5gIGlzIHN0aWxsIGBwZW5kaW5nYCwgYSBxdWV1ZWQgbWVzc2FnZSBzdGFydGVkIGl0IGFmdGVyXG5cdFx0XHQvLyAgICB0aGUgYWJvcnQgYW5kIHRoZSBTREsgaGFzIG5vdCBydW4gaXQgeWV0OyBjb21wbGV0aW5nIGl0IHdvdWxkXG5cdFx0XHQvLyAgICBlbWl0IGFuIGVtcHR5IGBDaGF0VHVybkNvbXBsZXRlYCBhbmQgb3JwaGFuIGl0cyByZWFsIHJlc3BvbnNlLlxuXHRcdFx0Ly8gICAgTGVhdmUgaXQgb3BlbiBmb3IgaXRzIG93biAobm9uLWFib3J0KSBpZGxlLlxuXHRcdFx0Ly8gVGhlIHN0cnVjdHVyYWwgYHBlbmRpbmdgIGd1YXJkIGJlbG93IGFscmVhZHkgcHJvdGVjdHMgdGhlXG5cdFx0XHQvLyBxdWV1ZWQtbWVzc2FnZSBjYXNlOyByZWFkaW5nIGBlLmRhdGEuYWJvcnRlZGAgaXMgdGhlIGF1dGhvcml0YXRpdmVcblx0XHRcdC8vIFNESyBzaWduYWwgdGhhdCBsZXRzIHVzIGFsc28gdGVhciBkb3duIHRoZSBhYm9ydGVkIHJ1bm5pbmcgdHVybi5cblx0XHRcdGlmIChlLmRhdGEuYWJvcnRlZCkge1xuXHRcdFx0XHR0aGlzLl9jYW5jZWxBY3RpdmVSZXBvSW5mb1RlbGVtZXRyeSgpO1xuXHRcdFx0XHRpZiAodHVybi5pc1J1bm5pbmcpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIElkbGUgZnJvbSBhYm9ydDsgdGVhcmluZyBkb3duIHJ1bm5pbmcgdHVybiAke3R1cm4uaWR9YCk7XG5cdFx0XHRcdFx0dGhpcy5fcmVwb3J0VG9vbENhbGxEZXRhaWxzKHR1cm4sICdjYW5jZWxsZWQnKTtcblx0XHRcdFx0XHR0dXJuLm1hcmtBYm9ydGVkKCk7XG5cdFx0XHRcdFx0dGhpcy5fY2xlYXJBY3RpdmVUdXJuKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBJZGxlIGZyb20gYWJvcnQ7IGxlYXZpbmcgJHt0dXJuLnN0YXRlfSB0dXJuICR7dHVybi5pZH0gb3BlbmApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIE9ubHkgYSBgcnVubmluZ2AgdHVybiBpcyBjb21wbGV0ZWQgYnkgYSBub3JtYWwgaWRsZS4gQSBgcGVuZGluZ2Bcblx0XHRcdC8vIHR1cm4gaGVyZSBtZWFucyB0aGUgU0RLIHdlbnQgaWRsZSBiZWZvcmUgZW1pdHRpbmcgYW55IGV2ZW50IGZvciBpdFxuXHRcdFx0Ly8gKGEgZGVnZW5lcmF0ZSBuby1vcCBzZW5kKTsgY29tcGxldGUgaXQgZGVmZW5zaXZlbHkgc28gdGhlIHNlc3Npb25cblx0XHRcdC8vIGRvZXMgbm90IGhhbmcuXG5cdFx0XHR0aGlzLl9jb21wbGV0ZUFjdGl2ZVJlcG9JbmZvVGVsZW1ldHJ5KCk7XG5cdFx0XHR0aGlzLl9jb21wbGV0ZUFjdGl2ZVR1cm4oKTtcblx0XHR9KSk7XG5cblx0XHQvLyBUaGUgU0RLIGVtaXRzIGEgYHNraWxsYCB0b29sIGNhbGwgKHdoaWNoIHdlIGhpZGUpIGFuZCBhIHJpY2hlclxuXHRcdC8vIGBza2lsbC5pbnZva2VkYCBldmVudCB3aXRoIHRoZSByZXNvbHZlZCBTS0lMTC5tZCBwYXRoLiBTeW50aGVzaXplIGFcblx0XHQvLyB0b29sLXN0YXJ0L2NvbXBsZXRlIHBhaXIgZnJvbSB0aGUgbGF0dGVyIHNvIHRoZSBVSSBjYW4gcmVuZGVyIGFcblx0XHQvLyBjbGlja2FibGUgZmlsZSBsaW5rLCBtYXRjaGluZyB0aGUgYHZpZXdgLXRvb2wgZGlzcGxheSBzdHlsZS5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uU2tpbGxJbnZva2VkKGUgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFNraWxsIGludm9rZWQ6ICR7ZS5kYXRhLm5hbWV9ICgke2UuZGF0YS5wYXRofSlgKTtcblx0XHRcdHRoaXMuX3Jlc3VtZVN1YmFnZW50Rm9yRXZlbnQoZSk7XG5cdFx0XHRpZiAodGhpcy5fc2hvdWxkRHJvcFVubWFwcGVkU3ViYWdlbnRFdmVudChlLCAnc2tpbGwuaW52b2tlZCcpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIFJlc3RyaWN0ZWQgYHNraWxsQ29udGVudFJlYWRgOiB3aGljaCBza2lsbCBmaWxlIHdhcyBsb2FkZWQuIE1haW4tYWdlbnQgb25seSwgbGlrZSB0aGUgb3RoZXIgcmVzdHJpY3RlZCBldmVudHMuXG5cdFx0XHRpZiAoIWUuYWdlbnRJZCkge1xuXHRcdFx0XHR0aGlzLl90ZWxlbWV0cnlSZXBvcnRlci5za2lsbENvbnRlbnRSZWFkKHtcblx0XHRcdFx0XHRjbGllbnRUeXBlOiB0aGlzLl9jdXJyZW50VHVybj8uY2xpZW50VHlwZSA/PyBBZ2VudEhvc3RDbGllbnRUeXBlLlVua25vd24sXG5cdFx0XHRcdFx0bmFtZTogZS5kYXRhLm5hbWUsXG5cdFx0XHRcdFx0cGF0aDogZS5kYXRhLnBhdGgsXG5cdFx0XHRcdFx0Y29udGVudDogZS5kYXRhLmNvbnRlbnQsXG5cdFx0XHRcdFx0c291cmNlOiBlLmRhdGEuc291cmNlLFxuXHRcdFx0XHRcdHBsdWdpbk5hbWU6IGUuZGF0YS5wbHVnaW5OYW1lLFxuXHRcdFx0XHRcdHBsdWdpblZlcnNpb246IGUuZGF0YS5wbHVnaW5WZXJzaW9uLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhcmVudFRvb2xDYWxsSWQgPSB0aGlzLl9wYXJlbnRUb29sQ2FsbElkRm9yU3ViYWdlbnRFdmVudChlKTtcblx0XHRcdGNvbnN0IHN5bnRoID0gc3ludGhlc2l6ZVNraWxsVG9vbENhbGwoZS5kYXRhLCBlLmlkKTtcblx0XHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6IHRoaXMuX3R1cm5JZCxcblx0XHRcdFx0dG9vbENhbGxJZDogc3ludGgudG9vbENhbGxJZCxcblx0XHRcdFx0dG9vbE5hbWU6IHN5bnRoLnRvb2xOYW1lLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogc3ludGguZGlzcGxheU5hbWUsXG5cdFx0XHR9LCBwYXJlbnRUb29sQ2FsbElkKTtcblx0XHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6IHRoaXMuX3R1cm5JZCxcblx0XHRcdFx0dG9vbENhbGxJZDogc3ludGgudG9vbENhbGxJZCxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHN5bnRoLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0sIHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZDogdGhpcy5fdHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBzeW50aC50b29sQ2FsbElkLFxuXHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHN5bnRoLnBhc3RUZW5zZU1lc3NhZ2UsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LCBwYXJlbnRUb29sQ2FsbElkKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uU3ViYWdlbnRTdGFydGVkKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWdlbnRJZCkge1xuXHRcdFx0XHR0aGlzLl9wYXJlbnRUb29sQ2FsbElkc0J5QWdlbnRJZC5zZXQoZS5hZ2VudElkLCBlLmRhdGEudG9vbENhbGxJZCk7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZVN1YmFnZW50QWdlbnRJZHMuYWRkKGUuYWdlbnRJZCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gU3ViYWdlbnQgc3RhcnRlZDogdG9vbENhbGxJZD0ke2UuZGF0YS50b29sQ2FsbElkfSwgYWdlbnQ9JHtlLmRhdGEuYWdlbnROYW1lfWApO1xuXHRcdFx0Y29uc3QgdHJhY2tlZCA9IHRoaXMuX2FjdGl2ZVRvb2xDYWxscy5nZXQoZS5kYXRhLnRvb2xDYWxsSWQpO1xuXHRcdFx0dGhpcy5fb25EaWRTZXNzaW9uUHJvZ3Jlc3MuZmlyZSh7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudF9zdGFydGVkJyxcblx0XHRcdFx0Y2hhdDogdGhpcy5fY2hhdENoYW5uZWxVcmksXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IGUuZGF0YS50b29sQ2FsbElkLFxuXHRcdFx0XHRhZ2VudE5hbWU6IGUuZGF0YS5hZ2VudE5hbWUsXG5cdFx0XHRcdGFnZW50RGlzcGxheU5hbWU6IGUuZGF0YS5hZ2VudERpc3BsYXlOYW1lLFxuXHRcdFx0XHRhZ2VudERlc2NyaXB0aW9uOiBlLmRhdGEuYWdlbnREZXNjcmlwdGlvbixcblx0XHRcdFx0Ly8gVXNlIHRoZSBzcGF3bmluZyBUYXNrIHRvb2wncyBzaG9ydCBkZXNjcmlwdGlvbiBhcyB0aGUgc3ViYWdlbnQgY2hhdCB0aXRsZS5cblx0XHRcdFx0dGFza0Rlc2NyaXB0aW9uOiB0cmFja2VkPy5tZXRhPy5zdWJhZ2VudERlc2NyaXB0aW9uLFxuXHRcdFx0XHQvLyBTZWVkIHRoZSBzdWJhZ2VudCBjaGF0IHdpdGggdGhlIHNwYXduaW5nIHRvb2wncyBmdWxsIGRlbGVnYXRlZCBwcm9tcHQuXG5cdFx0XHRcdHRhc2tQcm9tcHQ6IHR5cGVvZiB0cmFja2VkPy5wYXJhbWV0ZXJzPy5wcm9tcHQgPT09ICdzdHJpbmcnID8gdHJhY2tlZC5wYXJhbWV0ZXJzLnByb21wdCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0Ly8gUHJlc2VydmUgdGhlIGltbWVkaWF0ZSBwYXJlbnQgdG9vbC1jYWxsIGVkZ2Ugc28gZGlzY292ZXJ5IGNvbnRlbnQgcm91dGVzIHRvIHRoZSByaWdodCBhbmNlc3RvciBjaGF0LlxuXHRcdFx0XHRwYXJlbnRUb29sQ2FsbElkOiB0cmFja2VkPy5wYXJlbnRUb29sQ2FsbElkLFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblNlc3Npb25FcnJvcihlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gU2Vzc2lvbiBlcnJvcjogJHtlLmRhdGEuZXJyb3JUeXBlfSAtICR7ZS5kYXRhLm1lc3NhZ2V9YCk7XG5cdFx0XHRpZiAoaXNDb3BpbG90U2RrQXV0aFJlamVjdGlvbihlLmRhdGEpKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkUmVxdWlyZUF1dGguZmlyZSgpO1xuXHRcdFx0fVxuXHRcdFx0cmVwb3J0Q29waWxvdFNka1Nlc3Npb25FcnJvcih0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCBlLCBjcmVhdGVDb3BpbG90RmFpbHVyZUNvcnJlbGF0aW9uKHRoaXMucmVzb3VyY2VVcmksIHRoaXMuX2NoYXRDaGFubmVsVXJpLCB0aGlzLl90dXJuSWQsIHRoaXMuc2Vzc2lvbklkLCB0aGlzLl9jdXJyZW50VHVybj8uY2xpZW50Q29udGV4dCkpO1xuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRUdXJuKSB7XG5cdFx0XHRcdHRoaXMuX3JlcG9ydFRvb2xDYWxsRGV0YWlscyh0aGlzLl9jdXJyZW50VHVybiwgJ2ZhaWxlZCcpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZW1pdEFjdGlvbih7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdEVycm9yLFxuXHRcdFx0XHR0dXJuSWQ6IHRoaXMuX3R1cm5JZCxcblx0XHRcdFx0ZHVyYXRpb246IHRoaXMuX2N1cnJlbnRUdXJuPy5kdXJhdGlvbiA/PyAwLFxuXHRcdFx0XHRlcnJvcjogYnVpbGRDaGF0RXJyb3JJbmZvRnJvbUNvcGlsb3RTZGtGaWVsZHMoZS5kYXRhKSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25Nb2RlbENhbGxGYWlsdXJlKGUgPT4ge1xuXHRcdFx0cmVwb3J0Q29waWxvdE1vZGVsQ2FsbEZhaWx1cmUodGhpcy5fdGVsZW1ldHJ5U2VydmljZSwgZSwgY3JlYXRlQ29waWxvdEZhaWx1cmVDb3JyZWxhdGlvbih0aGlzLnJlc291cmNlVXJpLCB0aGlzLl9jaGF0Q2hhbm5lbFVyaSwgdGhpcy5fdHVybklkLCB0aGlzLnNlc3Npb25JZCwgdGhpcy5fY3VycmVudFR1cm4/LmNsaWVudENvbnRleHQpKTtcblx0XHR9KSk7XG5cblx0XHQvLyBUcmFja3MgdGhlIGxhc3QgcGFyZW50LXNjb3BlIHVzYWdlIHNvIHRoZSBhc3luYyBhdHRyaWJ1dGlvbiBlbnJpY2htZW50XG5cdFx0Ly8gY2FuIHJlLWVtaXQgYSBjb21wbGV0ZSBhY3Rpb24gKHdpdGggYWNjdW11bGF0ZWQgY3JlZGl0cywgcXVvdGEsIGV0Yy4pLlxuXHRcdGxldCBsYXN0UGFyZW50VXNhZ2U6IFVzYWdlSW5mbyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgbGFzdFBhcmVudFVzYWdlVHVybklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGF1dG9Nb2RlUmVzb2x2ZWQ6IHsgcmVhZG9ubHkgdHVybklkOiBzdHJpbmc7IHJlYWRvbmx5IGRhdGE6IE5vbk51bGxhYmxlPFVzYWdlSW5mb01ldGFbJ2F1dG9Nb2RlUmVzb2x2ZWQnXT4gfSB8IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25BdXRvTW9kZVJlc29sdmVkKGUgPT4ge1xuXHRcdFx0dGhpcy5fbGFzdFNlZW5Nb2RlbElkID0gZS5kYXRhLmNob3Nlbk1vZGVsO1xuXHRcdFx0Y29uc3QgdHVybklkID0gdGhpcy5fdHVybklkO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIEF1dG8gbW9kZSByZXNvbHZlZCB0byAke2UuZGF0YS5jaG9zZW5Nb2RlbH0ke2UuZGF0YS5yZWFzb25pbmdCdWNrZXQgPyBgICgke2UuZGF0YS5yZWFzb25pbmdCdWNrZXR9KWAgOiAnJ31gKTtcblx0XHRcdGlmICghdHVybklkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICghZS5hZ2VudElkKSB7XG5cdFx0XHRcdHRoaXMuX3RlbGVtZXRyeVJlcG9ydGVyLmF1dG9Nb2RlUm91dGVyRGVjaXNpb24oe1xuXHRcdFx0XHRcdHNlc3Npb246IHRoaXMucmVzb3VyY2VVcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdFx0Y2xpZW50VHlwZTogdGhpcy5fY3VycmVudFR1cm4/LmNsaWVudFR5cGUgPz8gQWdlbnRIb3N0Q2xpZW50VHlwZS5Vbmtub3duLFxuXHRcdFx0XHRcdGNob3Nlbk1vZGVsOiBlLmRhdGEuY2hvc2VuTW9kZWwsXG5cdFx0XHRcdFx0cHJlZGljdGVkTGFiZWw6IGUuZGF0YS5wcmVkaWN0ZWRMYWJlbCxcblx0XHRcdFx0XHRjb25maWRlbmNlOiBlLmRhdGEuY29uZmlkZW5jZSxcblx0XHRcdFx0XHRjYW5kaWRhdGVNb2RlbHM6IGUuZGF0YS5jYW5kaWRhdGVNb2RlbHMsXG5cdFx0XHRcdFx0Y2F0ZWdvcnlTY29yZXM6IGUuZGF0YS5jYXRlZ29yeVNjb3Jlcyxcblx0XHRcdFx0XHRyb3V0aW5nTWV0aG9kOiBlLmRhdGEucm91dGluZ01ldGhvZCxcblx0XHRcdFx0XHRhdmFpbGFibGVNb2RlbHM6IGUuZGF0YS5hdmFpbGFibGVNb2RlbHMsXG5cdFx0XHRcdFx0ZmFsbGJhY2s6IGUuZGF0YS5mYWxsYmFjayxcblx0XHRcdFx0XHRmYWxsYmFja1JlYXNvbjogZS5kYXRhLmZhbGxiYWNrUmVhc29uLFxuXHRcdFx0XHRcdHN0aWNreU92ZXJyaWRlOiBlLmRhdGEuc3RpY2t5T3ZlcnJpZGUsXG5cdFx0XHRcdFx0cm91dGVyTGF0ZW5jeU1zOiBlLmRhdGEucm91dGVyTGF0ZW5jeU1zLFxuXHRcdFx0XHRcdGVuZFRvRW5kTGF0ZW5jeU1zOiBlLmRhdGEuZW5kVG9FbmRMYXRlbmN5TXMsXG5cdFx0XHRcdFx0Y2hvc2VuU2hvcnRmYWxsOiBlLmRhdGEuY2hvc2VuU2hvcnRmYWxsLFxuXHRcdFx0XHRcdGhhc0ltYWdlOiBlLmRhdGEuaGFzSW1hZ2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0YXV0b01vZGVSZXNvbHZlZCA9IHsgdHVybklkLCBkYXRhOiBlLmRhdGEgfTtcblx0XHRcdGNvbnN0IHByaW9yVXNhZ2UgPSBsYXN0UGFyZW50VXNhZ2VUdXJuSWQgPT09IHR1cm5JZCA/IGxhc3RQYXJlbnRVc2FnZSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHVzYWdlOiBVc2FnZUluZm8gPSB7XG5cdFx0XHRcdC4uLnByaW9yVXNhZ2UsXG5cdFx0XHRcdG1vZGVsOiBlLmRhdGEuY2hvc2VuTW9kZWwsXG5cdFx0XHRcdF9tZXRhOiB7XG5cdFx0XHRcdFx0Li4uKHByaW9yVXNhZ2U/Ll9tZXRhID8/IHt9KSxcblx0XHRcdFx0XHRhdXRvTW9kZVJlc29sdmVkOiBlLmRhdGEsXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0bGFzdFBhcmVudFVzYWdlID0gdXNhZ2U7XG5cdFx0XHRsYXN0UGFyZW50VXNhZ2VUdXJuSWQgPSB0dXJuSWQ7XG5cdFx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VXNhZ2UsXG5cdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0dXNhZ2UsXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uVXNhZ2UoZSA9PiB7XG5cdFx0XHR0aGlzLl9yZXN1bWVTdWJhZ2VudEZvckV2ZW50KGUpO1xuXHRcdFx0Ly8gVXNhZ2UgZXZlbnRzIGZvciBhIHN1YmFnZW50J3MgbW9kZWwgY2FsbHMgY2FycnkgdGhlIHN1YmFnZW50J3Ncblx0XHRcdC8vIGBhZ2VudElkYC4gRXZlcnkgbW9kZWwgY2FsbCBcdTIwMTQgdGhlIHBhcmVudCdzIG93biBhbmQgZXZlcnkgc3ViYWdlbnQncyBcdTIwMTRcblx0XHRcdC8vIGlzIGZvbGRlZCBpbnRvIHRoZSB0dXJuJ3MgY29zdCBiZWxvdywgc28gc3VjaCBhbiBldmVudCBhZGRpdGlvbmFsbHlcblx0XHRcdC8vIG5lZWRzIG9ubHkgdGhlIHN1YmFnZW50J3Mgb3duIHJ1bm5pbmcgY29tcG9uZW50IHRvdGFsIGVtaXR0ZWQgdG8gaXRzXG5cdFx0XHQvLyBjaGlsZCBzZXNzaW9uICh2aWEgYHBhcmVudFRvb2xDYWxsSWRgKSBmb3IgdGhlIHN1YmFnZW50IHRvb2wgdG8gc2hvd1xuXHRcdFx0Ly8gaXRzIG93biBjb3N0LlxuXHRcdFx0Y29uc3QgcGFyZW50VG9vbENhbGxJZCA9IHRoaXMuX3BhcmVudFRvb2xDYWxsSWRGb3JTdWJhZ2VudEV2ZW50KGUpO1xuXHRcdFx0aWYgKCFwYXJlbnRUb29sQ2FsbElkICYmICFlLmFnZW50SWQgJiYgIWUuZGF0YS5wYXJlbnRUb29sQ2FsbElkKSB7XG5cdFx0XHRcdHRoaXMuX3Byb21wdENhY2hlUmVmcmVzaEdlbmVyYXRpb24rKztcblx0XHRcdFx0aWYgKGUuZGF0YS5tb2RlbCAmJiBlLmRhdGEuY2FjaGVFeHBpcmVzQXQpIHtcblx0XHRcdFx0XHR0aGlzLl9zZXRQcm9tcHRDYWNoZVN0YXRlKHsgbW9kZWxJZDogZS5kYXRhLm1vZGVsLCBjYWNoZUV4cGlyZXNBdDogZS5kYXRhLmNhY2hlRXhwaXJlc0F0IH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGUuZGF0YS5tb2RlbCAmJiB0aGlzLl9wcm9tcHRDYWNoZVN0YXRlPy5tb2RlbElkICE9PSBlLmRhdGEubW9kZWwpIHtcblx0XHRcdFx0XHR0aGlzLl9zZXRQcm9tcHRDYWNoZVN0YXRlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIGBjb3BpbG90VXNhZ2VgIGlzIG1hcmtlZCBgYXNJbnRlcm5hbGAgaW4gdGhlIFNESyBzY2hlbWEgc28gaXQgaXMgbm90IGV4cG9zZWQgb24gdGhlIGdlbmVyYXRlZFxuXHRcdFx0Ly8gYEFzc2lzdGFudFVzYWdlRGF0YWAgdHlwZSwgYnV0IGl0IGlzIHByZXNlbnQgYXQgcnVudGltZS4gUmVhZCBpdCBkeW5hbWljYWxseS5cblx0XHRcdGNvbnN0IGNvcGlsb3RVc2FnZSA9IHJlYWRDb3BpbG90VXNhZ2UoZS5kYXRhKTtcblx0XHRcdC8vIGBxdW90YVNuYXBzaG90c2AgaXMgbGlrZXdpc2UgYGFzSW50ZXJuYWxgIGluIHRoZSBTREsgc2NoZW1hIChub3Qgb24gdGhlIGdlbmVyYXRlZCB0eXBlKSBidXQgaXNcblx0XHRcdC8vIHByZXNlbnQgYXQgcnVudGltZS4gRm9yd2FyZCB0aGUgcGVyLWNhdGVnb3J5IHNuYXBzaG90cyBvbiBgX21ldGFgIHNvIHRoZSBjbGllbnQgY2FuIGtlZXAgdGhlXG5cdFx0XHQvLyBhY2NvdW50IHF1b3RhIFVJIGN1cnJlbnQuIE1pcnJvcnMgdGhlIGV4dGVuc2lvbi1ob3N0IENMSSBwYXRoLCB3aGljaCBmZWVkcyB0aGVzZSBpbnRvIGl0cyBxdW90YSBzZXJ2aWNlLlxuXHRcdFx0Y29uc3QgcXVvdGFTbmFwc2hvdHMgPSBub3JtYWxpemVRdW90YVNuYXBzaG90cygoZS5kYXRhIGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLnF1b3RhU25hcHNob3RzKTtcblx0XHRcdGNvbnN0IHR1cm4gPSB0aGlzLl9jdXJyZW50VHVybjtcblxuXHRcdFx0aWYgKHR5cGVvZiBlLmRhdGEubW9kZWwgPT09ICdzdHJpbmcnICYmIGUuZGF0YS5tb2RlbCkge1xuXHRcdFx0XHR0aGlzLl9sYXN0U2Vlbk1vZGVsSWQgPSBlLmRhdGEubW9kZWw7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRoaXMgZXZlbnQncyBvd24gY29udGV4dCB1c2FnZSAodGhlIG1vZGVsIGNhbGwgdGhhdCBwcm9kdWNlZCBpdCkuXG5cdFx0XHRjb25zdCBldmVudENvbnRleHQgPSB7XG5cdFx0XHRcdGlucHV0VG9rZW5zOiBlLmRhdGEuaW5wdXRUb2tlbnMsXG5cdFx0XHRcdG91dHB1dFRva2VuczogZS5kYXRhLm91dHB1dFRva2Vucyxcblx0XHRcdFx0bW9kZWw6IGUuZGF0YS5tb2RlbCxcblx0XHRcdFx0Y2FjaGVSZWFkVG9rZW5zOiBlLmRhdGEuY2FjaGVSZWFkVG9rZW5zLFxuXHRcdFx0XHQuLi4odHlwZW9mIGUuZGF0YS5jb3N0ID09PSAnbnVtYmVyJyA/IHsgY29zdDogZS5kYXRhLmNvc3QgfSA6IHt9KSxcblx0XHRcdH07XG5cblx0XHRcdC8vIFJlY29yZCB0aGUgcGFyZW50IGFnZW50J3Mgb3duIGNvbnRleHQgdXNhZ2Ugc28gc3ViYWdlbnQgZXZlbnRzXG5cdFx0XHQvLyBkb24ndCBvdmVyd3JpdGUgdGhlIG1vZGVsL2NvbnRleHQgdG9rZW5zIHNob3duIGZvciB0aGUgcGFyZW50IHR1cm4uXG5cdFx0XHRpZiAoIXBhcmVudFRvb2xDYWxsSWQgJiYgdHVybikge1xuXHRcdFx0XHR0dXJuLnBhcmVudENvbnRleHRVc2FnZSA9IGV2ZW50Q29udGV4dDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRm9sZCB0aGlzIG1vZGVsIGNhbGwgaW50byB0aGUgdHVybidzIHdob2xlLXR1cm4gcGVyLW1vZGVsIHRvdGFscy5cblx0XHRcdC8vIERvbmUgb25jZSBwZXIgZXZlbnQsIGJlZm9yZSB0aGUgdXNhZ2Ugb2JqZWN0cyBhcmUgYnVpbHQsIHNvIGFcblx0XHRcdC8vIHN1YmFnZW50IGNhbGwgY291bnRzIHRvd2FyZCB0aGUgdHVybiB1bmRlciBpdHMgb3duIG1vZGVsIHdpdGhvdXRcblx0XHRcdC8vIGJlaW5nIGNvdW50ZWQgdHdpY2UgYnkgdGhlIHBhcmVudCBhbmQgc3ViYWdlbnQgZW1pdHMgYmVsb3cuXG5cdFx0XHR0dXJuPy5hZGRUb2tlblRvdGFscyhldmVudENvbnRleHQubW9kZWwsIGV2ZW50Q29udGV4dCk7XG5cblx0XHRcdC8vIEJ1aWxkcyBhIHVzYWdlIG9iamVjdCBjYXJyeWluZyB0aGUgZ2l2ZW4gY29udGV4dCdzIHRva2Vucy9tb2RlbCBwbHVzXG5cdFx0XHQvLyB0aGUgY3JlZGl0IHRvdGFsIGZvciB0aGUgZ2l2ZW4gc2NvcGUuIGBjb3BpbG90VXNhZ2VgIGlzIHRoZSBzY29wZSdzXG5cdFx0XHQvLyBDb3BpbG90IGJpbGxpbmcgbWV0YWRhdGEsIG9yIGB1bmRlZmluZWRgIHdoZW4gbm90aGluZyBpcyBiaWxsZWQgeWV0LlxuXHRcdFx0Y29uc3QgYnVpbGRVc2FnZSA9IChjb250ZXh0OiBVc2FnZUNvbnRleHQsIHNjb3BlZENvcGlsb3RVc2FnZTogVXNhZ2VJbmZvTWV0YVsnY29waWxvdFVzYWdlJ10sIGlzUGFyZW50U2NvcGU6IGJvb2xlYW4pOiBVc2FnZUluZm8gPT4ge1xuXHRcdFx0XHRjb25zdCBtZXRhZGF0YTogVXNhZ2VJbmZvTWV0YSA9IHt9O1xuXHRcdFx0XHRpZiAodHlwZW9mIGNvbnRleHQuY29zdCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRtZXRhZGF0YS5jb3N0ID0gY29udGV4dC5jb3N0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChpc1BhcmVudFNjb3BlICYmIGF1dG9Nb2RlUmVzb2x2ZWQ/LnR1cm5JZCA9PT0gdGhpcy5fdHVybklkKSB7XG5cdFx0XHRcdFx0bWV0YWRhdGEuYXV0b01vZGVSZXNvbHZlZCA9IGF1dG9Nb2RlUmVzb2x2ZWQuZGF0YTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc2NvcGVkQ29waWxvdFVzYWdlKSB7XG5cdFx0XHRcdFx0bWV0YWRhdGEuY29waWxvdFVzYWdlID0gc2NvcGVkQ29waWxvdFVzYWdlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChxdW90YVNuYXBzaG90cykge1xuXHRcdFx0XHRcdG1ldGFkYXRhLnF1b3RhU25hcHNob3RzID0gcXVvdGFTbmFwc2hvdHM7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gT25seSB0aGUgcGFyZW50IHNjb3BlIHJlcG9ydHMgd2hvbGUtdHVybiB0b3RhbHM7IGEgc3ViYWdlbnQnc1xuXHRcdFx0XHQvLyBvd24gdXNhZ2UgZGVzY3JpYmVzIGp1c3QgaXRzIGNvbXBvbmVudCBvZiB0aGUgdHVybi5cblx0XHRcdFx0Y29uc3QgdHVyblRva2VuVG90YWxzID0gaXNQYXJlbnRTY29wZSA/IHR1cm4/LnRva2VuVG90YWxzIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAodHVyblRva2VuVG90YWxzKSB7XG5cdFx0XHRcdFx0bWV0YWRhdGEudHVyblRva2VuVG90YWxzID0gdHVyblRva2VuVG90YWxzO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aW5wdXRUb2tlbnM6IGNvbnRleHQuaW5wdXRUb2tlbnMsXG5cdFx0XHRcdFx0b3V0cHV0VG9rZW5zOiBjb250ZXh0Lm91dHB1dFRva2Vucyxcblx0XHRcdFx0XHRtb2RlbDogY29udGV4dC5tb2RlbCxcblx0XHRcdFx0XHRjYWNoZVJlYWRUb2tlbnM6IGNvbnRleHQuY2FjaGVSZWFkVG9rZW5zLFxuXHRcdFx0XHRcdC4uLihPYmplY3Qua2V5cyhtZXRhZGF0YSkubGVuZ3RoID4gMCA/IHsgX21ldGE6IG1ldGFkYXRhIH0gOiB7fSksXG5cdFx0XHRcdH07XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBGb2xkIHRoaXMgY2FsbCdzIGNvc3QgaW50byB0aGUgdHVybiBiZWZvcmUgYnVpbGRpbmcgYW55IHJlcG9ydCwgc28gdGhlXG5cdFx0XHQvLyBlbWlzc2lvbiBiZWxvdyBhbHJlYWR5IGNhcnJpZXMgaXQuIEV2ZXJ5IG1vZGVsIGNhbGwgdGhlIHR1cm4gY2F1c2VkXG5cdFx0XHQvLyBjb3VudHMgdG93YXJkIGl0LCBzdWJhZ2VudHMgaW5jbHVkZWQuIERvbmUgc3luY2hyb25vdXNseSBoZXJlIHJhdGhlclxuXHRcdFx0Ly8gdGhhbiBmcm9tIHRoZSBTREsncyBzZXNzaW9uIHRvdGFsLCB3aGljaCBpcyByZWFkIGFjcm9zcyBhbiBhd2FpdCB0aGF0XG5cdFx0XHQvLyB0aGUgdGVybWluYWwgYHNlc3Npb24uaWRsZWAgY2FuIGJlYXQuXG5cdFx0XHRpZiAodHVybiAmJiBjb3BpbG90VXNhZ2UpIHtcblx0XHRcdFx0dHVybi5jb3BpbG90TmFub0FpdSArPSBjb3BpbG90VXNhZ2UudG90YWxOYW5vQWl1O1xuXHRcdFx0XHRpZiAocGFyZW50VG9vbENhbGxJZCkge1xuXHRcdFx0XHRcdGNvbnN0IHNjb3BlZFRvdGFsID0gKHR1cm4uc3ViYWdlbnROYW5vQWl1QnlUb29sQ2FsbElkLmdldChwYXJlbnRUb29sQ2FsbElkKSA/PyAwKSArIGNvcGlsb3RVc2FnZS50b3RhbE5hbm9BaXU7XG5cdFx0XHRcdFx0dHVybi5zdWJhZ2VudE5hbm9BaXVCeVRvb2xDYWxsSWQuc2V0KHBhcmVudFRvb2xDYWxsSWQsIHNjb3BlZFRvdGFsKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBQYXJlbnQgdHVybiBhZ2dyZWdhdGU6IGEgc3ViYWdlbnQgZXZlbnQgbXVzdCBub3QgcmVwbGFjZSB0aGUgcGFyZW50XG5cdFx0XHQvLyB0dXJuJ3Mgb3duIG1vZGVsL2NvbnRleHQtdG9rZW4gdXNhZ2UsIHNvIHByZXNlcnZlIHRoZSBwYXJlbnQncyBjb250ZXh0LlxuXHRcdFx0Y29uc3QgcGFyZW50Q29udGV4dCA9IHBhcmVudFRvb2xDYWxsSWQgPyAodHVybj8ucGFyZW50Q29udGV4dFVzYWdlID8/IHt9KSA6IGV2ZW50Q29udGV4dDtcblx0XHRcdGNvbnN0IHBhcmVudFVzYWdlID0gYnVpbGRVc2FnZShwYXJlbnRDb250ZXh0LCB0aGlzLl9wYXJlbnRDb3BpbG90VXNhZ2VNZXRhKCksIHRydWUpO1xuXHRcdFx0bGFzdFBhcmVudFVzYWdlID0gcGFyZW50VXNhZ2U7XG5cdFx0XHRsYXN0UGFyZW50VXNhZ2VUdXJuSWQgPSB0aGlzLl90dXJuSWQ7XG5cdFx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VXNhZ2UsXG5cdFx0XHRcdHR1cm5JZDogdGhpcy5fdHVybklkLFxuXHRcdFx0XHR1c2FnZTogcGFyZW50VXNhZ2UsXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gU3ViYWdlbnQgY29tcG9uZW50OiBhZGRpdGlvbmFsbHkgcmVwb3J0IHRoZSBzdWJhZ2VudCdzIG93biBydW5uaW5nXG5cdFx0XHQvLyB0b3RhbCB0byBpdHMgY2hpbGQgc2Vzc2lvbi4gVGhlIFNESydzIHNlc3Npb24gbWV0cmljcyBjYXJyeSBub1xuXHRcdFx0Ly8gcGVyLWFnZW50IGJyZWFrZG93biwgc28gdGhpcyBpcyB0aGUgb25seSBzb3VyY2UgZm9yIGl0LlxuXHRcdFx0aWYgKHBhcmVudFRvb2xDYWxsSWQpIHtcblx0XHRcdFx0Y29uc3Qgc2NvcGVkVG90YWwgPSB0dXJuPy5zdWJhZ2VudE5hbm9BaXVCeVRvb2xDYWxsSWQuZ2V0KHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0XHRjb25zdCBzdWJhZ2VudENvcGlsb3RVc2FnZSA9IGNvcGlsb3RVc2FnZSAmJiBzY29wZWRUb3RhbCAhPT0gdW5kZWZpbmVkXG5cdFx0XHRcdFx0PyB7IC4uLmNvcGlsb3RVc2FnZSwgdG90YWxOYW5vQWl1OiBzY29wZWRUb3RhbCB9XG5cdFx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFVzYWdlLFxuXHRcdFx0XHRcdHR1cm5JZDogdGhpcy5fdHVybklkLFxuXHRcdFx0XHRcdHVzYWdlOiBidWlsZFVzYWdlKGV2ZW50Q29udGV4dCwgc3ViYWdlbnRDb3BpbG90VXNhZ2UsIGZhbHNlKSxcblx0XHRcdFx0fSwgcGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQWZ0ZXIgZWFjaCB1c2FnZSBldmVudCwgYXN5bmNocm9ub3VzbHkgcmVmcmVzaCB0aGUgU0RLJ3Mgc2Vzc2lvbi13aWRlIHRvdGFsXG5cdFx0Ly8gKGF1dGhvcml0YXRpdmUgZm9yIHRoZSBzZXNzaW9uLCBhbmQgdGhlIG9ubHkgc291cmNlIHRoYXQgc2VlcyB3b3JrIGJpbGxlZFxuXHRcdC8vIG91dHNpZGUgYSB0dXJuKSBhbmQgcmUtZW1pdCB0aGUgcGFyZW50IGFnZ3JlZ2F0ZSB3aXRoIGl0LiBGb3IgbWFpbi1hZ2VudFxuXHRcdC8vIGNhbGxzIHRoZSBwZXItc291cmNlIGNvbnRleHQtd2luZG93IGF0dHJpYnV0aW9uIGlzIGZldGNoZWQgYW5kIG1lcmdlZCBpblxuXHRcdC8vIHRvbyBcdTIwMTQgYSBzdWJhZ2VudCBydW5zIGFnYWluc3QgaXRzIG93biBjb250ZXh0LCBzbyBpdHMgZXZlbnRzIG11c3Qgbm90XG5cdFx0Ly8gcmV3cml0ZSB0aGUgcGFyZW50J3MgYXR0cmlidXRpb24uIFRoZSByZWR1Y2VyIHJlcGxhY2VzIGBhY3RpdmVUdXJuLnVzYWdlYCxcblx0XHQvLyBzbyB0aGUgd2lkZ2V0IHBpY2tzIHVwIHRoZSB1cGRhdGUgb24gdGhlIG5leHQgcmVuZGVyIGN5Y2xlLlxuXHRcdC8vXG5cdFx0Ly8gTG9zaW5nIHRoaXMgcmUtZW1pdCB0byBhIHR1cm4gdGhhdCBlbmRlZCBtaWQtZmxpZ2h0IGNvc3RzIG9ubHkgdGhlIHNlc3Npb25cblx0XHQvLyB0b3RhbCdzIGZyZXNobmVzczsgdGhlIHR1cm4ncyBvd24gY29zdCB3YXMgYWxyZWFkeSByZXBvcnRlZCBzeW5jaHJvbm91c2x5LlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25Vc2FnZShhc3luYyBlID0+IHtcblx0XHRcdGNvbnN0IGlzU3ViYWdlbnRFdmVudCA9ICEhdGhpcy5fcGFyZW50VG9vbENhbGxJZEZvclN1YmFnZW50RXZlbnQoZSk7XG5cdFx0XHRjb25zdCB0dXJuSWQgPSB0aGlzLl90dXJuSWQ7XG5cdFx0XHQvLyBDYXB0dXJlIHRoZSBiYXNlIHVzYWdlIGJlZm9yZSB0aGUgYXdhaXQgYm91bmRhcnkgc28gY29uY3VycmVudFxuXHRcdFx0Ly8gdXNhZ2UgZXZlbnRzIGRvbid0IG92ZXJ3cml0ZSB3aGF0IHdlIG1lcmdlIGludG8uXG5cdFx0XHRjb25zdCBiYXNlVXNhZ2UgPSBsYXN0UGFyZW50VXNhZ2VUdXJuSWQgPT09IHR1cm5JZCA/IGxhc3RQYXJlbnRVc2FnZSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHVzYWdlOiBVc2FnZUluZm8gPSBiYXNlVXNhZ2UgPz8ge1xuXHRcdFx0XHRpbnB1dFRva2VuczogZS5kYXRhLmlucHV0VG9rZW5zLFxuXHRcdFx0XHRvdXRwdXRUb2tlbnM6IGUuZGF0YS5vdXRwdXRUb2tlbnMsXG5cdFx0XHRcdG1vZGVsOiBlLmRhdGEubW9kZWwsXG5cdFx0XHRcdGNhY2hlUmVhZFRva2VuczogZS5kYXRhLmNhY2hlUmVhZFRva2Vucyxcblx0XHRcdH07XG5cdFx0XHRhd2FpdCB0aGlzLl9yZWZyZXNoU2Vzc2lvblVzYWdlTWV0cmljcygpO1xuXHRcdFx0Y29uc3QgYXR0cmlidXRpb24gPSBpc1N1YmFnZW50RXZlbnQgPyB1bmRlZmluZWQgOiBhd2FpdCB0aGlzLl9yZWFkQ29udGV4dEF0dHJpYnV0aW9uKCk7XG5cdFx0XHRpZiAoIXR1cm5JZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBJZiB0aGUgdHVybiBjaGFuZ2VkIHdoaWxlIHdlIHdlcmUgYXdhaXRpbmcsIGRvbid0IHBvbGx1dGUgdGhlXG5cdFx0XHQvLyBuZXcgdHVybidzIHN0YXRlIHdpdGggc3RhbGUgZGF0YS4gTGlrZXdpc2UsIGd1YXJkIGFnYWluc3QgYSBuZXdlclxuXHRcdFx0Ly8gdXNhZ2UgZXZlbnQgaGF2aW5nIGFycml2ZWQgXHUyMDE0IG9ubHkgZW5yaWNoIGlmIGJhc2VVc2FnZSBpcyBjdXJyZW50LlxuXHRcdFx0aWYgKHR1cm5JZCAhPT0gdGhpcy5fdHVybklkIHx8IHVzYWdlICE9PSBsYXN0UGFyZW50VXNhZ2UgfHwgbGFzdFBhcmVudFVzYWdlVHVybklkICE9PSB0dXJuSWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29waWxvdFVzYWdlID0gdGhpcy5fcGFyZW50Q29waWxvdFVzYWdlTWV0YSgpO1xuXHRcdFx0aWYgKCFhdHRyaWJ1dGlvbiAmJiAhY29waWxvdFVzYWdlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVucmljaGVkOiBVc2FnZUluZm8gPSB7XG5cdFx0XHRcdC4uLnVzYWdlLFxuXHRcdFx0XHRfbWV0YToge1xuXHRcdFx0XHRcdC4uLih1c2FnZS5fbWV0YSA/PyB7fSksXG5cdFx0XHRcdFx0Li4uKGNvcGlsb3RVc2FnZSA/IHsgY29waWxvdFVzYWdlIH0gOiB7fSksXG5cdFx0XHRcdFx0Li4uKGF0dHJpYnV0aW9uID8geyBjb250ZXh0QXR0cmlidXRpb246IGF0dHJpYnV0aW9uIH0gOiB7fSksXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0bGFzdFBhcmVudFVzYWdlID0gZW5yaWNoZWQ7XG5cdFx0XHRsYXN0UGFyZW50VXNhZ2VUdXJuSWQgPSB0dXJuSWQ7XG5cdFx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VXNhZ2UsXG5cdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0dXNhZ2U6IGVucmljaGVkLFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ29tcGFjdGlvbiAobWFudWFsIGAvY29tcGFjdGAgb3IgYXV0b21hdGljKSBydW5zIGl0cyBvd24gc3VtbWFyaXphdGlvbiBtb2RlbCBjYWxsLCB3aGljaCB0aGVcblx0XHQvLyBTREsgYmlsbHMgb24gYHNlc3Npb24uY29tcGFjdGlvbl9jb21wbGV0ZWAgcmF0aGVyIHRoYW4gYXMgYW4gYGFzc2lzdGFudC51c2FnZWAgZXZlbnQuXG5cdFx0Ly9cblx0XHQvLyBBIGNvbXBhY3Rpb24gdGhhdCBydW5zICpkdXJpbmcqIGEgdHVybiBpcyB0aGF0IHR1cm4ncyBjb3N0LCBzbyBmb2xkIGl0IGluIGxpa2UgYW55IG90aGVyXG5cdFx0Ly8gY2FsbC4gT25lIHRoYXQgcnVucyBiZXR3ZWVuIHR1cm5zIGJlbG9uZ3MgdG8gbm8gdHVybjogaXQgaXMgcmVmbGVjdGVkIGluIHRoZSBzZXNzaW9uIHRvdGFsXG5cdFx0Ly8gb25seSwgcmF0aGVyIHRoYW4gYmVpbmcgY2FycmllZCBvbnRvIHdoYXRldmVyIHJ1bnMgbmV4dCBhbmQgaW5mbGF0aW5nIGFuIHVucmVsYXRlZFxuXHRcdC8vIHJlc3BvbnNlIGZvb3RlciBieSB3aGF0IGlzIG9mdGVuIHRoZSBzZXNzaW9uJ3Mgc2luZ2xlIG1vc3QgZXhwZW5zaXZlIGNhbGwuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblNlc3Npb25Db21wYWN0aW9uQ29tcGxldGUoYXN5bmMgZSA9PiB7XG5cdFx0XHRpZiAoZS5hZ2VudElkIHx8IGUuZGF0YS5zdWNjZXNzID09PSBmYWxzZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb3BpbG90VXNhZ2UgPSByZWFkQ29waWxvdFVzYWdlKGUuZGF0YS5jb21wYWN0aW9uVG9rZW5zVXNlZCk7XG5cdFx0XHRjb25zdCB0dXJuID0gdGhpcy5fY3VycmVudFR1cm47XG5cdFx0XHRjb25zdCBjb21wYWN0aW9uVG9rZW5zID0gZS5kYXRhLmNvbXBhY3Rpb25Ub2tlbnNVc2VkO1xuXHRcdFx0dHVybj8uYWRkVG9rZW5Ub3RhbHMoY29tcGFjdGlvblRva2Vucz8ubW9kZWwgPz8gdGhpcy5fbGFzdFNlZW5Nb2RlbElkLCB7XG5cdFx0XHRcdGlucHV0VG9rZW5zOiBjb21wYWN0aW9uVG9rZW5zPy5pbnB1dFRva2Vucyxcblx0XHRcdFx0b3V0cHV0VG9rZW5zOiBjb21wYWN0aW9uVG9rZW5zPy5vdXRwdXRUb2tlbnMsXG5cdFx0XHRcdGNhY2hlUmVhZFRva2VuczogY29tcGFjdGlvblRva2Vucz8uY2FjaGVSZWFkVG9rZW5zLFxuXHRcdFx0fSk7XG5cdFx0XHQvLyBSZXBvcnQgdGhlIHR1cm4ncyBjb3N0IGJlZm9yZSBhd2FpdGluZyBhbnl0aGluZy4gVGhlIHRlcm1pbmFsIGBzZXNzaW9uLmlkbGVgXG5cdFx0XHQvLyBjYW4gYXJyaXZlIHdoaWxlIHRoZSBtZXRyaWNzIHJlYWQgaXMgaW4gZmxpZ2h0IGFuZCBjbG9zZSB0aGUgdHVybiwgYWZ0ZXJcblx0XHRcdC8vIHdoaWNoIHRoZSByZWR1Y2VyIGRyb3BzIHVzYWdlIGZvciBpdCBcdTIwMTQgc28gYSBjb21wYWN0aW9uIHdob3NlIHR1cm4gZW5kc1xuXHRcdFx0Ly8gaW1tZWRpYXRlbHkgKGUuZy4gb25lIGZvbGxvd2VkIGJ5IGEgZmFpbGluZyBtb2RlbCBjYWxsKSB3b3VsZCBuZXZlciBiZVxuXHRcdFx0Ly8gcGVyc2lzdGVkIGlmIHRoaXMgd2FpdGVkLlxuXHRcdFx0Y29uc3QgZW1pdFBhcmVudFVzYWdlID0gKCk6IHN0cmluZyB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRcdGNvbnN0IHR1cm5JZCA9IHRoaXMuX3R1cm5JZDtcblx0XHRcdFx0Y29uc3QgcGFyZW50Q29waWxvdFVzYWdlID0gdGhpcy5fcGFyZW50Q29waWxvdFVzYWdlTWV0YSgpO1xuXHRcdFx0XHRjb25zdCB0dXJuVG9rZW5Ub3RhbHMgPSB0aGlzLl9jdXJyZW50VHVybj8udG9rZW5Ub3RhbHM7XG5cdFx0XHRcdGlmICghdHVybklkIHx8ICghcGFyZW50Q29waWxvdFVzYWdlICYmICF0dXJuVG9rZW5Ub3RhbHMpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBQcmVzZXJ2ZSB0aGUgcGFyZW50IHR1cm4ncyBvd24gbW9kZWwvY29udGV4dCB0b2tlbnM6IHRoZSBjb21wYWN0aW9uIGNhbGwncyB0b2tlbnMgZGVzY3JpYmVcblx0XHRcdFx0Ly8gdGhlIHN1bW1hcml6YXRpb24gcmVxdWVzdCwgbm90IHRoZSBjb252ZXJzYXRpb24sIHNvIHRoZXkgbXVzdCBub3QgcmVwbGFjZSB3aGF0IGlzIHNob3duLlxuXHRcdFx0XHRjb25zdCBiYXNlID0gbGFzdFBhcmVudFVzYWdlVHVybklkID09PSB0dXJuSWQgPyBsYXN0UGFyZW50VXNhZ2UgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IHVzYWdlOiBVc2FnZUluZm8gPSB7XG5cdFx0XHRcdFx0Li4uYmFzZSxcblx0XHRcdFx0XHRtb2RlbDogYmFzZT8ubW9kZWwgPz8gdGhpcy5fbGFzdFNlZW5Nb2RlbElkLFxuXHRcdFx0XHRcdF9tZXRhOiB7XG5cdFx0XHRcdFx0XHQuLi4oYmFzZT8uX21ldGEgPz8ge30pLFxuXHRcdFx0XHRcdFx0Li4uKHBhcmVudENvcGlsb3RVc2FnZSA/IHsgY29waWxvdFVzYWdlOiBwYXJlbnRDb3BpbG90VXNhZ2UgfSA6IHt9KSxcblx0XHRcdFx0XHRcdC4uLih0dXJuVG9rZW5Ub3RhbHMgPyB7IHR1cm5Ub2tlblRvdGFscyB9IDoge30pLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cdFx0XHRcdGxhc3RQYXJlbnRVc2FnZSA9IHVzYWdlO1xuXHRcdFx0XHRsYXN0UGFyZW50VXNhZ2VUdXJuSWQgPSB0dXJuSWQ7XG5cdFx0XHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFVzYWdlLFxuXHRcdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0XHR1c2FnZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybiB0dXJuSWQ7XG5cdFx0XHR9O1xuXG5cdFx0XHRpZiAodHVybiAmJiBjb3BpbG90VXNhZ2UpIHtcblx0XHRcdFx0dHVybi5jb3BpbG90TmFub0FpdSArPSBjb3BpbG90VXNhZ2UudG90YWxOYW5vQWl1O1xuXHRcdFx0XHRlbWl0UGFyZW50VXNhZ2UoKTtcblx0XHRcdH1cblx0XHRcdC8vIFRoZW4gcGljayB1cCB0aGUgc2Vzc2lvbi13aWRlIHRvdGFsLCB3aGljaCBhbHNvIGNvdmVycyBhIGNvbXBhY3Rpb24gYmlsbGVkXG5cdFx0XHQvLyB3aGlsZSBubyB0dXJuIHdhcyBhY3RpdmUsIGFuZCByZS1lbWl0IHNvIHRoZSB3aWRnZXQgcmVmbGVjdHMgaXQuXG5cdFx0XHRjb25zdCB0dXJuSWRCZWZvcmVSZWZyZXNoID0gdGhpcy5fdHVybklkO1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMuX3JlZnJlc2hTZXNzaW9uVXNhZ2VNZXRyaWNzKCkgJiYgdHVybklkQmVmb3JlUmVmcmVzaCA9PT0gdGhpcy5fdHVybklkKSB7XG5cdFx0XHRcdGVtaXRQYXJlbnRVc2FnZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25SZWFzb25pbmdEZWx0YShlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gUmVhc29uaW5nIGRlbHRhOiAke2UuZGF0YS5kZWx0YUNvbnRlbnQubGVuZ3RofSBjaGFyc2ApO1xuXHRcdFx0dGhpcy5fcmVzdW1lU3ViYWdlbnRGb3JFdmVudChlKTtcblx0XHRcdGlmICh0aGlzLl9zaG91bGREcm9wVW5tYXBwZWRTdWJhZ2VudEV2ZW50KGUsICdhc3Npc3RhbnQucmVhc29uaW5nX2RlbHRhJykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZW1pdFJlYXNvbmluZ0RlbHRhKGUuZGF0YS5kZWx0YUNvbnRlbnQsIHRoaXMuX3BhcmVudFRvb2xDYWxsSWRGb3JTdWJhZ2VudEV2ZW50KGUpKTtcblx0XHR9KSk7XG5cblx0XHQvLyBTeW5jIHRoZSBBSFAgc2Vzc2lvbiBjb25maWcgd2hlbiB0aGUgU0RLJ3MgYGN1cnJlbnRNb2RlYCBjaGFuZ2VzXG5cdFx0Ly8gKGUuZy4gYWZ0ZXIgdGhlIG1vZGVsIGFwcHJvdmVzIGEgcGxhbiwgb3IgYWZ0ZXIgd2Ugc2V0IHRoZSBtb2RlXG5cdFx0Ly8gYmVmb3JlIHNlbmRpbmcpLiBUaGUgU0RLIGFuZCBBSFAgc2hhcmUgdGhlIHNhbWUgdGhyZWUgbW9kZXNcblx0XHQvLyAoYGludGVyYWN0aXZlYCAvIGBwbGFuYCAvIGBhdXRvcGlsb3RgKSwgc28gd2UgbWFwIGRpcmVjdGx5LlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25TZXNzaW9uTW9kZUNoYW5nZWQoZSA9PiB7XG5cdFx0XHQvLyBTdWItYWdlbnRzIChlLmcuIGEgYHRhc2tgIHRvb2wgc3ViLWFnZW50IHJ1bm5pbmcgaW4gcGxhbiBtb2RlKVxuXHRcdFx0Ly8gZW1pdCB0aGVpciBvd24gYHNlc3Npb24ubW9kZV9jaGFuZ2VkYCBldmVudHMgY2FycnlpbmcgYW5cblx0XHRcdC8vIGBhZ2VudElkYC5cblx0XHRcdGlmIChlLmFnZW50SWQpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBJZ25vcmluZyBzdWJhZ2VudCBzZXNzaW9uLm1vZGVfY2hhbmdlZDogYWdlbnRJZD0ke2UuYWdlbnRJZH0sICR7ZS5kYXRhLnByZXZpb3VzTW9kZX0gLT4gJHtlLmRhdGEubmV3TW9kZX1gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIHNlc3Npb24ubW9kZV9jaGFuZ2VkOiAke2UuZGF0YS5wcmV2aW91c01vZGV9IC0+ICR7ZS5kYXRhLm5ld01vZGV9YCk7XG5cdFx0XHRjb25zdCBuZXdNb2RlID0gZS5kYXRhLm5ld01vZGU7XG5cdFx0XHRpZiAobmV3TW9kZSAhPT0gJ2ludGVyYWN0aXZlJyAmJiBuZXdNb2RlICE9PSAncGxhbicgJiYgbmV3TW9kZSAhPT0gJ2F1dG9waWxvdCcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbGFzdEFwcGxpZWRNb2RlID0gbmV3TW9kZTtcblx0XHRcdHRoaXMuX3N5bmNBaHBDb25maWdGcm9tU2RrTW9kZShuZXdNb2RlKTtcblx0XHR9KSk7XG5cblx0XHQvLyBUcmFuc2xhdGUgU0RLLXJlcG9ydGVkIE1DUCBzZXJ2ZXIgbGlmZWN5Y2xlIGludG8gQUhQIGN1c3RvbWl6YXRpb25cblx0XHQvLyBhY3Rpb25zLiBUaGUgY29udHJvbGxlciBkZWNpZGVzIHdoZXRoZXIgZWFjaCBzZXJ2ZXIgaXMgYVxuXHRcdC8vIHBsdWdpbi1kZXJpdmVkIGNoaWxkIChuYXJyb3cgYFNlc3Npb25NY3BTZXJ2ZXJTdGF0ZUNoYW5nZWRgKSBvciBhXG5cdFx0Ly8gYmFyZSB0b3AtbGV2ZWwgZW50cnkgKGBTZXNzaW9uQ3VzdG9taXphdGlvblVwZGF0ZWRgKS4gRWFjaCBzdGF0ZVxuXHRcdC8vIGNoYW5nZSBpcyBhbHNvIGxvZ2dlZCAod2l0aCBzdHJ1Y3R1cmVkIG1ldGFkYXRhKSBzbyBpdCBmbG93cyB0byB0aGVcblx0XHQvLyBhZ2VudCBob3N0J3MgT1RMUCBsb2cgc3RyZWFtIGFuZCB0aGUgcGVyLXNlcnZlciBPdXRwdXQgY2hhbm5lbHMuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vbk1jcFNlcnZlcnNMb2FkZWQoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dNY3BTZXJ2ZXJzU25hcHNob3QoZS5kYXRhLnNlcnZlcnMubWFwKChzOiBNY3BTZXJ2ZXJzTG9hZGVkU2VydmVyKSA9PiAoe1xuXHRcdFx0XHRuYW1lOiBzLm5hbWUsXG5cdFx0XHRcdHN0YXR1czogcy5zdGF0dXMsXG5cdFx0XHRcdGVycm9yOiBzLmVycm9yLFxuXHRcdFx0XHRzb3VyY2U6IHMuc291cmNlLFxuXHRcdFx0XHR0cmFuc3BvcnQ6IHMudHJhbnNwb3J0LFxuXHRcdFx0XHRwbHVnaW5OYW1lOiBzLnBsdWdpbk5hbWUsXG5cdFx0XHRcdHBsdWdpblZlcnNpb246IHMucGx1Z2luVmVyc2lvbixcblx0XHRcdH0pKSwgJ2xvYWRlZCcpO1xuXHRcdFx0dGhpcy5fYXBwbHlNY3BTZXJ2ZXJMaXN0KGUuZGF0YS5zZXJ2ZXJzKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vbk1jcFNlcnZlclN0YXR1c0NoYW5nZWQoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dNY3BTZXJ2ZXJMaWZlY3ljbGUoeyBuYW1lOiBlLmRhdGEuc2VydmVyTmFtZSwgc3RhdHVzOiBlLmRhdGEuc3RhdHVzLCBlcnJvcjogZS5kYXRhLmVycm9yLCBvcmlnaW46ICdzdGF0dXNDaGFuZ2VkJyB9KTtcblx0XHRcdGNvbnN0IHNlcnZlciA9IHRoaXMuX3RvU2RrTWNwU2VydmVyKGUuZGF0YS5zZXJ2ZXJOYW1lLCBlLmRhdGEuc3RhdHVzLCBlLmRhdGEuZXJyb3IpO1xuXHRcdFx0aWYgKCFzZXJ2ZXIpIHtcblx0XHRcdFx0dGhpcy5fbWNwQ3VzdG9taXphdGlvbnMucmVtb3ZlKGUuZGF0YS5zZXJ2ZXJOYW1lKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbWNwQ3VzdG9taXphdGlvbnMuYXBwbHlPbmUoc2VydmVyKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uVG9vbHNVcGRhdGVkKCgpID0+IHtcblx0XHRcdHRoaXMuX3NsYXNoQ29tbWFuZFByb3ZpZGVyLmNsZWFyQ2FjaGUoKTtcblx0XHRcdHRoaXMuX2ZpcmVNY3BUb29sc0xpc3RDaGFuZ2VkKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25Db21tYW5kc0NoYW5nZWQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fc2xhc2hDb21tYW5kUHJvdmlkZXIuY2xlYXJDYWNoZSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFNlZWQgdGhlIGludmVudG9yeSB3aXRoIGFueSBzZXJ2ZXJzIHRoZSBTREsgaGFzIGFscmVhZHkgbG9hZGVkIGJ5XG5cdFx0Ly8gdGhlIHRpbWUgd2UgYXR0YWNoLiBUaGUgYHNlc3Npb24ubWNwX3NlcnZlcnNfbG9hZGVkYCBldmVudCBtYXlcblx0XHQvLyBoYXZlIGZpcmVkIGJlZm9yZSBvdXIgc3Vic2NyaXB0aW9uIChlLmcuIGZvciByZXN0b3JlZCBzZXNzaW9ucyBvclxuXHRcdC8vIHdoZW4gc2VydmVycyBhcmUgY29uZmlndXJlZCBhdCBzZXNzaW9uLWNyZWF0aW9uIHRpbWUpLCBhbmQgdGhlcmVcblx0XHQvLyBpcyBubyByZXBsYXkuIFN1YnNlcXVlbnQgYGFwcGx5QWxsYCBjYWxscyBmcm9tIHRoZSBldmVudCBhcmVcblx0XHQvLyBpZGVtcG90ZW50LCBzbyB0aGlzIHNhZmVseSBjb252ZXJnZXMgZWl0aGVyIHdheS5cblx0XHR0aGlzLl9zZWVkTWNwU2VydmVyc0Zyb21ScGMoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBPbmUtc2hvdCBmZXRjaCBvZiBgcnBjLm1jcC5saXN0YCBhdCBzdWJzY3JpcHRpb24gdGltZS4gQmVzdC1lZmZvcnQ6XG5cdCAqIGFueSBmYWlsdXJlIGlzIGxvZ2dlZCBhbmQgdGhlIGludmVudG9yeSBzaW1wbHkgc3RheXMgZW1wdHkgdW50aWwgdGhlXG5cdCAqIG5leHQgbGl2ZSBldmVudCBhcnJpdmVzLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2VlZE1jcFNlcnZlcnNGcm9tUnBjKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZnJlc2hNY3BTZXJ2ZXJzRnJvbVJwYygpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBGYWlsZWQgdG8gc2VlZCBNQ1Agc2VydmVyIGludmVudG9yeWAsIGVycik7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWZyZXNoTWNwU2VydmVyc0Zyb21ScGMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbWNwUnBjID0gdGhpcy5fd3JhcHBlci5zZXNzaW9uLnJwYz8ubWNwO1xuXHRcdGlmICghbWNwUnBjKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1jcFJwYy5saXN0KCk7XG5cdFx0aWYgKCF0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHR0aGlzLl9sb2dNY3BTZXJ2ZXJzU25hcHNob3QocmVzdWx0LnNlcnZlcnMubWFwKHMgPT4gKHtcblx0XHRcdFx0bmFtZTogcy5uYW1lLFxuXHRcdFx0XHRzdGF0dXM6IHMuc3RhdHVzLFxuXHRcdFx0XHRlcnJvcjogcy5lcnJvcixcblx0XHRcdFx0c291cmNlOiBzLnNvdXJjZSxcblx0XHRcdFx0cGx1Z2luTmFtZTogcy5zb3VyY2VQbHVnaW4sXG5cdFx0XHRcdHBsdWdpblZlcnNpb246IHMuc291cmNlUGx1Z2luVmVyc2lvbixcblx0XHRcdH0pKSwgJ2ludmVudG9yeScpO1xuXHRcdFx0dGhpcy5fYXBwbHlNY3BTZXJ2ZXJMaXN0KHJlc3VsdC5zZXJ2ZXJzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hcHBseU1jcFNlcnZlckxpc3Qoc2VydmVyczogcmVhZG9ubHkgeyByZWFkb25seSBuYW1lOiBzdHJpbmc7IHJlYWRvbmx5IHN0YXR1czogU2RrTWNwU2VydmVyU3RhdHVzOyByZWFkb25seSBlcnJvcj86IHN0cmluZyB9W10pOiB2b2lkIHtcblx0XHRjb25zdCBzZGtTZXJ2ZXJzID0gc2VydmVyc1xuXHRcdFx0Lm1hcChzID0+IHRoaXMuX3RvU2RrTWNwU2VydmVyKHMubmFtZSwgcy5zdGF0dXMsIHMuZXJyb3IpKTtcblx0XHR0aGlzLl9tY3BDdXN0b21pemF0aW9ucy5hcHBseUFsbChzZGtTZXJ2ZXJzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMb2dzIGEgZnVsbCBNQ1AgaW52ZW50b3J5IHNuYXBzaG90ICh7QGxpbmsgX2xvZ01jcFNlcnZlckxpZmVjeWNsZX0gcGVyXG5cdCAqIHNlcnZlciksIHRoZW4gZm9yZ2V0cyB0aGUgZGVkdXAgZW50cnkgZm9yIGFueSBzZXJ2ZXIgdGhhdCBkcm9wcGVkIG91dCBvZlxuXHQgKiB0aGUgc25hcHNob3Qgc28gYSBsYXRlciByZS1hZGQgcmUtbG9ncyBpdHMgYXJyaXZhbC5cblx0ICovXG5cdHByaXZhdGUgX2xvZ01jcFNlcnZlcnNTbmFwc2hvdChzZXJ2ZXJzOiByZWFkb25seSBJTWNwTGlmZWN5Y2xlTG9nSW5mb1tdLCBvcmlnaW46IE1jcExpZmVjeWNsZU9yaWdpbik6IHZvaWQge1xuXHRcdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IHNlcnZlciBvZiBzZXJ2ZXJzKSB7XG5cdFx0XHRzZWVuLmFkZChzZXJ2ZXIubmFtZSk7XG5cdFx0XHR0aGlzLl9sb2dNY3BTZXJ2ZXJMaWZlY3ljbGUoeyAuLi5zZXJ2ZXIsIG9yaWdpbiB9KTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBuYW1lIG9mIFsuLi50aGlzLl9sYXN0TG9nZ2VkTWNwU3RhdHVzLmtleXMoKV0pIHtcblx0XHRcdGlmICghc2Vlbi5oYXMobmFtZSkpIHtcblx0XHRcdFx0dGhpcy5fbGFzdExvZ2dlZE1jcFN0YXR1cy5kZWxldGUobmFtZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEVtaXRzIGEgc2luZ2xlIHN0cnVjdHVyZWQgTUNQIGxpZmVjeWNsZSBsb2cgcmVjb3JkIGZvciBgc2VydmVyYCxcblx0ICogZGVkdXBsaWNhdGVkIGJ5IFNESyBzdGF0dXMgc28gYW4gdW5jaGFuZ2VkIHJlLXJlcG9ydCBzdGF5cyBxdWlldC4gRmFpbGVkXG5cdCAqIHNlcnZlcnMgbG9nIGF0IGBlcnJvcmAgKGNhcnJ5aW5nIHRoZSBmYWlsdXJlIHRleHQgaW4gdGhlIGJvZHkgYW5kIGFuXG5cdCAqIGBlcnJvclR5cGVgIGF0dHJpYnV0ZSk7IGV2ZXJ5IG90aGVyIHRyYW5zaXRpb24gbG9ncyBhdCBgaW5mb2AuIFJlY29yZHNcblx0ICogZmxvdyB0aHJvdWdoIHtAbGluayBJTG9nU2VydmljZX0gdG8gdGhlIGFnZW50IGhvc3QncyBPVExQIGxvZyBzdHJlYW0uXG5cdCAqL1xuXHRwcml2YXRlIF9sb2dNY3BTZXJ2ZXJMaWZlY3ljbGUoc2VydmVyOiBJTWNwTGlmZWN5Y2xlTG9nSW5mbyAmIHsgcmVhZG9ubHkgb3JpZ2luOiBNY3BMaWZlY3ljbGVPcmlnaW4gfSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9sYXN0TG9nZ2VkTWNwU3RhdHVzLmdldChzZXJ2ZXIubmFtZSkgPT09IHNlcnZlci5zdGF0dXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbGFzdExvZ2dlZE1jcFN0YXR1cy5zZXQoc2VydmVyLm5hbWUsIHNlcnZlci5zdGF0dXMpO1xuXG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl90cmFuc2xhdGVTZGtNY3BTdGF0dXMoc2VydmVyLm5hbWUsIHNlcnZlci5zdGF0dXMsIHNlcnZlci5lcnJvcik7XG5cdFx0Y29uc3QgYXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgT3RlbEF0dHJpYnV0ZVZhbHVlPiA9IHtcblx0XHRcdG1jcEV2ZW50OiBzZXJ2ZXIub3JpZ2luLFxuXHRcdFx0bWNwU2VydmVyOiBzZXJ2ZXIubmFtZSxcblx0XHRcdG1jcFN0YXR1czogc2VydmVyLnN0YXR1cyxcblx0XHRcdG1jcFN0YXRlOiBzdGF0ZS5raW5kLFxuXHRcdH07XG5cdFx0aWYgKHNlcnZlci5zb3VyY2UpIHsgYXR0cmlidXRlcy5tY3BTb3VyY2UgPSBzZXJ2ZXIuc291cmNlOyB9XG5cdFx0aWYgKHNlcnZlci50cmFuc3BvcnQpIHsgYXR0cmlidXRlcy5tY3BUcmFuc3BvcnQgPSBzZXJ2ZXIudHJhbnNwb3J0OyB9XG5cdFx0aWYgKHNlcnZlci5wbHVnaW5OYW1lKSB7IGF0dHJpYnV0ZXMubWNwUGx1Z2luID0gc2VydmVyLnBsdWdpbk5hbWU7IH1cblx0XHRpZiAoc2VydmVyLnBsdWdpblZlcnNpb24pIHsgYXR0cmlidXRlcy5tY3BQbHVnaW5WZXJzaW9uID0gc2VydmVyLnBsdWdpblZlcnNpb247IH1cblx0XHRpZiAoc3RhdGUua2luZCA9PT0gTWNwU2VydmVyU3RhdHVzLkVycm9yKSB7IGF0dHJpYnV0ZXMuZXJyb3JUeXBlID0gc3RhdGUuZXJyb3IuZXJyb3JUeXBlOyB9XG5cblx0XHRjb25zdCBkZXRhaWwgPSBzZXJ2ZXIuZXJyb3IgPyBgOiAke3NlcnZlci5lcnJvcn1gIDogJyc7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gTUNQIHNlcnZlciAnJHtzZXJ2ZXIubmFtZX0nICR7c2VydmVyLnN0YXR1c30gKCR7c3RhdGUua2luZH0pJHtkZXRhaWx9YDtcblx0XHRpZiAoc2VydmVyLnN0YXR1cyA9PT0gJ2ZhaWxlZCcpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IobWVzc2FnZSwgbmV3IE90ZWxEYXRhKGF0dHJpYnV0ZXMpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKG1lc3NhZ2UsIG5ldyBPdGVsRGF0YShhdHRyaWJ1dGVzKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0VG9vbENhbGxVaU1ldGEobWV0YTogTXV0YWJsZTxJVG9vbENhbGxNZXRhPiwgcmVzb3VyY2VVcmk6IHN0cmluZyB8IHVuZGVmaW5lZCwgbWNwU2VydmVyTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCFyZXNvdXJjZVVyaSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB1aTogTXV0YWJsZTxJVG9vbENhbGxVaU1ldGE+ID0geyByZXNvdXJjZVVyaSB9O1xuXHRcdGlmIChtY3BTZXJ2ZXJOYW1lKSB7XG5cdFx0XHRjb25zdCBjaGFubmVsID0gdGhpcy5fbWNwQ3VzdG9taXphdGlvbnMuY2hhbm5lbEZvclNlcnZlcihtY3BTZXJ2ZXJOYW1lKTtcblx0XHRcdGlmIChjaGFubmVsICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dWkuY2hhbm5lbCA9IGNoYW5uZWw7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdG1ldGEudWkgPSB1aTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCcm9hZGNhc3RzIGBub3RpZmljYXRpb25zL3Rvb2xzL2xpc3RfY2hhbmdlZGAgZm9yIGV2ZXJ5IE1DUCBzZXJ2ZXJcblx0ICogY3VycmVudGx5IGluIHRoZSBgUmVhZHlgIHN0YXRlLiBUaGUgU0RLJ3MgYHNlc3Npb24udG9vbHNfdXBkYXRlZGBcblx0ICogZXZlbnQgaXMgYSBjb2Fyc2UgXCJ0b29scyByZWZyZXNoZWRcIiBoaW50IHRoYXQgZG9lc24ndCBpZGVudGlmeVxuXHQgKiB3aGljaCBzZXJ2ZXIgY2hhbmdlZCwgc28gd2UgZmFuIG91dCB0byBhbGwgcmVhZHkgY2hhbm5lbHMuIENsaWVudHNcblx0ICogYXJlIGV4cGVjdGVkIHRvIHJlZmV0Y2ggYHRvb2xzL2xpc3RgIG9uIGVhY2ggbm90aWZpY2F0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfZmlyZU1jcFRvb2xzTGlzdENoYW5nZWQoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB7IGNoYW5uZWwgfSBvZiB0aGlzLl9tY3BDdXN0b21pemF0aW9ucy5yZWFkeUNoYW5uZWxzKCkpIHtcblx0XHRcdHRoaXMuX29uTWNwTm90aWZpY2F0aW9uLmZpcmUoe1xuXHRcdFx0XHRjaGFubmVsLFxuXHRcdFx0XHRtZXRob2Q6ICdub3RpZmljYXRpb25zL3Rvb2xzL2xpc3RfY2hhbmdlZCcsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHQvKiogU25hcHNob3Qgb2YgTUNQIHNlcnZlcnMgdGhhdCBoYXZlIG5vIHBsdWdpbi1kZXJpdmVkIGNoaWxkIGVudHJ5LiAqL1xuXHR0b3BMZXZlbE1jcEN1c3RvbWl6YXRpb25zKCkge1xuXHRcdHJldHVybiB0aGlzLl9tY3BDdXN0b21pemF0aW9ucy50b3BMZXZlbEN1c3RvbWl6YXRpb25zKCk7XG5cdH1cblxuXHRtY3BTZXJ2ZXJPd25lcnMoKTogUmVhZG9ubHlNYXA8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fbWNwQ3VzdG9taXphdGlvbnMucGx1Z2luTWNwU2VydmVyU291cmNlcztcblx0fVxuXG5cdC8qKlxuXHQgKiBUcmFuc2xhdGVzIHRoZSBTREsncyBmbGF0IE1DUCBzdGF0dXMgc3RyaW5nIGludG8gQUhQJ3MgZGlzY3JpbWluYXRlZFxuXHQgKiB7QGxpbmsgTWNwU2VydmVyU3RhdGV9IHVuaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfdG9TZGtNY3BTZXJ2ZXIobmFtZTogc3RyaW5nLCBzdGF0dXM6IFNka01jcFNlcnZlclN0YXR1cywgZXJyb3I/OiBzdHJpbmcpOiBJU2RrTWNwU2VydmVyIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bmFtZSxcblx0XHRcdHN0YXRlOiB0aGlzLl90cmFuc2xhdGVTZGtNY3BTdGF0dXMobmFtZSwgc3RhdHVzLCBlcnJvciksXG5cdFx0XHRlbmFibGVkOiBzdGF0dXMgIT09ICdkaXNhYmxlZCcsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX3RyYW5zbGF0ZVNka01jcFN0YXR1cyhuYW1lOiBzdHJpbmcsIHN0YXR1czogU2RrTWNwU2VydmVyU3RhdHVzLCBlcnJvcj86IHN0cmluZyk6IE1jcFNlcnZlclN0YXRlIHtcblx0XHRzd2l0Y2ggKHN0YXR1cykge1xuXHRcdFx0Y2FzZSAnY29ubmVjdGVkJzpcblx0XHRcdFx0cmV0dXJuIHsga2luZDogTWNwU2VydmVyU3RhdHVzLlJlYWR5IH07XG5cdFx0XHRjYXNlICdmYWlsZWQnOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5FcnJvcixcblx0XHRcdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRcdFx0ZXJyb3JUeXBlOiAnbWNwLXNlcnZlci1mYWlsZWQnLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogZXJyb3IgPz8gJ01DUCBzZXJ2ZXIgZmFpbGVkIHRvIHN0YXJ0Jyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9O1xuXHRcdFx0Y2FzZSAncGVuZGluZyc6XG5cdFx0XHRjYXNlICduZWVkcy1hdXRoJzoge1xuXHRcdFx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX21jcEN1c3RvbWl6YXRpb25zLnN0YXRlRm9yU2VydmVyKG5hbWUpO1xuXHRcdFx0XHRpZiAocHJldmlvdXM/LmtpbmQgPT09IE1jcFNlcnZlclN0YXR1cy5BdXRoUmVxdWlyZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gcHJldmlvdXM7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHsga2luZDogTWNwU2VydmVyU3RhdHVzLlN0YXJ0aW5nIH07XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdkaXNhYmxlZCc6XG5cdFx0XHRjYXNlICdub3RfY29uZmlndXJlZCc6XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5TdG9wcGVkIH07XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4geyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuU3RvcHBlZCB9O1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBUcmFuc2xhdGVzIHRoZSBTREsncyB0aHJlZS1tb2RlIHNwYWNlIChgaW50ZXJhY3RpdmVgIC8gYHBsYW5gIC9cblx0ICogYGF1dG9waWxvdGApIHRvIEFIUCdzIGBtb2RlYCBheGlzIGRpcmVjdGx5OlxuXHQgKlxuXHQgKiAgLSBTREsgYHBsYW5gIFx1MjE5MiBBSFAgYG1vZGU9J3BsYW4nYC5cblx0ICogIC0gU0RLIGBpbnRlcmFjdGl2ZWAgXHUyMTkyIEFIUCBgbW9kZT0naW50ZXJhY3RpdmUnYC5cblx0ICogIC0gU0RLIGBhdXRvcGlsb3RgIFx1MjE5MiBBSFAgYG1vZGU9J2F1dG9waWxvdCdgLlxuXHQgKlxuXHQgKiBBdXRvcGlsb3QgbGl2ZXMgb24gdGhlIGBtb2RlYCBheGlzOyB0aGUgb3J0aG9nb25hbCBgYXV0b0FwcHJvdmVgIGF4aXNcblx0ICogKERlZmF1bHQgLyBCeXBhc3MpIGlzIGxlZnQgdW50b3VjaGVkIHNvIHRoZSB1c2VyJ3MgY2hvc2VuXG5cdCAqIGFwcHJvdmFsIGxldmVsIGlzIHByZXNlcnZlZCBhY3Jvc3MgU0RLIG1vZGUgdHJhbnNpdGlvbnMuXG5cdCAqXG5cdCAqIFBhdGNoZXMgdGhhdCBhbHJlYWR5IG1hdGNoIHRoZSBjdXJyZW50IEFIUCB2YWx1ZXMgYXJlIHN0aWxsXG5cdCAqIGRpc3BhdGNoZWQgKHRoZSByZWR1Y2VyIGlzIGEgbm8tb3AgaW4gdGhhdCBjYXNlKSBidXQgd3JpdHRlbiB2YWx1ZXNcblx0ICogcHJvcGFnYXRlIHRvIGFsbCBzdWJzY3JpYmVkIGNsaWVudHMgdmlhIGBzZXNzaW9uL2NvbmZpZ0NoYW5nZWRgLlxuXHQgKi9cblx0cHJpdmF0ZSBfc3luY0FocENvbmZpZ0Zyb21TZGtNb2RlKHNka01vZGU6IENvcGlsb3RTZGtNb2RlKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IHRoaXMuX293bmVyU2Vzc2lvblVyaS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHBhdGNoOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuXHRcdHN3aXRjaCAoc2RrTW9kZSkge1xuXHRcdFx0Y2FzZSAncGxhbic6XG5cdFx0XHRcdHBhdGNoW1Nlc3Npb25Db25maWdLZXkuTW9kZV0gPSAncGxhbic7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSAnYXV0b3BpbG90Jzpcblx0XHRcdFx0cGF0Y2hbU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlXSA9ICdhdXRvcGlsb3QnO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2ludGVyYWN0aXZlJzpcblx0XHRcdFx0cGF0Y2hbU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlXSA9ICdpbnRlcmFjdGl2ZSc7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVTZXNzaW9uQ29uZmlnKHNlc3Npb25VcmksIHBhdGNoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBIYW5kbGVzIHRoZSBDTEkncyBgZXhpdFBsYW5Nb2RlLnJlcXVlc3RgIFJQQyBieSBzdXJmYWNpbmcgaXQgYXMgYVxuXHQgKiB7QGxpbmsgQ2hhdElucHV0UmVxdWVzdH0gYW5kIGF3YWl0aW5nIHRoZSBjbGllbnQncyByZXNwb25zZS4gVGhlXG5cdCAqIHJlc29sdmVkIHtAbGluayBDb3BpbG90RXhpdFBsYW5Nb2RlUmVzcG9uc2V9IGZsb3dzIGJhY2sgdG8gdGhlIENMSSwgd2hpY2hcblx0ICogY2FsbHMgYHNlc3Npb24ucmVzcG9uZFRvRXhpdFBsYW5Nb2RlYCBpbnRlcm5hbGx5IFx1MjAxNCB0aGF0IHJlc3VtZXMgdGhlXG5cdCAqIHBhdXNlZCBgZXhpdF9wbGFuX21vZGVgIHRvb2wgY2FsbCBhbmQgKG9uIGFjY2VwdCkgdXBkYXRlcyB0aGUgU0RLJ3Ncblx0ICogYGN1cnJlbnRNb2RlYCBzbyB0aGUgbW9kZWwgY2FuIGNvbnRpbnVlIHdpdGggaW1wbGVtZW50YXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVFeGl0UGxhbk1vZGVSZXF1ZXN0KGRhdGE6IEV4aXRQbGFuTW9kZVJlcXVlc3QsIF9pbnZvY2F0aW9uOiB7IHNlc3Npb25JZDogc3RyaW5nIH0pOiBQcm9taXNlPENvcGlsb3RFeGl0UGxhbk1vZGVSZXNwb25zZT4ge1xuXHRcdGNvbnN0IHR1cm5JZCA9IHRoaXMuX2N1cnJlbnRUdXJuPy5pZDtcblx0XHRpZiAoIXR1cm5JZCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3RoaXMuc2Vzc2lvbklkfV0gUmVqZWN0aW5nIHBsYW4gcmV2aWV3IHJlcXVlc3Qgd2l0aG91dCBhbiBhY3RpdmUgdHVybmApO1xuXHRcdFx0cmV0dXJuIHsgYXBwcm92ZWQ6IGZhbHNlIH07XG5cdFx0fVxuXHRcdGNvbnN0IHJlcXVlc3RJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHF1ZXN0aW9uSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBleGl0UGxhbk1vZGUucmVxdWVzdDogcnBjSWQ9JHtyZXF1ZXN0SWR9LCBhY3Rpb25zPVske2RhdGEuYWN0aW9ucy5qb2luKCcsJyl9XSwgcmVjb21tZW5kZWQ9JHtkYXRhLnJlY29tbWVuZGVkQWN0aW9ufWApO1xuXG5cdFx0bGV0IHBsYW5QYXRoOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGxhblJlYWQgPSBhd2FpdCB0aGlzLl93cmFwcGVyLnNlc3Npb24ucnBjLnBsYW4ucmVhZCgpO1xuXHRcdFx0cGxhblBhdGggPSBwbGFuUmVhZC5wYXRoID8/IG51bGw7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBycGMucGxhbi5yZWFkIGZhaWxlZCBmb3IgZXhpdF9wbGFuX21vZGU6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fY3VycmVudFR1cm4/LmlkICE9PSB0dXJuSWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIFJlamVjdGluZyBwbGFuIHJldmlldyByZXF1ZXN0IGFmdGVyIGl0cyB0dXJuIGVuZGVkYCk7XG5cdFx0XHRyZXR1cm4geyBhcHByb3ZlZDogZmFsc2UgfTtcblx0XHR9XG5cblx0XHRjb25zdCBvcHRpb25zID0gZGF0YS5hY3Rpb25zLm1hcChhY3Rpb25JZCA9PiB7XG5cdFx0XHRjb25zdCBkZXNjID0gZ2V0UGxhbkFjdGlvbkRlc2NyaXB0aW9uKGFjdGlvbklkKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiBhY3Rpb25JZCxcblx0XHRcdFx0bGFiZWw6IGRlc2M/LmxhYmVsID8/IGFjdGlvbklkLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogZGVzYz8uZGVzY3JpcHRpb24sXG5cdFx0XHRcdHJlY29tbWVuZGVkOiBhY3Rpb25JZCA9PT0gZGF0YS5yZWNvbW1lbmRlZEFjdGlvbixcblx0XHRcdH07XG5cdFx0fSk7XG5cblx0XHRjb25zdCBhY3Rpb25zOiBJQWdlbnRIb3N0UGxhblJldmlld0FjdGlvbltdID0gb3B0aW9ucy5tYXAob3B0aW9uID0+ICh7XG5cdFx0XHRpZDogb3B0aW9uLmlkLFxuXHRcdFx0bGFiZWw6IG9wdGlvbi5sYWJlbCxcblx0XHRcdC4uLihvcHRpb24uZGVzY3JpcHRpb24gPyB7IGRlc2NyaXB0aW9uOiBvcHRpb24uZGVzY3JpcHRpb24gfSA6IHt9KSxcblx0XHRcdC4uLihvcHRpb24ucmVjb21tZW5kZWQgPyB7IGRlZmF1bHQ6IHRydWUgfSA6IHt9KSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbnB1dFJlcXVlc3Q6IENoYXRJbnB1dFJlcXVlc3RXaXRoUGxhblJldmlldyA9IHtcblx0XHRcdGlkOiByZXF1ZXN0SWQsXG5cdFx0XHRwdXJwb3NlOiBDaGF0SW5wdXRSZXF1ZXN0UHVycG9zZS5QbGFuUmV2aWV3LFxuXHRcdFx0cGxhblJldmlldzoge1xuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2FnZW50SG9zdC5wbGFuUmV2aWV3LnRpdGxlJywgXCJSZXZpZXcgUGxhblwiKSxcblx0XHRcdFx0Y29udGVudDogZGF0YS5zdW1tYXJ5IHx8IGxvY2FsaXplKCdhZ2VudEhvc3QucGxhblJldmlldy5mYWxsYmFja1N1bW1hcnknLCBcIkEgcGxhbiBpcyByZWFkeSBmb3IgcmV2aWV3LlwiKSxcblx0XHRcdFx0YWN0aW9ucyxcblx0XHRcdFx0Y2FuUHJvdmlkZUZlZWRiYWNrOiB0cnVlLFxuXHRcdFx0XHRhbnN3ZXJRdWVzdGlvbklkOiBxdWVzdGlvbklkLFxuXHRcdFx0XHQuLi4ocGxhblBhdGggPyB7IHBsYW5Vcmk6IFVSSS5maWxlKHBsYW5QYXRoKS50b1N0cmluZygpIH0gOiB7fSksXG5cdFx0XHR9LFxuXHRcdFx0cXVlc3Rpb25zOiBbe1xuXHRcdFx0XHRraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuU2luZ2xlU2VsZWN0LFxuXHRcdFx0XHRpZDogcXVlc3Rpb25JZCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3QucGxhblJldmlldy50aXRsZScsIFwiUmV2aWV3IFBsYW5cIiksXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdhZ2VudEhvc3QucGxhblJldmlldy5xdWVzdGlvbk1lc3NhZ2UnLCBcIkhvdyB3b3VsZCB5b3UgbGlrZSB0byBwcm9jZWVkP1wiKSxcblx0XHRcdFx0cmVxdWlyZWQ6IHRydWUsXG5cdFx0XHRcdG9wdGlvbnMsXG5cdFx0XHRcdGFsbG93RnJlZWZvcm1JbnB1dDogdHJ1ZSxcblx0XHRcdH1dLFxuXHRcdH07XG5cblx0XHRjb25zdCBwZW5kaW5nUGxhblJldmlldyA9IHRoaXMuX3BlbmRpbmdQbGFuUmV2aWV3cy5yZWdpc3RlcihyZXF1ZXN0SWQsIHtcblx0XHRcdGFjdGlvbnM6IGRhdGEuYWN0aW9ucyxcblx0XHRcdHJlY29tbWVuZGVkQWN0aW9uOiBkYXRhLnJlY29tbWVuZGVkQWN0aW9uLFxuXHRcdFx0cXVlc3Rpb25JZCxcblx0XHR9KTtcblxuXHRcdHRoaXMuX29uRGlkU2Vzc2lvblByb2dyZXNzLmZpcmUoe1xuXHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRyZXNvdXJjZTogdGhpcy5fY2hhdENoYW5uZWxVcmksXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0SW5wdXRSZXF1ZXN0ZWQsXG5cdFx0XHRcdHJlcXVlc3Q6IGlucHV0UmVxdWVzdCxcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgcGVuZGluZ1BsYW5SZXZpZXc7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVyciwgYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBleGl0UGxhbk1vZGUucmVxdWVzdCBoYW5kbGVyIGZhaWxlZDogcnBjSWQ9JHtyZXF1ZXN0SWR9YCk7XG5cdFx0XHRyZXR1cm4geyBhcHByb3ZlZDogZmFsc2UgfTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRHJvcCB0aGUgbWVtb2l6ZWQgZXZlbnQgcmVjb25zdHJ1Y3Rpb24gd2hlbmV2ZXIgdGhlIHBlcnNpc3RlZCBldmVudCBsb2dcblx0ICogY291bGQgaGF2ZSBjaGFuZ2VkLCBzbyB7QGxpbmsgX2dldE1hcHBlZEV2ZW50c30gbmV2ZXIgc2VydmVzIHN0YWxlIHR1cm5zXG5cdCAqIG9uY2UgdGhlIHNlc3Npb24gcmVzdW1lcyBhY3Rpdml0eS4gV2hpbGUgdGhlIHNlc3Npb24gaXMgaWRsZSAoZS5nLiBkdXJpbmdcblx0ICogYSBoaXN0b3JpY2FsIHNlc3Npb24gb3Blbikgbm9uZSBvZiB0aGVzZSBmaXJlLCBzbyB0aGUgd2hvbGUgcmVzdG9yZSB3YXZlXG5cdCAqIGNvYWxlc2NlcyB0byBhIHNpbmdsZSByZWNvbnN0cnVjdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX3N1YnNjcmliZUZvck1lbW9JbnZhbGlkYXRpb24oKTogdm9pZCB7XG5cdFx0Y29uc3Qgd3JhcHBlciA9IHRoaXMuX3dyYXBwZXI7XG5cdFx0Y29uc3QgaW52YWxpZGF0ZSA9ICgpID0+IHRoaXMuX2ludmFsaWRhdGVNYXBwZWRFdmVudHMoKTtcblx0XHQvLyBOZXcgY29udGVudCBhcHBlbmRlZCB0byB0aGUgbG9nLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25Vc2VyTWVzc2FnZShpbnZhbGlkYXRlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblR1cm5TdGFydChpbnZhbGlkYXRlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vbk1lc3NhZ2UoaW52YWxpZGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25Ub29sU3RhcnQoaW52YWxpZGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25Ub29sQ29tcGxldGUoaW52YWxpZGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25TdWJhZ2VudFN0YXJ0ZWQoaW52YWxpZGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25TdWJhZ2VudENvbXBsZXRlZChpbnZhbGlkYXRlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblN1YmFnZW50RmFpbGVkKGludmFsaWRhdGUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uVHVybkVuZChpbnZhbGlkYXRlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblNlc3Npb25FcnJvcihpbnZhbGlkYXRlKSk7XG5cdFx0Ly8gSW4tcGxhY2UgcmV3cml0ZXMgb2YgdGhlIHBlcnNpc3RlZCBsb2cuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblNlc3Npb25Db21wYWN0aW9uQ29tcGxldGUoaW52YWxpZGF0ZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25TZXNzaW9uVHJ1bmNhdGlvbihpbnZhbGlkYXRlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblNlc3Npb25TbmFwc2hvdFJld2luZChpbnZhbGlkYXRlKSk7XG5cdH1cblxuXHQvKipcblx0ICogRW1pdHMgYGluc3RydWN0aW9uc0NvbGxlY3RlZGAgcGVyIHVzZXIgbWVzc2FnZS5cblx0ICogQXR0ZW1wdHMgdG8gbWF0Y2ggbG9jYWwgY2hhdCdzIGBDb21wdXRlQXV0b21hdGljSW5zdHJ1Y3Rpb25zYFxuXHQgKiBlbWl0dGVyIChgc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9jb21wdXRlQXV0b21hdGljSW5zdHJ1Y3Rpb25zLnRzYClcblx0ICovXG5cdHByaXZhdGUgX3N1YnNjcmliZUZvckluc3RydWN0aW9uc0NvbGxlY3RlZFRlbGVtZXRyeSgpOiB2b2lkIHtcblx0XHRjb25zdCB3cmFwcGVyID0gdGhpcy5fd3JhcHBlcjtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSB0aGlzLnNlc3Npb25JZDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25Vc2VyTWVzc2FnZShlID0+IHtcblx0XHRcdC8vIFNraXAgc3ViYWdlbnQgYW5kIFNESy1pbmplY3RlZCBtZXNzYWdlcyAobWF0Y2hlcyBndWFyZCBvbiB0aGlzIGV2ZW50IGFib3ZlKS5cblx0XHRcdGlmIChlLmFnZW50SWQgfHwgKGUuZGF0YS5zb3VyY2UgJiYgZS5kYXRhLnNvdXJjZS50b0xvd2VyQ2FzZSgpICE9PSAndXNlcicpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNsaWVudENvbnRleHQgPSB0aGlzLl9jdXJyZW50VHVybj8uY2xpZW50Q29udGV4dDtcblx0XHRcdHZvaWQgKGFzeW5jICgpID0+IHtcblx0XHRcdFx0bGV0IHNvdXJjZXM7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0c291cmNlcyA9IChhd2FpdCB3cmFwcGVyLnNlc3Npb24ucnBjLmluc3RydWN0aW9ucy5nZXRTb3VyY2VzKCkpLnNvdXJjZXM7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gRmFpbGVkIHRvIGZldGNoIGluc3RydWN0aW9uIHNvdXJjZXMgZm9yIHRlbGVtZXRyeTogJHtnZXRFcnJvck1lc3NhZ2UoZXJyKX1gKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgYWdlbnRJbnN0cnVjdGlvbnNDb3VudCA9IDA7XG5cdFx0XHRcdGxldCBhcHBseWluZ0luc3RydWN0aW9uc0NvdW50ID0gMDtcblx0XHRcdFx0bGV0IHJlZmVyZW5jZWRJbnN0cnVjdGlvbnNDb3VudCA9IDA7XG5cdFx0XHRcdGxldCBjbGF1ZGVNZENvdW50ID0gMDtcblx0XHRcdFx0Zm9yIChjb25zdCBzIG9mIHNvdXJjZXMpIHtcblx0XHRcdFx0XHQvLyBUaGUgU0RLIG1hcmtzIGNvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kIChob21lL3JlcG8pIGFuZCByb290LWxldmVsXG5cdFx0XHRcdFx0Ly8gQUdFTlRTLm1kIC8gQ0xBVURFLm1kIC8gR0VNSU5JLm1kIGFzIGBob21lYC9gcmVwb2AvYG1vZGVsYFxuXHRcdFx0XHRcdGlmIChzLnR5cGUgPT09ICdob21lJyB8fCBzLnR5cGUgPT09ICdyZXBvJyB8fCBzLnR5cGUgPT09ICdtb2RlbCcpIHtcblx0XHRcdFx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zQ291bnQrKztcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAocy5hcHBseVRvICYmIHMuYXBwbHlUby5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRhcHBseWluZ0luc3RydWN0aW9uc0NvdW50Kys7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHMudHlwZSA9PT0gJ2NoaWxkLWluc3RydWN0aW9ucycgfHwgcy50eXBlID09PSAnbmVzdGVkLWFnZW50cycpIHtcblx0XHRcdFx0XHRcdHJlZmVyZW5jZWRJbnN0cnVjdGlvbnNDb3VudCsrO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGxhc3RTZXAgPSBNYXRoLm1heChzLnNvdXJjZVBhdGgubGFzdEluZGV4T2YoJy8nKSwgcy5zb3VyY2VQYXRoLmxhc3RJbmRleE9mKCdcXFxcJykpO1xuXHRcdFx0XHRcdGNvbnN0IGZpbGVuYW1lID0gbGFzdFNlcCA+PSAwID8gcy5zb3VyY2VQYXRoLnNsaWNlKGxhc3RTZXAgKyAxKSA6IHMuc291cmNlUGF0aDtcblx0XHRcdFx0XHRpZiAoZmlsZW5hbWUgPT09ICdDTEFVREUubWQnKSB7XG5cdFx0XHRcdFx0XHRjbGF1ZGVNZENvdW50Kys7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dHlwZSBBZ2VudEhvc3RJbnN0cnVjdGlvbnNDb2xsZWN0ZWRFdmVudCA9IElBZ2VudEhvc3RJbml0aWF0b3JUZWxlbWV0cnkgJiB7XG5cdFx0XHRcdFx0cHJvdmlkZXI6IHN0cmluZztcblx0XHRcdFx0XHRhZ2VudFNlc3Npb25JZDogc3RyaW5nO1xuXHRcdFx0XHRcdGlzU3ViYWdlbnRTZXNzaW9uOiBib29sZWFuO1xuXHRcdFx0XHRcdHRvdGFsSW5zdHJ1Y3Rpb25zQ291bnQ6IG51bWJlcjtcblx0XHRcdFx0XHRhZ2VudEluc3RydWN0aW9uc0NvdW50OiBudW1iZXI7XG5cdFx0XHRcdFx0YXBwbHlpbmdJbnN0cnVjdGlvbnNDb3VudDogbnVtYmVyO1xuXHRcdFx0XHRcdHJlZmVyZW5jZWRJbnN0cnVjdGlvbnNDb3VudDogbnVtYmVyO1xuXHRcdFx0XHRcdGNsYXVkZU1kQ291bnQ6IG51bWJlcjtcblx0XHRcdFx0fTtcblx0XHRcdFx0dHlwZSBBZ2VudEhvc3RJbnN0cnVjdGlvbnNDb2xsZWN0ZWRDbGFzc2lmaWNhdGlvbiA9IElBZ2VudEhvc3RJbml0aWF0b3JDbGFzc2lmaWNhdGlvbiAmIHtcblx0XHRcdFx0XHRwcm92aWRlcjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBBZ2VudCBIb3N0IHByb3ZpZGVyIHRoYXQgZW1pdHRlZCB0aGlzIGV2ZW50IChlLmcuIGNvcGlsb3RjbGkpLiBBYnNlbnQgb24gbG9jYWwgcm93czsgdXNlIHByZXNlbmNlIHRvIGRpc3Rpbmd1aXNoIEFIIGZyb20gbG9jYWwuJyB9O1xuXHRcdFx0XHRcdGFnZW50U2Vzc2lvbklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIEFnZW50IEhvc3Qgc2Vzc2lvbiBpZGVudGlmaWVyLiBBYnNlbnQgb24gbG9jYWwgcm93cy4nIH07XG5cdFx0XHRcdFx0aXNTdWJhZ2VudFNlc3Npb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBlbWlzc2lvbiB3YXMgZnJvbSBhIHN1YmFnZW50IHNlc3Npb24uJyB9O1xuXHRcdFx0XHRcdHRvdGFsSW5zdHJ1Y3Rpb25zQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUb3RhbCBudW1iZXIgb2YgaW5zdHJ1Y3Rpb24gc291cmNlcyBsb2FkZWQgYnkgdGhlIEFnZW50IEhvc3Qgc2Vzc2lvbi4nIH07XG5cdFx0XHRcdFx0YWdlbnRJbnN0cnVjdGlvbnNDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiB0b3AtbGV2ZWwgYWdlbnQgaW5zdHJ1Y3Rpb24gZmlsZXMgKGNvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kLCBBR0VOVFMubWQsIENMQVVERS5tZCwgR0VNSU5JLm1kKSBhbW9uZyB0aGUgbG9hZGVkIHNvdXJjZXMuJyB9O1xuXHRcdFx0XHRcdGFwcGx5aW5nSW5zdHJ1Y3Rpb25zQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgbG9hZGVkIGluc3RydWN0aW9uIHNvdXJjZXMgdGhhdCBjYXJyeSBhbiBhcHBseVRvIGdsb2IgcGF0dGVybi4gU2VtYW50aWMgc2hpZnQgZnJvbSB0aGUgbG9jYWwgZmllbGQsIHdoaWNoIGNvdW50cyBzb3VyY2VzIHdob3NlIGFwcGx5VG8gbWF0Y2hlZCB0aGUgY3VycmVudCByZXF1ZXN0IGNvbnRleHQuJyB9O1xuXHRcdFx0XHRcdHJlZmVyZW5jZWRJbnN0cnVjdGlvbnNDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiBsb2FkZWQgaW5zdHJ1Y3Rpb24gc291cmNlcyBkaXNjb3ZlcmVkIHRyYW5zaXRpdmVseSAoY2hpbGQtaW5zdHJ1Y3Rpb25zIHZpYSBzdWJkaXJlY3Rvcnkgd2Fsaywgb3IgbmVzdGVkIEFHRU5UUy5tZCkuIFNlbWFudGljIHNoaWZ0IGZyb20gdGhlIGxvY2FsIGZpZWxkLCB3aGljaCBjb3VudHMgc291cmNlcyBhZGRlZCB2aWEgZXhwbGljaXQgPGZpbGU+IHJlZmVyZW5jZXMgaW4gb3RoZXIgaW5zdHJ1Y3Rpb24gZmlsZXMuJyB9O1xuXHRcdFx0XHRcdGNsYXVkZU1kQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2YgQ0xBVURFLm1kIGZpbGVzIGFtb25nIHRoZSBsb2FkZWQgc291cmNlcy4nIH07XG5cdFx0XHRcdFx0b3duZXI6ICdhbXVuZ2VyJztcblx0XHRcdFx0XHRjb21tZW50OiAnQWdlbnQgSG9zdCBlbWlzc2lvbiBvZiBhZ2VudEhvc3QuaW5zdHJ1Y3Rpb25zQ29sbGVjdGVkLiBDYXJyaWVzIHRoZSBzdWJzZXQgb2YgdGhlIGxvY2FsIHNoYXBlIHRoYXQgY2FuIGJlIGhvbmVzdGx5IChvciBjbG9zZS1hbmFsb2dvdXNseSkgY29tcHV0ZWQgZnJvbSB0aGUgU0RLXFwncyBJbnN0cnVjdGlvblNvdXJjZSBsaXN0OyBvdGhlciBmaWVsZHMgYXJlIGludGVudGlvbmFsbHkgb21pdHRlZCAoc2VlIHNvdXJjZSBjb21tZW50KS4nO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8QWdlbnRIb3N0SW5zdHJ1Y3Rpb25zQ29sbGVjdGVkRXZlbnQsIEFnZW50SG9zdEluc3RydWN0aW9uc0NvbGxlY3RlZENsYXNzaWZpY2F0aW9uPignYWdlbnRIb3N0Lmluc3RydWN0aW9uc0NvbGxlY3RlZCcsIHtcblx0XHRcdFx0XHQuLi50b0luaXRpYXRvclRlbGVtZXRyeShjbGllbnRDb250ZXh0KSxcblx0XHRcdFx0XHRwcm92aWRlcjogdGhpcy5yZXNvdXJjZVVyaS5zY2hlbWUsXG5cdFx0XHRcdFx0YWdlbnRTZXNzaW9uSWQ6IEFnZW50U2Vzc2lvbi5pZCh0aGlzLnJlc291cmNlVXJpKSxcblx0XHRcdFx0XHRpc1N1YmFnZW50U2Vzc2lvbjogaXNTdWJhZ2VudFNlc3Npb24odGhpcy5yZXNvdXJjZVVyaSksXG5cdFx0XHRcdFx0dG90YWxJbnN0cnVjdGlvbnNDb3VudDogc291cmNlcy5sZW5ndGgsXG5cdFx0XHRcdFx0YWdlbnRJbnN0cnVjdGlvbnNDb3VudCxcblx0XHRcdFx0XHRhcHBseWluZ0luc3RydWN0aW9uc0NvdW50LFxuXHRcdFx0XHRcdHJlZmVyZW5jZWRJbnN0cnVjdGlvbnNDb3VudCxcblx0XHRcdFx0XHRjbGF1ZGVNZENvdW50LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pKCkuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBpbnN0cnVjdGlvbnNDb2xsZWN0ZWQgdGVsZW1ldHJ5IGZhaWxlZDogJHtnZXRFcnJvck1lc3NhZ2UoZXJyKX1gKTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3N1YnNjcmliZUZvckxvZ2dpbmcoKTogdm9pZCB7XG5cdFx0Y29uc3Qgd3JhcHBlciA9IHRoaXMuX3dyYXBwZXI7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gdGhpcy5zZXNzaW9uSWQ7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uVW5oYW5kbGVkRXZlbnQoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFVuaGFuZGxlZCBTREsgZXZlbnQ6ICR7c2FmZVN0cmluZ2lmeShlKX1gKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uU2Vzc2lvblN0YXJ0KGUgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBTZXNzaW9uIHN0YXJ0ZWQ6IG1vZGVsPSR7ZS5kYXRhLnNlbGVjdGVkTW9kZWwgPz8gJ2RlZmF1bHQnfSwgcHJvZHVjZXI9JHtlLmRhdGEucHJvZHVjZXJ9YCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblNlc3Npb25SZXN1bWUoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFNlc3Npb24gcmVzdW1lZDogZXZlbnRDb3VudD0ke2UuZGF0YS5ldmVudENvdW50fWApO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25TZXNzaW9uSW5mbyhlID0+IHtcblx0XHRcdGNvbnN0IGF0dHJpYnV0ZXM6IFJlY29yZDxzdHJpbmcsIE90ZWxBdHRyaWJ1dGVWYWx1ZT4gPSB7IGluZm9UeXBlOiBlLmRhdGEuaW5mb1R5cGUgfTtcblx0XHRcdGlmIChlLmRhdGEudGlwKSB7XG5cdFx0XHRcdGF0dHJpYnV0ZXMudGlwID0gZS5kYXRhLnRpcDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBbJHtlLmRhdGEuaW5mb1R5cGV9XTogJHtlLmRhdGEubWVzc2FnZX1gO1xuXHRcdFx0Y29uc3Qgb3RlbERhdGEgPSBuZXcgT3RlbERhdGEoYXR0cmlidXRlcyk7XG5cdFx0XHRpZiAoZS5kYXRhLmluZm9UeXBlID09PSAnbWNwJykge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8obWVzc2FnZSwgb3RlbERhdGEpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShtZXNzYWdlLCBvdGVsRGF0YSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblNlc3Npb25XYXJuaW5nKGUgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dICR7ZS5kYXRhLm1lc3NhZ2V9YCwgbmV3IE90ZWxEYXRhKHsgd2FybmluZ1R5cGU6IGUuZGF0YS53YXJuaW5nVHlwZSB9KSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblNlc3Npb25Nb2RlbENoYW5nZShlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gTW9kZWwgY2hhbmdlZDogJHtlLmRhdGEucHJldmlvdXNNb2RlbCA/PyAnKG5vbmUpJ30gLT4gJHtlLmRhdGEubmV3TW9kZWx9YCk7XG5cdFx0XHRpZiAoIWUuYWdlbnRJZCkge1xuXHRcdFx0XHR0aGlzLl9wcm9tcHRDYWNoZVJlZnJlc2hHZW5lcmF0aW9uKys7XG5cdFx0XHRcdGlmIChlLmRhdGEucHJldmlvdXNNb2RlbCAhPT0gZS5kYXRhLm5ld01vZGVsKSB7XG5cdFx0XHRcdFx0dGhpcy5fc2V0UHJvbXB0Q2FjaGVTdGF0ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHZvaWQgdGhpcy5fcmVmcmVzaFNlc3Npb25Vc2FnZU1ldHJpY3MoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uTWFuYWdlZFNldHRpbmdzUmVzb2x2ZWQoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gTWFuYWdlZCBzZXR0aW5ncyByZXNvbHZlZDogc291cmNlPSR7ZS5kYXRhLnNvdXJjZX0sIG1hbmFnZWRLZXlzPSR7ZS5kYXRhLm1hbmFnZWRLZXlzLmpvaW4oJywnKSB8fCAnKG5vbmUpJ30sIGJ5cGFzc1Blcm1pc3Npb25zRGlzYWJsZWQ9JHtlLmRhdGEuYnlwYXNzUGVybWlzc2lvbnNEaXNhYmxlZH0sIGZhaWxDbG9zZWQ9JHtlLmRhdGEuZmFpbENsb3NlZH1gKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uTWFuYWdlZFNldHRpbmdzRW5mb3JjZWQoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gTWFuYWdlZCBzZXR0aW5ncyBlbmZvcmNlZDogYWN0aW9uPSR7ZS5kYXRhLmFjdGlvbn0sIHNldHRpbmc9JHtlLmRhdGEuc2V0dGluZ30sIGVzY2FsYXRpb249JHtlLmRhdGEuZXNjYWxhdGlvbiA/PyAnKG5vbmUpJ30sIGZhaWxDbG9zZWQ9JHtlLmRhdGEuZmFpbENsb3NlZH0sIG1lc3NhZ2U9JHtlLmRhdGEubWVzc2FnZX1gKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uU2Vzc2lvbkhhbmRvZmYoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFNlc3Npb24gaGFuZG9mZjogc291cmNlVHlwZT0ke2UuZGF0YS5zb3VyY2VUeXBlfSwgcmVtb3RlU2Vzc2lvbklkPSR7ZS5kYXRhLnJlbW90ZVNlc3Npb25JZCA/PyAnKG5vbmUpJ31gKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uU2Vzc2lvblRydW5jYXRpb24oZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFNlc3Npb24gdHJ1bmNhdGlvbjogcmVtb3ZlZCAke2UuZGF0YS50b2tlbnNSZW1vdmVkRHVyaW5nVHJ1bmNhdGlvbn0gdG9rZW5zLCAke2UuZGF0YS5tZXNzYWdlc1JlbW92ZWREdXJpbmdUcnVuY2F0aW9ufSBtZXNzYWdlc2ApO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25TZXNzaW9uU25hcHNob3RSZXdpbmQoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFNuYXBzaG90IHJld2luZDogdXBUbz0ke2UuZGF0YS51cFRvRXZlbnRJZH0sIGV2ZW50c1JlbW92ZWQ9JHtlLmRhdGEuZXZlbnRzUmVtb3ZlZH1gKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uU2Vzc2lvblNodXRkb3duKGUgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBTZXNzaW9uIHNodXRkb3duOiB0eXBlPSR7ZS5kYXRhLnNodXRkb3duVHlwZX0sIGFwaUR1cmF0aW9uPSR7ZS5kYXRhLnRvdGFsQXBpRHVyYXRpb25Nc31tc2ApO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25TZXNzaW9uVXNhZ2VJbmZvKGUgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBVc2FnZSBpbmZvOiAke2UuZGF0YS5jdXJyZW50VG9rZW5zfS8ke2UuZGF0YS50b2tlbkxpbWl0fSB0b2tlbnMsICR7ZS5kYXRhLm1lc3NhZ2VzTGVuZ3RofSBtZXNzYWdlc2ApO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25TZXNzaW9uQ29tcGFjdGlvblN0YXJ0KCgpID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gQ29tcGFjdGlvbiBzdGFydGVkYCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblNlc3Npb25Db21wYWN0aW9uQ29tcGxldGUoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIENvbXBhY3Rpb24gY29tcGxldGU6IHN1Y2Nlc3M9JHtlLmRhdGEuc3VjY2Vzc30sIHRva2Vuc1JlbW92ZWQ9JHtlLmRhdGEudG9rZW5zUmVtb3ZlZCA/PyAnPyd9YCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblVzZXJNZXNzYWdlKGUgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBVc2VyIG1lc3NhZ2U6ICR7ZS5kYXRhLmNvbnRlbnQubGVuZ3RofSBjaGFycywgJHtlLmRhdGEuYXR0YWNobWVudHM/Lmxlbmd0aCA/PyAwfSBhdHRhY2htZW50c2ApO1xuXHRcdFx0Ly8gUmVzdHJpY3RlZCBgY29udmVyc2F0aW9uLm1lc3NhZ2VUZXh0YCAoc291cmNlPXVzZXIpOiB0aGUgcmF3IHVzZXIgcHJvbXB0IHRleHQuIEVtaXQgb25seVxuXHRcdFx0Ly8gZm9yIGdlbnVpbmUgaHVtYW4gcHJvbXB0cyBvbiB0aGUgbWFpbiBhZ2VudCBcdTIwMTQgc2tpcCBzdWJhZ2VudCB0dXJucyAoZHJpdmVuIGJ5IHRoZSBwYXJlbnQpXG5cdFx0XHQvLyBhbmQgU0RLLWluamVjdGVkIHN5bnRoZXRpYyBtZXNzYWdlcyAoc2tpbGwvaGFybmVzcyBpbmplY3Rpb25zIGNhcnJ5IGEgbm9uLWB1c2VyYCBzb3VyY2UsXG5cdFx0XHQvLyBtYXRjaGluZyBgaXNTeW50aGV0aWNVc2VyTWVzc2FnZWApIHNvIGluamVjdGVkIGNvbnRlbnQgaXMgbm90IHJlcG9ydGVkIGFzIHRoZSB1c2VyJ3MgcHJvbXB0LlxuXHRcdFx0aWYgKCFlLmFnZW50SWQgJiYgKCFlLmRhdGEuc291cmNlIHx8IGUuZGF0YS5zb3VyY2UudG9Mb3dlckNhc2UoKSA9PT0gJ3VzZXInKSkge1xuXHRcdFx0XHR2b2lkIHRoaXMuX3RlbGVtZXRyeVJlcG9ydGVyLnVzZXJNZXNzYWdlVGV4dCh0aGlzLnJlc291cmNlVXJpLnRvU3RyaW5nKCksIHRoaXMuX2N1cnJlbnRUdXJuPy5jbGllbnRUeXBlID8/IEFnZW50SG9zdENsaWVudFR5cGUuVW5rbm93biwgZS5kYXRhLmNvbnRlbnQsIHRoaXMuX3R1cm5PcmRpbmFsKS5jYXRjaChlcnIgPT4gdGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIFRlbGVtZXRyeSBlbWlzc2lvbiBmYWlsZWQ6ICR7Z2V0RXJyb3JNZXNzYWdlKGVycil9YCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25QZW5kaW5nTWVzc2FnZXNNb2RpZmllZCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFBlbmRpbmcgbWVzc2FnZXMgbW9kaWZpZWRgKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uVHVyblN0YXJ0KGUgPT4ge1xuXHRcdFx0dGhpcy5fY3VycmVudFR1cm4/Lm1hcmtSdW5uaW5nKCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFR1cm4gc3RhcnRlZDogJHtlLmRhdGEudHVybklkfWApO1xuXHRcdFx0aWYgKCFlLmFnZW50SWQpIHtcblx0XHRcdFx0Y29uc3QgdGVsZW1ldHJ5TWVzc2FnZUlkID0gdGhpcy5fY3VycmVudFR1cm4/LmlkID8/IGUuZGF0YS50dXJuSWQ7XG5cdFx0XHRcdGlmICh0aGlzLl9hY3RpdmVSZXBvSW5mb1R1cm4/LnRlbGVtZXRyeU1lc3NhZ2VJZCA9PT0gdGVsZW1ldHJ5TWVzc2FnZUlkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2NhbmNlbEFjdGl2ZVJlcG9JbmZvVGVsZW1ldHJ5KCk7XG5cdFx0XHRcdGNvbnN0IHR1cm46IE5vbk51bGxhYmxlPENvcGlsb3RBZ2VudFNlc3Npb25bJ19hY3RpdmVSZXBvSW5mb1R1cm4nXT4gPSB7XG5cdFx0XHRcdFx0dGVsZW1ldHJ5TWVzc2FnZUlkLFxuXHRcdFx0XHRcdGNhbmNlbGxlZDogZmFsc2UsXG5cdFx0XHRcdFx0YmVnaW46IFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjb25zdCBpc0N1cnJlbnQgPSAoKSA9PiAhdHVybi5jYW5jZWxsZWQgJiYgdGhpcy5faXNMYXVuY2hUb2tlbkN1cnJlbnQoKTtcblx0XHRcdFx0dHVybi5iZWdpbiA9IHRoaXMuX2JlZ2luUmVwb0luZm9UZWxlbWV0cnkodGVsZW1ldHJ5TWVzc2FnZUlkLCB0aGlzLl9jdXJyZW50VHVybj8uY2xpZW50VHlwZSA/PyBBZ2VudEhvc3RDbGllbnRUeXBlLlVua25vd24sIGlzQ3VycmVudCk7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZVJlcG9JbmZvVHVybiA9IHR1cm47XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vbkludGVudChlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gSW50ZW50OiAke2UuZGF0YS5pbnRlbnR9YCk7XG5cdFx0XHRjb25zdCBhY3Rpdml0eSA9IGUuZGF0YS5pbnRlbnQgfHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGFjdGl2aXR5ID09PSB1bmRlZmluZWQgJiYgIXRoaXMuX2hhc0FjdGl2aXR5KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2hhc0FjdGl2aXR5ID0gYWN0aXZpdHkgIT09IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2VtaXRBY3Rpb24oe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3Rpdml0eUNoYW5nZWQsXG5cdFx0XHRcdGFjdGl2aXR5LFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblJlYXNvbmluZyhlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gUmVhc29uaW5nOiAke2UuZGF0YS5jb250ZW50Lmxlbmd0aH0gY2hhcnNgKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uVHVybkVuZChlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gVHVybiBlbmRlZDogJHtlLmRhdGEudHVybklkfWApO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25BYm9ydChlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gQWJvcnRlZDogJHtlLmRhdGEucmVhc29ufWApO1xuXHRcdFx0dGhpcy5fY2FuY2VsQWN0aXZlUmVwb0luZm9UZWxlbWV0cnkoKTtcblx0XHRcdGlmICh0aGlzLl9jdXJyZW50VHVybj8uaXNSdW5uaW5nKSB7XG5cdFx0XHRcdHRoaXMuX3JlcG9ydFRvb2xDYWxsRGV0YWlscyh0aGlzLl9jdXJyZW50VHVybiwgJ2NhbmNlbGxlZCcpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25Ub29sVXNlclJlcXVlc3RlZChlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gVG9vbCB1c2VyLXJlcXVlc3RlZDogJHtlLmRhdGEudG9vbE5hbWV9ICgke2UuZGF0YS50b29sQ2FsbElkfSlgKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uVG9vbFBhcnRpYWxSZXN1bHQoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFRvb2wgcGFydGlhbCByZXN1bHQ6ICR7ZS5kYXRhLnRvb2xDYWxsSWR9ICgke2UuZGF0YS5wYXJ0aWFsT3V0cHV0Lmxlbmd0aH0gY2hhcnMpYCk7XG5cdFx0XHRjb25zdCB0cmFja2VkID0gdGhpcy5fYWN0aXZlVG9vbENhbGxzLmdldChlLmRhdGEudG9vbENhbGxJZCk7XG5cdFx0XHRpZiAoIXRyYWNrZWQgfHwgIWlzU2hlbGxUb29sKHRyYWNrZWQudG9vbE5hbWUpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9zaGVsbE1hbmFnZXI/LmdldFRlcm1pbmFsVXJpRm9yVG9vbENhbGwoZS5kYXRhLnRvb2xDYWxsSWQpKSB7XG5cdFx0XHRcdC8vIENsaWVudC1ob3N0ZWQgcHR5IHNoZWxsIFx1MjAxNCBpdHMgdGVybWluYWwgY2hhbm5lbCBzdHJlYW1zIGxpdmUgb3V0cHV0IGl0c2VsZi5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYXBwZW5kZWQgPSB0aGlzLl9ub25QdHlTaGVsbFRlcm1pbmFscy5hcHBlbmQoZS5kYXRhLnRvb2xDYWxsSWQsIGUuZGF0YS5wYXJ0aWFsT3V0cHV0KTtcblx0XHRcdGlmIChhcHBlbmRlZD8uY3JlYXRlZCkge1xuXHRcdFx0XHRjb25zdCB7IHVyaSB9ID0gYXBwZW5kZWQ7XG5cdFx0XHRcdHRyYWNrZWQuY29udGVudC5wdXNoKHtcblx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwsXG5cdFx0XHRcdFx0cmVzb3VyY2U6IHVyaSxcblx0XHRcdFx0XHR0aXRsZTogdHJhY2tlZC5kaXNwbGF5TmFtZSxcblx0XHRcdFx0XHRpc1B0eTogZmFsc2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLl9lbWl0QWN0aW9uKHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkLFxuXHRcdFx0XHRcdHR1cm5JZDogdGhpcy5fdHVybklkLFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6IGUuZGF0YS50b29sQ2FsbElkLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IHRyYWNrZWQuY29udGVudCxcblx0XHRcdFx0fSwgdHJhY2tlZC5wYXJlbnRUb29sQ2FsbElkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uVG9vbFByb2dyZXNzKGUgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBUb29sIHByb2dyZXNzOiAke2UuZGF0YS50b29sQ2FsbElkfSAtICR7ZS5kYXRhLnByb2dyZXNzTWVzc2FnZX1gKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uU2tpbGxJbnZva2VkKGUgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBTa2lsbCBpbnZva2VkOiAke2UuZGF0YS5uYW1lfSAoJHtlLmRhdGEucGF0aH0pYCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblN1YmFnZW50U3RhcnRlZChlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gU3ViYWdlbnQgc3RhcnRlZDogJHtlLmRhdGEuYWdlbnROYW1lfSAoJHtlLmRhdGEuYWdlbnREaXNwbGF5TmFtZX0pYCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vblN1YmFnZW50Q29tcGxldGVkKGUgPT4ge1xuXHRcdFx0dGhpcy5fY29tcGxldGVTdWJhZ2VudFR1cm4oZS5hZ2VudElkLCBlLmRhdGEudG9vbENhbGxJZCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIFN1YmFnZW50IGNvbXBsZXRlZDogJHtlLmRhdGEuYWdlbnROYW1lfWApO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25TdWJhZ2VudEZhaWxlZChlID0+IHtcblx0XHRcdHRoaXMuX2NvbXBsZXRlU3ViYWdlbnRUdXJuKGUuYWdlbnRJZCwgZS5kYXRhLnRvb2xDYWxsSWQpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBTdWJhZ2VudCBmYWlsZWQ6ICR7ZS5kYXRhLmFnZW50TmFtZX0gLSAke2UuZGF0YS5lcnJvcn1gKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uU3ViYWdlbnRTZWxlY3RlZChlID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDb3BpbG90OiR7c2Vzc2lvbklkfV0gU3ViYWdlbnQgc2VsZWN0ZWQ6ICR7ZS5kYXRhLmFnZW50TmFtZX1gKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3cmFwcGVyLm9uSG9va1N0YXJ0KGUgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBIb29rIHN0YXJ0ZWQ6ICR7ZS5kYXRhLmhvb2tUeXBlfSAoJHtlLmRhdGEuaG9va0ludm9jYXRpb25JZH0pYCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod3JhcHBlci5vbkhvb2tFbmQoZSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ29waWxvdDoke3Nlc3Npb25JZH1dIEhvb2sgZW5kZWQ6ICR7ZS5kYXRhLmhvb2tUeXBlfSAoJHtlLmRhdGEuaG9va0ludm9jYXRpb25JZH0pLCBzdWNjZXNzPSR7ZS5kYXRhLnN1Y2Nlc3N9YCk7XG5cdFx0XHRpZiAoZS5kYXRhLmhvb2tUeXBlID09PSAnYWdlbnRTdG9wJykge1xuXHRcdFx0XHR0aGlzLl9jb21wbGV0ZVN1YmFnZW50VHVybihlLmFnZW50SWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHdyYXBwZXIub25TeXN0ZW1NZXNzYWdlKGUgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NvcGlsb3Q6JHtzZXNzaW9uSWR9XSBTeXN0ZW0gbWVzc2FnZSBbJHtlLmRhdGEucm9sZX1dOiAke2UuZGF0YS5jb250ZW50Lmxlbmd0aH0gY2hhcnNgKTtcblx0XHR9KSk7XG5cdH1cblxuXHQvLyAtLS0tIFNESyBldmVudCBJRCB0cmFja2luZyAmIHRydW5jYXRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIFNESyBldmVudCBJRCBmb3IgdGhlIHR1cm4gaW5zZXJ0ZWQgYWZ0ZXIgdGhlIGdpdmVuIHR1cm4sXG5cdCAqIG9yIGB1bmRlZmluZWRgIGlmIGl0J3MgdGhlIGxhc3QgdHVybi5cblx0ICovXG5cdGdldE5leHRUdXJuRXZlbnRJZCh0dXJuSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2RhdGFiYXNlUmVmLm9iamVjdC5nZXROZXh0VHVybkV2ZW50SWQodHVybklkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBTREsgZXZlbnQgSUQgYXNzb2NpYXRlZCB3aXRoIHRoZSBnaXZlbiBwcm90b2NvbCB0dXJuLlxuXHQgKi9cblx0Z2V0VHVybkV2ZW50SWQodHVybklkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9kYXRhYmFzZVJlZi5vYmplY3QuZ2V0VHVybkV2ZW50SWQodHVybklkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBTREsgZXZlbnQgSUQgb2YgdGhlIGVhcmxpZXN0IHR1cm4uXG5cdCAqL1xuXHRnZXRGaXJzdFR1cm5FdmVudElkKCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2RhdGFiYXNlUmVmLm9iamVjdC5nZXRGaXJzdFR1cm5FdmVudElkKCk7XG5cdH1cblxuXHQvKipcblx0ICogVHJ1bmNhdGVzIHRoZSBzZXNzaW9uIGhpc3RvcnkgdmlhIHRoZSBTREsncyBSUEMgYW5kIGNsZWFucyB1cFxuXHQgKiBzdGFsZSB0dXJucyBmcm9tIHRoZSBzZXNzaW9uIGRhdGFiYXNlLlxuXHQgKlxuXHQgKiBAcGFyYW0gZXZlbnRJZCBUaGUgU0RLIGV2ZW50IElEIGF0IHdoaWNoIHRvIHRydW5jYXRlLiBUaGlzIGV2ZW50XG5cdCAqICAgICAgICBhbmQgYWxsIGV2ZW50cyBhZnRlciBpdCBhcmUgcmVtb3ZlZC5cblx0ICogQHBhcmFtIGtlZXBUdXJuSWQgSWYgcHJvdmlkZWQsIHR1cm5zIGluc2VydGVkIGFmdGVyIHRoaXMgdHVybiBhcmVcblx0ICogICAgICAgIGRlbGV0ZWQgZnJvbSB0aGUgREIuIElmIG9taXR0ZWQsIGFsbCB0dXJucyBhcmUgZGVsZXRlZC5cblx0ICovXG5cdGFzeW5jIHRydW5jYXRlQXRFdmVudElkKGV2ZW50SWQ6IHN0cmluZywga2VlcFR1cm5JZD86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIFRydW5jYXRpbmcgdmlhIFNESyBSUEMgYXQgZXZlbnRJZD0ke2V2ZW50SWR9YCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fd3JhcHBlci5zZXNzaW9uLnJwYy5oaXN0b3J5LnRydW5jYXRlKHsgZXZlbnRJZCB9KTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDb3BpbG90OiR7dGhpcy5zZXNzaW9uSWR9XSBTREsgdHJ1bmNhdGlvbiByZW1vdmVkICR7cmVzdWx0LmV2ZW50c1JlbW92ZWR9IGV2ZW50c2ApO1xuXG5cdFx0Ly8gQ2xlYW4gdXAgc3RhbGUgdHVybnMgZnJvbSBvdXIgREIgc28gZ2V0TmV4dFR1cm5FdmVudElkIGRvZXNuJ3Rcblx0XHQvLyByZXR1cm4gZXZlbnQgSURzIGZvciB0dXJucyB0aGF0IG5vIGxvbmdlciBleGlzdCBpbiB0aGUgU0RLLlxuXHRcdGlmIChrZWVwVHVybklkKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9kYXRhYmFzZVJlZi5vYmplY3QuZGVsZXRlVHVybnNBZnRlcihrZWVwVHVybklkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgdGhpcy5fZGF0YWJhc2VSZWYub2JqZWN0LmRlbGV0ZUFsbFR1cm5zKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEJ1bGstcmVtYXBzIHR1cm4gSURzIGluIHRoaXMgc2Vzc2lvbidzIGRhdGFiYXNlLlxuXHQgKiBVc2VkIGFmdGVyIGZpbGUtY29weWluZyBhIHNvdXJjZSBzZXNzaW9uJ3MgZGF0YWJhc2UgZm9yIGEgZm9yay5cblx0ICovXG5cdGFzeW5jIHJlbWFwVHVybklkcyhtYXBwaW5nOiBSZWFkb25seU1hcDxzdHJpbmcsIHN0cmluZz4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9kYXRhYmFzZVJlZi5vYmplY3QucmVtYXBUdXJuSWRzKG1hcHBpbmcpO1xuXHR9XG5cblx0Ly8gLS0tLSBjbGVhbnVwIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBDYW5jZWxzIGV2ZXJ5IHBlbmRpbmcgaW50ZXJhY3Rpb24gZm9yIGFib3J0IGFuZCBkaXNwb3NlLiBUaGlzIGNvbXBsZXRlcyBzeW5jaHJvbm91c2x5IGJlZm9yZSBhbnkgYXdhaXRlciByZXN1bWVzLCBzbyBvcmRlcmluZyBpcyBub3Qgc2lnbmlmaWNhbnQuXG5cdCAqL1xuXHRwcml2YXRlIF9jYW5jZWxBbGxQZW5kaW5nSW50ZXJhY3Rpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NhbmNlbFBlbmRpbmdBdXRvQXBwcm92YWxzKCk7XG5cdFx0dGhpcy5fZGVueVBlbmRpbmdQZXJtaXNzaW9ucygpO1xuXHRcdHRoaXMuX2NhbmNlbFBlbmRpbmdVc2VySW5wdXRzKCk7XG5cdFx0dGhpcy5fY2FuY2VsUGVuZGluZ0VsaWNpdGF0aW9ucygpO1xuXHRcdHRoaXMuX2NhbmNlbFBlbmRpbmdQbGFuUmV2aWV3cygpO1xuXHRcdHRoaXMuX2NhbmNlbFBlbmRpbmdNY3BBdXRoUmVxdWVzdHMoKTtcblx0XHR0aGlzLl9jYW5jZWxQZW5kaW5nTWNwU2FtcGxpbmdzKCk7XG5cdFx0dGhpcy5fY2FuY2VsUGVuZGluZ0NsaWVudFRvb2xDYWxscygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2FuY2VsUGVuZGluZ0F1dG9BcHByb3ZhbHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ0F1dG9BcHByb3ZhbHMuZGVueUFsbCh1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2F1dG9BcHByb3ZhbHMuY2xlYXIoKTtcblx0fVxuXG5cdHByaXZhdGUgX2RlbnlQZW5kaW5nUGVybWlzc2lvbnMoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBbdG9vbENhbGxJZF0gb2YgdGhpcy5fcGVuZGluZ1Blcm1pc3Npb25zLmVudHJpZXMoKSkge1xuXHRcdFx0dGhpcy5fZGVsZXRlUGVuZGluZ0VkaXRDb250ZW50KHRvb2xDYWxsSWQpO1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nUGVybWlzc2lvbnMuZGVueUFsbCh7IGtpbmQ6ICdyZWplY3QnIH0pO1xuXHRcdHRoaXMuX2FwcHJvdmVkRHVwbGljYWJsZVBlcm1pc3Npb25TaWduYXR1cmVzLmNsZWFyKCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlcyBhbnkgYHBlbmRpbmctZWRpdC1jb250ZW50OmAgZW50cmllcyBhc3NvY2lhdGVkIHdpdGggYSByZXNvbHZlZFxuXHQgKiAoYXBwcm92ZWQsIGRlbmllZCwgb3IgY2FuY2VsbGVkKSBwZXJtaXNzaW9uIHJlcXVlc3QuXG5cdCAqL1xuXHRwcml2YXRlIF9kZWxldGVQZW5kaW5nRWRpdENvbnRlbnQodG9vbENhbGxJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdXJpID0gdGhpcy5fcGVuZGluZ0VkaXRDb250ZW50VXJpcy5nZXQodG9vbENhbGxJZCk7XG5cdFx0aWYgKCF1cmkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ0VkaXRDb250ZW50VXJpcy5kZWxldGUodG9vbENhbGxJZCk7XG5cdFx0dGhpcy5fZmlsZVNlcnZpY2UuZGVsKHVyaSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NvcGlsb3Q6JHt0aGlzLnNlc3Npb25JZH1dIEZhaWxlZCB0byBkZWxldGUgcGVuZGluZyBlZGl0IGNvbnRlbnQ6ICR7dXJpLnRvU3RyaW5nKCl9YCwgZXJyKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2NhbmNlbFBlbmRpbmdVc2VySW5wdXRzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmdVc2VySW5wdXRzLmRlbnlBbGwoeyByZXNwb25zZTogQ2hhdElucHV0UmVzcG9uc2VLaW5kLkNhbmNlbCB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2NhbmNlbFBlbmRpbmdFbGljaXRhdGlvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ0VsaWNpdGF0aW9ucy5kZW55QWxsKHsgcmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZC5DYW5jZWwgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9jYW5jZWxQZW5kaW5nUGxhblJldmlld3MoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ1BsYW5SZXZpZXdzLmRlbnlBbGwoeyBhcHByb3ZlZDogZmFsc2UgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9jYW5jZWxQZW5kaW5nTWNwU2FtcGxpbmdzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHBlbmRpbmcgPSBBcnJheS5mcm9tKHRoaXMuX3BlbmRpbmdNY3BTYW1wbGluZ3MpO1xuXHRcdHRoaXMuX3BlbmRpbmdNY3BTYW1wbGluZ3MuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IHJlcXVlc3RJZCBvZiBwZW5kaW5nKSB7XG5cdFx0XHR0aGlzLl93cmFwcGVyLnNlc3Npb24ucnBjLm1jcC5jYW5jZWxTYW1wbGluZ0V4ZWN1dGlvbih7IHJlcXVlc3RJZCB9KS5jYXRjaCgoKSA9PiB7XG5cdFx0XHRcdC8vIEJlc3QtZWZmb3J0OiBTREsgbWF5IGhhdmUgYWxyZWFkeSB0b3JuIGRvd24uXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jYW5jZWxQZW5kaW5nQ2xpZW50VG9vbENhbGxzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmdDbGllbnRUb29sQ2FsbHMuZGVueUFsbCh7IHRleHRSZXN1bHRGb3JMbG06ICdUb29sIGNhbGwgY2FuY2VsbGVkOiBzZXNzaW9uIGVuZGVkJywgcmVzdWx0VHlwZTogJ2ZhaWx1cmUnLCBlcnJvcjogJ1Nlc3Npb24gZW5kZWQnIH0pO1xuXHR9XG59XG5cbi8qKlxuICogQ291bnRzIGFkZGVkL3JlbW92ZWQgbGluZXMgaW4gYSB1bmlmaWVkIGRpZmYgc3RyaW5nLiBJZ25vcmVzIHRoZSBgKysrYCBhbmRcbiAqIGAtLS1gIGhlYWRlciByb3dzIGFuZCBhbnkgbm9uLWh1bmsgY29udGV4dC5cbiAqL1xuZnVuY3Rpb24gY291bnRVbmlmaWVkRGlmZkxpbmVzKGRpZmY6IHN0cmluZyk6IHsgYWRkZWQ6IG51bWJlcjsgcmVtb3ZlZDogbnVtYmVyIH0gfCB1bmRlZmluZWQge1xuXHRsZXQgYWRkZWQgPSAwO1xuXHRsZXQgcmVtb3ZlZCA9IDA7XG5cdGZvciAoY29uc3QgbGluZSBvZiBkaWZmLnNwbGl0KCdcXG4nKSkge1xuXHRcdGlmIChsaW5lLnN0YXJ0c1dpdGgoJysrKycpIHx8IGxpbmUuc3RhcnRzV2l0aCgnLS0tJykpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRpZiAobGluZS5zdGFydHNXaXRoKCcrJykpIHtcblx0XHRcdGFkZGVkKys7XG5cdFx0fSBlbHNlIGlmIChsaW5lLnN0YXJ0c1dpdGgoJy0nKSkge1xuXHRcdFx0cmVtb3ZlZCsrO1xuXHRcdH1cblx0fVxuXHRpZiAoYWRkZWQgPT09IDAgJiYgcmVtb3ZlZCA9PT0gMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHsgYWRkZWQsIHJlbW92ZWQgfTtcbn1cblxuLyoqXG4gKiBSZWFkcyB0aGUgU0RLJ3MgaW50ZXJuYWwgYGNvcGlsb3RVc2FnZWAgYmlsbGluZyBwYXlsb2FkLCBjYXJyaWVkIG9uIGJvdGggdGhlIGBhc3Npc3RhbnQudXNhZ2VgXG4gKiBldmVudCBhbmQgYHNlc3Npb24uY29tcGFjdGlvbl9jb21wbGV0ZWAncyBgY29tcGFjdGlvblRva2Vuc1VzZWRgLiBJdCBpcyBtYXJrZWQgYGFzSW50ZXJuYWxgIGluXG4gKiB0aGUgU0RLIHNjaGVtYSwgc28gaXQgaXMgYWJzZW50IGZyb20gdGhlIGdlbmVyYXRlZCB0eXBlcyAoYEFzc2lzdGFudFVzYWdlRGF0YWAsXG4gKiBgQ29tcGFjdGlvbkNvbXBsZXRlQ29tcGFjdGlvblRva2Vuc1VzZWRgKSBldmVuIHRob3VnaCBpdCBpcyBwcmVzZW50IGF0IHJ1bnRpbWUgXHUyMDE0IGhlbmNlIHRoZVxuICogZHluYW1pYyByZWFkLiBUaGlzIGlzIHRoZSBzb3VyY2UgZm9yIHBlci10dXJuIGFuZCBwZXItc3ViYWdlbnQgY29zdCwgYWNjdW11bGF0ZWQgc3luY2hyb25vdXNseVxuICogYXMgZWFjaCBldmVudCBhcnJpdmVzOyBvbmx5IHRoZSBzZXNzaW9uLXdpZGUgdG90YWwgY29tZXMgZnJvbSB0aGUgU0RLJ3MgdXNhZ2UgbWV0cmljcy5cbiAqIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgcGF5bG9hZCBjYXJyaWVzIG5vIHVzYWJsZSBuYW5vLUFJVSB0b3RhbC5cbiAqL1xuZnVuY3Rpb24gcmVhZENvcGlsb3RVc2FnZShyYXc6IHVua25vd24pOiB7IHRvdGFsTmFub0FpdTogbnVtYmVyIH0gJiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCB7XG5cdGlmICghcmF3IHx8IHR5cGVvZiByYXcgIT09ICdvYmplY3QnKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB1c2FnZSA9IChyYXcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLmNvcGlsb3RVc2FnZTtcblx0aWYgKCF1c2FnZSB8fCB0eXBlb2YgdXNhZ2UgIT09ICdvYmplY3QnKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB0b3RhbE5hbm9BaXUgPSAodXNhZ2UgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLnRvdGFsTmFub0FpdTtcblx0aWYgKHR5cGVvZiB0b3RhbE5hbm9BaXUgIT09ICdudW1iZXInIHx8ICFOdW1iZXIuaXNGaW5pdGUodG90YWxOYW5vQWl1KSB8fCB0b3RhbE5hbm9BaXUgPCAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4geyAuLi4odXNhZ2UgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pLCB0b3RhbE5hbm9BaXUgfTtcbn1cblxuLyoqXG4gKiBOb3JtYWxpemVzIG9uZSByZXBvcnRlZCB0b2tlbiBjb3VudCBpbnRvIGEgdmFsdWUgc2FmZSB0byBhY2N1bXVsYXRlLiBUaGUgU0RLXG4gKiB0eXBlcyB0aGUgZmllbGRzIGFzIG51bWJlcnMsIGJ1dCB0aGV5IGFyZSBhYnNlbnQgb24gc29tZSBldmVudHMgYW5kIHRoaXNcbiAqIGd1YXJkcyBhZ2FpbnN0IGEgbWFsZm9ybWVkIHJ1bnRpbWUgcGF5bG9hZCBza2V3aW5nIHRoZSB0dXJuJ3MgdG90YWxzLlxuICovXG5mdW5jdGlvbiB0b1Rva2VuQ291bnQodmFsdWU6IG51bWJlciB8IHVuZGVmaW5lZCk6IG51bWJlciB7XG5cdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInICYmIE51bWJlci5pc1NhZmVJbnRlZ2VyKHZhbHVlKSAmJiB2YWx1ZSA+IDAgPyB2YWx1ZSA6IDA7XG59XG5cbi8qKlxuICogTm9ybWFsaXplcyB0aGUgU0RLJ3MgaW50ZXJuYWwgYHF1b3RhU25hcHNob3RzYCBmaWVsZCBcdTIwMTQgcHJlc2VudCBvbiB0aGUgYGFzc2lzdGFudC51c2FnZWAgZXZlbnQgYXRcbiAqIHJ1bnRpbWUgYnV0IGFic2VudCBmcm9tIHRoZSBnZW5lcmF0ZWQgYEFzc2lzdGFudFVzYWdlRGF0YWAgdHlwZSBcdTIwMTQgaW50byB0aGUgc2VyaWFsaXphYmxlIHNoYXBlXG4gKiBjYXJyaWVkIG9uIHtAbGluayBVc2FnZUluZm9NZXRhLnF1b3RhU25hcHNob3RzfS4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIG5vIHVzYWJsZSBzbmFwc2hvdCBpcyBwcmVzZW50LlxuICovXG5mdW5jdGlvbiBub3JtYWxpemVRdW90YVNuYXBzaG90cyhyYXc6IHVua25vd24pOiBVc2FnZUluZm9NZXRhWydxdW90YVNuYXBzaG90cyddIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFyYXcgfHwgdHlwZW9mIHJhdyAhPT0gJ29iamVjdCcpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHJlc3VsdDogTm9uTnVsbGFibGU8VXNhZ2VJbmZvTWV0YVsncXVvdGFTbmFwc2hvdHMnXT4gPSB7fTtcblx0bGV0IGhhc0FueSA9IGZhbHNlO1xuXHRmb3IgKGNvbnN0IFtxdW90YVR5cGUsIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhyYXcgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pKSB7XG5cdFx0aWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgdiA9IHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdGNvbnN0IHJlc2V0RGF0ZVJhdyA9IHYucmVzZXREYXRlO1xuXHRcdGNvbnN0IHJlc2V0RGF0ZSA9IHR5cGVvZiByZXNldERhdGVSYXcgPT09ICdzdHJpbmcnXG5cdFx0XHQ/IHJlc2V0RGF0ZVJhd1xuXHRcdFx0OiByZXNldERhdGVSYXcgaW5zdGFuY2VvZiBEYXRlXG5cdFx0XHRcdD8gcmVzZXREYXRlUmF3LnRvSVNPU3RyaW5nKClcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0cmVzdWx0W3F1b3RhVHlwZV0gPSB7XG5cdFx0XHRpc1VubGltaXRlZEVudGl0bGVtZW50OiB0eXBlb2Ygdi5pc1VubGltaXRlZEVudGl0bGVtZW50ID09PSAnYm9vbGVhbicgPyB2LmlzVW5saW1pdGVkRW50aXRsZW1lbnQgOiB1bmRlZmluZWQsXG5cdFx0XHRlbnRpdGxlbWVudFJlcXVlc3RzOiB0eXBlb2Ygdi5lbnRpdGxlbWVudFJlcXVlc3RzID09PSAnbnVtYmVyJyA/IHYuZW50aXRsZW1lbnRSZXF1ZXN0cyA6IHVuZGVmaW5lZCxcblx0XHRcdHVzZWRSZXF1ZXN0czogdHlwZW9mIHYudXNlZFJlcXVlc3RzID09PSAnbnVtYmVyJyA/IHYudXNlZFJlcXVlc3RzIDogdW5kZWZpbmVkLFxuXHRcdFx0cmVtYWluaW5nUGVyY2VudGFnZTogdHlwZW9mIHYucmVtYWluaW5nUGVyY2VudGFnZSA9PT0gJ251bWJlcicgPyB2LnJlbWFpbmluZ1BlcmNlbnRhZ2UgOiB1bmRlZmluZWQsXG5cdFx0XHRvdmVyYWdlOiB0eXBlb2Ygdi5vdmVyYWdlID09PSAnbnVtYmVyJyA/IHYub3ZlcmFnZSA6IHVuZGVmaW5lZCxcblx0XHRcdG92ZXJhZ2VBbGxvd2VkV2l0aEV4aGF1c3RlZFF1b3RhOiB0eXBlb2Ygdi5vdmVyYWdlQWxsb3dlZFdpdGhFeGhhdXN0ZWRRdW90YSA9PT0gJ2Jvb2xlYW4nID8gdi5vdmVyYWdlQWxsb3dlZFdpdGhFeGhhdXN0ZWRRdW90YSA6IHVuZGVmaW5lZCxcblx0XHRcdHJlc2V0RGF0ZSxcblx0XHR9O1xuXHRcdGhhc0FueSA9IHRydWU7XG5cdH1cblx0cmV0dXJuIGhhc0FueSA/IHJlc3VsdCA6IHVuZGVmaW5lZDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxrQkFBa0Isa0JBQWtCLFdBQVcsZ0JBQWdCLGlCQUFpQjtBQUN6RixTQUFTLGNBQWMsZ0JBQWdCO0FBQ3ZDLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGVBQWU7QUFD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STtBQUNWLFVBQU0sZUFBZSxFQUFFO0FBQ3ZCLFVBQU0sWUFBWSxPQUFPLGlCQUFpQixXQUN2QyxlQUNBLHdCQUF3QixPQUN2QixhQUFhLFlBQVksSUFDekI7QUFDSixXQUFPLFNBQVMsSUFBSTtBQUFBLE1BQ25CLHdCQUF3QixPQUFPLEVBQUUsMkJBQTJCLFlBQVksRUFBRSx5QkFBeUI7QUFBQSxNQUNuRyxxQkFBcUIsT0FBTyxFQUFFLHdCQUF3QixXQUFXLEVBQUUsc0JBQXNCO0FBQUEsTUFDekYsY0FBYyxPQUFPLEVBQUUsaUJBQWlCLFdBQVcsRUFBRSxlQUFlO0FBQUEsTUFDcEUscUJBQXFCLE9BQU8sRUFBRSx3QkFBd0IsV0FBVyxFQUFFLHNCQUFzQjtBQUFBLE1BQ3pGLFNBQVMsT0FBTyxFQUFFLFlBQVksV0FBVyxFQUFFLFVBQVU7QUFBQSxNQUNyRCxrQ0FBa0MsT0FBTyxFQUFFLHFDQUFxQyxZQUFZLEVBQUUsbUNBQW1DO0FBQUEsTUFDakk7QUFBQSxJQUNEO0FBQ0EsYUFBUztBQUFBLEVBQ1Y7QUFDQSxTQUFPLFNBQVMsU0FBUztBQUMxQjsiLAogICJuYW1lcyI6IFsidHJhY2tlZFRvb2xDYWxsIiwgInBhcmVudFRvb2xDYWxsSWQiXQp9Cg==
