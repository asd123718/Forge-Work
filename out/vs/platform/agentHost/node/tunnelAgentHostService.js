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
import { createHash } from "crypto";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableMap } from "../../../base/common/lifecycle.js";
import { raceTimeout } from "../../../base/common/async.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { ILogService } from "../../log/common/log.js";
import {
  createTunnelGatewaySelectionRejectedError,
  parseTunnelGatewayInventory,
  parseTunnelGatewaySelectionResponse,
  TUNNEL_ADDRESS_PREFIX,
  TUNNEL_AGENT_HOST_PORT,
  TUNNEL_GATEWAY_MIN_PROTOCOL_VERSION,
  TUNNEL_GATEWAY_SELECT_PATH,
  TUNNEL_LAUNCHER_LABEL,
  TUNNEL_MIN_PROTOCOL_VERSION,
  TunnelTags
} from "../common/tunnelAgentHost.js";
const LOG_PREFIX = "[TunnelAgentHost]";
const TUNNEL_STEP_TIMEOUT_MS = 3e4;
async function withTimeout(op, timeoutMs, stepName) {
  let timedOut = false;
  const result = await raceTimeout(op(), timeoutMs, () => {
    timedOut = true;
  });
  if (timedOut) {
    throw new Error(`${LOG_PREFIX} ${stepName} timed out after ${timeoutMs}ms`);
  }
  return result;
}
function deriveConnectionToken(tunnelId) {
  const hash = createHash("sha256");
  hash.update(tunnelId);
  let result = hash.digest("base64url");
  if (result.startsWith("-")) {
    result = `a${result}`;
  }
  return result;
}
function rawGatewayDataToString(data) {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString();
  } else if (data instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(data)).toString();
  }
  return data.toString();
}
class TunnelConnection extends Disposable {
  constructor(connectionId, address, name, connectionToken, _relay, _relayClient) {
    super();
    this.connectionId = connectionId;
    this.address = address;
    this.name = name;
    this.connectionToken = connectionToken;
    this._relay = _relay;
    this._relayClient = _relayClient;
    this._onDidClose = this._register(new Emitter());
    this.onDidClose = this._onDidClose.event;
    this._closed = false;
  }
  dispose() {
    if (!this._closed) {
      this._closed = true;
      this._relay.close();
      this._relayClient.dispose();
      this._onDidClose.fire();
    }
    super.dispose();
  }
  relaySend(data) {
    this._relay.send(data);
  }
}
class PendingGatewaySelection {
  constructor(address, name, connectionToken, ws, relayClient, _onUnexpectedClose) {
    this.address = address;
    this.name = name;
    this.connectionToken = connectionToken;
    this.ws = ws;
    this.relayClient = relayClient;
    this._onUnexpectedClose = _onUnexpectedClose;
    this._disposed = false;
    this._onSocketClosed = () => {
      if (!this._disposed) {
        this._onUnexpectedClose();
      }
    };
    this.ws.once("close", this._onSocketClosed);
  }
  /** Detach the auto-cleanup listener so ownership of the socket can transfer to a live {@link TunnelConnection}. */
  detach() {
    this.ws.off("close", this._onSocketClosed);
  }
  dispose() {
    if (!this._disposed) {
      this._disposed = true;
      this.ws.off("close", this._onSocketClosed);
      try {
        this.ws.close();
      } catch {
      }
      try {
        this.relayClient.dispose();
      } catch {
      }
    }
  }
}
let TunnelAgentHostMainService = class extends Disposable {
  constructor(_logService) {
    super();
    this._logService = _logService;
    this._onDidRelayMessage = this._register(new Emitter());
    this.onDidRelayMessage = this._onDidRelayMessage.event;
    this._onDidRelayClose = this._register(new Emitter());
    this.onDidRelayClose = this._onDidRelayClose.event;
    this._connections = /* @__PURE__ */ new Map();
    this._pendingSelections = this._register(new DisposableMap());
  }
  async listTunnels(token, authProvider, additionalTunnelNames) {
    const client = await this._createManagementClient(token, authProvider);
    const results = [];
    const seen = /* @__PURE__ */ new Set();
    try {
      const tunnels = await client.listTunnels(void 0, void 0, {
        labels: [TUNNEL_LAUNCHER_LABEL],
        requireAllLabels: true,
        includePorts: true,
        tokenScopes: ["connect"]
      });
      for (const tunnel of tunnels) {
        const info = this._parseTunnelInfo(tunnel);
        if (info && info.protocolVersion >= TUNNEL_MIN_PROTOCOL_VERSION) {
          results.push(info);
          seen.add(info.tunnelId);
        }
      }
    } catch (err) {
      this._logService.error(`${LOG_PREFIX} Failed to enumerate tunnels`, err);
    }
    if (additionalTunnelNames) {
      for (const tunnelName of additionalTunnelNames) {
        try {
          const [tunnel] = await client.listTunnels(void 0, void 0, {
            labels: [tunnelName, TUNNEL_LAUNCHER_LABEL],
            requireAllLabels: true,
            includePorts: true,
            tokenScopes: ["connect"],
            limit: 1
          });
          if (tunnel) {
            const info = this._parseTunnelInfo(tunnel);
            if (info && info.protocolVersion >= TUNNEL_MIN_PROTOCOL_VERSION && !seen.has(info.tunnelId)) {
              results.push(info);
              seen.add(info.tunnelId);
            }
          }
        } catch (err) {
          this._logService.warn(`${LOG_PREFIX} Failed to look up tunnel '${tunnelName}'`, err);
        }
      }
    }
    this._logService.info(`${LOG_PREFIX} Found ${results.length} tunnel(s) with agent host support`);
    return results;
  }
  async deleteTunnel(token, authProvider, tunnelId, clusterId) {
    const client = await this._createManagementClient(token, authProvider);
    const tunnel = { tunnelId, clusterId };
    this._logService.info(`${LOG_PREFIX} Deleting tunnel ${tunnelId} in cluster ${clusterId}...`);
    await client.deleteTunnel(tunnel);
    this._closeTunnelConnections(tunnelId, "deleting");
    this._logService.info(`${LOG_PREFIX} Deleted tunnel ${tunnelId}`);
  }
  async connect(token, authProvider, tunnelId, clusterId) {
    this._closeTunnelConnections(tunnelId, "reconnecting");
    const client = await this._createManagementClient(token, authProvider);
    const connectionId = generateUuid();
    const address = `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`;
    this._logService.info(`${LOG_PREFIX} Connecting to tunnel ${tunnelId} in cluster ${clusterId}...`);
    const tunnel = { tunnelId, clusterId };
    const resolved = await client.getTunnel(tunnel, {
      includePorts: true,
      tokenScopes: ["connect"]
    });
    if (!resolved) {
      throw new Error(`${LOG_PREFIX} Tunnel ${tunnelId} not found`);
    }
    const { TunnelRelayTunnelClient } = await import("@microsoft/dev-tunnels-connections");
    const relayClient = new TunnelRelayTunnelClient(client);
    relayClient.acceptLocalConnectionsForForwardedPorts = false;
    if (resolved.endpoints) {
      relayClient.endpoints = resolved.endpoints;
    }
    let portStream;
    try {
      await withTimeout(() => relayClient.connect(resolved), TUNNEL_STEP_TIMEOUT_MS, "tunnel relay connect");
      this._logService.info(`${LOG_PREFIX} Tunnel relay connected, waiting for port ${TUNNEL_AGENT_HOST_PORT}...`);
      await withTimeout(() => relayClient.waitForForwardedPort(TUNNEL_AGENT_HOST_PORT), TUNNEL_STEP_TIMEOUT_MS, `wait for forwarded port ${TUNNEL_AGENT_HOST_PORT}`);
      portStream = await withTimeout(() => relayClient.connectToForwardedPort(TUNNEL_AGENT_HOST_PORT), TUNNEL_STEP_TIMEOUT_MS, `connect to forwarded port ${TUNNEL_AGENT_HOST_PORT}`);
      this._logService.info(`${LOG_PREFIX} Connected to forwarded port ${TUNNEL_AGENT_HOST_PORT}`);
    } catch (err) {
      try {
        relayClient.dispose();
      } catch {
      }
      throw err;
    }
    const connectionToken = deriveConnectionToken(tunnelId);
    const tags = new TunnelTags(resolved.labels);
    const name = tags.name || resolved.name || tunnelId;
    let relay;
    try {
      relay = await withTimeout(
        () => this._createWebSocketRelay(portStream, connectionToken, connectionId),
        TUNNEL_STEP_TIMEOUT_MS,
        "WebSocket relay open"
      );
    } catch (err) {
      try {
        relayClient.dispose();
      } catch {
      }
      throw err;
    }
    const conn = new TunnelConnection(
      connectionId,
      address,
      name,
      connectionToken,
      relay,
      relayClient
    );
    const onConnClose = conn.onDidClose(() => {
      onConnClose.dispose();
      this._connections.delete(connectionId);
      this._onDidRelayClose.fire(connectionId);
    });
    this._connections.set(connectionId, conn);
    return {
      connectionId,
      address,
      name,
      connectionToken,
      // Legacy v5 tunnels have no gateway inventory, so `connect` always
      // reuses a single deterministic target with no picker involved.
      selected: { serverType: "unknown", instanceId: "", role: "primary", lifecycle: "external" }
    };
  }
  async prepareSelection(token, authProvider, tunnelId, clusterId) {
    const client = await this._createManagementClient(token, authProvider);
    const tunnel = { tunnelId, clusterId };
    const resolved = await client.getTunnel(tunnel, {
      includePorts: true,
      tokenScopes: ["connect"]
    });
    if (!resolved) {
      throw new Error(`${LOG_PREFIX} Tunnel ${tunnelId} not found`);
    }
    const tags = new TunnelTags(resolved.labels);
    if (tags.protocolVersion < TUNNEL_GATEWAY_MIN_PROTOCOL_VERSION) {
      return void 0;
    }
    this._logService.info(`${LOG_PREFIX} Preparing gateway selection for tunnel ${tunnelId} in cluster ${clusterId}...`);
    const { TunnelRelayTunnelClient } = await import("@microsoft/dev-tunnels-connections");
    const relayClient = new TunnelRelayTunnelClient(client);
    relayClient.acceptLocalConnectionsForForwardedPorts = false;
    if (resolved.endpoints) {
      relayClient.endpoints = resolved.endpoints;
    }
    let ws;
    try {
      await withTimeout(() => relayClient.connect(resolved), TUNNEL_STEP_TIMEOUT_MS, "tunnel relay connect");
      await withTimeout(() => relayClient.waitForForwardedPort(TUNNEL_AGENT_HOST_PORT), TUNNEL_STEP_TIMEOUT_MS, `wait for forwarded port ${TUNNEL_AGENT_HOST_PORT}`);
      const portStream = await withTimeout(() => relayClient.connectToForwardedPort(TUNNEL_AGENT_HOST_PORT), TUNNEL_STEP_TIMEOUT_MS, `connect to forwarded port ${TUNNEL_AGENT_HOST_PORT}`);
      ws = await withTimeout(() => this._openGatewaySelectSocket(portStream), TUNNEL_STEP_TIMEOUT_MS, "gateway selection WebSocket open");
    } catch (err) {
      try {
        relayClient.dispose();
      } catch {
      }
      throw err;
    }
    let inventoryText;
    try {
      inventoryText = await withTimeout(() => this._readNextGatewayMessage(ws), TUNNEL_STEP_TIMEOUT_MS, "gateway inventory message");
    } catch (err) {
      try {
        ws.close();
      } catch {
      }
      try {
        relayClient.dispose();
      } catch {
      }
      throw err;
    }
    const inventory = parseTunnelGatewayInventory(inventoryText);
    const connectionToken = deriveConnectionToken(tunnelId);
    const name = tags.name || resolved.name || tunnelId;
    const address = `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`;
    const selectionId = generateUuid();
    this._pendingSelections.set(selectionId, new PendingGatewaySelection(
      address,
      name,
      connectionToken,
      ws,
      relayClient,
      () => {
        this._logService.warn(`${LOG_PREFIX} Gateway selection WebSocket for ${selectionId} closed before a selection was made`);
        this._pendingSelections.deleteAndDispose(selectionId);
      }
    ));
    return { selectionId, inventory };
  }
  async completeSelection(selectionId, selection) {
    const pending = this._pendingSelections.deleteAndLeak(selectionId);
    if (!pending) {
      throw new Error(`${LOG_PREFIX} No pending gateway selection with id ${selectionId}`);
    }
    pending.detach();
    const { ws, relayClient, address, name, connectionToken } = pending;
    let responseText;
    try {
      ws.send(JSON.stringify(selection));
      responseText = await withTimeout(() => this._readNextGatewayMessage(ws), TUNNEL_STEP_TIMEOUT_MS, "gateway selection acknowledgement");
    } catch (err) {
      try {
        ws.close();
      } catch {
      }
      try {
        relayClient.dispose();
      } catch {
      }
      throw err;
    }
    const response = parseTunnelGatewaySelectionResponse(responseText);
    if (!response.ok) {
      try {
        ws.close();
      } catch {
      }
      try {
        relayClient.dispose();
      } catch {
      }
      throw createTunnelGatewaySelectionRejectedError(`${LOG_PREFIX} ${response.error}`);
    }
    const connectionId = generateUuid();
    const relay = this._attachRelaySteadyStateHandlers(ws, connectionId);
    const conn = new TunnelConnection(connectionId, address, name, connectionToken, relay, relayClient);
    const onConnClose = conn.onDidClose(() => {
      onConnClose.dispose();
      this._connections.delete(connectionId);
      this._onDidRelayClose.fire(connectionId);
    });
    this._connections.set(connectionId, conn);
    this._logService.info(`${LOG_PREFIX} Gateway selection ${selectionId} completed: selected ${response.selected.serverType} ${response.selected.instanceId}`);
    return { connectionId, address, name, connectionToken, selected: response.selected };
  }
  async cancelSelection(selectionId) {
    this._pendingSelections.deleteAndDispose(selectionId);
  }
  async relaySend(connectionId, message) {
    const conn = this._connections.get(connectionId);
    if (conn) {
      conn.relaySend(message);
    }
  }
  async disconnect(connectionId) {
    const conn = this._connections.get(connectionId);
    if (conn) {
      conn.dispose();
    }
  }
  async _createManagementClient(token, authProvider) {
    const mgmt = await import("@microsoft/dev-tunnels-management");
    const authHeader = authProvider === "github" ? `github ${token}` : `Bearer ${token}`;
    return new mgmt.TunnelManagementHttpClient(
      "vscode-sessions",
      mgmt.ManagementApiVersions.Version20230927preview,
      async () => authHeader
    );
  }
  _closeTunnelConnections(tunnelId, operation) {
    const address = `${TUNNEL_ADDRESS_PREFIX}${tunnelId}`;
    for (const [connectionId, connection] of this._connections) {
      if (connection.address === address) {
        this._logService.info(`${LOG_PREFIX} Closing existing relay for tunnel ${tunnelId} before ${operation}`);
        this._connections.delete(connectionId);
        connection.dispose();
      }
    }
  }
  _parseTunnelInfo(tunnel) {
    const labels = tunnel.labels ?? [];
    const tags = new TunnelTags(labels);
    if (tags.protocolVersion < TUNNEL_MIN_PROTOCOL_VERSION) {
      return void 0;
    }
    const tunnelId = tunnel.tunnelId;
    const clusterId = tunnel.clusterId;
    if (!tunnelId || !clusterId) {
      return void 0;
    }
    const name = tags.name || tunnel.name || tunnelId;
    const rawCount = tunnel.status?.hostConnectionCount;
    const hostConnectionCount = typeof rawCount === "number" ? rawCount : rawCount?.current ?? 0;
    return {
      tunnelId,
      clusterId,
      name,
      tags: labels,
      protocolVersion: tags.protocolVersion,
      hostConnectionCount
    };
  }
  async _createWebSocketRelay(portStream, connectionToken, connectionId) {
    const WS = await import("ws");
    return new Promise((resolve, reject) => {
      let url = `ws://localhost:${TUNNEL_AGENT_HOST_PORT}`;
      if (connectionToken) {
        url += `?tkn=${encodeURIComponent(connectionToken)}`;
      }
      const ws = new WS.WebSocket(url, {
        createConnection: (() => portStream)
      });
      ws.on("open", () => {
        this._logService.info(`${LOG_PREFIX} WebSocket relay connected to agent host via tunnel`);
        resolve(this._attachRelaySteadyStateHandlers(ws, connectionId));
      });
      ws.on("error", (wsErr) => {
        this._logService.warn(`${LOG_PREFIX} WebSocket relay error: ${wsErr instanceof Error ? wsErr.message : String(wsErr)}`);
        reject(wsErr);
      });
    });
  }
  /**
   * Attach the steady-state message-pump handlers ('message'/'close') to an
   * already-open agent host WebSocket, shared between the legacy
   * direct-reuse relay and the protocol-v6 gateway relay (which reuses the
   * same WebSocket used for inventory/selection once a selection succeeds).
   */
  _attachRelaySteadyStateHandlers(ws, connectionId) {
    ws.on("message", (data) => {
      this._onDidRelayMessage.fire({ connectionId, data: rawGatewayDataToString(data) });
    });
    ws.on("close", (code, reason) => {
      this._logService.info(`${LOG_PREFIX} WebSocket relay closed for connection ${connectionId}; code=${code}, reason=${reason?.toString() || "(empty)"}`);
      const conn = this._connections.get(connectionId);
      if (conn) {
        conn.dispose();
      }
    });
    return {
      send: (data) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(data);
        }
      },
      close: () => ws.close()
    };
  }
  /**
   * Open the protocol-v6 gateway's selection WebSocket route over an
   * already-connected tunnel port stream. No `?tkn=` query parameter is
   * needed: connections arriving through the tunnel relay bypass the
   * gateway's loopback per-request token check entirely (only used for
   * the local, non-tunneled accept loop on the CLI side).
   */
  async _openGatewaySelectSocket(portStream) {
    const WS = await import("ws");
    return new Promise((resolve, reject) => {
      const url = `ws://localhost:${TUNNEL_AGENT_HOST_PORT}${TUNNEL_GATEWAY_SELECT_PATH}`;
      const ws = new WS.WebSocket(url, {
        createConnection: (() => portStream)
      });
      const onError = (wsErr) => reject(wsErr);
      ws.once("open", () => {
        ws.off("error", onError);
        resolve(ws);
      });
      ws.once("error", onError);
    });
  }
  /**
   * Await exactly one message on a gateway WebSocket — used to read the
   * one-time inventory message and, later, the one-time selection
   * acknowledgement, both of which precede the raw AHP frame-proxying
   * phase that reuses the same socket.
   */
  _readNextGatewayMessage(ws) {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        ws.off("message", onMessage);
        ws.off("close", onClose);
        ws.off("error", onError);
      };
      const onMessage = (data) => {
        cleanup();
        resolve(rawGatewayDataToString(data));
      };
      const onClose = (code, reason) => {
        cleanup();
        reject(new Error(`${LOG_PREFIX} Gateway WebSocket closed before expected message; code=${code}, reason=${reason?.toString() || "(empty)"}`));
      };
      const onError = (wsErr) => {
        cleanup();
        reject(wsErr);
      };
      ws.once("message", onMessage);
      ws.once("close", onClose);
      ws.once("error", onError);
    });
  }
};
TunnelAgentHostMainService = __decorateClass([
  __decorateParam(0, ILogService)
], TunnelAgentHostMainService);
function setPendingGatewaySelectionForTests(service, selectionId, pending) {
  service._pendingSelections.set(selectionId, pending);
}
function deletePendingGatewaySelectionForTests(service, selectionId) {
  service._pendingSelections.deleteAndDispose(selectionId);
}
export {
  PendingGatewaySelection,
  TUNNEL_STEP_TIMEOUT_MS,
  TunnelAgentHostMainService,
  deletePendingGatewaySelectionForTests,
  setPendingGatewaySelectionForTests,
  withTimeout
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFx0dW5uZWxBZ2VudEhvc3RTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBUdW5uZWwgfSBmcm9tICdAbWljcm9zb2Z0L2Rldi10dW5uZWxzLWNvbnRyYWN0cyc7XG5pbXBvcnQgdHlwZSB7IFR1bm5lbE1hbmFnZW1lbnRIdHRwQ2xpZW50IH0gZnJvbSAnQG1pY3Jvc29mdC9kZXYtdHVubmVscy1tYW5hZ2VtZW50JztcbmltcG9ydCB7IGNyZWF0ZUhhc2ggfSBmcm9tICdjcnlwdG8nO1xuaW1wb3J0IHR5cGUgV2ViU29ja2V0IGZyb20gJ3dzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgcmFjZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHtcblx0Y3JlYXRlVHVubmVsR2F0ZXdheVNlbGVjdGlvblJlamVjdGVkRXJyb3IsXG5cdElUdW5uZWxBZ2VudEhvc3RNYWluU2VydmljZSxcblx0cGFyc2VUdW5uZWxHYXRld2F5SW52ZW50b3J5LFxuXHRwYXJzZVR1bm5lbEdhdGV3YXlTZWxlY3Rpb25SZXNwb25zZSxcblx0VFVOTkVMX0FERFJFU1NfUFJFRklYLFxuXHRUVU5ORUxfQUdFTlRfSE9TVF9QT1JULFxuXHRUVU5ORUxfR0FURVdBWV9NSU5fUFJPVE9DT0xfVkVSU0lPTixcblx0VFVOTkVMX0dBVEVXQVlfU0VMRUNUX1BBVEgsXG5cdFRVTk5FTF9MQVVOQ0hFUl9MQUJFTCxcblx0VFVOTkVMX01JTl9QUk9UT0NPTF9WRVJTSU9OLFxuXHRUdW5uZWxUYWdzLFxuXHR0eXBlIElUdW5uZWxDb25uZWN0UmVzdWx0LFxuXHR0eXBlIElUdW5uZWxHYXRld2F5U2VsZWN0aW9uLFxuXHR0eXBlIElUdW5uZWxHYXRld2F5U2VsZWN0aW9uU2Vzc2lvbixcblx0dHlwZSBJVHVubmVsSW5mbyxcblx0dHlwZSBJVHVubmVsUmVsYXlNZXNzYWdlLFxufSBmcm9tICcuLi9jb21tb24vdHVubmVsQWdlbnRIb3N0LmpzJztcblxuY29uc3QgTE9HX1BSRUZJWCA9ICdbVHVubmVsQWdlbnRIb3N0XSc7XG5cbi8qKlxuICogUGVyLXN0ZXAgdGltZW91dCBmb3IgdGhlIGRldi10dW5uZWxzIFNESyBjYWxscyBpbnNpZGUge0BsaW5rIFR1bm5lbEFnZW50SG9zdE1haW5TZXJ2aWNlLmNvbm5lY3R9LlxuICpcbiAqIFdpdGhvdXQgdGhpcywgYSBzaWxlbnRseSBkcm9wcGVkIG5ldHdvcmsgKFRDUCBoYWxmLW9wZW4sIGhvc3QgZ29uZSBidXQgcmVsYXkgc3RpbGxcbiAqIGFjY2VwdGluZyBvdXIgbWVzc2FnZXMpIGNhbiBsZWF2ZSBgcmVsYXlDbGllbnQuY29ubmVjdCgpYCxcbiAqIGB3YWl0Rm9yRm9yd2FyZGVkUG9ydCgpYCwgYGNvbm5lY3RUb0ZvcndhcmRlZFBvcnQoKWAsIG9yIHRoZSBXZWJTb2NrZXQgYCdvcGVuJ2BcbiAqIGV2ZW50IHBlbmRpbmcgZm9yZXZlciBcdTIwMTQgd2hpY2ggaW4gdHVybiBoYW5ncyB0aGUgcmVuZGVyZXInc1xuICogYF90dW5uZWxTZXJ2aWNlLmNvbm5lY3QoLi4uKWAgYXdhaXQsIGxlYXZpbmcgdGhlIHBlci1ob3N0IGBfcGVuZGluZ0Nvbm5lY3RzYFxuICogZmxhZyBzZXQgYW5kIGVmZmVjdGl2ZWx5IGRpc2FibGluZyBhdXRvLXJlY29ubmVjdCBmb3IgdGhlIGxpZmV0aW1lIG9mIHRoZVxuICogc2hhcmVkIHByb2Nlc3MuXG4gKi9cbmV4cG9ydCBjb25zdCBUVU5ORUxfU1RFUF9USU1FT1VUX01TID0gMzBfMDAwO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2l0aFRpbWVvdXQ8VD4oXG5cdG9wOiAoKSA9PiBQcm9taXNlPFQ+LFxuXHR0aW1lb3V0TXM6IG51bWJlcixcblx0c3RlcE5hbWU6IHN0cmluZyxcbik6IFByb21pc2U8VD4ge1xuXHQvLyBVc2UgcmFjZVRpbWVvdXQgc28gdGhlIHRpbWVyIGlzIGNsZWFyZWQgaW4gYGZpbmFsbHlgIG9uY2UgYG9wYCBzZXR0bGVzXG5cdC8vIChhdm9pZHMgc3RyYXkgdGltZXJzIGFjcm9zcyBmcmVxdWVudCByZWNvbm5lY3QgYXR0ZW1wdHMpLiBUaGUgdm9pZC1yZXR1cm5cblx0Ly8gZGlzYW1iaWd1YXRpb24gaXMgaGFuZGxlZCBieSB0aGUgb25UaW1lb3V0IGNhbGxiYWNrIGZsYWcgYmVsb3cuXG5cdGxldCB0aW1lZE91dCA9IGZhbHNlO1xuXHRjb25zdCByZXN1bHQgPSBhd2FpdCByYWNlVGltZW91dChvcCgpLCB0aW1lb3V0TXMsICgpID0+IHsgdGltZWRPdXQgPSB0cnVlOyB9KTtcblx0aWYgKHRpbWVkT3V0KSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGAke0xPR19QUkVGSVh9ICR7c3RlcE5hbWV9IHRpbWVkIG91dCBhZnRlciAke3RpbWVvdXRNc31tc2ApO1xuXHR9XG5cdHJldHVybiByZXN1bHQgYXMgVDtcbn1cblxuLyoqXG4gKiBEZXJpdmUgYSBjb25uZWN0aW9uIHRva2VuIGZyb20gYSB0dW5uZWwgSUQgdXNpbmcgdGhlIHNhbWUgY29udmVudGlvblxuICogYXMgdGhlIFZTIENvZGUgQ0xJIChzZWUgYGdldF9jb25uZWN0aW9uX3Rva2VuYCBpbiBjbGkvc3JjL2NvbW1hbmRzL3R1bm5lbHMucnMpLlxuICovXG5mdW5jdGlvbiBkZXJpdmVDb25uZWN0aW9uVG9rZW4odHVubmVsSWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IGhhc2ggPSBjcmVhdGVIYXNoKCdzaGEyNTYnKTtcblx0aGFzaC51cGRhdGUodHVubmVsSWQpO1xuXHRsZXQgcmVzdWx0ID0gaGFzaC5kaWdlc3QoJ2Jhc2U2NHVybCcpO1xuXHRpZiAocmVzdWx0LnN0YXJ0c1dpdGgoJy0nKSkge1xuXHRcdHJlc3VsdCA9IGBhJHtyZXN1bHR9YDtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiByYXdHYXRld2F5RGF0YVRvU3RyaW5nKGRhdGE6IFdlYlNvY2tldC5SYXdEYXRhKTogc3RyaW5nIHtcblx0aWYgKEFycmF5LmlzQXJyYXkoZGF0YSkpIHtcblx0XHRyZXR1cm4gQnVmZmVyLmNvbmNhdChkYXRhKS50b1N0cmluZygpO1xuXHR9IGVsc2UgaWYgKGRhdGEgaW5zdGFuY2VvZiBBcnJheUJ1ZmZlcikge1xuXHRcdHJldHVybiBCdWZmZXIuZnJvbShuZXcgVWludDhBcnJheShkYXRhKSkudG9TdHJpbmcoKTtcblx0fVxuXHRyZXR1cm4gZGF0YS50b1N0cmluZygpO1xufVxuXG4vKiogU3RhdGUgZm9yIGEgc2luZ2xlIGFjdGl2ZSB0dW5uZWwgcmVsYXkgY29ubmVjdGlvbi4gKi9cbmNsYXNzIFR1bm5lbENvbm5lY3Rpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbG9zZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENsb3NlID0gdGhpcy5fb25EaWRDbG9zZS5ldmVudDtcblxuXHRwcml2YXRlIF9jbG9zZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBjb25uZWN0aW9uSWQ6IHN0cmluZyxcblx0XHRyZWFkb25seSBhZGRyZXNzOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgbmFtZTogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IGNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3JlbGF5OiB7IHNlbmQ6IChkYXRhOiBzdHJpbmcpID0+IHZvaWQ7IGNsb3NlOiAoKSA9PiB2b2lkIH0sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVsYXlDbGllbnQ6IHsgZGlzcG9zZSgpOiB2b2lkIH0sXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY2xvc2VkKSB7XG5cdFx0XHR0aGlzLl9jbG9zZWQgPSB0cnVlO1xuXHRcdFx0dGhpcy5fcmVsYXkuY2xvc2UoKTtcblx0XHRcdHRoaXMuX3JlbGF5Q2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2xvc2UuZmlyZSgpO1xuXHRcdH1cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRyZWxheVNlbmQoZGF0YTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVsYXkuc2VuZChkYXRhKTtcblx0fVxufVxuXG4vKipcbiAqIEEgcHJvdG9jb2wtdjYgZ2F0ZXdheSBzZWxlY3Rpb24gdGhhdCBoYXMgYmVlbiBwcmVwYXJlZCAocmVsYXkgY29ubmVjdGVkLFxuICogc2VsZWN0aW9uIFdlYlNvY2tldCBvcGVuLCBpbnZlbnRvcnkgcmVjZWl2ZWQpIGJ1dCBub3QgeWV0IGNvbXBsZXRlZC4gT3duc1xuICogdGhlIGdhdGV3YXkgV2ViU29ja2V0IGFuZCByZWxheSBjbGllbnQgdW50aWwgZWl0aGVyXG4gKiB7QGxpbmsgVHVubmVsQWdlbnRIb3N0TWFpblNlcnZpY2UuY29tcGxldGVTZWxlY3Rpb259IHRha2VzIG92ZXIgb3duZXJzaGlwXG4gKiB2aWEge0BsaW5rIGRldGFjaH0sIG9yIHRoaXMgaXMgZGlzcG9zZWQgKGNhbmNlbGxhdGlvbiwgb3IgdGhlIHNvY2tldFxuICogY2xvc2luZyB1bmV4cGVjdGVkbHkgYmVmb3JlIGEgc2VsZWN0aW9uIHdhcyBtYWRlKS5cbiAqL1xuZXhwb3J0IGNsYXNzIFBlbmRpbmdHYXRld2F5U2VsZWN0aW9uIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXHRwcml2YXRlIF9kaXNwb3NlZCA9IGZhbHNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblNvY2tldENsb3NlZCA9ICgpID0+IHtcblx0XHRpZiAoIXRoaXMuX2Rpc3Bvc2VkKSB7XG5cdFx0XHR0aGlzLl9vblVuZXhwZWN0ZWRDbG9zZSgpO1xuXHRcdH1cblx0fTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBhZGRyZXNzOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgbmFtZTogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IGNvbm5lY3Rpb25Ub2tlbjogc3RyaW5nLFxuXHRcdHJlYWRvbmx5IHdzOiBXZWJTb2NrZXQsXG5cdFx0cmVhZG9ubHkgcmVsYXlDbGllbnQ6IHsgZGlzcG9zZSgpOiB2b2lkIH0sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb25VbmV4cGVjdGVkQ2xvc2U6ICgpID0+IHZvaWQsXG5cdCkge1xuXHRcdHRoaXMud3Mub25jZSgnY2xvc2UnLCB0aGlzLl9vblNvY2tldENsb3NlZCk7XG5cdH1cblxuXHQvKiogRGV0YWNoIHRoZSBhdXRvLWNsZWFudXAgbGlzdGVuZXIgc28gb3duZXJzaGlwIG9mIHRoZSBzb2NrZXQgY2FuIHRyYW5zZmVyIHRvIGEgbGl2ZSB7QGxpbmsgVHVubmVsQ29ubmVjdGlvbn0uICovXG5cdGRldGFjaCgpOiB2b2lkIHtcblx0XHR0aGlzLndzLm9mZignY2xvc2UnLCB0aGlzLl9vblNvY2tldENsb3NlZCk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZGlzcG9zZWQpIHtcblx0XHRcdHRoaXMuX2Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdHRoaXMud3Mub2ZmKCdjbG9zZScsIHRoaXMuX29uU29ja2V0Q2xvc2VkKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMud3MuY2xvc2UoKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBpZ25vcmUgXHUyMDE0IGJlc3QtZWZmb3J0IGNsZWFudXBcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMucmVsYXlDbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZSBcdTIwMTQgYmVzdC1lZmZvcnQgY2xlYW51cFxuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVHVubmVsQWdlbnRIb3N0TWFpblNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVR1bm5lbEFnZW50SG9zdE1haW5TZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZWxheU1lc3NhZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVHVubmVsUmVsYXlNZXNzYWdlPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZWxheU1lc3NhZ2U6IEV2ZW50PElUdW5uZWxSZWxheU1lc3NhZ2U+ID0gdGhpcy5fb25EaWRSZWxheU1lc3NhZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZWxheUNsb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZWxheUNsb3NlOiBFdmVudDxzdHJpbmc+ID0gdGhpcy5fb25EaWRSZWxheUNsb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3Rpb25zID0gbmV3IE1hcDxzdHJpbmcsIFR1bm5lbENvbm5lY3Rpb24+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdTZWxlY3Rpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBQZW5kaW5nR2F0ZXdheVNlbGVjdGlvbj4oKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0YXN5bmMgbGlzdFR1bm5lbHModG9rZW46IHN0cmluZywgYXV0aFByb3ZpZGVyOiAnZ2l0aHViJyB8ICdtaWNyb3NvZnQnLCBhZGRpdGlvbmFsVHVubmVsTmFtZXM/OiBzdHJpbmdbXSk6IFByb21pc2U8SVR1bm5lbEluZm9bXT4ge1xuXHRcdGNvbnN0IGNsaWVudCA9IGF3YWl0IHRoaXMuX2NyZWF0ZU1hbmFnZW1lbnRDbGllbnQodG9rZW4sIGF1dGhQcm92aWRlcik7XG5cdFx0Y29uc3QgcmVzdWx0czogSVR1bm5lbEluZm9bXSA9IFtdO1xuXHRcdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRcdHRyeSB7XG5cdFx0XHQvLyBFbnVtZXJhdGUgYWxsIHR1bm5lbHMgd2l0aCB0aGUgdnNjb2RlLXNlcnZlci1sYXVuY2hlciBsYWJlbFxuXHRcdFx0Y29uc3QgdHVubmVscyA9IGF3YWl0IGNsaWVudC5saXN0VHVubmVscyh1bmRlZmluZWQsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRsYWJlbHM6IFtUVU5ORUxfTEFVTkNIRVJfTEFCRUxdLFxuXHRcdFx0XHRyZXF1aXJlQWxsTGFiZWxzOiB0cnVlLFxuXHRcdFx0XHRpbmNsdWRlUG9ydHM6IHRydWUsXG5cdFx0XHRcdHRva2VuU2NvcGVzOiBbJ2Nvbm5lY3QnXSxcblx0XHRcdH0pO1xuXG5cdFx0XHRmb3IgKGNvbnN0IHR1bm5lbCBvZiB0dW5uZWxzKSB7XG5cdFx0XHRcdGNvbnN0IGluZm8gPSB0aGlzLl9wYXJzZVR1bm5lbEluZm8odHVubmVsKTtcblx0XHRcdFx0aWYgKGluZm8gJiYgaW5mby5wcm90b2NvbFZlcnNpb24gPj0gVFVOTkVMX01JTl9QUk9UT0NPTF9WRVJTSU9OKSB7XG5cdFx0XHRcdFx0cmVzdWx0cy5wdXNoKGluZm8pO1xuXHRcdFx0XHRcdHNlZW4uYWRkKGluZm8udHVubmVsSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGAke0xPR19QUkVGSVh9IEZhaWxlZCB0byBlbnVtZXJhdGUgdHVubmVsc2AsIGVycik7XG5cdFx0fVxuXG5cdFx0Ly8gTG9vayB1cCBhZGRpdGlvbmFsIHR1bm5lbHMgYnkgbmFtZVxuXHRcdGlmIChhZGRpdGlvbmFsVHVubmVsTmFtZXMpIHtcblx0XHRcdGZvciAoY29uc3QgdHVubmVsTmFtZSBvZiBhZGRpdGlvbmFsVHVubmVsTmFtZXMpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBbdHVubmVsXSA9IGF3YWl0IGNsaWVudC5saXN0VHVubmVscyh1bmRlZmluZWQsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRcdFx0bGFiZWxzOiBbdHVubmVsTmFtZSwgVFVOTkVMX0xBVU5DSEVSX0xBQkVMXSxcblx0XHRcdFx0XHRcdHJlcXVpcmVBbGxMYWJlbHM6IHRydWUsXG5cdFx0XHRcdFx0XHRpbmNsdWRlUG9ydHM6IHRydWUsXG5cdFx0XHRcdFx0XHR0b2tlblNjb3BlczogWydjb25uZWN0J10sXG5cdFx0XHRcdFx0XHRsaW1pdDogMSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRpZiAodHVubmVsKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBpbmZvID0gdGhpcy5fcGFyc2VUdW5uZWxJbmZvKHR1bm5lbCk7XG5cdFx0XHRcdFx0XHRpZiAoaW5mbyAmJiBpbmZvLnByb3RvY29sVmVyc2lvbiA+PSBUVU5ORUxfTUlOX1BST1RPQ09MX1ZFUlNJT04gJiYgIXNlZW4uaGFzKGluZm8udHVubmVsSWQpKSB7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdHMucHVzaChpbmZvKTtcblx0XHRcdFx0XHRcdFx0c2Vlbi5hZGQoaW5mby50dW5uZWxJZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYCR7TE9HX1BSRUZJWH0gRmFpbGVkIHRvIGxvb2sgdXAgdHVubmVsICcke3R1bm5lbE5hbWV9J2AsIGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gRm91bmQgJHtyZXN1bHRzLmxlbmd0aH0gdHVubmVsKHMpIHdpdGggYWdlbnQgaG9zdCBzdXBwb3J0YCk7XG5cdFx0cmV0dXJuIHJlc3VsdHM7XG5cdH1cblxuXHRhc3luYyBkZWxldGVUdW5uZWwodG9rZW46IHN0cmluZywgYXV0aFByb3ZpZGVyOiAnZ2l0aHViJyB8ICdtaWNyb3NvZnQnLCB0dW5uZWxJZDogc3RyaW5nLCBjbHVzdGVySWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNsaWVudCA9IGF3YWl0IHRoaXMuX2NyZWF0ZU1hbmFnZW1lbnRDbGllbnQodG9rZW4sIGF1dGhQcm92aWRlcik7XG5cdFx0Y29uc3QgdHVubmVsOiBUdW5uZWwgPSB7IHR1bm5lbElkLCBjbHVzdGVySWQgfTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gRGVsZXRpbmcgdHVubmVsICR7dHVubmVsSWR9IGluIGNsdXN0ZXIgJHtjbHVzdGVySWR9Li4uYCk7XG5cdFx0YXdhaXQgY2xpZW50LmRlbGV0ZVR1bm5lbCh0dW5uZWwpO1xuXG5cdFx0Ly8gVGVhciB0aGUgcmVsYXlzIGRvd24gb25seSBvbmNlIHRoZSB0dW5uZWwgaXMgYWN0dWFsbHkgZ29uZS4gQ2xvc2luZ1xuXHRcdC8vIHRoZW0gZmlyc3QgcmVwb3J0cyBhIGRpc2Nvbm5lY3Qgd2hpbGUgdGhlIHR1bm5lbCBpcyBzdGlsbCBjYWNoZWQsXG5cdFx0Ly8gd2hpY2ggbGV0cyBhbiBhdXRvLXJlY29ubmVjdCBiZSBzY2hlZHVsZWQgYWdhaW5zdCBhIHR1bm5lbCB0aGF0IGlzXG5cdFx0Ly8gbWlkd2F5IHRocm91Z2ggYmVpbmcgZGVsZXRlZCBcdTIwMTQgYW5kIG5lZWRsZXNzbHkgZHJvcHMgYSBsaXZlXG5cdFx0Ly8gY29ubmVjdGlvbiBpZiB0aGUgZGVsZXRlIHRoZW4gZmFpbHMuXG5cdFx0dGhpcy5fY2xvc2VUdW5uZWxDb25uZWN0aW9ucyh0dW5uZWxJZCwgJ2RlbGV0aW5nJyk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IERlbGV0ZWQgdHVubmVsICR7dHVubmVsSWR9YCk7XG5cdH1cblxuXHRhc3luYyBjb25uZWN0KHRva2VuOiBzdHJpbmcsIGF1dGhQcm92aWRlcjogJ2dpdGh1YicgfCAnbWljcm9zb2Z0JywgdHVubmVsSWQ6IHN0cmluZywgY2x1c3RlcklkOiBzdHJpbmcpOiBQcm9taXNlPElUdW5uZWxDb25uZWN0UmVzdWx0PiB7XG5cdFx0dGhpcy5fY2xvc2VUdW5uZWxDb25uZWN0aW9ucyh0dW5uZWxJZCwgJ3JlY29ubmVjdGluZycpO1xuXG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgdGhpcy5fY3JlYXRlTWFuYWdlbWVudENsaWVudCh0b2tlbiwgYXV0aFByb3ZpZGVyKTtcblx0XHRjb25zdCBjb25uZWN0aW9uSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBhZGRyZXNzID0gYCR7VFVOTkVMX0FERFJFU1NfUFJFRklYfSR7dHVubmVsSWR9YDtcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBDb25uZWN0aW5nIHRvIHR1bm5lbCAke3R1bm5lbElkfSBpbiBjbHVzdGVyICR7Y2x1c3RlcklkfS4uLmApO1xuXG5cdFx0Ly8gR2V0IHRoZSBmdWxsIHR1bm5lbCB3aXRoIGVuZHBvaW50cyBhbmQgYWNjZXNzIHRva2Vuc1xuXHRcdGNvbnN0IHR1bm5lbDogVHVubmVsID0geyB0dW5uZWxJZCwgY2x1c3RlcklkIH07XG5cdFx0Y29uc3QgcmVzb2x2ZWQgPSBhd2FpdCBjbGllbnQuZ2V0VHVubmVsKHR1bm5lbCwge1xuXHRcdFx0aW5jbHVkZVBvcnRzOiB0cnVlLFxuXHRcdFx0dG9rZW5TY29wZXM6IFsnY29ubmVjdCddLFxuXHRcdH0pO1xuXG5cdFx0aWYgKCFyZXNvbHZlZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGAke0xPR19QUkVGSVh9IFR1bm5lbCAke3R1bm5lbElkfSBub3QgZm91bmRgKTtcblx0XHR9XG5cblx0XHQvLyBDb25uZWN0IHRvIHRoZSB0dW5uZWwgcmVsYXlcblx0XHRjb25zdCB7IFR1bm5lbFJlbGF5VHVubmVsQ2xpZW50IH0gPSBhd2FpdCBpbXBvcnQoJ0BtaWNyb3NvZnQvZGV2LXR1bm5lbHMtY29ubmVjdGlvbnMnKTtcblx0XHRjb25zdCByZWxheUNsaWVudCA9IG5ldyBUdW5uZWxSZWxheVR1bm5lbENsaWVudChjbGllbnQpO1xuXHRcdHJlbGF5Q2xpZW50LmFjY2VwdExvY2FsQ29ubmVjdGlvbnNGb3JGb3J3YXJkZWRQb3J0cyA9IGZhbHNlO1xuXHRcdGlmIChyZXNvbHZlZC5lbmRwb2ludHMpIHtcblx0XHRcdHJlbGF5Q2xpZW50LmVuZHBvaW50cyA9IHJlc29sdmVkLmVuZHBvaW50cztcblx0XHR9XG5cblx0XHQvLyBCb3VuZCBlYWNoIFNESyBzdGVwLiBBIHNpbGVudGx5IGRlYWQgbmV0d29yayBjYW4gbGVhdmUgYW55IG9mIHRoZXNlXG5cdFx0Ly8gcGVuZGluZyBmb3JldmVyLCB3aGljaCB3b3VsZCBoYW5nIHRoZSByZW5kZXJlcidzXG5cdFx0Ly8gYF90dW5uZWxTZXJ2aWNlLmNvbm5lY3QoLi4uKWAgYXdhaXQgYW5kIHByZXZlbnQgYXV0by1yZWNvbm5lY3QgZnJvbVxuXHRcdC8vIHJlLWFybWluZyB1bnRpbCB0aGUgYXBwIGlzIHJlc3RhcnRlZC5cblx0XHRsZXQgcG9ydFN0cmVhbTogTm9kZUpTLlJlYWRXcml0ZVN0cmVhbTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgd2l0aFRpbWVvdXQoKCkgPT4gcmVsYXlDbGllbnQuY29ubmVjdChyZXNvbHZlZCksIFRVTk5FTF9TVEVQX1RJTUVPVVRfTVMsICd0dW5uZWwgcmVsYXkgY29ubmVjdCcpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFR1bm5lbCByZWxheSBjb25uZWN0ZWQsIHdhaXRpbmcgZm9yIHBvcnQgJHtUVU5ORUxfQUdFTlRfSE9TVF9QT1JUfS4uLmApO1xuXG5cdFx0XHQvLyBXYWl0IGZvciB0aGUgYWdlbnQgaG9zdCBwb3J0IHRvIGJlY29tZSBhdmFpbGFibGVcblx0XHRcdGF3YWl0IHdpdGhUaW1lb3V0KCgpID0+IHJlbGF5Q2xpZW50LndhaXRGb3JGb3J3YXJkZWRQb3J0KFRVTk5FTF9BR0VOVF9IT1NUX1BPUlQpLCBUVU5ORUxfU1RFUF9USU1FT1VUX01TLCBgd2FpdCBmb3IgZm9yd2FyZGVkIHBvcnQgJHtUVU5ORUxfQUdFTlRfSE9TVF9QT1JUfWApO1xuXG5cdFx0XHQvLyBDb25uZWN0IHRvIHRoZSBmb3J3YXJkZWQgcG9ydCBcdTIwMTQgcmV0dXJucyBhIER1cGxleCBzdHJlYW1cblx0XHRcdHBvcnRTdHJlYW0gPSBhd2FpdCB3aXRoVGltZW91dCgoKSA9PiByZWxheUNsaWVudC5jb25uZWN0VG9Gb3J3YXJkZWRQb3J0KFRVTk5FTF9BR0VOVF9IT1NUX1BPUlQpLCBUVU5ORUxfU1RFUF9USU1FT1VUX01TLCBgY29ubmVjdCB0byBmb3J3YXJkZWQgcG9ydCAke1RVTk5FTF9BR0VOVF9IT1NUX1BPUlR9YCk7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gQ29ubmVjdGVkIHRvIGZvcndhcmRlZCBwb3J0ICR7VFVOTkVMX0FHRU5UX0hPU1RfUE9SVH1gKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdC8vIENsZWFuIHVwIHRoZSBkZXYtdHVubmVscyByZWxheSBjbGllbnQgc28gd2UgZG9uJ3QgbGVhayBhblxuXHRcdFx0Ly8gb3JwaGFuIGNsaWVudCB3aGVuIHRoZSBTREsgY2FsbCBoYW5ncyBvciBmYWlscy5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJlbGF5Q2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBpZ25vcmUgXHUyMDE0IGJlc3QtZWZmb3J0IGNsZWFudXBcblx0XHRcdH1cblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cblx0XHQvLyBEZXJpdmUgY29ubmVjdGlvbiB0b2tlbiBmcm9tIHR1bm5lbCBJRCAobWF0Y2hlcyBDTEkgY29udmVudGlvbilcblx0XHRjb25zdCBjb25uZWN0aW9uVG9rZW4gPSBkZXJpdmVDb25uZWN0aW9uVG9rZW4odHVubmVsSWQpO1xuXG5cdFx0Ly8gUGFyc2UgZGlzcGxheSBuYW1lIGZyb20gdGFnc1xuXHRcdGNvbnN0IHRhZ3MgPSBuZXcgVHVubmVsVGFncyhyZXNvbHZlZC5sYWJlbHMpO1xuXHRcdGNvbnN0IG5hbWUgPSB0YWdzLm5hbWUgfHwgcmVzb2x2ZWQubmFtZSB8fCB0dW5uZWxJZDtcblxuXHRcdC8vIENyZWF0ZSBXZWJTb2NrZXQgb3ZlciB0aGUgcG9ydCBzdHJlYW1cblx0XHRsZXQgcmVsYXk6IHsgc2VuZDogKGRhdGE6IHN0cmluZykgPT4gdm9pZDsgY2xvc2U6ICgpID0+IHZvaWQgfTtcblx0XHR0cnkge1xuXHRcdFx0cmVsYXkgPSBhd2FpdCB3aXRoVGltZW91dChcblx0XHRcdFx0KCkgPT4gdGhpcy5fY3JlYXRlV2ViU29ja2V0UmVsYXkocG9ydFN0cmVhbSwgY29ubmVjdGlvblRva2VuLCBjb25uZWN0aW9uSWQpLFxuXHRcdFx0XHRUVU5ORUxfU1RFUF9USU1FT1VUX01TLFxuXHRcdFx0XHQnV2ViU29ja2V0IHJlbGF5IG9wZW4nLFxuXHRcdFx0KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJlbGF5Q2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBpZ25vcmVcblx0XHRcdH1cblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cblx0XHRjb25zdCBjb25uID0gbmV3IFR1bm5lbENvbm5lY3Rpb24oXG5cdFx0XHRjb25uZWN0aW9uSWQsXG5cdFx0XHRhZGRyZXNzLFxuXHRcdFx0bmFtZSxcblx0XHRcdGNvbm5lY3Rpb25Ub2tlbixcblx0XHRcdHJlbGF5LFxuXHRcdFx0cmVsYXlDbGllbnQsXG5cdFx0KTtcblxuXHRcdC8vIFNlbGYtZGlzcG9zaW5nOiBFbWl0dGVyLmRpc3Bvc2UoKSBjbGVhcnMgbGlzdGVuZXJzIHdpdGhvdXQgbWFya2luZ1xuXHRcdC8vIHByZXZpb3VzbHkgcmV0dXJuZWQgc3Vic2NyaXB0aW9uIGhhbmRsZXMgYXMgZGlzcG9zZWQsIHNvIHRoaXMgbXVzdFxuXHRcdC8vIGRpc3Bvc2UgaXRzIG93biBoYW5kbGUgb25jZSBpdCBmaXJlcyB0byBhdm9pZCB0cmlwcGluZyB0aGVcblx0XHQvLyBkaXNwb3NhYmxlIGxlYWsgdHJhY2tlciBpbiB0ZXN0cyB0aGF0IGV4ZXJjaXNlIGEgZnVsbCBjb25uZWN0aW9uLlxuXHRcdGNvbnN0IG9uQ29ubkNsb3NlID0gY29ubi5vbkRpZENsb3NlKCgpID0+IHtcblx0XHRcdG9uQ29ubkNsb3NlLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2Nvbm5lY3Rpb25zLmRlbGV0ZShjb25uZWN0aW9uSWQpO1xuXHRcdFx0dGhpcy5fb25EaWRSZWxheUNsb3NlLmZpcmUoY29ubmVjdGlvbklkKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX2Nvbm5lY3Rpb25zLnNldChjb25uZWN0aW9uSWQsIGNvbm4pO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb25uZWN0aW9uSWQsIGFkZHJlc3MsIG5hbWUsIGNvbm5lY3Rpb25Ub2tlbixcblx0XHRcdC8vIExlZ2FjeSB2NSB0dW5uZWxzIGhhdmUgbm8gZ2F0ZXdheSBpbnZlbnRvcnksIHNvIGBjb25uZWN0YCBhbHdheXNcblx0XHRcdC8vIHJldXNlcyBhIHNpbmdsZSBkZXRlcm1pbmlzdGljIHRhcmdldCB3aXRoIG5vIHBpY2tlciBpbnZvbHZlZC5cblx0XHRcdHNlbGVjdGVkOiB7IHNlcnZlclR5cGU6ICd1bmtub3duJywgaW5zdGFuY2VJZDogJycsIHJvbGU6ICdwcmltYXJ5JywgbGlmZWN5Y2xlOiAnZXh0ZXJuYWwnIH0sXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIHByZXBhcmVTZWxlY3Rpb24odG9rZW46IHN0cmluZywgYXV0aFByb3ZpZGVyOiAnZ2l0aHViJyB8ICdtaWNyb3NvZnQnLCB0dW5uZWxJZDogc3RyaW5nLCBjbHVzdGVySWQ6IHN0cmluZyk6IFByb21pc2U8SVR1bm5lbEdhdGV3YXlTZWxlY3Rpb25TZXNzaW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY2xpZW50ID0gYXdhaXQgdGhpcy5fY3JlYXRlTWFuYWdlbWVudENsaWVudCh0b2tlbiwgYXV0aFByb3ZpZGVyKTtcblx0XHRjb25zdCB0dW5uZWw6IFR1bm5lbCA9IHsgdHVubmVsSWQsIGNsdXN0ZXJJZCB9O1xuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgY2xpZW50LmdldFR1bm5lbCh0dW5uZWwsIHtcblx0XHRcdGluY2x1ZGVQb3J0czogdHJ1ZSxcblx0XHRcdHRva2VuU2NvcGVzOiBbJ2Nvbm5lY3QnXSxcblx0XHR9KTtcblx0XHRpZiAoIXJlc29sdmVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYCR7TE9HX1BSRUZJWH0gVHVubmVsICR7dHVubmVsSWR9IG5vdCBmb3VuZGApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhZ3MgPSBuZXcgVHVubmVsVGFncyhyZXNvbHZlZC5sYWJlbHMpO1xuXHRcdGlmICh0YWdzLnByb3RvY29sVmVyc2lvbiA8IFRVTk5FTF9HQVRFV0FZX01JTl9QUk9UT0NPTF9WRVJTSU9OKSB7XG5cdFx0XHQvLyBDYWxsZXIgbXVzdCBmYWxsIGJhY2sgdG8gdGhlIGxlZ2FjeSBgY29ubmVjdCgpYCwgd2hpY2hcblx0XHRcdC8vIHByZXNlcnZlcyB0aGUgdjUgZGlyZWN0LXJldXNlIGJlaGF2aW9yIHdpdGggbm8gcGlja2VyLlxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gUHJlcGFyaW5nIGdhdGV3YXkgc2VsZWN0aW9uIGZvciB0dW5uZWwgJHt0dW5uZWxJZH0gaW4gY2x1c3RlciAke2NsdXN0ZXJJZH0uLi5gKTtcblxuXHRcdGNvbnN0IHsgVHVubmVsUmVsYXlUdW5uZWxDbGllbnQgfSA9IGF3YWl0IGltcG9ydCgnQG1pY3Jvc29mdC9kZXYtdHVubmVscy1jb25uZWN0aW9ucycpO1xuXHRcdGNvbnN0IHJlbGF5Q2xpZW50ID0gbmV3IFR1bm5lbFJlbGF5VHVubmVsQ2xpZW50KGNsaWVudCk7XG5cdFx0cmVsYXlDbGllbnQuYWNjZXB0TG9jYWxDb25uZWN0aW9uc0ZvckZvcndhcmRlZFBvcnRzID0gZmFsc2U7XG5cdFx0aWYgKHJlc29sdmVkLmVuZHBvaW50cykge1xuXHRcdFx0cmVsYXlDbGllbnQuZW5kcG9pbnRzID0gcmVzb2x2ZWQuZW5kcG9pbnRzO1xuXHRcdH1cblxuXHRcdGxldCB3czogV2ViU29ja2V0O1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB3aXRoVGltZW91dCgoKSA9PiByZWxheUNsaWVudC5jb25uZWN0KHJlc29sdmVkKSwgVFVOTkVMX1NURVBfVElNRU9VVF9NUywgJ3R1bm5lbCByZWxheSBjb25uZWN0Jyk7XG5cdFx0XHRhd2FpdCB3aXRoVGltZW91dCgoKSA9PiByZWxheUNsaWVudC53YWl0Rm9yRm9yd2FyZGVkUG9ydChUVU5ORUxfQUdFTlRfSE9TVF9QT1JUKSwgVFVOTkVMX1NURVBfVElNRU9VVF9NUywgYHdhaXQgZm9yIGZvcndhcmRlZCBwb3J0ICR7VFVOTkVMX0FHRU5UX0hPU1RfUE9SVH1gKTtcblx0XHRcdGNvbnN0IHBvcnRTdHJlYW0gPSBhd2FpdCB3aXRoVGltZW91dCgoKSA9PiByZWxheUNsaWVudC5jb25uZWN0VG9Gb3J3YXJkZWRQb3J0KFRVTk5FTF9BR0VOVF9IT1NUX1BPUlQpLCBUVU5ORUxfU1RFUF9USU1FT1VUX01TLCBgY29ubmVjdCB0byBmb3J3YXJkZWQgcG9ydCAke1RVTk5FTF9BR0VOVF9IT1NUX1BPUlR9YCk7XG5cdFx0XHR3cyA9IGF3YWl0IHdpdGhUaW1lb3V0KCgpID0+IHRoaXMuX29wZW5HYXRld2F5U2VsZWN0U29ja2V0KHBvcnRTdHJlYW0pLCBUVU5ORUxfU1RFUF9USU1FT1VUX01TLCAnZ2F0ZXdheSBzZWxlY3Rpb24gV2ViU29ja2V0IG9wZW4nKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJlbGF5Q2xpZW50LmRpc3Bvc2UoKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBpZ25vcmUgXHUyMDE0IGJlc3QtZWZmb3J0IGNsZWFudXBcblx0XHRcdH1cblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cblx0XHRsZXQgaW52ZW50b3J5VGV4dDogc3RyaW5nO1xuXHRcdHRyeSB7XG5cdFx0XHRpbnZlbnRvcnlUZXh0ID0gYXdhaXQgd2l0aFRpbWVvdXQoKCkgPT4gdGhpcy5fcmVhZE5leHRHYXRld2F5TWVzc2FnZSh3cyksIFRVTk5FTF9TVEVQX1RJTUVPVVRfTVMsICdnYXRld2F5IGludmVudG9yeSBtZXNzYWdlJyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR3cy5jbG9zZSgpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZSBcdTIwMTQgYmVzdC1lZmZvcnQgY2xlYW51cFxuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmVsYXlDbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZSBcdTIwMTQgYmVzdC1lZmZvcnQgY2xlYW51cFxuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH1cblxuXHRcdGNvbnN0IGludmVudG9yeSA9IHBhcnNlVHVubmVsR2F0ZXdheUludmVudG9yeShpbnZlbnRvcnlUZXh0KTtcblx0XHRjb25zdCBjb25uZWN0aW9uVG9rZW4gPSBkZXJpdmVDb25uZWN0aW9uVG9rZW4odHVubmVsSWQpO1xuXHRcdGNvbnN0IG5hbWUgPSB0YWdzLm5hbWUgfHwgcmVzb2x2ZWQubmFtZSB8fCB0dW5uZWxJZDtcblx0XHRjb25zdCBhZGRyZXNzID0gYCR7VFVOTkVMX0FERFJFU1NfUFJFRklYfSR7dHVubmVsSWR9YDtcblx0XHRjb25zdCBzZWxlY3Rpb25JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXG5cdFx0dGhpcy5fcGVuZGluZ1NlbGVjdGlvbnMuc2V0KHNlbGVjdGlvbklkLCBuZXcgUGVuZGluZ0dhdGV3YXlTZWxlY3Rpb24oXG5cdFx0XHRhZGRyZXNzLCBuYW1lLCBjb25uZWN0aW9uVG9rZW4sIHdzLCByZWxheUNsaWVudCxcblx0XHRcdCgpID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGAke0xPR19QUkVGSVh9IEdhdGV3YXkgc2VsZWN0aW9uIFdlYlNvY2tldCBmb3IgJHtzZWxlY3Rpb25JZH0gY2xvc2VkIGJlZm9yZSBhIHNlbGVjdGlvbiB3YXMgbWFkZWApO1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nU2VsZWN0aW9ucy5kZWxldGVBbmREaXNwb3NlKHNlbGVjdGlvbklkKTtcblx0XHRcdH0sXG5cdFx0KSk7XG5cblx0XHRyZXR1cm4geyBzZWxlY3Rpb25JZCwgaW52ZW50b3J5IH07XG5cdH1cblxuXHRhc3luYyBjb21wbGV0ZVNlbGVjdGlvbihzZWxlY3Rpb25JZDogc3RyaW5nLCBzZWxlY3Rpb246IElUdW5uZWxHYXRld2F5U2VsZWN0aW9uKTogUHJvbWlzZTxJVHVubmVsQ29ubmVjdFJlc3VsdD4ge1xuXHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLl9wZW5kaW5nU2VsZWN0aW9ucy5kZWxldGVBbmRMZWFrKHNlbGVjdGlvbklkKTtcblx0XHRpZiAoIXBlbmRpbmcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgJHtMT0dfUFJFRklYfSBObyBwZW5kaW5nIGdhdGV3YXkgc2VsZWN0aW9uIHdpdGggaWQgJHtzZWxlY3Rpb25JZH1gKTtcblx0XHR9XG5cdFx0Ly8gT3duZXJzaGlwIG9mIHRoZSBXZWJTb2NrZXQvcmVsYXkgY2xpZW50IGhhcyB0cmFuc2ZlcnJlZCB0byB1czogc3RvcFxuXHRcdC8vIHRyZWF0aW5nIGFuIHVuZXhwZWN0ZWQgY2xvc2UgYXMgXCJjYW5jZWxsZWQgYmVmb3JlIHNlbGVjdGluZ1wiLlxuXHRcdHBlbmRpbmcuZGV0YWNoKCk7XG5cblx0XHRjb25zdCB7IHdzLCByZWxheUNsaWVudCwgYWRkcmVzcywgbmFtZSwgY29ubmVjdGlvblRva2VuIH0gPSBwZW5kaW5nO1xuXG5cdFx0bGV0IHJlc3BvbnNlVGV4dDogc3RyaW5nO1xuXHRcdHRyeSB7XG5cdFx0XHR3cy5zZW5kKEpTT04uc3RyaW5naWZ5KHNlbGVjdGlvbikpO1xuXHRcdFx0cmVzcG9uc2VUZXh0ID0gYXdhaXQgd2l0aFRpbWVvdXQoKCkgPT4gdGhpcy5fcmVhZE5leHRHYXRld2F5TWVzc2FnZSh3cyksIFRVTk5FTF9TVEVQX1RJTUVPVVRfTVMsICdnYXRld2F5IHNlbGVjdGlvbiBhY2tub3dsZWRnZW1lbnQnKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHdzLmNsb3NlKCk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gaWdub3JlIFx1MjAxNCBiZXN0LWVmZm9ydCBjbGVhbnVwXG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZWxheUNsaWVudC5kaXNwb3NlKCk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gaWdub3JlIFx1MjAxNCBiZXN0LWVmZm9ydCBjbGVhbnVwXG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBwYXJzZVR1bm5lbEdhdGV3YXlTZWxlY3Rpb25SZXNwb25zZShyZXNwb25zZVRleHQpO1xuXHRcdGlmICghcmVzcG9uc2Uub2spIHtcblx0XHRcdC8vIFRoZSBzZWxlY3RlZCBlbnRyeSBkaXNhcHBlYXJlZCwgb3IgdGhlIENMSSBvdGhlcndpc2UgcmVqZWN0ZWRcblx0XHRcdC8vIHRoZSBzZWxlY3Rpb24gKGUuZy4gaXRzIHNvY2tldCB3YXMgYWxyZWFkeSBnb25lKS4gQ2xvc2Vcblx0XHRcdC8vIGV2ZXJ5dGhpbmcgcmF0aGVyIHRoYW4gc2lsZW50bHkgc3Vic3RpdHV0aW5nIGFub3RoZXIgdGFyZ2V0IFx1MjAxNFxuXHRcdFx0Ly8gYnV0IHRhZyB0aGUgZXJyb3Igc28gdGhlIGNhbGxlciBjYW4gdGVsbCB0aGlzIGFwYXJ0IGZyb20gYW5cblx0XHRcdC8vIHVucmVhY2hhYmxlIHR1bm5lbCBhbmQgcGljayBhIGRpZmZlcmVudCBlbmRwb2ludCBpdHNlbGYuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHR3cy5jbG9zZSgpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZSBcdTIwMTQgYmVzdC1lZmZvcnQgY2xlYW51cFxuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmVsYXlDbGllbnQuZGlzcG9zZSgpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGlnbm9yZSBcdTIwMTQgYmVzdC1lZmZvcnQgY2xlYW51cFxuXHRcdFx0fVxuXHRcdFx0dGhyb3cgY3JlYXRlVHVubmVsR2F0ZXdheVNlbGVjdGlvblJlamVjdGVkRXJyb3IoYCR7TE9HX1BSRUZJWH0gJHtyZXNwb25zZS5lcnJvcn1gKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb25uZWN0aW9uSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCByZWxheSA9IHRoaXMuX2F0dGFjaFJlbGF5U3RlYWR5U3RhdGVIYW5kbGVycyh3cywgY29ubmVjdGlvbklkKTtcblx0XHRjb25zdCBjb25uID0gbmV3IFR1bm5lbENvbm5lY3Rpb24oY29ubmVjdGlvbklkLCBhZGRyZXNzLCBuYW1lLCBjb25uZWN0aW9uVG9rZW4sIHJlbGF5LCByZWxheUNsaWVudCk7XG5cblx0XHQvLyBTZWxmLWRpc3Bvc2luZzogc2VlIHRoZSBtYXRjaGluZyBjb21tZW50IGluIGNvbm5lY3QoKS5cblx0XHRjb25zdCBvbkNvbm5DbG9zZSA9IGNvbm4ub25EaWRDbG9zZSgoKSA9PiB7XG5cdFx0XHRvbkNvbm5DbG9zZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9jb25uZWN0aW9ucy5kZWxldGUoY29ubmVjdGlvbklkKTtcblx0XHRcdHRoaXMuX29uRGlkUmVsYXlDbG9zZS5maXJlKGNvbm5lY3Rpb25JZCk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9jb25uZWN0aW9ucy5zZXQoY29ubmVjdGlvbklkLCBjb25uKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYCR7TE9HX1BSRUZJWH0gR2F0ZXdheSBzZWxlY3Rpb24gJHtzZWxlY3Rpb25JZH0gY29tcGxldGVkOiBzZWxlY3RlZCAke3Jlc3BvbnNlLnNlbGVjdGVkLnNlcnZlclR5cGV9ICR7cmVzcG9uc2Uuc2VsZWN0ZWQuaW5zdGFuY2VJZH1gKTtcblxuXHRcdHJldHVybiB7IGNvbm5lY3Rpb25JZCwgYWRkcmVzcywgbmFtZSwgY29ubmVjdGlvblRva2VuLCBzZWxlY3RlZDogcmVzcG9uc2Uuc2VsZWN0ZWQgfTtcblx0fVxuXG5cdGFzeW5jIGNhbmNlbFNlbGVjdGlvbihzZWxlY3Rpb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fcGVuZGluZ1NlbGVjdGlvbnMuZGVsZXRlQW5kRGlzcG9zZShzZWxlY3Rpb25JZCk7XG5cdH1cblxuXHRhc3luYyByZWxheVNlbmQoY29ubmVjdGlvbklkOiBzdHJpbmcsIG1lc3NhZ2U6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbm4gPSB0aGlzLl9jb25uZWN0aW9ucy5nZXQoY29ubmVjdGlvbklkKTtcblx0XHRpZiAoY29ubikge1xuXHRcdFx0Y29ubi5yZWxheVNlbmQobWVzc2FnZSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZGlzY29ubmVjdChjb25uZWN0aW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNvbm4gPSB0aGlzLl9jb25uZWN0aW9ucy5nZXQoY29ubmVjdGlvbklkKTtcblx0XHRpZiAoY29ubikge1xuXHRcdFx0Y29ubi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlTWFuYWdlbWVudENsaWVudCh0b2tlbjogc3RyaW5nLCBhdXRoUHJvdmlkZXI6ICdnaXRodWInIHwgJ21pY3Jvc29mdCcpOiBQcm9taXNlPFR1bm5lbE1hbmFnZW1lbnRIdHRwQ2xpZW50PiB7XG5cdFx0Y29uc3QgbWdtdCA9IGF3YWl0IGltcG9ydCgnQG1pY3Jvc29mdC9kZXYtdHVubmVscy1tYW5hZ2VtZW50Jyk7XG5cdFx0Y29uc3QgYXV0aEhlYWRlciA9IGF1dGhQcm92aWRlciA9PT0gJ2dpdGh1YicgPyBgZ2l0aHViICR7dG9rZW59YCA6IGBCZWFyZXIgJHt0b2tlbn1gO1xuXG5cdFx0cmV0dXJuIG5ldyBtZ210LlR1bm5lbE1hbmFnZW1lbnRIdHRwQ2xpZW50KFxuXHRcdFx0J3ZzY29kZS1zZXNzaW9ucycsXG5cdFx0XHRtZ210Lk1hbmFnZW1lbnRBcGlWZXJzaW9ucy5WZXJzaW9uMjAyMzA5MjdwcmV2aWV3LFxuXHRcdFx0YXN5bmMgKCkgPT4gYXV0aEhlYWRlcixcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xvc2VUdW5uZWxDb25uZWN0aW9ucyh0dW5uZWxJZDogc3RyaW5nLCBvcGVyYXRpb246ICdkZWxldGluZycgfCAncmVjb25uZWN0aW5nJyk6IHZvaWQge1xuXHRcdGNvbnN0IGFkZHJlc3MgPSBgJHtUVU5ORUxfQUREUkVTU19QUkVGSVh9JHt0dW5uZWxJZH1gO1xuXHRcdGZvciAoY29uc3QgW2Nvbm5lY3Rpb25JZCwgY29ubmVjdGlvbl0gb2YgdGhpcy5fY29ubmVjdGlvbnMpIHtcblx0XHRcdGlmIChjb25uZWN0aW9uLmFkZHJlc3MgPT09IGFkZHJlc3MpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IENsb3NpbmcgZXhpc3RpbmcgcmVsYXkgZm9yIHR1bm5lbCAke3R1bm5lbElkfSBiZWZvcmUgJHtvcGVyYXRpb259YCk7XG5cdFx0XHRcdHRoaXMuX2Nvbm5lY3Rpb25zLmRlbGV0ZShjb25uZWN0aW9uSWQpO1xuXHRcdFx0XHRjb25uZWN0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9wYXJzZVR1bm5lbEluZm8odHVubmVsOiBUdW5uZWwpOiBJVHVubmVsSW5mbyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbGFiZWxzID0gdHVubmVsLmxhYmVscyA/PyBbXTtcblx0XHRjb25zdCB0YWdzID0gbmV3IFR1bm5lbFRhZ3MobGFiZWxzKTtcblxuXHRcdGlmICh0YWdzLnByb3RvY29sVmVyc2lvbiA8IFRVTk5FTF9NSU5fUFJPVE9DT0xfVkVSU0lPTikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCB0dW5uZWxJZCA9IHR1bm5lbC50dW5uZWxJZDtcblx0XHRjb25zdCBjbHVzdGVySWQgPSB0dW5uZWwuY2x1c3RlcklkO1xuXHRcdGlmICghdHVubmVsSWQgfHwgIWNsdXN0ZXJJZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBuYW1lID0gdGFncy5uYW1lIHx8IHR1bm5lbC5uYW1lIHx8IHR1bm5lbElkO1xuXHRcdGNvbnN0IHJhd0NvdW50ID0gdHVubmVsLnN0YXR1cz8uaG9zdENvbm5lY3Rpb25Db3VudDtcblx0XHRjb25zdCBob3N0Q29ubmVjdGlvbkNvdW50ID0gdHlwZW9mIHJhd0NvdW50ID09PSAnbnVtYmVyJyA/IHJhd0NvdW50IDogKHJhd0NvdW50Py5jdXJyZW50ID8/IDApO1xuXHRcdHJldHVybiB7XG5cdFx0XHR0dW5uZWxJZCxcblx0XHRcdGNsdXN0ZXJJZCxcblx0XHRcdG5hbWUsXG5cdFx0XHR0YWdzOiBsYWJlbHMsXG5cdFx0XHRwcm90b2NvbFZlcnNpb246IHRhZ3MucHJvdG9jb2xWZXJzaW9uLFxuXHRcdFx0aG9zdENvbm5lY3Rpb25Db3VudCxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlV2ViU29ja2V0UmVsYXkoXG5cdFx0cG9ydFN0cmVhbTogTm9kZUpTLlJlYWRXcml0ZVN0cmVhbSxcblx0XHRjb25uZWN0aW9uVG9rZW46IHN0cmluZyxcblx0XHRjb25uZWN0aW9uSWQ6IHN0cmluZyxcblx0KTogUHJvbWlzZTx7IHNlbmQ6IChkYXRhOiBzdHJpbmcpID0+IHZvaWQ7IGNsb3NlOiAoKSA9PiB2b2lkIH0+IHtcblx0XHRjb25zdCBXUyA9IGF3YWl0IGltcG9ydCgnd3MnKTtcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHQvLyBDb25zdHJ1Y3QgV2ViU29ja2V0IFVSTCBcdTIwMTQgdGhlIHN0cmVhbSBpcyBhbHJlYWR5IGNvbm5lY3RlZCB0byB0aGUgcmlnaHQgcG9ydFxuXHRcdFx0bGV0IHVybCA9IGB3czovL2xvY2FsaG9zdDoke1RVTk5FTF9BR0VOVF9IT1NUX1BPUlR9YDtcblx0XHRcdGlmIChjb25uZWN0aW9uVG9rZW4pIHtcblx0XHRcdFx0dXJsICs9IGA/dGtuPSR7ZW5jb2RlVVJJQ29tcG9uZW50KGNvbm5lY3Rpb25Ub2tlbil9YDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ3JlYXRlIFdlYlNvY2tldCBvdmVyIHRoZSBleGlzdGluZyBzdHJlYW0gZnJvbSB0aGUgdHVubmVsIHJlbGF5XG5cdFx0XHRjb25zdCB3cyA9IG5ldyBXUy5XZWJTb2NrZXQodXJsLCB7XG5cdFx0XHRcdGNyZWF0ZUNvbm5lY3Rpb246ICgoKSA9PiBwb3J0U3RyZWFtKSBhcyB1bmtub3duIGFzIFdlYlNvY2tldC5DbGllbnRPcHRpb25zWydjcmVhdGVDb25uZWN0aW9uJ10sXG5cdFx0XHR9KTtcblxuXHRcdFx0d3Mub24oJ29wZW4nLCAoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgJHtMT0dfUFJFRklYfSBXZWJTb2NrZXQgcmVsYXkgY29ubmVjdGVkIHRvIGFnZW50IGhvc3QgdmlhIHR1bm5lbGApO1xuXHRcdFx0XHRyZXNvbHZlKHRoaXMuX2F0dGFjaFJlbGF5U3RlYWR5U3RhdGVIYW5kbGVycyh3cywgY29ubmVjdGlvbklkKSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0d3Mub24oJ2Vycm9yJywgKHdzRXJyOiB1bmtub3duKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgJHtMT0dfUFJFRklYfSBXZWJTb2NrZXQgcmVsYXkgZXJyb3I6ICR7d3NFcnIgaW5zdGFuY2VvZiBFcnJvciA/IHdzRXJyLm1lc3NhZ2UgOiBTdHJpbmcod3NFcnIpfWApO1xuXHRcdFx0XHRyZWplY3Qod3NFcnIpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogQXR0YWNoIHRoZSBzdGVhZHktc3RhdGUgbWVzc2FnZS1wdW1wIGhhbmRsZXJzICgnbWVzc2FnZScvJ2Nsb3NlJykgdG8gYW5cblx0ICogYWxyZWFkeS1vcGVuIGFnZW50IGhvc3QgV2ViU29ja2V0LCBzaGFyZWQgYmV0d2VlbiB0aGUgbGVnYWN5XG5cdCAqIGRpcmVjdC1yZXVzZSByZWxheSBhbmQgdGhlIHByb3RvY29sLXY2IGdhdGV3YXkgcmVsYXkgKHdoaWNoIHJldXNlcyB0aGVcblx0ICogc2FtZSBXZWJTb2NrZXQgdXNlZCBmb3IgaW52ZW50b3J5L3NlbGVjdGlvbiBvbmNlIGEgc2VsZWN0aW9uIHN1Y2NlZWRzKS5cblx0ICovXG5cdHByaXZhdGUgX2F0dGFjaFJlbGF5U3RlYWR5U3RhdGVIYW5kbGVycyh3czogV2ViU29ja2V0LCBjb25uZWN0aW9uSWQ6IHN0cmluZyk6IHsgc2VuZDogKGRhdGE6IHN0cmluZykgPT4gdm9pZDsgY2xvc2U6ICgpID0+IHZvaWQgfSB7XG5cdFx0d3Mub24oJ21lc3NhZ2UnLCAoZGF0YTogV2ViU29ja2V0LlJhd0RhdGEpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkUmVsYXlNZXNzYWdlLmZpcmUoeyBjb25uZWN0aW9uSWQsIGRhdGE6IHJhd0dhdGV3YXlEYXRhVG9TdHJpbmcoZGF0YSkgfSk7XG5cdFx0fSk7XG5cblx0XHR3cy5vbignY2xvc2UnLCAoY29kZTogbnVtYmVyLCByZWFzb246IEJ1ZmZlcikgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGAke0xPR19QUkVGSVh9IFdlYlNvY2tldCByZWxheSBjbG9zZWQgZm9yIGNvbm5lY3Rpb24gJHtjb25uZWN0aW9uSWR9OyBjb2RlPSR7Y29kZX0sIHJlYXNvbj0ke3JlYXNvbj8udG9TdHJpbmcoKSB8fCAnKGVtcHR5KSd9YCk7XG5cdFx0XHRjb25zdCBjb25uID0gdGhpcy5fY29ubmVjdGlvbnMuZ2V0KGNvbm5lY3Rpb25JZCk7XG5cdFx0XHRpZiAoY29ubikge1xuXHRcdFx0XHRjb25uLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRzZW5kOiAoZGF0YTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGlmICh3cy5yZWFkeVN0YXRlID09PSB3cy5PUEVOKSB7XG5cdFx0XHRcdFx0d3Muc2VuZChkYXRhKTtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGNsb3NlOiAoKSA9PiB3cy5jbG9zZSgpLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogT3BlbiB0aGUgcHJvdG9jb2wtdjYgZ2F0ZXdheSdzIHNlbGVjdGlvbiBXZWJTb2NrZXQgcm91dGUgb3ZlciBhblxuXHQgKiBhbHJlYWR5LWNvbm5lY3RlZCB0dW5uZWwgcG9ydCBzdHJlYW0uIE5vIGA/dGtuPWAgcXVlcnkgcGFyYW1ldGVyIGlzXG5cdCAqIG5lZWRlZDogY29ubmVjdGlvbnMgYXJyaXZpbmcgdGhyb3VnaCB0aGUgdHVubmVsIHJlbGF5IGJ5cGFzcyB0aGVcblx0ICogZ2F0ZXdheSdzIGxvb3BiYWNrIHBlci1yZXF1ZXN0IHRva2VuIGNoZWNrIGVudGlyZWx5IChvbmx5IHVzZWQgZm9yXG5cdCAqIHRoZSBsb2NhbCwgbm9uLXR1bm5lbGVkIGFjY2VwdCBsb29wIG9uIHRoZSBDTEkgc2lkZSkuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9vcGVuR2F0ZXdheVNlbGVjdFNvY2tldChwb3J0U3RyZWFtOiBOb2RlSlMuUmVhZFdyaXRlU3RyZWFtKTogUHJvbWlzZTxXZWJTb2NrZXQ+IHtcblx0XHRjb25zdCBXUyA9IGF3YWl0IGltcG9ydCgnd3MnKTtcblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRjb25zdCB1cmwgPSBgd3M6Ly9sb2NhbGhvc3Q6JHtUVU5ORUxfQUdFTlRfSE9TVF9QT1JUfSR7VFVOTkVMX0dBVEVXQVlfU0VMRUNUX1BBVEh9YDtcblx0XHRcdGNvbnN0IHdzID0gbmV3IFdTLldlYlNvY2tldCh1cmwsIHtcblx0XHRcdFx0Y3JlYXRlQ29ubmVjdGlvbjogKCgpID0+IHBvcnRTdHJlYW0pIGFzIHVua25vd24gYXMgV2ViU29ja2V0LkNsaWVudE9wdGlvbnNbJ2NyZWF0ZUNvbm5lY3Rpb24nXSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBvbkVycm9yID0gKHdzRXJyOiB1bmtub3duKSA9PiByZWplY3Qod3NFcnIpO1xuXHRcdFx0d3Mub25jZSgnb3BlbicsICgpID0+IHtcblx0XHRcdFx0d3Mub2ZmKCdlcnJvcicsIG9uRXJyb3IpO1xuXHRcdFx0XHRyZXNvbHZlKHdzKTtcblx0XHRcdH0pO1xuXHRcdFx0d3Mub25jZSgnZXJyb3InLCBvbkVycm9yKTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBd2FpdCBleGFjdGx5IG9uZSBtZXNzYWdlIG9uIGEgZ2F0ZXdheSBXZWJTb2NrZXQgXHUyMDE0IHVzZWQgdG8gcmVhZCB0aGVcblx0ICogb25lLXRpbWUgaW52ZW50b3J5IG1lc3NhZ2UgYW5kLCBsYXRlciwgdGhlIG9uZS10aW1lIHNlbGVjdGlvblxuXHQgKiBhY2tub3dsZWRnZW1lbnQsIGJvdGggb2Ygd2hpY2ggcHJlY2VkZSB0aGUgcmF3IEFIUCBmcmFtZS1wcm94eWluZ1xuXHQgKiBwaGFzZSB0aGF0IHJldXNlcyB0aGUgc2FtZSBzb2NrZXQuXG5cdCAqL1xuXHRwcml2YXRlIF9yZWFkTmV4dEdhdGV3YXlNZXNzYWdlKHdzOiBXZWJTb2NrZXQpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRjb25zdCBjbGVhbnVwID0gKCkgPT4ge1xuXHRcdFx0XHR3cy5vZmYoJ21lc3NhZ2UnLCBvbk1lc3NhZ2UpO1xuXHRcdFx0XHR3cy5vZmYoJ2Nsb3NlJywgb25DbG9zZSk7XG5cdFx0XHRcdHdzLm9mZignZXJyb3InLCBvbkVycm9yKTtcblx0XHRcdH07XG5cdFx0XHRjb25zdCBvbk1lc3NhZ2UgPSAoZGF0YTogV2ViU29ja2V0LlJhd0RhdGEpID0+IHtcblx0XHRcdFx0Y2xlYW51cCgpO1xuXHRcdFx0XHRyZXNvbHZlKHJhd0dhdGV3YXlEYXRhVG9TdHJpbmcoZGF0YSkpO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IG9uQ2xvc2UgPSAoY29kZTogbnVtYmVyLCByZWFzb246IEJ1ZmZlcikgPT4ge1xuXHRcdFx0XHRjbGVhbnVwKCk7XG5cdFx0XHRcdHJlamVjdChuZXcgRXJyb3IoYCR7TE9HX1BSRUZJWH0gR2F0ZXdheSBXZWJTb2NrZXQgY2xvc2VkIGJlZm9yZSBleHBlY3RlZCBtZXNzYWdlOyBjb2RlPSR7Y29kZX0sIHJlYXNvbj0ke3JlYXNvbj8udG9TdHJpbmcoKSB8fCAnKGVtcHR5KSd9YCkpO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IG9uRXJyb3IgPSAod3NFcnI6IHVua25vd24pID0+IHtcblx0XHRcdFx0Y2xlYW51cCgpO1xuXHRcdFx0XHRyZWplY3Qod3NFcnIpO1xuXHRcdFx0fTtcblx0XHRcdHdzLm9uY2UoJ21lc3NhZ2UnLCBvbk1lc3NhZ2UpO1xuXHRcdFx0d3Mub25jZSgnY2xvc2UnLCBvbkNsb3NlKTtcblx0XHRcdHdzLm9uY2UoJ2Vycm9yJywgb25FcnJvcik7XG5cdFx0fSk7XG5cdH1cbn1cblxuLyoqXG4gKiBUZXN0LW9ubHkgc2VhbTogcmVnaXN0ZXIgYSBwZW5kaW5nIGdhdGV3YXkgc2VsZWN0aW9uIGRpcmVjdGx5LCBieXBhc3NpbmdcbiAqIHRoZSBkZXYtdHVubmVscyBTREsgY29ubmVjdGlvbiBzdGVwcyBpbiB7QGxpbmsgVHVubmVsQWdlbnRIb3N0TWFpblNlcnZpY2UucHJlcGFyZVNlbGVjdGlvbn0sXG4gKiBzbyB7QGxpbmsgVHVubmVsQWdlbnRIb3N0TWFpblNlcnZpY2UuY29tcGxldGVTZWxlY3Rpb259IGFuZCB7QGxpbmsgVHVubmVsQWdlbnRIb3N0TWFpblNlcnZpY2UuY2FuY2VsU2VsZWN0aW9ufVxuICogY2FuIGJlIHVuaXQgdGVzdGVkIGFnYWluc3QgZmFrZSBXZWJTb2NrZXQtbGlrZSBzdHJlYW1zLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0UGVuZGluZ0dhdGV3YXlTZWxlY3Rpb25Gb3JUZXN0cyhcblx0c2VydmljZTogVHVubmVsQWdlbnRIb3N0TWFpblNlcnZpY2UsXG5cdHNlbGVjdGlvbklkOiBzdHJpbmcsXG5cdHBlbmRpbmc6IFBlbmRpbmdHYXRld2F5U2VsZWN0aW9uLFxuKTogdm9pZCB7XG5cdChzZXJ2aWNlIGFzIHVua25vd24gYXMgeyBfcGVuZGluZ1NlbGVjdGlvbnM6IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBQZW5kaW5nR2F0ZXdheVNlbGVjdGlvbj4gfSkuX3BlbmRpbmdTZWxlY3Rpb25zLnNldChzZWxlY3Rpb25JZCwgcGVuZGluZyk7XG59XG5cbi8qKlxuICogVGVzdC1vbmx5IHNlYW06IHJlbW92ZSAoYW5kIGRpc3Bvc2UpIGEgcGVuZGluZyBnYXRld2F5IHNlbGVjdGlvbiBkaXJlY3RseSxcbiAqIG1pcnJvcmluZyB3aGF0IHRoZSByZWFsIHVuZXhwZWN0ZWQtY2xvc2UgaGFuZGxlciBpbiB7QGxpbmsgVHVubmVsQWdlbnRIb3N0TWFpblNlcnZpY2UucHJlcGFyZVNlbGVjdGlvbn1cbiAqIGRvZXMsIHNvIHRlc3RzIGNhbiBzaW11bGF0ZSB0aGF0IHdpcmluZyB3aXRob3V0IGRlcGVuZGluZyBvbiB0aGUgZGV2LXR1bm5lbHMgU0RLLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZGVsZXRlUGVuZGluZ0dhdGV3YXlTZWxlY3Rpb25Gb3JUZXN0cyhcblx0c2VydmljZTogVHVubmVsQWdlbnRIb3N0TWFpblNlcnZpY2UsXG5cdHNlbGVjdGlvbklkOiBzdHJpbmcsXG4pOiB2b2lkIHtcblx0KHNlcnZpY2UgYXMgdW5rbm93biBhcyB7IF9wZW5kaW5nU2VsZWN0aW9uczogRGlzcG9zYWJsZU1hcDxzdHJpbmcsIFBlbmRpbmdHYXRld2F5U2VsZWN0aW9uPiB9KS5fcGVuZGluZ1NlbGVjdGlvbnMuZGVsZXRlQW5kRGlzcG9zZShzZWxlY3Rpb25JZCk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU9BLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxZQUFZLHFCQUFrQztBQUN2RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG9CQUFvQjtB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
