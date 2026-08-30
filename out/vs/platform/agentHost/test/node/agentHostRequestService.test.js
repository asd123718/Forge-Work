import assert from "assert";
import { streamToBuffer } from "../../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../configuration/test/common/testConfigurationService.js";
import { NullLogService } from "../../../log/common/log.js";
import { AgentHostClientProxyChannel, createAgentHostClientProxyConnection } from "../../common/agentHostClientProxyChannel.js";
import { AgentHostRequestService } from "../../node/agentHostRequestService.js";
import { NetworkDiagnosticsService } from "../../node/networkDiagnosticsService.js";
class TestProxyResolver {
  constructor() {
    this.fetchImpl = () => Promise.resolve(new Response());
  }
  register(_clientId, _connection) {
    return Disposable.None;
  }
  resolveProxy(_url) {
    return Promise.resolve("http://proxy.example:8080");
  }
  fetch(input, init) {
    this.lastInput = input;
    this.lastInit = init;
    return this.fetchImpl(input, init);
  }
}
suite("AgentHostRequestService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function createService(proxyResolver) {
    const environmentService = {
      args: { "force-disable-user-env": true }
    };
    return disposables.add(new AgentHostRequestService(
      new TestConfigurationService(),
      environmentService,
      new NullLogService(),
      proxyResolver
    ));
  }
  test("uses resolver fetch and streams the response", async () => {
    const proxyResolver = new TestProxyResolver();
    proxyResolver.fetchImpl = () => Promise.resolve(new Response("response body", {
      status: 201,
      headers: { "content-type": "text/plain", "x-test": "value" }
    }));
    const service = createService(proxyResolver);
    const context = await service.request({
      url: "https://example.com/resource",
      type: "POST",
      headers: { "x-request": "header" },
      data: "request body",
      callSite: "agentHostRequestService.test"
    }, CancellationToken.None);
    const body = (await streamToBuffer(context.stream)).toString();
    assert.deepStrictEqual({
      input: proxyResolver.lastInput,
      method: proxyResolver.lastInit?.method,
      requestHeader: new Headers(proxyResolver.lastInit?.headers).get("x-request"),
      requestBody: proxyResolver.lastInit?.body,
      statusCode: context.res.statusCode,
      responseHeader: context.res.headers["x-test"],
      body
    }, {
      input: "https://example.com/resource",
      method: "POST",
      requestHeader: "header",
      requestBody: "request body",
      statusCode: 201,
      responseHeader: "value",
      body: "response body"
    });
  });
  test("forwards cancellation to resolver fetch", async () => {
    const proxyResolver = new TestProxyResolver();
    proxyResolver.fetchImpl = (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
    const service = createService(proxyResolver);
    const cancellation = disposables.add(new CancellationTokenSource());
    const request = service.request({
      url: "https://example.com/slow",
      callSite: "agentHostRequestService.test.cancellation"
    }, cancellation.token);
    cancellation.cancel();
    await assert.rejects(request, isCancellationError);
  });
  test("retries idempotent requests on transient errors", async () => {
    const proxyResolver = new TestProxyResolver();
    let attempts = 0;
    proxyResolver.fetchImpl = async () => {
      attempts++;
      if (attempts < 3) {
        const error = new Error("Connection refused");
        error.code = "ECONNREFUSED";
        throw error;
      }
      return new Response("ok");
    };
    const service = createService(proxyResolver);
    const context = await service.request({
      url: "https://example.com/retry",
      type: "GET",
      callSite: "agentHostRequestService.test.retry"
    }, CancellationToken.None);
    const body = (await streamToBuffer(context.stream)).toString();
    assert.deepStrictEqual({ attempts, body }, { attempts: 3, body: "ok" });
  });
  test("does not retry non-idempotent requests", async () => {
    const proxyResolver = new TestProxyResolver();
    let attempts = 0;
    proxyResolver.fetchImpl = async () => {
      attempts++;
      const error = new Error("Connection refused");
      error.code = "ECONNREFUSED";
      throw error;
    };
    const service = createService(proxyResolver);
    await assert.rejects(() => service.request({
      url: "https://example.com/no-retry",
      type: "POST",
      callSite: "agentHostRequestService.test.noRetry"
    }, CancellationToken.None), /Connection refused/);
    assert.strictEqual(attempts, 1);
  });
  test("forwards proxy and authorization lookups through the client channel", async () => {
    const calls = [];
    const requestService = {
      resolveProxy: async (url) => {
        calls.push(["resolveProxy", url]);
        return "PROXY proxy.example:8080";
      },
      lookupAuthorization: async (authInfo2) => {
        calls.push(["lookupAuthorization", authInfo2]);
        return { username: "user", password: "password" };
      },
      lookupKerberosAuthorization: async (url) => {
        calls.push(["lookupKerberosAuthorization", url]);
        return "Negotiate token";
      }
    };
    const server = new AgentHostClientProxyChannel(requestService);
    const channel = {
      call: (command, arg) => server.call(void 0, command, arg),
      listen: () => Event.None
    };
    const connection = createAgentHostClientProxyConnection(channel);
    const authInfo = { scheme: "basic", host: "proxy.example", port: 8080, realm: "proxy", isProxy: true, attempt: 1 };
    const results = [
      await connection.resolveProxy("https://example.com"),
      await connection.lookupAuthorization(authInfo),
      await connection.lookupKerberosAuthorization("http://proxy.example:8080")
    ];
    assert.deepStrictEqual({ calls, results }, {
      calls: [
        ["resolveProxy", "https://example.com"],
        ["lookupAuthorization", authInfo],
        ["lookupKerberosAuthorization", "http://proxy.example:8080"]
      ],
      results: [
        "PROXY proxy.example:8080",
        { username: "user", password: "password" },
        "Negotiate token"
      ]
    });
  });
});
suite("NetworkDiagnosticsService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("includes nested proxy response errors", async () => {
    const proxyError = new Error("Proxy response (407)");
    const fetchError = new TypeError("fetch failed", { cause: new Error("dispatcher failed", { cause: proxyError }) });
    const requestService = {
      _serviceBrand: void 0,
      onDidCompleteRequest: Event.None,
      request: async () => {
        throw fetchError;
      },
      resolveProxy: async () => void 0,
      lookupAuthorization: async () => void 0,
      lookupKerberosAuthorization: async () => void 0,
      loadCertificates: async () => []
    };
    const proxyResolver = new TestProxyResolver();
    const service = new NetworkDiagnosticsService(
      requestService,
      proxyResolver,
      new TestConfigurationService(),
      { version: "test" },
      new NullLogService()
    );
    const result = await service.fetch("https://localhost");
    assert.strictEqual(result.error, "fetch failed: dispatcher failed: Proxy response (407)");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RSZXF1ZXN0U2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgc3RyZWFtVG9CdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDaGFubmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvY29tbW9uL2lwYy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEF1dGhJbmZvLCBJUmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENsaWVudFByb3h5Q2hhbm5lbCwgY3JlYXRlQWdlbnRIb3N0Q2xpZW50UHJveHlDb25uZWN0aW9uLCB0eXBlIElBZ2VudEhvc3RDbGllbnRQcm94eUNvbm5lY3Rpb24gfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Q2xpZW50UHJveHlDaGFubmVsLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RQcm94eVJlc29sdmVyIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RQcm94eVJlc29sdmVyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RSZXF1ZXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBOZXR3b3JrRGlhZ25vc3RpY3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9uZXR3b3JrRGlhZ25vc3RpY3NTZXJ2aWNlLmpzJztcblxuY2xhc3MgVGVzdFByb3h5UmVzb2x2ZXIgaW1wbGVtZW50cyBJQWdlbnRIb3N0UHJveHlSZXNvbHZlciB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdGxhc3RJbnB1dDogc3RyaW5nIHwgVVJMIHwgUmVxdWVzdCB8IHVuZGVmaW5lZDtcblx0bGFzdEluaXQ6IFJlcXVlc3RJbml0IHwgdW5kZWZpbmVkO1xuXHRmZXRjaEltcGw6IHR5cGVvZiBnbG9iYWxUaGlzLmZldGNoID0gKCkgPT4gUHJvbWlzZS5yZXNvbHZlKG5ldyBSZXNwb25zZSgpKTtcblxuXHRyZWdpc3RlcihfY2xpZW50SWQ6IHN0cmluZywgX2Nvbm5lY3Rpb246IElBZ2VudEhvc3RDbGllbnRQcm94eUNvbm5lY3Rpb24pIHtcblx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHR9XG5cblx0cmVzb2x2ZVByb3h5KF91cmw6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgnaHR0cDovL3Byb3h5LmV4YW1wbGU6ODA4MCcpO1xuXHR9XG5cblx0ZmV0Y2goaW5wdXQ6IHN0cmluZyB8IFVSTCB8IFJlcXVlc3QsIGluaXQ/OiBSZXF1ZXN0SW5pdCk6IFByb21pc2U8UmVzcG9uc2U+IHtcblx0XHR0aGlzLmxhc3RJbnB1dCA9IGlucHV0O1xuXHRcdHRoaXMubGFzdEluaXQgPSBpbml0O1xuXHRcdHJldHVybiB0aGlzLmZldGNoSW1wbChpbnB1dCwgaW5pdCk7XG5cdH1cbn1cblxuc3VpdGUoJ0FnZW50SG9zdFJlcXVlc3RTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVNlcnZpY2UocHJveHlSZXNvbHZlcjogVGVzdFByb3h5UmVzb2x2ZXIpOiBBZ2VudEhvc3RSZXF1ZXN0U2VydmljZSB7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0ge1xuXHRcdFx0YXJnczogeyAnZm9yY2UtZGlzYWJsZS11c2VyLWVudic6IHRydWUgfSxcblx0XHR9IGFzIHVua25vd24gYXMgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZTtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RSZXF1ZXN0U2VydmljZShcblx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdGVudmlyb25tZW50U2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0cHJveHlSZXNvbHZlcixcblx0XHQpKTtcblx0fVxuXG5cdHRlc3QoJ3VzZXMgcmVzb2x2ZXIgZmV0Y2ggYW5kIHN0cmVhbXMgdGhlIHJlc3BvbnNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3h5UmVzb2x2ZXIgPSBuZXcgVGVzdFByb3h5UmVzb2x2ZXIoKTtcblx0XHRwcm94eVJlc29sdmVyLmZldGNoSW1wbCA9ICgpID0+IFByb21pc2UucmVzb2x2ZShuZXcgUmVzcG9uc2UoJ3Jlc3BvbnNlIGJvZHknLCB7XG5cdFx0XHRzdGF0dXM6IDIwMSxcblx0XHRcdGhlYWRlcnM6IHsgJ2NvbnRlbnQtdHlwZSc6ICd0ZXh0L3BsYWluJywgJ3gtdGVzdCc6ICd2YWx1ZScgfSxcblx0XHR9KSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UocHJveHlSZXNvbHZlcik7XG5cblx0XHRjb25zdCBjb250ZXh0ID0gYXdhaXQgc2VydmljZS5yZXF1ZXN0KHtcblx0XHRcdHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vcmVzb3VyY2UnLFxuXHRcdFx0dHlwZTogJ1BPU1QnLFxuXHRcdFx0aGVhZGVyczogeyAneC1yZXF1ZXN0JzogJ2hlYWRlcicgfSxcblx0XHRcdGRhdGE6ICdyZXF1ZXN0IGJvZHknLFxuXHRcdFx0Y2FsbFNpdGU6ICdhZ2VudEhvc3RSZXF1ZXN0U2VydmljZS50ZXN0Jyxcblx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBib2R5ID0gKGF3YWl0IHN0cmVhbVRvQnVmZmVyKGNvbnRleHQuc3RyZWFtKSkudG9TdHJpbmcoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aW5wdXQ6IHByb3h5UmVzb2x2ZXIubGFzdElucHV0LFxuXHRcdFx0bWV0aG9kOiBwcm94eVJlc29sdmVyLmxhc3RJbml0Py5tZXRob2QsXG5cdFx0XHRyZXF1ZXN0SGVhZGVyOiBuZXcgSGVhZGVycyhwcm94eVJlc29sdmVyLmxhc3RJbml0Py5oZWFkZXJzKS5nZXQoJ3gtcmVxdWVzdCcpLFxuXHRcdFx0cmVxdWVzdEJvZHk6IHByb3h5UmVzb2x2ZXIubGFzdEluaXQ/LmJvZHksXG5cdFx0XHRzdGF0dXNDb2RlOiBjb250ZXh0LnJlcy5zdGF0dXNDb2RlLFxuXHRcdFx0cmVzcG9uc2VIZWFkZXI6IGNvbnRleHQucmVzLmhlYWRlcnNbJ3gtdGVzdCddLFxuXHRcdFx0Ym9keSxcblx0XHR9LCB7XG5cdFx0XHRpbnB1dDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vcmVzb3VyY2UnLFxuXHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRyZXF1ZXN0SGVhZGVyOiAnaGVhZGVyJyxcblx0XHRcdHJlcXVlc3RCb2R5OiAncmVxdWVzdCBib2R5Jyxcblx0XHRcdHN0YXR1c0NvZGU6IDIwMSxcblx0XHRcdHJlc3BvbnNlSGVhZGVyOiAndmFsdWUnLFxuXHRcdFx0Ym9keTogJ3Jlc3BvbnNlIGJvZHknLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3J3YXJkcyBjYW5jZWxsYXRpb24gdG8gcmVzb2x2ZXIgZmV0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJveHlSZXNvbHZlciA9IG5ldyBUZXN0UHJveHlSZXNvbHZlcigpO1xuXHRcdHByb3h5UmVzb2x2ZXIuZmV0Y2hJbXBsID0gKF9pbnB1dCwgaW5pdCkgPT4gbmV3IFByb21pc2UoKF9yZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGluaXQ/LnNpZ25hbD8uYWRkRXZlbnRMaXN0ZW5lcignYWJvcnQnLCAoKSA9PiByZWplY3QobmV3IERPTUV4Y2VwdGlvbignQWJvcnRlZCcsICdBYm9ydEVycm9yJykpKTtcblx0XHR9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShwcm94eVJlc29sdmVyKTtcblx0XHRjb25zdCBjYW5jZWxsYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdCA9IHNlcnZpY2UucmVxdWVzdCh7XG5cdFx0XHR1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL3Nsb3cnLFxuXHRcdFx0Y2FsbFNpdGU6ICdhZ2VudEhvc3RSZXF1ZXN0U2VydmljZS50ZXN0LmNhbmNlbGxhdGlvbicsXG5cdFx0fSwgY2FuY2VsbGF0aW9uLnRva2VuKTtcblx0XHRjYW5jZWxsYXRpb24uY2FuY2VsKCk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhyZXF1ZXN0LCBpc0NhbmNlbGxhdGlvbkVycm9yKTtcblx0fSk7XG5cblx0dGVzdCgncmV0cmllcyBpZGVtcG90ZW50IHJlcXVlc3RzIG9uIHRyYW5zaWVudCBlcnJvcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJveHlSZXNvbHZlciA9IG5ldyBUZXN0UHJveHlSZXNvbHZlcigpO1xuXHRcdGxldCBhdHRlbXB0cyA9IDA7XG5cdFx0cHJveHlSZXNvbHZlci5mZXRjaEltcGwgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRhdHRlbXB0cysrO1xuXHRcdFx0aWYgKGF0dGVtcHRzIDwgMykge1xuXHRcdFx0XHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcignQ29ubmVjdGlvbiByZWZ1c2VkJykgYXMgTm9kZUpTLkVycm5vRXhjZXB0aW9uO1xuXHRcdFx0XHRlcnJvci5jb2RlID0gJ0VDT05OUkVGVVNFRCc7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG5ldyBSZXNwb25zZSgnb2snKTtcblx0XHR9O1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKHByb3h5UmVzb2x2ZXIpO1xuXG5cdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IHNlcnZpY2UucmVxdWVzdCh7XG5cdFx0XHR1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL3JldHJ5Jyxcblx0XHRcdHR5cGU6ICdHRVQnLFxuXHRcdFx0Y2FsbFNpdGU6ICdhZ2VudEhvc3RSZXF1ZXN0U2VydmljZS50ZXN0LnJldHJ5Jyxcblx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBib2R5ID0gKGF3YWl0IHN0cmVhbVRvQnVmZmVyKGNvbnRleHQuc3RyZWFtKSkudG9TdHJpbmcoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhdHRlbXB0cywgYm9keSB9LCB7IGF0dGVtcHRzOiAzLCBib2R5OiAnb2snIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZXRyeSBub24taWRlbXBvdGVudCByZXF1ZXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm94eVJlc29sdmVyID0gbmV3IFRlc3RQcm94eVJlc29sdmVyKCk7XG5cdFx0bGV0IGF0dGVtcHRzID0gMDtcblx0XHRwcm94eVJlc29sdmVyLmZldGNoSW1wbCA9IGFzeW5jICgpID0+IHtcblx0XHRcdGF0dGVtcHRzKys7XG5cdFx0XHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcignQ29ubmVjdGlvbiByZWZ1c2VkJykgYXMgTm9kZUpTLkVycm5vRXhjZXB0aW9uO1xuXHRcdFx0ZXJyb3IuY29kZSA9ICdFQ09OTlJFRlVTRUQnO1xuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fTtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShwcm94eVJlc29sdmVyKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHNlcnZpY2UucmVxdWVzdCh7XG5cdFx0XHR1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL25vLXJldHJ5Jyxcblx0XHRcdHR5cGU6ICdQT1NUJyxcblx0XHRcdGNhbGxTaXRlOiAnYWdlbnRIb3N0UmVxdWVzdFNlcnZpY2UudGVzdC5ub1JldHJ5Jyxcblx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSwgL0Nvbm5lY3Rpb24gcmVmdXNlZC8pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF0dGVtcHRzLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnZm9yd2FyZHMgcHJveHkgYW5kIGF1dGhvcml6YXRpb24gbG9va3VwcyB0aHJvdWdoIHRoZSBjbGllbnQgY2hhbm5lbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjYWxsczogdW5rbm93bltdID0gW107XG5cdFx0Y29uc3QgcmVxdWVzdFNlcnZpY2UgPSB7XG5cdFx0XHRyZXNvbHZlUHJveHk6IGFzeW5jICh1cmw6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKFsncmVzb2x2ZVByb3h5JywgdXJsXSk7XG5cdFx0XHRcdHJldHVybiAnUFJPWFkgcHJveHkuZXhhbXBsZTo4MDgwJztcblx0XHRcdH0sXG5cdFx0XHRsb29rdXBBdXRob3JpemF0aW9uOiBhc3luYyAoYXV0aEluZm86IEF1dGhJbmZvKSA9PiB7XG5cdFx0XHRcdGNhbGxzLnB1c2goWydsb29rdXBBdXRob3JpemF0aW9uJywgYXV0aEluZm9dKTtcblx0XHRcdFx0cmV0dXJuIHsgdXNlcm5hbWU6ICd1c2VyJywgcGFzc3dvcmQ6ICdwYXNzd29yZCcgfTtcblx0XHRcdH0sXG5cdFx0XHRsb29rdXBLZXJiZXJvc0F1dGhvcml6YXRpb246IGFzeW5jICh1cmw6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKFsnbG9va3VwS2VyYmVyb3NBdXRob3JpemF0aW9uJywgdXJsXSk7XG5cdFx0XHRcdHJldHVybiAnTmVnb3RpYXRlIHRva2VuJztcblx0XHRcdH0sXG5cdFx0fSBhcyBJUmVxdWVzdFNlcnZpY2U7XG5cdFx0Y29uc3Qgc2VydmVyID0gbmV3IEFnZW50SG9zdENsaWVudFByb3h5Q2hhbm5lbChyZXF1ZXN0U2VydmljZSk7XG5cdFx0Y29uc3QgY2hhbm5lbDogSUNoYW5uZWwgPSB7XG5cdFx0XHRjYWxsOiAoY29tbWFuZCwgYXJnKSA9PiBzZXJ2ZXIuY2FsbCh1bmRlZmluZWQsIGNvbW1hbmQsIGFyZyksXG5cdFx0XHRsaXN0ZW46ICgpID0+IEV2ZW50Lk5vbmUsXG5cdFx0fTtcblx0XHRjb25zdCBjb25uZWN0aW9uID0gY3JlYXRlQWdlbnRIb3N0Q2xpZW50UHJveHlDb25uZWN0aW9uKGNoYW5uZWwpO1xuXHRcdGNvbnN0IGF1dGhJbmZvOiBBdXRoSW5mbyA9IHsgc2NoZW1lOiAnYmFzaWMnLCBob3N0OiAncHJveHkuZXhhbXBsZScsIHBvcnQ6IDgwODAsIHJlYWxtOiAncHJveHknLCBpc1Byb3h5OiB0cnVlLCBhdHRlbXB0OiAxIH07XG5cblx0XHRjb25zdCByZXN1bHRzID0gW1xuXHRcdFx0YXdhaXQgY29ubmVjdGlvbi5yZXNvbHZlUHJveHkoJ2h0dHBzOi8vZXhhbXBsZS5jb20nKSxcblx0XHRcdGF3YWl0IGNvbm5lY3Rpb24ubG9va3VwQXV0aG9yaXphdGlvbihhdXRoSW5mbyksXG5cdFx0XHRhd2FpdCBjb25uZWN0aW9uLmxvb2t1cEtlcmJlcm9zQXV0aG9yaXphdGlvbignaHR0cDovL3Byb3h5LmV4YW1wbGU6ODA4MCcpLFxuXHRcdF07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgY2FsbHMsIHJlc3VsdHMgfSwge1xuXHRcdFx0Y2FsbHM6IFtcblx0XHRcdFx0WydyZXNvbHZlUHJveHknLCAnaHR0cHM6Ly9leGFtcGxlLmNvbSddLFxuXHRcdFx0XHRbJ2xvb2t1cEF1dGhvcml6YXRpb24nLCBhdXRoSW5mb10sXG5cdFx0XHRcdFsnbG9va3VwS2VyYmVyb3NBdXRob3JpemF0aW9uJywgJ2h0dHA6Ly9wcm94eS5leGFtcGxlOjgwODAnXSxcblx0XHRcdF0sXG5cdFx0XHRyZXN1bHRzOiBbXG5cdFx0XHRcdCdQUk9YWSBwcm94eS5leGFtcGxlOjgwODAnLFxuXHRcdFx0XHR7IHVzZXJuYW1lOiAndXNlcicsIHBhc3N3b3JkOiAncGFzc3dvcmQnIH0sXG5cdFx0XHRcdCdOZWdvdGlhdGUgdG9rZW4nLFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ05ldHdvcmtEaWFnbm9zdGljc1NlcnZpY2UnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2luY2x1ZGVzIG5lc3RlZCBwcm94eSByZXNwb25zZSBlcnJvcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJveHlFcnJvciA9IG5ldyBFcnJvcignUHJveHkgcmVzcG9uc2UgKDQwNyknKTtcblx0XHRjb25zdCBmZXRjaEVycm9yID0gbmV3IFR5cGVFcnJvcignZmV0Y2ggZmFpbGVkJywgeyBjYXVzZTogbmV3IEVycm9yKCdkaXNwYXRjaGVyIGZhaWxlZCcsIHsgY2F1c2U6IHByb3h5RXJyb3IgfSkgfSk7XG5cdFx0Y29uc3QgcmVxdWVzdFNlcnZpY2U6IElSZXF1ZXN0U2VydmljZSA9IHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdG9uRGlkQ29tcGxldGVSZXF1ZXN0OiBFdmVudC5Ob25lLFxuXHRcdFx0cmVxdWVzdDogYXN5bmMgKCkgPT4geyB0aHJvdyBmZXRjaEVycm9yOyB9LFxuXHRcdFx0cmVzb2x2ZVByb3h5OiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRsb29rdXBBdXRob3JpemF0aW9uOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRsb29rdXBLZXJiZXJvc0F1dGhvcml6YXRpb246IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGxvYWRDZXJ0aWZpY2F0ZXM6IGFzeW5jICgpID0+IFtdLFxuXHRcdH07XG5cdFx0Y29uc3QgcHJveHlSZXNvbHZlciA9IG5ldyBUZXN0UHJveHlSZXNvbHZlcigpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgTmV0d29ya0RpYWdub3N0aWNzU2VydmljZShcblx0XHRcdHJlcXVlc3RTZXJ2aWNlLFxuXHRcdFx0cHJveHlSZXNvbHZlcixcblx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdHsgdmVyc2lvbjogJ3Rlc3QnIH0gYXMgSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZmV0Y2goJ2h0dHBzOi8vbG9jYWxob3N0Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmVycm9yLCAnZmV0Y2ggZmFpbGVkOiBkaXNwYXRjaGVyIGZhaWxlZDogUHJveHkgcmVzcG9uc2UgKDQwNyknKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMsc0JBQXNCO0FBRy9CLFNBQVMsNkJBQTZCLDRDQUFrRjtBQUV4SCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGlDQUFpQztBQUUxQyxNQUFNLGtCQUFxRDtBQUFBLEVBQTNEO0FBS0MscUJBQXFDLE1BQU0sUUFBUSxRQUFRLElBQUksU0FBUyxDQUFD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
