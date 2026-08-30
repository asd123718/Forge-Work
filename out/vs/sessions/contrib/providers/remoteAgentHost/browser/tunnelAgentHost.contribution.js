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
import { Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { isWeb } from "../../../../../base/common/platform.js";
import { mainWindow } from "../../../../../base/browser/window.js";
import * as nls from "../../../../../nls.js";
import { IRemoteAgentHostService, RemoteAgentHostAutoConnectSettingId, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { isTunnelHosted, ITunnelAgentHostService, TUNNEL_ADDRESS_PREFIX } from "../../../../../platform/agentHost/common/tunnelAgentHost.js";
import { PROTOCOL_VERSION } from "../../../../../platform/agentHost/common/state/protocol/version/registry.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { INotificationService, Severity } from "../../../../../platform/notification/common/notification.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../../workbench/common/contributions.js";
import { ITunnelHostService } from "../../../../../workbench/contrib/chat/common/tunnelHost.js";
import { IAuthenticationService } from "../../../../../workbench/services/authentication/common/authentication.js";
import { IHostService } from "../../../../../workbench/services/host/browser/host.js";
import { logTunnelConnectAttempt, logTunnelConnectResolved, logTunnelDiscoveryResult } from "../../../../common/sessionsTelemetry.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { IAgentHostFilterService } from "../../../../services/agentHostFilter/common/agentHostFilter.js";
import { RemoteAgentHostSessionsProvider } from "./remoteAgentHostSessionsProvider.js";
import { watchForIncompatibleNotifications } from "./remoteHostOptions.js";
const STATUS_CHECK_INTERVAL = 5 * 60 * 1e3;
const RECONNECT_INITIAL_DELAY = 1e3;
const RECONNECT_MAX_DELAY = 3e4;
const RECONNECT_MAX_ATTEMPTS = 10;
const RESUME_RATE_LIMIT_MS = 1e4;
let TunnelAgentHostContribution = class extends Disposable {
  constructor(_tunnelService, _remoteAgentHostService, _sessionsProvidersService, _configurationService, _instantiationService, _notificationService, _logService, _authenticationService, _telemetryService, _hostService, _tunnelHostService, agentHostFilterService) {
    super();
    this._tunnelService = _tunnelService;
    this._remoteAgentHostService = _remoteAgentHostService;
    this._sessionsProvidersService = _sessionsProvidersService;
    this._configurationService = _configurationService;
    this._instantiationService = _instantiationService;
    this._notificationService = _notificationService;
    this._logService = _logService;
    this._authenticationService = _authenticationService;
    this._telemetryService = _telemetryService;
    this._hostService = _hostService;
    this._tunnelHostService = _tunnelHostService;
    this._providerStores = this._register(new DisposableMap());
    this._providerInstances = /* @__PURE__ */ new Map();
    this._pendingConnects = /* @__PURE__ */ new Map();
    this._lastStatusCheck = 0;
    /**
     * `false` until the first {@link _silentStatusCheck} resolves. Until then
     * we keep newly-created providers in the `Connecting` state so the picker
     * doesn't briefly show every cached tunnel as "Offline" on startup.
     */
    this._initialStatusChecked = false;
    /** Previous connection status per address — used to detect Connected→Disconnected transitions. */
    this._previousStatuses = /* @__PURE__ */ new Map();
    /** Pending auto-reconnect timer per address. */
    this._reconnectTimeouts = /* @__PURE__ */ new Map();
    /** Consecutive failed auto-reconnect attempts per address. */
    this._reconnectAttempts = /* @__PURE__ */ new Map();
    /** Addresses whose auto-reconnect loop has paused after too many failures. */
    this._reconnectPaused = /* @__PURE__ */ new Set();
    /**
     * Addresses whose provider currently holds a live connection. Tracked
     * separately from {@link _previousStatuses} so a drop is still detected when
     * the connection passes through an intermediate `connecting` state on its
     * way down.
     */
    this._wiredAddresses = /* @__PURE__ */ new Set();
    /** Timestamp of the last wake-triggered resume, to rate-limit rapid tab toggles. */
    this._lastResumeAt = 0;
    /**
     * Per-address connect sessions for telemetry. A session starts at the
     * first attempt of a connect cycle (initial or reconnect) and ends on
     * terminal resolution (connected, host-offline, max-attempts).
     */
    this._connectSessions = /* @__PURE__ */ new Map();
    this._reconcileProviders();
    this._register(agentHostFilterService.registerDiscoveryHandler(() => this._silentStatusCheck()));
    this._register(this._remoteAgentHostService.onDidChangeConnections(() => {
      this._handleConnectionChanges();
      this._updateConnectionStatuses();
      this._wireConnections();
    }));
    this._register(this._tunnelService.onDidChangeTunnels(() => {
      this._reconcileProviders();
      this._pruneReconnectState();
    }));
    this._register(this._tunnelHostService.onDidChangeStatus(() => {
      this._resetHostedTunnelReconnectState();
      this._silentStatusCheck();
    }));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(RemoteAgentHostsEnabledSettingId)) {
        this._reconcileProviders();
        this._pruneReconnectState();
      }
    }));
    this._register(this._authenticationService.onDidChangeSessions((e) => {
      if (e.providerId !== "github") {
        return;
      }
      this._handleSessionsChange(e);
    }));
    this._register(this._hostService.onDidChangeFocus((focused) => {
      if (focused) {
        this._resumeReconnects("focus");
      }
    }));
    if (isWeb) {
      const onWake = () => this._resumeReconnects("wake");
      mainWindow.addEventListener("online", onWake);
      this._register(toDisposable(() => mainWindow.removeEventListener("online", onWake)));
    }
    this._register(toDisposable(() => {
      for (const timer of this._reconnectTimeouts.values()) {
        clearTimeout(timer);
      }
      this._reconnectTimeouts.clear();
    }));
    agentHostFilterService.rediscover();
  }
  /**
   * Called by the workspace picker when it opens. Silently re-checks
   * tunnel statuses if more than 5 minutes have elapsed since the last check.
   */
  async checkTunnelStatuses() {
    if (Date.now() - this._lastStatusCheck < STATUS_CHECK_INTERVAL) {
      return;
    }
    await this._silentStatusCheck();
  }
  // -- Provider management --
  _reconcileProviders() {
    const enabled = this._configurationService.getValue(RemoteAgentHostsEnabledSettingId);
    const cached = enabled ? this._getProviderTunnels() : [];
    const desiredAddresses = new Set(cached.map((t) => `${TUNNEL_ADDRESS_PREFIX}${t.tunnelId}`));
    for (const [address] of this._providerStores) {
      if (!desiredAddresses.has(address)) {
        this._providerStores.deleteAndDispose(address);
        this._providerInstances.delete(address);
      }
    }
    for (const tunnel of cached) {
      const address = `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`;
      if (!this._providerStores.has(address)) {
        this._createProvider(address, tunnel.name);
      }
    }
  }
  _getProviderTunnels() {
    return this._tunnelService.getCachedTunnels().filter((tunnel) => !this._tunnelService.isAutoConnectSuppressed(tunnel.tunnelId));
  }
  _isHostedTunnel(tunnel) {
    return isTunnelHosted(this._tunnelHostService.sharingInfo, tunnel);
  }
  _resetHostedTunnelReconnectState() {
    for (const tunnel of this._tunnelService.getCachedTunnels()) {
      if (this._isHostedTunnel(tunnel)) {
        const address = `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`;
        this._resetReconnectState(address);
        if (this._remoteAgentHostService.connections.some((connection) => connection.address === address && RemoteAgentHostConnectionStatus.isConnected(connection.status))) {
          this._tunnelService.disconnect(address).catch(() => {
          });
        }
      }
    }
  }
  _createProvider(address, name) {
    const store = new DisposableStore();
    const provider = this._instantiateProvider(address, name);
    provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
    store.add(provider);
    store.add(this._sessionsProvidersService.registerProvider(provider));
    store.add(watchForIncompatibleNotifications(provider, this._instantiationService, this._notificationService));
    this._providerInstances.set(address, provider);
    store.add(toDisposable(() => {
      this._providerInstances.delete(address);
      this._wiredAddresses.delete(address);
    }));
    this._providerStores.set(address, store);
  }
  _instantiateProvider(address, name) {
    return this._instantiationService.createInstance(
      RemoteAgentHostSessionsProvider,
      {
        address,
        name,
        connectOnDemand: () => this._connectTunnel(address, { userInitiated: true }),
        disconnectOnDemand: () => this._disconnectTunnel(address)
      }
    );
  }
  // -- Connection status --
  _updateConnectionStatuses() {
    for (const [address, provider] of this._providerInstances) {
      const connectionInfo = this._remoteAgentHostService.connections.find((c) => c.address === address);
      if (connectionInfo) {
        provider.setConnectionStatus(connectionInfo.status);
        continue;
      }
      if (RemoteAgentHostConnectionStatus.isIncompatible(provider.connectionStatus.get())) {
        continue;
      }
      if (this._pendingConnects.has(address)) {
        provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
      } else if (!this._initialStatusChecked) {
        provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
      } else {
        provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
      }
    }
  }
  /**
   * Wire live connections to their providers so session operations work, and
   * drop a provider's connection once its transport is gone.
   */
  _wireConnections() {
    for (const [address, provider] of this._providerInstances) {
      const connectionInfo = this._remoteAgentHostService.connections.find((c) => c.address === address);
      if (connectionInfo && RemoteAgentHostConnectionStatus.isConnected(connectionInfo.status)) {
        const connection = this._remoteAgentHostService.getConnection(address);
        if (connection) {
          provider.setConnection(connection, connectionInfo.defaultDirectory);
          this._wiredAddresses.add(address);
        }
      } else if (this._wiredAddresses.has(address) && !RemoteAgentHostConnectionStatus.isConnecting(connectionInfo?.status)) {
        this._wiredAddresses.delete(address);
        provider.clearConnection();
      }
    }
  }
  // -- On-demand connection --
  /**
   * Establish a relay connection to a cached tunnel. Called on demand
   * when the user invokes the browse action on an online-but-not-connected tunnel.
   */
  _connectTunnel(address, options) {
    const existing = this._pendingConnects.get(address);
    if (existing) {
      return existing;
    }
    const tunnelId = address.slice(TUNNEL_ADDRESS_PREFIX.length);
    const cached = this._tunnelService.getCachedTunnels().find((t) => t.tunnelId === tunnelId);
    if (!cached) {
      return Promise.resolve();
    }
    if (this._isHostedTunnel(cached)) {
      this._resetReconnectState(address);
      return Promise.resolve();
    }
    if (!options.userInitiated && this._tunnelService.isAutoConnectSuppressed(tunnelId)) {
      this._logService.info(`[TunnelAgentHost] Skipping background connect for user-disconnected tunnel ${address}`);
      return Promise.resolve();
    }
    if (options.userInitiated) {
      this._tunnelService.clearAutoConnectSuppression(tunnelId);
      const provider = this._providerInstances.get(address);
      if (provider && RemoteAgentHostConnectionStatus.isIncompatible(provider.connectionStatus.get())) {
        provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
      }
    }
    this._cancelReconnect(address);
    const { attemptNumber, attemptStart, session, isReconnect } = this._beginConnectAttempt(address);
    const promise = (async () => {
      let handle;
      const timer = options.userInitiated ? setTimeout(() => {
        handle = this._notificationService.notify({
          severity: Severity.Info,
          message: nls.localize("tunnelConnecting", "Connecting to tunnel '{0}'...", cached.name),
          progress: { infinite: true }
        });
      }, 1e3) : void 0;
      this._updateConnectionStatuses();
      try {
        const tunnelInfo = {
          tunnelId: cached.tunnelId,
          clusterId: cached.clusterId,
          name: cached.name,
          tags: [],
          protocolVersion: 5,
          hostConnectionCount: 0
        };
        await this._tunnelService.connect(tunnelInfo, cached.authProvider, { userInitiated: options.userInitiated });
        if (this._isHostedTunnel(cached)) {
          await this._tunnelService.disconnect(address);
          this._resetReconnectState(address);
          return;
        }
        if (!options.userInitiated && this._tunnelService.isAutoConnectSuppressed(cached.tunnelId)) {
          this._logService.info(`[TunnelAgentHost] Disconnecting background connection for user-disconnected tunnel ${address}`);
          await this._tunnelService.disconnect(address);
          this._connectSessions.delete(address);
          return;
        }
        this._finishConnectAttempt(address, { success: true, attemptNumber, attemptStart, session, isReconnect });
      } catch (err) {
        this._logService.warn(`[TunnelAgentHost] Connect to ${cached.name} failed:`, err);
        const errorCategory = this._categorizeError(err);
        this._finishConnectAttempt(address, { success: false, attemptNumber, attemptStart, session, isReconnect, error: err });
        this._pendingConnects.delete(address);
        const incompatible = RemoteAgentHostConnectionStatus.fromConnectError(err, [PROTOCOL_VERSION]);
        if (incompatible) {
          this._providerInstances.get(address)?.setConnectionStatus(incompatible);
          this._resetReconnectState(address);
          throw err;
        }
        if (errorCategory === "authExpired" || errorCategory === "auth") {
          this._pauseReconnect(address, errorCategory);
          throw err;
        }
        const hostOnline = await this._probeHostOnline(cached.tunnelId);
        if (hostOnline === false) {
          this._pauseReconnect(address, "hostOffline");
        } else {
          this._logService.info(`[TunnelAgentHost] Scheduling reconnect for ${address}`);
          this._scheduleReconnect(address);
        }
        throw err;
      } finally {
        if (timer !== void 0) {
          clearTimeout(timer);
        }
        handle?.close();
        this._pendingConnects.delete(address);
        this._updateConnectionStatuses();
      }
    })();
    promise.catch(() => {
    });
    this._pendingConnects.set(address, promise);
    return promise;
  }
  /**
   * Tear down the active tunnel relay for {@link address} and cancel any
   * pending auto-reconnect. The cached tunnel entry is kept so the user
   * can re-connect later; only the live WebSocket is closed.
   */
  async _disconnectTunnel(address) {
    this._cancelReconnect(address);
    this._resetReconnectState(address);
    this._tunnelService.suppressAutoConnect(address.slice(TUNNEL_ADDRESS_PREFIX.length));
    this._previousStatuses.delete(address);
    await this._tunnelService.disconnect(address);
  }
  /**
   * Detect tunnel connections that transitioned from Connected to
   * Disconnected and schedule an auto-reconnect.
   *
   * Important: we only trigger on a Connected → Disconnected transition
   * where the connection entry is still present. If the entry has been
   * removed from the service (e.g. the user clicked "Remove Remote"),
   * we do NOT schedule a reconnect — that would override their intent.
   */
  _handleConnectionChanges() {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      return;
    }
    const cachedAddresses = new Set(this._getProviderTunnels().map((t) => `${TUNNEL_ADDRESS_PREFIX}${t.tunnelId}`));
    const currentStatuses = /* @__PURE__ */ new Map();
    for (const conn of this._remoteAgentHostService.connections) {
      currentStatuses.set(conn.address, conn.status);
    }
    for (const address of cachedAddresses) {
      const previous = this._previousStatuses.get(address);
      const current = currentStatuses.get(address);
      const wasConnected = RemoteAgentHostConnectionStatus.isConnected(previous);
      const isExplicitlyDisconnected = RemoteAgentHostConnectionStatus.isDisconnected(current);
      if (wasConnected && isExplicitlyDisconnected && !this._pendingConnects.has(address)) {
        this._logService.info(`[TunnelAgentHost] Connection lost for ${address}, scheduling reconnect`);
        if (!this._connectSessions.has(address)) {
          this._connectSessions.set(address, { startedAt: Date.now(), attempts: 0, isReconnect: true });
        }
        this._scheduleReconnect(
          address,
          /*immediate*/
          true
        );
      }
      if (current !== void 0) {
        this._previousStatuses.set(address, current);
      } else {
        this._previousStatuses.delete(address);
        this._resetReconnectState(address);
      }
    }
    for (const address of [...this._previousStatuses.keys()]) {
      if (!cachedAddresses.has(address)) {
        this._previousStatuses.delete(address);
      }
    }
  }
  _scheduleReconnect(address, immediate = false) {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      return;
    }
    const tunnelId = address.slice(TUNNEL_ADDRESS_PREFIX.length);
    const cached = this._tunnelService.getCachedTunnels().find((t) => t.tunnelId === tunnelId);
    if (!cached) {
      return;
    }
    if (this._isHostedTunnel(cached)) {
      this._resetReconnectState(address);
      return;
    }
    if (this._pendingConnects.has(address)) {
      return;
    }
    const live = this._remoteAgentHostService.connections.find((c) => c.address === address);
    if (live && RemoteAgentHostConnectionStatus.isConnected(live.status)) {
      this._clearReconnectBackoff(address);
      return;
    }
    this._cancelReconnect(address);
    const attempt = this._reconnectAttempts.get(address) ?? 0;
    if (attempt >= RECONNECT_MAX_ATTEMPTS) {
      this._pauseReconnect(address, "maxAttemptsReached");
      return;
    }
    const delay = immediate ? 0 : Math.min(RECONNECT_INITIAL_DELAY * Math.pow(2, attempt), RECONNECT_MAX_DELAY);
    this._logService.info(
      `[TunnelAgentHost] Scheduling reconnect for ${address} in ${delay}ms (attempt ${attempt + 1}/${RECONNECT_MAX_ATTEMPTS})`
    );
    const timer = setTimeout(() => {
      this._reconnectTimeouts.delete(address);
      if (this._pendingConnects.has(address)) {
        return;
      }
      const live2 = this._remoteAgentHostService.connections.find((c) => c.address === address);
      if (live2 && RemoteAgentHostConnectionStatus.isConnected(live2.status)) {
        this._clearReconnectBackoff(address);
        return;
      }
      this._reconnectAttempts.set(address, attempt + 1);
      this._connectTunnel(address, { userInitiated: false }).catch(() => {
      });
    }, delay);
    this._reconnectTimeouts.set(address, timer);
  }
  /**
   * Best-effort probe of whether the host backing `tunnelId` is online
   * (has any host connections). Returns `undefined` if we couldn't
   * determine — caller should treat as "retry normally" in that case.
   */
  async _probeHostOnline(tunnelId) {
    try {
      const tunnels = await this._tunnelService.listTunnels({ silent: true });
      if (!tunnels) {
        return void 0;
      }
      const info = tunnels.find((t) => t.tunnelId === tunnelId);
      if (!info) {
        return false;
      }
      return info.hostConnectionCount > 0;
    } catch {
      return void 0;
    }
  }
  _cancelReconnect(address) {
    const timer = this._reconnectTimeouts.get(address);
    if (timer !== void 0) {
      clearTimeout(timer);
      this._reconnectTimeouts.delete(address);
    }
  }
  /** Clear retry-backoff and pause state for an address. */
  _clearReconnectBackoff(address) {
    this._reconnectAttempts.delete(address);
    this._reconnectPaused.delete(address);
  }
  /** Drop all reconnect + telemetry state for an address (e.g. on removal). */
  _resetReconnectState(address) {
    this._cancelReconnect(address);
    this._clearReconnectBackoff(address);
    this._connectSessions.delete(address);
  }
  /**
   * React to auth session add/remove. Additions re-run discovery (a fresh
   * token may unblock a previously auth-paused tunnel). Removals drop any
   * tunnel state that depended on that provider — otherwise we'd sit on a
   * stale auth pause forever, or hammer a provider whose session is gone.
   */
  _handleSessionsChange(e) {
    const added = (e.event.added?.length ?? 0) > 0;
    const removed = (e.event.removed?.length ?? 0) > 0;
    if (removed) {
      const cached = this._tunnelService.getCachedTunnels();
      for (const tunnel of cached) {
        if (tunnel.authProvider !== e.providerId) {
          continue;
        }
        const address = `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`;
        this._logService.info(
          `[TunnelAgentHost] Auth session removed for ${e.providerId}; tearing down ${address}.`
        );
        this._resetReconnectState(address);
        this._tunnelService.disconnect(address).catch(() => {
        });
      }
    }
    if (added) {
      this._logService.info(`[TunnelAgentHost] ${e.providerId} session added; resuming reconnects and rediscovering.`);
      this._resumeReconnects("sessionAdded");
      this._silentStatusCheck("sessionChange");
    }
  }
  /**
   * Stop auto-reconnecting for an address until a recovery signal resumes us.
   */
  _pauseReconnect(address, reason) {
    this._cancelReconnect(address);
    this._reconnectAttempts.delete(address);
    this._reconnectPaused.add(address);
    this._logService.info(
      `[TunnelAgentHost] Pausing auto-reconnect for ${address} (${reason}); will resume on ${isWeb ? "network-online, " : ""}window focus, session change, or a status check that confirms the host is online.`
    );
    const session = this._connectSessions.get(address);
    if (session) {
      logTunnelConnectResolved(this._telemetryService, {
        isReconnect: session.isReconnect,
        totalAttempts: session.attempts,
        totalDurationMs: Date.now() - session.startedAt,
        success: false,
        failureReason: reason
      });
      this._connectSessions.delete(address);
    }
  }
  /**
   * Begin (or continue) a connect telemetry session for `address` and
   * return the bookkeeping needed to later finish the attempt. A session
   * already exists if `_handleConnectionChanges` marked this as a
   * reconnect cycle; otherwise this starts a fresh initial-connect session.
   */
  _beginConnectAttempt(address) {
    let session = this._connectSessions.get(address);
    if (!session) {
      session = { startedAt: Date.now(), attempts: 0, isReconnect: false };
      this._connectSessions.set(address, session);
    }
    session.attempts++;
    return { session, attemptNumber: session.attempts, attemptStart: Date.now(), isReconnect: session.isReconnect };
  }
  /**
   * Finalize the telemetry for a single connect attempt. On success, also
   * clears backoff state and closes the session; on failure, only the
   * per-attempt event is emitted (the caller decides whether to retry).
   */
  _finishConnectAttempt(address, args) {
    const { success, attemptNumber, attemptStart, session, isReconnect, error } = args;
    const durationMs = Date.now() - attemptStart;
    if (success) {
      this._clearReconnectBackoff(address);
      logTunnelConnectAttempt(this._telemetryService, { isReconnect, attempt: attemptNumber, durationMs, success: true });
      logTunnelConnectResolved(this._telemetryService, { isReconnect, totalAttempts: attemptNumber, totalDurationMs: Date.now() - session.startedAt, success: true });
      this._connectSessions.delete(address);
    } else {
      logTunnelConnectAttempt(this._telemetryService, { isReconnect, attempt: attemptNumber, durationMs, success: false, errorCategory: this._categorizeError(error) });
    }
  }
  _categorizeError(err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/\b(401|403)\b|token.*expired|expired.*token|invalid[_ -]?grant/i.test(message)) {
      return "authExpired";
    }
    if (/authenticat|unauthoriz|auth.*(fail|error|invalid)/i.test(message)) {
      return "auth";
    }
    if (/WebSocket relay connection failed|failed to connect to relay/i.test(message)) {
      return "relayConnectionFailed";
    }
    if (/network|fetch|offline|ECONN|ENOTFOUND|ETIMEDOUT/i.test(message)) {
      return "network";
    }
    return "other";
  }
  /**
   * Invoked on a browser network, window-focus, or authentication event. Kicks off an
   * immediate attempt for any disconnected cached tunnel.
   *
   * Rate-limited: at most one resume per RESUME_RATE_LIMIT_MS so that
   * rapid tab toggling can't hammer a permanently broken endpoint with
   * an unbounded number of attempt bursts. Resumes the normal backoff
   * sequence (by clearing the pause flag) rather than zeroing the
   * attempt counter.
   */
  _resumeReconnects(trigger) {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      return;
    }
    const now = Date.now();
    if (now - this._lastResumeAt < RESUME_RATE_LIMIT_MS) {
      return;
    }
    this._lastResumeAt = now;
    const cached = this._getProviderTunnels();
    for (const tunnel of cached) {
      const address = `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`;
      if (this._pendingConnects.has(address)) {
        continue;
      }
      const live = this._remoteAgentHostService.connections.find((c) => c.address === address);
      if (live && RemoteAgentHostConnectionStatus.isConnected(live.status)) {
        continue;
      }
      this._logService.info(`[TunnelAgentHost] Resuming reconnect for ${address} (trigger: ${trigger})`);
      if (this._reconnectPaused.has(address)) {
        this._clearReconnectBackoff(address);
      }
      this._scheduleReconnect(
        address,
        /*immediate*/
        true
      );
    }
  }
  /** Drop reconnect state for addresses whose tunnel is no longer cached. */
  _pruneReconnectState() {
    const cachedAddresses = new Set(this._getProviderTunnels().map((t) => `${TUNNEL_ADDRESS_PREFIX}${t.tunnelId}`));
    const tracked = /* @__PURE__ */ new Set([
      ...this._reconnectTimeouts.keys(),
      ...this._reconnectAttempts.keys(),
      ...this._reconnectPaused,
      ...this._connectSessions.keys()
    ]);
    for (const address of tracked) {
      if (!cachedAddresses.has(address)) {
        this._resetReconnectState(address);
      }
    }
  }
  // -- Silent status check --
  async _silentStatusCheck(trigger) {
    const resolvedTrigger = trigger ?? (this._initialStatusChecked ? "rediscover" : "startup");
    const hostsEnabled = this._configurationService.getValue(RemoteAgentHostsEnabledSettingId);
    const autoConnectEnabled = this._configurationService.getValue(RemoteAgentHostAutoConnectSettingId);
    if (!hostsEnabled) {
      this._initialStatusChecked = true;
      this._updateConnectionStatuses();
      logTunnelDiscoveryResult(this._telemetryService, {
        trigger: resolvedTrigger,
        totalFound: 0,
        withActiveHost: 0,
        cachedBefore: this._tunnelService.getCachedTunnels().length,
        autoConnectEnabled,
        hostsEnabled,
        success: true
      });
      return;
    }
    this._lastStatusCheck = Date.now();
    const cachedBefore = this._tunnelService.getCachedTunnels().length;
    let onlineTunnels;
    try {
      onlineTunnels = await this._tunnelService.listTunnels({ silent: true });
    } catch {
      this._initialStatusChecked = true;
      this._updateConnectionStatuses();
      logTunnelDiscoveryResult(this._telemetryService, {
        trigger: resolvedTrigger,
        totalFound: 0,
        withActiveHost: 0,
        cachedBefore,
        autoConnectEnabled,
        hostsEnabled,
        success: false
      });
      return;
    }
    const cached = this._tunnelService.getCachedTunnels();
    if (onlineTunnels) {
      const onlineIds = new Set(onlineTunnels.map((t) => t.tunnelId));
      for (const tunnel of cached) {
        if (!onlineIds.has(tunnel.tunnelId)) {
          this._tunnelService.removeCachedTunnel(tunnel.tunnelId);
        }
      }
      const cachedIds = new Set(cached.map((t) => t.tunnelId));
      for (const tunnel of onlineTunnels) {
        if (!cachedIds.has(tunnel.tunnelId)) {
          this._tunnelService.cacheTunnel(tunnel, "github");
        }
      }
      const onlineTunnelMap = new Map(onlineTunnels.map((t) => [t.tunnelId, t]));
      for (const [address, provider] of this._providerInstances) {
        const hasConnection = this._remoteAgentHostService.connections.some(
          (c) => c.address === address && RemoteAgentHostConnectionStatus.isConnected(c.status)
        );
        if (hasConnection) {
          continue;
        }
        const tunnelId = address.slice(TUNNEL_ADDRESS_PREFIX.length);
        const info = onlineTunnelMap.get(tunnelId);
        if (info && info.hostConnectionCount > 0) {
          provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connected);
          if (this._reconnectPaused.has(address)) {
            this._logService.info(
              `[TunnelAgentHost] Confirmed host online for paused ${address}; auto-resuming reconnect.`
            );
            this._clearReconnectBackoff(address);
            this._scheduleReconnect(
              address,
              /*immediate*/
              true
            );
          }
        } else {
          provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
          provider.unpublishCachedSessions();
        }
      }
      const autoConnect = this._configurationService.getValue(RemoteAgentHostAutoConnectSettingId);
      if (autoConnect) {
        for (const tunnel of onlineTunnels) {
          if (tunnel.hostConnectionCount > 0 && !this._isHostedTunnel(tunnel)) {
            const address = `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`;
            if (this._tunnelService.isAutoConnectSuppressed(tunnel.tunnelId)) {
              continue;
            }
            const alreadyConnected = this._remoteAgentHostService.connections.some(
              (c) => c.address === address && RemoteAgentHostConnectionStatus.isConnected(c.status)
            );
            if (!alreadyConnected) {
              this._connectTunnel(address, { userInitiated: false });
            }
          }
        }
      }
    }
    this._initialStatusChecked = true;
    this._updateConnectionStatuses();
    const totalFound = onlineTunnels?.length ?? 0;
    const withActiveHost = onlineTunnels?.filter((t) => t.hostConnectionCount > 0).length ?? 0;
    this._logService.info(
      `[TunnelAgentHost] Silent status check (${resolvedTrigger}): totalFound=${totalFound}, withActiveHost=${withActiveHost}, cachedBefore=${cachedBefore}, autoConnect=${autoConnectEnabled}`
    );
    logTunnelDiscoveryResult(this._telemetryService, {
      trigger: resolvedTrigger,
      totalFound,
      withActiveHost,
      cachedBefore,
      autoConnectEnabled,
      hostsEnabled,
      success: true
    });
  }
};
TunnelAgentHostContribution.ID = "sessions.contrib.tunnelAgentHostContribution";
TunnelAgentHostContribution = __decorateClass([
  __decorateParam(0, ITunnelAgentHostService),
  __decorateParam(1, IRemoteAgentHostService),
  __decorateParam(2, ISessionsProvidersService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, INotificationService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IAuthenticationService),
  __decorateParam(8, ITelemetryService),
  __decorateParam(9, IHostService),
  __decorateParam(10, ITunnelHostService),
  __decorateParam(11, IAgentHostFilterService)
], TunnelAgentHostContribution);
registerWorkbenchContribution2(TunnelAgentHostContribution.ID, TunnelAgentHostContribution, WorkbenchPhase.AfterRestored);
export {
  TunnelAgentHostContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxyZW1vdGVBZ2VudEhvc3RcXGJyb3dzZXJcXHR1bm5lbEFnZW50SG9zdC5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsIFJlbW90ZUFnZW50SG9zdEF1dG9Db25uZWN0U2V0dGluZ0lkLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLCBSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vcmVtb3RlQWdlbnRIb3N0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1R1bm5lbEhvc3RlZCwgSVR1bm5lbEFnZW50SG9zdFNlcnZpY2UsIFRVTk5FTF9BRERSRVNTX1BSRUZJWCwgdHlwZSBJVHVubmVsSW5mbyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vdHVubmVsQWdlbnRIb3N0LmpzJztcbmltcG9ydCB7IFBST1RPQ09MX1ZFUlNJT04gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3ZlcnNpb24vcmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIsIFdvcmtiZW5jaFBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElUdW5uZWxIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3R1bm5lbEhvc3QuanMnO1xuaW1wb3J0IHsgQXV0aGVudGljYXRpb25TZXNzaW9uc0NoYW5nZUV2ZW50LCBJQXV0aGVudGljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgbG9nVHVubmVsQ29ubmVjdEF0dGVtcHQsIGxvZ1R1bm5lbENvbm5lY3RSZXNvbHZlZCwgbG9nVHVubmVsRGlzY292ZXJ5UmVzdWx0LCBUdW5uZWxDb25uZWN0RXJyb3JDYXRlZ29yeSwgVHVubmVsQ29ubmVjdEZhaWx1cmVSZWFzb24sIFR1bm5lbERpc2NvdmVyeVRyaWdnZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2Vzc2lvbnNUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvYWdlbnRIb3N0RmlsdGVyL2NvbW1vbi9hZ2VudEhvc3RGaWx0ZXIuanMnO1xuaW1wb3J0IHsgUmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciB9IGZyb20gJy4vcmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyB3YXRjaEZvckluY29tcGF0aWJsZU5vdGlmaWNhdGlvbnMgfSBmcm9tICcuL3JlbW90ZUhvc3RPcHRpb25zLmpzJztcblxuLyoqIE1pbmltdW0gaW50ZXJ2YWwgYmV0d2VlbiBzaWxlbnQgc3RhdHVzIGNoZWNrcyAoNSBtaW51dGVzKS4gKi9cbmNvbnN0IFNUQVRVU19DSEVDS19JTlRFUlZBTCA9IDUgKiA2MCAqIDEwMDA7XG5cbi8qKiBJbml0aWFsIGF1dG8tcmVjb25uZWN0IGRlbGF5IGFmdGVyIGFuIHVuZXhwZWN0ZWQgdHVubmVsIGRpc2Nvbm5lY3QuICovXG5jb25zdCBSRUNPTk5FQ1RfSU5JVElBTF9ERUxBWSA9IDEwMDA7XG4vKiogTWF4aW11bSBhdXRvLXJlY29ubmVjdCBiYWNrb2ZmIGRlbGF5LiAqL1xuY29uc3QgUkVDT05ORUNUX01BWF9ERUxBWSA9IDMwXzAwMDtcbi8qKlxuICogQ29uc2VjdXRpdmUgZmFpbHVyZXMgYmVmb3JlIHBhdXNpbmcgYXV0by1yZWNvbm5lY3QuIFdlIHJlc3VtZSBpbW1lZGlhdGVseVxuICogd2hlbiB0aGUgd2luZG93IHJlZ2FpbnMgZm9jdXMsIHNvIHRoaXMgaXNcbiAqIG1vc3RseSBhIGd1YXJkIGFnYWluc3QgYSBwZXJtYW5lbnRseSBkZWFkIHR1bm5lbC5cbiAqL1xuY29uc3QgUkVDT05ORUNUX01BWF9BVFRFTVBUUyA9IDEwO1xuXG4vKiogTWluaW11bSBnYXAgYmV0d2VlbiBldmVudC10cmlnZ2VyZWQgcmVjb25uZWN0IHJlc3VtZXMuICovXG5jb25zdCBSRVNVTUVfUkFURV9MSU1JVF9NUyA9IDEwXzAwMDtcblxuZXhwb3J0IGNsYXNzIFR1bm5lbEFnZW50SG9zdENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnc2Vzc2lvbnMuY29udHJpYi50dW5uZWxBZ2VudEhvc3RDb250cmlidXRpb24nO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVyU3RvcmVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nIC8qIGFkZHJlc3MgKi8sIERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVySW5zdGFuY2VzID0gbmV3IE1hcDxzdHJpbmcsIFJlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdDb25uZWN0cyA9IG5ldyBNYXA8c3RyaW5nLCBQcm9taXNlPHZvaWQ+PigpO1xuXHRwcml2YXRlIF9sYXN0U3RhdHVzQ2hlY2sgPSAwO1xuXHQvKipcblx0ICogYGZhbHNlYCB1bnRpbCB0aGUgZmlyc3Qge0BsaW5rIF9zaWxlbnRTdGF0dXNDaGVja30gcmVzb2x2ZXMuIFVudGlsIHRoZW5cblx0ICogd2Uga2VlcCBuZXdseS1jcmVhdGVkIHByb3ZpZGVycyBpbiB0aGUgYENvbm5lY3RpbmdgIHN0YXRlIHNvIHRoZSBwaWNrZXJcblx0ICogZG9lc24ndCBicmllZmx5IHNob3cgZXZlcnkgY2FjaGVkIHR1bm5lbCBhcyBcIk9mZmxpbmVcIiBvbiBzdGFydHVwLlxuXHQgKi9cblx0cHJpdmF0ZSBfaW5pdGlhbFN0YXR1c0NoZWNrZWQgPSBmYWxzZTtcblxuXHQvKiogUHJldmlvdXMgY29ubmVjdGlvbiBzdGF0dXMgcGVyIGFkZHJlc3MgXHUyMDE0IHVzZWQgdG8gZGV0ZWN0IENvbm5lY3RlZFx1MjE5MkRpc2Nvbm5lY3RlZCB0cmFuc2l0aW9ucy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcHJldmlvdXNTdGF0dXNlcyA9IG5ldyBNYXA8c3RyaW5nLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzPigpO1xuXHQvKiogUGVuZGluZyBhdXRvLXJlY29ubmVjdCB0aW1lciBwZXIgYWRkcmVzcy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVjb25uZWN0VGltZW91dHMgPSBuZXcgTWFwPHN0cmluZywgUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4+KCk7XG5cdC8qKiBDb25zZWN1dGl2ZSBmYWlsZWQgYXV0by1yZWNvbm5lY3QgYXR0ZW1wdHMgcGVyIGFkZHJlc3MuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlY29ubmVjdEF0dGVtcHRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0LyoqIEFkZHJlc3NlcyB3aG9zZSBhdXRvLXJlY29ubmVjdCBsb29wIGhhcyBwYXVzZWQgYWZ0ZXIgdG9vIG1hbnkgZmFpbHVyZXMuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlY29ubmVjdFBhdXNlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHQvKipcblx0ICogQWRkcmVzc2VzIHdob3NlIHByb3ZpZGVyIGN1cnJlbnRseSBob2xkcyBhIGxpdmUgY29ubmVjdGlvbi4gVHJhY2tlZFxuXHQgKiBzZXBhcmF0ZWx5IGZyb20ge0BsaW5rIF9wcmV2aW91c1N0YXR1c2VzfSBzbyBhIGRyb3AgaXMgc3RpbGwgZGV0ZWN0ZWQgd2hlblxuXHQgKiB0aGUgY29ubmVjdGlvbiBwYXNzZXMgdGhyb3VnaCBhbiBpbnRlcm1lZGlhdGUgYGNvbm5lY3RpbmdgIHN0YXRlIG9uIGl0c1xuXHQgKiB3YXkgZG93bi5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dpcmVkQWRkcmVzc2VzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdC8qKiBUaW1lc3RhbXAgb2YgdGhlIGxhc3Qgd2FrZS10cmlnZ2VyZWQgcmVzdW1lLCB0byByYXRlLWxpbWl0IHJhcGlkIHRhYiB0b2dnbGVzLiAqL1xuXHRwcml2YXRlIF9sYXN0UmVzdW1lQXQgPSAwO1xuXG5cdC8qKlxuXHQgKiBQZXItYWRkcmVzcyBjb25uZWN0IHNlc3Npb25zIGZvciB0ZWxlbWV0cnkuIEEgc2Vzc2lvbiBzdGFydHMgYXQgdGhlXG5cdCAqIGZpcnN0IGF0dGVtcHQgb2YgYSBjb25uZWN0IGN5Y2xlIChpbml0aWFsIG9yIHJlY29ubmVjdCkgYW5kIGVuZHMgb25cblx0ICogdGVybWluYWwgcmVzb2x1dGlvbiAoY29ubmVjdGVkLCBob3N0LW9mZmxpbmUsIG1heC1hdHRlbXB0cykuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25uZWN0U2Vzc2lvbnMgPSBuZXcgTWFwPHN0cmluZywgeyBzdGFydGVkQXQ6IG51bWJlcjsgYXR0ZW1wdHM6IG51bWJlcjsgaXNSZWNvbm5lY3Q6IGJvb2xlYW4gfT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVR1bm5lbEFnZW50SG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdHVubmVsU2VydmljZTogSVR1bm5lbEFnZW50SG9zdFNlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3JlbW90ZUFnZW50SG9zdFNlcnZpY2U6IElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25zUHJvdmlkZXJzU2VydmljZTogSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElUdW5uZWxIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90dW5uZWxIb3N0U2VydmljZTogSVR1bm5lbEhvc3RTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0RmlsdGVyU2VydmljZSBhZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlOiBJQWdlbnRIb3N0RmlsdGVyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIENyZWF0ZSBwcm92aWRlcnMgZm9yIGNhY2hlZCB0dW5uZWxzXG5cdFx0dGhpcy5fcmVjb25jaWxlUHJvdmlkZXJzKCk7XG5cblx0XHQvLyBQbHVnIG91ciBzaWxlbnQgc3RhdHVzIGNoZWNrIGludG8gdGhlIHNoYXJlZCBob3N0IHBpY2tlciBVWCBzb1xuXHRcdC8vIHRoZSB1c2VyLXRyaWdnZXJlZCBcIlJlLWRpc2NvdmVyIGhvc3RzXCIgYWN0aW9uIHJ1bnMgdGhlIHNhbWVcblx0XHQvLyBkaXNjb3Zlcnkgcm91dGluZS5cblx0XHR0aGlzLl9yZWdpc3RlcihhZ2VudEhvc3RGaWx0ZXJTZXJ2aWNlLnJlZ2lzdGVyRGlzY292ZXJ5SGFuZGxlcigoKSA9PiB0aGlzLl9zaWxlbnRTdGF0dXNDaGVjaygpKSk7XG5cblx0XHQvLyBVcGRhdGUgY29ubmVjdGlvbiBzdGF0dXNlcyB3aGVuIGNvbm5lY3Rpb25zIGNoYW5nZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2Uub25EaWRDaGFuZ2VDb25uZWN0aW9ucygoKSA9PiB7XG5cdFx0XHR0aGlzLl9oYW5kbGVDb25uZWN0aW9uQ2hhbmdlcygpO1xuXHRcdFx0dGhpcy5fdXBkYXRlQ29ubmVjdGlvblN0YXR1c2VzKCk7XG5cdFx0XHR0aGlzLl93aXJlQ29ubmVjdGlvbnMoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZWNvbmNpbGUgcHJvdmlkZXJzIHdoZW4gdGhlIHR1bm5lbCBjYWNoZSBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdHVubmVsU2VydmljZS5vbkRpZENoYW5nZVR1bm5lbHMoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVjb25jaWxlUHJvdmlkZXJzKCk7XG5cdFx0XHQvLyBTdG9wIGFueSByZWNvbm5lY3QgbG9vcHMgZm9yIHR1bm5lbHMgdGhhdCBubyBsb25nZXIgZXhpc3Rcblx0XHRcdHRoaXMuX3BydW5lUmVjb25uZWN0U3RhdGUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90dW5uZWxIb3N0U2VydmljZS5vbkRpZENoYW5nZVN0YXR1cygoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZXNldEhvc3RlZFR1bm5lbFJlY29ubmVjdFN0YXRlKCk7XG5cdFx0XHR0aGlzLl9zaWxlbnRTdGF0dXNDaGVjaygpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkKSkge1xuXHRcdFx0XHR0aGlzLl9yZWNvbmNpbGVQcm92aWRlcnMoKTtcblx0XHRcdFx0dGhpcy5fcHJ1bmVSZWNvbm5lY3RTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFJlLXJ1biBkaXNjb3Zlcnkgd2hlbiBhIEdpdEh1YiBzZXNzaW9uIGJlY29tZXMgYXZhaWxhYmxlLFxuXHRcdC8vIGFuZCB0ZWFyIGRvd24gdHVubmVsIHN0YXRlIGJvdW5kIHRvIHRoYXQgcHJvdmlkZXIgaWYgaXRzIHNlc3Npb25cblx0XHQvLyBpcyByZW1vdmVkLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4ge1xuXHRcdFx0aWYgKGUucHJvdmlkZXJJZCAhPT0gJ2dpdGh1YicpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5faGFuZGxlU2Vzc2lvbnNDaGFuZ2UoZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faG9zdFNlcnZpY2Uub25EaWRDaGFuZ2VGb2N1cyhmb2N1c2VkID0+IHtcblx0XHRcdGlmIChmb2N1c2VkKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc3VtZVJlY29ubmVjdHMoJ2ZvY3VzJyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gYG9ubGluZWAgaXMgYSBicm93c2VyLW9ubHkgbmV0d29yayBzaWduYWw7IGZvY3VzIGFib3ZlIGNvdmVycyBkZXNrdG9wLlxuXHRcdGlmIChpc1dlYikge1xuXHRcdFx0Y29uc3Qgb25XYWtlID0gKCkgPT4gdGhpcy5fcmVzdW1lUmVjb25uZWN0cygnd2FrZScpO1xuXHRcdFx0bWFpbldpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdvbmxpbmUnLCBvbldha2UpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IG1haW5XaW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcignb25saW5lJywgb25XYWtlKSkpO1xuXHRcdH1cblxuXHRcdC8vIENhbmNlbCBhbnkgcGVuZGluZyByZWNvbm5lY3QgdGltZXJzIG9uIGRpc3Bvc2FsLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHRpbWVyIG9mIHRoaXMuX3JlY29ubmVjdFRpbWVvdXRzLnZhbHVlcygpKSB7XG5cdFx0XHRcdGNsZWFyVGltZW91dCh0aW1lcik7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9yZWNvbm5lY3RUaW1lb3V0cy5jbGVhcigpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFNpbGVudGx5IGNoZWNrIHN0YXR1cyBvZiBjYWNoZWQgdHVubmVscyBvbiBzdGFydHVwLiBSb3V0ZWRcblx0XHQvLyB0aHJvdWdoIHRoZSBmaWx0ZXIgc2VydmljZSdzIGByZWRpc2NvdmVyYCBzbyB0aGUgaG9zdCBwaWxsXG5cdFx0Ly8gcHVsc2VzIHdoaWxlIHRoZSBpbml0aWFsIGF1dG9tYXRpYyBkaXNjb3ZlcnkgaXMgaW4gZmxpZ2h0LFxuXHRcdC8vIHRoZW4gc3dpdGNoZXMgdG8gYSBzdGF0aWMgbGFiZWwgb25jZSB3ZSBrbm93IHdoYXQgaG9zdHMgZXhpc3QuXG5cdFx0YWdlbnRIb3N0RmlsdGVyU2VydmljZS5yZWRpc2NvdmVyKCk7XG5cdH1cblxuXHQvKipcblx0ICogQ2FsbGVkIGJ5IHRoZSB3b3Jrc3BhY2UgcGlja2VyIHdoZW4gaXQgb3BlbnMuIFNpbGVudGx5IHJlLWNoZWNrc1xuXHQgKiB0dW5uZWwgc3RhdHVzZXMgaWYgbW9yZSB0aGFuIDUgbWludXRlcyBoYXZlIGVsYXBzZWQgc2luY2UgdGhlIGxhc3QgY2hlY2suXG5cdCAqL1xuXHRhc3luYyBjaGVja1R1bm5lbFN0YXR1c2VzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChEYXRlLm5vdygpIC0gdGhpcy5fbGFzdFN0YXR1c0NoZWNrIDwgU1RBVFVTX0NIRUNLX0lOVEVSVkFMKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGF3YWl0IHRoaXMuX3NpbGVudFN0YXR1c0NoZWNrKCk7XG5cdH1cblxuXHQvLyAtLSBQcm92aWRlciBtYW5hZ2VtZW50IC0tXG5cblx0cHJpdmF0ZSBfcmVjb25jaWxlUHJvdmlkZXJzKCk6IHZvaWQge1xuXHRcdGNvbnN0IGVuYWJsZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCk7XG5cdFx0Y29uc3QgY2FjaGVkID0gZW5hYmxlZCA/IHRoaXMuX2dldFByb3ZpZGVyVHVubmVscygpIDogW107XG5cdFx0Y29uc3QgZGVzaXJlZEFkZHJlc3NlcyA9IG5ldyBTZXQoY2FjaGVkLm1hcCh0ID0+IGAke1RVTk5FTF9BRERSRVNTX1BSRUZJWH0ke3QudHVubmVsSWR9YCkpO1xuXG5cdFx0Ly8gUmVtb3ZlIHByb3ZpZGVycyBubyBsb25nZXIgY2FjaGVkXG5cdFx0Zm9yIChjb25zdCBbYWRkcmVzc10gb2YgdGhpcy5fcHJvdmlkZXJTdG9yZXMpIHtcblx0XHRcdGlmICghZGVzaXJlZEFkZHJlc3Nlcy5oYXMoYWRkcmVzcykpIHtcblx0XHRcdFx0dGhpcy5fcHJvdmlkZXJTdG9yZXMuZGVsZXRlQW5kRGlzcG9zZShhZGRyZXNzKTtcblx0XHRcdFx0dGhpcy5fcHJvdmlkZXJJbnN0YW5jZXMuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFkZCBwcm92aWRlcnMgZm9yIGNhY2hlZCB0dW5uZWxzXG5cdFx0Zm9yIChjb25zdCB0dW5uZWwgb2YgY2FjaGVkKSB7XG5cdFx0XHRjb25zdCBhZGRyZXNzID0gYCR7VFVOTkVMX0FERFJFU1NfUFJFRklYfSR7dHVubmVsLnR1bm5lbElkfWA7XG5cdFx0XHRpZiAoIXRoaXMuX3Byb3ZpZGVyU3RvcmVzLmhhcyhhZGRyZXNzKSkge1xuXHRcdFx0XHR0aGlzLl9jcmVhdGVQcm92aWRlcihhZGRyZXNzLCB0dW5uZWwubmFtZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UHJvdmlkZXJUdW5uZWxzKCkge1xuXHRcdHJldHVybiB0aGlzLl90dW5uZWxTZXJ2aWNlLmdldENhY2hlZFR1bm5lbHMoKS5maWx0ZXIodHVubmVsID0+ICF0aGlzLl90dW5uZWxTZXJ2aWNlLmlzQXV0b0Nvbm5lY3RTdXBwcmVzc2VkKHR1bm5lbC50dW5uZWxJZCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNIb3N0ZWRUdW5uZWwodHVubmVsOiBQaWNrPElUdW5uZWxJbmZvLCAndHVubmVsSWQnIHwgJ25hbWUnPik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc1R1bm5lbEhvc3RlZCh0aGlzLl90dW5uZWxIb3N0U2VydmljZS5zaGFyaW5nSW5mbywgdHVubmVsKTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc2V0SG9zdGVkVHVubmVsUmVjb25uZWN0U3RhdGUoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCB0dW5uZWwgb2YgdGhpcy5fdHVubmVsU2VydmljZS5nZXRDYWNoZWRUdW5uZWxzKCkpIHtcblx0XHRcdGlmICh0aGlzLl9pc0hvc3RlZFR1bm5lbCh0dW5uZWwpKSB7XG5cdFx0XHRcdGNvbnN0IGFkZHJlc3MgPSBgJHtUVU5ORUxfQUREUkVTU19QUkVGSVh9JHt0dW5uZWwudHVubmVsSWR9YDtcblx0XHRcdFx0dGhpcy5fcmVzZXRSZWNvbm5lY3RTdGF0ZShhZGRyZXNzKTtcblx0XHRcdFx0aWYgKHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuY29ubmVjdGlvbnMuc29tZShjb25uZWN0aW9uID0+IGNvbm5lY3Rpb24uYWRkcmVzcyA9PT0gYWRkcmVzcyAmJiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzQ29ubmVjdGVkKGNvbm5lY3Rpb24uc3RhdHVzKSkpIHtcblx0XHRcdFx0XHR0aGlzLl90dW5uZWxTZXJ2aWNlLmRpc2Nvbm5lY3QoYWRkcmVzcykuY2F0Y2goKCkgPT4geyAvKiBiZXN0IGVmZm9ydCAqLyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVByb3ZpZGVyKGFkZHJlc3M6IHN0cmluZywgbmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9pbnN0YW50aWF0ZVByb3ZpZGVyKGFkZHJlc3MsIG5hbWUpO1xuXHRcdC8vIFN1cmZhY2UgYXMgXCJDb25uZWN0aW5nXCIgdW50aWwgdGhlIGZpcnN0IHNpbGVudCBzdGF0dXMgY2hlY2sgb3IgYW5cblx0XHQvLyBhdXRvLWNvbm5lY3QgYXR0ZW1wdCBkZXRlcm1pbmVzIHRoZSByZWFsIHN0YXRlOyBvdGhlcndpc2UgdGhlIHBpY2tlclxuXHRcdC8vIGZsYXNoZXMgXCJPZmZsaW5lXCIgZm9yIGV2ZXJ5IGNhY2hlZCB0dW5uZWwgb24gc3RhcnR1cC5cblx0XHRwcm92aWRlci5zZXRDb25uZWN0aW9uU3RhdHVzKFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuY29ubmVjdGluZyk7XG5cdFx0c3RvcmUuYWRkKHByb3ZpZGVyKTtcblx0XHRzdG9yZS5hZGQodGhpcy5fc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIocHJvdmlkZXIpKTtcblx0XHRzdG9yZS5hZGQod2F0Y2hGb3JJbmNvbXBhdGlibGVOb3RpZmljYXRpb25zKHByb3ZpZGVyLCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5fbm90aWZpY2F0aW9uU2VydmljZSkpO1xuXHRcdHRoaXMuX3Byb3ZpZGVySW5zdGFuY2VzLnNldChhZGRyZXNzLCBwcm92aWRlcik7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9wcm92aWRlckluc3RhbmNlcy5kZWxldGUoYWRkcmVzcyk7XG5cdFx0XHR0aGlzLl93aXJlZEFkZHJlc3Nlcy5kZWxldGUoYWRkcmVzcyk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3Byb3ZpZGVyU3RvcmVzLnNldChhZGRyZXNzLCBzdG9yZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2luc3RhbnRpYXRlUHJvdmlkZXIoYWRkcmVzczogc3RyaW5nLCBuYW1lOiBzdHJpbmcpOiBSZW1vdGVBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRyZXR1cm4gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRSZW1vdGVBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLCB7XG5cdFx0XHRhZGRyZXNzLFxuXHRcdFx0bmFtZSxcblx0XHRcdGNvbm5lY3RPbkRlbWFuZDogKCkgPT4gdGhpcy5fY29ubmVjdFR1bm5lbChhZGRyZXNzLCB7IHVzZXJJbml0aWF0ZWQ6IHRydWUgfSksXG5cdFx0XHRkaXNjb25uZWN0T25EZW1hbmQ6ICgpID0+IHRoaXMuX2Rpc2Nvbm5lY3RUdW5uZWwoYWRkcmVzcyksXG5cdFx0fSxcblx0XHQpO1xuXHR9XG5cblx0Ly8gLS0gQ29ubmVjdGlvbiBzdGF0dXMgLS1cblxuXHRwcml2YXRlIF91cGRhdGVDb25uZWN0aW9uU3RhdHVzZXMoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBbYWRkcmVzcywgcHJvdmlkZXJdIG9mIHRoaXMuX3Byb3ZpZGVySW5zdGFuY2VzKSB7XG5cdFx0XHRjb25zdCBjb25uZWN0aW9uSW5mbyA9IHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuY29ubmVjdGlvbnMuZmluZChjID0+IGMuYWRkcmVzcyA9PT0gYWRkcmVzcyk7XG5cdFx0XHRpZiAoY29ubmVjdGlvbkluZm8pIHtcblx0XHRcdFx0Ly8gU2VydmljZSBoYXMgYW4gZW50cnkgXHUyMDE0IGl0cyBzdGF0dXMgaXMgYXV0aG9yaXRhdGl2ZVxuXHRcdFx0XHQvLyAoaW5jbHVkaW5nIGluY29tcGF0aWJsZSBmcm9tIHRoZSBXZWJTb2NrZXQgY29ubmVjdFxuXHRcdFx0XHQvLyBmYWlsdXJlIHBhdGgsIGFuZCBjb25uZWN0aW5nL2Nvbm5lY3RlZCBmcm9tIGEgZnJlc2hcblx0XHRcdFx0Ly8gcmVjb25uZWN0IGFmdGVyIGFuIHVwZ3JhZGUpLlxuXHRcdFx0XHRwcm92aWRlci5zZXRDb25uZWN0aW9uU3RhdHVzKGNvbm5lY3Rpb25JbmZvLnN0YXR1cyk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gUHJlc2VydmUgaW5jb21wYXRpYmxlIHN0YXRlIHNldCBieSBgX2Nvbm5lY3RUdW5uZWxgJ3MgY2F0Y2hcblx0XHRcdC8vICh3aGVyZSB0aGUgZmFpbHVyZSBoYXBwZW5zIGJlZm9yZSB0aGUgc2VydmljZSBldmVyIGhhcyBhblxuXHRcdFx0Ly8gZW50cnkpIHVudGlsIHRoZSB1c2VyIHJldHJpZXMgXHUyMDE0IG90aGVyd2lzZSB0aGUgYGZpbmFsbHlgXG5cdFx0XHQvLyBibG9jayB3b3VsZCBpbW1lZGlhdGVseSBvdmVyd3JpdGUgaXQgYmFjayB0byBgZGlzY29ubmVjdGVkYC5cblx0XHRcdGlmIChSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzSW5jb21wYXRpYmxlKHByb3ZpZGVyLmNvbm5lY3Rpb25TdGF0dXMuZ2V0KCkpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX3BlbmRpbmdDb25uZWN0cy5oYXMoYWRkcmVzcykpIHtcblx0XHRcdFx0cHJvdmlkZXIuc2V0Q29ubmVjdGlvblN0YXR1cyhSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RpbmcpO1xuXHRcdFx0fSBlbHNlIGlmICghdGhpcy5faW5pdGlhbFN0YXR1c0NoZWNrZWQpIHtcblx0XHRcdFx0Ly8gS2VlcCB0aGUgaW5pdGlhbCBcIkNvbm5lY3RpbmdcIiBzdGF0ZSBzbyB0aGUgcGlja2VyIGRvZXNuJ3Rcblx0XHRcdFx0Ly8gZmxhc2ggXCJPZmZsaW5lXCIgYmVmb3JlIHRoZSBmaXJzdCBzaWxlbnQgc3RhdHVzIGNoZWNrIHJ1bnMuXG5cdFx0XHRcdHByb3ZpZGVyLnNldENvbm5lY3Rpb25TdGF0dXMoUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0aW5nKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHByb3ZpZGVyLnNldENvbm5lY3Rpb25TdGF0dXMoUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5kaXNjb25uZWN0ZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBXaXJlIGxpdmUgY29ubmVjdGlvbnMgdG8gdGhlaXIgcHJvdmlkZXJzIHNvIHNlc3Npb24gb3BlcmF0aW9ucyB3b3JrLCBhbmRcblx0ICogZHJvcCBhIHByb3ZpZGVyJ3MgY29ubmVjdGlvbiBvbmNlIGl0cyB0cmFuc3BvcnQgaXMgZ29uZS5cblx0ICovXG5cdHByaXZhdGUgX3dpcmVDb25uZWN0aW9ucygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFthZGRyZXNzLCBwcm92aWRlcl0gb2YgdGhpcy5fcHJvdmlkZXJJbnN0YW5jZXMpIHtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb25JbmZvID0gdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5jb25uZWN0aW9ucy5maW5kKGMgPT4gYy5hZGRyZXNzID09PSBhZGRyZXNzKTtcblx0XHRcdGlmIChjb25uZWN0aW9uSW5mbyAmJiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzQ29ubmVjdGVkKGNvbm5lY3Rpb25JbmZvLnN0YXR1cykpIHtcblx0XHRcdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuZ2V0Q29ubmVjdGlvbihhZGRyZXNzKTtcblx0XHRcdFx0aWYgKGNvbm5lY3Rpb24pIHtcblx0XHRcdFx0XHRwcm92aWRlci5zZXRDb25uZWN0aW9uKGNvbm5lY3Rpb24sIGNvbm5lY3Rpb25JbmZvLmRlZmF1bHREaXJlY3RvcnkpO1xuXHRcdFx0XHRcdHRoaXMuX3dpcmVkQWRkcmVzc2VzLmFkZChhZGRyZXNzKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICh0aGlzLl93aXJlZEFkZHJlc3Nlcy5oYXMoYWRkcmVzcykgJiYgIVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNDb25uZWN0aW5nKGNvbm5lY3Rpb25JbmZvPy5zdGF0dXMpKSB7XG5cdFx0XHRcdC8vIEtlZXAgdGhlIHByb3ZpZGVyIGxpdmUgd2hpbGUgYSByZXBsYWNlbWVudCB0cmFuc3BvcnQgaXMgY29ubmVjdGluZy5cblx0XHRcdFx0dGhpcy5fd2lyZWRBZGRyZXNzZXMuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdFx0XHRwcm92aWRlci5jbGVhckNvbm5lY3Rpb24oKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyAtLSBPbi1kZW1hbmQgY29ubmVjdGlvbiAtLVxuXG5cdC8qKlxuXHQgKiBFc3RhYmxpc2ggYSByZWxheSBjb25uZWN0aW9uIHRvIGEgY2FjaGVkIHR1bm5lbC4gQ2FsbGVkIG9uIGRlbWFuZFxuXHQgKiB3aGVuIHRoZSB1c2VyIGludm9rZXMgdGhlIGJyb3dzZSBhY3Rpb24gb24gYW4gb25saW5lLWJ1dC1ub3QtY29ubmVjdGVkIHR1bm5lbC5cblx0ICovXG5cdHByaXZhdGUgX2Nvbm5lY3RUdW5uZWwoYWRkcmVzczogc3RyaW5nLCBvcHRpb25zOiB7IHJlYWRvbmx5IHVzZXJJbml0aWF0ZWQ6IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fcGVuZGluZ0Nvbm5lY3RzLmdldChhZGRyZXNzKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cblx0XHRjb25zdCB0dW5uZWxJZCA9IGFkZHJlc3Muc2xpY2UoVFVOTkVMX0FERFJFU1NfUFJFRklYLmxlbmd0aCk7XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fdHVubmVsU2VydmljZS5nZXRDYWNoZWRUdW5uZWxzKCkuZmluZCh0ID0+IHQudHVubmVsSWQgPT09IHR1bm5lbElkKTtcblx0XHRpZiAoIWNhY2hlZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5faXNIb3N0ZWRUdW5uZWwoY2FjaGVkKSkge1xuXHRcdFx0dGhpcy5fcmVzZXRSZWNvbm5lY3RTdGF0ZShhZGRyZXNzKTtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cdFx0aWYgKCFvcHRpb25zLnVzZXJJbml0aWF0ZWQgJiYgdGhpcy5fdHVubmVsU2VydmljZS5pc0F1dG9Db25uZWN0U3VwcHJlc3NlZCh0dW5uZWxJZCkpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1R1bm5lbEFnZW50SG9zdF0gU2tpcHBpbmcgYmFja2dyb3VuZCBjb25uZWN0IGZvciB1c2VyLWRpc2Nvbm5lY3RlZCB0dW5uZWwgJHthZGRyZXNzfWApO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy51c2VySW5pdGlhdGVkKSB7XG5cdFx0XHR0aGlzLl90dW5uZWxTZXJ2aWNlLmNsZWFyQXV0b0Nvbm5lY3RTdXBwcmVzc2lvbih0dW5uZWxJZCk7XG5cdFx0XHQvLyBDbGVhciBhbnkgc3RpY2t5IGBpbmNvbXBhdGlibGVgIHN0YXRlIHNvIHRoaXMgYXR0ZW1wdCBjYW5cblx0XHRcdC8vIHRyYW5zaXRpb24gdGhyb3VnaCBgY29ubmVjdGluZ2AgYW5kIHJlcG9ydCBhIGZyZXNoIHJlc3VsdC5cblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fcHJvdmlkZXJJbnN0YW5jZXMuZ2V0KGFkZHJlc3MpO1xuXHRcdFx0aWYgKHByb3ZpZGVyICYmIFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNJbmNvbXBhdGlibGUocHJvdmlkZXIuY29ubmVjdGlvblN0YXR1cy5nZXQoKSkpIHtcblx0XHRcdFx0cHJvdmlkZXIuc2V0Q29ubmVjdGlvblN0YXR1cyhSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RpbmcpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEEgbmV3IGF0dGVtcHQgaXMgc3RhcnRpbmcgXHUyMDE0IGNhbmNlbCBhbnkgc2NoZWR1bGVkIHJlY29ubmVjdCB0aW1lcjtcblx0XHQvLyBzdWNjZXNzL2ZhaWx1cmUgb2YgdGhpcyBhdHRlbXB0IHdpbGwgZHJpdmUgdGhlIG5leHQgZGVjaXNpb24uXG5cdFx0dGhpcy5fY2FuY2VsUmVjb25uZWN0KGFkZHJlc3MpO1xuXG5cdFx0Y29uc3QgeyBhdHRlbXB0TnVtYmVyLCBhdHRlbXB0U3RhcnQsIHNlc3Npb24sIGlzUmVjb25uZWN0IH0gPSB0aGlzLl9iZWdpbkNvbm5lY3RBdHRlbXB0KGFkZHJlc3MpO1xuXG5cdFx0Y29uc3QgcHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBTaG93IGEgcHJvZ3Jlc3Mgbm90aWZpY2F0aW9uIGFmdGVyIGEgc2hvcnQgZGVsYXkgc28gcXVpY2tcblx0XHRcdC8vIGNvbm5lY3RzIGRvbid0IGZsYXNoIGEgbm90aWZpY2F0aW9uLiBPbmx5IHNob3cgZm9yIHVzZXItaW5pdGlhdGVkXG5cdFx0XHQvLyBjb25uZWN0czsgYmFja2dyb3VuZCBhdXRvLWNvbm5lY3RzIGFuZCByZWNvbm5lY3RzIHN0YXkgc2lsZW50LlxuXHRcdFx0bGV0IGhhbmRsZTogeyBjbG9zZSgpOiB2b2lkIH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCB0aW1lciA9IG9wdGlvbnMudXNlckluaXRpYXRlZCA/IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRoYW5kbGUgPSB0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCd0dW5uZWxDb25uZWN0aW5nJywgXCJDb25uZWN0aW5nIHRvIHR1bm5lbCAnezB9Jy4uLlwiLCBjYWNoZWQubmFtZSksXG5cdFx0XHRcdFx0cHJvZ3Jlc3M6IHsgaW5maW5pdGU6IHRydWUgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9LCAxMDAwKSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0dGhpcy5fdXBkYXRlQ29ubmVjdGlvblN0YXR1c2VzKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCB0dW5uZWxJbmZvOiBJVHVubmVsSW5mbyA9IHtcblx0XHRcdFx0XHR0dW5uZWxJZDogY2FjaGVkLnR1bm5lbElkLFxuXHRcdFx0XHRcdGNsdXN0ZXJJZDogY2FjaGVkLmNsdXN0ZXJJZCxcblx0XHRcdFx0XHRuYW1lOiBjYWNoZWQubmFtZSxcblx0XHRcdFx0XHR0YWdzOiBbXSxcblx0XHRcdFx0XHRwcm90b2NvbFZlcnNpb246IDUsXG5cdFx0XHRcdFx0aG9zdENvbm5lY3Rpb25Db3VudDogMCxcblx0XHRcdFx0fTtcblx0XHRcdFx0YXdhaXQgdGhpcy5fdHVubmVsU2VydmljZS5jb25uZWN0KHR1bm5lbEluZm8sIGNhY2hlZC5hdXRoUHJvdmlkZXIsIHsgdXNlckluaXRpYXRlZDogb3B0aW9ucy51c2VySW5pdGlhdGVkIH0pO1xuXHRcdFx0XHRpZiAodGhpcy5faXNIb3N0ZWRUdW5uZWwoY2FjaGVkKSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3R1bm5lbFNlcnZpY2UuZGlzY29ubmVjdChhZGRyZXNzKTtcblx0XHRcdFx0XHR0aGlzLl9yZXNldFJlY29ubmVjdFN0YXRlKGFkZHJlc3MpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBSZS1jaGVjayBhZnRlciB0aGUgYXdhaXQ6IHRoZSB1c2VyIG1heSBoYXZlIGRpc2Nvbm5lY3RlZCB0aGlzXG5cdFx0XHRcdC8vIHR1bm5lbCB3aGlsZSB0aGlzIGJhY2tncm91bmQgY29ubmVjdCB3YXMgYWxyZWFkeSBpbiBmbGlnaHQuXG5cdFx0XHRcdGlmICghb3B0aW9ucy51c2VySW5pdGlhdGVkICYmIHRoaXMuX3R1bm5lbFNlcnZpY2UuaXNBdXRvQ29ubmVjdFN1cHByZXNzZWQoY2FjaGVkLnR1bm5lbElkKSkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1R1bm5lbEFnZW50SG9zdF0gRGlzY29ubmVjdGluZyBiYWNrZ3JvdW5kIGNvbm5lY3Rpb24gZm9yIHVzZXItZGlzY29ubmVjdGVkIHR1bm5lbCAke2FkZHJlc3N9YCk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fdHVubmVsU2VydmljZS5kaXNjb25uZWN0KGFkZHJlc3MpO1xuXHRcdFx0XHRcdHRoaXMuX2Nvbm5lY3RTZXNzaW9ucy5kZWxldGUoYWRkcmVzcyk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2ZpbmlzaENvbm5lY3RBdHRlbXB0KGFkZHJlc3MsIHsgc3VjY2VzczogdHJ1ZSwgYXR0ZW1wdE51bWJlciwgYXR0ZW1wdFN0YXJ0LCBzZXNzaW9uLCBpc1JlY29ubmVjdCB9KTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtUdW5uZWxBZ2VudEhvc3RdIENvbm5lY3QgdG8gJHtjYWNoZWQubmFtZX0gZmFpbGVkOmAsIGVycik7XG5cdFx0XHRcdGNvbnN0IGVycm9yQ2F0ZWdvcnkgPSB0aGlzLl9jYXRlZ29yaXplRXJyb3IoZXJyKTtcblx0XHRcdFx0dGhpcy5fZmluaXNoQ29ubmVjdEF0dGVtcHQoYWRkcmVzcywgeyBzdWNjZXNzOiBmYWxzZSwgYXR0ZW1wdE51bWJlciwgYXR0ZW1wdFN0YXJ0LCBzZXNzaW9uLCBpc1JlY29ubmVjdCwgZXJyb3I6IGVyciB9KTtcblx0XHRcdFx0Ly8gQ2xlYXIgdGhlIHBlbmRpbmctY29ubmVjdCBlbnRyeSBCRUZPUkUgZGVjaWRpbmcgd2hhdCB0byBkb1xuXHRcdFx0XHQvLyBuZXh0OyBvdGhlcndpc2UgYF9zY2hlZHVsZVJlY29ubmVjdGAncyBpbi1mbGlnaHQgZ3VhcmRcblx0XHRcdFx0Ly8gKGBfcGVuZGluZ0Nvbm5lY3RzLmhhcyhhZGRyZXNzKWApIHdvdWxkIHNpbGVudGx5IGJhaWwgYW5kXG5cdFx0XHRcdC8vIHdlJ2QgbmV2ZXIgcmUtYXJtIHRoZSB0aW1lciwgbGVhdmluZyB0aGUgdHVubmVsIHN0dWNrLlxuXHRcdFx0XHR0aGlzLl9wZW5kaW5nQ29ubmVjdHMuZGVsZXRlKGFkZHJlc3MpO1xuXG5cdFx0XHRcdC8vIFByb3RvY29sIHZlcnNpb24gbWlzbWF0Y2ggaXMgYSBkZXRlcm1pbmlzdGljIGZhaWx1cmUgdGhhdFxuXHRcdFx0XHQvLyBjYW5ub3QgYmUgZml4ZWQgYnkgcmV0cnlpbmcuIFN1cmZhY2UgaXQgb24gdGhlIHByb3ZpZGVyIHNvXG5cdFx0XHRcdC8vIHRoZSB3b3Jrc3BhY2UgcGlja2VyIGNhbiBzaG93IHRoZSBob3N0J3MgbWVzc2FnZSwgYW5kIHN0b3Bcblx0XHRcdFx0Ly8gc2NoZWR1bGluZyByZWNvbm5lY3RzIHVudGlsIHRoZSB1c2VyIG1hbnVhbGx5IHJldHJpZXMgdmlhXG5cdFx0XHRcdC8vIHRoZSBwaWNrZXIncyBNYW5hZ2UgbWVudS5cblx0XHRcdFx0Y29uc3QgaW5jb21wYXRpYmxlID0gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5mcm9tQ29ubmVjdEVycm9yKGVyciwgW1BST1RPQ09MX1ZFUlNJT05dKTtcblx0XHRcdFx0aWYgKGluY29tcGF0aWJsZSkge1xuXHRcdFx0XHRcdHRoaXMuX3Byb3ZpZGVySW5zdGFuY2VzLmdldChhZGRyZXNzKT8uc2V0Q29ubmVjdGlvblN0YXR1cyhpbmNvbXBhdGlibGUpO1xuXHRcdFx0XHRcdHRoaXMuX3Jlc2V0UmVjb25uZWN0U3RhdGUoYWRkcmVzcyk7XG5cdFx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQXV0aCBmYWlsdXJlcyBhcmUgbm90IHdvcnRoIHJldHJ5aW5nIFx1MjAxNCBhIGZyZXNoIHRva2VuIG11c3Rcblx0XHRcdFx0Ly8gYmUgYWNxdWlyZWQgYnkgdGhlIHVzZXIgb3IgYnkgYSBzZXNzaW9uLWNoYW5nZSBldmVudC4gUGF1c2Vcblx0XHRcdFx0Ly8gaW1tZWRpYXRlbHkgYW5kIGxldCBgX2hhbmRsZVNlc3Npb25zQ2hhbmdlYCByZXN1bWUgdXMgd2hlblxuXHRcdFx0XHQvLyBhIG5ldyBzZXNzaW9uIGFwcGVhcnMuXG5cdFx0XHRcdGlmIChlcnJvckNhdGVnb3J5ID09PSAnYXV0aEV4cGlyZWQnIHx8IGVycm9yQ2F0ZWdvcnkgPT09ICdhdXRoJykge1xuXHRcdFx0XHRcdHRoaXMuX3BhdXNlUmVjb25uZWN0KGFkZHJlc3MsIGVycm9yQ2F0ZWdvcnkpO1xuXHRcdFx0XHRcdHRocm93IGVycjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGhvc3RPbmxpbmUgPSBhd2FpdCB0aGlzLl9wcm9iZUhvc3RPbmxpbmUoY2FjaGVkLnR1bm5lbElkKTtcblx0XHRcdFx0aWYgKGhvc3RPbmxpbmUgPT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0dGhpcy5fcGF1c2VSZWNvbm5lY3QoYWRkcmVzcywgJ2hvc3RPZmZsaW5lJyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbVHVubmVsQWdlbnRIb3N0XSBTY2hlZHVsaW5nIHJlY29ubmVjdCBmb3IgJHthZGRyZXNzfWApO1xuXHRcdFx0XHRcdHRoaXMuX3NjaGVkdWxlUmVjb25uZWN0KGFkZHJlc3MpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGlmICh0aW1lciAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y2xlYXJUaW1lb3V0KHRpbWVyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRoYW5kbGU/LmNsb3NlKCk7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdDb25uZWN0cy5kZWxldGUoYWRkcmVzcyk7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUNvbm5lY3Rpb25TdGF0dXNlcygpO1xuXHRcdFx0fVxuXHRcdH0pKCk7XG5cblx0XHQvLyBTd2FsbG93IHRoZSBwcm9taXNlIHJlamVjdGlvbiBoZXJlIHNvIHVuaGFuZGxlZCByZWplY3Rpb24gbm9pc2Vcblx0XHQvLyBkb2Vzbid0IGJ1YmJsZSB1cCBmb3IgdGhlIGJhY2tncm91bmQgcmVjb25uZWN0IHBhdGg7IGNhbGxlcnMgdGhhdFxuXHRcdC8vIGF3YWl0IGBfY29ubmVjdFR1bm5lbGAgZGlyZWN0bHkgd2lsbCBzdGlsbCBzZWUgaXQgdmlhIHRoZWlyIG93biBgYXdhaXRgLlxuXHRcdHByb21pc2UuY2F0Y2goKCkgPT4geyAvKiBoYW5kbGVkIHZpYSBfc2NoZWR1bGVSZWNvbm5lY3QgKi8gfSk7XG5cblx0XHR0aGlzLl9wZW5kaW5nQ29ubmVjdHMuc2V0KGFkZHJlc3MsIHByb21pc2UpO1xuXHRcdHJldHVybiBwcm9taXNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlYXIgZG93biB0aGUgYWN0aXZlIHR1bm5lbCByZWxheSBmb3Ige0BsaW5rIGFkZHJlc3N9IGFuZCBjYW5jZWwgYW55XG5cdCAqIHBlbmRpbmcgYXV0by1yZWNvbm5lY3QuIFRoZSBjYWNoZWQgdHVubmVsIGVudHJ5IGlzIGtlcHQgc28gdGhlIHVzZXJcblx0ICogY2FuIHJlLWNvbm5lY3QgbGF0ZXI7IG9ubHkgdGhlIGxpdmUgV2ViU29ja2V0IGlzIGNsb3NlZC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2Rpc2Nvbm5lY3RUdW5uZWwoYWRkcmVzczogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fY2FuY2VsUmVjb25uZWN0KGFkZHJlc3MpO1xuXHRcdHRoaXMuX3Jlc2V0UmVjb25uZWN0U3RhdGUoYWRkcmVzcyk7XG5cdFx0dGhpcy5fdHVubmVsU2VydmljZS5zdXBwcmVzc0F1dG9Db25uZWN0KGFkZHJlc3Muc2xpY2UoVFVOTkVMX0FERFJFU1NfUFJFRklYLmxlbmd0aCkpO1xuXHRcdC8vIE1hcmsgYXMgZXhwbGljaXRseSBkaXNjb25uZWN0ZWQgc28gYF9oYW5kbGVDb25uZWN0aW9uQ2hhbmdlc2AgZG9lc1xuXHRcdC8vIG5vdCB0cmVhdCB0aGUgaW1wZW5kaW5nIENvbm5lY3RlZFx1MjE5MihyZW1vdmVkKSB0cmFuc2l0aW9uIGFzIGFcblx0XHQvLyByZWNvbm5lY3Qtd29ydGh5IGRyb3AuXG5cdFx0dGhpcy5fcHJldmlvdXNTdGF0dXNlcy5kZWxldGUoYWRkcmVzcyk7XG5cdFx0YXdhaXQgdGhpcy5fdHVubmVsU2VydmljZS5kaXNjb25uZWN0KGFkZHJlc3MpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERldGVjdCB0dW5uZWwgY29ubmVjdGlvbnMgdGhhdCB0cmFuc2l0aW9uZWQgZnJvbSBDb25uZWN0ZWQgdG9cblx0ICogRGlzY29ubmVjdGVkIGFuZCBzY2hlZHVsZSBhbiBhdXRvLXJlY29ubmVjdC5cblx0ICpcblx0ICogSW1wb3J0YW50OiB3ZSBvbmx5IHRyaWdnZXIgb24gYSBDb25uZWN0ZWQgXHUyMTkyIERpc2Nvbm5lY3RlZCB0cmFuc2l0aW9uXG5cdCAqIHdoZXJlIHRoZSBjb25uZWN0aW9uIGVudHJ5IGlzIHN0aWxsIHByZXNlbnQuIElmIHRoZSBlbnRyeSBoYXMgYmVlblxuXHQgKiByZW1vdmVkIGZyb20gdGhlIHNlcnZpY2UgKGUuZy4gdGhlIHVzZXIgY2xpY2tlZCBcIlJlbW92ZSBSZW1vdGVcIiksXG5cdCAqIHdlIGRvIE5PVCBzY2hlZHVsZSBhIHJlY29ubmVjdCBcdTIwMTQgdGhhdCB3b3VsZCBvdmVycmlkZSB0aGVpciBpbnRlbnQuXG5cdCAqL1xuXHRwcml2YXRlIF9oYW5kbGVDb25uZWN0aW9uQ2hhbmdlcygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhY2hlZEFkZHJlc3NlcyA9IG5ldyBTZXQodGhpcy5fZ2V0UHJvdmlkZXJUdW5uZWxzKCkubWFwKHQgPT4gYCR7VFVOTkVMX0FERFJFU1NfUFJFRklYfSR7dC50dW5uZWxJZH1gKSk7XG5cdFx0Y29uc3QgY3VycmVudFN0YXR1c2VzID0gbmV3IE1hcDxzdHJpbmcsIFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXM+KCk7XG5cdFx0Zm9yIChjb25zdCBjb25uIG9mIHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuY29ubmVjdGlvbnMpIHtcblx0XHRcdGN1cnJlbnRTdGF0dXNlcy5zZXQoY29ubi5hZGRyZXNzLCBjb25uLnN0YXR1cyk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBhZGRyZXNzIG9mIGNhY2hlZEFkZHJlc3Nlcykge1xuXHRcdFx0Y29uc3QgcHJldmlvdXMgPSB0aGlzLl9wcmV2aW91c1N0YXR1c2VzLmdldChhZGRyZXNzKTtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSBjdXJyZW50U3RhdHVzZXMuZ2V0KGFkZHJlc3MpO1xuXG5cdFx0XHQvLyBPbmx5IHNjaGVkdWxlIGEgcmVjb25uZWN0IG9uIGFuIGV4cGxpY2l0IENvbm5lY3RlZFx1MjE5MkRpc2Nvbm5lY3RlZFxuXHRcdFx0Ly8gdHJhbnNpdGlvbi4gSWYgdGhlIGFkZHJlc3MgaXMgYWJzZW50IGZyb20gdGhlIGNvbm5lY3Rpb24gbGlzdCxcblx0XHRcdC8vIHRoZSB1c2VyIChvciBhbm90aGVyIGNvZGUgcGF0aCkgcmVtb3ZlZCBpdCBcdTIwMTQgaG9ub3VyIHRoYXQuXG5cdFx0XHRjb25zdCB3YXNDb25uZWN0ZWQgPSBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzQ29ubmVjdGVkKHByZXZpb3VzKTtcblx0XHRcdGNvbnN0IGlzRXhwbGljaXRseURpc2Nvbm5lY3RlZCA9IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNEaXNjb25uZWN0ZWQoY3VycmVudCk7XG5cblx0XHRcdGlmICh3YXNDb25uZWN0ZWQgJiYgaXNFeHBsaWNpdGx5RGlzY29ubmVjdGVkICYmICF0aGlzLl9wZW5kaW5nQ29ubmVjdHMuaGFzKGFkZHJlc3MpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1R1bm5lbEFnZW50SG9zdF0gQ29ubmVjdGlvbiBsb3N0IGZvciAke2FkZHJlc3N9LCBzY2hlZHVsaW5nIHJlY29ubmVjdGApO1xuXHRcdFx0XHRpZiAoIXRoaXMuX2Nvbm5lY3RTZXNzaW9ucy5oYXMoYWRkcmVzcykpIHtcblx0XHRcdFx0XHR0aGlzLl9jb25uZWN0U2Vzc2lvbnMuc2V0KGFkZHJlc3MsIHsgc3RhcnRlZEF0OiBEYXRlLm5vdygpLCBhdHRlbXB0czogMCwgaXNSZWNvbm5lY3Q6IHRydWUgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fc2NoZWR1bGVSZWNvbm5lY3QoYWRkcmVzcywgLyppbW1lZGlhdGUqLyB0cnVlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gT25seSB0cmFjayBwcmV2aW91cyBzdGF0dXMgd2hpbGUgdGhlIGVudHJ5IGlzIHByZXNlbnQgc28gYVxuXHRcdFx0Ly8gZnV0dXJlIHJlLXJlZ2lzdHJhdGlvbiBzdGFydHMgZnJvbSBhIGNsZWFuIHNsYXRlLiBJZiB0aGVcblx0XHRcdC8vIGVudHJ5IGRpc2FwcGVhcmVkIChlLmcuIHVzZXItaW5pdGlhdGVkIHJlbW92YWwpLCBhbHNvIGNhbmNlbFxuXHRcdFx0Ly8gYW55IGFscmVhZHktc2NoZWR1bGVkIHJlY29ubmVjdCBhbmQgY2xlYXIgaXRzIGJhY2tvZmYgc3RhdGVcblx0XHRcdC8vIHNvIHRoZSByZW1vdmFsIGlzIGhvbm91cmVkIGV2ZW4gaWYgYSB0aW1lciB3YXMgYWxyZWFkeSBhcm1lZC5cblx0XHRcdGlmIChjdXJyZW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fcHJldmlvdXNTdGF0dXNlcy5zZXQoYWRkcmVzcywgY3VycmVudCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9wcmV2aW91c1N0YXR1c2VzLmRlbGV0ZShhZGRyZXNzKTtcblx0XHRcdFx0dGhpcy5fcmVzZXRSZWNvbm5lY3RTdGF0ZShhZGRyZXNzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBEcm9wIHByZXZpb3VzLXN0YXR1cyBlbnRyaWVzIGZvciBhZGRyZXNzZXMgbm8gbG9uZ2VyIGNhY2hlZC5cblx0XHRmb3IgKGNvbnN0IGFkZHJlc3Mgb2YgWy4uLnRoaXMuX3ByZXZpb3VzU3RhdHVzZXMua2V5cygpXSkge1xuXHRcdFx0aWYgKCFjYWNoZWRBZGRyZXNzZXMuaGFzKGFkZHJlc3MpKSB7XG5cdFx0XHRcdHRoaXMuX3ByZXZpb3VzU3RhdHVzZXMuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NjaGVkdWxlUmVjb25uZWN0KGFkZHJlc3M6IHN0cmluZywgaW1tZWRpYXRlID0gZmFsc2UpOiB2b2lkIHtcblx0XHQvLyBSZXNwZWN0IGVuYWJsZW1lbnQgYW5kIHR1bm5lbC1zdGlsbC1jYWNoZWQuXG5cdFx0aWYgKCF0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdHVubmVsSWQgPSBhZGRyZXNzLnNsaWNlKFRVTk5FTF9BRERSRVNTX1BSRUZJWC5sZW5ndGgpO1xuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX3R1bm5lbFNlcnZpY2UuZ2V0Q2FjaGVkVHVubmVscygpLmZpbmQodCA9PiB0LnR1bm5lbElkID09PSB0dW5uZWxJZCk7XG5cdFx0aWYgKCFjYWNoZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2lzSG9zdGVkVHVubmVsKGNhY2hlZCkpIHtcblx0XHRcdHRoaXMuX3Jlc2V0UmVjb25uZWN0U3RhdGUoYWRkcmVzcyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQWxyZWFkeSBjb25uZWN0ZWQgb3IgYSBjb25uZWN0IGlzIGluIGZsaWdodCBcdTIwMTQgbm90aGluZyB0byBkby5cblx0XHRpZiAodGhpcy5fcGVuZGluZ0Nvbm5lY3RzLmhhcyhhZGRyZXNzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBsaXZlID0gdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5jb25uZWN0aW9ucy5maW5kKGMgPT4gYy5hZGRyZXNzID09PSBhZGRyZXNzKTtcblx0XHRpZiAobGl2ZSAmJiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzQ29ubmVjdGVkKGxpdmUuc3RhdHVzKSkge1xuXHRcdFx0dGhpcy5fY2xlYXJSZWNvbm5lY3RCYWNrb2ZmKGFkZHJlc3MpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENhbmNlbCBhbnkgZXhpc3RpbmcgdGltZXIgXHUyMDE0IHdlJ3JlIHJlc2NoZWR1bGluZy5cblx0XHR0aGlzLl9jYW5jZWxSZWNvbm5lY3QoYWRkcmVzcyk7XG5cblx0XHRjb25zdCBhdHRlbXB0ID0gdGhpcy5fcmVjb25uZWN0QXR0ZW1wdHMuZ2V0KGFkZHJlc3MpID8/IDA7XG5cblx0XHRpZiAoYXR0ZW1wdCA+PSBSRUNPTk5FQ1RfTUFYX0FUVEVNUFRTKSB7XG5cdFx0XHR0aGlzLl9wYXVzZVJlY29ubmVjdChhZGRyZXNzLCAnbWF4QXR0ZW1wdHNSZWFjaGVkJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVsYXkgPSBpbW1lZGlhdGVcblx0XHRcdD8gMFxuXHRcdFx0OiBNYXRoLm1pbihSRUNPTk5FQ1RfSU5JVElBTF9ERUxBWSAqIE1hdGgucG93KDIsIGF0dGVtcHQpLCBSRUNPTk5FQ1RfTUFYX0RFTEFZKTtcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhcblx0XHRcdGBbVHVubmVsQWdlbnRIb3N0XSBTY2hlZHVsaW5nIHJlY29ubmVjdCBmb3IgJHthZGRyZXNzfSBpbiAke2RlbGF5fW1zIChhdHRlbXB0ICR7YXR0ZW1wdCArIDF9LyR7UkVDT05ORUNUX01BWF9BVFRFTVBUU30pYFxuXHRcdCk7XG5cblx0XHRjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcmVjb25uZWN0VGltZW91dHMuZGVsZXRlKGFkZHJlc3MpO1xuXG5cdFx0XHQvLyBBIG1hbnVhbCAob3Igb3RoZXIpIGNvbm5lY3QgbWF5IGhhdmUgc3RhcnRlZCBvciBjb21wbGV0ZWQgd2hpbGVcblx0XHRcdC8vIHdlIHdlcmUgd2FpdGluZy4gUmUtY2hlY2sgYmVmb3JlIGNvdW50aW5nIHRoaXMgYXMgYSBuZXcgYXR0ZW1wdCxcblx0XHRcdC8vIG90aGVyd2lzZSBgX2Nvbm5lY3RUdW5uZWxgIHdvdWxkIGp1c3QgcmV0dXJuIHRoZSBpbi1mbGlnaHQgcHJvbWlzZVxuXHRcdFx0Ly8gYW5kIHdlJ2QgaW5mbGF0ZSB0aGUgYmFja29mZiBjb3VudGVyIHdpdGhvdXQgcmVhbGx5IHRyeWluZyBhZ2Fpbi5cblx0XHRcdGlmICh0aGlzLl9wZW5kaW5nQ29ubmVjdHMuaGFzKGFkZHJlc3MpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxpdmUgPSB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbm5lY3Rpb25zLmZpbmQoYyA9PiBjLmFkZHJlc3MgPT09IGFkZHJlc3MpO1xuXHRcdFx0aWYgKGxpdmUgJiYgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChsaXZlLnN0YXR1cykpIHtcblx0XHRcdFx0dGhpcy5fY2xlYXJSZWNvbm5lY3RCYWNrb2ZmKGFkZHJlc3MpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX3JlY29ubmVjdEF0dGVtcHRzLnNldChhZGRyZXNzLCBhdHRlbXB0ICsgMSk7XG5cdFx0XHR0aGlzLl9jb25uZWN0VHVubmVsKGFkZHJlc3MsIHsgdXNlckluaXRpYXRlZDogZmFsc2UgfSkuY2F0Y2goKCkgPT4geyAvKiBfY29ubmVjdFR1bm5lbCBhbHJlYWR5IHJlLXNjaGVkdWxlcyBvbiBmYWlsdXJlICovIH0pO1xuXHRcdH0sIGRlbGF5KTtcblx0XHR0aGlzLl9yZWNvbm5lY3RUaW1lb3V0cy5zZXQoYWRkcmVzcywgdGltZXIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEJlc3QtZWZmb3J0IHByb2JlIG9mIHdoZXRoZXIgdGhlIGhvc3QgYmFja2luZyBgdHVubmVsSWRgIGlzIG9ubGluZVxuXHQgKiAoaGFzIGFueSBob3N0IGNvbm5lY3Rpb25zKS4gUmV0dXJucyBgdW5kZWZpbmVkYCBpZiB3ZSBjb3VsZG4ndFxuXHQgKiBkZXRlcm1pbmUgXHUyMDE0IGNhbGxlciBzaG91bGQgdHJlYXQgYXMgXCJyZXRyeSBub3JtYWxseVwiIGluIHRoYXQgY2FzZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3Byb2JlSG9zdE9ubGluZSh0dW5uZWxJZDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHR1bm5lbHMgPSBhd2FpdCB0aGlzLl90dW5uZWxTZXJ2aWNlLmxpc3RUdW5uZWxzKHsgc2lsZW50OiB0cnVlIH0pO1xuXHRcdFx0aWYgKCF0dW5uZWxzKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbmZvID0gdHVubmVscy5maW5kKHQgPT4gdC50dW5uZWxJZCA9PT0gdHVubmVsSWQpO1xuXHRcdFx0aWYgKCFpbmZvKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpbmZvLmhvc3RDb25uZWN0aW9uQ291bnQgPiAwO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jYW5jZWxSZWNvbm5lY3QoYWRkcmVzczogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgdGltZXIgPSB0aGlzLl9yZWNvbm5lY3RUaW1lb3V0cy5nZXQoYWRkcmVzcyk7XG5cdFx0aWYgKHRpbWVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aW1lcik7XG5cdFx0XHR0aGlzLl9yZWNvbm5lY3RUaW1lb3V0cy5kZWxldGUoYWRkcmVzcyk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIENsZWFyIHJldHJ5LWJhY2tvZmYgYW5kIHBhdXNlIHN0YXRlIGZvciBhbiBhZGRyZXNzLiAqL1xuXHRwcml2YXRlIF9jbGVhclJlY29ubmVjdEJhY2tvZmYoYWRkcmVzczogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVjb25uZWN0QXR0ZW1wdHMuZGVsZXRlKGFkZHJlc3MpO1xuXHRcdHRoaXMuX3JlY29ubmVjdFBhdXNlZC5kZWxldGUoYWRkcmVzcyk7XG5cdH1cblxuXHQvKiogRHJvcCBhbGwgcmVjb25uZWN0ICsgdGVsZW1ldHJ5IHN0YXRlIGZvciBhbiBhZGRyZXNzIChlLmcuIG9uIHJlbW92YWwpLiAqL1xuXHRwcml2YXRlIF9yZXNldFJlY29ubmVjdFN0YXRlKGFkZHJlc3M6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2NhbmNlbFJlY29ubmVjdChhZGRyZXNzKTtcblx0XHR0aGlzLl9jbGVhclJlY29ubmVjdEJhY2tvZmYoYWRkcmVzcyk7XG5cdFx0dGhpcy5fY29ubmVjdFNlc3Npb25zLmRlbGV0ZShhZGRyZXNzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFjdCB0byBhdXRoIHNlc3Npb24gYWRkL3JlbW92ZS4gQWRkaXRpb25zIHJlLXJ1biBkaXNjb3ZlcnkgKGEgZnJlc2hcblx0ICogdG9rZW4gbWF5IHVuYmxvY2sgYSBwcmV2aW91c2x5IGF1dGgtcGF1c2VkIHR1bm5lbCkuIFJlbW92YWxzIGRyb3AgYW55XG5cdCAqIHR1bm5lbCBzdGF0ZSB0aGF0IGRlcGVuZGVkIG9uIHRoYXQgcHJvdmlkZXIgXHUyMDE0IG90aGVyd2lzZSB3ZSdkIHNpdCBvbiBhXG5cdCAqIHN0YWxlIGF1dGggcGF1c2UgZm9yZXZlciwgb3IgaGFtbWVyIGEgcHJvdmlkZXIgd2hvc2Ugc2Vzc2lvbiBpcyBnb25lLlxuXHQgKi9cblx0cHJpdmF0ZSBfaGFuZGxlU2Vzc2lvbnNDaGFuZ2UoZTogeyBwcm92aWRlcklkOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IGV2ZW50OiBBdXRoZW50aWNhdGlvblNlc3Npb25zQ2hhbmdlRXZlbnQgfSk6IHZvaWQge1xuXHRcdGNvbnN0IGFkZGVkID0gKGUuZXZlbnQuYWRkZWQ/Lmxlbmd0aCA/PyAwKSA+IDA7XG5cdFx0Y29uc3QgcmVtb3ZlZCA9IChlLmV2ZW50LnJlbW92ZWQ/Lmxlbmd0aCA/PyAwKSA+IDA7XG5cblx0XHRpZiAocmVtb3ZlZCkge1xuXHRcdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fdHVubmVsU2VydmljZS5nZXRDYWNoZWRUdW5uZWxzKCk7XG5cdFx0XHRmb3IgKGNvbnN0IHR1bm5lbCBvZiBjYWNoZWQpIHtcblx0XHRcdFx0aWYgKHR1bm5lbC5hdXRoUHJvdmlkZXIgIT09IGUucHJvdmlkZXJJZCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGFkZHJlc3MgPSBgJHtUVU5ORUxfQUREUkVTU19QUkVGSVh9JHt0dW5uZWwudHVubmVsSWR9YDtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKFxuXHRcdFx0XHRcdGBbVHVubmVsQWdlbnRIb3N0XSBBdXRoIHNlc3Npb24gcmVtb3ZlZCBmb3IgJHtlLnByb3ZpZGVySWR9OyB0ZWFyaW5nIGRvd24gJHthZGRyZXNzfS5gXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHRoaXMuX3Jlc2V0UmVjb25uZWN0U3RhdGUoYWRkcmVzcyk7XG5cdFx0XHRcdC8vIEJlc3QtZWZmb3J0IGRpc2Nvbm5lY3QgXHUyMDE0IHRoZSB0cmFuc3BvcnQgbWF5IGFscmVhZHkgYmUgZGVhZC5cblx0XHRcdFx0dGhpcy5fdHVubmVsU2VydmljZS5kaXNjb25uZWN0KGFkZHJlc3MpLmNhdGNoKCgpID0+IHsgLyogaWdub3JlICovIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChhZGRlZCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbVHVubmVsQWdlbnRIb3N0XSAke2UucHJvdmlkZXJJZH0gc2Vzc2lvbiBhZGRlZDsgcmVzdW1pbmcgcmVjb25uZWN0cyBhbmQgcmVkaXNjb3ZlcmluZy5gKTtcblx0XHRcdHRoaXMuX3Jlc3VtZVJlY29ubmVjdHMoJ3Nlc3Npb25BZGRlZCcpO1xuXHRcdFx0dGhpcy5fc2lsZW50U3RhdHVzQ2hlY2soJ3Nlc3Npb25DaGFuZ2UnKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU3RvcCBhdXRvLXJlY29ubmVjdGluZyBmb3IgYW4gYWRkcmVzcyB1bnRpbCBhIHJlY292ZXJ5IHNpZ25hbCByZXN1bWVzIHVzLlxuXHQgKi9cblx0cHJpdmF0ZSBfcGF1c2VSZWNvbm5lY3QoYWRkcmVzczogc3RyaW5nLCByZWFzb246IFR1bm5lbENvbm5lY3RGYWlsdXJlUmVhc29uKTogdm9pZCB7XG5cdFx0dGhpcy5fY2FuY2VsUmVjb25uZWN0KGFkZHJlc3MpO1xuXHRcdHRoaXMuX3JlY29ubmVjdEF0dGVtcHRzLmRlbGV0ZShhZGRyZXNzKTtcblx0XHR0aGlzLl9yZWNvbm5lY3RQYXVzZWQuYWRkKGFkZHJlc3MpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhcblx0XHRcdGBbVHVubmVsQWdlbnRIb3N0XSBQYXVzaW5nIGF1dG8tcmVjb25uZWN0IGZvciAke2FkZHJlc3N9ICgke3JlYXNvbn0pOyBgICtcblx0XHRcdGB3aWxsIHJlc3VtZSBvbiAke2lzV2ViID8gJ25ldHdvcmstb25saW5lLCAnIDogJyd9d2luZG93IGZvY3VzLCBzZXNzaW9uIGNoYW5nZSwgb3IgYSBzdGF0dXMgY2hlY2sgdGhhdCBjb25maXJtcyB0aGUgaG9zdCBpcyBvbmxpbmUuYFxuXHRcdCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX2Nvbm5lY3RTZXNzaW9ucy5nZXQoYWRkcmVzcyk7XG5cdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdGxvZ1R1bm5lbENvbm5lY3RSZXNvbHZlZCh0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHRcdGlzUmVjb25uZWN0OiBzZXNzaW9uLmlzUmVjb25uZWN0LFxuXHRcdFx0XHR0b3RhbEF0dGVtcHRzOiBzZXNzaW9uLmF0dGVtcHRzLFxuXHRcdFx0XHR0b3RhbER1cmF0aW9uTXM6IERhdGUubm93KCkgLSBzZXNzaW9uLnN0YXJ0ZWRBdCxcblx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdGZhaWx1cmVSZWFzb246IHJlYXNvbixcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fY29ubmVjdFNlc3Npb25zLmRlbGV0ZShhZGRyZXNzKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQmVnaW4gKG9yIGNvbnRpbnVlKSBhIGNvbm5lY3QgdGVsZW1ldHJ5IHNlc3Npb24gZm9yIGBhZGRyZXNzYCBhbmRcblx0ICogcmV0dXJuIHRoZSBib29ra2VlcGluZyBuZWVkZWQgdG8gbGF0ZXIgZmluaXNoIHRoZSBhdHRlbXB0LiBBIHNlc3Npb25cblx0ICogYWxyZWFkeSBleGlzdHMgaWYgYF9oYW5kbGVDb25uZWN0aW9uQ2hhbmdlc2AgbWFya2VkIHRoaXMgYXMgYVxuXHQgKiByZWNvbm5lY3QgY3ljbGU7IG90aGVyd2lzZSB0aGlzIHN0YXJ0cyBhIGZyZXNoIGluaXRpYWwtY29ubmVjdCBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfYmVnaW5Db25uZWN0QXR0ZW1wdChhZGRyZXNzOiBzdHJpbmcpOiB7IHNlc3Npb246IHsgc3RhcnRlZEF0OiBudW1iZXI7IGF0dGVtcHRzOiBudW1iZXI7IGlzUmVjb25uZWN0OiBib29sZWFuIH07IGF0dGVtcHROdW1iZXI6IG51bWJlcjsgYXR0ZW1wdFN0YXJ0OiBudW1iZXI7IGlzUmVjb25uZWN0OiBib29sZWFuIH0ge1xuXHRcdGxldCBzZXNzaW9uID0gdGhpcy5fY29ubmVjdFNlc3Npb25zLmdldChhZGRyZXNzKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHNlc3Npb24gPSB7IHN0YXJ0ZWRBdDogRGF0ZS5ub3coKSwgYXR0ZW1wdHM6IDAsIGlzUmVjb25uZWN0OiBmYWxzZSB9O1xuXHRcdFx0dGhpcy5fY29ubmVjdFNlc3Npb25zLnNldChhZGRyZXNzLCBzZXNzaW9uKTtcblx0XHR9XG5cdFx0c2Vzc2lvbi5hdHRlbXB0cysrO1xuXHRcdHJldHVybiB7IHNlc3Npb24sIGF0dGVtcHROdW1iZXI6IHNlc3Npb24uYXR0ZW1wdHMsIGF0dGVtcHRTdGFydDogRGF0ZS5ub3coKSwgaXNSZWNvbm5lY3Q6IHNlc3Npb24uaXNSZWNvbm5lY3QgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaW5hbGl6ZSB0aGUgdGVsZW1ldHJ5IGZvciBhIHNpbmdsZSBjb25uZWN0IGF0dGVtcHQuIE9uIHN1Y2Nlc3MsIGFsc29cblx0ICogY2xlYXJzIGJhY2tvZmYgc3RhdGUgYW5kIGNsb3NlcyB0aGUgc2Vzc2lvbjsgb24gZmFpbHVyZSwgb25seSB0aGVcblx0ICogcGVyLWF0dGVtcHQgZXZlbnQgaXMgZW1pdHRlZCAodGhlIGNhbGxlciBkZWNpZGVzIHdoZXRoZXIgdG8gcmV0cnkpLlxuXHQgKi9cblx0cHJpdmF0ZSBfZmluaXNoQ29ubmVjdEF0dGVtcHQoYWRkcmVzczogc3RyaW5nLCBhcmdzOiB7XG5cdFx0c3VjY2VzczogYm9vbGVhbjtcblx0XHRhdHRlbXB0TnVtYmVyOiBudW1iZXI7XG5cdFx0YXR0ZW1wdFN0YXJ0OiBudW1iZXI7XG5cdFx0c2Vzc2lvbjogeyBzdGFydGVkQXQ6IG51bWJlcjsgYXR0ZW1wdHM6IG51bWJlcjsgaXNSZWNvbm5lY3Q6IGJvb2xlYW4gfTtcblx0XHRpc1JlY29ubmVjdDogYm9vbGVhbjtcblx0XHRlcnJvcj86IHVua25vd247XG5cdH0pOiB2b2lkIHtcblx0XHRjb25zdCB7IHN1Y2Nlc3MsIGF0dGVtcHROdW1iZXIsIGF0dGVtcHRTdGFydCwgc2Vzc2lvbiwgaXNSZWNvbm5lY3QsIGVycm9yIH0gPSBhcmdzO1xuXHRcdGNvbnN0IGR1cmF0aW9uTXMgPSBEYXRlLm5vdygpIC0gYXR0ZW1wdFN0YXJ0O1xuXHRcdGlmIChzdWNjZXNzKSB7XG5cdFx0XHR0aGlzLl9jbGVhclJlY29ubmVjdEJhY2tvZmYoYWRkcmVzcyk7XG5cdFx0XHRsb2dUdW5uZWxDb25uZWN0QXR0ZW1wdCh0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCB7IGlzUmVjb25uZWN0LCBhdHRlbXB0OiBhdHRlbXB0TnVtYmVyLCBkdXJhdGlvbk1zLCBzdWNjZXNzOiB0cnVlIH0pO1xuXHRcdFx0bG9nVHVubmVsQ29ubmVjdFJlc29sdmVkKHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UsIHsgaXNSZWNvbm5lY3QsIHRvdGFsQXR0ZW1wdHM6IGF0dGVtcHROdW1iZXIsIHRvdGFsRHVyYXRpb25NczogRGF0ZS5ub3coKSAtIHNlc3Npb24uc3RhcnRlZEF0LCBzdWNjZXNzOiB0cnVlIH0pO1xuXHRcdFx0dGhpcy5fY29ubmVjdFNlc3Npb25zLmRlbGV0ZShhZGRyZXNzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bG9nVHVubmVsQ29ubmVjdEF0dGVtcHQodGhpcy5fdGVsZW1ldHJ5U2VydmljZSwgeyBpc1JlY29ubmVjdCwgYXR0ZW1wdDogYXR0ZW1wdE51bWJlciwgZHVyYXRpb25Ncywgc3VjY2VzczogZmFsc2UsIGVycm9yQ2F0ZWdvcnk6IHRoaXMuX2NhdGVnb3JpemVFcnJvcihlcnJvcikgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY2F0ZWdvcml6ZUVycm9yKGVycjogdW5rbm93bik6IFR1bm5lbENvbm5lY3RFcnJvckNhdGVnb3J5IHtcblx0XHRjb25zdCBtZXNzYWdlID0gZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpO1xuXHRcdC8vIEV4cGlyZWQgLyBpbnZhbGlkIGNyZWRlbnRpYWwgXHUyMDE0IGNhbGxlcnMgc2hvcnQtY2lyY3VpdCB0aGlzIGNhdGVnb3J5XG5cdFx0Ly8gdG8gYXZvaWQgYnVybmluZyByZXRyeSBidWRnZXQgb24gYSB0b2tlbiB0aGUgdXNlciBoYXMgdG8gcmVmcmVzaC5cblx0XHRpZiAoL1xcYig0MDF8NDAzKVxcYnx0b2tlbi4qZXhwaXJlZHxleHBpcmVkLip0b2tlbnxpbnZhbGlkW18gLV0/Z3JhbnQvaS50ZXN0KG1lc3NhZ2UpKSB7XG5cdFx0XHRyZXR1cm4gJ2F1dGhFeHBpcmVkJztcblx0XHR9XG5cdFx0Ly8gTWF0Y2ggYXV0aGVudGljYXRpb24tc3BlY2lmaWMgbGFuZ3VhZ2UgYnV0IE5PVCBcImNvbm5lY3Rpb24gdG9rZW5cIlxuXHRcdC8vIG9yIG90aGVyIHByb3RvY29sIHVzZXMgb2YgdGhlIHdvcmQgXCJ0b2tlblwiLlxuXHRcdGlmICgvYXV0aGVudGljYXR8dW5hdXRob3JpenxhdXRoLiooZmFpbHxlcnJvcnxpbnZhbGlkKS9pLnRlc3QobWVzc2FnZSkpIHtcblx0XHRcdHJldHVybiAnYXV0aCc7XG5cdFx0fVxuXHRcdGlmICgvV2ViU29ja2V0IHJlbGF5IGNvbm5lY3Rpb24gZmFpbGVkfGZhaWxlZCB0byBjb25uZWN0IHRvIHJlbGF5L2kudGVzdChtZXNzYWdlKSkge1xuXHRcdFx0cmV0dXJuICdyZWxheUNvbm5lY3Rpb25GYWlsZWQnO1xuXHRcdH1cblx0XHRpZiAoL25ldHdvcmt8ZmV0Y2h8b2ZmbGluZXxFQ09OTnxFTk9URk9VTkR8RVRJTUVET1VUL2kudGVzdChtZXNzYWdlKSkge1xuXHRcdFx0cmV0dXJuICduZXR3b3JrJztcblx0XHR9XG5cdFx0cmV0dXJuICdvdGhlcic7XG5cdH1cblxuXHQvKipcblx0ICogSW52b2tlZCBvbiBhIGJyb3dzZXIgbmV0d29yaywgd2luZG93LWZvY3VzLCBvciBhdXRoZW50aWNhdGlvbiBldmVudC4gS2lja3Mgb2ZmIGFuXG5cdCAqIGltbWVkaWF0ZSBhdHRlbXB0IGZvciBhbnkgZGlzY29ubmVjdGVkIGNhY2hlZCB0dW5uZWwuXG5cdCAqXG5cdCAqIFJhdGUtbGltaXRlZDogYXQgbW9zdCBvbmUgcmVzdW1lIHBlciBSRVNVTUVfUkFURV9MSU1JVF9NUyBzbyB0aGF0XG5cdCAqIHJhcGlkIHRhYiB0b2dnbGluZyBjYW4ndCBoYW1tZXIgYSBwZXJtYW5lbnRseSBicm9rZW4gZW5kcG9pbnQgd2l0aFxuXHQgKiBhbiB1bmJvdW5kZWQgbnVtYmVyIG9mIGF0dGVtcHQgYnVyc3RzLiBSZXN1bWVzIHRoZSBub3JtYWwgYmFja29mZlxuXHQgKiBzZXF1ZW5jZSAoYnkgY2xlYXJpbmcgdGhlIHBhdXNlIGZsYWcpIHJhdGhlciB0aGFuIHplcm9pbmcgdGhlXG5cdCAqIGF0dGVtcHQgY291bnRlci5cblx0ICovXG5cdHByaXZhdGUgX3Jlc3VtZVJlY29ubmVjdHModHJpZ2dlcjogJ3dha2UnIHwgJ2ZvY3VzJyB8ICdzZXNzaW9uQWRkZWQnKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBSYXRlLWxpbWl0IHJhcGlkIHJlY292ZXJ5IGV2ZW50cyAoZS5nLiBhbHQtdGFiIGJ1cnN0cyBvclxuXHRcdC8vIGZsYWt5IFdpLUZpIHRvZ2dsaW5nIG9ubGluZS9vZmZsaW5lKSBzbyB3ZSBkb24ndCBoYW1tZXIgdGhlIHJlbGF5XG5cdFx0Ly8gd2l0aCBpbW1lZGlhdGUgcmV0cmllcy4gVGhpcyBpcyBhbiBldmVudC1zbW9vdGhpbmcgZ2F0ZSwgbm90IGFuXG5cdFx0Ly8gZXJyb3ItYmFja29mZiBcdTIwMTQgdGhhdCdzIGhhbmRsZWQgYnkgYF9zY2hlZHVsZVJlY29ubmVjdGAuXG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRpZiAobm93IC0gdGhpcy5fbGFzdFJlc3VtZUF0IDwgUkVTVU1FX1JBVEVfTElNSVRfTVMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbGFzdFJlc3VtZUF0ID0gbm93O1xuXG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5fZ2V0UHJvdmlkZXJUdW5uZWxzKCk7XG5cdFx0Zm9yIChjb25zdCB0dW5uZWwgb2YgY2FjaGVkKSB7XG5cdFx0XHRjb25zdCBhZGRyZXNzID0gYCR7VFVOTkVMX0FERFJFU1NfUFJFRklYfSR7dHVubmVsLnR1bm5lbElkfWA7XG5cdFx0XHRpZiAodGhpcy5fcGVuZGluZ0Nvbm5lY3RzLmhhcyhhZGRyZXNzKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxpdmUgPSB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbm5lY3Rpb25zLmZpbmQoYyA9PiBjLmFkZHJlc3MgPT09IGFkZHJlc3MpO1xuXHRcdFx0aWYgKGxpdmUgJiYgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChsaXZlLnN0YXR1cykpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1R1bm5lbEFnZW50SG9zdF0gUmVzdW1pbmcgcmVjb25uZWN0IGZvciAke2FkZHJlc3N9ICh0cmlnZ2VyOiAke3RyaWdnZXJ9KWApO1xuXHRcdFx0Ly8gSWYgd2Ugd2VyZSBwYXVzZWQgKGV4aGF1c3RlZCB0aGUgYmFja29mZiBidWRnZXQpLCBnaXZlIGEgZnJlc2hcblx0XHRcdC8vIGJ1ZGdldCBzaW5jZSB0aGUgd2FrZSBldmVudCBpcyBpdHNlbGYgZXZpZGVuY2UgdGhlIGVudmlyb25tZW50XG5cdFx0XHQvLyBoYXMgY2hhbmdlZC4gT3RoZXJ3aXNlIGtlZXAgdGhlIGN1cnJlbnQgYXR0ZW1wdCBjb3VudGVyIHNvIGFuXG5cdFx0XHQvLyBpbi1wcm9ncmVzcyBiYWNrb2ZmIGlzbid0IHNob3J0LWNpcmN1aXRlZC5cblx0XHRcdGlmICh0aGlzLl9yZWNvbm5lY3RQYXVzZWQuaGFzKGFkZHJlc3MpKSB7XG5cdFx0XHRcdHRoaXMuX2NsZWFyUmVjb25uZWN0QmFja29mZihhZGRyZXNzKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3NjaGVkdWxlUmVjb25uZWN0KGFkZHJlc3MsIC8qaW1tZWRpYXRlKi8gdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIERyb3AgcmVjb25uZWN0IHN0YXRlIGZvciBhZGRyZXNzZXMgd2hvc2UgdHVubmVsIGlzIG5vIGxvbmdlciBjYWNoZWQuICovXG5cdHByaXZhdGUgX3BydW5lUmVjb25uZWN0U3RhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgY2FjaGVkQWRkcmVzc2VzID0gbmV3IFNldCh0aGlzLl9nZXRQcm92aWRlclR1bm5lbHMoKS5tYXAodCA9PiBgJHtUVU5ORUxfQUREUkVTU19QUkVGSVh9JHt0LnR1bm5lbElkfWApKTtcblx0XHRjb25zdCB0cmFja2VkID0gbmV3IFNldDxzdHJpbmc+KFtcblx0XHRcdC4uLnRoaXMuX3JlY29ubmVjdFRpbWVvdXRzLmtleXMoKSxcblx0XHRcdC4uLnRoaXMuX3JlY29ubmVjdEF0dGVtcHRzLmtleXMoKSxcblx0XHRcdC4uLnRoaXMuX3JlY29ubmVjdFBhdXNlZCxcblx0XHRcdC4uLnRoaXMuX2Nvbm5lY3RTZXNzaW9ucy5rZXlzKCksXG5cdFx0XSk7XG5cdFx0Zm9yIChjb25zdCBhZGRyZXNzIG9mIHRyYWNrZWQpIHtcblx0XHRcdGlmICghY2FjaGVkQWRkcmVzc2VzLmhhcyhhZGRyZXNzKSkge1xuXHRcdFx0XHR0aGlzLl9yZXNldFJlY29ubmVjdFN0YXRlKGFkZHJlc3MpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIC0tIFNpbGVudCBzdGF0dXMgY2hlY2sgLS1cblxuXHRwcml2YXRlIGFzeW5jIF9zaWxlbnRTdGF0dXNDaGVjayh0cmlnZ2VyPzogVHVubmVsRGlzY292ZXJ5VHJpZ2dlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlc29sdmVkVHJpZ2dlcjogVHVubmVsRGlzY292ZXJ5VHJpZ2dlciA9IHRyaWdnZXIgPz8gKHRoaXMuX2luaXRpYWxTdGF0dXNDaGVja2VkID8gJ3JlZGlzY292ZXInIDogJ3N0YXJ0dXAnKTtcblx0XHRjb25zdCBob3N0c0VuYWJsZWQgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCk7XG5cdFx0Y29uc3QgYXV0b0Nvbm5lY3RFbmFibGVkID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVtb3RlQWdlbnRIb3N0QXV0b0Nvbm5lY3RTZXR0aW5nSWQpO1xuXHRcdGlmICghaG9zdHNFbmFibGVkKSB7XG5cdFx0XHR0aGlzLl9pbml0aWFsU3RhdHVzQ2hlY2tlZCA9IHRydWU7XG5cdFx0XHR0aGlzLl91cGRhdGVDb25uZWN0aW9uU3RhdHVzZXMoKTtcblx0XHRcdGxvZ1R1bm5lbERpc2NvdmVyeVJlc3VsdCh0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHRcdHRyaWdnZXI6IHJlc29sdmVkVHJpZ2dlcixcblx0XHRcdFx0dG90YWxGb3VuZDogMCxcblx0XHRcdFx0d2l0aEFjdGl2ZUhvc3Q6IDAsXG5cdFx0XHRcdGNhY2hlZEJlZm9yZTogdGhpcy5fdHVubmVsU2VydmljZS5nZXRDYWNoZWRUdW5uZWxzKCkubGVuZ3RoLFxuXHRcdFx0XHRhdXRvQ29ubmVjdEVuYWJsZWQsXG5cdFx0XHRcdGhvc3RzRW5hYmxlZCxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xhc3RTdGF0dXNDaGVjayA9IERhdGUubm93KCk7XG5cdFx0Y29uc3QgY2FjaGVkQmVmb3JlID0gdGhpcy5fdHVubmVsU2VydmljZS5nZXRDYWNoZWRUdW5uZWxzKCkubGVuZ3RoO1xuXG5cdFx0Ly8gRmV0Y2ggdHVubmVsIGxpc3Qgc2lsZW50bHkgdG8gY2hlY2sgb25saW5lIHN0YXR1c1xuXHRcdGxldCBvbmxpbmVUdW5uZWxzOiBJVHVubmVsSW5mb1tdIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRvbmxpbmVUdW5uZWxzID0gYXdhaXQgdGhpcy5fdHVubmVsU2VydmljZS5saXN0VHVubmVscyh7IHNpbGVudDogdHJ1ZSB9KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIE5vIGNhY2hlZCB0b2tlbiBvciBuZXR3b3JrIGVycm9yIFx1MjAxNCBsZWF2ZSBzdGF0dXNlcyBhcy1pc1xuXHRcdFx0dGhpcy5faW5pdGlhbFN0YXR1c0NoZWNrZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5fdXBkYXRlQ29ubmVjdGlvblN0YXR1c2VzKCk7XG5cdFx0XHRsb2dUdW5uZWxEaXNjb3ZlcnlSZXN1bHQodGhpcy5fdGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0XHR0cmlnZ2VyOiByZXNvbHZlZFRyaWdnZXIsXG5cdFx0XHRcdHRvdGFsRm91bmQ6IDAsXG5cdFx0XHRcdHdpdGhBY3RpdmVIb3N0OiAwLFxuXHRcdFx0XHRjYWNoZWRCZWZvcmUsXG5cdFx0XHRcdGF1dG9Db25uZWN0RW5hYmxlZCxcblx0XHRcdFx0aG9zdHNFbmFibGVkLFxuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX3R1bm5lbFNlcnZpY2UuZ2V0Q2FjaGVkVHVubmVscygpO1xuXHRcdGlmIChvbmxpbmVUdW5uZWxzKSB7XG5cdFx0XHRjb25zdCBvbmxpbmVJZHMgPSBuZXcgU2V0KG9ubGluZVR1bm5lbHMubWFwKHQgPT4gdC50dW5uZWxJZCkpO1xuXHRcdFx0Ly8gUmVtb3ZlIGNhY2hlZCB0dW5uZWxzIHRoYXQgbm8gbG9uZ2VyIGV4aXN0IG9uIHRoZSBhY2NvdW50XG5cdFx0XHRmb3IgKGNvbnN0IHR1bm5lbCBvZiBjYWNoZWQpIHtcblx0XHRcdFx0aWYgKCFvbmxpbmVJZHMuaGFzKHR1bm5lbC50dW5uZWxJZCkpIHtcblx0XHRcdFx0XHR0aGlzLl90dW5uZWxTZXJ2aWNlLnJlbW92ZUNhY2hlZFR1bm5lbCh0dW5uZWwudHVubmVsSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEF1dG8tY2FjaGUgZXZlcnkgZGlzY292ZXJlZCB0dW5uZWwgdGhhdCBpc24ndCBjYWNoZWQgeWV0IHNvXG5cdFx0XHQvLyBpdCBhcHBlYXJzIGluIHRoZSBwaWNrZXIgb24gZmlyc3QgZGlzY292ZXJ5IChlLmcuIGZyZXNoIHdlYlxuXHRcdFx0Ly8gc2Vzc2lvbiksIGluY2x1ZGluZyB0dW5uZWxzIHdob3NlIGhvc3QgcHJvY2VzcyBpcyBjdXJyZW50bHlcblx0XHRcdC8vIG9mZmxpbmUgXHUyMDE0IHRob3NlIHJlbmRlciBncmF5ZWQtb3V0IHZpYSB0aGUgc3RhdHVzLXVwZGF0ZSBsb29wXG5cdFx0XHQvLyBiZWxvdy4gUGFzcyAnZ2l0aHViJyBhcyBhdXRoUHJvdmlkZXIgc28gX2hhbmRsZVNlc3Npb25zQ2hhbmdlXG5cdFx0XHQvLyBjYW4gbWF0Y2ggdGhlc2UgdHVubmVscyBmb3IgdGVhcmRvd24gb24gc2Vzc2lvbiByZW1vdmFsLlxuXHRcdFx0Y29uc3QgY2FjaGVkSWRzID0gbmV3IFNldChjYWNoZWQubWFwKHQgPT4gdC50dW5uZWxJZCkpO1xuXHRcdFx0Zm9yIChjb25zdCB0dW5uZWwgb2Ygb25saW5lVHVubmVscykge1xuXHRcdFx0XHRpZiAoIWNhY2hlZElkcy5oYXModHVubmVsLnR1bm5lbElkKSkge1xuXHRcdFx0XHRcdHRoaXMuX3R1bm5lbFNlcnZpY2UuY2FjaGVUdW5uZWwodHVubmVsLCAnZ2l0aHViJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gVXBkYXRlIG9ubGluZS9vZmZsaW5lIHN0YXR1cyBiYXNlZCBvbiBob3N0Q29ubmVjdGlvbkNvdW50LlxuXHRcdFx0Ly8gRm9yIHR1bm5lbHMsIENvbm5lY3RlZCBtZWFucyBcImhvc3QgaXMgb25saW5lXCIgKGNsaWNrYWJsZSB0byBjb25uZWN0KSxcblx0XHRcdC8vIERpc2Nvbm5lY3RlZCBtZWFucyBcImhvc3QgaXMgb2ZmbGluZVwiLiBBY3R1YWwgcmVsYXkgY29ubmVjdGlvblxuXHRcdFx0Ly8gZXN0YWJsaXNobWVudCBoYXBwZW5zIHdoZW4gdGhlIHVzZXIgY2xpY2tzIHRoZSB0dW5uZWwgKG9yIHZpYVxuXHRcdFx0Ly8gYXV0by1jb25uZWN0IGJlbG93IHdoZW4gZW5hYmxlZCkuXG5cdFx0XHRjb25zdCBvbmxpbmVUdW5uZWxNYXAgPSBuZXcgTWFwKG9ubGluZVR1bm5lbHMubWFwKHQgPT4gW3QudHVubmVsSWQsIHRdKSk7XG5cdFx0XHRmb3IgKGNvbnN0IFthZGRyZXNzLCBwcm92aWRlcl0gb2YgdGhpcy5fcHJvdmlkZXJJbnN0YW5jZXMpIHtcblx0XHRcdFx0Ly8gU2tpcCB0dW5uZWxzIHRoYXQgYWxyZWFkeSBoYXZlIGFuIGFjdGl2ZSByZWxheSBjb25uZWN0aW9uXG5cdFx0XHRcdGNvbnN0IGhhc0Nvbm5lY3Rpb24gPSB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbm5lY3Rpb25zLnNvbWUoXG5cdFx0XHRcdFx0YyA9PiBjLmFkZHJlc3MgPT09IGFkZHJlc3MgJiYgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjLnN0YXR1cylcblx0XHRcdFx0KTtcblx0XHRcdFx0aWYgKGhhc0Nvbm5lY3Rpb24pIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHR1bm5lbElkID0gYWRkcmVzcy5zbGljZShUVU5ORUxfQUREUkVTU19QUkVGSVgubGVuZ3RoKTtcblx0XHRcdFx0Y29uc3QgaW5mbyA9IG9ubGluZVR1bm5lbE1hcC5nZXQodHVubmVsSWQpO1xuXHRcdFx0XHRpZiAoaW5mbyAmJiBpbmZvLmhvc3RDb25uZWN0aW9uQ291bnQgPiAwKSB7XG5cdFx0XHRcdFx0cHJvdmlkZXIuc2V0Q29ubmVjdGlvblN0YXR1cyhSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RlZCk7XG5cblx0XHRcdFx0XHRpZiAodGhpcy5fcmVjb25uZWN0UGF1c2VkLmhhcyhhZGRyZXNzKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKFxuXHRcdFx0XHRcdFx0XHRgW1R1bm5lbEFnZW50SG9zdF0gQ29uZmlybWVkIGhvc3Qgb25saW5lIGZvciBwYXVzZWQgJHthZGRyZXNzfTsgYXV0by1yZXN1bWluZyByZWNvbm5lY3QuYFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdHRoaXMuX2NsZWFyUmVjb25uZWN0QmFja29mZihhZGRyZXNzKTtcblx0XHRcdFx0XHRcdHRoaXMuX3NjaGVkdWxlUmVjb25uZWN0KGFkZHJlc3MsIC8qaW1tZWRpYXRlKi8gdHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHByb3ZpZGVyLnNldENvbm5lY3Rpb25TdGF0dXMoUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5kaXNjb25uZWN0ZWQpO1xuXHRcdFx0XHRcdC8vIEhvc3QgaXMgbm90IG9ubGluZSBcdTIwMTQgZHJvcCBhbnkgY2FjaGVkIHNlc3Npb25zIHdlIHdlcmVcblx0XHRcdFx0XHQvLyBzaG93aW5nIGZvciBpdCBzbyB0aGUgVUkgZG9lc24ndCBsaXN0IHN0YWxlIGVudHJpZXMuXG5cdFx0XHRcdFx0cHJvdmlkZXIudW5wdWJsaXNoQ2FjaGVkU2Vzc2lvbnMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBBdXRvLWNvbm5lY3Qgb25saW5lIHR1bm5lbHMgdGhhdCBhcmVuJ3QgY29ubmVjdGVkIHlldCB3aGVuIHRoZVxuXHRcdFx0Ly8gdXNlciBoYXMgb3B0ZWQgaW50byBhdXRvLWNvbm5lY3QgKGRlZmF1bHQgb24pLiBUaGlzIG1pcnJvcnMgdGhlXG5cdFx0XHQvLyB3ZWIgZW1iZWRkZXIgYmVoYXZpb3VyIHdoZXJlIG5vIHdvcmtzcGFjZSBwaWNrZXIgaXMgYXZhaWxhYmxlXG5cdFx0XHQvLyB0byB0cmlnZ2VyIG1hbnVhbCBjb25uZWN0aW9uLlxuXHRcdFx0Y29uc3QgYXV0b0Nvbm5lY3QgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihSZW1vdGVBZ2VudEhvc3RBdXRvQ29ubmVjdFNldHRpbmdJZCk7XG5cdFx0XHRpZiAoYXV0b0Nvbm5lY3QpIHtcblx0XHRcdFx0Zm9yIChjb25zdCB0dW5uZWwgb2Ygb25saW5lVHVubmVscykge1xuXHRcdFx0XHRcdGlmICh0dW5uZWwuaG9zdENvbm5lY3Rpb25Db3VudCA+IDAgJiYgIXRoaXMuX2lzSG9zdGVkVHVubmVsKHR1bm5lbCkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGFkZHJlc3MgPSBgJHtUVU5ORUxfQUREUkVTU19QUkVGSVh9JHt0dW5uZWwudHVubmVsSWR9YDtcblx0XHRcdFx0XHRcdGlmICh0aGlzLl90dW5uZWxTZXJ2aWNlLmlzQXV0b0Nvbm5lY3RTdXBwcmVzc2VkKHR1bm5lbC50dW5uZWxJZCkpIHtcblx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBhbHJlYWR5Q29ubmVjdGVkID0gdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5jb25uZWN0aW9ucy5zb21lKFxuXHRcdFx0XHRcdFx0XHRjID0+IGMuYWRkcmVzcyA9PT0gYWRkcmVzcyAmJiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzQ29ubmVjdGVkKGMuc3RhdHVzKVxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdGlmICghYWxyZWFkeUNvbm5lY3RlZCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9jb25uZWN0VHVubmVsKGFkZHJlc3MsIHsgdXNlckluaXRpYXRlZDogZmFsc2UgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5faW5pdGlhbFN0YXR1c0NoZWNrZWQgPSB0cnVlO1xuXHRcdHRoaXMuX3VwZGF0ZUNvbm5lY3Rpb25TdGF0dXNlcygpO1xuXG5cdFx0Y29uc3QgdG90YWxGb3VuZCA9IG9ubGluZVR1bm5lbHM/Lmxlbmd0aCA/PyAwO1xuXHRcdGNvbnN0IHdpdGhBY3RpdmVIb3N0ID0gb25saW5lVHVubmVscz8uZmlsdGVyKHQgPT4gdC5ob3N0Q29ubmVjdGlvbkNvdW50ID4gMCkubGVuZ3RoID8/IDA7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKFxuXHRcdFx0YFtUdW5uZWxBZ2VudEhvc3RdIFNpbGVudCBzdGF0dXMgY2hlY2sgKCR7cmVzb2x2ZWRUcmlnZ2VyfSk6IHRvdGFsRm91bmQ9JHt0b3RhbEZvdW5kfSwgd2l0aEFjdGl2ZUhvc3Q9JHt3aXRoQWN0aXZlSG9zdH0sIGNhY2hlZEJlZm9yZT0ke2NhY2hlZEJlZm9yZX0sIGF1dG9Db25uZWN0PSR7YXV0b0Nvbm5lY3RFbmFibGVkfWBcblx0XHQpO1xuXHRcdGxvZ1R1bm5lbERpc2NvdmVyeVJlc3VsdCh0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCB7XG5cdFx0XHR0cmlnZ2VyOiByZXNvbHZlZFRyaWdnZXIsXG5cdFx0XHR0b3RhbEZvdW5kLFxuXHRcdFx0d2l0aEFjdGl2ZUhvc3QsXG5cdFx0XHRjYWNoZWRCZWZvcmUsXG5cdFx0XHRhdXRvQ29ubmVjdEVuYWJsZWQsXG5cdFx0XHRob3N0c0VuYWJsZWQsXG5cdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG59XG5cbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihUdW5uZWxBZ2VudEhvc3RDb250cmlidXRpb24uSUQsIFR1bm5lbEFnZW50SG9zdENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWSxlQUFlLGlCQUFpQixvQkFBb0I7QUFDekUsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQWtCO0FBQzNCLFlBQVksU0FBUztBQUNyQixTQUFTLHlCQUF5QixxQ0FBcUMsaUNBQWlDLHdDQUF3QztBQUNoSixTQUFTLGdCQUFnQix5QkFBeUIsNkJBQStDO0FBQ2pHLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsc0JBQXNCLGdCQUFnQjtBQUMvQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFpQyxnQ0FBZ0Ms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
