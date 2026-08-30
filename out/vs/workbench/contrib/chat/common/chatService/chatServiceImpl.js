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
import { DeferredPromise, raceCancellationError, raceTimeout } from "../../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { BugIndicatingError, ErrorNoTelemetry } from "../../../../../base/common/errors.js";
import { Emitter } from "../../../../../base/common/event.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { Iterable } from "../../../../../base/common/iterator.js";
import { Disposable, DisposableResourceMap, DisposableStore, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../base/common/map.js";
import { revive } from "../../../../../base/common/marshalling.js";
import { equals } from "../../../../../base/common/objects.js";
import { autorun, derived, observableValue } from "../../../../../base/common/observable.js";
import { isEqual } from "../../../../../base/common/resources.js";
import { StopWatch } from "../../../../../base/common/stopwatch.js";
import { isDefined } from "../../../../../base/common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { OffsetRange } from "../../../../../editor/common/core/ranges/offsetRange.js";
import { localize } from "../../../../../nls.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { Progress } from "../../../../../platform/progress/common/progress.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { IChatDebugService } from "../chatDebugService.js";
import { IMcpService } from "../../../mcp/common/mcpTypes.js";
import { awaitStatsForSession } from "../chat.js";
import { ChatPerfMark, clearChatMarks, markChat } from "../chatPerf.js";
import { IChatAgentService } from "../participants/chatAgents.js";
import { chatEditingSessionIsReady } from "../editing/chatEditingService.js";
import { ChatModel, ChatRequestModel, ChatRequestRemovalReason, normalizeSerializableChatData, toChatHistoryContent, updateRanges, logChangesToStateModel } from "../model/chatModel.js";
import { ChatModelStore } from "../model/chatModelStore.js";
import { chatAgentLeader, ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestSlashCommandPart, ChatRequestTextPart, chatSubcommandLeader, getPromptText } from "../requestParser/chatParserTypes.js";
import { ChatRequestParser } from "../requestParser/chatRequestParser.js";
import { ChatMcpServersStarting, ChatPendingRequestChangeEventName, ChatRequestQueueKind, ChatStopCancellationNoopEventName, ResponseModelState } from "./chatService.js";
import { ChatRequestTelemetry, ChatServiceTelemetry } from "./chatServiceTelemetry.js";
import { IChatSessionsService, isAgentHostTarget, isTerminalCommandPrompt, localChatSessionType } from "../chatSessionsService.js";
import { ChatSessionStore } from "../model/chatSessionStore.js";
import { IChatSlashCommandService } from "../participants/chatSlashCommands.js";
import { IChatTransferService } from "../model/chatTransferService.js";
import { chatSessionResourceToId, getChatSessionType, isUntitledChatSession, LocalChatSessionUri } from "../model/chatUri.js";
import { ChatRequestVariableSet, IChatRequestVariableEntry, isExplicitFileOrImageVariableEntry, isPromptTextVariableEntry } from "../attachments/chatVariableEntries.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from "../constants.js";
import { ChatMessageRole, ILanguageModelsService } from "../languageModels.js";
import { ModelSelectionReason } from "../modelSelection.js";
import { ILanguageModelToolsService, ToolAndToolSetEnablementMap } from "../tools/languageModelToolsService.js";
import { ChatSessionOperationLog } from "../model/chatSessionOperationLog.js";
import { IPromptsService } from "../promptSyntax/service/promptsService.js";
import { AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING, TROUBLESHOOT_COMMAND_NAME, TROUBLESHOOT_SKILL_PATH, COPILOT_SKILL_URI_SCHEME } from "../promptSyntax/promptTypes.js";
import { mergeHooks } from "../promptSyntax/hookSchema.js";
import { ComputeAutomaticInstructions } from "../promptSyntax/computeAutomaticInstructions.js";
import { findLast } from "../../../../../base/common/arraysFind.js";
import { ChatMode } from "../chatModes.js";
const serializedChatKey = "interactive.sessions";
function hasDraftInput(model) {
  const state = model.inputModel.state.get();
  if (!state) {
    return false;
  }
  if (state.inputText.trim().length > 0) {
    return true;
  }
  return state.attachments.length > 0;
}
let CancellableRequest = class {
  constructor(cancellationTokenSource, requestId, responseCompletePromise, sendOptions, toolsService) {
    this.cancellationTokenSource = cancellationTokenSource;
    this.requestId = requestId;
    this.responseCompletePromise = responseCompletePromise;
    this.sendOptions = sendOptions;
    this.toolsService = toolsService;
    this._yieldRequested = observableValue(this, false);
  }
  get yieldRequested() {
    return this._yieldRequested;
  }
  dispose() {
    if (this.requestId) {
      this.toolsService.cancelToolCallsForRequest(this.requestId);
    }
    this.cancellationTokenSource.dispose();
  }
  cancel() {
    if (this.requestId) {
      this.toolsService.cancelToolCallsForRequest(this.requestId);
    }
    this.cancellationTokenSource.cancel();
  }
  setYieldRequested() {
    this._yieldRequested.set(true, void 0);
  }
  resetYieldRequested() {
    this._yieldRequested.set(false, void 0);
  }
};
CancellableRequest = __decorateClass([
  __decorateParam(4, ILanguageModelToolsService)
], CancellableRequest);
const EMPTY_REFERENCES = Object.freeze([]);
const EMPTY_TOOL_ENABLEMENT_MAP = ToolAndToolSetEnablementMap.fromEntries([]);
function backfillRestoredPickerState(stateToApply, savedState, defaultAgentModeId) {
  if (!stateToApply || !savedState) {
    return stateToApply;
  }
  const mode = stateToApply.mode.id === defaultAgentModeId && savedState.mode.id !== defaultAgentModeId ? savedState.mode : stateToApply.mode;
  if (mode === stateToApply.mode) {
    return stateToApply;
  }
  return { ...stateToApply, mode };
}
function backfillTransferredModel(transferredState, historyModel) {
  if (!transferredState || transferredState.selectedModel || !historyModel) {
    return transferredState;
  }
  return { ...transferredState, selectedModel: historyModel };
}
let ChatService = class extends Disposable {
  constructor(storageService, logService, telemetryService, extensionService, instantiationService, workspaceContextService, chatSlashCommandService, chatAgentService, configurationService, chatTransferService, chatSessionService, mcpService, promptsService, chatEntitlementService, languageModelsService, chatDebugService) {
    super();
    this.storageService = storageService;
    this.logService = logService;
    this.telemetryService = telemetryService;
    this.extensionService = extensionService;
    this.instantiationService = instantiationService;
    this.workspaceContextService = workspaceContextService;
    this.chatSlashCommandService = chatSlashCommandService;
    this.chatAgentService = chatAgentService;
    this.configurationService = configurationService;
    this.chatTransferService = chatTransferService;
    this.chatSessionService = chatSessionService;
    this.mcpService = mcpService;
    this.promptsService = promptsService;
    this.chatEntitlementService = chatEntitlementService;
    this.languageModelsService = languageModelsService;
    this.chatDebugService = chatDebugService;
    this._pendingRequests = this._register(new DisposableResourceMap());
    this._queuedRequestDeferreds = /* @__PURE__ */ new Map();
    /** Pending requests that are synthetic streamed-turn trackers (not real in-flight requests). */
    this._syntheticPendingRequests = /* @__PURE__ */ new WeakSet();
    /**
     * In-flight untitled→real materializations, keyed by the original untitled
     * chat session resource. A first send to an untitled contributed session
     * stores the promise that resolves to the newly minted real resource (or
     * `undefined` on failure). A concurrent second send for the same untitled
     * resource awaits this instead of materializing a second real session.
     *
     * The committed (settled) untitled→real mapping is owned by
     * {@link IChatSessionsService} (published via `setMaterializedSessionResource`
     * and read via `getMaterializedSessionResource`); this map only tracks the
     * transient in-flight serialization.
     */
    this._inFlightUntitledMaterializations = new ResourceMap();
    this._saveModelsEnabled = true;
    this._onDidSubmitRequest = this._register(new Emitter());
    this.onDidSubmitRequest = this._onDidSubmitRequest.event;
    this._onDidPerformUserAction = this._register(new Emitter());
    this.onDidPerformUserAction = this._onDidPerformUserAction.event;
    this._onDidReceiveQuestionCarouselAnswer = this._register(new Emitter());
    this.onDidReceiveQuestionCarouselAnswer = this._onDidReceiveQuestionCarouselAnswer.event;
    this._onDidDisposeSession = this._register(new Emitter());
    this.onDidDisposeSession = this._onDidDisposeSession.event;
    this._sessionFollowupCancelTokens = this._register(new DisposableResourceMap());
    this._sessionModels = this._register(instantiationService.createInstance(ChatModelStore, {
      createModel: (props) => this._startSession(props),
      willDisposeModel: async (model) => {
        const localSessionId = LocalChatSessionUri.parseLocalSessionId(model.sessionResource);
        if (localSessionId && this.shouldStoreSession(model)) {
          if (model.getRequests().length === 0 && !model.customTitle) {
            logChangesToStateModel(model.inputModel, `disposing session ${model.sessionResource} (${localSessionId}) without title, deleting from storage`, void 0, void 0, this.logService);
            await this._chatSessionStore.deleteSession(localSessionId);
          } else if (this._saveModelsEnabled) {
            logChangesToStateModel(model.inputModel, `disposing session ${model.sessionResource} (${localSessionId}) with title, storing to storage`, void 0, void 0, this.logService);
            await this._chatSessionStore.storeSessions([model]);
          }
        } else if (!localSessionId && (model.getRequests().length > 0 || hasDraftInput(model))) {
          logChangesToStateModel(model.inputModel, `disposing external session ${model.sessionResource} with requests or draft input, storing metadata to storage`, void 0, void 0, this.logService);
          await this._chatSessionStore.storeSessionsMetadataOnly([model]);
        }
      }
    }));
    this._register(this._sessionModels.onDidDisposeModel((model) => {
      clearChatMarks(model.sessionResource);
      this.chatDebugService.endSession(model.sessionResource);
      this._sessionFollowupCancelTokens.get(model.sessionResource)?.cancel();
      this._sessionFollowupCancelTokens.deleteAndDispose(model.sessionResource);
      this.chatSessionService.clearMaterializedSessionResource(model.sessionResource);
      this._onDidDisposeSession.fire({ sessionResources: [model.sessionResource], reason: "cleared" });
    }));
    this._chatServiceTelemetry = this.instantiationService.createInstance(ChatServiceTelemetry);
    this._chatSessionStore = this._register(this.instantiationService.createInstance(ChatSessionStore));
    this._chatSessionStore.migrateDataIfNeeded(() => this.migrateData());
    const transferredData = this._chatSessionStore.getTransferredSessionData();
    if (transferredData) {
      this.trace("constructor", `Transferred session ${transferredData}`);
      this._transferredSessionResource = transferredData;
    }
    this._register(storageService.onWillSaveState(() => this.saveState()));
    this.chatModels = derived(this, (reader) => [...this._sessionModels.observable.read(reader).values()]);
    this.requestInProgressObs = derived((reader) => {
      const models = this._sessionModels.observable.read(reader).values();
      return Iterable.some(models, (model) => model.requestInProgress.read(reader));
    });
  }
  get transferredSessionResource() {
    return this._transferredSessionResource;
  }
  get onDidCreateModel() {
    return this._sessionModels.onDidCreateModel;
  }
  /**
   * For test use only
   */
  setSaveModelsEnabled(enabled) {
    this._saveModelsEnabled = enabled;
  }
  /**
   * For test use only
   */
  waitForModelDisposals() {
    return this._sessionModels.waitForModelDisposals();
  }
  get isEmptyWindow() {
    const workspace = this.workspaceContextService.getWorkspace();
    return !workspace.configuration && workspace.folders.length === 0;
  }
  get editingSessions() {
    return [...this._sessionModels.values()].map((v) => v.editingSession).filter(isDefined);
  }
  isEnabled(location) {
    return this.chatAgentService.getContributedDefaultAgent(location) !== void 0;
  }
  migrateData() {
    const sessionData = this.storageService.get(serializedChatKey, this.isEmptyWindow ? StorageScope.APPLICATION : StorageScope.WORKSPACE, "");
    if (sessionData) {
      const persistedSessions = this.deserializeChats(sessionData);
      const countsForLog = Object.keys(persistedSessions).length;
      if (countsForLog > 0) {
        this.info("migrateData", `Restored ${countsForLog} persisted sessions`);
      }
      return persistedSessions;
    }
    return;
  }
  saveState() {
    if (!this._saveModelsEnabled) {
      return;
    }
    const liveLocalChats = Array.from(this._sessionModels.values()).filter((session) => this.shouldStoreSession(session));
    const liveNonLocalChats = Array.from(this._sessionModels.values()).filter((session) => !LocalChatSessionUri.parseLocalSessionId(session.sessionResource));
    this._chatSessionStore.updateAndFlushIndexSync(liveLocalChats, liveNonLocalChats);
    this._chatSessionStore.storeSessions(liveLocalChats);
    this._chatSessionStore.storeSessionsMetadataOnly(liveNonLocalChats);
  }
  /**
   * Only persist local sessions from chat that are not imported.
   */
  shouldStoreSession(session) {
    if (session.isDeleted) {
      return false;
    }
    if (!LocalChatSessionUri.parseLocalSessionId(session.sessionResource)) {
      return false;
    }
    return session.initialLocation === ChatAgentLocation.Chat && !session.isImported;
  }
  notifyUserAction(action) {
    this._chatServiceTelemetry.notifyUserAction(action);
    this._onDidPerformUserAction.fire(action);
    if (action.action.kind === "chatEditingSessionAction") {
      const model = this._sessionModels.get(action.sessionResource);
      if (model) {
        model.notifyEditingAction(action.action);
      }
    }
  }
  notifyQuestionCarouselAnswer(requestId, resolveId, answers) {
    this._onDidReceiveQuestionCarouselAnswer.fire({ requestId, resolveId, answers });
  }
  async setChatSessionTitle(sessionResource, title) {
    const model = this._sessionModels.get(sessionResource);
    if (model) {
      model.setCustomTitle(title);
    }
    const localSessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
    if (localSessionId) {
      await this._chatSessionStore.setSessionTitle(localSessionId, title);
      this.saveState();
    }
  }
  trace(method, message) {
    if (message) {
      this.logService.trace(`ChatService#${method}: ${message}`);
    } else {
      this.logService.trace(`ChatService#${method}`);
    }
  }
  info(method, message) {
    if (message) {
      this.logService.info(`ChatService#${method}: ${message}`);
    } else {
      this.logService.info(`ChatService#${method}`);
    }
  }
  error(method, message) {
    this.logService.error(`ChatService#${method} ${message}`);
  }
  deserializeChats(sessionData) {
    try {
      const arrayOfSessions = revive(JSON.parse(sessionData));
      if (!Array.isArray(arrayOfSessions)) {
        throw new Error("Expected array");
      }
      const sessions = arrayOfSessions.reduce((acc, session) => {
        for (const request of session.requests) {
          if (Array.isArray(request.response)) {
            request.response = request.response.map((response) => {
              if (typeof response === "string") {
                return new MarkdownString(response);
              }
              return response;
            });
          } else if (typeof request.response === "string") {
            request.response = [new MarkdownString(request.response)];
          }
        }
        acc[session.sessionId] = normalizeSerializableChatData(session);
        return acc;
      }, {});
      return sessions;
    } catch (err) {
      this.error("deserializeChats", `Malformed session data: ${err}. [${sessionData.substring(0, 20)}${sessionData.length > 20 ? "..." : ""}]`);
      return {};
    }
  }
  /**
   * Returns an array of chat details for all persisted chat sessions that have at least one request.
   * Chat sessions that have already been loaded into the chat view are excluded from the result.
   * Imported chat sessions are also excluded from the result.
   * TODO this is only used by the old "show chats" command which can be removed when the pre-agents view
   * options are removed.
   */
  async getLocalSessionHistory() {
    const liveSessionItems = await this.getLiveSessionItems();
    const historySessionItems = await this.getHistorySessionItems();
    return [...liveSessionItems, ...historySessionItems];
  }
  /**
   * Returns an array of chat details for all local live chat sessions.
   */
  async getLiveSessionItems() {
    return await Promise.all(Array.from(this._sessionModels.values()).filter((session) => this.shouldBeInHistory(session)).map(chatModelToChatDetail));
  }
  /**
   * Returns an array of chat details for all local chat sessions in history (not currently loaded).
   */
  async getHistorySessionItems() {
    const index = await this._chatSessionStore.getIndex();
    return Object.values(index).filter((entry) => !entry.isExternal).filter((entry) => !this._sessionModels.has(LocalChatSessionUri.forSession(entry.sessionId)) && entry.initialLocation === ChatAgentLocation.Chat && !entry.isEmpty).map((entry) => {
      const sessionResource = LocalChatSessionUri.forSession(entry.sessionId);
      const { workingDirectory: workingDirectoryStr, ...rest } = entry;
      return {
        ...rest,
        sessionResource,
        isActive: this._sessionModels.has(sessionResource),
        workingDirectory: workingDirectoryStr ? URI.parse(workingDirectoryStr) : void 0
      };
    });
  }
  async getMetadataForSession(sessionResource) {
    const index = await this._chatSessionStore.getIndex();
    const metadata = index[sessionResource.toString()];
    if (metadata) {
      const { workingDirectory: workingDirectoryStr, ...rest } = metadata;
      return {
        ...rest,
        sessionResource,
        isActive: this._sessionModels.has(sessionResource),
        workingDirectory: workingDirectoryStr ? URI.parse(workingDirectoryStr) : void 0
      };
    }
    return void 0;
  }
  shouldBeInHistory(entry) {
    return !entry.isImported && !entry.isDeleted && !!LocalChatSessionUri.parseLocalSessionId(entry.sessionResource) && entry.initialLocation === ChatAgentLocation.Chat;
  }
  async removeHistoryEntry(sessionResource) {
    await this._chatSessionStore.deleteSession(this.toLocalSessionId(sessionResource));
    const model = this._sessionModels.get(sessionResource);
    if (model) {
      model.markDeleted();
    }
    this._onDidDisposeSession.fire({ sessionResources: [sessionResource], reason: "cleared" });
  }
  async clearAllHistoryEntries() {
    await this._chatSessionStore.clearAllSessions();
  }
  startNewLocalSession(location, options) {
    this.trace("startNewLocalSession");
    const sessionResource = LocalChatSessionUri.forSession(generateUuid());
    return this._sessionModels.acquireOrCreate({
      initialData: void 0,
      location,
      sessionResource,
      canUseTools: options?.canUseTools ?? true,
      disableBackgroundKeepAlive: options?.disableBackgroundKeepAlive
    }, options?.debugOwner ?? "ChatService#startNewLocalSession");
  }
  _startSession(props) {
    const { initialData, location, sessionResource, canUseTools, transferEditingSession, disableBackgroundKeepAlive, inputState, isReadOnly } = props;
    const model = this.instantiationService.createInstance(ChatModel, initialData, { initialLocation: location, canUseTools, resource: sessionResource, disableBackgroundKeepAlive, inputState, isReadOnly });
    if (location === ChatAgentLocation.Chat) {
      model.startEditingSession(true, transferEditingSession);
    }
    this.initializeSession(model);
    return model;
  }
  initializeSession(model) {
    this.trace("initializeSession", `Initialize session ${model.sessionResource}`);
    this.activateDefaultAgent(model.initialLocation).catch((e) => this.logService.error(e));
  }
  async activateDefaultAgent(location) {
    await this.extensionService.whenInstalledExtensionsRegistered();
    const defaultAgentData = this.chatAgentService.getContributedDefaultAgent(location) ?? this.chatAgentService.getContributedDefaultAgent(ChatAgentLocation.Chat);
    if (!defaultAgentData) {
      throw new ErrorNoTelemetry("No default agent contributed");
    }
    if (!defaultAgentData.isCore) {
      await this.extensionService.activateById(defaultAgentData.extensionId, {
        activationEvent: `onChatParticipant:${defaultAgentData.id}`,
        extensionId: defaultAgentData.extensionId,
        startup: false
      });
    }
    const defaultAgent = this.chatAgentService.getActivatedAgents().find((agent) => agent.id === defaultAgentData.id);
    if (!defaultAgent) {
      throw new ErrorNoTelemetry("No default agent registered");
    }
  }
  getSession(sessionResource) {
    return this._sessionModels.get(sessionResource);
  }
  acquireExistingSession(sessionResource, debugOwner) {
    return this._sessionModels.acquireExisting(sessionResource, debugOwner ?? "ChatService#acquireExistingSession");
  }
  getChatModelReferenceDebugInfo() {
    return this._sessionModels.getReferenceDebugSnapshot();
  }
  async acquireOrRestoreLocalSession(sessionResource, debugOwner) {
    this.trace("acquireOrRestoreSession", `${sessionResource}`);
    const existingRef = this.acquireExistingSession(sessionResource, debugOwner);
    if (existingRef) {
      return existingRef;
    }
    let sessionData;
    if (isEqual(this.transferredSessionResource, sessionResource)) {
      this._transferredSessionResource = void 0;
      sessionData = await this._chatSessionStore.readTransferredSession(sessionResource);
    } else {
      const localSessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
      if (localSessionId) {
        sessionData = await this._chatSessionStore.readSession(localSessionId);
      }
    }
    if (!sessionData) {
      return void 0;
    }
    const sessionRef = this._sessionModels.acquireOrCreate({
      initialData: sessionData,
      location: sessionData.value.initialLocation ?? ChatAgentLocation.Chat,
      sessionResource,
      canUseTools: true
    }, debugOwner ?? "ChatService#acquireOrRestoreLocalSession");
    return sessionRef;
  }
  // There are some cases where this returns a real string. What happens if it doesn't?
  // This had titles restored from the index, so just return titles from index instead, sync.
  getSessionTitle(sessionResource) {
    const sessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
    if (!sessionId) {
      return void 0;
    }
    return this._sessionModels.get(sessionResource)?.title ?? this._chatSessionStore.getMetadataForSessionSync(sessionResource)?.title;
  }
  loadSessionFromData(data, debugOwner) {
    const sessionId = data.sessionId ?? generateUuid();
    const sessionResource = LocalChatSessionUri.forSession(sessionId);
    return this._sessionModels.acquireOrCreate({
      initialData: { value: data, serializer: new ChatSessionOperationLog() },
      location: data.initialLocation ?? ChatAgentLocation.Chat,
      sessionResource,
      canUseTools: true
    }, debugOwner ?? "ChatService#loadSessionFromData");
  }
  async acquireOrLoadSession(sessionResource, location, token, debugOwner) {
    if (LocalChatSessionUri.isLocalSession(sessionResource)) {
      return this.acquireOrRestoreLocalSession(sessionResource, debugOwner);
    } else {
      return this.loadRemoteSession(sessionResource, location, token, debugOwner);
    }
  }
  async loadRemoteSession(sessionResource, location, token, debugOwner) {
    {
      const existingRef = this.acquireExistingSession(sessionResource, debugOwner);
      if (existingRef) {
        return existingRef;
      }
    }
    if (!await raceCancellationError(this.chatSessionService.canResolveChatSession(getChatSessionType(sessionResource)), token)) {
      return void 0;
    }
    const providedSession = await this.chatSessionService.getOrCreateChatSession(sessionResource, token);
    {
      const existingRef = this.acquireExistingSession(sessionResource, debugOwner);
      if (existingRef) {
        return existingRef;
      }
    }
    const chatSessionType = getChatSessionType(sessionResource);
    const modelId = findLast(providedSession.history.filter((m) => m.type === "request"), (req) => req.modelId)?.modelId;
    const agentUri = findLast(providedSession.history.filter((m) => m.type === "request"), (req) => req.modeInstructions?.uri)?.modeInstructions?.uri;
    const storedMetadata = this._chatSessionStore.getMetadataForSessionSync(sessionResource);
    const storedPermissionLevel = storedMetadata?.permissionLevel;
    const storedInputState = storedMetadata?.inputState;
    let initialData = void 0;
    let historySelectedModel = void 0;
    let historyDerivedModel = void 0;
    if (modelId || agentUri) {
      const mode = agentUri ? { kind: ChatModeKind.Agent, id: agentUri.toString() } : { kind: ChatModeKind.Agent, id: ChatMode.Agent.id };
      const modelMetadata = modelId ? this.languageModelsService.lookupLanguageModel(modelId) : void 0;
      const storedModelConfiguration = storedInputState?.selectedModel?.modelConfiguration ?? storedInputState?.modelConfiguration;
      const modelConfiguration = storedInputState?.selectedModel?.identifier === modelId ? storedModelConfiguration : void 0;
      const storedSelectedModel = storedInputState?.selectedModel;
      const selectedModel = modelId && modelMetadata ? { identifier: modelId, metadata: modelMetadata, modelConfiguration } : modelId && storedSelectedModel && storedSelectedModel.identifier === modelId ? { ...storedSelectedModel, modelConfiguration } : void 0;
      historySelectedModel = selectedModel?.identifier;
      historyDerivedModel = selectedModel;
      initialData = {
        serializer: new ChatSessionOperationLog(),
        value: {
          creationDate: Date.now(),
          initialLocation: void 0,
          customTitle: void 0,
          requests: [],
          responderUsername: "",
          sessionId: "",
          version: 3,
          inputState: {
            attachments: [],
            contrib: {},
            inputText: "",
            mode,
            selectedModel,
            selections: [],
            permissionLevel: storedPermissionLevel
          },
          pendingRequests: void 0,
          repoData: void 0
        }
      };
    }
    const restoredDraft = storedInputState ? { ...storedInputState, selectedModel: historyDerivedModel } : void 0;
    const transferredInputState = providedSession.transferredState?.inputState;
    const stateToApply = transferredInputState ? backfillTransferredModel(transferredInputState, historyDerivedModel) : restoredDraft;
    const inputState = backfillRestoredPickerState(stateToApply, storedInputState, ChatMode.Agent.id);
    const modelRef = this._sessionModels.acquireOrCreate({
      initialData,
      location,
      sessionResource,
      canUseTools: false,
      transferEditingSession: providedSession.transferredState?.editingSession,
      inputState,
      isReadOnly: providedSession.isReadOnly
    }, debugOwner ?? "ChatService#loadRemoteSession");
    if (modelId && !historySelectedModel) {
      modelRef.object.inputModel.setIntendedModel({ modelId, reason: ModelSelectionReason.SessionRestore });
    }
    logChangesToStateModel(modelRef.object.inputModel, `loadRemoteSession inputState source: session=${sessionResource.toString()}, chatSessionType=${chatSessionType}, historyModelId=${modelId}, agentUri=${agentUri?.toString()}, historySelectedModel=${historySelectedModel}, transferredSelectedModel=${providedSession.transferredState?.inputState?.selectedModel?.identifier}, storedSelectedModel=${storedInputState?.selectedModel?.identifier}, finalSelectedModel=${modelRef.object.inputModel.state.get()?.selectedModel?.identifier}, hasTransferredInputState=${!!providedSession.transferredState?.inputState}, hasStoredInputState=${!!storedInputState}, hasInitialData=${!!initialData}`, modelRef.object.inputModel.state.get(), void 0, this.logService);
    if (storedPermissionLevel && !initialData && !storedInputState) {
      modelRef.object.inputModel.setState({ permissionLevel: storedPermissionLevel });
    }
    if (providedSession.title) {
      modelRef.object.setCustomTitle(providedSession.title);
    }
    const model = modelRef.object;
    const disposables = new DisposableStore();
    disposables.add(modelRef.object.onDidDispose(() => {
      disposables.dispose();
      providedSession.dispose();
    }));
    const isAgentHostSession = isAgentHostTarget(chatSessionType);
    const requestParser = isAgentHostSession ? this.instantiationService.createInstance(ChatRequestParser) : void 0;
    const parseAgentHostHistoryPrompt = (text, agent) => {
      if (requestParser) {
        try {
          const attachmentCapabilities = this.getAttachmentCapabilitiesForParser(chatSessionType, agent);
          const parsed = requestParser.parseChatRequestWithReferences(
            EMPTY_REFERENCES,
            EMPTY_TOOL_ENABLEMENT_MAP,
            text,
            location,
            { sessionType: chatSessionType, forcedAgent: agent, attachmentCapabilities }
          );
          if (parsed.parts.length > 0) {
            return parsed;
          }
        } catch (e) {
          this.logService.warn(`ChatService#loadRemoteSession: failed to re-parse historical prompt for ${chatSessionType}`, e);
        }
      }
      return {
        text,
        parts: [new ChatRequestTextPart(
          new OffsetRange(0, text.length),
          { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: text.length + 1 },
          text
        )]
      };
    };
    let lastRequest;
    let lastResponseCompletedAt;
    const completeLastResponse = () => {
      if (Number.isFinite(lastResponseCompletedAt)) {
        lastRequest?.response?.complete(lastResponseCompletedAt);
      } else {
        lastRequest?.response?.completeWithoutTimestamp();
      }
      lastResponseCompletedAt = void 0;
    };
    for (const message of providedSession.history) {
      if (message.type === "request") {
        if (lastRequest) {
          completeLastResponse();
        }
        const requestText = message.prompt;
        const agent = message.participant ? this.chatAgentService.getAgent(message.participant) : this.chatAgentService.getAgent(chatSessionType);
        const parsedRequest = parseAgentHostHistoryPrompt(requestText, agent);
        const modeInfo = message.modeInstructions ? {
          kind: ChatModeKind.Agent,
          isBuiltin: message.modeInstructions.isBuiltin ?? false,
          modeInstructions: message.modeInstructions,
          telemetryModeId: "custom",
          applyCodeBlockSuggestionId: void 0
        } : void 0;
        lastRequest = model.addRequest(
          parsedRequest,
          message.variableData ?? { variables: [] },
          0,
          // attempt
          modeInfo,
          agent,
          void 0,
          // slashCommand
          void 0,
          // confirmation
          void 0,
          // locationData
          void 0,
          // attachments
          false,
          // Do not treat as requests completed, else edit pills won't show.
          message.modelId,
          void 0,
          message.id,
          message.isSystemInitiated,
          message.systemInitiatedLabel,
          void 0,
          // terminalExecutionId
          message.isTerminalRequest,
          message.timestamp ?? null,
          message.isHidden,
          message.origin
        );
      } else {
        if (lastRequest) {
          for (const part of message.parts) {
            model.acceptResponseProgress(lastRequest, part);
          }
          if (lastRequest.response && (message.details || message.errorDetails)) {
            lastRequest.response.setResult({
              ...message.details ? { details: message.details } : {},
              ...message.errorDetails ? { errorDetails: message.errorDetails } : {}
            });
          }
          if (lastRequest.response && typeof message.elapsedMs === "number") {
            lastRequest.response.setElapsedMs(message.elapsedMs);
          }
          lastResponseCompletedAt = message.completedAt;
        }
      }
    }
    const hasProgressStreaming = providedSession.progressObs && providedSession.interruptActiveResponseCallback;
    if (hasProgressStreaming) {
      let lastProgressLength = 0;
      const cancellationListener = disposables.add(new MutableDisposable());
      const createCancellationListener = (token2) => {
        return token2.onCancellationRequested(() => {
          providedSession.interruptActiveResponseCallback?.().then((userConfirmedInterruption) => {
            if (!userConfirmedInterruption) {
              trackNewCancellableRequest();
            }
          });
        });
      };
      const trackNewCancellableRequest = () => {
        const cancellableRequest = this.instantiationService.createInstance(CancellableRequest, new CancellationTokenSource(), void 0, void 0, void 0);
        this._syntheticPendingRequests.add(cancellableRequest);
        this._pendingRequests.set(model.sessionResource, cancellableRequest);
        this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: "add", source: "remoteSession", chatSessionId: chatSessionResourceToId(model.sessionResource) });
        cancellationListener.value = createCancellationListener(cancellableRequest.cancellationTokenSource.token);
      };
      const ensureCancellationTracking = () => {
        if (!this._pendingRequests.has(model.sessionResource)) {
          trackNewCancellableRequest();
        }
      };
      if (lastRequest && !providedSession.isCompleteObs?.get()) {
        trackNewCancellableRequest();
      }
      if (providedSession.onDidStartServerRequest) {
        disposables.add(providedSession.onDidStartServerRequest(({ id, prompt, variableData, timestamp, isSystemInitiated, isHidden, systemInitiatedLabel, isTerminalRequest, origin }) => {
          if (lastRequest?.response && !lastRequest.response.isComplete) {
            completeLastResponse();
          }
          const agent = this.chatAgentService.getAgent(chatSessionType);
          const parsedRequest = parseAgentHostHistoryPrompt(prompt, agent);
          lastRequest = model.addRequest(
            parsedRequest,
            variableData ?? { variables: [] },
            0,
            // attempt
            void 0,
            // modeInfo
            agent,
            void 0,
            // slashCommand
            void 0,
            // confirmation
            void 0,
            // locationData
            void 0,
            // attachments
            void 0,
            // isCompleteAddedRequest
            void 0,
            // modelId
            void 0,
            // userSelectedTools
            id,
            isSystemInitiated,
            systemInitiatedLabel,
            void 0,
            // terminalExecutionId
            isTerminalRequest,
            timestamp,
            isHidden,
            origin
          );
          lastProgressLength = 0;
          ensureCancellationTracking();
        }));
      }
      if (!this._isServerManagedQueue(model.sessionResource)) {
        let dispatchingImmediateSteer = false;
        const canImmediatelyDispatch = () => {
          if (!model.getPendingRequests().some((r) => r.kind === ChatRequestQueueKind.Steering)) {
            return false;
          }
          const pending = this._pendingRequests.get(model.sessionResource);
          return !pending || this._syntheticPendingRequests.has(pending);
        };
        disposables.add(model.onDidChangePendingRequests(() => {
          if (dispatchingImmediateSteer || !canImmediatelyDispatch()) {
            return;
          }
          dispatchingImmediateSteer = true;
          queueMicrotask(() => {
            dispatchingImmediateSteer = false;
            if (this._sessionModels.get(model.sessionResource) !== model || !canImmediatelyDispatch()) {
              return;
            }
            if (this._pendingRequests.has(model.sessionResource)) {
              this._pendingRequests.deleteAndDispose(model.sessionResource);
            }
            this.processNextPendingRequest(model);
            this._pendingRequests.get(model.sessionResource)?.responseCompletePromise?.finally(() => {
              if (this._sessionModels.get(model.sessionResource) === model && !(providedSession.isCompleteObs?.get() ?? false)) {
                ensureCancellationTracking();
              }
            });
          });
        }));
      }
      disposables.add(autorun((reader) => {
        const progressArray = providedSession.progressObs?.read(reader) ?? [];
        const isComplete = providedSession.isCompleteObs?.read(reader) ?? false;
        if (!isComplete) {
          ensureCancellationTracking();
        }
        if (lastRequest && progressArray.length > lastProgressLength) {
          const newProgress = progressArray.slice(lastProgressLength);
          for (const progress of newProgress) {
            model?.acceptResponseProgress(lastRequest, progress);
          }
          lastProgressLength = progressArray.length;
        }
        if (isComplete && lastRequest) {
          this._pendingRequests.deleteAndDispose(model.sessionResource);
          cancellationListener.clear();
          completeLastResponse();
          this.processPendingRequests(model.sessionResource);
        }
      }));
    } else {
      if (providedSession.isCompleteObs?.get()) {
        completeLastResponse();
      }
      this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: "notCancelable", source: "remoteSession", chatSessionId: chatSessionResourceToId(model.sessionResource) });
      if (lastRequest && model.editingSession) {
        await chatEditingSessionIsReady(model.editingSession);
        completeLastResponse();
      }
    }
    return modelRef;
  }
  async resendRequest(request, options) {
    const model = this._sessionModels.get(request.session.sessionResource);
    if (!model && model !== request.session) {
      throw new Error(`Unknown session: ${request.session.sessionResource}`);
    }
    if (model.isReadOnly.get()) {
      return;
    }
    const cts = this._pendingRequests.get(request.session.sessionResource);
    if (cts) {
      this.trace("resendRequest", `Session ${request.session.sessionResource} already has a pending request, cancelling...`);
      cts.cancel();
    }
    const location = options?.location ?? model.initialLocation;
    const attempt = options?.attempt ?? 0;
    const enableCommandDetection = !options?.noCommandDetection;
    const defaultAgent = this.chatAgentService.getDefaultAgent(location, options?.modeInfo?.kind);
    model.removeRequest(request.id, ChatRequestRemovalReason.Resend);
    const resendOptions = {
      ...options,
      locationData: request.locationData,
      attachedContext: request.attachedContext
    };
    await this._sendRequestAsync(model, model.sessionResource, request.message, attempt, enableCommandDetection, defaultAgent, location, resendOptions).responseCompletePromise;
  }
  queuePendingRequest(model, sessionResource, request, options) {
    const location = options.location ?? model.initialLocation;
    const parsedRequest = this.parseChatRequest(sessionResource, request, location, options);
    const requestModel = new ChatRequestModel({
      session: model,
      message: parsedRequest,
      variableData: { variables: options.attachedContext ?? [] },
      timestamp: Date.now(),
      modeInfo: options.modeInfo,
      locationData: options.locationData,
      attachedContext: options.attachedContext,
      modelId: options.userSelectedModelId,
      userSelectedTools: options.userSelectedTools?.get(),
      isSystemInitiated: options.isSystemInitiated,
      isHiddenFromTranscript: options.hideFromTranscript,
      systemInitiatedLabel: options.systemInitiatedLabel,
      terminalExecutionId: options.terminalExecutionId
    });
    const deferred = new DeferredPromise();
    this._queuedRequestDeferreds.set(requestModel.id, deferred);
    model.addPendingRequest(requestModel, options.queue ?? ChatRequestQueueKind.Queued, { ...options, queue: void 0 });
    if (options.queue === ChatRequestQueueKind.Steering) {
      this.setYieldRequested(sessionResource);
    }
    this.trace("sendRequest", `Queued message for session ${sessionResource}`);
    return { kind: "queued", requestId: requestModel.id, deferred: deferred.p };
  }
  async sendRequest(sessionResource, request, options) {
    this.trace("sendRequest", `sessionResource: ${sessionResource.toString()}, message: ${request.substring(0, 20)}${request.length > 20 ? "[...]" : ""}}`);
    const hasExplicitFileOrImageAttachment = [...options?.attachedContext ?? [], ...options?.resolvedVariables ?? []].some(isExplicitFileOrImageVariableEntry);
    if (!request.trim() && !hasExplicitFileOrImageAttachment && !options?.slashCommand && !options?.agentId && !options?.agentIdSilent) {
      this.trace("sendRequest", "Rejected empty message");
      return { kind: "rejected", reason: "Empty message" };
    }
    let newSessionResource;
    const materializedReal = this.chatSessionService.getMaterializedSessionResource(sessionResource);
    if (materializedReal) {
      sessionResource = materializedReal;
      newSessionResource = materializedReal;
    }
    let model = this._sessionModels.get(sessionResource);
    if (!model) {
      throw new Error(`Unknown session: ${sessionResource}`);
    }
    if (model.isReadOnly.get()) {
      return {
        kind: "rejected",
        reason: "Session is read-only",
        ...newSessionResource ? { newSessionResource } : {}
      };
    }
    if (!model.hasRequests && isUntitledChatSession(sessionResource) && getChatSessionType(sessionResource) !== localChatSessionType) {
      const materialized = await this._materializeUntitledSession(sessionResource, request, options, model);
      if (materialized) {
        model = materialized.model;
        sessionResource = materialized.sessionResource;
        newSessionResource = materialized.newSessionResource;
      }
    }
    if (model.isReadOnly.get()) {
      return { kind: "rejected", reason: "Session is read-only", newSessionResource };
    }
    const hasPendingRequest = this._pendingRequests.has(sessionResource);
    if (options?.queue) {
      const queued = this.queuePendingRequest(model, sessionResource, request, options);
      if (!options.pauseQueue) {
        this.processPendingRequests(sessionResource);
      }
      return queued;
    } else if (hasPendingRequest) {
      this.trace("sendRequest", `Session ${sessionResource} already has a pending request`);
      return { kind: "rejected", reason: "Request already in progress" };
    }
    const requests = model.getRequests();
    for (let i = requests.length - 1; i >= 0; i -= 1) {
      const request2 = requests[i];
      if (request2.shouldBeRemovedOnSend) {
        if (request2.shouldBeRemovedOnSend.afterUndoStop) {
          request2.response?.finalizeUndoState();
        } else {
          await this.removeRequest(sessionResource, request2.id);
        }
      }
    }
    const location = options?.location ?? model.initialLocation;
    const attempt = options?.attempt ?? 0;
    const defaultAgent = this.chatAgentService.getDefaultAgent(location, options?.modeInfo?.kind);
    if (!defaultAgent) {
      this.logService.warn("sendRequest", `No default agent for location ${location}`);
      return { kind: "rejected", reason: "No default agent available" };
    }
    const parsedRequest = this.parseChatRequest(sessionResource, request, location, options);
    const silentAgent = options?.agentIdSilent ? this.chatAgentService.getAgent(options.agentIdSilent) : void 0;
    const agent = silentAgent ?? parsedRequest.parts.find((r) => r instanceof ChatRequestAgentPart)?.agent ?? defaultAgent;
    const agentSlashCommandPart = parsedRequest.parts.find((r) => r instanceof ChatRequestAgentSubcommandPart);
    return {
      kind: "sent",
      newSessionResource,
      data: {
        ...this._sendRequestAsync(model, sessionResource, parsedRequest, attempt, !options?.noCommandDetection, silentAgent ?? defaultAgent, location, options),
        agent,
        slashCommand: agentSlashCommandPart?.command
      }
    };
  }
  /**
   * Converts an untitled contributed chat session into its real session on the
   * first send and returns the real model/resource so the caller can re-target
   * the request. Serialized per untitled resource: a first send stores an
   * in-flight promise, and a concurrent second send awaits it and converges on
   * the same real session (where the caller's pending-request check then rejects
   * the duplicate) instead of minting a second real session.
   *
   * Returns `undefined` when no conversion happened — either there is no
   * `newChatSessionItem` handler / the handler declined, or a concurrent
   * materialization failed — in which case the caller keeps using the untitled
   * session (the original behavior).
   */
  async _materializeUntitledSession(untitledResource, request, options, untitledModel) {
    const inFlight = this._inFlightUntitledMaterializations.get(untitledResource);
    if (inFlight) {
      const realResource = await inFlight;
      if (!realResource) {
        this.trace("materializeUntitledSession", `In-flight materialization of ${untitledResource.toString()} produced no real session; keeping untitled`);
        return void 0;
      }
      const realModel = this._sessionModels.get(realResource);
      if (!realModel) {
        this.info("materializeUntitledSession", `Joined in-flight materialization of ${untitledResource.toString()} but real model ${realResource.toString()} is missing; keeping untitled`);
        return void 0;
      }
      this.trace("materializeUntitledSession", `Concurrent send joined in-flight materialization ${untitledResource.toString()} -> ${realResource.toString()}`);
      return { model: realModel, sessionResource: realResource, newSessionResource: realResource };
    }
    const materialized = new DeferredPromise();
    this._inFlightUntitledMaterializations.set(untitledResource, materialized.p);
    try {
      const parsedRequest = this.parseChatRequest(untitledResource, request, options?.location ?? untitledModel.initialLocation, options);
      const commandPart = parsedRequest.parts.find((r) => r instanceof ChatRequestSlashCommandPart);
      const requestText = getPromptText(parsedRequest).message;
      const initialSessionOptions = this.chatSessionService.getSessionOptions(untitledResource);
      const newItem = await this.chatSessionService.createNewChatSessionItem(getChatSessionType(untitledResource), { prompt: requestText, command: commandPart?.text, initialSessionOptions, untitledResource }, CancellationToken.None);
      if (!newItem) {
        materialized.complete(void 0);
        return void 0;
      }
      this.chatSessionService.registerSessionResourceAlias(untitledResource, newItem.resource);
      const tempRef = await this.loadRemoteSession(newItem.resource, untitledModel.initialLocation, CancellationToken.None);
      const realModel = tempRef?.object;
      if (!realModel) {
        throw new Error(`Failed to load session for resource: ${newItem.resource}`);
      }
      if (initialSessionOptions) {
        this.chatSessionService.updateSessionOptions(realModel.sessionResource, initialSessionOptions);
      }
      realModel.inputModel.setIntendedModel(untitledModel.inputModel.intendedModel);
      this.chatSessionService.setMaterializedSessionResource(untitledResource, newItem.resource);
      materialized.complete(newItem.resource);
      this.info("materializeUntitledSession", `Materialized untitled session ${untitledResource.toString()} into real session ${newItem.resource.toString()}`);
      return { model: realModel, sessionResource: newItem.resource, newSessionResource: newItem.resource };
    } catch (err) {
      materialized.complete(void 0);
      throw err;
    } finally {
      if (this._inFlightUntitledMaterializations.get(untitledResource) === materialized.p) {
        this._inFlightUntitledMaterializations.delete(untitledResource);
      }
    }
  }
  getAttachmentCapabilitiesForParser(chatSessionType, agent) {
    return this.chatSessionService.getCapabilitiesForSessionType(chatSessionType) ?? agent?.capabilities;
  }
  parseChatRequest(sessionResource, request, location, options) {
    let parserContext = options?.parserContext;
    let contextAgent = parserContext?.forcedAgent ?? parserContext?.selectedAgent;
    if (options?.agentId) {
      const agent = this.chatAgentService.getAgent(options.agentId);
      if (!agent) {
        throw new Error(`Unknown agent: ${options.agentId}`);
      }
      contextAgent = agent;
      parserContext = { ...parserContext, selectedAgent: agent, mode: options.modeInfo?.kind };
      const commandPart = options.slashCommand ? ` ${chatSubcommandLeader}${options.slashCommand}` : "";
      request = `${chatAgentLeader}${agent.name}${commandPart} ${request}`;
    } else if (options?.agentIdSilent && !parserContext?.forcedAgent) {
      const silentAgent = this.chatAgentService.getAgent(options.agentIdSilent);
      if (silentAgent) {
        contextAgent = silentAgent;
        parserContext = { ...parserContext, forcedAgent: silentAgent };
      }
    }
    const attachmentCapabilities = parserContext?.attachmentCapabilities ?? this.getAttachmentCapabilitiesForParser(getChatSessionType(sessionResource), contextAgent);
    if (attachmentCapabilities) {
      parserContext = { ...parserContext, attachmentCapabilities };
    }
    const parsedRequest = this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(sessionResource, request, location, parserContext);
    return parsedRequest;
  }
  refreshFollowupsCancellationToken(sessionResource) {
    this._sessionFollowupCancelTokens.get(sessionResource)?.cancel();
    const newTokenSource = new CancellationTokenSource();
    this._sessionFollowupCancelTokens.set(sessionResource, newTokenSource);
    return newTokenSource.token;
  }
  _sendRequestAsync(model, sessionResource, parsedRequest, attempt, enableCommandDetection, defaultAgent, location, options) {
    const followupsCancelToken = this.refreshFollowupsCancellationToken(sessionResource);
    let request;
    const agentPart = parsedRequest.parts.find((r) => r instanceof ChatRequestAgentPart);
    const agentSlashCommandPart = parsedRequest.parts.find((r) => r instanceof ChatRequestAgentSubcommandPart);
    const commandPart = parsedRequest.parts.find((r) => r instanceof ChatRequestSlashCommandPart);
    const requests = [...model.getRequests()];
    const isTerminalCommand = isTerminalCommandPrompt(parsedRequest.text, this.chatSessionService.getCapabilitiesForSessionType(getChatSessionType(sessionResource))?.terminalCommandPrefix);
    const requestTelemetry = this.instantiationService.createInstance(ChatRequestTelemetry, {
      agent: agentPart?.agent ?? defaultAgent,
      agentSlashCommandPart,
      commandPart,
      sessionResource: model.sessionResource,
      location: model.initialLocation,
      options,
      enableCommandDetection
    });
    let gotProgress = false;
    const requestType = commandPart ? "slashCommand" : "string";
    const responseCreated = new DeferredPromise();
    let responseCreatedComplete = false;
    function completeResponseCreated() {
      if (!responseCreatedComplete && request?.response) {
        responseCreated.complete(request.response);
        responseCreatedComplete = true;
      }
    }
    const store = new DisposableStore();
    const source = store.add(new CancellationTokenSource());
    const token = source.token;
    const sendRequestInternal = async () => {
      const progressCallback = (progress) => {
        if (token.isCancellationRequested) {
          return;
        }
        if (!gotProgress) {
          markChat(sessionResource, ChatPerfMark.FirstToken);
        }
        gotProgress = true;
        for (let i = 0; i < progress.length; i++) {
          const isLast = i === progress.length - 1;
          const progressItem = progress[i];
          if (progressItem.kind === "markdownContent") {
            this.trace("sendRequest", `Provider returned progress for session ${model.sessionResource}, ${progressItem.content.value.length} chars`);
          } else {
            this.trace("sendRequest", `Provider returned progress: ${JSON.stringify(progressItem)}`);
          }
          if (request) {
            model.acceptResponseProgress(request, progressItem, !isLast);
          }
        }
        completeResponseCreated();
      };
      let detectedAgent;
      let detectedCommand;
      {
        const fileLoggingEnabled = this.configurationService.getValue(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING);
        if (!fileLoggingEnabled) {
          const isTroubleshootCommand = agentSlashCommandPart?.command.name === TROUBLESHOOT_COMMAND_NAME;
          const hasTroubleshootSkill = options?.attachedContext?.some((v) => {
            const uri = IChatRequestVariableEntry.toUri(v);
            return uri && (uri.scheme === COPILOT_SKILL_URI_SCHEME || uri.path.includes(TROUBLESHOOT_SKILL_PATH));
          });
          if (isTroubleshootCommand || hasTroubleshootSkill) {
            request = model.addRequest(parsedRequest, { variables: [] }, attempt, options?.modeInfo);
            completeResponseCreated();
            const settingsArg = encodeURIComponent(JSON.stringify(AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING));
            model.acceptResponseProgress(request, {
              kind: "markdownContent",
              content: new MarkdownString(localize(
                "agentDebugLog.troubleshootDisabled",
                "The `{0}` skill requires `{1}` to be enabled. After enabling, reload the window to apply. [Enable in Settings](command:workbench.action.openSettings?{2})",
                TROUBLESHOOT_COMMAND_NAME,
                AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING,
                settingsArg
              ), { isTrusted: { enabledCommands: ["workbench.action.openSettings"] } })
            });
            model.setResponse(request, {});
            request.response?.complete();
            store.dispose();
            return;
          }
        }
      }
      const collectHooks = async () => {
        let collectedHooks;
        let hasDisabledClaudeHooks = false;
        try {
          const hooksInfo = await this.promptsService.getHooks(token);
          if (hooksInfo) {
            collectedHooks = hooksInfo.hooks;
            hasDisabledClaudeHooks = hooksInfo.hasDisabledClaudeHooks;
          }
        } catch (error) {
          this.logService.warn("[ChatService] Failed to collect hooks:", error);
        }
        const agentName = options?.modeInfo?.modeInstructions?.name;
        if (agentName) {
          try {
            const agents = await this.promptsService.getCustomAgents(token);
            const customAgent = agents.find((a) => a.name === agentName && a.enabled);
            if (customAgent?.hooks) {
              collectedHooks = mergeHooks(collectedHooks, customAgent.hooks);
            }
          } catch (error) {
            this.logService.warn("[ChatService] Failed to collect agent hooks:", error);
          }
        }
        return { hooks: collectedHooks, hasDisabledClaudeHooks };
      };
      const collectInstructions = async () => {
        const ctx = options?.instructionContext;
        if (!ctx) {
          return [];
        }
        if (this.configurationService.getValue(ChatConfiguration.CollectInstructionsInExtension) === true) {
          return [];
        }
        markChat(sessionResource, ChatPerfMark.WillCollectInstructions);
        try {
          const variableSet = new ChatRequestVariableSet(options?.attachedContext);
          const computer = this.instantiationService.createInstance(ComputeAutomaticInstructions, ctx.modeKind, ctx.enabledTools, ctx.enabledSubAgents, getChatSessionType(sessionResource));
          await computer.collect(variableSet, token);
          const originalIds = new Set((options?.attachedContext ?? []).map((v) => v.id));
          return variableSet.asArray().filter((v) => !originalIds.has(v.id));
        } catch (err) {
          this.logService.error("[ChatService] Failed to collect instructions:", err);
          return [];
        } finally {
          markChat(sessionResource, ChatPerfMark.DidCollectInstructions);
        }
      };
      const stopWatch = new StopWatch(false);
      store.add(token.onCancellationRequested(() => {
        this.trace("sendRequest", `Request for session ${model.sessionResource} was cancelled`);
        if (!request) {
          return;
        }
        requestTelemetry.complete({
          timeToFirstProgress: void 0,
          result: "cancelled",
          // Normally timings happen inside the EH around the actual provider. For cancellation we can measure how long the user waited before cancelling
          totalTime: stopWatch.elapsed(),
          requestType,
          detectedAgent,
          request
        });
        model.cancelRequest(request);
      }));
      try {
        let rawResult;
        let agentOrCommandFollowups = void 0;
        if (agentPart || defaultAgent && !commandPart) {
          const initialAgent = agentPart?.agent ?? defaultAgent;
          const initialCommand = agentSlashCommandPart?.command;
          const initVariableData = { variables: [] };
          request = model.addRequest(parsedRequest, initVariableData, attempt, options?.modeInfo, initialAgent, initialCommand, options?.confirmation, options?.locationData, options?.attachedContext, void 0, options?.userSelectedModelId, options?.userSelectedTools?.get(), void 0, options?.isSystemInitiated, options?.systemInitiatedLabel, options?.terminalExecutionId, isTerminalCommand, void 0, options?.hideFromTranscript);
          const thisRequest = request;
          completeResponseCreated();
          const [hooksResult, instructionEntries] = await Promise.all([
            collectHooks(),
            collectInstructions()
          ]);
          const collectedHooks = hooksResult.hooks;
          const hasDisabledClaudeHooks = hooksResult.hasDisabledClaudeHooks;
          const allContext = this.prepareContext(request.attachedContext);
          if (instructionEntries.length > 0) {
            allContext.push(...instructionEntries);
          }
          const storedVariables = allContext.filter((v) => !(isPromptTextVariableEntry(v) && v.automaticallyAdded));
          model.updateRequest(request, { variables: storedVariables });
          let variableData = { variables: allContext };
          if (options?.resolvedVariables?.length) {
            variableData = { variables: [...variableData.variables, ...options.resolvedVariables] };
          }
          const promptTextResult = getPromptText(request.message);
          variableData = updateRanges(variableData, promptTextResult.diff);
          const message = promptTextResult.message;
          const buildAgentRequest = (agent2, command2, enableCommandDetection2, isParticipantDetected) => {
            const agentRequest = {
              sessionResource: model.sessionResource,
              requestId: thisRequest.id,
              agentId: agent2.id,
              message,
              command: command2?.name,
              variables: variableData,
              enableCommandDetection: enableCommandDetection2,
              isParticipantDetected,
              attempt,
              location,
              locationData: thisRequest.locationData,
              acceptedConfirmationData: options?.acceptedConfirmationData,
              rejectedConfirmationData: options?.rejectedConfirmationData,
              agentHostSessionConfig: options?.agentHostSessionConfig,
              userSelectedModelId: options?.userSelectedModelId,
              modelConfiguration: options?.userSelectedModelConfiguration ?? (options?.userSelectedModelId ? this.languageModelsService.getModelConfiguration(options.userSelectedModelId) : void 0),
              userSelectedTools: options?.userSelectedTools?.get(),
              modeInstructions: options?.modeInfo?.modeInstructions,
              permissionLevel: options?.modeInfo?.permissionLevel,
              editedFileEvents: thisRequest.editedFileEvents,
              hooks: collectedHooks,
              hasHooksEnabled: !!collectedHooks && Object.values(collectedHooks).some((arr) => arr.length > 0),
              isVoiceModeInput: options?.isVoiceModeInput,
              isSystemInitiated: options?.isSystemInitiated,
              hideFromTranscript: options?.hideFromTranscript,
              workingDirectory: model.workingDirectory
            };
            let isInitialTools = true;
            store.add(autorun((reader) => {
              const tools = options?.userSelectedTools?.read(reader);
              if (isInitialTools) {
                isInitialTools = false;
                return;
              }
              if (tools && request) {
                this.chatAgentService.setRequestTools(agent2.id, request.id, tools);
                agentRequest.userSelectedTools = tools;
              }
            }));
            return agentRequest;
          };
          if (this.configurationService.getValue("chat.detectParticipant.enabled") !== false && this.chatAgentService.hasChatParticipantDetectionProviders() && !agentPart && !commandPart && !agentSlashCommandPart && enableCommandDetection && location !== ChatAgentLocation.EditorInline && options?.modeInfo?.kind !== ChatModeKind.Agent && options?.modeInfo?.kind !== ChatModeKind.Edit && !options?.agentIdSilent) {
            const defaultAgentHistory = this.getHistoryEntriesFromModel(requests, location, defaultAgent.id);
            const chatAgentRequest = buildAgentRequest(defaultAgent, void 0, enableCommandDetection, false);
            const result = await this.chatAgentService.detectAgentOrCommand(chatAgentRequest, defaultAgentHistory, { location }, token);
            if (result && this.chatAgentService.getAgent(result.agent.id)?.locations?.includes(location)) {
              request?.response?.setAgent(result.agent, result.command);
              detectedAgent = result.agent;
              detectedCommand = result.command;
            }
          }
          const agent = detectedAgent ?? agentPart?.agent ?? defaultAgent;
          const command = detectedCommand ?? agentSlashCommandPart?.command;
          await this.extensionService.activateByEvent(`onChatParticipant:${agent.id}`);
          const history = this.getHistoryEntriesFromModel(requests, location, agent.id);
          const requestProps = buildAgentRequest(agent, command, enableCommandDetection, !!detectedAgent);
          this.generateInitialChatTitleIfNeeded(model, requestProps, defaultAgent, token);
          const pendingRequest = this._pendingRequests.get(sessionResource);
          if (pendingRequest) {
            store.add(autorun((reader) => {
              const yieldRequested = pendingRequest.yieldRequested.read(reader);
              if (request) {
                this.chatAgentService.setYieldRequested(agent.id, request.id, yieldRequested);
              }
            }));
            pendingRequest.requestId ??= requestProps.requestId;
            if (pendingRequest.requestId) {
              this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: "add", source: "sendRequestId", requestId: pendingRequest.requestId, chatSessionId: chatSessionResourceToId(sessionResource) });
            }
          }
          const disabledClaudeHooksDismissedKey = "chat.disabledClaudeHooks.notification";
          if (hasDisabledClaudeHooks && !this.storageService.getBoolean(disabledClaudeHooksDismissedKey, StorageScope.WORKSPACE)) {
            this.storageService.store(disabledClaudeHooksDismissedKey, true, StorageScope.WORKSPACE, StorageTarget.USER);
            progressCallback([{ kind: "disabledClaudeHooks" }]);
          }
          if (model.canUseTools) {
            const autostartResult = new ChatMcpServersStarting(this.mcpService.autostart(token));
            if (!autostartResult.isEmpty) {
              progressCallback([autostartResult]);
              await autostartResult.wait();
            }
          }
          const agentResult = await this.chatAgentService.invokeAgent(agent.id, requestProps, progressCallback, history, token);
          rawResult = agentResult;
          agentOrCommandFollowups = this.chatAgentService.getFollowups(agent.id, requestProps, agentResult, history, followupsCancelToken);
        } else if (commandPart && this.chatSlashCommandService.hasCommand(commandPart.slashCommand.command, getChatSessionType(model.sessionResource))) {
          if (commandPart.slashCommand.silent !== true) {
            request = model.addRequest(parsedRequest, { variables: [] }, attempt, options?.modeInfo);
            completeResponseCreated();
          }
          const history = [];
          for (const modelRequest of model.getRequests()) {
            if (!modelRequest.response) {
              continue;
            }
            history.push({ role: ChatMessageRole.User, content: [{ type: "text", value: modelRequest.message.text }] });
            history.push({ role: ChatMessageRole.Assistant, content: [{ type: "text", value: modelRequest.response.response.toString() }] });
          }
          const message = parsedRequest.text;
          const commandResult = await this.chatSlashCommandService.executeCommand(commandPart.slashCommand.command, message.substring(commandPart.slashCommand.command.length + 1).trimStart(), new Progress((p) => {
            progressCallback([p]);
          }), history, location, model.sessionResource, token, options);
          agentOrCommandFollowups = Promise.resolve(commandResult?.followUp);
          rawResult = {};
        } else {
          throw new Error(`Cannot handle request`);
        }
        if (token.isCancellationRequested && !rawResult) {
          return;
        } else if (!request) {
          shouldProcessPending = !token.isCancellationRequested;
          return;
        } else {
          if (!rawResult) {
            this.trace("sendRequest", `Provider returned no response for session ${model.sessionResource}`);
            rawResult = { errorDetails: { message: localize("emptyResponse", "Provider returned null response") } };
          }
          const result = rawResult.errorDetails?.responseIsFiltered ? "filtered" : rawResult.errorDetails && gotProgress ? "errorWithOutput" : rawResult.errorDetails ? "error" : "success";
          requestTelemetry.complete({
            timeToFirstProgress: rawResult.timings?.firstProgress,
            totalTime: rawResult.timings?.totalElapsed,
            result,
            requestType,
            detectedAgent,
            request
          });
          model.setResponse(request, rawResult);
          completeResponseCreated();
          this.trace("sendRequest", `Provider returned response for session ${model.sessionResource}`);
          if (rawResult.errorDetails?.isRateLimited) {
            this.chatEntitlementService.markAnonymousRateLimited();
          }
          shouldProcessPending = !rawResult.errorDetails && !token.isCancellationRequested && !request.response?.response.value.some((v) => v.kind === "confirmation" && !v.isUsed);
          request.response?.complete();
          if (agentOrCommandFollowups) {
            const completedRequest = request;
            agentOrCommandFollowups.then((followups) => {
              model.setFollowups(completedRequest, followups);
              const commandForTelemetry = agentSlashCommandPart ? agentSlashCommandPart.command.name : commandPart?.slashCommand.command;
              this._chatServiceTelemetry.retrievedFollowups(agentPart?.agent.id ?? "", commandForTelemetry, followups?.length ?? 0);
            });
          }
        }
      } catch (err) {
        this.logService.error(`Error while handling chat request: ${toErrorMessage(err, true)}`);
        if (request) {
          requestTelemetry.complete({
            timeToFirstProgress: void 0,
            totalTime: void 0,
            result: "error",
            requestType,
            detectedAgent,
            request
          });
          const rawResult = { errorDetails: { message: err.message } };
          model.setResponse(request, rawResult);
          completeResponseCreated();
          request.response?.complete();
        }
      } finally {
        store.dispose();
      }
    };
    let shouldProcessPending = false;
    const rawResponsePromise = sendRequestInternal();
    const cancellableRequest = this.instantiationService.createInstance(CancellableRequest, source, void 0, rawResponsePromise, options);
    this._pendingRequests.set(model.sessionResource, cancellableRequest);
    this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: "add", source: "sendRequest", chatSessionId: chatSessionResourceToId(model.sessionResource) });
    rawResponsePromise.finally(() => {
      markChat(sessionResource, ChatPerfMark.RequestComplete);
      clearChatMarks(sessionResource);
      if (this._pendingRequests.get(model.sessionResource) === cancellableRequest) {
        this._pendingRequests.deleteAndDispose(model.sessionResource);
        this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: "remove", source: "sendRequestComplete", requestId: cancellableRequest.requestId, chatSessionId: chatSessionResourceToId(model.sessionResource) });
      }
      if (shouldProcessPending) {
        this.processNextPendingRequest(model);
      }
    });
    if (options?.userSelectedModelId && !options.isSystemInitiated) {
      this.languageModelsService.addToRecentlyUsedList(options.userSelectedModelId);
    }
    this._onDidSubmitRequest.fire({ chatSessionResource: model.sessionResource, message: parsedRequest, attachedContext: options?.attachedContext });
    return {
      responseCreatedPromise: responseCreated.p,
      responseCompletePromise: rawResponsePromise
    };
  }
  processPendingRequests(sessionResource) {
    const model = this._sessionModels.get(sessionResource);
    if (model && !this._pendingRequests.has(sessionResource)) {
      this.processNextPendingRequest(model);
    }
  }
  /**
   * Returns true if the session is backed by an agent host server, which
   * controls queued-message dequeuing on the server side.
   */
  _isServerManagedQueue(sessionResource) {
    return getChatSessionType(sessionResource).startsWith("agent-host-");
  }
  /**
   * Process the next pending request from the model's queue, if any.
   * Called after a request completes to continue processing queued requests.
   * Multiple consecutive steering requests are combined into a single request.
   */
  processNextPendingRequest(model) {
    if (this._isServerManagedQueue(model.sessionResource)) {
      return;
    }
    const steeringRequests = model.dequeueAllSteeringRequests();
    const nextQueued = steeringRequests.length === 0 ? model.dequeuePendingRequest() : void 0;
    const allRequests = steeringRequests.length > 0 ? steeringRequests : nextQueued ? [nextQueued] : [];
    if (allRequests.length === 0) {
      return;
    }
    this.trace("processNextPendingRequest", `Processing ${allRequests.length} queued request(s) for session ${model.sessionResource}`);
    const deferreds = [];
    for (const req of allRequests) {
      const deferred = this._queuedRequestDeferreds.get(req.request.id);
      this._queuedRequestDeferreds.delete(req.request.id);
      if (deferred) {
        deferreds.push(deferred);
      }
    }
    const firstRequest = allRequests[0];
    const terminalIds = new Set(allRequests.map((req) => req.sendOptions.terminalExecutionId).filter((id) => !!id));
    if (terminalIds.size > 1) {
      this.info("processNextPendingRequest", `Dropping terminalExecutionId: ${terminalIds.size} conflicting terminal IDs (${[...terminalIds].join(", ")})`);
    }
    const mergedTerminalExecutionId = terminalIds.size === 1 ? [...terminalIds][0] : void 0;
    const sendOptions = {
      ...firstRequest.sendOptions,
      terminalExecutionId: mergedTerminalExecutionId,
      attachedContext: allRequests.flatMap((req) => req.request.variableData.variables.slice())
    };
    const location = sendOptions.location ?? sendOptions.locationData?.type ?? model.initialLocation;
    const defaultAgent = this.chatAgentService.getDefaultAgent(location, sendOptions.modeInfo?.kind);
    if (!defaultAgent) {
      this.logService.warn("processNextPendingRequest", `No default agent for location ${location}`);
      for (const deferred of deferreds) {
        deferred.complete({ kind: "rejected", reason: "No default agent available" });
      }
      return;
    }
    let parsedRequest;
    try {
      if (allRequests.length > 1) {
        const combinedText = allRequests.map((req) => req.request.message.text).join("\n\n");
        parsedRequest = this.parseChatRequest(model.sessionResource, combinedText, location, {
          ...sendOptions,
          agentId: void 0,
          slashCommand: void 0
        });
      } else {
        parsedRequest = firstRequest.request.message;
      }
    } catch (err) {
      this.logService.error("processNextPendingRequest: failed to parse combined chat request", err);
      const reason = toErrorMessage(err);
      for (const deferred of deferreds) {
        deferred.complete({ kind: "rejected", reason });
      }
      return;
    }
    const silentAgent = sendOptions.agentIdSilent ? this.chatAgentService.getAgent(sendOptions.agentIdSilent) : void 0;
    const agent = silentAgent ?? parsedRequest.parts.find((r) => r instanceof ChatRequestAgentPart)?.agent ?? defaultAgent;
    const agentSlashCommandPart = parsedRequest.parts.find((r) => r instanceof ChatRequestAgentSubcommandPart);
    const responseState = this._sendRequestAsync(model, model.sessionResource, parsedRequest, firstRequest.request.attempt, !sendOptions.noCommandDetection, silentAgent ?? defaultAgent, location, sendOptions);
    const result = {
      kind: "sent",
      data: {
        ...responseState,
        agent,
        slashCommand: agentSlashCommandPart?.command
      }
    };
    for (const deferred of deferreds) {
      deferred.complete(result);
    }
  }
  generateInitialChatTitleIfNeeded(model, request, defaultAgent, token) {
    if (model.getRequests().length !== 1 || model.customTitle) {
      return;
    }
    const singleEntryHistory = [{
      request,
      response: [],
      result: {}
    }];
    const generate = async () => {
      const title = await this.chatAgentService.getChatTitle(defaultAgent.id, singleEntryHistory, token);
      if (title && !model.customTitle) {
        model.setCustomTitle(title);
      }
    };
    void generate();
  }
  prepareContext(attachedContextVariables) {
    attachedContextVariables ??= [];
    attachedContextVariables.sort((a, b) => {
      if (!a.range && !b.range) {
        return 0;
      }
      if (!a.range) {
        return 1;
      }
      if (!b.range) {
        return -1;
      }
      return b.range.start - a.range.start;
    });
    return attachedContextVariables;
  }
  getHistoryEntriesFromModel(requests, location, forAgentId) {
    const history = [];
    const agent = this.chatAgentService.getAgent(forAgentId);
    for (const request of requests) {
      if (!request.response) {
        continue;
      }
      if (forAgentId !== request.response.agent?.id && !agent?.isDefault && !agent?.canAccessPreviousChatHistory) {
        continue;
      }
      if (location === ChatAgentLocation.EditorInline) {
        continue;
      }
      const promptTextResult = getPromptText(request.message);
      const historyRequest = {
        sessionResource: request.session.sessionResource,
        requestId: request.id,
        agentId: request.response.agent?.id ?? "",
        message: promptTextResult.message,
        command: request.response.slashCommand?.name,
        variables: updateRanges(request.variableData, promptTextResult.diff),
        // TODO bit of a hack
        location: ChatAgentLocation.Chat,
        editedFileEvents: request.editedFileEvents,
        modeInstructions: request.modeInfo?.modeInstructions
      };
      history.push({ request: historyRequest, response: toChatHistoryContent(request.response.response.value), result: request.response.result ?? {} });
    }
    return history;
  }
  async removeRequest(sessionResource, requestId) {
    const model = this._sessionModels.get(sessionResource);
    if (!model) {
      throw new Error(`Unknown session: ${sessionResource}`);
    }
    const pendingRequest = this._pendingRequests.get(sessionResource);
    if (pendingRequest?.requestId === requestId) {
      pendingRequest.cancel();
      this._pendingRequests.deleteAndDispose(sessionResource);
      this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: "remove", source: "removeRequest", requestId, chatSessionId: chatSessionResourceToId(model.sessionResource) });
    }
    model.removeRequest(requestId);
  }
  async adoptRequest(sessionResource, request) {
    if (!(request instanceof ChatRequestModel)) {
      throw new TypeError("Can only adopt requests of type ChatRequestModel");
    }
    const target = this._sessionModels.get(sessionResource);
    if (!target) {
      throw new Error(`Unknown session: ${sessionResource}`);
    }
    const oldOwner = request.session;
    target.adoptRequest(request);
    if (request.response && !request.response.isComplete) {
      const cts = this._pendingRequests.deleteAndLeak(oldOwner.sessionResource);
      if (cts) {
        cts.requestId = request.id;
        this._pendingRequests.set(target.sessionResource, cts);
        this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: "remove", source: "adoptRequest", requestId: request.id, chatSessionId: chatSessionResourceToId(oldOwner.sessionResource) });
        this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: "add", source: "adoptRequest", requestId: request.id, chatSessionId: chatSessionResourceToId(target.sessionResource) });
      }
    }
  }
  async addCompleteRequest(sessionResource, message, variableData, attempt, response) {
    this.trace("addCompleteRequest", `message: ${message}`);
    const model = this._sessionModels.get(sessionResource);
    if (!model) {
      throw new Error(`Unknown session: ${sessionResource}`);
    }
    const parsedRequest = typeof message === "string" ? this.instantiationService.createInstance(ChatRequestParser).parseChatRequest(sessionResource, message) : message;
    const request = model.addRequest(parsedRequest, variableData || { variables: [] }, attempt ?? 0, void 0, void 0, void 0, void 0, void 0, void 0, true);
    if (typeof response.message === "string") {
      model.acceptResponseProgress(request, { content: new MarkdownString(response.message), kind: "markdownContent" });
    } else {
      for (const part of response.message) {
        model.acceptResponseProgress(request, part, true);
      }
    }
    model.setResponse(request, response.result || {});
    if (response.followups !== void 0) {
      model.setFollowups(request, response.followups);
    }
    request.response?.complete();
  }
  async cancelCurrentRequestForSession(sessionResource, source) {
    this.trace("cancelCurrentRequestForSession", `session: ${sessionResource}`);
    const pendingRequest = this._pendingRequests.get(sessionResource);
    if (!pendingRequest) {
      if (source !== "archive") {
        const model = this._sessionModels.get(sessionResource);
        const requestInProgress = model?.requestInProgress.get();
        const pendingRequestsCount = model?.getPendingRequests().length ?? 0;
        const lastRequest = model?.lastRequest;
        this.telemetryService.publicLog2(ChatStopCancellationNoopEventName, {
          source: source ?? "chatService",
          reason: "noPendingRequest",
          requestInProgress: requestInProgress === void 0 ? "unknown" : requestInProgress ? "true" : "false",
          pendingRequests: pendingRequestsCount,
          sessionScheme: sessionResource.scheme,
          lastRequestId: lastRequest?.id,
          chatSessionId: chatSessionResourceToId(sessionResource)
        });
        this.info("cancelCurrentRequestForSession", `No pending request was found for session ${sessionResource}. requestInProgress=${requestInProgress ?? "unknown"}, pendingRequests=${pendingRequestsCount}`);
      }
      return;
    }
    const responseCompletePromise = pendingRequest.responseCompletePromise;
    pendingRequest.cancel();
    this._pendingRequests.deleteAndDispose(sessionResource);
    this.telemetryService.publicLog2(ChatPendingRequestChangeEventName, { action: "remove", source: source ?? "cancelRequest", requestId: pendingRequest.requestId, chatSessionId: chatSessionResourceToId(sessionResource) });
    if (responseCompletePromise) {
      await raceTimeout(responseCompletePromise, 1e3);
    }
  }
  setYieldRequested(sessionResource) {
    const pendingRequest = this._pendingRequests.get(sessionResource);
    if (pendingRequest) {
      pendingRequest.setYieldRequested();
    }
  }
  migrateRequests(originalResource, targetResource) {
    const model = this._sessionModels.get(originalResource);
    if (!model) {
      return;
    }
    const pendingRequests = [...model.getPendingRequests()];
    if (pendingRequests.length === 0) {
      return;
    }
    for (const pending of pendingRequests) {
      this.removePendingRequest(originalResource, pending.request.id);
    }
    for (const pending of pendingRequests) {
      void this.sendRequest(targetResource, pending.request.message.text, {
        ...pending.sendOptions,
        queue: pending.kind
      });
    }
  }
  removePendingRequest(sessionResource, requestId) {
    const model = this._sessionModels.get(sessionResource);
    if (model) {
      model.removePendingRequest(requestId);
      const hasSteeringRequests = model.getPendingRequests().some((r) => r.kind === ChatRequestQueueKind.Steering);
      if (!hasSteeringRequests) {
        const pendingRequest = this._pendingRequests.get(sessionResource);
        pendingRequest?.resetYieldRequested();
      }
    }
    const deferred = this._queuedRequestDeferreds.get(requestId);
    if (deferred) {
      deferred.complete({ kind: "rejected", reason: "Request was removed from queue", reasonCode: "cancelled" });
      this._queuedRequestDeferreds.delete(requestId);
    }
  }
  setPendingRequests(sessionResource, requests) {
    const model = this._sessionModels.get(sessionResource);
    if (model) {
      model.setPendingRequests(requests);
    }
  }
  syncPendingRequestsFromRemote(sessionResource, requests) {
    const model = this._sessionModels.get(sessionResource);
    if (!model) {
      return;
    }
    const existing = model.getPendingRequests();
    const existingById = new Map(existing.map((request) => [request.request.id, request]));
    const reconciled = requests.map((remote) => {
      const variableData = remote.variableData ?? { variables: [] };
      const local = existingById.get(remote.id);
      if (local && local.request.message.text === remote.message && equals(local.request.variableData, variableData)) {
        return local.kind === remote.kind ? local : { ...local, kind: remote.kind };
      }
      const parsedRequest = this.parseChatRequest(sessionResource, remote.message, model.initialLocation, void 0);
      const requestModel = new ChatRequestModel({
        session: model,
        message: parsedRequest,
        variableData,
        timestamp: remote.timestamp,
        attachedContext: variableData.variables.slice(),
        restoredId: remote.id
      });
      return { request: requestModel, kind: remote.kind, sendOptions: local?.sendOptions ?? {} };
    });
    if (existing.length === reconciled.length && reconciled.every((request, index) => existing[index] === request)) {
      return;
    }
    const reconciledIds = new Set(reconciled.map((request) => request.request.id));
    model.replacePendingRequests(reconciled);
    for (const local of existing) {
      if (reconciledIds.has(local.request.id)) {
        continue;
      }
      const deferred = this._queuedRequestDeferreds.get(local.request.id);
      if (deferred) {
        deferred.complete({ kind: "rejected", reason: "Request is no longer in the provider queue", reasonCode: "providerRemoved" });
        this._queuedRequestDeferreds.delete(local.request.id);
      }
    }
    if (!reconciled.some((request) => request.kind === ChatRequestQueueKind.Steering)) {
      this._pendingRequests.get(sessionResource)?.resetYieldRequested();
    }
  }
  async sendPendingRequestImmediately(sessionResource, requestId) {
    const model = this._sessionModels.get(sessionResource);
    if (!model) {
      return;
    }
    const pendingRequests = model.getPendingRequests();
    const target = pendingRequests.find((r) => r.request.id === requestId);
    if (!target) {
      return;
    }
    if (this._isServerManagedQueue(sessionResource)) {
      const message = target.request.message.text;
      const attachedContext = target.request.variableData.variables.slice();
      const sendOptions = {
        ...target.sendOptions,
        queue: void 0,
        attachedContext
      };
      this.removePendingRequest(sessionResource, requestId);
      await this.cancelCurrentRequestForSession(sessionResource, "queueRunNext");
      let result;
      try {
        result = await this.sendRequest(sessionResource, message, sendOptions);
      } catch (err) {
        this.logService.error("sendPendingRequestImmediately: re-send failed", err);
      }
      if (!result || result.kind === "rejected") {
        this.info("sendPendingRequestImmediately", `Re-send was not accepted (${result?.kind ?? "error"}); restoring pending message to the queue`);
        await this.sendRequest(sessionResource, message, { ...sendOptions, attachedContext, queue: target.kind });
      }
      return;
    }
    const reordered = [
      { requestId: target.request.id, kind: target.kind },
      ...pendingRequests.filter((r) => r.request.id !== requestId).map((r) => ({ requestId: r.request.id, kind: r.kind }))
    ];
    this.setPendingRequests(sessionResource, reordered);
    await this.cancelCurrentRequestForSession(sessionResource, "queueRunNext");
    this.processPendingRequests(sessionResource);
  }
  hasSessions() {
    return this._chatSessionStore.hasSessions();
  }
  async transferChatSession(transferredSessionResource, toWorkspace) {
    if (!LocalChatSessionUri.isLocalSession(transferredSessionResource)) {
      throw new Error(`Can only transfer local chat sessions. Invalid session: ${transferredSessionResource}`);
    }
    const model = this._sessionModels.get(transferredSessionResource);
    if (!model) {
      throw new Error(`Failed to transfer session. Unknown session: ${transferredSessionResource}`);
    }
    if (model.initialLocation !== ChatAgentLocation.Chat) {
      throw new Error(`Can only transfer chat sessions located in the Chat view. Session ${transferredSessionResource} has location=${model.initialLocation}`);
    }
    await this._chatSessionStore.storeTransferSession({
      sessionResource: model.sessionResource,
      timestampInMilliseconds: Date.now(),
      toWorkspace
    }, model);
    this.chatTransferService.addWorkspaceToTransferred(toWorkspace);
    this.trace("transferChatSession", `Transferred session ${model.sessionResource} to workspace ${toWorkspace.toString()}`);
  }
  getChatStorageFolder() {
    return this._chatSessionStore.getChatStorageFolder();
  }
  logChatIndex() {
    this._chatSessionStore.logIndex();
  }
  setSessionTitle(sessionResource, title) {
    this._sessionModels.get(sessionResource)?.setCustomTitle(title);
  }
  appendProgress(request, progress) {
    const model = this._sessionModels.get(request.session.sessionResource);
    if (!(request instanceof ChatRequestModel)) {
      throw new BugIndicatingError("Can only append progress to requests of type ChatRequestModel");
    }
    model?.acceptResponseProgress(request, progress);
  }
  toLocalSessionId(sessionResource) {
    const localSessionId = LocalChatSessionUri.parseLocalSessionId(sessionResource);
    if (!localSessionId) {
      throw new Error(`Invalid local chat session resource: ${sessionResource}`);
    }
    return localSessionId;
  }
};
ChatService = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, ILogService),
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, IExtensionService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, IChatSlashCommandService),
  __decorateParam(7, IChatAgentService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IChatTransferService),
  __decorateParam(10, IChatSessionsService),
  __decorateParam(11, IMcpService),
  __decorateParam(12, IPromptsService),
  __decorateParam(13, IChatEntitlementService),
  __decorateParam(14, ILanguageModelsService),
  __decorateParam(15, IChatDebugService)
], ChatService);
async function chatModelToChatDetail(model) {
  const title = model.title || localize("newChat", "New Chat");
  return {
    sessionResource: model.sessionResource,
    title,
    lastMessageDate: model.lastMessageDate,
    timing: model.timing,
    isActive: true,
    stats: await awaitStatsForSession(model),
    lastResponseState: model.lastRequest?.response?.state ?? ResponseModelState.Pending,
    workingDirectory: model.workingDirectory
  };
}
export {
  ChatService,
  backfillRestoredPickerState,
  backfillTransferredModel,
  chatModelToChatDetail
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGNvbW1vblxcY2hhdFNlcnZpY2VcXGNoYXRTZXJ2aWNlSW1wbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgcmFjZUNhbmNlbGxhdGlvbkVycm9yLCByYWNlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciwgRXJyb3JOb1RlbGVtZXRyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlUmVzb3VyY2VNYXAsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IHJldml2ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcnNoYWxsaW5nLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZCwgSU9ic2VydmFibGUsIElTZXR0YWJsZU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgaXNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVudGl0bGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXREZWJ1Z1NlcnZpY2UgfSBmcm9tICcuLi9jaGF0RGVidWdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNY3BTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbWNwL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBhd2FpdFN0YXRzRm9yU2Vzc2lvbiB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdFBlcmZNYXJrLCBjbGVhckNoYXRNYXJrcywgbWFya0NoYXQgfSBmcm9tICcuLi9jaGF0UGVyZi5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50QXR0YWNobWVudENhcGFiaWxpdGllcywgSUNoYXRBZ2VudENvbW1hbmQsIElDaGF0QWdlbnREYXRhLCBJQ2hhdEFnZW50SGlzdG9yeUVudHJ5LCBJQ2hhdEFnZW50UmVxdWVzdCwgSUNoYXRBZ2VudFJlc3VsdCwgSUNoYXRBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBjaGF0RWRpdGluZ1Nlc3Npb25Jc1JlYWR5IH0gZnJvbSAnLi4vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGVsLCBDaGF0UmVxdWVzdE1vZGVsLCBDaGF0UmVxdWVzdFJlbW92YWxSZWFzb24sIElDaGF0TW9kZWwsIElDaGF0UGVuZGluZ1JlcXVlc3QsIElDaGF0UmVxdWVzdE1vZGVsLCBJQ2hhdFJlcXVlc3RNb2RlSW5mbywgSUNoYXRSZXF1ZXN0VmFyaWFibGVEYXRhLCBJQ2hhdFJlc3BvbnNlTW9kZWwsIElFeHBvcnRhYmxlQ2hhdERhdGEsIElTZXJpYWxpemFibGVDaGF0RGF0YSwgSVNlcmlhbGl6YWJsZUNoYXREYXRhSW4sIElTZXJpYWxpemFibGVDaGF0c0RhdGEsIElTZXJpYWxpemVkQ2hhdERhdGFSZWZlcmVuY2UsIG5vcm1hbGl6ZVNlcmlhbGl6YWJsZUNoYXREYXRhLCB0b0NoYXRIaXN0b3J5Q29udGVudCwgdXBkYXRlUmFuZ2VzLCBJU2VyaWFsaXphYmxlQ2hhdE1vZGVsSW5wdXRTdGF0ZSwgbG9nQ2hhbmdlc1RvU3RhdGVNb2RlbCB9IGZyb20gJy4uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZWxTdG9yZSwgSVN0YXJ0U2Vzc2lvblByb3BzIH0gZnJvbSAnLi4vbW9kZWwvY2hhdE1vZGVsU3RvcmUuanMnO1xuaW1wb3J0IHsgY2hhdEFnZW50TGVhZGVyLCBDaGF0UmVxdWVzdEFnZW50UGFydCwgQ2hhdFJlcXVlc3RBZ2VudFN1YmNvbW1hbmRQYXJ0LCBDaGF0UmVxdWVzdFNsYXNoQ29tbWFuZFBhcnQsIENoYXRSZXF1ZXN0VGV4dFBhcnQsIGNoYXRTdWJjb21tYW5kTGVhZGVyLCBnZXRQcm9tcHRUZXh0LCBJUGFyc2VkQ2hhdFJlcXVlc3QgfSBmcm9tICcuLi9yZXF1ZXN0UGFyc2VyL2NoYXRQYXJzZXJUeXBlcy5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdFBhcnNlciB9IGZyb20gJy4uL3JlcXVlc3RQYXJzZXIvY2hhdFJlcXVlc3RQYXJzZXIuanMnO1xuaW1wb3J0IHsgQ2hhdE1jcFNlcnZlcnNTdGFydGluZywgQ2hhdFBlbmRpbmdSZXF1ZXN0Q2hhbmdlQ2xhc3NpZmljYXRpb24sIENoYXRQZW5kaW5nUmVxdWVzdENoYW5nZUV2ZW50LCBDaGF0UGVuZGluZ1JlcXVlc3RDaGFuZ2VFdmVudE5hbWUsIENoYXRSZXF1ZXN0UXVldWVLaW5kLCBDaGF0U2VuZFJlc3VsdCwgQ2hhdFNlbmRSZXN1bHRRdWV1ZWQsIENoYXRTZW5kUmVzdWx0U2VudCwgQ2hhdFN0b3BDYW5jZWxsYXRpb25Ob29wQ2xhc3NpZmljYXRpb24sIENoYXRTdG9wQ2FuY2VsbGF0aW9uTm9vcEV2ZW50LCBDaGF0U3RvcENhbmNlbGxhdGlvbk5vb3BFdmVudE5hbWUsIElDaGF0Q29tcGxldGVSZXNwb25zZSwgSUNoYXREZXRhaWwsIElDaGF0Rm9sbG93dXAsIElDaGF0TW9kZWxSZWZlcmVuY2UsIElDaGF0UHJvZ3Jlc3MsIElDaGF0UXVlc3Rpb25BbnN3ZXJzLCBJQ2hhdFJlcXVlc3RTdWJtaXR0ZWRFdmVudCwgSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMsIElDaGF0U2VuZFJlcXVlc3RSZXNwb25zZVN0YXRlLCBJQ2hhdFNlcnZpY2UsIElDaGF0U2Vzc2lvblN0YXJ0T3B0aW9ucywgSUNoYXRVc2VyQWN0aW9uRXZlbnQsIElSZW1vdGVQZW5kaW5nUmVxdWVzdCwgUmVzcG9uc2VNb2RlbFN0YXRlIH0gZnJvbSAnLi9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdFRlbGVtZXRyeSwgQ2hhdFNlcnZpY2VUZWxlbWV0cnkgfSBmcm9tICcuL2NoYXRTZXJ2aWNlVGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBpc0FnZW50SG9zdFRhcmdldCwgaXNUZXJtaW5hbENvbW1hbmRQcm9tcHQsIGxvY2FsQ2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvblN0b3JlLCBJQ2hhdFNlc3Npb25FbnRyeU1ldGFkYXRhIH0gZnJvbSAnLi4vbW9kZWwvY2hhdFNlc3Npb25TdG9yZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi9wYXJ0aWNpcGFudHMvY2hhdFNsYXNoQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNoYXRUcmFuc2ZlclNlcnZpY2UgfSBmcm9tICcuLi9tb2RlbC9jaGF0VHJhbnNmZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNoYXRTZXNzaW9uUmVzb3VyY2VUb0lkLCBnZXRDaGF0U2Vzc2lvblR5cGUsIGlzVW50aXRsZWRDaGF0U2Vzc2lvbiwgTG9jYWxDaGF0U2Vzc2lvblVyaSB9IGZyb20gJy4uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RWYXJpYWJsZVNldCwgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSwgaXNFeHBsaWNpdEZpbGVPckltYWdlVmFyaWFibGVFbnRyeSwgaXNQcm9tcHRUZXh0VmFyaWFibGVFbnRyeSB9IGZyb20gJy4uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgSUR5bmFtaWNWYXJpYWJsZSB9IGZyb20gJy4uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZXMuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRDb25maWd1cmF0aW9uLCBDaGF0TW9kZUtpbmQgfSBmcm9tICcuLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ2hhdE1lc3NhZ2VSb2xlLCBJQ2hhdE1lc3NhZ2UsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBNb2RlbFNlbGVjdGlvblJlYXNvbiB9IGZyb20gJy4uL21vZGVsU2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAgfSBmcm9tICcuLi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRTZXNzaW9uT3BlcmF0aW9uTG9nIH0gZnJvbSAnLi4vbW9kZWwvY2hhdFNlc3Npb25PcGVyYXRpb25Mb2cuanMnO1xuaW1wb3J0IHsgSVByb21wdHNTZXJ2aWNlIH0gZnJvbSAnLi4vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQUdFTlRfREVCVUdfTE9HX0ZJTEVfTE9HR0lOR19FTkFCTEVEX1NFVFRJTkcsIFRST1VCTEVTSE9PVF9DT01NQU5EX05BTUUsIFRST1VCTEVTSE9PVF9TS0lMTF9QQVRILCBDT1BJTE9UX1NLSUxMX1VSSV9TQ0hFTUUgfSBmcm9tICcuLi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RIb29rcywgbWVyZ2VIb29rcyB9IGZyb20gJy4uL3Byb21wdFN5bnRheC9ob29rU2NoZW1hLmpzJztcbmltcG9ydCB7IENvbXB1dGVBdXRvbWF0aWNJbnN0cnVjdGlvbnMgfSBmcm9tICcuLi9wcm9tcHRTeW50YXgvY29tcHV0ZUF1dG9tYXRpY0luc3RydWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBmaW5kTGFzdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5c0ZpbmQuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGUgfSBmcm9tICcuLi9jaGF0TW9kZXMuanMnO1xuXG5jb25zdCBzZXJpYWxpemVkQ2hhdEtleSA9ICdpbnRlcmFjdGl2ZS5zZXNzaW9ucyc7XG5cbi8qKlxuICogVHJ1ZSB3aGVuIHRoZSB1c2VyIGhhcyB0eXBlZCB0ZXh0IG9yIGF0dGFjaGVkIG5vbi10cml2aWFsIGNvbnRleHQgdG8gdGhlIGlucHV0XG4gKiBidXQgbm90IHlldCBzZW50IGl0LiBVc2VkIHRvIGRlY2lkZSB3aGV0aGVyIGFuIGV4dGVybmFsIHNlc3Npb24gbmVlZHMgbWV0YWRhdGFcbiAqIHBlcnNpc3RlZCBvbiBkaXNwb3NlIHNvIHRoZSBkcmFmdCBzdXJ2aXZlcyBzd2l0Y2hpbmcgc2Vzc2lvbnMuXG4gKi9cbmZ1bmN0aW9uIGhhc0RyYWZ0SW5wdXQobW9kZWw6IENoYXRNb2RlbCk6IGJvb2xlYW4ge1xuXHRjb25zdCBzdGF0ZSA9IG1vZGVsLmlucHV0TW9kZWwuc3RhdGUuZ2V0KCk7XG5cdGlmICghc3RhdGUpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKHN0YXRlLmlucHV0VGV4dC50cmltKCkubGVuZ3RoID4gMCkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHJldHVybiBzdGF0ZS5hdHRhY2htZW50cy5sZW5ndGggPiAwO1xufVxuXG5jbGFzcyBDYW5jZWxsYWJsZVJlcXVlc3QgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3lpZWxkUmVxdWVzdGVkOiBJU2V0dGFibGVPYnNlcnZhYmxlPGJvb2xlYW4+ID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblxuXHRnZXQgeWllbGRSZXF1ZXN0ZWQoKTogSU9ic2VydmFibGU8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLl95aWVsZFJlcXVlc3RlZDtcblx0fVxuXG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGNhbmNlbGxhdGlvblRva2VuU291cmNlOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSxcblx0XHRwdWJsaWMgcmVxdWVzdElkOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlc3BvbnNlQ29tcGxldGVQcm9taXNlOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkLFxuXHRcdHB1YmxpYyBzZW5kT3B0aW9uczogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZVxuXHQpIHsgfVxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0aWYgKHRoaXMucmVxdWVzdElkKSB7XG5cdFx0XHR0aGlzLnRvb2xzU2VydmljZS5jYW5jZWxUb29sQ2FsbHNGb3JSZXF1ZXN0KHRoaXMucmVxdWVzdElkKTtcblx0XHR9XG5cdFx0dGhpcy5jYW5jZWxsYXRpb25Ub2tlblNvdXJjZS5kaXNwb3NlKCk7XG5cdH1cblxuXHRjYW5jZWwoKSB7XG5cdFx0aWYgKHRoaXMucmVxdWVzdElkKSB7XG5cdFx0XHR0aGlzLnRvb2xzU2VydmljZS5jYW5jZWxUb29sQ2FsbHNGb3JSZXF1ZXN0KHRoaXMucmVxdWVzdElkKTtcblx0XHR9XG5cblx0XHR0aGlzLmNhbmNlbGxhdGlvblRva2VuU291cmNlLmNhbmNlbCgpO1xuXHR9XG5cblx0c2V0WWllbGRSZXF1ZXN0ZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5feWllbGRSZXF1ZXN0ZWQuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRyZXNldFlpZWxkUmVxdWVzdGVkKCk6IHZvaWQge1xuXHRcdHRoaXMuX3lpZWxkUmVxdWVzdGVkLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0fVxufVxuXG5jb25zdCBFTVBUWV9SRUZFUkVOQ0VTOiBSZWFkb25seUFycmF5PElEeW5hbWljVmFyaWFibGU+ID0gT2JqZWN0LmZyZWV6ZShbXSk7XG5jb25zdCBFTVBUWV9UT09MX0VOQUJMRU1FTlRfTUFQOiBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAgPSBUb29sQW5kVG9vbFNldEVuYWJsZW1lbnRNYXAuZnJvbUVudHJpZXMoW10pO1xuXG4vKipcbiAqIFByZXNlcnZlIHRoZSBwaWNrZXIgc3RhdGUgZnJvbSBgc3RhdGVUb0FwcGx5YCwgb25seSByZWNvdmVyaW5nIGEgY3VzdG9tIGFnZW50IG1vZGUgZnJvbVxuICogYHNhdmVkU3RhdGVgIHdoZW4gdGhlIGFwcGxpZWQgc3RhdGUgZmVsbCBiYWNrIHRvIHRoZSBkZWZhdWx0IEFnZW50LlxuICpcbiAqIGBzdGF0ZVRvQXBwbHlgIGlzIHRoZSBpbnB1dCBzdGF0ZSBhYm91dCB0byBiZSBhcHBsaWVkIHRvIHRoZSBzZXNzaW9uIGJlaW5nIHJlc3RvcmVkIChhblxuICogYWdlbnQtaG9zdCB0cmFuc2ZlcnJlZCBkcmFmdCwgb3IgdGhlIHNhdmVkIGRyYWZ0IGFzIGEgZmFsbGJhY2spLiBJdHMgYHNlbGVjdGVkTW9kZWxgIGlzIHRoZVxuICogYXV0aG9yaXRhdGl2ZSBtb2RlbCBzZWxlY3Rpb24uXG4gKiBgc2F2ZWRTdGF0ZWAgaXMgb25seSB1c2VkIGZvciBgbW9kZWA6IHByZWZlciBpdHMgY3VzdG9tIGFnZW50IG92ZXIgdGhlIHBsYWluIGRlZmF1bHQgQWdlbnQsIGJ1dFxuICogbmV2ZXIgb3ZlcnJpZGUgYSBkaWZmZXJlbnQgZXhwbGljaXQgbW9kZSBhbHJlYWR5IHByZXNlbnQgaW4gYHN0YXRlVG9BcHBseWAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBiYWNrZmlsbFJlc3RvcmVkUGlja2VyU3RhdGUoXG5cdHN0YXRlVG9BcHBseTogSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGUgfCB1bmRlZmluZWQsXG5cdHNhdmVkU3RhdGU6IElTZXJpYWxpemFibGVDaGF0TW9kZWxJbnB1dFN0YXRlIHwgdW5kZWZpbmVkLFxuXHRkZWZhdWx0QWdlbnRNb2RlSWQ6IHN0cmluZyxcbik6IElTZXJpYWxpemFibGVDaGF0TW9kZWxJbnB1dFN0YXRlIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFzdGF0ZVRvQXBwbHkgfHwgIXNhdmVkU3RhdGUpIHtcblx0XHRyZXR1cm4gc3RhdGVUb0FwcGx5O1xuXHR9XG5cdGNvbnN0IG1vZGUgPSAoc3RhdGVUb0FwcGx5Lm1vZGUuaWQgPT09IGRlZmF1bHRBZ2VudE1vZGVJZCAmJiBzYXZlZFN0YXRlLm1vZGUuaWQgIT09IGRlZmF1bHRBZ2VudE1vZGVJZClcblx0XHQ/IHNhdmVkU3RhdGUubW9kZVxuXHRcdDogc3RhdGVUb0FwcGx5Lm1vZGU7XG5cdGlmIChtb2RlID09PSBzdGF0ZVRvQXBwbHkubW9kZSkge1xuXHRcdHJldHVybiBzdGF0ZVRvQXBwbHk7XG5cdH1cblx0cmV0dXJuIHsgLi4uc3RhdGVUb0FwcGx5LCBtb2RlIH07XG59XG5cbi8qKlxuICogUmVjb3ZlciB0aGUgc2VsZWN0ZWQgbW9kZWwgb24gYSB0cmFuc2ZlcnJlZCBpbnB1dCBzdGF0ZSB3aGVuIGl0IHdhcyBkcm9wcGVkIGR1cmluZyBhIGNvbGRcbiAqIGhhbmRvZmYuXG4gKlxuICogQXQgY29sZCByZXN0b3JlIGFuIGFnZW50LWhvc3QgdHJhbnNmZXJyZWQgZHJhZnQgY2FuIGFycml2ZSB3aXRob3V0IGl0cyBgc2VsZWN0ZWRNb2RlbGAgKHRoZSBsaXZlXG4gKiBtb2RlbCBsaXN0IGlzIG5vdCBsb2FkZWQgeWV0LCBzbyB0aGUgbW9kZWwgcmVzb2x2ZWQgdG8gYHVuZGVmaW5lZGApLiBGYWxsIGJhY2sgdG8gdGhlIG1vZGVsXG4gKiBkZXJpdmVkIGZyb20gdGhlIHNlc3Npb24ncyByZXF1ZXN0IGhpc3Rvcnkgc28gdGhlIHBpY2tlciByZXN0b3JlcyB0aGUgbGFzdC11c2VkIG1vZGVsIGluc3RlYWQgb2ZcbiAqIEF1dG8uIFRoZSBoaXN0b3J5LWRlcml2ZWQgbW9kZWwgY2FycmllcyBmdWxsIG1ldGFkYXRhIChpbmNsdWRpbmcgYHRhcmdldENoYXRTZXNzaW9uVHlwZWApLCBzbyB0aGVcbiAqIGlucHV0IHBhcnQgY2FuIHdhaXQgZm9yIHRoZSBtb2RlbCBwb29sIGFuZCBhcHBseSBpdCBvbmNlIGl0IGxvYWRzLiBBbiBleHBsaWNpdCBtb2RlbCBhbHJlYWR5XG4gKiBwcmVzZW50IG9uIGB0cmFuc2ZlcnJlZFN0YXRlYCBpcyBuZXZlciBvdmVycmlkZGVuLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYmFja2ZpbGxUcmFuc2ZlcnJlZE1vZGVsKFxuXHR0cmFuc2ZlcnJlZFN0YXRlOiBJU2VyaWFsaXphYmxlQ2hhdE1vZGVsSW5wdXRTdGF0ZSB8IHVuZGVmaW5lZCxcblx0aGlzdG9yeU1vZGVsOiBJU2VyaWFsaXphYmxlQ2hhdE1vZGVsSW5wdXRTdGF0ZVsnc2VsZWN0ZWRNb2RlbCddLFxuKTogSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGUgfCB1bmRlZmluZWQge1xuXHRpZiAoIXRyYW5zZmVycmVkU3RhdGUgfHwgdHJhbnNmZXJyZWRTdGF0ZS5zZWxlY3RlZE1vZGVsIHx8ICFoaXN0b3J5TW9kZWwpIHtcblx0XHRyZXR1cm4gdHJhbnNmZXJyZWRTdGF0ZTtcblx0fVxuXHRyZXR1cm4geyAuLi50cmFuc2ZlcnJlZFN0YXRlLCBzZWxlY3RlZE1vZGVsOiBoaXN0b3J5TW9kZWwgfTtcbn1cblxuZXhwb3J0IGNsYXNzIENoYXRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0U2VydmljZSB7XG5cdGRlY2xhcmUgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25Nb2RlbHM6IENoYXRNb2RlbFN0b3JlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nUmVxdWVzdHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVJlc291cmNlTWFwPENhbmNlbGxhYmxlUmVxdWVzdD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3F1ZXVlZFJlcXVlc3REZWZlcnJlZHMgPSBuZXcgTWFwPHN0cmluZywgRGVmZXJyZWRQcm9taXNlPENoYXRTZW5kUmVzdWx0Pj4oKTtcblx0LyoqIFBlbmRpbmcgcmVxdWVzdHMgdGhhdCBhcmUgc3ludGhldGljIHN0cmVhbWVkLXR1cm4gdHJhY2tlcnMgKG5vdCByZWFsIGluLWZsaWdodCByZXF1ZXN0cykuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N5bnRoZXRpY1BlbmRpbmdSZXF1ZXN0cyA9IG5ldyBXZWFrU2V0PENhbmNlbGxhYmxlUmVxdWVzdD4oKTtcblxuXHQvKipcblx0ICogSW4tZmxpZ2h0IHVudGl0bGVkXHUyMTkycmVhbCBtYXRlcmlhbGl6YXRpb25zLCBrZXllZCBieSB0aGUgb3JpZ2luYWwgdW50aXRsZWRcblx0ICogY2hhdCBzZXNzaW9uIHJlc291cmNlLiBBIGZpcnN0IHNlbmQgdG8gYW4gdW50aXRsZWQgY29udHJpYnV0ZWQgc2Vzc2lvblxuXHQgKiBzdG9yZXMgdGhlIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byB0aGUgbmV3bHkgbWludGVkIHJlYWwgcmVzb3VyY2UgKG9yXG5cdCAqIGB1bmRlZmluZWRgIG9uIGZhaWx1cmUpLiBBIGNvbmN1cnJlbnQgc2Vjb25kIHNlbmQgZm9yIHRoZSBzYW1lIHVudGl0bGVkXG5cdCAqIHJlc291cmNlIGF3YWl0cyB0aGlzIGluc3RlYWQgb2YgbWF0ZXJpYWxpemluZyBhIHNlY29uZCByZWFsIHNlc3Npb24uXG5cdCAqXG5cdCAqIFRoZSBjb21taXR0ZWQgKHNldHRsZWQpIHVudGl0bGVkXHUyMTkycmVhbCBtYXBwaW5nIGlzIG93bmVkIGJ5XG5cdCAqIHtAbGluayBJQ2hhdFNlc3Npb25zU2VydmljZX0gKHB1Ymxpc2hlZCB2aWEgYHNldE1hdGVyaWFsaXplZFNlc3Npb25SZXNvdXJjZWBcblx0ICogYW5kIHJlYWQgdmlhIGBnZXRNYXRlcmlhbGl6ZWRTZXNzaW9uUmVzb3VyY2VgKTsgdGhpcyBtYXAgb25seSB0cmFja3MgdGhlXG5cdCAqIHRyYW5zaWVudCBpbi1mbGlnaHQgc2VyaWFsaXphdGlvbi5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luRmxpZ2h0VW50aXRsZWRNYXRlcmlhbGl6YXRpb25zID0gbmV3IFJlc291cmNlTWFwPFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPj4oKTtcblx0cHJpdmF0ZSBfc2F2ZU1vZGVsc0VuYWJsZWQgPSB0cnVlO1xuXG5cdHByaXZhdGUgX3RyYW5zZmVycmVkU2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBnZXQgdHJhbnNmZXJyZWRTZXNzaW9uUmVzb3VyY2UoKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fdHJhbnNmZXJyZWRTZXNzaW9uUmVzb3VyY2U7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFN1Ym1pdFJlcXVlc3QgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ2hhdFJlcXVlc3RTdWJtaXR0ZWRFdmVudD4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZFN1Ym1pdFJlcXVlc3QgPSB0aGlzLl9vbkRpZFN1Ym1pdFJlcXVlc3QuZXZlbnQ7XG5cblx0cHVibGljIGdldCBvbkRpZENyZWF0ZU1vZGVsKCkgeyByZXR1cm4gdGhpcy5fc2Vzc2lvbk1vZGVscy5vbkRpZENyZWF0ZU1vZGVsOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRQZXJmb3JtVXNlckFjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElDaGF0VXNlckFjdGlvbkV2ZW50PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkUGVyZm9ybVVzZXJBY3Rpb246IEV2ZW50PElDaGF0VXNlckFjdGlvbkV2ZW50PiA9IHRoaXMuX29uRGlkUGVyZm9ybVVzZXJBY3Rpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZWNlaXZlUXVlc3Rpb25DYXJvdXNlbEFuc3dlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcmVxdWVzdElkOiBzdHJpbmc7IHJlc29sdmVJZDogc3RyaW5nOyBhbnN3ZXJzOiBJQ2hhdFF1ZXN0aW9uQW5zd2VycyB8IHVuZGVmaW5lZCB9PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkUmVjZWl2ZVF1ZXN0aW9uQ2Fyb3VzZWxBbnN3ZXIgPSB0aGlzLl9vbkRpZFJlY2VpdmVRdWVzdGlvbkNhcm91c2VsQW5zd2VyLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGlzcG9zZVNlc3Npb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZXM6IFVSSVtdOyByZWFzb246ICdjbGVhcmVkJyB9PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkRGlzcG9zZVNlc3Npb24gPSB0aGlzLl9vbkRpZERpc3Bvc2VTZXNzaW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25Gb2xsb3d1cENhbmNlbFRva2VucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlUmVzb3VyY2VNYXA8Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2U+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGF0U2VydmljZVRlbGVtZXRyeTogQ2hhdFNlcnZpY2VUZWxlbWV0cnk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYXRTZXNzaW9uU3RvcmU6IENoYXRTZXNzaW9uU3RvcmU7XG5cblx0cmVhZG9ubHkgcmVxdWVzdEluUHJvZ3Jlc3NPYnM6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXG5cdHJlYWRvbmx5IGNoYXRNb2RlbHM6IElPYnNlcnZhYmxlPEl0ZXJhYmxlPElDaGF0TW9kZWw+PjtcblxuXHQvKipcblx0ICogRm9yIHRlc3QgdXNlIG9ubHlcblx0ICovXG5cdHNldFNhdmVNb2RlbHNFbmFibGVkKGVuYWJsZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9zYXZlTW9kZWxzRW5hYmxlZCA9IGVuYWJsZWQ7XG5cdH1cblxuXHQvKipcblx0ICogRm9yIHRlc3QgdXNlIG9ubHlcblx0ICovXG5cdHdhaXRGb3JNb2RlbERpc3Bvc2FscygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbk1vZGVscy53YWl0Rm9yTW9kZWxEaXNwb3NhbHMoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGlzRW1wdHlXaW5kb3coKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRyZXR1cm4gIXdvcmtzcGFjZS5jb25maWd1cmF0aW9uICYmIHdvcmtzcGFjZS5mb2xkZXJzLmxlbmd0aCA9PT0gMDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2xhc2hDb21tYW5kU2VydmljZTogSUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ2hhdEFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ2hhdFRyYW5zZmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRUcmFuc2ZlclNlcnZpY2U6IElDaGF0VHJhbnNmZXJTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXNzaW9uU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElNY3BTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWNwU2VydmljZTogSU1jcFNlcnZpY2UsXG5cdFx0QElQcm9tcHRzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb21wdHNTZXJ2aWNlOiBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0QElDaGF0RGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdERlYnVnU2VydmljZTogSUNoYXREZWJ1Z1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9zZXNzaW9uTW9kZWxzID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1vZGVsU3RvcmUsIHtcblx0XHRcdGNyZWF0ZU1vZGVsOiAocHJvcHM6IElTdGFydFNlc3Npb25Qcm9wcykgPT4gdGhpcy5fc3RhcnRTZXNzaW9uKHByb3BzKSxcblx0XHRcdHdpbGxEaXNwb3NlTW9kZWw6IGFzeW5jIChtb2RlbDogQ2hhdE1vZGVsKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGxvY2FsU2Vzc2lvbklkID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5wYXJzZUxvY2FsU2Vzc2lvbklkKG1vZGVsLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdGlmIChsb2NhbFNlc3Npb25JZCAmJiB0aGlzLnNob3VsZFN0b3JlU2Vzc2lvbihtb2RlbCkpIHtcblx0XHRcdFx0XHQvLyBBbHdheXMgcHJlc2VydmUgc2Vzc2lvbnMgdGhhdCBoYXZlIGN1c3RvbSB0aXRsZXMsIGV2ZW4gaWYgZW1wdHlcblx0XHRcdFx0XHRpZiAobW9kZWwuZ2V0UmVxdWVzdHMoKS5sZW5ndGggPT09IDAgJiYgIW1vZGVsLmN1c3RvbVRpdGxlKSB7XG5cdFx0XHRcdFx0XHRsb2dDaGFuZ2VzVG9TdGF0ZU1vZGVsKG1vZGVsLmlucHV0TW9kZWwsIGBkaXNwb3Npbmcgc2Vzc2lvbiAke21vZGVsLnNlc3Npb25SZXNvdXJjZX0gKCR7bG9jYWxTZXNzaW9uSWR9KSB3aXRob3V0IHRpdGxlLCBkZWxldGluZyBmcm9tIHN0b3JhZ2VgLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2NoYXRTZXNzaW9uU3RvcmUuZGVsZXRlU2Vzc2lvbihsb2NhbFNlc3Npb25JZCk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh0aGlzLl9zYXZlTW9kZWxzRW5hYmxlZCkge1xuXHRcdFx0XHRcdFx0bG9nQ2hhbmdlc1RvU3RhdGVNb2RlbChtb2RlbC5pbnB1dE1vZGVsLCBgZGlzcG9zaW5nIHNlc3Npb24gJHttb2RlbC5zZXNzaW9uUmVzb3VyY2V9ICgke2xvY2FsU2Vzc2lvbklkfSkgd2l0aCB0aXRsZSwgc3RvcmluZyB0byBzdG9yYWdlYCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRoaXMubG9nU2VydmljZSk7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9jaGF0U2Vzc2lvblN0b3JlLnN0b3JlU2Vzc2lvbnMoW21vZGVsXSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKCFsb2NhbFNlc3Npb25JZCAmJiAobW9kZWwuZ2V0UmVxdWVzdHMoKS5sZW5ndGggPiAwIHx8IGhhc0RyYWZ0SW5wdXQobW9kZWwpKSkge1xuXHRcdFx0XHRcdGxvZ0NoYW5nZXNUb1N0YXRlTW9kZWwobW9kZWwuaW5wdXRNb2RlbCwgYGRpc3Bvc2luZyBleHRlcm5hbCBzZXNzaW9uICR7bW9kZWwuc2Vzc2lvblJlc291cmNlfSB3aXRoIHJlcXVlc3RzIG9yIGRyYWZ0IGlucHV0LCBzdG9yaW5nIG1ldGFkYXRhIHRvIHN0b3JhZ2VgLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGhpcy5sb2dTZXJ2aWNlKTtcblx0XHRcdFx0XHQvLyBFeHRlcm5hbCBzZXNzaW9uczogcGVyc2lzdCBtZXRhZGF0YSB3aGVuIHRoZXJlIGFyZSByZXF1ZXN0cywgT1Igd2hlbiB0aGVcblx0XHRcdFx0XHQvLyB1c2VyIGhhcyB0eXBlZC9hdHRhY2hlZCB1bnNlbnQgaW5wdXQgd2UgbmVlZCB0byByZXN0b3JlIG9uIG5leHQgb3Blbi5cblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9jaGF0U2Vzc2lvblN0b3JlLnN0b3JlU2Vzc2lvbnNNZXRhZGF0YU9ubHkoW21vZGVsXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc2Vzc2lvbk1vZGVscy5vbkRpZERpc3Bvc2VNb2RlbChtb2RlbCA9PiB7XG5cdFx0XHRjbGVhckNoYXRNYXJrcyhtb2RlbC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0dGhpcy5jaGF0RGVidWdTZXJ2aWNlLmVuZFNlc3Npb24obW9kZWwuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdHRoaXMuX3Nlc3Npb25Gb2xsb3d1cENhbmNlbFRva2Vucy5nZXQobW9kZWwuc2Vzc2lvblJlc291cmNlKT8uY2FuY2VsKCk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uRm9sbG93dXBDYW5jZWxUb2tlbnMuZGVsZXRlQW5kRGlzcG9zZShtb2RlbC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0Ly8gRHJvcCB0aGUgZm9yd2FyZCB1bnRpdGxlZFx1MjE5MnJlYWwgbWFwcGluZyBmb3IgdGhpcyBzZXNzaW9uIHNvIGl0IHN0b3BzXG5cdFx0XHQvLyByZS10YXJnZXRpbmcgbGF0ZSBzZW5kcy4gVGhlIGludmVyc2UgYWxpYXMgaXMgaW50ZW50aW9uYWxseSByZXRhaW5lZC5cblx0XHRcdHRoaXMuY2hhdFNlc3Npb25TZXJ2aWNlLmNsZWFyTWF0ZXJpYWxpemVkU2Vzc2lvblJlc291cmNlKG1vZGVsLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHR0aGlzLl9vbkRpZERpc3Bvc2VTZXNzaW9uLmZpcmUoeyBzZXNzaW9uUmVzb3VyY2VzOiBbbW9kZWwuc2Vzc2lvblJlc291cmNlXSwgcmVhc29uOiAnY2xlYXJlZCcgfSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fY2hhdFNlcnZpY2VUZWxlbWV0cnkgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRTZXJ2aWNlVGVsZW1ldHJ5KTtcblx0XHR0aGlzLl9jaGF0U2Vzc2lvblN0b3JlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0U2Vzc2lvblN0b3JlKSk7XG5cdFx0dGhpcy5fY2hhdFNlc3Npb25TdG9yZS5taWdyYXRlRGF0YUlmTmVlZGVkKCgpID0+IHRoaXMubWlncmF0ZURhdGEoKSk7XG5cblx0XHRjb25zdCB0cmFuc2ZlcnJlZERhdGEgPSB0aGlzLl9jaGF0U2Vzc2lvblN0b3JlLmdldFRyYW5zZmVycmVkU2Vzc2lvbkRhdGEoKTtcblx0XHRpZiAodHJhbnNmZXJyZWREYXRhKSB7XG5cdFx0XHR0aGlzLnRyYWNlKCdjb25zdHJ1Y3RvcicsIGBUcmFuc2ZlcnJlZCBzZXNzaW9uICR7dHJhbnNmZXJyZWREYXRhfWApO1xuXHRcdFx0dGhpcy5fdHJhbnNmZXJyZWRTZXNzaW9uUmVzb3VyY2UgPSB0cmFuc2ZlcnJlZERhdGE7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoc3RvcmFnZVNlcnZpY2Uub25XaWxsU2F2ZVN0YXRlKCgpID0+IHRoaXMuc2F2ZVN0YXRlKCkpKTtcblxuXHRcdHRoaXMuY2hhdE1vZGVscyA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IFsuLi50aGlzLl9zZXNzaW9uTW9kZWxzLm9ic2VydmFibGUucmVhZChyZWFkZXIpLnZhbHVlcygpXSk7XG5cblx0XHR0aGlzLnJlcXVlc3RJblByb2dyZXNzT2JzID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gdGhpcy5fc2Vzc2lvbk1vZGVscy5vYnNlcnZhYmxlLnJlYWQocmVhZGVyKS52YWx1ZXMoKTtcblx0XHRcdHJldHVybiBJdGVyYWJsZS5zb21lKG1vZGVscywgbW9kZWwgPT4gbW9kZWwucmVxdWVzdEluUHJvZ3Jlc3MucmVhZChyZWFkZXIpKTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgZWRpdGluZ1Nlc3Npb25zKCkge1xuXHRcdHJldHVybiBbLi4udGhpcy5fc2Vzc2lvbk1vZGVscy52YWx1ZXMoKV0ubWFwKHYgPT4gdi5lZGl0aW5nU2Vzc2lvbikuZmlsdGVyKGlzRGVmaW5lZCk7XG5cdH1cblxuXHRpc0VuYWJsZWQobG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXRDb250cmlidXRlZERlZmF1bHRBZ2VudChsb2NhdGlvbikgIT09IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgbWlncmF0ZURhdGEoKTogSVNlcmlhbGl6YWJsZUNoYXRzRGF0YSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbkRhdGEgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChzZXJpYWxpemVkQ2hhdEtleSwgdGhpcy5pc0VtcHR5V2luZG93ID8gU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OIDogU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgJycpO1xuXHRcdGlmIChzZXNzaW9uRGF0YSkge1xuXHRcdFx0Y29uc3QgcGVyc2lzdGVkU2Vzc2lvbnMgPSB0aGlzLmRlc2VyaWFsaXplQ2hhdHMoc2Vzc2lvbkRhdGEpO1xuXHRcdFx0Y29uc3QgY291bnRzRm9yTG9nID0gT2JqZWN0LmtleXMocGVyc2lzdGVkU2Vzc2lvbnMpLmxlbmd0aDtcblx0XHRcdGlmIChjb3VudHNGb3JMb2cgPiAwKSB7XG5cdFx0XHRcdHRoaXMuaW5mbygnbWlncmF0ZURhdGEnLCBgUmVzdG9yZWQgJHtjb3VudHNGb3JMb2d9IHBlcnNpc3RlZCBzZXNzaW9uc2ApO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcGVyc2lzdGVkU2Vzc2lvbnM7XG5cdFx0fVxuXG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cHJpdmF0ZSBzYXZlU3RhdGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9zYXZlTW9kZWxzRW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpdmVMb2NhbENoYXRzID0gQXJyYXkuZnJvbSh0aGlzLl9zZXNzaW9uTW9kZWxzLnZhbHVlcygpKVxuXHRcdFx0LmZpbHRlcihzZXNzaW9uID0+IHRoaXMuc2hvdWxkU3RvcmVTZXNzaW9uKHNlc3Npb24pKTtcblxuXHRcdGNvbnN0IGxpdmVOb25Mb2NhbENoYXRzID0gQXJyYXkuZnJvbSh0aGlzLl9zZXNzaW9uTW9kZWxzLnZhbHVlcygpKVxuXHRcdFx0LmZpbHRlcihzZXNzaW9uID0+ICFMb2NhbENoYXRTZXNzaW9uVXJpLnBhcnNlTG9jYWxTZXNzaW9uSWQoc2Vzc2lvbi5zZXNzaW9uUmVzb3VyY2UpKTtcblxuXHRcdC8vIFN5bmNocm9ub3VzbHkgdXBkYXRlIHRoZSBpbmRleCBmb3IgYWxsIGxpdmUgc2Vzc2lvbnMgYW5kIGZsdXNoIGl0IHRvXG5cdFx0Ly8gc3RvcmFnZS4gVGhpcyBpcyBjcml0aWNhbCBiZWNhdXNlIGBvbldpbGxTYXZlU3RhdGVgIGlzIHN5bmNocm9ub3VzIFx1MjAxNFxuXHRcdC8vIGFmdGVyIHRoaXMgaGFuZGxlciByZXR1cm5zIHRoZSBzdG9yYWdlIHNlcnZpY2UgZmx1c2hlcyBpdHMgZGF0YWJhc2VzLlxuXHRcdC8vIFRoZSBhc3luYyBmaWxlLXdyaXRlIHdvcmsga2lja2VkIG9mZiBiZWxvdyBtYXkgY29tcGxldGUgYWZ0ZXIgdGhlXG5cdFx0Ly8gZmx1c2gsIGJ1dCB0aGUgaW5kZXggbXVzdCBiZSB1cC10by1kYXRlIGJlZm9yZSB0aGUgZmx1c2ggaGFwcGVucyBzb1xuXHRcdC8vIHRoYXQgc2Vzc2lvbnMgYXJlIGRpc2NvdmVyYWJsZSBhZnRlciBhIHJlbG9hZC5cblx0XHR0aGlzLl9jaGF0U2Vzc2lvblN0b3JlLnVwZGF0ZUFuZEZsdXNoSW5kZXhTeW5jKGxpdmVMb2NhbENoYXRzLCBsaXZlTm9uTG9jYWxDaGF0cyk7XG5cblx0XHQvLyBLaWNrIG9mZiBhc3luYyBmaWxlIHdyaXRlcyBmb3Igc2Vzc2lvbiBkYXRhLlxuXHRcdHRoaXMuX2NoYXRTZXNzaW9uU3RvcmUuc3RvcmVTZXNzaW9ucyhsaXZlTG9jYWxDaGF0cyk7XG5cdFx0dGhpcy5fY2hhdFNlc3Npb25TdG9yZS5zdG9yZVNlc3Npb25zTWV0YWRhdGFPbmx5KGxpdmVOb25Mb2NhbENoYXRzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBPbmx5IHBlcnNpc3QgbG9jYWwgc2Vzc2lvbnMgZnJvbSBjaGF0IHRoYXQgYXJlIG5vdCBpbXBvcnRlZC5cblx0ICovXG5cdHByaXZhdGUgc2hvdWxkU3RvcmVTZXNzaW9uKHNlc3Npb246IENoYXRNb2RlbCk6IGJvb2xlYW4ge1xuXHRcdGlmIChzZXNzaW9uLmlzRGVsZXRlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIUxvY2FsQ2hhdFNlc3Npb25VcmkucGFyc2VMb2NhbFNlc3Npb25JZChzZXNzaW9uLnNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHNlc3Npb24uaW5pdGlhbExvY2F0aW9uID09PSBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0ICYmICFzZXNzaW9uLmlzSW1wb3J0ZWQ7XG5cdH1cblxuXHRub3RpZnlVc2VyQWN0aW9uKGFjdGlvbjogSUNoYXRVc2VyQWN0aW9uRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9jaGF0U2VydmljZVRlbGVtZXRyeS5ub3RpZnlVc2VyQWN0aW9uKGFjdGlvbik7XG5cdFx0dGhpcy5fb25EaWRQZXJmb3JtVXNlckFjdGlvbi5maXJlKGFjdGlvbik7XG5cdFx0aWYgKGFjdGlvbi5hY3Rpb24ua2luZCA9PT0gJ2NoYXRFZGl0aW5nU2Vzc2lvbkFjdGlvbicpIHtcblx0XHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fc2Vzc2lvbk1vZGVscy5nZXQoYWN0aW9uLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAobW9kZWwpIHtcblx0XHRcdFx0bW9kZWwubm90aWZ5RWRpdGluZ0FjdGlvbihhY3Rpb24uYWN0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRub3RpZnlRdWVzdGlvbkNhcm91c2VsQW5zd2VyKHJlcXVlc3RJZDogc3RyaW5nLCByZXNvbHZlSWQ6IHN0cmluZywgYW5zd2VyczogSUNoYXRRdWVzdGlvbkFuc3dlcnMgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZFJlY2VpdmVRdWVzdGlvbkNhcm91c2VsQW5zd2VyLmZpcmUoeyByZXF1ZXN0SWQsIHJlc29sdmVJZCwgYW5zd2VycyB9KTtcblx0fVxuXG5cdGFzeW5jIHNldENoYXRTZXNzaW9uVGl0bGUoc2Vzc2lvblJlc291cmNlOiBVUkksIHRpdGxlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX3Nlc3Npb25Nb2RlbHMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRtb2RlbC5zZXRDdXN0b21UaXRsZSh0aXRsZSk7XG5cdFx0fVxuXG5cdFx0Ly8gVXBkYXRlIHRoZSB0aXRsZSBpbiB0aGUgZmlsZSBzdG9yYWdlXG5cdFx0Y29uc3QgbG9jYWxTZXNzaW9uSWQgPSBMb2NhbENoYXRTZXNzaW9uVXJpLnBhcnNlTG9jYWxTZXNzaW9uSWQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAobG9jYWxTZXNzaW9uSWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX2NoYXRTZXNzaW9uU3RvcmUuc2V0U2Vzc2lvblRpdGxlKGxvY2FsU2Vzc2lvbklkLCB0aXRsZSk7XG5cdFx0XHQvLyBUcmlnZ2VyIGltbWVkaWF0ZSBzYXZlIHRvIGVuc3VyZSBjb25zaXN0ZW5jeVxuXHRcdFx0dGhpcy5zYXZlU3RhdGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHRyYWNlKG1ldGhvZDogc3RyaW5nLCBtZXNzYWdlPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKG1lc3NhZ2UpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgQ2hhdFNlcnZpY2UjJHttZXRob2R9OiAke21lc3NhZ2V9YCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgQ2hhdFNlcnZpY2UjJHttZXRob2R9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBpbmZvKG1ldGhvZDogc3RyaW5nLCBtZXNzYWdlPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKG1lc3NhZ2UpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBDaGF0U2VydmljZSMke21ldGhvZH06ICR7bWVzc2FnZX1gKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYENoYXRTZXJ2aWNlIyR7bWV0aG9kfWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZXJyb3IobWV0aG9kOiBzdHJpbmcsIG1lc3NhZ2U6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgQ2hhdFNlcnZpY2UjJHttZXRob2R9ICR7bWVzc2FnZX1gKTtcblx0fVxuXG5cdHByaXZhdGUgZGVzZXJpYWxpemVDaGF0cyhzZXNzaW9uRGF0YTogc3RyaW5nKTogSVNlcmlhbGl6YWJsZUNoYXRzRGF0YSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGFycmF5T2ZTZXNzaW9uczogSVNlcmlhbGl6YWJsZUNoYXREYXRhSW5bXSA9IHJldml2ZShKU09OLnBhcnNlKHNlc3Npb25EYXRhKSk7IC8vIFJldml2ZSBzZXJpYWxpemVkIFVSSXMgaW4gc2Vzc2lvbiBkYXRhXG5cdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkoYXJyYXlPZlNlc3Npb25zKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0V4cGVjdGVkIGFycmF5Jyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXJyYXlPZlNlc3Npb25zLnJlZHVjZTxJU2VyaWFsaXphYmxlQ2hhdHNEYXRhPigoYWNjLCBzZXNzaW9uKSA9PiB7XG5cdFx0XHRcdC8vIFJldml2ZSBzZXJpYWxpemVkIG1hcmtkb3duIHN0cmluZ3MgaW4gcmVzcG9uc2UgZGF0YVxuXHRcdFx0XHRmb3IgKGNvbnN0IHJlcXVlc3Qgb2Ygc2Vzc2lvbi5yZXF1ZXN0cykge1xuXHRcdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KHJlcXVlc3QucmVzcG9uc2UpKSB7XG5cdFx0XHRcdFx0XHRyZXF1ZXN0LnJlc3BvbnNlID0gcmVxdWVzdC5yZXNwb25zZS5tYXAoKHJlc3BvbnNlKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmICh0eXBlb2YgcmVzcG9uc2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhyZXNwb25zZSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cmV0dXJuIHJlc3BvbnNlO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgcmVxdWVzdC5yZXNwb25zZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdHJlcXVlc3QucmVzcG9uc2UgPSBbbmV3IE1hcmtkb3duU3RyaW5nKHJlcXVlc3QucmVzcG9uc2UpXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhY2Nbc2Vzc2lvbi5zZXNzaW9uSWRdID0gbm9ybWFsaXplU2VyaWFsaXphYmxlQ2hhdERhdGEoc2Vzc2lvbik7XG5cdFx0XHRcdHJldHVybiBhY2M7XG5cdFx0XHR9LCB7fSk7XG5cdFx0XHRyZXR1cm4gc2Vzc2lvbnM7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmVycm9yKCdkZXNlcmlhbGl6ZUNoYXRzJywgYE1hbGZvcm1lZCBzZXNzaW9uIGRhdGE6ICR7ZXJyfS4gWyR7c2Vzc2lvbkRhdGEuc3Vic3RyaW5nKDAsIDIwKX0ke3Nlc3Npb25EYXRhLmxlbmd0aCA+IDIwID8gJy4uLicgOiAnJ31dYCk7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYW4gYXJyYXkgb2YgY2hhdCBkZXRhaWxzIGZvciBhbGwgcGVyc2lzdGVkIGNoYXQgc2Vzc2lvbnMgdGhhdCBoYXZlIGF0IGxlYXN0IG9uZSByZXF1ZXN0LlxuXHQgKiBDaGF0IHNlc3Npb25zIHRoYXQgaGF2ZSBhbHJlYWR5IGJlZW4gbG9hZGVkIGludG8gdGhlIGNoYXQgdmlldyBhcmUgZXhjbHVkZWQgZnJvbSB0aGUgcmVzdWx0LlxuXHQgKiBJbXBvcnRlZCBjaGF0IHNlc3Npb25zIGFyZSBhbHNvIGV4Y2x1ZGVkIGZyb20gdGhlIHJlc3VsdC5cblx0ICogVE9ETyB0aGlzIGlzIG9ubHkgdXNlZCBieSB0aGUgb2xkIFwic2hvdyBjaGF0c1wiIGNvbW1hbmQgd2hpY2ggY2FuIGJlIHJlbW92ZWQgd2hlbiB0aGUgcHJlLWFnZW50cyB2aWV3XG5cdCAqIG9wdGlvbnMgYXJlIHJlbW92ZWQuXG5cdCAqL1xuXHRhc3luYyBnZXRMb2NhbFNlc3Npb25IaXN0b3J5KCk6IFByb21pc2U8SUNoYXREZXRhaWxbXT4ge1xuXHRcdGNvbnN0IGxpdmVTZXNzaW9uSXRlbXMgPSBhd2FpdCB0aGlzLmdldExpdmVTZXNzaW9uSXRlbXMoKTtcblx0XHRjb25zdCBoaXN0b3J5U2Vzc2lvbkl0ZW1zID0gYXdhaXQgdGhpcy5nZXRIaXN0b3J5U2Vzc2lvbkl0ZW1zKCk7XG5cblx0XHRyZXR1cm4gWy4uLmxpdmVTZXNzaW9uSXRlbXMsIC4uLmhpc3RvcnlTZXNzaW9uSXRlbXNdO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYW4gYXJyYXkgb2YgY2hhdCBkZXRhaWxzIGZvciBhbGwgbG9jYWwgbGl2ZSBjaGF0IHNlc3Npb25zLlxuXHQgKi9cblx0YXN5bmMgZ2V0TGl2ZVNlc3Npb25JdGVtcygpOiBQcm9taXNlPElDaGF0RGV0YWlsW10+IHtcblx0XHRyZXR1cm4gYXdhaXQgUHJvbWlzZS5hbGwoQXJyYXkuZnJvbSh0aGlzLl9zZXNzaW9uTW9kZWxzLnZhbHVlcygpKVxuXHRcdFx0LmZpbHRlcihzZXNzaW9uID0+IHRoaXMuc2hvdWxkQmVJbkhpc3Rvcnkoc2Vzc2lvbikpXG5cdFx0XHQubWFwKGNoYXRNb2RlbFRvQ2hhdERldGFpbCkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYW4gYXJyYXkgb2YgY2hhdCBkZXRhaWxzIGZvciBhbGwgbG9jYWwgY2hhdCBzZXNzaW9ucyBpbiBoaXN0b3J5IChub3QgY3VycmVudGx5IGxvYWRlZCkuXG5cdCAqL1xuXHRhc3luYyBnZXRIaXN0b3J5U2Vzc2lvbkl0ZW1zKCk6IFByb21pc2U8SUNoYXREZXRhaWxbXT4ge1xuXHRcdGNvbnN0IGluZGV4ID0gYXdhaXQgdGhpcy5fY2hhdFNlc3Npb25TdG9yZS5nZXRJbmRleCgpO1xuXHRcdHJldHVybiBPYmplY3QudmFsdWVzKGluZGV4KVxuXHRcdFx0LmZpbHRlcihlbnRyeSA9PiAhZW50cnkuaXNFeHRlcm5hbClcblx0XHRcdC5maWx0ZXIoZW50cnkgPT4gIXRoaXMuX3Nlc3Npb25Nb2RlbHMuaGFzKExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbihlbnRyeS5zZXNzaW9uSWQpKSAmJiBlbnRyeS5pbml0aWFsTG9jYXRpb24gPT09IENoYXRBZ2VudExvY2F0aW9uLkNoYXQgJiYgIWVudHJ5LmlzRW1wdHkpXG5cdFx0XHQubWFwKChlbnRyeSk6IElDaGF0RGV0YWlsID0+IHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gTG9jYWxDaGF0U2Vzc2lvblVyaS5mb3JTZXNzaW9uKGVudHJ5LnNlc3Npb25JZCk7XG5cdFx0XHRcdGNvbnN0IHsgd29ya2luZ0RpcmVjdG9yeTogd29ya2luZ0RpcmVjdG9yeVN0ciwgLi4ucmVzdCB9ID0gZW50cnk7XG5cdFx0XHRcdHJldHVybiAoe1xuXHRcdFx0XHRcdC4uLnJlc3QsXG5cdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRcdGlzQWN0aXZlOiB0aGlzLl9zZXNzaW9uTW9kZWxzLmhhcyhzZXNzaW9uUmVzb3VyY2UpLFxuXHRcdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHdvcmtpbmdEaXJlY3RvcnlTdHIgPyBVUkkucGFyc2Uod29ya2luZ0RpcmVjdG9yeVN0cikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdH1cblxuXHRhc3luYyBnZXRNZXRhZGF0YUZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkkpOiBQcm9taXNlPElDaGF0RGV0YWlsIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgaW5kZXggPSBhd2FpdCB0aGlzLl9jaGF0U2Vzc2lvblN0b3JlLmdldEluZGV4KCk7XG5cdFx0Y29uc3QgbWV0YWRhdGE6IElDaGF0U2Vzc2lvbkVudHJ5TWV0YWRhdGEgfCB1bmRlZmluZWQgPSBpbmRleFtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKV07XG5cdFx0aWYgKG1ldGFkYXRhKSB7XG5cdFx0XHRjb25zdCB7IHdvcmtpbmdEaXJlY3Rvcnk6IHdvcmtpbmdEaXJlY3RvcnlTdHIsIC4uLnJlc3QgfSA9IG1ldGFkYXRhO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4ucmVzdCxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRpc0FjdGl2ZTogdGhpcy5fc2Vzc2lvbk1vZGVscy5oYXMoc2Vzc2lvblJlc291cmNlKSxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogd29ya2luZ0RpcmVjdG9yeVN0ciA/IFVSSS5wYXJzZSh3b3JraW5nRGlyZWN0b3J5U3RyKSA6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkQmVJbkhpc3RvcnkoZW50cnk6IENoYXRNb2RlbCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhZW50cnkuaXNJbXBvcnRlZCAmJiAhZW50cnkuaXNEZWxldGVkICYmICEhTG9jYWxDaGF0U2Vzc2lvblVyaS5wYXJzZUxvY2FsU2Vzc2lvbklkKGVudHJ5LnNlc3Npb25SZXNvdXJjZSkgJiYgZW50cnkuaW5pdGlhbExvY2F0aW9uID09PSBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0O1xuXHR9XG5cblx0YXN5bmMgcmVtb3ZlSGlzdG9yeUVudHJ5KHNlc3Npb25SZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fY2hhdFNlc3Npb25TdG9yZS5kZWxldGVTZXNzaW9uKHRoaXMudG9Mb2NhbFNlc3Npb25JZChzZXNzaW9uUmVzb3VyY2UpKTtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX3Nlc3Npb25Nb2RlbHMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRtb2RlbC5tYXJrRGVsZXRlZCgpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZERpc3Bvc2VTZXNzaW9uLmZpcmUoeyBzZXNzaW9uUmVzb3VyY2VzOiBbc2Vzc2lvblJlc291cmNlXSwgcmVhc29uOiAnY2xlYXJlZCcgfSk7XG5cdH1cblxuXHRhc3luYyBjbGVhckFsbEhpc3RvcnlFbnRyaWVzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2NoYXRTZXNzaW9uU3RvcmUuY2xlYXJBbGxTZXNzaW9ucygpO1xuXHR9XG5cblx0c3RhcnROZXdMb2NhbFNlc3Npb24obG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLCBvcHRpb25zPzogSUNoYXRTZXNzaW9uU3RhcnRPcHRpb25zKTogSUNoYXRNb2RlbFJlZmVyZW5jZSB7XG5cdFx0dGhpcy50cmFjZSgnc3RhcnROZXdMb2NhbFNlc3Npb24nKTtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oZ2VuZXJhdGVVdWlkKCkpO1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uTW9kZWxzLmFjcXVpcmVPckNyZWF0ZSh7XG5cdFx0XHRpbml0aWFsRGF0YTogdW5kZWZpbmVkLFxuXHRcdFx0bG9jYXRpb24sXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRjYW5Vc2VUb29sczogb3B0aW9ucz8uY2FuVXNlVG9vbHMgPz8gdHJ1ZSxcblx0XHRcdGRpc2FibGVCYWNrZ3JvdW5kS2VlcEFsaXZlOiBvcHRpb25zPy5kaXNhYmxlQmFja2dyb3VuZEtlZXBBbGl2ZVxuXHRcdH0sIG9wdGlvbnM/LmRlYnVnT3duZXIgPz8gJ0NoYXRTZXJ2aWNlI3N0YXJ0TmV3TG9jYWxTZXNzaW9uJyk7XG5cdH1cblxuXHRwcml2YXRlIF9zdGFydFNlc3Npb24ocHJvcHM6IElTdGFydFNlc3Npb25Qcm9wcyk6IENoYXRNb2RlbCB7XG5cdFx0Y29uc3QgeyBpbml0aWFsRGF0YSwgbG9jYXRpb24sIHNlc3Npb25SZXNvdXJjZSwgY2FuVXNlVG9vbHMsIHRyYW5zZmVyRWRpdGluZ1Nlc3Npb24sIGRpc2FibGVCYWNrZ3JvdW5kS2VlcEFsaXZlLCBpbnB1dFN0YXRlLCBpc1JlYWRPbmx5IH0gPSBwcm9wcztcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1vZGVsLCBpbml0aWFsRGF0YSwgeyBpbml0aWFsTG9jYXRpb246IGxvY2F0aW9uLCBjYW5Vc2VUb29scywgcmVzb3VyY2U6IHNlc3Npb25SZXNvdXJjZSwgZGlzYWJsZUJhY2tncm91bmRLZWVwQWxpdmUsIGlucHV0U3RhdGUsIGlzUmVhZE9ubHkgfSk7XG5cdFx0aWYgKGxvY2F0aW9uID09PSBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSB7XG5cdFx0XHRtb2RlbC5zdGFydEVkaXRpbmdTZXNzaW9uKHRydWUsIHRyYW5zZmVyRWRpdGluZ1Nlc3Npb24pO1xuXHRcdH1cblxuXHRcdHRoaXMuaW5pdGlhbGl6ZVNlc3Npb24obW9kZWwpO1xuXHRcdHJldHVybiBtb2RlbDtcblx0fVxuXG5cdHByaXZhdGUgaW5pdGlhbGl6ZVNlc3Npb24obW9kZWw6IENoYXRNb2RlbCk6IHZvaWQge1xuXHRcdHRoaXMudHJhY2UoJ2luaXRpYWxpemVTZXNzaW9uJywgYEluaXRpYWxpemUgc2Vzc2lvbiAke21vZGVsLnNlc3Npb25SZXNvdXJjZX1gKTtcblxuXHRcdC8vIEFjdGl2YXRlIHRoZSBkZWZhdWx0IGV4dGVuc2lvbiBwcm92aWRlZCBhZ2VudCBidXQgZG8gbm90IHdhaXRcblx0XHQvLyBmb3IgaXQgdG8gYmUgcmVhZHkgc28gdGhhdCB0aGUgc2Vzc2lvbiBjYW4gYmUgdXNlZCBpbW1lZGlhdGVseVxuXHRcdC8vIHdpdGhvdXQgaGF2aW5nIHRvIHdhaXQgZm9yIHRoZSBhZ2VudCB0byBiZSByZWFkeS5cblx0XHR0aGlzLmFjdGl2YXRlRGVmYXVsdEFnZW50KG1vZGVsLmluaXRpYWxMb2NhdGlvbikuY2F0Y2goZSA9PiB0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZSkpO1xuXHR9XG5cblx0YXN5bmMgYWN0aXZhdGVEZWZhdWx0QWdlbnQobG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpO1xuXG5cdFx0Y29uc3QgZGVmYXVsdEFnZW50RGF0YSA9IHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXRDb250cmlidXRlZERlZmF1bHRBZ2VudChsb2NhdGlvbikgPz8gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldENvbnRyaWJ1dGVkRGVmYXVsdEFnZW50KENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdGlmICghZGVmYXVsdEFnZW50RGF0YSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yTm9UZWxlbWV0cnkoJ05vIGRlZmF1bHQgYWdlbnQgY29udHJpYnV0ZWQnKTtcblx0XHR9XG5cblx0XHQvLyBBd2FpdCBhY3RpdmF0aW9uIG9mIHRoZSBleHRlbnNpb24gcHJvdmlkZWQgYWdlbnRcblx0XHQvLyBVc2luZyBgYWN0aXZhdGVCeUlkYCBhcyB3b3JrYXJvdW5kIGZvciB0aGUgaXNzdWVcblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjUwNTkwXG5cdFx0aWYgKCFkZWZhdWx0QWdlbnREYXRhLmlzQ29yZSkge1xuXHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlJZChkZWZhdWx0QWdlbnREYXRhLmV4dGVuc2lvbklkLCB7XG5cdFx0XHRcdGFjdGl2YXRpb25FdmVudDogYG9uQ2hhdFBhcnRpY2lwYW50OiR7ZGVmYXVsdEFnZW50RGF0YS5pZH1gLFxuXHRcdFx0XHRleHRlbnNpb25JZDogZGVmYXVsdEFnZW50RGF0YS5leHRlbnNpb25JZCxcblx0XHRcdFx0c3RhcnR1cDogZmFsc2Vcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlZmF1bHRBZ2VudCA9IHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXRBY3RpdmF0ZWRBZ2VudHMoKS5maW5kKGFnZW50ID0+IGFnZW50LmlkID09PSBkZWZhdWx0QWdlbnREYXRhLmlkKTtcblx0XHRpZiAoIWRlZmF1bHRBZ2VudCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yTm9UZWxlbWV0cnkoJ05vIGRlZmF1bHQgYWdlbnQgcmVnaXN0ZXJlZCcpO1xuXHRcdH1cblx0fVxuXG5cdGdldFNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkkpOiBJQ2hhdE1vZGVsIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbk1vZGVscy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0fVxuXG5cdGFjcXVpcmVFeGlzdGluZ1Nlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkksIGRlYnVnT3duZXI/OiBzdHJpbmcpOiBJQ2hhdE1vZGVsUmVmZXJlbmNlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbk1vZGVscy5hY3F1aXJlRXhpc3Rpbmcoc2Vzc2lvblJlc291cmNlLCBkZWJ1Z093bmVyID8/ICdDaGF0U2VydmljZSNhY3F1aXJlRXhpc3RpbmdTZXNzaW9uJyk7XG5cdH1cblxuXHRnZXRDaGF0TW9kZWxSZWZlcmVuY2VEZWJ1Z0luZm8oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25Nb2RlbHMuZ2V0UmVmZXJlbmNlRGVidWdTbmFwc2hvdCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhY3F1aXJlT3JSZXN0b3JlTG9jYWxTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJLCBkZWJ1Z093bmVyPzogc3RyaW5nKTogUHJvbWlzZTxJQ2hhdE1vZGVsUmVmZXJlbmNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy50cmFjZSgnYWNxdWlyZU9yUmVzdG9yZVNlc3Npb24nLCBgJHtzZXNzaW9uUmVzb3VyY2V9YCk7XG5cdFx0Y29uc3QgZXhpc3RpbmdSZWYgPSB0aGlzLmFjcXVpcmVFeGlzdGluZ1Nlc3Npb24oc2Vzc2lvblJlc291cmNlLCBkZWJ1Z093bmVyKTtcblx0XHRpZiAoZXhpc3RpbmdSZWYpIHtcblx0XHRcdHJldHVybiBleGlzdGluZ1JlZjtcblx0XHR9XG5cblx0XHRsZXQgc2Vzc2lvbkRhdGE6IElTZXJpYWxpemVkQ2hhdERhdGFSZWZlcmVuY2UgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGlzRXF1YWwodGhpcy50cmFuc2ZlcnJlZFNlc3Npb25SZXNvdXJjZSwgc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0dGhpcy5fdHJhbnNmZXJyZWRTZXNzaW9uUmVzb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRzZXNzaW9uRGF0YSA9IGF3YWl0IHRoaXMuX2NoYXRTZXNzaW9uU3RvcmUucmVhZFRyYW5zZmVycmVkU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBsb2NhbFNlc3Npb25JZCA9IExvY2FsQ2hhdFNlc3Npb25VcmkucGFyc2VMb2NhbFNlc3Npb25JZChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKGxvY2FsU2Vzc2lvbklkKSB7XG5cdFx0XHRcdHNlc3Npb25EYXRhID0gYXdhaXQgdGhpcy5fY2hhdFNlc3Npb25TdG9yZS5yZWFkU2Vzc2lvbihsb2NhbFNlc3Npb25JZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFzZXNzaW9uRGF0YSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uUmVmID0gdGhpcy5fc2Vzc2lvbk1vZGVscy5hY3F1aXJlT3JDcmVhdGUoe1xuXHRcdFx0aW5pdGlhbERhdGE6IHNlc3Npb25EYXRhLFxuXHRcdFx0bG9jYXRpb246IHNlc3Npb25EYXRhLnZhbHVlLmluaXRpYWxMb2NhdGlvbiA/PyBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0Y2FuVXNlVG9vbHM6IHRydWUsXG5cdFx0fSwgZGVidWdPd25lciA/PyAnQ2hhdFNlcnZpY2UjYWNxdWlyZU9yUmVzdG9yZUxvY2FsU2Vzc2lvbicpO1xuXG5cdFx0cmV0dXJuIHNlc3Npb25SZWY7XG5cdH1cblxuXHQvLyBUaGVyZSBhcmUgc29tZSBjYXNlcyB3aGVyZSB0aGlzIHJldHVybnMgYSByZWFsIHN0cmluZy4gV2hhdCBoYXBwZW5zIGlmIGl0IGRvZXNuJ3Q/XG5cdC8vIFRoaXMgaGFkIHRpdGxlcyByZXN0b3JlZCBmcm9tIHRoZSBpbmRleCwgc28ganVzdCByZXR1cm4gdGl0bGVzIGZyb20gaW5kZXggaW5zdGVhZCwgc3luYy5cblx0Z2V0U2Vzc2lvblRpdGxlKHNlc3Npb25SZXNvdXJjZTogVVJJKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBMb2NhbENoYXRTZXNzaW9uVXJpLnBhcnNlTG9jYWxTZXNzaW9uSWQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIXNlc3Npb25JZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbk1vZGVscy5nZXQoc2Vzc2lvblJlc291cmNlKT8udGl0bGUgPz9cblx0XHRcdHRoaXMuX2NoYXRTZXNzaW9uU3RvcmUuZ2V0TWV0YWRhdGFGb3JTZXNzaW9uU3luYyhzZXNzaW9uUmVzb3VyY2UpPy50aXRsZTtcblx0fVxuXG5cdGxvYWRTZXNzaW9uRnJvbURhdGEoZGF0YTogSUV4cG9ydGFibGVDaGF0RGF0YSB8IElTZXJpYWxpemFibGVDaGF0RGF0YSwgZGVidWdPd25lcj86IHN0cmluZyk6IElDaGF0TW9kZWxSZWZlcmVuY2Uge1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IChkYXRhIGFzIElTZXJpYWxpemFibGVDaGF0RGF0YSkuc2Vzc2lvbklkID8/IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uTW9kZWxzLmFjcXVpcmVPckNyZWF0ZSh7XG5cdFx0XHRpbml0aWFsRGF0YTogeyB2YWx1ZTogZGF0YSwgc2VyaWFsaXplcjogbmV3IENoYXRTZXNzaW9uT3BlcmF0aW9uTG9nKCkgfSxcblx0XHRcdGxvY2F0aW9uOiBkYXRhLmluaXRpYWxMb2NhdGlvbiA/PyBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0Y2FuVXNlVG9vbHM6IHRydWUsXG5cdFx0fSwgZGVidWdPd25lciA/PyAnQ2hhdFNlcnZpY2UjbG9hZFNlc3Npb25Gcm9tRGF0YScpO1xuXHR9XG5cblx0YXN5bmMgYWNxdWlyZU9yTG9hZFNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkksIGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuLCBkZWJ1Z093bmVyPzogc3RyaW5nKTogUHJvbWlzZTxJQ2hhdE1vZGVsUmVmZXJlbmNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKExvY2FsQ2hhdFNlc3Npb25VcmkuaXNMb2NhbFNlc3Npb24oc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuYWNxdWlyZU9yUmVzdG9yZUxvY2FsU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UsIGRlYnVnT3duZXIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5sb2FkUmVtb3RlU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UsIGxvY2F0aW9uLCB0b2tlbiwgZGVidWdPd25lcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBsb2FkUmVtb3RlU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgbG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIGRlYnVnT3duZXI/OiBzdHJpbmcpOiBQcm9taXNlPElDaGF0TW9kZWxSZWZlcmVuY2UgfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBDaGVjayBpZiBzZXNzaW9uIGFscmVhZHkgZXhpc3RzIGJlZm9yZSByZXNvbHZpbmcgdGhlIHByb3ZpZGVyLFxuXHRcdC8vIHNvIHdlIGNhbiByZXR1cm4gYSBjYWNoZWQgbW9kZWwgZXZlbiBpZiB0aGUgcHJvdmlkZXIgd2FzIHVucmVnaXN0ZXJlZC5cblx0XHR7XG5cdFx0XHRjb25zdCBleGlzdGluZ1JlZiA9IHRoaXMuYWNxdWlyZUV4aXN0aW5nU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UsIGRlYnVnT3duZXIpO1xuXHRcdFx0aWYgKGV4aXN0aW5nUmVmKSB7XG5cdFx0XHRcdHJldHVybiBleGlzdGluZ1JlZjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWF3YWl0IHJhY2VDYW5jZWxsYXRpb25FcnJvcih0aGlzLmNoYXRTZXNzaW9uU2VydmljZS5jYW5SZXNvbHZlQ2hhdFNlc3Npb24oZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSkpLCB0b2tlbikpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvdmlkZWRTZXNzaW9uID0gYXdhaXQgdGhpcy5jaGF0U2Vzc2lvblNlcnZpY2UuZ2V0T3JDcmVhdGVDaGF0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UsIHRva2VuKTtcblxuXHRcdC8vIE1ha2Ugc3VyZSB3ZSBoYXZlbid0IGNyZWF0ZWQgdGhpcyBpbiB0aGUgbWVhbnRpbWVcblx0XHR7XG5cdFx0XHRjb25zdCBleGlzdGluZ1JlZiA9IHRoaXMuYWNxdWlyZUV4aXN0aW5nU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UsIGRlYnVnT3duZXIpO1xuXHRcdFx0aWYgKGV4aXN0aW5nUmVmKSB7XG5cdFx0XHRcdHJldHVybiBleGlzdGluZ1JlZjtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgY2hhdFNlc3Npb25UeXBlID0gZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgbW9kZWxJZCA9IGZpbmRMYXN0KHByb3ZpZGVkU2Vzc2lvbi5oaXN0b3J5LmZpbHRlcihtID0+IG0udHlwZSA9PT0gJ3JlcXVlc3QnKSwgcmVxID0+IHJlcS5tb2RlbElkKT8ubW9kZWxJZDtcblx0XHRjb25zdCBhZ2VudFVyaSA9IGZpbmRMYXN0KHByb3ZpZGVkU2Vzc2lvbi5oaXN0b3J5LmZpbHRlcihtID0+IG0udHlwZSA9PT0gJ3JlcXVlc3QnKSwgcmVxID0+IHJlcS5tb2RlSW5zdHJ1Y3Rpb25zPy51cmkpPy5tb2RlSW5zdHJ1Y3Rpb25zPy51cmk7XG5cdFx0Y29uc3Qgc3RvcmVkTWV0YWRhdGEgPSB0aGlzLl9jaGF0U2Vzc2lvblN0b3JlLmdldE1ldGFkYXRhRm9yU2Vzc2lvblN5bmMoc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBzdG9yZWRQZXJtaXNzaW9uTGV2ZWwgPSBzdG9yZWRNZXRhZGF0YT8ucGVybWlzc2lvbkxldmVsO1xuXHRcdGNvbnN0IHN0b3JlZElucHV0U3RhdGUgPSBzdG9yZWRNZXRhZGF0YT8uaW5wdXRTdGF0ZTtcblx0XHRsZXQgaW5pdGlhbERhdGE6IElTZXJpYWxpemVkQ2hhdERhdGFSZWZlcmVuY2UgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGhpc3RvcnlTZWxlY3RlZE1vZGVsOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGhpc3RvcnlEZXJpdmVkTW9kZWw6IElTZXJpYWxpemFibGVDaGF0TW9kZWxJbnB1dFN0YXRlWydzZWxlY3RlZE1vZGVsJ10gPSB1bmRlZmluZWQ7XG5cdFx0aWYgKChtb2RlbElkIHx8IGFnZW50VXJpKSkge1xuXHRcdFx0Y29uc3QgbW9kZTogSVNlcmlhbGl6YWJsZUNoYXRNb2RlbElucHV0U3RhdGVbJ21vZGUnXSA9IGFnZW50VXJpID8geyBraW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsIGlkOiBhZ2VudFVyaS50b1N0cmluZygpIH0gOiB7IGtpbmQ6IENoYXRNb2RlS2luZC5BZ2VudCwgaWQ6IENoYXRNb2RlLkFnZW50LmlkIH07XG5cdFx0XHRjb25zdCBtb2RlbE1ldGFkYXRhID0gbW9kZWxJZCA/IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWwobW9kZWxJZCkgOiB1bmRlZmluZWQ7XG5cdFx0XHQvLyBUaGUgc2Vzc2lvbiByZXF1ZXN0IGhpc3Rvcnkgb25seSB0ZWxscyB1cyB3aGljaCBtb2RlbCBpZCB3YXMgbGFzdCB1c2VkLCBub3QgdGhlXG5cdFx0XHQvLyB1c2VyJ3MgcGVyLW1vZGVsIGNvbmZpZ3VyYXRpb24gKGUuZy4gdGhpbmtpbmcgZWZmb3J0LCBjb250ZXh0IHdpbmRvdykuIFByZXNlcnZlIHRoYXRcblx0XHRcdC8vIGNvbmZpZ3VyYXRpb24gZnJvbSB0aGUgcGVyc2lzdGVkIGRyYWZ0IHdoZW4gaXQgcmVmZXJzIHRvIHRoZSBzYW1lIG1vZGVsLCBzbyByZW9wZW5pbmdcblx0XHRcdC8vIHRoZSBzZXNzaW9uIHJlc3RvcmVzIHRoZSBmdWxsIG1vZGVsIGNvbmZpZyBhbmQgbm90IGp1c3QgdGhlIGJhcmUgbW9kZWwgaWQuIE9sZGVyIGRyYWZ0c1xuXHRcdFx0Ly8gc3RvcmVkIHRoZSBjb25maWd1cmF0aW9uIGFzIGEgc2libGluZyBvZiBgc2VsZWN0ZWRNb2RlbGAgKGxlZ2FjeSB0b3AtbGV2ZWwgZmllbGQpIHJhdGhlclxuXHRcdFx0Ly8gdGhhbiBuZXN0ZWQgd2l0aGluIGl0LCBzbyBmYWxsIGJhY2sgdG8gdGhhdCBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkuXG5cdFx0XHRjb25zdCBzdG9yZWRNb2RlbENvbmZpZ3VyYXRpb24gPSBzdG9yZWRJbnB1dFN0YXRlPy5zZWxlY3RlZE1vZGVsPy5tb2RlbENvbmZpZ3VyYXRpb25cblx0XHRcdFx0Pz8gKHN0b3JlZElucHV0U3RhdGUgYXMgeyBtb2RlbENvbmZpZ3VyYXRpb24/OiBJU3RyaW5nRGljdGlvbmFyeTx1bmtub3duPiB9IHwgdW5kZWZpbmVkKT8ubW9kZWxDb25maWd1cmF0aW9uO1xuXHRcdFx0Y29uc3QgbW9kZWxDb25maWd1cmF0aW9uID0gc3RvcmVkSW5wdXRTdGF0ZT8uc2VsZWN0ZWRNb2RlbD8uaWRlbnRpZmllciA9PT0gbW9kZWxJZFxuXHRcdFx0XHQ/IHN0b3JlZE1vZGVsQ29uZmlndXJhdGlvblxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdC8vIFdoZW4gdGhlIGxpdmUgbW9kZWwgbGlzdCBoYXMgbm90IGxvYWRlZCB5ZXQgKGNvbGQgcmVzdG9yZSkgYGxvb2t1cExhbmd1YWdlTW9kZWxgXG5cdFx0XHQvLyByZXR1cm5zIHVuZGVmaW5lZC4gRG9uJ3QgZGlzY2FyZCB0aGUga25vd24gbW9kZWw6IGZhbGwgYmFjayB0byB0aGUgc2Vzc2lvbidzIHNhdmVkXG5cdFx0XHQvLyBkcmFmdCBtb2RlbCwgd2hpY2ggY2FycmllcyB0aGUgZnVsbCBzZXJpYWxpemVkIG1ldGFkYXRhIChpbmNsdWRpbmdcblx0XHRcdC8vIGB0YXJnZXRDaGF0U2Vzc2lvblR5cGVgKSwgd2hlbiBpdCByZWZlcnMgdG8gdGhlIHNhbWUgaWQgdGhlIHJlcXVlc3QgaGlzdG9yeSByZXBvcnRzXG5cdFx0XHQvLyBhcyBsYXN0IHVzZWQuIEhhbmRpbmcgdGhlIGlucHV0IHBhcnQgYSBtb2RlbC13aXRoLW1ldGFkYXRhIGxldHMgaXQgd2FpdCBmb3IgdGhlXG5cdFx0XHQvLyBtb2RlbCBwb29sIGFuZCBhcHBseSBpdCBvbmNlIGl0IGxvYWRzLCBpbnN0ZWFkIG9mIGZhbGxpbmcgYmFjayB0byBBdXRvLlxuXHRcdFx0Y29uc3Qgc3RvcmVkU2VsZWN0ZWRNb2RlbCA9IHN0b3JlZElucHV0U3RhdGU/LnNlbGVjdGVkTW9kZWw7XG5cdFx0XHRjb25zdCBzZWxlY3RlZE1vZGVsOiBJU2VyaWFsaXphYmxlQ2hhdE1vZGVsSW5wdXRTdGF0ZVsnc2VsZWN0ZWRNb2RlbCddID0gbW9kZWxJZCAmJiBtb2RlbE1ldGFkYXRhXG5cdFx0XHRcdD8geyBpZGVudGlmaWVyOiBtb2RlbElkLCBtZXRhZGF0YTogbW9kZWxNZXRhZGF0YSwgbW9kZWxDb25maWd1cmF0aW9uIH1cblx0XHRcdFx0OiAobW9kZWxJZCAmJiBzdG9yZWRTZWxlY3RlZE1vZGVsICYmIHN0b3JlZFNlbGVjdGVkTW9kZWwuaWRlbnRpZmllciA9PT0gbW9kZWxJZFxuXHRcdFx0XHRcdD8geyAuLi5zdG9yZWRTZWxlY3RlZE1vZGVsLCBtb2RlbENvbmZpZ3VyYXRpb24gfVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkKTtcblx0XHRcdGhpc3RvcnlTZWxlY3RlZE1vZGVsID0gc2VsZWN0ZWRNb2RlbD8uaWRlbnRpZmllcjtcblx0XHRcdGhpc3RvcnlEZXJpdmVkTW9kZWwgPSBzZWxlY3RlZE1vZGVsO1xuXHRcdFx0Ly8gVGhpcyBpcyB1c2VkIHRvIGluaXRpYWxpemUgdGhlIHN0YXRlIG9mIHRoZSBjaGF0IGlucHV0IGJveCwgd2l0aCB0aGUgc2VsZWN0ZWQgbW9kZWwsIG1vZGUsIGV0Y1xuXHRcdFx0aW5pdGlhbERhdGEgPSB7XG5cdFx0XHRcdHNlcmlhbGl6ZXI6IG5ldyBDaGF0U2Vzc2lvbk9wZXJhdGlvbkxvZygpLFxuXHRcdFx0XHR2YWx1ZToge1xuXHRcdFx0XHRcdGNyZWF0aW9uRGF0ZTogRGF0ZS5ub3coKSxcblx0XHRcdFx0XHRpbml0aWFsTG9jYXRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjdXN0b21UaXRsZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHJlcXVlc3RzOiBbXSxcblx0XHRcdFx0XHRyZXNwb25kZXJVc2VybmFtZTogJycsXG5cdFx0XHRcdFx0c2Vzc2lvbklkOiAnJyxcblx0XHRcdFx0XHR2ZXJzaW9uOiAzLFxuXHRcdFx0XHRcdGlucHV0U3RhdGU6IHtcblx0XHRcdFx0XHRcdGF0dGFjaG1lbnRzOiBbXSxcblx0XHRcdFx0XHRcdGNvbnRyaWI6IHt9LFxuXHRcdFx0XHRcdFx0aW5wdXRUZXh0OiAnJyxcblx0XHRcdFx0XHRcdG1vZGUsXG5cdFx0XHRcdFx0XHRzZWxlY3RlZE1vZGVsOiBzZWxlY3RlZE1vZGVsLFxuXHRcdFx0XHRcdFx0c2VsZWN0aW9uczogW10sXG5cdFx0XHRcdFx0XHRwZXJtaXNzaW9uTGV2ZWw6IHN0b3JlZFBlcm1pc3Npb25MZXZlbCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHBlbmRpbmdSZXF1ZXN0czogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHJlcG9EYXRhOiB1bmRlZmluZWRcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBDb250cmlidXRlZCBzZXNzaW9ucyBkbyBub3QgdXNlIFVJIHRvb2xzLlxuXHRcdC8vIFByZWZlciAoaW4gb3JkZXIpOiBhIHRyYW5zZmVycmVkIGRyYWZ0LCB0aGUgcGVyc2lzdGVkIGRyYWZ0IGZyb20gbWV0YWRhdGEsXG5cdFx0Ly8gb3RoZXJ3aXNlIGxldCB0aGUgY29uc3RydWN0b3IgZmFsbCBiYWNrIHRvIGluaXRpYWxEYXRhLnZhbHVlLmlucHV0U3RhdGUuXG5cdFx0Ly8gV2hlbiByZXN0b3JpbmcgdGhlIHBlcnNpc3RlZCBkcmFmdCB3ZSBrZWVwIHRoZSB1bnNlbnQgdGV4dC9zZWxlY3Rpb25zL21vZGUgYnV0XG5cdFx0Ly8gZGVsaWJlcmF0ZWx5IGRyb3AgaXRzIHBlcnNpc3RlZCBzZWxlY3RlZE1vZGVsIGlkZW50aWZpZXIgKGl0IGNhbiBiZSBzdGFsZSBvciBiZWxvbmdcblx0XHQvLyB0byBhIGRpZmZlcmVudCBtb2RlbCBwb29sKSBpbiBmYXZvdXIgb2YgdGhlIG1vZGVsIGRlcml2ZWQgZnJvbSB0aGUgc2Vzc2lvbidzIHJlcXVlc3Rcblx0XHQvLyBoaXN0b3J5LiBUaGUgdXNlcidzIHBlci1tb2RlbCBjb25maWd1cmF0aW9uICh0aGlua2luZyBlZmZvcnQsIGNvbnRleHQgd2luZG93KSBpc1xuXHRcdC8vIGNhcnJpZWQgb3ZlciBvbnRvIHRoYXQgaGlzdG9yeS1kZXJpdmVkIG1vZGVsIGFib3ZlIHdoZW4gdGhlIGlkcyBtYXRjaC4gV2hlbiBub1xuXHRcdC8vIGhpc3RvcnkgbW9kZWwgaXMgYXZhaWxhYmxlIHRoZSBtb2RlbCBpcyBsZWZ0IHVuZGVmaW5lZCBzbyB0aGUgaW5wdXQgcGFydCByZXNvbHZlc1xuXHRcdC8vIGl0IHZpYSBpdHMgb3duIHNlbGVjdGlvbiBsb2dpYy5cblx0XHRjb25zdCByZXN0b3JlZERyYWZ0OiBJU2VyaWFsaXphYmxlQ2hhdE1vZGVsSW5wdXRTdGF0ZSB8IHVuZGVmaW5lZCA9IHN0b3JlZElucHV0U3RhdGVcblx0XHRcdD8geyAuLi5zdG9yZWRJbnB1dFN0YXRlLCBzZWxlY3RlZE1vZGVsOiBoaXN0b3J5RGVyaXZlZE1vZGVsIH1cblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdC8vIEF0IGNvbGQgcmVzdG9yZSB0aGUgYWdlbnQtaG9zdCB0cmFuc2ZlcnJlZCBkcmFmdCBjYW4gZHJvcCB0aGUgdXNlcidzIHBlci1zZXNzaW9uIHBpY2tlclxuXHRcdC8vIHNlbGVjdGlvbnMgKG1vZGVsL21vZGUpOyByZXN0b3JlIHRoZW0gZnJvbSB0aGUgc2Vzc2lvbidzIG93biBzYXZlZCBgc3RvcmVkSW5wdXRTdGF0ZWBcblx0XHQvLyAobW9kZSwgdmlhIHtAbGluayBiYWNrZmlsbFJlc3RvcmVkUGlja2VyU3RhdGV9KSBhbmQgZnJvbSB0aGUgaGlzdG9yeS1kZXJpdmVkIG1vZGVsXG5cdFx0Ly8gKHZpYSB7QGxpbmsgYmFja2ZpbGxUcmFuc2ZlcnJlZE1vZGVsfSkuIFRoZSBwZXJzaXN0ZWQgZHJhZnQgYWxyZWFkeSBjb250YWluc1xuXHRcdC8vIGBoaXN0b3J5RGVyaXZlZE1vZGVsYCwgc28gb25seSBhIHRyYW5zZmVycmVkIGRyYWZ0IG5lZWRzIHRoaXMgYmFja2ZpbGwuXG5cdFx0Y29uc3QgdHJhbnNmZXJyZWRJbnB1dFN0YXRlID0gcHJvdmlkZWRTZXNzaW9uLnRyYW5zZmVycmVkU3RhdGU/LmlucHV0U3RhdGU7XG5cdFx0Y29uc3Qgc3RhdGVUb0FwcGx5ID0gdHJhbnNmZXJyZWRJbnB1dFN0YXRlXG5cdFx0XHQ/IGJhY2tmaWxsVHJhbnNmZXJyZWRNb2RlbCh0cmFuc2ZlcnJlZElucHV0U3RhdGUsIGhpc3RvcnlEZXJpdmVkTW9kZWwpXG5cdFx0XHQ6IHJlc3RvcmVkRHJhZnQ7XG5cdFx0Y29uc3QgaW5wdXRTdGF0ZSA9IGJhY2tmaWxsUmVzdG9yZWRQaWNrZXJTdGF0ZShzdGF0ZVRvQXBwbHksIHN0b3JlZElucHV0U3RhdGUsIENoYXRNb2RlLkFnZW50LmlkKTtcblx0XHRjb25zdCBtb2RlbFJlZiA9IHRoaXMuX3Nlc3Npb25Nb2RlbHMuYWNxdWlyZU9yQ3JlYXRlKHtcblx0XHRcdGluaXRpYWxEYXRhLFxuXHRcdFx0bG9jYXRpb24sXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdGNhblVzZVRvb2xzOiBmYWxzZSxcblx0XHRcdHRyYW5zZmVyRWRpdGluZ1Nlc3Npb246IHByb3ZpZGVkU2Vzc2lvbi50cmFuc2ZlcnJlZFN0YXRlPy5lZGl0aW5nU2Vzc2lvbixcblx0XHRcdGlucHV0U3RhdGUsXG5cdFx0XHRpc1JlYWRPbmx5OiBwcm92aWRlZFNlc3Npb24uaXNSZWFkT25seSxcblx0XHR9LCBkZWJ1Z093bmVyID8/ICdDaGF0U2VydmljZSNsb2FkUmVtb3RlU2Vzc2lvbicpO1xuXG5cdFx0Ly8gVGhlIGlkIGlzIGtub3duIGJ1dCBubyBtZXRhZGF0YSB3YXMgZm91bmQgZm9yIGl0LiBSZWNvcmQgaXQgYW55d2F5IHNvIHRoZSBpbnB1dCByZWNsYWltc1xuXHRcdC8vIHRoZSBtb2RlbCBvbmNlIGl0IHB1Ymxpc2hlcywgcmF0aGVyIHRoYW4gc2V0dGxpbmcgb24gdGhlIGRlZmF1bHQuXG5cdFx0aWYgKG1vZGVsSWQgJiYgIWhpc3RvcnlTZWxlY3RlZE1vZGVsKSB7XG5cdFx0XHRtb2RlbFJlZi5vYmplY3QuaW5wdXRNb2RlbC5zZXRJbnRlbmRlZE1vZGVsKHsgbW9kZWxJZCwgcmVhc29uOiBNb2RlbFNlbGVjdGlvblJlYXNvbi5TZXNzaW9uUmVzdG9yZSB9KTtcblx0XHR9XG5cblx0XHRsb2dDaGFuZ2VzVG9TdGF0ZU1vZGVsKG1vZGVsUmVmLm9iamVjdC5pbnB1dE1vZGVsLCBgbG9hZFJlbW90ZVNlc3Npb24gaW5wdXRTdGF0ZSBzb3VyY2U6IHNlc3Npb249JHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX0sIGNoYXRTZXNzaW9uVHlwZT0ke2NoYXRTZXNzaW9uVHlwZX0sIGhpc3RvcnlNb2RlbElkPSR7bW9kZWxJZH0sIGFnZW50VXJpPSR7YWdlbnRVcmk/LnRvU3RyaW5nKCl9LCBoaXN0b3J5U2VsZWN0ZWRNb2RlbD0ke2hpc3RvcnlTZWxlY3RlZE1vZGVsfSwgdHJhbnNmZXJyZWRTZWxlY3RlZE1vZGVsPSR7cHJvdmlkZWRTZXNzaW9uLnRyYW5zZmVycmVkU3RhdGU/LmlucHV0U3RhdGU/LnNlbGVjdGVkTW9kZWw/LmlkZW50aWZpZXJ9LCBzdG9yZWRTZWxlY3RlZE1vZGVsPSR7c3RvcmVkSW5wdXRTdGF0ZT8uc2VsZWN0ZWRNb2RlbD8uaWRlbnRpZmllcn0sIGZpbmFsU2VsZWN0ZWRNb2RlbD0ke21vZGVsUmVmLm9iamVjdC5pbnB1dE1vZGVsLnN0YXRlLmdldCgpPy5zZWxlY3RlZE1vZGVsPy5pZGVudGlmaWVyfSwgaGFzVHJhbnNmZXJyZWRJbnB1dFN0YXRlPSR7ISFwcm92aWRlZFNlc3Npb24udHJhbnNmZXJyZWRTdGF0ZT8uaW5wdXRTdGF0ZX0sIGhhc1N0b3JlZElucHV0U3RhdGU9JHshIXN0b3JlZElucHV0U3RhdGV9LCBoYXNJbml0aWFsRGF0YT0keyEhaW5pdGlhbERhdGF9YCwgbW9kZWxSZWYub2JqZWN0LmlucHV0TW9kZWwuc3RhdGUuZ2V0KCksIHVuZGVmaW5lZCwgdGhpcy5sb2dTZXJ2aWNlKTtcblxuXHRcdC8vIFJlc3RvcmUgcGVybWlzc2lvbiBsZXZlbCBmcm9tIG1ldGFkYXRhIGV2ZW4gd2hlbiBpbml0aWFsRGF0YSB3YXMgbm90IGNvbnN0cnVjdGVkXG5cdFx0Ly8gYW5kIG5vIGlucHV0U3RhdGUgY2FycmllZCBpdCB0aHJvdWdoLlxuXHRcdGlmIChzdG9yZWRQZXJtaXNzaW9uTGV2ZWwgJiYgIWluaXRpYWxEYXRhICYmICFzdG9yZWRJbnB1dFN0YXRlKSB7XG5cdFx0XHRtb2RlbFJlZi5vYmplY3QuaW5wdXRNb2RlbC5zZXRTdGF0ZSh7IHBlcm1pc3Npb25MZXZlbDogc3RvcmVkUGVybWlzc2lvbkxldmVsIH0pO1xuXHRcdH1cblxuXHRcdGlmIChwcm92aWRlZFNlc3Npb24udGl0bGUpIHtcblx0XHRcdG1vZGVsUmVmLm9iamVjdC5zZXRDdXN0b21UaXRsZShwcm92aWRlZFNlc3Npb24udGl0bGUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gbW9kZWxSZWYub2JqZWN0O1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtb2RlbFJlZi5vYmplY3Qub25EaWREaXNwb3NlKCgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdHByb3ZpZGVkU2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaXNBZ2VudEhvc3RTZXNzaW9uID0gaXNBZ2VudEhvc3RUYXJnZXQoY2hhdFNlc3Npb25UeXBlKTtcblx0XHRjb25zdCByZXF1ZXN0UGFyc2VyID0gaXNBZ2VudEhvc3RTZXNzaW9uID8gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0UmVxdWVzdFBhcnNlcikgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcGFyc2VBZ2VudEhvc3RIaXN0b3J5UHJvbXB0ID0gKHRleHQ6IHN0cmluZywgYWdlbnQ6IElDaGF0QWdlbnREYXRhIHwgdW5kZWZpbmVkKTogSVBhcnNlZENoYXRSZXF1ZXN0ID0+IHtcblx0XHRcdGlmIChyZXF1ZXN0UGFyc2VyKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgYXR0YWNobWVudENhcGFiaWxpdGllcyA9IHRoaXMuZ2V0QXR0YWNobWVudENhcGFiaWxpdGllc0ZvclBhcnNlcihjaGF0U2Vzc2lvblR5cGUsIGFnZW50KTtcblx0XHRcdFx0XHRjb25zdCBwYXJzZWQgPSByZXF1ZXN0UGFyc2VyLnBhcnNlQ2hhdFJlcXVlc3RXaXRoUmVmZXJlbmNlcyhcblx0XHRcdFx0XHRcdEVNUFRZX1JFRkVSRU5DRVMsXG5cdFx0XHRcdFx0XHRFTVBUWV9UT09MX0VOQUJMRU1FTlRfTUFQLFxuXHRcdFx0XHRcdFx0dGV4dCxcblx0XHRcdFx0XHRcdGxvY2F0aW9uLFxuXHRcdFx0XHRcdFx0eyBzZXNzaW9uVHlwZTogY2hhdFNlc3Npb25UeXBlLCBmb3JjZWRBZ2VudDogYWdlbnQsIGF0dGFjaG1lbnRDYXBhYmlsaXRpZXMgfSxcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdGlmIChwYXJzZWQucGFydHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHBhcnNlZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgQ2hhdFNlcnZpY2UjbG9hZFJlbW90ZVNlc3Npb246IGZhaWxlZCB0byByZS1wYXJzZSBoaXN0b3JpY2FsIHByb21wdCBmb3IgJHtjaGF0U2Vzc2lvblR5cGV9YCwgZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHRleHQsXG5cdFx0XHRcdHBhcnRzOiBbbmV3IENoYXRSZXF1ZXN0VGV4dFBhcnQoXG5cdFx0XHRcdFx0bmV3IE9mZnNldFJhbmdlKDAsIHRleHQubGVuZ3RoKSxcblx0XHRcdFx0XHR7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogdGV4dC5sZW5ndGggKyAxIH0sXG5cdFx0XHRcdFx0dGV4dFxuXHRcdFx0XHQpXVxuXHRcdFx0fTtcblx0XHR9O1xuXG5cdFx0bGV0IGxhc3RSZXF1ZXN0OiBDaGF0UmVxdWVzdE1vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBsYXN0UmVzcG9uc2VDb21wbGV0ZWRBdDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNvbXBsZXRlTGFzdFJlc3BvbnNlID0gKCkgPT4ge1xuXHRcdFx0aWYgKE51bWJlci5pc0Zpbml0ZShsYXN0UmVzcG9uc2VDb21wbGV0ZWRBdCkpIHtcblx0XHRcdFx0bGFzdFJlcXVlc3Q/LnJlc3BvbnNlPy5jb21wbGV0ZShsYXN0UmVzcG9uc2VDb21wbGV0ZWRBdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsYXN0UmVxdWVzdD8ucmVzcG9uc2U/LmNvbXBsZXRlV2l0aG91dFRpbWVzdGFtcCgpO1xuXHRcdFx0fVxuXHRcdFx0bGFzdFJlc3BvbnNlQ29tcGxldGVkQXQgPSB1bmRlZmluZWQ7XG5cdFx0fTtcblx0XHRmb3IgKGNvbnN0IG1lc3NhZ2Ugb2YgcHJvdmlkZWRTZXNzaW9uLmhpc3RvcnkpIHtcblx0XHRcdGlmIChtZXNzYWdlLnR5cGUgPT09ICdyZXF1ZXN0Jykge1xuXHRcdFx0XHRpZiAobGFzdFJlcXVlc3QpIHtcblx0XHRcdFx0XHRjb21wbGV0ZUxhc3RSZXNwb25zZSgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVxdWVzdFRleHQgPSBtZXNzYWdlLnByb21wdDtcblx0XHRcdFx0Y29uc3QgYWdlbnQgPVxuXHRcdFx0XHRcdG1lc3NhZ2UucGFydGljaXBhbnRcblx0XHRcdFx0XHRcdD8gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldEFnZW50KG1lc3NhZ2UucGFydGljaXBhbnQpIC8vIFRPRE8oam9zcGljZXIpOiBSZW1vdmUgYW5kIGFsd2F5cyBoYXJkY29kZT9cblx0XHRcdFx0XHRcdDogdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldEFnZW50KGNoYXRTZXNzaW9uVHlwZSk7XG5cdFx0XHRcdGNvbnN0IHBhcnNlZFJlcXVlc3QgPSBwYXJzZUFnZW50SG9zdEhpc3RvcnlQcm9tcHQocmVxdWVzdFRleHQsIGFnZW50KTtcblx0XHRcdFx0Y29uc3QgbW9kZUluZm8gPSBtZXNzYWdlLm1vZGVJbnN0cnVjdGlvbnMgPyB7XG5cdFx0XHRcdFx0a2luZDogQ2hhdE1vZGVLaW5kLkFnZW50LFxuXHRcdFx0XHRcdGlzQnVpbHRpbjogbWVzc2FnZS5tb2RlSW5zdHJ1Y3Rpb25zLmlzQnVpbHRpbiA/PyBmYWxzZSxcblx0XHRcdFx0XHRtb2RlSW5zdHJ1Y3Rpb25zOiBtZXNzYWdlLm1vZGVJbnN0cnVjdGlvbnMsXG5cdFx0XHRcdFx0dGVsZW1ldHJ5TW9kZUlkOiAnY3VzdG9tJyxcblx0XHRcdFx0XHRhcHBseUNvZGVCbG9ja1N1Z2dlc3Rpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9IHNhdGlzZmllcyBJQ2hhdFJlcXVlc3RNb2RlSW5mbyA6IHVuZGVmaW5lZDtcblx0XHRcdFx0bGFzdFJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHBhcnNlZFJlcXVlc3QsXG5cdFx0XHRcdFx0bWVzc2FnZS52YXJpYWJsZURhdGEgPz8geyB2YXJpYWJsZXM6IFtdIH0sXG5cdFx0XHRcdFx0MCwgLy8gYXR0ZW1wdFxuXHRcdFx0XHRcdG1vZGVJbmZvLFxuXHRcdFx0XHRcdGFnZW50LFxuXHRcdFx0XHRcdHVuZGVmaW5lZCwgLy8gc2xhc2hDb21tYW5kXG5cdFx0XHRcdFx0dW5kZWZpbmVkLCAvLyBjb25maXJtYXRpb25cblx0XHRcdFx0XHR1bmRlZmluZWQsIC8vIGxvY2F0aW9uRGF0YVxuXHRcdFx0XHRcdHVuZGVmaW5lZCwgLy8gYXR0YWNobWVudHNcblx0XHRcdFx0XHRmYWxzZSwgLy8gRG8gbm90IHRyZWF0IGFzIHJlcXVlc3RzIGNvbXBsZXRlZCwgZWxzZSBlZGl0IHBpbGxzIHdvbid0IHNob3cuXG5cdFx0XHRcdFx0bWVzc2FnZS5tb2RlbElkLFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHRtZXNzYWdlLmlkLFxuXHRcdFx0XHRcdG1lc3NhZ2UuaXNTeXN0ZW1Jbml0aWF0ZWQsXG5cdFx0XHRcdFx0bWVzc2FnZS5zeXN0ZW1Jbml0aWF0ZWRMYWJlbCxcblx0XHRcdFx0XHR1bmRlZmluZWQsIC8vIHRlcm1pbmFsRXhlY3V0aW9uSWRcblx0XHRcdFx0XHRtZXNzYWdlLmlzVGVybWluYWxSZXF1ZXN0LFxuXHRcdFx0XHRcdG1lc3NhZ2UudGltZXN0YW1wID8/IG51bGwsXG5cdFx0XHRcdFx0bWVzc2FnZS5pc0hpZGRlbixcblx0XHRcdFx0XHRtZXNzYWdlLm9yaWdpbixcblx0XHRcdFx0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIHJlc3BvbnNlXG5cdFx0XHRcdGlmIChsYXN0UmVxdWVzdCkge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgcGFydCBvZiBtZXNzYWdlLnBhcnRzKSB7XG5cdFx0XHRcdFx0XHRtb2RlbC5hY2NlcHRSZXNwb25zZVByb2dyZXNzKGxhc3RSZXF1ZXN0LCBwYXJ0KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGxhc3RSZXF1ZXN0LnJlc3BvbnNlICYmIChtZXNzYWdlLmRldGFpbHMgfHwgbWVzc2FnZS5lcnJvckRldGFpbHMpKSB7XG5cdFx0XHRcdFx0XHRsYXN0UmVxdWVzdC5yZXNwb25zZS5zZXRSZXN1bHQoe1xuXHRcdFx0XHRcdFx0XHQuLi4obWVzc2FnZS5kZXRhaWxzID8geyBkZXRhaWxzOiBtZXNzYWdlLmRldGFpbHMgfSA6IHt9KSxcblx0XHRcdFx0XHRcdFx0Li4uKG1lc3NhZ2UuZXJyb3JEZXRhaWxzID8geyBlcnJvckRldGFpbHM6IG1lc3NhZ2UuZXJyb3JEZXRhaWxzIH0gOiB7fSksXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGxhc3RSZXF1ZXN0LnJlc3BvbnNlICYmIHR5cGVvZiBtZXNzYWdlLmVsYXBzZWRNcyA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRcdGxhc3RSZXF1ZXN0LnJlc3BvbnNlLnNldEVsYXBzZWRNcyhtZXNzYWdlLmVsYXBzZWRNcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGxhc3RSZXNwb25zZUNvbXBsZXRlZEF0ID0gbWVzc2FnZS5jb21wbGV0ZWRBdDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFNldCB1cCBwcm9ncmVzcyBzdHJlYW1pbmcgYW5kIGNhbmNlbGxhdGlvbiBmb3IgY29udHJpYnV0ZWQgc2Vzc2lvbnMuXG5cdFx0Ly8gVGhpcyBoYW5kbGVzIGJvdGggdGhlIGluaXRpYWwgaW4tZmxpZ2h0IHJlc3BvbnNlIChmcm9tIHNlc3Npb24gbG9hZClcblx0XHQvLyBhbmQgYW55IHN1YnNlcXVlbnQgc2VydmVyLWluaXRpYXRlZCB0dXJucyAoZS5nLiBjb25zdW1lZCBxdWV1ZWQgbWVzc2FnZXMpLlxuXHRcdGNvbnN0IGhhc1Byb2dyZXNzU3RyZWFtaW5nID0gcHJvdmlkZWRTZXNzaW9uLnByb2dyZXNzT2JzICYmIHByb3ZpZGVkU2Vzc2lvbi5pbnRlcnJ1cHRBY3RpdmVSZXNwb25zZUNhbGxiYWNrO1xuXHRcdGlmIChoYXNQcm9ncmVzc1N0cmVhbWluZykge1xuXHRcdFx0bGV0IGxhc3RQcm9ncmVzc0xlbmd0aCA9IDA7XG5cblx0XHRcdGNvbnN0IGNhbmNlbGxhdGlvbkxpc3RlbmVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblx0XHRcdGNvbnN0IGNyZWF0ZUNhbmNlbGxhdGlvbkxpc3RlbmVyID0gKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRcdHByb3ZpZGVkU2Vzc2lvbi5pbnRlcnJ1cHRBY3RpdmVSZXNwb25zZUNhbGxiYWNrPy4oKS50aGVuKHVzZXJDb25maXJtZWRJbnRlcnJ1cHRpb24gPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCF1c2VyQ29uZmlybWVkSW50ZXJydXB0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdHRyYWNrTmV3Q2FuY2VsbGFibGVSZXF1ZXN0KCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgdHJhY2tOZXdDYW5jZWxsYWJsZVJlcXVlc3QgPSAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNhbmNlbGxhYmxlUmVxdWVzdCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2FuY2VsbGFibGVSZXF1ZXN0LCBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMuX3N5bnRoZXRpY1BlbmRpbmdSZXF1ZXN0cy5hZGQoY2FuY2VsbGFibGVSZXF1ZXN0KTtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3RzLnNldChtb2RlbC5zZXNzaW9uUmVzb3VyY2UsIGNhbmNlbGxhYmxlUmVxdWVzdCk7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENoYXRQZW5kaW5nUmVxdWVzdENoYW5nZUV2ZW50LCBDaGF0UGVuZGluZ1JlcXVlc3RDaGFuZ2VDbGFzc2lmaWNhdGlvbj4oQ2hhdFBlbmRpbmdSZXF1ZXN0Q2hhbmdlRXZlbnROYW1lLCB7IGFjdGlvbjogJ2FkZCcsIHNvdXJjZTogJ3JlbW90ZVNlc3Npb24nLCBjaGF0U2Vzc2lvbklkOiBjaGF0U2Vzc2lvblJlc291cmNlVG9JZChtb2RlbC5zZXNzaW9uUmVzb3VyY2UpIH0pO1xuXHRcdFx0XHRjYW5jZWxsYXRpb25MaXN0ZW5lci52YWx1ZSA9IGNyZWF0ZUNhbmNlbGxhdGlvbkxpc3RlbmVyKGNhbmNlbGxhYmxlUmVxdWVzdC5jYW5jZWxsYXRpb25Ub2tlblNvdXJjZS50b2tlbik7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBlbnN1cmVDYW5jZWxsYXRpb25UcmFja2luZyA9ICgpID0+IHtcblx0XHRcdFx0aWYgKCF0aGlzLl9wZW5kaW5nUmVxdWVzdHMuaGFzKG1vZGVsLnNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdFx0XHR0cmFja05ld0NhbmNlbGxhYmxlUmVxdWVzdCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRpZiAobGFzdFJlcXVlc3QgJiYgIXByb3ZpZGVkU2Vzc2lvbi5pc0NvbXBsZXRlT2JzPy5nZXQoKSkge1xuXHRcdFx0XHR0cmFja05ld0NhbmNlbGxhYmxlUmVxdWVzdCgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBIYW5kbGUgc2VydmVyLWluaXRpYXRlZCByZXF1ZXN0cyAoZS5nLiBjb25zdW1lZCBxdWV1ZWQgbWVzc2FnZXMpLlxuXHRcdFx0aWYgKHByb3ZpZGVkU2Vzc2lvbi5vbkRpZFN0YXJ0U2VydmVyUmVxdWVzdCkge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZWRTZXNzaW9uLm9uRGlkU3RhcnRTZXJ2ZXJSZXF1ZXN0KCh7IGlkLCBwcm9tcHQsIHZhcmlhYmxlRGF0YSwgdGltZXN0YW1wLCBpc1N5c3RlbUluaXRpYXRlZCwgaXNIaWRkZW4sIHN5c3RlbUluaXRpYXRlZExhYmVsLCBpc1Rlcm1pbmFsUmVxdWVzdCwgb3JpZ2luIH0pID0+IHtcblx0XHRcdFx0XHQvLyBDb21wbGV0ZSBhbnkgaW4tZmxpZ2h0IHJlcXVlc3Rcblx0XHRcdFx0XHRpZiAobGFzdFJlcXVlc3Q/LnJlc3BvbnNlICYmICFsYXN0UmVxdWVzdC5yZXNwb25zZS5pc0NvbXBsZXRlKSB7XG5cdFx0XHRcdFx0XHRjb21wbGV0ZUxhc3RSZXNwb25zZSgpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIENyZWF0ZSBhIG5ldyByZXF1ZXN0IGluIHRoZSBtb2RlbFxuXHRcdFx0XHRcdGNvbnN0IGFnZW50ID0gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldEFnZW50KGNoYXRTZXNzaW9uVHlwZSk7XG5cdFx0XHRcdFx0Y29uc3QgcGFyc2VkUmVxdWVzdCA9IHBhcnNlQWdlbnRIb3N0SGlzdG9yeVByb21wdChwcm9tcHQsIGFnZW50KTtcblx0XHRcdFx0XHRsYXN0UmVxdWVzdCA9IG1vZGVsLmFkZFJlcXVlc3QocGFyc2VkUmVxdWVzdCxcblx0XHRcdFx0XHRcdHZhcmlhYmxlRGF0YSA/PyB7IHZhcmlhYmxlczogW10gfSxcblx0XHRcdFx0XHRcdDAsIC8vIGF0dGVtcHRcblx0XHRcdFx0XHRcdHVuZGVmaW5lZCwgLy8gbW9kZUluZm9cblx0XHRcdFx0XHRcdGFnZW50LFxuXHRcdFx0XHRcdFx0dW5kZWZpbmVkLCAvLyBzbGFzaENvbW1hbmRcblx0XHRcdFx0XHRcdHVuZGVmaW5lZCwgLy8gY29uZmlybWF0aW9uXG5cdFx0XHRcdFx0XHR1bmRlZmluZWQsIC8vIGxvY2F0aW9uRGF0YVxuXHRcdFx0XHRcdFx0dW5kZWZpbmVkLCAvLyBhdHRhY2htZW50c1xuXHRcdFx0XHRcdFx0dW5kZWZpbmVkLCAvLyBpc0NvbXBsZXRlQWRkZWRSZXF1ZXN0XG5cdFx0XHRcdFx0XHR1bmRlZmluZWQsIC8vIG1vZGVsSWRcblx0XHRcdFx0XHRcdHVuZGVmaW5lZCwgLy8gdXNlclNlbGVjdGVkVG9vbHNcblx0XHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdFx0aXNTeXN0ZW1Jbml0aWF0ZWQsXG5cdFx0XHRcdFx0XHRzeXN0ZW1Jbml0aWF0ZWRMYWJlbCxcblx0XHRcdFx0XHRcdHVuZGVmaW5lZCwgLy8gdGVybWluYWxFeGVjdXRpb25JZFxuXHRcdFx0XHRcdFx0aXNUZXJtaW5hbFJlcXVlc3QsXG5cdFx0XHRcdFx0XHR0aW1lc3RhbXAsXG5cdFx0XHRcdFx0XHRpc0hpZGRlbixcblx0XHRcdFx0XHRcdG9yaWdpbixcblx0XHRcdFx0XHQpO1xuXG5cdFx0XHRcdFx0Ly8gUmVzZXQgcHJvZ3Jlc3MgdHJhY2tpbmcgZm9yIHRoZSBuZXcgdHVyblxuXHRcdFx0XHRcdGxhc3RQcm9ncmVzc0xlbmd0aCA9IDA7XG5cblx0XHRcdFx0XHQvLyBFbnN1cmUgY2FuY2VsbGF0aW9uIHRyYWNraW5nIGlzIGFjdGl2ZVxuXHRcdFx0XHRcdGVuc3VyZUNhbmNlbGxhdGlvblRyYWNraW5nKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTWlkLXR1cm4gc3RlZXJpbmcgZm9yIHN0cmVhbWVkIHNlc3Npb25zOiBkaXNwYXRjaCBhIHF1ZXVlZCBTdGVlcmluZyBtZXNzYWdlIGltbWVkaWF0ZWx5XG5cdFx0XHQvLyAodGhlIHByb3ZpZGVyIFBPU1RzIGl0IHNlcnZlci1zaWRlKSByYXRoZXIgdGhhbiB3YWl0aW5nIGZvciB0aGUgdHVybiB0byBjb21wbGV0ZSwgYnV0IG9ubHlcblx0XHRcdC8vIHdoZW4gdGhlIGluLWZsaWdodCByZXF1ZXN0IGlzIHRoZSBzeW50aGV0aWMgc3RyZWFtZWQtdHVybiB0cmFja2VyIChvciBub25lKSwgbmV2ZXIgYSByZWFsXG5cdFx0XHQvLyByZXF1ZXN0LiBTZXJ2ZXItbWFuYWdlZCAoYWdlbnQtaG9zdCkgcXVldWVzIGFyZSBkcmFpbmVkIGJ5IHRoZSBzZXJ2ZXIsIHNvIHRoZXkncmUgZXhjbHVkZWQuXG5cdFx0XHRpZiAoIXRoaXMuX2lzU2VydmVyTWFuYWdlZFF1ZXVlKG1vZGVsLnNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdFx0bGV0IGRpc3BhdGNoaW5nSW1tZWRpYXRlU3RlZXIgPSBmYWxzZTtcblx0XHRcdFx0Y29uc3QgY2FuSW1tZWRpYXRlbHlEaXNwYXRjaCA9ICgpID0+IHtcblx0XHRcdFx0XHRpZiAoIW1vZGVsLmdldFBlbmRpbmdSZXF1ZXN0cygpLnNvbWUociA9PiByLmtpbmQgPT09IENoYXRSZXF1ZXN0UXVldWVLaW5kLlN0ZWVyaW5nKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBwZW5kaW5nID0gdGhpcy5fcGVuZGluZ1JlcXVlc3RzLmdldChtb2RlbC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRcdHJldHVybiAhcGVuZGluZyB8fCB0aGlzLl9zeW50aGV0aWNQZW5kaW5nUmVxdWVzdHMuaGFzKHBlbmRpbmcpO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQobW9kZWwub25EaWRDaGFuZ2VQZW5kaW5nUmVxdWVzdHMoKCkgPT4ge1xuXHRcdFx0XHRcdGlmIChkaXNwYXRjaGluZ0ltbWVkaWF0ZVN0ZWVyIHx8ICFjYW5JbW1lZGlhdGVseURpc3BhdGNoKCkpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZGlzcGF0Y2hpbmdJbW1lZGlhdGVTdGVlciA9IHRydWU7XG5cdFx0XHRcdFx0Ly8gRGVmZXIgcGFzdCB0aGUgaW4tcHJvZ3Jlc3MgYWRkUGVuZGluZ1JlcXVlc3QgbXV0YXRpb24gdG8gYXZvaWQgcmUtZW50cmFuY3kuXG5cdFx0XHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0XHRcdFx0ZGlzcGF0Y2hpbmdJbW1lZGlhdGVTdGVlciA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX3Nlc3Npb25Nb2RlbHMuZ2V0KG1vZGVsLnNlc3Npb25SZXNvdXJjZSkgIT09IG1vZGVsIHx8ICFjYW5JbW1lZGlhdGVseURpc3BhdGNoKCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Ly8gUmVsZWFzZSB0aGUgc3ludGhldGljIHRyYWNrZXIgc28gdGhlIHF1ZXVlIHByb2Nlc3NvciBjYW4gcnVuLCB0aGVuIGRpc3BhdGNoLlxuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5oYXMobW9kZWwuc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZGVsZXRlQW5kRGlzcG9zZShtb2RlbC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0dGhpcy5wcm9jZXNzTmV4dFBlbmRpbmdSZXF1ZXN0KG1vZGVsKTtcblx0XHRcdFx0XHRcdC8vIFJlc3RvcmUgdHJhY2tpbmcgd2hlbiB0aGUgZGlzcGF0Y2hlZCByZXF1ZXN0IHNldHRsZXMgKHN0cmVhbSBzdGlsbCBhY3RpdmUpLlxuXHRcdFx0XHRcdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3RzLmdldChtb2RlbC5zZXNzaW9uUmVzb3VyY2UpPy5yZXNwb25zZUNvbXBsZXRlUHJvbWlzZT8uZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmICh0aGlzLl9zZXNzaW9uTW9kZWxzLmdldChtb2RlbC5zZXNzaW9uUmVzb3VyY2UpID09PSBtb2RlbCAmJiAhKHByb3ZpZGVkU2Vzc2lvbi5pc0NvbXBsZXRlT2JzPy5nZXQoKSA/PyBmYWxzZSkpIHtcblx0XHRcdFx0XHRcdFx0XHRlbnN1cmVDYW5jZWxsYXRpb25UcmFja2luZygpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTaW5nbGUgYXV0b3J1biB0aGF0IHN0cmVhbXMgcHJvZ3Jlc3MgZm9yIHdoaWNoZXZlciByZXF1ZXN0IGlzIGN1cnJlbnQuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBwcm9ncmVzc0FycmF5ID0gcHJvdmlkZWRTZXNzaW9uLnByb2dyZXNzT2JzPy5yZWFkKHJlYWRlcikgPz8gW107XG5cdFx0XHRcdGNvbnN0IGlzQ29tcGxldGUgPSBwcm92aWRlZFNlc3Npb24uaXNDb21wbGV0ZU9icz8ucmVhZChyZWFkZXIpID8/IGZhbHNlO1xuXG5cdFx0XHRcdC8vIEJhY2tzdG9wOiBrZWVwIHRoZSBzdHJlYW1lZCB0dXJuIHRyYWNrZWQgYXMgaW4tcHJvZ3Jlc3MgYWNyb3NzIGltbWVkaWF0ZS1zdGVlciBkaXNwYXRjaGVzLlxuXHRcdFx0XHRpZiAoIWlzQ29tcGxldGUpIHtcblx0XHRcdFx0XHRlbnN1cmVDYW5jZWxsYXRpb25UcmFja2luZygpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUHJvY2VzcyBvbmx5IG5ldyBwcm9ncmVzcyBpdGVtc1xuXHRcdFx0XHRpZiAobGFzdFJlcXVlc3QgJiYgcHJvZ3Jlc3NBcnJheS5sZW5ndGggPiBsYXN0UHJvZ3Jlc3NMZW5ndGgpIHtcblx0XHRcdFx0XHRjb25zdCBuZXdQcm9ncmVzcyA9IHByb2dyZXNzQXJyYXkuc2xpY2UobGFzdFByb2dyZXNzTGVuZ3RoKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHByb2dyZXNzIG9mIG5ld1Byb2dyZXNzKSB7XG5cdFx0XHRcdFx0XHRtb2RlbD8uYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhsYXN0UmVxdWVzdCwgcHJvZ3Jlc3MpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsYXN0UHJvZ3Jlc3NMZW5ndGggPSBwcm9ncmVzc0FycmF5Lmxlbmd0aDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEhhbmRsZSBjb21wbGV0aW9uXG5cdFx0XHRcdGlmIChpc0NvbXBsZXRlICYmIGxhc3RSZXF1ZXN0KSB7XG5cdFx0XHRcdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3RzLmRlbGV0ZUFuZERpc3Bvc2UobW9kZWwuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdFx0XHRjYW5jZWxsYXRpb25MaXN0ZW5lci5jbGVhcigpO1xuXHRcdFx0XHRcdGNvbXBsZXRlTGFzdFJlc3BvbnNlKCk7XG5cdFx0XHRcdFx0Ly8gRmx1c2ggYW55IG1lc3NhZ2UgcXVldWVkL3N0ZWVyZWQgZHVyaW5nIHRoZSBzdHJlYW1lZCB0dXJuIChuby1vcCBpZiBub25lLCBvciBzZXJ2ZXItbWFuYWdlZCkuXG5cdFx0XHRcdFx0dGhpcy5wcm9jZXNzUGVuZGluZ1JlcXVlc3RzKG1vZGVsLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHByb3ZpZGVkU2Vzc2lvbi5pc0NvbXBsZXRlT2JzPy5nZXQoKSkge1xuXHRcdFx0XHRjb21wbGV0ZUxhc3RSZXNwb25zZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0UGVuZGluZ1JlcXVlc3RDaGFuZ2VFdmVudCwgQ2hhdFBlbmRpbmdSZXF1ZXN0Q2hhbmdlQ2xhc3NpZmljYXRpb24+KENoYXRQZW5kaW5nUmVxdWVzdENoYW5nZUV2ZW50TmFtZSwgeyBhY3Rpb246ICdub3RDYW5jZWxhYmxlJywgc291cmNlOiAncmVtb3RlU2Vzc2lvbicsIGNoYXRTZXNzaW9uSWQ6IGNoYXRTZXNzaW9uUmVzb3VyY2VUb0lkKG1vZGVsLnNlc3Npb25SZXNvdXJjZSkgfSk7XG5cdFx0XHRpZiAobGFzdFJlcXVlc3QgJiYgbW9kZWwuZWRpdGluZ1Nlc3Npb24pIHtcblx0XHRcdFx0Ly8gd2FpdCBmb3IgdGltZWxpbmUgdG8gbG9hZCBzbyB0aGF0IGEgJ2NoYW5nZXMnIHBhcnQgaXMgYWRkZWQgd2hlbiB0aGUgcmVzcG9uc2UgY29tcGxldGVzXG5cdFx0XHRcdGF3YWl0IGNoYXRFZGl0aW5nU2Vzc2lvbklzUmVhZHkobW9kZWwuZWRpdGluZ1Nlc3Npb24pO1xuXHRcdFx0XHRjb21wbGV0ZUxhc3RSZXNwb25zZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBtb2RlbFJlZjtcblx0fVxuXG5cdGFzeW5jIHJlc2VuZFJlcXVlc3QocmVxdWVzdDogSUNoYXRSZXF1ZXN0TW9kZWwsIG9wdGlvbnM/OiBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fc2Vzc2lvbk1vZGVscy5nZXQocmVxdWVzdC5zZXNzaW9uLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFtb2RlbCAmJiBtb2RlbCAhPT0gcmVxdWVzdC5zZXNzaW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gc2Vzc2lvbjogJHtyZXF1ZXN0LnNlc3Npb24uc2Vzc2lvblJlc291cmNlfWApO1xuXHRcdH1cblx0XHRpZiAobW9kZWwuaXNSZWFkT25seS5nZXQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN0cyA9IHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5nZXQocmVxdWVzdC5zZXNzaW9uLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKGN0cykge1xuXHRcdFx0dGhpcy50cmFjZSgncmVzZW5kUmVxdWVzdCcsIGBTZXNzaW9uICR7cmVxdWVzdC5zZXNzaW9uLnNlc3Npb25SZXNvdXJjZX0gYWxyZWFkeSBoYXMgYSBwZW5kaW5nIHJlcXVlc3QsIGNhbmNlbGxpbmcuLi5gKTtcblx0XHRcdGN0cy5jYW5jZWwoKTtcblx0XHR9XG5cblx0XHRjb25zdCBsb2NhdGlvbiA9IG9wdGlvbnM/LmxvY2F0aW9uID8/IG1vZGVsLmluaXRpYWxMb2NhdGlvbjtcblx0XHRjb25zdCBhdHRlbXB0ID0gb3B0aW9ucz8uYXR0ZW1wdCA/PyAwO1xuXHRcdGNvbnN0IGVuYWJsZUNvbW1hbmREZXRlY3Rpb24gPSAhb3B0aW9ucz8ubm9Db21tYW5kRGV0ZWN0aW9uO1xuXHRcdGNvbnN0IGRlZmF1bHRBZ2VudCA9IHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXREZWZhdWx0QWdlbnQobG9jYXRpb24sIG9wdGlvbnM/Lm1vZGVJbmZvPy5raW5kKSE7XG5cblx0XHRtb2RlbC5yZW1vdmVSZXF1ZXN0KHJlcXVlc3QuaWQsIENoYXRSZXF1ZXN0UmVtb3ZhbFJlYXNvbi5SZXNlbmQpO1xuXG5cdFx0Y29uc3QgcmVzZW5kT3B0aW9uczogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMgPSB7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0bG9jYXRpb25EYXRhOiByZXF1ZXN0LmxvY2F0aW9uRGF0YSxcblx0XHRcdGF0dGFjaGVkQ29udGV4dDogcmVxdWVzdC5hdHRhY2hlZENvbnRleHQsXG5cdFx0fTtcblx0XHRhd2FpdCB0aGlzLl9zZW5kUmVxdWVzdEFzeW5jKG1vZGVsLCBtb2RlbC5zZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3QubWVzc2FnZSwgYXR0ZW1wdCwgZW5hYmxlQ29tbWFuZERldGVjdGlvbiwgZGVmYXVsdEFnZW50LCBsb2NhdGlvbiwgcmVzZW5kT3B0aW9ucykucmVzcG9uc2VDb21wbGV0ZVByb21pc2U7XG5cdH1cblxuXHRwcml2YXRlIHF1ZXVlUGVuZGluZ1JlcXVlc3QobW9kZWw6IENoYXRNb2RlbCwgc2Vzc2lvblJlc291cmNlOiBVUkksIHJlcXVlc3Q6IHN0cmluZywgb3B0aW9uczogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMpOiBDaGF0U2VuZFJlc3VsdFF1ZXVlZCB7XG5cdFx0Y29uc3QgbG9jYXRpb24gPSBvcHRpb25zLmxvY2F0aW9uID8/IG1vZGVsLmluaXRpYWxMb2NhdGlvbjtcblx0XHRjb25zdCBwYXJzZWRSZXF1ZXN0ID0gdGhpcy5wYXJzZUNoYXRSZXF1ZXN0KHNlc3Npb25SZXNvdXJjZSwgcmVxdWVzdCwgbG9jYXRpb24sIG9wdGlvbnMpO1xuXHRcdGNvbnN0IHJlcXVlc3RNb2RlbCA9IG5ldyBDaGF0UmVxdWVzdE1vZGVsKHtcblx0XHRcdHNlc3Npb246IG1vZGVsLFxuXHRcdFx0bWVzc2FnZTogcGFyc2VkUmVxdWVzdCxcblx0XHRcdHZhcmlhYmxlRGF0YTogeyB2YXJpYWJsZXM6IG9wdGlvbnMuYXR0YWNoZWRDb250ZXh0ID8/IFtdIH0sXG5cdFx0XHR0aW1lc3RhbXA6IERhdGUubm93KCksXG5cdFx0XHRtb2RlSW5mbzogb3B0aW9ucy5tb2RlSW5mbyxcblx0XHRcdGxvY2F0aW9uRGF0YTogb3B0aW9ucy5sb2NhdGlvbkRhdGEsXG5cdFx0XHRhdHRhY2hlZENvbnRleHQ6IG9wdGlvbnMuYXR0YWNoZWRDb250ZXh0LFxuXHRcdFx0bW9kZWxJZDogb3B0aW9ucy51c2VyU2VsZWN0ZWRNb2RlbElkLFxuXHRcdFx0dXNlclNlbGVjdGVkVG9vbHM6IG9wdGlvbnMudXNlclNlbGVjdGVkVG9vbHM/LmdldCgpLFxuXHRcdFx0aXNTeXN0ZW1Jbml0aWF0ZWQ6IG9wdGlvbnMuaXNTeXN0ZW1Jbml0aWF0ZWQsXG5cdFx0XHRpc0hpZGRlbkZyb21UcmFuc2NyaXB0OiBvcHRpb25zLmhpZGVGcm9tVHJhbnNjcmlwdCxcblx0XHRcdHN5c3RlbUluaXRpYXRlZExhYmVsOiBvcHRpb25zLnN5c3RlbUluaXRpYXRlZExhYmVsLFxuXHRcdFx0dGVybWluYWxFeGVjdXRpb25JZDogb3B0aW9ucy50ZXJtaW5hbEV4ZWN1dGlvbklkLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPENoYXRTZW5kUmVzdWx0PigpO1xuXHRcdHRoaXMuX3F1ZXVlZFJlcXVlc3REZWZlcnJlZHMuc2V0KHJlcXVlc3RNb2RlbC5pZCwgZGVmZXJyZWQpO1xuXG5cdFx0bW9kZWwuYWRkUGVuZGluZ1JlcXVlc3QocmVxdWVzdE1vZGVsLCBvcHRpb25zLnF1ZXVlID8/IENoYXRSZXF1ZXN0UXVldWVLaW5kLlF1ZXVlZCwgeyAuLi5vcHRpb25zLCBxdWV1ZTogdW5kZWZpbmVkIH0pO1xuXG5cdFx0aWYgKG9wdGlvbnMucXVldWUgPT09IENoYXRSZXF1ZXN0UXVldWVLaW5kLlN0ZWVyaW5nKSB7XG5cdFx0XHR0aGlzLnNldFlpZWxkUmVxdWVzdGVkKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy50cmFjZSgnc2VuZFJlcXVlc3QnLCBgUXVldWVkIG1lc3NhZ2UgZm9yIHNlc3Npb24gJHtzZXNzaW9uUmVzb3VyY2V9YCk7XG5cdFx0cmV0dXJuIHsga2luZDogJ3F1ZXVlZCcsIHJlcXVlc3RJZDogcmVxdWVzdE1vZGVsLmlkLCBkZWZlcnJlZDogZGVmZXJyZWQucCB9O1xuXHR9XG5cblx0YXN5bmMgc2VuZFJlcXVlc3Qoc2Vzc2lvblJlc291cmNlOiBVUkksIHJlcXVlc3Q6IHN0cmluZywgb3B0aW9ucz86IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxDaGF0U2VuZFJlc3VsdD4ge1xuXHRcdHRoaXMudHJhY2UoJ3NlbmRSZXF1ZXN0JywgYHNlc3Npb25SZXNvdXJjZTogJHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX0sIG1lc3NhZ2U6ICR7cmVxdWVzdC5zdWJzdHJpbmcoMCwgMjApfSR7cmVxdWVzdC5sZW5ndGggPiAyMCA/ICdbLi4uXScgOiAnJ319YCk7XG5cblx0XHRjb25zdCBoYXNFeHBsaWNpdEZpbGVPckltYWdlQXR0YWNobWVudCA9IFsuLi4ob3B0aW9ucz8uYXR0YWNoZWRDb250ZXh0ID8/IFtdKSwgLi4uKG9wdGlvbnM/LnJlc29sdmVkVmFyaWFibGVzID8/IFtdKV0uc29tZShpc0V4cGxpY2l0RmlsZU9ySW1hZ2VWYXJpYWJsZUVudHJ5KTtcblx0XHRpZiAoIXJlcXVlc3QudHJpbSgpICYmICFoYXNFeHBsaWNpdEZpbGVPckltYWdlQXR0YWNobWVudCAmJiAhb3B0aW9ucz8uc2xhc2hDb21tYW5kICYmICFvcHRpb25zPy5hZ2VudElkICYmICFvcHRpb25zPy5hZ2VudElkU2lsZW50KSB7XG5cdFx0XHR0aGlzLnRyYWNlKCdzZW5kUmVxdWVzdCcsICdSZWplY3RlZCBlbXB0eSBtZXNzYWdlJyk7XG5cdFx0XHRyZXR1cm4geyBraW5kOiAncmVqZWN0ZWQnLCByZWFzb246ICdFbXB0eSBtZXNzYWdlJyB9O1xuXHRcdH1cblxuXHRcdGxldCBuZXdTZXNzaW9uUmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblxuXHRcdC8vIEEgbGF0ZSBzZW5kIG1heSBhcnJpdmUgb24gYSBzdGFsZSB1bnRpdGxlZCByZXNvdXJjZSBhZnRlciBpdCBhbHJlYWR5XG5cdFx0Ly8gbWF0ZXJpYWxpemVkIGludG8gYSByZWFsIHNlc3Npb24gYnV0IGJlZm9yZSB0aGUgVUkgc3dhcHBlZCB0byB0aGUgcmVhbFxuXHRcdC8vIHJlc291cmNlLiBSZS10YXJnZXQgdG8gdGhlIHJlYWwgcmVzb3VyY2Ugc28gd2UgZG9uJ3QgbWF0ZXJpYWxpemUgYVxuXHRcdC8vIHNlY29uZCBzZXNzaW9uLCBhbmQgcmVwb3J0IGl0IGFzIGEgbmV3IHNlc3Npb24gc28gdGhlIGNhbGxlciBzd2FwcyBpdHNcblx0XHQvLyBVSSBmcm9tIHRoZSB1bnRpdGxlZCByZXNvdXJjZSB0byB0aGUgcmVhbCBvbmUgKG1pcnJvcmluZyB0aGUgZmlyc3Qgc2VuZCkuXG5cdFx0Y29uc3QgbWF0ZXJpYWxpemVkUmVhbCA9IHRoaXMuY2hhdFNlc3Npb25TZXJ2aWNlLmdldE1hdGVyaWFsaXplZFNlc3Npb25SZXNvdXJjZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmIChtYXRlcmlhbGl6ZWRSZWFsKSB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2UgPSBtYXRlcmlhbGl6ZWRSZWFsO1xuXHRcdFx0bmV3U2Vzc2lvblJlc291cmNlID0gbWF0ZXJpYWxpemVkUmVhbDtcblx0XHR9XG5cblx0XHRsZXQgbW9kZWwgPSB0aGlzLl9zZXNzaW9uTW9kZWxzLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biBzZXNzaW9uOiAke3Nlc3Npb25SZXNvdXJjZX1gKTtcblx0XHR9XG5cdFx0aWYgKG1vZGVsLmlzUmVhZE9ubHkuZ2V0KCkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6ICdyZWplY3RlZCcsXG5cdFx0XHRcdHJlYXNvbjogJ1Nlc3Npb24gaXMgcmVhZC1vbmx5Jyxcblx0XHRcdFx0Li4uKG5ld1Nlc3Npb25SZXNvdXJjZSA/IHsgbmV3U2Vzc2lvblJlc291cmNlIH0gOiB7fSksXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIEludGVybmFsbHkgYmxhbmsgd2lkZ2V0cyB1c2Ugc3BlY2lhbCBzZXNzaW9ucyB3aXRoIGFuIHVudGl0bGVkLSBwYXRoLlxuXHRcdC8vIFdlIGRvIG5vdCB3YW50IHRoZXNlIGxlYWtpbmcgb3V0IHRvIHRoZSByZXN0IG9mIGNvZGUuIE9uIHRoZSBmaXJzdFxuXHRcdC8vIHNlbmQsIGNvbnZlcnQgdGhlIHVudGl0bGVkIHNlc3Npb24gaW50byBhIHJlYWwgc2Vzc2lvbiAoaWRlbXBvdGVudFxuXHRcdC8vIGFuZCBzZXJpYWxpemVkIHBlciB1bnRpdGxlZCByZXNvdXJjZSBcdTIwMTQgc2VlXG5cdFx0Ly8gYF9tYXRlcmlhbGl6ZVVudGl0bGVkU2Vzc2lvbmApIGJlZm9yZSBwcm9jZXNzaW5nIHRoZSByZXF1ZXN0LlxuXHRcdGlmICghbW9kZWwuaGFzUmVxdWVzdHMgJiYgaXNVbnRpdGxlZENoYXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSkgJiYgZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSkgIT09IGxvY2FsQ2hhdFNlc3Npb25UeXBlKSB7XG5cdFx0XHRjb25zdCBtYXRlcmlhbGl6ZWQgPSBhd2FpdCB0aGlzLl9tYXRlcmlhbGl6ZVVudGl0bGVkU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3QsIG9wdGlvbnMsIG1vZGVsKTtcblx0XHRcdGlmIChtYXRlcmlhbGl6ZWQpIHtcblx0XHRcdFx0bW9kZWwgPSBtYXRlcmlhbGl6ZWQubW9kZWw7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZSA9IG1hdGVyaWFsaXplZC5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHRcdG5ld1Nlc3Npb25SZXNvdXJjZSA9IG1hdGVyaWFsaXplZC5uZXdTZXNzaW9uUmVzb3VyY2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChtb2RlbC5pc1JlYWRPbmx5LmdldCgpKSB7XG5cdFx0XHRyZXR1cm4geyBraW5kOiAncmVqZWN0ZWQnLCByZWFzb246ICdTZXNzaW9uIGlzIHJlYWQtb25seScsIG5ld1Nlc3Npb25SZXNvdXJjZSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc1BlbmRpbmdSZXF1ZXN0ID0gdGhpcy5fcGVuZGluZ1JlcXVlc3RzLmhhcyhzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0aWYgKG9wdGlvbnM/LnF1ZXVlKSB7XG5cdFx0XHRjb25zdCBxdWV1ZWQgPSB0aGlzLnF1ZXVlUGVuZGluZ1JlcXVlc3QobW9kZWwsIHNlc3Npb25SZXNvdXJjZSwgcmVxdWVzdCwgb3B0aW9ucyk7XG5cdFx0XHRpZiAoIW9wdGlvbnMucGF1c2VRdWV1ZSkge1xuXHRcdFx0XHR0aGlzLnByb2Nlc3NQZW5kaW5nUmVxdWVzdHMoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBxdWV1ZWQ7XG5cdFx0fSBlbHNlIGlmIChoYXNQZW5kaW5nUmVxdWVzdCkge1xuXHRcdFx0dGhpcy50cmFjZSgnc2VuZFJlcXVlc3QnLCBgU2Vzc2lvbiAke3Nlc3Npb25SZXNvdXJjZX0gYWxyZWFkeSBoYXMgYSBwZW5kaW5nIHJlcXVlc3RgKTtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICdyZWplY3RlZCcsIHJlYXNvbjogJ1JlcXVlc3QgYWxyZWFkeSBpbiBwcm9ncmVzcycgfTtcblx0XHR9XG5cblx0XHRjb25zdCByZXF1ZXN0cyA9IG1vZGVsLmdldFJlcXVlc3RzKCk7XG5cdFx0Zm9yIChsZXQgaSA9IHJlcXVlc3RzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaSAtPSAxKSB7XG5cdFx0XHRjb25zdCByZXF1ZXN0ID0gcmVxdWVzdHNbaV07XG5cdFx0XHRpZiAocmVxdWVzdC5zaG91bGRCZVJlbW92ZWRPblNlbmQpIHtcblx0XHRcdFx0aWYgKHJlcXVlc3Quc2hvdWxkQmVSZW1vdmVkT25TZW5kLmFmdGVyVW5kb1N0b3ApIHtcblx0XHRcdFx0XHRyZXF1ZXN0LnJlc3BvbnNlPy5maW5hbGl6ZVVuZG9TdGF0ZSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucmVtb3ZlUmVxdWVzdChzZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3QuaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgbG9jYXRpb24gPSBvcHRpb25zPy5sb2NhdGlvbiA/PyBtb2RlbC5pbml0aWFsTG9jYXRpb247XG5cdFx0Y29uc3QgYXR0ZW1wdCA9IG9wdGlvbnM/LmF0dGVtcHQgPz8gMDtcblx0XHRjb25zdCBkZWZhdWx0QWdlbnQgPSB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0RGVmYXVsdEFnZW50KGxvY2F0aW9uLCBvcHRpb25zPy5tb2RlSW5mbz8ua2luZCk7XG5cdFx0aWYgKCFkZWZhdWx0QWdlbnQpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdzZW5kUmVxdWVzdCcsIGBObyBkZWZhdWx0IGFnZW50IGZvciBsb2NhdGlvbiAke2xvY2F0aW9ufWApO1xuXHRcdFx0cmV0dXJuIHsga2luZDogJ3JlamVjdGVkJywgcmVhc29uOiAnTm8gZGVmYXVsdCBhZ2VudCBhdmFpbGFibGUnIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFyc2VkUmVxdWVzdCA9IHRoaXMucGFyc2VDaGF0UmVxdWVzdChzZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3QsIGxvY2F0aW9uLCBvcHRpb25zKTtcblx0XHRjb25zdCBzaWxlbnRBZ2VudCA9IG9wdGlvbnM/LmFnZW50SWRTaWxlbnQgPyB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0QWdlbnQob3B0aW9ucy5hZ2VudElkU2lsZW50KSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBhZ2VudCA9IHNpbGVudEFnZW50ID8/IHBhcnNlZFJlcXVlc3QucGFydHMuZmluZCgocik6IHIgaXMgQ2hhdFJlcXVlc3RBZ2VudFBhcnQgPT4gciBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0QWdlbnRQYXJ0KT8uYWdlbnQgPz8gZGVmYXVsdEFnZW50O1xuXHRcdGNvbnN0IGFnZW50U2xhc2hDb21tYW5kUGFydCA9IHBhcnNlZFJlcXVlc3QucGFydHMuZmluZCgocik6IHIgaXMgQ2hhdFJlcXVlc3RBZ2VudFN1YmNvbW1hbmRQYXJ0ID0+IHIgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdEFnZW50U3ViY29tbWFuZFBhcnQpO1xuXG5cdFx0Ly8gVGhpcyBtZXRob2QgaXMgb25seSByZXR1cm5pbmcgd2hldGhlciB0aGUgcmVxdWVzdCB3YXMgYWNjZXB0ZWQgLSBkb24ndCBibG9jayBvbiB0aGUgYWN0dWFsIHJlcXVlc3Rcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ3NlbnQnLFxuXHRcdFx0bmV3U2Vzc2lvblJlc291cmNlLFxuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHQuLi50aGlzLl9zZW5kUmVxdWVzdEFzeW5jKG1vZGVsLCBzZXNzaW9uUmVzb3VyY2UsIHBhcnNlZFJlcXVlc3QsIGF0dGVtcHQsICFvcHRpb25zPy5ub0NvbW1hbmREZXRlY3Rpb24sIHNpbGVudEFnZW50ID8/IGRlZmF1bHRBZ2VudCwgbG9jYXRpb24sIG9wdGlvbnMpLFxuXHRcdFx0XHRhZ2VudCxcblx0XHRcdFx0c2xhc2hDb21tYW5kOiBhZ2VudFNsYXNoQ29tbWFuZFBhcnQ/LmNvbW1hbmQsXG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogQ29udmVydHMgYW4gdW50aXRsZWQgY29udHJpYnV0ZWQgY2hhdCBzZXNzaW9uIGludG8gaXRzIHJlYWwgc2Vzc2lvbiBvbiB0aGVcblx0ICogZmlyc3Qgc2VuZCBhbmQgcmV0dXJucyB0aGUgcmVhbCBtb2RlbC9yZXNvdXJjZSBzbyB0aGUgY2FsbGVyIGNhbiByZS10YXJnZXRcblx0ICogdGhlIHJlcXVlc3QuIFNlcmlhbGl6ZWQgcGVyIHVudGl0bGVkIHJlc291cmNlOiBhIGZpcnN0IHNlbmQgc3RvcmVzIGFuXG5cdCAqIGluLWZsaWdodCBwcm9taXNlLCBhbmQgYSBjb25jdXJyZW50IHNlY29uZCBzZW5kIGF3YWl0cyBpdCBhbmQgY29udmVyZ2VzIG9uXG5cdCAqIHRoZSBzYW1lIHJlYWwgc2Vzc2lvbiAod2hlcmUgdGhlIGNhbGxlcidzIHBlbmRpbmctcmVxdWVzdCBjaGVjayB0aGVuIHJlamVjdHNcblx0ICogdGhlIGR1cGxpY2F0ZSkgaW5zdGVhZCBvZiBtaW50aW5nIGEgc2Vjb25kIHJlYWwgc2Vzc2lvbi5cblx0ICpcblx0ICogUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIG5vIGNvbnZlcnNpb24gaGFwcGVuZWQgXHUyMDE0IGVpdGhlciB0aGVyZSBpcyBub1xuXHQgKiBgbmV3Q2hhdFNlc3Npb25JdGVtYCBoYW5kbGVyIC8gdGhlIGhhbmRsZXIgZGVjbGluZWQsIG9yIGEgY29uY3VycmVudFxuXHQgKiBtYXRlcmlhbGl6YXRpb24gZmFpbGVkIFx1MjAxNCBpbiB3aGljaCBjYXNlIHRoZSBjYWxsZXIga2VlcHMgdXNpbmcgdGhlIHVudGl0bGVkXG5cdCAqIHNlc3Npb24gKHRoZSBvcmlnaW5hbCBiZWhhdmlvcikuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9tYXRlcmlhbGl6ZVVudGl0bGVkU2Vzc2lvbih1bnRpdGxlZFJlc291cmNlOiBVUkksIHJlcXVlc3Q6IHN0cmluZywgb3B0aW9uczogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMgfCB1bmRlZmluZWQsIHVudGl0bGVkTW9kZWw6IENoYXRNb2RlbCk6IFByb21pc2U8eyBtb2RlbDogQ2hhdE1vZGVsOyBzZXNzaW9uUmVzb3VyY2U6IFVSSTsgbmV3U2Vzc2lvblJlc291cmNlOiBVUkkgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGluRmxpZ2h0ID0gdGhpcy5faW5GbGlnaHRVbnRpdGxlZE1hdGVyaWFsaXphdGlvbnMuZ2V0KHVudGl0bGVkUmVzb3VyY2UpO1xuXHRcdGlmIChpbkZsaWdodCkge1xuXHRcdFx0Ly8gQSBjb25jdXJyZW50IHNlbmQgaXMgYWxyZWFkeSBtYXRlcmlhbGl6aW5nIHRoaXMgdW50aXRsZWQgc2Vzc2lvbi5cblx0XHRcdC8vIEF3YWl0IGl0cyByZXN1bHQgYW5kIHJlLXRhcmdldCB0aGUgcmVzdWx0aW5nIHJlYWwgcmVzb3VyY2UgaW5zdGVhZCBvZlxuXHRcdFx0Ly8gbWludGluZyBhIHNlY29uZCByZWFsIHNlc3Npb24uXG5cdFx0XHRjb25zdCByZWFsUmVzb3VyY2UgPSBhd2FpdCBpbkZsaWdodDtcblx0XHRcdGlmICghcmVhbFJlc291cmNlKSB7XG5cdFx0XHRcdHRoaXMudHJhY2UoJ21hdGVyaWFsaXplVW50aXRsZWRTZXNzaW9uJywgYEluLWZsaWdodCBtYXRlcmlhbGl6YXRpb24gb2YgJHt1bnRpdGxlZFJlc291cmNlLnRvU3RyaW5nKCl9IHByb2R1Y2VkIG5vIHJlYWwgc2Vzc2lvbjsga2VlcGluZyB1bnRpdGxlZGApO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVGhlIHdpbm5lciBoYXMgYWxyZWFkeSBsb2FkZWQgdGhlIHJlYWwgbW9kZWwgYW5kIHJldGFpbnMgYSByZWZlcmVuY2Vcblx0XHRcdC8vIHRvIGl0LCBzbyBsb29rIGl0IHVwIHdpdGhvdXQgYWNxdWlyaW5nIChhbmQgbGVha2luZykgYW4gYWRkaXRpb25hbFxuXHRcdFx0Ly8gcmVmZXJlbmNlIHBlciBjb25jdXJyZW50IHNlbmQuXG5cdFx0XHRjb25zdCByZWFsTW9kZWwgPSB0aGlzLl9zZXNzaW9uTW9kZWxzLmdldChyZWFsUmVzb3VyY2UpO1xuXHRcdFx0aWYgKCFyZWFsTW9kZWwpIHtcblx0XHRcdFx0dGhpcy5pbmZvKCdtYXRlcmlhbGl6ZVVudGl0bGVkU2Vzc2lvbicsIGBKb2luZWQgaW4tZmxpZ2h0IG1hdGVyaWFsaXphdGlvbiBvZiAke3VudGl0bGVkUmVzb3VyY2UudG9TdHJpbmcoKX0gYnV0IHJlYWwgbW9kZWwgJHtyZWFsUmVzb3VyY2UudG9TdHJpbmcoKX0gaXMgbWlzc2luZzsga2VlcGluZyB1bnRpdGxlZGApO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy50cmFjZSgnbWF0ZXJpYWxpemVVbnRpdGxlZFNlc3Npb24nLCBgQ29uY3VycmVudCBzZW5kIGpvaW5lZCBpbi1mbGlnaHQgbWF0ZXJpYWxpemF0aW9uICR7dW50aXRsZWRSZXNvdXJjZS50b1N0cmluZygpfSAtPiAke3JlYWxSZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdFx0cmV0dXJuIHsgbW9kZWw6IHJlYWxNb2RlbCwgc2Vzc2lvblJlc291cmNlOiByZWFsUmVzb3VyY2UsIG5ld1Nlc3Npb25SZXNvdXJjZTogcmVhbFJlc291cmNlIH07XG5cdFx0fVxuXG5cdFx0Ly8gVHJhY2sgdGhlIG1hdGVyaWFsaXphdGlvbiBpbi1mbGlnaHQgKGtleWVkIGJ5IHRoZSBvcmlnaW5hbCB1bnRpdGxlZFxuXHRcdC8vIHJlc291cmNlKSBzbyBhIGNvbmN1cnJlbnQgc2Vjb25kIHNlbmQgam9pbnMgdGhpcyBvbmUgcmF0aGVyIHRoYW4gY3JlYXRpbmdcblx0XHQvLyBhIGR1cGxpY2F0ZSByZWFsIHNlc3Npb24uIFN0b3JlIHN5bmNocm9ub3VzbHksIGJlZm9yZSBhbnkgYXdhaXQsIHNvIGFcblx0XHQvLyBjb25jdXJyZW50IHNlbmQgcmVsaWFibHkgb2JzZXJ2ZXMgdGhlIGluLWZsaWdodCBtYXRlcmlhbGl6YXRpb24uXG5cdFx0Y29uc3QgbWF0ZXJpYWxpemVkID0gbmV3IERlZmVycmVkUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+KCk7XG5cdFx0dGhpcy5faW5GbGlnaHRVbnRpdGxlZE1hdGVyaWFsaXphdGlvbnMuc2V0KHVudGl0bGVkUmVzb3VyY2UsIG1hdGVyaWFsaXplZC5wKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkUmVxdWVzdCA9IHRoaXMucGFyc2VDaGF0UmVxdWVzdCh1bnRpdGxlZFJlc291cmNlLCByZXF1ZXN0LCBvcHRpb25zPy5sb2NhdGlvbiA/PyB1bnRpdGxlZE1vZGVsLmluaXRpYWxMb2NhdGlvbiwgb3B0aW9ucyk7XG5cdFx0XHRjb25zdCBjb21tYW5kUGFydCA9IHBhcnNlZFJlcXVlc3QucGFydHMuZmluZCgocik6IHIgaXMgQ2hhdFJlcXVlc3RTbGFzaENvbW1hbmRQYXJ0ID0+IHIgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdFNsYXNoQ29tbWFuZFBhcnQpO1xuXHRcdFx0Y29uc3QgcmVxdWVzdFRleHQgPSBnZXRQcm9tcHRUZXh0KHBhcnNlZFJlcXVlc3QpLm1lc3NhZ2U7XG5cblx0XHRcdC8vIFNuYXBzaG90IHRoZSB1bnRpdGxlZCBzZXNzaW9uJ3Mgb3B0aW9ucyB1cCBmcm9udDogdGhleSBzZWVkXG5cdFx0XHQvLyBgY3JlYXRlTmV3Q2hhdFNlc3Npb25JdGVtYCBiZWxvdyBhbmQgYXJlIHB1c2hlZCBvbnRvIHRoZSByZWFsIHNlc3Npb25cblx0XHRcdC8vIG9uY2UgaXQgbG9hZHMuIENhcHR1cmluZyBiZWZvcmUgdGhvc2Ugc3RlcHMgYXZvaWRzIHJlYWRpbmcgdGhlbSBiYWNrXG5cdFx0XHQvLyBhZnRlciB0aGUgdW50aXRsZWQgZW50cnkgbWF5IGhhdmUgY2hhbmdlZCBkdXJpbmcgbWF0ZXJpYWxpemF0aW9uLlxuXHRcdFx0Y29uc3QgaW5pdGlhbFNlc3Npb25PcHRpb25zID0gdGhpcy5jaGF0U2Vzc2lvblNlcnZpY2UuZ2V0U2Vzc2lvbk9wdGlvbnModW50aXRsZWRSZXNvdXJjZSk7XG5cblx0XHRcdGNvbnN0IG5ld0l0ZW0gPSBhd2FpdCB0aGlzLmNoYXRTZXNzaW9uU2VydmljZS5jcmVhdGVOZXdDaGF0U2Vzc2lvbkl0ZW0oZ2V0Q2hhdFNlc3Npb25UeXBlKHVudGl0bGVkUmVzb3VyY2UpLCB7IHByb21wdDogcmVxdWVzdFRleHQsIGNvbW1hbmQ6IGNvbW1hbmRQYXJ0Py50ZXh0LCBpbml0aWFsU2Vzc2lvbk9wdGlvbnMsIHVudGl0bGVkUmVzb3VyY2UgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRpZiAoIW5ld0l0ZW0pIHtcblx0XHRcdFx0bWF0ZXJpYWxpemVkLmNvbXBsZXRlKHVuZGVmaW5lZCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlZ2lzdGVyIHRoZSBpbnZlcnNlIGFsaWFzIGJlZm9yZSBsb2FkaW5nIHNvIHNlc3Npb24tb3B0aW9uIGxvb2t1cHNcblx0XHRcdC8vIGZvciB0aGUgbmV3IHJlc291cmNlIHJlc29sdmUgdG8gdGhlIHVudGl0bGVkIHNlc3Npb24ncyBvcHRpb25zLlxuXHRcdFx0dGhpcy5jaGF0U2Vzc2lvblNlcnZpY2UucmVnaXN0ZXJTZXNzaW9uUmVzb3VyY2VBbGlhcyh1bnRpdGxlZFJlc291cmNlLCBuZXdJdGVtLnJlc291cmNlKTtcblxuXHRcdFx0Ly8gRG8gbm90IGRpc3Bvc2UgdGVtcFJlZiBhcyBwZXIgNmJjNWFlODBkZTljYWZmYjIxZTllYjU4ZTE4YjVjYTI0ZmEyZDZlOFxuXHRcdFx0Y29uc3QgdGVtcFJlZiA9IGF3YWl0IHRoaXMubG9hZFJlbW90ZVNlc3Npb24obmV3SXRlbS5yZXNvdXJjZSwgdW50aXRsZWRNb2RlbC5pbml0aWFsTG9jYXRpb24sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3QgcmVhbE1vZGVsID0gdGVtcFJlZj8ub2JqZWN0IGFzIENoYXRNb2RlbCB8IHVuZGVmaW5lZDtcblx0XHRcdGlmICghcmVhbE1vZGVsKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgRmFpbGVkIHRvIGxvYWQgc2Vzc2lvbiBmb3IgcmVzb3VyY2U6ICR7bmV3SXRlbS5yZXNvdXJjZX1gKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVXBkYXRlIHRoZSBuZXcgbW9kZWwncyBjb250cmlidXRlZCBzZXNzaW9uIHdpdGggaW5pdGlhbFNlc3Npb25PcHRpb25zXG5cdFx0XHQvLyBzbyB0aGF0IHRoZSBhZ2VudCByZWNlaXZlcyB0aGVtIHdoZW4gaW52b2tlZC5cblx0XHRcdGlmIChpbml0aWFsU2Vzc2lvbk9wdGlvbnMpIHtcblx0XHRcdFx0dGhpcy5jaGF0U2Vzc2lvblNlcnZpY2UudXBkYXRlU2Vzc2lvbk9wdGlvbnMocmVhbE1vZGVsLnNlc3Npb25SZXNvdXJjZSwgaW5pdGlhbFNlc3Npb25PcHRpb25zKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVGhlIHJlYWwgc2Vzc2lvbiBjb250aW51ZXMgdGhlIHVudGl0bGVkIGNvbnZlcnNhdGlvbiByYXRoZXIgdGhhbiByZXBsYWNpbmcgaXQsIHNvIHRoZVxuXHRcdFx0Ly8gbW9kZWwgaXQgd2FzIG1lYW50IHRvIHJ1biBvbiBjYXJyaWVzIG92ZXIuIFdpdGhvdXQgdGhpcyB0aGUgY2hvaWNlIHdvdWxkIGJlIHN0cmFuZGVkXG5cdFx0XHQvLyBvbiB0aGUgZGlzY2FyZGVkIHVudGl0bGVkIG1vZGVsIGFuZCBuZXZlciByZWNsYWltZWQgaWYgdGhlIGNhdGFsb2cgZHJvcHMgaXQuXG5cdFx0XHRyZWFsTW9kZWwuaW5wdXRNb2RlbC5zZXRJbnRlbmRlZE1vZGVsKHVudGl0bGVkTW9kZWwuaW5wdXRNb2RlbC5pbnRlbmRlZE1vZGVsKTtcblxuXHRcdFx0Ly8gUHVibGlzaCB0aGUgZm9yd2FyZCBtYXBwaW5nIG9ubHkgYWZ0ZXIgYSBzdWNjZXNzZnVsIGxvYWQgKHNlZVxuXHRcdFx0Ly8gYHNldE1hdGVyaWFsaXplZFNlc3Npb25SZXNvdXJjZWApLlxuXHRcdFx0dGhpcy5jaGF0U2Vzc2lvblNlcnZpY2Uuc2V0TWF0ZXJpYWxpemVkU2Vzc2lvblJlc291cmNlKHVudGl0bGVkUmVzb3VyY2UsIG5ld0l0ZW0ucmVzb3VyY2UpO1xuXHRcdFx0bWF0ZXJpYWxpemVkLmNvbXBsZXRlKG5ld0l0ZW0ucmVzb3VyY2UpO1xuXHRcdFx0Ly8gSWYgdGhpcyBldmVyIGxvZ3MgdHdpY2UgZm9yIHRoZVxuXHRcdFx0Ly8gc2FtZSB1bnRpdGxlZCByZXNvdXJjZSAoZGlmZmVyZW50IHJlYWwgcmVzb3VyY2VzKSwgYSBzaW5nbGUgc2VuZFxuXHRcdFx0Ly8gcHJvZHVjZWQgZHVwbGljYXRlIHNlc3Npb25zLlxuXHRcdFx0dGhpcy5pbmZvKCdtYXRlcmlhbGl6ZVVudGl0bGVkU2Vzc2lvbicsIGBNYXRlcmlhbGl6ZWQgdW50aXRsZWQgc2Vzc2lvbiAke3VudGl0bGVkUmVzb3VyY2UudG9TdHJpbmcoKX0gaW50byByZWFsIHNlc3Npb24gJHtuZXdJdGVtLnJlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRyZXR1cm4geyBtb2RlbDogcmVhbE1vZGVsLCBzZXNzaW9uUmVzb3VyY2U6IG5ld0l0ZW0ucmVzb3VyY2UsIG5ld1Nlc3Npb25SZXNvdXJjZTogbmV3SXRlbS5yZXNvdXJjZSB9O1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gUmVzb2x2ZSAobm90IHJlamVjdCkgc28gYSBjb25jdXJyZW50IHdhaXRlciBkZWdyYWRlcyB0byB0aGUgbm9ybWFsXG5cdFx0XHQvLyB1bnRpdGxlZCBwYXRoIHJhdGhlciB0aGFuIGluaGVyaXRpbmcgdGhpcyBmYWlsdXJlLCB0aGVuIHByb3BhZ2F0ZSB0aGVcblx0XHRcdC8vIGVycm9yIHRvIHRoZSBvcmlnaW5hdGluZyBjYWxsZXIuIFRoZSBmb3J3YXJkIG1hcHBpbmcgaXMgb25seSBwdWJsaXNoZWRcblx0XHRcdC8vIG9uIHN1Y2Nlc3MsIHNvIHRoZXJlIGlzIG5vdGhpbmcgdG8gcm9sbCBiYWNrIGhlcmUuXG5cdFx0XHRtYXRlcmlhbGl6ZWQuY29tcGxldGUodW5kZWZpbmVkKTtcblx0XHRcdHRocm93IGVycjtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKHRoaXMuX2luRmxpZ2h0VW50aXRsZWRNYXRlcmlhbGl6YXRpb25zLmdldCh1bnRpdGxlZFJlc291cmNlKSA9PT0gbWF0ZXJpYWxpemVkLnApIHtcblx0XHRcdFx0dGhpcy5faW5GbGlnaHRVbnRpdGxlZE1hdGVyaWFsaXphdGlvbnMuZGVsZXRlKHVudGl0bGVkUmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0QXR0YWNobWVudENhcGFiaWxpdGllc0ZvclBhcnNlcihjaGF0U2Vzc2lvblR5cGU6IHN0cmluZywgYWdlbnQ6IElDaGF0QWdlbnREYXRhIHwgdW5kZWZpbmVkKTogSUNoYXRBZ2VudEF0dGFjaG1lbnRDYXBhYmlsaXRpZXMgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmNoYXRTZXNzaW9uU2VydmljZS5nZXRDYXBhYmlsaXRpZXNGb3JTZXNzaW9uVHlwZShjaGF0U2Vzc2lvblR5cGUpID8/IGFnZW50Py5jYXBhYmlsaXRpZXM7XG5cdH1cblxuXHRwcml2YXRlIHBhcnNlQ2hhdFJlcXVlc3Qoc2Vzc2lvblJlc291cmNlOiBVUkksIHJlcXVlc3Q6IHN0cmluZywgbG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLCBvcHRpb25zOiBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucyB8IHVuZGVmaW5lZCk6IElQYXJzZWRDaGF0UmVxdWVzdCB7XG5cdFx0bGV0IHBhcnNlckNvbnRleHQgPSBvcHRpb25zPy5wYXJzZXJDb250ZXh0O1xuXHRcdGxldCBjb250ZXh0QWdlbnQgPSBwYXJzZXJDb250ZXh0Py5mb3JjZWRBZ2VudCA/PyBwYXJzZXJDb250ZXh0Py5zZWxlY3RlZEFnZW50O1xuXHRcdGlmIChvcHRpb25zPy5hZ2VudElkKSB7XG5cdFx0XHRjb25zdCBhZ2VudCA9IHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXRBZ2VudChvcHRpb25zLmFnZW50SWQpO1xuXHRcdFx0aWYgKCFhZ2VudCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gYWdlbnQ6ICR7b3B0aW9ucy5hZ2VudElkfWApO1xuXHRcdFx0fVxuXHRcdFx0Y29udGV4dEFnZW50ID0gYWdlbnQ7XG5cdFx0XHRwYXJzZXJDb250ZXh0ID0geyAuLi5wYXJzZXJDb250ZXh0LCBzZWxlY3RlZEFnZW50OiBhZ2VudCwgbW9kZTogb3B0aW9ucy5tb2RlSW5mbz8ua2luZCB9O1xuXHRcdFx0Y29uc3QgY29tbWFuZFBhcnQgPSBvcHRpb25zLnNsYXNoQ29tbWFuZCA/IGAgJHtjaGF0U3ViY29tbWFuZExlYWRlcn0ke29wdGlvbnMuc2xhc2hDb21tYW5kfWAgOiAnJztcblx0XHRcdHJlcXVlc3QgPSBgJHtjaGF0QWdlbnRMZWFkZXJ9JHthZ2VudC5uYW1lfSR7Y29tbWFuZFBhcnR9ICR7cmVxdWVzdH1gO1xuXHRcdH0gZWxzZSBpZiAob3B0aW9ucz8uYWdlbnRJZFNpbGVudCAmJiAhcGFyc2VyQ29udGV4dD8uZm9yY2VkQWdlbnQpIHtcblx0XHRcdC8vIFJlc29sdmUgc2xhc2ggY29tbWFuZHMgaW4gdGhlIGNvbnRleHQgb2YgbG9ja2VkIHBhcnRpY2lwYW50IHNvIGl0cyBzdWJjb21tYW5kcyB0YWtlIHByZWNlZGVuY2Ugb3ZlciBnbG9iYWxcblx0XHRcdC8vIHNsYXNoIGNvbW1hbmRzIHdpdGggdGhlIHNhbWUgbmFtZS5cblx0XHRcdGNvbnN0IHNpbGVudEFnZW50ID0gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldEFnZW50KG9wdGlvbnMuYWdlbnRJZFNpbGVudCk7XG5cdFx0XHRpZiAoc2lsZW50QWdlbnQpIHtcblx0XHRcdFx0Y29udGV4dEFnZW50ID0gc2lsZW50QWdlbnQ7XG5cdFx0XHRcdHBhcnNlckNvbnRleHQgPSB7IC4uLnBhcnNlckNvbnRleHQsIGZvcmNlZEFnZW50OiBzaWxlbnRBZ2VudCB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGF0dGFjaG1lbnRDYXBhYmlsaXRpZXMgPSBwYXJzZXJDb250ZXh0Py5hdHRhY2htZW50Q2FwYWJpbGl0aWVzID8/IHRoaXMuZ2V0QXR0YWNobWVudENhcGFiaWxpdGllc0ZvclBhcnNlcihnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSwgY29udGV4dEFnZW50KTtcblx0XHRpZiAoYXR0YWNobWVudENhcGFiaWxpdGllcykge1xuXHRcdFx0cGFyc2VyQ29udGV4dCA9IHsgLi4ucGFyc2VyQ29udGV4dCwgYXR0YWNobWVudENhcGFiaWxpdGllcyB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhcnNlZFJlcXVlc3QgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKS5wYXJzZUNoYXRSZXF1ZXN0KHNlc3Npb25SZXNvdXJjZSwgcmVxdWVzdCwgbG9jYXRpb24sIHBhcnNlckNvbnRleHQpO1xuXHRcdHJldHVybiBwYXJzZWRSZXF1ZXN0O1xuXHR9XG5cblx0cHJpdmF0ZSByZWZyZXNoRm9sbG93dXBzQ2FuY2VsbGF0aW9uVG9rZW4oc2Vzc2lvblJlc291cmNlOiBVUkkpOiBDYW5jZWxsYXRpb25Ub2tlbiB7XG5cdFx0dGhpcy5fc2Vzc2lvbkZvbGxvd3VwQ2FuY2VsVG9rZW5zLmdldChzZXNzaW9uUmVzb3VyY2UpPy5jYW5jZWwoKTtcblx0XHRjb25zdCBuZXdUb2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHRoaXMuX3Nlc3Npb25Gb2xsb3d1cENhbmNlbFRva2Vucy5zZXQoc2Vzc2lvblJlc291cmNlLCBuZXdUb2tlblNvdXJjZSk7XG5cblx0XHRyZXR1cm4gbmV3VG9rZW5Tb3VyY2UudG9rZW47XG5cdH1cblxuXHRwcml2YXRlIF9zZW5kUmVxdWVzdEFzeW5jKG1vZGVsOiBDaGF0TW9kZWwsIHNlc3Npb25SZXNvdXJjZTogVVJJLCBwYXJzZWRSZXF1ZXN0OiBJUGFyc2VkQ2hhdFJlcXVlc3QsIGF0dGVtcHQ6IG51bWJlciwgZW5hYmxlQ29tbWFuZERldGVjdGlvbjogYm9vbGVhbiwgZGVmYXVsdEFnZW50OiBJQ2hhdEFnZW50RGF0YSwgbG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLCBvcHRpb25zPzogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMpOiBJQ2hhdFNlbmRSZXF1ZXN0UmVzcG9uc2VTdGF0ZSB7XG5cdFx0Y29uc3QgZm9sbG93dXBzQ2FuY2VsVG9rZW4gPSB0aGlzLnJlZnJlc2hGb2xsb3d1cHNDYW5jZWxsYXRpb25Ub2tlbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGxldCByZXF1ZXN0OiBDaGF0UmVxdWVzdE1vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGFnZW50UGFydCA9IHBhcnNlZFJlcXVlc3QucGFydHMuZmluZCgocik6IHIgaXMgQ2hhdFJlcXVlc3RBZ2VudFBhcnQgPT4gciBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0QWdlbnRQYXJ0KTtcblx0XHRjb25zdCBhZ2VudFNsYXNoQ29tbWFuZFBhcnQgPSBwYXJzZWRSZXF1ZXN0LnBhcnRzLmZpbmQoKHIpOiByIGlzIENoYXRSZXF1ZXN0QWdlbnRTdWJjb21tYW5kUGFydCA9PiByIGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RBZ2VudFN1YmNvbW1hbmRQYXJ0KTtcblx0XHRjb25zdCBjb21tYW5kUGFydCA9IHBhcnNlZFJlcXVlc3QucGFydHMuZmluZCgocik6IHIgaXMgQ2hhdFJlcXVlc3RTbGFzaENvbW1hbmRQYXJ0ID0+IHIgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdFNsYXNoQ29tbWFuZFBhcnQpO1xuXHRcdGNvbnN0IHJlcXVlc3RzID0gWy4uLm1vZGVsLmdldFJlcXVlc3RzKCldO1xuXHRcdGNvbnN0IGlzVGVybWluYWxDb21tYW5kID0gaXNUZXJtaW5hbENvbW1hbmRQcm9tcHQocGFyc2VkUmVxdWVzdC50ZXh0LCB0aGlzLmNoYXRTZXNzaW9uU2VydmljZS5nZXRDYXBhYmlsaXRpZXNGb3JTZXNzaW9uVHlwZShnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKSk/LnRlcm1pbmFsQ29tbWFuZFByZWZpeCk7XG5cdFx0Y29uc3QgcmVxdWVzdFRlbGVtZXRyeSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFJlcXVlc3RUZWxlbWV0cnksIHtcblx0XHRcdGFnZW50OiBhZ2VudFBhcnQ/LmFnZW50ID8/IGRlZmF1bHRBZ2VudCxcblx0XHRcdGFnZW50U2xhc2hDb21tYW5kUGFydCxcblx0XHRcdGNvbW1hbmRQYXJ0LFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBtb2RlbC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRsb2NhdGlvbjogbW9kZWwuaW5pdGlhbExvY2F0aW9uLFxuXHRcdFx0b3B0aW9ucyxcblx0XHRcdGVuYWJsZUNvbW1hbmREZXRlY3Rpb25cblx0XHR9KTtcblxuXHRcdGxldCBnb3RQcm9ncmVzcyA9IGZhbHNlO1xuXHRcdGNvbnN0IHJlcXVlc3RUeXBlID0gY29tbWFuZFBhcnQgPyAnc2xhc2hDb21tYW5kJyA6ICdzdHJpbmcnO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2VDcmVhdGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTxJQ2hhdFJlc3BvbnNlTW9kZWw+KCk7XG5cdFx0bGV0IHJlc3BvbnNlQ3JlYXRlZENvbXBsZXRlID0gZmFsc2U7XG5cdFx0ZnVuY3Rpb24gY29tcGxldGVSZXNwb25zZUNyZWF0ZWQoKTogdm9pZCB7XG5cdFx0XHRpZiAoIXJlc3BvbnNlQ3JlYXRlZENvbXBsZXRlICYmIHJlcXVlc3Q/LnJlc3BvbnNlKSB7XG5cdFx0XHRcdHJlc3BvbnNlQ3JlYXRlZC5jb21wbGV0ZShyZXF1ZXN0LnJlc3BvbnNlKTtcblx0XHRcdFx0cmVzcG9uc2VDcmVhdGVkQ29tcGxldGUgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHNvdXJjZSA9IHN0b3JlLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdFx0Y29uc3QgdG9rZW4gPSBzb3VyY2UudG9rZW47XG5cdFx0Y29uc3Qgc2VuZFJlcXVlc3RJbnRlcm5hbCA9IGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb2dyZXNzQ2FsbGJhY2sgPSAocHJvZ3Jlc3M6IElDaGF0UHJvZ3Jlc3NbXSkgPT4ge1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWdvdFByb2dyZXNzKSB7XG5cdFx0XHRcdFx0bWFya0NoYXQoc2Vzc2lvblJlc291cmNlLCBDaGF0UGVyZk1hcmsuRmlyc3RUb2tlbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0Z290UHJvZ3Jlc3MgPSB0cnVlO1xuXG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcHJvZ3Jlc3MubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRjb25zdCBpc0xhc3QgPSBpID09PSBwcm9ncmVzcy5sZW5ndGggLSAxO1xuXHRcdFx0XHRcdGNvbnN0IHByb2dyZXNzSXRlbSA9IHByb2dyZXNzW2ldO1xuXG5cdFx0XHRcdFx0aWYgKHByb2dyZXNzSXRlbS5raW5kID09PSAnbWFya2Rvd25Db250ZW50Jykge1xuXHRcdFx0XHRcdFx0dGhpcy50cmFjZSgnc2VuZFJlcXVlc3QnLCBgUHJvdmlkZXIgcmV0dXJuZWQgcHJvZ3Jlc3MgZm9yIHNlc3Npb24gJHttb2RlbC5zZXNzaW9uUmVzb3VyY2V9LCAke3Byb2dyZXNzSXRlbS5jb250ZW50LnZhbHVlLmxlbmd0aH0gY2hhcnNgKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy50cmFjZSgnc2VuZFJlcXVlc3QnLCBgUHJvdmlkZXIgcmV0dXJuZWQgcHJvZ3Jlc3M6ICR7SlNPTi5zdHJpbmdpZnkocHJvZ3Jlc3NJdGVtKX1gKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAocmVxdWVzdCkge1xuXHRcdFx0XHRcdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCBwcm9ncmVzc0l0ZW0sICFpc0xhc3QpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb21wbGV0ZVJlc3BvbnNlQ3JlYXRlZCgpO1xuXHRcdFx0fTtcblxuXHRcdFx0bGV0IGRldGVjdGVkQWdlbnQ6IElDaGF0QWdlbnREYXRhIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGRldGVjdGVkQ29tbWFuZDogSUNoYXRBZ2VudENvbW1hbmQgfCB1bmRlZmluZWQ7XG5cblx0XHRcdC8vIEdhdGUgL3Ryb3VibGVzaG9vdCBhbmQgdGhlIHRyb3VibGVzaG9vdCBza2lsbCBiZWhpbmQgdGhlIGZpbGUgbG9nZ2luZyBmbGFnLlxuXHRcdFx0Ly8gYWdlbnREZWJ1Z0xvZy5lbmFibGVkIGlzIGRlcHJlY2F0ZWQ7IG9ubHkgZmlsZUxvZ2dpbmcuZW5hYmxlZCBpcyBhdXRob3JpdGF0aXZlLlxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBmaWxlTG9nZ2luZ0VuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEFHRU5UX0RFQlVHX0xPR19GSUxFX0xPR0dJTkdfRU5BQkxFRF9TRVRUSU5HKTtcblx0XHRcdFx0aWYgKCFmaWxlTG9nZ2luZ0VuYWJsZWQpIHtcblx0XHRcdFx0XHRjb25zdCBpc1Ryb3VibGVzaG9vdENvbW1hbmQgPSBhZ2VudFNsYXNoQ29tbWFuZFBhcnQ/LmNvbW1hbmQubmFtZSA9PT0gVFJPVUJMRVNIT09UX0NPTU1BTkRfTkFNRTtcblx0XHRcdFx0XHRjb25zdCBoYXNUcm91Ymxlc2hvb3RTa2lsbCA9IG9wdGlvbnM/LmF0dGFjaGVkQ29udGV4dD8uc29tZSh2ID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHVyaSA9IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkudG9Vcmkodik7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdXJpICYmICh1cmkuc2NoZW1lID09PSBDT1BJTE9UX1NLSUxMX1VSSV9TQ0hFTUUgfHwgdXJpLnBhdGguaW5jbHVkZXMoVFJPVUJMRVNIT09UX1NLSUxMX1BBVEgpKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRpZiAoaXNUcm91Ymxlc2hvb3RDb21tYW5kIHx8IGhhc1Ryb3VibGVzaG9vdFNraWxsKSB7XG5cdFx0XHRcdFx0XHRyZXF1ZXN0ID0gbW9kZWwuYWRkUmVxdWVzdChwYXJzZWRSZXF1ZXN0LCB7IHZhcmlhYmxlczogW10gfSwgYXR0ZW1wdCwgb3B0aW9ucz8ubW9kZUluZm8pO1xuXHRcdFx0XHRcdFx0Y29tcGxldGVSZXNwb25zZUNyZWF0ZWQoKTtcblxuXHRcdFx0XHRcdFx0Y29uc3Qgc2V0dGluZ3NBcmcgPSBlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkoQUdFTlRfREVCVUdfTE9HX0ZJTEVfTE9HR0lOR19FTkFCTEVEX1NFVFRJTkcpKTtcblx0XHRcdFx0XHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwge1xuXHRcdFx0XHRcdFx0XHRraW5kOiAnbWFya2Rvd25Db250ZW50Jyxcblx0XHRcdFx0XHRcdFx0Y29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKFxuXHRcdFx0XHRcdFx0XHRcdCdhZ2VudERlYnVnTG9nLnRyb3VibGVzaG9vdERpc2FibGVkJyxcblx0XHRcdFx0XHRcdFx0XHRcIlRoZSBgezB9YCBza2lsbCByZXF1aXJlcyBgezF9YCB0byBiZSBlbmFibGVkLiBBZnRlciBlbmFibGluZywgcmVsb2FkIHRoZSB3aW5kb3cgdG8gYXBwbHkuIFtFbmFibGUgaW4gU2V0dGluZ3NdKGNvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3M/ezJ9KVwiLFxuXHRcdFx0XHRcdFx0XHRcdFRST1VCTEVTSE9PVF9DT01NQU5EX05BTUUsXG5cdFx0XHRcdFx0XHRcdFx0QUdFTlRfREVCVUdfTE9HX0ZJTEVfTE9HR0lOR19FTkFCTEVEX1NFVFRJTkcsXG5cdFx0XHRcdFx0XHRcdFx0c2V0dGluZ3NBcmdcblx0XHRcdFx0XHRcdFx0KSwgeyBpc1RydXN0ZWQ6IHsgZW5hYmxlZENvbW1hbmRzOiBbJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJ10gfSB9KSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0bW9kZWwuc2V0UmVzcG9uc2UocmVxdWVzdCwge30pO1xuXHRcdFx0XHRcdFx0cmVxdWVzdC5yZXNwb25zZT8uY29tcGxldGUoKTtcblx0XHRcdFx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQ29sbGVjdCBob29rcyBmcm9tIGhvb2sgLmpzb24gZmlsZXNcblx0XHRcdGNvbnN0IGNvbGxlY3RIb29rcyA9IGFzeW5jICgpOiBQcm9taXNlPHsgaG9va3M6IENoYXRSZXF1ZXN0SG9va3MgfCB1bmRlZmluZWQ7IGhhc0Rpc2FibGVkQ2xhdWRlSG9va3M6IGJvb2xlYW4gfT4gPT4ge1xuXHRcdFx0XHRsZXQgY29sbGVjdGVkSG9va3M6IENoYXRSZXF1ZXN0SG9va3MgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGxldCBoYXNEaXNhYmxlZENsYXVkZUhvb2tzID0gZmFsc2U7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgaG9va3NJbmZvID0gYXdhaXQgdGhpcy5wcm9tcHRzU2VydmljZS5nZXRIb29rcyh0b2tlbik7XG5cdFx0XHRcdFx0aWYgKGhvb2tzSW5mbykge1xuXHRcdFx0XHRcdFx0Y29sbGVjdGVkSG9va3MgPSBob29rc0luZm8uaG9va3M7XG5cdFx0XHRcdFx0XHRoYXNEaXNhYmxlZENsYXVkZUhvb2tzID0gaG9va3NJbmZvLmhhc0Rpc2FibGVkQ2xhdWRlSG9va3M7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbQ2hhdFNlcnZpY2VdIEZhaWxlZCB0byBjb2xsZWN0IGhvb2tzOicsIGVycm9yKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIE1lcmdlIGhvb2tzIGZyb20gdGhlIHNlbGVjdGVkIGN1c3RvbSBhZ2VudCdzIGZyb250bWF0dGVyIChpZiBhbnkpXG5cdFx0XHRcdGNvbnN0IGFnZW50TmFtZSA9IG9wdGlvbnM/Lm1vZGVJbmZvPy5tb2RlSW5zdHJ1Y3Rpb25zPy5uYW1lO1xuXHRcdFx0XHRpZiAoYWdlbnROYW1lKSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNvbnN0IGFnZW50cyA9IGF3YWl0IHRoaXMucHJvbXB0c1NlcnZpY2UuZ2V0Q3VzdG9tQWdlbnRzKHRva2VuKTtcblx0XHRcdFx0XHRcdGNvbnN0IGN1c3RvbUFnZW50ID0gYWdlbnRzLmZpbmQoYSA9PiBhLm5hbWUgPT09IGFnZW50TmFtZSAmJiBhLmVuYWJsZWQpO1xuXHRcdFx0XHRcdFx0aWYgKGN1c3RvbUFnZW50Py5ob29rcykge1xuXHRcdFx0XHRcdFx0XHRjb2xsZWN0ZWRIb29rcyA9IG1lcmdlSG9va3MoY29sbGVjdGVkSG9va3MsIGN1c3RvbUFnZW50Lmhvb2tzKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ1tDaGF0U2VydmljZV0gRmFpbGVkIHRvIGNvbGxlY3QgYWdlbnQgaG9va3M6JywgZXJyb3IpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyBob29rczogY29sbGVjdGVkSG9va3MsIGhhc0Rpc2FibGVkQ2xhdWRlSG9va3MgfTtcblx0XHRcdH07XG5cblx0XHRcdC8vIENvbGxlY3QgYXV0b21hdGljIGluc3RydWN0aW9ucyAoLmluc3RydWN0aW9ucy5tZCwgc2tpbGxzLCBldGMuKVxuXHRcdFx0Y29uc3QgY29sbGVjdEluc3RydWN0aW9ucyA9IGFzeW5jICgpOiBQcm9taXNlPElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXT4gPT4ge1xuXHRcdFx0XHRjb25zdCBjdHggPSBvcHRpb25zPy5pbnN0cnVjdGlvbkNvbnRleHQ7XG5cdFx0XHRcdGlmICghY3R4KSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFdoZW4gdGhlIGV4dGVuc2lvbiBpcyByZXNwb25zaWJsZSBmb3IgaW5zdHJ1Y3Rpb24gY29sbGVjdGlvbiwgc2tpcCB0aGUgY29yZSBwYXRoIGVudGlyZWx5LlxuXHRcdFx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5Db2xsZWN0SW5zdHJ1Y3Rpb25zSW5FeHRlbnNpb24pID09PSB0cnVlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG1hcmtDaGF0KHNlc3Npb25SZXNvdXJjZSwgQ2hhdFBlcmZNYXJrLldpbGxDb2xsZWN0SW5zdHJ1Y3Rpb25zKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHQvLyBTZWVkIHRoZSB2YXJpYWJsZSBzZXQgd2l0aCBleGlzdGluZyBhdHRhY2htZW50cyBzbyB0aGF0XG5cdFx0XHRcdFx0Ly8gYXBwbHlUbyBwYXR0ZXJuIG1hdGNoaW5nIGFuZCByZWZlcmVuY2VkLWluc3RydWN0aW9uXG5cdFx0XHRcdFx0Ly8gcmVzb2x1dGlvbiBjYW4gc2VlIHRoZW0uIFdlIGZpbHRlciB0aGVtIGJhY2sgb3V0IGJlbG93XG5cdFx0XHRcdFx0Ly8gdG8gcmV0dXJuIG9ubHkgdGhlIGVudHJpZXMgdGhhdCB3ZXJlIG5ld2x5IGFkZGVkLlxuXHRcdFx0XHRcdGNvbnN0IHZhcmlhYmxlU2V0ID0gbmV3IENoYXRSZXF1ZXN0VmFyaWFibGVTZXQob3B0aW9ucz8uYXR0YWNoZWRDb250ZXh0KTtcblx0XHRcdFx0XHRjb25zdCBjb21wdXRlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29tcHV0ZUF1dG9tYXRpY0luc3RydWN0aW9ucywgY3R4Lm1vZGVLaW5kLCBjdHguZW5hYmxlZFRvb2xzLCBjdHguZW5hYmxlZFN1YkFnZW50cywgZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSkpO1xuXHRcdFx0XHRcdGF3YWl0IGNvbXB1dGVyLmNvbGxlY3QodmFyaWFibGVTZXQsIHRva2VuKTtcblx0XHRcdFx0XHQvLyBSZXR1cm4gb25seSB0aGUgZW50cmllcyB0aGF0IHdlcmUgYWRkZWQgYnkgaW5zdHJ1Y3Rpb24gY29sbGVjdGlvblxuXHRcdFx0XHRcdGNvbnN0IG9yaWdpbmFsSWRzID0gbmV3IFNldCgob3B0aW9ucz8uYXR0YWNoZWRDb250ZXh0ID8/IFtdKS5tYXAodiA9PiB2LmlkKSk7XG5cdFx0XHRcdFx0cmV0dXJuIHZhcmlhYmxlU2V0LmFzQXJyYXkoKS5maWx0ZXIodiA9PiAhb3JpZ2luYWxJZHMuaGFzKHYuaWQpKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbQ2hhdFNlcnZpY2VdIEZhaWxlZCB0byBjb2xsZWN0IGluc3RydWN0aW9uczonLCBlcnIpO1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRtYXJrQ2hhdChzZXNzaW9uUmVzb3VyY2UsIENoYXRQZXJmTWFyay5EaWRDb2xsZWN0SW5zdHJ1Y3Rpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3Qgc3RvcFdhdGNoID0gbmV3IFN0b3BXYXRjaChmYWxzZSk7XG5cdFx0XHRzdG9yZS5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnRyYWNlKCdzZW5kUmVxdWVzdCcsIGBSZXF1ZXN0IGZvciBzZXNzaW9uICR7bW9kZWwuc2Vzc2lvblJlc291cmNlfSB3YXMgY2FuY2VsbGVkYCk7XG5cdFx0XHRcdGlmICghcmVxdWVzdCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJlcXVlc3RUZWxlbWV0cnkuY29tcGxldGUoe1xuXHRcdFx0XHRcdHRpbWVUb0ZpcnN0UHJvZ3Jlc3M6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRyZXN1bHQ6ICdjYW5jZWxsZWQnLFxuXHRcdFx0XHRcdC8vIE5vcm1hbGx5IHRpbWluZ3MgaGFwcGVuIGluc2lkZSB0aGUgRUggYXJvdW5kIHRoZSBhY3R1YWwgcHJvdmlkZXIuIEZvciBjYW5jZWxsYXRpb24gd2UgY2FuIG1lYXN1cmUgaG93IGxvbmcgdGhlIHVzZXIgd2FpdGVkIGJlZm9yZSBjYW5jZWxsaW5nXG5cdFx0XHRcdFx0dG90YWxUaW1lOiBzdG9wV2F0Y2guZWxhcHNlZCgpLFxuXHRcdFx0XHRcdHJlcXVlc3RUeXBlLFxuXHRcdFx0XHRcdGRldGVjdGVkQWdlbnQsXG5cdFx0XHRcdFx0cmVxdWVzdCxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0bW9kZWwuY2FuY2VsUmVxdWVzdChyZXF1ZXN0KTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bGV0IHJhd1Jlc3VsdDogSUNoYXRBZ2VudFJlc3VsdCB8IG51bGwgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGxldCBhZ2VudE9yQ29tbWFuZEZvbGxvd3VwczogUHJvbWlzZTxJQ2hhdEZvbGxvd3VwW10gfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoYWdlbnRQYXJ0IHx8IChkZWZhdWx0QWdlbnQgJiYgIWNvbW1hbmRQYXJ0KSkge1xuXHRcdFx0XHRcdC8vIC0tLSBTdGVwIDE6IENyZWF0ZSB0aGUgcmVxdWVzdCBtb2RlbCBpbW1lZGlhdGVseSAoYmVmb3JlIGFueSBhd2FpdHMpIC0tLVxuXHRcdFx0XHRcdC8vIFRoaXMgZmlyZXMgUmVxdWVzdFVpVXBkYXRlZCBzeW5jaHJvbm91c2x5IHNvIHRoZSB1c2VyIHNlZXMgdGhlaXIgbWVzc2FnZSByaWdodCBhd2F5LlxuXHRcdFx0XHRcdGNvbnN0IGluaXRpYWxBZ2VudCA9IGFnZW50UGFydD8uYWdlbnQgPz8gZGVmYXVsdEFnZW50O1xuXHRcdFx0XHRcdGNvbnN0IGluaXRpYWxDb21tYW5kID0gYWdlbnRTbGFzaENvbW1hbmRQYXJ0Py5jb21tYW5kO1xuXHRcdFx0XHRcdGNvbnN0IGluaXRWYXJpYWJsZURhdGE6IElDaGF0UmVxdWVzdFZhcmlhYmxlRGF0YSA9IHsgdmFyaWFibGVzOiBbXSB9O1xuXHRcdFx0XHRcdHJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHBhcnNlZFJlcXVlc3QsIGluaXRWYXJpYWJsZURhdGEsIGF0dGVtcHQsIG9wdGlvbnM/Lm1vZGVJbmZvLCBpbml0aWFsQWdlbnQsIGluaXRpYWxDb21tYW5kLCBvcHRpb25zPy5jb25maXJtYXRpb24sIG9wdGlvbnM/LmxvY2F0aW9uRGF0YSwgb3B0aW9ucz8uYXR0YWNoZWRDb250ZXh0LCB1bmRlZmluZWQsIG9wdGlvbnM/LnVzZXJTZWxlY3RlZE1vZGVsSWQsIG9wdGlvbnM/LnVzZXJTZWxlY3RlZFRvb2xzPy5nZXQoKSwgdW5kZWZpbmVkLCBvcHRpb25zPy5pc1N5c3RlbUluaXRpYXRlZCwgb3B0aW9ucz8uc3lzdGVtSW5pdGlhdGVkTGFiZWwsIG9wdGlvbnM/LnRlcm1pbmFsRXhlY3V0aW9uSWQsIGlzVGVybWluYWxDb21tYW5kLCB1bmRlZmluZWQsIG9wdGlvbnM/LmhpZGVGcm9tVHJhbnNjcmlwdCk7XG5cdFx0XHRcdFx0Y29uc3QgdGhpc1JlcXVlc3QgPSByZXF1ZXN0O1xuXHRcdFx0XHRcdGNvbXBsZXRlUmVzcG9uc2VDcmVhdGVkKCk7XG5cblx0XHRcdFx0XHQvLyAtLS0gU3RlcCAyOiBDb2xsZWN0IGhvb2tzICsgaW5zdHJ1Y3Rpb25zIGluIHBhcmFsbGVsIChhZnRlciBVSSBpcyBzaG93bikgLS0tXG5cdFx0XHRcdFx0Y29uc3QgW2hvb2tzUmVzdWx0LCBpbnN0cnVjdGlvbkVudHJpZXNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRcdFx0Y29sbGVjdEhvb2tzKCksXG5cdFx0XHRcdFx0XHRjb2xsZWN0SW5zdHJ1Y3Rpb25zKCksXG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0Y29uc3QgY29sbGVjdGVkSG9va3MgPSBob29rc1Jlc3VsdC5ob29rcztcblx0XHRcdFx0XHRjb25zdCBoYXNEaXNhYmxlZENsYXVkZUhvb2tzID0gaG9va3NSZXN1bHQuaGFzRGlzYWJsZWRDbGF1ZGVIb29rcztcblxuXHRcdFx0XHRcdC8vIC0tLSBTdGVwIDM6IE1lcmdlIGluc3RydWN0aW9ucyBhbmQgcmVzb2x2ZWQgdmFyaWFibGVzIGludG8gdmFyaWFibGVEYXRhIC0tLVxuXHRcdFx0XHRcdGNvbnN0IGFsbENvbnRleHQgPSB0aGlzLnByZXBhcmVDb250ZXh0KHJlcXVlc3QuYXR0YWNoZWRDb250ZXh0KTtcblx0XHRcdFx0XHRpZiAoaW5zdHJ1Y3Rpb25FbnRyaWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdGFsbENvbnRleHQucHVzaCguLi5pbnN0cnVjdGlvbkVudHJpZXMpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIFN0b3JlIG9ubHkgbm9uLWluc3RydWN0aW9uIHZhcmlhYmxlcyBvbiB0aGUgbW9kZWwuXG5cdFx0XHRcdFx0Ly8gQXV0b21hdGljYWxseS1hZGRlZCBwcm9tcHRUZXh0IGVudHJpZXMgKH4zMyBLQiBlYWNoKSBhcmVcblx0XHRcdFx0XHQvLyBlcGhlbWVyYWwgXHUyMDE0IHJlLWNvbGxlY3RlZCBldmVyeSB0dXJuLCBuZXZlciByZW5kZXJlZCBpblxuXHRcdFx0XHRcdC8vIHRoZSBVSSwgYW5kIG5vdCBuZWVkZWQgaW4gc2VyaWFsaXplZCBzZXNzaW9uIGhpc3RvcnkuXG5cdFx0XHRcdFx0Y29uc3Qgc3RvcmVkVmFyaWFibGVzID0gYWxsQ29udGV4dC5maWx0ZXIodiA9PiAhKGlzUHJvbXB0VGV4dFZhcmlhYmxlRW50cnkodikgJiYgdi5hdXRvbWF0aWNhbGx5QWRkZWQpKTtcblx0XHRcdFx0XHRtb2RlbC51cGRhdGVSZXF1ZXN0KHJlcXVlc3QsIHsgdmFyaWFibGVzOiBzdG9yZWRWYXJpYWJsZXMgfSk7XG5cblx0XHRcdFx0XHQvLyBUaGUgZnVsbCBzZXQgKGluY2x1ZGluZyBpbnN0cnVjdGlvbnMpIGlzIHBhc3NlZCB0byB0aGVcblx0XHRcdFx0XHQvLyBhZ2VudCByZXF1ZXN0IG9ubHkgXHUyMDE0IG5vdCBzdG9yZWQgb24gdGhlIHJlcXVlc3QgbW9kZWwuXG5cdFx0XHRcdFx0bGV0IHZhcmlhYmxlRGF0YTogSUNoYXRSZXF1ZXN0VmFyaWFibGVEYXRhID0geyB2YXJpYWJsZXM6IGFsbENvbnRleHQgfTtcblxuXHRcdFx0XHRcdC8vIE1lcmdlIHJlc29sdmVkIHZhcmlhYmxlcyAoZS5nLiBpbWFnZXMgZnJvbSBkaXJlY3RvcmllcykgZm9yIHRoZVxuXHRcdFx0XHRcdC8vIGFnZW50IHJlcXVlc3Qgb25seSAtIHRoZXkgYXJlIG5vdCBzdG9yZWQgb24gdGhlIHJlcXVlc3QgbW9kZWwuXG5cdFx0XHRcdFx0aWYgKG9wdGlvbnM/LnJlc29sdmVkVmFyaWFibGVzPy5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdHZhcmlhYmxlRGF0YSA9IHsgdmFyaWFibGVzOiBbLi4udmFyaWFibGVEYXRhLnZhcmlhYmxlcywgLi4ub3B0aW9ucy5yZXNvbHZlZFZhcmlhYmxlc10gfTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBwcm9tcHRUZXh0UmVzdWx0ID0gZ2V0UHJvbXB0VGV4dChyZXF1ZXN0Lm1lc3NhZ2UpO1xuXHRcdFx0XHRcdHZhcmlhYmxlRGF0YSA9IHVwZGF0ZVJhbmdlcyh2YXJpYWJsZURhdGEsIHByb21wdFRleHRSZXN1bHQuZGlmZik7IC8vIFRPRE8gYml0IG9mIGEgaGFja1xuXHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBwcm9tcHRUZXh0UmVzdWx0Lm1lc3NhZ2U7XG5cblx0XHRcdFx0XHQvLyAtLS0gU3RlcCA0OiBCdWlsZCB0aGUgYWdlbnQgcmVxdWVzdCBvYmplY3QgLS0tXG5cdFx0XHRcdFx0Y29uc3QgYnVpbGRBZ2VudFJlcXVlc3QgPSAoYWdlbnQ6IElDaGF0QWdlbnREYXRhLCBjb21tYW5kPzogSUNoYXRBZ2VudENvbW1hbmQsIGVuYWJsZUNvbW1hbmREZXRlY3Rpb24/OiBib29sZWFuLCBpc1BhcnRpY2lwYW50RGV0ZWN0ZWQ/OiBib29sZWFuKTogSUNoYXRBZ2VudFJlcXVlc3QgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgYWdlbnRSZXF1ZXN0OiBJQ2hhdEFnZW50UmVxdWVzdCA9IHtcblx0XHRcdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBtb2RlbC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRcdHJlcXVlc3RJZDogdGhpc1JlcXVlc3QuaWQsXG5cdFx0XHRcdFx0XHRcdGFnZW50SWQ6IGFnZW50LmlkLFxuXHRcdFx0XHRcdFx0XHRtZXNzYWdlLFxuXHRcdFx0XHRcdFx0XHRjb21tYW5kOiBjb21tYW5kPy5uYW1lLFxuXHRcdFx0XHRcdFx0XHR2YXJpYWJsZXM6IHZhcmlhYmxlRGF0YSxcblx0XHRcdFx0XHRcdFx0ZW5hYmxlQ29tbWFuZERldGVjdGlvbixcblx0XHRcdFx0XHRcdFx0aXNQYXJ0aWNpcGFudERldGVjdGVkLFxuXHRcdFx0XHRcdFx0XHRhdHRlbXB0LFxuXHRcdFx0XHRcdFx0XHRsb2NhdGlvbixcblx0XHRcdFx0XHRcdFx0bG9jYXRpb25EYXRhOiB0aGlzUmVxdWVzdC5sb2NhdGlvbkRhdGEsXG5cdFx0XHRcdFx0XHRcdGFjY2VwdGVkQ29uZmlybWF0aW9uRGF0YTogb3B0aW9ucz8uYWNjZXB0ZWRDb25maXJtYXRpb25EYXRhLFxuXHRcdFx0XHRcdFx0XHRyZWplY3RlZENvbmZpcm1hdGlvbkRhdGE6IG9wdGlvbnM/LnJlamVjdGVkQ29uZmlybWF0aW9uRGF0YSxcblx0XHRcdFx0XHRcdFx0YWdlbnRIb3N0U2Vzc2lvbkNvbmZpZzogb3B0aW9ucz8uYWdlbnRIb3N0U2Vzc2lvbkNvbmZpZyxcblx0XHRcdFx0XHRcdFx0dXNlclNlbGVjdGVkTW9kZWxJZDogb3B0aW9ucz8udXNlclNlbGVjdGVkTW9kZWxJZCxcblx0XHRcdFx0XHRcdFx0bW9kZWxDb25maWd1cmF0aW9uOiBvcHRpb25zPy51c2VyU2VsZWN0ZWRNb2RlbENvbmZpZ3VyYXRpb24gPz8gKG9wdGlvbnM/LnVzZXJTZWxlY3RlZE1vZGVsSWQgPyB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRNb2RlbENvbmZpZ3VyYXRpb24ob3B0aW9ucy51c2VyU2VsZWN0ZWRNb2RlbElkKSA6IHVuZGVmaW5lZCksXG5cdFx0XHRcdFx0XHRcdHVzZXJTZWxlY3RlZFRvb2xzOiBvcHRpb25zPy51c2VyU2VsZWN0ZWRUb29scz8uZ2V0KCksXG5cdFx0XHRcdFx0XHRcdG1vZGVJbnN0cnVjdGlvbnM6IG9wdGlvbnM/Lm1vZGVJbmZvPy5tb2RlSW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRcdFx0XHRwZXJtaXNzaW9uTGV2ZWw6IG9wdGlvbnM/Lm1vZGVJbmZvPy5wZXJtaXNzaW9uTGV2ZWwsXG5cdFx0XHRcdFx0XHRcdGVkaXRlZEZpbGVFdmVudHM6IHRoaXNSZXF1ZXN0LmVkaXRlZEZpbGVFdmVudHMsXG5cdFx0XHRcdFx0XHRcdGhvb2tzOiBjb2xsZWN0ZWRIb29rcyxcblx0XHRcdFx0XHRcdFx0aGFzSG9va3NFbmFibGVkOiAhIWNvbGxlY3RlZEhvb2tzICYmIE9iamVjdC52YWx1ZXMoY29sbGVjdGVkSG9va3MpLnNvbWUoYXJyID0+IGFyci5sZW5ndGggPiAwKSxcblx0XHRcdFx0XHRcdFx0aXNWb2ljZU1vZGVJbnB1dDogb3B0aW9ucz8uaXNWb2ljZU1vZGVJbnB1dCxcblx0XHRcdFx0XHRcdFx0aXNTeXN0ZW1Jbml0aWF0ZWQ6IG9wdGlvbnM/LmlzU3lzdGVtSW5pdGlhdGVkLFxuXHRcdFx0XHRcdFx0XHRoaWRlRnJvbVRyYW5zY3JpcHQ6IG9wdGlvbnM/LmhpZGVGcm9tVHJhbnNjcmlwdCxcblx0XHRcdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogbW9kZWwud29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRcdGxldCBpc0luaXRpYWxUb29scyA9IHRydWU7XG5cblx0XHRcdFx0XHRcdHN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHRvb2xzID0gb3B0aW9ucz8udXNlclNlbGVjdGVkVG9vbHM/LnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRcdFx0aWYgKGlzSW5pdGlhbFRvb2xzKSB7XG5cdFx0XHRcdFx0XHRcdFx0aXNJbml0aWFsVG9vbHMgPSBmYWxzZTtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRpZiAodG9vbHMgJiYgcmVxdWVzdCkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuY2hhdEFnZW50U2VydmljZS5zZXRSZXF1ZXN0VG9vbHMoYWdlbnQuaWQsIHJlcXVlc3QuaWQsIHRvb2xzKTtcblx0XHRcdFx0XHRcdFx0XHQvLyBpbiBjYXNlIHRoZSByZXF1ZXN0IGhhcyBub3QgYmVlbiBzZW50IG91dCB5ZXQ6XG5cdFx0XHRcdFx0XHRcdFx0YWdlbnRSZXF1ZXN0LnVzZXJTZWxlY3RlZFRvb2xzID0gdG9vbHM7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRcdFx0cmV0dXJuIGFnZW50UmVxdWVzdDtcblx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0Ly8gLS0tIFN0ZXAgNTogUGFydGljaXBhbnQgZGV0ZWN0aW9uIC0tLVxuXHRcdFx0XHRcdGlmIChcblx0XHRcdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2NoYXQuZGV0ZWN0UGFydGljaXBhbnQuZW5hYmxlZCcpICE9PSBmYWxzZSAmJlxuXHRcdFx0XHRcdFx0dGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmhhc0NoYXRQYXJ0aWNpcGFudERldGVjdGlvblByb3ZpZGVycygpICYmXG5cdFx0XHRcdFx0XHQhYWdlbnRQYXJ0ICYmXG5cdFx0XHRcdFx0XHQhY29tbWFuZFBhcnQgJiZcblx0XHRcdFx0XHRcdCFhZ2VudFNsYXNoQ29tbWFuZFBhcnQgJiZcblx0XHRcdFx0XHRcdGVuYWJsZUNvbW1hbmREZXRlY3Rpb24gJiZcblx0XHRcdFx0XHRcdGxvY2F0aW9uICE9PSBDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUgJiZcblx0XHRcdFx0XHRcdG9wdGlvbnM/Lm1vZGVJbmZvPy5raW5kICE9PSBDaGF0TW9kZUtpbmQuQWdlbnQgJiZcblx0XHRcdFx0XHRcdG9wdGlvbnM/Lm1vZGVJbmZvPy5raW5kICE9PSBDaGF0TW9kZUtpbmQuRWRpdCAmJlxuXHRcdFx0XHRcdFx0IW9wdGlvbnM/LmFnZW50SWRTaWxlbnRcblx0XHRcdFx0XHQpIHtcblx0XHRcdFx0XHRcdC8vIFdlIGhhdmUgbm8gYWdlbnQgb3IgY29tbWFuZCB0byBzY29wZSBoaXN0b3J5IHdpdGgsIHBhc3MgdGhlIGZ1bGwgaGlzdG9yeSB0byB0aGUgcGFydGljaXBhbnQgZGV0ZWN0aW9uIHByb3ZpZGVyXG5cdFx0XHRcdFx0XHRjb25zdCBkZWZhdWx0QWdlbnRIaXN0b3J5ID0gdGhpcy5nZXRIaXN0b3J5RW50cmllc0Zyb21Nb2RlbChyZXF1ZXN0cywgbG9jYXRpb24sIGRlZmF1bHRBZ2VudC5pZCk7XG5cdFx0XHRcdFx0XHRjb25zdCBjaGF0QWdlbnRSZXF1ZXN0ID0gYnVpbGRBZ2VudFJlcXVlc3QoZGVmYXVsdEFnZW50LCB1bmRlZmluZWQsIGVuYWJsZUNvbW1hbmREZXRlY3Rpb24sIGZhbHNlKTtcblxuXHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmRldGVjdEFnZW50T3JDb21tYW5kKGNoYXRBZ2VudFJlcXVlc3QsIGRlZmF1bHRBZ2VudEhpc3RvcnksIHsgbG9jYXRpb24gfSwgdG9rZW4pO1xuXHRcdFx0XHRcdFx0aWYgKHJlc3VsdCAmJiB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0QWdlbnQocmVzdWx0LmFnZW50LmlkKT8ubG9jYXRpb25zPy5pbmNsdWRlcyhsb2NhdGlvbikpIHtcblx0XHRcdFx0XHRcdFx0Ly8gVXBkYXRlIHRoZSByZXNwb25zZSBpbiB0aGUgQ2hhdE1vZGVsIHRvIHJlZmxlY3QgdGhlIGRldGVjdGVkIGFnZW50IGFuZCBjb21tYW5kXG5cdFx0XHRcdFx0XHRcdHJlcXVlc3Q/LnJlc3BvbnNlPy5zZXRBZ2VudChyZXN1bHQuYWdlbnQsIHJlc3VsdC5jb21tYW5kKTtcblx0XHRcdFx0XHRcdFx0ZGV0ZWN0ZWRBZ2VudCA9IHJlc3VsdC5hZ2VudDtcblx0XHRcdFx0XHRcdFx0ZGV0ZWN0ZWRDb21tYW5kID0gcmVzdWx0LmNvbW1hbmQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgYWdlbnQgPSAoZGV0ZWN0ZWRBZ2VudCA/PyBhZ2VudFBhcnQ/LmFnZW50ID8/IGRlZmF1bHRBZ2VudCkhO1xuXHRcdFx0XHRcdGNvbnN0IGNvbW1hbmQgPSBkZXRlY3RlZENvbW1hbmQgPz8gYWdlbnRTbGFzaENvbW1hbmRQYXJ0Py5jb21tYW5kO1xuXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudChgb25DaGF0UGFydGljaXBhbnQ6JHthZ2VudC5pZH1gKTtcblxuXHRcdFx0XHRcdC8vIFJlY29tcHV0ZSBoaXN0b3J5IGluIGNhc2UgdGhlIGFnZW50IG9yIGNvbW1hbmQgY2hhbmdlZFxuXHRcdFx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0aGlzLmdldEhpc3RvcnlFbnRyaWVzRnJvbU1vZGVsKHJlcXVlc3RzLCBsb2NhdGlvbiwgYWdlbnQuaWQpO1xuXHRcdFx0XHRcdGNvbnN0IHJlcXVlc3RQcm9wcyA9IGJ1aWxkQWdlbnRSZXF1ZXN0KGFnZW50LCBjb21tYW5kLCBlbmFibGVDb21tYW5kRGV0ZWN0aW9uLCAhIWRldGVjdGVkQWdlbnQpO1xuXHRcdFx0XHRcdHRoaXMuZ2VuZXJhdGVJbml0aWFsQ2hhdFRpdGxlSWZOZWVkZWQobW9kZWwsIHJlcXVlc3RQcm9wcywgZGVmYXVsdEFnZW50LCB0b2tlbik7XG5cdFx0XHRcdFx0Y29uc3QgcGVuZGluZ1JlcXVlc3QgPSB0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdFx0aWYgKHBlbmRpbmdSZXF1ZXN0KSB7XG5cdFx0XHRcdFx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB5aWVsZFJlcXVlc3RlZCA9IHBlbmRpbmdSZXF1ZXN0LnlpZWxkUmVxdWVzdGVkLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRcdFx0aWYgKHJlcXVlc3QpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmNoYXRBZ2VudFNlcnZpY2Uuc2V0WWllbGRSZXF1ZXN0ZWQoYWdlbnQuaWQsIHJlcXVlc3QuaWQsIHlpZWxkUmVxdWVzdGVkKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdFx0cGVuZGluZ1JlcXVlc3QucmVxdWVzdElkID8/PSByZXF1ZXN0UHJvcHMucmVxdWVzdElkO1xuXHRcdFx0XHRcdFx0aWYgKHBlbmRpbmdSZXF1ZXN0LnJlcXVlc3RJZCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0UGVuZGluZ1JlcXVlc3RDaGFuZ2VFdmVudCwgQ2hhdFBlbmRpbmdSZXF1ZXN0Q2hhbmdlQ2xhc3NpZmljYXRpb24+KENoYXRQZW5kaW5nUmVxdWVzdENoYW5nZUV2ZW50TmFtZSwgeyBhY3Rpb246ICdhZGQnLCBzb3VyY2U6ICdzZW5kUmVxdWVzdElkJywgcmVxdWVzdElkOiBwZW5kaW5nUmVxdWVzdC5yZXF1ZXN0SWQsIGNoYXRTZXNzaW9uSWQ6IGNoYXRTZXNzaW9uUmVzb3VyY2VUb0lkKHNlc3Npb25SZXNvdXJjZSkgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gQ2hlY2sgZm9yIGRpc2FibGVkIENsYXVkZSBDb2RlIGhvb2tzIGFuZCBub3RpZnkgdGhlIHVzZXIgb25jZSBwZXIgd29ya3NwYWNlLlxuXHRcdFx0XHRcdC8vIE9ubHkgc2V0IHRoZSBmbGFnIHdoZW4gYWN0dWFsbHkgc2hvd2luZyB0aGUgaGludCwgc28gdGhlIHNldHVwIGFnZW50IGZsb3dcblx0XHRcdFx0XHQvLyAod2hpY2ggbWF5IHJlc2VuZCByZXF1ZXN0cykgZG9lc24ndCBjb25zdW1lIHRoZSBmbGFnIGJlZm9yZSB0aGUgcmVhbCByZXF1ZXN0IHJ1bnMuXG5cdFx0XHRcdFx0Y29uc3QgZGlzYWJsZWRDbGF1ZGVIb29rc0Rpc21pc3NlZEtleSA9ICdjaGF0LmRpc2FibGVkQ2xhdWRlSG9va3Mubm90aWZpY2F0aW9uJztcblx0XHRcdFx0XHRpZiAoaGFzRGlzYWJsZWRDbGF1ZGVIb29rcyAmJiAhdGhpcy5zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKGRpc2FibGVkQ2xhdWRlSG9va3NEaXNtaXNzZWRLZXksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKGRpc2FibGVkQ2xhdWRlSG9va3NEaXNtaXNzZWRLZXksIHRydWUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHRcdFx0XHRwcm9ncmVzc0NhbGxiYWNrKFt7IGtpbmQ6ICdkaXNhYmxlZENsYXVkZUhvb2tzJyB9XSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gTUNQIGF1dG9zdGFydDogb25seSBydW4gZm9yIG5hdGl2ZSBWUyBDb2RlIHNlc3Npb25zIChzaWRlYmFyLCBuZXcgZWRpdG9ycykgYnV0IG5vdCBmb3IgZXh0ZW5zaW9uIGNvbnRyaWJ1dGVkIHNlc3Npb25zIHRoYXQgaGF2ZSBpbnB1dFR5cGUgc2V0LlxuXHRcdFx0XHRcdGlmIChtb2RlbC5jYW5Vc2VUb29scykge1xuXHRcdFx0XHRcdFx0Y29uc3QgYXV0b3N0YXJ0UmVzdWx0ID0gbmV3IENoYXRNY3BTZXJ2ZXJzU3RhcnRpbmcodGhpcy5tY3BTZXJ2aWNlLmF1dG9zdGFydCh0b2tlbikpO1xuXHRcdFx0XHRcdFx0aWYgKCFhdXRvc3RhcnRSZXN1bHQuaXNFbXB0eSkge1xuXHRcdFx0XHRcdFx0XHRwcm9ncmVzc0NhbGxiYWNrKFthdXRvc3RhcnRSZXN1bHRdKTtcblx0XHRcdFx0XHRcdFx0YXdhaXQgYXV0b3N0YXJ0UmVzdWx0LndhaXQoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBhZ2VudFJlc3VsdCA9IGF3YWl0IHRoaXMuY2hhdEFnZW50U2VydmljZS5pbnZva2VBZ2VudChhZ2VudC5pZCwgcmVxdWVzdFByb3BzLCBwcm9ncmVzc0NhbGxiYWNrLCBoaXN0b3J5LCB0b2tlbik7XG5cdFx0XHRcdFx0cmF3UmVzdWx0ID0gYWdlbnRSZXN1bHQ7XG5cdFx0XHRcdFx0YWdlbnRPckNvbW1hbmRGb2xsb3d1cHMgPSB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0Rm9sbG93dXBzKGFnZW50LmlkLCByZXF1ZXN0UHJvcHMsIGFnZW50UmVzdWx0LCBoaXN0b3J5LCBmb2xsb3d1cHNDYW5jZWxUb2tlbik7XG5cdFx0XHRcdH0gZWxzZSBpZiAoY29tbWFuZFBhcnQgJiYgdGhpcy5jaGF0U2xhc2hDb21tYW5kU2VydmljZS5oYXNDb21tYW5kKGNvbW1hbmRQYXJ0LnNsYXNoQ29tbWFuZC5jb21tYW5kLCBnZXRDaGF0U2Vzc2lvblR5cGUobW9kZWwuc2Vzc2lvblJlc291cmNlKSkpIHtcblx0XHRcdFx0XHRpZiAoY29tbWFuZFBhcnQuc2xhc2hDb21tYW5kLnNpbGVudCAhPT0gdHJ1ZSkge1xuXHRcdFx0XHRcdFx0cmVxdWVzdCA9IG1vZGVsLmFkZFJlcXVlc3QocGFyc2VkUmVxdWVzdCwgeyB2YXJpYWJsZXM6IFtdIH0sIGF0dGVtcHQsIG9wdGlvbnM/Lm1vZGVJbmZvKTtcblx0XHRcdFx0XHRcdGNvbXBsZXRlUmVzcG9uc2VDcmVhdGVkKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdC8vIGNvbnRyaWJ1dGVkIHNsYXNoIGNvbW1hbmRzXG5cdFx0XHRcdFx0Ly8gVE9ETzogc3BlbGwgdGhpcyBvdXQgaW4gdGhlIFVJXG5cdFx0XHRcdFx0Y29uc3QgaGlzdG9yeTogSUNoYXRNZXNzYWdlW10gPSBbXTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IG1vZGVsUmVxdWVzdCBvZiBtb2RlbC5nZXRSZXF1ZXN0cygpKSB7XG5cdFx0XHRcdFx0XHRpZiAoIW1vZGVsUmVxdWVzdC5yZXNwb25zZSkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGhpc3RvcnkucHVzaCh7IHJvbGU6IENoYXRNZXNzYWdlUm9sZS5Vc2VyLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHZhbHVlOiBtb2RlbFJlcXVlc3QubWVzc2FnZS50ZXh0IH1dIH0pO1xuXHRcdFx0XHRcdFx0aGlzdG9yeS5wdXNoKHsgcm9sZTogQ2hhdE1lc3NhZ2VSb2xlLkFzc2lzdGFudCwgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB2YWx1ZTogbW9kZWxSZXF1ZXN0LnJlc3BvbnNlLnJlc3BvbnNlLnRvU3RyaW5nKCkgfV0gfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBwYXJzZWRSZXF1ZXN0LnRleHQ7XG5cdFx0XHRcdFx0Y29uc3QgY29tbWFuZFJlc3VsdCA9IGF3YWl0IHRoaXMuY2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZFBhcnQuc2xhc2hDb21tYW5kLmNvbW1hbmQsIG1lc3NhZ2Uuc3Vic3RyaW5nKGNvbW1hbmRQYXJ0LnNsYXNoQ29tbWFuZC5jb21tYW5kLmxlbmd0aCArIDEpLnRyaW1TdGFydCgpLCBuZXcgUHJvZ3Jlc3M8SUNoYXRQcm9ncmVzcz4ocCA9PiB7XG5cdFx0XHRcdFx0XHRwcm9ncmVzc0NhbGxiYWNrKFtwXSk7XG5cdFx0XHRcdFx0fSksIGhpc3RvcnksIGxvY2F0aW9uLCBtb2RlbC5zZXNzaW9uUmVzb3VyY2UsIHRva2VuLCBvcHRpb25zKTtcblx0XHRcdFx0XHRhZ2VudE9yQ29tbWFuZEZvbGxvd3VwcyA9IFByb21pc2UucmVzb2x2ZShjb21tYW5kUmVzdWx0Py5mb2xsb3dVcCk7XG5cdFx0XHRcdFx0cmF3UmVzdWx0ID0ge307XG5cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENhbm5vdCBoYW5kbGUgcmVxdWVzdGApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCAmJiAhcmF3UmVzdWx0KSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fSBlbHNlIGlmICghcmVxdWVzdCkge1xuXHRcdFx0XHRcdC8vIFNpbGVudCBzbGFzaCBjb21tYW5kIGNvbXBsZXRlZCBzdWNjZXNzZnVsbHkgXHUyMDE0IGFsbG93IHF1ZXVlZFxuXHRcdFx0XHRcdC8vIHJlcXVlc3RzIHRvIHByb2NlZWQuXG5cdFx0XHRcdFx0c2hvdWxkUHJvY2Vzc1BlbmRpbmcgPSAhdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQ7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGlmICghcmF3UmVzdWx0KSB7XG5cdFx0XHRcdFx0XHR0aGlzLnRyYWNlKCdzZW5kUmVxdWVzdCcsIGBQcm92aWRlciByZXR1cm5lZCBubyByZXNwb25zZSBmb3Igc2Vzc2lvbiAke21vZGVsLnNlc3Npb25SZXNvdXJjZX1gKTtcblx0XHRcdFx0XHRcdHJhd1Jlc3VsdCA9IHsgZXJyb3JEZXRhaWxzOiB7IG1lc3NhZ2U6IGxvY2FsaXplKCdlbXB0eVJlc3BvbnNlJywgXCJQcm92aWRlciByZXR1cm5lZCBudWxsIHJlc3BvbnNlXCIpIH0gfTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSByYXdSZXN1bHQuZXJyb3JEZXRhaWxzPy5yZXNwb25zZUlzRmlsdGVyZWQgPyAnZmlsdGVyZWQnIDpcblx0XHRcdFx0XHRcdHJhd1Jlc3VsdC5lcnJvckRldGFpbHMgJiYgZ290UHJvZ3Jlc3MgPyAnZXJyb3JXaXRoT3V0cHV0JyA6XG5cdFx0XHRcdFx0XHRcdHJhd1Jlc3VsdC5lcnJvckRldGFpbHMgPyAnZXJyb3InIDpcblx0XHRcdFx0XHRcdFx0XHQnc3VjY2Vzcyc7XG5cblx0XHRcdFx0XHRyZXF1ZXN0VGVsZW1ldHJ5LmNvbXBsZXRlKHtcblx0XHRcdFx0XHRcdHRpbWVUb0ZpcnN0UHJvZ3Jlc3M6IHJhd1Jlc3VsdC50aW1pbmdzPy5maXJzdFByb2dyZXNzLFxuXHRcdFx0XHRcdFx0dG90YWxUaW1lOiByYXdSZXN1bHQudGltaW5ncz8udG90YWxFbGFwc2VkLFxuXHRcdFx0XHRcdFx0cmVzdWx0LFxuXHRcdFx0XHRcdFx0cmVxdWVzdFR5cGUsXG5cdFx0XHRcdFx0XHRkZXRlY3RlZEFnZW50LFxuXHRcdFx0XHRcdFx0cmVxdWVzdCxcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdG1vZGVsLnNldFJlc3BvbnNlKHJlcXVlc3QsIHJhd1Jlc3VsdCk7XG5cdFx0XHRcdFx0Y29tcGxldGVSZXNwb25zZUNyZWF0ZWQoKTtcblx0XHRcdFx0XHR0aGlzLnRyYWNlKCdzZW5kUmVxdWVzdCcsIGBQcm92aWRlciByZXR1cm5lZCByZXNwb25zZSBmb3Igc2Vzc2lvbiAke21vZGVsLnNlc3Npb25SZXNvdXJjZX1gKTtcblxuXHRcdFx0XHRcdGlmIChyYXdSZXN1bHQuZXJyb3JEZXRhaWxzPy5pc1JhdGVMaW1pdGVkKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UubWFya0Fub255bW91c1JhdGVMaW1pdGVkKCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0c2hvdWxkUHJvY2Vzc1BlbmRpbmcgPSAhcmF3UmVzdWx0LmVycm9yRGV0YWlsc1xuXHRcdFx0XHRcdFx0JiYgIXRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkXG5cdFx0XHRcdFx0XHQmJiAhcmVxdWVzdC5yZXNwb25zZT8ucmVzcG9uc2UudmFsdWUuc29tZSh2ID0+IHYua2luZCA9PT0gJ2NvbmZpcm1hdGlvbicgJiYgIXYuaXNVc2VkKTtcblx0XHRcdFx0XHRyZXF1ZXN0LnJlc3BvbnNlPy5jb21wbGV0ZSgpO1xuXG5cdFx0XHRcdFx0aWYgKGFnZW50T3JDb21tYW5kRm9sbG93dXBzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjb21wbGV0ZWRSZXF1ZXN0ID0gcmVxdWVzdDtcblx0XHRcdFx0XHRcdGFnZW50T3JDb21tYW5kRm9sbG93dXBzLnRoZW4oZm9sbG93dXBzID0+IHtcblx0XHRcdFx0XHRcdFx0bW9kZWwuc2V0Rm9sbG93dXBzKGNvbXBsZXRlZFJlcXVlc3QsIGZvbGxvd3Vwcyk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNvbW1hbmRGb3JUZWxlbWV0cnkgPSBhZ2VudFNsYXNoQ29tbWFuZFBhcnQgPyBhZ2VudFNsYXNoQ29tbWFuZFBhcnQuY29tbWFuZC5uYW1lIDogY29tbWFuZFBhcnQ/LnNsYXNoQ29tbWFuZC5jb21tYW5kO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9jaGF0U2VydmljZVRlbGVtZXRyeS5yZXRyaWV2ZWRGb2xsb3d1cHMoYWdlbnRQYXJ0Py5hZ2VudC5pZCA/PyAnJywgY29tbWFuZEZvclRlbGVtZXRyeSwgZm9sbG93dXBzPy5sZW5ndGggPz8gMCk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIHdoaWxlIGhhbmRsaW5nIGNoYXQgcmVxdWVzdDogJHt0b0Vycm9yTWVzc2FnZShlcnIsIHRydWUpfWApO1xuXHRcdFx0XHRpZiAocmVxdWVzdCkge1xuXHRcdFx0XHRcdHJlcXVlc3RUZWxlbWV0cnkuY29tcGxldGUoe1xuXHRcdFx0XHRcdFx0dGltZVRvRmlyc3RQcm9ncmVzczogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0dG90YWxUaW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRyZXN1bHQ6ICdlcnJvcicsXG5cdFx0XHRcdFx0XHRyZXF1ZXN0VHlwZSxcblx0XHRcdFx0XHRcdGRldGVjdGVkQWdlbnQsXG5cdFx0XHRcdFx0XHRyZXF1ZXN0LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGNvbnN0IHJhd1Jlc3VsdDogSUNoYXRBZ2VudFJlc3VsdCA9IHsgZXJyb3JEZXRhaWxzOiB7IG1lc3NhZ2U6IGVyci5tZXNzYWdlIH0gfTtcblx0XHRcdFx0XHRtb2RlbC5zZXRSZXNwb25zZShyZXF1ZXN0LCByYXdSZXN1bHQpO1xuXHRcdFx0XHRcdGNvbXBsZXRlUmVzcG9uc2VDcmVhdGVkKCk7XG5cdFx0XHRcdFx0cmVxdWVzdC5yZXNwb25zZT8uY29tcGxldGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0bGV0IHNob3VsZFByb2Nlc3NQZW5kaW5nID0gZmFsc2U7XG5cdFx0Y29uc3QgcmF3UmVzcG9uc2VQcm9taXNlID0gc2VuZFJlcXVlc3RJbnRlcm5hbCgpO1xuXHRcdC8vIE5vdGUtIHJlcXVlc3RJZCBpcyBub3Qga25vd24gYXQgdGhpcyBwb2ludCwgYXNzaWduZWQgbGF0ZXJcblx0XHRjb25zdCBjYW5jZWxsYWJsZVJlcXVlc3QgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENhbmNlbGxhYmxlUmVxdWVzdCwgc291cmNlLCB1bmRlZmluZWQsIHJhd1Jlc3BvbnNlUHJvbWlzZSwgb3B0aW9ucyk7XG5cdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3RzLnNldChtb2RlbC5zZXNzaW9uUmVzb3VyY2UsIGNhbmNlbGxhYmxlUmVxdWVzdCk7XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q2hhdFBlbmRpbmdSZXF1ZXN0Q2hhbmdlRXZlbnQsIENoYXRQZW5kaW5nUmVxdWVzdENoYW5nZUNsYXNzaWZpY2F0aW9uPihDaGF0UGVuZGluZ1JlcXVlc3RDaGFuZ2VFdmVudE5hbWUsIHsgYWN0aW9uOiAnYWRkJywgc291cmNlOiAnc2VuZFJlcXVlc3QnLCBjaGF0U2Vzc2lvbklkOiBjaGF0U2Vzc2lvblJlc291cmNlVG9JZChtb2RlbC5zZXNzaW9uUmVzb3VyY2UpIH0pO1xuXHRcdHJhd1Jlc3BvbnNlUHJvbWlzZS5maW5hbGx5KCgpID0+IHtcblx0XHRcdG1hcmtDaGF0KHNlc3Npb25SZXNvdXJjZSwgQ2hhdFBlcmZNYXJrLlJlcXVlc3RDb21wbGV0ZSk7XG5cdFx0XHRjbGVhckNoYXRNYXJrcyhzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5nZXQobW9kZWwuc2Vzc2lvblJlc291cmNlKSA9PT0gY2FuY2VsbGFibGVSZXF1ZXN0KSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5kZWxldGVBbmREaXNwb3NlKG1vZGVsLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENoYXRQZW5kaW5nUmVxdWVzdENoYW5nZUV2ZW50LCBDaGF0UGVuZGluZ1JlcXVlc3RDaGFuZ2VDbGFzc2lmaWNhdGlvbj4oQ2hhdFBlbmRpbmdSZXF1ZXN0Q2hhbmdlRXZlbnROYW1lLCB7IGFjdGlvbjogJ3JlbW92ZScsIHNvdXJjZTogJ3NlbmRSZXF1ZXN0Q29tcGxldGUnLCByZXF1ZXN0SWQ6IGNhbmNlbGxhYmxlUmVxdWVzdC5yZXF1ZXN0SWQsIGNoYXRTZXNzaW9uSWQ6IGNoYXRTZXNzaW9uUmVzb3VyY2VUb0lkKG1vZGVsLnNlc3Npb25SZXNvdXJjZSkgfSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBQcm9jZXNzIHRoZSBuZXh0IHBlbmRpbmcgcmVxdWVzdCBmcm9tIHRoZSBxdWV1ZSBpZiBhbnlcblx0XHRcdGlmIChzaG91bGRQcm9jZXNzUGVuZGluZykge1xuXHRcdFx0XHR0aGlzLnByb2Nlc3NOZXh0UGVuZGluZ1JlcXVlc3QobW9kZWwpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGlmIChvcHRpb25zPy51c2VyU2VsZWN0ZWRNb2RlbElkICYmICFvcHRpb25zLmlzU3lzdGVtSW5pdGlhdGVkKSB7XG5cdFx0XHR0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5hZGRUb1JlY2VudGx5VXNlZExpc3Qob3B0aW9ucy51c2VyU2VsZWN0ZWRNb2RlbElkKTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRTdWJtaXRSZXF1ZXN0LmZpcmUoeyBjaGF0U2Vzc2lvblJlc291cmNlOiBtb2RlbC5zZXNzaW9uUmVzb3VyY2UsIG1lc3NhZ2U6IHBhcnNlZFJlcXVlc3QsIGF0dGFjaGVkQ29udGV4dDogb3B0aW9ucz8uYXR0YWNoZWRDb250ZXh0IH0pO1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZXNwb25zZUNyZWF0ZWRQcm9taXNlOiByZXNwb25zZUNyZWF0ZWQucCxcblx0XHRcdHJlc3BvbnNlQ29tcGxldGVQcm9taXNlOiByYXdSZXNwb25zZVByb21pc2UsXG5cdFx0fTtcblx0fVxuXG5cdHByb2Nlc3NQZW5kaW5nUmVxdWVzdHMoc2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX3Nlc3Npb25Nb2RlbHMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKG1vZGVsICYmICF0aGlzLl9wZW5kaW5nUmVxdWVzdHMuaGFzKHNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdHRoaXMucHJvY2Vzc05leHRQZW5kaW5nUmVxdWVzdChtb2RlbCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgc2Vzc2lvbiBpcyBiYWNrZWQgYnkgYW4gYWdlbnQgaG9zdCBzZXJ2ZXIsIHdoaWNoXG5cdCAqIGNvbnRyb2xzIHF1ZXVlZC1tZXNzYWdlIGRlcXVldWluZyBvbiB0aGUgc2VydmVyIHNpZGUuXG5cdCAqL1xuXHRwcml2YXRlIF9pc1NlcnZlck1hbmFnZWRRdWV1ZShzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBnZXRDaGF0U2Vzc2lvblR5cGUoc2Vzc2lvblJlc291cmNlKS5zdGFydHNXaXRoKCdhZ2VudC1ob3N0LScpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFByb2Nlc3MgdGhlIG5leHQgcGVuZGluZyByZXF1ZXN0IGZyb20gdGhlIG1vZGVsJ3MgcXVldWUsIGlmIGFueS5cblx0ICogQ2FsbGVkIGFmdGVyIGEgcmVxdWVzdCBjb21wbGV0ZXMgdG8gY29udGludWUgcHJvY2Vzc2luZyBxdWV1ZWQgcmVxdWVzdHMuXG5cdCAqIE11bHRpcGxlIGNvbnNlY3V0aXZlIHN0ZWVyaW5nIHJlcXVlc3RzIGFyZSBjb21iaW5lZCBpbnRvIGEgc2luZ2xlIHJlcXVlc3QuXG5cdCAqL1xuXHRwcml2YXRlIHByb2Nlc3NOZXh0UGVuZGluZ1JlcXVlc3QobW9kZWw6IENoYXRNb2RlbCk6IHZvaWQge1xuXHRcdC8vIEFnZW50IGhvc3Qgc2Vzc2lvbnMgZGVsZWdhdGUgcXVldWUgbWFuYWdlbWVudCB0byB0aGUgc2VydmVyLlxuXHRcdC8vIFRoZSBzZXJ2ZXIgZGlzcGF0Y2hlcyBDaGF0VHVyblN0YXJ0ZWQgd2l0aCBxdWV1ZWRNZXNzYWdlSWQgd2hlblxuXHRcdC8vIGl0IGNvbnN1bWVzIGEgcXVldWVkIG1lc3NhZ2UsIHNvIHRoZSBjbGllbnQgc2hvdWxkIG5vdCBkZXF1ZXVlIGVhZ2VybHkuXG5cdFx0aWYgKHRoaXMuX2lzU2VydmVyTWFuYWdlZFF1ZXVlKG1vZGVsLnNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEZXF1ZXVlIGFsbCBjb25zZWN1dGl2ZSBzdGVlcmluZyByZXF1ZXN0cyBhbmQgY29tYmluZSB0aGVtIGludG8gb25lXG5cdFx0Y29uc3Qgc3RlZXJpbmdSZXF1ZXN0cyA9IG1vZGVsLmRlcXVldWVBbGxTdGVlcmluZ1JlcXVlc3RzKCk7XG5cblx0XHQvLyBUaGVuIGRlcXVldWUgYSBzaW5nbGUgbm9uLXN0ZWVyaW5nIHJlcXVlc3QgaWYgbm8gc3RlZXJpbmcgd2FzIGZvdW5kXG5cdFx0Y29uc3QgbmV4dFF1ZXVlZCA9IHN0ZWVyaW5nUmVxdWVzdHMubGVuZ3RoID09PSAwID8gbW9kZWwuZGVxdWV1ZVBlbmRpbmdSZXF1ZXN0KCkgOiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBhbGxSZXF1ZXN0cyA9IHN0ZWVyaW5nUmVxdWVzdHMubGVuZ3RoID4gMCA/IHN0ZWVyaW5nUmVxdWVzdHMgOiAobmV4dFF1ZXVlZCA/IFtuZXh0UXVldWVkXSA6IFtdKTtcblx0XHRpZiAoYWxsUmVxdWVzdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy50cmFjZSgncHJvY2Vzc05leHRQZW5kaW5nUmVxdWVzdCcsIGBQcm9jZXNzaW5nICR7YWxsUmVxdWVzdHMubGVuZ3RofSBxdWV1ZWQgcmVxdWVzdChzKSBmb3Igc2Vzc2lvbiAke21vZGVsLnNlc3Npb25SZXNvdXJjZX1gKTtcblxuXHRcdC8vIENvbGxlY3QgYW5kIHJlbW92ZSBhbGwgZGVmZXJyZWRzXG5cdFx0Y29uc3QgZGVmZXJyZWRzOiBEZWZlcnJlZFByb21pc2U8Q2hhdFNlbmRSZXN1bHQ+W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHJlcSBvZiBhbGxSZXF1ZXN0cykge1xuXHRcdFx0Y29uc3QgZGVmZXJyZWQgPSB0aGlzLl9xdWV1ZWRSZXF1ZXN0RGVmZXJyZWRzLmdldChyZXEucmVxdWVzdC5pZCk7XG5cdFx0XHR0aGlzLl9xdWV1ZWRSZXF1ZXN0RGVmZXJyZWRzLmRlbGV0ZShyZXEucmVxdWVzdC5pZCk7XG5cdFx0XHRpZiAoZGVmZXJyZWQpIHtcblx0XHRcdFx0ZGVmZXJyZWRzLnB1c2goZGVmZXJyZWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEJ1aWxkIHNlbmQgb3B0aW9ucyBmcm9tIHRoZSBmaXJzdCByZXF1ZXN0LCBjb21iaW5pbmcgYXR0YWNobWVudHMgZnJvbSBhbGxcblx0XHRjb25zdCBmaXJzdFJlcXVlc3QgPSBhbGxSZXF1ZXN0c1swXTtcblxuXHRcdC8vIFByZXNlcnZlIHRlcm1pbmFsIGNvcnJlbGF0aW9uIG9ubHkgd2hlbiBhbGwgbWVyZ2VkIHJlcXVlc3RzIGFncmVlIG9uIHRoZVxuXHRcdC8vIHNhbWUgdGVybWluYWwuIFdpdGggc3ViYWdlbnRzLCBtdWx0aXBsZSB0ZXJtaW5hbHMgY2FuIHF1ZXVlIHN0ZWVyaW5nXG5cdFx0Ly8gcmVxdWVzdHMgc2ltdWx0YW5lb3VzbHkgXHUyMDE0IHBpY2tpbmcgb25lIGFyYml0cmFyaWx5IHdvdWxkIG1pc2F0dHJpYnV0ZSB0aGVcblx0XHQvLyBub3RpZmljYXRpb24sIHNvIHdlIGRyb3AgdGhlIElEIHdoZW4gdGhleSBjb25mbGljdC5cblx0XHRjb25zdCB0ZXJtaW5hbElkcyA9IG5ldyBTZXQoYWxsUmVxdWVzdHMubWFwKHJlcSA9PiByZXEuc2VuZE9wdGlvbnMudGVybWluYWxFeGVjdXRpb25JZCkuZmlsdGVyKChpZCk6IGlkIGlzIHN0cmluZyA9PiAhIWlkKSk7XG5cdFx0aWYgKHRlcm1pbmFsSWRzLnNpemUgPiAxKSB7XG5cdFx0XHR0aGlzLmluZm8oJ3Byb2Nlc3NOZXh0UGVuZGluZ1JlcXVlc3QnLCBgRHJvcHBpbmcgdGVybWluYWxFeGVjdXRpb25JZDogJHt0ZXJtaW5hbElkcy5zaXplfSBjb25mbGljdGluZyB0ZXJtaW5hbCBJRHMgKCR7Wy4uLnRlcm1pbmFsSWRzXS5qb2luKCcsICcpfSlgKTtcblx0XHR9XG5cdFx0Y29uc3QgbWVyZ2VkVGVybWluYWxFeGVjdXRpb25JZCA9IHRlcm1pbmFsSWRzLnNpemUgPT09IDEgPyBbLi4udGVybWluYWxJZHNdWzBdIDogdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3Qgc2VuZE9wdGlvbnM6IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zID0ge1xuXHRcdFx0Li4uZmlyc3RSZXF1ZXN0LnNlbmRPcHRpb25zLFxuXHRcdFx0dGVybWluYWxFeGVjdXRpb25JZDogbWVyZ2VkVGVybWluYWxFeGVjdXRpb25JZCxcblx0XHRcdGF0dGFjaGVkQ29udGV4dDogYWxsUmVxdWVzdHMuZmxhdE1hcChyZXEgPT4gcmVxLnJlcXVlc3QudmFyaWFibGVEYXRhLnZhcmlhYmxlcy5zbGljZSgpKSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgbG9jYXRpb24gPSBzZW5kT3B0aW9ucy5sb2NhdGlvbiA/PyBzZW5kT3B0aW9ucy5sb2NhdGlvbkRhdGE/LnR5cGUgPz8gbW9kZWwuaW5pdGlhbExvY2F0aW9uO1xuXHRcdGNvbnN0IGRlZmF1bHRBZ2VudCA9IHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXREZWZhdWx0QWdlbnQobG9jYXRpb24sIHNlbmRPcHRpb25zLm1vZGVJbmZvPy5raW5kKTtcblx0XHRpZiAoIWRlZmF1bHRBZ2VudCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ3Byb2Nlc3NOZXh0UGVuZGluZ1JlcXVlc3QnLCBgTm8gZGVmYXVsdCBhZ2VudCBmb3IgbG9jYXRpb24gJHtsb2NhdGlvbn1gKTtcblx0XHRcdGZvciAoY29uc3QgZGVmZXJyZWQgb2YgZGVmZXJyZWRzKSB7XG5cdFx0XHRcdGRlZmVycmVkLmNvbXBsZXRlKHsga2luZDogJ3JlamVjdGVkJywgcmVhc29uOiAnTm8gZGVmYXVsdCBhZ2VudCBhdmFpbGFibGUnIH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEZvciBtdWx0aXBsZSBzdGVlcmluZyByZXF1ZXN0cywgY29tYmluZSB0ZXh0cyBhbmQgcmUtcGFyc2U7IG90aGVyd2lzZSB1c2UgYXMtaXNcblx0XHRsZXQgcGFyc2VkUmVxdWVzdDogSVBhcnNlZENoYXRSZXF1ZXN0O1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoYWxsUmVxdWVzdHMubGVuZ3RoID4gMSkge1xuXHRcdFx0XHRjb25zdCBjb21iaW5lZFRleHQgPSBhbGxSZXF1ZXN0cy5tYXAocmVxID0+IHJlcS5yZXF1ZXN0Lm1lc3NhZ2UudGV4dCkuam9pbignXFxuXFxuJyk7XG5cdFx0XHRcdC8vIG1lc3NhZ2UudGV4dCBhbHJlYWR5IGluY2x1ZGVzIGFnZW50L3NsYXNoLWNvbW1hbmQgcHJlZml4ZXMgZnJvbSB0aGVcblx0XHRcdFx0Ly8gb3JpZ2luYWwgcGFyc2UsIHNvIGNsZWFyIHRoZW0gdG8gYXZvaWQgZG91YmxlLXByZWZpeGluZy5cblx0XHRcdFx0cGFyc2VkUmVxdWVzdCA9IHRoaXMucGFyc2VDaGF0UmVxdWVzdChtb2RlbC5zZXNzaW9uUmVzb3VyY2UsIGNvbWJpbmVkVGV4dCwgbG9jYXRpb24sIHtcblx0XHRcdFx0XHQuLi5zZW5kT3B0aW9ucyxcblx0XHRcdFx0XHRhZ2VudElkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c2xhc2hDb21tYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cGFyc2VkUmVxdWVzdCA9IGZpcnN0UmVxdWVzdC5yZXF1ZXN0Lm1lc3NhZ2U7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ3Byb2Nlc3NOZXh0UGVuZGluZ1JlcXVlc3Q6IGZhaWxlZCB0byBwYXJzZSBjb21iaW5lZCBjaGF0IHJlcXVlc3QnLCBlcnIpO1xuXHRcdFx0Y29uc3QgcmVhc29uID0gdG9FcnJvck1lc3NhZ2UoZXJyKTtcblx0XHRcdGZvciAoY29uc3QgZGVmZXJyZWQgb2YgZGVmZXJyZWRzKSB7XG5cdFx0XHRcdGRlZmVycmVkLmNvbXBsZXRlKHsga2luZDogJ3JlamVjdGVkJywgcmVhc29uIH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNpbGVudEFnZW50ID0gc2VuZE9wdGlvbnMuYWdlbnRJZFNpbGVudCA/IHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXRBZ2VudChzZW5kT3B0aW9ucy5hZ2VudElkU2lsZW50KSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBhZ2VudCA9IHNpbGVudEFnZW50ID8/IHBhcnNlZFJlcXVlc3QucGFydHMuZmluZCgocik6IHIgaXMgQ2hhdFJlcXVlc3RBZ2VudFBhcnQgPT4gciBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0QWdlbnRQYXJ0KT8uYWdlbnQgPz8gZGVmYXVsdEFnZW50O1xuXHRcdGNvbnN0IGFnZW50U2xhc2hDb21tYW5kUGFydCA9IHBhcnNlZFJlcXVlc3QucGFydHMuZmluZCgocik6IHIgaXMgQ2hhdFJlcXVlc3RBZ2VudFN1YmNvbW1hbmRQYXJ0ID0+IHIgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdEFnZW50U3ViY29tbWFuZFBhcnQpO1xuXG5cdFx0Y29uc3QgcmVzcG9uc2VTdGF0ZSA9IHRoaXMuX3NlbmRSZXF1ZXN0QXN5bmMobW9kZWwsIG1vZGVsLnNlc3Npb25SZXNvdXJjZSwgcGFyc2VkUmVxdWVzdCwgZmlyc3RSZXF1ZXN0LnJlcXVlc3QuYXR0ZW1wdCwgIXNlbmRPcHRpb25zLm5vQ29tbWFuZERldGVjdGlvbiwgc2lsZW50QWdlbnQgPz8gZGVmYXVsdEFnZW50LCBsb2NhdGlvbiwgc2VuZE9wdGlvbnMpO1xuXG5cdFx0Y29uc3QgcmVzdWx0OiBDaGF0U2VuZFJlc3VsdFNlbnQgPSB7XG5cdFx0XHRraW5kOiAnc2VudCcsXG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdC4uLnJlc3BvbnNlU3RhdGUsXG5cdFx0XHRcdGFnZW50LFxuXHRcdFx0XHRzbGFzaENvbW1hbmQ6IGFnZW50U2xhc2hDb21tYW5kUGFydD8uY29tbWFuZCxcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRmb3IgKGNvbnN0IGRlZmVycmVkIG9mIGRlZmVycmVkcykge1xuXHRcdFx0ZGVmZXJyZWQuY29tcGxldGUocmVzdWx0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdlbmVyYXRlSW5pdGlhbENoYXRUaXRsZUlmTmVlZGVkKG1vZGVsOiBDaGF0TW9kZWwsIHJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0LCBkZWZhdWx0QWdlbnQ6IElDaGF0QWdlbnREYXRhLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiB2b2lkIHtcblx0XHQvLyBHZW5lcmF0ZSBhIHRpdGxlIG9ubHkgZm9yIHRoZSBmaXJzdCByZXF1ZXN0LCBhbmQgb25seSB2aWEgdGhlIGRlZmF1bHQgYWdlbnQuXG5cdFx0Ly8gVXNlIGEgc2luZ2xlLWVudHJ5IGhpc3RvcnkgYmFzZWQgb24gdGhlIGN1cnJlbnQgcmVxdWVzdCAobm8gZnVsbCBjaGF0IGhpc3RvcnkpLlxuXHRcdGlmIChtb2RlbC5nZXRSZXF1ZXN0cygpLmxlbmd0aCAhPT0gMSB8fCBtb2RlbC5jdXN0b21UaXRsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNpbmdsZUVudHJ5SGlzdG9yeTogSUNoYXRBZ2VudEhpc3RvcnlFbnRyeVtdID0gW3tcblx0XHRcdHJlcXVlc3QsXG5cdFx0XHRyZXNwb25zZTogW10sXG5cdFx0XHRyZXN1bHQ6IHt9XG5cdFx0fV07XG5cdFx0Y29uc3QgZ2VuZXJhdGUgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0aXRsZSA9IGF3YWl0IHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXRDaGF0VGl0bGUoZGVmYXVsdEFnZW50LmlkLCBzaW5nbGVFbnRyeUhpc3RvcnksIHRva2VuKTtcblx0XHRcdGlmICh0aXRsZSAmJiAhbW9kZWwuY3VzdG9tVGl0bGUpIHtcblx0XHRcdFx0bW9kZWwuc2V0Q3VzdG9tVGl0bGUodGl0bGUpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dm9pZCBnZW5lcmF0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBwcmVwYXJlQ29udGV4dChhdHRhY2hlZENvbnRleHRWYXJpYWJsZXM6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSB8IHVuZGVmaW5lZCk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSB7XG5cdFx0YXR0YWNoZWRDb250ZXh0VmFyaWFibGVzID8/PSBbXTtcblxuXHRcdC8vIFwicmV2ZXJzZVwiLCBoaWdoIGluZGV4IGZpcnN0IHNvIHRoYXQgcmVwbGFjZW1lbnQgaXMgc2ltcGxlXG5cdFx0YXR0YWNoZWRDb250ZXh0VmFyaWFibGVzLnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdC8vIElmIGVpdGhlciByYW5nZSBpcyB1bmRlZmluZWQsIHNvcnQgaXQgdG8gdGhlIGJhY2tcblx0XHRcdGlmICghYS5yYW5nZSAmJiAhYi5yYW5nZSkge1xuXHRcdFx0XHRyZXR1cm4gMDsgLy8gS2VlcCByZWxhdGl2ZSBvcmRlciBpZiBib3RoIHJhbmdlcyBhcmUgdW5kZWZpbmVkXG5cdFx0XHR9XG5cdFx0XHRpZiAoIWEucmFuZ2UpIHtcblx0XHRcdFx0cmV0dXJuIDE7IC8vIGEgZ29lcyBhZnRlciBiXG5cdFx0XHR9XG5cdFx0XHRpZiAoIWIucmFuZ2UpIHtcblx0XHRcdFx0cmV0dXJuIC0xOyAvLyBhIGdvZXMgYmVmb3JlIGJcblx0XHRcdH1cblx0XHRcdHJldHVybiBiLnJhbmdlLnN0YXJ0IC0gYS5yYW5nZS5zdGFydDtcblx0XHR9KTtcblxuXHRcdHJldHVybiBhdHRhY2hlZENvbnRleHRWYXJpYWJsZXM7XG5cdH1cblxuXHRwcml2YXRlIGdldEhpc3RvcnlFbnRyaWVzRnJvbU1vZGVsKHJlcXVlc3RzOiBJQ2hhdFJlcXVlc3RNb2RlbFtdLCBsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24sIGZvckFnZW50SWQ6IHN0cmluZyk6IElDaGF0QWdlbnRIaXN0b3J5RW50cnlbXSB7XG5cdFx0Y29uc3QgaGlzdG9yeTogSUNoYXRBZ2VudEhpc3RvcnlFbnRyeVtdID0gW107XG5cdFx0Y29uc3QgYWdlbnQgPSB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0QWdlbnQoZm9yQWdlbnRJZCk7XG5cdFx0Zm9yIChjb25zdCByZXF1ZXN0IG9mIHJlcXVlc3RzKSB7XG5cdFx0XHRpZiAoIXJlcXVlc3QucmVzcG9uc2UpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChmb3JBZ2VudElkICE9PSByZXF1ZXN0LnJlc3BvbnNlLmFnZW50Py5pZCAmJiAhYWdlbnQ/LmlzRGVmYXVsdCAmJiAhYWdlbnQ/LmNhbkFjY2Vzc1ByZXZpb3VzQ2hhdEhpc3RvcnkpIHtcblx0XHRcdFx0Ly8gQW4gYWdlbnQgb25seSBnZXRzIHRvIHNlZSByZXF1ZXN0cyB0aGF0IHdlcmUgc2VudCB0byB0aGlzIGFnZW50LlxuXHRcdFx0XHQvLyBUaGUgZGVmYXVsdCBhZ2VudCAodGhlIHVuZGVmaW5lZCBjYXNlKSwgb3IgYWdlbnRzIHdpdGggJ2NhbkFjY2Vzc1ByZXZpb3VzQ2hhdEhpc3RvcnknLCBnZXQgdG8gc2VlIGFsbCBvZiB0aGVtLlxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRG8gbm90IHNhdmUgdG8gaGlzdG9yeSBpbmxpbmUgY29tcGxldGlvbnNcblx0XHRcdGlmIChsb2NhdGlvbiA9PT0gQ2hhdEFnZW50TG9jYXRpb24uRWRpdG9ySW5saW5lKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwcm9tcHRUZXh0UmVzdWx0ID0gZ2V0UHJvbXB0VGV4dChyZXF1ZXN0Lm1lc3NhZ2UpO1xuXHRcdFx0Y29uc3QgaGlzdG9yeVJlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0ID0ge1xuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHJlcXVlc3Quc2Vzc2lvbi5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdHJlcXVlc3RJZDogcmVxdWVzdC5pZCxcblx0XHRcdFx0YWdlbnRJZDogcmVxdWVzdC5yZXNwb25zZS5hZ2VudD8uaWQgPz8gJycsXG5cdFx0XHRcdG1lc3NhZ2U6IHByb21wdFRleHRSZXN1bHQubWVzc2FnZSxcblx0XHRcdFx0Y29tbWFuZDogcmVxdWVzdC5yZXNwb25zZS5zbGFzaENvbW1hbmQ/Lm5hbWUsXG5cdFx0XHRcdHZhcmlhYmxlczogdXBkYXRlUmFuZ2VzKHJlcXVlc3QudmFyaWFibGVEYXRhLCBwcm9tcHRUZXh0UmVzdWx0LmRpZmYpLCAvLyBUT0RPIGJpdCBvZiBhIGhhY2tcblx0XHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRcdGVkaXRlZEZpbGVFdmVudHM6IHJlcXVlc3QuZWRpdGVkRmlsZUV2ZW50cyxcblx0XHRcdFx0bW9kZUluc3RydWN0aW9uczogcmVxdWVzdC5tb2RlSW5mbz8ubW9kZUluc3RydWN0aW9ucyxcblx0XHRcdH07XG5cdFx0XHRoaXN0b3J5LnB1c2goeyByZXF1ZXN0OiBoaXN0b3J5UmVxdWVzdCwgcmVzcG9uc2U6IHRvQ2hhdEhpc3RvcnlDb250ZW50KHJlcXVlc3QucmVzcG9uc2UucmVzcG9uc2UudmFsdWUpLCByZXN1bHQ6IHJlcXVlc3QucmVzcG9uc2UucmVzdWx0ID8/IHt9IH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBoaXN0b3J5O1xuXHR9XG5cblx0YXN5bmMgcmVtb3ZlUmVxdWVzdChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgcmVxdWVzdElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX3Nlc3Npb25Nb2RlbHMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHNlc3Npb246ICR7c2Vzc2lvblJlc291cmNlfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBlbmRpbmdSZXF1ZXN0ID0gdGhpcy5fcGVuZGluZ1JlcXVlc3RzLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmIChwZW5kaW5nUmVxdWVzdD8ucmVxdWVzdElkID09PSByZXF1ZXN0SWQpIHtcblx0XHRcdHBlbmRpbmdSZXF1ZXN0LmNhbmNlbCgpO1xuXHRcdFx0dGhpcy5fcGVuZGluZ1JlcXVlc3RzLmRlbGV0ZUFuZERpc3Bvc2Uoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENoYXRQZW5kaW5nUmVxdWVzdENoYW5nZUV2ZW50LCBDaGF0UGVuZGluZ1JlcXVlc3RDaGFuZ2VDbGFzc2lmaWNhdGlvbj4oQ2hhdFBlbmRpbmdSZXF1ZXN0Q2hhbmdlRXZlbnROYW1lLCB7IGFjdGlvbjogJ3JlbW92ZScsIHNvdXJjZTogJ3JlbW92ZVJlcXVlc3QnLCByZXF1ZXN0SWQsIGNoYXRTZXNzaW9uSWQ6IGNoYXRTZXNzaW9uUmVzb3VyY2VUb0lkKG1vZGVsLnNlc3Npb25SZXNvdXJjZSkgfSk7XG5cdFx0fVxuXG5cdFx0bW9kZWwucmVtb3ZlUmVxdWVzdChyZXF1ZXN0SWQpO1xuXHR9XG5cblx0YXN5bmMgYWRvcHRSZXF1ZXN0KHNlc3Npb25SZXNvdXJjZTogVVJJLCByZXF1ZXN0OiBJQ2hhdFJlcXVlc3RNb2RlbCkge1xuXHRcdGlmICghKHJlcXVlc3QgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdE1vZGVsKSkge1xuXHRcdFx0dGhyb3cgbmV3IFR5cGVFcnJvcignQ2FuIG9ubHkgYWRvcHQgcmVxdWVzdHMgb2YgdHlwZSBDaGF0UmVxdWVzdE1vZGVsJyk7XG5cdFx0fVxuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuX3Nlc3Npb25Nb2RlbHMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCF0YXJnZXQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biBzZXNzaW9uOiAke3Nlc3Npb25SZXNvdXJjZX1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBvbGRPd25lciA9IHJlcXVlc3Quc2Vzc2lvbjtcblx0XHR0YXJnZXQuYWRvcHRSZXF1ZXN0KHJlcXVlc3QpO1xuXG5cdFx0aWYgKHJlcXVlc3QucmVzcG9uc2UgJiYgIXJlcXVlc3QucmVzcG9uc2UuaXNDb21wbGV0ZSkge1xuXHRcdFx0Y29uc3QgY3RzID0gdGhpcy5fcGVuZGluZ1JlcXVlc3RzLmRlbGV0ZUFuZExlYWsob2xkT3duZXIuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmIChjdHMpIHtcblx0XHRcdFx0Y3RzLnJlcXVlc3RJZCA9IHJlcXVlc3QuaWQ7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5zZXQodGFyZ2V0LnNlc3Npb25SZXNvdXJjZSwgY3RzKTtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q2hhdFBlbmRpbmdSZXF1ZXN0Q2hhbmdlRXZlbnQsIENoYXRQZW5kaW5nUmVxdWVzdENoYW5nZUNsYXNzaWZpY2F0aW9uPihDaGF0UGVuZGluZ1JlcXVlc3RDaGFuZ2VFdmVudE5hbWUsIHsgYWN0aW9uOiAncmVtb3ZlJywgc291cmNlOiAnYWRvcHRSZXF1ZXN0JywgcmVxdWVzdElkOiByZXF1ZXN0LmlkLCBjaGF0U2Vzc2lvbklkOiBjaGF0U2Vzc2lvblJlc291cmNlVG9JZChvbGRPd25lci5zZXNzaW9uUmVzb3VyY2UpIH0pO1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxDaGF0UGVuZGluZ1JlcXVlc3RDaGFuZ2VFdmVudCwgQ2hhdFBlbmRpbmdSZXF1ZXN0Q2hhbmdlQ2xhc3NpZmljYXRpb24+KENoYXRQZW5kaW5nUmVxdWVzdENoYW5nZUV2ZW50TmFtZSwgeyBhY3Rpb246ICdhZGQnLCBzb3VyY2U6ICdhZG9wdFJlcXVlc3QnLCByZXF1ZXN0SWQ6IHJlcXVlc3QuaWQsIGNoYXRTZXNzaW9uSWQ6IGNoYXRTZXNzaW9uUmVzb3VyY2VUb0lkKHRhcmdldC5zZXNzaW9uUmVzb3VyY2UpIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGFkZENvbXBsZXRlUmVxdWVzdChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgbWVzc2FnZTogSVBhcnNlZENoYXRSZXF1ZXN0IHwgc3RyaW5nLCB2YXJpYWJsZURhdGE6IElDaGF0UmVxdWVzdFZhcmlhYmxlRGF0YSB8IHVuZGVmaW5lZCwgYXR0ZW1wdDogbnVtYmVyIHwgdW5kZWZpbmVkLCByZXNwb25zZTogSUNoYXRDb21wbGV0ZVJlc3BvbnNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy50cmFjZSgnYWRkQ29tcGxldGVSZXF1ZXN0JywgYG1lc3NhZ2U6ICR7bWVzc2FnZX1gKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fc2Vzc2lvbk1vZGVscy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gc2Vzc2lvbjogJHtzZXNzaW9uUmVzb3VyY2V9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFyc2VkUmVxdWVzdCA9IHR5cGVvZiBtZXNzYWdlID09PSAnc3RyaW5nJyA/XG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0UGFyc2VyKS5wYXJzZUNoYXRSZXF1ZXN0KHNlc3Npb25SZXNvdXJjZSwgbWVzc2FnZSkgOlxuXHRcdFx0bWVzc2FnZTtcblx0XHRjb25zdCByZXF1ZXN0ID0gbW9kZWwuYWRkUmVxdWVzdChwYXJzZWRSZXF1ZXN0LCB2YXJpYWJsZURhdGEgfHwgeyB2YXJpYWJsZXM6IFtdIH0sIGF0dGVtcHQgPz8gMCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0aWYgKHR5cGVvZiByZXNwb25zZS5tZXNzYWdlID09PSAnc3RyaW5nJykge1xuXHRcdFx0Ly8gVE9ETyBpcyB0aGlzIHBvc3NpYmxlP1xuXHRcdFx0bW9kZWwuYWNjZXB0UmVzcG9uc2VQcm9ncmVzcyhyZXF1ZXN0LCB7IGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhyZXNwb25zZS5tZXNzYWdlKSwga2luZDogJ21hcmtkb3duQ29udGVudCcgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZvciAoY29uc3QgcGFydCBvZiByZXNwb25zZS5tZXNzYWdlKSB7XG5cdFx0XHRcdG1vZGVsLmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgcGFydCwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdG1vZGVsLnNldFJlc3BvbnNlKHJlcXVlc3QsIHJlc3BvbnNlLnJlc3VsdCB8fCB7fSk7XG5cdFx0aWYgKHJlc3BvbnNlLmZvbGxvd3VwcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRtb2RlbC5zZXRGb2xsb3d1cHMocmVxdWVzdCwgcmVzcG9uc2UuZm9sbG93dXBzKTtcblx0XHR9XG5cdFx0cmVxdWVzdC5yZXNwb25zZT8uY29tcGxldGUoKTtcblx0fVxuXG5cdGFzeW5jIGNhbmNlbEN1cnJlbnRSZXF1ZXN0Rm9yU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgc291cmNlPzogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy50cmFjZSgnY2FuY2VsQ3VycmVudFJlcXVlc3RGb3JTZXNzaW9uJywgYHNlc3Npb246ICR7c2Vzc2lvblJlc291cmNlfWApO1xuXHRcdGNvbnN0IHBlbmRpbmdSZXF1ZXN0ID0gdGhpcy5fcGVuZGluZ1JlcXVlc3RzLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghcGVuZGluZ1JlcXVlc3QpIHtcblx0XHRcdGlmIChzb3VyY2UgIT09ICdhcmNoaXZlJykge1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX3Nlc3Npb25Nb2RlbHMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IHJlcXVlc3RJblByb2dyZXNzID0gbW9kZWw/LnJlcXVlc3RJblByb2dyZXNzLmdldCgpO1xuXHRcdFx0XHRjb25zdCBwZW5kaW5nUmVxdWVzdHNDb3VudCA9IG1vZGVsPy5nZXRQZW5kaW5nUmVxdWVzdHMoKS5sZW5ndGggPz8gMDtcblx0XHRcdFx0Y29uc3QgbGFzdFJlcXVlc3QgPSBtb2RlbD8ubGFzdFJlcXVlc3Q7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENoYXRTdG9wQ2FuY2VsbGF0aW9uTm9vcEV2ZW50LCBDaGF0U3RvcENhbmNlbGxhdGlvbk5vb3BDbGFzc2lmaWNhdGlvbj4oQ2hhdFN0b3BDYW5jZWxsYXRpb25Ob29wRXZlbnROYW1lLCB7XG5cdFx0XHRcdFx0c291cmNlOiBzb3VyY2UgPz8gJ2NoYXRTZXJ2aWNlJyxcblx0XHRcdFx0XHRyZWFzb246ICdub1BlbmRpbmdSZXF1ZXN0Jyxcblx0XHRcdFx0XHRyZXF1ZXN0SW5Qcm9ncmVzczogcmVxdWVzdEluUHJvZ3Jlc3MgPT09IHVuZGVmaW5lZCA/ICd1bmtub3duJyA6IHJlcXVlc3RJblByb2dyZXNzID8gJ3RydWUnIDogJ2ZhbHNlJyxcblx0XHRcdFx0XHRwZW5kaW5nUmVxdWVzdHM6IHBlbmRpbmdSZXF1ZXN0c0NvdW50LFxuXHRcdFx0XHRcdHNlc3Npb25TY2hlbWU6IHNlc3Npb25SZXNvdXJjZS5zY2hlbWUsXG5cdFx0XHRcdFx0bGFzdFJlcXVlc3RJZDogbGFzdFJlcXVlc3Q/LmlkLFxuXHRcdFx0XHRcdGNoYXRTZXNzaW9uSWQ6IGNoYXRTZXNzaW9uUmVzb3VyY2VUb0lkKHNlc3Npb25SZXNvdXJjZSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHR0aGlzLmluZm8oJ2NhbmNlbEN1cnJlbnRSZXF1ZXN0Rm9yU2Vzc2lvbicsIGBObyBwZW5kaW5nIHJlcXVlc3Qgd2FzIGZvdW5kIGZvciBzZXNzaW9uICR7c2Vzc2lvblJlc291cmNlfS4gcmVxdWVzdEluUHJvZ3Jlc3M9JHtyZXF1ZXN0SW5Qcm9ncmVzcyA/PyAndW5rbm93bid9LCBwZW5kaW5nUmVxdWVzdHM9JHtwZW5kaW5nUmVxdWVzdHNDb3VudH1gKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZXNwb25zZUNvbXBsZXRlUHJvbWlzZSA9IHBlbmRpbmdSZXF1ZXN0LnJlc3BvbnNlQ29tcGxldGVQcm9taXNlO1xuXHRcdHBlbmRpbmdSZXF1ZXN0LmNhbmNlbCgpO1xuXHRcdHRoaXMuX3BlbmRpbmdSZXF1ZXN0cy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q2hhdFBlbmRpbmdSZXF1ZXN0Q2hhbmdlRXZlbnQsIENoYXRQZW5kaW5nUmVxdWVzdENoYW5nZUNsYXNzaWZpY2F0aW9uPihDaGF0UGVuZGluZ1JlcXVlc3RDaGFuZ2VFdmVudE5hbWUsIHsgYWN0aW9uOiAncmVtb3ZlJywgc291cmNlOiBzb3VyY2UgPz8gJ2NhbmNlbFJlcXVlc3QnLCByZXF1ZXN0SWQ6IHBlbmRpbmdSZXF1ZXN0LnJlcXVlc3RJZCwgY2hhdFNlc3Npb25JZDogY2hhdFNlc3Npb25SZXNvdXJjZVRvSWQoc2Vzc2lvblJlc291cmNlKSB9KTtcblxuXHRcdGlmIChyZXNwb25zZUNvbXBsZXRlUHJvbWlzZSkge1xuXHRcdFx0YXdhaXQgcmFjZVRpbWVvdXQocmVzcG9uc2VDb21wbGV0ZVByb21pc2UsIDEwMDApO1xuXHRcdH1cblx0fVxuXG5cdHNldFlpZWxkUmVxdWVzdGVkKHNlc3Npb25SZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3QgcGVuZGluZ1JlcXVlc3QgPSB0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKHBlbmRpbmdSZXF1ZXN0KSB7XG5cdFx0XHRwZW5kaW5nUmVxdWVzdC5zZXRZaWVsZFJlcXVlc3RlZCgpO1xuXHRcdH1cblx0fVxuXG5cdG1pZ3JhdGVSZXF1ZXN0cyhvcmlnaW5hbFJlc291cmNlOiBVUkksIHRhcmdldFJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX3Nlc3Npb25Nb2RlbHMuZ2V0KG9yaWdpbmFsUmVzb3VyY2UpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwZW5kaW5nUmVxdWVzdHMgPSBbLi4ubW9kZWwuZ2V0UGVuZGluZ1JlcXVlc3RzKCldO1xuXG5cdFx0aWYgKHBlbmRpbmdSZXF1ZXN0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSZW1vdmUgZWFjaCByZW1haW5pbmcgcGVuZGluZyByZXF1ZXN0IGZyb20gdGhlIG9yaWdpbmFsIHNlc3Npb25cblx0XHRmb3IgKGNvbnN0IHBlbmRpbmcgb2YgcGVuZGluZ1JlcXVlc3RzKSB7XG5cdFx0XHR0aGlzLnJlbW92ZVBlbmRpbmdSZXF1ZXN0KG9yaWdpbmFsUmVzb3VyY2UsIHBlbmRpbmcucmVxdWVzdC5pZCk7XG5cdFx0fVxuXG5cdFx0Ly8gUmUtc2VuZCByZW1haW5pbmcgcXVldWVkIHJlcXVlc3RzXG5cdFx0Zm9yIChjb25zdCBwZW5kaW5nIG9mIHBlbmRpbmdSZXF1ZXN0cykge1xuXHRcdFx0dm9pZCB0aGlzLnNlbmRSZXF1ZXN0KHRhcmdldFJlc291cmNlLCBwZW5kaW5nLnJlcXVlc3QubWVzc2FnZS50ZXh0LCB7XG5cdFx0XHRcdC4uLnBlbmRpbmcuc2VuZE9wdGlvbnMsXG5cdFx0XHRcdHF1ZXVlOiBwZW5kaW5nLmtpbmQsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRyZW1vdmVQZW5kaW5nUmVxdWVzdChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgcmVxdWVzdElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX3Nlc3Npb25Nb2RlbHMuZ2V0KHNlc3Npb25SZXNvdXJjZSkgYXMgQ2hhdE1vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChtb2RlbCkge1xuXHRcdFx0bW9kZWwucmVtb3ZlUGVuZGluZ1JlcXVlc3QocmVxdWVzdElkKTtcblxuXHRcdFx0Ly8gSWYgdGhlcmUgYXJlIG5vIG1vcmUgc3RlZXJpbmcgcmVxdWVzdHMgcGVuZGluZywgcmVzZXQgeWllbGRSZXF1ZXN0ZWQgb24gdGhlIGFjdGl2ZSByZXF1ZXN0XG5cdFx0XHRjb25zdCBoYXNTdGVlcmluZ1JlcXVlc3RzID0gbW9kZWwuZ2V0UGVuZGluZ1JlcXVlc3RzKCkuc29tZShyID0+IHIua2luZCA9PT0gQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuU3RlZXJpbmcpO1xuXHRcdFx0aWYgKCFoYXNTdGVlcmluZ1JlcXVlc3RzKSB7XG5cdFx0XHRcdGNvbnN0IHBlbmRpbmdSZXF1ZXN0ID0gdGhpcy5fcGVuZGluZ1JlcXVlc3RzLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHRwZW5kaW5nUmVxdWVzdD8ucmVzZXRZaWVsZFJlcXVlc3RlZCgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJlamVjdCB0aGUgZGVmZXJyZWQgcHJvbWlzZSBmb3IgdGhlIHJlbW92ZWQgcmVxdWVzdFxuXHRcdGNvbnN0IGRlZmVycmVkID0gdGhpcy5fcXVldWVkUmVxdWVzdERlZmVycmVkcy5nZXQocmVxdWVzdElkKTtcblx0XHRpZiAoZGVmZXJyZWQpIHtcblx0XHRcdGRlZmVycmVkLmNvbXBsZXRlKHsga2luZDogJ3JlamVjdGVkJywgcmVhc29uOiAnUmVxdWVzdCB3YXMgcmVtb3ZlZCBmcm9tIHF1ZXVlJywgcmVhc29uQ29kZTogJ2NhbmNlbGxlZCcgfSk7XG5cdFx0XHR0aGlzLl9xdWV1ZWRSZXF1ZXN0RGVmZXJyZWRzLmRlbGV0ZShyZXF1ZXN0SWQpO1xuXHRcdH1cblx0fVxuXG5cdHNldFBlbmRpbmdSZXF1ZXN0cyhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgcmVxdWVzdHM6IHJlYWRvbmx5IHsgcmVxdWVzdElkOiBzdHJpbmc7IGtpbmQ6IENoYXRSZXF1ZXN0UXVldWVLaW5kIH1bXSk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fc2Vzc2lvbk1vZGVscy5nZXQoc2Vzc2lvblJlc291cmNlKSBhcyBDaGF0TW9kZWwgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRtb2RlbC5zZXRQZW5kaW5nUmVxdWVzdHMocmVxdWVzdHMpO1xuXHRcdH1cblx0fVxuXG5cdHN5bmNQZW5kaW5nUmVxdWVzdHNGcm9tUmVtb3RlKHNlc3Npb25SZXNvdXJjZTogVVJJLCByZXF1ZXN0czogcmVhZG9ubHkgSVJlbW90ZVBlbmRpbmdSZXF1ZXN0W10pOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX3Nlc3Npb25Nb2RlbHMuZ2V0KHNlc3Npb25SZXNvdXJjZSkgYXMgQ2hhdE1vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBleGlzdGluZyA9IG1vZGVsLmdldFBlbmRpbmdSZXF1ZXN0cygpO1xuXHRcdGNvbnN0IGV4aXN0aW5nQnlJZCA9IG5ldyBNYXAoZXhpc3RpbmcubWFwKHJlcXVlc3QgPT4gW3JlcXVlc3QucmVxdWVzdC5pZCwgcmVxdWVzdF0pKTtcblx0XHRjb25zdCByZWNvbmNpbGVkOiBJQ2hhdFBlbmRpbmdSZXF1ZXN0W10gPSByZXF1ZXN0cy5tYXAocmVtb3RlID0+IHtcblx0XHRcdGNvbnN0IHZhcmlhYmxlRGF0YSA9IHJlbW90ZS52YXJpYWJsZURhdGEgPz8geyB2YXJpYWJsZXM6IFtdIH07XG5cdFx0XHRjb25zdCBsb2NhbCA9IGV4aXN0aW5nQnlJZC5nZXQocmVtb3RlLmlkKTtcblx0XHRcdGlmIChsb2NhbCAmJiBsb2NhbC5yZXF1ZXN0Lm1lc3NhZ2UudGV4dCA9PT0gcmVtb3RlLm1lc3NhZ2UgJiYgZXF1YWxzKGxvY2FsLnJlcXVlc3QudmFyaWFibGVEYXRhLCB2YXJpYWJsZURhdGEpKSB7XG5cdFx0XHRcdHJldHVybiBsb2NhbC5raW5kID09PSByZW1vdGUua2luZCA/IGxvY2FsIDogeyAuLi5sb2NhbCwga2luZDogcmVtb3RlLmtpbmQgfTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhcnNlZFJlcXVlc3QgPSB0aGlzLnBhcnNlQ2hhdFJlcXVlc3Qoc2Vzc2lvblJlc291cmNlLCByZW1vdGUubWVzc2FnZSwgbW9kZWwuaW5pdGlhbExvY2F0aW9uLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgcmVxdWVzdE1vZGVsID0gbmV3IENoYXRSZXF1ZXN0TW9kZWwoe1xuXHRcdFx0XHRzZXNzaW9uOiBtb2RlbCxcblx0XHRcdFx0bWVzc2FnZTogcGFyc2VkUmVxdWVzdCxcblx0XHRcdFx0dmFyaWFibGVEYXRhLFxuXHRcdFx0XHR0aW1lc3RhbXA6IHJlbW90ZS50aW1lc3RhbXAsXG5cdFx0XHRcdGF0dGFjaGVkQ29udGV4dDogdmFyaWFibGVEYXRhLnZhcmlhYmxlcy5zbGljZSgpLFxuXHRcdFx0XHRyZXN0b3JlZElkOiByZW1vdGUuaWQsXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiB7IHJlcXVlc3Q6IHJlcXVlc3RNb2RlbCwga2luZDogcmVtb3RlLmtpbmQsIHNlbmRPcHRpb25zOiBsb2NhbD8uc2VuZE9wdGlvbnMgPz8ge30gfTtcblx0XHR9KTtcblxuXHRcdGlmIChleGlzdGluZy5sZW5ndGggPT09IHJlY29uY2lsZWQubGVuZ3RoICYmIHJlY29uY2lsZWQuZXZlcnkoKHJlcXVlc3QsIGluZGV4KSA9PiBleGlzdGluZ1tpbmRleF0gPT09IHJlcXVlc3QpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVjb25jaWxlZElkcyA9IG5ldyBTZXQocmVjb25jaWxlZC5tYXAocmVxdWVzdCA9PiByZXF1ZXN0LnJlcXVlc3QuaWQpKTtcblx0XHRtb2RlbC5yZXBsYWNlUGVuZGluZ1JlcXVlc3RzKHJlY29uY2lsZWQpO1xuXG5cdFx0Zm9yIChjb25zdCBsb2NhbCBvZiBleGlzdGluZykge1xuXHRcdFx0aWYgKHJlY29uY2lsZWRJZHMuaGFzKGxvY2FsLnJlcXVlc3QuaWQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGVmZXJyZWQgPSB0aGlzLl9xdWV1ZWRSZXF1ZXN0RGVmZXJyZWRzLmdldChsb2NhbC5yZXF1ZXN0LmlkKTtcblx0XHRcdGlmIChkZWZlcnJlZCkge1xuXHRcdFx0XHRkZWZlcnJlZC5jb21wbGV0ZSh7IGtpbmQ6ICdyZWplY3RlZCcsIHJlYXNvbjogJ1JlcXVlc3QgaXMgbm8gbG9uZ2VyIGluIHRoZSBwcm92aWRlciBxdWV1ZScsIHJlYXNvbkNvZGU6ICdwcm92aWRlclJlbW92ZWQnIH0pO1xuXHRcdFx0XHR0aGlzLl9xdWV1ZWRSZXF1ZXN0RGVmZXJyZWRzLmRlbGV0ZShsb2NhbC5yZXF1ZXN0LmlkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXJlY29uY2lsZWQuc29tZShyZXF1ZXN0ID0+IHJlcXVlc3Qua2luZCA9PT0gQ2hhdFJlcXVlc3RRdWV1ZUtpbmQuU3RlZXJpbmcpKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nUmVxdWVzdHMuZ2V0KHNlc3Npb25SZXNvdXJjZSk/LnJlc2V0WWllbGRSZXF1ZXN0ZWQoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzZW5kUGVuZGluZ1JlcXVlc3RJbW1lZGlhdGVseShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgcmVxdWVzdElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX3Nlc3Npb25Nb2RlbHMuZ2V0KHNlc3Npb25SZXNvdXJjZSkgYXMgQ2hhdE1vZGVsIHwgdW5kZWZpbmVkO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwZW5kaW5nUmVxdWVzdHMgPSBtb2RlbC5nZXRQZW5kaW5nUmVxdWVzdHMoKTtcblx0XHRjb25zdCB0YXJnZXQgPSBwZW5kaW5nUmVxdWVzdHMuZmluZChyID0+IHIucmVxdWVzdC5pZCA9PT0gcmVxdWVzdElkKTtcblx0XHRpZiAoIXRhcmdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9pc1NlcnZlck1hbmFnZWRRdWV1ZShzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHQvLyBBZ2VudCBob3N0IHF1ZXVlcyBhcmUgZHJhaW5lZCBieSB0aGUgc2VydmVyLCB3aGljaCBpbnRlbnRpb25hbGx5XG5cdFx0XHQvLyBza2lwcyBwZW5kaW5nIG1lc3NhZ2VzIG9uIGNhbmNlbGxhdGlvbi4gU28gcmVtb3ZlIHRoZSBtZXNzYWdlXG5cdFx0XHQvLyAoY2xlYXJpbmcgaXQgc2VydmVyLXNpZGUpIGFuZCByZS1zZW5kIGl0IGFzIGEgbm9ybWFsIHR1cm4gYWZ0ZXJcblx0XHRcdC8vIGNhbmNlbGxpbmcuIFJlbW92ZSBiZWZvcmUgc2VuZGluZyB0byBhdm9pZCB0aGUgc2VydmVyIGFsc29cblx0XHRcdC8vIGF1dG8tZHJhaW5pbmcgaXQgKGRvdWJsZSBzZW5kKTsgcmVzdG9yZSBpdCBvbiBmYWlsdXJlIHNvIGFcblx0XHRcdC8vIHJlamVjdGVkIHJlLXNlbmQgZG9lc24ndCBzaWxlbnRseSBkcm9wIHRoZSBtZXNzYWdlLlxuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IHRhcmdldC5yZXF1ZXN0Lm1lc3NhZ2UudGV4dDtcblx0XHRcdGNvbnN0IGF0dGFjaGVkQ29udGV4dCA9IHRhcmdldC5yZXF1ZXN0LnZhcmlhYmxlRGF0YS52YXJpYWJsZXMuc2xpY2UoKTtcblx0XHRcdGNvbnN0IHNlbmRPcHRpb25zOiBJQ2hhdFNlbmRSZXF1ZXN0T3B0aW9ucyA9IHtcblx0XHRcdFx0Li4udGFyZ2V0LnNlbmRPcHRpb25zLFxuXHRcdFx0XHRxdWV1ZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRhdHRhY2hlZENvbnRleHQsXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5yZW1vdmVQZW5kaW5nUmVxdWVzdChzZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3RJZCk7XG5cdFx0XHRhd2FpdCB0aGlzLmNhbmNlbEN1cnJlbnRSZXF1ZXN0Rm9yU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UsICdxdWV1ZVJ1bk5leHQnKTtcblx0XHRcdGxldCByZXN1bHQ6IENoYXRTZW5kUmVzdWx0IHwgdW5kZWZpbmVkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5zZW5kUmVxdWVzdChzZXNzaW9uUmVzb3VyY2UsIG1lc3NhZ2UsIHNlbmRPcHRpb25zKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ3NlbmRQZW5kaW5nUmVxdWVzdEltbWVkaWF0ZWx5OiByZS1zZW5kIGZhaWxlZCcsIGVycik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXJlc3VsdCB8fCByZXN1bHQua2luZCA9PT0gJ3JlamVjdGVkJykge1xuXHRcdFx0XHR0aGlzLmluZm8oJ3NlbmRQZW5kaW5nUmVxdWVzdEltbWVkaWF0ZWx5JywgYFJlLXNlbmQgd2FzIG5vdCBhY2NlcHRlZCAoJHtyZXN1bHQ/LmtpbmQgPz8gJ2Vycm9yJ30pOyByZXN0b3JpbmcgcGVuZGluZyBtZXNzYWdlIHRvIHRoZSBxdWV1ZWApO1xuXHRcdFx0XHRhd2FpdCB0aGlzLnNlbmRSZXF1ZXN0KHNlc3Npb25SZXNvdXJjZSwgbWVzc2FnZSwgeyAuLi5zZW5kT3B0aW9ucywgYXR0YWNoZWRDb250ZXh0LCBxdWV1ZTogdGFyZ2V0LmtpbmQgfSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gTG9jYWwgc2Vzc2lvbnM6IG1vdmUgdGhlIHRhcmdldCB0byB0aGUgZnJvbnQgKGtlZXBpbmcgaXRzIGtpbmQpLFxuXHRcdC8vIGNhbmNlbCB0aGUgaW4tZmxpZ2h0IHJlcXVlc3QsIGFuZCBsZXQgdGhlIHF1ZXVlIHByb2Nlc3NvciBzZW5kIGl0LlxuXHRcdGNvbnN0IHJlb3JkZXJlZCA9IFtcblx0XHRcdHsgcmVxdWVzdElkOiB0YXJnZXQucmVxdWVzdC5pZCwga2luZDogdGFyZ2V0LmtpbmQgfSxcblx0XHRcdC4uLnBlbmRpbmdSZXF1ZXN0cy5maWx0ZXIociA9PiByLnJlcXVlc3QuaWQgIT09IHJlcXVlc3RJZCkubWFwKHIgPT4gKHsgcmVxdWVzdElkOiByLnJlcXVlc3QuaWQsIGtpbmQ6IHIua2luZCB9KSksXG5cdFx0XTtcblx0XHR0aGlzLnNldFBlbmRpbmdSZXF1ZXN0cyhzZXNzaW9uUmVzb3VyY2UsIHJlb3JkZXJlZCk7XG5cdFx0YXdhaXQgdGhpcy5jYW5jZWxDdXJyZW50UmVxdWVzdEZvclNlc3Npb24oc2Vzc2lvblJlc291cmNlLCAncXVldWVSdW5OZXh0Jyk7XG5cdFx0dGhpcy5wcm9jZXNzUGVuZGluZ1JlcXVlc3RzKHNlc3Npb25SZXNvdXJjZSk7XG5cdH1cblxuXHRwdWJsaWMgaGFzU2Vzc2lvbnMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoYXRTZXNzaW9uU3RvcmUuaGFzU2Vzc2lvbnMoKTtcblx0fVxuXG5cdGFzeW5jIHRyYW5zZmVyQ2hhdFNlc3Npb24odHJhbnNmZXJyZWRTZXNzaW9uUmVzb3VyY2U6IFVSSSwgdG9Xb3Jrc3BhY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghTG9jYWxDaGF0U2Vzc2lvblVyaS5pc0xvY2FsU2Vzc2lvbih0cmFuc2ZlcnJlZFNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2FuIG9ubHkgdHJhbnNmZXIgbG9jYWwgY2hhdCBzZXNzaW9ucy4gSW52YWxpZCBzZXNzaW9uOiAke3RyYW5zZmVycmVkU2Vzc2lvblJlc291cmNlfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fc2Vzc2lvbk1vZGVscy5nZXQodHJhbnNmZXJyZWRTZXNzaW9uUmVzb3VyY2UpIGFzIENoYXRNb2RlbCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byB0cmFuc2ZlciBzZXNzaW9uLiBVbmtub3duIHNlc3Npb246ICR7dHJhbnNmZXJyZWRTZXNzaW9uUmVzb3VyY2V9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKG1vZGVsLmluaXRpYWxMb2NhdGlvbiAhPT0gQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW4gb25seSB0cmFuc2ZlciBjaGF0IHNlc3Npb25zIGxvY2F0ZWQgaW4gdGhlIENoYXQgdmlldy4gU2Vzc2lvbiAke3RyYW5zZmVycmVkU2Vzc2lvblJlc291cmNlfSBoYXMgbG9jYXRpb249JHttb2RlbC5pbml0aWFsTG9jYXRpb259YCk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fY2hhdFNlc3Npb25TdG9yZS5zdG9yZVRyYW5zZmVyU2Vzc2lvbih7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IG1vZGVsLnNlc3Npb25SZXNvdXJjZSxcblx0XHRcdHRpbWVzdGFtcEluTWlsbGlzZWNvbmRzOiBEYXRlLm5vdygpLFxuXHRcdFx0dG9Xb3Jrc3BhY2U6IHRvV29ya3NwYWNlLFxuXHRcdH0sIG1vZGVsKTtcblx0XHR0aGlzLmNoYXRUcmFuc2ZlclNlcnZpY2UuYWRkV29ya3NwYWNlVG9UcmFuc2ZlcnJlZCh0b1dvcmtzcGFjZSk7XG5cdFx0dGhpcy50cmFjZSgndHJhbnNmZXJDaGF0U2Vzc2lvbicsIGBUcmFuc2ZlcnJlZCBzZXNzaW9uICR7bW9kZWwuc2Vzc2lvblJlc291cmNlfSB0byB3b3Jrc3BhY2UgJHt0b1dvcmtzcGFjZS50b1N0cmluZygpfWApO1xuXHR9XG5cblx0Z2V0Q2hhdFN0b3JhZ2VGb2xkZXIoKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hhdFNlc3Npb25TdG9yZS5nZXRDaGF0U3RvcmFnZUZvbGRlcigpO1xuXHR9XG5cblx0bG9nQ2hhdEluZGV4KCk6IHZvaWQge1xuXHRcdHRoaXMuX2NoYXRTZXNzaW9uU3RvcmUubG9nSW5kZXgoKTtcblx0fVxuXG5cdHNldFNlc3Npb25UaXRsZShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdGl0bGU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3Nlc3Npb25Nb2RlbHMuZ2V0KHNlc3Npb25SZXNvdXJjZSk/LnNldEN1c3RvbVRpdGxlKHRpdGxlKTtcblx0fVxuXG5cdGFwcGVuZFByb2dyZXNzKHJlcXVlc3Q6IElDaGF0UmVxdWVzdE1vZGVsLCBwcm9ncmVzczogSUNoYXRQcm9ncmVzcyk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fc2Vzc2lvbk1vZGVscy5nZXQocmVxdWVzdC5zZXNzaW9uLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCEocmVxdWVzdCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0TW9kZWwpKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdDYW4gb25seSBhcHBlbmQgcHJvZ3Jlc3MgdG8gcmVxdWVzdHMgb2YgdHlwZSBDaGF0UmVxdWVzdE1vZGVsJyk7XG5cdFx0fVxuXG5cdFx0bW9kZWw/LmFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3MocmVxdWVzdCwgcHJvZ3Jlc3MpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b0xvY2FsU2Vzc2lvbklkKHNlc3Npb25SZXNvdXJjZTogVVJJKSB7XG5cdFx0Y29uc3QgbG9jYWxTZXNzaW9uSWQgPSBMb2NhbENoYXRTZXNzaW9uVXJpLnBhcnNlTG9jYWxTZXNzaW9uSWQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAoIWxvY2FsU2Vzc2lvbklkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgbG9jYWwgY2hhdCBzZXNzaW9uIHJlc291cmNlOiAke3Nlc3Npb25SZXNvdXJjZX1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIGxvY2FsU2Vzc2lvbklkO1xuXHR9XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjaGF0TW9kZWxUb0NoYXREZXRhaWwobW9kZWw6IElDaGF0TW9kZWwpOiBQcm9taXNlPElDaGF0RGV0YWlsPiB7XG5cdGNvbnN0IHRpdGxlID0gbW9kZWwudGl0bGUgfHwgbG9jYWxpemUoJ25ld0NoYXQnLCBcIk5ldyBDaGF0XCIpO1xuXHRyZXR1cm4ge1xuXHRcdHNlc3Npb25SZXNvdXJjZTogbW9kZWwuc2Vzc2lvblJlc291cmNlLFxuXHRcdHRpdGxlLFxuXHRcdGxhc3RNZXNzYWdlRGF0ZTogbW9kZWwubGFzdE1lc3NhZ2VEYXRlLFxuXHRcdHRpbWluZzogbW9kZWwudGltaW5nLFxuXHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdHN0YXRzOiBhd2FpdCBhd2FpdFN0YXRzRm9yU2Vzc2lvbihtb2RlbCksXG5cdFx0bGFzdFJlc3BvbnNlU3RhdGU6IG1vZGVsLmxhc3RSZXF1ZXN0Py5yZXNwb25zZT8uc3RhdGUgPz8gUmVzcG9uc2VNb2RlbFN0YXRlLlBlbmRpbmcsXG5cdFx0d29ya2luZ0RpcmVjdG9yeTogbW9kZWwud29ya2luZ0RpcmVjdG9yeSxcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxpQkFBaUIsdUJBQXVCLG1CQUFtQjtBQUNwRSxTQUFTLG1CQUFtQiwrQkFBK0I7QUFFM0QsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQkFBb0Isd0JBQXdCO0FBQ3JELFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxZQUFZLHVCQUF1QixpQkFBOEIseUJBQXlCO0FBQ25HLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsY0FBYztBQUN2QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxTQUFTLFNBQTJDLHVCQUF1QjtBQUNwRixTQUFTLGVB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RUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F0RlU7QUFrcEViLGVBQXNCLHNCQUFzQixPQUF5QztBQUNwRixRQUFNLFFBQVEsTUFBTSxTQUFTLFNBQVMsV0FBVyxVQUFVO0FBQzNELFNBQU87QUFBQSxJQUNOLGlCQUFpQixNQUFNO0FBQUEsSUFDdkI7QUFBQSxJQUNBLGlCQUFpQixNQUFNO0FBQUEsSUFDdkIsUUFBUSxNQUFNO0FBQUEsSUFDZCxVQUFVO0FBQUEsSUFDVixPQUFPLE1BQU0scUJBQXFCLEtBQUs7QUFBQSxJQUN2QyxtQkFBbUIsTUFBTSxhQUFhLFVBQVUsU0FBUyxtQkFBbUI7QUFBQSxJQUM1RSxrQkFBa0IsTUFBTTtBQUFBLEVBQ3pCO0FBQ0Q7IiwKICAibmFtZXMiOiBbInRva2VuIiwgInJlcXVlc3QiLCAiYWdlbnQiLCAiY29tbWFuZCIsICJlbmFibGVDb21tYW5kRGV0ZWN0aW9uIl0KfQo=
