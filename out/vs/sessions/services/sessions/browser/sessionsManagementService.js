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
import { Emitter } from "../../../../base/common/event.js";
import { raceCancellationError } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { observableValue } from "../../../../base/common/observable.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { agentHostAuthority } from "../../../../platform/agentHost/common/agentHostUri.js";
import { IRemoteAgentHostService } from "../../../../platform/agentHost/common/remoteAgentHostService.js";
import { IChatService } from "../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { ChatAgentLocation } from "../../../../workbench/contrib/chat/common/constants.js";
import { IChatWidgetHistoryService } from "../../../../workbench/contrib/chat/common/widget/chatWidgetHistoryService.js";
import { buildHostLocalEventsPath, COPILOT_CLI_EH_SCHEME, COPILOT_CLI_LOCAL_AH_SCHEME, getCopilotCliSessionRawId } from "../../../../workbench/contrib/chat/browser/copilotCliEventsUri.js";
import { IPathService } from "../../../../workbench/services/path/common/pathService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { getSessionReferenceResource } from "./sessionReference.js";
import { ISessionsManagementService, WorkspaceNotTrustedError } from "../common/sessionsManagement.js";
import { ISessionsProvidersService } from "./sessionsProvidersService.js";
import { SessionStatus } from "../common/session.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { localize } from "../../../../nls.js";
import { isForgeAdvertisedSessionTypeId } from "../../../../platform/agentHost/common/forgeSessionTypes.js";
const LAST_USED_QUICK_CHAT_SESSION_TYPE_STORAGE_KEY = "sessions.quickChat.lastUsedSessionType";
function isForgeAdvertisedSessionType(sessionType) {
  return isForgeAdvertisedSessionTypeId(sessionType.id);
}
let SessionsManagementService = class extends Disposable {
  constructor(logService, sessionsProvidersService, uriIdentityService, chatService, chatWidgetHistoryService, storageService, pathService, remoteAgentHostService, workspaceTrustManagementService) {
    super();
    this.logService = logService;
    this.sessionsProvidersService = sessionsProvidersService;
    this.uriIdentityService = uriIdentityService;
    this.chatService = chatService;
    this.chatWidgetHistoryService = chatWidgetHistoryService;
    this.storageService = storageService;
    this.pathService = pathService;
    this.remoteAgentHostService = remoteAgentHostService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this._onDidChangeSessions = this._register(new Emitter());
    this.onDidChangeSessions = this._onDidChangeSessions.event;
    this._onDidStartSession = this._register(new Emitter());
    this.onDidStartSession = this._onDidStartSession.event;
    this._onWillSendRequest = this._register(new Emitter());
    this.onWillSendRequest = this._onWillSendRequest.event;
    this._onDidSendRequest = this._register(new Emitter());
    this.onDidSendRequest = this._onDidSendRequest.event;
    this._onDidArchiveSession = this._register(new Emitter());
    this.onDidArchiveSession = this._onDidArchiveSession.event;
    this._onDidUnarchiveSession = this._register(new Emitter());
    this.onDidUnarchiveSession = this._onDidUnarchiveSession.event;
    this._onDidDeleteSession = this._register(new Emitter());
    this.onDidDeleteSession = this._onDidDeleteSession.event;
    this._onDidDeleteChat = this._register(new Emitter());
    this.onDidDeleteChat = this._onDidDeleteChat.event;
    this._onDidRenameChat = this._register(new Emitter());
    this.onDidRenameChat = this._onDidRenameChat.event;
    this._onDidRenameSession = this._register(new Emitter());
    this.onDidRenameSession = this._onDidRenameSession.event;
    this._onDidChangeSessionTypes = this._register(new Emitter());
    this.onDidChangeSessionTypes = this._onDidChangeSessionTypes.event;
    this._onDidReplaceSession = this._register(new Emitter());
    this.onDidReplaceSession = this._onDidReplaceSession.event;
    this._onDidDiscardNewSession = this._register(new Emitter());
    this.onDidDiscardNewSession = this._onDidDiscardNewSession.event;
    this._onDidReplaceNewDraftSession = this._register(new Emitter());
    this.onDidReplaceNewDraftSession = this._onDidReplaceNewDraftSession.event;
    this._sessionTypes = [];
    /** Tracks the in-progress new session (composed but not yet sent). */
    this._newSession = observableValue(this, void 0);
    this.newSession = this._newSession;
    /** Tracks the Automation dialog's in-progress session draft. */
    this._automationSession = observableValue(this, void 0);
    this.automationSession = this._automationSession;
    this._providerListeners = this._register(new DisposableMap());
    this._disposeCts = this._register(new CancellationTokenSource());
    this._unlistedNewSessions = new ResourceMap();
    /**
     * Chat resources for which this service has just kicked off a
     * `provider.sendRequest` and will emit `_onDidSendRequest` manually after
     * the provider call resolves. Used to suppress the duplicate event that
     * would otherwise arrive via {@link IChatService.onDidSubmitRequest},
     * which fires synchronously inside the same provider call.
     */
    this._pendingSendChatResources = /* @__PURE__ */ new Set();
    this._register(this.sessionsProvidersService.onDidChangeProviders((e) => {
      this._onProvidersChanged(e);
      this._updateSessionTypes();
    }));
    this._subscribeToProviders(this.sessionsProvidersService.getProviders());
    this._sessionTypes = this._collectSessionTypes();
    this._register(this.chatService.onDidSubmitRequest(({ chatSessionResource, message, attachedContext }) => {
      if (this._pendingSendChatResources.has(chatSessionResource.toString())) {
        return;
      }
      const ownedChat = this.getSessionForChatResource(chatSessionResource);
      if (ownedChat) {
        this._onDidSendRequest.fire({
          session: ownedChat.session,
          chat: ownedChat.chat,
          isNewSession: false,
          isNewChat: false,
          options: { query: message?.text ?? "", attachedContext }
        });
      }
    }));
  }
  _onProvidersChanged(e) {
    for (const provider of e.removed) {
      this._providerListeners.deleteAndDispose(provider.id);
    }
    if (e.added.length) {
      this._subscribeToProviders(e.added);
    }
  }
  _subscribeToProviders(providers) {
    for (const provider of providers) {
      const disposables = new DisposableStore();
      disposables.add(provider.onDidChangeSessions((e) => this.onDidChangeSessionsFromSessionsProviders(e)));
      if (provider.onDidReplaceSession) {
        disposables.add(provider.onDidReplaceSession((e) => this._handleDidReplaceSession(e.from, e.to)));
      }
      if (provider.onDidChangeSessionTypes) {
        disposables.add(provider.onDidChangeSessionTypes(() => this._updateSessionTypes()));
      }
      this._providerListeners.set(provider.id, disposables);
    }
  }
  _handleDidReplaceSession(from, to) {
    this.chatWidgetHistoryService.moveHistory(ChatAgentLocation.Chat, from.sessionId, to.sessionId);
    this._onDidReplaceSession.fire({ from, to });
    this._onDidChangeSessions.fire({
      added: [],
      removed: from.sessionId === to.sessionId ? [] : [from],
      changed: [to]
    });
  }
  onDidChangeSessionsFromSessionsProviders(e) {
    if (e.removed.length) {
      const current = this._newSession.get();
      if (current && e.removed.some((r) => r.sessionId === current.sessionId)) {
        this._newSession.set(void 0, void 0);
      }
      const automationSession = this._automationSession.get();
      if (automationSession && e.removed.some((r) => r.sessionId === automationSession.sessionId)) {
        this._automationSession.set(void 0, void 0);
      }
    }
    this._onDidChangeSessions.fire(e);
  }
  getSessions() {
    return this._dedupeMigratedCopilotCliSessions(this._getMergedSessions());
  }
  _getMergedSessions() {
    const sessions = [];
    for (const provider of this.sessionsProvidersService.getProviders()) {
      sessions.push(...provider.getSessions());
    }
    return sessions;
  }
  /**
   * A legacy Copilot CLI session migrated in place to the agent host is briefly
   * listed by BOTH the extension-host provider (`copilotcli:/<id>`) and the
   * agent-host provider (`agent-host-copilotcli:/<id>`) for the same underlying
   * SDK session id — the workbench agent-session model caches the stale legacy
   * entry even after the extension stops reporting it. Drop the legacy entry so
   * exactly one row shows per session.
   */
  _dedupeMigratedCopilotCliSessions(sessions) {
    let migratedRawIds;
    for (const session of sessions) {
      if (session.resource.scheme === COPILOT_CLI_LOCAL_AH_SCHEME) {
        const rawId = getCopilotCliSessionRawId(session.resource);
        if (rawId) {
          (migratedRawIds ??= /* @__PURE__ */ new Set()).add(rawId);
        }
      }
    }
    if (!migratedRawIds) {
      return sessions;
    }
    const result = sessions.filter((session) => {
      if (session.resource.scheme === COPILOT_CLI_EH_SCHEME) {
        const rawId = getCopilotCliSessionRawId(session.resource);
        if (rawId && migratedRawIds.has(rawId)) {
          return false;
        }
      }
      return true;
    });
    return result;
  }
  getSession(resource) {
    const unlistedSession = this._unlistedNewSessions.get(resource);
    if (unlistedSession) {
      return unlistedSession;
    }
    return this._getMergedSessions().find(
      (s) => this.uriIdentityService.extUri.isEqual(s.resource, resource)
    );
  }
  getSessionForChatResource(resource) {
    for (const session of this._getMergedSessions()) {
      const chat = session.chats.get().find((c) => this.uriIdentityService.extUri.isEqual(c.resource, resource));
      if (chat) {
        return { session, chat };
      }
      const mainChat = session.mainChat.get();
      if (this.uriIdentityService.extUri.isEqual(mainChat.resource, resource)) {
        return { session, chat: mainChat };
      }
    }
    return void 0;
  }
  getAllSessionTypes() {
    return [...this._sessionTypes];
  }
  getAllProviderSessionTypes() {
    const result = [];
    for (const provider of this.sessionsProvidersService.getProviders()) {
      for (const sessionType of provider.sessionTypes) {
        if (isForgeAdvertisedSessionType(sessionType)) {
          result.push({ providerId: provider.id, sessionType });
        }
      }
    }
    return result;
  }
  getSessionTypesForFolder(folderUri) {
    const result = [];
    for (const provider of this.sessionsProvidersService.getProviders()) {
      if (!provider.resolveWorkspace(folderUri)) {
        continue;
      }
      for (const sessionType of provider.getSessionTypes(folderUri)) {
        if (isForgeAdvertisedSessionType(sessionType)) {
          result.push({ providerId: provider.id, sessionType });
        }
      }
    }
    return result;
  }
  getQuickChatSessionTypes() {
    const result = [];
    for (const provider of this.sessionsProvidersService.getProviders()) {
      if (!provider.supportsQuickChats) {
        continue;
      }
      for (const sessionType of provider.sessionTypes) {
        if (isForgeAdvertisedSessionType(sessionType)) {
          result.push({ providerId: provider.id, sessionType });
        }
      }
    }
    return result;
  }
  isNewSessionTargetAvailable(folderUri, options) {
    return this._isTargetAvailable(this.getSessionTypesForFolder(folderUri), options);
  }
  isQuickChatTargetAvailable(options) {
    return this._isTargetAvailable(this.getQuickChatSessionTypes(), options);
  }
  _isTargetAvailable(sessionTypes, options) {
    return sessionTypes.some(
      (candidate) => (!options?.providerId || candidate.providerId === options.providerId) && (!options?.sessionTypeId || candidate.sessionType.id === options.sessionTypeId)
    );
  }
  resolveWorkspace(folderUri, preferredProviderId) {
    if (preferredProviderId) {
      const preferred = this.sessionsProvidersService.getProvider(preferredProviderId);
      const workspace = preferred?.resolveWorkspace(folderUri);
      if (workspace) {
        return { providerId: preferredProviderId, workspace };
      }
    }
    for (const provider of this.sessionsProvidersService.getProviders()) {
      const workspace = provider.resolveWorkspace(folderUri);
      if (workspace) {
        return { providerId: provider.id, workspace };
      }
    }
    return void 0;
  }
  _collectSessionTypes() {
    const types = [];
    const seen = /* @__PURE__ */ new Set();
    for (const provider of this.sessionsProvidersService.getProviders()) {
      for (const type of provider.sessionTypes) {
        if (!isForgeAdvertisedSessionType(type) || seen.has(type.id)) {
          continue;
        }
        seen.add(type.id);
        types.push(type);
      }
    }
    return types;
  }
  _updateSessionTypes() {
    this._sessionTypes = this._collectSessionTypes();
    this._onDidChangeSessionTypes.fire();
  }
  discardNewSession(session) {
    const current = this._newSession.get();
    if (!current) {
      return;
    }
    if (session && session.sessionId !== current.sessionId) {
      return;
    }
    this._newSession.set(void 0, void 0);
    this._getProvider(current)?.deleteNewSession(current.sessionId);
    this._onDidDiscardNewSession.fire(current);
  }
  discardAutomationSession(session) {
    const current = this._automationSession.get();
    if (!current || session && session.sessionId !== current.sessionId) {
      return;
    }
    this._automationSession.set(void 0, void 0);
    this._getProvider(current)?.deleteNewSession(current.sessionId);
  }
  /**
   * Resolve the provider and session type to use for a new session in the
   * given folder. Includes that provider's resolved workspace so headless
   * callers can enforce provider-specific trust without resolving it again.
   */
  _resolveProviderForNewSession(folderUri, options) {
    const providers = this.sessionsProvidersService.getProviders();
    let provider;
    let workspace;
    let sessionTypeId;
    const requiresWorktreeConfiguration = options?.isolationMode === "worktree" || options?.worktreeBranchTrack !== void 0 || options?.branch !== void 0;
    const resolveSessionTypeId = (candidate) => {
      const sessionTypes = candidate.getSessionTypes(folderUri);
      if (options?.sessionTypeId) {
        const requested = sessionTypes.find((type) => type.id === options.sessionTypeId);
        return requested && (!requiresWorktreeConfiguration || requested.supportsWorktreeConfiguration === true) ? requested.id : void 0;
      }
      if (requiresWorktreeConfiguration) {
        return sessionTypes.find((type) => type.supportsWorktreeConfiguration === true)?.id;
      }
      return sessionTypes.find((type) => isForgeAdvertisedSessionTypeId(type.id))?.id ?? sessionTypes[0]?.id;
    };
    if (options?.providerId) {
      provider = providers.find((p) => p.id === options.providerId);
      if (!provider) {
        throw new Error(`Sessions provider '${options.providerId}' not found`);
      }
      workspace = provider.resolveWorkspace(folderUri);
      if (!workspace) {
        throw new Error(`Sessions provider '${options.providerId}' cannot resolve folder '${folderUri.toString()}'`);
      }
      sessionTypeId = resolveSessionTypeId(provider);
      if (!sessionTypeId) {
        if (requiresWorktreeConfiguration) {
          throw new Error(`Sessions provider '${options.providerId}' does not support worktree configuration for folder '${folderUri.toString()}'`);
        }
        if (options.sessionTypeId) {
          throw new Error(`Sessions provider '${options.providerId}' does not advertise session type '${options.sessionTypeId}'`);
        }
        throw new Error(`No session types available for provider '${provider.id}'`);
      }
    } else {
      for (const candidate of providers) {
        const candidateWorkspace = candidate.resolveWorkspace(folderUri);
        if (!candidateWorkspace) {
          continue;
        }
        const candidateSessionTypeId = resolveSessionTypeId(candidate);
        if (!candidateSessionTypeId) {
          continue;
        }
        provider = candidate;
        workspace = candidateWorkspace;
        sessionTypeId = candidateSessionTypeId;
        break;
      }
      if (!provider || !workspace) {
        throw new Error(requiresWorktreeConfiguration ? `No sessions provider supports worktree configuration for folder '${folderUri.toString()}'` : `No sessions provider can resolve folder '${folderUri.toString()}'`);
      }
    }
    if (!sessionTypeId) {
      throw new Error(`No session types available for provider '${provider.id}'`);
    }
    return { provider, sessionTypeId, workspace };
  }
  createNewSession(folderUri, options) {
    const { provider, sessionTypeId } = this._resolveProviderForNewSession(folderUri, options);
    const previousNewSession = this._newSession.get();
    const session = provider.createNewSession(folderUri, sessionTypeId, { metadata: options?.metadata });
    if (previousNewSession && previousNewSession.sessionId !== session.sessionId) {
      this._getProvider(previousNewSession)?.deleteNewSession(previousNewSession.sessionId);
      this._onDidReplaceNewDraftSession.fire({ from: previousNewSession, to: session });
    }
    this._newSession.set(session, void 0);
    return session;
  }
  createAutomationSession(folderUri, options) {
    const { provider, sessionTypeId } = this._resolveProviderForNewSession(folderUri, options);
    const previousAutomationSession = this._automationSession.get();
    const session = provider.createNewSession(folderUri, sessionTypeId);
    if (previousAutomationSession && previousAutomationSession.sessionId !== session.sessionId) {
      this._getProvider(previousAutomationSession)?.deleteNewSession(previousAutomationSession.sessionId);
    }
    this._automationSession.set(session, void 0);
    return session;
  }
  /**
   * Resolve the provider and session type to use for a quick chat, keyed on
   * {@link ISessionsProvider.supportsQuickChats} instead of `resolveWorkspace`.
   * Honors an explicit `options.sessionTypeId` (validated against the chosen
   * provider) and otherwise defaults to the last-used type, then the first
   * advertised one. Throws when no capable provider/type can be resolved.
   */
  _resolveProviderForQuickChat(options) {
    const providers = this.sessionsProvidersService.getProviders();
    let provider;
    if (options?.providerId) {
      provider = providers.find((p) => p.id === options.providerId);
      if (!provider) {
        throw new Error(`Sessions provider '${options.providerId}' not found`);
      }
      if (!provider.supportsQuickChats) {
        throw new Error(`Sessions provider '${options.providerId}' does not support quick chats`);
      }
      if (options.sessionTypeId && !provider.sessionTypes.some((t) => t.id === options.sessionTypeId)) {
        throw new Error(`Sessions provider '${options.providerId}' does not advertise session type '${options.sessionTypeId}'`);
      }
    } else {
      for (const candidate of providers) {
        if (!candidate.supportsQuickChats) {
          continue;
        }
        if (options?.sessionTypeId && !candidate.sessionTypes.some((t) => t.id === options.sessionTypeId)) {
          continue;
        }
        provider = candidate;
        break;
      }
      if (!provider) {
        throw new Error("No sessions provider supports quick chats");
      }
    }
    const sessionTypeId = options?.sessionTypeId ?? this._defaultQuickChatSessionType(provider);
    if (!sessionTypeId) {
      throw new Error(`No session types available for provider '${provider.id}'`);
    }
    return { provider, sessionTypeId };
  }
  /** Default quick-chat session type: Codex when advertised, else the last-used type, else the first. */
  _defaultQuickChatSessionType(provider) {
    const codex = provider.sessionTypes.find((t) => isForgeAdvertisedSessionTypeId(t.id));
    if (codex) {
      return codex.id;
    }
    const lastUsed = this.storageService.get(LAST_USED_QUICK_CHAT_SESSION_TYPE_STORAGE_KEY, StorageScope.PROFILE);
    if (lastUsed && provider.sessionTypes.some((t) => t.id === lastUsed)) {
      return lastUsed;
    }
    return provider.sessionTypes[0]?.id;
  }
  createQuickChat(options) {
    const { provider, sessionTypeId } = this._resolveProviderForQuickChat(options);
    const previousNewSession = this._newSession.get();
    const session = provider.createQuickChat(sessionTypeId);
    this._newSession.set(session, void 0);
    this.storageService.store(LAST_USED_QUICK_CHAT_SESSION_TYPE_STORAGE_KEY, sessionTypeId, StorageScope.PROFILE, StorageTarget.USER);
    if (previousNewSession && previousNewSession.sessionId !== session.sessionId) {
      this._getProvider(previousNewSession)?.deleteNewSession(previousNewSession.sessionId);
    }
    return session;
  }
  createAutomationQuickChat(options) {
    const { provider, sessionTypeId } = this._resolveProviderForQuickChat(options);
    const previousAutomationSession = this._automationSession.get();
    const session = provider.createQuickChat(sessionTypeId);
    if (previousAutomationSession && previousAutomationSession.sessionId !== session.sessionId) {
      this._getProvider(previousAutomationSession)?.deleteNewSession(previousAutomationSession.sessionId);
    }
    this._automationSession.set(session, void 0);
    return session;
  }
  async createNewChatInSession(session, options) {
    const provider = this._getProvider(session);
    if (!provider) {
      this.logService.warn(`[SessionsManagement] createNewChatInSession: provider '${session.providerId}' not found`);
      return void 0;
    }
    if (!options?.forceNew) {
      const existingUntitled = session.chats.get().find((c) => c.status.get() === SessionStatus.Untitled);
      if (existingUntitled) {
        return existingUntitled;
      }
    }
    const created = await provider.createNewChat(session.sessionId);
    return created;
  }
  async forkChatInSession(session, sourceChat, turnId) {
    const provider = this._getProvider(session);
    if (!provider) {
      throw new Error(`Provider '${session.providerId}' not found for session '${session.sessionId}'`);
    }
    if (!session.capabilities.get().supportsMultipleChats) {
      throw new Error(`Session '${session.sessionId}' does not support forking into a chat`);
    }
    return provider.forkChat(session.sessionId, sourceChat, turnId);
  }
  async createSideChatInSession(session, sourceChat, turnId, selection) {
    const provider = this._getProvider(session);
    if (!provider) {
      throw new Error(`Provider '${session.providerId}' not found for session '${session.sessionId}'`);
    }
    if (!session.capabilities.get().supportsSideChat) {
      throw new Error(`Session '${session.sessionId}' does not support side chats`);
    }
    return provider.createSideChat(session.sessionId, sourceChat, turnId, selection);
  }
  /**
   * For a `/troubleshoot` request, strip any `#session` marker attachments and
   * append a `Session log:` line with the resolved host-local `events.jsonl`
   * path(s) — the referenced sessions if present, otherwise the current one.
   * Returns `options` unchanged when there is nothing to do.
   */
  _augmentOptionsForTroubleshoot(session, options) {
    const referencedResources = [];
    let remainingAttachments;
    if (options.attachedContext?.length) {
      const remaining = [];
      for (const entry of options.attachedContext) {
        const referenced = getSessionReferenceResource(entry);
        if (referenced) {
          referencedResources.push(referenced);
        } else {
          remaining.push(entry);
        }
      }
      if (referencedResources.length) {
        remainingAttachments = remaining;
      }
    }
    const isTroubleshoot = /^\s*\/troubleshoot\b/.test(options.query);
    if (!isTroubleshoot && referencedResources.length === 0) {
      return options;
    }
    let result = options;
    if (remainingAttachments) {
      result = { ...result, attachedContext: remainingAttachments.length ? remainingAttachments : void 0 };
    }
    if (!isTroubleshoot) {
      return result;
    }
    const targets = referencedResources.length ? referencedResources : getCopilotCliSessionRawId(session.resource) ? [session.resource] : [];
    const userHome = this.pathService.userHome({ preferLocal: true });
    const getConnection = (authority) => this.remoteAgentHostService.connections.find((c) => agentHostAuthority(c.address) === authority);
    const eventPaths = Array.from(new Set(
      targets.map((resource) => buildHostLocalEventsPath(resource, userHome, getConnection)).filter((path) => !!path)
    ));
    if (eventPaths.length === 0) {
      return result;
    }
    return { ...result, query: `${result.query}

Session log: ${eventPaths.join(", ")}` };
  }
  async sendNewChatRequest(session, options) {
    this._newSession.set(void 0, void 0);
    const provider = this._getProvider(session);
    if (!provider) {
      throw new Error(`Sessions provider '${session.providerId}' not found`);
    }
    if (options.background) {
      this._sendNewChatRequestInBackground(provider, session, options).catch((e) => {
        provider.deleteNewSession(session.sessionId);
        this.logService.error("[SessionsManagement] Failed to send background request:", e);
      });
      return;
    }
    this._onWillSendRequest.fire(session);
    const chat = await provider.createNewChat(session.sessionId, options.query);
    const sendOptions = this._augmentOptionsForTroubleshoot(session, options);
    const chatResourceKey = chat.resource.toString();
    this._pendingSendChatResources.add(chatResourceKey);
    let updatedSession;
    try {
      updatedSession = await provider.sendRequest(session.sessionId, chat.resource, sendOptions);
    } finally {
      this._pendingSendChatResources.delete(chatResourceKey);
    }
    if (updatedSession.sessionId !== session.sessionId) {
      this.logService.info(`[SessionsManagement] sendRequest: active session replaced: ${session.sessionId} -> ${updatedSession.sessionId}`);
    }
    this._onDidStartSession.fire(updatedSession);
    this._onDidSendRequest.fire({ session: updatedSession, chat, isNewSession: true, isNewChat: true, options });
  }
  /**
   * Create a new session for the given folder and send a chat request to it,
   * without navigating into the started session. The started session appears
   * in the sessions list once the provider commits it, while the user's
   * current view is left untouched. Returns the committed session,
   * or `undefined` if the service was disposed during the send.
   *
   * Unlike {@link sendNewChatRequest} with `background`, this does not go
   * through the new-session composer: it creates a fresh session purely for
   * this request and never sets it as pending/active. Intended for callers
   * outside the composer that want to kick off a session programmatically.
   *
   * If the send or any configuration setter fails, the stranded draft is
   * disposed through its provider and the error is rethrown.
   */
  async createAndSendNewChatRequest(folderUri, options, createOptions, token = CancellationToken.None) {
    const { provider, sessionTypeId, workspace } = this._resolveProviderForNewSession(folderUri, createOptions);
    if (workspace.requiresWorkspaceTrust) {
      const trustInfo = await this.workspaceTrustManagementService.getUriTrustInfo(folderUri);
      if (!trustInfo.trusted) {
        throw new WorkspaceNotTrustedError();
      }
    }
    const session = provider.createNewSession(folderUri, sessionTypeId, { metadata: createOptions?.metadata });
    this._unlistedNewSessions.set(session.resource, session);
    const requestActivity = new MutableDisposable();
    try {
      try {
        requestActivity.value = isDeferredNewSessionRequestOptions(options) ? provider.startNewSessionRequest?.(session.sessionId, options.activity) : provider.startNewSessionRequest?.(session.sessionId);
        createOptions?.onSessionCreated?.(session);
      } catch (error) {
        provider.deleteNewSession(session.sessionId);
        throw error;
      }
      const supportsWorktreeConfiguration = provider.getSessionTypes(folderUri).find((sessionType) => sessionType.id === sessionTypeId)?.supportsWorktreeConfiguration === true;
      return await this._configureAndSendNewSession(provider, session, options, createOptions, supportsWorktreeConfiguration, token, folderUri, requestActivity);
    } finally {
      requestActivity.dispose();
      this._unlistedNewSessions.delete(session.resource);
    }
  }
  async createAndSendQuickChatRequest(options, createOptions, token = CancellationToken.None) {
    const { provider, sessionTypeId } = this._resolveProviderForQuickChat(createOptions);
    const session = provider.createQuickChat(sessionTypeId);
    return this._configureAndSendNewSession(provider, session, options, createOptions, false, token);
  }
  async _configureAndSendNewSession(provider, session, options, createOptions, supportsWorktreeConfiguration, token, folderUri, requestActivity) {
    try {
      if (token.isCancellationRequested) {
        throw new CancellationError();
      }
      const requestOptionsPromise = (async () => {
        try {
          return isDeferredNewSessionRequestOptions(options) ? await options.resolve() : options;
        } finally {
          requestActivity?.clear();
        }
      })();
      const configurationPromise = this._configureNewSession(provider, session, createOptions, supportsWorktreeConfiguration, token, folderUri);
      const [resolvedOptions] = await raceCancellationError(Promise.all([requestOptionsPromise, configurationPromise]), token);
      if (token.isCancellationRequested) {
        throw new CancellationError();
      }
      return await raceCancellationError(this._sendNewChatRequestInBackground(provider, session, resolvedOptions, token), token);
    } catch (e) {
      provider.deleteNewSession(session.sessionId);
      throw e;
    }
  }
  async _configureNewSession(provider, session, createOptions, supportsWorktreeConfiguration, token, folderUri) {
    if (createOptions?.modelId) {
      const resolvedModelId = await this._waitForRequestedModel(provider, session, createOptions.modelId, token, folderUri);
      provider.setModel(session.sessionId, resolvedModelId);
    }
    if (createOptions?.modeId) {
      provider.setMode?.(session.sessionId, createOptions.modeId);
    }
    if (createOptions?.permissionLevel) {
      provider.setPermissionLevel?.(session.sessionId, createOptions.permissionLevel);
    }
    if (supportsWorktreeConfiguration && (createOptions?.isolationMode || createOptions?.worktreeBranchTrack !== void 0 || createOptions?.branch)) {
      if (provider.setWorktreeConfiguration) {
        await raceCancellationError(provider.setWorktreeConfiguration(session.sessionId, {
          isolationMode: createOptions.isolationMode,
          worktreeBranchTrack: createOptions.worktreeBranchTrack,
          branch: createOptions.branch
        }), token);
      } else {
        if (createOptions.isolationMode && provider.setIsolationMode) {
          await raceCancellationError(provider.setIsolationMode(session.sessionId, createOptions.isolationMode), token);
        }
        if (createOptions.worktreeBranchTrack !== void 0 && provider.setWorktreeBranchTrack) {
          await raceCancellationError(provider.setWorktreeBranchTrack(session.sessionId, createOptions.worktreeBranchTrack), token);
        }
        if (createOptions.branch && provider.setBranch) {
          await raceCancellationError(provider.setBranch(session.sessionId, createOptions.branch), token);
        }
      }
    }
  }
  async _waitForRequestedModel(provider, session, modelId, token, folderUri) {
    const resolveCurrent = () => provider.getModelsSnapshot(session.sessionId, modelId).desiredModelResolution;
    const initial = resolveCurrent();
    if (initial.kind === "available") {
      return initial.model.identifier;
    }
    if (initial.kind === "notRequested") {
      return modelId;
    }
    if (initial.kind === "unavailable") {
      throw new Error(`Model '${modelId}' is unavailable for sessions provider '${provider.id}'`);
    }
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    return new Promise((resolve, reject) => {
      const disposables = new DisposableStore();
      let settled = false;
      const finish = (result) => {
        if (settled) {
          return;
        }
        settled = true;
        disposables.dispose();
        if (result instanceof Error) {
          reject(result);
        } else {
          resolve(result);
        }
      };
      const check = () => {
        const resolution = resolveCurrent();
        if (resolution.kind === "available") {
          finish(resolution.model.identifier);
        } else if (resolution.kind === "notRequested") {
          finish(modelId);
        } else if (resolution.kind === "unavailable") {
          finish(new Error(`Model '${modelId}' is unavailable for sessions provider '${provider.id}'`));
        }
      };
      disposables.add(provider.onDidChangeModels(check));
      disposables.add(provider.onDidChangeSessionTypes(() => {
        const sessionTypes = folderUri ? provider.getSessionTypes(folderUri) : provider.sessionTypes;
        if (!sessionTypes.some((type) => type.id === session.sessionType)) {
          finish(new Error(`Session type '${session.sessionType}' is no longer available for sessions provider '${provider.id}'`));
        }
      }));
      disposables.add(this.sessionsProvidersService.onDidChangeProviders((event) => {
        if (event.removed.includes(provider)) {
          finish(new Error(`Sessions provider '${provider.id}' is no longer available`));
        }
      }));
      disposables.add(token.onCancellationRequested(() => finish(new CancellationError())));
      disposables.add(this._disposeCts.token.onCancellationRequested(() => finish(new CancellationError())));
      check();
    });
  }
  dispose() {
    this._disposeCts.cancel();
    super.dispose();
  }
  /**
   * Commit a new-session request: fire {@link _onWillSendRequest}, create the
   * new chat via the provider, send the request, and—on success—fire
   * {@link _onDidStartSession} and {@link _onDidSendRequest}. The started
   * session is never swapped into the visible chat slot, so it simply appears
   * in the sessions list once the provider commits it.
   *
   * Owns the full will/did send lifecycle so callers do not fire the paired
   * events themselves. Errors are propagated to the caller; this method does
   * not clean up the stranded draft, so callers own any view handling and the
   * error handling (e.g. disposing the stranded draft via
   * {@link ISessionsProvider.deleteNewSession}).
   *
   * Providers are multi-new-session aware, so the graduating session and a
   * concurrently reseeded composer draft coexist without conflict.
   */
  async _sendNewChatRequestInBackground(provider, session, options, token = CancellationToken.None) {
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    this._onWillSendRequest.fire(session);
    const chatPromise = provider.createNewChat(session.sessionId, options.query);
    const chat = token === CancellationToken.None ? await chatPromise : await raceCancellationError(chatPromise, token);
    const sendOptions = this._augmentOptionsForTroubleshoot(session, options);
    const chatResourceKey = chat.resource.toString();
    this._pendingSendChatResources.add(chatResourceKey);
    const cancellationListener = token.onCancellationRequested(() => {
      void this.chatService.cancelCurrentRequestForSession(chat.resource, "sessionsManagement").catch((error) => {
        this.logService.warn("[SessionsManagement] Failed to cancel headless request:", error);
      });
    });
    let updatedSession;
    try {
      updatedSession = await provider.sendRequest(session.sessionId, chat.resource, sendOptions);
    } finally {
      cancellationListener.dispose();
      this._pendingSendChatResources.delete(chatResourceKey);
    }
    if (token.isCancellationRequested) {
      throw new CancellationError();
    }
    if (this._store.isDisposed) {
      return void 0;
    }
    this._onDidStartSession.fire(updatedSession);
    this._onDidSendRequest.fire({ session: updatedSession, chat, isNewSession: true, isNewChat: true, options });
    return updatedSession;
  }
  async sendRequest(session, chat, options) {
    this.discardNewSession();
    const provider = this._getProvider(session);
    if (!provider) {
      throw new Error(`Sessions provider '${session.providerId}' not found`);
    }
    if (options.background) {
      this._sendRequestInBackground(provider, session, chat, options).catch((e) => {
        this.logService.error("[SessionsManagement] Failed to send background request:", e);
      });
      return;
    }
    this._onWillSendRequest.fire(session);
    const sendOptions = this._augmentOptionsForTroubleshoot(session, options);
    const chatResourceKey = chat.resource.toString();
    this._pendingSendChatResources.add(chatResourceKey);
    let updatedSession;
    try {
      updatedSession = await provider.sendRequest(session.sessionId, chat.resource, sendOptions);
    } finally {
      this._pendingSendChatResources.delete(chatResourceKey);
    }
    if (updatedSession.sessionId !== session.sessionId) {
      this.logService.info(`[SessionsManagement] sendRequest: active session replaced: ${session.sessionId} -> ${updatedSession.sessionId}`);
    }
    this._onDidSendRequest.fire({ session: updatedSession, chat, isNewSession: false, isNewChat: true, options });
  }
  /**
   * Send a request for an existing chat in the background: commit the send via
   * the provider and—on success—fire {@link _onDidSendRequest}. Unlike the
   * foreground {@link sendRequest} path this does not fire
   * {@link _onWillSendRequest}, so the view's send-follow never navigates the
   * visible slot into the sent chat. Errors are propagated to the caller.
   */
  async _sendRequestInBackground(provider, session, chat, options) {
    const sendOptions = this._augmentOptionsForTroubleshoot(session, options);
    const chatResourceKey = chat.resource.toString();
    this._pendingSendChatResources.add(chatResourceKey);
    let updatedSession;
    try {
      updatedSession = await provider.sendRequest(session.sessionId, chat.resource, sendOptions);
    } finally {
      this._pendingSendChatResources.delete(chatResourceKey);
    }
    if (this._store.isDisposed) {
      return;
    }
    this._onDidSendRequest.fire({ session: updatedSession, chat, isNewSession: false, isNewChat: true, options });
  }
  // -- Session Actions --
  _getProvider(session) {
    return this.sessionsProvidersService.getProviders().find((p) => p.id === session.providerId);
  }
  async cancelCurrentRequest(session) {
    const resource = session.mainChat.get().resource;
    const modelRef = await this.chatService.acquireOrLoadSession(resource, ChatAgentLocation.Chat, CancellationToken.None, "sessionsManagement:cancel");
    if (!modelRef) {
      throw new Error(localize("sessions.cancelCurrentRequest.loadFailed", "Failed to load chat session for cancellation."));
    }
    try {
      await this.chatService.cancelCurrentRequestForSession(resource, "sessionsManagement");
    } finally {
      modelRef.dispose();
    }
  }
  async archiveSession(session) {
    await this._getProvider(session)?.archiveSession(session.sessionId);
    this._onDidArchiveSession.fire(session);
  }
  async unarchiveSession(session) {
    await this._getProvider(session)?.unarchiveSession(session.sessionId);
    this._onDidUnarchiveSession.fire(session);
  }
  async setSessionReadState(session, isRead) {
    await this._getProvider(session)?.setSessionReadState(session.sessionId, isRead);
  }
  markRead(session) {
    return this.setSessionReadState(session, true);
  }
  markUnread(session) {
    return this.setSessionReadState(session, false);
  }
  async markAllRead(sessions) {
    await Promise.all(sessions.map((session) => this.setSessionReadState(session, true)));
  }
  async deleteSession(session) {
    await this._getProvider(session)?.deleteSession(session.sessionId);
    this._onDidDeleteSession.fire(session);
  }
  async deleteSessions(sessions) {
    const byProvider = /* @__PURE__ */ new Map();
    for (const session of sessions) {
      const provider = this._getProvider(session);
      if (!provider) {
        continue;
      }
      const group = byProvider.get(provider);
      if (group) {
        group.push(session);
      } else {
        byProvider.set(provider, [session]);
      }
    }
    let firstError;
    for (const [provider, providerSessions] of byProvider) {
      try {
        await provider.deleteSessions(providerSessions.map((session) => session.sessionId));
        for (const session of providerSessions) {
          this._onDidDeleteSession.fire(session);
        }
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError !== void 0) {
      throw firstError;
    }
  }
  async deleteChat(session, chatUri, options) {
    const deleted = await this._getProvider(session)?.deleteChat(session.sessionId, chatUri, options);
    if (deleted) {
      this._onDidDeleteChat.fire(session);
    }
  }
  async renameChat(session, chatUri, title) {
    await this._getProvider(session)?.renameChat(session.sessionId, chatUri, title);
    this._onDidRenameChat.fire(session);
  }
  async renameSession(session, title) {
    await this._getProvider(session)?.renameSession(session.sessionId, title);
    this._onDidRenameSession.fire(session);
  }
};
SessionsManagementService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, ISessionsProvidersService),
  __decorateParam(2, IUriIdentityService),
  __decorateParam(3, IChatService),
  __decorateParam(4, IChatWidgetHistoryService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IPathService),
  __decorateParam(7, IRemoteAgentHostService),
  __decorateParam(8, IWorkspaceTrustManagementService)
], SessionsManagementService);
function isDeferredNewSessionRequestOptions(options) {
  return options.kind === "deferred";
}
registerSingleton(ISessionsManagementService, SessionsManagementService, InstantiationType.Eager);
export {
  SessionsManagementService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcc2VydmljZXNcXHNlc3Npb25zXFxicm93c2VyXFxzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyByYWNlQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgYWdlbnRIb3N0QXV0aG9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RVcmkuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3dpZGdldC9jaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYnVpbGRIb3N0TG9jYWxFdmVudHNQYXRoLCBDT1BJTE9UX0NMSV9FSF9TQ0hFTUUsIENPUElMT1RfQ0xJX0xPQ0FMX0FIX1NDSEVNRSwgZ2V0Q29waWxvdENsaVNlc3Npb25SYXdJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jb3BpbG90Q2xpRXZlbnRzVXJpLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IGdldFNlc3Npb25SZWZlcmVuY2VSZXNvdXJjZSB9IGZyb20gJy4vc2Vzc2lvblJlZmVyZW5jZS5qcyc7XG5pbXBvcnQgeyBJQ3JlYXRlTmV3Q2hhdEluU2Vzc2lvbk9wdGlvbnMsIElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucywgSURlZmVycmVkTmV3U2Vzc2lvblJlcXVlc3RPcHRpb25zLCBJUHJvdmlkZXJTZXNzaW9uVHlwZSwgSVNlbmRSZXF1ZXN0T3B0aW9ucywgSVNlbmRSZXF1ZXN0U2VudEV2ZW50LCBJU2Vzc2lvbnNDaGFuZ2VFdmVudCwgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIE5ld1Nlc3Npb25SZXF1ZXN0T3B0aW9ucywgV29ya3NwYWNlTm90VHJ1c3RlZEVycm9yIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlcnNDaGFuZ2VFdmVudCwgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4vc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEZWxldGVDaGF0T3B0aW9ucywgSVNlc3Npb25DaGFuZ2VFdmVudCwgSVNlc3Npb25zUHJvdmlkZXIgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJQ2hhdCwgSVNlc3Npb24sIElTZXNzaW9uV29ya3NwYWNlLCBJU2lkZUNoYXRTZWxlY3Rpb24sIFNlc3Npb25TdGF0dXMsIElTZXNzaW9uVHlwZSB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBpc0ZvcmdlQWR2ZXJ0aXNlZFNlc3Npb25UeXBlSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2ZvcmdlU2Vzc2lvblR5cGVzLmpzJztcblxuLyoqIFN0b3JhZ2Uga2V5IGZvciB0aGUgbGFzdCBzZXNzaW9uIHR5cGUgdXNlZCB0byBjcmVhdGUgYSBxdWljayBjaGF0LiAqL1xuY29uc3QgTEFTVF9VU0VEX1FVSUNLX0NIQVRfU0VTU0lPTl9UWVBFX1NUT1JBR0VfS0VZID0gJ3Nlc3Npb25zLnF1aWNrQ2hhdC5sYXN0VXNlZFNlc3Npb25UeXBlJztcblxuZnVuY3Rpb24gaXNGb3JnZUFkdmVydGlzZWRTZXNzaW9uVHlwZShzZXNzaW9uVHlwZTogSVNlc3Npb25UeXBlKTogYm9vbGVhbiB7XG5cdHJldHVybiBpc0ZvcmdlQWR2ZXJ0aXNlZFNlc3Npb25UeXBlSWQoc2Vzc2lvblR5cGUuaWQpO1xufVxuXG5leHBvcnQgY2xhc3MgU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTZXNzaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTZXNzaW9uc0NoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9uczogRXZlbnQ8SVNlc3Npb25zQ2hhbmdlRXZlbnQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTdGFydFNlc3Npb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU2Vzc2lvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU3RhcnRTZXNzaW9uOiBFdmVudDxJU2Vzc2lvbj4gPSB0aGlzLl9vbkRpZFN0YXJ0U2Vzc2lvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxTZW5kUmVxdWVzdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTZXNzaW9uPigpKTtcblx0cmVhZG9ubHkgb25XaWxsU2VuZFJlcXVlc3Q6IEV2ZW50PElTZXNzaW9uPiA9IHRoaXMuX29uV2lsbFNlbmRSZXF1ZXN0LmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFNlbmRSZXF1ZXN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNlbmRSZXF1ZXN0U2VudEV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRTZW5kUmVxdWVzdDogRXZlbnQ8SVNlbmRSZXF1ZXN0U2VudEV2ZW50PiA9IHRoaXMuX29uRGlkU2VuZFJlcXVlc3QuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBcmNoaXZlU2Vzc2lvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTZXNzaW9uPigpKTtcblx0cmVhZG9ubHkgb25EaWRBcmNoaXZlU2Vzc2lvbjogRXZlbnQ8SVNlc3Npb24+ID0gdGhpcy5fb25EaWRBcmNoaXZlU2Vzc2lvbi5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRVbmFyY2hpdmVTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNlc3Npb24+KCkpO1xuXHRyZWFkb25seSBvbkRpZFVuYXJjaGl2ZVNlc3Npb246IEV2ZW50PElTZXNzaW9uPiA9IHRoaXMuX29uRGlkVW5hcmNoaXZlU2Vzc2lvbi5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREZWxldGVTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNlc3Npb24+KCkpO1xuXHRyZWFkb25seSBvbkRpZERlbGV0ZVNlc3Npb246IEV2ZW50PElTZXNzaW9uPiA9IHRoaXMuX29uRGlkRGVsZXRlU2Vzc2lvbi5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREZWxldGVDaGF0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNlc3Npb24+KCkpO1xuXHRyZWFkb25seSBvbkRpZERlbGV0ZUNoYXQ6IEV2ZW50PElTZXNzaW9uPiA9IHRoaXMuX29uRGlkRGVsZXRlQ2hhdC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZW5hbWVDaGF0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNlc3Npb24+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlbmFtZUNoYXQ6IEV2ZW50PElTZXNzaW9uPiA9IHRoaXMuX29uRGlkUmVuYW1lQ2hhdC5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZW5hbWVTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVNlc3Npb24+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlbmFtZVNlc3Npb246IEV2ZW50PElTZXNzaW9uPiA9IHRoaXMuX29uRGlkUmVuYW1lU2Vzc2lvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlc3Npb25UeXBlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25UeXBlczogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25UeXBlcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcGxhY2VTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByZWFkb25seSBmcm9tOiBJU2Vzc2lvbjsgcmVhZG9ubHkgdG86IElTZXNzaW9uIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlcGxhY2VTZXNzaW9uOiBFdmVudDx7IHJlYWRvbmx5IGZyb206IElTZXNzaW9uOyByZWFkb25seSB0bzogSVNlc3Npb24gfT4gPSB0aGlzLl9vbkRpZFJlcGxhY2VTZXNzaW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRGlzY2FyZE5ld1Nlc3Npb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU2Vzc2lvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRGlzY2FyZE5ld1Nlc3Npb246IEV2ZW50PElTZXNzaW9uPiA9IHRoaXMuX29uRGlkRGlzY2FyZE5ld1Nlc3Npb24uZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVwbGFjZU5ld0RyYWZ0U2Vzc2lvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgZnJvbTogSVNlc3Npb247IHJlYWRvbmx5IHRvOiBJU2Vzc2lvbiB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXBsYWNlTmV3RHJhZnRTZXNzaW9uOiBFdmVudDx7IHJlYWRvbmx5IGZyb206IElTZXNzaW9uOyByZWFkb25seSB0bzogSVNlc3Npb24gfT4gPSB0aGlzLl9vbkRpZFJlcGxhY2VOZXdEcmFmdFNlc3Npb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSBfc2Vzc2lvblR5cGVzOiByZWFkb25seSBJU2Vzc2lvblR5cGVbXSA9IFtdO1xuXG5cdC8qKiBUcmFja3MgdGhlIGluLXByb2dyZXNzIG5ldyBzZXNzaW9uIChjb21wb3NlZCBidXQgbm90IHlldCBzZW50KS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbmV3U2Vzc2lvbiA9IG9ic2VydmFibGVWYWx1ZTxJU2Vzc2lvbiB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgbmV3U2Vzc2lvbjogSU9ic2VydmFibGU8SVNlc3Npb24gfCB1bmRlZmluZWQ+ID0gdGhpcy5fbmV3U2Vzc2lvbjtcblxuXHQvKiogVHJhY2tzIHRoZSBBdXRvbWF0aW9uIGRpYWxvZydzIGluLXByb2dyZXNzIHNlc3Npb24gZHJhZnQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2F1dG9tYXRpb25TZXNzaW9uID0gb2JzZXJ2YWJsZVZhbHVlPElTZXNzaW9uIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRyZWFkb25seSBhdXRvbWF0aW9uU2Vzc2lvbjogSU9ic2VydmFibGU8SVNlc3Npb24gfCB1bmRlZmluZWQ+ID0gdGhpcy5fYXV0b21hdGlvblNlc3Npb247XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXJMaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIElEaXNwb3NhYmxlPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zZUN0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfdW5saXN0ZWROZXdTZXNzaW9ucyA9IG5ldyBSZXNvdXJjZU1hcDxJU2Vzc2lvbj4oKTtcblxuXHQvKipcblx0ICogQ2hhdCByZXNvdXJjZXMgZm9yIHdoaWNoIHRoaXMgc2VydmljZSBoYXMganVzdCBraWNrZWQgb2ZmIGFcblx0ICogYHByb3ZpZGVyLnNlbmRSZXF1ZXN0YCBhbmQgd2lsbCBlbWl0IGBfb25EaWRTZW5kUmVxdWVzdGAgbWFudWFsbHkgYWZ0ZXJcblx0ICogdGhlIHByb3ZpZGVyIGNhbGwgcmVzb2x2ZXMuIFVzZWQgdG8gc3VwcHJlc3MgdGhlIGR1cGxpY2F0ZSBldmVudCB0aGF0XG5cdCAqIHdvdWxkIG90aGVyd2lzZSBhcnJpdmUgdmlhIHtAbGluayBJQ2hhdFNlcnZpY2Uub25EaWRTdWJtaXRSZXF1ZXN0fSxcblx0ICogd2hpY2ggZmlyZXMgc3luY2hyb25vdXNseSBpbnNpZGUgdGhlIHNhbWUgcHJvdmlkZXIgY2FsbC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdTZW5kQ2hhdFJlc291cmNlcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlOiBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2VydmljZTogSUNoYXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlOiBJQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJUGF0aFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwYXRoU2VydmljZTogSVBhdGhTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUFnZW50SG9zdFNlcnZpY2U6IElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gU3Vic2NyaWJlIHRvIHByb3ZpZGVyIGNoYW5nZXMgZm9yIHNlc3Npb24gdHlwZSB1cGRhdGVzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2Uub25EaWRDaGFuZ2VQcm92aWRlcnMoZSA9PiB7XG5cdFx0XHR0aGlzLl9vblByb3ZpZGVyc0NoYW5nZWQoZSk7XG5cdFx0XHR0aGlzLl91cGRhdGVTZXNzaW9uVHlwZXMoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fc3Vic2NyaWJlVG9Qcm92aWRlcnModGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXJzKCkpO1xuXHRcdHRoaXMuX3Nlc3Npb25UeXBlcyA9IHRoaXMuX2NvbGxlY3RTZXNzaW9uVHlwZXMoKTtcblxuXHRcdC8vIE1pcnJvciBmb2xsb3ctdXAgY2hhdCByZXF1ZXN0cyAoc2VudCBmcm9tIHdpdGhpbiBhbiBleGlzdGluZyBjaGF0XG5cdFx0Ly8gd2lkZ2V0LCBub3QgdGhyb3VnaCBvdXIgb3duIHNlbmQgcGF0aHMpIG9udG8gYF9vbkRpZFNlbmRSZXF1ZXN0YCBzb1xuXHRcdC8vIGRvd25zdHJlYW0gbGlzdGVuZXJzIChlLmcuLCB0ZWxlbWV0cnkpIGNhbiBvYnNlcnZlIGV2ZXJ5IHVzZXJcblx0XHQvLyByZXF1ZXN0IGZvciBhIHNlc3Npb24sIG5vdCBqdXN0IHRob3NlIGluaXRpYXRlZCBmcm9tIHRoZSBzZXNzaW9uc1xuXHRcdC8vIFVJLiBTZW5kcyBvcmlnaW5hdGluZyBmcm9tIHtAbGluayBzZW5kUmVxdWVzdH0gYW5kXG5cdFx0Ly8ge0BsaW5rIHNlbmROZXdDaGF0UmVxdWVzdH0gYXJlIGRlZHVwbGljYXRlZCB2aWFcblx0XHQvLyB7QGxpbmsgX3BlbmRpbmdTZW5kQ2hhdFJlc291cmNlc30uXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0U2VydmljZS5vbkRpZFN1Ym1pdFJlcXVlc3QoKHsgY2hhdFNlc3Npb25SZXNvdXJjZSwgbWVzc2FnZSwgYXR0YWNoZWRDb250ZXh0IH0pID0+IHtcblx0XHRcdGlmICh0aGlzLl9wZW5kaW5nU2VuZENoYXRSZXNvdXJjZXMuaGFzKGNoYXRTZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgb3duZWRDaGF0ID0gdGhpcy5nZXRTZXNzaW9uRm9yQ2hhdFJlc291cmNlKGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKG93bmVkQ2hhdCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZFNlbmRSZXF1ZXN0LmZpcmUoe1xuXHRcdFx0XHRcdHNlc3Npb246IG93bmVkQ2hhdC5zZXNzaW9uLFxuXHRcdFx0XHRcdGNoYXQ6IG93bmVkQ2hhdC5jaGF0LFxuXHRcdFx0XHRcdGlzTmV3U2Vzc2lvbjogZmFsc2UsXG5cdFx0XHRcdFx0aXNOZXdDaGF0OiBmYWxzZSxcblx0XHRcdFx0XHRvcHRpb25zOiB7IHF1ZXJ5OiBtZXNzYWdlPy50ZXh0ID8/ICcnLCBhdHRhY2hlZENvbnRleHQgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25Qcm92aWRlcnNDaGFuZ2VkKGU6IElTZXNzaW9uc1Byb3ZpZGVyc0NoYW5nZUV2ZW50KTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiBlLnJlbW92ZWQpIHtcblx0XHRcdHRoaXMuX3Byb3ZpZGVyTGlzdGVuZXJzLmRlbGV0ZUFuZERpc3Bvc2UocHJvdmlkZXIuaWQpO1xuXHRcdH1cblx0XHRpZiAoZS5hZGRlZC5sZW5ndGgpIHtcblx0XHRcdHRoaXMuX3N1YnNjcmliZVRvUHJvdmlkZXJzKGUuYWRkZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3N1YnNjcmliZVRvUHJvdmlkZXJzKHByb3ZpZGVyczogcmVhZG9ubHkgSVNlc3Npb25zUHJvdmlkZXJbXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgcHJvdmlkZXJzKSB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gdGhpcy5vbkRpZENoYW5nZVNlc3Npb25zRnJvbVNlc3Npb25zUHJvdmlkZXJzKGUpKSk7XG5cdFx0XHRpZiAocHJvdmlkZXIub25EaWRSZXBsYWNlU2Vzc2lvbikge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRSZXBsYWNlU2Vzc2lvbihlID0+IHRoaXMuX2hhbmRsZURpZFJlcGxhY2VTZXNzaW9uKGUuZnJvbSwgZS50bykpKTtcblx0XHRcdH1cblx0XHRcdGlmIChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25UeXBlcykge1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9uVHlwZXMoKCkgPT4gdGhpcy5fdXBkYXRlU2Vzc2lvblR5cGVzKCkpKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Byb3ZpZGVyTGlzdGVuZXJzLnNldChwcm92aWRlci5pZCwgZGlzcG9zYWJsZXMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZURpZFJlcGxhY2VTZXNzaW9uKGZyb206IElTZXNzaW9uLCB0bzogSVNlc3Npb24pOiB2b2lkIHtcblx0XHR0aGlzLmNoYXRXaWRnZXRIaXN0b3J5U2VydmljZS5tb3ZlSGlzdG9yeShDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBmcm9tLnNlc3Npb25JZCwgdG8uc2Vzc2lvbklkKTtcblx0XHQvLyBOb3RpZnkgdGhlIHZpZXcgc2VydmljZSBzbyBpdCBjYW4gdXBkYXRlIHRoZSB2aXNpYmxlIGdyaWQgc2xvdC5cblx0XHR0aGlzLl9vbkRpZFJlcGxhY2VTZXNzaW9uLmZpcmUoeyBmcm9tLCB0byB9KTtcblx0XHQvLyBBbHdheXMgZmlyZSB0aGUgY2hhbmdlIGV2ZW50IHNvIHRoZSBTZXNzaW9uc0xpc3QgcmVmcmVzaGVzIGV2ZW4gd2hlblxuXHRcdC8vIHRoZSB1c2VyIG5hdmlnYXRlZCB0byBhIGRpZmZlcmVudCBzZXNzaW9uIHdoaWxlIHRoZSBuZXcgb25lIHdhc1xuXHRcdC8vIGJlaW5nIGNyZWF0ZWQgKHdoaWNoIGlzIGhvdyBkdXBsaWNhdGUgcm93cyBhcHBlYXJlZCBpbiB0aGUgbGlzdCkuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHtcblx0XHRcdGFkZGVkOiBbXSxcblx0XHRcdHJlbW92ZWQ6IGZyb20uc2Vzc2lvbklkID09PSB0by5zZXNzaW9uSWQgPyBbXSA6IFtmcm9tXSxcblx0XHRcdGNoYW5nZWQ6IFt0b10sXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlU2Vzc2lvbnNGcm9tU2Vzc2lvbnNQcm92aWRlcnMoZTogSVNlc3Npb25DaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdC8vIENsZWFyIHN0YWxlIG5ldyBzZXNzaW9uIGlmIHRoZSBwcm92aWRlciByZW1vdmVkIGl0LiBUaGUgcHJvdmlkZXJcblx0XHQvLyBhbHJlYWR5IGRpc3Bvc2VkIGl0LCBzbyBqdXN0IGRyb3AgdGhlIHBvaW50ZXIgKGRvIG5vdCBkaXNwb3NlIGFnYWluKS5cblx0XHRpZiAoZS5yZW1vdmVkLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX25ld1Nlc3Npb24uZ2V0KCk7XG5cdFx0XHRpZiAoY3VycmVudCAmJiBlLnJlbW92ZWQuc29tZShyID0+IHIuc2Vzc2lvbklkID09PSBjdXJyZW50LnNlc3Npb25JZCkpIHtcblx0XHRcdFx0dGhpcy5fbmV3U2Vzc2lvbi5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYXV0b21hdGlvblNlc3Npb24gPSB0aGlzLl9hdXRvbWF0aW9uU2Vzc2lvbi5nZXQoKTtcblx0XHRcdGlmIChhdXRvbWF0aW9uU2Vzc2lvbiAmJiBlLnJlbW92ZWQuc29tZShyID0+IHIuc2Vzc2lvbklkID09PSBhdXRvbWF0aW9uU2Vzc2lvbi5zZXNzaW9uSWQpKSB7XG5cdFx0XHRcdHRoaXMuX2F1dG9tYXRpb25TZXNzaW9uLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIHZpZXcgc2VydmljZSByZWFjdHMgdG8gdGhpcyBldmVudCB0byBkcm9wIHJlbW92ZWQgc2Vzc2lvbnMgZnJvbVxuXHRcdC8vIHRoZSBncmlkIGFuZCBwaWNrIGEgZmFsbGJhY2sgYWN0aXZlIHNlc3Npb24uXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKGUpO1xuXHR9XG5cblx0Z2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7XG5cdFx0Ly8gRGVkdXAgb25seSBhZmZlY3RzIHRoZSBkaXNwbGF5ZWQgbGlzdDsgbG9va3VwcyAoYGdldFNlc3Npb25gLFxuXHRcdC8vIGBnZXRTZXNzaW9uRm9yQ2hhdFJlc291cmNlYCkgdXNlIHRoZSByYXcgbWVyZ2VkIHNldCBzbyBhbiBFSCByb3cgdGhhdCBpc1xuXHRcdC8vIGhpZGRlbiBoZXJlIGNhbiBzdGlsbCBiZSByZXNvbHZlZCBhbmQgbWlncmF0ZWQgd2hlbiBjbGlja2VkLlxuXHRcdHJldHVybiB0aGlzLl9kZWR1cGVNaWdyYXRlZENvcGlsb3RDbGlTZXNzaW9ucyh0aGlzLl9nZXRNZXJnZWRTZXNzaW9ucygpKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE1lcmdlZFNlc3Npb25zKCk6IElTZXNzaW9uW10ge1xuXHRcdGNvbnN0IHNlc3Npb25zOiBJU2Vzc2lvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcnMoKSkge1xuXHRcdFx0c2Vzc2lvbnMucHVzaCguLi5wcm92aWRlci5nZXRTZXNzaW9ucygpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHNlc3Npb25zO1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgbGVnYWN5IENvcGlsb3QgQ0xJIHNlc3Npb24gbWlncmF0ZWQgaW4gcGxhY2UgdG8gdGhlIGFnZW50IGhvc3QgaXMgYnJpZWZseVxuXHQgKiBsaXN0ZWQgYnkgQk9USCB0aGUgZXh0ZW5zaW9uLWhvc3QgcHJvdmlkZXIgKGBjb3BpbG90Y2xpOi88aWQ+YCkgYW5kIHRoZVxuXHQgKiBhZ2VudC1ob3N0IHByb3ZpZGVyIChgYWdlbnQtaG9zdC1jb3BpbG90Y2xpOi88aWQ+YCkgZm9yIHRoZSBzYW1lIHVuZGVybHlpbmdcblx0ICogU0RLIHNlc3Npb24gaWQgXHUyMDE0IHRoZSB3b3JrYmVuY2ggYWdlbnQtc2Vzc2lvbiBtb2RlbCBjYWNoZXMgdGhlIHN0YWxlIGxlZ2FjeVxuXHQgKiBlbnRyeSBldmVuIGFmdGVyIHRoZSBleHRlbnNpb24gc3RvcHMgcmVwb3J0aW5nIGl0LiBEcm9wIHRoZSBsZWdhY3kgZW50cnkgc29cblx0ICogZXhhY3RseSBvbmUgcm93IHNob3dzIHBlciBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfZGVkdXBlTWlncmF0ZWRDb3BpbG90Q2xpU2Vzc2lvbnMoc2Vzc2lvbnM6IElTZXNzaW9uW10pOiBJU2Vzc2lvbltdIHtcblx0XHRsZXQgbWlncmF0ZWRSYXdJZHM6IFNldDxzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuXHRcdFx0aWYgKHNlc3Npb24ucmVzb3VyY2Uuc2NoZW1lID09PSBDT1BJTE9UX0NMSV9MT0NBTF9BSF9TQ0hFTUUpIHtcblx0XHRcdFx0Y29uc3QgcmF3SWQgPSBnZXRDb3BpbG90Q2xpU2Vzc2lvblJhd0lkKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAocmF3SWQpIHtcblx0XHRcdFx0XHQobWlncmF0ZWRSYXdJZHMgPz89IG5ldyBTZXQ8c3RyaW5nPigpKS5hZGQocmF3SWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghbWlncmF0ZWRSYXdJZHMpIHtcblx0XHRcdHJldHVybiBzZXNzaW9ucztcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0gc2Vzc2lvbnMuZmlsdGVyKHNlc3Npb24gPT4ge1xuXHRcdFx0Ly8gT25seSB0aGUgbGVnYWN5IGV4dGVuc2lvbi1ob3N0IHNjaGVtZSAoYGNvcGlsb3RjbGk6YCkgZGVub3RlcyBhIHN0YWxlXG5cdFx0XHQvLyBlbnRyeSB0byBkcm9wLiBSZW1vdGUgYWdlbnQtaG9zdCBDb3BpbG90IHNlc3Npb25zXG5cdFx0XHQvLyAoYHJlbW90ZS08YXV0aG9yaXR5Pi1jb3BpbG90Y2xpOmApIHNoYXJlIHRoZSBgY29waWxvdGNsaWAgc2Vzc2lvbiB0eXBlIGJ1dFxuXHRcdFx0Ly8gYXJlIGRpc3RpbmN0IHNlc3Npb25zIHRoYXQgbXVzdCBuZXZlciBiZSBkZWR1cGVkIGFnYWluc3QgYSBsb2NhbCBtaWdyYXRlZFxuXHRcdFx0Ly8gaWQsIGFuZCB0aGUgbWlncmF0ZWQgZW50cnkgaXRzZWxmIHVzZXMgYGFnZW50LWhvc3QtY29waWxvdGNsaTpgLlxuXHRcdFx0aWYgKHNlc3Npb24ucmVzb3VyY2Uuc2NoZW1lID09PSBDT1BJTE9UX0NMSV9FSF9TQ0hFTUUpIHtcblx0XHRcdFx0Y29uc3QgcmF3SWQgPSBnZXRDb3BpbG90Q2xpU2Vzc2lvblJhd0lkKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAocmF3SWQgJiYgbWlncmF0ZWRSYXdJZHMhLmhhcyhyYXdJZCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0pO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRnZXRTZXNzaW9uKHJlc291cmNlOiBVUkkpOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdW5saXN0ZWRTZXNzaW9uID0gdGhpcy5fdW5saXN0ZWROZXdTZXNzaW9ucy5nZXQocmVzb3VyY2UpO1xuXHRcdGlmICh1bmxpc3RlZFNlc3Npb24pIHtcblx0XHRcdHJldHVybiB1bmxpc3RlZFNlc3Npb247XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9nZXRNZXJnZWRTZXNzaW9ucygpLmZpbmQocyA9PlxuXHRcdFx0dGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwocy5yZXNvdXJjZSwgcmVzb3VyY2UpXG5cdFx0KTtcblx0fVxuXG5cdGdldFNlc3Npb25Gb3JDaGF0UmVzb3VyY2UocmVzb3VyY2U6IFVSSSk6IHsgc2Vzc2lvbjogSVNlc3Npb247IGNoYXQ6IElDaGF0IH0gfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiB0aGlzLl9nZXRNZXJnZWRTZXNzaW9ucygpKSB7XG5cdFx0XHRjb25zdCBjaGF0ID0gc2Vzc2lvbi5jaGF0cy5nZXQoKS5maW5kKGMgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwoYy5yZXNvdXJjZSwgcmVzb3VyY2UpKTtcblx0XHRcdGlmIChjaGF0KSB7XG5cdFx0XHRcdHJldHVybiB7IHNlc3Npb24sIGNoYXQgfTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbWFpbkNoYXQgPSBzZXNzaW9uLm1haW5DaGF0LmdldCgpO1xuXHRcdFx0aWYgKHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKG1haW5DaGF0LnJlc291cmNlLCByZXNvdXJjZSkpIHtcblx0XHRcdFx0cmV0dXJuIHsgc2Vzc2lvbiwgY2hhdDogbWFpbkNoYXQgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldEFsbFNlc3Npb25UeXBlcygpOiBJU2Vzc2lvblR5cGVbXSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLl9zZXNzaW9uVHlwZXNdO1xuXHR9XG5cblx0Z2V0QWxsUHJvdmlkZXJTZXNzaW9uVHlwZXMoKTogSVByb3ZpZGVyU2Vzc2lvblR5cGVbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJUHJvdmlkZXJTZXNzaW9uVHlwZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcnMoKSkge1xuXHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uVHlwZSBvZiBwcm92aWRlci5zZXNzaW9uVHlwZXMpIHtcblx0XHRcdFx0aWYgKGlzRm9yZ2VBZHZlcnRpc2VkU2Vzc2lvblR5cGUoc2Vzc2lvblR5cGUpKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goeyBwcm92aWRlcklkOiBwcm92aWRlci5pZCwgc2Vzc2lvblR5cGUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGdldFNlc3Npb25UeXBlc0ZvckZvbGRlcihmb2xkZXJVcmk6IFVSSSk6IElQcm92aWRlclNlc3Npb25UeXBlW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogSVByb3ZpZGVyU2Vzc2lvblR5cGVbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXJzKCkpIHtcblx0XHRcdGlmICghcHJvdmlkZXIucmVzb2x2ZVdvcmtzcGFjZShmb2xkZXJVcmkpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uVHlwZSBvZiBwcm92aWRlci5nZXRTZXNzaW9uVHlwZXMoZm9sZGVyVXJpKSkge1xuXHRcdFx0XHRpZiAoaXNGb3JnZUFkdmVydGlzZWRTZXNzaW9uVHlwZShzZXNzaW9uVHlwZSkpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaCh7IHByb3ZpZGVySWQ6IHByb3ZpZGVyLmlkLCBzZXNzaW9uVHlwZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Z2V0UXVpY2tDaGF0U2Vzc2lvblR5cGVzKCk6IElQcm92aWRlclNlc3Npb25UeXBlW10ge1xuXHRcdGNvbnN0IHJlc3VsdDogSVByb3ZpZGVyU2Vzc2lvblR5cGVbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXJzKCkpIHtcblx0XHRcdGlmICghcHJvdmlkZXIuc3VwcG9ydHNRdWlja0NoYXRzKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uVHlwZSBvZiBwcm92aWRlci5zZXNzaW9uVHlwZXMpIHtcblx0XHRcdFx0aWYgKGlzRm9yZ2VBZHZlcnRpc2VkU2Vzc2lvblR5cGUoc2Vzc2lvblR5cGUpKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goeyBwcm92aWRlcklkOiBwcm92aWRlci5pZCwgc2Vzc2lvblR5cGUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGlzTmV3U2Vzc2lvblRhcmdldEF2YWlsYWJsZShmb2xkZXJVcmk6IFVSSSwgb3B0aW9ucz86IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9pc1RhcmdldEF2YWlsYWJsZSh0aGlzLmdldFNlc3Npb25UeXBlc0ZvckZvbGRlcihmb2xkZXJVcmkpLCBvcHRpb25zKTtcblx0fVxuXG5cdGlzUXVpY2tDaGF0VGFyZ2V0QXZhaWxhYmxlKG9wdGlvbnM/OiBJQ3JlYXRlTmV3U2Vzc2lvbk9wdGlvbnMpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNUYXJnZXRBdmFpbGFibGUodGhpcy5nZXRRdWlja0NoYXRTZXNzaW9uVHlwZXMoKSwgb3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIF9pc1RhcmdldEF2YWlsYWJsZShzZXNzaW9uVHlwZXM6IHJlYWRvbmx5IElQcm92aWRlclNlc3Npb25UeXBlW10sIG9wdGlvbnM/OiBJQ3JlYXRlTmV3U2Vzc2lvbk9wdGlvbnMpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gc2Vzc2lvblR5cGVzLnNvbWUoY2FuZGlkYXRlID0+XG5cdFx0XHQoIW9wdGlvbnM/LnByb3ZpZGVySWQgfHwgY2FuZGlkYXRlLnByb3ZpZGVySWQgPT09IG9wdGlvbnMucHJvdmlkZXJJZClcblx0XHRcdCYmICghb3B0aW9ucz8uc2Vzc2lvblR5cGVJZCB8fCBjYW5kaWRhdGUuc2Vzc2lvblR5cGUuaWQgPT09IG9wdGlvbnMuc2Vzc2lvblR5cGVJZClcblx0XHQpO1xuXHR9XG5cblx0cmVzb2x2ZVdvcmtzcGFjZShmb2xkZXJVcmk6IFVSSSwgcHJlZmVycmVkUHJvdmlkZXJJZD86IHN0cmluZyk6IHsgcHJvdmlkZXJJZDogc3RyaW5nOyB3b3Jrc3BhY2U6IElTZXNzaW9uV29ya3NwYWNlIH0gfCB1bmRlZmluZWQge1xuXHRcdGlmIChwcmVmZXJyZWRQcm92aWRlcklkKSB7XG5cdFx0XHRjb25zdCBwcmVmZXJyZWQgPSB0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcihwcmVmZXJyZWRQcm92aWRlcklkKTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IHByZWZlcnJlZD8ucmVzb2x2ZVdvcmtzcGFjZShmb2xkZXJVcmkpO1xuXHRcdFx0aWYgKHdvcmtzcGFjZSkge1xuXHRcdFx0XHRyZXR1cm4geyBwcm92aWRlcklkOiBwcmVmZXJyZWRQcm92aWRlcklkLCB3b3Jrc3BhY2UgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcnMoKSkge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gcHJvdmlkZXIucmVzb2x2ZVdvcmtzcGFjZShmb2xkZXJVcmkpO1xuXHRcdFx0aWYgKHdvcmtzcGFjZSkge1xuXHRcdFx0XHRyZXR1cm4geyBwcm92aWRlcklkOiBwcm92aWRlci5pZCwgd29ya3NwYWNlIH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9jb2xsZWN0U2Vzc2lvblR5cGVzKCk6IElTZXNzaW9uVHlwZVtdIHtcblx0XHRjb25zdCB0eXBlczogSVNlc3Npb25UeXBlW10gPSBbXTtcblx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLnNlc3Npb25zUHJvdmlkZXJzU2VydmljZS5nZXRQcm92aWRlcnMoKSkge1xuXHRcdFx0Zm9yIChjb25zdCB0eXBlIG9mIHByb3ZpZGVyLnNlc3Npb25UeXBlcykge1xuXHRcdFx0XHRpZiAoIWlzRm9yZ2VBZHZlcnRpc2VkU2Vzc2lvblR5cGUodHlwZSkgfHwgc2Vlbi5oYXModHlwZS5pZCkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzZWVuLmFkZCh0eXBlLmlkKTtcblx0XHRcdFx0dHlwZXMucHVzaCh0eXBlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHR5cGVzO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlU2Vzc2lvblR5cGVzKCk6IHZvaWQge1xuXHRcdC8vIEFsd2F5cyBmaXJlIFx1MjAxNCB0aGUgZGVkdXBsaWNhdGVkIGZsYXQgbGlzdCAodXNlZCBieSBzdXJmYWNlcyB0aGF0XG5cdFx0Ly8gb25seSBuZWVkIGEgc2V0IG9mIHR5cGUgaWRzKSBtYXkgYmUgdW5jaGFuZ2VkLCBidXQgdGhlIHBlci1mb2xkZXJcblx0XHQvLyByZXN1bHQgb2Yge0BsaW5rIGdldFNlc3Npb25UeXBlc0ZvckZvbGRlcn0gY2FuIGNoYW5nZSB3aGVuZXZlciBhbnlcblx0XHQvLyBwcm92aWRlcidzIHR5cGVzIG9yIHRoZSBzZXQgb2YgcHJvdmlkZXJzIGNoYW5nZXMsIGJlY2F1c2UgZWFjaFxuXHRcdC8vIGVudHJ5IGlzIGtleWVkIGJ5IChwcm92aWRlcklkIFx1MDBENyBzZXNzaW9uVHlwZSkgcmF0aGVyIHRoYW4gYnkgdHlwZVxuXHRcdC8vIGlkIGFsb25lLlxuXHRcdHRoaXMuX3Nlc3Npb25UeXBlcyA9IHRoaXMuX2NvbGxlY3RTZXNzaW9uVHlwZXMoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25UeXBlcy5maXJlKCk7XG5cdH1cblxuXHRkaXNjYXJkTmV3U2Vzc2lvbihzZXNzaW9uPzogSVNlc3Npb24pOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fbmV3U2Vzc2lvbi5nZXQoKTtcblx0XHRpZiAoIWN1cnJlbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gV2hlbiBhIHNwZWNpZmljIHNlc3Npb24gaXMgZ2l2ZW4sIG9ubHkgZGlzY2FyZCBpZiBpdCBpcyB0aGUgY3VycmVudFxuXHRcdC8vIG5ldyBzZXNzaW9uOyBjbG9zaW5nIGFuIHVucmVsYXRlZCBzZXNzaW9uIG11c3Qgbm90IGRyb3AgdGhlIGRyYWZ0LlxuXHRcdGlmIChzZXNzaW9uICYmIHNlc3Npb24uc2Vzc2lvbklkICE9PSBjdXJyZW50LnNlc3Npb25JZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9uZXdTZXNzaW9uLnNldCh1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5fZ2V0UHJvdmlkZXIoY3VycmVudCk/LmRlbGV0ZU5ld1Nlc3Npb24oY3VycmVudC5zZXNzaW9uSWQpO1xuXHRcdHRoaXMuX29uRGlkRGlzY2FyZE5ld1Nlc3Npb24uZmlyZShjdXJyZW50KTtcblx0fVxuXG5cdGRpc2NhcmRBdXRvbWF0aW9uU2Vzc2lvbihzZXNzaW9uPzogSVNlc3Npb24pOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fYXV0b21hdGlvblNlc3Npb24uZ2V0KCk7XG5cdFx0aWYgKCFjdXJyZW50IHx8IChzZXNzaW9uICYmIHNlc3Npb24uc2Vzc2lvbklkICE9PSBjdXJyZW50LnNlc3Npb25JZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fYXV0b21hdGlvblNlc3Npb24uc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9nZXRQcm92aWRlcihjdXJyZW50KT8uZGVsZXRlTmV3U2Vzc2lvbihjdXJyZW50LnNlc3Npb25JZCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZSB0aGUgcHJvdmlkZXIgYW5kIHNlc3Npb24gdHlwZSB0byB1c2UgZm9yIGEgbmV3IHNlc3Npb24gaW4gdGhlXG5cdCAqIGdpdmVuIGZvbGRlci4gSW5jbHVkZXMgdGhhdCBwcm92aWRlcidzIHJlc29sdmVkIHdvcmtzcGFjZSBzbyBoZWFkbGVzc1xuXHQgKiBjYWxsZXJzIGNhbiBlbmZvcmNlIHByb3ZpZGVyLXNwZWNpZmljIHRydXN0IHdpdGhvdXQgcmVzb2x2aW5nIGl0IGFnYWluLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZVByb3ZpZGVyRm9yTmV3U2Vzc2lvbihmb2xkZXJVcmk6IFVSSSwgb3B0aW9ucz86IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucyk6IHsgcHJvdmlkZXI6IElTZXNzaW9uc1Byb3ZpZGVyOyBzZXNzaW9uVHlwZUlkOiBzdHJpbmc7IHdvcmtzcGFjZTogSVNlc3Npb25Xb3Jrc3BhY2UgfSB7XG5cdFx0Y29uc3QgcHJvdmlkZXJzID0gdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXJzKCk7XG5cdFx0bGV0IHByb3ZpZGVyOiBJU2Vzc2lvbnNQcm92aWRlciB8IHVuZGVmaW5lZDtcblx0XHRsZXQgd29ya3NwYWNlOiBJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgc2Vzc2lvblR5cGVJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlcXVpcmVzV29ya3RyZWVDb25maWd1cmF0aW9uID0gb3B0aW9ucz8uaXNvbGF0aW9uTW9kZSA9PT0gJ3dvcmt0cmVlJ1xuXHRcdFx0fHwgb3B0aW9ucz8ud29ya3RyZWVCcmFuY2hUcmFjayAhPT0gdW5kZWZpbmVkXG5cdFx0XHR8fCBvcHRpb25zPy5icmFuY2ggIT09IHVuZGVmaW5lZDtcblx0XHRjb25zdCByZXNvbHZlU2Vzc2lvblR5cGVJZCA9IChjYW5kaWRhdGU6IElTZXNzaW9uc1Byb3ZpZGVyKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25UeXBlcyA9IGNhbmRpZGF0ZS5nZXRTZXNzaW9uVHlwZXMoZm9sZGVyVXJpKTtcblx0XHRcdGlmIChvcHRpb25zPy5zZXNzaW9uVHlwZUlkKSB7XG5cdFx0XHRcdGNvbnN0IHJlcXVlc3RlZCA9IHNlc3Npb25UeXBlcy5maW5kKHR5cGUgPT4gdHlwZS5pZCA9PT0gb3B0aW9ucy5zZXNzaW9uVHlwZUlkKTtcblx0XHRcdFx0cmV0dXJuIHJlcXVlc3RlZCAmJiAoIXJlcXVpcmVzV29ya3RyZWVDb25maWd1cmF0aW9uIHx8IHJlcXVlc3RlZC5zdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbiA9PT0gdHJ1ZSlcblx0XHRcdFx0XHQ/IHJlcXVlc3RlZC5pZFxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlcXVpcmVzV29ya3RyZWVDb25maWd1cmF0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBzZXNzaW9uVHlwZXMuZmluZCh0eXBlID0+IHR5cGUuc3VwcG9ydHNXb3JrdHJlZUNvbmZpZ3VyYXRpb24gPT09IHRydWUpPy5pZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBzZXNzaW9uVHlwZXMuZmluZCh0eXBlID0+IGlzRm9yZ2VBZHZlcnRpc2VkU2Vzc2lvblR5cGVJZCh0eXBlLmlkKSk/LmlkID8/IHNlc3Npb25UeXBlc1swXT8uaWQ7XG5cdFx0fTtcblxuXHRcdGlmIChvcHRpb25zPy5wcm92aWRlcklkKSB7XG5cdFx0XHRwcm92aWRlciA9IHByb3ZpZGVycy5maW5kKHAgPT4gcC5pZCA9PT0gb3B0aW9ucy5wcm92aWRlcklkKTtcblx0XHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBTZXNzaW9ucyBwcm92aWRlciAnJHtvcHRpb25zLnByb3ZpZGVySWR9JyBub3QgZm91bmRgKTtcblx0XHRcdH1cblx0XHRcdHdvcmtzcGFjZSA9IHByb3ZpZGVyLnJlc29sdmVXb3Jrc3BhY2UoZm9sZGVyVXJpKTtcblx0XHRcdGlmICghd29ya3NwYWNlKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbnMgcHJvdmlkZXIgJyR7b3B0aW9ucy5wcm92aWRlcklkfScgY2Fubm90IHJlc29sdmUgZm9sZGVyICcke2ZvbGRlclVyaS50b1N0cmluZygpfSdgKTtcblx0XHRcdH1cblx0XHRcdHNlc3Npb25UeXBlSWQgPSByZXNvbHZlU2Vzc2lvblR5cGVJZChwcm92aWRlcik7XG5cdFx0XHRpZiAoIXNlc3Npb25UeXBlSWQpIHtcblx0XHRcdFx0aWYgKHJlcXVpcmVzV29ya3RyZWVDb25maWd1cmF0aW9uKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBTZXNzaW9ucyBwcm92aWRlciAnJHtvcHRpb25zLnByb3ZpZGVySWR9JyBkb2VzIG5vdCBzdXBwb3J0IHdvcmt0cmVlIGNvbmZpZ3VyYXRpb24gZm9yIGZvbGRlciAnJHtmb2xkZXJVcmkudG9TdHJpbmcoKX0nYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG9wdGlvbnMuc2Vzc2lvblR5cGVJZCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbnMgcHJvdmlkZXIgJyR7b3B0aW9ucy5wcm92aWRlcklkfScgZG9lcyBub3QgYWR2ZXJ0aXNlIHNlc3Npb24gdHlwZSAnJHtvcHRpb25zLnNlc3Npb25UeXBlSWR9J2ApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gc2Vzc2lvbiB0eXBlcyBhdmFpbGFibGUgZm9yIHByb3ZpZGVyICcke3Byb3ZpZGVyLmlkfSdgKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Zm9yIChjb25zdCBjYW5kaWRhdGUgb2YgcHJvdmlkZXJzKSB7XG5cdFx0XHRcdGNvbnN0IGNhbmRpZGF0ZVdvcmtzcGFjZSA9IGNhbmRpZGF0ZS5yZXNvbHZlV29ya3NwYWNlKGZvbGRlclVyaSk7XG5cdFx0XHRcdGlmICghY2FuZGlkYXRlV29ya3NwYWNlKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY2FuZGlkYXRlU2Vzc2lvblR5cGVJZCA9IHJlc29sdmVTZXNzaW9uVHlwZUlkKGNhbmRpZGF0ZSk7XG5cdFx0XHRcdGlmICghY2FuZGlkYXRlU2Vzc2lvblR5cGVJZCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHByb3ZpZGVyID0gY2FuZGlkYXRlO1xuXHRcdFx0XHR3b3Jrc3BhY2UgPSBjYW5kaWRhdGVXb3Jrc3BhY2U7XG5cdFx0XHRcdHNlc3Npb25UeXBlSWQgPSBjYW5kaWRhdGVTZXNzaW9uVHlwZUlkO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmICghcHJvdmlkZXIgfHwgIXdvcmtzcGFjZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IocmVxdWlyZXNXb3JrdHJlZUNvbmZpZ3VyYXRpb25cblx0XHRcdFx0XHQ/IGBObyBzZXNzaW9ucyBwcm92aWRlciBzdXBwb3J0cyB3b3JrdHJlZSBjb25maWd1cmF0aW9uIGZvciBmb2xkZXIgJyR7Zm9sZGVyVXJpLnRvU3RyaW5nKCl9J2Bcblx0XHRcdFx0XHQ6IGBObyBzZXNzaW9ucyBwcm92aWRlciBjYW4gcmVzb2x2ZSBmb2xkZXIgJyR7Zm9sZGVyVXJpLnRvU3RyaW5nKCl9J2ApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIXNlc3Npb25UeXBlSWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gc2Vzc2lvbiB0eXBlcyBhdmFpbGFibGUgZm9yIHByb3ZpZGVyICcke3Byb3ZpZGVyLmlkfSdgKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgcHJvdmlkZXIsIHNlc3Npb25UeXBlSWQsIHdvcmtzcGFjZSB9O1xuXHR9XG5cblx0Y3JlYXRlTmV3U2Vzc2lvbihmb2xkZXJVcmk6IFVSSSwgb3B0aW9ucz86IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucyk6IElTZXNzaW9uIHtcblx0XHRjb25zdCB7IHByb3ZpZGVyLCBzZXNzaW9uVHlwZUlkIH0gPSB0aGlzLl9yZXNvbHZlUHJvdmlkZXJGb3JOZXdTZXNzaW9uKGZvbGRlclVyaSwgb3B0aW9ucyk7XG5cblx0XHRjb25zdCBwcmV2aW91c05ld1Nlc3Npb24gPSB0aGlzLl9uZXdTZXNzaW9uLmdldCgpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKGZvbGRlclVyaSwgc2Vzc2lvblR5cGVJZCwgeyBtZXRhZGF0YTogb3B0aW9ucz8ubWV0YWRhdGEgfSk7XG5cblx0XHQvLyBQcm92aWRlcnMgbm8gbG9uZ2VyIGRpc3Bvc2UgdGhlIHByZXZpb3VzIG5ldyBzZXNzaW9uIGltcGxpY2l0bHksIHNvXG5cdFx0Ly8gZGlzcG9zZSB0aGUgb25lIHRoaXMgY29tcG9zZXIganVzdCByZXBsYWNlZC4gVXNlIGl0cyBvd24gcHJvdmlkZXJcblx0XHQvLyBiZWNhdXNlIHN3aXRjaGluZyB3b3Jrc3BhY2UgY2FuIHN3aXRjaCBwcm92aWRlcnMuIERvbmUgYWZ0ZXIgYVxuXHRcdC8vIHN1Y2Nlc3NmdWwgY3JlYXRlIHNvIGEgdGhyb3cgYWJvdmUgbGVhdmVzIHRoZSBwcmV2aW91cyBvbmUgaW50YWN0LlxuXHRcdGlmIChwcmV2aW91c05ld1Nlc3Npb24gJiYgcHJldmlvdXNOZXdTZXNzaW9uLnNlc3Npb25JZCAhPT0gc2Vzc2lvbi5zZXNzaW9uSWQpIHtcblx0XHRcdHRoaXMuX2dldFByb3ZpZGVyKHByZXZpb3VzTmV3U2Vzc2lvbik/LmRlbGV0ZU5ld1Nlc3Npb24ocHJldmlvdXNOZXdTZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0XHQvLyBUZXJtaW5hbCBvd25lcnNoaXAgbXVzdCBtb3ZlIGJlZm9yZSB0aGUgcmVwbGFjZW1lbnQgaXMgcHVibGlzaGVkOlxuXHRcdFx0Ly8gcHVibGlzaGluZyBlYWdlcmx5IGVuc3VyZXMgYSB0ZXJtaW5hbCBmb3IgdGhlIG5ldyBkcmFmdC5cblx0XHRcdHRoaXMuX29uRGlkUmVwbGFjZU5ld0RyYWZ0U2Vzc2lvbi5maXJlKHsgZnJvbTogcHJldmlvdXNOZXdTZXNzaW9uLCB0bzogc2Vzc2lvbiB9KTtcblx0XHR9XG5cdFx0dGhpcy5fbmV3U2Vzc2lvbi5zZXQoc2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0fVxuXG5cdGNyZWF0ZUF1dG9tYXRpb25TZXNzaW9uKGZvbGRlclVyaTogVVJJLCBvcHRpb25zPzogSUNyZWF0ZU5ld1Nlc3Npb25PcHRpb25zKTogSVNlc3Npb24ge1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIHNlc3Npb25UeXBlSWQgfSA9IHRoaXMuX3Jlc29sdmVQcm92aWRlckZvck5ld1Nlc3Npb24oZm9sZGVyVXJpLCBvcHRpb25zKTtcblx0XHRjb25zdCBwcmV2aW91c0F1dG9tYXRpb25TZXNzaW9uID0gdGhpcy5fYXV0b21hdGlvblNlc3Npb24uZ2V0KCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oZm9sZGVyVXJpLCBzZXNzaW9uVHlwZUlkKTtcblx0XHRpZiAocHJldmlvdXNBdXRvbWF0aW9uU2Vzc2lvbiAmJiBwcmV2aW91c0F1dG9tYXRpb25TZXNzaW9uLnNlc3Npb25JZCAhPT0gc2Vzc2lvbi5zZXNzaW9uSWQpIHtcblx0XHRcdHRoaXMuX2dldFByb3ZpZGVyKHByZXZpb3VzQXV0b21hdGlvblNlc3Npb24pPy5kZWxldGVOZXdTZXNzaW9uKHByZXZpb3VzQXV0b21hdGlvblNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHR9XG5cdFx0dGhpcy5fYXV0b21hdGlvblNlc3Npb24uc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0cmV0dXJuIHNlc3Npb247XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZSB0aGUgcHJvdmlkZXIgYW5kIHNlc3Npb24gdHlwZSB0byB1c2UgZm9yIGEgcXVpY2sgY2hhdCwga2V5ZWQgb25cblx0ICoge0BsaW5rIElTZXNzaW9uc1Byb3ZpZGVyLnN1cHBvcnRzUXVpY2tDaGF0c30gaW5zdGVhZCBvZiBgcmVzb2x2ZVdvcmtzcGFjZWAuXG5cdCAqIEhvbm9ycyBhbiBleHBsaWNpdCBgb3B0aW9ucy5zZXNzaW9uVHlwZUlkYCAodmFsaWRhdGVkIGFnYWluc3QgdGhlIGNob3NlblxuXHQgKiBwcm92aWRlcikgYW5kIG90aGVyd2lzZSBkZWZhdWx0cyB0byB0aGUgbGFzdC11c2VkIHR5cGUsIHRoZW4gdGhlIGZpcnN0XG5cdCAqIGFkdmVydGlzZWQgb25lLiBUaHJvd3Mgd2hlbiBubyBjYXBhYmxlIHByb3ZpZGVyL3R5cGUgY2FuIGJlIHJlc29sdmVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZVByb3ZpZGVyRm9yUXVpY2tDaGF0KG9wdGlvbnM/OiBJQ3JlYXRlTmV3U2Vzc2lvbk9wdGlvbnMpOiB7IHByb3ZpZGVyOiBJU2Vzc2lvbnNQcm92aWRlcjsgc2Vzc2lvblR5cGVJZDogc3RyaW5nIH0ge1xuXHRcdGNvbnN0IHByb3ZpZGVycyA9IHRoaXMuc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmdldFByb3ZpZGVycygpO1xuXHRcdGxldCBwcm92aWRlcjogSVNlc3Npb25zUHJvdmlkZXIgfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAob3B0aW9ucz8ucHJvdmlkZXJJZCkge1xuXHRcdFx0cHJvdmlkZXIgPSBwcm92aWRlcnMuZmluZChwID0+IHAuaWQgPT09IG9wdGlvbnMucHJvdmlkZXJJZCk7XG5cdFx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbnMgcHJvdmlkZXIgJyR7b3B0aW9ucy5wcm92aWRlcklkfScgbm90IGZvdW5kYCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXByb3ZpZGVyLnN1cHBvcnRzUXVpY2tDaGF0cykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb25zIHByb3ZpZGVyICcke29wdGlvbnMucHJvdmlkZXJJZH0nIGRvZXMgbm90IHN1cHBvcnQgcXVpY2sgY2hhdHNgKTtcblx0XHRcdH1cblx0XHRcdGlmIChvcHRpb25zLnNlc3Npb25UeXBlSWQgJiYgIXByb3ZpZGVyLnNlc3Npb25UeXBlcy5zb21lKHQgPT4gdC5pZCA9PT0gb3B0aW9ucy5zZXNzaW9uVHlwZUlkKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb25zIHByb3ZpZGVyICcke29wdGlvbnMucHJvdmlkZXJJZH0nIGRvZXMgbm90IGFkdmVydGlzZSBzZXNzaW9uIHR5cGUgJyR7b3B0aW9ucy5zZXNzaW9uVHlwZUlkfSdgKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gSXRlcmF0ZSBwcm92aWRlcnMgKGluIGBvcmRlcmApIGFuZCBwaWNrIHRoZSBmaXJzdCB0aGF0IHN1cHBvcnRzXG5cdFx0XHQvLyBxdWljayBjaGF0cy4gV2hlbiBhIHNwZWNpZmljIHNlc3Npb24gdHlwZSB3YXMgcmVxdWVzdGVkLCBhbHNvXG5cdFx0XHQvLyByZXF1aXJlIHRoZSBwcm92aWRlciB0byBhZHZlcnRpc2UgaXQuXG5cdFx0XHRmb3IgKGNvbnN0IGNhbmRpZGF0ZSBvZiBwcm92aWRlcnMpIHtcblx0XHRcdFx0aWYgKCFjYW5kaWRhdGUuc3VwcG9ydHNRdWlja0NoYXRzKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG9wdGlvbnM/LnNlc3Npb25UeXBlSWQgJiYgIWNhbmRpZGF0ZS5zZXNzaW9uVHlwZXMuc29tZSh0ID0+IHQuaWQgPT09IG9wdGlvbnMuc2Vzc2lvblR5cGVJZCkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRwcm92aWRlciA9IGNhbmRpZGF0ZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gc2Vzc2lvbnMgcHJvdmlkZXIgc3VwcG9ydHMgcXVpY2sgY2hhdHMnKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGVJZCA9IG9wdGlvbnM/LnNlc3Npb25UeXBlSWQgPz8gdGhpcy5fZGVmYXVsdFF1aWNrQ2hhdFNlc3Npb25UeXBlKHByb3ZpZGVyKTtcblx0XHRpZiAoIXNlc3Npb25UeXBlSWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gc2Vzc2lvbiB0eXBlcyBhdmFpbGFibGUgZm9yIHByb3ZpZGVyICcke3Byb3ZpZGVyLmlkfSdgKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgcHJvdmlkZXIsIHNlc3Npb25UeXBlSWQgfTtcblx0fVxuXG5cdC8qKiBEZWZhdWx0IHF1aWNrLWNoYXQgc2Vzc2lvbiB0eXBlOiBDb2RleCB3aGVuIGFkdmVydGlzZWQsIGVsc2UgdGhlIGxhc3QtdXNlZCB0eXBlLCBlbHNlIHRoZSBmaXJzdC4gKi9cblx0cHJpdmF0ZSBfZGVmYXVsdFF1aWNrQ2hhdFNlc3Npb25UeXBlKHByb3ZpZGVyOiBJU2Vzc2lvbnNQcm92aWRlcik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY29kZXggPSBwcm92aWRlci5zZXNzaW9uVHlwZXMuZmluZCh0ID0+IGlzRm9yZ2VBZHZlcnRpc2VkU2Vzc2lvblR5cGVJZCh0LmlkKSk7XG5cdFx0aWYgKGNvZGV4KSB7XG5cdFx0XHRyZXR1cm4gY29kZXguaWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGxhc3RVc2VkID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoTEFTVF9VU0VEX1FVSUNLX0NIQVRfU0VTU0lPTl9UWVBFX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0aWYgKGxhc3RVc2VkICYmIHByb3ZpZGVyLnNlc3Npb25UeXBlcy5zb21lKHQgPT4gdC5pZCA9PT0gbGFzdFVzZWQpKSB7XG5cdFx0XHRyZXR1cm4gbGFzdFVzZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0/LmlkO1xuXHR9XG5cblx0Y3JlYXRlUXVpY2tDaGF0KG9wdGlvbnM/OiBJQ3JlYXRlTmV3U2Vzc2lvbk9wdGlvbnMpOiBJU2Vzc2lvbiB7XG5cdFx0Y29uc3QgeyBwcm92aWRlciwgc2Vzc2lvblR5cGVJZCB9ID0gdGhpcy5fcmVzb2x2ZVByb3ZpZGVyRm9yUXVpY2tDaGF0KG9wdGlvbnMpO1xuXG5cdFx0Y29uc3QgcHJldmlvdXNOZXdTZXNzaW9uID0gdGhpcy5fbmV3U2Vzc2lvbi5nZXQoKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlUXVpY2tDaGF0KHNlc3Npb25UeXBlSWQpO1xuXHRcdHRoaXMuX25ld1Nlc3Npb24uc2V0KHNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShMQVNUX1VTRURfUVVJQ0tfQ0hBVF9TRVNTSU9OX1RZUEVfU1RPUkFHRV9LRVksIHNlc3Npb25UeXBlSWQsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0Ly8gTWlycm9yIGBjcmVhdGVOZXdTZXNzaW9uYDogZGlzcG9zZSB0aGUgcHJldmlvdXMgbmV3IHNlc3Npb24gdGhpc1xuXHRcdC8vIGNvbXBvc2VyIGp1c3QgcmVwbGFjZWQsIHVzaW5nIGl0cyBvd24gcHJvdmlkZXIsIGFmdGVyIGEgc3VjY2Vzc2Z1bFxuXHRcdC8vIGNyZWF0ZSBzbyBhIHRocm93IGFib3ZlIGxlYXZlcyB0aGUgcHJldmlvdXMgb25lIGludGFjdC5cblx0XHRpZiAocHJldmlvdXNOZXdTZXNzaW9uICYmIHByZXZpb3VzTmV3U2Vzc2lvbi5zZXNzaW9uSWQgIT09IHNlc3Npb24uc2Vzc2lvbklkKSB7XG5cdFx0XHR0aGlzLl9nZXRQcm92aWRlcihwcmV2aW91c05ld1Nlc3Npb24pPy5kZWxldGVOZXdTZXNzaW9uKHByZXZpb3VzTmV3U2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0fVxuXG5cdGNyZWF0ZUF1dG9tYXRpb25RdWlja0NoYXQob3B0aW9ucz86IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucyk6IElTZXNzaW9uIHtcblx0XHRjb25zdCB7IHByb3ZpZGVyLCBzZXNzaW9uVHlwZUlkIH0gPSB0aGlzLl9yZXNvbHZlUHJvdmlkZXJGb3JRdWlja0NoYXQob3B0aW9ucyk7XG5cdFx0Y29uc3QgcHJldmlvdXNBdXRvbWF0aW9uU2Vzc2lvbiA9IHRoaXMuX2F1dG9tYXRpb25TZXNzaW9uLmdldCgpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVRdWlja0NoYXQoc2Vzc2lvblR5cGVJZCk7XG5cdFx0aWYgKHByZXZpb3VzQXV0b21hdGlvblNlc3Npb24gJiYgcHJldmlvdXNBdXRvbWF0aW9uU2Vzc2lvbi5zZXNzaW9uSWQgIT09IHNlc3Npb24uc2Vzc2lvbklkKSB7XG5cdFx0XHR0aGlzLl9nZXRQcm92aWRlcihwcmV2aW91c0F1dG9tYXRpb25TZXNzaW9uKT8uZGVsZXRlTmV3U2Vzc2lvbihwcmV2aW91c0F1dG9tYXRpb25TZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0fVxuXHRcdHRoaXMuX2F1dG9tYXRpb25TZXNzaW9uLnNldChzZXNzaW9uLCB1bmRlZmluZWQpO1xuXHRcdHJldHVybiBzZXNzaW9uO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlTmV3Q2hhdEluU2Vzc2lvbihzZXNzaW9uOiBJU2Vzc2lvbiwgb3B0aW9ucz86IElDcmVhdGVOZXdDaGF0SW5TZXNzaW9uT3B0aW9ucyk6IFByb21pc2U8SUNoYXQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2dldFByb3ZpZGVyKHNlc3Npb24pO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBbU2Vzc2lvbnNNYW5hZ2VtZW50XSBjcmVhdGVOZXdDaGF0SW5TZXNzaW9uOiBwcm92aWRlciAnJHtzZXNzaW9uLnByb3ZpZGVySWR9JyBub3QgZm91bmRgKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdC8vIGBmb3JjZU5ld2Agc2tpcHMgcmV1c2Ugc28gY2FsbGVycyBjYW4gcmVzZXQgdGhlIGNvbXBvc2VyIHJpZ2h0IGFmdGVyXG5cdFx0Ly8gc2VuZGluZyBhIGNoYXQgKHdoaWNoIG1heSBzdGlsbCB0cmFuc2llbnRseSByZXBvcnQgYFVudGl0bGVkYCkuXG5cdFx0aWYgKCFvcHRpb25zPy5mb3JjZU5ldykge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdVbnRpdGxlZCA9IHNlc3Npb24uY2hhdHMuZ2V0KCkuZmluZChjID0+IGMuc3RhdHVzLmdldCgpID09PSBTZXNzaW9uU3RhdHVzLlVudGl0bGVkKTtcblx0XHRcdGlmIChleGlzdGluZ1VudGl0bGVkKSB7XG5cdFx0XHRcdHJldHVybiBleGlzdGluZ1VudGl0bGVkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBjcmVhdGVkID0gYXdhaXQgcHJvdmlkZXIuY3JlYXRlTmV3Q2hhdChzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0cmV0dXJuIGNyZWF0ZWQ7XG5cdH1cblxuXHRhc3luYyBmb3JrQ2hhdEluU2Vzc2lvbihzZXNzaW9uOiBJU2Vzc2lvbiwgc291cmNlQ2hhdDogVVJJLCB0dXJuSWQ6IHN0cmluZyk6IFByb21pc2U8SUNoYXQ+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2dldFByb3ZpZGVyKHNlc3Npb24pO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgUHJvdmlkZXIgJyR7c2Vzc2lvbi5wcm92aWRlcklkfScgbm90IGZvdW5kIGZvciBzZXNzaW9uICcke3Nlc3Npb24uc2Vzc2lvbklkfSdgKTtcblx0XHR9XG5cdFx0aWYgKCFzZXNzaW9uLmNhcGFiaWxpdGllcy5nZXQoKS5zdXBwb3J0c011bHRpcGxlQ2hhdHMpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiAnJHtzZXNzaW9uLnNlc3Npb25JZH0nIGRvZXMgbm90IHN1cHBvcnQgZm9ya2luZyBpbnRvIGEgY2hhdGApO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJvdmlkZXIuZm9ya0NoYXQoc2Vzc2lvbi5zZXNzaW9uSWQsIHNvdXJjZUNoYXQsIHR1cm5JZCk7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVTaWRlQ2hhdEluU2Vzc2lvbihzZXNzaW9uOiBJU2Vzc2lvbiwgc291cmNlQ2hhdDogVVJJLCB0dXJuSWQ6IHN0cmluZywgc2VsZWN0aW9uPzogSVNpZGVDaGF0U2VsZWN0aW9uKTogUHJvbWlzZTxJQ2hhdD4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fZ2V0UHJvdmlkZXIoc2Vzc2lvbik7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBQcm92aWRlciAnJHtzZXNzaW9uLnByb3ZpZGVySWR9JyBub3QgZm91bmQgZm9yIHNlc3Npb24gJyR7c2Vzc2lvbi5zZXNzaW9uSWR9J2ApO1xuXHRcdH1cblx0XHRpZiAoIXNlc3Npb24uY2FwYWJpbGl0aWVzLmdldCgpLnN1cHBvcnRzU2lkZUNoYXQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiAnJHtzZXNzaW9uLnNlc3Npb25JZH0nIGRvZXMgbm90IHN1cHBvcnQgc2lkZSBjaGF0c2ApO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJvdmlkZXIuY3JlYXRlU2lkZUNoYXQoc2Vzc2lvbi5zZXNzaW9uSWQsIHNvdXJjZUNoYXQsIHR1cm5JZCwgc2VsZWN0aW9uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGb3IgYSBgL3Ryb3VibGVzaG9vdGAgcmVxdWVzdCwgc3RyaXAgYW55IGAjc2Vzc2lvbmAgbWFya2VyIGF0dGFjaG1lbnRzIGFuZFxuXHQgKiBhcHBlbmQgYSBgU2Vzc2lvbiBsb2c6YCBsaW5lIHdpdGggdGhlIHJlc29sdmVkIGhvc3QtbG9jYWwgYGV2ZW50cy5qc29ubGBcblx0ICogcGF0aChzKSBcdTIwMTQgdGhlIHJlZmVyZW5jZWQgc2Vzc2lvbnMgaWYgcHJlc2VudCwgb3RoZXJ3aXNlIHRoZSBjdXJyZW50IG9uZS5cblx0ICogUmV0dXJucyBgb3B0aW9uc2AgdW5jaGFuZ2VkIHdoZW4gdGhlcmUgaXMgbm90aGluZyB0byBkby5cblx0ICovXG5cdHByaXZhdGUgX2F1Z21lbnRPcHRpb25zRm9yVHJvdWJsZXNob290KHNlc3Npb246IElTZXNzaW9uLCBvcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zKTogSVNlbmRSZXF1ZXN0T3B0aW9ucyB7XG5cdFx0Ly8gU2VwYXJhdGUgYW55IGAjc2Vzc2lvbmAgcmVmZXJlbmNlIGF0dGFjaG1lbnRzIGZyb20gdGhlIHJlYWwgY29udGV4dC5cblx0XHRjb25zdCByZWZlcmVuY2VkUmVzb3VyY2VzOiBVUklbXSA9IFtdO1xuXHRcdGxldCByZW1haW5pbmdBdHRhY2htZW50czogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChvcHRpb25zLmF0dGFjaGVkQ29udGV4dD8ubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCByZW1haW5pbmc6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBvcHRpb25zLmF0dGFjaGVkQ29udGV4dCkge1xuXHRcdFx0XHRjb25zdCByZWZlcmVuY2VkID0gZ2V0U2Vzc2lvblJlZmVyZW5jZVJlc291cmNlKGVudHJ5KTtcblx0XHRcdFx0aWYgKHJlZmVyZW5jZWQpIHtcblx0XHRcdFx0XHRyZWZlcmVuY2VkUmVzb3VyY2VzLnB1c2gocmVmZXJlbmNlZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVtYWluaW5nLnB1c2goZW50cnkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVmZXJlbmNlZFJlc291cmNlcy5sZW5ndGgpIHtcblx0XHRcdFx0cmVtYWluaW5nQXR0YWNobWVudHMgPSByZW1haW5pbmc7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNUcm91Ymxlc2hvb3QgPSAvXlxccypcXC90cm91Ymxlc2hvb3RcXGIvLnRlc3Qob3B0aW9ucy5xdWVyeSk7XG5cdFx0aWYgKCFpc1Ryb3VibGVzaG9vdCAmJiByZWZlcmVuY2VkUmVzb3VyY2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIG9wdGlvbnM7XG5cdFx0fVxuXG5cdFx0Ly8gRHJvcCB0aGUgcmVmZXJlbmNlIGF0dGFjaG1lbnRzIChvbmx5IG1lYW5pbmdmdWwgdG8gdXMsIG5vdCB0aGUgbW9kZWwpLlxuXHRcdGxldCByZXN1bHQgPSBvcHRpb25zO1xuXHRcdGlmIChyZW1haW5pbmdBdHRhY2htZW50cykge1xuXHRcdFx0cmVzdWx0ID0geyAuLi5yZXN1bHQsIGF0dGFjaGVkQ29udGV4dDogcmVtYWluaW5nQXR0YWNobWVudHMubGVuZ3RoID8gcmVtYWluaW5nQXR0YWNobWVudHMgOiB1bmRlZmluZWQgfTtcblx0XHR9XG5cdFx0aWYgKCFpc1Ryb3VibGVzaG9vdCkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHQvLyBSZXNvbHZlIHRoZSB0YXJnZXQgc2Vzc2lvbihzKTogcmVmZXJlbmNlZCBvbmVzIGlmIHByZXNlbnQsIGVsc2UgdGhlXG5cdFx0Ly8gY3VycmVudCBzZXNzaW9uLlxuXHRcdGNvbnN0IHRhcmdldHMgPSByZWZlcmVuY2VkUmVzb3VyY2VzLmxlbmd0aFxuXHRcdFx0PyByZWZlcmVuY2VkUmVzb3VyY2VzXG5cdFx0XHQ6IChnZXRDb3BpbG90Q2xpU2Vzc2lvblJhd0lkKHNlc3Npb24ucmVzb3VyY2UpID8gW3Nlc3Npb24ucmVzb3VyY2VdIDogW10pO1xuXHRcdGNvbnN0IHVzZXJIb21lID0gdGhpcy5wYXRoU2VydmljZS51c2VySG9tZSh7IHByZWZlckxvY2FsOiB0cnVlIH0pO1xuXHRcdGNvbnN0IGdldENvbm5lY3Rpb24gPSAoYXV0aG9yaXR5OiBzdHJpbmcpID0+IHRoaXMucmVtb3RlQWdlbnRIb3N0U2VydmljZS5jb25uZWN0aW9ucy5maW5kKGMgPT4gYWdlbnRIb3N0QXV0aG9yaXR5KGMuYWRkcmVzcykgPT09IGF1dGhvcml0eSk7XG5cdFx0Y29uc3QgZXZlbnRQYXRocyA9IEFycmF5LmZyb20obmV3IFNldChcblx0XHRcdHRhcmdldHNcblx0XHRcdFx0Lm1hcChyZXNvdXJjZSA9PiBidWlsZEhvc3RMb2NhbEV2ZW50c1BhdGgocmVzb3VyY2UsIHVzZXJIb21lLCBnZXRDb25uZWN0aW9uKSlcblx0XHRcdFx0LmZpbHRlcigocGF0aCk6IHBhdGggaXMgc3RyaW5nID0+ICEhcGF0aClcblx0XHQpKTtcblx0XHRpZiAoZXZlbnRQYXRocy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHRcdHJldHVybiB7IC4uLnJlc3VsdCwgcXVlcnk6IGAke3Jlc3VsdC5xdWVyeX1cXG5cXG5TZXNzaW9uIGxvZzogJHtldmVudFBhdGhzLmpvaW4oJywgJyl9YCB9O1xuXHR9XG5cblx0YXN5bmMgc2VuZE5ld0NoYXRSZXF1ZXN0KHNlc3Npb246IElTZXNzaW9uLCBvcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gVGhlIHNlc3Npb24gaXMgZ3JhZHVhdGluZyBpbnRvIHRoZSBsaXN0IChiZWluZyBzZW50KSxcblx0XHQvLyBzbyB0aGUgcHJvdmlkZXIga2VlcHMgb3duaW5nIGl0IFx1MjAxNCBqdXN0IGRyb3AgdGhlIHBvaW50ZXIsIGRvIG5vdCBkZWxldGUuXG5cdFx0Ly8gQ2xlYXJpbmcgdGhlIG5ldyBzZXNzaW9uIHJlY29tcHV0ZXMgdGhlIGlzTmV3Q2hhdFNlc3Npb24gY29udGV4dCBrZXlcblx0XHQvLyB2aWEgdGhlIHZpZXcgc2VydmljZSdzIGFjdGl2ZS1zZXNzaW9uIGF1dG9ydW4uXG5cdFx0dGhpcy5fbmV3U2Vzc2lvbi5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9nZXRQcm92aWRlcihzZXNzaW9uKTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb25zIHByb3ZpZGVyICcke3Nlc3Npb24ucHJvdmlkZXJJZH0nIG5vdCBmb3VuZGApO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLmJhY2tncm91bmQpIHtcblx0XHRcdC8vIEZpcmUtYW5kLWZvcmdldCBzbyB0aGUgY29tcG9zZXIgY2FuIHJlc2V0IGltbWVkaWF0ZWx5LiBPbiBjb21taXRcblx0XHRcdC8vIGZhaWx1cmUgdGhlIGdyYWR1YXRpbmcgZHJhZnQgaXMgc3RyYW5kZWQsIHNvIGRpc3Bvc2UgaXQgdGhyb3VnaFxuXHRcdFx0Ly8gaXRzIHByb3ZpZGVyIChuby1vcCBpZiBhbHJlYWR5IGdyYWR1YXRlZC9yZW1vdmVkKS5cblx0XHRcdHRoaXMuX3NlbmROZXdDaGF0UmVxdWVzdEluQmFja2dyb3VuZChwcm92aWRlciwgc2Vzc2lvbiwgb3B0aW9ucykuY2F0Y2goZSA9PiB7XG5cdFx0XHRcdHByb3ZpZGVyLmRlbGV0ZU5ld1Nlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tTZXNzaW9uc01hbmFnZW1lbnRdIEZhaWxlZCB0byBzZW5kIGJhY2tncm91bmQgcmVxdWVzdDonLCBlKTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEZvcmVncm91bmQgc2VuZDogbm90aWZ5IGxpc3RlbmVycyB0aGF0IGEgc2VuZCBpcyBzdGFydGluZy4gTGlzdGVuZXJzXG5cdFx0Ly8gKGUuZy4sIHRlbGVtZXRyeSkgY2FuIHVzZSB0aGlzIHRvIHByZXdhcm0gY2FjaGVzIHdob3NlIHJlc3VsdCBpc1xuXHRcdC8vIGNvbnN1bWVkIHdoZW4gYG9uRGlkU2VuZFJlcXVlc3RgIGZpcmVzIGJlbG93LiBUaGUgYmFja2dyb3VuZCBwYXRoXG5cdFx0Ly8gZmlyZXMgdGhpcyBmcm9tIHdpdGhpbiBgX3NlbmROZXdDaGF0UmVxdWVzdEluQmFja2dyb3VuZGAuIFRoZSB2aWV3XG5cdFx0Ly8gc2VydmljZSBvYnNlcnZlcyB0aGUgd2lsbC9kaWQgc2VuZCBwYWlyIHRvIGtlZXAgdGhlIG5ld2VzdCBjaGF0XG5cdFx0Ly8gYWN0aXZlIGluIHRoZSB2aXNpYmxlIHNsb3Qgd2hpbGUgdGhlIHNlbmQgbWF0ZXJpYWxpc2VzLlxuXHRcdHRoaXMuX29uV2lsbFNlbmRSZXF1ZXN0LmZpcmUoc2Vzc2lvbik7XG5cblx0XHQvLyBBc2sgdGhlIHByb3ZpZGVyIHRvIGNyZWF0ZSB0aGUgbmV3IGNoYXQsIHRoZW4gc2VuZCB0aGUgcmVxdWVzdC5cblx0XHRjb25zdCBjaGF0ID0gYXdhaXQgcHJvdmlkZXIuY3JlYXRlTmV3Q2hhdChzZXNzaW9uLnNlc3Npb25JZCwgb3B0aW9ucy5xdWVyeSk7XG5cblx0XHRjb25zdCBzZW5kT3B0aW9ucyA9IHRoaXMuX2F1Z21lbnRPcHRpb25zRm9yVHJvdWJsZXNob290KHNlc3Npb24sIG9wdGlvbnMpO1xuXHRcdGNvbnN0IGNoYXRSZXNvdXJjZUtleSA9IGNoYXQucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHR0aGlzLl9wZW5kaW5nU2VuZENoYXRSZXNvdXJjZXMuYWRkKGNoYXRSZXNvdXJjZUtleSk7XG5cdFx0bGV0IHVwZGF0ZWRTZXNzaW9uOiBJU2Vzc2lvbjtcblx0XHR0cnkge1xuXHRcdFx0dXBkYXRlZFNlc3Npb24gPSBhd2FpdCBwcm92aWRlci5zZW5kUmVxdWVzdChzZXNzaW9uLnNlc3Npb25JZCwgY2hhdC5yZXNvdXJjZSwgc2VuZE9wdGlvbnMpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nU2VuZENoYXRSZXNvdXJjZXMuZGVsZXRlKGNoYXRSZXNvdXJjZUtleSk7XG5cdFx0fVxuXHRcdGlmICh1cGRhdGVkU2Vzc2lvbi5zZXNzaW9uSWQgIT09IHNlc3Npb24uc2Vzc2lvbklkKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgW1Nlc3Npb25zTWFuYWdlbWVudF0gc2VuZFJlcXVlc3Q6IGFjdGl2ZSBzZXNzaW9uIHJlcGxhY2VkOiAke3Nlc3Npb24uc2Vzc2lvbklkfSAtPiAke3VwZGF0ZWRTZXNzaW9uLnNlc3Npb25JZH1gKTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRTdGFydFNlc3Npb24uZmlyZSh1cGRhdGVkU2Vzc2lvbik7XG5cdFx0dGhpcy5fb25EaWRTZW5kUmVxdWVzdC5maXJlKHsgc2Vzc2lvbjogdXBkYXRlZFNlc3Npb24sIGNoYXQsIGlzTmV3U2Vzc2lvbjogdHJ1ZSwgaXNOZXdDaGF0OiB0cnVlLCBvcHRpb25zIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBhIG5ldyBzZXNzaW9uIGZvciB0aGUgZ2l2ZW4gZm9sZGVyIGFuZCBzZW5kIGEgY2hhdCByZXF1ZXN0IHRvIGl0LFxuXHQgKiB3aXRob3V0IG5hdmlnYXRpbmcgaW50byB0aGUgc3RhcnRlZCBzZXNzaW9uLiBUaGUgc3RhcnRlZCBzZXNzaW9uIGFwcGVhcnNcblx0ICogaW4gdGhlIHNlc3Npb25zIGxpc3Qgb25jZSB0aGUgcHJvdmlkZXIgY29tbWl0cyBpdCwgd2hpbGUgdGhlIHVzZXInc1xuXHQgKiBjdXJyZW50IHZpZXcgaXMgbGVmdCB1bnRvdWNoZWQuIFJldHVybnMgdGhlIGNvbW1pdHRlZCBzZXNzaW9uLFxuXHQgKiBvciBgdW5kZWZpbmVkYCBpZiB0aGUgc2VydmljZSB3YXMgZGlzcG9zZWQgZHVyaW5nIHRoZSBzZW5kLlxuXHQgKlxuXHQgKiBVbmxpa2Uge0BsaW5rIHNlbmROZXdDaGF0UmVxdWVzdH0gd2l0aCBgYmFja2dyb3VuZGAsIHRoaXMgZG9lcyBub3QgZ29cblx0ICogdGhyb3VnaCB0aGUgbmV3LXNlc3Npb24gY29tcG9zZXI6IGl0IGNyZWF0ZXMgYSBmcmVzaCBzZXNzaW9uIHB1cmVseSBmb3Jcblx0ICogdGhpcyByZXF1ZXN0IGFuZCBuZXZlciBzZXRzIGl0IGFzIHBlbmRpbmcvYWN0aXZlLiBJbnRlbmRlZCBmb3IgY2FsbGVyc1xuXHQgKiBvdXRzaWRlIHRoZSBjb21wb3NlciB0aGF0IHdhbnQgdG8ga2ljayBvZmYgYSBzZXNzaW9uIHByb2dyYW1tYXRpY2FsbHkuXG5cdCAqXG5cdCAqIElmIHRoZSBzZW5kIG9yIGFueSBjb25maWd1cmF0aW9uIHNldHRlciBmYWlscywgdGhlIHN0cmFuZGVkIGRyYWZ0IGlzXG5cdCAqIGRpc3Bvc2VkIHRocm91Z2ggaXRzIHByb3ZpZGVyIGFuZCB0aGUgZXJyb3IgaXMgcmV0aHJvd24uXG5cdCAqL1xuXHRhc3luYyBjcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QoZm9sZGVyVXJpOiBVUkksIG9wdGlvbnM6IE5ld1Nlc3Npb25SZXF1ZXN0T3B0aW9ucywgY3JlYXRlT3B0aW9ucz86IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IFByb21pc2U8SVNlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB7IHByb3ZpZGVyLCBzZXNzaW9uVHlwZUlkLCB3b3Jrc3BhY2UgfSA9IHRoaXMuX3Jlc29sdmVQcm92aWRlckZvck5ld1Nlc3Npb24oZm9sZGVyVXJpLCBjcmVhdGVPcHRpb25zKTtcblx0XHRpZiAod29ya3NwYWNlLnJlcXVpcmVzV29ya3NwYWNlVHJ1c3QpIHtcblx0XHRcdGNvbnN0IHRydXN0SW5mbyA9IGF3YWl0IHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5nZXRVcmlUcnVzdEluZm8oZm9sZGVyVXJpKTtcblx0XHRcdGlmICghdHJ1c3RJbmZvLnRydXN0ZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IFdvcmtzcGFjZU5vdFRydXN0ZWRFcnJvcigpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihmb2xkZXJVcmksIHNlc3Npb25UeXBlSWQsIHsgbWV0YWRhdGE6IGNyZWF0ZU9wdGlvbnM/Lm1ldGFkYXRhIH0pO1xuXHRcdHRoaXMuX3VubGlzdGVkTmV3U2Vzc2lvbnMuc2V0KHNlc3Npb24ucmVzb3VyY2UsIHNlc3Npb24pO1xuXHRcdGNvbnN0IHJlcXVlc3RBY3Rpdml0eSA9IG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXF1ZXN0QWN0aXZpdHkudmFsdWUgPSBpc0RlZmVycmVkTmV3U2Vzc2lvblJlcXVlc3RPcHRpb25zKG9wdGlvbnMpXG5cdFx0XHRcdFx0PyBwcm92aWRlci5zdGFydE5ld1Nlc3Npb25SZXF1ZXN0Py4oc2Vzc2lvbi5zZXNzaW9uSWQsIG9wdGlvbnMuYWN0aXZpdHkpXG5cdFx0XHRcdFx0OiBwcm92aWRlci5zdGFydE5ld1Nlc3Npb25SZXF1ZXN0Py4oc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0XHRjcmVhdGVPcHRpb25zPy5vblNlc3Npb25DcmVhdGVkPy4oc2Vzc2lvbik7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRwcm92aWRlci5kZWxldGVOZXdTZXNzaW9uKHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25UeXBlcyhmb2xkZXJVcmkpXG5cdFx0XHRcdC5maW5kKHNlc3Npb25UeXBlID0+IHNlc3Npb25UeXBlLmlkID09PSBzZXNzaW9uVHlwZUlkKT8uc3VwcG9ydHNXb3JrdHJlZUNvbmZpZ3VyYXRpb24gPT09IHRydWU7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fY29uZmlndXJlQW5kU2VuZE5ld1Nlc3Npb24ocHJvdmlkZXIsIHNlc3Npb24sIG9wdGlvbnMsIGNyZWF0ZU9wdGlvbnMsIHN1cHBvcnRzV29ya3RyZWVDb25maWd1cmF0aW9uLCB0b2tlbiwgZm9sZGVyVXJpLCByZXF1ZXN0QWN0aXZpdHkpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZXF1ZXN0QWN0aXZpdHkuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fdW5saXN0ZWROZXdTZXNzaW9ucy5kZWxldGUoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgY3JlYXRlQW5kU2VuZFF1aWNrQ2hhdFJlcXVlc3Qob3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucywgY3JlYXRlT3B0aW9ucz86IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuID0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk6IFByb21pc2U8SVNlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB7IHByb3ZpZGVyLCBzZXNzaW9uVHlwZUlkIH0gPSB0aGlzLl9yZXNvbHZlUHJvdmlkZXJGb3JRdWlja0NoYXQoY3JlYXRlT3B0aW9ucyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZVF1aWNrQ2hhdChzZXNzaW9uVHlwZUlkKTtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJlQW5kU2VuZE5ld1Nlc3Npb24ocHJvdmlkZXIsIHNlc3Npb24sIG9wdGlvbnMsIGNyZWF0ZU9wdGlvbnMsIGZhbHNlLCB0b2tlbik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jb25maWd1cmVBbmRTZW5kTmV3U2Vzc2lvbihcblx0XHRwcm92aWRlcjogSVNlc3Npb25zUHJvdmlkZXIsXG5cdFx0c2Vzc2lvbjogSVNlc3Npb24sXG5cdFx0b3B0aW9uczogTmV3U2Vzc2lvblJlcXVlc3RPcHRpb25zLFxuXHRcdGNyZWF0ZU9wdGlvbnM6IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucyB8IHVuZGVmaW5lZCxcblx0XHRzdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbjogYm9vbGVhbixcblx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sXG5cdFx0Zm9sZGVyVXJpPzogVVJJLFxuXHRcdHJlcXVlc3RBY3Rpdml0eT86IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPixcblx0KTogUHJvbWlzZTxJU2Vzc2lvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXF1ZXN0T3B0aW9uc1Byb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJldHVybiBpc0RlZmVycmVkTmV3U2Vzc2lvblJlcXVlc3RPcHRpb25zKG9wdGlvbnMpID8gYXdhaXQgb3B0aW9ucy5yZXNvbHZlKCkgOiBvcHRpb25zO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHJlcXVlc3RBY3Rpdml0eT8uY2xlYXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkoKTtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25Qcm9taXNlID0gdGhpcy5fY29uZmlndXJlTmV3U2Vzc2lvbihwcm92aWRlciwgc2Vzc2lvbiwgY3JlYXRlT3B0aW9ucywgc3VwcG9ydHNXb3JrdHJlZUNvbmZpZ3VyYXRpb24sIHRva2VuLCBmb2xkZXJVcmkpO1xuXHRcdFx0Y29uc3QgW3Jlc29sdmVkT3B0aW9uc10gPSBhd2FpdCByYWNlQ2FuY2VsbGF0aW9uRXJyb3IoUHJvbWlzZS5hbGwoW3JlcXVlc3RPcHRpb25zUHJvbWlzZSwgY29uZmlndXJhdGlvblByb21pc2VdKSwgdG9rZW4pO1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGF3YWl0IHJhY2VDYW5jZWxsYXRpb25FcnJvcih0aGlzLl9zZW5kTmV3Q2hhdFJlcXVlc3RJbkJhY2tncm91bmQocHJvdmlkZXIsIHNlc3Npb24sIHJlc29sdmVkT3B0aW9ucywgdG9rZW4pLCB0b2tlbik7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Ly8gVGhlIHNlbmQgbmV2ZXIgY29tbWl0dGVkLCBzbyB0aGUgZHJhZnQgaXMgc3RyYW5kZWQuIERpc3Bvc2UgaXRcblx0XHRcdC8vIHRocm91Z2ggaXRzIHByb3ZpZGVyIHRvIHJlbGVhc2UgdGhlIGVhZ2VyIGJhY2tlbmQgc2Vzc2lvbiBiZWZvcmVcblx0XHRcdC8vIHJldGhyb3dpbmcuIFNhZmUgbm8tb3AgaWYgdGhlIHByb3ZpZGVyIGFscmVhZHkgcmVtb3ZlZCBpdC5cblx0XHRcdHByb3ZpZGVyLmRlbGV0ZU5ld1Nlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdFx0dGhyb3cgZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jb25maWd1cmVOZXdTZXNzaW9uKFxuXHRcdHByb3ZpZGVyOiBJU2Vzc2lvbnNQcm92aWRlcixcblx0XHRzZXNzaW9uOiBJU2Vzc2lvbixcblx0XHRjcmVhdGVPcHRpb25zOiBJQ3JlYXRlTmV3U2Vzc2lvbk9wdGlvbnMgfCB1bmRlZmluZWQsXG5cdFx0c3VwcG9ydHNXb3JrdHJlZUNvbmZpZ3VyYXRpb246IGJvb2xlYW4sXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuXHRcdGZvbGRlclVyaTogVVJJIHwgdW5kZWZpbmVkLFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoY3JlYXRlT3B0aW9ucz8ubW9kZWxJZCkge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRNb2RlbElkID0gYXdhaXQgdGhpcy5fd2FpdEZvclJlcXVlc3RlZE1vZGVsKHByb3ZpZGVyLCBzZXNzaW9uLCBjcmVhdGVPcHRpb25zLm1vZGVsSWQsIHRva2VuLCBmb2xkZXJVcmkpO1xuXHRcdFx0cHJvdmlkZXIuc2V0TW9kZWwoc2Vzc2lvbi5zZXNzaW9uSWQsIHJlc29sdmVkTW9kZWxJZCk7XG5cdFx0fVxuXHRcdGlmIChjcmVhdGVPcHRpb25zPy5tb2RlSWQpIHtcblx0XHRcdHByb3ZpZGVyLnNldE1vZGU/LihzZXNzaW9uLnNlc3Npb25JZCwgY3JlYXRlT3B0aW9ucy5tb2RlSWQpO1xuXHRcdH1cblx0XHRpZiAoY3JlYXRlT3B0aW9ucz8ucGVybWlzc2lvbkxldmVsKSB7XG5cdFx0XHRwcm92aWRlci5zZXRQZXJtaXNzaW9uTGV2ZWw/LihzZXNzaW9uLnNlc3Npb25JZCwgY3JlYXRlT3B0aW9ucy5wZXJtaXNzaW9uTGV2ZWwpO1xuXHRcdH1cblx0XHRpZiAoc3VwcG9ydHNXb3JrdHJlZUNvbmZpZ3VyYXRpb24gJiYgKGNyZWF0ZU9wdGlvbnM/Lmlzb2xhdGlvbk1vZGUgfHwgY3JlYXRlT3B0aW9ucz8ud29ya3RyZWVCcmFuY2hUcmFjayAhPT0gdW5kZWZpbmVkIHx8IGNyZWF0ZU9wdGlvbnM/LmJyYW5jaCkpIHtcblx0XHRcdGlmIChwcm92aWRlci5zZXRXb3JrdHJlZUNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdFx0YXdhaXQgcmFjZUNhbmNlbGxhdGlvbkVycm9yKHByb3ZpZGVyLnNldFdvcmt0cmVlQ29uZmlndXJhdGlvbihzZXNzaW9uLnNlc3Npb25JZCwge1xuXHRcdFx0XHRcdGlzb2xhdGlvbk1vZGU6IGNyZWF0ZU9wdGlvbnMuaXNvbGF0aW9uTW9kZSxcblx0XHRcdFx0XHR3b3JrdHJlZUJyYW5jaFRyYWNrOiBjcmVhdGVPcHRpb25zLndvcmt0cmVlQnJhbmNoVHJhY2ssXG5cdFx0XHRcdFx0YnJhbmNoOiBjcmVhdGVPcHRpb25zLmJyYW5jaCxcblx0XHRcdFx0fSksIHRva2VuKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChjcmVhdGVPcHRpb25zLmlzb2xhdGlvbk1vZGUgJiYgcHJvdmlkZXIuc2V0SXNvbGF0aW9uTW9kZSkge1xuXHRcdFx0XHRcdGF3YWl0IHJhY2VDYW5jZWxsYXRpb25FcnJvcihwcm92aWRlci5zZXRJc29sYXRpb25Nb2RlKHNlc3Npb24uc2Vzc2lvbklkLCBjcmVhdGVPcHRpb25zLmlzb2xhdGlvbk1vZGUpLCB0b2tlbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGNyZWF0ZU9wdGlvbnMud29ya3RyZWVCcmFuY2hUcmFjayAhPT0gdW5kZWZpbmVkICYmIHByb3ZpZGVyLnNldFdvcmt0cmVlQnJhbmNoVHJhY2spIHtcblx0XHRcdFx0XHRhd2FpdCByYWNlQ2FuY2VsbGF0aW9uRXJyb3IocHJvdmlkZXIuc2V0V29ya3RyZWVCcmFuY2hUcmFjayhzZXNzaW9uLnNlc3Npb25JZCwgY3JlYXRlT3B0aW9ucy53b3JrdHJlZUJyYW5jaFRyYWNrKSwgdG9rZW4pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjcmVhdGVPcHRpb25zLmJyYW5jaCAmJiBwcm92aWRlci5zZXRCcmFuY2gpIHtcblx0XHRcdFx0XHRhd2FpdCByYWNlQ2FuY2VsbGF0aW9uRXJyb3IocHJvdmlkZXIuc2V0QnJhbmNoKHNlc3Npb24uc2Vzc2lvbklkLCBjcmVhdGVPcHRpb25zLmJyYW5jaCksIHRva2VuKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3dhaXRGb3JSZXF1ZXN0ZWRNb2RlbChwcm92aWRlcjogSVNlc3Npb25zUHJvdmlkZXIsIHNlc3Npb246IElTZXNzaW9uLCBtb2RlbElkOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgZm9sZGVyVXJpPzogVVJJKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCByZXNvbHZlQ3VycmVudCA9ICgpID0+IHByb3ZpZGVyLmdldE1vZGVsc1NuYXBzaG90KHNlc3Npb24uc2Vzc2lvbklkLCBtb2RlbElkKS5kZXNpcmVkTW9kZWxSZXNvbHV0aW9uO1xuXHRcdGNvbnN0IGluaXRpYWwgPSByZXNvbHZlQ3VycmVudCgpO1xuXHRcdGlmIChpbml0aWFsLmtpbmQgPT09ICdhdmFpbGFibGUnKSB7XG5cdFx0XHRyZXR1cm4gaW5pdGlhbC5tb2RlbC5pZGVudGlmaWVyO1xuXHRcdH1cblx0XHRpZiAoaW5pdGlhbC5raW5kID09PSAnbm90UmVxdWVzdGVkJykge1xuXHRcdFx0cmV0dXJuIG1vZGVsSWQ7XG5cdFx0fVxuXHRcdGlmIChpbml0aWFsLmtpbmQgPT09ICd1bmF2YWlsYWJsZScpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTW9kZWwgJyR7bW9kZWxJZH0nIGlzIHVuYXZhaWxhYmxlIGZvciBzZXNzaW9ucyBwcm92aWRlciAnJHtwcm92aWRlci5pZH0nYCk7XG5cdFx0fVxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHN0cmluZz4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRsZXQgc2V0dGxlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgZmluaXNoID0gKHJlc3VsdDogc3RyaW5nIHwgRXJyb3IpID0+IHtcblx0XHRcdFx0aWYgKHNldHRsZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0c2V0dGxlZCA9IHRydWU7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0aWYgKHJlc3VsdCBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHRcdFx0cmVqZWN0KHJlc3VsdCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzb2x2ZShyZXN1bHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgY2hlY2sgPSAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc29sdXRpb24gPSByZXNvbHZlQ3VycmVudCgpO1xuXHRcdFx0XHRpZiAocmVzb2x1dGlvbi5raW5kID09PSAnYXZhaWxhYmxlJykge1xuXHRcdFx0XHRcdGZpbmlzaChyZXNvbHV0aW9uLm1vZGVsLmlkZW50aWZpZXIpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHJlc29sdXRpb24ua2luZCA9PT0gJ25vdFJlcXVlc3RlZCcpIHtcblx0XHRcdFx0XHRmaW5pc2gobW9kZWxJZCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocmVzb2x1dGlvbi5raW5kID09PSAndW5hdmFpbGFibGUnKSB7XG5cdFx0XHRcdFx0ZmluaXNoKG5ldyBFcnJvcihgTW9kZWwgJyR7bW9kZWxJZH0nIGlzIHVuYXZhaWxhYmxlIGZvciBzZXNzaW9ucyBwcm92aWRlciAnJHtwcm92aWRlci5pZH0nYCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlTW9kZWxzKGNoZWNrKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9uVHlwZXMoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uVHlwZXMgPSBmb2xkZXJVcmkgPyBwcm92aWRlci5nZXRTZXNzaW9uVHlwZXMoZm9sZGVyVXJpKSA6IHByb3ZpZGVyLnNlc3Npb25UeXBlcztcblx0XHRcdFx0aWYgKCFzZXNzaW9uVHlwZXMuc29tZSh0eXBlID0+IHR5cGUuaWQgPT09IHNlc3Npb24uc2Vzc2lvblR5cGUpKSB7XG5cdFx0XHRcdFx0ZmluaXNoKG5ldyBFcnJvcihgU2Vzc2lvbiB0eXBlICcke3Nlc3Npb24uc2Vzc2lvblR5cGV9JyBpcyBubyBsb25nZXIgYXZhaWxhYmxlIGZvciBzZXNzaW9ucyBwcm92aWRlciAnJHtwcm92aWRlci5pZH0nYCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2Uub25EaWRDaGFuZ2VQcm92aWRlcnMoZXZlbnQgPT4ge1xuXHRcdFx0XHRpZiAoZXZlbnQucmVtb3ZlZC5pbmNsdWRlcyhwcm92aWRlcikpIHtcblx0XHRcdFx0XHRmaW5pc2gobmV3IEVycm9yKGBTZXNzaW9ucyBwcm92aWRlciAnJHtwcm92aWRlci5pZH0nIGlzIG5vIGxvbmdlciBhdmFpbGFibGVgKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiBmaW5pc2gobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5fZGlzcG9zZUN0cy50b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiBmaW5pc2gobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpKSk7XG5cdFx0XHRjaGVjaygpO1xuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NlQ3RzLmNhbmNlbCgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb21taXQgYSBuZXctc2Vzc2lvbiByZXF1ZXN0OiBmaXJlIHtAbGluayBfb25XaWxsU2VuZFJlcXVlc3R9LCBjcmVhdGUgdGhlXG5cdCAqIG5ldyBjaGF0IHZpYSB0aGUgcHJvdmlkZXIsIHNlbmQgdGhlIHJlcXVlc3QsIGFuZFx1MjAxNG9uIHN1Y2Nlc3NcdTIwMTRmaXJlXG5cdCAqIHtAbGluayBfb25EaWRTdGFydFNlc3Npb259IGFuZCB7QGxpbmsgX29uRGlkU2VuZFJlcXVlc3R9LiBUaGUgc3RhcnRlZFxuXHQgKiBzZXNzaW9uIGlzIG5ldmVyIHN3YXBwZWQgaW50byB0aGUgdmlzaWJsZSBjaGF0IHNsb3QsIHNvIGl0IHNpbXBseSBhcHBlYXJzXG5cdCAqIGluIHRoZSBzZXNzaW9ucyBsaXN0IG9uY2UgdGhlIHByb3ZpZGVyIGNvbW1pdHMgaXQuXG5cdCAqXG5cdCAqIE93bnMgdGhlIGZ1bGwgd2lsbC9kaWQgc2VuZCBsaWZlY3ljbGUgc28gY2FsbGVycyBkbyBub3QgZmlyZSB0aGUgcGFpcmVkXG5cdCAqIGV2ZW50cyB0aGVtc2VsdmVzLiBFcnJvcnMgYXJlIHByb3BhZ2F0ZWQgdG8gdGhlIGNhbGxlcjsgdGhpcyBtZXRob2QgZG9lc1xuXHQgKiBub3QgY2xlYW4gdXAgdGhlIHN0cmFuZGVkIGRyYWZ0LCBzbyBjYWxsZXJzIG93biBhbnkgdmlldyBoYW5kbGluZyBhbmQgdGhlXG5cdCAqIGVycm9yIGhhbmRsaW5nIChlLmcuIGRpc3Bvc2luZyB0aGUgc3RyYW5kZWQgZHJhZnQgdmlhXG5cdCAqIHtAbGluayBJU2Vzc2lvbnNQcm92aWRlci5kZWxldGVOZXdTZXNzaW9ufSkuXG5cdCAqXG5cdCAqIFByb3ZpZGVycyBhcmUgbXVsdGktbmV3LXNlc3Npb24gYXdhcmUsIHNvIHRoZSBncmFkdWF0aW5nIHNlc3Npb24gYW5kIGFcblx0ICogY29uY3VycmVudGx5IHJlc2VlZGVkIGNvbXBvc2VyIGRyYWZ0IGNvZXhpc3Qgd2l0aG91dCBjb25mbGljdC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3NlbmROZXdDaGF0UmVxdWVzdEluQmFja2dyb3VuZChwcm92aWRlcjogSVNlc3Npb25zUHJvdmlkZXIsIHNlc3Npb246IElTZXNzaW9uLCBvcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTogUHJvbWlzZTxJU2Vzc2lvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGhyb3cgbmV3IENhbmNlbGxhdGlvbkVycm9yKCk7XG5cdFx0fVxuXHRcdC8vIE5vdGlmeSBsaXN0ZW5lcnMgKGUuZy4sIHRlbGVtZXRyeSkgdGhhdCBhIHNlbmQgaXMgc3RhcnRpbmcgc28gdGhleSBjYW5cblx0XHQvLyBwcmV3YXJtIGNhY2hlcyB3aG9zZSByZXN1bHQgaXMgY29uc3VtZWQgd2hlbiBgb25EaWRTZW5kUmVxdWVzdGAgZmlyZXMuXG5cdFx0dGhpcy5fb25XaWxsU2VuZFJlcXVlc3QuZmlyZShzZXNzaW9uKTtcblx0XHRjb25zdCBjaGF0UHJvbWlzZSA9IHByb3ZpZGVyLmNyZWF0ZU5ld0NoYXQoc2Vzc2lvbi5zZXNzaW9uSWQsIG9wdGlvbnMucXVlcnkpO1xuXHRcdGNvbnN0IGNoYXQgPSB0b2tlbiA9PT0gQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSA/IGF3YWl0IGNoYXRQcm9taXNlIDogYXdhaXQgcmFjZUNhbmNlbGxhdGlvbkVycm9yKGNoYXRQcm9taXNlLCB0b2tlbik7XG5cblx0XHQvLyBTdXBwcmVzcyB0aGUgYGNoYXRTZXJ2aWNlLm9uRGlkU3VibWl0UmVxdWVzdGAgbWlycm9yIGZvciB0aGlzIHNlbmQgc29cblx0XHQvLyBgX29uRGlkU2VuZFJlcXVlc3RgIGlzIG5vdCBmaXJlZCB0d2ljZSBmb3IgcHJvdmlkZXJzIHRoYXQgZGlzcGF0Y2hcblx0XHQvLyB0aHJvdWdoIGBjaGF0U2VydmljZS5zZW5kUmVxdWVzdGAgKHNlZSB0aGUgbWlycm9yIGluIHRoZSBjb25zdHJ1Y3RvcikuXG5cdFx0Y29uc3Qgc2VuZE9wdGlvbnMgPSB0aGlzLl9hdWdtZW50T3B0aW9uc0ZvclRyb3VibGVzaG9vdChzZXNzaW9uLCBvcHRpb25zKTtcblx0XHRjb25zdCBjaGF0UmVzb3VyY2VLZXkgPSBjaGF0LnJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0dGhpcy5fcGVuZGluZ1NlbmRDaGF0UmVzb3VyY2VzLmFkZChjaGF0UmVzb3VyY2VLZXkpO1xuXHRcdGNvbnN0IGNhbmNlbGxhdGlvbkxpc3RlbmVyID0gdG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0dm9pZCB0aGlzLmNoYXRTZXJ2aWNlLmNhbmNlbEN1cnJlbnRSZXF1ZXN0Rm9yU2Vzc2lvbihjaGF0LnJlc291cmNlLCAnc2Vzc2lvbnNNYW5hZ2VtZW50JykuY2F0Y2goZXJyb3IgPT4ge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybignW1Nlc3Npb25zTWFuYWdlbWVudF0gRmFpbGVkIHRvIGNhbmNlbCBoZWFkbGVzcyByZXF1ZXN0OicsIGVycm9yKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdGxldCB1cGRhdGVkU2Vzc2lvbjogSVNlc3Npb247XG5cdFx0dHJ5IHtcblx0XHRcdHVwZGF0ZWRTZXNzaW9uID0gYXdhaXQgcHJvdmlkZXIuc2VuZFJlcXVlc3Qoc2Vzc2lvbi5zZXNzaW9uSWQsIGNoYXQucmVzb3VyY2UsIHNlbmRPcHRpb25zKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2FuY2VsbGF0aW9uTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fcGVuZGluZ1NlbmRDaGF0UmVzb3VyY2VzLmRlbGV0ZShjaGF0UmVzb3VyY2VLZXkpO1xuXHRcdH1cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fb25EaWRTdGFydFNlc3Npb24uZmlyZSh1cGRhdGVkU2Vzc2lvbik7XG5cdFx0dGhpcy5fb25EaWRTZW5kUmVxdWVzdC5maXJlKHsgc2Vzc2lvbjogdXBkYXRlZFNlc3Npb24sIGNoYXQsIGlzTmV3U2Vzc2lvbjogdHJ1ZSwgaXNOZXdDaGF0OiB0cnVlLCBvcHRpb25zIH0pO1xuXHRcdHJldHVybiB1cGRhdGVkU2Vzc2lvbjtcblx0fVxuXG5cdGFzeW5jIHNlbmRSZXF1ZXN0KHNlc3Npb246IElTZXNzaW9uLCBjaGF0OiBJQ2hhdCwgb3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFNlbmRpbmcgaW50byBhbiBleGlzdGluZyBzZXNzaW9uIGFiYW5kb25zIGFueSBpbi1wcm9ncmVzcyBuZXcgc2Vzc2lvbixcblx0XHQvLyBzbyBkaXNwb3NlIGl0IHRvIHJlbGVhc2UgaXRzIGVhZ2VyIGJhY2tlbmQgc2Vzc2lvbi5cblx0XHR0aGlzLmRpc2NhcmROZXdTZXNzaW9uKCk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2dldFByb3ZpZGVyKHNlc3Npb24pO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbnMgcHJvdmlkZXIgJyR7c2Vzc2lvbi5wcm92aWRlcklkfScgbm90IGZvdW5kYCk7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMuYmFja2dyb3VuZCkge1xuXHRcdFx0Ly8gRmlyZS1hbmQtZm9yZ2V0IHNvIHRoZSBjb21wb3NlciBjYW4gcmVzZXQgaW1tZWRpYXRlbHkuIFVubGlrZSB0aGVcblx0XHRcdC8vIGZvcmVncm91bmQgcGF0aCB0aGlzIHNraXBzIGBfb25XaWxsU2VuZFJlcXVlc3RgIHNvIHRoZSB2aWV3J3Ncblx0XHRcdC8vIHNlbmQtZm9sbG93IGRvZXMgbm90IG5hdmlnYXRlIHRoZSB2aXNpYmxlIHNsb3QgaW50byB0aGUgc2VudCBjaGF0LlxuXHRcdFx0dGhpcy5fc2VuZFJlcXVlc3RJbkJhY2tncm91bmQocHJvdmlkZXIsIHNlc3Npb24sIGNoYXQsIG9wdGlvbnMpLmNhdGNoKGUgPT4ge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tTZXNzaW9uc01hbmFnZW1lbnRdIEZhaWxlZCB0byBzZW5kIGJhY2tncm91bmQgcmVxdWVzdDonLCBlKTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE5vdGlmeSBsaXN0ZW5lcnMgdGhhdCBhIHNlbmQgaXMgc3RhcnRpbmcuIExpc3RlbmVycyAoZS5nLiwgdGVsZW1ldHJ5KVxuXHRcdC8vIGNhbiB1c2UgdGhpcyB0byBwcmV3YXJtIGNhY2hlcyB3aG9zZSByZXN1bHQgaXMgY29uc3VtZWQgd2hlblxuXHRcdC8vIGBvbkRpZFNlbmRSZXF1ZXN0YCBmaXJlcyBiZWxvdy4gVGhlIHZpZXcgc2VydmljZSBvYnNlcnZlcyB0aGUgd2lsbC9kaWRcblx0XHQvLyBzZW5kIHBhaXIgdG8ga2VlcCB0aGUgc2VudCBjaGF0IGFjdGl2ZSBpbiB0aGUgdmlzaWJsZSBzbG90LlxuXHRcdHRoaXMuX29uV2lsbFNlbmRSZXF1ZXN0LmZpcmUoc2Vzc2lvbik7XG5cblx0XHRjb25zdCBzZW5kT3B0aW9ucyA9IHRoaXMuX2F1Z21lbnRPcHRpb25zRm9yVHJvdWJsZXNob290KHNlc3Npb24sIG9wdGlvbnMpO1xuXHRcdGNvbnN0IGNoYXRSZXNvdXJjZUtleSA9IGNoYXQucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHR0aGlzLl9wZW5kaW5nU2VuZENoYXRSZXNvdXJjZXMuYWRkKGNoYXRSZXNvdXJjZUtleSk7XG5cdFx0bGV0IHVwZGF0ZWRTZXNzaW9uOiBJU2Vzc2lvbjtcblx0XHR0cnkge1xuXHRcdFx0dXBkYXRlZFNlc3Npb24gPSBhd2FpdCBwcm92aWRlci5zZW5kUmVxdWVzdChzZXNzaW9uLnNlc3Npb25JZCwgY2hhdC5yZXNvdXJjZSwgc2VuZE9wdGlvbnMpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nU2VuZENoYXRSZXNvdXJjZXMuZGVsZXRlKGNoYXRSZXNvdXJjZUtleSk7XG5cdFx0fVxuXHRcdGlmICh1cGRhdGVkU2Vzc2lvbi5zZXNzaW9uSWQgIT09IHNlc3Npb24uc2Vzc2lvbklkKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgW1Nlc3Npb25zTWFuYWdlbWVudF0gc2VuZFJlcXVlc3Q6IGFjdGl2ZSBzZXNzaW9uIHJlcGxhY2VkOiAke3Nlc3Npb24uc2Vzc2lvbklkfSAtPiAke3VwZGF0ZWRTZXNzaW9uLnNlc3Npb25JZH1gKTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZFNlbmRSZXF1ZXN0LmZpcmUoeyBzZXNzaW9uOiB1cGRhdGVkU2Vzc2lvbiwgY2hhdCwgaXNOZXdTZXNzaW9uOiBmYWxzZSwgaXNOZXdDaGF0OiB0cnVlLCBvcHRpb25zIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNlbmQgYSByZXF1ZXN0IGZvciBhbiBleGlzdGluZyBjaGF0IGluIHRoZSBiYWNrZ3JvdW5kOiBjb21taXQgdGhlIHNlbmQgdmlhXG5cdCAqIHRoZSBwcm92aWRlciBhbmRcdTIwMTRvbiBzdWNjZXNzXHUyMDE0ZmlyZSB7QGxpbmsgX29uRGlkU2VuZFJlcXVlc3R9LiBVbmxpa2UgdGhlXG5cdCAqIGZvcmVncm91bmQge0BsaW5rIHNlbmRSZXF1ZXN0fSBwYXRoIHRoaXMgZG9lcyBub3QgZmlyZVxuXHQgKiB7QGxpbmsgX29uV2lsbFNlbmRSZXF1ZXN0fSwgc28gdGhlIHZpZXcncyBzZW5kLWZvbGxvdyBuZXZlciBuYXZpZ2F0ZXMgdGhlXG5cdCAqIHZpc2libGUgc2xvdCBpbnRvIHRoZSBzZW50IGNoYXQuIEVycm9ycyBhcmUgcHJvcGFnYXRlZCB0byB0aGUgY2FsbGVyLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfc2VuZFJlcXVlc3RJbkJhY2tncm91bmQocHJvdmlkZXI6IElTZXNzaW9uc1Byb3ZpZGVyLCBzZXNzaW9uOiBJU2Vzc2lvbiwgY2hhdDogSUNoYXQsIG9wdGlvbnM6IElTZW5kUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZW5kT3B0aW9ucyA9IHRoaXMuX2F1Z21lbnRPcHRpb25zRm9yVHJvdWJsZXNob290KHNlc3Npb24sIG9wdGlvbnMpO1xuXHRcdGNvbnN0IGNoYXRSZXNvdXJjZUtleSA9IGNoYXQucmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHR0aGlzLl9wZW5kaW5nU2VuZENoYXRSZXNvdXJjZXMuYWRkKGNoYXRSZXNvdXJjZUtleSk7XG5cdFx0bGV0IHVwZGF0ZWRTZXNzaW9uOiBJU2Vzc2lvbjtcblx0XHR0cnkge1xuXHRcdFx0dXBkYXRlZFNlc3Npb24gPSBhd2FpdCBwcm92aWRlci5zZW5kUmVxdWVzdChzZXNzaW9uLnNlc3Npb25JZCwgY2hhdC5yZXNvdXJjZSwgc2VuZE9wdGlvbnMpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nU2VuZENoYXRSZXNvdXJjZXMuZGVsZXRlKGNoYXRSZXNvdXJjZUtleSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX29uRGlkU2VuZFJlcXVlc3QuZmlyZSh7IHNlc3Npb246IHVwZGF0ZWRTZXNzaW9uLCBjaGF0LCBpc05ld1Nlc3Npb246IGZhbHNlLCBpc05ld0NoYXQ6IHRydWUsIG9wdGlvbnMgfSk7XG5cdH1cblxuXHQvLyAtLSBTZXNzaW9uIEFjdGlvbnMgLS1cblxuXHRwcml2YXRlIF9nZXRQcm92aWRlcihzZXNzaW9uOiBJU2Vzc2lvbik6IElTZXNzaW9uc1Byb3ZpZGVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXJzKCkuZmluZChwID0+IHAuaWQgPT09IHNlc3Npb24ucHJvdmlkZXJJZCk7XG5cdH1cblxuXHRhc3luYyBjYW5jZWxDdXJyZW50UmVxdWVzdChzZXNzaW9uOiBJU2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gc2Vzc2lvbi5tYWluQ2hhdC5nZXQoKS5yZXNvdXJjZTtcblx0XHQvLyBBIHJlc3RvcmVkLCB1bmxvYWRlZCBzZXNzaW9uIGhhcyBubyBwZW5kaW5nIHJlcXVlc3QgdHJhY2tlZCBpbiB0aGlzIHdpbmRvdywgc28gbG9hZCBpdHMgbW9kZWwgZmlyc3QgdG8gcmUtZXN0YWJsaXNoIGNhbmNlbGxhdGlvbiB0cmFja2luZy5cblx0XHRjb25zdCBtb2RlbFJlZiA9IGF3YWl0IHRoaXMuY2hhdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24ocmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsICdzZXNzaW9uc01hbmFnZW1lbnQ6Y2FuY2VsJyk7XG5cdFx0aWYgKCFtb2RlbFJlZikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCdzZXNzaW9ucy5jYW5jZWxDdXJyZW50UmVxdWVzdC5sb2FkRmFpbGVkJywgXCJGYWlsZWQgdG8gbG9hZCBjaGF0IHNlc3Npb24gZm9yIGNhbmNlbGxhdGlvbi5cIikpO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5jaGF0U2VydmljZS5jYW5jZWxDdXJyZW50UmVxdWVzdEZvclNlc3Npb24ocmVzb3VyY2UsICdzZXNzaW9uc01hbmFnZW1lbnQnKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0bW9kZWxSZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGFyY2hpdmVTZXNzaW9uKHNlc3Npb246IElTZXNzaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fZ2V0UHJvdmlkZXIoc2Vzc2lvbik/LmFyY2hpdmVTZXNzaW9uKHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHR0aGlzLl9vbkRpZEFyY2hpdmVTZXNzaW9uLmZpcmUoc2Vzc2lvbik7XG5cdH1cblxuXHRhc3luYyB1bmFyY2hpdmVTZXNzaW9uKHNlc3Npb246IElTZXNzaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fZ2V0UHJvdmlkZXIoc2Vzc2lvbik/LnVuYXJjaGl2ZVNlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdHRoaXMuX29uRGlkVW5hcmNoaXZlU2Vzc2lvbi5maXJlKHNlc3Npb24pO1xuXHR9XG5cblx0YXN5bmMgc2V0U2Vzc2lvblJlYWRTdGF0ZShzZXNzaW9uOiBJU2Vzc2lvbiwgaXNSZWFkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fZ2V0UHJvdmlkZXIoc2Vzc2lvbik/LnNldFNlc3Npb25SZWFkU3RhdGUoc2Vzc2lvbi5zZXNzaW9uSWQsIGlzUmVhZCk7XG5cdH1cblxuXHRtYXJrUmVhZChzZXNzaW9uOiBJU2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnNldFNlc3Npb25SZWFkU3RhdGUoc2Vzc2lvbiwgdHJ1ZSk7XG5cdH1cblxuXHRtYXJrVW5yZWFkKHNlc3Npb246IElTZXNzaW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuc2V0U2Vzc2lvblJlYWRTdGF0ZShzZXNzaW9uLCBmYWxzZSk7XG5cdH1cblxuXHRhc3luYyBtYXJrQWxsUmVhZChzZXNzaW9uczogcmVhZG9ubHkgSVNlc3Npb25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKHNlc3Npb25zLm1hcChzZXNzaW9uID0+IHRoaXMuc2V0U2Vzc2lvblJlYWRTdGF0ZShzZXNzaW9uLCB0cnVlKSkpO1xuXHR9XG5cblx0YXN5bmMgZGVsZXRlU2Vzc2lvbihzZXNzaW9uOiBJU2Vzc2lvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2dldFByb3ZpZGVyKHNlc3Npb24pPy5kZWxldGVTZXNzaW9uKHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHR0aGlzLl9vbkRpZERlbGV0ZVNlc3Npb24uZmlyZShzZXNzaW9uKTtcblx0fVxuXG5cdGFzeW5jIGRlbGV0ZVNlc3Npb25zKHNlc3Npb25zOiByZWFkb25seSBJU2Vzc2lvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYnlQcm92aWRlciA9IG5ldyBNYXA8SVNlc3Npb25zUHJvdmlkZXIsIElTZXNzaW9uW10+KCk7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHNlc3Npb25zKSB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2dldFByb3ZpZGVyKHNlc3Npb24pO1xuXHRcdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGdyb3VwID0gYnlQcm92aWRlci5nZXQocHJvdmlkZXIpO1xuXHRcdFx0aWYgKGdyb3VwKSB7XG5cdFx0XHRcdGdyb3VwLnB1c2goc2Vzc2lvbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRieVByb3ZpZGVyLnNldChwcm92aWRlciwgW3Nlc3Npb25dKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgZmlyc3RFcnJvcjogdW5rbm93bjtcblx0XHRmb3IgKGNvbnN0IFtwcm92aWRlciwgcHJvdmlkZXJTZXNzaW9uc10gb2YgYnlQcm92aWRlcikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgcHJvdmlkZXIuZGVsZXRlU2Vzc2lvbnMocHJvdmlkZXJTZXNzaW9ucy5tYXAoc2Vzc2lvbiA9PiBzZXNzaW9uLnNlc3Npb25JZCkpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgcHJvdmlkZXJTZXNzaW9ucykge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkRGVsZXRlU2Vzc2lvbi5maXJlKHNlc3Npb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRmaXJzdEVycm9yID8/PSBlcnJvcjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZmlyc3RFcnJvciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBmaXJzdEVycm9yO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGRlbGV0ZUNoYXQoc2Vzc2lvbjogSVNlc3Npb24sIGNoYXRVcmk6IFVSSSwgb3B0aW9ucz86IElEZWxldGVDaGF0T3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRlbGV0ZWQgPSBhd2FpdCB0aGlzLl9nZXRQcm92aWRlcihzZXNzaW9uKT8uZGVsZXRlQ2hhdChzZXNzaW9uLnNlc3Npb25JZCwgY2hhdFVyaSwgb3B0aW9ucyk7XG5cdFx0aWYgKGRlbGV0ZWQpIHtcblx0XHRcdHRoaXMuX29uRGlkRGVsZXRlQ2hhdC5maXJlKHNlc3Npb24pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlbmFtZUNoYXQoc2Vzc2lvbjogSVNlc3Npb24sIGNoYXRVcmk6IFVSSSwgdGl0bGU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2dldFByb3ZpZGVyKHNlc3Npb24pPy5yZW5hbWVDaGF0KHNlc3Npb24uc2Vzc2lvbklkLCBjaGF0VXJpLCB0aXRsZSk7XG5cdFx0dGhpcy5fb25EaWRSZW5hbWVDaGF0LmZpcmUoc2Vzc2lvbik7XG5cdH1cblxuXHRhc3luYyByZW5hbWVTZXNzaW9uKHNlc3Npb246IElTZXNzaW9uLCB0aXRsZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fZ2V0UHJvdmlkZXIoc2Vzc2lvbik/LnJlbmFtZVNlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQsIHRpdGxlKTtcblx0XHR0aGlzLl9vbkRpZFJlbmFtZVNlc3Npb24uZmlyZShzZXNzaW9uKTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc0RlZmVycmVkTmV3U2Vzc2lvblJlcXVlc3RPcHRpb25zKG9wdGlvbnM6IE5ld1Nlc3Npb25SZXF1ZXN0T3B0aW9ucyk6IG9wdGlvbnMgaXMgSURlZmVycmVkTmV3U2Vzc2lvblJlcXVlc3RPcHRpb25zIHtcblx0cmV0dXJuIChvcHRpb25zIGFzIElEZWZlcnJlZE5ld1Nlc3Npb25SZXF1ZXN0T3B0aW9ucykua2luZCA9PT0gJ2RlZmVycmVkJztcbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIFNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFzQjtBQUMvQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxZQUFZLGVBQWUsaUJBQThCLHlCQUF5QjtBQUMzRixTQUFTLG1CQUFtQjtBQUM1QixTQUFzQix1QkFBdUI7QUFFN0MsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUywwQkFBMEIsdUJBQXVCLDZCQUE2QixpQ0FBaUM7QUFFeEgsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBOEwsNEJBQXNELGdDQUFnQztBQUNwUixTQUF3QyxpQ0FBaUM7QUFFekUsU0FBaUUscUJBQW1DO0FBQ3BHLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHdDQUF3QztBQUNqRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNDQUFzQztBQUcvQyxNQUFNLGdEQUFnRDtBQUV0RCxTQUFTLDZCQUE2QixhQUFvQztBQUN6RSxTQUFPLCtCQUErQixZQUFZLEVBQUU7QUFDckQ7QUFFTyxJQUFNLDRCQUFOLGNBQXdDLFdBQWlEO0FBQUEsRUE2RC9GLFlBQytCLFlBQ2MsMEJBQ04sb0JBQ1AsYUFDYSwwQkFDVixnQkFDSCxhQUNXLHdCQUNTLGlDQUNsRDtBQUNE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
