import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { TunnelProxy } from "../../node/tunnelProxy.js";
import { NodeSocket } from "../../../../base/parts/ipc/node/ipc.net.js";
import { SocketCloseEventType } from "../../../../base/parts/ipc/common/ipc.net.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
function mockTunnelProtocol(socket) {
  return {
    getSocket: () => new NodeSocket(socket),
    readEntireBuffer: () => VSBuffer.alloc(0),
    dispose: () => {
    }
  };
}
function createMockConnectFn(targetPort) {
  return async (_host, _port) => {
    const net = await import("net");
    const socket = net.createConnection({ host: "127.0.0.1", port: targetPort });
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    return mockTunnelProtocol(socket);
  };
}
class ManagedTestSocket extends Disposable {
  constructor(_socket) {
    super();
    this._socket = _socket;
    this._onData = this._register(new Emitter());
    this._onClose = this._register(new Emitter());
    this._onEnd = this._register(new Emitter());
    this._isDisposed = false;
    this._socket.on("data", (d) => this._onData.fire(VSBuffer.wrap(d)));
    this._socket.on("end", () => this._onEnd.fire());
    this._socket.on("close", (hadError) => this._onClose.fire({ type: SocketCloseEventType.NodeSocketCloseEvent, hadError, error: void 0 }));
    this._socket.on("error", () => {
    });
  }
  get isDisposed() {
    return this._isDisposed;
  }
  onData(listener) {
    return this._onData.event(listener);
  }
  onClose(listener) {
    return this._onClose.event(listener);
  }
  onEnd(listener) {
    return this._onEnd.event(listener);
  }
  write(buffer) {
    this._socket.write(buffer.buffer);
  }
  end() {
    this._socket.end();
  }
  drain() {
    return Promise.resolve();
  }
  traceSocketEvent() {
  }
  dispose() {
    this._isDisposed = true;
    this._socket.destroy();
    super.dispose();
  }
}
function createManagedConnectFn(targetPort, onSocket) {
  return async () => {
    const net = await import("net");
    const socket = net.createConnection({ host: "127.0.0.1", port: targetPort });
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    const managed = new ManagedTestSocket(socket);
    onSocket?.(managed);
    return {
      getSocket: () => managed,
      readEntireBuffer: () => VSBuffer.alloc(0),
      dispose: () => {
      }
    };
  };
}
async function proxyRequest(info, options) {
  const https = await import("https");
  return new Promise((resolve, reject) => {
    const authHeader = options.auth ? "Basic " + Buffer.from(`${info.credentials.username}:${info.credentials.password}`).toString("base64") : void 0;
    const req = https.request({
      hostname: "127.0.0.1",
      port: info.port,
      method: options.method ?? "GET",
      path: options.path,
      headers: {
        ...options.headers,
        ...authHeader ? { "Proxy-Authorization": authHeader } : {}
      },
      rejectUnauthorized: false
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString()
      }));
    });
    req.on("error", reject);
    req.end();
  });
}
async function proxyConnect(info, target, auth) {
  const tls = await import("tls");
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: "127.0.0.1",
      port: info.port,
      rejectUnauthorized: false
    }, () => {
      const authHeader = auth ? "Basic " + Buffer.from(`${info.credentials.username}:${info.credentials.password}`).toString("base64") : void 0;
      let request = `CONNECT ${target} HTTP/1.1\r
Host: ${target}\r
`;
      if (authHeader) {
        request += `Proxy-Authorization: ${authHeader}\r
`;
      }
      request += "\r\n";
      socket.write(request);
      let data = "";
      const onData = (chunk) => {
        data += chunk.toString();
        const headerEnd = data.indexOf("\r\n\r\n");
        if (headerEnd !== -1) {
          socket.removeListener("data", onData);
          const statusLine = data.substring(0, data.indexOf("\r\n"));
          const statusCode = parseInt(statusLine.split(" ")[1], 10);
          resolve({ statusCode, socket });
        }
      };
      socket.on("data", onData);
    });
    socket.on("error", reject);
  });
}
suite("TunnelProxy", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  let targetServer;
  let targetPort;
  suiteSetup(async () => {
    const http = await import("http");
    targetServer = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(`ECHO ${req.method} ${req.url}`);
    });
    targetServer.listen(0, "127.0.0.1");
    await new Promise((resolve) => targetServer.once("listening", resolve));
    targetPort = targetServer.address().port;
  });
  suiteTeardown(() => {
    targetServer.close();
  });
  let proxy;
  let proxyInfo;
  setup(async () => {
    const connectFn = createMockConnectFn(targetPort);
    proxy = ds.add(new TunnelProxy(connectFn, new NullLogService()));
    proxyInfo = await proxy.start();
  });
  teardown(() => {
    proxy.dispose();
  });
  test("start returns a valid ITunnelProxyInfo", () => {
    assert.strictEqual(proxyInfo.host, "127.0.0.1");
    assert.strictEqual(typeof proxyInfo.port, "number");
    assert.ok(proxyInfo.port > 0 && proxyInfo.port < 65536);
    assert.strictEqual(proxyInfo.url, `https://127.0.0.1:${proxyInfo.port}`);
    assert.ok(proxyInfo.credentials.username.length > 0);
    assert.ok(proxyInfo.credentials.password.length > 0);
    assert.ok(proxyInfo.certFingerprint.startsWith("sha256/"));
  });
  test("server uses TLS", async () => {
    const tls = await import("tls");
    const socket = await new Promise((resolve, reject) => {
      const s = tls.connect({
        host: "127.0.0.1",
        port: proxyInfo.port,
        rejectUnauthorized: false
      }, () => resolve(s));
      s.on("error", reject);
    });
    assert.ok(socket.encrypted);
    const cert = socket.getPeerCertificate();
    assert.strictEqual(cert.subject?.CN, "TunnelProxy");
    socket.end();
  });
  test("rejects plain HTTP request without credentials (407)", async () => {
    const res = await proxyRequest(proxyInfo, {
      path: `http://127.0.0.1:${targetPort}/hello`,
      auth: false
    });
    assert.strictEqual(res.statusCode, 407);
  });
  test("rejects CONNECT without credentials (407)", async () => {
    const { statusCode, socket } = await proxyConnect(
      proxyInfo,
      `127.0.0.1:${targetPort}`,
      false
    );
    assert.strictEqual(statusCode, 407);
    socket.end();
  });
  test("forwards authenticated HTTP GET to target", async () => {
    const res = await proxyRequest(proxyInfo, {
      path: `http://127.0.0.1:${targetPort}/some/path`,
      auth: true
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body, `ECHO GET /some/path`);
  });
  test("forwards authenticated HTTP POST to target", async () => {
    const res = await proxyRequest(proxyInfo, {
      method: "POST",
      path: `http://127.0.0.1:${targetPort}/post`,
      auth: true
    });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body, "ECHO POST /post");
  });
  test("strips hop-by-hop headers from forwarded request", async () => {
    const http = await import("http");
    const headerServer = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(req.headers));
    });
    headerServer.listen(0, "127.0.0.1");
    await new Promise((resolve) => headerServer.once("listening", resolve));
    const headerPort = headerServer.address().port;
    try {
      const connectFn = createMockConnectFn(headerPort);
      const proxy2 = ds.add(new TunnelProxy(connectFn, new NullLogService()));
      const info2 = await proxy2.start();
      const res = await proxyRequest(info2, {
        path: `http://127.0.0.1:${headerPort}/`,
        auth: true,
        headers: {
          "Connection": "keep-alive, X-Custom-Hop",
          "Keep-Alive": "timeout=5",
          "Proxy-Connection": "keep-alive",
          "TE": "trailers",
          "Upgrade": "websocket",
          "X-Custom-Hop": "should-be-removed",
          "X-End-To-End": "should-survive"
        }
      });
      assert.strictEqual(res.statusCode, 200);
      const forwarded = JSON.parse(res.body);
      assert.strictEqual(forwarded["proxy-authorization"], void 0);
      assert.strictEqual(forwarded["proxy-connection"], void 0);
      assert.strictEqual(forwarded["keep-alive"], void 0);
      assert.strictEqual(forwarded["te"], void 0);
      assert.strictEqual(forwarded["upgrade"], void 0);
      assert.strictEqual(forwarded["x-custom-hop"], void 0);
      assert.strictEqual(forwarded["x-end-to-end"], "should-survive");
      proxy2.dispose();
    } finally {
      headerServer.close();
    }
  });
  test("returns 400 for malformed URL", async () => {
    const res = await proxyRequest(proxyInfo, {
      path: "not-a-valid-url",
      auth: true
    });
    assert.strictEqual(res.statusCode, 400);
  });
  test("reuses tunnel socket for multiple requests to the same host", async () => {
    const net = await import("net");
    let connectCount = 0;
    const countingConnect = async (_host, _port) => {
      connectCount++;
      const socket = net.createConnection({ host: "127.0.0.1", port: targetPort });
      await new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("error", reject);
      });
      return mockTunnelProtocol(socket);
    };
    const poolProxy = ds.add(new TunnelProxy(countingConnect, new NullLogService()));
    const poolInfo = await poolProxy.start();
    for (let i = 0; i < 3; i++) {
      const res = await proxyRequest(poolInfo, {
        path: `http://127.0.0.1:${targetPort}/req${i}`,
        auth: true
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body, `ECHO GET /req${i}`);
    }
    assert.strictEqual(connectCount, 1, `Expected 1 tunnel connection, got ${connectCount}`);
    poolProxy.dispose();
  });
  test("drainConnectionPool destroys pooled tunnel sockets", async () => {
    const net = await import("net");
    const remoteSockets = [];
    const connectFn = async () => {
      const socket = net.createConnection({ host: "127.0.0.1", port: targetPort });
      await new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("error", reject);
      });
      remoteSockets.push(socket);
      return mockTunnelProtocol(socket);
    };
    const p = ds.add(new TunnelProxy(connectFn, new NullLogService()));
    const info = await p.start();
    const res = await proxyRequest(info, { path: `http://127.0.0.1:${targetPort}/`, auth: true });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(remoteSockets.length, 1);
    assert.strictEqual(remoteSockets[0].destroyed, false);
    const closed = new Promise((resolve) => remoteSockets[0].once("close", () => resolve()));
    p.drainConnectionPool();
    await closed;
    assert.strictEqual(remoteSockets[0].destroyed, true);
    p.dispose();
  });
  test("a reset on a pooled tunnel socket does not escalate to an uncaught exception", async () => {
    const net = await import("net");
    const remoteSockets = [];
    const connectFn = async () => {
      const socket = net.createConnection({ host: "127.0.0.1", port: targetPort });
      await new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("error", reject);
      });
      remoteSockets.push(socket);
      return mockTunnelProtocol(socket);
    };
    const p = ds.add(new TunnelProxy(connectFn, new NullLogService()));
    const info = await p.start();
    const res = await proxyRequest(info, { path: `http://127.0.0.1:${targetPort}/`, auth: true });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(remoteSockets.length, 1);
    assert.doesNotThrow(() => remoteSockets[0].emit("error", new Error("simulated upstream reset")));
    p.dispose();
  });
  test("CONNECT establishes a tunnel to the target", async () => {
    const { statusCode, socket } = await proxyConnect(
      proxyInfo,
      `127.0.0.1:${targetPort}`,
      true
    );
    assert.strictEqual(statusCode, 200);
    socket.write(`GET /tunneled HTTP/1.1\r
Host: 127.0.0.1:${targetPort}\r
Connection: close\r
\r
`);
    const body = await new Promise((resolve, reject) => {
      const chunks = [];
      socket.on("data", (c) => chunks.push(c));
      socket.on("end", () => resolve(Buffer.concat(chunks).toString()));
      socket.on("error", reject);
    });
    assert.ok(body.includes("ECHO GET /tunneled"), `Expected tunneled echo, got: ${body}`);
  });
  test("CONNECT rejects invalid port 0", async () => {
    const { statusCode, socket } = await proxyConnect(proxyInfo, "127.0.0.1:0", true);
    assert.strictEqual(statusCode, 400);
    socket.end();
  });
  test("CONNECT rejects port > 65535", async () => {
    const { statusCode, socket } = await proxyConnect(proxyInfo, "127.0.0.1:99999", true);
    assert.strictEqual(statusCode, 400);
    socket.end();
  });
  test("fails the request when the tunnel connection fails", async () => {
    const failingConnect = async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:9999");
    };
    const failProxy = ds.add(new TunnelProxy(failingConnect, new NullLogService()));
    const failInfo = await failProxy.start();
    await assert.rejects(() => proxyRequest(failInfo, {
      path: "http://unreachable.example.com/path",
      auth: true
    }));
    const { statusCode, socket } = await proxyConnect(failInfo, "unreachable.example.com:443", true);
    assert.strictEqual(statusCode, 502);
    socket.end();
    failProxy.dispose();
  });
  test("dispose shuts down the server", async () => {
    const connectFn = createMockConnectFn(targetPort);
    const p = ds.add(new TunnelProxy(connectFn, new NullLogService()));
    const info = await p.start();
    p.dispose();
    await assert.rejects(
      () => proxyRequest(info, { path: `http://127.0.0.1:${targetPort}/`, auth: true }),
      /ECONNREFUSED/
    );
  });
  test("dispose terminates active CONNECT tunnels", async () => {
    const connectFn = createMockConnectFn(targetPort);
    const p = ds.add(new TunnelProxy(connectFn, new NullLogService()));
    const info = await p.start();
    const { statusCode, socket } = await proxyConnect(info, `127.0.0.1:${targetPort}`, true);
    assert.strictEqual(statusCode, 200);
    const closed = new Promise((resolve) => socket.once("close", () => resolve()));
    p.dispose();
    await closed;
  });
  test("dispose synchronously destroys the remote tunnel socket", async () => {
    const net = await import("net");
    const remoteSockets = [];
    const connectFn = async () => {
      const socket2 = net.createConnection({ host: "127.0.0.1", port: targetPort });
      await new Promise((resolve, reject) => {
        socket2.once("connect", resolve);
        socket2.once("error", reject);
      });
      remoteSockets.push(socket2);
      return mockTunnelProtocol(socket2);
    };
    const p = ds.add(new TunnelProxy(connectFn, new NullLogService()));
    const info = await p.start();
    const { statusCode, socket } = await proxyConnect(info, `127.0.0.1:${targetPort}`, true);
    assert.strictEqual(statusCode, 200);
    assert.strictEqual(remoteSockets.length, 1);
    p.dispose();
    assert.strictEqual(remoteSockets[0].destroyed, true);
    socket.end();
  });
  test("dispose terminates CONNECT sockets stuck waiting for the upstream tunnel", async () => {
    const tls = await import("tls");
    let connectCalled;
    const connectCalledPromise = new Promise((resolve) => {
      connectCalled = resolve;
    });
    const hangingConnect = () => {
      connectCalled();
      return new Promise(() => {
      });
    };
    const p = ds.add(new TunnelProxy(hangingConnect, new NullLogService()));
    const info = await p.start();
    const clientSocket = await new Promise((resolve, reject) => {
      const s = tls.connect({
        host: "127.0.0.1",
        port: info.port,
        rejectUnauthorized: false
      }, () => {
        const authHeader = "Basic " + Buffer.from(`${info.credentials.username}:${info.credentials.password}`).toString("base64");
        s.write(`CONNECT 127.0.0.1:${targetPort} HTTP/1.1\r
Host: 127.0.0.1:${targetPort}\r
Proxy-Authorization: ${authHeader}\r
\r
`);
        resolve(s);
      });
      s.on("error", reject);
    });
    await connectCalledPromise;
    const closed = new Promise((resolve) => clientSocket.once("close", () => resolve()));
    p.dispose();
    await closed;
  });
  test("dispose terminates idle HTTPS keep-alive connections", async () => {
    const https = await import("https");
    const connectFn = createMockConnectFn(targetPort);
    const p = ds.add(new TunnelProxy(connectFn, new NullLogService()));
    const info = await p.start();
    const agent = new https.Agent({ keepAlive: true, rejectUnauthorized: false });
    const responseSocket = await new Promise((resolve, reject) => {
      let socket;
      const req = https.request({
        agent,
        hostname: "127.0.0.1",
        port: info.port,
        method: "GET",
        path: `http://127.0.0.1:${targetPort}/keepalive`,
        headers: {
          "Proxy-Authorization": "Basic " + Buffer.from(`${info.credentials.username}:${info.credentials.password}`).toString("base64")
        }
      }, (res) => {
        res.on("data", () => {
        });
        res.on("end", () => resolve(socket));
      });
      req.on("socket", (s) => {
        socket = s;
      });
      req.on("error", reject);
      req.end();
    });
    const closed = new Promise((resolve) => responseSocket.once("close", () => resolve()));
    p.dispose();
    agent.destroy();
    await closed;
  });
  suite("managed (non-NodeSocket) transport", () => {
    let managedProxy;
    let managedInfo;
    setup(async () => {
      managedProxy = ds.add(new TunnelProxy(createManagedConnectFn(targetPort), new NullLogService()));
      managedInfo = await managedProxy.start();
    });
    teardown(() => {
      managedProxy.dispose();
    });
    test("forwards an authenticated HTTP GET through a managed socket", async () => {
      const res = await proxyRequest(managedInfo, {
        path: `http://127.0.0.1:${targetPort}/managed/path`,
        auth: true
      });
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body, "ECHO GET /managed/path");
    });
    test("CONNECT tunnels bidirectional data through a managed socket", async () => {
      const { statusCode, socket } = await proxyConnect(managedInfo, `127.0.0.1:${targetPort}`, true);
      assert.strictEqual(statusCode, 200);
      socket.write(`GET /managed-tunnel HTTP/1.1\r
Host: 127.0.0.1:${targetPort}\r
Connection: close\r
\r
`);
      const body = await new Promise((resolve, reject) => {
        const chunks = [];
        socket.on("data", (c) => chunks.push(c));
        socket.on("end", () => resolve(Buffer.concat(chunks).toString()));
        socket.on("error", reject);
      });
      assert.ok(body.includes("ECHO GET /managed-tunnel"), `Expected tunneled echo, got: ${body}`);
    });
    test("dispose disposes the managed remote socket via the adapter", async () => {
      let captured;
      const p = ds.add(new TunnelProxy(createManagedConnectFn(targetPort, (s) => {
        captured = s;
      }), new NullLogService()));
      const info = await p.start();
      const { statusCode, socket } = await proxyConnect(info, `127.0.0.1:${targetPort}`, true);
      assert.strictEqual(statusCode, 200);
      assert.ok(captured);
      p.dispose();
      assert.strictEqual(captured.isDisposed, true);
      socket.end();
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdHVubmVsXFx0ZXN0XFxub2RlXFx0dW5uZWxQcm94eS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHR5cGUgeyBJbmNvbWluZ0h0dHBIZWFkZXJzLCBTZXJ2ZXIgfSBmcm9tICdodHRwJztcbmltcG9ydCB0eXBlIHsgQWRkcmVzc0luZm8gfSBmcm9tICduZXQnO1xuaW1wb3J0IHR5cGUgeyBUTFNTb2NrZXQgfSBmcm9tICd0bHMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUdW5uZWxDb25uZWN0Rm4sIFR1bm5lbFByb3h5IH0gZnJvbSAnLi4vLi4vbm9kZS90dW5uZWxQcm94eS5qcyc7XG5pbXBvcnQgeyBJVHVubmVsUHJveHlJbmZvIH0gZnJvbSAnLi4vLi4vY29tbW9uL3R1bm5lbFByb3h5LmpzJztcbmltcG9ydCB7IE5vZGVTb2NrZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9ub2RlL2lwYy5uZXQuanMnO1xuaW1wb3J0IHsgSVNvY2tldCwgU29ja2V0Q2xvc2VFdmVudCwgU29ja2V0Q2xvc2VFdmVudFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLm5ldC5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuXG4vKipcbiAqIFdyYXAgYSByYXcgYG5ldC5Tb2NrZXRgIGluIHRoZSBwcm90b2NvbC1saWtlIHNoYXBlIHRoYXQgYFR1bm5lbFByb3h5YFxuICogZXhwZWN0cywgZW11bGF0aW5nIHRoZSByZW1vdGUgYWdlbnQuIFRoZSB0dW5uZWwgaGFuZHNoYWtlICh0aGUgcmVtb3RlXG4gKiBjb25maXJtaW5nIHRoZSB0YXJnZXQgaXMgcmVhY2hhYmxlKSBoYXBwZW5zIGluc2lkZSB0aGUgcmVhbCBjb25uZWN0XG4gKiBmdW5jdGlvbiwgd2hpY2ggdGhlIHByb3h5IHRlc3RzIHJlcGxhY2U7IHJlYWNoaW5nIHRoaXMgaGVscGVyIHRoZXJlZm9yZVxuICogYWx3YXlzIHJlcHJlc2VudHMgYSBzdWNjZXNzZnVsbHkgZXN0YWJsaXNoZWQgdHVubmVsLCBzbyBubyBzdGF0dXMgaXNcbiAqIGRlbGl2ZXJlZCBoZXJlLiBBIGZhaWxlZCB0dW5uZWwgaXMgc2ltdWxhdGVkIGJ5IGEgY29ubmVjdCBmdW5jdGlvbiB0aGF0XG4gKiByZWplY3RzIGluc3RlYWQuXG4gKi9cbmZ1bmN0aW9uIG1vY2tUdW5uZWxQcm90b2NvbChzb2NrZXQ6IGltcG9ydCgnbmV0JykuU29ja2V0KSB7XG5cdHJldHVybiB7XG5cdFx0Z2V0U29ja2V0OiAoKSA9PiBuZXcgTm9kZVNvY2tldChzb2NrZXQpLFxuXHRcdHJlYWRFbnRpcmVCdWZmZXI6ICgpID0+IFZTQnVmZmVyLmFsbG9jKDApLFxuXHRcdGRpc3Bvc2U6ICgpID0+IHsgLyogTm9kZVNvY2tldCBvd25zIHRoZSB1bmRlcmx5aW5nIHNvY2tldCAqLyB9LFxuXHR9O1xufVxuXG4vKipcbiAqIENyZWF0ZSBhIG1vY2sge0BsaW5rIElUdW5uZWxDb25uZWN0Rm59IHRoYXQgY29ubmVjdHMgdG8gYSBsb2NhbCBUQ1BcbiAqIHNlcnZlciBpbnN0ZWFkIG9mIGdvaW5nIHRocm91Z2ggdGhlIHJlbW90ZSBhZ2VudC4gUmV0dXJucyBhXG4gKiBgTm9kZVNvY2tldGAgd3JhcHBlZCBpbiB0aGUgcHJvdG9jb2wtbGlrZSBzaGFwZSB0aGF0IGBUdW5uZWxQcm94eWBcbiAqIGV4cGVjdHMuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZU1vY2tDb25uZWN0Rm4odGFyZ2V0UG9ydDogbnVtYmVyKTogSVR1bm5lbENvbm5lY3RGbiB7XG5cdHJldHVybiBhc3luYyAoX2hvc3Q6IHN0cmluZywgX3BvcnQ6IG51bWJlcikgPT4ge1xuXHRcdGNvbnN0IG5ldCA9IGF3YWl0IGltcG9ydCgnbmV0Jyk7XG5cdFx0Y29uc3Qgc29ja2V0ID0gbmV0LmNyZWF0ZUNvbm5lY3Rpb24oeyBob3N0OiAnMTI3LjAuMC4xJywgcG9ydDogdGFyZ2V0UG9ydCB9KTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRzb2NrZXQub25jZSgnY29ubmVjdCcsIHJlc29sdmUpO1xuXHRcdFx0c29ja2V0Lm9uY2UoJ2Vycm9yJywgcmVqZWN0KTtcblx0XHR9KTtcblx0XHRyZXR1cm4gbW9ja1R1bm5lbFByb3RvY29sKHNvY2tldCk7XG5cdH07XG59XG5cbi8qKlxuICogQSBnZW5lcmljIHtAbGluayBJU29ja2V0fSB0aGF0IGlzICoqbm90KiogYSB7QGxpbmsgTm9kZVNvY2tldH0sIGJhY2tlZCBieSBhXG4gKiByYXcgYG5ldC5Tb2NrZXRgLCB1c2VkIHRvIGVtdWxhdGUgYSBtYW5hZ2VkIC8gZXhlYy1zZXJ2ZXIgdHJhbnNwb3J0LiBSZWFjaGluZ1xuICogYFR1bm5lbFByb3h5YCB0aHJvdWdoIHRoaXMgc2hhcGUgZXhlcmNpc2VzIHRoZSBgUmVtb3RlU29ja2V0U3RyZWFtYCBhZGFwdGVyXG4gKiAodGhlIHByb3h5IG5ldmVyIHNlZXMgYSBgbmV0LlNvY2tldGApIHJhdGhlciB0aGFuIHRoZSByYXctc29ja2V0IGZhc3QgcGF0aC5cbiAqL1xuY2xhc3MgTWFuYWdlZFRlc3RTb2NrZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVNvY2tldCB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EYXRhID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VlNCdWZmZXI+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkNsb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8U29ja2V0Q2xvc2VFdmVudD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRW5kID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cblx0cHJpdmF0ZSBfaXNEaXNwb3NlZCA9IGZhbHNlO1xuXHRnZXQgaXNEaXNwb3NlZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2lzRGlzcG9zZWQ7IH1cblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9zb2NrZXQ6IGltcG9ydCgnbmV0JykuU29ja2V0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9zb2NrZXQub24oJ2RhdGEnLCBkID0+IHRoaXMuX29uRGF0YS5maXJlKFZTQnVmZmVyLndyYXAoZCkpKTtcblx0XHR0aGlzLl9zb2NrZXQub24oJ2VuZCcsICgpID0+IHRoaXMuX29uRW5kLmZpcmUoKSk7XG5cdFx0dGhpcy5fc29ja2V0Lm9uKCdjbG9zZScsIGhhZEVycm9yID0+IHRoaXMuX29uQ2xvc2UuZmlyZSh7IHR5cGU6IFNvY2tldENsb3NlRXZlbnRUeXBlLk5vZGVTb2NrZXRDbG9zZUV2ZW50LCBoYWRFcnJvciwgZXJyb3I6IHVuZGVmaW5lZCB9KSk7XG5cdFx0Ly8gU3dhbGxvdyB0cmFuc3BvcnQgZXJyb3JzOyB0aGV5IHN1cmZhY2UgdG8gdGhlIHByb3h5IGFzIGEgY2xvc2UgZXZlbnQuXG5cdFx0dGhpcy5fc29ja2V0Lm9uKCdlcnJvcicsICgpID0+IHsgfSk7XG5cdH1cblxuXHRvbkRhdGEobGlzdGVuZXI6IChlOiBWU0J1ZmZlcikgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHsgcmV0dXJuIHRoaXMuX29uRGF0YS5ldmVudChsaXN0ZW5lcik7IH1cblx0b25DbG9zZShsaXN0ZW5lcjogKGU6IFNvY2tldENsb3NlRXZlbnQpID0+IHZvaWQpOiBJRGlzcG9zYWJsZSB7IHJldHVybiB0aGlzLl9vbkNsb3NlLmV2ZW50KGxpc3RlbmVyKTsgfVxuXHRvbkVuZChsaXN0ZW5lcjogKCkgPT4gdm9pZCk6IElEaXNwb3NhYmxlIHsgcmV0dXJuIHRoaXMuX29uRW5kLmV2ZW50KGxpc3RlbmVyKTsgfVxuXHR3cml0ZShidWZmZXI6IFZTQnVmZmVyKTogdm9pZCB7IHRoaXMuX3NvY2tldC53cml0ZShidWZmZXIuYnVmZmVyKTsgfVxuXHRlbmQoKTogdm9pZCB7IHRoaXMuX3NvY2tldC5lbmQoKTsgfVxuXHRkcmFpbigpOiBQcm9taXNlPHZvaWQ+IHsgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpOyB9XG5cdHRyYWNlU29ja2V0RXZlbnQoKTogdm9pZCB7IH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdHRoaXMuX3NvY2tldC5kZXN0cm95KCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8qKlxuICogTGlrZSB7QGxpbmsgY3JlYXRlTW9ja0Nvbm5lY3RGbn0sIGJ1dCBwcmVzZW50cyB0aGUgdHVubmVsIGFzIGEgZ2VuZXJpY1xuICoge0BsaW5rIElTb2NrZXR9IChtYW5hZ2VkIC8gZXhlYy1zZXJ2ZXIgdHJhbnNwb3J0KSBpbnN0ZWFkIG9mIGFcbiAqIHtAbGluayBOb2RlU29ja2V0fSwgc28gdGhlIHByb3h5IHJvdXRlcyBpdCB0aHJvdWdoIGl0cyBgUmVtb3RlU29ja2V0U3RyZWFtYFxuICogYWRhcHRlci4gVGhlIHByb3RvY29sJ3MgYGRpc3Bvc2VgIGlzIGEgbm8tb3AgYmVjYXVzZSB0aGUgYWRhcHRlciBvd25zIHRoZVxuICogbWFuYWdlZCBzb2NrZXQgYW5kIGRpc3Bvc2VzIGl0IHdoZW4gdGhlIHN0cmVhbSBpcyBkZXN0cm95ZWQuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZU1hbmFnZWRDb25uZWN0Rm4odGFyZ2V0UG9ydDogbnVtYmVyLCBvblNvY2tldD86IChzb2NrZXQ6IE1hbmFnZWRUZXN0U29ja2V0KSA9PiB2b2lkKTogSVR1bm5lbENvbm5lY3RGbiB7XG5cdHJldHVybiBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbmV0ID0gYXdhaXQgaW1wb3J0KCduZXQnKTtcblx0XHRjb25zdCBzb2NrZXQgPSBuZXQuY3JlYXRlQ29ubmVjdGlvbih7IGhvc3Q6ICcxMjcuMC4wLjEnLCBwb3J0OiB0YXJnZXRQb3J0IH0pO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdHNvY2tldC5vbmNlKCdjb25uZWN0JywgcmVzb2x2ZSk7XG5cdFx0XHRzb2NrZXQub25jZSgnZXJyb3InLCByZWplY3QpO1xuXHRcdH0pO1xuXHRcdGNvbnN0IG1hbmFnZWQgPSBuZXcgTWFuYWdlZFRlc3RTb2NrZXQoc29ja2V0KTtcblx0XHRvblNvY2tldD8uKG1hbmFnZWQpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRnZXRTb2NrZXQ6ICgpID0+IG1hbmFnZWQsXG5cdFx0XHRyZWFkRW50aXJlQnVmZmVyOiAoKSA9PiBWU0J1ZmZlci5hbGxvYygwKSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgLyogdGhlIGFkYXB0ZXIgb3ducyBhbmQgZGlzcG9zZXMgdGhlIG1hbmFnZWQgc29ja2V0ICovIH0sXG5cdFx0fTtcblx0fTtcbn1cblxuLyoqXG4gKiBNYWtlIGFuIEhUVFBTIHJlcXVlc3QgdG8gdGhlIHByb3h5LCBza2lwcGluZyBjZXJ0IHZlcmlmaWNhdGlvblxuICogKHNlbGYtc2lnbmVkKS4gUmV0dXJucyB0aGUgcmVzcG9uc2Ugc3RhdHVzIGNvZGUgYW5kIGJvZHkuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHByb3h5UmVxdWVzdChcblx0aW5mbzogSVR1bm5lbFByb3h5SW5mbyxcblx0b3B0aW9uczogeyBtZXRob2Q/OiBzdHJpbmc7IHBhdGg6IHN0cmluZzsgYXV0aD86IGJvb2xlYW47IGhlYWRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IH0sXG4pOiBQcm9taXNlPHsgc3RhdHVzQ29kZTogbnVtYmVyOyBoZWFkZXJzOiBJbmNvbWluZ0h0dHBIZWFkZXJzOyBib2R5OiBzdHJpbmcgfT4ge1xuXHRjb25zdCBodHRwcyA9IGF3YWl0IGltcG9ydCgnaHR0cHMnKTtcblx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRjb25zdCBhdXRoSGVhZGVyID0gb3B0aW9ucy5hdXRoXG5cdFx0XHQ/ICdCYXNpYyAnICsgQnVmZmVyLmZyb20oYCR7aW5mby5jcmVkZW50aWFscy51c2VybmFtZX06JHtpbmZvLmNyZWRlbnRpYWxzLnBhc3N3b3JkfWApLnRvU3RyaW5nKCdiYXNlNjQnKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCByZXEgPSBodHRwcy5yZXF1ZXN0KHtcblx0XHRcdGhvc3RuYW1lOiAnMTI3LjAuMC4xJyxcblx0XHRcdHBvcnQ6IGluZm8ucG9ydCxcblx0XHRcdG1ldGhvZDogb3B0aW9ucy5tZXRob2QgPz8gJ0dFVCcsXG5cdFx0XHRwYXRoOiBvcHRpb25zLnBhdGgsXG5cdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdC4uLm9wdGlvbnMuaGVhZGVycyxcblx0XHRcdFx0Li4uKGF1dGhIZWFkZXIgPyB7ICdQcm94eS1BdXRob3JpemF0aW9uJzogYXV0aEhlYWRlciB9IDoge30pLFxuXHRcdFx0fSxcblx0XHRcdHJlamVjdFVuYXV0aG9yaXplZDogZmFsc2UsXG5cdFx0fSwgcmVzID0+IHtcblx0XHRcdGNvbnN0IGNodW5rczogQnVmZmVyW10gPSBbXTtcblx0XHRcdHJlcy5vbignZGF0YScsIGMgPT4gY2h1bmtzLnB1c2goYykpO1xuXHRcdFx0cmVzLm9uKCdlbmQnLCAoKSA9PiByZXNvbHZlKHtcblx0XHRcdFx0c3RhdHVzQ29kZTogcmVzLnN0YXR1c0NvZGUhLFxuXHRcdFx0XHRoZWFkZXJzOiByZXMuaGVhZGVycyxcblx0XHRcdFx0Ym9keTogQnVmZmVyLmNvbmNhdChjaHVua3MpLnRvU3RyaW5nKCksXG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cdFx0cmVxLm9uKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0cmVxLmVuZCgpO1xuXHR9KTtcbn1cblxuLyoqXG4gKiBPcGVuIGEgVExTIGNvbm5lY3Rpb24gdG8gdGhlIHByb3h5LCBzZW5kIGEgcmF3IENPTk5FQ1QgcmVxdWVzdCwgYW5kXG4gKiByZXR1cm4gdGhlIHJlc3BvbnNlIHN0YXR1cyBsaW5lIGFuZCB0aGUgdW5kZXJseWluZyBUTFMgc29ja2V0IGZvclxuICogZnVydGhlciBJL08uXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHByb3h5Q29ubmVjdChcblx0aW5mbzogSVR1bm5lbFByb3h5SW5mbyxcblx0dGFyZ2V0OiBzdHJpbmcsXG5cdGF1dGg6IGJvb2xlYW4sXG4pOiBQcm9taXNlPHsgc3RhdHVzQ29kZTogbnVtYmVyOyBzb2NrZXQ6IFRMU1NvY2tldCB9PiB7XG5cdGNvbnN0IHRscyA9IGF3YWl0IGltcG9ydCgndGxzJyk7XG5cdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29uc3Qgc29ja2V0ID0gdGxzLmNvbm5lY3Qoe1xuXHRcdFx0aG9zdDogJzEyNy4wLjAuMScsXG5cdFx0XHRwb3J0OiBpbmZvLnBvcnQsXG5cdFx0XHRyZWplY3RVbmF1dGhvcml6ZWQ6IGZhbHNlLFxuXHRcdH0sICgpID0+IHtcblx0XHRcdGNvbnN0IGF1dGhIZWFkZXIgPSBhdXRoXG5cdFx0XHRcdD8gJ0Jhc2ljICcgKyBCdWZmZXIuZnJvbShgJHtpbmZvLmNyZWRlbnRpYWxzLnVzZXJuYW1lfToke2luZm8uY3JlZGVudGlhbHMucGFzc3dvcmR9YCkudG9TdHJpbmcoJ2Jhc2U2NCcpXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0XHRsZXQgcmVxdWVzdCA9IGBDT05ORUNUICR7dGFyZ2V0fSBIVFRQLzEuMVxcclxcbkhvc3Q6ICR7dGFyZ2V0fVxcclxcbmA7XG5cdFx0XHRpZiAoYXV0aEhlYWRlcikge1xuXHRcdFx0XHRyZXF1ZXN0ICs9IGBQcm94eS1BdXRob3JpemF0aW9uOiAke2F1dGhIZWFkZXJ9XFxyXFxuYDtcblx0XHRcdH1cblx0XHRcdHJlcXVlc3QgKz0gJ1xcclxcbic7XG5cdFx0XHRzb2NrZXQud3JpdGUocmVxdWVzdCk7XG5cblx0XHRcdGxldCBkYXRhID0gJyc7XG5cdFx0XHRjb25zdCBvbkRhdGEgPSAoY2h1bms6IEJ1ZmZlcikgPT4ge1xuXHRcdFx0XHRkYXRhICs9IGNodW5rLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGNvbnN0IGhlYWRlckVuZCA9IGRhdGEuaW5kZXhPZignXFxyXFxuXFxyXFxuJyk7XG5cdFx0XHRcdGlmIChoZWFkZXJFbmQgIT09IC0xKSB7XG5cdFx0XHRcdFx0c29ja2V0LnJlbW92ZUxpc3RlbmVyKCdkYXRhJywgb25EYXRhKTtcblx0XHRcdFx0XHRjb25zdCBzdGF0dXNMaW5lID0gZGF0YS5zdWJzdHJpbmcoMCwgZGF0YS5pbmRleE9mKCdcXHJcXG4nKSk7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdHVzQ29kZSA9IHBhcnNlSW50KHN0YXR1c0xpbmUuc3BsaXQoJyAnKVsxXSwgMTApO1xuXHRcdFx0XHRcdHJlc29sdmUoeyBzdGF0dXNDb2RlLCBzb2NrZXQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRzb2NrZXQub24oJ2RhdGEnLCBvbkRhdGEpO1xuXHRcdH0pO1xuXHRcdHNvY2tldC5vbignZXJyb3InLCByZWplY3QpO1xuXHR9KTtcbn1cblxuXG5zdWl0ZSgnVHVubmVsUHJveHknLCAoKSA9PiB7XG5cblx0Y29uc3QgZHMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgdGFyZ2V0U2VydmVyOiBTZXJ2ZXI7XG5cdGxldCB0YXJnZXRQb3J0OiBudW1iZXI7XG5cblx0Ly8gQSBzaW1wbGUgSFRUUCBzZXJ2ZXIgdGhhdCBlY2hvZXMgdGhlIHJlcXVlc3QgbWV0aG9kICsgVVJMIGJhY2suXG5cdHN1aXRlU2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGh0dHAgPSBhd2FpdCBpbXBvcnQoJ2h0dHAnKTtcblx0XHR0YXJnZXRTZXJ2ZXIgPSBodHRwLmNyZWF0ZVNlcnZlcigocmVxLCByZXMpID0+IHtcblx0XHRcdHJlcy53cml0ZUhlYWQoMjAwLCB7ICdDb250ZW50LVR5cGUnOiAndGV4dC9wbGFpbicgfSk7XG5cdFx0XHRyZXMuZW5kKGBFQ0hPICR7cmVxLm1ldGhvZH0gJHtyZXEudXJsfWApO1xuXHRcdH0pO1xuXHRcdHRhcmdldFNlcnZlci5saXN0ZW4oMCwgJzEyNy4wLjAuMScpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gdGFyZ2V0U2VydmVyLm9uY2UoJ2xpc3RlbmluZycsIHJlc29sdmUpKTtcblx0XHR0YXJnZXRQb3J0ID0gKHRhcmdldFNlcnZlci5hZGRyZXNzKCkgYXMgQWRkcmVzc0luZm8pLnBvcnQ7XG5cdH0pO1xuXG5cdHN1aXRlVGVhcmRvd24oKCkgPT4ge1xuXHRcdHRhcmdldFNlcnZlci5jbG9zZSgpO1xuXHR9KTtcblxuXHRsZXQgcHJveHk6IFR1bm5lbFByb3h5O1xuXHRsZXQgcHJveHlJbmZvOiBJVHVubmVsUHJveHlJbmZvO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25uZWN0Rm4gPSBjcmVhdGVNb2NrQ29ubmVjdEZuKHRhcmdldFBvcnQpO1xuXHRcdHByb3h5ID0gZHMuYWRkKG5ldyBUdW5uZWxQcm94eShjb25uZWN0Rm4sIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0cHJveHlJbmZvID0gYXdhaXQgcHJveHkuc3RhcnQoKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHByb3h5LmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0Ly8gLS0tIElUdW5uZWxQcm94eUluZm8gc2hhcGUgLS0tXG5cblx0dGVzdCgnc3RhcnQgcmV0dXJucyBhIHZhbGlkIElUdW5uZWxQcm94eUluZm8nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3h5SW5mby5ob3N0LCAnMTI3LjAuMC4xJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBwcm94eUluZm8ucG9ydCwgJ251bWJlcicpO1xuXHRcdGFzc2VydC5vayhwcm94eUluZm8ucG9ydCA+IDAgJiYgcHJveHlJbmZvLnBvcnQgPCA2NTUzNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3h5SW5mby51cmwsIGBodHRwczovLzEyNy4wLjAuMToke3Byb3h5SW5mby5wb3J0fWApO1xuXHRcdGFzc2VydC5vayhwcm94eUluZm8uY3JlZGVudGlhbHMudXNlcm5hbWUubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0Lm9rKHByb3h5SW5mby5jcmVkZW50aWFscy5wYXNzd29yZC5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQub2socHJveHlJbmZvLmNlcnRGaW5nZXJwcmludC5zdGFydHNXaXRoKCdzaGEyNTYvJykpO1xuXHR9KTtcblxuXHQvLyAtLS0gVExTIC0tLVxuXG5cdHRlc3QoJ3NlcnZlciB1c2VzIFRMUycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0bHMgPSBhd2FpdCBpbXBvcnQoJ3RscycpO1xuXHRcdGNvbnN0IHNvY2tldCA9IGF3YWl0IG5ldyBQcm9taXNlPFRMU1NvY2tldD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0Y29uc3QgcyA9IHRscy5jb25uZWN0KHtcblx0XHRcdFx0aG9zdDogJzEyNy4wLjAuMScsXG5cdFx0XHRcdHBvcnQ6IHByb3h5SW5mby5wb3J0LFxuXHRcdFx0XHRyZWplY3RVbmF1dGhvcml6ZWQ6IGZhbHNlLFxuXHRcdFx0fSwgKCkgPT4gcmVzb2x2ZShzKSk7XG5cdFx0XHRzLm9uKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0fSk7XG5cdFx0YXNzZXJ0Lm9rKHNvY2tldC5lbmNyeXB0ZWQpO1xuXHRcdGNvbnN0IGNlcnQgPSBzb2NrZXQuZ2V0UGVlckNlcnRpZmljYXRlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlcnQuc3ViamVjdD8uQ04sICdUdW5uZWxQcm94eScpO1xuXHRcdHNvY2tldC5lbmQoKTtcblx0fSk7XG5cblx0Ly8gLS0tIEF1dGhlbnRpY2F0aW9uIC0tLVxuXG5cdHRlc3QoJ3JlamVjdHMgcGxhaW4gSFRUUCByZXF1ZXN0IHdpdGhvdXQgY3JlZGVudGlhbHMgKDQwNyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgcHJveHlSZXF1ZXN0KHByb3h5SW5mbywge1xuXHRcdFx0cGF0aDogYGh0dHA6Ly8xMjcuMC4wLjE6JHt0YXJnZXRQb3J0fS9oZWxsb2AsXG5cdFx0XHRhdXRoOiBmYWxzZSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1c0NvZGUsIDQwNyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgQ09OTkVDVCB3aXRob3V0IGNyZWRlbnRpYWxzICg0MDcpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc3RhdHVzQ29kZSwgc29ja2V0IH0gPSBhd2FpdCBwcm94eUNvbm5lY3QoXG5cdFx0XHRwcm94eUluZm8sXG5cdFx0XHRgMTI3LjAuMC4xOiR7dGFyZ2V0UG9ydH1gLFxuXHRcdFx0ZmFsc2UsXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdHVzQ29kZSwgNDA3KTtcblx0XHRzb2NrZXQuZW5kKCk7XG5cdH0pO1xuXG5cdC8vIC0tLSBQbGFpbiBIVFRQIGZvcndhcmRpbmcgLS0tXG5cblx0dGVzdCgnZm9yd2FyZHMgYXV0aGVudGljYXRlZCBIVFRQIEdFVCB0byB0YXJnZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgcHJveHlSZXF1ZXN0KHByb3h5SW5mbywge1xuXHRcdFx0cGF0aDogYGh0dHA6Ly8xMjcuMC4wLjE6JHt0YXJnZXRQb3J0fS9zb21lL3BhdGhgLFxuXHRcdFx0YXV0aDogdHJ1ZSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1c0NvZGUsIDIwMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5ib2R5LCBgRUNITyBHRVQgL3NvbWUvcGF0aGApO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3J3YXJkcyBhdXRoZW50aWNhdGVkIEhUVFAgUE9TVCB0byB0YXJnZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgcHJveHlSZXF1ZXN0KHByb3h5SW5mbywge1xuXHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRwYXRoOiBgaHR0cDovLzEyNy4wLjAuMToke3RhcmdldFBvcnR9L3Bvc3RgLFxuXHRcdFx0YXV0aDogdHJ1ZSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1c0NvZGUsIDIwMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5ib2R5LCAnRUNITyBQT1NUIC9wb3N0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmlwcyBob3AtYnktaG9wIGhlYWRlcnMgZnJvbSBmb3J3YXJkZWQgcmVxdWVzdCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBVc2UgYSB0YXJnZXQgdGhhdCBlY2hvZXMgYWxsIHJlY2VpdmVkIGhlYWRlcnMgYXMgSlNPTlxuXHRcdGNvbnN0IGh0dHAgPSBhd2FpdCBpbXBvcnQoJ2h0dHAnKTtcblx0XHRjb25zdCBoZWFkZXJTZXJ2ZXIgPSBodHRwLmNyZWF0ZVNlcnZlcigocmVxLCByZXMpID0+IHtcblx0XHRcdHJlcy53cml0ZUhlYWQoMjAwLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG5cdFx0XHRyZXMuZW5kKEpTT04uc3RyaW5naWZ5KHJlcS5oZWFkZXJzKSk7XG5cdFx0fSk7XG5cdFx0aGVhZGVyU2VydmVyLmxpc3RlbigwLCAnMTI3LjAuMC4xJyk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBoZWFkZXJTZXJ2ZXIub25jZSgnbGlzdGVuaW5nJywgcmVzb2x2ZSkpO1xuXHRcdGNvbnN0IGhlYWRlclBvcnQgPSAoaGVhZGVyU2VydmVyLmFkZHJlc3MoKSBhcyBBZGRyZXNzSW5mbykucG9ydDtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb25uZWN0Rm4gPSBjcmVhdGVNb2NrQ29ubmVjdEZuKGhlYWRlclBvcnQpO1xuXHRcdFx0Y29uc3QgcHJveHkyID0gZHMuYWRkKG5ldyBUdW5uZWxQcm94eShjb25uZWN0Rm4sIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBpbmZvMiA9IGF3YWl0IHByb3h5Mi5zdGFydCgpO1xuXG5cdFx0XHRjb25zdCByZXMgPSBhd2FpdCBwcm94eVJlcXVlc3QoaW5mbzIsIHtcblx0XHRcdFx0cGF0aDogYGh0dHA6Ly8xMjcuMC4wLjE6JHtoZWFkZXJQb3J0fS9gLFxuXHRcdFx0XHRhdXRoOiB0cnVlLFxuXHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0J0Nvbm5lY3Rpb24nOiAna2VlcC1hbGl2ZSwgWC1DdXN0b20tSG9wJyxcblx0XHRcdFx0XHQnS2VlcC1BbGl2ZSc6ICd0aW1lb3V0PTUnLFxuXHRcdFx0XHRcdCdQcm94eS1Db25uZWN0aW9uJzogJ2tlZXAtYWxpdmUnLFxuXHRcdFx0XHRcdCdURSc6ICd0cmFpbGVycycsXG5cdFx0XHRcdFx0J1VwZ3JhZGUnOiAnd2Vic29ja2V0Jyxcblx0XHRcdFx0XHQnWC1DdXN0b20tSG9wJzogJ3Nob3VsZC1iZS1yZW1vdmVkJyxcblx0XHRcdFx0XHQnWC1FbmQtVG8tRW5kJzogJ3Nob3VsZC1zdXJ2aXZlJyxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXNDb2RlLCAyMDApO1xuXHRcdFx0Y29uc3QgZm9yd2FyZGVkID0gSlNPTi5wYXJzZShyZXMuYm9keSk7XG5cdFx0XHQvLyBBbGwgaG9wLWJ5LWhvcCBoZWFkZXJzIE1VU1QvU0hPVUxEIGJlIHJlbW92ZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3J3YXJkZWRbJ3Byb3h5LWF1dGhvcml6YXRpb24nXSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3J3YXJkZWRbJ3Byb3h5LWNvbm5lY3Rpb24nXSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3J3YXJkZWRbJ2tlZXAtYWxpdmUnXSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3J3YXJkZWRbJ3RlJ10sIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9yd2FyZGVkWyd1cGdyYWRlJ10sIHVuZGVmaW5lZCk7XG5cdFx0XHQvLyBIZWFkZXJzIG5hbWVkIGluIENvbm5lY3Rpb24gbXVzdCBhbHNvIGJlIHJlbW92ZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3J3YXJkZWRbJ3gtY3VzdG9tLWhvcCddLCB1bmRlZmluZWQpO1xuXHRcdFx0Ly8gTm90ZTogY29ubmVjdGlvbiBpdHNlbGYgaXMgcmVwbGFjZWQgYnkgTm9kZSdzIGh0dHAuQWdlbnQgd2l0aFxuXHRcdFx0Ly8gaXRzIG93biB2YWx1ZSAoZS5nLiBcImtlZXAtYWxpdmVcIiksIHdoaWNoIGlzIGNvcnJlY3QgcGVyIFJGQyA5MTEwXG5cdFx0XHQvLyBcdTIwMTQgdGhlIHByb3h5IHJlcGxhY2VzIGl0IHdpdGggaXRzIG93biBjb25uZWN0aW9uIG9wdGlvbnMuXG5cdFx0XHQvLyBFbmQtdG8tZW5kIGhlYWRlcnMgbXVzdCBzdXJ2aXZlXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9yd2FyZGVkWyd4LWVuZC10by1lbmQnXSwgJ3Nob3VsZC1zdXJ2aXZlJyk7XG5cdFx0XHRwcm94eTIuZGlzcG9zZSgpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRoZWFkZXJTZXJ2ZXIuY2xvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgNDAwIGZvciBtYWxmb3JtZWQgVVJMJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHByb3h5UmVxdWVzdChwcm94eUluZm8sIHtcblx0XHRcdHBhdGg6ICdub3QtYS12YWxpZC11cmwnLFxuXHRcdFx0YXV0aDogdHJ1ZSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1c0NvZGUsIDQwMCk7XG5cdH0pO1xuXG5cdC8vIC0tLSBBZ2VudCBjb25uZWN0aW9uIHBvb2xpbmcgLS0tXG5cblx0dGVzdCgncmV1c2VzIHR1bm5lbCBzb2NrZXQgZm9yIG11bHRpcGxlIHJlcXVlc3RzIHRvIHRoZSBzYW1lIGhvc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbmV0ID0gYXdhaXQgaW1wb3J0KCduZXQnKTtcblx0XHRsZXQgY29ubmVjdENvdW50ID0gMDtcblx0XHRjb25zdCBjb3VudGluZ0Nvbm5lY3Q6IElUdW5uZWxDb25uZWN0Rm4gPSBhc3luYyAoX2hvc3QsIF9wb3J0KSA9PiB7XG5cdFx0XHRjb25uZWN0Q291bnQrKztcblx0XHRcdGNvbnN0IHNvY2tldCA9IG5ldC5jcmVhdGVDb25uZWN0aW9uKHsgaG9zdDogJzEyNy4wLjAuMScsIHBvcnQ6IHRhcmdldFBvcnQgfSk7XG5cdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdHNvY2tldC5vbmNlKCdjb25uZWN0JywgcmVzb2x2ZSk7XG5cdFx0XHRcdHNvY2tldC5vbmNlKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBtb2NrVHVubmVsUHJvdG9jb2woc29ja2V0KTtcblx0XHR9O1xuXHRcdGNvbnN0IHBvb2xQcm94eSA9IGRzLmFkZChuZXcgVHVubmVsUHJveHkoY291bnRpbmdDb25uZWN0LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHBvb2xJbmZvID0gYXdhaXQgcG9vbFByb3h5LnN0YXJ0KCk7XG5cblx0XHQvLyBTZW5kIHRocmVlIHNlcXVlbnRpYWwgcmVxdWVzdHMgdG8gdGhlIHNhbWUgaG9zdDpwb3J0XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAzOyBpKyspIHtcblx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IHByb3h5UmVxdWVzdChwb29sSW5mbywge1xuXHRcdFx0XHRwYXRoOiBgaHR0cDovLzEyNy4wLjAuMToke3RhcmdldFBvcnR9L3JlcSR7aX1gLFxuXHRcdFx0XHRhdXRoOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1c0NvZGUsIDIwMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmJvZHksIGBFQ0hPIEdFVCAvcmVxJHtpfWApO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBhZ2VudCBzaG91bGQgaGF2ZSBvcGVuZWQgb25seSBvbmUgdHVubmVsIGNvbm5lY3Rpb25cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29ubmVjdENvdW50LCAxLCBgRXhwZWN0ZWQgMSB0dW5uZWwgY29ubmVjdGlvbiwgZ290ICR7Y29ubmVjdENvdW50fWApO1xuXHRcdHBvb2xQcm94eS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RyYWluQ29ubmVjdGlvblBvb2wgZGVzdHJveXMgcG9vbGVkIHR1bm5lbCBzb2NrZXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG5ldCA9IGF3YWl0IGltcG9ydCgnbmV0Jyk7XG5cblx0XHQvLyBDYXB0dXJlIHRoZSB1cHN0cmVhbSBuZXQuU29ja2V0IHRoZSBhZ2VudCBwb29scyBzbyB3ZSBjYW5cblx0XHQvLyBhc3NlcnQgaXQgaXMgZHJvcHBlZCB3aGVuIHRoZSB1cHN0cmVhbSBlbmRwb2ludCBjaGFuZ2VzLlxuXHRcdGNvbnN0IHJlbW90ZVNvY2tldHM6IGltcG9ydCgnbmV0JykuU29ja2V0W10gPSBbXTtcblx0XHRjb25zdCBjb25uZWN0Rm46IElUdW5uZWxDb25uZWN0Rm4gPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzb2NrZXQgPSBuZXQuY3JlYXRlQ29ubmVjdGlvbih7IGhvc3Q6ICcxMjcuMC4wLjEnLCBwb3J0OiB0YXJnZXRQb3J0IH0pO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHRzb2NrZXQub25jZSgnY29ubmVjdCcsIHJlc29sdmUpO1xuXHRcdFx0XHRzb2NrZXQub25jZSgnZXJyb3InLCByZWplY3QpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZW1vdGVTb2NrZXRzLnB1c2goc29ja2V0KTtcblx0XHRcdHJldHVybiBtb2NrVHVubmVsUHJvdG9jb2woc29ja2V0KTtcblx0XHR9O1xuXHRcdGNvbnN0IHAgPSBkcy5hZGQobmV3IFR1bm5lbFByb3h5KGNvbm5lY3RGbiwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBpbmZvID0gYXdhaXQgcC5zdGFydCgpO1xuXG5cdFx0Ly8gT25lIHJlcXVlc3QgcG9vbHMgb25lIGtlZXAtYWxpdmUgdHVubmVsIHNvY2tldC5cblx0XHRjb25zdCByZXMgPSBhd2FpdCBwcm94eVJlcXVlc3QoaW5mbywgeyBwYXRoOiBgaHR0cDovLzEyNy4wLjAuMToke3RhcmdldFBvcnR9L2AsIGF1dGg6IHRydWUgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXNDb2RlLCAyMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1vdGVTb2NrZXRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbW90ZVNvY2tldHNbMF0uZGVzdHJveWVkLCBmYWxzZSk7XG5cblx0XHQvLyBTaW11bGF0aW5nIGFuIHVwc3RyZWFtIGVuZHBvaW50IGNoYW5nZSBtdXN0IGRyb3AgdGhlIG5vdy1zdGFsZVxuXHRcdC8vIHBvb2xlZCBzb2NrZXQgc28gaXQgaXNuJ3QgcmVzZXQgbGF0ZXIgYnkgdGhlIGRlYWQgZW5kcG9pbnQuXG5cdFx0Y29uc3QgY2xvc2VkID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiByZW1vdGVTb2NrZXRzWzBdLm9uY2UoJ2Nsb3NlJywgKCkgPT4gcmVzb2x2ZSgpKSk7XG5cdFx0cC5kcmFpbkNvbm5lY3Rpb25Qb29sKCk7XG5cdFx0YXdhaXQgY2xvc2VkO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1vdGVTb2NrZXRzWzBdLmRlc3Ryb3llZCwgdHJ1ZSk7XG5cblx0XHRwLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnYSByZXNldCBvbiBhIHBvb2xlZCB0dW5uZWwgc29ja2V0IGRvZXMgbm90IGVzY2FsYXRlIHRvIGFuIHVuY2F1Z2h0IGV4Y2VwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBuZXQgPSBhd2FpdCBpbXBvcnQoJ25ldCcpO1xuXG5cdFx0Ly8gQ2FwdHVyZSB0aGUgcG9vbGVkIHVwc3RyZWFtIG5ldC5Tb2NrZXQgc28gd2UgY2FuIHNpbXVsYXRlIHRoZVxuXHRcdC8vIHVwc3RyZWFtIGVuZHBvaW50IHJlc2V0dGluZyBpdC5cblx0XHRjb25zdCByZW1vdGVTb2NrZXRzOiBpbXBvcnQoJ25ldCcpLlNvY2tldFtdID0gW107XG5cdFx0Y29uc3QgY29ubmVjdEZuOiBJVHVubmVsQ29ubmVjdEZuID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc29ja2V0ID0gbmV0LmNyZWF0ZUNvbm5lY3Rpb24oeyBob3N0OiAnMTI3LjAuMC4xJywgcG9ydDogdGFyZ2V0UG9ydCB9KTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0c29ja2V0Lm9uY2UoJ2Nvbm5lY3QnLCByZXNvbHZlKTtcblx0XHRcdFx0c29ja2V0Lm9uY2UoJ2Vycm9yJywgcmVqZWN0KTtcblx0XHRcdH0pO1xuXHRcdFx0cmVtb3RlU29ja2V0cy5wdXNoKHNvY2tldCk7XG5cdFx0XHRyZXR1cm4gbW9ja1R1bm5lbFByb3RvY29sKHNvY2tldCk7XG5cdFx0fTtcblx0XHRjb25zdCBwID0gZHMuYWRkKG5ldyBUdW5uZWxQcm94eShjb25uZWN0Rm4sIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgaW5mbyA9IGF3YWl0IHAuc3RhcnQoKTtcblxuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHByb3h5UmVxdWVzdChpbmZvLCB7IHBhdGg6IGBodHRwOi8vMTI3LjAuMC4xOiR7dGFyZ2V0UG9ydH0vYCwgYXV0aDogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1c0NvZGUsIDIwMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbW90ZVNvY2tldHMubGVuZ3RoLCAxKTtcblxuXHRcdC8vIFdoZW4gdGhlIHVwc3RyZWFtIGVuZHBvaW50IGRpZXMsIHRoZSBwb29sZWQgc29ja2V0IGlzIHJlc2V0LlxuXHRcdC8vIFRoZSBwcm94eSB0YWtlcyBvd25lcnNoaXAgb2YgdGhlIHJhdyBzb2NrZXQgKGRldGFjaGluZ1xuXHRcdC8vIE5vZGVTb2NrZXQncyBsaXN0ZW5lcnMsIHdoaWNoIHdvdWxkIG90aGVyd2lzZSByb3V0ZSB0aGUgZXJyb3Jcblx0XHQvLyB0aHJvdWdoIG9uVW5leHBlY3RlZEVycm9yKSBhbmQgYXR0YWNoZXMgaXRzIG93biAnZXJyb3InXG5cdFx0Ly8gaGFuZGxlciwgc28gdGhlIHJlc2V0IGlzIGNvbnRhaW5lZCByYXRoZXIgdGhhbiB0aHJvd24gb3Jcblx0XHQvLyByZXBvcnRlZCBhcyBhbiB1bmV4cGVjdGVkIGVycm9yLlxuXHRcdGFzc2VydC5kb2VzTm90VGhyb3coKCkgPT4gcmVtb3RlU29ja2V0c1swXS5lbWl0KCdlcnJvcicsIG5ldyBFcnJvcignc2ltdWxhdGVkIHVwc3RyZWFtIHJlc2V0JykpKTtcblxuXHRcdHAuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHQvLyAtLS0gQ09OTkVDVCB0dW5uZWxpbmcgLS0tXG5cblx0dGVzdCgnQ09OTkVDVCBlc3RhYmxpc2hlcyBhIHR1bm5lbCB0byB0aGUgdGFyZ2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc3RhdHVzQ29kZSwgc29ja2V0IH0gPSBhd2FpdCBwcm94eUNvbm5lY3QoXG5cdFx0XHRwcm94eUluZm8sXG5cdFx0XHRgMTI3LjAuMC4xOiR7dGFyZ2V0UG9ydH1gLFxuXHRcdFx0dHJ1ZSxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0dXNDb2RlLCAyMDApO1xuXG5cdFx0Ly8gU2VuZCBhIHJhdyBIVFRQIHJlcXVlc3QgdGhyb3VnaCB0aGUgdHVubmVsXG5cdFx0c29ja2V0LndyaXRlKGBHRVQgL3R1bm5lbGVkIEhUVFAvMS4xXFxyXFxuSG9zdDogMTI3LjAuMC4xOiR7dGFyZ2V0UG9ydH1cXHJcXG5Db25uZWN0aW9uOiBjbG9zZVxcclxcblxcclxcbmApO1xuXHRcdGNvbnN0IGJvZHkgPSBhd2FpdCBuZXcgUHJvbWlzZTxzdHJpbmc+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IGNodW5rczogQnVmZmVyW10gPSBbXTtcblx0XHRcdHNvY2tldC5vbignZGF0YScsIGMgPT4gY2h1bmtzLnB1c2goYykpO1xuXHRcdFx0c29ja2V0Lm9uKCdlbmQnLCAoKSA9PiByZXNvbHZlKEJ1ZmZlci5jb25jYXQoY2h1bmtzKS50b1N0cmluZygpKSk7XG5cdFx0XHRzb2NrZXQub24oJ2Vycm9yJywgcmVqZWN0KTtcblx0XHR9KTtcblx0XHRhc3NlcnQub2soYm9keS5pbmNsdWRlcygnRUNITyBHRVQgL3R1bm5lbGVkJyksIGBFeHBlY3RlZCB0dW5uZWxlZCBlY2hvLCBnb3Q6ICR7Ym9keX1gKTtcblx0fSk7XG5cblx0dGVzdCgnQ09OTkVDVCByZWplY3RzIGludmFsaWQgcG9ydCAwJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgc3RhdHVzQ29kZSwgc29ja2V0IH0gPSBhd2FpdCBwcm94eUNvbm5lY3QocHJveHlJbmZvLCAnMTI3LjAuMC4xOjAnLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdHVzQ29kZSwgNDAwKTtcblx0XHRzb2NrZXQuZW5kKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NPTk5FQ1QgcmVqZWN0cyBwb3J0ID4gNjU1MzUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBzdGF0dXNDb2RlLCBzb2NrZXQgfSA9IGF3YWl0IHByb3h5Q29ubmVjdChwcm94eUluZm8sICcxMjcuMC4wLjE6OTk5OTknLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdHVzQ29kZSwgNDAwKTtcblx0XHRzb2NrZXQuZW5kKCk7XG5cdH0pO1xuXG5cdC8vIC0tLSBFcnJvciBoYW5kbGluZyAtLS1cblxuXHR0ZXN0KCdmYWlscyB0aGUgcmVxdWVzdCB3aGVuIHRoZSB0dW5uZWwgY29ubmVjdGlvbiBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHQvLyBBIGZhaWxlZCB0dW5uZWwgLSB3aGV0aGVyIHRoZSByZW1vdGUgYWdlbnQgaXRzZWxmIGlzIHVucmVhY2hhYmxlIG9yXG5cdFx0Ly8gdGhlIHJlbW90ZSByZXBvcnRzICh2aWEgdGhlIGhhbmRzaGFrZSkgdGhhdCB0aGUgdGFyZ2V0IGhvc3Q6cG9ydCBpc1xuXHRcdC8vIHVucmVhY2hhYmxlIC0gc3VyZmFjZXMgaGVyZSBhcyBhIHJlamVjdGVkIGNvbm5lY3QgZnVuY3Rpb24uXG5cdFx0Y29uc3QgZmFpbGluZ0Nvbm5lY3Q6IElUdW5uZWxDb25uZWN0Rm4gPSBhc3luYyAoKSA9PiB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2Nvbm5lY3QgRUNPTk5SRUZVU0VEIDEyNy4wLjAuMTo5OTk5Jyk7XG5cdFx0fTtcblx0XHRjb25zdCBmYWlsUHJveHkgPSBkcy5hZGQobmV3IFR1bm5lbFByb3h5KGZhaWxpbmdDb25uZWN0LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IGZhaWxJbmZvID0gYXdhaXQgZmFpbFByb3h5LnN0YXJ0KCk7XG5cblx0XHQvLyBQbGFpbiBIVFRQIHJlcXVlc3Q6IHRoZSBjbGllbnQgY29ubmVjdGlvbiBpcyByZXNldCAobm8gSFRUUFxuXHRcdC8vIHJlc3BvbnNlKSBzbyB0aGUgYnJvd3NlciBzaG93cyBpdHMgbmF0aXZlIGVycm9yIHBhZ2UuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gcHJveHlSZXF1ZXN0KGZhaWxJbmZvLCB7XG5cdFx0XHRwYXRoOiAnaHR0cDovL3VucmVhY2hhYmxlLmV4YW1wbGUuY29tL3BhdGgnLFxuXHRcdFx0YXV0aDogdHJ1ZSxcblx0XHR9KSk7XG5cblx0XHQvLyBDT05ORUNUIHNob3VsZCBmYWlsIHdpdGggYSA1MDIgKHdoaWNoIHRoZSBicm93c2VyIHN1cmZhY2VzIGFzIGFcblx0XHQvLyBuYXRpdmUgdHVubmVsIGVycm9yIHBhZ2UpLlxuXHRcdGNvbnN0IHsgc3RhdHVzQ29kZSwgc29ja2V0IH0gPSBhd2FpdCBwcm94eUNvbm5lY3QoZmFpbEluZm8sICd1bnJlYWNoYWJsZS5leGFtcGxlLmNvbTo0NDMnLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdHVzQ29kZSwgNTAyKTtcblx0XHRzb2NrZXQuZW5kKCk7XG5cblx0XHRmYWlsUHJveHkuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHQvLyAtLS0gTGlmZWN5Y2xlIC0tLVxuXG5cdHRlc3QoJ2Rpc3Bvc2Ugc2h1dHMgZG93biB0aGUgc2VydmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3RGbiA9IGNyZWF0ZU1vY2tDb25uZWN0Rm4odGFyZ2V0UG9ydCk7XG5cdFx0Y29uc3QgcCA9IGRzLmFkZChuZXcgVHVubmVsUHJveHkoY29ubmVjdEZuLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IGluZm8gPSBhd2FpdCBwLnN0YXJ0KCk7XG5cdFx0cC5kaXNwb3NlKCk7XG5cblx0XHQvLyBDb25uZWN0aW9uIHNob3VsZCBiZSByZWZ1c2VkIGFmdGVyIGRpc3Bvc2Vcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IHByb3h5UmVxdWVzdChpbmZvLCB7IHBhdGg6IGBodHRwOi8vMTI3LjAuMC4xOiR7dGFyZ2V0UG9ydH0vYCwgYXV0aDogdHJ1ZSB9KSxcblx0XHRcdC9FQ09OTlJFRlVTRUQvLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2UgdGVybWluYXRlcyBhY3RpdmUgQ09OTkVDVCB0dW5uZWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbm5lY3RGbiA9IGNyZWF0ZU1vY2tDb25uZWN0Rm4odGFyZ2V0UG9ydCk7XG5cdFx0Y29uc3QgcCA9IGRzLmFkZChuZXcgVHVubmVsUHJveHkoY29ubmVjdEZuLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IGluZm8gPSBhd2FpdCBwLnN0YXJ0KCk7XG5cblx0XHQvLyBPcGVuIGEgQ09OTkVDVCB0dW5uZWwgYW5kIGtlZXAgaXQgb3BlbiAobm8gZW5kL2Rlc3Ryb3kpLlxuXHRcdGNvbnN0IHsgc3RhdHVzQ29kZSwgc29ja2V0IH0gPSBhd2FpdCBwcm94eUNvbm5lY3QoaW5mbywgYDEyNy4wLjAuMToke3RhcmdldFBvcnR9YCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXR1c0NvZGUsIDIwMCk7XG5cblx0XHRjb25zdCBjbG9zZWQgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHNvY2tldC5vbmNlKCdjbG9zZScsICgpID0+IHJlc29sdmUoKSkpO1xuXG5cdFx0cC5kaXNwb3NlKCk7XG5cblx0XHQvLyBUaGUgcHJldmlvdXNseS1hY3RpdmUgQ09OTkVDVCBzb2NrZXQgbXVzdCBiZSBmb3JjZS1jbG9zZWQgYnlcblx0XHQvLyBkaXNwb3NlOyB3aXRob3V0IGV4cGxpY2l0IHRlYXJkb3duIG9mIHRoZXNlIHNvY2tldHMsXG5cdFx0Ly8gYHNlcnZlci5jbG9zZSgpYCBhbG9uZSB3b3VsZCBsZWF2ZSB0aGUgcG9ydCBib3VuZCBpbmRlZmluaXRlbHkuXG5cdFx0YXdhaXQgY2xvc2VkO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NlIHN5bmNocm9ub3VzbHkgZGVzdHJveXMgdGhlIHJlbW90ZSB0dW5uZWwgc29ja2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG5ldCA9IGF3YWl0IGltcG9ydCgnbmV0Jyk7XG5cblx0XHQvLyBDYXB0dXJlIHRoZSByZW1vdGUgKHVwc3RyZWFtKSBuZXQuU29ja2V0IGhhbmRlZCBvdXQgYnkgdGhlXG5cdFx0Ly8gdHVubmVsIHNvIHdlIGNhbiBhc3NlcnQgZGlzcG9zZSB0ZWFycyBpdCBkb3duIGRpcmVjdGx5LCByYXRoZXJcblx0XHQvLyB0aGFuIHJlbHlpbmcgb24gdGhlIGxvY2FsIHNvY2tldCdzIGFzeW5jICdjbG9zZScgdG8gcHJvcGFnYXRlLlxuXHRcdGNvbnN0IHJlbW90ZVNvY2tldHM6IGltcG9ydCgnbmV0JykuU29ja2V0W10gPSBbXTtcblx0XHRjb25zdCBjb25uZWN0Rm46IElUdW5uZWxDb25uZWN0Rm4gPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzb2NrZXQgPSBuZXQuY3JlYXRlQ29ubmVjdGlvbih7IGhvc3Q6ICcxMjcuMC4wLjEnLCBwb3J0OiB0YXJnZXRQb3J0IH0pO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHRzb2NrZXQub25jZSgnY29ubmVjdCcsIHJlc29sdmUpO1xuXHRcdFx0XHRzb2NrZXQub25jZSgnZXJyb3InLCByZWplY3QpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZW1vdGVTb2NrZXRzLnB1c2goc29ja2V0KTtcblx0XHRcdHJldHVybiBtb2NrVHVubmVsUHJvdG9jb2woc29ja2V0KTtcblx0XHR9O1xuXHRcdGNvbnN0IHAgPSBkcy5hZGQobmV3IFR1bm5lbFByb3h5KGNvbm5lY3RGbiwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBpbmZvID0gYXdhaXQgcC5zdGFydCgpO1xuXG5cdFx0Y29uc3QgeyBzdGF0dXNDb2RlLCBzb2NrZXQgfSA9IGF3YWl0IHByb3h5Q29ubmVjdChpbmZvLCBgMTI3LjAuMC4xOiR7dGFyZ2V0UG9ydH1gLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdHVzQ29kZSwgMjAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtb3RlU29ja2V0cy5sZW5ndGgsIDEpO1xuXG5cdFx0cC5kaXNwb3NlKCk7XG5cblx0XHQvLyBUaGUgcmVtb3RlIHNvY2tldCBtdXN0IGJlIGRlc3Ryb3llZCBieSB0aGUgdGltZSBkaXNwb3NlIHJldHVybnMgXHUyMDE0XG5cdFx0Ly8gbm8gZXh0cmEgZXZlbnQtbG9vcCB0dXJuIHJlcXVpcmVkLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1vdGVTb2NrZXRzWzBdLmRlc3Ryb3llZCwgdHJ1ZSk7XG5cdFx0c29ja2V0LmVuZCgpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NlIHRlcm1pbmF0ZXMgQ09OTkVDVCBzb2NrZXRzIHN0dWNrIHdhaXRpbmcgZm9yIHRoZSB1cHN0cmVhbSB0dW5uZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGxzID0gYXdhaXQgaW1wb3J0KCd0bHMnKTtcblxuXHRcdC8vIE1vY2sgY29ubmVjdCB0aGF0IG5ldmVyIHJlc29sdmVzIFx1MjAxNCBzaW11bGF0ZXMgYSBzbG93L2h1bmdcblx0XHQvLyB1cHN0cmVhbSB0dW5uZWwuIFRoZSBDT05ORUNUIHNvY2tldCBzaXRzIGluIGxpbWJvIGJldHdlZW4gdGhlXG5cdFx0Ly8gYGNvbm5lY3RgIGV2ZW50IGZpcmluZyBhbmQgdGhlIHVwc3RyZWFtIHJldHVybmluZywgYW5kIG11c3Rcblx0XHQvLyBzdGlsbCBiZSB0b3JuIGRvd24gYnkgZGlzcG9zZS5cblx0XHRsZXQgY29ubmVjdENhbGxlZDogKCkgPT4gdm9pZDtcblx0XHRjb25zdCBjb25uZWN0Q2FsbGVkUHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4geyBjb25uZWN0Q2FsbGVkID0gcmVzb2x2ZTsgfSk7XG5cdFx0Y29uc3QgaGFuZ2luZ0Nvbm5lY3Q6IElUdW5uZWxDb25uZWN0Rm4gPSAoKSA9PiB7XG5cdFx0XHRjb25uZWN0Q2FsbGVkKCk7XG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2UoKCkgPT4geyAvKiBuZXZlciByZXNvbHZlcyAqLyB9KTtcblx0XHR9O1xuXHRcdGNvbnN0IHAgPSBkcy5hZGQobmV3IFR1bm5lbFByb3h5KGhhbmdpbmdDb25uZWN0LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IGluZm8gPSBhd2FpdCBwLnN0YXJ0KCk7XG5cblx0XHRjb25zdCBjbGllbnRTb2NrZXQgPSBhd2FpdCBuZXcgUHJvbWlzZTxUTFNTb2NrZXQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IHMgPSB0bHMuY29ubmVjdCh7XG5cdFx0XHRcdGhvc3Q6ICcxMjcuMC4wLjEnLFxuXHRcdFx0XHRwb3J0OiBpbmZvLnBvcnQsXG5cdFx0XHRcdHJlamVjdFVuYXV0aG9yaXplZDogZmFsc2UsXG5cdFx0XHR9LCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGF1dGhIZWFkZXIgPSAnQmFzaWMgJyArIEJ1ZmZlci5mcm9tKGAke2luZm8uY3JlZGVudGlhbHMudXNlcm5hbWV9OiR7aW5mby5jcmVkZW50aWFscy5wYXNzd29yZH1gKS50b1N0cmluZygnYmFzZTY0Jyk7XG5cdFx0XHRcdHMud3JpdGUoYENPTk5FQ1QgMTI3LjAuMC4xOiR7dGFyZ2V0UG9ydH0gSFRUUC8xLjFcXHJcXG5Ib3N0OiAxMjcuMC4wLjE6JHt0YXJnZXRQb3J0fVxcclxcblByb3h5LUF1dGhvcml6YXRpb246ICR7YXV0aEhlYWRlcn1cXHJcXG5cXHJcXG5gKTtcblx0XHRcdFx0cmVzb2x2ZShzKTtcblx0XHRcdH0pO1xuXHRcdFx0cy5vbignZXJyb3InLCByZWplY3QpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gV2FpdCB1bnRpbCB0aGUgcHJveHkgaGFzIGVudGVyZWQgdGhlIGhhbmdpbmcgdXBzdHJlYW0gY2FsbCBzb1xuXHRcdC8vIHRoZSBzb2NrZXQgaXMgcmVnaXN0ZXJlZCBpbiBfY29ubmVjdFNvY2tldHMuXG5cdFx0YXdhaXQgY29ubmVjdENhbGxlZFByb21pc2U7XG5cblx0XHRjb25zdCBjbG9zZWQgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IGNsaWVudFNvY2tldC5vbmNlKCdjbG9zZScsICgpID0+IHJlc29sdmUoKSkpO1xuXHRcdHAuZGlzcG9zZSgpO1xuXHRcdGF3YWl0IGNsb3NlZDtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZSB0ZXJtaW5hdGVzIGlkbGUgSFRUUFMga2VlcC1hbGl2ZSBjb25uZWN0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBodHRwcyA9IGF3YWl0IGltcG9ydCgnaHR0cHMnKTtcblx0XHRjb25zdCBjb25uZWN0Rm4gPSBjcmVhdGVNb2NrQ29ubmVjdEZuKHRhcmdldFBvcnQpO1xuXHRcdGNvbnN0IHAgPSBkcy5hZGQobmV3IFR1bm5lbFByb3h5KGNvbm5lY3RGbiwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBpbmZvID0gYXdhaXQgcC5zdGFydCgpO1xuXG5cdFx0Ly8gU2VuZCBvbmUgcmVxdWVzdCB3aXRoIGtlZXAtYWxpdmUgc28gdGhlIGNsaWVudC9zZXJ2ZXIgcGFpciBob2xkc1xuXHRcdC8vIHRoZSBUTFMgY29ubmVjdGlvbiBvcGVuIGFmdGVyIHRoZSByZXNwb25zZS4gV2l0aG91dFxuXHRcdC8vIGBzZXJ2ZXIuY2xvc2VBbGxDb25uZWN0aW9ucygpYCBvbiBkaXNwb3NlLCB0aGlzIHNvY2tldCB3b3VsZFxuXHRcdC8vIGxpbmdlciB1bnRpbCBlaXRoZXIgc2lkZSB0aW1lZCBvdXQuXG5cdFx0Y29uc3QgYWdlbnQgPSBuZXcgaHR0cHMuQWdlbnQoeyBrZWVwQWxpdmU6IHRydWUsIHJlamVjdFVuYXV0aG9yaXplZDogZmFsc2UgfSk7XG5cdFx0Y29uc3QgcmVzcG9uc2VTb2NrZXQgPSBhd2FpdCBuZXcgUHJvbWlzZTxUTFNTb2NrZXQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGxldCBzb2NrZXQ6IFRMU1NvY2tldCB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHJlcSA9IGh0dHBzLnJlcXVlc3Qoe1xuXHRcdFx0XHRhZ2VudCxcblx0XHRcdFx0aG9zdG5hbWU6ICcxMjcuMC4wLjEnLFxuXHRcdFx0XHRwb3J0OiBpbmZvLnBvcnQsXG5cdFx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRcdHBhdGg6IGBodHRwOi8vMTI3LjAuMC4xOiR7dGFyZ2V0UG9ydH0va2VlcGFsaXZlYCxcblx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdCdQcm94eS1BdXRob3JpemF0aW9uJzogJ0Jhc2ljICcgKyBCdWZmZXIuZnJvbShgJHtpbmZvLmNyZWRlbnRpYWxzLnVzZXJuYW1lfToke2luZm8uY3JlZGVudGlhbHMucGFzc3dvcmR9YCkudG9TdHJpbmcoJ2Jhc2U2NCcpLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwgcmVzID0+IHtcblx0XHRcdFx0cmVzLm9uKCdkYXRhJywgKCkgPT4geyAvKiBkcmFpbiAqLyB9KTtcblx0XHRcdFx0cmVzLm9uKCdlbmQnLCAoKSA9PiByZXNvbHZlKHNvY2tldCEpKTtcblx0XHRcdH0pO1xuXHRcdFx0cmVxLm9uKCdzb2NrZXQnLCBzID0+IHsgc29ja2V0ID0gcyBhcyBUTFNTb2NrZXQ7IH0pO1xuXHRcdFx0cmVxLm9uKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0XHRyZXEuZW5kKCk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBjbG9zZWQgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHJlc3BvbnNlU29ja2V0Lm9uY2UoJ2Nsb3NlJywgKCkgPT4gcmVzb2x2ZSgpKSk7XG5cblx0XHRwLmRpc3Bvc2UoKTtcblx0XHRhZ2VudC5kZXN0cm95KCk7XG5cblx0XHRhd2FpdCBjbG9zZWQ7XG5cdH0pO1xuXG5cdC8vIC0tLSBNYW5hZ2VkIChub24tTm9kZVNvY2tldCkgdHJhbnNwb3J0IC0tLVxuXHQvL1xuXHQvLyBFeGVjLXNlcnZlciAvIG1hbmFnZWQgY29ubmVjdGlvbnMgeWllbGQgYSBnZW5lcmljIElTb2NrZXQgd2l0aCBub1xuXHQvLyB1bmRlcmx5aW5nIG5ldC5Tb2NrZXQsIHNvIHRoZSBwcm94eSBicmlkZ2VzIHRoZW0gdGhyb3VnaCBpdHNcblx0Ly8gUmVtb3RlU29ja2V0U3RyZWFtIER1cGxleCBhZGFwdGVyIGluc3RlYWQgb2YgdGhlIHJhdy1zb2NrZXQgZmFzdCBwYXRoLlxuXHRzdWl0ZSgnbWFuYWdlZCAobm9uLU5vZGVTb2NrZXQpIHRyYW5zcG9ydCcsICgpID0+IHtcblxuXHRcdGxldCBtYW5hZ2VkUHJveHk6IFR1bm5lbFByb3h5O1xuXHRcdGxldCBtYW5hZ2VkSW5mbzogSVR1bm5lbFByb3h5SW5mbztcblxuXHRcdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRcdG1hbmFnZWRQcm94eSA9IGRzLmFkZChuZXcgVHVubmVsUHJveHkoY3JlYXRlTWFuYWdlZENvbm5lY3RGbih0YXJnZXRQb3J0KSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRcdG1hbmFnZWRJbmZvID0gYXdhaXQgbWFuYWdlZFByb3h5LnN0YXJ0KCk7XG5cdFx0fSk7XG5cblx0XHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0XHRtYW5hZ2VkUHJveHkuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZm9yd2FyZHMgYW4gYXV0aGVudGljYXRlZCBIVFRQIEdFVCB0aHJvdWdoIGEgbWFuYWdlZCBzb2NrZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXMgPSBhd2FpdCBwcm94eVJlcXVlc3QobWFuYWdlZEluZm8sIHtcblx0XHRcdFx0cGF0aDogYGh0dHA6Ly8xMjcuMC4wLjE6JHt0YXJnZXRQb3J0fS9tYW5hZ2VkL3BhdGhgLFxuXHRcdFx0XHRhdXRoOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1c0NvZGUsIDIwMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmJvZHksICdFQ0hPIEdFVCAvbWFuYWdlZC9wYXRoJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDT05ORUNUIHR1bm5lbHMgYmlkaXJlY3Rpb25hbCBkYXRhIHRocm91Z2ggYSBtYW5hZ2VkIHNvY2tldCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc3RhdHVzQ29kZSwgc29ja2V0IH0gPSBhd2FpdCBwcm94eUNvbm5lY3QobWFuYWdlZEluZm8sIGAxMjcuMC4wLjE6JHt0YXJnZXRQb3J0fWAsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXR1c0NvZGUsIDIwMCk7XG5cblx0XHRcdC8vIFdyaXRlIGEgcmVxdWVzdCB1cCB0aGUgdHVubmVsIGFuZCByZWFkIHRoZSBlY2hvZWQgcmVzcG9uc2UgYmFja1xuXHRcdFx0Ly8gZG93biBpdCwgcHJvdmluZyB0aGUgYWRhcHRlciBicmlkZ2VzIGJvdGggZGlyZWN0aW9ucy5cblx0XHRcdHNvY2tldC53cml0ZShgR0VUIC9tYW5hZ2VkLXR1bm5lbCBIVFRQLzEuMVxcclxcbkhvc3Q6IDEyNy4wLjAuMToke3RhcmdldFBvcnR9XFxyXFxuQ29ubmVjdGlvbjogY2xvc2VcXHJcXG5cXHJcXG5gKTtcblx0XHRcdGNvbnN0IGJvZHkgPSBhd2FpdCBuZXcgUHJvbWlzZTxzdHJpbmc+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0Y29uc3QgY2h1bmtzOiBCdWZmZXJbXSA9IFtdO1xuXHRcdFx0XHRzb2NrZXQub24oJ2RhdGEnLCBjID0+IGNodW5rcy5wdXNoKGMpKTtcblx0XHRcdFx0c29ja2V0Lm9uKCdlbmQnLCAoKSA9PiByZXNvbHZlKEJ1ZmZlci5jb25jYXQoY2h1bmtzKS50b1N0cmluZygpKSk7XG5cdFx0XHRcdHNvY2tldC5vbignZXJyb3InLCByZWplY3QpO1xuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQub2soYm9keS5pbmNsdWRlcygnRUNITyBHRVQgL21hbmFnZWQtdHVubmVsJyksIGBFeHBlY3RlZCB0dW5uZWxlZCBlY2hvLCBnb3Q6ICR7Ym9keX1gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc3Bvc2UgZGlzcG9zZXMgdGhlIG1hbmFnZWQgcmVtb3RlIHNvY2tldCB2aWEgdGhlIGFkYXB0ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgY2FwdHVyZWQ6IE1hbmFnZWRUZXN0U29ja2V0IHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgcCA9IGRzLmFkZChuZXcgVHVubmVsUHJveHkoY3JlYXRlTWFuYWdlZENvbm5lY3RGbih0YXJnZXRQb3J0LCBzID0+IHsgY2FwdHVyZWQgPSBzOyB9KSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRcdGNvbnN0IGluZm8gPSBhd2FpdCBwLnN0YXJ0KCk7XG5cblx0XHRcdGNvbnN0IHsgc3RhdHVzQ29kZSwgc29ja2V0IH0gPSBhd2FpdCBwcm94eUNvbm5lY3QoaW5mbywgYDEyNy4wLjAuMToke3RhcmdldFBvcnR9YCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdHVzQ29kZSwgMjAwKTtcblx0XHRcdGFzc2VydC5vayhjYXB0dXJlZCk7XG5cblx0XHRcdHAuZGlzcG9zZSgpO1xuXG5cdFx0XHQvLyBEZXN0cm95aW5nIHRoZSBhZGFwdGVyIChSZW1vdGVTb2NrZXRTdHJlYW0pIG9uIGRpc3Bvc2UgbXVzdCBkaXNwb3NlXG5cdFx0XHQvLyB0aGUgdW5kZXJseWluZyBtYW5hZ2VkIHNvY2tldCwgbWlycm9yaW5nIGhvdyB0aGUgTm9kZVNvY2tldCBwYXRoXG5cdFx0XHQvLyBkZXN0cm95cyB0aGUgcmF3IG5ldC5Tb2NrZXQuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwdHVyZWQuaXNEaXNwb3NlZCwgdHJ1ZSk7XG5cdFx0XHRzb2NrZXQuZW5kKCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFJbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBMkIsbUJBQW1CO0FBRTlDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQW9DLDRCQUE0QjtBQUNoRSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBK0I7QUFXeEMsU0FBUyxtQkFBbUIsUUFBOEI7QUFDekQsU0FBTztBQUFBLElBQ04sV0FBVyxNQUFNLElBQUksV0FBVyxNQUFNO0FBQUEsSUFDdEMsa0JBQWtCLE1BQU0sU0FBUyxNQUFNLENBQUM7QUFBQSxJQUN4QyxTQUFTLE1BQU07QUFBQSxJQUE4QztBQUFBLEVBQzlEO0FBQ0Q7QUFRQSxTQUFTLG9CQUFvQixZQUFzQztBQUNsRSxTQUFPLE9BQU8sT0FBZSxVQUFrQjtBQUM5QyxVQUFNLE1BQU0sTUFBTSxPQUFPLEtBQUs7QUFDOUIsVUFBTSxTQUFTLElBQUksaUJBQWlCLEVBQUUsTUFBTSxhQUFhLE1BQU0sV0FBVyxDQUFDO0FBQzNFLFVBQU0sSUFBSSxRQUFjLENBQUMsU0FBUyxXQUFXO0FBQzVDLGFBQU8sS0FBSyxXQUFXLE9BQU87QUFDOUIs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SUFDeEMsQ0FBQztBQUVELGFBQVMsTUFBTTtBQUNkLG1CQUFhLFFBQVE7QUFBQSxJQUN0QixDQUFDO0FBRUQsU0FBSywrREFBK0QsWUFBWTtBQUMvRSxZQUFNLE1BQU0sTUFBTSxhQUFhLGFBQWE7QUFBQSxRQUMzQyxNQUFNLG9CQUFvQixVQUFVO0FBQUEsUUFDcEMsTUFBTTtBQUFBLE1BQ1AsQ0FBQztBQUNELGFBQU8sWUFBWSxJQUFJLFlBQVksR0FBRztBQUN0QyxhQUFPLFlBQVksSUFBSSxNQUFNLHdCQUF3QjtBQUFBLElBQ3RELENBQUM7QUFFRCxTQUFLLCtEQUErRCxZQUFZO0FBQy9FLFlBQU0sRUFBRSxZQUFZLE9BQU8sSUFBSSxNQUFNLGFBQWEsYUFBYSxhQUFhLFVBQVUsSUFBSSxJQUFJO0FBQzlGLGFBQU8sWUFBWSxZQUFZLEdBQUc7QUFJbEMsYUFBTyxNQUFNO0FBQUEsa0JBQW1ELFVBQVU7QUFBQTtBQUFBO0FBQUEsQ0FBK0I7QUFDekcsWUFBTSxPQUFPLE1BQU0sSUFBSSxRQUFnQixDQUFDLFNBQVMsV0FBVztBQUMzRCxjQUFNLFNBQW1CLENBQUM7QUFDMUIsZUFBTyxHQUFHLFFBQVEsT0FBSyxPQUFPLEtBQUssQ0FBQyxDQUFDO0FBQ3JDLGVBQU8sR0FBRyxPQUFPLE1BQU0sUUFBUSxPQUFPLE9BQU8sTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0FBQ2hFLGVBQU8sR0FBRyxTQUFTLE1BQU07QUFBQSxNQUMxQixDQUFDO0FBQ0QsYUFBTyxHQUFHLEtBQUssU0FBUywwQkFBMEIsR0FBRyxnQ0FBZ0MsSUFBSSxFQUFFO0FBQUEsSUFDNUYsQ0FBQztBQUVELFNBQUssOERBQThELFlBQVk7QUFDOUUsVUFBSTtBQUNKLFlBQU0sSUFBSSxHQUFHLElBQUksSUFBSSxZQUFZLHVCQUF1QixZQUFZLE9BQUs7QUFBRSxtQkFBVztBQUFBLE1BQUcsQ0FBQyxHQUFHLElBQUksZUFBZSxDQUFDLENBQUM7QUFDbEgsWUFBTSxPQUFPLE1BQU0sRUFBRSxNQUFNO0FBRTNCLFlBQU0sRUFBRSxZQUFZLE9BQU8sSUFBSSxNQUFNLGFBQWEsTUFBTSxhQUFhLFVBQVUsSUFBSSxJQUFJO0FBQ3ZGLGFBQU8sWUFBWSxZQUFZLEdBQUc7QUFDbEMsYUFBTyxHQUFHLFFBQVE7QUFFbEIsUUFBRSxRQUFRO0FBS1YsYUFBTyxZQUFZLFNBQVMsWUFBWSxJQUFJO0FBQzVDLGFBQU8sSUFBSTtBQUFBLElBQ1osQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbInNvY2tldCJdCn0K
