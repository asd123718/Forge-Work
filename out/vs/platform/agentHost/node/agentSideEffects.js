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
import { getErrorCode } from "../../../base/common/errors.js";
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { NKeyMap } from "../../../base/common/map.js";
import { equals } from "../../../base/common/objects.js";
import { autorun } from "../../../base/common/observable.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { hasKey } from "../../../base/common/types.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
import { IAgentHostChangesetService } from "../common/agentHostChangesetService.js";
import { IAgentHostCheckpointService } from "../common/agentHostCheckpointService.js";
import { AgentHostActiveAgentTitleGenerationConfigKey, AgentHostMarkdownPlanRichLinksEnabledConfigKey, platformRootSchema } from "../common/agentHostSchema.js";
import { AgentHostClientType } from "../common/agentHostClientInfo.js";
import { AgentHostLaunchKind, createUnknownAgentHostClientTelemetryContext } from "../common/agentHostTelemetry.js";
import { readAgentModelByokIdentifier } from "../common/agentModelByokMeta.js";
import { AgentSession } from "../common/agent.js";
import { readToolCallMeta, toToolCallMeta } from "../common/meta/agentToolCallMeta.js";
import { readCodexReasoningKind } from "../common/meta/codexReasoningMeta.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { SessionConfigKey } from "../common/sessionConfigKeys.js";
import { resolveChatAttachment } from "../common/state/chatAttachmentContext.js";
import { buildOpenSessionLinkForChatResource } from "../common/openSessionLink.js";
import { SessionInputRequestKind, ToolCallContributorKind } from "../common/state/protocol/state.js";
import { ActionType, isChatAction } from "../common/state/sessionActions.js";
import {
  buildSubagentChatUri,
  chatStorageUri,
  getToolFileEdits,
  getInlineToolInput,
  isAhpChatChannel,
  isDefaultChatUri,
  buildDefaultChatUri,
  isSubagentChatUri,
  isChatReadOnly,
  AH_META_IS_ARCHIVED_DB_KEY,
  AH_META_IS_READ_DB_KEY,
  MessageAttachmentKind,
  MessageKind,
  parseChatUri,
  parseRequiredSessionUriFromChatUri,
  PendingMessageKind,
  ResponsePartKind,
  ROOT_STATE_URI,
  SessionLifecycle,
  SessionStatus,
  CustomizationType,
  ToolCallStatus,
  ToolResultContentType
} from "../common/state/sessionState.js";
import { AgentHostInputRequestTracker } from "./agentHostInputRequestTracker.js";
import { AgentHostSessionTitleController } from "./agentHostSessionTitleController.js";
import { resolveChatStateForUri } from "./agentHostStateManager.js";
import { IAgentConfigurationService } from "./agentConfigurationService.js";
import { createAgentChatContext, getSessionChatsForFanOut } from "./agentChatContext.js";
import { AgentHostTelemetryReporter } from "./agentHostTelemetryReporter.js";
import { AgentHostToolCallTracker } from "./agentHostToolCallTracker.js";
import { updateAgentHostTelemetryLevelFromConfig } from "./agentHostTelemetryService.js";
import { AgentHostTurnTracker } from "./agentHostTurnTracker.js";
import { AgentHostLocalCommands } from "./localCommands/localChatCommand.js";
import "./localCommands/localChatCommands.contribution.js";
import { SessionPermissionManager } from "./sessionPermissions.js";
import { stripProxyErrorMarker, toChatErrorMeta, tryParseForwardedChatError } from "./shared/proxyChatError.js";
import { AGENT_HOST_TITLE_SOURCE_USER, customChatTitleMetadataKey, customChatTitleSourceMetadataKey, persistSessionMetadata, SESSION_CUSTOM_TITLE_KEY, SESSION_CUSTOM_TITLE_SOURCE_KEY } from "./shared/persistSessionMetadata.js";
import { targetForMcpServer, targetForPlugin } from "./shared/customizationEnablementGate.js";
const MAX_SUPERSEDED_CUSTOMIZATION_PUBLISH_RETRIES = 3;
function getCustomizationEnablementCandidates(customizations, mcpServerOwners) {
  const candidates = [];
  for (const customization of customizations ?? []) {
    if (customization.type === CustomizationType.Plugin) {
      candidates.push({ customization });
      for (const child of customization.children ?? []) {
        if (child.type === CustomizationType.McpServer) {
          candidates.push({ customization: child, owningPluginUri: customization.uri });
        }
      }
    } else if (customization.type === CustomizationType.McpServer) {
      candidates.push({ customization, owningPluginUri: mcpServerOwners?.get(customization.name) });
    } else if (customization.type === CustomizationType.Directory) {
      for (const child of customization.children ?? []) {
        if (child.type === CustomizationType.McpServer) {
          candidates.push({ customization: child });
        }
      }
    }
  }
  return candidates;
}
function getSessionMode(mode) {
  switch (mode) {
    case "interactive":
    case "plan":
    case "autopilot":
      return mode;
    default:
      return void 0;
  }
}
function getConfiguredSessionMode(config) {
  const value = config?.values[SessionConfigKey.Mode] ?? config?.schema.properties[SessionConfigKey.Mode]?.default;
  return getSessionMode(value);
}
function createMarkdownPlanRichLinksInstruction(chat) {
  const currentChatLink = buildOpenSessionLinkForChatResource(chat);
  return [
    "<rich_plan_markdown>",
    "When creating or editing a Markdown plan document, use these formats when the exact target is known:",
    "- Use canonical HTTPS links for GitHub issues and pull requests.",
    "- Use `commit://<sha>` for commits in the current Git repository.",
    "- Preserve exact `agent-host-session://...` links returned by session and chat tools when referring to sessions, chats, or subagents. Do not construct these links yourself.",
    ...currentChatLink ? [`- Link to the current chat as [Current chat](${currentChatLink}).`] : [],
    "- Use `- [ ] :running: Description` for a task that is actively running, `- [ ]` for a pending task, and `- [x]` for a completed task.",
    "- Keep link labels meaningful so the document remains readable without rich rendering.",
    "</rich_plan_markdown>"
  ].join("\n");
}
let AgentSideEffects = class extends Disposable {
  constructor(_stateManager, _customizationEnablementService, _options, instantiationService, _logService, _changesets, _telemetryService, _checkpointService, _agentConfigService) {
    super();
    this._stateManager = _stateManager;
    this._customizationEnablementService = _customizationEnablementService;
    this._options = _options;
    this._logService = _logService;
    this._changesets = _changesets;
    this._telemetryService = _telemetryService;
    this._checkpointService = _checkpointService;
    this._agentConfigService = _agentConfigService;
    /** Maps tool call IDs to the agent that owns them, for routing confirmations. */
    this._toolCallAgents = /* @__PURE__ */ new Map();
    /** Managed confirmations are human-only and must never seed host-side session permissions. */
    this._managedApprovalToolCalls = /* @__PURE__ */ new Set();
    this._lastAgentInfos = [];
    this._subagentChats = new NKeyMap();
    this._cancelledTurnIds = /* @__PURE__ */ new Map();
    /** Serializes refreshes per session so state-based deduplication observes the preceding dispatch. */
    this._pendingSessionCustomizationPublishes = /* @__PURE__ */ new Map();
    this._pendingCustomizationEnablementRefreshes = /* @__PURE__ */ new Set();
    /** Last cumulative tool output, used to log only newly streamed text. */
    this._diagnosticToolOutput = /* @__PURE__ */ new Map();
    /**
     * Buffers signals whose `parentToolCallId` references a subagent
     * whose `subagent_started` signal has not yet been processed. The SDK is
     * not strict about ordering: an inner `tool_start` can arrive before the
     * `subagent_started` that creates the child session. Without buffering,
     * those signals would be dispatched against the parent session and the
     * UI would render the inner tool calls flat at the top level rather than
     * grouping them under the subagent. Drained by `_handleSubagentStarted`.
     *
     */
    this._pendingSubagentSignals = new NKeyMap();
    this._queuedMessageSenders = new NKeyMap();
    this._telemetryReporter = new AgentHostTelemetryReporter(this._telemetryService);
    this._turnTracker = this._register(new AgentHostTurnTracker(this._telemetryReporter));
    this.onDidStartTurn = this._turnTracker.onDidStartTurn;
    this._toolCallTracker = this._register(new AgentHostToolCallTracker(this._telemetryReporter, (session, turnId) => this._turnTracker.getClientTelemetryContext(session, turnId)));
    this._inputRequestTracker = new AgentHostInputRequestTracker(this._telemetryReporter, void 0, (session, turnId) => this._turnTracker.getClientTelemetryContext(session, turnId));
    this._permissionManager = this._register(instantiationService.createInstance(SessionPermissionManager, this._stateManager, {}));
    this._titleController = this._register(instantiationService.createInstance(AgentHostSessionTitleController, this._stateManager, {
      sessionDataService: this._options.sessionDataService,
      getGitHubCopilotToken: this._options.getGitHubCopilotToken,
      getGitHubToken: this._options.getGitHubToken,
      getGitHubHost: this._options.getGitHubHost,
      octoKitService: this._options.octoKitService,
      copilotApiService: this._options.copilotApiService,
      isActiveAgentTitleGenerationEnabled: () => this._agentConfigService.getRootValue(platformRootSchema, AgentHostActiveAgentTitleGenerationConfigKey) === true
    }));
    this._localCommands = this._register(instantiationService.createInstance(
      AgentHostLocalCommands,
      this._stateManager,
      this._options.localTurns,
      // Draining the queue re-enters agent lookup / telemetry / sendMessage,
      // which is this class's responsibility, so the dispatcher hands the
      // turn back here once it has completed a host-handled command.
      (turnChannel) => this._tryConsumeNextQueuedMessage(turnChannel),
      (session, chat) => this._titleController.markTitleRenamed(session, chat)
    ));
    this._register(this._stateManager.onDidChangeSessionConfig((e) => {
      const previousMode = getConfiguredSessionMode(e.previous);
      const currentMode = getConfiguredSessionMode(e.current);
      if (!previousMode || !currentMode || previousMode === currentMode) {
        return;
      }
      const agent = this._options.getAgent(e.session);
      const sessionState = this._stateManager.getSessionState(e.session);
      if (!agent || !sessionState) {
        return;
      }
      this._telemetryReporter.executionModeChanged(agent.id, e.session, previousMode, currentMode, sessionState.turns.length, e.clientContext);
    }));
    this._register(this._customizationEnablementService.onDidChange((event) => {
      for (const session of event.sessions) {
        const agent = this._options.getAgent(session);
        if (agent === void 0) {
          this._pendingCustomizationEnablementRefreshes.add(session);
        } else if (this._stateManager.getSessionState(session)?.customizations !== void 0) {
          this._publishSessionCustomizationsSoon(agent, session);
        }
      }
    }));
    this._register(autorun((reader) => {
      const agents = this._options.agents.read(reader);
      this._publishAgentInfos(agents, reader);
      this._publishPendingCustomizationEnablementRefreshes();
    }));
    this._register(this._stateManager.onDidEmitEnvelope((envelope) => {
      const action = envelope.action;
      if (action.type === ActionType.SessionCustomizationToggled) {
        const sessionState = this._stateManager.getSessionState(envelope.channel);
        const mcpServerOwners = this._options.getAgent(envelope.channel)?.getMcpServerOwners?.(URI.parse(envelope.channel));
        const customization = getCustomizationEnablementCandidates(sessionState?.customizations, mcpServerOwners).find((candidate) => candidate.customization.id === action.id);
        if (customization === void 0) {
          this._logService.warn(`[AgentSideEffects] Ignoring customization toggle for missing ${action.id} in ${envelope.channel}`);
        } else {
          this._recordCustomizationEnablement(envelope.channel, customization, action.enablement);
        }
      }
      if (isAhpChatChannel(envelope.channel) && isChatAction(envelope.action)) {
        const chatState = this._stateManager.getChatState(envelope.channel);
        const action2 = envelope.action;
        switch (action2.type) {
          case ActionType.ChatInputRequested: {
            const turnId = chatState?.activeTurn?.id;
            const provider = this._options.getAgent(parseRequiredSessionUriFromChatUri(envelope.channel))?.id;
            if (turnId && provider) {
              this._inputRequestTracker.inputRequested(provider, envelope.channel, turnId, action2.request);
            }
            break;
          }
          case ActionType.ChatInputCompleted:
            this._inputRequestTracker.inputCompleted(envelope.channel, action2, chatState);
            break;
          case ActionType.ChatTurnComplete:
          case ActionType.ChatTurnCancelled:
          case ActionType.ChatError:
            this._inputRequestTracker.clearTurn(envelope.channel, action2.turnId);
            break;
          case ActionType.ChatTruncated:
            this._inputRequestTracker.clearChat(envelope.channel);
            break;
        }
        if (envelope.action.type === ActionType.ChatTurnCancelled) {
          let turnIds = this._cancelledTurnIds.get(envelope.channel);
          if (!turnIds) {
            turnIds = /* @__PURE__ */ new Set();
            this._cancelledTurnIds.set(envelope.channel, turnIds);
          }
          turnIds.add(envelope.action.turnId);
          void this._checkpointService.discardTurnStartCheckpoint(URI.parse(parseRequiredSessionUriFromChatUri(envelope.channel)), URI.parse(envelope.channel), envelope.action.turnId).catch(() => void 0);
        }
        this._syncSessionInputNeededForChatAction(envelope.channel, envelope.action);
        this._trackTurnUsage(envelope.channel, envelope.action);
      }
      if (!envelope.origin && envelope.action.type === ActionType.ChatToolCallComplete) {
        const action2 = envelope.action;
        if (!isAhpChatChannel(envelope.channel)) {
          return;
        }
        const sessionChannel = parseRequiredSessionUriFromChatUri(envelope.channel);
        this._notifyClientToolCallComplete(sessionChannel, envelope.channel, action2.toolCallId, action2.result, "server-envelope");
      }
      if (envelope.action.type === ActionType.ChatDraftChanged) {
        this._persistChatDraft(envelope.channel, envelope.action.draft);
      }
      if (envelope.action.type === ActionType.SessionChatAdded) {
        for (const activeClient of this._stateManager.getSessionState(envelope.channel)?.activeClients ?? []) {
          this._fanOutActiveClient(envelope.channel, activeClient);
        }
      }
      if (envelope.action.type === ActionType.SessionConfigChanged) {
        const values = this._stateManager.getSessionState(envelope.channel)?.config?.values;
        if (values) {
          this._persistSessionFlag(envelope.channel, "configValues", JSON.stringify(values));
        }
      }
      if (!envelope.rejectionReason) {
        if (envelope.action.type === ActionType.SessionIsReadChanged) {
          this._persistSessionFlag(envelope.channel, AH_META_IS_READ_DB_KEY, envelope.action.isRead ? "true" : "");
        } else if (envelope.action.type === ActionType.SessionIsArchivedChanged) {
          this._persistSessionFlag(envelope.channel, AH_META_IS_ARCHIVED_DB_KEY, envelope.action.isArchived ? "true" : "");
        }
      }
    }));
  }
  _chatContext(session, chat) {
    return createAgentChatContext(this._stateManager, session, chat);
  }
  /**
   * The owning session's last host-published customization snapshot,
   * including user enablement toggles. `undefined` means the host has not
   * published a snapshot yet — distinct from an empty list, since the
   * provider must reconcile against its own state rather than treat "no
   * snapshot" as "no customizations".
   */
  _hostCustomizations(session) {
    return this._stateManager.getSessionState(session)?.customizations;
  }
  /** Hands a client's contribution to each exact chat Agent Host owns. */
  _fanOutActiveClient(session, activeClient) {
    const agent = this._options.getAgent(session);
    if (!agent) {
      return;
    }
    const chats = getSessionChatsForFanOut(this._stateManager, session);
    if (!chats) {
      this._logService.warn(`[AgentSideEffects] Skipping active-client fan-out for session without host state: session=${session}, clientId=${activeClient.clientId}`);
      return;
    }
    const hostCustomizations = this._hostCustomizations(session);
    for (const chat of chats) {
      const handle = agent.getOrCreateActiveClient(chat, this._chatContext(session, chat.toString()), {
        clientId: activeClient.clientId,
        displayName: activeClient.displayName
      }, hostCustomizations);
      handle.tools = activeClient.tools;
      handle.customizations = activeClient.customizations ?? [];
    }
  }
  /**
   * Publishes agent descriptors using the last known model lists.
   */
  _publishAgentInfos(agents, reader) {
    const infos = agents.map((a) => {
      const d = a.getDescriptor();
      const protectedResources = a.getProtectedResources();
      const models = reader ? a.models.read(reader) : a.models.get();
      const customizations = a.getCustomizations?.();
      return {
        provider: d.provider,
        displayName: d.displayName,
        description: d.description,
        models: models.map((m) => ({
          id: m.id,
          provider: m.provider,
          name: m.name,
          maxContextWindow: m.maxContextWindow,
          maxOutputTokens: m.maxOutputTokens,
          maxPromptTokens: m.maxPromptTokens,
          supportsVision: m.supportsVision,
          policyState: m.policyState,
          configSchema: m.configSchema,
          _meta: m._meta
        })),
        customizations: customizations?.length ? [...customizations] : void 0,
        protectedResources: protectedResources.length > 0 ? protectedResources : void 0,
        capabilities: d.capabilities ? { ...d.capabilities } : void 0
      };
    });
    if (equals(this._lastAgentInfos, infos)) {
      return;
    }
    this._lastAgentInfos = infos;
    this._stateManager.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootAgentsChanged, agents: infos });
  }
  async _publishSessionCustomizations(agent, session, supersededRetries) {
    const currentBeforeFetch = this._stateManager.getSessionState(session)?.customizations;
    const chat = URI.parse(this._stateManager.getSessionState(session)?.defaultChat ?? buildDefaultChatUri(session));
    const customizations = await agent.getChatCustomizations(chat, this._chatContext(session, chat.toString()), currentBeforeFetch);
    const current = this._stateManager.getSessionState(session)?.customizations;
    if (current !== currentBeforeFetch) {
      if (supersededRetries < MAX_SUPERSEDED_CUSTOMIZATION_PUBLISH_RETRIES) {
        this._publishSessionCustomizationsSoon(agent, session, supersededRetries + 1);
      }
      return;
    }
    if (current && equals(current, customizations)) {
      return;
    }
    this._stateManager.dispatchServerAction(session, {
      type: ActionType.SessionCustomizationsChanged,
      customizations: [...customizations]
    });
  }
  _publishSessionCustomizationsSoon(agent, session, supersededRetries = 0) {
    const previous = this._pendingSessionCustomizationPublishes.get(session) ?? Promise.resolve();
    const publish = previous.then(() => this._publishSessionCustomizations(agent, session, supersededRetries)).catch((err) => {
      this._logService.error("[AgentSideEffects] getChatCustomizations failed", err);
    });
    this._pendingSessionCustomizationPublishes.set(session, publish);
    void publish.finally(() => {
      if (this._pendingSessionCustomizationPublishes.get(session) === publish) {
        this._pendingSessionCustomizationPublishes.delete(session);
      }
    });
  }
  _publishPendingCustomizationEnablementRefreshes() {
    for (const session of this._pendingCustomizationEnablementRefreshes) {
      const agent = this._options.getAgent(session);
      if (agent === void 0) {
        continue;
      }
      this._pendingCustomizationEnablementRefreshes.delete(session);
      this._publishSessionCustomizationsSoon(agent, session);
    }
  }
  _publishSessionCustomizationsForAgent(agent) {
    for (const session of this._stateManager.getSessionUris()) {
      if (this._options.getAgent(session) === agent) {
        this._publishSessionCustomizationsSoon(agent, session);
      }
    }
  }
  _publishAllSessionCustomizations() {
    for (const session of this._stateManager.getSessionUris()) {
      const agent = this._options.getAgent(session);
      if (agent) {
        this._publishSessionCustomizationsSoon(agent, session);
      }
    }
  }
  // ---- Session input-needed aggregation ----------------------------------
  //
  // Mirrors per-chat blockers (user-input elicitations, tool confirmations,
  // client-tool executions, and MCP authentication) into the owning session's
  // `inputNeeded` list so clients subscribed only to the session channel can
  // discover and answer them without subscribing to each chat. This handler
  // only produces the state; it does not consume it.
  _syncSessionInputNeededForChatAction(chatUri, action) {
    switch (action.type) {
      case ActionType.ChatInputRequested:
        this._syncChatInputNeeded(chatUri, action.request.id);
        break;
      case ActionType.ChatInputAnswerChanged:
        this._syncChatInputNeeded(chatUri, action.requestId);
        break;
      case ActionType.ChatInputCompleted:
        this._removeSessionInputNeeded(chatUri, this._chatInputNeededId(chatUri, action.requestId));
        break;
      case ActionType.ChatToolCallStart:
      case ActionType.ChatToolCallReady:
      case ActionType.ChatToolCallConfirmed:
      case ActionType.ChatToolCallComplete:
      case ActionType.ChatToolCallResultConfirmed:
      case ActionType.ChatToolCallAuthRequired:
      case ActionType.ChatToolCallAuthResolved:
        this._syncToolInputNeeded(chatUri, action.turnId, action.toolCallId);
        break;
      case ActionType.ChatTurnComplete:
      case ActionType.ChatTurnCancelled:
      case ActionType.ChatError:
      case ActionType.ChatTruncated:
        this._removeSessionInputNeededForChat(chatUri);
        break;
    }
  }
  _syncChatInputNeeded(chatUri, requestId) {
    const state = this._stateManager.getSessionState(chatUri);
    const part = state?.activeTurn?.responseParts.find(
      (part2) => part2.kind === ResponsePartKind.InputRequest && part2.response === void 0 && part2.request.id === requestId
    );
    const id = this._chatInputNeededId(chatUri, requestId);
    if (!part || part.kind !== ResponsePartKind.InputRequest) {
      this._removeSessionInputNeeded(chatUri, id);
      return;
    }
    this._setSessionInputNeeded(chatUri, {
      id,
      kind: SessionInputRequestKind.ChatInput,
      chat: chatUri,
      request: part.request
    });
  }
  _syncToolInputNeeded(chatUri, turnId, toolCallId) {
    const confirmationId = this._toolConfirmationNeededId(chatUri, turnId, toolCallId);
    const clientExecutionId = this._toolClientExecutionNeededId(chatUri, turnId, toolCallId);
    const authenticationId = this._toolAuthenticationNeededId(chatUri, turnId, toolCallId);
    const toolCall = this._findToolCall(chatUri, turnId, toolCallId);
    const autoApproved = !!toolCall && readToolCallMeta(toolCall).autoApproveBySetting === true;
    const suppressAutoApprovedConfirmation = autoApproved && toolCall?.status === ToolCallStatus.PendingConfirmation;
    const needsConfirmation = !suppressAutoApprovedConfirmation && (toolCall?.status === ToolCallStatus.PendingConfirmation || toolCall?.status === ToolCallStatus.PendingResultConfirmation);
    if (needsConfirmation && toolCall) {
      this._setSessionInputNeeded(chatUri, {
        id: confirmationId,
        kind: SessionInputRequestKind.ToolConfirmation,
        chat: chatUri,
        turnId,
        toolCall
      });
    } else {
      this._removeSessionInputNeeded(chatUri, confirmationId);
    }
    const contributor = toolCall?.contributor;
    if (toolCall?.status === ToolCallStatus.Running && contributor?.kind === ToolCallContributorKind.Client) {
      this._setSessionInputNeeded(chatUri, {
        id: clientExecutionId,
        kind: SessionInputRequestKind.ToolClientExecution,
        chat: chatUri,
        turnId,
        clientId: contributor.clientId,
        toolCall
      });
    } else {
      this._removeSessionInputNeeded(chatUri, clientExecutionId);
    }
    if (toolCall?.status === ToolCallStatus.AuthRequired) {
      this._setSessionInputNeeded(chatUri, {
        id: authenticationId,
        kind: SessionInputRequestKind.ToolAuthentication,
        chat: chatUri,
        turnId,
        toolCall
      });
    } else {
      this._removeSessionInputNeeded(chatUri, authenticationId);
    }
  }
  _findToolCall(chatUri, turnId, toolCallId) {
    const state = this._stateManager.getSessionState(chatUri);
    const turn = state?.activeTurn?.id === turnId ? state.activeTurn : state?.turns.find((t) => t.id === turnId);
    const part = turn?.responseParts.find((p) => p.kind === ResponsePartKind.ToolCall && p.toolCall.toolCallId === toolCallId);
    return part?.kind === ResponsePartKind.ToolCall ? part.toolCall : void 0;
  }
  _setSessionInputNeeded(chatUri, request) {
    const sessionUri = parseRequiredSessionUriFromChatUri(chatUri);
    const existing = this._stateManager.getSessionState(sessionUri)?.inputNeeded?.find((r) => r.id === request.id);
    if (existing && equals(existing, request)) {
      return;
    }
    this._stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionInputNeededSet, request });
    const blockedTurnId = hasKey(request, { turnId: true }) ? request.turnId : this._stateManager.getActiveTurnId(chatUri);
    if (blockedTurnId) {
      const blockedToolCallId = hasKey(request, { toolCall: true }) ? request.toolCall.toolCallId : void 0;
      this._turnTracker.turnBlocked(chatUri, blockedTurnId, request.id, request.kind, blockedToolCallId);
    }
    if (request.kind !== SessionInputRequestKind.ChatInput) {
      const agent = this._options.getAgent(sessionUri);
      if (agent) {
        this._toolCallTracker.toolCallBlocked(agent.id, chatUri, request);
      }
    }
  }
  _removeSessionInputNeeded(chatUri, id) {
    const sessionUri = parseRequiredSessionUriFromChatUri(chatUri);
    this._toolCallTracker.toolCallUnblocked(chatUri, id);
    this._turnTracker.turnUnblocked(chatUri, id);
    if (!this._stateManager.getSessionState(sessionUri)?.inputNeeded?.some((r) => r.id === id)) {
      return;
    }
    this._stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionInputNeededRemoved, id });
  }
  _removeSessionInputNeededForChat(chatUri) {
    const sessionUri = parseRequiredSessionUriFromChatUri(chatUri);
    for (const request of this._stateManager.getSessionState(sessionUri)?.inputNeeded ?? []) {
      if (request.chat === chatUri) {
        this._removeSessionInputNeeded(chatUri, request.id);
      }
    }
  }
  _chatInputNeededId(chatUri, requestId) {
    return `chatInput:${chatUri}:${requestId}`;
  }
  _toolConfirmationNeededId(chatUri, turnId, toolCallId) {
    return `toolConfirmation:${chatUri}:${turnId}:${toolCallId}`;
  }
  _toolClientExecutionNeededId(chatUri, turnId, toolCallId) {
    return `toolClientExecution:${chatUri}:${turnId}:${toolCallId}`;
  }
  _toolAuthenticationNeededId(chatUri, turnId, toolCallId) {
    return `toolAuthentication:${chatUri}:${turnId}:${toolCallId}`;
  }
  // ---- Initialization ----------------------------------------------------
  /**
   * Initializes async resources (tree-sitter WASM) used for command
   * auto-approval. Await this before any session events can arrive to
   * guarantee that auto-approval checks are fully synchronous.
   */
  initialize() {
    return this._permissionManager.initialize();
  }
  // ---- Agent registration -------------------------------------------------
  /**
   * Registers a progress-signal listener on the given agent so that
   * {@link AgentSignal}s are routed/dispatched through the state manager.
   * Returns a disposable that removes the listener.
   */
  registerProgressListener(agent) {
    const disposables = new DisposableStore();
    disposables.add(agent.onDidChatProgress((signal) => {
      this._handleAgentSignal(agent, signal);
    }));
    if (agent.onDidCustomizationsChange) {
      disposables.add(agent.onDidCustomizationsChange(() => {
        this._publishAgentInfos(this._options.agents.get());
        this._publishSessionCustomizationsForAgent(agent);
      }));
    }
    if (agent.authenticationRequired) {
      disposables.add(autorun((reader) => {
        const requirement = agent.authenticationRequired?.read(reader);
        if (requirement) {
          this._stateManager.emitAuthRequired(requirement);
        }
      }));
    }
    return disposables;
  }
  /**
   * Routes a single signal from `agent` to the correct session.
   *
   * Action signals with a `parentToolCallId` are routed to the matching
   * subagent session. If the subagent session does not exist yet (the SDK
   * can emit an inner `tool_start` before its `subagent_started`), the
   * signal is buffered in {@link _pendingSubagentSignals} and replayed
   * once the `subagent_started` arrives.
   */
  _handleAgentSignal(agent, signal) {
    if (signal.kind === "subagent_started") {
      this._handleSubagentStarted(signal.chat.toString(), signal.toolCallId, signal.agentName, signal.agentDisplayName, signal.agentDescription, signal.taskPrompt, signal.parentToolCallId);
      this._drainPendingSubagentSignals(signal.chat.toString(), signal.toolCallId);
      return;
    }
    if (signal.kind === "subagent_resumed") {
      this._resumeSubagentSession(signal.chat.toString(), signal.toolCallId, signal.message);
      return;
    }
    if (signal.kind === "subagent_completed") {
      this.completeSubagentSession(signal.chat.toString(), signal.toolCallId);
      return;
    }
    if (signal.kind === "steering_consumed") {
      this._stateManager.dispatchServerAction(signal.chat.toString(), {
        type: ActionType.ChatPendingMessageRemoved,
        kind: PendingMessageKind.Steering,
        id: signal.id
      });
      return;
    }
    const signalResource = signal.kind === "action" ? signal.resource.toString() : signal.chat.toString();
    if (signal.kind === "action" && !isChatAction(signal.action) && isAhpChatChannel(signalResource)) {
      throw new Error(`Session action ${signal.action.type} must not be dispatched on chat channel ${signalResource}`);
    }
    const sessionKey = signalResource;
    const parentToolCallId = signal.parentToolCallId;
    if (parentToolCallId) {
      const subagentSession = this._subagentChats.get(sessionKey, parentToolCallId);
      if (subagentSession) {
        const subTurnId = this._stateManager.getActiveTurnId(subagentSession.chatUri);
        if (subTurnId) {
          this._dispatchActionForSession(signal, subagentSession.chatUri, subTurnId, "remap", agent);
        } else {
          this._logService.error(`[AgentSideEffects] Dropping ${this._describeSignal(signal)} for inactive subagent ${sessionKey}/${parentToolCallId}`);
          if (signal.kind === "pending_confirmation") {
            agent.respondToPermissionRequest(signal.state.toolCallId, false);
          }
        }
        return;
      }
      const pendingSignals = this._pendingSubagentSignals.get(sessionKey, parentToolCallId);
      if (signal.kind === "pending_confirmation" && !pendingSignals) {
        this._logService.error(`[AgentSideEffects] Denying permission for unroutable subagent ${sessionKey}/${parentToolCallId}: toolCallId=${signal.state.toolCallId}`);
        agent.respondToPermissionRequest(signal.state.toolCallId, false);
        return;
      }
      this._logService.trace(`[AgentSideEffects] Buffering ${this._describeSignal(signal)} for pending subagent ${sessionKey}/${parentToolCallId}`);
      let buffer = pendingSignals;
      if (!buffer) {
        buffer = [];
        this._pendingSubagentSignals.set(buffer, sessionKey, parentToolCallId);
      }
      buffer.push({ signal, agent });
      return;
    }
    if (signal.kind === "pending_confirmation") {
      const subagentChatUri = this._findSubagentChatForToolCall(sessionKey, signal.state.toolCallId);
      if (subagentChatUri) {
        const subTurnId = this._stateManager.getActiveTurnId(subagentChatUri) ?? "";
        void this._handleToolReady(signal, subagentChatUri, subTurnId, agent).catch((err) => {
          this._logService.error("[AgentSideEffects] _handleToolReady failed", err);
        });
        return;
      }
    }
    const turnId = this._stateManager.getActiveTurnId(sessionKey);
    if (turnId) {
      this._dispatchActionForSession(signal, sessionKey, turnId, "preserve", agent);
      return;
    }
    if (signal.kind === "pending_confirmation") {
      void this._handleToolReady(signal, sessionKey, "", agent).catch((err) => {
        this._logService.error("[AgentSideEffects] _handleToolReady failed", err);
      });
      return;
    }
    if (signal.kind === "action") {
      const action = signal.action;
      if (action.type === ActionType.ChatTurnComplete && this._cancelledTurnIds.get(sessionKey)?.has(action.turnId)) {
        this._logService.trace(`[AgentSideEffects] Dropping completion for cancelled turn ${action.turnId} on ${sessionKey}`);
        return;
      }
      this._stateManager.dispatchServerAction(sessionKey, action);
      if (action.type === ActionType.ChatTurnComplete) {
        this._runTurnCompleteSideEffects(sessionKey, void 0);
      }
    }
  }
  /**
   * Dispatches a signal to a resolved chat, preserving top-level turn identity or remapping cross-channel subagent actions.
   */
  _dispatchActionForSession(signal, sessionKey, turnId, turnIdRouting, agent) {
    if (signal.kind === "pending_confirmation") {
      if (agent) {
        void this._handleToolReady(signal, sessionKey, turnId, agent).catch((err) => {
          this._logService.error("[AgentSideEffects] _handleToolReady failed", err);
        });
      }
      return;
    }
    if (signal.kind !== "action") {
      return;
    }
    let action = signal.action;
    if (action.type !== ActionType.ChatTruncated && hasKey(action, { turnId: true }) && action.turnId !== turnId) {
      if (turnIdRouting === "remap") {
        action = { ...action, turnId };
      } else {
        this._logService.trace(`[AgentSideEffects] Dropping stale ${action.type} for ${sessionKey}: producerTurnId=${action.turnId}, activeTurnId=${turnId}`);
        return;
      }
    }
    this._recordAgentAction(sessionKey, action);
    if (action.type === ActionType.ChatToolCallStart && agent) {
      this._toolCallAgents.set(`${sessionKey}:${action.toolCallId}`, agent.id);
      const modelContext = this._turnTracker.getModelTelemetryContext(sessionKey, action.turnId);
      this._toolCallTracker.toolCallStarted(agent.id, sessionKey, action.turnId, action.toolCallId, action.toolName, action.contributor, modelContext?.model, modelContext?.modelTelemetryKind);
    } else if (action.type === ActionType.ChatToolCallReady) {
      this._toolCallTracker.toolCallMetadataUpdated(sessionKey, action.toolCallId, action.contributor);
      if (action.confirmed) {
        this._toolCallTracker.toolCallExecutionStarted(sessionKey, action.toolCallId);
      }
    }
    if (action.type === ActionType.ChatUsage && action.usage.model && agent) {
      const modelContext = this._getModelTelemetryContext(agent, action.usage.model);
      this._turnTracker.updateModel(sessionKey, action.turnId, modelContext.model, modelContext.modelTelemetryKind);
      this._toolCallTracker.updateTurnModel(sessionKey, action.turnId, modelContext.model, modelContext.modelTelemetryKind);
    }
    const sessionUri = isAhpChatChannel(sessionKey) ? parseRequiredSessionUriFromChatUri(sessionKey) : sessionKey;
    if ((action.type === ActionType.ChatToolCallStart || action.type === ActionType.ChatToolCallDelta || action.type === ActionType.ChatToolCallReady) && readToolCallMeta(action).toolKind === "subagent" && readToolCallMeta(action).subagentChatUri === void 0) {
      action = { ...action, _meta: { ...action._meta, subagentChatUri: buildSubagentChatUri(sessionUri, action.toolCallId) } };
    }
    if (action.type === ActionType.ChatToolCallComplete) {
      const subagent = this._subagentChats.get(sessionKey, action.toolCallId);
      if (subagent) {
        const parentState = this._stateManager.getSessionState(sessionKey);
        const runningContent = this._getRunningToolCallContent(parentState, turnId, action.toolCallId);
        const subagentEntry = runningContent.find((c) => hasKey(c, { type: true }) && c.type === ToolResultContentType.Subagent);
        if (subagentEntry) {
          const mergedContent = [...action.result.content ?? [], subagentEntry];
          const merged = { ...action, result: { ...action.result, content: mergedContent } };
          action = merged;
        }
      }
    }
    this._stateManager.dispatchServerAction(sessionKey, action);
    if (hasKey(action, { turnId: true })) {
      this._turnTracker.markActivity(sessionKey, turnId, action.type);
    }
    if (action.type === ActionType.ChatDelta || action.type === ActionType.ChatResponsePart || action.type === ActionType.ChatToolCallStart || action.type === ActionType.ChatReasoning) {
      this._turnTracker.markFirstProgress(sessionKey, turnId);
    }
    if (action.type === ActionType.ChatToolCallStart) {
      this._turnTracker.toolCallStarted(sessionKey, turnId, action.toolCallId, action.toolName, action.contributor);
    } else if (action.type === ActionType.ChatToolCallReady) {
      this._turnTracker.toolCallMetadataUpdated(sessionKey, turnId, action.toolCallId, action.contributor);
    }
    if (action.type === ActionType.ChatToolCallConfirmed && !action.approved) {
      this._turnTracker.toolCallEnded(sessionKey, turnId, action.toolCallId);
    }
    if (action.type === ActionType.ChatToolCallComplete) {
      this._turnTracker.toolCallEnded(sessionKey, turnId, action.toolCallId);
      this._toolCallTracker.toolCallCompleted(sessionKey, action.toolCallId, action.result);
      this._pendingSubagentSignals.delete(sessionKey, action.toolCallId);
      if (getToolFileEdits(action.result).length > 0) {
        this._changesets.onToolCallEditsApplied(sessionUri, turnId, this._turnTracker.getClientTelemetryContext(sessionKey, turnId));
      }
    }
    if (action.type === ActionType.ChatTurnComplete) {
      const clientContext = this._turnTracker.getClientTelemetryContext(sessionKey, turnId);
      this._completeTurn(sessionKey, turnId, "success");
      this._toolCallTracker.clearSession(sessionKey);
      this._runTurnCompleteSideEffects(sessionKey, turnId, clientContext);
    }
    if (action.type === ActionType.ChatTurnCancelled) {
      this._completeTurn(sessionKey, turnId, "cancelled");
      this._toolCallTracker.clearSession(sessionKey);
      this._markSessionUnread(sessionUri);
    }
    if (action.type === ActionType.ChatError) {
      const clientContext = this._turnTracker.getClientTelemetryContext(sessionKey, turnId);
      this._completeTurn(sessionKey, turnId, "error", { stage: "provider", error: action.error });
      this._toolCallTracker.clearSession(sessionKey);
      this._captureTurnCheckpointAndRefresh(sessionKey, turnId, clientContext);
      this._markSessionUnread(sessionUri);
    }
  }
  _recordAgentAction(sessionKey, action) {
    const log = this._options.diagnosticsLog;
    if (!log) {
      return;
    }
    const turnId = hasKey(action, { turnId: true }) && typeof action.turnId === "string" ? action.turnId : void 0;
    const context = { session: sessionKey, turn: turnId };
    switch (action.type) {
      case ActionType.ChatDelta:
        log.recordStream("chat", `${sessionKey}:${action.turnId}:assistant:${action.partId}`, "ASSISTANT", action.content, context);
        break;
      case ActionType.ChatReasoning:
        log.recordStream("chat", `${sessionKey}:${action.turnId}:reasoning:${action.partId}`, readCodexReasoningKind(action) === "summary" ? "REASONING-SUMMARY" : "REASONING-PUBLISHED", action.content, context);
        break;
      case ActionType.ChatResponsePart:
        if (action.part.kind === ResponsePartKind.Markdown && action.part.content) {
          log.recordText("chat", "ASSISTANT", action.part.content, context);
        } else if (action.part.kind === ResponsePartKind.Reasoning && action.part.content) {
          log.recordText("chat", "REASONING-SUMMARY", action.part.content, context);
        } else {
          log.record("agent", "RESPONSE.PART", { kind: action.part.kind }, context);
        }
        break;
      case ActionType.ChatToolCallStart:
        log.record("timeline", "TOOL.START", { ref: log.record("tools", "TOOL.START", { toolCallId: action.toolCallId, toolName: action.toolName, displayName: action.displayName, intention: action.intention, contributor: action.contributor }, context), toolCallId: action.toolCallId, toolName: action.toolName }, context);
        break;
      case ActionType.ChatToolCallDelta:
        if (action.content) {
          log.recordStream("tools", `${sessionKey}:${action.turnId}:tool:${action.toolCallId}`, "TOOL.ARGS", action.content, { ...context, toolCallId: action.toolCallId });
        }
        if (action.invocationMessage) {
          log.record("tools", "TOOL.PROGRESS", { toolCallId: action.toolCallId, invocationMessage: action.invocationMessage }, context);
        }
        break;
      case ActionType.ChatToolCallContentChanged: {
        const key = `${sessionKey}:${action.turnId}:${action.toolCallId}`;
        const text = action.content.filter((content) => hasKey(content, { type: true }) && content.type === ToolResultContentType.Text).map((content) => content.text).join("\n");
        const previous = this._diagnosticToolOutput.get(key) ?? "";
        const delta = text.startsWith(previous) ? text.slice(previous.length) : text;
        this._diagnosticToolOutput.set(key, text);
        if (delta) {
          log.recordStream("tools", `${key}:output`, text.startsWith(previous) ? "TOOL.OUTPUT" : "TOOL.OUTPUT-SNAPSHOT", delta, { ...context, toolCallId: action.toolCallId });
        }
        for (const content of action.content) {
          if (hasKey(content, { type: true }) && content.type === ToolResultContentType.FileEdit) {
            log.record("files", "FILE.PREVIEW", content, { ...context, toolCallId: action.toolCallId });
          }
        }
        break;
      }
      case ActionType.ChatToolCallReady:
        log.flushStreams(`${sessionKey}:${action.turnId}:tool:${action.toolCallId}`);
        {
          const type = action.confirmed ? "APPROVAL.AUTO" : "APPROVAL.REQUESTED";
          log.record("timeline", type, { ref: log.record("tools", type, { toolCallId: action.toolCallId, invocationMessage: action.invocationMessage, confirmationTitle: action.confirmationTitle, riskAssessment: action.riskAssessment, confirmed: action.confirmed, toolInput: getInlineToolInput(action.toolInput), edits: action.edits }, context), toolCallId: action.toolCallId }, context);
        }
        break;
      case ActionType.ChatToolCallComplete: {
        log.flushStreams(`${sessionKey}:${action.turnId}:tool:${action.toolCallId}`);
        log.flushStreams(`${sessionKey}:${action.turnId}:${action.toolCallId}:output`);
        this._diagnosticToolOutput.delete(`${sessionKey}:${action.turnId}:${action.toolCallId}`);
        log.record("timeline", "TOOL.COMPLETE", { ref: log.record("tools", "TOOL.COMPLETE", { toolCallId: action.toolCallId, result: action.result }, context), toolCallId: action.toolCallId, success: action.result.success }, context);
        const edits = getToolFileEdits(action.result);
        for (const edit of edits) {
          const operation = !edit.before ? "CREATE" : !edit.after ? "DELETE" : edit.before.uri !== edit.after.uri ? "RENAME" : "MODIFY";
          log.record("files", `FILE.${operation}`, edit, { ...context, toolCallId: action.toolCallId });
        }
        break;
      }
      case ActionType.ChatToolCallAuthRequired:
        log.record("tools", "TOOL.AUTH_REQUIRED", { toolCallId: action.toolCallId, auth: action.auth }, context);
        break;
      case ActionType.ChatToolCallAuthResolved:
        log.record("tools", "TOOL.AUTH_RESOLVED", { toolCallId: action.toolCallId }, context);
        break;
      case ActionType.ChatActivityChanged:
        log.record("agent", "AGENT.ACTIVITY", { activity: action.activity }, context);
        break;
      case ActionType.ChatInputRequested:
        log.record("agent", "USER_INPUT.REQUESTED", action.request, context);
        break;
      case ActionType.ChatPendingMessageSet:
        log.record("agent", "MESSAGE.QUEUED", { id: action.id, kind: action.kind }, context);
        break;
      case ActionType.ChatPendingMessageRemoved:
        log.record("agent", "MESSAGE.DEQUEUED", { id: action.id, kind: action.kind }, context);
        break;
      case ActionType.ChatUsage:
        log.record("agent", "TOKEN.USAGE", action.usage, context);
        break;
      case ActionType.ChatTurnComplete:
        log.flushStreams(`${sessionKey}:${action.turnId}:`);
        log.record("agent", "TURN.COMPLETE", { duration: action.duration }, context);
        log.record("timeline", "TURN.COMPLETE", { duration: action.duration }, context);
        log.record("summary", "TURN.COMPLETE", { session: sessionKey, turn: action.turnId, duration: action.duration });
        break;
      case ActionType.ChatTurnCancelled:
        log.flushStreams(`${sessionKey}:${action.turnId}:`);
        log.record("agent", "TURN.CANCELLED", { duration: action.duration }, context);
        log.record("timeline", "TURN.CANCELLED", { duration: action.duration }, context);
        break;
      case ActionType.ChatError:
        log.flushStreams(`${sessionKey}:${action.turnId}:`);
        log.record("timeline", "TURN.ERROR", { ref: log.record("errors", "TURN.ERROR", { duration: action.duration, error: action.error }, context) }, context);
        break;
      default:
        break;
    }
  }
  /**
   * Completes a turn's telemetry, enriching it with the session's working-
   * directory shape. Normalizes a chat channel to its owning session URI
   * before reading the effective working directories, so peer-chat / channel
   * turns report the correct count and multi-root flag.
   */
  _captureTurnCheckpointAndRefresh(sessionKey, turnId, clientContext) {
    const sessionUri = isAhpChatChannel(sessionKey) ? parseRequiredSessionUriFromChatUri(sessionKey) : sessionKey;
    const workingDirectories = this._agentConfigService.getEffectiveWorkingDirectories(sessionUri)?.map((w) => URI.parse(w));
    this._checkpointService.captureTurnCheckpoint(URI.parse(sessionUri), URI.parse(sessionKey), turnId, workingDirectories).then(() => this._changesets.onTurnComplete(sessionUri, turnId, clientContext), () => this._changesets.onTurnComplete(sessionUri, turnId, clientContext));
  }
  _completeTurn(channel, turnId, result, failure) {
    const sessionUri = isAhpChatChannel(channel) ? parseRequiredSessionUriFromChatUri(channel) : channel;
    const folderCount = this._agentConfigService.getEffectiveWorkingDirectories(sessionUri)?.length ?? 0;
    this._turnTracker.turnCompleted(channel, turnId, result, failure, { isMultiRoot: folderCount > 1, folderCount });
  }
  /**
   * Post-turn side effects: flush any pending debounced diff computation,
   * compute final diffs immediately, drain the next queued message, and
   * notify the host so it can refresh git state.
   */
  _runTurnCompleteSideEffects(sessionKey, turnId, clientContext) {
    const sessionUri = isAhpChatChannel(sessionKey) ? parseRequiredSessionUriFromChatUri(sessionKey) : sessionKey;
    if (turnId !== void 0) {
      const workingDirectories = this._agentConfigService.getEffectiveWorkingDirectories(sessionUri)?.map((w) => URI.parse(w));
      this._checkpointService.captureTurnCheckpoint(URI.parse(sessionUri), URI.parse(sessionKey), turnId, workingDirectories).then(() => {
        this._changesets.onTurnComplete(sessionUri, turnId, clientContext);
      }, (err) => {
        this._logService.warn(`[AgentSideEffects] Turn checkpoint capture failed for ${sessionUri}/${turnId}: ${err instanceof Error ? err.message : String(err)}`);
        this._changesets.onTurnComplete(sessionUri, turnId, clientContext);
      });
    } else {
      this._changesets.onTurnComplete(sessionUri, turnId, clientContext);
    }
    this._tryConsumeNextQueuedMessage(sessionKey);
    this._options.onTurnComplete(sessionUri);
    const titleChatChannel = isAhpChatChannel(sessionKey) && !isDefaultChatUri(sessionKey) ? sessionKey : void 0;
    this._titleController.refineTitleFromFirstTurn(sessionUri, titleChatChannel);
    this._markSessionUnread(sessionUri);
  }
  _markSessionUnread(session) {
    const status = this._stateManager.getSessionSummary(session)?.status ?? 0;
    if (!(status & SessionStatus.IsRead)) {
      return;
    }
    this._stateManager.dispatchServerAction(session, { type: ActionType.SessionIsReadChanged, isRead: false });
  }
  _describeSignal(signal) {
    return signal.kind === "action" ? `action(${signal.action.type})` : signal.kind;
  }
  /**
   * Replays any signals that were buffered while waiting for
   * `subagent_started` to create the subagent session. Called immediately
   * after `_handleSubagentStarted`.
   */
  _drainPendingSubagentSignals(parentChatURI, parentToolCallId) {
    const buffer = this._pendingSubagentSignals.get(parentChatURI, parentToolCallId);
    if (!buffer) {
      return;
    }
    this._pendingSubagentSignals.delete(parentChatURI, parentToolCallId);
    this._logService.trace(`[AgentSideEffects] Draining ${buffer.length} buffered signal(s) for subagent ${parentChatURI}/${parentToolCallId}`);
    for (const { signal, agent } of buffer) {
      this._handleAgentSignal(agent, signal);
    }
  }
  // ---- Subagent session management ----------------------------------------
  /**
   * Starts the subagent turn in response to a `subagent_started` event and
   * wires the parent tool call to the subagent chat. The subagent chat's
   * catalog membership is owned by the spawn channel
   * ({@link AgentService._onChatSpawned}), which the orchestrator applies
   * before this runs, so this only drives the turn/tracking/parent content
   * — it does not add the chat.
   *
   * `chatURI` is always the agent's top-level chat: the subagent is
   * registered (and inner events routed) under it because inner-tool
   * signals carry the top-level chat as their resource. `spawningToolParentId`,
   * when set, is the tool call one level up from the spawning `toolCallId`
   * — the tool call in whose (subagent) chat the spawning tool lives — and
   * is used to route the discovery content block to that immediate parent
   * chat. Since subagent chats are flat (keyed off the root session), this
   * one-hop reference resolves the parent chat at any nesting depth.
   */
  _handleSubagentStarted(chatURI, toolCallId, agentName, agentDisplayName, agentDescription, taskPrompt, spawningToolParentId) {
    const parentSessionUri = parseRequiredSessionUriFromChatUri(chatURI);
    const subagentChatUri = buildSubagentChatUri(parentSessionUri, toolCallId);
    const existing = this._subagentChats.get(chatURI, toolCallId);
    if (existing) {
      this._resumeSubagentSession(chatURI, toolCallId, taskPrompt ? { text: taskPrompt, origin: { kind: MessageKind.User } } : void 0);
      return;
    }
    this._logService.info(`[AgentSideEffects] Starting subagent turn: ${subagentChatUri} (parent=${chatURI}, toolCallId=${toolCallId})`);
    const contentChatUri = spawningToolParentId ? this._subagentChats.get(chatURI, spawningToolParentId)?.chatUri ?? chatURI : chatURI;
    const turnId = generateUuid();
    const parentTurnId = this._stateManager.getActiveTurnId(contentChatUri);
    const parentClientContext = parentTurnId ? this._turnTracker.getClientTelemetryContext(contentChatUri, parentTurnId) : void 0;
    this._stateManager.dispatchServerAction(subagentChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      message: { text: taskPrompt ?? "", origin: { kind: MessageKind.User } }
    });
    const agent = this._options.getAgent(parentSessionUri);
    if (agent) {
      this._turnTracker.turnStarted(agent.id, subagentChatUri, turnId, void 0, void 0, void 0, void 0, parentClientContext);
    }
    this._subagentChats.set({ parentChatUri: chatURI, toolCallId, sessionUri: parentSessionUri, chatUri: subagentChatUri, turnStopWatch: StopWatch.create(false) }, chatURI, toolCallId);
    if (parentTurnId) {
      const parentState = this._stateManager.getSessionState(contentChatUri);
      const existingContent = this._getRunningToolCallContent(parentState, parentTurnId, toolCallId);
      this._stateManager.dispatchServerAction(contentChatUri, {
        type: ActionType.ChatToolCallContentChanged,
        turnId: parentTurnId,
        toolCallId,
        content: [
          ...existingContent,
          {
            type: ToolResultContentType.Subagent,
            resource: subagentChatUri,
            title: agentDisplayName,
            agentName,
            description: agentDescription
          }
        ]
      });
    }
  }
  /**
   * Gets the current content array from a running tool call, if any.
   */
  _getRunningToolCallContent(state, turnId, toolCallId) {
    if (!state?.activeTurn || state.activeTurn.id !== turnId) {
      return [];
    }
    for (const rp of state.activeTurn.responseParts) {
      if (rp.kind === ResponsePartKind.ToolCall && rp.toolCall.toolCallId === toolCallId && rp.toolCall.status === ToolCallStatus.Running) {
        return rp.toolCall.content ? [...rp.toolCall.content] : [];
      }
    }
    return [];
  }
  _turnDuration(stopWatch) {
    const elapsed = stopWatch?.elapsed();
    return typeof elapsed === "number" && Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  }
  _resumeSubagentSession(parentChatURI, toolCallId, message) {
    const subagent = this._subagentChats.get(parentChatURI, toolCallId);
    if (!subagent) {
      this._logService.error(`[AgentSideEffects] Cannot resume unknown subagent ${parentChatURI}/${toolCallId}`);
      return;
    }
    if (this._stateManager.getActiveTurnId(subagent.chatUri)) {
      return;
    }
    const turnId = generateUuid();
    const parentTurnId = this._stateManager.getActiveTurnId(parentChatURI);
    const parentClientContext = parentTurnId ? this._turnTracker.getClientTelemetryContext(parentChatURI, parentTurnId) : void 0;
    this._logService.info(`[AgentSideEffects] Resuming subagent turn: ${subagent.chatUri} (parent=${parentChatURI}, toolCallId=${toolCallId})`);
    this._stateManager.dispatchServerAction(subagent.chatUri, {
      type: ActionType.ChatTurnStarted,
      turnId,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      message: message ?? { text: "", origin: { kind: MessageKind.User } }
    });
    const agent = this._options.getAgent(subagent.sessionUri);
    if (agent) {
      this._turnTracker.turnStarted(agent.id, subagent.chatUri, turnId, void 0, void 0, void 0, void 0, parentClientContext);
    }
    this._subagentChats.set({ ...subagent, turnStopWatch: StopWatch.create(false) }, parentChatURI, toolCallId);
  }
  /**
   * Cancels all active subagent sessions for a given parent session.
   */
  cancelSubagentSessions(parentChatURI) {
    for (const subagent of this._subagentChats.getAll(parentChatURI)) {
      const turnId = this._stateManager.getActiveTurnId(subagent.chatUri);
      if (turnId) {
        this._stateManager.dispatchServerAction(subagent.chatUri, {
          type: ActionType.ChatTurnCancelled,
          turnId,
          duration: this._turnDuration(subagent.turnStopWatch)
        });
        this._completeTurn(subagent.chatUri, turnId, "cancelled");
      }
      this._toolCallTracker.clearSession(subagent.chatUri);
      this._turnTracker.clearSession(subagent.chatUri);
    }
    this._subagentChats.deleteAll(parentChatURI);
    this._pendingSubagentSignals.deleteAll(parentChatURI);
  }
  /**
   * Completes the active turn for the subagent associated with a parent tool
   * call. The chat remains registered so a later steered turn can resume it.
   */
  completeSubagentSession(parentChatURI, toolCallId) {
    this._pendingSubagentSignals.delete(parentChatURI, toolCallId);
    const subagent = this._subagentChats.get(parentChatURI, toolCallId);
    if (!subagent) {
      return;
    }
    const turnId = this._stateManager.getActiveTurnId(subagent.chatUri);
    if (turnId) {
      this._stateManager.dispatchServerAction(subagent.chatUri, {
        type: ActionType.ChatTurnComplete,
        turnId,
        duration: this._turnDuration(subagent.turnStopWatch)
      });
      this._completeTurn(subagent.chatUri, turnId, "success");
      this._toolCallTracker.clearSession(subagent.chatUri);
    }
  }
  /**
   * Removes all subagent chats for a given parent session from the state manager.
   */
  removeSubagentSessions(parentSession) {
    for (const chatUri of this._cancelledTurnIds.keys()) {
      if (parseRequiredSessionUriFromChatUri(chatUri) === parentSession) {
        this._cancelledTurnIds.delete(chatUri);
      }
    }
    const parentChatURIs = /* @__PURE__ */ new Set();
    for (const subagent of this._subagentChats.values()) {
      if (subagent.sessionUri === parentSession) {
        this._stateManager.removeChat(subagent.sessionUri, subagent.chatUri);
        this._toolCallTracker.clearSession(subagent.chatUri);
        this._turnTracker.clearSession(subagent.chatUri);
        parentChatURIs.add(subagent.parentChatUri);
      }
    }
    for (const parentChatURI of parentChatURIs) {
      this._subagentChats.deleteAll(parentChatURI);
      this._pendingSubagentSignals.deleteAll(parentChatURI);
    }
  }
  /**
   * Drops per-channel telemetry tracking on teardown. In-flight tool calls
   * and never-completed turns are discarded without reporting, so neither
   * their tracking maps nor the turn hang watchdog timers outlive the
   * channel they describe.
   */
  clearChannelTelemetry(channel) {
    this._toolCallTracker.clearSession(channel);
    this._turnTracker.clearSession(channel);
  }
  clearInputRequestsForSession(session) {
    this._inputRequestTracker.clearAgentSession(session);
  }
  /**
   * Finds the subagent session that owns a given tool call by checking
   * whether the tool call was previously registered under a subagent
   * session key in `_toolCallAgents`. Scoped to subagent sessions owned
   * by the given parent to avoid cross-session collisions.
   */
  _findSubagentChatForToolCall(parentChatURI, toolCallId) {
    for (const subagent of this._subagentChats.getAll(parentChatURI)) {
      if (this._toolCallAgents.has(`${subagent.chatUri}:${toolCallId}`)) {
        return subagent.chatUri;
      }
    }
    return void 0;
  }
  _toolCallCompletionChat(chatChannel) {
    if (!isSubagentChatUri(chatChannel)) {
      return chatChannel;
    }
    for (const subagent of this._subagentChats.values()) {
      if (subagent.chatUri === chatChannel) {
        return this._toolCallCompletionChat(subagent.parentChatUri);
      }
    }
    this._logService.warn(`[AgentSideEffects] Missing parent chat for subagent tool completion: chat=${chatChannel}`);
    return chatChannel;
  }
  /**
   * Forwards a completed client tool call to the provider.
   *
   * `chat` is the host-resolved *routing* target: for a subagent chat, the
   * ancestor chat whose provider runtime owns the tool call (see
   * {@link _toolCallCompletionChat}). The context carries the chat the tool
   * call was actually addressed to, so a provider can recover the spawn edge
   * via `resolveSubagentChatParent(context)` instead of walking host state.
   * The two differ only when the addressed chat is a subagent.
   */
  _notifyClientToolCallComplete(sessionChannel, chatChannel, toolCallId, result, source) {
    const completionChat = this._toolCallCompletionChat(chatChannel);
    const agent = this._options.getAgent(sessionChannel);
    if (!agent) {
      this._logService.warn(`[AgentSideEffects] No agent for client tool completion: source=${source}, session=${sessionChannel}, chat=${chatChannel}, completionChat=${completionChat}, toolCallId=${toolCallId}`);
      return;
    }
    this._logService.info(`[AgentSideEffects] Forwarding client tool completion: source=${source}, session=${sessionChannel}, chat=${chatChannel}, completionChat=${completionChat}, toolCallId=${toolCallId}, success=${result.success}`);
    agent.onClientToolCallComplete(URI.parse(completionChat), toolCallId, result, this._chatContext(sessionChannel, chatChannel));
  }
  // ---- Side-effect handlers --------------------------------------------------
  /**
   * Handles a `pending_confirmation` signal end-to-end: checks for
   * auto-approval via the permission manager, and if not auto-approved,
   * dispatches the `ChatToolCallReady` action with confirmation options
   * for the client.
   */
  async _handleToolReady(e, sessionKey, turnId, agent) {
    const approvalEvent = {
      toolCallId: e.state.toolCallId,
      session: e.chat,
      permissionKind: e.permissionKind,
      permissionPath: e.permissionPath,
      toolInput: getInlineToolInput(e.state.toolInput),
      requestSandboxBypass: e.requestSandboxBypass,
      shellLanguage: e.shellLanguage
    };
    const autoApproval = e.managedApprovalRequired ? void 0 : await this._permissionManager.getAutoApproval(approvalEvent, sessionKey);
    const part = this._stateManager.getSessionState(sessionKey)?.activeTurn?.responseParts.find((part2) => part2.kind === ResponsePartKind.ToolCall && part2.toolCall.toolCallId === e.state.toolCallId);
    const toolCall = part?.kind === ResponsePartKind.ToolCall ? part.toolCall : void 0;
    if (toolCall && toolCall.status !== ToolCallStatus.Streaming && toolCall.status !== ToolCallStatus.Running && toolCall.status !== ToolCallStatus.PendingConfirmation) {
      const toolCallKey2 = `${sessionKey}:${e.state.toolCallId}`;
      this._toolCallAgents.delete(toolCallKey2);
      this._managedApprovalToolCalls.delete(toolCallKey2);
      this._logService.trace(`[AgentSideEffects] Dropping stale tool ready for ${e.state.toolCallId}: status=${toolCall.status}`);
      return;
    }
    const contributor = e.state.contributor ?? toolCall?.contributor;
    let effective = e;
    const toolCallKey = `${sessionKey}:${e.state.toolCallId}`;
    if (e.managedApprovalRequired) {
      this._managedApprovalToolCalls.add(toolCallKey);
    } else {
      this._managedApprovalToolCalls.delete(toolCallKey);
    }
    const clientShouldAutoApprove = autoApproval !== void 0 && contributor?.kind === ToolCallContributorKind.Client && !!e.state.confirmationTitle;
    if (clientShouldAutoApprove) {
      this._toolCallAgents.set(toolCallKey, agent.id);
      effective = { ...e, state: { ...e.state, _meta: { ...toolCall?._meta, ...e.state._meta, ...toToolCallMeta({ autoApproveBySetting: true }) } } };
    } else if (autoApproval !== void 0) {
      this._toolCallAgents.delete(toolCallKey);
      agent.respondToPermissionRequest(e.state.toolCallId, true);
      effective = { ...e, state: { ...e.state, confirmationTitle: void 0 } };
    } else if (effective.state.confirmationTitle) {
      this._toolCallAgents.set(toolCallKey, agent.id);
    }
    if (autoApproval === void 0 && !e.managedApprovalRequired && this._permissionManager.isAutoApproveRuleResolvable(approvalEvent, sessionKey)) {
      effective = { ...effective, state: { ...effective.state, _meta: { ...toolCall?._meta, ...effective.state._meta, ...toToolCallMeta({ autoApproveRuleResolvable: true }) } } };
    }
    const readyAction = this._permissionManager.createToolReadyAction(effective, sessionKey, turnId);
    this._toolCallTracker.toolCallMetadataUpdated(sessionKey, readyAction.toolCallId, readyAction.contributor);
    this._turnTracker.toolCallMetadataUpdated(sessionKey, turnId, readyAction.toolCallId, readyAction.contributor);
    if (readyAction.confirmed) {
      this._toolCallTracker.toolCallExecutionStarted(sessionKey, readyAction.toolCallId);
    }
    this._stateManager.dispatchServerAction(sessionKey, readyAction);
    this._turnTracker.markActivity(sessionKey, turnId, readyAction.type);
  }
  handleAction(channel, action, clientId, clientContextOrType = AgentHostClientType.Unknown) {
    let clientContext = typeof clientContextOrType === "string" ? createUnknownAgentHostClientTelemetryContext(clientContextOrType) : clientContextOrType;
    if (this._options.hostLaunchKind !== void 0) {
      clientContext = { ...clientContext, hostLaunchKind: this._options.hostLaunchKind };
    }
    const chatChannel = isAhpChatChannel(channel) ? channel : void 0;
    const sessionChannel = chatChannel ? parseRequiredSessionUriFromChatUri(chatChannel) : channel;
    switch (action.type) {
      case ActionType.ChatTurnStarted: {
        if (!chatChannel) {
          throw new Error(`ChatTurnStarted must be handled on an AHP chat channel: ${channel}`);
        }
        const turnStopWatch = StopWatch.create(false);
        this._options.diagnosticsLog?.recordText("chat", "USER", action.message.text, { session: channel, turn: action.turnId, model: action.message.model?.id });
        this._options.diagnosticsLog?.record("timeline", "TURN.START", { session: channel, turn: action.turnId, model: action.message.model?.id, attachmentCount: action.message.attachments?.length ?? 0 });
        const handled = this._localCommands.tryHandle({ turnChannel: channel, turnId: action.turnId, text: action.message.text });
        if (handled) {
          if (handled.suggestedTitle !== void 0) {
            this._titleController.seedProvisionalTitle(sessionChannel, handled.suggestedTitle, chatChannel);
          }
          break;
        }
        const state = this._stateManager.getSessionState(channel);
        if (!state) {
          this._logService.info(`[AgentSideEffects] Turn started for session not in state manager: ${channel}, turnId=${action.turnId} - status/summary updates may be dropped unless the session is restored`);
        }
        this._titleController.seedTitleFromFirstMessage(sessionChannel, action.message.text, chatChannel);
        this._options.onUserMessage?.(sessionChannel, action.message.text);
        const agent = this._options.getAgent(sessionChannel);
        if (!agent) {
          this._stateManager.dispatchServerAction(channel, {
            type: ActionType.ChatError,
            turnId: action.turnId,
            duration: this._turnDuration(turnStopWatch),
            error: { errorType: "noAgent", message: "No agent found for session" }
          });
          return;
        }
        const attachments = action.message.attachments;
        this._telemetryReporter.userMessageSent(agent.id, clientId, clientContext, channel, action.turnId, state, "direct", attachments);
        const { model, modelTelemetryKind, permissionLevel, interactionMode } = this._getTurnTelemetryContext(agent, state, action.message.model?.id);
        this._turnTracker.turnStarted(agent.id, channel, action.turnId, model, modelTelemetryKind, permissionLevel, interactionMode, clientContext);
        void this._sendTurnMessage({
          agent,
          sessionChannel,
          turnChannel: channel,
          chat: channel,
          message: action.message,
          turnId: action.turnId,
          senderClientId: clientId,
          clientContext,
          turnStopWatch
        });
        break;
      }
      case ActionType.ChatToolCallConfirmed: {
        const approvalLog = this._options.diagnosticsLog;
        if (approvalLog) {
          const type = action.approved ? "APPROVAL.APPROVED" : "APPROVAL.DENIED";
          approvalLog.record("timeline", type, { ref: approvalLog.record("tools", type, action, { session: channel, turn: action.turnId }), toolCallId: action.toolCallId }, { session: channel, turn: action.turnId });
        }
        if (!chatChannel) {
          throw new Error(`ChatToolCallConfirmed must be handled on an AHP chat channel: ${channel}`);
        }
        const toolCallKey = `${channel}:${action.toolCallId}`;
        if (action.approved) {
          this._toolCallTracker.toolCallExecutionStarted(channel, action.toolCallId);
        } else {
          this._turnTracker.toolCallEnded(channel, action.turnId, action.toolCallId);
        }
        const managedApprovalRequired = this._managedApprovalToolCalls.delete(toolCallKey);
        const agentId = this._toolCallAgents.get(toolCallKey);
        if (agentId) {
          this._toolCallAgents.delete(toolCallKey);
          const agent = this._options.agents.get().find((a) => a.id === agentId);
          agent?.respondToPermissionRequest(action.toolCallId, action.approved);
        } else {
          this._logService.warn(`[AgentSideEffects] No agent for tool call confirmation: ${action.toolCallId}`);
        }
        if (action.approved && !managedApprovalRequired) {
          this._permissionManager.handleToolCallConfirmed(channel, action.toolCallId, action.selectedOptionId);
        }
        break;
      }
      case ActionType.ChatInputCompleted: {
        if (!chatChannel) {
          throw new Error(`ChatInputCompleted must be handled on an AHP chat channel: ${channel}`);
        }
        const agent = this._options.getAgent(sessionChannel);
        agent?.respondToUserInputRequest(action.requestId, action.response, action.answers);
        break;
      }
      case ActionType.ChatTurnCancelled: {
        if (!chatChannel) {
          throw new Error(`ChatTurnCancelled must be handled on an AHP chat channel: ${channel}`);
        }
        this._completeTurn(channel, action.turnId, "cancelled");
        this._toolCallTracker.clearSession(channel);
        void this._checkpointService.discardTurnStartCheckpoint(URI.parse(sessionChannel), URI.parse(channel), action.turnId).catch(() => void 0);
        this.cancelSubagentSessions(channel);
        const agent = this._options.getAgent(sessionChannel);
        if (agent) {
          const chat = URI.parse(channel);
          const session = parseRequiredSessionUriFromChatUri(channel);
          agent.chats.abort(chat, { ...this._chatContext(session, channel), clientTelemetryContext: clientContext }).catch((err) => {
            this._logService.error("[AgentSideEffects] abort failed", err);
          });
        }
        break;
      }
      case ActionType.SessionTitleChanged: {
        if (chatChannel) {
          this._stateManager.updateChatTitle(sessionChannel, chatChannel, action.title);
          this._persistSessionFlag(sessionChannel, customChatTitleMetadataKey(chatChannel), action.title);
          this._persistSessionFlag(sessionChannel, customChatTitleSourceMetadataKey(chatChannel), AGENT_HOST_TITLE_SOURCE_USER);
          this._titleController.markTitleRenamed(sessionChannel, chatChannel);
          break;
        }
        this._persistSessionFlag(channel, SESSION_CUSTOM_TITLE_KEY, action.title);
        this._persistSessionFlag(channel, SESSION_CUSTOM_TITLE_SOURCE_KEY, AGENT_HOST_TITLE_SOURCE_USER);
        this._titleController.markTitleRenamed(channel);
        break;
      }
      case ActionType.ChatPendingMessageSet: {
        if (!chatChannel) {
          throw new Error(`${action.type} must be handled on an AHP chat channel: ${channel}`);
        }
        const queuedMessageExists = this._stateManager.getChatState(channel)?.queuedMessages?.some((message) => message.id === action.id) === true;
        if (action.kind === PendingMessageKind.Queued && queuedMessageExists) {
          this._queuedMessageSenders.set({ clientId, clientContext }, channel, action.id);
        }
        this._syncPendingMessages(channel);
        break;
      }
      case ActionType.ChatPendingMessageRemoved: {
        if (!chatChannel) {
          throw new Error(`${action.type} must be handled on an AHP chat channel: ${channel}`);
        }
        if (action.kind === PendingMessageKind.Queued) {
          this._queuedMessageSenders.delete(channel, action.id);
        }
        this._syncPendingMessages(channel);
        break;
      }
      case ActionType.ChatQueuedMessagesReordered: {
        if (!chatChannel) {
          throw new Error(`${action.type} must be handled on an AHP chat channel: ${channel}`);
        }
        this._syncPendingMessages(channel);
        break;
      }
      case ActionType.ChatTruncated: {
        if (!chatChannel) {
          throw new Error(`ChatTruncated must be handled on an AHP chat channel: ${channel}`);
        }
        void this._checkpointService.discardChatTurnStartCheckpoints(URI.parse(sessionChannel), URI.parse(chatChannel)).catch(() => void 0);
        const agent = this._options.getAgent(sessionChannel);
        const sdkTurnId = action.turnId !== void 0 ? this._options.localTurns.resolveConcreteTurnId(chatChannel, action.turnId) : action.turnId;
        agent?.truncateChat?.(URI.parse(chatChannel), sdkTurnId, this._chatContext(sessionChannel, chatChannel)).catch((err) => {
          this._logService.error("[AgentSideEffects] truncateChat failed", err);
        });
        const survivingIds = new Set((this._stateManager.getChatState(chatChannel)?.turns ?? []).map((t) => t.id));
        const removed = this._options.localTurns.getLocalTurnIds(chatChannel).filter((id) => !survivingIds.has(id));
        this._options.localTurns.deleteLocals(sessionChannel, removed);
        const trackedTurnIds = new Set(survivingIds);
        const activeTurnId = this._stateManager.getActiveTurnId(chatChannel);
        if (activeTurnId) {
          trackedTurnIds.add(activeTurnId);
        }
        this._turnTracker.clearTurnsExcept(chatChannel, trackedTurnIds);
        this._changesets.onSessionTruncated(sessionChannel);
        break;
      }
      case ActionType.SessionActiveClientSet: {
        this._fanOutActiveClient(channel, action.activeClient);
        break;
      }
      case ActionType.SessionActiveClientRemoved: {
        const agent = this._options.getAgent(channel);
        for (const chat of getSessionChatsForFanOut(this._stateManager, channel) ?? []) {
          agent?.removeActiveClient(chat, this._chatContext(channel, chat.toString()), action.clientId);
        }
        break;
      }
      case ActionType.RootConfigChanged: {
        updateAgentHostTelemetryLevelFromConfig(this._telemetryService, action.config);
        this._publishAgentInfos(this._options.agents.get());
        this._publishAllSessionCustomizations();
        break;
      }
      case ActionType.SessionMcpServerStartRequested: {
        const agent = this._options.getAgent(sessionChannel);
        agent?.startMcpServer?.(URI.parse(sessionChannel), action.id).catch((err) => {
          this._logService.warn(`[AgentSideEffects] startMcpServer failed for ${sessionChannel}`, err);
        });
        break;
      }
      case ActionType.SessionMcpServerStopRequested: {
        const agent = this._options.getAgent(sessionChannel);
        agent?.stopMcpServer?.(URI.parse(sessionChannel), action.id).catch((err) => {
          this._logService.warn(`[AgentSideEffects] stopMcpServer failed for ${sessionChannel}`, err);
        });
        break;
      }
      case ActionType.SessionIsArchivedChanged: {
        if (this._worktree) {
          const sessionUri = URI.parse(channel);
          const sessionId = AgentSession.id(channel);
          const worktreeOp = action.isArchived ? this._worktree.cleanupWorktreeOnArchive(sessionUri, sessionId) : this._worktree.recreateWorktreeOnUnarchive(sessionUri, sessionId);
          worktreeOp.catch((err) => this._logService.warn(`[AgentSideEffects] worktree ${action.isArchived ? "cleanup" : "recreate"} failed for ${channel}`, err));
        }
        const agent = this._options.getAgent(channel);
        agent?.onArchivedChanged?.(URI.parse(channel), action.isArchived).catch((err) => {
          this._logService.warn(`[AgentSideEffects] onArchivedChanged failed for ${channel}`, err);
        });
        break;
      }
      case ActionType.SessionConfigChanged: {
        const sessionState = this._stateManager.getSessionState(channel);
        const values = sessionState?.config?.values;
        if (this._worktree && sessionState?.lifecycle === SessionLifecycle.Creating) {
          const sessionId = AgentSession.id(channel);
          const isolation = values?.[SessionConfigKey.Isolation];
          if (isolation === "worktree") {
            this._worktree.notePending(sessionId);
          } else if (isolation === "folder") {
            this._worktree.clearPending(sessionId);
          }
        }
        break;
      }
      case ActionType.ChatToolCallComplete: {
        if (!chatChannel) {
          break;
        }
        this._notifyClientToolCallComplete(sessionChannel, chatChannel, action.toolCallId, action.result, "client-dispatch");
        break;
      }
    }
  }
  /** Injects the host-owned worktree isolation controller (see {@link AgentService.setWorktreeIsolation}). */
  setWorktreeIsolation(worktree) {
    this._worktree = worktree;
  }
  _recordCustomizationEnablement(session, candidate, enablement) {
    const target = candidate.customization.type === CustomizationType.Plugin ? targetForPlugin(candidate.customization) : targetForMcpServer(candidate.customization, candidate.owningPluginUri, false);
    this._customizationEnablementService.replaceEnablement(session, target, enablement);
  }
  cancelSessionTitleGeneration(session) {
    this._titleController.cancelTitleGeneration(session);
  }
  clearSessionTitleState(session, chats) {
    this._titleController.clearSession(session, chats);
  }
  clearQueuedMessageSenders(chat) {
    this._queuedMessageSenders.deleteAll(chat);
  }
  /**
   * Generates a content-derived title for a freshly forked session
   * (`chatChannel` undefined) or peer chat from its inherited chat
   * turns, replacing the placeholder `Forked: …` title once ready.
   */
  generateForkedTitle(channel, chatChannel, turns, fallbackTitle, sourceTitle) {
    this._titleController.generateForkedTitle(channel, chatChannel, turns, fallbackTitle, sourceTitle);
  }
  markTitleAuto(channel, chatChannel, title) {
    this._titleController.markTitleAuto(channel, chatChannel, title);
  }
  markTitleRenamed(channel, chatChannel) {
    this._titleController.markTitleRenamed(channel, chatChannel);
  }
  /**
   * Persists a session metadata key/value pair to the session database.
   * Used for fields the host needs to remember across restarts (custom
   * title, isRead/isArchived flags, merged config values).
   */
  _persistSessionFlag(session, key, value) {
    persistSessionMetadata(this._options.sessionDataService, this._logService, session, key, value);
  }
  /**
   * Persists the usage reported for a chat's turn.
   *
   * Agent backends do not durably record token/credit usage themselves (the
   * Copilot SDK's `assistant.usage` event is explicitly ephemeral, and the
   * Claude transcript replay produces none), so a restored session would
   * otherwise come back with no context-usage gauge and a session cost of 0.
   * See `AgentService._applyPersistedTurnUsage` for which providers can
   * currently match these rows back on restore.
   *
   * Written on every report rather than buffered until the turn ends: the row
   * is keyed by turn id and written with `INSERT OR REPLACE` through a
   * sequencer, so "last report wins" is already a property of the storage
   * layer, and persisting eagerly means a turn cut short by a crash or
   * disconnect keeps the usage it had already accrued.
   *
   * Subagent chats are skipped: their cost is already folded into the parent
   * turn's aggregate, so recording it again would double-count.
   */
  _trackTurnUsage(channel, action) {
    if (action.type !== ActionType.ChatUsage || isSubagentChatUri(channel)) {
      return;
    }
    if (!action.turnId) {
      return;
    }
    const storage = chatStorageUri(channel);
    if (!storage) {
      return;
    }
    let ref;
    try {
      ref = this._options.sessionDataService.openDatabase(storage);
    } catch (err) {
      this._logService.warn(`[AgentSideEffects] Failed to open database to persist turn usage for ${channel}`, err);
      return;
    }
    ref.object.setTurnUsage(action.turnId, JSON.stringify(action.usage)).catch((err) => {
      this._logService.warn(`[AgentSideEffects] Failed to persist turn usage for ${channel}/${action.turnId}`, err);
    }).finally(() => ref.dispose());
  }
  _persistChatDraft(channel, draft) {
    if (!isAhpChatChannel(channel)) {
      return;
    }
    const parsed = parseChatUri(channel);
    if (!parsed) {
      return;
    }
    const session = URI.parse(parsed.session);
    const ref = this._options.sessionDataService.openDatabase(session);
    ref.object.setChatDraft(URI.parse(channel), draft).catch((err) => {
      this._logService.warn(`[AgentSideEffects] Failed to persist chat draft for ${channel.toString()}`, err);
    }).finally(() => {
      ref.dispose();
    });
  }
  /**
   * Pushes the current pending message state from the chat to the agent.
   * The server controls queued message consumption; only steering messages
   * are forwarded to the agent for mid-turn injection.
   */
  _syncPendingMessages(chatChannel) {
    const sessionChannel = parseRequiredSessionUriFromChatUri(chatChannel);
    const state = this._stateManager.getSessionState(chatChannel);
    if (!state) {
      return;
    }
    const agent = this._options.getAgent(sessionChannel);
    agent?.setPendingMessages?.(
      URI.parse(chatChannel),
      state.steeringMessage,
      []
    );
    this._tryConsumeNextQueuedMessage(chatChannel);
  }
  /**
   * Consumes the next queued message by dispatching a server-initiated
   * `ChatTurnStarted` action with `queuedMessageId` set. The reducer
   * atomically creates the active turn and removes the message from the
   * queue. Only consumes one message at a time; subsequent messages are
   * consumed when the next `idle` event fires.
   */
  _tryConsumeNextQueuedMessage(session) {
    const sessionChannel = parseRequiredSessionUriFromChatUri(session);
    if (this._stateManager.getActiveTurnId(session)) {
      return;
    }
    const state = this._stateManager.getSessionState(session);
    if (!state?.queuedMessages?.length || state.steeringMessage) {
      return;
    }
    const msg = state.queuedMessages[0];
    const sender = this._queuedMessageSenders.get(session, msg.id) ?? {
      clientId: void 0,
      clientContext: {
        ...createUnknownAgentHostClientTelemetryContext(AgentHostClientType.Unknown),
        hostLaunchKind: this._options.hostLaunchKind ?? AgentHostLaunchKind.Unknown
      }
    };
    this._queuedMessageSenders.delete(session, msg.id);
    const turnId = generateUuid();
    this._stateManager.dispatchServerAction(session, {
      type: ActionType.ChatTurnStarted,
      turnId,
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      message: msg.message,
      queuedMessageId: msg.id
    });
    const turnStopWatch = StopWatch.create(false);
    const handled = this._localCommands.tryHandle({ turnChannel: session, turnId, text: msg.message.text });
    if (handled) {
      if (handled.suggestedTitle !== void 0) {
        this._titleController.seedProvisionalTitle(sessionChannel, handled.suggestedTitle, session);
      }
      return;
    }
    this._titleController.seedTitleFromFirstMessage(sessionChannel, msg.message.text, session);
    const agent = this._options.getAgent(sessionChannel);
    if (!agent) {
      this._stateManager.dispatchServerAction(session, {
        type: ActionType.ChatError,
        turnId,
        duration: this._turnDuration(turnStopWatch),
        error: { errorType: "noAgent", message: "No agent found for session" }
      });
      return;
    }
    const attachments = msg.message.attachments;
    const queuedState = this._stateManager.getSessionState(session);
    this._telemetryReporter.userMessageSent(agent.id, sender.clientId, sender.clientContext, session, turnId, queuedState, "queued", attachments);
    const { model, modelTelemetryKind, permissionLevel, interactionMode } = this._getTurnTelemetryContext(agent, queuedState, msg.message.model?.id);
    this._turnTracker.turnStarted(agent.id, session, turnId, model, modelTelemetryKind, permissionLevel, interactionMode, sender.clientContext);
    void this._sendTurnMessage({
      agent,
      sessionChannel,
      turnChannel: session,
      chat: session,
      message: msg.message,
      turnId,
      senderClientId: sender.clientId,
      clientContext: sender.clientContext,
      turnStopWatch
    });
  }
  _getTurnTelemetryContext(agent, state, modelId) {
    const permissionValue = state?.config?.values[SessionConfigKey.AutoApprove];
    const permissionLevel = typeof permissionValue === "string" ? permissionValue : void 0;
    const interactionMode = getConfiguredSessionMode(state?.config);
    const modelContext = modelId === void 0 ? { model: void 0, modelTelemetryKind: void 0 } : this._getModelTelemetryContext(agent, modelId);
    return { ...modelContext, permissionLevel, interactionMode };
  }
  _getModelTelemetryContext(agent, modelId) {
    const model = agent.models.get().find((model2) => model2.id === modelId);
    let modelTelemetryKind;
    if (modelId === "auto") {
      modelTelemetryKind = "trusted";
    } else if (model === void 0) {
      modelTelemetryKind = "unknown";
    } else {
      modelTelemetryKind = readAgentModelByokIdentifier(model) === void 0 ? "trusted" : "byok";
    }
    return { model: modelId, modelTelemetryKind };
  }
  /**
   * Applies a turn message's model/agent selection (see
   * {@link _applyMessageSelection}) and forwards it to the agent's
   * `sendMessage`. A rejected send is wired to fail the turn: it logs,
   * dispatches {@link ActionType.ChatError} on the turn channel, and marks the
   * turn errored.
   */
  async _sendTurnMessage(options) {
    const { agent, sessionChannel, turnChannel, chat, message, turnId, senderClientId, clientContext, turnStopWatch } = options;
    const chatState = this._stateManager.getChatState(chat);
    const sessionStatus = this._stateManager.getSessionSummary(options.sessionChannel)?.status ?? 0;
    const sessionArchived = (sessionStatus & SessionStatus.IsArchived) === SessionStatus.IsArchived;
    if (isChatReadOnly(chatState?.interactivity, sessionArchived)) {
      const error = sessionArchived ? { errorType: "archived", message: "This session is archived and read-only. Restore the session to continue the conversation." } : { errorType: "readOnly", message: "This chat is read-only." };
      this._logService.warn(`[AgentSideEffects] Rejecting turn on read-only chat=${chat} (archived=${sessionArchived}), turnId=${turnId}`);
      this._stateManager.dispatchServerAction(turnChannel, {
        type: ActionType.ChatError,
        turnId,
        duration: this._turnDuration(turnStopWatch),
        error
      });
      this._completeTurn(turnChannel, turnId, "error", { stage: "validation", error });
      this._toolCallTracker.clearSession(turnChannel);
      return;
    }
    const chatUri = URI.parse(chat);
    let failureStage = "workingDirectory";
    try {
      const resolvedWorkingDirectories = await this._options.resolveWorkingDirectoryBeforeSend?.({ session: options.sessionChannel, chat, turnId, prompt: message.text });
      const chatContext = this._chatContext(options.sessionChannel, chat);
      const clientOperationContext = { ...chatContext, clientTelemetryContext: clientContext };
      const selectionUpdates = [];
      if (message.model) {
        failureStage = "modelSelection";
        selectionUpdates.push(agent.chats.changeModel(chatUri, message.model, clientOperationContext));
      }
      selectionUpdates.push(agent.chats.changeAgent(chatUri, message.agent, clientOperationContext).catch((err) => {
        this._logService.error("[AgentSideEffects] changeAgent failed", err);
      }));
      await Promise.all(selectionUpdates);
      failureStage = "sendMessage";
      const resolvedAttachments = await this._resolveChatAttachments(message.attachments);
      const renameInstruction = await this._titleController.prepareInstructionForAgent(sessionChannel, chat);
      const hostInstructions = [
        ...this._agentConfigService.getRootValue(platformRootSchema, AgentHostMarkdownPlanRichLinksEnabledConfigKey) ? [createMarkdownPlanRichLinksInstruction(chat)] : [],
        ...renameInstruction ? [renameInstruction] : []
      ];
      const sendContext = { ...clientOperationContext, ...hostInstructions.length ? { hostInstructions } : {} };
      if (this._cancelledTurnIds.get(turnChannel)?.has(turnId)) {
        return;
      }
      await this._checkpointService.captureTurnStartCheckpoint(URI.parse(sessionChannel), chatUri, turnId, resolvedWorkingDirectories);
      if (this._cancelledTurnIds.get(turnChannel)?.has(turnId)) {
        await this._checkpointService.discardTurnStartCheckpoint(URI.parse(sessionChannel), chatUri, turnId);
        return;
      }
      await agent.chats.sendMessage(chatUri, message.text, resolvedWorkingDirectories, resolvedAttachments, turnId, senderClientId, clientContext.clientType, sendContext);
    } catch (err) {
      const failure = buildTurnFailure(failureStage, err);
      const error = failure.error;
      this._logService.error(`[AgentSideEffects] ${failureStage} failed for session=${turnChannel}: code=${failure.errorCode}, message=${error.message}, type=${failure.errorName}`, err);
      this._stateManager.dispatchServerAction(turnChannel, {
        type: ActionType.ChatError,
        turnId,
        duration: this._turnDuration(turnStopWatch),
        error
      });
      this._completeTurn(turnChannel, turnId, "error", failure);
      this._toolCallTracker.clearSession(turnChannel);
      this._failSessionCreationIfStillCreating(sessionChannel, error);
    }
  }
  async _resolveChatAttachments(attachments) {
    if (!attachments?.some((attachment) => attachment.type === MessageAttachmentKind.Chat)) {
      return attachments;
    }
    return Promise.all(attachments.map(async (attachment) => {
      if (attachment.type !== MessageAttachmentKind.Chat) {
        return attachment;
      }
      const openLink = buildOpenSessionLinkForChatResource(attachment.resource);
      const sourceTurns = await this._resolveChatAttachmentSourceTurns(attachment.resource);
      if (sourceTurns === void 0) {
        return resolveChatAttachment({ ...attachment, endTurn: void 0 }, [], openLink);
      }
      const sourceState = resolveChatStateForUri(this._stateManager, attachment.resource);
      if (attachment.endTurn !== void 0 && sourceState?.activeTurn?.id === attachment.endTurn) {
        throw new Error(`Chat attachment endTurn must reference a completed turn: ${attachment.resource}#${attachment.endTurn}`);
      }
      return resolveChatAttachment(attachment, sourceTurns, openLink);
    }));
  }
  /**
   * Resolves the referenced chat's turns, returning `undefined` when the source
   * is unresolvable — e.g. a cross-session reference to a chat this host never
   * subscribed to and cannot restore (the resolver throws
   * `ProtocolError(AHP_SESSION_NOT_FOUND)` when no provider owns it or the
   * backend no longer has it). Such failures are logged rather than rethrown so
   * a stale reference degrades gracefully instead of failing the user's turn.
   */
  async _resolveChatAttachmentSourceTurns(resource) {
    try {
      if (this._options.resolveChatAttachmentTurns) {
        return await this._options.resolveChatAttachmentTurns(resource);
      }
      return resolveChatStateForUri(this._stateManager, resource)?.turns ?? [];
    } catch (err) {
      this._logService.warn(`[AgentSideEffects] Unable to resolve chat attachment source ${resource}; degrading to a pointer without an excerpt`, err);
      return void 0;
    }
  }
  /**
   * Surfaces a failed first turn on a not-yet-materialized session as a
   * terminal creation failure.
   *
   * Provisional sessions defer both their root-catalog `SessionAdded`
   * notification and their `Creating -> Ready` lifecycle transition until the
   * agent materializes them (worktree setup, SDK session init, …) on the
   * first `sendMessage`. When that first send rejects — e.g. worktree/branch
   * creation throws — the session never entered the catalog and its lifecycle
   * is stuck at `Creating`, so clients that optimistically rendered it as
   * in-progress keep spinning forever.
   *
   * When the failing session is still `Creating`, dispatch
   * {@link ActionType.SessionCreationFailed} to move it to a terminal
   * `CreationFailed` lifecycle, then announce its catalog entry via
   * {@link AgentHostStateManager.markSessionPersisted}. The summary's status
   * was already aggregated to `Error` by the preceding `ChatError` dispatch,
   * so subscribers render the session as failed immediately rather than
   * waiting on a client-side timeout. The provisional session survives on the
   * agent, so resending re-attempts materialization.
   */
  _failSessionCreationIfStillCreating(sessionChannel, error) {
    const state = this._stateManager.getSessionState(sessionChannel);
    if (state?.lifecycle !== SessionLifecycle.Creating) {
      return;
    }
    this._stateManager.dispatchServerAction(sessionChannel, {
      type: ActionType.SessionCreationFailed,
      error
    });
    const summary = this._stateManager.getSessionSummary(sessionChannel);
    if (summary) {
      this._stateManager.markSessionPersisted(sessionChannel, summary);
    }
  }
  dispose() {
    this._toolCallAgents.clear();
    this._managedApprovalToolCalls.clear();
    this._toolCallTracker.clear();
    this._inputRequestTracker.clear();
    super.dispose();
  }
};
AgentSideEffects = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IAgentHostChangesetService),
  __decorateParam(6, ITelemetryService),
  __decorateParam(7, IAgentHostCheckpointService),
  __decorateParam(8, IAgentConfigurationService)
], AgentSideEffects);
function buildTurnFailure(stage, err) {
  const error = buildTurnFailureError(stage, err);
  return {
    stage,
    error,
    errorName: err instanceof Error ? err.name : typeof err,
    errorCode: getErrorCode(err),
    errorStack: err instanceof Error ? err.stack : void 0
  };
}
function buildTurnFailureError(stage, err) {
  const message = String(err);
  const forwarded = tryParseForwardedChatError(err instanceof Error ? err.message : message);
  const errorType = stage === "modelSelection" ? "modelSelectionFailed" : stage === "workingDirectory" ? "workingDirectoryFailed" : "sendFailed";
  if (forwarded) {
    return { errorType, message: stripProxyErrorMarker(message), _meta: toChatErrorMeta(forwarded) };
  }
  return { errorType, message };
}
export {
  AgentSideEffects
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxhZ2VudFNpZGVFZmZlY3RzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZ2V0RXJyb3JDb2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB0eXBlIHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE5LZXlNYXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBJT2JzZXJ2YWJsZSwgSVJlYWRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IGhhc0tleSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RDaGVja3BvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RBY3RpdmVBZ2VudFRpdGxlR2VuZXJhdGlvbkNvbmZpZ0tleSwgQWdlbnRIb3N0TWFya2Rvd25QbGFuUmljaExpbmtzRW5hYmxlZENvbmZpZ0tleSwgcGxhdGZvcm1Sb290U2NoZW1hLCB0eXBlIFNlc3Npb25Nb2RlIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdFNjaGVtYS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDbGllbnRUeXBlIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdENsaWVudEluZm8uanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0TGF1bmNoS2luZCwgY3JlYXRlVW5rbm93bkFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQsIHR5cGUgSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0VGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IHJlYWRBZ2VudE1vZGVsQnlva0lkZW50aWZpZXIgfSBmcm9tICcuLi9jb21tb24vYWdlbnRNb2RlbEJ5b2tNZXRhLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbiwgQWdlbnRTaWduYWwsIElBZ2VudCwgSUFnZW50Q2hhdENvbnRleHQsIElBZ2VudFRvb2xQZW5kaW5nQ29uZmlybWF0aW9uU2lnbmFsIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB7IHJlYWRUb29sQ2FsbE1ldGEsIHRvVG9vbENhbGxNZXRhIH0gZnJvbSAnLi4vY29tbW9uL21ldGEvYWdlbnRUb29sQ2FsbE1ldGEuanMnO1xuaW1wb3J0IHsgcmVhZENvZGV4UmVhc29uaW5nS2luZCB9IGZyb20gJy4uL2NvbW1vbi9tZXRhL2NvZGV4UmVhc29uaW5nTWV0YS5qcyc7XG5cbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25EYXRhYmFzZSwgSVNlc3Npb25EYXRhU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uRGF0YVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkNvbmZpZ0tleSB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5pbXBvcnQgeyByZXNvbHZlQ2hhdEF0dGFjaG1lbnQgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvY2hhdEF0dGFjaG1lbnRDb250ZXh0LmpzJztcbmltcG9ydCB7IGJ1aWxkT3BlblNlc3Npb25MaW5rRm9yQ2hhdFJlc291cmNlIH0gZnJvbSAnLi4vY29tbW9uL29wZW5TZXNzaW9uTGluay5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZCwgVG9vbENhbGxDb250cmlidXRvcktpbmQsIHR5cGUgQWdlbnRJbmZvLCB0eXBlIFNlc3Npb25BY3RpdmVDbGllbnQsIHR5cGUgU2Vzc2lvbklucHV0UmVxdWVzdCB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgdHlwZSB7IEN1c3RvbWl6YXRpb25FbmFibGVtZW50IH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NoYW5uZWxzLXNlc3Npb24vc3RhdGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgaXNDaGF0QWN0aW9uLCBTdGF0ZUFjdGlvbiwgdHlwZSBDaGF0QWN0aW9uLCB0eXBlIENoYXRUb29sQ2FsbENvbXBsZXRlQWN0aW9uIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7XG5cdGJ1aWxkU3ViYWdlbnRDaGF0VXJpLFxuXHRjaGF0U3RvcmFnZVVyaSxcblx0Z2V0VG9vbEZpbGVFZGl0cyxcblx0Z2V0SW5saW5lVG9vbElucHV0LFxuXHRpc0FocENoYXRDaGFubmVsLFxuXHRpc0RlZmF1bHRDaGF0VXJpLFxuXHRidWlsZERlZmF1bHRDaGF0VXJpLFxuXHRpc1N1YmFnZW50Q2hhdFVyaSxcblx0aXNDaGF0UmVhZE9ubHksXG5cdEFIX01FVEFfSVNfQVJDSElWRURfREJfS0VZLFxuXHRBSF9NRVRBX0lTX1JFQURfREJfS0VZLFxuXHRNZXNzYWdlQXR0YWNobWVudEtpbmQsXG5cdE1lc3NhZ2VLaW5kLFxuXHRwYXJzZUNoYXRVcmksXG5cdHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmksXG5cdFBlbmRpbmdNZXNzYWdlS2luZCxcblx0UmVzcG9uc2VQYXJ0S2luZCxcblx0Uk9PVF9TVEFURV9VUkksXG5cdFNlc3Npb25MaWZlY3ljbGUsXG5cdFNlc3Npb25TdGF0dXMsXG5cdEN1c3RvbWl6YXRpb25UeXBlLFxuXHRUb29sQ2FsbFN0YXR1cyxcblx0VG9vbFJlc3VsdENvbnRlbnRUeXBlLFxuXHR0eXBlIEVycm9ySW5mbyxcblx0dHlwZSBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCxcblx0dHlwZSBNZXNzYWdlLFxuXHR0eXBlIE1lc3NhZ2VBdHRhY2htZW50LFxuXHR0eXBlIFVSSSBhcyBQcm90b2NvbFVSSSxcblx0dHlwZSBTZXNzaW9uU3RhdGUsXG5cdHR5cGUgVG9vbENhbGxTdGF0ZSxcblx0dHlwZSBUb29sQ2FsbFJlc3VsdCxcblx0dHlwZSBUb29sUmVzdWx0Q29udGVudCxcblx0dHlwZSBUdXJuLFxuXHR0eXBlIEN1c3RvbWl6YXRpb24sXG5cdHR5cGUgTWNwU2VydmVyQ3VzdG9taXphdGlvbixcblx0dHlwZSBQbHVnaW5DdXN0b21pemF0aW9uXG59IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0TG9jYWxUdXJucyB9IGZyb20gJy4vYWdlbnRIb3N0TG9jYWxUdXJucy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RJbnB1dFJlcXVlc3RUcmFja2VyIH0gZnJvbSAnLi9hZ2VudEhvc3RJbnB1dFJlcXVlc3RUcmFja2VyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFNlc3Npb25UaXRsZUNvbnRyb2xsZXIgfSBmcm9tICcuL2FnZW50SG9zdFNlc3Npb25UaXRsZUNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLCByZXNvbHZlQ2hhdFN0YXRlRm9yVXJpIH0gZnJvbSAnLi9hZ2VudEhvc3RTdGF0ZU1hbmFnZXIuanMnO1xuaW1wb3J0IHsgSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuL2FnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlQWdlbnRDaGF0Q29udGV4dCwgZ2V0U2Vzc2lvbkNoYXRzRm9yRmFuT3V0IH0gZnJvbSAnLi9hZ2VudENoYXRDb250ZXh0LmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFRlbGVtZXRyeVJlcG9ydGVyLCB0eXBlIEFnZW50SG9zdE1vZGVsVGVsZW1ldHJ5S2luZCwgdHlwZSBBZ2VudEhvc3RUdXJuRmFpbHVyZVN0YWdlLCB0eXBlIEFnZW50SG9zdFR1cm5SZXN1bHQsIHR5cGUgSUFnZW50SG9zdFR1cm5GYWlsdXJlIH0gZnJvbSAnLi9hZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RUb29sQ2FsbFRyYWNrZXIgfSBmcm9tICcuL2FnZW50SG9zdFRvb2xDYWxsVHJhY2tlci5qcyc7XG5pbXBvcnQgeyB1cGRhdGVBZ2VudEhvc3RUZWxlbWV0cnlMZXZlbEZyb21Db25maWcgfSBmcm9tICcuL2FnZW50SG9zdFRlbGVtZXRyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0VHVyblRyYWNrZXIgfSBmcm9tICcuL2FnZW50SG9zdFR1cm5UcmFja2VyLmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4vYWdlbnRIb3N0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdExvY2FsQ29tbWFuZHMgfSBmcm9tICcuL2xvY2FsQ29tbWFuZHMvbG9jYWxDaGF0Q29tbWFuZC5qcyc7XG5pbXBvcnQgJy4vbG9jYWxDb21tYW5kcy9sb2NhbENoYXRDb21tYW5kcy5jb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgU2Vzc2lvblBlcm1pc3Npb25NYW5hZ2VyIH0gZnJvbSAnLi9zZXNzaW9uUGVybWlzc2lvbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0T2N0b0tpdFNlcnZpY2UgfSBmcm9tICcuL3NoYXJlZC9hZ2VudEhvc3RPY3RvS2l0U2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElDb3BpbG90QXBpU2VydmljZSB9IGZyb20gJy4vc2hhcmVkL2NvcGlsb3RBcGlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHN0cmlwUHJveHlFcnJvck1hcmtlciwgdG9DaGF0RXJyb3JNZXRhLCB0cnlQYXJzZUZvcndhcmRlZENoYXRFcnJvciB9IGZyb20gJy4vc2hhcmVkL3Byb3h5Q2hhdEVycm9yLmpzJztcbmltcG9ydCB7IEFHRU5UX0hPU1RfVElUTEVfU09VUkNFX1VTRVIsIGN1c3RvbUNoYXRUaXRsZU1ldGFkYXRhS2V5LCBjdXN0b21DaGF0VGl0bGVTb3VyY2VNZXRhZGF0YUtleSwgcGVyc2lzdFNlc3Npb25NZXRhZGF0YSwgU0VTU0lPTl9DVVNUT01fVElUTEVfS0VZLCBTRVNTSU9OX0NVU1RPTV9USVRMRV9TT1VSQ0VfS0VZIH0gZnJvbSAnLi9zaGFyZWQvcGVyc2lzdFNlc3Npb25NZXRhZGF0YS5qcyc7XG5pbXBvcnQgeyB0YXJnZXRGb3JNY3BTZXJ2ZXIsIHRhcmdldEZvclBsdWdpbiB9IGZyb20gJy4vc2hhcmVkL2N1c3RvbWl6YXRpb25FbmFibGVtZW50R2F0ZS5qcyc7XG5pbXBvcnQgdHlwZSB7IFdvcmt0cmVlSXNvbGF0aW9uIH0gZnJvbSAnLi9zaGFyZWQvd29ya3RyZWVJc29sYXRpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBGb3JnZURpYWdub3N0aWNzTG9nIH0gZnJvbSAnLi9mb3JnZURpYWdub3N0aWNzTG9nLmpzJztcblxuLyoqXG4gKiBPcHRpb25zIGZvciBjb25zdHJ1Y3RpbmcgYW4ge0BsaW5rIEFnZW50U2lkZUVmZmVjdHN9IGluc3RhbmNlLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudFNpZGVFZmZlY3RzT3B0aW9ucyB7XG5cdC8qKiBSZXNvbHZlIHRoZSBhZ2VudCByZXNwb25zaWJsZSBmb3IgYSBnaXZlbiBzZXNzaW9uIFVSSS4gKi9cblx0cmVhZG9ubHkgZ2V0QWdlbnQ6IChzZXNzaW9uOiBQcm90b2NvbFVSSSkgPT4gSUFnZW50IHwgdW5kZWZpbmVkO1xuXHQvKiogT2JzZXJ2YWJsZSBzZXQgb2YgcmVnaXN0ZXJlZCBhZ2VudHMuIFRyaWdnZXJzIGByb290L2FnZW50c0NoYW5nZWRgIHdoZW4gaXQgY2hhbmdlcy4gKi9cblx0cmVhZG9ubHkgYWdlbnRzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQWdlbnRbXT47XG5cdC8qKiBTZXNzaW9uIGRhdGEgc2VydmljZSBmb3IgY2xlYW5pbmcgdXAgcGVyLXNlc3Npb24gZGF0YSBvbiBkaXNwb3NhbC4gKi9cblx0cmVhZG9ubHkgc2Vzc2lvbkRhdGFTZXJ2aWNlOiBJU2Vzc2lvbkRhdGFTZXJ2aWNlO1xuXHQvKiogUmVnaXN0cnkgdGhhdCBwZXJzaXN0cyBob3N0LWluamVjdGVkIGAvcmVuYW1lYCBhbmQgYCFjb21tYW5kYCB0dXJucy4gKi9cblx0cmVhZG9ubHkgbG9jYWxUdXJuczogQWdlbnRIb3N0TG9jYWxUdXJucztcblx0LyoqIEdldCB0aGUgR2l0SHViIHRva2VuIHVzZWQgZm9yIENvcGlsb3QgdXRpbGl0eSB0aXRsZSBnZW5lcmF0aW9uLiAqL1xuXHRyZWFkb25seSBnZXRHaXRIdWJDb3BpbG90VG9rZW4/OiAoKSA9PiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdC8qKiBHZXQgdGhlIEdpdEh1YiByZXBvc2l0b3J5IHRva2VuIHVzZWQgdG8gZmV0Y2ggaXNzdWUgYW5kIHB1bGwgcmVxdWVzdCBjb250ZXh0LiAqL1xuXHRyZWFkb25seSBnZXRHaXRIdWJUb2tlbj86ICgpID0+IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqIEdldCB0aGUgY29uZmlndXJlZCBHaXRIdWIgaG9zdCB1c2VkIHRvIHZhbGlkYXRlIGlzc3VlIGFuZCBwdWxsIHJlcXVlc3QgVVJMcy4gKi9cblx0cmVhZG9ubHkgZ2V0R2l0SHViSG9zdD86ICgpID0+IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqIEdpdEh1YiBSRVNUIGNsaWVudCB1c2VkIHRvIGZldGNoIGlzc3VlIGFuZCBwdWxsIHJlcXVlc3QgY29udGV4dC4gKi9cblx0cmVhZG9ubHkgb2N0b0tpdFNlcnZpY2U/OiBJQWdlbnRIb3N0T2N0b0tpdFNlcnZpY2U7XG5cdC8qKiBDQVBJIHNlcnZpY2UgdXNlZCBmb3IgQ29waWxvdCB1dGlsaXR5IHRpdGxlIGdlbmVyYXRpb24uICovXG5cdHJlYWRvbmx5IGNvcGlsb3RBcGlTZXJ2aWNlPzogSUNvcGlsb3RBcGlTZXJ2aWNlO1xuXHQvKipcblx0ICogSG9zdC1vd25lZCB3b3JraW5nLWRpcmVjdG9yeSByZXNvbHV0aW9uIGhvb2ssIGF3YWl0ZWQgYmVmb3JlIHRoZSBhZ2VudCdzXG5cdCAqIGZpcnN0IHNlbmQgc28gdGhlIHNlc3Npb24ncyB3b3JraW5nIGRpcmVjdG9yeSAoYW4gaXNvbGF0ZWQgd29ya3RyZWUgY3JlYXRlZFxuXHQgKiBvbiB0aGUgZmlyc3Qgc2VuZCwgb3IgdGhlIHBpY2tlZCBmb2xkZXIpIGlzIHJlc29sdmVkIGJlZm9yZSB0aGUgYWdlbnRcblx0ICogbWF0ZXJpYWxpemVzIGFuZCBpdHMgY3dkIGlzIGxvY2tlZC4gUmVzb2x2ZXMgdG8gdGhlIHdvcmtpbmcgZGlyZWN0b3JpZXMgdG9cblx0ICogaGFuZCB0aGUgYWdlbnQgKGluZGV4IDAgPSBwcm9jZXNzIHJvb3QpLCBvciBgdW5kZWZpbmVkYCBmb3Igd29ya3NwYWNlLWxlc3Ncblx0ICogc2Vzc2lvbnMuIFByb3ZpZGVkIGJ5IHtAbGluayBBZ2VudFNlcnZpY2V9LlxuXHQgKi9cblx0cmVhZG9ubHkgcmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnlCZWZvcmVTZW5kPzogKHBhcmFtczogeyBzZXNzaW9uOiBQcm90b2NvbFVSSTsgY2hhdDogUHJvdG9jb2xVUkk7IHR1cm5JZDogc3RyaW5nOyBwcm9tcHQ6IHN0cmluZyB9KSA9PiBQcm9taXNlPHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkPjtcblx0LyoqIFJlc29sdmVzIGEgcmVmZXJlbmNlZCBjaGF0J3MgdHVybnMsIGh5ZHJhdGluZyBpdHMgb3duaW5nIHNlc3Npb24gd2hlbiBuZWVkZWQuICovXG5cdHJlYWRvbmx5IHJlc29sdmVDaGF0QXR0YWNobWVudFR1cm5zPzogKHJlc291cmNlOiBQcm90b2NvbFVSSSkgPT4gUHJvbWlzZTxyZWFkb25seSBUdXJuW10+O1xuXHQvKipcblx0ICogQ2FsbGVkIGFmdGVyIGVhY2ggdG9wLWxldmVsIHNlc3Npb24gdHVybiBjb21wbGV0ZXMgc28gZ2l0IHN0YXRlIGNhbiBiZVxuXHQgKiByZWZyZXNoZWQgYW5kIHB1Ymxpc2hlZCB2aWEgYFNlc3Npb25NZXRhQ2hhbmdlZGAuIFN1YmFnZW50IHR1cm5zIGFyZVxuXHQgKiBleGNsdWRlZCBcdTIwMTQgb25seSB0aGUgcGFyZW50IHNlc3Npb24gVVJJIGlzIHBhc3NlZC5cblx0ICovXG5cdHJlYWRvbmx5IG9uVHVybkNvbXBsZXRlOiAoc2Vzc2lvbjogUHJvdG9jb2xVUkkpID0+IHZvaWQ7XG5cdC8qKiBDYWxsZWQgZm9yIHVzZXIgbWVzc2FnZXMgc28gdGhlIGhvc3QgY2FuIHJlY29yZCByZWZlcmVuY2VkIEdpdEh1YiB3b3JrLiAqL1xuXHRyZWFkb25seSBvblVzZXJNZXNzYWdlPzogKHNlc3Npb246IFByb3RvY29sVVJJLCB0ZXh0OiBzdHJpbmcpID0+IHZvaWQ7XG5cdC8qKiBQcm9jZXNzIGxhdW5jaGVyIHVzZWQgd2hlbiBjbGllbnQtb3JpZ2luIG1ldGFkYXRhIGlzIHVuYXZhaWxhYmxlLiAqL1xuXHRyZWFkb25seSBob3N0TGF1bmNoS2luZD86IEFnZW50SG9zdExhdW5jaEtpbmQ7XG5cdC8qKiBGb3JnZS1vd25lZCBkaWFnbm9zdGljcyBzaW5rLiBUaGlzIGlzIGFwcGxpY2F0aW9uIGluc3RydW1lbnRhdGlvbiwgbmV2ZXIgbW9kZWwgcHJvbXB0aW5nLiAqL1xuXHRyZWFkb25seSBkaWFnbm9zdGljc0xvZz86IEZvcmdlRGlhZ25vc3RpY3NMb2c7XG59XG5cbmludGVyZmFjZSBJUXVldWVkTWVzc2FnZVNlbmRlciB7XG5cdHJlYWRvbmx5IGNsaWVudElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGNsaWVudENvbnRleHQ6IElBZ2VudEhvc3RDbGllbnRUZWxlbWV0cnlDb250ZXh0O1xufVxuXG4vKiogQSBzaWduYWwgdGhhdCB3YXMgZGVmZXJyZWQgYmVjYXVzZSBpdHMgc3ViYWdlbnQgc2Vzc2lvbiBkb2VzIG5vdCBleGlzdCB5ZXQuICovXG5pbnRlcmZhY2UgSVBlbmRpbmdTdWJhZ2VudFNpZ25hbCB7XG5cdHJlYWRvbmx5IHNpZ25hbDogQWdlbnRTaWduYWw7XG5cdHJlYWRvbmx5IGFnZW50OiBJQWdlbnQ7XG59XG5cbmludGVyZmFjZSBJU3ViYWdlbnRTZXNzaW9uUmVmIHtcblx0cmVhZG9ubHkgcGFyZW50Q2hhdFVyaTogUHJvdG9jb2xVUkk7XG5cdHJlYWRvbmx5IHRvb2xDYWxsSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgc2Vzc2lvblVyaTogUHJvdG9jb2xVUkk7XG5cdHJlYWRvbmx5IGNoYXRVcmk6IFByb3RvY29sVVJJO1xuXHRyZWFkb25seSB0dXJuU3RvcFdhdGNoOiBTdG9wV2F0Y2g7XG59XG5cbmludGVyZmFjZSBJQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRDYW5kaWRhdGUge1xuXHRyZWFkb25seSBjdXN0b21pemF0aW9uOiBQbHVnaW5DdXN0b21pemF0aW9uIHwgTWNwU2VydmVyQ3VzdG9taXphdGlvbjtcblx0cmVhZG9ubHkgb3duaW5nUGx1Z2luVXJpPzogc3RyaW5nO1xufVxuXG5jb25zdCBNQVhfU1VQRVJTRURFRF9DVVNUT01JWkFUSU9OX1BVQkxJU0hfUkVUUklFUyA9IDM7XG5cbmZ1bmN0aW9uIGdldEN1c3RvbWl6YXRpb25FbmFibGVtZW50Q2FuZGlkYXRlcyhjdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdIHwgdW5kZWZpbmVkLCBtY3BTZXJ2ZXJPd25lcnM/OiBSZWFkb25seU1hcDxzdHJpbmcsIHN0cmluZz4pOiByZWFkb25seSBJQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRDYW5kaWRhdGVbXSB7XG5cdGNvbnN0IGNhbmRpZGF0ZXM6IElDdXN0b21pemF0aW9uRW5hYmxlbWVudENhbmRpZGF0ZVtdID0gW107XG5cdGZvciAoY29uc3QgY3VzdG9taXphdGlvbiBvZiBjdXN0b21pemF0aW9ucyA/PyBbXSkge1xuXHRcdGlmIChjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbikge1xuXHRcdFx0Y2FuZGlkYXRlcy5wdXNoKHsgY3VzdG9taXphdGlvbiB9KTtcblx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2YgY3VzdG9taXphdGlvbi5jaGlsZHJlbiA/PyBbXSkge1xuXHRcdFx0XHRpZiAoY2hpbGQudHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyKSB7XG5cdFx0XHRcdFx0Y2FuZGlkYXRlcy5wdXNoKHsgY3VzdG9taXphdGlvbjogY2hpbGQsIG93bmluZ1BsdWdpblVyaTogY3VzdG9taXphdGlvbi51cmkgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGN1c3RvbWl6YXRpb24udHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyKSB7XG5cdFx0XHRjYW5kaWRhdGVzLnB1c2goeyBjdXN0b21pemF0aW9uLCBvd25pbmdQbHVnaW5Vcmk6IG1jcFNlcnZlck93bmVycz8uZ2V0KGN1c3RvbWl6YXRpb24ubmFtZSkgfSk7XG5cdFx0fSBlbHNlIGlmIChjdXN0b21pemF0aW9uLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkRpcmVjdG9yeSkge1xuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBjdXN0b21pemF0aW9uLmNoaWxkcmVuID8/IFtdKSB7XG5cdFx0XHRcdGlmIChjaGlsZC50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIpIHtcblx0XHRcdFx0XHQvLyBEaXJlY3RvcnkgY29udGFpbmVycyBkbyBub3Qgb3duIGR1cmFibGUgcGx1Z2luIGtleXMuIFRoZWlyXG5cdFx0XHRcdFx0Ly8gTUNQIGNoaWxkcmVuIHRoZXJlZm9yZSB1c2UgdGhlIHVub3duZWQgYG1jcFNlcnZlcnMjPG5hbWU+YCBrZXkuXG5cdFx0XHRcdFx0Y2FuZGlkYXRlcy5wdXNoKHsgY3VzdG9taXphdGlvbjogY2hpbGQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIGNhbmRpZGF0ZXM7XG59XG5cbmZ1bmN0aW9uIGdldFNlc3Npb25Nb2RlKG1vZGU6IHVua25vd24pOiBTZXNzaW9uTW9kZSB8IHVuZGVmaW5lZCB7XG5cdHN3aXRjaCAobW9kZSkge1xuXHRcdGNhc2UgJ2ludGVyYWN0aXZlJzpcblx0XHRjYXNlICdwbGFuJzpcblx0XHRjYXNlICdhdXRvcGlsb3QnOlxuXHRcdFx0cmV0dXJuIG1vZGU7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0Q29uZmlndXJlZFNlc3Npb25Nb2RlKGNvbmZpZzogU2Vzc2lvblN0YXRlWydjb25maWcnXSk6IFNlc3Npb25Nb2RlIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdmFsdWUgPSBjb25maWc/LnZhbHVlc1tTZXNzaW9uQ29uZmlnS2V5Lk1vZGVdID8/IGNvbmZpZz8uc2NoZW1hLnByb3BlcnRpZXNbU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlXT8uZGVmYXVsdDtcblx0cmV0dXJuIGdldFNlc3Npb25Nb2RlKHZhbHVlKTtcbn1cblxudHlwZSBBZ2VudFNpZ25hbFR1cm5JZFJvdXRpbmcgPSAncHJlc2VydmUnIHwgJ3JlbWFwJztcblxuZnVuY3Rpb24gY3JlYXRlTWFya2Rvd25QbGFuUmljaExpbmtzSW5zdHJ1Y3Rpb24oY2hhdDogUHJvdG9jb2xVUkkpOiBzdHJpbmcge1xuXHRjb25zdCBjdXJyZW50Q2hhdExpbmsgPSBidWlsZE9wZW5TZXNzaW9uTGlua0ZvckNoYXRSZXNvdXJjZShjaGF0KTtcblx0cmV0dXJuIFtcblx0XHQnPHJpY2hfcGxhbl9tYXJrZG93bj4nLFxuXHRcdCdXaGVuIGNyZWF0aW5nIG9yIGVkaXRpbmcgYSBNYXJrZG93biBwbGFuIGRvY3VtZW50LCB1c2UgdGhlc2UgZm9ybWF0cyB3aGVuIHRoZSBleGFjdCB0YXJnZXQgaXMga25vd246Jyxcblx0XHQnLSBVc2UgY2Fub25pY2FsIEhUVFBTIGxpbmtzIGZvciBHaXRIdWIgaXNzdWVzIGFuZCBwdWxsIHJlcXVlc3RzLicsXG5cdFx0Jy0gVXNlIGBjb21taXQ6Ly88c2hhPmAgZm9yIGNvbW1pdHMgaW4gdGhlIGN1cnJlbnQgR2l0IHJlcG9zaXRvcnkuJyxcblx0XHQnLSBQcmVzZXJ2ZSBleGFjdCBgYWdlbnQtaG9zdC1zZXNzaW9uOi8vLi4uYCBsaW5rcyByZXR1cm5lZCBieSBzZXNzaW9uIGFuZCBjaGF0IHRvb2xzIHdoZW4gcmVmZXJyaW5nIHRvIHNlc3Npb25zLCBjaGF0cywgb3Igc3ViYWdlbnRzLiBEbyBub3QgY29uc3RydWN0IHRoZXNlIGxpbmtzIHlvdXJzZWxmLicsXG5cdFx0Li4uKGN1cnJlbnRDaGF0TGluayA/IFtgLSBMaW5rIHRvIHRoZSBjdXJyZW50IGNoYXQgYXMgW0N1cnJlbnQgY2hhdF0oJHtjdXJyZW50Q2hhdExpbmt9KS5gXSA6IFtdKSxcblx0XHQnLSBVc2UgYC0gWyBdIDpydW5uaW5nOiBEZXNjcmlwdGlvbmAgZm9yIGEgdGFzayB0aGF0IGlzIGFjdGl2ZWx5IHJ1bm5pbmcsIGAtIFsgXWAgZm9yIGEgcGVuZGluZyB0YXNrLCBhbmQgYC0gW3hdYCBmb3IgYSBjb21wbGV0ZWQgdGFzay4nLFxuXHRcdCctIEtlZXAgbGluayBsYWJlbHMgbWVhbmluZ2Z1bCBzbyB0aGUgZG9jdW1lbnQgcmVtYWlucyByZWFkYWJsZSB3aXRob3V0IHJpY2ggcmVuZGVyaW5nLicsXG5cdFx0JzwvcmljaF9wbGFuX21hcmtkb3duPicsXG5cdF0uam9pbignXFxuJyk7XG59XG5cbi8qKlxuICogU2hhcmVkIGltcGxlbWVudGF0aW9uIG9mIGFnZW50IHNpZGUtZWZmZWN0IGhhbmRsaW5nLlxuICpcbiAqIFJvdXRlcyBjbGllbnQtZGlzcGF0Y2hlZCBhY3Rpb25zIHRvIHRoZSBjb3JyZWN0IGFnZW50IGJhY2tlbmQsXG4gKiByZXN0b3JlcyBzZXNzaW9ucyBmcm9tIHByZXZpb3VzIGxpZmV0aW1lcywgaGFuZGxlcyBmaWxlc3lzdGVtXG4gKiBvcGVyYXRpb25zIChicm93c2UvZmV0Y2gvd3JpdGUpLCB0cmFja3MgcGVuZGluZyBwZXJtaXNzaW9uIHJlcXVlc3RzLFxuICogYW5kIHdpcmVzIHVwIGFnZW50IHByb2dyZXNzIGV2ZW50cyB0byB0aGUgc3RhdGUgbWFuYWdlci5cbiAqXG4gKiBTZXNzaW9uIGNyZWF0ZS9kaXNwb3NlL2xpc3QgYW5kIGF1dGggYXJlIGhhbmRsZWQgYnkge0BsaW5rIEFnZW50U2VydmljZX0uXG4gKi9cbmV4cG9ydCBjbGFzcyBBZ2VudFNpZGVFZmZlY3RzIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0LyoqIE1hcHMgdG9vbCBjYWxsIElEcyB0byB0aGUgYWdlbnQgdGhhdCBvd25zIHRoZW0sIGZvciByb3V0aW5nIGNvbmZpcm1hdGlvbnMuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xDYWxsQWdlbnRzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0LyoqIE1hbmFnZWQgY29uZmlybWF0aW9ucyBhcmUgaHVtYW4tb25seSBhbmQgbXVzdCBuZXZlciBzZWVkIGhvc3Qtc2lkZSBzZXNzaW9uIHBlcm1pc3Npb25zLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tYW5hZ2VkQXBwcm92YWxUb29sQ2FsbHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSBfbGFzdEFnZW50SW5mb3M6IHJlYWRvbmx5IEFnZW50SW5mb1tdID0gW107XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcGVybWlzc2lvbk1hbmFnZXI6IFNlc3Npb25QZXJtaXNzaW9uTWFuYWdlcjtcblxuXHQvKiogUmVnaXN0cnktZHJpdmVuIGRpc3BhdGNoZXIgZm9yIGhvc3QtaGFuZGxlZCBgL3JlbmFtZWAgLyBgIWNvbW1hbmRgIGV0Yy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbG9jYWxDb21tYW5kczogQWdlbnRIb3N0TG9jYWxDb21tYW5kcztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdWJhZ2VudENoYXRzID0gbmV3IE5LZXlNYXA8SVN1YmFnZW50U2Vzc2lvblJlZiwgW1Byb3RvY29sVVJJLCBzdHJpbmddPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jYW5jZWxsZWRUdXJuSWRzID0gbmV3IE1hcDxQcm90b2NvbFVSSSwgU2V0PHN0cmluZz4+KCk7XG5cdC8qKiBTZXJpYWxpemVzIHJlZnJlc2hlcyBwZXIgc2Vzc2lvbiBzbyBzdGF0ZS1iYXNlZCBkZWR1cGxpY2F0aW9uIG9ic2VydmVzIHRoZSBwcmVjZWRpbmcgZGlzcGF0Y2guICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdTZXNzaW9uQ3VzdG9taXphdGlvblB1Ymxpc2hlcyA9IG5ldyBNYXA8UHJvdG9jb2xVUkksIFByb21pc2U8dm9pZD4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdDdXN0b21pemF0aW9uRW5hYmxlbWVudFJlZnJlc2hlcyA9IG5ldyBTZXQ8UHJvdG9jb2xVUkk+KCk7XG5cdC8qKiBMYXN0IGN1bXVsYXRpdmUgdG9vbCBvdXRwdXQsIHVzZWQgdG8gbG9nIG9ubHkgbmV3bHkgc3RyZWFtZWQgdGV4dC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZGlhZ25vc3RpY1Rvb2xPdXRwdXQgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG5cdC8qKlxuXHQgKiBCdWZmZXJzIHNpZ25hbHMgd2hvc2UgYHBhcmVudFRvb2xDYWxsSWRgIHJlZmVyZW5jZXMgYSBzdWJhZ2VudFxuXHQgKiB3aG9zZSBgc3ViYWdlbnRfc3RhcnRlZGAgc2lnbmFsIGhhcyBub3QgeWV0IGJlZW4gcHJvY2Vzc2VkLiBUaGUgU0RLIGlzXG5cdCAqIG5vdCBzdHJpY3QgYWJvdXQgb3JkZXJpbmc6IGFuIGlubmVyIGB0b29sX3N0YXJ0YCBjYW4gYXJyaXZlIGJlZm9yZSB0aGVcblx0ICogYHN1YmFnZW50X3N0YXJ0ZWRgIHRoYXQgY3JlYXRlcyB0aGUgY2hpbGQgc2Vzc2lvbi4gV2l0aG91dCBidWZmZXJpbmcsXG5cdCAqIHRob3NlIHNpZ25hbHMgd291bGQgYmUgZGlzcGF0Y2hlZCBhZ2FpbnN0IHRoZSBwYXJlbnQgc2Vzc2lvbiBhbmQgdGhlXG5cdCAqIFVJIHdvdWxkIHJlbmRlciB0aGUgaW5uZXIgdG9vbCBjYWxscyBmbGF0IGF0IHRoZSB0b3AgbGV2ZWwgcmF0aGVyIHRoYW5cblx0ICogZ3JvdXBpbmcgdGhlbSB1bmRlciB0aGUgc3ViYWdlbnQuIERyYWluZWQgYnkgYF9oYW5kbGVTdWJhZ2VudFN0YXJ0ZWRgLlxuXHQgKlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1N1YmFnZW50U2lnbmFscyA9IG5ldyBOS2V5TWFwPElQZW5kaW5nU3ViYWdlbnRTaWduYWxbXSwgW1Byb3RvY29sVVJJLCBzdHJpbmddPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9xdWV1ZWRNZXNzYWdlU2VuZGVycyA9IG5ldyBOS2V5TWFwPElRdWV1ZWRNZXNzYWdlU2VuZGVyLCBbUHJvdG9jb2xVUkksIHN0cmluZ10+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVJlcG9ydGVyOiBBZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfdHVyblRyYWNrZXI6IEFnZW50SG9zdFR1cm5UcmFja2VyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b29sQ2FsbFRyYWNrZXI6IEFnZW50SG9zdFRvb2xDYWxsVHJhY2tlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5wdXRSZXF1ZXN0VHJhY2tlcjogQWdlbnRIb3N0SW5wdXRSZXF1ZXN0VHJhY2tlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfdGl0bGVDb250cm9sbGVyOiBBZ2VudEhvc3RTZXNzaW9uVGl0bGVDb250cm9sbGVyO1xuXHQvKipcblx0ICogRmlyZXMgd2l0aCB0aGUgcHJvdmlkZXIgaWQgd2hlbmV2ZXIgYSB0dXJuIHN0YXJ0cy4gU3VyZmFjZWQgc29cblx0ICogcHJvY2Vzcy1saWZldGltZSBiYWNrZ3JvdW5kIGpvYnMgKG5vdGFibHkge0BsaW5rIEFnZW50TW9kZWxSZWZyZXNoU2NoZWR1bGVyfSlcblx0ICogY2FuIGdhdGUgd29yayBvbiByZWFsIGFnZW50IHVzYWdlLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRTdGFydFR1cm46IEV2ZW50PHN0cmluZz47XG5cdC8qKiBIb3N0LW93bmVkIHdvcmt0cmVlIGlzb2xhdGlvbiBjb250cm9sbGVyOyBpbmplY3RlZCBwb3N0LWNvbnN0cnVjdGlvbi4gKi9cblx0cHJpdmF0ZSBfd29ya3RyZWU6IFdvcmt0cmVlSXNvbGF0aW9uIHwgdW5kZWZpbmVkO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZU1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2U6IElBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogSUFnZW50U2lkZUVmZmVjdHNPcHRpb25zLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYW5nZXNldHM6IElBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoZWNrcG9pbnRTZXJ2aWNlOiBJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UsXG5cdFx0QElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50Q29uZmlnU2VydmljZTogSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fdGVsZW1ldHJ5UmVwb3J0ZXIgPSBuZXcgQWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXIodGhpcy5fdGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0dGhpcy5fdHVyblRyYWNrZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWdlbnRIb3N0VHVyblRyYWNrZXIodGhpcy5fdGVsZW1ldHJ5UmVwb3J0ZXIpKTtcblx0XHR0aGlzLm9uRGlkU3RhcnRUdXJuID0gdGhpcy5fdHVyblRyYWNrZXIub25EaWRTdGFydFR1cm47XG5cdFx0dGhpcy5fdG9vbENhbGxUcmFja2VyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFnZW50SG9zdFRvb2xDYWxsVHJhY2tlcih0aGlzLl90ZWxlbWV0cnlSZXBvcnRlciwgKHNlc3Npb24sIHR1cm5JZCkgPT4gdGhpcy5fdHVyblRyYWNrZXIuZ2V0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dChzZXNzaW9uLCB0dXJuSWQpKSk7XG5cdFx0dGhpcy5faW5wdXRSZXF1ZXN0VHJhY2tlciA9IG5ldyBBZ2VudEhvc3RJbnB1dFJlcXVlc3RUcmFja2VyKHRoaXMuX3RlbGVtZXRyeVJlcG9ydGVyLCB1bmRlZmluZWQsIChzZXNzaW9uLCB0dXJuSWQpID0+IHRoaXMuX3R1cm5UcmFja2VyLmdldENsaWVudFRlbGVtZXRyeUNvbnRleHQoc2Vzc2lvbiwgdHVybklkKSk7XG5cdFx0dGhpcy5fcGVybWlzc2lvbk1hbmFnZXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uUGVybWlzc2lvbk1hbmFnZXIsIHRoaXMuX3N0YXRlTWFuYWdlciwge30pKTtcblx0XHR0aGlzLl90aXRsZUNvbnRyb2xsZXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RTZXNzaW9uVGl0bGVDb250cm9sbGVyLCB0aGlzLl9zdGF0ZU1hbmFnZXIsIHtcblx0XHRcdHNlc3Npb25EYXRhU2VydmljZTogdGhpcy5fb3B0aW9ucy5zZXNzaW9uRGF0YVNlcnZpY2UsXG5cdFx0XHRnZXRHaXRIdWJDb3BpbG90VG9rZW46IHRoaXMuX29wdGlvbnMuZ2V0R2l0SHViQ29waWxvdFRva2VuLFxuXHRcdFx0Z2V0R2l0SHViVG9rZW46IHRoaXMuX29wdGlvbnMuZ2V0R2l0SHViVG9rZW4sXG5cdFx0XHRnZXRHaXRIdWJIb3N0OiB0aGlzLl9vcHRpb25zLmdldEdpdEh1Ykhvc3QsXG5cdFx0XHRvY3RvS2l0U2VydmljZTogdGhpcy5fb3B0aW9ucy5vY3RvS2l0U2VydmljZSxcblx0XHRcdGNvcGlsb3RBcGlTZXJ2aWNlOiB0aGlzLl9vcHRpb25zLmNvcGlsb3RBcGlTZXJ2aWNlLFxuXHRcdFx0aXNBY3RpdmVBZ2VudFRpdGxlR2VuZXJhdGlvbkVuYWJsZWQ6ICgpID0+IHRoaXMuX2FnZW50Q29uZmlnU2VydmljZS5nZXRSb290VmFsdWUocGxhdGZvcm1Sb290U2NoZW1hLCBBZ2VudEhvc3RBY3RpdmVBZ2VudFRpdGxlR2VuZXJhdGlvbkNvbmZpZ0tleSkgPT09IHRydWUsXG5cdFx0fSkpO1xuXHRcdHRoaXMuX2xvY2FsQ29tbWFuZHMgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdEFnZW50SG9zdExvY2FsQ29tbWFuZHMsXG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIsXG5cdFx0XHR0aGlzLl9vcHRpb25zLmxvY2FsVHVybnMsXG5cdFx0XHQvLyBEcmFpbmluZyB0aGUgcXVldWUgcmUtZW50ZXJzIGFnZW50IGxvb2t1cCAvIHRlbGVtZXRyeSAvIHNlbmRNZXNzYWdlLFxuXHRcdFx0Ly8gd2hpY2ggaXMgdGhpcyBjbGFzcydzIHJlc3BvbnNpYmlsaXR5LCBzbyB0aGUgZGlzcGF0Y2hlciBoYW5kcyB0aGVcblx0XHRcdC8vIHR1cm4gYmFjayBoZXJlIG9uY2UgaXQgaGFzIGNvbXBsZXRlZCBhIGhvc3QtaGFuZGxlZCBjb21tYW5kLlxuXHRcdFx0KHR1cm5DaGFubmVsOiBQcm90b2NvbFVSSSkgPT4gdGhpcy5fdHJ5Q29uc3VtZU5leHRRdWV1ZWRNZXNzYWdlKHR1cm5DaGFubmVsKSxcblx0XHRcdChzZXNzaW9uOiBQcm90b2NvbFVSSSwgY2hhdD86IFByb3RvY29sVVJJKSA9PiB0aGlzLl90aXRsZUNvbnRyb2xsZXIubWFya1RpdGxlUmVuYW1lZChzZXNzaW9uLCBjaGF0KSxcblx0XHQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdGF0ZU1hbmFnZXIub25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnKGUgPT4ge1xuXHRcdFx0Y29uc3QgcHJldmlvdXNNb2RlID0gZ2V0Q29uZmlndXJlZFNlc3Npb25Nb2RlKGUucHJldmlvdXMpO1xuXHRcdFx0Y29uc3QgY3VycmVudE1vZGUgPSBnZXRDb25maWd1cmVkU2Vzc2lvbk1vZGUoZS5jdXJyZW50KTtcblx0XHRcdGlmICghcHJldmlvdXNNb2RlIHx8ICFjdXJyZW50TW9kZSB8fCBwcmV2aW91c01vZGUgPT09IGN1cnJlbnRNb2RlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9vcHRpb25zLmdldEFnZW50KGUuc2Vzc2lvbik7XG5cdFx0XHRjb25zdCBzZXNzaW9uU3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGUuc2Vzc2lvbik7XG5cdFx0XHRpZiAoIWFnZW50IHx8ICFzZXNzaW9uU3RhdGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl90ZWxlbWV0cnlSZXBvcnRlci5leGVjdXRpb25Nb2RlQ2hhbmdlZChhZ2VudC5pZCwgZS5zZXNzaW9uLCBwcmV2aW91c01vZGUsIGN1cnJlbnRNb2RlLCBzZXNzaW9uU3RhdGUudHVybnMubGVuZ3RoLCBlLmNsaWVudENvbnRleHQpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2UoZXZlbnQgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIGV2ZW50LnNlc3Npb25zKSB7XG5cdFx0XHRcdGNvbnN0IGFnZW50ID0gdGhpcy5fb3B0aW9ucy5nZXRBZ2VudChzZXNzaW9uKTtcblx0XHRcdFx0aWYgKGFnZW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRSZWZyZXNoZXMuYWRkKHNlc3Npb24pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbik/LmN1c3RvbWl6YXRpb25zICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9wdWJsaXNoU2Vzc2lvbkN1c3RvbWl6YXRpb25zU29vbihhZ2VudCwgc2Vzc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBXaGVuZXZlciB0aGUgYWdlbnRzIG9ic2VydmFibGUgY2hhbmdlcywgcHVibGlzaCB0byByb290IHN0YXRlLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFnZW50cyA9IHRoaXMuX29wdGlvbnMuYWdlbnRzLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX3B1Ymxpc2hBZ2VudEluZm9zKGFnZW50cywgcmVhZGVyKTtcblx0XHRcdHRoaXMuX3B1Ymxpc2hQZW5kaW5nQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRSZWZyZXNoZXMoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBPYnNlcnZlIGVudmVsb3BlcyBmb3Igc2lkZSBlZmZlY3RzIHRoYXQgbXVzdCBpbmNsdWRlIHNlcnZlci1kaXNwYXRjaGVkXG5cdFx0Ly8gYWN0aW9ucywgd2hpY2ggYnlwYXNzIGhhbmRsZUFjdGlvbi5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZW52ZWxvcGUgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aW9uID0gZW52ZWxvcGUuYWN0aW9uO1xuXHRcdFx0aWYgKGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVG9nZ2xlZCkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uU3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGVudmVsb3BlLmNoYW5uZWwpO1xuXHRcdFx0XHRjb25zdCBtY3BTZXJ2ZXJPd25lcnMgPSB0aGlzLl9vcHRpb25zLmdldEFnZW50KGVudmVsb3BlLmNoYW5uZWwpPy5nZXRNY3BTZXJ2ZXJPd25lcnM/LihVUkkucGFyc2UoZW52ZWxvcGUuY2hhbm5lbCkpO1xuXHRcdFx0XHRjb25zdCBjdXN0b21pemF0aW9uID0gZ2V0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnRDYW5kaWRhdGVzKHNlc3Npb25TdGF0ZT8uY3VzdG9taXphdGlvbnMsIG1jcFNlcnZlck93bmVycylcblx0XHRcdFx0XHQuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLmN1c3RvbWl6YXRpb24uaWQgPT09IGFjdGlvbi5pZCk7XG5cdFx0XHRcdGlmIChjdXN0b21pemF0aW9uID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHQvLyBUb2dnbGUgYWN0aW9ucyB0YXJnZXQgZW50cmllcyBmcm9tIHRoZSBpbW1lZGlhdGVseSBwcmVjZWRpbmdcblx0XHRcdFx0XHQvLyBzZXNzaW9uIHNuYXBzaG90LiBBIHJlbW92ZWQgZW50cnkgY2Fubm90IGJlIHJlLWVuYWJsZWQsIHNvXG5cdFx0XHRcdFx0Ly8gdGhpcyBzdGFsZSBhY3Rpb24gaXMgaGFybWxlc3MgYnV0IHNob3VsZCByZW1haW4gZGlhZ25vc2FibGUuXG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTaWRlRWZmZWN0c10gSWdub3JpbmcgY3VzdG9taXphdGlvbiB0b2dnbGUgZm9yIG1pc3NpbmcgJHthY3Rpb24uaWR9IGluICR7ZW52ZWxvcGUuY2hhbm5lbH1gKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9yZWNvcmRDdXN0b21pemF0aW9uRW5hYmxlbWVudChlbnZlbG9wZS5jaGFubmVsLCBjdXN0b21pemF0aW9uLCBhY3Rpb24uZW5hYmxlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChpc0FocENoYXRDaGFubmVsKGVudmVsb3BlLmNoYW5uZWwpICYmIGlzQ2hhdEFjdGlvbihlbnZlbG9wZS5hY3Rpb24pKSB7XG5cdFx0XHRcdGNvbnN0IGNoYXRTdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRDaGF0U3RhdGUoZW52ZWxvcGUuY2hhbm5lbCk7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGVudmVsb3BlLmFjdGlvbjtcblx0XHRcdFx0c3dpdGNoIChhY3Rpb24udHlwZSkge1xuXHRcdFx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0SW5wdXRSZXF1ZXN0ZWQ6IHtcblx0XHRcdFx0XHRcdGNvbnN0IHR1cm5JZCA9IGNoYXRTdGF0ZT8uYWN0aXZlVHVybj8uaWQ7XG5cdFx0XHRcdFx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX29wdGlvbnMuZ2V0QWdlbnQocGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShlbnZlbG9wZS5jaGFubmVsKSk/LmlkO1xuXHRcdFx0XHRcdFx0aWYgKHR1cm5JZCAmJiBwcm92aWRlcikge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9pbnB1dFJlcXVlc3RUcmFja2VyLmlucHV0UmVxdWVzdGVkKHByb3ZpZGVyLCBlbnZlbG9wZS5jaGFubmVsLCB0dXJuSWQsIGFjdGlvbi5yZXF1ZXN0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdElucHV0Q29tcGxldGVkOlxuXHRcdFx0XHRcdFx0dGhpcy5faW5wdXRSZXF1ZXN0VHJhY2tlci5pbnB1dENvbXBsZXRlZChlbnZlbG9wZS5jaGFubmVsLCBhY3Rpb24sIGNoYXRTdGF0ZSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZTpcblx0XHRcdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFR1cm5DYW5jZWxsZWQ6XG5cdFx0XHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRFcnJvcjpcblx0XHRcdFx0XHRcdHRoaXMuX2lucHV0UmVxdWVzdFRyYWNrZXIuY2xlYXJUdXJuKGVudmVsb3BlLmNoYW5uZWwsIGFjdGlvbi50dXJuSWQpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUcnVuY2F0ZWQ6XG5cdFx0XHRcdFx0XHR0aGlzLl9pbnB1dFJlcXVlc3RUcmFja2VyLmNsZWFyQ2hhdChlbnZlbG9wZS5jaGFubmVsKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlbnZlbG9wZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZCkge1xuXHRcdFx0XHRcdGxldCB0dXJuSWRzID0gdGhpcy5fY2FuY2VsbGVkVHVybklkcy5nZXQoZW52ZWxvcGUuY2hhbm5lbCk7XG5cdFx0XHRcdFx0aWYgKCF0dXJuSWRzKSB7XG5cdFx0XHRcdFx0XHR0dXJuSWRzID0gbmV3IFNldCgpO1xuXHRcdFx0XHRcdFx0dGhpcy5fY2FuY2VsbGVkVHVybklkcy5zZXQoZW52ZWxvcGUuY2hhbm5lbCwgdHVybklkcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHR1cm5JZHMuYWRkKGVudmVsb3BlLmFjdGlvbi50dXJuSWQpO1xuXHRcdFx0XHRcdHZvaWQgdGhpcy5fY2hlY2twb2ludFNlcnZpY2UuZGlzY2FyZFR1cm5TdGFydENoZWNrcG9pbnQoVVJJLnBhcnNlKHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmkoZW52ZWxvcGUuY2hhbm5lbCkpLCBVUkkucGFyc2UoZW52ZWxvcGUuY2hhbm5lbCksIGVudmVsb3BlLmFjdGlvbi50dXJuSWQpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fc3luY1Nlc3Npb25JbnB1dE5lZWRlZEZvckNoYXRBY3Rpb24oZW52ZWxvcGUuY2hhbm5lbCwgZW52ZWxvcGUuYWN0aW9uKTtcblx0XHRcdFx0dGhpcy5fdHJhY2tUdXJuVXNhZ2UoZW52ZWxvcGUuY2hhbm5lbCwgZW52ZWxvcGUuYWN0aW9uKTtcblx0XHRcdH1cblx0XHRcdGlmICghZW52ZWxvcGUub3JpZ2luICYmIGVudmVsb3BlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlKSB7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGVudmVsb3BlLmFjdGlvbjtcblx0XHRcdFx0Ly8gQ2hhdC1hY3Rpb24gZW52ZWxvcGVzIGFyZSBlbWl0dGVkIG9uIHRoZSBjaGF0IGNoYW5uZWwgVVJJO1xuXHRcdFx0XHQvLyBhZ2VudHMgYXJlIGtleWVkIGJ5IHNlc3Npb24gVVJJLCBzbyByZXNvbHZlIGJhY2sgdG8gdGhlXG5cdFx0XHRcdC8vIG93bmluZyBzZXNzaW9uIGJlZm9yZSBub3RpZnlpbmcgdGhlIGFnZW50LiBQYXNzIHRoZSBjaGF0IFVSSVxuXHRcdFx0XHQvLyBhbG9uZ3NpZGUgc28gYWdlbnRzIHRoYXQgdHJhY2sgcGVlciBjaGF0cyBjYW4gcm91dGUgY29ycmVjdGx5LlxuXHRcdFx0XHRpZiAoIWlzQWhwQ2hhdENoYW5uZWwoZW52ZWxvcGUuY2hhbm5lbCkpIHtcblx0XHRcdFx0XHRyZXR1cm47IC8vIE5vdCBhIGNoYXQgY2hhbm5lbDsgaWdub3JlIChhbHJlYWR5IGxvZ2dlZCBlbHNld2hlcmUpLlxuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHNlc3Npb25DaGFubmVsID0gcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShlbnZlbG9wZS5jaGFubmVsKTtcblx0XHRcdFx0dGhpcy5fbm90aWZ5Q2xpZW50VG9vbENhbGxDb21wbGV0ZShzZXNzaW9uQ2hhbm5lbCwgZW52ZWxvcGUuY2hhbm5lbCwgYWN0aW9uLnRvb2xDYWxsSWQsIGFjdGlvbi5yZXN1bHQsICdzZXJ2ZXItZW52ZWxvcGUnKTtcblx0XHRcdH1cblx0XHRcdGlmIChlbnZlbG9wZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0RHJhZnRDaGFuZ2VkKSB7XG5cdFx0XHRcdHRoaXMuX3BlcnNpc3RDaGF0RHJhZnQoZW52ZWxvcGUuY2hhbm5lbCwgZW52ZWxvcGUuYWN0aW9uLmRyYWZ0KTtcblx0XHRcdH1cblx0XHRcdC8vIEEgY2hhdCBqb2luaW5nIHRoZSBjYXRhbG9nIGNoYW5nZXMgdGhlIHNlc3Npb24ncyBhdXRob3JpdGF0aXZlXG5cdFx0XHQvLyBtZW1iZXJzaGlwLCBzbyBldmVyeSBhbHJlYWR5LWNvbnRyaWJ1dGluZyBjbGllbnQgaXMgcmUtZmFubmVkLW91dFxuXHRcdFx0Ly8gb3ZlciB0aGUgbmV3IHNldC4gSGFuZGxlZCBoZXJlIChub3QgYGhhbmRsZUFjdGlvbmApIGJlY2F1c2UgZXZlcnlcblx0XHRcdC8vIGNoYXQtbWVtYmVyc2hpcCBwYXRoIChjcmVhdGVDaGF0LCBzcGF3bmVkL3Jlc3RvcmVkIHN1YmFnZW50KVxuXHRcdFx0Ly8gZnVubmVscyB0aHJvdWdoIHRoaXMgc2VydmVyLWRpc3BhdGNoZWQgYWN0aW9uLlxuXHRcdFx0aWYgKGVudmVsb3BlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DaGF0QWRkZWQpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBhY3RpdmVDbGllbnQgb2YgdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShlbnZlbG9wZS5jaGFubmVsKT8uYWN0aXZlQ2xpZW50cyA/PyBbXSkge1xuXHRcdFx0XHRcdHRoaXMuX2Zhbk91dEFjdGl2ZUNsaWVudChlbnZlbG9wZS5jaGFubmVsLCBhY3RpdmVDbGllbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoZW52ZWxvcGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkNvbmZpZ0NoYW5nZWQpIHtcblx0XHRcdFx0Y29uc3QgdmFsdWVzID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShlbnZlbG9wZS5jaGFubmVsKT8uY29uZmlnPy52YWx1ZXM7XG5cdFx0XHRcdGlmICh2YWx1ZXMpIHtcblx0XHRcdFx0XHR0aGlzLl9wZXJzaXN0U2Vzc2lvbkZsYWcoZW52ZWxvcGUuY2hhbm5lbCwgJ2NvbmZpZ1ZhbHVlcycsIEpTT04uc3RyaW5naWZ5KHZhbHVlcykpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHQvLyBQZXJzaXN0aW5nIGhlcmUgcmF0aGVyIHRoYW4gaW4gYGhhbmRsZUFjdGlvbmAgY292ZXJzIGNsaWVudC0gYW5kXG5cdFx0XHQvLyBzZXJ2ZXItZGlzcGF0Y2hlZCBjaGFuZ2VzIGFsaWtlLCBzbyBubyBkaXNwYXRjaCBwYXRoIGNhbiBza2lwIGl0LlxuXHRcdFx0Ly8gUmVqZWN0ZWQgYWN0aW9ucyBuZXZlciByZWFjaGVkIHN0YXRlIGFuZCBtdXN0IG5vdCBiZSB3cml0dGVuLlxuXHRcdFx0aWYgKCFlbnZlbG9wZS5yZWplY3Rpb25SZWFzb24pIHtcblx0XHRcdFx0aWYgKGVudmVsb3BlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25Jc1JlYWRDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0dGhpcy5fcGVyc2lzdFNlc3Npb25GbGFnKGVudmVsb3BlLmNoYW5uZWwsIEFIX01FVEFfSVNfUkVBRF9EQl9LRVksIGVudmVsb3BlLmFjdGlvbi5pc1JlYWQgPyAndHJ1ZScgOiAnJyk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZW52ZWxvcGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbklzQXJjaGl2ZWRDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0dGhpcy5fcGVyc2lzdFNlc3Npb25GbGFnKGVudmVsb3BlLmNoYW5uZWwsIEFIX01FVEFfSVNfQVJDSElWRURfREJfS0VZLCBlbnZlbG9wZS5hY3Rpb24uaXNBcmNoaXZlZCA/ICd0cnVlJyA6ICcnKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX2NoYXRDb250ZXh0KHNlc3Npb246IFByb3RvY29sVVJJLCBjaGF0OiBQcm90b2NvbFVSSSk6IElBZ2VudENoYXRDb250ZXh0IHtcblx0XHRyZXR1cm4gY3JlYXRlQWdlbnRDaGF0Q29udGV4dCh0aGlzLl9zdGF0ZU1hbmFnZXIsIHNlc3Npb24sIGNoYXQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBvd25pbmcgc2Vzc2lvbidzIGxhc3QgaG9zdC1wdWJsaXNoZWQgY3VzdG9taXphdGlvbiBzbmFwc2hvdCxcblx0ICogaW5jbHVkaW5nIHVzZXIgZW5hYmxlbWVudCB0b2dnbGVzLiBgdW5kZWZpbmVkYCBtZWFucyB0aGUgaG9zdCBoYXMgbm90XG5cdCAqIHB1Ymxpc2hlZCBhIHNuYXBzaG90IHlldCBcdTIwMTQgZGlzdGluY3QgZnJvbSBhbiBlbXB0eSBsaXN0LCBzaW5jZSB0aGVcblx0ICogcHJvdmlkZXIgbXVzdCByZWNvbmNpbGUgYWdhaW5zdCBpdHMgb3duIHN0YXRlIHJhdGhlciB0aGFuIHRyZWF0IFwibm9cblx0ICogc25hcHNob3RcIiBhcyBcIm5vIGN1c3RvbWl6YXRpb25zXCIuXG5cdCAqL1xuXHRwcml2YXRlIF9ob3N0Q3VzdG9taXphdGlvbnMoc2Vzc2lvbjogUHJvdG9jb2xVUkkpOiByZWFkb25seSBDdXN0b21pemF0aW9uW10gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24pPy5jdXN0b21pemF0aW9ucztcblx0fVxuXG5cdC8qKiBIYW5kcyBhIGNsaWVudCdzIGNvbnRyaWJ1dGlvbiB0byBlYWNoIGV4YWN0IGNoYXQgQWdlbnQgSG9zdCBvd25zLiAqL1xuXHRwcml2YXRlIF9mYW5PdXRBY3RpdmVDbGllbnQoc2Vzc2lvbjogUHJvdG9jb2xVUkksIGFjdGl2ZUNsaWVudDogU2Vzc2lvbkFjdGl2ZUNsaWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGFnZW50ID0gdGhpcy5fb3B0aW9ucy5nZXRBZ2VudChzZXNzaW9uKTtcblx0XHRpZiAoIWFnZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNoYXRzID0gZ2V0U2Vzc2lvbkNoYXRzRm9yRmFuT3V0KHRoaXMuX3N0YXRlTWFuYWdlciwgc2Vzc2lvbik7XG5cdFx0aWYgKCFjaGF0cykge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTaWRlRWZmZWN0c10gU2tpcHBpbmcgYWN0aXZlLWNsaWVudCBmYW4tb3V0IGZvciBzZXNzaW9uIHdpdGhvdXQgaG9zdCBzdGF0ZTogc2Vzc2lvbj0ke3Nlc3Npb259LCBjbGllbnRJZD0ke2FjdGl2ZUNsaWVudC5jbGllbnRJZH1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaG9zdEN1c3RvbWl6YXRpb25zID0gdGhpcy5faG9zdEN1c3RvbWl6YXRpb25zKHNlc3Npb24pO1xuXHRcdGZvciAoY29uc3QgY2hhdCBvZiBjaGF0cykge1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYWdlbnQuZ2V0T3JDcmVhdGVBY3RpdmVDbGllbnQoY2hhdCwgdGhpcy5fY2hhdENvbnRleHQoc2Vzc2lvbiwgY2hhdC50b1N0cmluZygpKSwge1xuXHRcdFx0XHRjbGllbnRJZDogYWN0aXZlQ2xpZW50LmNsaWVudElkLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogYWN0aXZlQ2xpZW50LmRpc3BsYXlOYW1lLFxuXHRcdFx0fSwgaG9zdEN1c3RvbWl6YXRpb25zKTtcblx0XHRcdGhhbmRsZS50b29scyA9IGFjdGl2ZUNsaWVudC50b29scztcblx0XHRcdGhhbmRsZS5jdXN0b21pemF0aW9ucyA9IGFjdGl2ZUNsaWVudC5jdXN0b21pemF0aW9ucyA/PyBbXTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUHVibGlzaGVzIGFnZW50IGRlc2NyaXB0b3JzIHVzaW5nIHRoZSBsYXN0IGtub3duIG1vZGVsIGxpc3RzLlxuXHQgKi9cblx0cHJpdmF0ZSBfcHVibGlzaEFnZW50SW5mb3MoYWdlbnRzOiByZWFkb25seSBJQWdlbnRbXSwgcmVhZGVyPzogSVJlYWRlcik6IHZvaWQge1xuXHRcdGNvbnN0IGluZm9zOiBBZ2VudEluZm9bXSA9IGFnZW50cy5tYXAoYSA9PiB7XG5cdFx0XHRjb25zdCBkID0gYS5nZXREZXNjcmlwdG9yKCk7XG5cdFx0XHRjb25zdCBwcm90ZWN0ZWRSZXNvdXJjZXMgPSBhLmdldFByb3RlY3RlZFJlc291cmNlcygpO1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gcmVhZGVyID8gYS5tb2RlbHMucmVhZChyZWFkZXIpIDogYS5tb2RlbHMuZ2V0KCk7XG5cdFx0XHRjb25zdCBjdXN0b21pemF0aW9ucyA9IGEuZ2V0Q3VzdG9taXphdGlvbnM/LigpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cHJvdmlkZXI6IGQucHJvdmlkZXIsIGRpc3BsYXlOYW1lOiBkLmRpc3BsYXlOYW1lLCBkZXNjcmlwdGlvbjogZC5kZXNjcmlwdGlvbiwgbW9kZWxzOiBtb2RlbHMubWFwKG0gPT4gKHtcblx0XHRcdFx0XHRpZDogbS5pZCxcblx0XHRcdFx0XHRwcm92aWRlcjogbS5wcm92aWRlcixcblx0XHRcdFx0XHRuYW1lOiBtLm5hbWUsXG5cdFx0XHRcdFx0bWF4Q29udGV4dFdpbmRvdzogbS5tYXhDb250ZXh0V2luZG93LFxuXHRcdFx0XHRcdG1heE91dHB1dFRva2VuczogbS5tYXhPdXRwdXRUb2tlbnMsXG5cdFx0XHRcdFx0bWF4UHJvbXB0VG9rZW5zOiBtLm1heFByb21wdFRva2Vucyxcblx0XHRcdFx0XHRzdXBwb3J0c1Zpc2lvbjogbS5zdXBwb3J0c1Zpc2lvbixcblx0XHRcdFx0XHRwb2xpY3lTdGF0ZTogbS5wb2xpY3lTdGF0ZSxcblx0XHRcdFx0XHRjb25maWdTY2hlbWE6IG0uY29uZmlnU2NoZW1hLFxuXHRcdFx0XHRcdF9tZXRhOiBtLl9tZXRhLFxuXHRcdFx0XHR9KSksXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25zOiBjdXN0b21pemF0aW9ucz8ubGVuZ3RoID8gWy4uLmN1c3RvbWl6YXRpb25zXSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0cHJvdGVjdGVkUmVzb3VyY2VzOiBwcm90ZWN0ZWRSZXNvdXJjZXMubGVuZ3RoID4gMCA/IHByb3RlY3RlZFJlc291cmNlcyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y2FwYWJpbGl0aWVzOiBkLmNhcGFiaWxpdGllcyA/IHsgLi4uZC5jYXBhYmlsaXRpZXMgfSA6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0aWYgKGVxdWFscyh0aGlzLl9sYXN0QWdlbnRJbmZvcywgaW5mb3MpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2xhc3RBZ2VudEluZm9zID0gaW5mb3M7XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKFJPT1RfU1RBVEVfVVJJLCB7IHR5cGU6IEFjdGlvblR5cGUuUm9vdEFnZW50c0NoYW5nZWQsIGFnZW50czogaW5mb3MgfSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9wdWJsaXNoU2Vzc2lvbkN1c3RvbWl6YXRpb25zKGFnZW50OiBJQWdlbnQsIHNlc3Npb246IFByb3RvY29sVVJJLCBzdXBlcnNlZGVkUmV0cmllczogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY3VycmVudEJlZm9yZUZldGNoID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uKT8uY3VzdG9taXphdGlvbnM7XG5cdFx0Y29uc3QgY2hhdCA9IFVSSS5wYXJzZSh0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24pPy5kZWZhdWx0Q2hhdCA/PyBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pKTtcblx0XHRjb25zdCBjdXN0b21pemF0aW9ucyA9IGF3YWl0IGFnZW50LmdldENoYXRDdXN0b21pemF0aW9ucyhjaGF0LCB0aGlzLl9jaGF0Q29udGV4dChzZXNzaW9uLCBjaGF0LnRvU3RyaW5nKCkpLCBjdXJyZW50QmVmb3JlRmV0Y2gpO1xuXG5cdFx0Ly8gU2tpcCB0aGUgZGlzcGF0Y2ggd2hlbiB0aGUgcmVzb2x2ZWQgY3VzdG9taXphdGlvbnMgbWF0Y2ggd2hhdCB0aGVcblx0XHQvLyBzZXNzaW9uIHN0YXRlIGFscmVhZHkgaG9sZHMuIEEgc2luZ2xlIGVkaXQgdW5kZXIgYSBzaGFyZWQgYH4vLmNsYXVkZWBcblx0XHQvLyB0cmVlIGZhbnMgb3V0IHRvIGV2ZXJ5IG9wZW4gc2Vzc2lvbiAoYW5kLCB2aWEgdGhlIGFnZW50LWxldmVsXG5cdFx0Ly8gYG9uRGlkQ3VzdG9taXphdGlvbnNDaGFuZ2VgLCBpcyByZXB1Ymxpc2hlZCBvbmNlIHBlciBzZXNzaW9uKSwgc29cblx0XHQvLyB3aXRob3V0IHRoaXMgZ3VhcmQgYSBzaW5nbGUgY2hhbmdlIGVtaXR0ZWQgTyhOXjIpIGlkZW50aWNhbFxuXHRcdC8vIGBTZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkYCBlbnZlbG9wZXMuIENvbXBhcmluZyBhZ2FpbnN0IHRoZVxuXHRcdC8vIGF1dGhvcml0YXRpdmUgc2Vzc2lvbiBzdGF0ZSAocmF0aGVyIHRoYW4gYSBzaWRlIGNhY2hlKSBrZWVwcyB0aGlzXG5cdFx0Ly8gY29ycmVjdCBhY3Jvc3MgaWRsZS1ldmljdGlvbiArIHJlc3RvcmU6IGEgcmVzdG9yZWQgc2Vzc2lvbidzIHN0YXRlXG5cdFx0Ly8gc3RhcnRzIHdpdGhvdXQgY3VzdG9taXphdGlvbnMsIHNvIHRoZSBmaXJzdCBzdWNjZXNzZnVsIHJlZnJlc2ggYWx3YXlzXG5cdFx0Ly8gZGlzcGF0Y2hlcyBldmVuIGlmIHRoZSByZXNvbHZlZCBzZXQgbWF0Y2hlcyB0aGUgcHJpb3IgaW5jYXJuYXRpb24uXG5cdFx0Ly8gSXQgYWxzbyBuZWVkcyBubyBjbGVhbnVwIG9uIHNlc3Npb24gdGVhcmRvd24uIGB1bmRlZmluZWRgIChuZXZlclxuXHRcdC8vIHB1Ymxpc2hlZCkgbmV2ZXIgZXF1YWxzIGEgcmVzb2x2ZWQgYXJyYXksIHNvIHRoZSBpbml0aWFsIHB1Ymxpc2hcblx0XHQvLyBhbHdheXMgZ29lcyB0aHJvdWdoLlxuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24pPy5jdXN0b21pemF0aW9ucztcblx0XHQvLyBBZ2VudCBwcm9ncmVzcyByZWNlaXZlZCBkdXJpbmcgdGhlIGZldGNoIGlzIG5ld2VyIHRoYW4gdGhpcyBzbmFwc2hvdC5cblx0XHRpZiAoY3VycmVudCAhPT0gY3VycmVudEJlZm9yZUZldGNoKSB7XG5cdFx0XHRpZiAoc3VwZXJzZWRlZFJldHJpZXMgPCBNQVhfU1VQRVJTRURFRF9DVVNUT01JWkFUSU9OX1BVQkxJU0hfUkVUUklFUykge1xuXHRcdFx0XHR0aGlzLl9wdWJsaXNoU2Vzc2lvbkN1c3RvbWl6YXRpb25zU29vbihhZ2VudCwgc2Vzc2lvbiwgc3VwZXJzZWRlZFJldHJpZXMgKyAxKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGN1cnJlbnQgJiYgZXF1YWxzKGN1cnJlbnQsIGN1c3RvbWl6YXRpb25zKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQsXG5cdFx0XHRjdXN0b21pemF0aW9uczogWy4uLmN1c3RvbWl6YXRpb25zXSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3B1Ymxpc2hTZXNzaW9uQ3VzdG9taXphdGlvbnNTb29uKGFnZW50OiBJQWdlbnQsIHNlc3Npb246IFByb3RvY29sVVJJLCBzdXBlcnNlZGVkUmV0cmllcyA9IDApOiB2b2lkIHtcblx0XHRjb25zdCBwcmV2aW91cyA9IHRoaXMuX3BlbmRpbmdTZXNzaW9uQ3VzdG9taXphdGlvblB1Ymxpc2hlcy5nZXQoc2Vzc2lvbikgPz8gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0Y29uc3QgcHVibGlzaCA9IHByZXZpb3VzLnRoZW4oKCkgPT4gdGhpcy5fcHVibGlzaFNlc3Npb25DdXN0b21pemF0aW9ucyhhZ2VudCwgc2Vzc2lvbiwgc3VwZXJzZWRlZFJldHJpZXMpKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW0FnZW50U2lkZUVmZmVjdHNdIGdldENoYXRDdXN0b21pemF0aW9ucyBmYWlsZWQnLCBlcnIpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX3BlbmRpbmdTZXNzaW9uQ3VzdG9taXphdGlvblB1Ymxpc2hlcy5zZXQoc2Vzc2lvbiwgcHVibGlzaCk7XG5cdFx0dm9pZCBwdWJsaXNoLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3BlbmRpbmdTZXNzaW9uQ3VzdG9taXphdGlvblB1Ymxpc2hlcy5nZXQoc2Vzc2lvbikgPT09IHB1Ymxpc2gpIHtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1Nlc3Npb25DdXN0b21pemF0aW9uUHVibGlzaGVzLmRlbGV0ZShzZXNzaW9uKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3B1Ymxpc2hQZW5kaW5nQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRSZWZyZXNoZXMoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX3BlbmRpbmdDdXN0b21pemF0aW9uRW5hYmxlbWVudFJlZnJlc2hlcykge1xuXHRcdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9vcHRpb25zLmdldEFnZW50KHNlc3Npb24pO1xuXHRcdFx0aWYgKGFnZW50ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wZW5kaW5nQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRSZWZyZXNoZXMuZGVsZXRlKHNlc3Npb24pO1xuXHRcdFx0dGhpcy5fcHVibGlzaFNlc3Npb25DdXN0b21pemF0aW9uc1Nvb24oYWdlbnQsIHNlc3Npb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3B1Ymxpc2hTZXNzaW9uQ3VzdG9taXphdGlvbnNGb3JBZ2VudChhZ2VudDogSUFnZW50KTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uVXJpcygpKSB7XG5cdFx0XHRpZiAodGhpcy5fb3B0aW9ucy5nZXRBZ2VudChzZXNzaW9uKSA9PT0gYWdlbnQpIHtcblx0XHRcdFx0dGhpcy5fcHVibGlzaFNlc3Npb25DdXN0b21pemF0aW9uc1Nvb24oYWdlbnQsIHNlc3Npb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3B1Ymxpc2hBbGxTZXNzaW9uQ3VzdG9taXphdGlvbnMoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uVXJpcygpKSB7XG5cdFx0XHRjb25zdCBhZ2VudCA9IHRoaXMuX29wdGlvbnMuZ2V0QWdlbnQoc2Vzc2lvbik7XG5cdFx0XHRpZiAoYWdlbnQpIHtcblx0XHRcdFx0dGhpcy5fcHVibGlzaFNlc3Npb25DdXN0b21pemF0aW9uc1Nvb24oYWdlbnQsIHNlc3Npb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIC0tLS0gU2Vzc2lvbiBpbnB1dC1uZWVkZWQgYWdncmVnYXRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHQvL1xuXHQvLyBNaXJyb3JzIHBlci1jaGF0IGJsb2NrZXJzICh1c2VyLWlucHV0IGVsaWNpdGF0aW9ucywgdG9vbCBjb25maXJtYXRpb25zLFxuXHQvLyBjbGllbnQtdG9vbCBleGVjdXRpb25zLCBhbmQgTUNQIGF1dGhlbnRpY2F0aW9uKSBpbnRvIHRoZSBvd25pbmcgc2Vzc2lvbidzXG5cdC8vIGBpbnB1dE5lZWRlZGAgbGlzdCBzbyBjbGllbnRzIHN1YnNjcmliZWQgb25seSB0byB0aGUgc2Vzc2lvbiBjaGFubmVsIGNhblxuXHQvLyBkaXNjb3ZlciBhbmQgYW5zd2VyIHRoZW0gd2l0aG91dCBzdWJzY3JpYmluZyB0byBlYWNoIGNoYXQuIFRoaXMgaGFuZGxlclxuXHQvLyBvbmx5IHByb2R1Y2VzIHRoZSBzdGF0ZTsgaXQgZG9lcyBub3QgY29uc3VtZSBpdC5cblxuXHRwcml2YXRlIF9zeW5jU2Vzc2lvbklucHV0TmVlZGVkRm9yQ2hhdEFjdGlvbihjaGF0VXJpOiBQcm90b2NvbFVSSSwgYWN0aW9uOiBDaGF0QWN0aW9uKTogdm9pZCB7XG5cdFx0c3dpdGNoIChhY3Rpb24udHlwZSkge1xuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRJbnB1dFJlcXVlc3RlZDpcblx0XHRcdFx0dGhpcy5fc3luY0NoYXRJbnB1dE5lZWRlZChjaGF0VXJpLCBhY3Rpb24ucmVxdWVzdC5pZCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRJbnB1dEFuc3dlckNoYW5nZWQ6XG5cdFx0XHRcdHRoaXMuX3N5bmNDaGF0SW5wdXROZWVkZWQoY2hhdFVyaSwgYWN0aW9uLnJlcXVlc3RJZCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRJbnB1dENvbXBsZXRlZDpcblx0XHRcdFx0dGhpcy5fcmVtb3ZlU2Vzc2lvbklucHV0TmVlZGVkKGNoYXRVcmksIHRoaXMuX2NoYXRJbnB1dE5lZWRlZElkKGNoYXRVcmksIGFjdGlvbi5yZXF1ZXN0SWQpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQ6XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHk6XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkOlxuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlOlxuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlc3VsdENvbmZpcm1lZDpcblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxBdXRoUmVxdWlyZWQ6XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQXV0aFJlc29sdmVkOlxuXHRcdFx0XHR0aGlzLl9zeW5jVG9vbElucHV0TmVlZGVkKGNoYXRVcmksIGFjdGlvbi50dXJuSWQsIGFjdGlvbi50b29sQ2FsbElkKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZTpcblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZDpcblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0RXJyb3I6XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRydW5jYXRlZDpcblx0XHRcdFx0dGhpcy5fcmVtb3ZlU2Vzc2lvbklucHV0TmVlZGVkRm9yQ2hhdChjaGF0VXJpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc3luY0NoYXRJbnB1dE5lZWRlZChjaGF0VXJpOiBQcm90b2NvbFVSSSwgcmVxdWVzdElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoY2hhdFVyaSk7XG5cdFx0Y29uc3QgcGFydCA9IHN0YXRlPy5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLmZpbmQocGFydCA9PlxuXHRcdFx0cGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLklucHV0UmVxdWVzdFxuXHRcdFx0JiYgcGFydC5yZXNwb25zZSA9PT0gdW5kZWZpbmVkXG5cdFx0XHQmJiBwYXJ0LnJlcXVlc3QuaWQgPT09IHJlcXVlc3RJZFxuXHRcdCk7XG5cdFx0Y29uc3QgaWQgPSB0aGlzLl9jaGF0SW5wdXROZWVkZWRJZChjaGF0VXJpLCByZXF1ZXN0SWQpO1xuXHRcdGlmICghcGFydCB8fCBwYXJ0LmtpbmQgIT09IFJlc3BvbnNlUGFydEtpbmQuSW5wdXRSZXF1ZXN0KSB7XG5cdFx0XHR0aGlzLl9yZW1vdmVTZXNzaW9uSW5wdXROZWVkZWQoY2hhdFVyaSwgaWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zZXRTZXNzaW9uSW5wdXROZWVkZWQoY2hhdFVyaSwge1xuXHRcdFx0aWQsXG5cdFx0XHRraW5kOiBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZC5DaGF0SW5wdXQsXG5cdFx0XHRjaGF0OiBjaGF0VXJpLFxuXHRcdFx0cmVxdWVzdDogcGFydC5yZXF1ZXN0LFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3luY1Rvb2xJbnB1dE5lZWRlZChjaGF0VXJpOiBQcm90b2NvbFVSSSwgdHVybklkOiBzdHJpbmcsIHRvb2xDYWxsSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbmZpcm1hdGlvbklkID0gdGhpcy5fdG9vbENvbmZpcm1hdGlvbk5lZWRlZElkKGNoYXRVcmksIHR1cm5JZCwgdG9vbENhbGxJZCk7XG5cdFx0Y29uc3QgY2xpZW50RXhlY3V0aW9uSWQgPSB0aGlzLl90b29sQ2xpZW50RXhlY3V0aW9uTmVlZGVkSWQoY2hhdFVyaSwgdHVybklkLCB0b29sQ2FsbElkKTtcblx0XHRjb25zdCBhdXRoZW50aWNhdGlvbklkID0gdGhpcy5fdG9vbEF1dGhlbnRpY2F0aW9uTmVlZGVkSWQoY2hhdFVyaSwgdHVybklkLCB0b29sQ2FsbElkKTtcblx0XHRjb25zdCB0b29sQ2FsbCA9IHRoaXMuX2ZpbmRUb29sQ2FsbChjaGF0VXJpLCB0dXJuSWQsIHRvb2xDYWxsSWQpO1xuXG5cdFx0Ly8gQSBwYXJhbWV0ZXIgZ2F0ZSBhdXRvLWFwcHJvdmVkIGJ5IHRoZSBzZXNzaW9uJ3MgYnlwYXNzIHNldHRpbmcgbmV2ZXJcblx0XHQvLyBibG9ja3Mgb24gdGhlIHVzZXIsIHNvIGtlZXAgaXQgb3V0IG9mIHRoZSBzZXNzaW9uIGBpbnB1dE5lZWRlZGAgcXVldWVcblx0XHQvLyAod2hpY2ggd291bGQgZmxhc2ggXCJpbnB1dCBuZWVkZWRcIiBpbiB0aGUgc2Vzc2lvbnMgbGlzdCkuXG5cdFx0Ly8gYGF1dG9BcHByb3ZlQnlTZXR0aW5nYCBjb3ZlcnMgb25seSB0aGUgcGFyYW1ldGVyIGdhdGU7IGFcblx0XHQvLyBgUGVuZGluZ1Jlc3VsdENvbmZpcm1hdGlvbmAgaXMgYSBnZW51aW5lIHByb21wdCBhbmQgaXMgc3RpbGwgc3VyZmFjZWQuXG5cdFx0Y29uc3QgYXV0b0FwcHJvdmVkID0gISF0b29sQ2FsbCAmJiByZWFkVG9vbENhbGxNZXRhKHRvb2xDYWxsKS5hdXRvQXBwcm92ZUJ5U2V0dGluZyA9PT0gdHJ1ZTtcblxuXHRcdGNvbnN0IHN1cHByZXNzQXV0b0FwcHJvdmVkQ29uZmlybWF0aW9uID0gYXV0b0FwcHJvdmVkICYmIHRvb2xDYWxsPy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb247XG5cdFx0Y29uc3QgbmVlZHNDb25maXJtYXRpb24gPSAhc3VwcHJlc3NBdXRvQXBwcm92ZWRDb25maXJtYXRpb24gJiYgKHRvb2xDYWxsPy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24gfHwgdG9vbENhbGw/LnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ1Jlc3VsdENvbmZpcm1hdGlvbik7XG5cdFx0aWYgKG5lZWRzQ29uZmlybWF0aW9uICYmIHRvb2xDYWxsKSB7XG5cdFx0XHR0aGlzLl9zZXRTZXNzaW9uSW5wdXROZWVkZWQoY2hhdFVyaSwge1xuXHRcdFx0XHRpZDogY29uZmlybWF0aW9uSWQsXG5cdFx0XHRcdGtpbmQ6IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xDb25maXJtYXRpb24sXG5cdFx0XHRcdGNoYXQ6IGNoYXRVcmksXG5cdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0dG9vbENhbGwsXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcmVtb3ZlU2Vzc2lvbklucHV0TmVlZGVkKGNoYXRVcmksIGNvbmZpcm1hdGlvbklkKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb250cmlidXRvciA9IHRvb2xDYWxsPy5jb250cmlidXRvcjtcblx0XHRpZiAodG9vbENhbGw/LnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUnVubmluZyAmJiBjb250cmlidXRvcj8ua2luZCA9PT0gVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50KSB7XG5cdFx0XHR0aGlzLl9zZXRTZXNzaW9uSW5wdXROZWVkZWQoY2hhdFVyaSwge1xuXHRcdFx0XHRpZDogY2xpZW50RXhlY3V0aW9uSWQsXG5cdFx0XHRcdGtpbmQ6IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLlRvb2xDbGllbnRFeGVjdXRpb24sXG5cdFx0XHRcdGNoYXQ6IGNoYXRVcmksXG5cdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0Y2xpZW50SWQ6IGNvbnRyaWJ1dG9yLmNsaWVudElkLFxuXHRcdFx0XHR0b29sQ2FsbCxcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yZW1vdmVTZXNzaW9uSW5wdXROZWVkZWQoY2hhdFVyaSwgY2xpZW50RXhlY3V0aW9uSWQpO1xuXHRcdH1cblxuXHRcdGlmICh0b29sQ2FsbD8uc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5BdXRoUmVxdWlyZWQpIHtcblx0XHRcdHRoaXMuX3NldFNlc3Npb25JbnB1dE5lZWRlZChjaGF0VXJpLCB7XG5cdFx0XHRcdGlkOiBhdXRoZW50aWNhdGlvbklkLFxuXHRcdFx0XHRraW5kOiBTZXNzaW9uSW5wdXRSZXF1ZXN0S2luZC5Ub29sQXV0aGVudGljYXRpb24sXG5cdFx0XHRcdGNoYXQ6IGNoYXRVcmksXG5cdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0dG9vbENhbGwsXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcmVtb3ZlU2Vzc2lvbklucHV0TmVlZGVkKGNoYXRVcmksIGF1dGhlbnRpY2F0aW9uSWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRUb29sQ2FsbChjaGF0VXJpOiBQcm90b2NvbFVSSSwgdHVybklkOiBzdHJpbmcsIHRvb2xDYWxsSWQ6IHN0cmluZyk6IFRvb2xDYWxsU3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShjaGF0VXJpKTtcblx0XHRjb25zdCB0dXJuID0gc3RhdGU/LmFjdGl2ZVR1cm4/LmlkID09PSB0dXJuSWQgPyBzdGF0ZS5hY3RpdmVUdXJuIDogc3RhdGU/LnR1cm5zLmZpbmQodCA9PiB0LmlkID09PSB0dXJuSWQpO1xuXHRcdGNvbnN0IHBhcnQgPSB0dXJuPy5yZXNwb25zZVBhcnRzLmZpbmQocCA9PiBwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcC50b29sQ2FsbC50b29sQ2FsbElkID09PSB0b29sQ2FsbElkKTtcblx0XHRyZXR1cm4gcGFydD8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IHBhcnQudG9vbENhbGwgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRTZXNzaW9uSW5wdXROZWVkZWQoY2hhdFVyaTogUHJvdG9jb2xVUkksIHJlcXVlc3Q6IFNlc3Npb25JbnB1dFJlcXVlc3QpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShjaGF0VXJpKTtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmlucHV0TmVlZGVkPy5maW5kKHIgPT4gci5pZCA9PT0gcmVxdWVzdC5pZCk7XG5cdFx0aWYgKGV4aXN0aW5nICYmIGVxdWFscyhleGlzdGluZywgcmVxdWVzdCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSW5wdXROZWVkZWRTZXQsIHJlcXVlc3QgfSk7XG5cdFx0Ly8gUmVjb3JkIHRoZSBibG9ja2VyIG9uIHRoZSB0dXJuIHNvIGEgaGFuZyByZXBvcnRlZCB3aGlsZSB0aGUgcmVxdWVzdCBpc1xuXHRcdC8vIG91dHN0YW5kaW5nIGlzIHRhZ2dlZCBhcyBhbiBleHBlY3RlZCB3YWl0IG9uIHRoZSB1c2VyIHJhdGhlciB0aGFuIGFzXG5cdFx0Ly8gYW4gdW5leHBsYWluZWQgc3RhbGwsIGFuZCBzbyB0aGUgcmVwb3J0IGNhbiBuYW1lIHRoZSB0b29sIGl0IGdhdGVzLiBBXG5cdFx0Ly8gYENoYXRJbnB1dGAgZWxpY2l0YXRpb24gY2FycmllcyBuZWl0aGVyIGB0dXJuSWRgIG5vciBhIHRvb2wgY2FsbCwgc29cblx0XHQvLyBmYWxsIGJhY2sgdG8gdGhlIGNoYXQncyBhY3RpdmUgdHVybi5cblx0XHRjb25zdCBibG9ja2VkVHVybklkID0gaGFzS2V5KHJlcXVlc3QsIHsgdHVybklkOiB0cnVlIH0pID8gcmVxdWVzdC50dXJuSWQgOiB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0QWN0aXZlVHVybklkKGNoYXRVcmkpO1xuXHRcdGlmIChibG9ja2VkVHVybklkKSB7XG5cdFx0XHRjb25zdCBibG9ja2VkVG9vbENhbGxJZCA9IGhhc0tleShyZXF1ZXN0LCB7IHRvb2xDYWxsOiB0cnVlIH0pID8gcmVxdWVzdC50b29sQ2FsbC50b29sQ2FsbElkIDogdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fdHVyblRyYWNrZXIudHVybkJsb2NrZWQoY2hhdFVyaSwgYmxvY2tlZFR1cm5JZCwgcmVxdWVzdC5pZCwgcmVxdWVzdC5raW5kLCBibG9ja2VkVG9vbENhbGxJZCk7XG5cdFx0fVxuXHRcdGlmIChyZXF1ZXN0LmtpbmQgIT09IFNlc3Npb25JbnB1dFJlcXVlc3RLaW5kLkNoYXRJbnB1dCkge1xuXHRcdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9vcHRpb25zLmdldEFnZW50KHNlc3Npb25VcmkpO1xuXHRcdFx0aWYgKGFnZW50KSB7XG5cdFx0XHRcdHRoaXMuX3Rvb2xDYWxsVHJhY2tlci50b29sQ2FsbEJsb2NrZWQoYWdlbnQuaWQsIGNoYXRVcmksIHJlcXVlc3QpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZVNlc3Npb25JbnB1dE5lZWRlZChjaGF0VXJpOiBQcm90b2NvbFVSSSwgaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBwYXJzZVJlcXVpcmVkU2Vzc2lvblVyaUZyb21DaGF0VXJpKGNoYXRVcmkpO1xuXHRcdHRoaXMuX3Rvb2xDYWxsVHJhY2tlci50b29sQ2FsbFVuYmxvY2tlZChjaGF0VXJpLCBpZCk7XG5cdFx0dGhpcy5fdHVyblRyYWNrZXIudHVyblVuYmxvY2tlZChjaGF0VXJpLCBpZCk7XG5cdFx0aWYgKCF0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5pbnB1dE5lZWRlZD8uc29tZShyID0+IHIuaWQgPT09IGlkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25JbnB1dE5lZWRlZFJlbW92ZWQsIGlkIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlU2Vzc2lvbklucHV0TmVlZGVkRm9yQ2hhdChjaGF0VXJpOiBQcm90b2NvbFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBwYXJzZVJlcXVpcmVkU2Vzc2lvblVyaUZyb21DaGF0VXJpKGNoYXRVcmkpO1xuXHRcdGZvciAoY29uc3QgcmVxdWVzdCBvZiB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5pbnB1dE5lZWRlZCA/PyBbXSkge1xuXHRcdFx0aWYgKHJlcXVlc3QuY2hhdCA9PT0gY2hhdFVyaSkge1xuXHRcdFx0XHR0aGlzLl9yZW1vdmVTZXNzaW9uSW5wdXROZWVkZWQoY2hhdFVyaSwgcmVxdWVzdC5pZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2hhdElucHV0TmVlZGVkSWQoY2hhdFVyaTogUHJvdG9jb2xVUkksIHJlcXVlc3RJZDogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYGNoYXRJbnB1dDoke2NoYXRVcml9OiR7cmVxdWVzdElkfWA7XG5cdH1cblxuXHRwcml2YXRlIF90b29sQ29uZmlybWF0aW9uTmVlZGVkSWQoY2hhdFVyaTogUHJvdG9jb2xVUkksIHR1cm5JZDogc3RyaW5nLCB0b29sQ2FsbElkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgdG9vbENvbmZpcm1hdGlvbjoke2NoYXRVcml9OiR7dHVybklkfToke3Rvb2xDYWxsSWR9YDtcblx0fVxuXG5cdHByaXZhdGUgX3Rvb2xDbGllbnRFeGVjdXRpb25OZWVkZWRJZChjaGF0VXJpOiBQcm90b2NvbFVSSSwgdHVybklkOiBzdHJpbmcsIHRvb2xDYWxsSWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGB0b29sQ2xpZW50RXhlY3V0aW9uOiR7Y2hhdFVyaX06JHt0dXJuSWR9OiR7dG9vbENhbGxJZH1gO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9vbEF1dGhlbnRpY2F0aW9uTmVlZGVkSWQoY2hhdFVyaTogUHJvdG9jb2xVUkksIHR1cm5JZDogc3RyaW5nLCB0b29sQ2FsbElkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgdG9vbEF1dGhlbnRpY2F0aW9uOiR7Y2hhdFVyaX06JHt0dXJuSWR9OiR7dG9vbENhbGxJZH1gO1xuXHR9XG5cblx0Ly8gLS0tLSBJbml0aWFsaXphdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIEluaXRpYWxpemVzIGFzeW5jIHJlc291cmNlcyAodHJlZS1zaXR0ZXIgV0FTTSkgdXNlZCBmb3IgY29tbWFuZFxuXHQgKiBhdXRvLWFwcHJvdmFsLiBBd2FpdCB0aGlzIGJlZm9yZSBhbnkgc2Vzc2lvbiBldmVudHMgY2FuIGFycml2ZSB0b1xuXHQgKiBndWFyYW50ZWUgdGhhdCBhdXRvLWFwcHJvdmFsIGNoZWNrcyBhcmUgZnVsbHkgc3luY2hyb25vdXMuXG5cdCAqL1xuXHRpbml0aWFsaXplKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9wZXJtaXNzaW9uTWFuYWdlci5pbml0aWFsaXplKCk7XG5cdH1cblxuXHQvLyAtLS0tIEFnZW50IHJlZ2lzdHJhdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVycyBhIHByb2dyZXNzLXNpZ25hbCBsaXN0ZW5lciBvbiB0aGUgZ2l2ZW4gYWdlbnQgc28gdGhhdFxuXHQgKiB7QGxpbmsgQWdlbnRTaWduYWx9cyBhcmUgcm91dGVkL2Rpc3BhdGNoZWQgdGhyb3VnaCB0aGUgc3RhdGUgbWFuYWdlci5cblx0ICogUmV0dXJucyBhIGRpc3Bvc2FibGUgdGhhdCByZW1vdmVzIHRoZSBsaXN0ZW5lci5cblx0ICovXG5cdHJlZ2lzdGVyUHJvZ3Jlc3NMaXN0ZW5lcihhZ2VudDogSUFnZW50KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhZ2VudC5vbkRpZENoYXRQcm9ncmVzcyhzaWduYWwgPT4ge1xuXHRcdFx0dGhpcy5faGFuZGxlQWdlbnRTaWduYWwoYWdlbnQsIHNpZ25hbCk7XG5cdFx0fSkpO1xuXHRcdGlmIChhZ2VudC5vbkRpZEN1c3RvbWl6YXRpb25zQ2hhbmdlKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoYWdlbnQub25EaWRDdXN0b21pemF0aW9uc0NoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX3B1Ymxpc2hBZ2VudEluZm9zKHRoaXMuX29wdGlvbnMuYWdlbnRzLmdldCgpKTtcblx0XHRcdFx0dGhpcy5fcHVibGlzaFNlc3Npb25DdXN0b21pemF0aW9uc0ZvckFnZW50KGFnZW50KTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0aWYgKGFnZW50LmF1dGhlbnRpY2F0aW9uUmVxdWlyZWQpIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlcXVpcmVtZW50ID0gYWdlbnQuYXV0aGVudGljYXRpb25SZXF1aXJlZD8ucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAocmVxdWlyZW1lbnQpIHtcblx0XHRcdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZW1pdEF1dGhSZXF1aXJlZChyZXF1aXJlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJvdXRlcyBhIHNpbmdsZSBzaWduYWwgZnJvbSBgYWdlbnRgIHRvIHRoZSBjb3JyZWN0IHNlc3Npb24uXG5cdCAqXG5cdCAqIEFjdGlvbiBzaWduYWxzIHdpdGggYSBgcGFyZW50VG9vbENhbGxJZGAgYXJlIHJvdXRlZCB0byB0aGUgbWF0Y2hpbmdcblx0ICogc3ViYWdlbnQgc2Vzc2lvbi4gSWYgdGhlIHN1YmFnZW50IHNlc3Npb24gZG9lcyBub3QgZXhpc3QgeWV0ICh0aGUgU0RLXG5cdCAqIGNhbiBlbWl0IGFuIGlubmVyIGB0b29sX3N0YXJ0YCBiZWZvcmUgaXRzIGBzdWJhZ2VudF9zdGFydGVkYCksIHRoZVxuXHQgKiBzaWduYWwgaXMgYnVmZmVyZWQgaW4ge0BsaW5rIF9wZW5kaW5nU3ViYWdlbnRTaWduYWxzfSBhbmQgcmVwbGF5ZWRcblx0ICogb25jZSB0aGUgYHN1YmFnZW50X3N0YXJ0ZWRgIGFycml2ZXMuXG5cdCAqL1xuXHRwcml2YXRlIF9oYW5kbGVBZ2VudFNpZ25hbChhZ2VudDogSUFnZW50LCBzaWduYWw6IEFnZW50U2lnbmFsKTogdm9pZCB7XG5cdFx0aWYgKHNpZ25hbC5raW5kID09PSAnc3ViYWdlbnRfc3RhcnRlZCcpIHtcblx0XHRcdHRoaXMuX2hhbmRsZVN1YmFnZW50U3RhcnRlZChzaWduYWwuY2hhdC50b1N0cmluZygpLCBzaWduYWwudG9vbENhbGxJZCwgc2lnbmFsLmFnZW50TmFtZSwgc2lnbmFsLmFnZW50RGlzcGxheU5hbWUsIHNpZ25hbC5hZ2VudERlc2NyaXB0aW9uLCBzaWduYWwudGFza1Byb21wdCwgc2lnbmFsLnBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0dGhpcy5fZHJhaW5QZW5kaW5nU3ViYWdlbnRTaWduYWxzKHNpZ25hbC5jaGF0LnRvU3RyaW5nKCksIHNpZ25hbC50b29sQ2FsbElkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoc2lnbmFsLmtpbmQgPT09ICdzdWJhZ2VudF9yZXN1bWVkJykge1xuXHRcdFx0dGhpcy5fcmVzdW1lU3ViYWdlbnRTZXNzaW9uKHNpZ25hbC5jaGF0LnRvU3RyaW5nKCksIHNpZ25hbC50b29sQ2FsbElkLCBzaWduYWwubWVzc2FnZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHNpZ25hbC5raW5kID09PSAnc3ViYWdlbnRfY29tcGxldGVkJykge1xuXHRcdFx0dGhpcy5jb21wbGV0ZVN1YmFnZW50U2Vzc2lvbihzaWduYWwuY2hhdC50b1N0cmluZygpLCBzaWduYWwudG9vbENhbGxJZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHNpZ25hbC5raW5kID09PSAnc3RlZXJpbmdfY29uc3VtZWQnKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2lnbmFsLmNoYXQudG9TdHJpbmcoKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVJlbW92ZWQsXG5cdFx0XHRcdGtpbmQ6IFBlbmRpbmdNZXNzYWdlS2luZC5TdGVlcmluZyxcblx0XHRcdFx0aWQ6IHNpZ25hbC5pZCxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzaWduYWxSZXNvdXJjZSA9IHNpZ25hbC5raW5kID09PSAnYWN0aW9uJyA/IHNpZ25hbC5yZXNvdXJjZS50b1N0cmluZygpIDogc2lnbmFsLmNoYXQudG9TdHJpbmcoKTtcblx0XHRpZiAoc2lnbmFsLmtpbmQgPT09ICdhY3Rpb24nICYmICFpc0NoYXRBY3Rpb24oc2lnbmFsLmFjdGlvbikgJiYgaXNBaHBDaGF0Q2hhbm5lbChzaWduYWxSZXNvdXJjZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiBhY3Rpb24gJHtzaWduYWwuYWN0aW9uLnR5cGV9IG11c3Qgbm90IGJlIGRpc3BhdGNoZWQgb24gY2hhdCBjaGFubmVsICR7c2lnbmFsUmVzb3VyY2V9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25LZXkgPSBzaWduYWxSZXNvdXJjZTtcblxuXHRcdC8vIFJvdXRlIHNpZ25hbHMgd2l0aCBwYXJlbnRUb29sQ2FsbElkIHRvIHRoZSBzdWJhZ2VudCBzZXNzaW9uLlxuXHRcdC8vIEJvdGggYWN0aW9uIHNpZ25hbHMgYW5kIHBlbmRpbmdfY29uZmlybWF0aW9uIHNpZ25hbHMgY2FuIGNhcnJ5XG5cdFx0Ly8gYSBwYXJlbnRUb29sQ2FsbElkIFx1MjAxNCBmb3IgY2xpZW50IHRvb2xzIGluc2lkZSBhIHN1YmFnZW50IHRoZVxuXHRcdC8vIHBlcm1pc3Npb24gZmxvdyBmaXJlcyBgcGVuZGluZ19jb25maXJtYXRpb25gIGZvciBhbiBpbm5lciB0b29sXG5cdFx0Ly8gY2FsbCwgYW5kIHRoYXQgc2lnbmFsIG11c3QgYmUgcm91dGVkIHRvIHRoZSBzdWJhZ2VudCBzZXNzaW9uXG5cdFx0Ly8gKG90aGVyd2lzZSB0aGUgcmVzdWx0aW5nIENoYXRUb29sQ2FsbFJlYWR5IHdvdWxkIGxhbmQgb24gdGhlXG5cdFx0Ly8gcGFyZW50IHNlc3Npb24sIHdoaWNoIGhhcyBubyBtYXRjaGluZyBDaGF0VG9vbENhbGxTdGFydCkuXG5cdFx0Y29uc3QgcGFyZW50VG9vbENhbGxJZCA9IHNpZ25hbC5wYXJlbnRUb29sQ2FsbElkO1xuXHRcdGlmIChwYXJlbnRUb29sQ2FsbElkKSB7XG5cdFx0XHRjb25zdCBzdWJhZ2VudFNlc3Npb24gPSB0aGlzLl9zdWJhZ2VudENoYXRzLmdldChzZXNzaW9uS2V5LCBwYXJlbnRUb29sQ2FsbElkKTtcblx0XHRcdGlmIChzdWJhZ2VudFNlc3Npb24pIHtcblx0XHRcdFx0Y29uc3Qgc3ViVHVybklkID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldEFjdGl2ZVR1cm5JZChzdWJhZ2VudFNlc3Npb24uY2hhdFVyaSk7XG5cdFx0XHRcdGlmIChzdWJUdXJuSWQpIHtcblx0XHRcdFx0XHR0aGlzLl9kaXNwYXRjaEFjdGlvbkZvclNlc3Npb24oc2lnbmFsLCBzdWJhZ2VudFNlc3Npb24uY2hhdFVyaSwgc3ViVHVybklkLCAncmVtYXAnLCBhZ2VudCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0FnZW50U2lkZUVmZmVjdHNdIERyb3BwaW5nICR7dGhpcy5fZGVzY3JpYmVTaWduYWwoc2lnbmFsKX0gZm9yIGluYWN0aXZlIHN1YmFnZW50ICR7c2Vzc2lvbktleX0vJHtwYXJlbnRUb29sQ2FsbElkfWApO1xuXHRcdFx0XHRcdGlmIChzaWduYWwua2luZCA9PT0gJ3BlbmRpbmdfY29uZmlybWF0aW9uJykge1xuXHRcdFx0XHRcdFx0YWdlbnQucmVzcG9uZFRvUGVybWlzc2lvblJlcXVlc3Qoc2lnbmFsLnN0YXRlLnRvb2xDYWxsSWQsIGZhbHNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwZW5kaW5nU2lnbmFscyA9IHRoaXMuX3BlbmRpbmdTdWJhZ2VudFNpZ25hbHMuZ2V0KHNlc3Npb25LZXksIHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0aWYgKHNpZ25hbC5raW5kID09PSAncGVuZGluZ19jb25maXJtYXRpb24nICYmICFwZW5kaW5nU2lnbmFscykge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQWdlbnRTaWRlRWZmZWN0c10gRGVueWluZyBwZXJtaXNzaW9uIGZvciB1bnJvdXRhYmxlIHN1YmFnZW50ICR7c2Vzc2lvbktleX0vJHtwYXJlbnRUb29sQ2FsbElkfTogdG9vbENhbGxJZD0ke3NpZ25hbC5zdGF0ZS50b29sQ2FsbElkfWApO1xuXHRcdFx0XHRhZ2VudC5yZXNwb25kVG9QZXJtaXNzaW9uUmVxdWVzdChzaWduYWwuc3RhdGUudG9vbENhbGxJZCwgZmFsc2UpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIFN1YmFnZW50IHNlc3Npb24gZG9lcyBub3QgZXhpc3QgeWV0IFx1MjAxNCBidWZmZXIgdGhlIHNpZ25hbCBzbyB3ZSBjYW5cblx0XHRcdC8vIHJlcGxheSBpdCBhZnRlciBgc3ViYWdlbnRfc3RhcnRlZGAgYXJyaXZlcy5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtBZ2VudFNpZGVFZmZlY3RzXSBCdWZmZXJpbmcgJHt0aGlzLl9kZXNjcmliZVNpZ25hbChzaWduYWwpfSBmb3IgcGVuZGluZyBzdWJhZ2VudCAke3Nlc3Npb25LZXl9LyR7cGFyZW50VG9vbENhbGxJZH1gKTtcblx0XHRcdGxldCBidWZmZXIgPSBwZW5kaW5nU2lnbmFscztcblx0XHRcdGlmICghYnVmZmVyKSB7XG5cdFx0XHRcdGJ1ZmZlciA9IFtdO1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nU3ViYWdlbnRTaWduYWxzLnNldChidWZmZXIsIHNlc3Npb25LZXksIHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0fVxuXHRcdFx0YnVmZmVyLnB1c2goeyBzaWduYWwsIGFnZW50IH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFJvdXRlIHBlbmRpbmdfY29uZmlybWF0aW9uIHNpZ25hbHMgZm9yIHRvb2xzIGluc2lkZSBzdWJhZ2VudCBzZXNzaW9uc1xuXHRcdC8vIChsZWdhY3kgcGF0aCBmb3Igc2lnbmFscyB3aXRob3V0IGFuIGV4cGxpY2l0IHBhcmVudFRvb2xDYWxsSWQgXHUyMDE0IHRoZVxuXHRcdC8vIHRvb2wgd2FzIHByZXZpb3VzbHkgcmVnaXN0ZXJlZCB1bmRlciBpdHMgc3ViYWdlbnQgc2Vzc2lvbiBrZXkgaW5cblx0XHQvLyBfdG9vbENhbGxBZ2VudHMpLlxuXHRcdGlmIChzaWduYWwua2luZCA9PT0gJ3BlbmRpbmdfY29uZmlybWF0aW9uJykge1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnRDaGF0VXJpID0gdGhpcy5fZmluZFN1YmFnZW50Q2hhdEZvclRvb2xDYWxsKHNlc3Npb25LZXksIHNpZ25hbC5zdGF0ZS50b29sQ2FsbElkKTtcblx0XHRcdGlmIChzdWJhZ2VudENoYXRVcmkpIHtcblx0XHRcdFx0Y29uc3Qgc3ViVHVybklkID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldEFjdGl2ZVR1cm5JZChzdWJhZ2VudENoYXRVcmkpID8/ICcnO1xuXHRcdFx0XHR2b2lkIHRoaXMuX2hhbmRsZVRvb2xSZWFkeShzaWduYWwsIHN1YmFnZW50Q2hhdFVyaSwgc3ViVHVybklkLCBhZ2VudCkuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdbQWdlbnRTaWRlRWZmZWN0c10gX2hhbmRsZVRvb2xSZWFkeSBmYWlsZWQnLCBlcnIpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHR1cm5JZCA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRBY3RpdmVUdXJuSWQoc2Vzc2lvbktleSk7XG5cdFx0aWYgKHR1cm5JZCkge1xuXHRcdFx0dGhpcy5fZGlzcGF0Y2hBY3Rpb25Gb3JTZXNzaW9uKHNpZ25hbCwgc2Vzc2lvbktleSwgdHVybklkLCAncHJlc2VydmUnLCBhZ2VudCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gTm8gYWN0aXZlIHR1cm4gb24gdGhlIHNlc3Npb24uIE5vbi1hY3Rpb24gc2lnbmFscyBhcmUgc2lsZW50bHlcblx0XHQvLyBkcm9wcGVkLCBidXQgYWN0aW9uIHNpZ25hbHMgY2FuIHN0aWxsIHRhcmdldCBzZXNzaW9uLWxldmVsIHN0YXRlXG5cdFx0Ly8gc3VjaCBhcyBjdXN0b21pemF0aW9ucywgdGl0bGUsIG9yIGNvbmZpZ3VyYXRpb24uIEEgdHVybkNvbXBsZXRlXG5cdFx0Ly8gYWN0aW9uIGFsc28gZHJpdmVzIHBvc3QtdHVybiBzaWRlIGVmZmVjdHMgZXZlbiB3aGVuIHRoZSBtYXRjaGluZ1xuXHRcdC8vIHR1cm5TdGFydGVkIHdhcyBub3Qgb2JzZXJ2ZWQgYnkgdGhpcyBzaWRlLWVmZmVjdHMgaW5zdGFuY2UuXG5cdFx0Ly9cblx0XHQvLyBwZW5kaW5nX2NvbmZpcm1hdGlvbiBzaWduYWxzIG11c3QgYWxzbyBiZSBoYW5kbGVkIGhlcmU6IHdoZW4gYVxuXHRcdC8vIGhvb2stdHJpZ2dlcmVkIGNvbnRpbnVhdGlvbiBydW5zIGFmdGVyIHRoZSBwcm90b2NvbCB0dXJuIGhhc1xuXHRcdC8vIGFscmVhZHkgY29tcGxldGVkLCB0b29sIGFjdGlvbnMgYXJlIGRpc3BhdGNoZWQgKGJlbG93KSB3aXRoIGFuXG5cdFx0Ly8gZW1wdHkgdHVybklkLiBXaXRob3V0IHRoaXMsIHRoZSBwZW5kaW5nX2NvbmZpcm1hdGlvbiBpcyBzaWxlbnRseVxuXHRcdC8vIGRyb3BwZWQsIHRoZSBwZXJtaXNzaW9uIGRlZmVycmVkIG5ldmVyIHJlc29sdmVzLCBhbmQgdGhlIHNlc3Npb25cblx0XHQvLyBoYW5ncyBpbmRlZmluaXRlbHkuXG5cdFx0aWYgKHNpZ25hbC5raW5kID09PSAncGVuZGluZ19jb25maXJtYXRpb24nKSB7XG5cdFx0XHR2b2lkIHRoaXMuX2hhbmRsZVRvb2xSZWFkeShzaWduYWwsIHNlc3Npb25LZXksICcnLCBhZ2VudCkuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW0FnZW50U2lkZUVmZmVjdHNdIF9oYW5kbGVUb29sUmVhZHkgZmFpbGVkJywgZXJyKTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoc2lnbmFsLmtpbmQgPT09ICdhY3Rpb24nKSB7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSBzaWduYWwuYWN0aW9uO1xuXHRcdFx0aWYgKGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUgJiYgdGhpcy5fY2FuY2VsbGVkVHVybklkcy5nZXQoc2Vzc2lvbktleSk/LmhhcyhhY3Rpb24udHVybklkKSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRTaWRlRWZmZWN0c10gRHJvcHBpbmcgY29tcGxldGlvbiBmb3IgY2FuY2VsbGVkIHR1cm4gJHthY3Rpb24udHVybklkfSBvbiAke3Nlc3Npb25LZXl9YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uS2V5LCBhY3Rpb24pO1xuXHRcdFx0aWYgKGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUpIHtcblx0XHRcdFx0dGhpcy5fcnVuVHVybkNvbXBsZXRlU2lkZUVmZmVjdHMoc2Vzc2lvbktleSwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRGlzcGF0Y2hlcyBhIHNpZ25hbCB0byBhIHJlc29sdmVkIGNoYXQsIHByZXNlcnZpbmcgdG9wLWxldmVsIHR1cm4gaWRlbnRpdHkgb3IgcmVtYXBwaW5nIGNyb3NzLWNoYW5uZWwgc3ViYWdlbnQgYWN0aW9ucy5cblx0ICovXG5cdHByaXZhdGUgX2Rpc3BhdGNoQWN0aW9uRm9yU2Vzc2lvbihzaWduYWw6IEFnZW50U2lnbmFsLCBzZXNzaW9uS2V5OiBQcm90b2NvbFVSSSwgdHVybklkOiBzdHJpbmcsIHR1cm5JZFJvdXRpbmc6IEFnZW50U2lnbmFsVHVybklkUm91dGluZywgYWdlbnQ/OiBJQWdlbnQpOiB2b2lkIHtcblx0XHRpZiAoc2lnbmFsLmtpbmQgPT09ICdwZW5kaW5nX2NvbmZpcm1hdGlvbicpIHtcblx0XHRcdGlmIChhZ2VudCkge1xuXHRcdFx0XHR2b2lkIHRoaXMuX2hhbmRsZVRvb2xSZWFkeShzaWduYWwsIHNlc3Npb25LZXksIHR1cm5JZCwgYWdlbnQpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW0FnZW50U2lkZUVmZmVjdHNdIF9oYW5kbGVUb29sUmVhZHkgZmFpbGVkJywgZXJyKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChzaWduYWwua2luZCAhPT0gJ2FjdGlvbicpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGV0IGFjdGlvbiA9IHNpZ25hbC5hY3Rpb247XG5cdFx0aWYgKGFjdGlvbi50eXBlICE9PSBBY3Rpb25UeXBlLkNoYXRUcnVuY2F0ZWQgJiYgaGFzS2V5KGFjdGlvbiwgeyB0dXJuSWQ6IHRydWUgfSkgJiYgYWN0aW9uLnR1cm5JZCAhPT0gdHVybklkKSB7XG5cdFx0XHRpZiAodHVybklkUm91dGluZyA9PT0gJ3JlbWFwJykge1xuXHRcdFx0XHRhY3Rpb24gPSB7IC4uLmFjdGlvbiwgdHVybklkIH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRTaWRlRWZmZWN0c10gRHJvcHBpbmcgc3RhbGUgJHthY3Rpb24udHlwZX0gZm9yICR7c2Vzc2lvbktleX06IHByb2R1Y2VyVHVybklkPSR7YWN0aW9uLnR1cm5JZH0sIGFjdGl2ZVR1cm5JZD0ke3R1cm5JZH1gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9yZWNvcmRBZ2VudEFjdGlvbihzZXNzaW9uS2V5LCBhY3Rpb24pO1xuXG5cdFx0aWYgKGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0ICYmIGFnZW50KSB7XG5cdFx0XHR0aGlzLl90b29sQ2FsbEFnZW50cy5zZXQoYCR7c2Vzc2lvbktleX06JHthY3Rpb24udG9vbENhbGxJZH1gLCBhZ2VudC5pZCk7XG5cdFx0XHRjb25zdCBtb2RlbENvbnRleHQgPSB0aGlzLl90dXJuVHJhY2tlci5nZXRNb2RlbFRlbGVtZXRyeUNvbnRleHQoc2Vzc2lvbktleSwgYWN0aW9uLnR1cm5JZCk7XG5cdFx0XHQvLyBTdGFtcCB0aGUgdG9vbCBjYWxsIHN0YXJ0IGZvciBgbGFuZ3VhZ2VNb2RlbFRvb2xJbnZva2VkYCB0ZWxlbWV0cnkuXG5cdFx0XHQvLyBSZWFkeSBtYXkgcmVmaW5lIHRoZSBjb250cmlidXRvciBvbmNlIHRoZSBjb21wbGV0ZSB0b29sIG1ldGFkYXRhIGlzXG5cdFx0XHQvLyBhdmFpbGFibGUsIHNvIHRoZSB0cmFja2VyIHVwZGF0ZXMgdGhlIHNvdXJjZSBraW5kIGJlbG93IHdoZW4gbmVlZGVkLlxuXHRcdFx0dGhpcy5fdG9vbENhbGxUcmFja2VyLnRvb2xDYWxsU3RhcnRlZChhZ2VudC5pZCwgc2Vzc2lvbktleSwgYWN0aW9uLnR1cm5JZCwgYWN0aW9uLnRvb2xDYWxsSWQsIGFjdGlvbi50b29sTmFtZSwgYWN0aW9uLmNvbnRyaWJ1dG9yLCBtb2RlbENvbnRleHQ/Lm1vZGVsLCBtb2RlbENvbnRleHQ/Lm1vZGVsVGVsZW1ldHJ5S2luZCk7XG5cdFx0fSBlbHNlIGlmIChhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSkge1xuXHRcdFx0dGhpcy5fdG9vbENhbGxUcmFja2VyLnRvb2xDYWxsTWV0YWRhdGFVcGRhdGVkKHNlc3Npb25LZXksIGFjdGlvbi50b29sQ2FsbElkLCBhY3Rpb24uY29udHJpYnV0b3IpO1xuXHRcdFx0aWYgKGFjdGlvbi5jb25maXJtZWQpIHtcblx0XHRcdFx0dGhpcy5fdG9vbENhbGxUcmFja2VyLnRvb2xDYWxsRXhlY3V0aW9uU3RhcnRlZChzZXNzaW9uS2V5LCBhY3Rpb24udG9vbENhbGxJZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VXNhZ2UgJiYgYWN0aW9uLnVzYWdlLm1vZGVsICYmIGFnZW50KSB7XG5cdFx0XHRjb25zdCBtb2RlbENvbnRleHQgPSB0aGlzLl9nZXRNb2RlbFRlbGVtZXRyeUNvbnRleHQoYWdlbnQsIGFjdGlvbi51c2FnZS5tb2RlbCk7XG5cdFx0XHR0aGlzLl90dXJuVHJhY2tlci51cGRhdGVNb2RlbChzZXNzaW9uS2V5LCBhY3Rpb24udHVybklkLCBtb2RlbENvbnRleHQubW9kZWwsIG1vZGVsQ29udGV4dC5tb2RlbFRlbGVtZXRyeUtpbmQpO1xuXHRcdFx0dGhpcy5fdG9vbENhbGxUcmFja2VyLnVwZGF0ZVR1cm5Nb2RlbChzZXNzaW9uS2V5LCBhY3Rpb24udHVybklkLCBtb2RlbENvbnRleHQubW9kZWwsIG1vZGVsQ29udGV4dC5tb2RlbFRlbGVtZXRyeUtpbmQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBpc0FocENoYXRDaGFubmVsKHNlc3Npb25LZXkpID8gcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShzZXNzaW9uS2V5KSA6IHNlc3Npb25LZXk7XG5cblx0XHQvLyBTdGFtcCB0aGUgc3ViYWdlbnQgY2hhdCBVUkkgb250byB0aGUgdG9vbCBjYWxsIGFzIHNvb24gYXMgdG9vbEtpbmRcblx0XHQvLyBpcyBrbm93biwgc28gY2xpZW50cyBnZXQgaXQgZnJvbSB0aGUgd2lyZSBpbnN0ZWFkIG9mIGRlcml2aW5nIGl0LlxuXHRcdGlmIChcblx0XHRcdChhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCB8fCBhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YSB8fCBhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSlcblx0XHRcdCYmIHJlYWRUb29sQ2FsbE1ldGEoYWN0aW9uKS50b29sS2luZCA9PT0gJ3N1YmFnZW50J1xuXHRcdFx0JiYgcmVhZFRvb2xDYWxsTWV0YShhY3Rpb24pLnN1YmFnZW50Q2hhdFVyaSA9PT0gdW5kZWZpbmVkXG5cdFx0KSB7XG5cdFx0XHRhY3Rpb24gPSB7IC4uLmFjdGlvbiwgX21ldGE6IHsgLi4uYWN0aW9uLl9tZXRhLCBzdWJhZ2VudENoYXRVcmk6IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb25VcmksIGFjdGlvbi50b29sQ2FsbElkKSB9IH07XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiBhIHBhcmVudCB0b29sIGNhbGwgaGFzIGFuIGFzc29jaWF0ZWQgc3ViYWdlbnQgc2Vzc2lvbixcblx0XHQvLyBwcmVzZXJ2ZSB0aGUgc3ViYWdlbnQgY29udGVudCBtZXRhZGF0YSBpbiB0aGUgY29tcGxldGlvbiByZXN1bHQuXG5cdFx0Ly8gVGhlIFNESydzIHRvb2xfY29tcGxldGUgcHJvdmlkZXMgaXRzIG93biBjb250ZW50IHdoaWNoIHdvdWxkXG5cdFx0Ly8gb3ZlcndyaXRlIHRoZSBUb29sUmVzdWx0U3ViYWdlbnRDb250ZW50IHRoYXQgd2FzIHNldCB2aWFcblx0XHQvLyBDaGF0VG9vbENhbGxDb250ZW50Q2hhbmdlZCB3aGlsZSBydW5uaW5nLlxuXHRcdGlmIChhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSkge1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnQgPSB0aGlzLl9zdWJhZ2VudENoYXRzLmdldChzZXNzaW9uS2V5LCBhY3Rpb24udG9vbENhbGxJZCk7XG5cdFx0XHRpZiAoc3ViYWdlbnQpIHtcblx0XHRcdFx0Y29uc3QgcGFyZW50U3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25LZXkpO1xuXHRcdFx0XHRjb25zdCBydW5uaW5nQ29udGVudCA9IHRoaXMuX2dldFJ1bm5pbmdUb29sQ2FsbENvbnRlbnQocGFyZW50U3RhdGUsIHR1cm5JZCwgYWN0aW9uLnRvb2xDYWxsSWQpO1xuXHRcdFx0XHRjb25zdCBzdWJhZ2VudEVudHJ5ID0gcnVubmluZ0NvbnRlbnQuZmluZChjID0+IGhhc0tleShjLCB7IHR5cGU6IHRydWUgfSkgJiYgYy50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQpO1xuXHRcdFx0XHRpZiAoc3ViYWdlbnRFbnRyeSkge1xuXHRcdFx0XHRcdGNvbnN0IG1lcmdlZENvbnRlbnQgPSBbLi4uKGFjdGlvbi5yZXN1bHQuY29udGVudCA/PyBbXSksIHN1YmFnZW50RW50cnldO1xuXHRcdFx0XHRcdGNvbnN0IG1lcmdlZDogQ2hhdFRvb2xDYWxsQ29tcGxldGVBY3Rpb24gPSB7IC4uLmFjdGlvbiwgcmVzdWx0OiB7IC4uLmFjdGlvbi5yZXN1bHQsIGNvbnRlbnQ6IG1lcmdlZENvbnRlbnQgfSB9O1xuXHRcdFx0XHRcdGFjdGlvbiA9IG1lcmdlZDtcblx0XHRcdFx0fVxuXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25LZXksIGFjdGlvbik7XG5cblx0XHQvLyBBbnkgdHVybi1zY29wZWQgYWN0aW9uIGNvdW50cyBhcyBhY3Rpdml0eSBmb3IgdGhlIGhhbmcgd2F0Y2hkb2c6IGl0IGlzXG5cdFx0Ly8gcHJvb2YgdGhlIGFnZW50IGxvb3AgaXMgc3RpbGwgYWxpdmUsIGV2ZW4gd2hlbiB0aGUgYWN0aW9uIHByb2R1Y2VzXG5cdFx0Ly8gbm90aGluZyB2aXNpYmxlLiBTZXNzaW9uLXNjb3BlZCBhY3Rpb25zICh0aXRsZSwgY3VzdG9taXphdGlvbnMsIE1DUFxuXHRcdC8vIHN0YXRlLCBcdTIwMjYpIGFyZSBkZWxpYmVyYXRlbHkgZXhjbHVkZWQgXHUyMDE0IHRoZXkgY2FuIGFycml2ZSB3aGlsZSBhIHR1cm4gaXNcblx0XHQvLyBnZW51aW5lbHkgc3R1Y2sgYW5kIHdvdWxkIG90aGVyd2lzZSBtYXNrIHRoZSBoYW5nLlxuXHRcdGlmIChoYXNLZXkoYWN0aW9uLCB7IHR1cm5JZDogdHJ1ZSB9KSkge1xuXHRcdFx0dGhpcy5fdHVyblRyYWNrZXIubWFya0FjdGl2aXR5KHNlc3Npb25LZXksIHR1cm5JZCwgYWN0aW9uLnR5cGUpO1xuXHRcdH1cblxuXHRcdC8vIE1hcmsgZmlyc3QgdmlzaWJsZSBwcm9ncmVzcyBmb3IgVFRGVCB0ZWxlbWV0cnlcblx0XHRpZiAoYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdERlbHRhXG5cdFx0XHR8fCBhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0XG5cdFx0XHR8fCBhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydFxuXHRcdFx0fHwgYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFJlYXNvbmluZykge1xuXHRcdFx0dGhpcy5fdHVyblRyYWNrZXIubWFya0ZpcnN0UHJvZ3Jlc3Moc2Vzc2lvbktleSwgdHVybklkKTtcblx0XHR9XG5cblx0XHRpZiAoYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQpIHtcblx0XHRcdHRoaXMuX3R1cm5UcmFja2VyLnRvb2xDYWxsU3RhcnRlZChzZXNzaW9uS2V5LCB0dXJuSWQsIGFjdGlvbi50b29sQ2FsbElkLCBhY3Rpb24udG9vbE5hbWUsIGFjdGlvbi5jb250cmlidXRvcik7XG5cdFx0fSBlbHNlIGlmIChhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSkge1xuXHRcdFx0dGhpcy5fdHVyblRyYWNrZXIudG9vbENhbGxNZXRhZGF0YVVwZGF0ZWQoc2Vzc2lvbktleSwgdHVybklkLCBhY3Rpb24udG9vbENhbGxJZCwgYWN0aW9uLmNvbnRyaWJ1dG9yKTtcblx0XHR9XG5cblx0XHQvLyBBIGRlbmllZCBjb25maXJtYXRpb24gaXMgYSB0ZXJtaW5hbCB0cmFuc2l0aW9uIHRvIGBjYW5jZWxsZWRgOiB0aGVcblx0XHQvLyByZWR1Y2VyIGlnbm9yZXMgYW55IGxhdGVyIGNvbXBsZXRpb24gZm9yIHRoZSBjYWxsLCBzbyBkcm9wIGl0IGZyb21cblx0XHQvLyB0aGUgdHVybidzIGluLWZsaWdodCBzZXQgaGVyZSBvciBhIHN1YnNlcXVlbnQgaGFuZyB3b3VsZCBiZSByZXBvcnRlZFxuXHRcdC8vIGFzIGBydW5uaW5nVG9vbGAgZm9yIGEgdG9vbCB0aGF0IHdpbGwgbmV2ZXIgcnVuLiBEZW5pYWxzIHJlYWNoIHRoZVxuXHRcdC8vIGhvc3Qgb24gdGhpcyBwYXRoIGFzIHdlbGwgYXMgdmlhIGBoYW5kbGVBY3Rpb25gLlxuXHRcdGlmIChhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb25maXJtZWQgJiYgIWFjdGlvbi5hcHByb3ZlZCkge1xuXHRcdFx0dGhpcy5fdHVyblRyYWNrZXIudG9vbENhbGxFbmRlZChzZXNzaW9uS2V5LCB0dXJuSWQsIGFjdGlvbi50b29sQ2FsbElkKTtcblx0XHR9XG5cblx0XHRpZiAoYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUpIHtcblx0XHRcdHRoaXMuX3R1cm5UcmFja2VyLnRvb2xDYWxsRW5kZWQoc2Vzc2lvbktleSwgdHVybklkLCBhY3Rpb24udG9vbENhbGxJZCk7XG5cblx0XHRcdC8vIEVtaXQgYGxhbmd1YWdlTW9kZWxUb29sSW52b2tlZGAgdGVsZW1ldHJ5IGZvciB0aGUgY29tcGxldGVkIHRvb2xcblx0XHRcdC8vIGNhbGwuIGBhY3Rpb24ucmVzdWx0YCBjYXJyaWVzIGBzdWNjZXNzYC9gZXJyb3IuY29kZWAgZXZlbiBhZnRlciB0aGVcblx0XHRcdC8vIHN1YmFnZW50LWNvbnRlbnQgbWVyZ2UgYWJvdmUgKHdoaWNoIG9ubHkgdG91Y2hlcyBgcmVzdWx0LmNvbnRlbnRgKS5cblx0XHRcdHRoaXMuX3Rvb2xDYWxsVHJhY2tlci50b29sQ2FsbENvbXBsZXRlZChzZXNzaW9uS2V5LCBhY3Rpb24udG9vbENhbGxJZCwgYWN0aW9uLnJlc3VsdCk7XG5cblx0XHRcdC8vIERyb3AgYW55IGV2ZW50cyB0aGF0IHdlcmUgYnVmZmVyZWQgZm9yIGEgc3ViYWdlbnQgd2hvc2Vcblx0XHRcdC8vIGBzdWJhZ2VudF9zdGFydGVkYCBuZXZlciBhcnJpdmVkIChlLmcuIHRoZSBwYXJlbnQgdG9vbCBmYWlsZWRcblx0XHRcdC8vIGJlZm9yZSB0aGUgc3ViYWdlbnQgd2FzIGNyZWF0ZWQpLiBBIHJlZ2lzdGVyZWQgY2hpbGQgY2hhdCByZW1haW5zXG5cdFx0XHQvLyBhdmFpbGFibGUgYWNyb3NzIGNvbXBsZXRlZCB0dXJucyBzbyBpdCBjYW4gYmUgc3RlZXJlZCBhZ2Fpbi5cblx0XHRcdHRoaXMuX3BlbmRpbmdTdWJhZ2VudFNpZ25hbHMuZGVsZXRlKHNlc3Npb25LZXksIGFjdGlvbi50b29sQ2FsbElkKTtcblx0XHRcdGlmIChnZXRUb29sRmlsZUVkaXRzKGFjdGlvbi5yZXN1bHQpLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5fY2hhbmdlc2V0cy5vblRvb2xDYWxsRWRpdHNBcHBsaWVkKHNlc3Npb25VcmksIHR1cm5JZCwgdGhpcy5fdHVyblRyYWNrZXIuZ2V0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dChzZXNzaW9uS2V5LCB0dXJuSWQpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSkge1xuXHRcdFx0Y29uc3QgY2xpZW50Q29udGV4dCA9IHRoaXMuX3R1cm5UcmFja2VyLmdldENsaWVudFRlbGVtZXRyeUNvbnRleHQoc2Vzc2lvbktleSwgdHVybklkKTtcblx0XHRcdHRoaXMuX2NvbXBsZXRlVHVybihzZXNzaW9uS2V5LCB0dXJuSWQsICdzdWNjZXNzJyk7XG5cdFx0XHR0aGlzLl90b29sQ2FsbFRyYWNrZXIuY2xlYXJTZXNzaW9uKHNlc3Npb25LZXkpO1xuXHRcdFx0dGhpcy5fcnVuVHVybkNvbXBsZXRlU2lkZUVmZmVjdHMoc2Vzc2lvbktleSwgdHVybklkLCBjbGllbnRDb250ZXh0KTtcblx0XHR9XG5cblx0XHRpZiAoYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFR1cm5DYW5jZWxsZWQpIHtcblx0XHRcdHRoaXMuX2NvbXBsZXRlVHVybihzZXNzaW9uS2V5LCB0dXJuSWQsICdjYW5jZWxsZWQnKTtcblx0XHRcdHRoaXMuX3Rvb2xDYWxsVHJhY2tlci5jbGVhclNlc3Npb24oc2Vzc2lvbktleSk7XG5cdFx0XHR0aGlzLl9tYXJrU2Vzc2lvblVucmVhZChzZXNzaW9uVXJpKTtcblx0XHR9XG5cblx0XHRpZiAoYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdEVycm9yKSB7XG5cdFx0XHRjb25zdCBjbGllbnRDb250ZXh0ID0gdGhpcy5fdHVyblRyYWNrZXIuZ2V0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dChzZXNzaW9uS2V5LCB0dXJuSWQpO1xuXHRcdFx0dGhpcy5fY29tcGxldGVUdXJuKHNlc3Npb25LZXksIHR1cm5JZCwgJ2Vycm9yJywgeyBzdGFnZTogJ3Byb3ZpZGVyJywgZXJyb3I6IGFjdGlvbi5lcnJvciB9KTtcblx0XHRcdHRoaXMuX3Rvb2xDYWxsVHJhY2tlci5jbGVhclNlc3Npb24oc2Vzc2lvbktleSk7XG5cdFx0XHR0aGlzLl9jYXB0dXJlVHVybkNoZWNrcG9pbnRBbmRSZWZyZXNoKHNlc3Npb25LZXksIHR1cm5JZCwgY2xpZW50Q29udGV4dCk7XG5cdFx0XHR0aGlzLl9tYXJrU2Vzc2lvblVucmVhZChzZXNzaW9uVXJpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWNvcmRBZ2VudEFjdGlvbihzZXNzaW9uS2V5OiBQcm90b2NvbFVSSSwgYWN0aW9uOiBTdGF0ZUFjdGlvbik6IHZvaWQge1xuXHRcdGNvbnN0IGxvZyA9IHRoaXMuX29wdGlvbnMuZGlhZ25vc3RpY3NMb2c7XG5cdFx0aWYgKCFsb2cpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdHVybklkID0gaGFzS2V5KGFjdGlvbiwgeyB0dXJuSWQ6IHRydWUgfSkgJiYgdHlwZW9mIGFjdGlvbi50dXJuSWQgPT09ICdzdHJpbmcnID8gYWN0aW9uLnR1cm5JZCA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb250ZXh0ID0geyBzZXNzaW9uOiBzZXNzaW9uS2V5LCB0dXJuOiB0dXJuSWQgfTtcblx0XHRzd2l0Y2ggKGFjdGlvbi50eXBlKSB7XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdERlbHRhOlxuXHRcdFx0XHRsb2cucmVjb3JkU3RyZWFtKCdjaGF0JywgYCR7c2Vzc2lvbktleX06JHthY3Rpb24udHVybklkfTphc3Npc3RhbnQ6JHthY3Rpb24ucGFydElkfWAsICdBU1NJU1RBTlQnLCBhY3Rpb24uY29udGVudCwgY29udGV4dCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRSZWFzb25pbmc6XG5cdFx0XHRcdC8vIFRoaXMgYWN0aW9uIGNvbnRhaW5zIG9ubHkgcHJvdmlkZXItcHVibGlzaGVkIHJlYXNvbmluZyBjb250ZW50L3N1bW1hcnkuIEZvcmdlIG5ldmVyXG5cdFx0XHRcdC8vIHJlcXVlc3RzIG9yIHJlY29uc3RydWN0cyBoaWRkZW4gY2hhaW4tb2YtdGhvdWdodC5cblx0XHRcdFx0bG9nLnJlY29yZFN0cmVhbSgnY2hhdCcsIGAke3Nlc3Npb25LZXl9OiR7YWN0aW9uLnR1cm5JZH06cmVhc29uaW5nOiR7YWN0aW9uLnBhcnRJZH1gLCByZWFkQ29kZXhSZWFzb25pbmdLaW5kKGFjdGlvbikgPT09ICdzdW1tYXJ5JyA/ICdSRUFTT05JTkctU1VNTUFSWScgOiAnUkVBU09OSU5HLVBVQkxJU0hFRCcsIGFjdGlvbi5jb250ZW50LCBjb250ZXh0KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydDpcblx0XHRcdFx0aWYgKGFjdGlvbi5wYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24gJiYgYWN0aW9uLnBhcnQuY29udGVudCkge1xuXHRcdFx0XHRcdGxvZy5yZWNvcmRUZXh0KCdjaGF0JywgJ0FTU0lTVEFOVCcsIGFjdGlvbi5wYXJ0LmNvbnRlbnQsIGNvbnRleHQpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGFjdGlvbi5wYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nICYmIGFjdGlvbi5wYXJ0LmNvbnRlbnQpIHtcblx0XHRcdFx0XHRsb2cucmVjb3JkVGV4dCgnY2hhdCcsICdSRUFTT05JTkctU1VNTUFSWScsIGFjdGlvbi5wYXJ0LmNvbnRlbnQsIGNvbnRleHQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGxvZy5yZWNvcmQoJ2FnZW50JywgJ1JFU1BPTlNFLlBBUlQnLCB7IGtpbmQ6IGFjdGlvbi5wYXJ0LmtpbmQgfSwgY29udGV4dCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQ6XG5cdFx0XHRcdGxvZy5yZWNvcmQoJ3RpbWVsaW5lJywgJ1RPT0wuU1RBUlQnLCB7IHJlZjogbG9nLnJlY29yZCgndG9vbHMnLCAnVE9PTC5TVEFSVCcsIHsgdG9vbENhbGxJZDogYWN0aW9uLnRvb2xDYWxsSWQsIHRvb2xOYW1lOiBhY3Rpb24udG9vbE5hbWUsIGRpc3BsYXlOYW1lOiBhY3Rpb24uZGlzcGxheU5hbWUsIGludGVudGlvbjogYWN0aW9uLmludGVudGlvbiwgY29udHJpYnV0b3I6IGFjdGlvbi5jb250cmlidXRvciB9LCBjb250ZXh0KSwgdG9vbENhbGxJZDogYWN0aW9uLnRvb2xDYWxsSWQsIHRvb2xOYW1lOiBhY3Rpb24udG9vbE5hbWUgfSwgY29udGV4dCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbERlbHRhOlxuXHRcdFx0XHRpZiAoYWN0aW9uLmNvbnRlbnQpIHtcblx0XHRcdFx0XHRsb2cucmVjb3JkU3RyZWFtKCd0b29scycsIGAke3Nlc3Npb25LZXl9OiR7YWN0aW9uLnR1cm5JZH06dG9vbDoke2FjdGlvbi50b29sQ2FsbElkfWAsICdUT09MLkFSR1MnLCBhY3Rpb24uY29udGVudCwgeyAuLi5jb250ZXh0LCB0b29sQ2FsbElkOiBhY3Rpb24udG9vbENhbGxJZCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoYWN0aW9uLmludm9jYXRpb25NZXNzYWdlKSB7XG5cdFx0XHRcdFx0bG9nLnJlY29yZCgndG9vbHMnLCAnVE9PTC5QUk9HUkVTUycsIHsgdG9vbENhbGxJZDogYWN0aW9uLnRvb2xDYWxsSWQsIGludm9jYXRpb25NZXNzYWdlOiBhY3Rpb24uaW52b2NhdGlvbk1lc3NhZ2UgfSwgY29udGV4dCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29udGVudENoYW5nZWQ6IHtcblx0XHRcdFx0Y29uc3Qga2V5ID0gYCR7c2Vzc2lvbktleX06JHthY3Rpb24udHVybklkfToke2FjdGlvbi50b29sQ2FsbElkfWA7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSBhY3Rpb24uY29udGVudFxuXHRcdFx0XHRcdC5maWx0ZXIoY29udGVudCA9PiBoYXNLZXkoY29udGVudCwgeyB0eXBlOiB0cnVlIH0pICYmIGNvbnRlbnQudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQpXG5cdFx0XHRcdFx0Lm1hcChjb250ZW50ID0+IGNvbnRlbnQudGV4dClcblx0XHRcdFx0XHQuam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IHByZXZpb3VzID0gdGhpcy5fZGlhZ25vc3RpY1Rvb2xPdXRwdXQuZ2V0KGtleSkgPz8gJyc7XG5cdFx0XHRcdGNvbnN0IGRlbHRhID0gdGV4dC5zdGFydHNXaXRoKHByZXZpb3VzKSA/IHRleHQuc2xpY2UocHJldmlvdXMubGVuZ3RoKSA6IHRleHQ7XG5cdFx0XHRcdHRoaXMuX2RpYWdub3N0aWNUb29sT3V0cHV0LnNldChrZXksIHRleHQpO1xuXHRcdFx0XHRpZiAoZGVsdGEpIHtcblx0XHRcdFx0XHRsb2cucmVjb3JkU3RyZWFtKCd0b29scycsIGAke2tleX06b3V0cHV0YCwgdGV4dC5zdGFydHNXaXRoKHByZXZpb3VzKSA/ICdUT09MLk9VVFBVVCcgOiAnVE9PTC5PVVRQVVQtU05BUFNIT1QnLCBkZWx0YSwgeyAuLi5jb250ZXh0LCB0b29sQ2FsbElkOiBhY3Rpb24udG9vbENhbGxJZCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IGNvbnRlbnQgb2YgYWN0aW9uLmNvbnRlbnQpIHtcblx0XHRcdFx0XHRpZiAoaGFzS2V5KGNvbnRlbnQsIHsgdHlwZTogdHJ1ZSB9KSAmJiBjb250ZW50LnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5GaWxlRWRpdCkge1xuXHRcdFx0XHRcdFx0bG9nLnJlY29yZCgnZmlsZXMnLCAnRklMRS5QUkVWSUVXJywgY29udGVudCwgeyAuLi5jb250ZXh0LCB0b29sQ2FsbElkOiBhY3Rpb24udG9vbENhbGxJZCB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHk6XG5cdFx0XHRcdGxvZy5mbHVzaFN0cmVhbXMoYCR7c2Vzc2lvbktleX06JHthY3Rpb24udHVybklkfTp0b29sOiR7YWN0aW9uLnRvb2xDYWxsSWR9YCk7XG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb25zdCB0eXBlID0gYWN0aW9uLmNvbmZpcm1lZCA/ICdBUFBST1ZBTC5BVVRPJyA6ICdBUFBST1ZBTC5SRVFVRVNURUQnO1xuXHRcdFx0XHRcdGxvZy5yZWNvcmQoJ3RpbWVsaW5lJywgdHlwZSwgeyByZWY6IGxvZy5yZWNvcmQoJ3Rvb2xzJywgdHlwZSwgeyB0b29sQ2FsbElkOiBhY3Rpb24udG9vbENhbGxJZCwgaW52b2NhdGlvbk1lc3NhZ2U6IGFjdGlvbi5pbnZvY2F0aW9uTWVzc2FnZSwgY29uZmlybWF0aW9uVGl0bGU6IGFjdGlvbi5jb25maXJtYXRpb25UaXRsZSwgcmlza0Fzc2Vzc21lbnQ6IGFjdGlvbi5yaXNrQXNzZXNzbWVudCwgY29uZmlybWVkOiBhY3Rpb24uY29uZmlybWVkLCB0b29sSW5wdXQ6IGdldElubGluZVRvb2xJbnB1dChhY3Rpb24udG9vbElucHV0KSwgZWRpdHM6IGFjdGlvbi5lZGl0cyB9LCBjb250ZXh0KSwgdG9vbENhbGxJZDogYWN0aW9uLnRvb2xDYWxsSWQgfSwgY29udGV4dCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGU6IHtcblx0XHRcdFx0bG9nLmZsdXNoU3RyZWFtcyhgJHtzZXNzaW9uS2V5fToke2FjdGlvbi50dXJuSWR9OnRvb2w6JHthY3Rpb24udG9vbENhbGxJZH1gKTtcblx0XHRcdFx0bG9nLmZsdXNoU3RyZWFtcyhgJHtzZXNzaW9uS2V5fToke2FjdGlvbi50dXJuSWR9OiR7YWN0aW9uLnRvb2xDYWxsSWR9Om91dHB1dGApO1xuXHRcdFx0XHR0aGlzLl9kaWFnbm9zdGljVG9vbE91dHB1dC5kZWxldGUoYCR7c2Vzc2lvbktleX06JHthY3Rpb24udHVybklkfToke2FjdGlvbi50b29sQ2FsbElkfWApO1xuXHRcdFx0XHRsb2cucmVjb3JkKCd0aW1lbGluZScsICdUT09MLkNPTVBMRVRFJywgeyByZWY6IGxvZy5yZWNvcmQoJ3Rvb2xzJywgJ1RPT0wuQ09NUExFVEUnLCB7IHRvb2xDYWxsSWQ6IGFjdGlvbi50b29sQ2FsbElkLCByZXN1bHQ6IGFjdGlvbi5yZXN1bHQgfSwgY29udGV4dCksIHRvb2xDYWxsSWQ6IGFjdGlvbi50b29sQ2FsbElkLCBzdWNjZXNzOiBhY3Rpb24ucmVzdWx0LnN1Y2Nlc3MgfSwgY29udGV4dCk7XG5cdFx0XHRcdGNvbnN0IGVkaXRzID0gZ2V0VG9vbEZpbGVFZGl0cyhhY3Rpb24ucmVzdWx0KTtcblx0XHRcdFx0Zm9yIChjb25zdCBlZGl0IG9mIGVkaXRzKSB7XG5cdFx0XHRcdFx0Y29uc3Qgb3BlcmF0aW9uID0gIWVkaXQuYmVmb3JlID8gJ0NSRUFURScgOiAhZWRpdC5hZnRlciA/ICdERUxFVEUnIDogZWRpdC5iZWZvcmUudXJpICE9PSBlZGl0LmFmdGVyLnVyaSA/ICdSRU5BTUUnIDogJ01PRElGWSc7XG5cdFx0XHRcdFx0bG9nLnJlY29yZCgnZmlsZXMnLCBgRklMRS4ke29wZXJhdGlvbn1gLCBlZGl0LCB7IC4uLmNvbnRleHQsIHRvb2xDYWxsSWQ6IGFjdGlvbi50b29sQ2FsbElkIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbEF1dGhSZXF1aXJlZDpcblx0XHRcdFx0bG9nLnJlY29yZCgndG9vbHMnLCAnVE9PTC5BVVRIX1JFUVVJUkVEJywgeyB0b29sQ2FsbElkOiBhY3Rpb24udG9vbENhbGxJZCwgYXV0aDogYWN0aW9uLmF1dGggfSwgY29udGV4dCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbEF1dGhSZXNvbHZlZDpcblx0XHRcdFx0bG9nLnJlY29yZCgndG9vbHMnLCAnVE9PTC5BVVRIX1JFU09MVkVEJywgeyB0b29sQ2FsbElkOiBhY3Rpb24udG9vbENhbGxJZCB9LCBjb250ZXh0KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdEFjdGl2aXR5Q2hhbmdlZDpcblx0XHRcdFx0bG9nLnJlY29yZCgnYWdlbnQnLCAnQUdFTlQuQUNUSVZJVFknLCB7IGFjdGl2aXR5OiBhY3Rpb24uYWN0aXZpdHkgfSwgY29udGV4dCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRJbnB1dFJlcXVlc3RlZDpcblx0XHRcdFx0bG9nLnJlY29yZCgnYWdlbnQnLCAnVVNFUl9JTlBVVC5SRVFVRVNURUQnLCBhY3Rpb24ucmVxdWVzdCwgY29udGV4dCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVNldDpcblx0XHRcdFx0bG9nLnJlY29yZCgnYWdlbnQnLCAnTUVTU0FHRS5RVUVVRUQnLCB7IGlkOiBhY3Rpb24uaWQsIGtpbmQ6IGFjdGlvbi5raW5kIH0sIGNvbnRleHQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VSZW1vdmVkOlxuXHRcdFx0XHRsb2cucmVjb3JkKCdhZ2VudCcsICdNRVNTQUdFLkRFUVVFVUVEJywgeyBpZDogYWN0aW9uLmlkLCBraW5kOiBhY3Rpb24ua2luZCB9LCBjb250ZXh0KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFVzYWdlOlxuXHRcdFx0XHRsb2cucmVjb3JkKCdhZ2VudCcsICdUT0tFTi5VU0FHRScsIGFjdGlvbi51c2FnZSwgY29udGV4dCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGU6XG5cdFx0XHRcdGxvZy5mbHVzaFN0cmVhbXMoYCR7c2Vzc2lvbktleX06JHthY3Rpb24udHVybklkfTpgKTtcblx0XHRcdFx0bG9nLnJlY29yZCgnYWdlbnQnLCAnVFVSTi5DT01QTEVURScsIHsgZHVyYXRpb246IGFjdGlvbi5kdXJhdGlvbiB9LCBjb250ZXh0KTtcblx0XHRcdFx0bG9nLnJlY29yZCgndGltZWxpbmUnLCAnVFVSTi5DT01QTEVURScsIHsgZHVyYXRpb246IGFjdGlvbi5kdXJhdGlvbiB9LCBjb250ZXh0KTtcblx0XHRcdFx0bG9nLnJlY29yZCgnc3VtbWFyeScsICdUVVJOLkNPTVBMRVRFJywgeyBzZXNzaW9uOiBzZXNzaW9uS2V5LCB0dXJuOiBhY3Rpb24udHVybklkLCBkdXJhdGlvbjogYWN0aW9uLmR1cmF0aW9uIH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZDpcblx0XHRcdFx0bG9nLmZsdXNoU3RyZWFtcyhgJHtzZXNzaW9uS2V5fToke2FjdGlvbi50dXJuSWR9OmApO1xuXHRcdFx0XHRsb2cucmVjb3JkKCdhZ2VudCcsICdUVVJOLkNBTkNFTExFRCcsIHsgZHVyYXRpb246IGFjdGlvbi5kdXJhdGlvbiB9LCBjb250ZXh0KTtcblx0XHRcdFx0bG9nLnJlY29yZCgndGltZWxpbmUnLCAnVFVSTi5DQU5DRUxMRUQnLCB7IGR1cmF0aW9uOiBhY3Rpb24uZHVyYXRpb24gfSwgY29udGV4dCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRFcnJvcjpcblx0XHRcdFx0bG9nLmZsdXNoU3RyZWFtcyhgJHtzZXNzaW9uS2V5fToke2FjdGlvbi50dXJuSWR9OmApO1xuXHRcdFx0XHRsb2cucmVjb3JkKCd0aW1lbGluZScsICdUVVJOLkVSUk9SJywgeyByZWY6IGxvZy5yZWNvcmQoJ2Vycm9ycycsICdUVVJOLkVSUk9SJywgeyBkdXJhdGlvbjogYWN0aW9uLmR1cmF0aW9uLCBlcnJvcjogYWN0aW9uLmVycm9yIH0sIGNvbnRleHQpIH0sIGNvbnRleHQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wbGV0ZXMgYSB0dXJuJ3MgdGVsZW1ldHJ5LCBlbnJpY2hpbmcgaXQgd2l0aCB0aGUgc2Vzc2lvbidzIHdvcmtpbmctXG5cdCAqIGRpcmVjdG9yeSBzaGFwZS4gTm9ybWFsaXplcyBhIGNoYXQgY2hhbm5lbCB0byBpdHMgb3duaW5nIHNlc3Npb24gVVJJXG5cdCAqIGJlZm9yZSByZWFkaW5nIHRoZSBlZmZlY3RpdmUgd29ya2luZyBkaXJlY3Rvcmllcywgc28gcGVlci1jaGF0IC8gY2hhbm5lbFxuXHQgKiB0dXJucyByZXBvcnQgdGhlIGNvcnJlY3QgY291bnQgYW5kIG11bHRpLXJvb3QgZmxhZy5cblx0ICovXG5cdHByaXZhdGUgX2NhcHR1cmVUdXJuQ2hlY2twb2ludEFuZFJlZnJlc2goc2Vzc2lvbktleTogUHJvdG9jb2xVUkksIHR1cm5JZDogc3RyaW5nLCBjbGllbnRDb250ZXh0PzogSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gaXNBaHBDaGF0Q2hhbm5lbChzZXNzaW9uS2V5KSA/IHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmkoc2Vzc2lvbktleSkgOiBzZXNzaW9uS2V5O1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcmllcyA9IHRoaXMuX2FnZW50Q29uZmlnU2VydmljZS5nZXRFZmZlY3RpdmVXb3JraW5nRGlyZWN0b3JpZXMoc2Vzc2lvblVyaSk/Lm1hcCh3ID0+IFVSSS5wYXJzZSh3KSk7XG5cdFx0dGhpcy5fY2hlY2twb2ludFNlcnZpY2UuY2FwdHVyZVR1cm5DaGVja3BvaW50KFVSSS5wYXJzZShzZXNzaW9uVXJpKSwgVVJJLnBhcnNlKHNlc3Npb25LZXkpLCB0dXJuSWQsIHdvcmtpbmdEaXJlY3RvcmllcykudGhlbigoKSA9PiB0aGlzLl9jaGFuZ2VzZXRzLm9uVHVybkNvbXBsZXRlKHNlc3Npb25VcmksIHR1cm5JZCwgY2xpZW50Q29udGV4dCksICgpID0+IHRoaXMuX2NoYW5nZXNldHMub25UdXJuQ29tcGxldGUoc2Vzc2lvblVyaSwgdHVybklkLCBjbGllbnRDb250ZXh0KSk7XG5cdH1cblxuXHRwcml2YXRlIF9jb21wbGV0ZVR1cm4oY2hhbm5lbDogc3RyaW5nLCB0dXJuSWQ6IHN0cmluZywgcmVzdWx0OiBBZ2VudEhvc3RUdXJuUmVzdWx0LCBmYWlsdXJlPzogSUFnZW50SG9zdFR1cm5GYWlsdXJlKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGlzQWhwQ2hhdENoYW5uZWwoY2hhbm5lbCkgPyBwYXJzZVJlcXVpcmVkU2Vzc2lvblVyaUZyb21DaGF0VXJpKGNoYW5uZWwpIDogY2hhbm5lbDtcblx0XHRjb25zdCBmb2xkZXJDb3VudCA9IHRoaXMuX2FnZW50Q29uZmlnU2VydmljZS5nZXRFZmZlY3RpdmVXb3JraW5nRGlyZWN0b3JpZXMoc2Vzc2lvblVyaSk/Lmxlbmd0aCA/PyAwO1xuXHRcdHRoaXMuX3R1cm5UcmFja2VyLnR1cm5Db21wbGV0ZWQoY2hhbm5lbCwgdHVybklkLCByZXN1bHQsIGZhaWx1cmUsIHsgaXNNdWx0aVJvb3Q6IGZvbGRlckNvdW50ID4gMSwgZm9sZGVyQ291bnQgfSk7XG5cdH1cblxuXHQvKipcblx0ICogUG9zdC10dXJuIHNpZGUgZWZmZWN0czogZmx1c2ggYW55IHBlbmRpbmcgZGVib3VuY2VkIGRpZmYgY29tcHV0YXRpb24sXG5cdCAqIGNvbXB1dGUgZmluYWwgZGlmZnMgaW1tZWRpYXRlbHksIGRyYWluIHRoZSBuZXh0IHF1ZXVlZCBtZXNzYWdlLCBhbmRcblx0ICogbm90aWZ5IHRoZSBob3N0IHNvIGl0IGNhbiByZWZyZXNoIGdpdCBzdGF0ZS5cblx0ICovXG5cdHByaXZhdGUgX3J1blR1cm5Db21wbGV0ZVNpZGVFZmZlY3RzKHNlc3Npb25LZXk6IFByb3RvY29sVVJJLCB0dXJuSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgY2xpZW50Q29udGV4dD86IElBZ2VudEhvc3RDbGllbnRUZWxlbWV0cnlDb250ZXh0KTogdm9pZCB7XG5cdFx0Ly8gQ2hlY2twb2ludHMsIGNoYW5nZXNldHMgYW5kIHRoZSBob3N0IGdpdC1yZWZyZXNoIG5vdGlmaWNhdGlvbiBhcmVcblx0XHQvLyBzY29wZWQgdG8gdGhlIG93bmluZyBzZXNzaW9uJ3Mgd29ya2luZyB0cmVlLCB3aGljaCBwZWVyIGNoYXRzXG5cdFx0Ly8gc2hhcmUuIE5vcm1hbGl6ZSBhbiBhZGRpdGlvbmFsLWNoYXQgY2hhbm5lbCB0byBpdHMgc2Vzc2lvbiBmb3Jcblx0XHQvLyB0aG9zZSwgd2hpbGUga2VlcGluZyB0aGUgb3JpZ2luYWwgY2hhbm5lbCBmb3IgcGVyLWNoYXQgcXVldWVkXG5cdFx0Ly8gbWVzc2FnZSBjb25zdW1wdGlvbiAocXVldWVzIGxpdmUgb24gdGhlIGNoYXQgc3RhdGUpLiBGb3IgdGhlXG5cdFx0Ly8gZGVmYXVsdCBjaGF0IC8gc2luZ2xlLWNoYXQgY2FzZSBgc2Vzc2lvbktleWAgaXMgYWxyZWFkeSB0aGVcblx0XHQvLyBzZXNzaW9uIFVSSSwgc28gdGhpcyBpcyBhIG5vLW9wLlxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBpc0FocENoYXRDaGFubmVsKHNlc3Npb25LZXkpID8gcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShzZXNzaW9uS2V5KSA6IHNlc3Npb25LZXk7XG5cdFx0Ly8gQ2FwdHVyZSB0aGUgZW5kLW9mLXR1cm4gZ2l0IGNoZWNrcG9pbnQgQkVGT1JFIG5vdGlmeWluZyB0aGVcblx0XHQvLyBjaGFuZ2VzZXQgc2VydmljZSBzbyB0aGUgcGVyLXR1cm4gY2hhbmdlc2V0IHJlY29tcHV0ZSBjYW4gdGFrZVxuXHRcdC8vIHRoZSBhdXRob3JpdGF0aXZlIGdpdC1kaWZmIGZhc3QgcGF0aCAod2hpY2ggaW5jbHVkZXMgdGVybWluYWwtdG9vbFxuXHRcdC8vIGVkaXRzIHRoZSBGaWxlRWRpdFRyYWNrZXIgbWlzc2VzKS4gVGhlIGNhcHR1cmUgaXMgYmVzdC1lZmZvcnQgXHUyMDE0XG5cdFx0Ly8gYW55IGZhaWx1cmUgbG9ncyBhbmQgdGhlIGNoYW5nZXNldCBwaXBlbGluZSBmYWxscyBiYWNrIHRvIHRoZVxuXHRcdC8vIGBmaWxlX2VkaXRzYC1iYXNlZCBwYXRoLiBXZSBkb24ndCBibG9jayBzdWJzZXF1ZW50IHNpZGUgZWZmZWN0c1xuXHRcdC8vIChxdWV1ZWQgbWVzc2FnZSBkcmFpbiwgaG9zdCBub3RpZmljYXRpb24pIG9uIHRoZSBjaGFuZ2VzZXRcblx0XHQvLyBjb21wbGV0aW9uIHNpbmNlIHRob3NlIGhhdmUgYWx3YXlzIGJlZW4gZmlyZS1hbmQtZm9yZ2V0OyB0aGVcblx0XHQvLyBvcmRlcmluZyBndWFyYW50ZWUgd2UgY2FyZSBhYm91dCBpcyBjaGVja3BvaW50LXRoZW4tY2hhbmdlc2V0LlxuXHRcdGlmICh0dXJuSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gUmVzb2x2ZWQgaGVyZSByYXRoZXIgdGhhbiBpbnNpZGUgdGhlIGNoZWNrcG9pbnQgc2VydmljZSBzbyB0aGVcblx0XHRcdC8vIHJlcG9zaXRvcmllcyBhIGNoZWNrcG9pbnQgYWN0cyBvbiBhcmUgYWx3YXlzIGV4cGxpY2l0IGF0IHRoZVxuXHRcdFx0Ly8gY2FsbCBzaXRlLiBOb3RlIHRoZSBjaGFuZ2VzZXQgc2VydmljZSBiZWxvdyBkZWxpYmVyYXRlbHkga2VlcHNcblx0XHRcdC8vIGl0cyBvd24gcmVzb2x1dGlvbjogYG9uVHVybkNvbXBsZXRlYCBvbmx5IHNjaGVkdWxlcyBkZWZlcnJlZFxuXHRcdFx0Ly8gcmVjb21wdXRlcyB0aGF0IGFyZSBzaGFyZWQgd2l0aCBzdWJzY3JpcHRpb24sIHRydW5jYXRpb24gYW5kXG5cdFx0XHQvLyBtaWQtdHVybi1kZWJvdW5jZSBlbnRyeSBwb2ludHMsIHNvIGl0IGhhcyBubyBzaW5nbGUgcG9pbnQgYXRcblx0XHRcdC8vIHdoaWNoIGEgY2FsbGVyLXN1cHBsaWVkIHNldCB3b3VsZCBhcHBseS5cblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcmllcyA9IHRoaXMuX2FnZW50Q29uZmlnU2VydmljZS5nZXRFZmZlY3RpdmVXb3JraW5nRGlyZWN0b3JpZXMoc2Vzc2lvblVyaSk/Lm1hcCh3ID0+IFVSSS5wYXJzZSh3KSk7XG5cdFx0XHR0aGlzLl9jaGVja3BvaW50U2VydmljZS5jYXB0dXJlVHVybkNoZWNrcG9pbnQoVVJJLnBhcnNlKHNlc3Npb25VcmkpLCBVUkkucGFyc2Uoc2Vzc2lvbktleSksIHR1cm5JZCwgd29ya2luZ0RpcmVjdG9yaWVzKS50aGVuKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fY2hhbmdlc2V0cy5vblR1cm5Db21wbGV0ZShzZXNzaW9uVXJpLCB0dXJuSWQsIGNsaWVudENvbnRleHQpO1xuXHRcdFx0fSwgZXJyID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTaWRlRWZmZWN0c10gVHVybiBjaGVja3BvaW50IGNhcHR1cmUgZmFpbGVkIGZvciAke3Nlc3Npb25Vcml9LyR7dHVybklkfTogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHRcdHRoaXMuX2NoYW5nZXNldHMub25UdXJuQ29tcGxldGUoc2Vzc2lvblVyaSwgdHVybklkLCBjbGllbnRDb250ZXh0KTtcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9jaGFuZ2VzZXRzLm9uVHVybkNvbXBsZXRlKHNlc3Npb25VcmksIHR1cm5JZCwgY2xpZW50Q29udGV4dCk7XG5cdFx0fVxuXHRcdHRoaXMuX3RyeUNvbnN1bWVOZXh0UXVldWVkTWVzc2FnZShzZXNzaW9uS2V5KTtcblx0XHR0aGlzLl9vcHRpb25zLm9uVHVybkNvbXBsZXRlKHNlc3Npb25VcmkpO1xuXG5cdFx0Ly8gQWZ0ZXIgdGhlIGZpcnN0IHR1cm4gY29tcGxldGVzLCByZWZpbmUgdGhlIGF1dG8tZ2VuZXJhdGVkIHRpdGxlIHVzaW5nXG5cdFx0Ly8gdGhlIGZ1bGwgZmlyc3QtdHVybiBjb250ZXh0IChyZXF1ZXN0ICsgcmVzcG9uc2UpLiBOby1vcCBmb3IgbGF0ZXJcblx0XHQvLyB0dXJucyBvciB3aGVuIHRoZSB0aXRsZSBoYXMgc2luY2UgYmVlbiBjaGFuZ2VkLiBgc2Vzc2lvbktleWAgbWF5IGJlIGFuXG5cdFx0Ly8gYWRkaXRpb25hbCBjaGF0IGNoYW5uZWw7IHJvdXRlIGl0IGFzIGBjaGF0Q2hhbm5lbGAgc28gdGhlIHJlZmluZW1lbnRcblx0XHQvLyB0YXJnZXRzIHRoYXQgY2hhdCdzIHRpdGxlLCBtaXJyb3JpbmcgYHNlZWRUaXRsZUZyb21GaXJzdE1lc3NhZ2VgLlxuXHRcdGNvbnN0IHRpdGxlQ2hhdENoYW5uZWwgPSBpc0FocENoYXRDaGFubmVsKHNlc3Npb25LZXkpICYmICFpc0RlZmF1bHRDaGF0VXJpKHNlc3Npb25LZXkpID8gc2Vzc2lvbktleSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLl90aXRsZUNvbnRyb2xsZXIucmVmaW5lVGl0bGVGcm9tRmlyc3RUdXJuKHNlc3Npb25VcmksIHRpdGxlQ2hhdENoYW5uZWwpO1xuXG5cdFx0Ly8gQSBjb21wbGV0ZWQgdHVybiBwcm9kdWNlcyBuZXcgb3V0cHV0IHRoZSB1c2VyIG1heSBub3QgaGF2ZSBzZWVuLiBSb3V0ZVxuXHRcdC8vIHN1YmFnZW50IHR1cm5zIHRvIHRoZWlyIG93bmluZyBzZXNzaW9uIHRvbyAoYSBiYWNrZ3JvdW5kIHN1YmFnZW50IGNhblxuXHRcdC8vIGNvbXBsZXRlIGFmdGVyIHRoZSBwYXJlbnQgdHVybikuIEVhY2ggY2xpZW50IGtlZXBzIGl0cyBhY3RpdmUgc2Vzc2lvblxuXHRcdC8vIHJlYWQ7IGBfbWFya1Nlc3Npb25VbnJlYWRgIGlzIGlkZW1wb3RlbnQuXG5cdFx0dGhpcy5fbWFya1Nlc3Npb25VbnJlYWQoc2Vzc2lvblVyaSk7XG5cdH1cblxuXHRwcml2YXRlIF9tYXJrU2Vzc2lvblVucmVhZChzZXNzaW9uOiBQcm90b2NvbFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IHN0YXR1cyA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3VtbWFyeShzZXNzaW9uKT8uc3RhdHVzID8/IDA7XG5cdFx0aWYgKCEoc3RhdHVzICYgU2Vzc2lvblN0YXR1cy5Jc1JlYWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFBlcnNpc3RlbmNlIHJpZGVzIHRoZSBlbnZlbG9wZSBvYnNlcnZlciBzZXQgdXAgaW4gdGhlIGNvbnN0cnVjdG9yLlxuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbklzUmVhZENoYW5nZWQsIGlzUmVhZDogZmFsc2UgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9kZXNjcmliZVNpZ25hbChzaWduYWw6IEFnZW50U2lnbmFsKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gc2lnbmFsLmtpbmQgPT09ICdhY3Rpb24nID8gYGFjdGlvbigke3NpZ25hbC5hY3Rpb24udHlwZX0pYCA6IHNpZ25hbC5raW5kO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlcGxheXMgYW55IHNpZ25hbHMgdGhhdCB3ZXJlIGJ1ZmZlcmVkIHdoaWxlIHdhaXRpbmcgZm9yXG5cdCAqIGBzdWJhZ2VudF9zdGFydGVkYCB0byBjcmVhdGUgdGhlIHN1YmFnZW50IHNlc3Npb24uIENhbGxlZCBpbW1lZGlhdGVseVxuXHQgKiBhZnRlciBgX2hhbmRsZVN1YmFnZW50U3RhcnRlZGAuXG5cdCAqL1xuXHRwcml2YXRlIF9kcmFpblBlbmRpbmdTdWJhZ2VudFNpZ25hbHMocGFyZW50Q2hhdFVSSTogUHJvdG9jb2xVUkksIHBhcmVudFRvb2xDYWxsSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGJ1ZmZlciA9IHRoaXMuX3BlbmRpbmdTdWJhZ2VudFNpZ25hbHMuZ2V0KHBhcmVudENoYXRVUkksIHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdGlmICghYnVmZmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3BlbmRpbmdTdWJhZ2VudFNpZ25hbHMuZGVsZXRlKHBhcmVudENoYXRVUkksIHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtBZ2VudFNpZGVFZmZlY3RzXSBEcmFpbmluZyAke2J1ZmZlci5sZW5ndGh9IGJ1ZmZlcmVkIHNpZ25hbChzKSBmb3Igc3ViYWdlbnQgJHtwYXJlbnRDaGF0VVJJfS8ke3BhcmVudFRvb2xDYWxsSWR9YCk7XG5cdFx0Zm9yIChjb25zdCB7IHNpZ25hbCwgYWdlbnQgfSBvZiBidWZmZXIpIHtcblx0XHRcdHRoaXMuX2hhbmRsZUFnZW50U2lnbmFsKGFnZW50LCBzaWduYWwpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLS0gU3ViYWdlbnQgc2Vzc2lvbiBtYW5hZ2VtZW50IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogU3RhcnRzIHRoZSBzdWJhZ2VudCB0dXJuIGluIHJlc3BvbnNlIHRvIGEgYHN1YmFnZW50X3N0YXJ0ZWRgIGV2ZW50IGFuZFxuXHQgKiB3aXJlcyB0aGUgcGFyZW50IHRvb2wgY2FsbCB0byB0aGUgc3ViYWdlbnQgY2hhdC4gVGhlIHN1YmFnZW50IGNoYXQnc1xuXHQgKiBjYXRhbG9nIG1lbWJlcnNoaXAgaXMgb3duZWQgYnkgdGhlIHNwYXduIGNoYW5uZWxcblx0ICogKHtAbGluayBBZ2VudFNlcnZpY2UuX29uQ2hhdFNwYXduZWR9KSwgd2hpY2ggdGhlIG9yY2hlc3RyYXRvciBhcHBsaWVzXG5cdCAqIGJlZm9yZSB0aGlzIHJ1bnMsIHNvIHRoaXMgb25seSBkcml2ZXMgdGhlIHR1cm4vdHJhY2tpbmcvcGFyZW50IGNvbnRlbnRcblx0ICogXHUyMDE0IGl0IGRvZXMgbm90IGFkZCB0aGUgY2hhdC5cblx0ICpcblx0ICogYGNoYXRVUklgIGlzIGFsd2F5cyB0aGUgYWdlbnQncyB0b3AtbGV2ZWwgY2hhdDogdGhlIHN1YmFnZW50IGlzXG5cdCAqIHJlZ2lzdGVyZWQgKGFuZCBpbm5lciBldmVudHMgcm91dGVkKSB1bmRlciBpdCBiZWNhdXNlIGlubmVyLXRvb2xcblx0ICogc2lnbmFscyBjYXJyeSB0aGUgdG9wLWxldmVsIGNoYXQgYXMgdGhlaXIgcmVzb3VyY2UuIGBzcGF3bmluZ1Rvb2xQYXJlbnRJZGAsXG5cdCAqIHdoZW4gc2V0LCBpcyB0aGUgdG9vbCBjYWxsIG9uZSBsZXZlbCB1cCBmcm9tIHRoZSBzcGF3bmluZyBgdG9vbENhbGxJZGBcblx0ICogXHUyMDE0IHRoZSB0b29sIGNhbGwgaW4gd2hvc2UgKHN1YmFnZW50KSBjaGF0IHRoZSBzcGF3bmluZyB0b29sIGxpdmVzIFx1MjAxNCBhbmRcblx0ICogaXMgdXNlZCB0byByb3V0ZSB0aGUgZGlzY292ZXJ5IGNvbnRlbnQgYmxvY2sgdG8gdGhhdCBpbW1lZGlhdGUgcGFyZW50XG5cdCAqIGNoYXQuIFNpbmNlIHN1YmFnZW50IGNoYXRzIGFyZSBmbGF0IChrZXllZCBvZmYgdGhlIHJvb3Qgc2Vzc2lvbiksIHRoaXNcblx0ICogb25lLWhvcCByZWZlcmVuY2UgcmVzb2x2ZXMgdGhlIHBhcmVudCBjaGF0IGF0IGFueSBuZXN0aW5nIGRlcHRoLlxuXHQgKi9cblx0cHJpdmF0ZSBfaGFuZGxlU3ViYWdlbnRTdGFydGVkKFxuXHRcdGNoYXRVUkk6IFByb3RvY29sVVJJLFxuXHRcdHRvb2xDYWxsSWQ6IHN0cmluZyxcblx0XHRhZ2VudE5hbWU6IHN0cmluZyxcblx0XHRhZ2VudERpc3BsYXlOYW1lOiBzdHJpbmcsXG5cdFx0YWdlbnREZXNjcmlwdGlvbj86IHN0cmluZyxcblx0XHR0YXNrUHJvbXB0Pzogc3RyaW5nLFxuXHRcdHNwYXduaW5nVG9vbFBhcmVudElkPzogc3RyaW5nLFxuXHQpOiB2b2lkIHtcblx0XHRjb25zdCBwYXJlbnRTZXNzaW9uVXJpID0gcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShjaGF0VVJJKTtcblx0XHRjb25zdCBzdWJhZ2VudENoYXRVcmkgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShwYXJlbnRTZXNzaW9uVXJpLCB0b29sQ2FsbElkKTtcblxuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc3ViYWdlbnRDaGF0cy5nZXQoY2hhdFVSSSwgdG9vbENhbGxJZCk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHR0aGlzLl9yZXN1bWVTdWJhZ2VudFNlc3Npb24oY2hhdFVSSSwgdG9vbENhbGxJZCwgdGFza1Byb21wdCA/IHsgdGV4dDogdGFza1Byb21wdCwgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9IDogdW5kZWZpbmVkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtBZ2VudFNpZGVFZmZlY3RzXSBTdGFydGluZyBzdWJhZ2VudCB0dXJuOiAke3N1YmFnZW50Q2hhdFVyaX0gKHBhcmVudD0ke2NoYXRVUkl9LCB0b29sQ2FsbElkPSR7dG9vbENhbGxJZH0pYCk7XG5cblx0XHQvLyBUaGUgc3Bhd25pbmcgdG9vbCBjYWxsIGxpdmVzIGluIHRoZSBpbW1lZGlhdGUgcGFyZW50IGNoYXQgKHRvcC1sZXZlbCwgb3IgdGhlIHBhcmVudCBzdWJhZ2VudCBjaGF0IHdoZW4gbmVzdGVkKS5cblx0XHRjb25zdCBjb250ZW50Q2hhdFVyaSA9IHNwYXduaW5nVG9vbFBhcmVudElkXG5cdFx0XHQ/IHRoaXMuX3N1YmFnZW50Q2hhdHMuZ2V0KGNoYXRVUkksIHNwYXduaW5nVG9vbFBhcmVudElkKT8uY2hhdFVyaSA/PyBjaGF0VVJJXG5cdFx0XHQ6IGNoYXRVUkk7XG5cblx0XHQvLyBTZWVkIHRoZSBzdWJhZ2VudCdzIG9wZW5pbmcgcmVxdWVzdCB3aXRoIHRoZSBkZWxlZ2F0ZWQgdGFzayBwcm9tcHQsXG5cdFx0Ly8gc3VwcGxpZWQgYnkgdGhlIHByb3ZpZGVyIG9uIHRoZSBgc3ViYWdlbnRfc3RhcnRlZGAgc2lnbmFsLlxuXHRcdGNvbnN0IHR1cm5JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHBhcmVudFR1cm5JZCA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRBY3RpdmVUdXJuSWQoY29udGVudENoYXRVcmkpO1xuXHRcdGNvbnN0IHBhcmVudENsaWVudENvbnRleHQgPSBwYXJlbnRUdXJuSWQgPyB0aGlzLl90dXJuVHJhY2tlci5nZXRDbGllbnRUZWxlbWV0cnlDb250ZXh0KGNvbnRlbnRDaGF0VXJpLCBwYXJlbnRUdXJuSWQpIDogdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzdWJhZ2VudENoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkLFxuXHRcdFx0c3RhcnRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6IHRhc2tQcm9tcHQgPz8gJycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9KTtcblx0XHRjb25zdCBhZ2VudCA9IHRoaXMuX29wdGlvbnMuZ2V0QWdlbnQocGFyZW50U2Vzc2lvblVyaSk7XG5cdFx0aWYgKGFnZW50KSB7XG5cdFx0XHR0aGlzLl90dXJuVHJhY2tlci50dXJuU3RhcnRlZChhZ2VudC5pZCwgc3ViYWdlbnRDaGF0VXJpLCB0dXJuSWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgcGFyZW50Q2xpZW50Q29udGV4dCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3ViYWdlbnRDaGF0cy5zZXQoeyBwYXJlbnRDaGF0VXJpOiBjaGF0VVJJLCB0b29sQ2FsbElkLCBzZXNzaW9uVXJpOiBwYXJlbnRTZXNzaW9uVXJpLCBjaGF0VXJpOiBzdWJhZ2VudENoYXRVcmksIHR1cm5TdG9wV2F0Y2g6IFN0b3BXYXRjaC5jcmVhdGUoZmFsc2UpIH0sIGNoYXRVUkksIHRvb2xDYWxsSWQpO1xuXG5cdFx0Ly8gRGlzcGF0Y2ggdGhlIGRpc2NvdmVyeSBjb250ZW50IG9uIHRoZSBzcGF3bmluZyB0b29sIGNhbGwncyBvd24gY2hhdDsgdGhlIHRvcC1sZXZlbCBjaGF0IGlzIGEgbm8tb3Agd2hlbiBuZXN0ZWQuXG5cdFx0aWYgKHBhcmVudFR1cm5JZCkge1xuXHRcdFx0Y29uc3QgcGFyZW50U3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGNvbnRlbnRDaGF0VXJpKTtcblx0XHRcdGNvbnN0IGV4aXN0aW5nQ29udGVudCA9IHRoaXMuX2dldFJ1bm5pbmdUb29sQ2FsbENvbnRlbnQocGFyZW50U3RhdGUsIHBhcmVudFR1cm5JZCwgdG9vbENhbGxJZCk7XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY29udGVudENoYXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb250ZW50Q2hhbmdlZCxcblx0XHRcdFx0dHVybklkOiBwYXJlbnRUdXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHQuLi5leGlzdGluZ0NvbnRlbnQsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlN1YmFnZW50LFxuXHRcdFx0XHRcdFx0cmVzb3VyY2U6IHN1YmFnZW50Q2hhdFVyaSxcblx0XHRcdFx0XHRcdHRpdGxlOiBhZ2VudERpc3BsYXlOYW1lLFxuXHRcdFx0XHRcdFx0YWdlbnROYW1lLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGFnZW50RGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBjdXJyZW50IGNvbnRlbnQgYXJyYXkgZnJvbSBhIHJ1bm5pbmcgdG9vbCBjYWxsLCBpZiBhbnkuXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRSdW5uaW5nVG9vbENhbGxDb250ZW50KFxuXHRcdHN0YXRlOiBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCB8IHVuZGVmaW5lZCxcblx0XHR0dXJuSWQ6IHN0cmluZyxcblx0XHR0b29sQ2FsbElkOiBzdHJpbmcsXG5cdCk6IFRvb2xSZXN1bHRDb250ZW50W10ge1xuXHRcdGlmICghc3RhdGU/LmFjdGl2ZVR1cm4gfHwgc3RhdGUuYWN0aXZlVHVybi5pZCAhPT0gdHVybklkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgcnAgb2Ygc3RhdGUuYWN0aXZlVHVybi5yZXNwb25zZVBhcnRzKSB7XG5cdFx0XHRpZiAocnAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBycC50b29sQ2FsbC50b29sQ2FsbElkID09PSB0b29sQ2FsbElkICYmIHJwLnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUnVubmluZykge1xuXHRcdFx0XHRyZXR1cm4gcnAudG9vbENhbGwuY29udGVudCA/IFsuLi5ycC50b29sQ2FsbC5jb250ZW50XSA6IFtdO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwcml2YXRlIF90dXJuRHVyYXRpb24oc3RvcFdhdGNoOiBTdG9wV2F0Y2ggfCB1bmRlZmluZWQpOiBudW1iZXIge1xuXHRcdGNvbnN0IGVsYXBzZWQgPSBzdG9wV2F0Y2g/LmVsYXBzZWQoKTtcblx0XHRyZXR1cm4gdHlwZW9mIGVsYXBzZWQgPT09ICdudW1iZXInICYmIE51bWJlci5pc0Zpbml0ZShlbGFwc2VkKSA/IE1hdGgubWF4KDAsIGVsYXBzZWQpIDogMDtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc3VtZVN1YmFnZW50U2Vzc2lvbihwYXJlbnRDaGF0VVJJOiBQcm90b2NvbFVSSSwgdG9vbENhbGxJZDogc3RyaW5nLCBtZXNzYWdlOiBNZXNzYWdlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3ViYWdlbnQgPSB0aGlzLl9zdWJhZ2VudENoYXRzLmdldChwYXJlbnRDaGF0VVJJLCB0b29sQ2FsbElkKTtcblx0XHRpZiAoIXN1YmFnZW50KSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQWdlbnRTaWRlRWZmZWN0c10gQ2Fubm90IHJlc3VtZSB1bmtub3duIHN1YmFnZW50ICR7cGFyZW50Q2hhdFVSSX0vJHt0b29sQ2FsbElkfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc3RhdGVNYW5hZ2VyLmdldEFjdGl2ZVR1cm5JZChzdWJhZ2VudC5jaGF0VXJpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHR1cm5JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHBhcmVudFR1cm5JZCA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRBY3RpdmVUdXJuSWQocGFyZW50Q2hhdFVSSSk7XG5cdFx0Y29uc3QgcGFyZW50Q2xpZW50Q29udGV4dCA9IHBhcmVudFR1cm5JZCA/IHRoaXMuX3R1cm5UcmFja2VyLmdldENsaWVudFRlbGVtZXRyeUNvbnRleHQocGFyZW50Q2hhdFVSSSwgcGFyZW50VHVybklkKSA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtBZ2VudFNpZGVFZmZlY3RzXSBSZXN1bWluZyBzdWJhZ2VudCB0dXJuOiAke3N1YmFnZW50LmNoYXRVcml9IChwYXJlbnQ9JHtwYXJlbnRDaGF0VVJJfSwgdG9vbENhbGxJZD0ke3Rvb2xDYWxsSWR9KWApO1xuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzdWJhZ2VudC5jaGF0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdHR1cm5JZCxcblx0XHRcdHN0YXJ0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0bWVzc2FnZTogbWVzc2FnZSA/PyB7IHRleHQ6ICcnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9vcHRpb25zLmdldEFnZW50KHN1YmFnZW50LnNlc3Npb25VcmkpO1xuXHRcdGlmIChhZ2VudCkge1xuXHRcdFx0dGhpcy5fdHVyblRyYWNrZXIudHVyblN0YXJ0ZWQoYWdlbnQuaWQsIHN1YmFnZW50LmNoYXRVcmksIHR1cm5JZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBwYXJlbnRDbGllbnRDb250ZXh0KTtcblx0XHR9XG5cdFx0dGhpcy5fc3ViYWdlbnRDaGF0cy5zZXQoeyAuLi5zdWJhZ2VudCwgdHVyblN0b3BXYXRjaDogU3RvcFdhdGNoLmNyZWF0ZShmYWxzZSkgfSwgcGFyZW50Q2hhdFVSSSwgdG9vbENhbGxJZCk7XG5cdH1cblxuXHQvKipcblx0ICogQ2FuY2VscyBhbGwgYWN0aXZlIHN1YmFnZW50IHNlc3Npb25zIGZvciBhIGdpdmVuIHBhcmVudCBzZXNzaW9uLlxuXHQgKi9cblx0Y2FuY2VsU3ViYWdlbnRTZXNzaW9ucyhwYXJlbnRDaGF0VVJJOiBQcm90b2NvbFVSSSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgc3ViYWdlbnQgb2YgdGhpcy5fc3ViYWdlbnRDaGF0cy5nZXRBbGwocGFyZW50Q2hhdFVSSSkpIHtcblx0XHRcdGNvbnN0IHR1cm5JZCA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRBY3RpdmVUdXJuSWQoc3ViYWdlbnQuY2hhdFVyaSk7XG5cdFx0XHRpZiAodHVybklkKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzdWJhZ2VudC5jaGF0VXJpLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZCxcblx0XHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdFx0ZHVyYXRpb246IHRoaXMuX3R1cm5EdXJhdGlvbihzdWJhZ2VudC50dXJuU3RvcFdhdGNoKSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuX2NvbXBsZXRlVHVybihzdWJhZ2VudC5jaGF0VXJpLCB0dXJuSWQsICdjYW5jZWxsZWQnKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Rvb2xDYWxsVHJhY2tlci5jbGVhclNlc3Npb24oc3ViYWdlbnQuY2hhdFVyaSk7XG5cdFx0XHR0aGlzLl90dXJuVHJhY2tlci5jbGVhclNlc3Npb24oc3ViYWdlbnQuY2hhdFVyaSk7XG5cdFx0fVxuXHRcdHRoaXMuX3N1YmFnZW50Q2hhdHMuZGVsZXRlQWxsKHBhcmVudENoYXRVUkkpO1xuXHRcdC8vIERyb3AgYW55IGJ1ZmZlcmVkIGV2ZW50cyB0YXJnZXRlZCBhdCBzdWJhZ2VudHMgdGhhdCBuZXZlciBzdGFydGVkLlxuXHRcdHRoaXMuX3BlbmRpbmdTdWJhZ2VudFNpZ25hbHMuZGVsZXRlQWxsKHBhcmVudENoYXRVUkkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbXBsZXRlcyB0aGUgYWN0aXZlIHR1cm4gZm9yIHRoZSBzdWJhZ2VudCBhc3NvY2lhdGVkIHdpdGggYSBwYXJlbnQgdG9vbFxuXHQgKiBjYWxsLiBUaGUgY2hhdCByZW1haW5zIHJlZ2lzdGVyZWQgc28gYSBsYXRlciBzdGVlcmVkIHR1cm4gY2FuIHJlc3VtZSBpdC5cblx0ICovXG5cdGNvbXBsZXRlU3ViYWdlbnRTZXNzaW9uKHBhcmVudENoYXRVUkk6IFByb3RvY29sVVJJLCB0b29sQ2FsbElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHQvLyBEcm9wIGFueSBldmVudHMgdGhhdCB3ZXJlIGJ1ZmZlcmVkIHdhaXRpbmcgZm9yIGEgYHN1YmFnZW50X3N0YXJ0ZWRgXG5cdFx0Ly8gdGhhdCBuZXZlciBhcnJpdmVkIChlLmcuIHRoZSBwYXJlbnQgdG9vbCBmYWlsZWQgYmVmb3JlIHRoZSBzdWJhZ2VudFxuXHRcdC8vIHdhcyBjcmVhdGVkKS4gV2l0aG91dCB0aGlzLCB0aGUgYnVmZmVyIGVudHJ5IHdvdWxkIGxlYWsgdW50aWwgdGhlXG5cdFx0Ly8gcGFyZW50IHNlc3Npb24gaXMgZGlzcG9zZWQuXG5cdFx0dGhpcy5fcGVuZGluZ1N1YmFnZW50U2lnbmFscy5kZWxldGUocGFyZW50Q2hhdFVSSSwgdG9vbENhbGxJZCk7XG5cblx0XHRjb25zdCBzdWJhZ2VudCA9IHRoaXMuX3N1YmFnZW50Q2hhdHMuZ2V0KHBhcmVudENoYXRVUkksIHRvb2xDYWxsSWQpO1xuXHRcdGlmICghc3ViYWdlbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0dXJuSWQgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0QWN0aXZlVHVybklkKHN1YmFnZW50LmNoYXRVcmkpO1xuXHRcdGlmICh0dXJuSWQpIHtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzdWJhZ2VudC5jaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSxcblx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRkdXJhdGlvbjogdGhpcy5fdHVybkR1cmF0aW9uKHN1YmFnZW50LnR1cm5TdG9wV2F0Y2gpLFxuXHRcdFx0fSk7XG5cdFx0XHR0aGlzLl9jb21wbGV0ZVR1cm4oc3ViYWdlbnQuY2hhdFVyaSwgdHVybklkLCAnc3VjY2VzcycpO1xuXHRcdFx0dGhpcy5fdG9vbENhbGxUcmFja2VyLmNsZWFyU2Vzc2lvbihzdWJhZ2VudC5jaGF0VXJpKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlcyBhbGwgc3ViYWdlbnQgY2hhdHMgZm9yIGEgZ2l2ZW4gcGFyZW50IHNlc3Npb24gZnJvbSB0aGUgc3RhdGUgbWFuYWdlci5cblx0ICovXG5cdHJlbW92ZVN1YmFnZW50U2Vzc2lvbnMocGFyZW50U2Vzc2lvbjogUHJvdG9jb2xVUkkpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGNoYXRVcmkgb2YgdGhpcy5fY2FuY2VsbGVkVHVybklkcy5rZXlzKCkpIHtcblx0XHRcdGlmIChwYXJzZVJlcXVpcmVkU2Vzc2lvblVyaUZyb21DaGF0VXJpKGNoYXRVcmkpID09PSBwYXJlbnRTZXNzaW9uKSB7XG5cdFx0XHRcdHRoaXMuX2NhbmNlbGxlZFR1cm5JZHMuZGVsZXRlKGNoYXRVcmkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHBhcmVudENoYXRVUklzID0gbmV3IFNldDxQcm90b2NvbFVSST4oKTtcblx0XHRmb3IgKGNvbnN0IHN1YmFnZW50IG9mIHRoaXMuX3N1YmFnZW50Q2hhdHMudmFsdWVzKCkpIHtcblx0XHRcdGlmIChzdWJhZ2VudC5zZXNzaW9uVXJpID09PSBwYXJlbnRTZXNzaW9uKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5yZW1vdmVDaGF0KHN1YmFnZW50LnNlc3Npb25VcmksIHN1YmFnZW50LmNoYXRVcmkpO1xuXHRcdFx0XHR0aGlzLl90b29sQ2FsbFRyYWNrZXIuY2xlYXJTZXNzaW9uKHN1YmFnZW50LmNoYXRVcmkpO1xuXHRcdFx0XHR0aGlzLl90dXJuVHJhY2tlci5jbGVhclNlc3Npb24oc3ViYWdlbnQuY2hhdFVyaSk7XG5cdFx0XHRcdHBhcmVudENoYXRVUklzLmFkZChzdWJhZ2VudC5wYXJlbnRDaGF0VXJpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBwYXJlbnRDaGF0VVJJIG9mIHBhcmVudENoYXRVUklzKSB7XG5cdFx0XHR0aGlzLl9zdWJhZ2VudENoYXRzLmRlbGV0ZUFsbChwYXJlbnRDaGF0VVJJKTtcblx0XHRcdHRoaXMuX3BlbmRpbmdTdWJhZ2VudFNpZ25hbHMuZGVsZXRlQWxsKHBhcmVudENoYXRVUkkpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBEcm9wcyBwZXItY2hhbm5lbCB0ZWxlbWV0cnkgdHJhY2tpbmcgb24gdGVhcmRvd24uIEluLWZsaWdodCB0b29sIGNhbGxzXG5cdCAqIGFuZCBuZXZlci1jb21wbGV0ZWQgdHVybnMgYXJlIGRpc2NhcmRlZCB3aXRob3V0IHJlcG9ydGluZywgc28gbmVpdGhlclxuXHQgKiB0aGVpciB0cmFja2luZyBtYXBzIG5vciB0aGUgdHVybiBoYW5nIHdhdGNoZG9nIHRpbWVycyBvdXRsaXZlIHRoZVxuXHQgKiBjaGFubmVsIHRoZXkgZGVzY3JpYmUuXG5cdCAqL1xuXHRjbGVhckNoYW5uZWxUZWxlbWV0cnkoY2hhbm5lbDogUHJvdG9jb2xVUkkpOiB2b2lkIHtcblx0XHR0aGlzLl90b29sQ2FsbFRyYWNrZXIuY2xlYXJTZXNzaW9uKGNoYW5uZWwpO1xuXHRcdHRoaXMuX3R1cm5UcmFja2VyLmNsZWFyU2Vzc2lvbihjaGFubmVsKTtcblx0fVxuXG5cdGNsZWFySW5wdXRSZXF1ZXN0c0ZvclNlc3Npb24oc2Vzc2lvbjogUHJvdG9jb2xVUkkpOiB2b2lkIHtcblx0XHR0aGlzLl9pbnB1dFJlcXVlc3RUcmFja2VyLmNsZWFyQWdlbnRTZXNzaW9uKHNlc3Npb24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpbmRzIHRoZSBzdWJhZ2VudCBzZXNzaW9uIHRoYXQgb3ducyBhIGdpdmVuIHRvb2wgY2FsbCBieSBjaGVja2luZ1xuXHQgKiB3aGV0aGVyIHRoZSB0b29sIGNhbGwgd2FzIHByZXZpb3VzbHkgcmVnaXN0ZXJlZCB1bmRlciBhIHN1YmFnZW50XG5cdCAqIHNlc3Npb24ga2V5IGluIGBfdG9vbENhbGxBZ2VudHNgLiBTY29wZWQgdG8gc3ViYWdlbnQgc2Vzc2lvbnMgb3duZWRcblx0ICogYnkgdGhlIGdpdmVuIHBhcmVudCB0byBhdm9pZCBjcm9zcy1zZXNzaW9uIGNvbGxpc2lvbnMuXG5cdCAqL1xuXHRwcml2YXRlIF9maW5kU3ViYWdlbnRDaGF0Rm9yVG9vbENhbGwocGFyZW50Q2hhdFVSSTogUHJvdG9jb2xVUkksIHRvb2xDYWxsSWQ6IHN0cmluZyk6IFByb3RvY29sVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IHN1YmFnZW50IG9mIHRoaXMuX3N1YmFnZW50Q2hhdHMuZ2V0QWxsKHBhcmVudENoYXRVUkkpKSB7XG5cdFx0XHRpZiAodGhpcy5fdG9vbENhbGxBZ2VudHMuaGFzKGAke3N1YmFnZW50LmNoYXRVcml9OiR7dG9vbENhbGxJZH1gKSkge1xuXHRcdFx0XHRyZXR1cm4gc3ViYWdlbnQuY2hhdFVyaTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3Rvb2xDYWxsQ29tcGxldGlvbkNoYXQoY2hhdENoYW5uZWw6IFByb3RvY29sVVJJKTogUHJvdG9jb2xVUkkge1xuXHRcdGlmICghaXNTdWJhZ2VudENoYXRVcmkoY2hhdENoYW5uZWwpKSB7XG5cdFx0XHRyZXR1cm4gY2hhdENoYW5uZWw7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBzdWJhZ2VudCBvZiB0aGlzLl9zdWJhZ2VudENoYXRzLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoc3ViYWdlbnQuY2hhdFVyaSA9PT0gY2hhdENoYW5uZWwpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3Rvb2xDYWxsQ29tcGxldGlvbkNoYXQoc3ViYWdlbnQucGFyZW50Q2hhdFVyaSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTaWRlRWZmZWN0c10gTWlzc2luZyBwYXJlbnQgY2hhdCBmb3Igc3ViYWdlbnQgdG9vbCBjb21wbGV0aW9uOiBjaGF0PSR7Y2hhdENoYW5uZWx9YCk7XG5cdFx0cmV0dXJuIGNoYXRDaGFubmVsO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZvcndhcmRzIGEgY29tcGxldGVkIGNsaWVudCB0b29sIGNhbGwgdG8gdGhlIHByb3ZpZGVyLlxuXHQgKlxuXHQgKiBgY2hhdGAgaXMgdGhlIGhvc3QtcmVzb2x2ZWQgKnJvdXRpbmcqIHRhcmdldDogZm9yIGEgc3ViYWdlbnQgY2hhdCwgdGhlXG5cdCAqIGFuY2VzdG9yIGNoYXQgd2hvc2UgcHJvdmlkZXIgcnVudGltZSBvd25zIHRoZSB0b29sIGNhbGwgKHNlZVxuXHQgKiB7QGxpbmsgX3Rvb2xDYWxsQ29tcGxldGlvbkNoYXR9KS4gVGhlIGNvbnRleHQgY2FycmllcyB0aGUgY2hhdCB0aGUgdG9vbFxuXHQgKiBjYWxsIHdhcyBhY3R1YWxseSBhZGRyZXNzZWQgdG8sIHNvIGEgcHJvdmlkZXIgY2FuIHJlY292ZXIgdGhlIHNwYXduIGVkZ2Vcblx0ICogdmlhIGByZXNvbHZlU3ViYWdlbnRDaGF0UGFyZW50KGNvbnRleHQpYCBpbnN0ZWFkIG9mIHdhbGtpbmcgaG9zdCBzdGF0ZS5cblx0ICogVGhlIHR3byBkaWZmZXIgb25seSB3aGVuIHRoZSBhZGRyZXNzZWQgY2hhdCBpcyBhIHN1YmFnZW50LlxuXHQgKi9cblx0cHJpdmF0ZSBfbm90aWZ5Q2xpZW50VG9vbENhbGxDb21wbGV0ZShzZXNzaW9uQ2hhbm5lbDogUHJvdG9jb2xVUkksIGNoYXRDaGFubmVsOiBQcm90b2NvbFVSSSwgdG9vbENhbGxJZDogc3RyaW5nLCByZXN1bHQ6IFRvb2xDYWxsUmVzdWx0LCBzb3VyY2U6ICdjbGllbnQtZGlzcGF0Y2gnIHwgJ3NlcnZlci1lbnZlbG9wZScpOiB2b2lkIHtcblx0XHRjb25zdCBjb21wbGV0aW9uQ2hhdCA9IHRoaXMuX3Rvb2xDYWxsQ29tcGxldGlvbkNoYXQoY2hhdENoYW5uZWwpO1xuXHRcdGNvbnN0IGFnZW50ID0gdGhpcy5fb3B0aW9ucy5nZXRBZ2VudChzZXNzaW9uQ2hhbm5lbCk7XG5cdFx0aWYgKCFhZ2VudCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTaWRlRWZmZWN0c10gTm8gYWdlbnQgZm9yIGNsaWVudCB0b29sIGNvbXBsZXRpb246IHNvdXJjZT0ke3NvdXJjZX0sIHNlc3Npb249JHtzZXNzaW9uQ2hhbm5lbH0sIGNoYXQ9JHtjaGF0Q2hhbm5lbH0sIGNvbXBsZXRpb25DaGF0PSR7Y29tcGxldGlvbkNoYXR9LCB0b29sQ2FsbElkPSR7dG9vbENhbGxJZH1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRTaWRlRWZmZWN0c10gRm9yd2FyZGluZyBjbGllbnQgdG9vbCBjb21wbGV0aW9uOiBzb3VyY2U9JHtzb3VyY2V9LCBzZXNzaW9uPSR7c2Vzc2lvbkNoYW5uZWx9LCBjaGF0PSR7Y2hhdENoYW5uZWx9LCBjb21wbGV0aW9uQ2hhdD0ke2NvbXBsZXRpb25DaGF0fSwgdG9vbENhbGxJZD0ke3Rvb2xDYWxsSWR9LCBzdWNjZXNzPSR7cmVzdWx0LnN1Y2Nlc3N9YCk7XG5cdFx0YWdlbnQub25DbGllbnRUb29sQ2FsbENvbXBsZXRlKFVSSS5wYXJzZShjb21wbGV0aW9uQ2hhdCksIHRvb2xDYWxsSWQsIHJlc3VsdCwgdGhpcy5fY2hhdENvbnRleHQoc2Vzc2lvbkNoYW5uZWwsIGNoYXRDaGFubmVsKSk7XG5cdH1cblxuXHQvLyAtLS0tIFNpZGUtZWZmZWN0IGhhbmRsZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIEhhbmRsZXMgYSBgcGVuZGluZ19jb25maXJtYXRpb25gIHNpZ25hbCBlbmQtdG8tZW5kOiBjaGVja3MgZm9yXG5cdCAqIGF1dG8tYXBwcm92YWwgdmlhIHRoZSBwZXJtaXNzaW9uIG1hbmFnZXIsIGFuZCBpZiBub3QgYXV0by1hcHByb3ZlZCxcblx0ICogZGlzcGF0Y2hlcyB0aGUgYENoYXRUb29sQ2FsbFJlYWR5YCBhY3Rpb24gd2l0aCBjb25maXJtYXRpb24gb3B0aW9uc1xuXHQgKiBmb3IgdGhlIGNsaWVudC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2hhbmRsZVRvb2xSZWFkeShlOiBJQWdlbnRUb29sUGVuZGluZ0NvbmZpcm1hdGlvblNpZ25hbCwgc2Vzc2lvbktleTogUHJvdG9jb2xVUkksIHR1cm5JZDogc3RyaW5nLCBhZ2VudDogSUFnZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYXBwcm92YWxFdmVudCA9IHtcblx0XHRcdHRvb2xDYWxsSWQ6IGUuc3RhdGUudG9vbENhbGxJZCxcblx0XHRcdHNlc3Npb246IGUuY2hhdCxcblx0XHRcdHBlcm1pc3Npb25LaW5kOiBlLnBlcm1pc3Npb25LaW5kLFxuXHRcdFx0cGVybWlzc2lvblBhdGg6IGUucGVybWlzc2lvblBhdGgsXG5cdFx0XHR0b29sSW5wdXQ6IGdldElubGluZVRvb2xJbnB1dChlLnN0YXRlLnRvb2xJbnB1dCksXG5cdFx0XHRyZXF1ZXN0U2FuZGJveEJ5cGFzczogZS5yZXF1ZXN0U2FuZGJveEJ5cGFzcyxcblx0XHRcdHNoZWxsTGFuZ3VhZ2U6IGUuc2hlbGxMYW5ndWFnZSxcblx0XHR9O1xuXHRcdGNvbnN0IGF1dG9BcHByb3ZhbCA9IGUubWFuYWdlZEFwcHJvdmFsUmVxdWlyZWRcblx0XHRcdD8gdW5kZWZpbmVkXG5cdFx0XHQ6IGF3YWl0IHRoaXMuX3Blcm1pc3Npb25NYW5hZ2VyLmdldEF1dG9BcHByb3ZhbChhcHByb3ZhbEV2ZW50LCBzZXNzaW9uS2V5KTtcblx0XHRjb25zdCBwYXJ0ID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uS2V5KT8uYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cy5maW5kKHBhcnQgPT4gcGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHBhcnQudG9vbENhbGwudG9vbENhbGxJZCA9PT0gZS5zdGF0ZS50b29sQ2FsbElkKTtcblx0XHRjb25zdCB0b29sQ2FsbCA9IHBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgPyBwYXJ0LnRvb2xDYWxsIDogdW5kZWZpbmVkO1xuXHRcdGlmICh0b29sQ2FsbFxuXHRcdFx0JiYgdG9vbENhbGwuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmdcblx0XHRcdCYmIHRvb2xDYWxsLnN0YXR1cyAhPT0gVG9vbENhbGxTdGF0dXMuUnVubmluZ1xuXHRcdFx0JiYgdG9vbENhbGwuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uKSB7XG5cdFx0XHRjb25zdCB0b29sQ2FsbEtleSA9IGAke3Nlc3Npb25LZXl9OiR7ZS5zdGF0ZS50b29sQ2FsbElkfWA7XG5cdFx0XHR0aGlzLl90b29sQ2FsbEFnZW50cy5kZWxldGUodG9vbENhbGxLZXkpO1xuXHRcdFx0dGhpcy5fbWFuYWdlZEFwcHJvdmFsVG9vbENhbGxzLmRlbGV0ZSh0b29sQ2FsbEtleSk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRTaWRlRWZmZWN0c10gRHJvcHBpbmcgc3RhbGUgdG9vbCByZWFkeSBmb3IgJHtlLnN0YXRlLnRvb2xDYWxsSWR9OiBzdGF0dXM9JHt0b29sQ2FsbC5zdGF0dXN9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRyaWJ1dG9yID0gZS5zdGF0ZS5jb250cmlidXRvciA/PyB0b29sQ2FsbD8uY29udHJpYnV0b3I7XG5cdFx0bGV0IGVmZmVjdGl2ZSA9IGU7XG5cdFx0Y29uc3QgdG9vbENhbGxLZXkgPSBgJHtzZXNzaW9uS2V5fToke2Uuc3RhdGUudG9vbENhbGxJZH1gO1xuXHRcdGlmIChlLm1hbmFnZWRBcHByb3ZhbFJlcXVpcmVkKSB7XG5cdFx0XHR0aGlzLl9tYW5hZ2VkQXBwcm92YWxUb29sQ2FsbHMuYWRkKHRvb2xDYWxsS2V5KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fbWFuYWdlZEFwcHJvdmFsVG9vbENhbGxzLmRlbGV0ZSh0b29sQ2FsbEtleSk7XG5cdFx0fVxuXHRcdGNvbnN0IGNsaWVudFNob3VsZEF1dG9BcHByb3ZlID0gYXV0b0FwcHJvdmFsICE9PSB1bmRlZmluZWRcblx0XHRcdCYmIGNvbnRyaWJ1dG9yPy5raW5kID09PSBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnRcblx0XHRcdCYmICEhZS5zdGF0ZS5jb25maXJtYXRpb25UaXRsZTtcblx0XHRpZiAoY2xpZW50U2hvdWxkQXV0b0FwcHJvdmUpIHtcblx0XHRcdHRoaXMuX3Rvb2xDYWxsQWdlbnRzLnNldCh0b29sQ2FsbEtleSwgYWdlbnQuaWQpO1xuXHRcdFx0ZWZmZWN0aXZlID0geyAuLi5lLCBzdGF0ZTogeyAuLi5lLnN0YXRlLCBfbWV0YTogeyAuLi50b29sQ2FsbD8uX21ldGEsIC4uLmUuc3RhdGUuX21ldGEsIC4uLnRvVG9vbENhbGxNZXRhKHsgYXV0b0FwcHJvdmVCeVNldHRpbmc6IHRydWUgfSkgfSB9IH07XG5cdFx0fSBlbHNlIGlmIChhdXRvQXBwcm92YWwgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fdG9vbENhbGxBZ2VudHMuZGVsZXRlKHRvb2xDYWxsS2V5KTtcblx0XHRcdGFnZW50LnJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0KGUuc3RhdGUudG9vbENhbGxJZCwgdHJ1ZSk7XG5cdFx0XHQvLyBTdHJpcCBjb25maXJtYXRpb25UaXRsZSBzbyBjcmVhdGVUb29sUmVhZHlBY3Rpb24gZW1pdHMgdGhlXG5cdFx0XHQvLyBhdXRvLWFwcHJvdmVkIChuby1vcHRpb25zKSBhY3Rpb24uXG5cdFx0XHRlZmZlY3RpdmUgPSB7IC4uLmUsIHN0YXRlOiB7IC4uLmUuc3RhdGUsIGNvbmZpcm1hdGlvblRpdGxlOiB1bmRlZmluZWQgfSB9O1xuXHRcdH0gZWxzZSBpZiAoZWZmZWN0aXZlLnN0YXRlLmNvbmZpcm1hdGlvblRpdGxlKSB7XG5cdFx0XHQvLyBNYWtlIHN1cmUgdGhlIGFnZW50IGlzIHJlZ2lzdGVyZWQgZm9yIHRoZSBldmVudHVhbCBgQ2hhdFRvb2xDYWxsQ29uZmlybWVkYCByZXNwb25zZS5cblx0XHRcdHRoaXMuX3Rvb2xDYWxsQWdlbnRzLnNldCh0b29sQ2FsbEtleSwgYWdlbnQuaWQpO1xuXHRcdH1cblx0XHRpZiAoYXV0b0FwcHJvdmFsID09PSB1bmRlZmluZWQgJiYgIWUubWFuYWdlZEFwcHJvdmFsUmVxdWlyZWQgJiYgdGhpcy5fcGVybWlzc2lvbk1hbmFnZXIuaXNBdXRvQXBwcm92ZVJ1bGVSZXNvbHZhYmxlKGFwcHJvdmFsRXZlbnQsIHNlc3Npb25LZXkpKSB7XG5cdFx0XHQvLyBNYXJrIGNvbmZpcm1hdGlvbnMgd2hlcmUgYSBwZXJzaXN0ZW50IGFsbG93IHJ1bGUgY2FuIHN1cHByZXNzIHRoZSBuZXh0IGVxdWl2YWxlbnQgcHJvbXB0LlxuXHRcdFx0ZWZmZWN0aXZlID0geyAuLi5lZmZlY3RpdmUsIHN0YXRlOiB7IC4uLmVmZmVjdGl2ZS5zdGF0ZSwgX21ldGE6IHsgLi4udG9vbENhbGw/Ll9tZXRhLCAuLi5lZmZlY3RpdmUuc3RhdGUuX21ldGEsIC4uLnRvVG9vbENhbGxNZXRhKHsgYXV0b0FwcHJvdmVSdWxlUmVzb2x2YWJsZTogdHJ1ZSB9KSB9IH0gfTtcblx0XHR9XG5cdFx0Y29uc3QgcmVhZHlBY3Rpb24gPSB0aGlzLl9wZXJtaXNzaW9uTWFuYWdlci5jcmVhdGVUb29sUmVhZHlBY3Rpb24oZWZmZWN0aXZlLCBzZXNzaW9uS2V5LCB0dXJuSWQpO1xuXHRcdHRoaXMuX3Rvb2xDYWxsVHJhY2tlci50b29sQ2FsbE1ldGFkYXRhVXBkYXRlZChzZXNzaW9uS2V5LCByZWFkeUFjdGlvbi50b29sQ2FsbElkLCByZWFkeUFjdGlvbi5jb250cmlidXRvcik7XG5cdFx0dGhpcy5fdHVyblRyYWNrZXIudG9vbENhbGxNZXRhZGF0YVVwZGF0ZWQoc2Vzc2lvbktleSwgdHVybklkLCByZWFkeUFjdGlvbi50b29sQ2FsbElkLCByZWFkeUFjdGlvbi5jb250cmlidXRvcik7XG5cdFx0aWYgKHJlYWR5QWN0aW9uLmNvbmZpcm1lZCkge1xuXHRcdFx0dGhpcy5fdG9vbENhbGxUcmFja2VyLnRvb2xDYWxsRXhlY3V0aW9uU3RhcnRlZChzZXNzaW9uS2V5LCByZWFkeUFjdGlvbi50b29sQ2FsbElkKTtcblx0XHR9XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25LZXksIHJlYWR5QWN0aW9uKTtcblx0XHQvLyBUaGlzIGFjdGlvbiBpcyBzeW50aGVzaXplZCBoZXJlIHJhdGhlciB0aGFuIHJvdXRlZCB0aHJvdWdoXG5cdFx0Ly8gYF9kaXNwYXRjaEFjdGlvbkZvclNlc3Npb25gLCBzbyBmZWVkIHRoZSBoYW5nIHdhdGNoZG9nIGV4cGxpY2l0bHkuXG5cdFx0dGhpcy5fdHVyblRyYWNrZXIubWFya0FjdGl2aXR5KHNlc3Npb25LZXksIHR1cm5JZCwgcmVhZHlBY3Rpb24udHlwZSk7XG5cdH1cblxuXHRoYW5kbGVBY3Rpb24oY2hhbm5lbDogUHJvdG9jb2xVUkksIGFjdGlvbjogU3RhdGVBY3Rpb24sIGNsaWVudElkPzogc3RyaW5nLCBjbGllbnRDb250ZXh0T3JUeXBlOiBJQWdlbnRIb3N0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dCB8IEFnZW50SG9zdENsaWVudFR5cGUgPSBBZ2VudEhvc3RDbGllbnRUeXBlLlVua25vd24pOiB2b2lkIHtcblx0XHRsZXQgY2xpZW50Q29udGV4dCA9IHR5cGVvZiBjbGllbnRDb250ZXh0T3JUeXBlID09PSAnc3RyaW5nJ1xuXHRcdFx0PyBjcmVhdGVVbmtub3duQWdlbnRIb3N0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dChjbGllbnRDb250ZXh0T3JUeXBlKVxuXHRcdFx0OiBjbGllbnRDb250ZXh0T3JUeXBlO1xuXHRcdGlmICh0aGlzLl9vcHRpb25zLmhvc3RMYXVuY2hLaW5kICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNsaWVudENvbnRleHQgPSB7IC4uLmNsaWVudENvbnRleHQsIGhvc3RMYXVuY2hLaW5kOiB0aGlzLl9vcHRpb25zLmhvc3RMYXVuY2hLaW5kIH07XG5cdFx0fVxuXHRcdGNvbnN0IGNoYXRDaGFubmVsID0gaXNBaHBDaGF0Q2hhbm5lbChjaGFubmVsKSA/IGNoYW5uZWwgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc2Vzc2lvbkNoYW5uZWwgPSBjaGF0Q2hhbm5lbCA/IHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmkoY2hhdENoYW5uZWwpIDogY2hhbm5lbDtcblx0XHRzd2l0Y2ggKGFjdGlvbi50eXBlKSB7XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkOiB7XG5cdFx0XHRcdGlmICghY2hhdENoYW5uZWwpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENoYXRUdXJuU3RhcnRlZCBtdXN0IGJlIGhhbmRsZWQgb24gYW4gQUhQIGNoYXQgY2hhbm5lbDogJHtjaGFubmVsfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHR1cm5TdG9wV2F0Y2ggPSBTdG9wV2F0Y2guY3JlYXRlKGZhbHNlKTtcblx0XHRcdFx0dGhpcy5fb3B0aW9ucy5kaWFnbm9zdGljc0xvZz8ucmVjb3JkVGV4dCgnY2hhdCcsICdVU0VSJywgYWN0aW9uLm1lc3NhZ2UudGV4dCwgeyBzZXNzaW9uOiBjaGFubmVsLCB0dXJuOiBhY3Rpb24udHVybklkLCBtb2RlbDogYWN0aW9uLm1lc3NhZ2UubW9kZWw/LmlkIH0pO1xuXHRcdFx0XHR0aGlzLl9vcHRpb25zLmRpYWdub3N0aWNzTG9nPy5yZWNvcmQoJ3RpbWVsaW5lJywgJ1RVUk4uU1RBUlQnLCB7IHNlc3Npb246IGNoYW5uZWwsIHR1cm46IGFjdGlvbi50dXJuSWQsIG1vZGVsOiBhY3Rpb24ubWVzc2FnZS5tb2RlbD8uaWQsIGF0dGFjaG1lbnRDb3VudDogYWN0aW9uLm1lc3NhZ2UuYXR0YWNobWVudHM/Lmxlbmd0aCA/PyAwIH0pO1xuXHRcdFx0XHQvLyBQZXItdHVybiBzdHJlYW1pbmcgcGFydCB0cmFja2luZyBpcyBvd25lZCBieSB0aGUgYWdlbnRcblx0XHRcdFx0Ly8gKGUuZy4gQ29waWxvdEFnZW50U2Vzc2lvbikgYW5kIHJlc2V0IG9uIGl0cyBgc2VuZCgpYCBjYWxsLlxuXG5cdFx0XHRcdC8vIEdlbmVyaWMsIGFnZW50LWFnbm9zdGljIGhvc3QgY29tbWFuZHMgKGAvcmVuYW1lYCwgYCFjb21tYW5kYCxcblx0XHRcdFx0Ly8gXHUyMDI2KSBhcmUgaW50ZXJjZXB0ZWQgaGVyZSBhbmQgaGFuZGxlZCBieSB0aGUgbG9jYWwtY29tbWFuZFxuXHRcdFx0XHQvLyBkaXNwYXRjaGVyIHJhdGhlciB0aGFuIGZvcndhcmRlZCB0byB0aGUgYWdlbnQgU0RLLlxuXHRcdFx0XHRjb25zdCBoYW5kbGVkID0gdGhpcy5fbG9jYWxDb21tYW5kcy50cnlIYW5kbGUoeyB0dXJuQ2hhbm5lbDogY2hhbm5lbCwgdHVybklkOiBhY3Rpb24udHVybklkLCB0ZXh0OiBhY3Rpb24ubWVzc2FnZS50ZXh0IH0pO1xuXHRcdFx0XHRpZiAoaGFuZGxlZCkge1xuXHRcdFx0XHRcdGlmIChoYW5kbGVkLnN1Z2dlc3RlZFRpdGxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3RpdGxlQ29udHJvbGxlci5zZWVkUHJvdmlzaW9uYWxUaXRsZShzZXNzaW9uQ2hhbm5lbCwgaGFuZGxlZC5zdWdnZXN0ZWRUaXRsZSwgY2hhdENoYW5uZWwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShjaGFubmVsKTtcblx0XHRcdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0FnZW50U2lkZUVmZmVjdHNdIFR1cm4gc3RhcnRlZCBmb3Igc2Vzc2lvbiBub3QgaW4gc3RhdGUgbWFuYWdlcjogJHtjaGFubmVsfSwgdHVybklkPSR7YWN0aW9uLnR1cm5JZH0gLSBzdGF0dXMvc3VtbWFyeSB1cGRhdGVzIG1heSBiZSBkcm9wcGVkIHVubGVzcyB0aGUgc2Vzc2lvbiBpcyByZXN0b3JlZGApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3RpdGxlQ29udHJvbGxlci5zZWVkVGl0bGVGcm9tRmlyc3RNZXNzYWdlKHNlc3Npb25DaGFubmVsLCBhY3Rpb24ubWVzc2FnZS50ZXh0LCBjaGF0Q2hhbm5lbCk7XG5cdFx0XHRcdHRoaXMuX29wdGlvbnMub25Vc2VyTWVzc2FnZT8uKHNlc3Npb25DaGFubmVsLCBhY3Rpb24ubWVzc2FnZS50ZXh0KTtcblxuXHRcdFx0XHRjb25zdCBhZ2VudCA9IHRoaXMuX29wdGlvbnMuZ2V0QWdlbnQoc2Vzc2lvbkNoYW5uZWwpO1xuXHRcdFx0XHRpZiAoIWFnZW50KSB7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGNoYW5uZWwsIHtcblx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdEVycm9yLFxuXHRcdFx0XHRcdFx0dHVybklkOiBhY3Rpb24udHVybklkLFxuXHRcdFx0XHRcdFx0ZHVyYXRpb246IHRoaXMuX3R1cm5EdXJhdGlvbih0dXJuU3RvcFdhdGNoKSxcblx0XHRcdFx0XHRcdGVycm9yOiB7IGVycm9yVHlwZTogJ25vQWdlbnQnLCBtZXNzYWdlOiAnTm8gYWdlbnQgZm91bmQgZm9yIHNlc3Npb24nIH0sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGF0dGFjaG1lbnRzID0gYWN0aW9uLm1lc3NhZ2UuYXR0YWNobWVudHM7XG5cdFx0XHRcdHRoaXMuX3RlbGVtZXRyeVJlcG9ydGVyLnVzZXJNZXNzYWdlU2VudChhZ2VudC5pZCwgY2xpZW50SWQsIGNsaWVudENvbnRleHQsIGNoYW5uZWwsIGFjdGlvbi50dXJuSWQsIHN0YXRlLCAnZGlyZWN0JywgYXR0YWNobWVudHMpO1xuXHRcdFx0XHRjb25zdCB7IG1vZGVsLCBtb2RlbFRlbGVtZXRyeUtpbmQsIHBlcm1pc3Npb25MZXZlbCwgaW50ZXJhY3Rpb25Nb2RlIH0gPSB0aGlzLl9nZXRUdXJuVGVsZW1ldHJ5Q29udGV4dChhZ2VudCwgc3RhdGUsIGFjdGlvbi5tZXNzYWdlLm1vZGVsPy5pZCk7XG5cdFx0XHRcdHRoaXMuX3R1cm5UcmFja2VyLnR1cm5TdGFydGVkKGFnZW50LmlkLCBjaGFubmVsLCBhY3Rpb24udHVybklkLCBtb2RlbCwgbW9kZWxUZWxlbWV0cnlLaW5kLCBwZXJtaXNzaW9uTGV2ZWwsIGludGVyYWN0aW9uTW9kZSwgY2xpZW50Q29udGV4dCk7XG5cdFx0XHRcdHZvaWQgdGhpcy5fc2VuZFR1cm5NZXNzYWdlKHtcblx0XHRcdFx0XHRhZ2VudCxcblx0XHRcdFx0XHRzZXNzaW9uQ2hhbm5lbCxcblx0XHRcdFx0XHR0dXJuQ2hhbm5lbDogY2hhbm5lbCxcblx0XHRcdFx0XHRjaGF0OiBjaGFubmVsLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGFjdGlvbi5tZXNzYWdlLFxuXHRcdFx0XHRcdHR1cm5JZDogYWN0aW9uLnR1cm5JZCxcblx0XHRcdFx0XHRzZW5kZXJDbGllbnRJZDogY2xpZW50SWQsXG5cdFx0XHRcdFx0Y2xpZW50Q29udGV4dCxcblx0XHRcdFx0XHR0dXJuU3RvcFdhdGNoLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkOiB7XG5cdFx0XHRcdGNvbnN0IGFwcHJvdmFsTG9nID0gdGhpcy5fb3B0aW9ucy5kaWFnbm9zdGljc0xvZztcblx0XHRcdFx0aWYgKGFwcHJvdmFsTG9nKSB7XG5cdFx0XHRcdFx0Y29uc3QgdHlwZSA9IGFjdGlvbi5hcHByb3ZlZCA/ICdBUFBST1ZBTC5BUFBST1ZFRCcgOiAnQVBQUk9WQUwuREVOSUVEJztcblx0XHRcdFx0XHRhcHByb3ZhbExvZy5yZWNvcmQoJ3RpbWVsaW5lJywgdHlwZSwgeyByZWY6IGFwcHJvdmFsTG9nLnJlY29yZCgndG9vbHMnLCB0eXBlLCBhY3Rpb24sIHsgc2Vzc2lvbjogY2hhbm5lbCwgdHVybjogYWN0aW9uLnR1cm5JZCB9KSwgdG9vbENhbGxJZDogYWN0aW9uLnRvb2xDYWxsSWQgfSwgeyBzZXNzaW9uOiBjaGFubmVsLCB0dXJuOiBhY3Rpb24udHVybklkIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghY2hhdENoYW5uZWwpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENoYXRUb29sQ2FsbENvbmZpcm1lZCBtdXN0IGJlIGhhbmRsZWQgb24gYW4gQUhQIGNoYXQgY2hhbm5lbDogJHtjaGFubmVsfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHRvb2xDYWxsS2V5ID0gYCR7Y2hhbm5lbH06JHthY3Rpb24udG9vbENhbGxJZH1gO1xuXHRcdFx0XHRpZiAoYWN0aW9uLmFwcHJvdmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fdG9vbENhbGxUcmFja2VyLnRvb2xDYWxsRXhlY3V0aW9uU3RhcnRlZChjaGFubmVsLCBhY3Rpb24udG9vbENhbGxJZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gQSBkZW5pYWwgaXMgdGVybWluYWw6IHRoZSByZWR1Y2VyIG1vdmVzIHRoZSBjYWxsIHRvXG5cdFx0XHRcdFx0Ly8gYGNhbmNlbGxlZGAgYW5kIGlnbm9yZXMgYW55IGxhdGVyIGNvbXBsZXRpb24gZm9yIGl0LCBzb1xuXHRcdFx0XHRcdC8vIHRoaXMgaXMgdGhlIGxhc3QgY2hhbmNlIHRvIGRyb3AgaXQgZnJvbSB0aGUgdHVybidzXG5cdFx0XHRcdFx0Ly8gaW4tZmxpZ2h0IHNldC4gTGVhdmluZyBpdCB3b3VsZCBtYWtlIGEgc3Vic2VxdWVudCBoYW5nXG5cdFx0XHRcdFx0Ly8gcmVwb3J0IGBydW5uaW5nVG9vbGAgZm9yIGEgdG9vbCB0aGF0IHdpbGwgbmV2ZXIgcnVuLlxuXHRcdFx0XHRcdHRoaXMuX3R1cm5UcmFja2VyLnRvb2xDYWxsRW5kZWQoY2hhbm5lbCwgYWN0aW9uLnR1cm5JZCwgYWN0aW9uLnRvb2xDYWxsSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG1hbmFnZWRBcHByb3ZhbFJlcXVpcmVkID0gdGhpcy5fbWFuYWdlZEFwcHJvdmFsVG9vbENhbGxzLmRlbGV0ZSh0b29sQ2FsbEtleSk7XG5cdFx0XHRcdGNvbnN0IGFnZW50SWQgPSB0aGlzLl90b29sQ2FsbEFnZW50cy5nZXQodG9vbENhbGxLZXkpO1xuXHRcdFx0XHRpZiAoYWdlbnRJZCkge1xuXHRcdFx0XHRcdHRoaXMuX3Rvb2xDYWxsQWdlbnRzLmRlbGV0ZSh0b29sQ2FsbEtleSk7XG5cdFx0XHRcdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9vcHRpb25zLmFnZW50cy5nZXQoKS5maW5kKGEgPT4gYS5pZCA9PT0gYWdlbnRJZCk7XG5cdFx0XHRcdFx0YWdlbnQ/LnJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0KGFjdGlvbi50b29sQ2FsbElkLCBhY3Rpb24uYXBwcm92ZWQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2lkZUVmZmVjdHNdIE5vIGFnZW50IGZvciB0b29sIGNhbGwgY29uZmlybWF0aW9uOiAke2FjdGlvbi50b29sQ2FsbElkfWApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gV2hlbiB0aGUgdXNlciBjaG9zZSBcIkFsbG93IGluIHRoaXMgU2Vzc2lvblwiLCBhZGQgdGhlIHRvb2xcblx0XHRcdFx0Ly8gdG8gdGhlIHNlc3Npb24ncyBwZXJtaXNzaW9ucyBzbyBmdXR1cmUgY2FsbHMgYXJlIGF1dG8tYXBwcm92ZWQuXG5cdFx0XHRcdGlmIChhY3Rpb24uYXBwcm92ZWQgJiYgIW1hbmFnZWRBcHByb3ZhbFJlcXVpcmVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fcGVybWlzc2lvbk1hbmFnZXIuaGFuZGxlVG9vbENhbGxDb25maXJtZWQoY2hhbm5lbCwgYWN0aW9uLnRvb2xDYWxsSWQsIGFjdGlvbi5zZWxlY3RlZE9wdGlvbklkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0SW5wdXRDb21wbGV0ZWQ6IHtcblx0XHRcdFx0aWYgKCFjaGF0Q2hhbm5lbCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2hhdElucHV0Q29tcGxldGVkIG11c3QgYmUgaGFuZGxlZCBvbiBhbiBBSFAgY2hhdCBjaGFubmVsOiAke2NoYW5uZWx9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9vcHRpb25zLmdldEFnZW50KHNlc3Npb25DaGFubmVsKTtcblx0XHRcdFx0YWdlbnQ/LnJlc3BvbmRUb1VzZXJJbnB1dFJlcXVlc3QoYWN0aW9uLnJlcXVlc3RJZCwgYWN0aW9uLnJlc3BvbnNlLCBhY3Rpb24uYW5zd2Vycyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkOiB7XG5cdFx0XHRcdGlmICghY2hhdENoYW5uZWwpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENoYXRUdXJuQ2FuY2VsbGVkIG11c3QgYmUgaGFuZGxlZCBvbiBhbiBBSFAgY2hhdCBjaGFubmVsOiAke2NoYW5uZWx9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fY29tcGxldGVUdXJuKGNoYW5uZWwsIGFjdGlvbi50dXJuSWQsICdjYW5jZWxsZWQnKTtcblx0XHRcdFx0dGhpcy5fdG9vbENhbGxUcmFja2VyLmNsZWFyU2Vzc2lvbihjaGFubmVsKTtcblx0XHRcdFx0dm9pZCB0aGlzLl9jaGVja3BvaW50U2VydmljZS5kaXNjYXJkVHVyblN0YXJ0Q2hlY2twb2ludChVUkkucGFyc2Uoc2Vzc2lvbkNoYW5uZWwpLCBVUkkucGFyc2UoY2hhbm5lbCksIGFjdGlvbi50dXJuSWQpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0XHRcdC8vIENhbmNlbCBhbGwgc3ViYWdlbnQgc2Vzc2lvbnMgZm9yIHRoaXMgcGFyZW50XG5cdFx0XHRcdHRoaXMuY2FuY2VsU3ViYWdlbnRTZXNzaW9ucyhjaGFubmVsKTtcblx0XHRcdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9vcHRpb25zLmdldEFnZW50KHNlc3Npb25DaGFubmVsKTtcblx0XHRcdFx0aWYgKGFnZW50KSB7XG5cdFx0XHRcdFx0Y29uc3QgY2hhdCA9IFVSSS5wYXJzZShjaGFubmVsKTtcblx0XHRcdFx0XHRjb25zdCBzZXNzaW9uID0gcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShjaGFubmVsKTtcblx0XHRcdFx0XHRhZ2VudC5jaGF0cy5hYm9ydChjaGF0LCB7IC4uLnRoaXMuX2NoYXRDb250ZXh0KHNlc3Npb24sIGNoYW5uZWwpLCBjbGllbnRUZWxlbWV0cnlDb250ZXh0OiBjbGllbnRDb250ZXh0IH0pLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdbQWdlbnRTaWRlRWZmZWN0c10gYWJvcnQgZmFpbGVkJywgZXJyKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBJbnRlbnRpb25hbGx5IGRvIE5PVCBkcmFpbiBxdWV1ZWQgbWVzc2FnZXMgaGVyZTogY2FuY2VsbGluZyBtZWFuc1xuXHRcdFx0XHQvLyBcInN0b3BcIiwgc28gbWVzc2FnZXMgcXVldWVkIGJlaGluZCB0aGUgdHVybiBzdGF5IHF1ZXVlZCBmb3IgdGhlXG5cdFx0XHRcdC8vIHVzZXIgdG8gZGVxdWV1ZS9ydW4gbWFudWFsbHkuIChBIG1lc3NhZ2UgdGhlIHVzZXIgc2VuZHMgKmFmdGVyKlxuXHRcdFx0XHQvLyB0aGUgYWJvcnQgaXMgc3RpbGwgY29uc3VtZWQgdmlhIHRoZSBDaGF0UGVuZGluZ01lc3NhZ2VTZXQgcGF0aFxuXHRcdFx0XHQvLyBvbmNlIGNhbmNlbGxhdGlvbiBoYXMgY2xlYXJlZCB0aGUgYWN0aXZlIHR1cm4uKVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkOiB7XG5cdFx0XHRcdGlmIChjaGF0Q2hhbm5lbCkge1xuXHRcdFx0XHRcdC8vIFRoZSByZW5hbWUgdGFyZ2V0ZWQgYSBzcGVjaWZpYyBjaGF0IChkZWZhdWx0IG9yIGFkZGl0aW9uYWwpLFxuXHRcdFx0XHRcdC8vIG5vdCB0aGUgd2hvbGUgc2Vzc2lvbi4gUm91dGUgaXQgdG8gYSBwZXItY2hhdCB0aXRsZSB1cGRhdGUgc29cblx0XHRcdFx0XHQvLyB0aGUgc2Vzc2lvbiB0aXRsZSBzdGF5cyBpbmRlcGVuZGVudC5cblx0XHRcdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIudXBkYXRlQ2hhdFRpdGxlKHNlc3Npb25DaGFubmVsLCBjaGF0Q2hhbm5lbCwgYWN0aW9uLnRpdGxlKTtcblx0XHRcdFx0XHR0aGlzLl9wZXJzaXN0U2Vzc2lvbkZsYWcoc2Vzc2lvbkNoYW5uZWwsIGN1c3RvbUNoYXRUaXRsZU1ldGFkYXRhS2V5KGNoYXRDaGFubmVsKSwgYWN0aW9uLnRpdGxlKTtcblx0XHRcdFx0XHR0aGlzLl9wZXJzaXN0U2Vzc2lvbkZsYWcoc2Vzc2lvbkNoYW5uZWwsIGN1c3RvbUNoYXRUaXRsZVNvdXJjZU1ldGFkYXRhS2V5KGNoYXRDaGFubmVsKSwgQUdFTlRfSE9TVF9USVRMRV9TT1VSQ0VfVVNFUik7XG5cdFx0XHRcdFx0dGhpcy5fdGl0bGVDb250cm9sbGVyLm1hcmtUaXRsZVJlbmFtZWQoc2Vzc2lvbkNoYW5uZWwsIGNoYXRDaGFubmVsKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9wZXJzaXN0U2Vzc2lvbkZsYWcoY2hhbm5lbCwgU0VTU0lPTl9DVVNUT01fVElUTEVfS0VZLCBhY3Rpb24udGl0bGUpO1xuXHRcdFx0XHR0aGlzLl9wZXJzaXN0U2Vzc2lvbkZsYWcoY2hhbm5lbCwgU0VTU0lPTl9DVVNUT01fVElUTEVfU09VUkNFX0tFWSwgQUdFTlRfSE9TVF9USVRMRV9TT1VSQ0VfVVNFUik7XG5cdFx0XHRcdHRoaXMuX3RpdGxlQ29udHJvbGxlci5tYXJrVGl0bGVSZW5hbWVkKGNoYW5uZWwpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0UGVuZGluZ01lc3NhZ2VTZXQ6IHtcblx0XHRcdFx0aWYgKCFjaGF0Q2hhbm5lbCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgJHthY3Rpb24udHlwZX0gbXVzdCBiZSBoYW5kbGVkIG9uIGFuIEFIUCBjaGF0IGNoYW5uZWw6ICR7Y2hhbm5lbH1gKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBxdWV1ZWRNZXNzYWdlRXhpc3RzID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShjaGFubmVsKT8ucXVldWVkTWVzc2FnZXM/LnNvbWUobWVzc2FnZSA9PiBtZXNzYWdlLmlkID09PSBhY3Rpb24uaWQpID09PSB0cnVlO1xuXHRcdFx0XHRpZiAoYWN0aW9uLmtpbmQgPT09IFBlbmRpbmdNZXNzYWdlS2luZC5RdWV1ZWQgJiYgcXVldWVkTWVzc2FnZUV4aXN0cykge1xuXHRcdFx0XHRcdHRoaXMuX3F1ZXVlZE1lc3NhZ2VTZW5kZXJzLnNldCh7IGNsaWVudElkLCBjbGllbnRDb250ZXh0IH0sIGNoYW5uZWwsIGFjdGlvbi5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fc3luY1BlbmRpbmdNZXNzYWdlcyhjaGFubmVsKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuQ2hhdFBlbmRpbmdNZXNzYWdlUmVtb3ZlZDoge1xuXHRcdFx0XHRpZiAoIWNoYXRDaGFubmVsKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGAke2FjdGlvbi50eXBlfSBtdXN0IGJlIGhhbmRsZWQgb24gYW4gQUhQIGNoYXQgY2hhbm5lbDogJHtjaGFubmVsfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChhY3Rpb24ua2luZCA9PT0gUGVuZGluZ01lc3NhZ2VLaW5kLlF1ZXVlZCkge1xuXHRcdFx0XHRcdHRoaXMuX3F1ZXVlZE1lc3NhZ2VTZW5kZXJzLmRlbGV0ZShjaGFubmVsLCBhY3Rpb24uaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3N5bmNQZW5kaW5nTWVzc2FnZXMoY2hhbm5lbCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRRdWV1ZWRNZXNzYWdlc1Jlb3JkZXJlZDoge1xuXHRcdFx0XHRpZiAoIWNoYXRDaGFubmVsKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGAke2FjdGlvbi50eXBlfSBtdXN0IGJlIGhhbmRsZWQgb24gYW4gQUhQIGNoYXQgY2hhbm5lbDogJHtjaGFubmVsfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3N5bmNQZW5kaW5nTWVzc2FnZXMoY2hhbm5lbCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUcnVuY2F0ZWQ6IHtcblx0XHRcdFx0aWYgKCFjaGF0Q2hhbm5lbCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2hhdFRydW5jYXRlZCBtdXN0IGJlIGhhbmRsZWQgb24gYW4gQUhQIGNoYXQgY2hhbm5lbDogJHtjaGFubmVsfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHZvaWQgdGhpcy5fY2hlY2twb2ludFNlcnZpY2UuZGlzY2FyZENoYXRUdXJuU3RhcnRDaGVja3BvaW50cyhVUkkucGFyc2Uoc2Vzc2lvbkNoYW5uZWwpLCBVUkkucGFyc2UoY2hhdENoYW5uZWwpKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdFx0XHRjb25zdCBhZ2VudCA9IHRoaXMuX29wdGlvbnMuZ2V0QWdlbnQoc2Vzc2lvbkNoYW5uZWwpO1xuXHRcdFx0XHQvLyBXaGVuIHRoZSB0cnVuY2F0aW9uIGJvdW5kYXJ5IGlzIGEgaG9zdC1pbmplY3RlZCBsb2NhbCB0dXJuXG5cdFx0XHRcdC8vIChgL3JlbmFtZWAgLyBgIWNvbW1hbmRgKSwgcmVkaXJlY3QgdGhlIFNESyB0cnVuY2F0aW9uIHRvIHRoZVxuXHRcdFx0XHQvLyBwcmVjZWRpbmcgY29uY3JldGUgdHVybiBzbyB0aGUgYWdlbnQga2VlcHMgZXZlcnl0aGluZyB1cCB0b1xuXHRcdFx0XHQvLyB0aGUgcmVhbCBtZXNzYWdlIGJlZm9yZSBpdC5cblx0XHRcdFx0Y29uc3Qgc2RrVHVybklkID0gYWN0aW9uLnR1cm5JZCAhPT0gdW5kZWZpbmVkXG5cdFx0XHRcdFx0PyB0aGlzLl9vcHRpb25zLmxvY2FsVHVybnMucmVzb2x2ZUNvbmNyZXRlVHVybklkKGNoYXRDaGFubmVsLCBhY3Rpb24udHVybklkKVxuXHRcdFx0XHRcdDogYWN0aW9uLnR1cm5JZDtcblx0XHRcdFx0Ly8gUm91dGUgdG8gdGhlIGNoYXQgYmVpbmcgdHJ1bmNhdGVkOiB0aGUgZGVmYXVsdCBjaGF0IChhZGRyZXNzZWRcblx0XHRcdFx0Ly8gYnkgdGhlIHNlc3Npb24pIG9yIGEgcGVlciBjaGF0IHdpdGggaXRzIG93biBiYWNraW5nLlxuXHRcdFx0XHRhZ2VudD8udHJ1bmNhdGVDaGF0Py4oVVJJLnBhcnNlKGNoYXRDaGFubmVsKSwgc2RrVHVybklkLCB0aGlzLl9jaGF0Q29udGV4dChzZXNzaW9uQ2hhbm5lbCwgY2hhdENoYW5uZWwpKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tBZ2VudFNpZGVFZmZlY3RzXSB0cnVuY2F0ZUNoYXQgZmFpbGVkJywgZXJyKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdC8vIERyb3AgcGVyc2lzdGVkIGxvY2FsIHR1cm5zIHRoYXQgbm8gbG9uZ2VyIHN1cnZpdmUgaW4gdGhlXG5cdFx0XHRcdC8vIChhbHJlYWR5LXRydW5jYXRlZCkgY2hhdCBzdGF0ZS5cblx0XHRcdFx0Y29uc3Qgc3Vydml2aW5nSWRzID0gbmV3IFNldCgodGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShjaGF0Q2hhbm5lbCk/LnR1cm5zID8/IFtdKS5tYXAodCA9PiB0LmlkKSk7XG5cdFx0XHRcdGNvbnN0IHJlbW92ZWQgPSB0aGlzLl9vcHRpb25zLmxvY2FsVHVybnMuZ2V0TG9jYWxUdXJuSWRzKGNoYXRDaGFubmVsKS5maWx0ZXIoaWQgPT4gIXN1cnZpdmluZ0lkcy5oYXMoaWQpKTtcblx0XHRcdFx0dGhpcy5fb3B0aW9ucy5sb2NhbFR1cm5zLmRlbGV0ZUxvY2FscyhzZXNzaW9uQ2hhbm5lbCwgcmVtb3ZlZCk7XG5cdFx0XHRcdC8vIFR1cm5zIHJlbW92ZWQgYnkgdGhlIHRydW5jYXRpb24gd2lsbCBuZXZlciBjb21wbGV0ZSwgc28gdGhlaXJcblx0XHRcdFx0Ly8gaGFuZyB3YXRjaGRvZ3MgbXVzdCBub3Qgc3Vydml2ZSB0byByZXBvcnQgYSB0dXJuIHRoYXQgbm9cblx0XHRcdFx0Ly8gbG9uZ2VyIGV4aXN0cy4gVGhlIGFjdGl2ZSB0dXJuIGlzIHRyYWNrZWQgc2VwYXJhdGVseSBmcm9tXG5cdFx0XHRcdC8vIGB0dXJuc2AgaW4gY2hhdCBzdGF0ZSwgc28ga2VlcCBpdCBleHBsaWNpdGx5LlxuXHRcdFx0XHRjb25zdCB0cmFja2VkVHVybklkcyA9IG5ldyBTZXQoc3Vydml2aW5nSWRzKTtcblx0XHRcdFx0Y29uc3QgYWN0aXZlVHVybklkID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldEFjdGl2ZVR1cm5JZChjaGF0Q2hhbm5lbCk7XG5cdFx0XHRcdGlmIChhY3RpdmVUdXJuSWQpIHtcblx0XHRcdFx0XHR0cmFja2VkVHVybklkcy5hZGQoYWN0aXZlVHVybklkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl90dXJuVHJhY2tlci5jbGVhclR1cm5zRXhjZXB0KGNoYXRDaGFubmVsLCB0cmFja2VkVHVybklkcyk7XG5cdFx0XHRcdHRoaXMuX2NoYW5nZXNldHMub25TZXNzaW9uVHJ1bmNhdGVkKHNlc3Npb25DaGFubmVsKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldDoge1xuXHRcdFx0XHR0aGlzLl9mYW5PdXRBY3RpdmVDbGllbnQoY2hhbm5lbCwgYWN0aW9uLmFjdGl2ZUNsaWVudCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRSZW1vdmVkOiB7XG5cdFx0XHRcdGNvbnN0IGFnZW50ID0gdGhpcy5fb3B0aW9ucy5nZXRBZ2VudChjaGFubmVsKTtcblx0XHRcdFx0Zm9yIChjb25zdCBjaGF0IG9mIGdldFNlc3Npb25DaGF0c0ZvckZhbk91dCh0aGlzLl9zdGF0ZU1hbmFnZXIsIGNoYW5uZWwpID8/IFtdKSB7XG5cdFx0XHRcdFx0YWdlbnQ/LnJlbW92ZUFjdGl2ZUNsaWVudChjaGF0LCB0aGlzLl9jaGF0Q29udGV4dChjaGFubmVsLCBjaGF0LnRvU3RyaW5nKCkpLCBhY3Rpb24uY2xpZW50SWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkOiB7XG5cdFx0XHRcdHVwZGF0ZUFnZW50SG9zdFRlbGVtZXRyeUxldmVsRnJvbUNvbmZpZyh0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCBhY3Rpb24uY29uZmlnKTtcblx0XHRcdFx0Ly8gSG9zdCBjdXN0b21pemF0aW9ucyBhcmUgc2VsZi1tYW5hZ2VkIGJ5IGVhY2ggYWdlbnQnc1xuXHRcdFx0XHQvLyBQbHVnaW5Db250cm9sbGVyIHZpYSBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5vbkRpZFJvb3RDb25maWdDaGFuZ2UuXG5cdFx0XHRcdC8vIFJlcHVibGlzaCBhZ2VudCBpbmZvcyBmb3Igbm9uLWN1c3RvbWl6YXRpb24gc2NoZW1hIGNoYW5nZXNcblx0XHRcdFx0Ly8gKGUuZy4gcGVybWlzc2lvbnMpIGFuZCBzZXNzaW9uIGN1c3RvbWl6YXRpb25zIGFzIGEgY2F0Y2hhbGwuXG5cdFx0XHRcdHRoaXMuX3B1Ymxpc2hBZ2VudEluZm9zKHRoaXMuX29wdGlvbnMuYWdlbnRzLmdldCgpKTtcblx0XHRcdFx0dGhpcy5fcHVibGlzaEFsbFNlc3Npb25DdXN0b21pemF0aW9ucygpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgQWN0aW9uVHlwZS5TZXNzaW9uTWNwU2VydmVyU3RhcnRSZXF1ZXN0ZWQ6IHtcblx0XHRcdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9vcHRpb25zLmdldEFnZW50KHNlc3Npb25DaGFubmVsKTtcblx0XHRcdFx0YWdlbnQ/LnN0YXJ0TWNwU2VydmVyPy4oVVJJLnBhcnNlKHNlc3Npb25DaGFubmVsKSwgYWN0aW9uLmlkKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2lkZUVmZmVjdHNdIHN0YXJ0TWNwU2VydmVyIGZhaWxlZCBmb3IgJHtzZXNzaW9uQ2hhbm5lbH1gLCBlcnIpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbk1jcFNlcnZlclN0b3BSZXF1ZXN0ZWQ6IHtcblx0XHRcdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9vcHRpb25zLmdldEFnZW50KHNlc3Npb25DaGFubmVsKTtcblx0XHRcdFx0YWdlbnQ/LnN0b3BNY3BTZXJ2ZXI/LihVUkkucGFyc2Uoc2Vzc2lvbkNoYW5uZWwpLCBhY3Rpb24uaWQpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTaWRlRWZmZWN0c10gc3RvcE1jcFNlcnZlciBmYWlsZWQgZm9yICR7c2Vzc2lvbkNoYW5uZWx9YCwgZXJyKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLlNlc3Npb25Jc0FyY2hpdmVkQ2hhbmdlZDoge1xuXHRcdFx0XHQvLyBQZXJzaXN0ZW5jZSByaWRlcyB0aGUgZW52ZWxvcGUgb2JzZXJ2ZXIgc2V0IHVwIGluIHRoZSBjb25zdHJ1Y3Rvci5cblx0XHRcdFx0Ly8gSG9zdC1vd25lZCB3b3JrdHJlZSBsaWZlY3ljbGUgKGFnZW50cyBzdGF5IHVuYXdhcmUpOiByZW1vdmUgdGhlXG5cdFx0XHRcdC8vIGNsZWFuLCBicmFuY2gtcHJlc2VydmVkIHdvcmt0cmVlIG9uIGFyY2hpdmUgYW5kIHJlY3JlYXRlIGl0IG9uXG5cdFx0XHRcdC8vIHVuYXJjaGl2ZS4gU2VyaWFsaXplZCBwZXIgc2Vzc2lvbiBpbnNpZGUgdGhlIGNvbnRyb2xsZXIgc28gaXQgY2FuJ3Rcblx0XHRcdFx0Ly8gaW50ZXJsZWF2ZSB3aXRoIGEgZmlyc3Qtc2VuZCB3b3JrdHJlZSByZXNvbHV0aW9uLlxuXHRcdFx0XHRpZiAodGhpcy5fd29ya3RyZWUpIHtcblx0XHRcdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLnBhcnNlKGNoYW5uZWwpO1xuXHRcdFx0XHRcdGNvbnN0IHNlc3Npb25JZCA9IEFnZW50U2Vzc2lvbi5pZChjaGFubmVsKTtcblx0XHRcdFx0XHRjb25zdCB3b3JrdHJlZU9wID0gYWN0aW9uLmlzQXJjaGl2ZWRcblx0XHRcdFx0XHRcdD8gdGhpcy5fd29ya3RyZWUuY2xlYW51cFdvcmt0cmVlT25BcmNoaXZlKHNlc3Npb25VcmksIHNlc3Npb25JZClcblx0XHRcdFx0XHRcdDogdGhpcy5fd29ya3RyZWUucmVjcmVhdGVXb3JrdHJlZU9uVW5hcmNoaXZlKHNlc3Npb25VcmksIHNlc3Npb25JZCk7XG5cdFx0XHRcdFx0d29ya3RyZWVPcC5jYXRjaChlcnIgPT4gdGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTaWRlRWZmZWN0c10gd29ya3RyZWUgJHthY3Rpb24uaXNBcmNoaXZlZCA/ICdjbGVhbnVwJyA6ICdyZWNyZWF0ZSd9IGZhaWxlZCBmb3IgJHtjaGFubmVsfWAsIGVycikpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGFnZW50ID0gdGhpcy5fb3B0aW9ucy5nZXRBZ2VudChjaGFubmVsKTtcblx0XHRcdFx0YWdlbnQ/Lm9uQXJjaGl2ZWRDaGFuZ2VkPy4oVVJJLnBhcnNlKGNoYW5uZWwpLCBhY3Rpb24uaXNBcmNoaXZlZCkuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNpZGVFZmZlY3RzXSBvbkFyY2hpdmVkQ2hhbmdlZCBmYWlsZWQgZm9yICR7Y2hhbm5lbH1gLCBlcnIpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIEFjdGlvblR5cGUuU2Vzc2lvbkNvbmZpZ0NoYW5nZWQ6IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShjaGFubmVsKTtcblx0XHRcdFx0Y29uc3QgdmFsdWVzID0gc2Vzc2lvblN0YXRlPy5jb25maWc/LnZhbHVlcztcblx0XHRcdFx0aWYgKHRoaXMuX3dvcmt0cmVlICYmIHNlc3Npb25TdGF0ZT8ubGlmZWN5Y2xlID09PSBTZXNzaW9uTGlmZWN5Y2xlLkNyZWF0aW5nKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2Vzc2lvbklkID0gQWdlbnRTZXNzaW9uLmlkKGNoYW5uZWwpO1xuXHRcdFx0XHRcdGNvbnN0IGlzb2xhdGlvbiA9IHZhbHVlcz8uW1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXTtcblx0XHRcdFx0XHRpZiAoaXNvbGF0aW9uID09PSAnd29ya3RyZWUnKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl93b3JrdHJlZS5ub3RlUGVuZGluZyhzZXNzaW9uSWQpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoaXNvbGF0aW9uID09PSAnZm9sZGVyJykge1xuXHRcdFx0XHRcdFx0dGhpcy5fd29ya3RyZWUuY2xlYXJQZW5kaW5nKHNlc3Npb25JZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlOiB7XG5cdFx0XHRcdGlmICghY2hhdENoYW5uZWwpIHtcblx0XHRcdFx0XHRicmVhazsgLy8gTm90IGEgY2hhdCBjaGFubmVsOyBpZ25vcmUuXG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fbm90aWZ5Q2xpZW50VG9vbENhbGxDb21wbGV0ZShzZXNzaW9uQ2hhbm5lbCwgY2hhdENoYW5uZWwsIGFjdGlvbi50b29sQ2FsbElkLCBhY3Rpb24ucmVzdWx0LCAnY2xpZW50LWRpc3BhdGNoJyk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKiBJbmplY3RzIHRoZSBob3N0LW93bmVkIHdvcmt0cmVlIGlzb2xhdGlvbiBjb250cm9sbGVyIChzZWUge0BsaW5rIEFnZW50U2VydmljZS5zZXRXb3JrdHJlZUlzb2xhdGlvbn0pLiAqL1xuXHRzZXRXb3JrdHJlZUlzb2xhdGlvbih3b3JrdHJlZTogV29ya3RyZWVJc29sYXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl93b3JrdHJlZSA9IHdvcmt0cmVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVjb3JkQ3VzdG9taXphdGlvbkVuYWJsZW1lbnQoc2Vzc2lvbjogUHJvdG9jb2xVUkksIGNhbmRpZGF0ZTogSUN1c3RvbWl6YXRpb25FbmFibGVtZW50Q2FuZGlkYXRlLCBlbmFibGVtZW50OiByZWFkb25seSBDdXN0b21pemF0aW9uRW5hYmxlbWVudFtdKTogdm9pZCB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gY2FuZGlkYXRlLmN1c3RvbWl6YXRpb24udHlwZSA9PT0gQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luXG5cdFx0XHQ/IHRhcmdldEZvclBsdWdpbihjYW5kaWRhdGUuY3VzdG9taXphdGlvbilcblx0XHRcdDogdGFyZ2V0Rm9yTWNwU2VydmVyKGNhbmRpZGF0ZS5jdXN0b21pemF0aW9uLCBjYW5kaWRhdGUub3duaW5nUGx1Z2luVXJpLCBmYWxzZSk7XG5cdFx0dGhpcy5fY3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlLnJlcGxhY2VFbmFibGVtZW50KHNlc3Npb24sIHRhcmdldCwgZW5hYmxlbWVudCk7XG5cdH1cblxuXHRjYW5jZWxTZXNzaW9uVGl0bGVHZW5lcmF0aW9uKHNlc3Npb246IFByb3RvY29sVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5fdGl0bGVDb250cm9sbGVyLmNhbmNlbFRpdGxlR2VuZXJhdGlvbihzZXNzaW9uKTtcblx0fVxuXG5cdGNsZWFyU2Vzc2lvblRpdGxlU3RhdGUoc2Vzc2lvbjogUHJvdG9jb2xVUkksIGNoYXRzOiByZWFkb25seSBQcm90b2NvbFVSSVtdKTogdm9pZCB7XG5cdFx0dGhpcy5fdGl0bGVDb250cm9sbGVyLmNsZWFyU2Vzc2lvbihzZXNzaW9uLCBjaGF0cyk7XG5cdH1cblxuXHRjbGVhclF1ZXVlZE1lc3NhZ2VTZW5kZXJzKGNoYXQ6IFByb3RvY29sVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5fcXVldWVkTWVzc2FnZVNlbmRlcnMuZGVsZXRlQWxsKGNoYXQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdlbmVyYXRlcyBhIGNvbnRlbnQtZGVyaXZlZCB0aXRsZSBmb3IgYSBmcmVzaGx5IGZvcmtlZCBzZXNzaW9uXG5cdCAqIChgY2hhdENoYW5uZWxgIHVuZGVmaW5lZCkgb3IgcGVlciBjaGF0IGZyb20gaXRzIGluaGVyaXRlZCBjaGF0XG5cdCAqIHR1cm5zLCByZXBsYWNpbmcgdGhlIHBsYWNlaG9sZGVyIGBGb3JrZWQ6IFx1MjAyNmAgdGl0bGUgb25jZSByZWFkeS5cblx0ICovXG5cdGdlbmVyYXRlRm9ya2VkVGl0bGUoY2hhbm5lbDogUHJvdG9jb2xVUkksIGNoYXRDaGFubmVsOiBQcm90b2NvbFVSSSB8IHVuZGVmaW5lZCwgdHVybnM6IHJlYWRvbmx5IFR1cm5bXSwgZmFsbGJhY2tUaXRsZTogc3RyaW5nLCBzb3VyY2VUaXRsZT86IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3RpdGxlQ29udHJvbGxlci5nZW5lcmF0ZUZvcmtlZFRpdGxlKGNoYW5uZWwsIGNoYXRDaGFubmVsLCB0dXJucywgZmFsbGJhY2tUaXRsZSwgc291cmNlVGl0bGUpO1xuXHR9XG5cblx0bWFya1RpdGxlQXV0byhjaGFubmVsOiBQcm90b2NvbFVSSSwgY2hhdENoYW5uZWw6IFByb3RvY29sVVJJIHwgdW5kZWZpbmVkLCB0aXRsZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fdGl0bGVDb250cm9sbGVyLm1hcmtUaXRsZUF1dG8oY2hhbm5lbCwgY2hhdENoYW5uZWwsIHRpdGxlKTtcblx0fVxuXG5cdG1hcmtUaXRsZVJlbmFtZWQoY2hhbm5lbDogUHJvdG9jb2xVUkksIGNoYXRDaGFubmVsPzogUHJvdG9jb2xVUkkpOiB2b2lkIHtcblx0XHR0aGlzLl90aXRsZUNvbnRyb2xsZXIubWFya1RpdGxlUmVuYW1lZChjaGFubmVsLCBjaGF0Q2hhbm5lbCk7XG5cdH1cblxuXHQvKipcblx0ICogUGVyc2lzdHMgYSBzZXNzaW9uIG1ldGFkYXRhIGtleS92YWx1ZSBwYWlyIHRvIHRoZSBzZXNzaW9uIGRhdGFiYXNlLlxuXHQgKiBVc2VkIGZvciBmaWVsZHMgdGhlIGhvc3QgbmVlZHMgdG8gcmVtZW1iZXIgYWNyb3NzIHJlc3RhcnRzIChjdXN0b21cblx0ICogdGl0bGUsIGlzUmVhZC9pc0FyY2hpdmVkIGZsYWdzLCBtZXJnZWQgY29uZmlnIHZhbHVlcykuXG5cdCAqL1xuXHRwcml2YXRlIF9wZXJzaXN0U2Vzc2lvbkZsYWcoc2Vzc2lvbjogUHJvdG9jb2xVUkksIGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0cGVyc2lzdFNlc3Npb25NZXRhZGF0YSh0aGlzLl9vcHRpb25zLnNlc3Npb25EYXRhU2VydmljZSwgdGhpcy5fbG9nU2VydmljZSwgc2Vzc2lvbiwga2V5LCB2YWx1ZSk7XG5cdH1cblxuXHQvKipcblx0ICogUGVyc2lzdHMgdGhlIHVzYWdlIHJlcG9ydGVkIGZvciBhIGNoYXQncyB0dXJuLlxuXHQgKlxuXHQgKiBBZ2VudCBiYWNrZW5kcyBkbyBub3QgZHVyYWJseSByZWNvcmQgdG9rZW4vY3JlZGl0IHVzYWdlIHRoZW1zZWx2ZXMgKHRoZVxuXHQgKiBDb3BpbG90IFNESydzIGBhc3Npc3RhbnQudXNhZ2VgIGV2ZW50IGlzIGV4cGxpY2l0bHkgZXBoZW1lcmFsLCBhbmQgdGhlXG5cdCAqIENsYXVkZSB0cmFuc2NyaXB0IHJlcGxheSBwcm9kdWNlcyBub25lKSwgc28gYSByZXN0b3JlZCBzZXNzaW9uIHdvdWxkXG5cdCAqIG90aGVyd2lzZSBjb21lIGJhY2sgd2l0aCBubyBjb250ZXh0LXVzYWdlIGdhdWdlIGFuZCBhIHNlc3Npb24gY29zdCBvZiAwLlxuXHQgKiBTZWUgYEFnZW50U2VydmljZS5fYXBwbHlQZXJzaXN0ZWRUdXJuVXNhZ2VgIGZvciB3aGljaCBwcm92aWRlcnMgY2FuXG5cdCAqIGN1cnJlbnRseSBtYXRjaCB0aGVzZSByb3dzIGJhY2sgb24gcmVzdG9yZS5cblx0ICpcblx0ICogV3JpdHRlbiBvbiBldmVyeSByZXBvcnQgcmF0aGVyIHRoYW4gYnVmZmVyZWQgdW50aWwgdGhlIHR1cm4gZW5kczogdGhlIHJvd1xuXHQgKiBpcyBrZXllZCBieSB0dXJuIGlkIGFuZCB3cml0dGVuIHdpdGggYElOU0VSVCBPUiBSRVBMQUNFYCB0aHJvdWdoIGFcblx0ICogc2VxdWVuY2VyLCBzbyBcImxhc3QgcmVwb3J0IHdpbnNcIiBpcyBhbHJlYWR5IGEgcHJvcGVydHkgb2YgdGhlIHN0b3JhZ2Vcblx0ICogbGF5ZXIsIGFuZCBwZXJzaXN0aW5nIGVhZ2VybHkgbWVhbnMgYSB0dXJuIGN1dCBzaG9ydCBieSBhIGNyYXNoIG9yXG5cdCAqIGRpc2Nvbm5lY3Qga2VlcHMgdGhlIHVzYWdlIGl0IGhhZCBhbHJlYWR5IGFjY3J1ZWQuXG5cdCAqXG5cdCAqIFN1YmFnZW50IGNoYXRzIGFyZSBza2lwcGVkOiB0aGVpciBjb3N0IGlzIGFscmVhZHkgZm9sZGVkIGludG8gdGhlIHBhcmVudFxuXHQgKiB0dXJuJ3MgYWdncmVnYXRlLCBzbyByZWNvcmRpbmcgaXQgYWdhaW4gd291bGQgZG91YmxlLWNvdW50LlxuXHQgKi9cblx0cHJpdmF0ZSBfdHJhY2tUdXJuVXNhZ2UoY2hhbm5lbDogUHJvdG9jb2xVUkksIGFjdGlvbjogQ2hhdEFjdGlvbik6IHZvaWQge1xuXHRcdGlmIChhY3Rpb24udHlwZSAhPT0gQWN0aW9uVHlwZS5DaGF0VXNhZ2UgfHwgaXNTdWJhZ2VudENoYXRVcmkoY2hhbm5lbCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gVXNhZ2UgcmVwb3J0ZWQgd2l0aCBubyBhY3RpdmUgdHVybiBjYXJyaWVzIGFuIGVtcHR5IHR1cm4gaWQgKHNlZVxuXHRcdC8vIGBDb3BpbG90QWdlbnRTZXNzaW9uLl90dXJuSWRgKS4gTm8gdHVybiBjYW4gZXZlciBtYXRjaCBpdCwgYW5kIG5vXG5cdFx0Ly8gcHJ1bmUgcGF0aCBjYW4gcmVtb3ZlIGl0LCBzbyBpdCB3b3VsZCBiZSBhIHBlcm1hbmVudCBvcnBoYW4gcm93LlxuXHRcdGlmICghYWN0aW9uLnR1cm5JZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBBZ2VudHMga2V5IHRoZWlyIHN0b3JhZ2UgYnkgdGhlIGNoYXQncyBvd24gVVJJLCB3aGljaCBpcyB3aGVyZSB0aGVcblx0XHQvLyBgdHVybnNgIHJvd3MgdGhhdCBgZ2V0VHVyblVzYWdlc2Agam9pbnMgYWdhaW5zdCBsaXZlLlxuXHRcdGNvbnN0IHN0b3JhZ2UgPSBjaGF0U3RvcmFnZVVyaShjaGFubmVsKTtcblx0XHRpZiAoIXN0b3JhZ2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGV0IHJlZjogSVJlZmVyZW5jZTxJU2Vzc2lvbkRhdGFiYXNlPjtcblx0XHR0cnkge1xuXHRcdFx0cmVmID0gdGhpcy5fb3B0aW9ucy5zZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKHN0b3JhZ2UpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTaWRlRWZmZWN0c10gRmFpbGVkIHRvIG9wZW4gZGF0YWJhc2UgdG8gcGVyc2lzdCB0dXJuIHVzYWdlIGZvciAke2NoYW5uZWx9YCwgZXJyKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmVmLm9iamVjdC5zZXRUdXJuVXNhZ2UoYWN0aW9uLnR1cm5JZCwgSlNPTi5zdHJpbmdpZnkoYWN0aW9uLnVzYWdlKSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2lkZUVmZmVjdHNdIEZhaWxlZCB0byBwZXJzaXN0IHR1cm4gdXNhZ2UgZm9yICR7Y2hhbm5lbH0vJHthY3Rpb24udHVybklkfWAsIGVycik7XG5cdFx0fSkuZmluYWxseSgoKSA9PiByZWYuZGlzcG9zZSgpKTtcblx0fVxuXG5cdHByaXZhdGUgX3BlcnNpc3RDaGF0RHJhZnQoY2hhbm5lbDogUHJvdG9jb2xVUkksIGRyYWZ0OiBNZXNzYWdlIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKCFpc0FocENoYXRDaGFubmVsKGNoYW5uZWwpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDaGF0VXJpKGNoYW5uZWwpO1xuXHRcdGlmICghcGFyc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IFVSSS5wYXJzZShwYXJzZWQuc2Vzc2lvbik7XG5cdFx0Y29uc3QgcmVmID0gdGhpcy5fb3B0aW9ucy5zZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKHNlc3Npb24pO1xuXHRcdHJlZi5vYmplY3Quc2V0Q2hhdERyYWZ0KFVSSS5wYXJzZShjaGFubmVsKSwgZHJhZnQpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNpZGVFZmZlY3RzXSBGYWlsZWQgdG8gcGVyc2lzdCBjaGF0IGRyYWZ0IGZvciAke2NoYW5uZWwudG9TdHJpbmcoKX1gLCBlcnIpO1xuXHRcdH0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQdXNoZXMgdGhlIGN1cnJlbnQgcGVuZGluZyBtZXNzYWdlIHN0YXRlIGZyb20gdGhlIGNoYXQgdG8gdGhlIGFnZW50LlxuXHQgKiBUaGUgc2VydmVyIGNvbnRyb2xzIHF1ZXVlZCBtZXNzYWdlIGNvbnN1bXB0aW9uOyBvbmx5IHN0ZWVyaW5nIG1lc3NhZ2VzXG5cdCAqIGFyZSBmb3J3YXJkZWQgdG8gdGhlIGFnZW50IGZvciBtaWQtdHVybiBpbmplY3Rpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9zeW5jUGVuZGluZ01lc3NhZ2VzKGNoYXRDaGFubmVsOiBQcm90b2NvbFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb25DaGFubmVsID0gcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShjaGF0Q2hhbm5lbCk7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGNoYXRDaGFubmVsKTtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGFnZW50ID0gdGhpcy5fb3B0aW9ucy5nZXRBZ2VudChzZXNzaW9uQ2hhbm5lbCk7XG5cdFx0YWdlbnQ/LnNldFBlbmRpbmdNZXNzYWdlcz8uKFxuXHRcdFx0VVJJLnBhcnNlKGNoYXRDaGFubmVsKSxcblx0XHRcdHN0YXRlLnN0ZWVyaW5nTWVzc2FnZSxcblx0XHRcdFtdLFxuXHRcdCk7XG5cblx0XHQvLyBTdGVlcmluZyBtZXNzYWdlIHJlbW92YWwgaXMgbm93IGRpc3BhdGNoZWQgYnkgdGhlIGFnZW50XG5cdFx0Ly8gdmlhIHRoZSAnc3RlZXJpbmdfY29uc3VtZWQnIHByb2dyZXNzIGV2ZW50IG9uY2UgdGhlIG1lc3NhZ2Vcblx0XHQvLyBoYXMgYWN0dWFsbHkgYmVlbiBzZW50IHRvIHRoZSBtb2RlbC5cblxuXHRcdC8vIElmIHRoZSBzZXNzaW9uIGlzIGlkbGUsIHRyeSB0byBjb25zdW1lIHRoZSBuZXh0IHF1ZXVlZCBtZXNzYWdlXG5cdFx0dGhpcy5fdHJ5Q29uc3VtZU5leHRRdWV1ZWRNZXNzYWdlKGNoYXRDaGFubmVsKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb25zdW1lcyB0aGUgbmV4dCBxdWV1ZWQgbWVzc2FnZSBieSBkaXNwYXRjaGluZyBhIHNlcnZlci1pbml0aWF0ZWRcblx0ICogYENoYXRUdXJuU3RhcnRlZGAgYWN0aW9uIHdpdGggYHF1ZXVlZE1lc3NhZ2VJZGAgc2V0LiBUaGUgcmVkdWNlclxuXHQgKiBhdG9taWNhbGx5IGNyZWF0ZXMgdGhlIGFjdGl2ZSB0dXJuIGFuZCByZW1vdmVzIHRoZSBtZXNzYWdlIGZyb20gdGhlXG5cdCAqIHF1ZXVlLiBPbmx5IGNvbnN1bWVzIG9uZSBtZXNzYWdlIGF0IGEgdGltZTsgc3Vic2VxdWVudCBtZXNzYWdlcyBhcmVcblx0ICogY29uc3VtZWQgd2hlbiB0aGUgbmV4dCBgaWRsZWAgZXZlbnQgZmlyZXMuXG5cdCAqL1xuXHRwcml2YXRlIF90cnlDb25zdW1lTmV4dFF1ZXVlZE1lc3NhZ2Uoc2Vzc2lvbjogUHJvdG9jb2xVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uQ2hhbm5lbCA9IHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmkoc2Vzc2lvbik7XG5cdFx0Ly8gQmFpbCBpZiB0aGVyZSdzIGFscmVhZHkgYW4gYWN0aXZlIHR1cm5cblx0XHRpZiAodGhpcy5fc3RhdGVNYW5hZ2VyLmdldEFjdGl2ZVR1cm5JZChzZXNzaW9uKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbik7XG5cdFx0aWYgKCFzdGF0ZT8ucXVldWVkTWVzc2FnZXM/Lmxlbmd0aCB8fCBzdGF0ZS5zdGVlcmluZ01lc3NhZ2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtc2cgPSBzdGF0ZS5xdWV1ZWRNZXNzYWdlc1swXTtcblx0XHRjb25zdCBzZW5kZXIgPSB0aGlzLl9xdWV1ZWRNZXNzYWdlU2VuZGVycy5nZXQoc2Vzc2lvbiwgbXNnLmlkKSA/PyB7XG5cdFx0XHRjbGllbnRJZDogdW5kZWZpbmVkLFxuXHRcdFx0Y2xpZW50Q29udGV4dDoge1xuXHRcdFx0XHQuLi5jcmVhdGVVbmtub3duQWdlbnRIb3N0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dChBZ2VudEhvc3RDbGllbnRUeXBlLlVua25vd24pLFxuXHRcdFx0XHRob3N0TGF1bmNoS2luZDogdGhpcy5fb3B0aW9ucy5ob3N0TGF1bmNoS2luZCA/PyBBZ2VudEhvc3RMYXVuY2hLaW5kLlVua25vd24sXG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0dGhpcy5fcXVldWVkTWVzc2FnZVNlbmRlcnMuZGVsZXRlKHNlc3Npb24sIG1zZy5pZCk7XG5cdFx0Y29uc3QgdHVybklkID0gZ2VuZXJhdGVVdWlkKCk7XG5cblx0XHQvLyBQZXItdHVybiBzdHJlYW1pbmcgcGFydCB0cmFja2luZyBpcyBvd25lZCBieSB0aGUgYWdlbnQgKHJlc2V0XG5cdFx0Ly8gaW5zaWRlIGl0cyBgc2VuZCgpYCBjYWxsKSwgc28gbm8gaG9zdC1zaWRlIHJlc2V0IGlzIG5lZWRlZC5cblxuXHRcdC8vIERpc3BhdGNoIHNlcnZlci1pbml0aWF0ZWQgdHVybiBzdGFydDsgdGhlIHJlZHVjZXIgcmVtb3ZlcyB0aGUgcXVldWVkIG1lc3NhZ2UgYXRvbWljYWxseVxuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdHR1cm5JZCxcblx0XHRcdHN0YXJ0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0bWVzc2FnZTogbXNnLm1lc3NhZ2UsXG5cdFx0XHRxdWV1ZWRNZXNzYWdlSWQ6IG1zZy5pZCxcblx0XHR9KTtcblx0XHRjb25zdCB0dXJuU3RvcFdhdGNoID0gU3RvcFdhdGNoLmNyZWF0ZShmYWxzZSk7XG5cblx0XHQvLyBHZW5lcmljIGhvc3QgY29tbWFuZHMgKGAvcmVuYW1lYCwgYCFjb21tYW5kYCwgXHUyMDI2KSBhcmUgaW50ZXJjZXB0ZWQgYnlcblx0XHQvLyB0aGUgbG9jYWwtY29tbWFuZCBkaXNwYXRjaGVyIChzZWUgdGhlIENoYXRUdXJuU3RhcnRlZCBoYW5kbGVyKSBhbmRcblx0XHQvLyBtdXN0IG5vdCByZWFjaCB0aGUgYWdlbnQgU0RLIGV2ZW4gd2hlbiBxdWV1ZWQuXG5cdFx0Y29uc3QgaGFuZGxlZCA9IHRoaXMuX2xvY2FsQ29tbWFuZHMudHJ5SGFuZGxlKHsgdHVybkNoYW5uZWw6IHNlc3Npb24sIHR1cm5JZCwgdGV4dDogbXNnLm1lc3NhZ2UudGV4dCB9KTtcblx0XHRpZiAoaGFuZGxlZCkge1xuXHRcdFx0Ly8gQSBsb2NhbCBjb21tYW5kIG1heSBzdWdnZXN0IGEgcHJvdmlzaW9uYWwgdGl0bGUgKGUuZy4gYSBgIWNvbW1hbmRgXG5cdFx0XHQvLyBkZXF1ZXVlZCBiZWZvcmUgYW55IHJlYWwgcmVxdWVzdCBoYXMgdGl0bGVkIHRoZSBzZXNzaW9uKS5cblx0XHRcdGlmIChoYW5kbGVkLnN1Z2dlc3RlZFRpdGxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fdGl0bGVDb250cm9sbGVyLnNlZWRQcm92aXNpb25hbFRpdGxlKHNlc3Npb25DaGFubmVsLCBoYW5kbGVkLnN1Z2dlc3RlZFRpdGxlLCBzZXNzaW9uKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl90aXRsZUNvbnRyb2xsZXIuc2VlZFRpdGxlRnJvbUZpcnN0TWVzc2FnZShzZXNzaW9uQ2hhbm5lbCwgbXNnLm1lc3NhZ2UudGV4dCwgc2Vzc2lvbik7XG5cblx0XHQvLyBTZW5kIHRoZSBtZXNzYWdlIHRvIHRoZSBhZ2VudCBiYWNrZW5kLiBXaGVuIGBzZXNzaW9uYCBpcyBhblxuXHRcdC8vIGFkZGl0aW9uYWwgY2hhdCBjaGFubmVsLCB0aGUgU0RLIGNoYXQgaXMgb3duZWQgYnkgdGhlXG5cdFx0Ly8gcGFyZW50IHNlc3Npb246IGxvb2sgdXAgdGhlIHByb3ZpZGVyIGJ5IHRoZSBwYXJlbnQgc2Vzc2lvbiBVUkkgYW5kXG5cdFx0Ly8gcGFzcyB0aGUgY2hhdCBjaGFubmVsIHNvIHRoZSBoYXJuZXNzIHJvdXRlcyB0byB0aGUgcmlnaHQgcGVlciBjaGF0LlxuXHRcdGNvbnN0IGFnZW50ID0gdGhpcy5fb3B0aW9ucy5nZXRBZ2VudChzZXNzaW9uQ2hhbm5lbCk7XG5cdFx0aWYgKCFhZ2VudCkge1xuXHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb24sIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0RXJyb3IsXG5cdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0ZHVyYXRpb246IHRoaXMuX3R1cm5EdXJhdGlvbih0dXJuU3RvcFdhdGNoKSxcblx0XHRcdFx0ZXJyb3I6IHsgZXJyb3JUeXBlOiAnbm9BZ2VudCcsIG1lc3NhZ2U6ICdObyBhZ2VudCBmb3VuZCBmb3Igc2Vzc2lvbicgfSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhdHRhY2htZW50cyA9IG1zZy5tZXNzYWdlLmF0dGFjaG1lbnRzO1xuXHRcdGNvbnN0IHF1ZXVlZFN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uKTtcblx0XHR0aGlzLl90ZWxlbWV0cnlSZXBvcnRlci51c2VyTWVzc2FnZVNlbnQoYWdlbnQuaWQsIHNlbmRlci5jbGllbnRJZCwgc2VuZGVyLmNsaWVudENvbnRleHQsIHNlc3Npb24sIHR1cm5JZCwgcXVldWVkU3RhdGUsICdxdWV1ZWQnLCBhdHRhY2htZW50cyk7XG5cdFx0Y29uc3QgeyBtb2RlbCwgbW9kZWxUZWxlbWV0cnlLaW5kLCBwZXJtaXNzaW9uTGV2ZWwsIGludGVyYWN0aW9uTW9kZSB9ID0gdGhpcy5fZ2V0VHVyblRlbGVtZXRyeUNvbnRleHQoYWdlbnQsIHF1ZXVlZFN0YXRlLCBtc2cubWVzc2FnZS5tb2RlbD8uaWQpO1xuXHRcdHRoaXMuX3R1cm5UcmFja2VyLnR1cm5TdGFydGVkKGFnZW50LmlkLCBzZXNzaW9uLCB0dXJuSWQsIG1vZGVsLCBtb2RlbFRlbGVtZXRyeUtpbmQsIHBlcm1pc3Npb25MZXZlbCwgaW50ZXJhY3Rpb25Nb2RlLCBzZW5kZXIuY2xpZW50Q29udGV4dCk7XG5cdFx0Ly8gU2VsZWN0aW9uIHRyYXZlbHMgb24gdGhlIHF1ZXVlZCBtZXNzYWdlOyBpdCBpcyBhcHBsaWVkIGJlZm9yZSBzZW5kaW5nLlxuXHRcdHZvaWQgdGhpcy5fc2VuZFR1cm5NZXNzYWdlKHtcblx0XHRcdGFnZW50LFxuXHRcdFx0c2Vzc2lvbkNoYW5uZWwsXG5cdFx0XHR0dXJuQ2hhbm5lbDogc2Vzc2lvbixcblx0XHRcdGNoYXQ6IHNlc3Npb24sXG5cdFx0XHRtZXNzYWdlOiBtc2cubWVzc2FnZSxcblx0XHRcdHR1cm5JZCxcblx0XHRcdHNlbmRlckNsaWVudElkOiBzZW5kZXIuY2xpZW50SWQsXG5cdFx0XHRjbGllbnRDb250ZXh0OiBzZW5kZXIuY2xpZW50Q29udGV4dCxcblx0XHRcdHR1cm5TdG9wV2F0Y2gsXG5cdFx0fSk7XG5cdH1cblxuXG5cdHByaXZhdGUgX2dldFR1cm5UZWxlbWV0cnlDb250ZXh0KGFnZW50OiBJQWdlbnQsIHN0YXRlOiBTZXNzaW9uU3RhdGUgfCB1bmRlZmluZWQsIG1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHsgbW9kZWw6IHN0cmluZyB8IHVuZGVmaW5lZDsgbW9kZWxUZWxlbWV0cnlLaW5kOiBBZ2VudEhvc3RNb2RlbFRlbGVtZXRyeUtpbmQgfCB1bmRlZmluZWQ7IHBlcm1pc3Npb25MZXZlbDogc3RyaW5nIHwgdW5kZWZpbmVkOyBpbnRlcmFjdGlvbk1vZGU6IFNlc3Npb25Nb2RlIHwgdW5kZWZpbmVkIH0ge1xuXHRcdGNvbnN0IHBlcm1pc3Npb25WYWx1ZSA9IHN0YXRlPy5jb25maWc/LnZhbHVlc1tTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXTtcblx0XHRjb25zdCBwZXJtaXNzaW9uTGV2ZWwgPSB0eXBlb2YgcGVybWlzc2lvblZhbHVlID09PSAnc3RyaW5nJyA/IHBlcm1pc3Npb25WYWx1ZSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBpbnRlcmFjdGlvbk1vZGUgPSBnZXRDb25maWd1cmVkU2Vzc2lvbk1vZGUoc3RhdGU/LmNvbmZpZyk7XG5cdFx0Y29uc3QgbW9kZWxDb250ZXh0ID0gbW9kZWxJZCA9PT0gdW5kZWZpbmVkXG5cdFx0XHQ/IHsgbW9kZWw6IHVuZGVmaW5lZCwgbW9kZWxUZWxlbWV0cnlLaW5kOiB1bmRlZmluZWQgfVxuXHRcdFx0OiB0aGlzLl9nZXRNb2RlbFRlbGVtZXRyeUNvbnRleHQoYWdlbnQsIG1vZGVsSWQpO1xuXHRcdHJldHVybiB7IC4uLm1vZGVsQ29udGV4dCwgcGVybWlzc2lvbkxldmVsLCBpbnRlcmFjdGlvbk1vZGUgfTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE1vZGVsVGVsZW1ldHJ5Q29udGV4dChhZ2VudDogSUFnZW50LCBtb2RlbElkOiBzdHJpbmcpOiB7IG1vZGVsOiBzdHJpbmc7IG1vZGVsVGVsZW1ldHJ5S2luZDogQWdlbnRIb3N0TW9kZWxUZWxlbWV0cnlLaW5kIH0ge1xuXHRcdGNvbnN0IG1vZGVsID0gYWdlbnQubW9kZWxzLmdldCgpLmZpbmQobW9kZWwgPT4gbW9kZWwuaWQgPT09IG1vZGVsSWQpO1xuXHRcdGxldCBtb2RlbFRlbGVtZXRyeUtpbmQ6IEFnZW50SG9zdE1vZGVsVGVsZW1ldHJ5S2luZDtcblx0XHRpZiAobW9kZWxJZCA9PT0gJ2F1dG8nKSB7XG5cdFx0XHRtb2RlbFRlbGVtZXRyeUtpbmQgPSAndHJ1c3RlZCc7XG5cdFx0fSBlbHNlIGlmIChtb2RlbCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRtb2RlbFRlbGVtZXRyeUtpbmQgPSAndW5rbm93bic7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1vZGVsVGVsZW1ldHJ5S2luZCA9IHJlYWRBZ2VudE1vZGVsQnlva0lkZW50aWZpZXIobW9kZWwpID09PSB1bmRlZmluZWQgPyAndHJ1c3RlZCcgOiAnYnlvayc7XG5cdFx0fVxuXHRcdHJldHVybiB7IG1vZGVsOiBtb2RlbElkLCBtb2RlbFRlbGVtZXRyeUtpbmQgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBsaWVzIGEgdHVybiBtZXNzYWdlJ3MgbW9kZWwvYWdlbnQgc2VsZWN0aW9uIChzZWVcblx0ICoge0BsaW5rIF9hcHBseU1lc3NhZ2VTZWxlY3Rpb259KSBhbmQgZm9yd2FyZHMgaXQgdG8gdGhlIGFnZW50J3Ncblx0ICogYHNlbmRNZXNzYWdlYC4gQSByZWplY3RlZCBzZW5kIGlzIHdpcmVkIHRvIGZhaWwgdGhlIHR1cm46IGl0IGxvZ3MsXG5cdCAqIGRpc3BhdGNoZXMge0BsaW5rIEFjdGlvblR5cGUuQ2hhdEVycm9yfSBvbiB0aGUgdHVybiBjaGFubmVsLCBhbmQgbWFya3MgdGhlXG5cdCAqIHR1cm4gZXJyb3JlZC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3NlbmRUdXJuTWVzc2FnZShvcHRpb25zOiB7XG5cdFx0YWdlbnQ6IElBZ2VudDtcblx0XHQvKiogVGhlIGFnZW50L3Nlc3Npb24gVVJJIHRoZSBjaGF0IGxpdmVzIG9uICh0aGUgc2VuZCB0YXJnZXQpLiAqL1xuXHRcdHNlc3Npb25DaGFubmVsOiBQcm90b2NvbFVSSTtcblx0XHQvKiogVGhlIGNoYW5uZWwgdGhlIHR1cm4gcnVucyBvbiBcdTIwMTQgd2hlcmUgYENoYXRFcnJvcmAgLyB0dXJuIGNvbXBsZXRpb24gYXJlIHJlcG9ydGVkLiAqL1xuXHRcdHR1cm5DaGFubmVsOiBQcm90b2NvbFVSSTtcblx0XHQvKiogQ2hhdCBjaGFubmVsIFVSSSB0aGUgdHVybiB0YXJnZXRzLiAqL1xuXHRcdGNoYXQ6IFByb3RvY29sVVJJO1xuXHRcdG1lc3NhZ2U6IE1lc3NhZ2U7XG5cdFx0dHVybklkOiBzdHJpbmc7XG5cdFx0c2VuZGVyQ2xpZW50SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRjbGllbnRDb250ZXh0OiBJQWdlbnRIb3N0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dDtcblx0XHR0dXJuU3RvcFdhdGNoOiBTdG9wV2F0Y2g7XG5cdH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB7IGFnZW50LCBzZXNzaW9uQ2hhbm5lbCwgdHVybkNoYW5uZWwsIGNoYXQsIG1lc3NhZ2UsIHR1cm5JZCwgc2VuZGVyQ2xpZW50SWQsIGNsaWVudENvbnRleHQsIHR1cm5TdG9wV2F0Y2ggfSA9IG9wdGlvbnM7XG5cblx0XHQvLyBSZWFkLW9ubHkgY2hhdHMgcmVqZWN0IHVzZXItZGlzcGF0Y2hlZCB0dXJucy4gYGludGVyYWN0aXZpdHlgIGlzIHRoZVxuXHRcdC8vIGdlbmVyYWwgc2lnbmFsIChlLmcuIHN1YmFnZW50IHdvcmtlciBjaGF0cyBhcmUgYFJlYWRPbmx5YCksIGFuZCBhblxuXHRcdC8vIGFyY2hpdmVkIHNlc3Npb24gZG93bmdyYWRlcyBpdHMgaW50ZXJhY3RpdmUgY2hhdHMgdG8gcmVhZC1vbmx5IHRvbyBcdTIwMTQgc29cblx0XHQvLyBlbmZvcmNlIG9mZiB0aGUgY2hhdCdzIGVmZmVjdGl2ZSBpbnRlcmFjdGl2aXR5IHJhdGhlciB0aGFuIHNwZWNpYWwtY2FzaW5nXG5cdFx0Ly8gYXJjaGl2ZWQuIFRoaXMgaXMgdGhlIGVuZm9yY2VtZW50IGJlaGluZCB0aGUgVUkgaGlkaW5nIHRoZSBjb21wb3Nlciwgc28gYVxuXHRcdC8vIGJ1Z2d5IG9yIHJlbW90ZSBjbGllbnQgY2Fubm90IHJ1biB3b3JrIGluIGEgcmVhZC1vbmx5IG9yIGFyY2hpdmVkIHNlc3Npb25cblx0XHQvLyAod2hpY2ggbWF5IG5vIGxvbmdlciBoYXZlIGl0cyBpc29sYXRlZCB3b3JrdHJlZSBvbiBkaXNrKS5cblx0XHRjb25zdCBjaGF0U3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKGNoYXQpO1xuXHRcdGNvbnN0IHNlc3Npb25TdGF0dXMgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN1bW1hcnkob3B0aW9ucy5zZXNzaW9uQ2hhbm5lbCk/LnN0YXR1cyA/PyAwO1xuXHRcdGNvbnN0IHNlc3Npb25BcmNoaXZlZCA9IChzZXNzaW9uU3RhdHVzICYgU2Vzc2lvblN0YXR1cy5Jc0FyY2hpdmVkKSA9PT0gU2Vzc2lvblN0YXR1cy5Jc0FyY2hpdmVkO1xuXHRcdGlmIChpc0NoYXRSZWFkT25seShjaGF0U3RhdGU/LmludGVyYWN0aXZpdHksIHNlc3Npb25BcmNoaXZlZCkpIHtcblx0XHRcdGNvbnN0IGVycm9yID0gc2Vzc2lvbkFyY2hpdmVkXG5cdFx0XHRcdD8geyBlcnJvclR5cGU6ICdhcmNoaXZlZCcsIG1lc3NhZ2U6ICdUaGlzIHNlc3Npb24gaXMgYXJjaGl2ZWQgYW5kIHJlYWQtb25seS4gUmVzdG9yZSB0aGUgc2Vzc2lvbiB0byBjb250aW51ZSB0aGUgY29udmVyc2F0aW9uLicgfVxuXHRcdFx0XHQ6IHsgZXJyb3JUeXBlOiAncmVhZE9ubHknLCBtZXNzYWdlOiAnVGhpcyBjaGF0IGlzIHJlYWQtb25seS4nIH07XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNpZGVFZmZlY3RzXSBSZWplY3RpbmcgdHVybiBvbiByZWFkLW9ubHkgY2hhdD0ke2NoYXR9IChhcmNoaXZlZD0ke3Nlc3Npb25BcmNoaXZlZH0pLCB0dXJuSWQ9JHt0dXJuSWR9YCk7XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24odHVybkNoYW5uZWwsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0RXJyb3IsXG5cdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0ZHVyYXRpb246IHRoaXMuX3R1cm5EdXJhdGlvbih0dXJuU3RvcFdhdGNoKSxcblx0XHRcdFx0ZXJyb3IsXG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX2NvbXBsZXRlVHVybih0dXJuQ2hhbm5lbCwgdHVybklkLCAnZXJyb3InLCB7IHN0YWdlOiAndmFsaWRhdGlvbicsIGVycm9yIH0pO1xuXHRcdFx0dGhpcy5fdG9vbENhbGxUcmFja2VyLmNsZWFyU2Vzc2lvbih0dXJuQ2hhbm5lbCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhdFVyaSA9IFVSSS5wYXJzZShjaGF0KTtcblxuXHRcdGxldCBmYWlsdXJlU3RhZ2U6IEFnZW50SG9zdFR1cm5GYWlsdXJlU3RhZ2UgPSAnd29ya2luZ0RpcmVjdG9yeSc7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIEhvc3Qtb3duZWQgd29ya2luZy1kaXJlY3RvcnkgcmVzb2x1dGlvbjogcmVzb2x2ZSB0aGUgc2Vzc2lvbidzIHdvcmtpbmdcblx0XHRcdC8vIGRpcmVjdG9yeSBiZWZvcmUgdGhlIGFnZW50IG1hdGVyaWFsaXplcywgc28gdGhlIGFnZW50IHJ1bnMgaW4gaXRcblx0XHRcdC8vIHdpdGhvdXQgZXZlciBrbm93aW5nIGhvdyBpdCB3YXMgZGVyaXZlZC4gUmV0dXJucyB0aGUgY3JlYXRlZCB3b3JrdHJlZVxuXHRcdFx0Ly8gZm9yIHdvcmt0cmVlIHNlc3Npb25zIChjcmVhdGVkIGhlcmUgb24gdGhlIGZpcnN0IHNlbmQpIG9yIHRoZSBwaWNrZWRcblx0XHRcdC8vIGZvbGRlciBmb3IgZm9sZGVyIHNlc3Npb25zOyB1bmRlZmluZWQgZm9yIHdvcmtzcGFjZS1sZXNzIHNlc3Npb25zLlxuXHRcdFx0Y29uc3QgcmVzb2x2ZWRXb3JraW5nRGlyZWN0b3JpZXMgPSBhd2FpdCB0aGlzLl9vcHRpb25zLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5QmVmb3JlU2VuZD8uKHsgc2Vzc2lvbjogb3B0aW9ucy5zZXNzaW9uQ2hhbm5lbCwgY2hhdCwgdHVybklkLCBwcm9tcHQ6IG1lc3NhZ2UudGV4dCB9KTtcblx0XHRcdGNvbnN0IGNoYXRDb250ZXh0ID0gdGhpcy5fY2hhdENvbnRleHQob3B0aW9ucy5zZXNzaW9uQ2hhbm5lbCwgY2hhdCk7XG5cdFx0XHRjb25zdCBjbGllbnRPcGVyYXRpb25Db250ZXh0ID0geyAuLi5jaGF0Q29udGV4dCwgY2xpZW50VGVsZW1ldHJ5Q29udGV4dDogY2xpZW50Q29udGV4dCB9O1xuXG5cdFx0XHRjb25zdCBzZWxlY3Rpb25VcGRhdGVzOiBQcm9taXNlPHZvaWQ+W10gPSBbXTtcblx0XHRcdGlmIChtZXNzYWdlLm1vZGVsKSB7XG5cdFx0XHRcdGZhaWx1cmVTdGFnZSA9ICdtb2RlbFNlbGVjdGlvbic7XG5cdFx0XHRcdHNlbGVjdGlvblVwZGF0ZXMucHVzaChhZ2VudC5jaGF0cy5jaGFuZ2VNb2RlbChjaGF0VXJpLCBtZXNzYWdlLm1vZGVsLCBjbGllbnRPcGVyYXRpb25Db250ZXh0KSk7XG5cdFx0XHR9XG5cdFx0XHRzZWxlY3Rpb25VcGRhdGVzLnB1c2goYWdlbnQuY2hhdHMuY2hhbmdlQWdlbnQoY2hhdFVyaSwgbWVzc2FnZS5hZ2VudCwgY2xpZW50T3BlcmF0aW9uQ29udGV4dCkuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW0FnZW50U2lkZUVmZmVjdHNdIGNoYW5nZUFnZW50IGZhaWxlZCcsIGVycik7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKHNlbGVjdGlvblVwZGF0ZXMpO1xuXG5cdFx0XHRmYWlsdXJlU3RhZ2UgPSAnc2VuZE1lc3NhZ2UnO1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRBdHRhY2htZW50cyA9IGF3YWl0IHRoaXMuX3Jlc29sdmVDaGF0QXR0YWNobWVudHMobWVzc2FnZS5hdHRhY2htZW50cyk7XG5cdFx0XHRjb25zdCByZW5hbWVJbnN0cnVjdGlvbiA9IGF3YWl0IHRoaXMuX3RpdGxlQ29udHJvbGxlci5wcmVwYXJlSW5zdHJ1Y3Rpb25Gb3JBZ2VudChzZXNzaW9uQ2hhbm5lbCwgY2hhdCk7XG5cdFx0XHRjb25zdCBob3N0SW5zdHJ1Y3Rpb25zID0gW1xuXHRcdFx0XHQuLi4odGhpcy5fYWdlbnRDb25maWdTZXJ2aWNlLmdldFJvb3RWYWx1ZShwbGF0Zm9ybVJvb3RTY2hlbWEsIEFnZW50SG9zdE1hcmtkb3duUGxhblJpY2hMaW5rc0VuYWJsZWRDb25maWdLZXkpXG5cdFx0XHRcdFx0PyBbY3JlYXRlTWFya2Rvd25QbGFuUmljaExpbmtzSW5zdHJ1Y3Rpb24oY2hhdCldXG5cdFx0XHRcdFx0OiBbXSksXG5cdFx0XHRcdC4uLihyZW5hbWVJbnN0cnVjdGlvbiA/IFtyZW5hbWVJbnN0cnVjdGlvbl0gOiBbXSksXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3Qgc2VuZENvbnRleHQgPSB7IC4uLmNsaWVudE9wZXJhdGlvbkNvbnRleHQsIC4uLihob3N0SW5zdHJ1Y3Rpb25zLmxlbmd0aCA/IHsgaG9zdEluc3RydWN0aW9ucyB9IDoge30pIH07XG5cdFx0XHRpZiAodGhpcy5fY2FuY2VsbGVkVHVybklkcy5nZXQodHVybkNoYW5uZWwpPy5oYXModHVybklkKSkgeyByZXR1cm47IH1cblx0XHRcdGF3YWl0IHRoaXMuX2NoZWNrcG9pbnRTZXJ2aWNlLmNhcHR1cmVUdXJuU3RhcnRDaGVja3BvaW50KFVSSS5wYXJzZShzZXNzaW9uQ2hhbm5lbCksIGNoYXRVcmksIHR1cm5JZCwgcmVzb2x2ZWRXb3JraW5nRGlyZWN0b3JpZXMpO1xuXHRcdFx0aWYgKHRoaXMuX2NhbmNlbGxlZFR1cm5JZHMuZ2V0KHR1cm5DaGFubmVsKT8uaGFzKHR1cm5JZCkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fY2hlY2twb2ludFNlcnZpY2UuZGlzY2FyZFR1cm5TdGFydENoZWNrcG9pbnQoVVJJLnBhcnNlKHNlc3Npb25DaGFubmVsKSwgY2hhdFVyaSwgdHVybklkKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgYWdlbnQuY2hhdHMuc2VuZE1lc3NhZ2UoY2hhdFVyaSwgbWVzc2FnZS50ZXh0LCByZXNvbHZlZFdvcmtpbmdEaXJlY3RvcmllcywgcmVzb2x2ZWRBdHRhY2htZW50cywgdHVybklkLCBzZW5kZXJDbGllbnRJZCwgY2xpZW50Q29udGV4dC5jbGllbnRUeXBlLCBzZW5kQ29udGV4dCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRjb25zdCBmYWlsdXJlID0gYnVpbGRUdXJuRmFpbHVyZShmYWlsdXJlU3RhZ2UsIGVycik7XG5cdFx0XHRjb25zdCBlcnJvciA9IGZhaWx1cmUuZXJyb3I7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQWdlbnRTaWRlRWZmZWN0c10gJHtmYWlsdXJlU3RhZ2V9IGZhaWxlZCBmb3Igc2Vzc2lvbj0ke3R1cm5DaGFubmVsfTogY29kZT0ke2ZhaWx1cmUuZXJyb3JDb2RlfSwgbWVzc2FnZT0ke2Vycm9yLm1lc3NhZ2V9LCB0eXBlPSR7ZmFpbHVyZS5lcnJvck5hbWV9YCwgZXJyKTtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbih0dXJuQ2hhbm5lbCwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRFcnJvcixcblx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRkdXJhdGlvbjogdGhpcy5fdHVybkR1cmF0aW9uKHR1cm5TdG9wV2F0Y2gpLFxuXHRcdFx0XHRlcnJvcixcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fY29tcGxldGVUdXJuKHR1cm5DaGFubmVsLCB0dXJuSWQsICdlcnJvcicsIGZhaWx1cmUpO1xuXHRcdFx0dGhpcy5fdG9vbENhbGxUcmFja2VyLmNsZWFyU2Vzc2lvbih0dXJuQ2hhbm5lbCk7XG5cdFx0XHR0aGlzLl9mYWlsU2Vzc2lvbkNyZWF0aW9uSWZTdGlsbENyZWF0aW5nKHNlc3Npb25DaGFubmVsLCBlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUNoYXRBdHRhY2htZW50cyhhdHRhY2htZW50czogcmVhZG9ubHkgTWVzc2FnZUF0dGFjaG1lbnRbXSB8IHVuZGVmaW5lZCk6IFByb21pc2U8cmVhZG9ubHkgTWVzc2FnZUF0dGFjaG1lbnRbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghYXR0YWNobWVudHM/LnNvbWUoYXR0YWNobWVudCA9PiBhdHRhY2htZW50LnR5cGUgPT09IE1lc3NhZ2VBdHRhY2htZW50S2luZC5DaGF0KSkge1xuXHRcdFx0cmV0dXJuIGF0dGFjaG1lbnRzO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoYXR0YWNobWVudHMubWFwKGFzeW5jIGF0dGFjaG1lbnQgPT4ge1xuXHRcdFx0aWYgKGF0dGFjaG1lbnQudHlwZSAhPT0gTWVzc2FnZUF0dGFjaG1lbnRLaW5kLkNoYXQpIHtcblx0XHRcdFx0cmV0dXJuIGF0dGFjaG1lbnQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBBbiBgYWdlbnQtaG9zdC1zZXNzaW9uOi8vYCBsaW5rIHRoYXQgaWRlbnRpZmllcyB0aGUgcmVmZXJlbmNlZCBjaGF0LlxuXHRcdFx0Ly8gVGhlIGRlZmF1bHQgY2hhdCBpcyBhZGRyZXNzZWQgYnkgaXRzIHNlc3Npb24gKG5vIGNoYXQgaWQpOyBwZWVyIGNoYXRzXG5cdFx0XHQvLyBjYXJyeSB0aGVpciBjaGF0IGlkIHNvIHRoZSBsaW5rIG9wZW5zIHRoYXQgc3BlY2lmaWMgY2hhdC4gQSByZXNvdXJjZVxuXHRcdFx0Ly8gdGhhdCBjYW5ub3QgYmUgbWFwcGVkIHRvIGEgbGluayB5aWVsZHMgYSBwb2ludGVyIHRoYXQgbmFtZXMgdGhlIGNoYXRcblx0XHRcdC8vIGJ5IGl0cyByYXcgcmVzb3VyY2UgaW5zdGVhZCBcdTIwMTQgYSBiYWQgcmVmZXJlbmNlIG11c3QgbmV2ZXIgZmFpbCB0aGVcblx0XHRcdC8vIHVzZXIncyB0dXJuLlxuXHRcdFx0Y29uc3Qgb3BlbkxpbmsgPSBidWlsZE9wZW5TZXNzaW9uTGlua0ZvckNoYXRSZXNvdXJjZShhdHRhY2htZW50LnJlc291cmNlKTtcblx0XHRcdC8vIEEgY3Jvc3Mtc2Vzc2lvbiByZWZlcmVuY2UgbWF5IHBvaW50IGF0IGEgY2hhdCB0aGlzIGhvc3QgbmV2ZXJcblx0XHRcdC8vIHN1YnNjcmliZWQgdG87IHJlc3RvcmluZyBpdCBjYW4gdGhyb3cgd2hlbiBubyBwcm92aWRlciBvd25zIGl0IG9yXG5cdFx0XHQvLyB0aGUgYmFja2VuZCBubyBsb25nZXIgaGFzIGl0LiBBIHN0YWxlIHJlZmVyZW5jZSBtdXN0IG5vdCBmYWlsIHRoZVxuXHRcdFx0Ly8gdXNlcidzIHdob2xlIHR1cm4sIHNvIGFuIHVucmVzb2x2YWJsZSBzb3VyY2UgKGB1bmRlZmluZWRgKSBkZWdyYWRlc1xuXHRcdFx0Ly8gdG8gYSBwb2ludGVyIHdpdGhvdXQgYW4gZXhjZXJwdCBhbmQgZHJvcHMgdGhlIGBlbmRUdXJuYCBwaW4gXHUyMDE0IHRoZVxuXHRcdFx0Ly8gZW1wdHkgdHJhbnNjcmlwdCB3b3VsZCBvdGhlcndpc2UgdHJpcCBlbmRUdXJuIHZhbGlkYXRpb24uXG5cdFx0XHRjb25zdCBzb3VyY2VUdXJucyA9IGF3YWl0IHRoaXMuX3Jlc29sdmVDaGF0QXR0YWNobWVudFNvdXJjZVR1cm5zKGF0dGFjaG1lbnQucmVzb3VyY2UpO1xuXHRcdFx0aWYgKHNvdXJjZVR1cm5zID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIHJlc29sdmVDaGF0QXR0YWNobWVudCh7IC4uLmF0dGFjaG1lbnQsIGVuZFR1cm46IHVuZGVmaW5lZCB9LCBbXSwgb3BlbkxpbmspO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc291cmNlU3RhdGUgPSByZXNvbHZlQ2hhdFN0YXRlRm9yVXJpKHRoaXMuX3N0YXRlTWFuYWdlciwgYXR0YWNobWVudC5yZXNvdXJjZSk7XG5cdFx0XHRpZiAoYXR0YWNobWVudC5lbmRUdXJuICE9PSB1bmRlZmluZWQgJiYgc291cmNlU3RhdGU/LmFjdGl2ZVR1cm4/LmlkID09PSBhdHRhY2htZW50LmVuZFR1cm4pIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDaGF0IGF0dGFjaG1lbnQgZW5kVHVybiBtdXN0IHJlZmVyZW5jZSBhIGNvbXBsZXRlZCB0dXJuOiAke2F0dGFjaG1lbnQucmVzb3VyY2V9IyR7YXR0YWNobWVudC5lbmRUdXJufWApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc29sdmVDaGF0QXR0YWNobWVudChhdHRhY2htZW50LCBzb3VyY2VUdXJucywgb3BlbkxpbmspO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyB0aGUgcmVmZXJlbmNlZCBjaGF0J3MgdHVybnMsIHJldHVybmluZyBgdW5kZWZpbmVkYCB3aGVuIHRoZSBzb3VyY2Vcblx0ICogaXMgdW5yZXNvbHZhYmxlIFx1MjAxNCBlLmcuIGEgY3Jvc3Mtc2Vzc2lvbiByZWZlcmVuY2UgdG8gYSBjaGF0IHRoaXMgaG9zdCBuZXZlclxuXHQgKiBzdWJzY3JpYmVkIHRvIGFuZCBjYW5ub3QgcmVzdG9yZSAodGhlIHJlc29sdmVyIHRocm93c1xuXHQgKiBgUHJvdG9jb2xFcnJvcihBSFBfU0VTU0lPTl9OT1RfRk9VTkQpYCB3aGVuIG5vIHByb3ZpZGVyIG93bnMgaXQgb3IgdGhlXG5cdCAqIGJhY2tlbmQgbm8gbG9uZ2VyIGhhcyBpdCkuIFN1Y2ggZmFpbHVyZXMgYXJlIGxvZ2dlZCByYXRoZXIgdGhhbiByZXRocm93biBzb1xuXHQgKiBhIHN0YWxlIHJlZmVyZW5jZSBkZWdyYWRlcyBncmFjZWZ1bGx5IGluc3RlYWQgb2YgZmFpbGluZyB0aGUgdXNlcidzIHR1cm4uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlQ2hhdEF0dGFjaG1lbnRTb3VyY2VUdXJucyhyZXNvdXJjZTogUHJvdG9jb2xVUkkpOiBQcm9taXNlPHJlYWRvbmx5IFR1cm5bXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAodGhpcy5fb3B0aW9ucy5yZXNvbHZlQ2hhdEF0dGFjaG1lbnRUdXJucykge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fb3B0aW9ucy5yZXNvbHZlQ2hhdEF0dGFjaG1lbnRUdXJucyhyZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzb2x2ZUNoYXRTdGF0ZUZvclVyaSh0aGlzLl9zdGF0ZU1hbmFnZXIsIHJlc291cmNlKT8udHVybnMgPz8gW107XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNpZGVFZmZlY3RzXSBVbmFibGUgdG8gcmVzb2x2ZSBjaGF0IGF0dGFjaG1lbnQgc291cmNlICR7cmVzb3VyY2V9OyBkZWdyYWRpbmcgdG8gYSBwb2ludGVyIHdpdGhvdXQgYW4gZXhjZXJwdGAsIGVycik7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTdXJmYWNlcyBhIGZhaWxlZCBmaXJzdCB0dXJuIG9uIGEgbm90LXlldC1tYXRlcmlhbGl6ZWQgc2Vzc2lvbiBhcyBhXG5cdCAqIHRlcm1pbmFsIGNyZWF0aW9uIGZhaWx1cmUuXG5cdCAqXG5cdCAqIFByb3Zpc2lvbmFsIHNlc3Npb25zIGRlZmVyIGJvdGggdGhlaXIgcm9vdC1jYXRhbG9nIGBTZXNzaW9uQWRkZWRgXG5cdCAqIG5vdGlmaWNhdGlvbiBhbmQgdGhlaXIgYENyZWF0aW5nIC0+IFJlYWR5YCBsaWZlY3ljbGUgdHJhbnNpdGlvbiB1bnRpbCB0aGVcblx0ICogYWdlbnQgbWF0ZXJpYWxpemVzIHRoZW0gKHdvcmt0cmVlIHNldHVwLCBTREsgc2Vzc2lvbiBpbml0LCBcdTIwMjYpIG9uIHRoZVxuXHQgKiBmaXJzdCBgc2VuZE1lc3NhZ2VgLiBXaGVuIHRoYXQgZmlyc3Qgc2VuZCByZWplY3RzIFx1MjAxNCBlLmcuIHdvcmt0cmVlL2JyYW5jaFxuXHQgKiBjcmVhdGlvbiB0aHJvd3MgXHUyMDE0IHRoZSBzZXNzaW9uIG5ldmVyIGVudGVyZWQgdGhlIGNhdGFsb2cgYW5kIGl0cyBsaWZlY3ljbGVcblx0ICogaXMgc3R1Y2sgYXQgYENyZWF0aW5nYCwgc28gY2xpZW50cyB0aGF0IG9wdGltaXN0aWNhbGx5IHJlbmRlcmVkIGl0IGFzXG5cdCAqIGluLXByb2dyZXNzIGtlZXAgc3Bpbm5pbmcgZm9yZXZlci5cblx0ICpcblx0ICogV2hlbiB0aGUgZmFpbGluZyBzZXNzaW9uIGlzIHN0aWxsIGBDcmVhdGluZ2AsIGRpc3BhdGNoXG5cdCAqIHtAbGluayBBY3Rpb25UeXBlLlNlc3Npb25DcmVhdGlvbkZhaWxlZH0gdG8gbW92ZSBpdCB0byBhIHRlcm1pbmFsXG5cdCAqIGBDcmVhdGlvbkZhaWxlZGAgbGlmZWN5Y2xlLCB0aGVuIGFubm91bmNlIGl0cyBjYXRhbG9nIGVudHJ5IHZpYVxuXHQgKiB7QGxpbmsgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLm1hcmtTZXNzaW9uUGVyc2lzdGVkfS4gVGhlIHN1bW1hcnkncyBzdGF0dXNcblx0ICogd2FzIGFscmVhZHkgYWdncmVnYXRlZCB0byBgRXJyb3JgIGJ5IHRoZSBwcmVjZWRpbmcgYENoYXRFcnJvcmAgZGlzcGF0Y2gsXG5cdCAqIHNvIHN1YnNjcmliZXJzIHJlbmRlciB0aGUgc2Vzc2lvbiBhcyBmYWlsZWQgaW1tZWRpYXRlbHkgcmF0aGVyIHRoYW5cblx0ICogd2FpdGluZyBvbiBhIGNsaWVudC1zaWRlIHRpbWVvdXQuIFRoZSBwcm92aXNpb25hbCBzZXNzaW9uIHN1cnZpdmVzIG9uIHRoZVxuXHQgKiBhZ2VudCwgc28gcmVzZW5kaW5nIHJlLWF0dGVtcHRzIG1hdGVyaWFsaXphdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX2ZhaWxTZXNzaW9uQ3JlYXRpb25JZlN0aWxsQ3JlYXRpbmcoc2Vzc2lvbkNoYW5uZWw6IFByb3RvY29sVVJJLCBlcnJvcjogRXJyb3JJbmZvKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25DaGFubmVsKTtcblx0XHRpZiAoc3RhdGU/LmxpZmVjeWNsZSAhPT0gU2Vzc2lvbkxpZmVjeWNsZS5DcmVhdGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbkNoYW5uZWwsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkNyZWF0aW9uRmFpbGVkLFxuXHRcdFx0ZXJyb3IsXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc3VtbWFyeSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3VtbWFyeShzZXNzaW9uQ2hhbm5lbCk7XG5cdFx0aWYgKHN1bW1hcnkpIHtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5tYXJrU2Vzc2lvblBlcnNpc3RlZChzZXNzaW9uQ2hhbm5lbCwgc3VtbWFyeSk7XG5cdFx0fVxuXHR9XG5cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX3Rvb2xDYWxsQWdlbnRzLmNsZWFyKCk7XG5cdFx0dGhpcy5fbWFuYWdlZEFwcHJvdmFsVG9vbENhbGxzLmNsZWFyKCk7XG5cdFx0dGhpcy5fdG9vbENhbGxUcmFja2VyLmNsZWFyKCk7XG5cdFx0dGhpcy5faW5wdXRSZXF1ZXN0VHJhY2tlci5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKipcbiAqIEJ1aWxkcyB0aGUge0BsaW5rIEVycm9ySW5mb30gZm9yIGEgZmFpbGVkIGBzZW5kTWVzc2FnZWAgcmVqZWN0aW9uLiBXaGVuIHRoZVxuICogcmVqZWN0aW9uIHRleHQgY2FycmllcyBhIGBWU0NPREVfUFJPWFlfRVJST1JgIG1hcmtlciAoZW1iZWRkZWQgYnkgYSBtb2RlbFxuICogcHJveHkgYW5kIGVjaG9lZCBiYWNrIHRocm91Z2ggdGhlIGFnZW50IFNESyksIHRoZSBkZWNvZGVkIHN0cnVjdHVyZWQgY2hhdFxuICogZXJyb3IgaXMgYXR0YWNoZWQgdG8gYF9tZXRhLmNoYXRFcnJvcmAgc28gY29yZSBjYW4gcmVuZGVyIGEgcmljaCwgbG9jYWxpemVkXG4gKiBtZXNzYWdlLiBPdGhlcndpc2UgdGhlIHJhdyBlcnJvciBtZXNzYWdlIGlzIHVzZWQgYXMtaXMuXG4gKi9cbmZ1bmN0aW9uIGJ1aWxkVHVybkZhaWx1cmUoc3RhZ2U6IEFnZW50SG9zdFR1cm5GYWlsdXJlU3RhZ2UsIGVycjogdW5rbm93bik6IElBZ2VudEhvc3RUdXJuRmFpbHVyZSB7XG5cdGNvbnN0IGVycm9yID0gYnVpbGRUdXJuRmFpbHVyZUVycm9yKHN0YWdlLCBlcnIpO1xuXHRyZXR1cm4ge1xuXHRcdHN0YWdlLFxuXHRcdGVycm9yLFxuXHRcdGVycm9yTmFtZTogZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubmFtZSA6IHR5cGVvZiBlcnIsXG5cdFx0ZXJyb3JDb2RlOiBnZXRFcnJvckNvZGUoZXJyKSxcblx0XHRlcnJvclN0YWNrOiBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5zdGFjayA6IHVuZGVmaW5lZCxcblx0fTtcbn1cblxuZnVuY3Rpb24gYnVpbGRUdXJuRmFpbHVyZUVycm9yKHN0YWdlOiBBZ2VudEhvc3RUdXJuRmFpbHVyZVN0YWdlLCBlcnI6IHVua25vd24pOiBFcnJvckluZm8ge1xuXHRjb25zdCBtZXNzYWdlID0gU3RyaW5nKGVycik7XG5cdGNvbnN0IGZvcndhcmRlZCA9IHRyeVBhcnNlRm9yd2FyZGVkQ2hhdEVycm9yKGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBtZXNzYWdlKTtcblx0Y29uc3QgZXJyb3JUeXBlID0gc3RhZ2UgPT09ICdtb2RlbFNlbGVjdGlvbicgPyAnbW9kZWxTZWxlY3Rpb25GYWlsZWQnXG5cdFx0OiBzdGFnZSA9PT0gJ3dvcmtpbmdEaXJlY3RvcnknID8gJ3dvcmtpbmdEaXJlY3RvcnlGYWlsZWQnIDogJ3NlbmRGYWlsZWQnO1xuXHRpZiAoZm9yd2FyZGVkKSB7XG5cdFx0cmV0dXJuIHsgZXJyb3JUeXBlLCBtZXNzYWdlOiBzdHJpcFByb3h5RXJyb3JNYXJrZXIobWVzc2FnZSksIF9tZXRhOiB0b0NoYXRFcnJvck1ldGEoZm9yd2FyZGVkKSB9O1xuXHR9XG5cdHJldHVybiB7IGVycm9yVHlwZSwgbWVzc2FnZSB9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLFlBQVksdUJBQWdEO0FBQ3JFLFNBQVMsZUFBZTtBQUN4QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxlQUFxQztBQUM5QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsOENBQThDLGdEQUFnRCwwQkFBNEM7QUFDbkosU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxxQkFBcUIsb0RBQTJGO0FBQ3pILFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsb0JBQWlHO0FBQzFHLFNBQVMsa0JBQWtCLHNCQUFzQjtBQUNqRCxTQUFTLDhCQUE4QjtBQUV2QyxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDJDQUEyQztBQUNwRCxTQUFTLHlCQUF5QiwrQkFBbUc7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UyxDQUFDO0FBQUEsSUFDeEUsU0FBUyxLQUFLO0FBQ2IsV0FBSyxZQUFZLEtBQUssK0RBQStELFFBQVEsK0NBQStDLEdBQUc7QUFDL0ksYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUF1QlEsb0NBQW9DLGdCQUE2QixPQUF3QjtBQUNoRyxVQUFNLFFBQVEsS0FBSyxjQUFjLGdCQUFnQixjQUFjO0FBQy9ELFFBQUksT0FBTyxjQUFjLGlCQUFpQixVQUFVO0FBQ25EO0FBQUEsSUFDRDtBQUNBLFNBQUssY0FBYyxxQkFBcUIsZ0JBQWdCO0FBQUEsTUFDdkQsTUFBTSxXQUFXO0FBQUEsTUFDakI7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLFVBQVUsS0FBSyxjQUFjLGtCQUFrQixjQUFjO0FBQ25FLFFBQUksU0FBUztBQUNaLFdBQUssY0FBYyxxQkFBcUIsZ0JBQWdCLE9BQU87QUFBQSxJQUNoRTtBQUFBLEVBQ0Q7QUFBQSxFQUdTLFVBQWdCO0FBQ3hCLFNBQUssZ0JBQWdCLE1BQU07QUFDM0IsU0FBSywwQkFBMEIsTUFBTTtBQUNyQyxTQUFLLGlCQUFpQixNQUFNO0FBQzVCLFNBQUsscUJBQXFCLE1BQU07QUFDaEMsVUFBTSxRQUFRO0FBQUEsRUFDZjtBQUNEO0FBNW9FYSxtQkFBTjtBQUFBLEVBa0RKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXZEVTtBQXFwRWIsU0FBUyxpQkFBaUIsT0FBa0MsS0FBcUM7QUFDaEcsUUFBTSxRQUFRLHNCQUFzQixPQUFPLEdBQUc7QUFDOUMsU0FBTztBQUFBLElBQ047QUFBQSxJQUNBO0FBQUEsSUFDQSxXQUFXLGVBQWUsUUFBUSxJQUFJLE9BQU8sT0FBTztBQUFBLElBQ3BELFdBQVcsYUFBYSxHQUFHO0FBQUEsSUFDM0IsWUFBWSxlQUFlLFFBQVEsSUFBSSxRQUFRO0FBQUEsRUFDaEQ7QUFDRDtBQUVBLFNBQVMsc0JBQXNCLE9BQWtDLEtBQXlCO0FBQ3pGLFFBQU0sVUFBVSxPQUFPLEdBQUc7QUFDMUIsUUFBTSxZQUFZLDJCQUEyQixlQUFlLFFBQVEsSUFBSSxVQUFVLE9BQU87QUFDekYsUUFBTSxZQUFZLFVBQVUsbUJBQW1CLHlCQUM1QyxVQUFVLHFCQUFxQiwyQkFBMkI7QUFDN0QsTUFBSSxXQUFXO0FBQ2QsV0FBTyxFQUFFLFdBQVcsU0FBUyxzQkFBc0IsT0FBTyxHQUFHLE9BQU8sZ0JBQWdCLFNBQVMsRUFBRTtBQUFBLEVBQ2hHO0FBQ0EsU0FBTyxFQUFFLFdBQVcsUUFBUTtBQUM3QjsiLAogICJuYW1lcyI6IFsiYWN0aW9uIiwgInBhcnQiLCAidG9vbENhbGxLZXkiLCAibW9kZWwiXQp9Cg==
