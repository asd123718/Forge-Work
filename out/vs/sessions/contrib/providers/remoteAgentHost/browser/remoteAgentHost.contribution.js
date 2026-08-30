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
import { Event } from "../../../../../base/common/event.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, toDisposable } from "../../../../../base/common/lifecycle.js";
import { disposableTimeout, IntervalTimer } from "../../../../../base/common/async.js";
import { isCancellationError } from "../../../../../base/common/errors.js";
import { StopWatch } from "../../../../../base/common/stopwatch.js";
import * as nls from "../../../../../nls.js";
import { agentHostAuthority } from "../../../../../platform/agentHost/common/agentHostUri.js";
import { IRemoteAgentHostService, RemoteAgentHostAutoConnectSettingId, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, RemoteAgentHostsSettingId, getEntryAddress } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { TunnelAgentHostsSettingId } from "../../../../../platform/agentHost/common/tunnelAgentHost.js";
import { CloudSandboxEnabledSettingId } from "../../../../../platform/agentHost/common/cloudSandboxAgentHost.js";
import { PROTOCOL_VERSION } from "../../../../../platform/agentHost/common/state/protocol/version/registry.js";
import { AgentHostLocalFilePermissionsSettingId } from "../../../../../platform/agentHost/common/agentHostResourceService.js";
import { NotificationType } from "../../../../../platform/agentHost/common/state/sessionActions.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ConfigurationScope, Extensions as ConfigurationExtensions } from "../../../../../platform/configuration/common/configurationRegistry.js";
import { IDefaultAccountService } from "../../../../../platform/defaultAccount/common/defaultAccount.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../../workbench/common/contributions.js";
import { registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { OpenSessionEventsFileAction } from "../../agentHost/browser/openSessionEventsFileActions.js";
import { authenticateProtectedResources, AgentHostAuthenticationRecovery, AgentHostAuthTokenCache, resolveAuthenticationInteractively } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostAuth.js";
import { AgentHostLanguageModelProvider, agentHostProviderSupportsAutoModel } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostLanguageModelProvider.js";
import { AgentHostSessionHandler } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostSessionHandler.js";
import { IAgentHostActiveClientService } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js";
import { ChatSessionsExtensions, IChatSessionsService } from "../../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { ICustomizationHarnessService } from "../../../../../workbench/contrib/chat/common/customizationHarnessService.js";
import { ILanguageModelsService } from "../../../../../workbench/contrib/chat/common/languageModels.js";
import { IAgentHostFileSystemService } from "../../../../../workbench/services/agentHost/common/agentHostFileSystemService.js";
import { IAuthenticationService } from "../../../../../workbench/services/authentication/common/authentication.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { findRemoteAgentHostSessionTypeAuthority, isRemoteAgentHostSessionType, remoteAgentHostSessionTypeId } from "../../../../../platform/agentHost/common/agentHostSessionType.js";
import { createRemoteAgentHarnessDescriptor, RemoteAgentPluginController } from "./remoteAgentHostCustomizationHarness.js";
import { RemoteAgentHostLogForwarder } from "./remoteAgentHostLogForwarder.js";
import { RemoteAgentHostSessionsProvider } from "./remoteAgentHostSessionsProvider.js";
import { IRemoteAgentHostConnectionCustomizationService, RemoteAgentHostConnectionCustomizationService } from "./remoteAgentHostConnectionCustomization.js";
import { InstantiationType, registerSingleton } from "../../../../../platform/instantiation/common/extensions.js";
import { watchForIncompatibleNotifications } from "./remoteHostOptions.js";
import { computeSSHConnectionKey, isSSHHostKeyDeniedError, ISSHRemoteAgentHostService, SSHAuthMethod } from "../../../../../platform/agentHost/common/sshRemoteAgentHost.js";
import { IAgentHostTerminalService } from "../../../../../workbench/contrib/terminal/browser/agentHostTerminalService.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { categorizeSSHConnectError, logSSHConnectAttempt, logTerminalRecovery } from "../../../../common/sessionsTelemetry.js";
Registry.as(ChatSessionsExtensions.AsyncActivation).register({
  matchSessionType: (sessionType) => isRemoteAgentHostSessionType(sessionType),
  waitForActivation: waitForRemoteAgentHostActivation
});
async function waitForRemoteAgentHostActivation(accessor, sessionType) {
  const remoteAgentHostService = accessor.get(IRemoteAgentHostService);
  const address = getAddressForSessionType(sessionType, remoteAgentHostService);
  if (!address) {
    return false;
  }
  while (true) {
    const connection = remoteAgentHostService.getConnection(address);
    if (connection) {
      const rootState = connection.rootState.value;
      if (rootState instanceof Error) {
        return false;
      }
      if (rootState) {
        const authority = agentHostAuthority(address);
        return rootState.agents.some((agent) => remoteAgentHostSessionTypeId(authority, agent.provider) === sessionType);
      }
      await Promise.race([
        Event.toPromise(connection.rootState.onDidChange),
        Event.toPromise(remoteAgentHostService.onDidChangeConnections)
      ]);
      continue;
    }
    const connectionInfo = remoteAgentHostService.connections.find((connection2) => connection2.address === address);
    if (connectionInfo && !RemoteAgentHostConnectionStatus.isConnecting(connectionInfo.status)) {
      return false;
    }
    if (!connectionInfo && !remoteAgentHostService.configuredEntries.some((entry) => getEntryAddress(entry) === address)) {
      return false;
    }
    await Event.toPromise(remoteAgentHostService.onDidChangeConnections);
  }
}
function getAddressForSessionType(sessionType, remoteAgentHostService) {
  const authorities = /* @__PURE__ */ new Map();
  for (const connection of remoteAgentHostService.connections) {
    authorities.set(agentHostAuthority(connection.address), connection.address);
  }
  for (const entry of remoteAgentHostService.configuredEntries) {
    const address = getEntryAddress(entry);
    authorities.set(agentHostAuthority(address), address);
  }
  const authority = findRemoteAgentHostSessionTypeAuthority(sessionType, authorities.keys());
  return authority ? authorities.get(authority) : void 0;
}
const SSH_RECONNECT_INITIAL_DELAY = 1e3;
const SSH_RECONNECT_MAX_DELAY = 3e4;
const SSH_RECONNECT_MAX_ATTEMPTS = 10;
const SSH_RECONNECT_PAUSE_AUTO_RESUME_MS = 5 * 60 * 1e3;
const SSH_RECONNECT_PERIODIC_INTERVAL_MS = 6e4;
class SSHReconnectState extends Disposable {
  constructor() {
    super(...arguments);
    this._timer = this._register(new MutableDisposable());
    /** Consecutive failed reconnect attempts. */
    this.attempts = 0;
    /** True after we've given up auto-reconnecting until something resumes us. */
    this.paused = false;
    /** Wall-clock timestamp when {@link paused} was last set to true. */
    this.pausedAt = 0;
    /** Whether only an explicit user reconnect should resume this state. */
    this.requiresUserInitiatedResume = false;
  }
  get hasPendingTimer() {
    return !!this._timer.value;
  }
  scheduleRetry(delayMs, handler) {
    this._timer.value = disposableTimeout(() => {
      this._timer.value = void 0;
      handler();
    }, delayMs);
  }
  cancelTimer() {
    this._timer.clear();
  }
  resetForResume() {
    this.attempts = 0;
    this.paused = false;
    this._timer.clear();
    this.requiresUserInitiatedResume = false;
  }
  resumeAutomatically() {
    if (!this.paused || this.requiresUserInitiatedResume) {
      return false;
    }
    this.resetForResume();
    return true;
  }
}
function shouldPauseSSHReconnectAfterFailure(err) {
  return isCancellationError(err) || isSSHHostKeyDeniedError(err);
}
function sshConnectionKey(connection) {
  return connection.sshConfigHost ? `ssh:${connection.sshConfigHost}` : `${connection.user ?? connection.hostName}@${connection.hostName}:${connection.port ?? 22}`;
}
async function disconnectSSHEntry(connection, remoteAgentHostService, sshService) {
  await remoteAgentHostService.removeRemoteAgentHost(connection.address);
  await sshService.disconnect(sshConnectionKey(connection));
}
class ConnectionState extends Disposable {
  constructor(name, connection) {
    super();
    this.name = name;
    this.connection = connection;
    this.store = this._register(new DisposableStore());
    this.agents = this._register(new DisposableMap());
    this.modelProviders = /* @__PURE__ */ new Map();
    /** Dedupes redundant `authenticate` RPCs when the resolved token hasn't changed. */
    this.authTokenCache = new AgentHostAuthTokenCache();
    this.authRecovery = new AgentHostAuthenticationRecovery();
  }
}
let RemoteAgentHostContribution = class extends Disposable {
  constructor(_remoteAgentHostService, _chatSessionsService, _languageModelsService, _logService, _instantiationService, _authenticationService, _defaultAccountService, _notificationService, _sessionsProvidersService, _configurationService, _agentHostFileSystemService, _sshService, _customizationHarnessService, _agentHostTerminalService, _telemetryService, _activeClientService, _connectionCustomizations) {
    super();
    this._remoteAgentHostService = _remoteAgentHostService;
    this._chatSessionsService = _chatSessionsService;
    this._languageModelsService = _languageModelsService;
    this._logService = _logService;
    this._instantiationService = _instantiationService;
    this._authenticationService = _authenticationService;
    this._defaultAccountService = _defaultAccountService;
    this._notificationService = _notificationService;
    this._sessionsProvidersService = _sessionsProvidersService;
    this._configurationService = _configurationService;
    this._agentHostFileSystemService = _agentHostFileSystemService;
    this._sshService = _sshService;
    this._customizationHarnessService = _customizationHarnessService;
    this._agentHostTerminalService = _agentHostTerminalService;
    this._telemetryService = _telemetryService;
    this._activeClientService = _activeClientService;
    this._connectionCustomizations = _connectionCustomizations;
    /** Per-connection state: client state + per-agent registrations. */
    this._connections = this._register(new DisposableMap());
    /** Per-address sessions provider, registered for all configured entries. */
    this._providerStores = this._register(new DisposableMap());
    this._providerInstances = /* @__PURE__ */ new Map();
    /**
     * In-flight reconnect attempts keyed by host id (`sshConfigHost` for SSH,
     * `distro` for WSL). Stores the {@link _attemptManagedReconnect} promise
     * so concurrent on-demand callers (e.g. a user click on "Select..." while
     * the periodic poll is already reconnecting) join the existing attempt
     * rather than racing it.
     */
    this._pendingSSHReconnects = /* @__PURE__ */ new Map();
    /** Per-host SSH auto-reconnect state (timer + attempts + paused). */
    this._sshReconnectStates = this._register(new DisposableMap());
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(RemoteAgentHostsSettingId) || e.affectsConfiguration(RemoteAgentHostsEnabledSettingId) || e.affectsConfiguration(RemoteAgentHostAutoConnectSettingId)) {
        this._resumeSSHReconnects();
        this._reconcile();
      }
    }));
    this._register(this._remoteAgentHostService.onDidChangeConnections(() => {
      this._resumeSSHReconnects();
      this._reconcile();
    }));
    this._register(this._defaultAccountService.onDidChangeDefaultAccount(() => this._authenticateAllConnections()));
    this._register(this._authenticationService.onDidChangeSessions(() => this._authenticateAllConnections()));
    this._reconcile();
    this._register(new IntervalTimer()).cancelAndSet(
      () => {
        this._logService.trace("[RemoteAgentHost] Periodic reconcile (backstop)");
        this._reconcile();
      },
      SSH_RECONNECT_PERIODIC_INTERVAL_MS
    );
  }
  _reconcile() {
    this._reconcileProviders();
    this._reconcileConnections();
    this._reconnectSSHEntries();
    for (const [address, connState] of this._connections) {
      const connectionInfo = this._remoteAgentHostService.connections.find((c) => c.address === address);
      const provider = this._providerInstances.get(address);
      if (provider) {
        provider.setConnection(connState.connection, connectionInfo?.defaultDirectory);
      }
    }
    for (const [address, provider] of this._providerInstances) {
      const connectionInfo = this._remoteAgentHostService.connections.find((c) => c.address === address);
      if (connectionInfo) {
        provider.setConnectionStatus(connectionInfo.status);
      } else if (!RemoteAgentHostConnectionStatus.isIncompatible(provider.connectionStatus.get())) {
        provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
      }
    }
  }
  _reconcileProviders() {
    const enabled = this._configurationService.getValue(RemoteAgentHostsEnabledSettingId);
    const entries = enabled ? this._remoteAgentHostService.configuredEntries : [];
    const desiredAddresses = new Set(entries.map((e) => getEntryAddress(e)));
    for (const [address] of this._providerStores) {
      if (!desiredAddresses.has(address)) {
        this._providerStores.deleteAndDispose(address);
      }
    }
    for (const entry of entries) {
      const address = getEntryAddress(entry);
      const existing = this._providerInstances.get(address);
      if (existing && existing.label !== (entry.name || address)) {
        this._providerStores.deleteAndDispose(address);
      }
      if (!this._providerStores.has(address)) {
        this._createProvider(entry);
      }
    }
  }
  _createProvider(entry) {
    const address = getEntryAddress(entry);
    const sshConnection = entry.connection.type === RemoteAgentHostEntryType.SSH ? entry.connection : void 0;
    let connectOnDemand;
    let disconnectOnDemand;
    let preferenceKey;
    if (sshConnection) {
      connectOnDemand = () => this._connectSSHOnDemand(sshConnection, entry.name, address);
      disconnectOnDemand = () => this._disconnectSSHOnDemand(sshConnection);
      preferenceKey = computeSSHConnectionKey({
        sshConfigHost: sshConnection.sshConfigHost,
        username: sshConnection.user,
        host: sshConnection.hostName,
        port: sshConnection.port
      });
    }
    const store = new DisposableStore();
    const provider = this._instantiationService.createInstance(
      RemoteAgentHostSessionsProvider,
      { address, name: entry.name, connectOnDemand, disconnectOnDemand, preferenceKey }
    );
    store.add(provider);
    store.add(this._sessionsProvidersService.registerProvider(provider));
    store.add(watchForIncompatibleNotifications(provider, this._instantiationService, this._notificationService));
    this._providerInstances.set(address, provider);
    store.add(toDisposable(() => this._providerInstances.delete(address)));
    this._providerStores.set(address, store);
  }
  /**
   * Re-establish SSH connections for configured entries that have an
   * sshConfigHost but no active connection. Schedules retries with
   * exponential backoff on failure so a transient outage doesn't leave
   * the host stuck "disconnected" until the next config / connection
   * change. Auto-reconnect pauses after {@link SSH_RECONNECT_MAX_ATTEMPTS}
   * consecutive failures and resumes when {@link _reconcile} runs again
   * (config change, connection event) or {@link _resumeSSHReconnects} is
   * called.
   */
  _reconnectSSHEntries() {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      this._sshReconnectStates.clearAndDisposeAll();
      return;
    }
    const autoConnect = this._configurationService.getValue(RemoteAgentHostAutoConnectSettingId);
    const entries = this._remoteAgentHostService.configuredEntries;
    const stillConfigured = /* @__PURE__ */ new Set();
    for (const entry of entries) {
      if (entry.connection.type !== RemoteAgentHostEntryType.SSH || !entry.connection.sshConfigHost) {
        continue;
      }
      const sshConfigHost = entry.connection.sshConfigHost;
      stillConfigured.add(sshConfigHost);
      const address = getEntryAddress(entry);
      const hasConnection = this._remoteAgentHostService.connections.some(
        (c) => c.address === address && RemoteAgentHostConnectionStatus.isConnected(c.status)
      );
      if (hasConnection) {
        this._sshReconnectStates.deleteAndDispose(sshConfigHost);
        continue;
      }
      if (this._pendingSSHReconnects.has(sshConfigHost)) {
        this._logService.trace(`[RemoteAgentHost] SSH reconnect for ${sshConfigHost}: reconnect already in progress, skipping`);
        continue;
      }
      const state = this._sshReconnectStates.get(sshConfigHost);
      if (state?.hasPendingTimer) {
        this._logService.trace(`[RemoteAgentHost] SSH reconnect for ${sshConfigHost}: retry timer already scheduled, skipping`);
        continue;
      }
      if (state?.paused) {
        if (state.requiresUserInitiatedResume) {
          this._logService.trace(`[RemoteAgentHost] SSH reconnect for ${sshConfigHost}: waiting for a user-initiated reconnect`);
          continue;
        }
        const pausedMs = Date.now() - state.pausedAt;
        if (pausedMs < SSH_RECONNECT_PAUSE_AUTO_RESUME_MS) {
          this._logService.trace(`[RemoteAgentHost] SSH reconnect for ${sshConfigHost}: paused (${Math.round(pausedMs / 1e3)}s ago), skipping`);
          continue;
        }
        this._logService.info(`[RemoteAgentHost] SSH reconnect for ${sshConfigHost}: auto-resuming after ${Math.round(pausedMs / 1e3)}s pause`);
        state.resetForResume();
      }
      if (!autoConnect) {
        this._logService.trace(`[RemoteAgentHost] SSH reconnect for ${sshConfigHost}: auto-connect disabled, skipping`);
        continue;
      }
      void this._attemptSSHReconnect(sshConfigHost, entry.name, address);
    }
    for (const host of [...this._sshReconnectStates.keys()]) {
      if (!stillConfigured.has(host)) {
        this._sshReconnectStates.deleteAndDispose(host);
      }
    }
  }
  async _connectSSHOnDemand(connection, name, address) {
    const sshConfigHost = connection.sshConfigHost;
    if (!sshConfigHost) {
      const stopwatch = StopWatch.create(false);
      try {
        await this._sshService.connect({
          host: connection.hostName,
          port: connection.port,
          username: connection.user ?? connection.hostName,
          authMethod: SSHAuthMethod.Agent,
          name,
          userInitiated: true
        });
        logSSHConnectAttempt(this._telemetryService, {
          operation: "connect",
          userInitiated: true,
          attempt: 1,
          durationMs: stopwatch.elapsed(),
          success: true,
          willRetry: false
        });
      } catch (err) {
        logSSHConnectAttempt(this._telemetryService, {
          operation: "connect",
          userInitiated: true,
          attempt: 1,
          durationMs: stopwatch.elapsed(),
          success: false,
          willRetry: false,
          errorCategory: categorizeSSHConnectError(err)
        });
        throw err;
      }
      return;
    }
    if (this._pendingSSHReconnects.has(sshConfigHost)) {
      await this._pendingSSHReconnects.get(sshConfigHost).catch(() => void 0);
      return;
    }
    this._sshReconnectStates.get(sshConfigHost)?.resetForResume();
    await this._attemptSSHReconnect(sshConfigHost, name, address, { userInitiated: true });
  }
  async _disconnectSSHOnDemand(connection) {
    if (connection.sshConfigHost) {
      this._sshReconnectStates.deleteAndDispose(connection.sshConfigHost);
    }
    await disconnectSSHEntry(connection, this._remoteAgentHostService, this._sshService);
  }
  async _attemptSSHReconnect(sshConfigHost, name, address, options = {}) {
    await this._attemptManagedReconnect({
      kind: "SSH",
      key: sshConfigHost,
      address,
      userInitiated: !!options.userInitiated,
      maxAttempts: SSH_RECONNECT_MAX_ATTEMPTS,
      shouldPause: shouldPauseSSHReconnectAfterFailure,
      pending: this._pendingSSHReconnects,
      states: this._sshReconnectStates,
      getOrCreateState: (key) => this._getOrCreateSSHReconnectState(key),
      // Thread userInitiated through to the actual reconnect() call, not
      // just the local bookkeeping above: a silent/background attempt
      // (the default here — options.userInitiated is only set `true`
      // by the on-demand connect path) must never open the
      // endpoint-selection picker and must never silently attach to an
      // `editor`-owned endpoint, per the SSH service's selection policy.
      doConnect: () => this._sshService.reconnect(sshConfigHost, name, !!options.userInitiated).then(() => void 0),
      schedule: (state) => this._scheduleSSHReconnect(sshConfigHost, name, address, state)
    });
  }
  _scheduleSSHReconnect(sshConfigHost, name, address, state) {
    const delay = Math.min(SSH_RECONNECT_INITIAL_DELAY * Math.pow(2, state.attempts - 1), SSH_RECONNECT_MAX_DELAY);
    this._logService.info(`[RemoteAgentHost] Scheduling SSH reconnect for ${sshConfigHost} in ${delay}ms (attempt ${state.attempts + 1}/${SSH_RECONNECT_MAX_ATTEMPTS})`);
    state.scheduleRetry(delay, () => {
      if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
        this._sshReconnectStates.deleteAndDispose(sshConfigHost);
        return;
      }
      const autoConnect = this._configurationService.getValue(RemoteAgentHostAutoConnectSettingId);
      if (!autoConnect) {
        return;
      }
      const live = this._remoteAgentHostService.connections.find((c) => c.address === address);
      if (live && RemoteAgentHostConnectionStatus.isConnected(live.status)) {
        this._sshReconnectStates.deleteAndDispose(sshConfigHost);
        return;
      }
      if (this._pendingSSHReconnects.has(sshConfigHost)) {
        return;
      }
      void this._attemptSSHReconnect(sshConfigHost, name, address);
    });
  }
  _getOrCreateSSHReconnectState(sshConfigHost) {
    let state = this._sshReconnectStates.get(sshConfigHost);
    if (!state) {
      state = new SSHReconnectState();
      this._sshReconnectStates.set(sshConfigHost, state);
    }
    return state;
  }
  /**
   * Resume SSH auto-reconnect for any paused hosts. Called by the reconcile
   * path so that a fresh trigger (config change, new connection event) gives
   * paused hosts another chance.
   */
  _resumeSSHReconnects() {
    let resumed = 0;
    for (const [, state] of this._sshReconnectStates) {
      if (state.resumeAutomatically()) {
        resumed++;
      }
    }
    if (resumed > 0) {
      this._logService.info(`[RemoteAgentHost] Resuming SSH auto-reconnect for ${resumed} paused host(s)`);
    }
  }
  /**
   * Shared retry-loop body for SSH managed-reconnect entries.
   *
   * Handles `connecting`/`disconnected`/`incompatible` provider status,
   * cached-session unpublishing on failure, pause-on-cancel, and
   * pause-after-max-attempts. An optional pre-check can bail out without
   * incrementing the attempt counter (returns `{ skip: true }`).
   */
  async _attemptManagedReconnect(opts) {
    const runPromise = (async () => {
      const state = opts.getOrCreateState(opts.key);
      const attempt = state.attempts;
      const provider = this._providerInstances.get(opts.address);
      const stopwatch = StopWatch.create(false);
      if (opts.userInitiated) {
        provider?.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
      }
      this._logService.info(`[RemoteAgentHost] Re-establishing ${opts.kind} connection for ${opts.key} (attempt ${attempt + 1})`);
      try {
        if (opts.preCheck) {
          const result = await opts.preCheck(opts.userInitiated);
          if (result?.skip) {
            if (result.reason) {
              this._logService.info(`[RemoteAgentHost] ${opts.kind} reconnect for ${opts.key}: ${result.reason}; skipping`);
            }
            return;
          }
        }
        await opts.doConnect();
        logSSHConnectAttempt(this._telemetryService, {
          operation: "reconnect",
          userInitiated: opts.userInitiated,
          attempt: attempt + 1,
          durationMs: stopwatch.elapsed(),
          success: true,
          willRetry: false
        });
        opts.states.deleteAndDispose(opts.key);
        this._logService.info(`[RemoteAgentHost] ${opts.kind} connection re-established for ${opts.key}`);
      } catch (err) {
        const enabled = this._configurationService.getValue(RemoteAgentHostsEnabledSettingId);
        const pause = opts.shouldPause(err);
        const incompatible = RemoteAgentHostConnectionStatus.fromConnectError(err, [PROTOCOL_VERSION]);
        const willRetry = enabled && !opts.userInitiated && !pause && !incompatible && attempt + 1 < opts.maxAttempts;
        logSSHConnectAttempt(this._telemetryService, {
          operation: "reconnect",
          userInitiated: opts.userInitiated,
          attempt: attempt + 1,
          durationMs: stopwatch.elapsed(),
          success: false,
          willRetry,
          errorCategory: categorizeSSHConnectError(err)
        });
        if (!enabled) {
          opts.states.deleteAndDispose(opts.key);
          return;
        }
        if (opts.userInitiated) {
          provider?.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
        }
        if (pause) {
          const requiresUserInitiatedResume = isSSHHostKeyDeniedError(err);
          this._logService.info(`[RemoteAgentHost] Pausing ${opts.kind} auto-reconnect for ${opts.key} after ${requiresUserInitiatedResume ? "host key denial" : "user cancellation"}`);
          provider?.unpublishCachedSessions();
          const liveState2 = opts.getOrCreateState(opts.key);
          liveState2.paused = true;
          liveState2.pausedAt = Date.now();
          liveState2.requiresUserInitiatedResume = requiresUserInitiatedResume;
          return;
        }
        this._logService.error(`[RemoteAgentHost] ${opts.kind} reconnect failed for ${opts.key}`, err);
        if (incompatible) {
          provider?.setConnectionStatus(incompatible);
          opts.states.deleteAndDispose(opts.key);
          return;
        }
        provider?.unpublishCachedSessions();
        const liveState = opts.getOrCreateState(opts.key);
        liveState.attempts = attempt + 1;
        if (liveState.attempts >= opts.maxAttempts) {
          this._logService.info(`[RemoteAgentHost] Pausing ${opts.kind} auto-reconnect for ${opts.key} after ${liveState.attempts} consecutive failures`);
          liveState.paused = true;
          liveState.pausedAt = Date.now();
          return;
        }
        if (opts.userInitiated) {
          return;
        }
        opts.schedule(liveState);
      }
    })();
    opts.pending.set(opts.key, runPromise);
    try {
      await runPromise;
    } finally {
      opts.pending.delete(opts.key);
    }
  }
  _reconcileConnections() {
    const currentConnections = this._remoteAgentHostService.connections;
    const connectedAddresses = new Set(
      currentConnections.filter((c) => RemoteAgentHostConnectionStatus.isConnected(c.status)).map((c) => c.address)
    );
    const allAddresses = new Set(currentConnections.map((c) => c.address));
    for (const [address] of this._connections) {
      if (!allAddresses.has(address)) {
        this._logService.info(`[RemoteAgentHost] Removing contribution for ${address}`);
        this._providerInstances.get(address)?.clearConnection();
        this._connections.deleteAndDispose(address);
      } else if (!connectedAddresses.has(address)) {
      }
    }
    for (const connectionInfo of currentConnections) {
      if (!RemoteAgentHostConnectionStatus.isConnected(connectionInfo.status)) {
        continue;
      }
      const existing = this._connections.get(connectionInfo.address);
      if (existing) {
        const nameChanged = existing.name !== connectionInfo.name;
        const clientIdChanged = existing.connection.clientId !== connectionInfo.clientId;
        if (nameChanged || clientIdChanged) {
          this._logService.info(`[RemoteAgentHost] Reconnecting contribution for ${connectionInfo.address}: oldClientId=${existing.connection.clientId}, newClientId=${connectionInfo.clientId}, nameChanged=${nameChanged}`);
          const oldClientId = existing.connection.clientId;
          this._connections.deleteAndDispose(connectionInfo.address);
          this._setupConnection(connectionInfo);
          if (clientIdChanged) {
            const newConnection = this._remoteAgentHostService.getConnection(connectionInfo.address);
            if (newConnection) {
              this._agentHostTerminalService.reconnectTerminals(newConnection, oldClientId).then(
                ({ recovered, total }) => {
                  if (total > 0) {
                    this._logService.info(`[RemoteAgentHost] Terminal reconnection: ${recovered}/${total} recovered`);
                    logTerminalRecovery(this._telemetryService, { recoveredCount: recovered, totalCount: total });
                  }
                },
                (err) => this._logService.warn("[RemoteAgentHost] Terminal reconnection failed", err)
              );
            }
          }
        }
      } else {
        this._setupConnection(connectionInfo);
      }
    }
  }
  _setupConnection(connectionInfo) {
    const connection = this._remoteAgentHostService.getConnection(connectionInfo.address);
    if (!connection) {
      return;
    }
    const { address, name } = connectionInfo;
    const connState = this._instantiationService.createInstance(ConnectionState, name, connection);
    this._connections.set(address, connState);
    const store = connState.store;
    store.add(this._instantiationService.createInstance(
      RemoteAgentHostLogForwarder,
      connection,
      address,
      name || address
    ));
    const authority = agentHostAuthority(address);
    store.add(this._agentHostFileSystemService.registerAuthority(authority, connection));
    store.add(connection.rootState.onDidChange((rootState) => {
      this._handleRootStateChange(address, connection, rootState);
    }));
    store.add(connection.onDidNotification((notification) => this._handleAuthenticationRequiredNotification(address, connection, notification)));
    const initialRootState = connection.rootState.value;
    if (initialRootState && !(initialRootState instanceof Error)) {
      this._handleRootStateChange(address, connection, initialRootState);
    }
    const provider = this._providerInstances.get(address);
    if (provider) {
      provider.setConnection(connection, connectionInfo.defaultDirectory);
    }
  }
  _handleRootStateChange(address, connection, rootState) {
    const connState = this._connections.get(address);
    if (!connState) {
      return;
    }
    const incoming = new Set(rootState.agents.map((a) => a.provider));
    for (const [provider] of connState.agents) {
      if (!incoming.has(provider)) {
        connState.agents.deleteAndDispose(provider);
        connState.modelProviders.delete(provider);
      }
    }
    this._authenticateWithConnection(address, connection, rootState.agents).catch(() => {
    });
    for (const agent of rootState.agents) {
      if (!connState.agents.has(agent.provider)) {
        this._registerAgent(address, connection, agent, connState.name);
      } else {
        const modelProvider = connState.modelProviders.get(agent.provider);
        modelProvider?.updateModels(agent.models);
      }
    }
  }
  _registerAgent(address, connection, agent, configuredName) {
    const connState = this._connections.get(address);
    if (!connState) {
      return;
    }
    const agentStore = new DisposableStore();
    connState.agents.set(agent.provider, agentStore);
    connState.store.add(agentStore);
    const sanitized = agentHostAuthority(address);
    const providerId = `agenthost-${sanitized}`;
    const sessionType = remoteAgentHostSessionTypeId(sanitized, agent.provider);
    const agentId = sessionType;
    const vendor = sessionType;
    const hostLabel = configuredName || address;
    const agentLabel = agent.displayName?.trim() || agent.provider;
    const displayName = `${agentLabel} [${hostLabel}]`;
    const sessionWorkingDirs = /* @__PURE__ */ new Map();
    agentStore.add(toDisposable(() => sessionWorkingDirs.clear()));
    const resolveWorkingDirectory = (sessionResource) => {
      const resourceKey = sessionResource.toString();
      const cached = sessionWorkingDirs.get(resourceKey);
      if (cached) {
        return cached;
      }
      const provider = this._sessionsProvidersService.getProvider(providerId);
      const session = provider?.getSessionByResource(sessionResource);
      const workingDirectory = session?.workspace.get()?.folders[0]?.workingDirectory;
      if (workingDirectory) {
        sessionWorkingDirs.set(resourceKey, workingDirectory);
        return workingDirectory;
      }
      return void 0;
    };
    const isNewSession = (sessionResource) => {
      const provider = this._sessionsProvidersService.getProvider(providerId);
      return provider?.getSessionByResource(sessionResource)?.status.get() === SessionStatus.Untitled;
    };
    agentStore.add(this._chatSessionsService.registerChatSessionContribution({
      type: sessionType,
      name: agentId,
      displayName,
      description: agent.description,
      canDelegate: true,
      requiresCustomModels: true,
      supportsAutoModel: agentHostProviderSupportsAutoModel(agent.provider),
      agentHostProviderId: agent.provider,
      supportsDelegation: true,
      capabilities: {
        supportsCheckpoints: true,
        supportsPromptAttachments: true,
        supportsImageAttachments: true,
        get terminalCommandPrefix() {
          return connection.initializeResult.get()?.terminalCommandPrefix;
        }
      }
    }));
    const pluginController = agentStore.add(this._instantiationService.createInstance(
      RemoteAgentPluginController,
      hostLabel,
      sanitized,
      connection
    ));
    const agentRegistration = agentStore.add(this._activeClientService.registerForAgent(sessionType, { includeUserStorage: true }));
    const syncProvider = agentRegistration.syncProvider;
    const ambientScope = agentStore.add(agentRegistration.acquireScope([]));
    const itemProvider = agentStore.add(this._instantiationService.createInstance(
      AgentCustomizationItemProvider,
      sanitized,
      (customization, clientId) => {
        if (clientId !== void 0) {
          return void 0;
        }
        return [{
          id: "remoteAgentHost.removeConfiguredPlugin",
          label: nls.localize("remoteAgentHost.removeConfiguredPlugin", "Remove from Remote Host"),
          icon: Codicon.trash,
          run: () => pluginController.removeConfiguredPlugin(customization)
        }];
      },
      (syncedUri) => agentRegistration.getOrigin(syncedUri)
    ));
    itemProvider.setDraftCustomAgents(ambientScope.customAgents);
    itemProvider.setDraftCustomizations(ambientScope.customizations);
    const harnessDescriptor = createRemoteAgentHarnessDescriptor(sessionType, displayName, pluginController, itemProvider, syncProvider);
    agentStore.add(this._customizationHarnessService.registerExternalHarness(harnessDescriptor));
    const sessionHandler = agentStore.add(this._instantiationService.createInstance(
      AgentHostSessionHandler,
      {
        provider: agent.provider,
        backendSessionScheme: this._connectionCustomizations.get(address)?.backendSessionScheme?.(agent.provider),
        agentId,
        sessionType,
        fullName: displayName,
        description: agent.description,
        connection,
        connectionAuthority: sanitized,
        extensionId: "vscode.remote-agent-host",
        extensionDisplayName: "Remote Agent Host",
        resolveWorkingDirectory,
        isNewSession,
        resolveAuthentication: (resources) => this._resolveAuthenticationInteractively(address, connection, resources)
      }
    ));
    agentStore.add(this._chatSessionsService.registerChatSessionContentProvider(sessionType, sessionHandler));
    const vendorDescriptor = { vendor, displayName, configuration: void 0, managementCommand: void 0, when: void 0 };
    this._languageModelsService.deltaLanguageModelChatProviderDescriptors([vendorDescriptor], []);
    agentStore.add(toDisposable(() => this._languageModelsService.deltaLanguageModelChatProviderDescriptors([], [vendorDescriptor])));
    const modelProvider = agentStore.add(new AgentHostLanguageModelProvider(sessionType, vendor));
    connState.modelProviders.set(agent.provider, modelProvider);
    agentStore.add(toDisposable(() => connState.modelProviders.delete(agent.provider)));
    agentStore.add(this._languageModelsService.registerLanguageModelProvider(vendor, modelProvider));
    modelProvider.updateModels(agent.models);
    this._logService.info(`[RemoteAgentHost] Registered agent ${agent.provider} from ${address} as ${sessionType}`);
  }
  _authenticateAllConnections() {
    for (const [address, connState] of this._connections) {
      const rootState = connState.connection.rootState.value;
      if (rootState && !(rootState instanceof Error)) {
        this._authenticateWithConnection(address, connState.connection, rootState.agents).catch(() => {
        });
      }
    }
  }
  /**
   * Authenticate using protectedResources from agent info in root state.
   * Resolves tokens via the standard VS Code authentication service.
   *
   * Marks the matching provider's `authenticationPending` observable while
   * the auth pass is in flight so that sessions surface as still loading.
   */
  async _authenticateWithConnection(address, connection, agents) {
    const providerId = `agenthost-${agentHostAuthority(address)}`;
    const provider = this._sessionsProvidersService.getProvider(providerId);
    const authTokenCache = this._connections.get(address)?.authTokenCache;
    provider?.setAuthenticationPending(true);
    try {
      await this._instantiationService.invokeFunction(authenticateProtectedResources, agents, {
        authTokenCache,
        logPrefix: "[RemoteAgentHost]",
        authenticate: this._authenticateCallback(address, connection)
      });
    } catch (err) {
      this._logService.error("[RemoteAgentHost] Failed to authenticate with connection", err);
    } finally {
      provider?.setAuthenticationPending(false);
    }
  }
  _handleAuthenticationRequiredNotification(address, connection, notification) {
    if (notification.type !== NotificationType.AuthRequired) {
      return;
    }
    this._authenticateNotificationResource(address, connection, notification.resource);
  }
  _authenticateNotificationResource(address, connection, protectedResource) {
    const connState = this._connections.get(address);
    if (!connState) {
      return;
    }
    const providerId = `agenthost-${agentHostAuthority(address)}`;
    const provider = this._sessionsProvidersService.getProvider(providerId);
    provider?.setAuthenticationPending(true);
    this._instantiationService.invokeFunction((accessor) => connState.authRecovery.recover(accessor, protectedResource, {
      authTokenCache: connState.authTokenCache,
      logPrefix: "[RemoteAgentHost]",
      authenticate: this._authenticateCallback(address, connection)
    })).catch((err) => {
      this._logService.error(`[RemoteAgentHost] Failed to authenticate notified resource ${protectedResource.resource}`, err);
    }).finally(() => {
      provider?.setAuthenticationPending(false);
    });
  }
  /**
   * Build the `authenticate` callback for a connection. Host-agnostic by default (forwards the
   * request unchanged); a connection kind may inject a token transform via
   * {@link IRemoteAgentHostConnectionCustomizationService} — e.g. cloud sandbox connections, whose
   * host rejects plaintext bearers over the relay (`-32602`) and requires a Mission-Control-sealed
   * envelope. The transform owns fail-closed validation, so a raw token can never reach the host.
   */
  _authenticateCallback(address, connection) {
    const transform = this._connectionCustomizations.get(address)?.authenticate;
    if (!transform) {
      return (request) => connection.authenticate(request);
    }
    return async (request) => connection.authenticate(await transform(request));
  }
  /**
   * Interactively prompt the user to authenticate when the user starts a session.
   * Returns true if authentication succeeded.
   */
  async _resolveAuthenticationInteractively(address, connection, protectedResources) {
    const authTokenCache = this._connections.get(address)?.authTokenCache;
    return this._instantiationService.invokeFunction(resolveAuthenticationInteractively, protectedResources, {
      authTokenCache,
      logPrefix: "[RemoteAgentHost]",
      authenticate: this._authenticateCallback(address, connection)
    });
  }
};
RemoteAgentHostContribution.ID = "sessions.contrib.remoteAgentHostContribution";
RemoteAgentHostContribution = __decorateClass([
  __decorateParam(0, IRemoteAgentHostService),
  __decorateParam(1, IChatSessionsService),
  __decorateParam(2, ILanguageModelsService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IAuthenticationService),
  __decorateParam(6, IDefaultAccountService),
  __decorateParam(7, INotificationService),
  __decorateParam(8, ISessionsProvidersService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IAgentHostFileSystemService),
  __decorateParam(11, ISSHRemoteAgentHostService),
  __decorateParam(12, ICustomizationHarnessService),
  __decorateParam(13, IAgentHostTerminalService),
  __decorateParam(14, ITelemetryService),
  __decorateParam(15, IAgentHostActiveClientService),
  __decorateParam(16, IRemoteAgentHostConnectionCustomizationService)
], RemoteAgentHostContribution);
registerSingleton(IRemoteAgentHostConnectionCustomizationService, RemoteAgentHostConnectionCustomizationService, InstantiationType.Delayed);
registerWorkbenchContribution2(RemoteAgentHostContribution.ID, RemoteAgentHostContribution, WorkbenchPhase.AfterRestored);
registerAction2(OpenSessionEventsFileAction);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  properties: {
    [RemoteAgentHostsEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.remoteAgentHosts.enabled", "Enable connecting to remote agent hosts."),
      default: true,
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"]
    },
    [RemoteAgentHostAutoConnectSettingId]: {
      type: "boolean",
      description: nls.localize("chat.remoteAgentHosts.autoConnect", "Automatically connect to online dev tunnel and SSH-configured remote agent hosts on startup. When disabled, cached sessions are still shown but connections are established only on demand."),
      default: true,
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"]
    },
    // Off by default: sandbox tasks currently carry the `copilot-developer-cli` slug, which the
    // Copilot extension's cloud provider does not list, so the two do not overlap. That slug is
    // expected to change, at which point both providers would list the same task — see
    // `CLOUD_SANDBOX_AGENT_SLUG`.
    [CloudSandboxEnabledSettingId]: {
      type: "boolean",
      description: nls.localize("chat.agentHost.cloudSandbox.enabled", "Enable connecting to Copilot cloud sandbox sessions over a live Agent Host Protocol relay. When enabled, opening a Copilot cloud session connects to its sandbox for slash commands and a responsive, steerable experience instead of only polling logs."),
      default: false,
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"]
    },
    "chat.sshRemoteAgentHostCommand": {
      type: "string",
      description: nls.localize("chat.sshRemoteAgentHostCommand", "For development: Override the command used to start the remote agent host over SSH. When set, skips automatic CLI installation and runs this command instead. The command must print a WebSocket URL matching ws://127.0.0.1:PORT (optionally with ?tkn=TOKEN) to stdout or stderr./"),
      default: "",
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"]
    },
    "chat.agentHost.forwardSSHAgent": {
      type: "boolean",
      description: nls.localize("chat.agentHost.forwardSSHAgent", "When enabled, forwards the local SSH agent to the remote machine during SSH agent host connections to hosts whose SSH config has `ForwardAgent yes`. Only enable this for trusted hosts. The remote agent host process must be restarted for this setting to take effect."),
      default: false,
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"]
    },
    [RemoteAgentHostsSettingId]: {
      type: "array",
      items: {
        type: "object",
        properties: {
          address: { type: "string", description: nls.localize("chat.remoteAgentHosts.address", 'The WebSocket address of the remote agent host (e.g. "localhost:3000").') },
          name: { type: "string", description: nls.localize("chat.remoteAgentHosts.name", "A display name for this remote agent host.") },
          connectionToken: { type: "string", description: nls.localize("chat.remoteAgentHosts.connectionToken", "An optional connection token for authenticating with the remote agent host.") }
        },
        required: ["address", "name"]
      },
      description: nls.localize("chat.remoteAgentHosts", 'A list of WebSocket remote agent host addresses to connect to (e.g. "localhost:3000"). SSH remote agent host details are managed by VS Code.'),
      default: [],
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"]
    },
    [TunnelAgentHostsSettingId]: {
      type: "array",
      items: { type: "string" },
      description: nls.localize("chat.remoteAgentTunnels", "Additional dev tunnel names to look for when connecting to remote agent hosts. These are looked up in addition to tunnels automatically enumerated from your account."),
      default: [],
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"]
    },
    [AgentHostLocalFilePermissionsSettingId]: {
      type: "object",
      description: nls.localize("chat.agentHost.localFilePermissions", "Per-host filesystem grants for remote agent hosts. Maps a remote agent host address to URI strings and the access mode the host has been granted (`r` for read, `rw` for read and write). Hosts cannot read or write any files outside the granted URIs without prompting; a URI grant covers descendants. This setting is normally maintained by the agent-host permission prompts and rarely edited by hand."),
      additionalProperties: {
        type: "object",
        additionalProperties: {
          type: "string",
          enum: ["r", "rw"],
          enumDescriptions: [
            nls.localize("chat.agentHost.localFilePermissions.read", "Read-only access."),
            nls.localize("chat.agentHost.localFilePermissions.readWrite", "Read and write access.")
          ]
        }
      },
      default: {},
      scope: ConfigurationScope.APPLICATION,
      tags: ["experimental", "advanced"]
    }
  }
});
import "./remoteAgentHostActions.js";
import "./manageRemoteAgentHosts.js";
import "../../agentHost/browser/agentHostAgentPicker.js";
import { AgentCustomizationItemProvider } from "../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentCustomizationItemProvider.js";
import { Codicon } from "../../../../../base/common/codicons.js";
export {
  RemoteAgentHostContribution,
  SSHReconnectState,
  disconnectSSHEntry,
  shouldPauseSSHReconnectAfterFailure,
  sshConnectionKey
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxyZW1vdGVBZ2VudEhvc3RcXGJyb3dzZXJcXHJlbW90ZUFnZW50SG9zdC5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCwgSW50ZXJ2YWxUaW1lciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGFnZW50SG9zdEF1dGhvcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0VXJpLmpzJztcbmltcG9ydCB7IFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2Jyb3dzZXIvcmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQuanMnO1xuaW1wb3J0IHsgdHlwZSBBZ2VudFByb3ZpZGVyLCB0eXBlIEF1dGhlbnRpY2F0ZVBhcmFtcywgdHlwZSBBdXRoZW50aWNhdGVSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB7IHR5cGUgSUFnZW50Q29ubmVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uSW5mbywgSVJlbW90ZUFnZW50SG9zdEVudHJ5LCBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSwgdHlwZSBJUmVtb3RlQWdlbnRIb3N0U1NIQ29ubmVjdGlvbiwgUmVtb3RlQWdlbnRIb3N0QXV0b0Nvbm5lY3RTZXR0aW5nSWQsIFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMsIFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZSwgUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQsIFJlbW90ZUFnZW50SG9zdHNTZXR0aW5nSWQsIGdldEVudHJ5QWRkcmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vcmVtb3RlQWdlbnRIb3N0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUdW5uZWxBZ2VudEhvc3RzU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi90dW5uZWxBZ2VudEhvc3QuanMnO1xuaW1wb3J0IHsgQ2xvdWRTYW5kYm94RW5hYmxlZFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vY2xvdWRTYW5kYm94QWdlbnRIb3N0LmpzJztcbmltcG9ydCB7IFBST1RPQ09MX1ZFUlNJT04gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3ZlcnNpb24vcmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0TG9jYWxGaWxlUGVybWlzc2lvbnNTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFJlc291cmNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyB0eXBlIFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IHR5cGUgQWdlbnRJbmZvLCB0eXBlIFJvb3RTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IE5vdGlmaWNhdGlvblR5cGUsIHR5cGUgSU5vdGlmaWNhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uU2NvcGUsIEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RlZmF1bHRBY2NvdW50L2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIsIFdvcmtiZW5jaFBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgT3BlblNlc3Npb25FdmVudHNGaWxlQWN0aW9uIH0gZnJvbSAnLi4vLi4vYWdlbnRIb3N0L2Jyb3dzZXIvb3BlblNlc3Npb25FdmVudHNGaWxlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBhdXRoZW50aWNhdGVQcm90ZWN0ZWRSZXNvdXJjZXMsIEFnZW50SG9zdEF1dGhlbnRpY2F0aW9uUmVjb3ZlcnksIEFnZW50SG9zdEF1dGhUb2tlbkNhY2hlLCByZXNvbHZlQXV0aGVudGljYXRpb25JbnRlcmFjdGl2ZWx5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdEF1dGguanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0TGFuZ3VhZ2VNb2RlbFByb3ZpZGVyLCBhZ2VudEhvc3RQcm92aWRlclN1cHBvcnRzQXV0b01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdExhbmd1YWdlTW9kZWxQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTZXNzaW9uSGFuZGxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RTZXNzaW9uSGFuZGxlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0QWN0aXZlQ2xpZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRTZXNzaW9uc0V4dGVuc2lvbnMsIElBc3luY0NoYXRTZXNzaW9uQWN0aXZhdGlvblJlZ2lzdHJ5LCBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEZpbGVTeXN0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0RmlsZVN5c3RlbVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBmaW5kUmVtb3RlQWdlbnRIb3N0U2Vzc2lvblR5cGVBdXRob3JpdHksIGlzUmVtb3RlQWdlbnRIb3N0U2Vzc2lvblR5cGUsIHJlbW90ZUFnZW50SG9zdFNlc3Npb25UeXBlSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFNlc3Npb25UeXBlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVJlbW90ZUFnZW50SGFybmVzc0Rlc2NyaXB0b3IsIFJlbW90ZUFnZW50UGx1Z2luQ29udHJvbGxlciB9IGZyb20gJy4vcmVtb3RlQWdlbnRIb3N0Q3VzdG9taXphdGlvbkhhcm5lc3MuanMnO1xuaW1wb3J0IHsgUmVtb3RlQWdlbnRIb3N0TG9nRm9yd2FyZGVyIH0gZnJvbSAnLi9yZW1vdGVBZ2VudEhvc3RMb2dGb3J3YXJkZXIuanMnO1xuaW1wb3J0IHsgUmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciB9IGZyb20gJy4vcmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkN1c3RvbWl6YXRpb25TZXJ2aWNlLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uQ3VzdG9taXphdGlvblNlcnZpY2UgfSBmcm9tICcuL3JlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25DdXN0b21pemF0aW9uLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgd2F0Y2hGb3JJbmNvbXBhdGlibGVOb3RpZmljYXRpb25zIH0gZnJvbSAnLi9yZW1vdGVIb3N0T3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBjb21wdXRlU1NIQ29ubmVjdGlvbktleSwgaXNTU0hIb3N0S2V5RGVuaWVkRXJyb3IsIElTU0hSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCBTU0hBdXRoTWV0aG9kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zc2hSZW1vdGVBZ2VudEhvc3QuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdFRlcm1pbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2Jyb3dzZXIvYWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgY2F0ZWdvcml6ZVNTSENvbm5lY3RFcnJvciwgbG9nU1NIQ29ubmVjdEF0dGVtcHQsIGxvZ1Rlcm1pbmFsUmVjb3ZlcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2Vzc2lvbnNUZWxlbWV0cnkuanMnO1xuXG5SZWdpc3RyeS5hczxJQXN5bmNDaGF0U2Vzc2lvbkFjdGl2YXRpb25SZWdpc3RyeT4oQ2hhdFNlc3Npb25zRXh0ZW5zaW9ucy5Bc3luY0FjdGl2YXRpb24pLnJlZ2lzdGVyKHtcblx0bWF0Y2hTZXNzaW9uVHlwZTogc2Vzc2lvblR5cGUgPT4gaXNSZW1vdGVBZ2VudEhvc3RTZXNzaW9uVHlwZShzZXNzaW9uVHlwZSksXG5cdHdhaXRGb3JBY3RpdmF0aW9uOiB3YWl0Rm9yUmVtb3RlQWdlbnRIb3N0QWN0aXZhdGlvbixcbn0pO1xuXG5hc3luYyBmdW5jdGlvbiB3YWl0Rm9yUmVtb3RlQWdlbnRIb3N0QWN0aXZhdGlvbihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgc2Vzc2lvblR5cGU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRjb25zdCByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlKTtcblx0Y29uc3QgYWRkcmVzcyA9IGdldEFkZHJlc3NGb3JTZXNzaW9uVHlwZShzZXNzaW9uVHlwZSwgcmVtb3RlQWdlbnRIb3N0U2VydmljZSk7XG5cdGlmICghYWRkcmVzcykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHdoaWxlICh0cnVlKSB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHJlbW90ZUFnZW50SG9zdFNlcnZpY2UuZ2V0Q29ubmVjdGlvbihhZGRyZXNzKTtcblx0XHRpZiAoY29ubmVjdGlvbikge1xuXHRcdFx0Y29uc3Qgcm9vdFN0YXRlID0gY29ubmVjdGlvbi5yb290U3RhdGUudmFsdWU7XG5cdFx0XHRpZiAocm9vdFN0YXRlIGluc3RhbmNlb2YgRXJyb3IpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJvb3RTdGF0ZSkge1xuXHRcdFx0XHRjb25zdCBhdXRob3JpdHkgPSBhZ2VudEhvc3RBdXRob3JpdHkoYWRkcmVzcyk7XG5cdFx0XHRcdHJldHVybiByb290U3RhdGUuYWdlbnRzLnNvbWUoYWdlbnQgPT4gcmVtb3RlQWdlbnRIb3N0U2Vzc2lvblR5cGVJZChhdXRob3JpdHksIGFnZW50LnByb3ZpZGVyKSA9PT0gc2Vzc2lvblR5cGUpO1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCBQcm9taXNlLnJhY2UoW1xuXHRcdFx0XHRFdmVudC50b1Byb21pc2UoY29ubmVjdGlvbi5yb290U3RhdGUub25EaWRDaGFuZ2UpLFxuXHRcdFx0XHRFdmVudC50b1Byb21pc2UocmVtb3RlQWdlbnRIb3N0U2VydmljZS5vbkRpZENoYW5nZUNvbm5lY3Rpb25zKSxcblx0XHRcdF0pO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29ubmVjdGlvbkluZm8gPSByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbm5lY3Rpb25zLmZpbmQoY29ubmVjdGlvbiA9PiBjb25uZWN0aW9uLmFkZHJlc3MgPT09IGFkZHJlc3MpO1xuXHRcdGlmIChjb25uZWN0aW9uSW5mbyAmJiAhUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RpbmcoY29ubmVjdGlvbkluZm8uc3RhdHVzKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICghY29ubmVjdGlvbkluZm8gJiYgIXJlbW90ZUFnZW50SG9zdFNlcnZpY2UuY29uZmlndXJlZEVudHJpZXMuc29tZShlbnRyeSA9PiBnZXRFbnRyeUFkZHJlc3MoZW50cnkpID09PSBhZGRyZXNzKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGF3YWl0IEV2ZW50LnRvUHJvbWlzZShyZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29ubmVjdGlvbnMpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldEFkZHJlc3NGb3JTZXNzaW9uVHlwZShzZXNzaW9uVHlwZTogc3RyaW5nLCByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlOiBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGF1dGhvcml0aWVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0Zm9yIChjb25zdCBjb25uZWN0aW9uIG9mIHJlbW90ZUFnZW50SG9zdFNlcnZpY2UuY29ubmVjdGlvbnMpIHtcblx0XHRhdXRob3JpdGllcy5zZXQoYWdlbnRIb3N0QXV0aG9yaXR5KGNvbm5lY3Rpb24uYWRkcmVzcyksIGNvbm5lY3Rpb24uYWRkcmVzcyk7XG5cdH1cblx0Zm9yIChjb25zdCBlbnRyeSBvZiByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbmZpZ3VyZWRFbnRyaWVzKSB7XG5cdFx0Y29uc3QgYWRkcmVzcyA9IGdldEVudHJ5QWRkcmVzcyhlbnRyeSk7XG5cdFx0YXV0aG9yaXRpZXMuc2V0KGFnZW50SG9zdEF1dGhvcml0eShhZGRyZXNzKSwgYWRkcmVzcyk7XG5cdH1cblxuXHRjb25zdCBhdXRob3JpdHkgPSBmaW5kUmVtb3RlQWdlbnRIb3N0U2Vzc2lvblR5cGVBdXRob3JpdHkoc2Vzc2lvblR5cGUsIGF1dGhvcml0aWVzLmtleXMoKSk7XG5cdHJldHVybiBhdXRob3JpdHkgPyBhdXRob3JpdGllcy5nZXQoYXV0aG9yaXR5KSA6IHVuZGVmaW5lZDtcbn1cblxuLyoqIEluaXRpYWwgYXV0by1yZWNvbm5lY3QgZGVsYXkgYWZ0ZXIgYSBmYWlsZWQgU1NIIHJlY29ubmVjdCBhdHRlbXB0LiAqL1xuY29uc3QgU1NIX1JFQ09OTkVDVF9JTklUSUFMX0RFTEFZID0gMTAwMDtcbi8qKiBNYXhpbXVtIGF1dG8tcmVjb25uZWN0IGJhY2tvZmYgZGVsYXkgZm9yIFNTSC4gKi9cbmNvbnN0IFNTSF9SRUNPTk5FQ1RfTUFYX0RFTEFZID0gMzBfMDAwO1xuLyoqXG4gKiBDb25zZWN1dGl2ZSBTU0ggcmVjb25uZWN0IGZhaWx1cmVzIGJlZm9yZSBwYXVzaW5nIGF1dG8tcmVjb25uZWN0LiBXZSByZXN1bWVcbiAqIHdoZW4gdGhlIHVzZXIgY2hhbmdlcyBjb25maWcsIHdoZW4ge0BsaW5rIF9yZWNvbmNpbGV9IGlzIG90aGVyd2lzZSB0cmlnZ2VyZWRcbiAqIChlLmcuIGEgbmV3IGNvbm5lY3Rpb24gYXJyaXZlcyksIG9yIHdoZW4ge0BsaW5rIF9yZXN1bWVTU0hSZWNvbm5lY3RzfSBpc1xuICogZXhwbGljaXRseSBpbnZva2VkLiBUaGlzIGJvdW5kcyBub2lzZSBmcm9tIGEgcGVybWFuZW50bHktZGVhZCBob3N0IHdoaWxlXG4gKiBzdGlsbCBiZWluZyByZXNwb25zaXZlIHRvIFwidGhlIG5ldHdvcmsganVzdCBjYW1lIGJhY2tcIi5cbiAqL1xuY29uc3QgU1NIX1JFQ09OTkVDVF9NQVhfQVRURU1QVFMgPSAxMDtcbi8qKlxuICogQWZ0ZXIgdGhpcyBtdWNoIHdhbGwtY2xvY2sgdGltZSwgYSBwYXVzZWQgYXV0by1yZWNvbm5lY3QgaXMgYXV0b21hdGljYWxseVxuICogcmVzdW1lZCBieSB0aGUgcGVyaW9kaWMgcmVjb25jaWxlLiBDb3ZlcnMgdGhlIGNhc2Ugd2hlcmUgcmVjb25uZWN0IGF0dGVtcHRzXG4gKiBhbGwgZmFpbGVkIHF1aWNrbHkgKGUuZy4gbmV0d29yayBub3QgcmVhZHkgcmlnaHQgYWZ0ZXIgc2xlZXApLCBleGhhdXN0ZWQgdGhlXG4gKiBhdHRlbXB0IGJ1ZGdldCwgYW5kIG5vIG90aGVyIHRyaWdnZXIgKGNvbmZpZyBjaGFuZ2UsIGNvbm5lY3Rpb24gZXZlbnQpIGZpcmVkXG4gKiB0byBnaXZlIHRoZW0gYSBmcmVzaCBjaGFuY2UuXG4gKi9cbmNvbnN0IFNTSF9SRUNPTk5FQ1RfUEFVU0VfQVVUT19SRVNVTUVfTVMgPSA1ICogNjAgKiAxMDAwOyAvLyA1IG1pbnV0ZXNcbi8qKlxuICogSG93IG9mdGVuIHRoZSBwZXJpb2RpYyByZWNvbmNpbGUgYmFja3N0b3AgcnVucy4gVGhpcyBmaXJlcyB7QGxpbmsgX3JlY29uY2lsZX1cbiAqIGV2ZW4gd2hlbiBubyBldmVudCBhcnJpdmVzLCBzbyBhIGJyb2tlbiBldmVudCBjaGFpbiBkb2Vzbid0IGxlYXZlIFNTSCBob3N0c1xuICogZGlzY29ubmVjdGVkIGluZGVmaW5pdGVseS5cbiAqL1xuY29uc3QgU1NIX1JFQ09OTkVDVF9QRVJJT0RJQ19JTlRFUlZBTF9NUyA9IDYwXzAwMDsgLy8gMSBtaW51dGVcblxuLyoqXG4gKiBQZXItaG9zdCBTU0ggYXV0by1yZWNvbm5lY3Qgc3RhdGUuIE93bmVkIGJ5IHtAbGluayBSZW1vdGVBZ2VudEhvc3RDb250cmlidXRpb24uX3NzaFJlY29ubmVjdFN0YXRlc31cbiAqIHdoaWNoIGRpc3Bvc2VzIHRoZSBlbnRyeSBcdTIwMTQgYW5kIHRoZXJlZm9yZSB0aGUgcGVuZGluZyB0aW1lciBcdTIwMTQgd2hlbiB0aGUgaG9zdFxuICogaXMgbm8gbG9uZ2VyIGNvbmZpZ3VyZWQgb3Igd2hlbiB0aGUgY29udHJpYnV0aW9uIGl0c2VsZiBpcyBkaXNwb3NlZC5cbiAqL1xuZXhwb3J0IGNsYXNzIFNTSFJlY29ubmVjdFN0YXRlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RpbWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdC8qKiBDb25zZWN1dGl2ZSBmYWlsZWQgcmVjb25uZWN0IGF0dGVtcHRzLiAqL1xuXHRhdHRlbXB0cyA9IDA7XG5cdC8qKiBUcnVlIGFmdGVyIHdlJ3ZlIGdpdmVuIHVwIGF1dG8tcmVjb25uZWN0aW5nIHVudGlsIHNvbWV0aGluZyByZXN1bWVzIHVzLiAqL1xuXHRwYXVzZWQgPSBmYWxzZTtcblx0LyoqIFdhbGwtY2xvY2sgdGltZXN0YW1wIHdoZW4ge0BsaW5rIHBhdXNlZH0gd2FzIGxhc3Qgc2V0IHRvIHRydWUuICovXG5cdHBhdXNlZEF0ID0gMDtcblx0LyoqIFdoZXRoZXIgb25seSBhbiBleHBsaWNpdCB1c2VyIHJlY29ubmVjdCBzaG91bGQgcmVzdW1lIHRoaXMgc3RhdGUuICovXG5cdHJlcXVpcmVzVXNlckluaXRpYXRlZFJlc3VtZSA9IGZhbHNlO1xuXG5cdGdldCBoYXNQZW5kaW5nVGltZXIoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5fdGltZXIudmFsdWU7XG5cdH1cblxuXHRzY2hlZHVsZVJldHJ5KGRlbGF5TXM6IG51bWJlciwgaGFuZGxlcjogKCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdHRoaXMuX3RpbWVyLnZhbHVlID0gZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0Ly8gRHJvcCB0aGUgZGlzcG9zYWJsZSBub3cgdGhhdCB0aGUgdGltZXIgaGFzIGZpcmVkIHNvXG5cdFx0XHQvLyBgaGFzUGVuZGluZ1RpbWVyYCByZWZsZWN0cyByZWFsaXR5IGV2ZW4gaWYgYGhhbmRsZXJgIHJldHVybnNcblx0XHRcdC8vIGVhcmx5IHdpdGhvdXQgc2NoZWR1bGluZyBhIGZvbGxvdy11cCBhdHRlbXB0LlxuXHRcdFx0dGhpcy5fdGltZXIudmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0XHRoYW5kbGVyKCk7XG5cdFx0fSwgZGVsYXlNcyk7XG5cdH1cblxuXHRjYW5jZWxUaW1lcigpOiB2b2lkIHtcblx0XHR0aGlzLl90aW1lci5jbGVhcigpO1xuXHR9XG5cblx0cmVzZXRGb3JSZXN1bWUoKTogdm9pZCB7XG5cdFx0dGhpcy5hdHRlbXB0cyA9IDA7XG5cdFx0dGhpcy5wYXVzZWQgPSBmYWxzZTtcblx0XHR0aGlzLl90aW1lci5jbGVhcigpO1xuXHRcdHRoaXMucmVxdWlyZXNVc2VySW5pdGlhdGVkUmVzdW1lID0gZmFsc2U7XG5cdH1cblxuXHRyZXN1bWVBdXRvbWF0aWNhbGx5KCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5wYXVzZWQgfHwgdGhpcy5yZXF1aXJlc1VzZXJJbml0aWF0ZWRSZXN1bWUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy5yZXNldEZvclJlc3VtZSgpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG91bGRQYXVzZVNTSFJlY29ubmVjdEFmdGVyRmFpbHVyZShlcnI6IHVua25vd24pOiBib29sZWFuIHtcblx0cmV0dXJuIGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSB8fCBpc1NTSEhvc3RLZXlEZW5pZWRFcnJvcihlcnIpO1xufVxuXG4vKipcbiAqIENvbm5lY3Rpb24ga2V5IHBhc3NlZCB0byB7QGxpbmsgSVNTSFJlbW90ZUFnZW50SG9zdFNlcnZpY2UuZGlzY29ubmVjdH0gZm9yXG4gKiBhbiBTU0gtYmFja2VkIHJlbW90ZSBhZ2VudCBob3N0IGVudHJ5LiBNaXJyb3JzIHRoZSBrZXkgdGhlIFNTSCBzZXJ2aWNlXG4gKiBpdHNlbGYgY29uc3RydWN0cyB3aGVuIGl0IHN0b3JlcyB0aGUgY29ubmVjdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNzaENvbm5lY3Rpb25LZXkoY29ubmVjdGlvbjogSVJlbW90ZUFnZW50SG9zdFNTSENvbm5lY3Rpb24pOiBzdHJpbmcge1xuXHRyZXR1cm4gY29ubmVjdGlvbi5zc2hDb25maWdIb3N0XG5cdFx0PyBgc3NoOiR7Y29ubmVjdGlvbi5zc2hDb25maWdIb3N0fWBcblx0XHQ6IGAke2Nvbm5lY3Rpb24udXNlciA/PyBjb25uZWN0aW9uLmhvc3ROYW1lfUAke2Nvbm5lY3Rpb24uaG9zdE5hbWV9OiR7Y29ubmVjdGlvbi5wb3J0ID8/IDIyfWA7XG59XG5cbi8qKlxuICogU2VxdWVuY2UgdGhlIHN0ZXBzIHRvIGRpc2Nvbm5lY3QgYW4gU1NILWJhY2tlZCByZW1vdGUgYWdlbnQgaG9zdCBlbnRyeVxuICogdHJpZ2dlcmVkIGJ5IHRoZSB1c2VyIChlLmcuIGNsaWNraW5nIFggaW4gdGhlIHdvcmtzcGFjZSBwaWNrZXIpLlxuICpcbiAqIE9yZGVyIG1hdHRlcnM6IGByZW1vdmVSZW1vdGVBZ2VudEhvc3RgIE1VU1QgcnVuIGJlZm9yZSB0aGUgU1NIIHR1bm5lbFxuICogdGVhcmRvd24uIGBzc2hTZXJ2aWNlLmRpc2Nvbm5lY3QoKWAgZmlyZXMgYG9uRGlkQ2xvc2VDb25uZWN0aW9uYFxuICogc3luY2hyb25vdXNseSwgd2hpY2ggdGhlIHJlbmRlcmVyIHRyYW5zbGF0ZXMgaW50byBgb25EaWRDaGFuZ2VDb25uZWN0aW9uc2BcbiAqIGFuZCB0aGUgY29udHJpYnV0aW9uJ3MgYF9yZWNvbmNpbGVgIFx1MjE5MiBgX3JlY29ubmVjdFNTSEVudHJpZXNgLiBJZiB0aGUgZW50cnlcbiAqIGlzIHN0aWxsIGluIGNvbmZpZ3VyZWQgc3RvcmFnZSBhdCB0aGF0IHBvaW50LCB0aGUgYXV0by1yZWNvbm5lY3QgcGF0aFxuICogaW1tZWRpYXRlbHkgcmVjb25uZWN0cyB0aGUgaG9zdCB3ZSBqdXN0IHRvbGQgaXQgdG8gZGlzY29ubmVjdC5cbiAqXG4gKiBgcmVtb3ZlUmVtb3RlQWdlbnRIb3N0YCBpdHNlbGYgcnVucyB0aGUgZW50cnkncyB0cmFuc3BvcnQgZGlzcG9zYWJsZVxuICogKHdoaWNoIGNhbGxzIGBfbWFpblNlcnZpY2UuZGlzY29ubmVjdChjb25uZWN0aW9uSWQpYCksIHNvIHRoZSB1bmRlcmx5aW5nXG4gKiBTU0ggdHVubmVsIGlzIGFscmVhZHkgY2xvc2VkIHdoZW4gdGhpcyByZXR1cm5zLiBUaGUgZXhwbGljaXRcbiAqIGBzc2hTZXJ2aWNlLmRpc2Nvbm5lY3QoY29ubmVjdGlvbktleSlgIGlzIGJlbHQtYW5kLXN1c3BlbmRlcnMgdG8gY2xlYXJcbiAqIHRoZSBjb25uZWN0aW9uIGJ5IGl0cyBjb25uZWN0aW9uIGtleSBhcyB3ZWxsLCBtYXRjaGluZyB0aGUgcHJpb3JcbiAqIHRlYXJkb3duIGJlaGF2aW9yLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZGlzY29ubmVjdFNTSEVudHJ5KFxuXHRjb25uZWN0aW9uOiBJUmVtb3RlQWdlbnRIb3N0U1NIQ29ubmVjdGlvbixcblx0cmVtb3RlQWdlbnRIb3N0U2VydmljZTogUGljazxJUmVtb3RlQWdlbnRIb3N0U2VydmljZSwgJ3JlbW92ZVJlbW90ZUFnZW50SG9zdCc+LFxuXHRzc2hTZXJ2aWNlOiBQaWNrPElTU0hSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCAnZGlzY29ubmVjdCc+LFxuKTogUHJvbWlzZTx2b2lkPiB7XG5cdGF3YWl0IHJlbW90ZUFnZW50SG9zdFNlcnZpY2UucmVtb3ZlUmVtb3RlQWdlbnRIb3N0KGNvbm5lY3Rpb24uYWRkcmVzcyk7XG5cdGF3YWl0IHNzaFNlcnZpY2UuZGlzY29ubmVjdChzc2hDb25uZWN0aW9uS2V5KGNvbm5lY3Rpb24pKTtcbn1cblxuLyoqIFBlci1jb25uZWN0aW9uIHN0YXRlIGJ1bmRsZSwgZGlzcG9zZWQgd2hlbiBhIGNvbm5lY3Rpb24gaXMgcmVtb3ZlZC4gKi9cbmNsYXNzIENvbm5lY3Rpb25TdGF0ZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRyZWFkb25seSBzdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHJlYWRvbmx5IGFnZW50cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlTWFwPEFnZW50UHJvdmlkZXIsIERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHJlYWRvbmx5IG1vZGVsUHJvdmlkZXJzID0gbmV3IE1hcDxBZ2VudFByb3ZpZGVyLCBBZ2VudEhvc3RMYW5ndWFnZU1vZGVsUHJvdmlkZXI+KCk7XG5cdC8qKiBEZWR1cGVzIHJlZHVuZGFudCBgYXV0aGVudGljYXRlYCBSUENzIHdoZW4gdGhlIHJlc29sdmVkIHRva2VuIGhhc24ndCBjaGFuZ2VkLiAqL1xuXHRyZWFkb25seSBhdXRoVG9rZW5DYWNoZSA9IG5ldyBBZ2VudEhvc3RBdXRoVG9rZW5DYWNoZSgpO1xuXHRyZWFkb25seSBhdXRoUmVjb3ZlcnkgPSBuZXcgQWdlbnRIb3N0QXV0aGVudGljYXRpb25SZWNvdmVyeSgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IG5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCxcblx0XHRyZWFkb25seSBjb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG59XG5cbi8qKlxuICogRGlzY292ZXJzIGF2YWlsYWJsZSBhZ2VudHMgZnJvbSBlYWNoIGNvbm5lY3RlZCByZW1vdGUgYWdlbnQgaG9zdCBhbmRcbiAqIGR5bmFtaWNhbGx5IHJlZ2lzdGVycyBlYWNoIG9uZSBhcyBhIGNoYXQgc2Vzc2lvbiB0eXBlIHdpdGggaXRzIG93blxuICogc2Vzc2lvbiBoYW5kbGVyIGFuZCBsYW5ndWFnZSBtb2RlbCBwcm92aWRlci5cbiAqXG4gKiBVc2VzIHRoZSBzYW1lIHVuaWZpZWQge0BsaW5rIEFnZW50SG9zdFNlc3Npb25IYW5kbGVyfSBhcyB0aGUgbG9jYWxcbiAqIGFnZW50IGhvc3QsIG9idGFpbmluZyBwZXItY29ubmVjdGlvbiB7QGxpbmsgSUFnZW50Q29ubmVjdGlvbn1cbiAqIGluc3RhbmNlcyBmcm9tIHtAbGluayBJUmVtb3RlQWdlbnRIb3N0U2VydmljZS5nZXRDb25uZWN0aW9ufS5cbiAqL1xuZXhwb3J0IGNsYXNzIFJlbW90ZUFnZW50SG9zdENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnc2Vzc2lvbnMuY29udHJpYi5yZW1vdGVBZ2VudEhvc3RDb250cmlidXRpb24nO1xuXG5cdC8qKiBQZXItY29ubmVjdGlvbiBzdGF0ZTogY2xpZW50IHN0YXRlICsgcGVyLWFnZW50IHJlZ2lzdHJhdGlvbnMuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3Rpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBDb25uZWN0aW9uU3RhdGU+KCkpO1xuXG5cdC8qKiBQZXItYWRkcmVzcyBzZXNzaW9ucyBwcm92aWRlciwgcmVnaXN0ZXJlZCBmb3IgYWxsIGNvbmZpZ3VyZWQgZW50cmllcy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXJTdG9yZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDxzdHJpbmcsIERpc3Bvc2FibGVTdG9yZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb3ZpZGVySW5zdGFuY2VzID0gbmV3IE1hcDxzdHJpbmcsIFJlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXI+KCk7XG5cdC8qKlxuXHQgKiBJbi1mbGlnaHQgcmVjb25uZWN0IGF0dGVtcHRzIGtleWVkIGJ5IGhvc3QgaWQgKGBzc2hDb25maWdIb3N0YCBmb3IgU1NILFxuXHQgKiBgZGlzdHJvYCBmb3IgV1NMKS4gU3RvcmVzIHRoZSB7QGxpbmsgX2F0dGVtcHRNYW5hZ2VkUmVjb25uZWN0fSBwcm9taXNlXG5cdCAqIHNvIGNvbmN1cnJlbnQgb24tZGVtYW5kIGNhbGxlcnMgKGUuZy4gYSB1c2VyIGNsaWNrIG9uIFwiU2VsZWN0Li4uXCIgd2hpbGVcblx0ICogdGhlIHBlcmlvZGljIHBvbGwgaXMgYWxyZWFkeSByZWNvbm5lY3RpbmcpIGpvaW4gdGhlIGV4aXN0aW5nIGF0dGVtcHRcblx0ICogcmF0aGVyIHRoYW4gcmFjaW5nIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ1NTSFJlY29ubmVjdHMgPSBuZXcgTWFwPHN0cmluZywgUHJvbWlzZTx2b2lkPj4oKTtcblxuXHQvKiogUGVyLWhvc3QgU1NIIGF1dG8tcmVjb25uZWN0IHN0YXRlICh0aW1lciArIGF0dGVtcHRzICsgcGF1c2VkKS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc3NoUmVjb25uZWN0U3RhdGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBTU0hSZWNvbm5lY3RTdGF0ZT4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3JlbW90ZUFnZW50SG9zdFNlcnZpY2U6IElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRASUxhbmd1YWdlTW9kZWxzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdFx0QElEZWZhdWx0QWNjb3VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGVmYXVsdEFjY291bnRTZXJ2aWNlOiBJRGVmYXVsdEFjY291bnRTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U6IElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0RmlsZVN5c3RlbVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWdlbnRIb3N0RmlsZVN5c3RlbVNlcnZpY2U6IElBZ2VudEhvc3RGaWxlU3lzdGVtU2VydmljZSxcblx0XHRASVNTSFJlbW90ZUFnZW50SG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3NoU2VydmljZTogSVNTSFJlbW90ZUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0QElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlOiBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0VGVybWluYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50SG9zdFRlcm1pbmFsU2VydmljZTogSUFnZW50SG9zdFRlcm1pbmFsU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZUNsaWVudFNlcnZpY2U6IElBZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkN1c3RvbWl6YXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3Rpb25DdXN0b21pemF0aW9uczogSVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25DdXN0b21pemF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdC8vIFJlY29uY2lsZSBwcm92aWRlcnMgd2hlbiBjb25maWd1cmVkIGVudHJpZXMgY2hhbmdlXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oUmVtb3RlQWdlbnRIb3N0c1NldHRpbmdJZCkgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCkgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihSZW1vdGVBZ2VudEhvc3RBdXRvQ29ubmVjdFNldHRpbmdJZCkpIHtcblx0XHRcdFx0Ly8gVXNlciBjaGFuZ2VkIGNvbmZpZyBcdTIwMTQgZ2l2ZSBwYXVzZWQgYXV0by1yZWNvbm5lY3QgYSBmcmVzaCBjaGFuY2UuXG5cdFx0XHRcdHRoaXMuX3Jlc3VtZVNTSFJlY29ubmVjdHMoKTtcblx0XHRcdFx0dGhpcy5fcmVjb25jaWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVjb25jaWxlIHdoZW4gY29ubmVjdGlvbnMgY2hhbmdlIChhZGRlZC9yZW1vdmVkL3JlY29ubmVjdGVkKVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2Uub25EaWRDaGFuZ2VDb25uZWN0aW9ucygoKSA9PiB7XG5cdFx0XHQvLyBOZXcvcmVtb3ZlZCBjb25uZWN0aW9uIFx1MjAxNCBwYXVzZWQgYXV0by1yZWNvbm5lY3QgbWF5IGhhdmUgYmVlblxuXHRcdFx0Ly8gY2F1c2VkIGJ5IGEgdHJhbnNpZW50IG91dGFnZSB0aGF0J3Mgbm93IHJlc29sdmVkLlxuXHRcdFx0dGhpcy5fcmVzdW1lU1NIUmVjb25uZWN0cygpO1xuXHRcdFx0dGhpcy5fcmVjb25jaWxlKCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ2FuY2VsIGFueSBwZW5kaW5nIFNTSCByZWNvbm5lY3QgdGltZXJzIG9uIGRpc3Bvc2UuXG5cdFx0Ly8gKEhhbmRsZWQgYXV0b21hdGljYWxseSBieSB0aGUgRGlzcG9zYWJsZU1hcCBhYm92ZTsgbm90aGluZyBleHRyYSBuZWVkZWQgaGVyZS4pXG5cblx0XHQvLyBQdXNoIGF1dGggdG9rZW4gd2hlbmV2ZXIgdGhlIGRlZmF1bHQgYWNjb3VudCBvciBzZXNzaW9ucyBjaGFuZ2Vcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9kZWZhdWx0QWNjb3VudFNlcnZpY2Uub25EaWRDaGFuZ2VEZWZhdWx0QWNjb3VudCgoKSA9PiB0aGlzLl9hdXRoZW50aWNhdGVBbGxDb25uZWN0aW9ucygpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoKCkgPT4gdGhpcy5fYXV0aGVudGljYXRlQWxsQ29ubmVjdGlvbnMoKSkpO1xuXG5cdFx0Ly8gSW5pdGlhbCBzZXR1cCBmb3IgY29uZmlndXJlZCBlbnRyaWVzIGFuZCBjb25uZWN0ZWQgcmVtb3Rlc1xuXHRcdHRoaXMuX3JlY29uY2lsZSgpO1xuXG5cdFx0Ly8gUGVyaW9kaWMgYmFja3N0b3A6IGV2ZW4gaWYgdGhlIGV2ZW50LWRyaXZlbiBjaGFpbiBicmVha3MgKGUuZy4gSVBDXG5cdFx0Ly8gZGVsaXZlcnkgZmFpbHMgYWZ0ZXIgYSBzbGVlcC93YWtlIGN5Y2xlKSwgdGhpcyBlbnN1cmVzIHdlIHJldHJ5IFNTSFxuXHRcdC8vIHJlY29ubmVjdHMgYW5kIHJlY29uY2lsZSBwcm92aWRlcnMgYXQgbW9zdCBvbmNlIHBlciBtaW51dGUuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobmV3IEludGVydmFsVGltZXIoKSkuY2FuY2VsQW5kU2V0KFxuXHRcdFx0KCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdbUmVtb3RlQWdlbnRIb3N0XSBQZXJpb2RpYyByZWNvbmNpbGUgKGJhY2tzdG9wKScpO1xuXHRcdFx0XHR0aGlzLl9yZWNvbmNpbGUoKTtcblx0XHRcdH0sXG5cdFx0XHRTU0hfUkVDT05ORUNUX1BFUklPRElDX0lOVEVSVkFMX01TLFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWNvbmNpbGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVjb25jaWxlUHJvdmlkZXJzKCk7XG5cdFx0dGhpcy5fcmVjb25jaWxlQ29ubmVjdGlvbnMoKTtcblx0XHR0aGlzLl9yZWNvbm5lY3RTU0hFbnRyaWVzKCk7XG5cblx0XHQvLyBFbnN1cmUgZXZlcnkgbGl2ZSBjb25uZWN0aW9uIGlzIHdpcmVkIHRvIGl0cyBwcm92aWRlci4gVGhpcyBjb3ZlcnNcblx0XHQvLyB0aGUgY2FzZSB3aGVyZSBhIHByb3ZpZGVyIHdhcyByZWNyZWF0ZWQgKGUuZy4gbmFtZSBjaGFuZ2UpIHdoaWxlIGFcblx0XHQvLyBjb25uZWN0aW9uIGZvciB0aGF0IGFkZHJlc3MgYWxyZWFkeSBleGlzdGVkLlxuXHRcdGZvciAoY29uc3QgW2FkZHJlc3MsIGNvbm5TdGF0ZV0gb2YgdGhpcy5fY29ubmVjdGlvbnMpIHtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb25JbmZvID0gdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5jb25uZWN0aW9ucy5maW5kKGMgPT4gYy5hZGRyZXNzID09PSBhZGRyZXNzKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fcHJvdmlkZXJJbnN0YW5jZXMuZ2V0KGFkZHJlc3MpO1xuXHRcdFx0aWYgKHByb3ZpZGVyKSB7XG5cdFx0XHRcdHByb3ZpZGVyLnNldENvbm5lY3Rpb24oY29ublN0YXRlLmNvbm5lY3Rpb24sIGNvbm5lY3Rpb25JbmZvPy5kZWZhdWx0RGlyZWN0b3J5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgY29ubmVjdGlvbiBzdGF0dXMgb24gYWxsIHByb3ZpZGVycyAoaW5jbHVkaW5nIHRob3NlXG5cdFx0Ly8gdGhhdCBhcmUgcmVjb25uZWN0aW5nIGFuZCBkb24ndCBoYXZlIGFuIGFjdGl2ZSBjb25uZWN0aW9uKS5cblx0XHRmb3IgKGNvbnN0IFthZGRyZXNzLCBwcm92aWRlcl0gb2YgdGhpcy5fcHJvdmlkZXJJbnN0YW5jZXMpIHtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb25JbmZvID0gdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5jb25uZWN0aW9ucy5maW5kKGMgPT4gYy5hZGRyZXNzID09PSBhZGRyZXNzKTtcblx0XHRcdGlmIChjb25uZWN0aW9uSW5mbykge1xuXHRcdFx0XHQvLyBTZXJ2aWNlIGhhcyBhbiBlbnRyeSBmb3IgdGhpcyBhZGRyZXNzIFx1MjAxNCBpdHMgc3RhdHVzIGlzXG5cdFx0XHRcdC8vIGF1dGhvcml0YXRpdmUgKGluY2x1ZGluZyB0aGUgYGluY29tcGF0aWJsZWAgc2V0IGJ5IHRoZVxuXHRcdFx0XHQvLyBXZWJTb2NrZXQgY29ubmVjdCBmYWlsdXJlIHBhdGgsIGFuZCB0aGUgYGNvbm5lY3RpbmdgXG5cdFx0XHRcdC8vIHN0YXR1cyBvZiBhIGZyZXNoIHJlY29ubmVjdCBhdHRlbXB0IGFmdGVyIGFuIHVwZ3JhZGUpLlxuXHRcdFx0XHRwcm92aWRlci5zZXRDb25uZWN0aW9uU3RhdHVzKGNvbm5lY3Rpb25JbmZvLnN0YXR1cyk7XG5cdFx0XHR9IGVsc2UgaWYgKCFSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzSW5jb21wYXRpYmxlKHByb3ZpZGVyLmNvbm5lY3Rpb25TdGF0dXMuZ2V0KCkpKSB7XG5cdFx0XHRcdC8vIE5vIHNlcnZpY2UgZW50cnkuIFByZXNlcnZlIGluY29tcGF0aWJsZSBzdGF0ZSBzZXQgYnlcblx0XHRcdFx0Ly8gdGhlIFNTSCByZWNvbm5lY3QgY2F0Y2ggKHdoZXJlIHRoZSBmYWlsdXJlIGhhcHBlbnNcblx0XHRcdFx0Ly8gYmVmb3JlIHRoZSBzZXJ2aWNlIGV2ZXIgc2VlcyBhbiBlbnRyeSk7IG90aGVyd2lzZSBmYWxsXG5cdFx0XHRcdC8vIGJhY2sgdG8gZGlzY29ubmVjdGVkLlxuXHRcdFx0XHRwcm92aWRlci5zZXRDb25uZWN0aW9uU3RhdHVzKFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuZGlzY29ubmVjdGVkKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWNvbmNpbGVQcm92aWRlcnMoKTogdm9pZCB7XG5cdFx0Y29uc3QgZW5hYmxlZCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkKTtcblx0XHRjb25zdCBlbnRyaWVzID0gZW5hYmxlZCA/IHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuY29uZmlndXJlZEVudHJpZXMgOiBbXTtcblx0XHRjb25zdCBkZXNpcmVkQWRkcmVzc2VzID0gbmV3IFNldChlbnRyaWVzLm1hcChlID0+IGdldEVudHJ5QWRkcmVzcyhlKSkpO1xuXG5cdFx0Ly8gUmVtb3ZlIHByb3ZpZGVycyBubyBsb25nZXIgY29uZmlndXJlZFxuXHRcdGZvciAoY29uc3QgW2FkZHJlc3NdIG9mIHRoaXMuX3Byb3ZpZGVyU3RvcmVzKSB7XG5cdFx0XHRpZiAoIWRlc2lyZWRBZGRyZXNzZXMuaGFzKGFkZHJlc3MpKSB7XG5cdFx0XHRcdHRoaXMuX3Byb3ZpZGVyU3RvcmVzLmRlbGV0ZUFuZERpc3Bvc2UoYWRkcmVzcyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIG9yIHJlY3JlYXRlIHByb3ZpZGVycyBmb3IgY29uZmlndXJlZCBlbnRyaWVzXG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRjb25zdCBhZGRyZXNzID0gZ2V0RW50cnlBZGRyZXNzKGVudHJ5KTtcblx0XHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fcHJvdmlkZXJJbnN0YW5jZXMuZ2V0KGFkZHJlc3MpO1xuXHRcdFx0aWYgKGV4aXN0aW5nICYmIGV4aXN0aW5nLmxhYmVsICE9PSAoZW50cnkubmFtZSB8fCBhZGRyZXNzKSkge1xuXHRcdFx0XHQvLyBOYW1lIGNoYW5nZWQgXHUyMDE0IHJlY3JlYXRlIHNpbmNlIElTZXNzaW9uc1Byb3ZpZGVyLmxhYmVsIGlzIHJlYWRvbmx5XG5cdFx0XHRcdHRoaXMuX3Byb3ZpZGVyU3RvcmVzLmRlbGV0ZUFuZERpc3Bvc2UoYWRkcmVzcyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuX3Byb3ZpZGVyU3RvcmVzLmhhcyhhZGRyZXNzKSkge1xuXHRcdFx0XHR0aGlzLl9jcmVhdGVQcm92aWRlcihlbnRyeSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlUHJvdmlkZXIoZW50cnk6IElSZW1vdGVBZ2VudEhvc3RFbnRyeSk6IHZvaWQge1xuXHRcdGNvbnN0IGFkZHJlc3MgPSBnZXRFbnRyeUFkZHJlc3MoZW50cnkpO1xuXHRcdGNvbnN0IHNzaENvbm5lY3Rpb24gPSBlbnRyeS5jb25uZWN0aW9uLnR5cGUgPT09IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5TU0ggPyBlbnRyeS5jb25uZWN0aW9uIDogdW5kZWZpbmVkO1xuXHRcdGxldCBjb25uZWN0T25EZW1hbmQ6ICgoKSA9PiBQcm9taXNlPHZvaWQ+KSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZGlzY29ubmVjdE9uRGVtYW5kOiAoKCkgPT4gUHJvbWlzZTx2b2lkPikgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHByZWZlcmVuY2VLZXk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoc3NoQ29ubmVjdGlvbikge1xuXHRcdFx0Y29ubmVjdE9uRGVtYW5kID0gKCkgPT4gdGhpcy5fY29ubmVjdFNTSE9uRGVtYW5kKHNzaENvbm5lY3Rpb24sIGVudHJ5Lm5hbWUsIGFkZHJlc3MpO1xuXHRcdFx0ZGlzY29ubmVjdE9uRGVtYW5kID0gKCkgPT4gdGhpcy5fZGlzY29ubmVjdFNTSE9uRGVtYW5kKHNzaENvbm5lY3Rpb24pO1xuXHRcdFx0Ly8gVGhlIHN0YWJsZSBrZXkgU1NIUmVtb3RlQWdlbnRIb3N0U2VydmljZSByZWFkcyBpdHMgcHJlZmVyZW5jZVxuXHRcdFx0Ly8gYnkgKHNlZSBjb21wdXRlU1NIQ29ubmVjdGlvbktleSdzIGRvY3MpIC0gTk9UIHRoZSBsaXZlXG5cdFx0XHQvLyBmb3J3YXJkZWQgYGFkZHJlc3NgIGFib3ZlLCB3aGljaCBjaGFuZ2VzIHBlci1jb25uZWN0aW9uLlxuXHRcdFx0cHJlZmVyZW5jZUtleSA9IGNvbXB1dGVTU0hDb25uZWN0aW9uS2V5KHtcblx0XHRcdFx0c3NoQ29uZmlnSG9zdDogc3NoQ29ubmVjdGlvbi5zc2hDb25maWdIb3N0LFxuXHRcdFx0XHR1c2VybmFtZTogc3NoQ29ubmVjdGlvbi51c2VyLFxuXHRcdFx0XHRob3N0OiBzc2hDb25uZWN0aW9uLmhvc3ROYW1lLFxuXHRcdFx0XHRwb3J0OiBzc2hDb25uZWN0aW9uLnBvcnQsXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFJlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIsIHsgYWRkcmVzcywgbmFtZTogZW50cnkubmFtZSwgY29ubmVjdE9uRGVtYW5kLCBkaXNjb25uZWN0T25EZW1hbmQsIHByZWZlcmVuY2VLZXkgfSk7XG5cdFx0c3RvcmUuYWRkKHByb3ZpZGVyKTtcblx0XHRzdG9yZS5hZGQodGhpcy5fc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIocHJvdmlkZXIpKTtcblx0XHRzdG9yZS5hZGQod2F0Y2hGb3JJbmNvbXBhdGlibGVOb3RpZmljYXRpb25zKHByb3ZpZGVyLCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5fbm90aWZpY2F0aW9uU2VydmljZSkpO1xuXHRcdHRoaXMuX3Byb3ZpZGVySW5zdGFuY2VzLnNldChhZGRyZXNzLCBwcm92aWRlcik7XG5cdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9wcm92aWRlckluc3RhbmNlcy5kZWxldGUoYWRkcmVzcykpKTtcblx0XHR0aGlzLl9wcm92aWRlclN0b3Jlcy5zZXQoYWRkcmVzcywgc3RvcmUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlLWVzdGFibGlzaCBTU0ggY29ubmVjdGlvbnMgZm9yIGNvbmZpZ3VyZWQgZW50cmllcyB0aGF0IGhhdmUgYW5cblx0ICogc3NoQ29uZmlnSG9zdCBidXQgbm8gYWN0aXZlIGNvbm5lY3Rpb24uIFNjaGVkdWxlcyByZXRyaWVzIHdpdGhcblx0ICogZXhwb25lbnRpYWwgYmFja29mZiBvbiBmYWlsdXJlIHNvIGEgdHJhbnNpZW50IG91dGFnZSBkb2Vzbid0IGxlYXZlXG5cdCAqIHRoZSBob3N0IHN0dWNrIFwiZGlzY29ubmVjdGVkXCIgdW50aWwgdGhlIG5leHQgY29uZmlnIC8gY29ubmVjdGlvblxuXHQgKiBjaGFuZ2UuIEF1dG8tcmVjb25uZWN0IHBhdXNlcyBhZnRlciB7QGxpbmsgU1NIX1JFQ09OTkVDVF9NQVhfQVRURU1QVFN9XG5cdCAqIGNvbnNlY3V0aXZlIGZhaWx1cmVzIGFuZCByZXN1bWVzIHdoZW4ge0BsaW5rIF9yZWNvbmNpbGV9IHJ1bnMgYWdhaW5cblx0ICogKGNvbmZpZyBjaGFuZ2UsIGNvbm5lY3Rpb24gZXZlbnQpIG9yIHtAbGluayBfcmVzdW1lU1NIUmVjb25uZWN0c30gaXNcblx0ICogY2FsbGVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVjb25uZWN0U1NIRW50cmllcygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkKSkge1xuXHRcdFx0dGhpcy5fc3NoUmVjb25uZWN0U3RhdGVzLmNsZWFyQW5kRGlzcG9zZUFsbCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGF1dG9Db25uZWN0ID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVtb3RlQWdlbnRIb3N0QXV0b0Nvbm5lY3RTZXR0aW5nSWQpO1xuXHRcdGNvbnN0IGVudHJpZXMgPSB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbmZpZ3VyZWRFbnRyaWVzO1xuXHRcdGNvbnN0IHN0aWxsQ29uZmlndXJlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuXHRcdFx0aWYgKGVudHJ5LmNvbm5lY3Rpb24udHlwZSAhPT0gUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLlNTSCB8fCAhZW50cnkuY29ubmVjdGlvbi5zc2hDb25maWdIb3N0KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3NoQ29uZmlnSG9zdCA9IGVudHJ5LmNvbm5lY3Rpb24uc3NoQ29uZmlnSG9zdDtcblx0XHRcdHN0aWxsQ29uZmlndXJlZC5hZGQoc3NoQ29uZmlnSG9zdCk7XG5cdFx0XHRjb25zdCBhZGRyZXNzID0gZ2V0RW50cnlBZGRyZXNzKGVudHJ5KTtcblx0XHRcdC8vIFNraXAgaWYgYWxyZWFkeSBjb25uZWN0ZWQ6IGNsZWFyIGFueSByZXRyeSBzdGF0ZS5cblx0XHRcdGNvbnN0IGhhc0Nvbm5lY3Rpb24gPSB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbm5lY3Rpb25zLnNvbWUoXG5cdFx0XHRcdGMgPT4gYy5hZGRyZXNzID09PSBhZGRyZXNzICYmIFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNDb25uZWN0ZWQoYy5zdGF0dXMpXG5cdFx0XHQpO1xuXHRcdFx0aWYgKGhhc0Nvbm5lY3Rpb24pIHtcblx0XHRcdFx0dGhpcy5fc3NoUmVjb25uZWN0U3RhdGVzLmRlbGV0ZUFuZERpc3Bvc2Uoc3NoQ29uZmlnSG9zdCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX3BlbmRpbmdTU0hSZWNvbm5lY3RzLmhhcyhzc2hDb25maWdIb3N0KSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbUmVtb3RlQWdlbnRIb3N0XSBTU0ggcmVjb25uZWN0IGZvciAke3NzaENvbmZpZ0hvc3R9OiByZWNvbm5lY3QgYWxyZWFkeSBpbiBwcm9ncmVzcywgc2tpcHBpbmdgKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3NzaFJlY29ubmVjdFN0YXRlcy5nZXQoc3NoQ29uZmlnSG9zdCk7XG5cdFx0XHRpZiAoc3RhdGU/Lmhhc1BlbmRpbmdUaW1lcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbUmVtb3RlQWdlbnRIb3N0XSBTU0ggcmVjb25uZWN0IGZvciAke3NzaENvbmZpZ0hvc3R9OiByZXRyeSB0aW1lciBhbHJlYWR5IHNjaGVkdWxlZCwgc2tpcHBpbmdgKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoc3RhdGU/LnBhdXNlZCkge1xuXHRcdFx0XHRpZiAoc3RhdGUucmVxdWlyZXNVc2VySW5pdGlhdGVkUmVzdW1lKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW1JlbW90ZUFnZW50SG9zdF0gU1NIIHJlY29ubmVjdCBmb3IgJHtzc2hDb25maWdIb3N0fTogd2FpdGluZyBmb3IgYSB1c2VyLWluaXRpYXRlZCByZWNvbm5lY3RgKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBwYXVzZWRNcyA9IERhdGUubm93KCkgLSBzdGF0ZS5wYXVzZWRBdDtcblx0XHRcdFx0aWYgKHBhdXNlZE1zIDwgU1NIX1JFQ09OTkVDVF9QQVVTRV9BVVRPX1JFU1VNRV9NUykge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtSZW1vdGVBZ2VudEhvc3RdIFNTSCByZWNvbm5lY3QgZm9yICR7c3NoQ29uZmlnSG9zdH06IHBhdXNlZCAoJHtNYXRoLnJvdW5kKHBhdXNlZE1zIC8gMTAwMCl9cyBhZ28pLCBza2lwcGluZ2ApO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFBhdXNlIGR1cmF0aW9uIGV4Y2VlZGVkIFx1MjAxNCBnaXZlIGl0IGFub3RoZXIgY2hhbmNlIGF1dG9tYXRpY2FsbHkuXG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1JlbW90ZUFnZW50SG9zdF0gU1NIIHJlY29ubmVjdCBmb3IgJHtzc2hDb25maWdIb3N0fTogYXV0by1yZXN1bWluZyBhZnRlciAke01hdGgucm91bmQocGF1c2VkTXMgLyAxMDAwKX1zIHBhdXNlYCk7XG5cdFx0XHRcdHN0YXRlLnJlc2V0Rm9yUmVzdW1lKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWF1dG9Db25uZWN0KSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtSZW1vdGVBZ2VudEhvc3RdIFNTSCByZWNvbm5lY3QgZm9yICR7c3NoQ29uZmlnSG9zdH06IGF1dG8tY29ubmVjdCBkaXNhYmxlZCwgc2tpcHBpbmdgKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR2b2lkIHRoaXMuX2F0dGVtcHRTU0hSZWNvbm5lY3Qoc3NoQ29uZmlnSG9zdCwgZW50cnkubmFtZSwgYWRkcmVzcyk7XG5cdFx0fVxuXG5cdFx0Ly8gRHJvcCByZXRyeSBzdGF0ZSBmb3IgaG9zdHMgdGhhdCBhcmUgbm8gbG9uZ2VyIGNvbmZpZ3VyZWQuXG5cdFx0Zm9yIChjb25zdCBob3N0IG9mIFsuLi50aGlzLl9zc2hSZWNvbm5lY3RTdGF0ZXMua2V5cygpXSkge1xuXHRcdFx0aWYgKCFzdGlsbENvbmZpZ3VyZWQuaGFzKGhvc3QpKSB7XG5cdFx0XHRcdHRoaXMuX3NzaFJlY29ubmVjdFN0YXRlcy5kZWxldGVBbmREaXNwb3NlKGhvc3QpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Nvbm5lY3RTU0hPbkRlbWFuZChjb25uZWN0aW9uOiBJUmVtb3RlQWdlbnRIb3N0U1NIQ29ubmVjdGlvbiwgbmFtZTogc3RyaW5nLCBhZGRyZXNzOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzc2hDb25maWdIb3N0ID0gY29ubmVjdGlvbi5zc2hDb25maWdIb3N0O1xuXHRcdGlmICghc3NoQ29uZmlnSG9zdCkge1xuXHRcdFx0Y29uc3Qgc3RvcHdhdGNoID0gU3RvcFdhdGNoLmNyZWF0ZShmYWxzZSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9zc2hTZXJ2aWNlLmNvbm5lY3Qoe1xuXHRcdFx0XHRcdGhvc3Q6IGNvbm5lY3Rpb24uaG9zdE5hbWUsXG5cdFx0XHRcdFx0cG9ydDogY29ubmVjdGlvbi5wb3J0LFxuXHRcdFx0XHRcdHVzZXJuYW1lOiBjb25uZWN0aW9uLnVzZXIgPz8gY29ubmVjdGlvbi5ob3N0TmFtZSxcblx0XHRcdFx0XHRhdXRoTWV0aG9kOiBTU0hBdXRoTWV0aG9kLkFnZW50LFxuXHRcdFx0XHRcdG5hbWUsXG5cdFx0XHRcdFx0dXNlckluaXRpYXRlZDogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGxvZ1NTSENvbm5lY3RBdHRlbXB0KHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdFx0XHRvcGVyYXRpb246ICdjb25uZWN0Jyxcblx0XHRcdFx0XHR1c2VySW5pdGlhdGVkOiB0cnVlLFxuXHRcdFx0XHRcdGF0dGVtcHQ6IDEsXG5cdFx0XHRcdFx0ZHVyYXRpb25Nczogc3RvcHdhdGNoLmVsYXBzZWQoKSxcblx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdHdpbGxSZXRyeTogZmFsc2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdGxvZ1NTSENvbm5lY3RBdHRlbXB0KHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdFx0XHRvcGVyYXRpb246ICdjb25uZWN0Jyxcblx0XHRcdFx0XHR1c2VySW5pdGlhdGVkOiB0cnVlLFxuXHRcdFx0XHRcdGF0dGVtcHQ6IDEsXG5cdFx0XHRcdFx0ZHVyYXRpb25Nczogc3RvcHdhdGNoLmVsYXBzZWQoKSxcblx0XHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0XHR3aWxsUmV0cnk6IGZhbHNlLFxuXHRcdFx0XHRcdGVycm9yQ2F0ZWdvcnk6IGNhdGVnb3JpemVTU0hDb25uZWN0RXJyb3IoZXJyKSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdTU0hSZWNvbm5lY3RzLmhhcyhzc2hDb25maWdIb3N0KSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fcGVuZGluZ1NTSFJlY29ubmVjdHMuZ2V0KHNzaENvbmZpZ0hvc3QpIS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zc2hSZWNvbm5lY3RTdGF0ZXMuZ2V0KHNzaENvbmZpZ0hvc3QpPy5yZXNldEZvclJlc3VtZSgpO1xuXHRcdGF3YWl0IHRoaXMuX2F0dGVtcHRTU0hSZWNvbm5lY3Qoc3NoQ29uZmlnSG9zdCwgbmFtZSwgYWRkcmVzcywgeyB1c2VySW5pdGlhdGVkOiB0cnVlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZGlzY29ubmVjdFNTSE9uRGVtYW5kKGNvbm5lY3Rpb246IElSZW1vdGVBZ2VudEhvc3RTU0hDb25uZWN0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGNvbm5lY3Rpb24uc3NoQ29uZmlnSG9zdCkge1xuXHRcdFx0dGhpcy5fc3NoUmVjb25uZWN0U3RhdGVzLmRlbGV0ZUFuZERpc3Bvc2UoY29ubmVjdGlvbi5zc2hDb25maWdIb3N0KTtcblx0XHR9XG5cdFx0YXdhaXQgZGlzY29ubmVjdFNTSEVudHJ5KGNvbm5lY3Rpb24sIHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UsIHRoaXMuX3NzaFNlcnZpY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYXR0ZW1wdFNTSFJlY29ubmVjdChzc2hDb25maWdIb3N0OiBzdHJpbmcsIG5hbWU6IHN0cmluZywgYWRkcmVzczogc3RyaW5nLCBvcHRpb25zOiB7IHVzZXJJbml0aWF0ZWQ/OiBib29sZWFuIH0gPSB7fSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2F0dGVtcHRNYW5hZ2VkUmVjb25uZWN0KHtcblx0XHRcdGtpbmQ6ICdTU0gnLFxuXHRcdFx0a2V5OiBzc2hDb25maWdIb3N0LFxuXHRcdFx0YWRkcmVzcyxcblx0XHRcdHVzZXJJbml0aWF0ZWQ6ICEhb3B0aW9ucy51c2VySW5pdGlhdGVkLFxuXHRcdFx0bWF4QXR0ZW1wdHM6IFNTSF9SRUNPTk5FQ1RfTUFYX0FUVEVNUFRTLFxuXHRcdFx0c2hvdWxkUGF1c2U6IHNob3VsZFBhdXNlU1NIUmVjb25uZWN0QWZ0ZXJGYWlsdXJlLFxuXHRcdFx0cGVuZGluZzogdGhpcy5fcGVuZGluZ1NTSFJlY29ubmVjdHMsXG5cdFx0XHRzdGF0ZXM6IHRoaXMuX3NzaFJlY29ubmVjdFN0YXRlcyxcblx0XHRcdGdldE9yQ3JlYXRlU3RhdGU6IGtleSA9PiB0aGlzLl9nZXRPckNyZWF0ZVNTSFJlY29ubmVjdFN0YXRlKGtleSksXG5cdFx0XHQvLyBUaHJlYWQgdXNlckluaXRpYXRlZCB0aHJvdWdoIHRvIHRoZSBhY3R1YWwgcmVjb25uZWN0KCkgY2FsbCwgbm90XG5cdFx0XHQvLyBqdXN0IHRoZSBsb2NhbCBib29ra2VlcGluZyBhYm92ZTogYSBzaWxlbnQvYmFja2dyb3VuZCBhdHRlbXB0XG5cdFx0XHQvLyAodGhlIGRlZmF1bHQgaGVyZSBcdTIwMTQgb3B0aW9ucy51c2VySW5pdGlhdGVkIGlzIG9ubHkgc2V0IGB0cnVlYFxuXHRcdFx0Ly8gYnkgdGhlIG9uLWRlbWFuZCBjb25uZWN0IHBhdGgpIG11c3QgbmV2ZXIgb3BlbiB0aGVcblx0XHRcdC8vIGVuZHBvaW50LXNlbGVjdGlvbiBwaWNrZXIgYW5kIG11c3QgbmV2ZXIgc2lsZW50bHkgYXR0YWNoIHRvIGFuXG5cdFx0XHQvLyBgZWRpdG9yYC1vd25lZCBlbmRwb2ludCwgcGVyIHRoZSBTU0ggc2VydmljZSdzIHNlbGVjdGlvbiBwb2xpY3kuXG5cdFx0XHRkb0Nvbm5lY3Q6ICgpID0+IHRoaXMuX3NzaFNlcnZpY2UucmVjb25uZWN0KHNzaENvbmZpZ0hvc3QsIG5hbWUsICEhb3B0aW9ucy51c2VySW5pdGlhdGVkKS50aGVuKCgpID0+IHVuZGVmaW5lZCksXG5cdFx0XHRzY2hlZHVsZTogc3RhdGUgPT4gdGhpcy5fc2NoZWR1bGVTU0hSZWNvbm5lY3Qoc3NoQ29uZmlnSG9zdCwgbmFtZSwgYWRkcmVzcywgc3RhdGUgYXMgU1NIUmVjb25uZWN0U3RhdGUpLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2NoZWR1bGVTU0hSZWNvbm5lY3Qoc3NoQ29uZmlnSG9zdDogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIGFkZHJlc3M6IHN0cmluZywgc3RhdGU6IFNTSFJlY29ubmVjdFN0YXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgZGVsYXkgPSBNYXRoLm1pbihTU0hfUkVDT05ORUNUX0lOSVRJQUxfREVMQVkgKiBNYXRoLnBvdygyLCBzdGF0ZS5hdHRlbXB0cyAtIDEpLCBTU0hfUkVDT05ORUNUX01BWF9ERUxBWSk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbUmVtb3RlQWdlbnRIb3N0XSBTY2hlZHVsaW5nIFNTSCByZWNvbm5lY3QgZm9yICR7c3NoQ29uZmlnSG9zdH0gaW4gJHtkZWxheX1tcyAoYXR0ZW1wdCAke3N0YXRlLmF0dGVtcHRzICsgMX0vJHtTU0hfUkVDT05ORUNUX01BWF9BVFRFTVBUU30pYCk7XG5cdFx0c3RhdGUuc2NoZWR1bGVSZXRyeShkZWxheSwgKCkgPT4ge1xuXHRcdFx0Ly8gUmUtY2hlY2sgZWxpZ2liaWxpdHkgXHUyMDE0IGNvbmZpZyBtaWdodCBoYXZlIGNoYW5nZWQsIG9yIGEgbWFudWFsXG5cdFx0XHQvLyBjb25uZWN0IG1pZ2h0IGhhdmUgc3VjY2VlZGVkIHdoaWxlIHdlIHdlcmUgd2FpdGluZy5cblx0XHRcdGlmICghdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHRcdHRoaXMuX3NzaFJlY29ubmVjdFN0YXRlcy5kZWxldGVBbmREaXNwb3NlKHNzaENvbmZpZ0hvc3QpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhdXRvQ29ubmVjdCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFJlbW90ZUFnZW50SG9zdEF1dG9Db25uZWN0U2V0dGluZ0lkKTtcblx0XHRcdGlmICghYXV0b0Nvbm5lY3QpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbGl2ZSA9IHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuY29ubmVjdGlvbnMuZmluZChjID0+IGMuYWRkcmVzcyA9PT0gYWRkcmVzcyk7XG5cdFx0XHRpZiAobGl2ZSAmJiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzQ29ubmVjdGVkKGxpdmUuc3RhdHVzKSkge1xuXHRcdFx0XHR0aGlzLl9zc2hSZWNvbm5lY3RTdGF0ZXMuZGVsZXRlQW5kRGlzcG9zZShzc2hDb25maWdIb3N0KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX3BlbmRpbmdTU0hSZWNvbm5lY3RzLmhhcyhzc2hDb25maWdIb3N0KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR2b2lkIHRoaXMuX2F0dGVtcHRTU0hSZWNvbm5lY3Qoc3NoQ29uZmlnSG9zdCwgbmFtZSwgYWRkcmVzcyk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRPckNyZWF0ZVNTSFJlY29ubmVjdFN0YXRlKHNzaENvbmZpZ0hvc3Q6IHN0cmluZyk6IFNTSFJlY29ubmVjdFN0YXRlIHtcblx0XHRsZXQgc3RhdGUgPSB0aGlzLl9zc2hSZWNvbm5lY3RTdGF0ZXMuZ2V0KHNzaENvbmZpZ0hvc3QpO1xuXHRcdGlmICghc3RhdGUpIHtcblx0XHRcdHN0YXRlID0gbmV3IFNTSFJlY29ubmVjdFN0YXRlKCk7XG5cdFx0XHR0aGlzLl9zc2hSZWNvbm5lY3RTdGF0ZXMuc2V0KHNzaENvbmZpZ0hvc3QsIHN0YXRlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHN0YXRlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc3VtZSBTU0ggYXV0by1yZWNvbm5lY3QgZm9yIGFueSBwYXVzZWQgaG9zdHMuIENhbGxlZCBieSB0aGUgcmVjb25jaWxlXG5cdCAqIHBhdGggc28gdGhhdCBhIGZyZXNoIHRyaWdnZXIgKGNvbmZpZyBjaGFuZ2UsIG5ldyBjb25uZWN0aW9uIGV2ZW50KSBnaXZlc1xuXHQgKiBwYXVzZWQgaG9zdHMgYW5vdGhlciBjaGFuY2UuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXN1bWVTU0hSZWNvbm5lY3RzKCk6IHZvaWQge1xuXHRcdGxldCByZXN1bWVkID0gMDtcblx0XHRmb3IgKGNvbnN0IFssIHN0YXRlXSBvZiB0aGlzLl9zc2hSZWNvbm5lY3RTdGF0ZXMpIHtcblx0XHRcdGlmIChzdGF0ZS5yZXN1bWVBdXRvbWF0aWNhbGx5KCkpIHtcblx0XHRcdFx0cmVzdW1lZCsrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAocmVzdW1lZCA+IDApIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1JlbW90ZUFnZW50SG9zdF0gUmVzdW1pbmcgU1NIIGF1dG8tcmVjb25uZWN0IGZvciAke3Jlc3VtZWR9IHBhdXNlZCBob3N0KHMpYCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFNoYXJlZCByZXRyeS1sb29wIGJvZHkgZm9yIFNTSCBtYW5hZ2VkLXJlY29ubmVjdCBlbnRyaWVzLlxuXHQgKlxuXHQgKiBIYW5kbGVzIGBjb25uZWN0aW5nYC9gZGlzY29ubmVjdGVkYC9gaW5jb21wYXRpYmxlYCBwcm92aWRlciBzdGF0dXMsXG5cdCAqIGNhY2hlZC1zZXNzaW9uIHVucHVibGlzaGluZyBvbiBmYWlsdXJlLCBwYXVzZS1vbi1jYW5jZWwsIGFuZFxuXHQgKiBwYXVzZS1hZnRlci1tYXgtYXR0ZW1wdHMuIEFuIG9wdGlvbmFsIHByZS1jaGVjayBjYW4gYmFpbCBvdXQgd2l0aG91dFxuXHQgKiBpbmNyZW1lbnRpbmcgdGhlIGF0dGVtcHQgY291bnRlciAocmV0dXJucyBgeyBza2lwOiB0cnVlIH1gKS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2F0dGVtcHRNYW5hZ2VkUmVjb25uZWN0KG9wdHM6IHtcblx0XHRyZWFkb25seSBraW5kOiAnU1NIJztcblx0XHRyZWFkb25seSBrZXk6IHN0cmluZztcblx0XHRyZWFkb25seSBhZGRyZXNzOiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgdXNlckluaXRpYXRlZDogYm9vbGVhbjtcblx0XHRyZWFkb25seSBtYXhBdHRlbXB0czogbnVtYmVyO1xuXHRcdHJlYWRvbmx5IHNob3VsZFBhdXNlOiAoZXJyOiB1bmtub3duKSA9PiBib29sZWFuO1xuXHRcdHJlYWRvbmx5IHBlbmRpbmc6IE1hcDxzdHJpbmcsIFByb21pc2U8dm9pZD4+O1xuXHRcdHJlYWRvbmx5IHN0YXRlczogRGlzcG9zYWJsZU1hcDxzdHJpbmcsIFNTSFJlY29ubmVjdFN0YXRlPjtcblx0XHRyZWFkb25seSBnZXRPckNyZWF0ZVN0YXRlOiAoa2V5OiBzdHJpbmcpID0+IFNTSFJlY29ubmVjdFN0YXRlO1xuXHRcdHJlYWRvbmx5IHByZUNoZWNrPzogKHVzZXJJbml0aWF0ZWQ6IGJvb2xlYW4pID0+IFByb21pc2U8eyByZWFkb25seSBza2lwOiBib29sZWFuOyByZWFkb25seSByZWFzb24/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZD47XG5cdFx0cmVhZG9ubHkgZG9Db25uZWN0OiAoKSA9PiBQcm9taXNlPHZvaWQ+O1xuXHRcdHJlYWRvbmx5IHNjaGVkdWxlOiAoc3RhdGU6IFNTSFJlY29ubmVjdFN0YXRlKSA9PiB2b2lkO1xuXHR9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gV3JhcCB0aGUgYm9keSBzbyB3ZSBjYW4gc3RvcmUgb3VyIG93biBwcm9taXNlIGluIGBvcHRzLnBlbmRpbmdgIGZvclxuXHRcdC8vIGNvbmN1cnJlbnQgb24tZGVtYW5kIGNhbGxlcnMgdG8gam9pbi4gVGhlIGlubmVyIElJRkUga2VlcHMgdGhlXG5cdFx0Ly8gZXhpc3RpbmcgY29udHJvbCBmbG93IGludGFjdDsgb25seSB0aGUgYm9va2tlZXBpbmcgbW92ZXMgb3V0LlxuXHRcdGNvbnN0IHJ1blByb21pc2UgPSAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBvcHRzLmdldE9yQ3JlYXRlU3RhdGUob3B0cy5rZXkpO1xuXHRcdFx0Y29uc3QgYXR0ZW1wdCA9IHN0YXRlLmF0dGVtcHRzO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9wcm92aWRlckluc3RhbmNlcy5nZXQob3B0cy5hZGRyZXNzKTtcblx0XHRcdGNvbnN0IHN0b3B3YXRjaCA9IFN0b3BXYXRjaC5jcmVhdGUoZmFsc2UpO1xuXHRcdFx0aWYgKG9wdHMudXNlckluaXRpYXRlZCkge1xuXHRcdFx0XHRwcm92aWRlcj8uc2V0Q29ubmVjdGlvblN0YXR1cyhSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RpbmcpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbUmVtb3RlQWdlbnRIb3N0XSBSZS1lc3RhYmxpc2hpbmcgJHtvcHRzLmtpbmR9IGNvbm5lY3Rpb24gZm9yICR7b3B0cy5rZXl9IChhdHRlbXB0ICR7YXR0ZW1wdCArIDF9KWApO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKG9wdHMucHJlQ2hlY2spIHtcblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBvcHRzLnByZUNoZWNrKG9wdHMudXNlckluaXRpYXRlZCk7XG5cdFx0XHRcdFx0aWYgKHJlc3VsdD8uc2tpcCkge1xuXHRcdFx0XHRcdFx0aWYgKHJlc3VsdC5yZWFzb24pIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbUmVtb3RlQWdlbnRIb3N0XSAke29wdHMua2luZH0gcmVjb25uZWN0IGZvciAke29wdHMua2V5fTogJHtyZXN1bHQucmVhc29ufTsgc2tpcHBpbmdgKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgb3B0cy5kb0Nvbm5lY3QoKTtcblx0XHRcdFx0bG9nU1NIQ29ubmVjdEF0dGVtcHQodGhpcy5fdGVsZW1ldHJ5U2VydmljZSwge1xuXHRcdFx0XHRcdG9wZXJhdGlvbjogJ3JlY29ubmVjdCcsXG5cdFx0XHRcdFx0dXNlckluaXRpYXRlZDogb3B0cy51c2VySW5pdGlhdGVkLFxuXHRcdFx0XHRcdGF0dGVtcHQ6IGF0dGVtcHQgKyAxLFxuXHRcdFx0XHRcdGR1cmF0aW9uTXM6IHN0b3B3YXRjaC5lbGFwc2VkKCksXG5cdFx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0XHR3aWxsUmV0cnk6IGZhbHNlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0b3B0cy5zdGF0ZXMuZGVsZXRlQW5kRGlzcG9zZShvcHRzLmtleSk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1JlbW90ZUFnZW50SG9zdF0gJHtvcHRzLmtpbmR9IGNvbm5lY3Rpb24gcmUtZXN0YWJsaXNoZWQgZm9yICR7b3B0cy5rZXl9YCk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0Y29uc3QgZW5hYmxlZCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkKTtcblx0XHRcdFx0Y29uc3QgcGF1c2UgPSBvcHRzLnNob3VsZFBhdXNlKGVycik7XG5cdFx0XHRcdGNvbnN0IGluY29tcGF0aWJsZSA9IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuZnJvbUNvbm5lY3RFcnJvcihlcnIsIFtQUk9UT0NPTF9WRVJTSU9OXSk7XG5cdFx0XHRcdGNvbnN0IHdpbGxSZXRyeSA9IGVuYWJsZWQgJiYgIW9wdHMudXNlckluaXRpYXRlZCAmJiAhcGF1c2UgJiYgIWluY29tcGF0aWJsZSAmJiBhdHRlbXB0ICsgMSA8IG9wdHMubWF4QXR0ZW1wdHM7XG5cdFx0XHRcdGxvZ1NTSENvbm5lY3RBdHRlbXB0KHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdFx0XHRvcGVyYXRpb246ICdyZWNvbm5lY3QnLFxuXHRcdFx0XHRcdHVzZXJJbml0aWF0ZWQ6IG9wdHMudXNlckluaXRpYXRlZCxcblx0XHRcdFx0XHRhdHRlbXB0OiBhdHRlbXB0ICsgMSxcblx0XHRcdFx0XHRkdXJhdGlvbk1zOiBzdG9wd2F0Y2guZWxhcHNlZCgpLFxuXHRcdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRcdHdpbGxSZXRyeSxcblx0XHRcdFx0XHRlcnJvckNhdGVnb3J5OiBjYXRlZ29yaXplU1NIQ29ubmVjdEVycm9yKGVyciksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAoIWVuYWJsZWQpIHtcblx0XHRcdFx0XHRvcHRzLnN0YXRlcy5kZWxldGVBbmREaXNwb3NlKG9wdHMua2V5KTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG9wdHMudXNlckluaXRpYXRlZCkge1xuXHRcdFx0XHRcdHByb3ZpZGVyPy5zZXRDb25uZWN0aW9uU3RhdHVzKFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuZGlzY29ubmVjdGVkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocGF1c2UpIHtcblx0XHRcdFx0XHRjb25zdCByZXF1aXJlc1VzZXJJbml0aWF0ZWRSZXN1bWUgPSBpc1NTSEhvc3RLZXlEZW5pZWRFcnJvcihlcnIpO1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1JlbW90ZUFnZW50SG9zdF0gUGF1c2luZyAke29wdHMua2luZH0gYXV0by1yZWNvbm5lY3QgZm9yICR7b3B0cy5rZXl9IGFmdGVyICR7cmVxdWlyZXNVc2VySW5pdGlhdGVkUmVzdW1lID8gJ2hvc3Qga2V5IGRlbmlhbCcgOiAndXNlciBjYW5jZWxsYXRpb24nfWApO1xuXHRcdFx0XHRcdHByb3ZpZGVyPy51bnB1Ymxpc2hDYWNoZWRTZXNzaW9ucygpO1xuXHRcdFx0XHRcdGNvbnN0IGxpdmVTdGF0ZSA9IG9wdHMuZ2V0T3JDcmVhdGVTdGF0ZShvcHRzLmtleSk7XG5cdFx0XHRcdFx0bGl2ZVN0YXRlLnBhdXNlZCA9IHRydWU7XG5cdFx0XHRcdFx0bGl2ZVN0YXRlLnBhdXNlZEF0ID0gRGF0ZS5ub3coKTtcblx0XHRcdFx0XHRsaXZlU3RhdGUucmVxdWlyZXNVc2VySW5pdGlhdGVkUmVzdW1lID0gcmVxdWlyZXNVc2VySW5pdGlhdGVkUmVzdW1lO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbUmVtb3RlQWdlbnRIb3N0XSAke29wdHMua2luZH0gcmVjb25uZWN0IGZhaWxlZCBmb3IgJHtvcHRzLmtleX1gLCBlcnIpO1xuXHRcdFx0XHQvLyBTdXJmYWNlIHByb3RvY29sLXZlcnNpb24gbWlzbWF0Y2hlcyBvbiB0aGUgcHJvdmlkZXIgc28gdGhlXG5cdFx0XHRcdC8vIHdvcmtzcGFjZSBwaWNrZXIgY2FuIHNob3cgdGhlIGhvc3QncyBtZXNzYWdlIGFuZCB0aGUgdXNlclxuXHRcdFx0XHQvLyBjYW4gcmVhZCBpdC4gT3RoZXIgZXJyb3JzIHN0YXkgYXMgdGhlIGV4aXN0aW5nIGRpc2Nvbm5lY3RlZFxuXHRcdFx0XHQvLyBzdGF0ZS5cblx0XHRcdFx0aWYgKGluY29tcGF0aWJsZSkge1xuXHRcdFx0XHRcdHByb3ZpZGVyPy5zZXRDb25uZWN0aW9uU3RhdHVzKGluY29tcGF0aWJsZSk7XG5cdFx0XHRcdFx0Ly8gRG9uJ3Qga2VlcCByZXRyeWluZyBvbiBpbmNvbXBhdGlibGUgXHUyMDE0IHVzZXIgbmVlZHMgdG9cblx0XHRcdFx0XHQvLyB1cGdyYWRlL2Rvd25ncmFkZS4gRHJvcCByZXRyeSBzdGF0ZSBpbnN0ZWFkIG9mIHBhdXNpbmcuXG5cdFx0XHRcdFx0b3B0cy5zdGF0ZXMuZGVsZXRlQW5kRGlzcG9zZShvcHRzLmtleSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEhvc3QgaXMgdW5yZWFjaGFibGUgXHUyMDE0IHVucHVibGlzaCBhbnkgY2FjaGVkIHNlc3Npb25zIHdlXG5cdFx0XHRcdC8vIHdlcmUgc2hvd2luZyBzbyB0aGUgVUkgZG9lc24ndCBsaXN0IHN0YWxlIGVudHJpZXMgZm9yIGFcblx0XHRcdFx0Ly8gaG9zdCB3ZSBjYW5ub3QgY3VycmVudGx5IHJlYWNoLlxuXHRcdFx0XHRwcm92aWRlcj8udW5wdWJsaXNoQ2FjaGVkU2Vzc2lvbnMoKTtcblx0XHRcdFx0Ly8gU3RhdGUgbWF5IGhhdmUgYmVlbiBjbGVhcmVkIChlLmcuIGhvc3QgcmVtb3ZlZCkgd2hpbGUgdGhlXG5cdFx0XHRcdC8vIHJlY29ubmVjdCB3YXMgaW4gZmxpZ2h0IFx1MjAxNCByZS1yZXNvbHZlIHRvIGJlIHNhZmUuXG5cdFx0XHRcdGNvbnN0IGxpdmVTdGF0ZSA9IG9wdHMuZ2V0T3JDcmVhdGVTdGF0ZShvcHRzLmtleSk7XG5cdFx0XHRcdGxpdmVTdGF0ZS5hdHRlbXB0cyA9IGF0dGVtcHQgKyAxO1xuXHRcdFx0XHRpZiAobGl2ZVN0YXRlLmF0dGVtcHRzID49IG9wdHMubWF4QXR0ZW1wdHMpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtSZW1vdGVBZ2VudEhvc3RdIFBhdXNpbmcgJHtvcHRzLmtpbmR9IGF1dG8tcmVjb25uZWN0IGZvciAke29wdHMua2V5fSBhZnRlciAke2xpdmVTdGF0ZS5hdHRlbXB0c30gY29uc2VjdXRpdmUgZmFpbHVyZXNgKTtcblx0XHRcdFx0XHRsaXZlU3RhdGUucGF1c2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRsaXZlU3RhdGUucGF1c2VkQXQgPSBEYXRlLm5vdygpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAob3B0cy51c2VySW5pdGlhdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG9wdHMuc2NoZWR1bGUobGl2ZVN0YXRlKTtcblx0XHRcdH1cblx0XHR9KSgpO1xuXHRcdG9wdHMucGVuZGluZy5zZXQob3B0cy5rZXksIHJ1blByb21pc2UpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBydW5Qcm9taXNlO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRvcHRzLnBlbmRpbmcuZGVsZXRlKG9wdHMua2V5KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWNvbmNpbGVDb25uZWN0aW9ucygpOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50Q29ubmVjdGlvbnMgPSB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbm5lY3Rpb25zO1xuXHRcdGNvbnN0IGNvbm5lY3RlZEFkZHJlc3NlcyA9IG5ldyBTZXQoXG5cdFx0XHRjdXJyZW50Q29ubmVjdGlvbnNcblx0XHRcdFx0LmZpbHRlcihjID0+IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNDb25uZWN0ZWQoYy5zdGF0dXMpKVxuXHRcdFx0XHQubWFwKGMgPT4gYy5hZGRyZXNzKVxuXHRcdCk7XG5cdFx0Y29uc3QgYWxsQWRkcmVzc2VzID0gbmV3IFNldChjdXJyZW50Q29ubmVjdGlvbnMubWFwKGMgPT4gYy5hZGRyZXNzKSk7XG5cblx0XHQvLyBSZW1vdmUgY29udHJpYnV0aW9uIHN0YXRlIGZvciBjb25uZWN0aW9ucyB0aGF0IGFyZSBubyBsb25nZXIgcHJlc2VudCBhdCBhbGxcblx0XHRmb3IgKGNvbnN0IFthZGRyZXNzXSBvZiB0aGlzLl9jb25uZWN0aW9ucykge1xuXHRcdFx0aWYgKCFhbGxBZGRyZXNzZXMuaGFzKGFkZHJlc3MpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1JlbW90ZUFnZW50SG9zdF0gUmVtb3ZpbmcgY29udHJpYnV0aW9uIGZvciAke2FkZHJlc3N9YCk7XG5cdFx0XHRcdHRoaXMuX3Byb3ZpZGVySW5zdGFuY2VzLmdldChhZGRyZXNzKT8uY2xlYXJDb25uZWN0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX2Nvbm5lY3Rpb25zLmRlbGV0ZUFuZERpc3Bvc2UoYWRkcmVzcyk7XG5cdFx0XHR9IGVsc2UgaWYgKCFjb25uZWN0ZWRBZGRyZXNzZXMuaGFzKGFkZHJlc3MpKSB7XG5cdFx0XHRcdC8vIENvbm5lY3Rpb24gZXhpc3RzIGJ1dCBpcyBub3QgY29ubmVjdGVkIChyZWNvbm5lY3Rpbmcgb3IgZGlzY29ubmVjdGVkKS5cblx0XHRcdFx0Ly8gS2VlcCB0aGUgY29udHJpYnV0aW9uIHN0YXRlIGJ1dCBkb24ndCBjbGVhciB0aGUgcHJvdmlkZXIgXHUyMDE0XG5cdFx0XHRcdC8vIHRoZSBzZXNzaW9uIGNhY2hlIGlzIHByZXNlcnZlZCBkdXJpbmcgcmVjb25uZWN0LlxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFkZCBvciB1cGRhdGUgY29ubmVjdGlvbnNcblx0XHRmb3IgKGNvbnN0IGNvbm5lY3Rpb25JbmZvIG9mIGN1cnJlbnRDb25uZWN0aW9ucykge1xuXHRcdFx0Ly8gT25seSBzZXQgdXAgY29udHJpYnV0aW9uIHN0YXRlIGZvciBjb25uZWN0ZWQgZW50cmllc1xuXHRcdFx0aWYgKCFSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzQ29ubmVjdGVkKGNvbm5lY3Rpb25JbmZvLnN0YXR1cykpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX2Nvbm5lY3Rpb25zLmdldChjb25uZWN0aW9uSW5mby5hZGRyZXNzKTtcblx0XHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0XHRjb25zdCBuYW1lQ2hhbmdlZCA9IGV4aXN0aW5nLm5hbWUgIT09IGNvbm5lY3Rpb25JbmZvLm5hbWU7XG5cdFx0XHRcdGNvbnN0IGNsaWVudElkQ2hhbmdlZCA9IGV4aXN0aW5nLmNvbm5lY3Rpb24uY2xpZW50SWQgIT09IGNvbm5lY3Rpb25JbmZvLmNsaWVudElkO1xuXG5cdFx0XHRcdC8vIElmIHRoZSBuYW1lIG9yIGNsaWVudElkIGNoYW5nZWQsIHRlYXIgZG93biBhbmQgcmUtcmVnaXN0ZXJcblx0XHRcdFx0aWYgKG5hbWVDaGFuZ2VkIHx8IGNsaWVudElkQ2hhbmdlZCkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1JlbW90ZUFnZW50SG9zdF0gUmVjb25uZWN0aW5nIGNvbnRyaWJ1dGlvbiBmb3IgJHtjb25uZWN0aW9uSW5mby5hZGRyZXNzfTogb2xkQ2xpZW50SWQ9JHtleGlzdGluZy5jb25uZWN0aW9uLmNsaWVudElkfSwgbmV3Q2xpZW50SWQ9JHtjb25uZWN0aW9uSW5mby5jbGllbnRJZH0sIG5hbWVDaGFuZ2VkPSR7bmFtZUNoYW5nZWR9YCk7XG5cdFx0XHRcdFx0Y29uc3Qgb2xkQ2xpZW50SWQgPSBleGlzdGluZy5jb25uZWN0aW9uLmNsaWVudElkO1xuXHRcdFx0XHRcdHRoaXMuX2Nvbm5lY3Rpb25zLmRlbGV0ZUFuZERpc3Bvc2UoY29ubmVjdGlvbkluZm8uYWRkcmVzcyk7XG5cdFx0XHRcdFx0dGhpcy5fc2V0dXBDb25uZWN0aW9uKGNvbm5lY3Rpb25JbmZvKTtcblxuXHRcdFx0XHRcdC8vIFJlY29ubmVjdCBhY3RpdmUgdGVybWluYWxzIG9ubHkgd2hlbiB0aGUgYmFja2luZ1xuXHRcdFx0XHRcdC8vIGNsaWVudCBjaGFuZ2VkLiBOYW1lLW9ubHkgdXBkYXRlcyBkb24ndCBpbnZhbGlkYXRlXG5cdFx0XHRcdFx0Ly8gc3Vic2NyaXB0aW9ucyBhbmQgd291bGQgY2F1c2UgdW5uZWNlc3NhcnkgYnVmZmVyXG5cdFx0XHRcdFx0Ly8gY2xlYXIvcmVwbGF5IGZsaWNrZXIuXG5cdFx0XHRcdFx0aWYgKGNsaWVudElkQ2hhbmdlZCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbmV3Q29ubmVjdGlvbiA9IHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuZ2V0Q29ubmVjdGlvbihjb25uZWN0aW9uSW5mby5hZGRyZXNzKTtcblx0XHRcdFx0XHRcdGlmIChuZXdDb25uZWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2FnZW50SG9zdFRlcm1pbmFsU2VydmljZS5yZWNvbm5lY3RUZXJtaW5hbHMobmV3Q29ubmVjdGlvbiwgb2xkQ2xpZW50SWQpLnRoZW4oXG5cdFx0XHRcdFx0XHRcdFx0KHsgcmVjb3ZlcmVkLCB0b3RhbCB9KSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAodG90YWwgPiAwKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1JlbW90ZUFnZW50SG9zdF0gVGVybWluYWwgcmVjb25uZWN0aW9uOiAke3JlY292ZXJlZH0vJHt0b3RhbH0gcmVjb3ZlcmVkYCk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGxvZ1Rlcm1pbmFsUmVjb3ZlcnkodGhpcy5fdGVsZW1ldHJ5U2VydmljZSwgeyByZWNvdmVyZWRDb3VudDogcmVjb3ZlcmVkLCB0b3RhbENvdW50OiB0b3RhbCB9KTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdGVyciA9PiB0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1tSZW1vdGVBZ2VudEhvc3RdIFRlcm1pbmFsIHJlY29ubmVjdGlvbiBmYWlsZWQnLCBlcnIpXG5cdFx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9zZXR1cENvbm5lY3Rpb24oY29ubmVjdGlvbkluZm8pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldHVwQ29ubmVjdGlvbihjb25uZWN0aW9uSW5mbzogSVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25JbmZvKTogdm9pZCB7XG5cdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuZ2V0Q29ubmVjdGlvbihjb25uZWN0aW9uSW5mby5hZGRyZXNzKTtcblx0XHRpZiAoIWNvbm5lY3Rpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IGFkZHJlc3MsIG5hbWUgfSA9IGNvbm5lY3Rpb25JbmZvO1xuXHRcdGNvbnN0IGNvbm5TdGF0ZSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbm5lY3Rpb25TdGF0ZSwgbmFtZSwgY29ubmVjdGlvbik7XG5cdFx0dGhpcy5fY29ubmVjdGlvbnMuc2V0KGFkZHJlc3MsIGNvbm5TdGF0ZSk7XG5cdFx0Y29uc3Qgc3RvcmUgPSBjb25uU3RhdGUuc3RvcmU7XG5cblx0XHQvLyBCcmlkZ2UgdGhlIGhvc3QncyBPVExQIGxvZ3MgY2hhbm5lbCBpbnRvIGEgZGVkaWNhdGVkIHdvcmtiZW5jaFxuXHRcdC8vIE91dHB1dCBjaGFubmVsIChgQWdlbnQgSG9zdCAoJHtuYW1lfSlgKS4gQ29uY3JldGUgY2xpZW50c1xuXHRcdC8vIHJldHVybmVkIGJ5IGBJUmVtb3RlQWdlbnRIb3N0U2VydmljZS5nZXRDb25uZWN0aW9uYCBhcmUgYWx3YXlzXG5cdFx0Ly8gYFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50YCBpbnN0YW5jZXMgXHUyMDE0IGBJQWdlbnRDb25uZWN0aW9uYFxuXHRcdC8vIGVyYXNlcyB0aGUgY29uY3JldGUgdHlwZSwgc28gY2FzdCBoZXJlIGF0IHRoZSBpbnRlZ3JhdGlvblxuXHRcdC8vIHBvaW50IHJhdGhlciB0aGFuIHBvbGx1dGluZyB0aGF0IGludGVyZmFjZSB3aXRoIE9UTFAtc3BlY2lmaWNcblx0XHQvLyBzdXJmYWNlLlxuXHRcdHN0b3JlLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFJlbW90ZUFnZW50SG9zdExvZ0ZvcndhcmRlcixcblx0XHRcdGNvbm5lY3Rpb24gYXMgUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQsXG5cdFx0XHRhZGRyZXNzLFxuXHRcdFx0bmFtZSB8fCBhZGRyZXNzLFxuXHRcdCkpO1xuXG5cdFx0Ly8gVHJhY2sgYXV0aG9yaXR5IC0+IGNvbm5lY3Rpb24gbWFwcGluZyBmb3IgRlMgcHJvdmlkZXIgcm91dGluZ1xuXHRcdGNvbnN0IGF1dGhvcml0eSA9IGFnZW50SG9zdEF1dGhvcml0eShhZGRyZXNzKTtcblx0XHRzdG9yZS5hZGQodGhpcy5fYWdlbnRIb3N0RmlsZVN5c3RlbVNlcnZpY2UucmVnaXN0ZXJBdXRob3JpdHkoYXV0aG9yaXR5LCBjb25uZWN0aW9uKSk7XG5cblx0XHQvLyBSZWFjdCB0byByb290IHN0YXRlIGNoYW5nZXMgKGFnZW50IGRpc2NvdmVyeSlcblx0XHRzdG9yZS5hZGQoY29ubmVjdGlvbi5yb290U3RhdGUub25EaWRDaGFuZ2Uocm9vdFN0YXRlID0+IHtcblx0XHRcdHRoaXMuX2hhbmRsZVJvb3RTdGF0ZUNoYW5nZShhZGRyZXNzLCBjb25uZWN0aW9uLCByb290U3RhdGUpO1xuXHRcdH0pKTtcblx0XHRzdG9yZS5hZGQoY29ubmVjdGlvbi5vbkRpZE5vdGlmaWNhdGlvbihub3RpZmljYXRpb24gPT4gdGhpcy5faGFuZGxlQXV0aGVudGljYXRpb25SZXF1aXJlZE5vdGlmaWNhdGlvbihhZGRyZXNzLCBjb25uZWN0aW9uLCBub3RpZmljYXRpb24pKSk7XG5cblx0XHQvLyBJZiByb290IHN0YXRlIGlzIGFscmVhZHkgYXZhaWxhYmxlLCBwcm9jZXNzIGl0IGltbWVkaWF0ZWx5XG5cdFx0Y29uc3QgaW5pdGlhbFJvb3RTdGF0ZSA9IGNvbm5lY3Rpb24ucm9vdFN0YXRlLnZhbHVlO1xuXHRcdGlmIChpbml0aWFsUm9vdFN0YXRlICYmICEoaW5pdGlhbFJvb3RTdGF0ZSBpbnN0YW5jZW9mIEVycm9yKSkge1xuXHRcdFx0dGhpcy5faGFuZGxlUm9vdFN0YXRlQ2hhbmdlKGFkZHJlc3MsIGNvbm5lY3Rpb24sIGluaXRpYWxSb290U3RhdGUpO1xuXHRcdH1cblxuXHRcdC8vIFdpcmUgY29ubmVjdGlvbiB0byBleGlzdGluZyBzZXNzaW9ucyBwcm92aWRlclxuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fcHJvdmlkZXJJbnN0YW5jZXMuZ2V0KGFkZHJlc3MpO1xuXHRcdGlmIChwcm92aWRlcikge1xuXHRcdFx0cHJvdmlkZXIuc2V0Q29ubmVjdGlvbihjb25uZWN0aW9uLCBjb25uZWN0aW9uSW5mby5kZWZhdWx0RGlyZWN0b3J5KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVSb290U3RhdGVDaGFuZ2UoYWRkcmVzczogc3RyaW5nLCBjb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uLCByb290U3RhdGU6IFJvb3RTdGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbm5TdGF0ZSA9IHRoaXMuX2Nvbm5lY3Rpb25zLmdldChhZGRyZXNzKTtcblx0XHRpZiAoIWNvbm5TdGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluY29taW5nID0gbmV3IFNldChyb290U3RhdGUuYWdlbnRzLm1hcChhID0+IGEucHJvdmlkZXIpKTtcblxuXHRcdC8vIFJlbW92ZSBhZ2VudHMgbm8gbG9uZ2VyIHByZXNlbnRcblx0XHRmb3IgKGNvbnN0IFtwcm92aWRlcl0gb2YgY29ublN0YXRlLmFnZW50cykge1xuXHRcdFx0aWYgKCFpbmNvbWluZy5oYXMocHJvdmlkZXIpKSB7XG5cdFx0XHRcdGNvbm5TdGF0ZS5hZ2VudHMuZGVsZXRlQW5kRGlzcG9zZShwcm92aWRlcik7XG5cdFx0XHRcdGNvbm5TdGF0ZS5tb2RlbFByb3ZpZGVycy5kZWxldGUocHJvdmlkZXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEF1dGhlbnRpY2F0ZSB1c2luZyBwcm90ZWN0ZWRSZXNvdXJjZXMgZnJvbSBhZ2VudCBpbmZvXG5cdFx0dGhpcy5fYXV0aGVudGljYXRlV2l0aENvbm5lY3Rpb24oYWRkcmVzcywgY29ubmVjdGlvbiwgcm9vdFN0YXRlLmFnZW50cylcblx0XHRcdC5jYXRjaCgoKSA9PiB7IC8qIGJlc3QtZWZmb3J0ICovIH0pO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgbmV3IGFnZW50cywgcHVzaCBtb2RlbCB1cGRhdGVzIHRvIGV4aXN0aW5nIG9uZXNcblx0XHRmb3IgKGNvbnN0IGFnZW50IG9mIHJvb3RTdGF0ZS5hZ2VudHMpIHtcblx0XHRcdGlmICghY29ublN0YXRlLmFnZW50cy5oYXMoYWdlbnQucHJvdmlkZXIpKSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyQWdlbnQoYWRkcmVzcywgY29ubmVjdGlvbiwgYWdlbnQsIGNvbm5TdGF0ZS5uYW1lKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsUHJvdmlkZXIgPSBjb25uU3RhdGUubW9kZWxQcm92aWRlcnMuZ2V0KGFnZW50LnByb3ZpZGVyKTtcblx0XHRcdFx0bW9kZWxQcm92aWRlcj8udXBkYXRlTW9kZWxzKGFnZW50Lm1vZGVscyk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJBZ2VudChhZGRyZXNzOiBzdHJpbmcsIGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIGFnZW50OiBBZ2VudEluZm8sIGNvbmZpZ3VyZWROYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBjb25uU3RhdGUgPSB0aGlzLl9jb25uZWN0aW9ucy5nZXQoYWRkcmVzcyk7XG5cdFx0aWYgKCFjb25uU3RhdGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhZ2VudFN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbm5TdGF0ZS5hZ2VudHMuc2V0KGFnZW50LnByb3ZpZGVyLCBhZ2VudFN0b3JlKTtcblx0XHRjb25uU3RhdGUuc3RvcmUuYWRkKGFnZW50U3RvcmUpO1xuXG5cdFx0Y29uc3Qgc2FuaXRpemVkID0gYWdlbnRIb3N0QXV0aG9yaXR5KGFkZHJlc3MpO1xuXHRcdGNvbnN0IHByb3ZpZGVySWQgPSBgYWdlbnRob3N0LSR7c2FuaXRpemVkfWA7XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSByZW1vdGVBZ2VudEhvc3RTZXNzaW9uVHlwZUlkKHNhbml0aXplZCwgYWdlbnQucHJvdmlkZXIpO1xuXHRcdGNvbnN0IGFnZW50SWQgPSBzZXNzaW9uVHlwZTtcblx0XHRjb25zdCB2ZW5kb3IgPSBzZXNzaW9uVHlwZTtcblxuXHRcdC8vIFVzZXItZmFjaW5nIGRpc3BsYXkgbmFtZSBmb3IgdGhpcyBhZ2VudC4gV2UgYWx3YXlzIGluY2x1ZGUgdGhlXG5cdFx0Ly8gYWdlbnQncyBvd24gbmFtZSBzbyB0aGF0IGEgaG9zdCBleHBvc2luZyBtdWx0aXBsZSBhZ2VudHMgKGUuZy5cblx0XHQvLyBgY29waWxvdGAgKyBgb3BlbmFpYCBmcm9tIHRoZSBzYW1lIG1hY2hpbmUpIHByb2R1Y2VzIGRpc3RpbmN0XG5cdFx0Ly8gbGFiZWxzIGluc3RlYWQgb2YgY29sbGFwc2luZyB0byBhIHNpbmdsZSBgY29uZmlndXJlZE5hbWVgLlxuXHRcdGNvbnN0IGhvc3RMYWJlbCA9IGNvbmZpZ3VyZWROYW1lIHx8IGFkZHJlc3M7XG5cdFx0Y29uc3QgYWdlbnRMYWJlbCA9IGFnZW50LmRpc3BsYXlOYW1lPy50cmltKCkgfHwgYWdlbnQucHJvdmlkZXI7XG5cdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBgJHthZ2VudExhYmVsfSBbJHtob3N0TGFiZWx9XWA7XG5cblx0XHQvLyBQZXItYWdlbnQgd29ya2luZyBkaXJlY3RvcnkgY2FjaGUsIHNjb3BlZCB0byB0aGUgYWdlbnQgc3RvcmUgbGlmZXRpbWVcblx0XHRjb25zdCBzZXNzaW9uV29ya2luZ0RpcnMgPSBuZXcgTWFwPHN0cmluZywgVVJJPigpO1xuXHRcdGFnZW50U3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBzZXNzaW9uV29ya2luZ0RpcnMuY2xlYXIoKSkpO1xuXG5cdFx0Ly8gQ2FwdHVyZSB0aGUgd29ya2luZyBkaXJlY3RvcnkgZnJvbSB0aGUgc2Vzc2lvbiB0aGF0IGlzIGJlaW5nIGNyZWF0ZWQuXG5cdFx0Y29uc3QgcmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnkgPSAoc2Vzc2lvblJlc291cmNlOiBVUkkpOiBVUkkgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VLZXkgPSBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGNhY2hlZCA9IHNlc3Npb25Xb3JraW5nRGlycy5nZXQocmVzb3VyY2VLZXkpO1xuXHRcdFx0aWYgKGNhY2hlZCkge1xuXHRcdFx0XHRyZXR1cm4gY2FjaGVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXI8UmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlcj4ocHJvdmlkZXJJZCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXI/LmdldFNlc3Npb25CeVJlc291cmNlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gc2Vzc2lvbj8ud29ya3NwYWNlLmdldCgpPy5mb2xkZXJzWzBdPy53b3JraW5nRGlyZWN0b3J5O1xuXHRcdFx0aWYgKHdvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdFx0c2Vzc2lvbldvcmtpbmdEaXJzLnNldChyZXNvdXJjZUtleSwgd29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHRcdHJldHVybiB3b3JraW5nRGlyZWN0b3J5O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9O1xuXHRcdGNvbnN0IGlzTmV3U2Vzc2lvbiA9IChzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4gPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXI8UmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlcj4ocHJvdmlkZXJJZCk7XG5cdFx0XHRyZXR1cm4gcHJvdmlkZXI/LmdldFNlc3Npb25CeVJlc291cmNlKHNlc3Npb25SZXNvdXJjZSk/LnN0YXR1cy5nZXQoKSA9PT0gU2Vzc2lvblN0YXR1cy5VbnRpdGxlZDtcblx0XHR9O1xuXG5cdFx0Ly8gQ2hhdCBzZXNzaW9uIGNvbnRyaWJ1dGlvblxuXHRcdGFnZW50U3RvcmUuYWRkKHRoaXMuX2NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbih7XG5cdFx0XHR0eXBlOiBzZXNzaW9uVHlwZSxcblx0XHRcdG5hbWU6IGFnZW50SWQsXG5cdFx0XHRkaXNwbGF5TmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBhZ2VudC5kZXNjcmlwdGlvbixcblx0XHRcdGNhbkRlbGVnYXRlOiB0cnVlLFxuXHRcdFx0cmVxdWlyZXNDdXN0b21Nb2RlbHM6IHRydWUsXG5cdFx0XHRzdXBwb3J0c0F1dG9Nb2RlbDogYWdlbnRIb3N0UHJvdmlkZXJTdXBwb3J0c0F1dG9Nb2RlbChhZ2VudC5wcm92aWRlciksXG5cdFx0XHRhZ2VudEhvc3RQcm92aWRlcklkOiBhZ2VudC5wcm92aWRlcixcblx0XHRcdHN1cHBvcnRzRGVsZWdhdGlvbjogdHJ1ZSxcblx0XHRcdGNhcGFiaWxpdGllczoge1xuXHRcdFx0XHRzdXBwb3J0c0NoZWNrcG9pbnRzOiB0cnVlLFxuXHRcdFx0XHRzdXBwb3J0c1Byb21wdEF0dGFjaG1lbnRzOiB0cnVlLFxuXHRcdFx0XHRzdXBwb3J0c0ltYWdlQXR0YWNobWVudHM6IHRydWUsXG5cdFx0XHRcdGdldCB0ZXJtaW5hbENvbW1hbmRQcmVmaXgoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGNvbm5lY3Rpb24uaW5pdGlhbGl6ZVJlc3VsdC5nZXQoKT8udGVybWluYWxDb21tYW5kUHJlZml4O1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdC8vIEN1c3RvbWl6YXRpb24gaGFybmVzcyBmb3IgdGhpcyByZW1vdGUgYWdlbnRcblx0XHRjb25zdCBwbHVnaW5Db250cm9sbGVyID0gYWdlbnRTdG9yZS5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVtb3RlQWdlbnRQbHVnaW5Db250cm9sbGVyLFxuXHRcdFx0aG9zdExhYmVsLFxuXHRcdFx0c2FuaXRpemVkLFxuXHRcdFx0Y29ubmVjdGlvbixcblx0XHQpKTtcblxuXHRcdGNvbnN0IGFnZW50UmVnaXN0cmF0aW9uID0gYWdlbnRTdG9yZS5hZGQodGhpcy5fYWN0aXZlQ2xpZW50U2VydmljZS5yZWdpc3RlckZvckFnZW50KHNlc3Npb25UeXBlLCB7IGluY2x1ZGVVc2VyU3RvcmFnZTogdHJ1ZSB9KSk7XG5cdFx0Y29uc3Qgc3luY1Byb3ZpZGVyID0gYWdlbnRSZWdpc3RyYXRpb24uc3luY1Byb3ZpZGVyO1xuXHRcdC8vIFRoZSBtYW5hZ2VtZW50IFVJIHJlbWFpbnMgYW1iaWVudCB3aGlsZSBpbmRpdmlkdWFsIHNlc3Npb25zIHVzZSB0aGVpciB3b3JraW5nLWRpcmVjdG9yeSBzY29wZXMuXG5cdFx0Y29uc3QgYW1iaWVudFNjb3BlID0gYWdlbnRTdG9yZS5hZGQoYWdlbnRSZWdpc3RyYXRpb24uYWNxdWlyZVNjb3BlKFtdKSk7XG5cblx0XHRjb25zdCBpdGVtUHJvdmlkZXIgPSBhZ2VudFN0b3JlLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIsXG5cdFx0XHRzYW5pdGl6ZWQsXG5cdFx0XHQoY3VzdG9taXphdGlvbiwgY2xpZW50SWQpID0+IHtcblx0XHRcdFx0aWYgKGNsaWVudElkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHQvLyBDdXN0b21pemF0aW9uIGNhbWUgZnJvbSB0aGUgY2xpZW50OyB3ZSBkb24ndCBhbGxvdyBhY3Rpb25zIG9uIHRoZXNlIHNpbmNlIHRoZXkncmUgcmVhZC1vbmx5IHJlZmxlY3Rpb25zIG9mIGNsaWVudCBzdGF0ZS5cblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRcdGlkOiAncmVtb3RlQWdlbnRIb3N0LnJlbW92ZUNvbmZpZ3VyZWRQbHVnaW4nLFxuXHRcdFx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ3JlbW90ZUFnZW50SG9zdC5yZW1vdmVDb25maWd1cmVkUGx1Z2luJywgXCJSZW1vdmUgZnJvbSBSZW1vdGUgSG9zdFwiKSxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLnRyYXNoLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gcGx1Z2luQ29udHJvbGxlci5yZW1vdmVDb25maWd1cmVkUGx1Z2luKGN1c3RvbWl6YXRpb24pLFxuXHRcdFx0XHR9XTtcblx0XHRcdH0sXG5cdFx0XHRzeW5jZWRVcmkgPT4gYWdlbnRSZWdpc3RyYXRpb24uZ2V0T3JpZ2luKHN5bmNlZFVyaSlcblx0XHQpKTtcblx0XHRpdGVtUHJvdmlkZXIuc2V0RHJhZnRDdXN0b21BZ2VudHMoYW1iaWVudFNjb3BlLmN1c3RvbUFnZW50cyk7XG5cdFx0aXRlbVByb3ZpZGVyLnNldERyYWZ0Q3VzdG9taXphdGlvbnMoYW1iaWVudFNjb3BlLmN1c3RvbWl6YXRpb25zKTtcblxuXHRcdGNvbnN0IGhhcm5lc3NEZXNjcmlwdG9yID0gY3JlYXRlUmVtb3RlQWdlbnRIYXJuZXNzRGVzY3JpcHRvcihzZXNzaW9uVHlwZSwgZGlzcGxheU5hbWUsIHBsdWdpbkNvbnRyb2xsZXIsIGl0ZW1Qcm92aWRlciwgc3luY1Byb3ZpZGVyKTtcblx0XHRhZ2VudFN0b3JlLmFkZCh0aGlzLl9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UucmVnaXN0ZXJFeHRlcm5hbEhhcm5lc3MoaGFybmVzc0Rlc2NyaXB0b3IpKTtcblxuXHRcdC8vIFNlc3Npb24gaGFuZGxlciAodW5pZmllZClcblx0XHRjb25zdCBzZXNzaW9uSGFuZGxlciA9IGFnZW50U3RvcmUuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0QWdlbnRIb3N0U2Vzc2lvbkhhbmRsZXIsIHtcblx0XHRcdHByb3ZpZGVyOiBhZ2VudC5wcm92aWRlcixcblx0XHRcdGJhY2tlbmRTZXNzaW9uU2NoZW1lOiB0aGlzLl9jb25uZWN0aW9uQ3VzdG9taXphdGlvbnMuZ2V0KGFkZHJlc3MpPy5iYWNrZW5kU2Vzc2lvblNjaGVtZT8uKGFnZW50LnByb3ZpZGVyKSxcblx0XHRcdGFnZW50SWQsXG5cdFx0XHRzZXNzaW9uVHlwZSxcblx0XHRcdGZ1bGxOYW1lOiBkaXNwbGF5TmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBhZ2VudC5kZXNjcmlwdGlvbixcblx0XHRcdGNvbm5lY3Rpb24sXG5cdFx0XHRjb25uZWN0aW9uQXV0aG9yaXR5OiBzYW5pdGl6ZWQsXG5cdFx0XHRleHRlbnNpb25JZDogJ3ZzY29kZS5yZW1vdGUtYWdlbnQtaG9zdCcsXG5cdFx0XHRleHRlbnNpb25EaXNwbGF5TmFtZTogJ1JlbW90ZSBBZ2VudCBIb3N0Jyxcblx0XHRcdHJlc29sdmVXb3JraW5nRGlyZWN0b3J5LFxuXHRcdFx0aXNOZXdTZXNzaW9uLFxuXHRcdFx0cmVzb2x2ZUF1dGhlbnRpY2F0aW9uOiAocmVzb3VyY2VzKSA9PiB0aGlzLl9yZXNvbHZlQXV0aGVudGljYXRpb25JbnRlcmFjdGl2ZWx5KGFkZHJlc3MsIGNvbm5lY3Rpb24sIHJlc291cmNlcyksXG5cdFx0fSkpO1xuXHRcdGFnZW50U3RvcmUuYWRkKHRoaXMuX2NoYXRTZXNzaW9uc1NlcnZpY2UucmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcihzZXNzaW9uVHlwZSwgc2Vzc2lvbkhhbmRsZXIpKTtcblxuXHRcdC8vIExhbmd1YWdlIG1vZGVsIHByb3ZpZGVyLlxuXHRcdC8vIE9yZGVyIG1hdHRlcnM6IGB1cGRhdGVNb2RlbHNgIG11c3QgYmUgY2FsbGVkIGFmdGVyXG5cdFx0Ly8gYHJlZ2lzdGVyTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyYCBzbyB0aGUgaW5pdGlhbCBgb25EaWRDaGFuZ2VgIGlzIG9ic2VydmVkLlxuXHRcdGNvbnN0IHZlbmRvckRlc2NyaXB0b3IgPSB7IHZlbmRvciwgZGlzcGxheU5hbWUsIGNvbmZpZ3VyYXRpb246IHVuZGVmaW5lZCwgbWFuYWdlbWVudENvbW1hbmQ6IHVuZGVmaW5lZCwgd2hlbjogdW5kZWZpbmVkIH07XG5cdFx0dGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmRlbHRhTGFuZ3VhZ2VNb2RlbENoYXRQcm92aWRlckRlc2NyaXB0b3JzKFt2ZW5kb3JEZXNjcmlwdG9yXSwgW10pO1xuXHRcdGFnZW50U3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZGVsdGFMYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyRGVzY3JpcHRvcnMoW10sIFt2ZW5kb3JEZXNjcmlwdG9yXSkpKTtcblx0XHRjb25zdCBtb2RlbFByb3ZpZGVyID0gYWdlbnRTdG9yZS5hZGQobmV3IEFnZW50SG9zdExhbmd1YWdlTW9kZWxQcm92aWRlcihzZXNzaW9uVHlwZSwgdmVuZG9yKSk7XG5cdFx0Y29ublN0YXRlLm1vZGVsUHJvdmlkZXJzLnNldChhZ2VudC5wcm92aWRlciwgbW9kZWxQcm92aWRlcik7XG5cdFx0YWdlbnRTdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNvbm5TdGF0ZS5tb2RlbFByb3ZpZGVycy5kZWxldGUoYWdlbnQucHJvdmlkZXIpKSk7XG5cdFx0YWdlbnRTdG9yZS5hZGQodGhpcy5fbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2VNb2RlbFByb3ZpZGVyKHZlbmRvciwgbW9kZWxQcm92aWRlcikpO1xuXHRcdG1vZGVsUHJvdmlkZXIudXBkYXRlTW9kZWxzKGFnZW50Lm1vZGVscyk7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtSZW1vdGVBZ2VudEhvc3RdIFJlZ2lzdGVyZWQgYWdlbnQgJHthZ2VudC5wcm92aWRlcn0gZnJvbSAke2FkZHJlc3N9IGFzICR7c2Vzc2lvblR5cGV9YCk7XG5cdH1cblxuXHRwcml2YXRlIF9hdXRoZW50aWNhdGVBbGxDb25uZWN0aW9ucygpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFthZGRyZXNzLCBjb25uU3RhdGVdIG9mIHRoaXMuX2Nvbm5lY3Rpb25zKSB7XG5cdFx0XHRjb25zdCByb290U3RhdGUgPSBjb25uU3RhdGUuY29ubmVjdGlvbi5yb290U3RhdGUudmFsdWU7XG5cdFx0XHRpZiAocm9vdFN0YXRlICYmICEocm9vdFN0YXRlIGluc3RhbmNlb2YgRXJyb3IpKSB7XG5cdFx0XHRcdHRoaXMuX2F1dGhlbnRpY2F0ZVdpdGhDb25uZWN0aW9uKGFkZHJlc3MsIGNvbm5TdGF0ZS5jb25uZWN0aW9uLCByb290U3RhdGUuYWdlbnRzKS5jYXRjaCgoKSA9PiB7IC8qIGJlc3QtZWZmb3J0ICovIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBdXRoZW50aWNhdGUgdXNpbmcgcHJvdGVjdGVkUmVzb3VyY2VzIGZyb20gYWdlbnQgaW5mbyBpbiByb290IHN0YXRlLlxuXHQgKiBSZXNvbHZlcyB0b2tlbnMgdmlhIHRoZSBzdGFuZGFyZCBWUyBDb2RlIGF1dGhlbnRpY2F0aW9uIHNlcnZpY2UuXG5cdCAqXG5cdCAqIE1hcmtzIHRoZSBtYXRjaGluZyBwcm92aWRlcidzIGBhdXRoZW50aWNhdGlvblBlbmRpbmdgIG9ic2VydmFibGUgd2hpbGVcblx0ICogdGhlIGF1dGggcGFzcyBpcyBpbiBmbGlnaHQgc28gdGhhdCBzZXNzaW9ucyBzdXJmYWNlIGFzIHN0aWxsIGxvYWRpbmcuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9hdXRoZW50aWNhdGVXaXRoQ29ubmVjdGlvbihhZGRyZXNzOiBzdHJpbmcsIGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIGFnZW50czogcmVhZG9ubHkgQWdlbnRJbmZvW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm92aWRlcklkID0gYGFnZW50aG9zdC0ke2FnZW50SG9zdEF1dGhvcml0eShhZGRyZXNzKX1gO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmdldFByb3ZpZGVyPFJlbW90ZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXI+KHByb3ZpZGVySWQpO1xuXHRcdGNvbnN0IGF1dGhUb2tlbkNhY2hlID0gdGhpcy5fY29ubmVjdGlvbnMuZ2V0KGFkZHJlc3MpPy5hdXRoVG9rZW5DYWNoZTtcblx0XHRwcm92aWRlcj8uc2V0QXV0aGVudGljYXRpb25QZW5kaW5nKHRydWUpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhdXRoZW50aWNhdGVQcm90ZWN0ZWRSZXNvdXJjZXMsIGFnZW50cywge1xuXHRcdFx0XHRhdXRoVG9rZW5DYWNoZSxcblx0XHRcdFx0bG9nUHJlZml4OiAnW1JlbW90ZUFnZW50SG9zdF0nLFxuXHRcdFx0XHRhdXRoZW50aWNhdGU6IHRoaXMuX2F1dGhlbnRpY2F0ZUNhbGxiYWNrKGFkZHJlc3MsIGNvbm5lY3Rpb24pLFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKCdbUmVtb3RlQWdlbnRIb3N0XSBGYWlsZWQgdG8gYXV0aGVudGljYXRlIHdpdGggY29ubmVjdGlvbicsIGVycik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHByb3ZpZGVyPy5zZXRBdXRoZW50aWNhdGlvblBlbmRpbmcoZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZUF1dGhlbnRpY2F0aW9uUmVxdWlyZWROb3RpZmljYXRpb24oYWRkcmVzczogc3RyaW5nLCBjb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uLCBub3RpZmljYXRpb246IElOb3RpZmljYXRpb24pOiB2b2lkIHtcblx0XHRpZiAobm90aWZpY2F0aW9uLnR5cGUgIT09IE5vdGlmaWNhdGlvblR5cGUuQXV0aFJlcXVpcmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2F1dGhlbnRpY2F0ZU5vdGlmaWNhdGlvblJlc291cmNlKGFkZHJlc3MsIGNvbm5lY3Rpb24sIG5vdGlmaWNhdGlvbi5yZXNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIF9hdXRoZW50aWNhdGVOb3RpZmljYXRpb25SZXNvdXJjZShhZGRyZXNzOiBzdHJpbmcsIGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24sIHByb3RlY3RlZFJlc291cmNlOiBQcm90ZWN0ZWRSZXNvdXJjZU1ldGFkYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgY29ublN0YXRlID0gdGhpcy5fY29ubmVjdGlvbnMuZ2V0KGFkZHJlc3MpO1xuXHRcdGlmICghY29ublN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHByb3ZpZGVySWQgPSBgYWdlbnRob3N0LSR7YWdlbnRIb3N0QXV0aG9yaXR5KGFkZHJlc3MpfWA7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuZ2V0UHJvdmlkZXI8UmVtb3RlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlcj4ocHJvdmlkZXJJZCk7XG5cdFx0cHJvdmlkZXI/LnNldEF1dGhlbnRpY2F0aW9uUGVuZGluZyh0cnVlKTtcblx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBjb25uU3RhdGUuYXV0aFJlY292ZXJ5LnJlY292ZXIoYWNjZXNzb3IsIHByb3RlY3RlZFJlc291cmNlLCB7XG5cdFx0XHRhdXRoVG9rZW5DYWNoZTogY29ublN0YXRlLmF1dGhUb2tlbkNhY2hlLFxuXHRcdFx0bG9nUHJlZml4OiAnW1JlbW90ZUFnZW50SG9zdF0nLFxuXHRcdFx0YXV0aGVudGljYXRlOiB0aGlzLl9hdXRoZW50aWNhdGVDYWxsYmFjayhhZGRyZXNzLCBjb25uZWN0aW9uKSxcblx0XHR9KSlcblx0XHRcdC5jYXRjaChlcnIgPT4ge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbUmVtb3RlQWdlbnRIb3N0XSBGYWlsZWQgdG8gYXV0aGVudGljYXRlIG5vdGlmaWVkIHJlc291cmNlICR7cHJvdGVjdGVkUmVzb3VyY2UucmVzb3VyY2V9YCwgZXJyKTtcblx0XHRcdH0pXG5cdFx0XHQuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdHByb3ZpZGVyPy5zZXRBdXRoZW50aWNhdGlvblBlbmRpbmcoZmFsc2UpO1xuXHRcdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQnVpbGQgdGhlIGBhdXRoZW50aWNhdGVgIGNhbGxiYWNrIGZvciBhIGNvbm5lY3Rpb24uIEhvc3QtYWdub3N0aWMgYnkgZGVmYXVsdCAoZm9yd2FyZHMgdGhlXG5cdCAqIHJlcXVlc3QgdW5jaGFuZ2VkKTsgYSBjb25uZWN0aW9uIGtpbmQgbWF5IGluamVjdCBhIHRva2VuIHRyYW5zZm9ybSB2aWFcblx0ICoge0BsaW5rIElSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uQ3VzdG9taXphdGlvblNlcnZpY2V9IFx1MjAxNCBlLmcuIGNsb3VkIHNhbmRib3ggY29ubmVjdGlvbnMsIHdob3NlXG5cdCAqIGhvc3QgcmVqZWN0cyBwbGFpbnRleHQgYmVhcmVycyBvdmVyIHRoZSByZWxheSAoYC0zMjYwMmApIGFuZCByZXF1aXJlcyBhIE1pc3Npb24tQ29udHJvbC1zZWFsZWRcblx0ICogZW52ZWxvcGUuIFRoZSB0cmFuc2Zvcm0gb3ducyBmYWlsLWNsb3NlZCB2YWxpZGF0aW9uLCBzbyBhIHJhdyB0b2tlbiBjYW4gbmV2ZXIgcmVhY2ggdGhlIGhvc3QuXG5cdCAqL1xuXHRwcml2YXRlIF9hdXRoZW50aWNhdGVDYWxsYmFjayhhZGRyZXNzOiBzdHJpbmcsIGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24pOiAocmVxdWVzdDogQXV0aGVudGljYXRlUGFyYW1zKSA9PiBQcm9taXNlPEF1dGhlbnRpY2F0ZVJlc3VsdD4ge1xuXHRcdGNvbnN0IHRyYW5zZm9ybSA9IHRoaXMuX2Nvbm5lY3Rpb25DdXN0b21pemF0aW9ucy5nZXQoYWRkcmVzcyk/LmF1dGhlbnRpY2F0ZTtcblx0XHRpZiAoIXRyYW5zZm9ybSkge1xuXHRcdFx0cmV0dXJuIHJlcXVlc3QgPT4gY29ubmVjdGlvbi5hdXRoZW50aWNhdGUocmVxdWVzdCk7XG5cdFx0fVxuXHRcdHJldHVybiBhc3luYyByZXF1ZXN0ID0+IGNvbm5lY3Rpb24uYXV0aGVudGljYXRlKGF3YWl0IHRyYW5zZm9ybShyZXF1ZXN0KSk7XG5cdH1cblxuXHQvKipcblx0ICogSW50ZXJhY3RpdmVseSBwcm9tcHQgdGhlIHVzZXIgdG8gYXV0aGVudGljYXRlIHdoZW4gdGhlIHVzZXIgc3RhcnRzIGEgc2Vzc2lvbi5cblx0ICogUmV0dXJucyB0cnVlIGlmIGF1dGhlbnRpY2F0aW9uIHN1Y2NlZWRlZC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVBdXRoZW50aWNhdGlvbkludGVyYWN0aXZlbHkoYWRkcmVzczogc3RyaW5nLCBjb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uLCBwcm90ZWN0ZWRSZXNvdXJjZXM6IHJlYWRvbmx5IFByb3RlY3RlZFJlc291cmNlTWV0YWRhdGFbXSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGF1dGhUb2tlbkNhY2hlID0gdGhpcy5fY29ubmVjdGlvbnMuZ2V0KGFkZHJlc3MpPy5hdXRoVG9rZW5DYWNoZTtcblx0XHRyZXR1cm4gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24ocmVzb2x2ZUF1dGhlbnRpY2F0aW9uSW50ZXJhY3RpdmVseSwgcHJvdGVjdGVkUmVzb3VyY2VzLCB7XG5cdFx0XHRhdXRoVG9rZW5DYWNoZSxcblx0XHRcdGxvZ1ByZWZpeDogJ1tSZW1vdGVBZ2VudEhvc3RdJyxcblx0XHRcdGF1dGhlbnRpY2F0ZTogdGhpcy5fYXV0aGVudGljYXRlQ2FsbGJhY2soYWRkcmVzcywgY29ubmVjdGlvbiksXG5cdFx0fSk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25DdXN0b21pemF0aW9uU2VydmljZSwgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvbkN1c3RvbWl6YXRpb25TZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFJlbW90ZUFnZW50SG9zdENvbnRyaWJ1dGlvbi5JRCwgUmVtb3RlQWdlbnRIb3N0Q29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcblxucmVnaXN0ZXJBY3Rpb24yKE9wZW5TZXNzaW9uRXZlbnRzRmlsZUFjdGlvbik7XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdHByb3BlcnRpZXM6IHtcblx0XHRbUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnJlbW90ZUFnZW50SG9zdHMuZW5hYmxlZCcsIFwiRW5hYmxlIGNvbm5lY3RpbmcgdG8gcmVtb3RlIGFnZW50IGhvc3RzLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHR9LFxuXHRcdFtSZW1vdGVBZ2VudEhvc3RBdXRvQ29ubmVjdFNldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQucmVtb3RlQWdlbnRIb3N0cy5hdXRvQ29ubmVjdCcsIFwiQXV0b21hdGljYWxseSBjb25uZWN0IHRvIG9ubGluZSBkZXYgdHVubmVsIGFuZCBTU0gtY29uZmlndXJlZCByZW1vdGUgYWdlbnQgaG9zdHMgb24gc3RhcnR1cC4gV2hlbiBkaXNhYmxlZCwgY2FjaGVkIHNlc3Npb25zIGFyZSBzdGlsbCBzaG93biBidXQgY29ubmVjdGlvbnMgYXJlIGVzdGFibGlzaGVkIG9ubHkgb24gZGVtYW5kLlwiKSxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHR9LFxuXHRcdC8vIE9mZiBieSBkZWZhdWx0OiBzYW5kYm94IHRhc2tzIGN1cnJlbnRseSBjYXJyeSB0aGUgYGNvcGlsb3QtZGV2ZWxvcGVyLWNsaWAgc2x1Zywgd2hpY2ggdGhlXG5cdFx0Ly8gQ29waWxvdCBleHRlbnNpb24ncyBjbG91ZCBwcm92aWRlciBkb2VzIG5vdCBsaXN0LCBzbyB0aGUgdHdvIGRvIG5vdCBvdmVybGFwLiBUaGF0IHNsdWcgaXNcblx0XHQvLyBleHBlY3RlZCB0byBjaGFuZ2UsIGF0IHdoaWNoIHBvaW50IGJvdGggcHJvdmlkZXJzIHdvdWxkIGxpc3QgdGhlIHNhbWUgdGFzayBcdTIwMTQgc2VlXG5cdFx0Ly8gYENMT1VEX1NBTkRCT1hfQUdFTlRfU0xVR2AuXG5cdFx0W0Nsb3VkU2FuZGJveEVuYWJsZWRTZXR0aW5nSWRdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5jbG91ZFNhbmRib3guZW5hYmxlZCcsIFwiRW5hYmxlIGNvbm5lY3RpbmcgdG8gQ29waWxvdCBjbG91ZCBzYW5kYm94IHNlc3Npb25zIG92ZXIgYSBsaXZlIEFnZW50IEhvc3QgUHJvdG9jb2wgcmVsYXkuIFdoZW4gZW5hYmxlZCwgb3BlbmluZyBhIENvcGlsb3QgY2xvdWQgc2Vzc2lvbiBjb25uZWN0cyB0byBpdHMgc2FuZGJveCBmb3Igc2xhc2ggY29tbWFuZHMgYW5kIGEgcmVzcG9uc2l2ZSwgc3RlZXJhYmxlIGV4cGVyaWVuY2UgaW5zdGVhZCBvZiBvbmx5IHBvbGxpbmcgbG9ncy5cIiksXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdH0sXG5cdFx0J2NoYXQuc3NoUmVtb3RlQWdlbnRIb3N0Q29tbWFuZCc6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5zc2hSZW1vdGVBZ2VudEhvc3RDb21tYW5kJywgXCJGb3IgZGV2ZWxvcG1lbnQ6IE92ZXJyaWRlIHRoZSBjb21tYW5kIHVzZWQgdG8gc3RhcnQgdGhlIHJlbW90ZSBhZ2VudCBob3N0IG92ZXIgU1NILiBXaGVuIHNldCwgc2tpcHMgYXV0b21hdGljIENMSSBpbnN0YWxsYXRpb24gYW5kIHJ1bnMgdGhpcyBjb21tYW5kIGluc3RlYWQuIFRoZSBjb21tYW5kIG11c3QgcHJpbnQgYSBXZWJTb2NrZXQgVVJMIG1hdGNoaW5nIHdzOi8vMTI3LjAuMC4xOlBPUlQgKG9wdGlvbmFsbHkgd2l0aCA/dGtuPVRPS0VOKSB0byBzdGRvdXQgb3Igc3RkZXJyLi9cIiksXG5cdFx0XHRkZWZhdWx0OiAnJyxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdH0sXG5cdFx0J2NoYXQuYWdlbnRIb3N0LmZvcndhcmRTU0hBZ2VudCc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQuYWdlbnRIb3N0LmZvcndhcmRTU0hBZ2VudCcsIFwiV2hlbiBlbmFibGVkLCBmb3J3YXJkcyB0aGUgbG9jYWwgU1NIIGFnZW50IHRvIHRoZSByZW1vdGUgbWFjaGluZSBkdXJpbmcgU1NIIGFnZW50IGhvc3QgY29ubmVjdGlvbnMgdG8gaG9zdHMgd2hvc2UgU1NIIGNvbmZpZyBoYXMgYEZvcndhcmRBZ2VudCB5ZXNgLiBPbmx5IGVuYWJsZSB0aGlzIGZvciB0cnVzdGVkIGhvc3RzLiBUaGUgcmVtb3RlIGFnZW50IGhvc3QgcHJvY2VzcyBtdXN0IGJlIHJlc3RhcnRlZCBmb3IgdGhpcyBzZXR0aW5nIHRvIHRha2UgZWZmZWN0LlwiKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdHRhZ3M6IFsnZXhwZXJpbWVudGFsJywgJ2FkdmFuY2VkJ10sXG5cdFx0fSxcblx0XHRbUmVtb3RlQWdlbnRIb3N0c1NldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGFkZHJlc3M6IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQucmVtb3RlQWdlbnRIb3N0cy5hZGRyZXNzJywgXCJUaGUgV2ViU29ja2V0IGFkZHJlc3Mgb2YgdGhlIHJlbW90ZSBhZ2VudCBob3N0IChlLmcuIFxcXCJsb2NhbGhvc3Q6MzAwMFxcXCIpLlwiKSB9LFxuXHRcdFx0XHRcdG5hbWU6IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQucmVtb3RlQWdlbnRIb3N0cy5uYW1lJywgXCJBIGRpc3BsYXkgbmFtZSBmb3IgdGhpcyByZW1vdGUgYWdlbnQgaG9zdC5cIikgfSxcblx0XHRcdFx0XHRjb25uZWN0aW9uVG9rZW46IHsgdHlwZTogJ3N0cmluZycsIGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NoYXQucmVtb3RlQWdlbnRIb3N0cy5jb25uZWN0aW9uVG9rZW4nLCBcIkFuIG9wdGlvbmFsIGNvbm5lY3Rpb24gdG9rZW4gZm9yIGF1dGhlbnRpY2F0aW5nIHdpdGggdGhlIHJlbW90ZSBhZ2VudCBob3N0LlwiKSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXF1aXJlZDogWydhZGRyZXNzJywgJ25hbWUnXSxcblx0XHRcdH0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnJlbW90ZUFnZW50SG9zdHMnLCBcIkEgbGlzdCBvZiBXZWJTb2NrZXQgcmVtb3RlIGFnZW50IGhvc3QgYWRkcmVzc2VzIHRvIGNvbm5lY3QgdG8gKGUuZy4gXFxcImxvY2FsaG9zdDozMDAwXFxcIikuIFNTSCByZW1vdGUgYWdlbnQgaG9zdCBkZXRhaWxzIGFyZSBtYW5hZ2VkIGJ5IFZTIENvZGUuXCIpLFxuXHRcdFx0ZGVmYXVsdDogW10sXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHR9LFxuXHRcdFtUdW5uZWxBZ2VudEhvc3RzU2V0dGluZ0lkXToge1xuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjaGF0LnJlbW90ZUFnZW50VHVubmVscycsIFwiQWRkaXRpb25hbCBkZXYgdHVubmVsIG5hbWVzIHRvIGxvb2sgZm9yIHdoZW4gY29ubmVjdGluZyB0byByZW1vdGUgYWdlbnQgaG9zdHMuIFRoZXNlIGFyZSBsb29rZWQgdXAgaW4gYWRkaXRpb24gdG8gdHVubmVscyBhdXRvbWF0aWNhbGx5IGVudW1lcmF0ZWQgZnJvbSB5b3VyIGFjY291bnQuXCIpLFxuXHRcdFx0ZGVmYXVsdDogW10sXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHR9LFxuXHRcdFtBZ2VudEhvc3RMb2NhbEZpbGVQZXJtaXNzaW9uc1NldHRpbmdJZF06IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3QubG9jYWxGaWxlUGVybWlzc2lvbnMnLCBcIlBlci1ob3N0IGZpbGVzeXN0ZW0gZ3JhbnRzIGZvciByZW1vdGUgYWdlbnQgaG9zdHMuIE1hcHMgYSByZW1vdGUgYWdlbnQgaG9zdCBhZGRyZXNzIHRvIFVSSSBzdHJpbmdzIGFuZCB0aGUgYWNjZXNzIG1vZGUgdGhlIGhvc3QgaGFzIGJlZW4gZ3JhbnRlZCAoYHJgIGZvciByZWFkLCBgcndgIGZvciByZWFkIGFuZCB3cml0ZSkuIEhvc3RzIGNhbm5vdCByZWFkIG9yIHdyaXRlIGFueSBmaWxlcyBvdXRzaWRlIHRoZSBncmFudGVkIFVSSXMgd2l0aG91dCBwcm9tcHRpbmc7IGEgVVJJIGdyYW50IGNvdmVycyBkZXNjZW5kYW50cy4gVGhpcyBzZXR0aW5nIGlzIG5vcm1hbGx5IG1haW50YWluZWQgYnkgdGhlIGFnZW50LWhvc3QgcGVybWlzc2lvbiBwcm9tcHRzIGFuZCByYXJlbHkgZWRpdGVkIGJ5IGhhbmQuXCIpLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZW51bTogWydyJywgJ3J3J10sXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdjaGF0LmFnZW50SG9zdC5sb2NhbEZpbGVQZXJtaXNzaW9ucy5yZWFkJywgXCJSZWFkLW9ubHkgYWNjZXNzLlwiKSxcblx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnY2hhdC5hZ2VudEhvc3QubG9jYWxGaWxlUGVybWlzc2lvbnMucmVhZFdyaXRlJywgXCJSZWFkIGFuZCB3cml0ZSBhY2Nlc3MuXCIpLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0ZGVmYXVsdDoge30sXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0dGFnczogWydleHBlcmltZW50YWwnLCAnYWR2YW5jZWQnXSxcblx0XHR9LFxuXHR9LFxufSk7XG5cbi8vIFNpZGUtZWZmZWN0IHJlZ2lzdHJhdGlvbnMgZm9yIHRoZSByZW1vdGUgYWdlbnQgaG9zdCBmZWF0dXJlXG5pbXBvcnQgJy4vcmVtb3RlQWdlbnRIb3N0QWN0aW9ucy5qcyc7XG5pbXBvcnQgJy4vbWFuYWdlUmVtb3RlQWdlbnRIb3N0cy5qcyc7XG5pbXBvcnQgJy4uLy4uL2FnZW50SG9zdC9icm93c2VyL2FnZW50SG9zdEFnZW50UGlja2VyLmpzJztcbmltcG9ydCB7IEFnZW50Q3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbiJdLAogICJtYXBwaW5ncyI6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
