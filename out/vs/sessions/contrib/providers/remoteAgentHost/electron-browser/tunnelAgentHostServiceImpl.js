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
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { hasKey } from "../../../../../base/common/types.js";
import { ProxyChannel } from "../../../../../base/parts/ipc/common/ipc.js";
import { localize } from "../../../../../nls.js";
import { IAuthenticationService } from "../../../../../workbench/services/authentication/common/authentication.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IEnvironmentService } from "../../../../../platform/environment/common/environment.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ISharedProcessService } from "../../../../../platform/ipc/electron-browser/services.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { INotificationService, Severity } from "../../../../../platform/notification/common/notification.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { IRemoteAgentHostLocationPreferenceService } from "../../../../../platform/agentHost/common/remoteAgentHostLocationPreference.js";
import { promptRemoteAgentHostLocationPreference } from "../../../../../platform/agentHost/common/remoteAgentHostLocationPreferenceDialog.js";
import { PROTOCOL_VERSION } from "../../../../../platform/agentHost/common/state/protocol/version/registry.js";
import {
  isTunnelGatewaySelectionRejectedError,
  TUNNEL_ADDRESS_PREFIX,
  TUNNEL_AGENT_HOST_CHANNEL,
  TunnelAgentHostsSettingId
} from "../../../../../platform/agentHost/common/tunnelAgentHost.js";
import { AhpJsonlLogger } from "../../../../../platform/agentHost/common/ahpJsonlLogger.js";
import { AgentHostAhpJsonlLoggingSettingId } from "../../../../../platform/agentHost/common/agentService.js";
import { RemoteAgentHostProtocolClient } from "../../../../../platform/agentHost/browser/remoteAgentHostProtocolClient.js";
import { agentsWindowAgentHostClientInfo } from "../../../../../platform/agentHost/common/agentHostClientInfo.js";
import { TunnelRelayTransport } from "../../../../../platform/agentHost/electron-browser/tunnelRelayTransport.js";
const LOG_PREFIX = "[TunnelAgentHost]";
const CACHED_TUNNELS_KEY = "tunnelAgentHost.recentTunnels";
const AUTO_CONNECT_SUPPRESSED_TUNNELS_KEY = "tunnelAgentHost.autoConnectSuppressedTunnels";
function sortedGatewayEndpoints(inventory, type) {
  return inventory.endpoints.filter((endpoint) => endpoint.type === type).sort((a, b) => a.instanceId.localeCompare(b.instanceId));
}
function selectEditorGatewayEndpoint(inventory) {
  return sortedGatewayEndpoints(inventory, "editor")[0];
}
function selectDedicatedGatewayFallback(inventory) {
  const standalone = sortedGatewayEndpoints(inventory, "standalone")[0];
  return standalone ? { instanceId: standalone.instanceId } : { newDedicated: true };
}
function selectGatewayFallbackAfterRejection(rejected, inventory) {
  if (inventory.delegatedInstanceId) {
    return { instanceId: inventory.delegatedInstanceId };
  }
  if (!hasKey(rejected, { instanceId: true })) {
    return void 0;
  }
  const standalone = sortedGatewayEndpoints(inventory, "standalone").find((endpoint) => endpoint.instanceId !== rejected.instanceId);
  return standalone ? { instanceId: standalone.instanceId } : { newDedicated: true };
}
function isEditorGatewaySelection(selection, inventory) {
  return hasKey(selection, { instanceId: true }) && inventory.endpoints.some((endpoint) => endpoint.instanceId === selection.instanceId && endpoint.type === "editor");
}
async function resolveGatewaySelection(locationPreferenceService, dialogService, request) {
  const { hostKey, hostLabel, productName, inventory, userInitiated } = request;
  if (inventory.delegatedInstanceId) {
    return { instanceId: inventory.delegatedInstanceId };
  }
  const editor = selectEditorGatewayEndpoint(inventory);
  const preference = locationPreferenceService.getPreference(hostKey);
  if (preference === "editor") {
    return editor ? { instanceId: editor.instanceId } : selectDedicatedGatewayFallback(inventory);
  }
  if (preference === "dedicated" || !editor || !userInitiated) {
    return selectDedicatedGatewayFallback(inventory);
  }
  const chosen = await promptRemoteAgentHostLocationPreference(dialogService, hostLabel, productName);
  if (!chosen) {
    return void 0;
  }
  locationPreferenceService.setPreference(hostKey, chosen);
  return chosen === "editor" ? { instanceId: editor.instanceId } : selectDedicatedGatewayFallback(inventory);
}
function shouldNotifyTunnelFailover(previousServerType, newServerType, userInitiated, editorFallback = false) {
  if (editorFallback) {
    return newServerType === "standalone" && previousServerType !== "standalone";
  }
  return !userInitiated && previousServerType === "editor" && newServerType === "standalone";
}
function shouldTrackTunnelConnection(connectError) {
  return !connectError;
}
class TunnelFailoverTracker {
  constructor() {
    this._lastSelectedServerType = /* @__PURE__ */ new Map();
  }
  /**
   * Record a successful registration for `address` and report whether it
   * should trigger a failover notification. Always updates the retained
   * metadata, regardless of the returned value.
   */
  recordAndShouldNotify(address, newServerType, userInitiated, editorFallback = false) {
    const previousServerType = this._lastSelectedServerType.get(address);
    const notify = shouldNotifyTunnelFailover(previousServerType, newServerType, userInitiated, editorFallback);
    this._lastSelectedServerType.set(address, newServerType);
    return notify;
  }
}
let TunnelAgentHostService = class extends Disposable {
  constructor(sharedProcessService, _remoteAgentHostService, _logService, _instantiationService, _configurationService, _authenticationService, _productService, _storageService, _environmentService, _locationPreferenceService, _dialogService, _notificationService) {
    super();
    this._remoteAgentHostService = _remoteAgentHostService;
    this._logService = _logService;
    this._instantiationService = _instantiationService;
    this._configurationService = _configurationService;
    this._authenticationService = _authenticationService;
    this._productService = _productService;
    this._storageService = _storageService;
    this._environmentService = _environmentService;
    this._locationPreferenceService = _locationPreferenceService;
    this._dialogService = _dialogService;
    this._notificationService = _notificationService;
    this._onDidChangeTunnels = this._register(new Emitter());
    this.onDidChangeTunnels = this._onDidChangeTunnels.event;
    /** See {@link TunnelFailoverTracker}. */
    this._failoverTracker = new TunnelFailoverTracker();
    this.canDeleteTunnels = true;
    this._mainService = ProxyChannel.toService(
      sharedProcessService.getChannel(TUNNEL_AGENT_HOST_CHANNEL)
    );
  }
  async listTunnels(options) {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      return [];
    }
    const silent = options?.silent ?? false;
    const auth = await this._getToken(silent);
    if (!auth) {
      if (silent) {
        this._logService.debug(`${LOG_PREFIX} No cached token available for silent tunnel enumeration`);
      } else {
        this._logService.warn(`${LOG_PREFIX} No auth token available for tunnel enumeration`);
      }
      return [];
    }
    const additionalNames = this._configurationService.getValue(TunnelAgentHostsSettingId) ?? [];
    return this._mainService.listTunnels(auth.token, auth.provider, additionalNames.length > 0 ? additionalNames : void 0);
  }
  async connect(tunnel, authProvider, options) {
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      throw new Error("Remote agent host connections are not enabled.");
    }
    const auth = authProvider ? await this._getTokenForProvider(authProvider, false) : await this._getToken(false);
    if (!auth) {
      throw new Error("No authentication available");
    }
    this._logService.info(`${LOG_PREFIX} Connecting to tunnel '${tunnel.name}' (${tunnel.tunnelId})`);
    const session = await this._mainService.prepareSelection(auth.token, auth.provider, tunnel.tunnelId, tunnel.clusterId);
    let result;
    let editorFallback = false;
    if (session) {
      const selection = await resolveGatewaySelection(this._locationPreferenceService, this._dialogService, {
        hostKey: `${TUNNEL_ADDRESS_PREFIX}${tunnel.tunnelId}`,
        hostLabel: tunnel.name,
        productName: this._productService.nameShort,
        inventory: session.inventory,
        userInitiated: options?.userInitiated ?? true
      });
      if (!selection) {
        this._logService.info(`${LOG_PREFIX} Agent host selection cancelled for tunnel '${tunnel.name}'`);
        await this._mainService.cancelSelection(session.selectionId);
        return;
      }
      const completed = await this._completeSelectionWithFallback(auth, tunnel, session, selection);
      result = completed.result;
      editorFallback = completed.editorFallback;
    } else {
      result = await this._mainService.connect(auth.token, auth.provider, tunnel.tunnelId, tunnel.clusterId);
    }
    this._logService.info(`${LOG_PREFIX} Tunnel relay connected, connectionId=${result.connectionId}`);
    let protocolClient;
    try {
      const ahpLoggingEnabled = !!this._configurationService.getValue(AgentHostAhpJsonlLoggingSettingId);
      const logger = ahpLoggingEnabled ? this._instantiationService.createInstance(
        AhpJsonlLogger,
        { logsHome: this._environmentService.logsHome, connectionId: result.connectionId, transport: "tunnel" }
      ) : void 0;
      const transport = new TunnelRelayTransport(result.connectionId, this._mainService, logger);
      protocolClient = this._instantiationService.createInstance(
        RemoteAgentHostProtocolClient,
        result.address,
        transport,
        void 0,
        void 0,
        agentsWindowAgentHostClientInfo
      );
    } catch (err) {
      this._logService.error(`${LOG_PREFIX} Connection setup failed`, err);
      this._mainService.disconnect(result.connectionId).catch(() => {
      });
      throw err;
    }
    let status = RemoteAgentHostConnectionStatus.connected;
    let connectError;
    try {
      await protocolClient.connect();
      this._logService.info(`${LOG_PREFIX} Protocol handshake completed with ${result.address}`);
    } catch (err) {
      const incompatible = RemoteAgentHostConnectionStatus.fromConnectError(err, [PROTOCOL_VERSION]);
      if (!RemoteAgentHostConnectionStatus.isIncompatible(incompatible)) {
        this._logService.error(`${LOG_PREFIX} Connection setup failed`, err);
        protocolClient.dispose();
        this._mainService.disconnect(result.connectionId).catch(() => {
        });
        throw err;
      }
      this._logService.warn(`${LOG_PREFIX} Incompatible with ${result.address}: ${incompatible.message}`);
      status = incompatible;
      connectError = err;
    }
    this.cacheTunnel(tunnel, auth.provider);
    try {
      await this._remoteAgentHostService.addManagedConnection({
        name: result.name,
        connectionToken: result.connectionToken,
        connection: {
          type: RemoteAgentHostEntryType.Tunnel,
          tunnelId: tunnel.tunnelId,
          clusterId: tunnel.clusterId,
          label: tunnel.name,
          authProvider: auth.provider
        }
      }, protocolClient, void 0, status);
    } catch (err) {
      this._logService.error(`${LOG_PREFIX} addManagedConnection failed`, err);
      protocolClient.dispose();
      this._mainService.disconnect(result.connectionId).catch(() => {
      });
      throw err;
    }
    if (!shouldTrackTunnelConnection(connectError)) {
      throw connectError;
    }
    this._notifyIfTunnelFailover(result, options, editorFallback);
  }
  /**
   * Send `selection` over the prepared gateway session and, if the gateway
   * *rejects* it, transparently retry once using a fresh inventory.
   *
   * A rejection (see {@link isTunnelGatewaySelectionRejectedError}) is the
   * one failure that proves the tunnel itself is healthy: the CLI answered,
   * it simply could not hand us the endpoint we asked for because that
   * agent host is no longer alive. Its registry entry can outlive it (the
   * entry is only pruned once the owning PID dies, which a crashed or
   * detached editor agent host may not do promptly), so the inventory keeps
   * advertising it and every reconnect would otherwise pick it again and
   * fail — the connection stays down for the whole backoff window instead
   * of failing over. Undelegated tunnels can fail over to a dedicated host
   * within the same attempt; delegated tunnels retry only their bound editor
   * host, which prevents creating an orphaned dedicated host.
   *
   * Every other failure means the tunnel is unreachable, and is rethrown so
   * the caller keeps retrying the same destination and selection unchanged.
   * The stored location preference is never mutated by a fallback, so the
   * editor host is preferred again as soon as it is back.
   */
  async _completeSelectionWithFallback(auth, tunnel, session, selection) {
    try {
      return { result: await this._mainService.completeSelection(session.selectionId, selection), editorFallback: false };
    } catch (err) {
      if (!isTunnelGatewaySelectionRejectedError(err)) {
        throw err;
      }
      const wasEditor = isEditorGatewaySelection(selection, session.inventory);
      this._logService.warn(`${LOG_PREFIX} Gateway rejected the selected agent host for tunnel '${tunnel.name}', retrying an allowed agent host: ${err instanceof Error ? err.message : String(err)}`);
      const retry = await this._mainService.prepareSelection(auth.token, auth.provider, tunnel.tunnelId, tunnel.clusterId);
      if (!retry) {
        throw err;
      }
      const fallback = selectGatewayFallbackAfterRejection(selection, retry.inventory);
      if (!fallback) {
        await this._mainService.cancelSelection(retry.selectionId);
        throw err;
      }
      const result = await this._mainService.completeSelection(retry.selectionId, fallback);
      return { result, editorFallback: wasEditor && result.selected.serverType === "standalone" };
    }
  }
  /**
   * After a successful {@link addManagedConnection} registration, compare
   * the newly selected endpoint's server type against the last one
   * successfully registered for this tunnel's stable address and, if this
   * was a silent editor → standalone failover, show a single informational
   * notification. Delegates the retention + decision to
   * {@link TunnelFailoverTracker}, which always records this connection
   * for future comparisons regardless of whether a notification was shown.
   *
   * `editorFallback` reports that {@link _completeSelectionWithFallback}
   * already performed the substitution within this very attempt, which
   * notifies on its own — see {@link shouldNotifyTunnelFailover}.
   */
  _notifyIfTunnelFailover(result, options, editorFallback) {
    const userInitiated = options?.userInitiated ?? true;
    const shouldNotify = this._failoverTracker.recordAndShouldNotify(result.address, result.selected.serverType, userInitiated, editorFallback);
    if (shouldNotify) {
      this._notificationService.notify({
        severity: Severity.Info,
        // The in-attempt fallback can happen on a first connect too,
        // where nothing was interrupted and nothing was reconnected.
        message: editorFallback ? localize(
          "tunnelAgentHostRejectedEditorNotification",
          "The editor agent host is no longer running. Connected to a dedicated agent host instead."
        ) : localize(
          "tunnelAgentHostFailoverNotification",
          "The editor agent host exited. Reconnected to a dedicated agent host. In-progress work may have been interrupted."
        )
      });
    }
  }
  async deleteTunnel(tunnel) {
    const auth = await this._getToken(false);
    if (!auth) {
      throw new Error("No authentication available");
    }
    this._logService.info(`${LOG_PREFIX} Deleting tunnel '${tunnel.name}' (${tunnel.tunnelId})`);
    await this._mainService.deleteTunnel(auth.token, auth.provider, tunnel.tunnelId, tunnel.clusterId);
    this.removeCachedTunnel(tunnel.tunnelId);
  }
  async disconnect(address) {
    await this._remoteAgentHostService.removeRemoteAgentHost(address);
    this._onDidChangeTunnels.fire();
  }
  /**
   * Get an auth token, trying cached sessions first (silent),
   * then prompting interactively if `silent` is false.
   */
  async _getToken(silent) {
    if (this._lastAuthProvider) {
      const result = await this._getTokenForProvider(this._lastAuthProvider, silent);
      if (result) {
        return result;
      }
    }
    for (const provider of ["github", "microsoft"]) {
      if (provider === this._lastAuthProvider) {
        continue;
      }
      const result = await this._getTokenForProvider(provider, true);
      if (result) {
        return result;
      }
    }
    return void 0;
  }
  /**
   * Get a token for a specific auth provider.
   * @param provider The auth provider to use.
   * @param silent If true, only try cached sessions. If false, prompt the user.
   */
  _getScopesForProvider(provider) {
    const config = this._productService.tunnelApplicationConfig?.authenticationProviders;
    return config?.[provider]?.scopes ?? [];
  }
  async _getTokenForProvider(provider, silent) {
    const providerId = provider;
    const scopes = this._getScopesForProvider(provider);
    if (scopes.length === 0) {
      return void 0;
    }
    try {
      let sessions = await this._authenticationService.getSessions(providerId, scopes, {}, true);
      if (sessions.length === 0) {
        const allSessions = await this._authenticationService.getSessions(providerId, void 0, {}, true);
        const requestedSet = new Set(scopes);
        let bestSession;
        let bestExtra = Infinity;
        for (const session of allSessions) {
          const sessionScopes = new Set(session.scopes);
          let isSuperset = true;
          for (const scope of requestedSet) {
            if (!sessionScopes.has(scope)) {
              isSuperset = false;
              break;
            }
          }
          if (isSuperset) {
            const extra = sessionScopes.size - requestedSet.size;
            if (extra < bestExtra) {
              bestExtra = extra;
              bestSession = session;
            }
          }
        }
        if (bestSession) {
          sessions = [bestSession];
        }
      }
      if (sessions.length === 0 && !silent) {
        const session = await this._authenticationService.createSession(providerId, scopes, { activateImmediate: true });
        sessions = [session];
      }
      if (sessions.length > 0) {
        const token = sessions[0].accessToken;
        if (token) {
          this._lastAuthProvider = provider;
          return { token, provider };
        }
      }
    } catch (err) {
      this._logService.debug(`${LOG_PREFIX} Failed to get ${provider} token: ${err}`);
    }
    return void 0;
  }
  async getAuthProvider(options) {
    const result = await this._getToken(options?.silent ?? true);
    return result?.provider;
  }
  getCachedTunnels() {
    const raw = this._storageService.get(CACHED_TUNNELS_KEY, StorageScope.APPLICATION);
    if (!raw) {
      return [];
    }
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  cacheTunnel(tunnel, authProvider) {
    const cached = this.getCachedTunnels();
    const filtered = cached.filter((t) => t.tunnelId !== tunnel.tunnelId);
    filtered.unshift({
      tunnelId: tunnel.tunnelId,
      clusterId: tunnel.clusterId,
      name: tunnel.name,
      authProvider
    });
    this.clearAutoConnectSuppression(tunnel.tunnelId);
    this._storeCachedTunnels(filtered);
    this._onDidChangeTunnels.fire();
  }
  removeCachedTunnel(tunnelId) {
    const cached = this.getCachedTunnels();
    this._storeCachedTunnels(cached.filter((t) => t.tunnelId !== tunnelId));
    this.clearAutoConnectSuppression(tunnelId);
    this._onDidChangeTunnels.fire();
  }
  isAutoConnectSuppressed(tunnelId) {
    return this._getAutoConnectSuppressedTunnels().has(tunnelId);
  }
  suppressAutoConnect(tunnelId) {
    const suppressed = this._getAutoConnectSuppressedTunnels();
    suppressed.add(tunnelId);
    this._storeAutoConnectSuppressedTunnels(suppressed);
  }
  clearAutoConnectSuppression(tunnelId) {
    const suppressed = this._getAutoConnectSuppressedTunnels();
    if (!suppressed.delete(tunnelId)) {
      return;
    }
    this._storeAutoConnectSuppressedTunnels(suppressed);
  }
  _storeCachedTunnels(tunnels) {
    if (tunnels.length === 0) {
      this._storageService.remove(CACHED_TUNNELS_KEY, StorageScope.APPLICATION);
    } else {
      this._storageService.store(CACHED_TUNNELS_KEY, JSON.stringify(tunnels), StorageScope.APPLICATION, StorageTarget.USER);
    }
  }
  _getAutoConnectSuppressedTunnels() {
    const raw = this._storageService.get(AUTO_CONNECT_SUPPRESSED_TUNNELS_KEY, StorageScope.APPLICATION);
    if (!raw) {
      return /* @__PURE__ */ new Set();
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return /* @__PURE__ */ new Set();
      }
      return new Set(parsed.filter((item) => typeof item === "string"));
    } catch {
      return /* @__PURE__ */ new Set();
    }
  }
  _storeAutoConnectSuppressedTunnels(tunnelIds) {
    if (tunnelIds.size === 0) {
      this._storageService.remove(AUTO_CONNECT_SUPPRESSED_TUNNELS_KEY, StorageScope.APPLICATION);
    } else {
      this._storageService.store(AUTO_CONNECT_SUPPRESSED_TUNNELS_KEY, JSON.stringify([...tunnelIds]), StorageScope.APPLICATION, StorageTarget.USER);
    }
  }
};
TunnelAgentHostService = __decorateClass([
  __decorateParam(0, ISharedProcessService),
  __decorateParam(1, IRemoteAgentHostService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IAuthenticationService),
  __decorateParam(6, IProductService),
  __decorateParam(7, IStorageService),
  __decorateParam(8, IEnvironmentService),
  __decorateParam(9, IRemoteAgentHostLocationPreferenceService),
  __decorateParam(10, IDialogService),
  __decorateParam(11, INotificationService)
], TunnelAgentHostService);
export {
  TunnelAgentHostService,
  TunnelFailoverTracker,
  resolveGatewaySelection,
  selectDedicatedGatewayFallback,
  selectEditorGatewayEndpoint,
  selectGatewayFallbackAfterRejection,
  shouldNotifyTunnelFailover,
  shouldTrackTunnelConnection
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxyZW1vdGVBZ2VudEhvc3RcXGVsZWN0cm9uLWJyb3dzZXJcXHR1bm5lbEFnZW50SG9zdFNlcnZpY2VJbXBsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGhhc0tleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFByb3h5Q2hhbm5lbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9jb21tb24vYXV0aGVudGljYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTaGFyZWRQcm9jZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2lwYy9lbGVjdHJvbi1icm93c2VyL3NlcnZpY2VzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLCBSZW1vdGVBZ2VudEhvc3RFbnRyeVR5cGUsIFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9yZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2UuanMnO1xuaW1wb3J0IHsgcHJvbXB0UmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9yZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2VEaWFsb2cuanMnO1xuaW1wb3J0IHsgUFJPVE9DT0xfVkVSU0lPTiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvdmVyc2lvbi9yZWdpc3RyeS5qcyc7XG5pbXBvcnQge1xuXHRpc1R1bm5lbEdhdGV3YXlTZWxlY3Rpb25SZWplY3RlZEVycm9yLFxuXHRJVHVubmVsQWdlbnRIb3N0U2VydmljZSxcblx0VFVOTkVMX0FERFJFU1NfUFJFRklYLFxuXHRUVU5ORUxfQUdFTlRfSE9TVF9DSEFOTkVMLFxuXHRUdW5uZWxBZ2VudEhvc3RzU2V0dGluZ0lkLFxuXHR0eXBlIElDYWNoZWRUdW5uZWwsXG5cdHR5cGUgSVR1bm5lbEFnZW50SG9zdE1haW5TZXJ2aWNlLFxuXHR0eXBlIElUdW5uZWxDb25uZWN0UmVzdWx0LFxuXHR0eXBlIElUdW5uZWxHYXRld2F5RW5kcG9pbnQsXG5cdHR5cGUgSVR1bm5lbEdhdGV3YXlJbnZlbnRvcnksXG5cdHR5cGUgSVR1bm5lbEdhdGV3YXlTZWxlY3Rpb24sXG5cdHR5cGUgSVR1bm5lbEdhdGV3YXlTZWxlY3Rpb25TZXNzaW9uLFxuXHR0eXBlIElUdW5uZWxJbmZvLFxuXHR0eXBlIFR1bm5lbEdhdGV3YXlTZXJ2ZXJUeXBlLFxufSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3R1bm5lbEFnZW50SG9zdC5qcyc7XG5pbXBvcnQgeyBBaHBKc29ubExvZ2dlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWhwSnNvbmxMb2dnZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0QWhwSnNvbmxMb2dnaW5nU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvYnJvd3Nlci9yZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudC5qcyc7XG5pbXBvcnQgeyBhZ2VudHNXaW5kb3dBZ2VudEhvc3RDbGllbnRJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RDbGllbnRJbmZvLmpzJztcbmltcG9ydCB7IFR1bm5lbFJlbGF5VHJhbnNwb3J0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2VsZWN0cm9uLWJyb3dzZXIvdHVubmVsUmVsYXlUcmFuc3BvcnQuanMnO1xuXG5jb25zdCBMT0dfUFJFRklYID0gJ1tUdW5uZWxBZ2VudEhvc3RdJztcblxuLyoqIFN0b3JhZ2Uga2V5IGZvciByZWNlbnRseSB1c2VkIHR1bm5lbCBjYWNoZS4gKi9cbmNvbnN0IENBQ0hFRF9UVU5ORUxTX0tFWSA9ICd0dW5uZWxBZ2VudEhvc3QucmVjZW50VHVubmVscyc7XG4vKiogU3RvcmFnZSBrZXkgZm9yIHR1bm5lbHMgdGhlIHVzZXIgZXhwbGljaXRseSBkaXNjb25uZWN0ZWQuICovXG5jb25zdCBBVVRPX0NPTk5FQ1RfU1VQUFJFU1NFRF9UVU5ORUxTX0tFWSA9ICd0dW5uZWxBZ2VudEhvc3QuYXV0b0Nvbm5lY3RTdXBwcmVzc2VkVHVubmVscyc7XG5cbi8qKiBFbmRwb2ludHMgb2YgYHR5cGVgLCBzb3J0ZWQgZGV0ZXJtaW5pc3RpY2FsbHkgYnkgYGluc3RhbmNlSWRgLiAqL1xuZnVuY3Rpb24gc29ydGVkR2F0ZXdheUVuZHBvaW50cyhpbnZlbnRvcnk6IElUdW5uZWxHYXRld2F5SW52ZW50b3J5LCB0eXBlOiBUdW5uZWxHYXRld2F5U2VydmVyVHlwZSk6IElUdW5uZWxHYXRld2F5RW5kcG9pbnRbXSB7XG5cdHJldHVybiBpbnZlbnRvcnkuZW5kcG9pbnRzXG5cdFx0LmZpbHRlcihlbmRwb2ludCA9PiBlbmRwb2ludC50eXBlID09PSB0eXBlKVxuXHRcdC5zb3J0KChhLCBiKSA9PiBhLmluc3RhbmNlSWQubG9jYWxlQ29tcGFyZShiLmluc3RhbmNlSWQpKTtcbn1cblxuLyoqIFRoZSBsaXZlIGBlZGl0b3JgIGVuZHBvaW50IHRvIHVzZSwgY2hvc2VuIGRldGVybWluaXN0aWNhbGx5IHdoZW4gc2V2ZXJhbCBleGlzdC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZWxlY3RFZGl0b3JHYXRld2F5RW5kcG9pbnQoaW52ZW50b3J5OiBJVHVubmVsR2F0ZXdheUludmVudG9yeSk6IElUdW5uZWxHYXRld2F5RW5kcG9pbnQgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gc29ydGVkR2F0ZXdheUVuZHBvaW50cyhpbnZlbnRvcnksICdlZGl0b3InKVswXTtcbn1cblxuLyoqXG4gKiBEZXRlcm1pbmlzdGljIGRlZGljYXRlZC1hZ2VudC1ob3N0IHNlbGVjdGlvbjogcmV1c2UgdGhlIGZpcnN0IGxpdmVcbiAqIHN0YW5kYWxvbmUgaW5zdGFuY2UgaWYgb25lIGV4aXN0cywgb3RoZXJ3aXNlIHJlcXVlc3QgYSBuZXcgZGVkaWNhdGVkIG9uZS5cbiAqXG4gKiBDYWxsZXJzIG11c3Qgbm90IHJlYWNoIHRoaXMgb24gYSBkZWxlZ2F0ZWQgdHVubmVsIFx1MjAxNCB7QGxpbmsgcmVzb2x2ZUdhdGV3YXlTZWxlY3Rpb259XG4gKiBzaG9ydC1jaXJjdWl0cyBiZWZvcmUgYW55IGRlZGljYXRlZCBmYWxsYmFjaywgc2luY2UgYSBkZWRpY2F0ZWQgaG9zdCBiZWhpbmRcbiAqIGFuIGVkaXRvci1ib3VuZCB0dW5uZWwgd291bGQgb3V0bGl2ZSB0aGUgdHVubmVsIGFuZCBiZSB1bnJlYWNoYWJsZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNlbGVjdERlZGljYXRlZEdhdGV3YXlGYWxsYmFjayhpbnZlbnRvcnk6IElUdW5uZWxHYXRld2F5SW52ZW50b3J5KTogSVR1bm5lbEdhdGV3YXlTZWxlY3Rpb24ge1xuXHRjb25zdCBzdGFuZGFsb25lID0gc29ydGVkR2F0ZXdheUVuZHBvaW50cyhpbnZlbnRvcnksICdzdGFuZGFsb25lJylbMF07XG5cdHJldHVybiBzdGFuZGFsb25lID8geyBpbnN0YW5jZUlkOiBzdGFuZGFsb25lLmluc3RhbmNlSWQgfSA6IHsgbmV3RGVkaWNhdGVkOiB0cnVlIH07XG59XG5cbi8qKlxuICogVGhlIHNlbGVjdGlvbiB0byByZXRyeSB3aXRoIGFmdGVyIHRoZSBnYXRld2F5ICpyZWplY3RlZCogYHJlamVjdGVkYCAoc2VlXG4gKiB7QGxpbmsgaXNUdW5uZWxHYXRld2F5U2VsZWN0aW9uUmVqZWN0ZWRFcnJvcn0pIFx1MjAxNCB0aGUgdHVubmVsIGlzIHVwIGFuZCBvbmx5XG4gKiB0aGUgZW5kcG9pbnQgd2UgYXNrZWQgZm9yIGlzIGdvbmUsIHR5cGljYWxseSBhbiBgZWRpdG9yYCBlbmRwb2ludCB3aG9zZVxuICogYWdlbnQgaG9zdCBleGl0ZWQgd2hpbGUgaXRzIHJlZ2lzdHJ5IGVudHJ5IGxpbmdlcmVkLiBQaWNrcyBhIGRlZGljYXRlZFxuICogaG9zdCBleGFjdGx5IGxpa2Uge0BsaW5rIHNlbGVjdERlZGljYXRlZEdhdGV3YXlGYWxsYmFja30sIGJ1dCBuZXZlciB0aGVcbiAqIGluc3RhbmNlIHRoYXQgd2FzIGp1c3QgcmVqZWN0ZWQuIEEgZGVsZWdhdGVkIHR1bm5lbCBpbnN0ZWFkIHJldHJpZXMgb25seVxuICogaXRzIGJvdW5kIGVuZHBvaW50OiBpdCBtdXN0IG5ldmVyIHNlbGVjdCBvciBzcGF3biBhIGRlZGljYXRlZCBob3N0LlxuICpcbiAqIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGVyZSBpcyBub3RoaW5nIG1lYW5pbmdmdWwgbGVmdCB0byB0cnk6IHRoZVxuICogcmVqZWN0ZWQgc2VsZWN0aW9uIHdhcyBpdHNlbGYgYSByZXF1ZXN0IGZvciBhIGJyYW5kIG5ldyBkZWRpY2F0ZWRcbiAqIGluc3RhbmNlLCBzbyB0aGUgZ2F0ZXdheSBmYWlsZWQgdG8gKnNwYXduKiBhIGhvc3QgcmF0aGVyIHRoYW4gZmFpbGluZyB0b1xuICogcmVhY2ggYW4gZXhpc3Rpbmcgb25lLCBhbmQgcmV0cnlpbmcgd291bGQganVzdCBmYWlsIHRoZSBzYW1lIHdheS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNlbGVjdEdhdGV3YXlGYWxsYmFja0FmdGVyUmVqZWN0aW9uKHJlamVjdGVkOiBJVHVubmVsR2F0ZXdheVNlbGVjdGlvbiwgaW52ZW50b3J5OiBJVHVubmVsR2F0ZXdheUludmVudG9yeSk6IElUdW5uZWxHYXRld2F5U2VsZWN0aW9uIHwgdW5kZWZpbmVkIHtcblx0aWYgKGludmVudG9yeS5kZWxlZ2F0ZWRJbnN0YW5jZUlkKSB7XG5cdFx0cmV0dXJuIHsgaW5zdGFuY2VJZDogaW52ZW50b3J5LmRlbGVnYXRlZEluc3RhbmNlSWQgfTtcblx0fVxuXHRpZiAoIWhhc0tleShyZWplY3RlZCwgeyBpbnN0YW5jZUlkOiB0cnVlIH0pKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBzdGFuZGFsb25lID0gc29ydGVkR2F0ZXdheUVuZHBvaW50cyhpbnZlbnRvcnksICdzdGFuZGFsb25lJykuZmluZChlbmRwb2ludCA9PiBlbmRwb2ludC5pbnN0YW5jZUlkICE9PSByZWplY3RlZC5pbnN0YW5jZUlkKTtcblx0cmV0dXJuIHN0YW5kYWxvbmUgPyB7IGluc3RhbmNlSWQ6IHN0YW5kYWxvbmUuaW5zdGFuY2VJZCB9IDogeyBuZXdEZWRpY2F0ZWQ6IHRydWUgfTtcbn1cblxuLyoqIFdoZXRoZXIgYHNlbGVjdGlvbmAgcGlja2VkIGEgbGl2ZSBgZWRpdG9yYCBlbmRwb2ludCBvdXQgb2YgYGludmVudG9yeWAuICovXG5mdW5jdGlvbiBpc0VkaXRvckdhdGV3YXlTZWxlY3Rpb24oc2VsZWN0aW9uOiBJVHVubmVsR2F0ZXdheVNlbGVjdGlvbiwgaW52ZW50b3J5OiBJVHVubmVsR2F0ZXdheUludmVudG9yeSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaGFzS2V5KHNlbGVjdGlvbiwgeyBpbnN0YW5jZUlkOiB0cnVlIH0pXG5cdFx0JiYgaW52ZW50b3J5LmVuZHBvaW50cy5zb21lKGVuZHBvaW50ID0+IGVuZHBvaW50Lmluc3RhbmNlSWQgPT09IHNlbGVjdGlvbi5pbnN0YW5jZUlkICYmIGVuZHBvaW50LnR5cGUgPT09ICdlZGl0b3InKTtcbn1cblxuLyoqIElucHV0cyBuZWVkZWQgdG8gcmVzb2x2ZSBhIHByb3RvY29sLXY2IGdhdGV3YXkgZW5kcG9pbnQgc2VsZWN0aW9uLiBTZWUge0BsaW5rIHJlc29sdmVHYXRld2F5U2VsZWN0aW9ufS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUdhdGV3YXlTZWxlY3Rpb25SZXF1ZXN0IHtcblx0LyoqIFN0YWJsZSB7QGxpbmsgSVJlbW90ZUFnZW50SG9zdExvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2V9IGtleSwgZS5nLiBgdHVubmVsOjx0dW5uZWxJZD5gLiAqL1xuXHRyZWFkb25seSBob3N0S2V5OiBzdHJpbmc7XG5cdC8qKiBVc2VyLWZhY2luZyB0dW5uZWwgbmFtZSBzaG93biBpbiB0aGUgbG9jYXRpb24tcHJlZmVyZW5jZSBtb2RhbC4gKi9cblx0cmVhZG9ubHkgaG9zdExhYmVsOiBzdHJpbmc7XG5cdC8qKiBQcm9kdWN0IG5hbWUgKHR5cGljYWxseSB7QGxpbmsgSVByb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydH0pIHN1YnN0aXR1dGVkIGludG8gdGhlIG1vZGFsJ3MgZWRpdG9yLW9wdGlvbiBkZXRhaWwgdGV4dC4gKi9cblx0cmVhZG9ubHkgcHJvZHVjdE5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgaW52ZW50b3J5OiBJVHVubmVsR2F0ZXdheUludmVudG9yeTtcblx0cmVhZG9ubHkgdXNlckluaXRpYXRlZDogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBSZXNvbHZlIHdoaWNoIGFnZW50IGhvc3QgZW5kcG9pbnQgdG8gc2VsZWN0IGZvciBhIHByb3RvY29sLXY2IGdhdGV3YXlcbiAqIHNlc3Npb24sIGRyaXZlbiBieSB0aGUgdXNlcidzIHNhdmVkIHtAbGluayBJUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlU2VydmljZX1cbiAqIHByZWZlcmVuY2UgZm9yIHRoZSBob3N0IHJhdGhlciB0aGFuIGFuIGVuZHBvaW50IHBpY2tlcjpcbiAqXG4gKiAtIEEgc2F2ZWQgYCdlZGl0b3InYCBwcmVmZXJlbmNlIHNlbGVjdHMgdGhlIGxpdmUgZWRpdG9yIGVuZHBvaW50IGlmIG9uZVxuICogICBleGlzdHMsIG9yIGZhbGxzIGJhY2sgdG8gYSBkZWRpY2F0ZWQgZW5kcG9pbnQgKHdpdGhvdXQgY2hhbmdpbmcgdGhlXG4gKiAgIHByZWZlcmVuY2UpIGlmIGl0IGRvZXNuJ3QgXHUyMDE0IGEgc3RvcmVkIGVkaXRvciBwcmVmZXJlbmNlIGlzIGV4cGxpY2l0XG4gKiAgIGNvbnNlbnQsIHNvIHRoaXMgYXBwbGllcyBldmVuIGZvciBhIGJhY2tncm91bmQgcmVjb25uZWN0LlxuICogLSBBIHNhdmVkIGAnZGVkaWNhdGVkJ2AgcHJlZmVyZW5jZSBhbHdheXMgZmFsbHMgYmFjayB0byBhIGRlZGljYXRlZFxuICogICBlbmRwb2ludCBhbmQgbmV2ZXIgcHJvbXB0cy5cbiAqIC0gV2l0aCBubyBzYXZlZCBwcmVmZXJlbmNlOiBmYWxscyBiYWNrIHRvIGEgZGVkaWNhdGVkIGVuZHBvaW50IChubyBwcm9tcHQsXG4gKiAgIG5vIHBlcnNpc3RlbmNlKSB3aGVuIG5vIGVkaXRvciBlbmRwb2ludCBleGlzdHMsIG9yIGZvciBhIGJhY2tncm91bmRcbiAqICAgY29ubmVjdGlvbjsgb3RoZXJ3aXNlIHByb21wdHMgd2l0aCB7QGxpbmsgcHJvbXB0UmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlfVxuICogICBhbmQgcGVyc2lzdHMgdGhlIHVzZXIncyBjaG9pY2UuXG4gKlxuICogUmV0dXJucyBgdW5kZWZpbmVkYCBvbmx5IHdoZW4gdGhlIHVzZXIgY2FuY2VscyB0aGF0IG1vZGFsLlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZUdhdGV3YXlTZWxlY3Rpb24oXG5cdGxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2U6IElSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlLFxuXHRkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0cmVxdWVzdDogSUdhdGV3YXlTZWxlY3Rpb25SZXF1ZXN0LFxuKTogUHJvbWlzZTxJVHVubmVsR2F0ZXdheVNlbGVjdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRjb25zdCB7IGhvc3RLZXksIGhvc3RMYWJlbCwgcHJvZHVjdE5hbWUsIGludmVudG9yeSwgdXNlckluaXRpYXRlZCB9ID0gcmVxdWVzdDtcblx0Ly8gQSBkZWRpY2F0ZWQgaG9zdCBiZWhpbmQgYW4gZWRpdG9yLWJvdW5kIHR1bm5lbCB3b3VsZCBiZSBvcnBoYW5lZCB3aGVuXG5cdC8vIHRoYXQgZWRpdG9yIGV4aXRzLCBzbyB0aGlzIHR1bm5lbCBtYXkgb25seSB1c2UgaXRzIGRlbGVnYXRlZCBlbmRwb2ludC5cblx0aWYgKGludmVudG9yeS5kZWxlZ2F0ZWRJbnN0YW5jZUlkKSB7XG5cdFx0cmV0dXJuIHsgaW5zdGFuY2VJZDogaW52ZW50b3J5LmRlbGVnYXRlZEluc3RhbmNlSWQgfTtcblx0fVxuXHRjb25zdCBlZGl0b3IgPSBzZWxlY3RFZGl0b3JHYXRld2F5RW5kcG9pbnQoaW52ZW50b3J5KTtcblx0Y29uc3QgcHJlZmVyZW5jZSA9IGxvY2F0aW9uUHJlZmVyZW5jZVNlcnZpY2UuZ2V0UHJlZmVyZW5jZShob3N0S2V5KTtcblxuXHRpZiAocHJlZmVyZW5jZSA9PT0gJ2VkaXRvcicpIHtcblx0XHRyZXR1cm4gZWRpdG9yID8geyBpbnN0YW5jZUlkOiBlZGl0b3IuaW5zdGFuY2VJZCB9IDogc2VsZWN0RGVkaWNhdGVkR2F0ZXdheUZhbGxiYWNrKGludmVudG9yeSk7XG5cdH1cblx0aWYgKHByZWZlcmVuY2UgPT09ICdkZWRpY2F0ZWQnIHx8ICFlZGl0b3IgfHwgIXVzZXJJbml0aWF0ZWQpIHtcblx0XHRyZXR1cm4gc2VsZWN0RGVkaWNhdGVkR2F0ZXdheUZhbGxiYWNrKGludmVudG9yeSk7XG5cdH1cblxuXHRjb25zdCBjaG9zZW4gPSBhd2FpdCBwcm9tcHRSZW1vdGVBZ2VudEhvc3RMb2NhdGlvblByZWZlcmVuY2UoZGlhbG9nU2VydmljZSwgaG9zdExhYmVsLCBwcm9kdWN0TmFtZSk7XG5cdGlmICghY2hvc2VuKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRsb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlLnNldFByZWZlcmVuY2UoaG9zdEtleSwgY2hvc2VuKTtcblx0cmV0dXJuIGNob3NlbiA9PT0gJ2VkaXRvcicgPyB7IGluc3RhbmNlSWQ6IGVkaXRvci5pbnN0YW5jZUlkIH0gOiBzZWxlY3REZWRpY2F0ZWRHYXRld2F5RmFsbGJhY2soaW52ZW50b3J5KTtcbn1cblxuLyoqXG4gKiBEZWNpZGUgd2hldGhlciBhIHR1bm5lbC1mYWlsb3ZlciBub3RpZmljYXRpb24gc2hvdWxkIGJlIHNob3duIGFmdGVyIGFcbiAqIGNvbm5lY3Rpb24gYXR0ZW1wdCdzIHtAbGluayBJUmVtb3RlQWdlbnRIb3N0U2VydmljZS5hZGRNYW5hZ2VkQ29ubmVjdGlvbn1cbiAqIGhhcyBhbHJlYWR5IHN1Y2NlZWRlZC4gRmlyZXMgaW4gdHdvIGNhc2VzLCBib3RoIG9mIHdoaWNoIG1lYW4gdGhlIGVkaXRvclxuICogcHJvY2VzcyB0aGF0IHVzZWQgdG8gaG9zdCB0aGUgY29ubmVjdGlvbiBpcyBnb25lIGFuZCBhIGRlZGljYXRlZCBhZ2VudFxuICogaG9zdCBzaWxlbnRseSB0b29rIGl0cyBwbGFjZTpcbiAqXG4gKiAtIGBlZGl0b3JGYWxsYmFja2A6IHRoaXMgdmVyeSBhdHRlbXB0IGFza2VkIHRoZSBnYXRld2F5IGZvciBhIGxpdmUtbG9va2luZ1xuICogICBgZWRpdG9yYCBlbmRwb2ludCwgd2FzIHJlamVjdGVkIGJlY2F1c2UgaXQgaXMgbm90IGFjdHVhbGx5IHJlYWNoYWJsZSxcbiAqICAgYW5kIHRyYW5zcGFyZW50bHkgcmV0cmllZCBhZ2FpbnN0IGEgZGVkaWNhdGVkIGhvc3QuIFRoZSBzdWJzdGl0dXRpb25cbiAqICAgaGFwcGVuZWQgaW5zaWRlIGEgc2luZ2xlIGNvbm5lY3QsIHNvIHRoZXJlIGlzIG5vIGVhcmxpZXIgcmVnaXN0cmF0aW9uIHRvXG4gKiAgIGNvbXBhcmUgYWdhaW5zdCBcdTIwMTQgYW5kIGl0IGlzIGVxdWFsbHkgc3VycHJpc2luZyBmb3IgYSB1c2VyLWluaXRpYXRlZFxuICogICBjb25uZWN0LCB3aGljaCBleHBsaWNpdGx5IGFza2VkIGZvciB0aGUgZWRpdG9yIGhvc3QuIEEgc3RhbGUgYGVkaXRvcmBcbiAqICAgZW50cnkgY2FuIGxpbmdlciBpbiB0aGUgcmVtb3RlIHJlZ2lzdHJ5IGZvciBhcyBsb25nIGFzIGl0cyBQSUQgZG9lcywgc29cbiAqICAgZXZlcnkgbGF0ZXIgcmVjb25uZWN0IHJlcGVhdHMgdGhlIHNhbWUgZmFsbGJhY2s7IHRob3NlIG11c3Qgc3RheSBxdWlldFxuICogICBvbmNlIHRoZSBhZGRyZXNzIGlzIGFscmVhZHkga25vd24gdG8gYmUgb24gYSBgc3RhbmRhbG9uZWAgaG9zdCwgb3IgdGhlXG4gKiAgIHVzZXIgd291bGQgYmUgbm90aWZpZWQgYWdhaW4gb24gZXZlcnkgcmVjb25uZWN0LlxuICogLSBBbiBhdXRvbWF0aWMvYmFja2dyb3VuZCByZWNvbm5lY3QgKG5ldmVyIGEgdXNlci1pbml0aWF0ZWQgb25lKSB0aGF0XG4gKiAgIG1vdmVkIGEgcHJldmlvdXNseSBgZWRpdG9yYC1vd25lZCBlbmRwb2ludCB0byBhIGBzdGFuZGFsb25lYCBvbmUgZm9yIHRoZVxuICogICBzYW1lIHN0YWJsZSB0dW5uZWwgYWRkcmVzcy5cbiAqXG4gKiBFeHBvcnRlZCBzbyB0aGUgZGVjaXNpb24gY2FuIGJlIHVuaXQgdGVzdGVkIHdpdGhvdXQgY29uc3RydWN0aW5nIHRoZSBmdWxsXG4gKiBzZXJ2aWNlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2hvdWxkTm90aWZ5VHVubmVsRmFpbG92ZXIoXG5cdHByZXZpb3VzU2VydmVyVHlwZTogVHVubmVsR2F0ZXdheVNlcnZlclR5cGUgfCAndW5rbm93bicgfCB1bmRlZmluZWQsXG5cdG5ld1NlcnZlclR5cGU6IFR1bm5lbEdhdGV3YXlTZXJ2ZXJUeXBlIHwgJ3Vua25vd24nLFxuXHR1c2VySW5pdGlhdGVkOiBib29sZWFuLFxuXHRlZGl0b3JGYWxsYmFjayA9IGZhbHNlLFxuKTogYm9vbGVhbiB7XG5cdGlmIChlZGl0b3JGYWxsYmFjaykge1xuXHRcdHJldHVybiBuZXdTZXJ2ZXJUeXBlID09PSAnc3RhbmRhbG9uZScgJiYgcHJldmlvdXNTZXJ2ZXJUeXBlICE9PSAnc3RhbmRhbG9uZSc7XG5cdH1cblx0cmV0dXJuICF1c2VySW5pdGlhdGVkICYmIHByZXZpb3VzU2VydmVyVHlwZSA9PT0gJ2VkaXRvcicgJiYgbmV3U2VydmVyVHlwZSA9PT0gJ3N0YW5kYWxvbmUnO1xufVxuXG4vKipcbiAqIFdoZXRoZXIgdGhlIHR1bm5lbC1mYWlsb3ZlciB0cmFja2VyL25vdGlmaWNhdGlvbiBzdGVwIHNob3VsZCBydW4gYXQgYWxsXG4gKiBmb3IgYSBjb21wbGV0ZWQgYGNvbm5lY3QoKWAgYXR0ZW1wdC4gTXVzdCBiZSBgZmFsc2VgIHdoZW5ldmVyIHRoZVxuICogYXR0ZW1wdCBpcyB1bHRpbWF0ZWx5IGEgZmFpbHVyZSBcdTIwMTQgaW5jbHVkaW5nIGEgcmVnaXN0ZXJlZC1mb3ItdXBncmFkZVxuICogaW5jb21wYXRpYmxlIGhhbmRzaGFrZSAoYGNvbm5lY3RFcnJvcmAgc2V0KSBcdTIwMTQgZXZlbiB0aG91Z2hcbiAqIGBhZGRNYW5hZ2VkQ29ubmVjdGlvbmAgYWxyZWFkeSBzdWNjZWVkZWQgYW5kIHRoZSBlbmRwb2ludCBpcyByZWdpc3RlcmVkLlxuICogQSBmYWlsZWQgcmVjb25uZWN0IG11c3QgbmV2ZXIgdXBkYXRlIHtAbGluayBUdW5uZWxGYWlsb3ZlclRyYWNrZXJ9IG9yXG4gKiBub3RpZnk6IHRoZSB0cmFja2VyIHdvdWxkIG90aGVyd2lzZSByZWNvcmQgYW4gZW5kcG9pbnQgdGhlIGNhbGxlciBuZXZlclxuICogYWN0dWFsbHkgZ290IGEgd29ya2luZyBjb25uZWN0aW9uIHRvLCBhbmQgYSBzdWJzZXF1ZW50IHJlYWwgcmVjb25uZWN0XG4gKiBjb3VsZCB0aGVuIHNpbGVudGx5IHNraXAgYSBub3RpZmljYXRpb24gaXQgc2hvdWxkIGhhdmUgc2hvd24gKG9yIHZpY2VcbiAqIHZlcnNhKS4gRXhwb3J0ZWQgc28gdGhpcyBvcmRlcmluZyBndWFyZCBjYW4gYmUgdW5pdCB0ZXN0ZWQgd2l0aG91dFxuICogY29uc3RydWN0aW5nIHRoZSBmdWxsIHNlcnZpY2UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzaG91bGRUcmFja1R1bm5lbENvbm5lY3Rpb24oY29ubmVjdEVycm9yOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdHJldHVybiAhY29ubmVjdEVycm9yO1xufVxuXG4vKipcbiAqIFJldGFpbnMgdGhlIGxhc3Qgc3VjY2Vzc2Z1bGx5IHJlZ2lzdGVyZWQgZW5kcG9pbnQncyBzZXJ2ZXIgdHlwZSBwZXJcbiAqIHN0YWJsZSB0dW5uZWwgYWRkcmVzcyAoYHR1bm5lbDo8dHVubmVsSWQ+YCkgc28gYSBsYXRlciBhdXRvbWF0aWNcbiAqIHJlY29ubmVjdCBmb3IgdGhlIHNhbWUgdHVubmVsIGNhbiBkZXRlY3QgYSBzaWxlbnQgZWRpdG9yIFx1MjE5MiBzdGFuZGFsb25lXG4gKiBmYWlsb3ZlciB2aWEge0BsaW5rIHNob3VsZE5vdGlmeVR1bm5lbEZhaWxvdmVyfS4gRW50cmllcyBhcmUgb25seSBldmVyXG4gKiB3cml0dGVuIGFmdGVyIGEgc3VjY2Vzc2Z1bCB7QGxpbmsgSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UuYWRkTWFuYWdlZENvbm5lY3Rpb259XG4gKiByZWdpc3RyYXRpb24gYW5kIGFyZSBkZWxpYmVyYXRlbHkgbmV2ZXIgY2xlYXJlZCBvbiByZWxheSBjbG9zdXJlLCBzbyB0aGVcbiAqIGNvbXBhcmlzb24gc3Vydml2ZXMgZGlzY29ubmVjdC9yZWNvbm5lY3QgY3ljbGVzIGZvciB0aGUgdHVubmVsJ3NcbiAqIGxpZmV0aW1lLiBFeHBvcnRlZCAoYW5kIGtlcHQgZnJlZSBvZiBhbnkgSVBDL3Byb3RvY29sIGRlcGVuZGVuY2llcykgc29cbiAqIHRoZSByZXRlbnRpb24gKyBkZWNpc2lvbiBiZWhhdmlvciBjYW4gYmUgdW5pdCB0ZXN0ZWQgaW4gaXNvbGF0aW9uLlxuICovXG5leHBvcnQgY2xhc3MgVHVubmVsRmFpbG92ZXJUcmFja2VyIHtcblx0cHJpdmF0ZSByZWFkb25seSBfbGFzdFNlbGVjdGVkU2VydmVyVHlwZSA9IG5ldyBNYXA8c3RyaW5nLCBUdW5uZWxHYXRld2F5U2VydmVyVHlwZSB8ICd1bmtub3duJz4oKTtcblxuXHQvKipcblx0ICogUmVjb3JkIGEgc3VjY2Vzc2Z1bCByZWdpc3RyYXRpb24gZm9yIGBhZGRyZXNzYCBhbmQgcmVwb3J0IHdoZXRoZXIgaXRcblx0ICogc2hvdWxkIHRyaWdnZXIgYSBmYWlsb3ZlciBub3RpZmljYXRpb24uIEFsd2F5cyB1cGRhdGVzIHRoZSByZXRhaW5lZFxuXHQgKiBtZXRhZGF0YSwgcmVnYXJkbGVzcyBvZiB0aGUgcmV0dXJuZWQgdmFsdWUuXG5cdCAqL1xuXHRyZWNvcmRBbmRTaG91bGROb3RpZnkoYWRkcmVzczogc3RyaW5nLCBuZXdTZXJ2ZXJUeXBlOiBUdW5uZWxHYXRld2F5U2VydmVyVHlwZSB8ICd1bmtub3duJywgdXNlckluaXRpYXRlZDogYm9vbGVhbiwgZWRpdG9yRmFsbGJhY2sgPSBmYWxzZSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHByZXZpb3VzU2VydmVyVHlwZSA9IHRoaXMuX2xhc3RTZWxlY3RlZFNlcnZlclR5cGUuZ2V0KGFkZHJlc3MpO1xuXHRcdGNvbnN0IG5vdGlmeSA9IHNob3VsZE5vdGlmeVR1bm5lbEZhaWxvdmVyKHByZXZpb3VzU2VydmVyVHlwZSwgbmV3U2VydmVyVHlwZSwgdXNlckluaXRpYXRlZCwgZWRpdG9yRmFsbGJhY2spO1xuXHRcdHRoaXMuX2xhc3RTZWxlY3RlZFNlcnZlclR5cGUuc2V0KGFkZHJlc3MsIG5ld1NlcnZlclR5cGUpO1xuXHRcdHJldHVybiBub3RpZnk7XG5cdH1cbn1cblxuLyoqXG4gKiBSZW5kZXJlci1zaWRlIGltcGxlbWVudGF0aW9uIG9mIHtAbGluayBJVHVubmVsQWdlbnRIb3N0U2VydmljZX0gdGhhdFxuICogZGVsZWdhdGVzIHR1bm5lbCBTREsgb3BlcmF0aW9ucyB0byB0aGUgc2hhcmVkIHByb2Nlc3MgdmlhIElQQywgdGhlblxuICogcmVnaXN0ZXJzIGNvbm5lY3Rpb25zIHdpdGggdGhlIHJlbmRlcmVyLWxvY2FsIHtAbGluayBJUmVtb3RlQWdlbnRIb3N0U2VydmljZX0uXG4gKi9cbmV4cG9ydCBjbGFzcyBUdW5uZWxBZ2VudEhvc3RTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUdW5uZWxBZ2VudEhvc3RTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbWFpblNlcnZpY2U6IElUdW5uZWxBZ2VudEhvc3RNYWluU2VydmljZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVR1bm5lbHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VUdW5uZWxzOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlVHVubmVscy5ldmVudDtcblxuXHQvKiogVHJhY2tzIHdoaWNoIGF1dGggcHJvdmlkZXIgd2FzIGxhc3QgdXNlZCBzdWNjZXNzZnVsbHkuICovXG5cdHByaXZhdGUgX2xhc3RBdXRoUHJvdmlkZXI6ICdnaXRodWInIHwgJ21pY3Jvc29mdCcgfCB1bmRlZmluZWQ7XG5cblx0LyoqIFNlZSB7QGxpbmsgVHVubmVsRmFpbG92ZXJUcmFja2VyfS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZmFpbG92ZXJUcmFja2VyID0gbmV3IFR1bm5lbEZhaWxvdmVyVHJhY2tlcigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU2hhcmVkUHJvY2Vzc1NlcnZpY2Ugc2hhcmVkUHJvY2Vzc1NlcnZpY2U6IElTaGFyZWRQcm9jZXNzU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50SG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmVtb3RlQWdlbnRIb3N0U2VydmljZTogSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBdXRoZW50aWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYXV0aGVudGljYXRpb25TZXJ2aWNlOiBJQXV0aGVudGljYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2NhdGlvblByZWZlcmVuY2VTZXJ2aWNlOiBJUmVtb3RlQWdlbnRIb3N0TG9jYXRpb25QcmVmZXJlbmNlU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fbWFpblNlcnZpY2UgPSBQcm94eUNoYW5uZWwudG9TZXJ2aWNlPElUdW5uZWxBZ2VudEhvc3RNYWluU2VydmljZT4oXG5cdFx0XHRzaGFyZWRQcm9jZXNzU2VydmljZS5nZXRDaGFubmVsKFRVTk5FTF9BR0VOVF9IT1NUX0NIQU5ORUwpLFxuXHRcdCk7XG5cdH1cblxuXHRhc3luYyBsaXN0VHVubmVscyhvcHRpb25zPzogeyBzaWxlbnQ/OiBib29sZWFuIH0pOiBQcm9taXNlPElUdW5uZWxJbmZvW10+IHtcblx0XHRpZiAoIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KFJlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkKSkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNpbGVudCA9IG9wdGlvbnM/LnNpbGVudCA/PyBmYWxzZTtcblx0XHRjb25zdCBhdXRoID0gYXdhaXQgdGhpcy5fZ2V0VG9rZW4oc2lsZW50KTtcblx0XHRpZiAoIWF1dGgpIHtcblx0XHRcdGlmIChzaWxlbnQpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgJHtMT0dfUFJFRklYfSBObyBjYWNoZWQgdG9rZW4gYXZhaWxhYmxlIGZvciBzaWxlbnQgdHVubmVsIGVudW1lcmF0aW9uYCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gTm8gYXV0aCB0b2tlbiBhdmFpbGFibGUgZm9yIHR1bm5lbCBlbnVtZXJhdGlvbmApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFkZGl0aW9uYWxOYW1lcyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZ1tdPihUdW5uZWxBZ2VudEhvc3RzU2V0dGluZ0lkKSA/PyBbXTtcblx0XHRyZXR1cm4gdGhpcy5fbWFpblNlcnZpY2UubGlzdFR1bm5lbHMoYXV0aC50b2tlbiwgYXV0aC5wcm92aWRlciwgYWRkaXRpb25hbE5hbWVzLmxlbmd0aCA+IDAgPyBhZGRpdGlvbmFsTmFtZXMgOiB1bmRlZmluZWQpO1xuXHR9XG5cblx0YXN5bmMgY29ubmVjdCh0dW5uZWw6IElUdW5uZWxJbmZvLCBhdXRoUHJvdmlkZXI/OiAnZ2l0aHViJyB8ICdtaWNyb3NvZnQnLCBvcHRpb25zPzogeyByZWFkb25seSB1c2VySW5pdGlhdGVkPzogYm9vbGVhbiB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignUmVtb3RlIGFnZW50IGhvc3QgY29ubmVjdGlvbnMgYXJlIG5vdCBlbmFibGVkLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGF1dGggPSBhdXRoUHJvdmlkZXJcblx0XHRcdD8gYXdhaXQgdGhpcy5fZ2V0VG9rZW5Gb3JQcm92aWRlcihhdXRoUHJvdmlkZXIsIGZhbHNlKVxuXHRcdFx0OiBhd2FpdCB0aGlzLl9nZXRUb2tlbihmYWxzZSk7XG5cdFx0aWYgKCFhdXRoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIGF1dGhlbnRpY2F0aW9uIGF2YWlsYWJsZScpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBDb25uZWN0aW5nIHRvIHR1bm5lbCAnJHt0dW5uZWwubmFtZX0nICgke3R1bm5lbC50dW5uZWxJZH0pYCk7XG5cblx0XHQvLyBQcm90b2NvbC12NiB0dW5uZWxzIGV4cG9zZSBhIHJlZ2lzdHJ5LWJhc2VkIGVuZHBvaW50IHNlbGVjdGlvblxuXHRcdC8vIGdhdGV3YXk6IHByZXBhcmUgaXQgZmlyc3QgYW5kIHJlc29sdmUgYSB0YXJnZXQgYnkgdGhlIHVzZXIncyBzYXZlZFxuXHRcdC8vIGxvY2F0aW9uIHByZWZlcmVuY2UgYmVmb3JlIGNvbXBsZXRpbmcgdGhlIGNvbm5lY3Rpb24uIFByb3RvY29sLXY1XG5cdFx0Ly8gdHVubmVscyBoYXZlIG5vIGdhdGV3YXkgXHUyMDE0IGBwcmVwYXJlU2VsZWN0aW9uYCByZXR1cm5zIGB1bmRlZmluZWRgXG5cdFx0Ly8gYW5kIHdlIGZhbGwgYmFjayB0byB0aGUgbGVnYWN5IGRpcmVjdC1jb25uZWN0IHBhdGggd2l0aCBubyBwcm9tcHQuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IHRoaXMuX21haW5TZXJ2aWNlLnByZXBhcmVTZWxlY3Rpb24oYXV0aC50b2tlbiwgYXV0aC5wcm92aWRlciwgdHVubmVsLnR1bm5lbElkLCB0dW5uZWwuY2x1c3RlcklkKTtcblx0XHRsZXQgcmVzdWx0OiBJVHVubmVsQ29ubmVjdFJlc3VsdDtcblx0XHRsZXQgZWRpdG9yRmFsbGJhY2sgPSBmYWxzZTtcblx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gYXdhaXQgcmVzb2x2ZUdhdGV3YXlTZWxlY3Rpb24odGhpcy5fbG9jYXRpb25QcmVmZXJlbmNlU2VydmljZSwgdGhpcy5fZGlhbG9nU2VydmljZSwge1xuXHRcdFx0XHRob3N0S2V5OiBgJHtUVU5ORUxfQUREUkVTU19QUkVGSVh9JHt0dW5uZWwudHVubmVsSWR9YCxcblx0XHRcdFx0aG9zdExhYmVsOiB0dW5uZWwubmFtZSxcblx0XHRcdFx0cHJvZHVjdE5hbWU6IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydCxcblx0XHRcdFx0aW52ZW50b3J5OiBzZXNzaW9uLmludmVudG9yeSxcblx0XHRcdFx0dXNlckluaXRpYXRlZDogb3B0aW9ucz8udXNlckluaXRpYXRlZCA/PyB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoIXNlbGVjdGlvbikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gQWdlbnQgaG9zdCBzZWxlY3Rpb24gY2FuY2VsbGVkIGZvciB0dW5uZWwgJyR7dHVubmVsLm5hbWV9J2ApO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9tYWluU2VydmljZS5jYW5jZWxTZWxlY3Rpb24oc2Vzc2lvbi5zZWxlY3Rpb25JZCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbXBsZXRlZCA9IGF3YWl0IHRoaXMuX2NvbXBsZXRlU2VsZWN0aW9uV2l0aEZhbGxiYWNrKGF1dGgsIHR1bm5lbCwgc2Vzc2lvbiwgc2VsZWN0aW9uKTtcblx0XHRcdHJlc3VsdCA9IGNvbXBsZXRlZC5yZXN1bHQ7XG5cdFx0XHRlZGl0b3JGYWxsYmFjayA9IGNvbXBsZXRlZC5lZGl0b3JGYWxsYmFjaztcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5fbWFpblNlcnZpY2UuY29ubmVjdChhdXRoLnRva2VuLCBhdXRoLnByb3ZpZGVyLCB0dW5uZWwudHVubmVsSWQsIHR1bm5lbC5jbHVzdGVySWQpO1xuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gVHVubmVsIHJlbGF5IGNvbm5lY3RlZCwgY29ubmVjdGlvbklkPSR7cmVzdWx0LmNvbm5lY3Rpb25JZH1gKTtcblxuXHRcdC8vIEJ1aWxkIHJlbGF5IHRyYW5zcG9ydCArIHByb3RvY29sIGNsaWVudC4gSWYgY29uc3RydWN0aW9uIGl0c2VsZlxuXHRcdC8vIGZhaWxzIChyYXJlIFx1MjAxNCB3b3VsZCBtZWFuIHRoZSBBSFAgbG9nZ2VyIG9yIHRyYW5zcG9ydCBjdG9yIHRocmV3KVxuXHRcdC8vIHRlYXIgdGhlIGp1c3Qtb3BlbmVkIG1haW4tc2lkZSByZWxheSBkb3duIGJlZm9yZSBwcm9wYWdhdGluZy5cblx0XHRsZXQgcHJvdG9jb2xDbGllbnQ6IFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50O1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBhaHBMb2dnaW5nRW5hYmxlZCA9ICEhdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQWdlbnRIb3N0QWhwSnNvbmxMb2dnaW5nU2V0dGluZ0lkKTtcblx0XHRcdGNvbnN0IGxvZ2dlciA9IGFocExvZ2dpbmdFbmFibGVkID8gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdEFocEpzb25sTG9nZ2VyLFxuXHRcdFx0XHR7IGxvZ3NIb21lOiB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UubG9nc0hvbWUsIGNvbm5lY3Rpb25JZDogcmVzdWx0LmNvbm5lY3Rpb25JZCwgdHJhbnNwb3J0OiAndHVubmVsJyB9LFxuXHRcdFx0KSA6IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IG5ldyBUdW5uZWxSZWxheVRyYW5zcG9ydChyZXN1bHQuY29ubmVjdGlvbklkLCB0aGlzLl9tYWluU2VydmljZSwgbG9nZ2VyKTtcblx0XHRcdHByb3RvY29sQ2xpZW50ID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50LCByZXN1bHQuYWRkcmVzcywgdHJhbnNwb3J0LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgYWdlbnRzV2luZG93QWdlbnRIb3N0Q2xpZW50SW5mbyxcblx0XHRcdCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGAke0xPR19QUkVGSVh9IENvbm5lY3Rpb24gc2V0dXAgZmFpbGVkYCwgZXJyKTtcblx0XHRcdHRoaXMuX21haW5TZXJ2aWNlLmRpc2Nvbm5lY3QocmVzdWx0LmNvbm5lY3Rpb25JZCkuY2F0Y2goKCkgPT4geyAvKiBiZXN0IGVmZm9ydCAqLyB9KTtcblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cblx0XHQvLyBLZWVwIGFuIGluY29tcGF0aWJsZSBoYW5kc2hha2UgZnJvbSB0ZWFyaW5nIGRvd24gdGhlIHJlbGF5OiB0aGVcblx0XHQvLyBwcm90b2NvbCBjbGllbnQgbXVzdCByZW1haW4gcmVnaXN0ZXJlZCB3aXRoIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlXG5cdFx0Ly8gc28gYHRyaWdnZXJTZXJ2ZXJVcGdyYWRlYCBjYW4gbG9jYXRlIGl0IGFuZCBzZW5kIGBfdnNjb2RlVXBncmFkZWBcblx0XHQvLyBvdmVyIHRoZSBzdGlsbC1vcGVuIHRyYW5zcG9ydC5cblx0XHRsZXQgc3RhdHVzOiBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzID0gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0ZWQ7XG5cdFx0bGV0IGNvbm5lY3RFcnJvcjogdW5rbm93bjtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcHJvdG9jb2xDbGllbnQuY29ubmVjdCgpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFByb3RvY29sIGhhbmRzaGFrZSBjb21wbGV0ZWQgd2l0aCAke3Jlc3VsdC5hZGRyZXNzfWApO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y29uc3QgaW5jb21wYXRpYmxlID0gUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5mcm9tQ29ubmVjdEVycm9yKGVyciwgW1BST1RPQ09MX1ZFUlNJT05dKTtcblx0XHRcdGlmICghUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5pc0luY29tcGF0aWJsZShpbmNvbXBhdGlibGUpKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYCR7TE9HX1BSRUZJWH0gQ29ubmVjdGlvbiBzZXR1cCBmYWlsZWRgLCBlcnIpO1xuXHRcdFx0XHRwcm90b2NvbENsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX21haW5TZXJ2aWNlLmRpc2Nvbm5lY3QocmVzdWx0LmNvbm5lY3Rpb25JZCkuY2F0Y2goKCkgPT4geyAvKiBiZXN0IGVmZm9ydCAqLyB9KTtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IEluY29tcGF0aWJsZSB3aXRoICR7cmVzdWx0LmFkZHJlc3N9OiAke2luY29tcGF0aWJsZS5tZXNzYWdlfWApO1xuXHRcdFx0c3RhdHVzID0gaW5jb21wYXRpYmxlO1xuXHRcdFx0Y29ubmVjdEVycm9yID0gZXJyO1xuXHRcdH1cblxuXHRcdHRoaXMuY2FjaGVUdW5uZWwodHVubmVsLCBhdXRoLnByb3ZpZGVyKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmFkZE1hbmFnZWRDb25uZWN0aW9uKHtcblx0XHRcdFx0bmFtZTogcmVzdWx0Lm5hbWUsXG5cdFx0XHRcdGNvbm5lY3Rpb25Ub2tlbjogcmVzdWx0LmNvbm5lY3Rpb25Ub2tlbixcblx0XHRcdFx0Y29ubmVjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5UdW5uZWwsXG5cdFx0XHRcdFx0dHVubmVsSWQ6IHR1bm5lbC50dW5uZWxJZCxcblx0XHRcdFx0XHRjbHVzdGVySWQ6IHR1bm5lbC5jbHVzdGVySWQsXG5cdFx0XHRcdFx0bGFiZWw6IHR1bm5lbC5uYW1lLFxuXHRcdFx0XHRcdGF1dGhQcm92aWRlcjogYXV0aC5wcm92aWRlcixcblx0XHRcdFx0fSxcblx0XHRcdH0sIHByb3RvY29sQ2xpZW50LCB1bmRlZmluZWQsIHN0YXR1cyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGAke0xPR19QUkVGSVh9IGFkZE1hbmFnZWRDb25uZWN0aW9uIGZhaWxlZGAsIGVycik7XG5cdFx0XHRwcm90b2NvbENsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9tYWluU2VydmljZS5kaXNjb25uZWN0KHJlc3VsdC5jb25uZWN0aW9uSWQpLmNhdGNoKCgpID0+IHsgLyogYmVzdCBlZmZvcnQgKi8gfSk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXG5cdFx0aWYgKCFzaG91bGRUcmFja1R1bm5lbENvbm5lY3Rpb24oY29ubmVjdEVycm9yKSkge1xuXHRcdFx0dGhyb3cgY29ubmVjdEVycm9yO1xuXHRcdH1cblxuXHRcdHRoaXMuX25vdGlmeUlmVHVubmVsRmFpbG92ZXIocmVzdWx0LCBvcHRpb25zLCBlZGl0b3JGYWxsYmFjayk7XG5cdH1cblxuXHQvKipcblx0ICogU2VuZCBgc2VsZWN0aW9uYCBvdmVyIHRoZSBwcmVwYXJlZCBnYXRld2F5IHNlc3Npb24gYW5kLCBpZiB0aGUgZ2F0ZXdheVxuXHQgKiAqcmVqZWN0cyogaXQsIHRyYW5zcGFyZW50bHkgcmV0cnkgb25jZSB1c2luZyBhIGZyZXNoIGludmVudG9yeS5cblx0ICpcblx0ICogQSByZWplY3Rpb24gKHNlZSB7QGxpbmsgaXNUdW5uZWxHYXRld2F5U2VsZWN0aW9uUmVqZWN0ZWRFcnJvcn0pIGlzIHRoZVxuXHQgKiBvbmUgZmFpbHVyZSB0aGF0IHByb3ZlcyB0aGUgdHVubmVsIGl0c2VsZiBpcyBoZWFsdGh5OiB0aGUgQ0xJIGFuc3dlcmVkLFxuXHQgKiBpdCBzaW1wbHkgY291bGQgbm90IGhhbmQgdXMgdGhlIGVuZHBvaW50IHdlIGFza2VkIGZvciBiZWNhdXNlIHRoYXRcblx0ICogYWdlbnQgaG9zdCBpcyBubyBsb25nZXIgYWxpdmUuIEl0cyByZWdpc3RyeSBlbnRyeSBjYW4gb3V0bGl2ZSBpdCAodGhlXG5cdCAqIGVudHJ5IGlzIG9ubHkgcHJ1bmVkIG9uY2UgdGhlIG93bmluZyBQSUQgZGllcywgd2hpY2ggYSBjcmFzaGVkIG9yXG5cdCAqIGRldGFjaGVkIGVkaXRvciBhZ2VudCBob3N0IG1heSBub3QgZG8gcHJvbXB0bHkpLCBzbyB0aGUgaW52ZW50b3J5IGtlZXBzXG5cdCAqIGFkdmVydGlzaW5nIGl0IGFuZCBldmVyeSByZWNvbm5lY3Qgd291bGQgb3RoZXJ3aXNlIHBpY2sgaXQgYWdhaW4gYW5kXG5cdCAqIGZhaWwgXHUyMDE0IHRoZSBjb25uZWN0aW9uIHN0YXlzIGRvd24gZm9yIHRoZSB3aG9sZSBiYWNrb2ZmIHdpbmRvdyBpbnN0ZWFkXG5cdCAqIG9mIGZhaWxpbmcgb3Zlci4gVW5kZWxlZ2F0ZWQgdHVubmVscyBjYW4gZmFpbCBvdmVyIHRvIGEgZGVkaWNhdGVkIGhvc3Rcblx0ICogd2l0aGluIHRoZSBzYW1lIGF0dGVtcHQ7IGRlbGVnYXRlZCB0dW5uZWxzIHJldHJ5IG9ubHkgdGhlaXIgYm91bmQgZWRpdG9yXG5cdCAqIGhvc3QsIHdoaWNoIHByZXZlbnRzIGNyZWF0aW5nIGFuIG9ycGhhbmVkIGRlZGljYXRlZCBob3N0LlxuXHQgKlxuXHQgKiBFdmVyeSBvdGhlciBmYWlsdXJlIG1lYW5zIHRoZSB0dW5uZWwgaXMgdW5yZWFjaGFibGUsIGFuZCBpcyByZXRocm93biBzb1xuXHQgKiB0aGUgY2FsbGVyIGtlZXBzIHJldHJ5aW5nIHRoZSBzYW1lIGRlc3RpbmF0aW9uIGFuZCBzZWxlY3Rpb24gdW5jaGFuZ2VkLlxuXHQgKiBUaGUgc3RvcmVkIGxvY2F0aW9uIHByZWZlcmVuY2UgaXMgbmV2ZXIgbXV0YXRlZCBieSBhIGZhbGxiYWNrLCBzbyB0aGVcblx0ICogZWRpdG9yIGhvc3QgaXMgcHJlZmVycmVkIGFnYWluIGFzIHNvb24gYXMgaXQgaXMgYmFjay5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2NvbXBsZXRlU2VsZWN0aW9uV2l0aEZhbGxiYWNrKFxuXHRcdGF1dGg6IHsgcmVhZG9ubHkgdG9rZW46IHN0cmluZzsgcmVhZG9ubHkgcHJvdmlkZXI6ICdnaXRodWInIHwgJ21pY3Jvc29mdCcgfSxcblx0XHR0dW5uZWw6IElUdW5uZWxJbmZvLFxuXHRcdHNlc3Npb246IElUdW5uZWxHYXRld2F5U2VsZWN0aW9uU2Vzc2lvbixcblx0XHRzZWxlY3Rpb246IElUdW5uZWxHYXRld2F5U2VsZWN0aW9uLFxuXHQpOiBQcm9taXNlPHsgcmVhZG9ubHkgcmVzdWx0OiBJVHVubmVsQ29ubmVjdFJlc3VsdDsgcmVhZG9ubHkgZWRpdG9yRmFsbGJhY2s6IGJvb2xlYW4gfT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4geyByZXN1bHQ6IGF3YWl0IHRoaXMuX21haW5TZXJ2aWNlLmNvbXBsZXRlU2VsZWN0aW9uKHNlc3Npb24uc2VsZWN0aW9uSWQsIHNlbGVjdGlvbiksIGVkaXRvckZhbGxiYWNrOiBmYWxzZSB9O1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKCFpc1R1bm5lbEdhdGV3YXlTZWxlY3Rpb25SZWplY3RlZEVycm9yKGVycikpIHtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgd2FzRWRpdG9yID0gaXNFZGl0b3JHYXRld2F5U2VsZWN0aW9uKHNlbGVjdGlvbiwgc2Vzc2lvbi5pbnZlbnRvcnkpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IEdhdGV3YXkgcmVqZWN0ZWQgdGhlIHNlbGVjdGVkIGFnZW50IGhvc3QgZm9yIHR1bm5lbCAnJHt0dW5uZWwubmFtZX0nLCByZXRyeWluZyBhbiBhbGxvd2VkIGFnZW50IGhvc3Q6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXG5cdFx0XHQvLyBUaGUgcmVqZWN0ZWQgYXR0ZW1wdCBjb25zdW1lZCB0aGUgZ2F0ZXdheSBzb2NrZXQsIHNvIGEgZnJlc2hcblx0XHRcdC8vIHNlc3Npb24gaXMgbmVlZGVkIFx1MjAxNCB3aGljaCBhbHNvIHlpZWxkcyBhIGZyZXNoIGludmVudG9yeSB0byBwaWNrXG5cdFx0XHQvLyB0aGUgZmFsbGJhY2sgZnJvbS5cblx0XHRcdGNvbnN0IHJldHJ5ID0gYXdhaXQgdGhpcy5fbWFpblNlcnZpY2UucHJlcGFyZVNlbGVjdGlvbihhdXRoLnRva2VuLCBhdXRoLnByb3ZpZGVyLCB0dW5uZWwudHVubmVsSWQsIHR1bm5lbC5jbHVzdGVySWQpO1xuXHRcdFx0aWYgKCFyZXRyeSkge1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBmYWxsYmFjayA9IHNlbGVjdEdhdGV3YXlGYWxsYmFja0FmdGVyUmVqZWN0aW9uKHNlbGVjdGlvbiwgcmV0cnkuaW52ZW50b3J5KTtcblx0XHRcdGlmICghZmFsbGJhY2spIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fbWFpblNlcnZpY2UuY2FuY2VsU2VsZWN0aW9uKHJldHJ5LnNlbGVjdGlvbklkKTtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fbWFpblNlcnZpY2UuY29tcGxldGVTZWxlY3Rpb24ocmV0cnkuc2VsZWN0aW9uSWQsIGZhbGxiYWNrKTtcblx0XHRcdHJldHVybiB7IHJlc3VsdCwgZWRpdG9yRmFsbGJhY2s6IHdhc0VkaXRvciAmJiByZXN1bHQuc2VsZWN0ZWQuc2VydmVyVHlwZSA9PT0gJ3N0YW5kYWxvbmUnIH07XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEFmdGVyIGEgc3VjY2Vzc2Z1bCB7QGxpbmsgYWRkTWFuYWdlZENvbm5lY3Rpb259IHJlZ2lzdHJhdGlvbiwgY29tcGFyZVxuXHQgKiB0aGUgbmV3bHkgc2VsZWN0ZWQgZW5kcG9pbnQncyBzZXJ2ZXIgdHlwZSBhZ2FpbnN0IHRoZSBsYXN0IG9uZVxuXHQgKiBzdWNjZXNzZnVsbHkgcmVnaXN0ZXJlZCBmb3IgdGhpcyB0dW5uZWwncyBzdGFibGUgYWRkcmVzcyBhbmQsIGlmIHRoaXNcblx0ICogd2FzIGEgc2lsZW50IGVkaXRvciBcdTIxOTIgc3RhbmRhbG9uZSBmYWlsb3Zlciwgc2hvdyBhIHNpbmdsZSBpbmZvcm1hdGlvbmFsXG5cdCAqIG5vdGlmaWNhdGlvbi4gRGVsZWdhdGVzIHRoZSByZXRlbnRpb24gKyBkZWNpc2lvbiB0b1xuXHQgKiB7QGxpbmsgVHVubmVsRmFpbG92ZXJUcmFja2VyfSwgd2hpY2ggYWx3YXlzIHJlY29yZHMgdGhpcyBjb25uZWN0aW9uXG5cdCAqIGZvciBmdXR1cmUgY29tcGFyaXNvbnMgcmVnYXJkbGVzcyBvZiB3aGV0aGVyIGEgbm90aWZpY2F0aW9uIHdhcyBzaG93bi5cblx0ICpcblx0ICogYGVkaXRvckZhbGxiYWNrYCByZXBvcnRzIHRoYXQge0BsaW5rIF9jb21wbGV0ZVNlbGVjdGlvbldpdGhGYWxsYmFja31cblx0ICogYWxyZWFkeSBwZXJmb3JtZWQgdGhlIHN1YnN0aXR1dGlvbiB3aXRoaW4gdGhpcyB2ZXJ5IGF0dGVtcHQsIHdoaWNoXG5cdCAqIG5vdGlmaWVzIG9uIGl0cyBvd24gXHUyMDE0IHNlZSB7QGxpbmsgc2hvdWxkTm90aWZ5VHVubmVsRmFpbG92ZXJ9LlxuXHQgKi9cblx0cHJpdmF0ZSBfbm90aWZ5SWZUdW5uZWxGYWlsb3ZlcihyZXN1bHQ6IElUdW5uZWxDb25uZWN0UmVzdWx0LCBvcHRpb25zOiB7IHJlYWRvbmx5IHVzZXJJbml0aWF0ZWQ/OiBib29sZWFuIH0gfCB1bmRlZmluZWQsIGVkaXRvckZhbGxiYWNrOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgdXNlckluaXRpYXRlZCA9IG9wdGlvbnM/LnVzZXJJbml0aWF0ZWQgPz8gdHJ1ZTtcblx0XHRjb25zdCBzaG91bGROb3RpZnkgPSB0aGlzLl9mYWlsb3ZlclRyYWNrZXIucmVjb3JkQW5kU2hvdWxkTm90aWZ5KHJlc3VsdC5hZGRyZXNzLCByZXN1bHQuc2VsZWN0ZWQuc2VydmVyVHlwZSwgdXNlckluaXRpYXRlZCwgZWRpdG9yRmFsbGJhY2spO1xuXHRcdGlmIChzaG91bGROb3RpZnkpIHtcblx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdC8vIFRoZSBpbi1hdHRlbXB0IGZhbGxiYWNrIGNhbiBoYXBwZW4gb24gYSBmaXJzdCBjb25uZWN0IHRvbyxcblx0XHRcdFx0Ly8gd2hlcmUgbm90aGluZyB3YXMgaW50ZXJydXB0ZWQgYW5kIG5vdGhpbmcgd2FzIHJlY29ubmVjdGVkLlxuXHRcdFx0XHRtZXNzYWdlOiBlZGl0b3JGYWxsYmFja1xuXHRcdFx0XHRcdD8gbG9jYWxpemUoXG5cdFx0XHRcdFx0XHQndHVubmVsQWdlbnRIb3N0UmVqZWN0ZWRFZGl0b3JOb3RpZmljYXRpb24nLFxuXHRcdFx0XHRcdFx0XCJUaGUgZWRpdG9yIGFnZW50IGhvc3QgaXMgbm8gbG9uZ2VyIHJ1bm5pbmcuIENvbm5lY3RlZCB0byBhIGRlZGljYXRlZCBhZ2VudCBob3N0IGluc3RlYWQuXCIsXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHRcdDogbG9jYWxpemUoXG5cdFx0XHRcdFx0XHQndHVubmVsQWdlbnRIb3N0RmFpbG92ZXJOb3RpZmljYXRpb24nLFxuXHRcdFx0XHRcdFx0XCJUaGUgZWRpdG9yIGFnZW50IGhvc3QgZXhpdGVkLiBSZWNvbm5lY3RlZCB0byBhIGRlZGljYXRlZCBhZ2VudCBob3N0LiBJbi1wcm9ncmVzcyB3b3JrIG1heSBoYXZlIGJlZW4gaW50ZXJydXB0ZWQuXCIsXG5cdFx0XHRcdFx0KSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHJlYWRvbmx5IGNhbkRlbGV0ZVR1bm5lbHMgPSB0cnVlO1xuXG5cdGFzeW5jIGRlbGV0ZVR1bm5lbCh0dW5uZWw6IElUdW5uZWxJbmZvKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYXV0aCA9IGF3YWl0IHRoaXMuX2dldFRva2VuKGZhbHNlKTtcblx0XHRpZiAoIWF1dGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gYXV0aGVudGljYXRpb24gYXZhaWxhYmxlJyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IERlbGV0aW5nIHR1bm5lbCAnJHt0dW5uZWwubmFtZX0nICgke3R1bm5lbC50dW5uZWxJZH0pYCk7XG5cdFx0YXdhaXQgdGhpcy5fbWFpblNlcnZpY2UuZGVsZXRlVHVubmVsKGF1dGgudG9rZW4sIGF1dGgucHJvdmlkZXIsIHR1bm5lbC50dW5uZWxJZCwgdHVubmVsLmNsdXN0ZXJJZCk7XG5cdFx0dGhpcy5yZW1vdmVDYWNoZWRUdW5uZWwodHVubmVsLnR1bm5lbElkKTtcblx0fVxuXG5cdGFzeW5jIGRpc2Nvbm5lY3QoYWRkcmVzczogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5fcmVtb3RlQWdlbnRIb3N0U2VydmljZS5yZW1vdmVSZW1vdGVBZ2VudEhvc3QoYWRkcmVzcyk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VUdW5uZWxzLmZpcmUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgYW4gYXV0aCB0b2tlbiwgdHJ5aW5nIGNhY2hlZCBzZXNzaW9ucyBmaXJzdCAoc2lsZW50KSxcblx0ICogdGhlbiBwcm9tcHRpbmcgaW50ZXJhY3RpdmVseSBpZiBgc2lsZW50YCBpcyBmYWxzZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2dldFRva2VuKHNpbGVudDogYm9vbGVhbik6IFByb21pc2U8eyB0b2tlbjogc3RyaW5nOyBwcm92aWRlcjogJ2dpdGh1YicgfCAnbWljcm9zb2Z0JyB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gVHJ5IHRoZSBsYXN0IGtub3duIHByb3ZpZGVyIGZpcnN0XG5cdFx0aWYgKHRoaXMuX2xhc3RBdXRoUHJvdmlkZXIpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2dldFRva2VuRm9yUHJvdmlkZXIodGhpcy5fbGFzdEF1dGhQcm92aWRlciwgc2lsZW50KTtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBUcnkgYm90aCBwcm92aWRlcnMgc2lsZW50bHlcblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIFsnZ2l0aHViJywgJ21pY3Jvc29mdCddIGFzIGNvbnN0KSB7XG5cdFx0XHRpZiAocHJvdmlkZXIgPT09IHRoaXMuX2xhc3RBdXRoUHJvdmlkZXIpIHtcblx0XHRcdFx0Y29udGludWU7IC8vIEFscmVhZHkgdHJpZWQgYWJvdmVcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2dldFRva2VuRm9yUHJvdmlkZXIocHJvdmlkZXIsIHRydWUpO1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIElmIG5vdCBzaWxlbnQsIHdlIHdvdWxkIG5lZWQgdGhlIGNhbGxlciB0byBwcm9tcHQgZm9yIHByb3ZpZGVyIHNlbGVjdGlvbi5cblx0XHQvLyBSZXR1cm4gdW5kZWZpbmVkIFx1MjAxNCB0aGUgY2FsbGVyIChwcm9tcHRUb0Nvbm5lY3RWaWFUdW5uZWwpIGhhbmRsZXMgdGhlIGludGVyYWN0aXZlIGZsb3cuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgYSB0b2tlbiBmb3IgYSBzcGVjaWZpYyBhdXRoIHByb3ZpZGVyLlxuXHQgKiBAcGFyYW0gcHJvdmlkZXIgVGhlIGF1dGggcHJvdmlkZXIgdG8gdXNlLlxuXHQgKiBAcGFyYW0gc2lsZW50IElmIHRydWUsIG9ubHkgdHJ5IGNhY2hlZCBzZXNzaW9ucy4gSWYgZmFsc2UsIHByb21wdCB0aGUgdXNlci5cblx0ICovXG5cdHByaXZhdGUgX2dldFNjb3Blc0ZvclByb3ZpZGVyKHByb3ZpZGVyOiAnZ2l0aHViJyB8ICdtaWNyb3NvZnQnKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLnR1bm5lbEFwcGxpY2F0aW9uQ29uZmlnPy5hdXRoZW50aWNhdGlvblByb3ZpZGVycztcblx0XHRyZXR1cm4gY29uZmlnPy5bcHJvdmlkZXJdPy5zY29wZXMgPz8gW107XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRUb2tlbkZvclByb3ZpZGVyKFxuXHRcdHByb3ZpZGVyOiAnZ2l0aHViJyB8ICdtaWNyb3NvZnQnLFxuXHRcdHNpbGVudDogYm9vbGVhbixcblx0KTogUHJvbWlzZTx7IHRva2VuOiBzdHJpbmc7IHByb3ZpZGVyOiAnZ2l0aHViJyB8ICdtaWNyb3NvZnQnIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwcm92aWRlcklkID0gcHJvdmlkZXI7XG5cdFx0Y29uc3Qgc2NvcGVzID0gdGhpcy5fZ2V0U2NvcGVzRm9yUHJvdmlkZXIocHJvdmlkZXIpO1xuXHRcdGlmIChzY29wZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHQvLyBUcnkgZXhhY3Qgc2NvcGUgbWF0Y2ggZmlyc3Rcblx0XHRcdGxldCBzZXNzaW9ucyA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhwcm92aWRlcklkLCBzY29wZXMsIHt9LCB0cnVlKTtcblxuXHRcdFx0Ly8gRmFsbCBiYWNrOiBmaW5kIGFueSBzZXNzaW9uIHdob3NlIHNjb3BlcyBhcmUgYSBzdXBlcnNldFxuXHRcdFx0aWYgKHNlc3Npb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRjb25zdCBhbGxTZXNzaW9ucyA9IGF3YWl0IHRoaXMuX2F1dGhlbnRpY2F0aW9uU2VydmljZS5nZXRTZXNzaW9ucyhwcm92aWRlcklkLCB1bmRlZmluZWQsIHt9LCB0cnVlKTtcblx0XHRcdFx0Y29uc3QgcmVxdWVzdGVkU2V0ID0gbmV3IFNldChzY29wZXMpO1xuXHRcdFx0XHRsZXQgYmVzdFNlc3Npb246IHR5cGVvZiBhbGxTZXNzaW9uc1tudW1iZXJdIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRsZXQgYmVzdEV4dHJhID0gSW5maW5pdHk7XG5cdFx0XHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBhbGxTZXNzaW9ucykge1xuXHRcdFx0XHRcdGNvbnN0IHNlc3Npb25TY29wZXMgPSBuZXcgU2V0KHNlc3Npb24uc2NvcGVzKTtcblx0XHRcdFx0XHRsZXQgaXNTdXBlcnNldCA9IHRydWU7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzY29wZSBvZiByZXF1ZXN0ZWRTZXQpIHtcblx0XHRcdFx0XHRcdGlmICghc2Vzc2lvblNjb3Blcy5oYXMoc2NvcGUpKSB7XG5cdFx0XHRcdFx0XHRcdGlzU3VwZXJzZXQgPSBmYWxzZTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChpc1N1cGVyc2V0KSB7XG5cdFx0XHRcdFx0XHRjb25zdCBleHRyYSA9IHNlc3Npb25TY29wZXMuc2l6ZSAtIHJlcXVlc3RlZFNldC5zaXplO1xuXHRcdFx0XHRcdFx0aWYgKGV4dHJhIDwgYmVzdEV4dHJhKSB7XG5cdFx0XHRcdFx0XHRcdGJlc3RFeHRyYSA9IGV4dHJhO1xuXHRcdFx0XHRcdFx0XHRiZXN0U2Vzc2lvbiA9IHNlc3Npb247XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChiZXN0U2Vzc2lvbikge1xuXHRcdFx0XHRcdHNlc3Npb25zID0gW2Jlc3RTZXNzaW9uXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbnRlcmFjdGl2ZSBmYWxsYmFjazogY3JlYXRlIGEgbmV3IHNlc3Npb25cblx0XHRcdGlmIChzZXNzaW9ucy5sZW5ndGggPT09IDAgJiYgIXNpbGVudCkge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmNyZWF0ZVNlc3Npb24ocHJvdmlkZXJJZCwgc2NvcGVzLCB7IGFjdGl2YXRlSW1tZWRpYXRlOiB0cnVlIH0pO1xuXHRcdFx0XHRzZXNzaW9ucyA9IFtzZXNzaW9uXTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHNlc3Npb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgdG9rZW4gPSBzZXNzaW9uc1swXS5hY2Nlc3NUb2tlbjtcblx0XHRcdFx0aWYgKHRva2VuKSB7XG5cdFx0XHRcdFx0dGhpcy5fbGFzdEF1dGhQcm92aWRlciA9IHByb3ZpZGVyO1xuXHRcdFx0XHRcdHJldHVybiB7IHRva2VuLCBwcm92aWRlciB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGAke0xPR19QUkVGSVh9IEZhaWxlZCB0byBnZXQgJHtwcm92aWRlcn0gdG9rZW46ICR7ZXJyfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgZ2V0QXV0aFByb3ZpZGVyKG9wdGlvbnM/OiB7IHNpbGVudD86IGJvb2xlYW4gfSk6IFByb21pc2U8J2dpdGh1YicgfCAnbWljcm9zb2Z0JyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2dldFRva2VuKG9wdGlvbnM/LnNpbGVudCA/PyB0cnVlKTtcblx0XHRyZXR1cm4gcmVzdWx0Py5wcm92aWRlcjtcblx0fVxuXG5cdGdldENhY2hlZFR1bm5lbHMoKTogSUNhY2hlZFR1bm5lbFtdIHtcblx0XHRjb25zdCByYXcgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoQ0FDSEVEX1RVTk5FTFNfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGlmICghcmF3KSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShyYXcpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdGNhY2hlVHVubmVsKHR1bm5lbDogSVR1bm5lbEluZm8sIGF1dGhQcm92aWRlcj86ICdnaXRodWInIHwgJ21pY3Jvc29mdCcpOiB2b2lkIHtcblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLmdldENhY2hlZFR1bm5lbHMoKTtcblx0XHRjb25zdCBmaWx0ZXJlZCA9IGNhY2hlZC5maWx0ZXIodCA9PiB0LnR1bm5lbElkICE9PSB0dW5uZWwudHVubmVsSWQpO1xuXHRcdGZpbHRlcmVkLnVuc2hpZnQoe1xuXHRcdFx0dHVubmVsSWQ6IHR1bm5lbC50dW5uZWxJZCxcblx0XHRcdGNsdXN0ZXJJZDogdHVubmVsLmNsdXN0ZXJJZCxcblx0XHRcdG5hbWU6IHR1bm5lbC5uYW1lLFxuXHRcdFx0YXV0aFByb3ZpZGVyLFxuXHRcdH0pO1xuXHRcdHRoaXMuY2xlYXJBdXRvQ29ubmVjdFN1cHByZXNzaW9uKHR1bm5lbC50dW5uZWxJZCk7XG5cdFx0dGhpcy5fc3RvcmVDYWNoZWRUdW5uZWxzKGZpbHRlcmVkKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVR1bm5lbHMuZmlyZSgpO1xuXHR9XG5cblx0cmVtb3ZlQ2FjaGVkVHVubmVsKHR1bm5lbElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLmdldENhY2hlZFR1bm5lbHMoKTtcblx0XHR0aGlzLl9zdG9yZUNhY2hlZFR1bm5lbHMoY2FjaGVkLmZpbHRlcih0ID0+IHQudHVubmVsSWQgIT09IHR1bm5lbElkKSk7XG5cdFx0dGhpcy5jbGVhckF1dG9Db25uZWN0U3VwcHJlc3Npb24odHVubmVsSWQpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVHVubmVscy5maXJlKCk7XG5cdH1cblxuXHRpc0F1dG9Db25uZWN0U3VwcHJlc3NlZCh0dW5uZWxJZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEF1dG9Db25uZWN0U3VwcHJlc3NlZFR1bm5lbHMoKS5oYXModHVubmVsSWQpO1xuXHR9XG5cblx0c3VwcHJlc3NBdXRvQ29ubmVjdCh0dW5uZWxJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3VwcHJlc3NlZCA9IHRoaXMuX2dldEF1dG9Db25uZWN0U3VwcHJlc3NlZFR1bm5lbHMoKTtcblx0XHRzdXBwcmVzc2VkLmFkZCh0dW5uZWxJZCk7XG5cdFx0dGhpcy5fc3RvcmVBdXRvQ29ubmVjdFN1cHByZXNzZWRUdW5uZWxzKHN1cHByZXNzZWQpO1xuXHR9XG5cblx0Y2xlYXJBdXRvQ29ubmVjdFN1cHByZXNzaW9uKHR1bm5lbElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzdXBwcmVzc2VkID0gdGhpcy5fZ2V0QXV0b0Nvbm5lY3RTdXBwcmVzc2VkVHVubmVscygpO1xuXHRcdGlmICghc3VwcHJlc3NlZC5kZWxldGUodHVubmVsSWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3N0b3JlQXV0b0Nvbm5lY3RTdXBwcmVzc2VkVHVubmVscyhzdXBwcmVzc2VkKTtcblx0fVxuXG5cdHByaXZhdGUgX3N0b3JlQ2FjaGVkVHVubmVscyh0dW5uZWxzOiBJQ2FjaGVkVHVubmVsW10pOiB2b2lkIHtcblx0XHRpZiAodHVubmVscy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShDQUNIRURfVFVOTkVMU19LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKENBQ0hFRF9UVU5ORUxTX0tFWSwgSlNPTi5zdHJpbmdpZnkodHVubmVscyksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRBdXRvQ29ubmVjdFN1cHByZXNzZWRUdW5uZWxzKCk6IFNldDxzdHJpbmc+IHtcblx0XHRjb25zdCByYXcgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoQVVUT19DT05ORUNUX1NVUFBSRVNTRURfVFVOTkVMU19LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0aWYgKCFyYXcpIHtcblx0XHRcdHJldHVybiBuZXcgU2V0KCk7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXJzZWQ6IHVua25vd24gPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkocGFyc2VkKSkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFNldCgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyBTZXQocGFyc2VkLmZpbHRlcihpdGVtID0+IHR5cGVvZiBpdGVtID09PSAnc3RyaW5nJykpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIG5ldyBTZXQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zdG9yZUF1dG9Db25uZWN0U3VwcHJlc3NlZFR1bm5lbHModHVubmVsSWRzOiBTZXQ8c3RyaW5nPik6IHZvaWQge1xuXHRcdGlmICh0dW5uZWxJZHMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UucmVtb3ZlKEFVVE9fQ09OTkVDVF9TVVBQUkVTU0VEX1RVTk5FTFNfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShBVVRPX0NPTk5FQ1RfU1VQUFJFU1NFRF9UVU5ORUxTX0tFWSwgSlNPTi5zdHJpbmdpZnkoWy4uLnR1bm5lbElkc10pLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsc0JBQXNCLGdCQUFnQjtBQUMvQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHlCQUF5QixpQ0FBaUMsMEJBQTBCLHdDQUF3QztBQUNySSxTQUFTLGlEQUFpRDtBQUMxRCxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHdCQUF3QjtBQUNqQztBQUFBLEVBQ0M7QUFBQSxFQUVBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQVVNO0FBQ1AsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5Q0FBeUM7QUFDbEQsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyw0QkFBNEI7QUFFckMsTUFBTSxhQUFhO0FBR25CLE1BQU0scUJBQXFCO0FBRTNCLE1BQU0sc0NBQXNDO0FBRzVDLFNBQVMs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
