import assert from "assert";
import * as net from "net";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import {
  LoopbackProxyServer,
  readProxyRequestBody
} from "../../node/shared/loopbackProxyServer.js";
class TestProxyServer extends LoopbackProxyServer {
  constructor(name = "TestProxyServer") {
    super(name, new NullLogService());
    this.createStateCalls = 0;
    this.requestHandler = async (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    };
  }
  createState() {
    this.createStateCalls++;
    return { value: "" };
  }
  handleRequest(req, res, runtime) {
    return this.requestHandler(req, res, runtime);
  }
  writeInternalError(res) {
    if (this.internalErrorWriter) {
      this.internalErrorWriter(res);
      return;
    }
    super.writeInternalError(res);
  }
  /** Test-only public wrapper around the protected {@link acquire}. */
  async startHandle(value) {
    const { runtime, release } = await this.acquire();
    if (value !== void 0) {
      runtime.state.value = value;
    }
    return {
      baseUrl: runtime.baseUrl,
      nonce: runtime.nonce,
      runtime,
      dispose: release
    };
  }
}
class SeededTestProxyServer extends LoopbackProxyServer {
  constructor(name = "SeededTestProxyServer") {
    super(name, new NullLogService());
    this.seeds = [];
    this.requestHandler = async (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    };
  }
  createState(seed) {
    this.seeds.push(seed);
    return { value: seed };
  }
  handleRequest(req, res, runtime) {
    return this.requestHandler(req, res, runtime);
  }
  /** Test-only public wrapper around the protected {@link acquire}. */
  async startHandle(seed) {
    const { runtime, release } = await this.acquire(seed);
    return {
      baseUrl: runtime.baseUrl,
      nonce: runtime.nonce,
      runtime,
      dispose: release
    };
  }
}
let _httpModule;
async function getHttp() {
  if (!_httpModule) {
    _httpModule = await import("http");
  }
  return _httpModule;
}
function fetchHttp(url, init, onResponse) {
  return getHttp().then((httpMod) => new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = httpMod.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: init?.method ?? "GET",
      headers: init?.headers
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        let parsed;
        try {
          parsed = body ? JSON.parse(body) : void 0;
        } catch {
          parsed = void 0;
        }
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body, parsed });
      });
      res.on("error", reject);
      onResponse?.(res, () => req.destroy());
    });
    req.on("error", reject);
    if (init?.body !== void 0) {
      req.write(init.body);
    }
    req.end();
  }));
}
async function isConnectionRefused(url) {
  try {
    await fetchHttp(url);
    return false;
  } catch (err) {
    const code = err.code;
    return code === "ECONNREFUSED" || code === "ECONNRESET" || code === "ECONNABORTED";
  }
}
suite("LoopbackProxyServer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("Lifecycle & binding", () => {
    test("startHandle() returns a loopback baseUrl and 256-bit hex nonce", async () => {
      const service = new TestProxyServer();
      const handle = await service.startHandle();
      try {
        assert.match(handle.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
        assert.match(handle.nonce, /^[0-9a-f]{64}$/);
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("binds only on the IPv4 loopback interface", async () => {
      const service = new TestProxyServer();
      const handle = await service.startHandle();
      try {
        assert.match(handle.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
        const port = Number(new URL(handle.baseUrl).port);
        const refusedOnIpv6 = await new Promise((resolve) => {
          const socket = net.connect({ host: "::1", port });
          socket.once("connect", () => {
            socket.destroy();
            resolve(false);
          });
          socket.once("error", () => {
            socket.destroy();
            resolve(true);
          });
        });
        assert.strictEqual(refusedOnIpv6, true, "server should not be reachable on ::1");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("serves real requests via handleRequest", async () => {
      const service = new TestProxyServer();
      service.requestHandler = async (_req, res) => {
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ hello: "world" }));
      };
      const handle = await service.startHandle();
      try {
        const res = await fetchHttp(`${handle.baseUrl}/anything`);
        assert.strictEqual(res.status, 201);
        assert.deepStrictEqual(res.parsed, { hello: "world" });
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("handleRequest receives the runtime with baseUrl, nonce and state", async () => {
      const service = new TestProxyServer();
      let seen;
      service.requestHandler = async (_req, res, runtime) => {
        seen = runtime;
        res.writeHead(200);
        res.end();
      };
      const handle = await service.startHandle("payload");
      try {
        await fetchHttp(`${handle.baseUrl}/`);
        assert.strictEqual(seen, handle.runtime);
        assert.strictEqual(seen?.baseUrl, handle.baseUrl);
        assert.strictEqual(seen?.nonce, handle.nonce);
        assert.strictEqual(seen?.state.value, "payload");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
  });
  suite("Refcounting", () => {
    test("concurrent acquires share a single bind and one state object", async () => {
      const service = new TestProxyServer();
      const [h1, h2] = await Promise.all([
        service.startHandle("a"),
        service.startHandle("b")
      ]);
      try {
        assert.strictEqual(h1.baseUrl, h2.baseUrl);
        assert.strictEqual(h1.nonce, h2.nonce);
        assert.strictEqual(h1.runtime.state, h2.runtime.state, "state is shared by reference");
        assert.strictEqual(service.createStateCalls, 1);
      } finally {
        h1.dispose();
        h2.dispose();
        service.dispose();
      }
    });
    test("disposing one handle while another is alive keeps the server up", async () => {
      const service = new TestProxyServer();
      const h1 = await service.startHandle();
      const h2 = await service.startHandle();
      h1.dispose();
      try {
        const res = await fetchHttp(`${h2.baseUrl}/`);
        assert.strictEqual(res.status, 200);
      } finally {
        h2.dispose();
        service.dispose();
      }
    });
    test("disposing the last handle tears the server down", async () => {
      const service = new TestProxyServer();
      const handle = await service.startHandle();
      const baseUrl = handle.baseUrl;
      assert.strictEqual((await fetchHttp(`${baseUrl}/`)).status, 200);
      handle.dispose();
      assert.strictEqual(await isConnectionRefused(`${baseUrl}/`), true);
      service.dispose();
    });
    test("startHandle() after refcount-0 teardown rebinds with a fresh nonce and new state", async () => {
      const service = new TestProxyServer();
      const h1 = await service.startHandle();
      const nonce1 = h1.nonce;
      h1.dispose();
      const h2 = await service.startHandle();
      try {
        assert.notStrictEqual(h2.nonce, nonce1);
        assert.match(h2.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
        assert.strictEqual(service.createStateCalls, 2, "state is rebuilt per bind");
      } finally {
        h2.dispose();
        service.dispose();
      }
    });
  });
  suite("Seeding", () => {
    test("acquire seeds createState so the state is born valid with no placeholder window", async () => {
      const service = new SeededTestProxyServer();
      let firstRequestValue;
      service.requestHandler = async (_req, res, runtime) => {
        firstRequestValue = runtime.state.value;
        res.writeHead(200);
        res.end();
      };
      const handle = await service.startHandle("token-1");
      try {
        await fetchHttp(`${handle.baseUrl}/`);
        assert.deepStrictEqual(
          { seeds: service.seeds, state: handle.runtime.state.value, firstRequestValue },
          { seeds: ["token-1"], state: "token-1", firstRequestValue: "token-1" }
        );
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("concurrent acquires build state once from the seed that wins the bind", async () => {
      const service = new SeededTestProxyServer();
      const [h1, h2] = await Promise.all([
        service.startHandle("token-1"),
        service.startHandle("token-2")
      ]);
      try {
        assert.deepStrictEqual(
          { seeds: service.seeds, shared: h1.runtime.state === h2.runtime.state, value: h1.runtime.state.value },
          { seeds: ["token-1"], shared: true, value: "token-1" }
        );
      } finally {
        h1.dispose();
        h2.dispose();
        service.dispose();
      }
    });
    test("rebinding after refcount-0 teardown re-seeds createState with the new value", async () => {
      const service = new SeededTestProxyServer();
      const h1 = await service.startHandle("token-1");
      h1.dispose();
      const h2 = await service.startHandle("token-2");
      try {
        assert.deepStrictEqual(
          { seeds: service.seeds, value: h2.runtime.state.value },
          { seeds: ["token-1", "token-2"], value: "token-2" }
        );
      } finally {
        h2.dispose();
        service.dispose();
      }
    });
  });
  suite("Dispose semantics", () => {
    test("explicit dispose() tears down regardless of live handles", async () => {
      const service = new TestProxyServer();
      const handle = await service.startHandle();
      const baseUrl = handle.baseUrl;
      service.dispose();
      assert.strictEqual(await isConnectionRefused(`${baseUrl}/`), true);
      handle.dispose();
    });
    test("dispose() while a bind is in flight rejects the pending acquire", async () => {
      const service = new TestProxyServer();
      const startPromise = service.startHandle();
      service.dispose();
      await assert.rejects(() => startPromise, /disposed/);
    });
    test("acquire after dispose() rejects", async () => {
      const service = new TestProxyServer();
      service.dispose();
      await assert.rejects(() => service.startHandle(), /disposed/);
    });
    test("dispose() is idempotent", async () => {
      const service = new TestProxyServer();
      const handle = await service.startHandle();
      handle.dispose();
      service.dispose();
      service.dispose();
      handle.dispose();
    });
    test("error message is prefixed with the proxy name", async () => {
      const service = new TestProxyServer("MyCustomProxy");
      service.dispose();
      await assert.rejects(() => service.startHandle(), /MyCustomProxy has been disposed/);
    });
  });
  suite("Unhandled errors", () => {
    test("throw before headers \u2192 default internal-error envelope (500)", async () => {
      const service = new TestProxyServer();
      service.requestHandler = async () => {
        throw new Error("boom");
      };
      const handle = await service.startHandle();
      try {
        const res = await fetchHttp(`${handle.baseUrl}/`);
        assert.strictEqual(res.status, 500);
        assert.deepStrictEqual(res.parsed, { error: { type: "api_error", message: "Internal proxy error" } });
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("throw before headers \u2192 subclass writeInternalError override is used", async () => {
      const service = new TestProxyServer();
      service.internalErrorWriter = (res) => {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ custom: true }));
      };
      service.requestHandler = async () => {
        throw new Error("boom");
      };
      const handle = await service.startHandle();
      try {
        const res = await fetchHttp(`${handle.baseUrl}/`);
        assert.strictEqual(res.status, 503);
        assert.deepStrictEqual(res.parsed, { custom: true });
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("throw after headers are sent \u2192 response is ended without crashing", async () => {
      const service = new TestProxyServer();
      service.requestHandler = async (_req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.write("partial");
        throw new Error("boom after headers");
      };
      const handle = await service.startHandle();
      try {
        const res = await fetchHttp(`${handle.baseUrl}/`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body, "partial");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
  });
  suite("In-flight abort", () => {
    test("dispose() aborts in-flight requests and destroys their sockets", async () => {
      const service = new TestProxyServer();
      let aborted = false;
      let entered;
      const handlerEntered = new Promise((resolve) => {
        entered = resolve;
      });
      service.requestHandler = async (_req, res, runtime) => {
        const entry = { ac: new AbortController(), res, clientGone: false };
        runtime.inFlight.add(entry);
        res.on("close", () => {
          entry.clientGone = true;
          entry.ac.abort();
        });
        try {
          entered();
          await new Promise((resolve) => {
            entry.ac.signal.addEventListener("abort", () => {
              aborted = true;
              if (!entry.clientGone && !res.writableEnded) {
                res.destroy();
              }
              resolve();
            });
          });
        } finally {
          runtime.inFlight.delete(entry);
        }
      };
      const handle = await service.startHandle();
      const reqError = fetchHttp(`${handle.baseUrl}/`).catch((err) => err);
      await handlerEntered;
      service.dispose();
      const result = await reqError;
      assert.ok(result instanceof Error, "client request should error when the socket is destroyed");
      assert.strictEqual(aborted, true, "in-flight AbortController should have fired");
      handle.dispose();
    });
  });
  suite("readProxyRequestBody", () => {
    test("reads the full request body as UTF-8", async () => {
      const service = new TestProxyServer();
      let received;
      service.requestHandler = async (req, res) => {
        received = await readProxyRequestBody(req);
        res.writeHead(200);
        res.end();
      };
      const handle = await service.startHandle();
      try {
        const payload = JSON.stringify({ greeting: "h\xE9llo \u{1F30D}", n: 42 });
        await fetchHttp(`${handle.baseUrl}/`, { method: "POST", body: payload });
        assert.strictEqual(received, payload);
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("resolves to an empty string for a body-less request", async () => {
      const service = new TestProxyServer();
      let received;
      service.requestHandler = async (req, res) => {
        received = await readProxyRequestBody(req);
        res.writeHead(200);
        res.end();
      };
      const handle = await service.startHandle();
      try {
        await fetchHttp(`${handle.baseUrl}/`, { method: "POST" });
        assert.strictEqual(received, "");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxsb29wYmFja1Byb3h5U2VydmVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgdHlwZSAqIGFzIGh0dHAgZnJvbSAnaHR0cCc7XG5pbXBvcnQgKiBhcyBuZXQgZnJvbSAnbmV0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQge1xuXHRJTG9vcGJhY2tQcm94eVJ1bnRpbWUsXG5cdElQcm94eUluRmxpZ2h0LFxuXHRMb29wYmFja1Byb3h5U2VydmVyLFxuXHRyZWFkUHJveHlSZXF1ZXN0Qm9keSxcbn0gZnJvbSAnLi4vLi4vbm9kZS9zaGFyZWQvbG9vcGJhY2tQcm94eVNlcnZlci5qcyc7XG5cbi8vICNyZWdpb24gVGVzdCBzdWJjbGFzc1xuXG5pbnRlcmZhY2UgSVRlc3RTdGF0ZSB7XG5cdHZhbHVlOiBzdHJpbmc7XG59XG5cbnR5cGUgUmVxdWVzdEhhbmRsZXIgPSAoXG5cdHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsXG5cdHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSxcblx0cnVudGltZTogSUxvb3BiYWNrUHJveHlSdW50aW1lPElUZXN0U3RhdGU+LFxuKSA9PiBQcm9taXNlPHZvaWQ+O1xuXG4vKipcbiAqIE1pbmltYWwgY29uY3JldGUgcHJveHkgdXNlZCB0byBkcml2ZSB0aGUgc2hhcmVkIHtAbGluayBMb29wYmFja1Byb3h5U2VydmVyfVxuICogbGlmZWN5Y2xlIGluIGlzb2xhdGlvbi4gVGhlIHJlcXVlc3QgaGFuZGxlciBhbmQgaW50ZXJuYWwtZXJyb3Igd3JpdGVyIGFyZVxuICogc3dhcHBhYmxlIHBlciB0ZXN0OyBgY3JlYXRlU3RhdGVgIGlzIGNvdW50ZWQgc28gd2UgY2FuIGFzc2VydCBvbmUgc3RhdGUgcGVyXG4gKiBiaW5kLlxuICovXG5jbGFzcyBUZXN0UHJveHlTZXJ2ZXIgZXh0ZW5kcyBMb29wYmFja1Byb3h5U2VydmVyPElUZXN0U3RhdGU+IHtcblxuXHRjcmVhdGVTdGF0ZUNhbGxzID0gMDtcblxuXHRyZXF1ZXN0SGFuZGxlcjogUmVxdWVzdEhhbmRsZXIgPSBhc3luYyAoX3JlcSwgcmVzKSA9PiB7XG5cdFx0cmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICd0ZXh0L3BsYWluJyB9KTtcblx0XHRyZXMuZW5kKCdvaycpO1xuXHR9O1xuXG5cdGludGVybmFsRXJyb3JXcml0ZXI6ICgocmVzOiBodHRwLlNlcnZlclJlc3BvbnNlKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3RvcihuYW1lID0gJ1Rlc3RQcm94eVNlcnZlcicpIHtcblx0XHRzdXBlcihuYW1lLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlU3RhdGUoKTogSVRlc3RTdGF0ZSB7XG5cdFx0dGhpcy5jcmVhdGVTdGF0ZUNhbGxzKys7XG5cdFx0cmV0dXJuIHsgdmFsdWU6ICcnIH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgaGFuZGxlUmVxdWVzdChcblx0XHRyZXE6IGh0dHAuSW5jb21pbmdNZXNzYWdlLFxuXHRcdHJlczogaHR0cC5TZXJ2ZXJSZXNwb25zZSxcblx0XHRydW50aW1lOiBJTG9vcGJhY2tQcm94eVJ1bnRpbWU8SVRlc3RTdGF0ZT4sXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnJlcXVlc3RIYW5kbGVyKHJlcSwgcmVzLCBydW50aW1lKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB3cml0ZUludGVybmFsRXJyb3IocmVzOiBodHRwLlNlcnZlclJlc3BvbnNlKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaW50ZXJuYWxFcnJvcldyaXRlcikge1xuXHRcdFx0dGhpcy5pbnRlcm5hbEVycm9yV3JpdGVyKHJlcyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHN1cGVyLndyaXRlSW50ZXJuYWxFcnJvcihyZXMpO1xuXHR9XG5cblx0LyoqIFRlc3Qtb25seSBwdWJsaWMgd3JhcHBlciBhcm91bmQgdGhlIHByb3RlY3RlZCB7QGxpbmsgYWNxdWlyZX0uICovXG5cdGFzeW5jIHN0YXJ0SGFuZGxlKHZhbHVlPzogc3RyaW5nKTogUHJvbWlzZTxJVGVzdEhhbmRsZT4ge1xuXHRcdGNvbnN0IHsgcnVudGltZSwgcmVsZWFzZSB9ID0gYXdhaXQgdGhpcy5hY3F1aXJlKCk7XG5cdFx0aWYgKHZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJ1bnRpbWUuc3RhdGUudmFsdWUgPSB2YWx1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGJhc2VVcmw6IHJ1bnRpbWUuYmFzZVVybCxcblx0XHRcdG5vbmNlOiBydW50aW1lLm5vbmNlLFxuXHRcdFx0cnVudGltZSxcblx0XHRcdGRpc3Bvc2U6IHJlbGVhc2UsXG5cdFx0fTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSVRlc3RIYW5kbGUge1xuXHRyZWFkb25seSBiYXNlVXJsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG5vbmNlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJ1bnRpbWU6IElMb29wYmFja1Byb3h5UnVudGltZTxJVGVzdFN0YXRlPjtcblx0ZGlzcG9zZSgpOiB2b2lkO1xufVxuXG4vKipcbiAqIENvbmNyZXRlIHByb3h5IHdob3NlIHBlci1iaW5kIHN0YXRlIGlzIHNlZWRlZCBhdCBgYWNxdWlyZSgpYCB0aW1lLCB1c2VkIHRvXG4gKiBleGVyY2lzZSB0aGUgc2VlZCBcdTIxOTIge0BsaW5rIExvb3BiYWNrUHJveHlTZXJ2ZXIuY3JlYXRlU3RhdGV9IGZsb3cuIEV2ZXJ5IHNlZWRcbiAqIHRocmVhZGVkIGludG8gYGNyZWF0ZVN0YXRlYCBpcyByZWNvcmRlZCBzbyB0ZXN0cyBjYW4gYXNzZXJ0IHdoZW4gXHUyMDE0IGFuZCB3aXRoXG4gKiB3aGljaCB2YWx1ZSBcdTIwMTQgdGhlIHN0YXRlIHdhcyBidWlsdC5cbiAqL1xuY2xhc3MgU2VlZGVkVGVzdFByb3h5U2VydmVyIGV4dGVuZHMgTG9vcGJhY2tQcm94eVNlcnZlcjxJVGVzdFN0YXRlLCBzdHJpbmc+IHtcblxuXHRyZWFkb25seSBzZWVkczogc3RyaW5nW10gPSBbXTtcblxuXHRyZXF1ZXN0SGFuZGxlcjogUmVxdWVzdEhhbmRsZXIgPSBhc3luYyAoX3JlcSwgcmVzKSA9PiB7XG5cdFx0cmVzLndyaXRlSGVhZCgyMDAsIHsgJ0NvbnRlbnQtVHlwZSc6ICd0ZXh0L3BsYWluJyB9KTtcblx0XHRyZXMuZW5kKCdvaycpO1xuXHR9O1xuXG5cdGNvbnN0cnVjdG9yKG5hbWUgPSAnU2VlZGVkVGVzdFByb3h5U2VydmVyJykge1xuXHRcdHN1cGVyKG5hbWUsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVTdGF0ZShzZWVkOiBzdHJpbmcpOiBJVGVzdFN0YXRlIHtcblx0XHR0aGlzLnNlZWRzLnB1c2goc2VlZCk7XG5cdFx0cmV0dXJuIHsgdmFsdWU6IHNlZWQgfTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBoYW5kbGVSZXF1ZXN0KFxuXHRcdHJlcTogaHR0cC5JbmNvbWluZ01lc3NhZ2UsXG5cdFx0cmVzOiBodHRwLlNlcnZlclJlc3BvbnNlLFxuXHRcdHJ1bnRpbWU6IElMb29wYmFja1Byb3h5UnVudGltZTxJVGVzdFN0YXRlPixcblx0KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMucmVxdWVzdEhhbmRsZXIocmVxLCByZXMsIHJ1bnRpbWUpO1xuXHR9XG5cblx0LyoqIFRlc3Qtb25seSBwdWJsaWMgd3JhcHBlciBhcm91bmQgdGhlIHByb3RlY3RlZCB7QGxpbmsgYWNxdWlyZX0uICovXG5cdGFzeW5jIHN0YXJ0SGFuZGxlKHNlZWQ6IHN0cmluZyk6IFByb21pc2U8SVRlc3RIYW5kbGU+IHtcblx0XHRjb25zdCB7IHJ1bnRpbWUsIHJlbGVhc2UgfSA9IGF3YWl0IHRoaXMuYWNxdWlyZShzZWVkKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0YmFzZVVybDogcnVudGltZS5iYXNlVXJsLFxuXHRcdFx0bm9uY2U6IHJ1bnRpbWUubm9uY2UsXG5cdFx0XHRydW50aW1lLFxuXHRcdFx0ZGlzcG9zZTogcmVsZWFzZSxcblx0XHR9O1xuXHR9XG59XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBIVFRQIGhlbHBlcnNcblxubGV0IF9odHRwTW9kdWxlOiB0eXBlb2YgaHR0cCB8IHVuZGVmaW5lZDtcbmFzeW5jIGZ1bmN0aW9uIGdldEh0dHAoKTogUHJvbWlzZTx0eXBlb2YgaHR0cD4ge1xuXHRpZiAoIV9odHRwTW9kdWxlKSB7XG5cdFx0X2h0dHBNb2R1bGUgPSBhd2FpdCBpbXBvcnQoJ2h0dHAnKTtcblx0fVxuXHRyZXR1cm4gX2h0dHBNb2R1bGU7XG59XG5cbmludGVyZmFjZSBJRmV0Y2hSZXN1bHQge1xuXHRzdGF0dXM6IG51bWJlcjtcblx0aGVhZGVyczogaHR0cC5JbmNvbWluZ0h0dHBIZWFkZXJzO1xuXHRib2R5OiBzdHJpbmc7XG5cdHBhcnNlZDogdW5rbm93bjtcbn1cblxuZnVuY3Rpb24gZmV0Y2hIdHRwKFxuXHR1cmw6IHN0cmluZyxcblx0aW5pdD86IHsgbWV0aG9kPzogc3RyaW5nOyBoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjsgYm9keT86IHN0cmluZyB9LFxuXHRvblJlc3BvbnNlPzogKHJlczogaHR0cC5JbmNvbWluZ01lc3NhZ2UsIGFib3J0OiAoKSA9PiB2b2lkKSA9PiB2b2lkLFxuKTogUHJvbWlzZTxJRmV0Y2hSZXN1bHQ+IHtcblx0cmV0dXJuIGdldEh0dHAoKS50aGVuKGh0dHBNb2QgPT4gbmV3IFByb21pc2U8SUZldGNoUmVzdWx0PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29uc3QgdSA9IG5ldyBVUkwodXJsKTtcblx0XHRjb25zdCByZXEgPSBodHRwTW9kLnJlcXVlc3Qoe1xuXHRcdFx0aG9zdG5hbWU6IHUuaG9zdG5hbWUsXG5cdFx0XHRwb3J0OiB1LnBvcnQsXG5cdFx0XHRwYXRoOiB1LnBhdGhuYW1lICsgdS5zZWFyY2gsXG5cdFx0XHRtZXRob2Q6IGluaXQ/Lm1ldGhvZCA/PyAnR0VUJyxcblx0XHRcdGhlYWRlcnM6IGluaXQ/LmhlYWRlcnMsXG5cdFx0fSwgcmVzID0+IHtcblx0XHRcdGNvbnN0IGNodW5rczogQnVmZmVyW10gPSBbXTtcblx0XHRcdHJlcy5vbignZGF0YScsIGMgPT4gY2h1bmtzLnB1c2goQnVmZmVyLmlzQnVmZmVyKGMpID8gYyA6IEJ1ZmZlci5mcm9tKGMpKSk7XG5cdFx0XHRyZXMub24oJ2VuZCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgYm9keSA9IEJ1ZmZlci5jb25jYXQoY2h1bmtzKS50b1N0cmluZygndXRmOCcpO1xuXHRcdFx0XHRsZXQgcGFyc2VkOiB1bmtub3duO1xuXHRcdFx0XHR0cnkgeyBwYXJzZWQgPSBib2R5ID8gSlNPTi5wYXJzZShib2R5KSA6IHVuZGVmaW5lZDsgfSBjYXRjaCB7IHBhcnNlZCA9IHVuZGVmaW5lZDsgfVxuXHRcdFx0XHRyZXNvbHZlKHsgc3RhdHVzOiByZXMuc3RhdHVzQ29kZSA/PyAwLCBoZWFkZXJzOiByZXMuaGVhZGVycywgYm9keSwgcGFyc2VkIH0pO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXMub24oJ2Vycm9yJywgcmVqZWN0KTtcblx0XHRcdG9uUmVzcG9uc2U/LihyZXMsICgpID0+IHJlcS5kZXN0cm95KCkpO1xuXHRcdH0pO1xuXHRcdHJlcS5vbignZXJyb3InLCByZWplY3QpO1xuXHRcdGlmIChpbml0Py5ib2R5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJlcS53cml0ZShpbml0LmJvZHkpO1xuXHRcdH1cblx0XHRyZXEuZW5kKCk7XG5cdH0pKTtcbn1cblxuLyoqIFJlc29sdmVzIGB0cnVlYCBpZiB0aGUgY29ubmVjdGlvbiB3YXMgcmVmdXNlZCAoc2VydmVyIHRvcm4gZG93bikuICovXG5hc3luYyBmdW5jdGlvbiBpc0Nvbm5lY3Rpb25SZWZ1c2VkKHVybDogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdHRyeSB7XG5cdFx0YXdhaXQgZmV0Y2hIdHRwKHVybCk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9IGNhdGNoIChlcnIpIHtcblx0XHRjb25zdCBjb2RlID0gKGVyciBhcyBOb2RlSlMuRXJybm9FeGNlcHRpb24pLmNvZGU7XG5cdFx0cmV0dXJuIGNvZGUgPT09ICdFQ09OTlJFRlVTRUQnIHx8IGNvZGUgPT09ICdFQ09OTlJFU0VUJyB8fCBjb2RlID09PSAnRUNPTk5BQk9SVEVEJztcblx0fVxufVxuXG4vLyAjZW5kcmVnaW9uXG5cbnN1aXRlKCdMb29wYmFja1Byb3h5U2VydmVyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vICNyZWdpb24gTGlmZWN5Y2xlICYgYmluZGluZ1xuXG5cdHN1aXRlKCdMaWZlY3ljbGUgJiBiaW5kaW5nJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc3RhcnRIYW5kbGUoKSByZXR1cm5zIGEgbG9vcGJhY2sgYmFzZVVybCBhbmQgMjU2LWJpdCBoZXggbm9uY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RQcm94eVNlcnZlcigpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydEhhbmRsZSgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXNzZXJ0Lm1hdGNoKGhhbmRsZS5iYXNlVXJsLCAvXmh0dHA6XFwvXFwvMTI3XFwuMFxcLjBcXC4xOlxcZCskLyk7XG5cdFx0XHRcdGFzc2VydC5tYXRjaChoYW5kbGUubm9uY2UsIC9eWzAtOWEtZl17NjR9JC8pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdiaW5kcyBvbmx5IG9uIHRoZSBJUHY0IGxvb3BiYWNrIGludGVyZmFjZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdFByb3h5U2VydmVyKCk7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0SGFuZGxlKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhc3NlcnQubWF0Y2goaGFuZGxlLmJhc2VVcmwsIC9eaHR0cDpcXC9cXC8xMjdcXC4wXFwuMFxcLjE6XFxkKyQvKTtcblx0XHRcdFx0Ly8gQmluZGluZyB0byAxMjcuMC4wLjEgbXVzdCBOT1QgYWxzbyBsaXN0ZW4gb24gdGhlIElQdjZcblx0XHRcdFx0Ly8gbG9vcGJhY2sgKDo6MSk7IGEgY29ubmVjdGlvbiB0aGVyZSBzaG91bGQgYmUgcmVmdXNlZC5cblx0XHRcdFx0Y29uc3QgcG9ydCA9IE51bWJlcihuZXcgVVJMKGhhbmRsZS5iYXNlVXJsKS5wb3J0KTtcblx0XHRcdFx0Y29uc3QgcmVmdXNlZE9uSXB2NiA9IGF3YWl0IG5ldyBQcm9taXNlPGJvb2xlYW4+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHNvY2tldCA9IG5ldC5jb25uZWN0KHsgaG9zdDogJzo6MScsIHBvcnQgfSk7XG5cdFx0XHRcdFx0c29ja2V0Lm9uY2UoJ2Nvbm5lY3QnLCAoKSA9PiB7IHNvY2tldC5kZXN0cm95KCk7IHJlc29sdmUoZmFsc2UpOyB9KTtcblx0XHRcdFx0XHRzb2NrZXQub25jZSgnZXJyb3InLCAoKSA9PiB7IHNvY2tldC5kZXN0cm95KCk7IHJlc29sdmUodHJ1ZSk7IH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZnVzZWRPbklwdjYsIHRydWUsICdzZXJ2ZXIgc2hvdWxkIG5vdCBiZSByZWFjaGFibGUgb24gOjoxJyk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NlcnZlcyByZWFsIHJlcXVlc3RzIHZpYSBoYW5kbGVSZXF1ZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0UHJveHlTZXJ2ZXIoKTtcblx0XHRcdHNlcnZpY2UucmVxdWVzdEhhbmRsZXIgPSBhc3luYyAoX3JlcSwgcmVzKSA9PiB7XG5cdFx0XHRcdHJlcy53cml0ZUhlYWQoMjAxLCB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSk7XG5cdFx0XHRcdHJlcy5lbmQoSlNPTi5zdHJpbmdpZnkoeyBoZWxsbzogJ3dvcmxkJyB9KSk7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydEhhbmRsZSgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2hIdHRwKGAke2hhbmRsZS5iYXNlVXJsfS9hbnl0aGluZ2ApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1cywgMjAxKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXMucGFyc2VkLCB7IGhlbGxvOiAnd29ybGQnIH0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVSZXF1ZXN0IHJlY2VpdmVzIHRoZSBydW50aW1lIHdpdGggYmFzZVVybCwgbm9uY2UgYW5kIHN0YXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0UHJveHlTZXJ2ZXIoKTtcblx0XHRcdGxldCBzZWVuOiBJTG9vcGJhY2tQcm94eVJ1bnRpbWU8SVRlc3RTdGF0ZT4gfCB1bmRlZmluZWQ7XG5cdFx0XHRzZXJ2aWNlLnJlcXVlc3RIYW5kbGVyID0gYXN5bmMgKF9yZXEsIHJlcywgcnVudGltZSkgPT4ge1xuXHRcdFx0XHRzZWVuID0gcnVudGltZTtcblx0XHRcdFx0cmVzLndyaXRlSGVhZCgyMDApO1xuXHRcdFx0XHRyZXMuZW5kKCk7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydEhhbmRsZSgncGF5bG9hZCcpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgZmV0Y2hIdHRwKGAke2hhbmRsZS5iYXNlVXJsfS9gKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlZW4sIGhhbmRsZS5ydW50aW1lKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlZW4/LmJhc2VVcmwsIGhhbmRsZS5iYXNlVXJsKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlZW4/Lm5vbmNlLCBoYW5kbGUubm9uY2UpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vlbj8uc3RhdGUudmFsdWUsICdwYXlsb2FkJyk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gUmVmY291bnRpbmdcblxuXHRzdWl0ZSgnUmVmY291bnRpbmcnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdjb25jdXJyZW50IGFjcXVpcmVzIHNoYXJlIGEgc2luZ2xlIGJpbmQgYW5kIG9uZSBzdGF0ZSBvYmplY3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RQcm94eVNlcnZlcigpO1xuXHRcdFx0Ly8gSXNzdWUgYm90aCBiZWZvcmUgdGhlIGZpcnN0IGJpbmQgcmVzb2x2ZXM7IHRoZXkgbXVzdCBzaGFyZVxuXHRcdFx0Ly8gdGhlIHJ1bnRpbWUgcmF0aGVyIHRoYW4gZWFjaCBiaW5kaW5nIGEgc2VydmVyLlxuXHRcdFx0Y29uc3QgW2gxLCBoMl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdHNlcnZpY2Uuc3RhcnRIYW5kbGUoJ2EnKSxcblx0XHRcdFx0c2VydmljZS5zdGFydEhhbmRsZSgnYicpLFxuXHRcdFx0XSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaDEuYmFzZVVybCwgaDIuYmFzZVVybCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoMS5ub25jZSwgaDIubm9uY2UpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaDEucnVudGltZS5zdGF0ZSwgaDIucnVudGltZS5zdGF0ZSwgJ3N0YXRlIGlzIHNoYXJlZCBieSByZWZlcmVuY2UnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuY3JlYXRlU3RhdGVDYWxscywgMSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoMS5kaXNwb3NlKCk7XG5cdFx0XHRcdGgyLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNwb3Npbmcgb25lIGhhbmRsZSB3aGlsZSBhbm90aGVyIGlzIGFsaXZlIGtlZXBzIHRoZSBzZXJ2ZXIgdXAnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RQcm94eVNlcnZlcigpO1xuXHRcdFx0Y29uc3QgaDEgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0SGFuZGxlKCk7XG5cdFx0XHRjb25zdCBoMiA9IGF3YWl0IHNlcnZpY2Uuc3RhcnRIYW5kbGUoKTtcblx0XHRcdGgxLmRpc3Bvc2UoKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoSHR0cChgJHtoMi5iYXNlVXJsfS9gKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDIwMCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoMi5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzcG9zaW5nIHRoZSBsYXN0IGhhbmRsZSB0ZWFycyB0aGUgc2VydmVyIGRvd24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RQcm94eVNlcnZlcigpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydEhhbmRsZSgpO1xuXHRcdFx0Y29uc3QgYmFzZVVybCA9IGhhbmRsZS5iYXNlVXJsO1xuXHRcdFx0Ly8gUmVhY2hhYmxlIHdoaWxlIGhlbGQuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IGZldGNoSHR0cChgJHtiYXNlVXJsfS9gKSkuc3RhdHVzLCAyMDApO1xuXHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBpc0Nvbm5lY3Rpb25SZWZ1c2VkKGAke2Jhc2VVcmx9L2ApLCB0cnVlKTtcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RhcnRIYW5kbGUoKSBhZnRlciByZWZjb3VudC0wIHRlYXJkb3duIHJlYmluZHMgd2l0aCBhIGZyZXNoIG5vbmNlIGFuZCBuZXcgc3RhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RQcm94eVNlcnZlcigpO1xuXHRcdFx0Y29uc3QgaDEgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0SGFuZGxlKCk7XG5cdFx0XHRjb25zdCBub25jZTEgPSBoMS5ub25jZTtcblx0XHRcdGgxLmRpc3Bvc2UoKTtcblxuXHRcdFx0Y29uc3QgaDIgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0SGFuZGxlKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoaDIubm9uY2UsIG5vbmNlMSk7XG5cdFx0XHRcdGFzc2VydC5tYXRjaChoMi5iYXNlVXJsLCAvXmh0dHA6XFwvXFwvMTI3XFwuMFxcLjBcXC4xOlxcZCskLyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmNyZWF0ZVN0YXRlQ2FsbHMsIDIsICdzdGF0ZSBpcyByZWJ1aWx0IHBlciBiaW5kJyk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoMi5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBTZWVkaW5nXG5cblx0c3VpdGUoJ1NlZWRpbmcnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdhY3F1aXJlIHNlZWRzIGNyZWF0ZVN0YXRlIHNvIHRoZSBzdGF0ZSBpcyBib3JuIHZhbGlkIHdpdGggbm8gcGxhY2Vob2xkZXIgd2luZG93JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBTZWVkZWRUZXN0UHJveHlTZXJ2ZXIoKTtcblx0XHRcdC8vIENhcHR1cmUgdGhlIHN0YXRlIHRoZSB2ZXJ5IGZpcnN0IGRpc3BhdGNoZWQgcmVxdWVzdCBvYnNlcnZlcyB0b1xuXHRcdFx0Ly8gcHJvdmUgbm8gZW1wdHkvcGxhY2Vob2xkZXIgdmFsdWUgaXMgZXZlciB2aXNpYmxlIG9uIHRoZSB3aXJlLlxuXHRcdFx0bGV0IGZpcnN0UmVxdWVzdFZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRzZXJ2aWNlLnJlcXVlc3RIYW5kbGVyID0gYXN5bmMgKF9yZXEsIHJlcywgcnVudGltZSkgPT4ge1xuXHRcdFx0XHRmaXJzdFJlcXVlc3RWYWx1ZSA9IHJ1bnRpbWUuc3RhdGUudmFsdWU7XG5cdFx0XHRcdHJlcy53cml0ZUhlYWQoMjAwKTtcblx0XHRcdFx0cmVzLmVuZCgpO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnRIYW5kbGUoJ3Rva2VuLTEnKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGZldGNoSHR0cChgJHtoYW5kbGUuYmFzZVVybH0vYCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0eyBzZWVkczogc2VydmljZS5zZWVkcywgc3RhdGU6IGhhbmRsZS5ydW50aW1lLnN0YXRlLnZhbHVlLCBmaXJzdFJlcXVlc3RWYWx1ZSB9LFxuXHRcdFx0XHRcdHsgc2VlZHM6IFsndG9rZW4tMSddLCBzdGF0ZTogJ3Rva2VuLTEnLCBmaXJzdFJlcXVlc3RWYWx1ZTogJ3Rva2VuLTEnIH0sXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbmN1cnJlbnQgYWNxdWlyZXMgYnVpbGQgc3RhdGUgb25jZSBmcm9tIHRoZSBzZWVkIHRoYXQgd2lucyB0aGUgYmluZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgU2VlZGVkVGVzdFByb3h5U2VydmVyKCk7XG5cdFx0XHQvLyBCb3RoIGFyZSBpc3N1ZWQgYmVmb3JlIHRoZSBmaXJzdCBiaW5kIHJlc29sdmVzOyB0aGUgZmlyc3QgY2FsbGVyXG5cdFx0XHQvLyB3aW5zIHRoZSBiaW5kIHJhY2Ugc28gY3JlYXRlU3RhdGUgcnVucyBvbmNlIHdpdGggaXRzIHNlZWQsIHdoaWxlXG5cdFx0XHQvLyB0aGUgc2Vjb25kIGp1c3Qgam9pbnMgdGhlIHNoYXJlZCBydW50aW1lLlxuXHRcdFx0Y29uc3QgW2gxLCBoMl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdHNlcnZpY2Uuc3RhcnRIYW5kbGUoJ3Rva2VuLTEnKSxcblx0XHRcdFx0c2VydmljZS5zdGFydEhhbmRsZSgndG9rZW4tMicpLFxuXHRcdFx0XSk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRcdHsgc2VlZHM6IHNlcnZpY2Uuc2VlZHMsIHNoYXJlZDogaDEucnVudGltZS5zdGF0ZSA9PT0gaDIucnVudGltZS5zdGF0ZSwgdmFsdWU6IGgxLnJ1bnRpbWUuc3RhdGUudmFsdWUgfSxcblx0XHRcdFx0XHR7IHNlZWRzOiBbJ3Rva2VuLTEnXSwgc2hhcmVkOiB0cnVlLCB2YWx1ZTogJ3Rva2VuLTEnIH0sXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoMS5kaXNwb3NlKCk7XG5cdFx0XHRcdGgyLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWJpbmRpbmcgYWZ0ZXIgcmVmY291bnQtMCB0ZWFyZG93biByZS1zZWVkcyBjcmVhdGVTdGF0ZSB3aXRoIHRoZSBuZXcgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFNlZWRlZFRlc3RQcm94eVNlcnZlcigpO1xuXHRcdFx0Y29uc3QgaDEgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0SGFuZGxlKCd0b2tlbi0xJyk7XG5cdFx0XHRoMS5kaXNwb3NlKCk7XG5cblx0XHRcdGNvbnN0IGgyID0gYXdhaXQgc2VydmljZS5zdGFydEhhbmRsZSgndG9rZW4tMicpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHR7IHNlZWRzOiBzZXJ2aWNlLnNlZWRzLCB2YWx1ZTogaDIucnVudGltZS5zdGF0ZS52YWx1ZSB9LFxuXHRcdFx0XHRcdHsgc2VlZHM6IFsndG9rZW4tMScsICd0b2tlbi0yJ10sIHZhbHVlOiAndG9rZW4tMicgfSxcblx0XHRcdFx0KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGgyLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIERpc3Bvc2Ugc2VtYW50aWNzXG5cblx0c3VpdGUoJ0Rpc3Bvc2Ugc2VtYW50aWNzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZXhwbGljaXQgZGlzcG9zZSgpIHRlYXJzIGRvd24gcmVnYXJkbGVzcyBvZiBsaXZlIGhhbmRsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RQcm94eVNlcnZlcigpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydEhhbmRsZSgpO1xuXHRcdFx0Y29uc3QgYmFzZVVybCA9IGhhbmRsZS5iYXNlVXJsO1xuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHQvLyBIYW5kbGUgaXMgc3RpbGwgXCJoZWxkXCIgYnkgdGhlIGNhbGxlciwgYnV0IHRoZSBzZXJ2aWNlIGlzIGdvbmUuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgaXNDb25uZWN0aW9uUmVmdXNlZChgJHtiYXNlVXJsfS9gKSwgdHJ1ZSk7XG5cdFx0XHQvLyBSZWxlYXNpbmcgdGhlIG5vdy1zdGFsZSBoYW5kbGUgbXVzdCBiZSBhIHNhZmUgbm8tb3AuXG5cdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzcG9zZSgpIHdoaWxlIGEgYmluZCBpcyBpbiBmbGlnaHQgcmVqZWN0cyB0aGUgcGVuZGluZyBhY3F1aXJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0UHJveHlTZXJ2ZXIoKTtcblx0XHRcdGNvbnN0IHN0YXJ0UHJvbWlzZSA9IHNlcnZpY2Uuc3RhcnRIYW5kbGUoKTtcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gc3RhcnRQcm9taXNlLCAvZGlzcG9zZWQvKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FjcXVpcmUgYWZ0ZXIgZGlzcG9zZSgpIHJlamVjdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RQcm94eVNlcnZlcigpO1xuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBzZXJ2aWNlLnN0YXJ0SGFuZGxlKCksIC9kaXNwb3NlZC8pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzcG9zZSgpIGlzIGlkZW1wb3RlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RQcm94eVNlcnZlcigpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydEhhbmRsZSgpO1xuXHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHQvLyBSZS1kaXNwb3NpbmcgdGhlIHJlbGVhc2VkIGhhbmRsZSBpcyBhbHNvIGEgbm8tb3AuXG5cdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXJyb3IgbWVzc2FnZSBpcyBwcmVmaXhlZCB3aXRoIHRoZSBwcm94eSBuYW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBUZXN0UHJveHlTZXJ2ZXIoJ015Q3VzdG9tUHJveHknKTtcblx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gc2VydmljZS5zdGFydEhhbmRsZSgpLCAvTXlDdXN0b21Qcm94eSBoYXMgYmVlbiBkaXNwb3NlZC8pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBVbmhhbmRsZWQgZXJyb3JzXG5cblx0c3VpdGUoJ1VuaGFuZGxlZCBlcnJvcnMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCd0aHJvdyBiZWZvcmUgaGVhZGVycyBcdTIxOTIgZGVmYXVsdCBpbnRlcm5hbC1lcnJvciBlbnZlbG9wZSAoNTAwKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdFByb3h5U2VydmVyKCk7XG5cdFx0XHRzZXJ2aWNlLnJlcXVlc3RIYW5kbGVyID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2Jvb20nKTtcblx0XHRcdH07XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0SGFuZGxlKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaEh0dHAoYCR7aGFuZGxlLmJhc2VVcmx9L2ApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1cywgNTAwKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXMucGFyc2VkLCB7IGVycm9yOiB7IHR5cGU6ICdhcGlfZXJyb3InLCBtZXNzYWdlOiAnSW50ZXJuYWwgcHJveHkgZXJyb3InIH0gfSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rocm93IGJlZm9yZSBoZWFkZXJzIFx1MjE5MiBzdWJjbGFzcyB3cml0ZUludGVybmFsRXJyb3Igb3ZlcnJpZGUgaXMgdXNlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdFByb3h5U2VydmVyKCk7XG5cdFx0XHRzZXJ2aWNlLmludGVybmFsRXJyb3JXcml0ZXIgPSByZXMgPT4ge1xuXHRcdFx0XHRyZXMud3JpdGVIZWFkKDUwMywgeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nIH0pO1xuXHRcdFx0XHRyZXMuZW5kKEpTT04uc3RyaW5naWZ5KHsgY3VzdG9tOiB0cnVlIH0pKTtcblx0XHRcdH07XG5cdFx0XHRzZXJ2aWNlLnJlcXVlc3RIYW5kbGVyID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2Jvb20nKTtcblx0XHRcdH07XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0SGFuZGxlKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaEh0dHAoYCR7aGFuZGxlLmJhc2VVcmx9L2ApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1cywgNTAzKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXMucGFyc2VkLCB7IGN1c3RvbTogdHJ1ZSB9KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3cgYWZ0ZXIgaGVhZGVycyBhcmUgc2VudCBcdTIxOTIgcmVzcG9uc2UgaXMgZW5kZWQgd2l0aG91dCBjcmFzaGluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdFByb3h5U2VydmVyKCk7XG5cdFx0XHRzZXJ2aWNlLnJlcXVlc3RIYW5kbGVyID0gYXN5bmMgKF9yZXEsIHJlcykgPT4ge1xuXHRcdFx0XHRyZXMud3JpdGVIZWFkKDIwMCwgeyAnQ29udGVudC1UeXBlJzogJ3RleHQvcGxhaW4nIH0pO1xuXHRcdFx0XHRyZXMud3JpdGUoJ3BhcnRpYWwnKTtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdib29tIGFmdGVyIGhlYWRlcnMnKTtcblx0XHRcdH07XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0SGFuZGxlKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaEh0dHAoYCR7aGFuZGxlLmJhc2VVcmx9L2ApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1cywgMjAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5ib2R5LCAncGFydGlhbCcpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIEluLWZsaWdodCBhYm9ydFxuXG5cdHN1aXRlKCdJbi1mbGlnaHQgYWJvcnQnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdkaXNwb3NlKCkgYWJvcnRzIGluLWZsaWdodCByZXF1ZXN0cyBhbmQgZGVzdHJveXMgdGhlaXIgc29ja2V0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdFByb3h5U2VydmVyKCk7XG5cdFx0XHRsZXQgYWJvcnRlZCA9IGZhbHNlO1xuXHRcdFx0bGV0IGVudGVyZWQhOiAoKSA9PiB2b2lkO1xuXHRcdFx0Y29uc3QgaGFuZGxlckVudGVyZWQgPSBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHsgZW50ZXJlZCA9IHJlc29sdmU7IH0pO1xuXG5cdFx0XHRzZXJ2aWNlLnJlcXVlc3RIYW5kbGVyID0gYXN5bmMgKF9yZXEsIHJlcywgcnVudGltZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBlbnRyeTogSVByb3h5SW5GbGlnaHQgPSB7IGFjOiBuZXcgQWJvcnRDb250cm9sbGVyKCksIHJlcywgY2xpZW50R29uZTogZmFsc2UgfTtcblx0XHRcdFx0cnVudGltZS5pbkZsaWdodC5hZGQoZW50cnkpO1xuXHRcdFx0XHRyZXMub24oJ2Nsb3NlJywgKCkgPT4geyBlbnRyeS5jbGllbnRHb25lID0gdHJ1ZTsgZW50cnkuYWMuYWJvcnQoKTsgfSk7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0ZW50ZXJlZCgpO1xuXHRcdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRcdFx0ZW50cnkuYWMuc2lnbmFsLmFkZEV2ZW50TGlzdGVuZXIoJ2Fib3J0JywgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRhYm9ydGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0Ly8gU2VydmljZS1kcml2ZW4gYWJvcnQ6IHNvY2tldCBzdGlsbCBvcGVuIFx1MjE5MiBkZXN0cm95LlxuXHRcdFx0XHRcdFx0XHRpZiAoIWVudHJ5LmNsaWVudEdvbmUgJiYgIXJlcy53cml0YWJsZUVuZGVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVzLmRlc3Ryb3koKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRydW50aW1lLmluRmxpZ2h0LmRlbGV0ZShlbnRyeSk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnRIYW5kbGUoKTtcblx0XHRcdGNvbnN0IHJlcUVycm9yID0gZmV0Y2hIdHRwKGAke2hhbmRsZS5iYXNlVXJsfS9gKS5jYXRjaCgoZXJyOiBOb2RlSlMuRXJybm9FeGNlcHRpb24pID0+IGVycik7XG5cblx0XHRcdGF3YWl0IGhhbmRsZXJFbnRlcmVkO1xuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlcUVycm9yO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCBpbnN0YW5jZW9mIEVycm9yLCAnY2xpZW50IHJlcXVlc3Qgc2hvdWxkIGVycm9yIHdoZW4gdGhlIHNvY2tldCBpcyBkZXN0cm95ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhYm9ydGVkLCB0cnVlLCAnaW4tZmxpZ2h0IEFib3J0Q29udHJvbGxlciBzaG91bGQgaGF2ZSBmaXJlZCcpO1xuXHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gcmVhZFByb3h5UmVxdWVzdEJvZHlcblxuXHRzdWl0ZSgncmVhZFByb3h5UmVxdWVzdEJvZHknLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZWFkcyB0aGUgZnVsbCByZXF1ZXN0IGJvZHkgYXMgVVRGLTgnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IFRlc3RQcm94eVNlcnZlcigpO1xuXHRcdFx0bGV0IHJlY2VpdmVkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRzZXJ2aWNlLnJlcXVlc3RIYW5kbGVyID0gYXN5bmMgKHJlcSwgcmVzKSA9PiB7XG5cdFx0XHRcdHJlY2VpdmVkID0gYXdhaXQgcmVhZFByb3h5UmVxdWVzdEJvZHkocmVxKTtcblx0XHRcdFx0cmVzLndyaXRlSGVhZCgyMDApO1xuXHRcdFx0XHRyZXMuZW5kKCk7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydEhhbmRsZSgpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcGF5bG9hZCA9IEpTT04uc3RyaW5naWZ5KHsgZ3JlZXRpbmc6ICdoXHUwMEU5bGxvIFx1RDgzQ1x1REYwRCcsIG46IDQyIH0pO1xuXHRcdFx0XHRhd2FpdCBmZXRjaEh0dHAoYCR7aGFuZGxlLmJhc2VVcmx9L2AsIHsgbWV0aG9kOiAnUE9TVCcsIGJvZHk6IHBheWxvYWQgfSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNlaXZlZCwgcGF5bG9hZCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc29sdmVzIHRvIGFuIGVtcHR5IHN0cmluZyBmb3IgYSBib2R5LWxlc3MgcmVxdWVzdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgVGVzdFByb3h5U2VydmVyKCk7XG5cdFx0XHRsZXQgcmVjZWl2ZWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdHNlcnZpY2UucmVxdWVzdEhhbmRsZXIgPSBhc3luYyAocmVxLCByZXMpID0+IHtcblx0XHRcdFx0cmVjZWl2ZWQgPSBhd2FpdCByZWFkUHJveHlSZXF1ZXN0Qm9keShyZXEpO1xuXHRcdFx0XHRyZXMud3JpdGVIZWFkKDIwMCk7XG5cdFx0XHRcdHJlcy5lbmQoKTtcblx0XHRcdH07XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0SGFuZGxlKCk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBmZXRjaEh0dHAoYCR7aGFuZGxlLmJhc2VVcmx9L2AsIHsgbWV0aG9kOiAnUE9TVCcgfSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNlaXZlZCwgJycpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vICNlbmRyZWdpb25cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBRW5CLFlBQVksU0FBUztBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQjtBQUFBLEVBR0M7QUFBQSxFQUNBO0FBQUEsT0FDTTtBQW9CUCxNQUFNLHdCQUF3QixvQkFBZ0M7QUFBQSxFQVc3RCxZQUFZLE9BQU8sbUJBQW1CO0FBQ3JDLFVBQU0sTUFBTSxJQUFJLGVBQWUsQ0FBQztBQVZqQyw0QkFBbUI7QUFFbkIsMEJBQWlDLE9BQU8sTUFBTSxRQUFRO0FBQ3JELFVBQUksVUFBVSxLQUFLLEVBQUUsZ0JBQWdCLGFBQWEsQ0FBQztBQUNuRCxVQUFJLElBQUksSUFBSTtBQUFBLElBQ2I7QUFBQSxFQU1BO0FBQUEsRUFFVSxjQUEwQjtBQUNuQyxTQUFLO0FBQ0wsV0FBTyxFQUFFLE9BQU8sR0FBRztBQUFBLEVBQ3BCO0FBQUEsRUFFbUIsY0FDbEIsS0FDQSxLQUNBLFNBQ2dCO0FBQ2hCLFdBQU8sS0FBSyxlQUFlLEtBQUssS0FBSyxPQUFPO0FBQUEsRUFDN0M7QUFBQSxFQUVtQixtQkFBbUIsS0FBZ0M7QUFDckUsUUFBSSxLQUFLLHFCQUFxQjtBQUM3QixXQUFLLG9CQUFvQixHQUFHO0FBQzVCO0FBQUEsSUFDRDtBQUNBLFVBQU0sbUJBQW1CLEdBQUc7QUFBQSxFQUM3QjtBQUFBO0FBQUEsRUFHQSxNQUFNLFlBQVksT0FBc0M7QUFDdkQsVUFBTSxFQUFFLFNBQVMsUUFBUSxJQUFJLE1BQU0sS0FBSyxRQUFRO0FBQ2hELFFBQUksVUFBVSxRQUFXO0FBQ3hCLGNBQVEsTUFBTSxRQUFRO0FBQUEsSUFDdkI7QUFDQSxXQUFPO0FBQUEsTUFDTixTQUFTLFFBQVE7QUFBQSxNQUNqQixPQUFPLFFBQVE7QUFBQSxNQUNmO0FBQUEsTUFDQSxTQUFTO0FBQUEsSUFDVjtBQUFBLEVBQ0Q7QUFDRDtBQWVBLE1BQU0sOEJBQThCLG9CQUF3QztBQUFBLEVBUzNFLFlBQVksT0FBTyx5QkFBeUI7QUFDM0MsVUFBTSxNQUFNLElBQUksZUFBZSxDQUFDO0FBUmpDLFNBQVMsUUFBa0IsQ0FBQztBQUU1QiwwQkFBaUMsT0FBTyxNQUFNLFFBQVE7QUFDckQsVUFBSSxVQUFVLEtBQUssRUFBRSxnQkFBZ0IsYUFBYSxDQUFDO0FBQ25ELFVBQUksSUFBSSxJQUFJO0FBQUEsSUFDYjtBQUFBLEVBSUE7QUFBQSxFQUVVLFlBQVksTUFBMEI7QUFDL0MsU0FBSyxNQUFNLEtBQUssSUFBSTtBQUNwQixXQUFPLEVBQUUsT0FBTyxLQUFLO0FBQUEsRUFDdEI7QUFBQSxFQUVtQixjQUNsQixLQUNBLEtBQ0EsU0FDZ0I7QUFDaEIsV0FBTyxLQUFLLGVBQWUsS0FBSyxLQUFLLE9BQU87QUFBQSxFQUM3QztBQUFBO0FBQUEsRUFHQSxNQUFNLFlBQVksTUFBb0M7QUFDckQsVUFBTSxFQUFFLFNBQVMsUUFBUSxJQUFJLE1BQU0sS0FBSyxRQUFRLElBQUk7QUFDcEQsV0FBTztBQUFBLE1BQ04sU0FBUyxRQUFRO0FBQUEsTUFDakIsT0FBTyxRQUFRO0FBQUEsTUFDZjtBQUFBLE1BQ0EsU0FBUztBQUFBLElBQ1Y7QUFBQSxFQUNEO0FBQ0Q7QUFNQSxJQUFJO0FBQ0osZUFBZSxVQUFnQztBQUM5QyxNQUFJLENBQUMsYUFBYTtBQUNqQixrQkFBYyxNQUFNLE9BQU8sTUFBTTtBQUFBLEVBQ2xDO0FBQ0EsU0FBTztBQUNSO0FBU0EsU0FBUyxVQUNSLEtBQ0EsTUFDQSxZQUN3QjtBQUN4QixTQUFPLFFBQVEsRUFBRSxLQUFLLGFBQVcsSUFBSSxRQUFzQixDQUFDLFNBQVMsV0FBVztBQUMvRSxVQUFNLElBQUksSUFBSSxJQUFJLEdBQUc7QUFDckIsVUFBTSxNQUFNLFFBQVEsUUFBUTtBQUFBLE1BQzNCLFVBQVUsRUFBRTtBQUFBLE1BQ1osTUFBTSxFQUFFO0FBQUEsTUFDUixNQUFNLEVBQUUsV0FBVyxFQUFFO0FBQUEsTUFDckIsUUFBUSxNQUFNLFVBQVU7QUFBQSxNQUN4QixTQUFTLE1BQU07QUFBQSxJQUNoQixHQUFHLFNBQU87QUFDVCxZQUFNLFNBQW1CLENBQUM7QUFDMUIsVUFBSSxHQUFHLFFBQVEsT0FBSyxPQUFPLEtBQUssT0FBTyxTQUFTLENBQUMsSUFBSSxJQUFJLE9BQU8sS0FBSyxDQUFDLENBQUMsQ0FBQztBQUN4RSxVQUFJLEdBQUcsT0FBTyxNQUFNO0FBQ25CLGNBQU0sT0FBTyxPQUFPLE9BQU8sTUFBTSxFQUFFLFNBQVMsTUFBTTtBQUNsRCxZQUFJO0FBQ0osWUFBSTtBQUFFLG1CQUFTLE9BQU8sS0FBSyxNQUFNLElBQUksSUFBSTtBQUFBLFFBQVcsUUFBUTtBQUFFLG1CQUFTO0FBQUEsUUFBVztBQUNsRixnQkFBUSxFQUFFLFFBQVEsSUFBSSxjQUFjLEdBQUcsU0FBUyxJQUFJLFNBQVMsTUFBTSxPQUFPLENBQUM7QUFBQSxNQUM1RSxDQUFDO0FBQ0QsVUFBSSxHQUFHLFNBQVMsTUFBTTtBQUN0QixtQkFBYSxLQUFLLE1BQU0sSUFBSSxRQUFRLENBQUM7QUFBQSxJQUN0QyxDQUFDO0FBQ0QsUUFBSSxHQUFHLFNBQVMsTUFBTTtBQUN0QixRQUFJLE1BQU0sU0FBUyxRQUFXO0FBQzdCLFVBQUksTUFBTSxLQUFLLElBQUk7QUFBQSxJQUNwQjtBQUNBLFFBQUksSUFBSTtBQUFBLEVBQ1QsQ0FBQyxDQUFDO0FBQ0g7QUFHQSxlQUFlLG9CQUFvQixLQUErQjtBQUNqRSxNQUFJO0FBQ0gsVUFBTSxVQUFVLEdBQUc7QUFDbkIsV0FBTztBQUFBLEVBQ1IsU0FBUyxLQUFLO0FBQ2IsVUFBTSxPQUFRLElBQThCO0FBQzVDLFdBQU8sU0FBUyxrQkFBa0IsU0FBUyxnQkFBZ0IsU0FBUztBQUFBLEVBQ3JFO0FBQ0Q7QUFJQSxNQUFNLHVCQUF1QixNQUFNO0FBRWxDLDBDQUF3QztBQUl4QyxRQUFNLHVCQUF1QixNQUFNO0FBRWxDLFNBQUssa0VBQWtFLFlBQVk7QUFDbEYsWUFBTSxVQUFVLElBQUksZ0JBQWdCO0FBQ3BDLFlBQU0sU0FBUyxNQUFNLFFBQVEsWUFBWTtBQUN6QyxVQUFJO0FBQ0gsZUFBTyxNQUFNLE9BQU8sU0FBUyw2QkFBNkI7QUFDMUQsZUFBTyxNQUFNLE9BQU8sT0FBTyxnQkFBZ0I7QUFBQSxNQUM1QyxVQUFFO0FBQ0QsZUFBTyxRQUFRO0FBQ2YsZ0JBQVEsUUFBUTtBQUFBLE1BQ2pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyw2Q0FBNkMsWUFBWTtBQUM3RCxZQUFNLFVBQVUsSUFBSSxnQkFBZ0I7QUFDcEMsWUFBTSxTQUFTLE1BQU0sUUFBUSxZQUFZO0FBQ3pDLFVBQUk7QUFDSCxlQUFPLE1BQU0sT0FBTyxTQUFTLDZCQUE2QjtBQUcxRCxjQUFNLE9BQU8sT0FBTyxJQUFJLElBQUksT0FBTyxPQUFPLEVBQUUsSUFBSTtBQUNoRCxjQUFNLGdCQUFnQixNQUFNLElBQUksUUFBaUIsYUFBVztBQUMzRCxnQkFBTSxTQUFTLElBQUksUUFBUSxFQUFFLE1BQU0sT0FBTyxLQUFLLENBQUM7QUFDaEQsaUJBQU8sS0FBSyxXQUFXLE1BQU07QUFBRSxtQkFBTyxRQUFRO0FBQUcsb0JBQVEsS0FBSztBQUFBLFVBQUcsQ0FBQztBQUNsRSxpQkFBTyxLQUFLLFNBQVMsTUFBTTtBQUFFLG1CQUFPLFFBQVE7QUFBRyxvQkFBUSxJQUFJO0FBQUEsVUFBRyxDQUFDO0FBQUEsUUFDaEUsQ0FBQztBQUNELGVBQU8sWUFBWSxlQUFlLE1BQU0sdUNBQXVDO0FBQUEsTUFDaEYsVUFBRTtBQUNELGVBQU8sUUFBUTtBQUNmLGdCQUFRLFFBQVE7QUFBQSxNQUNqQjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssMENBQTBDLFlBQVk7QUFDMUQsWUFBTSxVQUFVLElBQUksZ0JBQWdCO0FBQ3BDLGNBQVEsaUJBQWlCLE9BQU8sTUFBTSxRQUFRO0FBQzdDLFlBQUksVUFBVSxLQUFLLEVBQUUsZ0JBQWdCLG1CQUFtQixDQUFDO0FBQ3pELFlBQUksSUFBSSxLQUFLLFVBQVUsRUFBRSxPQUFPLFFBQVEsQ0FBQyxDQUFDO0FBQUEsTUFDM0M7QUFDQSxZQUFNLFNBQVMsTUFBTSxRQUFRLFlBQVk7QUFDekMsVUFBSTtBQUNILGNBQU0sTUFBTSxNQUFNLFVBQVUsR0FBRyxPQUFPLE9BQU8sV0FBVztBQUN4RCxlQUFPLFlBQVksSUFBSSxRQUFRLEdBQUc7QUFDbEMsZUFBTyxnQkFBZ0IsSUFBSSxRQUFRLEVBQUUsT0FBTyxRQUFRLENBQUM7QUFBQSxNQUN0RCxVQUFFO0FBQ0QsZUFBTyxRQUFRO0FBQ2YsZ0JBQVEsUUFBUTtBQUFBLE1BQ2pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxvRUFBb0UsWUFBWTtBQUNwRixZQUFNLFVBQVUsSUFBSSxnQkFBZ0I7QUFDcEMsVUFBSTtBQUNKLGNBQVEsaUJBQWlCLE9BQU8sTUFBTSxLQUFLLFlBQVk7QUFDdEQsZUFBTztBQUNQLFlBQUksVUFBVSxHQUFHO0FBQ2pCLFlBQUksSUFBSTtBQUFBLE1BQ1Q7QUFDQSxZQUFNLFNBQVMsTUFBTSxRQUFRLFlBQVksU0FBUztBQUNsRCxVQUFJO0FBQ0gsY0FBTSxVQUFVLEdBQUcsT0FBTyxPQUFPLEdBQUc7QUFDcEMsZUFBTyxZQUFZLE1BQU0sT0FBTyxPQUFPO0FBQ3ZDLGVBQU8sWUFBWSxNQUFNLFNBQVMsT0FBTyxPQUFPO0FBQ2hELGVBQU8sWUFBWSxNQUFNLE9BQU8sT0FBTyxLQUFLO0FBQzVDLGVBQU8sWUFBWSxNQUFNLE1BQU0sT0FBTyxTQUFTO0FBQUEsTUFDaEQsVUFBRTtBQUNELGVBQU8sUUFBUTtBQUNmLGdCQUFRLFFBQVE7QUFBQSxNQUNqQjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQU1ELFFBQU0sZUFBZSxNQUFNO0FBRTFCLFNBQUssZ0VBQWdFLFlBQVk7QUFDaEYsWUFBTSxVQUFVLElBQUksZ0JBQWdCO0FBR3BDLFlBQU0sQ0FBQyxJQUFJLEVBQUUsSUFBSSxNQUFNLFFBQVEsSUFBSTtBQUFBLFFBQ2xDLFFBQVEsWUFBWSxHQUFHO0FBQUEsUUFDdkIsUUFBUSxZQUFZLEdBQUc7QUFBQSxNQUN4QixDQUFDO0FBQ0QsVUFBSTtBQUNILGVBQU8sWUFBWSxHQUFHLFNBQVMsR0FBRyxPQUFPO0FBQ3pDLGVBQU8sWUFBWSxHQUFHLE9BQU8sR0FBRyxLQUFLO0FBQ3JDLGVBQU8sWUFBWSxHQUFHLFFBQVEsT0FBTyxHQUFHLFFBQVEsT0FBTyw4QkFBOEI7QUFDckYsZUFBTyxZQUFZLFFBQVEsa0JBQWtCLENBQUM7QUFBQSxNQUMvQyxVQUFFO0FBQ0QsV0FBRyxRQUFRO0FBQ1gsV0FBRyxRQUFRO0FBQ1gsZ0JBQVEsUUFBUTtBQUFBLE1BQ2pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxtRUFBbUUsWUFBWTtBQUNuRixZQUFNLFVBQVUsSUFBSSxnQkFBZ0I7QUFDcEMsWUFBTSxLQUFLLE1BQU0sUUFBUSxZQUFZO0FBQ3JDLFlBQU0sS0FBSyxNQUFNLFFBQVEsWUFBWTtBQUNyQyxTQUFHLFFBQVE7QUFDWCxVQUFJO0FBQ0gsY0FBTSxNQUFNLE1BQU0sVUFBVSxHQUFHLEdBQUcsT0FBTyxHQUFHO0FBQzVDLGVBQU8sWUFBWSxJQUFJLFFBQVEsR0FBRztBQUFBLE1BQ25DLFVBQUU7QUFDRCxXQUFHLFFBQVE7QUFDWCxnQkFBUSxRQUFRO0FBQUEsTUFDakI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLG1EQUFtRCxZQUFZO0FBQ25FLFlBQU0sVUFBVSxJQUFJLGdCQUFnQjtBQUNwQyxZQUFNLFNBQVMsTUFBTSxRQUFRLFlBQVk7QUFDekMsWUFBTSxVQUFVLE9BQU87QUFFdkIsYUFBTyxhQUFhLE1BQU0sVUFBVSxHQUFHLE9BQU8sR0FBRyxHQUFHLFFBQVEsR0FBRztBQUMvRCxhQUFPLFFBQVE7QUFDZixhQUFPLFlBQVksTUFBTSxvQkFBb0IsR0FBRyxPQUFPLEdBQUcsR0FBRyxJQUFJO0FBQ2pFLGNBQVEsUUFBUTtBQUFBLElBQ2pCLENBQUM7QUFFRCxTQUFLLG9GQUFvRixZQUFZO0FBQ3BHLFlBQU0sVUFBVSxJQUFJLGdCQUFnQjtBQUNwQyxZQUFNLEtBQUssTUFBTSxRQUFRLFlBQVk7QUFDckMsWUFBTSxTQUFTLEdBQUc7QUFDbEIsU0FBRyxRQUFRO0FBRVgsWUFBTSxLQUFLLE1BQU0sUUFBUSxZQUFZO0FBQ3JDLFVBQUk7QUFDSCxlQUFPLGVBQWUsR0FBRyxPQUFPLE1BQU07QUFDdEMsZUFBTyxNQUFNLEdBQUcsU0FBUyw2QkFBNkI7QUFDdEQsZUFBTyxZQUFZLFFBQVEsa0JBQWtCLEdBQUcsMkJBQTJCO0FBQUEsTUFDNUUsVUFBRTtBQUNELFdBQUcsUUFBUTtBQUNYLGdCQUFRLFFBQVE7QUFBQSxNQUNqQjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQU1ELFFBQU0sV0FBVyxNQUFNO0FBRXRCLFNBQUssbUZBQW1GLFlBQVk7QUFDbkcsWUFBTSxVQUFVLElBQUksc0JBQXNCO0FBRzFDLFVBQUk7QUFDSixjQUFRLGlCQUFpQixPQUFPLE1BQU0sS0FBSyxZQUFZO0FBQ3RELDRCQUFvQixRQUFRLE1BQU07QUFDbEMsWUFBSSxVQUFVLEdBQUc7QUFDakIsWUFBSSxJQUFJO0FBQUEsTUFDVDtBQUNBLFlBQU0sU0FBUyxNQUFNLFFBQVEsWUFBWSxTQUFTO0FBQ2xELFVBQUk7QUFDSCxjQUFNLFVBQVUsR0FBRyxPQUFPLE9BQU8sR0FBRztBQUNwQyxlQUFPO0FBQUEsVUFDTixFQUFFLE9BQU8sUUFBUSxPQUFPLE9BQU8sT0FBTyxRQUFRLE1BQU0sT0FBTyxrQkFBa0I7QUFBQSxVQUM3RSxFQUFFLE9BQU8sQ0FBQyxTQUFTLEdBQUcsT0FBTyxXQUFXLG1CQUFtQixVQUFVO0FBQUEsUUFDdEU7QUFBQSxNQUNELFVBQUU7QUFDRCxlQUFPLFFBQVE7QUFDZixnQkFBUSxRQUFRO0FBQUEsTUFDakI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLHlFQUF5RSxZQUFZO0FBQ3pGLFlBQU0sVUFBVSxJQUFJLHNCQUFzQjtBQUkxQyxZQUFNLENBQUMsSUFBSSxFQUFFLElBQUksTUFBTSxRQUFRLElBQUk7QUFBQSxRQUNsQyxRQUFRLFlBQVksU0FBUztBQUFBLFFBQzdCLFFBQVEsWUFBWSxTQUFTO0FBQUEsTUFDOUIsQ0FBQztBQUNELFVBQUk7QUFDSCxlQUFPO0FBQUEsVUFDTixFQUFFLE9BQU8sUUFBUSxPQUFPLFFBQVEsR0FBRyxRQUFRLFVBQVUsR0FBRyxRQUFRLE9BQU8sT0FBTyxHQUFHLFFBQVEsTUFBTSxNQUFNO0FBQUEsVUFDckcsRUFBRSxPQUFPLENBQUMsU0FBUyxHQUFHLFFBQVEsTUFBTSxPQUFPLFVBQVU7QUFBQSxRQUN0RDtBQUFBLE1BQ0QsVUFBRTtBQUNELFdBQUcsUUFBUTtBQUNYLFdBQUcsUUFBUTtBQUNYLGdCQUFRLFFBQVE7QUFBQSxNQUNqQjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssK0VBQStFLFlBQVk7QUFDL0YsWUFBTSxVQUFVLElBQUksc0JBQXNCO0FBQzFDLFlBQU0sS0FBSyxNQUFNLFFBQVEsWUFBWSxTQUFTO0FBQzlDLFNBQUcsUUFBUTtBQUVYLFlBQU0sS0FBSyxNQUFNLFFBQVEsWUFBWSxTQUFTO0FBQzlDLFVBQUk7QUFDSCxlQUFPO0FBQUEsVUFDTixFQUFFLE9BQU8sUUFBUSxPQUFPLE9BQU8sR0FBRyxRQUFRLE1BQU0sTUFBTTtBQUFBLFVBQ3RELEVBQUUsT0FBTyxDQUFDLFdBQVcsU0FBUyxHQUFHLE9BQU8sVUFBVTtBQUFBLFFBQ25EO0FBQUEsTUFDRCxVQUFFO0FBQ0QsV0FBRyxRQUFRO0FBQ1gsZ0JBQVEsUUFBUTtBQUFBLE1BQ2pCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBTUQsUUFBTSxxQkFBcUIsTUFBTTtBQUVoQyxTQUFLLDREQUE0RCxZQUFZO0FBQzVFLFlBQU0sVUFBVSxJQUFJLGdCQUFnQjtBQUNwQyxZQUFNLFNBQVMsTUFBTSxRQUFRLFlBQVk7QUFDekMsWUFBTSxVQUFVLE9BQU87QUFDdkIsY0FBUSxRQUFRO0FBRWhCLGFBQU8sWUFBWSxNQUFNLG9CQUFvQixHQUFHLE9BQU8sR0FBRyxHQUFHLElBQUk7QUFFakUsYUFBTyxRQUFRO0FBQUEsSUFDaEIsQ0FBQztBQUVELFNBQUssbUVBQW1FLFlBQVk7QUFDbkYsWUFBTSxVQUFVLElBQUksZ0JBQWdCO0FBQ3BDLFlBQU0sZUFBZSxRQUFRLFlBQVk7QUFDekMsY0FBUSxRQUFRO0FBQ2hCLFlBQU0sT0FBTyxRQUFRLE1BQU0sY0FBYyxVQUFVO0FBQUEsSUFDcEQsQ0FBQztBQUVELFNBQUssbUNBQW1DLFlBQVk7QUFDbkQsWUFBTSxVQUFVLElBQUksZ0JBQWdCO0FBQ3BDLGNBQVEsUUFBUTtBQUNoQixZQUFNLE9BQU8sUUFBUSxNQUFNLFFBQVEsWUFBWSxHQUFHLFVBQVU7QUFBQSxJQUM3RCxDQUFDO0FBRUQsU0FBSywyQkFBMkIsWUFBWTtBQUMzQyxZQUFNLFVBQVUsSUFBSSxnQkFBZ0I7QUFDcEMsWUFBTSxTQUFTLE1BQU0sUUFBUSxZQUFZO0FBQ3pDLGFBQU8sUUFBUTtBQUNmLGNBQVEsUUFBUTtBQUNoQixjQUFRLFFBQVE7QUFFaEIsYUFBTyxRQUFRO0FBQUEsSUFDaEIsQ0FBQztBQUVELFNBQUssaURBQWlELFlBQVk7QUFDakUsWUFBTSxVQUFVLElBQUksZ0JBQWdCLGVBQWU7QUFDbkQsY0FBUSxRQUFRO0FBQ2hCLFlBQU0sT0FBTyxRQUFRLE1BQU0sUUFBUSxZQUFZLEdBQUcsaUNBQWlDO0FBQUEsSUFDcEYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQU1ELFFBQU0sb0JBQW9CLE1BQU07QUFFL0IsU0FBSyxxRUFBZ0UsWUFBWTtBQUNoRixZQUFNLFVBQVUsSUFBSSxnQkFBZ0I7QUFDcEMsY0FBUSxpQkFBaUIsWUFBWTtBQUNwQyxjQUFNLElBQUksTUFBTSxNQUFNO0FBQUEsTUFDdkI7QUFDQSxZQUFNLFNBQVMsTUFBTSxRQUFRLFlBQVk7QUFDekMsVUFBSTtBQUNILGNBQU0sTUFBTSxNQUFNLFVBQVUsR0FBRyxPQUFPLE9BQU8sR0FBRztBQUNoRCxlQUFPLFlBQVksSUFBSSxRQUFRLEdBQUc7QUFDbEMsZUFBTyxnQkFBZ0IsSUFBSSxRQUFRLEVBQUUsT0FBTyxFQUFFLE1BQU0sYUFBYSxTQUFTLHVCQUF1QixFQUFFLENBQUM7QUFBQSxNQUNyRyxVQUFFO0FBQ0QsZUFBTyxRQUFRO0FBQ2YsZ0JBQVEsUUFBUTtBQUFBLE1BQ2pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyw0RUFBdUUsWUFBWTtBQUN2RixZQUFNLFVBQVUsSUFBSSxnQkFBZ0I7QUFDcEMsY0FBUSxzQkFBc0IsU0FBTztBQUNwQyxZQUFJLFVBQVUsS0FBSyxFQUFFLGdCQUFnQixtQkFBbUIsQ0FBQztBQUN6RCxZQUFJLElBQUksS0FBSyxVQUFVLEVBQUUsUUFBUSxLQUFLLENBQUMsQ0FBQztBQUFBLE1BQ3pDO0FBQ0EsY0FBUSxpQkFBaUIsWUFBWTtBQUNwQyxjQUFNLElBQUksTUFBTSxNQUFNO0FBQUEsTUFDdkI7QUFDQSxZQUFNLFNBQVMsTUFBTSxRQUFRLFlBQVk7QUFDekMsVUFBSTtBQUNILGNBQU0sTUFBTSxNQUFNLFVBQVUsR0FBRyxPQUFPLE9BQU8sR0FBRztBQUNoRCxlQUFPLFlBQVksSUFBSSxRQUFRLEdBQUc7QUFDbEMsZUFBTyxnQkFBZ0IsSUFBSSxRQUFRLEVBQUUsUUFBUSxLQUFLLENBQUM7QUFBQSxNQUNwRCxVQUFFO0FBQ0QsZUFBTyxRQUFRO0FBQ2YsZ0JBQVEsUUFBUTtBQUFBLE1BQ2pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSywwRUFBcUUsWUFBWTtBQUNyRixZQUFNLFVBQVUsSUFBSSxnQkFBZ0I7QUFDcEMsY0FBUSxpQkFBaUIsT0FBTyxNQUFNLFFBQVE7QUFDN0MsWUFBSSxVQUFVLEtBQUssRUFBRSxnQkFBZ0IsYUFBYSxDQUFDO0FBQ25ELFlBQUksTUFBTSxTQUFTO0FBQ25CLGNBQU0sSUFBSSxNQUFNLG9CQUFvQjtBQUFBLE1BQ3JDO0FBQ0EsWUFBTSxTQUFTLE1BQU0sUUFBUSxZQUFZO0FBQ3pDLFVBQUk7QUFDSCxjQUFNLE1BQU0sTUFBTSxVQUFVLEdBQUcsT0FBTyxPQUFPLEdBQUc7QUFDaEQsZUFBTyxZQUFZLElBQUksUUFBUSxHQUFHO0FBQ2xDLGVBQU8sWUFBWSxJQUFJLE1BQU0sU0FBUztBQUFBLE1BQ3ZDLFVBQUU7QUFDRCxlQUFPLFFBQVE7QUFDZixnQkFBUSxRQUFRO0FBQUEsTUFDakI7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGLENBQUM7QUFNRCxRQUFNLG1CQUFtQixNQUFNO0FBRTlCLFNBQUssa0VBQWtFLFlBQVk7QUFDbEYsWUFBTSxVQUFVLElBQUksZ0JBQWdCO0FBQ3BDLFVBQUksVUFBVTtBQUNkLFVBQUk7QUFDSixZQUFNLGlCQUFpQixJQUFJLFFBQWMsYUFBVztBQUFFLGtCQUFVO0FBQUEsTUFBUyxDQUFDO0FBRTFFLGNBQVEsaUJBQWlCLE9BQU8sTUFBTSxLQUFLLFlBQVk7QUFDdEQsY0FBTSxRQUF3QixFQUFFLElBQUksSUFBSSxnQkFBZ0IsR0FBRyxLQUFLLFlBQVksTUFBTTtBQUNsRixnQkFBUSxTQUFTLElBQUksS0FBSztBQUMxQixZQUFJLEdBQUcsU0FBUyxNQUFNO0FBQUUsZ0JBQU0sYUFBYTtBQUFNLGdCQUFNLEdBQUcsTUFBTTtBQUFBLFFBQUcsQ0FBQztBQUNwRSxZQUFJO0FBQ0gsa0JBQVE7QUFDUixnQkFBTSxJQUFJLFFBQWMsYUFBVztBQUNsQyxrQkFBTSxHQUFHLE9BQU8saUJBQWlCLFNBQVMsTUFBTTtBQUMvQyx3QkFBVTtBQUVWLGtCQUFJLENBQUMsTUFBTSxjQUFjLENBQUMsSUFBSSxlQUFlO0FBQzVDLG9CQUFJLFFBQVE7QUFBQSxjQUNiO0FBQ0Esc0JBQVE7QUFBQSxZQUNULENBQUM7QUFBQSxVQUNGLENBQUM7QUFBQSxRQUNGLFVBQUU7QUFDRCxrQkFBUSxTQUFTLE9BQU8sS0FBSztBQUFBLFFBQzlCO0FBQUEsTUFDRDtBQUVBLFlBQU0sU0FBUyxNQUFNLFFBQVEsWUFBWTtBQUN6QyxZQUFNLFdBQVcsVUFBVSxHQUFHLE9BQU8sT0FBTyxHQUFHLEVBQUUsTUFBTSxDQUFDLFFBQStCLEdBQUc7QUFFMUYsWUFBTTtBQUNOLGNBQVEsUUFBUTtBQUVoQixZQUFNLFNBQVMsTUFBTTtBQUNyQixhQUFPLEdBQUcsa0JBQWtCLE9BQU8sMERBQTBEO0FBQzdGLGFBQU8sWUFBWSxTQUFTLE1BQU0sNkNBQTZDO0FBQy9FLGFBQU8sUUFBUTtBQUFBLElBQ2hCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFNRCxRQUFNLHdCQUF3QixNQUFNO0FBRW5DLFNBQUssd0NBQXdDLFlBQVk7QUFDeEQsWUFBTSxVQUFVLElBQUksZ0JBQWdCO0FBQ3BDLFVBQUk7QUFDSixjQUFRLGlCQUFpQixPQUFPLEtBQUssUUFBUTtBQUM1QyxtQkFBVyxNQUFNLHFCQUFxQixHQUFHO0FBQ3pDLFlBQUksVUFBVSxHQUFHO0FBQ2pCLFlBQUksSUFBSTtBQUFBLE1BQ1Q7QUFDQSxZQUFNLFNBQVMsTUFBTSxRQUFRLFlBQVk7QUFDekMsVUFBSTtBQUNILGNBQU0sVUFBVSxLQUFLLFVBQVUsRUFBRSxVQUFVLHNCQUFZLEdBQUcsR0FBRyxDQUFDO0FBQzlELGNBQU0sVUFBVSxHQUFHLE9BQU8sT0FBTyxLQUFLLEVBQUUsUUFBUSxRQUFRLE1BQU0sUUFBUSxDQUFDO0FBQ3ZFLGVBQU8sWUFBWSxVQUFVLE9BQU87QUFBQSxNQUNyQyxVQUFFO0FBQ0QsZUFBTyxRQUFRO0FBQ2YsZ0JBQVEsUUFBUTtBQUFBLE1BQ2pCO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyx1REFBdUQsWUFBWTtBQUN2RSxZQUFNLFVBQVUsSUFBSSxnQkFBZ0I7QUFDcEMsVUFBSTtBQUNKLGNBQVEsaUJBQWlCLE9BQU8sS0FBSyxRQUFRO0FBQzVDLG1CQUFXLE1BQU0scUJBQXFCLEdBQUc7QUFDekMsWUFBSSxVQUFVLEdBQUc7QUFDakIsWUFBSSxJQUFJO0FBQUEsTUFDVDtBQUNBLFlBQU0sU0FBUyxNQUFNLFFBQVEsWUFBWTtBQUN6QyxVQUFJO0FBQ0gsY0FBTSxVQUFVLEdBQUcsT0FBTyxPQUFPLEtBQUssRUFBRSxRQUFRLE9BQU8sQ0FBQztBQUN4RCxlQUFPLFlBQVksVUFBVSxFQUFFO0FBQUEsTUFDaEMsVUFBRTtBQUNELGVBQU8sUUFBUTtBQUNmLGdCQUFRLFFBQVE7QUFBQSxNQUNqQjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUdGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
