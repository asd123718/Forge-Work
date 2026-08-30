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
import { DeferredPromise } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { JsonRpcProtocol } from "../../../base/common/jsonRpcProtocol.js";
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { ILoggerService } from "../../log/common/log.js";
import { isInitializeMessage, McpGatewaySession } from "./mcpGatewaySession.js";
let McpGatewayService = class extends Disposable {
  constructor(loggerService) {
    super();
    /** All active routes keyed by their route UUID */
    this._routes = /* @__PURE__ */ new Map();
    /** Maps gatewayId → set of route UUIDs belonging to that gateway */
    this._gatewayRoutes = /* @__PURE__ */ new Map();
    /** Maps gatewayId → serverId → routeId for reverse lookup */
    this._gatewayServerRoutes = /* @__PURE__ */ new Map();
    /** Maps gatewayId to clientId for tracking ownership */
    this._gatewayToClient = /* @__PURE__ */ new Map();
    /** Per-gateway disposables (e.g. event listeners) */
    this._gatewayDisposables = /* @__PURE__ */ new Map();
    this._logger = this._register(loggerService.createLogger("mcpGateway", { name: "MCP Gateway", logLevel: "always" }));
    this._logger.info("[McpGatewayService] Initialized");
  }
  async createGateway(clientId, toolInvoker) {
    await this._ensureServer();
    if (this._port === void 0) {
      throw new Error("[McpGatewayService] Server failed to start, port is undefined");
    }
    if (!toolInvoker) {
      throw new Error("[McpGatewayService] Tool invoker is required to create gateway");
    }
    const gatewayId = generateUuid();
    const routeIds = /* @__PURE__ */ new Set();
    const serverRouteMap = /* @__PURE__ */ new Map();
    this._gatewayRoutes.set(gatewayId, routeIds);
    this._gatewayServerRoutes.set(gatewayId, serverRouteMap);
    const disposables = new DisposableStore();
    this._gatewayDisposables.set(gatewayId, disposables);
    try {
      const serverDescriptors = toolInvoker.listServers();
      const servers = [];
      for (const descriptor of serverDescriptors) {
        const serverInfo = this._createRouteForServer(gatewayId, descriptor.id, descriptor.label, toolInvoker, routeIds, serverRouteMap);
        servers.push(serverInfo);
      }
      if (clientId) {
        this._gatewayToClient.set(gatewayId, clientId);
        this._logger.info(`[McpGatewayService] Created gateway ${gatewayId} with ${servers.length} server(s) for client ${clientId}`);
      } else {
        this._logger.warn(`[McpGatewayService] Created gateway ${gatewayId} with ${servers.length} server(s) without client tracking`);
      }
      const onDidChangeServers = disposables.add(new Emitter());
      disposables.add(toolInvoker.onDidChangeServers((newDescriptors) => {
        this._refreshGatewayServers(gatewayId, newDescriptors, toolInvoker, routeIds, serverRouteMap, onDidChangeServers);
      }));
      return {
        servers,
        onDidChangeServers: onDidChangeServers.event,
        gatewayId
      };
    } catch (error) {
      this._cleanupGateway(gatewayId);
      throw error;
    }
  }
  _refreshGatewayServers(gatewayId, newDescriptors, toolInvoker, routeIds, serverRouteMap, onDidChangeServers) {
    if (!this._gatewayRoutes.has(gatewayId)) {
      return;
    }
    const newServerIds = new Set(newDescriptors.map((d) => d.id));
    const existingServerIds = new Set(serverRouteMap.keys());
    for (const serverId of existingServerIds) {
      if (!newServerIds.has(serverId)) {
        const routeId = serverRouteMap.get(serverId);
        if (routeId) {
          this._disposeRoute(routeId);
          routeIds.delete(routeId);
          serverRouteMap.delete(serverId);
        }
      }
    }
    for (const descriptor of newDescriptors) {
      if (!existingServerIds.has(descriptor.id)) {
        this._createRouteForServer(gatewayId, descriptor.id, descriptor.label, toolInvoker, routeIds, serverRouteMap);
        continue;
      }
      const routeId = serverRouteMap.get(descriptor.id);
      const route = routeId ? this._routes.get(routeId) : void 0;
      if (route && route.label !== descriptor.label) {
        route.label = descriptor.label;
      }
    }
    const updatedServers = this._getGatewayServers(gatewayId);
    this._logger.info(`[McpGatewayService] Gateway ${gatewayId} servers changed: ${updatedServers.length} server(s)`);
    onDidChangeServers.fire(updatedServers);
  }
  _cleanupGateway(gatewayId) {
    const routeIds = this._gatewayRoutes.get(gatewayId);
    if (routeIds) {
      for (const routeId of routeIds) {
        this._disposeRoute(routeId);
      }
    }
    this._gatewayRoutes.delete(gatewayId);
    this._gatewayServerRoutes.delete(gatewayId);
    this._gatewayToClient.delete(gatewayId);
    this._gatewayDisposables.get(gatewayId)?.dispose();
    this._gatewayDisposables.delete(gatewayId);
  }
  _createRouteForServer(gatewayId, serverId, label, toolInvoker, routeIds, serverRouteMap) {
    const routeId = generateUuid();
    const singleServerInvoker = {
      onDidChangeTools: toolInvoker.onDidChangeTools,
      onDidChangeResources: toolInvoker.onDidChangeResources,
      listTools: () => toolInvoker.listToolsForServer(serverId),
      callTool: (name, args) => toolInvoker.callToolForServer(serverId, name, args),
      listResources: () => toolInvoker.listResourcesForServer(serverId),
      readResource: (uri) => toolInvoker.readResourceForServer(serverId, uri),
      listResourceTemplates: () => toolInvoker.listResourceTemplatesForServer(serverId)
    };
    const route = new McpGatewayRoute(routeId, this._logger, singleServerInvoker, label);
    this._routes.set(routeId, route);
    routeIds.add(routeId);
    serverRouteMap.set(serverId, routeId);
    const address = URI.parse(`http://127.0.0.1:${this._port}/gateway/${routeId}`);
    this._logger.info(`[McpGatewayService] Created route ${routeId} for server '${label}' (${serverId}) at ${address}`);
    return { label, address };
  }
  _getGatewayServers(gatewayId) {
    const serverRouteMap = this._gatewayServerRoutes.get(gatewayId);
    if (!serverRouteMap) {
      return [];
    }
    const servers = [];
    for (const [_serverId, routeId] of serverRouteMap) {
      const route = this._routes.get(routeId);
      if (route) {
        servers.push({
          label: route.label,
          address: URI.parse(`http://127.0.0.1:${this._port}/gateway/${routeId}`)
        });
      }
    }
    return servers;
  }
  _disposeRoute(routeId) {
    const route = this._routes.get(routeId);
    if (route) {
      route.dispose();
      this._routes.delete(routeId);
      this._logger.info(`[McpGatewayService] Disposed route: ${routeId}`);
    }
  }
  async disposeGateway(gatewayId) {
    if (!this._gatewayRoutes.has(gatewayId)) {
      this._logger.warn(`[McpGatewayService] Attempted to dispose unknown gateway: ${gatewayId}`);
      return;
    }
    this._cleanupGateway(gatewayId);
    this._logger.info(`[McpGatewayService] Disposed gateway: ${gatewayId} (remaining routes: ${this._routes.size})`);
    if (this._routes.size === 0) {
      this._stopServer();
    }
  }
  disposeGatewaysForClient(clientId) {
    const gatewaysToDispose = [];
    for (const [gatewayId, ownerClientId] of this._gatewayToClient) {
      if (ownerClientId === clientId) {
        gatewaysToDispose.push(gatewayId);
      }
    }
    if (gatewaysToDispose.length > 0) {
      this._logger.info(`[McpGatewayService] Disposing ${gatewaysToDispose.length} gateway(s) for disconnected client ${clientId}`);
      for (const gatewayId of gatewaysToDispose) {
        this._cleanupGateway(gatewayId);
      }
      if (this._routes.size === 0) {
        this._stopServer();
      }
    }
  }
  async _ensureServer() {
    if (this._server?.listening) {
      return;
    }
    if (this._serverStartPromise) {
      return this._serverStartPromise;
    }
    this._serverStartPromise = this._startServer();
    try {
      await this._serverStartPromise;
    } finally {
      this._serverStartPromise = void 0;
    }
  }
  async _startServer() {
    const { createServer } = await import("http");
    const deferredPromise = new DeferredPromise();
    this._server = createServer((req, res) => {
      this._handleRequest(req, res);
    });
    const portTimeout = setTimeout(() => {
      deferredPromise.error(new Error("[McpGatewayService] Timeout waiting for server to start"));
    }, 5e3);
    this._server.on("listening", () => {
      const address = this._server.address();
      if (typeof address === "string") {
        this._port = parseInt(address);
      } else if (address instanceof Object) {
        this._port = address.port;
      } else {
        clearTimeout(portTimeout);
        deferredPromise.error(new Error("[McpGatewayService] Unable to determine port"));
        return;
      }
      clearTimeout(portTimeout);
      this._logger.info(`[McpGatewayService] Server started on port ${this._port}`);
      deferredPromise.complete();
    });
    this._server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        this._logger.warn("[McpGatewayService] Port in use, retrying with random port...");
        this._server.listen(0, "127.0.0.1");
        return;
      }
      clearTimeout(portTimeout);
      this._logger.error(`[McpGatewayService] Server error: ${err}`);
      deferredPromise.error(err);
    });
    this._server.listen(0, "127.0.0.1");
    return deferredPromise.p;
  }
  _stopServer() {
    if (!this._server) {
      return;
    }
    this._logger.info("[McpGatewayService] Stopping server (no more routes)");
    this._server.close((err) => {
      if (err) {
        this._logger.error(`[McpGatewayService] Error closing server: ${err}`);
      } else {
        this._logger.info("[McpGatewayService] Server stopped");
      }
    });
    this._server = void 0;
    this._port = void 0;
  }
  _handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathParts = url.pathname.split("/").filter(Boolean);
    this._logger.debug(`[McpGatewayService] ${req.method} ${url.pathname} (active routes: ${this._routes.size})`);
    if (pathParts.length >= 2 && pathParts[0] === "gateway") {
      const routeId = pathParts[1];
      const route = this._routes.get(routeId);
      if (route) {
        route.handleRequest(req, res);
        return;
      }
    }
    this._logger.warn(`[McpGatewayService] ${req.method} ${url.pathname}: route not found`);
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Gateway not found" }));
  }
  dispose() {
    this._logger.info(`[McpGatewayService] Disposing service (routes: ${this._routes.size})`);
    this._stopServer();
    for (const route of this._routes.values()) {
      route.dispose();
    }
    this._routes.clear();
    this._gatewayRoutes.clear();
    this._gatewayServerRoutes.clear();
    this._gatewayToClient.clear();
    for (const disposables of this._gatewayDisposables.values()) {
      disposables.dispose();
    }
    this._gatewayDisposables.clear();
    super.dispose();
  }
};
McpGatewayService = __decorateClass([
  __decorateParam(0, ILoggerService)
], McpGatewayService);
const _McpGatewayRoute = class _McpGatewayRoute extends Disposable {
  constructor(routeId, _logger, _serverInvoker, label = "") {
    super();
    this.routeId = routeId;
    this._logger = _logger;
    this._serverInvoker = _serverInvoker;
    this.label = label;
    this._sessions = /* @__PURE__ */ new Map();
  }
  handleRequest(req, res) {
    this._logger.debug(`[McpGateway][route ${this.routeId}] ${req.method} request (sessions: ${this._sessions.size})`);
    if (req.method === "POST") {
      void this._handlePost(req, res);
      return;
    }
    if (req.method === "GET") {
      this._handleGet(req, res);
      return;
    }
    if (req.method === "DELETE") {
      this._handleDelete(req, res);
      return;
    }
    this._respondHttpError(res, 405, "Method not allowed");
  }
  dispose() {
    this._logger.info(`[McpGateway][route ${this.routeId}] Disposing route (sessions: ${this._sessions.size})`);
    for (const session of this._sessions.values()) {
      session.dispose();
    }
    this._sessions.clear();
    super.dispose();
  }
  _handleDelete(req, res) {
    const sessionId = this._getSessionId(req);
    if (!sessionId) {
      this._respondHttpError(res, 400, "Missing Mcp-Session-Id header");
      return;
    }
    const session = this._sessions.get(sessionId);
    if (!session) {
      this._respondHttpError(res, 404, "Session not found");
      return;
    }
    this._logger.info(`[McpGateway][route ${this.routeId}] Deleting session ${sessionId}`);
    session.dispose();
    this._sessions.delete(sessionId);
    res.writeHead(204);
    res.end();
  }
  _handleGet(req, res) {
    const sessionId = this._getSessionId(req);
    if (!sessionId) {
      this._respondHttpError(res, 400, "Missing Mcp-Session-Id header");
      return;
    }
    const session = this._sessions.get(sessionId);
    if (!session) {
      this._respondHttpError(res, 404, "Session not found");
      return;
    }
    this._logger.info(`[McpGateway][route ${this.routeId}] SSE connection requested for session ${sessionId}`);
    session.attachSseClient(req, res);
  }
  async _handlePost(req, res) {
    const body = await this._readRequestBody(req);
    if (body === void 0) {
      this._respondHttpError(res, 413, "Payload too large");
      return;
    }
    this._logger.debug(`[McpGateway][route ${this.routeId}] Handling POST`);
    let message;
    try {
      message = JSON.parse(body);
    } catch (error) {
      this._logger.warn(`[McpGateway][route ${this.routeId}] JSON parse error: ${error instanceof Error ? error.message : String(error)}`);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify(JsonRpcProtocol.createParseError("Parse error", error instanceof Error ? error.message : String(error))));
      return;
    }
    const headerSessionId = this._getSessionId(req);
    const session = this._resolveSessionForPost(headerSessionId, message, res);
    if (!session) {
      return;
    }
    try {
      const responses = await session.handleIncoming(message);
      const headers = {
        "Content-Type": "application/json",
        "Mcp-Session-Id": session.id
      };
      if (responses.length === 0) {
        this._logger.debug(`[McpGateway][route ${this.routeId}] POST response: 202 (no content)`);
        res.writeHead(202, headers);
        res.end();
        return;
      }
      const responseBody = JSON.stringify(Array.isArray(message) ? responses : responses[0]);
      this._logger.debug(`[McpGateway][route ${this.routeId}] POST response: 200, body: ${responseBody}`);
      res.writeHead(200, headers);
      res.end(responseBody);
    } catch (error) {
      this._logger.error("[McpGatewayService] Failed handling gateway request", error);
      this._respondHttpError(res, 500, "Internal server error");
    }
  }
  _resolveSessionForPost(headerSessionId, message, res) {
    if (headerSessionId) {
      const existing = this._sessions.get(headerSessionId);
      if (!existing) {
        this._logger.warn(`[McpGateway][route ${this.routeId}] Session not found: ${headerSessionId}`);
        this._respondHttpError(res, 404, "Session not found");
        return void 0;
      }
      return existing;
    }
    if (!isInitializeMessage(message)) {
      this._respondHttpError(res, 400, "Missing Mcp-Session-Id header");
      return void 0;
    }
    const sessionId = generateUuid();
    this._logger.info(`[McpGateway][route ${this.routeId}] Creating new session ${sessionId}`);
    const session = new McpGatewaySession(sessionId, this._logger, () => {
      this._sessions.delete(sessionId);
    }, this._serverInvoker);
    this._sessions.set(sessionId, session);
    return session;
  }
  _respondHttpError(res, statusCode, error) {
    this._logger.debug(`[McpGateway][route ${this.routeId}] HTTP error response: ${statusCode} ${error}`);
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: statusCode, message: error } }));
  }
  _getSessionId(req) {
    const value = req.headers[_McpGatewayRoute.SessionHeaderName];
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }
  async _readRequestBody(req) {
    const chunks = [];
    let size = 0;
    const maxBytes = 1024 * 1024;
    for await (const chunk of req) {
      const asBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += asBuffer.byteLength;
      if (size > maxBytes) {
        return void 0;
      }
      chunks.push(asBuffer);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
};
_McpGatewayRoute.SessionHeaderName = "mcp-session-id";
let McpGatewayRoute = _McpGatewayRoute;
export {
  McpGatewayService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcbWNwXFxub2RlXFxtY3BHYXRld2F5U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlICogYXMgaHR0cCBmcm9tICdodHRwJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBKc29uUnBjTWVzc2FnZSwgSnNvblJwY1Byb3RvY29sIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblJwY1Byb3RvY29sLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJTG9nZ2VyLCBJTG9nZ2VyU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElNY3BHYXRld2F5SW5mbywgSU1jcEdhdGV3YXlTZXJ2ZXJEZXNjcmlwdG9yLCBJTWNwR2F0ZXdheVNlcnZlckluZm8sIElNY3BHYXRld2F5U2VydmljZSwgSU1jcEdhdGV3YXlTaW5nbGVTZXJ2ZXJJbnZva2VyLCBJTWNwR2F0ZXdheVRvb2xJbnZva2VyIH0gZnJvbSAnLi4vY29tbW9uL21jcEdhdGV3YXkuanMnO1xuaW1wb3J0IHsgaXNJbml0aWFsaXplTWVzc2FnZSwgTWNwR2F0ZXdheVNlc3Npb24gfSBmcm9tICcuL21jcEdhdGV3YXlTZXNzaW9uLmpzJztcblxuLyoqXG4gKiBOb2RlLmpzIGltcGxlbWVudGF0aW9uIG9mIHRoZSBNQ1AgR2F0ZXdheSBTZXJ2aWNlLlxuICpcbiAqIENyZWF0ZXMgYW5kIG1hbmFnZXMgYW4gSFRUUCBzZXJ2ZXIgb24gbG9jYWxob3N0IHRoYXQgcHJvdmlkZXMgTUNQIGdhdGV3YXkgZW5kcG9pbnRzLlxuICogVGhlIHNlcnZlciBpcyBzaGFyZWQgYW1vbmcgYWxsIGdhdGV3YXlzIGFuZCB1c2VzIHJlZi1jb3VudGluZyBmb3IgbGlmZWN5Y2xlIG1hbmFnZW1lbnQuXG4gKi9cbmV4cG9ydCBjbGFzcyBNY3BHYXRld2F5U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTWNwR2F0ZXdheVNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9zZXJ2ZXI6IGh0dHAuU2VydmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9wb3J0OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdC8qKiBBbGwgYWN0aXZlIHJvdXRlcyBrZXllZCBieSB0aGVpciByb3V0ZSBVVUlEICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JvdXRlcyA9IG5ldyBNYXA8c3RyaW5nLCBNY3BHYXRld2F5Um91dGU+KCk7XG5cdC8qKiBNYXBzIGdhdGV3YXlJZCBcdTIxOTIgc2V0IG9mIHJvdXRlIFVVSURzIGJlbG9uZ2luZyB0byB0aGF0IGdhdGV3YXkgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZ2F0ZXdheVJvdXRlcyA9IG5ldyBNYXA8c3RyaW5nLCBTZXQ8c3RyaW5nPj4oKTtcblx0LyoqIE1hcHMgZ2F0ZXdheUlkIFx1MjE5MiBzZXJ2ZXJJZCBcdTIxOTIgcm91dGVJZCBmb3IgcmV2ZXJzZSBsb29rdXAgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZ2F0ZXdheVNlcnZlclJvdXRlcyA9IG5ldyBNYXA8c3RyaW5nLCBNYXA8c3RyaW5nLCBzdHJpbmc+PigpO1xuXHQvKiogTWFwcyBnYXRld2F5SWQgdG8gY2xpZW50SWQgZm9yIHRyYWNraW5nIG93bmVyc2hpcCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9nYXRld2F5VG9DbGllbnQgPSBuZXcgTWFwPHN0cmluZywgdW5rbm93bj4oKTtcblx0LyoqIFBlci1nYXRld2F5IGRpc3Bvc2FibGVzIChlLmcuIGV2ZW50IGxpc3RlbmVycykgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfZ2F0ZXdheURpc3Bvc2FibGVzID0gbmV3IE1hcDxzdHJpbmcsIERpc3Bvc2FibGVTdG9yZT4oKTtcblx0cHJpdmF0ZSBfc2VydmVyU3RhcnRQcm9taXNlOiBQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2dnZXI6IElMb2dnZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dnZXJTZXJ2aWNlIGxvZ2dlclNlcnZpY2U6IElMb2dnZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2xvZ2dlciA9IHRoaXMuX3JlZ2lzdGVyKGxvZ2dlclNlcnZpY2UuY3JlYXRlTG9nZ2VyKCdtY3BHYXRld2F5JywgeyBuYW1lOiAnTUNQIEdhdGV3YXknLCBsb2dMZXZlbDogJ2Fsd2F5cycgfSkpO1xuXHRcdHRoaXMuX2xvZ2dlci5pbmZvKCdbTWNwR2F0ZXdheVNlcnZpY2VdIEluaXRpYWxpemVkJyk7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVHYXRld2F5KGNsaWVudElkOiB1bmtub3duLCB0b29sSW52b2tlcj86IElNY3BHYXRld2F5VG9vbEludm9rZXIpOiBQcm9taXNlPElNY3BHYXRld2F5SW5mbz4ge1xuXHRcdC8vIEVuc3VyZSBzZXJ2ZXIgaXMgcnVubmluZ1xuXHRcdGF3YWl0IHRoaXMuX2Vuc3VyZVNlcnZlcigpO1xuXG5cdFx0aWYgKHRoaXMuX3BvcnQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdbTWNwR2F0ZXdheVNlcnZpY2VdIFNlcnZlciBmYWlsZWQgdG8gc3RhcnQsIHBvcnQgaXMgdW5kZWZpbmVkJyk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0b29sSW52b2tlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdbTWNwR2F0ZXdheVNlcnZpY2VdIFRvb2wgaW52b2tlciBpcyByZXF1aXJlZCB0byBjcmVhdGUgZ2F0ZXdheScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGdhdGV3YXlJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHJvdXRlSWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3Qgc2VydmVyUm91dGVNYXAgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdHRoaXMuX2dhdGV3YXlSb3V0ZXMuc2V0KGdhdGV3YXlJZCwgcm91dGVJZHMpO1xuXHRcdHRoaXMuX2dhdGV3YXlTZXJ2ZXJSb3V0ZXMuc2V0KGdhdGV3YXlJZCwgc2VydmVyUm91dGVNYXApO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fZ2F0ZXdheURpc3Bvc2FibGVzLnNldChnYXRld2F5SWQsIGRpc3Bvc2FibGVzKTtcblxuXHRcdHRyeSB7XG5cdFx0XHQvLyBDcmVhdGUgaW5pdGlhbCBzZXJ2ZXIgcm91dGVzXG5cdFx0XHRjb25zdCBzZXJ2ZXJEZXNjcmlwdG9ycyA9IHRvb2xJbnZva2VyLmxpc3RTZXJ2ZXJzKCk7XG5cdFx0XHRjb25zdCBzZXJ2ZXJzOiBJTWNwR2F0ZXdheVNlcnZlckluZm9bXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBkZXNjcmlwdG9yIG9mIHNlcnZlckRlc2NyaXB0b3JzKSB7XG5cdFx0XHRcdGNvbnN0IHNlcnZlckluZm8gPSB0aGlzLl9jcmVhdGVSb3V0ZUZvclNlcnZlcihnYXRld2F5SWQsIGRlc2NyaXB0b3IuaWQsIGRlc2NyaXB0b3IubGFiZWwsIHRvb2xJbnZva2VyLCByb3V0ZUlkcywgc2VydmVyUm91dGVNYXApO1xuXHRcdFx0XHRzZXJ2ZXJzLnB1c2goc2VydmVySW5mbyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRyYWNrIGNsaWVudCBvd25lcnNoaXBcblx0XHRcdGlmIChjbGllbnRJZCkge1xuXHRcdFx0XHR0aGlzLl9nYXRld2F5VG9DbGllbnQuc2V0KGdhdGV3YXlJZCwgY2xpZW50SWQpO1xuXHRcdFx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgW01jcEdhdGV3YXlTZXJ2aWNlXSBDcmVhdGVkIGdhdGV3YXkgJHtnYXRld2F5SWR9IHdpdGggJHtzZXJ2ZXJzLmxlbmd0aH0gc2VydmVyKHMpIGZvciBjbGllbnQgJHtjbGllbnRJZH1gKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xvZ2dlci53YXJuKGBbTWNwR2F0ZXdheVNlcnZpY2VdIENyZWF0ZWQgZ2F0ZXdheSAke2dhdGV3YXlJZH0gd2l0aCAke3NlcnZlcnMubGVuZ3RofSBzZXJ2ZXIocykgd2l0aG91dCBjbGllbnQgdHJhY2tpbmdgKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTGlzdGVuIGZvciBzZXJ2ZXIgY2hhbmdlcyB0byBkeW5hbWljYWxseSBhZGQvcmVtb3ZlIHJvdXRlc1xuXHRcdFx0Y29uc3Qgb25EaWRDaGFuZ2VTZXJ2ZXJzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHJlYWRvbmx5IElNY3BHYXRld2F5U2VydmVySW5mb1tdPigpKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b29sSW52b2tlci5vbkRpZENoYW5nZVNlcnZlcnMobmV3RGVzY3JpcHRvcnMgPT4ge1xuXHRcdFx0XHR0aGlzLl9yZWZyZXNoR2F0ZXdheVNlcnZlcnMoZ2F0ZXdheUlkLCBuZXdEZXNjcmlwdG9ycywgdG9vbEludm9rZXIsIHJvdXRlSWRzLCBzZXJ2ZXJSb3V0ZU1hcCwgb25EaWRDaGFuZ2VTZXJ2ZXJzKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0c2VydmVycyxcblx0XHRcdFx0b25EaWRDaGFuZ2VTZXJ2ZXJzOiBvbkRpZENoYW5nZVNlcnZlcnMuZXZlbnQsXG5cdFx0XHRcdGdhdGV3YXlJZCxcblx0XHRcdH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdC8vIENsZWFuIHVwIHBhcnRpYWxseS1jcmVhdGVkIHN0YXRlIG9uIGZhaWx1cmVcblx0XHRcdHRoaXMuX2NsZWFudXBHYXRld2F5KGdhdGV3YXlJZCk7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWZyZXNoR2F0ZXdheVNlcnZlcnMoXG5cdFx0Z2F0ZXdheUlkOiBzdHJpbmcsXG5cdFx0bmV3RGVzY3JpcHRvcnM6IHJlYWRvbmx5IElNY3BHYXRld2F5U2VydmVyRGVzY3JpcHRvcltdLFxuXHRcdHRvb2xJbnZva2VyOiBJTWNwR2F0ZXdheVRvb2xJbnZva2VyLFxuXHRcdHJvdXRlSWRzOiBTZXQ8c3RyaW5nPixcblx0XHRzZXJ2ZXJSb3V0ZU1hcDogTWFwPHN0cmluZywgc3RyaW5nPixcblx0XHRvbkRpZENoYW5nZVNlcnZlcnM6IEVtaXR0ZXI8cmVhZG9ubHkgSU1jcEdhdGV3YXlTZXJ2ZXJJbmZvW10+LFxuXHQpOiB2b2lkIHtcblx0XHQvLyBCYWlsIG91dCBpZiB0aGUgZ2F0ZXdheSBoYXMgYmVlbiBkaXNwb3NlZFxuXHRcdGlmICghdGhpcy5fZ2F0ZXdheVJvdXRlcy5oYXMoZ2F0ZXdheUlkKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5ld1NlcnZlcklkcyA9IG5ldyBTZXQobmV3RGVzY3JpcHRvcnMubWFwKGQgPT4gZC5pZCkpO1xuXHRcdGNvbnN0IGV4aXN0aW5nU2VydmVySWRzID0gbmV3IFNldChzZXJ2ZXJSb3V0ZU1hcC5rZXlzKCkpO1xuXG5cdFx0Ly8gUmVtb3ZlIHJvdXRlcyBmb3Igc2VydmVycyB0aGF0IGFyZSBnb25lXG5cdFx0Zm9yIChjb25zdCBzZXJ2ZXJJZCBvZiBleGlzdGluZ1NlcnZlcklkcykge1xuXHRcdFx0aWYgKCFuZXdTZXJ2ZXJJZHMuaGFzKHNlcnZlcklkKSkge1xuXHRcdFx0XHRjb25zdCByb3V0ZUlkID0gc2VydmVyUm91dGVNYXAuZ2V0KHNlcnZlcklkKTtcblx0XHRcdFx0aWYgKHJvdXRlSWQpIHtcblx0XHRcdFx0XHR0aGlzLl9kaXNwb3NlUm91dGUocm91dGVJZCk7XG5cdFx0XHRcdFx0cm91dGVJZHMuZGVsZXRlKHJvdXRlSWQpO1xuXHRcdFx0XHRcdHNlcnZlclJvdXRlTWFwLmRlbGV0ZShzZXJ2ZXJJZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBZGQgcm91dGVzIGZvciBuZXcgc2VydmVycywgYW5kIHVwZGF0ZSBsYWJlbHMgZm9yIGV4aXN0aW5nIG9uZXMuXG5cdFx0Zm9yIChjb25zdCBkZXNjcmlwdG9yIG9mIG5ld0Rlc2NyaXB0b3JzKSB7XG5cdFx0XHRpZiAoIWV4aXN0aW5nU2VydmVySWRzLmhhcyhkZXNjcmlwdG9yLmlkKSkge1xuXHRcdFx0XHR0aGlzLl9jcmVhdGVSb3V0ZUZvclNlcnZlcihnYXRld2F5SWQsIGRlc2NyaXB0b3IuaWQsIGRlc2NyaXB0b3IubGFiZWwsIHRvb2xJbnZva2VyLCByb3V0ZUlkcywgc2VydmVyUm91dGVNYXApO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgcm91dGVJZCA9IHNlcnZlclJvdXRlTWFwLmdldChkZXNjcmlwdG9yLmlkKTtcblx0XHRcdGNvbnN0IHJvdXRlID0gcm91dGVJZCA/IHRoaXMuX3JvdXRlcy5nZXQocm91dGVJZCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAocm91dGUgJiYgcm91dGUubGFiZWwgIT09IGRlc2NyaXB0b3IubGFiZWwpIHtcblx0XHRcdFx0cm91dGUubGFiZWwgPSBkZXNjcmlwdG9yLmxhYmVsO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHVwZGF0ZWRTZXJ2ZXJzID0gdGhpcy5fZ2V0R2F0ZXdheVNlcnZlcnMoZ2F0ZXdheUlkKTtcblx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgW01jcEdhdGV3YXlTZXJ2aWNlXSBHYXRld2F5ICR7Z2F0ZXdheUlkfSBzZXJ2ZXJzIGNoYW5nZWQ6ICR7dXBkYXRlZFNlcnZlcnMubGVuZ3RofSBzZXJ2ZXIocylgKTtcblx0XHRvbkRpZENoYW5nZVNlcnZlcnMuZmlyZSh1cGRhdGVkU2VydmVycyk7XG5cdH1cblxuXHRwcml2YXRlIF9jbGVhbnVwR2F0ZXdheShnYXRld2F5SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHJvdXRlSWRzID0gdGhpcy5fZ2F0ZXdheVJvdXRlcy5nZXQoZ2F0ZXdheUlkKTtcblx0XHRpZiAocm91dGVJZHMpIHtcblx0XHRcdGZvciAoY29uc3Qgcm91dGVJZCBvZiByb3V0ZUlkcykge1xuXHRcdFx0XHR0aGlzLl9kaXNwb3NlUm91dGUocm91dGVJZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2dhdGV3YXlSb3V0ZXMuZGVsZXRlKGdhdGV3YXlJZCk7XG5cdFx0dGhpcy5fZ2F0ZXdheVNlcnZlclJvdXRlcy5kZWxldGUoZ2F0ZXdheUlkKTtcblx0XHR0aGlzLl9nYXRld2F5VG9DbGllbnQuZGVsZXRlKGdhdGV3YXlJZCk7XG5cdFx0dGhpcy5fZ2F0ZXdheURpc3Bvc2FibGVzLmdldChnYXRld2F5SWQpPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZ2F0ZXdheURpc3Bvc2FibGVzLmRlbGV0ZShnYXRld2F5SWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlUm91dGVGb3JTZXJ2ZXIoXG5cdFx0Z2F0ZXdheUlkOiBzdHJpbmcsXG5cdFx0c2VydmVySWQ6IHN0cmluZyxcblx0XHRsYWJlbDogc3RyaW5nLFxuXHRcdHRvb2xJbnZva2VyOiBJTWNwR2F0ZXdheVRvb2xJbnZva2VyLFxuXHRcdHJvdXRlSWRzOiBTZXQ8c3RyaW5nPixcblx0XHRzZXJ2ZXJSb3V0ZU1hcDogTWFwPHN0cmluZywgc3RyaW5nPixcblx0KTogSU1jcEdhdGV3YXlTZXJ2ZXJJbmZvIHtcblx0XHRjb25zdCByb3V0ZUlkID0gZ2VuZXJhdGVVdWlkKCk7XG5cblx0XHQvLyBDcmVhdGUgYSBzaW5nbGUtc2VydmVyIGludm9rZXIgdGhhdCBkZWxlZ2F0ZXMgdG8gdGhlIGFnZ3JlZ2F0aW5nIGludm9rZXJcblx0XHRjb25zdCBzaW5nbGVTZXJ2ZXJJbnZva2VyOiBJTWNwR2F0ZXdheVNpbmdsZVNlcnZlckludm9rZXIgPSB7XG5cdFx0XHRvbkRpZENoYW5nZVRvb2xzOiB0b29sSW52b2tlci5vbkRpZENoYW5nZVRvb2xzLFxuXHRcdFx0b25EaWRDaGFuZ2VSZXNvdXJjZXM6IHRvb2xJbnZva2VyLm9uRGlkQ2hhbmdlUmVzb3VyY2VzLFxuXHRcdFx0bGlzdFRvb2xzOiAoKSA9PiB0b29sSW52b2tlci5saXN0VG9vbHNGb3JTZXJ2ZXIoc2VydmVySWQpLFxuXHRcdFx0Y2FsbFRvb2w6IChuYW1lLCBhcmdzKSA9PiB0b29sSW52b2tlci5jYWxsVG9vbEZvclNlcnZlcihzZXJ2ZXJJZCwgbmFtZSwgYXJncyksXG5cdFx0XHRsaXN0UmVzb3VyY2VzOiAoKSA9PiB0b29sSW52b2tlci5saXN0UmVzb3VyY2VzRm9yU2VydmVyKHNlcnZlcklkKSxcblx0XHRcdHJlYWRSZXNvdXJjZTogdXJpID0+IHRvb2xJbnZva2VyLnJlYWRSZXNvdXJjZUZvclNlcnZlcihzZXJ2ZXJJZCwgdXJpKSxcblx0XHRcdGxpc3RSZXNvdXJjZVRlbXBsYXRlczogKCkgPT4gdG9vbEludm9rZXIubGlzdFJlc291cmNlVGVtcGxhdGVzRm9yU2VydmVyKHNlcnZlcklkKSxcblx0XHR9O1xuXG5cdFx0Y29uc3Qgcm91dGUgPSBuZXcgTWNwR2F0ZXdheVJvdXRlKHJvdXRlSWQsIHRoaXMuX2xvZ2dlciwgc2luZ2xlU2VydmVySW52b2tlciwgbGFiZWwpO1xuXHRcdHRoaXMuX3JvdXRlcy5zZXQocm91dGVJZCwgcm91dGUpO1xuXHRcdHJvdXRlSWRzLmFkZChyb3V0ZUlkKTtcblx0XHRzZXJ2ZXJSb3V0ZU1hcC5zZXQoc2VydmVySWQsIHJvdXRlSWQpO1xuXG5cdFx0Y29uc3QgYWRkcmVzcyA9IFVSSS5wYXJzZShgaHR0cDovLzEyNy4wLjAuMToke3RoaXMuX3BvcnR9L2dhdGV3YXkvJHtyb3V0ZUlkfWApO1xuXHRcdHRoaXMuX2xvZ2dlci5pbmZvKGBbTWNwR2F0ZXdheVNlcnZpY2VdIENyZWF0ZWQgcm91dGUgJHtyb3V0ZUlkfSBmb3Igc2VydmVyICcke2xhYmVsfScgKCR7c2VydmVySWR9KSBhdCAke2FkZHJlc3N9YCk7XG5cblx0XHRyZXR1cm4geyBsYWJlbCwgYWRkcmVzcyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0R2F0ZXdheVNlcnZlcnMoZ2F0ZXdheUlkOiBzdHJpbmcpOiBJTWNwR2F0ZXdheVNlcnZlckluZm9bXSB7XG5cdFx0Y29uc3Qgc2VydmVyUm91dGVNYXAgPSB0aGlzLl9nYXRld2F5U2VydmVyUm91dGVzLmdldChnYXRld2F5SWQpO1xuXHRcdGlmICghc2VydmVyUm91dGVNYXApIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3Qgc2VydmVyczogSU1jcEdhdGV3YXlTZXJ2ZXJJbmZvW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFtfc2VydmVySWQsIHJvdXRlSWRdIG9mIHNlcnZlclJvdXRlTWFwKSB7XG5cdFx0XHRjb25zdCByb3V0ZSA9IHRoaXMuX3JvdXRlcy5nZXQocm91dGVJZCk7XG5cdFx0XHRpZiAocm91dGUpIHtcblx0XHRcdFx0c2VydmVycy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogcm91dGUubGFiZWwsXG5cdFx0XHRcdFx0YWRkcmVzczogVVJJLnBhcnNlKGBodHRwOi8vMTI3LjAuMC4xOiR7dGhpcy5fcG9ydH0vZ2F0ZXdheS8ke3JvdXRlSWR9YCksXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gc2VydmVycztcblx0fVxuXG5cdHByaXZhdGUgX2Rpc3Bvc2VSb3V0ZShyb3V0ZUlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCByb3V0ZSA9IHRoaXMuX3JvdXRlcy5nZXQocm91dGVJZCk7XG5cdFx0aWYgKHJvdXRlKSB7XG5cdFx0XHRyb3V0ZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9yb3V0ZXMuZGVsZXRlKHJvdXRlSWQpO1xuXHRcdFx0dGhpcy5fbG9nZ2VyLmluZm8oYFtNY3BHYXRld2F5U2VydmljZV0gRGlzcG9zZWQgcm91dGU6ICR7cm91dGVJZH1gKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBkaXNwb3NlR2F0ZXdheShnYXRld2F5SWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5fZ2F0ZXdheVJvdXRlcy5oYXMoZ2F0ZXdheUlkKSkge1xuXHRcdFx0dGhpcy5fbG9nZ2VyLndhcm4oYFtNY3BHYXRld2F5U2VydmljZV0gQXR0ZW1wdGVkIHRvIGRpc3Bvc2UgdW5rbm93biBnYXRld2F5OiAke2dhdGV3YXlJZH1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9jbGVhbnVwR2F0ZXdheShnYXRld2F5SWQpO1xuXHRcdHRoaXMuX2xvZ2dlci5pbmZvKGBbTWNwR2F0ZXdheVNlcnZpY2VdIERpc3Bvc2VkIGdhdGV3YXk6ICR7Z2F0ZXdheUlkfSAocmVtYWluaW5nIHJvdXRlczogJHt0aGlzLl9yb3V0ZXMuc2l6ZX0pYCk7XG5cblx0XHQvLyBJZiBubyBtb3JlIHJvdXRlcywgc2h1dCBkb3duIHRoZSBzZXJ2ZXJcblx0XHRpZiAodGhpcy5fcm91dGVzLnNpemUgPT09IDApIHtcblx0XHRcdHRoaXMuX3N0b3BTZXJ2ZXIoKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlR2F0ZXdheXNGb3JDbGllbnQoY2xpZW50SWQ6IHVua25vd24pOiB2b2lkIHtcblx0XHRjb25zdCBnYXRld2F5c1RvRGlzcG9zZTogc3RyaW5nW10gPSBbXTtcblxuXHRcdGZvciAoY29uc3QgW2dhdGV3YXlJZCwgb3duZXJDbGllbnRJZF0gb2YgdGhpcy5fZ2F0ZXdheVRvQ2xpZW50KSB7XG5cdFx0XHRpZiAob3duZXJDbGllbnRJZCA9PT0gY2xpZW50SWQpIHtcblx0XHRcdFx0Z2F0ZXdheXNUb0Rpc3Bvc2UucHVzaChnYXRld2F5SWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChnYXRld2F5c1RvRGlzcG9zZS5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9sb2dnZXIuaW5mbyhgW01jcEdhdGV3YXlTZXJ2aWNlXSBEaXNwb3NpbmcgJHtnYXRld2F5c1RvRGlzcG9zZS5sZW5ndGh9IGdhdGV3YXkocykgZm9yIGRpc2Nvbm5lY3RlZCBjbGllbnQgJHtjbGllbnRJZH1gKTtcblxuXHRcdFx0Zm9yIChjb25zdCBnYXRld2F5SWQgb2YgZ2F0ZXdheXNUb0Rpc3Bvc2UpIHtcblx0XHRcdFx0dGhpcy5fY2xlYW51cEdhdGV3YXkoZ2F0ZXdheUlkKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSWYgbm8gbW9yZSByb3V0ZXMsIHNodXQgZG93biB0aGUgc2VydmVyXG5cdFx0XHRpZiAodGhpcy5fcm91dGVzLnNpemUgPT09IDApIHtcblx0XHRcdFx0dGhpcy5fc3RvcFNlcnZlcigpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Vuc3VyZVNlcnZlcigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fc2VydmVyPy5saXN0ZW5pbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJZiBzZXJ2ZXIgaXMgYWxyZWFkeSBzdGFydGluZywgd2FpdCBmb3IgaXRcblx0XHRpZiAodGhpcy5fc2VydmVyU3RhcnRQcm9taXNlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fc2VydmVyU3RhcnRQcm9taXNlO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NlcnZlclN0YXJ0UHJvbWlzZSA9IHRoaXMuX3N0YXJ0U2VydmVyKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX3NlcnZlclN0YXJ0UHJvbWlzZTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fc2VydmVyU3RhcnRQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3N0YXJ0U2VydmVyKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHsgY3JlYXRlU2VydmVyIH0gPSBhd2FpdCBpbXBvcnQoJ2h0dHAnKTsgLy8gTGF6eSBkdWUgdG8gaHR0cHM6Ly9naXRodWIuY29tL25vZGVqcy9ub2RlL2lzc3Vlcy81OTY4NlxuXHRcdGNvbnN0IGRlZmVycmVkUHJvbWlzZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblxuXHRcdHRoaXMuX3NlcnZlciA9IGNyZWF0ZVNlcnZlcigocmVxLCByZXMpID0+IHtcblx0XHRcdHRoaXMuX2hhbmRsZVJlcXVlc3QocmVxLCByZXMpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcG9ydFRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdGRlZmVycmVkUHJvbWlzZS5lcnJvcihuZXcgRXJyb3IoJ1tNY3BHYXRld2F5U2VydmljZV0gVGltZW91dCB3YWl0aW5nIGZvciBzZXJ2ZXIgdG8gc3RhcnQnKSk7XG5cdFx0fSwgNTAwMCk7XG5cblx0XHR0aGlzLl9zZXJ2ZXIub24oJ2xpc3RlbmluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IGFkZHJlc3MgPSB0aGlzLl9zZXJ2ZXIhLmFkZHJlc3MoKTtcblx0XHRcdGlmICh0eXBlb2YgYWRkcmVzcyA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0dGhpcy5fcG9ydCA9IHBhcnNlSW50KGFkZHJlc3MpO1xuXHRcdFx0fSBlbHNlIGlmIChhZGRyZXNzIGluc3RhbmNlb2YgT2JqZWN0KSB7XG5cdFx0XHRcdHRoaXMuX3BvcnQgPSBhZGRyZXNzLnBvcnQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjbGVhclRpbWVvdXQocG9ydFRpbWVvdXQpO1xuXHRcdFx0XHRkZWZlcnJlZFByb21pc2UuZXJyb3IobmV3IEVycm9yKCdbTWNwR2F0ZXdheVNlcnZpY2VdIFVuYWJsZSB0byBkZXRlcm1pbmUgcG9ydCcpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjbGVhclRpbWVvdXQocG9ydFRpbWVvdXQpO1xuXHRcdFx0dGhpcy5fbG9nZ2VyLmluZm8oYFtNY3BHYXRld2F5U2VydmljZV0gU2VydmVyIHN0YXJ0ZWQgb24gcG9ydCAke3RoaXMuX3BvcnR9YCk7XG5cdFx0XHRkZWZlcnJlZFByb21pc2UuY29tcGxldGUoKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3NlcnZlci5vbignZXJyb3InLCAoZXJyOiBOb2RlSlMuRXJybm9FeGNlcHRpb24pID0+IHtcblx0XHRcdGlmIChlcnIuY29kZSA9PT0gJ0VBRERSSU5VU0UnKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ2dlci53YXJuKCdbTWNwR2F0ZXdheVNlcnZpY2VdIFBvcnQgaW4gdXNlLCByZXRyeWluZyB3aXRoIHJhbmRvbSBwb3J0Li4uJyk7XG5cdFx0XHRcdC8vIFRyeSB3aXRoIGEgcmFuZG9tIHBvcnRcblx0XHRcdFx0dGhpcy5fc2VydmVyIS5saXN0ZW4oMCwgJzEyNy4wLjAuMScpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjbGVhclRpbWVvdXQocG9ydFRpbWVvdXQpO1xuXHRcdFx0dGhpcy5fbG9nZ2VyLmVycm9yKGBbTWNwR2F0ZXdheVNlcnZpY2VdIFNlcnZlciBlcnJvcjogJHtlcnJ9YCk7XG5cdFx0XHRkZWZlcnJlZFByb21pc2UuZXJyb3IoZXJyKTtcblx0XHR9KTtcblxuXHRcdC8vIFVzZSBkeW5hbWljIHBvcnQgYXNzaWdubWVudCAocG9ydCAwKVxuXHRcdHRoaXMuX3NlcnZlci5saXN0ZW4oMCwgJzEyNy4wLjAuMScpO1xuXG5cdFx0cmV0dXJuIGRlZmVycmVkUHJvbWlzZS5wO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3RvcFNlcnZlcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3NlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ2dlci5pbmZvKCdbTWNwR2F0ZXdheVNlcnZpY2VdIFN0b3BwaW5nIHNlcnZlciAobm8gbW9yZSByb3V0ZXMpJyk7XG5cblx0XHR0aGlzLl9zZXJ2ZXIuY2xvc2UoZXJyID0+IHtcblx0XHRcdGlmIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nZ2VyLmVycm9yKGBbTWNwR2F0ZXdheVNlcnZpY2VdIEVycm9yIGNsb3Npbmcgc2VydmVyOiAke2Vycn1gKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2xvZ2dlci5pbmZvKCdbTWNwR2F0ZXdheVNlcnZpY2VdIFNlcnZlciBzdG9wcGVkJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9zZXJ2ZXIgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcG9ydCA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVJlcXVlc3QocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlKTogdm9pZCB7XG5cdFx0Y29uc3QgdXJsID0gbmV3IFVSTChyZXEudXJsISwgYGh0dHA6Ly8ke3JlcS5oZWFkZXJzLmhvc3R9YCk7XG5cdFx0Y29uc3QgcGF0aFBhcnRzID0gdXJsLnBhdGhuYW1lLnNwbGl0KCcvJykuZmlsdGVyKEJvb2xlYW4pO1xuXG5cdFx0dGhpcy5fbG9nZ2VyLmRlYnVnKGBbTWNwR2F0ZXdheVNlcnZpY2VdICR7cmVxLm1ldGhvZH0gJHt1cmwucGF0aG5hbWV9IChhY3RpdmUgcm91dGVzOiAke3RoaXMuX3JvdXRlcy5zaXplfSlgKTtcblxuXHRcdC8vIEV4cGVjdGVkIHBhdGg6IC9nYXRld2F5L3tyb3V0ZUlkfVxuXHRcdGlmIChwYXRoUGFydHMubGVuZ3RoID49IDIgJiYgcGF0aFBhcnRzWzBdID09PSAnZ2F0ZXdheScpIHtcblx0XHRcdGNvbnN0IHJvdXRlSWQgPSBwYXRoUGFydHNbMV07XG5cdFx0XHRjb25zdCByb3V0ZSA9IHRoaXMuX3JvdXRlcy5nZXQocm91dGVJZCk7XG5cblx0XHRcdGlmIChyb3V0ZSkge1xuXHRcdFx0XHRyb3V0ZS5oYW5kbGVSZXF1ZXN0KHJlcSwgcmVzKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIE5vdCBmb3VuZFxuXHRcdHRoaXMuX2xvZ2dlci53YXJuKGBbTWNwR2F0ZXdheVNlcnZpY2VdICR7cmVxLm1ldGhvZH0gJHt1cmwucGF0aG5hbWV9OiByb3V0ZSBub3QgZm91bmRgKTtcblx0XHRyZXMud3JpdGVIZWFkKDQwNCwgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuXHRcdHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0dhdGV3YXkgbm90IGZvdW5kJyB9KSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2xvZ2dlci5pbmZvKGBbTWNwR2F0ZXdheVNlcnZpY2VdIERpc3Bvc2luZyBzZXJ2aWNlIChyb3V0ZXM6ICR7dGhpcy5fcm91dGVzLnNpemV9KWApO1xuXHRcdHRoaXMuX3N0b3BTZXJ2ZXIoKTtcblx0XHRmb3IgKGNvbnN0IHJvdXRlIG9mIHRoaXMuX3JvdXRlcy52YWx1ZXMoKSkge1xuXHRcdFx0cm91dGUuZGlzcG9zZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9yb3V0ZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9nYXRld2F5Um91dGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fZ2F0ZXdheVNlcnZlclJvdXRlcy5jbGVhcigpO1xuXHRcdHRoaXMuX2dhdGV3YXlUb0NsaWVudC5jbGVhcigpO1xuXHRcdGZvciAoY29uc3QgZGlzcG9zYWJsZXMgb2YgdGhpcy5fZ2F0ZXdheURpc3Bvc2FibGVzLnZhbHVlcygpKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2dhdGV3YXlEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgYSBzaW5nbGUgTUNQIGdhdGV3YXkgcm91dGUgZm9yIG9uZSBNQ1Agc2VydmVyLlxuICovXG5jbGFzcyBNY3BHYXRld2F5Um91dGUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnMgPSBuZXcgTWFwPHN0cmluZywgTWNwR2F0ZXdheVNlc3Npb24+KCk7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU2Vzc2lvbkhlYWRlck5hbWUgPSAnbWNwLXNlc3Npb24taWQnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSByb3V0ZUlkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nZ2VyOiBJTG9nZ2VyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NlcnZlckludm9rZXI6IElNY3BHYXRld2F5U2luZ2xlU2VydmVySW52b2tlcixcblx0XHRwdWJsaWMgbGFiZWw6IHN0cmluZyA9ICcnLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0aGFuZGxlUmVxdWVzdChyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCByZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2dnZXIuZGVidWcoYFtNY3BHYXRld2F5XVtyb3V0ZSAke3RoaXMucm91dGVJZH1dICR7cmVxLm1ldGhvZH0gcmVxdWVzdCAoc2Vzc2lvbnM6ICR7dGhpcy5fc2Vzc2lvbnMuc2l6ZX0pYCk7XG5cblx0XHRpZiAocmVxLm1ldGhvZCA9PT0gJ1BPU1QnKSB7XG5cdFx0XHR2b2lkIHRoaXMuX2hhbmRsZVBvc3QocmVxLCByZXMpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChyZXEubWV0aG9kID09PSAnR0VUJykge1xuXHRcdFx0dGhpcy5faGFuZGxlR2V0KHJlcSwgcmVzKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAocmVxLm1ldGhvZCA9PT0gJ0RFTEVURScpIHtcblx0XHRcdHRoaXMuX2hhbmRsZURlbGV0ZShyZXEsIHJlcyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVzcG9uZEh0dHBFcnJvcihyZXMsIDQwNSwgJ01ldGhvZCBub3QgYWxsb3dlZCcpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9nZ2VyLmluZm8oYFtNY3BHYXRld2F5XVtyb3V0ZSAke3RoaXMucm91dGVJZH1dIERpc3Bvc2luZyByb3V0ZSAoc2Vzc2lvbnM6ICR7dGhpcy5fc2Vzc2lvbnMuc2l6ZX0pYCk7XG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uIG9mIHRoaXMuX3Nlc3Npb25zLnZhbHVlcygpKSB7XG5cdFx0XHRzZXNzaW9uLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fc2Vzc2lvbnMuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVEZWxldGUocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gdGhpcy5fZ2V0U2Vzc2lvbklkKHJlcSk7XG5cdFx0aWYgKCFzZXNzaW9uSWQpIHtcblx0XHRcdHRoaXMuX3Jlc3BvbmRIdHRwRXJyb3IocmVzLCA0MDAsICdNaXNzaW5nIE1jcC1TZXNzaW9uLUlkIGhlYWRlcicpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHRoaXMuX3Jlc3BvbmRIdHRwRXJyb3IocmVzLCA0MDQsICdTZXNzaW9uIG5vdCBmb3VuZCcpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ2dlci5pbmZvKGBbTWNwR2F0ZXdheV1bcm91dGUgJHt0aGlzLnJvdXRlSWR9XSBEZWxldGluZyBzZXNzaW9uICR7c2Vzc2lvbklkfWApO1xuXHRcdHNlc3Npb24uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3Nlc3Npb25zLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdHJlcy53cml0ZUhlYWQoMjA0KTtcblx0XHRyZXMuZW5kKCk7XG5cdH1cblxuXHRwcml2YXRlIF9oYW5kbGVHZXQocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gdGhpcy5fZ2V0U2Vzc2lvbklkKHJlcSk7XG5cdFx0aWYgKCFzZXNzaW9uSWQpIHtcblx0XHRcdHRoaXMuX3Jlc3BvbmRIdHRwRXJyb3IocmVzLCA0MDAsICdNaXNzaW5nIE1jcC1TZXNzaW9uLUlkIGhlYWRlcicpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHRoaXMuX3Jlc3BvbmRIdHRwRXJyb3IocmVzLCA0MDQsICdTZXNzaW9uIG5vdCBmb3VuZCcpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ2dlci5pbmZvKGBbTWNwR2F0ZXdheV1bcm91dGUgJHt0aGlzLnJvdXRlSWR9XSBTU0UgY29ubmVjdGlvbiByZXF1ZXN0ZWQgZm9yIHNlc3Npb24gJHtzZXNzaW9uSWR9YCk7XG5cdFx0c2Vzc2lvbi5hdHRhY2hTc2VDbGllbnQocmVxLCByZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlUG9zdChyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCByZXM6IGh0dHAuU2VydmVyUmVzcG9uc2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBib2R5ID0gYXdhaXQgdGhpcy5fcmVhZFJlcXVlc3RCb2R5KHJlcSk7XG5cdFx0aWYgKGJvZHkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fcmVzcG9uZEh0dHBFcnJvcihyZXMsIDQxMywgJ1BheWxvYWQgdG9vIGxhcmdlJyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nZ2VyLmRlYnVnKGBbTWNwR2F0ZXdheV1bcm91dGUgJHt0aGlzLnJvdXRlSWR9XSBIYW5kbGluZyBQT1NUYCk7XG5cblx0XHRsZXQgbWVzc2FnZTogSnNvblJwY01lc3NhZ2UgfCBKc29uUnBjTWVzc2FnZVtdO1xuXHRcdHRyeSB7XG5cdFx0XHRtZXNzYWdlID0gSlNPTi5wYXJzZShib2R5KSBhcyBKc29uUnBjTWVzc2FnZSB8IEpzb25ScGNNZXNzYWdlW107XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ2dlci53YXJuKGBbTWNwR2F0ZXdheV1bcm91dGUgJHt0aGlzLnJvdXRlSWR9XSBKU09OIHBhcnNlIGVycm9yOiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHRcdHJlcy53cml0ZUhlYWQoNDAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG5cdFx0XHRyZXMuZW5kKEpTT04uc3RyaW5naWZ5KEpzb25ScGNQcm90b2NvbC5jcmVhdGVQYXJzZUVycm9yKCdQYXJzZSBlcnJvcicsIGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKSkpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBoZWFkZXJTZXNzaW9uSWQgPSB0aGlzLl9nZXRTZXNzaW9uSWQocmVxKTtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fcmVzb2x2ZVNlc3Npb25Gb3JQb3N0KGhlYWRlclNlc3Npb25JZCwgbWVzc2FnZSwgcmVzKTtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2VzID0gYXdhaXQgc2Vzc2lvbi5oYW5kbGVJbmNvbWluZyhtZXNzYWdlKTtcblxuXHRcdFx0Y29uc3QgaGVhZGVyczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcblx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0J01jcC1TZXNzaW9uLUlkJzogc2Vzc2lvbi5pZCxcblx0XHRcdH07XG5cblx0XHRcdGlmIChyZXNwb25zZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ2dlci5kZWJ1ZyhgW01jcEdhdGV3YXldW3JvdXRlICR7dGhpcy5yb3V0ZUlkfV0gUE9TVCByZXNwb25zZTogMjAyIChubyBjb250ZW50KWApO1xuXHRcdFx0XHRyZXMud3JpdGVIZWFkKDIwMiwgaGVhZGVycyk7XG5cdFx0XHRcdHJlcy5lbmQoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXNwb25zZUJvZHkgPSBKU09OLnN0cmluZ2lmeShBcnJheS5pc0FycmF5KG1lc3NhZ2UpID8gcmVzcG9uc2VzIDogcmVzcG9uc2VzWzBdKTtcblx0XHRcdHRoaXMuX2xvZ2dlci5kZWJ1ZyhgW01jcEdhdGV3YXldW3JvdXRlICR7dGhpcy5yb3V0ZUlkfV0gUE9TVCByZXNwb25zZTogMjAwLCBib2R5OiAke3Jlc3BvbnNlQm9keX1gKTtcblx0XHRcdHJlcy53cml0ZUhlYWQoMjAwLCBoZWFkZXJzKTtcblx0XHRcdHJlcy5lbmQocmVzcG9uc2VCb2R5KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nZ2VyLmVycm9yKCdbTWNwR2F0ZXdheVNlcnZpY2VdIEZhaWxlZCBoYW5kbGluZyBnYXRld2F5IHJlcXVlc3QnLCBlcnJvcik7XG5cdFx0XHR0aGlzLl9yZXNwb25kSHR0cEVycm9yKHJlcywgNTAwLCAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVzb2x2ZVNlc3Npb25Gb3JQb3N0KGhlYWRlclNlc3Npb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBtZXNzYWdlOiBKc29uUnBjTWVzc2FnZSB8IEpzb25ScGNNZXNzYWdlW10sIHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSk6IE1jcEdhdGV3YXlTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoaGVhZGVyU2Vzc2lvbklkKSB7XG5cdFx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3Nlc3Npb25zLmdldChoZWFkZXJTZXNzaW9uSWQpO1xuXHRcdFx0aWYgKCFleGlzdGluZykge1xuXHRcdFx0XHR0aGlzLl9sb2dnZXIud2FybihgW01jcEdhdGV3YXldW3JvdXRlICR7dGhpcy5yb3V0ZUlkfV0gU2Vzc2lvbiBub3QgZm91bmQ6ICR7aGVhZGVyU2Vzc2lvbklkfWApO1xuXHRcdFx0XHR0aGlzLl9yZXNwb25kSHR0cEVycm9yKHJlcywgNDA0LCAnU2Vzc2lvbiBub3QgZm91bmQnKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHRcdH1cblxuXHRcdGlmICghaXNJbml0aWFsaXplTWVzc2FnZShtZXNzYWdlKSkge1xuXHRcdFx0dGhpcy5fcmVzcG9uZEh0dHBFcnJvcihyZXMsIDQwMCwgJ01pc3NpbmcgTWNwLVNlc3Npb24tSWQgaGVhZGVyJyk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdHRoaXMuX2xvZ2dlci5pbmZvKGBbTWNwR2F0ZXdheV1bcm91dGUgJHt0aGlzLnJvdXRlSWR9XSBDcmVhdGluZyBuZXcgc2Vzc2lvbiAke3Nlc3Npb25JZH1gKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbmV3IE1jcEdhdGV3YXlTZXNzaW9uKHNlc3Npb25JZCwgdGhpcy5fbG9nZ2VyLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9zZXNzaW9ucy5kZWxldGUoc2Vzc2lvbklkKTtcblx0XHR9LCB0aGlzLl9zZXJ2ZXJJbnZva2VyKTtcblx0XHR0aGlzLl9zZXNzaW9ucy5zZXQoc2Vzc2lvbklkLCBzZXNzaW9uKTtcblx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0fVxuXG5cdHByaXZhdGUgX3Jlc3BvbmRIdHRwRXJyb3IocmVzOiBodHRwLlNlcnZlclJlc3BvbnNlLCBzdGF0dXNDb2RlOiBudW1iZXIsIGVycm9yOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2dnZXIuZGVidWcoYFtNY3BHYXRld2F5XVtyb3V0ZSAke3RoaXMucm91dGVJZH1dIEhUVFAgZXJyb3IgcmVzcG9uc2U6ICR7c3RhdHVzQ29kZX0gJHtlcnJvcn1gKTtcblx0XHRyZXMud3JpdGVIZWFkKHN0YXR1c0NvZGUsIHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9KTtcblx0XHRyZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsganNvbnJwYzogJzIuMCcsIGVycm9yOiB7IGNvZGU6IHN0YXR1c0NvZGUsIG1lc3NhZ2U6IGVycm9yIH0gfSBzYXRpc2ZpZXMgSnNvblJwY01lc3NhZ2UpKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFNlc3Npb25JZChyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB2YWx1ZSA9IHJlcS5oZWFkZXJzW01jcEdhdGV3YXlSb3V0ZS5TZXNzaW9uSGVhZGVyTmFtZV07XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWVbMF07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVhZFJlcXVlc3RCb2R5KHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGNodW5rczogQnVmZmVyW10gPSBbXTtcblx0XHRsZXQgc2l6ZSA9IDA7XG5cdFx0Y29uc3QgbWF4Qnl0ZXMgPSAxMDI0ICogMTAyNDtcblxuXHRcdGZvciBhd2FpdCAoY29uc3QgY2h1bmsgb2YgcmVxKSB7XG5cdFx0XHRjb25zdCBhc0J1ZmZlciA9IEJ1ZmZlci5pc0J1ZmZlcihjaHVuaykgPyBjaHVuayA6IEJ1ZmZlci5mcm9tKGNodW5rKTtcblx0XHRcdHNpemUgKz0gYXNCdWZmZXIuYnl0ZUxlbmd0aDtcblx0XHRcdGlmIChzaXplID4gbWF4Qnl0ZXMpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNodW5rcy5wdXNoKGFzQnVmZmVyKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gQnVmZmVyLmNvbmNhdChjaHVua3MpLnRvU3RyaW5nKCd1dGY4Jyk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQXlCLHVCQUF1QjtBQUNoRCxTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFrQixzQkFBc0I7QUFFeEMsU0FBUyxxQkFBcUIseUJBQXlCO0FBUWhELElBQU0sb0JBQU4sY0FBZ0MsV0FBeUM7QUFBQSxFQWtCL0UsWUFDaUIsZUFDZjtB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
