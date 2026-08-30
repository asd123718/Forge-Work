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
import { Limiter, retry, SequencerByKey } from "../../../../base/common/async.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore } from "../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { IInstantiationService } from "../../../instantiation/common/instantiation.js";
import { INativeEnvironmentService } from "../../../environment/common/environment.js";
import { ILogService } from "../../../log/common/log.js";
import { IProductService } from "../../../product/common/productService.js";
import { IAgentPluginManager } from "../../common/agentPluginManager.js";
import { decodeProviderData, encodeProviderData } from "../agentChatBackings.js";
import { buildSideChatSourceContext, prepareSideChatPrompt, sliceSideChatTurns } from "../agentPeerChats.js";
import { AgentHostConfigKey, agentHostCustomizationConfigSchema } from "../../common/agentHostCustomizationConfig.js";
import { AgentHostClaudeMultiRootEnabledConfigKey, createSchema, platformRootSchema, platformSessionSchema, schemaProperty } from "../../common/agentHostSchema.js";
import { ClaudeSessionConfigKey, narrowClaudePermissionMode } from "../../common/claudeSessionConfigKeys.js";
import { createClaudeThinkingLevelSchema, isClaudeEffortLevel } from "../../common/claudeModelConfig.js";
import { SessionConfigKey } from "../../common/sessionConfigKeys.js";
import { AgentSession, CLAUDE_AGENT_PROVIDER_ID, SubagentChatSignal, resolveAgentChatContext, resolveAgentHostCustomizations, resolveAgentHostInstructions, resolveSubagentChatParent } from "../../common/agent.js";
import { ensureWorkspacelessScratchDir } from "../workspacelessScratchDir.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { AHP_AUTH_REQUIRED, ProtocolError } from "../../common/state/sessionProtocol.js";
import { buildDefaultChatUri, isDefaultChatUri, parseRequiredSessionUriFromChatUri } from "../../common/state/sessionState.js";
import { IAgentConfigurationService } from "../agentConfigurationService.js";
import { IAgentHostGitHubEndpointService } from "../agentHostGitHubEndpointService.js";
import { IAgentHostGitService } from "../../common/agentHostGitService.js";
import { IAgentHostCheckpointService } from "../../common/agentHostCheckpointService.js";
import { PendingRequestRegistry } from "../../common/pendingRequestRegistry.js";
import { projectFromCopilotContext } from "../copilot/copilotGitProject.js";
import { ICopilotApiService } from "../shared/copilotApiService.js";
import { IClaudeAgentSdkService } from "./claudeAgentSdkService.js";
import { buildModelEnumerationOptions } from "./claudeSdkOptions.js";
import { detectExistingClaudeSetup, resolveClaudeTransportMode } from "./claudeTransportMode.js";
import { mergeClaudeModelCatalogs, resolveClaudeSessionTransport } from "./claudeModelSelection.js";
import { mapSessionMessagesToTurns, resolveForkAnchorUuid } from "./claudeReplayMapper.js";
import { getSubagentTranscript } from "./claudeSubagentResolver.js";
import { SubagentRegistry } from "./claudeSubagentRegistry.js";
import { ClaudeAgentSession } from "./claudeAgentSession.js";
import { handleCanUseTool } from "./claudeCanUseTool.js";
import { handleElicitation } from "./claudeElicitationBridge.js";
import { createPricingMetaFromBilling, normalizeCAPIBilling } from "../../common/agentModelPricing.js";
import { tryParseClaudeModelId } from "./claudeModelId.js";
import { resolvePromptToContentBlocks } from "./claudePromptResolver.js";
import { IClaudeProxyService } from "./claudeProxyService.js";
import { readClaudePermissionMode } from "./claudeSessionPermissionMode.js";
import { ClaudeSessionMetadataStore } from "./claudeSessionMetadataStore.js";
import { IAgentHostSessionTitleSignal } from "../agentHostSessionTitleSignal.js";
import { IAgentHostOTelService } from "../../common/otel/agentHostOTelService.js";
const USER_AGENT_PREFIX = "vscode_claude_code";
function isClaudeModel(m) {
  return m.vendor === "Anthropic" && !!m.supported_endpoints?.includes("/v1/messages") && !!m.model_picker_enabled && !!m.capabilities?.supports?.tool_calls && tryParseClaudeModelId(m.id) !== void 0;
}
function toAgentModelInfo(m, provider) {
  const supports = m.capabilities?.supports;
  const supportedEfforts = (supports?.reasoning_effort ?? []).filter(isClaudeEffortLevel);
  const configSchema = createClaudeThinkingLevelSchema(supportedEfforts);
  const policyState = m.policy?.state;
  const billing = normalizeCAPIBilling(m.billing);
  const priceCategory = typeof m.model_picker_price_category === "string" ? m.model_picker_price_category : void 0;
  return {
    provider,
    // CAPI/endpoint format, dotted version (e.g. `claude-haiku-4.5`) — the
    // canonical id through `ModelSelection.id`. Convert to SDK format at SDK
    // seams via `toSdkModelId`.
    id: m.id,
    name: m.name,
    maxContextWindow: m.capabilities?.limits?.max_context_window_tokens,
    maxOutputTokens: m.capabilities?.limits?.max_output_tokens,
    maxPromptTokens: m.capabilities?.limits?.max_prompt_tokens,
    supportsVision: !!supports?.vision,
    ...configSchema ? { configSchema } : {},
    ...policyState ? { policyState } : {},
    _meta: createPricingMetaFromBilling(billing, priceCategory)
  };
}
const SDK_DEFAULT_MODEL_VALUE = "default";
function isSdkDefaultModel(m) {
  return m.value === SDK_DEFAULT_MODEL_VALUE;
}
function fromSdkModelInfo(m, provider) {
  const supportedEfforts = (m.supportedEffortLevels ?? []).filter(isClaudeEffortLevel);
  const configSchema = createClaudeThinkingLevelSchema(supportedEfforts);
  return {
    provider,
    // SDK-canonical id (`m.value`, e.g. `claude-sonnet-4-5-20250929`). Native
    // ids are SDK format end to end; `toSdkModelId` is identity at this seam.
    id: m.value,
    name: m.displayName,
    supportsVision: false,
    ...configSchema ? { configSchema } : {}
  };
}
function _toPersistedChat(backing) {
  return { sdkSessionId: backing.sdkSessionId, ...backing.model ? { model: backing.model } : {}, ...backing.sideChat ? { sideChat: backing.sideChat } : {} };
}
class ClaudeActiveClientHandle {
  constructor(clientId, displayName, chat, _setTools, _syncCustomizations) {
    this.clientId = clientId;
    this.displayName = displayName;
    this.chat = chat;
    this._setTools = _setTools;
    this._syncCustomizations = _syncCustomizations;
    this._tools = [];
    this._customizations = [];
    this._customizationsAssigned = false;
  }
  get tools() {
    return this._tools;
  }
  set tools(tools) {
    this._tools = tools;
    this._setTools(this.chat, tools);
  }
  get customizations() {
    return this._customizations;
  }
  set customizations(customizations) {
    this._customizations = customizations;
    this._customizationsAssigned = true;
    this._syncCustomizations(this.chat, customizations, this._hostCustomizations);
  }
  /** The last host snapshot, for syncs this client's own assignment triggers. */
  get hostCustomizations() {
    return this._hostCustomizations;
  }
  /** Records the host's latest published customization snapshot for this handle's owning scope, if supplied. */
  setHostCustomizations(hostCustomizations) {
    if (hostCustomizations !== void 0) {
      this._hostCustomizations = hostCustomizations;
    }
  }
  /**
   * Re-applies this handle's currently-assigned tools and (if ever assigned)
   * customizations to its chat. Used when the chat's live runtime just came
   * up, so contributions made before the runtime existed still reach it.
   */
  refresh() {
    this._setTools(this.chat, this._tools);
    if (this._customizationsAssigned) {
      this._syncCustomizations(this.chat, this._customizations, this._hostCustomizations);
    }
  }
}
let ClaudeAgent = class extends Disposable {
  constructor(_logService, _copilotApiService, _claudeProxyService, _sdkService, _sessionTitleSignal, _otelService, _gitService, _checkpointService, _configurationService, _gitHubEndpointService, _instantiationService, _pluginManager, _productService, _environmentService) {
    super();
    this._logService = _logService;
    this._copilotApiService = _copilotApiService;
    this._claudeProxyService = _claudeProxyService;
    this._sdkService = _sdkService;
    this._sessionTitleSignal = _sessionTitleSignal;
    this._otelService = _otelService;
    this._gitService = _gitService;
    this._checkpointService = _checkpointService;
    this._configurationService = _configurationService;
    this._gitHubEndpointService = _gitHubEndpointService;
    this._instantiationService = _instantiationService;
    this._pluginManager = _pluginManager;
    this._productService = _productService;
    this._environmentService = _environmentService;
    this.id = CLAUDE_AGENT_PROVIDER_ID;
    this._onDidChatProgress = this._register(new Emitter());
    this.onDidChatProgress = this._onDidChatProgress.event;
    this._onDidCustomizationsChange = this._register(new Emitter());
    this.onDidCustomizationsChange = this._onDidCustomizationsChange.event;
    this._models = observableValue(this, []);
    this.models = this._models;
    /**
     * Owns every live SDK conversation, keyed by SDK session id. This is the
     * single disposable owner of chat leaves and the reverse index used by
     * SDK-originated callbacks (credit reports, `canUseTool`, elicitation),
     * which only ever know the SDK's own id.
     */
    this._chatEntriesBySdkId = this._register(new DisposableMap());
    /**
     * Maps each host-supplied concrete chat URI to its {@link IClaudeChatBacking}.
     * This is the single, consolidated `chatUri → backing` mapping and the only
     * way a chat resolves: every chat — a session's primary chat, a fork, a
     * side chat, a restored legacy chat — has exactly one exact backing here.
     * It encodes no membership kind and no persistence scope, so nothing
     * about a chat is ever recovered from URI shape or from a
     * provider-private classification.
     */
    this._chatBackings = /* @__PURE__ */ new Map();
    /**
     * Maps each host-supplied concrete chat URI to the exact
     * {@link IChatScopeBinding} — both its configuration scope
     * (`IAgentChatContext.configurationResource`, shared session-wide) and its
     * own persistence resource (`IAgentChatContext.resource`, the exact key its
     * overlay is written under) — recorded whenever that chat is created or
     * (re-)materialized. This is the only state a fork/side-chat source's own
     * scope is ever resolved from — never the destination chat's scope, never
     * a sibling catalog grouped by session.
     */
    this._chatConfigScopes = /* @__PURE__ */ new Map();
    /**
     * Fires when a concrete chat backing's opaque `providerData` changes after creation
     * (e.g. a per-chat model switch) so the orchestrator can re-persist the
     * refreshed token. See {@link IAgent.onDidChangeChatData}.
     */
    this._onDidChangeChatData = this._register(new Emitter());
    this.onDidChangeChatData = this._onDidChangeChatData.event;
    /**
     * Membership channel for chats the agent spawns itself — today the
     * sub-agent chats delegated by a `Task`/`Agent` tool call (and, when the
     * harness gains them, Claude Teams teammates). Derived from the
     * `subagent_started` / `subagent_completed` signals that already flow on
     * {@link onDidChatProgress}, so the orchestrator records the spawn edge
     * on the unified chat catalog. See {@link IAgent.onDidSpawnChat}.
     */
    this._onDidSpawnChat = this._register(new Emitter());
    this.onDidSpawnChat = this._onDidSpawnChat.event;
    this._onDidDiscoverChats = this._register(new Emitter({
      // Discovery is provider-owned and only has observable value once the host
      // subscribes. Registered chats remain independently available through
      // listChatsToMigrate().
      onDidAddFirstListener: () => {
        void this._startClaudeCodeChatDiscovery();
      }
    }));
    this.onDidDiscoverChats = this._onDidDiscoverChats.event;
    /**
     * Stable active-client handles, keyed by `${chatKey}\0${clientId}` — one
     * handle per exact (chat, client) pair. There is no session- or
     * membership-level entry: a client contributing to several chats of the
     * same session gets one independent handle per chat, each obtained
     * through its own {@link getOrCreateActiveClient} call.
     */
    this._activeClientHandles = /* @__PURE__ */ new Map();
    /**
     * Fired once per session when {@link _materializeProvisional} promotes a
     * provisional record into a real {@link ClaudeAgentSession}. The
     * {@link IAgentService} subscribes via the platform contract to dispatch
     * the deferred `sessionAdded` notification — observers don't see the
     * session in their list until persistence has settled.
     */
    this._onDidMaterializeChat = this._register(new Emitter());
    this.onDidMaterializeChat = this._onDidMaterializeChat.event;
    /**
     * Per-SDK-session-id serializer for {@link shutdown}'s teardown pass, so
     * the drain of every live chat inherits per-session serialization for its
     * async teardown (`Query.interrupt()`, in-flight metadata writes).
     */
    this._disposeSequencer = new SequencerByKey();
    /**
     * Per-session-id serializer for {@link sendMessage}. Held across both
     * {@link _materializeProvisional} AND `entry.send()` so two concurrent
     * first-message calls on the same session collapse into one materialize
     * plus two ordered sends. Separate from {@link _disposeSequencer} so
     * teardown racing a first send still serializes without deadlocking
     * inside the send sequencer.
     */
    this._sessionSequencer = new SequencerByKey();
    // ---- Chat surface ------------------------------------------------------
    //
    // `chats` exposes the per-chat operations addressed by a single, concrete
    // chat channel URI. Every chat's SDK id comes from the host-bound
    // provider data ({@link _chatBackings}); AH supplies any transient
    // operation context required to materialize that SDK conversation.
    /**
     * The chat-addressed operation surface
     * ({@link IAgentChats}). Every method addresses a chat by a single,
     * already-resolved chat URI; `createChat` additionally receives transient
     * host context from AH (see {@link IAgentChats.createChat}) — this maps to
     * the `(session, chat)` pair the agent's internal SDK storage is keyed by
     * (via {@link _resolveChatContext}).
     *
     * `createChat` is the only creation seam. It neither knows nor asks whether
     * the chat it is creating is a session's first chat or an additional one,
     * and there is no separate fork entry point: a fork is just a creation
     * whose options name a source ({@link IAgentCreateChatOptions.fork}), so
     * every creation form (fresh, fork, import, side chat) runs the one
     * algorithm in {@link _createChat}.
     */
    this.chats = {
      createChat: (chat, context, options) => this._createChat(chat, resolveAgentChatContext(context, chat), options),
      disposeChat: (chat, context) => this._disposeChat(chat, context),
      releaseChat: (chat, context) => this._releaseChat(chat, context),
      sendMessage: (chatUri, prompt, workingDirectoriesOrDirectory, attachments, turnId, senderClientId, clientTypeOrContext, context) => {
        const workingDirectories = Array.isArray(workingDirectoriesOrDirectory) ? workingDirectoriesOrDirectory : workingDirectoriesOrDirectory ? [workingDirectoriesOrDirectory] : void 0;
        const operationContext = context ?? (typeof clientTypeOrContext === "string" ? void 0 : clientTypeOrContext);
        return this._sendMessage(chatUri, prompt, workingDirectories, attachments, turnId, senderClientId, operationContext);
      },
      abort: (chatUri, context) => {
        return this._abortSession(chatUri, context);
      },
      changeModel: (chatUri, model, context) => {
        return this._changeModel(chatUri, model, context);
      },
      changeAgent: (chatUri, agent, context) => {
        return this._changeAgent(chatUri, agent, context);
      },
      getMessages: (chat, context) => this._getChatMessages(chat, context)
    };
    this._metadataStore = _instantiationService.createInstance(ClaudeSessionMetadataStore);
    this._register(this._claudeProxyService.onDidReportCredits((e) => {
      this._findSessionBySdkId(e.sessionId)?.recordTurnCredits(e.totalNanoAiu);
    }));
    this._register(this._sessionTitleSignal.onDidChangeSessionTitle(({ provider, session, conversationId, title }) => {
      if (provider === this.id) {
        this._otelService.emitSessionTitleChanged(conversationId, session.toString(), title);
      }
    }));
    queueMicrotask(() => {
      void this._startModelRefresh();
    });
  }
  _findAnySession(sessionId) {
    return this._chatEntriesBySdkId.get(sessionId)?.chatSession;
  }
  /**
   * The opaque half of a creation result: the blob the orchestrator persists
   * verbatim, plus the separately-enumerable SDK conversation it must
   * suppress from the top-level session list.
   */
  _chatBackingResult(backing) {
    return {
      providerData: encodeProviderData(_toPersistedChat(backing)),
      backingSession: AgentSession.uri(this.id, backing.sdkSessionId)
    };
  }
  _findChatByUri(chat) {
    const sdkSessionId = this._chatBackings.get(typeof chat === "string" ? chat : chat.toString())?.sdkSessionId;
    return sdkSessionId ? this._findAnySession(sdkSessionId) : void 0;
  }
  /**
   * Resolves a host-addressed chat operation against the exact chat URI it
   * was addressed to.
   *
   * `context` is mandatory: Agent Host stamps the configuration/persistence
   * scope, the exact-chat persistence scope, the provisioning intent, the
   * catalog origin, and the session's customization snapshot on every
   * addressed chat operation, and this provider consumes all of them
   * verbatim. There is no implicit form — a chat is never resolved by
   * treating its URI as a session, by scanning live runtimes, or by parsing
   * URI shape. Resolution of the provider's own state is exactly one lookup:
   * the chat's exact backing.
   */
  _resolveChatContext(chat, context) {
    const resolved = resolveAgentChatContext(context, chat);
    const chatKey = chat.toString();
    const backing = this._chatBackings.get(chatKey);
    const sdkSessionId = backing?.sdkSessionId;
    return {
      configurationResource: resolved.configurationResource,
      sessionId: AgentSession.id(resolved.configurationResource),
      resource: resolved.resource,
      chat,
      chatKey,
      spawnedFrom: resolveSubagentChatParent(resolved),
      customizations: resolveAgentHostCustomizations(resolved),
      sdkSessionId,
      sequencerKey: sdkSessionId ?? chatKey,
      target: sdkSessionId ? this._findAnySession(sdkSessionId) : void 0
    };
  }
  /** Records `chat`'s exact scope binding, populated on create and materialize. */
  _recordChatScope(chat, configurationResource, resource) {
    this._chatConfigScopes.set(chat.toString(), { configurationResource, resource });
  }
  /** Resolves the scope binding recorded for an exact source chat. */
  _sourceChatScope(source) {
    return this._chatConfigScopes.get(source.toString());
  }
  /**
   * Validates that Agent Host supplied context on a boundary whose protocol
   * signature still types it as optional. It does on every one of them; a
   * missing context is a host bug we surface rather than paper over by
   * inventing the owning session from the chat URI.
   */
  _requireChatContext(chat, context, operation) {
    if (!context) {
      throw new Error(`[Claude] ${operation} requires host chat context for ${chat.toString()}`);
    }
    return context;
  }
  _findSessionBySdkId(sdkSessionId) {
    return this._findAnySession(sdkSessionId);
  }
  /** Wrap a { ClaudeAgentSession} in a chat-leaf entry and forward its events. */
  _wireEntry(session) {
    const entry = new ClaudeChatEntry(session);
    entry.addDisposable(session.onDidSessionProgress((signal) => {
      this._onDidChatProgress.fire(signal);
      this._emitSpawnedChatEvents(signal);
    }));
    entry.addDisposable(session.onDidCustomizationsChange(() => this._onDidCustomizationsChange.fire()));
    return entry;
  }
  _registerLiveChat(chat, session) {
    const current = this._chatBackings.get(chat.toString());
    this._deleteLiveChat(chat.toString());
    this._chatEntriesBySdkId.deleteAndDispose(session.sessionId);
    this._chatEntriesBySdkId.set(session.sessionId, this._wireEntry(session));
    this._chatBackings.set(chat.toString(), {
      sdkSessionId: session.sessionId,
      ...current?.model ? { model: current.model } : {},
      ...current?.sideChat ? { sideChat: current.sideChat } : {}
    });
  }
  _deleteLiveChat(chatKey) {
    const backing = this._chatBackings.get(chatKey);
    if (backing?.sdkSessionId) {
      this._chatEntriesBySdkId.deleteAndDispose(backing.sdkSessionId);
    }
  }
  /**
   * Tear down a chat's live entry only. Every caller that means to also
   * forget the chat's backing (a true dispose, not a release/teardown that
   * must resume later) does so explicitly — e.g. {@link _disposeChat}.
   * Never touching `_chatBackings` here keeps release/cold-resume uniform
   * for every concrete chat backing, since this operation does not encode
   * provider-specific persistence classes.
   */
  _deleteSession(session) {
    this._chatEntriesBySdkId.deleteAndDispose(session.sessionId);
  }
  /**
   * Bridges the agent's `subagent_started` signal onto the
   * {@link onDidSpawnChat} membership channel. The signals are still forwarded
   * verbatim on {@link onDidChatProgress} (the orchestrator's
   * `AgentSideEffects` keeps driving the sub-agent turn + parent tool-call
   * content); this event only mirrors the spawn into the unified chat catalog.
   * A completed subagent chat stays live and subscribable (it is removed only
   * on session teardown), so there is no corresponding end event. The catalog
   * add is idempotent so the overlap with the orchestrator's own membership
   * sequencing is safe.
   */
  _emitSpawnedChatEvents(signal) {
    const spawn = SubagentChatSignal.toSpawnEvent(signal);
    if (spawn) {
      this._onDidSpawnChat.fire(spawn);
    }
  }
  /**
   * The fallback transport for a session whose model names no provider (model-less
   * or a bare/legacy id). Read on demand at materialize — never cached — from live
   * availability: a started {@link _proxyHandle} means Copilot is serveable now, a
   * local Claude setup means native is. The precedence (sign-in state, then local
   * setup) is delegated to the pure {@link resolveClaudeTransportMode}. A
   * provider-qualified model bypasses this and routes on its own provider.
   */
  _defaultTransportMode() {
    const allowSignedOutWhenUsable = this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.AllowSignedOutWhenUsable) === true;
    return resolveClaudeTransportMode({ allowSignedOutWhenUsable, hasGitHubToken: this._proxyHandle !== void 0, hasExistingSetup: this._hasUsableNativeSetup() });
  }
  /**
   * Whether Claude can run without GitHub right now: the signed-out opt-in is on
   * AND a BYO-Anthropic credential is discoverable (see
   * {@link detectExistingClaudeSetup}). Backs both the advertised requirement and
   * the model-less transport default so the two cannot disagree.
   */
  _hasUsableNativeSetup() {
    return this._configurationService.getRootValue(agentHostCustomizationConfigSchema, AgentHostConfigKey.AllowSignedOutWhenUsable) === true && detectExistingClaudeSetup(this._environmentService.userHome.fsPath);
  }
  // #region Descriptor + auth
  getDescriptor() {
    return {
      provider: this.id,
      displayName: localize("claudeAgent.displayName", "Claude"),
      description: localize("claudeAgent.description", "Claude agent backed by the Anthropic Claude Agent SDK"),
      capabilities: {
        multipleChats: { fork: true, sideChat: true },
        ...this._isMultiRootEnabled() ? { multipleWorkingDirectories: { immutablePrimary: true } } : {}
      }
    };
  }
  _isMultiRootEnabled() {
    return this._configurationService.getRootValue(platformRootSchema, AgentHostClaudeMultiRootEnabledConfigKey) === true;
  }
  getProtectedResources() {
    const copilotResource = this._gitHubEndpointService.getCopilotResource();
    return [
      this._hasUsableNativeSetup() ? { ...copilotResource, required: false } : copilotResource,
      this._gitHubEndpointService.getRepoResource()
    ];
  }
  /**
   * Resolve the active {@link ClaudeTransport} for a session. The transport is
   * derived from `model` via {@link resolveClaudeSessionTransport}: a
   * native-Anthropic model routes native and a Copilot-routed model routes
   * proxy; a model-less or bare/legacy-id session follows the on-demand
   * {@link _defaultTransportMode}. In native mode the transport is always ready (the
   * SDK owns credentials); in proxied mode a started proxy handle is required,
   * otherwise {@link AHP_AUTH_REQUIRED} is thrown so the client can drive
   * Copilot sign-in.
   */
  _ensureAuthenticated(model) {
    const transport = resolveClaudeSessionTransport({
      model,
      defaultMode: this._defaultTransportMode()
    });
    if (transport !== "proxy") {
      return { kind: "native" };
    }
    const handle = this._proxyHandle;
    if (!handle) {
      throw new ProtocolError(
        AHP_AUTH_REQUIRED,
        "Authentication is required to use Claude",
        this.getProtectedResources()
      );
    }
    return { kind: "proxy", handle };
  }
  async authenticate(resource, token) {
    if (resource === this._gitHubEndpointService.getRepoResource().resource) {
      return true;
    }
    if (resource !== this._gitHubEndpointService.getCopilotResource().resource) {
      return false;
    }
    if (!token) {
      const oldHandle2 = this._proxyHandle;
      const changed = this._githubToken !== void 0 || oldHandle2 !== void 0;
      this._githubToken = void 0;
      this._proxyHandle = void 0;
      oldHandle2?.dispose();
      if (changed) {
        this._models.set([], void 0);
        void this._startModelRefresh();
      }
      this._logService.info(changed ? "[Claude] Auth token cleared" : "[Claude] Auth token unchanged");
      return true;
    }
    if (this._githubToken === token && this._proxyHandle) {
      this._logService.info("[Claude] Auth token unchanged");
      return true;
    }
    let newHandle;
    try {
      newHandle = await this._claudeProxyService.start(token);
    } catch (err) {
      if (this._proxyHandle) {
        const staleHandle = this._proxyHandle;
        this._proxyHandle = void 0;
        this._githubToken = void 0;
        staleHandle.dispose();
        this._models.set([], void 0);
      }
      this._logService.warn("[Claude] Copilot proxy start failed; Copilot-routed models unavailable until the next sign-in", err);
      void this._startModelRefresh();
      return true;
    }
    const oldHandle = this._proxyHandle;
    this._proxyHandle = newHandle;
    this._githubToken = token;
    this._logService.info("[Claude] Auth token updated");
    oldHandle?.dispose();
    if (oldHandle) {
      this._models.set([], void 0);
    }
    void this._startModelRefresh();
    return true;
  }
  /**
   * {@link IAgent.refreshModels}. Coalesces onto an in-flight refresh and
   * never rejects — {@link _refreshModels} already logs and handles failure.
   *
   * Only safe for callers with no new input to apply (the host's periodic
   * scheduler). Triggers that invalidate the in-flight request — a rotated
   * token, a transport flip — must call {@link _startModelRefresh} so they
   * are not answered by a refresh bound to the superseded input.
   */
  refreshModels() {
    return this._modelRefreshInFlight ?? this._startModelRefresh();
  }
  /**
   * Unconditionally begins a refresh, superseding any in-flight one as the
   * coalescing target. The superseded request stays harmless: its own
   * stale-write guard drops the result if the token or transport moved on.
   */
  _startModelRefresh() {
    const refresh = this._refreshModels().finally(() => {
      if (this._modelRefreshInFlight === refresh) {
        this._modelRefreshInFlight = void 0;
      }
    });
    this._modelRefreshInFlight = refresh;
    return refresh;
  }
  /**
   * Enumerate both providers' catalogs in parallel and publish them as one
   * provider-qualified list via {@link mergeClaudeModelCatalogs}. Each source is
   * optional — the proxy catalog needs a GitHub token, the native catalog needs a
   * local Claude setup — so a source we can't attempt contributes an empty list
   * rather than failing the whole refresh. {@link Promise.allSettled} tolerates
   * one source erroring; only when *every* source we attempted fails do we keep
   * the last known-good catalog instead of blanking, so a transient double
   * failure never wipes the picker.
   *
   * Gating the native half on {@link detectExistingClaudeSetup} is deliberate and
   * load-bearing, not just an optimization. `supportedModels()` returns a *static*
   * list of models the SDK understands — it is not an entitlement or credential
   * check, and it answers even with no `ANTHROPIC_API_KEY`, no
   * `CLAUDE_CODE_OAUTH_TOKEN` and an empty `HOME`. Publishing it unconditionally
   * would advertise models for an agent that cannot serve a single request, which
   * reads downstream as "usable without GitHub" and would hold the Agents window
   * open on an agent that fails on its first turn. An empty catalog is the honest
   * signal: it surfaces as "no models" (`SessionTypeAuthRequirement.Unusable`)
   * rather than a sign-in prompt that would not help.
   */
  async _refreshModels() {
    const tokenAtStart = this._githubToken;
    const hasNativeSetup = detectExistingClaudeSetup(this._environmentService.userHome.fsPath);
    const [proxyOutcome, nativeOutcome] = await Promise.allSettled([
      tokenAtStart ? this._fetchProxyModels(tokenAtStart) : Promise.resolve([]),
      hasNativeSetup ? this._fetchNativeModels() : Promise.resolve([])
    ]);
    if (this._githubToken !== tokenAtStart) {
      return;
    }
    const attempted = (tokenAtStart ? 1 : 0) + (hasNativeSetup ? 1 : 0);
    const failed = (proxyOutcome.status === "rejected" ? 1 : 0) + (nativeOutcome.status === "rejected" ? 1 : 0);
    if (attempted > 0 && failed === attempted) {
      this._logService.error("[Claude] All attempted model sources failed (merged refresh); keeping last known-good catalog");
      return;
    }
    const settledCatalog = (outcome, label) => {
      if (outcome.status === "fulfilled") {
        return outcome.value;
      }
      this._logService.error(outcome.reason, `[Claude] Failed to fetch ${label} models (merged refresh); keeping the other provider`);
      return [];
    };
    const proxyModels = settledCatalog(proxyOutcome, "proxy");
    const nativeModels = settledCatalog(nativeOutcome, "native");
    const merged = mergeClaudeModelCatalogs(proxyModels, nativeModels);
    this._logService.info(`[Claude] Models refreshed (merged). Count: ${merged.length}, ${merged.map((m) => m.name).join(", ")}`);
    this._models.set(merged, void 0);
  }
  /**
   * Native (BYO-Anthropic) model source: enumerate the SDK's built-in /
   * subscription models by opening a throwaway {@link IClaudeAgentSdkService.query}
   * (workspace-free options that read the user's real `~/.claude` config) and
   * calling `Query.supportedModels()` on it, then `close()`. The prompt never
   * yields, so no turn runs and no session transcript is written (verified
   * Phase 19 E2E). Projected with no commercial metadata, minus the SDK's
   * {@link isSdkDefaultModel} alias row.
   */
  async _fetchNativeModels() {
    const neverYieldingPrompt = {
      [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {
      }) })
    };
    const options = buildModelEnumerationOptions();
    const query = await this._sdkService.query({ prompt: neverYieldingPrompt, options });
    try {
      const models = await query.supportedModels();
      return models.filter((m) => !isSdkDefaultModel(m)).map((m) => fromSdkModelInfo(m, this.id));
    } finally {
      query.close();
      options.abortController?.abort();
    }
  }
  /**
   * Proxied (Copilot-CAPI) model source: fetch via {@link ICopilotApiService},
   * keep the Claude family, and surface the CAPI-flagged chat-default first.
   * The picker treats `models[0]` as the de facto default (modelPicker.ts:144
   * — `_selectedModel ?? models[0]`) since `IAgentModelInfo` carries no
   * explicit `isDefault` bit; the stable comparator returns 0 for equal-
   * priority models so CAPI's ordering wins on ties.
   */
  async _fetchProxyModels(token) {
    const userAgent = `${USER_AGENT_PREFIX}/${this._productService.version}`;
    const all = await this._copilotApiService.models(token, { headers: { "User-Agent": userAgent }, suppressIntegrationId: true });
    return all.filter(isClaudeModel).sort((a, b) => Number(b.is_chat_default) - Number(a.is_chat_default)).map((m) => toAgentModelInfo(m, this.id));
  }
  // #endregion
  // #region Chat truncation, permission/elicitation bridges, chat surface
  /**
   * Seed the eagerly-claimed active client (tools + customizations) into the
   * SDK at chat creation, mirroring the Copilot agent. Runs for fresh AND
   * re-created chats: when the workbench session state already carries the
   * active client, no follow-up `session/activeClientSet` is dispatched to
   * trigger the customization sync, so the built-in skills bundle would never
   * reach Claude otherwise. Progress is suppressed (`quiet`) because the AH
   * service may not have created the session state yet — a
   * `SessionCustomizationUpdated` envelope would be orphaned; the completed
   * snapshot is provided via `getChatCustomizations` immediately after.
   *
   * The client's contribution is addressed to exactly the chat this call
   * provisioned. A sibling chat of the same session never inherits it —
   * Agent Host addresses that chat with its own `getOrCreateActiveClient`
   * call on the next `session/activeClientSet` / `session/chatAdded` fan-out.
   */
  async _seedEagerActiveClient(chat, context, activeClient) {
    if (!activeClient) {
      return;
    }
    const handle = this.getOrCreateActiveClient(chat, context, { clientId: activeClient.clientId, displayName: activeClient.displayName });
    handle.tools = activeClient.tools;
    if (activeClient.customizations !== void 0) {
      await this.syncClientCustomizations(chat, context, activeClient.clientId, activeClient.customizations, { quiet: true });
    }
  }
  /**
   * In-place "Restore Checkpoint" truncation. Keeps turns
   * `[0..turnId]` INCLUSIVE (or removes all turns when `turnId` is
   * omitted) on the **same** session id / URI — unlike fork, which mints a
   * new id. The `turnId` path resolves the protocol turn to its SDK
   * assistant-envelope uuid ({@link resolveForkAnchorUuid}) and stages it
   * as a one-shot `resumeSessionAt` anchor that the next turn's rebuild
   * applies (the truncation finalizes when the next turn writes the
   * branch). Serialized on {@link _sessionSequencer} (same key as
   * `sendMessage`) so the `ChatTruncated` → `ChatTurnStarted` dispatch pair
   * stays ordered. Provisional sessions short-circuit.
   *
   * The owning session comes from `context` like every other addressed chat
   * operation, so the session-shaped first parameter is unused.
   */
  async truncateChat(chat, turnId, context) {
    if (!context) {
      throw new Error(`[Claude] truncateChat requires host chat context for ${chat.toString()}`);
    }
    const initialContext = this._resolveChatContext(chat, context);
    await this._sessionSequencer.queue(initialContext.sequencerKey, async () => {
      const current = this._resolveChatContext(chat, context);
      const existing = current.target;
      const sdkSessionId = current.sdkSessionId;
      if (!sdkSessionId) {
        throw new Error(`Cannot truncate chat ${chat.toString()}: backing SDK session not found`);
      }
      if (existing && !existing.isPipelineReady) {
        this._logService.info(`[Claude:${sdkSessionId}] truncateChat on a provisional chat \u2014 nothing to truncate`);
        return;
      }
      if (turnId === void 0) {
        await this._removeAllTurns(current, sdkSessionId, existing);
        return;
      }
      const messages = await this._sdkService.getSessionMessages(sdkSessionId, { includeSystemMessages: true });
      const anchor = resolveForkAnchorUuid(messages, turnId);
      if (anchor === void 0) {
        throw new Error(`Cannot truncate session ${sdkSessionId}: turn ${turnId} not found in transcript`);
      }
      const live = existing ?? await this._ensureResolvedChatSession(current);
      await live.truncateToTurn(turnId, anchor, current.resource);
      this._logService.info(`[Claude:${sdkSessionId}] truncateChat kept [0..${turnId}] (anchor=${anchor})`);
    });
  }
  /**
   * Remove-all ("start over") branch of {@link truncateChat}: there is no
   * anchor to resume at, so tear down the live Query, delete the on-disk
   * transcript via the SDK, then recreate a fresh provisional bound to the
   * SAME chat and SDK id, so the next `sendMessage` materializes non-resume
   * `{ sessionId }` on a clean transcript. `deleteSession` is eagerly durable
   * (unlike the lazy `turnId` path), matching its "clear / start over"
   * semantic. `existing` is the live session, or `undefined` on the cold path
   * (unloaded chat).
   *
   * The SDK's own record is read BEFORE the delete so the cold path still
   * recovers the working directory the recreated conversation needs — after
   * `deleteSession` the transcript (and its `cwd`) may be gone. Caller
   * serializes on {@link _sessionSequencer}.
   */
  async _removeAllTurns(context, sdkSessionId, existing) {
    const info = existing ? void 0 : await this._sdkService.getSessionInfo(sdkSessionId);
    const workingDirectories = existing?.workingDirectories ?? (info?.cwd ? [URI.file(info.cwd)] : void 0);
    await existing?.shutdownLiveQuery();
    if (existing) {
      this._deleteSession(existing);
    }
    await this._sdkService.deleteSession(sdkSessionId);
    const fresh = await this._createProvisionalChatSession(context.configurationResource, context.chat, context.resource, workingDirectories);
    await fresh.pruneAllTurns(context.resource);
    this._logService.info(`[Claude:${sdkSessionId}] truncateChat removed all turns (deleteSession + fresh same-id)`);
  }
  /**
   * Builds the SDK `canUseTool` permission bridge for a session/chat. The
   * resolver searches every live SDK conversation by SDK id so one
   * chat's tool-permission requests reach its own pending-permission registry.
   *
   * `configurationResource` is the session-wide config scope, distinct from
   * the invoking chat's own `resource` — a peer/side chat has its own
   * `resource` but shares its owning session's `configurationResource`.
   * `ExitPlanMode`'s permission-mode write (the bridge's one config
   * mutation) must target that shared scope regardless of which chat
   * approved the plan.
   */
  _makeCanUseTool(sdkSessionId, configurationResource) {
    return (toolName, input, options) => handleCanUseTool(
      {
        getSession: (id) => this._findSessionBySdkId(id),
        configurationService: this._configurationService,
        configurationResource,
        serverToolHost: this._serverToolHost
      },
      sdkSessionId,
      toolName,
      input,
      options
    );
  }
  /**
   * Builds the SDK `onElicitation` bridge for a session/chat. Mirrors
   * {@link _makeCanUseTool}: resolves the session by SDK id (all live
   * chats) and delegates to the elicitation bridge, which parks on the
   * session's user-input channel.
   */
  _makeOnElicitation(sdkSessionId) {
    return (request, options) => handleElicitation(
      { getSession: (id) => this._findSessionBySdkId(id) },
      sdkSessionId,
      request,
      options
    );
  }
  /**
   * Promote a provisional {@link ClaudeAgentSession} into a live one.
   * Called from {@link sendMessage} inside the {@link _sessionSequencer.queue}
   * block, so concurrent first sends serialize naturally — exactly
   * one materialize per session.
   *
   * Failure modes:
   * - Missing session entry → programmer error, throws.
   * - Missing proxy handle → caller forgot {@link authenticate}, throws.
   * - Aborted before SDK init returns → {@link ClaudeAgentSession.materialize}
   *   disposes the `WarmQuery` and throws {@link CancellationError}.
   * - Customization-directory persistence failure → fatal: the session's
   *   `materialize` throws, the agent drops the entry, and the error
   *   propagates so the caller learns about it.
   * - Aborted post-metadata-write but pre-commit → second abort gate
   *   inside `materialize` throws so we never expose a live pipeline
   *   for a session the caller has already torn down.
   */
  async _materializeProvisional(sessionId, context, workingDirectories) {
    const session = this._findAnySession(sessionId);
    if (!session) {
      throw new Error(`Cannot materialize unknown provisional session: ${sessionId}`);
    }
    const resource = context.resource;
    const transport = this._ensureAuthenticated(session.provisionalModel);
    const canUseTool = this._makeCanUseTool(sessionId, context.configurationResource);
    const onElicitation = this._makeOnElicitation(sessionId);
    this._recordChatScope(context.chat, context.configurationResource, context.resource);
    try {
      await session.materialize({
        transport,
        canUseTool,
        onElicitation,
        isResume: false,
        resource,
        configResource: context.configurationResource,
        customizations: context.customizations,
        workingDirectories,
        serverToolHost: this._serverToolHost
      });
      await this._persistSessionOverlay(resource, context.configurationResource, session, transport.kind);
      if (session.abortController.signal.aborted) {
        throw new CancellationError();
      }
    } catch (err) {
      this._deleteSession(session);
      throw err;
    }
    const materializedWorkingDirectories = workingDirectories ?? session.workingDirectories;
    this._checkpointService.captureBaselineCheckpoint(context.configurationResource, materializedWorkingDirectories).catch((err) => {
      this._logService.warn(`[Claude:${sessionId}] Baseline checkpoint capture failed: ${err instanceof Error ? err.message : String(err)}`);
    });
    this._onDidMaterializeChat.fire({
      chat: context.chat,
      project: session.project,
      workingDirectories: materializedWorkingDirectories
    });
    return session;
  }
  async _persistSessionOverlay(resource, configResource, session, transportKind) {
    try {
      await this._metadataStore.write(resource, {
        customizationDirectory: session.workingDirectory,
        model: session.provisionalModel,
        permissionMode: readClaudePermissionMode(this._configurationService, configResource) ?? session.permissionModeFallback,
        transport: transportKind,
        workingDirectories: session.workingDirectories,
        ...session.provisionalAgent ? { agent: session.provisionalAgent } : {}
      });
    } catch (err) {
      this._logService.error(`[Claude] Failed to persist customization directory; aborting materialize`, err);
      throw err;
    }
  }
  /**
   * Pull `permissionMode` out of the post-validation `IAgentCreateChatOptions.config`
   * bag, narrowing the runtime `unknown` value to the SDK's `PermissionMode`
   * union (5/6 values, excluding `dontAsk`; sdk.d.ts:1560). Falls back to
   * `'default'` when the bag is absent or carries something the schema
   * validator shouldn't have accepted (defense-in-depth).
   */
  _resolvePermissionMode(config) {
    return narrowClaudePermissionMode(config?.[ClaudeSessionConfigKey.PermissionMode]) ?? "default";
  }
  async _disposeLiveSession(session) {
    session.abortController.abort();
    if (!session.isPipelineReady) {
    } else {
      session.abort();
    }
    this._deleteSession(session);
  }
  // #region Chat creation — the one algorithm every chat is created by
  /**
   * The single chat-creation algorithm.
   *
   * Every chat Agent Host creates runs exactly this path — a session's first
   * chat, an additional chat, a fork, an import, a side chat. There is no
   * session-versus-additional branch and no provider-side chat role: this
   * consumes the fully-resolved options AH hands over (model, agent, working
   * directories, project, config, active client, plus the optional
   * import / fork / side-chat sources), binds the addressed chat to exactly
   * one SDK conversation, records that conversation as the chat's exact
   * opaque backing, and hands the backing back.
   *
   * The result reports what this creation resolved for the chat itself — the
   * resolved `project` / `resolvedWorkingDirectory`, and the `provisional`
   * bit for a runtime that has not reached the SDK yet — next to the opaque
   * `providerData` blob and the separately-enumerable `backingSession` AH
   * suppresses from its session list. There is no `session` field: what any
   * of that means for the chat's role in the session is Agent Host's
   * decision, not this provider's.
   */
  async _createChat(chat, context, options) {
    const model = options?.importConversation?.model ?? options?.model;
    if (model || !options?.fork && !options?.sideChat) {
      this._ensureAuthenticated(model);
    }
    const chatKey = chat.toString();
    this._recordChatScope(chat, context.configurationResource, context.resource);
    return this._sessionSequencer.queue(chatKey, async () => {
      const existing = this._chatBackings.get(chatKey);
      const created = existing ? this._recreatedChatResult(existing, options) : await this._bindChatConversation(chat, context, model, options);
      await this._seedEagerActiveClient(chat, context, options?.activeClient);
      return created;
    });
  }
  /**
   * Re-creation of a chat this provider already backs: hand the recorded
   * backing back verbatim so the orchestrator re-persists a consistent blob,
   * together with whatever its live runtime (if any) has resolved so far.
   */
  _recreatedChatResult(backing, options) {
    const live = this._findAnySession(backing.sdkSessionId);
    const resolvedWorkingDirectory = live?.workingDirectory ?? options?.workingDirectories?.[0];
    return {
      ...live?.project ? { project: live.project } : {},
      ...resolvedWorkingDirectory ? { resolvedWorkingDirectory } : {},
      ...live && !live.isPipelineReady ? { provisional: true } : {},
      ...this._chatBackingResult(backing)
    };
  }
  /**
   * Bind the addressed chat to exactly one SDK conversation: the one
   * inherited from a fork / side-chat source when that source resolves, a
   * freshly minted one otherwise.
   */
  async _bindChatConversation(chat, context, model, options) {
    const { sdkSessionId, sideChat } = await this._inheritSourceConversation(options);
    return sdkSessionId !== void 0 ? this._bindInheritedConversation(chat, context, sdkSessionId, sideChat, model, options) : this._bindFreshConversation(chat, context, sideChat, model, options);
  }
  /**
   * Resolve the SDK conversation a new chat inherits from its fork or
   * side-chat source, plus the side-chat provenance recorded on the backing.
   *
   * An unresolvable source — the source chat has no backing, or its turn is
   * absent from the SDK transcript, which is the normal case for a source
   * conversation that is still live and unflushed — is deliberately not
   * fatal: the chat is created fresh instead of inheriting the whole source
   * backend or failing outright. Agent Host has already seeded the visible
   * turns it forked, so a fresh backing is a degraded branch rather than a
   * lost chat.
   */
  async _inheritSourceConversation(options) {
    if (options?.fork) {
      const forked2 = await this._forkChat(options.fork);
      return forked2 ? { sdkSessionId: forked2.sessionId } : {};
    }
    if (!options?.sideChat) {
      return {};
    }
    const source = options.sideChat;
    const forked = await this._forkChat({ source: source.source, turnId: source.providerAnchorTurnId ?? source.turnId });
    const fallbackContext = source.sourceContext ?? (forked ? void 0 : await this._buildSideChatContextFromTranscript(source.source, source.turnId));
    if (!forked && !fallbackContext && !source.partialResponse) {
      this._logService.warn(`[Claude] createChat side chat: nothing to inherit from source turn ${source.turnId} of ${source.source.toString()}; creating the side chat without branching context`);
    }
    return {
      ...forked ? { sdkSessionId: forked.sessionId } : {},
      sideChat: {
        turnId: source.turnId,
        ...source.selection ? { selection: source.selection } : {},
        ...forked?.inheritedTurnId !== void 0 ? { inheritedTurnId: forked.inheritedTurnId } : {},
        ...fallbackContext ? { context: fallbackContext } : {},
        ...source.partialResponse ? { partialResponse: source.partialResponse } : {}
      }
    };
  }
  /**
   * Bind a chat to an SDK conversation inherited from a fork / side-chat
   * source. That conversation already owns a transcript on disk, so nothing
   * is materialized here: recording the backing alone routes the chat's first
   * send through {@link _createProvisionalChatSession}, which cold-resumes it
   * (`isResume: true`) exactly like any other restored chat — see CONTEXT M9.
   * Its resolved settings are persisted to the overlay right away precisely
   * because there is no in-memory runtime holding them in the meantime.
   *
   * Everything inherited comes from the source's own provider state (its SDK
   * `cwd`, its live runtime, its overlay); host-supplied options override it.
   */
  async _bindInheritedConversation(chat, context, sdkSessionId, sideChat, model, options) {
    const sourceChat = options?.fork?.source ?? options?.sideChat?.source;
    const sourceBinding = sourceChat ? this._sourceChatScope(sourceChat) : void 0;
    const sourceResource = sourceBinding?.resource ?? sourceChat ?? context.resource;
    let sourceOverlay = {};
    try {
      sourceOverlay = await this._metadataStore.read(sourceResource);
    } catch (err) {
      this._logService.warn(`[Claude] createChat: source overlay read failed for ${sourceResource.toString()}; continuing with defaults`, err);
    }
    const sourceSdkId = sourceChat ? this._sourceChatSdkId(sourceChat) : void 0;
    const liveSource = sourceSdkId ? this._findAnySession(sourceSdkId) : void 0;
    const backingModel = sourceChat ? this._chatBackings.get(sourceChat.toString())?.model : void 0;
    const inheritedModel = model ?? liveSource?.provisionalModel ?? sourceOverlay.model ?? backingModel;
    const agent = options?.agent ?? liveSource?.provisionalAgent ?? sourceOverlay.agent;
    const permissionMode = narrowClaudePermissionMode(options?.config?.[ClaudeSessionConfigKey.PermissionMode]) ?? liveSource?.permissionModeFallback ?? sourceOverlay.permissionMode;
    const sdkInfo = await this._sdkService.getSessionInfo(sdkSessionId);
    const inheritedDirectories = liveSource?.workingDirectories ?? sourceOverlay.workingDirectories ?? options?.workingDirectories;
    const workingDirectory = sdkInfo?.cwd ? URI.file(sdkInfo.cwd) : inheritedDirectories?.[0];
    if (!workingDirectory) {
      throw new Error(`Cannot create chat ${chat.toString()}: inherited conversation ${sdkSessionId} has no working directory (SDK cwd and source working directories missing)`);
    }
    const workingDirectories = [workingDirectory, ...inheritedDirectories?.slice(1) ?? []];
    await this._metadataStore.write(context.resource, {
      ...inheritedModel ? { model: inheritedModel } : {},
      ...permissionMode ? { permissionMode } : {},
      ...agent ? { agent } : {},
      workingDirectories
    });
    const project = await this._resolveProject(workingDirectory);
    const backing = this._recordChatBacking(chat, { sdkSessionId, ...inheritedModel ? { model: inheritedModel } : {}, ...sideChat ? { sideChat } : {} });
    this._logService.info(`[Claude] Bound chat ${chat.toString()} to inherited conversation ${sdkSessionId} for scope ${context.configurationResource.toString()}`);
    return {
      resolvedWorkingDirectory: workingDirectory,
      ...project ? { project } : {},
      ...this._chatBackingResult(backing)
    };
  }
  /**
   * Bind a chat to a freshly minted SDK conversation, whose id is independent
   * of the Agent Host session id. The conversation is provisional: nothing
   * reaches the SDK (and nothing is persisted) until the chat's first send
   * materializes it, so the in-memory {@link ClaudeAgentSession} carries the
   * resolved model / agent / config / permission mode until
   * {@link _persistSessionOverlay} writes them at materialize time.
   *
   * `importConversation` has no native transcript-seeding capability on
   * Claude (unlike Copilot's JSONL event-log import): there is no SDK API to
   * seed a conversation from arbitrary `Turn[]`. The imported turns' display
   * is the host-level catalog's responsibility until this chat's first real
   * `sendMessage` starts a genuine SDK transcript.
   */
  async _bindFreshConversation(chat, context, sideChat, model, options) {
    const sdkSessionId = generateUuid();
    const requestedWorkingDirectory = options?.workingDirectories?.[0];
    const workingDirectory = requestedWorkingDirectory ?? await ensureWorkspacelessScratchDir(this._environmentService.userHome, AgentSession.id(context.configurationResource));
    const project = requestedWorkingDirectory ? await this._resolveProject(requestedWorkingDirectory) : void 0;
    const backing = this._recordChatBacking(chat, { sdkSessionId, ...model ? { model } : {}, ...sideChat ? { sideChat } : {} });
    const session = ClaudeAgentSession.createProvisional(
      sdkSessionId,
      chat,
      workingDirectory,
      project,
      model,
      options?.agent,
      options?.config,
      new PendingRequestRegistry(),
      this._resolvePermissionMode(options?.config),
      this._instantiationService,
      options?.workingDirectories?.slice(1) ?? []
    );
    this._registerLiveChat(chat, session);
    this._logService.info(`[Claude] Bound chat ${chat.toString()} to fresh conversation ${sdkSessionId} for scope ${context.configurationResource.toString()}`);
    return {
      resolvedWorkingDirectory: workingDirectory,
      provisional: true,
      ...project ? { project } : {},
      ...this._chatBackingResult(backing)
    };
  }
  /** Record a chat's exact backing, replacing any previous one. */
  _recordChatBacking(chat, backing) {
    this._chatBackings.set(chat.toString(), backing);
    return backing;
  }
  /** Best-effort git project metadata for a resolved working directory. */
  async _resolveProject(workingDirectory) {
    try {
      return await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
    } catch (err) {
      this._logService.warn(`[Claude] project resolution failed for ${workingDirectory.toString()}; continuing without project`, err);
      return void 0;
    }
  }
  /**
   * Dispose exactly one chat, tearing down its live SDK session (if any) and
   * dropping its backing.
   *
   * Routed through {@link _sessionSequencer} (keyed on the chat's SDK id) so
   * it waits for any in-flight {@link _resolveOrResumeChatSessionLocked} or
   * {@link sendMessage} to finish before tearing down — prevents
   * use-after-dispose if a send is concurrently in progress. The durable
   * chat catalog is owned by the orchestrator now, so this only drops the
   * live session and its provider backing data. There is no separate
   * session-level finalization hook: the trace context keyed on the chat's
   * own `resource` (the configuration scope, for a session's primary chat)
   * is released right here, once, when that exact chat is disposed.
   */
  async _disposeChat(chat, operationContext) {
    const chatKey = chat.toString();
    const initialContext = this._resolveChatContext(chat, operationContext);
    await this._sessionSequencer.queue(initialContext.sequencerKey, async () => {
      const target = this._findChatByUri(chatKey);
      if (target) {
        await this._disposeLiveSession(target);
      }
      this._chatBackings.delete(chatKey);
      this._chatConfigScopes.delete(chatKey);
      this._pruneActiveClientHandlesForChat(chat);
      this._otelService.releaseSessionTraceContext(initialContext.resource.toString());
    });
  }
  async _releaseChat(chat, operationContext) {
    const chatKey = chat.toString();
    const initialContext = this._resolveChatContext(chat, operationContext);
    await this._sessionSequencer.queue(initialContext.sequencerKey, async () => {
      const target = this._findChatByUri(chatKey);
      if (!target || !target.isPipelineReady || target.hasActiveTurn) {
        return;
      }
      this._logService.info(`[Claude:${target.sessionId}] Releasing idle chat from memory (durable state preserved)`);
      await this._disposeLiveSession(target);
    });
  }
  /**
   * Fork the source chat's SDK conversation at the requested turn and return
   * the new conversation's id plus the id of its final inherited turn. Returns
   * `undefined` — so the caller mints a fresh conversation instead — when the
   * source chat has no backing or the fork anchor is absent from the SDK
   * transcript.
   *
   * Deliberately NOT serialized against the source conversation: a side chat
   * branches from a turn that is typically still in flight, so waiting for
   * the source's sequencer would park the new chat behind the very turn it
   * branches from. The SDK's flushed transcript is read-only here.
   */
  async _forkChat(fork) {
    const sourceSdkId = this._sourceChatSdkId(fork.source);
    if (!sourceSdkId) {
      this._logService.warn(`[Claude] createChat fork: source ${fork.source.toString()} has no SDK chat; creating fresh chat`);
      return void 0;
    }
    const messages = await this._sdkService.getSessionMessages(sourceSdkId, { includeSystemMessages: true });
    const upToMessageId = resolveForkAnchorUuid(messages, fork.turnId);
    if (upToMessageId === void 0) {
      this._logService.warn(`[Claude] createChat fork: turn ${fork.turnId} not found in source ${sourceSdkId}; creating fresh chat`);
      return void 0;
    }
    const { sessionId } = await this._sdkService.forkSession(sourceSdkId, { upToMessageId });
    const anchorIndex = messages.findIndex((message) => message.uuid === upToMessageId);
    const inheritedTurns = mapSessionMessagesToTurns(messages.slice(0, anchorIndex + 1), fork.source, this._logService);
    return { sessionId, inheritedTurnId: inheritedTurns.at(-1)?.id };
  }
  /** Resolves the SDK conversation recorded for an exact source chat. */
  _sourceChatSdkId(source) {
    return this._chatBackings.get(source.toString())?.sdkSessionId;
  }
  /**
   * Bounded source-chat context for a side chat whose fork could not be
   * anchored, reconstructed from the source chat's **own SDK transcript**.
   *
   * Used only when Agent Host supplied none of its own. The transcript is
   * provider-owned data, so this reads no host state and re-derives no host
   * fact — and because the SDK assigns its own envelope ids, the requested
   * turn is bounded when the transcript happens to carry it and the whole
   * transcript is used otherwise.
   *
   * Returns `undefined` when the SDK cannot serve the source transcript,
   * which is the normal case for a source conversation that is still live:
   * Claude's session store only answers for conversations it has flushed.
   */
  async _buildSideChatContextFromTranscript(source, turnId) {
    const sourceSdkId = this._sourceChatSdkId(source);
    if (!sourceSdkId) {
      return void 0;
    }
    const turns = await this._reconstructTurns(sourceSdkId, source, void 0);
    if (turns.length === 0) {
      this._logService.info(`[Claude] createChat side chat: source ${source.toString()} (sdk ${sourceSdkId}) has no readable transcript to bound context from`);
      return void 0;
    }
    const index = turns.findIndex((turn) => turn.id === turnId);
    return buildSideChatSourceContext(index >= 0 ? turns.slice(0, index + 1) : turns);
  }
  /**
   * Returns the live {@link ClaudeAgentSession} for an exact chat, resuming
   * its provider backing when necessary. The caller holds the chat sequencer.
   */
  async _resolveOrResumeChatSessionLocked(context, workingDirectories) {
    const { configurationResource, chat, chatKey, resource } = context;
    const existing = this._findChatByUri(chatKey);
    if (existing?.isPipelineReady) {
      return existing;
    }
    const chatSession = existing ?? await this._createProvisionalChatSession(configurationResource, chat, resource, workingDirectories);
    const sdkInfo = await this._sdkService.getSessionInfo(chatSession.sessionId);
    const transport = this._ensureAuthenticated(chatSession.provisionalModel);
    const canUseTool = this._makeCanUseTool(chatSession.sessionId, configurationResource);
    const onElicitation = this._makeOnElicitation(chatSession.sessionId);
    this._recordChatScope(chat, configurationResource, resource);
    try {
      await chatSession.materialize({
        transport,
        canUseTool,
        onElicitation,
        isResume: !!sdkInfo,
        resource,
        configResource: configurationResource,
        customizations: context.customizations,
        workingDirectories,
        serverToolHost: this._serverToolHost
      });
      await this._persistSessionOverlay(resource, configurationResource, chatSession, transport.kind);
    } catch (err) {
      this._deleteLiveChat(chatKey);
      throw err;
    }
    this._onDidMaterializeChat.fire({
      chat: context.chat,
      project: chatSession.project,
      workingDirectories: workingDirectories ?? chatSession.workingDirectories
    });
    return chatSession;
  }
  /**
   * Resolves the live runtime for an addressed chat, materializing or
   * cold-resuming its exact backing as needed.
   *
   * Uniform for every chat: there is one provider state to consult (the
   * chat's exact backing) and one shape of resolution. A chat with no
   * backing is a host contract violation — Agent Host creates or
   * re-materializes a backing before addressing any operation to a chat —
   * so it surfaces rather than being guessed at from the session identity.
   */
  async _ensureResolvedChatSession(context, workingDirectories) {
    const existing = context.target;
    if (existing?.isPipelineReady) {
      return existing;
    }
    if (existing) {
      return this._materializeProvisional(existing.sessionId, context, workingDirectories);
    }
    return this._resolveOrResumeChatSessionLocked(context, workingDirectories);
  }
  /**
   * Build a provisional {@link ClaudeAgentSession} from an exact chat backing
   * and its provider-owned overlay.
   */
  async _createProvisionalChatSession(configurationResource, chat, resource, fallbackWorkingDirectories) {
    const info = this._chatBackings.get(chat.toString());
    if (!info) {
      throw new Error(`[Claude] no backing chat for chat ${chat.toString()}`);
    }
    let overlay = {};
    try {
      overlay = await this._metadataStore.read(resource);
    } catch (err) {
      this._logService.warn(`[Claude] chat overlay read failed for ${chat.toString()}; continuing with defaults`, err);
    }
    const sdkInfo = await this._sdkService.getSessionInfo(info.sdkSessionId);
    const workingDirectories = sdkInfo?.cwd ? [URI.file(sdkInfo.cwd), ...overlay.workingDirectories?.slice(1) ?? []] : overlay.workingDirectories ?? fallbackWorkingDirectories;
    const workingDirectory = workingDirectories?.[0];
    if (!workingDirectory) {
      throw new Error(`[Claude] cannot materialize chat ${chat.toString()}: working directory missing (no SDK transcript and no persisted overlay)`);
    }
    const additionalDirectories = workingDirectories.slice(1);
    let project;
    try {
      project = await projectFromCopilotContext({ cwd: workingDirectory.fsPath }, this._gitService);
    } catch (err) {
      this._logService.warn(`[Claude] project resolution failed for chat ${chat.toString()}; continuing without project`, err);
    }
    const permissionMode = readClaudePermissionMode(this._configurationService, configurationResource) ?? overlay.permissionMode ?? "default";
    const model = overlay.model ?? info.model;
    const chatSession = ClaudeAgentSession.createProvisional(
      info.sdkSessionId,
      chat,
      workingDirectory,
      project,
      model,
      overlay.agent,
      void 0,
      new PendingRequestRegistry(),
      permissionMode,
      this._instantiationService,
      additionalDirectories
    );
    this._registerLiveChat(chat, chatSession);
    this._recordChatScope(chat, configurationResource, resource);
    this._forEachActiveClientHandleForChat(chat, (handle) => handle.refresh());
    return chatSession;
  }
  /** Visits the active-client handles Agent Host registered for the exact `chat`. */
  _forEachActiveClientHandleForChat(chat, visit) {
    const prefix = `${chat.toString()}\0`;
    for (const [key, handle] of this._activeClientHandles) {
      if (key.startsWith(prefix)) {
        visit(handle);
      }
    }
  }
  /** Drops every active-client handle addressed to the exact `chat`, e.g. on dispose. */
  _pruneActiveClientHandlesForChat(chat) {
    const prefix = `${chat.toString()}\0`;
    for (const key of [...this._activeClientHandles.keys()]) {
      if (key.startsWith(prefix)) {
        this._activeClientHandles.delete(key);
      }
    }
  }
  /**
   * Update a concrete chat backing's model and push the refreshed opaque
   * `providerData` blob to the orchestrator (via
   * {@link onDidChangeChatData}) so the durable catalog stays in sync.
   */
  async _updateChatBackingModel(chat, model) {
    const existing = this._chatBackings.get(chat.toString());
    if (!existing) {
      return;
    }
    const updated = { ...existing, model };
    this._chatBackings.set(chat.toString(), updated);
    this._onDidChangeChatData.fire({ chat, providerData: encodeProviderData(_toPersistedChat(updated)) });
  }
  /**
   * Re-attach a concrete chat backing from opaque provider data, recording
   * its exact scope binding (configuration scope AND own persistence
   * resource) so a later fork naming this chat as its source can resolve
   * both without deriving them from URI shape. This is the sole restore
   * path for a chat that was never (re-)created in this process — a cold
   * chat — so it is the only place that scope binding exists for it.
   */
  async materializeChat(chat, context, providerData) {
    const resolved = resolveAgentChatContext(context, chat);
    this._recordChatScope(chat, resolved.configurationResource, resolved.resource);
    if (providerData === void 0) {
      if (!isDefaultChatUri(chat)) {
        return;
      }
      const backing = { sdkSessionId: AgentSession.id(resolved.configurationResource) };
      this._chatBackings.set(chat.toString(), backing);
      return { providerData: encodeProviderData(_toPersistedChat(backing)) };
    }
    const persisted = decodeProviderData(providerData);
    if (!persisted) {
      this._logService.warn(`[Claude] materializeChat: dropping corrupt providerData for ${chat.toString()}`);
      return;
    }
    this._chatBackings.set(chat.toString(), { sdkSessionId: persisted.sdkSessionId, ...persisted.model ? { model: persisted.model } : {}, ...persisted.sideChat ? { sideChat: persisted.sideChat } : {} });
  }
  /**
   * Recover the historical implicit default-chat SDK identity for a
   * session that predates the exact-chat catalog's persisted
   * `providerData`: before exact-chat backings existed, a session's
   * primary chat was simply the SDK conversation sharing the session's
   * own id (`AgentSession.id(session)`) — no separate blob was ever
   * written to decode. Uses only the host-supplied
   * `context.configurationResource` (never derives or recognizes a
   * default-chat shape from `chat` itself, per the exact-chat-only
   * restore contract) and records it as a plain, canonical exact backing.
   * From here on the recovered chat resolves, routes, truncates, and
   * releases exactly like every other chat.
   *
   * Performs no SDK I/O and reads no legacy metadata, so it is idempotent
   * (recomputes the same identity on every call, and keeps an
   * already-recorded backing) and non-destructive. Returns the canonical
   * opaque blob so the orchestrator can persist it additively going
   * forward.
   */
  async recoverLegacyChat(chat, context) {
    const { configurationResource, resource } = resolveAgentChatContext(context, chat);
    const chatKey = chat.toString();
    const backing = this._chatBackings.get(chatKey) ?? { sdkSessionId: AgentSession.id(configurationResource) };
    this._chatBackings.set(chatKey, backing);
    this._recordChatScope(chat, configurationResource, resource);
    return { providerData: encodeProviderData(_toPersistedChat(backing)) };
  }
  async _getChatMessages(chat, context) {
    return this._readChatMessages(this._resolveChatContext(chat, context));
  }
  // #endregion
  /**
   * Test-only accessor for the materialized {@link ClaudeAgentSession}, so
   * tests can inspect `_isResumed` directly. Marked `ForTesting` so the
   * production surface stays unaware of its existence; the protocol
   * surface (`IAgent`) does not include it.
   */
  getSessionForTesting(session) {
    const sess = this._findChatByUri(URI.parse(buildDefaultChatUri(session))) ?? this._findAnySession(AgentSession.id(session));
    return sess?.isPipelineReady ? sess : void 0;
  }
  async _readChatMessages(context) {
    if (!await this._sdkService.canLoadWithoutDownload()) {
      this._logService.info("[Claude] SDK not downloaded yet; deferring session messages until a session triggers the download");
      return [];
    }
    if (context.spawnedFrom) {
      return this._readSubagentMessages(context);
    }
    const sess = context.target;
    if (sess && !sess.isPipelineReady) {
      this._logService.info(`[Claude] getMessages: chat ${context.chatKey} is not materialized yet; returning no turns`);
      return [];
    }
    if (!context.sdkSessionId) {
      return [];
    }
    const turns = await this._reconstructTurns(context.sdkSessionId, context.chat, sess?.subagents);
    const sideChat = this._chatBackings.get(context.chatKey)?.sideChat;
    return sliceSideChatTurns(turns, sideChat);
  }
  /**
   * Reconstruct a provider-spawned subagent chat's transcript.
   *
   * A subagent has no backing of its own: its turns live inside the spawning
   * chat's SDK transcript, keyed by the tool call that delegated to it. Both
   * halves of that spawn edge come from the host-supplied origin
   * ({@link IResolvedClaudeChatContext.spawnedFrom}) — the provider neither
   * recovers them from shared host state nor re-derives them from URI shape.
   * Without an origin (or without the spawning chat's backing) there is
   * nothing to read, and the transcript is empty.
   */
  async _readSubagentMessages(context) {
    const spawnedFrom = context.spawnedFrom;
    if (!spawnedFrom) {
      return [];
    }
    const parentChat = spawnedFrom.chat;
    const parentSessionId = this._chatBackings.get(parentChat.toString())?.sdkSessionId;
    if (!parentSessionId) {
      return [];
    }
    const parentSession = this._findAnySession(parentSessionId);
    const store = new DisposableStore();
    const subagents = parentSession?.subagents ?? store.add(new SubagentRegistry());
    try {
      if (!parentSession) {
        await this._reconstructTurns(parentSessionId, parentChat, subagents);
      }
      return await getSubagentTranscript(context.chat, parentChat, parentSessionId, spawnedFrom.toolCallId, subagents, this._sdkService, this._logService, CancellationToken.None);
    } catch (err) {
      this._logService.warn(`[Claude] getSubagentTranscript threw for ${context.chatKey}`, err);
      return [];
    } finally {
      store.dispose();
    }
  }
  /**
   * Fetch a chat's SDK transcript ({@link sdkSessionId}) and map it to
   * protocol {@link Turn}s routed to {@link routingUri} (the session or chat
   * channel URI). When {@link subagents} is supplied, it is primed from the agentId suffixes the
   * SDK encoded in Task tool_result blocks. Resilient: any failure warn-logs
   * and returns `[]` rather than propagating.
   */
  async _reconstructTurns(sdkSessionId, routingUri, subagents) {
    let messages;
    try {
      messages = await this._sdkService.getSessionMessages(sdkSessionId, { includeSystemMessages: true });
    } catch (err) {
      this._logService.warn(`[Claude] getSessionMessages SDK fetch failed for ${sdkSessionId}`, err);
      return [];
    }
    let turns;
    try {
      turns = mapSessionMessagesToTurns(messages, routingUri, this._logService);
    } catch (err) {
      this._logService.warn(`[Claude] replay mapper threw for ${sdkSessionId}`, err);
      return [];
    }
    if (turns.length === 0 && messages.length > 0) {
      this._logService.warn(`[Claude] replay produced no turns from ${messages.length} transcript message(s) for ${sdkSessionId}; chat will render empty`);
    }
    try {
      subagents?.primeFromTranscript(turns);
    } catch (err) {
      this._logService.warn(`[Claude] primeFromTranscript threw for ${sdkSessionId}`, err);
    }
    return turns;
  }
  async _listClaudeCodeChats() {
    let sdkEntries;
    try {
      sdkEntries = await this._sdkService.listSessions();
    } catch (err) {
      this._logService.warn("[Claude] SDK listSessions failed; deferring chat discovery", err);
      return void 0;
    }
    return Promise.all(sdkEntries.map((entry) => {
      const session = AgentSession.uri(this.id, entry.sessionId);
      const chat = URI.parse(buildDefaultChatUri(session));
      return this._withPersistedWorkingDirectories(session, { chat, ...this._metadataStore.project(entry) });
    }));
  }
  async listChatsToMigrate() {
    try {
      await this._sdkService.ensureAvailableForDiscovery();
    } catch (err) {
      this._logService.warn("[Claude] SDK unavailable while listing chats to migrate", err);
      return void 0;
    }
    const chats = await this._listClaudeCodeChats();
    if (!chats) {
      return void 0;
    }
    const limiter = new Limiter(4);
    const known = await Promise.all(chats.map((chat) => limiter.queue(async () => {
      return await this._isKnownClaudeCodeChat(chat) ? chat : void 0;
    })));
    return known.filter((chat) => chat !== void 0);
  }
  _startClaudeCodeChatDiscovery() {
    if (!this._claudeCodeChatDiscovery) {
      this._claudeCodeChatDiscovery = retry(async () => {
        await this._sdkService.ensureAvailableForDiscovery();
        if (!await this._emitClaudeCodeChats()) {
          throw new Error("Claude chat catalog is not available");
        }
      }, 5e3, 3).catch((err) => this._logService.warn("[Claude] Chat discovery failed", err));
    }
    return this._claudeCodeChatDiscovery;
  }
  async _emitClaudeCodeChats() {
    try {
      const chats = await this._listClaudeCodeChats();
      if (chats) {
        const limiter = new Limiter(4);
        const unknown = await Promise.all(chats.map((chat) => limiter.queue(async () => {
          return await this._isKnownClaudeCodeChat(chat) ? void 0 : { ...chat, external: true };
        })));
        this._onDidDiscoverChats.fire(unknown.filter((chat) => chat !== void 0));
        return true;
      }
    } catch (err) {
      this._logService.warn("[Claude] Failed to emit discovered chats", err);
    }
    return false;
  }
  async _isKnownClaudeCodeChat(chat) {
    try {
      const session = URI.parse(parseRequiredSessionUriFromChatUri(chat.chat));
      return await this._metadataStore.hasKnownSession(session);
    } catch (err) {
      this._logService.warn(`[Claude] Failed to inspect stored metadata for ${chat.chat.toString()}`, err);
      return false;
    }
  }
  /**
   * Per-chat lookup. Accepts the external-CLI case: a session that exists
   * on disk via the raw Anthropic CLI has no per-session DB, so this MUST
   * NOT gate on the sidecar. The SDK is the source of truth for existence.
   *
   * The SDK entry supplies the authoritative primary directory; an optional
   * per-session overlay hydrates the additional-directory tail. External
   * sessions without an overlay remain valid single-root entries. Failures in
   * the SDK lookup propagate (the caller is doing a single targeted fetch and
   * should learn that the SDK module is broken).
   */
  async getChatMetadata(chat, context, providerData) {
    if (!await this._sdkService.canLoadWithoutDownload()) {
      this._logService.info("[Claude] SDK not downloaded yet; deferring chat metadata until a session triggers the download");
      return void 0;
    }
    const { configurationResource } = resolveAgentChatContext(context, chat);
    const sessionId = providerData ? decodeProviderData(providerData)?.sdkSessionId : AgentSession.id(configurationResource);
    if (!sessionId) {
      return void 0;
    }
    const sdkInfo = await this._sdkService.getSessionInfo(sessionId);
    if (!sdkInfo) {
      return void 0;
    }
    return this._withPersistedWorkingDirectories(configurationResource, { chat, ...this._metadataStore.project(sdkInfo) });
  }
  /**
   * Merge the persisted additional working directories (index 1..N) onto a
   * projected metadata's `workingDirectories`, keeping the SDK-derived `cwd`
   * as the authoritative primary. The SDK catalog only stores `cwd`, so the
   * tail of a multi-root session lives in the per-session overlay. Sessions
   * without an overlay (external Claude CLI, single-root) are returned as-is.
   */
  async _withPersistedWorkingDirectories(session, meta) {
    const primary = meta.workingDirectories?.[0];
    if (!primary) {
      return meta;
    }
    let overlay = {};
    try {
      overlay = await this._metadataStore.read(session);
    } catch (err) {
      this._logService.warn(`[Claude] overlay read failed while hydrating working directories for ${session.toString()}; using SDK cwd only`, err);
    }
    const tail = overlay.workingDirectories?.slice(1) ?? [];
    if (tail.length === 0) {
      return meta;
    }
    return { ...meta, workingDirectories: [primary, ...tail] };
  }
  resolveChatConfig(_params) {
    const sessionSchema = createSchema({
      [ClaudeSessionConfigKey.PermissionMode]: schemaProperty({
        type: "string",
        title: localize("claude.sessionConfig.permissionMode", "Approvals"),
        description: localize("claude.sessionConfig.permissionModeDescription", "How Claude handles tool approvals."),
        enum: ["default", "acceptEdits", "plan", "auto", "bypassPermissions"],
        enumLabels: [
          localize("claude.sessionConfig.permissionMode.default", "Ask Before Edits"),
          localize("claude.sessionConfig.permissionMode.acceptEdits", "Edit Automatically"),
          localize("claude.sessionConfig.permissionMode.plan", "Plan Mode"),
          localize("claude.sessionConfig.permissionMode.auto", "Auto Mode"),
          localize("claude.sessionConfig.permissionMode.bypassPermissions", "Bypass Permissions")
        ],
        enumDescriptions: [
          localize("claude.sessionConfig.permissionMode.defaultDescription", "Claude asks before editing files."),
          localize("claude.sessionConfig.permissionMode.acceptEditsDescription", "Claude edits files without asking, and asks before using other tools."),
          localize("claude.sessionConfig.permissionMode.planDescription", "Claude creates a plan before making changes."),
          localize("claude.sessionConfig.permissionMode.autoDescription", "Claude decides whether to ask for each tool operation."),
          localize("claude.sessionConfig.permissionMode.bypassPermissionsDescription", "Claude runs all tools without asking.")
        ],
        default: "default",
        sessionMutable: true
      }),
      [SessionConfigKey.Permissions]: platformSessionSchema.definition[SessionConfigKey.Permissions]
    });
    const values = sessionSchema.validateOrDefault(_params.config, {
      [ClaudeSessionConfigKey.PermissionMode]: "default"
      // Permissions intentionally omitted from defaults — leave
      // unset so auto-approval falls through to the host-level
      // default, materializing on the session only once the user
      // approves a tool "in this Session".
    });
    return Promise.resolve({
      schema: sessionSchema.toProtocol(),
      values
    });
  }
  getInheritedChatConfig(config) {
    const inherited = {};
    for (const key of [ClaudeSessionConfigKey.PermissionMode, SessionConfigKey.Permissions]) {
      if (config[key] !== void 0) {
        inherited[key] = config[key];
      }
    }
    return Object.keys(inherited).length > 0 ? inherited : void 0;
  }
  chatConfigCompletions(_params) {
    return Promise.resolve({ items: [] });
  }
  shutdown() {
    return this._shutdownPromise ??= (async () => {
      const sessions = this._allLiveSessions();
      for (const chat of sessions) {
        if (!chat.isPipelineReady) {
          chat.abortController.abort();
        }
      }
      await Promise.all(sessions.map(
        (chat) => this._disposeSequencer.queue(chat.sessionId, async () => {
          await this._disposeLiveSession(chat);
        })
      ));
      this._chatBackings.clear();
      this._activeClientHandles.clear();
    })();
  }
  async _sendMessage(chat, prompt, workingDirectories, attachments, turnId, _senderClientId, operationContext) {
    const effectiveTurnId = turnId ?? generateUuid();
    const sendContext = this._requireChatContext(chat, operationContext, "sendMessage");
    const clientTelemetryContext = URI.isUri(operationContext) ? void 0 : operationContext?.clientTelemetryContext;
    const context = this._resolveChatContext(chat, sendContext);
    return this._sessionSequencer.queue(context.sequencerKey, async () => {
      const current = this._resolveChatContext(chat, sendContext);
      const session = await this._ensureResolvedChatSession(current, workingDirectories);
      if (current.customizations) {
        session.setHostCustomizations(current.customizations);
      }
      const sideChat = this._chatBackings.get(current.chatKey)?.sideChat;
      const turns = sideChat ? await this._reconstructTurns(session.sessionId, current.chat, session.subagents) : [];
      const sdkPrompt = prepareSideChatPrompt(prompt, turns, sideChat);
      const switchTransport = session.hasPendingTransportSwitch ? this._ensureAuthenticated(session.provisionalModel) : void 0;
      await session.send(this._buildSdkPrompt(session.sessionId, sdkPrompt, attachments, effectiveTurnId), effectiveTurnId, current.configurationResource, workingDirectories, switchTransport, resolveAgentHostInstructions(operationContext), clientTelemetryContext);
      if (workingDirectories) {
        await this._metadataStore.write(current.resource, { workingDirectories });
      }
    });
  }
  /** Builds the SDK user message for a send, addressed to `sdkSessionId`. */
  _buildSdkPrompt(sdkSessionId, prompt, attachments, turnId) {
    const contentBlocks = resolvePromptToContentBlocks(prompt, attachments);
    return {
      type: "user",
      message: { role: "user", content: contentBlocks },
      session_id: sdkSessionId,
      parent_tool_use_id: null,
      // M1 / Glossary: `Turn.id ↔ SDKUserMessage.uuid`. The SDK types this
      // as a branded `${string}-…` template-literal alias of Node's
      // `crypto.UUID`; cast at the boundary rather than threading the brand
      // up to every caller.
      uuid: turnId
    };
  }
  respondToPermissionRequest(requestId, approved) {
    for (const sess of this._allLiveSessions()) {
      if (sess.respondToPermissionRequest(requestId, approved)) {
        return;
      }
    }
  }
  respondToUserInputRequest(requestId, response, answers) {
    for (const sess of this._allLiveSessions()) {
      if (sess.respondToUserInputRequest(requestId, response, answers)) {
        return;
      }
    }
  }
  /** Every live or direct-create provisional SDK conversation. */
  _allLiveSessions() {
    return [...this._chatEntriesBySdkId.values()].map((entry) => entry.chatSession);
  }
  async _abortSession(chat, context) {
    resolveAgentChatContext(context, chat);
    const sess = this._findChatByUri(chat);
    if (!sess) {
      return;
    }
    if (!sess.isPipelineReady) {
      sess.abortController.abort();
      return;
    }
    sess.abort();
  }
  setPendingMessages(chat, steeringMessage, _queuedMessages) {
    const target = this._findChatByUri(chat);
    this._logService.info(`[Claude] setPendingMessages for ${chat.toString()}: steering=${steeringMessage?.id ?? "none"} queued=${_queuedMessages.length}`);
    if (!target) {
      this._logService.warn(`[Claude] setPendingMessages: target not found for ${chat.toString()}`);
      return;
    }
    if (steeringMessage) {
      target.injectSteering(steeringMessage);
    }
  }
  async _changeModel(chat, model, operationContext) {
    const context = this._resolveChatContext(chat, operationContext);
    await this._sessionSequencer.queue(context.sequencerKey, async () => {
      const current = this._resolveChatContext(chat, operationContext);
      await this._metadataStore.write(current.resource, { model });
      const sess = current.target;
      if (sess) {
        await sess.setModel(model);
      }
      if (current.sdkSessionId !== current.sessionId) {
        await this._updateChatBackingModel(chat, model);
      }
    });
  }
  /**
   * Switch (or clear with `undefined`) the selected custom agent for an
   * existing session. Mirrors {@link changeModel}: session owns its
   * provisional/runtime branching and metadata write
   * (see {@link ClaudeAgentSession.setAgent}). For external-only
   * sessions (no in-memory record), the agent is persisted directly to
   * the overlay so a later resume picks it up. When `chat` is an additional
   * chat, the change targets that chat's own overlay.
   */
  async _changeAgent(chat, agent, operationContext) {
    const context = this._resolveChatContext(chat, operationContext);
    await this._sessionSequencer.queue(context.sequencerKey, async () => {
      const current = this._resolveChatContext(chat, operationContext);
      await this._metadataStore.write(current.resource, { agent: agent ?? null });
      const sess = current.target;
      if (sess) {
        await sess.setAgent(agent);
      }
    });
  }
  setServerToolHost(host) {
    this._serverToolHost = host;
  }
  /**
   * `chat` is the exact chat this client's contributions are addressed to.
   * There is no membership to fan out — a client contributing to several
   * chats of the same session gets one independent call (and handle) per
   * chat, so nothing here synthesizes, extends, or remembers a chat set of
   * its own.
   */
  getOrCreateActiveClient(chat, context, client, hostCustomizations) {
    const { configurationResource } = resolveAgentChatContext(context, chat);
    const key = `${chat.toString()}\0${client.clientId}`;
    let handle = this._activeClientHandles.get(key);
    if (!handle) {
      handle = new ClaudeActiveClientHandle(
        client.clientId,
        client.displayName,
        chat,
        (targetChat, tools) => {
          this._logService.info(`[Claude:${AgentSession.id(configurationResource)}] active client ${client.clientId} tools=[${tools.map((t) => t.name).join(", ") || "(none)"}] chat=${targetChat.toString()}`);
          this._findChatByUri(targetChat)?.setClientTools(client.clientId, tools);
        },
        (targetChat, customizations, snapshot) => {
          void this._syncClientCustomizations(targetChat, configurationResource, client.clientId, [...customizations], snapshot);
        }
      );
      this._activeClientHandles.set(key, handle);
    }
    handle.setHostCustomizations(hostCustomizations);
    return handle;
  }
  removeActiveClient(chat, _context, clientId) {
    const key = `${chat.toString()}\0${clientId}`;
    if (!this._activeClientHandles.delete(key)) {
      return;
    }
    const target = this._findChatByUri(chat);
    if (!target) {
      return;
    }
    target.removeClientTools(clientId);
    void this._sessionSequencer.queue(target.sessionId, async () => target.removeClientCustomizations(clientId)).catch(() => {
    });
  }
  /**
   * `chat` is the host-resolved routing target — already the ancestor chat
   * when the completion was addressed to a subagent. When its runtime is not
   * resident (a released ancestor, or a subagent whose spawning chat differs
   * from the routing target), the spawn edge on the addressed chat's
   * host-supplied origin names the conversation that owns the pending call.
   */
  onClientToolCallComplete(chat, toolCallId, result, context) {
    const addressed = this._findChatByUri(chat);
    if (addressed) {
      addressed.completeClientToolCall(toolCallId, result);
      return;
    }
    const spawnedFrom = resolveSubagentChatParent(context);
    if (!spawnedFrom) {
      return;
    }
    this._findChatByUri(spawnedFrom.chat)?.completeClientToolCall(toolCallId, result);
  }
  /**
   * `hostCustomizations` is the host's last published snapshot for the
   * chat's owning configuration scope, or `undefined` when it has published
   * none yet. The public entry point reuses whatever the host last handed to
   * this client's handle rather than reading it back from shared state.
   */
  async syncClientCustomizations(chat, context, clientId, customizations, options) {
    const { configurationResource } = resolveAgentChatContext(context, chat);
    const handle = this._activeClientHandles.get(`${chat.toString()}\0${clientId}`);
    return this._syncClientCustomizations(chat, configurationResource, clientId, customizations, handle?.hostCustomizations, options);
  }
  async _syncClientCustomizations(chat, configurationResource, clientId, customizations, hostCustomizations, options) {
    const sync = () => this._pluginManager.syncCustomizations(
      clientId,
      customizations,
      options?.quiet ? void 0 : (status) => this._fireCustomizationUpdated(configurationResource, { customization: status })
    );
    const target = this._findChatByUri(chat);
    if (target) {
      return this._sessionSequencer.queue(target.sessionId, async () => {
        const synced = await sync();
        if (hostCustomizations) {
          target.setHostCustomizations(hostCustomizations);
        }
        target.adoptClientCustomizations(clientId, synced, customizations);
        return synced;
      });
    }
    return sync();
  }
  /**
   * Project a per-item sync result onto a `SessionCustomizationUpdated`
   * action and emit it on {@link onDidChatProgress}. Lets the workbench
   * flip each row to `Loaded` / `Error` as the underlying
   * {@link IAgentPluginManager.syncCustomizations} resolves it.
   */
  _fireCustomizationUpdated(session, item) {
    this._onDidChatProgress.fire({
      kind: "action",
      resource: session,
      action: {
        type: ActionType.SessionCustomizationUpdated,
        customization: item.customization
      }
    });
  }
  getCustomizations() {
    return [];
  }
  /**
   * `hostCustomizations` is the host's last published snapshot for `chat`,
   * supplied explicitly at this boundary. `undefined` means the host has
   * published none yet, which is deliberately distinct from an empty list:
   * the session keeps its own reconciled view rather than clearing it.
   *
   * Resolves `chat` through its exact backing only ({@link _findChatByUri}) —
   * never falls back to guessing the SDK conversation id from the
   * configuration scope, since a fresh chat's SDK id is independent of it.
   */
  async getChatCustomizations(chat, _context, hostCustomizations) {
    const sess = this._findChatByUri(chat);
    if (!sess) {
      return [];
    }
    if (hostCustomizations) {
      sess.setHostCustomizations(hostCustomizations);
    }
    return sess.getSessionCustomizations();
  }
  async startMcpServer(session, id) {
    const sess = this._findAnySession(AgentSession.id(session));
    await sess?.startMcpServer(id);
  }
  async stopMcpServer(session, id) {
    const sess = this._findAnySession(AgentSession.id(session));
    await sess?.stopMcpServer(id);
  }
  // #endregion
  dispose() {
    for (const chat of this._allLiveSessions()) {
      chat.abortController.abort();
    }
    super.dispose();
    this._proxyHandle?.dispose();
    this._proxyHandle = void 0;
    this._githubToken = void 0;
    this._models.set([], void 0);
  }
};
ClaudeAgent = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, ICopilotApiService),
  __decorateParam(2, IClaudeProxyService),
  __decorateParam(3, IClaudeAgentSdkService),
  __decorateParam(4, IAgentHostSessionTitleSignal),
  __decorateParam(5, IAgentHostOTelService),
  __decorateParam(6, IAgentHostGitService),
  __decorateParam(7, IAgentHostCheckpointService),
  __decorateParam(8, IAgentConfigurationService),
  __decorateParam(9, IAgentHostGitHubEndpointService),
  __decorateParam(10, IInstantiationService),
  __decorateParam(11, IAgentPluginManager),
  __decorateParam(12, IProductService),
  __decorateParam(13, INativeEnvironmentService)
], ClaudeAgent);
class ClaudeChatEntry extends Disposable {
  constructor(chatSession) {
    super();
    this.chatSession = chatSession;
    this._register(chatSession);
  }
  addDisposable(disposable) {
    this._register(disposable);
  }
}
export {
  ClaudeAgent,
  fromSdkModelInfo
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjbGF1ZGVcXGNsYXVkZUFnZW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBDQ0FNb2RlbCB9IGZyb20gJ0B2c2NvZGUvY29waWxvdC1hcGknO1xuaW1wb3J0IHR5cGUgeyBNb2RlbEluZm8sIE9uRWxpY2l0YXRpb24sIE9wdGlvbnMsIFNES1Nlc3Npb25JbmZvLCBTREtVc2VyTWVzc2FnZSB9IGZyb20gJ0BhbnRocm9waWMtYWkvY2xhdWRlLWFnZW50LXNkayc7XG5pbXBvcnQgdHlwZSB7IENhbGxUb29sUmVzdWx0IH0gZnJvbSAnQG1vZGVsY29udGV4dHByb3RvY29sL3Nkay90eXBlcy5qcyc7XG5pbXBvcnQgeyBMaW1pdGVyLCByZXRyeSwgU2VxdWVuY2VyQnlLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luTWFuYWdlciwgSVN5bmNlZEN1c3RvbWl6YXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRQbHVnaW5NYW5hZ2VyLmpzJztcbmltcG9ydCB7IGRlY29kZVByb3ZpZGVyRGF0YSwgZW5jb2RlUHJvdmlkZXJEYXRhLCB0eXBlIElQZXJzaXN0ZWRDaGF0IH0gZnJvbSAnLi4vYWdlbnRDaGF0QmFja2luZ3MuanMnO1xuaW1wb3J0IHsgYnVpbGRTaWRlQ2hhdFNvdXJjZUNvbnRleHQsIHByZXBhcmVTaWRlQ2hhdFByb21wdCwgc2xpY2VTaWRlQ2hhdFR1cm5zIH0gZnJvbSAnLi4vYWdlbnRQZWVyQ2hhdHMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q29uZmlnS2V5LCBhZ2VudEhvc3RDdXN0b21pemF0aW9uQ29uZmlnU2NoZW1hIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdEN1c3RvbWl6YXRpb25Db25maWcuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2xhdWRlTXVsdGlSb290RW5hYmxlZENvbmZpZ0tleSwgY3JlYXRlU2NoZW1hLCBwbGF0Zm9ybVJvb3RTY2hlbWEsIHBsYXRmb3JtU2Vzc2lvblNjaGVtYSwgc2NoZW1hUHJvcGVydHkgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcbmltcG9ydCB7IENsYXVkZVBlcm1pc3Npb25Nb2RlLCBDbGF1ZGVTZXNzaW9uQ29uZmlnS2V5LCBuYXJyb3dDbGF1ZGVQZXJtaXNzaW9uTW9kZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jbGF1ZGVTZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDbGF1ZGVUaGlua2luZ0xldmVsU2NoZW1hLCBpc0NsYXVkZUVmZm9ydExldmVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NsYXVkZU1vZGVsQ29uZmlnLmpzJztcbmltcG9ydCB7IFNlc3Npb25Db25maWdLZXkgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkNvbmZpZ0tleXMuanMnO1xuaW1wb3J0IHsgQWdlbnRQcm92aWRlciwgQWdlbnRTZXNzaW9uLCBBZ2VudFNpZ25hbCwgQ0xBVURFX0FHRU5UX1BST1ZJREVSX0lELCBJQWN0aXZlQ2xpZW50LCBJQWdlbnQsIElBZ2VudENoYXRDb250ZXh0LCBJQWdlbnRDaGF0RGF0YUNoYW5nZSwgSUFnZW50Q2hhdE1ldGFkYXRhLCBJQWdlbnRDaGF0cywgSUFnZW50Q2hhdENvbmZpZ0NvbXBsZXRpb25zUGFyYW1zLCBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucywgSUFnZW50Q3JlYXRlQ2hhdFJlc3VsdCwgSUFnZW50RGVzY3JpcHRvciwgSUFnZW50RGlzY292ZXJlZENoYXQsIElBZ2VudE1hdGVyaWFsaXplQ2hhdEV2ZW50LCBJQWdlbnRNb2RlbEluZm8sIElBZ2VudFJlc29sdmVDaGF0Q29uZmlnUGFyYW1zLCBJQWdlbnRTZXNzaW9uUHJvamVjdEluZm8sIElBZ2VudFNwYXduQ2hhdEV2ZW50LCBJQWdlbnRTcGF3bmVkQ2hhdFBhcmVudCwgU3ViYWdlbnRDaGF0U2lnbmFsLCByZXNvbHZlQWdlbnRDaGF0Q29udGV4dCwgcmVzb2x2ZUFnZW50SG9zdEN1c3RvbWl6YXRpb25zLCByZXNvbHZlQWdlbnRIb3N0SW5zdHJ1Y3Rpb25zLCByZXNvbHZlU3ViYWdlbnRDaGF0UGFyZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB7IGVuc3VyZVdvcmtzcGFjZWxlc3NTY3JhdGNoRGlyIH0gZnJvbSAnLi4vd29ya3NwYWNlbGVzc1NjcmF0Y2hEaXIuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0LCBTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNSZXN1bHQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQUhQX0FVVEhfUkVRVUlSRUQsIFByb3RvY29sRXJyb3IgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJztcbmltcG9ydCB7IFBvbGljeVN0YXRlLCBQcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhLCB0eXBlIEFnZW50U2VsZWN0aW9uLCB0eXBlIE1vZGVsU2VsZWN0aW9uLCB0eXBlIFRvb2xEZWZpbml0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IGJ1aWxkRGVmYXVsdENoYXRVcmksIENoYXRJbnB1dFJlc3BvbnNlS2luZCwgaXNEZWZhdWx0Q2hhdFVyaSwgcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaSwgdHlwZSBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uLCB0eXBlIEN1c3RvbWl6YXRpb24sIHR5cGUgTWVzc2FnZUF0dGFjaG1lbnQsIHR5cGUgUGVuZGluZ01lc3NhZ2UsIHR5cGUgQ2hhdElucHV0QW5zd2VyLCB0eXBlIFRvb2xDYWxsUmVzdWx0LCB0eXBlIFR1cm4gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlIH0gZnJvbSAnLi4vYWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RHaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdEdpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFBlbmRpbmdSZXF1ZXN0UmVnaXN0cnkgfSBmcm9tICcuLi8uLi9jb21tb24vcGVuZGluZ1JlcXVlc3RSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBwcm9qZWN0RnJvbUNvcGlsb3RDb250ZXh0IH0gZnJvbSAnLi4vY29waWxvdC9jb3BpbG90R2l0UHJvamVjdC5qcyc7XG5pbXBvcnQgeyBJQ29waWxvdEFwaVNlcnZpY2UgfSBmcm9tICcuLi9zaGFyZWQvY29waWxvdEFwaVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNsYXVkZUFnZW50U2RrU2VydmljZSB9IGZyb20gJy4vY2xhdWRlQWdlbnRTZGtTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGJ1aWxkTW9kZWxFbnVtZXJhdGlvbk9wdGlvbnMgfSBmcm9tICcuL2NsYXVkZVNka09wdGlvbnMuanMnO1xuaW1wb3J0IHsgZGV0ZWN0RXhpc3RpbmdDbGF1ZGVTZXR1cCwgcmVzb2x2ZUNsYXVkZVRyYW5zcG9ydE1vZGUsIHR5cGUgQ2xhdWRlVHJhbnNwb3J0TW9kZSB9IGZyb20gJy4vY2xhdWRlVHJhbnNwb3J0TW9kZS5qcyc7XG5pbXBvcnQgeyBtZXJnZUNsYXVkZU1vZGVsQ2F0YWxvZ3MsIHJlc29sdmVDbGF1ZGVTZXNzaW9uVHJhbnNwb3J0IH0gZnJvbSAnLi9jbGF1ZGVNb2RlbFNlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBtYXBTZXNzaW9uTWVzc2FnZXNUb1R1cm5zLCByZXNvbHZlRm9ya0FuY2hvclV1aWQgfSBmcm9tICcuL2NsYXVkZVJlcGxheU1hcHBlci5qcyc7XG5pbXBvcnQgeyBnZXRTdWJhZ2VudFRyYW5zY3JpcHQgfSBmcm9tICcuL2NsYXVkZVN1YmFnZW50UmVzb2x2ZXIuanMnO1xuaW1wb3J0IHsgU3ViYWdlbnRSZWdpc3RyeSB9IGZyb20gJy4vY2xhdWRlU3ViYWdlbnRSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDbGF1ZGVBZ2VudFNlc3Npb24gfSBmcm9tICcuL2NsYXVkZUFnZW50U2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBoYW5kbGVDYW5Vc2VUb29sIH0gZnJvbSAnLi9jbGF1ZGVDYW5Vc2VUb29sLmpzJztcbmltcG9ydCB7IGhhbmRsZUVsaWNpdGF0aW9uIH0gZnJvbSAnLi9jbGF1ZGVFbGljaXRhdGlvbkJyaWRnZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudFNlcnZlclRvb2xIb3N0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50U2VydmVyVG9vbHMuanMnO1xuaW1wb3J0IHsgY3JlYXRlUHJpY2luZ01ldGFGcm9tQmlsbGluZywgbm9ybWFsaXplQ0FQSUJpbGxpbmcgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRNb2RlbFByaWNpbmcuanMnO1xuaW1wb3J0IHsgdHJ5UGFyc2VDbGF1ZGVNb2RlbElkIH0gZnJvbSAnLi9jbGF1ZGVNb2RlbElkLmpzJztcbmltcG9ydCB7IHJlc29sdmVQcm9tcHRUb0NvbnRlbnRCbG9ja3MgfSBmcm9tICcuL2NsYXVkZVByb21wdFJlc29sdmVyLmpzJztcbmltcG9ydCB7IElDbGF1ZGVQcm94eUhhbmRsZSwgSUNsYXVkZVByb3h5U2VydmljZSwgdHlwZSBDbGF1ZGVUcmFuc3BvcnQgfSBmcm9tICcuL2NsYXVkZVByb3h5U2VydmljZS5qcyc7XG5pbXBvcnQgeyByZWFkQ2xhdWRlUGVybWlzc2lvbk1vZGUgfSBmcm9tICcuL2NsYXVkZVNlc3Npb25QZXJtaXNzaW9uTW9kZS5qcyc7XG5pbXBvcnQgeyBDbGF1ZGVTZXNzaW9uTWV0YWRhdGFTdG9yZSwgSUNsYXVkZVNlc3Npb25PdmVybGF5IH0gZnJvbSAnLi9jbGF1ZGVTZXNzaW9uTWV0YWRhdGFTdG9yZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2Vzc2lvblRpdGxlU2lnbmFsIH0gZnJvbSAnLi4vYWdlbnRIb3N0U2Vzc2lvblRpdGxlU2lnbmFsLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RPVGVsU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9vdGVsL2FnZW50SG9zdE9UZWxTZXJ2aWNlLmpzJztcblxuY29uc3QgVVNFUl9BR0VOVF9QUkVGSVggPSAndnNjb2RlX2NsYXVkZV9jb2RlJztcblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgYG1gIGlzIGEgQ2xhdWRlLWZhbWlseSBtb2RlbCB0aGF0IHNob3VsZCBiZSBhZHZlcnRpc2VkXG4gKiB0byBjbGllbnRzIHBpY2tpbmcgYSBtb2RlbCBmb3IgdGhlIENsYXVkZSBwcm92aWRlci5cbiAqXG4gKiBDb21iaW5lcyB0aGUgc2FtZSBzdXJmYWNlIGNoZWNrcyB0aGUgZXh0ZW5zaW9uIHVzZXMgKHZlbmRvciwgcGlja2VyXG4gKiBlbGlnaWJpbGl0eSwgdG9vbC1jYWxsIHN1cHBvcnQsIGAvdjEvbWVzc2FnZXNgIGVuZHBvaW50KSB3aXRoIGEgcGFyc2VcbiAqIG9mIHRoZSBtb2RlbCBpZCB2aWEge0BsaW5rIHRyeVBhcnNlQ2xhdWRlTW9kZWxJZH0sIHdoaWNoIGV4Y2x1ZGVzXG4gKiBzeW50aGV0aWMgaWRzIGxpa2UgYGF1dG9gIHRoYXQgYXJlbid0IHJlYWwgQ2xhdWRlIGVuZHBvaW50cy5cbiAqL1xuZnVuY3Rpb24gaXNDbGF1ZGVNb2RlbChtOiBDQ0FNb2RlbCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gKFxuXHRcdG0udmVuZG9yID09PSAnQW50aHJvcGljJyAmJlxuXHRcdCEhbS5zdXBwb3J0ZWRfZW5kcG9pbnRzPy5pbmNsdWRlcygnL3YxL21lc3NhZ2VzJykgJiZcblx0XHQhIW0ubW9kZWxfcGlja2VyX2VuYWJsZWQgJiZcblx0XHQhIW0uY2FwYWJpbGl0aWVzPy5zdXBwb3J0cz8udG9vbF9jYWxscyAmJlxuXHRcdHRyeVBhcnNlQ2xhdWRlTW9kZWxJZChtLmlkKSAhPT0gdW5kZWZpbmVkXG5cdCk7XG59XG4vKipcbiAqIEF1Z21lbnRzIHRoZSBwdWJsaXNoZWQgYEB2c2NvZGUvY29waWxvdC1hcGlgIGBDQ0FNb2RlbFN1cHBvcnRzYCB3aXRoIHRoZVxuICogcGVyLW1vZGVsIGBhZGFwdGl2ZV90aGlua2luZ2AgLyBgcmVhc29uaW5nX2VmZm9ydGAgZmllbGRzIHRoZSBydW50aW1lXG4gKiBDQVBJIGAvbW9kZWxzYCBwYXlsb2FkIGFscmVhZHkgY2FycmllcyBidXQgdGhlIFNESyB0eXBlIGRvZXNuJ3QgeWV0XG4gKiBkZWNsYXJlLiBUcmFja2VkIGF0IG1pY3Jvc29mdC92c2NvZGUtY2FwaSM4NTsgcmVtb3ZlIHRoaXMgd2hlbiB0aGUgU0RLXG4gKiBjYXRjaGVzIHVwLiBNaXJyb3Igb2YgdGhlIHNhbWUgcGF0dGVybiBhdFxuICogYGV4dGVuc2lvbnMvY29waWxvdC9zcmMvcGxhdGZvcm0vZW5kcG9pbnQvY29tbW9uL2VuZHBvaW50UHJvdmlkZXIudHNgXG4gKiAoaXRzIGxvY2FsbHktZGVjbGFyZWQgYElDaGF0TW9kZWxDYXBhYmlsaXRpZXNgKS5cbiAqL1xuaW50ZXJmYWNlIElDbGF1ZGVNb2RlbFN1cHBvcnRzIHtcblx0cmVhZG9ubHkgYWRhcHRpdmVfdGhpbmtpbmc/OiBib29sZWFuO1xuXHRyZWFkb25seSByZWFzb25pbmdfZWZmb3J0PzogcmVhZG9ubHkgc3RyaW5nW107XG59XG5cbi8qKlxuICogUHJvamVjdCBhIHtAbGluayBDQ0FNb2RlbH0gaW50byB0aGUgYWdlbnQgaG9zdCdzXG4gKiB7QGxpbmsgSUFnZW50TW9kZWxJbmZvfSBzdXJmYWNlLiBUaGUgcmV0dXJuZWQgYHByb3ZpZGVyYCBkZWZhdWx0cyB0byB0aGVcbiAqIGFnZW50J3MgaWQgKGAnY2xhdWRlJ2ApLCBOT1QgdGhlIHVwc3RyZWFtIGB2ZW5kb3I6ICdBbnRocm9waWMnYCBmaWVsZCBcdTIwMTQgdGhlXG4gKiBjaGF0IG1vZGVsIHBpY2tlciAqZ3JvdXBzKiAoZG9lcyBub3QgZmlsdGVyKSB0aGUgbW9kZWwgbGlzdCBieSBgcHJvdmlkZXJgLCBzb1xuICogYSBzaW5nbGUsIHVuLW1lcmdlZCBjYXRhbG9nIGJ1Y2tldHMgdW5kZXIgdGhlIGhhcm5lc3MuIFdoZW4gcGVyLXNlc3Npb25cbiAqIHByb3ZpZGVyIHNlbGVjdGlvbiBpcyBvbiwge0BsaW5rIG1lcmdlQ2xhdWRlTW9kZWxDYXRhbG9nc30gcmUtc3RhbXBzIGVhY2ggbW9kZWxcbiAqIHdpdGggaXRzIHRyYW5zcG9ydCBwcm92aWRlciAoYGNvcGlsb3RgL2BhbnRocm9waWNgKSB0byBzcGxpdCB0aGUgcGlja2VyIGludG8gYVxuICogQ29waWxvdCBncm91cCBhbmQgYW4gQW50aHJvcGljIGdyb3VwLlxuICovXG5mdW5jdGlvbiB0b0FnZW50TW9kZWxJbmZvKG06IENDQU1vZGVsLCBwcm92aWRlcjogQWdlbnRQcm92aWRlcik6IElBZ2VudE1vZGVsSW5mbyB7XG5cdGNvbnN0IHN1cHBvcnRzID0gbS5jYXBhYmlsaXRpZXM/LnN1cHBvcnRzO1xuXHRjb25zdCBzdXBwb3J0ZWRFZmZvcnRzID0gKChzdXBwb3J0cyBhcyBJQ2xhdWRlTW9kZWxTdXBwb3J0cyB8IHVuZGVmaW5lZCk/LnJlYXNvbmluZ19lZmZvcnQgPz8gW10pLmZpbHRlcihpc0NsYXVkZUVmZm9ydExldmVsKTtcblx0Y29uc3QgY29uZmlnU2NoZW1hID0gY3JlYXRlQ2xhdWRlVGhpbmtpbmdMZXZlbFNjaGVtYShzdXBwb3J0ZWRFZmZvcnRzKTtcblx0Y29uc3QgcG9saWN5U3RhdGUgPSBtLnBvbGljeT8uc3RhdGUgYXMgUG9saWN5U3RhdGUgfCB1bmRlZmluZWQ7XG5cdGNvbnN0IGJpbGxpbmcgPSBub3JtYWxpemVDQVBJQmlsbGluZyhtLmJpbGxpbmcpO1xuXHQvLyBwcmljZUNhdGVnb3J5IG1heSBhcHBlYXIgYXMgYSB0b3AtbGV2ZWwgbW9kZWwgZmllbGQgZGVwZW5kaW5nIG9uIHRoZSBDQVBJIHZlcnNpb24uXG5cdGNvbnN0IHByaWNlQ2F0ZWdvcnkgPSB0eXBlb2YgbS5tb2RlbF9waWNrZXJfcHJpY2VfY2F0ZWdvcnkgPT09ICdzdHJpbmcnXG5cdFx0PyBtLm1vZGVsX3BpY2tlcl9wcmljZV9jYXRlZ29yeVxuXHRcdDogdW5kZWZpbmVkO1xuXHRyZXR1cm4ge1xuXHRcdHByb3ZpZGVyLFxuXHRcdC8vIENBUEkvZW5kcG9pbnQgZm9ybWF0LCBkb3R0ZWQgdmVyc2lvbiAoZS5nLiBgY2xhdWRlLWhhaWt1LTQuNWApIFx1MjAxNCB0aGVcblx0XHQvLyBjYW5vbmljYWwgaWQgdGhyb3VnaCBgTW9kZWxTZWxlY3Rpb24uaWRgLiBDb252ZXJ0IHRvIFNESyBmb3JtYXQgYXQgU0RLXG5cdFx0Ly8gc2VhbXMgdmlhIGB0b1Nka01vZGVsSWRgLlxuXHRcdGlkOiBtLmlkLFxuXHRcdG5hbWU6IG0ubmFtZSxcblx0XHRtYXhDb250ZXh0V2luZG93OiBtLmNhcGFiaWxpdGllcz8ubGltaXRzPy5tYXhfY29udGV4dF93aW5kb3dfdG9rZW5zLFxuXHRcdG1heE91dHB1dFRva2VuczogbS5jYXBhYmlsaXRpZXM/LmxpbWl0cz8ubWF4X291dHB1dF90b2tlbnMsXG5cdFx0bWF4UHJvbXB0VG9rZW5zOiBtLmNhcGFiaWxpdGllcz8ubGltaXRzPy5tYXhfcHJvbXB0X3Rva2Vucyxcblx0XHRzdXBwb3J0c1Zpc2lvbjogISFzdXBwb3J0cz8udmlzaW9uLFxuXHRcdC4uLihjb25maWdTY2hlbWEgPyB7IGNvbmZpZ1NjaGVtYSB9IDoge30pLFxuXHRcdC4uLihwb2xpY3lTdGF0ZSA/IHsgcG9saWN5U3RhdGUgfSA6IHt9KSxcblx0XHRfbWV0YTogY3JlYXRlUHJpY2luZ01ldGFGcm9tQmlsbGluZyhiaWxsaW5nLCBwcmljZUNhdGVnb3J5KSxcblx0fTtcbn1cblxuLyoqXG4gKiBUaGUgU0RLJ3Mgc3ludGhldGljIFwidXNlIHdoYXRldmVyIHRoZSBDTEkgaXMgY29uZmlndXJlZCB0byB1c2VcIiByb3c6XG4gKiBgc3VwcG9ydGVkTW9kZWxzKClgIHByb2plY3RzIHRoZSBDTEkncyBgbnVsbGAtdmFsdWVkIGRlZmF1bHQgb3B0aW9uIHRvXG4gKiBgdmFsdWU6ICdkZWZhdWx0J2AsIGRpc3BsYXllZCBhcyBcIkRlZmF1bHQgKHJlY29tbWVuZGVkKVwiLlxuICovXG5jb25zdCBTREtfREVGQVVMVF9NT0RFTF9WQUxVRSA9ICdkZWZhdWx0JztcblxuLyoqXG4gKiBXaGV0aGVyIGBtYCBpcyB0aGUgU0RLJ3Mge0BsaW5rIFNES19ERUZBVUxUX01PREVMX1ZBTFVFfSBhbGlhcyByYXRoZXIgdGhhbiBhXG4gKiByZWFsIG1vZGVsLiBUaGUgYWxpYXMgcmVzb2x2ZXMgdG8gYSBjb25jcmV0ZSBtb2RlbCAoYE1vZGVsSW5mby5yZXNvbHZlZE1vZGVsYClcbiAqIHRoYXQgdGhlIGNhdGFsb2cgYWxyZWFkeSBvZmZlcnMgYXMgaXRzIG93biByb3csIHNvIGl0IGFkZHMgbm8gcmVhY2hhYmxlXG4gKiBjYXBhYmlsaXR5IFx1MjAxNCBhbmQgbmV4dCB0byB0aGUgQ29waWxvdC1yb3V0ZWQgbW9kZWxzIGl0IHJlYWRzIGFzIGEgdGhpcmQsXG4gKiB1bnJlbGF0ZWQgY2hvaWNlIHdob3NlIHRhcmdldCBpcyBpbnZpc2libGUsIHdoaWNoIGlzIHdoeSBpdCBpcyBkcm9wcGVkIGZyb21cbiAqIHRoZSBwdWJsaXNoZWQgY2F0YWxvZyAobWljcm9zb2Z0L3ZzY29kZSMzMjk5ODMpLlxuICovXG5mdW5jdGlvbiBpc1Nka0RlZmF1bHRNb2RlbChtOiBNb2RlbEluZm8pOiBib29sZWFuIHtcblx0cmV0dXJuIG0udmFsdWUgPT09IFNES19ERUZBVUxUX01PREVMX1ZBTFVFO1xufVxuXG4vKipcbiAqIFByb2plY3QgYW4gU0RLIHtAbGluayBNb2RlbEluZm99IGludG8gdGhlIGFnZW50IGhvc3Qnc1xuICoge0BsaW5rIElBZ2VudE1vZGVsSW5mb30gc3VyZmFjZSBmb3IgdGhlIG5hdGl2ZSAoQllPLUFudGhyb3BpYykgdHJhbnNwb3J0LlxuICogQ2FycmllcyBOTyBjb21tZXJjaWFsIG1ldGFkYXRhIChubyBgcG9saWN5U3RhdGVgLCBubyBwcmljaW5nIGBfbWV0YWApIFx1MjAxNFxuICogdGhvc2UgYXJlIENvcGlsb3QvQ0FQSSBjb25jZXB0cy4gUmV1c2VzIHRoZSBzaGFyZWQgZWZmb3J0LXNjaGVtYSBoZWxwZXJzIHNvXG4gKiB0aGUgdGhpbmtpbmctbGV2ZWwgcGlja2VyIG1hdGNoZXMgdGhlIHByb3hpZWQgcHJvamVjdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZyb21TZGtNb2RlbEluZm8obTogTW9kZWxJbmZvLCBwcm92aWRlcjogQWdlbnRQcm92aWRlcik6IElBZ2VudE1vZGVsSW5mbyB7XG5cdGNvbnN0IHN1cHBvcnRlZEVmZm9ydHMgPSAobS5zdXBwb3J0ZWRFZmZvcnRMZXZlbHMgPz8gW10pLmZpbHRlcihpc0NsYXVkZUVmZm9ydExldmVsKTtcblx0Y29uc3QgY29uZmlnU2NoZW1hID0gY3JlYXRlQ2xhdWRlVGhpbmtpbmdMZXZlbFNjaGVtYShzdXBwb3J0ZWRFZmZvcnRzKTtcblx0cmV0dXJuIHtcblx0XHRwcm92aWRlcixcblx0XHQvLyBTREstY2Fub25pY2FsIGlkIChgbS52YWx1ZWAsIGUuZy4gYGNsYXVkZS1zb25uZXQtNC01LTIwMjUwOTI5YCkuIE5hdGl2ZVxuXHRcdC8vIGlkcyBhcmUgU0RLIGZvcm1hdCBlbmQgdG8gZW5kOyBgdG9TZGtNb2RlbElkYCBpcyBpZGVudGl0eSBhdCB0aGlzIHNlYW0uXG5cdFx0aWQ6IG0udmFsdWUsXG5cdFx0bmFtZTogbS5kaXNwbGF5TmFtZSxcblx0XHRzdXBwb3J0c1Zpc2lvbjogZmFsc2UsXG5cdFx0Li4uKGNvbmZpZ1NjaGVtYSA/IHsgY29uZmlnU2NoZW1hIH0gOiB7fSksXG5cdH07XG59XG5cbi8vIE5hcnJvd2luZyBhbiBhcmJpdHJhcnkgcnVudGltZSB2YWx1ZSB0byB0aGUgY2xvc2VkIGBDbGF1ZGVQZXJtaXNzaW9uTW9kZWBcbi8vIHVuaW9uIGxpdmVzIGluIGAuLi8uLi9jb21tb24vY2xhdWRlU2Vzc2lvbkNvbmZpZ0tleXMudHNgIHNvIGl0IGlzIHNoYXJlZCBieVxuLy8gYENsYXVkZUFnZW50YCwgYENsYXVkZVNlc3Npb25NZXRhZGF0YVN0b3JlYCwgYW5kIG90aGVyIGNvbnN1bWVycy4gVGhlIGxpdmVcbi8vIHBlci1zZXNzaW9uIHJlYWQgaGVscGVyIGxpdmVzIGluIGAuL2NsYXVkZVNlc3Npb25QZXJtaXNzaW9uTW9kZS50c2Agc28gdGhlXG4vLyBzZXNzaW9uIGFuZCBtYXRlcmlhbGl6ZXIgY2FuIHJlYWQgZGlyZWN0bHkgd2l0aG91dCB0aHJlYWRpbmcgY2FsbGJhY2tzXG4vLyB0aHJvdWdoIHRoZSBhZ2VudC5cblxuLy8gUHJvdmlzaW9uYWwgc2Vzc2lvbiBzdGF0ZSBpcyBob3N0ZWQgZGlyZWN0bHkgb24ge0BsaW5rIENsYXVkZUFnZW50U2Vzc2lvbn1cbi8vIChwcmUtbWF0ZXJpYWxpemUgZmllbGRzOiBwcm9qZWN0LCBhYm9ydENvbnRyb2xsZXIsIHByb3Zpc2lvbmFsTW9kZWwsXG4vLyBwcm92aXNpb25hbENvbmZpZykuXG5cbi8qKlxuICogUHJvdmlkZXItb3duZWQgZGF0YSB0aGF0IGlkZW50aWZpZXMgb25lIENsYXVkZSBTREsgY29udmVyc2F0aW9uLlxuICogSXQgZGVsaWJlcmF0ZWx5IGNvbnRhaW5zIG5vIEFnZW50IEhvc3QgbWVtYmVyc2hpcCBvciBwZXJzaXN0ZW5jZSBzY29wZS5cbiAqL1xuaW50ZXJmYWNlIElDbGF1ZGVDaGF0QmFja2luZyB7XG5cdC8qKiBUaGUgU0RLIGNvbnZlcnNhdGlvbiB0aGlzIGNoYXQgYWRkcmVzc2VzLiAqL1xuXHRyZWFkb25seSBzZGtTZXNzaW9uSWQ6IHN0cmluZztcblx0LyoqIE1vZGVsIG92ZXJyaWRlIHJlY29yZGVkIGF0IGNyZWF0aW9uIG9yIGJ5IGEgbGF0ZXIge0BsaW5rIElBZ2VudENoYXRzLmNoYW5nZU1vZGVsfS4gKi9cblx0cmVhZG9ubHkgbW9kZWw/OiBNb2RlbFNlbGVjdGlvbjtcblx0cmVhZG9ubHkgc2lkZUNoYXQ/OiBJUGVyc2lzdGVkQ2hhdFsnc2lkZUNoYXQnXTtcbn1cblxuLyoqXG4gKiBBIGNoYXQncyBleGFjdCBjb25maWd1cmF0aW9uL3BlcnNpc3RlbmNlLXJlc291cmNlIHBhaXIsIHJlY29yZGVkIHNvIGEgbGF0ZXJcbiAqIGZvcmsgb3Igc2lkZS1jaGF0IG5hbWluZyB0aGlzIGNoYXQgYXMgaXRzIHNvdXJjZSBjYW4gcmVzb2x2ZSBib3RoIHdpdGhvdXRcbiAqIGRlcml2aW5nIGVpdGhlciBmcm9tIFVSSSBzaGFwZSBvciBmcm9tIHRoZSBkZXN0aW5hdGlvbidzIG93biBjb250ZXh0LlxuICovXG5pbnRlcmZhY2UgSUNoYXRTY29wZUJpbmRpbmcge1xuXHQvKiogVGhlIHNoYXJlZCwgc2Vzc2lvbi13aWRlIGNvbmZpZ3VyYXRpb24gc2NvcGUgKGBJQWdlbnRDaGF0Q29udGV4dC5jb25maWd1cmF0aW9uUmVzb3VyY2VgKS4gKi9cblx0cmVhZG9ubHkgY29uZmlndXJhdGlvblJlc291cmNlOiBVUkk7XG5cdC8qKiBUaGlzIGV4YWN0IGNoYXQncyBvd24gcGVyc2lzdGVuY2UgcmVzb3VyY2UgKGBJQWdlbnRDaGF0Q29udGV4dC5yZXNvdXJjZWApIFx1MjAxNCB0aGUga2V5IGl0cyBvdmVybGF5IGlzIHdyaXR0ZW4gdW5kZXIuICovXG5cdHJlYWRvbmx5IHJlc291cmNlOiBVUkk7XG59XG5cbi8qKlxuICogT25lIGhvc3QtYWRkcmVzc2VkIGNoYXQgb3BlcmF0aW9uLCByZXNvbHZlZCBhZ2FpbnN0IHRoZSBwcm92aWRlcidzIGV4YWN0XG4gKiBjaGF0IGJhY2tpbmcuXG4gKlxuICogRXZlcnkgZmllbGQgZXhjZXB0IHtAbGluayB0YXJnZXR9IC8ge0BsaW5rIHNka1Nlc3Npb25JZH0gaXMgYSBob3N0IGZhY3QgdGFrZW5cbiAqIHZlcmJhdGltIGZyb20gdGhlIG9wZXJhdGlvbidzIHtAbGluayBJQWdlbnRDaGF0Q29udGV4dH06IHRoZSBwcm92aWRlciBkZXJpdmVzXG4gKiBub3RoaW5nIGhlcmUgZnJvbSBVUkkgc2hhcGUgYW5kIHJlYWRzIG5vdGhpbmcgYmFjayBmcm9tIHNoYXJlZCBob3N0IHN0YXRlLlxuICovXG5pbnRlcmZhY2UgSVJlc29sdmVkQ2xhdWRlQ2hhdENvbnRleHQge1xuXHQvKiogVGhlIG9wYXF1ZSBjb25maWd1cmF0aW9uL3BlcnNpc3RlbmNlIHNjb3BlIHNoYXJlZCBieSB0aGlzIGNoYXQncyByZWxhdGVkIGNoYXRzLiAqL1xuXHRyZWFkb25seSBjb25maWd1cmF0aW9uUmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgc2Vzc2lvbklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IGNoYXQ6IFVSSTtcblx0cmVhZG9ubHkgY2hhdEtleTogc3RyaW5nO1xuXHQvKipcblx0ICogVGhlIHNwYXduaW5nIGNoYXQgKyB0b29sIGNhbGwgd2hlbiB7QGxpbmsgY2hhdH0gaXMgYSBwcm92aWRlci1zcGF3bmVkXG5cdCAqIHN1YmFnZW50LCByZWFkIG9mZiB0aGUgaG9zdC1zdXBwbGllZCBvcmlnaW4uIGB1bmRlZmluZWRgIGZvciBldmVyeSBvdGhlclxuXHQgKiBjaGF0LlxuXHQgKi9cblx0cmVhZG9ubHkgc3Bhd25lZEZyb206IElBZ2VudFNwYXduZWRDaGF0UGFyZW50IHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogVGhlIG93bmluZyBzZXNzaW9uJ3MgbGFzdCBob3N0LXB1Ymxpc2hlZCBjdXN0b21pemF0aW9uIHNuYXBzaG90LlxuXHQgKiBgdW5kZWZpbmVkYCBtZWFucyBcIm5vIHNuYXBzaG90IHB1Ymxpc2hlZCB5ZXRcIiBcdTIwMTQgZGVsaWJlcmF0ZWx5IGRpc3RpbmN0XG5cdCAqIGZyb20gYW4gZW1wdHkgbGlzdCwgc28gdGhlIHByb3ZpZGVyIGtlZXBzIGl0cyBvd24gcmVjb25jaWxlZCB2aWV3LlxuXHQgKi9cblx0cmVhZG9ubHkgY3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgc2RrU2Vzc2lvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHNlcXVlbmNlcktleTogc3RyaW5nO1xuXHRyZWFkb25seSB0YXJnZXQ6IENsYXVkZUFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBQcm9qZWN0cyBhIGJhY2tpbmcgZG93biB0byB0aGUgb3BhcXVlIHtAbGluayBJUGVyc2lzdGVkQ2hhdH0gc2hhcGUgdGhlXG4gKiBvcmNoZXN0cmF0b3IgcGVyc2lzdHMgdmVyYmF0aW0gaW4gaXRzIGNoYXQgY2F0YWxvZyBcdTIwMTQgdGhlIHdpcmUgZm9ybWF0IGlzXG4gKiB1bmNoYW5nZWQuXG4gKi9cbmZ1bmN0aW9uIF90b1BlcnNpc3RlZENoYXQoYmFja2luZzogSUNsYXVkZUNoYXRCYWNraW5nKTogSVBlcnNpc3RlZENoYXQge1xuXHRyZXR1cm4geyBzZGtTZXNzaW9uSWQ6IGJhY2tpbmcuc2RrU2Vzc2lvbklkLCAuLi4oYmFja2luZy5tb2RlbCA/IHsgbW9kZWw6IGJhY2tpbmcubW9kZWwgfSA6IHt9KSwgLi4uKGJhY2tpbmcuc2lkZUNoYXQgPyB7IHNpZGVDaGF0OiBiYWNraW5nLnNpZGVDaGF0IH0gOiB7fSkgfTtcbn1cblxuLyoqXG4gKiBDbGF1ZGUgYWN0aXZlLWNsaWVudCBoYW5kbGUsIGFkZHJlc3NlZCB0byBleGFjdGx5IG9uZSBob3N0LXN1cHBsaWVkIGNoYXQuXG4gKiBUb29scyByZWFkL3dyaXRlIHRocm91Z2ggdGhlIGxpdmUgc2Vzc2lvbidzIHtAbGluayBTZXNzaW9uQ2xpZW50VG9vbHNNb2RlbH07XG4gKiBjdXN0b21pemF0aW9uIGFzc2lnbm1lbnQga2lja3Mgb2ZmIHRoZSBhZ2VudCdzIGFzeW5jIHN5bmMgKHZpYSB0aGVcbiAqIHByb3ZpZGVkIGNsb3N1cmUpLiBUaGUgaGFuZGxlIGNhY2hlcyB0aGUgbGFzdCBhc3NpZ25lZCBjdXN0b21pemF0aW9uXG4gKiBpbnB1dHMgc28gdGhlIGdldHRlciByZWZsZWN0cyB3aGF0IHRoZSBjbGllbnQgbW9zdCByZWNlbnRseSBwdWJsaXNoZWQuXG4gKlxuICogVGhlcmUgaXMgbm8gbWVtYmVyc2hpcCBoZXJlOiBBZ2VudCBIb3N0IGFkZHJlc3NlcyB0aGlzIGhhbmRsZSB0byBleGFjdGx5XG4gKiBvbmUgY2hhdCBhdCBjb25zdHJ1Y3Rpb24sIGFuZCBldmVyeSBsYXRlciBjb250cmlidXRpb24gKHRvb2xzLFxuICogY3VzdG9taXphdGlvbnMpIGFwcGxpZXMgdG8gdGhhdCBjaGF0IGFsb25lLiBBIHNpYmxpbmcgY2hhdCBuZWVkcyBpdHMgb3duXG4gKiBoYW5kbGUsIG9idGFpbmVkIHRocm91Z2ggaXRzIG93biBgZ2V0T3JDcmVhdGVBY3RpdmVDbGllbnRgIGNhbGwuXG4gKi9cbmNsYXNzIENsYXVkZUFjdGl2ZUNsaWVudEhhbmRsZSBpbXBsZW1lbnRzIElBY3RpdmVDbGllbnQge1xuXHRwcml2YXRlIF90b29sczogcmVhZG9ubHkgVG9vbERlZmluaXRpb25bXSA9IFtdO1xuXHRwcml2YXRlIF9jdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbltdID0gW107XG5cdHByaXZhdGUgX2N1c3RvbWl6YXRpb25zQXNzaWduZWQgPSBmYWxzZTtcblx0LyoqXG5cdCAqIFRoZSBsYXN0IGhvc3QtcHVibGlzaGVkIGN1c3RvbWl6YXRpb24gc25hcHNob3QgZm9yIHRoZSBvd25pbmdcblx0ICogY29uZmlndXJhdGlvbiBzY29wZSwgcmVmcmVzaGVkIG9uIGV2ZXJ5IGhvc3QgY2FsbC4gYHVuZGVmaW5lZGAgdW50aWwgdGhlXG5cdCAqIGhvc3QgcHVibGlzaGVzIG9uZSBcdTIwMTQgbmV2ZXIgY29lcmNlZCB0byBhbiBlbXB0eSBsaXN0LCB3aGljaCB3b3VsZCByZWFkIGFzXG5cdCAqIFwidGhpcyBjaGF0IGhhcyBubyBjdXN0b21pemF0aW9uc1wiLlxuXHQgKi9cblx0cHJpdmF0ZSBfaG9zdEN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW10gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgY2xpZW50SWQ6IHN0cmluZyxcblx0XHRyZWFkb25seSBkaXNwbGF5TmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkLFxuXHRcdC8qKiBUaGUgZXhhY3QgY2hhdCB0aGlzIGhhbmRsZSdzIGNvbnRyaWJ1dGlvbnMgYXJlIGFkZHJlc3NlZCB0by4gKi9cblx0XHRyZWFkb25seSBjaGF0OiBVUkksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2V0VG9vbHM6IChjaGF0OiBVUkksIHRvb2xzOiByZWFkb25seSBUb29sRGVmaW5pdGlvbltdKSA9PiB2b2lkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3N5bmNDdXN0b21pemF0aW9uczogKGNoYXQ6IFVSSSwgY3VzdG9taXphdGlvbnM6IHJlYWRvbmx5IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXSwgaG9zdEN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW10gfCB1bmRlZmluZWQpID0+IHZvaWQsXG5cdCkgeyB9XG5cblx0Z2V0IHRvb2xzKCk6IHJlYWRvbmx5IFRvb2xEZWZpbml0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl90b29scztcblx0fVxuXHRzZXQgdG9vbHModG9vbHM6IHJlYWRvbmx5IFRvb2xEZWZpbml0aW9uW10pIHtcblx0XHR0aGlzLl90b29scyA9IHRvb2xzO1xuXHRcdHRoaXMuX3NldFRvb2xzKHRoaXMuY2hhdCwgdG9vbHMpO1xuXHR9XG5cblx0Z2V0IGN1c3RvbWl6YXRpb25zKCk6IHJlYWRvbmx5IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2N1c3RvbWl6YXRpb25zO1xuXHR9XG5cdHNldCBjdXN0b21pemF0aW9ucyhjdXN0b21pemF0aW9uczogcmVhZG9ubHkgQ2xpZW50UGx1Z2luQ3VzdG9taXphdGlvbltdKSB7XG5cdFx0dGhpcy5fY3VzdG9taXphdGlvbnMgPSBjdXN0b21pemF0aW9ucztcblx0XHR0aGlzLl9jdXN0b21pemF0aW9uc0Fzc2lnbmVkID0gdHJ1ZTtcblx0XHR0aGlzLl9zeW5jQ3VzdG9taXphdGlvbnModGhpcy5jaGF0LCBjdXN0b21pemF0aW9ucywgdGhpcy5faG9zdEN1c3RvbWl6YXRpb25zKTtcblx0fVxuXG5cdC8qKiBUaGUgbGFzdCBob3N0IHNuYXBzaG90LCBmb3Igc3luY3MgdGhpcyBjbGllbnQncyBvd24gYXNzaWdubWVudCB0cmlnZ2Vycy4gKi9cblx0Z2V0IGhvc3RDdXN0b21pemF0aW9ucygpOiByZWFkb25seSBDdXN0b21pemF0aW9uW10gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9ob3N0Q3VzdG9taXphdGlvbnM7XG5cdH1cblxuXHQvKiogUmVjb3JkcyB0aGUgaG9zdCdzIGxhdGVzdCBwdWJsaXNoZWQgY3VzdG9taXphdGlvbiBzbmFwc2hvdCBmb3IgdGhpcyBoYW5kbGUncyBvd25pbmcgc2NvcGUsIGlmIHN1cHBsaWVkLiAqL1xuXHRzZXRIb3N0Q3VzdG9taXphdGlvbnMoaG9zdEN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW10gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoaG9zdEN1c3RvbWl6YXRpb25zICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2hvc3RDdXN0b21pemF0aW9ucyA9IGhvc3RDdXN0b21pemF0aW9ucztcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmUtYXBwbGllcyB0aGlzIGhhbmRsZSdzIGN1cnJlbnRseS1hc3NpZ25lZCB0b29scyBhbmQgKGlmIGV2ZXIgYXNzaWduZWQpXG5cdCAqIGN1c3RvbWl6YXRpb25zIHRvIGl0cyBjaGF0LiBVc2VkIHdoZW4gdGhlIGNoYXQncyBsaXZlIHJ1bnRpbWUganVzdCBjYW1lXG5cdCAqIHVwLCBzbyBjb250cmlidXRpb25zIG1hZGUgYmVmb3JlIHRoZSBydW50aW1lIGV4aXN0ZWQgc3RpbGwgcmVhY2ggaXQuXG5cdCAqL1xuXHRyZWZyZXNoKCk6IHZvaWQge1xuXHRcdHRoaXMuX3NldFRvb2xzKHRoaXMuY2hhdCwgdGhpcy5fdG9vbHMpO1xuXHRcdGlmICh0aGlzLl9jdXN0b21pemF0aW9uc0Fzc2lnbmVkKSB7XG5cdFx0XHR0aGlzLl9zeW5jQ3VzdG9taXphdGlvbnModGhpcy5jaGF0LCB0aGlzLl9jdXN0b21pemF0aW9ucywgdGhpcy5faG9zdEN1c3RvbWl6YXRpb25zKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiB7QGxpbmsgSUFnZW50fSBwcm92aWRlciBmb3IgdGhlIENsYXVkZSBBZ2VudCBTREsuXG4gKlxuICogSGFuZGxlcyBkZXNjcmlwdG9yL2F1dGggc3VyZmFjZXMsIG1vZGVsIGNhdGFsb2cgZW51bWVyYXRpb24gKG1lcmdpbmdcbiAqIHByb3h5IGFuZCBuYXRpdmUgdHJhbnNwb3J0cyksIGNoYXQgbGlmZWN5Y2xlIChjcmVhdGUvcmVzb2x2ZS9kaXNwb3NlKSxcbiAqIHRvb2wgcGVybWlzc2lvbnMsIGVsaWNpdGF0aW9uLCBhbmQgc2Vzc2lvbiBwZXJzaXN0ZW5jZS5cbiAqL1xuZXhwb3J0IGNsYXNzIENsYXVkZUFnZW50IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudCB7XG5cdHJlYWRvbmx5IGlkOiBBZ2VudFByb3ZpZGVyID0gQ0xBVURFX0FHRU5UX1BST1ZJREVSX0lEO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhdFByb2dyZXNzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8QWdlbnRTaWduYWw+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYXRQcm9ncmVzcyA9IHRoaXMuX29uRGlkQ2hhdFByb2dyZXNzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ3VzdG9taXphdGlvbnNDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDdXN0b21pemF0aW9uc0NoYW5nZSA9IHRoaXMuX29uRGlkQ3VzdG9taXphdGlvbnNDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBZ2VudE1vZGVsSW5mb1tdPih0aGlzLCBbXSk7XG5cdHJlYWRvbmx5IG1vZGVsczogSU9ic2VydmFibGU8cmVhZG9ubHkgSUFnZW50TW9kZWxJbmZvW10+ID0gdGhpcy5fbW9kZWxzO1xuXHQvKipcblx0ICogSW4tZmxpZ2h0IHtAbGluayByZWZyZXNoTW9kZWxzfSBjYWxsLCBzbyBvdmVybGFwcGluZyB0cmlnZ2VycyAoYW4gYXV0aFxuXHQgKiB0b2tlbiBjaGFuZ2UsIGEgdHJhbnNwb3J0IGZsaXAsIG9yIGEgcGVyaW9kaWMgdGljayBmcm9tIHRoZSBob3N0J3Ncblx0ICogbW9kZWwtcmVmcmVzaCBzY2hlZHVsZXIpIGNvbGxhcHNlIGludG8gYSBzaW5nbGUgZW51bWVyYXRpb24gaW5zdGVhZCBvZlxuXHQgKiByYWNpbmcgZWFjaCBvdGhlcidzIHdyaXRlcyB0byB7QGxpbmsgX21vZGVsc30uXG5cdCAqL1xuXHRwcml2YXRlIF9tb2RlbFJlZnJlc2hJbkZsaWdodDogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9naXRodWJUb2tlbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wcm94eUhhbmRsZTogSUNsYXVkZVByb3h5SGFuZGxlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zZXJ2ZXJUb29sSG9zdDogSUFnZW50U2VydmVyVG9vbEhvc3QgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIE1lbW9pemVkIHRlYXJkb3duIHByb21pc2UuIFNldCBvbiB0aGUgZmlyc3QgY2FsbCB0byB7QGxpbmsgc2h1dGRvd259LFxuXHQgKiByZXR1cm5lZCBieSBldmVyeSBzdWJzZXF1ZW50IGNhbGwsIHNvIGNvbmN1cnJlbnQgY2FsbGVycyBzaGFyZSBvbmVcblx0ICogZHJhaW4gcGFzcyByYXRoZXIgdGhhbiByYWNpbmcgaW5kZXBlbmRlbnQgdGVhcmRvd25zLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2h1dGRvd25Qcm9taXNlOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBPd25zIGV2ZXJ5IGxpdmUgU0RLIGNvbnZlcnNhdGlvbiwga2V5ZWQgYnkgU0RLIHNlc3Npb24gaWQuIFRoaXMgaXMgdGhlXG5cdCAqIHNpbmdsZSBkaXNwb3NhYmxlIG93bmVyIG9mIGNoYXQgbGVhdmVzIGFuZCB0aGUgcmV2ZXJzZSBpbmRleCB1c2VkIGJ5XG5cdCAqIFNESy1vcmlnaW5hdGVkIGNhbGxiYWNrcyAoY3JlZGl0IHJlcG9ydHMsIGBjYW5Vc2VUb29sYCwgZWxpY2l0YXRpb24pLFxuXHQgKiB3aGljaCBvbmx5IGV2ZXIga25vdyB0aGUgU0RLJ3Mgb3duIGlkLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY2hhdEVudHJpZXNCeVNka0lkID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBDbGF1ZGVDaGF0RW50cnk+KCkpO1xuXG5cdC8qKlxuXHQgKiBNYXBzIGVhY2ggaG9zdC1zdXBwbGllZCBjb25jcmV0ZSBjaGF0IFVSSSB0byBpdHMge0BsaW5rIElDbGF1ZGVDaGF0QmFja2luZ30uXG5cdCAqIFRoaXMgaXMgdGhlIHNpbmdsZSwgY29uc29saWRhdGVkIGBjaGF0VXJpIFx1MjE5MiBiYWNraW5nYCBtYXBwaW5nIGFuZCB0aGUgb25seVxuXHQgKiB3YXkgYSBjaGF0IHJlc29sdmVzOiBldmVyeSBjaGF0IFx1MjAxNCBhIHNlc3Npb24ncyBwcmltYXJ5IGNoYXQsIGEgZm9yaywgYVxuXHQgKiBzaWRlIGNoYXQsIGEgcmVzdG9yZWQgbGVnYWN5IGNoYXQgXHUyMDE0IGhhcyBleGFjdGx5IG9uZSBleGFjdCBiYWNraW5nIGhlcmUuXG5cdCAqIEl0IGVuY29kZXMgbm8gbWVtYmVyc2hpcCBraW5kIGFuZCBubyBwZXJzaXN0ZW5jZSBzY29wZSwgc28gbm90aGluZ1xuXHQgKiBhYm91dCBhIGNoYXQgaXMgZXZlciByZWNvdmVyZWQgZnJvbSBVUkkgc2hhcGUgb3IgZnJvbSBhXG5cdCAqIHByb3ZpZGVyLXByaXZhdGUgY2xhc3NpZmljYXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0QmFja2luZ3MgPSBuZXcgTWFwPHN0cmluZywgSUNsYXVkZUNoYXRCYWNraW5nPigpO1xuXG5cdC8qKlxuXHQgKiBNYXBzIGVhY2ggaG9zdC1zdXBwbGllZCBjb25jcmV0ZSBjaGF0IFVSSSB0byB0aGUgZXhhY3Rcblx0ICoge0BsaW5rIElDaGF0U2NvcGVCaW5kaW5nfSBcdTIwMTQgYm90aCBpdHMgY29uZmlndXJhdGlvbiBzY29wZVxuXHQgKiAoYElBZ2VudENoYXRDb250ZXh0LmNvbmZpZ3VyYXRpb25SZXNvdXJjZWAsIHNoYXJlZCBzZXNzaW9uLXdpZGUpIGFuZCBpdHNcblx0ICogb3duIHBlcnNpc3RlbmNlIHJlc291cmNlIChgSUFnZW50Q2hhdENvbnRleHQucmVzb3VyY2VgLCB0aGUgZXhhY3Qga2V5IGl0c1xuXHQgKiBvdmVybGF5IGlzIHdyaXR0ZW4gdW5kZXIpIFx1MjAxNCByZWNvcmRlZCB3aGVuZXZlciB0aGF0IGNoYXQgaXMgY3JlYXRlZCBvclxuXHQgKiAocmUtKW1hdGVyaWFsaXplZC4gVGhpcyBpcyB0aGUgb25seSBzdGF0ZSBhIGZvcmsvc2lkZS1jaGF0IHNvdXJjZSdzIG93blxuXHQgKiBzY29wZSBpcyBldmVyIHJlc29sdmVkIGZyb20gXHUyMDE0IG5ldmVyIHRoZSBkZXN0aW5hdGlvbiBjaGF0J3Mgc2NvcGUsIG5ldmVyXG5cdCAqIGEgc2libGluZyBjYXRhbG9nIGdyb3VwZWQgYnkgc2Vzc2lvbi5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRDb25maWdTY29wZXMgPSBuZXcgTWFwPHN0cmluZywgSUNoYXRTY29wZUJpbmRpbmc+KCk7XG5cblx0LyoqXG5cdCAqIEZpcmVzIHdoZW4gYSBjb25jcmV0ZSBjaGF0IGJhY2tpbmcncyBvcGFxdWUgYHByb3ZpZGVyRGF0YWAgY2hhbmdlcyBhZnRlciBjcmVhdGlvblxuXHQgKiAoZS5nLiBhIHBlci1jaGF0IG1vZGVsIHN3aXRjaCkgc28gdGhlIG9yY2hlc3RyYXRvciBjYW4gcmUtcGVyc2lzdCB0aGVcblx0ICogcmVmcmVzaGVkIHRva2VuLiBTZWUge0BsaW5rIElBZ2VudC5vbkRpZENoYW5nZUNoYXREYXRhfS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQ2hhdERhdGEgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQWdlbnRDaGF0RGF0YUNoYW5nZT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ2hhdERhdGE6IEV2ZW50PElBZ2VudENoYXREYXRhQ2hhbmdlPiA9IHRoaXMuX29uRGlkQ2hhbmdlQ2hhdERhdGEuZXZlbnQ7XG5cblx0LyoqXG5cdCAqIE1lbWJlcnNoaXAgY2hhbm5lbCBmb3IgY2hhdHMgdGhlIGFnZW50IHNwYXducyBpdHNlbGYgXHUyMDE0IHRvZGF5IHRoZVxuXHQgKiBzdWItYWdlbnQgY2hhdHMgZGVsZWdhdGVkIGJ5IGEgYFRhc2tgL2BBZ2VudGAgdG9vbCBjYWxsIChhbmQsIHdoZW4gdGhlXG5cdCAqIGhhcm5lc3MgZ2FpbnMgdGhlbSwgQ2xhdWRlIFRlYW1zIHRlYW1tYXRlcykuIERlcml2ZWQgZnJvbSB0aGVcblx0ICogYHN1YmFnZW50X3N0YXJ0ZWRgIC8gYHN1YmFnZW50X2NvbXBsZXRlZGAgc2lnbmFscyB0aGF0IGFscmVhZHkgZmxvdyBvblxuXHQgKiB7QGxpbmsgb25EaWRDaGF0UHJvZ3Jlc3N9LCBzbyB0aGUgb3JjaGVzdHJhdG9yIHJlY29yZHMgdGhlIHNwYXduIGVkZ2Vcblx0ICogb24gdGhlIHVuaWZpZWQgY2hhdCBjYXRhbG9nLiBTZWUge0BsaW5rIElBZ2VudC5vbkRpZFNwYXduQ2hhdH0uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNwYXduQ2hhdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElBZ2VudFNwYXduQ2hhdEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRTcGF3bkNoYXQ6IEV2ZW50PElBZ2VudFNwYXduQ2hhdEV2ZW50PiA9IHRoaXMuX29uRGlkU3Bhd25DaGF0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGlzY292ZXJDaGF0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHJlYWRvbmx5IElBZ2VudERpc2NvdmVyZWRDaGF0W10+KHtcblx0XHQvLyBEaXNjb3ZlcnkgaXMgcHJvdmlkZXItb3duZWQgYW5kIG9ubHkgaGFzIG9ic2VydmFibGUgdmFsdWUgb25jZSB0aGUgaG9zdFxuXHRcdC8vIHN1YnNjcmliZXMuIFJlZ2lzdGVyZWQgY2hhdHMgcmVtYWluIGluZGVwZW5kZW50bHkgYXZhaWxhYmxlIHRocm91Z2hcblx0XHQvLyBsaXN0Q2hhdHNUb01pZ3JhdGUoKS5cblx0XHRvbkRpZEFkZEZpcnN0TGlzdGVuZXI6ICgpID0+IHsgdm9pZCB0aGlzLl9zdGFydENsYXVkZUNvZGVDaGF0RGlzY292ZXJ5KCk7IH0sXG5cdH0pKTtcblx0cmVhZG9ubHkgb25EaWREaXNjb3ZlckNoYXRzID0gdGhpcy5fb25EaWREaXNjb3ZlckNoYXRzLmV2ZW50O1xuXHRwcml2YXRlIF9jbGF1ZGVDb2RlQ2hhdERpc2NvdmVyeTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogU3RhYmxlIGFjdGl2ZS1jbGllbnQgaGFuZGxlcywga2V5ZWQgYnkgYCR7Y2hhdEtleX1cXDAke2NsaWVudElkfWAgXHUyMDE0IG9uZVxuXHQgKiBoYW5kbGUgcGVyIGV4YWN0IChjaGF0LCBjbGllbnQpIHBhaXIuIFRoZXJlIGlzIG5vIHNlc3Npb24tIG9yXG5cdCAqIG1lbWJlcnNoaXAtbGV2ZWwgZW50cnk6IGEgY2xpZW50IGNvbnRyaWJ1dGluZyB0byBzZXZlcmFsIGNoYXRzIG9mIHRoZVxuXHQgKiBzYW1lIHNlc3Npb24gZ2V0cyBvbmUgaW5kZXBlbmRlbnQgaGFuZGxlIHBlciBjaGF0LCBlYWNoIG9idGFpbmVkXG5cdCAqIHRocm91Z2ggaXRzIG93biB7QGxpbmsgZ2V0T3JDcmVhdGVBY3RpdmVDbGllbnR9IGNhbGwuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVDbGllbnRIYW5kbGVzID0gbmV3IE1hcDxzdHJpbmcsIENsYXVkZUFjdGl2ZUNsaWVudEhhbmRsZT4oKTtcblxuXHQvKipcblx0ICogRmlyZWQgb25jZSBwZXIgc2Vzc2lvbiB3aGVuIHtAbGluayBfbWF0ZXJpYWxpemVQcm92aXNpb25hbH0gcHJvbW90ZXMgYVxuXHQgKiBwcm92aXNpb25hbCByZWNvcmQgaW50byBhIHJlYWwge0BsaW5rIENsYXVkZUFnZW50U2Vzc2lvbn0uIFRoZVxuXHQgKiB7QGxpbmsgSUFnZW50U2VydmljZX0gc3Vic2NyaWJlcyB2aWEgdGhlIHBsYXRmb3JtIGNvbnRyYWN0IHRvIGRpc3BhdGNoXG5cdCAqIHRoZSBkZWZlcnJlZCBgc2Vzc2lvbkFkZGVkYCBub3RpZmljYXRpb24gXHUyMDE0IG9ic2VydmVycyBkb24ndCBzZWUgdGhlXG5cdCAqIHNlc3Npb24gaW4gdGhlaXIgbGlzdCB1bnRpbCBwZXJzaXN0ZW5jZSBoYXMgc2V0dGxlZC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTWF0ZXJpYWxpemVDaGF0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUFnZW50TWF0ZXJpYWxpemVDaGF0RXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZE1hdGVyaWFsaXplQ2hhdCA9IHRoaXMuX29uRGlkTWF0ZXJpYWxpemVDaGF0LmV2ZW50O1xuXG5cdC8qKlxuXHQgKiBQZXItU0RLLXNlc3Npb24taWQgc2VyaWFsaXplciBmb3Ige0BsaW5rIHNodXRkb3dufSdzIHRlYXJkb3duIHBhc3MsIHNvXG5cdCAqIHRoZSBkcmFpbiBvZiBldmVyeSBsaXZlIGNoYXQgaW5oZXJpdHMgcGVyLXNlc3Npb24gc2VyaWFsaXphdGlvbiBmb3IgaXRzXG5cdCAqIGFzeW5jIHRlYXJkb3duIChgUXVlcnkuaW50ZXJydXB0KClgLCBpbi1mbGlnaHQgbWV0YWRhdGEgd3JpdGVzKS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2VTZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyQnlLZXk8c3RyaW5nPigpO1xuXG5cdC8qKlxuXHQgKiBQZXItc2Vzc2lvbi1pZCBzZXJpYWxpemVyIGZvciB7QGxpbmsgc2VuZE1lc3NhZ2V9LiBIZWxkIGFjcm9zcyBib3RoXG5cdCAqIHtAbGluayBfbWF0ZXJpYWxpemVQcm92aXNpb25hbH0gQU5EIGBlbnRyeS5zZW5kKClgIHNvIHR3byBjb25jdXJyZW50XG5cdCAqIGZpcnN0LW1lc3NhZ2UgY2FsbHMgb24gdGhlIHNhbWUgc2Vzc2lvbiBjb2xsYXBzZSBpbnRvIG9uZSBtYXRlcmlhbGl6ZVxuXHQgKiBwbHVzIHR3byBvcmRlcmVkIHNlbmRzLiBTZXBhcmF0ZSBmcm9tIHtAbGluayBfZGlzcG9zZVNlcXVlbmNlcn0gc29cblx0ICogdGVhcmRvd24gcmFjaW5nIGEgZmlyc3Qgc2VuZCBzdGlsbCBzZXJpYWxpemVzIHdpdGhvdXQgZGVhZGxvY2tpbmdcblx0ICogaW5zaWRlIHRoZSBzZW5kIHNlcXVlbmNlci5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25TZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyQnlLZXk8c3RyaW5nPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21ldGFkYXRhU3RvcmU6IENsYXVkZVNlc3Npb25NZXRhZGF0YVN0b3JlO1xuXG5cdHByaXZhdGUgX2ZpbmRBbnlTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogQ2xhdWRlQWdlbnRTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hhdEVudHJpZXNCeVNka0lkLmdldChzZXNzaW9uSWQpPy5jaGF0U2Vzc2lvbjtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgb3BhcXVlIGhhbGYgb2YgYSBjcmVhdGlvbiByZXN1bHQ6IHRoZSBibG9iIHRoZSBvcmNoZXN0cmF0b3IgcGVyc2lzdHNcblx0ICogdmVyYmF0aW0sIHBsdXMgdGhlIHNlcGFyYXRlbHktZW51bWVyYWJsZSBTREsgY29udmVyc2F0aW9uIGl0IG11c3Rcblx0ICogc3VwcHJlc3MgZnJvbSB0aGUgdG9wLWxldmVsIHNlc3Npb24gbGlzdC5cblx0ICovXG5cdHByaXZhdGUgX2NoYXRCYWNraW5nUmVzdWx0KGJhY2tpbmc6IElDbGF1ZGVDaGF0QmFja2luZyk6IElBZ2VudENyZWF0ZUNoYXRSZXN1bHQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwcm92aWRlckRhdGE6IGVuY29kZVByb3ZpZGVyRGF0YShfdG9QZXJzaXN0ZWRDaGF0KGJhY2tpbmcpKSxcblx0XHRcdGJhY2tpbmdTZXNzaW9uOiBBZ2VudFNlc3Npb24udXJpKHRoaXMuaWQsIGJhY2tpbmcuc2RrU2Vzc2lvbklkKSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZENoYXRCeVVyaShjaGF0OiBVUkkgfCBzdHJpbmcpOiBDbGF1ZGVBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNka1Nlc3Npb25JZCA9IHRoaXMuX2NoYXRCYWNraW5ncy5nZXQodHlwZW9mIGNoYXQgPT09ICdzdHJpbmcnID8gY2hhdCA6IGNoYXQudG9TdHJpbmcoKSk/LnNka1Nlc3Npb25JZDtcblx0XHRyZXR1cm4gc2RrU2Vzc2lvbklkID8gdGhpcy5fZmluZEFueVNlc3Npb24oc2RrU2Vzc2lvbklkKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyBhIGhvc3QtYWRkcmVzc2VkIGNoYXQgb3BlcmF0aW9uIGFnYWluc3QgdGhlIGV4YWN0IGNoYXQgVVJJIGl0XG5cdCAqIHdhcyBhZGRyZXNzZWQgdG8uXG5cdCAqXG5cdCAqIGBjb250ZXh0YCBpcyBtYW5kYXRvcnk6IEFnZW50IEhvc3Qgc3RhbXBzIHRoZSBjb25maWd1cmF0aW9uL3BlcnNpc3RlbmNlXG5cdCAqIHNjb3BlLCB0aGUgZXhhY3QtY2hhdCBwZXJzaXN0ZW5jZSBzY29wZSwgdGhlIHByb3Zpc2lvbmluZyBpbnRlbnQsIHRoZVxuXHQgKiBjYXRhbG9nIG9yaWdpbiwgYW5kIHRoZSBzZXNzaW9uJ3MgY3VzdG9taXphdGlvbiBzbmFwc2hvdCBvbiBldmVyeVxuXHQgKiBhZGRyZXNzZWQgY2hhdCBvcGVyYXRpb24sIGFuZCB0aGlzIHByb3ZpZGVyIGNvbnN1bWVzIGFsbCBvZiB0aGVtXG5cdCAqIHZlcmJhdGltLiBUaGVyZSBpcyBubyBpbXBsaWNpdCBmb3JtIFx1MjAxNCBhIGNoYXQgaXMgbmV2ZXIgcmVzb2x2ZWQgYnlcblx0ICogdHJlYXRpbmcgaXRzIFVSSSBhcyBhIHNlc3Npb24sIGJ5IHNjYW5uaW5nIGxpdmUgcnVudGltZXMsIG9yIGJ5IHBhcnNpbmdcblx0ICogVVJJIHNoYXBlLiBSZXNvbHV0aW9uIG9mIHRoZSBwcm92aWRlcidzIG93biBzdGF0ZSBpcyBleGFjdGx5IG9uZSBsb29rdXA6XG5cdCAqIHRoZSBjaGF0J3MgZXhhY3QgYmFja2luZy5cblx0ICovXG5cdHByaXZhdGUgX3Jlc29sdmVDaGF0Q29udGV4dChjaGF0OiBVUkksIGNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogSVJlc29sdmVkQ2xhdWRlQ2hhdENvbnRleHQge1xuXHRcdGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZUFnZW50Q2hhdENvbnRleHQoY29udGV4dCwgY2hhdCk7XG5cdFx0Y29uc3QgY2hhdEtleSA9IGNoYXQudG9TdHJpbmcoKTtcblx0XHRjb25zdCBiYWNraW5nID0gdGhpcy5fY2hhdEJhY2tpbmdzLmdldChjaGF0S2V5KTtcblx0XHRjb25zdCBzZGtTZXNzaW9uSWQgPSBiYWNraW5nPy5zZGtTZXNzaW9uSWQ7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbmZpZ3VyYXRpb25SZXNvdXJjZTogcmVzb2x2ZWQuY29uZmlndXJhdGlvblJlc291cmNlLFxuXHRcdFx0c2Vzc2lvbklkOiBBZ2VudFNlc3Npb24uaWQocmVzb2x2ZWQuY29uZmlndXJhdGlvblJlc291cmNlKSxcblx0XHRcdHJlc291cmNlOiByZXNvbHZlZC5yZXNvdXJjZSxcblx0XHRcdGNoYXQsXG5cdFx0XHRjaGF0S2V5LFxuXHRcdFx0c3Bhd25lZEZyb206IHJlc29sdmVTdWJhZ2VudENoYXRQYXJlbnQocmVzb2x2ZWQpLFxuXHRcdFx0Y3VzdG9taXphdGlvbnM6IHJlc29sdmVBZ2VudEhvc3RDdXN0b21pemF0aW9ucyhyZXNvbHZlZCksXG5cdFx0XHRzZGtTZXNzaW9uSWQsXG5cdFx0XHRzZXF1ZW5jZXJLZXk6IHNka1Nlc3Npb25JZCA/PyBjaGF0S2V5LFxuXHRcdFx0dGFyZ2V0OiBzZGtTZXNzaW9uSWQgPyB0aGlzLl9maW5kQW55U2Vzc2lvbihzZGtTZXNzaW9uSWQpIDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdH1cblxuXHQvKiogUmVjb3JkcyBgY2hhdGAncyBleGFjdCBzY29wZSBiaW5kaW5nLCBwb3B1bGF0ZWQgb24gY3JlYXRlIGFuZCBtYXRlcmlhbGl6ZS4gKi9cblx0cHJpdmF0ZSBfcmVjb3JkQ2hhdFNjb3BlKGNoYXQ6IFVSSSwgY29uZmlndXJhdGlvblJlc291cmNlOiBVUkksIHJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHR0aGlzLl9jaGF0Q29uZmlnU2NvcGVzLnNldChjaGF0LnRvU3RyaW5nKCksIHsgY29uZmlndXJhdGlvblJlc291cmNlLCByZXNvdXJjZSB9KTtcblx0fVxuXG5cdC8qKiBSZXNvbHZlcyB0aGUgc2NvcGUgYmluZGluZyByZWNvcmRlZCBmb3IgYW4gZXhhY3Qgc291cmNlIGNoYXQuICovXG5cdHByaXZhdGUgX3NvdXJjZUNoYXRTY29wZShzb3VyY2U6IFVSSSk6IElDaGF0U2NvcGVCaW5kaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hhdENvbmZpZ1Njb3Blcy5nZXQoc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFZhbGlkYXRlcyB0aGF0IEFnZW50IEhvc3Qgc3VwcGxpZWQgY29udGV4dCBvbiBhIGJvdW5kYXJ5IHdob3NlIHByb3RvY29sXG5cdCAqIHNpZ25hdHVyZSBzdGlsbCB0eXBlcyBpdCBhcyBvcHRpb25hbC4gSXQgZG9lcyBvbiBldmVyeSBvbmUgb2YgdGhlbTsgYVxuXHQgKiBtaXNzaW5nIGNvbnRleHQgaXMgYSBob3N0IGJ1ZyB3ZSBzdXJmYWNlIHJhdGhlciB0aGFuIHBhcGVyIG92ZXIgYnlcblx0ICogaW52ZW50aW5nIHRoZSBvd25pbmcgc2Vzc2lvbiBmcm9tIHRoZSBjaGF0IFVSSS5cblx0ICovXG5cdHByaXZhdGUgX3JlcXVpcmVDaGF0Q29udGV4dChjaGF0OiBVUkksIGNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0IHwgdW5kZWZpbmVkLCBvcGVyYXRpb246IHN0cmluZyk6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0IHtcblx0XHRpZiAoIWNvbnRleHQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgW0NsYXVkZV0gJHtvcGVyYXRpb259IHJlcXVpcmVzIGhvc3QgY2hhdCBjb250ZXh0IGZvciAke2NoYXQudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNvbnRleHQ7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kU2Vzc2lvbkJ5U2RrSWQoc2RrU2Vzc2lvbklkOiBzdHJpbmcpOiBDbGF1ZGVBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9maW5kQW55U2Vzc2lvbihzZGtTZXNzaW9uSWQpO1xuXHR9XG5cblx0LyoqIFdyYXAgYSB7IENsYXVkZUFnZW50U2Vzc2lvbn0gaW4gYSBjaGF0LWxlYWYgZW50cnkgYW5kIGZvcndhcmQgaXRzIGV2ZW50cy4gKi9cblx0cHJpdmF0ZSBfd2lyZUVudHJ5KHNlc3Npb246IENsYXVkZUFnZW50U2Vzc2lvbik6IENsYXVkZUNoYXRFbnRyeSB7XG5cdFx0Y29uc3QgZW50cnkgPSBuZXcgQ2xhdWRlQ2hhdEVudHJ5KHNlc3Npb24pO1xuXHRcdGVudHJ5LmFkZERpc3Bvc2FibGUoc2Vzc2lvbi5vbkRpZFNlc3Npb25Qcm9ncmVzcyhzaWduYWwgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGF0UHJvZ3Jlc3MuZmlyZShzaWduYWwpO1xuXHRcdFx0dGhpcy5fZW1pdFNwYXduZWRDaGF0RXZlbnRzKHNpZ25hbCk7XG5cdFx0fSkpO1xuXHRcdGVudHJ5LmFkZERpc3Bvc2FibGUoc2Vzc2lvbi5vbkRpZEN1c3RvbWl6YXRpb25zQ2hhbmdlKCgpID0+IHRoaXMuX29uRGlkQ3VzdG9taXphdGlvbnNDaGFuZ2UuZmlyZSgpKSk7XG5cdFx0cmV0dXJuIGVudHJ5O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJMaXZlQ2hhdChjaGF0OiBVUkksIHNlc3Npb246IENsYXVkZUFnZW50U2Vzc2lvbik6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9jaGF0QmFja2luZ3MuZ2V0KGNoYXQudG9TdHJpbmcoKSk7XG5cdFx0dGhpcy5fZGVsZXRlTGl2ZUNoYXQoY2hhdC50b1N0cmluZygpKTtcblx0XHR0aGlzLl9jaGF0RW50cmllc0J5U2RrSWQuZGVsZXRlQW5kRGlzcG9zZShzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0dGhpcy5fY2hhdEVudHJpZXNCeVNka0lkLnNldChzZXNzaW9uLnNlc3Npb25JZCwgdGhpcy5fd2lyZUVudHJ5KHNlc3Npb24pKTtcblx0XHR0aGlzLl9jaGF0QmFja2luZ3Muc2V0KGNoYXQudG9TdHJpbmcoKSwge1xuXHRcdFx0c2RrU2Vzc2lvbklkOiBzZXNzaW9uLnNlc3Npb25JZCxcblx0XHRcdC4uLihjdXJyZW50Py5tb2RlbCA/IHsgbW9kZWw6IGN1cnJlbnQubW9kZWwgfSA6IHt9KSxcblx0XHRcdC4uLihjdXJyZW50Py5zaWRlQ2hhdCA/IHsgc2lkZUNoYXQ6IGN1cnJlbnQuc2lkZUNoYXQgfSA6IHt9KSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2RlbGV0ZUxpdmVDaGF0KGNoYXRLZXk6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGJhY2tpbmcgPSB0aGlzLl9jaGF0QmFja2luZ3MuZ2V0KGNoYXRLZXkpO1xuXHRcdGlmIChiYWNraW5nPy5zZGtTZXNzaW9uSWQpIHtcblx0XHRcdHRoaXMuX2NoYXRFbnRyaWVzQnlTZGtJZC5kZWxldGVBbmREaXNwb3NlKGJhY2tpbmcuc2RrU2Vzc2lvbklkKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVGVhciBkb3duIGEgY2hhdCdzIGxpdmUgZW50cnkgb25seS4gRXZlcnkgY2FsbGVyIHRoYXQgbWVhbnMgdG8gYWxzb1xuXHQgKiBmb3JnZXQgdGhlIGNoYXQncyBiYWNraW5nIChhIHRydWUgZGlzcG9zZSwgbm90IGEgcmVsZWFzZS90ZWFyZG93biB0aGF0XG5cdCAqIG11c3QgcmVzdW1lIGxhdGVyKSBkb2VzIHNvIGV4cGxpY2l0bHkgXHUyMDE0IGUuZy4ge0BsaW5rIF9kaXNwb3NlQ2hhdH0uXG5cdCAqIE5ldmVyIHRvdWNoaW5nIGBfY2hhdEJhY2tpbmdzYCBoZXJlIGtlZXBzIHJlbGVhc2UvY29sZC1yZXN1bWUgdW5pZm9ybVxuXHQgKiBmb3IgZXZlcnkgY29uY3JldGUgY2hhdCBiYWNraW5nLCBzaW5jZSB0aGlzIG9wZXJhdGlvbiBkb2VzIG5vdCBlbmNvZGVcblx0ICogcHJvdmlkZXItc3BlY2lmaWMgcGVyc2lzdGVuY2UgY2xhc3Nlcy5cblx0ICovXG5cdHByaXZhdGUgX2RlbGV0ZVNlc3Npb24oc2Vzc2lvbjogQ2xhdWRlQWdlbnRTZXNzaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fY2hhdEVudHJpZXNCeVNka0lkLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJyaWRnZXMgdGhlIGFnZW50J3MgYHN1YmFnZW50X3N0YXJ0ZWRgIHNpZ25hbCBvbnRvIHRoZVxuXHQgKiB7QGxpbmsgb25EaWRTcGF3bkNoYXR9IG1lbWJlcnNoaXAgY2hhbm5lbC4gVGhlIHNpZ25hbHMgYXJlIHN0aWxsIGZvcndhcmRlZFxuXHQgKiB2ZXJiYXRpbSBvbiB7QGxpbmsgb25EaWRDaGF0UHJvZ3Jlc3N9ICh0aGUgb3JjaGVzdHJhdG9yJ3Ncblx0ICogYEFnZW50U2lkZUVmZmVjdHNgIGtlZXBzIGRyaXZpbmcgdGhlIHN1Yi1hZ2VudCB0dXJuICsgcGFyZW50IHRvb2wtY2FsbFxuXHQgKiBjb250ZW50KTsgdGhpcyBldmVudCBvbmx5IG1pcnJvcnMgdGhlIHNwYXduIGludG8gdGhlIHVuaWZpZWQgY2hhdCBjYXRhbG9nLlxuXHQgKiBBIGNvbXBsZXRlZCBzdWJhZ2VudCBjaGF0IHN0YXlzIGxpdmUgYW5kIHN1YnNjcmliYWJsZSAoaXQgaXMgcmVtb3ZlZCBvbmx5XG5cdCAqIG9uIHNlc3Npb24gdGVhcmRvd24pLCBzbyB0aGVyZSBpcyBubyBjb3JyZXNwb25kaW5nIGVuZCBldmVudC4gVGhlIGNhdGFsb2dcblx0ICogYWRkIGlzIGlkZW1wb3RlbnQgc28gdGhlIG92ZXJsYXAgd2l0aCB0aGUgb3JjaGVzdHJhdG9yJ3Mgb3duIG1lbWJlcnNoaXBcblx0ICogc2VxdWVuY2luZyBpcyBzYWZlLlxuXHQgKi9cblx0cHJpdmF0ZSBfZW1pdFNwYXduZWRDaGF0RXZlbnRzKHNpZ25hbDogQWdlbnRTaWduYWwpOiB2b2lkIHtcblx0XHRjb25zdCBzcGF3biA9IFN1YmFnZW50Q2hhdFNpZ25hbC50b1NwYXduRXZlbnQoc2lnbmFsKTtcblx0XHRpZiAoc3Bhd24pIHtcblx0XHRcdHRoaXMuX29uRGlkU3Bhd25DaGF0LmZpcmUoc3Bhd24pO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNvcGlsb3RBcGlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvcGlsb3RBcGlTZXJ2aWNlOiBJQ29waWxvdEFwaVNlcnZpY2UsXG5cdFx0QElDbGF1ZGVQcm94eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2xhdWRlUHJveHlTZXJ2aWNlOiBJQ2xhdWRlUHJveHlTZXJ2aWNlLFxuXHRcdEBJQ2xhdWRlQWdlbnRTZGtTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nka1NlcnZpY2U6IElDbGF1ZGVBZ2VudFNka1NlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RTZXNzaW9uVGl0bGVTaWduYWwgcHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblRpdGxlU2lnbmFsOiBJQWdlbnRIb3N0U2Vzc2lvblRpdGxlU2lnbmFsLFxuXHRcdEBJQWdlbnRIb3N0T1RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3RlbFNlcnZpY2U6IElBZ2VudEhvc3RPVGVsU2VydmljZSxcblx0XHRASUFnZW50SG9zdEdpdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZ2l0U2VydmljZTogSUFnZW50SG9zdEdpdFNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGVja3BvaW50U2VydmljZTogSUFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZ2l0SHViRW5kcG9pbnRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUFnZW50UGx1Z2luTWFuYWdlciBwcml2YXRlIHJlYWRvbmx5IF9wbHVnaW5NYW5hZ2VyOiBJQWdlbnRQbHVnaW5NYW5hZ2VyLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASU5hdGl2ZUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fbWV0YWRhdGFTdG9yZSA9IF9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDbGF1ZGVTZXNzaW9uTWV0YWRhdGFTdG9yZSk7XG5cdFx0Ly8gQ0FQSSByZXBvcnRzIGVhY2ggcmVxdWVzdCdzIGJpbGxlZCBjcmVkaXRzIHZpYSB0aGUgcHJveHkgKHRoZSBTREtcblx0XHQvLyBzdHJpcHMgYGNvcGlsb3RfdXNhZ2VgIGZyb20gaXRzIGByZXN1bHRgKS4gUm91dGUgZXZlcnkgcmVwb3J0IHRvXG5cdFx0Ly8gdGhlIG9yaWdpbmF0aW5nIHNlc3Npb24gYnkgdGhlIHNlc3Npb24gaWQgdGhlIHByb3h5IGRlY29kZWQgZnJvbVxuXHRcdC8vIHRoZSBCZWFyZXIgdG9rZW4sIHNvIHRoZSBzZXNzaW9uIGNhbiBzdXJmYWNlIHJlYWwgcGVyLXR1cm4gY3JlZGl0cy5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jbGF1ZGVQcm94eVNlcnZpY2Uub25EaWRSZXBvcnRDcmVkaXRzKGUgPT4ge1xuXHRcdFx0dGhpcy5fZmluZFNlc3Npb25CeVNka0lkKGUuc2Vzc2lvbklkKT8ucmVjb3JkVHVybkNyZWRpdHMoZS50b3RhbE5hbm9BaXUpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEVtaXQgYSBob3N0LXByb2R1Y2VkIHNlc3Npb24tdGl0bGUgbWV0YWRhdGEgc3BhbiB3aGVuZXZlciB0aGlzIGFnZW50J3Ncblx0XHQvLyBzZXNzaW9uIHRpdGxlIGNoYW5nZXMuIFRoZSBuYXJyb3cgaG9zdCBzZWFtIGZpcmVzIGZvciBldmVyeSBwcm92aWRlclxuXHRcdC8vICh0aXRsZXMgYXJlIGhvc3Qtb3duZWQpLCBzbyBnYXRlIG9uIG91ciBvd24gcHJvdmlkZXIgaWQ7IHRoZVxuXHRcdC8vIGNvbnZlcnNhdGlvbiBpZCBpcyBwcmVjb21wdXRlZCBmb3IgdXMuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc2Vzc2lvblRpdGxlU2lnbmFsLm9uRGlkQ2hhbmdlU2Vzc2lvblRpdGxlKCh7IHByb3ZpZGVyLCBzZXNzaW9uLCBjb252ZXJzYXRpb25JZCwgdGl0bGUgfSkgPT4ge1xuXHRcdFx0aWYgKHByb3ZpZGVyID09PSB0aGlzLmlkKSB7XG5cdFx0XHRcdHRoaXMuX290ZWxTZXJ2aWNlLmVtaXRTZXNzaW9uVGl0bGVDaGFuZ2VkKGNvbnZlcnNhdGlvbklkLCBzZXNzaW9uLnRvU3RyaW5nKCksIHRpdGxlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBUaGUgbWVyZ2VkIGNhdGFsb2cgZW51bWVyYXRlcyBib3RoIHByb3ZpZGVycycgbW9kZWxzIFx1MjAxNCB0aGUgbmF0aXZlIGhhbGZcblx0XHQvLyBuZWVkcyBubyBHaXRIdWIgdG9rZW4gXHUyMDE0IHNvIGJvb3RzdHJhcCB0aGUgbW9kZWwgbGlzdCBoZXJlIHJhdGhlciB0aGFuXG5cdFx0Ly8gd2FpdGluZyBmb3IgYGF1dGhlbnRpY2F0ZSgpYC4gV2l0aG91dCB0aGlzIGEgc2lnbmVkLW91dCB3aW5kb3cgd2l0aCBhIGxvY2FsXG5cdFx0Ly8gQ2xhdWRlIHNldHVwIHdvdWxkIHNob3cgYW4gZW1wdHkgcGlja2VyLiBgcXVldWVNaWNyb3Rhc2tgIHJ1bnMgaXQgb2ZmIHRoZVxuXHRcdC8vIGN0b3Igc3RhY2suIFRoZSBwZXItc2Vzc2lvbiB0cmFuc3BvcnQgaXMgZGVyaXZlZCBvbiBkZW1hbmQgYXQgbWF0ZXJpYWxpemVcblx0XHQvLyAoc2VlIHtAbGluayBfZGVmYXVsdFRyYW5zcG9ydE1vZGV9KSwgc28gYSBzaWduLWluIHN0YXRlIGNoYW5nZSBuZWVkcyBub1xuXHRcdC8vIHJlYWN0aXZlIHJlLXJlc29sdmUgXHUyMDE0IHRoZSBuZXh0IHNlc3Npb24gc2ltcGx5IHJlYWRzIGl0IGxpdmUuXG5cdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4geyB2b2lkIHRoaXMuX3N0YXJ0TW9kZWxSZWZyZXNoKCk7IH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBmYWxsYmFjayB0cmFuc3BvcnQgZm9yIGEgc2Vzc2lvbiB3aG9zZSBtb2RlbCBuYW1lcyBubyBwcm92aWRlciAobW9kZWwtbGVzc1xuXHQgKiBvciBhIGJhcmUvbGVnYWN5IGlkKS4gUmVhZCBvbiBkZW1hbmQgYXQgbWF0ZXJpYWxpemUgXHUyMDE0IG5ldmVyIGNhY2hlZCBcdTIwMTQgZnJvbSBsaXZlXG5cdCAqIGF2YWlsYWJpbGl0eTogYSBzdGFydGVkIHtAbGluayBfcHJveHlIYW5kbGV9IG1lYW5zIENvcGlsb3QgaXMgc2VydmVhYmxlIG5vdywgYVxuXHQgKiBsb2NhbCBDbGF1ZGUgc2V0dXAgbWVhbnMgbmF0aXZlIGlzLiBUaGUgcHJlY2VkZW5jZSAoc2lnbi1pbiBzdGF0ZSwgdGhlbiBsb2NhbFxuXHQgKiBzZXR1cCkgaXMgZGVsZWdhdGVkIHRvIHRoZSBwdXJlIHtAbGluayByZXNvbHZlQ2xhdWRlVHJhbnNwb3J0TW9kZX0uIEFcblx0ICogcHJvdmlkZXItcXVhbGlmaWVkIG1vZGVsIGJ5cGFzc2VzIHRoaXMgYW5kIHJvdXRlcyBvbiBpdHMgb3duIHByb3ZpZGVyLlxuXHQgKi9cblx0cHJpdmF0ZSBfZGVmYXVsdFRyYW5zcG9ydE1vZGUoKTogQ2xhdWRlVHJhbnNwb3J0TW9kZSB7XG5cdFx0Y29uc3QgYWxsb3dTaWduZWRPdXRXaGVuVXNhYmxlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKGFnZW50SG9zdEN1c3RvbWl6YXRpb25Db25maWdTY2hlbWEsIEFnZW50SG9zdENvbmZpZ0tleS5BbGxvd1NpZ25lZE91dFdoZW5Vc2FibGUpID09PSB0cnVlO1xuXHRcdHJldHVybiByZXNvbHZlQ2xhdWRlVHJhbnNwb3J0TW9kZSh7IGFsbG93U2lnbmVkT3V0V2hlblVzYWJsZSwgaGFzR2l0SHViVG9rZW46IHRoaXMuX3Byb3h5SGFuZGxlICE9PSB1bmRlZmluZWQsIGhhc0V4aXN0aW5nU2V0dXA6IHRoaXMuX2hhc1VzYWJsZU5hdGl2ZVNldHVwKCkgfSk7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciBDbGF1ZGUgY2FuIHJ1biB3aXRob3V0IEdpdEh1YiByaWdodCBub3c6IHRoZSBzaWduZWQtb3V0IG9wdC1pbiBpcyBvblxuXHQgKiBBTkQgYSBCWU8tQW50aHJvcGljIGNyZWRlbnRpYWwgaXMgZGlzY292ZXJhYmxlIChzZWVcblx0ICoge0BsaW5rIGRldGVjdEV4aXN0aW5nQ2xhdWRlU2V0dXB9KS4gQmFja3MgYm90aCB0aGUgYWR2ZXJ0aXNlZCByZXF1aXJlbWVudCBhbmRcblx0ICogdGhlIG1vZGVsLWxlc3MgdHJhbnNwb3J0IGRlZmF1bHQgc28gdGhlIHR3byBjYW5ub3QgZGlzYWdyZWUuXG5cdCAqL1xuXHRwcml2YXRlIF9oYXNVc2FibGVOYXRpdmVTZXR1cCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKGFnZW50SG9zdEN1c3RvbWl6YXRpb25Db25maWdTY2hlbWEsIEFnZW50SG9zdENvbmZpZ0tleS5BbGxvd1NpZ25lZE91dFdoZW5Vc2FibGUpID09PSB0cnVlXG5cdFx0XHQmJiBkZXRlY3RFeGlzdGluZ0NsYXVkZVNldHVwKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS51c2VySG9tZS5mc1BhdGgpO1xuXHR9XG5cblx0Ly8gI3JlZ2lvbiBEZXNjcmlwdG9yICsgYXV0aFxuXG5cdGdldERlc2NyaXB0b3IoKTogSUFnZW50RGVzY3JpcHRvciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHByb3ZpZGVyOiB0aGlzLmlkLFxuXHRcdFx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCdjbGF1ZGVBZ2VudC5kaXNwbGF5TmFtZScsIFwiQ2xhdWRlXCIpLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGVBZ2VudC5kZXNjcmlwdGlvbicsIFwiQ2xhdWRlIGFnZW50IGJhY2tlZCBieSB0aGUgQW50aHJvcGljIENsYXVkZSBBZ2VudCBTREtcIiksXG5cdFx0XHRjYXBhYmlsaXRpZXM6IHtcblx0XHRcdFx0bXVsdGlwbGVDaGF0czogeyBmb3JrOiB0cnVlLCBzaWRlQ2hhdDogdHJ1ZSB9LFxuXHRcdFx0XHQuLi4odGhpcy5faXNNdWx0aVJvb3RFbmFibGVkKCkgPyB7IG11bHRpcGxlV29ya2luZ0RpcmVjdG9yaWVzOiB7IGltbXV0YWJsZVByaW1hcnk6IHRydWUgfSB9IDoge30pLFxuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNNdWx0aVJvb3RFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUocGxhdGZvcm1Sb290U2NoZW1hLCBBZ2VudEhvc3RDbGF1ZGVNdWx0aVJvb3RFbmFibGVkQ29uZmlnS2V5KSA9PT0gdHJ1ZTtcblx0fVxuXG5cdGdldFByb3RlY3RlZFJlc291cmNlcygpOiBQcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhW10ge1xuXHRcdC8vIEtlcHQgaW4gdGhlIGxpc3QgZXZlbiB3aGVuIG9wdGlvbmFsLCBuZXZlciBkcm9wcGVkOlxuXHRcdC8vIGBhdXRoZW50aWNhdGVQcm90ZWN0ZWRSZXNvdXJjZXNgIG1hdGNoZXMgb24gYHJlc291cmNlYCBhbmQgaWdub3Jlc1xuXHRcdC8vIGByZXF1aXJlZGAsIHNvIGFkdmVydGlzaW5nIGl0IGlzIHdoYXQgbGV0cyB0aGUgaG9zdCBzaWxlbnRseSBmb3J3YXJkIGFcblx0XHQvLyB0b2tlbiB0byBhbiBhbHJlYWR5LXNpZ25lZC1pbiB1c2VyIFx1MjAxNCBhbmQgYWNxdWlyZSB0aGUgcHJveHkgaGFuZGxlXG5cdFx0Ly8gQ29waWxvdC1yb3V0ZWQgbW9kZWxzIG5lZWQgXHUyMDE0IHdpdGhvdXQgZm9yY2luZyBzaWduLWluIG9uIGFueW9uZSBlbHNlLlxuXHRcdGNvbnN0IGNvcGlsb3RSZXNvdXJjZSA9IHRoaXMuX2dpdEh1YkVuZHBvaW50U2VydmljZS5nZXRDb3BpbG90UmVzb3VyY2UoKTtcblx0XHRyZXR1cm4gW1xuXHRcdFx0dGhpcy5faGFzVXNhYmxlTmF0aXZlU2V0dXAoKSA/IHsgLi4uY29waWxvdFJlc291cmNlLCByZXF1aXJlZDogZmFsc2UgfSA6IGNvcGlsb3RSZXNvdXJjZSxcblx0XHRcdHRoaXMuX2dpdEh1YkVuZHBvaW50U2VydmljZS5nZXRSZXBvUmVzb3VyY2UoKSxcblx0XHRdO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmUgdGhlIGFjdGl2ZSB7QGxpbmsgQ2xhdWRlVHJhbnNwb3J0fSBmb3IgYSBzZXNzaW9uLiBUaGUgdHJhbnNwb3J0IGlzXG5cdCAqIGRlcml2ZWQgZnJvbSBgbW9kZWxgIHZpYSB7QGxpbmsgcmVzb2x2ZUNsYXVkZVNlc3Npb25UcmFuc3BvcnR9OiBhXG5cdCAqIG5hdGl2ZS1BbnRocm9waWMgbW9kZWwgcm91dGVzIG5hdGl2ZSBhbmQgYSBDb3BpbG90LXJvdXRlZCBtb2RlbCByb3V0ZXNcblx0ICogcHJveHk7IGEgbW9kZWwtbGVzcyBvciBiYXJlL2xlZ2FjeS1pZCBzZXNzaW9uIGZvbGxvd3MgdGhlIG9uLWRlbWFuZFxuXHQgKiB7QGxpbmsgX2RlZmF1bHRUcmFuc3BvcnRNb2RlfS4gSW4gbmF0aXZlIG1vZGUgdGhlIHRyYW5zcG9ydCBpcyBhbHdheXMgcmVhZHkgKHRoZVxuXHQgKiBTREsgb3ducyBjcmVkZW50aWFscyk7IGluIHByb3hpZWQgbW9kZSBhIHN0YXJ0ZWQgcHJveHkgaGFuZGxlIGlzIHJlcXVpcmVkLFxuXHQgKiBvdGhlcndpc2Uge0BsaW5rIEFIUF9BVVRIX1JFUVVJUkVEfSBpcyB0aHJvd24gc28gdGhlIGNsaWVudCBjYW4gZHJpdmVcblx0ICogQ29waWxvdCBzaWduLWluLlxuXHQgKi9cblx0cHJpdmF0ZSBfZW5zdXJlQXV0aGVudGljYXRlZChtb2RlbD86IE1vZGVsU2VsZWN0aW9uKTogQ2xhdWRlVHJhbnNwb3J0IHtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSByZXNvbHZlQ2xhdWRlU2Vzc2lvblRyYW5zcG9ydCh7XG5cdFx0XHRtb2RlbCxcblx0XHRcdGRlZmF1bHRNb2RlOiB0aGlzLl9kZWZhdWx0VHJhbnNwb3J0TW9kZSgpLFxuXHRcdH0pO1xuXHRcdGlmICh0cmFuc3BvcnQgIT09ICdwcm94eScpIHtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICduYXRpdmUnIH07XG5cdFx0fVxuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX3Byb3h5SGFuZGxlO1xuXHRcdGlmICghaGFuZGxlKSB7XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihcblx0XHRcdFx0QUhQX0FVVEhfUkVRVUlSRUQsXG5cdFx0XHRcdCdBdXRoZW50aWNhdGlvbiBpcyByZXF1aXJlZCB0byB1c2UgQ2xhdWRlJyxcblx0XHRcdFx0dGhpcy5nZXRQcm90ZWN0ZWRSZXNvdXJjZXMoKSxcblx0XHRcdCk7XG5cdFx0fVxuXHRcdHJldHVybiB7IGtpbmQ6ICdwcm94eScsIGhhbmRsZSB9O1xuXHR9XG5cblx0YXN5bmMgYXV0aGVudGljYXRlKHJlc291cmNlOiBzdHJpbmcsIHRva2VuOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAocmVzb3VyY2UgPT09IHRoaXMuX2dpdEh1YkVuZHBvaW50U2VydmljZS5nZXRSZXBvUmVzb3VyY2UoKS5yZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChyZXNvdXJjZSAhPT0gdGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlLmdldENvcGlsb3RSZXNvdXJjZSgpLnJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghdG9rZW4pIHtcblx0XHRcdGNvbnN0IG9sZEhhbmRsZSA9IHRoaXMuX3Byb3h5SGFuZGxlO1xuXHRcdFx0Y29uc3QgY2hhbmdlZCA9IHRoaXMuX2dpdGh1YlRva2VuICE9PSB1bmRlZmluZWQgfHwgb2xkSGFuZGxlICE9PSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9naXRodWJUb2tlbiA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3Byb3h5SGFuZGxlID0gdW5kZWZpbmVkO1xuXHRcdFx0b2xkSGFuZGxlPy5kaXNwb3NlKCk7XG5cdFx0XHRpZiAoY2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLl9tb2RlbHMuc2V0KFtdLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR2b2lkIHRoaXMuX3N0YXJ0TW9kZWxSZWZyZXNoKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oY2hhbmdlZCA/ICdbQ2xhdWRlXSBBdXRoIHRva2VuIGNsZWFyZWQnIDogJ1tDbGF1ZGVdIEF1dGggdG9rZW4gdW5jaGFuZ2VkJyk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Ly8gQSBHaXRIdWIgQ29waWxvdCB0b2tlbiBpcyBhcnJpdmluZyAoc2lnbi1pbikuIEFsd2F5cyBzdGFydCB0aGUgcHJveHkgc28gYVxuXHRcdC8vIHNlc3Npb24gdGhhdCBwaWNrcyBhIENvcGlsb3Qtcm91dGVkIG1vZGVsIGZyb20gdGhlIG1lcmdlZCBjYXRhbG9nIGhhcyBhXG5cdFx0Ly8gc3RhcnRlZCBoYW5kbGUgdG8gcnVuIGFnYWluc3QgXHUyMDE0IGV2ZW4gd2hpbGUgbW9kZWwtbGVzcyBzZXNzaW9ucyBzdGlsbFxuXHRcdC8vIGRlZmF1bHQgdG8gbmF0aXZlLiBQZXItc2Vzc2lvbiByb3V0aW5nIGlzIGRlY2lkZWQgbGF0ZXIgaW5cblx0XHQvLyBgX2Vuc3VyZUF1dGhlbnRpY2F0ZWQobW9kZWwpYDsgdGhlIG1vZGVsLWxlc3MgZGVmYXVsdCByZWFkcyBsaXZlXG5cdFx0Ly8gYXZhaWxhYmlsaXR5IChzZWUge0BsaW5rIF9kZWZhdWx0VHJhbnNwb3J0TW9kZX0pLCBzbyBhY3F1aXJpbmcgdGhlIGhhbmRsZVxuXHRcdC8vIGhlcmUgaXMgYWxsIHRoYXQncyBuZWVkZWQgZm9yIGl0IHRvIHByZWZlciBwcm94eSBhZnRlcndhcmRzLlxuXHRcdC8vXG5cdFx0Ly8gU2hvcnQtY2lyY3VpdCBvbmx5IHdoZW4gdGhlIHRva2VuIGlzIHVuY2hhbmdlZCBBTkQgYSBoYW5kbGUgaXMgYWxyZWFkeVxuXHRcdC8vIGxpdmUuIGBhdXRoZW50aWNhdGVgIHNldHMgYF9naXRodWJUb2tlbmAgYW5kIGBfcHJveHlIYW5kbGVgIHRvZ2V0aGVyIGFuZFxuXHRcdC8vIGNsZWFycyB0aGVtIHRvZ2V0aGVyIChzZWUgdGhlIGZhaWx1cmUgcGF0aCBiZWxvdyksIHNvIHJlcXVpcmluZyB0aGUgaGFuZGxlXG5cdFx0Ly8ga2VlcHMgXCJ1bmNoYW5nZWQsIG5vdGhpbmcgdG8gZG9cIiBob25lc3QgXHUyMDE0IGFuZCByZS1ydW5zIGBzdGFydCgpYCByYXRoZXIgdGhhblxuXHRcdC8vIHNob3J0LWNpcmN1aXRpbmcgaWYgYW55IHBhdGggZXZlciBsZWZ0IGEgdG9rZW4gd2l0aG91dCBpdHMgaGFuZGxlLlxuXHRcdGlmICh0aGlzLl9naXRodWJUb2tlbiA9PT0gdG9rZW4gJiYgdGhpcy5fcHJveHlIYW5kbGUpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbygnW0NsYXVkZV0gQXV0aCB0b2tlbiB1bmNoYW5nZWQnKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHQvLyBBY3F1aXJlIHRoZSBuZXcgaGFuZGxlIEJFRk9SRSBjb21taXR0aW5nIHRoZSB0b2tlbiBvciBkaXNwb3NpbmcgdGhlIG9sZFxuXHRcdC8vIG9uZS4gVGhlIHByb3h5IHNlcnZlcidzIHJlZmNvdW50IHN0YXlzID49IDEgYWNyb3NzIHRoZSBzd2FwIGJlY2F1c2UgdGhlIG5ld1xuXHRcdC8vIGhhbmRsZSBpcyBhY3F1aXJlZCBiZWZvcmUgdGhlIG9sZCBvbmUgaXMgZGlzcG9zZWQ7IHtAbGluayBJQ2xhdWRlUHJveHlTZXJ2aWNlfVxuXHRcdC8vIGFwcGxpZXMgbW9zdC1yZWNlbnQtdG9rZW4td2lucyBvbiBzdWJzZXF1ZW50IGBzdGFydCgpYCBjYWxscy5cblx0XHRsZXQgbmV3SGFuZGxlOiBJQ2xhdWRlUHJveHlIYW5kbGU7XG5cdFx0dHJ5IHtcblx0XHRcdG5ld0hhbmRsZSA9IGF3YWl0IHRoaXMuX2NsYXVkZVByb3h5U2VydmljZS5zdGFydCh0b2tlbik7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBHaXRIdWIgc2lnbi1pbiBpdHNlbGYgc3VjY2VlZGVkOyBvbmx5IHRoZSBDb3BpbG90IHByb3h5IGZhaWxlZCB0b1xuXHRcdFx0Ly8gc3RhcnQuIERvbid0IGZhaWwgc2lnbi1pbiBcdTIwMTQgdGhlIG1lcmdlZCBjYXRhbG9nIHN0aWxsIHNlcnZlcyBhbnkgbmF0aXZlXG5cdFx0XHQvLyBtb2RlbHMsIGFuZCBhIENvcGlsb3Qtcm91dGVkIG1vZGVsIHN1cmZhY2VzIGBBSFBfQVVUSF9SRVFVSVJFRGAgb24gaXRzXG5cdFx0XHQvLyBmaXJzdCBzZW5kICh3aGljaCByZS1kcml2ZXMgc2lnbi1pbiwgcmV0cnlpbmcgYHN0YXJ0KClgKS5cblx0XHRcdC8vXG5cdFx0XHQvLyBBIGxpdmUgaGFuZGxlIGhlcmUgbWVhbnMgdGhpcyB3YXMgYSB0b2tlbiAqcmVwbGFjZW1lbnQqIHdob3NlIG5ld1xuXHRcdFx0Ly8gYHN0YXJ0KClgIGZhaWxlZC4gVGhlIG9sZCBoYW5kbGUgYmFja3MgYSBub3ctc3VwZXJzZWRlZCBhY2NvdW50LCBzbyB0ZWFyXG5cdFx0XHQvLyBpdCBkb3duIHJhdGhlciB0aGFuIGtlZXAgc2lsZW50bHkgc2VydmluZyB0aGF0IHN0YWxlIGFjY291bnQgYmVoaW5kIGFcblx0XHRcdC8vIFwic3VjY2Vzc2Z1bFwiIHNpZ24taW47IGNsZWFyaW5nIHRoZSB0b2tlbiB3aXRoIGl0IHVwaG9sZHMgdGhlXG5cdFx0XHQvLyBgX2dpdGh1YlRva2VuYCBcdTIxOTQgYF9wcm94eUhhbmRsZWAgaW52YXJpYW50IChhIHRva2VuIG5ldmVyIG91dGxpdmVzIGl0c1xuXHRcdFx0Ly8gaGFuZGxlKSBhbmQgbGV0cyB0aGUgbmV4dCBzaWduLWluIHJldHJ5IGBzdGFydCgpYCBpbnN0ZWFkIG9mXG5cdFx0XHQvLyBzaG9ydC1jaXJjdWl0aW5nIGFzIFwidW5jaGFuZ2VkXCIuIEEgZmlyc3Qgc2lnbi1pbiAobm8gaGFuZGxlKSBsZWF2ZXMgYm90aFxuXHRcdFx0Ly8gcmVmcyBhcy1pcyBcdTIwMTQgYWxyZWFkeSBgdW5kZWZpbmVkYCBcdTIwMTQgd2hpY2ggcmV0cmllcyBmb3IgdGhlIHNhbWUgcmVhc29uLlxuXHRcdFx0aWYgKHRoaXMuX3Byb3h5SGFuZGxlKSB7XG5cdFx0XHRcdGNvbnN0IHN0YWxlSGFuZGxlID0gdGhpcy5fcHJveHlIYW5kbGU7XG5cdFx0XHRcdHRoaXMuX3Byb3h5SGFuZGxlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9naXRodWJUb2tlbiA9IHVuZGVmaW5lZDtcblx0XHRcdFx0c3RhbGVIYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHQvLyBEcm9wIHRoZSBzdXBlcnNlZGVkIGFjY291bnQncyBlbnRpdGxlbWVudHM7IHRoZSByZWZyZXNoIGJlbG93IHJlLWxpc3RzXG5cdFx0XHRcdC8vIG5hdGl2ZS1vbmx5IChubyBoYW5kbGUpIGFuZCByZXB1Ymxpc2hlcyB0aGUgcHJvdGVjdGVkIHJlc291cmNlcy5cblx0XHRcdFx0dGhpcy5fbW9kZWxzLnNldChbXSwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybignW0NsYXVkZV0gQ29waWxvdCBwcm94eSBzdGFydCBmYWlsZWQ7IENvcGlsb3Qtcm91dGVkIG1vZGVscyB1bmF2YWlsYWJsZSB1bnRpbCB0aGUgbmV4dCBzaWduLWluJywgZXJyKTtcblx0XHRcdHZvaWQgdGhpcy5fc3RhcnRNb2RlbFJlZnJlc2goKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBvbGRIYW5kbGUgPSB0aGlzLl9wcm94eUhhbmRsZTtcblx0XHR0aGlzLl9wcm94eUhhbmRsZSA9IG5ld0hhbmRsZTtcblx0XHR0aGlzLl9naXRodWJUb2tlbiA9IHRva2VuO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbygnW0NsYXVkZV0gQXV0aCB0b2tlbiB1cGRhdGVkJyk7XG5cdFx0b2xkSGFuZGxlPy5kaXNwb3NlKCk7XG5cdFx0Ly8gQmxhbmsgdGhlIGNhdGFsb2cgb25seSBvbiBhICpyZXBsYWNlbWVudCo6IGEgZGlmZmVyZW50IGFjY291bnQgY2FuIGhhdmVcblx0XHQvLyBkaWZmZXJlbnQgbW9kZWwgZW50aXRsZW1lbnRzLCBzbyBkb24ndCByZXRhaW4gdGhlIHByZXZpb3VzIGxpc3QgaWZcblx0XHQvLyBlbnVtZXJhdGlvbiBmb3IgdGhlIG5ldyB0b2tlbiBmYWlscy5cblx0XHQvL1xuXHRcdC8vIEEgZmlyc3Qgc2lnbi1pbiAobm8gYG9sZEhhbmRsZWApIG11c3QgTk9UIGJsYW5rLiBJdCBoYXMgbm8gc3VwZXJzZWRlZFxuXHRcdC8vIGFjY291bnQgdG8gZHJvcCwgYW5kIHRoZSBjYXRhbG9nIGl0IHdvdWxkIGNsZWFyIGlzIG5hdGl2ZS1vbmx5IFx1MjAxNCB0aGVcblx0XHQvLyBib290c3RyYXAgbGlzdCwgd2hpY2ggaXMgYWNjb3VudC1pbmRlcGVuZGVudCBhbmQgc3RheXMgdmFsaWQuIEJsYW5raW5nXG5cdFx0Ly8gdGhlcmUgcHVibGlzaGVzIGFuIGVtcHR5IGNhdGFsb2cgZm9yIHRoZSBsZW5ndGggb2YgdGhlIHJlZnJlc2gsIHdoaWNoIHRoZVxuXHRcdC8vIHdpbmRvdyBnYXRlIHJlYWRzIGFzIGBTZXNzaW9uVHlwZUF1dGhSZXF1aXJlbWVudC5VbnVzYWJsZWAgKGFuIGFnZW50IHdpdGhcblx0XHQvLyBubyBtb2RlbHMgaXMgdW51c2FibGUpLiBUaGF0IGNsb3NlcyB0aGUgYGFsbG93U2lnbmVkT3V0V2hlblVzYWJsZWAgZ2F0ZVxuXHRcdC8vIG1pZC1zdGFydHVwIGFuZCBmb3JjZXMgdGhlIHNpZ24taW4gZGlhbG9nIG9uIGEgdXNlciB3aG8gaXMgYWxyZWFkeSBzaWduZWRcblx0XHQvLyBpbiBcdTIwMTQgdGhlIEdpdEh1YiBzZXNzaW9uIHJlc29sdmVzIGJlZm9yZSB0aGUgQ29waWxvdCBkZWZhdWx0IGFjY291bnQgZG9lcyxcblx0XHQvLyBzbyB0aGUgd2VsY29tZSBmbG93IHN0aWxsIGJlbGlldmVzIGl0IGlzIHNpZ25lZCBvdXQuXG5cdFx0aWYgKG9sZEhhbmRsZSkge1xuXHRcdFx0dGhpcy5fbW9kZWxzLnNldChbXSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0dm9pZCB0aGlzLl9zdGFydE1vZGVsUmVmcmVzaCgpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIHtAbGluayBJQWdlbnQucmVmcmVzaE1vZGVsc30uIENvYWxlc2NlcyBvbnRvIGFuIGluLWZsaWdodCByZWZyZXNoIGFuZFxuXHQgKiBuZXZlciByZWplY3RzIFx1MjAxNCB7QGxpbmsgX3JlZnJlc2hNb2RlbHN9IGFscmVhZHkgbG9ncyBhbmQgaGFuZGxlcyBmYWlsdXJlLlxuXHQgKlxuXHQgKiBPbmx5IHNhZmUgZm9yIGNhbGxlcnMgd2l0aCBubyBuZXcgaW5wdXQgdG8gYXBwbHkgKHRoZSBob3N0J3MgcGVyaW9kaWNcblx0ICogc2NoZWR1bGVyKS4gVHJpZ2dlcnMgdGhhdCBpbnZhbGlkYXRlIHRoZSBpbi1mbGlnaHQgcmVxdWVzdCBcdTIwMTQgYSByb3RhdGVkXG5cdCAqIHRva2VuLCBhIHRyYW5zcG9ydCBmbGlwIFx1MjAxNCBtdXN0IGNhbGwge0BsaW5rIF9zdGFydE1vZGVsUmVmcmVzaH0gc28gdGhleVxuXHQgKiBhcmUgbm90IGFuc3dlcmVkIGJ5IGEgcmVmcmVzaCBib3VuZCB0byB0aGUgc3VwZXJzZWRlZCBpbnB1dC5cblx0ICovXG5cdHJlZnJlc2hNb2RlbHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsUmVmcmVzaEluRmxpZ2h0ID8/IHRoaXMuX3N0YXJ0TW9kZWxSZWZyZXNoKCk7XG5cdH1cblxuXHQvKipcblx0ICogVW5jb25kaXRpb25hbGx5IGJlZ2lucyBhIHJlZnJlc2gsIHN1cGVyc2VkaW5nIGFueSBpbi1mbGlnaHQgb25lIGFzIHRoZVxuXHQgKiBjb2FsZXNjaW5nIHRhcmdldC4gVGhlIHN1cGVyc2VkZWQgcmVxdWVzdCBzdGF5cyBoYXJtbGVzczogaXRzIG93blxuXHQgKiBzdGFsZS13cml0ZSBndWFyZCBkcm9wcyB0aGUgcmVzdWx0IGlmIHRoZSB0b2tlbiBvciB0cmFuc3BvcnQgbW92ZWQgb24uXG5cdCAqL1xuXHRwcml2YXRlIF9zdGFydE1vZGVsUmVmcmVzaCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZWZyZXNoID0gdGhpcy5fcmVmcmVzaE1vZGVscygpLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX21vZGVsUmVmcmVzaEluRmxpZ2h0ID09PSByZWZyZXNoKSB7XG5cdFx0XHRcdHRoaXMuX21vZGVsUmVmcmVzaEluRmxpZ2h0ID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX21vZGVsUmVmcmVzaEluRmxpZ2h0ID0gcmVmcmVzaDtcblx0XHRyZXR1cm4gcmVmcmVzaDtcblx0fVxuXG5cdC8qKlxuXHQgKiBFbnVtZXJhdGUgYm90aCBwcm92aWRlcnMnIGNhdGFsb2dzIGluIHBhcmFsbGVsIGFuZCBwdWJsaXNoIHRoZW0gYXMgb25lXG5cdCAqIHByb3ZpZGVyLXF1YWxpZmllZCBsaXN0IHZpYSB7QGxpbmsgbWVyZ2VDbGF1ZGVNb2RlbENhdGFsb2dzfS4gRWFjaCBzb3VyY2UgaXNcblx0ICogb3B0aW9uYWwgXHUyMDE0IHRoZSBwcm94eSBjYXRhbG9nIG5lZWRzIGEgR2l0SHViIHRva2VuLCB0aGUgbmF0aXZlIGNhdGFsb2cgbmVlZHMgYVxuXHQgKiBsb2NhbCBDbGF1ZGUgc2V0dXAgXHUyMDE0IHNvIGEgc291cmNlIHdlIGNhbid0IGF0dGVtcHQgY29udHJpYnV0ZXMgYW4gZW1wdHkgbGlzdFxuXHQgKiByYXRoZXIgdGhhbiBmYWlsaW5nIHRoZSB3aG9sZSByZWZyZXNoLiB7QGxpbmsgUHJvbWlzZS5hbGxTZXR0bGVkfSB0b2xlcmF0ZXNcblx0ICogb25lIHNvdXJjZSBlcnJvcmluZzsgb25seSB3aGVuICpldmVyeSogc291cmNlIHdlIGF0dGVtcHRlZCBmYWlscyBkbyB3ZSBrZWVwXG5cdCAqIHRoZSBsYXN0IGtub3duLWdvb2QgY2F0YWxvZyBpbnN0ZWFkIG9mIGJsYW5raW5nLCBzbyBhIHRyYW5zaWVudCBkb3VibGVcblx0ICogZmFpbHVyZSBuZXZlciB3aXBlcyB0aGUgcGlja2VyLlxuXHQgKlxuXHQgKiBHYXRpbmcgdGhlIG5hdGl2ZSBoYWxmIG9uIHtAbGluayBkZXRlY3RFeGlzdGluZ0NsYXVkZVNldHVwfSBpcyBkZWxpYmVyYXRlIGFuZFxuXHQgKiBsb2FkLWJlYXJpbmcsIG5vdCBqdXN0IGFuIG9wdGltaXphdGlvbi4gYHN1cHBvcnRlZE1vZGVscygpYCByZXR1cm5zIGEgKnN0YXRpYypcblx0ICogbGlzdCBvZiBtb2RlbHMgdGhlIFNESyB1bmRlcnN0YW5kcyBcdTIwMTQgaXQgaXMgbm90IGFuIGVudGl0bGVtZW50IG9yIGNyZWRlbnRpYWxcblx0ICogY2hlY2ssIGFuZCBpdCBhbnN3ZXJzIGV2ZW4gd2l0aCBubyBgQU5USFJPUElDX0FQSV9LRVlgLCBub1xuXHQgKiBgQ0xBVURFX0NPREVfT0FVVEhfVE9LRU5gIGFuZCBhbiBlbXB0eSBgSE9NRWAuIFB1Ymxpc2hpbmcgaXQgdW5jb25kaXRpb25hbGx5XG5cdCAqIHdvdWxkIGFkdmVydGlzZSBtb2RlbHMgZm9yIGFuIGFnZW50IHRoYXQgY2Fubm90IHNlcnZlIGEgc2luZ2xlIHJlcXVlc3QsIHdoaWNoXG5cdCAqIHJlYWRzIGRvd25zdHJlYW0gYXMgXCJ1c2FibGUgd2l0aG91dCBHaXRIdWJcIiBhbmQgd291bGQgaG9sZCB0aGUgQWdlbnRzIHdpbmRvd1xuXHQgKiBvcGVuIG9uIGFuIGFnZW50IHRoYXQgZmFpbHMgb24gaXRzIGZpcnN0IHR1cm4uIEFuIGVtcHR5IGNhdGFsb2cgaXMgdGhlIGhvbmVzdFxuXHQgKiBzaWduYWw6IGl0IHN1cmZhY2VzIGFzIFwibm8gbW9kZWxzXCIgKGBTZXNzaW9uVHlwZUF1dGhSZXF1aXJlbWVudC5VbnVzYWJsZWApXG5cdCAqIHJhdGhlciB0aGFuIGEgc2lnbi1pbiBwcm9tcHQgdGhhdCB3b3VsZCBub3QgaGVscC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3JlZnJlc2hNb2RlbHMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdG9rZW5BdFN0YXJ0ID0gdGhpcy5fZ2l0aHViVG9rZW47XG5cdFx0Y29uc3QgaGFzTmF0aXZlU2V0dXAgPSBkZXRlY3RFeGlzdGluZ0NsYXVkZVNldHVwKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS51c2VySG9tZS5mc1BhdGgpO1xuXHRcdGNvbnN0IFtwcm94eU91dGNvbWUsIG5hdGl2ZU91dGNvbWVdID0gYXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKFtcblx0XHRcdHRva2VuQXRTdGFydCA/IHRoaXMuX2ZldGNoUHJveHlNb2RlbHModG9rZW5BdFN0YXJ0KSA6IFByb21pc2UucmVzb2x2ZTxyZWFkb25seSBJQWdlbnRNb2RlbEluZm9bXT4oW10pLFxuXHRcdFx0aGFzTmF0aXZlU2V0dXAgPyB0aGlzLl9mZXRjaE5hdGl2ZU1vZGVscygpIDogUHJvbWlzZS5yZXNvbHZlPHJlYWRvbmx5IElBZ2VudE1vZGVsSW5mb1tdPihbXSksXG5cdFx0XSk7XG5cdFx0Ly8gU3RhbGUtd3JpdGUgZ3VhcmQ6IGEgbmV3ZXIgcmVmcmVzaCBzdXBlcnNlZGVkIHRoaXMgb25lIHdoaWxlIHdlIHdlcmVcblx0XHQvLyBhd2FpdGluZyBcdTIwMTQgdGhlIHByb3h5IHRva2VuIHJvdGF0ZWQgKHNpZ24taW4gLyBzaWduLW91dCkuIEEgbWVyZ2VkIHdyaXRlXG5cdFx0Ly8gaGVyZSB3b3VsZCBjbG9iYmVyIHRoZSBjYXRhbG9nIHRoYXQgbmV3ZXIgcmVmcmVzaCBwdWJsaXNoZWQuXG5cdFx0aWYgKHRoaXMuX2dpdGh1YlRva2VuICE9PSB0b2tlbkF0U3RhcnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYXR0ZW1wdGVkID0gKHRva2VuQXRTdGFydCA/IDEgOiAwKSArIChoYXNOYXRpdmVTZXR1cCA/IDEgOiAwKTtcblx0XHRjb25zdCBmYWlsZWQgPSAocHJveHlPdXRjb21lLnN0YXR1cyA9PT0gJ3JlamVjdGVkJyA/IDEgOiAwKSArIChuYXRpdmVPdXRjb21lLnN0YXR1cyA9PT0gJ3JlamVjdGVkJyA/IDEgOiAwKTtcblx0XHRpZiAoYXR0ZW1wdGVkID4gMCAmJiBmYWlsZWQgPT09IGF0dGVtcHRlZCkge1xuXHRcdFx0Ly8gRXZlcnkgc291cmNlIHdlIGF0dGVtcHRlZCBmYWlsZWQgXHUyMDE0IGtlZXAgdGhlIGxhc3Qga25vd24tZ29vZCBjYXRhbG9nXG5cdFx0XHQvLyByYXRoZXIgdGhhbiBibGFua2luZy4gU291cmNlcyB3ZSBkaWRuJ3QgYXR0ZW1wdCByZXNvbHZlIGZ1bGZpbGxlZC1lbXB0eVxuXHRcdFx0Ly8gYW5kIGFyZSBub3QgY291bnRlZCBhcyBmYWlsdXJlcy5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tDbGF1ZGVdIEFsbCBhdHRlbXB0ZWQgbW9kZWwgc291cmNlcyBmYWlsZWQgKG1lcmdlZCByZWZyZXNoKTsga2VlcGluZyBsYXN0IGtub3duLWdvb2QgY2F0YWxvZycpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBVbndyYXAgZWFjaCBzZXR0bGVkIGZldGNoOiBpdHMgbW9kZWxzIG9uIHN1Y2Nlc3MsIG9yIGFuIGVtcHR5IGxpc3Qgb25cblx0XHQvLyByZWplY3Rpb24gKGxvZ2dlZCkgc28gdGhlIG90aGVyIHByb3ZpZGVyJ3MgY2F0YWxvZyBzdGlsbCBwdWJsaXNoZXMuXG5cdFx0Y29uc3Qgc2V0dGxlZENhdGFsb2cgPSAob3V0Y29tZTogUHJvbWlzZVNldHRsZWRSZXN1bHQ8cmVhZG9ubHkgSUFnZW50TW9kZWxJbmZvW10+LCBsYWJlbDogc3RyaW5nKTogcmVhZG9ubHkgSUFnZW50TW9kZWxJbmZvW10gPT4ge1xuXHRcdFx0aWYgKG91dGNvbWUuc3RhdHVzID09PSAnZnVsZmlsbGVkJykge1xuXHRcdFx0XHRyZXR1cm4gb3V0Y29tZS52YWx1ZTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3Iob3V0Y29tZS5yZWFzb24sIGBbQ2xhdWRlXSBGYWlsZWQgdG8gZmV0Y2ggJHtsYWJlbH0gbW9kZWxzIChtZXJnZWQgcmVmcmVzaCk7IGtlZXBpbmcgdGhlIG90aGVyIHByb3ZpZGVyYCk7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fTtcblx0XHRjb25zdCBwcm94eU1vZGVscyA9IHNldHRsZWRDYXRhbG9nKHByb3h5T3V0Y29tZSwgJ3Byb3h5Jyk7XG5cdFx0Y29uc3QgbmF0aXZlTW9kZWxzID0gc2V0dGxlZENhdGFsb2cobmF0aXZlT3V0Y29tZSwgJ25hdGl2ZScpO1xuXHRcdGNvbnN0IG1lcmdlZCA9IG1lcmdlQ2xhdWRlTW9kZWxDYXRhbG9ncyhwcm94eU1vZGVscywgbmF0aXZlTW9kZWxzKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDbGF1ZGVdIE1vZGVscyByZWZyZXNoZWQgKG1lcmdlZCkuIENvdW50OiAke21lcmdlZC5sZW5ndGh9LCAke21lcmdlZC5tYXAobSA9PiBtLm5hbWUpLmpvaW4oJywgJyl9YCk7XG5cdFx0dGhpcy5fbW9kZWxzLnNldChtZXJnZWQsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHQvKipcblx0ICogTmF0aXZlIChCWU8tQW50aHJvcGljKSBtb2RlbCBzb3VyY2U6IGVudW1lcmF0ZSB0aGUgU0RLJ3MgYnVpbHQtaW4gL1xuXHQgKiBzdWJzY3JpcHRpb24gbW9kZWxzIGJ5IG9wZW5pbmcgYSB0aHJvd2F3YXkge0BsaW5rIElDbGF1ZGVBZ2VudFNka1NlcnZpY2UucXVlcnl9XG5cdCAqICh3b3Jrc3BhY2UtZnJlZSBvcHRpb25zIHRoYXQgcmVhZCB0aGUgdXNlcidzIHJlYWwgYH4vLmNsYXVkZWAgY29uZmlnKSBhbmRcblx0ICogY2FsbGluZyBgUXVlcnkuc3VwcG9ydGVkTW9kZWxzKClgIG9uIGl0LCB0aGVuIGBjbG9zZSgpYC4gVGhlIHByb21wdCBuZXZlclxuXHQgKiB5aWVsZHMsIHNvIG5vIHR1cm4gcnVucyBhbmQgbm8gc2Vzc2lvbiB0cmFuc2NyaXB0IGlzIHdyaXR0ZW4gKHZlcmlmaWVkXG5cdCAqIFBoYXNlIDE5IEUyRSkuIFByb2plY3RlZCB3aXRoIG5vIGNvbW1lcmNpYWwgbWV0YWRhdGEsIG1pbnVzIHRoZSBTREsnc1xuXHQgKiB7QGxpbmsgaXNTZGtEZWZhdWx0TW9kZWx9IGFsaWFzIHJvdy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2ZldGNoTmF0aXZlTW9kZWxzKCk6IFByb21pc2U8cmVhZG9ubHkgSUFnZW50TW9kZWxJbmZvW10+IHtcblx0XHQvLyBBIHByb21wdCBpdGVyYWJsZSB0aGF0IG5ldmVyIHlpZWxkczogZW51bWVyYXRpb24gb25seSBuZWVkcyB0aGVcblx0XHQvLyBjb250cm9sLXJlcXVlc3QgY2hhbm5lbCAoYFF1ZXJ5LnN1cHBvcnRlZE1vZGVscygpYCksIG5vdCBhIHJlYWwgdHVybi5cblx0XHRjb25zdCBuZXZlcllpZWxkaW5nUHJvbXB0OiBBc3luY0l0ZXJhYmxlPFNES1VzZXJNZXNzYWdlPiA9IHtcblx0XHRcdFtTeW1ib2wuYXN5bmNJdGVyYXRvcl06ICgpID0+ICh7IG5leHQ6ICgpID0+IG5ldyBQcm9taXNlPEl0ZXJhdG9yUmVzdWx0PFNES1VzZXJNZXNzYWdlPj4oKCkgPT4geyAvKiBuZXZlciByZXNvbHZlcyAqLyB9KSB9KSxcblx0XHR9O1xuXHRcdGNvbnN0IG9wdGlvbnMgPSBidWlsZE1vZGVsRW51bWVyYXRpb25PcHRpb25zKCk7XG5cdFx0Y29uc3QgcXVlcnkgPSBhd2FpdCB0aGlzLl9zZGtTZXJ2aWNlLnF1ZXJ5KHsgcHJvbXB0OiBuZXZlcllpZWxkaW5nUHJvbXB0LCBvcHRpb25zIH0pO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBhd2FpdCBxdWVyeS5zdXBwb3J0ZWRNb2RlbHMoKTtcblx0XHRcdHJldHVybiBtb2RlbHNcblx0XHRcdFx0LmZpbHRlcihtID0+ICFpc1Nka0RlZmF1bHRNb2RlbChtKSlcblx0XHRcdFx0Lm1hcChtID0+IGZyb21TZGtNb2RlbEluZm8obSwgdGhpcy5pZCkpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHQvLyBgY2xvc2UoKWAgdGVybWluYXRlcyB0aGUgc3VicHJvY2VzczsgYWJvcnRpbmcgdGhlIGNvbnRyb2xsZXIgaXMgYVxuXHRcdFx0Ly8gYmVsdC1hbmQtc3VzcGVuZGVycyB0ZWFyZG93biBmb3IgYW55dGhpbmcgYGNsb3NlKClgIGxlYXZlcyBwZW5kaW5nLlxuXHRcdFx0cXVlcnkuY2xvc2UoKTtcblx0XHRcdG9wdGlvbnMuYWJvcnRDb250cm9sbGVyPy5hYm9ydCgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBQcm94aWVkIChDb3BpbG90LUNBUEkpIG1vZGVsIHNvdXJjZTogZmV0Y2ggdmlhIHtAbGluayBJQ29waWxvdEFwaVNlcnZpY2V9LFxuXHQgKiBrZWVwIHRoZSBDbGF1ZGUgZmFtaWx5LCBhbmQgc3VyZmFjZSB0aGUgQ0FQSS1mbGFnZ2VkIGNoYXQtZGVmYXVsdCBmaXJzdC5cblx0ICogVGhlIHBpY2tlciB0cmVhdHMgYG1vZGVsc1swXWAgYXMgdGhlIGRlIGZhY3RvIGRlZmF1bHQgKG1vZGVsUGlja2VyLnRzOjE0NFxuXHQgKiBcdTIwMTQgYF9zZWxlY3RlZE1vZGVsID8/IG1vZGVsc1swXWApIHNpbmNlIGBJQWdlbnRNb2RlbEluZm9gIGNhcnJpZXMgbm9cblx0ICogZXhwbGljaXQgYGlzRGVmYXVsdGAgYml0OyB0aGUgc3RhYmxlIGNvbXBhcmF0b3IgcmV0dXJucyAwIGZvciBlcXVhbC1cblx0ICogcHJpb3JpdHkgbW9kZWxzIHNvIENBUEkncyBvcmRlcmluZyB3aW5zIG9uIHRpZXMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9mZXRjaFByb3h5TW9kZWxzKHRva2VuOiBzdHJpbmcpOiBQcm9taXNlPHJlYWRvbmx5IElBZ2VudE1vZGVsSW5mb1tdPiB7XG5cdFx0Y29uc3QgdXNlckFnZW50ID0gYCR7VVNFUl9BR0VOVF9QUkVGSVh9LyR7dGhpcy5fcHJvZHVjdFNlcnZpY2UudmVyc2lvbn1gO1xuXHRcdGNvbnN0IGFsbCA9IGF3YWl0IHRoaXMuX2NvcGlsb3RBcGlTZXJ2aWNlLm1vZGVscyh0b2tlbiwgeyBoZWFkZXJzOiB7ICdVc2VyLUFnZW50JzogdXNlckFnZW50IH0sIHN1cHByZXNzSW50ZWdyYXRpb25JZDogdHJ1ZSB9KTtcblx0XHRyZXR1cm4gYWxsXG5cdFx0XHQuZmlsdGVyKGlzQ2xhdWRlTW9kZWwpXG5cdFx0XHQuc29ydCgoYSwgYikgPT4gTnVtYmVyKGIuaXNfY2hhdF9kZWZhdWx0KSAtIE51bWJlcihhLmlzX2NoYXRfZGVmYXVsdCkpXG5cdFx0XHQubWFwKG0gPT4gdG9BZ2VudE1vZGVsSW5mbyhtLCB0aGlzLmlkKSk7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBDaGF0IHRydW5jYXRpb24sIHBlcm1pc3Npb24vZWxpY2l0YXRpb24gYnJpZGdlcywgY2hhdCBzdXJmYWNlXG5cblx0LyoqXG5cdCAqIFNlZWQgdGhlIGVhZ2VybHktY2xhaW1lZCBhY3RpdmUgY2xpZW50ICh0b29scyArIGN1c3RvbWl6YXRpb25zKSBpbnRvIHRoZVxuXHQgKiBTREsgYXQgY2hhdCBjcmVhdGlvbiwgbWlycm9yaW5nIHRoZSBDb3BpbG90IGFnZW50LiBSdW5zIGZvciBmcmVzaCBBTkRcblx0ICogcmUtY3JlYXRlZCBjaGF0czogd2hlbiB0aGUgd29ya2JlbmNoIHNlc3Npb24gc3RhdGUgYWxyZWFkeSBjYXJyaWVzIHRoZVxuXHQgKiBhY3RpdmUgY2xpZW50LCBubyBmb2xsb3ctdXAgYHNlc3Npb24vYWN0aXZlQ2xpZW50U2V0YCBpcyBkaXNwYXRjaGVkIHRvXG5cdCAqIHRyaWdnZXIgdGhlIGN1c3RvbWl6YXRpb24gc3luYywgc28gdGhlIGJ1aWx0LWluIHNraWxscyBidW5kbGUgd291bGQgbmV2ZXJcblx0ICogcmVhY2ggQ2xhdWRlIG90aGVyd2lzZS4gUHJvZ3Jlc3MgaXMgc3VwcHJlc3NlZCAoYHF1aWV0YCkgYmVjYXVzZSB0aGUgQUhcblx0ICogc2VydmljZSBtYXkgbm90IGhhdmUgY3JlYXRlZCB0aGUgc2Vzc2lvbiBzdGF0ZSB5ZXQgXHUyMDE0IGFcblx0ICogYFNlc3Npb25DdXN0b21pemF0aW9uVXBkYXRlZGAgZW52ZWxvcGUgd291bGQgYmUgb3JwaGFuZWQ7IHRoZSBjb21wbGV0ZWRcblx0ICogc25hcHNob3QgaXMgcHJvdmlkZWQgdmlhIGBnZXRDaGF0Q3VzdG9taXphdGlvbnNgIGltbWVkaWF0ZWx5IGFmdGVyLlxuXHQgKlxuXHQgKiBUaGUgY2xpZW50J3MgY29udHJpYnV0aW9uIGlzIGFkZHJlc3NlZCB0byBleGFjdGx5IHRoZSBjaGF0IHRoaXMgY2FsbFxuXHQgKiBwcm92aXNpb25lZC4gQSBzaWJsaW5nIGNoYXQgb2YgdGhlIHNhbWUgc2Vzc2lvbiBuZXZlciBpbmhlcml0cyBpdCBcdTIwMTRcblx0ICogQWdlbnQgSG9zdCBhZGRyZXNzZXMgdGhhdCBjaGF0IHdpdGggaXRzIG93biBgZ2V0T3JDcmVhdGVBY3RpdmVDbGllbnRgXG5cdCAqIGNhbGwgb24gdGhlIG5leHQgYHNlc3Npb24vYWN0aXZlQ2xpZW50U2V0YCAvIGBzZXNzaW9uL2NoYXRBZGRlZGAgZmFuLW91dC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3NlZWRFYWdlckFjdGl2ZUNsaWVudChjaGF0OiBVUkksIGNvbnRleHQ6IElBZ2VudENoYXRDb250ZXh0LCBhY3RpdmVDbGllbnQ6IElBZ2VudENyZWF0ZUNoYXRPcHRpb25zWydhY3RpdmVDbGllbnQnXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghYWN0aXZlQ2xpZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFRoZSBob3N0IGhhcyBwdWJsaXNoZWQgbm8gY3VzdG9taXphdGlvbiBzbmFwc2hvdCBmb3IgYSBzZXNzaW9uIGl0IGlzXG5cdFx0Ly8gc3RpbGwgY3JlYXRpbmcsIHNvIG5vbmUgaXMgcGFzc2VkIGhlcmUgXHUyMDE0IGRlbGliZXJhdGVseSBkaXN0aW5jdCBmcm9tXG5cdFx0Ly8gcHVibGlzaGluZyBhbiBlbXB0eSBsaXN0LlxuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuZ2V0T3JDcmVhdGVBY3RpdmVDbGllbnQoY2hhdCwgY29udGV4dCwgeyBjbGllbnRJZDogYWN0aXZlQ2xpZW50LmNsaWVudElkLCBkaXNwbGF5TmFtZTogYWN0aXZlQ2xpZW50LmRpc3BsYXlOYW1lIH0pO1xuXHRcdGhhbmRsZS50b29scyA9IGFjdGl2ZUNsaWVudC50b29scztcblx0XHRpZiAoYWN0aXZlQ2xpZW50LmN1c3RvbWl6YXRpb25zICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuc3luY0NsaWVudEN1c3RvbWl6YXRpb25zKGNoYXQsIGNvbnRleHQsIGFjdGl2ZUNsaWVudC5jbGllbnRJZCwgYWN0aXZlQ2xpZW50LmN1c3RvbWl6YXRpb25zLCB7IHF1aWV0OiB0cnVlIH0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBJbi1wbGFjZSBcIlJlc3RvcmUgQ2hlY2twb2ludFwiIHRydW5jYXRpb24uIEtlZXBzIHR1cm5zXG5cdCAqIGBbMC4udHVybklkXWAgSU5DTFVTSVZFIChvciByZW1vdmVzIGFsbCB0dXJucyB3aGVuIGB0dXJuSWRgIGlzXG5cdCAqIG9taXR0ZWQpIG9uIHRoZSAqKnNhbWUqKiBzZXNzaW9uIGlkIC8gVVJJIFx1MjAxNCB1bmxpa2UgZm9yaywgd2hpY2ggbWludHMgYVxuXHQgKiBuZXcgaWQuIFRoZSBgdHVybklkYCBwYXRoIHJlc29sdmVzIHRoZSBwcm90b2NvbCB0dXJuIHRvIGl0cyBTREtcblx0ICogYXNzaXN0YW50LWVudmVsb3BlIHV1aWQgKHtAbGluayByZXNvbHZlRm9ya0FuY2hvclV1aWR9KSBhbmQgc3RhZ2VzIGl0XG5cdCAqIGFzIGEgb25lLXNob3QgYHJlc3VtZVNlc3Npb25BdGAgYW5jaG9yIHRoYXQgdGhlIG5leHQgdHVybidzIHJlYnVpbGRcblx0ICogYXBwbGllcyAodGhlIHRydW5jYXRpb24gZmluYWxpemVzIHdoZW4gdGhlIG5leHQgdHVybiB3cml0ZXMgdGhlXG5cdCAqIGJyYW5jaCkuIFNlcmlhbGl6ZWQgb24ge0BsaW5rIF9zZXNzaW9uU2VxdWVuY2VyfSAoc2FtZSBrZXkgYXNcblx0ICogYHNlbmRNZXNzYWdlYCkgc28gdGhlIGBDaGF0VHJ1bmNhdGVkYCBcdTIxOTIgYENoYXRUdXJuU3RhcnRlZGAgZGlzcGF0Y2ggcGFpclxuXHQgKiBzdGF5cyBvcmRlcmVkLiBQcm92aXNpb25hbCBzZXNzaW9ucyBzaG9ydC1jaXJjdWl0LlxuXHQgKlxuXHQgKiBUaGUgb3duaW5nIHNlc3Npb24gY29tZXMgZnJvbSBgY29udGV4dGAgbGlrZSBldmVyeSBvdGhlciBhZGRyZXNzZWQgY2hhdFxuXHQgKiBvcGVyYXRpb24sIHNvIHRoZSBzZXNzaW9uLXNoYXBlZCBmaXJzdCBwYXJhbWV0ZXIgaXMgdW51c2VkLlxuXHQgKi9cblx0YXN5bmMgdHJ1bmNhdGVDaGF0KGNoYXQ6IFVSSSwgdHVybklkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGNvbnRleHQ/OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghY29udGV4dCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbQ2xhdWRlXSB0cnVuY2F0ZUNoYXQgcmVxdWlyZXMgaG9zdCBjaGF0IGNvbnRleHQgZm9yICR7Y2hhdC50b1N0cmluZygpfWApO1xuXHRcdH1cblx0XHRjb25zdCBpbml0aWFsQ29udGV4dCA9IHRoaXMuX3Jlc29sdmVDaGF0Q29udGV4dChjaGF0LCBjb250ZXh0KTtcblx0XHRhd2FpdCB0aGlzLl9zZXNzaW9uU2VxdWVuY2VyLnF1ZXVlKGluaXRpYWxDb250ZXh0LnNlcXVlbmNlcktleSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX3Jlc29sdmVDaGF0Q29udGV4dChjaGF0LCBjb250ZXh0KTtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gY3VycmVudC50YXJnZXQ7XG5cdFx0XHRjb25zdCBzZGtTZXNzaW9uSWQgPSBjdXJyZW50LnNka1Nlc3Npb25JZDtcblx0XHRcdGlmICghc2RrU2Vzc2lvbklkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHRydW5jYXRlIGNoYXQgJHtjaGF0LnRvU3RyaW5nKCl9OiBiYWNraW5nIFNESyBzZXNzaW9uIG5vdCBmb3VuZGApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGV4aXN0aW5nICYmICFleGlzdGluZy5pc1BpcGVsaW5lUmVhZHkpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ2xhdWRlOiR7c2RrU2Vzc2lvbklkfV0gdHJ1bmNhdGVDaGF0IG9uIGEgcHJvdmlzaW9uYWwgY2hhdCBcdTIwMTQgbm90aGluZyB0byB0cnVuY2F0ZWApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0dXJuSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9yZW1vdmVBbGxUdXJucyhjdXJyZW50LCBzZGtTZXNzaW9uSWQsIGV4aXN0aW5nKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtZXNzYWdlcyA9IGF3YWl0IHRoaXMuX3Nka1NlcnZpY2UuZ2V0U2Vzc2lvbk1lc3NhZ2VzKHNka1Nlc3Npb25JZCwgeyBpbmNsdWRlU3lzdGVtTWVzc2FnZXM6IHRydWUgfSk7XG5cdFx0XHRjb25zdCBhbmNob3IgPSByZXNvbHZlRm9ya0FuY2hvclV1aWQobWVzc2FnZXMsIHR1cm5JZCk7XG5cdFx0XHRpZiAoYW5jaG9yID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgdHJ1bmNhdGUgc2Vzc2lvbiAke3Nka1Nlc3Npb25JZH06IHR1cm4gJHt0dXJuSWR9IG5vdCBmb3VuZCBpbiB0cmFuc2NyaXB0YCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE9wZXJhdGUgb24gYSBsaXZlIHNlc3Npb247IGNvbGQtcmVzdW1lIGFuIHVubG9hZGVkIG9uZSBmaXJzdCBzb1xuXHRcdFx0Ly8gdGhlcmUgaXMgYSBzaW5nbGUgY29kZSBwYXRoIHRoYXQgc2V0cyB0aGUgYW5jaG9yIG9uIGEgbGl2ZVxuXHRcdFx0Ly8gcGlwZWxpbmUgKHRoZSBuZXh0IHNlbmQgYXBwbGllcyBpdCkuXG5cdFx0XHRjb25zdCBsaXZlID0gZXhpc3RpbmcgPz8gYXdhaXQgdGhpcy5fZW5zdXJlUmVzb2x2ZWRDaGF0U2Vzc2lvbihjdXJyZW50KTtcblx0XHRcdGF3YWl0IGxpdmUudHJ1bmNhdGVUb1R1cm4odHVybklkLCBhbmNob3IsIGN1cnJlbnQucmVzb3VyY2UpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ2xhdWRlOiR7c2RrU2Vzc2lvbklkfV0gdHJ1bmNhdGVDaGF0IGtlcHQgWzAuLiR7dHVybklkfV0gKGFuY2hvcj0ke2FuY2hvcn0pYCk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlLWFsbCAoXCJzdGFydCBvdmVyXCIpIGJyYW5jaCBvZiB7QGxpbmsgdHJ1bmNhdGVDaGF0fTogdGhlcmUgaXMgbm9cblx0ICogYW5jaG9yIHRvIHJlc3VtZSBhdCwgc28gdGVhciBkb3duIHRoZSBsaXZlIFF1ZXJ5LCBkZWxldGUgdGhlIG9uLWRpc2tcblx0ICogdHJhbnNjcmlwdCB2aWEgdGhlIFNESywgdGhlbiByZWNyZWF0ZSBhIGZyZXNoIHByb3Zpc2lvbmFsIGJvdW5kIHRvIHRoZVxuXHQgKiBTQU1FIGNoYXQgYW5kIFNESyBpZCwgc28gdGhlIG5leHQgYHNlbmRNZXNzYWdlYCBtYXRlcmlhbGl6ZXMgbm9uLXJlc3VtZVxuXHQgKiBgeyBzZXNzaW9uSWQgfWAgb24gYSBjbGVhbiB0cmFuc2NyaXB0LiBgZGVsZXRlU2Vzc2lvbmAgaXMgZWFnZXJseSBkdXJhYmxlXG5cdCAqICh1bmxpa2UgdGhlIGxhenkgYHR1cm5JZGAgcGF0aCksIG1hdGNoaW5nIGl0cyBcImNsZWFyIC8gc3RhcnQgb3ZlclwiXG5cdCAqIHNlbWFudGljLiBgZXhpc3RpbmdgIGlzIHRoZSBsaXZlIHNlc3Npb24sIG9yIGB1bmRlZmluZWRgIG9uIHRoZSBjb2xkIHBhdGhcblx0ICogKHVubG9hZGVkIGNoYXQpLlxuXHQgKlxuXHQgKiBUaGUgU0RLJ3Mgb3duIHJlY29yZCBpcyByZWFkIEJFRk9SRSB0aGUgZGVsZXRlIHNvIHRoZSBjb2xkIHBhdGggc3RpbGxcblx0ICogcmVjb3ZlcnMgdGhlIHdvcmtpbmcgZGlyZWN0b3J5IHRoZSByZWNyZWF0ZWQgY29udmVyc2F0aW9uIG5lZWRzIFx1MjAxNCBhZnRlclxuXHQgKiBgZGVsZXRlU2Vzc2lvbmAgdGhlIHRyYW5zY3JpcHQgKGFuZCBpdHMgYGN3ZGApIG1heSBiZSBnb25lLiBDYWxsZXJcblx0ICogc2VyaWFsaXplcyBvbiB7QGxpbmsgX3Nlc3Npb25TZXF1ZW5jZXJ9LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVtb3ZlQWxsVHVybnMoY29udGV4dDogSVJlc29sdmVkQ2xhdWRlQ2hhdENvbnRleHQsIHNka1Nlc3Npb25JZDogc3RyaW5nLCBleGlzdGluZzogQ2xhdWRlQWdlbnRTZXNzaW9uIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgaW5mbyA9IGV4aXN0aW5nID8gdW5kZWZpbmVkIDogYXdhaXQgdGhpcy5fc2RrU2VydmljZS5nZXRTZXNzaW9uSW5mbyhzZGtTZXNzaW9uSWQpO1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcmllcyA9IGV4aXN0aW5nPy53b3JraW5nRGlyZWN0b3JpZXNcblx0XHRcdD8/IChpbmZvPy5jd2QgPyBbVVJJLmZpbGUoaW5mby5jd2QpXSA6IHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgZXhpc3Rpbmc/LnNodXRkb3duTGl2ZVF1ZXJ5KCk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHR0aGlzLl9kZWxldGVTZXNzaW9uKGV4aXN0aW5nKTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5fc2RrU2VydmljZS5kZWxldGVTZXNzaW9uKHNka1Nlc3Npb25JZCk7XG5cdFx0Y29uc3QgZnJlc2ggPSBhd2FpdCB0aGlzLl9jcmVhdGVQcm92aXNpb25hbENoYXRTZXNzaW9uKGNvbnRleHQuY29uZmlndXJhdGlvblJlc291cmNlLCBjb250ZXh0LmNoYXQsIGNvbnRleHQucmVzb3VyY2UsIHdvcmtpbmdEaXJlY3Rvcmllcyk7XG5cdFx0YXdhaXQgZnJlc2gucHJ1bmVBbGxUdXJucyhjb250ZXh0LnJlc291cmNlKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDbGF1ZGU6JHtzZGtTZXNzaW9uSWR9XSB0cnVuY2F0ZUNoYXQgcmVtb3ZlZCBhbGwgdHVybnMgKGRlbGV0ZVNlc3Npb24gKyBmcmVzaCBzYW1lLWlkKWApO1xuXHR9XG5cblx0Ly8gLS0tLSBDaGF0IHN1cmZhY2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdC8vXG5cdC8vIGBjaGF0c2AgZXhwb3NlcyB0aGUgcGVyLWNoYXQgb3BlcmF0aW9ucyBhZGRyZXNzZWQgYnkgYSBzaW5nbGUsIGNvbmNyZXRlXG5cdC8vIGNoYXQgY2hhbm5lbCBVUkkuIEV2ZXJ5IGNoYXQncyBTREsgaWQgY29tZXMgZnJvbSB0aGUgaG9zdC1ib3VuZFxuXHQvLyBwcm92aWRlciBkYXRhICh7QGxpbmsgX2NoYXRCYWNraW5nc30pOyBBSCBzdXBwbGllcyBhbnkgdHJhbnNpZW50XG5cdC8vIG9wZXJhdGlvbiBjb250ZXh0IHJlcXVpcmVkIHRvIG1hdGVyaWFsaXplIHRoYXQgU0RLIGNvbnZlcnNhdGlvbi5cblxuXHQvKipcblx0ICogVGhlIGNoYXQtYWRkcmVzc2VkIG9wZXJhdGlvbiBzdXJmYWNlXG5cdCAqICh7QGxpbmsgSUFnZW50Q2hhdHN9KS4gRXZlcnkgbWV0aG9kIGFkZHJlc3NlcyBhIGNoYXQgYnkgYSBzaW5nbGUsXG5cdCAqIGFscmVhZHktcmVzb2x2ZWQgY2hhdCBVUkk7IGBjcmVhdGVDaGF0YCBhZGRpdGlvbmFsbHkgcmVjZWl2ZXMgdHJhbnNpZW50XG5cdCAqIGhvc3QgY29udGV4dCBmcm9tIEFIIChzZWUge0BsaW5rIElBZ2VudENoYXRzLmNyZWF0ZUNoYXR9KSBcdTIwMTQgdGhpcyBtYXBzIHRvXG5cdCAqIHRoZSBgKHNlc3Npb24sIGNoYXQpYCBwYWlyIHRoZSBhZ2VudCdzIGludGVybmFsIFNESyBzdG9yYWdlIGlzIGtleWVkIGJ5XG5cdCAqICh2aWEge0BsaW5rIF9yZXNvbHZlQ2hhdENvbnRleHR9KS5cblx0ICpcblx0ICogYGNyZWF0ZUNoYXRgIGlzIHRoZSBvbmx5IGNyZWF0aW9uIHNlYW0uIEl0IG5laXRoZXIga25vd3Mgbm9yIGFza3Mgd2hldGhlclxuXHQgKiB0aGUgY2hhdCBpdCBpcyBjcmVhdGluZyBpcyBhIHNlc3Npb24ncyBmaXJzdCBjaGF0IG9yIGFuIGFkZGl0aW9uYWwgb25lLFxuXHQgKiBhbmQgdGhlcmUgaXMgbm8gc2VwYXJhdGUgZm9yayBlbnRyeSBwb2ludDogYSBmb3JrIGlzIGp1c3QgYSBjcmVhdGlvblxuXHQgKiB3aG9zZSBvcHRpb25zIG5hbWUgYSBzb3VyY2UgKHtAbGluayBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucy5mb3JrfSksIHNvXG5cdCAqIGV2ZXJ5IGNyZWF0aW9uIGZvcm0gKGZyZXNoLCBmb3JrLCBpbXBvcnQsIHNpZGUgY2hhdCkgcnVucyB0aGUgb25lXG5cdCAqIGFsZ29yaXRobSBpbiB7QGxpbmsgX2NyZWF0ZUNoYXR9LlxuXHQgKi9cblx0cmVhZG9ubHkgY2hhdHM6IElBZ2VudENoYXRzID0ge1xuXHRcdGNyZWF0ZUNoYXQ6IChjaGF0LCBjb250ZXh0LCBvcHRpb25zKSA9PlxuXHRcdFx0dGhpcy5fY3JlYXRlQ2hhdChjaGF0LCByZXNvbHZlQWdlbnRDaGF0Q29udGV4dChjb250ZXh0LCBjaGF0KSwgb3B0aW9ucyksXG5cdFx0ZGlzcG9zZUNoYXQ6IChjaGF0LCBjb250ZXh0KSA9PiB0aGlzLl9kaXNwb3NlQ2hhdChjaGF0LCBjb250ZXh0KSxcblx0XHRyZWxlYXNlQ2hhdDogKGNoYXQsIGNvbnRleHQpID0+IHRoaXMuX3JlbGVhc2VDaGF0KGNoYXQsIGNvbnRleHQpLFxuXHRcdHNlbmRNZXNzYWdlOiAoY2hhdFVyaSwgcHJvbXB0LCB3b3JraW5nRGlyZWN0b3JpZXNPckRpcmVjdG9yeSwgYXR0YWNobWVudHMsIHR1cm5JZCwgc2VuZGVyQ2xpZW50SWQsIGNsaWVudFR5cGVPckNvbnRleHQsIGNvbnRleHQpID0+IHtcblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcmllcyA9IEFycmF5LmlzQXJyYXkod29ya2luZ0RpcmVjdG9yaWVzT3JEaXJlY3RvcnkpID8gd29ya2luZ0RpcmVjdG9yaWVzT3JEaXJlY3RvcnkgOiB3b3JraW5nRGlyZWN0b3JpZXNPckRpcmVjdG9yeSA/IFt3b3JraW5nRGlyZWN0b3JpZXNPckRpcmVjdG9yeV0gOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBvcGVyYXRpb25Db250ZXh0ID0gY29udGV4dCA/PyAodHlwZW9mIGNsaWVudFR5cGVPckNvbnRleHQgPT09ICdzdHJpbmcnID8gdW5kZWZpbmVkIDogY2xpZW50VHlwZU9yQ29udGV4dCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2VuZE1lc3NhZ2UoY2hhdFVyaSwgcHJvbXB0LCB3b3JraW5nRGlyZWN0b3JpZXMsIGF0dGFjaG1lbnRzLCB0dXJuSWQsIHNlbmRlckNsaWVudElkLCBvcGVyYXRpb25Db250ZXh0KTtcblx0XHR9LFxuXHRcdGFib3J0OiAoY2hhdFVyaSwgY29udGV4dCkgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2Fib3J0U2Vzc2lvbihjaGF0VXJpLCBjb250ZXh0KTtcblx0XHR9LFxuXHRcdGNoYW5nZU1vZGVsOiAoY2hhdFVyaSwgbW9kZWwsIGNvbnRleHQpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLl9jaGFuZ2VNb2RlbChjaGF0VXJpLCBtb2RlbCwgY29udGV4dCk7XG5cdFx0fSxcblx0XHRjaGFuZ2VBZ2VudDogKGNoYXRVcmksIGFnZW50LCBjb250ZXh0KSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fY2hhbmdlQWdlbnQoY2hhdFVyaSwgYWdlbnQsIGNvbnRleHQpO1xuXHRcdH0sXG5cdFx0Z2V0TWVzc2FnZXM6IChjaGF0LCBjb250ZXh0KSA9PiB0aGlzLl9nZXRDaGF0TWVzc2FnZXMoY2hhdCwgY29udGV4dCksXG5cdH07XG5cblx0LyoqXG5cdCAqIEJ1aWxkcyB0aGUgU0RLIGBjYW5Vc2VUb29sYCBwZXJtaXNzaW9uIGJyaWRnZSBmb3IgYSBzZXNzaW9uL2NoYXQuIFRoZVxuXHQgKiByZXNvbHZlciBzZWFyY2hlcyBldmVyeSBsaXZlIFNESyBjb252ZXJzYXRpb24gYnkgU0RLIGlkIHNvIG9uZVxuXHQgKiBjaGF0J3MgdG9vbC1wZXJtaXNzaW9uIHJlcXVlc3RzIHJlYWNoIGl0cyBvd24gcGVuZGluZy1wZXJtaXNzaW9uIHJlZ2lzdHJ5LlxuXHQgKlxuXHQgKiBgY29uZmlndXJhdGlvblJlc291cmNlYCBpcyB0aGUgc2Vzc2lvbi13aWRlIGNvbmZpZyBzY29wZSwgZGlzdGluY3QgZnJvbVxuXHQgKiB0aGUgaW52b2tpbmcgY2hhdCdzIG93biBgcmVzb3VyY2VgIFx1MjAxNCBhIHBlZXIvc2lkZSBjaGF0IGhhcyBpdHMgb3duXG5cdCAqIGByZXNvdXJjZWAgYnV0IHNoYXJlcyBpdHMgb3duaW5nIHNlc3Npb24ncyBgY29uZmlndXJhdGlvblJlc291cmNlYC5cblx0ICogYEV4aXRQbGFuTW9kZWAncyBwZXJtaXNzaW9uLW1vZGUgd3JpdGUgKHRoZSBicmlkZ2UncyBvbmUgY29uZmlnXG5cdCAqIG11dGF0aW9uKSBtdXN0IHRhcmdldCB0aGF0IHNoYXJlZCBzY29wZSByZWdhcmRsZXNzIG9mIHdoaWNoIGNoYXRcblx0ICogYXBwcm92ZWQgdGhlIHBsYW4uXG5cdCAqL1xuXHRwcml2YXRlIF9tYWtlQ2FuVXNlVG9vbChzZGtTZXNzaW9uSWQ6IHN0cmluZywgY29uZmlndXJhdGlvblJlc291cmNlOiBVUkkpOiBOb25OdWxsYWJsZTxPcHRpb25zWydjYW5Vc2VUb29sJ10+IHtcblx0XHRyZXR1cm4gKHRvb2xOYW1lLCBpbnB1dCwgb3B0aW9ucykgPT5cblx0XHRcdGhhbmRsZUNhblVzZVRvb2woXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRnZXRTZXNzaW9uOiBpZCA9PiB0aGlzLl9maW5kU2Vzc2lvbkJ5U2RrSWQoaWQpLFxuXHRcdFx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdFx0XHRjb25maWd1cmF0aW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0c2VydmVyVG9vbEhvc3Q6IHRoaXMuX3NlcnZlclRvb2xIb3N0LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRzZGtTZXNzaW9uSWQsIHRvb2xOYW1lLCBpbnB1dCwgb3B0aW9ucyxcblx0XHRcdCk7XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGRzIHRoZSBTREsgYG9uRWxpY2l0YXRpb25gIGJyaWRnZSBmb3IgYSBzZXNzaW9uL2NoYXQuIE1pcnJvcnNcblx0ICoge0BsaW5rIF9tYWtlQ2FuVXNlVG9vbH06IHJlc29sdmVzIHRoZSBzZXNzaW9uIGJ5IFNESyBpZCAoYWxsIGxpdmVcblx0ICogY2hhdHMpIGFuZCBkZWxlZ2F0ZXMgdG8gdGhlIGVsaWNpdGF0aW9uIGJyaWRnZSwgd2hpY2ggcGFya3Mgb24gdGhlXG5cdCAqIHNlc3Npb24ncyB1c2VyLWlucHV0IGNoYW5uZWwuXG5cdCAqL1xuXHRwcml2YXRlIF9tYWtlT25FbGljaXRhdGlvbihzZGtTZXNzaW9uSWQ6IHN0cmluZyk6IE9uRWxpY2l0YXRpb24ge1xuXHRcdHJldHVybiAocmVxdWVzdCwgb3B0aW9ucykgPT5cblx0XHRcdGhhbmRsZUVsaWNpdGF0aW9uKFxuXHRcdFx0XHR7IGdldFNlc3Npb246IGlkID0+IHRoaXMuX2ZpbmRTZXNzaW9uQnlTZGtJZChpZCkgfSxcblx0XHRcdFx0c2RrU2Vzc2lvbklkLCByZXF1ZXN0LCBvcHRpb25zLFxuXHRcdFx0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQcm9tb3RlIGEgcHJvdmlzaW9uYWwge0BsaW5rIENsYXVkZUFnZW50U2Vzc2lvbn0gaW50byBhIGxpdmUgb25lLlxuXHQgKiBDYWxsZWQgZnJvbSB7QGxpbmsgc2VuZE1lc3NhZ2V9IGluc2lkZSB0aGUge0BsaW5rIF9zZXNzaW9uU2VxdWVuY2VyLnF1ZXVlfVxuXHQgKiBibG9jaywgc28gY29uY3VycmVudCBmaXJzdCBzZW5kcyBzZXJpYWxpemUgbmF0dXJhbGx5IFx1MjAxNCBleGFjdGx5XG5cdCAqIG9uZSBtYXRlcmlhbGl6ZSBwZXIgc2Vzc2lvbi5cblx0ICpcblx0ICogRmFpbHVyZSBtb2Rlczpcblx0ICogLSBNaXNzaW5nIHNlc3Npb24gZW50cnkgXHUyMTkyIHByb2dyYW1tZXIgZXJyb3IsIHRocm93cy5cblx0ICogLSBNaXNzaW5nIHByb3h5IGhhbmRsZSBcdTIxOTIgY2FsbGVyIGZvcmdvdCB7QGxpbmsgYXV0aGVudGljYXRlfSwgdGhyb3dzLlxuXHQgKiAtIEFib3J0ZWQgYmVmb3JlIFNESyBpbml0IHJldHVybnMgXHUyMTkyIHtAbGluayBDbGF1ZGVBZ2VudFNlc3Npb24ubWF0ZXJpYWxpemV9XG5cdCAqICAgZGlzcG9zZXMgdGhlIGBXYXJtUXVlcnlgIGFuZCB0aHJvd3Mge0BsaW5rIENhbmNlbGxhdGlvbkVycm9yfS5cblx0ICogLSBDdXN0b21pemF0aW9uLWRpcmVjdG9yeSBwZXJzaXN0ZW5jZSBmYWlsdXJlIFx1MjE5MiBmYXRhbDogdGhlIHNlc3Npb24nc1xuXHQgKiAgIGBtYXRlcmlhbGl6ZWAgdGhyb3dzLCB0aGUgYWdlbnQgZHJvcHMgdGhlIGVudHJ5LCBhbmQgdGhlIGVycm9yXG5cdCAqICAgcHJvcGFnYXRlcyBzbyB0aGUgY2FsbGVyIGxlYXJucyBhYm91dCBpdC5cblx0ICogLSBBYm9ydGVkIHBvc3QtbWV0YWRhdGEtd3JpdGUgYnV0IHByZS1jb21taXQgXHUyMTkyIHNlY29uZCBhYm9ydCBnYXRlXG5cdCAqICAgaW5zaWRlIGBtYXRlcmlhbGl6ZWAgdGhyb3dzIHNvIHdlIG5ldmVyIGV4cG9zZSBhIGxpdmUgcGlwZWxpbmVcblx0ICogICBmb3IgYSBzZXNzaW9uIHRoZSBjYWxsZXIgaGFzIGFscmVhZHkgdG9ybiBkb3duLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfbWF0ZXJpYWxpemVQcm92aXNpb25hbChzZXNzaW9uSWQ6IHN0cmluZywgY29udGV4dDogSVJlc29sdmVkQ2xhdWRlQ2hhdENvbnRleHQsIHdvcmtpbmdEaXJlY3Rvcmllcz86IHJlYWRvbmx5IFVSSVtdKTogUHJvbWlzZTxDbGF1ZGVBZ2VudFNlc3Npb24+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fZmluZEFueVNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IG1hdGVyaWFsaXplIHVua25vd24gcHJvdmlzaW9uYWwgc2Vzc2lvbjogJHtzZXNzaW9uSWR9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc291cmNlID0gY29udGV4dC5yZXNvdXJjZTtcblx0XHQvLyBGYWlsIGZhc3Qgb24gYSBzaWduZWQtb3V0IHByb3h5IGJlZm9yZSBidWlsZGluZyBhbnl0aGluZywga2VlcGluZyB0aGVcblx0XHQvLyB0aHJvdyBhdCB0aGlzIHByZS1gdHJ5YCBzaXRlIHNvIGEgdHJhbnNpZW50IGF1dGggZmFpbHVyZSBsZWF2ZXMgdGhlXG5cdFx0Ly8gcHJvdmlzaW9uYWwgc2Vzc2lvbiBpbnRhY3QgZm9yIHRoZSBuZXh0IHNlbmQgdG8gcmV0cnkgKHJhdGhlciB0aGFuXG5cdFx0Ly8gZGlzcG9zaW5nIGl0KS4gVGhlIHJlc29sdmVkIHRyYW5zcG9ydCBpcyBoYW5kZWQgdG8gbWF0ZXJpYWxpemUgYXMgYVxuXHRcdC8vIHZhbHVlOiB0aGUgYWdlbnQgb3ducyB0cmFuc3BvcnQgcmVzb2x1dGlvbiAoaXQgaG9sZHMgdGhlIGxpdmUgcHJveHlcblx0XHQvLyBoYW5kbGUpLCB0aGUgc2Vzc2lvbiBqdXN0IGNvbnN1bWVzIGl0LiBBIGxhdGVyIHBlci1zZXNzaW9uIHByb3ZpZGVyXG5cdFx0Ly8gc3dpdGNoIGlzIHB1c2hlZCBpbiBzZXBhcmF0ZWx5IGF0IHNlbmQgdGltZSAoc2VlIGBoYXNQZW5kaW5nVHJhbnNwb3J0U3dpdGNoYCkuXG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gdGhpcy5fZW5zdXJlQXV0aGVudGljYXRlZChzZXNzaW9uLnByb3Zpc2lvbmFsTW9kZWwpO1xuXG5cdFx0Y29uc3QgY2FuVXNlVG9vbCA9IHRoaXMuX21ha2VDYW5Vc2VUb29sKHNlc3Npb25JZCwgY29udGV4dC5jb25maWd1cmF0aW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IG9uRWxpY2l0YXRpb24gPSB0aGlzLl9tYWtlT25FbGljaXRhdGlvbihzZXNzaW9uSWQpO1xuXHRcdHRoaXMuX3JlY29yZENoYXRTY29wZShjb250ZXh0LmNoYXQsIGNvbnRleHQuY29uZmlndXJhdGlvblJlc291cmNlLCBjb250ZXh0LnJlc291cmNlKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc2Vzc2lvbi5tYXRlcmlhbGl6ZSh7XG5cdFx0XHRcdHRyYW5zcG9ydCxcblx0XHRcdFx0Y2FuVXNlVG9vbCxcblx0XHRcdFx0b25FbGljaXRhdGlvbixcblx0XHRcdFx0aXNSZXN1bWU6IGZhbHNlLFxuXHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0Y29uZmlnUmVzb3VyY2U6IGNvbnRleHQuY29uZmlndXJhdGlvblJlc291cmNlLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogY29udGV4dC5jdXN0b21pemF0aW9ucyxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzLFxuXHRcdFx0XHRzZXJ2ZXJUb29sSG9zdDogdGhpcy5fc2VydmVyVG9vbEhvc3QsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRoaXMuX3BlcnNpc3RTZXNzaW9uT3ZlcmxheShyZXNvdXJjZSwgY29udGV4dC5jb25maWd1cmF0aW9uUmVzb3VyY2UsIHNlc3Npb24sIHRyYW5zcG9ydC5raW5kKTtcblx0XHRcdGlmIChzZXNzaW9uLmFib3J0Q29udHJvbGxlci5zaWduYWwuYWJvcnRlZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgQ2FuY2VsbGF0aW9uRXJyb3IoKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2RlbGV0ZVNlc3Npb24oc2Vzc2lvbik7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXG5cdFx0Ly8gRW1pdCB0aGUgZnVsbCByZXNvbHZlZCBzZXQgKGluZGV4IDAgPSBwcm9jZXNzIHJvb3QsIDEuLk4gPSBhZGRpdGlvbmFsXG5cdFx0Ly8gcm9vdHMpLiBGYWxscyBiYWNrIHRvIHRoZSBzZXNzaW9uJ3Mgb3duIG9yZGVyZWQgc2V0IHdoZW4gdGhlIGhvc3Rcblx0XHQvLyBkaWRuJ3QgaGFuZCB1cyBvbmUgKGUuZy4gd29ya3NwYWNlLWxlc3Mgc2luZ2xlLXJvb3QpLlxuXHRcdGNvbnN0IG1hdGVyaWFsaXplZFdvcmtpbmdEaXJlY3RvcmllcyA9IHdvcmtpbmdEaXJlY3RvcmllcyA/PyBzZXNzaW9uLndvcmtpbmdEaXJlY3RvcmllcztcblxuXHRcdC8vIFBhc3MgdGhlIHJlc29sdmVkIGRpcmVjdG9yaWVzIGJlZm9yZSB0aGUgbWF0ZXJpYWxpemUgZXZlbnQgdXBkYXRlcyB0aGVtIGluIHRoZSBzdGF0ZSBtYW5hZ2VyLlxuXHRcdHRoaXMuX2NoZWNrcG9pbnRTZXJ2aWNlLmNhcHR1cmVCYXNlbGluZUNoZWNrcG9pbnQoY29udGV4dC5jb25maWd1cmF0aW9uUmVzb3VyY2UsIG1hdGVyaWFsaXplZFdvcmtpbmdEaXJlY3RvcmllcykuY2F0Y2goZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZToke3Nlc3Npb25JZH1dIEJhc2VsaW5lIGNoZWNrcG9pbnQgY2FwdHVyZSBmYWlsZWQ6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fb25EaWRNYXRlcmlhbGl6ZUNoYXQuZmlyZSh7XG5cdFx0XHRjaGF0OiBjb250ZXh0LmNoYXQsXG5cdFx0XHRwcm9qZWN0OiBzZXNzaW9uLnByb2plY3QsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IG1hdGVyaWFsaXplZFdvcmtpbmdEaXJlY3Rvcmllcyxcblx0XHR9KTtcblxuXHRcdHJldHVybiBzZXNzaW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcGVyc2lzdFNlc3Npb25PdmVybGF5KHJlc291cmNlOiBVUkksIGNvbmZpZ1Jlc291cmNlOiBVUkksIHNlc3Npb246IENsYXVkZUFnZW50U2Vzc2lvbiwgdHJhbnNwb3J0S2luZDogQ2xhdWRlVHJhbnNwb3J0WydraW5kJ10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fbWV0YWRhdGFTdG9yZS53cml0ZShyZXNvdXJjZSwge1xuXHRcdFx0XHRjdXN0b21pemF0aW9uRGlyZWN0b3J5OiBzZXNzaW9uLndvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRcdG1vZGVsOiBzZXNzaW9uLnByb3Zpc2lvbmFsTW9kZWwsXG5cdFx0XHRcdHBlcm1pc3Npb25Nb2RlOiByZWFkQ2xhdWRlUGVybWlzc2lvbk1vZGUodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ1Jlc291cmNlKSA/PyBzZXNzaW9uLnBlcm1pc3Npb25Nb2RlRmFsbGJhY2ssXG5cdFx0XHRcdHRyYW5zcG9ydDogdHJhbnNwb3J0S2luZCxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBzZXNzaW9uLndvcmtpbmdEaXJlY3Rvcmllcyxcblx0XHRcdFx0Li4uKHNlc3Npb24ucHJvdmlzaW9uYWxBZ2VudCA/IHsgYWdlbnQ6IHNlc3Npb24ucHJvdmlzaW9uYWxBZ2VudCB9IDoge30pLFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQ2xhdWRlXSBGYWlsZWQgdG8gcGVyc2lzdCBjdXN0b21pemF0aW9uIGRpcmVjdG9yeTsgYWJvcnRpbmcgbWF0ZXJpYWxpemVgLCBlcnIpO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBQdWxsIGBwZXJtaXNzaW9uTW9kZWAgb3V0IG9mIHRoZSBwb3N0LXZhbGlkYXRpb24gYElBZ2VudENyZWF0ZUNoYXRPcHRpb25zLmNvbmZpZ2Bcblx0ICogYmFnLCBuYXJyb3dpbmcgdGhlIHJ1bnRpbWUgYHVua25vd25gIHZhbHVlIHRvIHRoZSBTREsncyBgUGVybWlzc2lvbk1vZGVgXG5cdCAqIHVuaW9uICg1LzYgdmFsdWVzLCBleGNsdWRpbmcgYGRvbnRBc2tgOyBzZGsuZC50czoxNTYwKS4gRmFsbHMgYmFjayB0b1xuXHQgKiBgJ2RlZmF1bHQnYCB3aGVuIHRoZSBiYWcgaXMgYWJzZW50IG9yIGNhcnJpZXMgc29tZXRoaW5nIHRoZSBzY2hlbWFcblx0ICogdmFsaWRhdG9yIHNob3VsZG4ndCBoYXZlIGFjY2VwdGVkIChkZWZlbnNlLWluLWRlcHRoKS5cblx0ICovXG5cdHByaXZhdGUgX3Jlc29sdmVQZXJtaXNzaW9uTW9kZShjb25maWc6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogQ2xhdWRlUGVybWlzc2lvbk1vZGUge1xuXHRcdHJldHVybiBuYXJyb3dDbGF1ZGVQZXJtaXNzaW9uTW9kZShjb25maWc/LltDbGF1ZGVTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25Nb2RlXSkgPz8gJ2RlZmF1bHQnO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZGlzcG9zZUxpdmVTZXNzaW9uKHNlc3Npb246IENsYXVkZUFnZW50U2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHNlc3Npb24uYWJvcnRDb250cm9sbGVyLmFib3J0KCk7XG5cdFx0aWYgKCFzZXNzaW9uLmlzUGlwZWxpbmVSZWFkeSkge1xuXHRcdFx0Ly8gTm90aGluZyBlbHNlIHRvIHRlYXIgZG93biB5ZXQuXG5cdFx0fSBlbHNlIHtcblx0XHRcdHNlc3Npb24uYWJvcnQoKTtcblx0XHR9XG5cdFx0dGhpcy5fZGVsZXRlU2Vzc2lvbihzZXNzaW9uKTtcblx0fVxuXG5cdC8vICNyZWdpb24gQ2hhdCBjcmVhdGlvbiBcdTIwMTQgdGhlIG9uZSBhbGdvcml0aG0gZXZlcnkgY2hhdCBpcyBjcmVhdGVkIGJ5XG5cblx0LyoqXG5cdCAqIFRoZSBzaW5nbGUgY2hhdC1jcmVhdGlvbiBhbGdvcml0aG0uXG5cdCAqXG5cdCAqIEV2ZXJ5IGNoYXQgQWdlbnQgSG9zdCBjcmVhdGVzIHJ1bnMgZXhhY3RseSB0aGlzIHBhdGggXHUyMDE0IGEgc2Vzc2lvbidzIGZpcnN0XG5cdCAqIGNoYXQsIGFuIGFkZGl0aW9uYWwgY2hhdCwgYSBmb3JrLCBhbiBpbXBvcnQsIGEgc2lkZSBjaGF0LiBUaGVyZSBpcyBub1xuXHQgKiBzZXNzaW9uLXZlcnN1cy1hZGRpdGlvbmFsIGJyYW5jaCBhbmQgbm8gcHJvdmlkZXItc2lkZSBjaGF0IHJvbGU6IHRoaXNcblx0ICogY29uc3VtZXMgdGhlIGZ1bGx5LXJlc29sdmVkIG9wdGlvbnMgQUggaGFuZHMgb3ZlciAobW9kZWwsIGFnZW50LCB3b3JraW5nXG5cdCAqIGRpcmVjdG9yaWVzLCBwcm9qZWN0LCBjb25maWcsIGFjdGl2ZSBjbGllbnQsIHBsdXMgdGhlIG9wdGlvbmFsXG5cdCAqIGltcG9ydCAvIGZvcmsgLyBzaWRlLWNoYXQgc291cmNlcyksIGJpbmRzIHRoZSBhZGRyZXNzZWQgY2hhdCB0byBleGFjdGx5XG5cdCAqIG9uZSBTREsgY29udmVyc2F0aW9uLCByZWNvcmRzIHRoYXQgY29udmVyc2F0aW9uIGFzIHRoZSBjaGF0J3MgZXhhY3Rcblx0ICogb3BhcXVlIGJhY2tpbmcsIGFuZCBoYW5kcyB0aGUgYmFja2luZyBiYWNrLlxuXHQgKlxuXHQgKiBUaGUgcmVzdWx0IHJlcG9ydHMgd2hhdCB0aGlzIGNyZWF0aW9uIHJlc29sdmVkIGZvciB0aGUgY2hhdCBpdHNlbGYgXHUyMDE0IHRoZVxuXHQgKiByZXNvbHZlZCBgcHJvamVjdGAgLyBgcmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5YCwgYW5kIHRoZSBgcHJvdmlzaW9uYWxgXG5cdCAqIGJpdCBmb3IgYSBydW50aW1lIHRoYXQgaGFzIG5vdCByZWFjaGVkIHRoZSBTREsgeWV0IFx1MjAxNCBuZXh0IHRvIHRoZSBvcGFxdWVcblx0ICogYHByb3ZpZGVyRGF0YWAgYmxvYiBhbmQgdGhlIHNlcGFyYXRlbHktZW51bWVyYWJsZSBgYmFja2luZ1Nlc3Npb25gIEFIXG5cdCAqIHN1cHByZXNzZXMgZnJvbSBpdHMgc2Vzc2lvbiBsaXN0LiBUaGVyZSBpcyBubyBgc2Vzc2lvbmAgZmllbGQ6IHdoYXQgYW55XG5cdCAqIG9mIHRoYXQgbWVhbnMgZm9yIHRoZSBjaGF0J3Mgcm9sZSBpbiB0aGUgc2Vzc2lvbiBpcyBBZ2VudCBIb3N0J3Ncblx0ICogZGVjaXNpb24sIG5vdCB0aGlzIHByb3ZpZGVyJ3MuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVDaGF0KGNoYXQ6IFVSSSwgY29udGV4dDogSUFnZW50Q2hhdENvbnRleHQsIG9wdGlvbnM/OiBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucyk6IFByb21pc2U8SUFnZW50Q3JlYXRlQ2hhdFJlc3VsdD4ge1xuXHRcdC8vIGBpbXBvcnRDb252ZXJzYXRpb24ubW9kZWxgIChtaXJyb3JpbmcgQ29waWxvdCdzIGBfaW1wb3J0Q29udmVyc2F0aW9uYClcblx0XHQvLyBpcyB0aGUgZWZmZWN0aXZlIG1vZGVsIG9mIHRoZSBpbXBvcnRlZCB0dXJucycgb3JpZ2luYXRpbmcgY29udmVyc2F0aW9uLFxuXHRcdC8vIG5vdCBhIGNhbGxlciBvdmVycmlkZSwgc28gaXQgdGFrZXMgcHJlY2VkZW5jZSBvdmVyIGBvcHRpb25zLm1vZGVsYC5cblx0XHQvLyBNdXR1YWxseSBleGNsdXNpdmUgd2l0aCBgb3B0aW9ucy5mb3JrYCAocGVyIHRoZSBjb250cmFjdCksIHNvIGl0IG5ldmVyXG5cdFx0Ly8gY2hhbmdlcyB0aGUgbW9kZWwgYSBmb3JrIGluaGVyaXRzIGJlbG93LlxuXHRcdGNvbnN0IG1vZGVsID0gb3B0aW9ucz8uaW1wb3J0Q29udmVyc2F0aW9uPy5tb2RlbCA/PyBvcHRpb25zPy5tb2RlbDtcblx0XHQvLyBBbiBpbmhlcml0ZWQgbW9kZWwgaXMgcmVzb2x2ZWQgZnJvbSB0aGUgc291cmNlIGNvbnZlcnNhdGlvbiBhdCBtYXRlcmlhbGl6YXRpb24uXG5cdFx0aWYgKG1vZGVsIHx8ICghb3B0aW9ucz8uZm9yayAmJiAhb3B0aW9ucz8uc2lkZUNoYXQpKSB7XG5cdFx0XHR0aGlzLl9lbnN1cmVBdXRoZW50aWNhdGVkKG1vZGVsKTtcblx0XHR9XG5cdFx0Y29uc3QgY2hhdEtleSA9IGNoYXQudG9TdHJpbmcoKTtcblx0XHQvLyBSZWNvcmQgdGhpcyBjaGF0J3Mgb3duIHNjb3BlIG5vdyBcdTIwMTQgdGhlIG9ubHkgcGxhY2UgYSBsYXRlciBmb3JrXG5cdFx0Ly8gbmFtaW5nIHRoaXMgY2hhdCBhcyBpdHMgc291cmNlIHJlc29sdmVzIHRoYXQgc291cmNlJ3Mgc2NvcGUgZnJvbS5cblx0XHR0aGlzLl9yZWNvcmRDaGF0U2NvcGUoY2hhdCwgY29udGV4dC5jb25maWd1cmF0aW9uUmVzb3VyY2UsIGNvbnRleHQucmVzb3VyY2UpO1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uU2VxdWVuY2VyLnF1ZXVlKGNoYXRLZXksIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fY2hhdEJhY2tpbmdzLmdldChjaGF0S2V5KTtcblx0XHRcdGNvbnN0IGNyZWF0ZWQgPSBleGlzdGluZ1xuXHRcdFx0XHQ/IHRoaXMuX3JlY3JlYXRlZENoYXRSZXN1bHQoZXhpc3RpbmcsIG9wdGlvbnMpXG5cdFx0XHRcdDogYXdhaXQgdGhpcy5fYmluZENoYXRDb252ZXJzYXRpb24oY2hhdCwgY29udGV4dCwgbW9kZWwsIG9wdGlvbnMpO1xuXHRcdFx0Ly8gU2VlZCB0aGUgZWFnZXJseS1jbGFpbWVkIGFjdGl2ZSBjbGllbnQgb24gZXZlcnkgY3JlYXRpb24sIGluY2x1ZGluZ1xuXHRcdFx0Ly8gYW4gaWRlbXBvdGVudCByZS1jcmVhdGU6IEFnZW50U2VydmljZSByZS1pc3N1ZXMgcHJvdmlzaW9uaW5nIGZvciBhblxuXHRcdFx0Ly8gZXhpc3RpbmcgY2hhdCBvbiByZWNvbm5lY3QsIHNvIHRoZSByZWNvbm5lY3RlZCBjbGllbnQncyB0b29scyBhbmRcblx0XHRcdC8vIGN1c3RvbWl6YXRpb25zIG11c3Qgc3RpbGwgcmVhY2ggQ2xhdWRlLlxuXHRcdFx0YXdhaXQgdGhpcy5fc2VlZEVhZ2VyQWN0aXZlQ2xpZW50KGNoYXQsIGNvbnRleHQsIG9wdGlvbnM/LmFjdGl2ZUNsaWVudCk7XG5cdFx0XHRyZXR1cm4gY3JlYXRlZDtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZS1jcmVhdGlvbiBvZiBhIGNoYXQgdGhpcyBwcm92aWRlciBhbHJlYWR5IGJhY2tzOiBoYW5kIHRoZSByZWNvcmRlZFxuXHQgKiBiYWNraW5nIGJhY2sgdmVyYmF0aW0gc28gdGhlIG9yY2hlc3RyYXRvciByZS1wZXJzaXN0cyBhIGNvbnNpc3RlbnQgYmxvYixcblx0ICogdG9nZXRoZXIgd2l0aCB3aGF0ZXZlciBpdHMgbGl2ZSBydW50aW1lIChpZiBhbnkpIGhhcyByZXNvbHZlZCBzbyBmYXIuXG5cdCAqL1xuXHRwcml2YXRlIF9yZWNyZWF0ZWRDaGF0UmVzdWx0KGJhY2tpbmc6IElDbGF1ZGVDaGF0QmFja2luZywgb3B0aW9ucz86IElBZ2VudENyZWF0ZUNoYXRPcHRpb25zKTogSUFnZW50Q3JlYXRlQ2hhdFJlc3VsdCB7XG5cdFx0Y29uc3QgbGl2ZSA9IHRoaXMuX2ZpbmRBbnlTZXNzaW9uKGJhY2tpbmcuc2RrU2Vzc2lvbklkKTtcblx0XHRjb25zdCByZXNvbHZlZFdvcmtpbmdEaXJlY3RvcnkgPSBsaXZlPy53b3JraW5nRGlyZWN0b3J5ID8/IG9wdGlvbnM/LndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdO1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi4obGl2ZT8ucHJvamVjdCA/IHsgcHJvamVjdDogbGl2ZS5wcm9qZWN0IH0gOiB7fSksXG5cdFx0XHQuLi4ocmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5ID8geyByZXNvbHZlZFdvcmtpbmdEaXJlY3RvcnkgfSA6IHt9KSxcblx0XHRcdC4uLihsaXZlICYmICFsaXZlLmlzUGlwZWxpbmVSZWFkeSA/IHsgcHJvdmlzaW9uYWw6IHRydWUgfSA6IHt9KSxcblx0XHRcdC4uLnRoaXMuX2NoYXRCYWNraW5nUmVzdWx0KGJhY2tpbmcpLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogQmluZCB0aGUgYWRkcmVzc2VkIGNoYXQgdG8gZXhhY3RseSBvbmUgU0RLIGNvbnZlcnNhdGlvbjogdGhlIG9uZVxuXHQgKiBpbmhlcml0ZWQgZnJvbSBhIGZvcmsgLyBzaWRlLWNoYXQgc291cmNlIHdoZW4gdGhhdCBzb3VyY2UgcmVzb2x2ZXMsIGFcblx0ICogZnJlc2hseSBtaW50ZWQgb25lIG90aGVyd2lzZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2JpbmRDaGF0Q29udmVyc2F0aW9uKGNoYXQ6IFVSSSwgY29udGV4dDogSUFnZW50Q2hhdENvbnRleHQsIG1vZGVsOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZCwgb3B0aW9ucz86IElBZ2VudENyZWF0ZUNoYXRPcHRpb25zKTogUHJvbWlzZTxJQWdlbnRDcmVhdGVDaGF0UmVzdWx0PiB7XG5cdFx0Y29uc3QgeyBzZGtTZXNzaW9uSWQsIHNpZGVDaGF0IH0gPSBhd2FpdCB0aGlzLl9pbmhlcml0U291cmNlQ29udmVyc2F0aW9uKG9wdGlvbnMpO1xuXHRcdHJldHVybiBzZGtTZXNzaW9uSWQgIT09IHVuZGVmaW5lZFxuXHRcdFx0PyB0aGlzLl9iaW5kSW5oZXJpdGVkQ29udmVyc2F0aW9uKGNoYXQsIGNvbnRleHQsIHNka1Nlc3Npb25JZCwgc2lkZUNoYXQsIG1vZGVsLCBvcHRpb25zKVxuXHRcdFx0OiB0aGlzLl9iaW5kRnJlc2hDb252ZXJzYXRpb24oY2hhdCwgY29udGV4dCwgc2lkZUNoYXQsIG1vZGVsLCBvcHRpb25zKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIHRoZSBTREsgY29udmVyc2F0aW9uIGEgbmV3IGNoYXQgaW5oZXJpdHMgZnJvbSBpdHMgZm9yayBvclxuXHQgKiBzaWRlLWNoYXQgc291cmNlLCBwbHVzIHRoZSBzaWRlLWNoYXQgcHJvdmVuYW5jZSByZWNvcmRlZCBvbiB0aGUgYmFja2luZy5cblx0ICpcblx0ICogQW4gdW5yZXNvbHZhYmxlIHNvdXJjZSBcdTIwMTQgdGhlIHNvdXJjZSBjaGF0IGhhcyBubyBiYWNraW5nLCBvciBpdHMgdHVybiBpc1xuXHQgKiBhYnNlbnQgZnJvbSB0aGUgU0RLIHRyYW5zY3JpcHQsIHdoaWNoIGlzIHRoZSBub3JtYWwgY2FzZSBmb3IgYSBzb3VyY2Vcblx0ICogY29udmVyc2F0aW9uIHRoYXQgaXMgc3RpbGwgbGl2ZSBhbmQgdW5mbHVzaGVkIFx1MjAxNCBpcyBkZWxpYmVyYXRlbHkgbm90XG5cdCAqIGZhdGFsOiB0aGUgY2hhdCBpcyBjcmVhdGVkIGZyZXNoIGluc3RlYWQgb2YgaW5oZXJpdGluZyB0aGUgd2hvbGUgc291cmNlXG5cdCAqIGJhY2tlbmQgb3IgZmFpbGluZyBvdXRyaWdodC4gQWdlbnQgSG9zdCBoYXMgYWxyZWFkeSBzZWVkZWQgdGhlIHZpc2libGVcblx0ICogdHVybnMgaXQgZm9ya2VkLCBzbyBhIGZyZXNoIGJhY2tpbmcgaXMgYSBkZWdyYWRlZCBicmFuY2ggcmF0aGVyIHRoYW4gYVxuXHQgKiBsb3N0IGNoYXQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9pbmhlcml0U291cmNlQ29udmVyc2F0aW9uKG9wdGlvbnM/OiBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucyk6IFByb21pc2U8eyByZWFkb25seSBzZGtTZXNzaW9uSWQ/OiBzdHJpbmc7IHJlYWRvbmx5IHNpZGVDaGF0PzogSVBlcnNpc3RlZENoYXRbJ3NpZGVDaGF0J10gfT4ge1xuXHRcdGlmIChvcHRpb25zPy5mb3JrKSB7XG5cdFx0XHRjb25zdCBmb3JrZWQgPSBhd2FpdCB0aGlzLl9mb3JrQ2hhdChvcHRpb25zLmZvcmspO1xuXHRcdFx0cmV0dXJuIGZvcmtlZCA/IHsgc2RrU2Vzc2lvbklkOiBmb3JrZWQuc2Vzc2lvbklkIH0gOiB7fTtcblx0XHR9XG5cdFx0aWYgKCFvcHRpb25zPy5zaWRlQ2hhdCkge1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH1cblx0XHRjb25zdCBzb3VyY2UgPSBvcHRpb25zLnNpZGVDaGF0O1xuXHRcdGNvbnN0IGZvcmtlZCA9IGF3YWl0IHRoaXMuX2ZvcmtDaGF0KHsgc291cmNlOiBzb3VyY2Uuc291cmNlLCB0dXJuSWQ6IHNvdXJjZS5wcm92aWRlckFuY2hvclR1cm5JZCA/PyBzb3VyY2UudHVybklkIH0pO1xuXHRcdC8vIFRoZSBib3VuZGVkIHNvdXJjZS1jaGF0IGNvbnRleHQgaXMgYSBob3N0IGZhY3Qgd2hlbmV2ZXIgQWdlbnQgSG9zdFxuXHRcdC8vIGNhbiBwcm9kdWNlIG9uZSAoYW4gYWN0aXZlIG9yIGhvc3Qtb25seSBsb2NhbCBzb3VyY2UgdHVybik6IGl0IGhhbmRzXG5cdFx0Ly8gaXQgb3ZlciBvbiBgc2lkZUNoYXQuc291cmNlQ29udGV4dGAsIGFuZCBpdCB3aW5zIG91dHJpZ2h0IFx1MjAxNCBhIGZvcmtcblx0XHQvLyBhbmNob3JlZCBhdCB0aGUgcHJlY2VkaW5nIGNvbmNyZXRlIHR1cm4gc3RpbGwgbmVlZHMgaXQgdG8gY2FycnkgdHVybnNcblx0XHQvLyB0aGUgU0RLIHRyYW5zY3JpcHQgZG9lcyBub3QgaGF2ZS4gT3RoZXJ3aXNlLCB3aGVuIHRoZSBmb3JrIGNvdWxkIG5vdFxuXHRcdC8vIGFuY2hvciwgdGhlIHByb3ZpZGVyIGJvdW5kcyB0aGUgY29udGV4dCBmcm9tIGl0cyBPV04gdHJhbnNjcmlwdC4gVGhlXG5cdFx0Ly8gc291cmNlIGNoYXQncyBob3N0IHN0YXRlIGlzIG5ldmVyIHJlYWQgYmFjay5cblx0XHRjb25zdCBmYWxsYmFja0NvbnRleHQgPSBzb3VyY2Uuc291cmNlQ29udGV4dFxuXHRcdFx0Pz8gKGZvcmtlZCA/IHVuZGVmaW5lZCA6IGF3YWl0IHRoaXMuX2J1aWxkU2lkZUNoYXRDb250ZXh0RnJvbVRyYW5zY3JpcHQoc291cmNlLnNvdXJjZSwgc291cmNlLnR1cm5JZCkpO1xuXHRcdGlmICghZm9ya2VkICYmICFmYWxsYmFja0NvbnRleHQgJiYgIXNvdXJjZS5wYXJ0aWFsUmVzcG9uc2UpIHtcblx0XHRcdC8vIE5vdGhpbmcgd2FzIGluaGVyaXRhYmxlOiB0aGUgZm9yayBjb3VsZCBub3QgYmUgYW5jaG9yZWQsIEFnZW50XG5cdFx0XHQvLyBIb3N0IHB1Ymxpc2hlZCBubyBib3VuZGVkIHNvdXJjZSBjb250ZXh0LCBhbmQgdGhlcmUgd2FzIG5vXG5cdFx0XHQvLyBpbi1mbGlnaHQgcGFydGlhbCByZXNwb25zZS4gQ3JlYXRlIHRoZSBzaWRlIGNoYXQgYW55d2F5IFx1MjAxNCBhXG5cdFx0XHQvLyBjb250ZXh0LWxlc3Mgc2lkZSBjaGF0IGlzIGEgZGVncmFkZWQgYnJhbmNoLCBidXQgZmFpbGluZ1xuXHRcdFx0Ly8gYGNyZWF0ZUNoYXRgIG91dHJpZ2h0IHdvdWxkIGxlYXZlIHRoZSB1c2VyIHdpdGggbm8gY2hhdCBhdCBhbGwuXG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGVdIGNyZWF0ZUNoYXQgc2lkZSBjaGF0OiBub3RoaW5nIHRvIGluaGVyaXQgZnJvbSBzb3VyY2UgdHVybiAke3NvdXJjZS50dXJuSWR9IG9mICR7c291cmNlLnNvdXJjZS50b1N0cmluZygpfTsgY3JlYXRpbmcgdGhlIHNpZGUgY2hhdCB3aXRob3V0IGJyYW5jaGluZyBjb250ZXh0YCk7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHQuLi4oZm9ya2VkID8geyBzZGtTZXNzaW9uSWQ6IGZvcmtlZC5zZXNzaW9uSWQgfSA6IHt9KSxcblx0XHRcdHNpZGVDaGF0OiB7XG5cdFx0XHRcdHR1cm5JZDogc291cmNlLnR1cm5JZCxcblx0XHRcdFx0Li4uKHNvdXJjZS5zZWxlY3Rpb24gPyB7IHNlbGVjdGlvbjogc291cmNlLnNlbGVjdGlvbiB9IDoge30pLFxuXHRcdFx0XHQuLi4oZm9ya2VkPy5pbmhlcml0ZWRUdXJuSWQgIT09IHVuZGVmaW5lZCA/IHsgaW5oZXJpdGVkVHVybklkOiBmb3JrZWQuaW5oZXJpdGVkVHVybklkIH0gOiB7fSksXG5cdFx0XHRcdC4uLihmYWxsYmFja0NvbnRleHQgPyB7IGNvbnRleHQ6IGZhbGxiYWNrQ29udGV4dCB9IDoge30pLFxuXHRcdFx0XHQuLi4oc291cmNlLnBhcnRpYWxSZXNwb25zZSA/IHsgcGFydGlhbFJlc3BvbnNlOiBzb3VyY2UucGFydGlhbFJlc3BvbnNlIH0gOiB7fSksXG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogQmluZCBhIGNoYXQgdG8gYW4gU0RLIGNvbnZlcnNhdGlvbiBpbmhlcml0ZWQgZnJvbSBhIGZvcmsgLyBzaWRlLWNoYXRcblx0ICogc291cmNlLiBUaGF0IGNvbnZlcnNhdGlvbiBhbHJlYWR5IG93bnMgYSB0cmFuc2NyaXB0IG9uIGRpc2ssIHNvIG5vdGhpbmdcblx0ICogaXMgbWF0ZXJpYWxpemVkIGhlcmU6IHJlY29yZGluZyB0aGUgYmFja2luZyBhbG9uZSByb3V0ZXMgdGhlIGNoYXQncyBmaXJzdFxuXHQgKiBzZW5kIHRocm91Z2gge0BsaW5rIF9jcmVhdGVQcm92aXNpb25hbENoYXRTZXNzaW9ufSwgd2hpY2ggY29sZC1yZXN1bWVzIGl0XG5cdCAqIChgaXNSZXN1bWU6IHRydWVgKSBleGFjdGx5IGxpa2UgYW55IG90aGVyIHJlc3RvcmVkIGNoYXQgXHUyMDE0IHNlZSBDT05URVhUIE05LlxuXHQgKiBJdHMgcmVzb2x2ZWQgc2V0dGluZ3MgYXJlIHBlcnNpc3RlZCB0byB0aGUgb3ZlcmxheSByaWdodCBhd2F5IHByZWNpc2VseVxuXHQgKiBiZWNhdXNlIHRoZXJlIGlzIG5vIGluLW1lbW9yeSBydW50aW1lIGhvbGRpbmcgdGhlbSBpbiB0aGUgbWVhbnRpbWUuXG5cdCAqXG5cdCAqIEV2ZXJ5dGhpbmcgaW5oZXJpdGVkIGNvbWVzIGZyb20gdGhlIHNvdXJjZSdzIG93biBwcm92aWRlciBzdGF0ZSAoaXRzIFNES1xuXHQgKiBgY3dkYCwgaXRzIGxpdmUgcnVudGltZSwgaXRzIG92ZXJsYXkpOyBob3N0LXN1cHBsaWVkIG9wdGlvbnMgb3ZlcnJpZGUgaXQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9iaW5kSW5oZXJpdGVkQ29udmVyc2F0aW9uKFxuXHRcdGNoYXQ6IFVSSSxcblx0XHRjb250ZXh0OiBJQWdlbnRDaGF0Q29udGV4dCxcblx0XHRzZGtTZXNzaW9uSWQ6IHN0cmluZyxcblx0XHRzaWRlQ2hhdDogSVBlcnNpc3RlZENoYXRbJ3NpZGVDaGF0J10sXG5cdFx0bW9kZWw6IE1vZGVsU2VsZWN0aW9uIHwgdW5kZWZpbmVkLFxuXHRcdG9wdGlvbnM/OiBJQWdlbnRDcmVhdGVDaGF0T3B0aW9ucyxcblx0KTogUHJvbWlzZTxJQWdlbnRDcmVhdGVDaGF0UmVzdWx0PiB7XG5cdFx0Ly8gVGhlIHNvdXJjZSdzIHNldHRpbmdzIGxpdmUgdW5kZXIgaXRzIG93biBleGFjdCBwZXJzaXN0ZW5jZSByZXNvdXJjZSBcdTIwMTRcblx0XHQvLyB0aGUgc2FtZSBrZXkgaXRzIG93biBvdmVybGF5IHdhcyB3cml0dGVuIHVuZGVyIChzZWUgdGhlIHdyaXRlIGJlbG93XG5cdFx0Ly8gYW5kIGBfcGVyc2lzdFNlc3Npb25PdmVybGF5YCkgXHUyMDE0IG5ldmVyIHRoZSBzaGFyZWQgY29uZmlndXJhdGlvbiBzY29wZS5cblx0XHQvLyBUaGF0IHJlc291cmNlIGlzIHRoZSBvbmUgdGhpcyBwcm92aWRlciByZWNvcmRlZCB3aGVuIHRoZSBzb3VyY2UgY2hhdFxuXHRcdC8vIHdhcyBpdHNlbGYgY3JlYXRlZCBvciBtYXRlcmlhbGl6ZWQgKHtAbGluayBfc291cmNlQ2hhdFNjb3BlfSk7IGFcblx0XHQvLyBzb3VyY2Ugd2hvc2Ugc2NvcGUgd2FzIG5ldmVyIHJlY29yZGVkIChubyBjaGF0IGJhY2tpbmcgeWV0LCBlLmcuIGFcblx0XHQvLyBzdGFsZSByZWZlcmVuY2UpIGRlZ3JhZGVzIHRvIHRoZSBzb3VyY2UgVVJJIGl0c2VsZiwgd2hpY2ggaXMgZXhhY3RseVxuXHRcdC8vIGl0cyBvd24gcGVyc2lzdGVuY2UgcmVzb3VyY2UgZm9yIGFueSBjaGF0IHRoYXQgaXNuJ3QgYSBzZXNzaW9uJ3Ncblx0XHQvLyBwcmltYXJ5IGNoYXQuXG5cdFx0Y29uc3Qgc291cmNlQ2hhdCA9IG9wdGlvbnM/LmZvcms/LnNvdXJjZSA/PyBvcHRpb25zPy5zaWRlQ2hhdD8uc291cmNlO1xuXHRcdGNvbnN0IHNvdXJjZUJpbmRpbmcgPSBzb3VyY2VDaGF0ID8gdGhpcy5fc291cmNlQ2hhdFNjb3BlKHNvdXJjZUNoYXQpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHNvdXJjZVJlc291cmNlID0gc291cmNlQmluZGluZz8ucmVzb3VyY2UgPz8gc291cmNlQ2hhdCA/PyBjb250ZXh0LnJlc291cmNlO1xuXHRcdGxldCBzb3VyY2VPdmVybGF5OiBJQ2xhdWRlU2Vzc2lvbk92ZXJsYXkgPSB7fTtcblx0XHR0cnkge1xuXHRcdFx0c291cmNlT3ZlcmxheSA9IGF3YWl0IHRoaXMuX21ldGFkYXRhU3RvcmUucmVhZChzb3VyY2VSZXNvdXJjZSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGVdIGNyZWF0ZUNoYXQ6IHNvdXJjZSBvdmVybGF5IHJlYWQgZmFpbGVkIGZvciAke3NvdXJjZVJlc291cmNlLnRvU3RyaW5nKCl9OyBjb250aW51aW5nIHdpdGggZGVmYXVsdHNgLCBlcnIpO1xuXHRcdH1cblx0XHRjb25zdCBzb3VyY2VTZGtJZCA9IHNvdXJjZUNoYXQgPyB0aGlzLl9zb3VyY2VDaGF0U2RrSWQoc291cmNlQ2hhdCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbGl2ZVNvdXJjZSA9IHNvdXJjZVNka0lkID8gdGhpcy5fZmluZEFueVNlc3Npb24oc291cmNlU2RrSWQpIDogdW5kZWZpbmVkO1xuXHRcdC8vIEEgc291cmNlIHRoYXQgd2FzIGNyZWF0ZWQgKHJlY29yZGluZyBhIGJhY2tpbmcgbW9kZWwpIGJ1dCBuZXZlclxuXHRcdC8vIG1hdGVyaWFsaXplZCBoYXMgbm8gb3ZlcmxheSBlbnRyeSB5ZXQsIHNvIHRoZSBiYWNraW5nJ3Mgb3duIG1vZGVsIFx1MjAxNFxuXHRcdC8vIHRoZSBsYXN0IHJlc29ydCwgYmVsb3cgdGhlIG92ZXJsYXkgb25jZSBvbmUgZXhpc3RzIFx1MjAxNCBpcyB0aGUgb25seVxuXHRcdC8vIHBsYWNlIGl0cyBpbnRlbmRlZCBtb2RlbCBzdXJ2aXZlcyBhIGNvbGQgcmVzdGFydC5cblx0XHRjb25zdCBiYWNraW5nTW9kZWwgPSBzb3VyY2VDaGF0ID8gdGhpcy5fY2hhdEJhY2tpbmdzLmdldChzb3VyY2VDaGF0LnRvU3RyaW5nKCkpPy5tb2RlbCA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBpbmhlcml0ZWRNb2RlbCA9IG1vZGVsID8/IGxpdmVTb3VyY2U/LnByb3Zpc2lvbmFsTW9kZWwgPz8gc291cmNlT3ZlcmxheS5tb2RlbCA/PyBiYWNraW5nTW9kZWw7XG5cdFx0Y29uc3QgYWdlbnQgPSBvcHRpb25zPy5hZ2VudCA/PyBsaXZlU291cmNlPy5wcm92aXNpb25hbEFnZW50ID8/IHNvdXJjZU92ZXJsYXkuYWdlbnQ7XG5cdFx0Y29uc3QgcGVybWlzc2lvbk1vZGUgPSBuYXJyb3dDbGF1ZGVQZXJtaXNzaW9uTW9kZShvcHRpb25zPy5jb25maWc/LltDbGF1ZGVTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25Nb2RlXSkgPz8gbGl2ZVNvdXJjZT8ucGVybWlzc2lvbk1vZGVGYWxsYmFjayA/PyBzb3VyY2VPdmVybGF5LnBlcm1pc3Npb25Nb2RlO1xuXG5cdFx0Ly8gUmVzb2x2ZSB0aGUgaW5oZXJpdGVkIGNvbnZlcnNhdGlvbidzIHdvcmtpbmcgZGlyZWN0b3JpZXMgbm93IHNvIHdlXG5cdFx0Ly8gZmFpbCBmYXN0IHJhdGhlciB0aGFuIGF0IHRoZSBmaXJzdCBgc2VuZE1lc3NhZ2VgLiBUaGUgZm9ya2VkXG5cdFx0Ly8gY29udmVyc2F0aW9uJ3Mgb3duIGBjd2RgIGlzIGF1dGhvcml0YXRpdmU7IGl0cyBhZGRpdGlvbmFsIHJvb3RzIGNvbWVcblx0XHQvLyBmcm9tIHRoZSBsaXZlIHNvdXJjZSBvciwgd2hlbiB0aGUgc291cmNlIGlzIHVubG9hZGVkLCBpdHMgb3ZlcmxheS5cblx0XHQvLyBUaGUgcmVxdWVzdGVkIHNldCBpcyB0aGUgbGFzdCByZXNvcnQgXHUyMDE0IGFuIGluaGVyaXRlZCBjb252ZXJzYXRpb24gcnVuc1xuXHRcdC8vIHdoZXJlIGl0cyB0cmFuc2NyaXB0IHdhcyByZWNvcmRlZCwgbm90IHdoZXJlIHRoZSByZXF1ZXN0IHBvaW50ZWQuXG5cdFx0Y29uc3Qgc2RrSW5mbyA9IGF3YWl0IHRoaXMuX3Nka1NlcnZpY2UuZ2V0U2Vzc2lvbkluZm8oc2RrU2Vzc2lvbklkKTtcblx0XHRjb25zdCBpbmhlcml0ZWREaXJlY3RvcmllcyA9IGxpdmVTb3VyY2U/LndvcmtpbmdEaXJlY3RvcmllcyA/PyBzb3VyY2VPdmVybGF5LndvcmtpbmdEaXJlY3RvcmllcyA/PyBvcHRpb25zPy53b3JraW5nRGlyZWN0b3JpZXM7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IHNka0luZm8/LmN3ZCA/IFVSSS5maWxlKHNka0luZm8uY3dkKSA6IGluaGVyaXRlZERpcmVjdG9yaWVzPy5bMF07XG5cdFx0aWYgKCF3b3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBjcmVhdGUgY2hhdCAke2NoYXQudG9TdHJpbmcoKX06IGluaGVyaXRlZCBjb252ZXJzYXRpb24gJHtzZGtTZXNzaW9uSWR9IGhhcyBubyB3b3JraW5nIGRpcmVjdG9yeSAoU0RLIGN3ZCBhbmQgc291cmNlIHdvcmtpbmcgZGlyZWN0b3JpZXMgbWlzc2luZylgKTtcblx0XHR9XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yaWVzID0gW3dvcmtpbmdEaXJlY3RvcnksIC4uLihpbmhlcml0ZWREaXJlY3Rvcmllcz8uc2xpY2UoMSkgPz8gW10pXTtcblxuXHRcdC8vIEV2ZXJ5IGxhdGVyIHJlc29sdXRpb24vbWF0ZXJpYWxpemUgc2l0ZVxuXHRcdC8vIChgX2NyZWF0ZVByb3Zpc2lvbmFsQ2hhdFNlc3Npb25gLCBgX3BlcnNpc3RTZXNzaW9uT3ZlcmxheWApIHJlYWRzIHRoaXNcblx0XHQvLyBjaGF0J3Mgb3ZlcmxheSBiYWNrIGJ5IGl0cyBob3N0LXN1cHBsaWVkIHBlcnNpc3RlbmNlIHJlc291cmNlLCBzbyBrZXlcblx0XHQvLyB0aGUgd3JpdGUgdG8gZXhhY3RseSB0aGF0LlxuXHRcdGF3YWl0IHRoaXMuX21ldGFkYXRhU3RvcmUud3JpdGUoY29udGV4dC5yZXNvdXJjZSwge1xuXHRcdFx0Li4uKGluaGVyaXRlZE1vZGVsID8geyBtb2RlbDogaW5oZXJpdGVkTW9kZWwgfSA6IHt9KSxcblx0XHRcdC4uLihwZXJtaXNzaW9uTW9kZSA/IHsgcGVybWlzc2lvbk1vZGUgfSA6IHt9KSxcblx0XHRcdC4uLihhZ2VudCA/IHsgYWdlbnQgfSA6IHt9KSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcmllcyxcblx0XHR9KTtcblx0XHRjb25zdCBwcm9qZWN0ID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVByb2plY3Qod29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0Y29uc3QgYmFja2luZyA9IHRoaXMuX3JlY29yZENoYXRCYWNraW5nKGNoYXQsIHsgc2RrU2Vzc2lvbklkLCAuLi4oaW5oZXJpdGVkTW9kZWwgPyB7IG1vZGVsOiBpbmhlcml0ZWRNb2RlbCB9IDoge30pLCAuLi4oc2lkZUNoYXQgPyB7IHNpZGVDaGF0IH0gOiB7fSkgfSk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ2xhdWRlXSBCb3VuZCBjaGF0ICR7Y2hhdC50b1N0cmluZygpfSB0byBpbmhlcml0ZWQgY29udmVyc2F0aW9uICR7c2RrU2Vzc2lvbklkfSBmb3Igc2NvcGUgJHtjb250ZXh0LmNvbmZpZ3VyYXRpb25SZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZXNvbHZlZFdvcmtpbmdEaXJlY3Rvcnk6IHdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHQuLi4ocHJvamVjdCA/IHsgcHJvamVjdCB9IDoge30pLFxuXHRcdFx0Li4udGhpcy5fY2hhdEJhY2tpbmdSZXN1bHQoYmFja2luZyksXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCaW5kIGEgY2hhdCB0byBhIGZyZXNobHkgbWludGVkIFNESyBjb252ZXJzYXRpb24sIHdob3NlIGlkIGlzIGluZGVwZW5kZW50XG5cdCAqIG9mIHRoZSBBZ2VudCBIb3N0IHNlc3Npb24gaWQuIFRoZSBjb252ZXJzYXRpb24gaXMgcHJvdmlzaW9uYWw6IG5vdGhpbmdcblx0ICogcmVhY2hlcyB0aGUgU0RLIChhbmQgbm90aGluZyBpcyBwZXJzaXN0ZWQpIHVudGlsIHRoZSBjaGF0J3MgZmlyc3Qgc2VuZFxuXHQgKiBtYXRlcmlhbGl6ZXMgaXQsIHNvIHRoZSBpbi1tZW1vcnkge0BsaW5rIENsYXVkZUFnZW50U2Vzc2lvbn0gY2FycmllcyB0aGVcblx0ICogcmVzb2x2ZWQgbW9kZWwgLyBhZ2VudCAvIGNvbmZpZyAvIHBlcm1pc3Npb24gbW9kZSB1bnRpbFxuXHQgKiB7QGxpbmsgX3BlcnNpc3RTZXNzaW9uT3ZlcmxheX0gd3JpdGVzIHRoZW0gYXQgbWF0ZXJpYWxpemUgdGltZS5cblx0ICpcblx0ICogYGltcG9ydENvbnZlcnNhdGlvbmAgaGFzIG5vIG5hdGl2ZSB0cmFuc2NyaXB0LXNlZWRpbmcgY2FwYWJpbGl0eSBvblxuXHQgKiBDbGF1ZGUgKHVubGlrZSBDb3BpbG90J3MgSlNPTkwgZXZlbnQtbG9nIGltcG9ydCk6IHRoZXJlIGlzIG5vIFNESyBBUEkgdG9cblx0ICogc2VlZCBhIGNvbnZlcnNhdGlvbiBmcm9tIGFyYml0cmFyeSBgVHVybltdYC4gVGhlIGltcG9ydGVkIHR1cm5zJyBkaXNwbGF5XG5cdCAqIGlzIHRoZSBob3N0LWxldmVsIGNhdGFsb2cncyByZXNwb25zaWJpbGl0eSB1bnRpbCB0aGlzIGNoYXQncyBmaXJzdCByZWFsXG5cdCAqIGBzZW5kTWVzc2FnZWAgc3RhcnRzIGEgZ2VudWluZSBTREsgdHJhbnNjcmlwdC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2JpbmRGcmVzaENvbnZlcnNhdGlvbihcblx0XHRjaGF0OiBVUkksXG5cdFx0Y29udGV4dDogSUFnZW50Q2hhdENvbnRleHQsXG5cdFx0c2lkZUNoYXQ6IElQZXJzaXN0ZWRDaGF0WydzaWRlQ2hhdCddLFxuXHRcdG1vZGVsOiBNb2RlbFNlbGVjdGlvbiB8IHVuZGVmaW5lZCxcblx0XHRvcHRpb25zPzogSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMsXG5cdCk6IFByb21pc2U8SUFnZW50Q3JlYXRlQ2hhdFJlc3VsdD4ge1xuXHRcdGNvbnN0IHNka1Nlc3Npb25JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdC8vIEEgY2hhdCBBSCByZXNvbHZlZCBubyB3b3JraW5nIGRpcmVjdG9yeSBmb3IgKGEgd29ya3NwYWNlLWxlc3MgcXVpY2tcblx0XHQvLyBjaGF0KSBydW5zIGluIGEgc3RhYmxlIHBlci1zZXNzaW9uIHNjcmF0Y2ggZGlyIHNoYXJlZCB3aXRoIHRoZSBDb3BpbG90XG5cdFx0Ly8gYWdlbnQ7IHdpdGhvdXQgYSBjd2QgQ2xhdWRlIHRocm93cyBhdCBtYXRlcmlhbGl6ZS4gVGhlIHdvcmtzcGFjZS1sZXNzXG5cdFx0Ly8gbWFya2VyIGl0c2VsZiBpcyBvd25lZC9wZXJzaXN0ZWQgY2VudHJhbGx5IGJ5IHRoZSBBSCBzZXJ2aWNlLlxuXHRcdGNvbnN0IHJlcXVlc3RlZFdvcmtpbmdEaXJlY3RvcnkgPSBvcHRpb25zPy53b3JraW5nRGlyZWN0b3JpZXM/LlswXTtcblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gcmVxdWVzdGVkV29ya2luZ0RpcmVjdG9yeSA/PyBhd2FpdCBlbnN1cmVXb3Jrc3BhY2VsZXNzU2NyYXRjaERpcih0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UudXNlckhvbWUsIEFnZW50U2Vzc2lvbi5pZChjb250ZXh0LmNvbmZpZ3VyYXRpb25SZXNvdXJjZSkpO1xuXHRcdC8vIE9ubHkgcHJvYmUgZm9yIGEgcHJvamVjdCB3aGVuIEFIIHJlc29sdmVkIGEgcmVhbCBmb2xkZXI7IGEgc2NyYXRjaCBkaXJcblx0XHQvLyBpcyBuZXZlciBhIGNvZGUgcHJvamVjdC5cblx0XHRjb25zdCBwcm9qZWN0ID0gcmVxdWVzdGVkV29ya2luZ0RpcmVjdG9yeSA/IGF3YWl0IHRoaXMuX3Jlc29sdmVQcm9qZWN0KHJlcXVlc3RlZFdvcmtpbmdEaXJlY3RvcnkpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGJhY2tpbmcgPSB0aGlzLl9yZWNvcmRDaGF0QmFja2luZyhjaGF0LCB7IHNka1Nlc3Npb25JZCwgLi4uKG1vZGVsID8geyBtb2RlbCB9IDoge30pLCAuLi4oc2lkZUNoYXQgPyB7IHNpZGVDaGF0IH0gOiB7fSkgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IENsYXVkZUFnZW50U2Vzc2lvbi5jcmVhdGVQcm92aXNpb25hbChcblx0XHRcdHNka1Nlc3Npb25JZCxcblx0XHRcdGNoYXQsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0cHJvamVjdCxcblx0XHRcdG1vZGVsLFxuXHRcdFx0b3B0aW9ucz8uYWdlbnQsXG5cdFx0XHRvcHRpb25zPy5jb25maWcsXG5cdFx0XHRuZXcgUGVuZGluZ1JlcXVlc3RSZWdpc3RyeTxDYWxsVG9vbFJlc3VsdD4oKSxcblx0XHRcdHRoaXMuX3Jlc29sdmVQZXJtaXNzaW9uTW9kZShvcHRpb25zPy5jb25maWcpLFxuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRvcHRpb25zPy53b3JraW5nRGlyZWN0b3JpZXM/LnNsaWNlKDEpID8/IFtdLFxuXHRcdCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJMaXZlQ2hhdChjaGF0LCBzZXNzaW9uKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtDbGF1ZGVdIEJvdW5kIGNoYXQgJHtjaGF0LnRvU3RyaW5nKCl9IHRvIGZyZXNoIGNvbnZlcnNhdGlvbiAke3Nka1Nlc3Npb25JZH0gZm9yIHNjb3BlICR7Y29udGV4dC5jb25maWd1cmF0aW9uUmVzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb2x2ZWRXb3JraW5nRGlyZWN0b3J5OiB3b3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0cHJvdmlzaW9uYWw6IHRydWUsXG5cdFx0XHQuLi4ocHJvamVjdCA/IHsgcHJvamVjdCB9IDoge30pLFxuXHRcdFx0Li4udGhpcy5fY2hhdEJhY2tpbmdSZXN1bHQoYmFja2luZyksXG5cdFx0fTtcblx0fVxuXG5cdC8qKiBSZWNvcmQgYSBjaGF0J3MgZXhhY3QgYmFja2luZywgcmVwbGFjaW5nIGFueSBwcmV2aW91cyBvbmUuICovXG5cdHByaXZhdGUgX3JlY29yZENoYXRCYWNraW5nKGNoYXQ6IFVSSSwgYmFja2luZzogSUNsYXVkZUNoYXRCYWNraW5nKTogSUNsYXVkZUNoYXRCYWNraW5nIHtcblx0XHR0aGlzLl9jaGF0QmFja2luZ3Muc2V0KGNoYXQudG9TdHJpbmcoKSwgYmFja2luZyk7XG5cdFx0cmV0dXJuIGJhY2tpbmc7XG5cdH1cblxuXHQvKiogQmVzdC1lZmZvcnQgZ2l0IHByb2plY3QgbWV0YWRhdGEgZm9yIGEgcmVzb2x2ZWQgd29ya2luZyBkaXJlY3RvcnkuICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVQcm9qZWN0KHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSk6IFByb21pc2U8SUFnZW50U2Vzc2lvblByb2plY3RJbmZvIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBwcm9qZWN0RnJvbUNvcGlsb3RDb250ZXh0KHsgY3dkOiB3b3JraW5nRGlyZWN0b3J5LmZzUGF0aCB9LCB0aGlzLl9naXRTZXJ2aWNlKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZV0gcHJvamVjdCByZXNvbHV0aW9uIGZhaWxlZCBmb3IgJHt3b3JraW5nRGlyZWN0b3J5LnRvU3RyaW5nKCl9OyBjb250aW51aW5nIHdpdGhvdXQgcHJvamVjdGAsIGVycik7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBEaXNwb3NlIGV4YWN0bHkgb25lIGNoYXQsIHRlYXJpbmcgZG93biBpdHMgbGl2ZSBTREsgc2Vzc2lvbiAoaWYgYW55KSBhbmRcblx0ICogZHJvcHBpbmcgaXRzIGJhY2tpbmcuXG5cdCAqXG5cdCAqIFJvdXRlZCB0aHJvdWdoIHtAbGluayBfc2Vzc2lvblNlcXVlbmNlcn0gKGtleWVkIG9uIHRoZSBjaGF0J3MgU0RLIGlkKSBzb1xuXHQgKiBpdCB3YWl0cyBmb3IgYW55IGluLWZsaWdodCB7QGxpbmsgX3Jlc29sdmVPclJlc3VtZUNoYXRTZXNzaW9uTG9ja2VkfSBvclxuXHQgKiB7QGxpbmsgc2VuZE1lc3NhZ2V9IHRvIGZpbmlzaCBiZWZvcmUgdGVhcmluZyBkb3duIFx1MjAxNCBwcmV2ZW50c1xuXHQgKiB1c2UtYWZ0ZXItZGlzcG9zZSBpZiBhIHNlbmQgaXMgY29uY3VycmVudGx5IGluIHByb2dyZXNzLiBUaGUgZHVyYWJsZVxuXHQgKiBjaGF0IGNhdGFsb2cgaXMgb3duZWQgYnkgdGhlIG9yY2hlc3RyYXRvciBub3csIHNvIHRoaXMgb25seSBkcm9wcyB0aGVcblx0ICogbGl2ZSBzZXNzaW9uIGFuZCBpdHMgcHJvdmlkZXIgYmFja2luZyBkYXRhLiBUaGVyZSBpcyBubyBzZXBhcmF0ZVxuXHQgKiBzZXNzaW9uLWxldmVsIGZpbmFsaXphdGlvbiBob29rOiB0aGUgdHJhY2UgY29udGV4dCBrZXllZCBvbiB0aGUgY2hhdCdzXG5cdCAqIG93biBgcmVzb3VyY2VgICh0aGUgY29uZmlndXJhdGlvbiBzY29wZSwgZm9yIGEgc2Vzc2lvbidzIHByaW1hcnkgY2hhdClcblx0ICogaXMgcmVsZWFzZWQgcmlnaHQgaGVyZSwgb25jZSwgd2hlbiB0aGF0IGV4YWN0IGNoYXQgaXMgZGlzcG9zZWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9kaXNwb3NlQ2hhdChjaGF0OiBVUkksIG9wZXJhdGlvbkNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2hhdEtleSA9IGNoYXQudG9TdHJpbmcoKTtcblx0XHRjb25zdCBpbml0aWFsQ29udGV4dCA9IHRoaXMuX3Jlc29sdmVDaGF0Q29udGV4dChjaGF0LCBvcGVyYXRpb25Db250ZXh0KTtcblx0XHRhd2FpdCB0aGlzLl9zZXNzaW9uU2VxdWVuY2VyLnF1ZXVlKGluaXRpYWxDb250ZXh0LnNlcXVlbmNlcktleSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fZmluZENoYXRCeVVyaShjaGF0S2V5KTtcblx0XHRcdGlmICh0YXJnZXQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZGlzcG9zZUxpdmVTZXNzaW9uKHRhcmdldCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jaGF0QmFja2luZ3MuZGVsZXRlKGNoYXRLZXkpO1xuXHRcdFx0dGhpcy5fY2hhdENvbmZpZ1Njb3Blcy5kZWxldGUoY2hhdEtleSk7XG5cdFx0XHR0aGlzLl9wcnVuZUFjdGl2ZUNsaWVudEhhbmRsZXNGb3JDaGF0KGNoYXQpO1xuXHRcdFx0dGhpcy5fb3RlbFNlcnZpY2UucmVsZWFzZVNlc3Npb25UcmFjZUNvbnRleHQoaW5pdGlhbENvbnRleHQucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0fSk7XG5cdFx0Ly8gVGhlIENsYXVkZSBTREsgZXhwb3NlcyBubyBkZWxldGUtY2hhdCBSUEMsIHNvIHRoZSBmb3JrZWQgL1xuXHRcdC8vIGZyZXNoIHRyYW5zY3JpcHQgaXMgbGVmdCBvbiBkaXNrOyB3aXRob3V0IGEgY2F0YWxvZyBlbnRyeSBpdCBpcyBuZXZlclxuXHRcdC8vIHJlc3VtZWQgYWdhaW4uXG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWxlYXNlQ2hhdChjaGF0OiBVUkksIG9wZXJhdGlvbkNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2hhdEtleSA9IGNoYXQudG9TdHJpbmcoKTtcblx0XHRjb25zdCBpbml0aWFsQ29udGV4dCA9IHRoaXMuX3Jlc29sdmVDaGF0Q29udGV4dChjaGF0LCBvcGVyYXRpb25Db250ZXh0KTtcblx0XHRhd2FpdCB0aGlzLl9zZXNzaW9uU2VxdWVuY2VyLnF1ZXVlKGluaXRpYWxDb250ZXh0LnNlcXVlbmNlcktleSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fZmluZENoYXRCeVVyaShjaGF0S2V5KTtcblx0XHRcdGlmICghdGFyZ2V0IHx8ICF0YXJnZXQuaXNQaXBlbGluZVJlYWR5IHx8IHRhcmdldC5oYXNBY3RpdmVUdXJuKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NsYXVkZToke3RhcmdldC5zZXNzaW9uSWR9XSBSZWxlYXNpbmcgaWRsZSBjaGF0IGZyb20gbWVtb3J5IChkdXJhYmxlIHN0YXRlIHByZXNlcnZlZClgKTtcblx0XHRcdGF3YWl0IHRoaXMuX2Rpc3Bvc2VMaXZlU2Vzc2lvbih0YXJnZXQpO1xuXHRcdFx0Ly8gTkI6IGBfY2hhdEJhY2tpbmdzYCByZXRhaW5zIHRoZSBiYWNraW5nIGFjcm9zcyByZWxlYXNlIHNvIHRoZSBjaGF0XG5cdFx0XHQvLyByZXNvbHZlcyB1bmlmb3JtbHkgb24gdGhlIG5leHQgY29sZCByZXN1bWUtb24tc2VuZC5cblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGb3JrIHRoZSBzb3VyY2UgY2hhdCdzIFNESyBjb252ZXJzYXRpb24gYXQgdGhlIHJlcXVlc3RlZCB0dXJuIGFuZCByZXR1cm5cblx0ICogdGhlIG5ldyBjb252ZXJzYXRpb24ncyBpZCBwbHVzIHRoZSBpZCBvZiBpdHMgZmluYWwgaW5oZXJpdGVkIHR1cm4uIFJldHVybnNcblx0ICogYHVuZGVmaW5lZGAgXHUyMDE0IHNvIHRoZSBjYWxsZXIgbWludHMgYSBmcmVzaCBjb252ZXJzYXRpb24gaW5zdGVhZCBcdTIwMTQgd2hlbiB0aGVcblx0ICogc291cmNlIGNoYXQgaGFzIG5vIGJhY2tpbmcgb3IgdGhlIGZvcmsgYW5jaG9yIGlzIGFic2VudCBmcm9tIHRoZSBTREtcblx0ICogdHJhbnNjcmlwdC5cblx0ICpcblx0ICogRGVsaWJlcmF0ZWx5IE5PVCBzZXJpYWxpemVkIGFnYWluc3QgdGhlIHNvdXJjZSBjb252ZXJzYXRpb246IGEgc2lkZSBjaGF0XG5cdCAqIGJyYW5jaGVzIGZyb20gYSB0dXJuIHRoYXQgaXMgdHlwaWNhbGx5IHN0aWxsIGluIGZsaWdodCwgc28gd2FpdGluZyBmb3Jcblx0ICogdGhlIHNvdXJjZSdzIHNlcXVlbmNlciB3b3VsZCBwYXJrIHRoZSBuZXcgY2hhdCBiZWhpbmQgdGhlIHZlcnkgdHVybiBpdFxuXHQgKiBicmFuY2hlcyBmcm9tLiBUaGUgU0RLJ3MgZmx1c2hlZCB0cmFuc2NyaXB0IGlzIHJlYWQtb25seSBoZXJlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZm9ya0NoYXQoZm9yazogeyByZWFkb25seSBzb3VyY2U6IFVSSTsgcmVhZG9ubHkgdHVybklkOiBzdHJpbmcgfSk6IFByb21pc2U8eyBzZXNzaW9uSWQ6IHN0cmluZzsgaW5oZXJpdGVkVHVybklkOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHNvdXJjZVNka0lkID0gdGhpcy5fc291cmNlQ2hhdFNka0lkKGZvcmsuc291cmNlKTtcblx0XHRpZiAoIXNvdXJjZVNka0lkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGVdIGNyZWF0ZUNoYXQgZm9yazogc291cmNlICR7Zm9yay5zb3VyY2UudG9TdHJpbmcoKX0gaGFzIG5vIFNESyBjaGF0OyBjcmVhdGluZyBmcmVzaCBjaGF0YCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBtZXNzYWdlcyA9IGF3YWl0IHRoaXMuX3Nka1NlcnZpY2UuZ2V0U2Vzc2lvbk1lc3NhZ2VzKHNvdXJjZVNka0lkLCB7IGluY2x1ZGVTeXN0ZW1NZXNzYWdlczogdHJ1ZSB9KTtcblx0XHRjb25zdCB1cFRvTWVzc2FnZUlkID0gcmVzb2x2ZUZvcmtBbmNob3JVdWlkKG1lc3NhZ2VzLCBmb3JrLnR1cm5JZCk7XG5cdFx0aWYgKHVwVG9NZXNzYWdlSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ2xhdWRlXSBjcmVhdGVDaGF0IGZvcms6IHR1cm4gJHtmb3JrLnR1cm5JZH0gbm90IGZvdW5kIGluIHNvdXJjZSAke3NvdXJjZVNka0lkfTsgY3JlYXRpbmcgZnJlc2ggY2hhdGApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgeyBzZXNzaW9uSWQgfSA9IGF3YWl0IHRoaXMuX3Nka1NlcnZpY2UuZm9ya1Nlc3Npb24oc291cmNlU2RrSWQsIHsgdXBUb01lc3NhZ2VJZCB9KTtcblx0XHRjb25zdCBhbmNob3JJbmRleCA9IG1lc3NhZ2VzLmZpbmRJbmRleChtZXNzYWdlID0+IG1lc3NhZ2UudXVpZCA9PT0gdXBUb01lc3NhZ2VJZCk7XG5cdFx0Y29uc3QgaW5oZXJpdGVkVHVybnMgPSBtYXBTZXNzaW9uTWVzc2FnZXNUb1R1cm5zKG1lc3NhZ2VzLnNsaWNlKDAsIGFuY2hvckluZGV4ICsgMSksIGZvcmsuc291cmNlLCB0aGlzLl9sb2dTZXJ2aWNlKTtcblx0XHRyZXR1cm4geyBzZXNzaW9uSWQsIGluaGVyaXRlZFR1cm5JZDogaW5oZXJpdGVkVHVybnMuYXQoLTEpPy5pZCB9O1xuXHR9XG5cblxuXHQvKiogUmVzb2x2ZXMgdGhlIFNESyBjb252ZXJzYXRpb24gcmVjb3JkZWQgZm9yIGFuIGV4YWN0IHNvdXJjZSBjaGF0LiAqL1xuXHRwcml2YXRlIF9zb3VyY2VDaGF0U2RrSWQoc291cmNlOiBVUkkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jaGF0QmFja2luZ3MuZ2V0KHNvdXJjZS50b1N0cmluZygpKT8uc2RrU2Vzc2lvbklkO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJvdW5kZWQgc291cmNlLWNoYXQgY29udGV4dCBmb3IgYSBzaWRlIGNoYXQgd2hvc2UgZm9yayBjb3VsZCBub3QgYmVcblx0ICogYW5jaG9yZWQsIHJlY29uc3RydWN0ZWQgZnJvbSB0aGUgc291cmNlIGNoYXQncyAqKm93biBTREsgdHJhbnNjcmlwdCoqLlxuXHQgKlxuXHQgKiBVc2VkIG9ubHkgd2hlbiBBZ2VudCBIb3N0IHN1cHBsaWVkIG5vbmUgb2YgaXRzIG93bi4gVGhlIHRyYW5zY3JpcHQgaXNcblx0ICogcHJvdmlkZXItb3duZWQgZGF0YSwgc28gdGhpcyByZWFkcyBubyBob3N0IHN0YXRlIGFuZCByZS1kZXJpdmVzIG5vIGhvc3Rcblx0ICogZmFjdCBcdTIwMTQgYW5kIGJlY2F1c2UgdGhlIFNESyBhc3NpZ25zIGl0cyBvd24gZW52ZWxvcGUgaWRzLCB0aGUgcmVxdWVzdGVkXG5cdCAqIHR1cm4gaXMgYm91bmRlZCB3aGVuIHRoZSB0cmFuc2NyaXB0IGhhcHBlbnMgdG8gY2FycnkgaXQgYW5kIHRoZSB3aG9sZVxuXHQgKiB0cmFuc2NyaXB0IGlzIHVzZWQgb3RoZXJ3aXNlLlxuXHQgKlxuXHQgKiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gdGhlIFNESyBjYW5ub3Qgc2VydmUgdGhlIHNvdXJjZSB0cmFuc2NyaXB0LFxuXHQgKiB3aGljaCBpcyB0aGUgbm9ybWFsIGNhc2UgZm9yIGEgc291cmNlIGNvbnZlcnNhdGlvbiB0aGF0IGlzIHN0aWxsIGxpdmU6XG5cdCAqIENsYXVkZSdzIHNlc3Npb24gc3RvcmUgb25seSBhbnN3ZXJzIGZvciBjb252ZXJzYXRpb25zIGl0IGhhcyBmbHVzaGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfYnVpbGRTaWRlQ2hhdENvbnRleHRGcm9tVHJhbnNjcmlwdChzb3VyY2U6IFVSSSwgdHVybklkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHNvdXJjZVNka0lkID0gdGhpcy5fc291cmNlQ2hhdFNka0lkKHNvdXJjZSk7XG5cdFx0aWYgKCFzb3VyY2VTZGtJZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgdHVybnMgPSBhd2FpdCB0aGlzLl9yZWNvbnN0cnVjdFR1cm5zKHNvdXJjZVNka0lkLCBzb3VyY2UsIHVuZGVmaW5lZCk7XG5cdFx0aWYgKHR1cm5zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ2xhdWRlXSBjcmVhdGVDaGF0IHNpZGUgY2hhdDogc291cmNlICR7c291cmNlLnRvU3RyaW5nKCl9IChzZGsgJHtzb3VyY2VTZGtJZH0pIGhhcyBubyByZWFkYWJsZSB0cmFuc2NyaXB0IHRvIGJvdW5kIGNvbnRleHQgZnJvbWApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgaW5kZXggPSB0dXJucy5maW5kSW5kZXgodHVybiA9PiB0dXJuLmlkID09PSB0dXJuSWQpO1xuXHRcdHJldHVybiBidWlsZFNpZGVDaGF0U291cmNlQ29udGV4dChpbmRleCA+PSAwID8gdHVybnMuc2xpY2UoMCwgaW5kZXggKyAxKSA6IHR1cm5zKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBsaXZlIHtAbGluayBDbGF1ZGVBZ2VudFNlc3Npb259IGZvciBhbiBleGFjdCBjaGF0LCByZXN1bWluZ1xuXHQgKiBpdHMgcHJvdmlkZXIgYmFja2luZyB3aGVuIG5lY2Vzc2FyeS4gVGhlIGNhbGxlciBob2xkcyB0aGUgY2hhdCBzZXF1ZW5jZXIuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlT3JSZXN1bWVDaGF0U2Vzc2lvbkxvY2tlZChjb250ZXh0OiBJUmVzb2x2ZWRDbGF1ZGVDaGF0Q29udGV4dCwgd29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgVVJJW10pOiBQcm9taXNlPENsYXVkZUFnZW50U2Vzc2lvbj4ge1xuXHRcdGNvbnN0IHsgY29uZmlndXJhdGlvblJlc291cmNlLCBjaGF0LCBjaGF0S2V5LCByZXNvdXJjZSB9ID0gY29udGV4dDtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2ZpbmRDaGF0QnlVcmkoY2hhdEtleSk7XG5cdFx0aWYgKGV4aXN0aW5nPy5pc1BpcGVsaW5lUmVhZHkpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cdFx0Ly8gVGhlIHNlbmQncyBvd24gcmVzb2x2ZWQgc25hcHNob3QgaXMgdGhlIGxhc3QtcmVzb3J0IHBsYWNlbWVudCBmb3IgYVxuXHRcdC8vIGNoYXQgd2hvc2UgY29udmVyc2F0aW9uIG5ldmVyIHJlYWNoZWQgdGhlIFNESyBhbmQgd2hvc2Ugb3ZlcmxheSB3YXNcblx0XHQvLyBuZXZlciB3cml0dGVuIChhIGZyZXNoIGNoYXQgY3JlYXRlZCBpbiBhIHByZXZpb3VzIHdpbmRvdykuXG5cdFx0Y29uc3QgY2hhdFNlc3Npb24gPSBleGlzdGluZyA/PyBhd2FpdCB0aGlzLl9jcmVhdGVQcm92aXNpb25hbENoYXRTZXNzaW9uKGNvbmZpZ3VyYXRpb25SZXNvdXJjZSwgY2hhdCwgcmVzb3VyY2UsIHdvcmtpbmdEaXJlY3Rvcmllcyk7XG5cdFx0Ly8gUmVzdW1lIHdoZW4gdGhlIFNESyBhbHJlYWR5IGhhcyBhIHRyYW5zY3JpcHQgZm9yIHRoaXMgY2hhdFxuXHRcdC8vIChmb3JrZWQgb3IgcmVzdG9yZWQpOyBvdGhlcndpc2UgbWF0ZXJpYWxpemUgYSBmcmVzaCBvbmUuXG5cdFx0Y29uc3Qgc2RrSW5mbyA9IGF3YWl0IHRoaXMuX3Nka1NlcnZpY2UuZ2V0U2Vzc2lvbkluZm8oY2hhdFNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHQvLyBGYWlsIGZhc3Qgb24gYSBzaWduZWQtb3V0IHByb3h5IGJlZm9yZSBtYXRlcmlhbGl6aW5nLCBrZWVwaW5nIHRoZSB0aHJvdyBhdFxuXHRcdC8vIHRoaXMgcHJlLWB0cnlgIHNpdGUgc28gdGhlIGZyZXNobHktYnVpbHQgY2hhdCBpcyBsZWZ0IHJlZ2lzdGVyZWQgZm9yIGFcblx0XHQvLyByZXRyeSByYXRoZXIgdGhhbiBkaXNwb3NlZC4gVGhlIHJlc29sdmVkIHRyYW5zcG9ydCBpcyBwYXNzZWQgaW50byBtYXRlcmlhbGl6ZVxuXHRcdC8vIGFzIGEgdmFsdWU7IGEgcGVyLXNlc3Npb24gcHJvdmlkZXIgc3dpdGNoIGlzIHB1c2hlZCBpbiBsYXRlciBhdCBzZW5kIHRpbWUuXG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gdGhpcy5fZW5zdXJlQXV0aGVudGljYXRlZChjaGF0U2Vzc2lvbi5wcm92aXNpb25hbE1vZGVsKTtcblx0XHRjb25zdCBjYW5Vc2VUb29sID0gdGhpcy5fbWFrZUNhblVzZVRvb2woY2hhdFNlc3Npb24uc2Vzc2lvbklkLCBjb25maWd1cmF0aW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IG9uRWxpY2l0YXRpb24gPSB0aGlzLl9tYWtlT25FbGljaXRhdGlvbihjaGF0U2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdHRoaXMuX3JlY29yZENoYXRTY29wZShjaGF0LCBjb25maWd1cmF0aW9uUmVzb3VyY2UsIHJlc291cmNlKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgY2hhdFNlc3Npb24ubWF0ZXJpYWxpemUoe1xuXHRcdFx0XHR0cmFuc3BvcnQsXG5cdFx0XHRcdGNhblVzZVRvb2wsXG5cdFx0XHRcdG9uRWxpY2l0YXRpb24sXG5cdFx0XHRcdGlzUmVzdW1lOiAhIXNka0luZm8sXG5cdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHRjb25maWdSZXNvdXJjZTogY29uZmlndXJhdGlvblJlc291cmNlLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogY29udGV4dC5jdXN0b21pemF0aW9ucyxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzLFxuXHRcdFx0XHRzZXJ2ZXJUb29sSG9zdDogdGhpcy5fc2VydmVyVG9vbEhvc3QsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IHRoaXMuX3BlcnNpc3RTZXNzaW9uT3ZlcmxheShyZXNvdXJjZSwgY29uZmlndXJhdGlvblJlc291cmNlLCBjaGF0U2Vzc2lvbiwgdHJhbnNwb3J0LmtpbmQpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fZGVsZXRlTGl2ZUNoYXQoY2hhdEtleSk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkTWF0ZXJpYWxpemVDaGF0LmZpcmUoe1xuXHRcdFx0Y2hhdDogY29udGV4dC5jaGF0LFxuXHRcdFx0cHJvamVjdDogY2hhdFNlc3Npb24ucHJvamVjdCxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcmllczogd29ya2luZ0RpcmVjdG9yaWVzID8/IGNoYXRTZXNzaW9uLndvcmtpbmdEaXJlY3Rvcmllcyxcblx0XHR9KTtcblx0XHRyZXR1cm4gY2hhdFNlc3Npb247XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZXMgdGhlIGxpdmUgcnVudGltZSBmb3IgYW4gYWRkcmVzc2VkIGNoYXQsIG1hdGVyaWFsaXppbmcgb3Jcblx0ICogY29sZC1yZXN1bWluZyBpdHMgZXhhY3QgYmFja2luZyBhcyBuZWVkZWQuXG5cdCAqXG5cdCAqIFVuaWZvcm0gZm9yIGV2ZXJ5IGNoYXQ6IHRoZXJlIGlzIG9uZSBwcm92aWRlciBzdGF0ZSB0byBjb25zdWx0ICh0aGVcblx0ICogY2hhdCdzIGV4YWN0IGJhY2tpbmcpIGFuZCBvbmUgc2hhcGUgb2YgcmVzb2x1dGlvbi4gQSBjaGF0IHdpdGggbm9cblx0ICogYmFja2luZyBpcyBhIGhvc3QgY29udHJhY3QgdmlvbGF0aW9uIFx1MjAxNCBBZ2VudCBIb3N0IGNyZWF0ZXMgb3Jcblx0ICogcmUtbWF0ZXJpYWxpemVzIGEgYmFja2luZyBiZWZvcmUgYWRkcmVzc2luZyBhbnkgb3BlcmF0aW9uIHRvIGEgY2hhdCBcdTIwMTRcblx0ICogc28gaXQgc3VyZmFjZXMgcmF0aGVyIHRoYW4gYmVpbmcgZ3Vlc3NlZCBhdCBmcm9tIHRoZSBzZXNzaW9uIGlkZW50aXR5LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZW5zdXJlUmVzb2x2ZWRDaGF0U2Vzc2lvbihjb250ZXh0OiBJUmVzb2x2ZWRDbGF1ZGVDaGF0Q29udGV4dCwgd29ya2luZ0RpcmVjdG9yaWVzPzogcmVhZG9ubHkgVVJJW10pOiBQcm9taXNlPENsYXVkZUFnZW50U2Vzc2lvbj4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gY29udGV4dC50YXJnZXQ7XG5cdFx0aWYgKGV4aXN0aW5nPy5pc1BpcGVsaW5lUmVhZHkpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbWF0ZXJpYWxpemVQcm92aXNpb25hbChleGlzdGluZy5zZXNzaW9uSWQsIGNvbnRleHQsIHdvcmtpbmdEaXJlY3Rvcmllcyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9yZXNvbHZlT3JSZXN1bWVDaGF0U2Vzc2lvbkxvY2tlZChjb250ZXh0LCB3b3JraW5nRGlyZWN0b3JpZXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJ1aWxkIGEgcHJvdmlzaW9uYWwge0BsaW5rIENsYXVkZUFnZW50U2Vzc2lvbn0gZnJvbSBhbiBleGFjdCBjaGF0IGJhY2tpbmdcblx0ICogYW5kIGl0cyBwcm92aWRlci1vd25lZCBvdmVybGF5LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlUHJvdmlzaW9uYWxDaGF0U2Vzc2lvbihjb25maWd1cmF0aW9uUmVzb3VyY2U6IFVSSSwgY2hhdDogVVJJLCByZXNvdXJjZTogVVJJLCBmYWxsYmFja1dvcmtpbmdEaXJlY3Rvcmllcz86IHJlYWRvbmx5IFVSSVtdKTogUHJvbWlzZTxDbGF1ZGVBZ2VudFNlc3Npb24+IHtcblx0XHRjb25zdCBpbmZvID0gdGhpcy5fY2hhdEJhY2tpbmdzLmdldChjaGF0LnRvU3RyaW5nKCkpO1xuXHRcdGlmICghaW5mbykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbQ2xhdWRlXSBubyBiYWNraW5nIGNoYXQgZm9yIGNoYXQgJHtjaGF0LnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXHRcdGxldCBvdmVybGF5OiBJQ2xhdWRlU2Vzc2lvbk92ZXJsYXkgPSB7fTtcblx0XHR0cnkge1xuXHRcdFx0b3ZlcmxheSA9IGF3YWl0IHRoaXMuX21ldGFkYXRhU3RvcmUucmVhZChyZXNvdXJjZSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGVdIGNoYXQgb3ZlcmxheSByZWFkIGZhaWxlZCBmb3IgJHtjaGF0LnRvU3RyaW5nKCl9OyBjb250aW51aW5nIHdpdGggZGVmYXVsdHNgLCBlcnIpO1xuXHRcdH1cblx0XHRjb25zdCBzZGtJbmZvID0gYXdhaXQgdGhpcy5fc2RrU2VydmljZS5nZXRTZXNzaW9uSW5mbyhpbmZvLnNka1Nlc3Npb25JZCk7XG5cdFx0Ly8gYGZhbGxiYWNrV29ya2luZ0RpcmVjdG9yaWVzYCBpcyBvbmx5IHN1cHBsaWVkIGJ5IHJlbW92ZS1hbGwsIHdoaWNoXG5cdFx0Ly8gY2FwdHVyZXMgdGhlIHNldCBiZWZvcmUgZGVsZXRpbmcgdGhlIFNESyB0cmFuc2NyaXB0IHRoYXQgd291bGRcblx0XHQvLyBvdGhlcndpc2UgYW5zd2VyIGZvciBpdC5cblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3JpZXMgPSBzZGtJbmZvPy5jd2Rcblx0XHRcdD8gW1VSSS5maWxlKHNka0luZm8uY3dkKSwgLi4uKG92ZXJsYXkud29ya2luZ0RpcmVjdG9yaWVzPy5zbGljZSgxKSA/PyBbXSldXG5cdFx0XHQ6IG92ZXJsYXkud29ya2luZ0RpcmVjdG9yaWVzID8/IGZhbGxiYWNrV29ya2luZ0RpcmVjdG9yaWVzO1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSB3b3JraW5nRGlyZWN0b3JpZXM/LlswXTtcblx0XHRpZiAoIXdvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgW0NsYXVkZV0gY2Fubm90IG1hdGVyaWFsaXplIGNoYXQgJHtjaGF0LnRvU3RyaW5nKCl9OiB3b3JraW5nIGRpcmVjdG9yeSBtaXNzaW5nIChubyBTREsgdHJhbnNjcmlwdCBhbmQgbm8gcGVyc2lzdGVkIG92ZXJsYXkpYCk7XG5cdFx0fVxuXHRcdGNvbnN0IGFkZGl0aW9uYWxEaXJlY3RvcmllcyA9IHdvcmtpbmdEaXJlY3Rvcmllcy5zbGljZSgxKTtcblx0XHRsZXQgcHJvamVjdDogSUFnZW50U2Vzc2lvblByb2plY3RJbmZvIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRwcm9qZWN0ID0gYXdhaXQgcHJvamVjdEZyb21Db3BpbG90Q29udGV4dCh7IGN3ZDogd29ya2luZ0RpcmVjdG9yeS5mc1BhdGggfSwgdGhpcy5fZ2l0U2VydmljZSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGVdIHByb2plY3QgcmVzb2x1dGlvbiBmYWlsZWQgZm9yIGNoYXQgJHtjaGF0LnRvU3RyaW5nKCl9OyBjb250aW51aW5nIHdpdGhvdXQgcHJvamVjdGAsIGVycik7XG5cdFx0fVxuXHRcdGNvbnN0IHBlcm1pc3Npb25Nb2RlID0gcmVhZENsYXVkZVBlcm1pc3Npb25Nb2RlKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uUmVzb3VyY2UpID8/IG92ZXJsYXkucGVybWlzc2lvbk1vZGUgPz8gJ2RlZmF1bHQnO1xuXHRcdC8vIE92ZXJsYXkgdGFrZXMgcHJlY2VkZW5jZSBvdmVyIHRoZSBiYWNraW5nOiBgY2hhbmdlTW9kZWxgIGFsd2F5cyB3cml0ZXNcblx0XHQvLyB0aGUgb3ZlcmxheSBmaXJzdCAodmlhIGBzZXRNb2RlbGAgb3IgYF9tZXRhZGF0YVN0b3JlLndyaXRlYCkgYW5kIHRoZW5cblx0XHQvLyB0aGUgYmFja2luZy4gSWYgdGhlIGJhY2tpbmcgdXBkYXRlIGlzIGxvc3QsIHRoZSBvdmVybGF5IGFscmVhZHkgaG9sZHNcblx0XHQvLyB0aGUgbmV3ZXN0IG1vZGVsOyBwcmVmZXJyaW5nIGl0IGhlcmUgZW5zdXJlcyBhIG1vZGVsIGNoYW5nZSBpcyBuZXZlclxuXHRcdC8vIHNpbGVudGx5IHJldmVydGVkIGFmdGVyIGEgcmVzdGFydC5cblx0XHRjb25zdCBtb2RlbCA9IG92ZXJsYXkubW9kZWwgPz8gaW5mby5tb2RlbDtcblx0XHRjb25zdCBjaGF0U2Vzc2lvbiA9IENsYXVkZUFnZW50U2Vzc2lvbi5jcmVhdGVQcm92aXNpb25hbChcblx0XHRcdGluZm8uc2RrU2Vzc2lvbklkLFxuXHRcdFx0Y2hhdCxcblx0XHRcdHdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRwcm9qZWN0LFxuXHRcdFx0bW9kZWwsXG5cdFx0XHRvdmVybGF5LmFnZW50LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0bmV3IFBlbmRpbmdSZXF1ZXN0UmVnaXN0cnk8Q2FsbFRvb2xSZXN1bHQ+KCksXG5cdFx0XHRwZXJtaXNzaW9uTW9kZSxcblx0XHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0YWRkaXRpb25hbERpcmVjdG9yaWVzLFxuXHRcdCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJMaXZlQ2hhdChjaGF0LCBjaGF0U2Vzc2lvbik7XG5cdFx0dGhpcy5fcmVjb3JkQ2hhdFNjb3BlKGNoYXQsIGNvbmZpZ3VyYXRpb25SZXNvdXJjZSwgcmVzb3VyY2UpO1xuXHRcdC8vIFRoZSBjaGF0IG5vdyBoYXMgYSBsaXZlIHJ1bnRpbWUsIHNvIHJlLWFwcGx5IHRoZSBjb250cmlidXRpb25zIG9mXG5cdFx0Ly8gZXZlcnkgY2xpZW50IGFkZHJlc3NlZCB0byB0aGlzIGV4YWN0IGNoYXQuIFRoaXMgcmVwbGFjZXMgbm90aGluZyBcdTIwMTRcblx0XHQvLyBpdCBvbmx5IHB1c2hlcyBlYWNoIGhhbmRsZSdzIGFscmVhZHktYXNzaWduZWQgdG9vbHMvY3VzdG9taXphdGlvbnNcblx0XHQvLyBpbnRvIHRoZSBjb252ZXJzYXRpb24gdGhhdCBqdXN0IGNhbWUgdXAuXG5cdFx0dGhpcy5fZm9yRWFjaEFjdGl2ZUNsaWVudEhhbmRsZUZvckNoYXQoY2hhdCwgaGFuZGxlID0+IGhhbmRsZS5yZWZyZXNoKCkpO1xuXHRcdHJldHVybiBjaGF0U2Vzc2lvbjtcblx0fVxuXG5cdC8qKiBWaXNpdHMgdGhlIGFjdGl2ZS1jbGllbnQgaGFuZGxlcyBBZ2VudCBIb3N0IHJlZ2lzdGVyZWQgZm9yIHRoZSBleGFjdCBgY2hhdGAuICovXG5cdHByaXZhdGUgX2ZvckVhY2hBY3RpdmVDbGllbnRIYW5kbGVGb3JDaGF0KGNoYXQ6IFVSSSwgdmlzaXQ6IChoYW5kbGU6IENsYXVkZUFjdGl2ZUNsaWVudEhhbmRsZSkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IHByZWZpeCA9IGAke2NoYXQudG9TdHJpbmcoKX1cXHUwMDAwYDtcblx0XHRmb3IgKGNvbnN0IFtrZXksIGhhbmRsZV0gb2YgdGhpcy5fYWN0aXZlQ2xpZW50SGFuZGxlcykge1xuXHRcdFx0aWYgKGtleS5zdGFydHNXaXRoKHByZWZpeCkpIHtcblx0XHRcdFx0dmlzaXQoaGFuZGxlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKiogRHJvcHMgZXZlcnkgYWN0aXZlLWNsaWVudCBoYW5kbGUgYWRkcmVzc2VkIHRvIHRoZSBleGFjdCBgY2hhdGAsIGUuZy4gb24gZGlzcG9zZS4gKi9cblx0cHJpdmF0ZSBfcHJ1bmVBY3RpdmVDbGllbnRIYW5kbGVzRm9yQ2hhdChjaGF0OiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBwcmVmaXggPSBgJHtjaGF0LnRvU3RyaW5nKCl9XFx1MDAwMGA7XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgWy4uLnRoaXMuX2FjdGl2ZUNsaWVudEhhbmRsZXMua2V5cygpXSkge1xuXHRcdFx0aWYgKGtleS5zdGFydHNXaXRoKHByZWZpeCkpIHtcblx0XHRcdFx0dGhpcy5fYWN0aXZlQ2xpZW50SGFuZGxlcy5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlIGEgY29uY3JldGUgY2hhdCBiYWNraW5nJ3MgbW9kZWwgYW5kIHB1c2ggdGhlIHJlZnJlc2hlZCBvcGFxdWVcblx0ICogYHByb3ZpZGVyRGF0YWAgYmxvYiB0byB0aGUgb3JjaGVzdHJhdG9yICh2aWFcblx0ICoge0BsaW5rIG9uRGlkQ2hhbmdlQ2hhdERhdGF9KSBzbyB0aGUgZHVyYWJsZSBjYXRhbG9nIHN0YXlzIGluIHN5bmMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF91cGRhdGVDaGF0QmFja2luZ01vZGVsKGNoYXQ6IFVSSSwgbW9kZWw6IE1vZGVsU2VsZWN0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9jaGF0QmFja2luZ3MuZ2V0KGNoYXQudG9TdHJpbmcoKSk7XG5cdFx0aWYgKCFleGlzdGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB1cGRhdGVkOiBJQ2xhdWRlQ2hhdEJhY2tpbmcgPSB7IC4uLmV4aXN0aW5nLCBtb2RlbCB9O1xuXHRcdHRoaXMuX2NoYXRCYWNraW5ncy5zZXQoY2hhdC50b1N0cmluZygpLCB1cGRhdGVkKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNoYXREYXRhLmZpcmUoeyBjaGF0LCBwcm92aWRlckRhdGE6IGVuY29kZVByb3ZpZGVyRGF0YShfdG9QZXJzaXN0ZWRDaGF0KHVwZGF0ZWQpKSB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZS1hdHRhY2ggYSBjb25jcmV0ZSBjaGF0IGJhY2tpbmcgZnJvbSBvcGFxdWUgcHJvdmlkZXIgZGF0YSwgcmVjb3JkaW5nXG5cdCAqIGl0cyBleGFjdCBzY29wZSBiaW5kaW5nIChjb25maWd1cmF0aW9uIHNjb3BlIEFORCBvd24gcGVyc2lzdGVuY2Vcblx0ICogcmVzb3VyY2UpIHNvIGEgbGF0ZXIgZm9yayBuYW1pbmcgdGhpcyBjaGF0IGFzIGl0cyBzb3VyY2UgY2FuIHJlc29sdmVcblx0ICogYm90aCB3aXRob3V0IGRlcml2aW5nIHRoZW0gZnJvbSBVUkkgc2hhcGUuIFRoaXMgaXMgdGhlIHNvbGUgcmVzdG9yZVxuXHQgKiBwYXRoIGZvciBhIGNoYXQgdGhhdCB3YXMgbmV2ZXIgKHJlLSljcmVhdGVkIGluIHRoaXMgcHJvY2VzcyBcdTIwMTQgYSBjb2xkXG5cdCAqIGNoYXQgXHUyMDE0IHNvIGl0IGlzIHRoZSBvbmx5IHBsYWNlIHRoYXQgc2NvcGUgYmluZGluZyBleGlzdHMgZm9yIGl0LlxuXHQgKi9cblx0YXN5bmMgbWF0ZXJpYWxpemVDaGF0KGNoYXQ6IFVSSSwgY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQsIHByb3ZpZGVyRGF0YTogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJQWdlbnRDcmVhdGVDaGF0UmVzdWx0IHwgdm9pZD4ge1xuXHRcdGNvbnN0IHJlc29sdmVkID0gcmVzb2x2ZUFnZW50Q2hhdENvbnRleHQoY29udGV4dCwgY2hhdCk7XG5cdFx0dGhpcy5fcmVjb3JkQ2hhdFNjb3BlKGNoYXQsIHJlc29sdmVkLmNvbmZpZ3VyYXRpb25SZXNvdXJjZSwgcmVzb2x2ZWQucmVzb3VyY2UpO1xuXHRcdGlmIChwcm92aWRlckRhdGEgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKCFpc0RlZmF1bHRDaGF0VXJpKGNoYXQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGJhY2tpbmcgPSB7IHNka1Nlc3Npb25JZDogQWdlbnRTZXNzaW9uLmlkKHJlc29sdmVkLmNvbmZpZ3VyYXRpb25SZXNvdXJjZSkgfTtcblx0XHRcdHRoaXMuX2NoYXRCYWNraW5ncy5zZXQoY2hhdC50b1N0cmluZygpLCBiYWNraW5nKTtcblx0XHRcdHJldHVybiB7IHByb3ZpZGVyRGF0YTogZW5jb2RlUHJvdmlkZXJEYXRhKF90b1BlcnNpc3RlZENoYXQoYmFja2luZykpIH07XG5cdFx0fVxuXHRcdGNvbnN0IHBlcnNpc3RlZCA9IGRlY29kZVByb3ZpZGVyRGF0YShwcm92aWRlckRhdGEpO1xuXHRcdGlmICghcGVyc2lzdGVkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGVdIG1hdGVyaWFsaXplQ2hhdDogZHJvcHBpbmcgY29ycnVwdCBwcm92aWRlckRhdGEgZm9yICR7Y2hhdC50b1N0cmluZygpfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jaGF0QmFja2luZ3Muc2V0KGNoYXQudG9TdHJpbmcoKSwgeyBzZGtTZXNzaW9uSWQ6IHBlcnNpc3RlZC5zZGtTZXNzaW9uSWQsIC4uLihwZXJzaXN0ZWQubW9kZWwgPyB7IG1vZGVsOiBwZXJzaXN0ZWQubW9kZWwgfSA6IHt9KSwgLi4uKHBlcnNpc3RlZC5zaWRlQ2hhdCA/IHsgc2lkZUNoYXQ6IHBlcnNpc3RlZC5zaWRlQ2hhdCB9IDoge30pIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlY292ZXIgdGhlIGhpc3RvcmljYWwgaW1wbGljaXQgZGVmYXVsdC1jaGF0IFNESyBpZGVudGl0eSBmb3IgYVxuXHQgKiBzZXNzaW9uIHRoYXQgcHJlZGF0ZXMgdGhlIGV4YWN0LWNoYXQgY2F0YWxvZydzIHBlcnNpc3RlZFxuXHQgKiBgcHJvdmlkZXJEYXRhYDogYmVmb3JlIGV4YWN0LWNoYXQgYmFja2luZ3MgZXhpc3RlZCwgYSBzZXNzaW9uJ3Ncblx0ICogcHJpbWFyeSBjaGF0IHdhcyBzaW1wbHkgdGhlIFNESyBjb252ZXJzYXRpb24gc2hhcmluZyB0aGUgc2Vzc2lvbidzXG5cdCAqIG93biBpZCAoYEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKWApIFx1MjAxNCBubyBzZXBhcmF0ZSBibG9iIHdhcyBldmVyXG5cdCAqIHdyaXR0ZW4gdG8gZGVjb2RlLiBVc2VzIG9ubHkgdGhlIGhvc3Qtc3VwcGxpZWRcblx0ICogYGNvbnRleHQuY29uZmlndXJhdGlvblJlc291cmNlYCAobmV2ZXIgZGVyaXZlcyBvciByZWNvZ25pemVzIGFcblx0ICogZGVmYXVsdC1jaGF0IHNoYXBlIGZyb20gYGNoYXRgIGl0c2VsZiwgcGVyIHRoZSBleGFjdC1jaGF0LW9ubHlcblx0ICogcmVzdG9yZSBjb250cmFjdCkgYW5kIHJlY29yZHMgaXQgYXMgYSBwbGFpbiwgY2Fub25pY2FsIGV4YWN0IGJhY2tpbmcuXG5cdCAqIEZyb20gaGVyZSBvbiB0aGUgcmVjb3ZlcmVkIGNoYXQgcmVzb2x2ZXMsIHJvdXRlcywgdHJ1bmNhdGVzLCBhbmRcblx0ICogcmVsZWFzZXMgZXhhY3RseSBsaWtlIGV2ZXJ5IG90aGVyIGNoYXQuXG5cdCAqXG5cdCAqIFBlcmZvcm1zIG5vIFNESyBJL08gYW5kIHJlYWRzIG5vIGxlZ2FjeSBtZXRhZGF0YSwgc28gaXQgaXMgaWRlbXBvdGVudFxuXHQgKiAocmVjb21wdXRlcyB0aGUgc2FtZSBpZGVudGl0eSBvbiBldmVyeSBjYWxsLCBhbmQga2VlcHMgYW5cblx0ICogYWxyZWFkeS1yZWNvcmRlZCBiYWNraW5nKSBhbmQgbm9uLWRlc3RydWN0aXZlLiBSZXR1cm5zIHRoZSBjYW5vbmljYWxcblx0ICogb3BhcXVlIGJsb2Igc28gdGhlIG9yY2hlc3RyYXRvciBjYW4gcGVyc2lzdCBpdCBhZGRpdGl2ZWx5IGdvaW5nXG5cdCAqIGZvcndhcmQuXG5cdCAqL1xuXHRhc3luYyByZWNvdmVyTGVnYWN5Q2hhdChjaGF0OiBVUkksIGNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogUHJvbWlzZTxJQWdlbnRDcmVhdGVDaGF0UmVzdWx0PiB7XG5cdFx0Y29uc3QgeyBjb25maWd1cmF0aW9uUmVzb3VyY2UsIHJlc291cmNlIH0gPSByZXNvbHZlQWdlbnRDaGF0Q29udGV4dChjb250ZXh0LCBjaGF0KTtcblx0XHRjb25zdCBjaGF0S2V5ID0gY2hhdC50b1N0cmluZygpO1xuXHRcdGNvbnN0IGJhY2tpbmcgPSB0aGlzLl9jaGF0QmFja2luZ3MuZ2V0KGNoYXRLZXkpID8/IHsgc2RrU2Vzc2lvbklkOiBBZ2VudFNlc3Npb24uaWQoY29uZmlndXJhdGlvblJlc291cmNlKSB9O1xuXHRcdHRoaXMuX2NoYXRCYWNraW5ncy5zZXQoY2hhdEtleSwgYmFja2luZyk7XG5cdFx0dGhpcy5fcmVjb3JkQ2hhdFNjb3BlKGNoYXQsIGNvbmZpZ3VyYXRpb25SZXNvdXJjZSwgcmVzb3VyY2UpO1xuXHRcdHJldHVybiB7IHByb3ZpZGVyRGF0YTogZW5jb2RlUHJvdmlkZXJEYXRhKF90b1BlcnNpc3RlZENoYXQoYmFja2luZykpIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRDaGF0TWVzc2FnZXMoY2hhdDogVVJJLCBjb250ZXh0OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8cmVhZG9ubHkgVHVybltdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlYWRDaGF0TWVzc2FnZXModGhpcy5fcmVzb2x2ZUNoYXRDb250ZXh0KGNoYXQsIGNvbnRleHQpKTtcblx0fVxuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvKipcblx0ICogVGVzdC1vbmx5IGFjY2Vzc29yIGZvciB0aGUgbWF0ZXJpYWxpemVkIHtAbGluayBDbGF1ZGVBZ2VudFNlc3Npb259LCBzb1xuXHQgKiB0ZXN0cyBjYW4gaW5zcGVjdCBgX2lzUmVzdW1lZGAgZGlyZWN0bHkuIE1hcmtlZCBgRm9yVGVzdGluZ2Agc28gdGhlXG5cdCAqIHByb2R1Y3Rpb24gc3VyZmFjZSBzdGF5cyB1bmF3YXJlIG9mIGl0cyBleGlzdGVuY2U7IHRoZSBwcm90b2NvbFxuXHQgKiBzdXJmYWNlIChgSUFnZW50YCkgZG9lcyBub3QgaW5jbHVkZSBpdC5cblx0ICovXG5cdGdldFNlc3Npb25Gb3JUZXN0aW5nKHNlc3Npb246IFVSSSk6IENsYXVkZUFnZW50U2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2VzcyA9IHRoaXMuX2ZpbmRDaGF0QnlVcmkoVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbikpKSA/PyB0aGlzLl9maW5kQW55U2Vzc2lvbihBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbikpO1xuXHRcdHJldHVybiBzZXNzPy5pc1BpcGVsaW5lUmVhZHkgPyBzZXNzIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVhZENoYXRNZXNzYWdlcyhjb250ZXh0OiBJUmVzb2x2ZWRDbGF1ZGVDaGF0Q29udGV4dCk6IFByb21pc2U8cmVhZG9ubHkgVHVybltdPiB7XG5cdFx0Ly8gRG9uJ3QgdHJpZ2dlciBhIGNvbGQgU0RLIGRvd25sb2FkIGp1c3QgdG8gcmVjb25zdHJ1Y3QgYSB0cmFuc2NyaXB0XG5cdFx0Ly8gZHVyaW5nIHJlc3RvcmUgKHRoZSByZW5kZXJlciBzdWJzY3JpYmVzIHRvIHRoZSBsYXN0LWFjdGl2ZSBzZXNzaW9uXG5cdFx0Ly8gb24gc3RhcnR1cCkuIE1pcnJvcnMgYGxpc3RTZXNzaW9uc2AgLyBgZ2V0Q29udmVyc2F0aW9uTWV0YWRhdGFgOiB3aGVuIHRoZVxuXHRcdC8vIFNESyBpc24ndCBsb2NhbCB5ZXQsIGRlZmVyIHdpdGggYW4gZW1wdHkgdHJhbnNjcmlwdC4gVGhlIGRvd25sb2FkXG5cdFx0Ly8gZmlyZXMgKHdpdGggaG9zdC1sZXZlbCBwcm9ncmVzcykgb25jZSB0aGUgdXNlciBzZW5kcyB0aGUgZmlyc3Rcblx0XHQvLyBtZXNzYWdlLCBhZnRlciB3aGljaCB0aGUgdHJhbnNjcmlwdCByZS1oeWRyYXRlcyBvbiB0aGUgbmV4dCByZXN0b3JlLlxuXHRcdGlmICghKGF3YWl0IHRoaXMuX3Nka1NlcnZpY2UuY2FuTG9hZFdpdGhvdXREb3dubG9hZCgpKSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKCdbQ2xhdWRlXSBTREsgbm90IGRvd25sb2FkZWQgeWV0OyBkZWZlcnJpbmcgc2Vzc2lvbiBtZXNzYWdlcyB1bnRpbCBhIHNlc3Npb24gdHJpZ2dlcnMgdGhlIGRvd25sb2FkJyk7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGlmIChjb250ZXh0LnNwYXduZWRGcm9tKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVhZFN1YmFnZW50TWVzc2FnZXMoY29udGV4dCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VzcyA9IGNvbnRleHQudGFyZ2V0O1xuXHRcdGlmIChzZXNzICYmICFzZXNzLmlzUGlwZWxpbmVSZWFkeSkge1xuXHRcdFx0Ly8gUHJvdmlzaW9uYWwgc2Vzc2lvbjogdGhlIFNESyBjaGF0IGhhcyBuZXZlciBiZWVuIG1hdGVyaWFsaXplZCwgc29cblx0XHRcdC8vIHRoZXJlIGlzIG5vIG9uLWRpc2sgdHJhbnNjcmlwdCB0byByZWFkLiBMb2dnZWQgYmVjYXVzZSBhbiBlbXB0eVxuXHRcdFx0Ly8gdHJhbnNjcmlwdCBpcyBvdGhlcndpc2UgaW5kaXN0aW5ndWlzaGFibGUgZnJvbSBhIGZhaWxlZCByZWFkLlxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ2xhdWRlXSBnZXRNZXNzYWdlczogY2hhdCAke2NvbnRleHQuY2hhdEtleX0gaXMgbm90IG1hdGVyaWFsaXplZCB5ZXQ7IHJldHVybmluZyBubyB0dXJuc2ApO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRpZiAoIWNvbnRleHQuc2RrU2Vzc2lvbklkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IHR1cm5zID0gYXdhaXQgdGhpcy5fcmVjb25zdHJ1Y3RUdXJucyhjb250ZXh0LnNka1Nlc3Npb25JZCwgY29udGV4dC5jaGF0LCBzZXNzPy5zdWJhZ2VudHMpO1xuXHRcdGNvbnN0IHNpZGVDaGF0ID0gdGhpcy5fY2hhdEJhY2tpbmdzLmdldChjb250ZXh0LmNoYXRLZXkpPy5zaWRlQ2hhdDtcblx0XHRyZXR1cm4gc2xpY2VTaWRlQ2hhdFR1cm5zKHR1cm5zLCBzaWRlQ2hhdCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVjb25zdHJ1Y3QgYSBwcm92aWRlci1zcGF3bmVkIHN1YmFnZW50IGNoYXQncyB0cmFuc2NyaXB0LlxuXHQgKlxuXHQgKiBBIHN1YmFnZW50IGhhcyBubyBiYWNraW5nIG9mIGl0cyBvd246IGl0cyB0dXJucyBsaXZlIGluc2lkZSB0aGUgc3Bhd25pbmdcblx0ICogY2hhdCdzIFNESyB0cmFuc2NyaXB0LCBrZXllZCBieSB0aGUgdG9vbCBjYWxsIHRoYXQgZGVsZWdhdGVkIHRvIGl0LiBCb3RoXG5cdCAqIGhhbHZlcyBvZiB0aGF0IHNwYXduIGVkZ2UgY29tZSBmcm9tIHRoZSBob3N0LXN1cHBsaWVkIG9yaWdpblxuXHQgKiAoe0BsaW5rIElSZXNvbHZlZENsYXVkZUNoYXRDb250ZXh0LnNwYXduZWRGcm9tfSkgXHUyMDE0IHRoZSBwcm92aWRlciBuZWl0aGVyXG5cdCAqIHJlY292ZXJzIHRoZW0gZnJvbSBzaGFyZWQgaG9zdCBzdGF0ZSBub3IgcmUtZGVyaXZlcyB0aGVtIGZyb20gVVJJIHNoYXBlLlxuXHQgKiBXaXRob3V0IGFuIG9yaWdpbiAob3Igd2l0aG91dCB0aGUgc3Bhd25pbmcgY2hhdCdzIGJhY2tpbmcpIHRoZXJlIGlzXG5cdCAqIG5vdGhpbmcgdG8gcmVhZCwgYW5kIHRoZSB0cmFuc2NyaXB0IGlzIGVtcHR5LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVhZFN1YmFnZW50TWVzc2FnZXMoY29udGV4dDogSVJlc29sdmVkQ2xhdWRlQ2hhdENvbnRleHQpOiBQcm9taXNlPHJlYWRvbmx5IFR1cm5bXT4ge1xuXHRcdGNvbnN0IHNwYXduZWRGcm9tID0gY29udGV4dC5zcGF3bmVkRnJvbTtcblx0XHRpZiAoIXNwYXduZWRGcm9tKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IHBhcmVudENoYXQgPSBzcGF3bmVkRnJvbS5jaGF0O1xuXHRcdGNvbnN0IHBhcmVudFNlc3Npb25JZCA9IHRoaXMuX2NoYXRCYWNraW5ncy5nZXQocGFyZW50Q2hhdC50b1N0cmluZygpKT8uc2RrU2Vzc2lvbklkO1xuXHRcdGlmICghcGFyZW50U2Vzc2lvbklkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IHBhcmVudFNlc3Npb24gPSB0aGlzLl9maW5kQW55U2Vzc2lvbihwYXJlbnRTZXNzaW9uSWQpO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHN1YmFnZW50cyA9IHBhcmVudFNlc3Npb24/LnN1YmFnZW50cyA/PyBzdG9yZS5hZGQobmV3IFN1YmFnZW50UmVnaXN0cnkoKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghcGFyZW50U2Vzc2lvbikge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9yZWNvbnN0cnVjdFR1cm5zKHBhcmVudFNlc3Npb25JZCwgcGFyZW50Q2hhdCwgc3ViYWdlbnRzKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBhd2FpdCBnZXRTdWJhZ2VudFRyYW5zY3JpcHQoY29udGV4dC5jaGF0LCBwYXJlbnRDaGF0LCBwYXJlbnRTZXNzaW9uSWQsIHNwYXduZWRGcm9tLnRvb2xDYWxsSWQsIHN1YmFnZW50cywgdGhpcy5fc2RrU2VydmljZSwgdGhpcy5fbG9nU2VydmljZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGVdIGdldFN1YmFnZW50VHJhbnNjcmlwdCB0aHJldyBmb3IgJHtjb250ZXh0LmNoYXRLZXl9YCwgZXJyKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBGZXRjaCBhIGNoYXQncyBTREsgdHJhbnNjcmlwdCAoe0BsaW5rIHNka1Nlc3Npb25JZH0pIGFuZCBtYXAgaXQgdG9cblx0ICogcHJvdG9jb2wge0BsaW5rIFR1cm59cyByb3V0ZWQgdG8ge0BsaW5rIHJvdXRpbmdVcml9ICh0aGUgc2Vzc2lvbiBvciBjaGF0XG5cdCAqIGNoYW5uZWwgVVJJKS4gV2hlbiB7QGxpbmsgc3ViYWdlbnRzfSBpcyBzdXBwbGllZCwgaXQgaXMgcHJpbWVkIGZyb20gdGhlIGFnZW50SWQgc3VmZml4ZXMgdGhlXG5cdCAqIFNESyBlbmNvZGVkIGluIFRhc2sgdG9vbF9yZXN1bHQgYmxvY2tzLiBSZXNpbGllbnQ6IGFueSBmYWlsdXJlIHdhcm4tbG9nc1xuXHQgKiBhbmQgcmV0dXJucyBgW11gIHJhdGhlciB0aGFuIHByb3BhZ2F0aW5nLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVjb25zdHJ1Y3RUdXJucyhzZGtTZXNzaW9uSWQ6IHN0cmluZywgcm91dGluZ1VyaTogVVJJLCBzdWJhZ2VudHM6IFN1YmFnZW50UmVnaXN0cnkgfCB1bmRlZmluZWQpOiBQcm9taXNlPHJlYWRvbmx5IFR1cm5bXT4ge1xuXHRcdGxldCBtZXNzYWdlcztcblx0XHR0cnkge1xuXHRcdFx0bWVzc2FnZXMgPSBhd2FpdCB0aGlzLl9zZGtTZXJ2aWNlLmdldFNlc3Npb25NZXNzYWdlcyhzZGtTZXNzaW9uSWQsIHsgaW5jbHVkZVN5c3RlbU1lc3NhZ2VzOiB0cnVlIH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ2xhdWRlXSBnZXRTZXNzaW9uTWVzc2FnZXMgU0RLIGZldGNoIGZhaWxlZCBmb3IgJHtzZGtTZXNzaW9uSWR9YCwgZXJyKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0bGV0IHR1cm5zOiByZWFkb25seSBUdXJuW107XG5cdFx0dHJ5IHtcblx0XHRcdHR1cm5zID0gbWFwU2Vzc2lvbk1lc3NhZ2VzVG9UdXJucyhtZXNzYWdlcywgcm91dGluZ1VyaSwgdGhpcy5fbG9nU2VydmljZSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBEZWZlbnNpdmUgYm91bmRhcnk6IGEgc2luZ2xlIG1hbGZvcm1lZCBTREsgbWVzc2FnZSBtdXN0IG5vdFxuXHRcdFx0Ly8gYmxvdyB1cCB0aGUgZW50aXJlIHRyYW5zY3JpcHQgcmVhZC5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZV0gcmVwbGF5IG1hcHBlciB0aHJldyBmb3IgJHtzZGtTZXNzaW9uSWR9YCwgZXJyKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Ly8gQWx3YXlzIGEgYnVnOiB0aGUgU0RLIGhhbmRlZCBiYWNrIGEgdHJhbnNjcmlwdCBidXQgcmVwbGF5IHByb2R1Y2VkXG5cdFx0Ly8gbm90aGluZywgd2hpY2ggc3VyZmFjZXMgdG8gdGhlIHVzZXIgYXMgYSBjaGF0IHRoYXQgb3BlbnMgY29tcGxldGVseVxuXHRcdC8vIGVtcHR5LiBXYXJuIHNvIHRoZSBuZXh0IHJlcG9ydCBpcyBkaWFnbm9zYWJsZSBmcm9tIHRoZSBsb2cgYWxvbmUuXG5cdFx0aWYgKHR1cm5zLmxlbmd0aCA9PT0gMCAmJiBtZXNzYWdlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGVdIHJlcGxheSBwcm9kdWNlZCBubyB0dXJucyBmcm9tICR7bWVzc2FnZXMubGVuZ3RofSB0cmFuc2NyaXB0IG1lc3NhZ2UocykgZm9yICR7c2RrU2Vzc2lvbklkfTsgY2hhdCB3aWxsIHJlbmRlciBlbXB0eWApO1xuXHRcdH1cblx0XHQvLyBBIGJ1ZyBpbiBgcHJpbWVGcm9tVHJhbnNjcmlwdGAgTVVTVCBOT1QgYnJlYWsgYW4gb3RoZXJ3aXNlLXN1Y2Nlc3NmdWxcblx0XHQvLyB0cmFuc2NyaXB0IHJlYWQuXG5cdFx0dHJ5IHtcblx0XHRcdHN1YmFnZW50cz8ucHJpbWVGcm9tVHJhbnNjcmlwdCh0dXJucyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDbGF1ZGVdIHByaW1lRnJvbVRyYW5zY3JpcHQgdGhyZXcgZm9yICR7c2RrU2Vzc2lvbklkfWAsIGVycik7XG5cdFx0fVxuXHRcdHJldHVybiB0dXJucztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2xpc3RDbGF1ZGVDb2RlQ2hhdHMoKTogUHJvbWlzZTxJQWdlbnRDaGF0TWV0YWRhdGFbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIFNESyBpcyB0aGUgc291cmNlIG9mIHRydXRoOyB3ZSBkZWxpYmVyYXRlbHkgZG8gTk9UIGZpbHRlciBlbnRyaWVzXG5cdFx0Ly8gdGhhdCBsYWNrIGEgcGVyLXNlc3Npb24gREIgXHUyMDE0IGV4dGVybmFsIENsYXVkZSBDb2RlIENMSSBzZXNzaW9ucyBoYXZlXG5cdFx0Ly8gbm8gREIgYW5kIG11c3Qgc3RpbGwgc3VyZmFjZS4gVGhlIFNESyBlbnRyeSBzdXBwbGllcyB0aGVcblx0XHQvLyBhdXRob3JpdGF0aXZlIHByaW1hcnkgZGlyZWN0b3J5OyBhbiBvcHRpb25hbCBwZXItc2Vzc2lvbiBvdmVybGF5XG5cdFx0Ly8gaHlkcmF0ZXMgdGhlIGFkZGl0aW9uYWwtZGlyZWN0b3J5IHRhaWwuIEV4dGVybmFsIHNlc3Npb25zIHdpdGhvdXRcblx0XHQvLyBhbiBvdmVybGF5IHJlbWFpbiB2YWxpZCBzaW5nbGUtcm9vdCBlbnRyaWVzLlxuXHRcdC8vXG5cdFx0Ly8gVGhlIG9yY2hlc3RyYXRvciBlbnVtZXJhdGVzIGV2ZXJ5IHByb3ZpZGVyIGluZGVwZW5kZW50bHkuIElmIG91ciBTREsgZHluYW1pYyBpbXBvcnRcblx0XHQvLyBmYWlscyAoY29ycnVwdCBpbnN0YWxsLCBtaXNzaW5nIG9wdGlvbmFsIGRlcCkgYW5kIHdlIGxldCBpdCByZWplY3QsXG5cdFx0Ly8gKmV2ZXJ5KiBwcm92aWRlcidzIGxlZ2FjeSBsaXN0IGRpc2FwcGVhcnMgXHUyMDE0IHRoZSBzaWJsaW5nIENvcGlsb3Rcblx0XHQvLyBwcm92aWRlciBnZXRzIG51a2VkIHRvby4gQ2F0Y2ggYW5kIGxvZyBpbnN0ZWFkLlxuXHRcdGxldCBzZGtFbnRyaWVzOiByZWFkb25seSBTREtTZXNzaW9uSW5mb1tdO1xuXHRcdHRyeSB7XG5cdFx0XHRzZGtFbnRyaWVzID0gYXdhaXQgdGhpcy5fc2RrU2VydmljZS5saXN0U2Vzc2lvbnMoKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIFNESyBmYWlsZWQgdG8gbG9hZC9lbnVtZXJhdGUgXHUyMDE0IHRoaXMgaXMgXCJjYW4ndCBlbnVtZXJhdGUgeWV0XCIsXG5cdFx0XHQvLyBub3QgYW4gYXV0aG9yaXRhdGl2ZSBlbXB0eSByZXN1bHQsIHNvIGNhbGxlcnMgbXVzdCBub3QgdHJlYXQgaXRcblx0XHRcdC8vIGFzIFwibm8gZXh0ZXJuYWwgY2hhdHNcIiBhbmQgc2hvdWxkIHJldHJ5IGxhdGVyLlxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbQ2xhdWRlXSBTREsgbGlzdFNlc3Npb25zIGZhaWxlZDsgZGVmZXJyaW5nIGNoYXQgZGlzY292ZXJ5JywgZXJyKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLmFsbChzZGtFbnRyaWVzLm1hcChlbnRyeSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSh0aGlzLmlkLCBlbnRyeS5zZXNzaW9uSWQpO1xuXHRcdFx0Y29uc3QgY2hhdCA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pKTtcblx0XHRcdHJldHVybiB0aGlzLl93aXRoUGVyc2lzdGVkV29ya2luZ0RpcmVjdG9yaWVzKHNlc3Npb24sIHsgY2hhdCwgLi4udGhpcy5fbWV0YWRhdGFTdG9yZS5wcm9qZWN0KGVudHJ5KSB9KTtcblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyBsaXN0Q2hhdHNUb01pZ3JhdGUoKTogUHJvbWlzZTxJQWdlbnRDaGF0TWV0YWRhdGFbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9zZGtTZXJ2aWNlLmVuc3VyZUF2YWlsYWJsZUZvckRpc2NvdmVyeSgpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbQ2xhdWRlXSBTREsgdW5hdmFpbGFibGUgd2hpbGUgbGlzdGluZyBjaGF0cyB0byBtaWdyYXRlJywgZXJyKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNoYXRzID0gYXdhaXQgdGhpcy5fbGlzdENsYXVkZUNvZGVDaGF0cygpO1xuXHRcdGlmICghY2hhdHMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGxpbWl0ZXIgPSBuZXcgTGltaXRlcjxJQWdlbnRDaGF0TWV0YWRhdGEgfCB1bmRlZmluZWQ+KDQpO1xuXHRcdGNvbnN0IGtub3duID0gYXdhaXQgUHJvbWlzZS5hbGwoY2hhdHMubWFwKGNoYXQgPT4gbGltaXRlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5faXNLbm93bkNsYXVkZUNvZGVDaGF0KGNoYXQpID8gY2hhdCA6IHVuZGVmaW5lZDtcblx0XHR9KSkpO1xuXHRcdHJldHVybiBrbm93bi5maWx0ZXIoKGNoYXQpOiBjaGF0IGlzIElBZ2VudENoYXRNZXRhZGF0YSA9PiBjaGF0ICE9PSB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RhcnRDbGF1ZGVDb2RlQ2hhdERpc2NvdmVyeSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX2NsYXVkZUNvZGVDaGF0RGlzY292ZXJ5KSB7XG5cdFx0XHR0aGlzLl9jbGF1ZGVDb2RlQ2hhdERpc2NvdmVyeSA9IHJldHJ5KGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fc2RrU2VydmljZS5lbnN1cmVBdmFpbGFibGVGb3JEaXNjb3ZlcnkoKTtcblx0XHRcdFx0aWYgKCEoYXdhaXQgdGhpcy5fZW1pdENsYXVkZUNvZGVDaGF0cygpKSkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignQ2xhdWRlIGNoYXQgY2F0YWxvZyBpcyBub3QgYXZhaWxhYmxlJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIDUwMDAsIDMpXG5cdFx0XHRcdC5jYXRjaChlcnIgPT4gdGhpcy5fbG9nU2VydmljZS53YXJuKCdbQ2xhdWRlXSBDaGF0IGRpc2NvdmVyeSBmYWlsZWQnLCBlcnIpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NsYXVkZUNvZGVDaGF0RGlzY292ZXJ5O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZW1pdENsYXVkZUNvZGVDaGF0cygpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY2hhdHMgPSBhd2FpdCB0aGlzLl9saXN0Q2xhdWRlQ29kZUNoYXRzKCk7XG5cdFx0XHRpZiAoY2hhdHMpIHtcblx0XHRcdFx0Y29uc3QgbGltaXRlciA9IG5ldyBMaW1pdGVyPElBZ2VudERpc2NvdmVyZWRDaGF0IHwgdW5kZWZpbmVkPig0KTtcblx0XHRcdFx0Y29uc3QgdW5rbm93biA9IGF3YWl0IFByb21pc2UuYWxsKGNoYXRzLm1hcChjaGF0ID0+IGxpbWl0ZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9pc0tub3duQ2xhdWRlQ29kZUNoYXQoY2hhdCkgPyB1bmRlZmluZWQgOiB7IC4uLmNoYXQsIGV4dGVybmFsOiB0cnVlIH07XG5cdFx0XHRcdH0pKSk7XG5cdFx0XHRcdHRoaXMuX29uRGlkRGlzY292ZXJDaGF0cy5maXJlKHVua25vd24uZmlsdGVyKChjaGF0KTogY2hhdCBpcyBJQWdlbnREaXNjb3ZlcmVkQ2hhdCA9PiBjaGF0ICE9PSB1bmRlZmluZWQpKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1tDbGF1ZGVdIEZhaWxlZCB0byBlbWl0IGRpc2NvdmVyZWQgY2hhdHMnLCBlcnIpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pc0tub3duQ2xhdWRlQ29kZUNoYXQoY2hhdDogSUFnZW50Q2hhdE1ldGFkYXRhKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBVUkkucGFyc2UocGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShjaGF0LmNoYXQpKTtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9tZXRhZGF0YVN0b3JlLmhhc0tub3duU2Vzc2lvbihzZXNzaW9uKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZV0gRmFpbGVkIHRvIGluc3BlY3Qgc3RvcmVkIG1ldGFkYXRhIGZvciAke2NoYXQuY2hhdC50b1N0cmluZygpfWAsIGVycik7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFBlci1jaGF0IGxvb2t1cC4gQWNjZXB0cyB0aGUgZXh0ZXJuYWwtQ0xJIGNhc2U6IGEgc2Vzc2lvbiB0aGF0IGV4aXN0c1xuXHQgKiBvbiBkaXNrIHZpYSB0aGUgcmF3IEFudGhyb3BpYyBDTEkgaGFzIG5vIHBlci1zZXNzaW9uIERCLCBzbyB0aGlzIE1VU1Rcblx0ICogTk9UIGdhdGUgb24gdGhlIHNpZGVjYXIuIFRoZSBTREsgaXMgdGhlIHNvdXJjZSBvZiB0cnV0aCBmb3IgZXhpc3RlbmNlLlxuXHQgKlxuXHQgKiBUaGUgU0RLIGVudHJ5IHN1cHBsaWVzIHRoZSBhdXRob3JpdGF0aXZlIHByaW1hcnkgZGlyZWN0b3J5OyBhbiBvcHRpb25hbFxuXHQgKiBwZXItc2Vzc2lvbiBvdmVybGF5IGh5ZHJhdGVzIHRoZSBhZGRpdGlvbmFsLWRpcmVjdG9yeSB0YWlsLiBFeHRlcm5hbFxuXHQgKiBzZXNzaW9ucyB3aXRob3V0IGFuIG92ZXJsYXkgcmVtYWluIHZhbGlkIHNpbmdsZS1yb290IGVudHJpZXMuIEZhaWx1cmVzIGluXG5cdCAqIHRoZSBTREsgbG9va3VwIHByb3BhZ2F0ZSAodGhlIGNhbGxlciBpcyBkb2luZyBhIHNpbmdsZSB0YXJnZXRlZCBmZXRjaCBhbmRcblx0ICogc2hvdWxkIGxlYXJuIHRoYXQgdGhlIFNESyBtb2R1bGUgaXMgYnJva2VuKS5cblx0ICovXG5cdGFzeW5jIGdldENoYXRNZXRhZGF0YShjaGF0OiBVUkksIGNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0LCBwcm92aWRlckRhdGE/OiBzdHJpbmcpOiBQcm9taXNlPElBZ2VudENoYXRNZXRhZGF0YSB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIERvbid0IHRyaWdnZXIgYSBjb2xkIFNESyBkb3dubG9hZCBqdXN0IHRvIGh5ZHJhdGUgbWV0YWRhdGEgZHVyaW5nXG5cdFx0Ly8gcmVzdG9yZSAodGhlIHJlbmRlcmVyIHN1YnNjcmliZXMgdG8gdGhlIGxhc3QtYWN0aXZlIHNlc3Npb24gb25cblx0XHQvLyBzdGFydHVwKS4gV2hlbiB0aGUgU0RLIGlzbid0IGxvY2FsIHlldCwgZGVmZXI7IHRoZSBkb3dubG9hZCBmaXJlc1xuXHRcdC8vIG9uY2UgdGhlIHVzZXIgc2VuZHMgdGhlIGZpcnN0IG1lc3NhZ2UuXG5cdFx0aWYgKCEoYXdhaXQgdGhpcy5fc2RrU2VydmljZS5jYW5Mb2FkV2l0aG91dERvd25sb2FkKCkpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ1tDbGF1ZGVdIFNESyBub3QgZG93bmxvYWRlZCB5ZXQ7IGRlZmVycmluZyBjaGF0IG1ldGFkYXRhIHVudGlsIGEgc2Vzc2lvbiB0cmlnZ2VycyB0aGUgZG93bmxvYWQnKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHsgY29uZmlndXJhdGlvblJlc291cmNlIH0gPSByZXNvbHZlQWdlbnRDaGF0Q29udGV4dChjb250ZXh0LCBjaGF0KTtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBwcm92aWRlckRhdGEgPyBkZWNvZGVQcm92aWRlckRhdGEocHJvdmlkZXJEYXRhKT8uc2RrU2Vzc2lvbklkIDogQWdlbnRTZXNzaW9uLmlkKGNvbmZpZ3VyYXRpb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFzZXNzaW9uSWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNka0luZm8gPSBhd2FpdCB0aGlzLl9zZGtTZXJ2aWNlLmdldFNlc3Npb25JbmZvKHNlc3Npb25JZCk7XG5cdFx0aWYgKCFzZGtJbmZvKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fd2l0aFBlcnNpc3RlZFdvcmtpbmdEaXJlY3Rvcmllcyhjb25maWd1cmF0aW9uUmVzb3VyY2UsIHsgY2hhdCwgLi4udGhpcy5fbWV0YWRhdGFTdG9yZS5wcm9qZWN0KHNka0luZm8pIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1lcmdlIHRoZSBwZXJzaXN0ZWQgYWRkaXRpb25hbCB3b3JraW5nIGRpcmVjdG9yaWVzIChpbmRleCAxLi5OKSBvbnRvIGFcblx0ICogcHJvamVjdGVkIG1ldGFkYXRhJ3MgYHdvcmtpbmdEaXJlY3Rvcmllc2AsIGtlZXBpbmcgdGhlIFNESy1kZXJpdmVkIGBjd2RgXG5cdCAqIGFzIHRoZSBhdXRob3JpdGF0aXZlIHByaW1hcnkuIFRoZSBTREsgY2F0YWxvZyBvbmx5IHN0b3JlcyBgY3dkYCwgc28gdGhlXG5cdCAqIHRhaWwgb2YgYSBtdWx0aS1yb290IHNlc3Npb24gbGl2ZXMgaW4gdGhlIHBlci1zZXNzaW9uIG92ZXJsYXkuIFNlc3Npb25zXG5cdCAqIHdpdGhvdXQgYW4gb3ZlcmxheSAoZXh0ZXJuYWwgQ2xhdWRlIENMSSwgc2luZ2xlLXJvb3QpIGFyZSByZXR1cm5lZCBhcy1pcy5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3dpdGhQZXJzaXN0ZWRXb3JraW5nRGlyZWN0b3JpZXMoc2Vzc2lvbjogVVJJLCBtZXRhOiBJQWdlbnRDaGF0TWV0YWRhdGEpOiBQcm9taXNlPElBZ2VudENoYXRNZXRhZGF0YT4ge1xuXHRcdGNvbnN0IHByaW1hcnkgPSBtZXRhLndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdO1xuXHRcdGlmICghcHJpbWFyeSkge1xuXHRcdFx0cmV0dXJuIG1ldGE7XG5cdFx0fVxuXHRcdGxldCBvdmVybGF5OiBJQ2xhdWRlU2Vzc2lvbk92ZXJsYXkgPSB7fTtcblx0XHR0cnkge1xuXHRcdFx0b3ZlcmxheSA9IGF3YWl0IHRoaXMuX21ldGFkYXRhU3RvcmUucmVhZChzZXNzaW9uKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NsYXVkZV0gb3ZlcmxheSByZWFkIGZhaWxlZCB3aGlsZSBoeWRyYXRpbmcgd29ya2luZyBkaXJlY3RvcmllcyBmb3IgJHtzZXNzaW9uLnRvU3RyaW5nKCl9OyB1c2luZyBTREsgY3dkIG9ubHlgLCBlcnIpO1xuXHRcdH1cblx0XHRjb25zdCB0YWlsID0gb3ZlcmxheS53b3JraW5nRGlyZWN0b3JpZXM/LnNsaWNlKDEpID8/IFtdO1xuXHRcdGlmICh0YWlsLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIG1ldGE7XG5cdFx0fVxuXHRcdHJldHVybiB7IC4uLm1ldGEsIHdvcmtpbmdEaXJlY3RvcmllczogW3ByaW1hcnksIC4uLnRhaWxdIH07XG5cdH1cblxuXHRyZXNvbHZlQ2hhdENvbmZpZyhfcGFyYW1zOiBJQWdlbnRSZXNvbHZlQ2hhdENvbmZpZ1BhcmFtcyk6IFByb21pc2U8UmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ+IHtcblx0XHQvLyBEZWNpc2lvbiBCNSAocGxhbiBzZWN0aW9uIDMuMy41KTogQ2xhdWRlIGNvbGxhcHNlcyB0aGUgcGxhdGZvcm0nc1xuXHRcdC8vIGBhdXRvQXBwcm92ZWAgXHUwMEQ3IGBtb2RlYCB0d28tYXhpcyBhcHByb3ZhbCBzdXJmYWNlIG9udG8gYSBzaW5nbGVcblx0XHQvLyBgcGVybWlzc2lvbk1vZGVgIGF4aXMgbWF0Y2hpbmcgdGhlIFNESydzIG5hdGl2ZSBlbnVtLiBUaGVcblx0XHQvLyBwbGF0Zm9ybSBgUGVybWlzc2lvbnNgIGtleSBpcyByZXVzZWQgdW5jaGFuZ2VkIGJlY2F1c2UgdGhlXG5cdFx0Ly8gQ2xhdWRlIFNESyBhY2NlcHRzIGBhbGxvd2VkVG9vbHNgIC8gYGRpc2FsbG93ZWRUb29sc2Bcblx0XHQvLyBuYXRpdmVseS4gU2tpcHBlZDogQXV0b0FwcHJvdmUsIE1vZGUsIElzb2xhdGlvbiwgQnJhbmNoLFxuXHRcdC8vIEJyYW5jaE5hbWVIaW50IFx1MjAxNCB3b3JrYmVuY2ggcGlja2VycyBrZXkgb2ZmIHRoZSBwcm9wZXJ0eSBuYW1lc1xuXHRcdC8vIHRvIGRlY2lkZSB3aGF0IHRvIHJlbmRlciwgc28gb21pdHRpbmcgdGhlc2UgaW50ZW50aW9uYWxseVxuXHRcdC8vIHN1cHByZXNzZXMgdGhlIGRlZmF1bHQgbW9kZS9icmFuY2ggVUkgZm9yIENsYXVkZSBzZXNzaW9ucy5cblx0XHRjb25zdCBzZXNzaW9uU2NoZW1hID0gY3JlYXRlU2NoZW1hKHtcblx0XHRcdFtDbGF1ZGVTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25Nb2RlXTogc2NoZW1hUHJvcGVydHk8Q2xhdWRlUGVybWlzc2lvbk1vZGU+KHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY2xhdWRlLnNlc3Npb25Db25maWcucGVybWlzc2lvbk1vZGUnLCBcIkFwcHJvdmFsc1wiKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUuc2Vzc2lvbkNvbmZpZy5wZXJtaXNzaW9uTW9kZURlc2NyaXB0aW9uJywgXCJIb3cgQ2xhdWRlIGhhbmRsZXMgdG9vbCBhcHByb3ZhbHMuXCIpLFxuXHRcdFx0XHRlbnVtOiBbJ2RlZmF1bHQnLCAnYWNjZXB0RWRpdHMnLCAncGxhbicsICdhdXRvJywgJ2J5cGFzc1Blcm1pc3Npb25zJ10sXG5cdFx0XHRcdGVudW1MYWJlbHM6IFtcblx0XHRcdFx0XHRsb2NhbGl6ZSgnY2xhdWRlLnNlc3Npb25Db25maWcucGVybWlzc2lvbk1vZGUuZGVmYXVsdCcsIFwiQXNrIEJlZm9yZSBFZGl0c1wiKSxcblx0XHRcdFx0XHRsb2NhbGl6ZSgnY2xhdWRlLnNlc3Npb25Db25maWcucGVybWlzc2lvbk1vZGUuYWNjZXB0RWRpdHMnLCBcIkVkaXQgQXV0b21hdGljYWxseVwiKSxcblx0XHRcdFx0XHRsb2NhbGl6ZSgnY2xhdWRlLnNlc3Npb25Db25maWcucGVybWlzc2lvbk1vZGUucGxhbicsIFwiUGxhbiBNb2RlXCIpLFxuXHRcdFx0XHRcdGxvY2FsaXplKCdjbGF1ZGUuc2Vzc2lvbkNvbmZpZy5wZXJtaXNzaW9uTW9kZS5hdXRvJywgXCJBdXRvIE1vZGVcIiksXG5cdFx0XHRcdFx0bG9jYWxpemUoJ2NsYXVkZS5zZXNzaW9uQ29uZmlnLnBlcm1pc3Npb25Nb2RlLmJ5cGFzc1Blcm1pc3Npb25zJywgXCJCeXBhc3MgUGVybWlzc2lvbnNcIiksXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRsb2NhbGl6ZSgnY2xhdWRlLnNlc3Npb25Db25maWcucGVybWlzc2lvbk1vZGUuZGVmYXVsdERlc2NyaXB0aW9uJywgXCJDbGF1ZGUgYXNrcyBiZWZvcmUgZWRpdGluZyBmaWxlcy5cIiksXG5cdFx0XHRcdFx0bG9jYWxpemUoJ2NsYXVkZS5zZXNzaW9uQ29uZmlnLnBlcm1pc3Npb25Nb2RlLmFjY2VwdEVkaXRzRGVzY3JpcHRpb24nLCBcIkNsYXVkZSBlZGl0cyBmaWxlcyB3aXRob3V0IGFza2luZywgYW5kIGFza3MgYmVmb3JlIHVzaW5nIG90aGVyIHRvb2xzLlwiKSxcblx0XHRcdFx0XHRsb2NhbGl6ZSgnY2xhdWRlLnNlc3Npb25Db25maWcucGVybWlzc2lvbk1vZGUucGxhbkRlc2NyaXB0aW9uJywgXCJDbGF1ZGUgY3JlYXRlcyBhIHBsYW4gYmVmb3JlIG1ha2luZyBjaGFuZ2VzLlwiKSxcblx0XHRcdFx0XHRsb2NhbGl6ZSgnY2xhdWRlLnNlc3Npb25Db25maWcucGVybWlzc2lvbk1vZGUuYXV0b0Rlc2NyaXB0aW9uJywgXCJDbGF1ZGUgZGVjaWRlcyB3aGV0aGVyIHRvIGFzayBmb3IgZWFjaCB0b29sIG9wZXJhdGlvbi5cIiksXG5cdFx0XHRcdFx0bG9jYWxpemUoJ2NsYXVkZS5zZXNzaW9uQ29uZmlnLnBlcm1pc3Npb25Nb2RlLmJ5cGFzc1Blcm1pc3Npb25zRGVzY3JpcHRpb24nLCBcIkNsYXVkZSBydW5zIGFsbCB0b29scyB3aXRob3V0IGFza2luZy5cIiksXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGRlZmF1bHQ6ICdkZWZhdWx0Jyxcblx0XHRcdFx0c2Vzc2lvbk11dGFibGU6IHRydWUsXG5cdFx0XHR9KSxcblx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zXTogcGxhdGZvcm1TZXNzaW9uU2NoZW1hLmRlZmluaXRpb25bU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uc10sXG5cdFx0fSk7XG5cblx0XHRjb25zdCB2YWx1ZXMgPSBzZXNzaW9uU2NoZW1hLnZhbGlkYXRlT3JEZWZhdWx0KF9wYXJhbXMuY29uZmlnLCB7XG5cdFx0XHRbQ2xhdWRlU2Vzc2lvbkNvbmZpZ0tleS5QZXJtaXNzaW9uTW9kZV06ICdkZWZhdWx0JyBzYXRpc2ZpZXMgQ2xhdWRlUGVybWlzc2lvbk1vZGUsXG5cdFx0XHQvLyBQZXJtaXNzaW9ucyBpbnRlbnRpb25hbGx5IG9taXR0ZWQgZnJvbSBkZWZhdWx0cyBcdTIwMTQgbGVhdmVcblx0XHRcdC8vIHVuc2V0IHNvIGF1dG8tYXBwcm92YWwgZmFsbHMgdGhyb3VnaCB0byB0aGUgaG9zdC1sZXZlbFxuXHRcdFx0Ly8gZGVmYXVsdCwgbWF0ZXJpYWxpemluZyBvbiB0aGUgc2Vzc2lvbiBvbmx5IG9uY2UgdGhlIHVzZXJcblx0XHRcdC8vIGFwcHJvdmVzIGEgdG9vbCBcImluIHRoaXMgU2Vzc2lvblwiLlxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRzY2hlbWE6IHNlc3Npb25TY2hlbWEudG9Qcm90b2NvbCgpLFxuXHRcdFx0dmFsdWVzLFxuXHRcdH0pO1xuXHR9XG5cblx0Z2V0SW5oZXJpdGVkQ2hhdENvbmZpZyhjb25maWc6IFJlYWRvbmx5PFJlY29yZDxzdHJpbmcsIHVua25vd24+Pik6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBpbmhlcml0ZWQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgW0NsYXVkZVNlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbk1vZGUsIFNlc3Npb25Db25maWdLZXkuUGVybWlzc2lvbnNdKSB7XG5cdFx0XHRpZiAoY29uZmlnW2tleV0gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRpbmhlcml0ZWRba2V5XSA9IGNvbmZpZ1trZXldO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gT2JqZWN0LmtleXMoaW5oZXJpdGVkKS5sZW5ndGggPiAwID8gaW5oZXJpdGVkIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0Y2hhdENvbmZpZ0NvbXBsZXRpb25zKF9wYXJhbXM6IElBZ2VudENoYXRDb25maWdDb21wbGV0aW9uc1BhcmFtcyk6IFByb21pc2U8U2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zUmVzdWx0PiB7XG5cdFx0Ly8gQ2xhdWRlJ3Mgb25seSBzY2hlbWEgcHJvcGVydHkgaXMgdGhlIGBwZXJtaXNzaW9uTW9kZWAgc3RhdGljIGVudW0sXG5cdFx0Ly8gc28gZHluYW1pYyBjb21wbGV0aW9uIGlzIGRlZmluaXRpb25hbGx5IGVtcHR5LlxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoeyBpdGVtczogW10gfSk7XG5cdH1cblxuXHRzaHV0ZG93bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBEcmFpbiBwcm92aXNpb25hbCBzZXNzaW9ucyBGSVJTVCBzbyBhbnkgaW4tZmxpZ2h0IGBhd2FpdFxuXHRcdC8vIHNkay5zdGFydHVwKClgIChraWNrZWQgb2ZmIGJ5IGEgcmFjaW5nIGBzZW5kTWVzc2FnZWApIG9ic2VydmVzIHRoZVxuXHRcdC8vIGFib3J0IGFuZCB1bndpbmRzLiBFYWNoIHByb3Zpc2lvbmFsIHJlY29yZCdzIEFib3J0Q29udHJvbGxlciBpc1xuXHRcdC8vIHdpcmVkIGludG8gT3B0aW9ucy5hYm9ydENvbnRyb2xsZXIgYXQgbWF0ZXJpYWxpemUgdGltZSwgc29cblx0XHQvLyBhYm9ydGluZyBoZXJlIGZsaXBzIHRoZSBzYW1lIHNpZ25hbCB0aGUgU0RLIGlzIHJhY2luZyBvbi5cblx0XHQvL1xuXHRcdC8vIFRoZW4gZHJhaW4gdGhlIG1hdGVyaWFsaXplZCBzZXNzaW9ucyB0aHJvdWdoIHRoZSBleGlzdGluZ1xuXHRcdC8vIHBlci1zZXNzaW9uIHtAbGluayBfZGlzcG9zZVNlcXVlbmNlcn0gcm91dGluZyAoYFF1ZXJ5LmludGVycnVwdCgpYCxcblx0XHQvLyBpbi1mbGlnaHQgbWV0YWRhdGEgd3JpdGVzKS5cblx0XHQvL1xuXHRcdC8vIFRoZSBwcm9taXNlIGlzIG1lbW9pemVkIHNvIGNvbmN1cnJlbnQgY2FsbGVycyBzaGFyZSBhIHNpbmdsZVxuXHRcdC8vIGRyYWluIHBhc3MgXHUyMDE0IHNlZSBgX3NodXRkb3duUHJvbWlzZWAgSlNEb2MuXG5cdFx0Ly8gTk9URTogZGVjbGFyZWQgc3luYyAocmV0dXJucyBQcm9taXNlPHZvaWQ+KSByYXRoZXIgdGhhbiBhc3luY1xuXHRcdC8vIHNvIHRoYXQgcmUtZW50cmFudCBjYWxscyByZXR1cm4gdGhlIGNhY2hlZCBwcm9taXNlICppZGVudGl0eSosXG5cdFx0Ly8gbm90IGEgZnJlc2ggb3V0ZXItYXN5bmMgd3JhcHBlciBhcm91bmQgaXQuXG5cdFx0cmV0dXJuIHRoaXMuX3NodXRkb3duUHJvbWlzZSA/Pz0gKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gdGhpcy5fYWxsTGl2ZVNlc3Npb25zKCk7XG5cdFx0XHRmb3IgKGNvbnN0IGNoYXQgb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdFx0aWYgKCFjaGF0LmlzUGlwZWxpbmVSZWFkeSkge1xuXHRcdFx0XHRcdGNoYXQuYWJvcnRDb250cm9sbGVyLmFib3J0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoc2Vzc2lvbnMubWFwKGNoYXQgPT5cblx0XHRcdFx0dGhpcy5fZGlzcG9zZVNlcXVlbmNlci5xdWV1ZShjaGF0LnNlc3Npb25JZCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2Rpc3Bvc2VMaXZlU2Vzc2lvbihjaGF0KTtcblx0XHRcdFx0fSlcblx0XHRcdCkpO1xuXHRcdFx0Ly8gU2h1dGRvd24gaXMgdGVybWluYWwgZm9yIHRoaXMgYWdlbnQgaW5zdGFuY2U6IGRyb3AgZXZlcnkgY2hhdFxuXHRcdFx0Ly8gYmFja2luZyAoYW5kIGV2ZXJ5IGFjdGl2ZS1jbGllbnQgaGFuZGxlIGFkZHJlc3NlZCB0byBvbmUpIHNvXG5cdFx0XHQvLyBub3RoaW5nIGNhbiBiZSBjb2xkLXJlc3VtZWQgb3IgcmUtY29udHJpYnV0ZWQtdG8gb3V0IG9mIGRyYWluZWRcblx0XHRcdC8vIGluLW1lbW9yeSBzdGF0ZSBhZnRlcndhcmRzLiBEdXJhYmxlIGRhdGEgaXMgdW50b3VjaGVkIFx1MjAxNCBBZ2VudFxuXHRcdFx0Ly8gSG9zdCByZS1tYXRlcmlhbGl6ZXMgZWFjaCBjaGF0J3MgYmFja2luZyBvbiB0aGUgbmV4dCByZXN0b3JlLlxuXHRcdFx0dGhpcy5fY2hhdEJhY2tpbmdzLmNsZWFyKCk7XG5cdFx0XHR0aGlzLl9hY3RpdmVDbGllbnRIYW5kbGVzLmNsZWFyKCk7XG5cdFx0fSkoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NlbmRNZXNzYWdlKGNoYXQ6IFVSSSwgcHJvbXB0OiBzdHJpbmcsIHdvcmtpbmdEaXJlY3RvcmllczogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQsIGF0dGFjaG1lbnRzPzogcmVhZG9ubHkgTWVzc2FnZUF0dGFjaG1lbnRbXSwgdHVybklkPzogc3RyaW5nLCBfc2VuZGVyQ2xpZW50SWQ/OiBzdHJpbmcsIG9wZXJhdGlvbkNvbnRleHQ/OiBVUkkgfCBJQWdlbnRDaGF0Q29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIGBJQWdlbnQuc2VuZE1lc3NhZ2VgIGRlY2xhcmVzIGB0dXJuSWQ/YCBidXQgZXZlcnkgcHJvZHVjdGlvbiBjYWxsZXIgaW5cblx0XHQvLyBgQWdlbnRTaWRlRWZmZWN0c2Agc3VwcGxpZXMgb25lLiBHZW5lcmF0ZSBhIGZhbGxiYWNrIHNvIHRoZVxuXHRcdC8vIHNlc3Npb24tc2lkZSBgUXVldWVkUmVxdWVzdC50dXJuSWQ6IHN0cmluZ2AgaW52YXJpYW50IGhvbGRzIGV2ZW4gaWYgYVxuXHRcdC8vIGh5cG90aGV0aWNhbCBjYWxsZXIgZm9yZ2V0cyBpdC5cblx0XHRjb25zdCBlZmZlY3RpdmVUdXJuSWQgPSB0dXJuSWQgPz8gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3Qgc2VuZENvbnRleHQgPSB0aGlzLl9yZXF1aXJlQ2hhdENvbnRleHQoY2hhdCwgb3BlcmF0aW9uQ29udGV4dCwgJ3NlbmRNZXNzYWdlJyk7XG5cdFx0Y29uc3QgY2xpZW50VGVsZW1ldHJ5Q29udGV4dCA9IFVSSS5pc1VyaShvcGVyYXRpb25Db250ZXh0KSA/IHVuZGVmaW5lZCA6IG9wZXJhdGlvbkNvbnRleHQ/LmNsaWVudFRlbGVtZXRyeUNvbnRleHQ7XG5cdFx0Y29uc3QgY29udGV4dCA9IHRoaXMuX3Jlc29sdmVDaGF0Q29udGV4dChjaGF0LCBzZW5kQ29udGV4dCk7XG5cblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvblNlcXVlbmNlci5xdWV1ZShjb250ZXh0LnNlcXVlbmNlcktleSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX3Jlc29sdmVDaGF0Q29udGV4dChjaGF0LCBzZW5kQ29udGV4dCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5fZW5zdXJlUmVzb2x2ZWRDaGF0U2Vzc2lvbihjdXJyZW50LCB3b3JraW5nRGlyZWN0b3JpZXMpO1xuXHRcdFx0Ly8gVGhlIHNlbmQgY2FycmllcyB0aGUgaG9zdCdzIGxhdGVzdCBjdXN0b21pemF0aW9uIHNuYXBzaG90LiBBblxuXHRcdFx0Ly8gYWJzZW50IHNuYXBzaG90IG1lYW5zIHRoZSBob3N0IGhhcyBwdWJsaXNoZWQgbm9uZSB5ZXQsIHdoaWNoIG11c3Rcblx0XHRcdC8vIG5vdCBiZSByZWFkIGFzIFwidGhpcyBzZXNzaW9uIGhhcyBubyBjdXN0b21pemF0aW9uc1wiIFx1MjAxNCBrZWVwIHRoZVxuXHRcdFx0Ly8gc2Vzc2lvbidzIG93biByZWNvbmNpbGVkIHZpZXcgaW4gdGhhdCBjYXNlLlxuXHRcdFx0aWYgKGN1cnJlbnQuY3VzdG9taXphdGlvbnMpIHtcblx0XHRcdFx0c2Vzc2lvbi5zZXRIb3N0Q3VzdG9taXphdGlvbnMoY3VycmVudC5jdXN0b21pemF0aW9ucyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzaWRlQ2hhdCA9IHRoaXMuX2NoYXRCYWNraW5ncy5nZXQoY3VycmVudC5jaGF0S2V5KT8uc2lkZUNoYXQ7XG5cdFx0XHRjb25zdCB0dXJucyA9IHNpZGVDaGF0ID8gYXdhaXQgdGhpcy5fcmVjb25zdHJ1Y3RUdXJucyhzZXNzaW9uLnNlc3Npb25JZCwgY3VycmVudC5jaGF0LCBzZXNzaW9uLnN1YmFnZW50cykgOiBbXTtcblx0XHRcdGNvbnN0IHNka1Byb21wdCA9IHByZXBhcmVTaWRlQ2hhdFByb21wdChwcm9tcHQsIHR1cm5zLCBzaWRlQ2hhdCk7XG5cdFx0XHRjb25zdCBzd2l0Y2hUcmFuc3BvcnQgPSBzZXNzaW9uLmhhc1BlbmRpbmdUcmFuc3BvcnRTd2l0Y2ggPyB0aGlzLl9lbnN1cmVBdXRoZW50aWNhdGVkKHNlc3Npb24ucHJvdmlzaW9uYWxNb2RlbCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRhd2FpdCBzZXNzaW9uLnNlbmQodGhpcy5fYnVpbGRTZGtQcm9tcHQoc2Vzc2lvbi5zZXNzaW9uSWQsIHNka1Byb21wdCwgYXR0YWNobWVudHMsIGVmZmVjdGl2ZVR1cm5JZCksIGVmZmVjdGl2ZVR1cm5JZCwgY3VycmVudC5jb25maWd1cmF0aW9uUmVzb3VyY2UsIHdvcmtpbmdEaXJlY3Rvcmllcywgc3dpdGNoVHJhbnNwb3J0LCByZXNvbHZlQWdlbnRIb3N0SW5zdHJ1Y3Rpb25zKG9wZXJhdGlvbkNvbnRleHQpLCBjbGllbnRUZWxlbWV0cnlDb250ZXh0KTtcblx0XHRcdGlmICh3b3JraW5nRGlyZWN0b3JpZXMpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fbWV0YWRhdGFTdG9yZS53cml0ZShjdXJyZW50LnJlc291cmNlLCB7IHdvcmtpbmdEaXJlY3RvcmllcyB9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8qKiBCdWlsZHMgdGhlIFNESyB1c2VyIG1lc3NhZ2UgZm9yIGEgc2VuZCwgYWRkcmVzc2VkIHRvIGBzZGtTZXNzaW9uSWRgLiAqL1xuXHRwcml2YXRlIF9idWlsZFNka1Byb21wdChzZGtTZXNzaW9uSWQ6IHN0cmluZywgcHJvbXB0OiBzdHJpbmcsIGF0dGFjaG1lbnRzOiByZWFkb25seSBNZXNzYWdlQXR0YWNobWVudFtdIHwgdW5kZWZpbmVkLCB0dXJuSWQ6IHN0cmluZyk6IFNES1VzZXJNZXNzYWdlIHtcblx0XHRjb25zdCBjb250ZW50QmxvY2tzID0gcmVzb2x2ZVByb21wdFRvQ29udGVudEJsb2Nrcyhwcm9tcHQsIGF0dGFjaG1lbnRzKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ3VzZXInLFxuXHRcdFx0bWVzc2FnZTogeyByb2xlOiAndXNlcicsIGNvbnRlbnQ6IGNvbnRlbnRCbG9ja3MgfSxcblx0XHRcdHNlc3Npb25faWQ6IHNka1Nlc3Npb25JZCxcblx0XHRcdHBhcmVudF90b29sX3VzZV9pZDogbnVsbCxcblx0XHRcdC8vIE0xIC8gR2xvc3Nhcnk6IGBUdXJuLmlkIFx1MjE5NCBTREtVc2VyTWVzc2FnZS51dWlkYC4gVGhlIFNESyB0eXBlcyB0aGlzXG5cdFx0XHQvLyBhcyBhIGJyYW5kZWQgYCR7c3RyaW5nfS1cdTIwMjZgIHRlbXBsYXRlLWxpdGVyYWwgYWxpYXMgb2YgTm9kZSdzXG5cdFx0XHQvLyBgY3J5cHRvLlVVSURgOyBjYXN0IGF0IHRoZSBib3VuZGFyeSByYXRoZXIgdGhhbiB0aHJlYWRpbmcgdGhlIGJyYW5kXG5cdFx0XHQvLyB1cCB0byBldmVyeSBjYWxsZXIuXG5cdFx0XHR1dWlkOiB0dXJuSWQgYXMgYCR7c3RyaW5nfS0ke3N0cmluZ30tJHtzdHJpbmd9LSR7c3RyaW5nfS0ke3N0cmluZ31gLFxuXHRcdH07XG5cdH1cblxuXHRyZXNwb25kVG9QZXJtaXNzaW9uUmVxdWVzdChyZXF1ZXN0SWQ6IHN0cmluZywgYXBwcm92ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHQvLyBgcmVxdWVzdElkYCBpcyB0aGUgU0RLJ3MgYHRvb2xfdXNlX2lkYCBcdTIwMTQgZ2xvYmFsbHkgdW5pcXVlLCBzbyBhXG5cdFx0Ly8gc2luZ2xlIG1hdGNoaW5nIGNoYXQgaXMgYWxsIHdlIG5lZWQuIFNpbGVudCBvbiBtaXNzICh3b3JrYmVuY2ggbWF5XG5cdFx0Ly8gaGF2ZSByYWNlZCBhIHNlc3Npb24gZGlzcG9zZSkuXG5cdFx0Zm9yIChjb25zdCBzZXNzIG9mIHRoaXMuX2FsbExpdmVTZXNzaW9ucygpKSB7XG5cdFx0XHRpZiAoc2Vzcy5yZXNwb25kVG9QZXJtaXNzaW9uUmVxdWVzdChyZXF1ZXN0SWQsIGFwcHJvdmVkKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmVzcG9uZFRvVXNlcklucHV0UmVxdWVzdChyZXF1ZXN0SWQ6IHN0cmluZywgcmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZCwgYW5zd2Vycz86IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4pOiB2b2lkIHtcblx0XHQvLyBgcmVxdWVzdElkYCBpcyB0aGUgU0RLJ3MgYHRvb2xfdXNlX2lkYCAoaW50ZXJhY3RpdmUgdG9vbHMgcmV1c2UgaXQgYXNcblx0XHQvLyB0aGUge0BsaW5rIENoYXRJbnB1dFJlcXVlc3QuaWR9KTsgZ2xvYmFsbHkgdW5pcXVlLCBzbyBhIHNpbmdsZVxuXHRcdC8vIG1hdGNoaW5nIGNoYXQgaXMgYWxsIHdlIG5lZWQuIFNpbGVudCBvbiBtaXNzIGZvciB0aGUgc2FtZSByZWFzb25zIGFzXG5cdFx0Ly8ge0BsaW5rIHJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0fS5cblx0XHRmb3IgKGNvbnN0IHNlc3Mgb2YgdGhpcy5fYWxsTGl2ZVNlc3Npb25zKCkpIHtcblx0XHRcdGlmIChzZXNzLnJlc3BvbmRUb1VzZXJJbnB1dFJlcXVlc3QocmVxdWVzdElkLCByZXNwb25zZSwgYW5zd2VycykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKiBFdmVyeSBsaXZlIG9yIGRpcmVjdC1jcmVhdGUgcHJvdmlzaW9uYWwgU0RLIGNvbnZlcnNhdGlvbi4gKi9cblx0cHJpdmF0ZSBfYWxsTGl2ZVNlc3Npb25zKCk6IENsYXVkZUFnZW50U2Vzc2lvbltdIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuX2NoYXRFbnRyaWVzQnlTZGtJZC52YWx1ZXMoKV0ubWFwKGVudHJ5ID0+IGVudHJ5LmNoYXRTZXNzaW9uKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Fib3J0U2Vzc2lvbihjaGF0OiBVUkksIGNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmVzb2x2ZUFnZW50Q2hhdENvbnRleHQoY29udGV4dCwgY2hhdCk7XG5cdFx0Ly8gQ2FuY2VsIHZpYSB0aGUgYWJvcnQgY29udHJvbGxlciwgTk9UIGBRdWVyeS5pbnRlcnJ1cHQoKWAuIEFib3J0IGlzIGFcblx0XHQvLyBjb250cm9sLXBsYW5lIG9wZXJhdGlvbiBcdTIwMTQgaXQgbXVzdCBOT1Qgc2VyaWFsaXplIHRocm91Z2hcblx0XHQvLyBgX3Nlc3Npb25TZXF1ZW5jZXJgIGJlY2F1c2UgYW4gaW4tZmxpZ2h0IGBzZW5kTWVzc2FnZWAgdGFzayBpc1xuXHRcdC8vIHBhcmtlZCBvbiBpdHMgdHVybiBkZWZlcnJlZCBhbmQgd291bGQgZGVhZGxvY2sgdGhlIGFib3J0IGJlaGluZCB0aGVcblx0XHQvLyB2ZXJ5IHR1cm4gaXQncyB0cnlpbmcgdG8gY2FuY2VsLiBDYWxsaW5nIGBjaGF0LmFib3J0KClgIGRpcmVjdGx5XG5cdFx0Ly8gcmVqZWN0cyB0aGUgaW4tZmxpZ2h0IGRlZmVycmVkLCB3aGljaCBsZXRzIHRoZSBxdWV1ZWQgc2VuZE1lc3NhZ2Vcblx0XHQvLyB0YXNrIGNvbXBsZXRlIGFuZCBmcmVlcyB0aGUgc2VxdWVuY2VyIGZvciB0aGUgbmV4dCBjYWxsZXIuXG5cdFx0Y29uc3Qgc2VzcyA9IHRoaXMuX2ZpbmRDaGF0QnlVcmkoY2hhdCk7XG5cdFx0aWYgKCFzZXNzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghc2Vzcy5pc1BpcGVsaW5lUmVhZHkpIHtcblx0XHRcdHNlc3MuYWJvcnRDb250cm9sbGVyLmFib3J0KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHNlc3MuYWJvcnQoKTtcblx0fVxuXG5cdHNldFBlbmRpbmdNZXNzYWdlcyhjaGF0OiBVUkksIHN0ZWVyaW5nTWVzc2FnZTogUGVuZGluZ01lc3NhZ2UgfCB1bmRlZmluZWQsIF9xdWV1ZWRNZXNzYWdlczogcmVhZG9ubHkgUGVuZGluZ01lc3NhZ2VbXSk6IHZvaWQge1xuXHRcdC8vIFF1ZXVlZCBtZXNzYWdlcyBhcmUgaW50ZW50aW9uYWxseSBhIG5vLW9wLiBDT05URVhULm1kIE0xMCArXG5cdFx0Ly8gQWdlbnRTaWRlRWZmZWN0cyBjb25maXJtIHF1ZXVlZCBtZXNzYWdlcyBhcmUgY29uc3VtZWQgc2VydmVyLXNpZGU7XG5cdFx0Ly8gdGhlIGFnZW50IGJvdW5kYXJ5IGFsd2F5cyByZWNlaXZlcyBhbiBlbXB0eSBxdWV1ZS5cblx0XHQvL1xuXHRcdC8vIENvbnRyb2wtcGxhbmUgb3BlcmF0aW9ucyBjYXJyeSBubyBob3N0IGNvbnRleHQsIGFuZCBuZWVkIG5vbmU6IHRoZVxuXHRcdC8vIGV4YWN0IGNoYXQgYmFja2luZyBpcyB0aGUgb25seSBzdGF0ZSB0aGV5IHRvdWNoLlxuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX2ZpbmRDaGF0QnlVcmkoY2hhdCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQ2xhdWRlXSBzZXRQZW5kaW5nTWVzc2FnZXMgZm9yICR7Y2hhdC50b1N0cmluZygpfTogc3RlZXJpbmc9JHtzdGVlcmluZ01lc3NhZ2U/LmlkID8/ICdub25lJ30gcXVldWVkPSR7X3F1ZXVlZE1lc3NhZ2VzLmxlbmd0aH1gKTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ2xhdWRlXSBzZXRQZW5kaW5nTWVzc2FnZXM6IHRhcmdldCBub3QgZm91bmQgZm9yICR7Y2hhdC50b1N0cmluZygpfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoc3RlZXJpbmdNZXNzYWdlKSB7XG5cdFx0XHR0YXJnZXQuaW5qZWN0U3RlZXJpbmcoc3RlZXJpbmdNZXNzYWdlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jaGFuZ2VNb2RlbChjaGF0OiBVUkksIG1vZGVsOiBNb2RlbFNlbGVjdGlvbiwgb3BlcmF0aW9uQ29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gdGhpcy5fcmVzb2x2ZUNoYXRDb250ZXh0KGNoYXQsIG9wZXJhdGlvbkNvbnRleHQpO1xuXHRcdGF3YWl0IHRoaXMuX3Nlc3Npb25TZXF1ZW5jZXIucXVldWUoY29udGV4dC5zZXF1ZW5jZXJLZXksIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9yZXNvbHZlQ2hhdENvbnRleHQoY2hhdCwgb3BlcmF0aW9uQ29udGV4dCk7XG5cdFx0XHRhd2FpdCB0aGlzLl9tZXRhZGF0YVN0b3JlLndyaXRlKGN1cnJlbnQucmVzb3VyY2UsIHsgbW9kZWwgfSk7XG5cdFx0XHRjb25zdCBzZXNzID0gY3VycmVudC50YXJnZXQ7XG5cdFx0XHRpZiAoc2Vzcykge1xuXHRcdFx0XHQvLyBUaGUgc2Vzc2lvbiBvd25zIHRoZSB0cmFuc3BvcnQtY3Jvc3NpbmcgZGVjaXNpb246IGEgY2hhbmdlIHRoYXRcblx0XHRcdFx0Ly8gY3Jvc3NlcyB0cmFuc3BvcnRzIChDb3BpbG90IFx1MjE5NCBuYXRpdmUpIG9uIGEgbGl2ZSBzZXNzaW9uIGNhbid0XG5cdFx0XHRcdC8vIGhvdC1zd2FwIGFuZCBkZWZlcnMgdG8gYSByZWJ1aWxkIG9uIHRoZSBuZXh0IHNlbmQsIHdoaWxlIGFcblx0XHRcdFx0Ly8gc2FtZS10cmFuc3BvcnQgKG9yIHN0aWxsLXByb3Zpc2lvbmFsKSBjaGFuZ2UgaG90LXN3YXBzIGluIHBsYWNlLlxuXHRcdFx0XHQvLyBTZWUge0BsaW5rIENsYXVkZUFnZW50U2Vzc2lvbi5zZXRNb2RlbH0uXG5cdFx0XHRcdGF3YWl0IHNlc3Muc2V0TW9kZWwobW9kZWwpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGN1cnJlbnQuc2RrU2Vzc2lvbklkICE9PSBjdXJyZW50LnNlc3Npb25JZCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl91cGRhdGVDaGF0QmFja2luZ01vZGVsKGNoYXQsIG1vZGVsKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTd2l0Y2ggKG9yIGNsZWFyIHdpdGggYHVuZGVmaW5lZGApIHRoZSBzZWxlY3RlZCBjdXN0b20gYWdlbnQgZm9yIGFuXG5cdCAqIGV4aXN0aW5nIHNlc3Npb24uIE1pcnJvcnMge0BsaW5rIGNoYW5nZU1vZGVsfTogc2Vzc2lvbiBvd25zIGl0c1xuXHQgKiBwcm92aXNpb25hbC9ydW50aW1lIGJyYW5jaGluZyBhbmQgbWV0YWRhdGEgd3JpdGVcblx0ICogKHNlZSB7QGxpbmsgQ2xhdWRlQWdlbnRTZXNzaW9uLnNldEFnZW50fSkuIEZvciBleHRlcm5hbC1vbmx5XG5cdCAqIHNlc3Npb25zIChubyBpbi1tZW1vcnkgcmVjb3JkKSwgdGhlIGFnZW50IGlzIHBlcnNpc3RlZCBkaXJlY3RseSB0b1xuXHQgKiB0aGUgb3ZlcmxheSBzbyBhIGxhdGVyIHJlc3VtZSBwaWNrcyBpdCB1cC4gV2hlbiBgY2hhdGAgaXMgYW4gYWRkaXRpb25hbFxuXHQgKiBjaGF0LCB0aGUgY2hhbmdlIHRhcmdldHMgdGhhdCBjaGF0J3Mgb3duIG92ZXJsYXkuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9jaGFuZ2VBZ2VudChjaGF0OiBVUkksIGFnZW50OiBBZ2VudFNlbGVjdGlvbiB8IHVuZGVmaW5lZCwgb3BlcmF0aW9uQ29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjb250ZXh0ID0gdGhpcy5fcmVzb2x2ZUNoYXRDb250ZXh0KGNoYXQsIG9wZXJhdGlvbkNvbnRleHQpO1xuXHRcdGF3YWl0IHRoaXMuX3Nlc3Npb25TZXF1ZW5jZXIucXVldWUoY29udGV4dC5zZXF1ZW5jZXJLZXksIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9yZXNvbHZlQ2hhdENvbnRleHQoY2hhdCwgb3BlcmF0aW9uQ29udGV4dCk7XG5cdFx0XHRhd2FpdCB0aGlzLl9tZXRhZGF0YVN0b3JlLndyaXRlKGN1cnJlbnQucmVzb3VyY2UsIHsgYWdlbnQ6IGFnZW50ID8/IG51bGwgfSk7XG5cdFx0XHRjb25zdCBzZXNzID0gY3VycmVudC50YXJnZXQ7XG5cdFx0XHRpZiAoc2Vzcykge1xuXHRcdFx0XHRhd2FpdCBzZXNzLnNldEFnZW50KGFnZW50KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHNldFNlcnZlclRvb2xIb3N0KGhvc3Q6IElBZ2VudFNlcnZlclRvb2xIb3N0KTogdm9pZCB7XG5cdFx0dGhpcy5fc2VydmVyVG9vbEhvc3QgPSBob3N0O1xuXHR9XG5cblx0LyoqXG5cdCAqIGBjaGF0YCBpcyB0aGUgZXhhY3QgY2hhdCB0aGlzIGNsaWVudCdzIGNvbnRyaWJ1dGlvbnMgYXJlIGFkZHJlc3NlZCB0by5cblx0ICogVGhlcmUgaXMgbm8gbWVtYmVyc2hpcCB0byBmYW4gb3V0IFx1MjAxNCBhIGNsaWVudCBjb250cmlidXRpbmcgdG8gc2V2ZXJhbFxuXHQgKiBjaGF0cyBvZiB0aGUgc2FtZSBzZXNzaW9uIGdldHMgb25lIGluZGVwZW5kZW50IGNhbGwgKGFuZCBoYW5kbGUpIHBlclxuXHQgKiBjaGF0LCBzbyBub3RoaW5nIGhlcmUgc3ludGhlc2l6ZXMsIGV4dGVuZHMsIG9yIHJlbWVtYmVycyBhIGNoYXQgc2V0IG9mXG5cdCAqIGl0cyBvd24uXG5cdCAqL1xuXHRnZXRPckNyZWF0ZUFjdGl2ZUNsaWVudChjaGF0OiBVUkksIGNvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0LCBjbGllbnQ6IHsgcmVhZG9ubHkgY2xpZW50SWQ6IHN0cmluZzsgcmVhZG9ubHkgZGlzcGxheU5hbWU/OiBzdHJpbmcgfSwgaG9zdEN1c3RvbWl6YXRpb25zPzogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdKTogSUFjdGl2ZUNsaWVudCB7XG5cdFx0Y29uc3QgeyBjb25maWd1cmF0aW9uUmVzb3VyY2UgfSA9IHJlc29sdmVBZ2VudENoYXRDb250ZXh0KGNvbnRleHQsIGNoYXQpO1xuXHRcdGNvbnN0IGtleSA9IGAke2NoYXQudG9TdHJpbmcoKX1cXHUwMDAwJHtjbGllbnQuY2xpZW50SWR9YDtcblx0XHRsZXQgaGFuZGxlID0gdGhpcy5fYWN0aXZlQ2xpZW50SGFuZGxlcy5nZXQoa2V5KTtcblx0XHRpZiAoIWhhbmRsZSkge1xuXHRcdFx0aGFuZGxlID0gbmV3IENsYXVkZUFjdGl2ZUNsaWVudEhhbmRsZShcblx0XHRcdFx0Y2xpZW50LmNsaWVudElkLFxuXHRcdFx0XHRjbGllbnQuZGlzcGxheU5hbWUsXG5cdFx0XHRcdGNoYXQsXG5cdFx0XHRcdCh0YXJnZXRDaGF0LCB0b29scykgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0NsYXVkZToke0FnZW50U2Vzc2lvbi5pZChjb25maWd1cmF0aW9uUmVzb3VyY2UpfV0gYWN0aXZlIGNsaWVudCAke2NsaWVudC5jbGllbnRJZH0gdG9vbHM9WyR7dG9vbHMubWFwKHQgPT4gdC5uYW1lKS5qb2luKCcsICcpIHx8ICcobm9uZSknfV0gY2hhdD0ke3RhcmdldENoYXQudG9TdHJpbmcoKX1gKTtcblx0XHRcdFx0XHR0aGlzLl9maW5kQ2hhdEJ5VXJpKHRhcmdldENoYXQpPy5zZXRDbGllbnRUb29scyhjbGllbnQuY2xpZW50SWQsIHRvb2xzKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0KHRhcmdldENoYXQsIGN1c3RvbWl6YXRpb25zLCBzbmFwc2hvdCkgPT4geyB2b2lkIHRoaXMuX3N5bmNDbGllbnRDdXN0b21pemF0aW9ucyh0YXJnZXRDaGF0LCBjb25maWd1cmF0aW9uUmVzb3VyY2UsIGNsaWVudC5jbGllbnRJZCwgWy4uLmN1c3RvbWl6YXRpb25zXSwgc25hcHNob3QpOyB9LFxuXHRcdFx0KTtcblx0XHRcdHRoaXMuX2FjdGl2ZUNsaWVudEhhbmRsZXMuc2V0KGtleSwgaGFuZGxlKTtcblx0XHR9XG5cdFx0aGFuZGxlLnNldEhvc3RDdXN0b21pemF0aW9ucyhob3N0Q3VzdG9taXphdGlvbnMpO1xuXHRcdHJldHVybiBoYW5kbGU7XG5cdH1cblxuXHRyZW1vdmVBY3RpdmVDbGllbnQoY2hhdDogVVJJLCBfY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQsIGNsaWVudElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSBgJHtjaGF0LnRvU3RyaW5nKCl9XFx1MDAwMCR7Y2xpZW50SWR9YDtcblx0XHRpZiAoIXRoaXMuX2FjdGl2ZUNsaWVudEhhbmRsZXMuZGVsZXRlKGtleSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fZmluZENoYXRCeVVyaShjaGF0KTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0YXJnZXQucmVtb3ZlQ2xpZW50VG9vbHMoY2xpZW50SWQpO1xuXHRcdHZvaWQgdGhpcy5fc2Vzc2lvblNlcXVlbmNlci5xdWV1ZSh0YXJnZXQuc2Vzc2lvbklkLCBhc3luYyAoKSA9PiB0YXJnZXQucmVtb3ZlQ2xpZW50Q3VzdG9taXphdGlvbnMoY2xpZW50SWQpKS5jYXRjaCgoKSA9PiB7IC8qIGNoYXQgdG9ybiBkb3duICovIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIGBjaGF0YCBpcyB0aGUgaG9zdC1yZXNvbHZlZCByb3V0aW5nIHRhcmdldCBcdTIwMTQgYWxyZWFkeSB0aGUgYW5jZXN0b3IgY2hhdFxuXHQgKiB3aGVuIHRoZSBjb21wbGV0aW9uIHdhcyBhZGRyZXNzZWQgdG8gYSBzdWJhZ2VudC4gV2hlbiBpdHMgcnVudGltZSBpcyBub3Rcblx0ICogcmVzaWRlbnQgKGEgcmVsZWFzZWQgYW5jZXN0b3IsIG9yIGEgc3ViYWdlbnQgd2hvc2Ugc3Bhd25pbmcgY2hhdCBkaWZmZXJzXG5cdCAqIGZyb20gdGhlIHJvdXRpbmcgdGFyZ2V0KSwgdGhlIHNwYXduIGVkZ2Ugb24gdGhlIGFkZHJlc3NlZCBjaGF0J3Ncblx0ICogaG9zdC1zdXBwbGllZCBvcmlnaW4gbmFtZXMgdGhlIGNvbnZlcnNhdGlvbiB0aGF0IG93bnMgdGhlIHBlbmRpbmcgY2FsbC5cblx0ICovXG5cdG9uQ2xpZW50VG9vbENhbGxDb21wbGV0ZShjaGF0OiBVUkksIHRvb2xDYWxsSWQ6IHN0cmluZywgcmVzdWx0OiBUb29sQ2FsbFJlc3VsdCwgY29udGV4dD86IElBZ2VudENoYXRDb250ZXh0KTogdm9pZCB7XG5cdFx0Y29uc3QgYWRkcmVzc2VkID0gdGhpcy5fZmluZENoYXRCeVVyaShjaGF0KTtcblx0XHRpZiAoYWRkcmVzc2VkKSB7XG5cdFx0XHRhZGRyZXNzZWQuY29tcGxldGVDbGllbnRUb29sQ2FsbCh0b29sQ2FsbElkLCByZXN1bHQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzcGF3bmVkRnJvbSA9IHJlc29sdmVTdWJhZ2VudENoYXRQYXJlbnQoY29udGV4dCk7XG5cdFx0aWYgKCFzcGF3bmVkRnJvbSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBgQWdlbnRTaWRlRWZmZWN0c2AgZm9yd2FyZHMgZXZlcnkgYENoYXRUb29sQ2FsbENvbXBsZXRlYCBlbnZlbG9wZVxuXHRcdC8vIChpbmNsdWRpbmcgU0RLLW93bmVkIHRvb2xzKTsgc2lsZW50IG9uIG1pc3MgaXMgdGhlIGV4cGVjdGVkIHBhdGguXG5cdFx0dGhpcy5fZmluZENoYXRCeVVyaShzcGF3bmVkRnJvbS5jaGF0KT8uY29tcGxldGVDbGllbnRUb29sQ2FsbCh0b29sQ2FsbElkLCByZXN1bHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIGBob3N0Q3VzdG9taXphdGlvbnNgIGlzIHRoZSBob3N0J3MgbGFzdCBwdWJsaXNoZWQgc25hcHNob3QgZm9yIHRoZVxuXHQgKiBjaGF0J3Mgb3duaW5nIGNvbmZpZ3VyYXRpb24gc2NvcGUsIG9yIGB1bmRlZmluZWRgIHdoZW4gaXQgaGFzIHB1Ymxpc2hlZFxuXHQgKiBub25lIHlldC4gVGhlIHB1YmxpYyBlbnRyeSBwb2ludCByZXVzZXMgd2hhdGV2ZXIgdGhlIGhvc3QgbGFzdCBoYW5kZWQgdG9cblx0ICogdGhpcyBjbGllbnQncyBoYW5kbGUgcmF0aGVyIHRoYW4gcmVhZGluZyBpdCBiYWNrIGZyb20gc2hhcmVkIHN0YXRlLlxuXHQgKi9cblx0YXN5bmMgc3luY0NsaWVudEN1c3RvbWl6YXRpb25zKGNoYXQ6IFVSSSwgY29udGV4dDogVVJJIHwgSUFnZW50Q2hhdENvbnRleHQsIGNsaWVudElkOiBzdHJpbmcsIGN1c3RvbWl6YXRpb25zOiBDbGllbnRQbHVnaW5DdXN0b21pemF0aW9uW10sIG9wdGlvbnM/OiB7IHJlYWRvbmx5IHF1aWV0PzogYm9vbGVhbiB9KTogUHJvbWlzZTxJU3luY2VkQ3VzdG9taXphdGlvbltdPiB7XG5cdFx0Y29uc3QgeyBjb25maWd1cmF0aW9uUmVzb3VyY2UgfSA9IHJlc29sdmVBZ2VudENoYXRDb250ZXh0KGNvbnRleHQsIGNoYXQpO1xuXHRcdGNvbnN0IGhhbmRsZSA9IHRoaXMuX2FjdGl2ZUNsaWVudEhhbmRsZXMuZ2V0KGAke2NoYXQudG9TdHJpbmcoKX1cXHUwMDAwJHtjbGllbnRJZH1gKTtcblx0XHRyZXR1cm4gdGhpcy5fc3luY0NsaWVudEN1c3RvbWl6YXRpb25zKGNoYXQsIGNvbmZpZ3VyYXRpb25SZXNvdXJjZSwgY2xpZW50SWQsIGN1c3RvbWl6YXRpb25zLCBoYW5kbGU/Lmhvc3RDdXN0b21pemF0aW9ucywgb3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zeW5jQ2xpZW50Q3VzdG9taXphdGlvbnMoY2hhdDogVVJJLCBjb25maWd1cmF0aW9uUmVzb3VyY2U6IFVSSSwgY2xpZW50SWQ6IHN0cmluZywgY3VzdG9taXphdGlvbnM6IENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb25bXSwgaG9zdEN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW10gfCB1bmRlZmluZWQsIG9wdGlvbnM/OiB7IHJlYWRvbmx5IHF1aWV0PzogYm9vbGVhbiB9KTogUHJvbWlzZTxJU3luY2VkQ3VzdG9taXphdGlvbltdPiB7XG5cdFx0Y29uc3Qgc3luYyA9ICgpID0+IHRoaXMuX3BsdWdpbk1hbmFnZXIuc3luY0N1c3RvbWl6YXRpb25zKFxuXHRcdFx0Y2xpZW50SWQsXG5cdFx0XHRjdXN0b21pemF0aW9ucyxcblx0XHRcdG9wdGlvbnM/LnF1aWV0ID8gdW5kZWZpbmVkIDogc3RhdHVzID0+IHRoaXMuX2ZpcmVDdXN0b21pemF0aW9uVXBkYXRlZChjb25maWd1cmF0aW9uUmVzb3VyY2UsIHsgY3VzdG9taXphdGlvbjogc3RhdHVzIH0pLFxuXHRcdCk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGhpcy5fZmluZENoYXRCeVVyaShjaGF0KTtcblx0XHRpZiAodGFyZ2V0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvblNlcXVlbmNlci5xdWV1ZSh0YXJnZXQuc2Vzc2lvbklkLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHN5bmNlZCA9IGF3YWl0IHN5bmMoKTtcblx0XHRcdFx0Ly8gT25seSBhIHJlYWwgaG9zdCBzbmFwc2hvdCBpcyBhcHBsaWVkLiBgdW5kZWZpbmVkYCBtZWFucyB0aGUgaG9zdFxuXHRcdFx0XHQvLyBoYXMgcHVibGlzaGVkIG5vbmUgeWV0IFx1MjAxNCByZWNvbmNpbGluZyBhZ2FpbnN0IGFuIGVtcHR5IGxpc3QgdGhlcmVcblx0XHRcdFx0Ly8gd291bGQgZHJvcCBlbmFibGVtZW50IHN0YXRlIHRoZSBzZXNzaW9uIGFscmVhZHkgcmVzb2x2ZWQuXG5cdFx0XHRcdGlmIChob3N0Q3VzdG9taXphdGlvbnMpIHtcblx0XHRcdFx0XHR0YXJnZXQuc2V0SG9zdEN1c3RvbWl6YXRpb25zKGhvc3RDdXN0b21pemF0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGFyZ2V0LmFkb3B0Q2xpZW50Q3VzdG9taXphdGlvbnMoY2xpZW50SWQsIHN5bmNlZCwgY3VzdG9taXphdGlvbnMpO1xuXHRcdFx0XHRyZXR1cm4gc3luY2VkO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiBzeW5jKCk7XG5cdH1cblxuXHQvKipcblx0ICogUHJvamVjdCBhIHBlci1pdGVtIHN5bmMgcmVzdWx0IG9udG8gYSBgU2Vzc2lvbkN1c3RvbWl6YXRpb25VcGRhdGVkYFxuXHQgKiBhY3Rpb24gYW5kIGVtaXQgaXQgb24ge0BsaW5rIG9uRGlkQ2hhdFByb2dyZXNzfS4gTGV0cyB0aGUgd29ya2JlbmNoXG5cdCAqIGZsaXAgZWFjaCByb3cgdG8gYExvYWRlZGAgLyBgRXJyb3JgIGFzIHRoZSB1bmRlcmx5aW5nXG5cdCAqIHtAbGluayBJQWdlbnRQbHVnaW5NYW5hZ2VyLnN5bmNDdXN0b21pemF0aW9uc30gcmVzb2x2ZXMgaXQuXG5cdCAqL1xuXHRwcml2YXRlIF9maXJlQ3VzdG9taXphdGlvblVwZGF0ZWQoc2Vzc2lvbjogVVJJLCBpdGVtOiBJU3luY2VkQ3VzdG9taXphdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhdFByb2dyZXNzLmZpcmUoe1xuXHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRyZXNvdXJjZTogc2Vzc2lvbixcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uVXBkYXRlZCxcblx0XHRcdFx0Y3VzdG9taXphdGlvbjogaXRlbS5jdXN0b21pemF0aW9uLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdGdldEN1c3RvbWl6YXRpb25zKCk6IHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXSB7XG5cdFx0Ly8gUHJvdmlkZXItbGV2ZWwgY3VzdG9taXphdGlvbiBjYXRhbG9ndWUgXHUyMDE0IGZlZWRzIGBBZ2VudEluZm8uY3VzdG9taXphdGlvbnNgXG5cdFx0Ly8gb24gYFJvb3RBZ2VudHNDaGFuZ2VkYC4gU2hvdWxkIGFkdmVydGlzZSBob3N0LWNvbmZpZ3VyZWQgcGx1Z2luIHJlZnNcblx0XHQvLyAodGhlIGVxdWl2YWxlbnQgb2YgQ29waWxvdCdzIGBhZ2VudEhvc3QuY3VzdG9taXphdGlvbnNgIHNldHRpbmcpLlxuXHRcdC8vIENsYXVkZSBoYXMgbm8gc3VjaCBzdXJmYWNlIHRvZGF5OyByZXR1cm5pbmcgYFtdYCBpcyBjb3JyZWN0IHJhdGhlclxuXHRcdC8vIHRoYW4gYWdncmVnYXRpbmcgY2xpZW50LXB1c2hlZCByZWZzICh0aG9zZSBsaXZlIG9uXG5cdFx0Ly8gYGFjdGl2ZUNsaWVudC5jdXN0b21pemF0aW9uc2AgcGVyIHNlc3Npb24pLlxuXHRcdC8vXG5cdFx0Ly8gVE9ETzogd2hlbiBob3N0LWxldmVsIGN1c3RvbWl6YXRpb25zIGJlY29tZSBhIHJlYWwgY29uY2VwdCBmb3IgdGhlXG5cdFx0Ly8gYWdlbnQgaG9zdCwgbGlmdCBgUGx1Z2luQ29udHJvbGxlcmAgb3V0IG9mIGBjb3BpbG90L2NvcGlsb3RBZ2VudC50c2Bcblx0XHQvLyBpbnRvIGEgc2hhcmVkIHNlcnZpY2Ugc28gYm90aCBwcm92aWRlcnMgY29uc3VtZSB0aGUgc2FtZSBjb25maWd1cmVkXG5cdFx0Ly8gaG9zdCBjdXN0b21pemF0aW9uIGxpc3QgcmF0aGVyIHRoYW4gZWFjaCBtYWludGFpbmluZyB0aGVpciBvd24uXG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0LyoqXG5cdCAqIGBob3N0Q3VzdG9taXphdGlvbnNgIGlzIHRoZSBob3N0J3MgbGFzdCBwdWJsaXNoZWQgc25hcHNob3QgZm9yIGBjaGF0YCxcblx0ICogc3VwcGxpZWQgZXhwbGljaXRseSBhdCB0aGlzIGJvdW5kYXJ5LiBgdW5kZWZpbmVkYCBtZWFucyB0aGUgaG9zdCBoYXNcblx0ICogcHVibGlzaGVkIG5vbmUgeWV0LCB3aGljaCBpcyBkZWxpYmVyYXRlbHkgZGlzdGluY3QgZnJvbSBhbiBlbXB0eSBsaXN0OlxuXHQgKiB0aGUgc2Vzc2lvbiBrZWVwcyBpdHMgb3duIHJlY29uY2lsZWQgdmlldyByYXRoZXIgdGhhbiBjbGVhcmluZyBpdC5cblx0ICpcblx0ICogUmVzb2x2ZXMgYGNoYXRgIHRocm91Z2ggaXRzIGV4YWN0IGJhY2tpbmcgb25seSAoe0BsaW5rIF9maW5kQ2hhdEJ5VXJpfSkgXHUyMDE0XG5cdCAqIG5ldmVyIGZhbGxzIGJhY2sgdG8gZ3Vlc3NpbmcgdGhlIFNESyBjb252ZXJzYXRpb24gaWQgZnJvbSB0aGVcblx0ICogY29uZmlndXJhdGlvbiBzY29wZSwgc2luY2UgYSBmcmVzaCBjaGF0J3MgU0RLIGlkIGlzIGluZGVwZW5kZW50IG9mIGl0LlxuXHQgKi9cblx0YXN5bmMgZ2V0Q2hhdEN1c3RvbWl6YXRpb25zKGNoYXQ6IFVSSSwgX2NvbnRleHQ6IFVSSSB8IElBZ2VudENoYXRDb250ZXh0LCBob3N0Q3VzdG9taXphdGlvbnM/OiByZWFkb25seSBDdXN0b21pemF0aW9uW10pOiBQcm9taXNlPHJlYWRvbmx5IEN1c3RvbWl6YXRpb25bXT4ge1xuXHRcdGNvbnN0IHNlc3MgPSB0aGlzLl9maW5kQ2hhdEJ5VXJpKGNoYXQpO1xuXHRcdGlmICghc2Vzcykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRpZiAoaG9zdEN1c3RvbWl6YXRpb25zKSB7XG5cdFx0XHRzZXNzLnNldEhvc3RDdXN0b21pemF0aW9ucyhob3N0Q3VzdG9taXphdGlvbnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gc2Vzcy5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMoKTtcblx0fVxuXG5cdGFzeW5jIHN0YXJ0TWNwU2VydmVyKHNlc3Npb246IFVSSSwgaWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3MgPSB0aGlzLl9maW5kQW55U2Vzc2lvbihBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbikpO1xuXHRcdGF3YWl0IHNlc3M/LnN0YXJ0TWNwU2VydmVyKGlkKTtcblx0fVxuXG5cdGFzeW5jIHN0b3BNY3BTZXJ2ZXIoc2Vzc2lvbjogVVJJLCBpZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VzcyA9IHRoaXMuX2ZpbmRBbnlTZXNzaW9uKEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSk7XG5cdFx0YXdhaXQgc2Vzcz8uc3RvcE1jcFNlcnZlcihpZCk7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHQvLyBJTlZBUklBTlQ6IFNESyBRdWVyeSBzdWJwcm9jZXNzZXMgKG93bmVkIGJ5IGluZGl2aWR1YWxcblx0XHQvLyBDbGF1ZGVBZ2VudFNlc3Npb24gd3JhcHBlcnMpIE1VU1QgZGllIEJFRk9SRSB0aGUgcHJveHkgaGFuZGxlXG5cdFx0Ly8gaXMgZGlzcG9zZWQuIEFmdGVyIHByb3h5IGRpc3Bvc2FsIHRoZSBwcm94eSBtYXkgcmViaW5kIG9uIGFcblx0XHQvLyBkaWZmZXJlbnQgcG9ydCBhbmQgYSBzdGlsbC1ydW5uaW5nIHN1YnByb2Nlc3Mgd291bGQgc2lsZW50bHlcblx0XHQvLyBsb3NlIGl0cyBlbmRwb2ludC4gU2VlIGBJQ2xhdWRlUHJveHlIYW5kbGVgIGRvYyBpblxuXHRcdC8vIGBjbGF1ZGVQcm94eVNlcnZpY2UudHNgLlxuXHRcdC8vXG5cdFx0Ly8gU3RlcCAxOiBhYm9ydCBldmVyeSBzZXNzaW9uIEFib3J0Q29udHJvbGxlci4gVGhlc2UgYXJlIHRoZVxuXHRcdC8vIHNhbWUgY29udHJvbGxlcnMgd2lyZWQgaW50byBgT3B0aW9ucy5hYm9ydENvbnRyb2xsZXJgIGF0XG5cdFx0Ly8gbWF0ZXJpYWxpemUgdGltZSwgc28gYW55IGluLWZsaWdodCBgYXdhaXQgc2RrLnN0YXJ0dXAoKWAgd2lsbFxuXHRcdC8vIHJlamVjdCBhbmQgYW55IHNlcXVlbmNlci1xdWV1ZWQgbWF0ZXJpYWxpemUgY29udGludWF0aW9uIHdpbGxcblx0XHQvLyB0cmlwIGl0cyBhYm9ydCBnYXRlcyB3aXRob3V0IHJlYWNoaW5nIHJlZ2lzdHJhdGlvbi5cblx0XHQvL1xuXHRcdC8vIFN0ZXAgMjogYHN1cGVyLmRpc3Bvc2UoKWAgc3luY2hyb25vdXNseSBkaXNwb3NlcyBib3RoIGNoYXQgbWFwcy5cblx0XHQvL1xuXHRcdC8vIFN0ZXAgMzogb25seSB0aGVuIHJlbGVhc2UgdGhlIHByb3h5IGhhbmRsZSwgcHJlc2VydmluZyB0aGVcblx0XHQvLyB3cmFwcGVyLWJlZm9yZS1wcm94eSBvcmRlcmluZyBpbnZhcmlhbnQuIFRoaXMgaXMgbG9ja2VkIGJ5XG5cdFx0Ly8gdGVzdCBcImRpc3Bvc2UgZGlzcG9zZXMgdGhlIHByb3h5IGhhbmRsZSBhbmQgaXMgaWRlbXBvdGVudFwiLlxuXHRcdGZvciAoY29uc3QgY2hhdCBvZiB0aGlzLl9hbGxMaXZlU2Vzc2lvbnMoKSkge1xuXHRcdFx0Y2hhdC5hYm9ydENvbnRyb2xsZXIuYWJvcnQoKTtcblx0XHR9XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3Byb3h5SGFuZGxlPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fcHJveHlIYW5kbGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZ2l0aHViVG9rZW4gPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbW9kZWxzLnNldChbXSwgdW5kZWZpbmVkKTtcblx0fVxufVxuXG5jbGFzcyBDbGF1ZGVDaGF0RW50cnkgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0Y29uc3RydWN0b3IocmVhZG9ubHkgY2hhdFNlc3Npb246IENsYXVkZUFnZW50U2Vzc2lvbikge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2hhdFNlc3Npb24pO1xuXHR9XG5cblx0YWRkRGlzcG9zYWJsZShkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRpc3Bvc2FibGUpO1xuXHR9XG59XG4i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
