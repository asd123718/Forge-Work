import { Duplex } from "stream";
import { findFreePortFaster } from "../../../base/node/ports.js";
import { NodeSocket } from "../../../base/parts/ipc/node/ipc.net.js";
import { SocketCloseEventType } from "../../../base/parts/ipc/common/ipc.net.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { Limiter } from "../../../base/common/async.js";
import { Disposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { generateSelfSignedCert } from "./selfSignedCert.js";
const MAX_CONCURRENT_TUNNEL_CONNECTS = 6;
class TunnelProxy extends Disposable {
  constructor(_connectTunnel, _logService) {
    super();
    this._connectTunnel = _connectTunnel;
    this._logService = _logService;
    this._localPort = 0;
    /**
     * Sockets we took over from the HTTPS server via CONNECT. Once the
     * CONNECT handler runs the server no longer tracks them, so
     * `server.close()` and `server.closeAllConnections()` won't terminate
     * them — we have to destroy them ourselves on dispose to release the
     * listening port promptly.
     */
    this._connectSockets = /* @__PURE__ */ new Set();
    /**
     * The remote (tunnel) side of every active bridge — both CONNECT
     * tunnels and pooled plain-HTTP sockets. We destroy these explicitly
     * and synchronously on dispose rather than relying on the local
     * socket's async `'close'` to propagate `end()`; during shared-process
     * teardown the event loop may not get another turn to fire that
     * listener, which would leave the upstream tunnel socket dangling.
     */
    this._remoteSockets = /* @__PURE__ */ new Set();
    /**
     * Bounds how many tunnels we create concurrently through the remote
     * agent. Gates the setup (connect + handshake) only; once a tunnel is
     * established the slot is released and data piping proceeds unthrottled.
     */
    this._connectLimiter = this._register(new Limiter(MAX_CONCURRENT_TUNNEL_CONNECTS));
  }
  get localPort() {
    return this._localPort;
  }
  async start() {
    const crypto = await import("crypto");
    const http = await import("http");
    const https = await import("https");
    const username = crypto.randomBytes(16).toString("hex");
    const password = crypto.randomBytes(32).toString("hex");
    this._credentials = { username, password };
    this._expectedAuthHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
    const { key, cert, fingerprint } = await generateSelfSignedCert();
    this._certFingerprint = fingerprint;
    this._http = http;
    this._tunnelAgent = this._createTunnelAgent();
    const server = https.createServer({ key, cert }, (req, res) => this._onRequest(req, res));
    server.on("connect", (req, socket, head) => this._onConnect(req, socket, head));
    server.on("error", (err) => {
      this._logService.error("[TunnelProxy] Server error:", err);
    });
    this._server = server;
    const port = await findFreePortFaster(0, 2, 1e3, "127.0.0.1");
    server.listen(port, "127.0.0.1");
    await new Promise((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    this._localPort = address.port;
    this._logService.info(`[TunnelProxy] Listening on https://127.0.0.1:${this._localPort}`);
    return {
      url: `https://127.0.0.1:${this._localPort}`,
      host: "127.0.0.1",
      port: this._localPort,
      credentials: this._credentials,
      certFingerprint: this._certFingerprint
    };
  }
  dispose() {
    for (const socket of this._connectSockets) {
      socket.destroy();
    }
    this._connectSockets.clear();
    for (const socket of this._remoteSockets) {
      socket.destroy();
    }
    this._remoteSockets.clear();
    this._tunnelAgent?.destroy();
    this._server?.closeAllConnections();
    this._server?.close();
    super.dispose();
  }
  /**
   * Verify the `Proxy-Authorization` header against our credentials.
   * Returns `true` if the request is authorized.
   */
  _checkAuth(authHeader) {
    return authHeader === this._expectedAuthHeader;
  }
  /**
   * Create an `http.Agent` that pools tunnel sockets by target
   * host:port. Node calls `createConnection` only when no pooled socket
   * is available for the target; otherwise it reuses an existing one.
   */
  _createTunnelAgent() {
    if (!this._http) {
      throw new Error("HTTP module not initialized");
    }
    const agent = new this._http.Agent({ keepAlive: true });
    agent.createConnection = (options, oncreate) => {
      const host = options.hostname || options.host || "";
      const port = Number(options.port) || 80;
      this._createTunnelSocket(host, port).then((socket) => oncreate?.(null, socket)).catch((err) => oncreate?.(err, null));
    };
    return agent;
  }
  /**
   * Drop every pooled keep-alive tunnel socket by recreating the
   * agent. Called when the upstream tunnel endpoint changes: the pooled
   * sockets all dial the now-stale endpoint, so they would be reset en
   * masse once it goes away. Recreating the agent closes the idle ones
   * gracefully and forces subsequent requests to dial the new endpoint.
   */
  drainConnectionPool() {
    if (!this._tunnelAgent) {
      return;
    }
    const oldAgent = this._tunnelAgent;
    this._tunnelAgent = this._createTunnelAgent();
    oldAgent?.destroy();
    this._logService.trace("[TunnelProxy] Upstream endpoint changed; drained pooled tunnel sockets");
  }
  /**
   * Handle HTTP CONNECT requests (used for HTTPS tunneling).
   * Parses `host:port` from the request URL, establishes a tunnel
   * through the remote agent, and pipes the sockets together.
   */
  async _onConnect(req, socket, head) {
    this._connectSockets.add(socket);
    socket.on("close", () => this._connectSockets.delete(socket));
    if (!this._checkAuth(req.headers["proxy-authorization"])) {
      socket.write(
        'HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="TunnelProxy"\r\n\r\n'
      );
      socket.end();
      return;
    }
    const { host, port } = this._parseHostPort(req.url ?? "", 443);
    if (!host) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.end();
      return;
    }
    this._logService.trace(`[TunnelProxy] CONNECT ${host}:${port}`);
    try {
      socket.pause();
      const protocol = await this._connectLimiter.queue(() => this._connectTunnel(host, port));
      const { stream: remoteSocket, leftover } = this._takeRemoteStream(protocol);
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (leftover.byteLength > 0) {
        socket.write(leftover.buffer);
      }
      if (head.length > 0) {
        remoteSocket.write(head);
      }
      this._bridgeSockets(socket, remoteSocket);
    } catch (err) {
      this._logService.error(`[TunnelProxy] Failed to tunnel to ${host}:${port}:`, err);
      socket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      socket.end();
    }
  }
  /**
   * Handle plain HTTP requests (GET, POST, etc. with absolute URLs).
   *
   * Chromium sends proxied HTTP requests with absolute-form URLs
   * (e.g. `GET http://example.com/page HTTP/1.1`) and reuses keep-alive
   * connections to the proxy for requests to **different** hosts.
   *
   * Each request is forwarded via `http.request` using a shared
   * `http.Agent` that pools tunnel sockets by host:port. The agent
   * calls `_createTunnelSocket` only when no pooled socket is available;
   * otherwise it reuses an existing tunnel connection.
   */
  async _onRequest(req, res) {
    if (!this._checkAuth(req.headers["proxy-authorization"])) {
      res.writeHead(407, { "Proxy-Authenticate": 'Basic realm="TunnelProxy"' });
      res.end();
      return;
    }
    let parsed;
    try {
      parsed = new URL(req.url ?? "");
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (parsed.protocol !== "http:") {
      this._logService.warn(`[TunnelProxy] Rejecting non-HTTP forwarded request: ${req.method} ${req.url}`);
      res.writeHead(400);
      res.end();
      return;
    }
    const host = parsed.hostname;
    const port = parseInt(parsed.port, 10) || 80;
    if (!host) {
      res.writeHead(400);
      res.end();
      return;
    }
    this._logService.trace(`[TunnelProxy] ${req.method} ${host}:${port}${parsed.pathname}`);
    try {
      const http = await import("http");
      const path = parsed.pathname + parsed.search;
      const headers = { ...req.headers };
      const connectionTokens = (headers["connection"] ?? "").toString().split(",").map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0);
      for (const token of connectionTokens) {
        delete headers[token];
      }
      delete headers["connection"];
      delete headers["keep-alive"];
      delete headers["proxy-authorization"];
      delete headers["proxy-connection"];
      delete headers["te"];
      delete headers["transfer-encoding"];
      delete headers["upgrade"];
      const proxyReq = http.request({
        agent: this._tunnelAgent,
        hostname: host,
        port,
        path,
        method: req.method,
        headers
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });
      proxyReq.on("error", (err) => {
        this._logService.error(`[TunnelProxy] Proxy request error for ${host}:${port}:`, err);
        res.destroy();
      });
      req.pipe(proxyReq);
    } catch (err) {
      this._logService.error(`[TunnelProxy] Failed to tunnel to ${host}:${port}:`, err);
      res.destroy();
    }
  }
  /**
   * Create a `net.Socket`-compatible stream backed by a remote agent
   * tunnel. Called by the `http.Agent` when it needs a new connection
   * to a given host:port (i.e. no pooled socket is available).
   */
  async _createTunnelSocket(host, port) {
    const protocol = await this._connectLimiter.queue(() => this._connectTunnel(host, port));
    const { stream: tunnelStream, leftover } = this._takeRemoteStream(protocol);
    this._trackRemoteSocket(tunnelStream);
    if (leftover.byteLength > 0) {
      tunnelStream.unshift(leftover.buffer);
    }
    return tunnelStream;
  }
  /**
   * Take ownership of a freshly-connected tunnel's transport as a Node
   * {@link Duplex} stream, together with any bytes the protocol already
   * buffered during the handshake (the caller routes that leftover to the
   * appropriate side).
   *
   * Two transports occur in practice:
   * - {@link NodeSocket} (classic/websocket server): unwrap the raw
   *   `net.Socket` so we can rely on Node's native stream backpressure (via
   *   `pipe()` and the keep-alive `http.Agent`).
   * - a generic {@link ISocket} (managed / exec-server connection): there is
   *   no `net.Socket` underneath, so adapt the message-passing socket to a
   *   {@link Duplex} ({@link RemoteSocketStream}).
   */
  _takeRemoteStream(protocol) {
    const remoteSocket = protocol.getSocket();
    if (remoteSocket instanceof NodeSocket) {
      const socket = remoteSocket.socket;
      const leftover2 = protocol.readEntireBuffer();
      remoteSocket.dispose(false);
      protocol.dispose();
      return { stream: socket, leftover: leftover2 };
    }
    const leftover = protocol.readEntireBuffer();
    protocol.dispose();
    return { stream: new RemoteSocketStream(remoteSocket), leftover };
  }
  /**
   * Parse a `host:port` string. Falls back to `defaultPort` when the
   * port component is missing. Returns an empty host when the address
   * is empty or the port is outside the valid TCP range (1-65535), per
   * RFC 9110 section 9.3.6 ("A server MUST reject a CONNECT request that
   * targets an empty or invalid port number").
   */
  _parseHostPort(address, defaultPort) {
    let host;
    let port;
    const bracketMatch = /^\[(?<host>[^\]]+)\]:(?<port>\d+)$/.exec(address);
    if (bracketMatch?.groups) {
      host = bracketMatch.groups["host"];
      port = parseInt(bracketMatch.groups["port"], 10);
    } else {
      const bracketOnly = /^\[(?<host>[^\]]+)\]$/.exec(address);
      if (bracketOnly?.groups) {
        host = bracketOnly.groups["host"];
        port = defaultPort;
      } else {
        const lastColon = address.lastIndexOf(":");
        if (lastColon === -1) {
          host = address;
          port = defaultPort;
        } else {
          const maybePort = parseInt(address.substring(lastColon + 1), 10);
          if (isNaN(maybePort)) {
            host = address;
            port = defaultPort;
          } else {
            host = address.substring(0, lastColon);
            port = maybePort;
          }
        }
      }
    }
    if (port < 1 || port > 65535) {
      return { host: "", port: 0 };
    }
    return { host, port };
  }
  _bridgeSockets(localSocket, remoteSocket) {
    this._trackRemoteSocket(remoteSocket);
    remoteSocket.on("end", () => localSocket.end());
    remoteSocket.on("close", () => localSocket.end());
    remoteSocket.on("error", () => localSocket.destroy());
    localSocket.on("end", () => remoteSocket.end());
    localSocket.on("close", () => remoteSocket.end());
    localSocket.on("error", () => remoteSocket.destroy());
    remoteSocket.pipe(localSocket);
    localSocket.pipe(remoteSocket);
  }
  /**
   * Track a remote tunnel socket so {@link dispose} can tear it down
   * synchronously. The socket auto-removes itself once closed.
   */
  _trackRemoteSocket(socket) {
    this._remoteSockets.add(socket);
    socket.on("error", () => socket.destroy());
    socket.on("close", () => this._remoteSockets.delete(socket));
  }
}
class RemoteSocketStream extends Duplex {
  constructor(_socket) {
    super();
    this._socket = _socket;
    this._disposables = new DisposableStore();
    this._disposables.add(this._socket.onData((data) => this.push(data.buffer)));
    this._disposables.add(this._socket.onEnd(() => this.push(null)));
    this._disposables.add(this._socket.onClose((e) => {
      this.destroy(e?.type === SocketCloseEventType.NodeSocketCloseEvent ? e.error : void 0);
    }));
  }
  // The keep-alive http.Agent pools tunnel sockets and calls net.Socket-only
  // transport knobs on them (setKeepAlive/ref/unref, and setTimeout/setNoDelay
  // while wiring a request) when parking or reusing a connection. A generic
  // ISocket has no such knobs, so expose no-op shims to keep the agent happy;
  // otherwise freeing a pooled managed socket throws (e.g.
  // "socket.setKeepAlive is not a function").
  setKeepAlive() {
    return this;
  }
  setNoDelay() {
    return this;
  }
  setTimeout() {
    return this;
  }
  ref() {
    return this;
  }
  unref() {
    return this;
  }
  _read() {
  }
  _write(chunk, _encoding, callback) {
    this._socket.write(VSBuffer.wrap(chunk));
    this._socket.drain().then(() => callback(), (err) => callback(err));
  }
  _final(callback) {
    this._socket.end();
    callback();
  }
  _destroy(error, callback) {
    this._disposables.dispose();
    this._socket.dispose();
    callback(error);
  }
}
export {
  TunnelProxy
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdHVubmVsXFxub2RlXFx0dW5uZWxQcm94eS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5ldCBmcm9tICduZXQnO1xuaW1wb3J0IHsgRHVwbGV4IH0gZnJvbSAnc3RyZWFtJztcbmltcG9ydCB0eXBlICogYXMgaHR0cCBmcm9tICdodHRwJztcbmltcG9ydCB0eXBlICogYXMgaHR0cHMgZnJvbSAnaHR0cHMnO1xuXG5pbXBvcnQgeyBmaW5kRnJlZVBvcnRGYXN0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvcG9ydHMuanMnO1xuaW1wb3J0IHsgTm9kZVNvY2tldCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL25vZGUvaXBjLm5ldC5qcyc7XG5pbXBvcnQgeyBJU29ja2V0LCBTb2NrZXRDbG9zZUV2ZW50VHlwZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMubmV0LmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IExpbWl0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVHVubmVsUHJveHlJbmZvIH0gZnJvbSAnLi4vY29tbW9uL3R1bm5lbFByb3h5LmpzJztcbmltcG9ydCB7IGdlbmVyYXRlU2VsZlNpZ25lZENlcnQgfSBmcm9tICcuL3NlbGZTaWduZWRDZXJ0LmpzJztcblxuLyoqXG4gKiBNYXhpbXVtIG51bWJlciBvZiB0dW5uZWwgY29ubmVjdGlvbnMgd2UgZXN0YWJsaXNoIHRocm91Z2ggdGhlIHJlbW90ZVxuICogYWdlbnQgYXQgdGhlIHNhbWUgdGltZS4gRWFjaCBuZXcgdHVubmVsIGRpYWxzIHRoZSBsb29wYmFjayBmb3J3YXJkZXIsXG4gKiB3aGljaCBvcGVucyBhIGZyZXNoIG11bHRpcGxleGVkIGNoYW5uZWwgdG8gdGhlIHJlbW90ZSAoY3J5cHRvICtcbiAqIHJvdW5kLXRyaXBzKSBvbiBhIHNpbmdsZSBldmVudCBsb29wLiBBbiBhZC1oZWF2eSBwYWdlIGZhbnMgb3V0IGRvemVuc1xuICogb2Ygc2ltdWx0YW5lb3VzIENPTk5FQ1RzIHRvIGRpc3RpbmN0IGhvc3RzOyBsZWZ0IHVuYm91bmRlZCwgdGhhdFxuICogc3RhbXBlZGUgb3ZlcmZsb3dzIHRoZSBmb3J3YXJkZXIncyBhY2NlcHQgYmFja2xvZyBhbmQgaXQgc3RhcnRzXG4gKiByZWZ1c2luZyAoRUNPTk5SRUZVU0VEKSBhbmQgcmVzZXR0aW5nIChFQ09OTlJFU0VUKSBjb25uZWN0aW9ucy4gVGhpc1xuICogY2FwIHNtb290aHMgdGhlIGJ1cnN0IHRvIGEgcmF0ZSB0aGUgZm9yd2FyZGVyIGNhbiBhYnNvcmI7IGV4Y2Vzc1xuICogcmVxdWVzdHMgcXVldWUgcmF0aGVyIHRoYW4gZmFpbC5cbiAqL1xuY29uc3QgTUFYX0NPTkNVUlJFTlRfVFVOTkVMX0NPTk5FQ1RTID0gNjtcblxuLyoqXG4gKiBBIGZ1bmN0aW9uIHRoYXQgb3BlbnMgYSBUQ1AgdHVubmVsIHRvIGEgZ2l2ZW4gaG9zdDpwb3J0IHRocm91Z2ggdGhlXG4gKiByZW1vdGUgYWdlbnQuIFJlc29sdmVzIG9ubHkgb25jZSB0aGUgcmVtb3RlIGhhcyBjb25maXJtZWQgdGhlIHRhcmdldCBpc1xuICogcmVhY2hhYmxlICh2aWEgdGhlIHR1bm5lbCBoYW5kc2hha2UpIGFuZCByZWplY3RzIG90aGVyd2lzZS4gUmV0dXJucyBhblxuICogb2JqZWN0IHdpdGggYGdldFNvY2tldCgpYCwgYHJlYWRFbnRpcmVCdWZmZXIoKWAsIGFuZCBgZGlzcG9zZSgpYCBcdTIwMTQgYVxuICogc3Vic2V0IG9mIHtAbGluayBpbXBvcnQoJy4uLy4uL2Jhc2UvcGFydHMvaXBjL2NvbW1vbi9pcGMubmV0LmpzJykuUGVyc2lzdGVudFByb3RvY29sfS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVHVubmVsQ29ubmVjdEZuIHtcblx0KGhvc3Q6IHN0cmluZywgcG9ydDogbnVtYmVyKTogUHJvbWlzZTx7IGdldFNvY2tldCgpOiBJU29ja2V0OyByZWFkRW50aXJlQnVmZmVyKCk6IFZTQnVmZmVyOyBkaXNwb3NlKCk6IHZvaWQgfT47XG59XG5cbi8qKlxuICogQW4gSFRUUFMgcHJveHkgc2VydmVyIHRoYXQgcm91dGVzIFRDUCBjb25uZWN0aW9ucyB0aHJvdWdoIHRoZSByZW1vdGVcbiAqIGFnZW50IHR1bm5lbC5cbiAqXG4gKiBIYW5kbGVzOlxuICogLSAqKkNPTk5FQ1QqKiByZXF1ZXN0cyAodXNlZCBieSBDaHJvbWl1bSBmb3IgSFRUUFMpIFx1MjAxNCBlc3RhYmxpc2hlcyBhXG4gKiAgIHJhdyBUQ1AgdHVubmVsIHRocm91Z2ggdGhlIHJlbW90ZSBhZ2VudC5cbiAqIC0gKipQbGFpbiBIVFRQKiogcmVxdWVzdHMgKEdFVCwgUE9TVCwgZXRjLiB3aXRoIGFic29sdXRlIFVSTHMpIFx1MjAxNFxuICogICBlc3RhYmxpc2hlcyBhIHR1bm5lbCBhbmQgZm9yd2FyZHMgdGhlIHJlcXVlc3QuXG4gKlxuICogVGhlIHNlcnZlciBiaW5kcyBleGNsdXNpdmVseSB0byBgMTI3LjAuMC4xYCBhbmQgaXMgbmV2ZXIgZXhwb3NlZCB0b1xuICogdGhlIG5ldHdvcmsgXHUyMDE0IHRoaXMgaXMgdGhlIHByaW1hcnkgc2VjdXJpdHkgYm91bmRhcnkuIFRoZSBhZGRpdGlvbmFsXG4gKiBsYXllcnMgYmVsb3cgYXJlIGRlZmVuY2UtaW4tZGVwdGg6XG4gKlxuICogLSAqKlRMUyoqIHdpdGggYSBzZWxmLXNpZ25lZCBjZXJ0aWZpY2F0ZSAoZ2VuZXJhdGVkIGluLW1lbW9yeSlcbiAqICAgcHJldmVudHMgb3RoZXIgbG9jYWwgcHJvY2Vzc2VzIGZyb20gcGFzc2l2ZWx5IHNuaWZmaW5nIHRyYWZmaWMuXG4gKiAtICoqQmFzaWMgcHJveHkgYXV0aGVudGljYXRpb24qKiB3aXRoIHJhbmRvbWx5IGdlbmVyYXRlZCBjcmVkZW50aWFsc1xuICogICBwcmV2ZW50cyBvdGhlciBsb2NhbCBwcm9jZXNzZXMgZnJvbSBhY3RpdmVseSB1c2luZyB0aGUgcHJveHkuXG4gKiAtIFRoZSBjZXJ0aWZpY2F0ZSAqKmZpbmdlcnByaW50KiogaXMgcmV0dXJuZWQgZnJvbSB7QGxpbmsgc3RhcnR9IHNvXG4gKiAgIHRoZSBjb25zdW1lcidzIEVsZWN0cm9uIHNlc3Npb24gY2FuIHBpbiBpdC5cbiAqXG4gKiBJZiBjZXJ0aWZpY2F0ZSBnZW5lcmF0aW9uIG9yIHNlcnZlciBzdGFydHVwIGZhaWxzIHRoZSBwcm94eSBzaW1wbHlcbiAqIGRvZXMgbm90IHN0YXJ0IFx1MjAxNCB0aGUgd29yc3Qgb3V0Y29tZSBpcyB0aGF0IHRoZSBicm93c2VyIHZpZXcgZmFsbHNcbiAqIGJhY2sgdG8gbm90IGhhdmluZyByZW1vdGUgbmV0d29yayBhY2Nlc3MuXG4gKi9cbmV4cG9ydCBjbGFzcyBUdW5uZWxQcm94eSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgX3NlcnZlcjogaHR0cHMuU2VydmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9odHRwOiB0eXBlb2YgaHR0cCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfdHVubmVsQWdlbnQ6IGh0dHAuQWdlbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xvY2FsUG9ydDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBfY3JlZGVudGlhbHM6IHsgdXNlcm5hbWU6IHN0cmluZzsgcGFzc3dvcmQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9leHBlY3RlZEF1dGhIZWFkZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY2VydEZpbmdlcnByaW50OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFNvY2tldHMgd2UgdG9vayBvdmVyIGZyb20gdGhlIEhUVFBTIHNlcnZlciB2aWEgQ09OTkVDVC4gT25jZSB0aGVcblx0ICogQ09OTkVDVCBoYW5kbGVyIHJ1bnMgdGhlIHNlcnZlciBubyBsb25nZXIgdHJhY2tzIHRoZW0sIHNvXG5cdCAqIGBzZXJ2ZXIuY2xvc2UoKWAgYW5kIGBzZXJ2ZXIuY2xvc2VBbGxDb25uZWN0aW9ucygpYCB3b24ndCB0ZXJtaW5hdGVcblx0ICogdGhlbSBcdTIwMTQgd2UgaGF2ZSB0byBkZXN0cm95IHRoZW0gb3Vyc2VsdmVzIG9uIGRpc3Bvc2UgdG8gcmVsZWFzZSB0aGVcblx0ICogbGlzdGVuaW5nIHBvcnQgcHJvbXB0bHkuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25uZWN0U29ja2V0cyA9IG5ldyBTZXQ8bmV0LlNvY2tldD4oKTtcblxuXHQvKipcblx0ICogVGhlIHJlbW90ZSAodHVubmVsKSBzaWRlIG9mIGV2ZXJ5IGFjdGl2ZSBicmlkZ2UgXHUyMDE0IGJvdGggQ09OTkVDVFxuXHQgKiB0dW5uZWxzIGFuZCBwb29sZWQgcGxhaW4tSFRUUCBzb2NrZXRzLiBXZSBkZXN0cm95IHRoZXNlIGV4cGxpY2l0bHlcblx0ICogYW5kIHN5bmNocm9ub3VzbHkgb24gZGlzcG9zZSByYXRoZXIgdGhhbiByZWx5aW5nIG9uIHRoZSBsb2NhbFxuXHQgKiBzb2NrZXQncyBhc3luYyBgJ2Nsb3NlJ2AgdG8gcHJvcGFnYXRlIGBlbmQoKWA7IGR1cmluZyBzaGFyZWQtcHJvY2Vzc1xuXHQgKiB0ZWFyZG93biB0aGUgZXZlbnQgbG9vcCBtYXkgbm90IGdldCBhbm90aGVyIHR1cm4gdG8gZmlyZSB0aGF0XG5cdCAqIGxpc3RlbmVyLCB3aGljaCB3b3VsZCBsZWF2ZSB0aGUgdXBzdHJlYW0gdHVubmVsIHNvY2tldCBkYW5nbGluZy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlbW90ZVNvY2tldHMgPSBuZXcgU2V0PER1cGxleD4oKTtcblxuXHQvKipcblx0ICogQm91bmRzIGhvdyBtYW55IHR1bm5lbHMgd2UgY3JlYXRlIGNvbmN1cnJlbnRseSB0aHJvdWdoIHRoZSByZW1vdGVcblx0ICogYWdlbnQuIEdhdGVzIHRoZSBzZXR1cCAoY29ubmVjdCArIGhhbmRzaGFrZSkgb25seTsgb25jZSBhIHR1bm5lbCBpc1xuXHQgKiBlc3RhYmxpc2hlZCB0aGUgc2xvdCBpcyByZWxlYXNlZCBhbmQgZGF0YSBwaXBpbmcgcHJvY2VlZHMgdW50aHJvdHRsZWQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb25uZWN0TGltaXRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBMaW1pdGVyPEF3YWl0ZWQ8UmV0dXJuVHlwZTxJVHVubmVsQ29ubmVjdEZuPj4+KE1BWF9DT05DVVJSRU5UX1RVTk5FTF9DT05ORUNUUykpO1xuXG5cdGdldCBsb2NhbFBvcnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fbG9jYWxQb3J0O1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29ubmVjdFR1bm5lbDogSVR1bm5lbENvbm5lY3RGbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFzeW5jIHN0YXJ0KCk6IFByb21pc2U8SVR1bm5lbFByb3h5SW5mbz4ge1xuXHRcdGNvbnN0IGNyeXB0byA9IGF3YWl0IGltcG9ydCgnY3J5cHRvJyk7XG5cdFx0Y29uc3QgaHR0cCA9IGF3YWl0IGltcG9ydCgnaHR0cCcpO1xuXHRcdGNvbnN0IGh0dHBzID0gYXdhaXQgaW1wb3J0KCdodHRwcycpO1xuXG5cdFx0Ly8gR2VuZXJhdGUgcmFuZG9tIGNyZWRlbnRpYWxzXG5cdFx0Y29uc3QgdXNlcm5hbWUgPSBjcnlwdG8ucmFuZG9tQnl0ZXMoMTYpLnRvU3RyaW5nKCdoZXgnKTtcblx0XHRjb25zdCBwYXNzd29yZCA9IGNyeXB0by5yYW5kb21CeXRlcygzMikudG9TdHJpbmcoJ2hleCcpO1xuXHRcdHRoaXMuX2NyZWRlbnRpYWxzID0geyB1c2VybmFtZSwgcGFzc3dvcmQgfTtcblx0XHR0aGlzLl9leHBlY3RlZEF1dGhIZWFkZXIgPSAnQmFzaWMgJyArIEJ1ZmZlci5mcm9tKGAke3VzZXJuYW1lfToke3Bhc3N3b3JkfWApLnRvU3RyaW5nKCdiYXNlNjQnKTtcblxuXHRcdC8vIEdlbmVyYXRlIGEgc2VsZi1zaWduZWQgY2VydGlmaWNhdGUgaW4gbWVtb3J5XG5cdFx0Y29uc3QgeyBrZXksIGNlcnQsIGZpbmdlcnByaW50IH0gPSBhd2FpdCBnZW5lcmF0ZVNlbGZTaWduZWRDZXJ0KCk7XG5cdFx0dGhpcy5fY2VydEZpbmdlcnByaW50ID0gZmluZ2VycHJpbnQ7XG5cblx0XHQvLyBDcmVhdGUgYW4gYWdlbnQgdGhhdCBwb29scyB0dW5uZWwgc29ja2V0cyBieSBob3N0OnBvcnQuXG5cdFx0dGhpcy5faHR0cCA9IGh0dHA7XG5cdFx0dGhpcy5fdHVubmVsQWdlbnQgPSB0aGlzLl9jcmVhdGVUdW5uZWxBZ2VudCgpO1xuXG5cdFx0Ly8gSFRUUFMgc2VydmVyOiBoYW5kbGVzIHBsYWluIEhUVFAgcmVxdWVzdHMgKGFic29sdXRlLWZvcm0gVVJMcyBmcm9tXG5cdFx0Ly8gQ2hyb21pdW0gd2hlbiBjb25maWd1cmVkIGFzIGEgcHJveHkpIGFuZCBDT05ORUNUIHR1bm5lbHMgZm9yIEhUVFBTLlxuXHRcdGNvbnN0IHNlcnZlciA9IGh0dHBzLmNyZWF0ZVNlcnZlcih7IGtleSwgY2VydCB9LCAocmVxLCByZXMpID0+IHRoaXMuX29uUmVxdWVzdChyZXEsIHJlcykpO1xuXHRcdHNlcnZlci5vbignY29ubmVjdCcsIChyZXEsIHNvY2tldCwgaGVhZCkgPT4gdGhpcy5fb25Db25uZWN0KHJlcSwgc29ja2V0IGFzIG5ldC5Tb2NrZXQsIGhlYWQpKTtcblx0XHRzZXJ2ZXIub24oJ2Vycm9yJywgZXJyID0+IHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tUdW5uZWxQcm94eV0gU2VydmVyIGVycm9yOicsIGVycik7XG5cdFx0fSk7XG5cdFx0dGhpcy5fc2VydmVyID0gc2VydmVyO1xuXG5cdFx0Y29uc3QgcG9ydCA9IGF3YWl0IGZpbmRGcmVlUG9ydEZhc3RlcigwLCAyLCAxMDAwLCAnMTI3LjAuMC4xJyk7XG5cdFx0c2VydmVyLmxpc3Rlbihwb3J0LCAnMTI3LjAuMC4xJyk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0c2VydmVyLm9uY2UoJ2xpc3RlbmluZycsIHJlc29sdmUpO1xuXHRcdFx0c2VydmVyLm9uY2UoJ2Vycm9yJywgcmVqZWN0KTtcblx0XHR9KTtcblx0XHRjb25zdCBhZGRyZXNzID0gc2VydmVyLmFkZHJlc3MoKSBhcyBuZXQuQWRkcmVzc0luZm87XG5cdFx0dGhpcy5fbG9jYWxQb3J0ID0gYWRkcmVzcy5wb3J0O1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW1R1bm5lbFByb3h5XSBMaXN0ZW5pbmcgb24gaHR0cHM6Ly8xMjcuMC4wLjE6JHt0aGlzLl9sb2NhbFBvcnR9YCk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dXJsOiBgaHR0cHM6Ly8xMjcuMC4wLjE6JHt0aGlzLl9sb2NhbFBvcnR9YCxcblx0XHRcdGhvc3Q6ICcxMjcuMC4wLjEnLFxuXHRcdFx0cG9ydDogdGhpcy5fbG9jYWxQb3J0LFxuXHRcdFx0Y3JlZGVudGlhbHM6IHRoaXMuX2NyZWRlbnRpYWxzLFxuXHRcdFx0Y2VydEZpbmdlcnByaW50OiB0aGlzLl9jZXJ0RmluZ2VycHJpbnQsXG5cdFx0fTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0Ly8gQW55IHR1bm5lbHMgc3RpbGwgcXVldWVkIGJlaGluZCB0aGUgbGltaXRlciBhcmUgYWJhbmRvbmVkIGhlcmU6XG5cdFx0Ly8gZGlzcG9zaW5nIHRoZSBsaW1pdGVyIGRyb3BzIHRoZSBvdXRzdGFuZGluZyBxdWV1ZSB3aXRob3V0IHNldHRsaW5nXG5cdFx0Ly8gdGhvc2UgcHJvbWlzZXMsIHNvIHRoZWlyIGF3YWl0aW5nIGBfb25Db25uZWN0YC9gX2NyZWF0ZVR1bm5lbFNvY2tldGBcblx0XHQvLyBuZXZlciByZXN1bWVzLiBUaGF0J3MgZmluZSBcdTIwMTQgd2UgZGVzdHJveSBldmVyeSBzb2NrZXQgYmVsb3csIGFuZCB0aGVcblx0XHQvLyBsb2NhbCBzb2NrZXRzIHRob3NlIGhhbmRsZXJzIHdvdWxkIGhhdmUgc2VydmVkIGFyZSB0b3JuIGRvd24gdG9vLCBzb1xuXHRcdC8vIG5vdGhpbmcgaXMgbGVmdCB3YWl0aW5nIG9uIGEgdHVubmVsIHRoYXQgd2lsbCBuZXZlciBhcnJpdmUuXG5cdFx0Zm9yIChjb25zdCBzb2NrZXQgb2YgdGhpcy5fY29ubmVjdFNvY2tldHMpIHtcblx0XHRcdHNvY2tldC5kZXN0cm95KCk7XG5cdFx0fVxuXHRcdHRoaXMuX2Nvbm5lY3RTb2NrZXRzLmNsZWFyKCk7XG5cdFx0Zm9yIChjb25zdCBzb2NrZXQgb2YgdGhpcy5fcmVtb3RlU29ja2V0cykge1xuXHRcdFx0c29ja2V0LmRlc3Ryb3koKTtcblx0XHR9XG5cdFx0dGhpcy5fcmVtb3RlU29ja2V0cy5jbGVhcigpO1xuXHRcdHRoaXMuX3R1bm5lbEFnZW50Py5kZXN0cm95KCk7XG5cdFx0dGhpcy5fc2VydmVyPy5jbG9zZUFsbENvbm5lY3Rpb25zKCk7XG5cdFx0dGhpcy5fc2VydmVyPy5jbG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBWZXJpZnkgdGhlIGBQcm94eS1BdXRob3JpemF0aW9uYCBoZWFkZXIgYWdhaW5zdCBvdXIgY3JlZGVudGlhbHMuXG5cdCAqIFJldHVybnMgYHRydWVgIGlmIHRoZSByZXF1ZXN0IGlzIGF1dGhvcml6ZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9jaGVja0F1dGgoYXV0aEhlYWRlcjogc3RyaW5nIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGF1dGhIZWFkZXIgPT09IHRoaXMuX2V4cGVjdGVkQXV0aEhlYWRlcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYW4gYGh0dHAuQWdlbnRgIHRoYXQgcG9vbHMgdHVubmVsIHNvY2tldHMgYnkgdGFyZ2V0XG5cdCAqIGhvc3Q6cG9ydC4gTm9kZSBjYWxscyBgY3JlYXRlQ29ubmVjdGlvbmAgb25seSB3aGVuIG5vIHBvb2xlZCBzb2NrZXRcblx0ICogaXMgYXZhaWxhYmxlIGZvciB0aGUgdGFyZ2V0OyBvdGhlcndpc2UgaXQgcmV1c2VzIGFuIGV4aXN0aW5nIG9uZS5cblx0ICovXG5cdHByaXZhdGUgX2NyZWF0ZVR1bm5lbEFnZW50KCk6IGh0dHAuQWdlbnQge1xuXHRcdGlmICghdGhpcy5faHR0cCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdIVFRQIG1vZHVsZSBub3QgaW5pdGlhbGl6ZWQnKTtcblx0XHR9XG5cdFx0Y29uc3QgYWdlbnQgPSBuZXcgdGhpcy5faHR0cC5BZ2VudCh7IGtlZXBBbGl2ZTogdHJ1ZSB9KTtcblx0XHRhZ2VudC5jcmVhdGVDb25uZWN0aW9uID0gKG9wdGlvbnMsIG9uY3JlYXRlKSA9PiB7XG5cdFx0XHRjb25zdCBob3N0ID0gb3B0aW9ucy5ob3N0bmFtZSB8fCBvcHRpb25zLmhvc3QgfHwgJyc7XG5cdFx0XHRjb25zdCBwb3J0ID0gTnVtYmVyKG9wdGlvbnMucG9ydCkgfHwgODA7XG5cdFx0XHR0aGlzLl9jcmVhdGVUdW5uZWxTb2NrZXQoaG9zdCwgcG9ydClcblx0XHRcdFx0LnRoZW4oc29ja2V0ID0+IG9uY3JlYXRlPy4obnVsbCwgc29ja2V0KSlcblx0XHRcdFx0LmNhdGNoKGVyciA9PiBvbmNyZWF0ZT8uKGVyciwgbnVsbCEpKTtcblx0XHR9O1xuXHRcdHJldHVybiBhZ2VudDtcblx0fVxuXG5cdC8qKlxuXHQgKiBEcm9wIGV2ZXJ5IHBvb2xlZCBrZWVwLWFsaXZlIHR1bm5lbCBzb2NrZXQgYnkgcmVjcmVhdGluZyB0aGVcblx0ICogYWdlbnQuIENhbGxlZCB3aGVuIHRoZSB1cHN0cmVhbSB0dW5uZWwgZW5kcG9pbnQgY2hhbmdlczogdGhlIHBvb2xlZFxuXHQgKiBzb2NrZXRzIGFsbCBkaWFsIHRoZSBub3ctc3RhbGUgZW5kcG9pbnQsIHNvIHRoZXkgd291bGQgYmUgcmVzZXQgZW5cblx0ICogbWFzc2Ugb25jZSBpdCBnb2VzIGF3YXkuIFJlY3JlYXRpbmcgdGhlIGFnZW50IGNsb3NlcyB0aGUgaWRsZSBvbmVzXG5cdCAqIGdyYWNlZnVsbHkgYW5kIGZvcmNlcyBzdWJzZXF1ZW50IHJlcXVlc3RzIHRvIGRpYWwgdGhlIG5ldyBlbmRwb2ludC5cblx0ICovXG5cdGRyYWluQ29ubmVjdGlvblBvb2woKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl90dW5uZWxBZ2VudCkge1xuXHRcdFx0cmV0dXJuOyAvLyBub3Qgc3RhcnRlZCB5ZXQ7IG5vdGhpbmcgcG9vbGVkXG5cdFx0fVxuXHRcdGNvbnN0IG9sZEFnZW50ID0gdGhpcy5fdHVubmVsQWdlbnQ7XG5cdFx0dGhpcy5fdHVubmVsQWdlbnQgPSB0aGlzLl9jcmVhdGVUdW5uZWxBZ2VudCgpO1xuXHRcdG9sZEFnZW50Py5kZXN0cm95KCk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZSgnW1R1bm5lbFByb3h5XSBVcHN0cmVhbSBlbmRwb2ludCBjaGFuZ2VkOyBkcmFpbmVkIHBvb2xlZCB0dW5uZWwgc29ja2V0cycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhhbmRsZSBIVFRQIENPTk5FQ1QgcmVxdWVzdHMgKHVzZWQgZm9yIEhUVFBTIHR1bm5lbGluZykuXG5cdCAqIFBhcnNlcyBgaG9zdDpwb3J0YCBmcm9tIHRoZSByZXF1ZXN0IFVSTCwgZXN0YWJsaXNoZXMgYSB0dW5uZWxcblx0ICogdGhyb3VnaCB0aGUgcmVtb3RlIGFnZW50LCBhbmQgcGlwZXMgdGhlIHNvY2tldHMgdG9nZXRoZXIuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9vbkNvbm5lY3QocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgc29ja2V0OiBuZXQuU29ja2V0LCBoZWFkOiBCdWZmZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBUcmFjayB0aGUgc29ja2V0IGZyb20gdGhlIG1vbWVudCB0aGUgQ09OTkVDVCBldmVudCBmaXJlcyBzb1xuXHRcdC8vIGRpc3Bvc2UgY2FuIHRlYXIgaXQgZG93biBldmVuIGJlZm9yZSB0aGUgdXBzdHJlYW0gdHVubmVsXG5cdFx0Ly8gcmV0dXJucyAob3IgaWYgYXV0aC9ob3N0IHZhbGlkYXRpb24gZmFpbHMpLiBUaGUgY2xvc2UgbGlzdGVuZXJcblx0XHQvLyBhdXRvLXJlbW92ZXMgd2hldGhlciB3ZSBjbG9zZSBpdCBoZXJlIG9yIGxhdGVyLlxuXHRcdHRoaXMuX2Nvbm5lY3RTb2NrZXRzLmFkZChzb2NrZXQpO1xuXHRcdHNvY2tldC5vbignY2xvc2UnLCAoKSA9PiB0aGlzLl9jb25uZWN0U29ja2V0cy5kZWxldGUoc29ja2V0KSk7XG5cblx0XHRpZiAoIXRoaXMuX2NoZWNrQXV0aChyZXEuaGVhZGVyc1sncHJveHktYXV0aG9yaXphdGlvbiddKSkge1xuXHRcdFx0c29ja2V0LndyaXRlKFxuXHRcdFx0XHQnSFRUUC8xLjEgNDA3IFByb3h5IEF1dGhlbnRpY2F0aW9uIFJlcXVpcmVkXFxyXFxuJyArXG5cdFx0XHRcdCdQcm94eS1BdXRoZW50aWNhdGU6IEJhc2ljIHJlYWxtPVwiVHVubmVsUHJveHlcIlxcclxcbicgK1xuXHRcdFx0XHQnXFxyXFxuJ1xuXHRcdFx0KTtcblx0XHRcdHNvY2tldC5lbmQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IGhvc3QsIHBvcnQgfSA9IHRoaXMuX3BhcnNlSG9zdFBvcnQocmVxLnVybCA/PyAnJywgNDQzKTtcblx0XHRpZiAoIWhvc3QpIHtcblx0XHRcdHNvY2tldC53cml0ZSgnSFRUUC8xLjEgNDAwIEJhZCBSZXF1ZXN0XFxyXFxuXFxyXFxuJyk7XG5cdFx0XHRzb2NrZXQuZW5kKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW1R1bm5lbFByb3h5XSBDT05ORUNUICR7aG9zdH06JHtwb3J0fWApO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHNvY2tldC5wYXVzZSgpO1xuXG5cdFx0XHRjb25zdCBwcm90b2NvbCA9IGF3YWl0IHRoaXMuX2Nvbm5lY3RMaW1pdGVyLnF1ZXVlKCgpID0+IHRoaXMuX2Nvbm5lY3RUdW5uZWwoaG9zdCwgcG9ydCkpO1xuXHRcdFx0Y29uc3QgeyBzdHJlYW06IHJlbW90ZVNvY2tldCwgbGVmdG92ZXIgfSA9IHRoaXMuX3Rha2VSZW1vdGVTdHJlYW0ocHJvdG9jb2wpO1xuXG5cdFx0XHRzb2NrZXQud3JpdGUoJ0hUVFAvMS4xIDIwMCBDb25uZWN0aW9uIEVzdGFibGlzaGVkXFxyXFxuXFxyXFxuJyk7XG5cblx0XHRcdGlmIChsZWZ0b3Zlci5ieXRlTGVuZ3RoID4gMCkge1xuXHRcdFx0XHRzb2NrZXQud3JpdGUobGVmdG92ZXIuYnVmZmVyKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGhlYWQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZW1vdGVTb2NrZXQud3JpdGUoaGVhZCk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2JyaWRnZVNvY2tldHMoc29ja2V0LCByZW1vdGVTb2NrZXQpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW1R1bm5lbFByb3h5XSBGYWlsZWQgdG8gdHVubmVsIHRvICR7aG9zdH06JHtwb3J0fTpgLCBlcnIpO1xuXHRcdFx0c29ja2V0LndyaXRlKCdIVFRQLzEuMSA1MDIgQmFkIEdhdGV3YXlcXHJcXG5cXHJcXG4nKTtcblx0XHRcdHNvY2tldC5lbmQoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogSGFuZGxlIHBsYWluIEhUVFAgcmVxdWVzdHMgKEdFVCwgUE9TVCwgZXRjLiB3aXRoIGFic29sdXRlIFVSTHMpLlxuXHQgKlxuXHQgKiBDaHJvbWl1bSBzZW5kcyBwcm94aWVkIEhUVFAgcmVxdWVzdHMgd2l0aCBhYnNvbHV0ZS1mb3JtIFVSTHNcblx0ICogKGUuZy4gYEdFVCBodHRwOi8vZXhhbXBsZS5jb20vcGFnZSBIVFRQLzEuMWApIGFuZCByZXVzZXMga2VlcC1hbGl2ZVxuXHQgKiBjb25uZWN0aW9ucyB0byB0aGUgcHJveHkgZm9yIHJlcXVlc3RzIHRvICoqZGlmZmVyZW50KiogaG9zdHMuXG5cdCAqXG5cdCAqIEVhY2ggcmVxdWVzdCBpcyBmb3J3YXJkZWQgdmlhIGBodHRwLnJlcXVlc3RgIHVzaW5nIGEgc2hhcmVkXG5cdCAqIGBodHRwLkFnZW50YCB0aGF0IHBvb2xzIHR1bm5lbCBzb2NrZXRzIGJ5IGhvc3Q6cG9ydC4gVGhlIGFnZW50XG5cdCAqIGNhbGxzIGBfY3JlYXRlVHVubmVsU29ja2V0YCBvbmx5IHdoZW4gbm8gcG9vbGVkIHNvY2tldCBpcyBhdmFpbGFibGU7XG5cdCAqIG90aGVyd2lzZSBpdCByZXVzZXMgYW4gZXhpc3RpbmcgdHVubmVsIGNvbm5lY3Rpb24uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9vblJlcXVlc3QocmVxOiBodHRwLkluY29taW5nTWVzc2FnZSwgcmVzOiBodHRwLlNlcnZlclJlc3BvbnNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9jaGVja0F1dGgocmVxLmhlYWRlcnNbJ3Byb3h5LWF1dGhvcml6YXRpb24nXSkpIHtcblx0XHRcdHJlcy53cml0ZUhlYWQoNDA3LCB7ICdQcm94eS1BdXRoZW50aWNhdGUnOiAnQmFzaWMgcmVhbG09XCJUdW5uZWxQcm94eVwiJyB9KTtcblx0XHRcdHJlcy5lbmQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgcGFyc2VkOiBVUkw7XG5cdFx0dHJ5IHtcblx0XHRcdHBhcnNlZCA9IG5ldyBVUkwocmVxLnVybCA/PyAnJyk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXMud3JpdGVIZWFkKDQwMCk7XG5cdFx0XHRyZXMuZW5kKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUGxhaW4gSFRUUCBmb3J3YXJkaW5nIG9ubHkgXHUyMDE0IEhUVFBTIGdvZXMgdGhyb3VnaCBDT05ORUNULlxuXHRcdC8vIEluIHByYWN0aWNlIGV2ZXJ5IEhUVFAvMS4xIGNsaWVudCAoYnJvd3NlcnMgaW5jbHVkZWQpIHVzZXNcblx0XHQvLyBDT05ORUNUIGZvciBIVFRQUyB2aWEgYSBwcm94eSwgc28gYW4gYWJzb2x1dGUtZm9ybSBgaHR0cHM6YFxuXHRcdC8vIFVSTCBoZXJlIHNob3VsZCBuZXZlciBoYXBwZW4uIFJlamVjdCBsb3VkbHkgcmF0aGVyIHRoYW5cblx0XHQvLyBzaWxlbnRseSBtaXNmb3J3YXJkIGl0IGFzIHBsYWludGV4dCAoYGh0dHAucmVxdWVzdGAgdG8gZWl0aGVyXG5cdFx0Ly8gdGhlIFVSTCdzIHBvcnQgb3IgZGVmYXVsdCA4MCB3b3VsZCBwcm9kdWNlIGNvbmZ1c2luZyBmYWlsdXJlc1xuXHRcdC8vIG9yIHdyb25nIGNvbnRlbnQpLlxuXHRcdGlmIChwYXJzZWQucHJvdG9jb2wgIT09ICdodHRwOicpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW1R1bm5lbFByb3h5XSBSZWplY3Rpbmcgbm9uLUhUVFAgZm9yd2FyZGVkIHJlcXVlc3Q6ICR7cmVxLm1ldGhvZH0gJHtyZXEudXJsfWApO1xuXHRcdFx0cmVzLndyaXRlSGVhZCg0MDApO1xuXHRcdFx0cmVzLmVuZCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhvc3QgPSBwYXJzZWQuaG9zdG5hbWU7XG5cdFx0Y29uc3QgcG9ydCA9IHBhcnNlSW50KHBhcnNlZC5wb3J0LCAxMCkgfHwgODA7XG5cblx0XHRpZiAoIWhvc3QpIHtcblx0XHRcdHJlcy53cml0ZUhlYWQoNDAwKTtcblx0XHRcdHJlcy5lbmQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbVHVubmVsUHJveHldICR7cmVxLm1ldGhvZH0gJHtob3N0fToke3BvcnR9JHtwYXJzZWQucGF0aG5hbWV9YCk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaHR0cCA9IGF3YWl0IGltcG9ydCgnaHR0cCcpO1xuXHRcdFx0Y29uc3QgcGF0aCA9IHBhcnNlZC5wYXRobmFtZSArIHBhcnNlZC5zZWFyY2g7XG5cdFx0XHRjb25zdCBoZWFkZXJzID0geyAuLi5yZXEuaGVhZGVycyB9O1xuXG5cdFx0XHQvLyBTdHJpcCBob3AtYnktaG9wIGhlYWRlcnMgcGVyIFJGQyA5MTEwIFNlY3Rpb24gNy42LjEuXG5cdFx0XHQvLyBBbiBpbnRlcm1lZGlhcnkgTVVTVCBwYXJzZSB0aGUgQ29ubmVjdGlvbiBoZWFkZXIgYW5kIHJlbW92ZSBhbnlcblx0XHRcdC8vIGZpZWxkcyBuYW1lZCBpbiBpdCwgdGhlbiByZW1vdmUgQ29ubmVjdGlvbiBpdHNlbGYuIEl0IFNIT1VMRFxuXHRcdFx0Ly8gYWxzbyByZW1vdmUgb3RoZXIga25vd24gaG9wLWJ5LWhvcCBoZWFkZXJzLlxuXHRcdFx0Y29uc3QgY29ubmVjdGlvblRva2VucyA9IChoZWFkZXJzWydjb25uZWN0aW9uJ10gPz8gJycpXG5cdFx0XHRcdC50b1N0cmluZygpXG5cdFx0XHRcdC5zcGxpdCgnLCcpXG5cdFx0XHRcdC5tYXAodCA9PiB0LnRyaW0oKS50b0xvd2VyQ2FzZSgpKVxuXHRcdFx0XHQuZmlsdGVyKHQgPT4gdC5sZW5ndGggPiAwKTtcblx0XHRcdGZvciAoY29uc3QgdG9rZW4gb2YgY29ubmVjdGlvblRva2Vucykge1xuXHRcdFx0XHRkZWxldGUgaGVhZGVyc1t0b2tlbl07XG5cdFx0XHR9XG5cdFx0XHRkZWxldGUgaGVhZGVyc1snY29ubmVjdGlvbiddO1xuXHRcdFx0ZGVsZXRlIGhlYWRlcnNbJ2tlZXAtYWxpdmUnXTtcblx0XHRcdGRlbGV0ZSBoZWFkZXJzWydwcm94eS1hdXRob3JpemF0aW9uJ107XG5cdFx0XHRkZWxldGUgaGVhZGVyc1sncHJveHktY29ubmVjdGlvbiddO1xuXHRcdFx0ZGVsZXRlIGhlYWRlcnNbJ3RlJ107XG5cdFx0XHRkZWxldGUgaGVhZGVyc1sndHJhbnNmZXItZW5jb2RpbmcnXTtcblx0XHRcdGRlbGV0ZSBoZWFkZXJzWyd1cGdyYWRlJ107XG5cblx0XHRcdGNvbnN0IHByb3h5UmVxID0gaHR0cC5yZXF1ZXN0KHtcblx0XHRcdFx0YWdlbnQ6IHRoaXMuX3R1bm5lbEFnZW50LFxuXHRcdFx0XHRob3N0bmFtZTogaG9zdCxcblx0XHRcdFx0cG9ydCxcblx0XHRcdFx0cGF0aCxcblx0XHRcdFx0bWV0aG9kOiByZXEubWV0aG9kLFxuXHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0fSwgcHJveHlSZXMgPT4ge1xuXHRcdFx0XHRyZXMud3JpdGVIZWFkKHByb3h5UmVzLnN0YXR1c0NvZGUhLCBwcm94eVJlcy5oZWFkZXJzKTtcblx0XHRcdFx0cHJveHlSZXMucGlwZShyZXMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHByb3h5UmVxLm9uKCdlcnJvcicsIGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtUdW5uZWxQcm94eV0gUHJveHkgcmVxdWVzdCBlcnJvciBmb3IgJHtob3N0fToke3BvcnR9OmAsIGVycik7XG5cdFx0XHRcdC8vIFJlc2V0IHRoZSBjbGllbnQgY29ubmVjdGlvbiBpbnN0ZWFkIG9mIHJldHVybmluZyBhIDUwMiBib2R5LlxuXHRcdFx0XHQvLyBDaHJvbWl1bSByZW5kZXJzIGEgNTAyIGJvZHkgYXMgYSBwYWdlLCB3aGVyZWFzIGEgdHJhbnNwb3J0XG5cdFx0XHRcdC8vIHJlc2V0IHRyaWdnZXJzIGBkaWQtZmFpbC1sb2FkYCwgc28gdGhlIGJyb3dzZXIgc2hvd3MgaXRzXG5cdFx0XHRcdC8vIG5hdGl2ZSBcImZhaWxlZCB0byBsb2FkXCIgZXJyb3IgcGFnZSAoY29uc2lzdGVudCB3aXRoIHRoZVxuXHRcdFx0XHQvLyBIVFRQUy9DT05ORUNUIHBhdGgpLlxuXHRcdFx0XHRyZXMuZGVzdHJveSgpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHJlcS5waXBlKHByb3h5UmVxKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtUdW5uZWxQcm94eV0gRmFpbGVkIHRvIHR1bm5lbCB0byAke2hvc3R9OiR7cG9ydH06YCwgZXJyKTtcblx0XHRcdC8vIFJlc2V0IHRoZSBjbGllbnQgY29ubmVjdGlvbiBzbyB0aGUgYnJvd3NlciBzaG93cyBpdHMgbmF0aXZlXG5cdFx0XHQvLyBcImZhaWxlZCB0byBsb2FkXCIgcGFnZSByYXRoZXIgdGhhbiByZW5kZXJpbmcgYW4gSFRUUCBlcnJvci5cblx0XHRcdHJlcy5kZXN0cm95KCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBhIGBuZXQuU29ja2V0YC1jb21wYXRpYmxlIHN0cmVhbSBiYWNrZWQgYnkgYSByZW1vdGUgYWdlbnRcblx0ICogdHVubmVsLiBDYWxsZWQgYnkgdGhlIGBodHRwLkFnZW50YCB3aGVuIGl0IG5lZWRzIGEgbmV3IGNvbm5lY3Rpb25cblx0ICogdG8gYSBnaXZlbiBob3N0OnBvcnQgKGkuZS4gbm8gcG9vbGVkIHNvY2tldCBpcyBhdmFpbGFibGUpLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfY3JlYXRlVHVubmVsU29ja2V0KGhvc3Q6IHN0cmluZywgcG9ydDogbnVtYmVyKTogUHJvbWlzZTxEdXBsZXg+IHtcblx0XHQvLyBUaGUgY29ubmVjdCBmdW5jdGlvbiByZXNvbHZlcyBvbmx5IG9uY2UgdGhlIHJlbW90ZSBoYXMgY29uZmlybWVkIHRoZVxuXHRcdC8vIHRhcmdldCBpcyByZWFjaGFibGUgKHZpYSB0aGUgdHVubmVsIGhhbmRzaGFrZSkgYW5kIHJlamVjdHMgb3RoZXJ3aXNlLlxuXHRcdC8vIEEgcmVqZWN0aW9uIGhlcmUgbGV0cyB0aGUgaHR0cC5BZ2VudCBmYWlsIHRoZSByZXF1ZXN0ICh0aGUgY2xpZW50XG5cdFx0Ly8gY29ubmVjdGlvbiBpcyByZXNldCkgcmF0aGVyIHRoYW4gaGFuZ2luZyBvciBzaWxlbnRseSByZXR1cm5pbmdcblx0XHQvLyBub3RoaW5nLlxuXHRcdGNvbnN0IHByb3RvY29sID0gYXdhaXQgdGhpcy5fY29ubmVjdExpbWl0ZXIucXVldWUoKCkgPT4gdGhpcy5fY29ubmVjdFR1bm5lbChob3N0LCBwb3J0KSk7XG5cdFx0Y29uc3QgeyBzdHJlYW06IHR1bm5lbFN0cmVhbSwgbGVmdG92ZXIgfSA9IHRoaXMuX3Rha2VSZW1vdGVTdHJlYW0ocHJvdG9jb2wpO1xuXG5cdFx0dGhpcy5fdHJhY2tSZW1vdGVTb2NrZXQodHVubmVsU3RyZWFtKTtcblxuXHRcdGlmIChsZWZ0b3Zlci5ieXRlTGVuZ3RoID4gMCkge1xuXHRcdFx0dHVubmVsU3RyZWFtLnVuc2hpZnQobGVmdG92ZXIuYnVmZmVyKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHVubmVsU3RyZWFtO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRha2Ugb3duZXJzaGlwIG9mIGEgZnJlc2hseS1jb25uZWN0ZWQgdHVubmVsJ3MgdHJhbnNwb3J0IGFzIGEgTm9kZVxuXHQgKiB7QGxpbmsgRHVwbGV4fSBzdHJlYW0sIHRvZ2V0aGVyIHdpdGggYW55IGJ5dGVzIHRoZSBwcm90b2NvbCBhbHJlYWR5XG5cdCAqIGJ1ZmZlcmVkIGR1cmluZyB0aGUgaGFuZHNoYWtlICh0aGUgY2FsbGVyIHJvdXRlcyB0aGF0IGxlZnRvdmVyIHRvIHRoZVxuXHQgKiBhcHByb3ByaWF0ZSBzaWRlKS5cblx0ICpcblx0ICogVHdvIHRyYW5zcG9ydHMgb2NjdXIgaW4gcHJhY3RpY2U6XG5cdCAqIC0ge0BsaW5rIE5vZGVTb2NrZXR9IChjbGFzc2ljL3dlYnNvY2tldCBzZXJ2ZXIpOiB1bndyYXAgdGhlIHJhd1xuXHQgKiAgIGBuZXQuU29ja2V0YCBzbyB3ZSBjYW4gcmVseSBvbiBOb2RlJ3MgbmF0aXZlIHN0cmVhbSBiYWNrcHJlc3N1cmUgKHZpYVxuXHQgKiAgIGBwaXBlKClgIGFuZCB0aGUga2VlcC1hbGl2ZSBgaHR0cC5BZ2VudGApLlxuXHQgKiAtIGEgZ2VuZXJpYyB7QGxpbmsgSVNvY2tldH0gKG1hbmFnZWQgLyBleGVjLXNlcnZlciBjb25uZWN0aW9uKTogdGhlcmUgaXNcblx0ICogICBubyBgbmV0LlNvY2tldGAgdW5kZXJuZWF0aCwgc28gYWRhcHQgdGhlIG1lc3NhZ2UtcGFzc2luZyBzb2NrZXQgdG8gYVxuXHQgKiAgIHtAbGluayBEdXBsZXh9ICh7QGxpbmsgUmVtb3RlU29ja2V0U3RyZWFtfSkuXG5cdCAqL1xuXHRwcml2YXRlIF90YWtlUmVtb3RlU3RyZWFtKHByb3RvY29sOiB7IGdldFNvY2tldCgpOiBJU29ja2V0OyByZWFkRW50aXJlQnVmZmVyKCk6IFZTQnVmZmVyOyBkaXNwb3NlKCk6IHZvaWQgfSk6IHsgc3RyZWFtOiBEdXBsZXg7IGxlZnRvdmVyOiBWU0J1ZmZlciB9IHtcblx0XHRjb25zdCByZW1vdGVTb2NrZXQgPSBwcm90b2NvbC5nZXRTb2NrZXQoKTtcblxuXHRcdGlmIChyZW1vdGVTb2NrZXQgaW5zdGFuY2VvZiBOb2RlU29ja2V0KSB7XG5cdFx0XHQvLyBUYWtlIG93bmVyc2hpcCBvZiB0aGUgcmF3IHNvY2tldCwgZGV0YWNoaW5nIE5vZGVTb2NrZXQncyBvd25cblx0XHRcdC8vIGxpc3RlbmVycy4gTm9kZVNvY2tldCBpbnN0YWxscyBhbiAnZXJyb3InIGxpc3RlbmVyIHRoYXQgcm91dGVzXG5cdFx0XHQvLyBldmVyeSBub24tRVBJUEUgZXJyb3IgdGhyb3VnaCBvblVuZXhwZWN0ZWRFcnJvciwgd2hpY2ggdGhlIGhvc3Rcblx0XHRcdC8vIHByb2Nlc3MgbG9ncyBhcyBhbiBcInVuY2F1Z2h0IGV4Y2VwdGlvblwiLiBXaGVuIHRoZSB1cHN0cmVhbSB0dW5uZWxcblx0XHRcdC8vIGVuZHBvaW50IGRpZXMsIGV2ZXJ5IHBvb2xlZC9hY3RpdmUgdHVubmVsIHNvY2tldCBpcyByZXNldCBhdCBvbmNlXG5cdFx0XHQvLyAtIHRoYXQgRUNPTk5SRVNFVCBpcyBleHBlY3RlZCB0ZWFyZG93biBoZXJlLCBub3QgYW4gdW5leHBlY3RlZFxuXHRcdFx0Ly8gZXJyb3IuIFdlIGJyaWRnZSB0aGUgcmF3IHNvY2tldCBvdXJzZWx2ZXMgKGF0dGFjaGluZyBvdXIgb3duXG5cdFx0XHQvLyAnZXJyb3InIGhhbmRsZXJzKSwgc28gTm9kZVNvY2tldCdzIHJvdXRpbmcgbXVzdCBiZSByZW1vdmVkLlxuXHRcdFx0Y29uc3Qgc29ja2V0ID0gcmVtb3RlU29ja2V0LnNvY2tldDtcblx0XHRcdGNvbnN0IGxlZnRvdmVyID0gcHJvdG9jb2wucmVhZEVudGlyZUJ1ZmZlcigpO1xuXHRcdFx0cmVtb3RlU29ja2V0LmRpc3Bvc2UoZmFsc2UpO1xuXHRcdFx0cHJvdG9jb2wuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuIHsgc3RyZWFtOiBzb2NrZXQsIGxlZnRvdmVyIH07XG5cdFx0fVxuXG5cdFx0Ly8gR2VuZXJpYyBJU29ja2V0IChlLmcuIGEgbWFuYWdlZC9leGVjLXNlcnZlciBjb25uZWN0aW9uKS4gUmVhZCB0aGVcblx0XHQvLyBidWZmZXJlZCBsZWZ0b3ZlciBhbmQgZGV0YWNoIHRoZSBwcm90b2NvbCdzIHJlYWRlci93cml0ZXIgYmVmb3JlIHRoZVxuXHRcdC8vIGFkYXB0ZXIgc3RhcnRzIGNvbnN1bWluZyB0aGUgc29ja2V0LCBzbyBzdWJzZXF1ZW50IG1lc3NhZ2VzIHJlYWNoIHRoZVxuXHRcdC8vIGFkYXB0ZXIgZXhhY3RseSBvbmNlLiBUaGlzIGFsbCBydW5zIHN5bmNocm9ub3VzbHksIHNvIG5vIG1lc3NhZ2UgY2FuXG5cdFx0Ly8gYXJyaXZlIGluIHRoZSBnYXAgYW5kIGJlIGxvc3QuXG5cdFx0Y29uc3QgbGVmdG92ZXIgPSBwcm90b2NvbC5yZWFkRW50aXJlQnVmZmVyKCk7XG5cdFx0cHJvdG9jb2wuZGlzcG9zZSgpO1xuXHRcdHJldHVybiB7IHN0cmVhbTogbmV3IFJlbW90ZVNvY2tldFN0cmVhbShyZW1vdGVTb2NrZXQpLCBsZWZ0b3ZlciB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFBhcnNlIGEgYGhvc3Q6cG9ydGAgc3RyaW5nLiBGYWxscyBiYWNrIHRvIGBkZWZhdWx0UG9ydGAgd2hlbiB0aGVcblx0ICogcG9ydCBjb21wb25lbnQgaXMgbWlzc2luZy4gUmV0dXJucyBhbiBlbXB0eSBob3N0IHdoZW4gdGhlIGFkZHJlc3Ncblx0ICogaXMgZW1wdHkgb3IgdGhlIHBvcnQgaXMgb3V0c2lkZSB0aGUgdmFsaWQgVENQIHJhbmdlICgxLTY1NTM1KSwgcGVyXG5cdCAqIFJGQyA5MTEwIHNlY3Rpb24gOS4zLjYgKFwiQSBzZXJ2ZXIgTVVTVCByZWplY3QgYSBDT05ORUNUIHJlcXVlc3QgdGhhdFxuXHQgKiB0YXJnZXRzIGFuIGVtcHR5IG9yIGludmFsaWQgcG9ydCBudW1iZXJcIikuXG5cdCAqL1xuXHRwcml2YXRlIF9wYXJzZUhvc3RQb3J0KGFkZHJlc3M6IHN0cmluZywgZGVmYXVsdFBvcnQ6IG51bWJlcik6IHsgaG9zdDogc3RyaW5nOyBwb3J0OiBudW1iZXIgfSB7XG5cdFx0bGV0IGhvc3Q6IHN0cmluZztcblx0XHRsZXQgcG9ydDogbnVtYmVyO1xuXG5cdFx0Ly8gSGFuZGxlIElQdjYgYnJhY2tldCBub3RhdGlvbiBbOjoxXTpwb3J0XG5cdFx0Y29uc3QgYnJhY2tldE1hdGNoID0gL15cXFsoPzxob3N0PlteXFxdXSspXFxdOig/PHBvcnQ+XFxkKykkLy5leGVjKGFkZHJlc3MpO1xuXHRcdGlmIChicmFja2V0TWF0Y2g/Lmdyb3Vwcykge1xuXHRcdFx0aG9zdCA9IGJyYWNrZXRNYXRjaC5ncm91cHNbJ2hvc3QnXTtcblx0XHRcdHBvcnQgPSBwYXJzZUludChicmFja2V0TWF0Y2guZ3JvdXBzWydwb3J0J10sIDEwKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgYnJhY2tldE9ubHkgPSAvXlxcWyg/PGhvc3Q+W15cXF1dKylcXF0kLy5leGVjKGFkZHJlc3MpO1xuXHRcdFx0aWYgKGJyYWNrZXRPbmx5Py5ncm91cHMpIHtcblx0XHRcdFx0aG9zdCA9IGJyYWNrZXRPbmx5Lmdyb3Vwc1snaG9zdCddO1xuXHRcdFx0XHRwb3J0ID0gZGVmYXVsdFBvcnQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBsYXN0Q29sb24gPSBhZGRyZXNzLmxhc3RJbmRleE9mKCc6Jyk7XG5cdFx0XHRcdGlmIChsYXN0Q29sb24gPT09IC0xKSB7XG5cdFx0XHRcdFx0aG9zdCA9IGFkZHJlc3M7XG5cdFx0XHRcdFx0cG9ydCA9IGRlZmF1bHRQb3J0O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IG1heWJlUG9ydCA9IHBhcnNlSW50KGFkZHJlc3Muc3Vic3RyaW5nKGxhc3RDb2xvbiArIDEpLCAxMCk7XG5cdFx0XHRcdFx0aWYgKGlzTmFOKG1heWJlUG9ydCkpIHtcblx0XHRcdFx0XHRcdC8vIExpa2VseSBhbiBJUHY2IGFkZHJlc3Mgd2l0aG91dCBicmFja2V0c1xuXHRcdFx0XHRcdFx0aG9zdCA9IGFkZHJlc3M7XG5cdFx0XHRcdFx0XHRwb3J0ID0gZGVmYXVsdFBvcnQ7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGhvc3QgPSBhZGRyZXNzLnN1YnN0cmluZygwLCBsYXN0Q29sb24pO1xuXHRcdFx0XHRcdFx0cG9ydCA9IG1heWJlUG9ydDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBWYWxpZGF0ZSBwb3J0IHJhbmdlXG5cdFx0aWYgKHBvcnQgPCAxIHx8IHBvcnQgPiA2NTUzNSkge1xuXHRcdFx0cmV0dXJuIHsgaG9zdDogJycsIHBvcnQ6IDAgfTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBob3N0LCBwb3J0IH07XG5cdH1cblxuXHRwcml2YXRlIF9icmlkZ2VTb2NrZXRzKGxvY2FsU29ja2V0OiBuZXQuU29ja2V0LCByZW1vdGVTb2NrZXQ6IER1cGxleCk6IHZvaWQge1xuXHRcdHRoaXMuX3RyYWNrUmVtb3RlU29ja2V0KHJlbW90ZVNvY2tldCk7XG5cdFx0cmVtb3RlU29ja2V0Lm9uKCdlbmQnLCAoKSA9PiBsb2NhbFNvY2tldC5lbmQoKSk7XG5cdFx0cmVtb3RlU29ja2V0Lm9uKCdjbG9zZScsICgpID0+IGxvY2FsU29ja2V0LmVuZCgpKTtcblx0XHRyZW1vdGVTb2NrZXQub24oJ2Vycm9yJywgKCkgPT4gbG9jYWxTb2NrZXQuZGVzdHJveSgpKTtcblx0XHRsb2NhbFNvY2tldC5vbignZW5kJywgKCkgPT4gcmVtb3RlU29ja2V0LmVuZCgpKTtcblx0XHRsb2NhbFNvY2tldC5vbignY2xvc2UnLCAoKSA9PiByZW1vdGVTb2NrZXQuZW5kKCkpO1xuXHRcdGxvY2FsU29ja2V0Lm9uKCdlcnJvcicsICgpID0+IHJlbW90ZVNvY2tldC5kZXN0cm95KCkpO1xuXG5cdFx0cmVtb3RlU29ja2V0LnBpcGUobG9jYWxTb2NrZXQpO1xuXHRcdGxvY2FsU29ja2V0LnBpcGUocmVtb3RlU29ja2V0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUcmFjayBhIHJlbW90ZSB0dW5uZWwgc29ja2V0IHNvIHtAbGluayBkaXNwb3NlfSBjYW4gdGVhciBpdCBkb3duXG5cdCAqIHN5bmNocm9ub3VzbHkuIFRoZSBzb2NrZXQgYXV0by1yZW1vdmVzIGl0c2VsZiBvbmNlIGNsb3NlZC5cblx0ICovXG5cdHByaXZhdGUgX3RyYWNrUmVtb3RlU29ja2V0KHNvY2tldDogRHVwbGV4KTogdm9pZCB7XG5cdFx0dGhpcy5fcmVtb3RlU29ja2V0cy5hZGQoc29ja2V0KTtcblxuXHRcdC8vIE9uY2Ugd2UgZGV0YWNoIE5vZGVTb2NrZXQncyBsaXN0ZW5lcnMgKHNlZSBfdGFrZVJlbW90ZVN0cmVhbSlcblx0XHQvLyB0aGUgcmF3IHNvY2tldCBoYXMgbm8gJ2Vycm9yJyBoYW5kbGVyIG9mIGl0cyBvd24uIEEgbmV0LlNvY2tldFxuXHRcdC8vIHRoYXQgZW1pdHMgJ2Vycm9yJyB3aXRob3V0IGEgbGlzdGVuZXIgdGhyb3dzIGFzIGEgZ2VudWluZVxuXHRcdC8vIHVuY2F1Z2h0IGV4Y2VwdGlvbiwgc28gZXZlcnkgc29ja2V0IHdlIG93biBtdXN0IGhhdmUgb25lLlxuXHRcdC8vIERlc3Ryb3lpbmcgb24gZXJyb3IgdGVhcnMgdGhlIHNvY2tldCBkb3duIHF1aWV0bHkgYW5kIGxldHMgdGhlXG5cdFx0Ly8gYWdlbnQgZXZpY3QgaXQgZnJvbSB0aGUgcG9vbC4gKENPTk5FQ1QgYnJpZGdlcyBhdHRhY2ggYW5cblx0XHQvLyBhZGRpdGlvbmFsIGhhbmRsZXIgaW4gX2JyaWRnZVNvY2tldHM7IGEgc2Vjb25kIGxpc3RlbmVyIGlzXG5cdFx0Ly8gaGFybWxlc3MuKVxuXHRcdHNvY2tldC5vbignZXJyb3InLCAoKSA9PiBzb2NrZXQuZGVzdHJveSgpKTtcblx0XHRzb2NrZXQub24oJ2Nsb3NlJywgKCkgPT4gdGhpcy5fcmVtb3RlU29ja2V0cy5kZWxldGUoc29ja2V0KSk7XG5cdH1cbn1cblxuLyoqXG4gKiBBZGFwdHMgYSBnZW5lcmljIHtAbGluayBJU29ja2V0fSAoc3VjaCBhcyBhIG1hbmFnZWQgLyBleGVjLXNlcnZlclxuICogY29ubmVjdGlvbiwgd2hpY2ggaGFzIG5vIHVuZGVybHlpbmcgYG5ldC5Tb2NrZXRgKSB0byBhIE5vZGUge0BsaW5rIER1cGxleH1cbiAqIHN0cmVhbSwgc28gdGhlIHtAbGluayBUdW5uZWxQcm94eX0gY2FuIHBpcGUgYW5kIHBvb2wgaXQgZXhhY3RseSBsaWtlIHRoZSByYXdcbiAqIHNvY2tldCBpdCBleHRyYWN0cyBmcm9tIGEge0BsaW5rIE5vZGVTb2NrZXR9LlxuICovXG5jbGFzcyBSZW1vdGVTb2NrZXRTdHJlYW0gZXh0ZW5kcyBEdXBsZXgge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX3NvY2tldDogSVNvY2tldCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3NvY2tldC5vbkRhdGEoZGF0YSA9PiB0aGlzLnB1c2goZGF0YS5idWZmZXIpKSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX3NvY2tldC5vbkVuZCgoKSA9PiB0aGlzLnB1c2gobnVsbCkpKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fc29ja2V0Lm9uQ2xvc2UoZSA9PiB7XG5cdFx0XHQvLyBUaGUgdHJhbnNwb3J0IGlzIGZ1bGx5IGNsb3NlZCwgc28gdGVhciB0aGUgc3RyZWFtIGRvd246IHRoaXMgZW1pdHNcblx0XHRcdC8vICdjbG9zZScgKHJlbW92aW5nIGl0IGZyb20gdGhlIHByb3h5J3Mgc29ja2V0IHNldCBhbmQgZXZpY3RpbmcgaXQgZnJvbVxuXHRcdFx0Ly8gdGhlIGh0dHAuQWdlbnQgcG9vbCkgYW5kIGRpc3Bvc2VzIHRoZSB1bmRlcmx5aW5nIElTb2NrZXQgdmlhIF9kZXN0cm95LlxuXHRcdFx0Ly8gQSBjbGVhbiBjbG9zZSBjYXJyaWVzIG5vIGVycm9yLlxuXHRcdFx0dGhpcy5kZXN0cm95KGU/LnR5cGUgPT09IFNvY2tldENsb3NlRXZlbnRUeXBlLk5vZGVTb2NrZXRDbG9zZUV2ZW50ID8gZS5lcnJvciA6IHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Ly8gVGhlIGtlZXAtYWxpdmUgaHR0cC5BZ2VudCBwb29scyB0dW5uZWwgc29ja2V0cyBhbmQgY2FsbHMgbmV0LlNvY2tldC1vbmx5XG5cdC8vIHRyYW5zcG9ydCBrbm9icyBvbiB0aGVtIChzZXRLZWVwQWxpdmUvcmVmL3VucmVmLCBhbmQgc2V0VGltZW91dC9zZXROb0RlbGF5XG5cdC8vIHdoaWxlIHdpcmluZyBhIHJlcXVlc3QpIHdoZW4gcGFya2luZyBvciByZXVzaW5nIGEgY29ubmVjdGlvbi4gQSBnZW5lcmljXG5cdC8vIElTb2NrZXQgaGFzIG5vIHN1Y2gga25vYnMsIHNvIGV4cG9zZSBuby1vcCBzaGltcyB0byBrZWVwIHRoZSBhZ2VudCBoYXBweTtcblx0Ly8gb3RoZXJ3aXNlIGZyZWVpbmcgYSBwb29sZWQgbWFuYWdlZCBzb2NrZXQgdGhyb3dzIChlLmcuXG5cdC8vIFwic29ja2V0LnNldEtlZXBBbGl2ZSBpcyBub3QgYSBmdW5jdGlvblwiKS5cblx0c2V0S2VlcEFsaXZlKCk6IHRoaXMgeyByZXR1cm4gdGhpczsgfVxuXHRzZXROb0RlbGF5KCk6IHRoaXMgeyByZXR1cm4gdGhpczsgfVxuXHRzZXRUaW1lb3V0KCk6IHRoaXMgeyByZXR1cm4gdGhpczsgfVxuXHRyZWYoKTogdGhpcyB7IHJldHVybiB0aGlzOyB9XG5cdHVucmVmKCk6IHRoaXMgeyByZXR1cm4gdGhpczsgfVxuXG5cdG92ZXJyaWRlIF9yZWFkKCk6IHZvaWQge1xuXHRcdC8vIERhdGEgaXMgZGVsaXZlcmVkIHRocm91Z2ggdGhlIG9uRGF0YSBsaXN0ZW5lcjsgbm90aGluZyB0byBwdWxsIGhlcmUuXG5cdH1cblxuXHRvdmVycmlkZSBfd3JpdGUoY2h1bms6IEJ1ZmZlciwgX2VuY29kaW5nOiBCdWZmZXJFbmNvZGluZywgY2FsbGJhY2s6IChlcnJvcj86IEVycm9yIHwgbnVsbCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdHRoaXMuX3NvY2tldC53cml0ZShWU0J1ZmZlci53cmFwKGNodW5rKSk7XG5cdFx0Ly8gUmVzcGVjdCBiYWNrcHJlc3N1cmU6IGRlZmVyIGNvbXBsZXRpb24gdW50aWwgdGhlIHNvY2tldCBoYXMgZHJhaW5lZCBpdHNcblx0XHQvLyBidWZmZXIgc28gYSBmYXN0IHByb2R1Y2VyIGNhbm5vdCBxdWV1ZSB1bmJvdW5kZWQgZGF0YSBvbiBhIHNsb3cgbWFuYWdlZCAvXG5cdFx0Ly8gZXhlYy1zZXJ2ZXIgdHJhbnNwb3J0LlxuXHRcdHRoaXMuX3NvY2tldC5kcmFpbigpLnRoZW4oKCkgPT4gY2FsbGJhY2soKSwgZXJyID0+IGNhbGxiYWNrKGVycikpO1xuXHR9XG5cblx0b3ZlcnJpZGUgX2ZpbmFsKGNhbGxiYWNrOiAoZXJyb3I/OiBFcnJvciB8IG51bGwpID0+IHZvaWQpOiB2b2lkIHtcblx0XHR0aGlzLl9zb2NrZXQuZW5kKCk7XG5cdFx0Y2FsbGJhY2soKTtcblx0fVxuXG5cdG92ZXJyaWRlIF9kZXN0cm95KGVycm9yOiBFcnJvciB8IG51bGwsIGNhbGxiYWNrOiAoZXJyb3I/OiBFcnJvciB8IG51bGwpID0+IHZvaWQpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fc29ja2V0LmRpc3Bvc2UoKTtcblx0XHRjYWxsYmFjayhlcnJvcik7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsY0FBYztBQUl2QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFrQiw0QkFBNEI7QUFDOUMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSx1QkFBdUI7QUFHNUMsU0FBUyw4QkFBOEI7QUFhdkMsTUFBTSxpQ0FBaUM7QUFzQ2hDLE1BQU0sb0JBQW9CLFdBQVc7QUFBQSxFQXdDM0MsWUFDa0IsZ0JBQ0EsYUFDaEI7QUFDRCxVQUFNO0FBSFc7QUFDQTtBQXJDbEIsU0FBUSxhQUFxQjtBQVk3QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQWlCLGtCQUFrQixvQkFBSSxJQUFnQjtBQVV2RDtBQUFB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YSxJQUFJLENBQUM7QUFDaEQsZ0JBQVksR0FBRyxTQUFTLE1BQU0sYUFBYSxRQUFRLENBQUM7QUFFcEQsaUJBQWEsS0FBSyxXQUFXO0FBQzdCLGdCQUFZLEtBQUssWUFBWTtBQUFBLEVBQzlCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1RLG1CQUFtQixRQUFzQjtBQUNoRCxTQUFLLGVBQWUsSUFBSSxNQUFNO0FBVTlCLFdBQU8sR0FBRyxTQUFTLE1BQU0sT0FBTyxRQUFRLENBQUM7QUFDekMsV0FBTyxHQUFHLFNBQVMsTUFBTSxLQUFLLGVBQWUsT0FBTyxNQUFNLENBQUM7QUFBQSxFQUM1RDtBQUNEO0FBUUEsTUFBTSwyQkFBMkIsT0FBTztBQUFBLEVBSXZDLFlBQTZCLFNBQWtCO0FBQzlDLFVBQU07QUFEc0I7QUFGN0IsU0FBaUIsZUFBZSxJQUFJLGdCQUFnQjtBQUluRCxTQUFLLGFBQWEsSUFBSSxLQUFLLFFBQVEsT0FBTyxVQUFRLEtBQUssS0FBSyxLQUFLLE1BQU0sQ0FBQyxDQUFDO0FBQ3pFLFNBQUssYUFBYSxJQUFJLEtBQUssUUFBUSxNQUFNLE1BQU0sS0FBSyxLQUFLLElBQUksQ0FBQyxDQUFDO0FBQy9ELFNBQUssYUFBYSxJQUFJLEtBQUssUUFBUSxRQUFRLE9BQUs7QUFLL0MsV0FBSyxRQUFRLEdBQUcsU0FBUyxxQkFBcUIsdUJBQXVCLEVBQUUsUUFBUSxNQUFTO0FBQUEsSUFDekYsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUUEsZUFBcUI7QUFBRSxXQUFPO0FBQUEsRUFBTTtBQUFBLEVBQ3BDLGFBQW1CO0FBQUUsV0FBTztBQUFBLEVBQU07QUFBQSxFQUNsQyxhQUFtQjtBQUFFLFdBQU87QUFBQSxFQUFNO0FBQUEsRUFDbEMsTUFBWTtBQUFFLFdBQU87QUFBQSxFQUFNO0FBQUEsRUFDM0IsUUFBYztBQUFFLFdBQU87QUFBQSxFQUFNO0FBQUEsRUFFcEIsUUFBYztBQUFBLEVBRXZCO0FBQUEsRUFFUyxPQUFPLE9BQWUsV0FBMkIsVUFBZ0Q7QUFDekcsU0FBSyxRQUFRLE1BQU0sU0FBUyxLQUFLLEtBQUssQ0FBQztBQUl2QyxTQUFLLFFBQVEsTUFBTSxFQUFFLEtBQUssTUFBTSxTQUFTLEdBQUcsU0FBTyxTQUFTLEdBQUcsQ0FBQztBQUFBLEVBQ2pFO0FBQUEsRUFFUyxPQUFPLFVBQWdEO0FBQy9ELFNBQUssUUFBUSxJQUFJO0FBQ2pCLGFBQVM7QUFBQSxFQUNWO0FBQUEsRUFFUyxTQUFTLE9BQXFCLFVBQWdEO0FBQ3RGLFNBQUssYUFBYSxRQUFRO0FBQzFCLFNBQUssUUFBUSxRQUFRO0FBQ3JCLGFBQVMsS0FBSztBQUFBLEVBQ2Y7QUFDRDsiLAogICJuYW1lcyI6IFsibGVmdG92ZXIiXQp9Cg==
