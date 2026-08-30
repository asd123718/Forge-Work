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
import { IntervalTimer } from "../../../../../base/common/async.js";
import { isCancellationError } from "../../../../../base/common/errors.js";
import { isWindows } from "../../../../../base/common/platform.js";
import { IRemoteAgentHostService, RemoteAgentHostAutoConnectSettingId, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { IWSLRemoteAgentHostService, WSL_ADDRESS_PREFIX } from "../../../../../platform/agentHost/common/wslRemoteAgentHost.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../../platform/notification/common/notification.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../../../workbench/common/contributions.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { ManagedReconnectAgentHostContribution } from "./managedReconnectAgentHostContribution.js";
const WSL_RECONNECT_INITIAL_DELAY = 1e3;
const WSL_RECONNECT_MAX_DELAY = 3e4;
const WSL_RECONNECT_MAX_ATTEMPTS = 10;
const WSL_RECONNECT_PAUSE_AUTO_RESUME_MS = 5 * 60 * 1e3;
const WSL_RUNNING_POLL_MS = 5 * 60 * 1e3;
function shouldPauseWSLReconnectAfterFailure(err) {
  return isCancellationError(err);
}
let WSLAgentHostContribution = class extends ManagedReconnectAgentHostContribution {
  constructor(remoteAgentHostService, _wslService, configurationService, logService, instantiationService, sessionsProvidersService, notificationService) {
    super(remoteAgentHostService, configurationService, logService, instantiationService, sessionsProvidersService, notificationService);
    this._wslService = _wslService;
    /** Distros that were running at the last poll; used to detect newly-running distros. */
    this._lastKnownRunningDistros = /* @__PURE__ */ new Set();
    this._register(this._remoteAgentHostService.onDidChangeConnections(() => {
      this._resumeReconnects("WSL");
      this._reconcile();
    }));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(RemoteAgentHostsEnabledSettingId) || e.affectsConfiguration(RemoteAgentHostAutoConnectSettingId)) {
        this._resumeReconnects("WSL");
        this._reconcile();
      }
    }));
    this._reconcile();
    this._register(new IntervalTimer()).cancelAndSet(
      () => void this._reconnectWSLEntriesIfRunning(),
      WSL_RUNNING_POLL_MS
    );
  }
  _reconcile() {
    this._reconcileProviders();
    this._wireConnections();
    this._updateConnectionStatuses();
    void this._reconnectWSLEntriesIfRunning();
  }
  // -- Provider management --
  _reconcileProviders() {
    const entries = this._enabled ? this._getCachedWSLEntries() : [];
    const desiredAddresses = new Set(entries.map((e) => e.address));
    for (const [address] of this._providerStores) {
      if (!desiredAddresses.has(address)) {
        this._providerStores.deleteAndDispose(address);
      }
    }
    for (const entry of entries) {
      const existing = this._providerInstances.get(entry.address);
      if (existing && existing.label !== (entry.name || entry.address)) {
        this._providerStores.deleteAndDispose(entry.address);
      }
      if (!this._providerStores.has(entry.address)) {
        this._createProvider(entry.address, entry.name, {
          // WSL: an explicit user click should boot a stopped distro
          // (`wsl.exe -d <distro>` boots it). The "never auto-boot"
          // rule only applies to the periodic auto-reconnect path.
          connectOnDemand: () => this._connectWSLOnDemand(entry.distro, entry.name, entry.address),
          disconnectOnDemand: () => this._disconnectWSLOnDemand(entry.distro, entry.address),
          onDidReportConnectProgress: this._wslService.onDidReportConnectProgress
        });
      }
    }
  }
  /** Wire live connections to their providers so session operations work. */
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
  _updateConnectionStatuses() {
    for (const [address, provider] of this._providerInstances) {
      const connectionInfo = this._remoteAgentHostService.connections.find((c) => c.address === address);
      if (connectionInfo) {
        provider.setConnectionStatus(connectionInfo.status);
      } else if (this._pendingReconnects.has(this._distroForAddress(address))) {
        provider.setConnectionStatus(RemoteAgentHostConnectionStatus.connecting);
      } else if (!RemoteAgentHostConnectionStatus.isIncompatible(provider.connectionStatus.get())) {
        provider.setConnectionStatus(RemoteAgentHostConnectionStatus.disconnected);
      }
    }
  }
  _distroForAddress(address) {
    return address.startsWith(WSL_ADDRESS_PREFIX) ? address.slice(WSL_ADDRESS_PREFIX.length) : address;
  }
  _getCachedWSLEntries() {
    return this._wslService.getCachedDistros().map(({ distro, name }) => ({
      distro,
      name,
      address: `${WSL_ADDRESS_PREFIX}${distro}`
    }));
  }
  // -- Auto-reconnect --
  /**
   * Re-establish WSL connections for cached distros that are already
   * running. Never auto-boots a distro; only acts on user-initiated boots
   * observed via {@link IWSLRemoteAgentHostService.listRunningDistros}.
   */
  async _reconnectWSLEntriesIfRunning() {
    if (!isWindows) {
      return;
    }
    if (!this._enabled) {
      this._reconnectStates.clearAndDisposeAll();
      return;
    }
    const running = new Set(await this._wslService.listRunningDistros().catch(() => []));
    const newlyRunning = [];
    for (const distro of running) {
      if (!this._lastKnownRunningDistros.has(distro)) {
        newlyRunning.push(distro);
      }
    }
    this._lastKnownRunningDistros = running;
    if (newlyRunning.length > 0) {
      this._logService.info(`[WSLAgentHost] Newly running WSL distro(s): ${newlyRunning.join(", ")}`);
    }
    const autoConnect = this._configurationService.getValue(RemoteAgentHostAutoConnectSettingId);
    const entries = this._getCachedWSLEntries();
    const stillCached = /* @__PURE__ */ new Set();
    for (const entry of entries) {
      stillCached.add(entry.distro);
      if (!running.has(entry.distro)) {
        continue;
      }
      const hasConnection = this._remoteAgentHostService.connections.some(
        (c) => c.address === entry.address && RemoteAgentHostConnectionStatus.isConnected(c.status)
      );
      if (hasConnection) {
        this._reconnectStates.deleteAndDispose(entry.distro);
        continue;
      }
      if (this._pendingReconnects.has(entry.distro)) {
        this._logService.trace(`[WSLAgentHost] WSL reconnect for ${entry.distro}: reconnect already in progress, skipping`);
        continue;
      }
      const state = this._reconnectStates.get(entry.distro);
      if (state?.hasPendingTimer) {
        this._logService.trace(`[WSLAgentHost] WSL reconnect for ${entry.distro}: retry timer already scheduled, skipping`);
        continue;
      }
      if (state?.paused) {
        const pausedMs = Date.now() - state.pausedAt;
        if (pausedMs < WSL_RECONNECT_PAUSE_AUTO_RESUME_MS) {
          this._logService.trace(`[WSLAgentHost] WSL reconnect for ${entry.distro}: paused (${Math.round(pausedMs / 1e3)}s ago), skipping`);
          continue;
        }
        this._logService.info(`[WSLAgentHost] WSL reconnect for ${entry.distro}: auto-resuming after ${Math.round(pausedMs / 1e3)}s pause`);
        state.resetForResume();
      }
      if (!autoConnect) {
        this._logService.trace(`[WSLAgentHost] WSL reconnect for ${entry.distro}: auto-connect disabled, skipping`);
        continue;
      }
      void this._attemptWSLReconnect(entry.distro, entry.name, entry.address);
    }
    for (const distro of [...this._reconnectStates.keys()]) {
      if (!stillCached.has(distro)) {
        this._reconnectStates.deleteAndDispose(distro);
      }
    }
  }
  async _attemptWSLReconnect(distro, name, address, options = {}) {
    await this._attemptManagedReconnect({
      kind: "WSL",
      key: distro,
      address,
      userInitiated: !!options.userInitiated,
      maxAttempts: WSL_RECONNECT_MAX_ATTEMPTS,
      shouldPause: shouldPauseWSLReconnectAfterFailure,
      // WSL-specific gate: never auto-boot a stopped distro. The gate is
      // skipped on user-initiated attempts (the user explicitly clicked
      // Reconnect — `wsl.exe -d <distro>` will boot it). When the gate
      // triggers we return WITHOUT incrementing `attempts` so a long stop
      // doesn't burn the retry budget.
      preCheck: async (userInitiated) => {
        if (userInitiated) {
          return void 0;
        }
        const stillCached = this._wslService.getCachedDistros().some((d) => d.distro === distro);
        if (!stillCached) {
          this._reconnectStates.deleteAndDispose(distro);
          return { skip: true };
        }
        const running = new Set(await this._wslService.listRunningDistros().catch(() => []));
        this._lastKnownRunningDistros = running;
        if (!running.has(distro)) {
          return { skip: true, reason: `distro ${distro} not running` };
        }
        return void 0;
      },
      doConnect: () => this._wslService.reconnect(distro, name).then(() => void 0),
      schedule: (state) => this._scheduleWSLReconnect(distro, name, address, state)
    });
  }
  _scheduleWSLReconnect(distro, name, address, state) {
    const delay = Math.min(WSL_RECONNECT_INITIAL_DELAY * Math.pow(2, state.attempts - 1), WSL_RECONNECT_MAX_DELAY);
    this._logService.info(`[WSLAgentHost] Scheduling WSL reconnect for ${distro} in ${delay}ms (attempt ${state.attempts + 1}/${WSL_RECONNECT_MAX_ATTEMPTS})`);
    state.scheduleRetry(delay, () => {
      if (!this._enabled) {
        this._reconnectStates.deleteAndDispose(distro);
        return;
      }
      if (!this._configurationService.getValue(RemoteAgentHostAutoConnectSettingId)) {
        return;
      }
      const live = this._remoteAgentHostService.connections.find((c) => c.address === address);
      if (live && RemoteAgentHostConnectionStatus.isConnected(live.status)) {
        this._reconnectStates.deleteAndDispose(distro);
        return;
      }
      if (this._pendingReconnects.has(distro)) {
        return;
      }
      void this._attemptWSLReconnect(distro, name, address);
    });
  }
  // -- On-demand connection --
  async _connectWSLOnDemand(distro, name, address) {
    while (true) {
      const inFlight = this._pendingReconnects.get(distro);
      if (!inFlight) {
        break;
      }
      await inFlight.catch(() => void 0);
      const live = this._remoteAgentHostService.connections.find((c) => c.address === address);
      if (live && RemoteAgentHostConnectionStatus.isConnected(live.status)) {
        return;
      }
    }
    this._reconnectStates.get(distro)?.resetForResume();
    await this._attemptWSLReconnect(distro, name, address, { userInitiated: true });
  }
  /**
   * Tear down the active WSL connection for {@link distro} and cancel any
   * pending auto-reconnect. Removes the cached distro so it won't auto-reconnect.
   *
   * Order matters: `removeRemoteAgentHost` MUST run before the WSL service
   * teardown so the subsequent close event can't trip auto-reconnect.
   */
  async _disconnectWSLOnDemand(distro, address) {
    this._reconnectStates.deleteAndDispose(distro);
    await this._remoteAgentHostService.removeRemoteAgentHost(address);
    await this._wslService.disconnect(distro);
  }
};
WSLAgentHostContribution.ID = "sessions.contrib.wslAgentHostContribution";
WSLAgentHostContribution = __decorateClass([
  __decorateParam(0, IRemoteAgentHostService),
  __decorateParam(1, IWSLRemoteAgentHostService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ISessionsProvidersService),
  __decorateParam(6, INotificationService)
], WSLAgentHostContribution);
registerWorkbenchContribution2(WSLAgentHostContribution.ID, WSLAgentHostContribution, WorkbenchPhase.AfterRestored);
export {
  WSLAgentHostContribution,
  shouldPauseWSLReconnectAfterFailure
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxyZW1vdGVBZ2VudEhvc3RcXGJyb3dzZXJcXHdzbEFnZW50SG9zdC5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJbnRlcnZhbFRpbWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSwgUmVtb3RlQWdlbnRIb3N0QXV0b0Nvbm5lY3RTZXR0aW5nSWQsIFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMsIFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXU0xSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCBXU0xfQUREUkVTU19QUkVGSVggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3dzbFJlbW90ZUFnZW50SG9zdC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiwgV29ya2JlbmNoUGhhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1hbmFnZWRSZWNvbm5lY3RBZ2VudEhvc3RDb250cmlidXRpb24sIE1hbmFnZWRSZWNvbm5lY3RTdGF0ZSB9IGZyb20gJy4vbWFuYWdlZFJlY29ubmVjdEFnZW50SG9zdENvbnRyaWJ1dGlvbi5qcyc7XG5cbi8qKiBJbml0aWFsIGF1dG8tcmVjb25uZWN0IGRlbGF5IGFmdGVyIGEgZmFpbGVkIFdTTCByZWNvbm5lY3QgYXR0ZW1wdC4gKi9cbmNvbnN0IFdTTF9SRUNPTk5FQ1RfSU5JVElBTF9ERUxBWSA9IDEwMDA7XG4vKiogTWF4aW11bSBhdXRvLXJlY29ubmVjdCBiYWNrb2ZmIGRlbGF5IGZvciBXU0wuICovXG5jb25zdCBXU0xfUkVDT05ORUNUX01BWF9ERUxBWSA9IDMwXzAwMDtcbi8qKiBDb25zZWN1dGl2ZSBXU0wgcmVjb25uZWN0IGZhaWx1cmVzIGJlZm9yZSBwYXVzaW5nIGF1dG8tcmVjb25uZWN0LiAqL1xuY29uc3QgV1NMX1JFQ09OTkVDVF9NQVhfQVRURU1QVFMgPSAxMDtcbi8qKiBBZnRlciB0aGlzIG11Y2ggd2FsbC1jbG9jayB0aW1lLCBhIHBhdXNlZCBhdXRvLXJlY29ubmVjdCBpcyBhdXRvLXJlc3VtZWQuICovXG5jb25zdCBXU0xfUkVDT05ORUNUX1BBVVNFX0FVVE9fUkVTVU1FX01TID0gNSAqIDYwICogMTAwMDtcbi8qKlxuICogQmFja2dyb3VuZCBwb2xsIGZvciBgd3NsIC0tbGlzdCAtLXJ1bm5pbmdgIHNvIGEgdXNlci1pbml0aWF0ZWQgV1NMIGJvb3QgY2FuXG4gKiBiZSBkZXRlY3RlZCBhbmQgYSBjYWNoZWQgZGlzdHJvIHJlY29ubmVjdGVkIHdpdGhvdXQgd2FpdGluZyBmb3IgYW4gdW5yZWxhdGVkXG4gKiBldmVudC5cbiAqL1xuY29uc3QgV1NMX1JVTk5JTkdfUE9MTF9NUyA9IDUgKiA2MCAqIDEwMDA7XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG91bGRQYXVzZVdTTFJlY29ubmVjdEFmdGVyRmFpbHVyZShlcnI6IHVua25vd24pOiBib29sZWFuIHtcblx0cmV0dXJuIGlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKTtcbn1cblxuLyoqXG4gKiBNYW5hZ2VzIHNlc3Npb25zIHByb3ZpZGVycyBhbmQgYXV0by1yZWNvbm5lY3QgZm9yIFdTTC1iYWNrZWQgcmVtb3RlIGFnZW50XG4gKiBob3N0cy4gTWlycm9ycyB7QGxpbmsgVHVubmVsQWdlbnRIb3N0Q29udHJpYnV0aW9ufTogcHJvdmlkZXJzIGFyZSBzb3VyY2VkXG4gKiBmcm9tIHRoZSBXU0wgc2VydmljZSdzIGluLW1lbW9yeSBjYWNoZSAoe0BsaW5rIElXU0xSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmdldENhY2hlZERpc3Ryb3N9KVxuICogcmF0aGVyIHRoYW4gZnJvbSBwZXJzaXN0ZWQgc2V0dGluZ3MsIGFuZCBsaXZlIGNvbm5lY3Rpb25zIGFyZSB3aXJlZCBiYWNrIHRvXG4gKiB0aGVpciBwcm92aWRlcnMgYXMgY29ubmVjdGlvbiBldmVudHMgYXJyaXZlLlxuICpcbiAqIFRoZSBwZXItY29ubmVjdGlvbiBhZ2VudCByZWdpc3RyYXRpb24gKGNoYXQgc2Vzc2lvbnMsIGxhbmd1YWdlIG1vZGVscykgaXNcbiAqIGhhbmRsZWQgYnkge0BsaW5rIFJlbW90ZUFnZW50SG9zdENvbnRyaWJ1dGlvbn0gcmVhY3RpbmcgdG9cbiAqIGBvbkRpZENoYW5nZUNvbm5lY3Rpb25zYCBcdTIwMTQgZXhhY3RseSBhcyBpdCBkb2VzIGZvciB0dW5uZWxzLlxuICovXG5leHBvcnQgY2xhc3MgV1NMQWdlbnRIb3N0Q29udHJpYnV0aW9uIGV4dGVuZHMgTWFuYWdlZFJlY29ubmVjdEFnZW50SG9zdENvbnRyaWJ1dGlvbiBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdzZXNzaW9ucy5jb250cmliLndzbEFnZW50SG9zdENvbnRyaWJ1dGlvbic7XG5cblx0LyoqIERpc3Ryb3MgdGhhdCB3ZXJlIHJ1bm5pbmcgYXQgdGhlIGxhc3QgcG9sbDsgdXNlZCB0byBkZXRlY3QgbmV3bHktcnVubmluZyBkaXN0cm9zLiAqL1xuXHRwcml2YXRlIF9sYXN0S25vd25SdW5uaW5nRGlzdHJvcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSByZW1vdGVBZ2VudEhvc3RTZXJ2aWNlOiBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSxcblx0XHRASVdTTFJlbW90ZUFnZW50SG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd3NsU2VydmljZTogSVdTTFJlbW90ZUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2Ugc2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlOiBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIocmVtb3RlQWdlbnRIb3N0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGxvZ1NlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBzZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXG5cdFx0Ly8gUmVjb25jaWxlIHByb3ZpZGVycyB3aGVuIGNvbm5lY3Rpb25zIGNoYW5nZSAoYWRkZWQvcmVtb3ZlZC9yZWNvbm5lY3RlZCkuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5vbkRpZENoYW5nZUNvbm5lY3Rpb25zKCgpID0+IHtcblx0XHRcdC8vIE5ldy9yZW1vdmVkIGNvbm5lY3Rpb24gXHUyMDE0IHBhdXNlZCBhdXRvLXJlY29ubmVjdCBtYXkgaGF2ZSBiZWVuXG5cdFx0XHQvLyBjYXVzZWQgYnkgYSB0cmFuc2llbnQgb3V0YWdlIHRoYXQncyBub3cgcmVzb2x2ZWQuXG5cdFx0XHR0aGlzLl9yZXN1bWVSZWNvbm5lY3RzKCdXU0wnKTtcblx0XHRcdHRoaXMuX3JlY29uY2lsZSgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFJlY29uY2lsZSB3aGVuIGVuYWJsZW1lbnQgLyBhdXRvLWNvbm5lY3QgY29uZmlnIGNoYW5nZXMuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oUmVtb3RlQWdlbnRIb3N0QXV0b0Nvbm5lY3RTZXR0aW5nSWQpKSB7XG5cdFx0XHRcdHRoaXMuX3Jlc3VtZVJlY29ubmVjdHMoJ1dTTCcpO1xuXHRcdFx0XHR0aGlzLl9yZWNvbmNpbGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBJbml0aWFsIHNldHVwIGZvciBjYWNoZWQgZGlzdHJvcyBhbmQgY29ubmVjdGVkIHJlbW90ZXMuXG5cdFx0dGhpcy5fcmVjb25jaWxlKCk7XG5cblx0XHQvLyBQZXJpb2RpYyBiYWNrc3RvcDogY2F0Y2hlcyB1c2VyLWluaXRpYXRlZCBXU0wgYm9vdHMgZXZlbiB3aGVuIG5vXG5cdFx0Ly8gb3RoZXIgZXZlbnQgZmlyZXMuIENoZWFwIChgd3NsIC0tbGlzdCAtLXJ1bm5pbmcgLS1xdWlldGApIHNvIHRoZVxuXHRcdC8vIDUtbWludXRlIGNhZGVuY2UgaGFzIG5vIG1lYXN1cmFibGUgY29zdC5cblx0XHR0aGlzLl9yZWdpc3RlcihuZXcgSW50ZXJ2YWxUaW1lcigpKS5jYW5jZWxBbmRTZXQoXG5cdFx0XHQoKSA9PiB2b2lkIHRoaXMuX3JlY29ubmVjdFdTTEVudHJpZXNJZlJ1bm5pbmcoKSxcblx0XHRcdFdTTF9SVU5OSU5HX1BPTExfTVMsXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX3JlY29uY2lsZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWNvbmNpbGVQcm92aWRlcnMoKTtcblx0XHR0aGlzLl93aXJlQ29ubmVjdGlvbnMoKTtcblx0XHR0aGlzLl91cGRhdGVDb25uZWN0aW9uU3RhdHVzZXMoKTtcblx0XHR2b2lkIHRoaXMuX3JlY29ubmVjdFdTTEVudHJpZXNJZlJ1bm5pbmcoKTtcblx0fVxuXG5cdC8vIC0tIFByb3ZpZGVyIG1hbmFnZW1lbnQgLS1cblxuXHRwcml2YXRlIF9yZWNvbmNpbGVQcm92aWRlcnMoKTogdm9pZCB7XG5cdFx0Y29uc3QgZW50cmllcyA9IHRoaXMuX2VuYWJsZWQgPyB0aGlzLl9nZXRDYWNoZWRXU0xFbnRyaWVzKCkgOiBbXTtcblx0XHRjb25zdCBkZXNpcmVkQWRkcmVzc2VzID0gbmV3IFNldChlbnRyaWVzLm1hcChlID0+IGUuYWRkcmVzcykpO1xuXG5cdFx0Ly8gUmVtb3ZlIHByb3ZpZGVycyB3aG9zZSBkaXN0cm8gaXMgbm8gbG9uZ2VyIGNhY2hlZC5cblx0XHRmb3IgKGNvbnN0IFthZGRyZXNzXSBvZiB0aGlzLl9wcm92aWRlclN0b3Jlcykge1xuXHRcdFx0aWYgKCFkZXNpcmVkQWRkcmVzc2VzLmhhcyhhZGRyZXNzKSkge1xuXHRcdFx0XHR0aGlzLl9wcm92aWRlclN0b3Jlcy5kZWxldGVBbmREaXNwb3NlKGFkZHJlc3MpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFkZCBvciByZWNyZWF0ZSBwcm92aWRlcnMgZm9yIGNhY2hlZCBkaXN0cm9zLlxuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9wcm92aWRlckluc3RhbmNlcy5nZXQoZW50cnkuYWRkcmVzcyk7XG5cdFx0XHRpZiAoZXhpc3RpbmcgJiYgZXhpc3RpbmcubGFiZWwgIT09IChlbnRyeS5uYW1lIHx8IGVudHJ5LmFkZHJlc3MpKSB7XG5cdFx0XHRcdC8vIE5hbWUgY2hhbmdlZCBcdTIwMTQgcmVjcmVhdGUgc2luY2UgSVNlc3Npb25zUHJvdmlkZXIubGFiZWwgaXMgcmVhZG9ubHkuXG5cdFx0XHRcdHRoaXMuX3Byb3ZpZGVyU3RvcmVzLmRlbGV0ZUFuZERpc3Bvc2UoZW50cnkuYWRkcmVzcyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuX3Byb3ZpZGVyU3RvcmVzLmhhcyhlbnRyeS5hZGRyZXNzKSkge1xuXHRcdFx0XHR0aGlzLl9jcmVhdGVQcm92aWRlcihlbnRyeS5hZGRyZXNzLCBlbnRyeS5uYW1lLCB7XG5cdFx0XHRcdFx0Ly8gV1NMOiBhbiBleHBsaWNpdCB1c2VyIGNsaWNrIHNob3VsZCBib290IGEgc3RvcHBlZCBkaXN0cm9cblx0XHRcdFx0XHQvLyAoYHdzbC5leGUgLWQgPGRpc3Rybz5gIGJvb3RzIGl0KS4gVGhlIFwibmV2ZXIgYXV0by1ib290XCJcblx0XHRcdFx0XHQvLyBydWxlIG9ubHkgYXBwbGllcyB0byB0aGUgcGVyaW9kaWMgYXV0by1yZWNvbm5lY3QgcGF0aC5cblx0XHRcdFx0XHRjb25uZWN0T25EZW1hbmQ6ICgpID0+IHRoaXMuX2Nvbm5lY3RXU0xPbkRlbWFuZChlbnRyeS5kaXN0cm8sIGVudHJ5Lm5hbWUsIGVudHJ5LmFkZHJlc3MpLFxuXHRcdFx0XHRcdGRpc2Nvbm5lY3RPbkRlbWFuZDogKCkgPT4gdGhpcy5fZGlzY29ubmVjdFdTTE9uRGVtYW5kKGVudHJ5LmRpc3RybywgZW50cnkuYWRkcmVzcyksXG5cdFx0XHRcdFx0b25EaWRSZXBvcnRDb25uZWN0UHJvZ3Jlc3M6IHRoaXMuX3dzbFNlcnZpY2Uub25EaWRSZXBvcnRDb25uZWN0UHJvZ3Jlc3MsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKiBXaXJlIGxpdmUgY29ubmVjdGlvbnMgdG8gdGhlaXIgcHJvdmlkZXJzIHNvIHNlc3Npb24gb3BlcmF0aW9ucyB3b3JrLiAqL1xuXHRwcml2YXRlIF93aXJlQ29ubmVjdGlvbnMoKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBbYWRkcmVzcywgcHJvdmlkZXJdIG9mIHRoaXMuX3Byb3ZpZGVySW5zdGFuY2VzKSB7XG5cdFx0XHRjb25zdCBjb25uZWN0aW9uSW5mbyA9IHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuY29ubmVjdGlvbnMuZmluZChcblx0XHRcdFx0YyA9PiBjLmFkZHJlc3MgPT09IGFkZHJlc3MgJiYgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0Nvbm5lY3RlZChjLnN0YXR1cylcblx0XHRcdCk7XG5cdFx0XHRpZiAoY29ubmVjdGlvbkluZm8pIHtcblx0XHRcdFx0Y29uc3QgY29ubmVjdGlvbiA9IHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuZ2V0Q29ubmVjdGlvbihhZGRyZXNzKTtcblx0XHRcdFx0aWYgKGNvbm5lY3Rpb24pIHtcblx0XHRcdFx0XHRwcm92aWRlci5zZXRDb25uZWN0aW9uKGNvbm5lY3Rpb24sIGNvbm5lY3Rpb25JbmZvLmRlZmF1bHREaXJlY3RvcnkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQ29ubmVjdGlvblN0YXR1c2VzKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgW2FkZHJlc3MsIHByb3ZpZGVyXSBvZiB0aGlzLl9wcm92aWRlckluc3RhbmNlcykge1xuXHRcdFx0Y29uc3QgY29ubmVjdGlvbkluZm8gPSB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmNvbm5lY3Rpb25zLmZpbmQoYyA9PiBjLmFkZHJlc3MgPT09IGFkZHJlc3MpO1xuXHRcdFx0aWYgKGNvbm5lY3Rpb25JbmZvKSB7XG5cdFx0XHRcdC8vIFNlcnZpY2UgaGFzIGFuIGVudHJ5IGZvciB0aGlzIGFkZHJlc3MgXHUyMDE0IGl0cyBzdGF0dXMgaXNcblx0XHRcdFx0Ly8gYXV0aG9yaXRhdGl2ZSAoaW5jbHVkaW5nIGBpbmNvbXBhdGlibGVgIGZyb20gdGhlIFdlYlNvY2tldFxuXHRcdFx0XHQvLyBjb25uZWN0IGZhaWx1cmUgcGF0aCBhbmQgYGNvbm5lY3RpbmdgIGZyb20gYSBmcmVzaCByZWNvbm5lY3QpLlxuXHRcdFx0XHRwcm92aWRlci5zZXRDb25uZWN0aW9uU3RhdHVzKGNvbm5lY3Rpb25JbmZvLnN0YXR1cyk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX3BlbmRpbmdSZWNvbm5lY3RzLmhhcyh0aGlzLl9kaXN0cm9Gb3JBZGRyZXNzKGFkZHJlc3MpKSkge1xuXHRcdFx0XHRwcm92aWRlci5zZXRDb25uZWN0aW9uU3RhdHVzKFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuY29ubmVjdGluZyk7XG5cdFx0XHR9IGVsc2UgaWYgKCFSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzSW5jb21wYXRpYmxlKHByb3ZpZGVyLmNvbm5lY3Rpb25TdGF0dXMuZ2V0KCkpKSB7XG5cdFx0XHRcdC8vIE5vIHNlcnZpY2UgZW50cnkuIFByZXNlcnZlIGluY29tcGF0aWJsZSBzdGF0ZSBzZXQgYnkgdGhlXG5cdFx0XHRcdC8vIHJlY29ubmVjdCBjYXRjaDsgb3RoZXJ3aXNlIGZhbGwgYmFjayB0byBkaXNjb25uZWN0ZWQuXG5cdFx0XHRcdHByb3ZpZGVyLnNldENvbm5lY3Rpb25TdGF0dXMoUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5kaXNjb25uZWN0ZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2Rpc3Ryb0ZvckFkZHJlc3MoYWRkcmVzczogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYWRkcmVzcy5zdGFydHNXaXRoKFdTTF9BRERSRVNTX1BSRUZJWCkgPyBhZGRyZXNzLnNsaWNlKFdTTF9BRERSRVNTX1BSRUZJWC5sZW5ndGgpIDogYWRkcmVzcztcblx0fVxuXG5cdHByaXZhdGUgX2dldENhY2hlZFdTTEVudHJpZXMoKTogcmVhZG9ubHkgeyBkaXN0cm86IHN0cmluZzsgbmFtZTogc3RyaW5nOyBhZGRyZXNzOiBzdHJpbmcgfVtdIHtcblx0XHRyZXR1cm4gdGhpcy5fd3NsU2VydmljZS5nZXRDYWNoZWREaXN0cm9zKCkubWFwKCh7IGRpc3RybywgbmFtZSB9KSA9PiAoe1xuXHRcdFx0ZGlzdHJvLFxuXHRcdFx0bmFtZSxcblx0XHRcdGFkZHJlc3M6IGAke1dTTF9BRERSRVNTX1BSRUZJWH0ke2Rpc3Ryb31gLFxuXHRcdH0pKTtcblx0fVxuXG5cdC8vIC0tIEF1dG8tcmVjb25uZWN0IC0tXG5cblx0LyoqXG5cdCAqIFJlLWVzdGFibGlzaCBXU0wgY29ubmVjdGlvbnMgZm9yIGNhY2hlZCBkaXN0cm9zIHRoYXQgYXJlIGFscmVhZHlcblx0ICogcnVubmluZy4gTmV2ZXIgYXV0by1ib290cyBhIGRpc3Rybzsgb25seSBhY3RzIG9uIHVzZXItaW5pdGlhdGVkIGJvb3RzXG5cdCAqIG9ic2VydmVkIHZpYSB7QGxpbmsgSVdTTFJlbW90ZUFnZW50SG9zdFNlcnZpY2UubGlzdFJ1bm5pbmdEaXN0cm9zfS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3JlY29ubmVjdFdTTEVudHJpZXNJZlJ1bm5pbmcoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9lbmFibGVkKSB7XG5cdFx0XHR0aGlzLl9yZWNvbm5lY3RTdGF0ZXMuY2xlYXJBbmREaXNwb3NlQWxsKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcnVubmluZyA9IG5ldyBTZXQ8c3RyaW5nPihhd2FpdCB0aGlzLl93c2xTZXJ2aWNlLmxpc3RSdW5uaW5nRGlzdHJvcygpLmNhdGNoKCgpID0+IFtdKSk7XG5cdFx0Y29uc3QgbmV3bHlSdW5uaW5nOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZGlzdHJvIG9mIHJ1bm5pbmcpIHtcblx0XHRcdGlmICghdGhpcy5fbGFzdEtub3duUnVubmluZ0Rpc3Ryb3MuaGFzKGRpc3RybykpIHtcblx0XHRcdFx0bmV3bHlSdW5uaW5nLnB1c2goZGlzdHJvKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fbGFzdEtub3duUnVubmluZ0Rpc3Ryb3MgPSBydW5uaW5nO1xuXHRcdGlmIChuZXdseVJ1bm5pbmcubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbV1NMQWdlbnRIb3N0XSBOZXdseSBydW5uaW5nIFdTTCBkaXN0cm8ocyk6ICR7bmV3bHlSdW5uaW5nLmpvaW4oJywgJyl9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXV0b0Nvbm5lY3QgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihSZW1vdGVBZ2VudEhvc3RBdXRvQ29ubmVjdFNldHRpbmdJZCk7XG5cdFx0Y29uc3QgZW50cmllcyA9IHRoaXMuX2dldENhY2hlZFdTTEVudHJpZXMoKTtcblx0XHRjb25zdCBzdGlsbENhY2hlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuXHRcdFx0c3RpbGxDYWNoZWQuYWRkKGVudHJ5LmRpc3Rybyk7XG5cdFx0XHRpZiAoIXJ1bm5pbmcuaGFzKGVudHJ5LmRpc3RybykpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBoYXNDb25uZWN0aW9uID0gdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5jb25uZWN0aW9ucy5zb21lKFxuXHRcdFx0XHRjID0+IGMuYWRkcmVzcyA9PT0gZW50cnkuYWRkcmVzcyAmJiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzQ29ubmVjdGVkKGMuc3RhdHVzKVxuXHRcdFx0KTtcblx0XHRcdGlmIChoYXNDb25uZWN0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX3JlY29ubmVjdFN0YXRlcy5kZWxldGVBbmREaXNwb3NlKGVudHJ5LmRpc3Rybyk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuX3BlbmRpbmdSZWNvbm5lY3RzLmhhcyhlbnRyeS5kaXN0cm8pKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtXU0xBZ2VudEhvc3RdIFdTTCByZWNvbm5lY3QgZm9yICR7ZW50cnkuZGlzdHJvfTogcmVjb25uZWN0IGFscmVhZHkgaW4gcHJvZ3Jlc3MsIHNraXBwaW5nYCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9yZWNvbm5lY3RTdGF0ZXMuZ2V0KGVudHJ5LmRpc3Rybyk7XG5cdFx0XHRpZiAoc3RhdGU/Lmhhc1BlbmRpbmdUaW1lcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbV1NMQWdlbnRIb3N0XSBXU0wgcmVjb25uZWN0IGZvciAke2VudHJ5LmRpc3Ryb306IHJldHJ5IHRpbWVyIGFscmVhZHkgc2NoZWR1bGVkLCBza2lwcGluZ2ApO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChzdGF0ZT8ucGF1c2VkKSB7XG5cdFx0XHRcdGNvbnN0IHBhdXNlZE1zID0gRGF0ZS5ub3coKSAtIHN0YXRlLnBhdXNlZEF0O1xuXHRcdFx0XHRpZiAocGF1c2VkTXMgPCBXU0xfUkVDT05ORUNUX1BBVVNFX0FVVE9fUkVTVU1FX01TKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW1dTTEFnZW50SG9zdF0gV1NMIHJlY29ubmVjdCBmb3IgJHtlbnRyeS5kaXN0cm99OiBwYXVzZWQgKCR7TWF0aC5yb3VuZChwYXVzZWRNcyAvIDEwMDApfXMgYWdvKSwgc2tpcHBpbmdgKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtXU0xBZ2VudEhvc3RdIFdTTCByZWNvbm5lY3QgZm9yICR7ZW50cnkuZGlzdHJvfTogYXV0by1yZXN1bWluZyBhZnRlciAke01hdGgucm91bmQocGF1c2VkTXMgLyAxMDAwKX1zIHBhdXNlYCk7XG5cdFx0XHRcdHN0YXRlLnJlc2V0Rm9yUmVzdW1lKCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWF1dG9Db25uZWN0KSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtXU0xBZ2VudEhvc3RdIFdTTCByZWNvbm5lY3QgZm9yICR7ZW50cnkuZGlzdHJvfTogYXV0by1jb25uZWN0IGRpc2FibGVkLCBza2lwcGluZ2ApO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHZvaWQgdGhpcy5fYXR0ZW1wdFdTTFJlY29ubmVjdChlbnRyeS5kaXN0cm8sIGVudHJ5Lm5hbWUsIGVudHJ5LmFkZHJlc3MpO1xuXHRcdH1cblxuXHRcdC8vIERyb3AgcmV0cnkgc3RhdGUgZm9yIGRpc3Ryb3MgdGhhdCBhcmUgbm8gbG9uZ2VyIGNhY2hlZC5cblx0XHRmb3IgKGNvbnN0IGRpc3RybyBvZiBbLi4udGhpcy5fcmVjb25uZWN0U3RhdGVzLmtleXMoKV0pIHtcblx0XHRcdGlmICghc3RpbGxDYWNoZWQuaGFzKGRpc3RybykpIHtcblx0XHRcdFx0dGhpcy5fcmVjb25uZWN0U3RhdGVzLmRlbGV0ZUFuZERpc3Bvc2UoZGlzdHJvKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hdHRlbXB0V1NMUmVjb25uZWN0KGRpc3Rybzogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIGFkZHJlc3M6IHN0cmluZywgb3B0aW9uczogeyB1c2VySW5pdGlhdGVkPzogYm9vbGVhbiB9ID0ge30pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9hdHRlbXB0TWFuYWdlZFJlY29ubmVjdCh7XG5cdFx0XHRraW5kOiAnV1NMJyxcblx0XHRcdGtleTogZGlzdHJvLFxuXHRcdFx0YWRkcmVzcyxcblx0XHRcdHVzZXJJbml0aWF0ZWQ6ICEhb3B0aW9ucy51c2VySW5pdGlhdGVkLFxuXHRcdFx0bWF4QXR0ZW1wdHM6IFdTTF9SRUNPTk5FQ1RfTUFYX0FUVEVNUFRTLFxuXHRcdFx0c2hvdWxkUGF1c2U6IHNob3VsZFBhdXNlV1NMUmVjb25uZWN0QWZ0ZXJGYWlsdXJlLFxuXHRcdFx0Ly8gV1NMLXNwZWNpZmljIGdhdGU6IG5ldmVyIGF1dG8tYm9vdCBhIHN0b3BwZWQgZGlzdHJvLiBUaGUgZ2F0ZSBpc1xuXHRcdFx0Ly8gc2tpcHBlZCBvbiB1c2VyLWluaXRpYXRlZCBhdHRlbXB0cyAodGhlIHVzZXIgZXhwbGljaXRseSBjbGlja2VkXG5cdFx0XHQvLyBSZWNvbm5lY3QgXHUyMDE0IGB3c2wuZXhlIC1kIDxkaXN0cm8+YCB3aWxsIGJvb3QgaXQpLiBXaGVuIHRoZSBnYXRlXG5cdFx0XHQvLyB0cmlnZ2VycyB3ZSByZXR1cm4gV0lUSE9VVCBpbmNyZW1lbnRpbmcgYGF0dGVtcHRzYCBzbyBhIGxvbmcgc3RvcFxuXHRcdFx0Ly8gZG9lc24ndCBidXJuIHRoZSByZXRyeSBidWRnZXQuXG5cdFx0XHRwcmVDaGVjazogYXN5bmMgdXNlckluaXRpYXRlZCA9PiB7XG5cdFx0XHRcdGlmICh1c2VySW5pdGlhdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzdGlsbENhY2hlZCA9IHRoaXMuX3dzbFNlcnZpY2UuZ2V0Q2FjaGVkRGlzdHJvcygpLnNvbWUoZCA9PiBkLmRpc3RybyA9PT0gZGlzdHJvKTtcblx0XHRcdFx0aWYgKCFzdGlsbENhY2hlZCkge1xuXHRcdFx0XHRcdHRoaXMuX3JlY29ubmVjdFN0YXRlcy5kZWxldGVBbmREaXNwb3NlKGRpc3Rybyk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgc2tpcDogdHJ1ZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJ1bm5pbmcgPSBuZXcgU2V0PHN0cmluZz4oYXdhaXQgdGhpcy5fd3NsU2VydmljZS5saXN0UnVubmluZ0Rpc3Ryb3MoKS5jYXRjaCgoKSA9PiBbXSkpO1xuXHRcdFx0XHR0aGlzLl9sYXN0S25vd25SdW5uaW5nRGlzdHJvcyA9IHJ1bm5pbmc7XG5cdFx0XHRcdGlmICghcnVubmluZy5oYXMoZGlzdHJvKSkge1xuXHRcdFx0XHRcdHJldHVybiB7IHNraXA6IHRydWUsIHJlYXNvbjogYGRpc3RybyAke2Rpc3Ryb30gbm90IHJ1bm5pbmdgIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRkb0Nvbm5lY3Q6ICgpID0+IHRoaXMuX3dzbFNlcnZpY2UucmVjb25uZWN0KGRpc3RybywgbmFtZSkudGhlbigoKSA9PiB1bmRlZmluZWQpLFxuXHRcdFx0c2NoZWR1bGU6IHN0YXRlID0+IHRoaXMuX3NjaGVkdWxlV1NMUmVjb25uZWN0KGRpc3RybywgbmFtZSwgYWRkcmVzcywgc3RhdGUpLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2NoZWR1bGVXU0xSZWNvbm5lY3QoZGlzdHJvOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgYWRkcmVzczogc3RyaW5nLCBzdGF0ZTogTWFuYWdlZFJlY29ubmVjdFN0YXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgZGVsYXkgPSBNYXRoLm1pbihXU0xfUkVDT05ORUNUX0lOSVRJQUxfREVMQVkgKiBNYXRoLnBvdygyLCBzdGF0ZS5hdHRlbXB0cyAtIDEpLCBXU0xfUkVDT05ORUNUX01BWF9ERUxBWSk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbV1NMQWdlbnRIb3N0XSBTY2hlZHVsaW5nIFdTTCByZWNvbm5lY3QgZm9yICR7ZGlzdHJvfSBpbiAke2RlbGF5fW1zIChhdHRlbXB0ICR7c3RhdGUuYXR0ZW1wdHMgKyAxfS8ke1dTTF9SRUNPTk5FQ1RfTUFYX0FUVEVNUFRTfSlgKTtcblx0XHRzdGF0ZS5zY2hlZHVsZVJldHJ5KGRlbGF5LCAoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuX2VuYWJsZWQpIHtcblx0XHRcdFx0dGhpcy5fcmVjb25uZWN0U3RhdGVzLmRlbGV0ZUFuZERpc3Bvc2UoZGlzdHJvKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihSZW1vdGVBZ2VudEhvc3RBdXRvQ29ubmVjdFNldHRpbmdJZCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbGl2ZSA9IHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuY29ubmVjdGlvbnMuZmluZChjID0+IGMuYWRkcmVzcyA9PT0gYWRkcmVzcyk7XG5cdFx0XHRpZiAobGl2ZSAmJiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzQ29ubmVjdGVkKGxpdmUuc3RhdHVzKSkge1xuXHRcdFx0XHR0aGlzLl9yZWNvbm5lY3RTdGF0ZXMuZGVsZXRlQW5kRGlzcG9zZShkaXN0cm8pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fcGVuZGluZ1JlY29ubmVjdHMuaGFzKGRpc3RybykpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dm9pZCB0aGlzLl9hdHRlbXB0V1NMUmVjb25uZWN0KGRpc3RybywgbmFtZSwgYWRkcmVzcyk7XG5cdFx0fSk7XG5cdH1cblxuXHQvLyAtLSBPbi1kZW1hbmQgY29ubmVjdGlvbiAtLVxuXG5cdHByaXZhdGUgYXN5bmMgX2Nvbm5lY3RXU0xPbkRlbWFuZChkaXN0cm86IHN0cmluZywgbmFtZTogc3RyaW5nLCBhZGRyZXNzOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0Y29uc3QgaW5GbGlnaHQgPSB0aGlzLl9wZW5kaW5nUmVjb25uZWN0cy5nZXQoZGlzdHJvKTtcblx0XHRcdGlmICghaW5GbGlnaHQpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBpbkZsaWdodC5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgbGl2ZSA9IHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuY29ubmVjdGlvbnMuZmluZChjID0+IGMuYWRkcmVzcyA9PT0gYWRkcmVzcyk7XG5cdFx0XHRpZiAobGl2ZSAmJiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmlzQ29ubmVjdGVkKGxpdmUuc3RhdHVzKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3JlY29ubmVjdFN0YXRlcy5nZXQoZGlzdHJvKT8ucmVzZXRGb3JSZXN1bWUoKTtcblx0XHRhd2FpdCB0aGlzLl9hdHRlbXB0V1NMUmVjb25uZWN0KGRpc3RybywgbmFtZSwgYWRkcmVzcywgeyB1c2VySW5pdGlhdGVkOiB0cnVlIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlYXIgZG93biB0aGUgYWN0aXZlIFdTTCBjb25uZWN0aW9uIGZvciB7QGxpbmsgZGlzdHJvfSBhbmQgY2FuY2VsIGFueVxuXHQgKiBwZW5kaW5nIGF1dG8tcmVjb25uZWN0LiBSZW1vdmVzIHRoZSBjYWNoZWQgZGlzdHJvIHNvIGl0IHdvbid0IGF1dG8tcmVjb25uZWN0LlxuXHQgKlxuXHQgKiBPcmRlciBtYXR0ZXJzOiBgcmVtb3ZlUmVtb3RlQWdlbnRIb3N0YCBNVVNUIHJ1biBiZWZvcmUgdGhlIFdTTCBzZXJ2aWNlXG5cdCAqIHRlYXJkb3duIHNvIHRoZSBzdWJzZXF1ZW50IGNsb3NlIGV2ZW50IGNhbid0IHRyaXAgYXV0by1yZWNvbm5lY3QuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9kaXNjb25uZWN0V1NMT25EZW1hbmQoZGlzdHJvOiBzdHJpbmcsIGFkZHJlc3M6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3JlY29ubmVjdFN0YXRlcy5kZWxldGVBbmREaXNwb3NlKGRpc3Rybyk7XG5cdFx0YXdhaXQgdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5yZW1vdmVSZW1vdGVBZ2VudEhvc3QoYWRkcmVzcyk7XG5cdFx0YXdhaXQgdGhpcy5fd3NsU2VydmljZS5kaXNjb25uZWN0KGRpc3Rybyk7XG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFdTTEFnZW50SG9zdENvbnRyaWJ1dGlvbi5JRCwgV1NMQWdlbnRIb3N0Q29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5BZnRlclJlc3RvcmVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx5QkFBeUIscUNBQXFDLGlDQUFpQyx3Q0FBd0M7QUFDaEosU0FBUyw0QkFBNEIsMEJBQTBCO0FBQy9ELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQWlDLGdDQUFnQyxzQkFBc0I7QUFDdkYsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyw2Q0FBb0U7QUFHN0UsTUFBTSw4QkFBOEI7QUFFcEMsTUFBTSwwQkFBMEI7QUFFaEMsTUFBTSw2QkFBNkI7QUFFbkMsTUFBTSxxQ0FBcUMsSUFBSSxLQUFLO0FBTXBELE1BQU0sc0JBQXNCLElBQUksS0FBSztBQUU5QixTQUFTLG9DQUFvQyxLQUF1QjtBQUMxRSxTQUFPLG9CQUFvQixHQUFHO0FBQy9CO0FBYU8sSUFBTSwyQkFBTixjQUF1QyxzQ0FBd0U7QUFBQSxFQU9ySCxZQUMwQix3QkFDb0IsYUFDdEIsc0JBQ1YsWUFDVSxzQkFDSSwwQkFDTCxxQkFDckI7QUFDRCxVQUFNLHdCQUF3QixzQkFBc0IsWUFBWSxzQkFBc0IsMEJBQTBCLG1CQUFtQjtBQVB0RjtBQUo5QztBQUFBLFNBQVEsMkJBQTJCLG9CQUFJLElBQVk7QUFjbEQsU0FBSyxVQUFVLEtBQUssd0JBQXdCLHVCQUF1QixNQUFNO0FBR3hFLFdBQUssa0JBQWtCLEtBQUs7QUFDNUIsV0FBSyxXQUFXO0FBQUEsSUFDakIsQ0FB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
