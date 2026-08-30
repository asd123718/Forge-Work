import { open, unlink } from "fs/promises";
import { decodeBase64, VSBuffer } from "../../../base/common/buffer.js";
import { DeferredPromise, disposableTimeout, Limiter, Promises, ResourceQueue } from "../../../base/common/async.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableResourceMap, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../base/common/map.js";
import { getExtensionForMimeType, getMediaMime } from "../../../base/common/mime.js";
import { Schemas } from "../../../base/common/network.js";
import { observableValue } from "../../../base/common/observable.js";
import { dirname as resourcesDirname, extname as resourcesExtname, extUriBiasedIgnorePathCase, isEqual, isEqualOrParent, joinPath } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { hasKey } from "../../../base/common/types.js";
import { localize } from "../../../nls.js";
import { FileChangeType, FileOperationResult, toFileOperationResult } from "../../files/common/files.js";
import { InstantiationService } from "../../instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../instantiation/common/serviceCollection.js";
import { ILogService } from "../../log/common/log.js";
import { AgentSession, SubagentChatSignal, subagentChatTitle } from "../common/agent.js";
import { AgentHostSessionReleaseGraceMsEnvVar, IAgentService } from "../common/agentService.js";
import { ISessionDataService, SESSION_ATTACHMENTS_DIRNAME } from "../common/sessionDataService.js";
import { parseEditAttributionResource } from "../common/fileEditAttribution.js";
import { SessionConfigKey } from "../common/sessionConfigKeys.js";
import { parseChangesetUri } from "../common/changesetUri.js";
import { ActionType, AuthRequiredReason, isSessionAction } from "../common/state/sessionActions.js";
import { resolveSessionWorkingDirectoryAction } from "../common/state/sessionWorkingDirectories.js";
import { AhpErrorCodes, AHP_SESSION_NOT_FOUND, ContentEncoding, JSON_RPC_INTERNAL_ERROR, ProtocolError, ResourceChangeType, ResourceType, ResourceWriteMode } from "../common/state/sessionProtocol.js";
import { ChatInteractivity, ChatOriginKind, MessageAttachmentKind } from "../common/state/protocol/state.js";
import { MessageKind, ResponsePartKind, SESSION_META_GITHUB_KEY, SESSION_META_GIT_KEY, SESSION_META_MULTI_ROOT_KEY, SESSION_META_SOURCE_CONTROL_KEY, readSessionSpawnDepth, withSessionSpawnDepth, SessionLifecycle, SessionStatus, ToolCallStatus, ToolResultContentType, AH_META_WORKSPACELESS_DB_KEY, AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_DONE_DB_KEY, AH_META_IS_READ_DB_KEY, buildChatUri, buildDefaultChatUri, buildResourceWatchChannelUri, buildSubagentChatUri, buildSubagentSessionUriPrefix, hostBuildInfoFromProduct, isAhpChatChannel, isDefaultChatUri, isSubagentChatUri, isSubagentSession, parseChatUri, parseDefaultChatUri, parseRequiredSessionUriFromChatUri, parseResourceWatchChannelUri, parseSessionMultiRootMetadata, parseSubagentSessionUri, readSessionExternal, readSessionGitHubState, readSessionGitState, readSessionMultiRootMetadata, readSessionSourceControlState, readSessionWorkspaceless, withSessionExternal, withSessionGitHubState, withSessionGitState, withSessionMultiRootMetadata, withSessionSourceControlState, withSessionStatusFlag, withSessionWorkspaceless, readSessionEhcliAdoptable, chatStorageUri, hasReportedUsage } from "../common/state/sessionState.js";
import { readToolCallMeta } from "../common/meta/agentToolCallMeta.js";
import { IProductService } from "../../product/common/productService.js";
import { buildBoundedSideChatSourceContext, getSideChatPartialResponse } from "./agentPeerChats.js";
import { AgentConfigurationService, getEffectiveWorkingDirectories, IAgentConfigurationService } from "./agentConfigurationService.js";
import { AgentHostManagedSettingsService } from "./agentHostManagedSettingsService.js";
import { AgentHostTerminalManager, IAgentHostTerminalManager } from "./agentHostTerminalManager.js";
import { parseSessionDbUri } from "../common/sessionDbUri.js";
import { parseGitBlobUri } from "./gitDiffContent.js";
import { resolveSessionRepositories } from "./agentHostSessionRepositories.js";
import { findDeepestContainingWorkingDirectory, isMultiRootSession } from "../common/agentHostWorkingDirectories.js";
import { AgentHostStateManager, IAgentHostStateManager } from "./agentHostStateManager.js";
import { createAgentChatContext } from "./agentChatContext.js";
import { AgentHostPromptCache, IAgentHostPromptCache } from "./agentHostPromptCache.js";
import { AgentHostSessionTitleSignal, IAgentHostSessionTitleSignal } from "./agentHostSessionTitleSignal.js";
import { AgentHostDatabase } from "./agentHostDatabase.js";
import { AgentSessionRegistry } from "./agentSessionRegistry.js";
import { IAgentHostGitService } from "../common/agentHostGitService.js";
import { AgentSideEffects } from "./agentSideEffects.js";
import { AgentHostLocalTurns } from "./agentHostLocalTurns.js";
import { AgentServerToolHost } from "./shared/agentServerToolHost.js";
import { buildServerToolGroups } from "./shared/serverToolGroups.js";
import { validateRenameTitle } from "./shared/sessionServerTools.js";
import { AGENT_HOST_TITLE_SOURCE_AGENT, customChatTitleMetadataKey, customChatTitleSourceMetadataKey, persistSessionMetadataValues, SESSION_CUSTOM_TITLE_KEY, SESSION_CUSTOM_TITLE_SOURCE_KEY } from "./shared/persistSessionMetadata.js";
import { buildWorktreeFailureNotification, WORKTREE_META_REPOSITORY_ROOT, worktreeProjectFromRepositoryRoot } from "./shared/worktreeIsolation.js";
import { AgentHostChangesetService } from "./agentHostChangesetService.js";
import { AgentHostFileMonitorService, IAgentHostFileMonitorService } from "./agentHostFileMonitorService.js";
import { IAgentHostCheckpointService } from "../common/agentHostCheckpointService.js";
import { IAgentHostReviewService } from "../common/agentHostReviewService.js";
import { AgentHostChangesetCoordinator } from "./agentHostChangesetCoordinator.js";
import { AgentHostCompletions } from "./agentHostCompletions.js";
import { AgentHostChatCompletionProvider } from "./agentHostChatCompletionProvider.js";
import { AgentHostFileCompletionProvider } from "./agentHostFileCompletionProvider.js";
import { AgentHostRenameCompletionProvider } from "./agentHostRenameCommand.js";
import { AgentHostSkillCompletionProvider } from "./agentHostSkillCompletionProvider.js";
import { AgentHostWorkspaceFiles } from "./agentHostWorkspaceFiles.js";
import { SessionServerToolName } from "../common/serverToolNames.js";
import { CodexCompactCompletionProvider } from "./codexCompactCommand.js";
import { CopilotApiService, ICopilotApiService } from "./shared/copilotApiService.js";
import { parseMcpChannelUri } from "./shared/mcpCustomizationController.js";
import { toAgentClientUri } from "../common/agentClientUri.js";
import { AgentHostClientType } from "../common/agentHostClientInfo.js";
import { AgentHostLaunchKind, createUnknownAgentHostClientTelemetryContext } from "../common/agentHostTelemetry.js";
import { AgentHostChangesetOperationService } from "./agentHostChangesetOperationService.js";
import { AgentHostGitStateService } from "./agentHostGitStateService.js";
import { AgentHostGitHubEndpointService, IAgentHostGitHubEndpointService } from "./agentHostGitHubEndpointService.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../telemetry/common/telemetryUtils.js";
import { AgentHostAuthenticationService } from "./agentHostAuthenticationService.js";
import { updateAgentHostTelemetryLevelFromConfig } from "./agentHostTelemetryService.js";
import { AgentHostActiveAgentTitleGenerationConfigKey, AgentHostEditTelemetryEnabledConfigKey, AgentHostExternalSessionsMode, AgentHostMigrateLegacyCopilotCliEnabledConfigKey, AgentHostShowExternalSessionsConfigKey, platformRootSchema } from "../common/agentHostSchema.js";
import { AgentHostCustomizationEnablementService, IAgentHostCustomizationEnablementService } from "./agentHostCustomizationEnablementService.js";
import { AgentHostStorageService, IAgentHostStorageService } from "./agentHostStorageService.js";
import { AgentHostOctoKitService, IAgentHostOctoKitService } from "./shared/agentHostOctoKitService.js";
import { GitHubService, IGitHubService } from "../../github/common/githubService.js";
import { IAgentHostChangesetService, CHANGESET_DB_METADATA_KEYS, META_CHANGES_SUMMARY } from "../common/agentHostChangesetService.js";
import { IAgentHostChangesetSubscriptionService } from "../common/agentHostChangesetSubscriptionService.js";
import { AgentHostChangesetSubscriptionService } from "./agentHostChangesetSubscriptionService.js";
import { GIT_DB_METADATA_KEYS, IAgentHostGitStateService, META_GIT_STATE, META_GITHUB_STATE, META_SOURCE_CONTROL_STATE } from "../common/agentHostGitStateService.js";
import { IAgentHostChangesetOperationService } from "../common/agentHostChangesetOperationService.js";
import { AgentHostCommitOperationContribution } from "./agentHostCommitOperationProvider.js";
import { AgentHostDiscardChangesOperationContribution } from "./agentHostDiscardChangesOperationProvider.js";
import { AgentHostMergeOperationContribution } from "./agentHostMergeOperationProvider.js";
import { AgentHostPullRequestOperationContribution } from "./agentHostPullRequestOperationProvider.js";
import { AgentHostSyncOperationContribution } from "./agentHostSyncOperationProvider.js";
import { AgentHostReviewService } from "./agentHostReviewService.js";
import { AgentHostCheckpointService } from "./agentHostCheckpointService.js";
import { ForgeDiagnosticsLog, setActiveForgeDiagnosticsLog } from "./forgeDiagnosticsLog.js";
const SESSION_GC_GRACE_MS = 3e4;
const HOST_OWNED_SESSION_CONFIG_KEYS = [
  SessionConfigKey.Isolation,
  SessionConfigKey.Branch,
  SessionConfigKey.WorktreeBranchPrefix,
  SessionConfigKey.WorktreeIncludeFiles,
  SessionConfigKey.WorktreeBranchTrack
];
function omitHostOwnedSessionConfig(config) {
  const result = { ...config };
  for (const key of HOST_OWNED_SESSION_CONFIG_KEYS) {
    delete result[key];
  }
  return result;
}
function parsePersistedSourceControlState(value) {
  const state = readSessionSourceControlState({
    [SESSION_META_SOURCE_CONTROL_KEY]: JSON.parse(value)
  });
  if (!state) {
    throw new Error("Invalid persisted source-control state");
  }
  return state;
}
const RESOURCE_WATCH_GRACE_MS = 3e4;
const SUBAGENT_CHAT_PENDING_TIMEOUT_MS = 15e3;
const SESSION_RELEASE_GRACE_MS = (() => {
  const raw = process.env[AgentHostSessionReleaseGraceMsEnvVar];
  const parsed = raw !== void 0 ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 3e4;
})();
const PEER_CHATS_METADATA_KEY = "peerChats";
const DEFAULT_CHAT_PROVIDER_DATA_METADATA_KEY = "defaultChatProviderData";
const CHAT_BACKING_METADATA_KEY = "peerChatBacking";
function reconcileWorkingDirectories(requested, resolved) {
  if (resolved === void 0) {
    return requested?.map((d) => d.toString());
  }
  const tail = (requested ?? []).slice(resolved.length);
  return [...resolved, ...tail].map((d) => d.toString());
}
class AgentService extends Disposable {
  constructor(_logService, _fileService, _sessionDataService, _productService, _gitService, _rootConfigResource, _telemetryService = NullTelemetryService, _fileMonitorService, copilotApiService, fetchFn, providerConfigurations = [], _hostLaunchKind = AgentHostLaunchKind.Unknown, storageResource, orchestratorDatabase, _now = Date.now, logsHome) {
    super();
    this._logService = _logService;
    this._fileService = _fileService;
    this._sessionDataService = _sessionDataService;
    this._productService = _productService;
    this._gitService = _gitService;
    this._rootConfigResource = _rootConfigResource;
    this._telemetryService = _telemetryService;
    this._hostLaunchKind = _hostLaunchKind;
    this._now = _now;
    this._resourceWriteQueue = this._register(new ResourceQueue());
    /** Protocol: fires when state is mutated by an action. */
    this._onDidAction = this._register(new Emitter());
    this.onDidAction = this._onDidAction.event;
    /** Protocol: fires for ephemeral notifications (sessionAdded/Removed). */
    this._onDidNotification = this._register(new Emitter());
    this.onDidNotification = this._onDidNotification.event;
    /** Protocol: fires for MCP server-originated notifications routed over `mcp://` channels. */
    this._onMcpNotification = this._register(new Emitter());
    this.onMcpNotification = this._onMcpNotification.event;
    this._managedSettingsService = this._register(new AgentHostManagedSettingsService());
    this._providerMigrations = /* @__PURE__ */ new Map();
    this._initialProviderMigrations = /* @__PURE__ */ new Map();
    /**
     * Backing-session URIs (as strings) whose {@link CHAT_BACKING_METADATA_KEY}
     * durable marker write kept failing after a retry in `createChat`. The chat
     * itself was already created and announced successfully, so this in-process
     * suppression stands in for the durable marker: it is consulted by
     * {@link _isChatBacking} (used by external discovery) and by `listSessions`'s overlay
     * filter, so the backing session is still never surfaced as a standalone
     * top-level session for the lifetime of this process, even though its
     * on-disk marker never persisted. A later successful write (e.g. from a
     * differently-timed retry) removes the entry; a stale entry for a since
     * deleted session is harmless — that URI is never reachable again.
     */
    this._unpersistedChatBackings = /* @__PURE__ */ new Set();
    /** Registered providers keyed by their {@link AgentProvider} id. */
    this._providers = /* @__PURE__ */ new Map();
    /** Maps each active session URI (toString) to its owning provider. */
    this._sessionToProvider = /* @__PURE__ */ new Map();
    /**
     * Sessions that have opted in to bring-up progress, keyed by provider id.
     * A session is added here when its `createSession` carries a
     * {@link IAgentCreateSessionConfig.progressToken} and removed once it
     * materializes (the SDK is now resolved) or is disposed. The SDK download is
     * host-level and shared across every session of a provider, so this only
     * records *interest*: as long as one or more sessions of a provider is
     * registered, {@link emitDownloadProgress} surfaces that provider's download as a single
     * progress stream keyed by the download's own identity (the package id),
     * rather than one stream per session.
     */
    this._downloadProgressInterest = /* @__PURE__ */ new Map();
    /** Subscriptions to provider progress events; cleared when providers change. */
    this._providerSubscriptions = this._register(new DisposableStore());
    /**
     * Per-session tail of in-flight persisted peer-chat catalog writes, keyed by
     * session URI string. Read-modify-write updates to the {@link
     * PEER_CHATS_METADATA_KEY} blob are chained per session so a `createChat`,
     * `disposeChat`, and `onDidChangeChatData` racing for the same
     * session can't clobber each other's edits.
     */
    this._peerChatCatalogWrites = /* @__PURE__ */ new Map();
    this._disposingPeerChats = /* @__PURE__ */ new Set();
    this._defaultChatBackingWrites = /* @__PURE__ */ new Map();
    /** Observable registered agents, drives `root/agentsChanged` via {@link AgentSideEffects}. */
    this._agents = observableValue("agents", []);
    this._skillCompletionProviderRegistered = false;
    /**
     * Authoritative server-side per-resource subscription refcount, keyed by
     * resource URI string and valued by the set of subscribed protocol
     * client IDs. Populated by {@link subscribe} (or {@link addSubscriber}
     * for handshake fast-paths) and drained by {@link unsubscribe}. When a
     * resource's set becomes empty, the resource is dropped from the map and
     * {@link _maybeEvictIdleSession} is invoked to release any cached state
     * for it.
     */
    this._resourceSubscribers = new ResourceMap();
    this._releaseSessionInFlight = /* @__PURE__ */ new Map();
    this._restoreSessionInFlight = /* @__PURE__ */ new Map();
    this._restoreSubagentInFlight = /* @__PURE__ */ new Map();
    /** Subagent chats armed for a bounded wait (once execution is confirmed); resolved by {@link _onChatSpawned}, awaited by {@link subscribe}. */
    this._pendingSubagentChats = /* @__PURE__ */ new Map();
    this._pendingSubagentChatTimeouts = this._register(new DisposableMap());
    /** Subagent chats announced via `_meta.subagentChatUri` but still awaiting confirmation, keyed by `${channel}:${toolCallId}`. */
    this._pendingSubagentToolCalls = /* @__PURE__ */ new Map();
    /**
     * Pending {@link _runSessionGc} timers, keyed by session URI. A timer is
     * armed when a session loses its last subscriber while still empty (no
     * turns, no active turn) — see {@link _maybeScheduleSessionGc}. Cleared
     * whenever any client subscribes again or the timer fires.
     */
    this._pendingSessionGc = this._register(new DisposableResourceMap());
    /**
     * Pending {@link _maybeEvictIdleSession} timers, keyed by session URI. A
     * timer is armed when an idle session (with turns) loses its last subscriber
     * — see {@link unsubscribe}. Cleared when any client subscribes again
     * ({@link addSubscriber}) or the timer fires. Deferring the release avoids
     * churning the provider SDK session on rapid disconnect/reconnect cycles.
     */
    this._pendingSessionRelease = this._register(new DisposableResourceMap());
    /**
     * Active resource watches keyed by the channel URI string
     * (`ahp-resource-watch:/<encoded>`).
     *
     * Each entry owns the {@link IFileService} watcher together with the
     * decoded descriptor, the subscriber refcount, and the optional
     * grace-window dispose timer. The watch URI itself is fully
     * self-describing — {@link createResourceWatch} just encodes the
     * caller's params into the URI and returns it. State only exists
     * here once at least one client has subscribed.
     *
     * Lifecycle:
     * - First subscriber to a channel: {@link onResourceWatchSubscribed}
     *   parses the URI, creates the {@link IFileService} watcher, and
     *   installs the entry with `subscribers = 1`.
     * - Subsequent subscribers bump the refcount and cancel any pending
     *   grace-window dispose timer.
     * - {@link onResourceWatchUnsubscribed} drops the refcount; when it
     *   reaches zero we arm a {@link RESOURCE_WATCH_GRACE_MS} dispose
     *   timer rather than tearing down immediately, giving disconnected
     *   clients time to reconnect.
     */
    this._resourceWatches = this._register(new DisposableMap());
    /** Session keys already announced this AH lifetime, so provider signals do not re-announce them. */
    this._announcedSurfacedKeys = /* @__PURE__ */ new Set();
    this._broadcastExternalSessions = /* @__PURE__ */ new Set();
    this._sessionListReconciliation = Promise.resolve();
    /** Tracks the migrate-legacy setting so the config listener acts only on transitions. */
    this._lastMigrateLegacyEnabled = false;
    /**
     * Per-client sequencer that serialises action dispatches whose
     * processing requires an asynchronous prelude (e.g. resolving a restored
     * peer chat or snapshotting user-message attachments before the action is
     * reduced into state). Actions that don't need any asynchronous prelude
     * bypass the queue entirely as long as no earlier action from the same
     * client is still pending.
     *
     * todo@connor4312: we can drop this when sending a message become a command
     */
    this._clientDispatchQueues = /* @__PURE__ */ new Map();
    this._logService.info("AgentService initialized");
    const diagnosticsLog = this._diagnosticsLog = logsHome ? this._register(new ForgeDiagnosticsLog(logsHome)) : void 0;
    setActiveForgeDiagnosticsLog(diagnosticsLog);
    this._authService = new AgentHostAuthenticationService(_logService);
    const databasePath = this._rootConfigResource ? joinPath(resourcesDirname(this._rootConfigResource), "agent-host.db").fsPath : ":memory:";
    this._orchestratorDatabase = this._register(orchestratorDatabase ?? new AgentHostDatabase(databasePath));
    this._sessionRegistry = this._register(new AgentSessionRegistry(this._orchestratorDatabase));
    this._stateManager = this._register(new AgentHostStateManager(_logService, {
      hostBuildInfo: hostBuildInfoFromProduct(this._productService),
      changesetStateRetention: {
        // The cache calls this lazily after construction. If a future state-manager
        // initialization path registers changesets before `_changesets` is assigned,
        // keep the entry pinned rather than evicting with incomplete liveness data.
        canEvict: (changeset) => this._changesets ? this._isChangesetEvictable(changeset) : false
      }
    }));
    this._register(this._stateManager.onDidEmitEnvelope((e) => this._onDidAction.fire(e)));
    this._register(this._stateManager.onDidEmitEnvelope((e) => {
      if (!diagnosticsLog) {
        return;
      }
      const action = e.action;
      const protocolSummary = { channel: e.channel, type: action.type, serverSeq: e.serverSeq, origin: e.origin, rejectionReason: e.rejectionReason };
      diagnosticsLog.record("protocol", "AHP.ACTION", protocolSummary);
      if (action.type === ActionType.TerminalData) {
        diagnosticsLog.recordStream("terminal", `${e.channel}:output`, "TERMINAL.STDOUT", action.data, { terminal: e.channel });
      } else if (action.type === ActionType.TerminalInput) {
        diagnosticsLog.recordText("terminal", "TERMINAL.INPUT", action.data, { terminal: e.channel });
      } else if (action.type === ActionType.TerminalCommandExecuted) {
        diagnosticsLog.recordText("terminal", "COMMAND", action.commandLine, { terminal: e.channel, commandId: action.commandId, timestamp: action.timestamp });
      } else if (action.type === ActionType.TerminalCommandFinished) {
        diagnosticsLog.flushStreams(`${e.channel}:output`);
        diagnosticsLog.record("terminal", "COMMAND.FINISHED", { commandId: action.commandId, exitCode: action.exitCode, durationMs: action.durationMs }, { terminal: e.channel });
      } else if (action.type === ActionType.TerminalExited) {
        diagnosticsLog.flushStreams(`${e.channel}:output`);
        diagnosticsLog.record("terminal", "TERMINAL.EXITED", { exitCode: action.exitCode }, { terminal: e.channel });
      }
    }));
    this._register(this._stateManager.onDidEmitEnvelope((e) => this._trackPendingSubagentChatFromEnvelope(e)));
    this._register(this._stateManager.onDidEmitNotification((e) => this._onDidNotification.fire(e)));
    const configurationService = this._register(new AgentConfigurationService(this._stateManager, this._logService, this._rootConfigResource, providerConfigurations));
    this._configurationService = configurationService;
    let externalSessionsMode = this._getExternalSessionsMode();
    this._lastMigrateLegacyEnabled = this._isMigrateLegacyEnabled();
    this._register(configurationService.onDidRootConfigChange(() => {
      const nextMode = this._getExternalSessionsMode();
      if (nextMode !== externalSessionsMode) {
        const previousMode = externalSessionsMode;
        externalSessionsMode = nextMode;
        this._queueSessionListReconciliation(previousMode);
      }
      this._onMigrateLegacySettingChanged();
    }));
    const fileMonitorService = _fileMonitorService ?? this._register(new AgentHostFileMonitorService(this._fileService, this._logService));
    this._storageService = this._register(new AgentHostStorageService(storageResource, this._logService));
    updateAgentHostTelemetryLevelFromConfig(this._telemetryService, this._stateManager.rootState.config?.values);
    const services = new ServiceCollection(
      [ILogService, this._logService],
      [IAgentService, this],
      [IProductService, this._productService],
      [IAgentConfigurationService, configurationService],
      [IAgentHostStateManager, this._stateManager],
      [IAgentHostFileMonitorService, fileMonitorService],
      [IAgentHostGitService, this._gitService],
      [IAgentHostStorageService, this._storageService],
      [ITelemetryService, this._telemetryService],
      // The outer agent-host process DI registers `ISessionDataService`,
      // but this nested strict `InstantiationService` does not inherit it.
      // Add it explicitly so `@ISessionDataService` injection into the
      // changeset service (and any future sibling) resolves correctly.
      [ISessionDataService, this._sessionDataService]
    );
    const instantiationService = this._register(new InstantiationService(
      services,
      /*strict*/
      true
    ));
    this._gitHubEndpointService = this._register(instantiationService.createInstance(AgentHostGitHubEndpointService));
    services.set(IAgentHostGitHubEndpointService, this._gitHubEndpointService);
    this._register(this._gitHubEndpointService.onDidChange(() => {
      this._stateManager.emitAuthRequired({
        resource: this._gitHubEndpointService.getCopilotResource(),
        reason: AuthRequiredReason.Required
      });
    }));
    const agentHostOctoKitService = instantiationService.createInstance(AgentHostOctoKitService, fetchFn);
    services.set(IAgentHostOctoKitService, agentHostOctoKitService);
    const gitHubService = this._register(instantiationService.createInstance(GitHubService, {
      endpoint: this._gitHubEndpointService,
      tokenProvider: {
        getToken: () => {
          const resource = this._gitHubEndpointService.getRepoResource();
          return this._authService.getAuthToken({
            resource: resource.resource,
            scopes: resource.scopes_supported
          });
        }
      },
      fetch: fetchFn
    }));
    services.set(IGitHubService, gitHubService);
    const effectiveCopilotApiService = copilotApiService ?? instantiationService.createInstance(CopilotApiService, fetchFn);
    services.set(ICopilotApiService, effectiveCopilotApiService);
    this._customizationEnablementService = this._register(instantiationService.createInstance(AgentHostCustomizationEnablementService));
    services.set(IAgentHostCustomizationEnablementService, this._customizationEnablementService);
    this._gitStateService = this._register(instantiationService.createInstance(AgentHostGitStateService));
    services.set(IAgentHostGitStateService, this._gitStateService);
    this._checkpointService = this._register(instantiationService.createInstance(AgentHostCheckpointService));
    services.set(IAgentHostCheckpointService, this._checkpointService);
    this._promptCache = instantiationService.createInstance(AgentHostPromptCache);
    services.set(IAgentHostPromptCache, this._promptCache);
    this._sessionTitleSignal = this._register(instantiationService.createInstance(AgentHostSessionTitleSignal));
    services.set(IAgentHostSessionTitleSignal, this._sessionTitleSignal);
    this._changesetSubscriptions = instantiationService.createInstance(AgentHostChangesetSubscriptionService);
    services.set(IAgentHostChangesetSubscriptionService, this._changesetSubscriptions);
    this._changesetOperationService = this._register(instantiationService.createInstance(AgentHostChangesetOperationService));
    services.set(IAgentHostChangesetOperationService, this._changesetOperationService);
    this._reviewService = this._register(instantiationService.createInstance(AgentHostReviewService));
    services.set(IAgentHostReviewService, this._reviewService);
    this._changesets = this._register(instantiationService.createInstance(AgentHostChangesetService));
    services.set(IAgentHostChangesetService, this._changesets);
    this._changesetCoordinator = this._register(instantiationService.createInstance(AgentHostChangesetCoordinator));
    this._register(this._stateManager.onDidChangeSessionActiveTurn((e) => this._changesetCoordinator.onSessionTurnActiveChanged(e.session, e.active)));
    this._register(this._changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostCommitOperationContribution)));
    this._register(this._changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostPullRequestOperationContribution)));
    this._register(this._changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostMergeOperationContribution)));
    this._register(this._changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostSyncOperationContribution)));
    this._register(this._changesetOperationService.registerContribution(instantiationService.createInstance(AgentHostDiscardChangesOperationContribution)));
    this._completions = this._register(instantiationService.createInstance(AgentHostCompletions));
    const workspaceFiles = this._register(instantiationService.createInstance(AgentHostWorkspaceFiles));
    this._register(this._completions.registerProvider(
      new AgentHostFileCompletionProvider(this._stateManager, workspaceFiles, this._logService)
    ));
    this._register(this._completions.registerProvider(
      new AgentHostChatCompletionProvider(this._stateManager)
    ));
    this._register(this._completions.registerProvider(
      new AgentHostRenameCompletionProvider(
        (session) => (this._stateManager.getSessionState(session)?.turns.length ?? 0) > 0
      )
    ));
    this._register(this._completions.registerProvider(
      new CodexCompactCompletionProvider(
        (session) => (this._stateManager.getSessionState(session)?.turns.length ?? 0) > 0
      )
    ));
    this._terminalManager = this._register(instantiationService.createInstance(AgentHostTerminalManager));
    services.set(IAgentHostTerminalManager, this._terminalManager);
    this._localTurns = new AgentHostLocalTurns(this._sessionDataService, this._logService);
    this._sideEffects = this._register(instantiationService.createInstance(AgentSideEffects, this._stateManager, this._customizationEnablementService, {
      getAgent: (session) => this._findProviderForSession(session),
      sessionDataService: this._sessionDataService,
      localTurns: this._localTurns,
      diagnosticsLog,
      agents: this._agents,
      hostLaunchKind: this._hostLaunchKind,
      copilotApiService: effectiveCopilotApiService,
      getGitHubCopilotToken: () => {
        return this.getAuthToken({
          resource: this._gitHubEndpointService.getCopilotResource().resource,
          scopes: this._gitHubEndpointService.getCopilotResource().scopes_supported
        });
      },
      getGitHubToken: () => {
        return this.getAuthToken({
          resource: this._gitHubEndpointService.getRepoResource().resource,
          scopes: this._gitHubEndpointService.getRepoResource().scopes_supported
        });
      },
      getGitHubHost: () => this._gitHubEndpointService.getEnterpriseHost() ?? "github.com",
      octoKitService: agentHostOctoKitService,
      resolveWorkingDirectoryBeforeSend: (params) => this._resolveWorkingDirectoryBeforeSend(params),
      resolveChatAttachmentTurns: (resource) => this._resolveChatAttachmentTurns(resource),
      onTurnComplete: (session) => {
        const workingDirStr = this._stateManager.getSessionState(session)?.workingDirectories?.[0];
        void this._gitStateService.attachSessionGitHubPullRequest(session, workingDirStr ? URI.parse(workingDirStr) : void 0);
      },
      onUserMessage: (session, text) => {
        void this._gitStateService.attachSessionGitHubReferences(session.toString(), text);
      }
    }));
    this._serverToolHost = new AgentServerToolHost(this._stateManager, buildServerToolGroups(this._createSessionServerToolAccessor()));
  }
  /** Exposes the state manager for co-hosting a WebSocket protocol server. */
  get stateManager() {
    return this._stateManager;
  }
  /** Exposes the configuration service so agent providers can share root config plumbing. */
  get configurationService() {
    return this._configurationService;
  }
  /** Exposes host-owned persistent storage to process-level DI. */
  get storageService() {
    return this._storageService;
  }
  /** Exposes customization enablement to process-level DI. */
  get customizationEnablementService() {
    return this._customizationEnablementService;
  }
  get managedSettingsService() {
    return this._managedSettingsService;
  }
  /** Exposes the GitHub endpoint service so agent providers share GitHub (Enterprise) resource resolution. */
  get gitHubEndpointService() {
    return this._gitHubEndpointService;
  }
  /** Exposes the checkpoint service so agent providers can capture session baselines. */
  get checkpointService() {
    return this._checkpointService;
  }
  /** Exposes prompt-cache metadata without exposing the whole state manager. */
  get promptCache() {
    return this._promptCache;
  }
  /** Exposes host-owned session-title changes without exposing the whole state manager. */
  get sessionTitleSignal() {
    return this._sessionTitleSignal;
  }
  /** Exposes the terminal manager for use by agent providers. */
  get terminalManager() {
    return this._terminalManager;
  }
  /** Exposes the completions service for use by agent providers (e.g. to register agent-scoped completion item providers). */
  get completionsService() {
    return this._completions;
  }
  /**
   * Trigger characters announced to clients via `InitializeResult.completionTriggerCharacters`.
   * Aggregated from all registered {@link IAgentHostCompletionItemProvider}s.
   */
  get completionTriggerCharacters() {
    return this._completions.triggerCharacters;
  }
  get diagnosticsLog() {
    return this._diagnosticsLog;
  }
  /**
   * The registered providers. Exposed so process-lifetime background jobs
   * (notably {@link AgentModelRefreshScheduler}) can observe registrations
   * without this service owning an ambient recurring timer of its own.
   */
  get agents() {
    return this._agents;
  }
  /**
   * Fires with the provider id whenever a turn starts. Exposed alongside
   * {@link agents} so {@link AgentModelRefreshScheduler} can gate its periodic
   * refresh on real agent usage rather than polling an idle host.
   */
  get onDidStartTurn() {
    return this._sideEffects.onDidStartTurn;
  }
  // ---- provider registration ----------------------------------------------
  /**
   * Injects the host-owned {@link WorktreeIsolation} controller and forwards it
   * to the collaborators that consult it. Called once at startup (from
   * agentHostMain / agentHostServerMain) after the Copilot API dependencies
   * have been wired.
   */
  setWorktreeIsolation(worktree) {
    this._worktree = worktree;
    this._configurationService.setWorktreeIsolation(worktree);
    this._sideEffects.setWorktreeIsolation(worktree);
    this._customizationEnablementService.setWorktreeIsolation(worktree);
  }
  _toProviderConfig(request) {
    if (!this._worktree || !request.config) {
      return request;
    }
    return { ...request, config: omitHostOwnedSessionConfig(request.config) };
  }
  /**
   * Host-owned first-send hook (invoked by {@link AgentSideEffects} before the
   * agent locks its subprocess cwd). Resolves the working directories the session
   * will actually run in and hands them to the agent at send time:
   *  - index 0 is the process root: for `worktree` isolation the isolated
   *    worktree (created here on the first send, see
   *    {@link _resolveWorktreeBeforeSend}); for `folder` isolation the picked
   *    folder; `undefined` (whole result) for workspace-less sessions.
   *  - the tail carries any additional session roots as-is (only index 0 is
   *    worktree-remapped; additional roots are passed through unchanged).
   */
  async _resolveWorkingDirectoryBeforeSend(params) {
    const sessionId = AgentSession.id(params.session);
    const pickedFolders = this._configurationService.getEffectiveWorkingDirectories(params.session);
    const pickedFolderUri = pickedFolders?.[0] ? URI.parse(pickedFolders[0]) : void 0;
    const tail = (pickedFolders ?? []).slice(1).map((d) => URI.parse(d));
    if (!this._worktree?.isWorkingDirectoryPending(sessionId)) {
      if (!pickedFolderUri) {
        return void 0;
      }
      const resolved2 = await this._configurationService.resolveWorkingDirectoryForResume(params.session, pickedFolderUri);
      return [resolved2, ...tail];
    }
    const resolved = await this._resolveWorktreeBeforeSend({ ...params, sessionId, pickedFolderUri }) ?? pickedFolderUri;
    return resolved ? [resolved, ...tail] : void 0;
  }
  async _resolveChatAttachmentTurns(resource) {
    const readTurns = () => {
      const state = this._stateManager.getChatState(resource) ?? this._stateManager.getDefaultChatState(resource);
      return state?.turns;
    };
    const existing = readTurns();
    if (existing) {
      return existing;
    }
    const sessionUri = URI.parse(isAhpChatChannel(resource) ? parseRequiredSessionUriFromChatUri(resource) : resource);
    if (!this._stateManager.getSessionState(sessionUri.toString())) {
      await this.restoreSession(sessionUri);
    } else {
      const provider = this._findProviderForSession(sessionUri);
      if (provider) {
        await this._restorePeerChats(provider, sessionUri);
      }
    }
    if (isAhpChatChannel(resource)) {
      const state = await this._stateManager.resolveChatState(resource);
      if (state) {
        return state.turns;
      }
      throw new Error(`Cannot resolve peer chat attachment: ${resource}`);
    }
    const resolved = readTurns();
    if (resolved) {
      return resolved;
    }
    return [];
  }
  /**
   * Creates the session's isolated worktree on the first send (deferred so the
   * user's prompt can name the branch), reports creation progress as the chat's
   * activity, surfaces the "Created isolated worktree" announcement as the first
   * markdown response part or a durable fallback warning, and returns the created worktree URI.
   * Idempotent; safe to call once the worktree exists. Returns `undefined` when
   * worktree creation failed. Only invoked for sessions whose worktree is still
   * pending (see {@link _resolveWorkingDirectoryBeforeSend}).
   */
  async _resolveWorktreeBeforeSend(params) {
    const { sessionId, pickedFolderUri } = params;
    const worktree = this._worktree;
    if (!worktree) {
      return void 0;
    }
    let reportedActivity = false;
    let failureDiagnostic;
    try {
      await worktree.resolveOnFirstSend({
        sessionUri: URI.parse(params.session),
        sessionId,
        workingDirectory: pickedFolderUri,
        config: this._configurationService.getSessionConfigValues(params.session),
        prompt: params.prompt,
        githubToken: this.getAuthToken({
          resource: this._gitHubEndpointService.getCopilotResource().resource,
          scopes: this._gitHubEndpointService.getCopilotResource().scopes_supported
        }),
        onProgress: (activity) => {
          reportedActivity = true;
          this._stateManager.dispatchServerAction(params.chat, { type: ActionType.ChatActivityChanged, activity });
        }
      });
    } catch (err) {
      failureDiagnostic = toErrorMessage(err);
      this._logService.warn(`[AgentService] worktree resolution failed for ${params.session}: ${failureDiagnostic}`);
    }
    if (reportedActivity) {
      this._stateManager.dispatchServerAction(params.chat, { type: ActionType.ChatActivityChanged, activity: void 0 });
    }
    const resolvedWorktree = worktree.getResolvedWorktree(sessionId);
    if (!resolvedWorktree) {
      try {
        await worktree.persistCreationFailure(URI.parse(params.session), sessionId, failureDiagnostic);
      } catch (err) {
        this._logService.warn(`[AgentService] failed to persist worktree creation failure for ${params.session}: ${toErrorMessage(err)}`);
      }
      this._stateManager.dispatchServerAction(params.chat, {
        type: ActionType.ChatResponsePart,
        turnId: params.turnId,
        part: buildWorktreeFailureNotification(failureDiagnostic)
      });
      return void 0;
    }
    const announcement = worktree.takePendingAnnouncement(sessionId);
    if (announcement !== void 0) {
      this._stateManager.dispatchServerAction(params.chat, {
        type: ActionType.ChatResponsePart,
        turnId: params.turnId,
        part: { kind: ResponsePartKind.Markdown, id: generateUuid(), content: announcement }
      });
    }
    return resolvedWorktree;
  }
  registerProvider(provider) {
    if (this._providers.has(provider.id)) {
      throw new Error(`Agent provider already registered: ${provider.id}`);
    }
    this._logService.info(`Registering agent provider: ${provider.id}`);
    this._providers.set(provider.id, provider);
    provider.setServerToolHost?.(this._serverToolHost);
    void this._authService.replay(provider);
    this._providerSubscriptions.add(provider.onDidChatProgress((signal) => this._sequenceSpawnedChat(signal)));
    this._providerSubscriptions.add(this._sideEffects.registerProgressListener(provider));
    this._providerSubscriptions.add(provider.onDidMaterializeChat((e) => this._onDidMaterializeChat(e)));
    this._providerSubscriptions.add(provider.onDidDiscoverChats((chats) => {
      void this._registerDiscoveredChats(provider, chats).catch((err) => this._logService.warn(`[AgentService] registering discovered chats for provider ${provider.id} failed`, err));
    }));
    if (provider.onMcpNotification) {
      this._providerSubscriptions.add(provider.onMcpNotification((e) => this._onMcpNotification.fire(e)));
    }
    this._providerSubscriptions.add(provider.onDidChangeChatData((e) => this._onChatDataChanged(e)));
    this._providerSubscriptions.add(provider.onDidSpawnChat((e) => this._onChatSpawned(e)));
    this._registerSkillCompletionProvider();
    const initialMigration = this._ensureLegacyChatsMigrated(provider);
    this._initialProviderMigrations.set(provider.id, initialMigration);
    void initialMigration.catch((err) => this._logService.warn(`[AgentService] registry migration: failed for late-registered provider ${provider.id}`, err));
    if (!this._defaultProvider) {
      this._defaultProvider = provider.id;
    }
    this._updateAgents();
  }
  _registerSkillCompletionProvider() {
    if (this._skillCompletionProviderRegistered) {
      return;
    }
    this._skillCompletionProviderRegistered = true;
    const provider = this._register(new AgentHostSkillCompletionProvider(
      (session) => this._findProviderForSession(session),
      (session) => this._hostCustomizations(URI.isUri(session) ? session : URI.parse(session))
    ));
    this._register(this._completions.registerProvider(provider));
  }
  // ---- auth ---------------------------------------------------------------
  async authenticate(params) {
    return this._authService.authenticate(params, this._providers.values());
  }
  getAuthToken(request) {
    return this._authService.getAuthToken(request);
  }
  // ---- Changeset operation handlers --------------------------------------
  async invokeChangesetOperation(params) {
    return this._changesetOperationService.invokeChangesetOperation(params);
  }
  // ---- MCP `mcp://` channel routing --------------------------------------
  async handleMcpRequest(channel, method, params) {
    const route = parseMcpChannelUri(channel);
    if (!route) {
      throw new Error(`Method not found: invalid mcp:// channel ${channel}`);
    }
    const provider = this._providers.get(route.providerId);
    if (!provider || !provider.handleMcpRequest) {
      throw new Error(`Method not found: no provider for mcp:// channel ${channel}`);
    }
    const sessionUri = AgentSession.uri(route.providerId, route.sessionId);
    return provider.handleMcpRequest(sessionUri, route.serverName, method, params);
  }
  // ---- session management -------------------------------------------------
  /**
   * Builds the dependency surface the session server-tool group needs, bound
   * to this service so the group stays decoupled from the concrete host.
   */
  _createSessionServerToolAccessor() {
    return {
      isActiveAgentTitleGenerationEnabled: () => this._isActiveAgentTitleGenerationEnabled(),
      listSessions: () => this.listSessions(),
      createSession: (config) => this.createSession(config),
      getModels: () => {
        const models = [];
        for (const provider of this._providers.values()) {
          models.push(...provider.models.get());
        }
        return models;
      },
      getCreationDefaults: (source) => this._getServerToolCreationDefaults(source),
      startPrompt: (session, chat, prompt) => this._startSessionPrompt(session, chat, prompt),
      createChat: (session, chat, options) => this.createChat(session, chat, options?.title !== void 0 || options?.model !== void 0 ? { ...options.title !== void 0 ? { title: options.title } : {}, ...options.model !== void 0 ? { model: options.model } : {} } : void 0),
      renameChat: (session, chat, title) => this._renameChatFromTool(session, chat, title),
      deleteSession: (session) => this.disposeSession(session),
      getChatContext: (session, chatId) => this._getChatContext(session, chatId),
      // Reads the `create_session` spawn depth from a session's `_meta` (0 when absent).
      getSessionSpawnDepth: (session) => readSessionSpawnDepth(this._stateManager.getSessionSummary(session.toString())?._meta),
      // Stamps a session's `create_session` spawn depth into its `_meta` (merging existing keys).
      setSessionSpawnDepth: (session, depth) => this._stateManager.dispatchServerAction(session.toString(), {
        type: ActionType.SessionMetaChanged,
        _meta: withSessionSpawnDepth(this._stateManager.getSessionSummary(session.toString())?._meta, depth)
      })
    };
  }
  _isActiveAgentTitleGenerationEnabled() {
    return this._configurationService.getRootValue(platformRootSchema, AgentHostActiveAgentTitleGenerationConfigKey) === true;
  }
  _getServerToolCreationDefaults(source) {
    const session = this._stateManager.getSessionState(source.toString());
    if (!session) {
      return void 0;
    }
    const model = session.activeTurn ? session.activeTurn.message.model : session.draft ? session.draft.model : session.turns.at(-1)?.message.model;
    const config = this._providers.get(session.provider)?.getInheritedChatConfig(session.config?.values ?? {});
    return {
      provider: session.provider,
      ...model !== void 0 ? { model } : {},
      ...config !== void 0 ? { config } : {}
    };
  }
  /**
   * Starts the first turn on a freshly-created session by dispatching a
   * `ChatTurnStarted` and routing it through the same side-effects path a
   * client-initiated turn takes (which sends the message to the provider).
   */
  async _startSessionPrompt(session, chat, prompt) {
    const message = { text: prompt, origin: { kind: MessageKind.User } };
    const action = { type: ActionType.ChatTurnStarted, turnId: generateUuid(), startedAt: (/* @__PURE__ */ new Date()).toISOString(), message };
    this._stateManager.dispatchServerAction(chat.toString(), action);
    this._sideEffects.handleAction(chat.toString(), action);
  }
  /**
   * Reads a point-in-time snapshot of a session's chat conversation for the
   * `get_session_context` server tool. Targets the session's default chat, or a
   * specific peer chat when `chatId` is provided. Returns `undefined` when no
   * live conversation state exists (e.g. a cold/unsubscribed session).
   */
  async _getChatContext(session, chatId) {
    const chatState = chatId ? await this._stateManager.resolveChatState(buildChatUri(session.toString(), chatId)) : this._stateManager.getDefaultChatState(session.toString());
    if (!chatState) {
      return void 0;
    }
    return {
      turns: chatState.turns,
      ...chatState.activeTurn ? { activeTurn: { message: chatState.activeTurn.message, responseParts: chatState.activeTurn.responseParts } } : {},
      hasMoreHistory: !!chatState.turnsNextCursor
    };
  }
  async _renameChatFromTool(session, chat, title) {
    validateRenameTitle(title, SessionServerToolName.RenameChat);
    const isDefaultChat = isDefaultChatUri(chat.toString());
    if (isDefaultChat && await this._isOnlySessionChat(session)) {
      await persistSessionMetadataValues(this._sessionDataService, session.toString(), {
        [SESSION_CUSTOM_TITLE_KEY]: title,
        [SESSION_CUSTOM_TITLE_SOURCE_KEY]: AGENT_HOST_TITLE_SOURCE_AGENT
      });
      if (this._stateManager.getSessionState(session.toString())?.title !== title) {
        this._stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionTitleChanged, title });
      }
      this._sideEffects.markTitleRenamed(session.toString());
      return { title };
    }
    if (!isDefaultChat && !await this._peerChatExists(session, chat)) {
      throw new Error(`Invalid ${SessionServerToolName.RenameChat} input: chat must match a known non-default chat.`);
    }
    await persistSessionMetadataValues(this._sessionDataService, session.toString(), {
      [customChatTitleMetadataKey(chat.toString())]: title,
      [customChatTitleSourceMetadataKey(chat.toString())]: AGENT_HOST_TITLE_SOURCE_AGENT
    });
    if (this._stateManager.getSessionState(session.toString())) {
      this._stateManager.updateChatTitle(session.toString(), chat.toString(), title);
    }
    this._sideEffects.markTitleRenamed(session.toString(), chat.toString());
    return { title };
  }
  async _isOnlySessionChat(session) {
    const state = this._stateManager.getSessionState(session.toString());
    if (state) {
      return state.chats.length === 1;
    }
    const persisted = await this._readPersistedPeerChatCatalog(session);
    return persisted?.length === 0;
  }
  async _peerChatExists(session, chat) {
    if (this._stateManager.getSessionState(session.toString())?.chats.some((candidate) => candidate.resource === chat.toString())) {
      return true;
    }
    const persisted = await this._readPersistedPeerChatCatalog(session);
    return persisted?.some((candidate) => candidate.uri === chat.toString()) === true;
  }
  _toSessionMetadata(metadata) {
    const { chat, ...rest } = metadata;
    return {
      ...rest,
      session: URI.parse(parseRequiredSessionUriFromChatUri(chat))
    };
  }
  /** `undefined` means the provider cannot enumerate its native chats yet. */
  async _enumerateLegacyProviderSessions(provider) {
    const chats = await provider.listChatsToMigrate();
    return chats?.map((metadata) => this._toSessionMetadata(metadata));
  }
  /**
   * Registry metadata for one session. Returns `undefined` when the agent
   * cannot describe the session yet; {@link listSessions} still overlays
   * active provisional sessions from state-manager data.
   */
  async _registeredSessionMetadata(agent, session, external) {
    const chat = URI.parse(buildDefaultChatUri(session));
    const metadata = await agent.getChatMetadata(chat, this._chatContext(session, chat), await this._readDefaultChatProviderData(session));
    if (!metadata) {
      return void 0;
    }
    const sessionMetadata = this._toSessionMetadata(metadata);
    return {
      ...sessionMetadata,
      _meta: withSessionExternal(sessionMetadata._meta, external)
    };
  }
  /**
   * Awaits legacy migration started at provider registration. Provider-owned
   * discovery is independent and surfaces unknown chats additively.
   */
  async _awaitInitialProviderMigration() {
    const providers = [...this._providers.values()];
    const results = await Promise.allSettled(providers.map((provider) => this._initialProviderMigrations.get(provider.id) ?? Promise.resolve()));
    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      if (result.status === "rejected") {
        this._logService.warn(`[AgentService] initial provider catalogs: provider ${providers[index].id} failed and will be retried on the next signal`, result.reason);
      }
    }
  }
  /**
   * Runs one provider discovery at most once concurrently, sharing the
   * in-flight attempt across callers and clearing it on settle so failures
   * retry on the next trigger. `force` requests a fresh pass after an
   * provider catalog trigger.
   *
   * A `force` request that arrives while a sweep — forced or not, freshly
   * started or already chained — is already in-flight is never dropped: it
   * is chained to run again immediately after the in-flight attempt settles
   * (regardless of whether that attempt succeeded or failed), so the
   * provider's on-disk set is re-read fresh instead of silently reusing a
   * sweep that may predate the change the `force` caller is reacting to.
   * `forceQueued` tracks only whether a follow-up is currently queued on the
   * entry — never whether the entry's own in-flight attempt happened to be
   * invoked with `force` — so a freshly-created entry always starts with
   * `forceQueued: false` even when its own first attempt is itself forced.
   * `forceQueued` is reset the moment a chained attempt actually *starts*
   * running (not merely once it is scheduled), so a second `force` that
   * arrives while a chained (or freshly-forced) attempt is still in flight
   * is likewise chained onto a further follow-up rather than being
   * coalesced away as a supposed duplicate.
   */
  _ensureLegacyChatsMigrated(provider, force = false) {
    return this._ensureProviderCatalog(provider, this._providerMigrations, force, (runForce) => this._migrateLegacyProviderChats(provider, runForce));
  }
  _ensureProviderCatalog(provider, states, force, run) {
    const existing = states.get(provider.id);
    if (existing) {
      if (force && !existing.forceQueued) {
        existing.forceQueued = true;
        const chained = existing.promise.catch(() => {
        }).then(() => {
          existing.forceQueued = false;
          return run(true);
        });
        existing.promise = chained;
        this._armProviderCatalogCleanup(provider, states, existing, chained);
      }
      return existing.promise;
    }
    const state = { promise: Promise.resolve(), forceQueued: false };
    const attempt = run(force);
    state.promise = attempt;
    states.set(provider.id, state);
    this._armProviderCatalogCleanup(provider, states, state, attempt);
    return attempt;
  }
  /**
   * Clears `provider`'s in-flight discovery entry once `promise` (the entry's
   * current attempt) settles, but only if the entry still points at that
   * exact promise — a `force` chain may have replaced it with a follow-up
   * attempt in the meantime, which arms its own cleanup in turn.
   */
  _armProviderCatalogCleanup(provider, states, state, promise) {
    const clear = () => {
      if (state.promise === promise && states.get(provider.id) === state) {
        states.delete(provider.id);
      }
    };
    void promise.then(clear, clear);
  }
  /**
   * Additively discovers one provider's native top-level chats. Internal chat backings are
   * filtered out, subagent sessions are filtered out, and explicitly-deleted
   * sessions are never resurrected: registration goes through
   * {@link AgentSessionRegistry.register}, which atomically declines to
   * (re-)register a session that is (or concurrently becomes)
   * tombstoned, rather than trusting a separate up-front tombstone check that
   * could race a concurrent {@link disposeSession}.
   *
   * `undefined` from the provider means it cannot enumerate yet (its SDK may
   * not be downloaded/started) — not an authoritative empty result — so its
   * next readiness signal retries.
   */
  async _registerDiscoveredChats(provider, chats) {
    const existing = new Map((await this._listRegisteredSessions()).map((session) => [session.session.toString(), session.external]));
    const discoveryLimiter = new Limiter(4);
    const results = await Promise.all(chats.map(({ external, ...metadata }) => discoveryLimiter.queue(async () => {
      const sessionMetadata = this._toSessionMetadata(metadata);
      const session = sessionMetadata.session;
      try {
        if (isSubagentSession(session.toString()) || await this._isChatBacking(session)) {
          return false;
        }
        const identity = { session, provider: provider.id, startTime: metadata.startTime, external, source: external ? "discovery" : "restore" };
        const registered = await this._retryRegistryMutation(
          () => this._sessionRegistry.register(session, identity, { checkTombstone: true }),
          `discovery registration for ${session.toString()}`
        );
        if (registered) {
          if (external && existing.get(session.toString()) !== true) {
            await this._initializeExternalSessionReadState(session);
          }
          existing.set(session.toString(), external);
          await this._announceSurfacedSession({ ...sessionMetadata, _meta: withSessionExternal(sessionMetadata._meta, external) }, provider.id);
        }
        return registered;
      } catch (err) {
        this._logService.warn(`[AgentService] Failed to register discovered chat ${session.toString()} for provider ${provider.id}`, err);
        return false;
      }
    })));
    return results.some((changed) => changed);
  }
  async _migrateLegacyProviderChats(provider, force = false) {
    if (!force) {
      if (await this._sessionRegistry.isProviderBackfilled(provider.id)) {
        return;
      }
      if (await this._sessionRegistry.isBackfilled()) {
        await this._sessionRegistry.markProviderBackfilled(provider.id);
        return;
      }
    }
    const sessions = await this._enumerateLegacyProviderSessions(provider);
    if (sessions === void 0) {
      return;
    }
    const existing = new Map((await this._listRegisteredSessions()).map((session) => [session.session.toString(), session.external]));
    const migrationLimiter = new Limiter(4);
    const identities = await Promise.all(sessions.map((s) => migrationLimiter.queue(async () => {
      if (isSubagentSession(s.session.toString()) || await this._isChatBacking(s.session)) {
        return void 0;
      }
      const external = await this._isExternalProviderChat(s.session);
      return { session: s.session, provider: provider.id, startTime: s.startTime, external, source: external ? "discovery" : "restore" };
    })));
    for (let index = 0; index < identities.length; index++) {
      const identity = identities[index];
      if (!identity) {
        continue;
      }
      const registered = await this._sessionRegistry.register(identity.session, identity, { checkTombstone: true });
      if (registered) {
        const metadata = sessions[index];
        if (identity.external && existing.get(identity.session.toString()) !== true) {
          await this._initializeExternalSessionReadState(identity.session);
        }
        existing.set(identity.session.toString(), identity.external);
        await this._announceSurfacedSession({ ...metadata, _meta: withSessionExternal(metadata._meta, identity.external) }, provider.id);
      }
    }
    await this._sessionRegistry.markProviderBackfilled(provider.id);
  }
  async _initializeExternalSessionReadState(session) {
    const ref = this._sessionDataService.openDatabase(session);
    try {
      await ref.object.setMetadata(AH_META_IS_READ_DB_KEY, "true");
    } finally {
      ref.dispose();
    }
  }
  async _isExternalProviderChat(session) {
    const ref = await this._sessionDataService.tryOpenDatabase(session);
    if (!ref) {
      return true;
    }
    try {
      return await ref.object.getMetadata(AH_META_WORKSPACELESS_DB_KEY) === void 0;
    } finally {
      ref.dispose();
    }
  }
  async _migrateRegisteredSession(entry) {
    if (entry.external !== void 0) {
      return void 0;
    }
    const external = await this._isExternalProviderChat(entry.session);
    return {
      ...entry,
      external,
      source: external ? "discovery" : entry.source
    };
  }
  _listRegisteredSessions() {
    return this._sessionRegistry.list((entry) => this._migrateRegisteredSession(entry));
  }
  async _retryRegistryMutation(operation, description) {
    try {
      return await operation();
    } catch (err) {
      this._logService.warn(`[AgentService] Retrying failed session registry ${description}`, err);
      return operation();
    }
  }
  /**
   * Whether a session is marked as an internal chat backing, either durably
   * (its own metadata) or in-process (its durable marker write kept failing
   * in `createChat`; see `_unpersistedChatBackings`).
   */
  async _isChatBacking(session) {
    if (this._unpersistedChatBackings.has(session.toString())) {
      return true;
    }
    try {
      const ref = await this._sessionDataService.tryOpenDatabase(session);
      if (!ref) {
        return false;
      }
      try {
        return !!await ref.object.getMetadata(CHAT_BACKING_METADATA_KEY);
      } finally {
        ref.dispose();
      }
    } catch {
      return false;
    }
  }
  async listSessions(mode = this._getExternalSessionsMode()) {
    this._logService.trace("[AgentService] listSessions called");
    await this._awaitInitialProviderMigration();
    const registered = await this._listRegisteredSessions();
    const metadataLimiter = new Limiter(4);
    const results = await Promise.all(registered.map((registeredSession) => metadataLimiter.queue(async () => {
      const { session, provider, external } = registeredSession;
      if (this._stateManager.isIdleProvisionalSession(session.toString())) {
        return void 0;
      }
      const agent = this._providers.get(provider);
      if (!agent) {
        return void 0;
      }
      try {
        return await this._registeredSessionMetadata(agent, session, external);
      } catch (err) {
        this._logService.warn(`[AgentService] listSessions: failed to read metadata for ${session}`, err);
        return void 0;
      }
    })));
    const flat = results.filter((s) => s !== void 0);
    const overlayLimiter = new Limiter(4);
    const overlaid = await Promise.all(flat.map((s) => overlayLimiter.queue(async () => {
      const sanitized = { ...s, _meta: withSessionMultiRootMetadata(s._meta, void 0) };
      if (this._unpersistedChatBackings.has(s.session.toString())) {
        return void 0;
      }
      try {
        const ref = await this._sessionDataService.tryOpenDatabase(s.session);
        if (!ref) {
          return sanitized;
        }
        try {
          const sessionStr = s.session.toString();
          const changesetKeys = this._changesetCoordinator.getListMetadataKeys(sessionStr);
          const metadataKeys = changesetKeys ? { customTitle: true, [AH_META_IS_READ_DB_KEY]: true, [AH_META_IS_ARCHIVED_DB_KEY]: true, [AH_META_IS_DONE_DB_KEY]: true, [AH_META_WORKSPACELESS_DB_KEY]: true, [SESSION_META_MULTI_ROOT_KEY]: true, [CHAT_BACKING_METADATA_KEY]: true, [WORKTREE_META_REPOSITORY_ROOT]: true, ...GIT_DB_METADATA_KEYS, ...changesetKeys } : { customTitle: true, [AH_META_IS_READ_DB_KEY]: true, [AH_META_IS_ARCHIVED_DB_KEY]: true, [AH_META_IS_DONE_DB_KEY]: true, [AH_META_WORKSPACELESS_DB_KEY]: true, [SESSION_META_MULTI_ROOT_KEY]: true, [CHAT_BACKING_METADATA_KEY]: true, [WORKTREE_META_REPOSITORY_ROOT]: true, ...GIT_DB_METADATA_KEYS };
          const m = await ref.object.getMetadataObject(metadataKeys);
          if (m[CHAT_BACKING_METADATA_KEY]) {
            return void 0;
          }
          let updated = sanitized;
          if (m.customTitle) {
            updated = { ...updated, summary: m.customTitle };
          }
          if (m[AH_META_IS_READ_DB_KEY] !== void 0) {
            updated = { ...updated, status: withSessionStatusFlag(updated.status ?? SessionStatus.Idle, SessionStatus.IsRead, m[AH_META_IS_READ_DB_KEY] === "true") };
          }
          const persistedArchived = m[AH_META_IS_ARCHIVED_DB_KEY] ?? m[AH_META_IS_DONE_DB_KEY];
          if (persistedArchived !== void 0) {
            updated = { ...updated, status: withSessionStatusFlag(updated.status ?? SessionStatus.Idle, SessionStatus.IsArchived, persistedArchived === "true") };
          }
          if (m[META_GIT_STATE]) {
            try {
              const gitState = JSON.parse(m[META_GIT_STATE]);
              updated = { ...updated, _meta: withSessionGitState(updated._meta, gitState) };
            } catch (e) {
              this._logService.warn(`[AgentService][listSessions] Failed to parse Git state for ${s.session}`, e);
            }
          }
          if (m[META_GITHUB_STATE]) {
            try {
              const gitHubState = JSON.parse(m[META_GITHUB_STATE]);
              updated = { ...updated, _meta: withSessionGitHubState(updated._meta, gitHubState) };
            } catch (e) {
              this._logService.warn(`[AgentService][listSessions] Failed to parse GitHub state for ${s.session}`, e);
            }
          }
          if (m[META_SOURCE_CONTROL_STATE]) {
            try {
              const sourceControlState = parsePersistedSourceControlState(m[META_SOURCE_CONTROL_STATE]);
              updated = { ...updated, _meta: withSessionSourceControlState(updated._meta, sourceControlState) };
            } catch (e) {
              this._logService.warn(`[AgentService][listSessions] Failed to parse source-control state for ${s.session}`, e);
            }
          }
          if (m[AH_META_WORKSPACELESS_DB_KEY] !== void 0) {
            updated = { ...updated, _meta: withSessionWorkspaceless(updated._meta, m[AH_META_WORKSPACELESS_DB_KEY] === "true") };
          }
          const multiRoot = parseSessionMultiRootMetadata(m[SESSION_META_MULTI_ROOT_KEY]);
          if (multiRoot) {
            updated = { ...updated, _meta: withSessionMultiRootMetadata(updated._meta, multiRoot) };
          }
          const worktreeProject = worktreeProjectFromRepositoryRoot(m[WORKTREE_META_REPOSITORY_ROOT]);
          if (worktreeProject) {
            updated = { ...updated, project: worktreeProject };
          }
          return this._changesetCoordinator.decorateListEntry(updated, m);
        } finally {
          ref.dispose();
        }
      } catch (e) {
        this._logService.warn(`[AgentService] Failed to read session metadata overlay for ${s.session}`, e);
      }
      return sanitized;
    })));
    const result = overlaid.filter((s) => s !== void 0);
    const withStatus = result.map((s) => {
      const liveSummary = this._stateManager.getSessionSummary(s.session.toString());
      if (liveSummary) {
        let _meta = liveSummary._meta !== void 0 || s._meta !== void 0 ? { ...s._meta, ...liveSummary._meta } : void 0;
        _meta = withSessionMultiRootMetadata(_meta, readSessionMultiRootMetadata(liveSummary._meta) ?? readSessionMultiRootMetadata(s._meta));
        const liveWorkingDirs = liveSummary.workingDirectories;
        return {
          ...s,
          summary: liveSummary.title || s.summary,
          // Supersedes the flags folded in above: the state manager seeded
          // them from the same database on restore and has applied every
          // mutation since.
          status: liveSummary.status,
          activity: liveSummary.activity,
          modifiedTime: Date.parse(liveSummary.modifiedAt),
          project: liveSummary.project ? { uri: URI.parse(liveSummary.project.uri), displayName: liveSummary.project.displayName } : s.project,
          workingDirectories: liveWorkingDirs !== void 0 ? liveWorkingDirs.map((d) => URI.parse(d)) : s.workingDirectories,
          changes: liveSummary.changes ?? s.changes,
          changesets: this._stateManager.getSessionState(s.session.toString())?.changesets ?? s.changesets,
          ..._meta !== void 0 ? { _meta } : {}
        };
      }
      return s;
    });
    const known = new Set(withStatus.map((s) => s.session.toString()));
    const additions = [];
    for (const summary of this._stateManager.getOverlaySessionSummaries()) {
      if (known.has(summary.resource)) {
        continue;
      }
      if (isSubagentSession(summary.resource)) {
        continue;
      }
      const summaryWorkingDirs = summary.workingDirectories;
      additions.push({
        session: URI.parse(summary.resource),
        startTime: Date.parse(summary.createdAt),
        modifiedTime: Date.parse(summary.modifiedAt),
        summary: summary.title,
        status: summary.status,
        activity: summary.activity,
        workingDirectories: summaryWorkingDirs?.map((d) => URI.parse(d)),
        ...summary.project ? { project: { uri: URI.parse(summary.project.uri), displayName: summary.project.displayName } } : {},
        changes: summary.changes,
        // This overlay path never opens the session database (unlike the
        // provider-returned sessions handled above), so carry the
        // in-memory `summary._meta` directly. It holds the live state
        // (e.g. the GitHub state published when a PR is created), so a
        // freshly-created session that the provider transiently omits
        // still reports it here.
        ...summary._meta !== void 0 ? { _meta: summary._meta } : {}
      });
    }
    const combined = additions.length > 0 ? [...withStatus, ...additions] : withStatus;
    const visible = combined.filter((session) => this._shouldIncludeSession(session, mode));
    this._logService.trace(`[AgentService] listSessions returned ${visible.length} sessions (${additions.length} state-manager fallback)`);
    return visible;
  }
  _getExternalSessionsMode() {
    return this._configurationService.getRootValue(platformRootSchema, AgentHostShowExternalSessionsConfigKey) ?? AgentHostExternalSessionsMode.Last7Days;
  }
  _shouldIncludeSession(session, mode = this._getExternalSessionsMode()) {
    if (readSessionEhcliAdoptable(session._meta) && !this._isMigrateLegacyEnabled()) {
      return false;
    }
    if (!readSessionExternal(session._meta) || readSessionEhcliAdoptable(session._meta) || this._stateManager.getSessionState(session.session.toString())) {
      return true;
    }
    switch (mode) {
      case AgentHostExternalSessionsMode.All:
        return true;
      case AgentHostExternalSessionsMode.Last24Hours:
        return session.modifiedTime >= this._now() - 24 * 60 * 60 * 1e3;
      case AgentHostExternalSessionsMode.Last7Days:
        return session.modifiedTime >= this._now() - 7 * 24 * 60 * 60 * 1e3;
      case AgentHostExternalSessionsMode.None:
        return false;
    }
  }
  /**
   * Stage-1 validation surface for the session URIs currently held by the
   * orchestrator-owned {@link AgentSessionRegistry}.
   */
  async getRegisteredSessions() {
    return (await this._listRegisteredSessions()).map((s) => s.session);
  }
  /** Test surface for the durable per-provider discovery marker. */
  async isProviderRegistryBackfilled(provider) {
    return this._sessionRegistry.isProviderBackfilled(provider);
  }
  /**
   * Test surface for the legacy global backfill marker. Never written by the
   * per-provider discovery — see the removal of automatic mirroring in
   * {@link AgentSessionRegistry}'s class doc comment.
   */
  async isLegacyRegistryBackfilled() {
    return this._sessionRegistry.isBackfilled();
  }
  _isMigrateLegacyEnabled() {
    return this._configurationService.getRootValue(platformRootSchema, AgentHostMigrateLegacyCopilotCliEnabledConfigKey) === true;
  }
  /** Retracts un-opened adoptable-legacy entries when migration is turned off (deletes no data). */
  _onMigrateLegacySettingChanged() {
    const enabled = this._isMigrateLegacyEnabled();
    if (enabled === this._lastMigrateLegacyEnabled) {
      return;
    }
    this._lastMigrateLegacyEnabled = enabled;
    if (enabled) {
      return;
    }
    for (const key of [...this._announcedSurfacedKeys]) {
      if (this._stateManager.getSessionState(key)) {
        continue;
      }
      if (!readSessionEhcliAdoptable(this._stateManager.getSurfacedSessionSummary(key)?._meta)) {
        continue;
      }
      this._announcedSurfacedKeys.delete(key);
      this._broadcastExternalSessions.delete(key);
      this._stateManager.retractSurfacedSession(key);
    }
  }
  _queueSessionListReconciliation(previousMode) {
    this._sessionListReconciliation = this._sessionListReconciliation.then(() => this._reconcileExternalSessions(previousMode)).catch((error) => this._logService.warn("[AgentService] External session reconciliation failed", error));
  }
  async _reconcileExternalSessions(previousMode) {
    const previouslyBroadcast = new Set(this._broadcastExternalSessions);
    if (previousMode !== void 0) {
      for (const session of await this.listSessions(previousMode)) {
        if (readSessionExternal(session._meta)) {
          previouslyBroadcast.add(session.session.toString());
        }
      }
    }
    const listed = await this.listSessions();
    const visible = /* @__PURE__ */ new Set();
    for (const metadata of listed) {
      if (!readSessionExternal(metadata._meta)) {
        continue;
      }
      const key = metadata.session.toString();
      visible.add(key);
      if (!previouslyBroadcast.has(key) && !this._stateManager.getSessionState(key)) {
        const provider = AgentSession.provider(metadata.session);
        if (provider) {
          await this._announceSurfacedSession(metadata, provider);
        }
      }
    }
    for (const key of previouslyBroadcast) {
      if (!visible.has(key) && !this._stateManager.getSessionState(key)) {
        this._stateManager.retractSurfacedSession(key);
        this._announcedSurfacedKeys.delete(key);
      }
    }
    this._broadcastExternalSessions.clear();
    for (const key of visible) {
      this._broadcastExternalSessions.add(key);
    }
  }
  async _announceSurfacedSession(meta, provider) {
    const key = meta.session.toString();
    if (!this._shouldIncludeSession(meta) || this._announcedSurfacedKeys.has(key) || this._stateManager.getSessionState(key)) {
      return;
    }
    this._announcedSurfacedKeys.add(key);
    try {
      if (await this._sessionRegistry.isTombstoned(meta.session)) {
        this._announcedSurfacedKeys.delete(key);
        return;
      }
      if (!this._shouldIncludeSession(meta)) {
        this._announcedSurfacedKeys.delete(key);
        return;
      }
      this._stateManager.announceSurfacedSession(this._surfacedSessionSummary(meta, provider));
      if (readSessionExternal(meta._meta)) {
        this._broadcastExternalSessions.add(key);
      }
    } catch (err) {
      this._announcedSurfacedKeys.delete(key);
      throw err;
    }
  }
  /** Synthesizes the minimal {@link SessionSummary} for a provider session surfaced outside the normal list response. */
  _surfacedSessionSummary(meta, provider) {
    return {
      resource: meta.session.toString(),
      provider,
      title: meta.summary ?? "",
      // Surfaced legacy sessions predate agent-host read ownership, which has
      // no per-session read flag for them yet. Default them to read: the
      // client trusts the provider's read state once it owns it, so an
      // unflagged summary would otherwise flip every previously-seen session
      // to unread the moment migration is turned on.
      status: withSessionStatusFlag(meta.status ?? SessionStatus.Idle, SessionStatus.IsRead, true),
      createdAt: new Date(meta.startTime).toISOString(),
      modifiedAt: new Date(meta.modifiedTime).toISOString(),
      ...meta.project ? { project: { uri: meta.project.uri.toString(), displayName: meta.project.displayName } } : {},
      workingDirectories: meta.workingDirectories?.map((d) => d.toString()),
      _meta: meta._meta
    };
  }
  async createSession(config) {
    const providerId = config?.provider ?? this._defaultProvider;
    const provider = providerId ? this._providers.get(providerId) : void 0;
    if (!provider) {
      throw new Error(`No agent provider registered for: ${providerId ?? "(none)"}`);
    }
    if (config?.session) {
      this._cancelPendingSessionGc(config.session);
      this._cancelPendingSessionRelease(config.session);
    }
    if (config?.workingDirectories && config.workingDirectories.length > 1) {
      const supportsMultiple = !!provider.getDescriptor().capabilities?.multipleWorkingDirectories;
      if (!supportsMultiple) {
        this._logService.warn(`[AgentService] Provider '${providerId}' does not advertise multipleWorkingDirectories; truncating ${config.workingDirectories.length} working directories to 1.`);
        config = { ...config, workingDirectories: [config.workingDirectories[0]] };
      }
    }
    if (config?.fork) {
      const sourceState = this._stateManager.getSessionState(config.fork.session.toString());
      const sourceTurns = sourceState?.turns.slice(0, config.fork.turnIndex + 1) ?? [];
      if (sourceTurns.length === 0) {
        config = { ...config, fork: void 0 };
      } else {
        const turnIdMapping = /* @__PURE__ */ new Map();
        for (const t of sourceTurns) {
          turnIdMapping.set(t.id, generateUuid());
        }
        const concreteForkTurnId = this._localTurns.resolveConcreteTurnId(buildDefaultChatUri(config.fork.session).toString(), config.fork.turnId);
        config = {
          ...config,
          fork: {
            ...config.fork,
            chat: URI.parse(buildDefaultChatUri(config.fork.session)),
            turnIdMapping,
            ...concreteForkTurnId !== void 0 ? { turnId: concreteForkTurnId } : {}
          }
        };
      }
    }
    if (config?.importConversation) {
      const importedTurns = config.importConversation.turns.map((t) => ({ ...t, id: generateUuid() }));
      config = { ...config, importConversation: { ...config.importConversation, turns: importedTurns } };
    }
    const initializeSideEffects = this._sideEffects.initialize();
    const sessionConfig = await this._resolveCreatedSessionConfig(provider, config);
    const deferWorktreeCreation = sessionConfig?.values?.[SessionConfigKey.Isolation] === "worktree" && !config?.fork && !config?.importConversation;
    this._logService.trace(`[AgentService] createSession: initializing auto-approver and creating session...`);
    const [, created] = await Promise.all([
      initializeSideEffects,
      this._createProviderSession(provider, config, deferWorktreeCreation)
    ]);
    const session = created.session;
    this._logService.trace(`[AgentService] createSession: initialization complete`);
    try {
      await this._retryRegistryMutation(
        () => this._sessionRegistry.register(session, { provider: provider.id, startTime: Date.now(), source: "explicit" }, { checkTombstone: false }),
        `registration for ${session.toString()}`
      );
    } catch (err) {
      await this._rollbackProviderSession(provider, session);
      throw err;
    }
    this._cancelPendingSessionGc(session);
    this._cancelPendingSessionRelease(session);
    this._logService.trace(`[AgentService] createSession: provider=${provider.id} model=${config?.model?.id ?? "(default)"}`);
    this._sessionToProvider.set(session.toString(), provider.id);
    if (config?.progressToken) {
      let sessions = this._downloadProgressInterest.get(provider.id);
      if (!sessions) {
        sessions = /* @__PURE__ */ new Set();
        this._downloadProgressInterest.set(provider.id, sessions);
      }
      sessions.add(session.toString());
    }
    this._logService.trace(`[AgentService] createSession returned: ${session.toString()}`);
    const provisionalState = created.provisional && !config?.fork && !config?.importConversation ? (() => {
      const summary = this._buildInitialSummary(provider, session, config, created, "");
      const state = this._stateManager.createSession(summary, { emitNotification: false });
      state.config = sessionConfig;
      state.activeClients = config?.activeClient ? [config.activeClient] : [];
      return state;
    })() : void 0;
    const defaultChat = URI.parse(buildDefaultChatUri(session));
    const initialCustomizations = await provider.getChatCustomizations(defaultChat, this._chatContext(session, defaultChat), this._hostCustomizations(session)).catch((err) => {
      this._logService.error("[AgentService] createSession: failed to resolve initial customizations", err);
      return void 0;
    });
    if (config?.fork) {
      const sourceState = this._stateManager.getSessionState(config.fork.session.toString());
      const sourceChatUri = buildDefaultChatUri(config.fork.session).toString();
      const newChatUri = buildDefaultChatUri(session).toString();
      let sourceTurns = [];
      if (sourceState && config.fork.turnIdMapping) {
        const originalSlice = sourceState.turns.slice(0, config.fork.turnIndex + 1);
        const mapping = config.fork.turnIdMapping;
        sourceTurns = originalSlice.map((t) => ({ ...t, id: mapping.get(t.id) ?? generateUuid() }));
        this._persistForkedLocalTurns(session.toString(), sourceChatUri, newChatUri, originalSlice, sourceTurns, mapping);
      }
      const forkedTitlePrefix = localize("agentHost.forkedTitlePrefix", "Forked: ");
      const sourceTitle = sourceState?.title;
      const forkedTitle = sourceTitle ? sourceTitle.startsWith(forkedTitlePrefix) ? sourceTitle : `${forkedTitlePrefix}${sourceTitle}` : localize("agentHost.forkedSessionFallback", "Forked Session");
      const summary = this._buildInitialSummary(provider, session, config, created, forkedTitle);
      const state = this._stateManager.createSession(summary);
      state.config = sessionConfig;
      this._stateManager.seedDefaultChatTurns(summary.resource, sourceTurns);
      state.activeClients = config.activeClient ? [config.activeClient] : [];
      if (sourceTurns.length > 0) {
        this._sideEffects.generateForkedTitle(summary.resource, void 0, sourceTurns, forkedTitle, sourceTitle);
      }
    } else if (config?.importConversation) {
      const importedTurns = [...config.importConversation.turns];
      const importedTitle = this._buildImportedTitle(importedTurns);
      const summary = this._buildInitialSummary(provider, session, config, created, importedTitle);
      const state = this._stateManager.createSession(summary);
      state.config = sessionConfig;
      this._stateManager.seedDefaultChatTurns(summary.resource, importedTurns);
      state.activeClients = config.activeClient ? [config.activeClient] : [];
      if (importedTurns.length > 0) {
        this._sideEffects.generateForkedTitle(summary.resource, void 0, importedTurns, importedTitle);
      }
    } else {
      const summary = this._buildInitialSummary(provider, session, config, created, "");
      const state = provisionalState ?? this._stateManager.createSession(summary, { emitNotification: true });
      if (!provisionalState) {
        state.config = sessionConfig;
        state.activeClients = config?.activeClient ? [config.activeClient] : [];
      }
    }
    if (initialCustomizations && initialCustomizations.length > 0) {
      this._stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionCustomizationsChanged, customizations: [...initialCustomizations] });
    }
    this._serverToolHost.advertise(session.toString());
    if (sessionConfig?.values && Object.keys(sessionConfig.values).length > 0 && !created.provisional) {
      this._persistConfigValues(session, sessionConfig.values);
    }
    this._changesetCoordinator.onSessionCreated(session.toString());
    if (!created.provisional) {
      this._persistWorkspaceless(session, readSessionWorkspaceless(this._stateManager.getSessionSummary(session.toString())?._meta));
      this._persistMultiRoot(session, readSessionMultiRootMetadata(this._stateManager.getSessionSummary(session.toString())?._meta));
      this._stateManager.dispatchServerAction(session.toString(), { type: ActionType.SessionReady });
      const gitHubState = readSessionGitHubState(this._stateManager.getSessionSummary(session.toString())?._meta);
      if (gitHubState) {
        await this._gitStateService.setSessionGitHubState(session.toString(), gitHubState);
      }
    }
    const workingDirectory = created.resolvedWorkingDirectory ?? config?.workingDirectories?.[0];
    void this._gitStateService.refreshSessionGitState(session.toString(), workingDirectory);
    return session;
  }
  async createChat(session, chat, options) {
    const sessionKey = session.toString();
    const provider = this._findProviderForSession(session);
    if (!provider) {
      throw new Error(`[AgentService] createChat: no provider for session ${sessionKey}`);
    }
    if (!this._supportsChats(provider)) {
      throw new Error(`[AgentService] createChat: provider ${provider.id} does not support multiple chats`);
    }
    let forkedTurns;
    let forkedTitle;
    let forkedSourceTitle;
    let createOptions = options;
    let peerChatOrigin;
    if (options?.sideChat) {
      const resolvedSideChat = await this._resolveSideChatOrigin(session, options.sideChat);
      peerChatOrigin = resolvedSideChat.origin;
      createOptions = {
        ...options,
        sideChat: {
          ...options.sideChat,
          source: URI.parse(resolvedSideChat.sourceChat),
          ...resolvedSideChat.providerAnchorTurnId ? { providerAnchorTurnId: resolvedSideChat.providerAnchorTurnId } : {},
          ...resolvedSideChat.sourceContext ? { sourceContext: resolvedSideChat.sourceContext } : {},
          ...resolvedSideChat.partialResponse ? { partialResponse: resolvedSideChat.partialResponse } : {}
        }
      };
    }
    if (options?.fork) {
      const { sourceChatKey, sourceSessionKey, sourceState } = await this._resolveSessionSourceChat(options.fork.source);
      if (this._stateManager.getChatOrigin(sourceChatKey)?.kind === ChatOriginKind.Tool) {
        throw new Error(`[AgentService] createChat: cannot fork provider-spawned chat ${sourceChatKey}`);
      }
      const sourceTurns = sourceState?.turns ?? [];
      const forkIndex = sourceTurns.findIndex((t) => t.id === options.fork.turnId);
      if (forkIndex < 0) {
        createOptions = { ...options, fork: void 0 };
      } else {
        const slice = sourceTurns.slice(0, forkIndex + 1);
        const turnIdMapping = /* @__PURE__ */ new Map();
        for (const t of slice) {
          turnIdMapping.set(t.id, generateUuid());
        }
        forkedTurns = slice.map((t) => ({ ...t, id: turnIdMapping.get(t.id) ?? generateUuid() }));
        peerChatOrigin = { kind: ChatOriginKind.Fork, chat: sourceChatKey, turnId: options.fork.turnId };
        this._persistForkedLocalTurns(sessionKey, sourceChatKey, chat.toString(), slice, forkedTurns, turnIdMapping);
        const forkedTitlePrefix = localize("agentHost.forkedTitlePrefix", "Forked: ");
        forkedSourceTitle = sourceState?.title || this._stateManager.getSessionState(sourceSessionKey)?.title;
        forkedTitle = forkedSourceTitle ? forkedSourceTitle.startsWith(forkedTitlePrefix) ? forkedSourceTitle : `${forkedTitlePrefix}${forkedSourceTitle}` : localize("agentHost.forkedChatFallback", "Forked Chat");
        const concreteForkTurnId = this._localTurns.resolveConcreteTurnId(sourceChatKey, options.fork.turnId);
        createOptions = {
          ...options,
          fork: {
            ...options.fork,
            source: URI.parse(sourceChatKey),
            turnIdMapping,
            ...concreteForkTurnId !== void 0 ? { turnId: concreteForkTurnId } : {}
          }
        };
      }
    }
    const createResult = await this._createChat(provider, chat, session, createOptions);
    const providerData = createResult?.providerData;
    try {
      await this._persistPeerChat(session, chat, providerData, peerChatOrigin);
    } catch (error) {
      try {
        await provider.chats.disposeChat(chat, this._chatContext(session, chat));
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], `Failed to persist and roll back chat ${chat.toString()}`);
      }
      throw error;
    }
    this._stateManager.addChat(sessionKey, chat.toString(), {
      ...forkedTitle !== void 0 ? { title: forkedTitle } : options?.title !== void 0 ? { title: options.title } : {},
      ...forkedTurns !== void 0 ? { turns: forkedTurns } : {},
      ...providerData !== void 0 ? { providerData } : {},
      ...peerChatOrigin !== void 0 ? { origin: peerChatOrigin } : {}
    });
    if (createResult?.backingSession) {
      await this._markChatBacking(createResult.backingSession, chat);
    }
    if (forkedTurns && forkedTurns.length > 0 && forkedTitle !== void 0) {
      this._sideEffects.generateForkedTitle(sessionKey, chat.toString(), forkedTurns, forkedTitle, forkedSourceTitle);
    }
  }
  /**
   * Validates a side chat's source and returns its {@link ChatOriginKind.SideChat}
   * origin. Throws when the source chat is not part of `session` or when the
   * referenced completed or active turn is absent.
   */
  async _resolveSideChatOrigin(session, sideChat) {
    const sessionKey = session.toString();
    const sourceKey = sideChat.source.toString();
    const { sourceChatKey, sourceSessionKey, sourceState } = await this._resolveSessionSourceChat(sideChat.source);
    if (sourceSessionKey !== sessionKey) {
      throw new Error(`[AgentService] createChat: side chat source ${sourceKey} does not belong to session ${sessionKey}`);
    }
    const activeTurn = sourceState?.activeTurn?.id === sideChat.turnId ? sourceState.activeTurn : void 0;
    const hasCompletedTurn = sourceState?.turns.some((t) => t.id === sideChat.turnId) ?? false;
    if (!hasCompletedTurn && !activeTurn) {
      throw new Error(`[AgentService] createChat: side chat source turn ${sideChat.turnId} not found in ${sourceKey}`);
    }
    const isLocalSourceTurn = !activeTurn && this._localTurns.isLocal(sourceChatKey, sideChat.turnId);
    const providerAnchorTurnId = isLocalSourceTurn ? this._localTurns.resolveConcreteTurnId(sourceChatKey, sideChat.turnId) : void 0;
    const partialResponse = getSideChatPartialResponse(activeTurn);
    const sourceContext = activeTurn || isLocalSourceTurn ? buildBoundedSideChatSourceContext(sourceState?.turns ?? [], sideChat.turnId, activeTurn) : void 0;
    const selection = sideChat.selection?.text.trim() ? sideChat.selection : sideChat.selection ? (() => {
      throw new Error("[AgentService] createChat: side chat selection text must be non-empty");
    })() : void 0;
    return {
      origin: {
        kind: ChatOriginKind.SideChat,
        chat: sourceChatKey,
        turnId: sideChat.turnId,
        ...selection ? { selection } : {}
      },
      sourceChat: sourceChatKey,
      ...selection ? { selection } : {},
      ...providerAnchorTurnId ? { providerAnchorTurnId } : {},
      ...sourceContext ? { sourceContext } : {},
      ...partialResponse ? { partialResponse } : {}
    };
  }
  async _resolveSessionSourceChat(source) {
    const sourceKey = source.toString();
    const sourceSessionKey = isAhpChatChannel(sourceKey) ? parseRequiredSessionUriFromChatUri(sourceKey) : sourceKey;
    const defaultChatKey = this._stateManager.getSessionState(sourceSessionKey)?.defaultChat ?? buildDefaultChatUri(sourceSessionKey);
    const isDefaultSource = sourceKey === sourceSessionKey || isDefaultChatUri(sourceKey);
    const sourceChatKey = isDefaultSource ? defaultChatKey : sourceKey;
    return {
      sourceSessionKey,
      sourceChatKey,
      sourceState: isDefaultSource ? this._stateManager.getChatState(defaultChatKey) ?? this._stateManager.getDefaultChatState(sourceSessionKey) : await this._stateManager.resolveChatState(sourceChatKey)
    };
  }
  async disposeChat(session, chat) {
    const sessionKey = session.toString();
    const chatKey = chat.toString();
    const provider = this._findProviderForSession(session);
    this._disposingPeerChats.add(chatKey);
    try {
      await this._checkpointService.discardChatTurnStartCheckpoints(session, chat);
      if (provider) {
        await this._disposeChat(provider, chat);
      }
      await this._removePersistedPeerChat(session, chat);
      this._sideEffects.clearQueuedMessageSenders(chatKey);
      this._sideEffects.cancelSubagentSessions(chatKey);
      this._sideEffects.clearChannelTelemetry(chatKey);
      this._stateManager.removeChat(sessionKey, chatKey);
    } finally {
      this._disposingPeerChats.delete(chatKey);
    }
  }
  // ---- Chat dispatch adapter ---------------------------------------------
  //
  // The orchestrator owns the feature-level `(session, chat)` →
  // `(agent, session, chat)` mapping. It dispatches against an agent's
  // chat-addressed surface ({@link IAgent.chats}) and session lifecycle
  // ({@link IAgent.createSession}/{@link IAgent.disposeSession}).
  /** Whether `provider` can host additional (peer) chats. */
  _supportsChats(provider) {
    return !!provider.getDescriptor().capabilities?.multipleChats;
  }
  _chatContext(session, chat) {
    return createAgentChatContext(this._stateManager, session, chat);
  }
  /**
   * Last host-published customization snapshot for the session, passed
   * explicitly to providers. `undefined` means "no snapshot yet", not "an
   * empty customization list".
   */
  _hostCustomizations(session) {
    return this._stateManager.getSessionState(session.toString())?.customizations;
  }
  /** Mints the session URI before the collapsed `createChat` path derives its default-chat URI. */
  _mintSessionUri(provider) {
    return AgentSession.uri(provider.id, generateUuid());
  }
  async _createProviderSession(provider, config, deferWorktreeCreation) {
    const requestedSessionId = deferWorktreeCreation && config?.session ? AgentSession.id(config.session) : void 0;
    if (requestedSessionId) {
      this._worktree?.notePending(requestedSessionId);
    }
    let created;
    try {
      const providerConfig = config ? this._toProviderConfig(config) : void 0;
      const session = config?.session ?? this._mintSessionUri(provider);
      const defaultChatUri = URI.parse(buildDefaultChatUri(session));
      const boundConfig = { ...providerConfig ?? {}, session };
      const result = await provider.chats.createChat(defaultChatUri, this._chatContext(session, defaultChatUri), this._toCreateChatOptions(boundConfig));
      created = {
        session,
        ...result?.project ? { project: result.project } : {},
        ...result?.resolvedWorkingDirectory ? { resolvedWorkingDirectory: result.resolvedWorkingDirectory } : {},
        ...result?.provisional ? { provisional: true } : {},
        ...result ? { chat: result } : {}
      };
      if (deferWorktreeCreation && created.provisional) {
        this._worktree?.notePending(AgentSession.id(created.session));
      }
      await this._persistDefaultChatBacking(created);
      return created;
    } catch (err) {
      if (created) {
        await this._rollbackProviderSession(provider, created.session);
      }
      throw err;
    } finally {
      const returnedPendingSessionId = created?.provisional ? AgentSession.id(created.session) : void 0;
      if (requestedSessionId && requestedSessionId !== returnedPendingSessionId) {
        this._worktree?.clearPending(requestedSessionId);
      }
    }
  }
  /**
   * Best-effort rollback for a partially-created provider session. Creation
   * only provisions the default chat, so rollback disposes that one chat and
   * the caller rethrows the original error.
   */
  async _rollbackProviderSession(provider, session) {
    const defaultChatUri = URI.parse(buildDefaultChatUri(session));
    try {
      await provider.chats.disposeChat(defaultChatUri, this._chatContext(session, defaultChatUri));
    } catch (disposeError) {
      this._logService.error(disposeError, `[AgentService] Failed to roll back default chat of provider session ${session.toString()}`);
    }
  }
  _getSessionChatsInTeardownOrder(session) {
    const state = this._stateManager.getSessionState(session.toString());
    const defaultChat = state?.defaultChat ?? buildDefaultChatUri(session.toString());
    const result = [];
    const seen = /* @__PURE__ */ new Set();
    for (const summary of state?.chats ?? []) {
      if (summary.resource !== defaultChat && !seen.has(summary.resource)) {
        seen.add(summary.resource);
        result.push(URI.parse(summary.resource));
      }
    }
    if (!seen.has(defaultChat)) {
      result.push(URI.parse(defaultChat));
    }
    return result;
  }
  /**
   * Destructively tears a session down: dispose peer chats first and the
   * default chat last, and still visit every chat if one rejects.
   */
  async _disposeSession(provider, session) {
    await this._defaultChatBackingWrites.get(session.toString())?.catch(() => {
    });
    let firstError;
    for (const chat of this._getSessionChatsInTeardownOrder(session)) {
      try {
        await provider.chats.disposeChat(chat, this._chatContext(session, chat));
      } catch (err) {
        firstError ??= err;
      }
    }
    if (firstError !== void 0) {
      throw firstError;
    }
  }
  /**
   * Releases a session's in-memory footprint without deleting durable data.
   * Idle eviction must use {@link IAgentChats.releaseChat}, not destructive
   * session finalization, so the session remains resumable.
   */
  async _releaseSession(provider, session, chats) {
    await this._defaultChatBackingWrites.get(session.toString())?.catch(() => {
    });
    let firstError;
    for (const chat of chats) {
      try {
        await provider.chats.releaseChat(chat, this._chatContext(session, chat));
      } catch (err) {
        firstError ??= err;
      }
    }
    if (firstError !== void 0) {
      throw firstError;
    }
  }
  /**
   * Reconstruct the turns for a chat. `chat` is the concrete chat channel URI,
   * except for legacy restore paths that still address subagent sessions.
   *
   * `origin` is only supplied by restore paths that reconstruct a chat's turns
   * *before* the chat is registered in the catalog, so the host-owned context
   * cannot supply it yet. It takes precedence over the catalog value for
   * exactly that window; every other caller relies on the exhaustive origin
   * {@link _chatContext} stamps.
   */
  async _getChatMessages(provider, chat, session, origin) {
    const context = { ...this._chatContext(session, chat), ...origin ? { origin } : {} };
    const turns = await this._applyPersistedTurnUsage(chat, await provider.chats.getMessages(chat, context));
    if (this._worktree && isDefaultChatUri(chat)) {
      return this._worktree.applyRestoreAnnouncement(URI.parse(parseRequiredSessionUriFromChatUri(chat.toString())), turns);
    }
    return turns;
  }
  /**
   * Re-attaches persisted per-turn {@link UsageInfo} to reconstructed turns.
   *
   * Agent backends don't durably record token/credit usage — the Copilot
   * SDK's `assistant.usage` event is explicitly ephemeral and the Claude
   * transcript replay produces none — so restored turns come back without it.
   * Without this the chat's context-usage gauge stays hidden after a reload
   * and the session cost total restarts from zero. Usage recorded live by
   * {@link AgentSideEffects} is looked up by turn id (or the turn's SDK event
   * id, which is what a restored turn is keyed by).
   *
   * NOTE: the lookup only lands for providers that record the bridge between
   * the live protocol turn id (a host-generated uuid) and the id a restored
   * turn is keyed by. Today only Copilot does, via `setTurnEventId`. Claude
   * restores turns keyed by transcript uuid and never populates
   * `turns.event_id`, so its rows are written but never matched; giving it a
   * gauge after reload needs that bridge recorded first.
   */
  async _applyPersistedTurnUsage(chat, turns) {
    if (turns.length === 0 || turns.every((turn) => hasReportedUsage(turn.usage)) || isSubagentChatUri(chat.toString())) {
      return turns;
    }
    const storage = chatStorageUri(chat);
    if (!storage) {
      return turns;
    }
    let usages;
    const ref = await this._sessionDataService.tryOpenDatabase(storage);
    if (!ref) {
      return turns;
    }
    try {
      usages = await ref.object.getTurnUsages();
    } catch (err) {
      this._logService.warn(`[AgentService] Failed to read persisted turn usage for ${storage.toString()}`, err);
      return turns;
    } finally {
      ref.dispose();
    }
    if (usages.size === 0) {
      return turns;
    }
    return turns.map((turn) => {
      const raw = hasReportedUsage(turn.usage) ? void 0 : usages.get(turn.id);
      if (!raw) {
        return turn;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return turn;
        }
        const persisted = parsed;
        const meta = { ...turn.usage?._meta, ...persisted._meta };
        return {
          ...turn,
          usage: {
            ...turn.usage,
            ...persisted,
            ...Object.keys(meta).length > 0 ? { _meta: meta } : {}
          }
        };
      } catch {
        return turn;
      }
    });
  }
  /**
   * Merges persisted host-injected local turns (`/rename`, `!command`) for
   * `chatUri` back into that chat's SDK-derived `turns`, positioned after
   * their anchor turn (the concrete turn they were recorded after). Locals
   * anchored before any real turn are prepended; locals whose anchor is absent
   * from the SDK turns (e.g. truncated away) are dropped. Also seeds the
   * in-memory local-turn index so fork/truncate resolve correctly before the
   * next reload.
   */
  async _interleaveLocalTurns(sessionStr, chatUri, turns) {
    const records = await this._localTurns.loadForChat(sessionStr, chatUri);
    if (records.length === 0) {
      return [...turns];
    }
    const knownIds = new Set(turns.map((t) => t.id));
    const byAnchor = /* @__PURE__ */ new Map();
    const head = [];
    for (const record of records) {
      let turn;
      try {
        turn = JSON.parse(record.payload);
      } catch {
        continue;
      }
      if (record.anchorTurnId === void 0) {
        head.push(turn);
      } else if (knownIds.has(record.anchorTurnId)) {
        const list = byAnchor.get(record.anchorTurnId) ?? [];
        list.push(turn);
        byAnchor.set(record.anchorTurnId, list);
      }
    }
    const merged = [...head];
    for (const turn of turns) {
      merged.push(turn);
      const locals = byAnchor.get(turn.id);
      if (locals) {
        merged.push(...locals);
      }
    }
    return merged;
  }
  /**
   * Re-persists forked host-injected local turns (`/rename`, `!command`) into
   * a newly forked chat so they survive reload and anchor future
   * fork/truncate. `originalSlice[i]` and `forkedTurns[i]` are the source turn
   * and its remapped copy (same length, 1:1); `mapping` is the old→new turn id
   * map used to remap each local turn's anchor. `persistSession` owns the
   * destination database; `sourceChatUri` / `newChatUri` key the source and
   * destination local-turn indexes.
   *
   * Shared by the {@link createSession} (default-chat) and {@link createChat}
   * (peer-chat) fork paths.
   */
  _persistForkedLocalTurns(persistSession, sourceChatUri, newChatUri, originalSlice, forkedTurns, mapping) {
    for (let i = 0; i < originalSlice.length; i++) {
      const original = originalSlice[i];
      if (!this._localTurns.isLocal(sourceChatUri, original.id)) {
        continue;
      }
      const originalAnchor = this._localTurns.resolveConcreteTurnId(sourceChatUri, original.id);
      const newAnchor = originalAnchor !== void 0 ? mapping.get(originalAnchor) : void 0;
      this._localTurns.record(persistSession, newChatUri, forkedTurns[i], newAnchor);
    }
  }
  /**
   * Create (or fork) the peer chat `chat` within `session`. `chat` is
   * always a peer URI here (the default chat is created implicitly with
   * the session), so no default-chat resolution is needed.
   */
  async _createChat(provider, chat, session, options) {
    const placement = this._buildChatPlacement(session);
    const convOptions = options?.title !== void 0 || options?.model !== void 0 || options?.sideChat !== void 0 || placement ? {
      ...options?.title !== void 0 ? { title: options.title } : {},
      ...options?.model !== void 0 ? { model: options.model } : {},
      ...options?.sideChat !== void 0 ? { sideChat: options.sideChat } : {},
      ...placement?.workingDirectories ? { workingDirectories: placement.workingDirectories } : {},
      ...placement?.project ? { project: placement.project } : {},
      ...placement?.config ? { config: placement.config } : {}
    } : void 0;
    const context = this._chatContext(session, chat);
    const result = await provider.chats.createChat(chat, context, options?.fork ? { ...convOptions, fork: options.fork } : convOptions);
    return result;
  }
  _toCreateChatOptions(config) {
    return {
      ...config.model ? { model: config.model } : {},
      ...config.agent ? { agent: config.agent } : {},
      ...config.workingDirectories ? { workingDirectories: config.workingDirectories } : {},
      ...config.config ? { config: config.config } : {},
      ...config.activeClient ? { activeClient: config.activeClient } : {},
      ...!config.fork && !config.importConversation ? { deferBacking: true } : {},
      ...config.importConversation ? { importConversation: config.importConversation } : {},
      ...config.fork ? {
        fork: {
          source: config.fork.chat,
          turnIndex: config.fork.turnIndex,
          turnId: config.fork.turnId,
          turnIdMapping: config.fork.turnIdMapping
        }
      } : {}
    };
  }
  /** Resolves the owning session context for creating an additional chat. */
  _buildChatPlacement(session) {
    const state = this._stateManager.getSessionState(session.toString());
    const workingDirectories = state?.workingDirectories?.map((directory) => typeof directory === "string" ? URI.parse(directory) : directory) ?? [];
    const resolvedPrimary = this._worktree?.getResolvedWorktree(AgentSession.id(session));
    if (resolvedPrimary) {
      workingDirectories[0] = resolvedPrimary;
    }
    if (workingDirectories.length === 0) {
      return void 0;
    }
    const config = this._configurationService.getSessionConfigValues(session.toString());
    return {
      workingDirectories,
      ...state?.project ? { project: { uri: URI.parse(state.project.uri), displayName: state.project.displayName } } : {},
      ...config && Object.keys(config).length > 0 ? { config } : {}
    };
  }
  async _disposeChat(provider, chat) {
    const session = URI.parse(parseRequiredSessionUriFromChatUri(chat));
    await provider.chats.disposeChat(chat, this._chatContext(session, chat));
  }
  /**
   * Derives a placeholder title for an imported session from its first user
   * turn (imports seed pre-existing turns, so the normal first-message title
   * generation never fires). Deliberately unprefixed: an imported session is a
   * continuation of the source chat, not a distinct kind of session, so it
   * should read like any other. The placeholder is later refined into a
   * generated title (see the `importConversation` branch in `createSession`),
   * but a neutral non-empty fallback is kept so the session still reads like a
   * normal chat when generation is unavailable or fails.
   */
  _buildImportedTitle(turns) {
    const firstText = turns.find((t) => t.message?.text?.trim())?.message.text.trim();
    if (!firstText) {
      return localize("agentHost.importedSessionFallback", "New Session");
    }
    const MAX = 60;
    return firstText.length > MAX ? `${firstText.slice(0, MAX)}...` : firstText;
  }
  _buildInitialSummary(provider, session, config, created, title) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const explicitGitHubState = readSessionGitHubState(config?._meta);
    const explicitMultiRoot = readSessionMultiRootMetadata(config?._meta);
    const inheritedMultiRoot = config?.fork ? readSessionMultiRootMetadata(this._stateManager.getSessionSummary(config.fork.session.toString())?._meta) : void 0;
    let _meta = withSessionGitHubState(void 0, explicitGitHubState);
    _meta = withSessionMultiRootMetadata(_meta, explicitMultiRoot ?? inheritedMultiRoot);
    _meta = withSessionExternal(_meta, false);
    _meta = !config?.fork && !config?.workingDirectories ? withSessionWorkspaceless(_meta, true) : _meta;
    return {
      resource: session.toString(),
      provider: provider.id,
      title,
      status: SessionStatus.Idle,
      createdAt: now,
      modifiedAt: now,
      ...created.project ? { project: { uri: created.project.uri.toString(), displayName: created.project.displayName } } : {},
      // The provider resolved only its process root (index 0), which may
      // differ from the requested primary (e.g. a workspace-less scratch dir).
      // Assemble the session set by overriding the requested primary with it
      // and keeping the requested tail; the fully-resolved multi-root set
      // arrives later via the materialization receipt.
      workingDirectories: reconcileWorkingDirectories(config?.workingDirectories, created.resolvedWorkingDirectory ? [created.resolvedWorkingDirectory] : void 0),
      // Workspace-less is inferred at create from an absent input
      // `workingDirectories` (the host assigns a scratch cwd, so it can't be
      // re-inferred later) and tagged on the generic `_meta` bag. Use
      // `=== undefined` so an explicit empty set (`[]`) is NOT treated as
      // workspace-less.
      ..._meta ? { _meta } : {}
    };
  }
  /**
   * Listen for an agent transitioning a provisional session into a fully
   * materialized SDK session. The agent has already created the worktree
   * (if any) and persisted on-disk metadata; we need to:
   * - Refresh the in-memory summary with the resolved working directory
   *   and project metadata.
   * - Persist any config values now that we have a real on-disk session.
   * - Emit the deferred `notify/sessionAdded` so other clients learn of
   *   the session.
   * - Dispatch `SessionReady` so subscribers see the lifecycle transition.
   * - Lazily attach git state for the (possibly new) working directory.
   */
  _onDidMaterializeChat(e) {
    const session = URI.parse(parseRequiredSessionUriFromChatUri(e.chat));
    const sessionKey = session.toString();
    this._clearDownloadProgressInterest(sessionKey);
    const state = this._stateManager.getSessionState(sessionKey);
    if (!state) {
      this._logService.warn(`[AgentService] onDidMaterializeChat for unknown session: ${sessionKey}`);
      return;
    }
    const currentSummary = this._stateManager.getSessionSummary(sessionKey);
    if (!currentSummary) {
      this._logService.warn(`[AgentService] onDidMaterializeChat missing summary for session: ${sessionKey}`);
      return;
    }
    if (e.chat.toString() !== state.defaultChat) {
      return;
    }
    if (e.result) {
      const write = this._persistDefaultChatBacking({ session, chat: e.result });
      this._defaultChatBackingWrites.set(sessionKey, write);
      void write.catch((err) => this._logService.error(err, `[AgentService] Failed to persist materialized default-chat backing for ${sessionKey}`));
      const clearWrite = () => {
        if (this._defaultChatBackingWrites.get(sessionKey) === write) {
          this._defaultChatBackingWrites.delete(sessionKey);
        }
      };
      void write.then(clearWrite, clearWrite);
    }
    const project = this._worktree?.sessionWorktreeProject(AgentSession.id(session)) ?? e.project;
    const currentSet = currentSummary.workingDirectories?.map((d) => URI.parse(d));
    const summary = {
      ...currentSummary,
      ...project ? { project: { uri: project.uri.toString(), displayName: project.displayName } } : {},
      // The materialize receipt is authoritative for the roots it reports
      // (index 0 = the resolved process root, e.g. a worktree). A send-path
      // receipt carries the full resolved set; a resume-path receipt reports
      // only the process root, so the rest of the current set is preserved.
      workingDirectories: reconcileWorkingDirectories(currentSet, e.workingDirectories),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const configValues = state.config?.values;
    if (configValues && Object.keys(configValues).length > 0) {
      this._persistConfigValues(session, configValues);
    }
    this._persistWorkspaceless(session, readSessionWorkspaceless(summary._meta));
    this._persistMultiRoot(session, readSessionMultiRootMetadata(summary._meta));
    this._stateManager.markSessionPersisted(sessionKey, summary);
    this._stateManager.dispatchServerAction(sessionKey, { type: ActionType.SessionReady });
    const gitHubState = readSessionGitHubState(summary._meta);
    if (gitHubState) {
      void this._gitStateService.setSessionGitHubState(sessionKey, gitHubState);
    }
    void this._gitStateService.refreshSessionGitState(sessionKey, e.workingDirectories?.[0]);
    this._changesetCoordinator.onSessionMaterialized(sessionKey);
  }
  /** Drop a session's download-progress opt-in, if any. */
  _clearDownloadProgressInterest(sessionKey) {
    for (const [provider, sessions] of this._downloadProgressInterest) {
      if (sessions.delete(sessionKey) && sessions.size === 0) {
        this._downloadProgressInterest.delete(provider);
      }
    }
  }
  /**
   * Surface a host-level SDK download as client progress. The downloader fires
   * process-global frames keyed by package id (which equals the provider id);
   * because the download is shared across every session of that provider, we
   * emit a SINGLE `progress` stream keyed by that package id — not one per
   * session — so the client shows exactly one indicator no matter how many
   * sessions of the provider are awaiting it. Frames are emitted while at least
   * one session has opted in (supplied a
   * {@link IAgentCreateSessionConfig.progressToken} on `createSession`) or a
   * user-initiated flow has explicitly requested progress. A
   * terminal frame reports `total === progress` (using `receivedBytes` when the
   * size was never known) so the client dismisses the indicator deterministically.
   *
   * `displayName` is the provider's brand noun (e.g. `Claude`). It is woven
   * into the notification's localized, human-readable `message` (e.g.
   * "Downloading Claude agent") so a generic client can render the indicator
   * verbatim without knowing the resource is an agent SDK. No trailing
   * ellipsis: clients render progress as "<title>: <percent>", so an ellipsis
   * would read as an unusual "…:" (see #324455).
   */
  emitDownloadProgress(packageId, displayName, receivedBytes, totalBytes, terminal, explicitlyRequested = false) {
    const sessions = this._downloadProgressInterest.get(packageId);
    if ((!sessions || sessions.size === 0) && !explicitlyRequested) {
      return;
    }
    const total = terminal ? receivedBytes : totalBytes;
    const message = localize("agentHost.download.agentSdkTitle", "Downloading {0} agent", displayName);
    this._stateManager.emitProgress({ progressToken: packageId, progress: receivedBytes, total, message });
    if (terminal) {
      this._downloadProgressInterest.delete(packageId);
    }
  }
  _persistWorkspaceless(session, workspaceless) {
    let ref;
    try {
      ref = this._sessionDataService.openDatabase(session);
    } catch (err) {
      this._logService.warn(`[AgentService] Failed to open session database to persist workspaceless for ${session.toString()}: ${toErrorMessage(err)}`);
      return;
    }
    ref.object.setMetadata(AH_META_WORKSPACELESS_DB_KEY, workspaceless ? "true" : "false").catch((err) => {
      this._logService.warn(`[AgentService] Failed to persist workspaceless for ${session.toString()}: ${toErrorMessage(err)}`);
    }).finally(() => {
      ref.dispose();
    });
  }
  _persistMultiRoot(session, multiRoot) {
    if (!multiRoot) {
      return;
    }
    let ref;
    try {
      ref = this._sessionDataService.openDatabase(session);
    } catch (err) {
      this._logService.warn(`[AgentService] Failed to open session database to persist multi-root metadata for ${session.toString()}: ${toErrorMessage(err)}`);
      return;
    }
    ref.object.setMetadata(SESSION_META_MULTI_ROOT_KEY, JSON.stringify(multiRoot)).catch((err) => {
      this._logService.warn(`[AgentService] Failed to persist multi-root metadata for ${session.toString()}: ${toErrorMessage(err)}`);
    }).finally(() => {
      ref.dispose();
    });
  }
  _persistConfigValues(session, values) {
    let ref;
    try {
      ref = this._sessionDataService.openDatabase(session);
    } catch (err) {
      this._logService.warn(`[AgentService] Failed to open session database to persist configValues for ${session.toString()}: ${toErrorMessage(err)}`);
      return;
    }
    ref.object.setMetadata("configValues", JSON.stringify(values)).catch((err) => {
      this._logService.warn(`[AgentService] Failed to persist configValues for ${session.toString()}: ${toErrorMessage(err)}`);
    }).finally(() => {
      ref.dispose();
    });
  }
  async _resolveCreatedSessionConfig(provider, config) {
    if (!config?.config && config?.workingDirectories === void 0) {
      return void 0;
    }
    const params = {
      provider: provider.id,
      // `resolveSessionConfig` is a pre-session, single-context API:
      // resolve against the session's primary (index 0).
      workingDirectory: config.workingDirectories?.[0],
      config: config.config
    };
    try {
      const resolved = await this._withIsolationSchema(await provider.resolveChatConfig(this._toProviderConfig(params)), params);
      return { schema: resolved.schema, values: resolved.values };
    } catch (err) {
      this._logService.error(`[AgentService] Failed to resolve created session config for provider ${provider.id}`, err);
      return config.config ? { schema: { type: "object", properties: {} }, values: config.config } : void 0;
    }
  }
  async resolveSessionConfig(params) {
    const providerId = params.provider ?? this._defaultProvider;
    const provider = providerId ? this._providers.get(providerId) : void 0;
    if (!provider) {
      throw new Error(`No agent provider registered for: ${providerId ?? "(none)"}`);
    }
    return this._withIsolationSchema(await provider.resolveChatConfig(this._toProviderConfig(params)), params);
  }
  /**
   * Host-owned contribution of the shared `isolation` (folder / worktree),
   * `branch`, `worktreeBranchPrefix`, `worktreeIncludeFiles`, and `worktreeBranchTrack` session-config
   * properties on top of whatever an agent returned from `resolveSessionConfig`. Provider-returned
   * properties and values with these keys are replaced by the host contribution.
   */
  async _withIsolationSchema(result, params) {
    if (!this._worktree) {
      return result;
    }
    const iso = await this._worktree.resolveIsolationConfig({ workingDirectory: params.workingDirectory, config: params.config });
    const properties = {
      [SessionConfigKey.Isolation]: iso.isolationProperty.protocol,
      ...omitHostOwnedSessionConfig(result.schema.properties)
    };
    if (iso.branchProperty) {
      properties[SessionConfigKey.Branch] = iso.branchProperty.protocol;
    }
    if (iso.worktreeBranchPrefixProperty) {
      properties[SessionConfigKey.WorktreeBranchPrefix] = iso.worktreeBranchPrefixProperty.protocol;
    }
    if (iso.worktreeBranchTrackProperty) {
      properties[SessionConfigKey.WorktreeBranchTrack] = iso.worktreeBranchTrackProperty.protocol;
    }
    if (iso.worktreeIncludeFilesProperty) {
      properties[SessionConfigKey.WorktreeIncludeFiles] = iso.worktreeIncludeFilesProperty.protocol;
    }
    const values = omitHostOwnedSessionConfig(result.values);
    values[SessionConfigKey.Isolation] = iso.isolationValue;
    if (iso.branchProperty && iso.branchValue !== void 0) {
      values[SessionConfigKey.Branch] = iso.branchValue;
    }
    if (iso.worktreeBranchPrefixProperty && typeof params.config?.[SessionConfigKey.WorktreeBranchPrefix] === "string") {
      values[SessionConfigKey.WorktreeBranchPrefix] = params.config[SessionConfigKey.WorktreeBranchPrefix];
    }
    if (iso.worktreeBranchTrackProperty && typeof params.config?.[SessionConfigKey.WorktreeBranchTrack] === "boolean") {
      values[SessionConfigKey.WorktreeBranchTrack] = params.config[SessionConfigKey.WorktreeBranchTrack];
    }
    if (iso.worktreeIncludeFilesProperty && Array.isArray(params.config?.[SessionConfigKey.WorktreeIncludeFiles]) && params.config[SessionConfigKey.WorktreeIncludeFiles].every((pattern) => typeof pattern === "string")) {
      values[SessionConfigKey.WorktreeIncludeFiles] = params.config[SessionConfigKey.WorktreeIncludeFiles];
    }
    return { schema: { ...result.schema, properties }, values };
  }
  async sessionConfigCompletions(params) {
    if (params.property === SessionConfigKey.Branch && this._worktree) {
      return this._worktree.branchCompletions(params.workingDirectory, params.query);
    }
    const providerId = params.provider ?? this._defaultProvider;
    const provider = providerId ? this._providers.get(providerId) : void 0;
    if (!provider) {
      throw new Error(`No agent provider registered for: ${providerId ?? "(none)"}`);
    }
    return provider.chatConfigCompletions(this._toProviderConfig(params));
  }
  async completions(params) {
    return this._completions.completions(params);
  }
  async getCompletionTriggerCharacters() {
    return this._completions.triggerCharacters;
  }
  async disposeSession(session) {
    this._logService.trace(`[AgentService] disposeSession: ${session.toString()}`);
    this._stateManager.invalidateSessionChatResolutions(session.toString());
    const sessionChats = this._stateManager.getSessionState(session.toString())?.chats ?? [];
    for (const chat of sessionChats) {
      this._sideEffects.clearChannelTelemetry(chat.resource);
    }
    this._sideEffects.clearChannelTelemetry(session.toString());
    const workingDirectories = this._configurationService.getEffectiveWorkingDirectories(session.toString());
    const sessionId = AgentSession.id(session);
    const worktree = await this._worktree?.prepareSessionDeletion(session, sessionId);
    const provider = this._findProviderForSession(session);
    if (provider) {
      await this._disposeSession(provider, session);
    }
    await this._retryRegistryMutation(
      () => this._sessionRegistry.unregister(session),
      `unregistration for ${session.toString()}`
    );
    if (provider) {
      this._sessionToProvider.delete(session.toString());
      this._clearDownloadProgressInterest(session.toString());
    }
    this._sideEffects.clearSessionTitleState(session.toString(), sessionChats.map((chat) => chat.resource));
    await this._whenSessionDataIdle(session);
    await this._sessionDataService.deleteSessionData(session, workingDirectories);
    await this._worktree?.removeSessionWorktree(sessionId, worktree);
    this._changesetCoordinator.onSessionDisposed(session.toString());
    for (const chat of this._stateManager.getSessionState(session.toString())?.chats ?? []) {
      this._sideEffects.clearQueuedMessageSenders(chat.resource);
    }
    this._sideEffects.clearInputRequestsForSession(session.toString());
    this._sideEffects.removeSubagentSessions(session.toString());
    this._stateManager.deleteSession(session.toString());
  }
  async _whenSessionDataIdle(session) {
    const ref = this._sessionDataService.openDatabase(session);
    try {
      await ref.object.whenIdle();
    } finally {
      ref.dispose();
    }
  }
  // ---- Protocol methods ---------------------------------------------------
  async createTerminal(params) {
    await this._terminalManager.createTerminal(params);
  }
  async disposeTerminal(terminal) {
    this._terminalManager.disposeTerminal(terminal.toString());
  }
  async subscribe(resource, clientId) {
    this._logService.trace(`[AgentService] subscribe: ${resource.toString()}`);
    const resourceStr = resource.toString();
    this.addSubscriber(resource, clientId);
    try {
      const terminalState = this._terminalManager.getTerminalState(resourceStr);
      if (terminalState) {
        return { resource: resourceStr, state: terminalState, fromSeq: this._stateManager.serverSeq };
      }
      let snapshot = this._stateManager.getSnapshot(resourceStr);
      const parsedChangeset = parseChangesetUri(resourceStr);
      if (snapshot && parsedChangeset && !this._stateManager.getSessionState(parsedChangeset.sessionUri)) {
        await this._changesetCoordinator.restoreSessionIfChangesetSubscription(resource, (s) => this.restoreSession(s));
        snapshot = this._stateManager.getSnapshot(resourceStr);
      }
      if (!snapshot) {
        const parsedChatSession = parseDefaultChatUri(resourceStr);
        if (parsedChatSession !== void 0) {
          if (!this._stateManager.getSessionState(parsedChatSession)) {
            const parentUri = URI.parse(parsedChatSession);
            const parsedSubagentParent = parseSubagentSessionUri(parentUri);
            if (parsedSubagentParent) {
              await this._restoreSubagentSession(parsedChatSession, parsedSubagentParent.parentSession);
            } else {
              await this.restoreSession(parentUri);
            }
          }
          snapshot = this._stateManager.getSnapshot(resourceStr);
        }
      }
      if (!snapshot && isAhpChatChannel(resourceStr)) {
        await this._stateManager.resolveChatState(resourceStr);
        snapshot = this._stateManager.getSnapshot(resourceStr);
      }
      if (!snapshot) {
        if (isSubagentChatUri(resource)) {
          snapshot = await this._awaitPendingSubagentChat(resourceStr);
          if (!snapshot) {
            const parsed = parseChatUri(resource);
            if (parsed?.chatId.startsWith("subagent/")) {
              await this._restoreSubagentChat(resourceStr, URI.parse(parsed.session), parsed.chatId.slice("subagent/".length));
              snapshot = this._stateManager.getSnapshot(resourceStr);
            }
          }
        } else {
          const handled = await this._changesetCoordinator.tryHandleSubscribe(resource, (s) => this.restoreSession(s));
          if (handled) {
            snapshot = this._stateManager.getSnapshot(resourceStr);
          } else {
            const parsedSubagent = parseSubagentSessionUri(resource);
            if (parsedSubagent) {
              await this._restoreSubagentSession(resourceStr, parsedSubagent.parentSession);
            } else {
              await this.restoreSession(resource);
            }
            snapshot = this._stateManager.getSnapshot(resourceStr);
          }
        }
      }
      if (!snapshot) {
        throw new Error(`Cannot subscribe to unknown resource: ${resourceStr}`);
      }
      const sessionState = this._stateManager.getSessionState(resourceStr);
      if (!isAhpChatChannel(resourceStr) && sessionState && readSessionGitState(sessionState._meta) === void 0) {
        const workingDirectory = sessionState.workingDirectories?.[0] ? URI.parse(sessionState.workingDirectories[0]) : void 0;
        void this._gitStateService.refreshSessionGitState(resourceStr, workingDirectory);
      }
      return snapshot;
    } catch (err) {
      this.unsubscribe(resource, clientId);
      throw err;
    }
  }
  /** Waits for an armed subagent chat to register (or its wait to time out); returns `undefined` if not armed or never registered. */
  async _awaitPendingSubagentChat(subagentChatUri) {
    const pending = this._pendingSubagentChats.get(subagentChatUri);
    if (!pending) {
      return void 0;
    }
    await pending.p;
    return this._stateManager.getSnapshot(subagentChatUri);
  }
  addSubscriber(resource, clientId) {
    let set = this._resourceSubscribers.get(resource);
    const wasUnsubscribed = !set || set.size === 0;
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this._resourceSubscribers.set(resource, set);
    }
    set.add(clientId);
    this._cancelPendingSessionGc(resource);
    this._cancelPendingSessionRelease(resource);
    if (wasUnsubscribed) {
      this._changesetCoordinator.onFirstSubscriber(resource);
    }
  }
  unsubscribe(resource, clientId) {
    const set = this._resourceSubscribers.get(resource);
    if (!set) {
      return;
    }
    set.delete(clientId);
    if (set.size > 0) {
      return;
    }
    this._resourceSubscribers.delete(resource);
    this._changesetCoordinator.onLastSubscriber(resource);
    this._stateManager.onChangesetLivenessChanged();
    if (this._maybeScheduleSessionGc(resource)) {
      return;
    }
    this._pendingSessionRelease.set(resource, disposableTimeout(() => {
      this._pendingSessionRelease.deleteAndDispose(resource);
      void this._maybeEvictIdleSession(resource).catch((err) => {
        this._logService.error(err, `[AgentService] Failed to evict idle session ${resource.toString()}`);
      });
    }, SESSION_RELEASE_GRACE_MS));
  }
  _cancelPendingSessionRelease(resource) {
    this._pendingSessionRelease.deleteAndDispose(resource);
  }
  /**
   * If `resource` names a session that no client is still subscribed to and
   * that has produced no turns (and has no active turn), schedule a delayed
   * {@link _runSessionGc} to fully tear it down — provider session, worktree,
   * persisted state and all. Sessions with at least one turn are left to the
   * existing {@link _maybeEvictIdleSession} path which only drops cached
   * state and lets the session be restored from disk later.
   *
   * GC is restricted to sessions that are still unused drafts. A session that
   * was restored from durable storage, or that has ever had a turn, is never
   * a candidate however empty it looks now — an empty state is also what a
   * failed history load and a truncate-to-zero leave behind.
   *
   * The delay ({@link SESSION_GC_GRACE_MS}) gives a disconnected client time
   * to reconnect or a workspace switch to settle. Any subsequent subscribe
   * (or createSession on the same URI) cancels the timer via
   * {@link _cancelPendingSessionGc}.
   *
   * Returns `true` if a GC timer was armed (existing or newly scheduled),
   * so callers can skip alternative cleanup paths.
   */
  _maybeScheduleSessionGc(resource) {
    if (parseSubagentSessionUri(resource)) {
      return false;
    }
    const key = resource.toString();
    const state = this._stateManager.getSessionState(key);
    if (!state) {
      return false;
    }
    if (state.turns.length > 0 || state.activeTurn !== void 0) {
      return false;
    }
    if (this._stateManager.isUnusedDraft(key) !== true) {
      this._logService.trace(`[AgentService] Skipping GC for session that is not an unused draft: ${key}`);
      return false;
    }
    this._pendingSessionGc.set(resource, disposableTimeout(() => {
      this._pendingSessionGc.deleteAndDispose(resource);
      this._runSessionGc(resource).catch((err) => {
        this._logService.error(err, `[AgentService] GC failed for ${key}`);
      });
    }, SESSION_GC_GRACE_MS));
    return true;
  }
  _cancelPendingSessionGc(resource) {
    this._pendingSessionGc.deleteAndDispose(resource);
  }
  /**
   * Fires {@link SESSION_GC_GRACE_MS} after a session lost its last
   * subscriber while empty. Re-checks the invariants (still no subscribers,
   * still empty, still an unused draft) before tearing the session down via
   * {@link disposeSession}. The cached state may already have been evicted by
   * {@link _maybeEvictIdleSession}; in that case we still proceed because
   * "evicted + no resubscribe" implies no client is observing the session.
   */
  async _runSessionGc(resource) {
    const key = resource.toString();
    if (this._resourceSubscribers.has(resource)) {
      return;
    }
    const state = this._stateManager.getSessionState(key);
    if (state && (state.turns.length > 0 || state.activeTurn !== void 0)) {
      return;
    }
    if (this._stateManager.isUnusedDraft(key) === false) {
      this._logService.trace(`[AgentService] GC aborted, session is no longer an unused draft: ${key}`);
      return;
    }
    this._logService.info(`[AgentService] GC: disposing empty unsubscribed session ${key}`);
    await this.disposeSession(resource);
  }
  /**
   * If `resource` names an idle session with no remaining subscribers, drop its
   * cached state and release its SDK chats. Subagent URIs evict the parent
   * session entry because the parent owns the materialized turn tree. Durable
   * data stays intact; the next subscribe restores the session on demand.
   */
  async _maybeEvictIdleSession(resource) {
    const key = resource.toString();
    if (this._resourceSubscribers.has(resource)) {
      return;
    }
    let evictionTarget = resource;
    {
      let parsed;
      while (parsed = parseSubagentSessionUri(evictionTarget)) {
        evictionTarget = parsed.parentSession;
      }
    }
    if (this._resourceSubscribers.has(evictionTarget)) {
      return;
    }
    for (const subscribedUri of this._resourceSubscribers.keys()) {
      if (this._isSubagentDescendantOf(subscribedUri, evictionTarget)) {
        return;
      }
    }
    const evictionTargetKey = evictionTarget.toString();
    if (this._restoreSessionInFlight.has(evictionTargetKey)) {
      return;
    }
    const targetState = this._stateManager.getSessionState(evictionTargetKey);
    if (!targetState || targetState.activeTurn !== void 0) {
      return;
    }
    const chats = this._getSessionChatsInTeardownOrder(evictionTarget);
    await this._whenSessionDataIdle(evictionTarget);
    if (this._resourceSubscribers.has(evictionTarget) || this._restoreSessionInFlight.has(evictionTargetKey)) {
      return;
    }
    for (const subscribedUri of this._resourceSubscribers.keys()) {
      if (this._isSubagentDescendantOf(subscribedUri, evictionTarget)) {
        return;
      }
    }
    const settledState = this._stateManager.getSessionState(evictionTargetKey);
    if (!settledState || settledState.activeTurn !== void 0) {
      return;
    }
    this._logService.info(`[AgentService] Evicting idle session: ${evictionTargetKey} (triggered by unsubscribe of ${key})`);
    const subagentPrefix = buildSubagentSessionUriPrefix(evictionTarget);
    for (const cachedKey of this._stateManager.getSessionUrisWithPrefix(subagentPrefix)) {
      this._stateManager.removeSession(cachedKey);
    }
    this._sideEffects.clearSessionTitleState(evictionTargetKey, settledState.chats.map((chat) => chat.resource));
    this._stateManager.removeSession(evictionTargetKey);
    const provider = this._findProviderForSession(evictionTarget);
    if (!provider) {
      return;
    }
    const release = this._releaseSession(provider, evictionTarget, chats);
    const trackedRelease = release.catch((err) => {
      this._logService.error(err, `[AgentService] Failed to release idle session ${evictionTargetKey}`);
    });
    this._releaseSessionInFlight.set(evictionTargetKey, trackedRelease);
    void trackedRelease.then(() => {
      if (this._releaseSessionInFlight.get(evictionTargetKey) === trackedRelease) {
        this._releaseSessionInFlight.delete(evictionTargetKey);
      }
    });
  }
  // Returns true when a changeset is safe to drop from the in-memory cache.
  _isChangesetEvictable(changeset) {
    const changesetUri = URI.parse(changeset);
    if (this._resourceSubscribers.has(changesetUri)) {
      return false;
    }
    const parsed = parseChangesetUri(changeset);
    if (!parsed) {
      return false;
    }
    const sessionUri = URI.parse(parsed.sessionUri);
    if (this._resourceSubscribers.has(sessionUri)) {
      return false;
    }
    for (const subscribedUri of this._resourceSubscribers.keys()) {
      if (this._isSubagentDescendantOf(subscribedUri, sessionUri)) {
        return false;
      }
    }
    return !this._changesets.isStaticChangesetComputeActive(changeset);
  }
  _isSubagentDescendantOf(resource, parent) {
    let parsed = parseSubagentSessionUri(resource);
    while (parsed) {
      if (isEqual(parsed.parentSession, parent)) {
        return true;
      }
      parsed = parseSubagentSessionUri(parsed.parentSession);
    }
    return false;
  }
  /** A read/archive toggle carries no intent to open, so it must not trigger legacy adoption on an un-loaded session. */
  _isPassiveMetadataAction(action) {
    return action.type === ActionType.SessionIsReadChanged || action.type === ActionType.SessionIsArchivedChanged;
  }
  dispatchAction(channel, action, clientId, clientSeq, clientContextOrType = AgentHostClientType.Unknown) {
    const clientContext = typeof clientContextOrType === "string" ? createUnknownAgentHostClientTelemetryContext(clientContextOrType) : clientContextOrType;
    this._logService.trace(`[AgentService] dispatchAction: type=${action.type}, clientId=${clientId}, clientSeq=${clientSeq}`, action);
    const chatChannel = isAhpChatChannel(channel) ? channel : void 0;
    const sessionChannel = chatChannel ? parseRequiredSessionUriFromChatUri(chatChannel) : channel;
    const requiresSessionRestore = (chatChannel !== void 0 || isSessionAction(action)) && !this._stateManager.getSessionState(sessionChannel);
    const requiresPeerResolution = chatChannel !== void 0 && !this._stateManager.getChatState(chatChannel);
    const requiresTurnOwnerResolution = action.type === ActionType.ChatTurnStarted && (requiresSessionRestore || (this._getUnresolvedPeerChats(sessionChannel)?.length ?? 0) > 0);
    const requiresAttachmentRewrite = this._needsAsyncRewrite(sessionChannel, action);
    const requiresReviewStateUpdate = action.type === ActionType.ChangesetFilesReviewChanged;
    const pending = this._clientDispatchQueues.get(clientId);
    if (!pending && !requiresSessionRestore && !requiresPeerResolution && !requiresTurnOwnerResolution && !requiresAttachmentRewrite && !requiresReviewStateUpdate) {
      this._dispatchActionNow(channel, sessionChannel, action, clientId, clientSeq, clientContext);
      return;
    }
    const next = (pending ?? Promise.resolve()).then(async () => {
      if (requiresSessionRestore) {
        const sessionUri = URI.parse(sessionChannel);
        const subagent = parseSubagentSessionUri(sessionUri);
        if (subagent) {
          await this._restoreSubagentSession(sessionChannel, subagent.parentSession);
        } else if (this._isPassiveMetadataAction(action) && readSessionEhcliAdoptable(this._stateManager.getSurfacedSessionSummary(sessionChannel)?._meta)) {
          return;
        } else {
          await this.restoreSession(sessionUri);
        }
      }
      if (chatChannel && requiresPeerResolution) {
        await this._stateManager.resolveChatState(chatChannel);
      }
      if (action.type === ActionType.ChatTurnStarted && requiresTurnOwnerResolution) {
        await this._resolvePeerChatsForTurnValidation(sessionChannel);
      }
      const rewritten = requiresAttachmentRewrite ? await this._rewriteUserMessageAttachments(sessionChannel, action, clientId) : action;
      if (rewritten.type === ActionType.ChangesetFilesReviewChanged) {
        await this._reviewService.setReviewState(channel, rewritten.files, rewritten.reviewed);
        const changeset = parseChangesetUri(channel);
        if (!changeset) {
          throw new Error(`Invalid changeset URI: ${channel}`);
        }
        this._changesets.refreshBranchChangeset(changeset.sessionUri);
      }
      this._dispatchActionNow(channel, sessionChannel, rewritten, clientId, clientSeq, clientContext);
    }).catch((err) => {
      this._logService.error(`[AgentService] async dispatchAction failed: ${toErrorMessage(err)}`);
      this._stateManager.rejectClientAction(channel, action, { clientId, clientSeq }, toErrorMessage(err));
    }).finally(() => {
      if (this._clientDispatchQueues.get(clientId) === next) {
        this._clientDispatchQueues.delete(clientId);
      }
    });
    this._clientDispatchQueues.set(clientId, next);
  }
  /**
   * Authoritative gate for every client working-directory action. Throws when
   * the session or its provider cannot accept the change — including a removal
   * of the primary directory for a provider that pins it — so the caller can
   * reject the action. Returns the canonicalized action on success.
   */
  _prepareWorkingDirectoryAction(session, action) {
    const state = this._stateManager.getSessionState(session);
    if (!state || state.lifecycle !== SessionLifecycle.Ready || !state.workingDirectories?.length) {
      throw new Error(`Session is not ready for working-directory changes: ${session}`);
    }
    if (!readSessionMultiRootMetadata(state._meta) || readSessionWorkspaceless(state._meta) || state.config?.values[SessionConfigKey.Isolation] === "worktree" || state.chats.length !== 1 || !state.defaultChat || state.defaultChat !== state.chats[0].resource) {
      throw new Error(`Session does not support dynamic working-directory changes: ${session}`);
    }
    const sessionUri = URI.parse(session);
    const provider = this._findProviderForSession(sessionUri);
    const capability = provider?.getDescriptor().capabilities?.multipleWorkingDirectories;
    if (!provider || !capability) {
      throw new Error(`Provider does not support dynamic working-directory changes: ${AgentSession.provider(sessionUri) ?? "(unknown)"}`);
    }
    return resolveSessionWorkingDirectoryAction(action, state.workingDirectories, capability.immutablePrimary === true);
  }
  _dispatchActionNow(channel, sessionChannel, action, clientId, clientSeq, clientContext) {
    const origin = { clientId, clientSeq };
    if (action.type === ActionType.ChatTurnStarted && this._isTurnIdUsedByAnotherChat(sessionChannel, channel, action.turnId)) {
      this._stateManager.rejectClientAction(channel, action, origin, "Turn id is already used by another chat in this session.");
      return;
    }
    if (action.type === ActionType.SessionWorkingDirectorySet || action.type === ActionType.SessionWorkingDirectoryRemoved) {
      if (clientContext.clientType !== AgentHostClientType.EditorWindow) {
        this._stateManager.rejectClientAction(channel, action, origin, "Session working-directory actions require an Editor Window client.");
        return;
      }
      if (channel !== sessionChannel) {
        this._stateManager.rejectClientAction(channel, action, origin, "Session working-directory actions require a session channel.");
        return;
      }
      try {
        action = this._prepareWorkingDirectoryAction(sessionChannel, action);
      } catch (error) {
        this._stateManager.rejectClientAction(channel, action, origin, toErrorMessage(error));
        return;
      }
    }
    this._stateManager.dispatchClientAction(channel, action, origin, clientContext);
    if (action.type === ActionType.RootConfigChanged) {
      this._configurationService.persistRootConfig();
      const editTelemetryEnabled = action.config[AgentHostEditTelemetryEnabledConfigKey];
      if (typeof editTelemetryEnabled === "boolean") {
        this._editAttributionService?.setEnabled(editTelemetryEnabled);
      }
    }
    this._sideEffects.handleAction(channel, action, clientId, clientContext);
  }
  _getUnresolvedPeerChats(sessionChannel) {
    return this._stateManager.getSessionState(sessionChannel)?.chats.filter((chat) => !isDefaultChatUri(chat.resource) && !this._stateManager.getChatState(chat.resource)).map((chat) => chat.resource);
  }
  async _resolvePeerChatsForTurnValidation(sessionChannel) {
    while (true) {
      const unresolvedChats = this._getUnresolvedPeerChats(sessionChannel);
      if (!unresolvedChats) {
        throw new Error("Cannot validate turn id for unknown session");
      }
      if (unresolvedChats.length === 0) {
        return;
      }
      await Promise.all(unresolvedChats.map(async (chat) => {
        if (!await this._stateManager.resolveChatState(chat)) {
          throw new Error("Cannot resolve peer chat for turn id validation");
        }
      }));
    }
  }
  _isTurnIdUsedByAnotherChat(sessionChannel, chatChannel, turnId) {
    const sessionState = this._stateManager.getSessionState(sessionChannel);
    if (!sessionState) {
      return false;
    }
    if (sessionState.defaultChat !== chatChannel && (sessionState.activeTurn?.id === turnId || (sessionState.turns ?? []).some((turn) => turn.id === turnId))) {
      return true;
    }
    for (const chat of sessionState.chats ?? []) {
      if (chat.resource === chatChannel || isDefaultChatUri(chat.resource)) {
        continue;
      }
      const chatState = this._stateManager.getChatState(chat.resource);
      if (chatState?.activeTurn?.id === turnId || chatState?.turns.some((turn) => turn.id === turnId)) {
        return true;
      }
    }
    return false;
  }
  _needsAsyncRewrite(sessionURI, action) {
    if (action.type !== ActionType.ChatTurnStarted && action.type !== ActionType.ChatPendingMessageSet) {
      return false;
    }
    const attachmentsRootStr = this._attachmentsRoot(sessionURI).toString();
    return !!action.message.attachments?.some((a) => this._isRewritableAttachment(a, attachmentsRootStr));
  }
  _isRewritableAttachment(attachment, attachmentsRootStr) {
    if (attachment.type === MessageAttachmentKind.EmbeddedResource) {
      return true;
    }
    if (attachment.type === MessageAttachmentKind.Resource) {
      if (attachment.displayKind === "directory") {
        return false;
      }
      if (attachment.uri.startsWith(attachmentsRootStr)) {
        return false;
      }
      return true;
    }
    return false;
  }
  _attachmentsRoot(sessionURI) {
    return joinPath(this._sessionDataService.getSessionDataDir(URI.parse(sessionURI)), SESSION_ATTACHMENTS_DIRNAME);
  }
  /**
   * Snapshot inline / client-resident attachment payloads onto disk
   * under the session's data directory and rewrite the action to
   * reference them via local `file:` URIs. Keeps potentially large
   * blobs (e.g. pasted text or images) out of the in-memory state tree while
   * letting the agent consume them via the standard {@link IFileService}
   * surface — no special URI scheme or blob round-tripping needed.
   *
   * Failures are isolated per-attachment: if a rewrite cannot be
   * performed (no client connection registered, `resourceRead` rejects,
   * etc.) the original attachment is preserved so the agent still has a
   * chance to make use of it.
   */
  async _rewriteUserMessageAttachments(channel, action, clientId) {
    const attachments = action.message.attachments;
    if (!attachments?.length) {
      return action;
    }
    const attachmentsRoot = this._attachmentsRoot(channel);
    const attachmentsRootStr = attachmentsRoot.toString();
    const rewritten = await Promise.all(attachments.map((a) => this._rewriteSingleAttachment(a, attachmentsRoot, attachmentsRootStr, clientId)));
    return {
      ...action,
      message: { ...action.message, attachments: rewritten }
    };
  }
  async _rewriteSingleAttachment(attachment, attachmentsRoot, attachmentsRootStr, clientId) {
    try {
      if (attachment.type === MessageAttachmentKind.EmbeddedResource) {
        const bytes = decodeBase64(attachment.data).buffer;
        const basename = this._attachmentBasename(attachment.label, attachment.contentType);
        return this._writeAndRewrite(attachment, bytes, basename, attachmentsRoot);
      }
      if (attachment.type === MessageAttachmentKind.Resource && this._isRewritableAttachment(attachment, attachmentsRootStr)) {
        const originalUri = URI.parse(attachment.uri);
        if (originalUri.scheme === Schemas.file && await this._fileExistsSafe(originalUri)) {
          return attachment;
        }
        const bytes = await this._readClientResource(originalUri, clientId);
        const basename = this._attachmentBasename(attachment.label, getMediaMime(originalUri.path));
        return this._writeAndRewrite(attachment, bytes, basename, attachmentsRoot);
      }
    } catch (err) {
      this._logService.warn(`[AgentService] Failed to rewrite attachment '${attachment.label}': ${toErrorMessage(err)}`);
    }
    return attachment;
  }
  /**
   * Like {@link IFileService.exists} but never throws (e.g. when no provider
   * is registered for the URI scheme), returning `false` in that case.
   */
  async _fileExistsSafe(uri) {
    try {
      return await this._fileService.exists(uri);
    } catch {
      return false;
    }
  }
  /**
   * Reads `originalUri` through the `vscode-agent-client` filesystem
   * provider so it is fetched from the originating client. Falls back to
   * a direct read against `originalUri` when no client filesystem
   * authority is registered for `clientId` (e.g. unit tests, in-process
   * agent host with a local URI).
   */
  async _readClientResource(originalUri, clientId) {
    const proxiedUri = clientId ? toAgentClientUri(originalUri, clientId) : originalUri;
    try {
      const contents = await this._fileService.readFile(proxiedUri);
      return contents.value.buffer;
    } catch (err) {
      if (proxiedUri !== originalUri) {
        try {
          const contents = await this._fileService.readFile(originalUri);
          return contents.value.buffer;
        } catch {
        }
      }
      throw err;
    }
  }
  async _writeAndRewrite(original, bytes, basename, attachmentsRoot) {
    const id = generateUuid();
    const target = joinPath(attachmentsRoot, id, basename);
    await this._fileService.writeFile(target, VSBuffer.wrap(bytes));
    const rewritten = {
      type: MessageAttachmentKind.Resource,
      uri: target.toString(),
      label: original.label,
      displayKind: original.displayKind,
      range: original.range,
      _meta: original._meta
    };
    if (original.type === MessageAttachmentKind.Resource && original.selection) {
      rewritten.selection = original.selection;
    }
    return rewritten;
  }
  /**
   * Pick a sensible on-disk basename for the snapshotted attachment,
   * preserving a usable extension where possible so the SDK and other
   * downstream consumers can detect the right type from the path alone.
   */
  _attachmentBasename(label, contentType) {
    const safeLabel = (label || "attachment").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_");
    if (resourcesExtname(URI.file(safeLabel))) {
      return safeLabel;
    }
    const ext = contentType ? getExtensionForMimeType(contentType) : void 0;
    return ext ? `${safeLabel}${ext}` : safeLabel;
  }
  async resourceList(uri) {
    let stat;
    try {
      stat = await this._fileService.resolve(uri);
    } catch {
      throw new ProtocolError(AhpErrorCodes.NotFound, `Directory not found: ${uri.toString()}`);
    }
    if (!stat.isDirectory) {
      throw new ProtocolError(AhpErrorCodes.NotFound, `Not a directory: ${uri.toString()}`);
    }
    const entries = (stat.children ?? []).map((child) => ({
      name: child.name,
      type: child.isDirectory ? "directory" : "file"
    }));
    return { entries };
  }
  async restoreSession(session) {
    const sessionStr = session.toString();
    this._cancelPendingSessionGc(session);
    this._cancelPendingSessionRelease(session);
    await this._releaseSessionInFlight.get(sessionStr);
    const inFlight = this._restoreSessionInFlight.get(sessionStr);
    if (inFlight) {
      return inFlight;
    }
    if (this._stateManager.getSessionState(sessionStr)) {
      return;
    }
    const restore = this._doRestoreSession(session, sessionStr);
    this._restoreSessionInFlight.set(sessionStr, restore);
    try {
      await restore;
    } finally {
      if (this._restoreSessionInFlight.get(sessionStr) === restore) {
        this._restoreSessionInFlight.delete(sessionStr);
      }
    }
  }
  /** Emits one {@link AgentHostLegacyMigrationEvent} for a legacy-session adoption attempt. */
  _reportLegacyMigration(provider, outcome, startTime, extra) {
    this._telemetryService.publicLog2("agentHost.legacyCopilotCliMigration", {
      provider,
      outcome,
      success: outcome === "migrated" && (extra.turnCount ?? 0) > 0,
      turnCount: extra.turnCount ?? 0,
      durationMs: Date.now() - startTime,
      hasProject: extra.hasProject ?? false,
      hasWorktree: extra.hasWorktree ?? false,
      workingDirectoryCount: extra.workingDirectoryCount ?? 0,
      errorMessage: extra.errorMessage
    });
  }
  async _doRestoreSession(session, sessionStr) {
    if (this._stateManager.getSessionState(sessionStr)) {
      return;
    }
    const agent = this._findProviderForSession(session);
    if (!agent) {
      throw new ProtocolError(AHP_SESSION_NOT_FOUND, `No agent for session: ${sessionStr}`);
    }
    if (await this._sessionRegistry.isTombstoned(session)) {
      throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session was explicitly deleted: ${sessionStr}`);
    }
    const registeredSession = (await this._listRegisteredSessions()).find((entry) => entry.session.toString() === sessionStr);
    const external = registeredSession?.external ?? false;
    const migrateLegacyEnabled = this._configurationService.getRootValue(platformRootSchema, AgentHostMigrateLegacyCopilotCliEnabledConfigKey) === true;
    const migrationStartTime = Date.now();
    let adoption = { adopted: false, eligible: false };
    if (!external && migrateLegacyEnabled && agent.ensureChatAdopted) {
      try {
        const defaultChat = URI.parse(buildDefaultChatUri(session));
        adoption = await agent.ensureChatAdopted(defaultChat, this._chatContext(session, defaultChat));
      } catch (err) {
        this._reportLegacyMigration(agent.id, "failed", migrationStartTime, { errorMessage: toErrorMessage(err) });
        throw err;
      }
    }
    const adopted = adoption.adopted;
    try {
      const facts = await this._restoreSessionState(agent, session, sessionStr, adopted, external, registeredSession?.source ?? "restore");
      if (adopted) {
        this._reportLegacyMigration(agent.id, "migrated", migrationStartTime, facts);
      } else if (adoption.eligible) {
        this._reportLegacyMigration(agent.id, "skipped", migrationStartTime, { hasProject: facts.hasProject, workingDirectoryCount: facts.workingDirectoryCount });
      }
    } catch (err) {
      if (adopted) {
        this._reportLegacyMigration(agent.id, "failed", migrationStartTime, { errorMessage: toErrorMessage(err) });
      }
      throw err;
    }
  }
  /**
   * Hydrates a restored (or freshly-adopted) session into the state manager and
   * completes all required restore work (turns, metadata, peer chats, config).
   * Returns the facts used for migration telemetry; throws if any required step
   * fails so the caller can report the outcome accurately.
   */
  async _restoreSessionState(agent, session, sessionStr, adopted, external, registrationSource) {
    let meta = await this._getSessionMetadataForRestore(agent, session, external);
    if (!meta) {
      throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found on backend: ${sessionStr}`);
    }
    let adoptedWorktree = false;
    if (adopted && this._worktree) {
      const adoptedWorkingDirectory = meta.workingDirectories?.[0];
      if (adoptedWorkingDirectory) {
        try {
          if (await this._worktree.adoptExistingWorktreeMetadata(session, adoptedWorkingDirectory)) {
            adoptedWorktree = true;
            const worktreeProject = await this._worktree.resolveWorktreeProject(session);
            if (worktreeProject) {
              meta = { ...meta, project: worktreeProject };
            }
          }
        } catch (err) {
          this._logService.warn(`[AgentService] adopt: worktree metadata bridge failed for ${sessionStr}`, err);
        }
      }
    }
    if (!meta.project && !readSessionWorkspaceless(meta._meta) && this._worktree) {
      const workingDirectory = meta.workingDirectories?.[0];
      if (workingDirectory) {
        try {
          const project = await this._worktree.recordExternalWorktreeProject(session, workingDirectory);
          if (project) {
            adoptedWorktree = true;
            meta = { ...meta, project };
          }
        } catch (err) {
          this._logService.warn(`[AgentService] restore: external worktree project discovery failed for ${sessionStr}`, err);
        }
      }
    }
    const defaultChatUri = URI.parse(buildDefaultChatUri(sessionStr));
    const defaultChatProviderData = await this._readDefaultChatProviderData(session);
    const chatContext = this._chatContext(session, defaultChatUri);
    const recoveredDefaultChat = !external && defaultChatProviderData === void 0 ? await agent.recoverLegacyChat?.(defaultChatUri, chatContext) : void 0;
    if (recoveredDefaultChat?.providerData !== void 0) {
      await this._persistDefaultChatBacking({ session, chat: recoveredDefaultChat });
    }
    const providerData = defaultChatProviderData ?? recoveredDefaultChat?.providerData;
    const materializedDefaultChat = await agent.materializeChat(defaultChatUri, chatContext, providerData);
    if (providerData === void 0 && materializedDefaultChat?.providerData !== void 0) {
      await this._persistDefaultChatBacking({ session, chat: materializedDefaultChat });
    }
    if (providerData === void 0 && materializedDefaultChat?.providerData === void 0) {
      this._logService.warn(`[AgentService] Restoring default chat ${defaultChatUri.toString()} with no persisted or recovered provider backing (agent=${agent.id})`);
    }
    let turns;
    try {
      turns = await this._getChatMessages(agent, defaultChatUri, session);
    } catch (err) {
      if (err instanceof ProtocolError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Failed to restore session ${sessionStr}: ${message}`);
    }
    let title = meta.summary ?? "Session";
    let isRead;
    let isArchived;
    let persistedConfigValues;
    let changes;
    let gitMetadata;
    let changesetMetadata;
    let sessionMetadata;
    const ref = this._sessionDataService.tryOpenDatabase?.(session);
    if (ref) {
      try {
        const db = await ref;
        if (db) {
          try {
            const m = await db.object.getMetadataObject({
              customTitle: true,
              [AH_META_IS_READ_DB_KEY]: true,
              [AH_META_IS_ARCHIVED_DB_KEY]: true,
              [AH_META_IS_DONE_DB_KEY]: true,
              configValues: true,
              [AH_META_WORKSPACELESS_DB_KEY]: true,
              [SESSION_META_MULTI_ROOT_KEY]: true,
              ...GIT_DB_METADATA_KEYS,
              ...CHANGESET_DB_METADATA_KEYS
            });
            if (m.customTitle) {
              title = m.customTitle;
            }
            if (m[AH_META_IS_READ_DB_KEY] !== void 0) {
              isRead = m[AH_META_IS_READ_DB_KEY] === "true";
            }
            const persistedArchived = m[AH_META_IS_ARCHIVED_DB_KEY] ?? m[AH_META_IS_DONE_DB_KEY];
            if (persistedArchived !== void 0) {
              isArchived = persistedArchived === "true";
            }
            changesetMetadata = m;
            if (changesetMetadata[META_CHANGES_SUMMARY]) {
              try {
                changes = JSON.parse(changesetMetadata[META_CHANGES_SUMMARY]);
              } catch (err) {
                this._logService.warn(`[AgentService] Failed to parse changes summary for ${sessionStr}: ${toErrorMessage(err)}`);
              }
            }
            gitMetadata = m;
            if (gitMetadata[META_GIT_STATE]) {
              try {
                const gitState = JSON.parse(gitMetadata[META_GIT_STATE]);
                sessionMetadata = { [SESSION_META_GIT_KEY]: gitState };
              } catch (err) {
                this._logService.warn(`[AgentService] Failed to parse Git state for ${sessionStr}: ${toErrorMessage(err)}`);
              }
            }
            if (gitMetadata[META_GITHUB_STATE]) {
              try {
                const githubState = JSON.parse(gitMetadata[META_GITHUB_STATE]);
                sessionMetadata = {
                  ...sessionMetadata ? sessionMetadata : {},
                  [SESSION_META_GITHUB_KEY]: githubState
                };
              } catch (err) {
                this._logService.warn(`[AgentService] Failed to parse GitHub state for ${sessionStr}: ${toErrorMessage(err)}`);
              }
            }
            if (gitMetadata[META_SOURCE_CONTROL_STATE]) {
              try {
                sessionMetadata = withSessionSourceControlState(sessionMetadata, parsePersistedSourceControlState(gitMetadata[META_SOURCE_CONTROL_STATE]));
              } catch (err) {
                this._logService.warn(`[AgentService] Failed to parse source-control state for ${sessionStr}: ${toErrorMessage(err)}`);
              }
            }
            if (m[AH_META_WORKSPACELESS_DB_KEY] !== void 0) {
              sessionMetadata = withSessionWorkspaceless(sessionMetadata, m[AH_META_WORKSPACELESS_DB_KEY] === "true");
            }
            sessionMetadata = withSessionMultiRootMetadata(sessionMetadata, parseSessionMultiRootMetadata(m[SESSION_META_MULTI_ROOT_KEY]));
            if (m.configValues) {
              try {
                persistedConfigValues = JSON.parse(m.configValues);
              } catch (err) {
                this._logService.warn(`[AgentService] Failed to parse persisted configValues for ${sessionStr}: ${toErrorMessage(err)}`);
              }
            }
          } finally {
            db.dispose();
          }
        }
      } catch {
      }
    }
    let status = SessionStatus.Idle;
    if (isRead) {
      status |= SessionStatus.IsRead;
    }
    if (isArchived) {
      status |= SessionStatus.IsArchived;
    }
    const providerMeta = withSessionMultiRootMetadata(meta._meta, void 0);
    let restoredMeta = sessionMetadata || providerMeta ? { ...providerMeta ?? {}, ...sessionMetadata ?? {} } : void 0;
    restoredMeta = withSessionMultiRootMetadata(restoredMeta, readSessionMultiRootMetadata(sessionMetadata));
    restoredMeta = withSessionExternal(restoredMeta, external);
    const summary = {
      resource: sessionStr,
      provider: agent.id,
      title,
      status,
      createdAt: new Date(meta.startTime).toISOString(),
      modifiedAt: new Date(meta.modifiedTime).toISOString(),
      ...meta.project ? { project: { uri: meta.project.uri.toString(), displayName: meta.project.displayName } } : {},
      changes: meta.changes ?? changes,
      workingDirectories: meta.workingDirectories?.map((d) => d.toString()),
      _meta: restoredMeta
    };
    const [defaultDraft, defaultChatTitle] = await Promise.all([
      this._getChatDraft(session, defaultChatUri),
      this._readPersistedChatTitle(session, defaultChatUri)
    ]);
    const restoredDraft = meta.model ? { ...defaultDraft ?? { text: "", origin: { kind: MessageKind.User } }, model: meta.model } : defaultDraft;
    const mergedTurns = await this._interleaveLocalTurns(sessionStr, defaultChatUri.toString(), turns);
    const registered = await this._retryRegistryMutation(
      () => this._sessionRegistry.register(session, { provider: agent.id, startTime: meta.startTime, source: registrationSource }, { checkTombstone: true }),
      `registration for restored session ${session.toString()}`
    );
    if (!registered) {
      throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session was explicitly deleted: ${sessionStr}`);
    }
    this._stateManager.restoreSession(summary, mergedTurns, { draft: restoredDraft, defaultChatTitle });
    this._serverToolHost.advertise(sessionStr);
    if (adopted && this._checkpointService.adoptLegacyCheckpoints) {
      try {
        const checkpointWorkingDirectory = meta.workingDirectories?.[0];
        if (checkpointWorkingDirectory) {
          await this._checkpointService.adoptLegacyCheckpoints(session, checkpointWorkingDirectory, AgentSession.id(session), mergedTurns.map((t) => t.id));
        }
      } catch (err) {
        this._logService.warn(`[AgentService] adopt: checkpoint bridge failed for ${sessionStr}`, err);
      }
    }
    const promises = [];
    await this._registerRestoredSubagentSummaries(agent, session, mergedTurns);
    promises.push(this._restorePeerChats(agent, session));
    this._changesetCoordinator.onSessionRestored(sessionStr, changesetMetadata ?? {});
    if (summary._meta) {
      this._stateManager.setSessionMeta(sessionStr, summary._meta);
    }
    const restoredConfigValues = meta.workingDirectories?.length ? { [SessionConfigKey.Isolation]: "folder", ...persistedConfigValues } : persistedConfigValues;
    const [restoredConfig, restoredCustomizations] = await Promise.all([
      this._resolveCreatedSessionConfig(agent, {
        workingDirectories: meta.workingDirectories,
        config: restoredConfigValues
      }),
      agent.getChatCustomizations(defaultChatUri, chatContext, this._hostCustomizations(session)).catch((err) => {
        this._logService.error("[AgentService] restoreSession: failed to resolve chat customizations", err);
        return void 0;
      }),
      ...promises
    ]);
    if (restoredConfig) {
      this._stateManager.setSessionConfig(sessionStr, restoredConfig);
    }
    if (restoredCustomizations && restoredCustomizations.length > 0) {
      this._stateManager.setSessionCustomizations(sessionStr, restoredCustomizations);
    }
    this._logService.info(`[AgentService] Restored session ${sessionStr} with ${turns.length} turns`);
    void this._gitStateService.attachSessionGitHubPullRequest(sessionStr, meta.workingDirectories?.[0]);
    return {
      turnCount: mergedTurns.length,
      hasProject: !!meta.project,
      hasWorktree: adoptedWorktree,
      workingDirectoryCount: meta.workingDirectories?.length ?? 0
    };
  }
  /**
   * Restores the additional (non-default) peer chats for a session.
   *
   * Enumeration is driven by the orchestrator's OWN persisted catalog (the
   * {@link PEER_CHATS_METADATA_KEY} blob). Each catalog entry is registered
   * immediately with its persisted title, draft, origin, and provider data.
   * Its backing and history remain unloaded until the peer chat is requested.
   *
   * When the orchestrator catalog is absent ({@link _readPersistedPeerChatCatalog}
   * returns `undefined`) the session predates orchestrator-owned persistence:
   * a one-time migration ({@link _migrateLegacyPeerChats}) drains the agent's
   * legacy `*.chats` enumeration into the catalog so it is never consulted
   * again.
   */
  async _restorePeerChats(agent, session) {
    const persisted = await this._readPersistedPeerChatCatalog(session);
    if (persisted !== void 0) {
      await this._restorePeerChatsFromCatalog(session, persisted);
      return;
    }
    await this._migrateLegacyPeerChats(agent, session);
  }
  /**
   * One-time migration for sessions persisted before the orchestrator owned
   * the peer-chat catalog: enumerate the agent's legacy `*.chats`
   * ({@link IAgent.listLegacyChatBackings}), register them via the same path as the
   * new catalog, then write the orchestrator {@link PEER_CHATS_METADATA_KEY}
   * blob so subsequent restores read the new catalog and never consult the
   * legacy read again. No-op when the agent has no legacy enumeration or none
   * is persisted.
   */
  async _migrateLegacyPeerChats(agent, session) {
    const legacy = await agent.listLegacyChatBackings?.(session);
    if (!legacy || legacy.length === 0) {
      await this._enqueuePeerChatCatalogWrite(session, () => []);
      return;
    }
    const entries = legacy.map((chat) => ({
      uri: chat.uri.toString(),
      ...chat.providerData !== void 0 ? { providerData: chat.providerData } : {}
    }));
    await this._restorePeerChatsFromCatalog(session, entries);
    await this._enqueuePeerChatCatalogWrite(session, () => [...entries]);
  }
  /**
   * Registers a set of peer chats from an enumerated catalog in catalog order.
   * Titles and drafts are metadata-only reads; backing sessions and histories
   * are loaded on the first content request.
   */
  async _restorePeerChatsFromCatalog(session, entries) {
    const restored = await Promise.all(entries.map(async (entry) => {
      let chatUri;
      try {
        chatUri = URI.parse(entry.uri);
      } catch (err) {
        this._logService.warn(`[AgentService] Skipping malformed persisted peer chat URI '${entry.uri}': ${toErrorMessage(err)}`);
        return void 0;
      }
      const [title, draft] = await Promise.all([
        this._readPersistedChatTitle(session, chatUri),
        this._getChatDraft(session, chatUri)
      ]);
      return { chatUri, title, draft, providerData: entry.providerData, origin: entry.origin };
    }));
    for (const item of restored) {
      if (!item) {
        continue;
      }
      const { chatUri, title, draft, providerData, origin } = item;
      if (this._stateManager.getChatState(chatUri.toString())) {
        continue;
      }
      this._stateManager.registerRestoredChatSummary(session.toString(), chatUri.toString(), {
        title,
        draft,
        providerData,
        origin,
        resolver: (currentProviderData) => this._materializeRestoredPeerChat(session, chatUri, currentProviderData)
      });
    }
  }
  /**
   * Materializes provider backing and history for the state-manager-owned
   * restored chat entry. This callback never mutates state manager state.
   *
   * `materializeChat` may report a fresh `backingSession` for a peer chat
   * being restored (the same field used at create time to trigger
   * `_markChatBacking`); when it does, this marks it the same way create
   * does, with the same retry/suppression semantics, so a restored peer
   * chat's backing session cannot leak into the top-level session list.
   */
  async _materializeRestoredPeerChat(session, chat, providerData) {
    const chatKey = chat.toString();
    const agent = this._findProviderForSession(session);
    if (!agent) {
      throw new Error(`No agent provider for restored peer chat: ${chatKey}`);
    }
    try {
      const result = await agent.materializeChat(chat, this._chatContext(session, chat), providerData);
      if (result?.backingSession) {
        await this._markChatBacking(result.backingSession, chat);
      }
      const turns = await this._getChatMessages(agent, chat, session);
      return { turns: await this._interleaveLocalTurns(session.toString(), chatKey, turns) };
    } catch (err) {
      this._logService.warn(`[AgentService] Failed to materialize peer chat ${chatKey}: ${toErrorMessage(err)}`);
      throw err;
    }
  }
  /**
   * Re-persists a peer chat's opaque `providerData` blob when the agent
   * reports it changed (e.g. per-chat model switch or fork remap).
   */
  _onChatDataChanged(e) {
    const sessionStr = parseDefaultChatUri(e.chat);
    if (sessionStr === void 0) {
      this._logService.warn(`[AgentService] onDidChangeChatData for malformed chat URI: ${e.chat.toString()}`);
      return;
    }
    if (isDefaultChatUri(e.chat)) {
      void this._persistDefaultChatBacking({ session: URI.parse(sessionStr), chat: e }).catch((err) => this._logService.error(err, `[AgentService] Failed to persist default-chat backing for ${e.chat.toString()}`));
      return;
    }
    const session = this._stateManager.getSessionState(sessionStr);
    if (this._disposingPeerChats.has(e.chat.toString()) || !session?.chats.some((chat) => chat.resource.toString() === e.chat.toString())) {
      return;
    }
    this._stateManager.updateChatProviderData(e.chat.toString(), e.providerData);
    void this._persistPeerChat(URI.parse(sessionStr), e.chat, e.providerData).catch((err) => this._logService.error(err, `[AgentService] Failed to persist peer-chat backing for ${e.chat.toString()}`));
  }
  /**
   * Keeps agent-spawned chats in the catalog early enough for their first turn:
   * a `subagent_started` progress signal feeds the same handler as
   * {@link IAgent.onDidSpawnChat}. Completion is ignored here because spawned
   * chats stay live until session teardown, and overlap with the agent's own
   * spawn bridge is safe because `addChat` is idempotent.
   */
  _sequenceSpawnedChat(signal) {
    const spawn = SubagentChatSignal.toSpawnEvent(signal);
    if (spawn) {
      this._onChatSpawned(spawn);
    }
  }
  /** Marks a subagent chat as pending once its confirmed tool call reaches (or is about to reach) `Running`. */
  _trackPendingSubagentChatFromEnvelope(envelope) {
    const { channel, action } = envelope;
    if (action.type === ActionType.ChatToolCallStart || action.type === ActionType.ChatToolCallDelta || action.type === ActionType.ChatToolCallReady) {
      const key = `${channel}:${action.toolCallId}`;
      const subagentChatUri = readToolCallMeta(action).subagentChatUri ?? this._pendingSubagentToolCalls.get(key);
      if (subagentChatUri === void 0) {
        return;
      }
      if (action.type === ActionType.ChatToolCallReady && action.confirmed) {
        this._pendingSubagentToolCalls.delete(key);
        this._armPendingSubagentChat(subagentChatUri);
        return;
      }
      this._pendingSubagentToolCalls.set(key, subagentChatUri);
      return;
    }
    if (action.type === ActionType.ChatToolCallConfirmed) {
      const key = `${channel}:${action.toolCallId}`;
      const subagentChatUri = this._pendingSubagentToolCalls.get(key);
      if (subagentChatUri === void 0) {
        return;
      }
      this._pendingSubagentToolCalls.delete(key);
      if (action.approved) {
        this._armPendingSubagentChat(subagentChatUri);
      }
      return;
    }
    if (action.type === ActionType.ChatToolCallComplete) {
      this._pendingSubagentToolCalls.delete(`${channel}:${action.toolCallId}`);
    }
  }
  _armPendingSubagentChat(subagentChatUri) {
    if (this._pendingSubagentChats.has(subagentChatUri) || this._stateManager.getSnapshot(subagentChatUri)) {
      return;
    }
    const deferred = new DeferredPromise();
    this._pendingSubagentChats.set(subagentChatUri, deferred);
    this._pendingSubagentChatTimeouts.set(subagentChatUri, disposableTimeout(() => {
      this._pendingSubagentChats.delete(subagentChatUri);
      this._pendingSubagentChatTimeouts.deleteAndDispose(subagentChatUri);
      deferred.complete();
    }, SUBAGENT_CHAT_PENDING_TIMEOUT_MS));
  }
  _resolvePendingSubagentChat(resource) {
    const deferred = this._pendingSubagentChats.get(resource);
    if (!deferred) {
      return;
    }
    this._pendingSubagentChats.delete(resource);
    this._pendingSubagentChatTimeouts.deleteAndDispose(resource);
    deferred.complete();
  }
  /**
   * Routes an agent-spawned chat (e.g. a sub-agent delegated by a tool
   * call) straight into the chat catalog via {@link IAgentHostStateManager.addChat},
   * so harness-spawned chats and user-driven chats share ONE membership path.
   * The {@link IAgentSpawnChatEvent.parent} spawn edge is recorded as
   * the chat's {@link ChatOriginKind.Tool} origin. Spawned chats are
   * not written to the orchestrator's persisted peer-chat catalog — they are
   * transient children re-derived from the parent's event log on restore.
   */
  _onChatSpawned(e) {
    this._stateManager.addChat(e.session.toString(), e.chat.toString(), {
      ...e.title !== void 0 ? { title: e.title } : {},
      ...e.parent ? {
        origin: { kind: ChatOriginKind.Tool, chat: e.parent.chat.toString(), toolCallId: e.parent.toolCallId },
        // Subagent worker chats are observable but not directly steerable:
        // the user watches them and steers the lead chat. Mark read-only so
        // the UI hides the composer and shows a lock (the agent-team pattern).
        interactivity: ChatInteractivity.ReadOnly
      } : {}
    });
    this._resolvePendingSubagentChat(e.chat.toString());
  }
  /**
   * Persists a freshly-created (or recovered) default chat's durable state:
   * its opaque `providerData` blob and, separately, its backing-session
   * marker. The two writes are independent — a failure persisting
   * `providerData` must not skip marking the backing
   * session, since that marker is what keeps the backing session out of the
   * top-level list; `_markChatBacking` has its own retry/suppression and
   * never throws. The provider-data failure is rethrown after the marker
   * attempt so creation can roll back instead of reporting a session whose
   * concrete backing cannot be restored.
   */
  async _persistDefaultChatBacking(created) {
    const providerData = created.chat?.providerData;
    let providerDataError;
    if (providerData !== void 0) {
      const ref = this._sessionDataService.openDatabase(created.session);
      try {
        await ref.object.setMetadata(DEFAULT_CHAT_PROVIDER_DATA_METADATA_KEY, providerData);
      } catch (err) {
        this._logService.warn(`[AgentService] failed to persist default-chat provider data for ${created.session.toString()}`, err);
        providerDataError = err instanceof Error ? err : new Error(String(err));
      } finally {
        ref.dispose();
      }
    }
    if (created.chat?.backingSession) {
      await this._markChatBacking(created.chat.backingSession, URI.parse(buildDefaultChatUri(created.session)));
    }
    if (providerDataError) {
      throw providerDataError;
    }
  }
  async _readDefaultChatProviderData(session) {
    const ref = await this._sessionDataService.tryOpenDatabase?.(session);
    if (!ref) {
      return void 0;
    }
    try {
      return await ref.object.getMetadata(DEFAULT_CHAT_PROVIDER_DATA_METADATA_KEY);
    } finally {
      ref.dispose();
    }
  }
  /**
   * Reads the orchestrator's persisted peer-chat catalog for a session.
   * Returns `undefined` when the session has no catalog yet (a legacy session
   * predating orchestrator-owned persistence, or a corrupt blob); the caller
   * then performs a one-time migration from the agent's legacy `*.chats`
   * enumeration (see {@link _restorePeerChats} / {@link _migrateLegacyPeerChats}).
   * An empty array means the session is known to have no peer chats, so
   * migration is skipped.
   */
  async _readPersistedPeerChatCatalog(session) {
    const ref = await this._sessionDataService.tryOpenDatabase?.(session);
    if (!ref) {
      return void 0;
    }
    try {
      const raw = await ref.object.getMetadata(PEER_CHATS_METADATA_KEY);
      if (raw === void 0) {
        return void 0;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        this._logService.warn(`[AgentService] Ignoring malformed peer-chat catalog for ${session.toString()}`);
        return void 0;
      }
      return parsed.filter((entry) => typeof entry?.uri === "string").map((entry) => ({
        uri: entry.uri,
        ...typeof entry.providerData === "string" ? { providerData: entry.providerData } : {},
        ...entry.origin !== void 0 ? { origin: entry.origin } : {}
      }));
    } catch (err) {
      this._logService.warn(`[AgentService] Failed to read peer-chat catalog for ${session.toString()}: ${toErrorMessage(err)}`);
      return void 0;
    } finally {
      ref.dispose();
    }
  }
  /**
   * Marks a chat's backing SDK session so legacy discovery cannot register
   * it as a standalone top-level session. Best-effort and never throws:
   * callers (chat creation / restore) must not fail just because this
   * durable write did. The write is retried once; if it still fails, the
   * backing session is added to `_unpersistedChatBackings` so
   * `_isChatBacking` (external discovery) and `listSessions`'s overlay filter keep
   * suppressing it for the rest of this process's lifetime even without a
   * persisted marker. A later successful call for the same session (e.g. a
   * retried caller) clears any stale suppression entry.
   */
  async _markChatBacking(backingSession, chat) {
    const backingSessionStr = backingSession.toString();
    const write = async () => {
      const ref = this._sessionDataService.openDatabase(backingSession);
      try {
        await ref.object.setMetadata(CHAT_BACKING_METADATA_KEY, chat.toString());
      } finally {
        ref.dispose();
      }
    };
    try {
      await write();
      this._unpersistedChatBackings.delete(backingSessionStr);
    } catch (err) {
      this._logService.warn(`[AgentService] failed to mark backing session ${backingSessionStr} for chat ${chat.toString()}, retrying`, err);
      try {
        await write();
        this._unpersistedChatBackings.delete(backingSessionStr);
      } catch (retryErr) {
        this._logService.warn(`[AgentService] retry failed to mark backing session ${backingSessionStr} for chat ${chat.toString()}; suppressing it in-process instead`, retryErr);
        this._unpersistedChatBackings.add(backingSessionStr);
      }
    }
  }
  /**
   * Inserts or updates a single peer chat in the orchestrator's persisted
   * catalog, recording its opaque `providerData` verbatim (or clearing it when
   * `undefined`). When `origin` is supplied it is stored as the chat's
   * provenance; when omitted (e.g. a provider-driven `providerData` refresh via
   * {@link _onChatDataChanged}) any previously persisted origin is preserved so
   * a data refresh never drops a side chat's source boundary. Serialized per
   * session via {@link _enqueuePeerChatCatalogWrite}.
   */
  _persistPeerChat(session, chat, providerData, origin) {
    const chatUri = chat.toString();
    return this._enqueuePeerChatCatalogWrite(session, (entries) => {
      const existing = entries.find((entry) => entry.uri === chatUri);
      const effectiveOrigin = origin ?? existing?.origin;
      const next = entries.filter((entry) => entry.uri !== chatUri);
      next.push({
        uri: chatUri,
        ...providerData !== void 0 ? { providerData } : {},
        ...effectiveOrigin !== void 0 ? { origin: effectiveOrigin } : {}
      });
      return next;
    });
  }
  /**
   * Removes a peer chat from the orchestrator's persisted catalog. Serialized
   * per session via {@link _enqueuePeerChatCatalogWrite}.
   */
  _removePersistedPeerChat(session, chat) {
    const chatUri = chat.toString();
    return this._enqueuePeerChatCatalogWrite(session, (entries) => entries.filter((entry) => entry.uri !== chatUri));
  }
  /**
   * Chains a read-modify-write of a session's persisted peer-chat catalog
   * behind any in-flight write for the same session, so concurrent
   * create/dispose/data-change updates can't clobber each other.
   */
  _enqueuePeerChatCatalogWrite(session, mutate) {
    const key = session.toString();
    const previous = this._peerChatCatalogWrites.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {
    }).then(() => this._applyPeerChatCatalogWrite(session, mutate));
    const clear = () => {
      if (this._peerChatCatalogWrites.get(key) === tracked) {
        this._peerChatCatalogWrites.delete(key);
      }
    };
    const tracked = next.then(clear, (error) => {
      clear();
      throw error;
    });
    this._peerChatCatalogWrites.set(key, tracked);
    return tracked;
  }
  async _applyPeerChatCatalogWrite(session, mutate) {
    const ref = this._sessionDataService.openDatabase(session);
    try {
      let current = [];
      try {
        const raw = await ref.object.getMetadata(PEER_CHATS_METADATA_KEY);
        if (raw !== void 0) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            current = parsed.filter((entry) => typeof entry?.uri === "string").map((entry) => ({
              uri: entry.uri,
              ...typeof entry.providerData === "string" ? { providerData: entry.providerData } : {},
              ...entry.origin !== void 0 ? { origin: entry.origin } : {}
            }));
          }
        }
      } catch (err) {
        this._logService.warn(`[AgentService] Replacing malformed peer-chat catalog for ${session.toString()}: ${toErrorMessage(err)}`);
      }
      const updated = mutate(current);
      await ref.object.setMetadata(PEER_CHATS_METADATA_KEY, JSON.stringify(updated));
    } finally {
      ref.dispose();
    }
  }
  /** Reads a chat's persisted custom title (default or peer chat), if any. */
  async _readPersistedChatTitle(session, chatUri) {
    const ref = await this._sessionDataService.tryOpenDatabase?.(session);
    if (!ref) {
      return void 0;
    }
    try {
      return await ref.object.getMetadata(`customChatTitle:${chatUri.toString()}`) ?? void 0;
    } catch {
      return void 0;
    } finally {
      ref.dispose();
    }
  }
  async _getChatDraft(session, chatUri) {
    const ref = await this._sessionDataService.tryOpenDatabase(session);
    if (!ref) {
      return void 0;
    }
    try {
      return await ref.object.getChatDraft(chatUri);
    } finally {
      ref.dispose();
    }
  }
  async _getSessionMetadataForRestore(agent, session, external) {
    const sessionStr = session.toString();
    const chat = URI.parse(buildDefaultChatUri(session));
    try {
      const metadata = await agent.getChatMetadata(chat, this._chatContext(session, chat), await this._readDefaultChatProviderData(session));
      return await this._withWorktreeProject(session, metadata ? this._toSessionMetadata(metadata) : void 0);
    } catch (err) {
      if (err instanceof ProtocolError) {
        throw err;
      }
      try {
        return await this._withWorktreeProject(session, await this._getSessionMetadataFromCatalog(agent, session, external));
      } catch (fallbackErr) {
        if (fallbackErr instanceof ProtocolError) {
          const message = err instanceof Error ? err.message : String(err);
          throw new ProtocolError(fallbackErr.code, `Failed to get chat metadata for ${sessionStr}: ${message}; ${fallbackErr.message}`, fallbackErr.data);
        }
        throw fallbackErr;
      }
    }
  }
  /**
   * Merges the repository project for a worktree-isolated session onto its
   * restored metadata so the session groups under the repository (not the
   * `<repo>.worktrees/<name>` directory) in the sessions UI. No-op for folder
   * sessions and for `undefined` metadata. Host-owned so agents stay unaware.
   */
  async _withWorktreeProject(session, meta) {
    if (!meta || !this._worktree) {
      return meta;
    }
    const project = await this._worktree.resolveWorktreeProject(session);
    return project ? { ...meta, project } : meta;
  }
  async _getSessionMetadataFromCatalog(agent, session, external) {
    const sessionStr = session.toString();
    let allSessions;
    try {
      if (external) {
        return void 0;
      }
      allSessions = await this._enumerateLegacyProviderSessions(agent);
    } catch (err) {
      if (err instanceof ProtocolError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Failed to list sessions for ${sessionStr}: ${message}`);
    }
    return allSessions?.find((candidate) => candidate.session.toString() === sessionStr);
  }
  async resourceRead(uri) {
    const editAttributionRequest = parseEditAttributionResource(uri);
    if (editAttributionRequest?.kind === "prepare") {
      const prepared = await this.prepareEditAttributionFlush(editAttributionRequest.params);
      return {
        data: JSON.stringify(prepared ?? null),
        encoding: ContentEncoding.Utf8,
        contentType: "application/json"
      };
    }
    if (editAttributionRequest?.kind === "commit") {
      const result = await this.commitEditAttributionFlush(editAttributionRequest.params);
      return {
        data: JSON.stringify(result),
        encoding: ContentEncoding.Utf8,
        contentType: "application/json"
      };
    }
    if (editAttributionRequest?.kind === "cancel") {
      const result = await this.cancelEditAttributionFlush(editAttributionRequest.params);
      return {
        data: JSON.stringify(result),
        encoding: ContentEncoding.Utf8,
        contentType: "application/json"
      };
    }
    const dbFields = parseSessionDbUri(uri.toString());
    if (dbFields) {
      return this._fetchSessionDbContent(dbFields);
    }
    const blobFields = parseGitBlobUri(uri.toString());
    if (blobFields) {
      return this._fetchGitBlobContent(blobFields);
    }
    try {
      const content = await this._fileService.readFile(uri);
      return {
        data: content.value.toString(),
        encoding: ContentEncoding.Utf8,
        contentType: "text/plain"
      };
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      const result = toFileOperationResult(error);
      if (result === FileOperationResult.FILE_NOT_FOUND) {
        throw new ProtocolError(AhpErrorCodes.NotFound, `Content not found: ${uri.toString()}`);
      }
      if (result === FileOperationResult.FILE_PERMISSION_DENIED) {
        throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${uri.toString()}`);
      }
      throw new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Failed to read content: ${uri.toString()}: ${toErrorMessage(error)}`);
    }
  }
  prepareEditAttributionFlush(params) {
    return this._editAttributionService?.prepareFlush(params) ?? Promise.resolve(void 0);
  }
  commitEditAttributionFlush(params) {
    return this._editAttributionService?.commitFlush(params) ?? Promise.resolve({ outcome: "missing", agentModifiedCount: 0 });
  }
  cancelEditAttributionFlush(params) {
    return this._editAttributionService?.cancelFlush(params) ?? Promise.resolve({ outcome: "missing", agentModifiedCount: 0 });
  }
  async resourceWrite(params) {
    const fileUri = typeof params.uri === "string" ? URI.parse(params.uri) : URI.revive(params.uri);
    try {
      const parent = await this._fileService.stat(resourcesDirname(fileUri));
      if (!parent.isDirectory) {
        throw new ProtocolError(AhpErrorCodes.NotFound, `Parent directory not found: ${fileUri.toString()}`);
      }
    } catch (e) {
      if (e instanceof ProtocolError) {
        throw e;
      }
      const result = toFileOperationResult(e);
      if (result === FileOperationResult.FILE_PERMISSION_DENIED) {
        throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${fileUri.toString()}`);
      }
      throw new ProtocolError(AhpErrorCodes.NotFound, `Parent directory not found: ${fileUri.toString()}`);
    }
    let content;
    if (params.encoding === ContentEncoding.Base64) {
      content = decodeBase64(params.data);
    } else {
      content = VSBuffer.fromString(params.data);
    }
    const mode = params.mode ?? ResourceWriteMode.Truncate;
    const position = params.position ?? 0;
    try {
      await this._resourceWriteQueue.queueFor(fileUri, async () => {
        if (params.ifMatch !== void 0 || mode !== ResourceWriteMode.Truncate || position !== 0) {
          await this._resourceWriteWithMode(fileUri, content, mode, position, params);
        } else if (params.createOnly) {
          await this._createFileExclusive(fileUri, content);
        } else {
          await this._fileService.writeFile(fileUri, content);
        }
      }, extUriBiasedIgnorePathCase);
      return {};
    } catch (e) {
      if (e instanceof ProtocolError) {
        throw e;
      }
      const result = toFileOperationResult(e);
      if (params.createOnly && (result === FileOperationResult.FILE_MODIFIED_SINCE || result === FileOperationResult.FILE_MOVE_CONFLICT)) {
        throw new ProtocolError(AhpErrorCodes.AlreadyExists, `File already exists: ${fileUri.toString()}`);
      }
      if (result === FileOperationResult.FILE_MODIFIED_SINCE) {
        const message = params.ifMatch !== void 0 ? `ifMatch precondition failed for: ${fileUri.toString()}` : `File changed while writing: ${fileUri.toString()}`;
        throw new ProtocolError(AhpErrorCodes.Conflict, message);
      }
      if (result === FileOperationResult.FILE_MOVE_CONFLICT) {
        throw new ProtocolError(AhpErrorCodes.AlreadyExists, `File already exists: ${fileUri.toString()}`);
      }
      if (result === FileOperationResult.FILE_PERMISSION_DENIED) {
        throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${fileUri.toString()}`);
      }
      throw new ProtocolError(AhpErrorCodes.NotFound, `Failed to write file: ${fileUri.toString()}`);
    }
  }
  async _createFileExclusive(fileUri, content) {
    if (fileUri.scheme !== Schemas.file) {
      await this._fileService.createFile(fileUri, content, { overwrite: false });
      return;
    }
    let handle;
    try {
      handle = await open(fileUri.fsPath, "wx");
    } catch (error) {
      if (isErrorWithCode(error, "EEXIST")) {
        throw new ProtocolError(AhpErrorCodes.AlreadyExists, `File already exists: ${fileUri.toString()}`);
      }
      throw error;
    }
    let failure;
    try {
      await handle.writeFile(content.buffer);
    } catch (error) {
      failure = error;
    }
    try {
      await handle.close();
    } catch (error) {
      failure = failure ? new AggregateError([failure, error]) : error;
    }
    if (failure) {
      try {
        await unlink(fileUri.fsPath);
      } catch (cleanupError) {
        throw new AggregateError([failure, cleanupError], `Failed to create and clean up file: ${fileUri.toString()}`);
      }
      throw failure;
    }
  }
  /**
   * Slow-path for {@link resourceWrite} when the caller requested a
   * non-default {@link ResourceWriteMode}, supplied a `position`, or
   * provided an `ifMatch` etag precondition. Reads the current file
   * contents (when needed) and produces a single `writeFile` call that
   * realises the requested splice. A missing file is treated as
   * empty for `append` and `insert` (so the operation behaves like a
   * create); for `truncate` it falls through to a normal write.
   */
  async _resourceWriteWithMode(fileUri, data, mode, position, params) {
    let existing;
    let currentEtag;
    let currentMtime;
    try {
      const file = await this._fileService.readFile(fileUri);
      existing = file.value;
      currentEtag = file.etag;
      currentMtime = file.mtime;
    } catch (e) {
      if (toFileOperationResult(e) !== FileOperationResult.FILE_NOT_FOUND) {
        throw e;
      }
    }
    if (params.createOnly && existing !== void 0) {
      throw new ProtocolError(AhpErrorCodes.AlreadyExists, `File already exists: ${fileUri.toString()}`);
    }
    if (params.ifMatch !== void 0) {
      if (existing === void 0 || currentEtag !== params.ifMatch) {
        throw new ProtocolError(AhpErrorCodes.Conflict, `ifMatch precondition failed for: ${fileUri.toString()}`);
      }
    }
    const base = existing ?? VSBuffer.alloc(0);
    let next;
    switch (mode) {
      case ResourceWriteMode.Append: {
        const eof = base.byteLength;
        const splitAt = Math.max(0, eof - position);
        next = VSBuffer.concat([base.slice(0, splitAt), data, base.slice(splitAt, eof)]);
        break;
      }
      case ResourceWriteMode.Insert: {
        const splitAt = Math.min(position, base.byteLength);
        next = VSBuffer.concat([base.slice(0, splitAt), data, base.slice(splitAt, base.byteLength)]);
        break;
      }
      case ResourceWriteMode.Truncate:
      default: {
        const splitAt = Math.min(position, base.byteLength);
        next = VSBuffer.concat([base.slice(0, splitAt), data]);
        break;
      }
    }
    if (params.createOnly) {
      await this._createFileExclusive(fileUri, next);
    } else {
      await this._fileService.writeFile(fileUri, next, { etag: currentEtag, mtime: currentMtime });
    }
  }
  async resourceCopy(params) {
    const source = URI.parse(params.source);
    const destination = URI.parse(params.destination);
    try {
      await this._fileService.copy(source, destination, !params.failIfExists);
      return {};
    } catch (e) {
      const result = toFileOperationResult(e);
      if (result === FileOperationResult.FILE_MOVE_CONFLICT) {
        throw new ProtocolError(AhpErrorCodes.AlreadyExists, `Destination already exists: ${destination.toString()}`);
      }
      if (result === FileOperationResult.FILE_PERMISSION_DENIED) {
        throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${source.toString()}`);
      }
      throw new ProtocolError(AhpErrorCodes.NotFound, `Source not found: ${source.toString()}`);
    }
  }
  async resourceDelete(params) {
    const fileUri = URI.parse(params.uri);
    try {
      await this._fileService.del(fileUri, { recursive: params.recursive });
      return {};
    } catch (e) {
      if (toFileOperationResult(e) === FileOperationResult.FILE_PERMISSION_DENIED) {
        throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${fileUri.toString()}`);
      }
      throw new ProtocolError(AhpErrorCodes.NotFound, `Resource not found: ${fileUri.toString()}`);
    }
  }
  async resourceMove(params) {
    const source = URI.parse(params.source);
    const destination = URI.parse(params.destination);
    try {
      await this._fileService.move(source, destination, !params.failIfExists);
      return {};
    } catch (e) {
      const result = toFileOperationResult(e);
      if (result === FileOperationResult.FILE_MOVE_CONFLICT) {
        throw new ProtocolError(AhpErrorCodes.AlreadyExists, `Destination already exists: ${destination.toString()}`);
      }
      if (result === FileOperationResult.FILE_PERMISSION_DENIED) {
        throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${source.toString()}`);
      }
      throw new ProtocolError(AhpErrorCodes.NotFound, `Source not found: ${source.toString()}`);
    }
  }
  async resourceResolve(params) {
    const uri = typeof params.uri === "string" ? URI.parse(params.uri) : URI.revive(params.uri);
    try {
      const stat = await this._fileService.stat(uri);
      let type;
      if (stat.isSymbolicLink && params.followSymlinks === false) {
        type = ResourceType.Symlink;
      } else if (stat.isDirectory) {
        type = ResourceType.Directory;
      } else {
        type = ResourceType.File;
      }
      const result = {
        uri: uri.toString(),
        type,
        ...stat.size !== void 0 ? { size: stat.size } : {},
        ...stat.mtime !== void 0 ? { mtime: new Date(stat.mtime).toISOString() } : {},
        ...stat.ctime !== void 0 ? { ctime: new Date(stat.ctime).toISOString() } : {},
        ...stat.etag ? { etag: stat.etag } : {}
      };
      return result;
    } catch (e) {
      if (toFileOperationResult(e) === FileOperationResult.FILE_PERMISSION_DENIED) {
        throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${uri.toString()}`);
      }
      throw new ProtocolError(AhpErrorCodes.NotFound, `Resource not found: ${uri.toString()}`);
    }
  }
  async resourceMkdir(params) {
    const uri = typeof params.uri === "string" ? URI.parse(params.uri) : URI.revive(params.uri);
    try {
      const existing = await this._fileService.stat(uri).catch(() => void 0);
      if (existing && !existing.isDirectory) {
        throw new ProtocolError(AhpErrorCodes.AlreadyExists, `Path exists and is not a directory: ${uri.toString()}`);
      }
      await this._fileService.createFolder(uri);
      return {};
    } catch (e) {
      if (e instanceof ProtocolError) {
        throw e;
      }
      if (toFileOperationResult(e) === FileOperationResult.FILE_PERMISSION_DENIED) {
        throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${uri.toString()}`);
      }
      throw new ProtocolError(AhpErrorCodes.NotFound, `Failed to create directory: ${uri.toString()}`);
    }
  }
  async createResourceWatch(params) {
    const root = typeof params.uri === "string" ? URI.parse(params.uri) : URI.revive(params.uri);
    try {
      await this._fileService.stat(root);
    } catch (e) {
      if (toFileOperationResult(e) === FileOperationResult.FILE_PERMISSION_DENIED) {
        throw new ProtocolError(AhpErrorCodes.PermissionDenied, `Permission denied: ${root.toString()}`);
      }
      throw new ProtocolError(AhpErrorCodes.NotFound, `Resource not found: ${root.toString()}`);
    }
    const channel = buildResourceWatchChannelUri({
      root: root.toString(),
      recursive: params.recursive === true,
      excludes: params.excludes,
      includes: params.includes
    });
    return { channel };
  }
  /**
   * Notifies the agent service that a client subscribed to a resource
   * watch channel. On the first subscriber the underlying
   * {@link IFileService} watcher is attached; subsequent subscribers
   * bump the refcount and cancel any pending grace dispose. Returns
   * the decoded descriptor for use as the subscribe snapshot, or
   * `undefined` when `channel` is not a recognisable
   * `ahp-resource-watch:` URI.
   */
  onResourceWatchSubscribed(channel) {
    const descriptor = parseResourceWatchChannelUri(channel);
    if (!descriptor) {
      return void 0;
    }
    const existing = this._resourceWatches.get(channel);
    if (existing) {
      existing.subscribers++;
      if (existing.pendingGc) {
        existing.pendingGc.clear();
      }
      return existing.descriptor;
    }
    const disposables = new DisposableStore();
    try {
      const root = URI.parse(descriptor.root);
      const watchOptions = {
        recursive: descriptor.recursive,
        excludes: descriptor.excludes?.items ?? [],
        includes: descriptor.includes?.items
      };
      if (descriptor.recursive) {
        disposables.add(this._fileService.watch(root, watchOptions));
        disposables.add(this._fileService.onDidFilesChange((event) => {
          const filtered = collectChangesUnderRoot(event, root);
          if (filtered.length > 0) {
            this._dispatchResourceWatchChanges(channel, filtered);
          }
        }));
      } else {
        const watcher = this._fileService.createWatcher(root, { ...watchOptions, recursive: false });
        disposables.add(watcher);
        disposables.add(watcher.onDidChange((event) => {
          this._dispatchResourceWatchChanges(channel, collectChanges(event));
        }));
      }
    } catch (e) {
      disposables.dispose();
      this._logService.warn(`[AgentService] Failed to start IFileService watcher for ${channel}: ${e instanceof Error ? e.message : String(e)}`);
      return void 0;
    }
    this._resourceWatches.set(channel, {
      channel,
      descriptor,
      subscribers: 1,
      disposables,
      pendingGc: disposables.add(new MutableDisposable()),
      dispose: () => disposables.dispose()
    });
    return descriptor;
  }
  /**
   * Counterpart to {@link onResourceWatchSubscribed}. Decrements the
   * subscriber refcount for a watch channel; when it reaches zero the
   * watcher is held for {@link RESOURCE_WATCH_GRACE_MS} before being
   * disposed, giving a transient disconnect time to resubscribe.
   */
  onResourceWatchUnsubscribed(channel) {
    const entry = this._resourceWatches.get(channel);
    if (!entry) {
      return false;
    }
    entry.subscribers = Math.max(0, entry.subscribers - 1);
    if (entry.subscribers > 0) {
      return true;
    }
    entry.pendingGc.value = disposableTimeout(() => {
      const current = this._resourceWatches.get(channel);
      if (!current || current.subscribers > 0) {
        return;
      }
      this._resourceWatches.deleteAndDispose(channel);
    }, RESOURCE_WATCH_GRACE_MS);
    return true;
  }
  _dispatchResourceWatchChanges(channel, raw) {
    if (raw.length === 0) {
      return;
    }
    const items = raw.map((c) => ({
      uri: c.resource.toString(),
      type: c.type === FileChangeType.ADDED ? ResourceChangeType.Added : c.type === FileChangeType.DELETED ? ResourceChangeType.Deleted : ResourceChangeType.Updated
    }));
    this._stateManager.dispatchServerAction(channel, {
      type: ActionType.ResourceWatchChanged,
      changes: { items }
    });
  }
  async shutdown() {
    this._logService.info("AgentService: shutting down all providers...");
    const promises = [];
    for (const provider of this._providers.values()) {
      promises.push(provider.shutdown());
    }
    try {
      await Promises.settled(promises);
    } finally {
      await this._orchestratorDatabase.close();
      this._sessionToProvider.clear();
      this._downloadProgressInterest.clear();
    }
  }
  /**
   * Wire the network diagnostics service backing {@link getNetworkDiagnosticsInfo}
   * and {@link diagnosticsFetch}. A setter rather than a constructor argument
   * because the service depends on the agent-host proxy resolver, which the
   * remote server constructs lazily — after this service.
   */
  setNetworkDiagnosticsService(service) {
    this._networkDiagnostics = service;
  }
  setEditAttributionService(service) {
    this._editAttributionService = service;
    service.setEnabled(this._stateManager.rootState.config?.values[AgentHostEditTelemetryEnabledConfigKey] !== false);
  }
  async getNetworkDiagnosticsInfo() {
    if (!this._networkDiagnostics) {
      throw new Error("Network diagnostics unavailable: service not wired");
    }
    const providers = [...this._providers.values()];
    const contributions = await Promise.all(providers.map(async (provider) => {
      try {
        return await provider.getNetworkDiagnosticsEndpoints?.() ?? [];
      } catch (error) {
        this._logService.warn(`[AgentService] Failed to resolve network diagnostics endpoints for ${provider.id}: ${error instanceof Error ? error.message : String(error)}`);
        return [];
      }
    }));
    const accounts = await Promise.all(providers.map(async (provider) => {
      try {
        return await provider.getNetworkDiagnosticsAccount?.();
      } catch (error) {
        this._logService.warn(`[AgentService] Failed to resolve network diagnostics account for ${provider.id}: ${error instanceof Error ? error.message : String(error)}`);
        return void 0;
      }
    }));
    const endpoints = [];
    const seen = /* @__PURE__ */ new Set();
    for (const endpoint of contributions.flat()) {
      let key;
      try {
        key = new URL(endpoint.url).toString();
      } catch {
        key = endpoint.url;
      }
      if (!seen.has(key)) {
        seen.add(key);
        endpoints.push(endpoint);
      }
    }
    return this._networkDiagnostics.getInfo(endpoints, accounts.find((account) => !!account));
  }
  async getManagedSettingsDiagnostics() {
    const providers = [...this._providers.values()].filter((provider) => provider.getManagedSettingsDiagnostics);
    return Promise.all(providers.map(async (provider) => {
      try {
        return { provider: provider.id, snapshot: await provider.getManagedSettingsDiagnostics() };
      } catch (error) {
        return { provider: provider.id, error: error instanceof Error ? error.message : String(error) };
      }
    }));
  }
  async diagnosticsFetch(url) {
    if (!this._networkDiagnostics) {
      throw new Error("Network diagnostics unavailable: service not wired");
    }
    return this._networkDiagnostics.fetch(url);
  }
  // ---- helpers ------------------------------------------------------------
  async _fetchSessionDbContent(fields) {
    const sessionUri = URI.parse(fields.sessionUri);
    const ref = this._sessionDataService.openDatabase(sessionUri);
    try {
      const content = await ref.object.readFileEditContent(fields.toolCallId, fields.filePath);
      if (!content) {
        throw new ProtocolError(AhpErrorCodes.NotFound, `File edit not found: toolCallId=${fields.toolCallId}, filePath=${fields.filePath}`);
      }
      const bytes = fields.part === "before" ? content.beforeContent : content.afterContent;
      if (!bytes) {
        throw new ProtocolError(AhpErrorCodes.NotFound, `No ${fields.part} content for: toolCallId=${fields.toolCallId}, filePath=${fields.filePath}`);
      }
      return {
        data: new TextDecoder().decode(bytes),
        encoding: ContentEncoding.Utf8,
        contentType: "text/plain"
      };
    } finally {
      ref.dispose();
    }
  }
  async _fetchGitBlobContent(fields) {
    if (!this._gitService) {
      throw new ProtocolError(AhpErrorCodes.NotFound, `git service unavailable for: ${fields.repoRelativePath}`);
    }
    const workingDirectory = await this._resolveGitBlobWorkingDirectory(fields);
    if (!workingDirectory) {
      throw new ProtocolError(AhpErrorCodes.NotFound, `No session repository resolves git-blob path: ${fields.absolutePath || fields.repoRelativePath}`);
    }
    const blob = await this._gitService.showBlob(workingDirectory, fields.sha, fields.repoRelativePath);
    if (!blob) {
      throw new ProtocolError(AhpErrorCodes.NotFound, `git blob not found: ${fields.sha}:${fields.repoRelativePath}`);
    }
    return {
      data: blob.toString(),
      encoding: ContentEncoding.Utf8,
      contentType: "text/plain"
    };
  }
  /**
   * Picks the working directory to run `git show` from for a `git-blob:` URI.
   *
   * The directory is chosen only from the session's own, server-trusted working
   * directories — never from anything client-supplied — so opening a diff can
   * never be steered into an arbitrary repository. `fields.absolutePath` (the
   * file's absolute path, carried in the URI) is used only to *select* which
   * repo to run in; it is never used as the cwd itself.
   *
   * Selection rules:
   * - Single-folder session: return the one working directory directly, without
   *   a containment check (preserves legacy behavior for relocated/remapped
   *   worktrees whose stored path no longer sits under the current root).
   * - Multi-root session: resolve each working directory to its repo root and
   *   return the deepest root that contains `absolutePath`; if none contains it,
   *   return `undefined` (→ NotFound) rather than reading from the wrong repo.
   * - Legacy URI with no `absolutePath` (`''`): fall back to the primary
   *   working directory, since there is no path to match.
   *
   * Examples (roots index 0 = primary):
   *   [/work/app]                    + /work/app/src/a.ts   → /work/app
   *   [/work/app]                    + /elsewhere/x.ts      → /work/app
   *   [/work/app, /work/app/pkgs/ui] + /work/app/pkgs/ui/b  → /work/app/pkgs/ui
   *   [/work/app, /work/lib]         + /outside/c.ts        → undefined (NotFound)
   *   [/work/app, /work/lib]         + ''  (legacy)         → /work/app
   */
  async _resolveGitBlobWorkingDirectory(fields) {
    const gitService = this._gitService;
    if (!gitService) {
      return void 0;
    }
    const workingDirectories = getEffectiveWorkingDirectories(this._stateManager, fields.sessionUri);
    if (!fields.absolutePath) {
      const primary = workingDirectories?.[0];
      return primary ? URI.parse(primary) : void 0;
    }
    if (!workingDirectories?.length) {
      return void 0;
    }
    if (!isMultiRootSession(workingDirectories)) {
      return URI.parse(workingDirectories[0]);
    }
    const { gitRepositories } = await resolveSessionRepositories(workingDirectories.map((directory) => URI.parse(directory)), gitService);
    if (!gitRepositories.length) {
      return void 0;
    }
    const blobResource = gitRepositories[0].with({ path: fields.absolutePath });
    return findDeepestContainingWorkingDirectory(blobResource, gitRepositories);
  }
  /**
   * Restores a subagent session from its parent session's event history.
   * Loads the parent's raw messages, filters for events belonging to
   * the subagent (by `parentToolCallId`), and builds the child session's
   * turns from those events.
   */
  async _restoreSubagentChat(chatUri, parentSession, toolCallId) {
    if (this._stateManager.getChatState(chatUri)) {
      return;
    }
    const inFlight = this._restoreSubagentInFlight.get(chatUri);
    if (inFlight) {
      return inFlight;
    }
    const restore = this._doRestoreSubagentChat(chatUri, parentSession, toolCallId);
    this._restoreSubagentInFlight.set(chatUri, restore);
    try {
      await restore;
    } finally {
      if (this._restoreSubagentInFlight.get(chatUri) === restore) {
        this._restoreSubagentInFlight.delete(chatUri);
      }
    }
  }
  async _doRestoreSubagentChat(chatUri, parentSession, toolCallId) {
    const parentSessionKey = parentSession.toString();
    try {
      await this._restoreSessionInFlight.get(parentSessionKey);
      if (!this._stateManager.getSessionState(parentSessionKey)) {
        await this.restoreSession(parentSession);
      }
    } catch {
      this._logService.warn(`[AgentService] Cannot restore parent session for subagent chat: ${parentSessionKey}`);
      return;
    }
    const parentState = this._stateManager.getSessionState(parentSessionKey);
    const agent = this._findProviderForSession(parentSession);
    if (!parentState || !agent) {
      return;
    }
    const spawnPoint = this._findSubagentSpawnPoint(parentSessionKey, chatUri, toolCallId);
    const origin = {
      kind: ChatOriginKind.Tool,
      chat: spawnPoint?.chat ?? parentState.defaultChat ?? buildDefaultChatUri(parentSession),
      toolCallId
    };
    const childTurns = await this._getChatMessages(agent, URI.parse(chatUri), parentSession, origin);
    if (childTurns.length === 0) {
      return;
    }
    const mergedTurns = await this._interleaveLocalTurns(parentSessionKey, chatUri, childTurns);
    this._stateManager.addChat(parentSessionKey, chatUri, {
      title: spawnPoint?.title ?? "Subagent",
      turns: mergedTurns,
      origin,
      interactivity: ChatInteractivity.ReadOnly
    });
  }
  /**
   * Finds the chat whose tool call spawned a subagent and reads the title that
   * tool call reported. It scans every hydrated chat in the parent session so
   * peer-chat and nested-subagent spawns resolve to their real parent; chats
   * without hydrated state are skipped on restore instead of being materialized
   * just to place one spawn edge.
   */
  _findSubagentSpawnPoint(parentSessionKey, subagentChatUri, toolCallId) {
    const parentState = this._stateManager.getSessionState(parentSessionKey);
    if (!parentState) {
      return void 0;
    }
    const defaultChat = parentState.defaultChat ?? buildDefaultChatUri(parentSessionKey);
    const candidates = [
      { chat: defaultChat, turns: parentState.turns, activeTurn: parentState.activeTurn }
    ];
    for (const chat of parentState.chats) {
      if (chat.resource === defaultChat || chat.resource === subagentChatUri) {
        continue;
      }
      const chatState = this._stateManager.getChatState(chat.resource);
      if (chatState) {
        candidates.push({ chat: chat.resource, turns: chatState.turns, activeTurn: chatState.activeTurn });
      }
    }
    for (const candidate of candidates) {
      for (const turn of [...candidate.turns, ...candidate.activeTurn ? [candidate.activeTurn] : []]) {
        for (const part of turn.responseParts) {
          if (part.kind !== ResponsePartKind.ToolCall || part.toolCall.toolCallId !== toolCallId) {
            continue;
          }
          const content = part.toolCall.status === ToolCallStatus.Completed || part.toolCall.status === ToolCallStatus.Running ? part.toolCall.content : void 0;
          const subagent = content?.find((item) => item.type === ToolResultContentType.Subagent);
          return { chat: candidate.chat, ...subagent?.title ? { title: subagent.title } : {} };
        }
      }
    }
    return void 0;
  }
  async _restoreSubagentSession(subagentUri, parentSession) {
    if (this._stateManager.getSessionState(subagentUri)) {
      return;
    }
    const inFlight = this._restoreSubagentInFlight.get(subagentUri);
    if (inFlight) {
      return inFlight;
    }
    const restore = this._doRestoreSubagentSession(subagentUri, parentSession);
    this._restoreSubagentInFlight.set(subagentUri, restore);
    try {
      await restore;
    } finally {
      if (this._restoreSubagentInFlight.get(subagentUri) === restore) {
        this._restoreSubagentInFlight.delete(subagentUri);
      }
    }
  }
  async _doRestoreSubagentSession(subagentUri, parentSession) {
    const parentSessionKey = parentSession.toString();
    if (!this._stateManager.getSessionState(parentSessionKey)) {
      try {
        await this.restoreSession(parentSession);
      } catch {
        this._logService.warn(`[AgentService] Cannot restore parent session for subagent: ${parentSessionKey}`);
        return;
      }
    }
    const parentState = this._stateManager.getSessionState(parentSessionKey);
    if (!parentState) {
      return;
    }
    const allTurns = [...parentState.turns];
    if (parentState.activeTurn) {
      allTurns.push(parentState.activeTurn);
    }
    let subagentContent;
    for (const turn of allTurns) {
      for (const part of turn.responseParts) {
        if (part.kind === ResponsePartKind.ToolCall) {
          const tc = part.toolCall;
          const content = tc.status === ToolCallStatus.Completed ? tc.content : tc.status === ToolCallStatus.Running ? tc.content : void 0;
          if (content) {
            for (const c of content) {
              if (c.type === ToolResultContentType.Subagent && c.resource === subagentUri) {
                subagentContent = c;
                break;
              }
            }
          }
        }
      }
      if (subagentContent) {
        break;
      }
    }
    let childTurns = [];
    const agent = this._findProviderForSession(parentSession);
    if (agent) {
      try {
        const parsedSubagent = parseSubagentSessionUri(URI.parse(subagentUri));
        const origin = parentState.chats.find((chat) => chat.resource === subagentUri)?.origin ?? (parsedSubagent ? {
          kind: ChatOriginKind.Tool,
          chat: parentState.defaultChat ?? buildDefaultChatUri(parentSession),
          toolCallId: parsedSubagent.toolCallId
        } : void 0);
        childTurns = await this._getChatMessages(agent, URI.parse(subagentUri), parentSession, origin);
      } catch (err) {
        this._logService.warn(`[AgentService] Failed to load subagent turns for ${subagentUri}`, err);
      }
    }
    const title = subagentContent?.title ?? "Subagent";
    const subagentNow = (/* @__PURE__ */ new Date()).toISOString();
    const mergedChildTurns = await this._interleaveLocalTurns(parentSession.toString(), subagentUri, childTurns);
    this._stateManager.restoreSession(
      {
        resource: subagentUri,
        provider: "subagent",
        title,
        status: SessionStatus.Idle,
        createdAt: subagentNow,
        modifiedAt: subagentNow,
        ...parentState?.project ? { project: parentState.project } : {}
      },
      mergedChildTurns
    );
    this._logService.info(`[AgentService] Restored subagent session: ${subagentUri} with ${childTurns.length} turn(s)`);
  }
  async _registerRestoredSubagentSummaries(agent, parentSession, turns) {
    const parentSessionStr = parentSession.toString();
    const parentChat = buildDefaultChatUri(parentSession);
    const discovered = /* @__PURE__ */ new Map();
    for (const turn of turns) {
      for (const part of turn.responseParts) {
        if (part.kind !== ResponsePartKind.ToolCall) {
          continue;
        }
        const content = part.toolCall.status === ToolCallStatus.Completed || part.toolCall.status === ToolCallStatus.Running ? part.toolCall.content : void 0;
        const subagent = content?.find((item) => item.type === ToolResultContentType.Subagent);
        if (subagent) {
          discovered.set(part.toolCall.toolCallId, {
            title: subagentChatTitle(readToolCallMeta(part.toolCall).subagentDescription, subagent.title),
            toolCallId: part.toolCall.toolCallId
          });
        }
      }
    }
    for (const child of discovered.values()) {
      const chatUri = buildSubagentChatUri(parentSessionStr, child.toolCallId);
      if (this._stateManager.getChatState(chatUri)) {
        continue;
      }
      const origin = { kind: ChatOriginKind.Tool, chat: parentChat, toolCallId: child.toolCallId };
      const existing = this._stateManager.getSessionState(parentSessionStr)?.chats.find((chat) => chat.resource === chatUri);
      const persistedTitle = await this._readPersistedChatTitle(parentSession, URI.parse(chatUri));
      const title = persistedTitle ?? child.title;
      this._stateManager.registerRestoredChatSummary(parentSessionStr, chatUri, {
        title,
        origin,
        interactivity: ChatInteractivity.ReadOnly,
        resolver: async () => ({
          turns: [...await this._resolveRestoredSubagentTurns(agent, parentSession, chatUri, origin)]
        })
      });
      if (existing && (!existing.title || existing.title === subagentChatTitle(void 0, void 0))) {
        this._stateManager.updateChatTitle(parentSessionStr, chatUri, title);
      }
    }
  }
  async _resolveRestoredSubagentTurns(agent, parentSession, chatUri, origin) {
    const childTurns = await this._getChatMessages(agent, URI.parse(chatUri), parentSession, origin);
    if (childTurns.length === 0) {
      throw new Error(`Subagent transcript is not available yet: ${chatUri}`);
    }
    return this._interleaveLocalTurns(parentSession.toString(), chatUri, childTurns);
  }
  _findProviderForSession(session) {
    const key = typeof session === "string" ? session : session.toString();
    const providerId = this._sessionToProvider.get(key);
    if (providerId) {
      return this._providers.get(providerId);
    }
    const schemeProvider = AgentSession.provider(session);
    if (schemeProvider) {
      return this._providers.get(schemeProvider);
    }
    if (this._defaultProvider) {
      return this._providers.get(this._defaultProvider);
    }
    return void 0;
  }
  /**
   * Sets the agents observable to trigger model re-fetch and
   * `root/agentsChanged` via the autorun in {@link AgentSideEffects}.
   */
  _updateAgents() {
    this._agents.set([...this._providers.values()], void 0);
  }
  dispose() {
    for (const provider of this._providers.values()) {
      provider.dispose();
    }
    this._providers.clear();
    super.dispose();
  }
}
function isErrorWithCode(error, code) {
  return error instanceof Error && hasErrorCode(error, code);
}
function hasErrorCode(error, code) {
  return hasKey(error, { code: true }) && error.code === code;
}
function collectChanges(event) {
  const out = [];
  for (const resource of event.rawAdded) {
    out.push({ resource, type: FileChangeType.ADDED });
  }
  for (const resource of event.rawUpdated) {
    out.push({ resource, type: FileChangeType.UPDATED });
  }
  for (const resource of event.rawDeleted) {
    out.push({ resource, type: FileChangeType.DELETED });
  }
  return out;
}
function collectChangesUnderRoot(event, root) {
  const out = [];
  const accept = (resource, type) => {
    if (isEqualOrParent(resource, root)) {
      out.push({ resource, type });
    }
  };
  for (const resource of event.rawAdded) {
    accept(resource, FileChangeType.ADDED);
  }
  for (const resource of event.rawUpdated) {
    accept(resource, FileChangeType.UPDATED);
  }
  for (const resource of event.rawDeleted) {
    accept(resource, FileChangeType.DELETED);
  }
  return out;
}
export {
  AgentService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxhZ2VudFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBvcGVuLCB1bmxpbmssIHR5cGUgRmlsZUhhbmRsZSB9IGZyb20gJ2ZzL3Byb21pc2VzJztcbmltcG9ydCB7IGRlY29kZUJhc2U2NCwgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCBkaXNwb3NhYmxlVGltZW91dCwgTGltaXRlciwgUHJvbWlzZXMsIFJlc291cmNlUXVldWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyB0b0Vycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9yTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCB0eXBlIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVJlc291cmNlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBnZXRFeHRlbnNpb25Gb3JNaW1lVHlwZSwgZ2V0TWVkaWFNaW1lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbWltZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lIGFzIHJlc291cmNlc0Rpcm5hbWUsIGV4dG5hbWUgYXMgcmVzb3VyY2VzRXh0bmFtZSwgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UsIGlzRXF1YWwsIGlzRXF1YWxPclBhcmVudCwgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgaGFzS2V5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRmlsZUNoYW5nZVR5cGUsIEZpbGVPcGVyYXRpb25SZXN1bHQsIElGaWxlQ2hhbmdlLCBJRmlsZVNlcnZpY2UsIHRvRmlsZU9wZXJhdGlvblJlc3VsdCwgdHlwZSBGaWxlQ2hhbmdlc0V2ZW50IH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEFnZW50UHJvdmlkZXIsIEFnZW50U2Vzc2lvbiwgQWdlbnRTaWduYWwsIElBZ2VudCwgSUFnZW50Q2hhdENvbnRleHQsIElBZ2VudENoYXREYXRhQ2hhbmdlLCBJQWdlbnRDaGF0TWV0YWRhdGEsIElBZ2VudENyZWF0ZUNoYXRPcHRpb25zLCBJQWdlbnRDcmVhdGVDaGF0UmVzdWx0LCBJQWdlbnRDcmVhdGVDaGF0U2lkZUNoYXRTZWxlY3Rpb24sIElBZ2VudENyZWF0ZUNoYXRTaWRlQ2hhdFNvdXJjZSwgSUFnZW50Q3JlYXRlU2Vzc2lvbkNvbmZpZywgSUFnZW50Q3JlYXRlU2Vzc2lvblJlc3VsdCwgSUFnZW50RGlzY292ZXJlZENoYXQsIElBZ2VudEhvc3RBdXRoVG9rZW5SZXF1ZXN0LCBJQWdlbnRIb3N0TmV0d29ya0VuZHBvaW50LCBJQWdlbnRNYXRlcmlhbGl6ZUNoYXRFdmVudCwgSUFnZW50TW9kZWxJbmZvLCBJQWdlbnRSZXNvbHZlU2Vzc2lvbkNvbmZpZ1BhcmFtcywgSUFnZW50Q2hhdEFkb3B0aW9uUmVzdWx0LCBJQWdlbnRTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNQYXJhbXMsIElBZ2VudFNlc3Npb25NZXRhZGF0YSwgSUFnZW50U3Bhd25DaGF0RXZlbnQsIEF1dGhlbnRpY2F0ZVBhcmFtcywgQXV0aGVudGljYXRlUmVzdWx0LCBJTWNwTm90aWZpY2F0aW9uLCBTdWJhZ2VudENoYXRTaWduYWwsIHN1YmFnZW50Q2hhdFRpdGxlIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFNlc3Npb25SZWxlYXNlR3JhY2VNc0VudlZhciwgSUFnZW50SG9zdE1hbmFnZWRTZXR0aW5nc0RpYWdub3N0aWNzLCBJQWdlbnRIb3N0TmV0d29ya0RpYWdub3N0aWNzSW5mbywgSUFnZW50SG9zdE5ldHdvcmtGZXRjaFJlc3VsdCwgSUFnZW50U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25EYXRhU2VydmljZSwgU0VTU0lPTl9BVFRBQ0hNRU5UU19ESVJOQU1FIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25EYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLCBJQ2FuY2VsRWRpdEF0dHJpYnV0aW9uRmx1c2hQYXJhbXMsIElDb21taXRFZGl0QXR0cmlidXRpb25GbHVzaFBhcmFtcywgSUVkaXRBdHRyaWJ1dGlvbkZsdXNoUmVzdWx0LCBJUHJlcGFyZUVkaXRBdHRyaWJ1dGlvbkZsdXNoUGFyYW1zLCBJUHJlcGFyZWRFZGl0QXR0cmlidXRpb25GbHVzaCwgcGFyc2VFZGl0QXR0cmlidXRpb25SZXNvdXJjZSB9IGZyb20gJy4uL2NvbW1vbi9maWxlRWRpdEF0dHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IFNlc3Npb25Db25maWdLZXkgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvbkNvbmZpZ0tleXMuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRDdXN0b21pemF0aW9uU2V0dGluZ3NSZWdpc3RyYXRpb24gfSBmcm9tICcuLi9jb21tb24vYWdlbnRDdXN0b21pemF0aW9uU2V0dGluZ3MuanMnO1xuaW1wb3J0IHsgcGFyc2VDaGFuZ2VzZXRVcmkgfSBmcm9tICcuLi9jb21tb24vY2hhbmdlc2V0VXJpLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIEFjdGlvbkVudmVsb3BlLCBBdXRoUmVxdWlyZWRSZWFzb24sIElOb3RpZmljYXRpb24sIGlzU2Vzc2lvbkFjdGlvbiwgdHlwZSBDaGF0QWN0aW9uLCB0eXBlIElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbiwgdHlwZSBTZXNzaW9uQWN0aW9uLCB0eXBlIFNlc3Npb25Xb3JraW5nRGlyZWN0b3J5QWN0aW9uLCB0eXBlIFRlcm1pbmFsQWN0aW9uLCB0eXBlIENsaWVudEFubm90YXRpb25zQWN0aW9uLCB0eXBlIENsaWVudENoYW5nZXNldEFjdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyByZXNvbHZlU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlBY3Rpb24gfSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvbldvcmtpbmdEaXJlY3Rvcmllcy5qcyc7XG5pbXBvcnQgdHlwZSB7IENvbXBsZXRpb25zUGFyYW1zLCBDb21wbGV0aW9uc1Jlc3VsdCwgQ3JlYXRlVGVybWluYWxQYXJhbXMsIFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0LCBTZXNzaW9uQ29uZmlnQ29tcGxldGlvbnNSZXN1bHQsIFNlc3Npb25Db25maWdQcm9wZXJ0eVNjaGVtYSB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgdHlwZSB7IEludm9rZUNoYW5nZXNldE9wZXJhdGlvblBhcmFtcywgSW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uUmVzdWx0IH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL2NoYW5uZWxzLWNoYW5nZXNldC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBBaHBFcnJvckNvZGVzLCBBSFBfU0VTU0lPTl9OT1RfRk9VTkQsIENvbnRlbnRFbmNvZGluZywgSlNPTl9SUENfSU5URVJOQUxfRVJST1IsIFByb3RvY29sRXJyb3IsIFJlc291cmNlQ2hhbmdlVHlwZSwgUmVzb3VyY2VUeXBlLCBSZXNvdXJjZVdyaXRlTW9kZSwgdHlwZSBDcmVhdGVSZXNvdXJjZVdhdGNoUGFyYW1zLCB0eXBlIENyZWF0ZVJlc291cmNlV2F0Y2hSZXN1bHQsIHR5cGUgRGlyZWN0b3J5RW50cnksIHR5cGUgUmVzb3VyY2VDb3B5UGFyYW1zLCB0eXBlIFJlc291cmNlQ29weVJlc3VsdCwgdHlwZSBSZXNvdXJjZURlbGV0ZVBhcmFtcywgdHlwZSBSZXNvdXJjZURlbGV0ZVJlc3VsdCwgdHlwZSBSZXNvdXJjZUxpc3RSZXN1bHQsIHR5cGUgUmVzb3VyY2VNa2RpclBhcmFtcywgdHlwZSBSZXNvdXJjZU1rZGlyUmVzdWx0LCB0eXBlIFJlc291cmNlTW92ZVBhcmFtcywgdHlwZSBSZXNvdXJjZU1vdmVSZXN1bHQsIHR5cGUgUmVzb3VyY2VSZWFkUmVzdWx0LCB0eXBlIFJlc291cmNlUmVzb2x2ZVBhcmFtcywgdHlwZSBSZXNvdXJjZVJlc29sdmVSZXN1bHQsIHR5cGUgUmVzb3VyY2VXYXRjaFN0YXRlLCB0eXBlIFJlc291cmNlV3JpdGVQYXJhbXMsIHR5cGUgUmVzb3VyY2VXcml0ZVJlc3VsdCwgdHlwZSBJU3RhdGVTbmFwc2hvdCB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgQ2hhbmdlc1N1bW1hcnksIENoYXRJbnRlcmFjdGl2aXR5LCBDaGF0T3JpZ2luS2luZCwgTWVzc2FnZUF0dGFjaG1lbnRLaW5kLCB0eXBlIENoYXRPcmlnaW4sIHR5cGUgQ3VzdG9taXphdGlvbiwgdHlwZSBNZXNzYWdlLCB0eXBlIE1lc3NhZ2VBdHRhY2htZW50LCB0eXBlIE1lc3NhZ2VSZXNvdXJjZUF0dGFjaG1lbnQgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBDaGF0UGVuZGluZ01lc3NhZ2VTZXRBY3Rpb24sIENoYXRUdXJuU3RhcnRlZEFjdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElTZXNzaW9uR2l0SHViU3RhdGUsIElTZXNzaW9uR2l0U3RhdGUsIE1lc3NhZ2VLaW5kLCBSZXNwb25zZVBhcnRLaW5kLCBTRVNTSU9OX01FVEFfR0lUSFVCX0tFWSwgU0VTU0lPTl9NRVRBX0dJVF9LRVksIFNFU1NJT05fTUVUQV9NVUxUSV9ST09UX0tFWSwgU0VTU0lPTl9NRVRBX1NPVVJDRV9DT05UUk9MX0tFWSwgcmVhZFNlc3Npb25TcGF3bkRlcHRoLCB3aXRoU2Vzc2lvblNwYXduRGVwdGgsIFNlc3Npb25MaWZlY3ljbGUsIFNlc3Npb25TdGF0dXMsIFRvb2xDYWxsU3RhdHVzLCBUb29sUmVzdWx0Q29udGVudFR5cGUsIEFIX01FVEFfV09SS1NQQUNFTEVTU19EQl9LRVksIEFIX01FVEFfSVNfQVJDSElWRURfREJfS0VZLCBBSF9NRVRBX0lTX0RPTkVfREJfS0VZLCBBSF9NRVRBX0lTX1JFQURfREJfS0VZLCBidWlsZENoYXRVcmksIGJ1aWxkRGVmYXVsdENoYXRVcmksIGJ1aWxkUmVzb3VyY2VXYXRjaENoYW5uZWxVcmksIGJ1aWxkU3ViYWdlbnRDaGF0VXJpLCBidWlsZFN1YmFnZW50U2Vzc2lvblVyaVByZWZpeCwgaG9zdEJ1aWxkSW5mb0Zyb21Qcm9kdWN0LCBpc0FocENoYXRDaGFubmVsLCBpc0RlZmF1bHRDaGF0VXJpLCBpc1N1YmFnZW50Q2hhdFVyaSwgaXNTdWJhZ2VudFNlc3Npb24sIHBhcnNlQ2hhdFVyaSwgcGFyc2VEZWZhdWx0Q2hhdFVyaSwgcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaSwgcGFyc2VSZXNvdXJjZVdhdGNoQ2hhbm5lbFVyaSwgcGFyc2VTZXNzaW9uTXVsdGlSb290TWV0YWRhdGEsIHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpLCByZWFkU2Vzc2lvbkV4dGVybmFsLCByZWFkU2Vzc2lvbkdpdEh1YlN0YXRlLCByZWFkU2Vzc2lvbkdpdFN0YXRlLCByZWFkU2Vzc2lvbk11bHRpUm9vdE1ldGFkYXRhLCByZWFkU2Vzc2lvblNvdXJjZUNvbnRyb2xTdGF0ZSwgcmVhZFNlc3Npb25Xb3Jrc3BhY2VsZXNzLCB3aXRoU2Vzc2lvbkV4dGVybmFsLCB3aXRoU2Vzc2lvbkdpdEh1YlN0YXRlLCB3aXRoU2Vzc2lvbkdpdFN0YXRlLCB3aXRoU2Vzc2lvbk11bHRpUm9vdE1ldGFkYXRhLCB3aXRoU2Vzc2lvblNvdXJjZUNvbnRyb2xTdGF0ZSwgd2l0aFNlc3Npb25TdGF0dXNGbGFnLCB3aXRoU2Vzc2lvbldvcmtzcGFjZWxlc3MsIHJlYWRTZXNzaW9uRWhjbGlBZG9wdGFibGUsIHR5cGUgSVNlc3Npb25Tb3VyY2VDb250cm9sU3RhdGUsIHR5cGUgU2Vzc2lvbkNvbmZpZ1N0YXRlLCB0eXBlIFNlc3Npb25TdW1tYXJ5LCB0eXBlIFRvb2xSZXN1bHRTdWJhZ2VudENvbnRlbnQsIHR5cGUgVHVybiwgdHlwZSBVc2FnZUluZm8sIGNoYXRTdG9yYWdlVXJpLCBoYXNSZXBvcnRlZFVzYWdlIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyByZWFkVG9vbENhbGxNZXRhIH0gZnJvbSAnLi4vY29tbW9uL21ldGEvYWdlbnRUb29sQ2FsbE1ldGEuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYnVpbGRCb3VuZGVkU2lkZUNoYXRTb3VyY2VDb250ZXh0LCBnZXRTaWRlQ2hhdFBhcnRpYWxSZXNwb25zZSB9IGZyb20gJy4vYWdlbnRQZWVyQ2hhdHMuanMnO1xuaW1wb3J0IHsgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSwgZ2V0RWZmZWN0aXZlV29ya2luZ0RpcmVjdG9yaWVzLCBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4vYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLCB0eXBlIElBZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEhvc3RNYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciwgSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciB9IGZyb20gJy4vYWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyLmpzJztcbmltcG9ydCB7IElTZXNzaW9uRGJVcmlGaWVsZHMsIHBhcnNlU2Vzc2lvbkRiVXJpIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25EYlVyaS5qcyc7XG5pbXBvcnQgeyBJR2l0QmxvYlVyaUZpZWxkcywgcGFyc2VHaXRCbG9iVXJpIH0gZnJvbSAnLi9naXREaWZmQ29udGVudC5qcyc7XG5pbXBvcnQgeyByZXNvbHZlU2Vzc2lvblJlcG9zaXRvcmllcyB9IGZyb20gJy4vYWdlbnRIb3N0U2Vzc2lvblJlcG9zaXRvcmllcy5qcyc7XG5pbXBvcnQgeyBmaW5kRGVlcGVzdENvbnRhaW5pbmdXb3JraW5nRGlyZWN0b3J5LCBpc011bHRpUm9vdFNlc3Npb24gfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0V29ya2luZ0RpcmVjdG9yaWVzLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFN0YXRlTWFuYWdlciwgSUFnZW50SG9zdFN0YXRlTWFuYWdlciB9IGZyb20gJy4vYWdlbnRIb3N0U3RhdGVNYW5hZ2VyLmpzJztcbmltcG9ydCB7IGNyZWF0ZUFnZW50Q2hhdENvbnRleHQgfSBmcm9tICcuL2FnZW50Q2hhdENvbnRleHQuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0UHJvbXB0Q2FjaGUsIElBZ2VudEhvc3RQcm9tcHRDYWNoZSB9IGZyb20gJy4vYWdlbnRIb3N0UHJvbXB0Q2FjaGUuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U2Vzc2lvblRpdGxlU2lnbmFsLCBJQWdlbnRIb3N0U2Vzc2lvblRpdGxlU2lnbmFsIH0gZnJvbSAnLi9hZ2VudEhvc3RTZXNzaW9uVGl0bGVTaWduYWwuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0RGF0YWJhc2UsIElBZ2VudEhvc3REYXRhYmFzZSB9IGZyb20gJy4vYWdlbnRIb3N0RGF0YWJhc2UuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uUmVnaXN0cnksIElSZWdpc3RlcmVkU2Vzc2lvbiwgSVN0b3JlZFJlZ2lzdGVyZWRTZXNzaW9uIH0gZnJvbSAnLi9hZ2VudFNlc3Npb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RHaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50U2lkZUVmZmVjdHMgfSBmcm9tICcuL2FnZW50U2lkZUVmZmVjdHMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0TG9jYWxUdXJucyB9IGZyb20gJy4vYWdlbnRIb3N0TG9jYWxUdXJucy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlcnZlclRvb2xIb3N0IH0gZnJvbSAnLi9zaGFyZWQvYWdlbnRTZXJ2ZXJUb29sSG9zdC5qcyc7XG5pbXBvcnQgeyBidWlsZFNlcnZlclRvb2xHcm91cHMgfSBmcm9tICcuL3NoYXJlZC9zZXJ2ZXJUb29sR3JvdXBzLmpzJztcbmltcG9ydCB7IHR5cGUgSUNoYXRDb250ZXh0U25hcHNob3QsIHR5cGUgSVJlbmFtZVRpdGxlUmVzdWx0LCB0eXBlIElTZXNzaW9uQ3JlYXRpb25EZWZhdWx0cywgdHlwZSBJU2Vzc2lvblNlcnZlclRvb2xBY2Nlc3NvciwgdmFsaWRhdGVSZW5hbWVUaXRsZSB9IGZyb20gJy4vc2hhcmVkL3Nlc3Npb25TZXJ2ZXJUb29scy5qcyc7XG5pbXBvcnQgeyBBR0VOVF9IT1NUX1RJVExFX1NPVVJDRV9BR0VOVCwgY3VzdG9tQ2hhdFRpdGxlTWV0YWRhdGFLZXksIGN1c3RvbUNoYXRUaXRsZVNvdXJjZU1ldGFkYXRhS2V5LCBwZXJzaXN0U2Vzc2lvbk1ldGFkYXRhVmFsdWVzLCBTRVNTSU9OX0NVU1RPTV9USVRMRV9LRVksIFNFU1NJT05fQ1VTVE9NX1RJVExFX1NPVVJDRV9LRVkgfSBmcm9tICcuL3NoYXJlZC9wZXJzaXN0U2Vzc2lvbk1ldGFkYXRhLmpzJztcblxuaW1wb3J0IHsgYnVpbGRXb3JrdHJlZUZhaWx1cmVOb3RpZmljYXRpb24sIFdvcmt0cmVlSXNvbGF0aW9uLCBXT1JLVFJFRV9NRVRBX1JFUE9TSVRPUllfUk9PVCwgd29ya3RyZWVQcm9qZWN0RnJvbVJlcG9zaXRvcnlSb290IH0gZnJvbSAnLi9zaGFyZWQvd29ya3RyZWVJc29sYXRpb24uanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZSB9IGZyb20gJy4vYWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2UsIElBZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdEZpbGVNb25pdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFJldmlld1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0UmV2aWV3U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDaGFuZ2VzZXRDb29yZGluYXRvciB9IGZyb20gJy4vYWdlbnRIb3N0Q2hhbmdlc2V0Q29vcmRpbmF0b3IuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q29tcGxldGlvbnMsIElBZ2VudEhvc3RDb21wbGV0aW9ucyB9IGZyb20gJy4vYWdlbnRIb3N0Q29tcGxldGlvbnMuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2hhdENvbXBsZXRpb25Qcm92aWRlciB9IGZyb20gJy4vYWdlbnRIb3N0Q2hhdENvbXBsZXRpb25Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RGaWxlQ29tcGxldGlvblByb3ZpZGVyIH0gZnJvbSAnLi9hZ2VudEhvc3RGaWxlQ29tcGxldGlvblByb3ZpZGVyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFJlbmFtZUNvbXBsZXRpb25Qcm92aWRlciB9IGZyb20gJy4vYWdlbnRIb3N0UmVuYW1lQ29tbWFuZC5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTa2lsbENvbXBsZXRpb25Qcm92aWRlciB9IGZyb20gJy4vYWdlbnRIb3N0U2tpbGxDb21wbGV0aW9uUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0V29ya3NwYWNlRmlsZXMgfSBmcm9tICcuL2FnZW50SG9zdFdvcmtzcGFjZUZpbGVzLmpzJztcbmltcG9ydCB7IFNlc3Npb25TZXJ2ZXJUb29sTmFtZSB9IGZyb20gJy4uL2NvbW1vbi9zZXJ2ZXJUb29sTmFtZXMuanMnO1xuaW1wb3J0IHsgQ29kZXhDb21wYWN0Q29tcGxldGlvblByb3ZpZGVyIH0gZnJvbSAnLi9jb2RleENvbXBhY3RDb21tYW5kLmpzJztcbmltcG9ydCB7IENvcGlsb3RBcGlTZXJ2aWNlLCBJQ29waWxvdEFwaVNlcnZpY2UgfSBmcm9tICcuL3NoYXJlZC9jb3BpbG90QXBpU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTmV0d29ya0RpYWdub3N0aWNzU2VydmljZSB9IGZyb20gJy4vbmV0d29ya0RpYWdub3N0aWNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBwYXJzZU1jcENoYW5uZWxVcmkgfSBmcm9tICcuL3NoYXJlZC9tY3BDdXN0b21pemF0aW9uQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyB0b0FnZW50Q2xpZW50VXJpIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50Q2xpZW50VXJpLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENsaWVudFR5cGUgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0Q2xpZW50SW5mby5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RMYXVuY2hLaW5kLCBjcmVhdGVVbmtub3duQWdlbnRIb3N0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dCwgdHlwZSBJQWdlbnRIb3N0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dCB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2hhbmdlc2V0T3BlcmF0aW9uU2VydmljZSB9IGZyb20gJy4vYWdlbnRIb3N0Q2hhbmdlc2V0T3BlcmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RHaXRTdGF0ZVNlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdEdpdFN0YXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UsIElBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RBdXRoZW50aWNhdGlvblNlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdEF1dGhlbnRpY2F0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyB1cGRhdGVBZ2VudEhvc3RUZWxlbWV0cnlMZXZlbEZyb21Db25maWcgfSBmcm9tICcuL2FnZW50SG9zdFRlbGVtZXRyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0QWN0aXZlQWdlbnRUaXRsZUdlbmVyYXRpb25Db25maWdLZXksIEFnZW50SG9zdEVkaXRUZWxlbWV0cnlFbmFibGVkQ29uZmlnS2V5LCBBZ2VudEhvc3RFeHRlcm5hbFNlc3Npb25zTW9kZSwgQWdlbnRIb3N0TWlncmF0ZUxlZ2FjeUNvcGlsb3RDbGlFbmFibGVkQ29uZmlnS2V5LCBBZ2VudEhvc3RTaG93RXh0ZXJuYWxTZXNzaW9uc0NvbmZpZ0tleSwgcGxhdGZvcm1Sb290U2NoZW1hIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdFNjaGVtYS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UsIElBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdG9yYWdlU2VydmljZSwgSUFnZW50SG9zdFN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEhvc3RTdG9yYWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RPY3RvS2l0U2VydmljZSwgSUFnZW50SG9zdE9jdG9LaXRTZXJ2aWNlIH0gZnJvbSAnLi9zaGFyZWQvYWdlbnRIb3N0T2N0b0tpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR2l0SHViU2VydmljZSwgSUdpdEh1YlNlcnZpY2UgfSBmcm9tICcuLi8uLi9naXRodWIvY29tbW9uL2dpdGh1YlNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UsIENIQU5HRVNFVF9EQl9NRVRBREFUQV9LRVlTLCBNRVRBX0NIQU5HRVNfU1VNTUFSWSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDaGFuZ2VzZXRTdWJzY3JpcHRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdENoYW5nZXNldFN1YnNjcmlwdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2hhbmdlc2V0U3Vic2NyaXB0aW9uU2VydmljZSB9IGZyb20gJy4vYWdlbnRIb3N0Q2hhbmdlc2V0U3Vic2NyaXB0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBHSVRfREJfTUVUQURBVEFfS0VZUywgSUFnZW50SG9zdEdpdFN0YXRlU2VydmljZSwgTUVUQV9HSVRfU1RBVEUsIE1FVEFfR0lUSFVCX1NUQVRFLCBNRVRBX1NPVVJDRV9DT05UUk9MX1NUQVRFIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdEdpdFN0YXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q2hhbmdlc2V0T3BlcmF0aW9uU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RDaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENvbW1pdE9wZXJhdGlvbkNvbnRyaWJ1dGlvbiB9IGZyb20gJy4vYWdlbnRIb3N0Q29tbWl0T3BlcmF0aW9uUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0RGlzY2FyZENoYW5nZXNPcGVyYXRpb25Db250cmlidXRpb24gfSBmcm9tICcuL2FnZW50SG9zdERpc2NhcmRDaGFuZ2VzT3BlcmF0aW9uUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0TWVyZ2VPcGVyYXRpb25Db250cmlidXRpb24gfSBmcm9tICcuL2FnZW50SG9zdE1lcmdlT3BlcmF0aW9uUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0UHVsbFJlcXVlc3RPcGVyYXRpb25Db250cmlidXRpb24gfSBmcm9tICcuL2FnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U3luY09wZXJhdGlvbkNvbnRyaWJ1dGlvbiB9IGZyb20gJy4vYWdlbnRIb3N0U3luY09wZXJhdGlvblByb3ZpZGVyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFJldmlld1NlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdFJldmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZvcmdlRGlhZ25vc3RpY3NMb2csIHNldEFjdGl2ZUZvcmdlRGlhZ25vc3RpY3NMb2cgfSBmcm9tICcuL2ZvcmdlRGlhZ25vc3RpY3NMb2cuanMnO1xuXG4vKipcbiAqIEdyYWNlIHBlcmlvZCBiZWZvcmUgYW4gZW1wdHksIHVuc3Vic2NyaWJlZCBzZXNzaW9uIGlzIGdhcmJhZ2UtY29sbGVjdGVkXG4gKiB2aWEge0BsaW5rIEFnZW50U2VydmljZS5fcnVuU2Vzc2lvbkdjfS4gR2l2ZXMgYSBkaXNjb25uZWN0ZWQgY2xpZW50IHRpbWVcbiAqIHRvIHJlY29ubmVjdCAob3IgYSB3b3Jrc3BhY2Ugc3dpdGNoIHRvIHNldHRsZSkgYmVmb3JlIHdlIHRlYXIgZG93biB0aGVcbiAqIHByb3ZpZGVyLXNpZGUgc2Vzc2lvbiwgd29ya3RyZWUsIGFuZCBvbi1kaXNrIHN0YXRlLlxuICovXG5jb25zdCBTRVNTSU9OX0dDX0dSQUNFX01TID0gMzBfMDAwO1xuXG50eXBlIEFnZW50SG9zdExlZ2FjeU1pZ3JhdGlvbkV2ZW50ID0ge1xuXHRwcm92aWRlcjogc3RyaW5nO1xuXHRvdXRjb21lOiAnbWlncmF0ZWQnIHwgJ3NraXBwZWQnIHwgJ2ZhaWxlZCc7XG5cdHN1Y2Nlc3M6IGJvb2xlYW47XG5cdHR1cm5Db3VudDogbnVtYmVyO1xuXHRkdXJhdGlvbk1zOiBudW1iZXI7XG5cdGhhc1Byb2plY3Q6IGJvb2xlYW47XG5cdGhhc1dvcmt0cmVlOiBib29sZWFuO1xuXHR3b3JraW5nRGlyZWN0b3J5Q291bnQ6IG51bWJlcjtcblx0ZXJyb3JNZXNzYWdlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59O1xuXG50eXBlIEFnZW50SG9zdExlZ2FjeU1pZ3JhdGlvbkNsYXNzaWZpY2F0aW9uID0ge1xuXHRwcm92aWRlcjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBhZ2VudCBwcm92aWRlciBpZCB3aG9zZSBsZWdhY3kgc2Vzc2lvbiB3YXMgbWlncmF0ZWQgKGUuZy4gY29waWxvdGNsaSkuJyB9O1xuXHRvdXRjb21lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnTWlncmF0aW9uIG91dGNvbWU6IG1pZ3JhdGVkIChhZG9wdGlvbiArIHJlc3RvcmUgY29tcGxldGVkKSwgc2tpcHBlZCAoZWxpZ2libGUgbGVnYWN5IHNlc3Npb24gbm90IGFkb3B0ZWQgdGhpcyBwYXNzLCBlLmcuIG1pZ3JhdGUgZmxhZyBub3QgeWV0IGFwcGxpZWQpLCBvciBmYWlsZWQgKGFkb3B0aW9uIG9yIHJlc3RvcmUgdGhyZXcpLicgfTtcblx0c3VjY2VzczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1doZXRoZXIgdGhlIG1pZ3JhdGlvbiBjb21wbGV0ZWQgd2l0aCBhdCBsZWFzdCBvbmUgcmVzdG9yZWQgdHVybi4nIH07XG5cdHR1cm5Db3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiB0dXJucyByZXN0b3JlZCBmcm9tIHRoZSBtaWdyYXRlZCBzZXNzaW9uLicgfTtcblx0ZHVyYXRpb25NczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RpbWUgaW4gbWlsbGlzZWNvbmRzIHRvIGFkb3B0IGFuZCByZXN0b3JlIHRoZSBsZWdhY3kgc2Vzc2lvbi4nIH07XG5cdGhhc1Byb2plY3Q6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBtaWdyYXRlZCBzZXNzaW9uIHJlc29sdmVkIHRvIGEgcHJvamVjdC9yZXBvc2l0b3J5LicgfTtcblx0aGFzV29ya3RyZWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSBtaWdyYXRlZCBzZXNzaW9uIHJhbiBpbiBhIHByZS1leGlzdGluZyBnaXQgd29ya3RyZWUgdGhhdCB3YXMgYnJpZGdlZCBkdXJpbmcgYWRvcHRpb24uJyB9O1xuXHR3b3JraW5nRGlyZWN0b3J5Q291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdOdW1iZXIgb2Ygd29ya2luZyBkaXJlY3RvcmllcyBhc3NvY2lhdGVkIHdpdGggdGhlIG1pZ3JhdGVkIHNlc3Npb24uJyB9O1xuXHRlcnJvck1lc3NhZ2U6IHsgY2xhc3NpZmljYXRpb246ICdDYWxsc3RhY2tPckV4Y2VwdGlvbic7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdFcnJvciBtZXNzYWdlIHdoZW4gdGhlIG1pZ3JhdGlvbiBmYWlsZWQ7IGFic2VudCBmb3IgbWlncmF0ZWQvc2tpcHBlZCBvdXRjb21lcy4nIH07XG5cdG93bmVyOiAndmlqYXl1cGFkeWEnO1xuXHRjb21tZW50OiAnVHJhY2tzIG9uZS10aW1lIGFkb3B0LW9uLW9wZW4gbWlncmF0aW9uIG9mIGxlZ2FjeSBleHRlbnNpb24taG9zdCBDb3BpbG90IENMSSBzZXNzaW9ucyBpbnRvIHRoZSBhZ2VudCBob3N0IHRvIG1lYXN1cmUgYXR0ZW1wdCwgc3VjY2VzcywgZmFpbHVyZSwgYW5kIHNraXBwZWQgcmF0ZXMuJztcbn07XG5cbmNvbnN0IEhPU1RfT1dORURfU0VTU0lPTl9DT05GSUdfS0VZUyA9IFtcblx0U2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb24sXG5cdFNlc3Npb25Db25maWdLZXkuQnJhbmNoLFxuXHRTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlQnJhbmNoUHJlZml4LFxuXHRTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlSW5jbHVkZUZpbGVzLFxuXHRTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlQnJhbmNoVHJhY2ssXG5dIGFzIGNvbnN0O1xuXG5mdW5jdGlvbiBvbWl0SG9zdE93bmVkU2Vzc2lvbkNvbmZpZzxUPihjb25maWc6IFJlY29yZDxzdHJpbmcsIFQ+KTogUmVjb3JkPHN0cmluZywgVD4ge1xuXHRjb25zdCByZXN1bHQgPSB7IC4uLmNvbmZpZyB9O1xuXHRmb3IgKGNvbnN0IGtleSBvZiBIT1NUX09XTkVEX1NFU1NJT05fQ09ORklHX0tFWVMpIHtcblx0XHRkZWxldGUgcmVzdWx0W2tleV07XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gcGFyc2VQZXJzaXN0ZWRTb3VyY2VDb250cm9sU3RhdGUodmFsdWU6IHN0cmluZyk6IElTZXNzaW9uU291cmNlQ29udHJvbFN0YXRlIHtcblx0Y29uc3Qgc3RhdGUgPSByZWFkU2Vzc2lvblNvdXJjZUNvbnRyb2xTdGF0ZSh7XG5cdFx0W1NFU1NJT05fTUVUQV9TT1VSQ0VfQ09OVFJPTF9LRVldOiBKU09OLnBhcnNlKHZhbHVlKSxcblx0fSk7XG5cdGlmICghc3RhdGUpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgcGVyc2lzdGVkIHNvdXJjZS1jb250cm9sIHN0YXRlJyk7XG5cdH1cblx0cmV0dXJuIHN0YXRlO1xufVxuXG4vKipcbiAqIEdyYWNlIHBlcmlvZCBiZWZvcmUgYW4gaWRsZSByZXNvdXJjZSB3YXRjaCBpcyB0b3JuIGRvd24gYWZ0ZXIgaXRzIGxhc3RcbiAqIHN1YnNjcmliZXIgdW5zdWJzY3JpYmVzIChtaXJyb3JzIHtAbGluayBTRVNTSU9OX0dDX0dSQUNFX01TfSkuIFdpdGhpblxuICogdGhpcyB3aW5kb3csIGEgcmUtc3Vic2NyaWJlIChvciByZWNvbm5lY3QpIHJldXNlcyB0aGUgc3RpbGwtcnVubmluZ1xuICoge0BsaW5rIElGaWxlU2VydmljZX0gd2F0Y2hlciBzbyB0cmFuc2llbnQgZHJvcC1vdXRzIGRvbid0IG1pc3MgY2hhbmdlXG4gKiBldmVudHMuIFJlc291cmNlIHdhdGNoIGFjdGlvbiBlbnZlbG9wZXMgZmxvdyB0aHJvdWdoIHRoZSBub3JtYWxcbiAqIGVudmVsb3BlIHJlcGxheSBidWZmZXIgZm9yIHRoZSBzYW1lIHJlYXNvbi5cbiAqL1xuY29uc3QgUkVTT1VSQ0VfV0FUQ0hfR1JBQ0VfTVMgPSAzMF8wMDA7XG5cbi8qKiBCb3VuZCBvbiBob3cgbG9uZyB7QGxpbmsgQWdlbnRTZXJ2aWNlLnN1YnNjcmliZX0gd2FpdHMgZm9yIGEgcGVuZGluZyBzdWJhZ2VudCBjaGF0IHRvIHJlZ2lzdGVyIGJlZm9yZSBnaXZpbmcgdXAuICovXG5jb25zdCBTVUJBR0VOVF9DSEFUX1BFTkRJTkdfVElNRU9VVF9NUyA9IDE1XzAwMDtcblxuLyoqXG4gKiBHcmFjZSBwZXJpb2QgYmVmb3JlIGFuIGlkbGUgc2Vzc2lvbiBpcyByZWxlYXNlZCBmcm9tIG1lbW9yeSB2aWFcbiAqIHtAbGluayBBZ2VudFNlcnZpY2UuX21heWJlRXZpY3RJZGxlU2Vzc2lvbn0uIFRoaXMgbGV0cyBhIHF1aWNrIHJlY29ubmVjdFxuICogcmV1c2UgdGhlIGxpdmUgU0RLIHNlc3Npb24gaW5zdGVhZCBvZiBmb3JjaW5nIGFuIGltbWVkaWF0ZSByZWxlYXNlL3Jlc3VtZVxuICogY3ljbGUuIE92ZXJyaWRhYmxlIHZpYSB7QGxpbmsgQWdlbnRIb3N0U2Vzc2lvblJlbGVhc2VHcmFjZU1zRW52VmFyfSBpbiB0ZXN0cy5cbiAqL1xuY29uc3QgU0VTU0lPTl9SRUxFQVNFX0dSQUNFX01TID0gKCgpID0+IHtcblx0Y29uc3QgcmF3ID0gcHJvY2Vzcy5lbnZbQWdlbnRIb3N0U2Vzc2lvblJlbGVhc2VHcmFjZU1zRW52VmFyXTtcblx0Y29uc3QgcGFyc2VkID0gcmF3ICE9PSB1bmRlZmluZWQgPyBwYXJzZUludChyYXcsIDEwKSA6IE5hTjtcblx0cmV0dXJuIE51bWJlci5pc0Zpbml0ZShwYXJzZWQpICYmIHBhcnNlZCA+PSAwID8gcGFyc2VkIDogMzBfMDAwO1xufSkoKTtcblxuLyoqXG4gKiBTZXNzaW9uLWRhdGFiYXNlIG1ldGFkYXRhIGtleSBmb3IgdGhlIG9yY2hlc3RyYXRvci1vd25lZCBjYXRhbG9nIG9mXG4gKiBhZGRpdGlvbmFsIHBlZXIgY2hhdHMuIFdoZW4gYWJzZW50LCB0aGUgc2Vzc2lvbiBwcmVkYXRlcyB0aGlzIHBlcnNpc3RlbmNlXG4gKiBhbmQgYSBvbmUtdGltZSBtaWdyYXRpb24gZHJhaW5zIHRoZSBhZ2VudCdzIGxlZ2FjeSBgKi5jaGF0c2Agc3RhdGUuXG4gKi9cbmNvbnN0IFBFRVJfQ0hBVFNfTUVUQURBVEFfS0VZID0gJ3BlZXJDaGF0cyc7XG5cbi8qKiBPcGFxdWUgcHJvdmlkZXIgZGF0YSBmb3IgdGhlIHNlc3Npb24ncyBkZWZhdWx0IGNoYXQuICovXG5jb25zdCBERUZBVUxUX0NIQVRfUFJPVklERVJfREFUQV9NRVRBREFUQV9LRVkgPSAnZGVmYXVsdENoYXRQcm92aWRlckRhdGEnO1xuXG4vKipcbiAqIFNlc3Npb24tZGF0YWJhc2UgbWV0YWRhdGEga2V5IHdyaXR0ZW4gb24gYSBjaGF0J3MgYmFja2luZyBTREsgc2Vzc2lvbi5cbiAqIE1hcmtzIHRoYXQgc2Vzc2lvbiBhcyBhbiBpbnRlcm5hbCBjaGF0IGJhY2tpbmcgc28gbGVnYWN5IGVudW1lcmF0aW9uIG5ldmVyXG4gKiBzdXJmYWNlcyBpdCBhcyBhIHRvcC1sZXZlbCBzZXNzaW9uOyB0aGUgdmFsdWUgaXMgdGhlIG93bmluZyBjaGF0IFVSSS5cbiAqL1xuY29uc3QgQ0hBVF9CQUNLSU5HX01FVEFEQVRBX0tFWSA9ICdwZWVyQ2hhdEJhY2tpbmcnO1xuXG4vKipcbiAqIEEgc2luZ2xlIGVudHJ5IGluIHRoZSBvcmNoZXN0cmF0b3IncyBwZXJzaXN0ZWQgcGVlci1jaGF0IGNhdGFsb2cuIGB1cmlgIGlzXG4gKiB0aGUgcGVlciBjaGF0J3MgY2hhbm5lbCBVUkk7IGBwcm92aWRlckRhdGFgIGlzIHRoZSBvcGFxdWUsIGFnZW50LW93bmVkIGJsb2JcbiAqIChzZWUge0BsaW5rIElBZ2VudENyZWF0ZUNoYXRSZXN1bHQucHJvdmlkZXJEYXRhfSkgaGFuZGVkIGJhY2sgdG8gdGhlIGFnZW50IG9uXG4gKiByZXN0b3JlIFx1MjAxNCB0aGUgb3JjaGVzdHJhdG9yIG5ldmVyIHBhcnNlcyBpdC4gYHByb3ZpZGVyRGF0YWAgbWF5IGJlIG9taXR0ZWQsXG4gKiBpbiB3aGljaCBjYXNlIHRoZSBhZ2VudCByZWNvdmVycyBpdHMgYmFja2luZyBmcm9tIGl0cyBvd24gcGVyc2lzdGVuY2Ugb25cbiAqIHtAbGluayBJQWdlbnQubWF0ZXJpYWxpemVDaGF0fS4gYG9yaWdpbmAgcmVjb3JkcyB0aGUgY2hhdCdzIHByb3ZlbmFuY2VcbiAqIChjdXJyZW50bHkgb25seSB7QGxpbmsgQ2hhdE9yaWdpbktpbmQuU2lkZUNoYXR9LCBjYXJyeWluZyB0aGUgc291cmNlIGNoYXQgYW5kXG4gKiBzdGFibGUgc291cmNlIHR1cm4gaWQpIHNvIGl0IHN1cnZpdmVzIGEgcmVzdGFydDsgb21pdHRlZCBmb3IgcGxhaW4gcGVlciBjaGF0cy5cbiAqL1xuaW50ZXJmYWNlIElQZXJzaXN0ZWRQZWVyQ2hhdCB7XG5cdHJlYWRvbmx5IHVyaTogc3RyaW5nO1xuXHRyZWFkb25seSBwcm92aWRlckRhdGE/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IG9yaWdpbj86IENoYXRPcmlnaW47XG59XG5cbi8qKlxuICogVHJhY2tzIG9uZSBwcm92aWRlcidzIGluLWZsaWdodCBleHRlcm5hbC1jaGF0IGRpc2NvdmVyeSBhdHRlbXB0LiBgcHJvbWlzZWAgaXNcbiAqIHJlYXNzaWduZWQgaW4gcGxhY2Ugd2hlbiBhIGBmb3JjZWAgcmVxdWVzdCBpcyBjaGFpbmVkIG9udG8gYW4gYXR0ZW1wdCB0aGF0XG4gKiBpcyBhbHJlYWR5IHJ1bm5pbmcsIHNvXG4gKiBjYWxsZXJzIHRoYXQgY2FwdHVyZWQgYW4gZWFybGllciByZWZlcmVuY2UgdG8gdGhlIHNhbWUgYElQcm92aWRlckRpc2NvdmVyeVN0YXRlYFxuICogc3RpbGwgb2JzZXJ2ZSB0aGUgY2hhaW5lZCwgZm9yY2VkIHJlLXJ1bi5cbiAqL1xuaW50ZXJmYWNlIElQcm92aWRlckRpc2NvdmVyeVN0YXRlIHtcblx0cHJvbWlzZTogUHJvbWlzZTx2b2lkPjtcblx0Zm9yY2VRdWV1ZWQ6IGJvb2xlYW47XG59XG5cbi8qKlxuICogUmVjb25jaWxlIGEgc2Vzc2lvbidzIHdvcmtpbmctZGlyZWN0b3J5IHNldCBmcm9tIGEgY3JlYXRlLXJlc3VsdCAvXG4gKiBtYXRlcmlhbGl6YXRpb24gcmVjZWlwdC4gVGhlIHJlc29sdmVkIHJlY2VpcHQgaXMgYXV0aG9yaXRhdGl2ZSBmb3IgdGhlIHJvb3RzXG4gKiBpdCByZXBvcnRzIChpbmRleCAwID0gdGhlIHJlc29sdmVkIHByb2Nlc3Mgcm9vdCwgZS5nLiBhIHdvcmt0cmVlKTsgYW55XG4gKiBhZGRpdGlvbmFsIHJlcXVlc3RlZC9jdXJyZW50IHJvb3RzICpiZXlvbmQqIHRoZSByZXNvbHZlZCBzZXQncyBsZW5ndGggYXJlXG4gKiBwcmVzZXJ2ZWQuIFRoaXMgaXMgd2hhdCBsZXRzIGEgcmVjZWlwdCB0aGF0IHJlcG9ydHMgb25seSB0aGUgcHJvY2VzcyByb290IFx1MjAxNFxuICogdGhlIHJlc3VtZSBwYXRoIHJlYWRzIGEgc2luZ2xlIGN3ZCBmcm9tIGRpc2sgXHUyMDE0IGtlZXAgdGhlIHJlc3Qgb2YgdGhlIGtub3duIHNldFxuICogaW5zdGVhZCBvZiBjb2xsYXBzaW5nIGBbQSwgQiwgQ11gIHRvIGBbZGlyXWAsIHdoaWxlIGEgcmVjZWlwdCB0aGF0IGNhcnJpZXMgdGhlXG4gKiBmdWxsIHJlc29sdmVkIHNldCAodGhlIHNlbmQvY3JlYXRlIHBhdGgpIGlzIHRydXN0ZWQgdmVyYmF0aW0gKGluY2x1ZGluZyBhXG4gKiByZW1hcHBlZCB0YWlsKS4gQSBtaXNzaW5nIHJlc29sdmVkIHNldCBrZWVwcyB0aGUgcmVxdWVzdGVkIHZhbHVlIGFzLWlzLFxuICogcHJlc2VydmluZyB0aGUgYHVuZGVmaW5lZGAgKHdvcmtzcGFjZS1sZXNzIC8gaW5oZXJpdCkgdnMgYFtdYCAoZXhwbGljaXRseSBub25lKVxuICogZGlzdGluY3Rpb24uXG4gKlxuICogUmV0dXJucyB0aGUgcHJvdG9jb2wgZm9ybSAoYHN0cmluZ1tdYCksIHNpbmNlIHByb3RvY29sIFVSSXMgYXJlIHN0cmluZ3MuXG4gKi9cbmZ1bmN0aW9uIHJlY29uY2lsZVdvcmtpbmdEaXJlY3RvcmllcyhyZXF1ZXN0ZWQ6IHJlYWRvbmx5IFVSSVtdIHwgdW5kZWZpbmVkLCByZXNvbHZlZDogcmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQpOiBzdHJpbmdbXSB8IHVuZGVmaW5lZCB7XG5cdGlmIChyZXNvbHZlZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHJlcXVlc3RlZD8ubWFwKGQgPT4gZC50b1N0cmluZygpKTtcblx0fVxuXHRjb25zdCB0YWlsID0gKHJlcXVlc3RlZCA/PyBbXSkuc2xpY2UocmVzb2x2ZWQubGVuZ3RoKTtcblx0cmV0dXJuIFsuLi5yZXNvbHZlZCwgLi4udGFpbF0ubWFwKGQgPT4gZC50b1N0cmluZygpKTtcbn1cblxuLyoqXG4gKiBUaGUgYWdlbnQgc2VydmljZSBpbXBsZW1lbnRhdGlvbiB0aGF0IHJ1bnMgaW5zaWRlIHRoZSBhZ2VudC1ob3N0IHV0aWxpdHlcbiAqIHByb2Nlc3MuIERpc3BhdGNoZXMgdG8gcmVnaXN0ZXJlZCB7QGxpbmsgSUFnZW50fSBpbnN0YW5jZXMgYmFzZWRcbiAqIG9uIHRoZSBwcm92aWRlciBpZGVudGlmaWVyIGluIHRoZSBzZXNzaW9uIGNvbmZpZ3VyYXRpb24uXG4gKi9cbmV4cG9ydCBjbGFzcyBBZ2VudFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc291cmNlV3JpdGVRdWV1ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSZXNvdXJjZVF1ZXVlKCkpO1xuXG5cdC8qKiBQcm90b2NvbDogZmlyZXMgd2hlbiBzdGF0ZSBpcyBtdXRhdGVkIGJ5IGFuIGFjdGlvbi4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxBY3Rpb25FbnZlbG9wZT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQWN0aW9uID0gdGhpcy5fb25EaWRBY3Rpb24uZXZlbnQ7XG5cblx0LyoqIFByb3RvY29sOiBmaXJlcyBmb3IgZXBoZW1lcmFsIG5vdGlmaWNhdGlvbnMgKHNlc3Npb25BZGRlZC9SZW1vdmVkKS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWROb3RpZmljYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTm90aWZpY2F0aW9uPigpKTtcblx0cmVhZG9ubHkgb25EaWROb3RpZmljYXRpb24gPSB0aGlzLl9vbkRpZE5vdGlmaWNhdGlvbi5ldmVudDtcblxuXHQvKiogUHJvdG9jb2w6IGZpcmVzIGZvciBNQ1Agc2VydmVyLW9yaWdpbmF0ZWQgbm90aWZpY2F0aW9ucyByb3V0ZWQgb3ZlciBgbWNwOi8vYCBjaGFubmVscy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfb25NY3BOb3RpZmljYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJTWNwTm90aWZpY2F0aW9uPigpKTtcblx0cmVhZG9ubHkgb25NY3BOb3RpZmljYXRpb24gPSB0aGlzLl9vbk1jcE5vdGlmaWNhdGlvbi5ldmVudDtcblxuXHQvKiogQXV0aG9yaXRhdGl2ZSBzdGF0ZSBtYW5hZ2VyIGZvciB0aGUgc2Vzc2lvbnMgcHJvY2VzcyBwcm90b2NvbC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdGVNYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21hbmFnZWRTZXR0aW5nc1NlcnZpY2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWdlbnRIb3N0TWFuYWdlZFNldHRpbmdzU2VydmljZSgpKTtcblxuXHQvKipcblx0ICogT3JjaGVzdHJhdG9yLW93bmVkIGR1cmFibGUgaW5kZXggb2Yga25vd24gc2Vzc2lvbnMuIFBvcHVsYXRlZCBhbG9uZ3NpZGVcblx0ICogY3JlYXRlL2RlbGV0ZSBwYXRocyBhbmQsIGluIFN0YWdlIDEsIGV4cG9zZWQgb25seSBmb3IgcGFyaXR5IHZhbGlkYXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uUmVnaXN0cnk6IEFnZW50U2Vzc2lvblJlZ2lzdHJ5O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vcmNoZXN0cmF0b3JEYXRhYmFzZTogSUFnZW50SG9zdERhdGFiYXNlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyTWlncmF0aW9ucyA9IG5ldyBNYXA8QWdlbnRQcm92aWRlciwgSVByb3ZpZGVyRGlzY292ZXJ5U3RhdGU+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2luaXRpYWxQcm92aWRlck1pZ3JhdGlvbnMgPSBuZXcgTWFwPEFnZW50UHJvdmlkZXIsIFByb21pc2U8dm9pZD4+KCk7XG5cblx0LyoqXG5cdCAqIEJhY2tpbmctc2Vzc2lvbiBVUklzIChhcyBzdHJpbmdzKSB3aG9zZSB7QGxpbmsgQ0hBVF9CQUNLSU5HX01FVEFEQVRBX0tFWX1cblx0ICogZHVyYWJsZSBtYXJrZXIgd3JpdGUga2VwdCBmYWlsaW5nIGFmdGVyIGEgcmV0cnkgaW4gYGNyZWF0ZUNoYXRgLiBUaGUgY2hhdFxuXHQgKiBpdHNlbGYgd2FzIGFscmVhZHkgY3JlYXRlZCBhbmQgYW5ub3VuY2VkIHN1Y2Nlc3NmdWxseSwgc28gdGhpcyBpbi1wcm9jZXNzXG5cdCAqIHN1cHByZXNzaW9uIHN0YW5kcyBpbiBmb3IgdGhlIGR1cmFibGUgbWFya2VyOiBpdCBpcyBjb25zdWx0ZWQgYnlcblx0ICoge0BsaW5rIF9pc0NoYXRCYWNraW5nfSAodXNlZCBieSBleHRlcm5hbCBkaXNjb3ZlcnkpIGFuZCBieSBgbGlzdFNlc3Npb25zYCdzIG92ZXJsYXlcblx0ICogZmlsdGVyLCBzbyB0aGUgYmFja2luZyBzZXNzaW9uIGlzIHN0aWxsIG5ldmVyIHN1cmZhY2VkIGFzIGEgc3RhbmRhbG9uZVxuXHQgKiB0b3AtbGV2ZWwgc2Vzc2lvbiBmb3IgdGhlIGxpZmV0aW1lIG9mIHRoaXMgcHJvY2VzcywgZXZlbiB0aG91Z2ggaXRzXG5cdCAqIG9uLWRpc2sgbWFya2VyIG5ldmVyIHBlcnNpc3RlZC4gQSBsYXRlciBzdWNjZXNzZnVsIHdyaXRlIChlLmcuIGZyb20gYVxuXHQgKiBkaWZmZXJlbnRseS10aW1lZCByZXRyeSkgcmVtb3ZlcyB0aGUgZW50cnk7IGEgc3RhbGUgZW50cnkgZm9yIGEgc2luY2Vcblx0ICogZGVsZXRlZCBzZXNzaW9uIGlzIGhhcm1sZXNzIFx1MjAxNCB0aGF0IFVSSSBpcyBuZXZlciByZWFjaGFibGUgYWdhaW4uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF91bnBlcnNpc3RlZENoYXRCYWNraW5ncyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdC8qKiBFeHBvc2VzIHRoZSBzdGF0ZSBtYW5hZ2VyIGZvciBjby1ob3N0aW5nIGEgV2ViU29ja2V0IHByb3RvY29sIHNlcnZlci4gKi9cblx0Z2V0IHN0YXRlTWFuYWdlcigpOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgeyByZXR1cm4gdGhpcy5fc3RhdGVNYW5hZ2VyOyB9XG5cblx0LyoqIEV4cG9zZXMgdGhlIGNvbmZpZ3VyYXRpb24gc2VydmljZSBzbyBhZ2VudCBwcm92aWRlcnMgY2FuIHNoYXJlIHJvb3QgY29uZmlnIHBsdW1iaW5nLiAqL1xuXHRnZXQgY29uZmlndXJhdGlvblNlcnZpY2UoKTogSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgeyByZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2U7IH1cblxuXHQvKiogRXhwb3NlcyBob3N0LW93bmVkIHBlcnNpc3RlbnQgc3RvcmFnZSB0byBwcm9jZXNzLWxldmVsIERJLiAqL1xuXHRnZXQgc3RvcmFnZVNlcnZpY2UoKTogSUFnZW50SG9zdFN0b3JhZ2VTZXJ2aWNlIHsgcmV0dXJuIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlOyB9XG5cblx0LyoqIEV4cG9zZXMgY3VzdG9taXphdGlvbiBlbmFibGVtZW50IHRvIHByb2Nlc3MtbGV2ZWwgREkuICovXG5cdGdldCBjdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UoKTogSUFnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSB7IHJldHVybiB0aGlzLl9jdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2U7IH1cblxuXHRnZXQgbWFuYWdlZFNldHRpbmdzU2VydmljZSgpOiBJQWdlbnRIb3N0TWFuYWdlZFNldHRpbmdzU2VydmljZSB7IHJldHVybiB0aGlzLl9tYW5hZ2VkU2V0dGluZ3NTZXJ2aWNlOyB9XG5cblx0LyoqIEV4cG9zZXMgdGhlIEdpdEh1YiBlbmRwb2ludCBzZXJ2aWNlIHNvIGFnZW50IHByb3ZpZGVycyBzaGFyZSBHaXRIdWIgKEVudGVycHJpc2UpIHJlc291cmNlIHJlc29sdXRpb24uICovXG5cdGdldCBnaXRIdWJFbmRwb2ludFNlcnZpY2UoKTogSUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSB7IHJldHVybiB0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2U7IH1cblxuXHQvKiogRXhwb3NlcyB0aGUgY2hlY2twb2ludCBzZXJ2aWNlIHNvIGFnZW50IHByb3ZpZGVycyBjYW4gY2FwdHVyZSBzZXNzaW9uIGJhc2VsaW5lcy4gKi9cblx0Z2V0IGNoZWNrcG9pbnRTZXJ2aWNlKCk6IElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSB7IHJldHVybiB0aGlzLl9jaGVja3BvaW50U2VydmljZTsgfVxuXG5cdC8qKiBFeHBvc2VzIHByb21wdC1jYWNoZSBtZXRhZGF0YSB3aXRob3V0IGV4cG9zaW5nIHRoZSB3aG9sZSBzdGF0ZSBtYW5hZ2VyLiAqL1xuXHRnZXQgcHJvbXB0Q2FjaGUoKTogSUFnZW50SG9zdFByb21wdENhY2hlIHsgcmV0dXJuIHRoaXMuX3Byb21wdENhY2hlOyB9XG5cblx0LyoqIEV4cG9zZXMgaG9zdC1vd25lZCBzZXNzaW9uLXRpdGxlIGNoYW5nZXMgd2l0aG91dCBleHBvc2luZyB0aGUgd2hvbGUgc3RhdGUgbWFuYWdlci4gKi9cblx0Z2V0IHNlc3Npb25UaXRsZVNpZ25hbCgpOiBJQWdlbnRIb3N0U2Vzc2lvblRpdGxlU2lnbmFsIHsgcmV0dXJuIHRoaXMuX3Nlc3Npb25UaXRsZVNpZ25hbDsgfVxuXG5cdC8qKiBSZWdpc3RlcmVkIHByb3ZpZGVycyBrZXllZCBieSB0aGVpciB7QGxpbmsgQWdlbnRQcm92aWRlcn0gaWQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVycyA9IG5ldyBNYXA8QWdlbnRQcm92aWRlciwgSUFnZW50PigpO1xuXHQvKiogTWFwcyBlYWNoIGFjdGl2ZSBzZXNzaW9uIFVSSSAodG9TdHJpbmcpIHRvIGl0cyBvd25pbmcgcHJvdmlkZXIuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25Ub1Byb3ZpZGVyID0gbmV3IE1hcDxzdHJpbmcsIEFnZW50UHJvdmlkZXI+KCk7XG5cdC8qKlxuXHQgKiBTZXNzaW9ucyB0aGF0IGhhdmUgb3B0ZWQgaW4gdG8gYnJpbmctdXAgcHJvZ3Jlc3MsIGtleWVkIGJ5IHByb3ZpZGVyIGlkLlxuXHQgKiBBIHNlc3Npb24gaXMgYWRkZWQgaGVyZSB3aGVuIGl0cyBgY3JlYXRlU2Vzc2lvbmAgY2FycmllcyBhXG5cdCAqIHtAbGluayBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnLnByb2dyZXNzVG9rZW59IGFuZCByZW1vdmVkIG9uY2UgaXRcblx0ICogbWF0ZXJpYWxpemVzICh0aGUgU0RLIGlzIG5vdyByZXNvbHZlZCkgb3IgaXMgZGlzcG9zZWQuIFRoZSBTREsgZG93bmxvYWQgaXNcblx0ICogaG9zdC1sZXZlbCBhbmQgc2hhcmVkIGFjcm9zcyBldmVyeSBzZXNzaW9uIG9mIGEgcHJvdmlkZXIsIHNvIHRoaXMgb25seVxuXHQgKiByZWNvcmRzICppbnRlcmVzdCo6IGFzIGxvbmcgYXMgb25lIG9yIG1vcmUgc2Vzc2lvbnMgb2YgYSBwcm92aWRlciBpc1xuXHQgKiByZWdpc3RlcmVkLCB7QGxpbmsgZW1pdERvd25sb2FkUHJvZ3Jlc3N9IHN1cmZhY2VzIHRoYXQgcHJvdmlkZXIncyBkb3dubG9hZCBhcyBhIHNpbmdsZVxuXHQgKiBwcm9ncmVzcyBzdHJlYW0ga2V5ZWQgYnkgdGhlIGRvd25sb2FkJ3Mgb3duIGlkZW50aXR5ICh0aGUgcGFja2FnZSBpZCksXG5cdCAqIHJhdGhlciB0aGFuIG9uZSBzdHJlYW0gcGVyIHNlc3Npb24uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kb3dubG9hZFByb2dyZXNzSW50ZXJlc3QgPSBuZXcgTWFwPEFnZW50UHJvdmlkZXIsIFNldDxzdHJpbmc+PigpO1xuXHQvKiogU3Vic2NyaXB0aW9ucyB0byBwcm92aWRlciBwcm9ncmVzcyBldmVudHM7IGNsZWFyZWQgd2hlbiBwcm92aWRlcnMgY2hhbmdlLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlclN1YnNjcmlwdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHQvKipcblx0ICogUGVyLXNlc3Npb24gdGFpbCBvZiBpbi1mbGlnaHQgcGVyc2lzdGVkIHBlZXItY2hhdCBjYXRhbG9nIHdyaXRlcywga2V5ZWQgYnlcblx0ICogc2Vzc2lvbiBVUkkgc3RyaW5nLiBSZWFkLW1vZGlmeS13cml0ZSB1cGRhdGVzIHRvIHRoZSB7QGxpbmtcblx0ICogUEVFUl9DSEFUU19NRVRBREFUQV9LRVl9IGJsb2IgYXJlIGNoYWluZWQgcGVyIHNlc3Npb24gc28gYSBgY3JlYXRlQ2hhdGAsXG5cdCAqIGBkaXNwb3NlQ2hhdGAsIGFuZCBgb25EaWRDaGFuZ2VDaGF0RGF0YWAgcmFjaW5nIGZvciB0aGUgc2FtZVxuXHQgKiBzZXNzaW9uIGNhbid0IGNsb2JiZXIgZWFjaCBvdGhlcidzIGVkaXRzLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVlckNoYXRDYXRhbG9nV3JpdGVzID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8dm9pZD4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2luZ1BlZXJDaGF0cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0Q2hhdEJhY2tpbmdXcml0ZXMgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTx2b2lkPj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYXV0aFNlcnZpY2U6IEFnZW50SG9zdEF1dGhlbnRpY2F0aW9uU2VydmljZTtcblx0LyoqIERlZmF1bHQgcHJvdmlkZXIgdXNlZCB3aGVuIG5vIGV4cGxpY2l0IHByb3ZpZGVyIGlzIHNwZWNpZmllZC4gKi9cblx0cHJpdmF0ZSBfZGVmYXVsdFByb3ZpZGVyOiBBZ2VudFByb3ZpZGVyIHwgdW5kZWZpbmVkO1xuXHQvKiogT2JzZXJ2YWJsZSByZWdpc3RlcmVkIGFnZW50cywgZHJpdmVzIGByb290L2FnZW50c0NoYW5nZWRgIHZpYSB7QGxpbmsgQWdlbnRTaWRlRWZmZWN0c30uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FnZW50cyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRbXT4oJ2FnZW50cycsIFtdKTtcblx0LyoqIFNoYXJlZCBzaWRlLWVmZmVjdCBoYW5kbGVyIGZvciBhY3Rpb24gZGlzcGF0Y2ggYW5kIHNlc3Npb24gbGlmZWN5Y2xlLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zaWRlRWZmZWN0czogQWdlbnRTaWRlRWZmZWN0cztcblx0LyoqIE93bnMgc3RhdGljIC8gcGVyLXR1cm4gY2hhbmdlc2V0IGNvbXB1dGUsIHB1Ymxpc2gsIHBlcnNpc3QsIHJlc3RvcmUuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYW5nZXNldHM6IElBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlO1xuXHQvKiogU2hhcmVkIGFjdGl2ZSBjaGFuZ2VzZXQgc3Vic2NyaXB0aW9uIHJlZ2lzdHJ5LiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGFuZ2VzZXRTdWJzY3JpcHRpb25zOiBJQWdlbnRIb3N0Q2hhbmdlc2V0U3Vic2NyaXB0aW9uU2VydmljZTtcblx0LyoqIE93bnMgY2hhbmdlc2V0IG9wZXJhdGlvbiBjb250cmlidXRpb25zIGFuZCBoYW5kbGVyIGFjdGl2YXRpb24uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYW5nZXNldE9wZXJhdGlvblNlcnZpY2U6IElBZ2VudEhvc3RDaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXZpZXdTZXJ2aWNlOiBJQWdlbnRIb3N0UmV2aWV3U2VydmljZTtcblx0LyoqIE93bnMgQWdlbnRTZXJ2aWNlLXNpZGUgb3JjaGVzdHJhdGlvbiBvZiB0aGUgY2hhbmdlc2V0IGZlYXR1cmUuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYW5nZXNldENvb3JkaW5hdG9yOiBBZ2VudEhvc3RDaGFuZ2VzZXRDb29yZGluYXRvcjtcblx0LyoqIE93bnMgc2Vzc2lvbiBnaXQtc3RhdGUgcHJvYmluZyBhbmQgZ2l0LWJhY2tlZCBjYXRhbG9ndWUgZGVjb3JhdGlvbi4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZ2l0U3RhdGVTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0U3RhdGVTZXJ2aWNlO1xuXHQvKiogTWFuYWdlcyBQVFktYmFja2VkIHRlcm1pbmFscyBmb3IgdGhlIGFnZW50IGhvc3QgcHJvdG9jb2wuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rlcm1pbmFsTWFuYWdlcjogQWdlbnRIb3N0VGVybWluYWxNYW5hZ2VyO1xuXHQvKiogUGVyc2lzdHMgaG9zdC1pbmplY3RlZCBgL3JlbmFtZWAgLyBgIWNvbW1hbmRgIHR1cm5zIGZvciByZXN0b3JlICYgZm9yay90cnVuY2F0ZS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfbG9jYWxUdXJuczogQWdlbnRIb3N0TG9jYWxUdXJucztcblx0LyoqIFNlcnZlci1zaWRlIGhvc3QgZm9yIHRoZSBhZ2VudCBob3N0J3Mgc2VydmVyIHRvb2xzLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXJ2ZXJUb29sSG9zdDogQWdlbnRTZXJ2ZXJUb29sSG9zdDtcblx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBBZ2VudEhvc3RTdG9yYWdlU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfY3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlOiBBZ2VudEhvc3RDdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2U7XG5cdC8qKiBDYXB0dXJlcyBiYXNlbGluZSAvIHBlci10dXJuIGdpdCBjaGVja3BvaW50cyBiYWNraW5nIHRoZSBjaGFuZ2VzZXQgcGlwZWxpbmUuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoZWNrcG9pbnRTZXJ2aWNlOiBJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb21wdENhY2hlOiBJQWdlbnRIb3N0UHJvbXB0Q2FjaGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25UaXRsZVNpZ25hbDogSUFnZW50SG9zdFNlc3Npb25UaXRsZVNpZ25hbDtcblx0LyoqXG5cdCAqIEhvc3Qtb3duZWQgd29ya3RyZWUgaXNvbGF0aW9uIGNvbnRyb2xsZXIuIFNldCBwb3N0LWNvbnN0cnVjdGlvbiB2aWFcblx0ICoge0BsaW5rIHNldFdvcmt0cmVlSXNvbGF0aW9ufSBhZnRlciBob3N0IHN0YXJ0dXAgY29uc3RydWN0cyB0aGUgQ29waWxvdCBBUElcblx0ICogZGVwZW5kZW5jaWVzLiBBbGwgd29ya3RyZWUgYmVoYXZpb3IgXHUyMDE0IHNjaGVtYSBjb250cmlidXRpb24sIGZpcnN0LXNlbmRcblx0ICogcmVzb2x1dGlvbiwgcHJvamVjdCAvIGFubm91bmNlbWVudCwgYXJjaGl2ZSwgYW5kIGNsZWFudXAgXHUyMDE0IGlzIGRyaXZlbiBmcm9tXG5cdCAqIHRoZSBob3N0IHNvIGluZGl2aWR1YWwgYWdlbnRzIHN0YXkgdW5hd2FyZSBvZiB0aGUgZm9sZGVyLXZzLXdvcmt0cmVlXG5cdCAqIGRpc3RpbmN0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfd29ya3RyZWU6IFdvcmt0cmVlSXNvbGF0aW9uIHwgdW5kZWZpbmVkO1xuXHQvKiogU2luZ2xlIHNvdXJjZSBvZiB0cnV0aCBmb3IgR2l0SHViIChFbnRlcnByaXNlKSBlbmRwb2ludHMgYW5kIHByb3RlY3RlZCByZXNvdXJjZXMuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2dpdEh1YkVuZHBvaW50U2VydmljZTogSUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZTtcblx0LyoqIFBsdWdnYWJsZSBjb21wbGV0aW9uIGl0ZW0gcHJvdmlkZXJzIChlLmcuIHdvcmtzcGFjZSBmaWxlIGNvbXBsZXRpb25zLCBhZ2VudC1zcGVjaWZpYyBALW1lbnRpb25zKS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY29tcGxldGlvbnM6IElBZ2VudEhvc3RDb21wbGV0aW9ucztcblx0cHJpdmF0ZSBfc2tpbGxDb21wbGV0aW9uUHJvdmlkZXJSZWdpc3RlcmVkID0gZmFsc2U7XG5cdC8qKiBCYWNrcyB7QGxpbmsgZ2V0TmV0d29ya0RpYWdub3N0aWNzSW5mb30gLyB7QGxpbmsgZGlhZ25vc3RpY3NGZXRjaH07IHdpcmVkIHZpYSB7QGxpbmsgc2V0TmV0d29ya0RpYWdub3N0aWNzU2VydmljZX0uICovXG5cdHByaXZhdGUgX25ldHdvcmtEaWFnbm9zdGljczogSU5ldHdvcmtEaWFnbm9zdGljc1NlcnZpY2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2VkaXRBdHRyaWJ1dGlvblNlcnZpY2U6IElBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIEF1dGhvcml0YXRpdmUgc2VydmVyLXNpZGUgcGVyLXJlc291cmNlIHN1YnNjcmlwdGlvbiByZWZjb3VudCwga2V5ZWQgYnlcblx0ICogcmVzb3VyY2UgVVJJIHN0cmluZyBhbmQgdmFsdWVkIGJ5IHRoZSBzZXQgb2Ygc3Vic2NyaWJlZCBwcm90b2NvbFxuXHQgKiBjbGllbnQgSURzLiBQb3B1bGF0ZWQgYnkge0BsaW5rIHN1YnNjcmliZX0gKG9yIHtAbGluayBhZGRTdWJzY3JpYmVyfVxuXHQgKiBmb3IgaGFuZHNoYWtlIGZhc3QtcGF0aHMpIGFuZCBkcmFpbmVkIGJ5IHtAbGluayB1bnN1YnNjcmliZX0uIFdoZW4gYVxuXHQgKiByZXNvdXJjZSdzIHNldCBiZWNvbWVzIGVtcHR5LCB0aGUgcmVzb3VyY2UgaXMgZHJvcHBlZCBmcm9tIHRoZSBtYXAgYW5kXG5cdCAqIHtAbGluayBfbWF5YmVFdmljdElkbGVTZXNzaW9ufSBpcyBpbnZva2VkIHRvIHJlbGVhc2UgYW55IGNhY2hlZCBzdGF0ZVxuXHQgKiBmb3IgaXQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvdXJjZVN1YnNjcmliZXJzID0gbmV3IFJlc291cmNlTWFwPFNldDxzdHJpbmc+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZWxlYXNlU2Vzc2lvbkluRmxpZ2h0ID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8dm9pZD4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc3RvcmVTZXNzaW9uSW5GbGlnaHQgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTx2b2lkPj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVzdG9yZVN1YmFnZW50SW5GbGlnaHQgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTx2b2lkPj4oKTtcblxuXHQvKiogU3ViYWdlbnQgY2hhdHMgYXJtZWQgZm9yIGEgYm91bmRlZCB3YWl0IChvbmNlIGV4ZWN1dGlvbiBpcyBjb25maXJtZWQpOyByZXNvbHZlZCBieSB7QGxpbmsgX29uQ2hhdFNwYXduZWR9LCBhd2FpdGVkIGJ5IHtAbGluayBzdWJzY3JpYmV9LiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nU3ViYWdlbnRDaGF0cyA9IG5ldyBNYXA8c3RyaW5nIC8qIHN1YmFnZW50Q2hhdFVyaSAqLywgRGVmZXJyZWRQcm9taXNlPHZvaWQ+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nU3ViYWdlbnRDaGF0VGltZW91dHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcgLyogc3ViYWdlbnRDaGF0VXJpICovLCBJRGlzcG9zYWJsZT4oKSk7XG5cdC8qKiBTdWJhZ2VudCBjaGF0cyBhbm5vdW5jZWQgdmlhIGBfbWV0YS5zdWJhZ2VudENoYXRVcmlgIGJ1dCBzdGlsbCBhd2FpdGluZyBjb25maXJtYXRpb24sIGtleWVkIGJ5IGAke2NoYW5uZWx9OiR7dG9vbENhbGxJZH1gLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nU3ViYWdlbnRUb29sQ2FsbHMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nIC8qIHN1YmFnZW50Q2hhdFVyaSAqLz4oKTtcblxuXHQvKipcblx0ICogUGVuZGluZyB7QGxpbmsgX3J1blNlc3Npb25HY30gdGltZXJzLCBrZXllZCBieSBzZXNzaW9uIFVSSS4gQSB0aW1lciBpc1xuXHQgKiBhcm1lZCB3aGVuIGEgc2Vzc2lvbiBsb3NlcyBpdHMgbGFzdCBzdWJzY3JpYmVyIHdoaWxlIHN0aWxsIGVtcHR5IChub1xuXHQgKiB0dXJucywgbm8gYWN0aXZlIHR1cm4pIFx1MjAxNCBzZWUge0BsaW5rIF9tYXliZVNjaGVkdWxlU2Vzc2lvbkdjfS4gQ2xlYXJlZFxuXHQgKiB3aGVuZXZlciBhbnkgY2xpZW50IHN1YnNjcmliZXMgYWdhaW4gb3IgdGhlIHRpbWVyIGZpcmVzLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1Nlc3Npb25HYyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlUmVzb3VyY2VNYXA8SURpc3Bvc2FibGU+KCkpO1xuXG5cdC8qKlxuXHQgKiBQZW5kaW5nIHtAbGluayBfbWF5YmVFdmljdElkbGVTZXNzaW9ufSB0aW1lcnMsIGtleWVkIGJ5IHNlc3Npb24gVVJJLiBBXG5cdCAqIHRpbWVyIGlzIGFybWVkIHdoZW4gYW4gaWRsZSBzZXNzaW9uICh3aXRoIHR1cm5zKSBsb3NlcyBpdHMgbGFzdCBzdWJzY3JpYmVyXG5cdCAqIFx1MjAxNCBzZWUge0BsaW5rIHVuc3Vic2NyaWJlfS4gQ2xlYXJlZCB3aGVuIGFueSBjbGllbnQgc3Vic2NyaWJlcyBhZ2FpblxuXHQgKiAoe0BsaW5rIGFkZFN1YnNjcmliZXJ9KSBvciB0aGUgdGltZXIgZmlyZXMuIERlZmVycmluZyB0aGUgcmVsZWFzZSBhdm9pZHNcblx0ICogY2h1cm5pbmcgdGhlIHByb3ZpZGVyIFNESyBzZXNzaW9uIG9uIHJhcGlkIGRpc2Nvbm5lY3QvcmVjb25uZWN0IGN5Y2xlcy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdTZXNzaW9uUmVsZWFzZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlUmVzb3VyY2VNYXA8SURpc3Bvc2FibGU+KCkpO1xuXG5cdC8qKlxuXHQgKiBBY3RpdmUgcmVzb3VyY2Ugd2F0Y2hlcyBrZXllZCBieSB0aGUgY2hhbm5lbCBVUkkgc3RyaW5nXG5cdCAqIChgYWhwLXJlc291cmNlLXdhdGNoOi88ZW5jb2RlZD5gKS5cblx0ICpcblx0ICogRWFjaCBlbnRyeSBvd25zIHRoZSB7QGxpbmsgSUZpbGVTZXJ2aWNlfSB3YXRjaGVyIHRvZ2V0aGVyIHdpdGggdGhlXG5cdCAqIGRlY29kZWQgZGVzY3JpcHRvciwgdGhlIHN1YnNjcmliZXIgcmVmY291bnQsIGFuZCB0aGUgb3B0aW9uYWxcblx0ICogZ3JhY2Utd2luZG93IGRpc3Bvc2UgdGltZXIuIFRoZSB3YXRjaCBVUkkgaXRzZWxmIGlzIGZ1bGx5XG5cdCAqIHNlbGYtZGVzY3JpYmluZyBcdTIwMTQge0BsaW5rIGNyZWF0ZVJlc291cmNlV2F0Y2h9IGp1c3QgZW5jb2RlcyB0aGVcblx0ICogY2FsbGVyJ3MgcGFyYW1zIGludG8gdGhlIFVSSSBhbmQgcmV0dXJucyBpdC4gU3RhdGUgb25seSBleGlzdHNcblx0ICogaGVyZSBvbmNlIGF0IGxlYXN0IG9uZSBjbGllbnQgaGFzIHN1YnNjcmliZWQuXG5cdCAqXG5cdCAqIExpZmVjeWNsZTpcblx0ICogLSBGaXJzdCBzdWJzY3JpYmVyIHRvIGEgY2hhbm5lbDoge0BsaW5rIG9uUmVzb3VyY2VXYXRjaFN1YnNjcmliZWR9XG5cdCAqICAgcGFyc2VzIHRoZSBVUkksIGNyZWF0ZXMgdGhlIHtAbGluayBJRmlsZVNlcnZpY2V9IHdhdGNoZXIsIGFuZFxuXHQgKiAgIGluc3RhbGxzIHRoZSBlbnRyeSB3aXRoIGBzdWJzY3JpYmVycyA9IDFgLlxuXHQgKiAtIFN1YnNlcXVlbnQgc3Vic2NyaWJlcnMgYnVtcCB0aGUgcmVmY291bnQgYW5kIGNhbmNlbCBhbnkgcGVuZGluZ1xuXHQgKiAgIGdyYWNlLXdpbmRvdyBkaXNwb3NlIHRpbWVyLlxuXHQgKiAtIHtAbGluayBvblJlc291cmNlV2F0Y2hVbnN1YnNjcmliZWR9IGRyb3BzIHRoZSByZWZjb3VudDsgd2hlbiBpdFxuXHQgKiAgIHJlYWNoZXMgemVybyB3ZSBhcm0gYSB7QGxpbmsgUkVTT1VSQ0VfV0FUQ0hfR1JBQ0VfTVN9IGRpc3Bvc2Vcblx0ICogICB0aW1lciByYXRoZXIgdGhhbiB0ZWFyaW5nIGRvd24gaW1tZWRpYXRlbHksIGdpdmluZyBkaXNjb25uZWN0ZWRcblx0ICogICBjbGllbnRzIHRpbWUgdG8gcmVjb25uZWN0LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVzb3VyY2VXYXRjaGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBJQWN0aXZlUmVzb3VyY2VXYXRjaD4oKSk7XG5cblx0LyoqIEV4cG9zZXMgdGhlIHRlcm1pbmFsIG1hbmFnZXIgZm9yIHVzZSBieSBhZ2VudCBwcm92aWRlcnMuICovXG5cdGdldCB0ZXJtaW5hbE1hbmFnZXIoKTogSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciB7IHJldHVybiB0aGlzLl90ZXJtaW5hbE1hbmFnZXI7IH1cblxuXHQvKiogRXhwb3NlcyB0aGUgY29tcGxldGlvbnMgc2VydmljZSBmb3IgdXNlIGJ5IGFnZW50IHByb3ZpZGVycyAoZS5nLiB0byByZWdpc3RlciBhZ2VudC1zY29wZWQgY29tcGxldGlvbiBpdGVtIHByb3ZpZGVycykuICovXG5cdGdldCBjb21wbGV0aW9uc1NlcnZpY2UoKTogSUFnZW50SG9zdENvbXBsZXRpb25zIHsgcmV0dXJuIHRoaXMuX2NvbXBsZXRpb25zOyB9XG5cblx0LyoqXG5cdCAqIFRyaWdnZXIgY2hhcmFjdGVycyBhbm5vdW5jZWQgdG8gY2xpZW50cyB2aWEgYEluaXRpYWxpemVSZXN1bHQuY29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzYC5cblx0ICogQWdncmVnYXRlZCBmcm9tIGFsbCByZWdpc3RlcmVkIHtAbGluayBJQWdlbnRIb3N0Q29tcGxldGlvbkl0ZW1Qcm92aWRlcn1zLlxuXHQgKi9cblx0Z2V0IGNvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVycygpOiByZWFkb25seSBzdHJpbmdbXSB7IHJldHVybiB0aGlzLl9jb21wbGV0aW9ucy50cmlnZ2VyQ2hhcmFjdGVyczsgfVxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaWFnbm9zdGljc0xvZzogRm9yZ2VEaWFnbm9zdGljc0xvZyB8IHVuZGVmaW5lZDtcblx0Z2V0IGRpYWdub3N0aWNzTG9nKCk6IEZvcmdlRGlhZ25vc3RpY3NMb2cgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy5fZGlhZ25vc3RpY3NMb2c7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25EYXRhU2VydmljZTogSVNlc3Npb25EYXRhU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dpdFNlcnZpY2U6IElBZ2VudEhvc3RHaXRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Jvb3RDb25maWdSZXNvdXJjZT86IFVSSSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSA9IE51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdF9maWxlTW9uaXRvclNlcnZpY2U/OiBJQWdlbnRIb3N0RmlsZU1vbml0b3JTZXJ2aWNlLFxuXHRcdGNvcGlsb3RBcGlTZXJ2aWNlPzogSUNvcGlsb3RBcGlTZXJ2aWNlLFxuXHRcdGZldGNoRm4/OiB0eXBlb2YgZ2xvYmFsVGhpcy5mZXRjaCxcblx0XHRwcm92aWRlckNvbmZpZ3VyYXRpb25zOiByZWFkb25seSBJQWdlbnRDdXN0b21pemF0aW9uU2V0dGluZ3NSZWdpc3RyYXRpb25bXSA9IFtdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hvc3RMYXVuY2hLaW5kID0gQWdlbnRIb3N0TGF1bmNoS2luZC5Vbmtub3duLFxuXHRcdHN0b3JhZ2VSZXNvdXJjZT86IFVSSSxcblx0XHRvcmNoZXN0cmF0b3JEYXRhYmFzZT86IElBZ2VudEhvc3REYXRhYmFzZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ub3c6ICgpID0+IG51bWJlciA9IERhdGUubm93LFxuXHRcdGxvZ3NIb21lPzogVVJJLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbygnQWdlbnRTZXJ2aWNlIGluaXRpYWxpemVkJyk7XG5cdFx0Y29uc3QgZGlhZ25vc3RpY3NMb2cgPSB0aGlzLl9kaWFnbm9zdGljc0xvZyA9IGxvZ3NIb21lID8gdGhpcy5fcmVnaXN0ZXIobmV3IEZvcmdlRGlhZ25vc3RpY3NMb2cobG9nc0hvbWUpKSA6IHVuZGVmaW5lZDtcblx0XHRzZXRBY3RpdmVGb3JnZURpYWdub3N0aWNzTG9nKGRpYWdub3N0aWNzTG9nKTtcblx0XHR0aGlzLl9hdXRoU2VydmljZSA9IG5ldyBBZ2VudEhvc3RBdXRoZW50aWNhdGlvblNlcnZpY2UoX2xvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGRhdGFiYXNlUGF0aCA9IHRoaXMuX3Jvb3RDb25maWdSZXNvdXJjZVxuXHRcdFx0PyBqb2luUGF0aChyZXNvdXJjZXNEaXJuYW1lKHRoaXMuX3Jvb3RDb25maWdSZXNvdXJjZSksICdhZ2VudC1ob3N0LmRiJykuZnNQYXRoXG5cdFx0XHQ6ICc6bWVtb3J5Oic7XG5cdFx0dGhpcy5fb3JjaGVzdHJhdG9yRGF0YWJhc2UgPSB0aGlzLl9yZWdpc3RlcihvcmNoZXN0cmF0b3JEYXRhYmFzZSA/PyBuZXcgQWdlbnRIb3N0RGF0YWJhc2UoZGF0YWJhc2VQYXRoKSk7XG5cdFx0dGhpcy5fc2Vzc2lvblJlZ2lzdHJ5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFnZW50U2Vzc2lvblJlZ2lzdHJ5KHRoaXMuX29yY2hlc3RyYXRvckRhdGFiYXNlKSk7XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihfbG9nU2VydmljZSwge1xuXHRcdFx0aG9zdEJ1aWxkSW5mbzogaG9zdEJ1aWxkSW5mb0Zyb21Qcm9kdWN0KHRoaXMuX3Byb2R1Y3RTZXJ2aWNlKSxcblx0XHRcdGNoYW5nZXNldFN0YXRlUmV0ZW50aW9uOiB7XG5cdFx0XHRcdC8vIFRoZSBjYWNoZSBjYWxscyB0aGlzIGxhemlseSBhZnRlciBjb25zdHJ1Y3Rpb24uIElmIGEgZnV0dXJlIHN0YXRlLW1hbmFnZXJcblx0XHRcdFx0Ly8gaW5pdGlhbGl6YXRpb24gcGF0aCByZWdpc3RlcnMgY2hhbmdlc2V0cyBiZWZvcmUgYF9jaGFuZ2VzZXRzYCBpcyBhc3NpZ25lZCxcblx0XHRcdFx0Ly8ga2VlcCB0aGUgZW50cnkgcGlubmVkIHJhdGhlciB0aGFuIGV2aWN0aW5nIHdpdGggaW5jb21wbGV0ZSBsaXZlbmVzcyBkYXRhLlxuXHRcdFx0XHRjYW5FdmljdDogY2hhbmdlc2V0ID0+IHRoaXMuX2NoYW5nZXNldHMgPyB0aGlzLl9pc0NoYW5nZXNldEV2aWN0YWJsZShjaGFuZ2VzZXQpIDogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiB0aGlzLl9vbkRpZEFjdGlvbi5maXJlKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc3RhdGVNYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4ge1xuXHRcdFx0aWYgKCFkaWFnbm9zdGljc0xvZykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhY3Rpb24gPSBlLmFjdGlvbjtcblx0XHRcdGNvbnN0IHByb3RvY29sU3VtbWFyeTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7IGNoYW5uZWw6IGUuY2hhbm5lbCwgdHlwZTogYWN0aW9uLnR5cGUsIHNlcnZlclNlcTogZS5zZXJ2ZXJTZXEsIG9yaWdpbjogZS5vcmlnaW4sIHJlamVjdGlvblJlYXNvbjogZS5yZWplY3Rpb25SZWFzb24gfTtcblx0XHRcdGRpYWdub3N0aWNzTG9nLnJlY29yZCgncHJvdG9jb2wnLCAnQUhQLkFDVElPTicsIHByb3RvY29sU3VtbWFyeSk7XG5cdFx0XHRpZiAoYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuVGVybWluYWxEYXRhKSB7XG5cdFx0XHRcdGRpYWdub3N0aWNzTG9nLnJlY29yZFN0cmVhbSgndGVybWluYWwnLCBgJHtlLmNoYW5uZWx9Om91dHB1dGAsICdURVJNSU5BTC5TVERPVVQnLCBhY3Rpb24uZGF0YSwgeyB0ZXJtaW5hbDogZS5jaGFubmVsIH0pO1xuXHRcdFx0fSBlbHNlIGlmIChhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5UZXJtaW5hbElucHV0KSB7XG5cdFx0XHRcdGRpYWdub3N0aWNzTG9nLnJlY29yZFRleHQoJ3Rlcm1pbmFsJywgJ1RFUk1JTkFMLklOUFVUJywgYWN0aW9uLmRhdGEsIHsgdGVybWluYWw6IGUuY2hhbm5lbCB9KTtcblx0XHRcdH0gZWxzZSBpZiAoYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuVGVybWluYWxDb21tYW5kRXhlY3V0ZWQpIHtcblx0XHRcdFx0ZGlhZ25vc3RpY3NMb2cucmVjb3JkVGV4dCgndGVybWluYWwnLCAnQ09NTUFORCcsIGFjdGlvbi5jb21tYW5kTGluZSwgeyB0ZXJtaW5hbDogZS5jaGFubmVsLCBjb21tYW5kSWQ6IGFjdGlvbi5jb21tYW5kSWQsIHRpbWVzdGFtcDogYWN0aW9uLnRpbWVzdGFtcCB9KTtcblx0XHRcdH0gZWxzZSBpZiAoYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuVGVybWluYWxDb21tYW5kRmluaXNoZWQpIHtcblx0XHRcdFx0ZGlhZ25vc3RpY3NMb2cuZmx1c2hTdHJlYW1zKGAke2UuY2hhbm5lbH06b3V0cHV0YCk7XG5cdFx0XHRcdGRpYWdub3N0aWNzTG9nLnJlY29yZCgndGVybWluYWwnLCAnQ09NTUFORC5GSU5JU0hFRCcsIHsgY29tbWFuZElkOiBhY3Rpb24uY29tbWFuZElkLCBleGl0Q29kZTogYWN0aW9uLmV4aXRDb2RlLCBkdXJhdGlvbk1zOiBhY3Rpb24uZHVyYXRpb25NcyB9LCB7IHRlcm1pbmFsOiBlLmNoYW5uZWwgfSk7XG5cdFx0XHR9IGVsc2UgaWYgKGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlRlcm1pbmFsRXhpdGVkKSB7XG5cdFx0XHRcdGRpYWdub3N0aWNzTG9nLmZsdXNoU3RyZWFtcyhgJHtlLmNoYW5uZWx9Om91dHB1dGApO1xuXHRcdFx0XHRkaWFnbm9zdGljc0xvZy5yZWNvcmQoJ3Rlcm1pbmFsJywgJ1RFUk1JTkFMLkVYSVRFRCcsIHsgZXhpdENvZGU6IGFjdGlvbi5leGl0Q29kZSB9LCB7IHRlcm1pbmFsOiBlLmNoYW5uZWwgfSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3N0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IHRoaXMuX3RyYWNrUGVuZGluZ1N1YmFnZW50Q2hhdEZyb21FbnZlbG9wZShlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3N0YXRlTWFuYWdlci5vbkRpZEVtaXROb3RpZmljYXRpb24oZSA9PiB0aGlzLl9vbkRpZE5vdGlmaWNhdGlvbi5maXJlKGUpKSk7XG5cblx0XHQvLyBCdWlsZCBhIGxvY2FsIGluc3RhbnRpYXRpb24gc2NvcGUgc28gZG93bnN0cmVhbSBjb21wb25lbnRzIGNhblxuXHRcdC8vIGNvbnN1bWUge0BsaW5rIElBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlfSAoYW5kIGxhdGVyIHtAbGluayBJTG9nU2VydmljZX0pXG5cdFx0Ly8gdmlhIERJIHJhdGhlciB0aGFuIGJlaW5nIHBsdW1iZWQgcGxhaW4tY2xhc3MgcmVmZXJlbmNlcy5cblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlKHRoaXMuX3N0YXRlTWFuYWdlciwgdGhpcy5fbG9nU2VydmljZSwgdGhpcy5fcm9vdENvbmZpZ1Jlc291cmNlLCBwcm92aWRlckNvbmZpZ3VyYXRpb25zKSk7XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UgPSBjb25maWd1cmF0aW9uU2VydmljZTtcblx0XHRsZXQgZXh0ZXJuYWxTZXNzaW9uc01vZGUgPSB0aGlzLl9nZXRFeHRlcm5hbFNlc3Npb25zTW9kZSgpO1xuXHRcdHRoaXMuX2xhc3RNaWdyYXRlTGVnYWN5RW5hYmxlZCA9IHRoaXMuX2lzTWlncmF0ZUxlZ2FjeUVuYWJsZWQoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZFJvb3RDb25maWdDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0Y29uc3QgbmV4dE1vZGUgPSB0aGlzLl9nZXRFeHRlcm5hbFNlc3Npb25zTW9kZSgpO1xuXHRcdFx0aWYgKG5leHRNb2RlICE9PSBleHRlcm5hbFNlc3Npb25zTW9kZSkge1xuXHRcdFx0XHRjb25zdCBwcmV2aW91c01vZGUgPSBleHRlcm5hbFNlc3Npb25zTW9kZTtcblx0XHRcdFx0ZXh0ZXJuYWxTZXNzaW9uc01vZGUgPSBuZXh0TW9kZTtcblx0XHRcdFx0dGhpcy5fcXVldWVTZXNzaW9uTGlzdFJlY29uY2lsaWF0aW9uKHByZXZpb3VzTW9kZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbk1pZ3JhdGVMZWdhY3lTZXR0aW5nQ2hhbmdlZCgpO1xuXHRcdH0pKTtcblx0XHRjb25zdCBmaWxlTW9uaXRvclNlcnZpY2UgPSBfZmlsZU1vbml0b3JTZXJ2aWNlID8/IHRoaXMuX3JlZ2lzdGVyKG5ldyBBZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2UodGhpcy5fZmlsZVNlcnZpY2UsIHRoaXMuX2xvZ1NlcnZpY2UpKTtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBZ2VudEhvc3RTdG9yYWdlU2VydmljZShzdG9yYWdlUmVzb3VyY2UsIHRoaXMuX2xvZ1NlcnZpY2UpKTtcblx0XHR1cGRhdGVBZ2VudEhvc3RUZWxlbWV0cnlMZXZlbEZyb21Db25maWcodGhpcy5fdGVsZW1ldHJ5U2VydmljZSwgdGhpcy5fc3RhdGVNYW5hZ2VyLnJvb3RTdGF0ZS5jb25maWc/LnZhbHVlcyk7XG5cdFx0Y29uc3Qgc2VydmljZXMgPSBuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbSUxvZ1NlcnZpY2UsIHRoaXMuX2xvZ1NlcnZpY2VdLFxuXHRcdFx0W0lBZ2VudFNlcnZpY2UsIHRoaXNdLFxuXHRcdFx0W0lQcm9kdWN0U2VydmljZSwgdGhpcy5fcHJvZHVjdFNlcnZpY2VdLFxuXHRcdFx0W0lBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZV0sXG5cdFx0XHRbSUFnZW50SG9zdFN0YXRlTWFuYWdlciwgdGhpcy5fc3RhdGVNYW5hZ2VyXSxcblx0XHRcdFtJQWdlbnRIb3N0RmlsZU1vbml0b3JTZXJ2aWNlLCBmaWxlTW9uaXRvclNlcnZpY2VdLFxuXHRcdFx0W0lBZ2VudEhvc3RHaXRTZXJ2aWNlLCB0aGlzLl9naXRTZXJ2aWNlXSxcblx0XHRcdFtJQWdlbnRIb3N0U3RvcmFnZVNlcnZpY2UsIHRoaXMuX3N0b3JhZ2VTZXJ2aWNlXSxcblx0XHRcdFtJVGVsZW1ldHJ5U2VydmljZSwgdGhpcy5fdGVsZW1ldHJ5U2VydmljZV0sXG5cdFx0XHQvLyBUaGUgb3V0ZXIgYWdlbnQtaG9zdCBwcm9jZXNzIERJIHJlZ2lzdGVycyBgSVNlc3Npb25EYXRhU2VydmljZWAsXG5cdFx0XHQvLyBidXQgdGhpcyBuZXN0ZWQgc3RyaWN0IGBJbnN0YW50aWF0aW9uU2VydmljZWAgZG9lcyBub3QgaW5oZXJpdCBpdC5cblx0XHRcdC8vIEFkZCBpdCBleHBsaWNpdGx5IHNvIGBASVNlc3Npb25EYXRhU2VydmljZWAgaW5qZWN0aW9uIGludG8gdGhlXG5cdFx0XHQvLyBjaGFuZ2VzZXQgc2VydmljZSAoYW5kIGFueSBmdXR1cmUgc2libGluZykgcmVzb2x2ZXMgY29ycmVjdGx5LlxuXHRcdFx0W0lTZXNzaW9uRGF0YVNlcnZpY2UsIHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZV0sXG5cdFx0KTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShzZXJ2aWNlcywgLypzdHJpY3QqLyB0cnVlKSk7XG5cdFx0dGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UsIHRoaXMuX2dpdEh1YkVuZHBvaW50U2VydmljZSk7XG5cdFx0Ly8gQSBHaXRIdWIgRW50ZXJwcmlzZSBVUkkgY2hhbmdlIHJlcG9pbnRzIGV2ZXJ5IGFnZW50J3MgR2l0SHViIHJlc291cmNlXG5cdFx0Ly8gaWRlbnRpdHkgdG8gYSBkaWZmZXJlbnQgYXV0aG9yaXphdGlvbiBzZXJ2ZXIsIHNvIHRoZSBjbGllbnQgbXVzdCBvYnRhaW4gYVxuXHRcdC8vIHRva2VuIGZvciB0aGUgbmV3IHJlc291cmNlLiBPbmUgcm9vdC1jaGFubmVsIGBhdXRoL3JlcXVpcmVkYCBjb3ZlcnMgYWxsXG5cdFx0Ly8gYWdlbnRzICh0aGUgVVJJIGlzIGhvc3QtbGV2ZWwgY29uZmlnKS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2Uub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmVtaXRBdXRoUmVxdWlyZWQoe1xuXHRcdFx0XHRyZXNvdXJjZTogdGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlLmdldENvcGlsb3RSZXNvdXJjZSgpLFxuXHRcdFx0XHRyZWFzb246IEF1dGhSZXF1aXJlZFJlYXNvbi5SZXF1aXJlZCxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0XHRjb25zdCBhZ2VudEhvc3RPY3RvS2l0U2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdE9jdG9LaXRTZXJ2aWNlLCBmZXRjaEZuKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUFnZW50SG9zdE9jdG9LaXRTZXJ2aWNlLCBhZ2VudEhvc3RPY3RvS2l0U2VydmljZSk7XG5cdFx0Y29uc3QgZ2l0SHViU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEdpdEh1YlNlcnZpY2UsIHtcblx0XHRcdGVuZHBvaW50OiB0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2UsXG5cdFx0XHR0b2tlblByb3ZpZGVyOiB7XG5cdFx0XHRcdGdldFRva2VuOiAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2UuZ2V0UmVwb1Jlc291cmNlKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX2F1dGhTZXJ2aWNlLmdldEF1dGhUb2tlbih7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogcmVzb3VyY2UucmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRzY29wZXM6IHJlc291cmNlLnNjb3Blc19zdXBwb3J0ZWQsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0ZmV0Y2g6IGZldGNoRm4sXG5cdFx0fSkpO1xuXHRcdHNlcnZpY2VzLnNldChJR2l0SHViU2VydmljZSwgZ2l0SHViU2VydmljZSk7XG5cdFx0Y29uc3QgZWZmZWN0aXZlQ29waWxvdEFwaVNlcnZpY2UgPSBjb3BpbG90QXBpU2VydmljZSA/PyBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb3BpbG90QXBpU2VydmljZSwgZmV0Y2hGbik7XG5cdFx0c2VydmljZXMuc2V0KElDb3BpbG90QXBpU2VydmljZSwgZWZmZWN0aXZlQ29waWxvdEFwaVNlcnZpY2UpO1xuXHRcdHRoaXMuX2N1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdEN1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJQWdlbnRIb3N0Q3VzdG9taXphdGlvbkVuYWJsZW1lbnRTZXJ2aWNlLCB0aGlzLl9jdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fZ2l0U3RhdGVTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0R2l0U3RhdGVTZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElBZ2VudEhvc3RHaXRTdGF0ZVNlcnZpY2UsIHRoaXMuX2dpdFN0YXRlU2VydmljZSk7XG5cblx0XHR0aGlzLl9jaGVja3BvaW50U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlKSk7XG5cdFx0c2VydmljZXMuc2V0KElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSwgdGhpcy5fY2hlY2twb2ludFNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fcHJvbXB0Q2FjaGUgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RQcm9tcHRDYWNoZSk7XG5cdFx0c2VydmljZXMuc2V0KElBZ2VudEhvc3RQcm9tcHRDYWNoZSwgdGhpcy5fcHJvbXB0Q2FjaGUpO1xuXHRcdHRoaXMuX3Nlc3Npb25UaXRsZVNpZ25hbCA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdFNlc3Npb25UaXRsZVNpZ25hbCkpO1xuXHRcdHNlcnZpY2VzLnNldChJQWdlbnRIb3N0U2Vzc2lvblRpdGxlU2lnbmFsLCB0aGlzLl9zZXNzaW9uVGl0bGVTaWduYWwpO1xuXG5cdFx0Ly8gVGhlIHN1YnNjcmlwdGlvbiBzZXJ2aWNlIG1hbmFnZXMgdGhlIGxpZmVjeWNsZSBvZiBjaGFuZ2VzZXQgc3Vic2NyaXB0aW9ucy4gVGhlIHNlcnZpY2Vcblx0XHQvLyBpcyBhbHNvIGNvbnN1bHRlZCBieSBvdGhlciBzZXJ2aWNlcyB3aGVuIHJlZnJlc2hpbmcgY2hhbmdlc2V0cyBhbmQgY2hhbmdlc2V0IG9wZXJhdGlvbnMuXG5cdFx0dGhpcy5fY2hhbmdlc2V0U3Vic2NyaXB0aW9ucyA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdENoYW5nZXNldFN1YnNjcmlwdGlvblNlcnZpY2UpO1xuXHRcdHNlcnZpY2VzLnNldChJQWdlbnRIb3N0Q2hhbmdlc2V0U3Vic2NyaXB0aW9uU2VydmljZSwgdGhpcy5fY2hhbmdlc2V0U3Vic2NyaXB0aW9ucyk7XG5cblx0XHQvLyBUaGUgb3BlcmF0aW9uIGNvbnRyaWJ1dGlvbiBzZXJ2aWNlIG1hbmFnZXMgdGhlIGxpZmVjeWNsZSBvZiBjaGFuZ2VzZXQgb3BlcmF0aW9ucy5cblx0XHR0aGlzLl9jaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0Q2hhbmdlc2V0T3BlcmF0aW9uU2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJQWdlbnRIb3N0Q2hhbmdlc2V0T3BlcmF0aW9uU2VydmljZSwgdGhpcy5fY2hhbmdlc2V0T3BlcmF0aW9uU2VydmljZSk7XG5cblx0XHQvLyBUaGUgY2hhbmdlcyByZXZpZXcgc2VydmljZSBpcyByZXNwb25zaWJsZSBmb3IgbWFuYWdpbmcgcmV2aWV3L3VucmV2aWV3IHN0YXRlIGZvciBjaGFuZ2VzZXQgY2hhbmdlcy5cblx0XHR0aGlzLl9yZXZpZXdTZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0UmV2aWV3U2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJQWdlbnRIb3N0UmV2aWV3U2VydmljZSwgdGhpcy5fcmV2aWV3U2VydmljZSk7XG5cblx0XHQvLyBUaGUgY2hhbmdlc2V0IHNlcnZpY2UgaXMgcmVzcG9uc2libGUgZm9yIGNvbXB1dGluZywgcHVibGlzaGluZywgYW5kIHBlcnNpc3RpbmcgY2hhbmdlc2V0cy5cblx0XHR0aGlzLl9jaGFuZ2VzZXRzID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZSkpO1xuXHRcdHNlcnZpY2VzLnNldChJQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZSwgdGhpcy5fY2hhbmdlc2V0cyk7XG5cblx0XHQvLyBUaGUgY29vcmRpbmF0b3Igb3ducyBhbGwgQWdlbnRTZXJ2aWNlLXNpZGUgb3JjaGVzdHJhdGlvbiBvZiB0aGUgY2hhbmdlc2V0IGZlYXR1cmU6IGxpZmVjeWNsZVxuXHRcdC8vIGhvb2tzLCBsaXN0U2Vzc2lvbnMgb3ZlcmxheSwgc3Vic2NyaXB0aW9uIFVSSSByb3V0aW5nLCBhbmQgdGhlIGRlZmVycmVkLXJlZnJlc2ggc3RhdGUgbWFjaGluZS5cblx0XHR0aGlzLl9jaGFuZ2VzZXRDb29yZGluYXRvciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdENoYW5nZXNldENvb3JkaW5hdG9yKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc3RhdGVNYW5hZ2VyLm9uRGlkQ2hhbmdlU2Vzc2lvbkFjdGl2ZVR1cm4oZSA9PiB0aGlzLl9jaGFuZ2VzZXRDb29yZGluYXRvci5vblNlc3Npb25UdXJuQWN0aXZlQ2hhbmdlZChlLnNlc3Npb24sIGUuYWN0aXZlKSkpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgdGhlIGNoYW5nZXNldCBvcGVyYXRpb24gY29udHJpYnV0aW9ucy5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0aW9uKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdENvbW1pdE9wZXJhdGlvbkNvbnRyaWJ1dGlvbikpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyQ29udHJpYnV0aW9uKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uQ29udHJpYnV0aW9uKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYW5nZXNldE9wZXJhdGlvblNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRpb24oaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0TWVyZ2VPcGVyYXRpb25Db250cmlidXRpb24pKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY2hhbmdlc2V0T3BlcmF0aW9uU2VydmljZS5yZWdpc3RlckNvbnRyaWJ1dGlvbihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RTeW5jT3BlcmF0aW9uQ29udHJpYnV0aW9uKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYW5nZXNldE9wZXJhdGlvblNlcnZpY2UucmVnaXN0ZXJDb250cmlidXRpb24oaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0RGlzY2FyZENoYW5nZXNPcGVyYXRpb25Db250cmlidXRpb24pKSk7XG5cblx0XHR0aGlzLl9jb21wbGV0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdENvbXBsZXRpb25zKSk7XG5cdFx0Ly8gQnVpbHQtaW4gZ2VuZXJpYyBwcm92aWRlcjogY29tcGxldGVzIGZpbGVzIGluIHRoZSBzZXNzaW9uJ3Mgd29ya3NwYWNlIGZvbGRlci5cblx0XHRjb25zdCB3b3Jrc3BhY2VGaWxlcyA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50SG9zdFdvcmtzcGFjZUZpbGVzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29tcGxldGlvbnMucmVnaXN0ZXJQcm92aWRlcihcblx0XHRcdG5ldyBBZ2VudEhvc3RGaWxlQ29tcGxldGlvblByb3ZpZGVyKHRoaXMuX3N0YXRlTWFuYWdlciwgd29ya3NwYWNlRmlsZXMsIHRoaXMuX2xvZ1NlcnZpY2UpLFxuXHRcdCkpO1xuXHRcdC8vIEJ1aWx0LWluIGdlbmVyaWMgcHJvdmlkZXI6IGNvbXBsZXRlcyBgI2NoYXQ6PHRpdGxlPmAgcmVmZXJlbmNlcyB0byBvdGhlclxuXHRcdC8vIGNoYXRzIGluIHRoZSBzYW1lIHNlc3Npb24sIGF0dGFjaGluZyBhIGNoYXQgdHJhbnNjcmlwdCBhdHRhY2htZW50LlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbXBsZXRpb25zLnJlZ2lzdGVyUHJvdmlkZXIoXG5cdFx0XHRuZXcgQWdlbnRIb3N0Q2hhdENvbXBsZXRpb25Qcm92aWRlcih0aGlzLl9zdGF0ZU1hbmFnZXIpLFxuXHRcdCkpO1xuXHRcdC8vIEJ1aWx0LWluIGdlbmVyaWMgcHJvdmlkZXI6IG9mZmVycyB0aGUgYC9yZW5hbWVgIHNsYXNoIGNvbW1hbmQgZm9yIGFueVxuXHRcdC8vIHNlc3Npb24gdGhhdCBhbHJlYWR5IGhhcyBoaXN0b3J5LiBFeGVjdXRpb24gaXMgaGFuZGxlZCBzZXJ2ZXItc2lkZSBpblxuXHRcdC8vIEFnZW50U2lkZUVmZmVjdHMgKHJlZGlyZWN0ZWQgdG8gYSBTZXNzaW9uVGl0bGVDaGFuZ2VkIGFjdGlvbikuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29tcGxldGlvbnMucmVnaXN0ZXJQcm92aWRlcihcblx0XHRcdG5ldyBBZ2VudEhvc3RSZW5hbWVDb21wbGV0aW9uUHJvdmlkZXIoXG5cdFx0XHRcdHNlc3Npb24gPT4gKHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbik/LnR1cm5zLmxlbmd0aCA/PyAwKSA+IDAsXG5cdFx0XHQpLFxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbXBsZXRpb25zLnJlZ2lzdGVyUHJvdmlkZXIoXG5cdFx0XHRuZXcgQ29kZXhDb21wYWN0Q29tcGxldGlvblByb3ZpZGVyKFxuXHRcdFx0XHRzZXNzaW9uID0+ICh0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24pPy50dXJucy5sZW5ndGggPz8gMCkgPiAwLFxuXHRcdFx0KSxcblx0XHQpKTtcblxuXHRcdC8vIFRlcm1pbmFsIG1hbmFnZW1lbnQgXHUyMDE0IHRoZSB0ZXJtaW5hbCBtYW5hZ2VyIGxpc3RlbnMgdG8gdGhlIHN0YXRlXG5cdFx0Ly8gbWFuYWdlcidzIGFjdGlvbiBzdHJlYW0gYW5kIGRpc3BhdGNoZXMgUFRZIG91dHB1dCBiYWNrIHRocm91Z2ggaXQuXG5cdFx0Ly8gQ3JlYXRlZCBiZWZvcmUgQWdlbnRTaWRlRWZmZWN0cyBhbmQgcmVnaXN0ZXJlZCBpbiB0aGUgbG9jYWwgc2NvcGUgc29cblx0XHQvLyBBZ2VudFNpZGVFZmZlY3RzIGNhbiBjb25zdW1lIGl0IHZpYSBESSAoZm9yIGlubGluZSBgIWNvbW1hbmRgXG5cdFx0Ly8gZXhlY3V0aW9uKS5cblx0XHR0aGlzLl90ZXJtaW5hbE1hbmFnZXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RUZXJtaW5hbE1hbmFnZXIpKTtcblx0XHRzZXJ2aWNlcy5zZXQoSUFnZW50SG9zdFRlcm1pbmFsTWFuYWdlciwgdGhpcy5fdGVybWluYWxNYW5hZ2VyKTtcblxuXHRcdHRoaXMuX2xvY2FsVHVybnMgPSBuZXcgQWdlbnRIb3N0TG9jYWxUdXJucyh0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2UsIHRoaXMuX2xvZ1NlcnZpY2UpO1xuXG5cdFx0dGhpcy5fc2lkZUVmZmVjdHMgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudFNpZGVFZmZlY3RzLCB0aGlzLl9zdGF0ZU1hbmFnZXIsIHRoaXMuX2N1c3RvbWl6YXRpb25FbmFibGVtZW50U2VydmljZSwge1xuXHRcdFx0Z2V0QWdlbnQ6IHNlc3Npb24gPT4gdGhpcy5fZmluZFByb3ZpZGVyRm9yU2Vzc2lvbihzZXNzaW9uKSxcblx0XHRcdHNlc3Npb25EYXRhU2VydmljZTogdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLFxuXHRcdFx0bG9jYWxUdXJuczogdGhpcy5fbG9jYWxUdXJucyxcblx0XHRcdGRpYWdub3N0aWNzTG9nLFxuXHRcdFx0YWdlbnRzOiB0aGlzLl9hZ2VudHMsXG5cdFx0XHRob3N0TGF1bmNoS2luZDogdGhpcy5faG9zdExhdW5jaEtpbmQsXG5cdFx0XHRjb3BpbG90QXBpU2VydmljZTogZWZmZWN0aXZlQ29waWxvdEFwaVNlcnZpY2UsXG5cdFx0XHRnZXRHaXRIdWJDb3BpbG90VG9rZW46ICgpID0+IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0QXV0aFRva2VuKHtcblx0XHRcdFx0XHRyZXNvdXJjZTogdGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlLmdldENvcGlsb3RSZXNvdXJjZSgpLnJlc291cmNlLFxuXHRcdFx0XHRcdHNjb3BlczogdGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlLmdldENvcGlsb3RSZXNvdXJjZSgpLnNjb3Blc19zdXBwb3J0ZWQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHRcdGdldEdpdEh1YlRva2VuOiAoKSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmdldEF1dGhUb2tlbih7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IHRoaXMuX2dpdEh1YkVuZHBvaW50U2VydmljZS5nZXRSZXBvUmVzb3VyY2UoKS5yZXNvdXJjZSxcblx0XHRcdFx0XHRzY29wZXM6IHRoaXMuX2dpdEh1YkVuZHBvaW50U2VydmljZS5nZXRSZXBvUmVzb3VyY2UoKS5zY29wZXNfc3VwcG9ydGVkLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0XHRnZXRHaXRIdWJIb3N0OiAoKSA9PiB0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2UuZ2V0RW50ZXJwcmlzZUhvc3QoKSA/PyAnZ2l0aHViLmNvbScsXG5cdFx0XHRvY3RvS2l0U2VydmljZTogYWdlbnRIb3N0T2N0b0tpdFNlcnZpY2UsXG5cdFx0XHRyZXNvbHZlV29ya2luZ0RpcmVjdG9yeUJlZm9yZVNlbmQ6IHBhcmFtcyA9PiB0aGlzLl9yZXNvbHZlV29ya2luZ0RpcmVjdG9yeUJlZm9yZVNlbmQocGFyYW1zKSxcblx0XHRcdHJlc29sdmVDaGF0QXR0YWNobWVudFR1cm5zOiByZXNvdXJjZSA9PiB0aGlzLl9yZXNvbHZlQ2hhdEF0dGFjaG1lbnRUdXJucyhyZXNvdXJjZSksXG5cdFx0XHRvblR1cm5Db21wbGV0ZTogc2Vzc2lvbiA9PiB7XG5cdFx0XHRcdGNvbnN0IHdvcmtpbmdEaXJTdHIgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24pPy53b3JraW5nRGlyZWN0b3JpZXM/LlswXTtcblx0XHRcdFx0dm9pZCB0aGlzLl9naXRTdGF0ZVNlcnZpY2UuYXR0YWNoU2Vzc2lvbkdpdEh1YlB1bGxSZXF1ZXN0KHNlc3Npb24sIHdvcmtpbmdEaXJTdHIgPyBVUkkucGFyc2Uod29ya2luZ0RpclN0cikgOiB1bmRlZmluZWQpO1xuXHRcdFx0fSxcblx0XHRcdG9uVXNlck1lc3NhZ2U6IChzZXNzaW9uLCB0ZXh0KSA9PiB7XG5cdFx0XHRcdHZvaWQgdGhpcy5fZ2l0U3RhdGVTZXJ2aWNlLmF0dGFjaFNlc3Npb25HaXRIdWJSZWZlcmVuY2VzKHNlc3Npb24udG9TdHJpbmcoKSwgdGV4dCk7XG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdC8vIFNlcnZlci1zaWRlIHRvb2xzLCBleGVjdXRlZCBpbi1wcm9jZXNzIGFnYWluc3QgZWFjaCBzZXNzaW9uJ3Mgb3duXG5cdFx0Ly8gc3RhdGUuIFRoZSBzZXQgb2YgZ3JvdXBzIChhbmQgdGhlaXIgZGlzcGxheSkgaXMgdGhlIHNpbmdsZSBzb3VyY2Ugb2Zcblx0XHQvLyB0cnV0aCBpbiBgc2VydmVyVG9vbEdyb3Vwcy50c2A7IHRoZSBzZXNzaW9uLW1hbmFnZW1lbnQgZ3JvdXAncyBydW50aW1lXG5cdFx0Ly8gZGVwZW5kZW5jeSAodGhpcyBzZXJ2aWNlKSBpcyBpbmplY3RlZCB2aWEgdGhlIGFjY2Vzc29yLlxuXHRcdHRoaXMuX3NlcnZlclRvb2xIb3N0ID0gbmV3IEFnZW50U2VydmVyVG9vbEhvc3QodGhpcy5fc3RhdGVNYW5hZ2VyLCBidWlsZFNlcnZlclRvb2xHcm91cHModGhpcy5fY3JlYXRlU2Vzc2lvblNlcnZlclRvb2xBY2Nlc3NvcigpKSk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHJlZ2lzdGVyZWQgcHJvdmlkZXJzLiBFeHBvc2VkIHNvIHByb2Nlc3MtbGlmZXRpbWUgYmFja2dyb3VuZCBqb2JzXG5cdCAqIChub3RhYmx5IHtAbGluayBBZ2VudE1vZGVsUmVmcmVzaFNjaGVkdWxlcn0pIGNhbiBvYnNlcnZlIHJlZ2lzdHJhdGlvbnNcblx0ICogd2l0aG91dCB0aGlzIHNlcnZpY2Ugb3duaW5nIGFuIGFtYmllbnQgcmVjdXJyaW5nIHRpbWVyIG9mIGl0cyBvd24uXG5cdCAqL1xuXHRnZXQgYWdlbnRzKCk6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElBZ2VudFtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2FnZW50cztcblx0fVxuXG5cdC8qKlxuXHQgKiBGaXJlcyB3aXRoIHRoZSBwcm92aWRlciBpZCB3aGVuZXZlciBhIHR1cm4gc3RhcnRzLiBFeHBvc2VkIGFsb25nc2lkZVxuXHQgKiB7QGxpbmsgYWdlbnRzfSBzbyB7QGxpbmsgQWdlbnRNb2RlbFJlZnJlc2hTY2hlZHVsZXJ9IGNhbiBnYXRlIGl0cyBwZXJpb2RpY1xuXHQgKiByZWZyZXNoIG9uIHJlYWwgYWdlbnQgdXNhZ2UgcmF0aGVyIHRoYW4gcG9sbGluZyBhbiBpZGxlIGhvc3QuXG5cdCAqL1xuXHRnZXQgb25EaWRTdGFydFR1cm4oKTogRXZlbnQ8c3RyaW5nPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NpZGVFZmZlY3RzLm9uRGlkU3RhcnRUdXJuO1xuXHR9XG5cblx0Ly8gLS0tLSBwcm92aWRlciByZWdpc3RyYXRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBJbmplY3RzIHRoZSBob3N0LW93bmVkIHtAbGluayBXb3JrdHJlZUlzb2xhdGlvbn0gY29udHJvbGxlciBhbmQgZm9yd2FyZHMgaXRcblx0ICogdG8gdGhlIGNvbGxhYm9yYXRvcnMgdGhhdCBjb25zdWx0IGl0LiBDYWxsZWQgb25jZSBhdCBzdGFydHVwIChmcm9tXG5cdCAqIGFnZW50SG9zdE1haW4gLyBhZ2VudEhvc3RTZXJ2ZXJNYWluKSBhZnRlciB0aGUgQ29waWxvdCBBUEkgZGVwZW5kZW5jaWVzXG5cdCAqIGhhdmUgYmVlbiB3aXJlZC5cblx0ICovXG5cdHNldFdvcmt0cmVlSXNvbGF0aW9uKHdvcmt0cmVlOiBXb3JrdHJlZUlzb2xhdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuX3dvcmt0cmVlID0gd29ya3RyZWU7XG5cdFx0dGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0V29ya3RyZWVJc29sYXRpb24od29ya3RyZWUpO1xuXHRcdHRoaXMuX3NpZGVFZmZlY3RzLnNldFdvcmt0cmVlSXNvbGF0aW9uKHdvcmt0cmVlKTtcblx0XHR0aGlzLl9jdXN0b21pemF0aW9uRW5hYmxlbWVudFNlcnZpY2Uuc2V0V29ya3RyZWVJc29sYXRpb24od29ya3RyZWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9Qcm92aWRlckNvbmZpZzxUIGV4dGVuZHMgeyByZWFkb25seSBjb25maWc/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9PihyZXF1ZXN0OiBUKTogVCB7XG5cdFx0aWYgKCF0aGlzLl93b3JrdHJlZSB8fCAhcmVxdWVzdC5jb25maWcpIHtcblx0XHRcdHJldHVybiByZXF1ZXN0O1xuXHRcdH1cblx0XHRyZXR1cm4geyAuLi5yZXF1ZXN0LCBjb25maWc6IG9taXRIb3N0T3duZWRTZXNzaW9uQ29uZmlnKHJlcXVlc3QuY29uZmlnKSB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIEhvc3Qtb3duZWQgZmlyc3Qtc2VuZCBob29rIChpbnZva2VkIGJ5IHtAbGluayBBZ2VudFNpZGVFZmZlY3RzfSBiZWZvcmUgdGhlXG5cdCAqIGFnZW50IGxvY2tzIGl0cyBzdWJwcm9jZXNzIGN3ZCkuIFJlc29sdmVzIHRoZSB3b3JraW5nIGRpcmVjdG9yaWVzIHRoZSBzZXNzaW9uXG5cdCAqIHdpbGwgYWN0dWFsbHkgcnVuIGluIGFuZCBoYW5kcyB0aGVtIHRvIHRoZSBhZ2VudCBhdCBzZW5kIHRpbWU6XG5cdCAqICAtIGluZGV4IDAgaXMgdGhlIHByb2Nlc3Mgcm9vdDogZm9yIGB3b3JrdHJlZWAgaXNvbGF0aW9uIHRoZSBpc29sYXRlZFxuXHQgKiAgICB3b3JrdHJlZSAoY3JlYXRlZCBoZXJlIG9uIHRoZSBmaXJzdCBzZW5kLCBzZWVcblx0ICogICAge0BsaW5rIF9yZXNvbHZlV29ya3RyZWVCZWZvcmVTZW5kfSk7IGZvciBgZm9sZGVyYCBpc29sYXRpb24gdGhlIHBpY2tlZFxuXHQgKiAgICBmb2xkZXI7IGB1bmRlZmluZWRgICh3aG9sZSByZXN1bHQpIGZvciB3b3Jrc3BhY2UtbGVzcyBzZXNzaW9ucy5cblx0ICogIC0gdGhlIHRhaWwgY2FycmllcyBhbnkgYWRkaXRpb25hbCBzZXNzaW9uIHJvb3RzIGFzLWlzIChvbmx5IGluZGV4IDAgaXNcblx0ICogICAgd29ya3RyZWUtcmVtYXBwZWQ7IGFkZGl0aW9uYWwgcm9vdHMgYXJlIHBhc3NlZCB0aHJvdWdoIHVuY2hhbmdlZCkuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlV29ya2luZ0RpcmVjdG9yeUJlZm9yZVNlbmQocGFyYW1zOiB7IHNlc3Npb246IHN0cmluZzsgY2hhdDogc3RyaW5nOyB0dXJuSWQ6IHN0cmluZzsgcHJvbXB0OiBzdHJpbmcgfSk6IFByb21pc2U8cmVhZG9ubHkgVVJJW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQocGFyYW1zLnNlc3Npb24pO1xuXHRcdGNvbnN0IHBpY2tlZEZvbGRlcnMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRFZmZlY3RpdmVXb3JraW5nRGlyZWN0b3JpZXMocGFyYW1zLnNlc3Npb24pO1xuXHRcdGNvbnN0IHBpY2tlZEZvbGRlclVyaSA9IHBpY2tlZEZvbGRlcnM/LlswXSA/IFVSSS5wYXJzZShwaWNrZWRGb2xkZXJzWzBdKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCB0YWlsID0gKHBpY2tlZEZvbGRlcnMgPz8gW10pLnNsaWNlKDEpLm1hcChkID0+IFVSSS5wYXJzZShkKSk7XG5cblx0XHQvLyBPbmx5IHdvcmt0cmVlLWlzb2xhdGlvbiBzZXNzaW9ucyBkZWZlciBkaXJlY3RvcnkgcmVzb2x1dGlvbiB0byB0aGUgZmlyc3Rcblx0XHQvLyBzZW5kIChzbyB0aGUgcHJvbXB0IGNhbiBuYW1lIHRoZSBicmFuY2gpOyBmb2xkZXIgLyB3b3Jrc3BhY2UtbGVzc1xuXHRcdC8vIHNlc3Npb25zIHJ1biBkaXJlY3RseSBpbiB0aGUgcGlja2VkIGZvbGRlci5cblx0XHRpZiAoIXRoaXMuX3dvcmt0cmVlPy5pc1dvcmtpbmdEaXJlY3RvcnlQZW5kaW5nKHNlc3Npb25JZCkpIHtcblx0XHRcdGlmICghcGlja2VkRm9sZGVyVXJpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5Rm9yUmVzdW1lKHBhcmFtcy5zZXNzaW9uLCBwaWNrZWRGb2xkZXJVcmkpO1xuXHRcdFx0cmV0dXJuIFtyZXNvbHZlZCwgLi4udGFpbF07XG5cdFx0fVxuXG5cdFx0Ly8gRmFsbCBiYWNrIHRvIHRoZSBwaWNrZWQgZm9sZGVyIHdoZW4gd29ya3RyZWUgY3JlYXRpb24gZmFpbGVkIHNvIHRoZVxuXHRcdC8vIHNlc3Npb24gc3RpbGwgbWF0ZXJpYWxpemVzIGluIHRoZSB1c2VyJ3MgZm9sZGVyIHJhdGhlciB0aGFuIG5vd2hlcmUuXG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCB0aGlzLl9yZXNvbHZlV29ya3RyZWVCZWZvcmVTZW5kKHsgLi4ucGFyYW1zLCBzZXNzaW9uSWQsIHBpY2tlZEZvbGRlclVyaSB9KSA/PyBwaWNrZWRGb2xkZXJVcmk7XG5cdFx0cmV0dXJuIHJlc29sdmVkID8gW3Jlc29sdmVkLCAuLi50YWlsXSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVDaGF0QXR0YWNobWVudFR1cm5zKHJlc291cmNlOiBzdHJpbmcpOiBQcm9taXNlPHJlYWRvbmx5IFR1cm5bXT4ge1xuXHRcdGNvbnN0IHJlYWRUdXJucyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShyZXNvdXJjZSkgPz8gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldERlZmF1bHRDaGF0U3RhdGUocmVzb3VyY2UpO1xuXHRcdFx0cmV0dXJuIHN0YXRlPy50dXJucztcblx0XHR9O1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gcmVhZFR1cm5zKCk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5wYXJzZShpc0FocENoYXRDaGFubmVsKHJlc291cmNlKSA/IHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmkocmVzb3VyY2UpIDogcmVzb3VyY2UpO1xuXHRcdGlmICghdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnJlc3RvcmVTZXNzaW9uKHNlc3Npb25VcmkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2ZpbmRQcm92aWRlckZvclNlc3Npb24oc2Vzc2lvblVyaSk7XG5cdFx0XHRpZiAocHJvdmlkZXIpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fcmVzdG9yZVBlZXJDaGF0cyhwcm92aWRlciwgc2Vzc2lvblVyaSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChpc0FocENoYXRDaGFubmVsKHJlc291cmNlKSkge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCB0aGlzLl9zdGF0ZU1hbmFnZXIucmVzb2x2ZUNoYXRTdGF0ZShyZXNvdXJjZSk7XG5cdFx0XHRpZiAoc3RhdGUpIHtcblx0XHRcdFx0cmV0dXJuIHN0YXRlLnR1cm5zO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgcmVzb2x2ZSBwZWVyIGNoYXQgYXR0YWNobWVudDogJHtyZXNvdXJjZX1gKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSByZWFkVHVybnMoKTtcblx0XHRpZiAocmVzb2x2ZWQpIHtcblx0XHRcdHJldHVybiByZXNvbHZlZDtcblx0XHR9XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgdGhlIHNlc3Npb24ncyBpc29sYXRlZCB3b3JrdHJlZSBvbiB0aGUgZmlyc3Qgc2VuZCAoZGVmZXJyZWQgc28gdGhlXG5cdCAqIHVzZXIncyBwcm9tcHQgY2FuIG5hbWUgdGhlIGJyYW5jaCksIHJlcG9ydHMgY3JlYXRpb24gcHJvZ3Jlc3MgYXMgdGhlIGNoYXQnc1xuXHQgKiBhY3Rpdml0eSwgc3VyZmFjZXMgdGhlIFwiQ3JlYXRlZCBpc29sYXRlZCB3b3JrdHJlZVwiIGFubm91bmNlbWVudCBhcyB0aGUgZmlyc3Rcblx0ICogbWFya2Rvd24gcmVzcG9uc2UgcGFydCBvciBhIGR1cmFibGUgZmFsbGJhY2sgd2FybmluZywgYW5kIHJldHVybnMgdGhlIGNyZWF0ZWQgd29ya3RyZWUgVVJJLlxuXHQgKiBJZGVtcG90ZW50OyBzYWZlIHRvIGNhbGwgb25jZSB0aGUgd29ya3RyZWUgZXhpc3RzLiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW5cblx0ICogd29ya3RyZWUgY3JlYXRpb24gZmFpbGVkLiBPbmx5IGludm9rZWQgZm9yIHNlc3Npb25zIHdob3NlIHdvcmt0cmVlIGlzIHN0aWxsXG5cdCAqIHBlbmRpbmcgKHNlZSB7QGxpbmsgX3Jlc29sdmVXb3JraW5nRGlyZWN0b3J5QmVmb3JlU2VuZH0pLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVdvcmt0cmVlQmVmb3JlU2VuZChwYXJhbXM6IHsgc2Vzc2lvbjogc3RyaW5nOyBjaGF0OiBzdHJpbmc7IHR1cm5JZDogc3RyaW5nOyBwcm9tcHQ6IHN0cmluZzsgc2Vzc2lvbklkOiBzdHJpbmc7IHBpY2tlZEZvbGRlclVyaTogVVJJIHwgdW5kZWZpbmVkIH0pOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHsgc2Vzc2lvbklkLCBwaWNrZWRGb2xkZXJVcmkgfSA9IHBhcmFtcztcblx0XHRjb25zdCB3b3JrdHJlZSA9IHRoaXMuX3dvcmt0cmVlO1xuXHRcdGlmICghd29ya3RyZWUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCByZXBvcnRlZEFjdGl2aXR5ID0gZmFsc2U7XG5cdFx0bGV0IGZhaWx1cmVEaWFnbm9zdGljOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHdvcmt0cmVlLnJlc29sdmVPbkZpcnN0U2VuZCh7XG5cdFx0XHRcdHNlc3Npb25Vcmk6IFVSSS5wYXJzZShwYXJhbXMuc2Vzc2lvbiksXG5cdFx0XHRcdHNlc3Npb25JZCxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogcGlja2VkRm9sZGVyVXJpLFxuXHRcdFx0XHRjb25maWc6IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFNlc3Npb25Db25maWdWYWx1ZXMocGFyYW1zLnNlc3Npb24pLFxuXHRcdFx0XHRwcm9tcHQ6IHBhcmFtcy5wcm9tcHQsXG5cdFx0XHRcdGdpdGh1YlRva2VuOiB0aGlzLmdldEF1dGhUb2tlbih7XG5cdFx0XHRcdFx0cmVzb3VyY2U6IHRoaXMuX2dpdEh1YkVuZHBvaW50U2VydmljZS5nZXRDb3BpbG90UmVzb3VyY2UoKS5yZXNvdXJjZSxcblx0XHRcdFx0XHRzY29wZXM6IHRoaXMuX2dpdEh1YkVuZHBvaW50U2VydmljZS5nZXRDb3BpbG90UmVzb3VyY2UoKS5zY29wZXNfc3VwcG9ydGVkLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0b25Qcm9ncmVzczogYWN0aXZpdHkgPT4ge1xuXHRcdFx0XHRcdHJlcG9ydGVkQWN0aXZpdHkgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihwYXJhbXMuY2hhdCwgeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRBY3Rpdml0eUNoYW5nZWQsIGFjdGl2aXR5IH0pO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRmYWlsdXJlRGlhZ25vc3RpYyA9IHRvRXJyb3JNZXNzYWdlKGVycik7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIHdvcmt0cmVlIHJlc29sdXRpb24gZmFpbGVkIGZvciAke3BhcmFtcy5zZXNzaW9ufTogJHtmYWlsdXJlRGlhZ25vc3RpY31gKTtcblx0XHR9XG5cdFx0Ly8gQ2xlYXIgb24gZXZlcnkgZXhpdCBwYXRoIHNvIGEgZmFpbGVkIGNyZWF0aW9uIGNhbid0IHN0cmFuZCB0aGUgY2hhdFxuXHRcdC8vIG9uIGEgc3RhbGUgXCJDcmVhdGluZyBpc29sYXRlZCB3b3JrdHJlZVwiIGFjdGl2aXR5LlxuXHRcdGlmIChyZXBvcnRlZEFjdGl2aXR5KSB7XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24ocGFyYW1zLmNoYXQsIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0QWN0aXZpdHlDaGFuZ2VkLCBhY3Rpdml0eTogdW5kZWZpbmVkIH0pO1xuXHRcdH1cblx0XHRjb25zdCByZXNvbHZlZFdvcmt0cmVlID0gd29ya3RyZWUuZ2V0UmVzb2x2ZWRXb3JrdHJlZShzZXNzaW9uSWQpO1xuXHRcdGlmICghcmVzb2x2ZWRXb3JrdHJlZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgd29ya3RyZWUucGVyc2lzdENyZWF0aW9uRmFpbHVyZShVUkkucGFyc2UocGFyYW1zLnNlc3Npb24pLCBzZXNzaW9uSWQsIGZhaWx1cmVEaWFnbm9zdGljKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIGZhaWxlZCB0byBwZXJzaXN0IHdvcmt0cmVlIGNyZWF0aW9uIGZhaWx1cmUgZm9yICR7cGFyYW1zLnNlc3Npb259OiAke3RvRXJyb3JNZXNzYWdlKGVycil9YCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24ocGFyYW1zLmNoYXQsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0LFxuXHRcdFx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0XHRcdHBhcnQ6IGJ1aWxkV29ya3RyZWVGYWlsdXJlTm90aWZpY2F0aW9uKGZhaWx1cmVEaWFnbm9zdGljKSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgYW5ub3VuY2VtZW50ID0gd29ya3RyZWUudGFrZVBlbmRpbmdBbm5vdW5jZW1lbnQoc2Vzc2lvbklkKTtcblx0XHRpZiAoYW5ub3VuY2VtZW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihwYXJhbXMuY2hhdCwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQsXG5cdFx0XHRcdHR1cm5JZDogcGFyYW1zLnR1cm5JZCxcblx0XHRcdFx0cGFydDogeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogZ2VuZXJhdGVVdWlkKCksIGNvbnRlbnQ6IGFubm91bmNlbWVudCB9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXNvbHZlZFdvcmt0cmVlO1xuXHR9XG5cblx0cmVnaXN0ZXJQcm92aWRlcihwcm92aWRlcjogSUFnZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3Byb3ZpZGVycy5oYXMocHJvdmlkZXIuaWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEFnZW50IHByb3ZpZGVyIGFscmVhZHkgcmVnaXN0ZXJlZDogJHtwcm92aWRlci5pZH1gKTtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBSZWdpc3RlcmluZyBhZ2VudCBwcm92aWRlcjogJHtwcm92aWRlci5pZH1gKTtcblx0XHR0aGlzLl9wcm92aWRlcnMuc2V0KHByb3ZpZGVyLmlkLCBwcm92aWRlcik7XG5cdFx0cHJvdmlkZXIuc2V0U2VydmVyVG9vbEhvc3Q/Lih0aGlzLl9zZXJ2ZXJUb29sSG9zdCk7XG5cdFx0dm9pZCB0aGlzLl9hdXRoU2VydmljZS5yZXBsYXkocHJvdmlkZXIpO1xuXHRcdC8vIERldGVybWluaXN0aWMgc3ViYWdlbnQgbWVtYmVyc2hpcCBvcmRlcmluZzogYXBwbHkgYSBzcGF3bmVkIHN1YmFnZW50J3Ncblx0XHQvLyBjYXRhbG9nIG1lbWJlcnNoaXAgKHZpYSB0aGUgc3Bhd24tY2hhbm5lbCBoYW5kbGVycykgQkVGT1JFXG5cdFx0Ly8gQWdlbnRTaWRlRWZmZWN0cyBcdTIwMTQgcmVnaXN0ZXJlZCBuZXh0IFx1MjAxNCBoYW5kbGVzIHRoZSBzYW1lIHNpZ25hbCBhbmQgc3RhcnRzXG5cdFx0Ly8gYSB0dXJuIG9uIHRoZSBzdWJhZ2VudCBjaGF0LCB3aGljaCByZXF1aXJlcyB0aGF0IGNoYXQgdG8gYWxyZWFkeSBleGlzdC5cblx0XHQvLyBSZWdpc3RlcmluZyB0aGlzIGxpc3RlbmVyIGFoZWFkIG9mIHRoZSBzaWRlLWVmZmVjdHMgbGlzdGVuZXIgbWFrZXMgdGhlXG5cdFx0Ly8gb3JkZXJpbmcgaW5kZXBlbmRlbnQgb2Ygd2hlbiB0aGUgYWdlbnQgcmVnaXN0ZXJzIGl0cyBvd24gc3ViYWdlbnQtPnNwYXduXG5cdFx0Ly8gYnJpZGdlOyBhZGRDaGF0L3JlbW92ZUNoYXQgYXJlIGlkZW1wb3RlbnQsIHNvIHRoZSBvdmVybGFwIGlzIHNhZmUuXG5cdFx0dGhpcy5fcHJvdmlkZXJTdWJzY3JpcHRpb25zLmFkZChwcm92aWRlci5vbkRpZENoYXRQcm9ncmVzcyhzaWduYWwgPT4gdGhpcy5fc2VxdWVuY2VTcGF3bmVkQ2hhdChzaWduYWwpKSk7XG5cdFx0dGhpcy5fcHJvdmlkZXJTdWJzY3JpcHRpb25zLmFkZCh0aGlzLl9zaWRlRWZmZWN0cy5yZWdpc3RlclByb2dyZXNzTGlzdGVuZXIocHJvdmlkZXIpKTtcblx0XHR0aGlzLl9wcm92aWRlclN1YnNjcmlwdGlvbnMuYWRkKHByb3ZpZGVyLm9uRGlkTWF0ZXJpYWxpemVDaGF0KGUgPT4gdGhpcy5fb25EaWRNYXRlcmlhbGl6ZUNoYXQoZSkpKTtcblx0XHR0aGlzLl9wcm92aWRlclN1YnNjcmlwdGlvbnMuYWRkKHByb3ZpZGVyLm9uRGlkRGlzY292ZXJDaGF0cyhjaGF0cyA9PiB7XG5cdFx0XHR2b2lkIHRoaXMuX3JlZ2lzdGVyRGlzY292ZXJlZENoYXRzKHByb3ZpZGVyLCBjaGF0cykuY2F0Y2goZXJyID0+XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV0gcmVnaXN0ZXJpbmcgZGlzY292ZXJlZCBjaGF0cyBmb3IgcHJvdmlkZXIgJHtwcm92aWRlci5pZH0gZmFpbGVkYCwgZXJyKSk7XG5cdFx0fSkpO1xuXHRcdGlmIChwcm92aWRlci5vbk1jcE5vdGlmaWNhdGlvbikge1xuXHRcdFx0dGhpcy5fcHJvdmlkZXJTdWJzY3JpcHRpb25zLmFkZChwcm92aWRlci5vbk1jcE5vdGlmaWNhdGlvbihlID0+IHRoaXMuX29uTWNwTm90aWZpY2F0aW9uLmZpcmUoZSkpKTtcblx0XHR9XG5cdFx0dGhpcy5fcHJvdmlkZXJTdWJzY3JpcHRpb25zLmFkZChwcm92aWRlci5vbkRpZENoYW5nZUNoYXREYXRhKGUgPT4gdGhpcy5fb25DaGF0RGF0YUNoYW5nZWQoZSkpKTtcblx0XHR0aGlzLl9wcm92aWRlclN1YnNjcmlwdGlvbnMuYWRkKHByb3ZpZGVyLm9uRGlkU3Bhd25DaGF0KGUgPT4gdGhpcy5fb25DaGF0U3Bhd25lZChlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyU2tpbGxDb21wbGV0aW9uUHJvdmlkZXIoKTtcblx0XHRjb25zdCBpbml0aWFsTWlncmF0aW9uID0gdGhpcy5fZW5zdXJlTGVnYWN5Q2hhdHNNaWdyYXRlZChwcm92aWRlcik7XG5cdFx0dGhpcy5faW5pdGlhbFByb3ZpZGVyTWlncmF0aW9ucy5zZXQocHJvdmlkZXIuaWQsIGluaXRpYWxNaWdyYXRpb24pO1xuXHRcdHZvaWQgaW5pdGlhbE1pZ3JhdGlvbi5jYXRjaChlcnIgPT5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV0gcmVnaXN0cnkgbWlncmF0aW9uOiBmYWlsZWQgZm9yIGxhdGUtcmVnaXN0ZXJlZCBwcm92aWRlciAke3Byb3ZpZGVyLmlkfWAsIGVycikpO1xuXHRcdGlmICghdGhpcy5fZGVmYXVsdFByb3ZpZGVyKSB7XG5cdFx0XHR0aGlzLl9kZWZhdWx0UHJvdmlkZXIgPSBwcm92aWRlci5pZDtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgcm9vdCBzdGF0ZSB3aXRoIGN1cnJlbnQgYWdlbnRzIGxpc3Rcblx0XHR0aGlzLl91cGRhdGVBZ2VudHMoKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyU2tpbGxDb21wbGV0aW9uUHJvdmlkZXIoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3NraWxsQ29tcGxldGlvblByb3ZpZGVyUmVnaXN0ZXJlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9za2lsbENvbXBsZXRpb25Qcm92aWRlclJlZ2lzdGVyZWQgPSB0cnVlO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFnZW50SG9zdFNraWxsQ29tcGxldGlvblByb3ZpZGVyKFxuXHRcdFx0c2Vzc2lvbiA9PiB0aGlzLl9maW5kUHJvdmlkZXJGb3JTZXNzaW9uKHNlc3Npb24pLFxuXHRcdFx0c2Vzc2lvbiA9PiB0aGlzLl9ob3N0Q3VzdG9taXphdGlvbnMoVVJJLmlzVXJpKHNlc3Npb24pID8gc2Vzc2lvbiA6IFVSSS5wYXJzZShzZXNzaW9uKSksXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29tcGxldGlvbnMucmVnaXN0ZXJQcm92aWRlcihwcm92aWRlcikpO1xuXHR9XG5cblx0Ly8gLS0tLSBhdXRoIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGFzeW5jIGF1dGhlbnRpY2F0ZShwYXJhbXM6IEF1dGhlbnRpY2F0ZVBhcmFtcyk6IFByb21pc2U8QXV0aGVudGljYXRlUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2F1dGhTZXJ2aWNlLmF1dGhlbnRpY2F0ZShwYXJhbXMsIHRoaXMuX3Byb3ZpZGVycy52YWx1ZXMoKSk7XG5cdH1cblxuXHRnZXRBdXRoVG9rZW4ocmVxdWVzdDogSUFnZW50SG9zdEF1dGhUb2tlblJlcXVlc3QpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9hdXRoU2VydmljZS5nZXRBdXRoVG9rZW4ocmVxdWVzdCk7XG5cdH1cblxuXHQvLyAtLS0tIENoYW5nZXNldCBvcGVyYXRpb24gaGFuZGxlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRhc3luYyBpbnZva2VDaGFuZ2VzZXRPcGVyYXRpb24ocGFyYW1zOiBJbnZva2VDaGFuZ2VzZXRPcGVyYXRpb25QYXJhbXMpOiBQcm9taXNlPEludm9rZUNoYW5nZXNldE9wZXJhdGlvblJlc3VsdD4ge1xuXHRcdHJldHVybiB0aGlzLl9jaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlLmludm9rZUNoYW5nZXNldE9wZXJhdGlvbihwYXJhbXMpO1xuXHR9XG5cblx0Ly8gLS0tLSBNQ1AgYG1jcDovL2AgY2hhbm5lbCByb3V0aW5nIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0YXN5bmMgaGFuZGxlTWNwUmVxdWVzdChjaGFubmVsOiBzdHJpbmcsIG1ldGhvZDogc3RyaW5nLCBwYXJhbXM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkKTogUHJvbWlzZTx1bmtub3duPiB7XG5cdFx0Y29uc3Qgcm91dGUgPSBwYXJzZU1jcENoYW5uZWxVcmkoY2hhbm5lbCk7XG5cdFx0aWYgKCFyb3V0ZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBNZXRob2Qgbm90IGZvdW5kOiBpbnZhbGlkIG1jcDovLyBjaGFubmVsICR7Y2hhbm5lbH1gKTtcblx0XHR9XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9wcm92aWRlcnMuZ2V0KHJvdXRlLnByb3ZpZGVySWQpO1xuXHRcdGlmICghcHJvdmlkZXIgfHwgIXByb3ZpZGVyLmhhbmRsZU1jcFJlcXVlc3QpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTWV0aG9kIG5vdCBmb3VuZDogbm8gcHJvdmlkZXIgZm9yIG1jcDovLyBjaGFubmVsICR7Y2hhbm5lbH1gKTtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkocm91dGUucHJvdmlkZXJJZCwgcm91dGUuc2Vzc2lvbklkKTtcblx0XHRyZXR1cm4gcHJvdmlkZXIuaGFuZGxlTWNwUmVxdWVzdChzZXNzaW9uVXJpLCByb3V0ZS5zZXJ2ZXJOYW1lLCBtZXRob2QsIHBhcmFtcyk7XG5cdH1cblxuXHQvLyAtLS0tIHNlc3Npb24gbWFuYWdlbWVudCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIEJ1aWxkcyB0aGUgZGVwZW5kZW5jeSBzdXJmYWNlIHRoZSBzZXNzaW9uIHNlcnZlci10b29sIGdyb3VwIG5lZWRzLCBib3VuZFxuXHQgKiB0byB0aGlzIHNlcnZpY2Ugc28gdGhlIGdyb3VwIHN0YXlzIGRlY291cGxlZCBmcm9tIHRoZSBjb25jcmV0ZSBob3N0LlxuXHQgKi9cblx0cHJpdmF0ZSBfY3JlYXRlU2Vzc2lvblNlcnZlclRvb2xBY2Nlc3NvcigpOiBJU2Vzc2lvblNlcnZlclRvb2xBY2Nlc3NvciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGlzQWN0aXZlQWdlbnRUaXRsZUdlbmVyYXRpb25FbmFibGVkOiAoKSA9PiB0aGlzLl9pc0FjdGl2ZUFnZW50VGl0bGVHZW5lcmF0aW9uRW5hYmxlZCgpLFxuXHRcdFx0bGlzdFNlc3Npb25zOiAoKSA9PiB0aGlzLmxpc3RTZXNzaW9ucygpLFxuXHRcdFx0Y3JlYXRlU2Vzc2lvbjogY29uZmlnID0+IHRoaXMuY3JlYXRlU2Vzc2lvbihjb25maWcpLFxuXHRcdFx0Z2V0TW9kZWxzOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsczogSUFnZW50TW9kZWxJbmZvW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLl9wcm92aWRlcnMudmFsdWVzKCkpIHtcblx0XHRcdFx0XHRtb2RlbHMucHVzaCguLi5wcm92aWRlci5tb2RlbHMuZ2V0KCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBtb2RlbHM7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0Q3JlYXRpb25EZWZhdWx0czogc291cmNlID0+IHRoaXMuX2dldFNlcnZlclRvb2xDcmVhdGlvbkRlZmF1bHRzKHNvdXJjZSksXG5cdFx0XHRzdGFydFByb21wdDogKHNlc3Npb24sIGNoYXQsIHByb21wdCkgPT4gdGhpcy5fc3RhcnRTZXNzaW9uUHJvbXB0KHNlc3Npb24sIGNoYXQsIHByb21wdCksXG5cdFx0XHRjcmVhdGVDaGF0OiAoc2Vzc2lvbiwgY2hhdCwgb3B0aW9ucykgPT4gdGhpcy5jcmVhdGVDaGF0KHNlc3Npb24sIGNoYXQsIChvcHRpb25zPy50aXRsZSAhPT0gdW5kZWZpbmVkIHx8IG9wdGlvbnM/Lm1vZGVsICE9PSB1bmRlZmluZWQpXG5cdFx0XHRcdD8geyAuLi4ob3B0aW9ucy50aXRsZSAhPT0gdW5kZWZpbmVkID8geyB0aXRsZTogb3B0aW9ucy50aXRsZSB9IDoge30pLCAuLi4ob3B0aW9ucy5tb2RlbCAhPT0gdW5kZWZpbmVkID8geyBtb2RlbDogb3B0aW9ucy5tb2RlbCB9IDoge30pIH1cblx0XHRcdFx0OiB1bmRlZmluZWQpLFxuXHRcdFx0cmVuYW1lQ2hhdDogKHNlc3Npb24sIGNoYXQsIHRpdGxlKSA9PiB0aGlzLl9yZW5hbWVDaGF0RnJvbVRvb2woc2Vzc2lvbiwgY2hhdCwgdGl0bGUpLFxuXHRcdFx0ZGVsZXRlU2Vzc2lvbjogc2Vzc2lvbiA9PiB0aGlzLmRpc3Bvc2VTZXNzaW9uKHNlc3Npb24pLFxuXHRcdFx0Z2V0Q2hhdENvbnRleHQ6IChzZXNzaW9uLCBjaGF0SWQpID0+IHRoaXMuX2dldENoYXRDb250ZXh0KHNlc3Npb24sIGNoYXRJZCksXG5cdFx0XHQvLyBSZWFkcyB0aGUgYGNyZWF0ZV9zZXNzaW9uYCBzcGF3biBkZXB0aCBmcm9tIGEgc2Vzc2lvbidzIGBfbWV0YWAgKDAgd2hlbiBhYnNlbnQpLlxuXHRcdFx0Z2V0U2Vzc2lvblNwYXduRGVwdGg6IHNlc3Npb24gPT4gcmVhZFNlc3Npb25TcGF3bkRlcHRoKHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3VtbWFyeShzZXNzaW9uLnRvU3RyaW5nKCkpPy5fbWV0YSksXG5cdFx0XHQvLyBTdGFtcHMgYSBzZXNzaW9uJ3MgYGNyZWF0ZV9zZXNzaW9uYCBzcGF3biBkZXB0aCBpbnRvIGl0cyBgX21ldGFgIChtZXJnaW5nIGV4aXN0aW5nIGtleXMpLlxuXHRcdFx0c2V0U2Vzc2lvblNwYXduRGVwdGg6IChzZXNzaW9uLCBkZXB0aCkgPT4gdGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb24udG9TdHJpbmcoKSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25NZXRhQ2hhbmdlZCxcblx0XHRcdFx0X21ldGE6IHdpdGhTZXNzaW9uU3Bhd25EZXB0aCh0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN1bW1hcnkoc2Vzc2lvbi50b1N0cmluZygpKT8uX21ldGEsIGRlcHRoKSxcblx0XHRcdH0pLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9pc0FjdGl2ZUFnZW50VGl0bGVHZW5lcmF0aW9uRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKHBsYXRmb3JtUm9vdFNjaGVtYSwgQWdlbnRIb3N0QWN0aXZlQWdlbnRUaXRsZUdlbmVyYXRpb25Db25maWdLZXkpID09PSB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U2VydmVyVG9vbENyZWF0aW9uRGVmYXVsdHMoc291cmNlOiBVUkkpOiBJU2Vzc2lvbkNyZWF0aW9uRGVmYXVsdHMgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNvdXJjZS50b1N0cmluZygpKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSBzZXNzaW9uLmFjdGl2ZVR1cm5cblx0XHRcdD8gc2Vzc2lvbi5hY3RpdmVUdXJuLm1lc3NhZ2UubW9kZWxcblx0XHRcdDogc2Vzc2lvbi5kcmFmdFxuXHRcdFx0XHQ/IHNlc3Npb24uZHJhZnQubW9kZWxcblx0XHRcdFx0OiBzZXNzaW9uLnR1cm5zLmF0KC0xKT8ubWVzc2FnZS5tb2RlbDtcblx0XHRjb25zdCBjb25maWcgPSB0aGlzLl9wcm92aWRlcnMuZ2V0KHNlc3Npb24ucHJvdmlkZXIpPy5nZXRJbmhlcml0ZWRDaGF0Q29uZmlnKHNlc3Npb24uY29uZmlnPy52YWx1ZXMgPz8ge30pO1xuXHRcdHJldHVybiB7XG5cdFx0XHRwcm92aWRlcjogc2Vzc2lvbi5wcm92aWRlcixcblx0XHRcdC4uLihtb2RlbCAhPT0gdW5kZWZpbmVkID8geyBtb2RlbCB9IDoge30pLFxuXHRcdFx0Li4uKGNvbmZpZyAhPT0gdW5kZWZpbmVkID8geyBjb25maWcgfSA6IHt9KSxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0YXJ0cyB0aGUgZmlyc3QgdHVybiBvbiBhIGZyZXNobHktY3JlYXRlZCBzZXNzaW9uIGJ5IGRpc3BhdGNoaW5nIGFcblx0ICogYENoYXRUdXJuU3RhcnRlZGAgYW5kIHJvdXRpbmcgaXQgdGhyb3VnaCB0aGUgc2FtZSBzaWRlLWVmZmVjdHMgcGF0aCBhXG5cdCAqIGNsaWVudC1pbml0aWF0ZWQgdHVybiB0YWtlcyAod2hpY2ggc2VuZHMgdGhlIG1lc3NhZ2UgdG8gdGhlIHByb3ZpZGVyKS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3N0YXJ0U2Vzc2lvblByb21wdChzZXNzaW9uOiBVUkksIGNoYXQ6IFVSSSwgcHJvbXB0OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBtZXNzYWdlOiBNZXNzYWdlID0geyB0ZXh0OiBwcm9tcHQsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfTtcblx0XHRjb25zdCBhY3Rpb24gPSB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLCB0dXJuSWQ6IGdlbmVyYXRlVXVpZCgpLCBzdGFydGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSwgbWVzc2FnZSB9IGFzIGNvbnN0O1xuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihjaGF0LnRvU3RyaW5nKCksIGFjdGlvbik7XG5cdFx0dGhpcy5fc2lkZUVmZmVjdHMuaGFuZGxlQWN0aW9uKGNoYXQudG9TdHJpbmcoKSwgYWN0aW9uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkcyBhIHBvaW50LWluLXRpbWUgc25hcHNob3Qgb2YgYSBzZXNzaW9uJ3MgY2hhdCBjb252ZXJzYXRpb24gZm9yIHRoZVxuXHQgKiBgZ2V0X3Nlc3Npb25fY29udGV4dGAgc2VydmVyIHRvb2wuIFRhcmdldHMgdGhlIHNlc3Npb24ncyBkZWZhdWx0IGNoYXQsIG9yIGFcblx0ICogc3BlY2lmaWMgcGVlciBjaGF0IHdoZW4gYGNoYXRJZGAgaXMgcHJvdmlkZWQuIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiBub1xuXHQgKiBsaXZlIGNvbnZlcnNhdGlvbiBzdGF0ZSBleGlzdHMgKGUuZy4gYSBjb2xkL3Vuc3Vic2NyaWJlZCBzZXNzaW9uKS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2dldENoYXRDb250ZXh0KHNlc3Npb246IFVSSSwgY2hhdElkPzogc3RyaW5nKTogUHJvbWlzZTxJQ2hhdENvbnRleHRTbmFwc2hvdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGNoYXRTdGF0ZSA9IGNoYXRJZFxuXHRcdFx0PyBhd2FpdCB0aGlzLl9zdGF0ZU1hbmFnZXIucmVzb2x2ZUNoYXRTdGF0ZShidWlsZENoYXRVcmkoc2Vzc2lvbi50b1N0cmluZygpLCBjaGF0SWQpKVxuXHRcdFx0OiB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0RGVmYXVsdENoYXRTdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdGlmICghY2hhdFN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0dHVybnM6IGNoYXRTdGF0ZS50dXJucyxcblx0XHRcdC4uLihjaGF0U3RhdGUuYWN0aXZlVHVybiA/IHsgYWN0aXZlVHVybjogeyBtZXNzYWdlOiBjaGF0U3RhdGUuYWN0aXZlVHVybi5tZXNzYWdlLCByZXNwb25zZVBhcnRzOiBjaGF0U3RhdGUuYWN0aXZlVHVybi5yZXNwb25zZVBhcnRzIH0gfSA6IHt9KSxcblx0XHRcdGhhc01vcmVIaXN0b3J5OiAhIWNoYXRTdGF0ZS50dXJuc05leHRDdXJzb3IsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlbmFtZUNoYXRGcm9tVG9vbChzZXNzaW9uOiBVUkksIGNoYXQ6IFVSSSwgdGl0bGU6IHN0cmluZyk6IFByb21pc2U8SVJlbmFtZVRpdGxlUmVzdWx0PiB7XG5cdFx0dmFsaWRhdGVSZW5hbWVUaXRsZSh0aXRsZSwgU2Vzc2lvblNlcnZlclRvb2xOYW1lLlJlbmFtZUNoYXQpO1xuXHRcdGNvbnN0IGlzRGVmYXVsdENoYXQgPSBpc0RlZmF1bHRDaGF0VXJpKGNoYXQudG9TdHJpbmcoKSk7XG5cdFx0aWYgKGlzRGVmYXVsdENoYXQgJiYgYXdhaXQgdGhpcy5faXNPbmx5U2Vzc2lvbkNoYXQoc2Vzc2lvbikpIHtcblx0XHRcdGF3YWl0IHBlcnNpc3RTZXNzaW9uTWV0YWRhdGFWYWx1ZXModGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLCBzZXNzaW9uLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0W1NFU1NJT05fQ1VTVE9NX1RJVExFX0tFWV06IHRpdGxlLFxuXHRcdFx0XHRbU0VTU0lPTl9DVVNUT01fVElUTEVfU09VUkNFX0tFWV06IEFHRU5UX0hPU1RfVElUTEVfU09VUkNFX0FHRU5ULFxuXHRcdFx0fSk7XG5cdFx0XHRpZiAodGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpPy50aXRsZSAhPT0gdGl0bGUpIHtcblx0XHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb24udG9TdHJpbmcoKSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlIH0pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc2lkZUVmZmVjdHMubWFya1RpdGxlUmVuYW1lZChzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0cmV0dXJuIHsgdGl0bGUgfTtcblx0XHR9XG5cdFx0aWYgKCFpc0RlZmF1bHRDaGF0ICYmICFhd2FpdCB0aGlzLl9wZWVyQ2hhdEV4aXN0cyhzZXNzaW9uLCBjaGF0KSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkICR7U2Vzc2lvblNlcnZlclRvb2xOYW1lLlJlbmFtZUNoYXR9IGlucHV0OiBjaGF0IG11c3QgbWF0Y2ggYSBrbm93biBub24tZGVmYXVsdCBjaGF0LmApO1xuXHRcdH1cblxuXHRcdGF3YWl0IHBlcnNpc3RTZXNzaW9uTWV0YWRhdGFWYWx1ZXModGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLCBzZXNzaW9uLnRvU3RyaW5nKCksIHtcblx0XHRcdFtjdXN0b21DaGF0VGl0bGVNZXRhZGF0YUtleShjaGF0LnRvU3RyaW5nKCkpXTogdGl0bGUsXG5cdFx0XHRbY3VzdG9tQ2hhdFRpdGxlU291cmNlTWV0YWRhdGFLZXkoY2hhdC50b1N0cmluZygpKV06IEFHRU5UX0hPU1RfVElUTEVfU09VUkNFX0FHRU5ULFxuXHRcdH0pO1xuXHRcdGlmICh0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSkpIHtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci51cGRhdGVDaGF0VGl0bGUoc2Vzc2lvbi50b1N0cmluZygpLCBjaGF0LnRvU3RyaW5nKCksIHRpdGxlKTtcblx0XHR9XG5cdFx0dGhpcy5fc2lkZUVmZmVjdHMubWFya1RpdGxlUmVuYW1lZChzZXNzaW9uLnRvU3RyaW5nKCksIGNoYXQudG9TdHJpbmcoKSk7XG5cdFx0cmV0dXJuIHsgdGl0bGUgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2lzT25seVNlc3Npb25DaGF0KHNlc3Npb246IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdGlmIChzdGF0ZSkge1xuXHRcdFx0cmV0dXJuIHN0YXRlLmNoYXRzLmxlbmd0aCA9PT0gMTtcblx0XHR9XG5cdFx0Y29uc3QgcGVyc2lzdGVkID0gYXdhaXQgdGhpcy5fcmVhZFBlcnNpc3RlZFBlZXJDaGF0Q2F0YWxvZyhzZXNzaW9uKTtcblx0XHRyZXR1cm4gcGVyc2lzdGVkPy5sZW5ndGggPT09IDA7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9wZWVyQ2hhdEV4aXN0cyhzZXNzaW9uOiBVUkksIGNoYXQ6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk/LmNoYXRzLnNvbWUoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5yZXNvdXJjZSA9PT0gY2hhdC50b1N0cmluZygpKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IHBlcnNpc3RlZCA9IGF3YWl0IHRoaXMuX3JlYWRQZXJzaXN0ZWRQZWVyQ2hhdENhdGFsb2coc2Vzc2lvbik7XG5cdFx0cmV0dXJuIHBlcnNpc3RlZD8uc29tZShjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLnVyaSA9PT0gY2hhdC50b1N0cmluZygpKSA9PT0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX3RvU2Vzc2lvbk1ldGFkYXRhKG1ldGFkYXRhOiBJQWdlbnRDaGF0TWV0YWRhdGEpOiBJQWdlbnRTZXNzaW9uTWV0YWRhdGEge1xuXHRcdGNvbnN0IHsgY2hhdCwgLi4ucmVzdCB9ID0gbWV0YWRhdGE7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLnJlc3QsXG5cdFx0XHRzZXNzaW9uOiBVUkkucGFyc2UocGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShjaGF0KSksXG5cdFx0fTtcblx0fVxuXG5cdC8qKiBgdW5kZWZpbmVkYCBtZWFucyB0aGUgcHJvdmlkZXIgY2Fubm90IGVudW1lcmF0ZSBpdHMgbmF0aXZlIGNoYXRzIHlldC4gKi9cblx0cHJpdmF0ZSBhc3luYyBfZW51bWVyYXRlTGVnYWN5UHJvdmlkZXJTZXNzaW9ucyhwcm92aWRlcjogSUFnZW50KTogUHJvbWlzZTxyZWFkb25seSBJQWdlbnRTZXNzaW9uTWV0YWRhdGFbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGNoYXRzID0gYXdhaXQgcHJvdmlkZXIubGlzdENoYXRzVG9NaWdyYXRlKCk7XG5cdFx0cmV0dXJuIGNoYXRzPy5tYXAobWV0YWRhdGEgPT4gdGhpcy5fdG9TZXNzaW9uTWV0YWRhdGEobWV0YWRhdGEpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWdpc3RyeSBtZXRhZGF0YSBmb3Igb25lIHNlc3Npb24uIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgYWdlbnRcblx0ICogY2Fubm90IGRlc2NyaWJlIHRoZSBzZXNzaW9uIHlldDsge0BsaW5rIGxpc3RTZXNzaW9uc30gc3RpbGwgb3ZlcmxheXNcblx0ICogYWN0aXZlIHByb3Zpc2lvbmFsIHNlc3Npb25zIGZyb20gc3RhdGUtbWFuYWdlciBkYXRhLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVnaXN0ZXJlZFNlc3Npb25NZXRhZGF0YShhZ2VudDogSUFnZW50LCBzZXNzaW9uOiBVUkksIGV4dGVybmFsOiBib29sZWFuKTogUHJvbWlzZTxJQWdlbnRTZXNzaW9uTWV0YWRhdGEgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjaGF0ID0gVVJJLnBhcnNlKGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbikpO1xuXHRcdGNvbnN0IG1ldGFkYXRhID0gYXdhaXQgYWdlbnQuZ2V0Q2hhdE1ldGFkYXRhKGNoYXQsIHRoaXMuX2NoYXRDb250ZXh0KHNlc3Npb24sIGNoYXQpLCBhd2FpdCB0aGlzLl9yZWFkRGVmYXVsdENoYXRQcm92aWRlckRhdGEoc2Vzc2lvbikpO1xuXHRcdGlmICghbWV0YWRhdGEpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25NZXRhZGF0YSA9IHRoaXMuX3RvU2Vzc2lvbk1ldGFkYXRhKG1ldGFkYXRhKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uc2Vzc2lvbk1ldGFkYXRhLFxuXHRcdFx0X21ldGE6IHdpdGhTZXNzaW9uRXh0ZXJuYWwoc2Vzc2lvbk1ldGFkYXRhLl9tZXRhLCBleHRlcm5hbCksXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBd2FpdHMgbGVnYWN5IG1pZ3JhdGlvbiBzdGFydGVkIGF0IHByb3ZpZGVyIHJlZ2lzdHJhdGlvbi4gUHJvdmlkZXItb3duZWRcblx0ICogZGlzY292ZXJ5IGlzIGluZGVwZW5kZW50IGFuZCBzdXJmYWNlcyB1bmtub3duIGNoYXRzIGFkZGl0aXZlbHkuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9hd2FpdEluaXRpYWxQcm92aWRlck1pZ3JhdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm92aWRlcnMgPSBbLi4udGhpcy5fcHJvdmlkZXJzLnZhbHVlcygpXTtcblx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKHByb3ZpZGVycy5tYXAocHJvdmlkZXIgPT4gdGhpcy5faW5pdGlhbFByb3ZpZGVyTWlncmF0aW9ucy5nZXQocHJvdmlkZXIuaWQpID8/IFByb21pc2UucmVzb2x2ZSgpKSk7XG5cdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IHJlc3VsdHMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSByZXN1bHRzW2luZGV4XTtcblx0XHRcdGlmIChyZXN1bHQuc3RhdHVzID09PSAncmVqZWN0ZWQnKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV0gaW5pdGlhbCBwcm92aWRlciBjYXRhbG9nczogcHJvdmlkZXIgJHtwcm92aWRlcnNbaW5kZXhdLmlkfSBmYWlsZWQgYW5kIHdpbGwgYmUgcmV0cmllZCBvbiB0aGUgbmV4dCBzaWduYWxgLCByZXN1bHQucmVhc29uKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUnVucyBvbmUgcHJvdmlkZXIgZGlzY292ZXJ5IGF0IG1vc3Qgb25jZSBjb25jdXJyZW50bHksIHNoYXJpbmcgdGhlXG5cdCAqIGluLWZsaWdodCBhdHRlbXB0IGFjcm9zcyBjYWxsZXJzIGFuZCBjbGVhcmluZyBpdCBvbiBzZXR0bGUgc28gZmFpbHVyZXNcblx0ICogcmV0cnkgb24gdGhlIG5leHQgdHJpZ2dlci4gYGZvcmNlYCByZXF1ZXN0cyBhIGZyZXNoIHBhc3MgYWZ0ZXIgYW5cblx0ICogcHJvdmlkZXIgY2F0YWxvZyB0cmlnZ2VyLlxuXHQgKlxuXHQgKiBBIGBmb3JjZWAgcmVxdWVzdCB0aGF0IGFycml2ZXMgd2hpbGUgYSBzd2VlcCBcdTIwMTQgZm9yY2VkIG9yIG5vdCwgZnJlc2hseVxuXHQgKiBzdGFydGVkIG9yIGFscmVhZHkgY2hhaW5lZCBcdTIwMTQgaXMgYWxyZWFkeSBpbi1mbGlnaHQgaXMgbmV2ZXIgZHJvcHBlZDogaXRcblx0ICogaXMgY2hhaW5lZCB0byBydW4gYWdhaW4gaW1tZWRpYXRlbHkgYWZ0ZXIgdGhlIGluLWZsaWdodCBhdHRlbXB0IHNldHRsZXNcblx0ICogKHJlZ2FyZGxlc3Mgb2Ygd2hldGhlciB0aGF0IGF0dGVtcHQgc3VjY2VlZGVkIG9yIGZhaWxlZCksIHNvIHRoZVxuXHQgKiBwcm92aWRlcidzIG9uLWRpc2sgc2V0IGlzIHJlLXJlYWQgZnJlc2ggaW5zdGVhZCBvZiBzaWxlbnRseSByZXVzaW5nIGFcblx0ICogc3dlZXAgdGhhdCBtYXkgcHJlZGF0ZSB0aGUgY2hhbmdlIHRoZSBgZm9yY2VgIGNhbGxlciBpcyByZWFjdGluZyB0by5cblx0ICogYGZvcmNlUXVldWVkYCB0cmFja3Mgb25seSB3aGV0aGVyIGEgZm9sbG93LXVwIGlzIGN1cnJlbnRseSBxdWV1ZWQgb24gdGhlXG5cdCAqIGVudHJ5IFx1MjAxNCBuZXZlciB3aGV0aGVyIHRoZSBlbnRyeSdzIG93biBpbi1mbGlnaHQgYXR0ZW1wdCBoYXBwZW5lZCB0byBiZVxuXHQgKiBpbnZva2VkIHdpdGggYGZvcmNlYCBcdTIwMTQgc28gYSBmcmVzaGx5LWNyZWF0ZWQgZW50cnkgYWx3YXlzIHN0YXJ0cyB3aXRoXG5cdCAqIGBmb3JjZVF1ZXVlZDogZmFsc2VgIGV2ZW4gd2hlbiBpdHMgb3duIGZpcnN0IGF0dGVtcHQgaXMgaXRzZWxmIGZvcmNlZC5cblx0ICogYGZvcmNlUXVldWVkYCBpcyByZXNldCB0aGUgbW9tZW50IGEgY2hhaW5lZCBhdHRlbXB0IGFjdHVhbGx5ICpzdGFydHMqXG5cdCAqIHJ1bm5pbmcgKG5vdCBtZXJlbHkgb25jZSBpdCBpcyBzY2hlZHVsZWQpLCBzbyBhIHNlY29uZCBgZm9yY2VgIHRoYXRcblx0ICogYXJyaXZlcyB3aGlsZSBhIGNoYWluZWQgKG9yIGZyZXNobHktZm9yY2VkKSBhdHRlbXB0IGlzIHN0aWxsIGluIGZsaWdodFxuXHQgKiBpcyBsaWtld2lzZSBjaGFpbmVkIG9udG8gYSBmdXJ0aGVyIGZvbGxvdy11cCByYXRoZXIgdGhhbiBiZWluZ1xuXHQgKiBjb2FsZXNjZWQgYXdheSBhcyBhIHN1cHBvc2VkIGR1cGxpY2F0ZS5cblx0ICovXG5cdHByaXZhdGUgX2Vuc3VyZUxlZ2FjeUNoYXRzTWlncmF0ZWQocHJvdmlkZXI6IElBZ2VudCwgZm9yY2UgPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9lbnN1cmVQcm92aWRlckNhdGFsb2cocHJvdmlkZXIsIHRoaXMuX3Byb3ZpZGVyTWlncmF0aW9ucywgZm9yY2UsIHJ1bkZvcmNlID0+IHRoaXMuX21pZ3JhdGVMZWdhY3lQcm92aWRlckNoYXRzKHByb3ZpZGVyLCBydW5Gb3JjZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlUHJvdmlkZXJDYXRhbG9nKFxuXHRcdHByb3ZpZGVyOiBJQWdlbnQsXG5cdFx0c3RhdGVzOiBNYXA8QWdlbnRQcm92aWRlciwgSVByb3ZpZGVyRGlzY292ZXJ5U3RhdGU+LFxuXHRcdGZvcmNlOiBib29sZWFuLFxuXHRcdHJ1bjogKGZvcmNlOiBib29sZWFuKSA9PiBQcm9taXNlPHZvaWQ+LFxuXHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHN0YXRlcy5nZXQocHJvdmlkZXIuaWQpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0aWYgKGZvcmNlICYmICFleGlzdGluZy5mb3JjZVF1ZXVlZCkge1xuXHRcdFx0XHRleGlzdGluZy5mb3JjZVF1ZXVlZCA9IHRydWU7XG5cdFx0XHRcdGNvbnN0IGNoYWluZWQgPSBleGlzdGluZy5wcm9taXNlXG5cdFx0XHRcdFx0LmNhdGNoKCgpID0+IHsgLyogdGhlIHF1ZXVlZCBmb3JjZWQgcmUtcnVuIG11c3Qgc3RpbGwgaGFwcGVuIGV2ZW4gaWYgdGhlIGluLWZsaWdodCBhdHRlbXB0IGZhaWxlZCAqLyB9KVxuXHRcdFx0XHRcdC50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRcdGV4aXN0aW5nLmZvcmNlUXVldWVkID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcnVuKHRydWUpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRleGlzdGluZy5wcm9taXNlID0gY2hhaW5lZDtcblx0XHRcdFx0dGhpcy5fYXJtUHJvdmlkZXJDYXRhbG9nQ2xlYW51cChwcm92aWRlciwgc3RhdGVzLCBleGlzdGluZywgY2hhaW5lZCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZXhpc3RpbmcucHJvbWlzZTtcblx0XHR9XG5cdFx0Ly8gYGZvcmNlUXVldWVkYCB0cmFja3Mgd2hldGhlciBhICpmb2xsb3ctdXAqIGF0dGVtcHQgaGFzIGJlZW4gcXVldWVkXG5cdFx0Ly8gb250byB0aGlzIGVudHJ5LCBub3Qgd2hldGhlciB0aGUgYXR0ZW1wdCBjdXJyZW50bHkgcnVubmluZyB3YXNcblx0XHQvLyBpdHNlbGYgaW52b2tlZCB3aXRoIGBmb3JjZWAuIFNlZWRpbmcgaXQgZnJvbSBgZm9yY2VgIGhlcmUgd291bGRcblx0XHQvLyBtYWtlIGEgZnJlc2ggZm9yY2VkIGF0dGVtcHQgbG9vayBsaWtlIGl0IGFscmVhZHkgaGFzIGEgZm9sbG93LXVwXG5cdFx0Ly8gcXVldWVkLCBjYXVzaW5nIGEgc2Vjb25kIGBmb3JjZWAgdGhhdCBhcnJpdmVzIHdoaWxlIHRoaXMgZnJlc2hcblx0XHQvLyBhdHRlbXB0IGlzIHN0aWxsIGluIGZsaWdodCB0byBiZSBzaWxlbnRseSBkcm9wcGVkIGluc3RlYWQgb2Zcblx0XHQvLyBjaGFpbmluZyBpdHMgb3duIGZvbGxvdy11cC5cblx0XHRjb25zdCBzdGF0ZTogSVByb3ZpZGVyRGlzY292ZXJ5U3RhdGUgPSB7IHByb21pc2U6IFByb21pc2UucmVzb2x2ZSgpLCBmb3JjZVF1ZXVlZDogZmFsc2UgfTtcblx0XHRjb25zdCBhdHRlbXB0ID0gcnVuKGZvcmNlKTtcblx0XHRzdGF0ZS5wcm9taXNlID0gYXR0ZW1wdDtcblx0XHRzdGF0ZXMuc2V0KHByb3ZpZGVyLmlkLCBzdGF0ZSk7XG5cdFx0dGhpcy5fYXJtUHJvdmlkZXJDYXRhbG9nQ2xlYW51cChwcm92aWRlciwgc3RhdGVzLCBzdGF0ZSwgYXR0ZW1wdCk7XG5cdFx0cmV0dXJuIGF0dGVtcHQ7XG5cdH1cblxuXHQvKipcblx0ICogQ2xlYXJzIGBwcm92aWRlcmAncyBpbi1mbGlnaHQgZGlzY292ZXJ5IGVudHJ5IG9uY2UgYHByb21pc2VgICh0aGUgZW50cnknc1xuXHQgKiBjdXJyZW50IGF0dGVtcHQpIHNldHRsZXMsIGJ1dCBvbmx5IGlmIHRoZSBlbnRyeSBzdGlsbCBwb2ludHMgYXQgdGhhdFxuXHQgKiBleGFjdCBwcm9taXNlIFx1MjAxNCBhIGBmb3JjZWAgY2hhaW4gbWF5IGhhdmUgcmVwbGFjZWQgaXQgd2l0aCBhIGZvbGxvdy11cFxuXHQgKiBhdHRlbXB0IGluIHRoZSBtZWFudGltZSwgd2hpY2ggYXJtcyBpdHMgb3duIGNsZWFudXAgaW4gdHVybi5cblx0ICovXG5cdHByaXZhdGUgX2FybVByb3ZpZGVyQ2F0YWxvZ0NsZWFudXAocHJvdmlkZXI6IElBZ2VudCwgc3RhdGVzOiBNYXA8QWdlbnRQcm92aWRlciwgSVByb3ZpZGVyRGlzY292ZXJ5U3RhdGU+LCBzdGF0ZTogSVByb3ZpZGVyRGlzY292ZXJ5U3RhdGUsIHByb21pc2U6IFByb21pc2U8dm9pZD4pOiB2b2lkIHtcblx0XHRjb25zdCBjbGVhciA9ICgpID0+IHtcblx0XHRcdGlmIChzdGF0ZS5wcm9taXNlID09PSBwcm9taXNlICYmIHN0YXRlcy5nZXQocHJvdmlkZXIuaWQpID09PSBzdGF0ZSkge1xuXHRcdFx0XHRzdGF0ZXMuZGVsZXRlKHByb3ZpZGVyLmlkKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHZvaWQgcHJvbWlzZS50aGVuKGNsZWFyLCBjbGVhcik7XG5cdH1cblxuXHQvKipcblx0ICogQWRkaXRpdmVseSBkaXNjb3ZlcnMgb25lIHByb3ZpZGVyJ3MgbmF0aXZlIHRvcC1sZXZlbCBjaGF0cy4gSW50ZXJuYWwgY2hhdCBiYWNraW5ncyBhcmVcblx0ICogZmlsdGVyZWQgb3V0LCBzdWJhZ2VudCBzZXNzaW9ucyBhcmUgZmlsdGVyZWQgb3V0LCBhbmQgZXhwbGljaXRseS1kZWxldGVkXG5cdCAqIHNlc3Npb25zIGFyZSBuZXZlciByZXN1cnJlY3RlZDogcmVnaXN0cmF0aW9uIGdvZXMgdGhyb3VnaFxuXHQgKiB7QGxpbmsgQWdlbnRTZXNzaW9uUmVnaXN0cnkucmVnaXN0ZXJ9LCB3aGljaCBhdG9taWNhbGx5IGRlY2xpbmVzIHRvXG5cdCAqIChyZS0pcmVnaXN0ZXIgYSBzZXNzaW9uIHRoYXQgaXMgKG9yIGNvbmN1cnJlbnRseSBiZWNvbWVzKVxuXHQgKiB0b21ic3RvbmVkLCByYXRoZXIgdGhhbiB0cnVzdGluZyBhIHNlcGFyYXRlIHVwLWZyb250IHRvbWJzdG9uZSBjaGVjayB0aGF0XG5cdCAqIGNvdWxkIHJhY2UgYSBjb25jdXJyZW50IHtAbGluayBkaXNwb3NlU2Vzc2lvbn0uXG5cdCAqXG5cdCAqIGB1bmRlZmluZWRgIGZyb20gdGhlIHByb3ZpZGVyIG1lYW5zIGl0IGNhbm5vdCBlbnVtZXJhdGUgeWV0IChpdHMgU0RLIG1heVxuXHQgKiBub3QgYmUgZG93bmxvYWRlZC9zdGFydGVkKSBcdTIwMTQgbm90IGFuIGF1dGhvcml0YXRpdmUgZW1wdHkgcmVzdWx0IFx1MjAxNCBzbyBpdHNcblx0ICogbmV4dCByZWFkaW5lc3Mgc2lnbmFsIHJldHJpZXMuXG5cdCAqL1xuXG5cdHByaXZhdGUgYXN5bmMgX3JlZ2lzdGVyRGlzY292ZXJlZENoYXRzKHByb3ZpZGVyOiBJQWdlbnQsIGNoYXRzOiByZWFkb25seSBJQWdlbnREaXNjb3ZlcmVkQ2hhdFtdKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBuZXcgTWFwKChhd2FpdCB0aGlzLl9saXN0UmVnaXN0ZXJlZFNlc3Npb25zKCkpLm1hcChzZXNzaW9uID0+IFtzZXNzaW9uLnNlc3Npb24udG9TdHJpbmcoKSwgc2Vzc2lvbi5leHRlcm5hbF0pKTtcblx0XHRjb25zdCBkaXNjb3ZlcnlMaW1pdGVyID0gbmV3IExpbWl0ZXI8Ym9vbGVhbj4oNCk7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKGNoYXRzLm1hcCgoeyBleHRlcm5hbCwgLi4ubWV0YWRhdGEgfSkgPT4gZGlzY292ZXJ5TGltaXRlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uTWV0YWRhdGEgPSB0aGlzLl90b1Nlc3Npb25NZXRhZGF0YShtZXRhZGF0YSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbk1ldGFkYXRhLnNlc3Npb247XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAoaXNTdWJhZ2VudFNlc3Npb24oc2Vzc2lvbi50b1N0cmluZygpKSB8fCBhd2FpdCB0aGlzLl9pc0NoYXRCYWNraW5nKHNlc3Npb24pKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGlkZW50aXR5OiBJUmVnaXN0ZXJlZFNlc3Npb24gPSB7IHNlc3Npb24sIHByb3ZpZGVyOiBwcm92aWRlci5pZCwgc3RhcnRUaW1lOiBtZXRhZGF0YS5zdGFydFRpbWUsIGV4dGVybmFsLCBzb3VyY2U6IGV4dGVybmFsID8gJ2Rpc2NvdmVyeScgOiAncmVzdG9yZScgfTtcblx0XHRcdFx0Y29uc3QgcmVnaXN0ZXJlZCA9IGF3YWl0IHRoaXMuX3JldHJ5UmVnaXN0cnlNdXRhdGlvbihcblx0XHRcdFx0XHQoKSA9PiB0aGlzLl9zZXNzaW9uUmVnaXN0cnkucmVnaXN0ZXIoc2Vzc2lvbiwgaWRlbnRpdHksIHsgY2hlY2tUb21ic3RvbmU6IHRydWUgfSksXG5cdFx0XHRcdFx0YGRpc2NvdmVyeSByZWdpc3RyYXRpb24gZm9yICR7c2Vzc2lvbi50b1N0cmluZygpfWAsXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGlmIChyZWdpc3RlcmVkKSB7XG5cdFx0XHRcdFx0aWYgKGV4dGVybmFsICYmIGV4aXN0aW5nLmdldChzZXNzaW9uLnRvU3RyaW5nKCkpICE9PSB0cnVlKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9pbml0aWFsaXplRXh0ZXJuYWxTZXNzaW9uUmVhZFN0YXRlKHNlc3Npb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRleGlzdGluZy5zZXQoc2Vzc2lvbi50b1N0cmluZygpLCBleHRlcm5hbCk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fYW5ub3VuY2VTdXJmYWNlZFNlc3Npb24oeyAuLi5zZXNzaW9uTWV0YWRhdGEsIF9tZXRhOiB3aXRoU2Vzc2lvbkV4dGVybmFsKHNlc3Npb25NZXRhZGF0YS5fbWV0YSwgZXh0ZXJuYWwpIH0sIHByb3ZpZGVyLmlkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gcmVnaXN0ZXJlZDtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIEZhaWxlZCB0byByZWdpc3RlciBkaXNjb3ZlcmVkIGNoYXQgJHtzZXNzaW9uLnRvU3RyaW5nKCl9IGZvciBwcm92aWRlciAke3Byb3ZpZGVyLmlkfWAsIGVycik7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9KSkpO1xuXHRcdHJldHVybiByZXN1bHRzLnNvbWUoY2hhbmdlZCA9PiBjaGFuZ2VkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX21pZ3JhdGVMZWdhY3lQcm92aWRlckNoYXRzKHByb3ZpZGVyOiBJQWdlbnQsIGZvcmNlID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIWZvcmNlKSB7XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5fc2Vzc2lvblJlZ2lzdHJ5LmlzUHJvdmlkZXJCYWNrZmlsbGVkKHByb3ZpZGVyLmlkKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoYXdhaXQgdGhpcy5fc2Vzc2lvblJlZ2lzdHJ5LmlzQmFja2ZpbGxlZCgpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Nlc3Npb25SZWdpc3RyeS5tYXJrUHJvdmlkZXJCYWNrZmlsbGVkKHByb3ZpZGVyLmlkKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9ucyA9IGF3YWl0IHRoaXMuX2VudW1lcmF0ZUxlZ2FjeVByb3ZpZGVyU2Vzc2lvbnMocHJvdmlkZXIpO1xuXHRcdGlmIChzZXNzaW9ucyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGV4aXN0aW5nID0gbmV3IE1hcCgoYXdhaXQgdGhpcy5fbGlzdFJlZ2lzdGVyZWRTZXNzaW9ucygpKS5tYXAoc2Vzc2lvbiA9PiBbc2Vzc2lvbi5zZXNzaW9uLnRvU3RyaW5nKCksIHNlc3Npb24uZXh0ZXJuYWxdKSk7XG5cdFx0Y29uc3QgbWlncmF0aW9uTGltaXRlciA9IG5ldyBMaW1pdGVyPElSZWdpc3RlcmVkU2Vzc2lvbiB8IHVuZGVmaW5lZD4oNCk7XG5cdFx0Y29uc3QgaWRlbnRpdGllcyA9IGF3YWl0IFByb21pc2UuYWxsKHNlc3Npb25zLm1hcChzID0+IG1pZ3JhdGlvbkxpbWl0ZXIucXVldWUoYXN5bmMgKCk6IFByb21pc2U8SVJlZ2lzdGVyZWRTZXNzaW9uIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRpZiAoaXNTdWJhZ2VudFNlc3Npb24ocy5zZXNzaW9uLnRvU3RyaW5nKCkpIHx8IGF3YWl0IHRoaXMuX2lzQ2hhdEJhY2tpbmcocy5zZXNzaW9uKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZXh0ZXJuYWwgPSBhd2FpdCB0aGlzLl9pc0V4dGVybmFsUHJvdmlkZXJDaGF0KHMuc2Vzc2lvbik7XG5cdFx0XHRyZXR1cm4geyBzZXNzaW9uOiBzLnNlc3Npb24sIHByb3ZpZGVyOiBwcm92aWRlci5pZCwgc3RhcnRUaW1lOiBzLnN0YXJ0VGltZSwgZXh0ZXJuYWwsIHNvdXJjZTogZXh0ZXJuYWwgPyAnZGlzY292ZXJ5JyA6ICdyZXN0b3JlJyB9O1xuXHRcdH0pKSk7XG5cdFx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGlkZW50aXRpZXMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRjb25zdCBpZGVudGl0eSA9IGlkZW50aXRpZXNbaW5kZXhdO1xuXHRcdFx0aWYgKCFpZGVudGl0eSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlZ2lzdGVyZWQgPSBhd2FpdCB0aGlzLl9zZXNzaW9uUmVnaXN0cnkucmVnaXN0ZXIoaWRlbnRpdHkuc2Vzc2lvbiwgaWRlbnRpdHksIHsgY2hlY2tUb21ic3RvbmU6IHRydWUgfSk7XG5cdFx0XHRpZiAocmVnaXN0ZXJlZCkge1xuXHRcdFx0XHRjb25zdCBtZXRhZGF0YSA9IHNlc3Npb25zW2luZGV4XTtcblx0XHRcdFx0aWYgKGlkZW50aXR5LmV4dGVybmFsICYmIGV4aXN0aW5nLmdldChpZGVudGl0eS5zZXNzaW9uLnRvU3RyaW5nKCkpICE9PSB0cnVlKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5faW5pdGlhbGl6ZUV4dGVybmFsU2Vzc2lvblJlYWRTdGF0ZShpZGVudGl0eS5zZXNzaW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRleGlzdGluZy5zZXQoaWRlbnRpdHkuc2Vzc2lvbi50b1N0cmluZygpLCBpZGVudGl0eS5leHRlcm5hbCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2Fubm91bmNlU3VyZmFjZWRTZXNzaW9uKHsgLi4ubWV0YWRhdGEsIF9tZXRhOiB3aXRoU2Vzc2lvbkV4dGVybmFsKG1ldGFkYXRhLl9tZXRhLCBpZGVudGl0eS5leHRlcm5hbCkgfSwgcHJvdmlkZXIuaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9zZXNzaW9uUmVnaXN0cnkubWFya1Byb3ZpZGVyQmFja2ZpbGxlZChwcm92aWRlci5pZCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pbml0aWFsaXplRXh0ZXJuYWxTZXNzaW9uUmVhZFN0YXRlKHNlc3Npb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlZiA9IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2Uoc2Vzc2lvbik7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHJlZi5vYmplY3Quc2V0TWV0YWRhdGEoQUhfTUVUQV9JU19SRUFEX0RCX0tFWSwgJ3RydWUnKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9pc0V4dGVybmFsUHJvdmlkZXJDaGF0KHNlc3Npb246IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS50cnlPcGVuRGF0YWJhc2Uoc2Vzc2lvbik7XG5cdFx0aWYgKCFyZWYpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgcmVmLm9iamVjdC5nZXRNZXRhZGF0YShBSF9NRVRBX1dPUktTUEFDRUxFU1NfREJfS0VZKSA9PT0gdW5kZWZpbmVkO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX21pZ3JhdGVSZWdpc3RlcmVkU2Vzc2lvbihlbnRyeTogSVN0b3JlZFJlZ2lzdGVyZWRTZXNzaW9uKTogUHJvbWlzZTxJUmVnaXN0ZXJlZFNlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoZW50cnkuZXh0ZXJuYWwgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZXh0ZXJuYWwgPSBhd2FpdCB0aGlzLl9pc0V4dGVybmFsUHJvdmlkZXJDaGF0KGVudHJ5LnNlc3Npb24pO1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5lbnRyeSxcblx0XHRcdGV4dGVybmFsLFxuXHRcdFx0c291cmNlOiBleHRlcm5hbCA/ICdkaXNjb3ZlcnknIDogZW50cnkuc291cmNlLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9saXN0UmVnaXN0ZXJlZFNlc3Npb25zKCk6IFByb21pc2U8cmVhZG9ubHkgSVJlZ2lzdGVyZWRTZXNzaW9uW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvblJlZ2lzdHJ5Lmxpc3QoZW50cnkgPT4gdGhpcy5fbWlncmF0ZVJlZ2lzdGVyZWRTZXNzaW9uKGVudHJ5KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXRyeVJlZ2lzdHJ5TXV0YXRpb248VD4ob3BlcmF0aW9uOiAoKSA9PiBQcm9taXNlPFQ+LCBkZXNjcmlwdGlvbjogc3RyaW5nKTogUHJvbWlzZTxUPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBvcGVyYXRpb24oKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV0gUmV0cnlpbmcgZmFpbGVkIHNlc3Npb24gcmVnaXN0cnkgJHtkZXNjcmlwdGlvbn1gLCBlcnIpO1xuXHRcdFx0cmV0dXJuIG9wZXJhdGlvbigpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIGEgc2Vzc2lvbiBpcyBtYXJrZWQgYXMgYW4gaW50ZXJuYWwgY2hhdCBiYWNraW5nLCBlaXRoZXIgZHVyYWJseVxuXHQgKiAoaXRzIG93biBtZXRhZGF0YSkgb3IgaW4tcHJvY2VzcyAoaXRzIGR1cmFibGUgbWFya2VyIHdyaXRlIGtlcHQgZmFpbGluZ1xuXHQgKiBpbiBgY3JlYXRlQ2hhdGA7IHNlZSBgX3VucGVyc2lzdGVkQ2hhdEJhY2tpbmdzYCkuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9pc0NoYXRCYWNraW5nKHNlc3Npb246IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh0aGlzLl91bnBlcnNpc3RlZENoYXRCYWNraW5ncy5oYXMoc2Vzc2lvbi50b1N0cmluZygpKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2UudHJ5T3BlbkRhdGFiYXNlKHNlc3Npb24pO1xuXHRcdFx0aWYgKCFyZWYpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuICEhKGF3YWl0IHJlZi5vYmplY3QuZ2V0TWV0YWRhdGEoQ0hBVF9CQUNLSU5HX01FVEFEQVRBX0tFWSkpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblx0YXN5bmMgbGlzdFNlc3Npb25zKG1vZGUgPSB0aGlzLl9nZXRFeHRlcm5hbFNlc3Npb25zTW9kZSgpKTogUHJvbWlzZTxJQWdlbnRTZXNzaW9uTWV0YWRhdGFbXT4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoJ1tBZ2VudFNlcnZpY2VdIGxpc3RTZXNzaW9ucyBjYWxsZWQnKTtcblx0XHQvLyBUaGUgZmlyc3QgbGlzdCB3YWl0cyBmb3IgcmVnaXN0cmF0aW9uLXRpbWUgbGVnYWN5IG1pZ3JhdGlvbiBpZiBpdCBpcyBzdGlsbCBpbiBmbGlnaHQuXG5cdFx0YXdhaXQgdGhpcy5fYXdhaXRJbml0aWFsUHJvdmlkZXJNaWdyYXRpb24oKTtcblx0XHQvLyBUaGUgcmVnaXN0cnkgaXMgdGhlIHNvdXJjZSBvZiB0cnV0aCBmb3IgdG9wLWxldmVsIHNlc3Npb25zLiBJbnRlcm5hbFxuXHRcdC8vIGNoYXQgYmFja2luZ3MgYW5kIHN1YmFnZW50IHNlc3Npb25zIG5ldmVyIGVudGVyIGl0LCBhbmQgYSB0cmFuc2llbnRseVxuXHRcdC8vIG1pc3NpbmcgcHJvdmlkZXIgc25hcHNob3Qgbm8gbG9uZ2VyIGV2aWN0cyBhIHNlc3Npb24uXG5cdFx0Y29uc3QgcmVnaXN0ZXJlZCA9IGF3YWl0IHRoaXMuX2xpc3RSZWdpc3RlcmVkU2Vzc2lvbnMoKTtcblx0XHRjb25zdCBtZXRhZGF0YUxpbWl0ZXIgPSBuZXcgTGltaXRlcjxJQWdlbnRTZXNzaW9uTWV0YWRhdGEgfCB1bmRlZmluZWQ+KDQpO1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChyZWdpc3RlcmVkLm1hcChyZWdpc3RlcmVkU2Vzc2lvbiA9PiBtZXRhZGF0YUxpbWl0ZXIucXVldWUoYXN5bmMgKCk6IFByb21pc2U8SUFnZW50U2Vzc2lvbk1ldGFkYXRhIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRjb25zdCB7IHNlc3Npb24sIHByb3ZpZGVyLCBleHRlcm5hbCB9ID0gcmVnaXN0ZXJlZFNlc3Npb247XG5cdFx0XHQvLyBJZGxlIHByb3Zpc2lvbmFsIHNlc3Npb25zIHN0YXkgaGlkZGVuIHVudGlsIHRoZXkgbWF0ZXJpYWxpemUgb3IgZ2FpblxuXHRcdFx0Ly8gdHVybiBhY3Rpdml0eSAoIzMyMTI2OSkuIFRoZSBzdGF0ZS1tYW5hZ2VyIG92ZXJsYXkgYmVsb3cgcmUtc3VyZmFjZXNcblx0XHRcdC8vIHRoZW0gdGhlbi5cblx0XHRcdGlmICh0aGlzLl9zdGF0ZU1hbmFnZXIuaXNJZGxlUHJvdmlzaW9uYWxTZXNzaW9uKHNlc3Npb24udG9TdHJpbmcoKSkpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9wcm92aWRlcnMuZ2V0KHByb3ZpZGVyKTtcblx0XHRcdGlmICghYWdlbnQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9yZWdpc3RlcmVkU2Vzc2lvbk1ldGFkYXRhKGFnZW50LCBzZXNzaW9uLCBleHRlcm5hbCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBsaXN0U2Vzc2lvbnM6IGZhaWxlZCB0byByZWFkIG1ldGFkYXRhIGZvciAke3Nlc3Npb259YCwgZXJyKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSkpO1xuXHRcdGNvbnN0IGZsYXQgPSByZXN1bHRzLmZpbHRlcigocyk6IHMgaXMgSUFnZW50U2Vzc2lvbk1ldGFkYXRhID0+IHMgIT09IHVuZGVmaW5lZCk7XG5cblx0XHQvLyBPdmVybGF5IHBlcnNpc3RlZCBjdXN0b20gdGl0bGVzIGZyb20gcGVyLXNlc3Npb24gZGF0YWJhc2VzLlxuXHRcdGNvbnN0IG92ZXJsYXlMaW1pdGVyID0gbmV3IExpbWl0ZXI8SUFnZW50U2Vzc2lvbk1ldGFkYXRhIHwgdW5kZWZpbmVkPig0KTtcblx0XHRjb25zdCBvdmVybGFpZCA9IGF3YWl0IFByb21pc2UuYWxsKGZsYXQubWFwKHMgPT4gb3ZlcmxheUxpbWl0ZXIucXVldWUoYXN5bmMgKCk6IFByb21pc2U8SUFnZW50U2Vzc2lvbk1ldGFkYXRhIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0XHRjb25zdCBzYW5pdGl6ZWQgPSB7IC4uLnMsIF9tZXRhOiB3aXRoU2Vzc2lvbk11bHRpUm9vdE1ldGFkYXRhKHMuX21ldGEsIHVuZGVmaW5lZCkgfTtcblx0XHRcdC8vIEEgYmFja2luZyBzZXNzaW9uIHdob3NlIGR1cmFibGUgbWFya2VyIHdyaXRlIGtlcHQgZmFpbGluZyBpc1xuXHRcdFx0Ly8gc3VwcHJlc3NlZCBpbi1wcm9jZXNzIChzZWUgYF91bnBlcnNpc3RlZENoYXRCYWNraW5nc2ApOyBjaGVja1xuXHRcdFx0Ly8gdGhpcyBiZWZvcmUgdG91Y2hpbmcgdGhlIERCIHNvIGl0IGlzIGZpbHRlcmVkIHRoZSBzYW1lIHdheVxuXHRcdFx0Ly8gd2hldGhlciBvciBub3QgdGhlIG1hcmtlciBldmVyIG1hZGUgaXQgdG8gZGlzay5cblx0XHRcdGlmICh0aGlzLl91bnBlcnNpc3RlZENoYXRCYWNraW5ncy5oYXMocy5zZXNzaW9uLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2UudHJ5T3BlbkRhdGFiYXNlKHMuc2Vzc2lvbik7XG5cdFx0XHRcdGlmICghcmVmKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHNhbml0aXplZDtcblx0XHRcdFx0fVxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdC8vIEJhdGNoIHRoZSBhbHdheXMtcmVxdWlyZWQga2V5cyAodGl0bGUgLyByZWFkIC8gYXJjaGl2ZVxuXHRcdFx0XHRcdC8vIGZsYWdzKSB3aXRoIGFueSBrZXlzIHRoZSBjaGFuZ2VzZXQgY29vcmRpbmF0b3IgYXNrcyBmb3Jcblx0XHRcdFx0XHQvLyBzbyB0aGUgc2Vzc2lvbiBEQiBpcyBoaXQgZXhhY3RseSBvbmNlLiBUaGUgY29vcmRpbmF0b3Jcblx0XHRcdFx0XHQvLyByZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gYSBsaXZlIHNvdXJjZSBjYW4gYWxyZWFkeVxuXHRcdFx0XHRcdC8vIGFuc3dlciB0aGUgY2F0YWxvZ3VlIHF1ZXN0aW9uLCBhdm9pZGluZyB0aGVcblx0XHRcdFx0XHQvLyBwb3RlbnRpYWxseS1sYXJnZSBwZXJzaXN0ZWQgYmxvYnMgZW50aXJlbHkuXG5cdFx0XHRcdFx0Y29uc3Qgc2Vzc2lvblN0ciA9IHMuc2Vzc2lvbi50b1N0cmluZygpO1xuXHRcdFx0XHRcdGNvbnN0IGNoYW5nZXNldEtleXMgPSB0aGlzLl9jaGFuZ2VzZXRDb29yZGluYXRvci5nZXRMaXN0TWV0YWRhdGFLZXlzKHNlc3Npb25TdHIpO1xuXHRcdFx0XHRcdGNvbnN0IG1ldGFkYXRhS2V5czogUmVjb3JkPHN0cmluZywgdHJ1ZT4gPSBjaGFuZ2VzZXRLZXlzXG5cdFx0XHRcdFx0XHQ/IHsgY3VzdG9tVGl0bGU6IHRydWUsIFtBSF9NRVRBX0lTX1JFQURfREJfS0VZXTogdHJ1ZSwgW0FIX01FVEFfSVNfQVJDSElWRURfREJfS0VZXTogdHJ1ZSwgW0FIX01FVEFfSVNfRE9ORV9EQl9LRVldOiB0cnVlLCBbQUhfTUVUQV9XT1JLU1BBQ0VMRVNTX0RCX0tFWV06IHRydWUsIFtTRVNTSU9OX01FVEFfTVVMVElfUk9PVF9LRVldOiB0cnVlLCBbQ0hBVF9CQUNLSU5HX01FVEFEQVRBX0tFWV06IHRydWUsIFtXT1JLVFJFRV9NRVRBX1JFUE9TSVRPUllfUk9PVF06IHRydWUsIC4uLkdJVF9EQl9NRVRBREFUQV9LRVlTLCAuLi5jaGFuZ2VzZXRLZXlzIH1cblx0XHRcdFx0XHRcdDogeyBjdXN0b21UaXRsZTogdHJ1ZSwgW0FIX01FVEFfSVNfUkVBRF9EQl9LRVldOiB0cnVlLCBbQUhfTUVUQV9JU19BUkNISVZFRF9EQl9LRVldOiB0cnVlLCBbQUhfTUVUQV9JU19ET05FX0RCX0tFWV06IHRydWUsIFtBSF9NRVRBX1dPUktTUEFDRUxFU1NfREJfS0VZXTogdHJ1ZSwgW1NFU1NJT05fTUVUQV9NVUxUSV9ST09UX0tFWV06IHRydWUsIFtDSEFUX0JBQ0tJTkdfTUVUQURBVEFfS0VZXTogdHJ1ZSwgW1dPUktUUkVFX01FVEFfUkVQT1NJVE9SWV9ST09UXTogdHJ1ZSwgLi4uR0lUX0RCX01FVEFEQVRBX0tFWVMgfTtcblx0XHRcdFx0XHRjb25zdCBtID0gYXdhaXQgcmVmLm9iamVjdC5nZXRNZXRhZGF0YU9iamVjdChtZXRhZGF0YUtleXMpO1xuXHRcdFx0XHRcdC8vIFRoaXMgc2Vzc2lvbiBpcyBhbiBpbnRlcm5hbCBwZWVyLWNoYXQgYmFja2luZyAoZS5nLiBhXG5cdFx0XHRcdFx0Ly8gQ2xhdWRlIHBlZXIgY2hhdCdzIFNESyBzZXNzaW9uLCBlbnVtZXJhdGVkIGJ5IHRoZSBhZ2VudCdzXG5cdFx0XHRcdFx0Ly8gb3duIGBsaXN0U2Vzc2lvbnNgKS4gRHJvcCBpdCBzbyBpdCBuZXZlciBsZWFrcyBhcyBhXG5cdFx0XHRcdFx0Ly8gc3RhbmRhbG9uZSB0b3AtbGV2ZWwgc2Vzc2lvbiBcdTIwMTQgbWlycm9ycyB0aGUgc3ViYWdlbnQgZmlsdGVyXG5cdFx0XHRcdFx0Ly8gb24gdGhlIHN0YXRlLW1hbmFnZXIgb3ZlcmxheSBwYXRoIGJlbG93LlxuXHRcdFx0XHRcdGlmIChtW0NIQVRfQkFDS0lOR19NRVRBREFUQV9LRVldKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsZXQgdXBkYXRlZCA9IHNhbml0aXplZDtcblx0XHRcdFx0XHRpZiAobS5jdXN0b21UaXRsZSkge1xuXHRcdFx0XHRcdFx0dXBkYXRlZCA9IHsgLi4udXBkYXRlZCwgc3VtbWFyeTogbS5jdXN0b21UaXRsZSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHQvLyBgaXNEb25lYCBpcyB0aGUgbGVnYWN5IGtleSBmb3IgYGlzQXJjaGl2ZWRgLlxuXHRcdFx0XHRcdGlmIChtW0FIX01FVEFfSVNfUkVBRF9EQl9LRVldICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHVwZGF0ZWQgPSB7IC4uLnVwZGF0ZWQsIHN0YXR1czogd2l0aFNlc3Npb25TdGF0dXNGbGFnKHVwZGF0ZWQuc3RhdHVzID8/IFNlc3Npb25TdGF0dXMuSWRsZSwgU2Vzc2lvblN0YXR1cy5Jc1JlYWQsIG1bQUhfTUVUQV9JU19SRUFEX0RCX0tFWV0gPT09ICd0cnVlJykgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgcGVyc2lzdGVkQXJjaGl2ZWQgPSBtW0FIX01FVEFfSVNfQVJDSElWRURfREJfS0VZXSA/PyBtW0FIX01FVEFfSVNfRE9ORV9EQl9LRVldO1xuXHRcdFx0XHRcdGlmIChwZXJzaXN0ZWRBcmNoaXZlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHR1cGRhdGVkID0geyAuLi51cGRhdGVkLCBzdGF0dXM6IHdpdGhTZXNzaW9uU3RhdHVzRmxhZyh1cGRhdGVkLnN0YXR1cyA/PyBTZXNzaW9uU3RhdHVzLklkbGUsIFNlc3Npb25TdGF0dXMuSXNBcmNoaXZlZCwgcGVyc2lzdGVkQXJjaGl2ZWQgPT09ICd0cnVlJykgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG1bTUVUQV9HSVRfU1RBVEVdKSB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBnaXRTdGF0ZSA9IEpTT04ucGFyc2UobVtNRVRBX0dJVF9TVEFURV0pIGFzIElTZXNzaW9uR2l0U3RhdGU7XG5cdFx0XHRcdFx0XHRcdHVwZGF0ZWQgPSB7IC4uLnVwZGF0ZWQsIF9tZXRhOiB3aXRoU2Vzc2lvbkdpdFN0YXRlKHVwZGF0ZWQuX21ldGEsIGdpdFN0YXRlKSB9O1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdW2xpc3RTZXNzaW9uc10gRmFpbGVkIHRvIHBhcnNlIEdpdCBzdGF0ZSBmb3IgJHtzLnNlc3Npb259YCwgZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChtW01FVEFfR0lUSFVCX1NUQVRFXSkge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZ2l0SHViU3RhdGUgPSBKU09OLnBhcnNlKG1bTUVUQV9HSVRIVUJfU1RBVEVdKSBhcyBJU2Vzc2lvbkdpdEh1YlN0YXRlO1xuXHRcdFx0XHRcdFx0XHR1cGRhdGVkID0geyAuLi51cGRhdGVkLCBfbWV0YTogd2l0aFNlc3Npb25HaXRIdWJTdGF0ZSh1cGRhdGVkLl9tZXRhLCBnaXRIdWJTdGF0ZSkgfTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXVtsaXN0U2Vzc2lvbnNdIEZhaWxlZCB0byBwYXJzZSBHaXRIdWIgc3RhdGUgZm9yICR7cy5zZXNzaW9ufWAsIGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAobVtNRVRBX1NPVVJDRV9DT05UUk9MX1NUQVRFXSkge1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgc291cmNlQ29udHJvbFN0YXRlID0gcGFyc2VQZXJzaXN0ZWRTb3VyY2VDb250cm9sU3RhdGUobVtNRVRBX1NPVVJDRV9DT05UUk9MX1NUQVRFXSk7XG5cdFx0XHRcdFx0XHRcdHVwZGF0ZWQgPSB7IC4uLnVwZGF0ZWQsIF9tZXRhOiB3aXRoU2Vzc2lvblNvdXJjZUNvbnRyb2xTdGF0ZSh1cGRhdGVkLl9tZXRhLCBzb3VyY2VDb250cm9sU3RhdGUpIH07XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV1bbGlzdFNlc3Npb25zXSBGYWlsZWQgdG8gcGFyc2Ugc291cmNlLWNvbnRyb2wgc3RhdGUgZm9yICR7cy5zZXNzaW9ufWAsIGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChtW0FIX01FVEFfV09SS1NQQUNFTEVTU19EQl9LRVldICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdHVwZGF0ZWQgPSB7IC4uLnVwZGF0ZWQsIF9tZXRhOiB3aXRoU2Vzc2lvbldvcmtzcGFjZWxlc3ModXBkYXRlZC5fbWV0YSwgbVtBSF9NRVRBX1dPUktTUEFDRUxFU1NfREJfS0VZXSA9PT0gJ3RydWUnKSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBtdWx0aVJvb3QgPSBwYXJzZVNlc3Npb25NdWx0aVJvb3RNZXRhZGF0YShtW1NFU1NJT05fTUVUQV9NVUxUSV9ST09UX0tFWV0pO1xuXHRcdFx0XHRcdGlmIChtdWx0aVJvb3QpIHtcblx0XHRcdFx0XHRcdHVwZGF0ZWQgPSB7IC4uLnVwZGF0ZWQsIF9tZXRhOiB3aXRoU2Vzc2lvbk11bHRpUm9vdE1ldGFkYXRhKHVwZGF0ZWQuX21ldGEsIG11bHRpUm9vdCkgfTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBVc2UgdGhlIHBlcnNpc3RlZCByb290IGFzLWlzIHRvIGtlZXAgbGlzdGluZyBvZmYgR2l0OyB0aGUgbWV0YWRhdGEgcmVhZGVyIHJlLWNhbm9uaWNhbGl6ZXMgaXQgb24gb3Blbi5cblx0XHRcdFx0XHRjb25zdCB3b3JrdHJlZVByb2plY3QgPSB3b3JrdHJlZVByb2plY3RGcm9tUmVwb3NpdG9yeVJvb3QobVtXT1JLVFJFRV9NRVRBX1JFUE9TSVRPUllfUk9PVF0pO1xuXHRcdFx0XHRcdGlmICh3b3JrdHJlZVByb2plY3QpIHtcblx0XHRcdFx0XHRcdHVwZGF0ZWQgPSB7IC4uLnVwZGF0ZWQsIHByb2plY3Q6IHdvcmt0cmVlUHJvamVjdCB9O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9jaGFuZ2VzZXRDb29yZGluYXRvci5kZWNvcmF0ZUxpc3RFbnRyeSh1cGRhdGVkLCBtIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4pO1xuXHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBGYWlsZWQgdG8gcmVhZCBzZXNzaW9uIG1ldGFkYXRhIG92ZXJsYXkgZm9yICR7cy5zZXNzaW9ufWAsIGUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHNhbml0aXplZDtcblx0XHR9KSkpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG92ZXJsYWlkLmZpbHRlcigocyk6IHMgaXMgSUFnZW50U2Vzc2lvbk1ldGFkYXRhID0+IHMgIT09IHVuZGVmaW5lZCk7XG5cblx0XHQvLyBPdmVybGF5IGxpdmUgc2Vzc2lvbiBzdGF0ZSBmcm9tIHRoZSBzdGF0ZSBtYW5hZ2VyLlxuXHRcdC8vIEZvciB0aGUgdGl0bGUsIHByZWZlciB0aGUgc3RhdGUgbWFuYWdlcidzIHZhbHVlIHdoZW4gaXQgaXNcblx0XHQvLyBub24tZW1wdHksIHNvIFNESy1zb3VyY2VkIHRpdGxlcyBhcmUgbm90IG92ZXJ3cml0dGVuIGJ5IHRoZVxuXHRcdC8vIGluaXRpYWwgZW1wdHkgcGxhY2Vob2xkZXIuIFRoZSBkZWZhdWx0IGNoYW5nZXNldCBjYXRhbG9ndWUgbGl2ZXNcblx0XHQvLyBvbiBgc3RhdGUuY2hhbmdlc2V0c2AgKHNlZWRlZCBhZnRlciBgY3JlYXRlU2Vzc2lvbmAgL1xuXHRcdC8vIGByZXN0b3JlU2Vzc2lvbmAgYW5kIHJlZnJlc2hlZCBhZnRlciBlYWNoIGNvbXB1dGUgcGFzcykgYW5kIHRoZVxuXHRcdC8vIGNoaXAgYWdncmVnYXRlIG9uIHRoZSBjYXRhbG9nIHN1bW1hcnkncyBgY2hhbmdlc2A7IGJvdGggbXVzdCBiZVxuXHRcdC8vIHN1cmZhY2VkIGhlcmUgc28gYSBmcmVzaCBgbGlzdFNlc3Npb25zYCBjYWxsIHJldHVybnMgdGhlIHNhbWUgdmFsdWVzXG5cdFx0Ly8gc3Vic2NyaWJlcnMgc2VlIHZpYSB0aGUgcGVyLXNlc3Npb24gYWN0aW9uIHN0cmVhbSBhbmRcblx0XHQvLyBgbm90aWZ5L3Nlc3Npb25TdW1tYXJ5Q2hhbmdlZGAuXG5cdFx0Y29uc3Qgd2l0aFN0YXR1cyA9IHJlc3VsdC5tYXAocyA9PiB7XG5cdFx0XHRjb25zdCBsaXZlU3VtbWFyeSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3VtbWFyeShzLnNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRpZiAobGl2ZVN1bW1hcnkpIHtcblx0XHRcdFx0Ly8gT3ZlcmxheSB0aGUgbGl2ZSBgX21ldGFgIG92ZXIgdGhlIERCLWRlcml2ZWQgdmFsdWUuIFRoZSBsaXZlXG5cdFx0XHRcdC8vIGBfbWV0YWAgaXMgdGhlIGZyZXNoZXN0IHNvdXJjZSAoZS5nLiB0aGUgR2l0SHViIHN0YXRlIGlzXG5cdFx0XHRcdC8vIHB1Ymxpc2hlZCBoZXJlIGFzIHNvb24gYXMgYSBQUiBpcyBjcmVhdGVkKSwgc28gYSBmcmVzaGx5LWNyZWF0ZWRcblx0XHRcdFx0Ly8gc2Vzc2lvbiB0aGF0IGhhcyBub3QgeWV0IHBlcnNpc3RlZCBpdHMgc3RhdGUgdG8gaXRzIHNlc3Npb25cblx0XHRcdFx0Ly8gZGF0YWJhc2Ugc3RpbGwgcmVwb3J0cyBpdCBoZXJlLiBLZWVwIHRoZSBEQiB2YWx1ZSBhcyB0aGUgYmFzZSBzb1xuXHRcdFx0XHQvLyBhbnkga2V5cyBhYnNlbnQgZnJvbSB0aGUgbGl2ZSBgX21ldGFgIGFyZSBwcmVzZXJ2ZWQuXG5cdFx0XHRcdGxldCBfbWV0YSA9IGxpdmVTdW1tYXJ5Ll9tZXRhICE9PSB1bmRlZmluZWQgfHwgcy5fbWV0YSAhPT0gdW5kZWZpbmVkXG5cdFx0XHRcdFx0PyB7IC4uLnMuX21ldGEsIC4uLmxpdmVTdW1tYXJ5Ll9tZXRhIH1cblx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0X21ldGEgPSB3aXRoU2Vzc2lvbk11bHRpUm9vdE1ldGFkYXRhKF9tZXRhLCByZWFkU2Vzc2lvbk11bHRpUm9vdE1ldGFkYXRhKGxpdmVTdW1tYXJ5Ll9tZXRhKSA/PyByZWFkU2Vzc2lvbk11bHRpUm9vdE1ldGFkYXRhKHMuX21ldGEpKTtcblx0XHRcdFx0Y29uc3QgbGl2ZVdvcmtpbmdEaXJzID0gbGl2ZVN1bW1hcnkud29ya2luZ0RpcmVjdG9yaWVzO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC4uLnMsXG5cdFx0XHRcdFx0c3VtbWFyeTogbGl2ZVN1bW1hcnkudGl0bGUgfHwgcy5zdW1tYXJ5LFxuXHRcdFx0XHRcdC8vIFN1cGVyc2VkZXMgdGhlIGZsYWdzIGZvbGRlZCBpbiBhYm92ZTogdGhlIHN0YXRlIG1hbmFnZXIgc2VlZGVkXG5cdFx0XHRcdFx0Ly8gdGhlbSBmcm9tIHRoZSBzYW1lIGRhdGFiYXNlIG9uIHJlc3RvcmUgYW5kIGhhcyBhcHBsaWVkIGV2ZXJ5XG5cdFx0XHRcdFx0Ly8gbXV0YXRpb24gc2luY2UuXG5cdFx0XHRcdFx0c3RhdHVzOiBsaXZlU3VtbWFyeS5zdGF0dXMsXG5cdFx0XHRcdFx0YWN0aXZpdHk6IGxpdmVTdW1tYXJ5LmFjdGl2aXR5LFxuXHRcdFx0XHRcdG1vZGlmaWVkVGltZTogRGF0ZS5wYXJzZShsaXZlU3VtbWFyeS5tb2RpZmllZEF0KSxcblx0XHRcdFx0XHRwcm9qZWN0OiBsaXZlU3VtbWFyeS5wcm9qZWN0XG5cdFx0XHRcdFx0XHQ/IHsgdXJpOiBVUkkucGFyc2UobGl2ZVN1bW1hcnkucHJvamVjdC51cmkpLCBkaXNwbGF5TmFtZTogbGl2ZVN1bW1hcnkucHJvamVjdC5kaXNwbGF5TmFtZSB9XG5cdFx0XHRcdFx0XHQ6IHMucHJvamVjdCxcblx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IGxpdmVXb3JraW5nRGlycyAhPT0gdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHQ/IGxpdmVXb3JraW5nRGlycy5tYXAoZCA9PiBVUkkucGFyc2UoZCkpXG5cdFx0XHRcdFx0XHQ6IHMud29ya2luZ0RpcmVjdG9yaWVzLFxuXHRcdFx0XHRcdGNoYW5nZXM6IGxpdmVTdW1tYXJ5LmNoYW5nZXMgPz8gcy5jaGFuZ2VzLFxuXHRcdFx0XHRcdGNoYW5nZXNldHM6IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUocy5zZXNzaW9uLnRvU3RyaW5nKCkpPy5jaGFuZ2VzZXRzID8/IHMuY2hhbmdlc2V0cyxcblx0XHRcdFx0XHQuLi4oX21ldGEgIT09IHVuZGVmaW5lZCA/IHsgX21ldGEgfSA6IHt9KSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBzO1xuXHRcdH0pO1xuXG5cdFx0Ly8gT3ZlcmxheSBhbnkgc2Vzc2lvbiBrbm93biB0byBzdGF0ZSBidXQgbWlzc2luZyBmcm9tIHRoZSBwcm92aWRlcnMnXG5cdFx0Ly8gYGxpc3RTZXNzaW9uc2Agc25hcHNob3QsIHNvIHJlbmRlcmVyLXNpZGUgY2FjaGVzIGRvbid0IGV2aWN0IGFcblx0XHQvLyBsaXZlL2FjdGl2ZSBzZXNzaW9uICh3aGljaCB3b3VsZCBjbG9zZSB0aGUgY2hhdCB2aWV3IGhvbGRpbmcgdGhlXG5cdFx0Ly8gaW4tZmxpZ2h0IHJlc3BvbnNlIGJ1YmJsZSkuIFR3byBjYXNlcyBuZWVkIHRoaXM6IGEgcHJvdmlkZXIgY2FuXG5cdFx0Ly8gdHJhbnNpZW50bHkgZHJvcCBhIHNlc3Npb24gKGUuZy4gYENvcGlsb3RBZ2VudC5saXN0U2Vzc2lvbnNgIHJldHVybnNcblx0XHQvLyBhbiBlbXB0eSBhcnJheSByaWdodCBhZnRlciBgc2Vzc2lvbi90dXJuQ29tcGxldGVgKSwgYW5kIGEgcHJvdmlzaW9uYWxcblx0XHQvLyBzZXNzaW9uIChjcmVhdGVkIGJ1dCBub3QgeWV0IG1hdGVyaWFsaXplZCBcdTIwMTQgc2VlIGBjcmVhdGVTZXNzaW9uYCkgdGhhdFxuXHRcdC8vIGhhcyBoYWQgYW55IHR1cm4gYWN0aXZpdHkgbXVzdCBzdGF5IHZpc2libGUgdW50aWwgaXQgbWF0ZXJpYWxpemVzLlxuXHRcdC8vIElkbGUgcHJvdmlzaW9uYWwgc2Vzc2lvbnMgYXJlIGRlbGliZXJhdGVseSAqbm90KiBvdmVybGFpZCBzbyB0aGVcblx0XHQvLyBuZXctc2Vzc2lvbiBjb21wb3NlcidzIGVhZ2VybHktY3JlYXRlZCBzZXNzaW9uIGRvZXNuJ3QgbGVhayBpbnRvIHRoZVxuXHRcdC8vIGxpc3QgYmVmb3JlIGl0cyBmaXJzdCBtZXNzYWdlICgjMzIxMjY5KS5cblx0XHRjb25zdCBrbm93biA9IG5ldyBTZXQod2l0aFN0YXR1cy5tYXAocyA9PiBzLnNlc3Npb24udG9TdHJpbmcoKSkpO1xuXHRcdGNvbnN0IGFkZGl0aW9uczogSUFnZW50U2Vzc2lvbk1ldGFkYXRhW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHN1bW1hcnkgb2YgdGhpcy5fc3RhdGVNYW5hZ2VyLmdldE92ZXJsYXlTZXNzaW9uU3VtbWFyaWVzKCkpIHtcblx0XHRcdGlmIChrbm93bi5oYXMoc3VtbWFyeS5yZXNvdXJjZSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBTdWJhZ2VudCBzZXNzaW9ucyBhcmUgbmVzdGVkIHVuZGVyIHRoZWlyIHBhcmVudCBhbmQgbXVzdCBuZXZlclxuXHRcdFx0Ly8gc3VyZmFjZSBhcyB0b3AtbGV2ZWwgZW50cmllcyBpbiB0aGUgc2Vzc2lvbiBsaXN0LlxuXHRcdFx0aWYgKGlzU3ViYWdlbnRTZXNzaW9uKHN1bW1hcnkucmVzb3VyY2UpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdW1tYXJ5V29ya2luZ0RpcnMgPSBzdW1tYXJ5LndvcmtpbmdEaXJlY3Rvcmllcztcblx0XHRcdGFkZGl0aW9ucy5wdXNoKHtcblx0XHRcdFx0c2Vzc2lvbjogVVJJLnBhcnNlKHN1bW1hcnkucmVzb3VyY2UpLFxuXHRcdFx0XHRzdGFydFRpbWU6IERhdGUucGFyc2Uoc3VtbWFyeS5jcmVhdGVkQXQpLFxuXHRcdFx0XHRtb2RpZmllZFRpbWU6IERhdGUucGFyc2Uoc3VtbWFyeS5tb2RpZmllZEF0KSxcblx0XHRcdFx0c3VtbWFyeTogc3VtbWFyeS50aXRsZSxcblx0XHRcdFx0c3RhdHVzOiBzdW1tYXJ5LnN0YXR1cyxcblx0XHRcdFx0YWN0aXZpdHk6IHN1bW1hcnkuYWN0aXZpdHksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcmllczogc3VtbWFyeVdvcmtpbmdEaXJzPy5tYXAoZCA9PiBVUkkucGFyc2UoZCkpLFxuXHRcdFx0XHQuLi4oc3VtbWFyeS5wcm9qZWN0ID8geyBwcm9qZWN0OiB7IHVyaTogVVJJLnBhcnNlKHN1bW1hcnkucHJvamVjdC51cmkpLCBkaXNwbGF5TmFtZTogc3VtbWFyeS5wcm9qZWN0LmRpc3BsYXlOYW1lIH0gfSA6IHt9KSxcblx0XHRcdFx0Y2hhbmdlczogc3VtbWFyeS5jaGFuZ2VzLFxuXHRcdFx0XHQvLyBUaGlzIG92ZXJsYXkgcGF0aCBuZXZlciBvcGVucyB0aGUgc2Vzc2lvbiBkYXRhYmFzZSAodW5saWtlIHRoZVxuXHRcdFx0XHQvLyBwcm92aWRlci1yZXR1cm5lZCBzZXNzaW9ucyBoYW5kbGVkIGFib3ZlKSwgc28gY2FycnkgdGhlXG5cdFx0XHRcdC8vIGluLW1lbW9yeSBgc3VtbWFyeS5fbWV0YWAgZGlyZWN0bHkuIEl0IGhvbGRzIHRoZSBsaXZlIHN0YXRlXG5cdFx0XHRcdC8vIChlLmcuIHRoZSBHaXRIdWIgc3RhdGUgcHVibGlzaGVkIHdoZW4gYSBQUiBpcyBjcmVhdGVkKSwgc28gYVxuXHRcdFx0XHQvLyBmcmVzaGx5LWNyZWF0ZWQgc2Vzc2lvbiB0aGF0IHRoZSBwcm92aWRlciB0cmFuc2llbnRseSBvbWl0c1xuXHRcdFx0XHQvLyBzdGlsbCByZXBvcnRzIGl0IGhlcmUuXG5cdFx0XHRcdC4uLihzdW1tYXJ5Ll9tZXRhICE9PSB1bmRlZmluZWQgPyB7IF9tZXRhOiBzdW1tYXJ5Ll9tZXRhIH0gOiB7fSksXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0Y29uc3QgY29tYmluZWQgPSBhZGRpdGlvbnMubGVuZ3RoID4gMCA/IFsuLi53aXRoU3RhdHVzLCAuLi5hZGRpdGlvbnNdIDogd2l0aFN0YXR1cztcblx0XHRjb25zdCB2aXNpYmxlID0gY29tYmluZWQuZmlsdGVyKHNlc3Npb24gPT4gdGhpcy5fc2hvdWxkSW5jbHVkZVNlc3Npb24oc2Vzc2lvbiwgbW9kZSkpO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50U2VydmljZV0gbGlzdFNlc3Npb25zIHJldHVybmVkICR7dmlzaWJsZS5sZW5ndGh9IHNlc3Npb25zICgke2FkZGl0aW9ucy5sZW5ndGh9IHN0YXRlLW1hbmFnZXIgZmFsbGJhY2spYCk7XG5cdFx0cmV0dXJuIHZpc2libGU7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRFeHRlcm5hbFNlc3Npb25zTW9kZSgpOiBBZ2VudEhvc3RFeHRlcm5hbFNlc3Npb25zTW9kZSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFJvb3RWYWx1ZShwbGF0Zm9ybVJvb3RTY2hlbWEsIEFnZW50SG9zdFNob3dFeHRlcm5hbFNlc3Npb25zQ29uZmlnS2V5KSA/PyBBZ2VudEhvc3RFeHRlcm5hbFNlc3Npb25zTW9kZS5MYXN0N0RheXM7XG5cdH1cblxuXHRwcml2YXRlIF9zaG91bGRJbmNsdWRlU2Vzc2lvbihzZXNzaW9uOiBJQWdlbnRTZXNzaW9uTWV0YWRhdGEsIG1vZGUgPSB0aGlzLl9nZXRFeHRlcm5hbFNlc3Npb25zTW9kZSgpKTogYm9vbGVhbiB7XG5cdFx0Ly8gV2hpbGUgbWlncmF0aW9uIGlzIG9mZiwgdW4tYWRvcHRlZCBhZG9wdGFibGUtbGVnYWN5IHNlc3Npb25zIGJlbG9uZyB0byB0aGUgZXh0ZW5zaW9uLWhvc3QgcHJvdmlkZXIgXHUyMDE0IGV4Y2x1ZGUgc28gYSByZWZyZXNoIGNhbm5vdCByZS1zdXJmYWNlIGFuIHVub3BlbmFibGUgcm93LlxuXHRcdGlmIChyZWFkU2Vzc2lvbkVoY2xpQWRvcHRhYmxlKHNlc3Npb24uX21ldGEpICYmICF0aGlzLl9pc01pZ3JhdGVMZWdhY3lFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKCFyZWFkU2Vzc2lvbkV4dGVybmFsKHNlc3Npb24uX21ldGEpIHx8IHJlYWRTZXNzaW9uRWhjbGlBZG9wdGFibGUoc2Vzc2lvbi5fbWV0YSkgfHwgdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uLnNlc3Npb24udG9TdHJpbmcoKSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRzd2l0Y2ggKG1vZGUpIHtcblx0XHRcdGNhc2UgQWdlbnRIb3N0RXh0ZXJuYWxTZXNzaW9uc01vZGUuQWxsOlxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdGNhc2UgQWdlbnRIb3N0RXh0ZXJuYWxTZXNzaW9uc01vZGUuTGFzdDI0SG91cnM6XG5cdFx0XHRcdHJldHVybiBzZXNzaW9uLm1vZGlmaWVkVGltZSA+PSB0aGlzLl9ub3coKSAtIDI0ICogNjAgKiA2MCAqIDEwMDA7XG5cdFx0XHRjYXNlIEFnZW50SG9zdEV4dGVybmFsU2Vzc2lvbnNNb2RlLkxhc3Q3RGF5czpcblx0XHRcdFx0cmV0dXJuIHNlc3Npb24ubW9kaWZpZWRUaW1lID49IHRoaXMuX25vdygpIC0gNyAqIDI0ICogNjAgKiA2MCAqIDEwMDA7XG5cdFx0XHRjYXNlIEFnZW50SG9zdEV4dGVybmFsU2Vzc2lvbnNNb2RlLk5vbmU6XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU3RhZ2UtMSB2YWxpZGF0aW9uIHN1cmZhY2UgZm9yIHRoZSBzZXNzaW9uIFVSSXMgY3VycmVudGx5IGhlbGQgYnkgdGhlXG5cdCAqIG9yY2hlc3RyYXRvci1vd25lZCB7QGxpbmsgQWdlbnRTZXNzaW9uUmVnaXN0cnl9LlxuXHQgKi9cblx0YXN5bmMgZ2V0UmVnaXN0ZXJlZFNlc3Npb25zKCk6IFByb21pc2U8VVJJW10+IHtcblx0XHRyZXR1cm4gKGF3YWl0IHRoaXMuX2xpc3RSZWdpc3RlcmVkU2Vzc2lvbnMoKSkubWFwKHMgPT4gcy5zZXNzaW9uKTtcblx0fVxuXG5cdC8qKiBUZXN0IHN1cmZhY2UgZm9yIHRoZSBkdXJhYmxlIHBlci1wcm92aWRlciBkaXNjb3ZlcnkgbWFya2VyLiAqL1xuXHRhc3luYyBpc1Byb3ZpZGVyUmVnaXN0cnlCYWNrZmlsbGVkKHByb3ZpZGVyOiBBZ2VudFByb3ZpZGVyKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nlc3Npb25SZWdpc3RyeS5pc1Byb3ZpZGVyQmFja2ZpbGxlZChwcm92aWRlcik7XG5cdH1cblxuXHQvKipcblx0ICogVGVzdCBzdXJmYWNlIGZvciB0aGUgbGVnYWN5IGdsb2JhbCBiYWNrZmlsbCBtYXJrZXIuIE5ldmVyIHdyaXR0ZW4gYnkgdGhlXG5cdCAqIHBlci1wcm92aWRlciBkaXNjb3ZlcnkgXHUyMDE0IHNlZSB0aGUgcmVtb3ZhbCBvZiBhdXRvbWF0aWMgbWlycm9yaW5nIGluXG5cdCAqIHtAbGluayBBZ2VudFNlc3Npb25SZWdpc3RyeX0ncyBjbGFzcyBkb2MgY29tbWVudC5cblx0ICovXG5cdGFzeW5jIGlzTGVnYWN5UmVnaXN0cnlCYWNrZmlsbGVkKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uUmVnaXN0cnkuaXNCYWNrZmlsbGVkKCk7XG5cdH1cblxuXHQvKiogU2Vzc2lvbiBrZXlzIGFscmVhZHkgYW5ub3VuY2VkIHRoaXMgQUggbGlmZXRpbWUsIHNvIHByb3ZpZGVyIHNpZ25hbHMgZG8gbm90IHJlLWFubm91bmNlIHRoZW0uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Fubm91bmNlZFN1cmZhY2VkS2V5cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9icm9hZGNhc3RFeHRlcm5hbFNlc3Npb25zID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgX3Nlc3Npb25MaXN0UmVjb25jaWxpYXRpb24gPSBQcm9taXNlLnJlc29sdmUoKTtcblxuXHQvKiogVHJhY2tzIHRoZSBtaWdyYXRlLWxlZ2FjeSBzZXR0aW5nIHNvIHRoZSBjb25maWcgbGlzdGVuZXIgYWN0cyBvbmx5IG9uIHRyYW5zaXRpb25zLiAqL1xuXHRwcml2YXRlIF9sYXN0TWlncmF0ZUxlZ2FjeUVuYWJsZWQgPSBmYWxzZTtcblxuXHRwcml2YXRlIF9pc01pZ3JhdGVMZWdhY3lFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRSb290VmFsdWUocGxhdGZvcm1Sb290U2NoZW1hLCBBZ2VudEhvc3RNaWdyYXRlTGVnYWN5Q29waWxvdENsaUVuYWJsZWRDb25maWdLZXkpID09PSB0cnVlO1xuXHR9XG5cblx0LyoqIFJldHJhY3RzIHVuLW9wZW5lZCBhZG9wdGFibGUtbGVnYWN5IGVudHJpZXMgd2hlbiBtaWdyYXRpb24gaXMgdHVybmVkIG9mZiAoZGVsZXRlcyBubyBkYXRhKS4gKi9cblx0cHJpdmF0ZSBfb25NaWdyYXRlTGVnYWN5U2V0dGluZ0NoYW5nZWQoKTogdm9pZCB7XG5cdFx0Y29uc3QgZW5hYmxlZCA9IHRoaXMuX2lzTWlncmF0ZUxlZ2FjeUVuYWJsZWQoKTtcblx0XHRpZiAoZW5hYmxlZCA9PT0gdGhpcy5fbGFzdE1pZ3JhdGVMZWdhY3lFbmFibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2xhc3RNaWdyYXRlTGVnYWN5RW5hYmxlZCA9IGVuYWJsZWQ7XG5cdFx0aWYgKGVuYWJsZWQpIHtcblx0XHRcdHJldHVybjsgLy8gdHVybmluZyBvbiByZS1zdXJmYWNlcyB0aHJvdWdoIHRoZSBub3JtYWwgZGlzY292ZXJ5IC8gbGlzdCBwYXRoXG5cdFx0fVxuXHRcdGZvciAoY29uc3Qga2V5IG9mIFsuLi50aGlzLl9hbm5vdW5jZWRTdXJmYWNlZEtleXNdKSB7XG5cdFx0XHRpZiAodGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShrZXkpKSB7XG5cdFx0XHRcdGNvbnRpbnVlOyAvLyBhbHJlYWR5IGFkb3B0ZWQgLyByZXN0b3JlZCBcdTIwMTQga2VlcCBpdFxuXHRcdFx0fVxuXHRcdFx0aWYgKCFyZWFkU2Vzc2lvbkVoY2xpQWRvcHRhYmxlKHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTdXJmYWNlZFNlc3Npb25TdW1tYXJ5KGtleSk/Ll9tZXRhKSkge1xuXHRcdFx0XHRjb250aW51ZTsgLy8gb25seSByZXRyYWN0IGFkb3B0YWJsZS1sZWdhY3kgZW50cmllcywgbmV2ZXIgbmF0aXZlIC8gZXh0ZXJuYWwgb25lc1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fYW5ub3VuY2VkU3VyZmFjZWRLZXlzLmRlbGV0ZShrZXkpO1xuXHRcdFx0dGhpcy5fYnJvYWRjYXN0RXh0ZXJuYWxTZXNzaW9ucy5kZWxldGUoa2V5KTtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5yZXRyYWN0U3VyZmFjZWRTZXNzaW9uKGtleSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcXVldWVTZXNzaW9uTGlzdFJlY29uY2lsaWF0aW9uKHByZXZpb3VzTW9kZT86IEFnZW50SG9zdEV4dGVybmFsU2Vzc2lvbnNNb2RlKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Vzc2lvbkxpc3RSZWNvbmNpbGlhdGlvbiA9IHRoaXMuX3Nlc3Npb25MaXN0UmVjb25jaWxpYXRpb25cblx0XHRcdC50aGVuKCgpID0+IHRoaXMuX3JlY29uY2lsZUV4dGVybmFsU2Vzc2lvbnMocHJldmlvdXNNb2RlKSlcblx0XHRcdC5jYXRjaChlcnJvciA9PiB0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1tBZ2VudFNlcnZpY2VdIEV4dGVybmFsIHNlc3Npb24gcmVjb25jaWxpYXRpb24gZmFpbGVkJywgZXJyb3IpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlY29uY2lsZUV4dGVybmFsU2Vzc2lvbnMocHJldmlvdXNNb2RlPzogQWdlbnRIb3N0RXh0ZXJuYWxTZXNzaW9uc01vZGUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcmV2aW91c2x5QnJvYWRjYXN0ID0gbmV3IFNldCh0aGlzLl9icm9hZGNhc3RFeHRlcm5hbFNlc3Npb25zKTtcblx0XHRpZiAocHJldmlvdXNNb2RlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBhd2FpdCB0aGlzLmxpc3RTZXNzaW9ucyhwcmV2aW91c01vZGUpKSB7XG5cdFx0XHRcdGlmIChyZWFkU2Vzc2lvbkV4dGVybmFsKHNlc3Npb24uX21ldGEpKSB7XG5cdFx0XHRcdFx0cHJldmlvdXNseUJyb2FkY2FzdC5hZGQoc2Vzc2lvbi5zZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGxpc3RlZCA9IGF3YWl0IHRoaXMubGlzdFNlc3Npb25zKCk7XG5cdFx0Y29uc3QgdmlzaWJsZSA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgbWV0YWRhdGEgb2YgbGlzdGVkKSB7XG5cdFx0XHRpZiAoIXJlYWRTZXNzaW9uRXh0ZXJuYWwobWV0YWRhdGEuX21ldGEpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qga2V5ID0gbWV0YWRhdGEuc2Vzc2lvbi50b1N0cmluZygpO1xuXHRcdFx0dmlzaWJsZS5hZGQoa2V5KTtcblx0XHRcdGlmICghcHJldmlvdXNseUJyb2FkY2FzdC5oYXMoa2V5KSAmJiAhdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShrZXkpKSB7XG5cdFx0XHRcdGNvbnN0IHByb3ZpZGVyID0gQWdlbnRTZXNzaW9uLnByb3ZpZGVyKG1ldGFkYXRhLnNlc3Npb24pO1xuXHRcdFx0XHRpZiAocHJvdmlkZXIpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9hbm5vdW5jZVN1cmZhY2VkU2Vzc2lvbihtZXRhZGF0YSwgcHJvdmlkZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qga2V5IG9mIHByZXZpb3VzbHlCcm9hZGNhc3QpIHtcblx0XHRcdGlmICghdmlzaWJsZS5oYXMoa2V5KSAmJiAhdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShrZXkpKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5yZXRyYWN0U3VyZmFjZWRTZXNzaW9uKGtleSk7XG5cdFx0XHRcdHRoaXMuX2Fubm91bmNlZFN1cmZhY2VkS2V5cy5kZWxldGUoa2V5KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fYnJvYWRjYXN0RXh0ZXJuYWxTZXNzaW9ucy5jbGVhcigpO1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIHZpc2libGUpIHtcblx0XHRcdHRoaXMuX2Jyb2FkY2FzdEV4dGVybmFsU2Vzc2lvbnMuYWRkKGtleSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYW5ub3VuY2VTdXJmYWNlZFNlc3Npb24obWV0YTogSUFnZW50U2Vzc2lvbk1ldGFkYXRhLCBwcm92aWRlcjogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qga2V5ID0gbWV0YS5zZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0aWYgKCF0aGlzLl9zaG91bGRJbmNsdWRlU2Vzc2lvbihtZXRhKSB8fCB0aGlzLl9hbm5vdW5jZWRTdXJmYWNlZEtleXMuaGFzKGtleSkgfHwgdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShrZXkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2Fubm91bmNlZFN1cmZhY2VkS2V5cy5hZGQoa2V5KTtcblx0XHR0cnkge1xuXHRcdFx0aWYgKGF3YWl0IHRoaXMuX3Nlc3Npb25SZWdpc3RyeS5pc1RvbWJzdG9uZWQobWV0YS5zZXNzaW9uKSkge1xuXHRcdFx0XHR0aGlzLl9hbm5vdW5jZWRTdXJmYWNlZEtleXMuZGVsZXRlKGtleSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIFRoZSBtaWdyYXRlIHNldHRpbmcgbWF5IGhhdmUgZmxpcHBlZCBvZmYgZHVyaW5nIHRoZSBhd2FpdCBhYm92ZTsgcmUtY2hlY2sgc28gYW4gYWRvcHRhYmxlLWxlZ2FjeSBzZXNzaW9uIGlzIG5ldmVyIHN1cmZhY2VkIHdoaWxlIG1pZ3JhdGlvbiBpcyBvZmYuXG5cdFx0XHRpZiAoIXRoaXMuX3Nob3VsZEluY2x1ZGVTZXNzaW9uKG1ldGEpKSB7XG5cdFx0XHRcdHRoaXMuX2Fubm91bmNlZFN1cmZhY2VkS2V5cy5kZWxldGUoa2V5KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmFubm91bmNlU3VyZmFjZWRTZXNzaW9uKHRoaXMuX3N1cmZhY2VkU2Vzc2lvblN1bW1hcnkobWV0YSwgcHJvdmlkZXIpKTtcblx0XHRcdGlmIChyZWFkU2Vzc2lvbkV4dGVybmFsKG1ldGEuX21ldGEpKSB7XG5cdFx0XHRcdHRoaXMuX2Jyb2FkY2FzdEV4dGVybmFsU2Vzc2lvbnMuYWRkKGtleSk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9hbm5vdW5jZWRTdXJmYWNlZEtleXMuZGVsZXRlKGtleSk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFN5bnRoZXNpemVzIHRoZSBtaW5pbWFsIHtAbGluayBTZXNzaW9uU3VtbWFyeX0gZm9yIGEgcHJvdmlkZXIgc2Vzc2lvbiBzdXJmYWNlZCBvdXRzaWRlIHRoZSBub3JtYWwgbGlzdCByZXNwb25zZS4gKi9cblx0cHJpdmF0ZSBfc3VyZmFjZWRTZXNzaW9uU3VtbWFyeShtZXRhOiBJQWdlbnRTZXNzaW9uTWV0YWRhdGEsIHByb3ZpZGVyOiBzdHJpbmcpOiBTZXNzaW9uU3VtbWFyeSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc291cmNlOiBtZXRhLnNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdHByb3ZpZGVyLFxuXHRcdFx0dGl0bGU6IG1ldGEuc3VtbWFyeSA/PyAnJyxcblx0XHRcdC8vIFN1cmZhY2VkIGxlZ2FjeSBzZXNzaW9ucyBwcmVkYXRlIGFnZW50LWhvc3QgcmVhZCBvd25lcnNoaXAsIHdoaWNoIGhhc1xuXHRcdFx0Ly8gbm8gcGVyLXNlc3Npb24gcmVhZCBmbGFnIGZvciB0aGVtIHlldC4gRGVmYXVsdCB0aGVtIHRvIHJlYWQ6IHRoZVxuXHRcdFx0Ly8gY2xpZW50IHRydXN0cyB0aGUgcHJvdmlkZXIncyByZWFkIHN0YXRlIG9uY2UgaXQgb3ducyBpdCwgc28gYW5cblx0XHRcdC8vIHVuZmxhZ2dlZCBzdW1tYXJ5IHdvdWxkIG90aGVyd2lzZSBmbGlwIGV2ZXJ5IHByZXZpb3VzbHktc2VlbiBzZXNzaW9uXG5cdFx0XHQvLyB0byB1bnJlYWQgdGhlIG1vbWVudCBtaWdyYXRpb24gaXMgdHVybmVkIG9uLlxuXHRcdFx0c3RhdHVzOiB3aXRoU2Vzc2lvblN0YXR1c0ZsYWcobWV0YS5zdGF0dXMgPz8gU2Vzc2lvblN0YXR1cy5JZGxlLCBTZXNzaW9uU3RhdHVzLklzUmVhZCwgdHJ1ZSksXG5cdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKG1ldGEuc3RhcnRUaW1lKS50b0lTT1N0cmluZygpLFxuXHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUobWV0YS5tb2RpZmllZFRpbWUpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHQuLi4obWV0YS5wcm9qZWN0ID8geyBwcm9qZWN0OiB7IHVyaTogbWV0YS5wcm9qZWN0LnVyaS50b1N0cmluZygpLCBkaXNwbGF5TmFtZTogbWV0YS5wcm9qZWN0LmRpc3BsYXlOYW1lIH0gfSA6IHt9KSxcblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogbWV0YS53b3JraW5nRGlyZWN0b3JpZXM/Lm1hcChkID0+IGQudG9TdHJpbmcoKSksXG5cdFx0XHRfbWV0YTogbWV0YS5fbWV0YSxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlU2Vzc2lvbihjb25maWc/OiBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnKTogUHJvbWlzZTxVUkk+IHtcblx0XHRjb25zdCBwcm92aWRlcklkID0gY29uZmlnPy5wcm92aWRlciA/PyB0aGlzLl9kZWZhdWx0UHJvdmlkZXI7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBwcm92aWRlcklkID8gdGhpcy5fcHJvdmlkZXJzLmdldChwcm92aWRlcklkKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIGFnZW50IHByb3ZpZGVyIHJlZ2lzdGVyZWQgZm9yOiAke3Byb3ZpZGVySWQgPz8gJyhub25lKSd9YCk7XG5cdFx0fVxuXHRcdGlmIChjb25maWc/LnNlc3Npb24pIHtcblx0XHRcdHRoaXMuX2NhbmNlbFBlbmRpbmdTZXNzaW9uR2MoY29uZmlnLnNlc3Npb24pO1xuXHRcdFx0dGhpcy5fY2FuY2VsUGVuZGluZ1Nlc3Npb25SZWxlYXNlKGNvbmZpZy5zZXNzaW9uKTtcblx0XHR9XG5cblx0XHQvLyBDYXBhYmlsaXR5IGdhdGU6IG9ubHkgYSBwcm92aWRlciB0aGF0IGFkdmVydGlzZXNcblx0XHQvLyBgbXVsdGlwbGVXb3JraW5nRGlyZWN0b3JpZXNgIGFjY2VwdHMgbW9yZSB0aGFuIG9uZSB3b3JraW5nIGRpcmVjdG9yeS5cblx0XHQvLyBGb3IgYSBwcm92aWRlciB0aGF0IGRvZXMgbm90LCBrZWVwIHRoZSBwcmltYXJ5IChpbmRleCAwID0gdGhlIHByb2Nlc3Ncblx0XHQvLyByb290KSBhbmQgZHJvcCB0aGUgcmVzdCBzbyB0aGUgcGx1cmFsIHBsdW1iaW5nIGNhbm5vdCBmb3J3YXJkIGFuXG5cdFx0Ly8gdW5zdXBwb3J0ZWQgc2V0IFx1MjAxNCB0aGUgYWdlbnQgc3RpbGwgbGF1bmNoZXMgaW4gdGhlIHVzZXIncyBjaG9zZW4gZm9sZGVyLlxuXHRcdC8vIFRoaXMgaXMgYSBjcmVhdGUtdGltZS1vbmx5IGdyYW50OiBydW50aW1lIGFkZC9yZW1vdmUgb2YgZGlyZWN0b3JpZXMgaXNcblx0XHQvLyBzdGlsbCByZWplY3RlZCBpbiB0aGUgZGlzcGF0Y2ggcGF0aCwgc28gYSBwcm92aWRlciB0aGF0IG9wdHMgaW4gYWNjZXB0c1xuXHRcdC8vIHRoZSBzZXQgYXQgY3JlYXRpb24gYnV0IGl0cyBtZW1iZXJzIHJlbWFpbiBmaXhlZCBmb3IgdGhlIHNlc3Npb24uXG5cdFx0aWYgKGNvbmZpZz8ud29ya2luZ0RpcmVjdG9yaWVzICYmIGNvbmZpZy53b3JraW5nRGlyZWN0b3JpZXMubGVuZ3RoID4gMSkge1xuXHRcdFx0Y29uc3Qgc3VwcG9ydHNNdWx0aXBsZSA9ICEhcHJvdmlkZXIuZ2V0RGVzY3JpcHRvcigpLmNhcGFiaWxpdGllcz8ubXVsdGlwbGVXb3JraW5nRGlyZWN0b3JpZXM7XG5cdFx0XHRpZiAoIXN1cHBvcnRzTXVsdGlwbGUpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBQcm92aWRlciAnJHtwcm92aWRlcklkfScgZG9lcyBub3QgYWR2ZXJ0aXNlIG11bHRpcGxlV29ya2luZ0RpcmVjdG9yaWVzOyB0cnVuY2F0aW5nICR7Y29uZmlnLndvcmtpbmdEaXJlY3Rvcmllcy5sZW5ndGh9IHdvcmtpbmcgZGlyZWN0b3JpZXMgdG8gMS5gKTtcblx0XHRcdFx0Y29uZmlnID0geyAuLi5jb25maWcsIHdvcmtpbmdEaXJlY3RvcmllczogW2NvbmZpZy53b3JraW5nRGlyZWN0b3JpZXNbMF1dIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiBmb3JraW5nLCBidWlsZCB0aGUgb2xkXHUyMTkybmV3IHR1cm4gSUQgbWFwcGluZyBiZWZvcmUgY3JlYXRpbmcgdGhlXG5cdFx0Ly8gc2Vzc2lvbiBzbyB0aGUgYWdlbnQgY2FuIHVzZSBpdCB0byByZW1hcCBwZXItdHVybiBkYXRhLiBJZiB0aGVcblx0XHQvLyBzb3VyY2UgaGFzIG5vIHR1cm5zIHRvIGNvcHkgKGUuZy4gYSBzdGlsbC1wcm92aXNpb25hbCBzZXNzaW9uKSwgYVxuXHRcdC8vIFwiZm9ya1wiIGlzIGluZGlzdGluZ3Vpc2hhYmxlIGZyb20gYSBmcmVzaCBzZXNzaW9uLCBzbyB3ZSBkcm9wIHRoZVxuXHRcdC8vIGZvcmsgcGFyYW1ldGVyIGFuZCBmYWxsIHRocm91Z2ggdG8gdGhlIHJlZ3VsYXIgY3JlYXRlIHBhdGguXG5cdFx0aWYgKGNvbmZpZz8uZm9yaykge1xuXHRcdFx0Y29uc3Qgc291cmNlU3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGNvbmZpZy5mb3JrLnNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0XHRjb25zdCBzb3VyY2VUdXJucyA9IHNvdXJjZVN0YXRlPy50dXJucy5zbGljZSgwLCBjb25maWcuZm9yay50dXJuSW5kZXggKyAxKSA/PyBbXTtcblx0XHRcdGlmIChzb3VyY2VUdXJucy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0Y29uZmlnID0geyAuLi5jb25maWcsIGZvcms6IHVuZGVmaW5lZCB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgdHVybklkTWFwcGluZyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0XHRcdGZvciAoY29uc3QgdCBvZiBzb3VyY2VUdXJucykge1xuXHRcdFx0XHRcdHR1cm5JZE1hcHBpbmcuc2V0KHQuaWQsIGdlbmVyYXRlVXVpZCgpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBUaGUgU0RLIGZvcmsgYm91bmRhcnkgbXVzdCBiZSBhIGNvbmNyZXRlIChTREstYmFja2VkKSB0dXJuLlxuXHRcdFx0XHQvLyBXaGVuIHRoZSBjbGllbnQgZm9ya2VkIGF0IGEgaG9zdC1pbmplY3RlZCBsb2NhbCB0dXJuXG5cdFx0XHRcdC8vIChgL3JlbmFtZWAgLyBgIWNvbW1hbmRgKSwgcmVkaXJlY3QgdGhlIGFnZW50IHRvIHRoZSBwcmVjZWRpbmdcblx0XHRcdFx0Ly8gY29uY3JldGUgdHVybiB3aGlsZSBzdGlsbCBzZWVkaW5nIHRoZSBsb2NhbCB0dXJucyB1cCB0byB0aGVcblx0XHRcdFx0Ly8gZm9yayBwb2ludCBpbnRvIHRoZSBuZXcgc2Vzc2lvbidzIHByb3RvY29sIHN0YXRlIGJlbG93LlxuXHRcdFx0XHRjb25zdCBjb25jcmV0ZUZvcmtUdXJuSWQgPSB0aGlzLl9sb2NhbFR1cm5zLnJlc29sdmVDb25jcmV0ZVR1cm5JZChidWlsZERlZmF1bHRDaGF0VXJpKGNvbmZpZy5mb3JrLnNlc3Npb24pLnRvU3RyaW5nKCksIGNvbmZpZy5mb3JrLnR1cm5JZCk7XG5cdFx0XHRcdGNvbmZpZyA9IHtcblx0XHRcdFx0XHQuLi5jb25maWcsXG5cdFx0XHRcdFx0Zm9yazoge1xuXHRcdFx0XHRcdFx0Li4uY29uZmlnLmZvcmssXG5cdFx0XHRcdFx0XHRjaGF0OiBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShjb25maWcuZm9yay5zZXNzaW9uKSksXG5cdFx0XHRcdFx0XHR0dXJuSWRNYXBwaW5nLFxuXHRcdFx0XHRcdFx0Li4uKGNvbmNyZXRlRm9ya1R1cm5JZCAhPT0gdW5kZWZpbmVkID8geyB0dXJuSWQ6IGNvbmNyZXRlRm9ya1R1cm5JZCB9IDoge30pLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gV2hlbiBpbXBvcnRpbmcgYSBjb252ZXJzYXRpb24sIGFzc2lnbiBmcmVzaCBVVUlEIHR1cm4gaWRzIHVwIGZyb250IHNvXG5cdFx0Ly8gdGhlIHByb3ZpZGVyIHNlZWRzIGFuIGV2ZW50IGxvZyB3aG9zZSBpZHMgbWF0Y2ggdGhlIHByb3RvY29sIHR1cm5zIHdlXG5cdFx0Ly8gc2VlZCBiZWxvdyBcdTIwMTQga2VlcGluZyBlZGl0IC8gZm9yayAvIHRydW5jYXRlIGFkZHJlc3NhYmxlIGF0IHRoZSBTREtcblx0XHQvLyBib3VuZGFyeS5cblx0XHRpZiAoY29uZmlnPy5pbXBvcnRDb252ZXJzYXRpb24pIHtcblx0XHRcdGNvbnN0IGltcG9ydGVkVHVybnMgPSBjb25maWcuaW1wb3J0Q29udmVyc2F0aW9uLnR1cm5zLm1hcCh0ID0+ICh7IC4uLnQsIGlkOiBnZW5lcmF0ZVV1aWQoKSB9KSk7XG5cdFx0XHRjb25maWcgPSB7IC4uLmNvbmZpZywgaW1wb3J0Q29udmVyc2F0aW9uOiB7IC4uLmNvbmZpZy5pbXBvcnRDb252ZXJzYXRpb24sIHR1cm5zOiBpbXBvcnRlZFR1cm5zIH0gfTtcblx0XHR9XG5cblx0XHQvLyBSZXNvbHZlIGhvc3Qtb3duZWQgaXNvbGF0aW9uIGJlZm9yZSBwcm92aWRlciBjcmVhdGlvbi4gUHJvdmlkZXJzIHN1Y2ggYXNcblx0XHQvLyBDb2RleCBtYXkgc2NoZWR1bGUgZWFnZXIgcHJld2FybWluZyBmcm9tIGNyZWF0ZVNlc3Npb247IG1hcmtpbmcgYVxuXHRcdC8vIGNsaWVudC1jaG9zZW4gd29ya3RyZWUgc2Vzc2lvbiBwZW5kaW5nIGZpcnN0IHByZXZlbnRzIHRoYXQgcHJld2FybSBmcm9tXG5cdFx0Ly8gbWF0ZXJpYWxpemluZyBpbiB0aGUgcGlja2VkIGZvbGRlciBiZWZvcmUgdGhlIGhvc3QgY3JlYXRlcyB0aGUgd29ya3RyZWUuXG5cdFx0Y29uc3QgaW5pdGlhbGl6ZVNpZGVFZmZlY3RzID0gdGhpcy5fc2lkZUVmZmVjdHMuaW5pdGlhbGl6ZSgpO1xuXHRcdGNvbnN0IHNlc3Npb25Db25maWcgPSBhd2FpdCB0aGlzLl9yZXNvbHZlQ3JlYXRlZFNlc3Npb25Db25maWcocHJvdmlkZXIsIGNvbmZpZyk7XG5cdFx0Y29uc3QgZGVmZXJXb3JrdHJlZUNyZWF0aW9uID0gc2Vzc2lvbkNvbmZpZz8udmFsdWVzPy5bU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dID09PSAnd29ya3RyZWUnICYmICFjb25maWc/LmZvcmsgJiYgIWNvbmZpZz8uaW1wb3J0Q29udmVyc2F0aW9uO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50U2VydmljZV0gY3JlYXRlU2Vzc2lvbjogaW5pdGlhbGl6aW5nIGF1dG8tYXBwcm92ZXIgYW5kIGNyZWF0aW5nIHNlc3Npb24uLi5gKTtcblx0XHRjb25zdCBbLCBjcmVhdGVkXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGluaXRpYWxpemVTaWRlRWZmZWN0cyxcblx0XHRcdHRoaXMuX2NyZWF0ZVByb3ZpZGVyU2Vzc2lvbihwcm92aWRlciwgY29uZmlnLCBkZWZlcldvcmt0cmVlQ3JlYXRpb24pLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVkLnNlc3Npb247XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50U2VydmljZV0gY3JlYXRlU2Vzc2lvbjogaW5pdGlhbGl6YXRpb24gY29tcGxldGVgKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmV0cnlSZWdpc3RyeU11dGF0aW9uKFxuXHRcdFx0XHQoKSA9PiB0aGlzLl9zZXNzaW9uUmVnaXN0cnkucmVnaXN0ZXIoc2Vzc2lvbiwgeyBwcm92aWRlcjogcHJvdmlkZXIuaWQsIHN0YXJ0VGltZTogRGF0ZS5ub3coKSwgc291cmNlOiAnZXhwbGljaXQnIH0sIHsgY2hlY2tUb21ic3RvbmU6IGZhbHNlIH0pLFxuXHRcdFx0XHRgcmVnaXN0cmF0aW9uIGZvciAke3Nlc3Npb24udG9TdHJpbmcoKX1gLFxuXHRcdFx0KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3JvbGxiYWNrUHJvdmlkZXJTZXNzaW9uKHByb3ZpZGVyLCBzZXNzaW9uKTtcblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cblx0XHQvLyBDYW5jZWwgYW55IHBlbmRpbmcgR0MgYXJtZWQgZm9yIHRoaXMgVVJJLiBBIGNsaWVudCBtYXkgYmVcblx0XHQvLyByZS1pc3N1aW5nIGBjcmVhdGVTZXNzaW9uYCBmb3IgYW4gZXhpc3RpbmcgVVJJIG1pZC1ncmFjZSAoZS5nLlxuXHRcdC8vIGR1cmluZyBhIHJlY29ubmVjdCB0aGF0IHJldHVybmVkIGBtaXNzaW5nYCk7IHdpdGhvdXQgdGhpcywgdGhlXG5cdFx0Ly8gdGltZXIgd291bGQgc3RpbGwgZmlyZSBhbmQgZGlzcG9zZSB0aGUganVzdC1yZXZpdmVkIHNlc3Npb25cblx0XHQvLyBiZWZvcmUgdGhlIGZvbGxvdy11cCBgc3Vic2NyaWJlYCBhcnJpdmVzLlxuXHRcdHRoaXMuX2NhbmNlbFBlbmRpbmdTZXNzaW9uR2Moc2Vzc2lvbik7XG5cdFx0dGhpcy5fY2FuY2VsUGVuZGluZ1Nlc3Npb25SZWxlYXNlKHNlc3Npb24pO1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50U2VydmljZV0gY3JlYXRlU2Vzc2lvbjogcHJvdmlkZXI9JHtwcm92aWRlci5pZH0gbW9kZWw9JHtjb25maWc/Lm1vZGVsPy5pZCA/PyAnKGRlZmF1bHQpJ31gKTtcblx0XHR0aGlzLl9zZXNzaW9uVG9Qcm92aWRlci5zZXQoc2Vzc2lvbi50b1N0cmluZygpLCBwcm92aWRlci5pZCk7XG5cblx0XHQvLyBSZWNvcmQgdGhpcyBzZXNzaW9uJ3Mgb3B0LWluIHNvIGEgY29sZCBTREsgZG93bmxvYWQgdHJpZ2dlcmVkIGF0XG5cdFx0Ly8gbWF0ZXJpYWxpemF0aW9uIChmaXJzdCBtZXNzYWdlKSBpcyBzdXJmYWNlZCBhcyBwcm9ncmVzcy4gVGhlIGRvd25sb2FkXG5cdFx0Ly8gaXMgcHJvdmlkZXItZ2xvYmFsLCBzbyB3ZSBvbmx5IHRyYWNrIGludGVyZXN0IGhlcmU7IGVtaXNzaW9uIGlzIGtleWVkXG5cdFx0Ly8gYnkgdGhlIGRvd25sb2FkJ3Mgb3duIGlkZW50aXR5LCBub3QgdGhpcyB0b2tlbi4gQ2xlYXJlZCBvblxuXHRcdC8vIG1hdGVyaWFsaXplL2Rpc3Bvc2UuXG5cdFx0aWYgKGNvbmZpZz8ucHJvZ3Jlc3NUb2tlbikge1xuXHRcdFx0bGV0IHNlc3Npb25zID0gdGhpcy5fZG93bmxvYWRQcm9ncmVzc0ludGVyZXN0LmdldChwcm92aWRlci5pZCk7XG5cdFx0XHRpZiAoIXNlc3Npb25zKSB7XG5cdFx0XHRcdHNlc3Npb25zID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRcdHRoaXMuX2Rvd25sb2FkUHJvZ3Jlc3NJbnRlcmVzdC5zZXQocHJvdmlkZXIuaWQsIHNlc3Npb25zKTtcblx0XHRcdH1cblx0XHRcdHNlc3Npb25zLmFkZChzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRTZXJ2aWNlXSBjcmVhdGVTZXNzaW9uIHJldHVybmVkOiAke3Nlc3Npb24udG9TdHJpbmcoKX1gKTtcblxuXHRcdC8vIFByb3Zpc2lvbmFsIHNlc3Npb25zIGRlbGliZXJhdGVseSBzdXBwcmVzcyB0aGVpciBgc2Vzc2lvbkFkZGVkYFxuXHRcdC8vIG5vdGlmaWNhdGlvbiB1bnRpbCBtYXRlcmlhbGl6YXRpb24sIHNvIGl0IGlzIHNhZmUgXHUyMDE0IGFuZCBpbXBvcnRhbnQgXHUyMDE0IHRvXG5cdFx0Ly8gY3JlYXRlIHRoZWlyIGluLW1lbW9yeSBzdGF0ZSBiZWZvcmUgYXNraW5nIHRoZSBwcm92aWRlciBmb3IgaXRzIGluaXRpYWxcblx0XHQvLyBjdXN0b21pemF0aW9uIHNuYXBzaG90LiBQcm92aWRlcnMgbWF5IHB1Ymxpc2ggaW5jcmVtZW50YWwgcGx1Z2luIGxvYWRcblx0XHQvLyB1cGRhdGVzIHdoaWxlIHJlc29sdmluZyB0aGF0IHNuYXBzaG90OyB3aXRob3V0IGEgc3RhdGUgZW50cnkgdGhvc2Vcblx0XHQvLyBhY3Rpb25zIGFyZSByZWplY3RlZCBhcyB0YXJnZXRpbmcgYW4gdW5rbm93biBzZXNzaW9uIGFuZCBjdXN0b20gYWdlbnRzXG5cdFx0Ly8gY2FuIGRpc2FwcGVhciBmcm9tIHRoZSBwaWNrZXIgcGVybWFuZW50bHkuXG5cdFx0Y29uc3QgcHJvdmlzaW9uYWxTdGF0ZSA9IGNyZWF0ZWQucHJvdmlzaW9uYWwgJiYgIWNvbmZpZz8uZm9yayAmJiAhY29uZmlnPy5pbXBvcnRDb252ZXJzYXRpb25cblx0XHRcdD8gKCgpID0+IHtcblx0XHRcdFx0Y29uc3Qgc3VtbWFyeSA9IHRoaXMuX2J1aWxkSW5pdGlhbFN1bW1hcnkocHJvdmlkZXIsIHNlc3Npb24sIGNvbmZpZywgY3JlYXRlZCwgJycpO1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHN1bW1hcnksIHsgZW1pdE5vdGlmaWNhdGlvbjogZmFsc2UgfSk7XG5cdFx0XHRcdHN0YXRlLmNvbmZpZyA9IHNlc3Npb25Db25maWc7XG5cdFx0XHRcdHN0YXRlLmFjdGl2ZUNsaWVudHMgPSBjb25maWc/LmFjdGl2ZUNsaWVudCA/IFtjb25maWcuYWN0aXZlQ2xpZW50XSA6IFtdO1xuXHRcdFx0XHRyZXR1cm4gc3RhdGU7XG5cdFx0XHR9KSgpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdC8vIFJlc29sdmUgY29uZmlnIGFuZCBzZWVkIHRoZSBpbml0aWFsIGN1c3RvbWl6YXRpb24gc2V0IGluIHBhcmFsbGVsIHNvXG5cdFx0Ly8gYm90aCBhcmUgYXZhaWxhYmxlIGJlZm9yZSB3ZSByZWdpc3RlciB0aGUgc2Vzc2lvbiBpbiB0aGUgc3RhdGVcblx0XHQvLyBtYW5hZ2VyLiBTZWVkaW5nIGBzdGF0ZS5jdXN0b21pemF0aW9uc2AgZGlyZWN0bHkgKGluc3RlYWQgb2Zcblx0XHQvLyBkaXNwYXRjaGluZyBgU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZGAgYWZ0ZXIgdGhlIGZhY3QpIG1lYW5zXG5cdFx0Ly8gdGhlIHZlcnkgZmlyc3Qgc25hcHNob3QgYSBzdWJzY3JpYmVyIHNlZXMgYWxyZWFkeSBjb250YWluc1xuXHRcdC8vIGhvc3QvZ2xvYmFsIGN1c3RvbWl6YXRpb25zIGFuZCB0aGUgY3VzdG9tIGFnZW50cyB0aGV5IGNvbnRyaWJ1dGUsXG5cdFx0Ly8gc28gdGhlIGFnZW50IHBpY2tlciBkb2Vzbid0IGhhdmUgdG8gd2FpdCBmb3IgYSBmb2xsb3ctdXAgcmVwdWJsaXNoXG5cdFx0Ly8gKGBSb290Q29uZmlnQ2hhbmdlZGAsIHBsdWdpbiByZWxvYWQsIG9yIHRoZSBmaXJzdCBtZXNzYWdlJ3Ncblx0XHQvLyBgc2V0Q2xpZW50Q3VzdG9taXphdGlvbnNgKS4gU3Vic2VxdWVudCB1cGRhdGVzIGZsb3cgdGhyb3VnaCB0aGVcblx0XHQvLyBleGlzdGluZyBgU2Vzc2lvbkN1c3RvbWl6YXRpb25zQ2hhbmdlZGAgLyBgU2Vzc2lvbkN1c3RvbWl6YXRpb25VcGRhdGVkYFxuXHRcdC8vIGFjdGlvbnMgcHVibGlzaGVkIGJ5IGBQbHVnaW5Db250cm9sbGVyYC5cblx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pKTtcblx0XHRjb25zdCBpbml0aWFsQ3VzdG9taXphdGlvbnMgPSBhd2FpdCBwcm92aWRlci5nZXRDaGF0Q3VzdG9taXphdGlvbnMoZGVmYXVsdENoYXQsIHRoaXMuX2NoYXRDb250ZXh0KHNlc3Npb24sIGRlZmF1bHRDaGF0KSwgdGhpcy5faG9zdEN1c3RvbWl6YXRpb25zKHNlc3Npb24pKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW0FnZW50U2VydmljZV0gY3JlYXRlU2Vzc2lvbjogZmFpbGVkIHRvIHJlc29sdmUgaW5pdGlhbCBjdXN0b21pemF0aW9ucycsIGVycik7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0pO1xuXG5cdFx0Ly8gV2hlbiBmb3JraW5nLCBwb3B1bGF0ZSB0aGUgbmV3IHNlc3Npb24ncyBwcm90b2NvbCBzdGF0ZSB3aXRoXG5cdFx0Ly8gdGhlIHNvdXJjZSBzZXNzaW9uJ3MgdHVybnMgc28gdGhlIGNsaWVudCBzZWVzIHRoZSBmb3JrZWQgaGlzdG9yeS5cblx0XHRpZiAoY29uZmlnPy5mb3JrKSB7XG5cdFx0XHRjb25zdCBzb3VyY2VTdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoY29uZmlnLmZvcmsuc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRcdGNvbnN0IHNvdXJjZUNoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKGNvbmZpZy5mb3JrLnNlc3Npb24pLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBuZXdDaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKS50b1N0cmluZygpO1xuXHRcdFx0bGV0IHNvdXJjZVR1cm5zOiBUdXJuW10gPSBbXTtcblx0XHRcdGlmIChzb3VyY2VTdGF0ZSAmJiBjb25maWcuZm9yay50dXJuSWRNYXBwaW5nKSB7XG5cdFx0XHRcdGNvbnN0IG9yaWdpbmFsU2xpY2UgPSBzb3VyY2VTdGF0ZS50dXJucy5zbGljZSgwLCBjb25maWcuZm9yay50dXJuSW5kZXggKyAxKTtcblx0XHRcdFx0Y29uc3QgbWFwcGluZyA9IGNvbmZpZy5mb3JrLnR1cm5JZE1hcHBpbmc7XG5cdFx0XHRcdHNvdXJjZVR1cm5zID0gb3JpZ2luYWxTbGljZS5tYXAodCA9PiAoeyAuLi50LCBpZDogbWFwcGluZy5nZXQodC5pZCkgPz8gZ2VuZXJhdGVVdWlkKCkgfSkpO1xuXHRcdFx0XHQvLyBSZS1wZXJzaXN0IGZvcmtlZCBsb2NhbCB0dXJucyAoYC9yZW5hbWVgLCBgIWNvbW1hbmRgKSB1bmRlciB0aGVcblx0XHRcdFx0Ly8gbmV3IHNlc3Npb24ncyBkZWZhdWx0IGNoYXQuIGByZWNvcmRgIChrZXllZCBieSB0dXJuIGlkKVxuXHRcdFx0XHQvLyBvdmVyd3JpdGVzIGFueSByb3dzIGEgREIgY29weSBjYXJyaWVkIHdpdGggdGhlIFNPVVJDRSBjaGF0IFVSSSxcblx0XHRcdFx0Ly8gYW5kIHNlZWRzIHRoZSBpbi1tZW1vcnkgaW5kZXggZm9yIHNhbWUtcHJvY2VzcyBmb3JrL3RydW5jYXRlLlxuXHRcdFx0XHR0aGlzLl9wZXJzaXN0Rm9ya2VkTG9jYWxUdXJucyhzZXNzaW9uLnRvU3RyaW5nKCksIHNvdXJjZUNoYXRVcmksIG5ld0NoYXRVcmksIG9yaWdpbmFsU2xpY2UsIHNvdXJjZVR1cm5zLCBtYXBwaW5nKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUHJlZml4IHRoZSBmb3JrZWQgc2Vzc2lvbidzIHRpdGxlIHNvIGNvbnN1bWVycyAoc2lkZWJhciwgY2hhdFxuXHRcdFx0Ly8gbW9kZWwpIGNhbiBkaXN0aW5ndWlzaCBpdCBmcm9tIHRoZSBzb3VyY2Ugd2l0aG91dCBlYWNoIHN1cmZhY2Vcblx0XHRcdC8vIHJlaW52ZW50aW5nIHRoZSBjb252ZW50aW9uLiBBdm9pZCBkb3VibGUtcHJlZml4aW5nIHdoZW4gYSB1c2VyXG5cdFx0XHQvLyBmb3JrcyBhbiBhbHJlYWR5LWZvcmtlZCBzZXNzaW9uLlxuXHRcdFx0Y29uc3QgZm9ya2VkVGl0bGVQcmVmaXggPSBsb2NhbGl6ZSgnYWdlbnRIb3N0LmZvcmtlZFRpdGxlUHJlZml4JywgXCJGb3JrZWQ6IFwiKTtcblx0XHRcdGNvbnN0IHNvdXJjZVRpdGxlID0gc291cmNlU3RhdGU/LnRpdGxlO1xuXHRcdFx0Y29uc3QgZm9ya2VkVGl0bGUgPSBzb3VyY2VUaXRsZVxuXHRcdFx0XHQ/IChzb3VyY2VUaXRsZS5zdGFydHNXaXRoKGZvcmtlZFRpdGxlUHJlZml4KSA/IHNvdXJjZVRpdGxlIDogYCR7Zm9ya2VkVGl0bGVQcmVmaXh9JHtzb3VyY2VUaXRsZX1gKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdhZ2VudEhvc3QuZm9ya2VkU2Vzc2lvbkZhbGxiYWNrJywgXCJGb3JrZWQgU2Vzc2lvblwiKTtcblx0XHRcdGNvbnN0IHN1bW1hcnkgPSB0aGlzLl9idWlsZEluaXRpYWxTdW1tYXJ5KHByb3ZpZGVyLCBzZXNzaW9uLCBjb25maWcsIGNyZWF0ZWQsIGZvcmtlZFRpdGxlKTtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oc3VtbWFyeSk7XG5cdFx0XHRzdGF0ZS5jb25maWcgPSBzZXNzaW9uQ29uZmlnO1xuXHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLnNlZWREZWZhdWx0Q2hhdFR1cm5zKHN1bW1hcnkucmVzb3VyY2UsIHNvdXJjZVR1cm5zKTtcblx0XHRcdHN0YXRlLmFjdGl2ZUNsaWVudHMgPSBjb25maWcuYWN0aXZlQ2xpZW50ID8gW2NvbmZpZy5hY3RpdmVDbGllbnRdIDogW107XG5cblx0XHRcdC8vIFJlZmluZSB0aGUgZm9ya2VkIHNlc3Npb24ncyBwbGFjZWhvbGRlciBgRm9ya2VkOiBcdTIwMjZgIHRpdGxlIGludG8gb25lXG5cdFx0XHQvLyBkZXJpdmVkIGZyb20gdGhlIGluaGVyaXRlZCBjaGF0LiBGb3JrcyBzZWVkIHByZS1leGlzdGluZ1xuXHRcdFx0Ly8gdHVybnMsIHNvIHRoZSBub3JtYWwgZmlyc3QtbWVzc2FnZS9maXJzdC10dXJuIHRpdGxlIGdlbmVyYXRpb25cblx0XHRcdC8vIG5ldmVyIGZpcmVzIGZvciB0aGVtIFx1MjAxNCB0aGlzIGlzIHRoZSBmb3JrLXRpbWUgZXF1aXZhbGVudC5cblx0XHRcdGlmIChzb3VyY2VUdXJucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX3NpZGVFZmZlY3RzLmdlbmVyYXRlRm9ya2VkVGl0bGUoc3VtbWFyeS5yZXNvdXJjZSwgdW5kZWZpbmVkLCBzb3VyY2VUdXJucywgZm9ya2VkVGl0bGUsIHNvdXJjZVRpdGxlKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGNvbmZpZz8uaW1wb3J0Q29udmVyc2F0aW9uKSB7XG5cdFx0XHQvLyBBbiBpbXBvcnRlZCBjb252ZXJzYXRpb24gYXJyaXZlcyB3aXRoIHByZS1leGlzdGluZyB0dXJucyAoYXNzaWduZWRcblx0XHRcdC8vIGZyZXNoIFVVSUQgaWRzIGFib3ZlKS4gU2VlZCB0aGVtIGludG8gdGhlIG5ldyBzZXNzaW9uJ3MgcHJvdG9jb2xcblx0XHRcdC8vIHN0YXRlIHNvIHRoZSBjbGllbnQgcmVuZGVycyB0aGUgaW1wb3J0ZWQgaGlzdG9yeSBpbW1lZGlhdGVseTsgdGhlXG5cdFx0XHQvLyBwcm92aWRlciBoYXMgYWxyZWFkeSBzZWVkZWQgdGhlIG1hdGNoaW5nIFNESyBldmVudCBsb2cgc28gdGhvc2Vcblx0XHRcdC8vIHR1cm5zIGFyZSBlZGl0YWJsZSAvIGZvcmthYmxlIC8gdHJ1bmNhdGFibGUuXG5cdFx0XHRjb25zdCBpbXBvcnRlZFR1cm5zID0gWy4uLmNvbmZpZy5pbXBvcnRDb252ZXJzYXRpb24udHVybnNdO1xuXHRcdFx0Y29uc3QgaW1wb3J0ZWRUaXRsZSA9IHRoaXMuX2J1aWxkSW1wb3J0ZWRUaXRsZShpbXBvcnRlZFR1cm5zKTtcblx0XHRcdGNvbnN0IHN1bW1hcnkgPSB0aGlzLl9idWlsZEluaXRpYWxTdW1tYXJ5KHByb3ZpZGVyLCBzZXNzaW9uLCBjb25maWcsIGNyZWF0ZWQsIGltcG9ydGVkVGl0bGUpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuY3JlYXRlU2Vzc2lvbihzdW1tYXJ5KTtcblx0XHRcdHN0YXRlLmNvbmZpZyA9IHNlc3Npb25Db25maWc7XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuc2VlZERlZmF1bHRDaGF0VHVybnMoc3VtbWFyeS5yZXNvdXJjZSwgaW1wb3J0ZWRUdXJucyk7XG5cdFx0XHRzdGF0ZS5hY3RpdmVDbGllbnRzID0gY29uZmlnLmFjdGl2ZUNsaWVudCA/IFtjb25maWcuYWN0aXZlQ2xpZW50XSA6IFtdO1xuXG5cdFx0XHQvLyBSZWZpbmUgdGhlIHBsYWNlaG9sZGVyIHRpdGxlIGludG8gb25lIGdlbmVyYXRlZCBmcm9tIHRoZSBpbXBvcnRlZFxuXHRcdFx0Ly8gY29udmVyc2F0aW9uLCBtaXJyb3JpbmcgZm9ya3MuIEltcG9ydHMgc2VlZCBwcmUtZXhpc3RpbmcgdHVybnMsIHNvXG5cdFx0XHQvLyB0aGUgbm9ybWFsIGZpcnN0LW1lc3NhZ2UgdGl0bGUgZ2VuZXJhdGlvbiBuZXZlciBmaXJlczsgd2l0aG91dCB0aGlzXG5cdFx0XHQvLyB0aGUgc2Vzc2lvbiB3b3VsZCBrZWVwIHNob3dpbmcgdGhlIHJhdyBmaXJzdC1tZXNzYWdlIGNsaXAgd2hpbGVcblx0XHRcdC8vIHNpYmxpbmcgc2Vzc2lvbnMgc2hvdyBjbGVhbiBnZW5lcmF0ZWQgdGl0bGVzIFx1MjAxNCBtYWtpbmcgaW1wb3J0cyBsb29rXG5cdFx0XHQvLyBsaWtlIGEgZGlmZmVyZW50IGtpbmQgb2Ygc2Vzc2lvbi5cblx0XHRcdGlmIChpbXBvcnRlZFR1cm5zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5fc2lkZUVmZmVjdHMuZ2VuZXJhdGVGb3JrZWRUaXRsZShzdW1tYXJ5LnJlc291cmNlLCB1bmRlZmluZWQsIGltcG9ydGVkVHVybnMsIGltcG9ydGVkVGl0bGUpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBQcm92aXNpb25hbCBzZXNzaW9ucyBkbyBub3QgZW1pdCBgc2Vzc2lvbkFkZGVkYCBvciBgU2Vzc2lvblJlYWR5YFxuXHRcdFx0Ly8gdW50aWwgYG9uRGlkTWF0ZXJpYWxpemVDaGF0YCwgYnV0IHRoZWlyIGluLW1lbW9yeSBzdGF0ZSBleGlzdHNcblx0XHRcdC8vIGltbWVkaWF0ZWx5IHNvIGNsaWVudHMgY2FuIHN0cmVhbSBjb25maWcgYW5kIG1vZGVsIGNoYW5nZXMgZmlyc3QuXG5cdFx0XHRjb25zdCBzdW1tYXJ5ID0gdGhpcy5fYnVpbGRJbml0aWFsU3VtbWFyeShwcm92aWRlciwgc2Vzc2lvbiwgY29uZmlnLCBjcmVhdGVkLCAnJyk7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHByb3Zpc2lvbmFsU3RhdGUgPz8gdGhpcy5fc3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oc3VtbWFyeSwgeyBlbWl0Tm90aWZpY2F0aW9uOiB0cnVlIH0pO1xuXHRcdFx0aWYgKCFwcm92aXNpb25hbFN0YXRlKSB7XG5cdFx0XHRcdHN0YXRlLmNvbmZpZyA9IHNlc3Npb25Db25maWc7XG5cdFx0XHRcdHN0YXRlLmFjdGl2ZUNsaWVudHMgPSBjb25maWc/LmFjdGl2ZUNsaWVudCA/IFtjb25maWcuYWN0aXZlQ2xpZW50XSA6IFtdO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBEaXNjb3ZlcnkgaXMgYXN5bmNocm9ub3VzLCBzbyBwdWJsaXNoIHRoZSByZXN1bHQgZm9yIGNsaWVudHMgdGhhdCBzdWJzY3JpYmVkIHdoaWxlIGl0IHdhcyBpbiBmbGlnaHQuXG5cdFx0aWYgKGluaXRpYWxDdXN0b21pemF0aW9ucyAmJiBpbml0aWFsQ3VzdG9taXphdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb24udG9TdHJpbmcoKSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DdXN0b21pemF0aW9uc0NoYW5nZWQsIGN1c3RvbWl6YXRpb25zOiBbLi4uaW5pdGlhbEN1c3RvbWl6YXRpb25zXSB9KTtcblx0XHR9XG5cdFx0dGhpcy5fc2VydmVyVG9vbEhvc3QuYWR2ZXJ0aXNlKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0Ly8gUGVyc2lzdCByZXNvbHZlZCBjb25maWcgdmFsdWVzIGZvciByZXN0b3JlLiBNaWQtc2Vzc2lvbiB1cGRhdGVzIGFyZVxuXHRcdC8vIHBlcnNpc3RlZCBieSBgQWdlbnRTaWRlRWZmZWN0c2Agb24gYFNlc3Npb25Db25maWdDaGFuZ2VkYC5cblx0XHRpZiAoc2Vzc2lvbkNvbmZpZz8udmFsdWVzICYmIE9iamVjdC5rZXlzKHNlc3Npb25Db25maWcudmFsdWVzKS5sZW5ndGggPiAwICYmICFjcmVhdGVkLnByb3Zpc2lvbmFsKSB7XG5cdFx0XHR0aGlzLl9wZXJzaXN0Q29uZmlnVmFsdWVzKHNlc3Npb24sIHNlc3Npb25Db25maWcudmFsdWVzKTtcblx0XHR9XG5cblx0XHR0aGlzLl9jaGFuZ2VzZXRDb29yZGluYXRvci5vblNlc3Npb25DcmVhdGVkKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cblx0XHRpZiAoIWNyZWF0ZWQucHJvdmlzaW9uYWwpIHtcblx0XHRcdC8vIFBlcnNpc3QgdGhlIGhvc3Qtb3duZWQgd29ya3NwYWNlLWxlc3MgbWFya2VyIG9uY2UgdGhlIHNlc3Npb24gREJcblx0XHRcdC8vIGV4aXN0czsgcHJvdmlzaW9uYWwgc2Vzc2lvbnMgZGVmZXIgdGhpcyB0byBgX29uRGlkTWF0ZXJpYWxpemVDaGF0YC5cblx0XHRcdHRoaXMuX3BlcnNpc3RXb3Jrc3BhY2VsZXNzKHNlc3Npb24sIHJlYWRTZXNzaW9uV29ya3NwYWNlbGVzcyh0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN1bW1hcnkoc2Vzc2lvbi50b1N0cmluZygpKT8uX21ldGEpKTtcblx0XHRcdHRoaXMuX3BlcnNpc3RNdWx0aVJvb3Qoc2Vzc2lvbiwgcmVhZFNlc3Npb25NdWx0aVJvb3RNZXRhZGF0YSh0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN1bW1hcnkoc2Vzc2lvbi50b1N0cmluZygpKT8uX21ldGEpKTtcblxuXHRcdFx0Ly8gYFNlc3Npb25SZWFkeWAgbWVhbnMgdGhlIGFnZW50IGhhcyBhIGxpdmUgU0RLIHNlc3Npb24uIFByb3Zpc2lvbmFsXG5cdFx0XHQvLyBzZXNzaW9ucyBkZWZlciBpdCB0byB7QGxpbmsgX29uRGlkTWF0ZXJpYWxpemVDaGF0fS5cblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uLnRvU3RyaW5nKCksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHkgfSk7XG5cdFx0XHRjb25zdCBnaXRIdWJTdGF0ZSA9IHJlYWRTZXNzaW9uR2l0SHViU3RhdGUodGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdW1tYXJ5KHNlc3Npb24udG9TdHJpbmcoKSk/Ll9tZXRhKTtcblx0XHRcdGlmIChnaXRIdWJTdGF0ZSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9naXRTdGF0ZVNlcnZpY2Uuc2V0U2Vzc2lvbkdpdEh1YlN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSwgZ2l0SHViU3RhdGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBjcmVhdGVkLnJlc29sdmVkV29ya2luZ0RpcmVjdG9yeSA/PyBjb25maWc/LndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdO1xuXHRcdHZvaWQgdGhpcy5fZ2l0U3RhdGVTZXJ2aWNlLnJlZnJlc2hTZXNzaW9uR2l0U3RhdGUoc2Vzc2lvbi50b1N0cmluZygpLCB3b3JraW5nRGlyZWN0b3J5KTtcblxuXHRcdHJldHVybiBzZXNzaW9uO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlQ2hhdChzZXNzaW9uOiBVUkksIGNoYXQ6IFVSSSwgb3B0aW9ucz86IElBZ2VudENyZWF0ZUNoYXRPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbktleSA9IHNlc3Npb24udG9TdHJpbmcoKTtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2ZpbmRQcm92aWRlckZvclNlc3Npb24oc2Vzc2lvbik7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbQWdlbnRTZXJ2aWNlXSBjcmVhdGVDaGF0OiBubyBwcm92aWRlciBmb3Igc2Vzc2lvbiAke3Nlc3Npb25LZXl9YCk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fc3VwcG9ydHNDaGF0cyhwcm92aWRlcikpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgW0FnZW50U2VydmljZV0gY3JlYXRlQ2hhdDogcHJvdmlkZXIgJHtwcm92aWRlci5pZH0gZG9lcyBub3Qgc3VwcG9ydCBtdWx0aXBsZSBjaGF0c2ApO1xuXHRcdH1cblx0XHQvLyBXaGVuIGZvcmtpbmcsIHJlc29sdmUgdGhlIHNvdXJjZSBjaGF0J3MgdHVybnMgdXAgdG8gdGhlIGZvcmsgcG9pbnQgYW5kXG5cdFx0Ly8gbWludCBmcmVzaCB0dXJuIElEcyBmb3IgdGhlIG5ldyBjaGF0LiBUaGUgYWdlbnQgdXNlcyB0aGUgbWFwcGluZyB0b1xuXHRcdC8vIHJlbWFwIHBlci10dXJuIGRhdGEgaW4gdGhlIGZvcmtlZCBjaGF0OyB0aGUgc2VlZGVkIHR1cm5zIG1ha2Vcblx0XHQvLyB0aGUgbmV3IGNoYXQgc3VyZmFjZSB0aGUgZm9ya2VkIGhpc3RvcnkgaW1tZWRpYXRlbHkuXG5cdFx0bGV0IGZvcmtlZFR1cm5zOiBUdXJuW10gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGZvcmtlZFRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGZvcmtlZFNvdXJjZVRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNyZWF0ZU9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdC8vIFBlcnNpc3QgZXhoYXVzdGl2ZSBwcm92ZW5hbmNlIGZvciBwZWVyIGNoYXRzLiBGcmVzaCB1c2VyLWNyZWF0ZWQgY2hhdHNcblx0XHQvLyBsZWF2ZSB0aGlzIHVuZGVmaW5lZCBhbmQgZGVmYXVsdCB0byBgQ2hhdE9yaWdpbktpbmQuVXNlcmAuXG5cdFx0bGV0IHBlZXJDaGF0T3JpZ2luOiBDaGF0T3JpZ2luIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChvcHRpb25zPy5zaWRlQ2hhdCkge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRTaWRlQ2hhdCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVTaWRlQ2hhdE9yaWdpbihzZXNzaW9uLCBvcHRpb25zLnNpZGVDaGF0KTtcblx0XHRcdHBlZXJDaGF0T3JpZ2luID0gcmVzb2x2ZWRTaWRlQ2hhdC5vcmlnaW47XG5cdFx0XHRjcmVhdGVPcHRpb25zID0ge1xuXHRcdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0XHRzaWRlQ2hhdDoge1xuXHRcdFx0XHRcdC4uLm9wdGlvbnMuc2lkZUNoYXQsXG5cdFx0XHRcdFx0c291cmNlOiBVUkkucGFyc2UocmVzb2x2ZWRTaWRlQ2hhdC5zb3VyY2VDaGF0KSxcblx0XHRcdFx0XHQuLi4ocmVzb2x2ZWRTaWRlQ2hhdC5wcm92aWRlckFuY2hvclR1cm5JZCA/IHsgcHJvdmlkZXJBbmNob3JUdXJuSWQ6IHJlc29sdmVkU2lkZUNoYXQucHJvdmlkZXJBbmNob3JUdXJuSWQgfSA6IHt9KSxcblx0XHRcdFx0XHQuLi4ocmVzb2x2ZWRTaWRlQ2hhdC5zb3VyY2VDb250ZXh0ID8geyBzb3VyY2VDb250ZXh0OiByZXNvbHZlZFNpZGVDaGF0LnNvdXJjZUNvbnRleHQgfSA6IHt9KSxcblx0XHRcdFx0XHQuLi4ocmVzb2x2ZWRTaWRlQ2hhdC5wYXJ0aWFsUmVzcG9uc2UgPyB7IHBhcnRpYWxSZXNwb25zZTogcmVzb2x2ZWRTaWRlQ2hhdC5wYXJ0aWFsUmVzcG9uc2UgfSA6IHt9KSxcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zPy5mb3JrKSB7XG5cdFx0XHRjb25zdCB7IHNvdXJjZUNoYXRLZXksIHNvdXJjZVNlc3Npb25LZXksIHNvdXJjZVN0YXRlIH0gPSBhd2FpdCB0aGlzLl9yZXNvbHZlU2Vzc2lvblNvdXJjZUNoYXQob3B0aW9ucy5mb3JrLnNvdXJjZSk7XG5cdFx0XHRpZiAodGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYXRPcmlnaW4oc291cmNlQ2hhdEtleSk/LmtpbmQgPT09IENoYXRPcmlnaW5LaW5kLlRvb2wpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBbQWdlbnRTZXJ2aWNlXSBjcmVhdGVDaGF0OiBjYW5ub3QgZm9yayBwcm92aWRlci1zcGF3bmVkIGNoYXQgJHtzb3VyY2VDaGF0S2V5fWApO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc291cmNlVHVybnMgPSBzb3VyY2VTdGF0ZT8udHVybnMgPz8gW107XG5cdFx0XHRjb25zdCBmb3JrSW5kZXggPSBzb3VyY2VUdXJucy5maW5kSW5kZXgodCA9PiB0LmlkID09PSBvcHRpb25zLmZvcmshLnR1cm5JZCk7XG5cdFx0XHRpZiAoZm9ya0luZGV4IDwgMCkge1xuXHRcdFx0XHQvLyBUaGUgZm9yayBwb2ludCBpcyB1bmtub3duLCBzbyBhIGZvcmsgaXMgaW5kaXN0aW5ndWlzaGFibGUgZnJvbSBhXG5cdFx0XHRcdC8vIGZyZXNoIGNoYXQuIERyb3AgdGhlIGZvcmsgdG8gYXZvaWQgdGhlIHByb3ZpZGVyIGluaGVyaXRpbmcgdGhlXG5cdFx0XHRcdC8vIHdob2xlIGJhY2tlbmQgY2hhdCB3aGlsZSB0aGUgVUkgaXMgc2VlZGVkIHdpdGggbm8gdHVybnMuXG5cdFx0XHRcdGNyZWF0ZU9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIGZvcms6IHVuZGVmaW5lZCB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3Qgc2xpY2UgPSBzb3VyY2VUdXJucy5zbGljZSgwLCBmb3JrSW5kZXggKyAxKTtcblx0XHRcdFx0Y29uc3QgdHVybklkTWFwcGluZyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdFx0XHRcdGZvciAoY29uc3QgdCBvZiBzbGljZSkge1xuXHRcdFx0XHRcdHR1cm5JZE1hcHBpbmcuc2V0KHQuaWQsIGdlbmVyYXRlVXVpZCgpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3JrZWRUdXJucyA9IHNsaWNlLm1hcCh0ID0+ICh7IC4uLnQsIGlkOiB0dXJuSWRNYXBwaW5nLmdldCh0LmlkKSA/PyBnZW5lcmF0ZVV1aWQoKSB9KSk7XG5cblx0XHRcdFx0Ly8gUmVjb3JkIHRoZSBmb3JrIGJvdW5kYXJ5IGluIGhvc3QgdGVybXM6IHRoZSBjb25jcmV0ZSBzb3VyY2UgY2hhdCBVUklcblx0XHRcdFx0Ly8gYW5kIHRoZSByZXF1ZXN0ZWQgaG9zdC12aXNpYmxlIHR1cm4gaWQsIG5vdCB0aGUgcHJvdmlkZXItc3BlY2lmaWNcblx0XHRcdFx0Ly8gb25lIGJlbG93LlxuXHRcdFx0XHRwZWVyQ2hhdE9yaWdpbiA9IHsga2luZDogQ2hhdE9yaWdpbktpbmQuRm9yaywgY2hhdDogc291cmNlQ2hhdEtleSwgdHVybklkOiBvcHRpb25zLmZvcmsudHVybklkIH07XG5cblx0XHRcdFx0Ly8gQ2FycnkgZm9ya2VkIGhvc3QtaW5qZWN0ZWQgbG9jYWwgdHVybnMgKGAvcmVuYW1lYCwgYCFjb21tYW5kYClcblx0XHRcdFx0Ly8gaW50byB0aGUgbmV3IGNoYXQgc28gdGhleSBzdXJ2aXZlIHJlbG9hZCBhbmQgYW5jaG9yIGZ1dHVyZVxuXHRcdFx0XHQvLyBmb3JrL3RydW5jYXRlLlxuXHRcdFx0XHR0aGlzLl9wZXJzaXN0Rm9ya2VkTG9jYWxUdXJucyhzZXNzaW9uS2V5LCBzb3VyY2VDaGF0S2V5LCBjaGF0LnRvU3RyaW5nKCksIHNsaWNlLCBmb3JrZWRUdXJucywgdHVybklkTWFwcGluZyk7XG5cblx0XHRcdFx0Y29uc3QgZm9ya2VkVGl0bGVQcmVmaXggPSBsb2NhbGl6ZSgnYWdlbnRIb3N0LmZvcmtlZFRpdGxlUHJlZml4JywgXCJGb3JrZWQ6IFwiKTtcblx0XHRcdFx0Zm9ya2VkU291cmNlVGl0bGUgPSBzb3VyY2VTdGF0ZT8udGl0bGUgfHwgdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzb3VyY2VTZXNzaW9uS2V5KT8udGl0bGU7XG5cdFx0XHRcdGZvcmtlZFRpdGxlID0gZm9ya2VkU291cmNlVGl0bGVcblx0XHRcdFx0XHQ/IChmb3JrZWRTb3VyY2VUaXRsZS5zdGFydHNXaXRoKGZvcmtlZFRpdGxlUHJlZml4KSA/IGZvcmtlZFNvdXJjZVRpdGxlIDogYCR7Zm9ya2VkVGl0bGVQcmVmaXh9JHtmb3JrZWRTb3VyY2VUaXRsZX1gKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2FnZW50SG9zdC5mb3JrZWRDaGF0RmFsbGJhY2snLCBcIkZvcmtlZCBDaGF0XCIpO1xuXHRcdFx0XHQvLyBUaGUgU0RLIGZvcmsgYm91bmRhcnkgbXVzdCBiZSBhIGNvbmNyZXRlIChTREstYmFja2VkKSB0dXJuLiBXaGVuXG5cdFx0XHRcdC8vIHRoZSBjbGllbnQgZm9ya2VkIGF0IGEgaG9zdC1pbmplY3RlZCBsb2NhbCB0dXJuLCByZWRpcmVjdCB0aGVcblx0XHRcdFx0Ly8gYWdlbnQgdG8gdGhlIHByZWNlZGluZyBjb25jcmV0ZSB0dXJuICh0aGUgbG9jYWwgdHVybnMgYXJlIHN0aWxsXG5cdFx0XHRcdC8vIHNlZWRlZCBpbnRvIHRoZSBuZXcgY2hhdCdzIHByb3RvY29sIHN0YXRlIGFib3ZlKS5cblx0XHRcdFx0Y29uc3QgY29uY3JldGVGb3JrVHVybklkID0gdGhpcy5fbG9jYWxUdXJucy5yZXNvbHZlQ29uY3JldGVUdXJuSWQoc291cmNlQ2hhdEtleSwgb3B0aW9ucy5mb3JrLnR1cm5JZCk7XG5cdFx0XHRcdGNyZWF0ZU9wdGlvbnMgPSB7XG5cdFx0XHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdFx0XHRmb3JrOiB7XG5cdFx0XHRcdFx0XHQuLi5vcHRpb25zLmZvcmssXG5cdFx0XHRcdFx0XHRzb3VyY2U6IFVSSS5wYXJzZShzb3VyY2VDaGF0S2V5KSxcblx0XHRcdFx0XHRcdHR1cm5JZE1hcHBpbmcsXG5cdFx0XHRcdFx0XHQuLi4oY29uY3JldGVGb3JrVHVybklkICE9PSB1bmRlZmluZWQgPyB7IHR1cm5JZDogY29uY3JldGVGb3JrVHVybklkIH0gOiB7fSksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgdGhlIGJhY2tpbmcgY2hhdCBiZWZvcmUgcHVibGlzaGluZyBgc2Vzc2lvbi9jaGF0QWRkZWRgIHNvXG5cdFx0Ly8gc3Vic2NyaWJlcnMgb25seSBzZWUgYSBjaGF0IHRoYXQgY2FuIGFscmVhZHkgcmVjZWl2ZSBtZXNzYWdlcy5cblx0XHRjb25zdCBjcmVhdGVSZXN1bHQgPSBhd2FpdCB0aGlzLl9jcmVhdGVDaGF0KHByb3ZpZGVyLCBjaGF0LCBzZXNzaW9uLCBjcmVhdGVPcHRpb25zKTtcblx0XHRjb25zdCBwcm92aWRlckRhdGEgPSBjcmVhdGVSZXN1bHQ/LnByb3ZpZGVyRGF0YTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcGVyc2lzdFBlZXJDaGF0KHNlc3Npb24sIGNoYXQsIHByb3ZpZGVyRGF0YSwgcGVlckNoYXRPcmlnaW4pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBwcm92aWRlci5jaGF0cy5kaXNwb3NlQ2hhdChjaGF0LCB0aGlzLl9jaGF0Q29udGV4dChzZXNzaW9uLCBjaGF0KSk7XG5cdFx0XHR9IGNhdGNoIChyb2xsYmFja0Vycm9yKSB7XG5cdFx0XHRcdHRocm93IG5ldyBBZ2dyZWdhdGVFcnJvcihbZXJyb3IsIHJvbGxiYWNrRXJyb3JdLCBgRmFpbGVkIHRvIHBlcnNpc3QgYW5kIHJvbGwgYmFjayBjaGF0ICR7Y2hhdC50b1N0cmluZygpfWApO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmFkZENoYXQoc2Vzc2lvbktleSwgY2hhdC50b1N0cmluZygpLCB7XG5cdFx0XHQuLi4oZm9ya2VkVGl0bGUgIT09IHVuZGVmaW5lZCA/IHsgdGl0bGU6IGZvcmtlZFRpdGxlIH0gOiBvcHRpb25zPy50aXRsZSAhPT0gdW5kZWZpbmVkID8geyB0aXRsZTogb3B0aW9ucy50aXRsZSB9IDoge30pLFxuXHRcdFx0Li4uKGZvcmtlZFR1cm5zICE9PSB1bmRlZmluZWQgPyB7IHR1cm5zOiBmb3JrZWRUdXJucyB9IDoge30pLFxuXHRcdFx0Li4uKHByb3ZpZGVyRGF0YSAhPT0gdW5kZWZpbmVkID8geyBwcm92aWRlckRhdGEgfSA6IHt9KSxcblx0XHRcdC4uLihwZWVyQ2hhdE9yaWdpbiAhPT0gdW5kZWZpbmVkID8geyBvcmlnaW46IHBlZXJDaGF0T3JpZ2luIH0gOiB7fSksXG5cdFx0fSk7XG5cblx0XHQvLyBJZiB0aGUgYWdlbnQgZXhwb3NlcyB0aGlzIGNoYXQgYXMgaXRzIG93biBTREsgc2Vzc2lvbiwgbWFyayB0aGF0XG5cdFx0Ly8gYmFja2luZyBzbyBpdCBzdGF5cyBvdXQgb2YgdGhlIHRvcC1sZXZlbCBzZXNzaW9uIGxpc3QuIGBfbWFya0NoYXRCYWNraW5nYFxuXHRcdC8vIHJldHJpZXMgZHVyYWJseSBhbmQgZmFsbHMgYmFjayB0byBpbi1wcm9jZXNzIHN1cHByZXNzaW9uIG9uIGNvbnRpbnVlZFxuXHRcdC8vIGZhaWx1cmUsIHNvIGl0IG5ldmVyIHRocm93cyBoZXJlIFx1MjAxNCB0aGlzIG11c3QgbmV2ZXIgdHVybiBhblxuXHRcdC8vIGFscmVhZHktY3JlYXRlZCwgYWxyZWFkeS1hbm5vdW5jZWQgY2hhdCBpbnRvIGEgZmFpbGVkIGBjcmVhdGVDaGF0YC5cblx0XHRpZiAoY3JlYXRlUmVzdWx0Py5iYWNraW5nU2Vzc2lvbikge1xuXHRcdFx0YXdhaXQgdGhpcy5fbWFya0NoYXRCYWNraW5nKGNyZWF0ZVJlc3VsdC5iYWNraW5nU2Vzc2lvbiwgY2hhdCk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVmaW5lIHRoZSBmb3JrZWQgY2hhdCdzIHBsYWNlaG9sZGVyIGBGb3JrZWQ6IFx1MjAyNmAgdGl0bGUgaW50byBvbmVcblx0XHQvLyBkZXJpdmVkIGZyb20gdGhlIGluaGVyaXRlZCBjaGF0LiBGb3JrcyBzZWVkIHByZS1leGlzdGluZ1xuXHRcdC8vIHR1cm5zLCBzbyB0aGUgbm9ybWFsIGZpcnN0LW1lc3NhZ2UvZmlyc3QtdHVybiB0aXRsZSBnZW5lcmF0aW9uIG5ldmVyXG5cdFx0Ly8gZmlyZXMgZm9yIHRoZW0gXHUyMDE0IHRoaXMgaXMgdGhlIGZvcmstdGltZSBlcXVpdmFsZW50LlxuXHRcdGlmIChmb3JrZWRUdXJucyAmJiBmb3JrZWRUdXJucy5sZW5ndGggPiAwICYmIGZvcmtlZFRpdGxlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX3NpZGVFZmZlY3RzLmdlbmVyYXRlRm9ya2VkVGl0bGUoc2Vzc2lvbktleSwgY2hhdC50b1N0cmluZygpLCBmb3JrZWRUdXJucywgZm9ya2VkVGl0bGUsIGZvcmtlZFNvdXJjZVRpdGxlKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVmFsaWRhdGVzIGEgc2lkZSBjaGF0J3Mgc291cmNlIGFuZCByZXR1cm5zIGl0cyB7QGxpbmsgQ2hhdE9yaWdpbktpbmQuU2lkZUNoYXR9XG5cdCAqIG9yaWdpbi4gVGhyb3dzIHdoZW4gdGhlIHNvdXJjZSBjaGF0IGlzIG5vdCBwYXJ0IG9mIGBzZXNzaW9uYCBvciB3aGVuIHRoZVxuXHQgKiByZWZlcmVuY2VkIGNvbXBsZXRlZCBvciBhY3RpdmUgdHVybiBpcyBhYnNlbnQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlU2lkZUNoYXRPcmlnaW4oc2Vzc2lvbjogVVJJLCBzaWRlQ2hhdDogSUFnZW50Q3JlYXRlQ2hhdFNpZGVDaGF0U291cmNlKTogUHJvbWlzZTx7IG9yaWdpbjogQ2hhdE9yaWdpbjsgc291cmNlQ2hhdDogc3RyaW5nOyBzZWxlY3Rpb24/OiBJQWdlbnRDcmVhdGVDaGF0U2lkZUNoYXRTZWxlY3Rpb247IHByb3ZpZGVyQW5jaG9yVHVybklkPzogc3RyaW5nOyBzb3VyY2VDb250ZXh0Pzogc3RyaW5nOyBwYXJ0aWFsUmVzcG9uc2U/OiBzdHJpbmcgfT4ge1xuXHRcdGNvbnN0IHNlc3Npb25LZXkgPSBzZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgc291cmNlS2V5ID0gc2lkZUNoYXQuc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgeyBzb3VyY2VDaGF0S2V5LCBzb3VyY2VTZXNzaW9uS2V5LCBzb3VyY2VTdGF0ZSB9ID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVNlc3Npb25Tb3VyY2VDaGF0KHNpZGVDaGF0LnNvdXJjZSk7XG5cdFx0Ly8gVGhlIHNvdXJjZSBjaGF0IE1VU1QgYmVsb25nIHRvIHRoZSB0YXJnZXQgc2Vzc2lvbi4gT2xkZXIgY2FsbGVycyBtYXlcblx0XHQvLyBzdGlsbCBhZGRyZXNzIHRoZSBtYWluIGNoYXQgYnkgc2Vzc2lvbiBVUkk7IHN5bmNlZCBBSFAgY2xpZW50cyBzZW5kIHRoZVxuXHRcdC8vIGFjdHVhbCBkZWZhdWx0LWNoYXQgVVJJLlxuXHRcdGlmIChzb3VyY2VTZXNzaW9uS2V5ICE9PSBzZXNzaW9uS2V5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFtBZ2VudFNlcnZpY2VdIGNyZWF0ZUNoYXQ6IHNpZGUgY2hhdCBzb3VyY2UgJHtzb3VyY2VLZXl9IGRvZXMgbm90IGJlbG9uZyB0byBzZXNzaW9uICR7c2Vzc2lvbktleX1gKTtcblx0XHR9XG5cdFx0Ly8gVGhlIGJvdW5kZWQgdHVybiBtdXN0IGJlIGEgcmVhbCBjb21wbGV0ZWQgb3IgY3VycmVudGx5LWFjdGl2ZSB0dXJuLlxuXHRcdGNvbnN0IGFjdGl2ZVR1cm4gPSBzb3VyY2VTdGF0ZT8uYWN0aXZlVHVybj8uaWQgPT09IHNpZGVDaGF0LnR1cm5JZCA/IHNvdXJjZVN0YXRlLmFjdGl2ZVR1cm4gOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgaGFzQ29tcGxldGVkVHVybiA9IHNvdXJjZVN0YXRlPy50dXJucy5zb21lKHQgPT4gdC5pZCA9PT0gc2lkZUNoYXQudHVybklkKSA/PyBmYWxzZTtcblx0XHRpZiAoIWhhc0NvbXBsZXRlZFR1cm4gJiYgIWFjdGl2ZVR1cm4pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgW0FnZW50U2VydmljZV0gY3JlYXRlQ2hhdDogc2lkZSBjaGF0IHNvdXJjZSB0dXJuICR7c2lkZUNoYXQudHVybklkfSBub3QgZm91bmQgaW4gJHtzb3VyY2VLZXl9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IGlzTG9jYWxTb3VyY2VUdXJuID0gIWFjdGl2ZVR1cm4gJiYgdGhpcy5fbG9jYWxUdXJucy5pc0xvY2FsKHNvdXJjZUNoYXRLZXksIHNpZGVDaGF0LnR1cm5JZCk7XG5cdFx0Y29uc3QgcHJvdmlkZXJBbmNob3JUdXJuSWQgPSBpc0xvY2FsU291cmNlVHVybiA/IHRoaXMuX2xvY2FsVHVybnMucmVzb2x2ZUNvbmNyZXRlVHVybklkKHNvdXJjZUNoYXRLZXksIHNpZGVDaGF0LnR1cm5JZCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcGFydGlhbFJlc3BvbnNlID0gZ2V0U2lkZUNoYXRQYXJ0aWFsUmVzcG9uc2UoYWN0aXZlVHVybik7XG5cdFx0Y29uc3Qgc291cmNlQ29udGV4dCA9IChhY3RpdmVUdXJuIHx8IGlzTG9jYWxTb3VyY2VUdXJuKVxuXHRcdFx0PyBidWlsZEJvdW5kZWRTaWRlQ2hhdFNvdXJjZUNvbnRleHQoc291cmNlU3RhdGU/LnR1cm5zID8/IFtdLCBzaWRlQ2hhdC50dXJuSWQsIGFjdGl2ZVR1cm4pXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBzaWRlQ2hhdC5zZWxlY3Rpb24/LnRleHQudHJpbSgpXG5cdFx0XHQ/IHNpZGVDaGF0LnNlbGVjdGlvblxuXHRcdFx0OiBzaWRlQ2hhdC5zZWxlY3Rpb25cblx0XHRcdFx0PyAoKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ1tBZ2VudFNlcnZpY2VdIGNyZWF0ZUNoYXQ6IHNpZGUgY2hhdCBzZWxlY3Rpb24gdGV4dCBtdXN0IGJlIG5vbi1lbXB0eScpOyB9KSgpXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiB7XG5cdFx0XHRvcmlnaW46IHtcblx0XHRcdFx0a2luZDogQ2hhdE9yaWdpbktpbmQuU2lkZUNoYXQsXG5cdFx0XHRcdGNoYXQ6IHNvdXJjZUNoYXRLZXksXG5cdFx0XHRcdHR1cm5JZDogc2lkZUNoYXQudHVybklkLFxuXHRcdFx0XHQuLi4oc2VsZWN0aW9uID8geyBzZWxlY3Rpb24gfSA6IHt9KSxcblx0XHRcdH0sXG5cdFx0XHRzb3VyY2VDaGF0OiBzb3VyY2VDaGF0S2V5LFxuXHRcdFx0Li4uKHNlbGVjdGlvbiA/IHsgc2VsZWN0aW9uIH0gOiB7fSksXG5cdFx0XHQuLi4ocHJvdmlkZXJBbmNob3JUdXJuSWQgPyB7IHByb3ZpZGVyQW5jaG9yVHVybklkIH0gOiB7fSksXG5cdFx0XHQuLi4oc291cmNlQ29udGV4dCA/IHsgc291cmNlQ29udGV4dCB9IDoge30pLFxuXHRcdFx0Li4uKHBhcnRpYWxSZXNwb25zZSA/IHsgcGFydGlhbFJlc3BvbnNlIH0gOiB7fSksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVTZXNzaW9uU291cmNlQ2hhdChzb3VyY2U6IFVSSSk6IFByb21pc2U8eyBzb3VyY2VDaGF0S2V5OiBzdHJpbmc7IHNvdXJjZVNlc3Npb25LZXk6IHN0cmluZzsgc291cmNlU3RhdGU6IFJldHVyblR5cGU8QWdlbnRIb3N0U3RhdGVNYW5hZ2VyWydnZXRDaGF0U3RhdGUnXT4gfCB1bmRlZmluZWQgfT4ge1xuXHRcdGNvbnN0IHNvdXJjZUtleSA9IHNvdXJjZS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHNvdXJjZVNlc3Npb25LZXkgPSBpc0FocENoYXRDaGFubmVsKHNvdXJjZUtleSkgPyBwYXJzZVJlcXVpcmVkU2Vzc2lvblVyaUZyb21DaGF0VXJpKHNvdXJjZUtleSkgOiBzb3VyY2VLZXk7XG5cdFx0Y29uc3QgZGVmYXVsdENoYXRLZXkgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNvdXJjZVNlc3Npb25LZXkpPy5kZWZhdWx0Q2hhdCA/PyBidWlsZERlZmF1bHRDaGF0VXJpKHNvdXJjZVNlc3Npb25LZXkpO1xuXHRcdGNvbnN0IGlzRGVmYXVsdFNvdXJjZSA9IHNvdXJjZUtleSA9PT0gc291cmNlU2Vzc2lvbktleSB8fCBpc0RlZmF1bHRDaGF0VXJpKHNvdXJjZUtleSk7XG5cdFx0Y29uc3Qgc291cmNlQ2hhdEtleSA9IGlzRGVmYXVsdFNvdXJjZSA/IGRlZmF1bHRDaGF0S2V5IDogc291cmNlS2V5O1xuXHRcdHJldHVybiB7XG5cdFx0XHRzb3VyY2VTZXNzaW9uS2V5LFxuXHRcdFx0c291cmNlQ2hhdEtleSxcblx0XHRcdHNvdXJjZVN0YXRlOiBpc0RlZmF1bHRTb3VyY2Vcblx0XHRcdFx0PyAodGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShkZWZhdWx0Q2hhdEtleSkgPz8gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldERlZmF1bHRDaGF0U3RhdGUoc291cmNlU2Vzc2lvbktleSkpXG5cdFx0XHRcdDogYXdhaXQgdGhpcy5fc3RhdGVNYW5hZ2VyLnJlc29sdmVDaGF0U3RhdGUoc291cmNlQ2hhdEtleSksXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGRpc3Bvc2VDaGF0KHNlc3Npb246IFVSSSwgY2hhdDogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbktleSA9IHNlc3Npb24udG9TdHJpbmcoKTtcblx0XHRjb25zdCBjaGF0S2V5ID0gY2hhdC50b1N0cmluZygpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fZmluZFByb3ZpZGVyRm9yU2Vzc2lvbihzZXNzaW9uKTtcblx0XHR0aGlzLl9kaXNwb3NpbmdQZWVyQ2hhdHMuYWRkKGNoYXRLZXkpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9jaGVja3BvaW50U2VydmljZS5kaXNjYXJkQ2hhdFR1cm5TdGFydENoZWNrcG9pbnRzKHNlc3Npb24sIGNoYXQpO1xuXHRcdFx0aWYgKHByb3ZpZGVyKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2Rpc3Bvc2VDaGF0KHByb3ZpZGVyLCBjaGF0KTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuX3JlbW92ZVBlcnNpc3RlZFBlZXJDaGF0KHNlc3Npb24sIGNoYXQpO1xuXHRcdFx0dGhpcy5fc2lkZUVmZmVjdHMuY2xlYXJRdWV1ZWRNZXNzYWdlU2VuZGVycyhjaGF0S2V5KTtcblx0XHRcdHRoaXMuX3NpZGVFZmZlY3RzLmNhbmNlbFN1YmFnZW50U2Vzc2lvbnMoY2hhdEtleSk7XG5cdFx0XHR0aGlzLl9zaWRlRWZmZWN0cy5jbGVhckNoYW5uZWxUZWxlbWV0cnkoY2hhdEtleSk7XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIucmVtb3ZlQ2hhdChzZXNzaW9uS2V5LCBjaGF0S2V5KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fZGlzcG9zaW5nUGVlckNoYXRzLmRlbGV0ZShjaGF0S2V5KTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0tIENoYXQgZGlzcGF0Y2ggYWRhcHRlciAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0Ly9cblx0Ly8gVGhlIG9yY2hlc3RyYXRvciBvd25zIHRoZSBmZWF0dXJlLWxldmVsIGAoc2Vzc2lvbiwgY2hhdClgIFx1MjE5MlxuXHQvLyBgKGFnZW50LCBzZXNzaW9uLCBjaGF0KWAgbWFwcGluZy4gSXQgZGlzcGF0Y2hlcyBhZ2FpbnN0IGFuIGFnZW50J3Ncblx0Ly8gY2hhdC1hZGRyZXNzZWQgc3VyZmFjZSAoe0BsaW5rIElBZ2VudC5jaGF0c30pIGFuZCBzZXNzaW9uIGxpZmVjeWNsZVxuXHQvLyAoe0BsaW5rIElBZ2VudC5jcmVhdGVTZXNzaW9ufS97QGxpbmsgSUFnZW50LmRpc3Bvc2VTZXNzaW9ufSkuXG5cblx0LyoqIFdoZXRoZXIgYHByb3ZpZGVyYCBjYW4gaG9zdCBhZGRpdGlvbmFsIChwZWVyKSBjaGF0cy4gKi9cblx0cHJpdmF0ZSBfc3VwcG9ydHNDaGF0cyhwcm92aWRlcjogSUFnZW50KTogYm9vbGVhbiB7XG5cdFx0Ly8gR2F0ZSBhZGRpdGlvbmFsIGNoYXRzIG9uIHRoZSBhZHZlcnRpc2VkIGBtdWx0aXBsZUNoYXRzYCBjYXBhYmlsaXR5LFxuXHRcdC8vIG5vdCBtZXJlbHkgb24gdGhlIHByZXNlbmNlIG9mIGEgYGNoYXRzYCBzdXJmYWNlLlxuXHRcdHJldHVybiAhIXByb3ZpZGVyLmdldERlc2NyaXB0b3IoKS5jYXBhYmlsaXRpZXM/Lm11bHRpcGxlQ2hhdHM7XG5cdH1cblxuXHRwcml2YXRlIF9jaGF0Q29udGV4dChzZXNzaW9uOiBVUkksIGNoYXQ6IFVSSSk6IElBZ2VudENoYXRDb250ZXh0IHtcblx0XHRyZXR1cm4gY3JlYXRlQWdlbnRDaGF0Q29udGV4dCh0aGlzLl9zdGF0ZU1hbmFnZXIsIHNlc3Npb24sIGNoYXQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIExhc3QgaG9zdC1wdWJsaXNoZWQgY3VzdG9taXphdGlvbiBzbmFwc2hvdCBmb3IgdGhlIHNlc3Npb24sIHBhc3NlZFxuXHQgKiBleHBsaWNpdGx5IHRvIHByb3ZpZGVycy4gYHVuZGVmaW5lZGAgbWVhbnMgXCJubyBzbmFwc2hvdCB5ZXRcIiwgbm90IFwiYW5cblx0ICogZW1wdHkgY3VzdG9taXphdGlvbiBsaXN0XCIuXG5cdCAqL1xuXHRwcml2YXRlIF9ob3N0Q3VzdG9taXphdGlvbnMoc2Vzc2lvbjogVVJJKTogcmVhZG9ubHkgQ3VzdG9taXphdGlvbltdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpPy5jdXN0b21pemF0aW9ucztcblx0fVxuXG5cdC8qKiBNaW50cyB0aGUgc2Vzc2lvbiBVUkkgYmVmb3JlIHRoZSBjb2xsYXBzZWQgYGNyZWF0ZUNoYXRgIHBhdGggZGVyaXZlcyBpdHMgZGVmYXVsdC1jaGF0IFVSSS4gKi9cblx0cHJpdmF0ZSBfbWludFNlc3Npb25VcmkocHJvdmlkZXI6IElBZ2VudCk6IFVSSSB7XG5cdFx0cmV0dXJuIEFnZW50U2Vzc2lvbi51cmkocHJvdmlkZXIuaWQsIGdlbmVyYXRlVXVpZCgpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZVByb3ZpZGVyU2Vzc2lvbihwcm92aWRlcjogSUFnZW50LCBjb25maWc6IElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcgfCB1bmRlZmluZWQsIGRlZmVyV29ya3RyZWVDcmVhdGlvbjogYm9vbGVhbik6IFByb21pc2U8SUFnZW50Q3JlYXRlU2Vzc2lvblJlc3VsdD4ge1xuXHRcdGNvbnN0IHJlcXVlc3RlZFNlc3Npb25JZCA9IGRlZmVyV29ya3RyZWVDcmVhdGlvbiAmJiBjb25maWc/LnNlc3Npb24gPyBBZ2VudFNlc3Npb24uaWQoY29uZmlnLnNlc3Npb24pIDogdW5kZWZpbmVkO1xuXHRcdGlmIChyZXF1ZXN0ZWRTZXNzaW9uSWQpIHtcblx0XHRcdHRoaXMuX3dvcmt0cmVlPy5ub3RlUGVuZGluZyhyZXF1ZXN0ZWRTZXNzaW9uSWQpO1xuXHRcdH1cblxuXHRcdGxldCBjcmVhdGVkOiBJQWdlbnRDcmVhdGVTZXNzaW9uUmVzdWx0IHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwcm92aWRlckNvbmZpZyA9IGNvbmZpZyA/IHRoaXMuX3RvUHJvdmlkZXJDb25maWcoY29uZmlnKSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBjb25maWc/LnNlc3Npb24gPz8gdGhpcy5fbWludFNlc3Npb25VcmkocHJvdmlkZXIpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXRVcmkgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSk7XG5cdFx0XHRjb25zdCBib3VuZENvbmZpZzogSUFnZW50Q3JlYXRlU2Vzc2lvbkNvbmZpZyA9IHsgLi4uKHByb3ZpZGVyQ29uZmlnID8/IHt9KSwgc2Vzc2lvbiB9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIuY2hhdHMuY3JlYXRlQ2hhdChkZWZhdWx0Q2hhdFVyaSwgdGhpcy5fY2hhdENvbnRleHQoc2Vzc2lvbiwgZGVmYXVsdENoYXRVcmkpLCB0aGlzLl90b0NyZWF0ZUNoYXRPcHRpb25zKGJvdW5kQ29uZmlnKSk7XG5cdFx0XHRjcmVhdGVkID0ge1xuXHRcdFx0XHRzZXNzaW9uLFxuXHRcdFx0XHQuLi4ocmVzdWx0Py5wcm9qZWN0ID8geyBwcm9qZWN0OiByZXN1bHQucHJvamVjdCB9IDoge30pLFxuXHRcdFx0XHQuLi4ocmVzdWx0Py5yZXNvbHZlZFdvcmtpbmdEaXJlY3RvcnkgPyB7IHJlc29sdmVkV29ya2luZ0RpcmVjdG9yeTogcmVzdWx0LnJlc29sdmVkV29ya2luZ0RpcmVjdG9yeSB9IDoge30pLFxuXHRcdFx0XHQuLi4ocmVzdWx0Py5wcm92aXNpb25hbCA/IHsgcHJvdmlzaW9uYWw6IHRydWUgfSA6IHt9KSxcblx0XHRcdFx0Li4uKHJlc3VsdCA/IHsgY2hhdDogcmVzdWx0IH0gOiB7fSksXG5cdFx0XHR9O1xuXHRcdFx0aWYgKGRlZmVyV29ya3RyZWVDcmVhdGlvbiAmJiBjcmVhdGVkLnByb3Zpc2lvbmFsKSB7XG5cdFx0XHRcdHRoaXMuX3dvcmt0cmVlPy5ub3RlUGVuZGluZyhBZ2VudFNlc3Npb24uaWQoY3JlYXRlZC5zZXNzaW9uKSk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aGlzLl9wZXJzaXN0RGVmYXVsdENoYXRCYWNraW5nKGNyZWF0ZWQpO1xuXHRcdFx0cmV0dXJuIGNyZWF0ZWQ7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAoY3JlYXRlZCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9yb2xsYmFja1Byb3ZpZGVyU2Vzc2lvbihwcm92aWRlciwgY3JlYXRlZC5zZXNzaW9uKTtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycjtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y29uc3QgcmV0dXJuZWRQZW5kaW5nU2Vzc2lvbklkID0gY3JlYXRlZD8ucHJvdmlzaW9uYWwgPyBBZ2VudFNlc3Npb24uaWQoY3JlYXRlZC5zZXNzaW9uKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChyZXF1ZXN0ZWRTZXNzaW9uSWQgJiYgcmVxdWVzdGVkU2Vzc2lvbklkICE9PSByZXR1cm5lZFBlbmRpbmdTZXNzaW9uSWQpIHtcblx0XHRcdFx0dGhpcy5fd29ya3RyZWU/LmNsZWFyUGVuZGluZyhyZXF1ZXN0ZWRTZXNzaW9uSWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBCZXN0LWVmZm9ydCByb2xsYmFjayBmb3IgYSBwYXJ0aWFsbHktY3JlYXRlZCBwcm92aWRlciBzZXNzaW9uLiBDcmVhdGlvblxuXHQgKiBvbmx5IHByb3Zpc2lvbnMgdGhlIGRlZmF1bHQgY2hhdCwgc28gcm9sbGJhY2sgZGlzcG9zZXMgdGhhdCBvbmUgY2hhdCBhbmRcblx0ICogdGhlIGNhbGxlciByZXRocm93cyB0aGUgb3JpZ2luYWwgZXJyb3IuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yb2xsYmFja1Byb3ZpZGVyU2Vzc2lvbihwcm92aWRlcjogSUFnZW50LCBzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkZWZhdWx0Q2hhdFVyaSA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcHJvdmlkZXIuY2hhdHMuZGlzcG9zZUNoYXQoZGVmYXVsdENoYXRVcmksIHRoaXMuX2NoYXRDb250ZXh0KHNlc3Npb24sIGRlZmF1bHRDaGF0VXJpKSk7XG5cdFx0fSBjYXRjaCAoZGlzcG9zZUVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGRpc3Bvc2VFcnJvciwgYFtBZ2VudFNlcnZpY2VdIEZhaWxlZCB0byByb2xsIGJhY2sgZGVmYXVsdCBjaGF0IG9mIHByb3ZpZGVyIHNlc3Npb24gJHtzZXNzaW9uLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U2Vzc2lvbkNoYXRzSW5UZWFyZG93bk9yZGVyKHNlc3Npb246IFVSSSk6IFVSSVtdIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IHN0YXRlPy5kZWZhdWx0Q2hhdCA/PyBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0Y29uc3QgcmVzdWx0OiBVUklbXSA9IFtdO1xuXHRcdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IHN1bW1hcnkgb2Ygc3RhdGU/LmNoYXRzID8/IFtdKSB7XG5cdFx0XHRpZiAoc3VtbWFyeS5yZXNvdXJjZSAhPT0gZGVmYXVsdENoYXQgJiYgIXNlZW4uaGFzKHN1bW1hcnkucmVzb3VyY2UpKSB7XG5cdFx0XHRcdHNlZW4uYWRkKHN1bW1hcnkucmVzb3VyY2UpO1xuXHRcdFx0XHRyZXN1bHQucHVzaChVUkkucGFyc2Uoc3VtbWFyeS5yZXNvdXJjZSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoIXNlZW4uaGFzKGRlZmF1bHRDaGF0KSkge1xuXHRcdFx0cmVzdWx0LnB1c2goVVJJLnBhcnNlKGRlZmF1bHRDaGF0KSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogRGVzdHJ1Y3RpdmVseSB0ZWFycyBhIHNlc3Npb24gZG93bjogZGlzcG9zZSBwZWVyIGNoYXRzIGZpcnN0IGFuZCB0aGVcblx0ICogZGVmYXVsdCBjaGF0IGxhc3QsIGFuZCBzdGlsbCB2aXNpdCBldmVyeSBjaGF0IGlmIG9uZSByZWplY3RzLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZGlzcG9zZVNlc3Npb24ocHJvdmlkZXI6IElBZ2VudCwgc2Vzc2lvbjogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fZGVmYXVsdENoYXRCYWNraW5nV3JpdGVzLmdldChzZXNzaW9uLnRvU3RyaW5nKCkpPy5jYXRjaCgoKSA9PiB7IH0pO1xuXHRcdGxldCBmaXJzdEVycm9yOiB1bmtub3duO1xuXHRcdGZvciAoY29uc3QgY2hhdCBvZiB0aGlzLl9nZXRTZXNzaW9uQ2hhdHNJblRlYXJkb3duT3JkZXIoc2Vzc2lvbikpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHByb3ZpZGVyLmNoYXRzLmRpc3Bvc2VDaGF0KGNoYXQsIHRoaXMuX2NoYXRDb250ZXh0KHNlc3Npb24sIGNoYXQpKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRmaXJzdEVycm9yID8/PSBlcnI7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChmaXJzdEVycm9yICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IGZpcnN0RXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlbGVhc2VzIGEgc2Vzc2lvbidzIGluLW1lbW9yeSBmb290cHJpbnQgd2l0aG91dCBkZWxldGluZyBkdXJhYmxlIGRhdGEuXG5cdCAqIElkbGUgZXZpY3Rpb24gbXVzdCB1c2Uge0BsaW5rIElBZ2VudENoYXRzLnJlbGVhc2VDaGF0fSwgbm90IGRlc3RydWN0aXZlXG5cdCAqIHNlc3Npb24gZmluYWxpemF0aW9uLCBzbyB0aGUgc2Vzc2lvbiByZW1haW5zIHJlc3VtYWJsZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3JlbGVhc2VTZXNzaW9uKHByb3ZpZGVyOiBJQWdlbnQsIHNlc3Npb246IFVSSSwgY2hhdHM6IHJlYWRvbmx5IFVSSVtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fZGVmYXVsdENoYXRCYWNraW5nV3JpdGVzLmdldChzZXNzaW9uLnRvU3RyaW5nKCkpPy5jYXRjaCgoKSA9PiB7IH0pO1xuXHRcdC8vIFN0aWxsIHJlbGVhc2UgZXZlcnkgY2F0YWxvZyBjaGF0IGlmIG9uZSByZWplY3RzOyBvdGhlcndpc2UgYW4gaWRsZS1ldmljdGVkXG5cdFx0Ly8gc2Vzc2lvbiBjb3VsZCBsZWF2ZSBhIGNoYXQgcmVzaWRlbnQgaW5kZWZpbml0ZWx5LlxuXHRcdGxldCBmaXJzdEVycm9yOiB1bmtub3duO1xuXHRcdGZvciAoY29uc3QgY2hhdCBvZiBjaGF0cykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgcHJvdmlkZXIuY2hhdHMucmVsZWFzZUNoYXQoY2hhdCwgdGhpcy5fY2hhdENvbnRleHQoc2Vzc2lvbiwgY2hhdCkpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGZpcnN0RXJyb3IgPz89IGVycjtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGZpcnN0RXJyb3IgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhyb3cgZmlyc3RFcnJvcjtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVjb25zdHJ1Y3QgdGhlIHR1cm5zIGZvciBhIGNoYXQuIGBjaGF0YCBpcyB0aGUgY29uY3JldGUgY2hhdCBjaGFubmVsIFVSSSxcblx0ICogZXhjZXB0IGZvciBsZWdhY3kgcmVzdG9yZSBwYXRocyB0aGF0IHN0aWxsIGFkZHJlc3Mgc3ViYWdlbnQgc2Vzc2lvbnMuXG5cdCAqXG5cdCAqIGBvcmlnaW5gIGlzIG9ubHkgc3VwcGxpZWQgYnkgcmVzdG9yZSBwYXRocyB0aGF0IHJlY29uc3RydWN0IGEgY2hhdCdzIHR1cm5zXG5cdCAqICpiZWZvcmUqIHRoZSBjaGF0IGlzIHJlZ2lzdGVyZWQgaW4gdGhlIGNhdGFsb2csIHNvIHRoZSBob3N0LW93bmVkIGNvbnRleHRcblx0ICogY2Fubm90IHN1cHBseSBpdCB5ZXQuIEl0IHRha2VzIHByZWNlZGVuY2Ugb3ZlciB0aGUgY2F0YWxvZyB2YWx1ZSBmb3Jcblx0ICogZXhhY3RseSB0aGF0IHdpbmRvdzsgZXZlcnkgb3RoZXIgY2FsbGVyIHJlbGllcyBvbiB0aGUgZXhoYXVzdGl2ZSBvcmlnaW5cblx0ICoge0BsaW5rIF9jaGF0Q29udGV4dH0gc3RhbXBzLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZ2V0Q2hhdE1lc3NhZ2VzKHByb3ZpZGVyOiBJQWdlbnQsIGNoYXQ6IFVSSSwgc2Vzc2lvbjogVVJJLCBvcmlnaW4/OiBDaGF0T3JpZ2luKTogUHJvbWlzZTxyZWFkb25seSBUdXJuW10+IHtcblx0XHRjb25zdCBjb250ZXh0ID0geyAuLi50aGlzLl9jaGF0Q29udGV4dChzZXNzaW9uLCBjaGF0KSwgLi4uKG9yaWdpbiA/IHsgb3JpZ2luIH0gOiB7fSkgfTtcblx0XHRjb25zdCB0dXJucyA9IGF3YWl0IHRoaXMuX2FwcGx5UGVyc2lzdGVkVHVyblVzYWdlKGNoYXQsIGF3YWl0IHByb3ZpZGVyLmNoYXRzLmdldE1lc3NhZ2VzKGNoYXQsIGNvbnRleHQpKTtcblx0XHQvLyBIb3N0LW93bmVkIHdvcmt0cmVlIHJlc3RvcmUgYW5ub3VuY2VtZW50OiByZS1pbmplY3QgdGhlIFwiQ3JlYXRlZCBpc29sYXRlZFxuXHRcdC8vIHdvcmt0cmVlXCIgbWVzc2FnZSBhdCB0aGUgdG9wIG9mIHRoZSBkZWZhdWx0IGNoYXQncyBmaXJzdCB0dXJuIGZyb21cblx0XHQvLyBwZXJzaXN0ZWQgbWV0YWRhdGEuIE5vLW9wIGZvciBmb2xkZXIgc2Vzc2lvbnMgYW5kIG5vbi1kZWZhdWx0IGNoYXRzIChwZWVyXG5cdFx0Ly8gLyBzdWJhZ2VudCkuIEFnZW50cyBzdGF5IHVuYXdhcmUgb2Ygd29ya3RyZWVzLlxuXHRcdGlmICh0aGlzLl93b3JrdHJlZSAmJiBpc0RlZmF1bHRDaGF0VXJpKGNoYXQpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fd29ya3RyZWUuYXBwbHlSZXN0b3JlQW5ub3VuY2VtZW50KFVSSS5wYXJzZShwYXJzZVJlcXVpcmVkU2Vzc2lvblVyaUZyb21DaGF0VXJpKGNoYXQudG9TdHJpbmcoKSkpLCB0dXJucyk7XG5cdFx0fVxuXHRcdHJldHVybiB0dXJucztcblx0fVxuXG5cdC8qKlxuXHQgKiBSZS1hdHRhY2hlcyBwZXJzaXN0ZWQgcGVyLXR1cm4ge0BsaW5rIFVzYWdlSW5mb30gdG8gcmVjb25zdHJ1Y3RlZCB0dXJucy5cblx0ICpcblx0ICogQWdlbnQgYmFja2VuZHMgZG9uJ3QgZHVyYWJseSByZWNvcmQgdG9rZW4vY3JlZGl0IHVzYWdlIFx1MjAxNCB0aGUgQ29waWxvdFxuXHQgKiBTREsncyBgYXNzaXN0YW50LnVzYWdlYCBldmVudCBpcyBleHBsaWNpdGx5IGVwaGVtZXJhbCBhbmQgdGhlIENsYXVkZVxuXHQgKiB0cmFuc2NyaXB0IHJlcGxheSBwcm9kdWNlcyBub25lIFx1MjAxNCBzbyByZXN0b3JlZCB0dXJucyBjb21lIGJhY2sgd2l0aG91dCBpdC5cblx0ICogV2l0aG91dCB0aGlzIHRoZSBjaGF0J3MgY29udGV4dC11c2FnZSBnYXVnZSBzdGF5cyBoaWRkZW4gYWZ0ZXIgYSByZWxvYWRcblx0ICogYW5kIHRoZSBzZXNzaW9uIGNvc3QgdG90YWwgcmVzdGFydHMgZnJvbSB6ZXJvLiBVc2FnZSByZWNvcmRlZCBsaXZlIGJ5XG5cdCAqIHtAbGluayBBZ2VudFNpZGVFZmZlY3RzfSBpcyBsb29rZWQgdXAgYnkgdHVybiBpZCAob3IgdGhlIHR1cm4ncyBTREsgZXZlbnRcblx0ICogaWQsIHdoaWNoIGlzIHdoYXQgYSByZXN0b3JlZCB0dXJuIGlzIGtleWVkIGJ5KS5cblx0ICpcblx0ICogTk9URTogdGhlIGxvb2t1cCBvbmx5IGxhbmRzIGZvciBwcm92aWRlcnMgdGhhdCByZWNvcmQgdGhlIGJyaWRnZSBiZXR3ZWVuXG5cdCAqIHRoZSBsaXZlIHByb3RvY29sIHR1cm4gaWQgKGEgaG9zdC1nZW5lcmF0ZWQgdXVpZCkgYW5kIHRoZSBpZCBhIHJlc3RvcmVkXG5cdCAqIHR1cm4gaXMga2V5ZWQgYnkuIFRvZGF5IG9ubHkgQ29waWxvdCBkb2VzLCB2aWEgYHNldFR1cm5FdmVudElkYC4gQ2xhdWRlXG5cdCAqIHJlc3RvcmVzIHR1cm5zIGtleWVkIGJ5IHRyYW5zY3JpcHQgdXVpZCBhbmQgbmV2ZXIgcG9wdWxhdGVzXG5cdCAqIGB0dXJucy5ldmVudF9pZGAsIHNvIGl0cyByb3dzIGFyZSB3cml0dGVuIGJ1dCBuZXZlciBtYXRjaGVkOyBnaXZpbmcgaXQgYVxuXHQgKiBnYXVnZSBhZnRlciByZWxvYWQgbmVlZHMgdGhhdCBicmlkZ2UgcmVjb3JkZWQgZmlyc3QuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9hcHBseVBlcnNpc3RlZFR1cm5Vc2FnZShjaGF0OiBVUkksIHR1cm5zOiByZWFkb25seSBUdXJuW10pOiBQcm9taXNlPHJlYWRvbmx5IFR1cm5bXT4ge1xuXHRcdGlmICh0dXJucy5sZW5ndGggPT09IDAgfHwgdHVybnMuZXZlcnkodHVybiA9PiBoYXNSZXBvcnRlZFVzYWdlKHR1cm4udXNhZ2UpKSB8fCBpc1N1YmFnZW50Q2hhdFVyaShjaGF0LnRvU3RyaW5nKCkpKSB7XG5cdFx0XHRyZXR1cm4gdHVybnM7XG5cdFx0fVxuXHRcdC8vIFNhbWUgc3RvcmFnZSB0aGUgd3JpdGVyIHVzZWQ7IHNlZSBgY2hhdFN0b3JhZ2VVcmlgLlxuXHRcdGNvbnN0IHN0b3JhZ2UgPSBjaGF0U3RvcmFnZVVyaShjaGF0KTtcblx0XHRpZiAoIXN0b3JhZ2UpIHtcblx0XHRcdHJldHVybiB0dXJucztcblx0XHR9XG5cdFx0bGV0IHVzYWdlczogTWFwPHN0cmluZywgc3RyaW5nPjtcblx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2UudHJ5T3BlbkRhdGFiYXNlKHN0b3JhZ2UpO1xuXHRcdGlmICghcmVmKSB7XG5cdFx0XHRyZXR1cm4gdHVybnM7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHR1c2FnZXMgPSBhd2FpdCByZWYub2JqZWN0LmdldFR1cm5Vc2FnZXMoKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV0gRmFpbGVkIHRvIHJlYWQgcGVyc2lzdGVkIHR1cm4gdXNhZ2UgZm9yICR7c3RvcmFnZS50b1N0cmluZygpfWAsIGVycik7XG5cdFx0XHRyZXR1cm4gdHVybnM7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdGlmICh1c2FnZXMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHR1cm5zO1xuXHRcdH1cblx0XHRyZXR1cm4gdHVybnMubWFwKHR1cm4gPT4ge1xuXHRcdFx0Y29uc3QgcmF3ID0gaGFzUmVwb3J0ZWRVc2FnZSh0dXJuLnVzYWdlKSA/IHVuZGVmaW5lZCA6IHVzYWdlcy5nZXQodHVybi5pZCk7XG5cdFx0XHRpZiAoIXJhdykge1xuXHRcdFx0XHRyZXR1cm4gdHVybjtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHBhcnNlZDogdW5rbm93biA9IEpTT04ucGFyc2UocmF3KTtcblx0XHRcdFx0Ly8gTmV2ZXIgc3ByZWFkIGFuIHVudHlwZWQgcGF5bG9hZCBibGluZDogYSBjb3JydXB0ZWQgY29sdW1uXG5cdFx0XHRcdC8vIGhvbGRpbmcgYSBzdHJpbmcgb3IgYXJyYXkgd291bGQgc3BsYXQgaW5kZXgga2V5cyBvbnRvIHRoZVxuXHRcdFx0XHQvLyB0dXJuJ3MgdXNhZ2UgYW5kIGZsb3cgdGhhdCBtYWxmb3JtZWQgc2hhcGUgdG8gdGhlIHJlbmRlcmVyLlxuXHRcdFx0XHRpZiAoIXBhcnNlZCB8fCB0eXBlb2YgcGFyc2VkICE9PSAnb2JqZWN0JyB8fCBBcnJheS5pc0FycmF5KHBhcnNlZCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBwZXJzaXN0ZWQgPSBwYXJzZWQgYXMgVXNhZ2VJbmZvO1xuXHRcdFx0XHQvLyBNZXJnZSByYXRoZXIgdGhhbiByZXBsYWNlOiBhIHR1cm4gdGhhdCByYW4gb24gQXV0byBhbHJlYWR5XG5cdFx0XHRcdC8vIGNhcnJpZXMgYSB0b2tlbi1sZXNzIHN0dWIgaG9sZGluZyBgX21ldGEuYXV0b01vZGVSZXNvbHZlZGBcblx0XHRcdFx0Ly8gKHNlZSBgbWFwU2Vzc2lvbkV2ZW50c2ApLCB3aGljaCBkcml2ZXMgdGhlIFwiQXV0byAobW9kZWwpXCJcblx0XHRcdFx0Ly8gbGFiZWwuIFBlcnNpc3RlZCB2YWx1ZXMgd2luOyB0aGUgc3R1YiBmaWxscyB3aGF0IHRoZXkgbGFjay5cblx0XHRcdFx0Y29uc3QgbWV0YSA9IHsgLi4udHVybi51c2FnZT8uX21ldGEsIC4uLnBlcnNpc3RlZC5fbWV0YSB9O1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdC4uLnR1cm4sXG5cdFx0XHRcdFx0dXNhZ2U6IHtcblx0XHRcdFx0XHRcdC4uLnR1cm4udXNhZ2UsXG5cdFx0XHRcdFx0XHQuLi5wZXJzaXN0ZWQsXG5cdFx0XHRcdFx0XHQuLi4oT2JqZWN0LmtleXMobWV0YSkubGVuZ3RoID4gMCA/IHsgX21ldGE6IG1ldGEgfSA6IHt9KSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9O1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHJldHVybiB0dXJuO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1lcmdlcyBwZXJzaXN0ZWQgaG9zdC1pbmplY3RlZCBsb2NhbCB0dXJucyAoYC9yZW5hbWVgLCBgIWNvbW1hbmRgKSBmb3Jcblx0ICogYGNoYXRVcmlgIGJhY2sgaW50byB0aGF0IGNoYXQncyBTREstZGVyaXZlZCBgdHVybnNgLCBwb3NpdGlvbmVkIGFmdGVyXG5cdCAqIHRoZWlyIGFuY2hvciB0dXJuICh0aGUgY29uY3JldGUgdHVybiB0aGV5IHdlcmUgcmVjb3JkZWQgYWZ0ZXIpLiBMb2NhbHNcblx0ICogYW5jaG9yZWQgYmVmb3JlIGFueSByZWFsIHR1cm4gYXJlIHByZXBlbmRlZDsgbG9jYWxzIHdob3NlIGFuY2hvciBpcyBhYnNlbnRcblx0ICogZnJvbSB0aGUgU0RLIHR1cm5zIChlLmcuIHRydW5jYXRlZCBhd2F5KSBhcmUgZHJvcHBlZC4gQWxzbyBzZWVkcyB0aGVcblx0ICogaW4tbWVtb3J5IGxvY2FsLXR1cm4gaW5kZXggc28gZm9yay90cnVuY2F0ZSByZXNvbHZlIGNvcnJlY3RseSBiZWZvcmUgdGhlXG5cdCAqIG5leHQgcmVsb2FkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfaW50ZXJsZWF2ZUxvY2FsVHVybnMoc2Vzc2lvblN0cjogc3RyaW5nLCBjaGF0VXJpOiBzdHJpbmcsIHR1cm5zOiByZWFkb25seSBUdXJuW10pOiBQcm9taXNlPFR1cm5bXT4ge1xuXHRcdGNvbnN0IHJlY29yZHMgPSBhd2FpdCB0aGlzLl9sb2NhbFR1cm5zLmxvYWRGb3JDaGF0KHNlc3Npb25TdHIsIGNoYXRVcmkpO1xuXHRcdGlmIChyZWNvcmRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFsuLi50dXJuc107XG5cdFx0fVxuXHRcdGNvbnN0IGtub3duSWRzID0gbmV3IFNldCh0dXJucy5tYXAodCA9PiB0LmlkKSk7XG5cdFx0Y29uc3QgYnlBbmNob3IgPSBuZXcgTWFwPHN0cmluZywgVHVybltdPigpO1xuXHRcdGNvbnN0IGhlYWQ6IFR1cm5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcmVjb3JkIG9mIHJlY29yZHMpIHtcblx0XHRcdGxldCB0dXJuOiBUdXJuO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dHVybiA9IEpTT04ucGFyc2UocmVjb3JkLnBheWxvYWQpIGFzIFR1cm47XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVjb3JkLmFuY2hvclR1cm5JZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGhlYWQucHVzaCh0dXJuKTtcblx0XHRcdH0gZWxzZSBpZiAoa25vd25JZHMuaGFzKHJlY29yZC5hbmNob3JUdXJuSWQpKSB7XG5cdFx0XHRcdGNvbnN0IGxpc3QgPSBieUFuY2hvci5nZXQocmVjb3JkLmFuY2hvclR1cm5JZCkgPz8gW107XG5cdFx0XHRcdGxpc3QucHVzaCh0dXJuKTtcblx0XHRcdFx0YnlBbmNob3Iuc2V0KHJlY29yZC5hbmNob3JUdXJuSWQsIGxpc3QpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gZWxzZTogb3JwaGFuZWQgKGFuY2hvciB0cnVuY2F0ZWQgYXdheSkgXHUyMTkyIGRyb3AuXG5cdFx0fVxuXHRcdGNvbnN0IG1lcmdlZDogVHVybltdID0gWy4uLmhlYWRdO1xuXHRcdGZvciAoY29uc3QgdHVybiBvZiB0dXJucykge1xuXHRcdFx0bWVyZ2VkLnB1c2godHVybik7XG5cdFx0XHRjb25zdCBsb2NhbHMgPSBieUFuY2hvci5nZXQodHVybi5pZCk7XG5cdFx0XHRpZiAobG9jYWxzKSB7XG5cdFx0XHRcdG1lcmdlZC5wdXNoKC4uLmxvY2Fscyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBtZXJnZWQ7XG5cdH1cblxuXHQvKipcblx0ICogUmUtcGVyc2lzdHMgZm9ya2VkIGhvc3QtaW5qZWN0ZWQgbG9jYWwgdHVybnMgKGAvcmVuYW1lYCwgYCFjb21tYW5kYCkgaW50b1xuXHQgKiBhIG5ld2x5IGZvcmtlZCBjaGF0IHNvIHRoZXkgc3Vydml2ZSByZWxvYWQgYW5kIGFuY2hvciBmdXR1cmVcblx0ICogZm9yay90cnVuY2F0ZS4gYG9yaWdpbmFsU2xpY2VbaV1gIGFuZCBgZm9ya2VkVHVybnNbaV1gIGFyZSB0aGUgc291cmNlIHR1cm5cblx0ICogYW5kIGl0cyByZW1hcHBlZCBjb3B5IChzYW1lIGxlbmd0aCwgMToxKTsgYG1hcHBpbmdgIGlzIHRoZSBvbGRcdTIxOTJuZXcgdHVybiBpZFxuXHQgKiBtYXAgdXNlZCB0byByZW1hcCBlYWNoIGxvY2FsIHR1cm4ncyBhbmNob3IuIGBwZXJzaXN0U2Vzc2lvbmAgb3ducyB0aGVcblx0ICogZGVzdGluYXRpb24gZGF0YWJhc2U7IGBzb3VyY2VDaGF0VXJpYCAvIGBuZXdDaGF0VXJpYCBrZXkgdGhlIHNvdXJjZSBhbmRcblx0ICogZGVzdGluYXRpb24gbG9jYWwtdHVybiBpbmRleGVzLlxuXHQgKlxuXHQgKiBTaGFyZWQgYnkgdGhlIHtAbGluayBjcmVhdGVTZXNzaW9ufSAoZGVmYXVsdC1jaGF0KSBhbmQge0BsaW5rIGNyZWF0ZUNoYXR9XG5cdCAqIChwZWVyLWNoYXQpIGZvcmsgcGF0aHMuXG5cdCAqL1xuXHRwcml2YXRlIF9wZXJzaXN0Rm9ya2VkTG9jYWxUdXJucyhwZXJzaXN0U2Vzc2lvbjogc3RyaW5nLCBzb3VyY2VDaGF0VXJpOiBzdHJpbmcsIG5ld0NoYXRVcmk6IHN0cmluZywgb3JpZ2luYWxTbGljZTogcmVhZG9ubHkgVHVybltdLCBmb3JrZWRUdXJuczogcmVhZG9ubHkgVHVybltdLCBtYXBwaW5nOiBSZWFkb25seU1hcDxzdHJpbmcsIHN0cmluZz4pOiB2b2lkIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IG9yaWdpbmFsU2xpY2UubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IG9yaWdpbmFsID0gb3JpZ2luYWxTbGljZVtpXTtcblx0XHRcdGlmICghdGhpcy5fbG9jYWxUdXJucy5pc0xvY2FsKHNvdXJjZUNoYXRVcmksIG9yaWdpbmFsLmlkKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG9yaWdpbmFsQW5jaG9yID0gdGhpcy5fbG9jYWxUdXJucy5yZXNvbHZlQ29uY3JldGVUdXJuSWQoc291cmNlQ2hhdFVyaSwgb3JpZ2luYWwuaWQpO1xuXHRcdFx0Y29uc3QgbmV3QW5jaG9yID0gb3JpZ2luYWxBbmNob3IgIT09IHVuZGVmaW5lZCA/IG1hcHBpbmcuZ2V0KG9yaWdpbmFsQW5jaG9yKSA6IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2xvY2FsVHVybnMucmVjb3JkKHBlcnNpc3RTZXNzaW9uLCBuZXdDaGF0VXJpLCBmb3JrZWRUdXJuc1tpXSwgbmV3QW5jaG9yKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIChvciBmb3JrKSB0aGUgcGVlciBjaGF0IGBjaGF0YCB3aXRoaW4gYHNlc3Npb25gLiBgY2hhdGAgaXNcblx0ICogYWx3YXlzIGEgcGVlciBVUkkgaGVyZSAodGhlIGRlZmF1bHQgY2hhdCBpcyBjcmVhdGVkIGltcGxpY2l0bHkgd2l0aFxuXHQgKiB0aGUgc2Vzc2lvbiksIHNvIG5vIGRlZmF1bHQtY2hhdCByZXNvbHV0aW9uIGlzIG5lZWRlZC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZUNoYXQocHJvdmlkZXI6IElBZ2VudCwgY2hhdDogVVJJLCBzZXNzaW9uOiBVUkksIG9wdGlvbnM6IElBZ2VudENyZWF0ZUNoYXRPcHRpb25zIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxJQWdlbnRDcmVhdGVDaGF0UmVzdWx0IHwgdm9pZD4ge1xuXHRcdGNvbnN0IHBsYWNlbWVudCA9IHRoaXMuX2J1aWxkQ2hhdFBsYWNlbWVudChzZXNzaW9uKTtcblx0XHRjb25zdCBjb252T3B0aW9uczogSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMgfCB1bmRlZmluZWQgPSAob3B0aW9ucz8udGl0bGUgIT09IHVuZGVmaW5lZCB8fCBvcHRpb25zPy5tb2RlbCAhPT0gdW5kZWZpbmVkIHx8IG9wdGlvbnM/LnNpZGVDaGF0ICE9PSB1bmRlZmluZWQgfHwgcGxhY2VtZW50KVxuXHRcdFx0PyB7XG5cdFx0XHRcdC4uLihvcHRpb25zPy50aXRsZSAhPT0gdW5kZWZpbmVkID8geyB0aXRsZTogb3B0aW9ucy50aXRsZSB9IDoge30pLFxuXHRcdFx0XHQuLi4ob3B0aW9ucz8ubW9kZWwgIT09IHVuZGVmaW5lZCA/IHsgbW9kZWw6IG9wdGlvbnMubW9kZWwgfSA6IHt9KSxcblx0XHRcdFx0Li4uKG9wdGlvbnM/LnNpZGVDaGF0ICE9PSB1bmRlZmluZWQgPyB7IHNpZGVDaGF0OiBvcHRpb25zLnNpZGVDaGF0IH0gOiB7fSksXG5cdFx0XHRcdC4uLihwbGFjZW1lbnQ/LndvcmtpbmdEaXJlY3RvcmllcyA/IHsgd29ya2luZ0RpcmVjdG9yaWVzOiBwbGFjZW1lbnQud29ya2luZ0RpcmVjdG9yaWVzIH0gOiB7fSksXG5cdFx0XHRcdC4uLihwbGFjZW1lbnQ/LnByb2plY3QgPyB7IHByb2plY3Q6IHBsYWNlbWVudC5wcm9qZWN0IH0gOiB7fSksXG5cdFx0XHRcdC4uLihwbGFjZW1lbnQ/LmNvbmZpZyA/IHsgY29uZmlnOiBwbGFjZW1lbnQuY29uZmlnIH0gOiB7fSksXG5cdFx0XHR9XG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb250ZXh0ID0gdGhpcy5fY2hhdENvbnRleHQoc2Vzc2lvbiwgY2hhdCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcHJvdmlkZXIuY2hhdHMuY3JlYXRlQ2hhdChjaGF0LCBjb250ZXh0LCBvcHRpb25zPy5mb3JrID8geyAuLi5jb252T3B0aW9ucywgZm9yazogb3B0aW9ucy5mb3JrIH0gOiBjb252T3B0aW9ucyk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX3RvQ3JlYXRlQ2hhdE9wdGlvbnMoY29uZmlnOiBJQWdlbnRDcmVhdGVTZXNzaW9uQ29uZmlnKTogSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMge1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi4oY29uZmlnLm1vZGVsID8geyBtb2RlbDogY29uZmlnLm1vZGVsIH0gOiB7fSksXG5cdFx0XHQuLi4oY29uZmlnLmFnZW50ID8geyBhZ2VudDogY29uZmlnLmFnZW50IH0gOiB7fSksXG5cdFx0XHQuLi4oY29uZmlnLndvcmtpbmdEaXJlY3RvcmllcyA/IHsgd29ya2luZ0RpcmVjdG9yaWVzOiBjb25maWcud29ya2luZ0RpcmVjdG9yaWVzIH0gOiB7fSksXG5cdFx0XHQuLi4oY29uZmlnLmNvbmZpZyA/IHsgY29uZmlnOiBjb25maWcuY29uZmlnIH0gOiB7fSksXG5cdFx0XHQuLi4oY29uZmlnLmFjdGl2ZUNsaWVudCA/IHsgYWN0aXZlQ2xpZW50OiBjb25maWcuYWN0aXZlQ2xpZW50IH0gOiB7fSksXG5cdFx0XHQuLi4oIWNvbmZpZy5mb3JrICYmICFjb25maWcuaW1wb3J0Q29udmVyc2F0aW9uID8geyBkZWZlckJhY2tpbmc6IHRydWUgfSA6IHt9KSxcblx0XHRcdC4uLihjb25maWcuaW1wb3J0Q29udmVyc2F0aW9uID8geyBpbXBvcnRDb252ZXJzYXRpb246IGNvbmZpZy5pbXBvcnRDb252ZXJzYXRpb24gfSA6IHt9KSxcblx0XHRcdC4uLihjb25maWcuZm9yayA/IHtcblx0XHRcdFx0Zm9yazoge1xuXHRcdFx0XHRcdHNvdXJjZTogY29uZmlnLmZvcmsuY2hhdCxcblx0XHRcdFx0XHR0dXJuSW5kZXg6IGNvbmZpZy5mb3JrLnR1cm5JbmRleCxcblx0XHRcdFx0XHR0dXJuSWQ6IGNvbmZpZy5mb3JrLnR1cm5JZCxcblx0XHRcdFx0XHR0dXJuSWRNYXBwaW5nOiBjb25maWcuZm9yay50dXJuSWRNYXBwaW5nLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSA6IHt9KSxcblx0XHR9O1xuXHR9XG5cblx0LyoqIFJlc29sdmVzIHRoZSBvd25pbmcgc2Vzc2lvbiBjb250ZXh0IGZvciBjcmVhdGluZyBhbiBhZGRpdGlvbmFsIGNoYXQuICovXG5cdHByaXZhdGUgX2J1aWxkQ2hhdFBsYWNlbWVudChzZXNzaW9uOiBVUkkpOiBQaWNrPElBZ2VudENyZWF0ZUNoYXRPcHRpb25zLCAnd29ya2luZ0RpcmVjdG9yaWVzJyB8ICdwcm9qZWN0JyB8ICdjb25maWcnPiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yaWVzID0gc3RhdGU/LndvcmtpbmdEaXJlY3Rvcmllcz8ubWFwKGRpcmVjdG9yeSA9PiB0eXBlb2YgZGlyZWN0b3J5ID09PSAnc3RyaW5nJyA/IFVSSS5wYXJzZShkaXJlY3RvcnkpIDogZGlyZWN0b3J5KSA/PyBbXTtcblx0XHRjb25zdCByZXNvbHZlZFByaW1hcnkgPSB0aGlzLl93b3JrdHJlZT8uZ2V0UmVzb2x2ZWRXb3JrdHJlZShBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbikpO1xuXHRcdGlmIChyZXNvbHZlZFByaW1hcnkpIHtcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcmllc1swXSA9IHJlc29sdmVkUHJpbWFyeTtcblx0XHR9XG5cdFx0aWYgKHdvcmtpbmdEaXJlY3Rvcmllcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFNlc3Npb25Db25maWdWYWx1ZXMoc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzLFxuXHRcdFx0Li4uKHN0YXRlPy5wcm9qZWN0ID8geyBwcm9qZWN0OiB7IHVyaTogVVJJLnBhcnNlKHN0YXRlLnByb2plY3QudXJpKSwgZGlzcGxheU5hbWU6IHN0YXRlLnByb2plY3QuZGlzcGxheU5hbWUgfSB9IDoge30pLFxuXHRcdFx0Li4uKGNvbmZpZyAmJiBPYmplY3Qua2V5cyhjb25maWcpLmxlbmd0aCA+IDAgPyB7IGNvbmZpZyB9IDoge30pLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kaXNwb3NlQ2hhdChwcm92aWRlcjogSUFnZW50LCBjaGF0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gVVJJLnBhcnNlKHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmkoY2hhdCkpO1xuXHRcdGF3YWl0IHByb3ZpZGVyLmNoYXRzLmRpc3Bvc2VDaGF0KGNoYXQsIHRoaXMuX2NoYXRDb250ZXh0KHNlc3Npb24sIGNoYXQpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEZXJpdmVzIGEgcGxhY2Vob2xkZXIgdGl0bGUgZm9yIGFuIGltcG9ydGVkIHNlc3Npb24gZnJvbSBpdHMgZmlyc3QgdXNlclxuXHQgKiB0dXJuIChpbXBvcnRzIHNlZWQgcHJlLWV4aXN0aW5nIHR1cm5zLCBzbyB0aGUgbm9ybWFsIGZpcnN0LW1lc3NhZ2UgdGl0bGVcblx0ICogZ2VuZXJhdGlvbiBuZXZlciBmaXJlcykuIERlbGliZXJhdGVseSB1bnByZWZpeGVkOiBhbiBpbXBvcnRlZCBzZXNzaW9uIGlzIGFcblx0ICogY29udGludWF0aW9uIG9mIHRoZSBzb3VyY2UgY2hhdCwgbm90IGEgZGlzdGluY3Qga2luZCBvZiBzZXNzaW9uLCBzbyBpdFxuXHQgKiBzaG91bGQgcmVhZCBsaWtlIGFueSBvdGhlci4gVGhlIHBsYWNlaG9sZGVyIGlzIGxhdGVyIHJlZmluZWQgaW50byBhXG5cdCAqIGdlbmVyYXRlZCB0aXRsZSAoc2VlIHRoZSBgaW1wb3J0Q29udmVyc2F0aW9uYCBicmFuY2ggaW4gYGNyZWF0ZVNlc3Npb25gKSxcblx0ICogYnV0IGEgbmV1dHJhbCBub24tZW1wdHkgZmFsbGJhY2sgaXMga2VwdCBzbyB0aGUgc2Vzc2lvbiBzdGlsbCByZWFkcyBsaWtlIGFcblx0ICogbm9ybWFsIGNoYXQgd2hlbiBnZW5lcmF0aW9uIGlzIHVuYXZhaWxhYmxlIG9yIGZhaWxzLlxuXHQgKi9cblx0cHJpdmF0ZSBfYnVpbGRJbXBvcnRlZFRpdGxlKHR1cm5zOiByZWFkb25seSBUdXJuW10pOiBzdHJpbmcge1xuXHRcdGNvbnN0IGZpcnN0VGV4dCA9IHR1cm5zLmZpbmQodCA9PiB0Lm1lc3NhZ2U/LnRleHQ/LnRyaW0oKSk/Lm1lc3NhZ2UudGV4dC50cmltKCk7XG5cdFx0aWYgKCFmaXJzdFRleHQpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmltcG9ydGVkU2Vzc2lvbkZhbGxiYWNrJywgXCJOZXcgU2Vzc2lvblwiKTtcblx0XHR9XG5cdFx0Y29uc3QgTUFYID0gNjA7XG5cdFx0cmV0dXJuIGZpcnN0VGV4dC5sZW5ndGggPiBNQVggPyBgJHtmaXJzdFRleHQuc2xpY2UoMCwgTUFYKX0uLi5gIDogZmlyc3RUZXh0O1xuXHR9XG5cblx0cHJpdmF0ZSBfYnVpbGRJbml0aWFsU3VtbWFyeShwcm92aWRlcjogSUFnZW50LCBzZXNzaW9uOiBVUkksIGNvbmZpZzogSUFnZW50Q3JlYXRlU2Vzc2lvbkNvbmZpZyB8IHVuZGVmaW5lZCwgY3JlYXRlZDogeyBwcm9qZWN0PzogeyB1cmk6IFVSSTsgZGlzcGxheU5hbWU6IHN0cmluZyB9OyByZXNvbHZlZFdvcmtpbmdEaXJlY3Rvcnk/OiBVUkkgfSwgdGl0bGU6IHN0cmluZyk6IFNlc3Npb25TdW1tYXJ5IHtcblx0XHRjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG5cdFx0Y29uc3QgZXhwbGljaXRHaXRIdWJTdGF0ZSA9IHJlYWRTZXNzaW9uR2l0SHViU3RhdGUoY29uZmlnPy5fbWV0YSk7XG5cdFx0Y29uc3QgZXhwbGljaXRNdWx0aVJvb3QgPSByZWFkU2Vzc2lvbk11bHRpUm9vdE1ldGFkYXRhKGNvbmZpZz8uX21ldGEpO1xuXHRcdGNvbnN0IGluaGVyaXRlZE11bHRpUm9vdCA9IGNvbmZpZz8uZm9ya1xuXHRcdFx0PyByZWFkU2Vzc2lvbk11bHRpUm9vdE1ldGFkYXRhKHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3VtbWFyeShjb25maWcuZm9yay5zZXNzaW9uLnRvU3RyaW5nKCkpPy5fbWV0YSlcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGxldCBfbWV0YSA9IHdpdGhTZXNzaW9uR2l0SHViU3RhdGUodW5kZWZpbmVkLCBleHBsaWNpdEdpdEh1YlN0YXRlKTtcblx0XHRfbWV0YSA9IHdpdGhTZXNzaW9uTXVsdGlSb290TWV0YWRhdGEoX21ldGEsIGV4cGxpY2l0TXVsdGlSb290ID8/IGluaGVyaXRlZE11bHRpUm9vdCk7XG5cdFx0X21ldGEgPSB3aXRoU2Vzc2lvbkV4dGVybmFsKF9tZXRhLCBmYWxzZSk7XG5cdFx0X21ldGEgPSAhY29uZmlnPy5mb3JrICYmICFjb25maWc/LndvcmtpbmdEaXJlY3Rvcmllc1xuXHRcdFx0PyB3aXRoU2Vzc2lvbldvcmtzcGFjZWxlc3MoX21ldGEsIHRydWUpXG5cdFx0XHQ6IF9tZXRhO1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZXNvdXJjZTogc2Vzc2lvbi50b1N0cmluZygpLFxuXHRcdFx0cHJvdmlkZXI6IHByb3ZpZGVyLmlkLFxuXHRcdFx0dGl0bGUsXG5cdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGNyZWF0ZWRBdDogbm93LFxuXHRcdFx0bW9kaWZpZWRBdDogbm93LFxuXHRcdFx0Li4uKGNyZWF0ZWQucHJvamVjdCA/IHsgcHJvamVjdDogeyB1cmk6IGNyZWF0ZWQucHJvamVjdC51cmkudG9TdHJpbmcoKSwgZGlzcGxheU5hbWU6IGNyZWF0ZWQucHJvamVjdC5kaXNwbGF5TmFtZSB9IH0gOiB7fSksXG5cdFx0XHQvLyBUaGUgcHJvdmlkZXIgcmVzb2x2ZWQgb25seSBpdHMgcHJvY2VzcyByb290IChpbmRleCAwKSwgd2hpY2ggbWF5XG5cdFx0XHQvLyBkaWZmZXIgZnJvbSB0aGUgcmVxdWVzdGVkIHByaW1hcnkgKGUuZy4gYSB3b3Jrc3BhY2UtbGVzcyBzY3JhdGNoIGRpcikuXG5cdFx0XHQvLyBBc3NlbWJsZSB0aGUgc2Vzc2lvbiBzZXQgYnkgb3ZlcnJpZGluZyB0aGUgcmVxdWVzdGVkIHByaW1hcnkgd2l0aCBpdFxuXHRcdFx0Ly8gYW5kIGtlZXBpbmcgdGhlIHJlcXVlc3RlZCB0YWlsOyB0aGUgZnVsbHktcmVzb2x2ZWQgbXVsdGktcm9vdCBzZXRcblx0XHRcdC8vIGFycml2ZXMgbGF0ZXIgdmlhIHRoZSBtYXRlcmlhbGl6YXRpb24gcmVjZWlwdC5cblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogcmVjb25jaWxlV29ya2luZ0RpcmVjdG9yaWVzKGNvbmZpZz8ud29ya2luZ0RpcmVjdG9yaWVzLCBjcmVhdGVkLnJlc29sdmVkV29ya2luZ0RpcmVjdG9yeSA/IFtjcmVhdGVkLnJlc29sdmVkV29ya2luZ0RpcmVjdG9yeV0gOiB1bmRlZmluZWQpLFxuXHRcdFx0Ly8gV29ya3NwYWNlLWxlc3MgaXMgaW5mZXJyZWQgYXQgY3JlYXRlIGZyb20gYW4gYWJzZW50IGlucHV0XG5cdFx0XHQvLyBgd29ya2luZ0RpcmVjdG9yaWVzYCAodGhlIGhvc3QgYXNzaWducyBhIHNjcmF0Y2ggY3dkLCBzbyBpdCBjYW4ndCBiZVxuXHRcdFx0Ly8gcmUtaW5mZXJyZWQgbGF0ZXIpIGFuZCB0YWdnZWQgb24gdGhlIGdlbmVyaWMgYF9tZXRhYCBiYWcuIFVzZVxuXHRcdFx0Ly8gYD09PSB1bmRlZmluZWRgIHNvIGFuIGV4cGxpY2l0IGVtcHR5IHNldCAoYFtdYCkgaXMgTk9UIHRyZWF0ZWQgYXNcblx0XHRcdC8vIHdvcmtzcGFjZS1sZXNzLlxuXHRcdFx0Li4uKF9tZXRhID8geyBfbWV0YSB9IDoge30pLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogTGlzdGVuIGZvciBhbiBhZ2VudCB0cmFuc2l0aW9uaW5nIGEgcHJvdmlzaW9uYWwgc2Vzc2lvbiBpbnRvIGEgZnVsbHlcblx0ICogbWF0ZXJpYWxpemVkIFNESyBzZXNzaW9uLiBUaGUgYWdlbnQgaGFzIGFscmVhZHkgY3JlYXRlZCB0aGUgd29ya3RyZWVcblx0ICogKGlmIGFueSkgYW5kIHBlcnNpc3RlZCBvbi1kaXNrIG1ldGFkYXRhOyB3ZSBuZWVkIHRvOlxuXHQgKiAtIFJlZnJlc2ggdGhlIGluLW1lbW9yeSBzdW1tYXJ5IHdpdGggdGhlIHJlc29sdmVkIHdvcmtpbmcgZGlyZWN0b3J5XG5cdCAqICAgYW5kIHByb2plY3QgbWV0YWRhdGEuXG5cdCAqIC0gUGVyc2lzdCBhbnkgY29uZmlnIHZhbHVlcyBub3cgdGhhdCB3ZSBoYXZlIGEgcmVhbCBvbi1kaXNrIHNlc3Npb24uXG5cdCAqIC0gRW1pdCB0aGUgZGVmZXJyZWQgYG5vdGlmeS9zZXNzaW9uQWRkZWRgIHNvIG90aGVyIGNsaWVudHMgbGVhcm4gb2Zcblx0ICogICB0aGUgc2Vzc2lvbi5cblx0ICogLSBEaXNwYXRjaCBgU2Vzc2lvblJlYWR5YCBzbyBzdWJzY3JpYmVycyBzZWUgdGhlIGxpZmVjeWNsZSB0cmFuc2l0aW9uLlxuXHQgKiAtIExhemlseSBhdHRhY2ggZ2l0IHN0YXRlIGZvciB0aGUgKHBvc3NpYmx5IG5ldykgd29ya2luZyBkaXJlY3RvcnkuXG5cdCAqL1xuXHRwcml2YXRlIF9vbkRpZE1hdGVyaWFsaXplQ2hhdChlOiBJQWdlbnRNYXRlcmlhbGl6ZUNoYXRFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBVUkkucGFyc2UocGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShlLmNoYXQpKTtcblx0XHRjb25zdCBzZXNzaW9uS2V5ID0gc2Vzc2lvbi50b1N0cmluZygpO1xuXHRcdC8vIFRoZSBzZXNzaW9uIGlzIG5vdyBtYXRlcmlhbGl6ZWQgXHUyMDE0IGl0cyBTREsgaXMgcmVzb2x2ZWQgKGFueSBjb2xkXG5cdFx0Ly8gZG93bmxvYWQgYWxyZWFkeSBmaW5pc2hlZCksIHNvIG5vIGZ1cnRoZXIgcHJvZ3Jlc3MgaXMgZXhwZWN0ZWQgZm9yIGl0LlxuXHRcdHRoaXMuX2NsZWFyRG93bmxvYWRQcm9ncmVzc0ludGVyZXN0KHNlc3Npb25LZXkpO1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uS2V5KTtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIG9uRGlkTWF0ZXJpYWxpemVDaGF0IGZvciB1bmtub3duIHNlc3Npb246ICR7c2Vzc2lvbktleX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY3VycmVudFN1bW1hcnkgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN1bW1hcnkoc2Vzc2lvbktleSk7XG5cdFx0aWYgKCFjdXJyZW50U3VtbWFyeSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBvbkRpZE1hdGVyaWFsaXplQ2hhdCBtaXNzaW5nIHN1bW1hcnkgZm9yIHNlc3Npb246ICR7c2Vzc2lvbktleX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGUuY2hhdC50b1N0cmluZygpICE9PSBzdGF0ZS5kZWZhdWx0Q2hhdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZS5yZXN1bHQpIHtcblx0XHRcdGNvbnN0IHdyaXRlID0gdGhpcy5fcGVyc2lzdERlZmF1bHRDaGF0QmFja2luZyh7IHNlc3Npb24sIGNoYXQ6IGUucmVzdWx0IH0pO1xuXHRcdFx0dGhpcy5fZGVmYXVsdENoYXRCYWNraW5nV3JpdGVzLnNldChzZXNzaW9uS2V5LCB3cml0ZSk7XG5cdFx0XHR2b2lkIHdyaXRlLmNhdGNoKGVyciA9PiB0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVyciwgYFtBZ2VudFNlcnZpY2VdIEZhaWxlZCB0byBwZXJzaXN0IG1hdGVyaWFsaXplZCBkZWZhdWx0LWNoYXQgYmFja2luZyBmb3IgJHtzZXNzaW9uS2V5fWApKTtcblx0XHRcdGNvbnN0IGNsZWFyV3JpdGUgPSAoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9kZWZhdWx0Q2hhdEJhY2tpbmdXcml0ZXMuZ2V0KHNlc3Npb25LZXkpID09PSB3cml0ZSkge1xuXHRcdFx0XHRcdHRoaXMuX2RlZmF1bHRDaGF0QmFja2luZ1dyaXRlcy5kZWxldGUoc2Vzc2lvbktleSk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHR2b2lkIHdyaXRlLnRoZW4oY2xlYXJXcml0ZSwgY2xlYXJXcml0ZSk7XG5cdFx0fVxuXHRcdC8vIFRoZSBhZ2VudCBubyBsb25nZXIga25vd3MgYWJvdXQgd29ya3RyZWVzOyB0aGUgaG9zdCdzIHdvcmt0cmVlIHByb2plY3Rcblx0XHQvLyAoY3JlYXRlZCBpbiB0aGUgZmlyc3Qtc2VuZCBob29rKSB3aW5zIGZvciB3b3JrdHJlZS1pc29sYXRlZCBzZXNzaW9ucywgYW5kXG5cdFx0Ly8gZmFsbHMgYmFjayB0byB3aGF0ZXZlciB0aGUgYWdlbnQgcmVwb3J0ZWQgZm9yIGZvbGRlciBzZXNzaW9ucy5cblx0XHRjb25zdCBwcm9qZWN0ID0gdGhpcy5fd29ya3RyZWU/LnNlc3Npb25Xb3JrdHJlZVByb2plY3QoQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pKSA/PyBlLnByb2plY3Q7XG5cdFx0Y29uc3QgY3VycmVudFNldCA9IGN1cnJlbnRTdW1tYXJ5LndvcmtpbmdEaXJlY3Rvcmllcz8ubWFwKGQgPT4gVVJJLnBhcnNlKGQpKTtcblx0XHRjb25zdCBzdW1tYXJ5OiBTZXNzaW9uU3VtbWFyeSA9IHtcblx0XHRcdC4uLmN1cnJlbnRTdW1tYXJ5LFxuXHRcdFx0Li4uKHByb2plY3QgPyB7IHByb2plY3Q6IHsgdXJpOiBwcm9qZWN0LnVyaS50b1N0cmluZygpLCBkaXNwbGF5TmFtZTogcHJvamVjdC5kaXNwbGF5TmFtZSB9IH0gOiB7fSksXG5cdFx0XHQvLyBUaGUgbWF0ZXJpYWxpemUgcmVjZWlwdCBpcyBhdXRob3JpdGF0aXZlIGZvciB0aGUgcm9vdHMgaXQgcmVwb3J0c1xuXHRcdFx0Ly8gKGluZGV4IDAgPSB0aGUgcmVzb2x2ZWQgcHJvY2VzcyByb290LCBlLmcuIGEgd29ya3RyZWUpLiBBIHNlbmQtcGF0aFxuXHRcdFx0Ly8gcmVjZWlwdCBjYXJyaWVzIHRoZSBmdWxsIHJlc29sdmVkIHNldDsgYSByZXN1bWUtcGF0aCByZWNlaXB0IHJlcG9ydHNcblx0XHRcdC8vIG9ubHkgdGhlIHByb2Nlc3Mgcm9vdCwgc28gdGhlIHJlc3Qgb2YgdGhlIGN1cnJlbnQgc2V0IGlzIHByZXNlcnZlZC5cblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogcmVjb25jaWxlV29ya2luZ0RpcmVjdG9yaWVzKGN1cnJlbnRTZXQsIGUud29ya2luZ0RpcmVjdG9yaWVzKSxcblx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbmZpZ1ZhbHVlcyA9IHN0YXRlLmNvbmZpZz8udmFsdWVzO1xuXHRcdGlmIChjb25maWdWYWx1ZXMgJiYgT2JqZWN0LmtleXMoY29uZmlnVmFsdWVzKS5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9wZXJzaXN0Q29uZmlnVmFsdWVzKHNlc3Npb24sIGNvbmZpZ1ZhbHVlcyk7XG5cdFx0fVxuXHRcdC8vIFBlcnNpc3QgdGhlIEFILW93bmVkIHdvcmtzcGFjZS1sZXNzIG1hcmtlciBub3cgdGhhdCB0aGUgc2Vzc2lvbiBoYXMgYVxuXHRcdC8vIHJlYWwgb24tZGlzayBkYXRhYmFzZSAoZGVmZXJyZWQgZnJvbSBjcmVhdGUgZm9yIHByb3Zpc2lvbmFsIHNlc3Npb25zKS5cblx0XHR0aGlzLl9wZXJzaXN0V29ya3NwYWNlbGVzcyhzZXNzaW9uLCByZWFkU2Vzc2lvbldvcmtzcGFjZWxlc3Moc3VtbWFyeS5fbWV0YSkpO1xuXHRcdHRoaXMuX3BlcnNpc3RNdWx0aVJvb3Qoc2Vzc2lvbiwgcmVhZFNlc3Npb25NdWx0aVJvb3RNZXRhZGF0YShzdW1tYXJ5Ll9tZXRhKSk7XG5cdFx0Ly8gYG1hcmtTZXNzaW9uUGVyc2lzdGVkYCB3cml0ZXMgdGhlIHN1bW1hcnkgaW50byBzdGF0ZSBhbmQgZmlyZXNcblx0XHQvLyB0aGUgZGVmZXJyZWQgYFNlc3Npb25BZGRlZGAgbm90aWZpY2F0aW9uIGF0b21pY2FsbHkgc28gc3Vic2NyaWJlcnNcblx0XHQvLyBzZWUgY29uc2lzdGVudCBzdGF0ZSB0aHJvdWdoIGJvdGggcGF0aHMuXG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLm1hcmtTZXNzaW9uUGVyc2lzdGVkKHNlc3Npb25LZXksIHN1bW1hcnkpO1xuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uS2V5LCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5IH0pO1xuXHRcdGNvbnN0IGdpdEh1YlN0YXRlID0gcmVhZFNlc3Npb25HaXRIdWJTdGF0ZShzdW1tYXJ5Ll9tZXRhKTtcblx0XHRpZiAoZ2l0SHViU3RhdGUpIHtcblx0XHRcdHZvaWQgdGhpcy5fZ2l0U3RhdGVTZXJ2aWNlLnNldFNlc3Npb25HaXRIdWJTdGF0ZShzZXNzaW9uS2V5LCBnaXRIdWJTdGF0ZSk7XG5cdFx0fVxuXG5cdFx0Ly8gQXR0YWNoIGdpdCBzdGF0ZSBmb3IgdGhlIHJlc29sdmVkIHByb2Nlc3Mgcm9vdCAoaW5kZXggMCksIGlmIHByZXNlbnQuXG5cdFx0dm9pZCB0aGlzLl9naXRTdGF0ZVNlcnZpY2UucmVmcmVzaFNlc3Npb25HaXRTdGF0ZShzZXNzaW9uS2V5LCBlLndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdKTtcblxuXHRcdC8vIElmIGEgY2xpZW50IHN1YnNjcmliZWQgdG8gdGhpcyBzZXNzaW9uJ3MgdW5jb21taXR0ZWQgY2hhbmdlc2V0XG5cdFx0Ly8gYmVmb3JlIHRoZSB3b3JraW5nIGRpcmVjdG9yeSB3YXMga25vd24sIHRoZSBjb29yZGluYXRvciBkcmFpbnNcblx0XHQvLyB0aGUgZGVmZXJyZWQgcmVmcmVzaCBub3cgdGhhdCB0aGUgd29ya2luZyBkaXJlY3RvcnkgaXMgc2V0LlxuXHRcdHRoaXMuX2NoYW5nZXNldENvb3JkaW5hdG9yLm9uU2Vzc2lvbk1hdGVyaWFsaXplZChzZXNzaW9uS2V5KTtcblx0fVxuXG5cdC8qKiBEcm9wIGEgc2Vzc2lvbidzIGRvd25sb2FkLXByb2dyZXNzIG9wdC1pbiwgaWYgYW55LiAqL1xuXHRwcml2YXRlIF9jbGVhckRvd25sb2FkUHJvZ3Jlc3NJbnRlcmVzdChzZXNzaW9uS2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFtwcm92aWRlciwgc2Vzc2lvbnNdIG9mIHRoaXMuX2Rvd25sb2FkUHJvZ3Jlc3NJbnRlcmVzdCkge1xuXHRcdFx0aWYgKHNlc3Npb25zLmRlbGV0ZShzZXNzaW9uS2V5KSAmJiBzZXNzaW9ucy5zaXplID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX2Rvd25sb2FkUHJvZ3Jlc3NJbnRlcmVzdC5kZWxldGUocHJvdmlkZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTdXJmYWNlIGEgaG9zdC1sZXZlbCBTREsgZG93bmxvYWQgYXMgY2xpZW50IHByb2dyZXNzLiBUaGUgZG93bmxvYWRlciBmaXJlc1xuXHQgKiBwcm9jZXNzLWdsb2JhbCBmcmFtZXMga2V5ZWQgYnkgcGFja2FnZSBpZCAod2hpY2ggZXF1YWxzIHRoZSBwcm92aWRlciBpZCk7XG5cdCAqIGJlY2F1c2UgdGhlIGRvd25sb2FkIGlzIHNoYXJlZCBhY3Jvc3MgZXZlcnkgc2Vzc2lvbiBvZiB0aGF0IHByb3ZpZGVyLCB3ZVxuXHQgKiBlbWl0IGEgU0lOR0xFIGBwcm9ncmVzc2Agc3RyZWFtIGtleWVkIGJ5IHRoYXQgcGFja2FnZSBpZCBcdTIwMTQgbm90IG9uZSBwZXJcblx0ICogc2Vzc2lvbiBcdTIwMTQgc28gdGhlIGNsaWVudCBzaG93cyBleGFjdGx5IG9uZSBpbmRpY2F0b3Igbm8gbWF0dGVyIGhvdyBtYW55XG5cdCAqIHNlc3Npb25zIG9mIHRoZSBwcm92aWRlciBhcmUgYXdhaXRpbmcgaXQuIEZyYW1lcyBhcmUgZW1pdHRlZCB3aGlsZSBhdCBsZWFzdFxuXHQgKiBvbmUgc2Vzc2lvbiBoYXMgb3B0ZWQgaW4gKHN1cHBsaWVkIGFcblx0ICoge0BsaW5rIElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcucHJvZ3Jlc3NUb2tlbn0gb24gYGNyZWF0ZVNlc3Npb25gKSBvciBhXG5cdCAqIHVzZXItaW5pdGlhdGVkIGZsb3cgaGFzIGV4cGxpY2l0bHkgcmVxdWVzdGVkIHByb2dyZXNzLiBBXG5cdCAqIHRlcm1pbmFsIGZyYW1lIHJlcG9ydHMgYHRvdGFsID09PSBwcm9ncmVzc2AgKHVzaW5nIGByZWNlaXZlZEJ5dGVzYCB3aGVuIHRoZVxuXHQgKiBzaXplIHdhcyBuZXZlciBrbm93bikgc28gdGhlIGNsaWVudCBkaXNtaXNzZXMgdGhlIGluZGljYXRvciBkZXRlcm1pbmlzdGljYWxseS5cblx0ICpcblx0ICogYGRpc3BsYXlOYW1lYCBpcyB0aGUgcHJvdmlkZXIncyBicmFuZCBub3VuIChlLmcuIGBDbGF1ZGVgKS4gSXQgaXMgd292ZW5cblx0ICogaW50byB0aGUgbm90aWZpY2F0aW9uJ3MgbG9jYWxpemVkLCBodW1hbi1yZWFkYWJsZSBgbWVzc2FnZWAgKGUuZy5cblx0ICogXCJEb3dubG9hZGluZyBDbGF1ZGUgYWdlbnRcIikgc28gYSBnZW5lcmljIGNsaWVudCBjYW4gcmVuZGVyIHRoZSBpbmRpY2F0b3Jcblx0ICogdmVyYmF0aW0gd2l0aG91dCBrbm93aW5nIHRoZSByZXNvdXJjZSBpcyBhbiBhZ2VudCBTREsuIE5vIHRyYWlsaW5nXG5cdCAqIGVsbGlwc2lzOiBjbGllbnRzIHJlbmRlciBwcm9ncmVzcyBhcyBcIjx0aXRsZT46IDxwZXJjZW50PlwiLCBzbyBhbiBlbGxpcHNpc1xuXHQgKiB3b3VsZCByZWFkIGFzIGFuIHVudXN1YWwgXCJcdTIwMjY6XCIgKHNlZSAjMzI0NDU1KS5cblx0ICovXG5cdGVtaXREb3dubG9hZFByb2dyZXNzKHBhY2thZ2VJZDogc3RyaW5nLCBkaXNwbGF5TmFtZTogc3RyaW5nLCByZWNlaXZlZEJ5dGVzOiBudW1iZXIsIHRvdGFsQnl0ZXM6IG51bWJlciB8IHVuZGVmaW5lZCwgdGVybWluYWw6IGJvb2xlYW4sIGV4cGxpY2l0bHlSZXF1ZXN0ZWQgPSBmYWxzZSk6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb25zID0gdGhpcy5fZG93bmxvYWRQcm9ncmVzc0ludGVyZXN0LmdldChwYWNrYWdlSWQpO1xuXHRcdGlmICgoIXNlc3Npb25zIHx8IHNlc3Npb25zLnNpemUgPT09IDApICYmICFleHBsaWNpdGx5UmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIE9uIHRlcm1pbmFsIGZyYW1lcyBmb3JjZSBgcHJvZ3Jlc3MgPT09IHRvdGFsYCBzbyBjbGllbnRzIGRpc21pc3MgdGhlXG5cdFx0Ly8gaW5kaWNhdG9yIGluIGJvdGggZGV0ZXJtaW5hdGUgYW5kIGluZGV0ZXJtaW5hdGUgY2FzZXMuXG5cdFx0Y29uc3QgdG90YWwgPSB0ZXJtaW5hbCA/IHJlY2VpdmVkQnl0ZXMgOiB0b3RhbEJ5dGVzO1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSBsb2NhbGl6ZSgnYWdlbnRIb3N0LmRvd25sb2FkLmFnZW50U2RrVGl0bGUnLCBcIkRvd25sb2FkaW5nIHswfSBhZ2VudFwiLCBkaXNwbGF5TmFtZSk7XG5cdFx0Ly8gYHByb2dyZXNzVG9rZW5gIGlzIHRoZSBkb3dubG9hZCdzIG93biBzdGFibGUgaWRlbnRpdHkgKHRoZSBwYWNrYWdlIGlkKSxcblx0XHQvLyBzaGFyZWQgYnkgZXZlcnkgc2Vzc2lvbiBvZiB0aGUgcHJvdmlkZXIsIHNvIHRoZSBjbGllbnQgY29hbGVzY2VzIGFsbFxuXHRcdC8vIGZyYW1lcyBpbnRvIG9uZSBpbmRpY2F0b3IgYW5kIGRpc21pc3NlcyBpdCBvbiB0aGUgdGVybWluYWwgZnJhbWUuXG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmVtaXRQcm9ncmVzcyh7IHByb2dyZXNzVG9rZW46IHBhY2thZ2VJZCwgcHJvZ3Jlc3M6IHJlY2VpdmVkQnl0ZXMsIHRvdGFsLCBtZXNzYWdlIH0pO1xuXHRcdGlmICh0ZXJtaW5hbCkge1xuXHRcdFx0dGhpcy5fZG93bmxvYWRQcm9ncmVzc0ludGVyZXN0LmRlbGV0ZShwYWNrYWdlSWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3BlcnNpc3RXb3Jrc3BhY2VsZXNzKHNlc3Npb246IFVSSSwgd29ya3NwYWNlbGVzczogYm9vbGVhbik6IHZvaWQge1xuXHRcdGxldCByZWY7XG5cdFx0dHJ5IHtcblx0XHRcdHJlZiA9IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2Uoc2Vzc2lvbik7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIEZhaWxlZCB0byBvcGVuIHNlc3Npb24gZGF0YWJhc2UgdG8gcGVyc2lzdCB3b3Jrc3BhY2VsZXNzIGZvciAke3Nlc3Npb24udG9TdHJpbmcoKX06ICR7dG9FcnJvck1lc3NhZ2UoZXJyKX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmVmLm9iamVjdC5zZXRNZXRhZGF0YShBSF9NRVRBX1dPUktTUEFDRUxFU1NfREJfS0VZLCB3b3Jrc3BhY2VsZXNzID8gJ3RydWUnIDogJ2ZhbHNlJykuY2F0Y2goZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV0gRmFpbGVkIHRvIHBlcnNpc3Qgd29ya3NwYWNlbGVzcyBmb3IgJHtzZXNzaW9uLnRvU3RyaW5nKCl9OiAke3RvRXJyb3JNZXNzYWdlKGVycil9YCk7XG5cdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGVyc2lzdE11bHRpUm9vdChzZXNzaW9uOiBVUkksIG11bHRpUm9vdDogUmV0dXJuVHlwZTx0eXBlb2YgcmVhZFNlc3Npb25NdWx0aVJvb3RNZXRhZGF0YT4pOiB2b2lkIHtcblx0XHRpZiAoIW11bHRpUm9vdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgcmVmO1xuXHRcdHRyeSB7XG5cdFx0XHRyZWYgPSB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKHNlc3Npb24pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBGYWlsZWQgdG8gb3BlbiBzZXNzaW9uIGRhdGFiYXNlIHRvIHBlcnNpc3QgbXVsdGktcm9vdCBtZXRhZGF0YSBmb3IgJHtzZXNzaW9uLnRvU3RyaW5nKCl9OiAke3RvRXJyb3JNZXNzYWdlKGVycil9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJlZi5vYmplY3Quc2V0TWV0YWRhdGEoU0VTU0lPTl9NRVRBX01VTFRJX1JPT1RfS0VZLCBKU09OLnN0cmluZ2lmeShtdWx0aVJvb3QpKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBGYWlsZWQgdG8gcGVyc2lzdCBtdWx0aS1yb290IG1ldGFkYXRhIGZvciAke3Nlc3Npb24udG9TdHJpbmcoKX06ICR7dG9FcnJvck1lc3NhZ2UoZXJyKX1gKTtcblx0XHR9KS5maW5hbGx5KCgpID0+IHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9wZXJzaXN0Q29uZmlnVmFsdWVzKHNlc3Npb246IFVSSSwgdmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHZvaWQge1xuXHRcdGxldCByZWY7XG5cdFx0dHJ5IHtcblx0XHRcdHJlZiA9IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2Uoc2Vzc2lvbik7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIEZhaWxlZCB0byBvcGVuIHNlc3Npb24gZGF0YWJhc2UgdG8gcGVyc2lzdCBjb25maWdWYWx1ZXMgZm9yICR7c2Vzc2lvbi50b1N0cmluZygpfTogJHt0b0Vycm9yTWVzc2FnZShlcnIpfWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZWYub2JqZWN0LnNldE1ldGFkYXRhKCdjb25maWdWYWx1ZXMnLCBKU09OLnN0cmluZ2lmeSh2YWx1ZXMpKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBGYWlsZWQgdG8gcGVyc2lzdCBjb25maWdWYWx1ZXMgZm9yICR7c2Vzc2lvbi50b1N0cmluZygpfTogJHt0b0Vycm9yTWVzc2FnZShlcnIpfWApO1xuXHRcdH0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVDcmVhdGVkU2Vzc2lvbkNvbmZpZyhwcm92aWRlcjogSUFnZW50LCBjb25maWc6IElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcgfCB1bmRlZmluZWQpOiBQcm9taXNlPFNlc3Npb25Db25maWdTdGF0ZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghY29uZmlnPy5jb25maWcgJiYgY29uZmlnPy53b3JraW5nRGlyZWN0b3JpZXMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcGFyYW1zOiBJQWdlbnRSZXNvbHZlU2Vzc2lvbkNvbmZpZ1BhcmFtcyA9IHtcblx0XHRcdHByb3ZpZGVyOiBwcm92aWRlci5pZCxcblx0XHRcdC8vIGByZXNvbHZlU2Vzc2lvbkNvbmZpZ2AgaXMgYSBwcmUtc2Vzc2lvbiwgc2luZ2xlLWNvbnRleHQgQVBJOlxuXHRcdFx0Ly8gcmVzb2x2ZSBhZ2FpbnN0IHRoZSBzZXNzaW9uJ3MgcHJpbWFyeSAoaW5kZXggMCkuXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBjb25maWcud29ya2luZ0RpcmVjdG9yaWVzPy5bMF0sXG5cdFx0XHRjb25maWc6IGNvbmZpZy5jb25maWcsXG5cdFx0fTtcblx0XHR0cnkge1xuXHRcdFx0Ly8gV3JhcCB3aXRoIHRoZSBob3N0J3MgaXNvbGF0aW9uIHNjaGVtYSBzbyB0aGUgY3JlYXRlZCBjb25maWcgY2FycmllcyB0aGVcblx0XHRcdC8vIGBpc29sYXRpb25gIC8gYGJyYW5jaGAgdmFsdWVzIChhbmQgdGhlaXIgZ2l0LWRlcml2ZWQgZGVmYXVsdHMpLiBUaGVcblx0XHRcdC8vIGFnZW50J3Mgb3duIGByZXNvbHZlU2Vzc2lvbkNvbmZpZ2Agb21pdHMgdGhlbSAoaXNvbGF0aW9uIGlzIGhvc3Qtb3duZWQpLFxuXHRcdFx0Ly8gc28gd2l0aG91dCB0aGlzIGEgZnJlc2ggd29ya3RyZWUgc2Vzc2lvbidzIGlzb2xhdGlvbiBpcyBgdW5kZWZpbmVkYCBhdFxuXHRcdFx0Ly8gY3JlYXRlIHRpbWUgXHUyMDE0IHRoZSBwZW5kaW5nIG1hcmsgYmVsb3cgaXMgc2tpcHBlZCBhbmQgdGhlIHNlbmQgZmFsbHMgYmFja1xuXHRcdFx0Ly8gdG8gZm9sZGVyIGV2ZW4gdGhvdWdoIHRoZSB1c2VyIHBpY2tlZCB3b3JrdHJlZS5cblx0XHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgdGhpcy5fd2l0aElzb2xhdGlvblNjaGVtYShhd2FpdCBwcm92aWRlci5yZXNvbHZlQ2hhdENvbmZpZyh0aGlzLl90b1Byb3ZpZGVyQ29uZmlnKHBhcmFtcykpLCBwYXJhbXMpO1xuXHRcdFx0cmV0dXJuIHsgc2NoZW1hOiByZXNvbHZlZC5zY2hlbWEsIHZhbHVlczogcmVzb2x2ZWQudmFsdWVzIH07XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQWdlbnRTZXJ2aWNlXSBGYWlsZWQgdG8gcmVzb2x2ZSBjcmVhdGVkIHNlc3Npb24gY29uZmlnIGZvciBwcm92aWRlciAke3Byb3ZpZGVyLmlkfWAsIGVycik7XG5cdFx0XHRyZXR1cm4gY29uZmlnLmNvbmZpZyA/IHsgc2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LCB2YWx1ZXM6IGNvbmZpZy5jb25maWcgfSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZXNvbHZlU2Vzc2lvbkNvbmZpZyhwYXJhbXM6IElBZ2VudFJlc29sdmVTZXNzaW9uQ29uZmlnUGFyYW1zKTogUHJvbWlzZTxSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdD4ge1xuXHRcdGNvbnN0IHByb3ZpZGVySWQgPSBwYXJhbXMucHJvdmlkZXIgPz8gdGhpcy5fZGVmYXVsdFByb3ZpZGVyO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gcHJvdmlkZXJJZCA/IHRoaXMuX3Byb3ZpZGVycy5nZXQocHJvdmlkZXJJZCkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBObyBhZ2VudCBwcm92aWRlciByZWdpc3RlcmVkIGZvcjogJHtwcm92aWRlcklkID8/ICcobm9uZSknfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fd2l0aElzb2xhdGlvblNjaGVtYShhd2FpdCBwcm92aWRlci5yZXNvbHZlQ2hhdENvbmZpZyh0aGlzLl90b1Byb3ZpZGVyQ29uZmlnKHBhcmFtcykpLCBwYXJhbXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhvc3Qtb3duZWQgY29udHJpYnV0aW9uIG9mIHRoZSBzaGFyZWQgYGlzb2xhdGlvbmAgKGZvbGRlciAvIHdvcmt0cmVlKSxcblx0ICogYGJyYW5jaGAsIGB3b3JrdHJlZUJyYW5jaFByZWZpeGAsIGB3b3JrdHJlZUluY2x1ZGVGaWxlc2AsIGFuZCBgd29ya3RyZWVCcmFuY2hUcmFja2Agc2Vzc2lvbi1jb25maWdcblx0ICogcHJvcGVydGllcyBvbiB0b3Agb2Ygd2hhdGV2ZXIgYW4gYWdlbnQgcmV0dXJuZWQgZnJvbSBgcmVzb2x2ZVNlc3Npb25Db25maWdgLiBQcm92aWRlci1yZXR1cm5lZFxuXHQgKiBwcm9wZXJ0aWVzIGFuZCB2YWx1ZXMgd2l0aCB0aGVzZSBrZXlzIGFyZSByZXBsYWNlZCBieSB0aGUgaG9zdCBjb250cmlidXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF93aXRoSXNvbGF0aW9uU2NoZW1hKHJlc3VsdDogUmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQsIHBhcmFtczogSUFnZW50UmVzb2x2ZVNlc3Npb25Db25maWdQYXJhbXMpOiBQcm9taXNlPFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0PiB7XG5cdFx0aWYgKCF0aGlzLl93b3JrdHJlZSkge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0Y29uc3QgaXNvID0gYXdhaXQgdGhpcy5fd29ya3RyZWUucmVzb2x2ZUlzb2xhdGlvbkNvbmZpZyh7IHdvcmtpbmdEaXJlY3Rvcnk6IHBhcmFtcy53b3JraW5nRGlyZWN0b3J5LCBjb25maWc6IHBhcmFtcy5jb25maWcgfSk7XG5cdFx0Y29uc3QgcHJvcGVydGllczogUmVjb3JkPHN0cmluZywgU2Vzc2lvbkNvbmZpZ1Byb3BlcnR5U2NoZW1hPiA9IHtcblx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06IGlzby5pc29sYXRpb25Qcm9wZXJ0eS5wcm90b2NvbCxcblx0XHRcdC4uLm9taXRIb3N0T3duZWRTZXNzaW9uQ29uZmlnKHJlc3VsdC5zY2hlbWEucHJvcGVydGllcyksXG5cdFx0fTtcblx0XHRpZiAoaXNvLmJyYW5jaFByb3BlcnR5KSB7XG5cdFx0XHRwcm9wZXJ0aWVzW1Nlc3Npb25Db25maWdLZXkuQnJhbmNoXSA9IGlzby5icmFuY2hQcm9wZXJ0eS5wcm90b2NvbDtcblx0XHR9XG5cdFx0aWYgKGlzby53b3JrdHJlZUJyYW5jaFByZWZpeFByb3BlcnR5KSB7XG5cdFx0XHRwcm9wZXJ0aWVzW1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVCcmFuY2hQcmVmaXhdID0gaXNvLndvcmt0cmVlQnJhbmNoUHJlZml4UHJvcGVydHkucHJvdG9jb2w7XG5cdFx0fVxuXHRcdGlmIChpc28ud29ya3RyZWVCcmFuY2hUcmFja1Byb3BlcnR5KSB7XG5cdFx0XHRwcm9wZXJ0aWVzW1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVCcmFuY2hUcmFja10gPSBpc28ud29ya3RyZWVCcmFuY2hUcmFja1Byb3BlcnR5LnByb3RvY29sO1xuXHRcdH1cblx0XHRpZiAoaXNvLndvcmt0cmVlSW5jbHVkZUZpbGVzUHJvcGVydHkpIHtcblx0XHRcdHByb3BlcnRpZXNbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUluY2x1ZGVGaWxlc10gPSBpc28ud29ya3RyZWVJbmNsdWRlRmlsZXNQcm9wZXJ0eS5wcm90b2NvbDtcblx0XHR9XG5cdFx0Y29uc3QgdmFsdWVzID0gb21pdEhvc3RPd25lZFNlc3Npb25Db25maWcocmVzdWx0LnZhbHVlcyk7XG5cdFx0dmFsdWVzW1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXSA9IGlzby5pc29sYXRpb25WYWx1ZTtcblx0XHRpZiAoaXNvLmJyYW5jaFByb3BlcnR5ICYmIGlzby5icmFuY2hWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR2YWx1ZXNbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdID0gaXNvLmJyYW5jaFZhbHVlO1xuXHRcdH1cblx0XHRpZiAoaXNvLndvcmt0cmVlQnJhbmNoUHJlZml4UHJvcGVydHkgJiYgdHlwZW9mIHBhcmFtcy5jb25maWc/LltTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlQnJhbmNoUHJlZml4XSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHZhbHVlc1tTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlQnJhbmNoUHJlZml4XSA9IHBhcmFtcy5jb25maWdbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUJyYW5jaFByZWZpeF07XG5cdFx0fVxuXHRcdGlmIChpc28ud29ya3RyZWVCcmFuY2hUcmFja1Byb3BlcnR5ICYmIHR5cGVvZiBwYXJhbXMuY29uZmlnPy5bU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUJyYW5jaFRyYWNrXSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHR2YWx1ZXNbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUJyYW5jaFRyYWNrXSA9IHBhcmFtcy5jb25maWdbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUJyYW5jaFRyYWNrXTtcblx0XHR9XG5cdFx0aWYgKGlzby53b3JrdHJlZUluY2x1ZGVGaWxlc1Byb3BlcnR5XG5cdFx0XHQmJiBBcnJheS5pc0FycmF5KHBhcmFtcy5jb25maWc/LltTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlSW5jbHVkZUZpbGVzXSlcblx0XHRcdCYmIHBhcmFtcy5jb25maWdbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUluY2x1ZGVGaWxlc10uZXZlcnkocGF0dGVybiA9PiB0eXBlb2YgcGF0dGVybiA9PT0gJ3N0cmluZycpKSB7XG5cdFx0XHR2YWx1ZXNbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUluY2x1ZGVGaWxlc10gPSBwYXJhbXMuY29uZmlnW1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVJbmNsdWRlRmlsZXNdO1xuXHRcdH1cblx0XHRyZXR1cm4geyBzY2hlbWE6IHsgLi4ucmVzdWx0LnNjaGVtYSwgcHJvcGVydGllcyB9LCB2YWx1ZXMgfTtcblx0fVxuXG5cdGFzeW5jIHNlc3Npb25Db25maWdDb21wbGV0aW9ucyhwYXJhbXM6IElBZ2VudFNlc3Npb25Db25maWdDb21wbGV0aW9uc1BhcmFtcyk6IFByb21pc2U8U2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zUmVzdWx0PiB7XG5cdFx0Ly8gVGhlIGhvc3Qgb3ducyBicmFuY2ggY29tcGxldGlvbnMgZm9yIGV2ZXJ5IGFnZW50ICh0aGV5IHNoYXJlIHRoZSBzYW1lXG5cdFx0Ly8gZ2l0LWJhY2tlZCBicmFuY2ggbGlzdCk7IGFsbCBvdGhlciBwcm9wZXJ0aWVzIHN0YXkgcHJvdmlkZXItc3BlY2lmaWMuXG5cdFx0aWYgKHBhcmFtcy5wcm9wZXJ0eSA9PT0gU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2ggJiYgdGhpcy5fd29ya3RyZWUpIHtcblx0XHRcdHJldHVybiB0aGlzLl93b3JrdHJlZS5icmFuY2hDb21wbGV0aW9ucyhwYXJhbXMud29ya2luZ0RpcmVjdG9yeSwgcGFyYW1zLnF1ZXJ5KTtcblx0XHR9XG5cdFx0Y29uc3QgcHJvdmlkZXJJZCA9IHBhcmFtcy5wcm92aWRlciA/PyB0aGlzLl9kZWZhdWx0UHJvdmlkZXI7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBwcm92aWRlcklkID8gdGhpcy5fcHJvdmlkZXJzLmdldChwcm92aWRlcklkKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIGFnZW50IHByb3ZpZGVyIHJlZ2lzdGVyZWQgZm9yOiAke3Byb3ZpZGVySWQgPz8gJyhub25lKSd9YCk7XG5cdFx0fVxuXHRcdHJldHVybiBwcm92aWRlci5jaGF0Q29uZmlnQ29tcGxldGlvbnModGhpcy5fdG9Qcm92aWRlckNvbmZpZyhwYXJhbXMpKTtcblx0fVxuXG5cdGFzeW5jIGNvbXBsZXRpb25zKHBhcmFtczogQ29tcGxldGlvbnNQYXJhbXMpOiBQcm9taXNlPENvbXBsZXRpb25zUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbXBsZXRpb25zLmNvbXBsZXRpb25zKHBhcmFtcyk7XG5cdH1cblxuXHRhc3luYyBnZXRDb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnMoKTogUHJvbWlzZTxyZWFkb25seSBzdHJpbmdbXT4ge1xuXHRcdHJldHVybiB0aGlzLl9jb21wbGV0aW9ucy50cmlnZ2VyQ2hhcmFjdGVycztcblx0fVxuXG5cdGFzeW5jIGRpc3Bvc2VTZXNzaW9uKHNlc3Npb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtBZ2VudFNlcnZpY2VdIGRpc3Bvc2VTZXNzaW9uOiAke3Nlc3Npb24udG9TdHJpbmcoKX1gKTtcblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuaW52YWxpZGF0ZVNlc3Npb25DaGF0UmVzb2x1dGlvbnMoc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRjb25zdCBzZXNzaW9uQ2hhdHMgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24udG9TdHJpbmcoKSk/LmNoYXRzID8/IFtdO1xuXHRcdGZvciAoY29uc3QgY2hhdCBvZiBzZXNzaW9uQ2hhdHMpIHtcblx0XHRcdHRoaXMuX3NpZGVFZmZlY3RzLmNsZWFyQ2hhbm5lbFRlbGVtZXRyeShjaGF0LnJlc291cmNlKTtcblx0XHR9XG5cdFx0dGhpcy5fc2lkZUVmZmVjdHMuY2xlYXJDaGFubmVsVGVsZW1ldHJ5KHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0Ly8gUmVzb2x2ZSB0aGUgd29ya2luZyBkaXJlY3RvcmllcyB1cCBmcm9udCBhbmQgcGFzcyB0aGVtIGV4cGxpY2l0bHk6XG5cdFx0Ly8gdGhlIGNoZWNrcG9pbnQgYW5kIHJldmlldyBzZXJ2aWNlcyBuZWVkIHRoZW0gdG8gbG9jYXRlIHRoZVxuXHRcdC8vIHJlcG9zaXRvcmllcyBob2xkaW5nIHRoaXMgc2Vzc2lvbidzIHJlZnMsIGFuZCByZWFkaW5nIHRoZW0gZnJvbVxuXHRcdC8vIHNlc3Npb24gc3RhdGUgd291bGQgc2lsZW50bHkgYnJlYWsgdGhlIG1vbWVudCBgZGVsZXRlU2Vzc2lvbmAgYmVsb3dcblx0XHQvLyBpcyByZW9yZGVyZWQgYWhlYWQgb2YgdGhlIGRhdGEgZGVsZXRpb24uXG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yaWVzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0RWZmZWN0aXZlV29ya2luZ0RpcmVjdG9yaWVzKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24pO1xuXHRcdGNvbnN0IHdvcmt0cmVlID0gYXdhaXQgdGhpcy5fd29ya3RyZWU/LnByZXBhcmVTZXNzaW9uRGVsZXRpb24oc2Vzc2lvbiwgc2Vzc2lvbklkKTtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2ZpbmRQcm92aWRlckZvclNlc3Npb24oc2Vzc2lvbik7XG5cdFx0aWYgKHByb3ZpZGVyKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9kaXNwb3NlU2Vzc2lvbihwcm92aWRlciwgc2Vzc2lvbik7XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX3JldHJ5UmVnaXN0cnlNdXRhdGlvbihcblx0XHRcdCgpID0+IHRoaXMuX3Nlc3Npb25SZWdpc3RyeS51bnJlZ2lzdGVyKHNlc3Npb24pLFxuXHRcdFx0YHVucmVnaXN0cmF0aW9uIGZvciAke3Nlc3Npb24udG9TdHJpbmcoKX1gLFxuXHRcdCk7XG5cdFx0aWYgKHByb3ZpZGVyKSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uVG9Qcm92aWRlci5kZWxldGUoc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRcdHRoaXMuX2NsZWFyRG93bmxvYWRQcm9ncmVzc0ludGVyZXN0KHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdFx0fVxuXHRcdHRoaXMuX3NpZGVFZmZlY3RzLmNsZWFyU2Vzc2lvblRpdGxlU3RhdGUoc2Vzc2lvbi50b1N0cmluZygpLCBzZXNzaW9uQ2hhdHMubWFwKGNoYXQgPT4gY2hhdC5yZXNvdXJjZSkpO1xuXHRcdGF3YWl0IHRoaXMuX3doZW5TZXNzaW9uRGF0YUlkbGUoc2Vzc2lvbik7XG5cdFx0Ly8gUmVtb3ZlIHRoZSBWUyBDb2RlIHBlci1zZXNzaW9uIGRhdGEgZGlyZWN0b3J5IChtZXRhZGF0YSBEQiArIGNoZWNrcG9pbnRzKSB0byBtaXJyb3IgdGhlIFNESy1zaWRlIGNsZWFudXBcblx0XHQvLyBwZXJmb3JtZWQgYnkgdGhlIHByb3ZpZGVyIGFib3ZlLiBOby1vcCB3aGVuIHRoZSBkaXJlY3RvcnkgZG9lcyBub3QgZXhpc3QuXG5cdFx0Ly9cblx0XHQvLyBSdW5zIGJlZm9yZSB0aGUgd29ya3RyZWUgaXMgcmVtb3ZlZDogc3Vic2NyaWJlcnMgb2YgdGhlIHdpbGwtZGVsZXRlXG5cdFx0Ly8gZXZlbnQgZHJvcCB0aGlzIHNlc3Npb24ncyBnaXQgcmVmcywgYW5kIGZvciBhIHdvcmt0cmVlLWlzb2xhdGVkXG5cdFx0Ly8gc2Vzc2lvbiB0aGUgd29ya2luZyBkaXJlY3RvcnkgKmlzKiB0aGUgd29ya3RyZWUsIHNvIG9uY2UgaXQgaXMgZ29uZVxuXHRcdC8vIHRoZSByZXBvc2l0b3J5IGNhbiBubyBsb25nZXIgYmUgcmVzb2x2ZWQgYW5kIHRoZSByZWZzIHdvdWxkIGxlYWtcblx0XHQvLyBpbnRvIHRoZSBtYWluIHJlcG9zaXRvcnkgKGByZWZzL2FnZW50cy8qYCBpcyBzaGFyZWQsIG5vdCBwZXItd29ya3RyZWUpLlxuXHRcdGF3YWl0IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS5kZWxldGVTZXNzaW9uRGF0YShzZXNzaW9uLCB3b3JraW5nRGlyZWN0b3JpZXMpO1xuXHRcdGF3YWl0IHRoaXMuX3dvcmt0cmVlPy5yZW1vdmVTZXNzaW9uV29ya3RyZWUoc2Vzc2lvbklkLCB3b3JrdHJlZSk7XG5cdFx0dGhpcy5fY2hhbmdlc2V0Q29vcmRpbmF0b3Iub25TZXNzaW9uRGlzcG9zZWQoc2Vzc2lvbi50b1N0cmluZygpKTtcblx0XHRmb3IgKGNvbnN0IGNoYXQgb2YgdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uLnRvU3RyaW5nKCkpPy5jaGF0cyA/PyBbXSkge1xuXHRcdFx0dGhpcy5fc2lkZUVmZmVjdHMuY2xlYXJRdWV1ZWRNZXNzYWdlU2VuZGVycyhjaGF0LnJlc291cmNlKTtcblx0XHR9XG5cdFx0dGhpcy5fc2lkZUVmZmVjdHMuY2xlYXJJbnB1dFJlcXVlc3RzRm9yU2Vzc2lvbihzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdC8vIFJlbW92ZSBhbGwgc3ViYWdlbnQgc2Vzc2lvbnMgZm9yIHRoaXMgcGFyZW50XG5cdFx0dGhpcy5fc2lkZUVmZmVjdHMucmVtb3ZlU3ViYWdlbnRTZXNzaW9ucyhzZXNzaW9uLnRvU3RyaW5nKCkpO1xuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kZWxldGVTZXNzaW9uKHNlc3Npb24udG9TdHJpbmcoKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF93aGVuU2Vzc2lvbkRhdGFJZGxlKHNlc3Npb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlZiA9IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2Uoc2Vzc2lvbik7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHJlZi5vYmplY3Qud2hlbklkbGUoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHQvLyAtLS0tIFByb3RvY29sIG1ldGhvZHMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0YXN5bmMgY3JlYXRlVGVybWluYWwocGFyYW1zOiBDcmVhdGVUZXJtaW5hbFBhcmFtcyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3Rlcm1pbmFsTWFuYWdlci5jcmVhdGVUZXJtaW5hbChwYXJhbXMpO1xuXHR9XG5cblx0YXN5bmMgZGlzcG9zZVRlcm1pbmFsKHRlcm1pbmFsOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl90ZXJtaW5hbE1hbmFnZXIuZGlzcG9zZVRlcm1pbmFsKHRlcm1pbmFsLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0YXN5bmMgc3Vic2NyaWJlKHJlc291cmNlOiBVUkksIGNsaWVudElkOiBzdHJpbmcpOiBQcm9taXNlPElTdGF0ZVNuYXBzaG90PiB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50U2VydmljZV0gc3Vic2NyaWJlOiAke3Jlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0Y29uc3QgcmVzb3VyY2VTdHIgPSByZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdC8vIFJlZ2lzdGVyIHRoZSBzdWJzY3JpYmVyIHVwIGZyb250IHNvIGEgY29uY3VycmVudCB1bnN1YnNjcmliZSBjYW5ub3Rcblx0XHQvLyBldmljdCB0aGUgc2Vzc2lvbiBzdGF0ZSB3aGlsZSB3ZSBhcmUgYXdhaXRpbmcgcmVzdG9yZS4gT24gYW55IGZhaWx1cmVcblx0XHQvLyBwYXRoIGJlbG93IHdlIG11c3Qgcm9sbCB0aGUgcmVnaXN0cmF0aW9uIGJhY2ssIG90aGVyd2lzZSB0aGUgbGVha2VkXG5cdFx0Ly8gcmVmY291bnQgd291bGQgcGVybWFuZW50bHkgcGluIChvciBibG9jayBldmljdGlvbiBvZikgdGhlIHJlc291cmNlLlxuXHRcdC8vIHtAbGluayBhZGRTdWJzY3JpYmVyfSBpcyB0aGUgc2luZ2xlIHBvaW50IHRoYXQgdHJpZ2dlcnMgdGhlXG5cdFx0Ly8gdW5jb21taXR0ZWQtY2hhbmdlc2V0IHJlZnJlc2ggb24gdGhlIDBcdTIxOTIxIHRyYW5zaXRpb24gKGNvdmVycyBib3RoXG5cdFx0Ly8gdGhlIGNvbGQtc25hcHNob3QgcGF0aCBoZXJlIGFuZCB0aGUgaGFuZHNoYWtlIGZhc3QtcGF0aCB1c2VkIGJ5XG5cdFx0Ly8ge0BsaW5rIFByb3RvY29sU2VydmVySGFuZGxlcn0gd2hlbiBzdGF0ZSBpcyBhbHJlYWR5IGNhY2hlZCkuXG5cdFx0dGhpcy5hZGRTdWJzY3JpYmVyKHJlc291cmNlLCBjbGllbnRJZCk7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIENoZWNrIGZvciB0ZXJtaW5hbCBzdGF0ZVxuXHRcdFx0Y29uc3QgdGVybWluYWxTdGF0ZSA9IHRoaXMuX3Rlcm1pbmFsTWFuYWdlci5nZXRUZXJtaW5hbFN0YXRlKHJlc291cmNlU3RyKTtcblx0XHRcdGlmICh0ZXJtaW5hbFN0YXRlKSB7XG5cdFx0XHRcdHJldHVybiB7IHJlc291cmNlOiByZXNvdXJjZVN0ciwgc3RhdGU6IHRlcm1pbmFsU3RhdGUsIGZyb21TZXE6IHRoaXMuX3N0YXRlTWFuYWdlci5zZXJ2ZXJTZXEgfTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHNuYXBzaG90ID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNuYXBzaG90KHJlc291cmNlU3RyKTtcblx0XHRcdGNvbnN0IHBhcnNlZENoYW5nZXNldCA9IHBhcnNlQ2hhbmdlc2V0VXJpKHJlc291cmNlU3RyKTtcblx0XHRcdGlmIChzbmFwc2hvdCAmJiBwYXJzZWRDaGFuZ2VzZXQgJiYgIXRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUocGFyc2VkQ2hhbmdlc2V0LnNlc3Npb25VcmkpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2NoYW5nZXNldENvb3JkaW5hdG9yLnJlc3RvcmVTZXNzaW9uSWZDaGFuZ2VzZXRTdWJzY3JpcHRpb24ocmVzb3VyY2UsIHMgPT4gdGhpcy5yZXN0b3JlU2Vzc2lvbihzKSk7XG5cdFx0XHRcdHNuYXBzaG90ID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNuYXBzaG90KHJlc291cmNlU3RyKTtcblx0XHRcdH1cblx0XHRcdGlmICghc25hcHNob3QpIHtcblx0XHRcdFx0Ly8gQ2hhdCBjaGFubmVsIFVSSXMgY2FycnkgdGhlaXIgb3duaW5nIHNlc3Npb24gVVJJLiBUaGUgY2hhdFxuXHRcdFx0XHQvLyBzbmFwc2hvdCBvbmx5IG1hdGVyaWFsaXplcyBvbmNlIHRoYXQgc2Vzc2lvbiBpcyByZXN0b3JlZFxuXHRcdFx0XHQvLyAod2hpY2ggc2VlZHMgdGhlIGRlZmF1bHQgY2hhdCBzdGF0ZSksIHNvIHJlc3RvcmUgdGhlIHBhcmVudFxuXHRcdFx0XHQvLyBzZXNzaW9uIHJhdGhlciB0aGFuIHRoZSBjaGF0IFVSSSBpdHNlbGYuIFRoaXMgbWFrZXMgdGhlXG5cdFx0XHRcdC8vIGNoYXQtY2hhbm5lbCBzdWJzY3JpYmUgc2VsZi1zdWZmaWNpZW50IGFuZCBpbmRlcGVuZGVudCBvZlxuXHRcdFx0XHQvLyB3aGV0aGVyIHRoZSBzZXNzaW9uIGNoYW5uZWwgd2FzIHN1YnNjcmliZWQgZmlyc3QuXG5cdFx0XHRcdGNvbnN0IHBhcnNlZENoYXRTZXNzaW9uID0gcGFyc2VEZWZhdWx0Q2hhdFVyaShyZXNvdXJjZVN0cik7XG5cdFx0XHRcdGlmIChwYXJzZWRDaGF0U2Vzc2lvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHBhcnNlZENoYXRTZXNzaW9uKSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgcGFyZW50VXJpID0gVVJJLnBhcnNlKHBhcnNlZENoYXRTZXNzaW9uKTtcblx0XHRcdFx0XHRcdGNvbnN0IHBhcnNlZFN1YmFnZW50UGFyZW50ID0gcGFyc2VTdWJhZ2VudFNlc3Npb25VcmkocGFyZW50VXJpKTtcblx0XHRcdFx0XHRcdGlmIChwYXJzZWRTdWJhZ2VudFBhcmVudCkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9yZXN0b3JlU3ViYWdlbnRTZXNzaW9uKHBhcnNlZENoYXRTZXNzaW9uLCBwYXJzZWRTdWJhZ2VudFBhcmVudC5wYXJlbnRTZXNzaW9uKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMucmVzdG9yZVNlc3Npb24ocGFyZW50VXJpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0c25hcHNob3QgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U25hcHNob3QocmVzb3VyY2VTdHIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXNuYXBzaG90ICYmIGlzQWhwQ2hhdENoYW5uZWwocmVzb3VyY2VTdHIpKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3N0YXRlTWFuYWdlci5yZXNvbHZlQ2hhdFN0YXRlKHJlc291cmNlU3RyKTtcblx0XHRcdFx0c25hcHNob3QgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U25hcHNob3QocmVzb3VyY2VTdHIpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFzbmFwc2hvdCkge1xuXHRcdFx0XHRpZiAoaXNTdWJhZ2VudENoYXRVcmkocmVzb3VyY2UpKSB7XG5cdFx0XHRcdFx0c25hcHNob3QgPSBhd2FpdCB0aGlzLl9hd2FpdFBlbmRpbmdTdWJhZ2VudENoYXQocmVzb3VyY2VTdHIpO1xuXHRcdFx0XHRcdGlmICghc25hcHNob3QpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ2hhdFVyaShyZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHRpZiAocGFyc2VkPy5jaGF0SWQuc3RhcnRzV2l0aCgnc3ViYWdlbnQvJykpIHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fcmVzdG9yZVN1YmFnZW50Q2hhdChyZXNvdXJjZVN0ciwgVVJJLnBhcnNlKHBhcnNlZC5zZXNzaW9uKSwgcGFyc2VkLmNoYXRJZC5zbGljZSgnc3ViYWdlbnQvJy5sZW5ndGgpKTtcblx0XHRcdFx0XHRcdFx0c25hcHNob3QgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U25hcHNob3QocmVzb3VyY2VTdHIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHQvLyBDaGFuZ2VzZXQgVVJJcyBhcmUgcm91dGVkIHRocm91Z2ggdGhlIGNvb3JkaW5hdG9yICh3aGljaFxuXHRcdFx0XHRcdC8vIG93bnMgaXRzIFVSSSBzaGFwZSwgdGhlIHVua25vd24taWQgZWFybHkgdGhyb3csIGFuZCB0dXJuXG5cdFx0XHRcdFx0Ly8gLyBzdGF0aWMgc2VlZGluZykuIE90aGVyIFVSSXMgZmFsbCB0aHJvdWdoIHRvIHRoZVxuXHRcdFx0XHRcdC8vIHN1YmFnZW50IC8gc2Vzc2lvbi1kZWZhdWx0IHBhdGggYmVsb3cuXG5cdFx0XHRcdFx0Y29uc3QgaGFuZGxlZCA9IGF3YWl0IHRoaXMuX2NoYW5nZXNldENvb3JkaW5hdG9yLnRyeUhhbmRsZVN1YnNjcmliZShyZXNvdXJjZSwgcyA9PiB0aGlzLnJlc3RvcmVTZXNzaW9uKHMpKTtcblx0XHRcdFx0XHRpZiAoaGFuZGxlZCkge1xuXHRcdFx0XHRcdFx0c25hcHNob3QgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U25hcHNob3QocmVzb3VyY2VTdHIpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHQvLyBUcnkgc3ViYWdlbnQgcmVzdG9yZSBiZWZvcmUgcmVndWxhciBzZXNzaW9uIHJlc3RvcmVcblx0XHRcdFx0XHRcdGNvbnN0IHBhcnNlZFN1YmFnZW50ID0gcGFyc2VTdWJhZ2VudFNlc3Npb25VcmkocmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0aWYgKHBhcnNlZFN1YmFnZW50KSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX3Jlc3RvcmVTdWJhZ2VudFNlc3Npb24ocmVzb3VyY2VTdHIsIHBhcnNlZFN1YmFnZW50LnBhcmVudFNlc3Npb24pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5yZXN0b3JlU2Vzc2lvbihyZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRzbmFwc2hvdCA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChyZXNvdXJjZVN0cik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXNuYXBzaG90KSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgQ2Fubm90IHN1YnNjcmliZSB0byB1bmtub3duIHJlc291cmNlOiAke3Jlc291cmNlU3RyfWApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBFbnN1cmUgZ2l0IHN0YXRlIGhhcyBiZWVuIGNvbXB1dGVkIGZvciB0aGlzIHNlc3Npb24uIFdoZW4gdGhlIHNuYXBzaG90XG5cdFx0XHQvLyBhbHJlYWR5IGV4aXN0ZWQgKGUuZy4gc2VlZGVkIGJ5IGxpc3QgcXVlcnksIG9yIHJlc3RvcmVkIGVhcmxpZXIpLCB0aGVcblx0XHRcdC8vIHJlc3RvcmUgcGF0aCB0aGF0IG5vcm1hbGx5IGNhbGxzIGBfYXR0YWNoR2l0U3RhdGVgIGlzIHNraXBwZWQgXHUyMDE0IHNvXG5cdFx0XHQvLyB0cmlnZ2VyIGl0IGxhemlseSBoZXJlIGZvciB0aGUgZmlyc3Qgc3Vic2NyaWJlci4gYF9hdHRhY2hHaXRTdGF0ZWBcblx0XHRcdC8vIGlzIGFzeW5jIGFuZCB1cGRhdGVzIGBfbWV0YS5naXRgIG9uY2UgcmVhZHksIHdoaWNoIGNsaWVudHMgc2VlIHZpYVxuXHRcdFx0Ly8gdGhlIG5vcm1hbCBzdGF0ZS11cGRhdGUgc3RyZWFtLlxuXHRcdFx0Y29uc3Qgc2Vzc2lvblN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShyZXNvdXJjZVN0cik7XG5cdFx0XHRpZiAoIWlzQWhwQ2hhdENoYW5uZWwocmVzb3VyY2VTdHIpICYmIHNlc3Npb25TdGF0ZSAmJiByZWFkU2Vzc2lvbkdpdFN0YXRlKHNlc3Npb25TdGF0ZS5fbWV0YSkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gc2Vzc2lvblN0YXRlLndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdXG5cdFx0XHRcdFx0PyBVUkkucGFyc2Uoc2Vzc2lvblN0YXRlLndvcmtpbmdEaXJlY3Rvcmllc1swXSlcblx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0dm9pZCB0aGlzLl9naXRTdGF0ZVNlcnZpY2UucmVmcmVzaFNlc3Npb25HaXRTdGF0ZShyZXNvdXJjZVN0ciwgd29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBzbmFwc2hvdDtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMudW5zdWJzY3JpYmUocmVzb3VyY2UsIGNsaWVudElkKTtcblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cdH1cblxuXHQvKiogV2FpdHMgZm9yIGFuIGFybWVkIHN1YmFnZW50IGNoYXQgdG8gcmVnaXN0ZXIgKG9yIGl0cyB3YWl0IHRvIHRpbWUgb3V0KTsgcmV0dXJucyBgdW5kZWZpbmVkYCBpZiBub3QgYXJtZWQgb3IgbmV2ZXIgcmVnaXN0ZXJlZC4gKi9cblx0cHJpdmF0ZSBhc3luYyBfYXdhaXRQZW5kaW5nU3ViYWdlbnRDaGF0KHN1YmFnZW50Q2hhdFVyaTogc3RyaW5nKTogUHJvbWlzZTxJU3RhdGVTbmFwc2hvdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLl9wZW5kaW5nU3ViYWdlbnRDaGF0cy5nZXQoc3ViYWdlbnRDaGF0VXJpKTtcblx0XHRpZiAoIXBlbmRpbmcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGF3YWl0IHBlbmRpbmcucDtcblx0XHRyZXR1cm4gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNuYXBzaG90KHN1YmFnZW50Q2hhdFVyaSk7XG5cdH1cblxuXHRhZGRTdWJzY3JpYmVyKHJlc291cmNlOiBVUkksIGNsaWVudElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRsZXQgc2V0ID0gdGhpcy5fcmVzb3VyY2VTdWJzY3JpYmVycy5nZXQocmVzb3VyY2UpO1xuXHRcdGNvbnN0IHdhc1Vuc3Vic2NyaWJlZCA9ICFzZXQgfHwgc2V0LnNpemUgPT09IDA7XG5cdFx0aWYgKCFzZXQpIHtcblx0XHRcdHNldCA9IG5ldyBTZXQoKTtcblx0XHRcdHRoaXMuX3Jlc291cmNlU3Vic2NyaWJlcnMuc2V0KHJlc291cmNlLCBzZXQpO1xuXHRcdH1cblx0XHRzZXQuYWRkKGNsaWVudElkKTtcblx0XHQvLyBBIG5ldyBzdWJzY3JpYmVyIG1lYW5zIHRoZSBzZXNzaW9uIGlzIGJlaW5nIG9ic2VydmVkIGFnYWluOyBjYW5jZWxcblx0XHQvLyBhbnkgcGVuZGluZyBHQyBvciBpZGxlLXJlbGVhc2UgYXJtZWQgd2hpbGUgaXQgaGFkIG5vIHN1YnNjcmliZXJzLlxuXHRcdHRoaXMuX2NhbmNlbFBlbmRpbmdTZXNzaW9uR2MocmVzb3VyY2UpO1xuXHRcdHRoaXMuX2NhbmNlbFBlbmRpbmdTZXNzaW9uUmVsZWFzZShyZXNvdXJjZSk7XG5cdFx0Ly8gMFx1MjE5MjEgdHJhbnNpdGlvbiBcdTIwMTQgY292ZXJzIGJvdGggdGhlIGZ1bGwgc3Vic2NyaWJlIHBhdGggQU5EIHRoZVxuXHRcdC8vIGhhbmRzaGFrZSBmYXN0LXBhdGggdXNlZCBieSBgUHJvdG9jb2xTZXJ2ZXJIYW5kbGVyYCB3aGVuIHN0YXRlIGlzXG5cdFx0Ly8gYWxyZWFkeSBjYWNoZWQuIFRoZSBjb29yZGluYXRvciBkZWNpZGVzIHdoZXRoZXIgdGhlIFVSSSBpcyBvbmVcblx0XHQvLyBpdCBjYXJlcyBhYm91dCAoZS5nLiB1bmNvbW1pdHRlZCBjaGFuZ2VzZXQgXHUyMTkyIHRyaWdnZXIgcmVmcmVzaCkuXG5cdFx0aWYgKHdhc1Vuc3Vic2NyaWJlZCkge1xuXHRcdFx0dGhpcy5fY2hhbmdlc2V0Q29vcmRpbmF0b3Iub25GaXJzdFN1YnNjcmliZXIocmVzb3VyY2UpO1xuXHRcdH1cblx0fVxuXG5cdHVuc3Vic2NyaWJlKHJlc291cmNlOiBVUkksIGNsaWVudElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzZXQgPSB0aGlzLl9yZXNvdXJjZVN1YnNjcmliZXJzLmdldChyZXNvdXJjZSk7XG5cdFx0aWYgKCFzZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0c2V0LmRlbGV0ZShjbGllbnRJZCk7XG5cdFx0aWYgKHNldC5zaXplID4gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9yZXNvdXJjZVN1YnNjcmliZXJzLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0dGhpcy5fY2hhbmdlc2V0Q29vcmRpbmF0b3Iub25MYXN0U3Vic2NyaWJlcihyZXNvdXJjZSk7XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLm9uQ2hhbmdlc2V0TGl2ZW5lc3NDaGFuZ2VkKCk7XG5cdFx0Ly8gQW4gZW1wdHkgc2Vzc2lvbiB3aG9zZSBsYXN0IHN1YnNjcmliZXIgZHJvcHBlZCBpcyBhIGNhbmRpZGF0ZSBmb3Jcblx0XHQvLyBmdWxsIEdDIChwcm92aWRlciBzZXNzaW9uLCB3b3JrdHJlZSwgb24tZGlzayBzdGF0ZSkuIFNlc3Npb25zIHdpdGhcblx0XHQvLyBhdCBsZWFzdCBvbmUgdHVybiBmYWxsIHRocm91Z2ggdG8ge0BsaW5rIF9tYXliZUV2aWN0SWRsZVNlc3Npb259LFxuXHRcdC8vIHdoaWNoIG9ubHkgZHJvcHMgdGhlIGluLW1lbW9yeSBjYWNoZSBhbmQgbGV0cyB0aGUgc2Vzc2lvbiBiZVxuXHRcdC8vIHJlc3RvcmVkIGZyb20gZGlzayBsYXRlci4gU2tpcHBpbmcgZXZpY3Rpb24gaGVyZSBmb3IgZW1wdHlcblx0XHQvLyBzZXNzaW9ucyBlbnN1cmVzIHRoZWlyIHN0YXRlIHN0YXlzIG9ic2VydmFibGUgc28gYSByZS1zdWJzY3JpYmVcblx0XHQvLyBjYW4gcmUtYXJtIEdDLlxuXHRcdGlmICh0aGlzLl9tYXliZVNjaGVkdWxlU2Vzc2lvbkdjKHJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBEZWZlciB0aGUgaWRsZS1zZXNzaW9uIHJlbGVhc2UgYmVoaW5kIGEgZ3JhY2Ugd2luZG93IHJhdGhlciB0aGFuXG5cdFx0Ly8gcmVsZWFzaW5nIHN5bmNocm9ub3VzbHkuIEEgY2xpZW50IHRoYXQgcmVjb25uZWN0cyAob3IgcmUtc3Vic2NyaWJlcylcblx0XHQvLyB3aXRoaW4gdGhlIHdpbmRvdyBjYW5jZWxzIHRoaXMgdmlhIHtAbGluayBfY2FuY2VsUGVuZGluZ1Nlc3Npb25SZWxlYXNlfVxuXHRcdC8vIGFuZCBrZWVwcyB0aGUgbGl2ZSBwcm92aWRlciBTREsgc2Vzc2lvbiwgYXZvaWRpbmcgYSBkaXNjb25uZWN0L3Jlc3VtZVxuXHRcdC8vIGNodXJuIGN5Y2xlIHRoYXQgcmFjZXMgY29uY3VycmVudCBzZXNzaW9uIG9wZXJhdGlvbnMgb24gdGhlIHNoYXJlZFxuXHRcdC8vIHByb3ZpZGVyIHJ1bnRpbWUuIEEgemVybyBncmFjZSByZWxlYXNlcyBvbiB0aGUgbmV4dCB0aWNrLlxuXHRcdHRoaXMuX3BlbmRpbmdTZXNzaW9uUmVsZWFzZS5zZXQocmVzb3VyY2UsIGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX3BlbmRpbmdTZXNzaW9uUmVsZWFzZS5kZWxldGVBbmREaXNwb3NlKHJlc291cmNlKTtcblx0XHRcdHZvaWQgdGhpcy5fbWF5YmVFdmljdElkbGVTZXNzaW9uKHJlc291cmNlKS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGVyciwgYFtBZ2VudFNlcnZpY2VdIEZhaWxlZCB0byBldmljdCBpZGxlIHNlc3Npb24gJHtyZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdFx0fSk7XG5cdFx0fSwgU0VTU0lPTl9SRUxFQVNFX0dSQUNFX01TKSk7XG5cdH1cblxuXHRwcml2YXRlIF9jYW5jZWxQZW5kaW5nU2Vzc2lvblJlbGVhc2UocmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmdTZXNzaW9uUmVsZWFzZS5kZWxldGVBbmREaXNwb3NlKHJlc291cmNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJZiBgcmVzb3VyY2VgIG5hbWVzIGEgc2Vzc2lvbiB0aGF0IG5vIGNsaWVudCBpcyBzdGlsbCBzdWJzY3JpYmVkIHRvIGFuZFxuXHQgKiB0aGF0IGhhcyBwcm9kdWNlZCBubyB0dXJucyAoYW5kIGhhcyBubyBhY3RpdmUgdHVybiksIHNjaGVkdWxlIGEgZGVsYXllZFxuXHQgKiB7QGxpbmsgX3J1blNlc3Npb25HY30gdG8gZnVsbHkgdGVhciBpdCBkb3duIFx1MjAxNCBwcm92aWRlciBzZXNzaW9uLCB3b3JrdHJlZSxcblx0ICogcGVyc2lzdGVkIHN0YXRlIGFuZCBhbGwuIFNlc3Npb25zIHdpdGggYXQgbGVhc3Qgb25lIHR1cm4gYXJlIGxlZnQgdG8gdGhlXG5cdCAqIGV4aXN0aW5nIHtAbGluayBfbWF5YmVFdmljdElkbGVTZXNzaW9ufSBwYXRoIHdoaWNoIG9ubHkgZHJvcHMgY2FjaGVkXG5cdCAqIHN0YXRlIGFuZCBsZXRzIHRoZSBzZXNzaW9uIGJlIHJlc3RvcmVkIGZyb20gZGlzayBsYXRlci5cblx0ICpcblx0ICogR0MgaXMgcmVzdHJpY3RlZCB0byBzZXNzaW9ucyB0aGF0IGFyZSBzdGlsbCB1bnVzZWQgZHJhZnRzLiBBIHNlc3Npb24gdGhhdFxuXHQgKiB3YXMgcmVzdG9yZWQgZnJvbSBkdXJhYmxlIHN0b3JhZ2UsIG9yIHRoYXQgaGFzIGV2ZXIgaGFkIGEgdHVybiwgaXMgbmV2ZXJcblx0ICogYSBjYW5kaWRhdGUgaG93ZXZlciBlbXB0eSBpdCBsb29rcyBub3cgXHUyMDE0IGFuIGVtcHR5IHN0YXRlIGlzIGFsc28gd2hhdCBhXG5cdCAqIGZhaWxlZCBoaXN0b3J5IGxvYWQgYW5kIGEgdHJ1bmNhdGUtdG8temVybyBsZWF2ZSBiZWhpbmQuXG5cdCAqXG5cdCAqIFRoZSBkZWxheSAoe0BsaW5rIFNFU1NJT05fR0NfR1JBQ0VfTVN9KSBnaXZlcyBhIGRpc2Nvbm5lY3RlZCBjbGllbnQgdGltZVxuXHQgKiB0byByZWNvbm5lY3Qgb3IgYSB3b3Jrc3BhY2Ugc3dpdGNoIHRvIHNldHRsZS4gQW55IHN1YnNlcXVlbnQgc3Vic2NyaWJlXG5cdCAqIChvciBjcmVhdGVTZXNzaW9uIG9uIHRoZSBzYW1lIFVSSSkgY2FuY2VscyB0aGUgdGltZXIgdmlhXG5cdCAqIHtAbGluayBfY2FuY2VsUGVuZGluZ1Nlc3Npb25HY30uXG5cdCAqXG5cdCAqIFJldHVybnMgYHRydWVgIGlmIGEgR0MgdGltZXIgd2FzIGFybWVkIChleGlzdGluZyBvciBuZXdseSBzY2hlZHVsZWQpLFxuXHQgKiBzbyBjYWxsZXJzIGNhbiBza2lwIGFsdGVybmF0aXZlIGNsZWFudXAgcGF0aHMuXG5cdCAqL1xuXHRwcml2YXRlIF9tYXliZVNjaGVkdWxlU2Vzc2lvbkdjKHJlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHQvLyBTdWJhZ2VudCBVUklzIGFyZSBiYWNrZWQgYnkgdGhlIHBhcmVudCBzZXNzaW9uOyB0aGUgcGFyZW50J3MgR0MgaXNcblx0XHQvLyBzY2hlZHVsZWQgd2hlbiBpdHMgb3duIHN1YnNjcmliZXIgY291bnQgcmVhY2hlcyB6ZXJvLlxuXHRcdGlmIChwYXJzZVN1YmFnZW50U2Vzc2lvblVyaShyZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3Qga2V5ID0gcmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoa2V5KTtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChzdGF0ZS50dXJucy5sZW5ndGggPiAwIHx8IHN0YXRlLmFjdGl2ZVR1cm4gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc3RhdGVNYW5hZ2VyLmlzVW51c2VkRHJhZnQoa2V5KSAhPT0gdHJ1ZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50U2VydmljZV0gU2tpcHBpbmcgR0MgZm9yIHNlc3Npb24gdGhhdCBpcyBub3QgYW4gdW51c2VkIGRyYWZ0OiAke2tleX1gKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ1Nlc3Npb25HYy5zZXQocmVzb3VyY2UsIGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX3BlbmRpbmdTZXNzaW9uR2MuZGVsZXRlQW5kRGlzcG9zZShyZXNvdXJjZSk7XG5cdFx0XHR0aGlzLl9ydW5TZXNzaW9uR2MocmVzb3VyY2UpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyLCBgW0FnZW50U2VydmljZV0gR0MgZmFpbGVkIGZvciAke2tleX1gKTtcblx0XHRcdH0pO1xuXHRcdH0sIFNFU1NJT05fR0NfR1JBQ0VfTVMpKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2NhbmNlbFBlbmRpbmdTZXNzaW9uR2MocmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmdTZXNzaW9uR2MuZGVsZXRlQW5kRGlzcG9zZShyZXNvdXJjZSk7XG5cdH1cblxuXHQvKipcblx0ICogRmlyZXMge0BsaW5rIFNFU1NJT05fR0NfR1JBQ0VfTVN9IGFmdGVyIGEgc2Vzc2lvbiBsb3N0IGl0cyBsYXN0XG5cdCAqIHN1YnNjcmliZXIgd2hpbGUgZW1wdHkuIFJlLWNoZWNrcyB0aGUgaW52YXJpYW50cyAoc3RpbGwgbm8gc3Vic2NyaWJlcnMsXG5cdCAqIHN0aWxsIGVtcHR5LCBzdGlsbCBhbiB1bnVzZWQgZHJhZnQpIGJlZm9yZSB0ZWFyaW5nIHRoZSBzZXNzaW9uIGRvd24gdmlhXG5cdCAqIHtAbGluayBkaXNwb3NlU2Vzc2lvbn0uIFRoZSBjYWNoZWQgc3RhdGUgbWF5IGFscmVhZHkgaGF2ZSBiZWVuIGV2aWN0ZWQgYnlcblx0ICoge0BsaW5rIF9tYXliZUV2aWN0SWRsZVNlc3Npb259OyBpbiB0aGF0IGNhc2Ugd2Ugc3RpbGwgcHJvY2VlZCBiZWNhdXNlXG5cdCAqIFwiZXZpY3RlZCArIG5vIHJlc3Vic2NyaWJlXCIgaW1wbGllcyBubyBjbGllbnQgaXMgb2JzZXJ2aW5nIHRoZSBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcnVuU2Vzc2lvbkdjKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBrZXkgPSByZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGlmICh0aGlzLl9yZXNvdXJjZVN1YnNjcmliZXJzLmhhcyhyZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKGtleSk7XG5cdFx0aWYgKHN0YXRlICYmIChzdGF0ZS50dXJucy5sZW5ndGggPiAwIHx8IHN0YXRlLmFjdGl2ZVR1cm4gIT09IHVuZGVmaW5lZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gVGhlIHNlc3Npb24gbWF5IGhhdmUgYmVlbiByZWh5ZHJhdGVkIG9yIHVzZWQgZHVyaW5nIHRoZSBncmFjZSB3aW5kb3cuXG5cdFx0Ly8gQW4gKmFic2VudCogZW50cnkgbWVhbnMgaXQgd2FzIGV2aWN0ZWQgYW5kIG5ldmVyIGNhbWUgYmFjaywgd2hpY2ggaXNcblx0XHQvLyBzdGlsbCBhIHZhbGlkIHRhcmdldCBcdTIwMTQgc28gb25seSBhbiBleHBsaWNpdCBub24tZHJhZnQgYWJvcnRzLlxuXHRcdGlmICh0aGlzLl9zdGF0ZU1hbmFnZXIuaXNVbnVzZWREcmFmdChrZXkpID09PSBmYWxzZSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50U2VydmljZV0gR0MgYWJvcnRlZCwgc2Vzc2lvbiBpcyBubyBsb25nZXIgYW4gdW51c2VkIGRyYWZ0OiAke2tleX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRTZXJ2aWNlXSBHQzogZGlzcG9zaW5nIGVtcHR5IHVuc3Vic2NyaWJlZCBzZXNzaW9uICR7a2V5fWApO1xuXHRcdGF3YWl0IHRoaXMuZGlzcG9zZVNlc3Npb24ocmVzb3VyY2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIElmIGByZXNvdXJjZWAgbmFtZXMgYW4gaWRsZSBzZXNzaW9uIHdpdGggbm8gcmVtYWluaW5nIHN1YnNjcmliZXJzLCBkcm9wIGl0c1xuXHQgKiBjYWNoZWQgc3RhdGUgYW5kIHJlbGVhc2UgaXRzIFNESyBjaGF0cy4gU3ViYWdlbnQgVVJJcyBldmljdCB0aGUgcGFyZW50XG5cdCAqIHNlc3Npb24gZW50cnkgYmVjYXVzZSB0aGUgcGFyZW50IG93bnMgdGhlIG1hdGVyaWFsaXplZCB0dXJuIHRyZWUuIER1cmFibGVcblx0ICogZGF0YSBzdGF5cyBpbnRhY3Q7IHRoZSBuZXh0IHN1YnNjcmliZSByZXN0b3JlcyB0aGUgc2Vzc2lvbiBvbiBkZW1hbmQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9tYXliZUV2aWN0SWRsZVNlc3Npb24ocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGtleSA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0aWYgKHRoaXMuX3Jlc291cmNlU3Vic2NyaWJlcnMuaGFzKHJlc291cmNlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBXYWxrIHVwIHRoZSBzdWJhZ2VudCBhbmNlc3RyeTogdGhlIFNESyBzZXNzaW9uIGFuZCBpdHMgdHVybiB0cmVlIGFyZVxuXHRcdC8vIG93bmVkIGJ5IHRoZSByb290IHNlc3Npb24sIHNvIGV2aWN0aW9uIG11c3QgdGFyZ2V0IHRoZSByb290LlxuXHRcdGxldCBldmljdGlvblRhcmdldCA9IHJlc291cmNlO1xuXHRcdHtcblx0XHRcdGxldCBwYXJzZWQ7XG5cdFx0XHR3aGlsZSAoKHBhcnNlZCA9IHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpKGV2aWN0aW9uVGFyZ2V0KSkpIHtcblx0XHRcdFx0ZXZpY3Rpb25UYXJnZXQgPSBwYXJzZWQucGFyZW50U2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9XG5cdFx0Ly8gRG9uJ3QgZXZpY3QgaWYgdGhlIHJvb3Qgb3IgYW55IG9mIGl0cyBzdWJhZ2VudCBkZXNjZW5kYW50cyBzdGlsbCBoYXMgc3Vic2NyaWJlcnMuXG5cdFx0aWYgKHRoaXMuX3Jlc291cmNlU3Vic2NyaWJlcnMuaGFzKGV2aWN0aW9uVGFyZ2V0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHN1YnNjcmliZWRVcmkgb2YgdGhpcy5fcmVzb3VyY2VTdWJzY3JpYmVycy5rZXlzKCkpIHtcblx0XHRcdGlmICh0aGlzLl9pc1N1YmFnZW50RGVzY2VuZGFudE9mKHN1YnNjcmliZWRVcmksIGV2aWN0aW9uVGFyZ2V0KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGV2aWN0aW9uVGFyZ2V0S2V5ID0gZXZpY3Rpb25UYXJnZXQudG9TdHJpbmcoKTtcblx0XHQvLyBBIHJlc3RvcmUvcmVzdW1lIHJhY2luZyB0aGlzIHVuc3Vic2NyaWJlIG1lYW5zIGEgY2xpZW50IGlzIGFib3V0IHRvXG5cdFx0Ly8gb2JzZXJ2ZSB0aGUgc2Vzc2lvbiBhZ2FpbjsgcmVsZWFzaW5nIG5vdyB3b3VsZCB0ZWFyIGRvd24gc3RhdGUgdGhhdFxuXHRcdC8vIHRoZSBpbi1mbGlnaHQgcmVoeWRyYXRlIGlzIHBvcHVsYXRpbmcuXG5cdFx0aWYgKHRoaXMuX3Jlc3RvcmVTZXNzaW9uSW5GbGlnaHQuaGFzKGV2aWN0aW9uVGFyZ2V0S2V5KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB0YXJnZXRTdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoZXZpY3Rpb25UYXJnZXRLZXkpO1xuXHRcdGlmICghdGFyZ2V0U3RhdGUgfHwgdGFyZ2V0U3RhdGUuYWN0aXZlVHVybiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGNoYXRzID0gdGhpcy5fZ2V0U2Vzc2lvbkNoYXRzSW5UZWFyZG93bk9yZGVyKGV2aWN0aW9uVGFyZ2V0KTtcblx0XHRhd2FpdCB0aGlzLl93aGVuU2Vzc2lvbkRhdGFJZGxlKGV2aWN0aW9uVGFyZ2V0KTtcblx0XHRpZiAodGhpcy5fcmVzb3VyY2VTdWJzY3JpYmVycy5oYXMoZXZpY3Rpb25UYXJnZXQpIHx8IHRoaXMuX3Jlc3RvcmVTZXNzaW9uSW5GbGlnaHQuaGFzKGV2aWN0aW9uVGFyZ2V0S2V5KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IHN1YnNjcmliZWRVcmkgb2YgdGhpcy5fcmVzb3VyY2VTdWJzY3JpYmVycy5rZXlzKCkpIHtcblx0XHRcdGlmICh0aGlzLl9pc1N1YmFnZW50RGVzY2VuZGFudE9mKHN1YnNjcmliZWRVcmksIGV2aWN0aW9uVGFyZ2V0KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHNldHRsZWRTdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoZXZpY3Rpb25UYXJnZXRLZXkpO1xuXHRcdGlmICghc2V0dGxlZFN0YXRlIHx8IHNldHRsZWRTdGF0ZS5hY3RpdmVUdXJuICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRTZXJ2aWNlXSBFdmljdGluZyBpZGxlIHNlc3Npb246ICR7ZXZpY3Rpb25UYXJnZXRLZXl9ICh0cmlnZ2VyZWQgYnkgdW5zdWJzY3JpYmUgb2YgJHtrZXl9KWApO1xuXHRcdC8vIEFsc28gZXZpY3QgYW55IHNpYmxpbmcgc3ViYWdlbnQgZW50cmllcyBjYWNoZWQgdW5kZXIgdGhlIHBhcmVudDogdGhlaXJcblx0XHQvLyBhdXRob3JpdGF0aXZlIHN0YXRlIGlzIHRoZSBwYXJlbnQncyB0dXJuIHRyZWUsIGFuZCBkcm9wcGluZyB0aGUgcGFyZW50XG5cdFx0Ly8gd291bGQgbGVhdmUgdGhlbSBvcnBoYW5lZC5cblx0XHRjb25zdCBzdWJhZ2VudFByZWZpeCA9IGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpUHJlZml4KGV2aWN0aW9uVGFyZ2V0KTtcblx0XHRmb3IgKGNvbnN0IGNhY2hlZEtleSBvZiB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblVyaXNXaXRoUHJlZml4KHN1YmFnZW50UHJlZml4KSkge1xuXHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLnJlbW92ZVNlc3Npb24oY2FjaGVkS2V5KTtcblx0XHR9XG5cdFx0dGhpcy5fc2lkZUVmZmVjdHMuY2xlYXJTZXNzaW9uVGl0bGVTdGF0ZShldmljdGlvblRhcmdldEtleSwgc2V0dGxlZFN0YXRlLmNoYXRzLm1hcChjaGF0ID0+IGNoYXQucmVzb3VyY2UpKTtcblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIucmVtb3ZlU2Vzc2lvbihldmljdGlvblRhcmdldEtleSk7XG5cdFx0Ly8gUmVsZWFzZSB0aGUgcHJvdmlkZXIncyBpbi1tZW1vcnkgU0RLIHNlc3Npb24gaW4gbG9ja3N0ZXAgd2l0aCB0aGVcblx0XHQvLyBjYWNoZWQgc3RhdGUuIE5vbi1kZXN0cnVjdGl2ZTogZHVyYWJsZSBkYXRhIGlzIHByZXNlcnZlZCBzbyB0aGVcblx0XHQvLyBzZXNzaW9uIHJlc3VtZXMgdHJhbnNwYXJlbnRseSBvbiB0aGUgbmV4dCBhY2Nlc3MuIEZpcmUtYW5kLWZvcmdldCBcdTIwMTRcblx0XHQvLyB0aGUgcHJvdmlkZXIgc2VxdWVuY2VzIHRoZSByZWxlYXNlIGludGVybmFsbHkgYW5kIHJlLWNoZWNrcyBpdHMgb3duXG5cdFx0Ly8gaW52YXJpYW50cyAoZS5nLiBhIHR1cm4gdGhhdCBzdGFydGVkIGFmdGVyIHRoaXMgY2FsbCkuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9maW5kUHJvdmlkZXJGb3JTZXNzaW9uKGV2aWN0aW9uVGFyZ2V0KTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlbGVhc2UgPSB0aGlzLl9yZWxlYXNlU2Vzc2lvbihwcm92aWRlciwgZXZpY3Rpb25UYXJnZXQsIGNoYXRzKTtcblx0XHRjb25zdCB0cmFja2VkUmVsZWFzZSA9IHJlbGVhc2UuY2F0Y2goZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyLCBgW0FnZW50U2VydmljZV0gRmFpbGVkIHRvIHJlbGVhc2UgaWRsZSBzZXNzaW9uICR7ZXZpY3Rpb25UYXJnZXRLZXl9YCk7XG5cdFx0fSk7XG5cdFx0dGhpcy5fcmVsZWFzZVNlc3Npb25JbkZsaWdodC5zZXQoZXZpY3Rpb25UYXJnZXRLZXksIHRyYWNrZWRSZWxlYXNlKTtcblx0XHR2b2lkIHRyYWNrZWRSZWxlYXNlLnRoZW4oKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3JlbGVhc2VTZXNzaW9uSW5GbGlnaHQuZ2V0KGV2aWN0aW9uVGFyZ2V0S2V5KSA9PT0gdHJhY2tlZFJlbGVhc2UpIHtcblx0XHRcdFx0dGhpcy5fcmVsZWFzZVNlc3Npb25JbkZsaWdodC5kZWxldGUoZXZpY3Rpb25UYXJnZXRLZXkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0Ly8gUmV0dXJucyB0cnVlIHdoZW4gYSBjaGFuZ2VzZXQgaXMgc2FmZSB0byBkcm9wIGZyb20gdGhlIGluLW1lbW9yeSBjYWNoZS5cblx0cHJpdmF0ZSBfaXNDaGFuZ2VzZXRFdmljdGFibGUoY2hhbmdlc2V0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBjaGFuZ2VzZXRVcmkgPSBVUkkucGFyc2UoY2hhbmdlc2V0KTtcblx0XHQvLyBBIGRpcmVjdCBjaGFuZ2VzZXQgc3Vic2NyaWJlciBpcyByZW5kZXJpbmcgdGhpcyBleHBhbmRlZCBVUkkuIEtlZXBcblx0XHQvLyB0aGUgc3RhdGUgYWxpdmUgc28gZnV0dXJlIGVudmVsb3BlcyBzdGlsbCB0YXJnZXQgYW4gZXhpc3Rpbmcgb2JqZWN0LlxuXHRcdGlmICh0aGlzLl9yZXNvdXJjZVN1YnNjcmliZXJzLmhhcyhjaGFuZ2VzZXRVcmkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ2hhbmdlc2V0VXJpKGNoYW5nZXNldCk7XG5cdFx0Ly8gVGhpcyBndWFyZCBvbmx5IGhhbmRsZXMgcmVjb2duaXplZCBjaGFuZ2VzZXQgVVJJczsgbGVhdmUgYW55dGhpbmcgZWxzZSBhbG9uZS5cblx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLnBhcnNlKHBhcnNlZC5zZXNzaW9uVXJpKTtcblx0XHQvLyBBIHBhcmVudC1zZXNzaW9uIHN1YnNjcmliZXIgY2FuIHN0aWxsIHJlY2VpdmUgY2F0YWxvZ3VlIGNvdW50IHVwZGF0ZXNcblx0XHQvLyBmcm9tIHRoaXMgY2hhbmdlc2V0LCBzbyBrZWVwIHRoZSBiYWNraW5nIHN0YXRlIHdoaWxlIHRoZSBzZXNzaW9uIGlzIG9ic2VydmVkLlxuXHRcdGlmICh0aGlzLl9yZXNvdXJjZVN1YnNjcmliZXJzLmhhcyhzZXNzaW9uVXJpKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBTdWJhZ2VudCB2aWV3cyBhcmUgYmFja2VkIGJ5IHRoZSBwYXJlbnQgc2Vzc2lvbiB0cmVlOyB0cmVhdCBhbnlcblx0XHQvLyBzdWJzY3JpYmVkIGRlc2NlbmRhbnQgYXMgYSBwYXJlbnQtc2Vzc2lvbiBwaW4gZm9yIGNhY2hlIGV2aWN0aW9uLlxuXHRcdGZvciAoY29uc3Qgc3Vic2NyaWJlZFVyaSBvZiB0aGlzLl9yZXNvdXJjZVN1YnNjcmliZXJzLmtleXMoKSkge1xuXHRcdFx0aWYgKHRoaXMuX2lzU3ViYWdlbnREZXNjZW5kYW50T2Yoc3Vic2NyaWJlZFVyaSwgc2Vzc2lvblVyaSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBJZiBhIGdpdC9zZXNzaW9uL3VuY29tbWl0dGVkIGNoYW5nZXNldCByZWNvbXB1dGUgaXMgY3VycmVudGx5IHJ1bm5pbmcgZm9yIHRoaXMgY2hhbmdlc2V0IFVSSSxcblx0XHQvLyBkbyBub3QgZXZpY3QgaXRzIGNhY2hlZCBzdGF0ZSB5ZXQuIE9uY2UgdGhlIGNvbXB1dGUgaXMgZG9uZSxcblx0XHQvLyBpdCBpcyBzYWZlIHRvIGV2aWN0IGJlY2F1c2UgdGhlIHN0YXRlIGlzIGp1c3QgYSBjYWNoZSBhbmQgY2FuIGJlIHJlY3JlYXRlZCBsYXRlci5cblx0XHRyZXR1cm4gIXRoaXMuX2NoYW5nZXNldHMuaXNTdGF0aWNDaGFuZ2VzZXRDb21wdXRlQWN0aXZlKGNoYW5nZXNldCk7XG5cdH1cblxuXHRwcml2YXRlIF9pc1N1YmFnZW50RGVzY2VuZGFudE9mKHJlc291cmNlOiBVUkksIHBhcmVudDogVVJJKTogYm9vbGVhbiB7XG5cdFx0bGV0IHBhcnNlZCA9IHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpKHJlc291cmNlKTtcblx0XHR3aGlsZSAocGFyc2VkKSB7XG5cdFx0XHRpZiAoaXNFcXVhbChwYXJzZWQucGFyZW50U2Vzc2lvbiwgcGFyZW50KSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdHBhcnNlZCA9IHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpKHBhcnNlZC5wYXJlbnRTZXNzaW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFBlci1jbGllbnQgc2VxdWVuY2VyIHRoYXQgc2VyaWFsaXNlcyBhY3Rpb24gZGlzcGF0Y2hlcyB3aG9zZVxuXHQgKiBwcm9jZXNzaW5nIHJlcXVpcmVzIGFuIGFzeW5jaHJvbm91cyBwcmVsdWRlIChlLmcuIHJlc29sdmluZyBhIHJlc3RvcmVkXG5cdCAqIHBlZXIgY2hhdCBvciBzbmFwc2hvdHRpbmcgdXNlci1tZXNzYWdlIGF0dGFjaG1lbnRzIGJlZm9yZSB0aGUgYWN0aW9uIGlzXG5cdCAqIHJlZHVjZWQgaW50byBzdGF0ZSkuIEFjdGlvbnMgdGhhdCBkb24ndCBuZWVkIGFueSBhc3luY2hyb25vdXMgcHJlbHVkZVxuXHQgKiBieXBhc3MgdGhlIHF1ZXVlIGVudGlyZWx5IGFzIGxvbmcgYXMgbm8gZWFybGllciBhY3Rpb24gZnJvbSB0aGUgc2FtZVxuXHQgKiBjbGllbnQgaXMgc3RpbGwgcGVuZGluZy5cblx0ICpcblx0ICogdG9kb0Bjb25ub3I0MzEyOiB3ZSBjYW4gZHJvcCB0aGlzIHdoZW4gc2VuZGluZyBhIG1lc3NhZ2UgYmVjb21lIGEgY29tbWFuZFxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY2xpZW50RGlzcGF0Y2hRdWV1ZXMgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTx2b2lkPj4oKTtcblxuXHQvKiogQSByZWFkL2FyY2hpdmUgdG9nZ2xlIGNhcnJpZXMgbm8gaW50ZW50IHRvIG9wZW4sIHNvIGl0IG11c3Qgbm90IHRyaWdnZXIgbGVnYWN5IGFkb3B0aW9uIG9uIGFuIHVuLWxvYWRlZCBzZXNzaW9uLiAqL1xuXHRwcml2YXRlIF9pc1Bhc3NpdmVNZXRhZGF0YUFjdGlvbihhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uIHwgVGVybWluYWxBY3Rpb24gfCBDbGllbnRDaGFuZ2VzZXRBY3Rpb24gfCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB8IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uSXNSZWFkQ2hhbmdlZCB8fCBhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uSXNBcmNoaXZlZENoYW5nZWQ7XG5cdH1cblxuXHRkaXNwYXRjaEFjdGlvbihjaGFubmVsOiBzdHJpbmcsIGFjdGlvbjogU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24gfCBUZXJtaW5hbEFjdGlvbiB8IENsaWVudENoYW5nZXNldEFjdGlvbiB8IENsaWVudEFubm90YXRpb25zQWN0aW9uIHwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uLCBjbGllbnRJZDogc3RyaW5nLCBjbGllbnRTZXE6IG51bWJlciwgY2xpZW50Q29udGV4dE9yVHlwZTogSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQgfCBBZ2VudEhvc3RDbGllbnRUeXBlID0gQWdlbnRIb3N0Q2xpZW50VHlwZS5Vbmtub3duKTogdm9pZCB7XG5cdFx0Y29uc3QgY2xpZW50Q29udGV4dCA9IHR5cGVvZiBjbGllbnRDb250ZXh0T3JUeXBlID09PSAnc3RyaW5nJ1xuXHRcdFx0PyBjcmVhdGVVbmtub3duQWdlbnRIb3N0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dChjbGllbnRDb250ZXh0T3JUeXBlKVxuXHRcdFx0OiBjbGllbnRDb250ZXh0T3JUeXBlO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtBZ2VudFNlcnZpY2VdIGRpc3BhdGNoQWN0aW9uOiB0eXBlPSR7YWN0aW9uLnR5cGV9LCBjbGllbnRJZD0ke2NsaWVudElkfSwgY2xpZW50U2VxPSR7Y2xpZW50U2VxfWAsIGFjdGlvbik7XG5cblx0XHQvLyBDbGllbnRzIGRpc3BhdGNoIGNoYXQgKGNoYXQpIGFjdGlvbnMgYWdhaW5zdCBhIGNoYXQgY2hhbm5lbFxuXHRcdC8vIFVSSS4gS2VlcCB0aGF0IGNoYXQgY2hhbm5lbCBmb3IgdGhlIG9wdGltaXN0aWMgc3RhdGUgYXBwbHkgYW5kIGZvclxuXHRcdC8vIHBlci1jaGF0IHJvdXRpbmcgaW4gc2lkZSBlZmZlY3RzLCB3aGlsZSBkZXJpdmluZyB0aGUgb3duaW5nIHNlc3Npb25cblx0XHQvLyBVUkkgZm9yIGFsbCBzZXNzaW9uLXNjb3BlZCB3b3JrIChhdHRhY2htZW50IHNuYXBzaG90dGluZywgYWdlbnRcblx0XHQvLyBsb29rdXAsIHRlbGVtZXRyeSwgcGVybWlzc2lvbnMgXHUyMDE0IGFsbCBrZXllZCBieSBzZXNzaW9uKS5cblx0XHRjb25zdCBjaGF0Q2hhbm5lbCA9IGlzQWhwQ2hhdENoYW5uZWwoY2hhbm5lbCkgPyBjaGFubmVsIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHNlc3Npb25DaGFubmVsID0gY2hhdENoYW5uZWwgPyBwYXJzZVJlcXVpcmVkU2Vzc2lvblVyaUZyb21DaGF0VXJpKGNoYXRDaGFubmVsKSA6IGNoYW5uZWw7XG5cdFx0Y29uc3QgcmVxdWlyZXNTZXNzaW9uUmVzdG9yZSA9IChjaGF0Q2hhbm5lbCAhPT0gdW5kZWZpbmVkIHx8IGlzU2Vzc2lvbkFjdGlvbihhY3Rpb24pKSAmJiAhdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uQ2hhbm5lbCk7XG5cdFx0Y29uc3QgcmVxdWlyZXNQZWVyUmVzb2x1dGlvbiA9IGNoYXRDaGFubmVsICE9PSB1bmRlZmluZWQgJiYgIXRoaXMuX3N0YXRlTWFuYWdlci5nZXRDaGF0U3RhdGUoY2hhdENoYW5uZWwpO1xuXHRcdGNvbnN0IHJlcXVpcmVzVHVybk93bmVyUmVzb2x1dGlvbiA9IGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCAmJiAocmVxdWlyZXNTZXNzaW9uUmVzdG9yZSB8fCAodGhpcy5fZ2V0VW5yZXNvbHZlZFBlZXJDaGF0cyhzZXNzaW9uQ2hhbm5lbCk/Lmxlbmd0aCA/PyAwKSA+IDApO1xuXHRcdGNvbnN0IHJlcXVpcmVzQXR0YWNobWVudFJld3JpdGUgPSB0aGlzLl9uZWVkc0FzeW5jUmV3cml0ZShzZXNzaW9uQ2hhbm5lbCwgYWN0aW9uKTtcblx0XHRjb25zdCByZXF1aXJlc1Jldmlld1N0YXRlVXBkYXRlID0gYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhbmdlc2V0RmlsZXNSZXZpZXdDaGFuZ2VkO1xuXG5cdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMuX2NsaWVudERpc3BhdGNoUXVldWVzLmdldChjbGllbnRJZCk7XG5cdFx0aWYgKCFwZW5kaW5nICYmICFyZXF1aXJlc1Nlc3Npb25SZXN0b3JlICYmICFyZXF1aXJlc1BlZXJSZXNvbHV0aW9uICYmICFyZXF1aXJlc1R1cm5Pd25lclJlc29sdXRpb24gJiYgIXJlcXVpcmVzQXR0YWNobWVudFJld3JpdGUgJiYgIXJlcXVpcmVzUmV2aWV3U3RhdGVVcGRhdGUpIHtcblx0XHRcdHRoaXMuX2Rpc3BhdGNoQWN0aW9uTm93KGNoYW5uZWwsIHNlc3Npb25DaGFubmVsLCBhY3Rpb24sIGNsaWVudElkLCBjbGllbnRTZXEsIGNsaWVudENvbnRleHQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBuZXh0ID0gKHBlbmRpbmcgPz8gUHJvbWlzZS5yZXNvbHZlKCkpLnRoZW4oYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKHJlcXVpcmVzU2Vzc2lvblJlc3RvcmUpIHtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5wYXJzZShzZXNzaW9uQ2hhbm5lbCk7XG5cdFx0XHRcdGNvbnN0IHN1YmFnZW50ID0gcGFyc2VTdWJhZ2VudFNlc3Npb25Vcmkoc2Vzc2lvblVyaSk7XG5cdFx0XHRcdGlmIChzdWJhZ2VudCkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3Jlc3RvcmVTdWJhZ2VudFNlc3Npb24oc2Vzc2lvbkNoYW5uZWwsIHN1YmFnZW50LnBhcmVudFNlc3Npb24pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2lzUGFzc2l2ZU1ldGFkYXRhQWN0aW9uKGFjdGlvbikgJiYgcmVhZFNlc3Npb25FaGNsaUFkb3B0YWJsZSh0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U3VyZmFjZWRTZXNzaW9uU3VtbWFyeShzZXNzaW9uQ2hhbm5lbCk/Ll9tZXRhKSkge1xuXHRcdFx0XHRcdC8vIERyb3BwZWQgc28gbGlzdGluZyAvIHNjcm9sbGluZyBjYW4ndCBhZG9wdCBhbiB1bi1vcGVuZWQgbGVnYWN5IHNlc3Npb247IG9ubHkgYW4gZXhwbGljaXQgb3BlbiAoc3Vic2NyaWJlKSBhZG9wdHMuXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucmVzdG9yZVNlc3Npb24oc2Vzc2lvblVyaSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChjaGF0Q2hhbm5lbCAmJiByZXF1aXJlc1BlZXJSZXNvbHV0aW9uKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3N0YXRlTWFuYWdlci5yZXNvbHZlQ2hhdFN0YXRlKGNoYXRDaGFubmVsKTtcblx0XHRcdH1cblx0XHRcdGlmIChhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQgJiYgcmVxdWlyZXNUdXJuT3duZXJSZXNvbHV0aW9uKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Jlc29sdmVQZWVyQ2hhdHNGb3JUdXJuVmFsaWRhdGlvbihzZXNzaW9uQ2hhbm5lbCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXdyaXR0ZW46IFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uIHwgVGVybWluYWxBY3Rpb24gfCBDbGllbnRDaGFuZ2VzZXRBY3Rpb24gfCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB8IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbiA9IHJlcXVpcmVzQXR0YWNobWVudFJld3JpdGVcblx0XHRcdFx0PyBhd2FpdCB0aGlzLl9yZXdyaXRlVXNlck1lc3NhZ2VBdHRhY2htZW50cyhzZXNzaW9uQ2hhbm5lbCwgYWN0aW9uLCBjbGllbnRJZClcblx0XHRcdFx0OiBhY3Rpb247XG5cdFx0XHRpZiAocmV3cml0dGVuLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhbmdlc2V0RmlsZXNSZXZpZXdDaGFuZ2VkKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3Jldmlld1NlcnZpY2Uuc2V0UmV2aWV3U3RhdGUoY2hhbm5lbCwgcmV3cml0dGVuLmZpbGVzLCByZXdyaXR0ZW4ucmV2aWV3ZWQpO1xuXHRcdFx0XHRjb25zdCBjaGFuZ2VzZXQgPSBwYXJzZUNoYW5nZXNldFVyaShjaGFubmVsKTtcblx0XHRcdFx0aWYgKCFjaGFuZ2VzZXQpIHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYEludmFsaWQgY2hhbmdlc2V0IFVSSTogJHtjaGFubmVsfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2NoYW5nZXNldHMucmVmcmVzaEJyYW5jaENoYW5nZXNldChjaGFuZ2VzZXQuc2Vzc2lvblVyaSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9kaXNwYXRjaEFjdGlvbk5vdyhjaGFubmVsLCBzZXNzaW9uQ2hhbm5lbCwgcmV3cml0dGVuLCBjbGllbnRJZCwgY2xpZW50U2VxLCBjbGllbnRDb250ZXh0KTtcblx0XHR9KS5jYXRjaChlcnIgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0FnZW50U2VydmljZV0gYXN5bmMgZGlzcGF0Y2hBY3Rpb24gZmFpbGVkOiAke3RvRXJyb3JNZXNzYWdlKGVycil9YCk7XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIucmVqZWN0Q2xpZW50QWN0aW9uKGNoYW5uZWwsIGFjdGlvbiwgeyBjbGllbnRJZCwgY2xpZW50U2VxIH0sIHRvRXJyb3JNZXNzYWdlKGVycikpO1xuXHRcdH0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2NsaWVudERpc3BhdGNoUXVldWVzLmdldChjbGllbnRJZCkgPT09IG5leHQpIHtcblx0XHRcdFx0dGhpcy5fY2xpZW50RGlzcGF0Y2hRdWV1ZXMuZGVsZXRlKGNsaWVudElkKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX2NsaWVudERpc3BhdGNoUXVldWVzLnNldChjbGllbnRJZCwgbmV4dCk7XG5cdH1cblxuXHQvKipcblx0ICogQXV0aG9yaXRhdGl2ZSBnYXRlIGZvciBldmVyeSBjbGllbnQgd29ya2luZy1kaXJlY3RvcnkgYWN0aW9uLiBUaHJvd3Mgd2hlblxuXHQgKiB0aGUgc2Vzc2lvbiBvciBpdHMgcHJvdmlkZXIgY2Fubm90IGFjY2VwdCB0aGUgY2hhbmdlIFx1MjAxNCBpbmNsdWRpbmcgYSByZW1vdmFsXG5cdCAqIG9mIHRoZSBwcmltYXJ5IGRpcmVjdG9yeSBmb3IgYSBwcm92aWRlciB0aGF0IHBpbnMgaXQgXHUyMDE0IHNvIHRoZSBjYWxsZXIgY2FuXG5cdCAqIHJlamVjdCB0aGUgYWN0aW9uLiBSZXR1cm5zIHRoZSBjYW5vbmljYWxpemVkIGFjdGlvbiBvbiBzdWNjZXNzLlxuXHQgKi9cblx0cHJpdmF0ZSBfcHJlcGFyZVdvcmtpbmdEaXJlY3RvcnlBY3Rpb24oc2Vzc2lvbjogc3RyaW5nLCBhY3Rpb246IFNlc3Npb25Xb3JraW5nRGlyZWN0b3J5QWN0aW9uKTogU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlBY3Rpb24ge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uKTtcblx0XHRpZiAoIXN0YXRlIHx8IHN0YXRlLmxpZmVjeWNsZSAhPT0gU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSB8fCAhc3RhdGUud29ya2luZ0RpcmVjdG9yaWVzPy5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiBpcyBub3QgcmVhZHkgZm9yIHdvcmtpbmctZGlyZWN0b3J5IGNoYW5nZXM6ICR7c2Vzc2lvbn1gKTtcblx0XHR9XG5cdFx0aWYgKCFyZWFkU2Vzc2lvbk11bHRpUm9vdE1ldGFkYXRhKHN0YXRlLl9tZXRhKVxuXHRcdFx0fHwgcmVhZFNlc3Npb25Xb3Jrc3BhY2VsZXNzKHN0YXRlLl9tZXRhKVxuXHRcdFx0fHwgc3RhdGUuY29uZmlnPy52YWx1ZXNbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dID09PSAnd29ya3RyZWUnXG5cdFx0XHR8fCBzdGF0ZS5jaGF0cy5sZW5ndGggIT09IDFcblx0XHRcdHx8ICFzdGF0ZS5kZWZhdWx0Q2hhdFxuXHRcdFx0fHwgc3RhdGUuZGVmYXVsdENoYXQgIT09IHN0YXRlLmNoYXRzWzBdLnJlc291cmNlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gZG9lcyBub3Qgc3VwcG9ydCBkeW5hbWljIHdvcmtpbmctZGlyZWN0b3J5IGNoYW5nZXM6ICR7c2Vzc2lvbn1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLnBhcnNlKHNlc3Npb24pO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fZmluZFByb3ZpZGVyRm9yU2Vzc2lvbihzZXNzaW9uVXJpKTtcblx0XHRjb25zdCBjYXBhYmlsaXR5ID0gcHJvdmlkZXI/LmdldERlc2NyaXB0b3IoKS5jYXBhYmlsaXRpZXM/Lm11bHRpcGxlV29ya2luZ0RpcmVjdG9yaWVzO1xuXHRcdGlmICghcHJvdmlkZXIgfHwgIWNhcGFiaWxpdHkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgUHJvdmlkZXIgZG9lcyBub3Qgc3VwcG9ydCBkeW5hbWljIHdvcmtpbmctZGlyZWN0b3J5IGNoYW5nZXM6ICR7QWdlbnRTZXNzaW9uLnByb3ZpZGVyKHNlc3Npb25VcmkpID8/ICcodW5rbm93biknfWApO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXNvbHZlU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlBY3Rpb24oYWN0aW9uLCBzdGF0ZS53b3JraW5nRGlyZWN0b3JpZXMsIGNhcGFiaWxpdHkuaW1tdXRhYmxlUHJpbWFyeSA9PT0gdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF9kaXNwYXRjaEFjdGlvbk5vdyhjaGFubmVsOiBzdHJpbmcsIHNlc3Npb25DaGFubmVsOiBzdHJpbmcsIGFjdGlvbjogU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24gfCBUZXJtaW5hbEFjdGlvbiB8IENsaWVudENoYW5nZXNldEFjdGlvbiB8IENsaWVudEFubm90YXRpb25zQWN0aW9uIHwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uLCBjbGllbnRJZDogc3RyaW5nLCBjbGllbnRTZXE6IG51bWJlciwgY2xpZW50Q29udGV4dDogSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQpOiB2b2lkIHtcblx0XHRjb25zdCBvcmlnaW4gPSB7IGNsaWVudElkLCBjbGllbnRTZXEgfTtcblx0XHRpZiAoYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkICYmIHRoaXMuX2lzVHVybklkVXNlZEJ5QW5vdGhlckNoYXQoc2Vzc2lvbkNoYW5uZWwsIGNoYW5uZWwsIGFjdGlvbi50dXJuSWQpKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIucmVqZWN0Q2xpZW50QWN0aW9uKGNoYW5uZWwsIGFjdGlvbiwgb3JpZ2luLCAnVHVybiBpZCBpcyBhbHJlYWR5IHVzZWQgYnkgYW5vdGhlciBjaGF0IGluIHRoaXMgc2Vzc2lvbi4nKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5U2V0IHx8IGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVtb3ZlZCkge1xuXHRcdFx0aWYgKGNsaWVudENvbnRleHQuY2xpZW50VHlwZSAhPT0gQWdlbnRIb3N0Q2xpZW50VHlwZS5FZGl0b3JXaW5kb3cpIHtcblx0XHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLnJlamVjdENsaWVudEFjdGlvbihjaGFubmVsLCBhY3Rpb24sIG9yaWdpbiwgJ1Nlc3Npb24gd29ya2luZy1kaXJlY3RvcnkgYWN0aW9ucyByZXF1aXJlIGFuIEVkaXRvciBXaW5kb3cgY2xpZW50LicpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoY2hhbm5lbCAhPT0gc2Vzc2lvbkNoYW5uZWwpIHtcblx0XHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLnJlamVjdENsaWVudEFjdGlvbihjaGFubmVsLCBhY3Rpb24sIG9yaWdpbiwgJ1Nlc3Npb24gd29ya2luZy1kaXJlY3RvcnkgYWN0aW9ucyByZXF1aXJlIGEgc2Vzc2lvbiBjaGFubmVsLicpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhY3Rpb24gPSB0aGlzLl9wcmVwYXJlV29ya2luZ0RpcmVjdG9yeUFjdGlvbihzZXNzaW9uQ2hhbm5lbCwgYWN0aW9uKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5yZWplY3RDbGllbnRBY3Rpb24oY2hhbm5lbCwgYWN0aW9uLCBvcmlnaW4sIHRvRXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoQ2xpZW50QWN0aW9uKGNoYW5uZWwsIGFjdGlvbiwgb3JpZ2luLCBjbGllbnRDb250ZXh0KTtcblx0XHRpZiAoYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQpIHtcblx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnBlcnNpc3RSb290Q29uZmlnKCk7XG5cdFx0XHRjb25zdCBlZGl0VGVsZW1ldHJ5RW5hYmxlZCA9IGFjdGlvbi5jb25maWdbQWdlbnRIb3N0RWRpdFRlbGVtZXRyeUVuYWJsZWRDb25maWdLZXldO1xuXHRcdFx0aWYgKHR5cGVvZiBlZGl0VGVsZW1ldHJ5RW5hYmxlZCA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRcdHRoaXMuX2VkaXRBdHRyaWJ1dGlvblNlcnZpY2U/LnNldEVuYWJsZWQoZWRpdFRlbGVtZXRyeUVuYWJsZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9zaWRlRWZmZWN0cy5oYW5kbGVBY3Rpb24oY2hhbm5lbCwgYWN0aW9uLCBjbGllbnRJZCwgY2xpZW50Q29udGV4dCk7XG5cdH1cblx0cHJpdmF0ZSBfZ2V0VW5yZXNvbHZlZFBlZXJDaGF0cyhzZXNzaW9uQ2hhbm5lbDogc3RyaW5nKTogcmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25DaGFubmVsKT8uY2hhdHMuZmlsdGVyKGNoYXQgPT4gIWlzRGVmYXVsdENoYXRVcmkoY2hhdC5yZXNvdXJjZSkgJiYgIXRoaXMuX3N0YXRlTWFuYWdlci5nZXRDaGF0U3RhdGUoY2hhdC5yZXNvdXJjZSkpLm1hcChjaGF0ID0+IGNoYXQucmVzb3VyY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVBlZXJDaGF0c0ZvclR1cm5WYWxpZGF0aW9uKHNlc3Npb25DaGFubmVsOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0Y29uc3QgdW5yZXNvbHZlZENoYXRzID0gdGhpcy5fZ2V0VW5yZXNvbHZlZFBlZXJDaGF0cyhzZXNzaW9uQ2hhbm5lbCk7XG5cdFx0XHRpZiAoIXVucmVzb2x2ZWRDaGF0cykgeyB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCB2YWxpZGF0ZSB0dXJuIGlkIGZvciB1bmtub3duIHNlc3Npb24nKTsgfVxuXHRcdFx0aWYgKHVucmVzb2x2ZWRDaGF0cy5sZW5ndGggPT09IDApIHsgcmV0dXJuOyB9XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbCh1bnJlc29sdmVkQ2hhdHMubWFwKGFzeW5jIGNoYXQgPT4ge1xuXHRcdFx0XHRpZiAoIWF3YWl0IHRoaXMuX3N0YXRlTWFuYWdlci5yZXNvbHZlQ2hhdFN0YXRlKGNoYXQpKSB7IHRocm93IG5ldyBFcnJvcignQ2Fubm90IHJlc29sdmUgcGVlciBjaGF0IGZvciB0dXJuIGlkIHZhbGlkYXRpb24nKTsgfVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXHRwcml2YXRlIF9pc1R1cm5JZFVzZWRCeUFub3RoZXJDaGF0KHNlc3Npb25DaGFubmVsOiBzdHJpbmcsIGNoYXRDaGFubmVsOiBzdHJpbmcsIHR1cm5JZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uQ2hhbm5lbCk7XG5cdFx0aWYgKCFzZXNzaW9uU3RhdGUpIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0aWYgKHNlc3Npb25TdGF0ZS5kZWZhdWx0Q2hhdCAhPT0gY2hhdENoYW5uZWwgJiYgKHNlc3Npb25TdGF0ZS5hY3RpdmVUdXJuPy5pZCA9PT0gdHVybklkIHx8IChzZXNzaW9uU3RhdGUudHVybnMgPz8gW10pLnNvbWUodHVybiA9PiB0dXJuLmlkID09PSB0dXJuSWQpKSkgeyByZXR1cm4gdHJ1ZTsgfVxuXHRcdGZvciAoY29uc3QgY2hhdCBvZiBzZXNzaW9uU3RhdGUuY2hhdHMgPz8gW10pIHtcblx0XHRcdGlmIChjaGF0LnJlc291cmNlID09PSBjaGF0Q2hhbm5lbCB8fCBpc0RlZmF1bHRDaGF0VXJpKGNoYXQucmVzb3VyY2UpKSB7IGNvbnRpbnVlOyB9XG5cdFx0XHRjb25zdCBjaGF0U3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKGNoYXQucmVzb3VyY2UpO1xuXHRcdFx0aWYgKGNoYXRTdGF0ZT8uYWN0aXZlVHVybj8uaWQgPT09IHR1cm5JZCB8fCBjaGF0U3RhdGU/LnR1cm5zLnNvbWUodHVybiA9PiB0dXJuLmlkID09PSB0dXJuSWQpKSB7IHJldHVybiB0cnVlOyB9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX25lZWRzQXN5bmNSZXdyaXRlKHNlc3Npb25VUkk6IHN0cmluZywgYWN0aW9uOiBTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbiB8IFRlcm1pbmFsQWN0aW9uIHwgQ2xpZW50Q2hhbmdlc2V0QWN0aW9uIHwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24gfCBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24pOiBhY3Rpb24gaXMgQ2hhdFR1cm5TdGFydGVkQWN0aW9uIHwgQ2hhdFBlbmRpbmdNZXNzYWdlU2V0QWN0aW9uIHtcblx0XHRpZiAoYWN0aW9uLnR5cGUgIT09IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkICYmIGFjdGlvbi50eXBlICE9PSBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVNldCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBhdHRhY2htZW50c1Jvb3RTdHIgPSB0aGlzLl9hdHRhY2htZW50c1Jvb3Qoc2Vzc2lvblVSSSkudG9TdHJpbmcoKTtcblx0XHRyZXR1cm4gISFhY3Rpb24ubWVzc2FnZS5hdHRhY2htZW50cz8uc29tZShhID0+IHRoaXMuX2lzUmV3cml0YWJsZUF0dGFjaG1lbnQoYSwgYXR0YWNobWVudHNSb290U3RyKSk7XG5cdH1cblx0cHJpdmF0ZSBfaXNSZXdyaXRhYmxlQXR0YWNobWVudChhdHRhY2htZW50OiBNZXNzYWdlQXR0YWNobWVudCwgYXR0YWNobWVudHNSb290U3RyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRpZiAoYXR0YWNobWVudC50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuRW1iZWRkZWRSZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmIChhdHRhY2htZW50LnR5cGUgPT09IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSkge1xuXHRcdFx0Ly8gRG9uJ3QgdHJ5IHRvIGZldGNoIGRpcmVjdG9yaWVzIG9yIGFscmVhZHktcmV3cml0dGVuIGF0dGFjaG1lbnRzXG5cdFx0XHQvLyAod2hvc2UgVVJJcyBhbHJlYWR5IHBvaW50IHVuZGVyIG91ciBzZXNzaW9uIGF0dGFjaG1lbnRzIGZvbGRlcikuXG5cdFx0XHRpZiAoYXR0YWNobWVudC5kaXNwbGF5S2luZCA9PT0gJ2RpcmVjdG9yeScpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGF0dGFjaG1lbnQudXJpLnN0YXJ0c1dpdGgoYXR0YWNobWVudHNSb290U3RyKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXR0YWNobWVudHNSb290KHNlc3Npb25VUkk6IHN0cmluZyk6IFVSSSB7XG5cdFx0cmV0dXJuIGpvaW5QYXRoKHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS5nZXRTZXNzaW9uRGF0YURpcihVUkkucGFyc2Uoc2Vzc2lvblVSSSkpLCBTRVNTSU9OX0FUVEFDSE1FTlRTX0RJUk5BTUUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNuYXBzaG90IGlubGluZSAvIGNsaWVudC1yZXNpZGVudCBhdHRhY2htZW50IHBheWxvYWRzIG9udG8gZGlza1xuXHQgKiB1bmRlciB0aGUgc2Vzc2lvbidzIGRhdGEgZGlyZWN0b3J5IGFuZCByZXdyaXRlIHRoZSBhY3Rpb24gdG9cblx0ICogcmVmZXJlbmNlIHRoZW0gdmlhIGxvY2FsIGBmaWxlOmAgVVJJcy4gS2VlcHMgcG90ZW50aWFsbHkgbGFyZ2Vcblx0ICogYmxvYnMgKGUuZy4gcGFzdGVkIHRleHQgb3IgaW1hZ2VzKSBvdXQgb2YgdGhlIGluLW1lbW9yeSBzdGF0ZSB0cmVlIHdoaWxlXG5cdCAqIGxldHRpbmcgdGhlIGFnZW50IGNvbnN1bWUgdGhlbSB2aWEgdGhlIHN0YW5kYXJkIHtAbGluayBJRmlsZVNlcnZpY2V9XG5cdCAqIHN1cmZhY2UgXHUyMDE0IG5vIHNwZWNpYWwgVVJJIHNjaGVtZSBvciBibG9iIHJvdW5kLXRyaXBwaW5nIG5lZWRlZC5cblx0ICpcblx0ICogRmFpbHVyZXMgYXJlIGlzb2xhdGVkIHBlci1hdHRhY2htZW50OiBpZiBhIHJld3JpdGUgY2Fubm90IGJlXG5cdCAqIHBlcmZvcm1lZCAobm8gY2xpZW50IGNvbm5lY3Rpb24gcmVnaXN0ZXJlZCwgYHJlc291cmNlUmVhZGAgcmVqZWN0cyxcblx0ICogZXRjLikgdGhlIG9yaWdpbmFsIGF0dGFjaG1lbnQgaXMgcHJlc2VydmVkIHNvIHRoZSBhZ2VudCBzdGlsbCBoYXMgYVxuXHQgKiBjaGFuY2UgdG8gbWFrZSB1c2Ugb2YgaXQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXdyaXRlVXNlck1lc3NhZ2VBdHRhY2htZW50czxUIGV4dGVuZHMgQ2hhdFR1cm5TdGFydGVkQWN0aW9uIHwgQ2hhdFBlbmRpbmdNZXNzYWdlU2V0QWN0aW9uPihjaGFubmVsOiBzdHJpbmcsIGFjdGlvbjogVCwgY2xpZW50SWQ6IHN0cmluZyk6IFByb21pc2U8VD4ge1xuXHRcdGNvbnN0IGF0dGFjaG1lbnRzID0gYWN0aW9uLm1lc3NhZ2UuYXR0YWNobWVudHM7XG5cdFx0aWYgKCFhdHRhY2htZW50cz8ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gYWN0aW9uO1xuXHRcdH1cblx0XHRjb25zdCBhdHRhY2htZW50c1Jvb3QgPSB0aGlzLl9hdHRhY2htZW50c1Jvb3QoY2hhbm5lbCk7XG5cdFx0Y29uc3QgYXR0YWNobWVudHNSb290U3RyID0gYXR0YWNobWVudHNSb290LnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgcmV3cml0dGVuID0gYXdhaXQgUHJvbWlzZS5hbGwoYXR0YWNobWVudHMubWFwKGEgPT4gdGhpcy5fcmV3cml0ZVNpbmdsZUF0dGFjaG1lbnQoYSwgYXR0YWNobWVudHNSb290LCBhdHRhY2htZW50c1Jvb3RTdHIsIGNsaWVudElkKSkpO1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5hY3Rpb24sXG5cdFx0XHRtZXNzYWdlOiB7IC4uLmFjdGlvbi5tZXNzYWdlLCBhdHRhY2htZW50czogcmV3cml0dGVuIH0sXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jld3JpdGVTaW5nbGVBdHRhY2htZW50KGF0dGFjaG1lbnQ6IE1lc3NhZ2VBdHRhY2htZW50LCBhdHRhY2htZW50c1Jvb3Q6IFVSSSwgYXR0YWNobWVudHNSb290U3RyOiBzdHJpbmcsIGNsaWVudElkOiBzdHJpbmcpOiBQcm9taXNlPE1lc3NhZ2VBdHRhY2htZW50PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGlmIChhdHRhY2htZW50LnR5cGUgPT09IE1lc3NhZ2VBdHRhY2htZW50S2luZC5FbWJlZGRlZFJlc291cmNlKSB7XG5cdFx0XHRcdGNvbnN0IGJ5dGVzID0gZGVjb2RlQmFzZTY0KGF0dGFjaG1lbnQuZGF0YSkuYnVmZmVyO1xuXHRcdFx0XHRjb25zdCBiYXNlbmFtZSA9IHRoaXMuX2F0dGFjaG1lbnRCYXNlbmFtZShhdHRhY2htZW50LmxhYmVsLCBhdHRhY2htZW50LmNvbnRlbnRUeXBlKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3dyaXRlQW5kUmV3cml0ZShhdHRhY2htZW50LCBieXRlcywgYmFzZW5hbWUsIGF0dGFjaG1lbnRzUm9vdCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYXR0YWNobWVudC50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UgJiYgdGhpcy5faXNSZXdyaXRhYmxlQXR0YWNobWVudChhdHRhY2htZW50LCBhdHRhY2htZW50c1Jvb3RTdHIpKSB7XG5cdFx0XHRcdGNvbnN0IG9yaWdpbmFsVXJpID0gVVJJLnBhcnNlKGF0dGFjaG1lbnQudXJpKTtcblx0XHRcdFx0Ly8gSWYgdGhlIGF0dGFjaG1lbnQgcmVmZXJlbmNlcyBhIGZpbGUgdGhhdCBhbHJlYWR5IGV4aXN0cyBvbiB0aGUgYWdlbnRcblx0XHRcdFx0Ly8gaG9zdCBzaWRlLCBsZWF2ZSBpdCB1bnRvdWNoZWQgcmF0aGVyIHRoYW4gc25hcHNob3R0aW5nIGEgY2xpZW50IGNvcHkgKCMzMTkzMTQpLlxuXHRcdFx0XHRpZiAob3JpZ2luYWxVcmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgJiYgYXdhaXQgdGhpcy5fZmlsZUV4aXN0c1NhZmUob3JpZ2luYWxVcmkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGF0dGFjaG1lbnQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBieXRlcyA9IGF3YWl0IHRoaXMuX3JlYWRDbGllbnRSZXNvdXJjZShvcmlnaW5hbFVyaSwgY2xpZW50SWQpO1xuXHRcdFx0XHRjb25zdCBiYXNlbmFtZSA9IHRoaXMuX2F0dGFjaG1lbnRCYXNlbmFtZShhdHRhY2htZW50LmxhYmVsLCBnZXRNZWRpYU1pbWUob3JpZ2luYWxVcmkucGF0aCkpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fd3JpdGVBbmRSZXdyaXRlKGF0dGFjaG1lbnQsIGJ5dGVzLCBiYXNlbmFtZSwgYXR0YWNobWVudHNSb290KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV0gRmFpbGVkIHRvIHJld3JpdGUgYXR0YWNobWVudCAnJHthdHRhY2htZW50LmxhYmVsfSc6ICR7dG9FcnJvck1lc3NhZ2UoZXJyKX1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIGF0dGFjaG1lbnQ7XG5cdH1cblxuXHQvKipcblx0ICogTGlrZSB7QGxpbmsgSUZpbGVTZXJ2aWNlLmV4aXN0c30gYnV0IG5ldmVyIHRocm93cyAoZS5nLiB3aGVuIG5vIHByb3ZpZGVyXG5cdCAqIGlzIHJlZ2lzdGVyZWQgZm9yIHRoZSBVUkkgc2NoZW1lKSwgcmV0dXJuaW5nIGBmYWxzZWAgaW4gdGhhdCBjYXNlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZmlsZUV4aXN0c1NhZmUodXJpOiBVUkkpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyh1cmkpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkcyBgb3JpZ2luYWxVcmlgIHRocm91Z2ggdGhlIGB2c2NvZGUtYWdlbnQtY2xpZW50YCBmaWxlc3lzdGVtXG5cdCAqIHByb3ZpZGVyIHNvIGl0IGlzIGZldGNoZWQgZnJvbSB0aGUgb3JpZ2luYXRpbmcgY2xpZW50LiBGYWxscyBiYWNrIHRvXG5cdCAqIGEgZGlyZWN0IHJlYWQgYWdhaW5zdCBgb3JpZ2luYWxVcmlgIHdoZW4gbm8gY2xpZW50IGZpbGVzeXN0ZW1cblx0ICogYXV0aG9yaXR5IGlzIHJlZ2lzdGVyZWQgZm9yIGBjbGllbnRJZGAgKGUuZy4gdW5pdCB0ZXN0cywgaW4tcHJvY2Vzc1xuXHQgKiBhZ2VudCBob3N0IHdpdGggYSBsb2NhbCBVUkkpLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVhZENsaWVudFJlc291cmNlKG9yaWdpbmFsVXJpOiBVUkksIGNsaWVudElkOiBzdHJpbmcpOiBQcm9taXNlPFVpbnQ4QXJyYXk+IHtcblx0XHRjb25zdCBwcm94aWVkVXJpID0gY2xpZW50SWQgPyB0b0FnZW50Q2xpZW50VXJpKG9yaWdpbmFsVXJpLCBjbGllbnRJZCkgOiBvcmlnaW5hbFVyaTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudHMgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShwcm94aWVkVXJpKTtcblx0XHRcdHJldHVybiBjb250ZW50cy52YWx1ZS5idWZmZXI7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAocHJveGllZFVyaSAhPT0gb3JpZ2luYWxVcmkpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKG9yaWdpbmFsVXJpKTtcblx0XHRcdFx0XHRyZXR1cm4gY29udGVudHMudmFsdWUuYnVmZmVyO1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHQvLyBpZ25vcmVcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3dyaXRlQW5kUmV3cml0ZShcblx0XHRvcmlnaW5hbDogTWVzc2FnZUF0dGFjaG1lbnQsXG5cdFx0Ynl0ZXM6IFVpbnQ4QXJyYXksXG5cdFx0YmFzZW5hbWU6IHN0cmluZyxcblx0XHRhdHRhY2htZW50c1Jvb3Q6IFVSSSxcblx0KTogUHJvbWlzZTxNZXNzYWdlUmVzb3VyY2VBdHRhY2htZW50PiB7XG5cdFx0Y29uc3QgaWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCB0YXJnZXQgPSBqb2luUGF0aChhdHRhY2htZW50c1Jvb3QsIGlkLCBiYXNlbmFtZSk7XG5cdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRhcmdldCwgVlNCdWZmZXIud3JhcChieXRlcykpO1xuXHRcdGNvbnN0IHJld3JpdHRlbjogTWVzc2FnZVJlc291cmNlQXR0YWNobWVudCA9IHtcblx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSxcblx0XHRcdHVyaTogdGFyZ2V0LnRvU3RyaW5nKCksXG5cdFx0XHRsYWJlbDogb3JpZ2luYWwubGFiZWwsXG5cdFx0XHRkaXNwbGF5S2luZDogb3JpZ2luYWwuZGlzcGxheUtpbmQsXG5cdFx0XHRyYW5nZTogb3JpZ2luYWwucmFuZ2UsXG5cdFx0XHRfbWV0YTogb3JpZ2luYWwuX21ldGEsXG5cdFx0fTtcblx0XHRpZiAob3JpZ2luYWwudHlwZSA9PT0gTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlJlc291cmNlICYmIG9yaWdpbmFsLnNlbGVjdGlvbikge1xuXHRcdFx0cmV3cml0dGVuLnNlbGVjdGlvbiA9IG9yaWdpbmFsLnNlbGVjdGlvbjtcblx0XHR9XG5cdFx0cmV0dXJuIHJld3JpdHRlbjtcblx0fVxuXG5cdC8qKlxuXHQgKiBQaWNrIGEgc2Vuc2libGUgb24tZGlzayBiYXNlbmFtZSBmb3IgdGhlIHNuYXBzaG90dGVkIGF0dGFjaG1lbnQsXG5cdCAqIHByZXNlcnZpbmcgYSB1c2FibGUgZXh0ZW5zaW9uIHdoZXJlIHBvc3NpYmxlIHNvIHRoZSBTREsgYW5kIG90aGVyXG5cdCAqIGRvd25zdHJlYW0gY29uc3VtZXJzIGNhbiBkZXRlY3QgdGhlIHJpZ2h0IHR5cGUgZnJvbSB0aGUgcGF0aCBhbG9uZS5cblx0ICovXG5cdHByaXZhdGUgX2F0dGFjaG1lbnRCYXNlbmFtZShsYWJlbDogc3RyaW5nLCBjb250ZW50VHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRjb25zdCBzYWZlTGFiZWwgPSAobGFiZWwgfHwgJ2F0dGFjaG1lbnQnKS5yZXBsYWNlKC9bXFxcXC86Kj9cIjw+fFxcdTAwMDAtXFx1MDAxZl0vZywgJ18nKTtcblx0XHRpZiAocmVzb3VyY2VzRXh0bmFtZShVUkkuZmlsZShzYWZlTGFiZWwpKSkge1xuXHRcdFx0cmV0dXJuIHNhZmVMYWJlbDtcblx0XHR9XG5cdFx0Y29uc3QgZXh0ID0gY29udGVudFR5cGUgPyBnZXRFeHRlbnNpb25Gb3JNaW1lVHlwZShjb250ZW50VHlwZSkgOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIGV4dCA/IGAke3NhZmVMYWJlbH0ke2V4dH1gIDogc2FmZUxhYmVsO1xuXHR9XG5cblx0YXN5bmMgcmVzb3VyY2VMaXN0KHVyaTogVVJJKTogUHJvbWlzZTxSZXNvdXJjZUxpc3RSZXN1bHQ+IHtcblx0XHRsZXQgc3RhdDtcblx0XHR0cnkge1xuXHRcdFx0c3RhdCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlc29sdmUodXJpKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuTm90Rm91bmQsIGBEaXJlY3Rvcnkgbm90IGZvdW5kOiAke3VyaS50b1N0cmluZygpfWApO1xuXHRcdH1cblxuXHRcdGlmICghc3RhdC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoQWhwRXJyb3JDb2Rlcy5Ob3RGb3VuZCwgYE5vdCBhIGRpcmVjdG9yeTogJHt1cmkudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBlbnRyaWVzOiBEaXJlY3RvcnlFbnRyeVtdID0gKHN0YXQuY2hpbGRyZW4gPz8gW10pLm1hcChjaGlsZCA9PiAoe1xuXHRcdFx0bmFtZTogY2hpbGQubmFtZSxcblx0XHRcdHR5cGU6IGNoaWxkLmlzRGlyZWN0b3J5ID8gJ2RpcmVjdG9yeScgOiAnZmlsZScsXG5cdFx0fSkpO1xuXHRcdHJldHVybiB7IGVudHJpZXMgfTtcblx0fVxuXG5cdGFzeW5jIHJlc3RvcmVTZXNzaW9uKHNlc3Npb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlc3Npb25TdHIgPSBzZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0dGhpcy5fY2FuY2VsUGVuZGluZ1Nlc3Npb25HYyhzZXNzaW9uKTtcblx0XHR0aGlzLl9jYW5jZWxQZW5kaW5nU2Vzc2lvblJlbGVhc2Uoc2Vzc2lvbik7XG5cdFx0YXdhaXQgdGhpcy5fcmVsZWFzZVNlc3Npb25JbkZsaWdodC5nZXQoc2Vzc2lvblN0cik7XG5cblx0XHRjb25zdCBpbkZsaWdodCA9IHRoaXMuX3Jlc3RvcmVTZXNzaW9uSW5GbGlnaHQuZ2V0KHNlc3Npb25TdHIpO1xuXHRcdGlmIChpbkZsaWdodCkge1xuXHRcdFx0cmV0dXJuIGluRmxpZ2h0O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25TdHIpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdG9yZSA9IHRoaXMuX2RvUmVzdG9yZVNlc3Npb24oc2Vzc2lvbiwgc2Vzc2lvblN0cik7XG5cdFx0dGhpcy5fcmVzdG9yZVNlc3Npb25JbkZsaWdodC5zZXQoc2Vzc2lvblN0ciwgcmVzdG9yZSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHJlc3RvcmU7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlmICh0aGlzLl9yZXN0b3JlU2Vzc2lvbkluRmxpZ2h0LmdldChzZXNzaW9uU3RyKSA9PT0gcmVzdG9yZSkge1xuXHRcdFx0XHR0aGlzLl9yZXN0b3JlU2Vzc2lvbkluRmxpZ2h0LmRlbGV0ZShzZXNzaW9uU3RyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKiogRW1pdHMgb25lIHtAbGluayBBZ2VudEhvc3RMZWdhY3lNaWdyYXRpb25FdmVudH0gZm9yIGEgbGVnYWN5LXNlc3Npb24gYWRvcHRpb24gYXR0ZW1wdC4gKi9cblx0cHJpdmF0ZSBfcmVwb3J0TGVnYWN5TWlncmF0aW9uKFxuXHRcdHByb3ZpZGVyOiBzdHJpbmcsXG5cdFx0b3V0Y29tZTogQWdlbnRIb3N0TGVnYWN5TWlncmF0aW9uRXZlbnRbJ291dGNvbWUnXSxcblx0XHRzdGFydFRpbWU6IG51bWJlcixcblx0XHRleHRyYTogeyB0dXJuQ291bnQ/OiBudW1iZXI7IGhhc1Byb2plY3Q/OiBib29sZWFuOyBoYXNXb3JrdHJlZT86IGJvb2xlYW47IHdvcmtpbmdEaXJlY3RvcnlDb3VudD86IG51bWJlcjsgZXJyb3JNZXNzYWdlPzogc3RyaW5nIH0sXG5cdCk6IHZvaWQge1xuXHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxBZ2VudEhvc3RMZWdhY3lNaWdyYXRpb25FdmVudCwgQWdlbnRIb3N0TGVnYWN5TWlncmF0aW9uQ2xhc3NpZmljYXRpb24+KCdhZ2VudEhvc3QubGVnYWN5Q29waWxvdENsaU1pZ3JhdGlvbicsIHtcblx0XHRcdHByb3ZpZGVyLFxuXHRcdFx0b3V0Y29tZSxcblx0XHRcdHN1Y2Nlc3M6IG91dGNvbWUgPT09ICdtaWdyYXRlZCcgJiYgKGV4dHJhLnR1cm5Db3VudCA/PyAwKSA+IDAsXG5cdFx0XHR0dXJuQ291bnQ6IGV4dHJhLnR1cm5Db3VudCA/PyAwLFxuXHRcdFx0ZHVyYXRpb25NczogRGF0ZS5ub3coKSAtIHN0YXJ0VGltZSxcblx0XHRcdGhhc1Byb2plY3Q6IGV4dHJhLmhhc1Byb2plY3QgPz8gZmFsc2UsXG5cdFx0XHRoYXNXb3JrdHJlZTogZXh0cmEuaGFzV29ya3RyZWUgPz8gZmFsc2UsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5Q291bnQ6IGV4dHJhLndvcmtpbmdEaXJlY3RvcnlDb3VudCA/PyAwLFxuXHRcdFx0ZXJyb3JNZXNzYWdlOiBleHRyYS5lcnJvck1lc3NhZ2UsXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kb1Jlc3RvcmVTZXNzaW9uKHNlc3Npb246IFVSSSwgc2Vzc2lvblN0cjogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblN0cikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYWdlbnQgPSB0aGlzLl9maW5kUHJvdmlkZXJGb3JTZXNzaW9uKHNlc3Npb24pO1xuXHRcdGlmICghYWdlbnQpIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFIUF9TRVNTSU9OX05PVF9GT1VORCwgYE5vIGFnZW50IGZvciBzZXNzaW9uOiAke3Nlc3Npb25TdHJ9YCk7XG5cdFx0fVxuXHRcdC8vIEEgc2Vzc2lvbiBleHBsaWNpdGx5IGRlbGV0ZWQgKHRvbWJzdG9uZWQpIG11c3Qgbm90IGJlIHJldml2ZWQgYnkgYVxuXHRcdC8vIHN0YWxlIHJlc3RvcmUgcmVxdWVzdCBcdTIwMTQgZS5nLiBhIGNsaWVudCByZS1zdWJzY3JpYmluZyB0byBhIFVSSSBpdFxuXHRcdC8vIHN0aWxsIHJlbWVtYmVycyBhZnRlciB0aGUgc2Vzc2lvbiB3YXMgZGVsZXRlZC4gRmFpbGluZyBmYXN0IGhlcmVcblx0XHQvLyAoYmVmb3JlIGFueSBwcm92aWRlci1zaWRlIHJlc3RvcmF0aW9uIHdvcmspIGFsc28gYXZvaWRzIHRoZVxuXHRcdC8vIHJlZ2lzdHJhdGlvbiBiZWxvdyBzaWxlbnRseSBkZWNsaW5pbmcgbGF0ZXIgYW5kIGxlYXZpbmcgc3RhdGVcblx0XHQvLyBwYXJ0aWFsbHkgaHlkcmF0ZWQuXG5cdFx0aWYgKGF3YWl0IHRoaXMuX3Nlc3Npb25SZWdpc3RyeS5pc1RvbWJzdG9uZWQoc2Vzc2lvbikpIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFIUF9TRVNTSU9OX05PVF9GT1VORCwgYFNlc3Npb24gd2FzIGV4cGxpY2l0bHkgZGVsZXRlZDogJHtzZXNzaW9uU3RyfWApO1xuXHRcdH1cblx0XHRjb25zdCByZWdpc3RlcmVkU2Vzc2lvbiA9IChhd2FpdCB0aGlzLl9saXN0UmVnaXN0ZXJlZFNlc3Npb25zKCkpLmZpbmQoZW50cnkgPT4gZW50cnkuc2Vzc2lvbi50b1N0cmluZygpID09PSBzZXNzaW9uU3RyKTtcblx0XHRjb25zdCBleHRlcm5hbCA9IHJlZ2lzdGVyZWRTZXNzaW9uPy5leHRlcm5hbCA/PyBmYWxzZTtcblxuXHRcdC8vIEFkb3B0LW9uLW9wZW4gZm9yIGEgc3VyZmFjZWQgdW4tYWRvcHRlZCBsZWdhY3kgQ29waWxvdCBDTEkgc2Vzc2lvbiwgc3RyaWN0bHkgZ2F0ZWQgb24gdGhlIGxpdmUgbWlncmF0ZSBzZXR0aW5nIChhIG5vLW9wIGZvciBuYXRpdmUgLyBhbHJlYWR5LWFkb3B0ZWQgc2Vzc2lvbnMpLlxuXHRcdGNvbnN0IG1pZ3JhdGVMZWdhY3lFbmFibGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0Um9vdFZhbHVlKHBsYXRmb3JtUm9vdFNjaGVtYSwgQWdlbnRIb3N0TWlncmF0ZUxlZ2FjeUNvcGlsb3RDbGlFbmFibGVkQ29uZmlnS2V5KSA9PT0gdHJ1ZTtcblx0XHRjb25zdCBtaWdyYXRpb25TdGFydFRpbWUgPSBEYXRlLm5vdygpO1xuXHRcdGxldCBhZG9wdGlvbjogSUFnZW50Q2hhdEFkb3B0aW9uUmVzdWx0ID0geyBhZG9wdGVkOiBmYWxzZSwgZWxpZ2libGU6IGZhbHNlIH07XG5cdFx0aWYgKCFleHRlcm5hbCAmJiBtaWdyYXRlTGVnYWN5RW5hYmxlZCAmJiBhZ2VudC5lbnN1cmVDaGF0QWRvcHRlZCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSk7XG5cdFx0XHRcdGFkb3B0aW9uID0gYXdhaXQgYWdlbnQuZW5zdXJlQ2hhdEFkb3B0ZWQoZGVmYXVsdENoYXQsIHRoaXMuX2NoYXRDb250ZXh0KHNlc3Npb24sIGRlZmF1bHRDaGF0KSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0Ly8gQWRvcHRpb24gaXRzZWxmIHRocmV3IFx1MjAxNCBhIGdlbnVpbmUgbWlncmF0aW9uIGZhaWx1cmUgd29ydGggc3VyZmFjaW5nLlxuXHRcdFx0XHR0aGlzLl9yZXBvcnRMZWdhY3lNaWdyYXRpb24oYWdlbnQuaWQsICdmYWlsZWQnLCBtaWdyYXRpb25TdGFydFRpbWUsIHsgZXJyb3JNZXNzYWdlOiB0b0Vycm9yTWVzc2FnZShlcnIpIH0pO1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGFkb3B0ZWQgPSBhZG9wdGlvbi5hZG9wdGVkO1xuXG5cdFx0Ly8gRnJvbSBoZXJlIHRoZSB3aG9sZSByZXN0b3JlIGlzIHdyYXBwZWQgc28gYG1pZ3JhdGVkYCBpcyByZXBvcnRlZCBvbmx5XG5cdFx0Ly8gYWZ0ZXIgZXZlcnkgcmVxdWlyZWQgc3RlcCBzdWNjZWVkcywgYW5kIGFueSBmYWlsdXJlIGFmdGVyIGEgc3VjY2Vzc2Z1bFxuXHRcdC8vIGFkb3B0aW9uIGlzIHN1cmZhY2VkIGFzIGEgbWlncmF0aW9uIGZhaWx1cmUuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGZhY3RzID0gYXdhaXQgdGhpcy5fcmVzdG9yZVNlc3Npb25TdGF0ZShhZ2VudCwgc2Vzc2lvbiwgc2Vzc2lvblN0ciwgYWRvcHRlZCwgZXh0ZXJuYWwsIHJlZ2lzdGVyZWRTZXNzaW9uPy5zb3VyY2UgPz8gJ3Jlc3RvcmUnKTtcblx0XHRcdGlmIChhZG9wdGVkKSB7XG5cdFx0XHRcdHRoaXMuX3JlcG9ydExlZ2FjeU1pZ3JhdGlvbihhZ2VudC5pZCwgJ21pZ3JhdGVkJywgbWlncmF0aW9uU3RhcnRUaW1lLCBmYWN0cyk7XG5cdFx0XHR9IGVsc2UgaWYgKGFkb3B0aW9uLmVsaWdpYmxlKSB7XG5cdFx0XHRcdC8vIE1pZ3JhdGUgc2V0dGluZyBvbiBhbmQgYSBnZW51aW5lIGxlZ2FjeSBjYW5kaWRhdGUsIGJ1dCBub3QgYWRvcHRlZFxuXHRcdFx0XHQvLyB0aGlzIHBhc3MgKGUuZy4gaXRzIG9uLWRpc2sgd29ya2luZyBkaXJlY3RvcnkgY291bGQgbm90IGJlIHJlc29sdmVkKS5cblx0XHRcdFx0dGhpcy5fcmVwb3J0TGVnYWN5TWlncmF0aW9uKGFnZW50LmlkLCAnc2tpcHBlZCcsIG1pZ3JhdGlvblN0YXJ0VGltZSwgeyBoYXNQcm9qZWN0OiBmYWN0cy5oYXNQcm9qZWN0LCB3b3JraW5nRGlyZWN0b3J5Q291bnQ6IGZhY3RzLndvcmtpbmdEaXJlY3RvcnlDb3VudCB9KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmIChhZG9wdGVkKSB7XG5cdFx0XHRcdHRoaXMuX3JlcG9ydExlZ2FjeU1pZ3JhdGlvbihhZ2VudC5pZCwgJ2ZhaWxlZCcsIG1pZ3JhdGlvblN0YXJ0VGltZSwgeyBlcnJvck1lc3NhZ2U6IHRvRXJyb3JNZXNzYWdlKGVycikgfSk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEh5ZHJhdGVzIGEgcmVzdG9yZWQgKG9yIGZyZXNobHktYWRvcHRlZCkgc2Vzc2lvbiBpbnRvIHRoZSBzdGF0ZSBtYW5hZ2VyIGFuZFxuXHQgKiBjb21wbGV0ZXMgYWxsIHJlcXVpcmVkIHJlc3RvcmUgd29yayAodHVybnMsIG1ldGFkYXRhLCBwZWVyIGNoYXRzLCBjb25maWcpLlxuXHQgKiBSZXR1cm5zIHRoZSBmYWN0cyB1c2VkIGZvciBtaWdyYXRpb24gdGVsZW1ldHJ5OyB0aHJvd3MgaWYgYW55IHJlcXVpcmVkIHN0ZXBcblx0ICogZmFpbHMgc28gdGhlIGNhbGxlciBjYW4gcmVwb3J0IHRoZSBvdXRjb21lIGFjY3VyYXRlbHkuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXN0b3JlU2Vzc2lvblN0YXRlKGFnZW50OiBJQWdlbnQsIHNlc3Npb246IFVSSSwgc2Vzc2lvblN0cjogc3RyaW5nLCBhZG9wdGVkOiBib29sZWFuLCBleHRlcm5hbDogYm9vbGVhbiwgcmVnaXN0cmF0aW9uU291cmNlOiBJUmVnaXN0ZXJlZFNlc3Npb25bJ3NvdXJjZSddKTogUHJvbWlzZTx7IHR1cm5Db3VudDogbnVtYmVyOyBoYXNQcm9qZWN0OiBib29sZWFuOyBoYXNXb3JrdHJlZTogYm9vbGVhbjsgd29ya2luZ0RpcmVjdG9yeUNvdW50OiBudW1iZXIgfT4ge1xuXHRcdGxldCBtZXRhID0gYXdhaXQgdGhpcy5fZ2V0U2Vzc2lvbk1ldGFkYXRhRm9yUmVzdG9yZShhZ2VudCwgc2Vzc2lvbiwgZXh0ZXJuYWwpO1xuXHRcdGlmICghbWV0YSkge1xuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoQUhQX1NFU1NJT05fTk9UX0ZPVU5ELCBgU2Vzc2lvbiBub3QgZm91bmQgb24gYmFja2VuZDogJHtzZXNzaW9uU3RyfWApO1xuXHRcdH1cblxuXHRcdC8vIEEgZnJlc2hseS1hZG9wdGVkIGxlZ2FjeSBzZXNzaW9uIHdob3NlIHdvcmtpbmcgZGlyZWN0b3J5IGlzIGFcblx0XHQvLyBwcmUtZXhpc3RpbmcgZ2l0IHdvcmt0cmVlIGtlZXBzIG5vIHdvcmt0cmVlIG1ldGFkYXRhIChhZG9wdGlvbiBzZWVkc1xuXHRcdC8vIGBpc29sYXRpb246IGZvbGRlcmAgaW4gcGxhY2UpLiBCcmlkZ2UgaXQgbm93IHNvIHRoZSBzZXNzaW9uIGdyb3VwcyB1bmRlclxuXHRcdC8vIGl0cyByZXBvc2l0b3J5IGFuZCBkaWZmcyBhZ2FpbnN0IHRoZSByaWdodCBiYXNlLCBtYXRjaGluZyBuYXRpdmVcblx0XHQvLyB3b3JrdHJlZS1pc29sYXRlZCBzZXNzaW9ucy4gTm8tb3AgZm9yIGZvbGRlciAvIHByaW1hcnktY2hlY2tvdXQgY3dkcy5cblx0XHRsZXQgYWRvcHRlZFdvcmt0cmVlID0gZmFsc2U7XG5cdFx0aWYgKGFkb3B0ZWQgJiYgdGhpcy5fd29ya3RyZWUpIHtcblx0XHRcdGNvbnN0IGFkb3B0ZWRXb3JraW5nRGlyZWN0b3J5ID0gbWV0YS53b3JraW5nRGlyZWN0b3JpZXM/LlswXTtcblx0XHRcdGlmIChhZG9wdGVkV29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGlmIChhd2FpdCB0aGlzLl93b3JrdHJlZS5hZG9wdEV4aXN0aW5nV29ya3RyZWVNZXRhZGF0YShzZXNzaW9uLCBhZG9wdGVkV29ya2luZ0RpcmVjdG9yeSkpIHtcblx0XHRcdFx0XHRcdGFkb3B0ZWRXb3JrdHJlZSA9IHRydWU7XG5cdFx0XHRcdFx0XHRjb25zdCB3b3JrdHJlZVByb2plY3QgPSBhd2FpdCB0aGlzLl93b3JrdHJlZS5yZXNvbHZlV29ya3RyZWVQcm9qZWN0KHNlc3Npb24pO1xuXHRcdFx0XHRcdFx0aWYgKHdvcmt0cmVlUHJvamVjdCkge1xuXHRcdFx0XHRcdFx0XHRtZXRhID0geyAuLi5tZXRhLCBwcm9qZWN0OiB3b3JrdHJlZVByb2plY3QgfTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV0gYWRvcHQ6IHdvcmt0cmVlIG1ldGFkYXRhIGJyaWRnZSBmYWlsZWQgZm9yICR7c2Vzc2lvblN0cn1gLCBlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghbWV0YS5wcm9qZWN0ICYmICFyZWFkU2Vzc2lvbldvcmtzcGFjZWxlc3MobWV0YS5fbWV0YSkgJiYgdGhpcy5fd29ya3RyZWUpIHtcblx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBtZXRhLndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdO1xuXHRcdFx0aWYgKHdvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBwcm9qZWN0ID0gYXdhaXQgdGhpcy5fd29ya3RyZWUucmVjb3JkRXh0ZXJuYWxXb3JrdHJlZVByb2plY3Qoc2Vzc2lvbiwgd29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHRcdFx0aWYgKHByb2plY3QpIHtcblx0XHRcdFx0XHRcdGFkb3B0ZWRXb3JrdHJlZSA9IHRydWU7XG5cdFx0XHRcdFx0XHRtZXRhID0geyAuLi5tZXRhLCBwcm9qZWN0IH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIHJlc3RvcmU6IGV4dGVybmFsIHdvcmt0cmVlIHByb2plY3QgZGlzY292ZXJ5IGZhaWxlZCBmb3IgJHtzZXNzaW9uU3RyfWAsIGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBkZWZhdWx0Q2hhdFVyaSA9IFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25TdHIpKTtcblx0XHRjb25zdCBkZWZhdWx0Q2hhdFByb3ZpZGVyRGF0YSA9IGF3YWl0IHRoaXMuX3JlYWREZWZhdWx0Q2hhdFByb3ZpZGVyRGF0YShzZXNzaW9uKTtcblx0XHQvLyBEZWZhdWx0LWNoYXQgcmVzdG9yZSBhbHdheXMgZ29lcyB0aHJvdWdoIHtAbGluayBJQWdlbnQubWF0ZXJpYWxpemVDaGF0fTtcblx0XHQvLyB0aGVyZSBpcyBubyBpZGVudGl0eS1yZXVzZSBmYWxsYmFjay4gQWx3YXlzIG9mZmVyIHRoZSBwZXJzaXN0ZWQgYmxvYixcblx0XHQvLyBpbmNsdWRpbmcgYHVuZGVmaW5lZGAsIHNvIGxlZ2FjeSBzZXNzaW9ucyBjYW4gcmVjb3ZlciB0aGVpciBiYWNraW5nIGZyb21cblx0XHQvLyBwcm92aWRlciBzdG9yYWdlIGFuZCwgaWYgdGhleSBkbywgcGVyc2lzdCBpdCBvbmNlIGZvciBsYXRlciByZXN0b3Jlcy5cblx0XHQvLyBJZiBubyBiYWNraW5nIGV4aXN0cywgcmVzdG9yZSB0aGUgaGlzdG9yeSBidXQgbGVhdmUgdGhlIG1pc3NpbmcgbGl2ZVxuXHRcdC8vIGJhY2tpbmcgZXhwbGljaXQuXG5cdFx0Y29uc3QgY2hhdENvbnRleHQgPSB0aGlzLl9jaGF0Q29udGV4dChzZXNzaW9uLCBkZWZhdWx0Q2hhdFVyaSk7XG5cdFx0Y29uc3QgcmVjb3ZlcmVkRGVmYXVsdENoYXQgPSAhZXh0ZXJuYWwgJiYgZGVmYXVsdENoYXRQcm92aWRlckRhdGEgPT09IHVuZGVmaW5lZFxuXHRcdFx0PyBhd2FpdCBhZ2VudC5yZWNvdmVyTGVnYWN5Q2hhdD8uKGRlZmF1bHRDaGF0VXJpLCBjaGF0Q29udGV4dClcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGlmIChyZWNvdmVyZWREZWZhdWx0Q2hhdD8ucHJvdmlkZXJEYXRhICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3BlcnNpc3REZWZhdWx0Q2hhdEJhY2tpbmcoeyBzZXNzaW9uLCBjaGF0OiByZWNvdmVyZWREZWZhdWx0Q2hhdCB9KTtcblx0XHR9XG5cdFx0Y29uc3QgcHJvdmlkZXJEYXRhID0gZGVmYXVsdENoYXRQcm92aWRlckRhdGEgPz8gcmVjb3ZlcmVkRGVmYXVsdENoYXQ/LnByb3ZpZGVyRGF0YTtcblx0XHRjb25zdCBtYXRlcmlhbGl6ZWREZWZhdWx0Q2hhdCA9IGF3YWl0IGFnZW50Lm1hdGVyaWFsaXplQ2hhdChkZWZhdWx0Q2hhdFVyaSwgY2hhdENvbnRleHQsIHByb3ZpZGVyRGF0YSk7XG5cdFx0aWYgKHByb3ZpZGVyRGF0YSA9PT0gdW5kZWZpbmVkICYmIG1hdGVyaWFsaXplZERlZmF1bHRDaGF0Py5wcm92aWRlckRhdGEgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcGVyc2lzdERlZmF1bHRDaGF0QmFja2luZyh7IHNlc3Npb24sIGNoYXQ6IG1hdGVyaWFsaXplZERlZmF1bHRDaGF0IH0pO1xuXHRcdH1cblx0XHRpZiAocHJvdmlkZXJEYXRhID09PSB1bmRlZmluZWQgJiYgbWF0ZXJpYWxpemVkRGVmYXVsdENoYXQ/LnByb3ZpZGVyRGF0YSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIFJlc3RvcmluZyBkZWZhdWx0IGNoYXQgJHtkZWZhdWx0Q2hhdFVyaS50b1N0cmluZygpfSB3aXRoIG5vIHBlcnNpc3RlZCBvciByZWNvdmVyZWQgcHJvdmlkZXIgYmFja2luZyAoYWdlbnQ9JHthZ2VudC5pZH0pYCk7XG5cdFx0fVxuXHRcdGxldCB0dXJuczogcmVhZG9ubHkgVHVybltdO1xuXHRcdHRyeSB7XG5cdFx0XHR0dXJucyA9IGF3YWl0IHRoaXMuX2dldENoYXRNZXNzYWdlcyhhZ2VudCwgZGVmYXVsdENoYXRVcmksIHNlc3Npb24pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKGVyciBpbnN0YW5jZW9mIFByb3RvY29sRXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKTtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEpTT05fUlBDX0lOVEVSTkFMX0VSUk9SLCBgRmFpbGVkIHRvIHJlc3RvcmUgc2Vzc2lvbiAke3Nlc3Npb25TdHJ9OiAke21lc3NhZ2V9YCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgZm9yIHBlcnNpc3RlZCBtZXRhZGF0YSBpbiB0aGUgc2Vzc2lvbiBkYXRhYmFzZVxuXHRcdGxldCB0aXRsZSA9IG1ldGEuc3VtbWFyeSA/PyAnU2Vzc2lvbic7XG5cdFx0bGV0IGlzUmVhZDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgaXNBcmNoaXZlZDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgcGVyc2lzdGVkQ29uZmlnVmFsdWVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXHRcdGxldCBjaGFuZ2VzOiBDaGFuZ2VzU3VtbWFyeSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZ2l0TWV0YWRhdGE6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNoYW5nZXNldE1ldGFkYXRhOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkO1xuXHRcdGxldCBzZXNzaW9uTWV0YWRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHJlZiA9IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS50cnlPcGVuRGF0YWJhc2U/LihzZXNzaW9uKTtcblx0XHRpZiAocmVmKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBkYiA9IGF3YWl0IHJlZjtcblx0XHRcdFx0aWYgKGRiKSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNvbnN0IG0gPSBhd2FpdCBkYi5vYmplY3QuZ2V0TWV0YWRhdGFPYmplY3Qoe1xuXHRcdFx0XHRcdFx0XHRjdXN0b21UaXRsZTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0W0FIX01FVEFfSVNfUkVBRF9EQl9LRVldOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRbQUhfTUVUQV9JU19BUkNISVZFRF9EQl9LRVldOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRbQUhfTUVUQV9JU19ET05FX0RCX0tFWV06IHRydWUsXG5cdFx0XHRcdFx0XHRcdGNvbmZpZ1ZhbHVlczogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0W0FIX01FVEFfV09SS1NQQUNFTEVTU19EQl9LRVldOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRbU0VTU0lPTl9NRVRBX01VTFRJX1JPT1RfS0VZXTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0Li4uR0lUX0RCX01FVEFEQVRBX0tFWVMsXG5cdFx0XHRcdFx0XHRcdC4uLkNIQU5HRVNFVF9EQl9NRVRBREFUQV9LRVlTLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRpZiAobS5jdXN0b21UaXRsZSkge1xuXHRcdFx0XHRcdFx0XHR0aXRsZSA9IG0uY3VzdG9tVGl0bGU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAobVtBSF9NRVRBX0lTX1JFQURfREJfS0VZXSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdGlzUmVhZCA9IG1bQUhfTUVUQV9JU19SRUFEX0RCX0tFWV0gPT09ICd0cnVlJztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IHBlcnNpc3RlZEFyY2hpdmVkID0gbVtBSF9NRVRBX0lTX0FSQ0hJVkVEX0RCX0tFWV0gPz8gbVtBSF9NRVRBX0lTX0RPTkVfREJfS0VZXTtcblx0XHRcdFx0XHRcdGlmIChwZXJzaXN0ZWRBcmNoaXZlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdGlzQXJjaGl2ZWQgPSBwZXJzaXN0ZWRBcmNoaXZlZCA9PT0gJ3RydWUnO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRjaGFuZ2VzZXRNZXRhZGF0YSA9IG0gYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0XHRcdFx0XHRcdGlmIChjaGFuZ2VzZXRNZXRhZGF0YVtNRVRBX0NIQU5HRVNfU1VNTUFSWV0pIHtcblx0XHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0XHRjaGFuZ2VzID0gSlNPTi5wYXJzZShjaGFuZ2VzZXRNZXRhZGF0YVtNRVRBX0NIQU5HRVNfU1VNTUFSWV0pO1xuXHRcdFx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIEZhaWxlZCB0byBwYXJzZSBjaGFuZ2VzIHN1bW1hcnkgZm9yICR7c2Vzc2lvblN0cn06ICR7dG9FcnJvck1lc3NhZ2UoZXJyKX1gKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRnaXRNZXRhZGF0YSA9IG0gYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPjtcblxuXHRcdFx0XHRcdFx0aWYgKGdpdE1ldGFkYXRhW01FVEFfR0lUX1NUQVRFXSkge1xuXHRcdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGdpdFN0YXRlID0gSlNPTi5wYXJzZShnaXRNZXRhZGF0YVtNRVRBX0dJVF9TVEFURV0pO1xuXHRcdFx0XHRcdFx0XHRcdHNlc3Npb25NZXRhZGF0YSA9IHsgW1NFU1NJT05fTUVUQV9HSVRfS0VZXTogZ2l0U3RhdGUgfTtcblx0XHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBGYWlsZWQgdG8gcGFyc2UgR2l0IHN0YXRlIGZvciAke3Nlc3Npb25TdHJ9OiAke3RvRXJyb3JNZXNzYWdlKGVycil9YCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0aWYgKGdpdE1ldGFkYXRhW01FVEFfR0lUSFVCX1NUQVRFXSkge1xuXHRcdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGdpdGh1YlN0YXRlID0gSlNPTi5wYXJzZShnaXRNZXRhZGF0YVtNRVRBX0dJVEhVQl9TVEFURV0pO1xuXHRcdFx0XHRcdFx0XHRcdHNlc3Npb25NZXRhZGF0YSA9IHtcblx0XHRcdFx0XHRcdFx0XHRcdC4uLihzZXNzaW9uTWV0YWRhdGEgPyBzZXNzaW9uTWV0YWRhdGEgOiB7fSksXG5cdFx0XHRcdFx0XHRcdFx0XHRbU0VTU0lPTl9NRVRBX0dJVEhVQl9LRVldOiBnaXRodWJTdGF0ZVxuXHRcdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV0gRmFpbGVkIHRvIHBhcnNlIEdpdEh1YiBzdGF0ZSBmb3IgJHtzZXNzaW9uU3RyfTogJHt0b0Vycm9yTWVzc2FnZShlcnIpfWApO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlmIChnaXRNZXRhZGF0YVtNRVRBX1NPVVJDRV9DT05UUk9MX1NUQVRFXSkge1xuXHRcdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRcdHNlc3Npb25NZXRhZGF0YSA9IHdpdGhTZXNzaW9uU291cmNlQ29udHJvbFN0YXRlKHNlc3Npb25NZXRhZGF0YSwgcGFyc2VQZXJzaXN0ZWRTb3VyY2VDb250cm9sU3RhdGUoZ2l0TWV0YWRhdGFbTUVUQV9TT1VSQ0VfQ09OVFJPTF9TVEFURV0pKTtcblx0XHRcdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBGYWlsZWQgdG8gcGFyc2Ugc291cmNlLWNvbnRyb2wgc3RhdGUgZm9yICR7c2Vzc2lvblN0cn06ICR7dG9FcnJvck1lc3NhZ2UoZXJyKX1gKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZiAobVtBSF9NRVRBX1dPUktTUEFDRUxFU1NfREJfS0VZXSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdHNlc3Npb25NZXRhZGF0YSA9IHdpdGhTZXNzaW9uV29ya3NwYWNlbGVzcyhzZXNzaW9uTWV0YWRhdGEsIG1bQUhfTUVUQV9XT1JLU1BBQ0VMRVNTX0RCX0tFWV0gPT09ICd0cnVlJyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRzZXNzaW9uTWV0YWRhdGEgPSB3aXRoU2Vzc2lvbk11bHRpUm9vdE1ldGFkYXRhKHNlc3Npb25NZXRhZGF0YSwgcGFyc2VTZXNzaW9uTXVsdGlSb290TWV0YWRhdGEobVtTRVNTSU9OX01FVEFfTVVMVElfUk9PVF9LRVldKSk7XG5cblx0XHRcdFx0XHRcdGlmIChtLmNvbmZpZ1ZhbHVlcykge1xuXHRcdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHRcdHBlcnNpc3RlZENvbmZpZ1ZhbHVlcyA9IEpTT04ucGFyc2UobS5jb25maWdWYWx1ZXMpO1xuXHRcdFx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIEZhaWxlZCB0byBwYXJzZSBwZXJzaXN0ZWQgY29uZmlnVmFsdWVzIGZvciAke3Nlc3Npb25TdHJ9OiAke3RvRXJyb3JNZXNzYWdlKGVycil9YCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdFx0ZGIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIEJlc3QtZWZmb3J0OiBmYWxsIGJhY2sgdG8gYWdlbnQtcHJvdmlkZWQgbWV0YWRhdGFcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBFbmNvZGUgaXNSZWFkL2lzQXJjaGl2ZWQgYXMgc3RhdHVzIGJpdG1hc2sgZmxhZ3Ncblx0XHRsZXQgc3RhdHVzOiBTZXNzaW9uU3RhdHVzID0gU2Vzc2lvblN0YXR1cy5JZGxlO1xuXHRcdGlmIChpc1JlYWQpIHtcblx0XHRcdHN0YXR1cyB8PSBTZXNzaW9uU3RhdHVzLklzUmVhZDtcblx0XHR9XG5cdFx0aWYgKGlzQXJjaGl2ZWQpIHtcblx0XHRcdHN0YXR1cyB8PSBTZXNzaW9uU3RhdHVzLklzQXJjaGl2ZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvdmlkZXJNZXRhID0gd2l0aFNlc3Npb25NdWx0aVJvb3RNZXRhZGF0YShtZXRhLl9tZXRhLCB1bmRlZmluZWQpO1xuXHRcdGxldCByZXN0b3JlZE1ldGEgPSAoc2Vzc2lvbk1ldGFkYXRhIHx8IHByb3ZpZGVyTWV0YSkgPyB7IC4uLihwcm92aWRlck1ldGEgPz8ge30pLCAuLi4oc2Vzc2lvbk1ldGFkYXRhID8/IHt9KSB9IDogdW5kZWZpbmVkO1xuXHRcdHJlc3RvcmVkTWV0YSA9IHdpdGhTZXNzaW9uTXVsdGlSb290TWV0YWRhdGEocmVzdG9yZWRNZXRhLCByZWFkU2Vzc2lvbk11bHRpUm9vdE1ldGFkYXRhKHNlc3Npb25NZXRhZGF0YSkpO1xuXHRcdHJlc3RvcmVkTWV0YSA9IHdpdGhTZXNzaW9uRXh0ZXJuYWwocmVzdG9yZWRNZXRhLCBleHRlcm5hbCk7XG5cdFx0Y29uc3Qgc3VtbWFyeTogU2Vzc2lvblN1bW1hcnkgPSB7XG5cdFx0XHRyZXNvdXJjZTogc2Vzc2lvblN0cixcblx0XHRcdHByb3ZpZGVyOiBhZ2VudC5pZCxcblx0XHRcdHRpdGxlLFxuXHRcdFx0c3RhdHVzLFxuXHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZShtZXRhLnN0YXJ0VGltZSkudG9JU09TdHJpbmcoKSxcblx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKG1ldGEubW9kaWZpZWRUaW1lKS50b0lTT1N0cmluZygpLFxuXHRcdFx0Li4uKG1ldGEucHJvamVjdCA/IHsgcHJvamVjdDogeyB1cmk6IG1ldGEucHJvamVjdC51cmkudG9TdHJpbmcoKSwgZGlzcGxheU5hbWU6IG1ldGEucHJvamVjdC5kaXNwbGF5TmFtZSB9IH0gOiB7fSksXG5cdFx0XHRjaGFuZ2VzOiBtZXRhLmNoYW5nZXMgPz8gY2hhbmdlcyxcblx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogbWV0YS53b3JraW5nRGlyZWN0b3JpZXM/Lm1hcChkID0+IGQudG9TdHJpbmcoKSksXG5cdFx0XHRfbWV0YTogcmVzdG9yZWRNZXRhLFxuXHRcdH07XG5cblx0XHRjb25zdCBbZGVmYXVsdERyYWZ0LCBkZWZhdWx0Q2hhdFRpdGxlXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMuX2dldENoYXREcmFmdChzZXNzaW9uLCBkZWZhdWx0Q2hhdFVyaSksXG5cdFx0XHR0aGlzLl9yZWFkUGVyc2lzdGVkQ2hhdFRpdGxlKHNlc3Npb24sIGRlZmF1bHRDaGF0VXJpKSxcblx0XHRdKTtcblx0XHRjb25zdCByZXN0b3JlZERyYWZ0ID0gbWV0YS5tb2RlbFxuXHRcdFx0PyB7IC4uLihkZWZhdWx0RHJhZnQgPz8geyB0ZXh0OiAnJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9KSwgbW9kZWw6IG1ldGEubW9kZWwgfVxuXHRcdFx0OiBkZWZhdWx0RHJhZnQ7XG5cdFx0Y29uc3QgbWVyZ2VkVHVybnMgPSBhd2FpdCB0aGlzLl9pbnRlcmxlYXZlTG9jYWxUdXJucyhzZXNzaW9uU3RyLCBkZWZhdWx0Q2hhdFVyaS50b1N0cmluZygpLCB0dXJucyk7XG5cdFx0Y29uc3QgcmVnaXN0ZXJlZCA9IGF3YWl0IHRoaXMuX3JldHJ5UmVnaXN0cnlNdXRhdGlvbihcblx0XHRcdCgpID0+IHRoaXMuX3Nlc3Npb25SZWdpc3RyeS5yZWdpc3RlcihzZXNzaW9uLCB7IHByb3ZpZGVyOiBhZ2VudC5pZCwgc3RhcnRUaW1lOiBtZXRhLnN0YXJ0VGltZSwgc291cmNlOiByZWdpc3RyYXRpb25Tb3VyY2UgfSwgeyBjaGVja1RvbWJzdG9uZTogdHJ1ZSB9KSxcblx0XHRcdGByZWdpc3RyYXRpb24gZm9yIHJlc3RvcmVkIHNlc3Npb24gJHtzZXNzaW9uLnRvU3RyaW5nKCl9YCxcblx0XHQpO1xuXHRcdGlmICghcmVnaXN0ZXJlZCkge1xuXHRcdFx0Ly8gVG9tYnN0b25lZCBiZXR3ZWVuIHRoZSBlYXJseSBjaGVjayBpbiBgX2RvUmVzdG9yZVNlc3Npb25gIGFuZFxuXHRcdFx0Ly8gaGVyZSAoZS5nLiBhIGNvbmN1cnJlbnQgYGRpc3Bvc2VTZXNzaW9uYCBsYW5kZWQgd2hpbGUgdGhpc1xuXHRcdFx0Ly8gcmVzdG9yZSB3YXMgcmVhZGluZyB0dXJucy9tZXRhZGF0YSkuIEZhaWwgdGhlIHNhbWUgd2F5IGFuXG5cdFx0XHQvLyB1cC1mcm9udCB0b21ic3RvbmUgd291bGQsIGJlZm9yZSBhbnkgc3RhdGUtbWFuYWdlciBtdXRhdGlvbi5cblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFIUF9TRVNTSU9OX05PVF9GT1VORCwgYFNlc3Npb24gd2FzIGV4cGxpY2l0bHkgZGVsZXRlZDogJHtzZXNzaW9uU3RyfWApO1xuXHRcdH1cblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIucmVzdG9yZVNlc3Npb24oc3VtbWFyeSwgbWVyZ2VkVHVybnMsIHsgZHJhZnQ6IHJlc3RvcmVkRHJhZnQsIGRlZmF1bHRDaGF0VGl0bGUgfSk7XG5cdFx0dGhpcy5fc2VydmVyVG9vbEhvc3QuYWR2ZXJ0aXNlKHNlc3Npb25TdHIpO1xuXG5cdFx0Ly8gQSBmcmVzaGx5LWFkb3B0ZWQgbGVnYWN5IHNlc3Npb24gYnJpZGdlcyBpdHMgZ2l0IGNoZWNrcG9pbnRzIGludG8gdGhlXG5cdFx0Ly8gYWdlbnQtaG9zdCBuYW1lc3BhY2Ugb25jZSBpdHMgdHVybnMgYXJlIHJlc3RvcmVkLiBJc29sYXRlZCBzbyBhIGZhaWx1cmVcblx0XHQvLyBoZXJlIGNhbm5vdCBicmVhayB0aGUgcmVzdG9yZS5cblx0XHRpZiAoYWRvcHRlZCAmJiB0aGlzLl9jaGVja3BvaW50U2VydmljZS5hZG9wdExlZ2FjeUNoZWNrcG9pbnRzKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBjaGVja3BvaW50V29ya2luZ0RpcmVjdG9yeSA9IG1ldGEud29ya2luZ0RpcmVjdG9yaWVzPy5bMF07XG5cdFx0XHRcdGlmIChjaGVja3BvaW50V29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2NoZWNrcG9pbnRTZXJ2aWNlLmFkb3B0TGVnYWN5Q2hlY2twb2ludHMoc2Vzc2lvbiwgY2hlY2twb2ludFdvcmtpbmdEaXJlY3RvcnksIEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uKSwgbWVyZ2VkVHVybnMubWFwKHQgPT4gdC5pZCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBhZG9wdDogY2hlY2twb2ludCBicmlkZ2UgZmFpbGVkIGZvciAke3Nlc3Npb25TdHJ9YCwgZXJyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBwcm9taXNlczogUHJvbWlzZTx1bmtub3duPltdID0gW107XG5cdFx0YXdhaXQgdGhpcy5fcmVnaXN0ZXJSZXN0b3JlZFN1YmFnZW50U3VtbWFyaWVzKGFnZW50LCBzZXNzaW9uLCBtZXJnZWRUdXJucyk7XG5cblx0XHQvLyBSZWdpc3RlciBwZXJzaXN0ZWQgcGVlci1jaGF0IGNhdGFsb2cgbWV0YWRhdGEuIFRoZWlyIHByb3ZpZGVyIGJhY2tpbmdzXG5cdFx0Ly8gYW5kIGhpc3RvcmllcyBhcmUgcmVzdG9yZWQgd2hlbiBhIHBlZXIgY2hhdCBpcyBmaXJzdCByZXF1ZXN0ZWQuXG5cdFx0cHJvbWlzZXMucHVzaCh0aGlzLl9yZXN0b3JlUGVlckNoYXRzKGFnZW50LCBzZXNzaW9uKSk7XG5cblx0XHQvLyBSZWdpc3RlciB0aGUgc3RhdGljIGNoYW5nZXNldCBVUklzIGFuZCByZXNlZWQgdGhlbSBmcm9tIGFueVxuXHRcdC8vIHBlcnNpc3RlZCBmaWxlIGxpc3RzIGluIHRoZSBiYXRjaGVkIG1ldGFkYXRhIHJlYWQuIFRoZSBjYXRhbG9ndWVcblx0XHQvLyBpdHNlbGYgaXMgc2VlZGVkIG9uIGBzdGF0ZS5jaGFuZ2VzZXRzYCBzeW5jaHJvbm91c2x5IGJ5IHRoZVxuXHRcdC8vIGBzZXRTZXNzaW9uQ2hhbmdlc2V0c2AgY2FsbCBhYm92ZS4gVGhlIGNvb3JkaW5hdG9yIGRyYWlucyBhbnlcblx0XHQvLyB1bmNvbW1pdHRlZCByZWZyZXNoIGRlZmVycmVkIGJ5IGFuIGVhcmxpZXIgYGFkZFN1YnNjcmliZXJgIFx1MjAxNFxuXHRcdC8vIGBhZGRTdWJzY3JpYmVyYCdzIDBcdTIxOTIxIHRyaWdnZXIgbWF5IGhhdmUgZmlyZWQgZm9yXG5cdFx0Ly8gYDxzZXNzaW9uPi9jaGFuZ2VzZXQvdW5jb21taXR0ZWRgIGJlZm9yZSB0aGlzIHJlc3RvcmUgcmFuIChlLmcuXG5cdFx0Ly8gYWN0aXZlLXNlc3Npb24gYXV0b3J1biBzdWJzY3JpYmluZyBpbiBwYXJhbGxlbCB3aXRoIHRoZVxuXHRcdC8vIGNoYXQtdmlldyk7IG5vdyB0aGF0IGBzdW1tYXJ5LndvcmtpbmdEaXJlY3RvcnlgIGlzIHBvcHVsYXRlZCxcblx0XHQvLyByZS10cmlnZ2VyaW5nIHRoZSByZWZyZXNoIGRpc3BhdGNoZXMgdG8gdGhlIGNvbXB1dGUgcGF0aC5cblx0XHR0aGlzLl9jaGFuZ2VzZXRDb29yZGluYXRvci5vblNlc3Npb25SZXN0b3JlZChzZXNzaW9uU3RyLCBjaGFuZ2VzZXRNZXRhZGF0YSA/PyB7fSk7XG5cblx0XHQvLyBSZXN0b3JlIHBlcnNpc3RlZCBgX21ldGFgIChlLmcuIGdpdCBzdGF0ZSkgb250byB0aGUgbmV3IHNlc3Npb25cblx0XHQvLyBzdGF0ZS4gVGhpcyBkaXNwYXRjaGVzIGEgU2Vzc2lvbk1ldGFDaGFuZ2VkIGFjdGlvbi5cblx0XHRpZiAoc3VtbWFyeS5fbWV0YSkge1xuXHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLnNldFNlc3Npb25NZXRhKHNlc3Npb25TdHIsIHN1bW1hcnkuX21ldGEpO1xuXHRcdH1cblxuXHRcdC8vIFJlc29sdmUgdGhlIHNlc3Npb24gY29uZmlnIHNvIGNsaWVudHMgKGUuZy4gdGhlIHJ1bm5pbmctc2Vzc2lvblxuXHRcdC8vIGF1dG8tYXBwcm92ZSBwaWNrZXIpIGNhbiByZW5kZXIgc2Vzc2lvbi1tdXRhYmxlIHByb3BlcnRpZXMgZm9yXG5cdFx0Ly8gc2Vzc2lvbnMgdGhhdCB3ZXJlIG5vdCBjcmVhdGVkIGluIHRoZSBjdXJyZW50IHByb2Nlc3MgbGlmZXRpbWUuXG5cdFx0Ly8gT3ZlcmxheSBhbnkgdmFsdWVzIHRoZSB1c2VyIHByZXZpb3VzbHkgc2VsZWN0ZWQgKHBlcnNpc3RlZCB2aWFcblx0XHQvLyBgU2Vzc2lvbkNvbmZpZ0NoYW5nZWRgKSBvbiB0b3Agb2YgdGhlIHByb3ZpZGVyJ3MgcmVzb2x2ZWQgZGVmYXVsdHMuXG5cdFx0Y29uc3QgcmVzdG9yZWRDb25maWdWYWx1ZXMgPSBtZXRhLndvcmtpbmdEaXJlY3Rvcmllcz8ubGVuZ3RoXG5cdFx0XHQ/IHsgW1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXTogJ2ZvbGRlcicsIC4uLnBlcnNpc3RlZENvbmZpZ1ZhbHVlcyB9XG5cdFx0XHQ6IHBlcnNpc3RlZENvbmZpZ1ZhbHVlcztcblx0XHRjb25zdCBbcmVzdG9yZWRDb25maWcsIHJlc3RvcmVkQ3VzdG9taXphdGlvbnNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0dGhpcy5fcmVzb2x2ZUNyZWF0ZWRTZXNzaW9uQ29uZmlnKGFnZW50LCB7XG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogbWV0YS53b3JraW5nRGlyZWN0b3JpZXMsXG5cdFx0XHRcdGNvbmZpZzogcmVzdG9yZWRDb25maWdWYWx1ZXMsXG5cdFx0XHR9KSxcblx0XHRcdGFnZW50LmdldENoYXRDdXN0b21pemF0aW9ucyhkZWZhdWx0Q2hhdFVyaSwgY2hhdENvbnRleHQsIHRoaXMuX2hvc3RDdXN0b21pemF0aW9ucyhzZXNzaW9uKSkuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignW0FnZW50U2VydmljZV0gcmVzdG9yZVNlc3Npb246IGZhaWxlZCB0byByZXNvbHZlIGNoYXQgY3VzdG9taXphdGlvbnMnLCBlcnIpO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSksXG5cdFx0XHQuLi5wcm9taXNlc1xuXHRcdF0pO1xuXHRcdGlmIChyZXN0b3JlZENvbmZpZykge1xuXHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLnNldFNlc3Npb25Db25maWcoc2Vzc2lvblN0ciwgcmVzdG9yZWRDb25maWcpO1xuXHRcdH1cblx0XHQvLyBTZWVkIHJlc3RvcmVkIHNlc3Npb24gY3VzdG9taXphdGlvbnMgaW50byBzdGF0ZSBzbyB0aGUgdmVyeSBmaXJzdFxuXHRcdC8vIHNuYXBzaG90IGFmdGVyIHNlbGVjdGluZyBhbiBleGlzdGluZyBzZXNzaW9uIGNvbnRhaW5zIGVmZmVjdGl2ZVxuXHRcdC8vIGluc3RydWN0aW9ucy9hZ2VudHMgd2l0aG91dCB3YWl0aW5nIGZvciBhIGZvbGxvdy11cCByZXB1Ymxpc2guXG5cdFx0aWYgKHJlc3RvcmVkQ3VzdG9taXphdGlvbnMgJiYgcmVzdG9yZWRDdXN0b21pemF0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuc2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zKHNlc3Npb25TdHIsIHJlc3RvcmVkQ3VzdG9taXphdGlvbnMpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0FnZW50U2VydmljZV0gUmVzdG9yZWQgc2Vzc2lvbiAke3Nlc3Npb25TdHJ9IHdpdGggJHt0dXJucy5sZW5ndGh9IHR1cm5zYCk7XG5cblx0XHR2b2lkIHRoaXMuX2dpdFN0YXRlU2VydmljZS5hdHRhY2hTZXNzaW9uR2l0SHViUHVsbFJlcXVlc3Qoc2Vzc2lvblN0ciwgbWV0YS53b3JraW5nRGlyZWN0b3JpZXM/LlswXSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dHVybkNvdW50OiBtZXJnZWRUdXJucy5sZW5ndGgsXG5cdFx0XHRoYXNQcm9qZWN0OiAhIW1ldGEucHJvamVjdCxcblx0XHRcdGhhc1dvcmt0cmVlOiBhZG9wdGVkV29ya3RyZWUsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5Q291bnQ6IG1ldGEud29ya2luZ0RpcmVjdG9yaWVzPy5sZW5ndGggPz8gMCxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc3RvcmVzIHRoZSBhZGRpdGlvbmFsIChub24tZGVmYXVsdCkgcGVlciBjaGF0cyBmb3IgYSBzZXNzaW9uLlxuXHQgKlxuXHQgKiBFbnVtZXJhdGlvbiBpcyBkcml2ZW4gYnkgdGhlIG9yY2hlc3RyYXRvcidzIE9XTiBwZXJzaXN0ZWQgY2F0YWxvZyAodGhlXG5cdCAqIHtAbGluayBQRUVSX0NIQVRTX01FVEFEQVRBX0tFWX0gYmxvYikuIEVhY2ggY2F0YWxvZyBlbnRyeSBpcyByZWdpc3RlcmVkXG5cdCAqIGltbWVkaWF0ZWx5IHdpdGggaXRzIHBlcnNpc3RlZCB0aXRsZSwgZHJhZnQsIG9yaWdpbiwgYW5kIHByb3ZpZGVyIGRhdGEuXG5cdCAqIEl0cyBiYWNraW5nIGFuZCBoaXN0b3J5IHJlbWFpbiB1bmxvYWRlZCB1bnRpbCB0aGUgcGVlciBjaGF0IGlzIHJlcXVlc3RlZC5cblx0ICpcblx0ICogV2hlbiB0aGUgb3JjaGVzdHJhdG9yIGNhdGFsb2cgaXMgYWJzZW50ICh7QGxpbmsgX3JlYWRQZXJzaXN0ZWRQZWVyQ2hhdENhdGFsb2d9XG5cdCAqIHJldHVybnMgYHVuZGVmaW5lZGApIHRoZSBzZXNzaW9uIHByZWRhdGVzIG9yY2hlc3RyYXRvci1vd25lZCBwZXJzaXN0ZW5jZTpcblx0ICogYSBvbmUtdGltZSBtaWdyYXRpb24gKHtAbGluayBfbWlncmF0ZUxlZ2FjeVBlZXJDaGF0c30pIGRyYWlucyB0aGUgYWdlbnQnc1xuXHQgKiBsZWdhY3kgYCouY2hhdHNgIGVudW1lcmF0aW9uIGludG8gdGhlIGNhdGFsb2cgc28gaXQgaXMgbmV2ZXIgY29uc3VsdGVkXG5cdCAqIGFnYWluLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVzdG9yZVBlZXJDaGF0cyhhZ2VudDogSUFnZW50LCBzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwZXJzaXN0ZWQgPSBhd2FpdCB0aGlzLl9yZWFkUGVyc2lzdGVkUGVlckNoYXRDYXRhbG9nKHNlc3Npb24pO1xuXHRcdGlmIChwZXJzaXN0ZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gVGhlIG9yY2hlc3RyYXRvciBvd25zIHRoZSBjYXRhbG9nOiBlbnVtZXJhdGUgZnJvbSBpdC5cblx0XHRcdGF3YWl0IHRoaXMuX3Jlc3RvcmVQZWVyQ2hhdHNGcm9tQ2F0YWxvZyhzZXNzaW9uLCBwZXJzaXN0ZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBObyBvcmNoZXN0cmF0b3IgY2F0YWxvZyB5ZXQ6IG9uZS10aW1lIG1pZ3JhdGlvbiBmcm9tIGxlZ2FjeSBgKi5jaGF0c2AuXG5cdFx0YXdhaXQgdGhpcy5fbWlncmF0ZUxlZ2FjeVBlZXJDaGF0cyhhZ2VudCwgc2Vzc2lvbik7XG5cdH1cblxuXHQvKipcblx0ICogT25lLXRpbWUgbWlncmF0aW9uIGZvciBzZXNzaW9ucyBwZXJzaXN0ZWQgYmVmb3JlIHRoZSBvcmNoZXN0cmF0b3Igb3duZWRcblx0ICogdGhlIHBlZXItY2hhdCBjYXRhbG9nOiBlbnVtZXJhdGUgdGhlIGFnZW50J3MgbGVnYWN5IGAqLmNoYXRzYFxuXHQgKiAoe0BsaW5rIElBZ2VudC5saXN0TGVnYWN5Q2hhdEJhY2tpbmdzfSksIHJlZ2lzdGVyIHRoZW0gdmlhIHRoZSBzYW1lIHBhdGggYXMgdGhlXG5cdCAqIG5ldyBjYXRhbG9nLCB0aGVuIHdyaXRlIHRoZSBvcmNoZXN0cmF0b3Ige0BsaW5rIFBFRVJfQ0hBVFNfTUVUQURBVEFfS0VZfVxuXHQgKiBibG9iIHNvIHN1YnNlcXVlbnQgcmVzdG9yZXMgcmVhZCB0aGUgbmV3IGNhdGFsb2cgYW5kIG5ldmVyIGNvbnN1bHQgdGhlXG5cdCAqIGxlZ2FjeSByZWFkIGFnYWluLiBOby1vcCB3aGVuIHRoZSBhZ2VudCBoYXMgbm8gbGVnYWN5IGVudW1lcmF0aW9uIG9yIG5vbmVcblx0ICogaXMgcGVyc2lzdGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfbWlncmF0ZUxlZ2FjeVBlZXJDaGF0cyhhZ2VudDogSUFnZW50LCBzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBsZWdhY3kgPSBhd2FpdCBhZ2VudC5saXN0TGVnYWN5Q2hhdEJhY2tpbmdzPy4oc2Vzc2lvbik7XG5cdFx0aWYgKCFsZWdhY3kgfHwgbGVnYWN5Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gV3JpdGUgYW4gZW1wdHkgY2F0YWxvZyBzZW50aW5lbCBzbyBgX3JlYWRQZXJzaXN0ZWRQZWVyQ2hhdENhdGFsb2dgXG5cdFx0XHQvLyByZXR1cm5zIGBbXWAgb24gc3Vic2VxdWVudCByZXN0b3JlcyBhbmQgdGhpcyBtaWdyYXRpb24gbmV2ZXIgcmUtcnVucy5cblx0XHRcdGF3YWl0IHRoaXMuX2VucXVldWVQZWVyQ2hhdENhdGFsb2dXcml0ZShzZXNzaW9uLCAoKSA9PiBbXSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGVudHJpZXM6IElQZXJzaXN0ZWRQZWVyQ2hhdFtdID0gbGVnYWN5Lm1hcChjaGF0ID0+ICh7XG5cdFx0XHR1cmk6IGNoYXQudXJpLnRvU3RyaW5nKCksXG5cdFx0XHQuLi4oY2hhdC5wcm92aWRlckRhdGEgIT09IHVuZGVmaW5lZCA/IHsgcHJvdmlkZXJEYXRhOiBjaGF0LnByb3ZpZGVyRGF0YSB9IDoge30pLFxuXHRcdH0pKTtcblx0XHRhd2FpdCB0aGlzLl9yZXN0b3JlUGVlckNoYXRzRnJvbUNhdGFsb2coc2Vzc2lvbiwgZW50cmllcyk7XG5cdFx0Ly8gU2luZ2xlIGF0b21pYyB3cml0ZTogdGhlIGtleSBpcyBhYnNlbnQgYmVmb3JlIGFuZCBjb21wbGV0ZSBhZnRlciwgc28gbm9cblx0XHQvLyBwYXJ0aWFsIGNhdGFsb2cgY2FuIHN1cnZpdmUgYSBjcmFzaCBtaWQtbWlncmF0aW9uICh3aGljaCB3b3VsZCBtYWtlXG5cdFx0Ly8gYF9yZWFkUGVyc2lzdGVkUGVlckNoYXRDYXRhbG9nYCByZXR1cm4gYSBwcm9wZXIgc3Vic2V0IGFuZCBwZXJtYW5lbnRseVxuXHRcdC8vIHNraXAgcmUtbWlncmF0aW9uKS4gVGhlIGNhbGxiYWNrIHRha2VzIG5vIHBhcmFtZXRlciBzbyBgZW50cmllc2AgaGVyZSBpc1xuXHRcdC8vIHRoZSBmdWxsIG1pZ3JhdGVkIHNldCwgbm90IHRoZSAoYWJzZW50KSBjdXJyZW50IGNhdGFsb2cuXG5cdFx0YXdhaXQgdGhpcy5fZW5xdWV1ZVBlZXJDaGF0Q2F0YWxvZ1dyaXRlKHNlc3Npb24sICgpID0+IFsuLi5lbnRyaWVzXSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVnaXN0ZXJzIGEgc2V0IG9mIHBlZXIgY2hhdHMgZnJvbSBhbiBlbnVtZXJhdGVkIGNhdGFsb2cgaW4gY2F0YWxvZyBvcmRlci5cblx0ICogVGl0bGVzIGFuZCBkcmFmdHMgYXJlIG1ldGFkYXRhLW9ubHkgcmVhZHM7IGJhY2tpbmcgc2Vzc2lvbnMgYW5kIGhpc3Rvcmllc1xuXHQgKiBhcmUgbG9hZGVkIG9uIHRoZSBmaXJzdCBjb250ZW50IHJlcXVlc3QuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXN0b3JlUGVlckNoYXRzRnJvbUNhdGFsb2coc2Vzc2lvbjogVVJJLCBlbnRyaWVzOiByZWFkb25seSBJUGVyc2lzdGVkUGVlckNoYXRbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlc3RvcmVkID0gYXdhaXQgUHJvbWlzZS5hbGwoZW50cmllcy5tYXAoYXN5bmMgKGVudHJ5KSA9PiB7XG5cdFx0XHRsZXQgY2hhdFVyaTogVVJJO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y2hhdFVyaSA9IFVSSS5wYXJzZShlbnRyeS51cmkpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV0gU2tpcHBpbmcgbWFsZm9ybWVkIHBlcnNpc3RlZCBwZWVyIGNoYXQgVVJJICcke2VudHJ5LnVyaX0nOiAke3RvRXJyb3JNZXNzYWdlKGVycil9YCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBbdGl0bGUsIGRyYWZ0XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0dGhpcy5fcmVhZFBlcnNpc3RlZENoYXRUaXRsZShzZXNzaW9uLCBjaGF0VXJpKSxcblx0XHRcdFx0dGhpcy5fZ2V0Q2hhdERyYWZ0KHNlc3Npb24sIGNoYXRVcmkpLFxuXHRcdFx0XSk7XG5cdFx0XHRyZXR1cm4geyBjaGF0VXJpLCB0aXRsZSwgZHJhZnQsIHByb3ZpZGVyRGF0YTogZW50cnkucHJvdmlkZXJEYXRhLCBvcmlnaW46IGVudHJ5Lm9yaWdpbiB9O1xuXHRcdH0pKTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgcmVzdG9yZWQpIHtcblx0XHRcdGlmICghaXRlbSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHsgY2hhdFVyaSwgdGl0bGUsIGRyYWZ0LCBwcm92aWRlckRhdGEsIG9yaWdpbiB9ID0gaXRlbTtcblx0XHRcdGlmICh0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKGNoYXRVcmkudG9TdHJpbmcoKSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIucmVnaXN0ZXJSZXN0b3JlZENoYXRTdW1tYXJ5KHNlc3Npb24udG9TdHJpbmcoKSwgY2hhdFVyaS50b1N0cmluZygpLCB7XG5cdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRkcmFmdCxcblx0XHRcdFx0cHJvdmlkZXJEYXRhLFxuXHRcdFx0XHRvcmlnaW4sXG5cdFx0XHRcdHJlc29sdmVyOiBjdXJyZW50UHJvdmlkZXJEYXRhID0+IHRoaXMuX21hdGVyaWFsaXplUmVzdG9yZWRQZWVyQ2hhdChzZXNzaW9uLCBjaGF0VXJpLCBjdXJyZW50UHJvdmlkZXJEYXRhKSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBNYXRlcmlhbGl6ZXMgcHJvdmlkZXIgYmFja2luZyBhbmQgaGlzdG9yeSBmb3IgdGhlIHN0YXRlLW1hbmFnZXItb3duZWRcblx0ICogcmVzdG9yZWQgY2hhdCBlbnRyeS4gVGhpcyBjYWxsYmFjayBuZXZlciBtdXRhdGVzIHN0YXRlIG1hbmFnZXIgc3RhdGUuXG5cdCAqXG5cdCAqIGBtYXRlcmlhbGl6ZUNoYXRgIG1heSByZXBvcnQgYSBmcmVzaCBgYmFja2luZ1Nlc3Npb25gIGZvciBhIHBlZXIgY2hhdFxuXHQgKiBiZWluZyByZXN0b3JlZCAodGhlIHNhbWUgZmllbGQgdXNlZCBhdCBjcmVhdGUgdGltZSB0byB0cmlnZ2VyXG5cdCAqIGBfbWFya0NoYXRCYWNraW5nYCk7IHdoZW4gaXQgZG9lcywgdGhpcyBtYXJrcyBpdCB0aGUgc2FtZSB3YXkgY3JlYXRlXG5cdCAqIGRvZXMsIHdpdGggdGhlIHNhbWUgcmV0cnkvc3VwcHJlc3Npb24gc2VtYW50aWNzLCBzbyBhIHJlc3RvcmVkIHBlZXJcblx0ICogY2hhdCdzIGJhY2tpbmcgc2Vzc2lvbiBjYW5ub3QgbGVhayBpbnRvIHRoZSB0b3AtbGV2ZWwgc2Vzc2lvbiBsaXN0LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfbWF0ZXJpYWxpemVSZXN0b3JlZFBlZXJDaGF0KHNlc3Npb246IFVSSSwgY2hhdDogVVJJLCBwcm92aWRlckRhdGE6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8eyB0dXJuczogVHVybltdIH0+IHtcblx0XHRjb25zdCBjaGF0S2V5ID0gY2hhdC50b1N0cmluZygpO1xuXHRcdGNvbnN0IGFnZW50ID0gdGhpcy5fZmluZFByb3ZpZGVyRm9yU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRpZiAoIWFnZW50KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIGFnZW50IHByb3ZpZGVyIGZvciByZXN0b3JlZCBwZWVyIGNoYXQ6ICR7Y2hhdEtleX1gKTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFnZW50Lm1hdGVyaWFsaXplQ2hhdChjaGF0LCB0aGlzLl9jaGF0Q29udGV4dChzZXNzaW9uLCBjaGF0KSwgcHJvdmlkZXJEYXRhKTtcblx0XHRcdGlmIChyZXN1bHQ/LmJhY2tpbmdTZXNzaW9uKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX21hcmtDaGF0QmFja2luZyhyZXN1bHQuYmFja2luZ1Nlc3Npb24sIGNoYXQpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdHVybnMgPSBhd2FpdCB0aGlzLl9nZXRDaGF0TWVzc2FnZXMoYWdlbnQsIGNoYXQsIHNlc3Npb24pO1xuXHRcdFx0cmV0dXJuIHsgdHVybnM6IGF3YWl0IHRoaXMuX2ludGVybGVhdmVMb2NhbFR1cm5zKHNlc3Npb24udG9TdHJpbmcoKSwgY2hhdEtleSwgdHVybnMpIH07XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIEZhaWxlZCB0byBtYXRlcmlhbGl6ZSBwZWVyIGNoYXQgJHtjaGF0S2V5fTogJHt0b0Vycm9yTWVzc2FnZShlcnIpfWApO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZS1wZXJzaXN0cyBhIHBlZXIgY2hhdCdzIG9wYXF1ZSBgcHJvdmlkZXJEYXRhYCBibG9iIHdoZW4gdGhlIGFnZW50XG5cdCAqIHJlcG9ydHMgaXQgY2hhbmdlZCAoZS5nLiBwZXItY2hhdCBtb2RlbCBzd2l0Y2ggb3IgZm9yayByZW1hcCkuXG5cdCAqL1xuXHRwcml2YXRlIF9vbkNoYXREYXRhQ2hhbmdlZChlOiBJQWdlbnRDaGF0RGF0YUNoYW5nZSk6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb25TdHIgPSBwYXJzZURlZmF1bHRDaGF0VXJpKGUuY2hhdCk7XG5cdFx0aWYgKHNlc3Npb25TdHIgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBvbkRpZENoYW5nZUNoYXREYXRhIGZvciBtYWxmb3JtZWQgY2hhdCBVUkk6ICR7ZS5jaGF0LnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChpc0RlZmF1bHRDaGF0VXJpKGUuY2hhdCkpIHtcblx0XHRcdHZvaWQgdGhpcy5fcGVyc2lzdERlZmF1bHRDaGF0QmFja2luZyh7IHNlc3Npb246IFVSSS5wYXJzZShzZXNzaW9uU3RyKSwgY2hhdDogZSB9KVxuXHRcdFx0XHQuY2F0Y2goZXJyID0+IHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyLCBgW0FnZW50U2VydmljZV0gRmFpbGVkIHRvIHBlcnNpc3QgZGVmYXVsdC1jaGF0IGJhY2tpbmcgZm9yICR7ZS5jaGF0LnRvU3RyaW5nKCl9YCkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uU3RyKTtcblx0XHRpZiAodGhpcy5fZGlzcG9zaW5nUGVlckNoYXRzLmhhcyhlLmNoYXQudG9TdHJpbmcoKSkgfHwgIXNlc3Npb24/LmNoYXRzLnNvbWUoY2hhdCA9PiBjaGF0LnJlc291cmNlLnRvU3RyaW5nKCkgPT09IGUuY2hhdC50b1N0cmluZygpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIudXBkYXRlQ2hhdFByb3ZpZGVyRGF0YShlLmNoYXQudG9TdHJpbmcoKSwgZS5wcm92aWRlckRhdGEpO1xuXHRcdHZvaWQgdGhpcy5fcGVyc2lzdFBlZXJDaGF0KFVSSS5wYXJzZShzZXNzaW9uU3RyKSwgZS5jaGF0LCBlLnByb3ZpZGVyRGF0YSlcblx0XHRcdC5jYXRjaChlcnIgPT4gdGhpcy5fbG9nU2VydmljZS5lcnJvcihlcnIsIGBbQWdlbnRTZXJ2aWNlXSBGYWlsZWQgdG8gcGVyc2lzdCBwZWVyLWNoYXQgYmFja2luZyBmb3IgJHtlLmNoYXQudG9TdHJpbmcoKX1gKSk7XG5cdH1cblxuXHQvKipcblx0ICogS2VlcHMgYWdlbnQtc3Bhd25lZCBjaGF0cyBpbiB0aGUgY2F0YWxvZyBlYXJseSBlbm91Z2ggZm9yIHRoZWlyIGZpcnN0IHR1cm46XG5cdCAqIGEgYHN1YmFnZW50X3N0YXJ0ZWRgIHByb2dyZXNzIHNpZ25hbCBmZWVkcyB0aGUgc2FtZSBoYW5kbGVyIGFzXG5cdCAqIHtAbGluayBJQWdlbnQub25EaWRTcGF3bkNoYXR9LiBDb21wbGV0aW9uIGlzIGlnbm9yZWQgaGVyZSBiZWNhdXNlIHNwYXduZWRcblx0ICogY2hhdHMgc3RheSBsaXZlIHVudGlsIHNlc3Npb24gdGVhcmRvd24sIGFuZCBvdmVybGFwIHdpdGggdGhlIGFnZW50J3Mgb3duXG5cdCAqIHNwYXduIGJyaWRnZSBpcyBzYWZlIGJlY2F1c2UgYGFkZENoYXRgIGlzIGlkZW1wb3RlbnQuXG5cdCAqL1xuXHRwcml2YXRlIF9zZXF1ZW5jZVNwYXduZWRDaGF0KHNpZ25hbDogQWdlbnRTaWduYWwpOiB2b2lkIHtcblx0XHRjb25zdCBzcGF3biA9IFN1YmFnZW50Q2hhdFNpZ25hbC50b1NwYXduRXZlbnQoc2lnbmFsKTtcblx0XHRpZiAoc3Bhd24pIHtcblx0XHRcdHRoaXMuX29uQ2hhdFNwYXduZWQoc3Bhd24pO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBNYXJrcyBhIHN1YmFnZW50IGNoYXQgYXMgcGVuZGluZyBvbmNlIGl0cyBjb25maXJtZWQgdG9vbCBjYWxsIHJlYWNoZXMgKG9yIGlzIGFib3V0IHRvIHJlYWNoKSBgUnVubmluZ2AuICovXG5cdHByaXZhdGUgX3RyYWNrUGVuZGluZ1N1YmFnZW50Q2hhdEZyb21FbnZlbG9wZShlbnZlbG9wZTogQWN0aW9uRW52ZWxvcGUpOiB2b2lkIHtcblx0XHRjb25zdCB7IGNoYW5uZWwsIGFjdGlvbiB9ID0gZW52ZWxvcGU7XG5cdFx0aWYgKGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0IHx8IGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbERlbHRhIHx8IGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5KSB7XG5cdFx0XHRjb25zdCBrZXkgPSBgJHtjaGFubmVsfToke2FjdGlvbi50b29sQ2FsbElkfWA7XG5cdFx0XHQvLyBQcm92aWRlcnMgc3RhbXAgYHRvb2xLaW5kYC9gc3ViYWdlbnRDaGF0VXJpYCBvbiB3aGljaGV2ZXIgYWN0aW9uXG5cdFx0XHQvLyBmaXJzdCByZXZlYWxzIGl0IChDb3BpbG90IGF0IFN0YXJ0LCBDbGF1ZGUgYXQgUmVhZHkpIFx1MjAxNCBsYXRlclxuXHRcdFx0Ly8gYWN0aW9ucyBmb3IgdGhlIHNhbWUgdG9vbCBjYWxsIGRvbid0IHJlcGVhdCBpdCwgc28gZmFsbCBiYWNrIHRvXG5cdFx0XHQvLyB3aGF0IHdlIGFscmVhZHkgcmVjb3JkZWQgZm9yIHRoaXMgdG9vbCBjYWxsLlxuXHRcdFx0Y29uc3Qgc3ViYWdlbnRDaGF0VXJpID0gcmVhZFRvb2xDYWxsTWV0YShhY3Rpb24pLnN1YmFnZW50Q2hhdFVyaSA/PyB0aGlzLl9wZW5kaW5nU3ViYWdlbnRUb29sQ2FsbHMuZ2V0KGtleSk7XG5cdFx0XHRpZiAoc3ViYWdlbnRDaGF0VXJpID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5ICYmIGFjdGlvbi5jb25maXJtZWQpIHtcblx0XHRcdFx0Ly8gR29lcyBzdHJhaWdodCB0byBSdW5uaW5nIFx1MjAxNCBhcm0gdGhlIGJvdW5kZWQgd2FpdCBub3cuXG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdTdWJhZ2VudFRvb2xDYWxscy5kZWxldGUoa2V5KTtcblx0XHRcdFx0dGhpcy5fYXJtUGVuZGluZ1N1YmFnZW50Q2hhdChzdWJhZ2VudENoYXRVcmkpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBTdGlsbCBzdHJlYW1pbmcgb3IgYXdhaXRpbmcgY29uZmlybWF0aW9uLiBSZW1lbWJlciB0aGUgVVJJIHNvIGFcblx0XHRcdC8vIGxhdGVyIENoYXRUb29sQ2FsbENvbmZpcm1lZCBjYW4gYXJtIHRoZSB3YWl0IG9uY2UgKGlmIGV2ZXIpXG5cdFx0XHQvLyBjb25maXJtZWQsIHdpdGhvdXQgdGltaW5nIG91dCB3aGlsZSB0aGUgdXNlciBpcyBzdGlsbCBkZWNpZGluZy5cblx0XHRcdHRoaXMuX3BlbmRpbmdTdWJhZ2VudFRvb2xDYWxscy5zZXQoa2V5LCBzdWJhZ2VudENoYXRVcmkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkKSB7XG5cdFx0XHRjb25zdCBrZXkgPSBgJHtjaGFubmVsfToke2FjdGlvbi50b29sQ2FsbElkfWA7XG5cdFx0XHRjb25zdCBzdWJhZ2VudENoYXRVcmkgPSB0aGlzLl9wZW5kaW5nU3ViYWdlbnRUb29sQ2FsbHMuZ2V0KGtleSk7XG5cdFx0XHRpZiAoc3ViYWdlbnRDaGF0VXJpID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcGVuZGluZ1N1YmFnZW50VG9vbENhbGxzLmRlbGV0ZShrZXkpO1xuXHRcdFx0aWYgKGFjdGlvbi5hcHByb3ZlZCkge1xuXHRcdFx0XHR0aGlzLl9hcm1QZW5kaW5nU3ViYWdlbnRDaGF0KHN1YmFnZW50Q2hhdFVyaSk7XG5cdFx0XHR9XG5cdFx0XHQvLyBEZW5pZWQ6IHRoZSBzdWJhZ2VudCB3aWxsIG5ldmVyIHNwYXduOyBub3RoaW5nIHRvIHJlc29sdmUgc2luY2Vcblx0XHRcdC8vIHRoZSB3YWl0IHdhcyBuZXZlciBhcm1lZCB3aGlsZSBhd2FpdGluZyBjb25maXJtYXRpb24uXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChhY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSkge1xuXHRcdFx0Ly8gRGVmZW5zaXZlIGNsZWFudXA6IGEgdG9vbCBjYWxsIGNhbiBjb21wbGV0ZSB3aXRob3V0IGV2ZXIgYmVpbmdcblx0XHRcdC8vIGNvbmZpcm1lZCAoZS5nLiBjYW5jZWxsZWQgYnkgb3RoZXIgbWVhbnMpIHdoaWxlIHN0aWxsIHRyYWNrZWQuXG5cdFx0XHR0aGlzLl9wZW5kaW5nU3ViYWdlbnRUb29sQ2FsbHMuZGVsZXRlKGAke2NoYW5uZWx9OiR7YWN0aW9uLnRvb2xDYWxsSWR9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYXJtUGVuZGluZ1N1YmFnZW50Q2hhdChzdWJhZ2VudENoYXRVcmk6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wZW5kaW5nU3ViYWdlbnRDaGF0cy5oYXMoc3ViYWdlbnRDaGF0VXJpKSB8fCB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U25hcHNob3Qoc3ViYWdlbnRDaGF0VXJpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHR0aGlzLl9wZW5kaW5nU3ViYWdlbnRDaGF0cy5zZXQoc3ViYWdlbnRDaGF0VXJpLCBkZWZlcnJlZCk7XG5cdFx0dGhpcy5fcGVuZGluZ1N1YmFnZW50Q2hhdFRpbWVvdXRzLnNldChzdWJhZ2VudENoYXRVcmksIGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX3BlbmRpbmdTdWJhZ2VudENoYXRzLmRlbGV0ZShzdWJhZ2VudENoYXRVcmkpO1xuXHRcdFx0dGhpcy5fcGVuZGluZ1N1YmFnZW50Q2hhdFRpbWVvdXRzLmRlbGV0ZUFuZERpc3Bvc2Uoc3ViYWdlbnRDaGF0VXJpKTtcblx0XHRcdGRlZmVycmVkLmNvbXBsZXRlKCk7XG5cdFx0fSwgU1VCQUdFTlRfQ0hBVF9QRU5ESU5HX1RJTUVPVVRfTVMpKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc29sdmVQZW5kaW5nU3ViYWdlbnRDaGF0KHJlc291cmNlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBkZWZlcnJlZCA9IHRoaXMuX3BlbmRpbmdTdWJhZ2VudENoYXRzLmdldChyZXNvdXJjZSk7XG5cdFx0aWYgKCFkZWZlcnJlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nU3ViYWdlbnRDaGF0cy5kZWxldGUocmVzb3VyY2UpO1xuXHRcdHRoaXMuX3BlbmRpbmdTdWJhZ2VudENoYXRUaW1lb3V0cy5kZWxldGVBbmREaXNwb3NlKHJlc291cmNlKTtcblx0XHRkZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJvdXRlcyBhbiBhZ2VudC1zcGF3bmVkIGNoYXQgKGUuZy4gYSBzdWItYWdlbnQgZGVsZWdhdGVkIGJ5IGEgdG9vbFxuXHQgKiBjYWxsKSBzdHJhaWdodCBpbnRvIHRoZSBjaGF0IGNhdGFsb2cgdmlhIHtAbGluayBJQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLmFkZENoYXR9LFxuXHQgKiBzbyBoYXJuZXNzLXNwYXduZWQgY2hhdHMgYW5kIHVzZXItZHJpdmVuIGNoYXRzIHNoYXJlIE9ORSBtZW1iZXJzaGlwIHBhdGguXG5cdCAqIFRoZSB7QGxpbmsgSUFnZW50U3Bhd25DaGF0RXZlbnQucGFyZW50fSBzcGF3biBlZGdlIGlzIHJlY29yZGVkIGFzXG5cdCAqIHRoZSBjaGF0J3Mge0BsaW5rIENoYXRPcmlnaW5LaW5kLlRvb2x9IG9yaWdpbi4gU3Bhd25lZCBjaGF0cyBhcmVcblx0ICogbm90IHdyaXR0ZW4gdG8gdGhlIG9yY2hlc3RyYXRvcidzIHBlcnNpc3RlZCBwZWVyLWNoYXQgY2F0YWxvZyBcdTIwMTQgdGhleSBhcmVcblx0ICogdHJhbnNpZW50IGNoaWxkcmVuIHJlLWRlcml2ZWQgZnJvbSB0aGUgcGFyZW50J3MgZXZlbnQgbG9nIG9uIHJlc3RvcmUuXG5cdCAqL1xuXHRwcml2YXRlIF9vbkNoYXRTcGF3bmVkKGU6IElBZ2VudFNwYXduQ2hhdEV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmFkZENoYXQoZS5zZXNzaW9uLnRvU3RyaW5nKCksIGUuY2hhdC50b1N0cmluZygpLCB7XG5cdFx0XHQuLi4oZS50aXRsZSAhPT0gdW5kZWZpbmVkID8geyB0aXRsZTogZS50aXRsZSB9IDoge30pLFxuXHRcdFx0Li4uKGUucGFyZW50ID8ge1xuXHRcdFx0XHRvcmlnaW46IHsga2luZDogQ2hhdE9yaWdpbktpbmQuVG9vbCwgY2hhdDogZS5wYXJlbnQuY2hhdC50b1N0cmluZygpLCB0b29sQ2FsbElkOiBlLnBhcmVudC50b29sQ2FsbElkIH0sXG5cdFx0XHRcdC8vIFN1YmFnZW50IHdvcmtlciBjaGF0cyBhcmUgb2JzZXJ2YWJsZSBidXQgbm90IGRpcmVjdGx5IHN0ZWVyYWJsZTpcblx0XHRcdFx0Ly8gdGhlIHVzZXIgd2F0Y2hlcyB0aGVtIGFuZCBzdGVlcnMgdGhlIGxlYWQgY2hhdC4gTWFyayByZWFkLW9ubHkgc29cblx0XHRcdFx0Ly8gdGhlIFVJIGhpZGVzIHRoZSBjb21wb3NlciBhbmQgc2hvd3MgYSBsb2NrICh0aGUgYWdlbnQtdGVhbSBwYXR0ZXJuKS5cblx0XHRcdFx0aW50ZXJhY3Rpdml0eTogQ2hhdEludGVyYWN0aXZpdHkuUmVhZE9ubHksXG5cdFx0XHR9IDoge30pLFxuXHRcdH0pO1xuXHRcdHRoaXMuX3Jlc29sdmVQZW5kaW5nU3ViYWdlbnRDaGF0KGUuY2hhdC50b1N0cmluZygpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQZXJzaXN0cyBhIGZyZXNobHktY3JlYXRlZCAob3IgcmVjb3ZlcmVkKSBkZWZhdWx0IGNoYXQncyBkdXJhYmxlIHN0YXRlOlxuXHQgKiBpdHMgb3BhcXVlIGBwcm92aWRlckRhdGFgIGJsb2IgYW5kLCBzZXBhcmF0ZWx5LCBpdHMgYmFja2luZy1zZXNzaW9uXG5cdCAqIG1hcmtlci4gVGhlIHR3byB3cml0ZXMgYXJlIGluZGVwZW5kZW50IFx1MjAxNCBhIGZhaWx1cmUgcGVyc2lzdGluZ1xuXHQgKiBgcHJvdmlkZXJEYXRhYCBtdXN0IG5vdCBza2lwIG1hcmtpbmcgdGhlIGJhY2tpbmdcblx0ICogc2Vzc2lvbiwgc2luY2UgdGhhdCBtYXJrZXIgaXMgd2hhdCBrZWVwcyB0aGUgYmFja2luZyBzZXNzaW9uIG91dCBvZiB0aGVcblx0ICogdG9wLWxldmVsIGxpc3Q7IGBfbWFya0NoYXRCYWNraW5nYCBoYXMgaXRzIG93biByZXRyeS9zdXBwcmVzc2lvbiBhbmRcblx0ICogbmV2ZXIgdGhyb3dzLiBUaGUgcHJvdmlkZXItZGF0YSBmYWlsdXJlIGlzIHJldGhyb3duIGFmdGVyIHRoZSBtYXJrZXJcblx0ICogYXR0ZW1wdCBzbyBjcmVhdGlvbiBjYW4gcm9sbCBiYWNrIGluc3RlYWQgb2YgcmVwb3J0aW5nIGEgc2Vzc2lvbiB3aG9zZVxuXHQgKiBjb25jcmV0ZSBiYWNraW5nIGNhbm5vdCBiZSByZXN0b3JlZC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3BlcnNpc3REZWZhdWx0Q2hhdEJhY2tpbmcoY3JlYXRlZDogSUFnZW50Q3JlYXRlU2Vzc2lvblJlc3VsdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyRGF0YSA9IGNyZWF0ZWQuY2hhdD8ucHJvdmlkZXJEYXRhO1xuXHRcdGxldCBwcm92aWRlckRhdGFFcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHByb3ZpZGVyRGF0YSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCByZWYgPSB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKGNyZWF0ZWQuc2Vzc2lvbik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCByZWYub2JqZWN0LnNldE1ldGFkYXRhKERFRkFVTFRfQ0hBVF9QUk9WSURFUl9EQVRBX01FVEFEQVRBX0tFWSwgcHJvdmlkZXJEYXRhKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIGZhaWxlZCB0byBwZXJzaXN0IGRlZmF1bHQtY2hhdCBwcm92aWRlciBkYXRhIGZvciAke2NyZWF0ZWQuc2Vzc2lvbi50b1N0cmluZygpfWAsIGVycik7XG5cdFx0XHRcdHByb3ZpZGVyRGF0YUVycm9yID0gZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIgOiBuZXcgRXJyb3IoU3RyaW5nKGVycikpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGNyZWF0ZWQuY2hhdD8uYmFja2luZ1Nlc3Npb24pIHtcblx0XHRcdGF3YWl0IHRoaXMuX21hcmtDaGF0QmFja2luZyhjcmVhdGVkLmNoYXQuYmFja2luZ1Nlc3Npb24sIFVSSS5wYXJzZShidWlsZERlZmF1bHRDaGF0VXJpKGNyZWF0ZWQuc2Vzc2lvbikpKTtcblx0XHR9XG5cdFx0aWYgKHByb3ZpZGVyRGF0YUVycm9yKSB7XG5cdFx0XHR0aHJvdyBwcm92aWRlckRhdGFFcnJvcjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWFkRGVmYXVsdENoYXRQcm92aWRlckRhdGEoc2Vzc2lvbjogVVJJKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2UudHJ5T3BlbkRhdGFiYXNlPy4oc2Vzc2lvbik7XG5cdFx0aWYgKCFyZWYpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgcmVmLm9iamVjdC5nZXRNZXRhZGF0YShERUZBVUxUX0NIQVRfUFJPVklERVJfREFUQV9NRVRBREFUQV9LRVkpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkcyB0aGUgb3JjaGVzdHJhdG9yJ3MgcGVyc2lzdGVkIHBlZXItY2hhdCBjYXRhbG9nIGZvciBhIHNlc3Npb24uXG5cdCAqIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgc2Vzc2lvbiBoYXMgbm8gY2F0YWxvZyB5ZXQgKGEgbGVnYWN5IHNlc3Npb25cblx0ICogcHJlZGF0aW5nIG9yY2hlc3RyYXRvci1vd25lZCBwZXJzaXN0ZW5jZSwgb3IgYSBjb3JydXB0IGJsb2IpOyB0aGUgY2FsbGVyXG5cdCAqIHRoZW4gcGVyZm9ybXMgYSBvbmUtdGltZSBtaWdyYXRpb24gZnJvbSB0aGUgYWdlbnQncyBsZWdhY3kgYCouY2hhdHNgXG5cdCAqIGVudW1lcmF0aW9uIChzZWUge0BsaW5rIF9yZXN0b3JlUGVlckNoYXRzfSAvIHtAbGluayBfbWlncmF0ZUxlZ2FjeVBlZXJDaGF0c30pLlxuXHQgKiBBbiBlbXB0eSBhcnJheSBtZWFucyB0aGUgc2Vzc2lvbiBpcyBrbm93biB0byBoYXZlIG5vIHBlZXIgY2hhdHMsIHNvXG5cdCAqIG1pZ3JhdGlvbiBpcyBza2lwcGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVhZFBlcnNpc3RlZFBlZXJDaGF0Q2F0YWxvZyhzZXNzaW9uOiBVUkkpOiBQcm9taXNlPElQZXJzaXN0ZWRQZWVyQ2hhdFtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLnRyeU9wZW5EYXRhYmFzZT8uKHNlc3Npb24pO1xuXHRcdGlmICghcmVmKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmF3ID0gYXdhaXQgcmVmLm9iamVjdC5nZXRNZXRhZGF0YShQRUVSX0NIQVRTX01FVEFEQVRBX0tFWSk7XG5cdFx0XHRpZiAocmF3ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KTtcblx0XHRcdGlmICghQXJyYXkuaXNBcnJheShwYXJzZWQpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV0gSWdub3JpbmcgbWFsZm9ybWVkIHBlZXItY2hhdCBjYXRhbG9nIGZvciAke3Nlc3Npb24udG9TdHJpbmcoKX1gKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBwYXJzZWRcblx0XHRcdFx0LmZpbHRlcigoZW50cnkpOiBlbnRyeSBpcyBJUGVyc2lzdGVkUGVlckNoYXQgPT4gdHlwZW9mIGVudHJ5Py51cmkgPT09ICdzdHJpbmcnKVxuXHRcdFx0XHQubWFwKGVudHJ5ID0+ICh7XG5cdFx0XHRcdFx0dXJpOiBlbnRyeS51cmksXG5cdFx0XHRcdFx0Li4uKHR5cGVvZiBlbnRyeS5wcm92aWRlckRhdGEgPT09ICdzdHJpbmcnID8geyBwcm92aWRlckRhdGE6IGVudHJ5LnByb3ZpZGVyRGF0YSB9IDoge30pLFxuXHRcdFx0XHRcdC4uLihlbnRyeS5vcmlnaW4gIT09IHVuZGVmaW5lZCA/IHsgb3JpZ2luOiBlbnRyeS5vcmlnaW4gfSA6IHt9KSxcblx0XHRcdFx0fSkpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBGYWlsZWQgdG8gcmVhZCBwZWVyLWNoYXQgY2F0YWxvZyBmb3IgJHtzZXNzaW9uLnRvU3RyaW5nKCl9OiAke3RvRXJyb3JNZXNzYWdlKGVycil9YCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBNYXJrcyBhIGNoYXQncyBiYWNraW5nIFNESyBzZXNzaW9uIHNvIGxlZ2FjeSBkaXNjb3ZlcnkgY2Fubm90IHJlZ2lzdGVyXG5cdCAqIGl0IGFzIGEgc3RhbmRhbG9uZSB0b3AtbGV2ZWwgc2Vzc2lvbi4gQmVzdC1lZmZvcnQgYW5kIG5ldmVyIHRocm93czpcblx0ICogY2FsbGVycyAoY2hhdCBjcmVhdGlvbiAvIHJlc3RvcmUpIG11c3Qgbm90IGZhaWwganVzdCBiZWNhdXNlIHRoaXNcblx0ICogZHVyYWJsZSB3cml0ZSBkaWQuIFRoZSB3cml0ZSBpcyByZXRyaWVkIG9uY2U7IGlmIGl0IHN0aWxsIGZhaWxzLCB0aGVcblx0ICogYmFja2luZyBzZXNzaW9uIGlzIGFkZGVkIHRvIGBfdW5wZXJzaXN0ZWRDaGF0QmFja2luZ3NgIHNvXG5cdCAqIGBfaXNDaGF0QmFja2luZ2AgKGV4dGVybmFsIGRpc2NvdmVyeSkgYW5kIGBsaXN0U2Vzc2lvbnNgJ3Mgb3ZlcmxheSBmaWx0ZXIga2VlcFxuXHQgKiBzdXBwcmVzc2luZyBpdCBmb3IgdGhlIHJlc3Qgb2YgdGhpcyBwcm9jZXNzJ3MgbGlmZXRpbWUgZXZlbiB3aXRob3V0IGFcblx0ICogcGVyc2lzdGVkIG1hcmtlci4gQSBsYXRlciBzdWNjZXNzZnVsIGNhbGwgZm9yIHRoZSBzYW1lIHNlc3Npb24gKGUuZy4gYVxuXHQgKiByZXRyaWVkIGNhbGxlcikgY2xlYXJzIGFueSBzdGFsZSBzdXBwcmVzc2lvbiBlbnRyeS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX21hcmtDaGF0QmFja2luZyhiYWNraW5nU2Vzc2lvbjogVVJJLCBjaGF0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBiYWNraW5nU2Vzc2lvblN0ciA9IGJhY2tpbmdTZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgd3JpdGUgPSBhc3luYyAoKTogUHJvbWlzZTx2b2lkPiA9PiB7XG5cdFx0XHRjb25zdCByZWYgPSB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKGJhY2tpbmdTZXNzaW9uKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHJlZi5vYmplY3Quc2V0TWV0YWRhdGEoQ0hBVF9CQUNLSU5HX01FVEFEQVRBX0tFWSwgY2hhdC50b1N0cmluZygpKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgd3JpdGUoKTtcblx0XHRcdHRoaXMuX3VucGVyc2lzdGVkQ2hhdEJhY2tpbmdzLmRlbGV0ZShiYWNraW5nU2Vzc2lvblN0cik7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIGZhaWxlZCB0byBtYXJrIGJhY2tpbmcgc2Vzc2lvbiAke2JhY2tpbmdTZXNzaW9uU3RyfSBmb3IgY2hhdCAke2NoYXQudG9TdHJpbmcoKX0sIHJldHJ5aW5nYCwgZXJyKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCk7XG5cdFx0XHRcdHRoaXMuX3VucGVyc2lzdGVkQ2hhdEJhY2tpbmdzLmRlbGV0ZShiYWNraW5nU2Vzc2lvblN0cik7XG5cdFx0XHR9IGNhdGNoIChyZXRyeUVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIHJldHJ5IGZhaWxlZCB0byBtYXJrIGJhY2tpbmcgc2Vzc2lvbiAke2JhY2tpbmdTZXNzaW9uU3RyfSBmb3IgY2hhdCAke2NoYXQudG9TdHJpbmcoKX07IHN1cHByZXNzaW5nIGl0IGluLXByb2Nlc3MgaW5zdGVhZGAsIHJldHJ5RXJyKTtcblx0XHRcdFx0dGhpcy5fdW5wZXJzaXN0ZWRDaGF0QmFja2luZ3MuYWRkKGJhY2tpbmdTZXNzaW9uU3RyKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogSW5zZXJ0cyBvciB1cGRhdGVzIGEgc2luZ2xlIHBlZXIgY2hhdCBpbiB0aGUgb3JjaGVzdHJhdG9yJ3MgcGVyc2lzdGVkXG5cdCAqIGNhdGFsb2csIHJlY29yZGluZyBpdHMgb3BhcXVlIGBwcm92aWRlckRhdGFgIHZlcmJhdGltIChvciBjbGVhcmluZyBpdCB3aGVuXG5cdCAqIGB1bmRlZmluZWRgKS4gV2hlbiBgb3JpZ2luYCBpcyBzdXBwbGllZCBpdCBpcyBzdG9yZWQgYXMgdGhlIGNoYXQnc1xuXHQgKiBwcm92ZW5hbmNlOyB3aGVuIG9taXR0ZWQgKGUuZy4gYSBwcm92aWRlci1kcml2ZW4gYHByb3ZpZGVyRGF0YWAgcmVmcmVzaCB2aWFcblx0ICoge0BsaW5rIF9vbkNoYXREYXRhQ2hhbmdlZH0pIGFueSBwcmV2aW91c2x5IHBlcnNpc3RlZCBvcmlnaW4gaXMgcHJlc2VydmVkIHNvXG5cdCAqIGEgZGF0YSByZWZyZXNoIG5ldmVyIGRyb3BzIGEgc2lkZSBjaGF0J3Mgc291cmNlIGJvdW5kYXJ5LiBTZXJpYWxpemVkIHBlclxuXHQgKiBzZXNzaW9uIHZpYSB7QGxpbmsgX2VucXVldWVQZWVyQ2hhdENhdGFsb2dXcml0ZX0uXG5cdCAqL1xuXHRwcml2YXRlIF9wZXJzaXN0UGVlckNoYXQoc2Vzc2lvbjogVVJJLCBjaGF0OiBVUkksIHByb3ZpZGVyRGF0YTogc3RyaW5nIHwgdW5kZWZpbmVkLCBvcmlnaW4/OiBDaGF0T3JpZ2luKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2hhdFVyaSA9IGNoYXQudG9TdHJpbmcoKTtcblx0XHRyZXR1cm4gdGhpcy5fZW5xdWV1ZVBlZXJDaGF0Q2F0YWxvZ1dyaXRlKHNlc3Npb24sIGVudHJpZXMgPT4ge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSBlbnRyaWVzLmZpbmQoZW50cnkgPT4gZW50cnkudXJpID09PSBjaGF0VXJpKTtcblx0XHRcdGNvbnN0IGVmZmVjdGl2ZU9yaWdpbiA9IG9yaWdpbiA/PyBleGlzdGluZz8ub3JpZ2luO1xuXHRcdFx0Y29uc3QgbmV4dCA9IGVudHJpZXMuZmlsdGVyKGVudHJ5ID0+IGVudHJ5LnVyaSAhPT0gY2hhdFVyaSk7XG5cdFx0XHRuZXh0LnB1c2goe1xuXHRcdFx0XHR1cmk6IGNoYXRVcmksXG5cdFx0XHRcdC4uLihwcm92aWRlckRhdGEgIT09IHVuZGVmaW5lZCA/IHsgcHJvdmlkZXJEYXRhIH0gOiB7fSksXG5cdFx0XHRcdC4uLihlZmZlY3RpdmVPcmlnaW4gIT09IHVuZGVmaW5lZCA/IHsgb3JpZ2luOiBlZmZlY3RpdmVPcmlnaW4gfSA6IHt9KSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIG5leHQ7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlcyBhIHBlZXIgY2hhdCBmcm9tIHRoZSBvcmNoZXN0cmF0b3IncyBwZXJzaXN0ZWQgY2F0YWxvZy4gU2VyaWFsaXplZFxuXHQgKiBwZXIgc2Vzc2lvbiB2aWEge0BsaW5rIF9lbnF1ZXVlUGVlckNoYXRDYXRhbG9nV3JpdGV9LlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVtb3ZlUGVyc2lzdGVkUGVlckNoYXQoc2Vzc2lvbjogVVJJLCBjaGF0OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjaGF0VXJpID0gY2hhdC50b1N0cmluZygpO1xuXHRcdHJldHVybiB0aGlzLl9lbnF1ZXVlUGVlckNoYXRDYXRhbG9nV3JpdGUoc2Vzc2lvbiwgZW50cmllcyA9PiBlbnRyaWVzLmZpbHRlcihlbnRyeSA9PiBlbnRyeS51cmkgIT09IGNoYXRVcmkpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDaGFpbnMgYSByZWFkLW1vZGlmeS13cml0ZSBvZiBhIHNlc3Npb24ncyBwZXJzaXN0ZWQgcGVlci1jaGF0IGNhdGFsb2dcblx0ICogYmVoaW5kIGFueSBpbi1mbGlnaHQgd3JpdGUgZm9yIHRoZSBzYW1lIHNlc3Npb24sIHNvIGNvbmN1cnJlbnRcblx0ICogY3JlYXRlL2Rpc3Bvc2UvZGF0YS1jaGFuZ2UgdXBkYXRlcyBjYW4ndCBjbG9iYmVyIGVhY2ggb3RoZXIuXG5cdCAqL1xuXHRwcml2YXRlIF9lbnF1ZXVlUGVlckNoYXRDYXRhbG9nV3JpdGUoc2Vzc2lvbjogVVJJLCBtdXRhdGU6IChlbnRyaWVzOiBJUGVyc2lzdGVkUGVlckNoYXRbXSkgPT4gSVBlcnNpc3RlZFBlZXJDaGF0W10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBrZXkgPSBzZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgcHJldmlvdXMgPSB0aGlzLl9wZWVyQ2hhdENhdGFsb2dXcml0ZXMuZ2V0KGtleSkgPz8gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0Y29uc3QgbmV4dCA9IHByZXZpb3VzXG5cdFx0XHQuY2F0Y2goKCkgPT4geyAvKiBhIGZhaWxlZCBwcmlvciB3cml0ZSBtdXN0IG5vdCBibG9jayBsYXRlciBvbmVzICovIH0pXG5cdFx0XHQudGhlbigoKSA9PiB0aGlzLl9hcHBseVBlZXJDaGF0Q2F0YWxvZ1dyaXRlKHNlc3Npb24sIG11dGF0ZSkpO1xuXHRcdGNvbnN0IGNsZWFyID0gKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3BlZXJDaGF0Q2F0YWxvZ1dyaXRlcy5nZXQoa2V5KSA9PT0gdHJhY2tlZCkge1xuXHRcdFx0XHR0aGlzLl9wZWVyQ2hhdENhdGFsb2dXcml0ZXMuZGVsZXRlKGtleSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCB0cmFja2VkID0gbmV4dC50aGVuKGNsZWFyLCBlcnJvciA9PiB7XG5cdFx0XHRjbGVhcigpO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fSk7XG5cdFx0dGhpcy5fcGVlckNoYXRDYXRhbG9nV3JpdGVzLnNldChrZXksIHRyYWNrZWQpO1xuXHRcdHJldHVybiB0cmFja2VkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYXBwbHlQZWVyQ2hhdENhdGFsb2dXcml0ZShzZXNzaW9uOiBVUkksIG11dGF0ZTogKGVudHJpZXM6IElQZXJzaXN0ZWRQZWVyQ2hhdFtdKSA9PiBJUGVyc2lzdGVkUGVlckNoYXRbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlZiA9IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2Uoc2Vzc2lvbik7XG5cdFx0dHJ5IHtcblx0XHRcdGxldCBjdXJyZW50OiBJUGVyc2lzdGVkUGVlckNoYXRbXSA9IFtdO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmF3ID0gYXdhaXQgcmVmLm9iamVjdC5nZXRNZXRhZGF0YShQRUVSX0NIQVRTX01FVEFEQVRBX0tFWSk7XG5cdFx0XHRcdGlmIChyYXcgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KTtcblx0XHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShwYXJzZWQpKSB7XG5cdFx0XHRcdFx0XHRjdXJyZW50ID0gcGFyc2VkXG5cdFx0XHRcdFx0XHRcdC5maWx0ZXIoKGVudHJ5KTogZW50cnkgaXMgSVBlcnNpc3RlZFBlZXJDaGF0ID0+IHR5cGVvZiBlbnRyeT8udXJpID09PSAnc3RyaW5nJylcblx0XHRcdFx0XHRcdFx0Lm1hcChlbnRyeSA9PiAoe1xuXHRcdFx0XHRcdFx0XHRcdHVyaTogZW50cnkudXJpLFxuXHRcdFx0XHRcdFx0XHRcdC4uLih0eXBlb2YgZW50cnkucHJvdmlkZXJEYXRhID09PSAnc3RyaW5nJyA/IHsgcHJvdmlkZXJEYXRhOiBlbnRyeS5wcm92aWRlckRhdGEgfSA6IHt9KSxcblx0XHRcdFx0XHRcdFx0XHQuLi4oZW50cnkub3JpZ2luICE9PSB1bmRlZmluZWQgPyB7IG9yaWdpbjogZW50cnkub3JpZ2luIH0gOiB7fSksXG5cdFx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIFJlcGxhY2luZyBtYWxmb3JtZWQgcGVlci1jaGF0IGNhdGFsb2cgZm9yICR7c2Vzc2lvbi50b1N0cmluZygpfTogJHt0b0Vycm9yTWVzc2FnZShlcnIpfWApO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdXBkYXRlZCA9IG11dGF0ZShjdXJyZW50KTtcblx0XHRcdGF3YWl0IHJlZi5vYmplY3Quc2V0TWV0YWRhdGEoUEVFUl9DSEFUU19NRVRBREFUQV9LRVksIEpTT04uc3RyaW5naWZ5KHVwZGF0ZWQpKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHQvKiogUmVhZHMgYSBjaGF0J3MgcGVyc2lzdGVkIGN1c3RvbSB0aXRsZSAoZGVmYXVsdCBvciBwZWVyIGNoYXQpLCBpZiBhbnkuICovXG5cdHByaXZhdGUgYXN5bmMgX3JlYWRQZXJzaXN0ZWRDaGF0VGl0bGUoc2Vzc2lvbjogVVJJLCBjaGF0VXJpOiBVUkkpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS50cnlPcGVuRGF0YWJhc2U/LihzZXNzaW9uKTtcblx0XHRpZiAoIXJlZikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiAoYXdhaXQgcmVmLm9iamVjdC5nZXRNZXRhZGF0YShgY3VzdG9tQ2hhdFRpdGxlOiR7Y2hhdFVyaS50b1N0cmluZygpfWApKSA/PyB1bmRlZmluZWQ7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldENoYXREcmFmdChzZXNzaW9uOiBVUkksIGNoYXRVcmk6IFVSSSk6IFByb21pc2U8TWVzc2FnZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS50cnlPcGVuRGF0YWJhc2Uoc2Vzc2lvbik7XG5cdFx0aWYgKCFyZWYpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgcmVmLm9iamVjdC5nZXRDaGF0RHJhZnQoY2hhdFVyaSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0U2Vzc2lvbk1ldGFkYXRhRm9yUmVzdG9yZShhZ2VudDogSUFnZW50LCBzZXNzaW9uOiBVUkksIGV4dGVybmFsOiBib29sZWFuKTogUHJvbWlzZTxJQWdlbnRTZXNzaW9uTWV0YWRhdGEgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uU3RyID0gc2Vzc2lvbi50b1N0cmluZygpO1xuXHRcdGNvbnN0IGNoYXQgPSBVUkkucGFyc2UoYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IG1ldGFkYXRhID0gYXdhaXQgYWdlbnQuZ2V0Q2hhdE1ldGFkYXRhKGNoYXQsIHRoaXMuX2NoYXRDb250ZXh0KHNlc3Npb24sIGNoYXQpLCBhd2FpdCB0aGlzLl9yZWFkRGVmYXVsdENoYXRQcm92aWRlckRhdGEoc2Vzc2lvbikpO1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3dpdGhXb3JrdHJlZVByb2plY3Qoc2Vzc2lvbiwgbWV0YWRhdGEgPyB0aGlzLl90b1Nlc3Npb25NZXRhZGF0YShtZXRhZGF0YSkgOiB1bmRlZmluZWQpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKGVyciBpbnN0YW5jZW9mIFByb3RvY29sRXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3dpdGhXb3JrdHJlZVByb2plY3Qoc2Vzc2lvbiwgYXdhaXQgdGhpcy5fZ2V0U2Vzc2lvbk1ldGFkYXRhRnJvbUNhdGFsb2coYWdlbnQsIHNlc3Npb24sIGV4dGVybmFsKSk7XG5cdFx0XHR9IGNhdGNoIChmYWxsYmFja0Vycikge1xuXHRcdFx0XHRpZiAoZmFsbGJhY2tFcnIgaW5zdGFuY2VvZiBQcm90b2NvbEVycm9yKSB7XG5cdFx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKTtcblx0XHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihmYWxsYmFja0Vyci5jb2RlLCBgRmFpbGVkIHRvIGdldCBjaGF0IG1ldGFkYXRhIGZvciAke3Nlc3Npb25TdHJ9OiAke21lc3NhZ2V9OyAke2ZhbGxiYWNrRXJyLm1lc3NhZ2V9YCwgZmFsbGJhY2tFcnIuZGF0YSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgZmFsbGJhY2tFcnI7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIE1lcmdlcyB0aGUgcmVwb3NpdG9yeSBwcm9qZWN0IGZvciBhIHdvcmt0cmVlLWlzb2xhdGVkIHNlc3Npb24gb250byBpdHNcblx0ICogcmVzdG9yZWQgbWV0YWRhdGEgc28gdGhlIHNlc3Npb24gZ3JvdXBzIHVuZGVyIHRoZSByZXBvc2l0b3J5IChub3QgdGhlXG5cdCAqIGA8cmVwbz4ud29ya3RyZWVzLzxuYW1lPmAgZGlyZWN0b3J5KSBpbiB0aGUgc2Vzc2lvbnMgVUkuIE5vLW9wIGZvciBmb2xkZXJcblx0ICogc2Vzc2lvbnMgYW5kIGZvciBgdW5kZWZpbmVkYCBtZXRhZGF0YS4gSG9zdC1vd25lZCBzbyBhZ2VudHMgc3RheSB1bmF3YXJlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfd2l0aFdvcmt0cmVlUHJvamVjdChzZXNzaW9uOiBVUkksIG1ldGE6IElBZ2VudFNlc3Npb25NZXRhZGF0YSB8IHVuZGVmaW5lZCk6IFByb21pc2U8SUFnZW50U2Vzc2lvbk1ldGFkYXRhIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCFtZXRhIHx8ICF0aGlzLl93b3JrdHJlZSkge1xuXHRcdFx0cmV0dXJuIG1ldGE7XG5cdFx0fVxuXHRcdGNvbnN0IHByb2plY3QgPSBhd2FpdCB0aGlzLl93b3JrdHJlZS5yZXNvbHZlV29ya3RyZWVQcm9qZWN0KHNlc3Npb24pO1xuXHRcdHJldHVybiBwcm9qZWN0ID8geyAuLi5tZXRhLCBwcm9qZWN0IH0gOiBtZXRhO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0U2Vzc2lvbk1ldGFkYXRhRnJvbUNhdGFsb2coYWdlbnQ6IElBZ2VudCwgc2Vzc2lvbjogVVJJLCBleHRlcm5hbDogYm9vbGVhbik6IFByb21pc2U8SUFnZW50U2Vzc2lvbk1ldGFkYXRhIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblN0ciA9IHNlc3Npb24udG9TdHJpbmcoKTtcblx0XHRsZXQgYWxsU2Vzc2lvbnM7XG5cdFx0dHJ5IHtcblx0XHRcdGlmIChleHRlcm5hbCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0YWxsU2Vzc2lvbnMgPSBhd2FpdCB0aGlzLl9lbnVtZXJhdGVMZWdhY3lQcm92aWRlclNlc3Npb25zKGFnZW50KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmIChlcnIgaW5zdGFuY2VvZiBQcm90b2NvbEVycm9yKSB7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycik7XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihKU09OX1JQQ19JTlRFUk5BTF9FUlJPUiwgYEZhaWxlZCB0byBsaXN0IHNlc3Npb25zIGZvciAke3Nlc3Npb25TdHJ9OiAke21lc3NhZ2V9YCk7XG5cdFx0fVxuXHRcdHJldHVybiBhbGxTZXNzaW9ucz8uZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLnNlc3Npb24udG9TdHJpbmcoKSA9PT0gc2Vzc2lvblN0cik7XG5cdH1cblxuXHRhc3luYyByZXNvdXJjZVJlYWQodXJpOiBVUkkpOiBQcm9taXNlPFJlc291cmNlUmVhZFJlc3VsdD4ge1xuXHRcdGNvbnN0IGVkaXRBdHRyaWJ1dGlvblJlcXVlc3QgPSBwYXJzZUVkaXRBdHRyaWJ1dGlvblJlc291cmNlKHVyaSk7XG5cdFx0aWYgKGVkaXRBdHRyaWJ1dGlvblJlcXVlc3Q/LmtpbmQgPT09ICdwcmVwYXJlJykge1xuXHRcdFx0Y29uc3QgcHJlcGFyZWQgPSBhd2FpdCB0aGlzLnByZXBhcmVFZGl0QXR0cmlidXRpb25GbHVzaChlZGl0QXR0cmlidXRpb25SZXF1ZXN0LnBhcmFtcyk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkYXRhOiBKU09OLnN0cmluZ2lmeShwcmVwYXJlZCA/PyBudWxsKSxcblx0XHRcdFx0ZW5jb2Rpbmc6IENvbnRlbnRFbmNvZGluZy5VdGY4LFxuXHRcdFx0XHRjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0aWYgKGVkaXRBdHRyaWJ1dGlvblJlcXVlc3Q/LmtpbmQgPT09ICdjb21taXQnKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNvbW1pdEVkaXRBdHRyaWJ1dGlvbkZsdXNoKGVkaXRBdHRyaWJ1dGlvblJlcXVlc3QucGFyYW1zKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRhdGE6IEpTT04uc3RyaW5naWZ5KHJlc3VsdCksXG5cdFx0XHRcdGVuY29kaW5nOiBDb250ZW50RW5jb2RpbmcuVXRmOCxcblx0XHRcdFx0Y29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGlmIChlZGl0QXR0cmlidXRpb25SZXF1ZXN0Py5raW5kID09PSAnY2FuY2VsJykge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5jYW5jZWxFZGl0QXR0cmlidXRpb25GbHVzaChlZGl0QXR0cmlidXRpb25SZXF1ZXN0LnBhcmFtcyk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkYXRhOiBKU09OLnN0cmluZ2lmeShyZXN1bHQpLFxuXHRcdFx0XHRlbmNvZGluZzogQ29udGVudEVuY29kaW5nLlV0ZjgsXG5cdFx0XHRcdGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIEhhbmRsZSBzZXNzaW9uLWRiOiBVUklzIHRoYXQgcmVmZXJlbmNlIGZpbGUtZWRpdCBjb250ZW50IHN0b3JlZFxuXHRcdC8vIGluIGEgcGVyLXNlc3Npb24gU1FMaXRlIGRhdGFiYXNlLlxuXHRcdGNvbnN0IGRiRmllbGRzID0gcGFyc2VTZXNzaW9uRGJVcmkodXJpLnRvU3RyaW5nKCkpO1xuXHRcdGlmIChkYkZpZWxkcykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2ZldGNoU2Vzc2lvbkRiQ29udGVudChkYkZpZWxkcyk7XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIGdpdC1ibG9iOiBVUklzIHRoYXQgcmVmZXJlbmNlIGZpbGUgY29udGVudCBhdCBhIHNwZWNpZmljXG5cdFx0Ly8gZ2l0IGNvbW1pdCAodGhlIG1lcmdlLWJhc2UgdXNlZCBhcyBkaWZmIGJhc2VsaW5lKS4gVGhlIFVSSVxuXHRcdC8vIGVuY29kZXMgdGhlIHNlc3Npb24gaXQgYmVsb25ncyB0byBzbyB3ZSBjYW4gZmluZCB0aGUgcmlnaHRcblx0XHQvLyB3b3JraW5nIGRpcmVjdG9yeSB0byBydW4gYGdpdCBzaG93YCBmcm9tLlxuXHRcdGNvbnN0IGJsb2JGaWVsZHMgPSBwYXJzZUdpdEJsb2JVcmkodXJpLnRvU3RyaW5nKCkpO1xuXHRcdGlmIChibG9iRmllbGRzKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZmV0Y2hHaXRCbG9iQ29udGVudChibG9iRmllbGRzKTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKHVyaSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkYXRhOiBjb250ZW50LnZhbHVlLnRvU3RyaW5nKCksXG5cdFx0XHRcdGVuY29kaW5nOiBDb250ZW50RW5jb2RpbmcuVXRmOCxcblx0XHRcdFx0Y29udGVudFR5cGU6ICd0ZXh0L3BsYWluJyxcblx0XHRcdH07XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc3QgZXJyb3IgPSBlIGluc3RhbmNlb2YgRXJyb3IgPyBlIDogbmV3IEVycm9yKFN0cmluZyhlKSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZXJyb3IpO1xuXHRcdFx0aWYgKHJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBgQ29udGVudCBub3QgZm91bmQ6ICR7dXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfUEVSTUlTU0lPTl9ERU5JRUQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoQWhwRXJyb3JDb2Rlcy5QZXJtaXNzaW9uRGVuaWVkLCBgUGVybWlzc2lvbiBkZW5pZWQ6ICR7dXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihKU09OX1JQQ19JTlRFUk5BTF9FUlJPUiwgYEZhaWxlZCB0byByZWFkIGNvbnRlbnQ6ICR7dXJpLnRvU3RyaW5nKCl9OiAke3RvRXJyb3JNZXNzYWdlKGVycm9yKX1gKTtcblx0XHR9XG5cdH1cblxuXHRwcmVwYXJlRWRpdEF0dHJpYnV0aW9uRmx1c2gocGFyYW1zOiBJUHJlcGFyZUVkaXRBdHRyaWJ1dGlvbkZsdXNoUGFyYW1zKTogUHJvbWlzZTxJUHJlcGFyZWRFZGl0QXR0cmlidXRpb25GbHVzaCB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0QXR0cmlidXRpb25TZXJ2aWNlPy5wcmVwYXJlRmx1c2gocGFyYW1zKSA/PyBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdGNvbW1pdEVkaXRBdHRyaWJ1dGlvbkZsdXNoKHBhcmFtczogSUNvbW1pdEVkaXRBdHRyaWJ1dGlvbkZsdXNoUGFyYW1zKTogUHJvbWlzZTxJRWRpdEF0dHJpYnV0aW9uRmx1c2hSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdEF0dHJpYnV0aW9uU2VydmljZT8uY29tbWl0Rmx1c2gocGFyYW1zKSA/PyBQcm9taXNlLnJlc29sdmUoeyBvdXRjb21lOiAnbWlzc2luZycsIGFnZW50TW9kaWZpZWRDb3VudDogMCB9KTtcblx0fVxuXG5cdGNhbmNlbEVkaXRBdHRyaWJ1dGlvbkZsdXNoKHBhcmFtczogSUNhbmNlbEVkaXRBdHRyaWJ1dGlvbkZsdXNoUGFyYW1zKTogUHJvbWlzZTxJRWRpdEF0dHJpYnV0aW9uRmx1c2hSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fZWRpdEF0dHJpYnV0aW9uU2VydmljZT8uY2FuY2VsRmx1c2gocGFyYW1zKSA/PyBQcm9taXNlLnJlc29sdmUoeyBvdXRjb21lOiAnbWlzc2luZycsIGFnZW50TW9kaWZpZWRDb3VudDogMCB9KTtcblx0fVxuXG5cdGFzeW5jIHJlc291cmNlV3JpdGUocGFyYW1zOiBSZXNvdXJjZVdyaXRlUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZVdyaXRlUmVzdWx0PiB7XG5cdFx0Y29uc3QgZmlsZVVyaSA9IHR5cGVvZiBwYXJhbXMudXJpID09PSAnc3RyaW5nJyA/IFVSSS5wYXJzZShwYXJhbXMudXJpKSA6IFVSSS5yZXZpdmUocGFyYW1zLnVyaSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcmVudCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnN0YXQocmVzb3VyY2VzRGlybmFtZShmaWxlVXJpKSk7XG5cdFx0XHRpZiAoIXBhcmVudC5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBgUGFyZW50IGRpcmVjdG9yeSBub3QgZm91bmQ6ICR7ZmlsZVVyaS50b1N0cmluZygpfWApO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGlmIChlIGluc3RhbmNlb2YgUHJvdG9jb2xFcnJvcikge1xuXHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdG9GaWxlT3BlcmF0aW9uUmVzdWx0KGUgYXMgRXJyb3IpO1xuXHRcdFx0aWYgKHJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1BFUk1JU1NJT05fREVOSUVEKSB7XG5cdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuUGVybWlzc2lvbkRlbmllZCwgYFBlcm1pc3Npb24gZGVuaWVkOiAke2ZpbGVVcmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuTm90Rm91bmQsIGBQYXJlbnQgZGlyZWN0b3J5IG5vdCBmb3VuZDogJHtmaWxlVXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXHRcdGxldCBjb250ZW50OiBWU0J1ZmZlcjtcblx0XHRpZiAocGFyYW1zLmVuY29kaW5nID09PSBDb250ZW50RW5jb2RpbmcuQmFzZTY0KSB7XG5cdFx0XHRjb250ZW50ID0gZGVjb2RlQmFzZTY0KHBhcmFtcy5kYXRhKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29udGVudCA9IFZTQnVmZmVyLmZyb21TdHJpbmcocGFyYW1zLmRhdGEpO1xuXHRcdH1cblx0XHRjb25zdCBtb2RlID0gcGFyYW1zLm1vZGUgPz8gUmVzb3VyY2VXcml0ZU1vZGUuVHJ1bmNhdGU7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSBwYXJhbXMucG9zaXRpb24gPz8gMDtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVzb3VyY2VXcml0ZVF1ZXVlLnF1ZXVlRm9yKGZpbGVVcmksIGFzeW5jICgpID0+IHtcblx0XHRcdFx0aWYgKHBhcmFtcy5pZk1hdGNoICE9PSB1bmRlZmluZWQgfHwgbW9kZSAhPT0gUmVzb3VyY2VXcml0ZU1vZGUuVHJ1bmNhdGUgfHwgcG9zaXRpb24gIT09IDApIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9yZXNvdXJjZVdyaXRlV2l0aE1vZGUoZmlsZVVyaSwgY29udGVudCwgbW9kZSwgcG9zaXRpb24sIHBhcmFtcyk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocGFyYW1zLmNyZWF0ZU9ubHkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9jcmVhdGVGaWxlRXhjbHVzaXZlKGZpbGVVcmksIGNvbnRlbnQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLndyaXRlRmlsZShmaWxlVXJpLCBjb250ZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UpO1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGlmIChlIGluc3RhbmNlb2YgUHJvdG9jb2xFcnJvcikge1xuXHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdG9GaWxlT3BlcmF0aW9uUmVzdWx0KGUgYXMgRXJyb3IpO1xuXHRcdFx0aWYgKHBhcmFtcy5jcmVhdGVPbmx5ICYmIChyZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT0RJRklFRF9TSU5DRSB8fCByZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT1ZFX0NPTkZMSUNUKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLkFscmVhZHlFeGlzdHMsIGBGaWxlIGFscmVhZHkgZXhpc3RzOiAke2ZpbGVVcmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdH1cblx0XHRcdGlmIChyZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT0RJRklFRF9TSU5DRSkge1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlID0gcGFyYW1zLmlmTWF0Y2ggIT09IHVuZGVmaW5lZFxuXHRcdFx0XHRcdD8gYGlmTWF0Y2ggcHJlY29uZGl0aW9uIGZhaWxlZCBmb3I6ICR7ZmlsZVVyaS50b1N0cmluZygpfWBcblx0XHRcdFx0XHQ6IGBGaWxlIGNoYW5nZWQgd2hpbGUgd3JpdGluZzogJHtmaWxlVXJpLnRvU3RyaW5nKCl9YDtcblx0XHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoQWhwRXJyb3JDb2Rlcy5Db25mbGljdCwgbWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTU9WRV9DT05GTElDVCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLkFscmVhZHlFeGlzdHMsIGBGaWxlIGFscmVhZHkgZXhpc3RzOiAke2ZpbGVVcmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdH1cblx0XHRcdGlmIChyZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9QRVJNSVNTSU9OX0RFTklFRCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLlBlcm1pc3Npb25EZW5pZWQsIGBQZXJtaXNzaW9uIGRlbmllZDogJHtmaWxlVXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBgRmFpbGVkIHRvIHdyaXRlIGZpbGU6ICR7ZmlsZVVyaS50b1N0cmluZygpfWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NyZWF0ZUZpbGVFeGNsdXNpdmUoZmlsZVVyaTogVVJJLCBjb250ZW50OiBWU0J1ZmZlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChmaWxlVXJpLnNjaGVtZSAhPT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5jcmVhdGVGaWxlKGZpbGVVcmksIGNvbnRlbnQsIHsgb3ZlcndyaXRlOiBmYWxzZSB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgaGFuZGxlOiBGaWxlSGFuZGxlO1xuXHRcdHRyeSB7XG5cdFx0XHRoYW5kbGUgPSBhd2FpdCBvcGVuKGZpbGVVcmkuZnNQYXRoLCAnd3gnKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKGlzRXJyb3JXaXRoQ29kZShlcnJvciwgJ0VFWElTVCcpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuQWxyZWFkeUV4aXN0cywgYEZpbGUgYWxyZWFkeSBleGlzdHM6ICR7ZmlsZVVyaS50b1N0cmluZygpfWApO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXG5cdFx0bGV0IGZhaWx1cmU6IHVua25vd247XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGhhbmRsZS53cml0ZUZpbGUoY29udGVudC5idWZmZXIpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRmYWlsdXJlID0gZXJyb3I7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBoYW5kbGUuY2xvc2UoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0ZmFpbHVyZSA9IGZhaWx1cmUgPyBuZXcgQWdncmVnYXRlRXJyb3IoW2ZhaWx1cmUsIGVycm9yXSkgOiBlcnJvcjtcblx0XHR9XG5cdFx0aWYgKGZhaWx1cmUpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHVubGluayhmaWxlVXJpLmZzUGF0aCk7XG5cdFx0XHR9IGNhdGNoIChjbGVhbnVwRXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEFnZ3JlZ2F0ZUVycm9yKFtmYWlsdXJlLCBjbGVhbnVwRXJyb3JdLCBgRmFpbGVkIHRvIGNyZWF0ZSBhbmQgY2xlYW4gdXAgZmlsZTogJHtmaWxlVXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBmYWlsdXJlO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTbG93LXBhdGggZm9yIHtAbGluayByZXNvdXJjZVdyaXRlfSB3aGVuIHRoZSBjYWxsZXIgcmVxdWVzdGVkIGFcblx0ICogbm9uLWRlZmF1bHQge0BsaW5rIFJlc291cmNlV3JpdGVNb2RlfSwgc3VwcGxpZWQgYSBgcG9zaXRpb25gLCBvclxuXHQgKiBwcm92aWRlZCBhbiBgaWZNYXRjaGAgZXRhZyBwcmVjb25kaXRpb24uIFJlYWRzIHRoZSBjdXJyZW50IGZpbGVcblx0ICogY29udGVudHMgKHdoZW4gbmVlZGVkKSBhbmQgcHJvZHVjZXMgYSBzaW5nbGUgYHdyaXRlRmlsZWAgY2FsbCB0aGF0XG5cdCAqIHJlYWxpc2VzIHRoZSByZXF1ZXN0ZWQgc3BsaWNlLiBBIG1pc3NpbmcgZmlsZSBpcyB0cmVhdGVkIGFzXG5cdCAqIGVtcHR5IGZvciBgYXBwZW5kYCBhbmQgYGluc2VydGAgKHNvIHRoZSBvcGVyYXRpb24gYmVoYXZlcyBsaWtlIGFcblx0ICogY3JlYXRlKTsgZm9yIGB0cnVuY2F0ZWAgaXQgZmFsbHMgdGhyb3VnaCB0byBhIG5vcm1hbCB3cml0ZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc291cmNlV3JpdGVXaXRoTW9kZShcblx0XHRmaWxlVXJpOiBVUkksXG5cdFx0ZGF0YTogVlNCdWZmZXIsXG5cdFx0bW9kZTogUmVzb3VyY2VXcml0ZU1vZGUsXG5cdFx0cG9zaXRpb246IG51bWJlcixcblx0XHRwYXJhbXM6IFJlc291cmNlV3JpdGVQYXJhbXMsXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBleGlzdGluZzogVlNCdWZmZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGN1cnJlbnRFdGFnOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGN1cnJlbnRNdGltZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmaWxlID0gYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUoZmlsZVVyaSk7XG5cdFx0XHRleGlzdGluZyA9IGZpbGUudmFsdWU7XG5cdFx0XHRjdXJyZW50RXRhZyA9IGZpbGUuZXRhZztcblx0XHRcdGN1cnJlbnRNdGltZSA9IGZpbGUubXRpbWU7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlIGFzIEVycm9yKSAhPT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChwYXJhbXMuY3JlYXRlT25seSAmJiBleGlzdGluZyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLkFscmVhZHlFeGlzdHMsIGBGaWxlIGFscmVhZHkgZXhpc3RzOiAke2ZpbGVVcmkudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cblx0XHRpZiAocGFyYW1zLmlmTWF0Y2ggIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gTWlzc2luZyBmaWxlIHdpdGggYW4gaWZNYXRjaCBpcyBhbHdheXMgYSBjb25mbGljdCAodGhlIGNhbGxlclxuXHRcdFx0Ly8gYmVsaWV2ZWQgdGhleSBoYWQgdGhlIGV0YWcgZm9yIGFuIGV4aXN0aW5nIGZpbGUpLlxuXHRcdFx0aWYgKGV4aXN0aW5nID09PSB1bmRlZmluZWQgfHwgY3VycmVudEV0YWcgIT09IHBhcmFtcy5pZk1hdGNoKSB7XG5cdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuQ29uZmxpY3QsIGBpZk1hdGNoIHByZWNvbmRpdGlvbiBmYWlsZWQgZm9yOiAke2ZpbGVVcmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBiYXNlID0gZXhpc3RpbmcgPz8gVlNCdWZmZXIuYWxsb2MoMCk7XG5cdFx0bGV0IG5leHQ6IFZTQnVmZmVyO1xuXHRcdHN3aXRjaCAobW9kZSkge1xuXHRcdFx0Y2FzZSBSZXNvdXJjZVdyaXRlTW9kZS5BcHBlbmQ6IHtcblx0XHRcdFx0Y29uc3QgZW9mID0gYmFzZS5ieXRlTGVuZ3RoO1xuXHRcdFx0XHRjb25zdCBzcGxpdEF0ID0gTWF0aC5tYXgoMCwgZW9mIC0gcG9zaXRpb24pO1xuXHRcdFx0XHRuZXh0ID0gVlNCdWZmZXIuY29uY2F0KFtiYXNlLnNsaWNlKDAsIHNwbGl0QXQpLCBkYXRhLCBiYXNlLnNsaWNlKHNwbGl0QXQsIGVvZildKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFJlc291cmNlV3JpdGVNb2RlLkluc2VydDoge1xuXHRcdFx0XHRjb25zdCBzcGxpdEF0ID0gTWF0aC5taW4ocG9zaXRpb24sIGJhc2UuYnl0ZUxlbmd0aCk7XG5cdFx0XHRcdG5leHQgPSBWU0J1ZmZlci5jb25jYXQoW2Jhc2Uuc2xpY2UoMCwgc3BsaXRBdCksIGRhdGEsIGJhc2Uuc2xpY2Uoc3BsaXRBdCwgYmFzZS5ieXRlTGVuZ3RoKV0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgUmVzb3VyY2VXcml0ZU1vZGUuVHJ1bmNhdGU6XG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdGNvbnN0IHNwbGl0QXQgPSBNYXRoLm1pbihwb3NpdGlvbiwgYmFzZS5ieXRlTGVuZ3RoKTtcblx0XHRcdFx0bmV4dCA9IFZTQnVmZmVyLmNvbmNhdChbYmFzZS5zbGljZSgwLCBzcGxpdEF0KSwgZGF0YV0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHBhcmFtcy5jcmVhdGVPbmx5KSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9jcmVhdGVGaWxlRXhjbHVzaXZlKGZpbGVVcmksIG5leHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS53cml0ZUZpbGUoZmlsZVVyaSwgbmV4dCwgeyBldGFnOiBjdXJyZW50RXRhZywgbXRpbWU6IGN1cnJlbnRNdGltZSB9KTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZXNvdXJjZUNvcHkocGFyYW1zOiBSZXNvdXJjZUNvcHlQYXJhbXMpOiBQcm9taXNlPFJlc291cmNlQ29weVJlc3VsdD4ge1xuXHRcdGNvbnN0IHNvdXJjZSA9IFVSSS5wYXJzZShwYXJhbXMuc291cmNlKTtcblx0XHRjb25zdCBkZXN0aW5hdGlvbiA9IFVSSS5wYXJzZShwYXJhbXMuZGVzdGluYXRpb24pO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5jb3B5KHNvdXJjZSwgZGVzdGluYXRpb24sICFwYXJhbXMuZmFpbElmRXhpc3RzKTtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZSBhcyBFcnJvcik7XG5cdFx0XHRpZiAocmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTU9WRV9DT05GTElDVCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLkFscmVhZHlFeGlzdHMsIGBEZXN0aW5hdGlvbiBhbHJlYWR5IGV4aXN0czogJHtkZXN0aW5hdGlvbi50b1N0cmluZygpfWApO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1BFUk1JU1NJT05fREVOSUVEKSB7XG5cdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuUGVybWlzc2lvbkRlbmllZCwgYFBlcm1pc3Npb24gZGVuaWVkOiAke3NvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoQWhwRXJyb3JDb2Rlcy5Ob3RGb3VuZCwgYFNvdXJjZSBub3QgZm91bmQ6ICR7c291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVzb3VyY2VEZWxldGUocGFyYW1zOiBSZXNvdXJjZURlbGV0ZVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VEZWxldGVSZXN1bHQ+IHtcblx0XHRjb25zdCBmaWxlVXJpID0gVVJJLnBhcnNlKHBhcmFtcy51cmkpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5kZWwoZmlsZVVyaSwgeyByZWN1cnNpdmU6IHBhcmFtcy5yZWN1cnNpdmUgfSk7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlIGFzIEVycm9yKSA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1BFUk1JU1NJT05fREVOSUVEKSB7XG5cdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuUGVybWlzc2lvbkRlbmllZCwgYFBlcm1pc3Npb24gZGVuaWVkOiAke2ZpbGVVcmkudG9TdHJpbmcoKX1gKTtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuTm90Rm91bmQsIGBSZXNvdXJjZSBub3QgZm91bmQ6ICR7ZmlsZVVyaS50b1N0cmluZygpfWApO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlc291cmNlTW92ZShwYXJhbXM6IFJlc291cmNlTW92ZVBhcmFtcyk6IFByb21pc2U8UmVzb3VyY2VNb3ZlUmVzdWx0PiB7XG5cdFx0Y29uc3Qgc291cmNlID0gVVJJLnBhcnNlKHBhcmFtcy5zb3VyY2UpO1xuXHRcdGNvbnN0IGRlc3RpbmF0aW9uID0gVVJJLnBhcnNlKHBhcmFtcy5kZXN0aW5hdGlvbik7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLm1vdmUoc291cmNlLCBkZXN0aW5hdGlvbiwgIXBhcmFtcy5mYWlsSWZFeGlzdHMpO1xuXHRcdFx0cmV0dXJuIHt9O1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRvRmlsZU9wZXJhdGlvblJlc3VsdChlIGFzIEVycm9yKTtcblx0XHRcdGlmIChyZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9NT1ZFX0NPTkZMSUNUKSB7XG5cdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuQWxyZWFkeUV4aXN0cywgYERlc3RpbmF0aW9uIGFscmVhZHkgZXhpc3RzOiAke2Rlc3RpbmF0aW9uLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzdWx0ID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfUEVSTUlTU0lPTl9ERU5JRUQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoQWhwRXJyb3JDb2Rlcy5QZXJtaXNzaW9uRGVuaWVkLCBgUGVybWlzc2lvbiBkZW5pZWQ6ICR7c291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBgU291cmNlIG5vdCBmb3VuZDogJHtzb3VyY2UudG9TdHJpbmcoKX1gKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZXNvdXJjZVJlc29sdmUocGFyYW1zOiBSZXNvdXJjZVJlc29sdmVQYXJhbXMpOiBQcm9taXNlPFJlc291cmNlUmVzb2x2ZVJlc3VsdD4ge1xuXHRcdGNvbnN0IHVyaSA9IHR5cGVvZiBwYXJhbXMudXJpID09PSAnc3RyaW5nJyA/IFVSSS5wYXJzZShwYXJhbXMudXJpKSA6IFVSSS5yZXZpdmUocGFyYW1zLnVyaSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5zdGF0KHVyaSk7XG5cdFx0XHRsZXQgdHlwZTogUmVzb3VyY2VUeXBlO1xuXHRcdFx0aWYgKHN0YXQuaXNTeW1ib2xpY0xpbmsgJiYgcGFyYW1zLmZvbGxvd1N5bWxpbmtzID09PSBmYWxzZSkge1xuXHRcdFx0XHQvLyBgSUZpbGVTZXJ2aWNlLnN0YXRgIGFsd2F5cyBmb2xsb3dzIHN5bWxpbmtzIGluIGl0c1xuXHRcdFx0XHQvLyB0eXBlLWNsYXNzaWZpY2F0aW9uIGxvZ2ljLCBzbyBgZm9sbG93U3ltbGlua3M6IGZhbHNlYFxuXHRcdFx0XHQvLyBvbmx5IGNoYW5nZXMgaG93IHdlIHJlcG9ydCB0aGUgcmVzdWx0IFx1MjAxNCB3ZSBzdXJmYWNlIHRoZVxuXHRcdFx0XHQvLyBsaW5rIGl0c2VsZiByYXRoZXIgdGhhbiB0aGUgdGFyZ2V0LlxuXHRcdFx0XHR0eXBlID0gUmVzb3VyY2VUeXBlLlN5bWxpbms7XG5cdFx0XHR9IGVsc2UgaWYgKHN0YXQuaXNEaXJlY3RvcnkpIHtcblx0XHRcdFx0dHlwZSA9IFJlc291cmNlVHlwZS5EaXJlY3Rvcnk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0eXBlID0gUmVzb3VyY2VUeXBlLkZpbGU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXN1bHQ6IFJlc291cmNlUmVzb2x2ZVJlc3VsdCA9IHtcblx0XHRcdFx0dXJpOiB1cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0dHlwZSxcblx0XHRcdFx0Li4uKHN0YXQuc2l6ZSAhPT0gdW5kZWZpbmVkID8geyBzaXplOiBzdGF0LnNpemUgfSA6IHt9KSxcblx0XHRcdFx0Li4uKHN0YXQubXRpbWUgIT09IHVuZGVmaW5lZCA/IHsgbXRpbWU6IG5ldyBEYXRlKHN0YXQubXRpbWUpLnRvSVNPU3RyaW5nKCkgfSA6IHt9KSxcblx0XHRcdFx0Li4uKHN0YXQuY3RpbWUgIT09IHVuZGVmaW5lZCA/IHsgY3RpbWU6IG5ldyBEYXRlKHN0YXQuY3RpbWUpLnRvSVNPU3RyaW5nKCkgfSA6IHt9KSxcblx0XHRcdFx0Li4uKHN0YXQuZXRhZyA/IHsgZXRhZzogc3RhdC5ldGFnIH0gOiB7fSksXG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRpZiAodG9GaWxlT3BlcmF0aW9uUmVzdWx0KGUgYXMgRXJyb3IpID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfUEVSTUlTU0lPTl9ERU5JRUQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoQWhwRXJyb3JDb2Rlcy5QZXJtaXNzaW9uRGVuaWVkLCBgUGVybWlzc2lvbiBkZW5pZWQ6ICR7dXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBgUmVzb3VyY2Ugbm90IGZvdW5kOiAke3VyaS50b1N0cmluZygpfWApO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHJlc291cmNlTWtkaXIocGFyYW1zOiBSZXNvdXJjZU1rZGlyUGFyYW1zKTogUHJvbWlzZTxSZXNvdXJjZU1rZGlyUmVzdWx0PiB7XG5cdFx0Y29uc3QgdXJpID0gdHlwZW9mIHBhcmFtcy51cmkgPT09ICdzdHJpbmcnID8gVVJJLnBhcnNlKHBhcmFtcy51cmkpIDogVVJJLnJldml2ZShwYXJhbXMudXJpKTtcblx0XHR0cnkge1xuXHRcdFx0Ly8gYElGaWxlU2VydmljZS5jcmVhdGVGb2xkZXJgIGlzIGlkZW1wb3RlbnQgZm9yIGFuIGV4aXN0aW5nXG5cdFx0XHQvLyBkaXJlY3RvcnkgYW5kIGNyZWF0ZXMgcGFyZW50cyBhcyBuZWVkZWQsIG1hdGNoaW5nIHRoZVxuXHRcdFx0Ly8gYG1rZGlyIC1wYCBzZW1hbnRpY3MgcmVxdWlyZWQgYnkgdGhlIHNwZWMuXG5cdFx0XHRjb25zdCBleGlzdGluZyA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnN0YXQodXJpKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKGV4aXN0aW5nICYmICFleGlzdGluZy5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLkFscmVhZHlFeGlzdHMsIGBQYXRoIGV4aXN0cyBhbmQgaXMgbm90IGEgZGlyZWN0b3J5OiAke3VyaS50b1N0cmluZygpfWApO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKHVyaSk7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0aWYgKGUgaW5zdGFuY2VvZiBQcm90b2NvbEVycm9yKSB7XG5cdFx0XHRcdHRocm93IGU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodG9GaWxlT3BlcmF0aW9uUmVzdWx0KGUgYXMgRXJyb3IpID09PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfUEVSTUlTU0lPTl9ERU5JRUQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoQWhwRXJyb3JDb2Rlcy5QZXJtaXNzaW9uRGVuaWVkLCBgUGVybWlzc2lvbiBkZW5pZWQ6ICR7dXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBgRmFpbGVkIHRvIGNyZWF0ZSBkaXJlY3Rvcnk6ICR7dXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgY3JlYXRlUmVzb3VyY2VXYXRjaChwYXJhbXM6IENyZWF0ZVJlc291cmNlV2F0Y2hQYXJhbXMpOiBQcm9taXNlPENyZWF0ZVJlc291cmNlV2F0Y2hSZXN1bHQ+IHtcblx0XHRjb25zdCByb290ID0gdHlwZW9mIHBhcmFtcy51cmkgPT09ICdzdHJpbmcnID8gVVJJLnBhcnNlKHBhcmFtcy51cmkpIDogVVJJLnJldml2ZShwYXJhbXMudXJpKTtcblx0XHQvLyBWZXJpZnkgdGhlIFVSSSBleGlzdHMgYmVmb3JlIHdlIG1pbnQgYSBjaGFubmVsOyBzcGVjIHJlcXVpcmVzXG5cdFx0Ly8gYE5vdEZvdW5kYCB3aGVuIHRoZSBVUkkgaXMgbWlzc2luZyByYXRoZXIgdGhhbiBzaWxlbnRseSBwcm9kdWNpbmdcblx0XHQvLyBhIHdhdGNoZXIgdGhhdCB3aWxsIG5ldmVyIGZpcmUuIFRoZSB3YXRjaGVyIGl0c2VsZiBpcyBub3Rcblx0XHQvLyBhdHRhY2hlZCBoZXJlIFx1MjAxNCBlbmNvZGluZyB0aGUgZGVzY3JpcHRvciBpbnRvIHRoZSBjaGFubmVsIFVSSVxuXHRcdC8vIGxldHMgYHN1YnNjcmliZWAgbWF0ZXJpYWxpc2UgdGhlIHVuZGVybHlpbmcgSUZpbGVTZXJ2aWNlXG5cdFx0Ly8gd2F0Y2hlciBsYXppbHkgb24gdGhlIGZpcnN0IHN1YnNjcmliZXIsIGFuZCB0ZWFyIGl0IGRvd24gYWdhaW5cblx0XHQvLyBhZnRlciB0aGUgbGFzdCB1bnN1YnNjcmliZSAod2l0aCBhIGdyYWNlIHdpbmRvdykuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnN0YXQocm9vdCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlIGFzIEVycm9yKSA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX1BFUk1JU1NJT05fREVOSUVEKSB7XG5cdFx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuUGVybWlzc2lvbkRlbmllZCwgYFBlcm1pc3Npb24gZGVuaWVkOiAke3Jvb3QudG9TdHJpbmcoKX1gKTtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuTm90Rm91bmQsIGBSZXNvdXJjZSBub3QgZm91bmQ6ICR7cm9vdC50b1N0cmluZygpfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYW5uZWwgPSBidWlsZFJlc291cmNlV2F0Y2hDaGFubmVsVXJpKHtcblx0XHRcdHJvb3Q6IHJvb3QudG9TdHJpbmcoKSxcblx0XHRcdHJlY3Vyc2l2ZTogcGFyYW1zLnJlY3Vyc2l2ZSA9PT0gdHJ1ZSxcblx0XHRcdGV4Y2x1ZGVzOiBwYXJhbXMuZXhjbHVkZXMsXG5cdFx0XHRpbmNsdWRlczogcGFyYW1zLmluY2x1ZGVzLFxuXHRcdH0pO1xuXHRcdHJldHVybiB7IGNoYW5uZWwgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBOb3RpZmllcyB0aGUgYWdlbnQgc2VydmljZSB0aGF0IGEgY2xpZW50IHN1YnNjcmliZWQgdG8gYSByZXNvdXJjZVxuXHQgKiB3YXRjaCBjaGFubmVsLiBPbiB0aGUgZmlyc3Qgc3Vic2NyaWJlciB0aGUgdW5kZXJseWluZ1xuXHQgKiB7QGxpbmsgSUZpbGVTZXJ2aWNlfSB3YXRjaGVyIGlzIGF0dGFjaGVkOyBzdWJzZXF1ZW50IHN1YnNjcmliZXJzXG5cdCAqIGJ1bXAgdGhlIHJlZmNvdW50IGFuZCBjYW5jZWwgYW55IHBlbmRpbmcgZ3JhY2UgZGlzcG9zZS4gUmV0dXJuc1xuXHQgKiB0aGUgZGVjb2RlZCBkZXNjcmlwdG9yIGZvciB1c2UgYXMgdGhlIHN1YnNjcmliZSBzbmFwc2hvdCwgb3Jcblx0ICogYHVuZGVmaW5lZGAgd2hlbiBgY2hhbm5lbGAgaXMgbm90IGEgcmVjb2duaXNhYmxlXG5cdCAqIGBhaHAtcmVzb3VyY2Utd2F0Y2g6YCBVUkkuXG5cdCAqL1xuXHRvblJlc291cmNlV2F0Y2hTdWJzY3JpYmVkKGNoYW5uZWw6IHN0cmluZyk6IFJlc291cmNlV2F0Y2hTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZGVzY3JpcHRvciA9IHBhcnNlUmVzb3VyY2VXYXRjaENoYW5uZWxVcmkoY2hhbm5lbCk7XG5cdFx0aWYgKCFkZXNjcmlwdG9yKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3Jlc291cmNlV2F0Y2hlcy5nZXQoY2hhbm5lbCk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRleGlzdGluZy5zdWJzY3JpYmVycysrO1xuXHRcdFx0aWYgKGV4aXN0aW5nLnBlbmRpbmdHYykge1xuXHRcdFx0XHRleGlzdGluZy5wZW5kaW5nR2MuY2xlYXIoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBleGlzdGluZy5kZXNjcmlwdG9yO1xuXHRcdH1cblx0XHQvLyBGaXJzdCBzdWJzY3JpYmVyIFx1MjAxNCBtYXRlcmlhbGlzZSB0aGUgSUZpbGVTZXJ2aWNlIHdhdGNoZXIuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJvb3QgPSBVUkkucGFyc2UoZGVzY3JpcHRvci5yb290KTtcblx0XHRcdGNvbnN0IHdhdGNoT3B0aW9ucyA9IHtcblx0XHRcdFx0cmVjdXJzaXZlOiBkZXNjcmlwdG9yLnJlY3Vyc2l2ZSxcblx0XHRcdFx0ZXhjbHVkZXM6IGRlc2NyaXB0b3IuZXhjbHVkZXM/Lml0ZW1zID8/IFtdLFxuXHRcdFx0XHRpbmNsdWRlczogZGVzY3JpcHRvci5pbmNsdWRlcz8uaXRlbXMsXG5cdFx0XHR9O1xuXHRcdFx0aWYgKGRlc2NyaXB0b3IucmVjdXJzaXZlKSB7XG5cdFx0XHRcdC8vIENvcnJlbGF0ZWQgd2F0Y2hlcnMgYXJlIG5vbi1yZWN1cnNpdmUgb25seSwgc28gcmVnaXN0ZXJcblx0XHRcdFx0Ly8gYW4gdW5jb3JyZWxhdGVkIHJlY3Vyc2l2ZSB3YXRjaCBhbmQgZmlsdGVyIHRoZSBnbG9iYWxcblx0XHRcdFx0Ly8gc3RyZWFtIGJ5IGRlc2NlbmRhbnRzIG9mIHRoZSB3YXRjaGVkIHJvb3QuXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLl9maWxlU2VydmljZS53YXRjaChyb290LCB3YXRjaE9wdGlvbnMpKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2ZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UoZXZlbnQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGZpbHRlcmVkID0gY29sbGVjdENoYW5nZXNVbmRlclJvb3QoZXZlbnQsIHJvb3QpO1xuXHRcdFx0XHRcdGlmIChmaWx0ZXJlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9kaXNwYXRjaFJlc291cmNlV2F0Y2hDaGFuZ2VzKGNoYW5uZWwsIGZpbHRlcmVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHdhdGNoZXIgPSB0aGlzLl9maWxlU2VydmljZS5jcmVhdGVXYXRjaGVyKHJvb3QsIHsgLi4ud2F0Y2hPcHRpb25zLCByZWN1cnNpdmU6IGZhbHNlIH0pO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQod2F0Y2hlcik7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh3YXRjaGVyLm9uRGlkQ2hhbmdlKGV2ZW50ID0+IHtcblx0XHRcdFx0XHR0aGlzLl9kaXNwYXRjaFJlc291cmNlV2F0Y2hDaGFuZ2VzKGNoYW5uZWwsIGNvbGxlY3RDaGFuZ2VzKGV2ZW50KSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIEZhaWxlZCB0byBzdGFydCBJRmlsZVNlcnZpY2Ugd2F0Y2hlciBmb3IgJHtjaGFubmVsfTogJHtlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSl9YCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9yZXNvdXJjZVdhdGNoZXMuc2V0KGNoYW5uZWwsIHtcblx0XHRcdGNoYW5uZWwsXG5cdFx0XHRkZXNjcmlwdG9yLFxuXHRcdFx0c3Vic2NyaWJlcnM6IDEsXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdHBlbmRpbmdHYzogZGlzcG9zYWJsZXMuYWRkKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSxcblx0XHR9KTtcblx0XHRyZXR1cm4gZGVzY3JpcHRvcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb3VudGVycGFydCB0byB7QGxpbmsgb25SZXNvdXJjZVdhdGNoU3Vic2NyaWJlZH0uIERlY3JlbWVudHMgdGhlXG5cdCAqIHN1YnNjcmliZXIgcmVmY291bnQgZm9yIGEgd2F0Y2ggY2hhbm5lbDsgd2hlbiBpdCByZWFjaGVzIHplcm8gdGhlXG5cdCAqIHdhdGNoZXIgaXMgaGVsZCBmb3Ige0BsaW5rIFJFU09VUkNFX1dBVENIX0dSQUNFX01TfSBiZWZvcmUgYmVpbmdcblx0ICogZGlzcG9zZWQsIGdpdmluZyBhIHRyYW5zaWVudCBkaXNjb25uZWN0IHRpbWUgdG8gcmVzdWJzY3JpYmUuXG5cdCAqL1xuXHRvblJlc291cmNlV2F0Y2hVbnN1YnNjcmliZWQoY2hhbm5lbDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9yZXNvdXJjZVdhdGNoZXMuZ2V0KGNoYW5uZWwpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0ZW50cnkuc3Vic2NyaWJlcnMgPSBNYXRoLm1heCgwLCBlbnRyeS5zdWJzY3JpYmVycyAtIDEpO1xuXHRcdGlmIChlbnRyeS5zdWJzY3JpYmVycyA+IDApIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRlbnRyeS5wZW5kaW5nR2MudmFsdWUgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fcmVzb3VyY2VXYXRjaGVzLmdldChjaGFubmVsKTtcblx0XHRcdGlmICghY3VycmVudCB8fCBjdXJyZW50LnN1YnNjcmliZXJzID4gMCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9yZXNvdXJjZVdhdGNoZXMuZGVsZXRlQW5kRGlzcG9zZShjaGFubmVsKTtcblx0XHR9LCBSRVNPVVJDRV9XQVRDSF9HUkFDRV9NUyk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9kaXNwYXRjaFJlc291cmNlV2F0Y2hDaGFuZ2VzKGNoYW5uZWw6IHN0cmluZywgcmF3OiByZWFkb25seSBJRmlsZUNoYW5nZVtdKTogdm9pZCB7XG5cdFx0aWYgKHJhdy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaXRlbXMgPSByYXcubWFwKGMgPT4gKHtcblx0XHRcdHVyaTogYy5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0dHlwZTogYy50eXBlID09PSBGaWxlQ2hhbmdlVHlwZS5BRERFRCA/IFJlc291cmNlQ2hhbmdlVHlwZS5BZGRlZFxuXHRcdFx0XHQ6IGMudHlwZSA9PT0gRmlsZUNoYW5nZVR5cGUuREVMRVRFRCA/IFJlc291cmNlQ2hhbmdlVHlwZS5EZWxldGVkXG5cdFx0XHRcdFx0OiBSZXNvdXJjZUNoYW5nZVR5cGUuVXBkYXRlZCxcblx0XHR9KSk7XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGNoYW5uZWwsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUmVzb3VyY2VXYXRjaENoYW5nZWQsXG5cdFx0XHRjaGFuZ2VzOiB7IGl0ZW1zIH0sXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBzaHV0ZG93bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oJ0FnZW50U2VydmljZTogc2h1dHRpbmcgZG93biBhbGwgcHJvdmlkZXJzLi4uJyk7XG5cdFx0Y29uc3QgcHJvbWlzZXM6IFByb21pc2U8dm9pZD5bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5fcHJvdmlkZXJzLnZhbHVlcygpKSB7XG5cdFx0XHRwcm9taXNlcy5wdXNoKHByb3ZpZGVyLnNodXRkb3duKCkpO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZChwcm9taXNlcyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IHRoaXMuX29yY2hlc3RyYXRvckRhdGFiYXNlLmNsb3NlKCk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uVG9Qcm92aWRlci5jbGVhcigpO1xuXHRcdFx0dGhpcy5fZG93bmxvYWRQcm9ncmVzc0ludGVyZXN0LmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFdpcmUgdGhlIG5ldHdvcmsgZGlhZ25vc3RpY3Mgc2VydmljZSBiYWNraW5nIHtAbGluayBnZXROZXR3b3JrRGlhZ25vc3RpY3NJbmZvfVxuXHQgKiBhbmQge0BsaW5rIGRpYWdub3N0aWNzRmV0Y2h9LiBBIHNldHRlciByYXRoZXIgdGhhbiBhIGNvbnN0cnVjdG9yIGFyZ3VtZW50XG5cdCAqIGJlY2F1c2UgdGhlIHNlcnZpY2UgZGVwZW5kcyBvbiB0aGUgYWdlbnQtaG9zdCBwcm94eSByZXNvbHZlciwgd2hpY2ggdGhlXG5cdCAqIHJlbW90ZSBzZXJ2ZXIgY29uc3RydWN0cyBsYXppbHkgXHUyMDE0IGFmdGVyIHRoaXMgc2VydmljZS5cblx0ICovXG5cdHNldE5ldHdvcmtEaWFnbm9zdGljc1NlcnZpY2Uoc2VydmljZTogSU5ldHdvcmtEaWFnbm9zdGljc1NlcnZpY2UpOiB2b2lkIHtcblx0XHR0aGlzLl9uZXR3b3JrRGlhZ25vc3RpY3MgPSBzZXJ2aWNlO1xuXHR9XG5cblx0c2V0RWRpdEF0dHJpYnV0aW9uU2VydmljZShzZXJ2aWNlOiBJQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlKTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdEF0dHJpYnV0aW9uU2VydmljZSA9IHNlcnZpY2U7XG5cdFx0c2VydmljZS5zZXRFbmFibGVkKHRoaXMuX3N0YXRlTWFuYWdlci5yb290U3RhdGUuY29uZmlnPy52YWx1ZXNbQWdlbnRIb3N0RWRpdFRlbGVtZXRyeUVuYWJsZWRDb25maWdLZXldICE9PSBmYWxzZSk7XG5cdH1cblxuXHRhc3luYyBnZXROZXR3b3JrRGlhZ25vc3RpY3NJbmZvKCk6IFByb21pc2U8SUFnZW50SG9zdE5ldHdvcmtEaWFnbm9zdGljc0luZm8+IHtcblx0XHRpZiAoIXRoaXMuX25ldHdvcmtEaWFnbm9zdGljcykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdOZXR3b3JrIGRpYWdub3N0aWNzIHVuYXZhaWxhYmxlOiBzZXJ2aWNlIG5vdCB3aXJlZCcpO1xuXHRcdH1cblx0XHRjb25zdCBwcm92aWRlcnMgPSBbLi4udGhpcy5fcHJvdmlkZXJzLnZhbHVlcygpXTtcblx0XHRjb25zdCBjb250cmlidXRpb25zID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvdmlkZXJzLm1hcChhc3luYyBwcm92aWRlciA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgcHJvdmlkZXIuZ2V0TmV0d29ya0RpYWdub3N0aWNzRW5kcG9pbnRzPy4oKSA/PyBbXTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV0gRmFpbGVkIHRvIHJlc29sdmUgbmV0d29yayBkaWFnbm9zdGljcyBlbmRwb2ludHMgZm9yICR7cHJvdmlkZXIuaWR9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHRjb25zdCBhY2NvdW50cyA9IGF3YWl0IFByb21pc2UuYWxsKHByb3ZpZGVycy5tYXAoYXN5bmMgcHJvdmlkZXIgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHByb3ZpZGVyLmdldE5ldHdvcmtEaWFnbm9zdGljc0FjY291bnQ/LigpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBGYWlsZWQgdG8gcmVzb2x2ZSBuZXR3b3JrIGRpYWdub3N0aWNzIGFjY291bnQgZm9yICR7cHJvdmlkZXIuaWR9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0Y29uc3QgZW5kcG9pbnRzOiBJQWdlbnRIb3N0TmV0d29ya0VuZHBvaW50W10gPSBbXTtcblx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBlbmRwb2ludCBvZiBjb250cmlidXRpb25zLmZsYXQoKSkge1xuXHRcdFx0bGV0IGtleTogc3RyaW5nO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0a2V5ID0gbmV3IFVSTChlbmRwb2ludC51cmwpLnRvU3RyaW5nKCk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0a2V5ID0gZW5kcG9pbnQudXJsO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFzZWVuLmhhcyhrZXkpKSB7XG5cdFx0XHRcdHNlZW4uYWRkKGtleSk7XG5cdFx0XHRcdGVuZHBvaW50cy5wdXNoKGVuZHBvaW50KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX25ldHdvcmtEaWFnbm9zdGljcy5nZXRJbmZvKGVuZHBvaW50cywgYWNjb3VudHMuZmluZChhY2NvdW50ID0+ICEhYWNjb3VudCkpO1xuXHR9XG5cblx0YXN5bmMgZ2V0TWFuYWdlZFNldHRpbmdzRGlhZ25vc3RpY3MoKTogUHJvbWlzZTxyZWFkb25seSBJQWdlbnRIb3N0TWFuYWdlZFNldHRpbmdzRGlhZ25vc3RpY3NbXT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVycyA9IFsuLi50aGlzLl9wcm92aWRlcnMudmFsdWVzKCldLmZpbHRlcihwcm92aWRlciA9PiBwcm92aWRlci5nZXRNYW5hZ2VkU2V0dGluZ3NEaWFnbm9zdGljcyk7XG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKHByb3ZpZGVycy5tYXAoYXN5bmMgcHJvdmlkZXIgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIHsgcHJvdmlkZXI6IHByb3ZpZGVyLmlkLCBzbmFwc2hvdDogYXdhaXQgcHJvdmlkZXIuZ2V0TWFuYWdlZFNldHRpbmdzRGlhZ25vc3RpY3MhKCkgfTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHJldHVybiB7IHByb3ZpZGVyOiBwcm92aWRlci5pZCwgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSB9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGFzeW5jIGRpYWdub3N0aWNzRmV0Y2godXJsOiBzdHJpbmcpOiBQcm9taXNlPElBZ2VudEhvc3ROZXR3b3JrRmV0Y2hSZXN1bHQ+IHtcblx0XHRpZiAoIXRoaXMuX25ldHdvcmtEaWFnbm9zdGljcykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdOZXR3b3JrIGRpYWdub3N0aWNzIHVuYXZhaWxhYmxlOiBzZXJ2aWNlIG5vdCB3aXJlZCcpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbmV0d29ya0RpYWdub3N0aWNzLmZldGNoKHVybCk7XG5cdH1cblxuXHQvLyAtLS0tIGhlbHBlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0cHJpdmF0ZSBhc3luYyBfZmV0Y2hTZXNzaW9uRGJDb250ZW50KGZpZWxkczogSVNlc3Npb25EYlVyaUZpZWxkcyk6IFByb21pc2U8UmVzb3VyY2VSZWFkUmVzdWx0PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5wYXJzZShmaWVsZHMuc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgcmVmID0gdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLm9wZW5EYXRhYmFzZShzZXNzaW9uVXJpKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHJlZi5vYmplY3QucmVhZEZpbGVFZGl0Q29udGVudChmaWVsZHMudG9vbENhbGxJZCwgZmllbGRzLmZpbGVQYXRoKTtcblx0XHRcdGlmICghY29udGVudCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBgRmlsZSBlZGl0IG5vdCBmb3VuZDogdG9vbENhbGxJZD0ke2ZpZWxkcy50b29sQ2FsbElkfSwgZmlsZVBhdGg9JHtmaWVsZHMuZmlsZVBhdGh9YCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBieXRlcyA9IGZpZWxkcy5wYXJ0ID09PSAnYmVmb3JlJyA/IGNvbnRlbnQuYmVmb3JlQ29udGVudCA6IGNvbnRlbnQuYWZ0ZXJDb250ZW50O1xuXHRcdFx0aWYgKCFieXRlcykge1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihBaHBFcnJvckNvZGVzLk5vdEZvdW5kLCBgTm8gJHtmaWVsZHMucGFydH0gY29udGVudCBmb3I6IHRvb2xDYWxsSWQ9JHtmaWVsZHMudG9vbENhbGxJZH0sIGZpbGVQYXRoPSR7ZmllbGRzLmZpbGVQYXRofWApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZGF0YTogbmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGJ5dGVzKSxcblx0XHRcdFx0ZW5jb2Rpbmc6IENvbnRlbnRFbmNvZGluZy5VdGY4LFxuXHRcdFx0XHRjb250ZW50VHlwZTogJ3RleHQvcGxhaW4nLFxuXHRcdFx0fTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9mZXRjaEdpdEJsb2JDb250ZW50KGZpZWxkczogSUdpdEJsb2JVcmlGaWVsZHMpOiBQcm9taXNlPFJlc291cmNlUmVhZFJlc3VsdD4ge1xuXHRcdGlmICghdGhpcy5fZ2l0U2VydmljZSkge1xuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoQWhwRXJyb3JDb2Rlcy5Ob3RGb3VuZCwgYGdpdCBzZXJ2aWNlIHVuYXZhaWxhYmxlIGZvcjogJHtmaWVsZHMucmVwb1JlbGF0aXZlUGF0aH1gKTtcblx0XHR9XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IGF3YWl0IHRoaXMuX3Jlc29sdmVHaXRCbG9iV29ya2luZ0RpcmVjdG9yeShmaWVsZHMpO1xuXHRcdGlmICghd29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoQWhwRXJyb3JDb2Rlcy5Ob3RGb3VuZCwgYE5vIHNlc3Npb24gcmVwb3NpdG9yeSByZXNvbHZlcyBnaXQtYmxvYiBwYXRoOiAke2ZpZWxkcy5hYnNvbHV0ZVBhdGggfHwgZmllbGRzLnJlcG9SZWxhdGl2ZVBhdGh9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IGJsb2IgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLnNob3dCbG9iKHdvcmtpbmdEaXJlY3RvcnksIGZpZWxkcy5zaGEsIGZpZWxkcy5yZXBvUmVsYXRpdmVQYXRoKTtcblx0XHRpZiAoIWJsb2IpIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEFocEVycm9yQ29kZXMuTm90Rm91bmQsIGBnaXQgYmxvYiBub3QgZm91bmQ6ICR7ZmllbGRzLnNoYX06JHtmaWVsZHMucmVwb1JlbGF0aXZlUGF0aH1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRhdGE6IGJsb2IudG9TdHJpbmcoKSxcblx0XHRcdGVuY29kaW5nOiBDb250ZW50RW5jb2RpbmcuVXRmOCxcblx0XHRcdGNvbnRlbnRUeXBlOiAndGV4dC9wbGFpbicsXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQaWNrcyB0aGUgd29ya2luZyBkaXJlY3RvcnkgdG8gcnVuIGBnaXQgc2hvd2AgZnJvbSBmb3IgYSBgZ2l0LWJsb2I6YCBVUkkuXG5cdCAqXG5cdCAqIFRoZSBkaXJlY3RvcnkgaXMgY2hvc2VuIG9ubHkgZnJvbSB0aGUgc2Vzc2lvbidzIG93biwgc2VydmVyLXRydXN0ZWQgd29ya2luZ1xuXHQgKiBkaXJlY3RvcmllcyBcdTIwMTQgbmV2ZXIgZnJvbSBhbnl0aGluZyBjbGllbnQtc3VwcGxpZWQgXHUyMDE0IHNvIG9wZW5pbmcgYSBkaWZmIGNhblxuXHQgKiBuZXZlciBiZSBzdGVlcmVkIGludG8gYW4gYXJiaXRyYXJ5IHJlcG9zaXRvcnkuIGBmaWVsZHMuYWJzb2x1dGVQYXRoYCAodGhlXG5cdCAqIGZpbGUncyBhYnNvbHV0ZSBwYXRoLCBjYXJyaWVkIGluIHRoZSBVUkkpIGlzIHVzZWQgb25seSB0byAqc2VsZWN0KiB3aGljaFxuXHQgKiByZXBvIHRvIHJ1biBpbjsgaXQgaXMgbmV2ZXIgdXNlZCBhcyB0aGUgY3dkIGl0c2VsZi5cblx0ICpcblx0ICogU2VsZWN0aW9uIHJ1bGVzOlxuXHQgKiAtIFNpbmdsZS1mb2xkZXIgc2Vzc2lvbjogcmV0dXJuIHRoZSBvbmUgd29ya2luZyBkaXJlY3RvcnkgZGlyZWN0bHksIHdpdGhvdXRcblx0ICogICBhIGNvbnRhaW5tZW50IGNoZWNrIChwcmVzZXJ2ZXMgbGVnYWN5IGJlaGF2aW9yIGZvciByZWxvY2F0ZWQvcmVtYXBwZWRcblx0ICogICB3b3JrdHJlZXMgd2hvc2Ugc3RvcmVkIHBhdGggbm8gbG9uZ2VyIHNpdHMgdW5kZXIgdGhlIGN1cnJlbnQgcm9vdCkuXG5cdCAqIC0gTXVsdGktcm9vdCBzZXNzaW9uOiByZXNvbHZlIGVhY2ggd29ya2luZyBkaXJlY3RvcnkgdG8gaXRzIHJlcG8gcm9vdCBhbmRcblx0ICogICByZXR1cm4gdGhlIGRlZXBlc3Qgcm9vdCB0aGF0IGNvbnRhaW5zIGBhYnNvbHV0ZVBhdGhgOyBpZiBub25lIGNvbnRhaW5zIGl0LFxuXHQgKiAgIHJldHVybiBgdW5kZWZpbmVkYCAoXHUyMTkyIE5vdEZvdW5kKSByYXRoZXIgdGhhbiByZWFkaW5nIGZyb20gdGhlIHdyb25nIHJlcG8uXG5cdCAqIC0gTGVnYWN5IFVSSSB3aXRoIG5vIGBhYnNvbHV0ZVBhdGhgIChgJydgKTogZmFsbCBiYWNrIHRvIHRoZSBwcmltYXJ5XG5cdCAqICAgd29ya2luZyBkaXJlY3RvcnksIHNpbmNlIHRoZXJlIGlzIG5vIHBhdGggdG8gbWF0Y2guXG5cdCAqXG5cdCAqIEV4YW1wbGVzIChyb290cyBpbmRleCAwID0gcHJpbWFyeSk6XG5cdCAqICAgWy93b3JrL2FwcF0gICAgICAgICAgICAgICAgICAgICsgL3dvcmsvYXBwL3NyYy9hLnRzICAgXHUyMTkyIC93b3JrL2FwcFxuXHQgKiAgIFsvd29yay9hcHBdICAgICAgICAgICAgICAgICAgICArIC9lbHNld2hlcmUveC50cyAgICAgIFx1MjE5MiAvd29yay9hcHBcblx0ICogICBbL3dvcmsvYXBwLCAvd29yay9hcHAvcGtncy91aV0gKyAvd29yay9hcHAvcGtncy91aS9iICBcdTIxOTIgL3dvcmsvYXBwL3BrZ3MvdWlcblx0ICogICBbL3dvcmsvYXBwLCAvd29yay9saWJdICAgICAgICAgKyAvb3V0c2lkZS9jLnRzICAgICAgICBcdTIxOTIgdW5kZWZpbmVkIChOb3RGb3VuZClcblx0ICogICBbL3dvcmsvYXBwLCAvd29yay9saWJdICAgICAgICAgKyAnJyAgKGxlZ2FjeSkgICAgICAgICBcdTIxOTIgL3dvcmsvYXBwXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlR2l0QmxvYldvcmtpbmdEaXJlY3RvcnkoZmllbGRzOiBJR2l0QmxvYlVyaUZpZWxkcyk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZ2l0U2VydmljZSA9IHRoaXMuX2dpdFNlcnZpY2U7XG5cdFx0aWYgKCFnaXRTZXJ2aWNlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3JpZXMgPSBnZXRFZmZlY3RpdmVXb3JraW5nRGlyZWN0b3JpZXModGhpcy5fc3RhdGVNYW5hZ2VyLCBmaWVsZHMuc2Vzc2lvblVyaSk7XG5cdFx0Ly8gQmFja3dhcmRzLWNvbXBhdDogbm8gcmVzb2x2YWJsZSBhYnNvbHV0ZSBwYXRoIG1lYW5zIHdlIGNhbm5vdCBtYXRjaCBhXG5cdFx0Ly8gcmVwb3NpdG9yeSByb290LCBzbyBmYWxsIGJhY2sgdG8gdG9kYXkncyBwcmltYXJ5LWRpcmVjdG9yeSBiZWhhdmlvci5cblx0XHRpZiAoIWZpZWxkcy5hYnNvbHV0ZVBhdGgpIHtcblx0XHRcdGNvbnN0IHByaW1hcnkgPSB3b3JraW5nRGlyZWN0b3JpZXM/LlswXTtcblx0XHRcdHJldHVybiBwcmltYXJ5ID8gVVJJLnBhcnNlKHByaW1hcnkpIDogdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoIXdvcmtpbmdEaXJlY3Rvcmllcz8ubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHQvLyBTaW5nbGUtZm9sZGVyIHNlc3Npb25zIGtlZXAgdG9kYXkncyBiZWhhdmlvciBFWEFDVExZOiBydW4gYWdhaW5zdCB0aGVcblx0XHQvLyBvbmUgd29ya2luZyBkaXJlY3RvcnkgZGlyZWN0bHksIHdpdGhvdXQgdGhlIG11bHRpLXJvb3QgcGF0aC1jb250YWlubWVudFxuXHRcdC8vIGNoZWNrLiBUaGlzIHByZXNlcnZlcyBBQy0xLjEgKHNpbmdsZS1mb2xkZXIgdW5jaGFuZ2VkKSBcdTIwMTQgZS5nLiBhXG5cdFx0Ly8gZ2l0LWJsb2IgVVJJIHdob3NlIHN0b3JlZCBhYnNvbHV0ZSBwYXRoIG5vIGxvbmdlciBzaXRzIHVuZGVyIHRoZVxuXHRcdC8vIGN1cnJlbnQgcm9vdCAoYSByZW1hcHBlZC9yZWxvY2F0ZWQgd29ya3RyZWUpIHN0aWxsIHJlc29sdmVzIGFnYWluc3QgdGhlXG5cdFx0Ly8gcHJpbWFyeSBkaXJlY3RvcnkgYXMgaXQgZGlkIGJlZm9yZSBtdWx0aS1yb290IHN1cHBvcnQuXG5cdFx0aWYgKCFpc011bHRpUm9vdFNlc3Npb24od29ya2luZ0RpcmVjdG9yaWVzKSkge1xuXHRcdFx0cmV0dXJuIFVSSS5wYXJzZSh3b3JraW5nRGlyZWN0b3JpZXNbMF0pO1xuXHRcdH1cblx0XHRjb25zdCB7IGdpdFJlcG9zaXRvcmllcyB9ID0gYXdhaXQgcmVzb2x2ZVNlc3Npb25SZXBvc2l0b3JpZXMod29ya2luZ0RpcmVjdG9yaWVzLm1hcChkaXJlY3RvcnkgPT4gVVJJLnBhcnNlKGRpcmVjdG9yeSkpLCBnaXRTZXJ2aWNlKTtcblx0XHRpZiAoIWdpdFJlcG9zaXRvcmllcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdC8vIFRoZSBhYnNvbHV0ZSBwYXRoIHdhcyBzdG9yZWQgYXMgYSBiYXJlIHBhdGggKGl0cyBzY2hlbWUvYXV0aG9yaXR5IHdlcmVcblx0XHQvLyBkcm9wcGVkIHdoZW4gdGhlIFVSSSB3YXMgYnVpbHQpOyByZWJ1aWxkIGl0IGFnYWluc3QgdGhlIHNlc3Npb24gcm9vdHMnXG5cdFx0Ly8gb3duIHNjaGVtZS9hdXRob3JpdHkgc28gaXQgbGluZXMgdXAgd2l0aCB0aGUgcmVwb3NpdG9yeSByb290cy5cblx0XHRjb25zdCBibG9iUmVzb3VyY2UgPSBnaXRSZXBvc2l0b3JpZXNbMF0ud2l0aCh7IHBhdGg6IGZpZWxkcy5hYnNvbHV0ZVBhdGggfSk7XG5cdFx0cmV0dXJuIGZpbmREZWVwZXN0Q29udGFpbmluZ1dvcmtpbmdEaXJlY3RvcnkoYmxvYlJlc291cmNlLCBnaXRSZXBvc2l0b3JpZXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc3RvcmVzIGEgc3ViYWdlbnQgc2Vzc2lvbiBmcm9tIGl0cyBwYXJlbnQgc2Vzc2lvbidzIGV2ZW50IGhpc3RvcnkuXG5cdCAqIExvYWRzIHRoZSBwYXJlbnQncyByYXcgbWVzc2FnZXMsIGZpbHRlcnMgZm9yIGV2ZW50cyBiZWxvbmdpbmcgdG9cblx0ICogdGhlIHN1YmFnZW50IChieSBgcGFyZW50VG9vbENhbGxJZGApLCBhbmQgYnVpbGRzIHRoZSBjaGlsZCBzZXNzaW9uJ3Ncblx0ICogdHVybnMgZnJvbSB0aG9zZSBldmVudHMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXN0b3JlU3ViYWdlbnRDaGF0KGNoYXRVcmk6IHN0cmluZywgcGFyZW50U2Vzc2lvbjogVVJJLCB0b29sQ2FsbElkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShjaGF0VXJpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpbkZsaWdodCA9IHRoaXMuX3Jlc3RvcmVTdWJhZ2VudEluRmxpZ2h0LmdldChjaGF0VXJpKTtcblx0XHRpZiAoaW5GbGlnaHQpIHtcblx0XHRcdHJldHVybiBpbkZsaWdodDtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdG9yZSA9IHRoaXMuX2RvUmVzdG9yZVN1YmFnZW50Q2hhdChjaGF0VXJpLCBwYXJlbnRTZXNzaW9uLCB0b29sQ2FsbElkKTtcblx0XHR0aGlzLl9yZXN0b3JlU3ViYWdlbnRJbkZsaWdodC5zZXQoY2hhdFVyaSwgcmVzdG9yZSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHJlc3RvcmU7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlmICh0aGlzLl9yZXN0b3JlU3ViYWdlbnRJbkZsaWdodC5nZXQoY2hhdFVyaSkgPT09IHJlc3RvcmUpIHtcblx0XHRcdFx0dGhpcy5fcmVzdG9yZVN1YmFnZW50SW5GbGlnaHQuZGVsZXRlKGNoYXRVcmkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2RvUmVzdG9yZVN1YmFnZW50Q2hhdChjaGF0VXJpOiBzdHJpbmcsIHBhcmVudFNlc3Npb246IFVSSSwgdG9vbENhbGxJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcGFyZW50U2Vzc2lvbktleSA9IHBhcmVudFNlc3Npb24udG9TdHJpbmcoKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVzdG9yZVNlc3Npb25JbkZsaWdodC5nZXQocGFyZW50U2Vzc2lvbktleSk7XG5cdFx0XHRpZiAoIXRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUocGFyZW50U2Vzc2lvbktleSkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5yZXN0b3JlU2Vzc2lvbihwYXJlbnRTZXNzaW9uKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50U2VydmljZV0gQ2Fubm90IHJlc3RvcmUgcGFyZW50IHNlc3Npb24gZm9yIHN1YmFnZW50IGNoYXQ6ICR7cGFyZW50U2Vzc2lvbktleX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcGFyZW50U3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHBhcmVudFNlc3Npb25LZXkpO1xuXHRcdGNvbnN0IGFnZW50ID0gdGhpcy5fZmluZFByb3ZpZGVyRm9yU2Vzc2lvbihwYXJlbnRTZXNzaW9uKTtcblx0XHRpZiAoIXBhcmVudFN0YXRlIHx8ICFhZ2VudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBBIHN1YmFnZW50IGNhbiBiZSBzcGF3bmVkIGZyb20gYW55IGNoYXQgaW4gdGhlIHNlc3Npb24sIGluY2x1ZGluZyBwZWVyXG5cdFx0Ly8gY2hhdHMgYW5kIG5lc3RlZCBzdWJhZ2VudHMsIHNvIHJlc3RvcmUgbXVzdCBmaW5kIHRoZSBjaGF0IHRoYXQgcmFuIHRoZVxuXHRcdC8vIHNwYXduaW5nIHRvb2wgY2FsbCBpbnN0ZWFkIG9mIGFzc3VtaW5nIHRoZSBkZWZhdWx0IGNoYXQuXG5cdFx0Y29uc3Qgc3Bhd25Qb2ludCA9IHRoaXMuX2ZpbmRTdWJhZ2VudFNwYXduUG9pbnQocGFyZW50U2Vzc2lvbktleSwgY2hhdFVyaSwgdG9vbENhbGxJZCk7XG5cdFx0Y29uc3Qgb3JpZ2luID0ge1xuXHRcdFx0a2luZDogQ2hhdE9yaWdpbktpbmQuVG9vbCxcblx0XHRcdGNoYXQ6IHNwYXduUG9pbnQ/LmNoYXQgPz8gcGFyZW50U3RhdGUuZGVmYXVsdENoYXQgPz8gYnVpbGREZWZhdWx0Q2hhdFVyaShwYXJlbnRTZXNzaW9uKSxcblx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0fSBhcyBjb25zdDtcblx0XHRjb25zdCBjaGlsZFR1cm5zID0gYXdhaXQgdGhpcy5fZ2V0Q2hhdE1lc3NhZ2VzKGFnZW50LCBVUkkucGFyc2UoY2hhdFVyaSksIHBhcmVudFNlc3Npb24sIG9yaWdpbik7XG5cdFx0aWYgKGNoaWxkVHVybnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG1lcmdlZFR1cm5zID0gYXdhaXQgdGhpcy5faW50ZXJsZWF2ZUxvY2FsVHVybnMocGFyZW50U2Vzc2lvbktleSwgY2hhdFVyaSwgY2hpbGRUdXJucyk7XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmFkZENoYXQocGFyZW50U2Vzc2lvbktleSwgY2hhdFVyaSwge1xuXHRcdFx0dGl0bGU6IHNwYXduUG9pbnQ/LnRpdGxlID8/ICdTdWJhZ2VudCcsXG5cdFx0XHR0dXJuczogbWVyZ2VkVHVybnMsXG5cdFx0XHRvcmlnaW4sXG5cdFx0XHRpbnRlcmFjdGl2aXR5OiBDaGF0SW50ZXJhY3Rpdml0eS5SZWFkT25seSxcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaW5kcyB0aGUgY2hhdCB3aG9zZSB0b29sIGNhbGwgc3Bhd25lZCBhIHN1YmFnZW50IGFuZCByZWFkcyB0aGUgdGl0bGUgdGhhdFxuXHQgKiB0b29sIGNhbGwgcmVwb3J0ZWQuIEl0IHNjYW5zIGV2ZXJ5IGh5ZHJhdGVkIGNoYXQgaW4gdGhlIHBhcmVudCBzZXNzaW9uIHNvXG5cdCAqIHBlZXItY2hhdCBhbmQgbmVzdGVkLXN1YmFnZW50IHNwYXducyByZXNvbHZlIHRvIHRoZWlyIHJlYWwgcGFyZW50OyBjaGF0c1xuXHQgKiB3aXRob3V0IGh5ZHJhdGVkIHN0YXRlIGFyZSBza2lwcGVkIG9uIHJlc3RvcmUgaW5zdGVhZCBvZiBiZWluZyBtYXRlcmlhbGl6ZWRcblx0ICoganVzdCB0byBwbGFjZSBvbmUgc3Bhd24gZWRnZS5cblx0ICovXG5cdHByaXZhdGUgX2ZpbmRTdWJhZ2VudFNwYXduUG9pbnQocGFyZW50U2Vzc2lvbktleTogc3RyaW5nLCBzdWJhZ2VudENoYXRVcmk6IHN0cmluZywgdG9vbENhbGxJZDogc3RyaW5nKTogeyByZWFkb25seSBjaGF0OiBzdHJpbmc7IHJlYWRvbmx5IHRpdGxlPzogc3RyaW5nIH0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHBhcmVudFN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShwYXJlbnRTZXNzaW9uS2V5KTtcblx0XHRpZiAoIXBhcmVudFN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IHBhcmVudFN0YXRlLmRlZmF1bHRDaGF0ID8/IGJ1aWxkRGVmYXVsdENoYXRVcmkocGFyZW50U2Vzc2lvbktleSk7XG5cdFx0Y29uc3QgY2FuZGlkYXRlczogeyBjaGF0OiBzdHJpbmc7IHR1cm5zOiByZWFkb25seSBUdXJuW107IGFjdGl2ZVR1cm46IFR1cm4gfCB1bmRlZmluZWQgfVtdID0gW1xuXHRcdFx0eyBjaGF0OiBkZWZhdWx0Q2hhdCwgdHVybnM6IHBhcmVudFN0YXRlLnR1cm5zLCBhY3RpdmVUdXJuOiBwYXJlbnRTdGF0ZS5hY3RpdmVUdXJuIGFzIFR1cm4gfCB1bmRlZmluZWQgfSxcblx0XHRdO1xuXHRcdGZvciAoY29uc3QgY2hhdCBvZiBwYXJlbnRTdGF0ZS5jaGF0cykge1xuXHRcdFx0aWYgKGNoYXQucmVzb3VyY2UgPT09IGRlZmF1bHRDaGF0IHx8IGNoYXQucmVzb3VyY2UgPT09IHN1YmFnZW50Q2hhdFVyaSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNoYXRTdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRDaGF0U3RhdGUoY2hhdC5yZXNvdXJjZSk7XG5cdFx0XHRpZiAoY2hhdFN0YXRlKSB7XG5cdFx0XHRcdGNhbmRpZGF0ZXMucHVzaCh7IGNoYXQ6IGNoYXQucmVzb3VyY2UsIHR1cm5zOiBjaGF0U3RhdGUudHVybnMsIGFjdGl2ZVR1cm46IGNoYXRTdGF0ZS5hY3RpdmVUdXJuIGFzIFR1cm4gfCB1bmRlZmluZWQgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGNhbmRpZGF0ZXMpIHtcblx0XHRcdGZvciAoY29uc3QgdHVybiBvZiBbLi4uY2FuZGlkYXRlLnR1cm5zLCAuLi4oY2FuZGlkYXRlLmFjdGl2ZVR1cm4gPyBbY2FuZGlkYXRlLmFjdGl2ZVR1cm5dIDogW10pXSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgdHVybi5yZXNwb25zZVBhcnRzKSB7XG5cdFx0XHRcdFx0aWYgKHBhcnQua2luZCAhPT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCB8fCBwYXJ0LnRvb2xDYWxsLnRvb2xDYWxsSWQgIT09IHRvb2xDYWxsSWQpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBjb250ZW50ID0gcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCB8fCBwYXJ0LnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUnVubmluZ1xuXHRcdFx0XHRcdFx0PyBwYXJ0LnRvb2xDYWxsLmNvbnRlbnRcblx0XHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnN0IHN1YmFnZW50ID0gY29udGVudD8uZmluZCgoaXRlbSk6IGl0ZW0gaXMgVG9vbFJlc3VsdFN1YmFnZW50Q29udGVudCA9PiBpdGVtLnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5TdWJhZ2VudCk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgY2hhdDogY2FuZGlkYXRlLmNoYXQsIC4uLihzdWJhZ2VudD8udGl0bGUgPyB7IHRpdGxlOiBzdWJhZ2VudC50aXRsZSB9IDoge30pIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc3RvcmVTdWJhZ2VudFNlc3Npb24oc3ViYWdlbnRVcmk6IHN0cmluZywgcGFyZW50U2Vzc2lvbjogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc3ViYWdlbnRVcmkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5GbGlnaHQgPSB0aGlzLl9yZXN0b3JlU3ViYWdlbnRJbkZsaWdodC5nZXQoc3ViYWdlbnRVcmkpO1xuXHRcdGlmIChpbkZsaWdodCkge1xuXHRcdFx0cmV0dXJuIGluRmxpZ2h0O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3RvcmUgPSB0aGlzLl9kb1Jlc3RvcmVTdWJhZ2VudFNlc3Npb24oc3ViYWdlbnRVcmksIHBhcmVudFNlc3Npb24pO1xuXHRcdHRoaXMuX3Jlc3RvcmVTdWJhZ2VudEluRmxpZ2h0LnNldChzdWJhZ2VudFVyaSwgcmVzdG9yZSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHJlc3RvcmU7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlmICh0aGlzLl9yZXN0b3JlU3ViYWdlbnRJbkZsaWdodC5nZXQoc3ViYWdlbnRVcmkpID09PSByZXN0b3JlKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc3RvcmVTdWJhZ2VudEluRmxpZ2h0LmRlbGV0ZShzdWJhZ2VudFVyaSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZG9SZXN0b3JlU3ViYWdlbnRTZXNzaW9uKHN1YmFnZW50VXJpOiBzdHJpbmcsIHBhcmVudFNlc3Npb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIEVuc3VyZSB0aGUgcGFyZW50IHNlc3Npb24gaXMgbG9hZGVkIGZpcnN0XG5cdFx0Y29uc3QgcGFyZW50U2Vzc2lvbktleSA9IHBhcmVudFNlc3Npb24udG9TdHJpbmcoKTtcblx0XHRpZiAoIXRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUocGFyZW50U2Vzc2lvbktleSkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMucmVzdG9yZVNlc3Npb24ocGFyZW50U2Vzc2lvbik7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRTZXJ2aWNlXSBDYW5ub3QgcmVzdG9yZSBwYXJlbnQgc2Vzc2lvbiBmb3Igc3ViYWdlbnQ6ICR7cGFyZW50U2Vzc2lvbktleX1gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHBhcmVudFN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShwYXJlbnRTZXNzaW9uS2V5KTtcblx0XHRpZiAoIXBhcmVudFN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gU2VhcmNoIGNvbXBsZXRlZCB0dXJucyBhbmQgYWN0aXZlIHR1cm4gZm9yIHRoZSBzdWJhZ2VudCBjb250ZW50IG1ldGFkYXRhXG5cdFx0Y29uc3QgYWxsVHVybnMgPSBbLi4ucGFyZW50U3RhdGUudHVybnNdO1xuXHRcdGlmIChwYXJlbnRTdGF0ZS5hY3RpdmVUdXJuKSB7XG5cdFx0XHRhbGxUdXJucy5wdXNoKHBhcmVudFN0YXRlLmFjdGl2ZVR1cm4gYXMgVHVybik7XG5cdFx0fVxuXG5cdFx0bGV0IHN1YmFnZW50Q29udGVudDogVG9vbFJlc3VsdFN1YmFnZW50Q29udGVudCB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IHR1cm4gb2YgYWxsVHVybnMpIHtcblx0XHRcdGZvciAoY29uc3QgcGFydCBvZiB0dXJuLnJlc3BvbnNlUGFydHMpIHtcblx0XHRcdFx0aWYgKHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCkge1xuXHRcdFx0XHRcdGNvbnN0IHRjID0gcGFydC50b29sQ2FsbDtcblx0XHRcdFx0XHQvLyBDaGVjayBib3RoIGNvbXBsZXRlZCBhbmQgcnVubmluZyB0b29sIGNhbGxzIFx1MjAxNCBydW5uaW5nXG5cdFx0XHRcdFx0Ly8gdG9vbCBjYWxscyByZWNlaXZlIHN1YmFnZW50IGNvbnRlbnQgdmlhIENvbnRlbnRDaGFuZ2VkXG5cdFx0XHRcdFx0Y29uc3QgY29udGVudCA9IHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkXG5cdFx0XHRcdFx0XHQ/IHRjLmNvbnRlbnRcblx0XHRcdFx0XHRcdDogKHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUnVubmluZyA/IHRjLmNvbnRlbnQgOiB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdGlmIChjb250ZW50KSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IGMgb2YgY29udGVudCkge1xuXHRcdFx0XHRcdFx0XHRpZiAoYy50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQgJiYgYy5yZXNvdXJjZSA9PT0gc3ViYWdlbnRVcmkpIHtcblx0XHRcdFx0XHRcdFx0XHRzdWJhZ2VudENvbnRlbnQgPSBjO1xuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoc3ViYWdlbnRDb250ZW50KSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIExvYWQgdGhlIHN1YmFnZW50J3MgdHVybnMgZnJvbSB0aGUgYWdlbnQgKHdoaWNoIGtub3dzIGhvdyB0b1xuXHRcdC8vIGV4dHJhY3QgdGhlbSBmcm9tIHRoZSBwYXJlbnQgc2Vzc2lvbidzIGV2ZW50IGxvZykuXG5cdFx0bGV0IGNoaWxkVHVybnM6IHJlYWRvbmx5IFR1cm5bXSA9IFtdO1xuXHRcdGNvbnN0IGFnZW50ID0gdGhpcy5fZmluZFByb3ZpZGVyRm9yU2Vzc2lvbihwYXJlbnRTZXNzaW9uKTtcblx0XHRpZiAoYWdlbnQpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHBhcnNlZFN1YmFnZW50ID0gcGFyc2VTdWJhZ2VudFNlc3Npb25VcmkoVVJJLnBhcnNlKHN1YmFnZW50VXJpKSk7XG5cdFx0XHRcdGNvbnN0IG9yaWdpbiA9IHBhcmVudFN0YXRlLmNoYXRzLmZpbmQoY2hhdCA9PiBjaGF0LnJlc291cmNlID09PSBzdWJhZ2VudFVyaSk/Lm9yaWdpblxuXHRcdFx0XHRcdD8/IChwYXJzZWRTdWJhZ2VudCA/IHtcblx0XHRcdFx0XHRcdGtpbmQ6IENoYXRPcmlnaW5LaW5kLlRvb2wsXG5cdFx0XHRcdFx0XHRjaGF0OiBwYXJlbnRTdGF0ZS5kZWZhdWx0Q2hhdCA/PyBidWlsZERlZmF1bHRDaGF0VXJpKHBhcmVudFNlc3Npb24pLFxuXHRcdFx0XHRcdFx0dG9vbENhbGxJZDogcGFyc2VkU3ViYWdlbnQudG9vbENhbGxJZCxcblx0XHRcdFx0XHR9IDogdW5kZWZpbmVkKTtcblx0XHRcdFx0Y2hpbGRUdXJucyA9IGF3YWl0IHRoaXMuX2dldENoYXRNZXNzYWdlcyhhZ2VudCwgVVJJLnBhcnNlKHN1YmFnZW50VXJpKSwgcGFyZW50U2Vzc2lvbiwgb3JpZ2luKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudFNlcnZpY2VdIEZhaWxlZCB0byBsb2FkIHN1YmFnZW50IHR1cm5zIGZvciAke3N1YmFnZW50VXJpfWAsIGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVXNlIG1ldGFkYXRhIGZyb20gc3ViYWdlbnQgY29udGVudCBpZiBhdmFpbGFibGUsIG90aGVyd2lzZSBzeW50aGVzaXplXG5cdFx0Y29uc3QgdGl0bGUgPSBzdWJhZ2VudENvbnRlbnQ/LnRpdGxlID8/ICdTdWJhZ2VudCc7XG5cblx0XHRjb25zdCBzdWJhZ2VudE5vdyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcblx0XHQvLyBMb2NhbCB0dXJucyBmb3IgYSBzdWJhZ2VudCBjaGF0IGFyZSBwZXJzaXN0ZWQgaW4gdGhlIHBhcmVudCBzZXNzaW9uJ3Ncblx0XHQvLyBkYXRhYmFzZSAoaXRzIGNoYXQgVVJJIHJlc29sdmVzIHRvIHRoZSBwYXJlbnQgc2Vzc2lvbiksIGtleWVkIGJ5IHRoZVxuXHRcdC8vIHN1YmFnZW50IGNoYXQgVVJJLlxuXHRcdGNvbnN0IG1lcmdlZENoaWxkVHVybnMgPSBhd2FpdCB0aGlzLl9pbnRlcmxlYXZlTG9jYWxUdXJucyhwYXJlbnRTZXNzaW9uLnRvU3RyaW5nKCksIHN1YmFnZW50VXJpLCBjaGlsZFR1cm5zKTtcblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIucmVzdG9yZVNlc3Npb24oXG5cdFx0XHR7XG5cdFx0XHRcdHJlc291cmNlOiBzdWJhZ2VudFVyaSxcblx0XHRcdFx0cHJvdmlkZXI6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdFx0Y3JlYXRlZEF0OiBzdWJhZ2VudE5vdyxcblx0XHRcdFx0bW9kaWZpZWRBdDogc3ViYWdlbnROb3csXG5cdFx0XHRcdC4uLihwYXJlbnRTdGF0ZT8ucHJvamVjdCA/IHsgcHJvamVjdDogcGFyZW50U3RhdGUucHJvamVjdCB9IDoge30pLFxuXHRcdFx0fSxcblx0XHRcdG1lcmdlZENoaWxkVHVybnMsXG5cdFx0KTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtBZ2VudFNlcnZpY2VdIFJlc3RvcmVkIHN1YmFnZW50IHNlc3Npb246ICR7c3ViYWdlbnRVcml9IHdpdGggJHtjaGlsZFR1cm5zLmxlbmd0aH0gdHVybihzKWApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVnaXN0ZXJSZXN0b3JlZFN1YmFnZW50U3VtbWFyaWVzKGFnZW50OiBJQWdlbnQsIHBhcmVudFNlc3Npb246IFVSSSwgdHVybnM6IHJlYWRvbmx5IFR1cm5bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHBhcmVudFNlc3Npb25TdHIgPSBwYXJlbnRTZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgcGFyZW50Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkocGFyZW50U2Vzc2lvbik7XG5cdFx0Y29uc3QgZGlzY292ZXJlZCA9IG5ldyBNYXA8c3RyaW5nLCB7IHRpdGxlOiBzdHJpbmc7IHRvb2xDYWxsSWQ6IHN0cmluZyB9PigpO1xuXHRcdGZvciAoY29uc3QgdHVybiBvZiB0dXJucykge1xuXHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIHR1cm4ucmVzcG9uc2VQYXJ0cykge1xuXHRcdFx0XHRpZiAocGFydC5raW5kICE9PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY29udGVudCA9IHBhcnQudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgfHwgcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmdcblx0XHRcdFx0XHQ/IHBhcnQudG9vbENhbGwuY29udGVudFxuXHRcdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBzdWJhZ2VudCA9IGNvbnRlbnQ/LmZpbmQoKGl0ZW0pOiBpdGVtIGlzIFRvb2xSZXN1bHRTdWJhZ2VudENvbnRlbnQgPT4gaXRlbS50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQpO1xuXHRcdFx0XHRpZiAoc3ViYWdlbnQpIHtcblx0XHRcdFx0XHRkaXNjb3ZlcmVkLnNldChwYXJ0LnRvb2xDYWxsLnRvb2xDYWxsSWQsIHtcblx0XHRcdFx0XHRcdHRpdGxlOiBzdWJhZ2VudENoYXRUaXRsZShyZWFkVG9vbENhbGxNZXRhKHBhcnQudG9vbENhbGwpLnN1YmFnZW50RGVzY3JpcHRpb24sIHN1YmFnZW50LnRpdGxlKSxcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6IHBhcnQudG9vbENhbGwudG9vbENhbGxJZCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIGRpc2NvdmVyZWQudmFsdWVzKCkpIHtcblx0XHRcdGNvbnN0IGNoYXRVcmkgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShwYXJlbnRTZXNzaW9uU3RyLCBjaGlsZC50b29sQ2FsbElkKTtcblx0XHRcdGlmICh0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKGNoYXRVcmkpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgb3JpZ2luID0geyBraW5kOiBDaGF0T3JpZ2luS2luZC5Ub29sLCBjaGF0OiBwYXJlbnRDaGF0LCB0b29sQ2FsbElkOiBjaGlsZC50b29sQ2FsbElkIH0gYXMgY29uc3Q7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUocGFyZW50U2Vzc2lvblN0cik/LmNoYXRzLmZpbmQoY2hhdCA9PiBjaGF0LnJlc291cmNlID09PSBjaGF0VXJpKTtcblx0XHRcdGNvbnN0IHBlcnNpc3RlZFRpdGxlID0gYXdhaXQgdGhpcy5fcmVhZFBlcnNpc3RlZENoYXRUaXRsZShwYXJlbnRTZXNzaW9uLCBVUkkucGFyc2UoY2hhdFVyaSkpO1xuXHRcdFx0Y29uc3QgdGl0bGUgPSBwZXJzaXN0ZWRUaXRsZSA/PyBjaGlsZC50aXRsZTtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5yZWdpc3RlclJlc3RvcmVkQ2hhdFN1bW1hcnkocGFyZW50U2Vzc2lvblN0ciwgY2hhdFVyaSwge1xuXHRcdFx0XHR0aXRsZSxcblx0XHRcdFx0b3JpZ2luLFxuXHRcdFx0XHRpbnRlcmFjdGl2aXR5OiBDaGF0SW50ZXJhY3Rpdml0eS5SZWFkT25seSxcblx0XHRcdFx0cmVzb2x2ZXI6IGFzeW5jICgpID0+ICh7XG5cdFx0XHRcdFx0dHVybnM6IFsuLi5hd2FpdCB0aGlzLl9yZXNvbHZlUmVzdG9yZWRTdWJhZ2VudFR1cm5zKGFnZW50LCBwYXJlbnRTZXNzaW9uLCBjaGF0VXJpLCBvcmlnaW4pXSxcblx0XHRcdFx0fSksXG5cdFx0XHR9KTtcblx0XHRcdGlmIChleGlzdGluZyAmJiAoIWV4aXN0aW5nLnRpdGxlIHx8IGV4aXN0aW5nLnRpdGxlID09PSBzdWJhZ2VudENoYXRUaXRsZSh1bmRlZmluZWQsIHVuZGVmaW5lZCkpKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci51cGRhdGVDaGF0VGl0bGUocGFyZW50U2Vzc2lvblN0ciwgY2hhdFVyaSwgdGl0bGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVSZXN0b3JlZFN1YmFnZW50VHVybnMoYWdlbnQ6IElBZ2VudCwgcGFyZW50U2Vzc2lvbjogVVJJLCBjaGF0VXJpOiBzdHJpbmcsIG9yaWdpbjogeyByZWFkb25seSBraW5kOiBDaGF0T3JpZ2luS2luZC5Ub29sOyByZWFkb25seSBjaGF0OiBzdHJpbmc7IHJlYWRvbmx5IHRvb2xDYWxsSWQ6IHN0cmluZyB9KTogUHJvbWlzZTxyZWFkb25seSBUdXJuW10+IHtcblx0XHRjb25zdCBjaGlsZFR1cm5zID0gYXdhaXQgdGhpcy5fZ2V0Q2hhdE1lc3NhZ2VzKGFnZW50LCBVUkkucGFyc2UoY2hhdFVyaSksIHBhcmVudFNlc3Npb24sIG9yaWdpbik7XG5cdFx0aWYgKGNoaWxkVHVybnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFN1YmFnZW50IHRyYW5zY3JpcHQgaXMgbm90IGF2YWlsYWJsZSB5ZXQ6ICR7Y2hhdFVyaX1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2ludGVybGVhdmVMb2NhbFR1cm5zKHBhcmVudFNlc3Npb24udG9TdHJpbmcoKSwgY2hhdFVyaSwgY2hpbGRUdXJucyk7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kUHJvdmlkZXJGb3JTZXNzaW9uKHNlc3Npb246IFVSSSB8IHN0cmluZyk6IElBZ2VudCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qga2V5ID0gdHlwZW9mIHNlc3Npb24gPT09ICdzdHJpbmcnID8gc2Vzc2lvbiA6IHNlc3Npb24udG9TdHJpbmcoKTtcblx0XHRjb25zdCBwcm92aWRlcklkID0gdGhpcy5fc2Vzc2lvblRvUHJvdmlkZXIuZ2V0KGtleSk7XG5cdFx0aWYgKHByb3ZpZGVySWQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9wcm92aWRlcnMuZ2V0KHByb3ZpZGVySWQpO1xuXHRcdH1cblx0XHRjb25zdCBzY2hlbWVQcm92aWRlciA9IEFnZW50U2Vzc2lvbi5wcm92aWRlcihzZXNzaW9uKTtcblx0XHRpZiAoc2NoZW1lUHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiB0aGlzLl9wcm92aWRlcnMuZ2V0KHNjaGVtZVByb3ZpZGVyKTtcblx0XHR9XG5cdFx0Ly8gRmFsbGJhY2s6IHRyeSB0aGUgZGVmYXVsdCBwcm92aWRlciAoaGFuZGxlcyByZXN1bWVkIHNlc3Npb25zIG5vdCB5ZXQgdHJhY2tlZClcblx0XHRpZiAodGhpcy5fZGVmYXVsdFByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcHJvdmlkZXJzLmdldCh0aGlzLl9kZWZhdWx0UHJvdmlkZXIpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNldHMgdGhlIGFnZW50cyBvYnNlcnZhYmxlIHRvIHRyaWdnZXIgbW9kZWwgcmUtZmV0Y2ggYW5kXG5cdCAqIGByb290L2FnZW50c0NoYW5nZWRgIHZpYSB0aGUgYXV0b3J1biBpbiB7QGxpbmsgQWdlbnRTaWRlRWZmZWN0c30uXG5cdCAqL1xuXHRwcml2YXRlIF91cGRhdGVBZ2VudHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fYWdlbnRzLnNldChbLi4udGhpcy5fcHJvdmlkZXJzLnZhbHVlcygpXSwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLl9wcm92aWRlcnMudmFsdWVzKCkpIHtcblx0XHRcdHByb3ZpZGVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fcHJvdmlkZXJzLmNsZWFyKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzRXJyb3JXaXRoQ29kZShlcnJvcjogdW5rbm93biwgY29kZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBlcnJvciBpbnN0YW5jZW9mIEVycm9yICYmIGhhc0Vycm9yQ29kZShlcnJvciwgY29kZSk7XG59XG5cbmZ1bmN0aW9uIGhhc0Vycm9yQ29kZShlcnJvcjogRXJyb3IgfCB7IGNvZGU6IHVua25vd24gfSwgY29kZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBoYXNLZXkoZXJyb3IsIHsgY29kZTogdHJ1ZSB9KSAmJiBlcnJvci5jb2RlID09PSBjb2RlO1xufVxuXG4vKipcbiAqIFJ1bnRpbWUgb3duZXIgb2YgYW4gYWN0aXZlIHJlc291cmNlIHdhdGNoIFx1MjAxNCBwYWlycyB0aGUge0BsaW5rIElGaWxlU2VydmljZX1cbiAqIHdhdGNoZXIgZGlzcG9zYWJsZXMgd2l0aCB0aGUgc3Vic2NyaWJlciByZWZjb3VudCBhbmQgdGhlIG9wdGlvbmFsXG4gKiBncmFjZS13aW5kb3cgdGltZXIgdXNlZCB0byBkZWxheSBkaXNwb3NhbCBhZnRlciB0aGUgbGFzdCB1bnN1YnNjcmliZS5cbiAqL1xuaW50ZXJmYWNlIElBY3RpdmVSZXNvdXJjZVdhdGNoIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRyZWFkb25seSBjaGFubmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0b3I6IFJlc291cmNlV2F0Y2hTdGF0ZTtcblx0c3Vic2NyaWJlcnM6IG51bWJlcjtcblx0cmVhZG9ubHkgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cGVuZGluZ0djOiBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT47XG59XG5cbi8qKlxuICogRmxhdHRlbiBhIHtAbGluayBGaWxlQ2hhbmdlc0V2ZW50fSBpbnRvIGEgc3ludGhldGljIHtAbGluayBJRmlsZUNoYW5nZX1cbiAqIGxpc3QuIFRoZSBldmVudCBzdG9yZXMgb25seSBVUkkgYXJyYXlzIHB1YmxpY2x5ICh0aGUgdW5kZXJseWluZ1xuICogYElGaWxlQ2hhbmdlW11gIGlzIHByaXZhdGUpLCBzbyB3ZSByZWNvbnN0cnVjdCBvbmUgZW50cnkgcGVyIFVSSSBwZXJcbiAqIGNoYW5nZSB0eXBlLiBUaGUgc3ludGhldGljIHNoYXBlIGlzIHN1ZmZpY2llbnQgZm9yIHRyYW5zbGF0aW9uIGludG9cbiAqIGBSZXNvdXJjZVdhdGNoQ2hhbmdlZEFjdGlvbmAgaXRlbXMuXG4gKi9cbmZ1bmN0aW9uIGNvbGxlY3RDaGFuZ2VzKGV2ZW50OiBGaWxlQ2hhbmdlc0V2ZW50KTogSUZpbGVDaGFuZ2VbXSB7XG5cdGNvbnN0IG91dDogSUZpbGVDaGFuZ2VbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIGV2ZW50LnJhd0FkZGVkKSB7XG5cdFx0b3V0LnB1c2goeyByZXNvdXJjZSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuQURERUQgfSk7XG5cdH1cblx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiBldmVudC5yYXdVcGRhdGVkKSB7XG5cdFx0b3V0LnB1c2goeyByZXNvdXJjZSwgdHlwZTogRmlsZUNoYW5nZVR5cGUuVVBEQVRFRCB9KTtcblx0fVxuXHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIGV2ZW50LnJhd0RlbGV0ZWQpIHtcblx0XHRvdXQucHVzaCh7IHJlc291cmNlLCB0eXBlOiBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEIH0pO1xuXHR9XG5cdHJldHVybiBvdXQ7XG59XG5cbi8qKlxuICogVmFyaWFudCBvZiB7QGxpbmsgY29sbGVjdENoYW5nZXN9IHRoYXQgcmVzdHJpY3RzIHRoZSBvdXRwdXQgdG8gY2hhbmdlc1xuICogaW5zaWRlIGByb290YCAoaW5jbHVzaXZlKS4gVXNlZCBmb3IgdGhlIHJlY3Vyc2l2ZSB3YXRjaCBmYWxsYmFjayxcbiAqIHdoaWNoIGZlZWRzIG9mZiB0aGUgdW5jb3JyZWxhdGVkIGdsb2JhbCBzdHJlYW0gYW5kIG11c3QgZmlsdGVyIG91dFxuICogdW5yZWxhdGVkIGV2ZW50cy5cbiAqL1xuZnVuY3Rpb24gY29sbGVjdENoYW5nZXNVbmRlclJvb3QoZXZlbnQ6IEZpbGVDaGFuZ2VzRXZlbnQsIHJvb3Q6IFVSSSk6IElGaWxlQ2hhbmdlW10ge1xuXHRjb25zdCBvdXQ6IElGaWxlQ2hhbmdlW10gPSBbXTtcblx0Y29uc3QgYWNjZXB0ID0gKHJlc291cmNlOiBVUkksIHR5cGU6IEZpbGVDaGFuZ2VUeXBlKSA9PiB7XG5cdFx0aWYgKGlzRXF1YWxPclBhcmVudChyZXNvdXJjZSwgcm9vdCkpIHtcblx0XHRcdG91dC5wdXNoKHsgcmVzb3VyY2UsIHR5cGUgfSk7XG5cdFx0fVxuXHR9O1xuXHRmb3IgKGNvbnN0IHJlc291cmNlIG9mIGV2ZW50LnJhd0FkZGVkKSB7IGFjY2VwdChyZXNvdXJjZSwgRmlsZUNoYW5nZVR5cGUuQURERUQpOyB9XG5cdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgZXZlbnQucmF3VXBkYXRlZCkgeyBhY2NlcHQocmVzb3VyY2UsIEZpbGVDaGFuZ2VUeXBlLlVQREFURUQpOyB9XG5cdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgZXZlbnQucmF3RGVsZXRlZCkgeyBhY2NlcHQocmVzb3VyY2UsIEZpbGVDaGFuZ2VUeXBlLkRFTEVURUQpOyB9XG5cdHJldHVybiBvdXQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLE1BQU0sY0FBK0I7QUFDOUMsU0FBUyxjQUFjLGdCQUFnQjtBQUN2QyxTQUFTLGlCQUFpQixtQkFBbUIsU0FBUyxVQUFVLHFCQUFxQjtBQUNyRixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGVBQTJCO0FBQ3BDLFNBQVMsWUFBWSxlQUFlLHVCQUF1QixpQkFBOEIseUJBQXlCO0FBQ2xILFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMseUJBQXlCLG9CQUFvQjtBQUN0RCxTQUFTLGVBQWU7QUFDeEIsU0FBc0IsdUJBQXVCO0FBQzdDLFNBQVMsV0FBVyxrQkFBa0IsV0FBVyxrQkFBa0IsNEJBQTRCLFNBQVMsaUJBQWlCLGdCQUFnQjtBQUN6SSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCLHFCQUFnRCw2QkFBb0Q7QUFDN0gsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBd0IsY0FBNmtCLG9CQUFvQix5QkFBeUI7QUFDbHBCLFNBQVMsc0NBQTRJLHFCQUFxQjtBQUMxSyxTQUFTLHFCQUFxQixtQ0FBbUM7QUFDakUsU0FBNk0sb0NBQW9DO0FBQ2pQLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsWUFBNEIsb0JBQW1DLHVCQUE4TTtBQUN0UixTQUFTLDRDQUE0QztBQUdyRCxTQUFTLGVBQWUsdUJBQXVCLGlCQUFpQix5QkFBeUIsZUFBZSxvQkFBb0IsY0FBYyx5QkFBd2dCO0FBQ2xwQixTQUF5QixtQkFBbUIsZ0JBQWdCLDZCQUF3STtBQUVwTSxTQUFnRCxhQUFhLGtCQUFrQix5QkFBeUIsc0JBQXNCLDZCQUE2QixpQ0FBaUMsdUJBQXVCLHVCQUF1Qixr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
