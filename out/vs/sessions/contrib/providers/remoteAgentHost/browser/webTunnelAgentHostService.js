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
import { RemoteAgentHostProtocolClient } from "../../../../../platform/agentHost/browser/remoteAgentHostProtocolClient.js";
import { agentsWindowAgentHostClientInfo } from "../../../../../platform/agentHost/common/agentHostClientInfo.js";
import { AgentHostClientConnectionKind } from "../../../../../platform/agentHost/common/agentHostTelemetry.js";
import { RemoteAgentHostEntryType, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { PROTOCOL_VERSION } from "../../../../../platform/agentHost/common/state/protocol/version/registry.js";
import { MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD, MALFORMED_FRAMES_LOG_CAP } from "../../../../../platform/agentHost/common/transportConstants.js";
import {
  TUNNEL_ADDRESS_PREFIX,
  TUNNEL_MIN_PROTOCOL_VERSION,
  TunnelTags
} from "../../../../../platform/agentHost/common/tunnelAgentHost.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { IBrowserWorkbenchEnvironmentService } from "../../../../../workbench/services/environment/browser/environmentService.js";
import { IAuthenticationService } from "../../../../../workbench/services/authentication/common/authentication.js";
const LOG_PREFIX = "[WebTunnelAgentHost]";
const CACHED_TUNNELS_KEY = "tunnelAgentHost.recentTunnels";
const AUTO_CONNECT_SUPPRESSED_TUNNELS_KEY = "tunnelAgentHost.autoConnectSuppressedTunnels";
let WebTunnelAgentHostService = class extends Disposable {
  constructor(_remoteAgentHostService, environmentService, _logService, _instantiationService, _configurationService, _authenticationService, _storageService) {
    super();
    this._remoteAgentHostService = _remoteAgentHostService;
    this._logService = _logService;
    this._instantiationService = _instantiationService;
    this._configurationService = _configurationService;
    this._authenticationService = _authenticationService;
    this._storageService = _storageService;
    this._onDidChangeTunnels = this._register(new Emitter());
    this.onDidChangeTunnels = this._onDidChangeTunnels.event;
    this._discoveryProvider = environmentService.options?.tunnelDiscoveryProvider;
    if (!this._discoveryProvider) {
      this._logService.debug(`${LOG_PREFIX} No tunnelDiscoveryProvider \u2014 tunnel discovery disabled`);
    }
  }
  // Discovery
  async listTunnels(options) {
    if (!this._discoveryProvider) {
      return [];
    }
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      return [];
    }
    try {
      const discovered = await this._discoveryProvider.listTunnels();
      const results = [];
      let droppedByProtocolVersion = 0;
      let withoutIds = 0;
      for (const tunnel of discovered) {
        const info = this._toTunnelInfo(tunnel);
        if (!info) {
          withoutIds++;
          continue;
        }
        if (info.protocolVersion < TUNNEL_MIN_PROTOCOL_VERSION) {
          droppedByProtocolVersion++;
          this._logService.debug(
            `${LOG_PREFIX} Dropping tunnel ${info.tunnelId} (protocolVersion=${info.protocolVersion} < ${TUNNEL_MIN_PROTOCOL_VERSION})`
          );
          continue;
        }
        results.push(info);
      }
      const withActiveHost = results.filter((t) => t.hostConnectionCount > 0).length;
      this._logService.info(
        `${LOG_PREFIX} Discovery complete: total=${discovered.length}, accepted=${results.length}, withActiveHost=${withActiveHost}, droppedByProtocolVersion=${droppedByProtocolVersion}, droppedMissingIds=${withoutIds}`
      );
      return results;
    } catch (err) {
      this._logService.error(`${LOG_PREFIX} Failed to list tunnels`, err);
      return [];
    }
  }
  _toTunnelInfo(tunnel) {
    if (!tunnel.tunnelId || !tunnel.clusterId) {
      return void 0;
    }
    const tags = new TunnelTags(tunnel.tags);
    return {
      tunnelId: tunnel.tunnelId,
      clusterId: tunnel.clusterId,
      name: tags.name || tunnel.name || tunnel.tunnelId,
      tags: tunnel.tags,
      protocolVersion: tags.protocolVersion,
      hostConnectionCount: tunnel.hostConnectionCount
    };
  }
  // Connection (via embedder)
  async connect(tunnel, authProvider) {
    if (!this._discoveryProvider) {
      throw new Error("No tunnelDiscoveryProvider available");
    }
    if (!this._configurationService.getValue(RemoteAgentHostsEnabledSettingId)) {
      throw new Error("Remote agent host connections are not enabled.");
    }
    const { tunnelId, clusterId } = tunnel;
    this._logService.info(`${LOG_PREFIX} Connecting to tunnel '${tunnel.name}' (${tunnelId})`);
    const connection = await this._discoveryProvider.connect(tunnelId, clusterId);
    const connectionToken = await deriveConnectionToken(tunnelId);
    const transport = new TunnelConnectionTransport(connection, this._logService);
    const address = `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`;
    const protocolClient = this._instantiationService.createInstance(
      RemoteAgentHostProtocolClient,
      address,
      transport,
      void 0,
      void 0,
      agentsWindowAgentHostClientInfo
    );
    let status = RemoteAgentHostConnectionStatus.connected;
    let connectError;
    try {
      await protocolClient.connect();
      this._logService.info(`${LOG_PREFIX} Protocol handshake completed with ${address}`);
    } catch (err) {
      const incompatible = RemoteAgentHostConnectionStatus.fromConnectError(err, [PROTOCOL_VERSION]);
      if (!RemoteAgentHostConnectionStatus.isIncompatible(incompatible)) {
        protocolClient.dispose();
        this._logService.error(`${LOG_PREFIX} Connection setup failed`, err);
        throw err;
      }
      this._logService.warn(`${LOG_PREFIX} Incompatible with ${address}: ${incompatible.message}`);
      status = incompatible;
      connectError = err;
    }
    this.cacheTunnel(tunnel, authProvider);
    try {
      await this._remoteAgentHostService.addManagedConnection({
        name: tunnel.name,
        connectionToken,
        connection: {
          type: RemoteAgentHostEntryType.Tunnel,
          tunnelId,
          clusterId,
          label: tunnel.name,
          authProvider
        }
      }, protocolClient, void 0, status);
    } catch (err) {
      protocolClient.dispose();
      this._logService.error(`${LOG_PREFIX} addManagedConnection failed`, err);
      throw err;
    }
    if (connectError) {
      throw connectError;
    }
  }
  get canDeleteTunnels() {
    return !!this._discoveryProvider?.deleteTunnel;
  }
  async deleteTunnel(tunnel) {
    const provider = this._discoveryProvider;
    if (!provider?.deleteTunnel) {
      throw new Error("Deleting dev tunnels is not supported by the tunnel discovery provider.");
    }
    await provider.deleteTunnel(tunnel.tunnelId, tunnel.clusterId);
    this.removeCachedTunnel(tunnel.tunnelId);
  }
  async disconnect(address) {
    await this._remoteAgentHostService.removeRemoteAgentHost(address);
    this._onDidChangeTunnels.fire();
  }
  // Auth
  async getAuthProvider(options) {
    for (const provider of ["github", "microsoft"]) {
      const sessions = await this._authenticationService.getSessions(provider, void 0, {}, true);
      if (sessions.length > 0) {
        return provider;
      }
    }
    return void 0;
  }
  // Tunnel cache
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
WebTunnelAgentHostService = __decorateClass([
  __decorateParam(0, IRemoteAgentHostService),
  __decorateParam(1, IBrowserWorkbenchEnvironmentService),
  __decorateParam(2, ILogService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IAuthenticationService),
  __decorateParam(6, IStorageService)
], WebTunnelAgentHostService);
class TunnelConnectionTransport extends Disposable {
  constructor(_connection, _logService) {
    super();
    this._connection = _connection;
    this._logService = _logService;
    this.clientConnectionKind = AgentHostClientConnectionKind.DevTunnel;
    this._onMessage = this._register(new Emitter());
    this.onMessage = this._onMessage.event;
    this._onClose = this._register(new Emitter());
    this.onClose = this._onClose.event;
    this._malformedFrames = 0;
    this._register(_connection.onMessage((data) => {
      let message;
      try {
        message = JSON.parse(data);
      } catch (err) {
        this._malformedFrames++;
        if (this._malformedFrames <= MALFORMED_FRAMES_LOG_CAP) {
          const preview = data.length > 80 ? data.slice(0, 80) + "\u2026" : data;
          this._logService.warn(
            `[TunnelConnectionTransport] Malformed frame #${this._malformedFrames} (len=${data.length}): ${preview}`,
            err instanceof Error ? err.message : String(err)
          );
        }
        if (this._malformedFrames > MALFORMED_FRAMES_FORCE_CLOSE_THRESHOLD) {
          this._logService.warn(
            "[TunnelConnectionTransport] Malformed frame threshold exceeded; forcing tunnel close."
          );
          this._connection.close();
        }
        return;
      }
      this._onMessage.fire(message);
    }));
    this._register(_connection.onClose(() => {
      this._onClose.fire();
    }));
  }
  send(message) {
    this._connection.send(JSON.stringify(message));
  }
  dispose() {
    this._connection.close();
    super.dispose();
  }
}
async function deriveConnectionToken(tunnelId) {
  const encoder = new TextEncoder();
  const data = encoder.encode(tunnelId);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  let result = btoa(String.fromCharCode(...hashArray)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  if (result.startsWith("-")) {
    result = "a" + result;
  }
  return result;
}
export {
  WebTunnelAgentHostService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxyZW1vdGVBZ2VudEhvc3RcXGJyb3dzZXJcXHdlYlR1bm5lbEFnZW50SG9zdFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvYnJvd3Nlci9yZW1vdGVBZ2VudEhvc3RQcm90b2NvbENsaWVudC5qcyc7XG5pbXBvcnQgeyBhZ2VudHNXaW5kb3dBZ2VudEhvc3RDbGllbnRJbmZvIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RDbGllbnRJbmZvLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENsaWVudENvbm5lY3Rpb25LaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgUmVtb3RlQWdlbnRIb3N0RW50cnlUeXBlLCBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSwgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cywgUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3JlbW90ZUFnZW50SG9zdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUFJPVE9DT0xfVkVSU0lPTiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvdmVyc2lvbi9yZWdpc3RyeS5qcyc7XG5pbXBvcnQgdHlwZSB7IElQcm90b2NvbFRyYW5zcG9ydCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblRyYW5zcG9ydC5qcyc7XG5pbXBvcnQgdHlwZSB7IFByb3RvY29sTWVzc2FnZSwgQWhwU2VydmVyTm90aWZpY2F0aW9uLCBKc29uUnBjUmVzcG9uc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25Qcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBNQUxGT1JNRURfRlJBTUVTX0ZPUkNFX0NMT1NFX1RIUkVTSE9MRCwgTUFMRk9STUVEX0ZSQU1FU19MT0dfQ0FQIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi90cmFuc3BvcnRDb25zdGFudHMuanMnO1xuaW1wb3J0IHtcblx0SVR1bm5lbEFnZW50SG9zdFNlcnZpY2UsXG5cdFRVTk5FTF9BRERSRVNTX1BSRUZJWCxcblx0VFVOTkVMX01JTl9QUk9UT0NPTF9WRVJTSU9OLFxuXHRUdW5uZWxUYWdzLFxuXHR0eXBlIElDYWNoZWRUdW5uZWwsXG5cdHR5cGUgSVR1bm5lbEluZm8sXG59IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vdHVubmVsQWdlbnRIb3N0LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElEaXNjb3ZlcmVkVHVubmVsLCBJVHVubmVsQ29ubmVjdGlvbiwgSVR1bm5lbERpc2NvdmVyeVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2Jyb3dzZXIvd2ViLmFwaS5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9lbnZpcm9ubWVudC9icm93c2VyL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5cbmNvbnN0IExPR19QUkVGSVggPSAnW1dlYlR1bm5lbEFnZW50SG9zdF0nO1xuXG4vKiogU3RvcmFnZSBrZXkgZm9yIHJlY2VudGx5IHVzZWQgdHVubmVsIGNhY2hlLiAqL1xuY29uc3QgQ0FDSEVEX1RVTk5FTFNfS0VZID0gJ3R1bm5lbEFnZW50SG9zdC5yZWNlbnRUdW5uZWxzJztcbi8qKiBTdG9yYWdlIGtleSBmb3IgdHVubmVscyB0aGUgdXNlciBleHBsaWNpdGx5IGRpc2Nvbm5lY3RlZC4gKi9cbmNvbnN0IEFVVE9fQ09OTkVDVF9TVVBQUkVTU0VEX1RVTk5FTFNfS0VZID0gJ3R1bm5lbEFnZW50SG9zdC5hdXRvQ29ubmVjdFN1cHByZXNzZWRUdW5uZWxzJztcblxuLyoqXG4gKiBXZWIgKGJyb3dzZXIpIGltcGxlbWVudGF0aW9uIG9mIHtAbGluayBJVHVubmVsQWdlbnRIb3N0U2VydmljZX0uXG4gKlxuICogRGVsZWdhdGVzIHRvIHRoZSBlbWJlZGRlcidzIHtAbGluayBJVHVubmVsRGlzY292ZXJ5UHJvdmlkZXJ9IChwcm92aWRlZCB2aWFcbiAqIGBJV29ya2JlbmNoQ29uc3RydWN0aW9uT3B0aW9ucy50dW5uZWxEaXNjb3ZlcnlQcm92aWRlcmApIGZvcjpcbiAqIC0gKipEaXNjb3ZlcnkqKjogbGlzdGluZyBhdmFpbGFibGUgYWdlbnQgaG9zdCB0dW5uZWxzXG4gKiAtICoqUmVsYXkgYWRkcmVzcyoqOiBvYnRhaW5pbmcgdGhlIFdlYlNvY2tldCBwcm94eSBVUkwgZm9yIGNvbm5lY3RpbmdcbiAqXG4gKiBUaGlzIGRlY291cGxlcyBWUyBDb2RlIGNvcmUgZnJvbSBhbnkgc3BlY2lmaWMgZW1iZWRkZXIgKHZzY29kZS5kZXYsXG4gKiBnaXRodWIuZGV2LCBldGMuKS4gVGhlIGVtYmVkZGVyIGhhbmRsZXMgdGhlIGFjdHVhbCBEZXYgVHVubmVscyBBUElcbiAqIGNhbGxzIGFuZCByZWxheSBwcm94eWluZy5cbiAqL1xuZXhwb3J0IGNsYXNzIFdlYlR1bm5lbEFnZW50SG9zdFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVR1bm5lbEFnZW50SG9zdFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVR1bm5lbHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VUdW5uZWxzOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkQ2hhbmdlVHVubmVscy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNjb3ZlcnlQcm92aWRlcjogSVR1bm5lbERpc2NvdmVyeVByb3ZpZGVyIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlOiBJUmVtb3RlQWdlbnRIb3N0U2VydmljZSxcblx0XHRASUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgZW52aXJvbm1lbnRTZXJ2aWNlOiBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUF1dGhlbnRpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hdXRoZW50aWNhdGlvblNlcnZpY2U6IElBdXRoZW50aWNhdGlvblNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9zdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2Rpc2NvdmVyeVByb3ZpZGVyID0gZW52aXJvbm1lbnRTZXJ2aWNlLm9wdGlvbnM/LnR1bm5lbERpc2NvdmVyeVByb3ZpZGVyO1xuXHRcdGlmICghdGhpcy5fZGlzY292ZXJ5UHJvdmlkZXIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZGVidWcoYCR7TE9HX1BSRUZJWH0gTm8gdHVubmVsRGlzY292ZXJ5UHJvdmlkZXIgXHUyMDE0IHR1bm5lbCBkaXNjb3ZlcnkgZGlzYWJsZWRgKTtcblx0XHR9XG5cdH1cblxuXHQvLyBEaXNjb3ZlcnlcblxuXHRhc3luYyBsaXN0VHVubmVscyhvcHRpb25zPzogeyBzaWxlbnQ/OiBib29sZWFuIH0pOiBQcm9taXNlPElUdW5uZWxJbmZvW10+IHtcblx0XHRpZiAoIXRoaXMuX2Rpc2NvdmVyeVByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Ly8gVGhlIGVtYmVkZGVyIGFjcXVpcmVzIHRva2VucyBpbnRlcm5hbGx5IHZpYSBpdHMgb3duIGF1dGggZmxvd1xuXHRcdFx0Y29uc3QgZGlzY292ZXJlZCA9IGF3YWl0IHRoaXMuX2Rpc2NvdmVyeVByb3ZpZGVyLmxpc3RUdW5uZWxzKCk7XG5cdFx0XHRjb25zdCByZXN1bHRzOiBJVHVubmVsSW5mb1tdID0gW107XG5cdFx0XHRsZXQgZHJvcHBlZEJ5UHJvdG9jb2xWZXJzaW9uID0gMDtcblx0XHRcdGxldCB3aXRob3V0SWRzID0gMDtcblxuXHRcdFx0Zm9yIChjb25zdCB0dW5uZWwgb2YgZGlzY292ZXJlZCkge1xuXHRcdFx0XHRjb25zdCBpbmZvID0gdGhpcy5fdG9UdW5uZWxJbmZvKHR1bm5lbCk7XG5cdFx0XHRcdGlmICghaW5mbykge1xuXHRcdFx0XHRcdHdpdGhvdXRJZHMrKztcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoaW5mby5wcm90b2NvbFZlcnNpb24gPCBUVU5ORUxfTUlOX1BST1RPQ09MX1ZFUlNJT04pIHtcblx0XHRcdFx0XHRkcm9wcGVkQnlQcm90b2NvbFZlcnNpb24rKztcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKFxuXHRcdFx0XHRcdFx0YCR7TE9HX1BSRUZJWH0gRHJvcHBpbmcgdHVubmVsICR7aW5mby50dW5uZWxJZH0gKHByb3RvY29sVmVyc2lvbj0ke2luZm8ucHJvdG9jb2xWZXJzaW9ufSA8ICR7VFVOTkVMX01JTl9QUk9UT0NPTF9WRVJTSU9OfSlgXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXN1bHRzLnB1c2goaW5mbyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHdpdGhBY3RpdmVIb3N0ID0gcmVzdWx0cy5maWx0ZXIodCA9PiB0Lmhvc3RDb25uZWN0aW9uQ291bnQgPiAwKS5sZW5ndGg7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oXG5cdFx0XHRcdGAke0xPR19QUkVGSVh9IERpc2NvdmVyeSBjb21wbGV0ZTogdG90YWw9JHtkaXNjb3ZlcmVkLmxlbmd0aH0sIGFjY2VwdGVkPSR7cmVzdWx0cy5sZW5ndGh9LCB3aXRoQWN0aXZlSG9zdD0ke3dpdGhBY3RpdmVIb3N0fSwgZHJvcHBlZEJ5UHJvdG9jb2xWZXJzaW9uPSR7ZHJvcHBlZEJ5UHJvdG9jb2xWZXJzaW9ufSwgZHJvcHBlZE1pc3NpbmdJZHM9JHt3aXRob3V0SWRzfWBcblx0XHRcdCk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0cztcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYCR7TE9HX1BSRUZJWH0gRmFpbGVkIHRvIGxpc3QgdHVubmVsc2AsIGVycik7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdG9UdW5uZWxJbmZvKHR1bm5lbDogSURpc2NvdmVyZWRUdW5uZWwpOiBJVHVubmVsSW5mbyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0dW5uZWwudHVubmVsSWQgfHwgIXR1bm5lbC5jbHVzdGVySWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFncyA9IG5ldyBUdW5uZWxUYWdzKHR1bm5lbC50YWdzKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHR0dW5uZWxJZDogdHVubmVsLnR1bm5lbElkLFxuXHRcdFx0Y2x1c3RlcklkOiB0dW5uZWwuY2x1c3RlcklkLFxuXHRcdFx0bmFtZTogdGFncy5uYW1lIHx8IHR1bm5lbC5uYW1lIHx8IHR1bm5lbC50dW5uZWxJZCxcblx0XHRcdHRhZ3M6IHR1bm5lbC50YWdzIGFzIHN0cmluZ1tdLFxuXHRcdFx0cHJvdG9jb2xWZXJzaW9uOiB0YWdzLnByb3RvY29sVmVyc2lvbixcblx0XHRcdGhvc3RDb25uZWN0aW9uQ291bnQ6IHR1bm5lbC5ob3N0Q29ubmVjdGlvbkNvdW50LFxuXHRcdH07XG5cdH1cblxuXHQvLyBDb25uZWN0aW9uICh2aWEgZW1iZWRkZXIpXG5cblx0YXN5bmMgY29ubmVjdCh0dW5uZWw6IElUdW5uZWxJbmZvLCBhdXRoUHJvdmlkZXI/OiAnZ2l0aHViJyB8ICdtaWNyb3NvZnQnKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9kaXNjb3ZlcnlQcm92aWRlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyB0dW5uZWxEaXNjb3ZlcnlQcm92aWRlciBhdmFpbGFibGUnKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignUmVtb3RlIGFnZW50IGhvc3QgY29ubmVjdGlvbnMgYXJlIG5vdCBlbmFibGVkLicpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgdHVubmVsSWQsIGNsdXN0ZXJJZCB9ID0gdHVubmVsO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBDb25uZWN0aW5nIHRvIHR1bm5lbCAnJHt0dW5uZWwubmFtZX0nICgke3R1bm5lbElkfSlgKTtcblxuXHRcdC8vIFRoZSBlbWJlZGRlciBoYW5kbGVzIHRoZSBmdWxsIGNvbm5lY3Rpb24gaW5jbHVkaW5nIGF1dGhcblx0XHRjb25zdCBjb25uZWN0aW9uID0gYXdhaXQgdGhpcy5fZGlzY292ZXJ5UHJvdmlkZXIuY29ubmVjdCh0dW5uZWxJZCwgY2x1c3RlcklkKTtcblxuXHRcdC8vIERlcml2ZSBjb25uZWN0aW9uIHRva2VuIGZyb20gdHVubmVsIElEIChzYW1lIGNvbnZlbnRpb24gYXMgQ0xJIGFuZCBkZXNrdG9wKVxuXHRcdGNvbnN0IGNvbm5lY3Rpb25Ub2tlbiA9IGF3YWl0IGRlcml2ZUNvbm5lY3Rpb25Ub2tlbih0dW5uZWxJZCk7XG5cblx0XHRjb25zdCB0cmFuc3BvcnQgPSBuZXcgVHVubmVsQ29ubmVjdGlvblRyYW5zcG9ydChjb25uZWN0aW9uLCB0aGlzLl9sb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBhZGRyZXNzID0gYCR7VFVOTkVMX0FERFJFU1NfUFJFRklYfSR7dHVubmVsSWR9YDtcblx0XHRjb25zdCBwcm90b2NvbENsaWVudCA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0UmVtb3RlQWdlbnRIb3N0UHJvdG9jb2xDbGllbnQsIGFkZHJlc3MsIHRyYW5zcG9ydCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGFnZW50c1dpbmRvd0FnZW50SG9zdENsaWVudEluZm8sXG5cdFx0KTtcblxuXHRcdC8vIEtlZXAgYW4gaW5jb21wYXRpYmxlIGhhbmRzaGFrZSBmcm9tIHRlYXJpbmcgZG93biB0aGUgcmVsYXk6IHRoZVxuXHRcdC8vIHByb3RvY29sIGNsaWVudCBtdXN0IHJlbWFpbiByZWdpc3RlcmVkIHdpdGggSVJlbW90ZUFnZW50SG9zdFNlcnZpY2Vcblx0XHQvLyBzbyBgdHJpZ2dlclNlcnZlclVwZ3JhZGVgIGNhbiBsb2NhdGUgaXQgYW5kIHNlbmQgYF92c2NvZGVVcGdyYWRlYFxuXHRcdC8vIG92ZXIgdGhlIHN0aWxsLW9wZW4gdHJhbnNwb3J0LlxuXHRcdGxldCBzdGF0dXM6IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMgPSBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RlZDtcblx0XHRsZXQgY29ubmVjdEVycm9yOiB1bmtub3duO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBwcm90b2NvbENsaWVudC5jb25uZWN0KCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gUHJvdG9jb2wgaGFuZHNoYWtlIGNvbXBsZXRlZCB3aXRoICR7YWRkcmVzc31gKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNvbnN0IGluY29tcGF0aWJsZSA9IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuZnJvbUNvbm5lY3RFcnJvcihlcnIsIFtQUk9UT0NPTF9WRVJTSU9OXSk7XG5cdFx0XHRpZiAoIVJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuaXNJbmNvbXBhdGlibGUoaW5jb21wYXRpYmxlKSkge1xuXHRcdFx0XHRwcm90b2NvbENsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYCR7TE9HX1BSRUZJWH0gQ29ubmVjdGlvbiBzZXR1cCBmYWlsZWRgLCBlcnIpO1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gSW5jb21wYXRpYmxlIHdpdGggJHthZGRyZXNzfTogJHtpbmNvbXBhdGlibGUubWVzc2FnZX1gKTtcblx0XHRcdHN0YXR1cyA9IGluY29tcGF0aWJsZTtcblx0XHRcdGNvbm5lY3RFcnJvciA9IGVycjtcblx0XHR9XG5cblx0XHQvLyBDYWNoZSBiZWZvcmUgYW5ub3VuY2luZyB0aGUgbGl2ZSBjb25uZWN0aW9uIHNvIHRoZSBjb250cmlidXRpb24nc1xuXHRcdC8vIGBvbkRpZENoYW5nZVR1bm5lbHNgIGhhbmRsZXIgaGFzIGNyZWF0ZWQgdGhlIHByb3ZpZGVyIGJ5IHRoZSB0aW1lXG5cdFx0Ly8gYG9uRGlkQ2hhbmdlQ29ubmVjdGlvbnNgIGZpcmVzIGZyb20gYGFkZE1hbmFnZWRDb25uZWN0aW9uYCBhbmRcblx0XHQvLyB3aXJlcyB0aGUgY29ubmVjdGlvbi4gQWxzbyBmaXJlcyBgb25EaWRDaGFuZ2VUdW5uZWxzYC5cblx0XHR0aGlzLmNhY2hlVHVubmVsKHR1bm5lbCwgYXV0aFByb3ZpZGVyKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLmFkZE1hbmFnZWRDb25uZWN0aW9uKHtcblx0XHRcdFx0bmFtZTogdHVubmVsLm5hbWUsXG5cdFx0XHRcdGNvbm5lY3Rpb25Ub2tlbixcblx0XHRcdFx0Y29ubmVjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IFJlbW90ZUFnZW50SG9zdEVudHJ5VHlwZS5UdW5uZWwsXG5cdFx0XHRcdFx0dHVubmVsSWQsXG5cdFx0XHRcdFx0Y2x1c3RlcklkLFxuXHRcdFx0XHRcdGxhYmVsOiB0dW5uZWwubmFtZSxcblx0XHRcdFx0XHRhdXRoUHJvdmlkZXIsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LCBwcm90b2NvbENsaWVudCwgdW5kZWZpbmVkLCBzdGF0dXMpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0cHJvdG9jb2xDbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgJHtMT0dfUFJFRklYfSBhZGRNYW5hZ2VkQ29ubmVjdGlvbiBmYWlsZWRgLCBlcnIpO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblxuXHRcdGlmIChjb25uZWN0RXJyb3IpIHtcblx0XHRcdHRocm93IGNvbm5lY3RFcnJvcjtcblx0XHR9XG5cdH1cblxuXHRnZXQgY2FuRGVsZXRlVHVubmVscygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLl9kaXNjb3ZlcnlQcm92aWRlcj8uZGVsZXRlVHVubmVsO1xuXHR9XG5cblx0YXN5bmMgZGVsZXRlVHVubmVsKHR1bm5lbDogSVR1bm5lbEluZm8pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2Rpc2NvdmVyeVByb3ZpZGVyO1xuXHRcdGlmICghcHJvdmlkZXI/LmRlbGV0ZVR1bm5lbCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdEZWxldGluZyBkZXYgdHVubmVscyBpcyBub3Qgc3VwcG9ydGVkIGJ5IHRoZSB0dW5uZWwgZGlzY292ZXJ5IHByb3ZpZGVyLicpO1xuXHRcdH1cblxuXHRcdGF3YWl0IHByb3ZpZGVyLmRlbGV0ZVR1bm5lbCh0dW5uZWwudHVubmVsSWQsIHR1bm5lbC5jbHVzdGVySWQpO1xuXHRcdHRoaXMucmVtb3ZlQ2FjaGVkVHVubmVsKHR1bm5lbC50dW5uZWxJZCk7XG5cdH1cblxuXHRhc3luYyBkaXNjb25uZWN0KGFkZHJlc3M6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3JlbW90ZUFnZW50SG9zdFNlcnZpY2UucmVtb3ZlUmVtb3RlQWdlbnRIb3N0KGFkZHJlc3MpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVHVubmVscy5maXJlKCk7XG5cdH1cblxuXHQvLyBBdXRoXG5cblx0YXN5bmMgZ2V0QXV0aFByb3ZpZGVyKG9wdGlvbnM/OiB7IHNpbGVudD86IGJvb2xlYW4gfSk6IFByb21pc2U8J2dpdGh1YicgfCAnbWljcm9zb2Z0JyB8IHVuZGVmaW5lZD4ge1xuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgWydnaXRodWInLCAnbWljcm9zb2Z0J10gYXMgY29uc3QpIHtcblx0XHRcdGNvbnN0IHNlc3Npb25zID0gYXdhaXQgdGhpcy5fYXV0aGVudGljYXRpb25TZXJ2aWNlLmdldFNlc3Npb25zKHByb3ZpZGVyLCB1bmRlZmluZWQsIHt9LCB0cnVlKTtcblx0XHRcdGlmIChzZXNzaW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJldHVybiBwcm92aWRlcjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8vIFR1bm5lbCBjYWNoZVxuXG5cdGdldENhY2hlZFR1bm5lbHMoKTogSUNhY2hlZFR1bm5lbFtdIHtcblx0XHRjb25zdCByYXcgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoQ0FDSEVEX1RVTk5FTFNfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGlmICghcmF3KSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShyYXcpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdGNhY2hlVHVubmVsKHR1bm5lbDogSVR1bm5lbEluZm8sIGF1dGhQcm92aWRlcj86ICdnaXRodWInIHwgJ21pY3Jvc29mdCcpOiB2b2lkIHtcblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLmdldENhY2hlZFR1bm5lbHMoKTtcblx0XHRjb25zdCBmaWx0ZXJlZCA9IGNhY2hlZC5maWx0ZXIodCA9PiB0LnR1bm5lbElkICE9PSB0dW5uZWwudHVubmVsSWQpO1xuXHRcdGZpbHRlcmVkLnVuc2hpZnQoe1xuXHRcdFx0dHVubmVsSWQ6IHR1bm5lbC50dW5uZWxJZCxcblx0XHRcdGNsdXN0ZXJJZDogdHVubmVsLmNsdXN0ZXJJZCxcblx0XHRcdG5hbWU6IHR1bm5lbC5uYW1lLFxuXHRcdFx0YXV0aFByb3ZpZGVyLFxuXHRcdH0pO1xuXHRcdHRoaXMuY2xlYXJBdXRvQ29ubmVjdFN1cHByZXNzaW9uKHR1bm5lbC50dW5uZWxJZCk7XG5cdFx0dGhpcy5fc3RvcmVDYWNoZWRUdW5uZWxzKGZpbHRlcmVkKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVR1bm5lbHMuZmlyZSgpO1xuXHR9XG5cblx0cmVtb3ZlQ2FjaGVkVHVubmVsKHR1bm5lbElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLmdldENhY2hlZFR1bm5lbHMoKTtcblx0XHR0aGlzLl9zdG9yZUNhY2hlZFR1bm5lbHMoY2FjaGVkLmZpbHRlcih0ID0+IHQudHVubmVsSWQgIT09IHR1bm5lbElkKSk7XG5cdFx0dGhpcy5jbGVhckF1dG9Db25uZWN0U3VwcHJlc3Npb24odHVubmVsSWQpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVHVubmVscy5maXJlKCk7XG5cdH1cblxuXHRpc0F1dG9Db25uZWN0U3VwcHJlc3NlZCh0dW5uZWxJZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2dldEF1dG9Db25uZWN0U3VwcHJlc3NlZFR1bm5lbHMoKS5oYXModHVubmVsSWQpO1xuXHR9XG5cblx0c3VwcHJlc3NBdXRvQ29ubmVjdCh0dW5uZWxJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3VwcHJlc3NlZCA9IHRoaXMuX2dldEF1dG9Db25uZWN0U3VwcHJlc3NlZFR1bm5lbHMoKTtcblx0XHRzdXBwcmVzc2VkLmFkZCh0dW5uZWxJZCk7XG5cdFx0dGhpcy5fc3RvcmVBdXRvQ29ubmVjdFN1cHByZXNzZWRUdW5uZWxzKHN1cHByZXNzZWQpO1xuXHR9XG5cblx0Y2xlYXJBdXRvQ29ubmVjdFN1cHByZXNzaW9uKHR1bm5lbElkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzdXBwcmVzc2VkID0gdGhpcy5fZ2V0QXV0b0Nvbm5lY3RTdXBwcmVzc2VkVHVubmVscygpO1xuXHRcdGlmICghc3VwcHJlc3NlZC5kZWxldGUodHVubmVsSWQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3N0b3JlQXV0b0Nvbm5lY3RTdXBwcmVzc2VkVHVubmVscyhzdXBwcmVzc2VkKTtcblx0fVxuXG5cdHByaXZhdGUgX3N0b3JlQ2FjaGVkVHVubmVscyh0dW5uZWxzOiBJQ2FjaGVkVHVubmVsW10pOiB2b2lkIHtcblx0XHRpZiAodHVubmVscy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShDQUNIRURfVFVOTkVMU19LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKENBQ0hFRF9UVU5ORUxTX0tFWSwgSlNPTi5zdHJpbmdpZnkodHVubmVscyksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRBdXRvQ29ubmVjdFN1cHByZXNzZWRUdW5uZWxzKCk6IFNldDxzdHJpbmc+IHtcblx0XHRjb25zdCByYXcgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoQVVUT19DT05ORUNUX1NVUFBSRVNTRURfVFVOTkVMU19LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0aWYgKCFyYXcpIHtcblx0XHRcdHJldHVybiBuZXcgU2V0KCk7XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXJzZWQ6IHVua25vd24gPSBKU09OLnBhcnNlKHJhdyk7XG5cdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkocGFyc2VkKSkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFNldCgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyBTZXQocGFyc2VkLmZpbHRlcihpdGVtID0+IHR5cGVvZiBpdGVtID09PSAnc3RyaW5nJykpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIG5ldyBTZXQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zdG9yZUF1dG9Db25uZWN0U3VwcHJlc3NlZFR1bm5lbHModHVubmVsSWRzOiBTZXQ8c3RyaW5nPik6IHZvaWQge1xuXHRcdGlmICh0dW5uZWxJZHMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UucmVtb3ZlKEFVVE9fQ09OTkVDVF9TVVBQUkVTU0VEX1RVTk5FTFNfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShBVVRPX0NPTk5FQ1RfU1VQUFJFU1NFRF9UVU5ORUxTX0tFWSwgSlNPTi5zdHJpbmdpZnkoWy4uLnR1bm5lbElkc10pLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogQWRhcHRzIGFuIHtAbGluayBJVHVubmVsQ29ubmVjdGlvbn0gKGVtYmVkZGVyLXByb3ZpZGVkKSBpbnRvIGFuXG4gKiB7QGxpbmsgSVByb3RvY29sVHJhbnNwb3J0fSBmb3Ige0BsaW5rIFJlbW90ZUFnZW50SG9zdFByb3RvY29sQ2xpZW50fS5cbiAqXG4gKiBUaGUgY29ubmVjdGlvbiBpcyBhbHJlYWR5IGVzdGFibGlzaGVkIGJ5IHRoZSB0aW1lIHRoaXMgYWRhcHRlciBpcyBjcmVhdGVkLFxuICogc28gdGhlcmUgaXMgbm8gYGNvbm5lY3QoKWAgbWV0aG9kIFx1MjAxNCB0aGUgcHJvdG9jb2wgY2xpZW50IHNraXBzIHRoYXQgc3RlcC5cbiAqL1xuY2xhc3MgVHVubmVsQ29ubmVjdGlvblRyYW5zcG9ydCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUHJvdG9jb2xUcmFuc3BvcnQge1xuXHRyZWFkb25seSBjbGllbnRDb25uZWN0aW9uS2luZCA9IEFnZW50SG9zdENsaWVudENvbm5lY3Rpb25LaW5kLkRldlR1bm5lbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1lc3NhZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxQcm90b2NvbE1lc3NhZ2U+KCkpO1xuXHRyZWFkb25seSBvbk1lc3NhZ2UgPSB0aGlzLl9vbk1lc3NhZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25DbG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkNsb3NlID0gdGhpcy5fb25DbG9zZS5ldmVudDtcblxuXHRwcml2YXRlIF9tYWxmb3JtZWRGcmFtZXMgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3Rpb246IElUdW5uZWxDb25uZWN0aW9uLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKF9jb25uZWN0aW9uLm9uTWVzc2FnZSgoZGF0YTogc3RyaW5nKSA9PiB7XG5cdFx0XHRsZXQgbWVzc2FnZTogUHJvdG9jb2xNZXNzYWdlO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0bWVzc2FnZSA9IEpTT04ucGFyc2UoZGF0YSkgYXMgUHJvdG9jb2xNZXNzYWdlO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX21hbGZvcm1lZEZyYW1lcysrO1xuXHRcdFx0XHRpZiAodGhpcy5fbWFsZm9ybWVkRnJhbWVzIDw9IE1BTEZPUk1FRF9GUkFNRVNfTE9HX0NBUCkge1xuXHRcdFx0XHRcdGNvbnN0IHByZXZpZXcgPSBkYXRhLmxlbmd0aCA+IDgwID8gZGF0YS5zbGljZSgwLCA4MCkgKyAnXHUyMDI2JyA6IGRhdGE7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKFxuXHRcdFx0XHRcdFx0YFtUdW5uZWxDb25uZWN0aW9uVHJhbnNwb3J0XSBNYWxmb3JtZWQgZnJhbWUgIyR7dGhpcy5fbWFsZm9ybWVkRnJhbWVzfSAobGVuPSR7ZGF0YS5sZW5ndGh9KTogJHtwcmV2aWV3fWAsXG5cdFx0XHRcdFx0XHRlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycilcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLl9tYWxmb3JtZWRGcmFtZXMgPiBNQUxGT1JNRURfRlJBTUVTX0ZPUkNFX0NMT1NFX1RIUkVTSE9MRCkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2Fybihcblx0XHRcdFx0XHRcdCdbVHVubmVsQ29ubmVjdGlvblRyYW5zcG9ydF0gTWFsZm9ybWVkIGZyYW1lIHRocmVzaG9sZCBleGNlZWRlZDsgZm9yY2luZyB0dW5uZWwgY2xvc2UuJ1xuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0dGhpcy5fY29ubmVjdGlvbi5jbG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uTWVzc2FnZS5maXJlKG1lc3NhZ2UpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihfY29ubmVjdGlvbi5vbkNsb3NlKCgpID0+IHtcblx0XHRcdHRoaXMuX29uQ2xvc2UuZmlyZSgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHNlbmQobWVzc2FnZTogUHJvdG9jb2xNZXNzYWdlIHwgQWhwU2VydmVyTm90aWZpY2F0aW9uIHwgSnNvblJwY1Jlc3BvbnNlKTogdm9pZCB7XG5cdFx0dGhpcy5fY29ubmVjdGlvbi5zZW5kKEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fY29ubmVjdGlvbi5jbG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKipcbiAqIERlcml2ZSBhIGNvbm5lY3Rpb24gdG9rZW4gZnJvbSBhIHR1bm5lbCBJRCB1c2luZyB0aGUgc2FtZSBjb252ZW50aW9uXG4gKiBhcyB0aGUgVlMgQ29kZSBDTEkgYW5kIHRoZSBkZXNrdG9wIHNoYXJlZC1wcm9jZXNzIHNlcnZpY2UuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGRlcml2ZUNvbm5lY3Rpb25Ub2tlbih0dW5uZWxJZDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0Y29uc3QgZW5jb2RlciA9IG5ldyBUZXh0RW5jb2RlcigpO1xuXHRjb25zdCBkYXRhID0gZW5jb2Rlci5lbmNvZGUodHVubmVsSWQpO1xuXHRjb25zdCBoYXNoQnVmZmVyID0gYXdhaXQgZ2xvYmFsVGhpcy5jcnlwdG8uc3VidGxlLmRpZ2VzdCgnU0hBLTI1NicsIGRhdGEpO1xuXHRjb25zdCBoYXNoQXJyYXkgPSBuZXcgVWludDhBcnJheShoYXNoQnVmZmVyKTtcblxuXHQvLyBCYXNlNjR1cmwgZW5jb2RlIChtYXRjaGVzIE5vZGUncyBjcmVhdGVIYXNoKCdzaGEyNTYnKS5kaWdlc3QoJ2Jhc2U2NHVybCcpKVxuXHRsZXQgcmVzdWx0ID0gYnRvYShTdHJpbmcuZnJvbUNoYXJDb2RlKC4uLmhhc2hBcnJheSkpXG5cdFx0LnJlcGxhY2UoL1xcKy9nLCAnLScpXG5cdFx0LnJlcGxhY2UoL1xcLy9nLCAnXycpXG5cdFx0LnJlcGxhY2UoLz0rJC8sICcnKTtcblxuXHRpZiAocmVzdWx0LnN0YXJ0c1dpdGgoJy0nKSkge1xuXHRcdHJlc3VsdCA9ICdhJyArIHJlc3VsdDtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsMEJBQTBCLHlCQUF5QixpQ0FBaUMsd0NBQXdDO0FBQ3JJLFNBQVMsd0JBQXdC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
