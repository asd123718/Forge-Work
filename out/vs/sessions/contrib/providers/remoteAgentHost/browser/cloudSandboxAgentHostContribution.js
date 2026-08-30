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
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { CancellationError } from "../../../../../base/common/errors.js";
import { Event } from "../../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import {
  CLOUD_SANDBOX_AGENT_PROVIDER,
  CLOUD_SANDBOX_SESSION_SCHEME,
  CloudSandboxEnabledSettingId,
  cloudSandboxAddress,
  ICloudSandboxAgentHostService,
  ICloudSandboxApiService
} from "../../../../../platform/agentHost/common/cloudSandboxAgentHost.js";
import { AgentSession } from "../../../../../platform/agentHost/common/agent.js";
import { agentHostAuthority } from "../../../../../platform/agentHost/common/agentHostUri.js";
import { findRemoteAgentHostSessionTypeAuthority, remoteAgentHostSessionTypeId } from "../../../../../platform/agentHost/common/agentHostSessionType.js";
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IAuthenticationService } from "../../../../../workbench/services/authentication/common/authentication.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { ChatSessionsExtensions, IChatSessionsService } from "../../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { CloudSandboxReadOnlySessionHandler } from "./cloudSandboxReadOnlySessionHandler.js";
import { IAgentHostFilterService } from "../../../../services/agentHostFilter/common/agentHostFilter.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { RemoteAgentHostSessionsProvider } from "./remoteAgentHostSessionsProvider.js";
import { IRemoteAgentHostConnectionCustomizationService } from "./remoteAgentHostConnectionCustomization.js";
import { createCloudSandboxConnectionCustomization, isCloudSandboxConnectionAddress } from "./cloudSandboxConnectionCustomization.js";
import { watchForIncompatibleNotifications } from "./remoteHostOptions.js";
const LOG_PREFIX = "[CloudSandboxAgentHost]";
const SANDBOX_SESSION_SCHEME_ALIAS = {
  ui: CLOUD_SANDBOX_AGENT_PROVIDER,
  backend: CLOUD_SANDBOX_SESSION_SCHEME
};
function discoveredSessionProject(repoName) {
  if (!repoName) {
    return void 0;
  }
  return { uri: URI.parse(`https://github.com/${repoName}`), displayName: repoName };
}
let CloudSandboxAgentHostContribution = class extends Disposable {
  constructor(_cloudSandboxService, _apiService, _remoteAgentHostService, _connectionCustomizations, _sessionsProvidersService, _agentHostFilterService, _configurationService, _authenticationService, _instantiationService, _notificationService, _chatSessionsService, _logService) {
    super();
    this._cloudSandboxService = _cloudSandboxService;
    this._apiService = _apiService;
    this._remoteAgentHostService = _remoteAgentHostService;
    this._connectionCustomizations = _connectionCustomizations;
    this._sessionsProvidersService = _sessionsProvidersService;
    this._agentHostFilterService = _agentHostFilterService;
    this._configurationService = _configurationService;
    this._authenticationService = _authenticationService;
    this._instantiationService = _instantiationService;
    this._notificationService = _notificationService;
    this._chatSessionsService = _chatSessionsService;
    this._logService = _logService;
    /** Provider instances keyed by connection address (`cloudsandbox:<envId>`). */
    this._providerInstances = /* @__PURE__ */ new Map();
    this._providerStores = this._register(new DisposableMap());
    /** Environment metadata keyed by connection address, for on-demand reconnect. */
    this._environments = /* @__PURE__ */ new Map();
    /** In-flight connects keyed by address, so concurrent opens share one attempt. */
    this._pendingConnects = /* @__PURE__ */ new Map();
    /**
     * Read-only content providers standing in for unreachable environments, keyed by session type.
     * Disposed when the environment becomes reachable again.
     */
    this._readOnlyHandlers = this._register(new DisposableMap());
    /** Live handler instances, so an already-open session can be settled read-only in place. */
    this._readOnlyInstances = /* @__PURE__ */ new Map();
    /**
     * Cancelled when the feature is disabled (or the contribution is disposed), so in-flight
     * discovery and connects abort instead of committing state after teardown has run.
     */
    this._enabledCts = new CancellationTokenSource();
    /** Whether discovery has completed at least once, used to stop the auth-driven retry. */
    this._hasDiscovered = false;
    this._register(this._connectionCustomizations.register(
      isCloudSandboxConnectionAddress,
      (address) => createCloudSandboxConnectionCustomization(address, this._cloudSandboxService)
    ));
    this._register(this._remoteAgentHostService.onDidChangeConnections(() => {
      for (const connection of this._remoteAgentHostService.connections) {
        if (RemoteAgentHostConnectionStatus.isConnected(connection.status)) {
          this._clearReadOnly(connection.address);
        }
      }
      this._wireConnections();
      this._updateConnectionStatuses();
    }));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CloudSandboxEnabledSettingId) || e.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
        if (this._isEnabled()) {
          void this._discoverAndSeed();
        } else {
          this._teardownAll();
        }
      }
    }));
    this._register(this._agentHostFilterService.registerDiscoveryHandler(() => this._discoverAndSeed()));
    void this._discoverAndSeed();
    const retryUntilFirstSuccess = this._register(new DisposableStore());
    const retry = () => {
      if (this._hasDiscovered) {
        retryUntilFirstSuccess.clear();
        return;
      }
      void this._discoverAndSeed();
    };
    retryUntilFirstSuccess.add(this._authenticationService.onDidChangeSessions(retry));
    retryUntilFirstSuccess.add(this._authenticationService.onDidRegisterAuthenticationProvider(retry));
    this._register(toDisposable(() => {
      this._enabledCts.cancel();
      this._enabledCts.dispose();
    }));
    this._register(Registry.as(ChatSessionsExtensions.AsyncActivation).register({
      matchSessionType: (sessionType) => this._findAddressForSessionType(sessionType) !== void 0,
      waitForActivation: (_accessor, sessionType) => this._waitForActivation(sessionType)
    }));
  }
  /**
   * Discover environment-bound sandbox sessions and seed them into per-environment providers so
   * they appear in the sessions list **without** connecting. Reconciles against the result:
   * environments that have vanished from discovery (e.g. their task was archived) and are not
   * currently connected are torn down, so stale providers/sessions don't linger. Best-effort:
   * a failed discovery is logged and leaves existing state untouched.
   *
   * Runs are serialized, with at most one follow-up queued, so overlapping triggers can't
   * interleave their reconciliation passes.
   */
  _discoverAndSeed() {
    if (this._discoveryInFlight) {
      this._discoveryQueued ??= this._discoveryInFlight.then(() => {
        this._discoveryQueued = void 0;
        return this._discoverAndSeed();
      });
      return this._discoveryQueued;
    }
    this._discoveryInFlight = this._doDiscoverAndSeed().finally(() => {
      this._discoveryInFlight = void 0;
    });
    return this._discoveryInFlight;
  }
  async _doDiscoverAndSeed() {
    if (!this._isEnabled()) {
      return;
    }
    const token = this._enabledCts.token;
    let result;
    try {
      result = await this._apiService.listSessions(token);
    } catch (error) {
      result = { kind: "failed", reason: error instanceof Error ? error.message : String(error) };
    }
    if (result.kind === "failed") {
      this._logService.warn(`${LOG_PREFIX} Discovery failed: ${result.reason}`);
      return;
    }
    if (token.isCancellationRequested || !this._isEnabled()) {
      return;
    }
    this._hasDiscovered = true;
    const present = /* @__PURE__ */ new Set();
    for (const session of result.sessions) {
      if (!session.environmentId || !session.sessionId) {
        continue;
      }
      const address = cloudSandboxAddress(session.environmentId);
      present.add(address);
      this._ensureProvider({ environmentId: session.environmentId, sessionId: session.sessionId, taskId: session.taskId, name: session.name });
      const provider = this._providerInstances.get(address);
      const parsed = session.updatedAt ? Date.parse(session.updatedAt) : Number.NaN;
      const modifiedTime = Number.isNaN(parsed) ? Date.now() : parsed;
      const project = discoveredSessionProject(session.repoName);
      const meta = {
        // Seed under the agent-provider (UI) scheme, preserving the session id. Mission Control
        // issues each session as `ahp-session:/<id>` (the id it also returns here), and the
        // Copilot host lists that same id back, so the seed reconciles deterministically with
        // the live `listSessions()` result on connect. See copilot-host session-identity docs.
        session: AgentSession.uri(CLOUD_SANDBOX_AGENT_PROVIDER, session.sessionId),
        startTime: modifiedTime,
        modifiedTime,
        summary: session.name,
        ...project ? { project } : {}
      };
      provider?.seedSessions([meta]);
    }
    if (result.kind === "complete") {
      for (const address of [...this._environments.keys()]) {
        if (present.has(address)) {
          continue;
        }
        const connected = this._remoteAgentHostService.connections.some((c) => c.address === address);
        if (!connected) {
          this._teardownEnvironment(address);
        }
      }
    }
    this._logService.info(`${LOG_PREFIX} Seeded ${present.size} discovered sandbox environment(s)${result.kind === "partial" ? " (partial scan; kept existing entries)" : ""}.`);
  }
  /**
   * Remove the connection (and its credential refresher) for an environment while keeping the
   * provider and its cached sessions visible in a disconnected state. Disposing the protocol
   * client stops the soft-reconnect loop; the {@link CloudSandboxAgentHostService} prunes the
   * refresher via `onDidChangeConnections`.
   */
  async _disconnectEnvironment(address) {
    try {
      await this._remoteAgentHostService.removeRemoteAgentHost(address);
    } catch (error) {
      this._logService.warn(`${LOG_PREFIX} Failed to disconnect ${address}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  /**
   * Fully tear down an environment: dispose its provider (unregistering it and its sessions) and
   * remove its connection + credential refresher. Used when an environment vanishes from discovery
   * or the feature is disabled.
   */
  _teardownEnvironment(address) {
    this._environments.delete(address);
    this._pendingConnects.delete(address);
    this._providerStores.deleteAndDispose(address);
    this._clearReadOnly(address);
    void this._disconnectEnvironment(address);
  }
  /** Tear down every known sandbox environment (feature disabled). */
  _teardownAll() {
    this._enabledCts.cancel();
    this._enabledCts.dispose();
    this._enabledCts = new CancellationTokenSource();
    for (const address of [...this._environments.keys()]) {
      this._teardownEnvironment(address);
    }
  }
  /** Map each known sandbox connection authority to its address (`cloudsandbox:<envId>`). */
  _authoritiesByAddress() {
    const byAuthority = /* @__PURE__ */ new Map();
    for (const address of this._environments.keys()) {
      byAuthority.set(agentHostAuthority(address), address);
    }
    return byAuthority;
  }
  /** Resolve the sandbox address owning a remote-agent-host session type, if any. */
  _findAddressForSessionType(sessionType) {
    const byAuthority = this._authoritiesByAddress();
    const authority = findRemoteAgentHostSessionTypeAuthority(sessionType, byAuthority.keys());
    return authority ? byAuthority.get(authority) : void 0;
  }
  /**
   * Async-activation hook for a sandbox session type: establish the relay connection on demand,
   * then resolve once the host advertises the agent backing this session type (its content
   * provider is registered), so the chat can load. Returns false if the environment is unknown,
   * the connection fails, or the agent never appears.
   */
  async _waitForActivation(sessionType) {
    const address = this._findAddressForSessionType(sessionType);
    const env = address ? this._environments.get(address) : void 0;
    if (!address || !env) {
      return false;
    }
    const connecting = this.connect({ environmentId: env.environmentId, sessionId: env.sessionId, name: env.name });
    const connectOutcome = connecting.then(() => void 0, (error) => error ?? new Error("connect failed"));
    const prefetchedHistory = this._prefetchHistoryIfDormant(env);
    if (prefetchedHistory) {
      const historyFirst = await Promise.race([
        connectOutcome.then(() => void 0),
        prefetchedHistory
      ]);
      if (historyFirst && this._isEnabled() && !this._enabledCts.token.isCancellationRequested) {
        this._logService.info(`${LOG_PREFIX} History for ${address} arrived before the connect settled; opening it now.`);
        const opened = this._activateReadOnly(sessionType, address, env, prefetchedHistory);
        void connectOutcome.then((connectError2) => {
          if (connectError2 !== void 0 && this._isEnabled() && !this._enabledCts.token.isCancellationRequested) {
            this._logService.info(`${LOG_PREFIX} Connect for ${address} failed after the session opened; settling it read-only.`);
            this._settleReadOnly(sessionType, address);
          }
        });
        return opened;
      }
    }
    const connectError = await connectOutcome;
    if (connectError !== void 0) {
      this._logService.warn(`${LOG_PREFIX} connect-on-open failed for ${address}: ${connectError instanceof Error ? connectError.message : String(connectError)}`);
      if (this._isEnabled() && !this._enabledCts.token.isCancellationRequested) {
        const opened = this._activateReadOnly(sessionType, address, env, prefetchedHistory);
        if (opened) {
          this._settleReadOnly(sessionType, address);
        }
        return opened;
      }
      return false;
    }
    const authority = agentHostAuthority(address);
    while (true) {
      const connection = this._remoteAgentHostService.getConnection(address);
      if (!connection) {
        return false;
      }
      const rootState = connection.rootState.value;
      if (rootState instanceof Error) {
        return false;
      }
      if (rootState) {
        return rootState.agents.some((agent) => remoteAgentHostSessionTypeId(authority, agent.provider) === sessionType);
      }
      await Event.toPromise(connection.rootState.onDidChange);
    }
  }
  /**
   * Persisted history for an environment that is not currently online, or `undefined` when it is
   * online, has no task, or the read failed.
   *
   * `status` cannot predict whether a dormant environment will wake — suspended and deleted both
   * read `offline` — but it does say, in a few hundred milliseconds, that this open is on the slow
   * path, which is enough to start the fetch now. Never rejects; the handler still reads history
   * itself when this yields nothing.
   */
  _prefetchHistoryIfDormant(env) {
    const taskId = env.taskId;
    if (!taskId) {
      return void 0;
    }
    const token = this._enabledCts.token;
    return (async () => {
      try {
        const record = await this._apiService.getEnvironment(env.environmentId, token);
        if (record.status === "online") {
          return void 0;
        }
        this._logService.trace(`${LOG_PREFIX} Environment ${env.environmentId} is '${record.status}'; prefetching history in case the connect does not land.`);
        return await this._apiService.getSessionHistory(taskId, token);
      } catch (error) {
        this._logService.trace(`${LOG_PREFIX} History prefetch for ${env.environmentId} did not complete: ${error instanceof Error ? error.message : String(error)}`);
        return void 0;
      }
    })();
  }
  /**
   * Register a content provider that serves this session from replayed history.
   *
   * Deliberately does *not* mark the session read-only: this also runs while a connect is in
   * flight and the environment may yet wake — callers settle it via {@link _settleReadOnly}.
   * Returns `true` once registered, which is what lets `canResolveChatSession` proceed, or `false`
   * when there is no task to read history from.
   */
  _activateReadOnly(sessionType, address, env, prefetchedHistory) {
    if (this._readOnlyHandlers.has(sessionType)) {
      return true;
    }
    if (this._chatSessionsService.getContentProviderSchemes().includes(sessionType)) {
      this._logService.trace(`${LOG_PREFIX} ${sessionType} already has a content provider; leaving it to serve the session.`);
      return true;
    }
    if (!env.taskId) {
      this._logService.warn(`${LOG_PREFIX} No task id for ${address}; cannot serve history read-only.`);
      return false;
    }
    const store = new DisposableStore();
    const handler = store.add(this._instantiationService.createInstance(CloudSandboxReadOnlySessionHandler, {
      taskId: env.taskId,
      // The live handler registers `agentId === sessionType`; matching it keeps replayed
      // history attributed to the same participant.
      agentId: sessionType,
      connectionAuthority: agentHostAuthority(address),
      prefetchedHistory
    }));
    store.add(this._chatSessionsService.registerChatSessionContentProvider(sessionType, handler));
    this._readOnlyHandlers.set(sessionType, store);
    this._readOnlyInstances.set(sessionType, handler);
    store.add(toDisposable(() => this._readOnlyInstances.delete(sessionType)));
    this._logService.info(`${LOG_PREFIX} Serving ${sessionType} from Mission Control history.`);
    return true;
  }
  /**
   * Settle a history-backed session as read-only once the connect has failed. Sessions already on
   * screen observe this and disable their composer in place, without needing a reopen.
   */
  _settleReadOnly(sessionType, address) {
    const handler = this._readOnlyInstances.get(sessionType);
    if (!handler) {
      return;
    }
    handler.markReadOnly();
    this._providerInstances.get(address)?.setReadOnly(true);
  }
  /**
   * Drop any read-only stand-in for an address so the live handler can own the session type.
   * Registering two content providers for one session type throws, so this must run before a
   * connection is established rather than after.
   */
  _clearReadOnly(address) {
    this._providerInstances.get(address)?.setReadOnly(false);
    const authority = agentHostAuthority(address);
    for (const sessionType of [...this._readOnlyHandlers.keys()]) {
      if (findRemoteAgentHostSessionTypeAuthority(sessionType, [authority]) === authority) {
        this._readOnlyHandlers.deleteAndDispose(sessionType);
        this._logService.info(`${LOG_PREFIX} Dropped read-only stand-in for ${sessionType}; the environment is reachable again.`);
      }
    }
  }
  /**
   * Ensure a provider exists for the environment and establish (or reuse) the
   * connection. Resolves with the connection's display address.
   */
  async connect(options) {
    if (!this._isEnabled()) {
      throw new Error("Copilot cloud sandbox connections are not enabled.");
    }
    const address = cloudSandboxAddress(options.environmentId);
    this._ensureProvider({ environmentId: options.environmentId, sessionId: options.sessionId, name: options.name });
    const pending = this._pendingConnects.get(address);
    if (pending) {
      return pending;
    }
    const token = this._enabledCts.token;
    const attempt = (async () => {
      try {
        this._providerInstances.get(address)?.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
        this._clearReadOnly(address);
        const result = await this._cloudSandboxService.connect(options, token);
        if (token.isCancellationRequested || !this._isEnabled()) {
          void this._disconnectEnvironment(address);
          throw new CancellationError();
        }
        this._wireConnections();
        return result;
      } finally {
        this._pendingConnects.delete(address);
      }
    })();
    this._pendingConnects.set(address, attempt);
    return attempt;
  }
  _isEnabled() {
    return this._configurationService.getValue(CloudSandboxEnabledSettingId) && this._configurationService.getValue(RemoteAgentHostsEnabledSettingId);
  }
  /** Create the sessions provider for an environment if it doesn't exist yet. */
  _ensureProvider(env) {
    const address = cloudSandboxAddress(env.environmentId);
    const known = this._environments.get(address);
    this._environments.set(address, { ...known, ...env, taskId: env.taskId ?? known?.taskId });
    if (this._providerStores.has(address)) {
      return;
    }
    const store = new DisposableStore();
    const provider = this._instantiateProvider({
      address,
      name: env.name,
      connectOnDemand: () => this.connect({ environmentId: env.environmentId, sessionId: env.sessionId, name: env.name }).then(() => {
      }),
      sessionSchemeAlias: SANDBOX_SESSION_SCHEME_ALIAS,
      // Each sandbox is its own provider named after its task, so the `[host]` suffix would
      // put every session in a workspace group of one.
      omitHostFromWorkspaceLabel: true,
      // A sandbox is a disposable remote environment, not a checkout on disk.
      workspaceTypeIcon: Codicon.package
    });
    store.add(provider);
    store.add(this._sessionsProvidersService.registerProvider(provider));
    store.add(watchForIncompatibleNotifications(provider, this._instantiationService, this._notificationService));
    this._providerInstances.set(address, provider);
    store.add(toDisposable(() => this._providerInstances.delete(address)));
    this._providerStores.set(address, store);
    this._logService.info(`${LOG_PREFIX} Registered sessions provider for ${address}`);
  }
  /**
   * Provider construction seam so tests can observe each provider's configuration.
   */
  _instantiateProvider(config) {
    return this._instantiationService.createInstance(RemoteAgentHostSessionsProvider, config);
  }
  /** Wire each live connection to its provider so session enumeration runs. */
  _wireConnections() {
    for (const [address, provider] of this._providerInstances) {
      const connectionInfo = this._remoteAgentHostService.connections.find(
        (c) => c.address === address && RemoteAgentHostConnectionStatus.isConnected(c.status)
      );
      if (connectionInfo) {
        const connection = this._remoteAgentHostService.getConnection(address);
        if (connection) {
          provider.setConnection(connection, connectionInfo.defaultDirectory);
        }
      }
    }
  }
  /** Push the service's authoritative connection status onto each provider. */
  _updateConnectionStatuses() {
    for (const [address, provider] of this._providerInstances) {
      const connectionInfo = this._remoteAgentHostService.connections.find((c) => c.address === address);
      if (connectionInfo) {
        provider.setConnectionStatus(connectionInfo.status);
      } else if (!RemoteAgentHostConnectionStatus.isIncompatible(provider.connectionStatus.get())) {
        provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
      }
    }
  }
};
CloudSandboxAgentHostContribution.ID = "workbench.contrib.cloudSandboxAgentHost";
CloudSandboxAgentHostContribution = __decorateClass([
  __decorateParam(0, ICloudSandboxAgentHostService),
  __decorateParam(1, ICloudSandboxApiService),
  __decorateParam(2, IRemoteAgentHostService),
  __decorateParam(3, IRemoteAgentHostConnectionCustomizationService),
  __decorateParam(4, ISessionsProvidersService),
  __decorateParam(5, IAgentHostFilterService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IAuthenticationService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, INotificationService),
  __decorateParam(10, IChatSessionsService),
  __decorateParam(11, ILogService)
], CloudSandboxAgentHostContribution);
export {
  CloudSandboxAgentHostContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxyZW1vdGVBZ2VudEhvc3RcXGJyb3dzZXJcXGNsb3VkU2FuZGJveEFnZW50SG9zdENvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8vIFN1cmZhY2VzIENvcGlsb3QgY2xvdWQgc2FuZGJveCAoY29waWxvdC1kZXZlbG9wZXItY2xpKSBzZXNzaW9ucyBhcyBuYXRpdmUgYWdlbnQtaG9zdCBzZXNzaW9ucy5cbi8vIE93bnMgYSBSZW1vdGVBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyIHBlciBzYW5kYm94IGVudmlyb25tZW50LCBjb25uZWN0cyBvbiBkZW1hbmQgdmlhXG4vLyBDbG91ZFNhbmRib3hBZ2VudEhvc3RTZXJ2aWNlLCBhbmQgd2lyZXMgdGhlIGxpdmUgY29ubmVjdGlvbiB0byB0aGUgcHJvdmlkZXIgc28gdGhlIG5hdGl2ZSBzZXNzaW9uXG4vLyBtYWNoaW5lcnkgY2FuIGVudW1lcmF0ZSBhbmQgcmVuZGVyIHRoZSBob3N0J3Mgc2Vzc2lvbnMuXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQge1xuXHRDTE9VRF9TQU5EQk9YX0FHRU5UX1BST1ZJREVSLFxuXHRDTE9VRF9TQU5EQk9YX1NFU1NJT05fU0NIRU1FLFxuXHRDbG91ZFNhbmRib3hFbmFibGVkU2V0dGluZ0lkLFxuXHRjbG91ZFNhbmRib3hBZGRyZXNzLFxuXHRJQ2xvdWRTYW5kYm94QWdlbnRIb3N0U2VydmljZSxcblx0SUNsb3VkU2FuZGJveEFwaVNlcnZpY2UsXG5cdHR5cGUgSUNsb3VkU2FuZGJveENvbm5lY3RPcHRpb25zLFxuXHR0eXBlIElDbG91ZFNhbmRib3hEaXNjb3ZlcnlSZXN1bHQsXG59IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vY2xvdWRTYW5kYm94QWdlbnRIb3N0LmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbiwgdHlwZSBJQWdlbnRTZXNzaW9uTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB7IElSZXBsYXllZFRhc2tIaXN0b3J5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi90YXNrRXZlbnRSZXBsYXkuanMnO1xuaW1wb3J0IHsgYWdlbnRIb3N0QXV0aG9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RVcmkuanMnO1xuaW1wb3J0IHsgZmluZFJlbW90ZUFnZW50SG9zdFNlc3Npb25UeXBlQXV0aG9yaXR5LCByZW1vdGVBZ2VudEhvc3RTZXNzaW9uVHlwZUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RTZXNzaW9uVHlwZS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSwgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cywgUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IENoYXRTZXNzaW9uc0V4dGVuc2lvbnMsIElBc3luY0NoYXRTZXNzaW9uQWN0aXZhdGlvblJlZ2lzdHJ5LCBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2xvdWRTYW5kYm94UmVhZE9ubHlTZXNzaW9uSGFuZGxlciB9IGZyb20gJy4vY2xvdWRTYW5kYm94UmVhZE9ubHlTZXNzaW9uSGFuZGxlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0RmlsdGVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2FnZW50SG9zdEZpbHRlci9jb21tb24vYWdlbnRIb3N0RmlsdGVyLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvblNjaGVtZUFsaWFzLCBJUmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlckNvbmZpZywgUmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciB9IGZyb20gJy4vcmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkN1c3RvbWl6YXRpb25TZXJ2aWNlIH0gZnJvbSAnLi9yZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uQ3VzdG9taXphdGlvbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDbG91ZFNhbmRib3hDb25uZWN0aW9uQ3VzdG9taXphdGlvbiwgaXNDbG91ZFNhbmRib3hDb25uZWN0aW9uQWRkcmVzcyB9IGZyb20gJy4vY2xvdWRTYW5kYm94Q29ubmVjdGlvbkN1c3RvbWl6YXRpb24uanMnO1xuaW1wb3J0IHsgd2F0Y2hGb3JJbmNvbXBhdGlibGVOb3RpZmljYXRpb25zIH0gZnJvbSAnLi9yZW1vdGVIb3N0T3B0aW9ucy5qcyc7XG5cbmNvbnN0IExPR19QUkVGSVggPSAnW0Nsb3VkU2FuZGJveEFnZW50SG9zdF0nO1xuXG4vKipcbiAqIE1pc3Npb24gQ29udHJvbCBjcmVhdGVzIGV2ZXJ5IHNhbmRib3ggc2Vzc2lvbiBhcyBgYWhwLXNlc3Npb246LzxpZD5gIHdoaWxlIHRoZSBob3N0IGFkdmVydGlzZXMgdGhlXG4gKiBgY29waWxvdGAgYWdlbnQsIHNvIHRoZSB0d28gc2NoZW1lcyBuYW1lIHRoZSBzYW1lIHNlc3Npb24uXG4gKi9cbmNvbnN0IFNBTkRCT1hfU0VTU0lPTl9TQ0hFTUVfQUxJQVM6IElTZXNzaW9uU2NoZW1lQWxpYXMgPSB7XG5cdHVpOiBDTE9VRF9TQU5EQk9YX0FHRU5UX1BST1ZJREVSLFxuXHRiYWNrZW5kOiBDTE9VRF9TQU5EQk9YX1NFU1NJT05fU0NIRU1FLFxufTtcblxuLyoqIEEgZGlzY292ZXJlZCBzYW5kYm94IGVudmlyb25tZW50IHdlIGNhbiBjcmVhdGUgYSBwcm92aWRlciBmb3IuICovXG5pbnRlcmZhY2UgSUNsb3VkU2FuZGJveEVudmlyb25tZW50IHtcblx0cmVhZG9ubHkgZW52aXJvbm1lbnRJZDogc3RyaW5nO1xuXHRyZWFkb25seSBzZXNzaW9uSWQ/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBNaXNzaW9uIENvbnRyb2wgdGFzayBvd25pbmcgdGhlIHNlc3Npb24uIFBlcnNpc3RlZCBBSFAgaGlzdG9yeSBpcyBhZGRyZXNzZWQgcGVyIHRhc2ssIHNvIHRoaXNcblx0ICogaXMgd2hhdCBtYWtlcyB0aGUgY29udmVyc2F0aW9uIHJlYWRhYmxlIG9uY2UgdGhlIGVudmlyb25tZW50IGlzIHVucmVhY2hhYmxlLlxuXHQgKi9cblx0cmVhZG9ubHkgdGFza0lkPzogc3RyaW5nO1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG59XG5cbi8qKlxuICogVGhlIHJlcG9zaXRvcnkgYSBkaXNjb3ZlcmVkIHNlc3Npb24gYmVsb25ncyB0bywgbWF0Y2hpbmcgdGhlIHNoYXBlIHRoZSBzYW5kYm94IGhvc3QgcmVwb3J0cyBvbmNlXG4gKiBjb25uZWN0ZWQgc28gcmVjb25uZWN0aW5nIGRvZXMgbm90IHZpc2libHkgcmVncm91cCB0aGUgc2Vzc2lvbi5cbiAqXG4gKiBUaGUgYGh0dHBzYCBVUkkgaWRlbnRpZmllcyB0aGUgcmVwb3NpdG9yeSBidXQgaXMgbm90IGJhY2tlZCBieSBhIGZpbGUgc3lzdGVtIHByb3ZpZGVyLCBzbyBhXG4gKiBzZXNzaW9uIGRpc2NvdmVyZWQgdGhpcyB3YXkgY2Fubm90IGJyb3dzZSBpdHMgZmlsZXMgdW50aWwgaXQgY29ubmVjdHMuXG4gKi9cbmZ1bmN0aW9uIGRpc2NvdmVyZWRTZXNzaW9uUHJvamVjdChyZXBvTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogSUFnZW50U2Vzc2lvbk1ldGFkYXRhWydwcm9qZWN0J10ge1xuXHRpZiAoIXJlcG9OYW1lKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4geyB1cmk6IFVSSS5wYXJzZShgaHR0cHM6Ly9naXRodWIuY29tLyR7cmVwb05hbWV9YCksIGRpc3BsYXlOYW1lOiByZXBvTmFtZSB9O1xufVxuXG5leHBvcnQgY2xhc3MgQ2xvdWRTYW5kYm94QWdlbnRIb3N0Q29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY2xvdWRTYW5kYm94QWdlbnRIb3N0JztcblxuXHQvKiogUHJvdmlkZXIgaW5zdGFuY2VzIGtleWVkIGJ5IGNvbm5lY3Rpb24gYWRkcmVzcyAoYGNsb3Vkc2FuZGJveDo8ZW52SWQ+YCkuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVySW5zdGFuY2VzID0gbmV3IE1hcDxzdHJpbmcsIFJlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyU3RvcmVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nPigpKTtcblx0LyoqIEVudmlyb25tZW50IG1ldGFkYXRhIGtleWVkIGJ5IGNvbm5lY3Rpb24gYWRkcmVzcywgZm9yIG9uLWRlbWFuZCByZWNvbm5lY3QuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50cyA9IG5ldyBNYXA8c3RyaW5nLCBJQ2xvdWRTYW5kYm94RW52aXJvbm1lbnQ+KCk7XG5cdC8qKiBJbi1mbGlnaHQgY29ubmVjdHMga2V5ZWQgYnkgYWRkcmVzcywgc28gY29uY3VycmVudCBvcGVucyBzaGFyZSBvbmUgYXR0ZW1wdC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0Nvbm5lY3RzID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8c3RyaW5nPj4oKTtcblx0LyoqXG5cdCAqIFJlYWQtb25seSBjb250ZW50IHByb3ZpZGVycyBzdGFuZGluZyBpbiBmb3IgdW5yZWFjaGFibGUgZW52aXJvbm1lbnRzLCBrZXllZCBieSBzZXNzaW9uIHR5cGUuXG5cdCAqIERpc3Bvc2VkIHdoZW4gdGhlIGVudmlyb25tZW50IGJlY29tZXMgcmVhY2hhYmxlIGFnYWluLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVhZE9ubHlIYW5kbGVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPHN0cmluZz4oKSk7XG5cdC8qKiBMaXZlIGhhbmRsZXIgaW5zdGFuY2VzLCBzbyBhbiBhbHJlYWR5LW9wZW4gc2Vzc2lvbiBjYW4gYmUgc2V0dGxlZCByZWFkLW9ubHkgaW4gcGxhY2UuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlYWRPbmx5SW5zdGFuY2VzID0gbmV3IE1hcDxzdHJpbmcsIENsb3VkU2FuZGJveFJlYWRPbmx5U2Vzc2lvbkhhbmRsZXI+KCk7XG5cdC8qKlxuXHQgKiBDYW5jZWxsZWQgd2hlbiB0aGUgZmVhdHVyZSBpcyBkaXNhYmxlZCAob3IgdGhlIGNvbnRyaWJ1dGlvbiBpcyBkaXNwb3NlZCksIHNvIGluLWZsaWdodFxuXHQgKiBkaXNjb3ZlcnkgYW5kIGNvbm5lY3RzIGFib3J0IGluc3RlYWQgb2YgY29tbWl0dGluZyBzdGF0ZSBhZnRlciB0ZWFyZG93biBoYXMgcnVuLlxuXHQgKi9cblx0cHJpdmF0ZSBfZW5hYmxlZEN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHQvKiogU2VyaWFsaXplcyBkaXNjb3Zlcnkgc28gb3ZlcmxhcHBpbmcgdHJpZ2dlcnMgY2FuJ3QgaW50ZXJsZWF2ZSByZWNvbmNpbGlhdGlvbi4gKi9cblx0cHJpdmF0ZSBfZGlzY292ZXJ5SW5GbGlnaHQ6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2Rpc2NvdmVyeVF1ZXVlZDogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0LyoqIFdoZXRoZXIgZGlzY292ZXJ5IGhhcyBjb21wbGV0ZWQgYXQgbGVhc3Qgb25jZSwgdXNlZCB0byBzdG9wIHRoZSBhdXRoLWRyaXZlbiByZXRyeS4gKi9cblx0cHJpdmF0ZSBfaGFzRGlzY292ZXJlZCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2xvdWRTYW5kYm94QWdlbnRIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jbG91ZFNhbmRib3hTZXJ2aWNlOiBJQ2xvdWRTYW5kYm94QWdlbnRIb3N0U2VydmljZSxcblx0XHRASUNsb3VkU2FuZGJveEFwaVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYXBpU2VydmljZTogSUNsb3VkU2FuZGJveEFwaVNlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3JlbW90ZUFnZW50SG9zdFNlcnZpY2U6IElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkN1c3RvbWl6YXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3Rpb25DdXN0b21pemF0aW9uczogSVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25DdXN0b21pemF0aW9uU2VydmljZSxcblx0XHRASVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U6IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50SG9zdEZpbHRlclNlcnZpY2U6IElBZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gU3VwcGx5IHRoZSBnZW5lcmljIHJlbW90ZS1hZ2VudC1ob3N0IGNvbnRyaWJ1dGlvbiB3aXRoIHRoZSBzYW5kYm94IGhvc3QncyBwZXItY29ubmVjdGlvblxuXHRcdC8vIGRldmlhdGlvbnMgKHNlYWxlZC10b2tlbiBhdXRoICsgYGFocC1zZXNzaW9uYCBiYWNrZW5kIHNjaGVtZSkgd2l0aG91dCBsZWFraW5nIHNhbmRib3hcblx0XHQvLyBzcGVjaWZpY3MgaW50byB0aGF0IHNoYXJlZCBjb2RlIHBhdGguXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29ubmVjdGlvbkN1c3RvbWl6YXRpb25zLnJlZ2lzdGVyKFxuXHRcdFx0aXNDbG91ZFNhbmRib3hDb25uZWN0aW9uQWRkcmVzcyxcblx0XHRcdGFkZHJlc3MgPT4gY3JlYXRlQ2xvdWRTYW5kYm94Q29ubmVjdGlvbkN1c3RvbWl6YXRpb24oYWRkcmVzcywgdGhpcy5fY2xvdWRTYW5kYm94U2VydmljZSkhLFxuXHRcdCkpO1xuXG5cdFx0Ly8gS2VlcCBwcm92aWRlcnMgd2lyZWQgdG8gdGhlaXIgbGl2ZSBjb25uZWN0aW9ucyBhbmQgdGhlaXIgc3RhdHVzIGZyZXNoLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2Uub25EaWRDaGFuZ2VDb25uZWN0aW9ucygoKSA9PiB7XG5cdFx0XHQvLyBEcm9wIGEgc3RhbmQtaW4gcmVnaXN0ZXJlZCBtaWQtY29ubmVjdCBiZWZvcmUgd2lyaW5nOiB3aXJpbmcgcHVibGlzaGVzIHRoZSBzZXNzaW9uLCBhbmRcblx0XHRcdC8vIHR3byBjb250ZW50IHByb3ZpZGVycyBmb3Igb25lIHNlc3Npb24gdHlwZSB0aHJvd3MuXG5cdFx0XHRmb3IgKGNvbnN0IGNvbm5lY3Rpb24gb2YgdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5jb25uZWN0aW9ucykge1xuXHRcdFx0XHRpZiAoUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjb25uZWN0aW9uLnN0YXR1cykpIHtcblx0XHRcdFx0XHR0aGlzLl9jbGVhclJlYWRPbmx5KGNvbm5lY3Rpb24uYWRkcmVzcyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX3dpcmVDb25uZWN0aW9ucygpO1xuXHRcdFx0dGhpcy5fdXBkYXRlQ29ubmVjdGlvblN0YXR1c2VzKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVhY3QgdG8gdGhlIGZlYXR1cmUgdG9nZ2xlcyBhdCBydW50aW1lOiAocmUpZGlzY292ZXIgd2hlbiBlbmFibGVkLCB0ZWFyIGV2ZXJ5dGhpbmcgZG93blxuXHRcdC8vIHdoZW4gZGlzYWJsZWQsIHNvIGVuYWJsaW5nIHRoZSBzZXR0aW5nIGRvZXNuJ3QgcmVxdWlyZSBhIHJlbG9hZCBhbmQgZGlzYWJsaW5nIGl0IGRvZXNuJ3Rcblx0XHQvLyBsZWF2ZSBzdGFsZSBwcm92aWRlcnMsIGNvbm5lY3Rpb25zLCBvciBjcmVkZW50aWFsIHJlZnJlc2hlcnMgYmVoaW5kLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKENsb3VkU2FuZGJveEVuYWJsZWRTZXR0aW5nSWQpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9pc0VuYWJsZWQoKSkge1xuXHRcdFx0XHRcdHZvaWQgdGhpcy5fZGlzY292ZXJBbmRTZWVkKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fdGVhcmRvd25BbGwoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIExhenkgZGlzY292ZXJ5OiBzdXJmYWNlIGVudmlyb25tZW50LWJvdW5kIHNhbmRib3ggc2Vzc2lvbnMgaW4gdGhlIGxpc3Rcblx0XHQvLyB3aXRob3V0IGNvbm5lY3RpbmcuIFJ1bnMgd2hlbiB0aGUgQWdlbnRzIHdpbmRvdyAocmUpZGlzY292ZXJzIGhvc3RzIGFuZFxuXHRcdC8vIG9uY2Ugbm93IHNvIHNlc3Npb25zIGFwcGVhciBvbiBzdGFydHVwLiBDb25uZWN0aW5nIGhhcHBlbnMgb24gb3BlbiB2aWFcblx0XHQvLyB0aGUgc2FuZGJveCBhc3luYyBhY3RpdmF0b3IuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYWdlbnRIb3N0RmlsdGVyU2VydmljZS5yZWdpc3RlckRpc2NvdmVyeUhhbmRsZXIoKCkgPT4gdGhpcy5fZGlzY292ZXJBbmRTZWVkKCkpKTtcblx0XHR2b2lkIHRoaXMuX2Rpc2NvdmVyQW5kU2VlZCgpO1xuXG5cdFx0Ly8gRGlzY292ZXJ5IG5lZWRzIGEgR2l0SHViIHNlc3Npb24sIGFuZCB0aGUgYXV0aCBwcm92aWRlciBpcyBjb250cmlidXRlZCBieSBhbiBleHRlbnNpb24gdGhhdFxuXHRcdC8vIG1heSBub3QgYmUgcmVnaXN0ZXJlZCB5ZXQgYXQgc3RhcnR1cC4gUmV0cnkgYXMgc2Vzc2lvbnMgYmVjb21lIGF2YWlsYWJsZSwgdW50aWwgdGhlIGZpcnN0XG5cdFx0Ly8gc3VjY2VzczsgZnJvbSB0aGVuIG9uIHRoZSBkaXNjb3ZlcnkgaGFuZGxlciBhYm92ZSBkcml2ZXMgcmVmcmVzaGVzLlxuXHRcdGNvbnN0IHJldHJ5VW50aWxGaXJzdFN1Y2Nlc3MgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IHJldHJ5ID0gKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2hhc0Rpc2NvdmVyZWQpIHtcblx0XHRcdFx0cmV0cnlVbnRpbEZpcnN0U3VjY2Vzcy5jbGVhcigpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR2b2lkIHRoaXMuX2Rpc2NvdmVyQW5kU2VlZCgpO1xuXHRcdH07XG5cdFx0cmV0cnlVbnRpbEZpcnN0U3VjY2Vzcy5hZGQodGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbnMocmV0cnkpKTtcblx0XHRyZXRyeVVudGlsRmlyc3RTdWNjZXNzLmFkZCh0aGlzLl9hdXRoZW50aWNhdGlvblNlcnZpY2Uub25EaWRSZWdpc3RlckF1dGhlbnRpY2F0aW9uUHJvdmlkZXIocmV0cnkpKTtcblxuXHRcdC8vIENvbm5lY3Qtb24tb3Blbjogd2hlbiBhIHNlZWRlZCBzYW5kYm94IHNlc3Npb24gaXMgb3BlbmVkLCB0aGUgY2hhdFxuXHRcdC8vIHNlcnZpY2UgcmVzb2x2ZXMgaXQgdGhyb3VnaCB0aGlzIGFzeW5jIGFjdGl2YXRvciwgd2hpY2ggZXN0YWJsaXNoZXMgdGhlXG5cdFx0Ly8gcmVsYXkgY29ubmVjdGlvbiBhbmQgd2FpdHMgZm9yIHRoZSBob3N0IHRvIGFkdmVydGlzZSB0aGUgc2Vzc2lvbidzIGFnZW50XG5cdFx0Ly8gKHNvIGl0cyBjb250ZW50IHByb3ZpZGVyIHJlZ2lzdGVycykgYmVmb3JlIHRoZSBjaGF0IGxvYWRzLiBTY29wZWQgdG8gb3VyXG5cdFx0Ly8gc2FuZGJveCBhdXRob3JpdGllcyBzbyBpdCBuZXZlciBpbnRlcmNlcHRzIG90aGVyIHJlbW90ZS1hZ2VudC1ob3N0IHR5cGVzLlxuXHRcdC8vIFRoZSBzb3VyY2UgaXMgc3dhcHBlZCBvdXQgYnkgYF90ZWFyZG93bkFsbGAsIHNvIGNhbmNlbCB3aGljaGV2ZXIgb25lIGlzIGN1cnJlbnQgb24gZGlzcG9zZS5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZW5hYmxlZEN0cy5jYW5jZWwoKTtcblx0XHRcdHRoaXMuX2VuYWJsZWRDdHMuZGlzcG9zZSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKFJlZ2lzdHJ5LmFzPElBc3luY0NoYXRTZXNzaW9uQWN0aXZhdGlvblJlZ2lzdHJ5PihDaGF0U2Vzc2lvbnNFeHRlbnNpb25zLkFzeW5jQWN0aXZhdGlvbikucmVnaXN0ZXIoe1xuXHRcdFx0bWF0Y2hTZXNzaW9uVHlwZTogc2Vzc2lvblR5cGUgPT4gdGhpcy5fZmluZEFkZHJlc3NGb3JTZXNzaW9uVHlwZShzZXNzaW9uVHlwZSkgIT09IHVuZGVmaW5lZCxcblx0XHRcdHdhaXRGb3JBY3RpdmF0aW9uOiAoX2FjY2Vzc29yLCBzZXNzaW9uVHlwZSkgPT4gdGhpcy5fd2FpdEZvckFjdGl2YXRpb24oc2Vzc2lvblR5cGUpLFxuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEaXNjb3ZlciBlbnZpcm9ubWVudC1ib3VuZCBzYW5kYm94IHNlc3Npb25zIGFuZCBzZWVkIHRoZW0gaW50byBwZXItZW52aXJvbm1lbnQgcHJvdmlkZXJzIHNvXG5cdCAqIHRoZXkgYXBwZWFyIGluIHRoZSBzZXNzaW9ucyBsaXN0ICoqd2l0aG91dCoqIGNvbm5lY3RpbmcuIFJlY29uY2lsZXMgYWdhaW5zdCB0aGUgcmVzdWx0OlxuXHQgKiBlbnZpcm9ubWVudHMgdGhhdCBoYXZlIHZhbmlzaGVkIGZyb20gZGlzY292ZXJ5IChlLmcuIHRoZWlyIHRhc2sgd2FzIGFyY2hpdmVkKSBhbmQgYXJlIG5vdFxuXHQgKiBjdXJyZW50bHkgY29ubmVjdGVkIGFyZSB0b3JuIGRvd24sIHNvIHN0YWxlIHByb3ZpZGVycy9zZXNzaW9ucyBkb24ndCBsaW5nZXIuIEJlc3QtZWZmb3J0OlxuXHQgKiBhIGZhaWxlZCBkaXNjb3ZlcnkgaXMgbG9nZ2VkIGFuZCBsZWF2ZXMgZXhpc3Rpbmcgc3RhdGUgdW50b3VjaGVkLlxuXHQgKlxuXHQgKiBSdW5zIGFyZSBzZXJpYWxpemVkLCB3aXRoIGF0IG1vc3Qgb25lIGZvbGxvdy11cCBxdWV1ZWQsIHNvIG92ZXJsYXBwaW5nIHRyaWdnZXJzIGNhbid0XG5cdCAqIGludGVybGVhdmUgdGhlaXIgcmVjb25jaWxpYXRpb24gcGFzc2VzLlxuXHQgKi9cblx0cHJpdmF0ZSBfZGlzY292ZXJBbmRTZWVkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9kaXNjb3ZlcnlJbkZsaWdodCkge1xuXHRcdFx0dGhpcy5fZGlzY292ZXJ5UXVldWVkID8/PSB0aGlzLl9kaXNjb3ZlcnlJbkZsaWdodC50aGVuKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fZGlzY292ZXJ5UXVldWVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZGlzY292ZXJBbmRTZWVkKCk7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiB0aGlzLl9kaXNjb3ZlcnlRdWV1ZWQ7XG5cdFx0fVxuXHRcdHRoaXMuX2Rpc2NvdmVyeUluRmxpZ2h0ID0gdGhpcy5fZG9EaXNjb3ZlckFuZFNlZWQoKS5maW5hbGx5KCgpID0+IHtcblx0XHRcdHRoaXMuX2Rpc2NvdmVyeUluRmxpZ2h0ID0gdW5kZWZpbmVkO1xuXHRcdH0pO1xuXHRcdHJldHVybiB0aGlzLl9kaXNjb3ZlcnlJbkZsaWdodDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2RvRGlzY292ZXJBbmRTZWVkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5faXNFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdG9rZW4gPSB0aGlzLl9lbmFibGVkQ3RzLnRva2VuO1xuXHRcdGxldCByZXN1bHQ6IElDbG91ZFNhbmRib3hEaXNjb3ZlcnlSZXN1bHQ7XG5cdFx0dHJ5IHtcblx0XHRcdHJlc3VsdCA9IGF3YWl0IHRoaXMuX2FwaVNlcnZpY2UubGlzdFNlc3Npb25zKHRva2VuKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0cmVzdWx0ID0geyBraW5kOiAnZmFpbGVkJywgcmVhc29uOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcikgfTtcblx0XHR9XG5cdFx0aWYgKHJlc3VsdC5raW5kID09PSAnZmFpbGVkJykge1xuXHRcdFx0Ly8gTm90IFwibm8gc2Vzc2lvbnNcIiBcdTIwMTQgbGVhdmUgZXhpc3Rpbmcgc3RhdGUgYWxvbmUsIGFuZCBzdGF5IGVsaWdpYmxlIGZvciB0aGUgYXV0aCByZXRyeS5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBEaXNjb3ZlcnkgZmFpbGVkOiAke3Jlc3VsdC5yZWFzb259YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIFRoZSBmZWF0dXJlIG1heSBoYXZlIGJlZW4gZGlzYWJsZWQgd2hpbGUgdGhlIHNjYW4gd2FzIGluIGZsaWdodC5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQgfHwgIXRoaXMuX2lzRW5hYmxlZCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2hhc0Rpc2NvdmVyZWQgPSB0cnVlO1xuXG5cdFx0Y29uc3QgcHJlc2VudCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiByZXN1bHQuc2Vzc2lvbnMpIHtcblx0XHRcdGlmICghc2Vzc2lvbi5lbnZpcm9ubWVudElkIHx8ICFzZXNzaW9uLnNlc3Npb25JZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFkZHJlc3MgPSBjbG91ZFNhbmRib3hBZGRyZXNzKHNlc3Npb24uZW52aXJvbm1lbnRJZCk7XG5cdFx0XHRwcmVzZW50LmFkZChhZGRyZXNzKTtcblx0XHRcdHRoaXMuX2Vuc3VyZVByb3ZpZGVyKHsgZW52aXJvbm1lbnRJZDogc2Vzc2lvbi5lbnZpcm9ubWVudElkLCBzZXNzaW9uSWQ6IHNlc3Npb24uc2Vzc2lvbklkLCB0YXNrSWQ6IHNlc3Npb24udGFza0lkLCBuYW1lOiBzZXNzaW9uLm5hbWUgfSk7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX3Byb3ZpZGVySW5zdGFuY2VzLmdldChhZGRyZXNzKTtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IHNlc3Npb24udXBkYXRlZEF0ID8gRGF0ZS5wYXJzZShzZXNzaW9uLnVwZGF0ZWRBdCkgOiBOdW1iZXIuTmFOO1xuXHRcdFx0Y29uc3QgbW9kaWZpZWRUaW1lID0gTnVtYmVyLmlzTmFOKHBhcnNlZCkgPyBEYXRlLm5vdygpIDogcGFyc2VkO1xuXHRcdFx0Y29uc3QgcHJvamVjdCA9IGRpc2NvdmVyZWRTZXNzaW9uUHJvamVjdChzZXNzaW9uLnJlcG9OYW1lKTtcblx0XHRcdGNvbnN0IG1ldGE6IElBZ2VudFNlc3Npb25NZXRhZGF0YSA9IHtcblx0XHRcdFx0Ly8gU2VlZCB1bmRlciB0aGUgYWdlbnQtcHJvdmlkZXIgKFVJKSBzY2hlbWUsIHByZXNlcnZpbmcgdGhlIHNlc3Npb24gaWQuIE1pc3Npb24gQ29udHJvbFxuXHRcdFx0XHQvLyBpc3N1ZXMgZWFjaCBzZXNzaW9uIGFzIGBhaHAtc2Vzc2lvbjovPGlkPmAgKHRoZSBpZCBpdCBhbHNvIHJldHVybnMgaGVyZSksIGFuZCB0aGVcblx0XHRcdFx0Ly8gQ29waWxvdCBob3N0IGxpc3RzIHRoYXQgc2FtZSBpZCBiYWNrLCBzbyB0aGUgc2VlZCByZWNvbmNpbGVzIGRldGVybWluaXN0aWNhbGx5IHdpdGhcblx0XHRcdFx0Ly8gdGhlIGxpdmUgYGxpc3RTZXNzaW9ucygpYCByZXN1bHQgb24gY29ubmVjdC4gU2VlIGNvcGlsb3QtaG9zdCBzZXNzaW9uLWlkZW50aXR5IGRvY3MuXG5cdFx0XHRcdHNlc3Npb246IEFnZW50U2Vzc2lvbi51cmkoQ0xPVURfU0FOREJPWF9BR0VOVF9QUk9WSURFUiwgc2Vzc2lvbi5zZXNzaW9uSWQpLFxuXHRcdFx0XHRzdGFydFRpbWU6IG1vZGlmaWVkVGltZSxcblx0XHRcdFx0bW9kaWZpZWRUaW1lLFxuXHRcdFx0XHRzdW1tYXJ5OiBzZXNzaW9uLm5hbWUsXG5cdFx0XHRcdC4uLihwcm9qZWN0ID8geyBwcm9qZWN0IH0gOiB7fSksXG5cdFx0XHR9O1xuXHRcdFx0cHJvdmlkZXI/LnNlZWRTZXNzaW9ucyhbbWV0YV0pO1xuXHRcdH1cblxuXHRcdC8vIE5lZ2F0aXZlIHJlY29uY2lsaWF0aW9uOiBkcm9wIGVudmlyb25tZW50cyB0aGF0IGFyZSBubyBsb25nZXIgZGlzY292ZXJhYmxlIGFuZCBhcmVuJ3Rcblx0XHQvLyBjdXJyZW50bHkgY29ubmVjdGVkIChhbiBvcGVuL2Nvbm5lY3RlZCBzZXNzaW9uIGlzIGtlcHQgc28gYWN0aXZlIHVzZSBpc24ndCBkaXNydXB0ZWQpLlxuXHRcdC8vIE9ubHkgYSBjb21wbGV0ZSBzY2FuIGlzIGF1dGhvcml0YXRpdmUgXHUyMDE0IGEgcGFydGlhbCBvbmUgaXMgbWlzc2luZyBlbnRyaWVzIHRoYXQgc3RpbGwgZXhpc3QuXG5cdFx0aWYgKHJlc3VsdC5raW5kID09PSAnY29tcGxldGUnKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGFkZHJlc3Mgb2YgWy4uLnRoaXMuX2Vudmlyb25tZW50cy5rZXlzKCldKSB7XG5cdFx0XHRcdGlmIChwcmVzZW50LmhhcyhhZGRyZXNzKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNvbm5lY3RlZCA9IHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuY29ubmVjdGlvbnMuc29tZShjID0+IGMuYWRkcmVzcyA9PT0gYWRkcmVzcyk7XG5cdFx0XHRcdGlmICghY29ubmVjdGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fdGVhcmRvd25FbnZpcm9ubWVudChhZGRyZXNzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBTZWVkZWQgJHtwcmVzZW50LnNpemV9IGRpc2NvdmVyZWQgc2FuZGJveCBlbnZpcm9ubWVudChzKSR7cmVzdWx0LmtpbmQgPT09ICdwYXJ0aWFsJyA/ICcgKHBhcnRpYWwgc2Nhbjsga2VwdCBleGlzdGluZyBlbnRyaWVzKScgOiAnJ30uYCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlIHRoZSBjb25uZWN0aW9uIChhbmQgaXRzIGNyZWRlbnRpYWwgcmVmcmVzaGVyKSBmb3IgYW4gZW52aXJvbm1lbnQgd2hpbGUga2VlcGluZyB0aGVcblx0ICogcHJvdmlkZXIgYW5kIGl0cyBjYWNoZWQgc2Vzc2lvbnMgdmlzaWJsZSBpbiBhIGRpc2Nvbm5lY3RlZCBzdGF0ZS4gRGlzcG9zaW5nIHRoZSBwcm90b2NvbFxuXHQgKiBjbGllbnQgc3RvcHMgdGhlIHNvZnQtcmVjb25uZWN0IGxvb3A7IHRoZSB7QGxpbmsgQ2xvdWRTYW5kYm94QWdlbnRIb3N0U2VydmljZX0gcHJ1bmVzIHRoZVxuXHQgKiByZWZyZXNoZXIgdmlhIGBvbkRpZENoYW5nZUNvbm5lY3Rpb25zYC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2Rpc2Nvbm5lY3RFbnZpcm9ubWVudChhZGRyZXNzOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5yZW1vdmVSZW1vdGVBZ2VudEhvc3QoYWRkcmVzcyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBGYWlsZWQgdG8gZGlzY29ubmVjdCAke2FkZHJlc3N9OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRnVsbHkgdGVhciBkb3duIGFuIGVudmlyb25tZW50OiBkaXNwb3NlIGl0cyBwcm92aWRlciAodW5yZWdpc3RlcmluZyBpdCBhbmQgaXRzIHNlc3Npb25zKSBhbmRcblx0ICogcmVtb3ZlIGl0cyBjb25uZWN0aW9uICsgY3JlZGVudGlhbCByZWZyZXNoZXIuIFVzZWQgd2hlbiBhbiBlbnZpcm9ubWVudCB2YW5pc2hlcyBmcm9tIGRpc2NvdmVyeVxuXHQgKiBvciB0aGUgZmVhdHVyZSBpcyBkaXNhYmxlZC5cblx0ICovXG5cdHByaXZhdGUgX3RlYXJkb3duRW52aXJvbm1lbnQoYWRkcmVzczogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fZW52aXJvbm1lbnRzLmRlbGV0ZShhZGRyZXNzKTtcblx0XHR0aGlzLl9wZW5kaW5nQ29ubmVjdHMuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdHRoaXMuX3Byb3ZpZGVyU3RvcmVzLmRlbGV0ZUFuZERpc3Bvc2UoYWRkcmVzcyk7XG5cdFx0Ly8gRHJvcCB0aGUgcmVhZC1vbmx5IHN0YW5kLWluIHRvbywgb3IgZGlzYWJsaW5nIHRoZSBmZWF0dXJlIHdvdWxkIGxlYXZlIGEgY29udGVudCBwcm92aWRlclxuXHRcdC8vIHJlZ2lzdGVyZWQgZm9yIGEgc2Vzc2lvbiB0eXBlIHRoaXMgY29udHJpYnV0aW9uIG5vIGxvbmdlciBzZXJ2ZXMuXG5cdFx0dGhpcy5fY2xlYXJSZWFkT25seShhZGRyZXNzKTtcblx0XHR2b2lkIHRoaXMuX2Rpc2Nvbm5lY3RFbnZpcm9ubWVudChhZGRyZXNzKTtcblx0fVxuXG5cdC8qKiBUZWFyIGRvd24gZXZlcnkga25vd24gc2FuZGJveCBlbnZpcm9ubWVudCAoZmVhdHVyZSBkaXNhYmxlZCkuICovXG5cdHByaXZhdGUgX3RlYXJkb3duQWxsKCk6IHZvaWQge1xuXHRcdC8vIEFib3J0IGluLWZsaWdodCBkaXNjb3ZlcnkvY29ubmVjdHMgZmlyc3Qgc28gbm90aGluZyBjb21taXRzIHN0YXRlIGFmdGVyIHRoaXMgcnVucy5cblx0XHR0aGlzLl9lbmFibGVkQ3RzLmNhbmNlbCgpO1xuXHRcdHRoaXMuX2VuYWJsZWRDdHMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2VuYWJsZWRDdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRmb3IgKGNvbnN0IGFkZHJlc3Mgb2YgWy4uLnRoaXMuX2Vudmlyb25tZW50cy5rZXlzKCldKSB7XG5cdFx0XHR0aGlzLl90ZWFyZG93bkVudmlyb25tZW50KGFkZHJlc3MpO1xuXHRcdH1cblx0fVxuXG5cdC8qKiBNYXAgZWFjaCBrbm93biBzYW5kYm94IGNvbm5lY3Rpb24gYXV0aG9yaXR5IHRvIGl0cyBhZGRyZXNzIChgY2xvdWRzYW5kYm94OjxlbnZJZD5gKS4gKi9cblx0cHJpdmF0ZSBfYXV0aG9yaXRpZXNCeUFkZHJlc3MoKTogTWFwPHN0cmluZywgc3RyaW5nPiB7XG5cdFx0Y29uc3QgYnlBdXRob3JpdHkgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgYWRkcmVzcyBvZiB0aGlzLl9lbnZpcm9ubWVudHMua2V5cygpKSB7XG5cdFx0XHRieUF1dGhvcml0eS5zZXQoYWdlbnRIb3N0QXV0aG9yaXR5KGFkZHJlc3MpLCBhZGRyZXNzKTtcblx0XHR9XG5cdFx0cmV0dXJuIGJ5QXV0aG9yaXR5O1xuXHR9XG5cblx0LyoqIFJlc29sdmUgdGhlIHNhbmRib3ggYWRkcmVzcyBvd25pbmcgYSByZW1vdGUtYWdlbnQtaG9zdCBzZXNzaW9uIHR5cGUsIGlmIGFueS4gKi9cblx0cHJpdmF0ZSBfZmluZEFkZHJlc3NGb3JTZXNzaW9uVHlwZShzZXNzaW9uVHlwZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBieUF1dGhvcml0eSA9IHRoaXMuX2F1dGhvcml0aWVzQnlBZGRyZXNzKCk7XG5cdFx0Y29uc3QgYXV0aG9yaXR5ID0gZmluZFJlbW90ZUFnZW50SG9zdFNlc3Npb25UeXBlQXV0aG9yaXR5KHNlc3Npb25UeXBlLCBieUF1dGhvcml0eS5rZXlzKCkpO1xuXHRcdHJldHVybiBhdXRob3JpdHkgPyBieUF1dGhvcml0eS5nZXQoYXV0aG9yaXR5KSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBBc3luYy1hY3RpdmF0aW9uIGhvb2sgZm9yIGEgc2FuZGJveCBzZXNzaW9uIHR5cGU6IGVzdGFibGlzaCB0aGUgcmVsYXkgY29ubmVjdGlvbiBvbiBkZW1hbmQsXG5cdCAqIHRoZW4gcmVzb2x2ZSBvbmNlIHRoZSBob3N0IGFkdmVydGlzZXMgdGhlIGFnZW50IGJhY2tpbmcgdGhpcyBzZXNzaW9uIHR5cGUgKGl0cyBjb250ZW50XG5cdCAqIHByb3ZpZGVyIGlzIHJlZ2lzdGVyZWQpLCBzbyB0aGUgY2hhdCBjYW4gbG9hZC4gUmV0dXJucyBmYWxzZSBpZiB0aGUgZW52aXJvbm1lbnQgaXMgdW5rbm93bixcblx0ICogdGhlIGNvbm5lY3Rpb24gZmFpbHMsIG9yIHRoZSBhZ2VudCBuZXZlciBhcHBlYXJzLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfd2FpdEZvckFjdGl2YXRpb24oc2Vzc2lvblR5cGU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGFkZHJlc3MgPSB0aGlzLl9maW5kQWRkcmVzc0ZvclNlc3Npb25UeXBlKHNlc3Npb25UeXBlKTtcblx0XHRjb25zdCBlbnYgPSBhZGRyZXNzID8gdGhpcy5fZW52aXJvbm1lbnRzLmdldChhZGRyZXNzKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIWFkZHJlc3MgfHwgIWVudikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHQvLyBCb3RoIHN0YXJ0IGJlZm9yZSBhbnkgYGF3YWl0YCBzbyB0aGV5IG92ZXJsYXA6IGAvY29ubmVjdGAgYmxvY2tzIG9uIHRoZSBjb21wdXRlIHJlc3VtZSBhbmRcblx0XHQvLyBjYW4gb2NjdXB5IGl0cyB3aG9sZSBidWRnZXQgd2hpbGUgdGhlIHRyYW5zY3JpcHQgYWxyZWFkeSBzaXRzIHJlYWR5LlxuXHRcdGNvbnN0IGNvbm5lY3RpbmcgPSB0aGlzLmNvbm5lY3QoeyBlbnZpcm9ubWVudElkOiBlbnYuZW52aXJvbm1lbnRJZCwgc2Vzc2lvbklkOiBlbnYuc2Vzc2lvbklkLCBuYW1lOiBlbnYubmFtZSB9KTtcblx0XHQvLyBTZXR0bGVkIGludG8gYSB2YWx1ZSBzbyB0aGUgcmFjZSBiZWxvdyBjYW4gaW5zcGVjdCBpdCB3aXRob3V0IGFuIHVuaGFuZGxlZCByZWplY3Rpb24uXG5cdFx0Y29uc3QgY29ubmVjdE91dGNvbWUgPSBjb25uZWN0aW5nLnRoZW4oKCkgPT4gdW5kZWZpbmVkLCAoZXJyb3I6IHVua25vd24pID0+IGVycm9yID8/IG5ldyBFcnJvcignY29ubmVjdCBmYWlsZWQnKSk7XG5cdFx0Y29uc3QgcHJlZmV0Y2hlZEhpc3RvcnkgPSB0aGlzLl9wcmVmZXRjaEhpc3RvcnlJZkRvcm1hbnQoZW52KTtcblxuXHRcdGlmIChwcmVmZXRjaGVkSGlzdG9yeSkge1xuXHRcdFx0Ly8gV2hpY2hldmVyIGxhbmRzIGZpcnN0IGRlY2lkZXMgd2hhdCB0aGUgdXNlciBzZWVzLiBUaGUgY29ubmVjdCBrZWVwcyBydW5uaW5nIGVpdGhlclxuXHRcdFx0Ly8gd2F5OiBpZiBpdCBsYW5kcyBsYXRlciwgYG9uRGlkQ2hhbmdlQ29ubmVjdGlvbnNgIGRyb3BzIHRoZSBzdGFuZC1pbi5cblx0XHRcdGNvbnN0IGhpc3RvcnlGaXJzdCA9IGF3YWl0IFByb21pc2UucmFjZShbXG5cdFx0XHRcdGNvbm5lY3RPdXRjb21lLnRoZW4oKCkgPT4gdW5kZWZpbmVkKSxcblx0XHRcdFx0cHJlZmV0Y2hlZEhpc3RvcnksXG5cdFx0XHRdKTtcblx0XHRcdGlmIChoaXN0b3J5Rmlyc3QgJiYgdGhpcy5faXNFbmFibGVkKCkgJiYgIXRoaXMuX2VuYWJsZWRDdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IEhpc3RvcnkgZm9yICR7YWRkcmVzc30gYXJyaXZlZCBiZWZvcmUgdGhlIGNvbm5lY3Qgc2V0dGxlZDsgb3BlbmluZyBpdCBub3cuYCk7XG5cdFx0XHRcdGNvbnN0IG9wZW5lZCA9IHRoaXMuX2FjdGl2YXRlUmVhZE9ubHkoc2Vzc2lvblR5cGUsIGFkZHJlc3MsIGVudiwgcHJlZmV0Y2hlZEhpc3RvcnkpO1xuXHRcdFx0XHQvLyBPbiBzY3JlZW4gYnV0IHVuZGVjaWRlZDogYSBmYWlsZWQgY29ubmVjdCBkaXNhYmxlcyB0aGUgY29tcG9zZXIgaW4gcGxhY2UuXG5cdFx0XHRcdHZvaWQgY29ubmVjdE91dGNvbWUudGhlbihjb25uZWN0RXJyb3IgPT4ge1xuXHRcdFx0XHRcdGlmIChjb25uZWN0RXJyb3IgIT09IHVuZGVmaW5lZCAmJiB0aGlzLl9pc0VuYWJsZWQoKSAmJiAhdGhpcy5fZW5hYmxlZEN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IENvbm5lY3QgZm9yICR7YWRkcmVzc30gZmFpbGVkIGFmdGVyIHRoZSBzZXNzaW9uIG9wZW5lZDsgc2V0dGxpbmcgaXQgcmVhZC1vbmx5LmApO1xuXHRcdFx0XHRcdFx0dGhpcy5fc2V0dGxlUmVhZE9ubHkoc2Vzc2lvblR5cGUsIGFkZHJlc3MpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybiBvcGVuZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29ubmVjdEVycm9yID0gYXdhaXQgY29ubmVjdE91dGNvbWU7XG5cdFx0aWYgKGNvbm5lY3RFcnJvciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gY29ubmVjdC1vbi1vcGVuIGZhaWxlZCBmb3IgJHthZGRyZXNzfTogJHtjb25uZWN0RXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGNvbm5lY3RFcnJvci5tZXNzYWdlIDogU3RyaW5nKGNvbm5lY3RFcnJvcil9YCk7XG5cdFx0XHQvLyBTZXJ2ZSBoaXN0b3J5IHdoYXRldmVyIHRoZSByZWFzb246IGAvY29ubmVjdGAgZmFpbHMgaW4gc2V2ZXJhbCB3YXlzIGZvciBhIGRlbGV0ZWRcblx0XHRcdC8vIHNhbmRib3gsIHNvIGdhdGluZyBvbiBhbnkgb25lIG9mIHRoZW0gd291bGQgbGVhdmUgdGhlIHJlc3Qgd2l0aCBubyBoaXN0b3J5LiBBXG5cdFx0XHQvLyB0cmFuc2llbnQgZmFpbHVyZSBhbHNvIGxhbmRzIGhlcmUsIHdoaWNoIHRoZSBob3N0J3MgY29ubmVjdCBhY3Rpb24gcmVjb3ZlcnMgZnJvbS5cblx0XHRcdGlmICh0aGlzLl9pc0VuYWJsZWQoKSAmJiAhdGhpcy5fZW5hYmxlZEN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRjb25zdCBvcGVuZWQgPSB0aGlzLl9hY3RpdmF0ZVJlYWRPbmx5KHNlc3Npb25UeXBlLCBhZGRyZXNzLCBlbnYsIHByZWZldGNoZWRIaXN0b3J5KTtcblx0XHRcdFx0aWYgKG9wZW5lZCkge1xuXHRcdFx0XHRcdHRoaXMuX3NldHRsZVJlYWRPbmx5KHNlc3Npb25UeXBlLCBhZGRyZXNzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gb3BlbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBhdXRob3JpdHkgPSBhZ2VudEhvc3RBdXRob3JpdHkoYWRkcmVzcyk7XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmdldENvbm5lY3Rpb24oYWRkcmVzcyk7XG5cdFx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgcm9vdFN0YXRlID0gY29ubmVjdGlvbi5yb290U3RhdGUudmFsdWU7XG5cdFx0XHRpZiAocm9vdFN0YXRlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJvb3RTdGF0ZSkge1xuXHRcdFx0XHRyZXR1cm4gcm9vdFN0YXRlLmFnZW50cy5zb21lKGFnZW50ID0+IHJlbW90ZUFnZW50SG9zdFNlc3Npb25UeXBlSWQoYXV0aG9yaXR5LCBhZ2VudC5wcm92aWRlcikgPT09IHNlc3Npb25UeXBlKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZShjb25uZWN0aW9uLnJvb3RTdGF0ZS5vbkRpZENoYW5nZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFBlcnNpc3RlZCBoaXN0b3J5IGZvciBhbiBlbnZpcm9ubWVudCB0aGF0IGlzIG5vdCBjdXJyZW50bHkgb25saW5lLCBvciBgdW5kZWZpbmVkYCB3aGVuIGl0IGlzXG5cdCAqIG9ubGluZSwgaGFzIG5vIHRhc2ssIG9yIHRoZSByZWFkIGZhaWxlZC5cblx0ICpcblx0ICogYHN0YXR1c2AgY2Fubm90IHByZWRpY3Qgd2hldGhlciBhIGRvcm1hbnQgZW52aXJvbm1lbnQgd2lsbCB3YWtlIFx1MjAxNCBzdXNwZW5kZWQgYW5kIGRlbGV0ZWQgYm90aFxuXHQgKiByZWFkIGBvZmZsaW5lYCBcdTIwMTQgYnV0IGl0IGRvZXMgc2F5LCBpbiBhIGZldyBodW5kcmVkIG1pbGxpc2Vjb25kcywgdGhhdCB0aGlzIG9wZW4gaXMgb24gdGhlIHNsb3dcblx0ICogcGF0aCwgd2hpY2ggaXMgZW5vdWdoIHRvIHN0YXJ0IHRoZSBmZXRjaCBub3cuIE5ldmVyIHJlamVjdHM7IHRoZSBoYW5kbGVyIHN0aWxsIHJlYWRzIGhpc3Rvcnlcblx0ICogaXRzZWxmIHdoZW4gdGhpcyB5aWVsZHMgbm90aGluZy5cblx0ICovXG5cdHByaXZhdGUgX3ByZWZldGNoSGlzdG9yeUlmRG9ybWFudChlbnY6IElDbG91ZFNhbmRib3hFbnZpcm9ubWVudCk6IFByb21pc2U8SVJlcGxheWVkVGFza0hpc3RvcnkgfCB1bmRlZmluZWQ+IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB0YXNrSWQgPSBlbnYudGFza0lkO1xuXHRcdGlmICghdGFza0lkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB0b2tlbiA9IHRoaXMuX2VuYWJsZWRDdHMudG9rZW47XG5cdFx0cmV0dXJuIChhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZWNvcmQgPSBhd2FpdCB0aGlzLl9hcGlTZXJ2aWNlLmdldEVudmlyb25tZW50KGVudi5lbnZpcm9ubWVudElkLCB0b2tlbik7XG5cdFx0XHRcdGlmIChyZWNvcmQuc3RhdHVzID09PSAnb25saW5lJykge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgJHtMT0dfUFJFRklYfSBFbnZpcm9ubWVudCAke2Vudi5lbnZpcm9ubWVudElkfSBpcyAnJHtyZWNvcmQuc3RhdHVzfSc7IHByZWZldGNoaW5nIGhpc3RvcnkgaW4gY2FzZSB0aGUgY29ubmVjdCBkb2VzIG5vdCBsYW5kLmApO1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fYXBpU2VydmljZS5nZXRTZXNzaW9uSGlzdG9yeSh0YXNrSWQsIHRva2VuKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYCR7TE9HX1BSRUZJWH0gSGlzdG9yeSBwcmVmZXRjaCBmb3IgJHtlbnYuZW52aXJvbm1lbnRJZH0gZGlkIG5vdCBjb21wbGV0ZTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWdpc3RlciBhIGNvbnRlbnQgcHJvdmlkZXIgdGhhdCBzZXJ2ZXMgdGhpcyBzZXNzaW9uIGZyb20gcmVwbGF5ZWQgaGlzdG9yeS5cblx0ICpcblx0ICogRGVsaWJlcmF0ZWx5IGRvZXMgKm5vdCogbWFyayB0aGUgc2Vzc2lvbiByZWFkLW9ubHk6IHRoaXMgYWxzbyBydW5zIHdoaWxlIGEgY29ubmVjdCBpcyBpblxuXHQgKiBmbGlnaHQgYW5kIHRoZSBlbnZpcm9ubWVudCBtYXkgeWV0IHdha2UgXHUyMDE0IGNhbGxlcnMgc2V0dGxlIGl0IHZpYSB7QGxpbmsgX3NldHRsZVJlYWRPbmx5fS5cblx0ICogUmV0dXJucyBgdHJ1ZWAgb25jZSByZWdpc3RlcmVkLCB3aGljaCBpcyB3aGF0IGxldHMgYGNhblJlc29sdmVDaGF0U2Vzc2lvbmAgcHJvY2VlZCwgb3IgYGZhbHNlYFxuXHQgKiB3aGVuIHRoZXJlIGlzIG5vIHRhc2sgdG8gcmVhZCBoaXN0b3J5IGZyb20uXG5cdCAqL1xuXHRwcml2YXRlIF9hY3RpdmF0ZVJlYWRPbmx5KHNlc3Npb25UeXBlOiBzdHJpbmcsIGFkZHJlc3M6IHN0cmluZywgZW52OiBJQ2xvdWRTYW5kYm94RW52aXJvbm1lbnQsIHByZWZldGNoZWRIaXN0b3J5PzogUHJvbWlzZTxJUmVwbGF5ZWRUYXNrSGlzdG9yeSB8IHVuZGVmaW5lZD4pOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5fcmVhZE9ubHlIYW5kbGVycy5oYXMoc2Vzc2lvblR5cGUpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Ly8gVGhlIGNvbm5lY3QgY2FuIHJlZ2lzdGVyIHRoZSBsaXZlIGhhbmRsZXIgZm9yIHRoaXMgc2Vzc2lvbiB0eXBlIGF0IGFueSBhd2FpdCBiZXR3ZWVuXG5cdFx0Ly8gc3RhcnRpbmcgaXQgYW5kIG9ic2VydmluZyBpdHMgb3V0Y29tZSwgYW5kIHJlZ2lzdGVyaW5nIGEgc2Vjb25kIGNvbnRlbnQgcHJvdmlkZXIgdGhyb3dzLlxuXHRcdC8vIFRoaXMgY2hlY2sgYW5kIHRoZSByZWdpc3RyYXRpb24gYmVsb3cgYXJlIHN5bmNocm9ub3VzLCBzbyBub3RoaW5nIGNhbiBpbnRlcmxlYXZlIGJldHdlZW5cblx0XHQvLyB0aGVtLiBBIGxpdmUgcHJvdmlkZXIgbWVhbnMgdGhlIHNlc3Npb24gaXMgYWxyZWFkeSBzZXJ2ZWQsIHdoaWNoIGlzIHRoZSBiZXR0ZXIgb3V0Y29tZS5cblx0XHRpZiAodGhpcy5fY2hhdFNlc3Npb25zU2VydmljZS5nZXRDb250ZW50UHJvdmlkZXJTY2hlbWVzKCkuaW5jbHVkZXMoc2Vzc2lvblR5cGUpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGAke0xPR19QUkVGSVh9ICR7c2Vzc2lvblR5cGV9IGFscmVhZHkgaGFzIGEgY29udGVudCBwcm92aWRlcjsgbGVhdmluZyBpdCB0byBzZXJ2ZSB0aGUgc2Vzc2lvbi5gKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoIWVudi50YXNrSWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBObyB0YXNrIGlkIGZvciAke2FkZHJlc3N9OyBjYW5ub3Qgc2VydmUgaGlzdG9yeSByZWFkLW9ubHkuYCk7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGhhbmRsZXIgPSBzdG9yZS5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2xvdWRTYW5kYm94UmVhZE9ubHlTZXNzaW9uSGFuZGxlciwge1xuXHRcdFx0dGFza0lkOiBlbnYudGFza0lkLFxuXHRcdFx0Ly8gVGhlIGxpdmUgaGFuZGxlciByZWdpc3RlcnMgYGFnZW50SWQgPT09IHNlc3Npb25UeXBlYDsgbWF0Y2hpbmcgaXQga2VlcHMgcmVwbGF5ZWRcblx0XHRcdC8vIGhpc3RvcnkgYXR0cmlidXRlZCB0byB0aGUgc2FtZSBwYXJ0aWNpcGFudC5cblx0XHRcdGFnZW50SWQ6IHNlc3Npb25UeXBlLFxuXHRcdFx0Y29ubmVjdGlvbkF1dGhvcml0eTogYWdlbnRIb3N0QXV0aG9yaXR5KGFkZHJlc3MpLFxuXHRcdFx0cHJlZmV0Y2hlZEhpc3RvcnksXG5cdFx0fSkpO1xuXHRcdHN0b3JlLmFkZCh0aGlzLl9jaGF0U2Vzc2lvbnNTZXJ2aWNlLnJlZ2lzdGVyQ2hhdFNlc3Npb25Db250ZW50UHJvdmlkZXIoc2Vzc2lvblR5cGUsIGhhbmRsZXIpKTtcblx0XHR0aGlzLl9yZWFkT25seUhhbmRsZXJzLnNldChzZXNzaW9uVHlwZSwgc3RvcmUpO1xuXHRcdHRoaXMuX3JlYWRPbmx5SW5zdGFuY2VzLnNldChzZXNzaW9uVHlwZSwgaGFuZGxlcik7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9yZWFkT25seUluc3RhbmNlcy5kZWxldGUoc2Vzc2lvblR5cGUpKSk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFNlcnZpbmcgJHtzZXNzaW9uVHlwZX0gZnJvbSBNaXNzaW9uIENvbnRyb2wgaGlzdG9yeS5gKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXR0bGUgYSBoaXN0b3J5LWJhY2tlZCBzZXNzaW9uIGFzIHJlYWQtb25seSBvbmNlIHRoZSBjb25uZWN0IGhhcyBmYWlsZWQuIFNlc3Npb25zIGFscmVhZHkgb25cblx0ICogc2NyZWVuIG9ic2VydmUgdGhpcyBhbmQgZGlzYWJsZSB0aGVpciBjb21wb3NlciBpbiBwbGFjZSwgd2l0aG91dCBuZWVkaW5nIGEgcmVvcGVuLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2V0dGxlUmVhZE9ubHkoc2Vzc2lvblR5cGU6IHN0cmluZywgYWRkcmVzczogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgaGFuZGxlciA9IHRoaXMuX3JlYWRPbmx5SW5zdGFuY2VzLmdldChzZXNzaW9uVHlwZSk7XG5cdFx0aWYgKCFoYW5kbGVyKSB7XG5cdFx0XHQvLyBUaGUgbGl2ZSBoYW5kbGVyIG93bnMgdGhpcyBzZXNzaW9uIHR5cGUsIHNvIHRoZXJlIGlzIG5vdGhpbmcgYmVpbmcgc2VydmVkIGZyb21cblx0XHRcdC8vIGhpc3RvcnkgdG8gc2V0dGxlIFx1MjAxNCBhbmQgZm9yY2luZyB0aGUgaG9zdCByZWFkLW9ubHkgaGVyZSB3b3VsZCBiZSB3cm9uZy5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aGFuZGxlci5tYXJrUmVhZE9ubHkoKTtcblx0XHQvLyBUaGUgdHJhbnNjcmlwdCBpcyByZWFsLCBidXQgdGhlcmUgaXMgbm8gaG9zdCBsZWZ0IHRvIHNlbmQgdG8uXG5cdFx0dGhpcy5fcHJvdmlkZXJJbnN0YW5jZXMuZ2V0KGFkZHJlc3MpPy5zZXRSZWFkT25seSh0cnVlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEcm9wIGFueSByZWFkLW9ubHkgc3RhbmQtaW4gZm9yIGFuIGFkZHJlc3Mgc28gdGhlIGxpdmUgaGFuZGxlciBjYW4gb3duIHRoZSBzZXNzaW9uIHR5cGUuXG5cdCAqIFJlZ2lzdGVyaW5nIHR3byBjb250ZW50IHByb3ZpZGVycyBmb3Igb25lIHNlc3Npb24gdHlwZSB0aHJvd3MsIHNvIHRoaXMgbXVzdCBydW4gYmVmb3JlIGFcblx0ICogY29ubmVjdGlvbiBpcyBlc3RhYmxpc2hlZCByYXRoZXIgdGhhbiBhZnRlci5cblx0ICovXG5cdHByaXZhdGUgX2NsZWFyUmVhZE9ubHkoYWRkcmVzczogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fcHJvdmlkZXJJbnN0YW5jZXMuZ2V0KGFkZHJlc3MpPy5zZXRSZWFkT25seShmYWxzZSk7XG5cdFx0Y29uc3QgYXV0aG9yaXR5ID0gYWdlbnRIb3N0QXV0aG9yaXR5KGFkZHJlc3MpO1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvblR5cGUgb2YgWy4uLnRoaXMuX3JlYWRPbmx5SGFuZGxlcnMua2V5cygpXSkge1xuXHRcdFx0aWYgKGZpbmRSZW1vdGVBZ2VudEhvc3RTZXNzaW9uVHlwZUF1dGhvcml0eShzZXNzaW9uVHlwZSwgW2F1dGhvcml0eV0pID09PSBhdXRob3JpdHkpIHtcblx0XHRcdFx0dGhpcy5fcmVhZE9ubHlIYW5kbGVycy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb25UeXBlKTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IERyb3BwZWQgcmVhZC1vbmx5IHN0YW5kLWluIGZvciAke3Nlc3Npb25UeXBlfTsgdGhlIGVudmlyb25tZW50IGlzIHJlYWNoYWJsZSBhZ2Fpbi5gKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRW5zdXJlIGEgcHJvdmlkZXIgZXhpc3RzIGZvciB0aGUgZW52aXJvbm1lbnQgYW5kIGVzdGFibGlzaCAob3IgcmV1c2UpIHRoZVxuXHQgKiBjb25uZWN0aW9uLiBSZXNvbHZlcyB3aXRoIHRoZSBjb25uZWN0aW9uJ3MgZGlzcGxheSBhZGRyZXNzLlxuXHQgKi9cblx0YXN5bmMgY29ubmVjdChvcHRpb25zOiBJQ2xvdWRTYW5kYm94Q29ubmVjdE9wdGlvbnMpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGlmICghdGhpcy5faXNFbmFibGVkKCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ29waWxvdCBjbG91ZCBzYW5kYm94IGNvbm5lY3Rpb25zIGFyZSBub3QgZW5hYmxlZC4nKTtcblx0XHR9XG5cdFx0Y29uc3QgYWRkcmVzcyA9IGNsb3VkU2FuZGJveEFkZHJlc3Mob3B0aW9ucy5lbnZpcm9ubWVudElkKTtcblx0XHR0aGlzLl9lbnN1cmVQcm92aWRlcih7IGVudmlyb25tZW50SWQ6IG9wdGlvbnMuZW52aXJvbm1lbnRJZCwgc2Vzc2lvbklkOiBvcHRpb25zLnNlc3Npb25JZCwgbmFtZTogb3B0aW9ucy5uYW1lIH0pO1xuXG5cdFx0Y29uc3QgcGVuZGluZyA9IHRoaXMuX3BlbmRpbmdDb25uZWN0cy5nZXQoYWRkcmVzcyk7XG5cdFx0aWYgKHBlbmRpbmcpIHtcblx0XHRcdHJldHVybiBwZW5kaW5nO1xuXHRcdH1cblx0XHRjb25zdCB0b2tlbiA9IHRoaXMuX2VuYWJsZWRDdHMudG9rZW47XG5cdFx0Y29uc3QgYXR0ZW1wdCA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl9wcm92aWRlckluc3RhbmNlcy5nZXQoYWRkcmVzcyk/LnNldENvbm5lY3Rpb25TdGF0dXMoUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0aW5nKTtcblx0XHRcdFx0Ly8gRHJvcCBhbnkgcmVhZC1vbmx5IHN0YW5kLWluICpiZWZvcmUqIGNvbm5lY3RpbmcuIFJlZ2lzdGVyaW5nIGEgY29udGVudCBwcm92aWRlciBmb3Jcblx0XHRcdFx0Ly8gYSBzZXNzaW9uIHR5cGUgdGhhdCBhbHJlYWR5IGhhcyBvbmUgdGhyb3dzLCBhbmQgYSBzdWNjZXNzZnVsIGNvbm5lY3QgcmVnaXN0ZXJzIHRoZVxuXHRcdFx0XHQvLyBsaXZlIGhhbmRsZXIgYXMgc29vbiBhcyB0aGUgY29ubmVjdGlvbiBpcyB3aXJlZCBcdTIwMTQgd2hpY2ggaGFwcGVucyBpbnNpZGUgdGhlIGNhbGxcblx0XHRcdFx0Ly8gYmVsb3cuIGBfd2FpdEZvckFjdGl2YXRpb25gIHJlLXJlZ2lzdGVycyB0aGUgc3RhbmQtaW4gaWYgdGhpcyBhdHRlbXB0IGZhaWxzLlxuXHRcdFx0XHR0aGlzLl9jbGVhclJlYWRPbmx5KGFkZHJlc3MpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9jbG91ZFNhbmRib3hTZXJ2aWNlLmNvbm5lY3Qob3B0aW9ucywgdG9rZW4pO1xuXHRcdFx0XHQvLyBUaGUgZmVhdHVyZSBtYXkgaGF2ZSBiZWVuIGRpc2FibGVkIHdoaWxlIGNvbm5lY3Rpbmc7IGRyb3AgdGhlIGNvbm5lY3Rpb24gcmF0aGVyXG5cdFx0XHRcdC8vIHRoYW4gbGVhdmluZyBhIGxpdmUgcmVsYXkgb3BlbiBhZnRlciB0ZWFyZG93bi5cblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8ICF0aGlzLl9pc0VuYWJsZWQoKSkge1xuXHRcdFx0XHRcdHZvaWQgdGhpcy5fZGlzY29ubmVjdEVudmlyb25tZW50KGFkZHJlc3MpO1xuXHRcdFx0XHRcdHRocm93IG5ldyBDYW5jZWxsYXRpb25FcnJvcigpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIGBvbkRpZENoYW5nZUNvbm5lY3Rpb25zYCBmaXJlcyBmcm9tIGFkZE1hbmFnZWRDb25uZWN0aW9uIGFuZCB3aXJlcyB0aGVcblx0XHRcdFx0Ly8gcHJvdmlkZXI7IGNhbGwgX3dpcmVDb25uZWN0aW9ucyBkaXJlY3RseSB0b28gaW4gY2FzZSBpdCBhbHJlYWR5IGZpcmVkLlxuXHRcdFx0XHR0aGlzLl93aXJlQ29ubmVjdGlvbnMoKTtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdDb25uZWN0cy5kZWxldGUoYWRkcmVzcyk7XG5cdFx0XHR9XG5cdFx0fSkoKTtcblx0XHR0aGlzLl9wZW5kaW5nQ29ubmVjdHMuc2V0KGFkZHJlc3MsIGF0dGVtcHQpO1xuXHRcdHJldHVybiBhdHRlbXB0O1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDbG91ZFNhbmRib3hFbmFibGVkU2V0dGluZ0lkKVxuXHRcdFx0JiYgdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQpO1xuXHR9XG5cblx0LyoqIENyZWF0ZSB0aGUgc2Vzc2lvbnMgcHJvdmlkZXIgZm9yIGFuIGVudmlyb25tZW50IGlmIGl0IGRvZXNuJ3QgZXhpc3QgeWV0LiAqL1xuXHRwcml2YXRlIF9lbnN1cmVQcm92aWRlcihlbnY6IElDbG91ZFNhbmRib3hFbnZpcm9ubWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGFkZHJlc3MgPSBjbG91ZFNhbmRib3hBZGRyZXNzKGVudi5lbnZpcm9ubWVudElkKTtcblx0XHQvLyBgY29ubmVjdCgpYCByZWFjaGVzIGhlcmUgd2l0aCBvbmx5IHRoZSBmaWVsZHMgaXRzIGNhbGxlciBoYWQsIHNvIHByZXNlcnZlIGFueXRoaW5nXG5cdFx0Ly8gZGlzY292ZXJ5IGFscmVhZHkgcmVzb2x2ZWQgXHUyMDE0IG5vdGFibHkgdGhlIHRhc2sgaWQgdGhhdCBtYWtlcyBoaXN0b3J5IHJlYWRhYmxlIG9mZmxpbmUuXG5cdFx0Y29uc3Qga25vd24gPSB0aGlzLl9lbnZpcm9ubWVudHMuZ2V0KGFkZHJlc3MpO1xuXHRcdHRoaXMuX2Vudmlyb25tZW50cy5zZXQoYWRkcmVzcywgeyAuLi5rbm93biwgLi4uZW52LCB0YXNrSWQ6IGVudi50YXNrSWQgPz8ga25vd24/LnRhc2tJZCB9KTtcblx0XHRpZiAodGhpcy5fcHJvdmlkZXJTdG9yZXMuaGFzKGFkZHJlc3MpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5faW5zdGFudGlhdGVQcm92aWRlcih7XG5cdFx0XHRhZGRyZXNzLFxuXHRcdFx0bmFtZTogZW52Lm5hbWUsXG5cdFx0XHRjb25uZWN0T25EZW1hbmQ6ICgpID0+IHRoaXMuY29ubmVjdCh7IGVudmlyb25tZW50SWQ6IGVudi5lbnZpcm9ubWVudElkLCBzZXNzaW9uSWQ6IGVudi5zZXNzaW9uSWQsIG5hbWU6IGVudi5uYW1lIH0pLnRoZW4oKCkgPT4geyB9KSxcblx0XHRcdHNlc3Npb25TY2hlbWVBbGlhczogU0FOREJPWF9TRVNTSU9OX1NDSEVNRV9BTElBUyxcblx0XHRcdC8vIEVhY2ggc2FuZGJveCBpcyBpdHMgb3duIHByb3ZpZGVyIG5hbWVkIGFmdGVyIGl0cyB0YXNrLCBzbyB0aGUgYFtob3N0XWAgc3VmZml4IHdvdWxkXG5cdFx0XHQvLyBwdXQgZXZlcnkgc2Vzc2lvbiBpbiBhIHdvcmtzcGFjZSBncm91cCBvZiBvbmUuXG5cdFx0XHRvbWl0SG9zdEZyb21Xb3Jrc3BhY2VMYWJlbDogdHJ1ZSxcblx0XHRcdC8vIEEgc2FuZGJveCBpcyBhIGRpc3Bvc2FibGUgcmVtb3RlIGVudmlyb25tZW50LCBub3QgYSBjaGVja291dCBvbiBkaXNrLlxuXHRcdFx0d29ya3NwYWNlVHlwZUljb246IENvZGljb24ucGFja2FnZSxcblx0XHR9KTtcblx0XHRzdG9yZS5hZGQocHJvdmlkZXIpO1xuXHRcdHN0b3JlLmFkZCh0aGlzLl9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihwcm92aWRlcikpO1xuXHRcdHN0b3JlLmFkZCh3YXRjaEZvckluY29tcGF0aWJsZU5vdGlmaWNhdGlvbnMocHJvdmlkZXIsIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlKSk7XG5cdFx0dGhpcy5fcHJvdmlkZXJJbnN0YW5jZXMuc2V0KGFkZHJlc3MsIHByb3ZpZGVyKTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX3Byb3ZpZGVySW5zdGFuY2VzLmRlbGV0ZShhZGRyZXNzKSkpO1xuXHRcdHRoaXMuX3Byb3ZpZGVyU3RvcmVzLnNldChhZGRyZXNzLCBzdG9yZSk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFJlZ2lzdGVyZWQgc2Vzc2lvbnMgcHJvdmlkZXIgZm9yICR7YWRkcmVzc31gKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQcm92aWRlciBjb25zdHJ1Y3Rpb24gc2VhbSBzbyB0ZXN0cyBjYW4gb2JzZXJ2ZSBlYWNoIHByb3ZpZGVyJ3MgY29uZmlndXJhdGlvbi5cblx0ICovXG5cdHByb3RlY3RlZCBfaW5zdGFudGlhdGVQcm92aWRlcihjb25maWc6IElSZW1vdGVBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyQ29uZmlnKTogUmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIsIGNvbmZpZyk7XG5cdH1cblxuXHQvKiogV2lyZSBlYWNoIGxpdmUgY29ubmVjdGlvbiB0byBpdHMgcHJvdmlkZXIgc28gc2Vzc2lvbiBlbnVtZXJhdGlvbiBydW5zLiAqL1xuXHRwcml2YXRlIF93aXJlQ29ubmVjdGlvbnMoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBbYWRkcmVzcywgcHJvdmlkZXJdIG9mIHRoaXMuX3Byb3ZpZGVySW5zdGFuY2VzKSB7XG5cdFx0XHRjb25zdCBjb25uZWN0aW9uSW5mbyA9IHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuY29ubmVjdGlvbnMuZmluZChcblx0XHRcdFx0YyA9PiBjLmFkZHJlc3MgPT09IGFkZHJlc3MgJiYgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjLnN0YXR1cyksXG5cdFx0XHQpO1xuXHRcdFx0aWYgKGNvbm5lY3Rpb25JbmZvKSB7XG5cdFx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmdldENvbm5lY3Rpb24oYWRkcmVzcyk7XG5cdFx0XHRcdGlmIChjb25uZWN0aW9uKSB7XG5cdFx0XHRcdFx0cHJvdmlkZXIuc2V0Q29ubmVjdGlvbihjb25uZWN0aW9uLCBjb25uZWN0aW9uSW5mby5kZWZhdWx0RGlyZWN0b3J5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKiBQdXNoIHRoZSBzZXJ2aWNlJ3MgYXV0aG9yaXRhdGl2ZSBjb25uZWN0aW9uIHN0YXR1cyBvbnRvIGVhY2ggcHJvdmlkZXIuICovXG5cdHByaXZhdGUgX3VwZGF0ZUNvbm5lY3Rpb25TdGF0dXNlcygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFthZGRyZXNzLCBwcm92aWRlcl0gb2YgdGhpcy5fcHJvdmlkZXJJbnN0YW5jZXMpIHtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb25JbmZvID0gdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5jb25uZWN0aW9ucy5maW5kKGMgPT4gYy5hZGRyZXNzID09PSBhZGRyZXNzKTtcblx0XHRcdGlmIChjb25uZWN0aW9uSW5mbykge1xuXHRcdFx0XHRwcm92aWRlci5zZXRDb25uZWN0aW9uU3RhdHVzKGNvbm5lY3Rpb25JbmZvLnN0YXR1cyk7XG5cdFx0XHR9IGVsc2UgaWYgKCFSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzSW5jb21wYXRpYmxlKHByb3ZpZGVyLmNvbm5lY3Rpb25TdGF0dXMuZ2V0KCkpKSB7XG5cdFx0XHRcdHByb3ZpZGVyLnNldENvbm5lY3Rpb25TdGF0dXMoUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5kaXNjb25uZWN0ZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFVQSxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGVBQWU7QUFDeEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBWSxlQUFlLGlCQUFpQixvQkFBb0I7QUFDekUsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FHTTtBQUNQLFNBQVMsb0JBQWdEO0FBRXpELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUNBQXlDLG9DQUFvQztBQUN0RixTQUFTLHlCQUF5QixpQ0FBaUMsd0NBQXdDO0FBQzNHLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsd0JBQTZELDRCQUE0QjtBQUNsRyxTQUFTLDBDQUEwQztBQUNuRCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGlDQUFpQztBQUMxQyxTQUFzRSx1Q0FBdUM7QUFDN0csU0FBUyxzREFBc0Q7QUFDL0QsU0FBUywyQ0FBMkMsdUNBQXVDO0FBQzNGLFNBQVMseUNBQXlDO0FBRWxELE1BQU0sYUFBYTtBQU1uQixNQUFNLCtCQUFvRDtBQUFBLEVBQ3pELElBQUk7QUFBQSxFQUNKLFNBQVM7QUFDVjtBQXFCQSxTQUFTLHlCQUF5QixVQUFnRTtBQUNqRyxNQUFJLENBQUMsVUFBVTtBQUNkLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTyxFQUFFLEtBQUssSUFBSSxNQUFNLHNCQUFzQixRQUFRLEVBQUUsR0FBRyxhQUFhLFNBQVM7QUFDbEY7QUFFTyxJQUFNLG9DQUFOLGNBQWdELFdBQTZDO0FBQUEsRUE0Qm5HLFlBQ2lELHNCQUNOLGFBQ0EseUJBQ3VCLDJCQUNyQiwyQkFDRix5QkFDRix1QkFDQyx3QkFDRCx1QkFDRCxzQkFDQSxzQkFDVCxhQUM3QjtBQUNELFVBQU07QUFiMEM7QUFDTjtBQUNBO0FBQ3VCO0FBQ3JCO0FBQ0Y7QUFDRjtBQUNDO0FBQ0Q7QUFDRDtBQUNBO0FBQ1Q7QUFwQy9CO0FBQUEsU0FBaUIscUJBQXFCLG9CQUFJLElBQTZDO0FBQ3ZGLFNBQWlCLGtCQUFrQixLQUFLLFVBQVUsSUFBSSxjQUFzQixDQUFDO0FBRTdFO0FBQUEsU0FBaUIsZ0JBQWdCLG9CQUFJLElBQXNDO0FBRTNFO0FBQUEsU0FBaUIsbUJBQW1CLG9CQUFJLElBQTZCO0FBS3JFO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBaUIsb0JBQW9CLEtBQUssVUFBVSxJQUFJLGNBQXNCLENBQUM7QUFFL0U7QUFBQSxTQUFpQixxQkFBcUIsb0JBQUksSUFBZ0Q7QUFLMUY7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFRLGNBQWMsSUFBSSx3QkFBd0I7QUFLbEQ7QUFBQSxTQUFRLGlCQUFpQjtBQXFCeEIsU0FBSyxVQUFVLEtBQUssMEJBQTBCO0FBQUEsTUFDN0M7QUFBQSxNQUNBLGFBQVcsMENBQTBDLFNBQVMsS0FBSyxvQkFBb0I7QUFBQSxJQUN4RixDQUFDO0FBR0QsU0FBSyxVQUFVLEtBQUssd0JBQXdCLHVCQUF1QixNQUFNO0FBR3hFLGlCQUFXLGNBQWMsS0FBSyx3QkFBd0IsYUFBYTtBQUNsRSxZQUFJLGdDQUFnQyxZQUFZLFdBQVcsTUFBTSxHQUFHO0FBQ25FLGVBQUssZUFBZSxXQUFXLE9BQU87QUFBQSxRQUN2QztBQUFBLE1BQ0Q7QUFDQSxXQUFLLGlCQUFpQjtBQUN0QixXQUFLLDBCQUEwQjtBQUFBLElBQ2hDLENBQUMsQ0FBQztBQUtGLFNBQUssVUFBVSxLQUFLLHNCQUFzQix5QkFBeUIsT0FBSztBQUN2RSxVQUFJLEVBQUUscUJBQXFCLDRCQUE0QixLQUFLLEVBQUUscUJBQXFCLGdDQUFnQyxHQUFHO0FBQ3JILFlBQUksS0FBSyxXQUFXLEdBQUc7QUFDdEIsZUFBSyxLQUFLLGlCQUFpQjtBQUFBLFFBQzVCLE9BQU87QUFDTixlQUFLLGFBQWE7QUFBQSxRQUNuQjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQU1GLFNBQUssVUFBVSxLQUFLLHdCQUF3Qix5QkFBeUIsTUFBTSxLQUFLLGlCQUFpQixDQUFDLENBQUM7QUFDbkcsU0FBSyxLQUFLLGlCQUFpQjtBQUszQixVQUFNLHlCQUF5QixLQUFLLFVBQVUsSUFBSSxnQkFBZ0IsQ0FBQztBQUNuRSxVQUFNLFFBQVEsTUFBTTtBQUNuQixVQUFJLEtBQUssZ0JBQWdCO0FBQ3hCLCtCQUF1QixNQUFNO0FBQzdCO0FBQUEsTUFDRDtBQUNBLFdBQUssS0FBSyxpQkFBaUI7QUFBQSxJQUM1QjtBQUNBLDJCQUF1QixJQUFJLEtBQUssdUJBQXVCLG9CQUFvQixLQUFLLENBQUM7QUFDakYsMkJBQXVCLElBQUksS0FBSyx1QkFBdUIsb0NBQW9DLEtBQUssQ0FBQztBQVFqRyxTQUFLLFVBQVUsYUFBYSxNQUFNO0FBQ2pDLFdBQUssWUFBWSxPQUFPO0FBQ3hCLFdBQUssWUFBWSxRQUFRO0FBQUEsSUFDMUIsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLFNBQVMsR0FBd0MsdUJBQXVCLGVBQWUsRUFBRSxTQUFTO0FBQUEsTUFDaEgsa0JBQWtCLGlCQUFlLEtBQUssMkJBQTJCLFdBQVcsTUFBTTtBQUFBLE1BQ2xGLG1CQUFtQixDQUFDLFdBQVcsZ0JBQWdCLEtBQUssbUJBQW1CLFdBQVc7QUFBQSxJQUNuRixDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVlRLG1CQUFrQztBQUN6QyxRQUFJLEtBQUssb0JBQW9CO0FBQzVCLFdBQUsscUJBQXFCLEtBQUssbUJBQW1CLEtBQUssTUFBTTtBQUM1RCxhQUFLLG1CQUFtQjtBQUN4QixlQUFPLEtBQUssaUJBQWlCO0FBQUEsTUFDOUIsQ0FBQztBQUNELGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxTQUFLLHFCQUFxQixLQUFLLG1CQUFtQixFQUFFLFFBQVEsTUFBTTtBQUNqRSxXQUFLLHFCQUFxQjtBQUFBLElBQzNCLENBQUM7QUFDRCxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxNQUFjLHFCQUFvQztBQUNqRCxRQUFJLENBQUMsS0FBSyxXQUFXLEdBQUc7QUFDdkI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxRQUFRLEtBQUssWUFBWTtBQUMvQixRQUFJO0FBQ0osUUFBSTtBQUNILGVBQVMsTUFBTSxLQUFLLFlBQVksYUFBYSxLQUFLO0FBQUEsSUFDbkQsU0FBUyxPQUFPO0FBQ2YsZUFBUyxFQUFFLE1BQU0sVUFBVSxRQUFRLGlCQUFpQixRQUFRLE1BQU0sVUFBVSxPQUFPLEtBQUssRUFBRTtBQUFBLElBQzNGO0FBQ0EsUUFBSSxPQUFPLFNBQVMsVUFBVTtBQUU3QixXQUFLLFlBQVksS0FBSyxHQUFHLFVBQVUsc0JBQXNCLE9BQU8sTUFBTSxFQUFFO0FBQ3hFO0FBQUEsSUFDRDtBQUVBLFFBQUksTUFBTSwyQkFBMkIsQ0FBQyxLQUFLLFdBQVcsR0FBRztBQUN4RDtBQUFBLElBQ0Q7QUFDQSxTQUFLLGlCQUFpQjtBQUV0QixVQUFNLFVBQVUsb0JBQUksSUFBWTtBQUNoQyxlQUFXLFdBQVcsT0FBTyxVQUFVO0FBQ3RDLFVBQUksQ0FBQyxRQUFRLGlCQUFpQixDQUFDLFFBQVEsV0FBVztBQUNqRDtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFVBQVUsb0JBQW9CLFFBQVEsYUFBYTtBQUN6RCxjQUFRLElBQUksT0FBTztBQUNuQixXQUFLLGdCQUFnQixFQUFFLGVBQWUsUUFBUSxlQUFlLFdBQVcsUUFBUSxXQUFXLFFBQVEsUUFBUSxRQUFRLE1BQU0sUUFBUSxLQUFLLENBQUM7QUFDdkksWUFBTSxXQUFXLEtBQUssbUJBQW1CLElBQUksT0FBTztBQUNwRCxZQUFNLFNBQVMsUUFBUSxZQUFZLEtBQUssTUFBTSxRQUFRLFNBQVMsSUFBSSxPQUFPO0FBQzFFLFlBQU0sZUFBZSxPQUFPLE1BQU0sTUFBTSxJQUFJLEtBQUssSUFBSSxJQUFJO0FBQ3pELFlBQU0sVUFBVSx5QkFBeUIsUUFBUSxRQUFRO0FBQ3pELFlBQU0sT0FBOEI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFFBS25DLFNBQVMsYUFBYSxJQUFJLDhCQUE4QixRQUFRLFNBQVM7QUFBQSxRQUN6RSxXQUFXO0FBQUEsUUFDWDtBQUFBLFFBQ0EsU0FBUyxRQUFRO0FBQUEsUUFDakIsR0FBSSxVQUFVLEVBQUUsUUFBUSxJQUFJLENBQUM7QUFBQSxNQUM5QjtBQUNBLGdCQUFVLGFBQWEsQ0FBQyxJQUFJLENBQUM7QUFBQSxJQUM5QjtBQUtBLFFBQUksT0FBTyxTQUFTLFlBQVk7QUFDL0IsaUJBQVcsV0FBVyxDQUFDLEdBQUcsS0FBSyxjQUFjLEtBQUssQ0FBQyxHQUFHO0FBQ3JELFlBQUksUUFBUSxJQUFJLE9BQU8sR0FBRztBQUN6QjtBQUFBLFFBQ0Q7QUFDQSxjQUFNLFlBQVksS0FBSyx3QkFBd0IsWUFBWSxLQUFLLE9BQUssRUFBRSxZQUFZLE9BQU87QUFDMUYsWUFBSSxDQUFDLFdBQVc7QUFDZixlQUFLLHFCQUFxQixPQUFPO0FBQUEsUUFDbEM7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFNBQUssWUFBWSxLQUFLLEdBQUcsVUFBVSxXQUFXLFFBQVEsSUFBSSxxQ0FBcUMsT0FBTyxTQUFTLFlBQVksMkNBQTJDLEVBQUUsR0FBRztBQUFBLEVBQzVLO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRQSxNQUFjLHVCQUF1QixTQUFnQztBQUNwRSxRQUFJO0FBQ0gsWUFBTSxLQUFLLHdCQUF3QixzQkFBc0IsT0FBTztBQUFBLElBQ2pFLFNBQVMsT0FBTztBQUNmLFdBQUssWUFBWSxLQUFLLEdBQUcsVUFBVSx5QkFBeUIsT0FBTyxLQUFLLGlCQUFpQixRQUFRLE1BQU0sVUFBVSxPQUFPLEtBQUssQ0FBQyxFQUFFO0FBQUEsSUFDakk7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT1EscUJBQXFCLFNBQXVCO0FBQ25ELFNBQUssY0FBYyxPQUFPLE9BQU87QUFDakMsU0FBSyxpQkFBaUIsT0FBTyxPQUFPO0FBQ3BDLFNBQUssZ0JBQWdCLGlCQUFpQixPQUFPO0FBRzdDLFNBQUssZUFBZSxPQUFPO0FBQzNCLFNBQUssS0FBSyx1QkFBdUIsT0FBTztBQUFBLEVBQ3pDO0FBQUE7QUFBQSxFQUdRLGVBQXFCO0FBRTVCLFNBQUssWUFBWSxPQUFPO0FBQ3hCLFNBQUssWUFBWSxRQUFRO0FBQ3pCLFNBQUssY0FBYyxJQUFJLHdCQUF3QjtBQUMvQyxlQUFXLFdBQVcsQ0FBQyxHQUFHLEtBQUssY0FBYyxLQUFLLENBQUMsR0FBRztBQUNyRCxXQUFLLHFCQUFxQixPQUFPO0FBQUEsSUFDbEM7QUFBQSxFQUNEO0FBQUE7QUFBQSxFQUdRLHdCQUE2QztBQUNwRCxVQUFNLGNBQWMsb0JBQUksSUFBb0I7QUFDNUMsZUFBVyxXQUFXLEtBQUssY0FBYyxLQUFLLEdBQUc7QUFDaEQsa0JBQVksSUFBSSxtQkFBbUIsT0FBTyxHQUFHLE9BQU87QUFBQSxJQUNyRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQSxFQUdRLDJCQUEyQixhQUF5QztBQUMzRSxVQUFNLGNBQWMsS0FBSyxzQkFBc0I7QUFDL0MsVUFBTSxZQUFZLHdDQUF3QyxhQUFhLFlBQVksS0FBSyxDQUFDO0FBQ3pGLFdBQU8sWUFBWSxZQUFZLElBQUksU0FBUyxJQUFJO0FBQUEsRUFDakQ7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFBLE1BQWMsbUJBQW1CLGFBQXVDO0FBQ3ZFLFVBQU0sVUFBVSxLQUFLLDJCQUEyQixXQUFXO0FBQzNELFVBQU0sTUFBTSxVQUFVLEtBQUssY0FBYyxJQUFJLE9BQU8sSUFBSTtBQUN4RCxRQUFJLENBQUMsV0FBVyxDQUFDLEtBQUs7QUFDckIsYUFBTztBQUFBLElBQ1I7QUFHQSxVQUFNLGFBQWEsS0FBSyxRQUFRLEVBQUUsZUFBZSxJQUFJLGVBQWUsV0FBVyxJQUFJLFdBQVcsTUFBTSxJQUFJLEtBQUssQ0FBQztBQUU5RyxVQUFNLGlCQUFpQixXQUFXLEtBQUssTUFBTSxRQUFXLENBQUMsVUFBbUIsU0FBUyxJQUFJLE1BQU0sZ0JBQWdCLENBQUM7QUFDaEgsVUFBTSxvQkFBb0IsS0FBSywwQkFBMEIsR0FBRztBQUU1RCxRQUFJLG1CQUFtQjtBQUd0QixZQUFNLGVBQWUsTUFBTSxRQUFRLEtBQUs7QUFBQSxRQUN2QyxlQUFlLEtBQUssTUFBTSxNQUFTO0FBQUEsUUFDbkM7QUFBQSxNQUNELENBQUM7QUFDRCxVQUFJLGdCQUFnQixLQUFLLFdBQVcsS0FBSyxDQUFDLEtBQUssWUFBWSxNQUFNLHlCQUF5QjtBQUN6RixhQUFLLFlBQVksS0FBSyxHQUFHLFVBQVUsZ0JBQWdCLE9BQU8sc0RBQXNEO0FBQ2hILGNBQU0sU0FBUyxLQUFLLGtCQUFrQixhQUFhLFNBQVMsS0FBSyxpQkFBaUI7QUFFbEYsYUFBSyxlQUFlLEtBQUssQ0FBQUEsa0JBQWdCO0FBQ3hDLGNBQUlBLGtCQUFpQixVQUFhLEtBQUssV0FBVyxLQUFLLENBQUMsS0FBSyxZQUFZLE1BQU0seUJBQXlCO0FBQ3ZHLGlCQUFLLFlBQVksS0FBSyxHQUFHLFVBQVUsZ0JBQWdCLE9BQU8sMERBQTBEO0FBQ3BILGlCQUFLLGdCQUFnQixhQUFhLE9BQU87QUFBQSxVQUMxQztBQUFBLFFBQ0QsQ0FBQztBQUNELGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFVBQU0sZUFBZSxNQUFNO0FBQzNCLFFBQUksaUJBQWlCLFFBQVc7QUFDL0IsV0FBSyxZQUFZLEtBQUssR0FBRyxVQUFVLCtCQUErQixPQUFPLEtBQUssd0JBQXdCLFFBQVEsYUFBYSxVQUFVLE9BQU8sWUFBWSxDQUFDLEVBQUU7QUFJM0osVUFBSSxLQUFLLFdBQVcsS0FBSyxDQUFDLEtBQUssWUFBWSxNQUFNLHlCQUF5QjtBQUN6RSxjQUFNLFNBQVMsS0FBSyxrQkFBa0IsYUFBYSxTQUFTLEtBQUssaUJBQWlCO0FBQ2xGLFlBQUksUUFBUTtBQUNYLGVBQUssZ0JBQWdCLGFBQWEsT0FBTztBQUFBLFFBQzFDO0FBQ0EsZUFBTztBQUFBLE1BQ1I7QUFDQSxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sWUFBWSxtQkFBbUIsT0FBTztBQUM1QyxXQUFPLE1BQU07QUFDWixZQUFNLGFBQWEsS0FBSyx3QkFBd0IsY0FBYyxPQUFPO0FBQ3JFLFVBQUksQ0FBQyxZQUFZO0FBQ2hCLGVBQU87QUFBQSxNQUNSO0FBQ0EsWUFBTSxZQUFZLFdBQVcsVUFBVTtBQUN2QyxVQUFJLHFCQUFxQixPQUFPO0FBQy9CLGVBQU87QUFBQSxNQUNSO0FBQ0EsVUFBSSxXQUFXO0FBQ2QsZUFBTyxVQUFVLE9BQU8sS0FBSyxXQUFTLDZCQUE2QixXQUFXLE1BQU0sUUFBUSxNQUFNLFdBQVc7QUFBQSxNQUM5RztBQUNBLFlBQU0sTUFBTSxVQUFVLFdBQVcsVUFBVSxXQUFXO0FBQUEsSUFDdkQ7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFXUSwwQkFBMEIsS0FBc0Y7QUFDdkgsVUFBTSxTQUFTLElBQUk7QUFDbkIsUUFBSSxDQUFDLFFBQVE7QUFDWixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sUUFBUSxLQUFLLFlBQVk7QUFDL0IsWUFBUSxZQUFZO0FBQ25CLFVBQUk7QUFDSCxjQUFNLFNBQVMsTUFBTSxLQUFLLFlBQVksZUFBZSxJQUFJLGVBQWUsS0FBSztBQUM3RSxZQUFJLE9BQU8sV0FBVyxVQUFVO0FBQy9CLGlCQUFPO0FBQUEsUUFDUjtBQUNBLGFBQUssWUFBWSxNQUFNLEdBQUcsVUFBVSxnQkFBZ0IsSUFBSSxhQUFhLFFBQVEsT0FBTyxNQUFNLDJEQUEyRDtBQUNySixlQUFPLE1BQU0sS0FBSyxZQUFZLGtCQUFrQixRQUFRLEtBQUs7QUFBQSxNQUM5RCxTQUFTLE9BQU87QUFDZixhQUFLLFlBQVksTUFBTSxHQUFHLFVBQVUseUJBQXlCLElBQUksYUFBYSxzQkFBc0IsaUJBQWlCLFFBQVEsTUFBTSxVQUFVLE9BQU8sS0FBSyxDQUFDLEVBQUU7QUFDNUosZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNELEdBQUc7QUFBQSxFQUNKO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBVVEsa0JBQWtCLGFBQXFCLFNBQWlCLEtBQStCLG1CQUF3RTtBQUN0SyxRQUFJLEtBQUssa0JBQWtCLElBQUksV0FBVyxHQUFHO0FBQzVDLGFBQU87QUFBQSxJQUNSO0FBS0EsUUFBSSxLQUFLLHFCQUFxQiwwQkFBMEIsRUFBRSxTQUFTLFdBQVcsR0FBRztBQUNoRixXQUFLLFlBQVksTUFBTSxHQUFHLFVBQVUsSUFBSSxXQUFXLG1FQUFtRTtBQUN0SCxhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksQ0FBQyxJQUFJLFFBQVE7QUFDaEIsV0FBSyxZQUFZLEtBQUssR0FBRyxVQUFVLG1CQUFtQixPQUFPLG1DQUFtQztBQUNoRyxhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxVQUFNLFVBQVUsTUFBTSxJQUFJLEtBQUssc0JBQXNCLGVBQWUsb0NBQW9DO0FBQUEsTUFDdkcsUUFBUSxJQUFJO0FBQUE7QUFBQTtBQUFBLE1BR1osU0FBUztBQUFBLE1BQ1QscUJBQXFCLG1CQUFtQixPQUFPO0FBQUEsTUFDL0M7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFVBQU0sSUFBSSxLQUFLLHFCQUFxQixtQ0FBbUMsYUFBYSxPQUFPLENBQUM7QUFDNUYsU0FBSyxrQkFBa0IsSUFBSSxhQUFhLEtBQUs7QUFDN0MsU0FBSyxtQkFBbUIsSUFBSSxhQUFhLE9BQU87QUFDaEQsVUFBTSxJQUFJLGFBQWEsTUFBTSxLQUFLLG1CQUFtQixPQUFPLFdBQVcsQ0FBQyxDQUFDO0FBQ3pFLFNBQUssWUFBWSxLQUFLLEdBQUcsVUFBVSxZQUFZLFdBQVcsZ0NBQWdDO0FBQzFGLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1RLGdCQUFnQixhQUFxQixTQUF1QjtBQUNuRSxVQUFNLFVBQVUsS0FBSyxtQkFBbUIsSUFBSSxXQUFXO0FBQ3ZELFFBQUksQ0FBQyxTQUFTO0FBR2I7QUFBQSxJQUNEO0FBQ0EsWUFBUSxhQUFhO0FBRXJCLFNBQUssbUJBQW1CLElBQUksT0FBTyxHQUFHLFlBQVksSUFBSTtBQUFBLEVBQ3ZEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT1EsZUFBZSxTQUF1QjtBQUM3QyxTQUFLLG1CQUFtQixJQUFJLE9BQU8sR0FBRyxZQUFZLEtBQUs7QUFDdkQsVUFBTSxZQUFZLG1CQUFtQixPQUFPO0FBQzVDLGVBQVcsZUFBZSxDQUFDLEdBQUcsS0FBSyxrQkFBa0IsS0FBSyxDQUFDLEdBQUc7QUFDN0QsVUFBSSx3Q0FBd0MsYUFBYSxDQUFDLFNBQVMsQ0FBQyxNQUFNLFdBQVc7QUFDcEYsYUFBSyxrQkFBa0IsaUJBQWlCLFdBQVc7QUFDbkQsYUFBSyxZQUFZLEtBQUssR0FBRyxVQUFVLG1DQUFtQyxXQUFXLHVDQUF1QztBQUFBLE1BQ3pIO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsTUFBTSxRQUFRLFNBQXVEO0FBQ3BFLFFBQUksQ0FBQyxLQUFLLFdBQVcsR0FBRztBQUN2QixZQUFNLElBQUksTUFBTSxvREFBb0Q7QUFBQSxJQUNyRTtBQUNBLFVBQU0sVUFBVSxvQkFBb0IsUUFBUSxhQUFhO0FBQ3pELFNBQUssZ0JBQWdCLEVBQUUsZUFBZSxRQUFRLGVBQWUsV0FBVyxRQUFRLFdBQVcsTUFBTSxRQUFRLEtBQUssQ0FBQztBQUUvRyxVQUFNLFVBQVUsS0FBSyxpQkFBaUIsSUFBSSxPQUFPO0FBQ2pELFFBQUksU0FBUztBQUNaLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxRQUFRLEtBQUssWUFBWTtBQUMvQixVQUFNLFdBQVcsWUFBWTtBQUM1QixVQUFJO0FBQ0gsYUFBSyxtQkFBbUIsSUFBSSxPQUFPLEdBQUcsb0JBQW9CLGdDQUFnQyxVQUFVO0FBS3BHLGFBQUssZUFBZSxPQUFPO0FBQzNCLGNBQU0sU0FBUyxNQUFNLEtBQUsscUJBQXFCLFFBQVEsU0FBUyxLQUFLO0FBR3JFLFlBQUksTUFBTSwyQkFBMkIsQ0FBQyxLQUFLLFdBQVcsR0FBRztBQUN4RCxlQUFLLEtBQUssdUJBQXVCLE9BQU87QUFDeEMsZ0JBQU0sSUFBSSxrQkFBa0I7QUFBQSxRQUM3QjtBQUdBLGFBQUssaUJBQWlCO0FBQ3RCLGVBQU87QUFBQSxNQUNSLFVBQUU7QUFDRCxhQUFLLGlCQUFpQixPQUFPLE9BQU87QUFBQSxNQUNyQztBQUFBLElBQ0QsR0FBRztBQUNILFNBQUssaUJBQWlCLElBQUksU0FBUyxPQUFPO0FBQzFDLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxhQUFzQjtBQUM3QixXQUFPLEtBQUssc0JBQXNCLFNBQWtCLDRCQUE0QixLQUM1RSxLQUFLLHNCQUFzQixTQUFrQixnQ0FBZ0M7QUFBQSxFQUNsRjtBQUFBO0FBQUEsRUFHUSxnQkFBZ0IsS0FBcUM7QUFDNUQsVUFBTSxVQUFVLG9CQUFvQixJQUFJLGFBQWE7QUFHckQsVUFBTSxRQUFRLEtBQUssY0FBYyxJQUFJLE9BQU87QUFDNUMsU0FBSyxjQUFjLElBQUksU0FBUyxFQUFFLEdBQUcsT0FBTyxHQUFHLEtBQUssUUFBUSxJQUFJLFVBQVUsT0FBTyxPQUFPLENBQUM7QUFDekYsUUFBSSxLQUFLLGdCQUFnQixJQUFJLE9BQU8sR0FBRztBQUN0QztBQUFBLElBQ0Q7QUFDQSxVQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsVUFBTSxXQUFXLEtBQUsscUJBQXFCO0FBQUEsTUFDMUM7QUFBQSxNQUNBLE1BQU0sSUFBSTtBQUFBLE1BQ1YsaUJBQWlCLE1BQU0sS0FBSyxRQUFRLEVBQUUsZUFBZSxJQUFJLGVBQWUsV0FBVyxJQUFJLFdBQVcsTUFBTSxJQUFJLEtBQUssQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUFBLE1BQUUsQ0FBQztBQUFBLE1BQ2xJLG9CQUFvQjtBQUFBO0FBQUE7QUFBQSxNQUdwQiw0QkFBNEI7QUFBQTtBQUFBLE1BRTVCLG1CQUFtQixRQUFRO0FBQUEsSUFDNUIsQ0FBQztBQUNELFVBQU0sSUFBSSxRQUFRO0FBQ2xCLFVBQU0sSUFBSSxLQUFLLDBCQUEwQixpQkFBaUIsUUFBUSxDQUFDO0FBQ25FLFVBQU0sSUFBSSxrQ0FBa0MsVUFBVSxLQUFLLHVCQUF1QixLQUFLLG9CQUFvQixDQUFDO0FBQzVHLFNBQUssbUJBQW1CLElBQUksU0FBUyxRQUFRO0FBQzdDLFVBQU0sSUFBSSxhQUFhLE1BQU0sS0FBSyxtQkFBbUIsT0FBTyxPQUFPLENBQUMsQ0FBQztBQUNyRSxTQUFLLGdCQUFnQixJQUFJLFNBQVMsS0FBSztBQUN2QyxTQUFLLFlBQVksS0FBSyxHQUFHLFVBQVUscUNBQXFDLE9BQU8sRUFBRTtBQUFBLEVBQ2xGO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLVSxxQkFBcUIsUUFBaUY7QUFDL0csV0FBTyxLQUFLLHNCQUFzQixlQUFlLGlDQUFpQyxNQUFNO0FBQUEsRUFDekY7QUFBQTtBQUFBLEVBR1EsbUJBQXlCO0FBQ2hDLGVBQVcsQ0FBQyxTQUFTLFFBQVEsS0FBSyxLQUFLLG9CQUFvQjtBQUMxRCxZQUFNLGlCQUFpQixLQUFLLHdCQUF3QixZQUFZO0FBQUEsUUFDL0QsT0FBSyxFQUFFLFlBQVksV0FBVyxnQ0FBZ0MsWUFBWSxFQUFFLE1BQU07QUFBQSxNQUNuRjtBQUNBLFVBQUksZ0JBQWdCO0FBQ25CLGNBQU0sYUFBYSxLQUFLLHdCQUF3QixjQUFjLE9BQU87QUFDckUsWUFBSSxZQUFZO0FBQ2YsbUJBQVMsY0FBYyxZQUFZLGVBQWUsZ0JBQWdCO0FBQUEsUUFDbkU7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQTtBQUFBLEVBR1EsNEJBQWtDO0FBQ3pDLGVBQVcsQ0FBQyxTQUFTLFFBQVEsS0FBSyxLQUFLLG9CQUFvQjtBQUMxRCxZQUFNLGlCQUFpQixLQUFLLHdCQUF3QixZQUFZLEtBQUssT0FBSyxFQUFFLFlBQVksT0FBTztBQUMvRixVQUFJLGdCQUFnQjtBQUNuQixpQkFBUyxvQkFBb0IsZUFBZSxNQUFNO0FBQUEsTUFDbkQsV0FBVyxDQUFDLGdDQUFnQyxlQUFlLFNBQVMsaUJBQWlCLElBQUksQ0FBQyxHQUFHO0FBQzVGLGlCQUFTLG9CQUFvQixnQ0FBZ0MsWUFBWTtBQUFBLE1BQzFFO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFDRDtBQXJpQmEsa0NBQ0ksS0FBSztBQURULG9DQUFOO0FBQUEsRUE2Qko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBeENVOyIsCiAgIm5hbWVzIjogWyJjb25uZWN0RXJyb3IiXQp9Cg==
