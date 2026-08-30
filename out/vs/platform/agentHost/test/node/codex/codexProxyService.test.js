import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../log/common/log.js";
import {
  CopilotApiError
} from "../../../node/shared/copilotApiService.js";
import { CodexProxyService, remapCodexReviewerModel } from "../../../node/codex/codexProxyService.js";
import { extractForwardedErrorInfo } from "../../../node/shared/proxyChatError.js";
class FakeCopilotApiService {
  constructor() {
    this.responsesCalls = [];
    this.modelsCalls = [];
    this.modelsResult = [
      { id: "gpt-5.5", name: "GPT-5.5", supported_endpoints: ["/responses"] },
      { id: "claude-sonnet", name: "Claude Sonnet", supported_endpoints: ["/v1/messages"] }
    ];
  }
  async resolveRestrictedTelemetryContext() {
    return { restrictedTelemetryEnabled: false, trackingId: void 0, telemetryEndpoint: void 0 };
  }
  async resolveApiEndpoint() {
    return void 0;
  }
  messages() {
    throw new Error("messages not used by Codex proxy tests");
  }
  async countTokens() {
    throw new Error("countTokens not used by Codex proxy tests");
  }
  async models(githubToken, options) {
    this.modelsCalls.push({ githubToken, options });
    return this.modelsResult;
  }
  async responses(githubToken, body, options) {
    this.responsesCalls.push({ githubToken, body, options });
    if (this.responsesError) {
      throw this.responsesError;
    }
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("event: response.completed\ndata: {}\n\n"));
        controller.close();
      }
    });
    return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
  }
  async utilityChatCompletion() {
    throw new Error("utilityChatCompletion not used by Codex proxy tests");
  }
}
let _httpModule;
async function getHttp() {
  if (!_httpModule) {
    _httpModule = await import("http");
  }
  return _httpModule;
}
function postResponses(url, init) {
  return getHttp().then((httpMod) => new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = httpMod.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: "POST",
      headers: init.headers
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("error", reject);
    if (init.body !== void 0) {
      req.write(init.body);
    }
    req.end();
  }));
}
function get(url, headers) {
  return getHttp().then((httpMod) => new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = httpMod.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: "GET",
      headers
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  }));
}
const TOKEN = "gh-test-token";
suite("CodexProxyService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  async function withProxy(fn) {
    const fake = new FakeCopilotApiService();
    const service = new CodexProxyService(new NullLogService(), fake);
    const handle = await service.start(TOKEN);
    try {
      await fn(handle, fake);
    } finally {
      handle.dispose();
      service.dispose();
    }
  }
  test("forwards transformed user-agent to CAPI responses", async () => {
    await withProxy(async (handle, fake) => {
      await postResponses(`${handle.baseUrl}/v1/responses`, {
        headers: { "Authorization": `Bearer ${handle.nonce}`, "User-Agent": "codex/1.2.3" },
        body: JSON.stringify({ model: "gpt-5", stream: true, input: [] })
      });
      assert.strictEqual(fake.responsesCalls.at(-1)?.options?.headers?.["User-Agent"], "vscode_codex/1.2.3");
    });
  });
  test("preserves endpoint discovery authentication failures", async () => {
    await withProxy(async (handle, fake) => {
      fake.responsesError = new CopilotApiError(401, {
        type: "error",
        error: { type: "api_error", message: '{"message":"Bad credentials"}' },
        request_id: null
      }, 'Copilot endpoint discovery failed: 401 Unauthorized \u2014 {"message":"Bad credentials"}');
      const response = await postResponses(`${handle.baseUrl}/v1/responses`, {
        headers: { "Authorization": `Bearer ${handle.nonce}` },
        body: JSON.stringify({ model: "gpt-5", stream: true, input: [] })
      });
      const error = JSON.parse(response.body).error;
      assert.deepStrictEqual({
        status: response.status,
        type: error.type,
        error: extractForwardedErrorInfo(error.message)
      }, {
        status: 401,
        type: "api_error",
        error: {
          message: 'Copilot endpoint discovery failed: 401 Unauthorized \u2014 {"message":"Bad credentials"}',
          _meta: {
            chatError: {
              fetchError: {
                type: "agent_unauthorized",
                reason: '{"message":"Bad credentials"}',
                requestId: "",
                capiError: {
                  code: "api_error",
                  message: '{"message":"Bad credentials"}'
                }
              }
            }
          }
        }
      });
    });
  });
  test("serves an empty Codex model catalog", async () => {
    await withProxy(async (handle, fake) => {
      const response = await get(`${handle.baseUrl}/v1/models?client_version=0.146.0`, {
        "Authorization": `Bearer ${handle.nonce}`,
        "User-Agent": "codex/0.146.0"
      });
      assert.strictEqual(response.status, 200);
      assert.deepStrictEqual(JSON.parse(response.body), { models: [] });
      assert.deepStrictEqual(fake.modelsCalls, []);
    });
  });
  test("keeps the suffix when transforming a multi-segment user-agent", async () => {
    await withProxy(async (handle, fake) => {
      await postResponses(`${handle.baseUrl}/v1/responses`, {
        headers: { "Authorization": `Bearer ${handle.nonce}`, "User-Agent": "OpenAI/Python/1.0" },
        body: JSON.stringify({ model: "gpt-5", stream: true, input: [] })
      });
      assert.strictEqual(fake.responsesCalls.at(-1)?.options?.headers?.["User-Agent"], "vscode_codex/Python/1.0");
    });
  });
  test("omits User-Agent when the inbound request has none", async () => {
    await withProxy(async (handle, fake) => {
      await postResponses(`${handle.baseUrl}/v1/responses`, {
        headers: { "Authorization": `Bearer ${handle.nonce}` },
        body: JSON.stringify({ model: "gpt-5", stream: true, input: [] })
      });
      assert.strictEqual(fake.responsesCalls.at(-1)?.options?.headers?.["User-Agent"], void 0);
    });
  });
  test("remaps the unsupported auto-review reviewer model onto the last primary model", async () => {
    await withProxy(async (handle, fake) => {
      const headers = { "Authorization": `Bearer ${handle.nonce}`, "User-Agent": "codex/1.0" };
      await postResponses(`${handle.baseUrl}/v1/responses`, {
        headers,
        body: JSON.stringify({ model: "gpt-5.5", stream: true, input: [] })
      });
      await postResponses(`${handle.baseUrl}/v1/responses`, {
        headers,
        body: JSON.stringify({ model: "codex-auto-review", stream: true, input: [] })
      });
      assert.deepStrictEqual(fake.responsesCalls.map((call) => JSON.parse(call.body).model), ["gpt-5.5", "gpt-5.5"]);
    });
  });
  test("forwards the auto-review reviewer model unchanged when no primary model has been seen", async () => {
    await withProxy(async (handle, fake) => {
      await postResponses(`${handle.baseUrl}/v1/responses`, {
        headers: { "Authorization": `Bearer ${handle.nonce}`, "User-Agent": "codex/1.0" },
        body: JSON.stringify({ model: "codex-auto-review", stream: true, input: [] })
      });
      assert.strictEqual(JSON.parse(fake.responsesCalls.at(-1).body).model, "codex-auto-review");
    });
  });
  test("remaps the reviewer model onto the most recent primary model", async () => {
    await withProxy(async (handle, fake) => {
      const headers = { "Authorization": `Bearer ${handle.nonce}`, "User-Agent": "codex/1.0" };
      await postResponses(`${handle.baseUrl}/v1/responses`, { headers, body: JSON.stringify({ model: "gpt-5.5", input: [] }) });
      await postResponses(`${handle.baseUrl}/v1/responses`, { headers, body: JSON.stringify({ model: "gpt-5-codex", input: [] }) });
      await postResponses(`${handle.baseUrl}/v1/responses`, { headers, body: JSON.stringify({ model: "codex-auto-review", input: [] }) });
      assert.strictEqual(JSON.parse(fake.responsesCalls.at(-1).body).model, "gpt-5-codex");
    });
  });
  suite("remapCodexReviewerModel", () => {
    test("records the primary model and leaves the body untouched", () => {
      const state = { lastPrimaryModel: void 0 };
      const result = remapCodexReviewerModel(JSON.stringify({ model: "gpt-5.5", input: [] }), state);
      assert.deepStrictEqual({ remappedFrom: result.remappedFrom, lastPrimaryModel: state.lastPrimaryModel, model: JSON.parse(result.body).model }, { remappedFrom: void 0, lastPrimaryModel: "gpt-5.5", model: "gpt-5.5" });
    });
    test("remaps the reviewer model and reports the substitution", () => {
      const state = { lastPrimaryModel: "gpt-5.5" };
      const result = remapCodexReviewerModel(JSON.stringify({ model: "codex-auto-review", input: [] }), state);
      assert.deepStrictEqual({ remappedFrom: result.remappedFrom, remappedTo: result.remappedTo, model: JSON.parse(result.body).model }, { remappedFrom: "codex-auto-review", remappedTo: "gpt-5.5", model: "gpt-5.5" });
    });
    test("returns the original body for unparseable or model-less payloads", () => {
      const state = { lastPrimaryModel: "gpt-5.5" };
      assert.deepStrictEqual({
        unparseable: remapCodexReviewerModel("not json", state).body,
        modelless: remapCodexReviewerModel(JSON.stringify({ input: [] }), state).body
      }, {
        unparseable: "not json",
        modelless: JSON.stringify({ input: [] })
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb2RleFxcY29kZXhQcm94eVNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB0eXBlIHsgQ0NBTW9kZWwgfSBmcm9tICdAdnNjb2RlL2NvcGlsb3QtYXBpJztcbmltcG9ydCB0eXBlICogYXMgaHR0cCBmcm9tICdodHRwJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQge1xuXHRDb3BpbG90QXBpRXJyb3IsXG5cdHR5cGUgSUNvcGlsb3RBcGlTZXJ2aWNlLFxuXHR0eXBlIElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zLFxufSBmcm9tICcuLi8uLi8uLi9ub2RlL3NoYXJlZC9jb3BpbG90QXBpU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb2RleFByb3h5U2VydmljZSwgcmVtYXBDb2RleFJldmlld2VyTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2NvZGV4L2NvZGV4UHJveHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGV4dHJhY3RGb3J3YXJkZWRFcnJvckluZm8gfSBmcm9tICcuLi8uLi8uLi9ub2RlL3NoYXJlZC9wcm94eUNoYXRFcnJvci5qcyc7XG5cbi8vICNyZWdpb24gVGVzdCBmYWtlc1xuXG5pbnRlcmZhY2UgSVJlc3BvbnNlc0NhbGwge1xuXHRnaXRodWJUb2tlbjogc3RyaW5nO1xuXHRib2R5OiBzdHJpbmc7XG5cdG9wdGlvbnM6IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zIHwgdW5kZWZpbmVkO1xufVxuXG5jbGFzcyBGYWtlQ29waWxvdEFwaVNlcnZpY2UgaW1wbGVtZW50cyBJQ29waWxvdEFwaVNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRhc3luYyByZXNvbHZlUmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQoKSB7IHJldHVybiB7IHJlc3RyaWN0ZWRUZWxlbWV0cnlFbmFibGVkOiBmYWxzZSwgdHJhY2tpbmdJZDogdW5kZWZpbmVkLCB0ZWxlbWV0cnlFbmRwb2ludDogdW5kZWZpbmVkIH07IH1cblx0YXN5bmMgcmVzb2x2ZUFwaUVuZHBvaW50KCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0cmVhZG9ubHkgcmVzcG9uc2VzQ2FsbHM6IElSZXNwb25zZXNDYWxsW10gPSBbXTtcblx0cmVhZG9ubHkgbW9kZWxzQ2FsbHM6IHsgZ2l0aHViVG9rZW46IHN0cmluZzsgb3B0aW9uczogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMgfCB1bmRlZmluZWQgfVtdID0gW107XG5cdHJlc3BvbnNlc0Vycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgbW9kZWxzUmVzdWx0ID0gW1xuXHRcdHsgaWQ6ICdncHQtNS41JywgbmFtZTogJ0dQVC01LjUnLCBzdXBwb3J0ZWRfZW5kcG9pbnRzOiBbJy9yZXNwb25zZXMnXSB9LFxuXHRcdHsgaWQ6ICdjbGF1ZGUtc29ubmV0JywgbmFtZTogJ0NsYXVkZSBTb25uZXQnLCBzdXBwb3J0ZWRfZW5kcG9pbnRzOiBbJy92MS9tZXNzYWdlcyddIH0sXG5cdF0gYXMgQ0NBTW9kZWxbXTtcblxuXHRtZXNzYWdlcygpOiBuZXZlciB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdtZXNzYWdlcyBub3QgdXNlZCBieSBDb2RleCBwcm94eSB0ZXN0cycpO1xuXHR9XG5cblx0YXN5bmMgY291bnRUb2tlbnMoKTogUHJvbWlzZTxuZXZlcj4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignY291bnRUb2tlbnMgbm90IHVzZWQgYnkgQ29kZXggcHJveHkgdGVzdHMnKTtcblx0fVxuXG5cdGFzeW5jIG1vZGVscyhnaXRodWJUb2tlbjogc3RyaW5nLCBvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPENDQU1vZGVsW10+IHtcblx0XHR0aGlzLm1vZGVsc0NhbGxzLnB1c2goeyBnaXRodWJUb2tlbiwgb3B0aW9ucyB9KTtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbHNSZXN1bHQ7XG5cdH1cblxuXHRhc3luYyByZXNwb25zZXMoZ2l0aHViVG9rZW46IHN0cmluZywgYm9keTogc3RyaW5nLCBvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPFJlc3BvbnNlPiB7XG5cdFx0dGhpcy5yZXNwb25zZXNDYWxscy5wdXNoKHsgZ2l0aHViVG9rZW4sIGJvZHksIG9wdGlvbnMgfSk7XG5cdFx0aWYgKHRoaXMucmVzcG9uc2VzRXJyb3IpIHtcblx0XHRcdHRocm93IHRoaXMucmVzcG9uc2VzRXJyb3I7XG5cdFx0fVxuXHRcdGNvbnN0IHN0cmVhbSA9IG5ldyBSZWFkYWJsZVN0cmVhbTxVaW50OEFycmF5Pih7XG5cdFx0XHRzdGFydChjb250cm9sbGVyKSB7XG5cdFx0XHRcdGNvbnRyb2xsZXIuZW5xdWV1ZShuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoJ2V2ZW50OiByZXNwb25zZS5jb21wbGV0ZWRcXG5kYXRhOiB7fVxcblxcbicpKTtcblx0XHRcdFx0Y29udHJvbGxlci5jbG9zZSgpO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRyZXR1cm4gbmV3IFJlc3BvbnNlKHN0cmVhbSwgeyBzdGF0dXM6IDIwMCwgaGVhZGVyczogeyAnY29udGVudC10eXBlJzogJ3RleHQvZXZlbnQtc3RyZWFtJyB9IH0pO1xuXHR9XG5cblx0YXN5bmMgdXRpbGl0eUNoYXRDb21wbGV0aW9uKCk6IFByb21pc2U8bmV2ZXI+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ3V0aWxpdHlDaGF0Q29tcGxldGlvbiBub3QgdXNlZCBieSBDb2RleCBwcm94eSB0ZXN0cycpO1xuXHR9XG59XG5cbi8vICNlbmRyZWdpb25cblxuLy8gI3JlZ2lvbiBIVFRQIGhlbHBlcnNcblxubGV0IF9odHRwTW9kdWxlOiB0eXBlb2YgaHR0cCB8IHVuZGVmaW5lZDtcbmFzeW5jIGZ1bmN0aW9uIGdldEh0dHAoKTogUHJvbWlzZTx0eXBlb2YgaHR0cD4ge1xuXHRpZiAoIV9odHRwTW9kdWxlKSB7XG5cdFx0X2h0dHBNb2R1bGUgPSBhd2FpdCBpbXBvcnQoJ2h0dHAnKTtcblx0fVxuXHRyZXR1cm4gX2h0dHBNb2R1bGU7XG59XG5cbmZ1bmN0aW9uIHBvc3RSZXNwb25zZXModXJsOiBzdHJpbmcsIGluaXQ6IHsgaGVhZGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47IGJvZHk/OiBzdHJpbmcgfSk6IFByb21pc2U8eyBzdGF0dXM6IG51bWJlcjsgYm9keTogc3RyaW5nIH0+IHtcblx0cmV0dXJuIGdldEh0dHAoKS50aGVuKGh0dHBNb2QgPT4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGNvbnN0IHUgPSBuZXcgVVJMKHVybCk7XG5cdFx0Y29uc3QgcmVxID0gaHR0cE1vZC5yZXF1ZXN0KHtcblx0XHRcdGhvc3RuYW1lOiB1Lmhvc3RuYW1lLFxuXHRcdFx0cG9ydDogdS5wb3J0LFxuXHRcdFx0cGF0aDogdS5wYXRobmFtZSArIHUuc2VhcmNoLFxuXHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRoZWFkZXJzOiBpbml0LmhlYWRlcnMsXG5cdFx0fSwgcmVzID0+IHtcblx0XHRcdGNvbnN0IGNodW5rczogQnVmZmVyW10gPSBbXTtcblx0XHRcdHJlcy5vbignZGF0YScsIGMgPT4gY2h1bmtzLnB1c2goQnVmZmVyLmlzQnVmZmVyKGMpID8gYyA6IEJ1ZmZlci5mcm9tKGMpKSk7XG5cdFx0XHRyZXMub24oJ2VuZCcsICgpID0+IHJlc29sdmUoeyBzdGF0dXM6IHJlcy5zdGF0dXNDb2RlID8/IDAsIGJvZHk6IEJ1ZmZlci5jb25jYXQoY2h1bmtzKS50b1N0cmluZygndXRmOCcpIH0pKTtcblx0XHRcdHJlcy5vbignZXJyb3InLCByZWplY3QpO1xuXHRcdH0pO1xuXHRcdHJlcS5vbignZXJyb3InLCByZWplY3QpO1xuXHRcdGlmIChpbml0LmJvZHkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmVxLndyaXRlKGluaXQuYm9keSk7XG5cdFx0fVxuXHRcdHJlcS5lbmQoKTtcblx0fSkpO1xufVxuXG5mdW5jdGlvbiBnZXQodXJsOiBzdHJpbmcsIGhlYWRlcnM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTx7IHN0YXR1czogbnVtYmVyOyBib2R5OiBzdHJpbmcgfT4ge1xuXHRyZXR1cm4gZ2V0SHR0cCgpLnRoZW4oaHR0cE1vZCA9PiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29uc3QgdSA9IG5ldyBVUkwodXJsKTtcblx0XHRjb25zdCByZXEgPSBodHRwTW9kLnJlcXVlc3Qoe1xuXHRcdFx0aG9zdG5hbWU6IHUuaG9zdG5hbWUsXG5cdFx0XHRwb3J0OiB1LnBvcnQsXG5cdFx0XHRwYXRoOiB1LnBhdGhuYW1lICsgdS5zZWFyY2gsXG5cdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0aGVhZGVycyxcblx0XHR9LCByZXMgPT4ge1xuXHRcdFx0Y29uc3QgY2h1bmtzOiBCdWZmZXJbXSA9IFtdO1xuXHRcdFx0cmVzLm9uKCdkYXRhJywgYyA9PiBjaHVua3MucHVzaChCdWZmZXIuaXNCdWZmZXIoYykgPyBjIDogQnVmZmVyLmZyb20oYykpKTtcblx0XHRcdHJlcy5vbignZW5kJywgKCkgPT4gcmVzb2x2ZSh7IHN0YXR1czogcmVzLnN0YXR1c0NvZGUgPz8gMCwgYm9keTogQnVmZmVyLmNvbmNhdChjaHVua3MpLnRvU3RyaW5nKCd1dGY4JykgfSkpO1xuXHRcdFx0cmVzLm9uKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0fSk7XG5cdFx0cmVxLm9uKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0cmVxLmVuZCgpO1xuXHR9KSk7XG59XG5cbi8vICNlbmRyZWdpb25cblxuY29uc3QgVE9LRU4gPSAnZ2gtdGVzdC10b2tlbic7XG5cbnN1aXRlKCdDb2RleFByb3h5U2VydmljZScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRhc3luYyBmdW5jdGlvbiB3aXRoUHJveHkoZm46IChoYW5kbGU6IHsgYmFzZVVybDogc3RyaW5nOyBub25jZTogc3RyaW5nIH0sIGZha2U6IEZha2VDb3BpbG90QXBpU2VydmljZSkgPT4gUHJvbWlzZTx2b2lkPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZha2UgPSBuZXcgRmFrZUNvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBDb2RleFByb3h5U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgZmFrZSk7XG5cdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydChUT0tFTik7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGZuKGhhbmRsZSwgZmFrZSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHR0ZXN0KCdmb3J3YXJkcyB0cmFuc2Zvcm1lZCB1c2VyLWFnZW50IHRvIENBUEkgcmVzcG9uc2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhQcm94eShhc3luYyAoaGFuZGxlLCBmYWtlKSA9PiB7XG5cdFx0XHRhd2FpdCBwb3N0UmVzcG9uc2VzKGAke2hhbmRsZS5iYXNlVXJsfS92MS9yZXNwb25zZXNgLCB7XG5cdFx0XHRcdGhlYWRlcnM6IHsgJ0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfWAsICdVc2VyLUFnZW50JzogJ2NvZGV4LzEuMi4zJyB9LFxuXHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnZ3B0LTUnLCBzdHJlYW06IHRydWUsIGlucHV0OiBbXSB9KSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZha2UucmVzcG9uc2VzQ2FsbHMuYXQoLTEpPy5vcHRpb25zPy5oZWFkZXJzPy5bJ1VzZXItQWdlbnQnXSwgJ3ZzY29kZV9jb2RleC8xLjIuMycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgZW5kcG9pbnQgZGlzY292ZXJ5IGF1dGhlbnRpY2F0aW9uIGZhaWx1cmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhQcm94eShhc3luYyAoaGFuZGxlLCBmYWtlKSA9PiB7XG5cdFx0XHRmYWtlLnJlc3BvbnNlc0Vycm9yID0gbmV3IENvcGlsb3RBcGlFcnJvcig0MDEsIHtcblx0XHRcdFx0dHlwZTogJ2Vycm9yJyxcblx0XHRcdFx0ZXJyb3I6IHsgdHlwZTogJ2FwaV9lcnJvcicsIG1lc3NhZ2U6ICd7XCJtZXNzYWdlXCI6XCJCYWQgY3JlZGVudGlhbHNcIn0nIH0sXG5cdFx0XHRcdHJlcXVlc3RfaWQ6IG51bGwsXG5cdFx0XHR9LCAnQ29waWxvdCBlbmRwb2ludCBkaXNjb3ZlcnkgZmFpbGVkOiA0MDEgVW5hdXRob3JpemVkIFx1MjAxNCB7XCJtZXNzYWdlXCI6XCJCYWQgY3JlZGVudGlhbHNcIn0nKTtcblxuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBwb3N0UmVzcG9uc2VzKGAke2hhbmRsZS5iYXNlVXJsfS92MS9yZXNwb25zZXNgLCB7XG5cdFx0XHRcdGhlYWRlcnM6IHsgJ0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfWAgfSxcblx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ2dwdC01Jywgc3RyZWFtOiB0cnVlLCBpbnB1dDogW10gfSksXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGVycm9yID0gSlNPTi5wYXJzZShyZXNwb25zZS5ib2R5KS5lcnJvciBhcyB7IHR5cGU6IHN0cmluZzsgbWVzc2FnZTogc3RyaW5nIH07XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzdGF0dXM6IHJlc3BvbnNlLnN0YXR1cyxcblx0XHRcdFx0dHlwZTogZXJyb3IudHlwZSxcblx0XHRcdFx0ZXJyb3I6IGV4dHJhY3RGb3J3YXJkZWRFcnJvckluZm8oZXJyb3IubWVzc2FnZSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHN0YXR1czogNDAxLFxuXHRcdFx0XHR0eXBlOiAnYXBpX2Vycm9yJyxcblx0XHRcdFx0ZXJyb3I6IHtcblx0XHRcdFx0XHRtZXNzYWdlOiAnQ29waWxvdCBlbmRwb2ludCBkaXNjb3ZlcnkgZmFpbGVkOiA0MDEgVW5hdXRob3JpemVkIFx1MjAxNCB7XCJtZXNzYWdlXCI6XCJCYWQgY3JlZGVudGlhbHNcIn0nLFxuXHRcdFx0XHRcdF9tZXRhOiB7XG5cdFx0XHRcdFx0XHRjaGF0RXJyb3I6IHtcblx0XHRcdFx0XHRcdFx0ZmV0Y2hFcnJvcjoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdhZ2VudF91bmF1dGhvcml6ZWQnLFxuXHRcdFx0XHRcdFx0XHRcdHJlYXNvbjogJ3tcIm1lc3NhZ2VcIjpcIkJhZCBjcmVkZW50aWFsc1wifScsXG5cdFx0XHRcdFx0XHRcdFx0cmVxdWVzdElkOiAnJyxcblx0XHRcdFx0XHRcdFx0XHRjYXBpRXJyb3I6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGNvZGU6ICdhcGlfZXJyb3InLFxuXHRcdFx0XHRcdFx0XHRcdFx0bWVzc2FnZTogJ3tcIm1lc3NhZ2VcIjpcIkJhZCBjcmVkZW50aWFsc1wifScsXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJ2ZXMgYW4gZW1wdHkgQ29kZXggbW9kZWwgY2F0YWxvZycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoUHJveHkoYXN5bmMgKGhhbmRsZSwgZmFrZSkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBnZXQoYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21vZGVscz9jbGllbnRfdmVyc2lvbj0wLjE0Ni4wYCwge1xuXHRcdFx0XHQnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtoYW5kbGUubm9uY2V9YCxcblx0XHRcdFx0J1VzZXItQWdlbnQnOiAnY29kZXgvMC4xNDYuMCcsXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5zdGF0dXMsIDIwMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEpTT04ucGFyc2UocmVzcG9uc2UuYm9keSksIHsgbW9kZWxzOiBbXSB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmFrZS5tb2RlbHNDYWxscywgW10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyB0aGUgc3VmZml4IHdoZW4gdHJhbnNmb3JtaW5nIGEgbXVsdGktc2VnbWVudCB1c2VyLWFnZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhQcm94eShhc3luYyAoaGFuZGxlLCBmYWtlKSA9PiB7XG5cdFx0XHRhd2FpdCBwb3N0UmVzcG9uc2VzKGAke2hhbmRsZS5iYXNlVXJsfS92MS9yZXNwb25zZXNgLCB7XG5cdFx0XHRcdGhlYWRlcnM6IHsgJ0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfWAsICdVc2VyLUFnZW50JzogJ09wZW5BSS9QeXRob24vMS4wJyB9LFxuXHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnZ3B0LTUnLCBzdHJlYW06IHRydWUsIGlucHV0OiBbXSB9KSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZha2UucmVzcG9uc2VzQ2FsbHMuYXQoLTEpPy5vcHRpb25zPy5oZWFkZXJzPy5bJ1VzZXItQWdlbnQnXSwgJ3ZzY29kZV9jb2RleC9QeXRob24vMS4wJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29taXRzIFVzZXItQWdlbnQgd2hlbiB0aGUgaW5ib3VuZCByZXF1ZXN0IGhhcyBub25lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhQcm94eShhc3luYyAoaGFuZGxlLCBmYWtlKSA9PiB7XG5cdFx0XHRhd2FpdCBwb3N0UmVzcG9uc2VzKGAke2hhbmRsZS5iYXNlVXJsfS92MS9yZXNwb25zZXNgLCB7XG5cdFx0XHRcdGhlYWRlcnM6IHsgJ0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfWAgfSxcblx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ2dwdC01Jywgc3RyZWFtOiB0cnVlLCBpbnB1dDogW10gfSksXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYWtlLnJlc3BvbnNlc0NhbGxzLmF0KC0xKT8ub3B0aW9ucz8uaGVhZGVycz8uWydVc2VyLUFnZW50J10sIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbWFwcyB0aGUgdW5zdXBwb3J0ZWQgYXV0by1yZXZpZXcgcmV2aWV3ZXIgbW9kZWwgb250byB0aGUgbGFzdCBwcmltYXJ5IG1vZGVsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhQcm94eShhc3luYyAoaGFuZGxlLCBmYWtlKSA9PiB7XG5cdFx0XHRjb25zdCBoZWFkZXJzID0geyAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtoYW5kbGUubm9uY2V9YCwgJ1VzZXItQWdlbnQnOiAnY29kZXgvMS4wJyB9O1xuXHRcdFx0Ly8gQSBub3JtYWwgdHVybiBlc3RhYmxpc2hlcyB0aGUgc2Vzc2lvbidzIHByaW1hcnkgbW9kZWwuLi5cblx0XHRcdGF3YWl0IHBvc3RSZXNwb25zZXMoYCR7aGFuZGxlLmJhc2VVcmx9L3YxL3Jlc3BvbnNlc2AsIHtcblx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ2dwdC01LjUnLCBzdHJlYW06IHRydWUsIGlucHV0OiBbXSB9KSxcblx0XHRcdH0pO1xuXHRcdFx0Ly8gLi4udGhlbiB0aGUgYXV0by1yZXZpZXcgcmV2aWV3ZXIgZmlyZXMgd2l0aCB0aGUgdW5zdXBwb3J0ZWQgbW9kZWwuXG5cdFx0XHRhd2FpdCBwb3N0UmVzcG9uc2VzKGAke2hhbmRsZS5iYXNlVXJsfS92MS9yZXNwb25zZXNgLCB7XG5cdFx0XHRcdGhlYWRlcnMsXG5cdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6ICdjb2RleC1hdXRvLXJldmlldycsIHN0cmVhbTogdHJ1ZSwgaW5wdXQ6IFtdIH0pLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZha2UucmVzcG9uc2VzQ2FsbHMubWFwKGNhbGwgPT4gSlNPTi5wYXJzZShjYWxsLmJvZHkpLm1vZGVsKSwgWydncHQtNS41JywgJ2dwdC01LjUnXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcndhcmRzIHRoZSBhdXRvLXJldmlldyByZXZpZXdlciBtb2RlbCB1bmNoYW5nZWQgd2hlbiBubyBwcmltYXJ5IG1vZGVsIGhhcyBiZWVuIHNlZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFByb3h5KGFzeW5jIChoYW5kbGUsIGZha2UpID0+IHtcblx0XHRcdGF3YWl0IHBvc3RSZXNwb25zZXMoYCR7aGFuZGxlLmJhc2VVcmx9L3YxL3Jlc3BvbnNlc2AsIHtcblx0XHRcdFx0aGVhZGVyczogeyAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtoYW5kbGUubm9uY2V9YCwgJ1VzZXItQWdlbnQnOiAnY29kZXgvMS4wJyB9LFxuXHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnY29kZXgtYXV0by1yZXZpZXcnLCBzdHJlYW06IHRydWUsIGlucHV0OiBbXSB9KSxcblx0XHRcdH0pO1xuXHRcdFx0Ly8gR3JhY2VmdWwgZGVncmFkYXRpb246IG5vdGhpbmcgdG8gcmVtYXAgb250bywgc28gdGhlIHJlcXVlc3QgaXNcblx0XHRcdC8vIGZvcndhcmRlZCB2ZXJiYXRpbSAoYW5kIDQwMHMgdXBzdHJlYW0sIGV4YWN0bHkgYXMgYmVmb3JlKS5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChKU09OLnBhcnNlKGZha2UucmVzcG9uc2VzQ2FsbHMuYXQoLTEpIS5ib2R5KS5tb2RlbCwgJ2NvZGV4LWF1dG8tcmV2aWV3Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbWFwcyB0aGUgcmV2aWV3ZXIgbW9kZWwgb250byB0aGUgbW9zdCByZWNlbnQgcHJpbWFyeSBtb2RlbCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoUHJveHkoYXN5bmMgKGhhbmRsZSwgZmFrZSkgPT4ge1xuXHRcdFx0Y29uc3QgaGVhZGVycyA9IHsgJ0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfWAsICdVc2VyLUFnZW50JzogJ2NvZGV4LzEuMCcgfTtcblx0XHRcdGF3YWl0IHBvc3RSZXNwb25zZXMoYCR7aGFuZGxlLmJhc2VVcmx9L3YxL3Jlc3BvbnNlc2AsIHsgaGVhZGVycywgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ2dwdC01LjUnLCBpbnB1dDogW10gfSkgfSk7XG5cdFx0XHRhd2FpdCBwb3N0UmVzcG9uc2VzKGAke2hhbmRsZS5iYXNlVXJsfS92MS9yZXNwb25zZXNgLCB7IGhlYWRlcnMsIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6ICdncHQtNS1jb2RleCcsIGlucHV0OiBbXSB9KSB9KTtcblx0XHRcdGF3YWl0IHBvc3RSZXNwb25zZXMoYCR7aGFuZGxlLmJhc2VVcmx9L3YxL3Jlc3BvbnNlc2AsIHsgaGVhZGVycywgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ2NvZGV4LWF1dG8tcmV2aWV3JywgaW5wdXQ6IFtdIH0pIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEpTT04ucGFyc2UoZmFrZS5yZXNwb25zZXNDYWxscy5hdCgtMSkhLmJvZHkpLm1vZGVsLCAnZ3B0LTUtY29kZXgnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3JlbWFwQ29kZXhSZXZpZXdlck1vZGVsJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JlY29yZHMgdGhlIHByaW1hcnkgbW9kZWwgYW5kIGxlYXZlcyB0aGUgYm9keSB1bnRvdWNoZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHsgbGFzdFByaW1hcnlNb2RlbDogdW5kZWZpbmVkIGFzIHN0cmluZyB8IHVuZGVmaW5lZCB9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVtYXBDb2RleFJldmlld2VyTW9kZWwoSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ2dwdC01LjUnLCBpbnB1dDogW10gfSksIHN0YXRlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyByZW1hcHBlZEZyb206IHJlc3VsdC5yZW1hcHBlZEZyb20sIGxhc3RQcmltYXJ5TW9kZWw6IHN0YXRlLmxhc3RQcmltYXJ5TW9kZWwsIG1vZGVsOiBKU09OLnBhcnNlKHJlc3VsdC5ib2R5KS5tb2RlbCB9LCB7IHJlbWFwcGVkRnJvbTogdW5kZWZpbmVkLCBsYXN0UHJpbWFyeU1vZGVsOiAnZ3B0LTUuNScsIG1vZGVsOiAnZ3B0LTUuNScgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1hcHMgdGhlIHJldmlld2VyIG1vZGVsIGFuZCByZXBvcnRzIHRoZSBzdWJzdGl0dXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHsgbGFzdFByaW1hcnlNb2RlbDogJ2dwdC01LjUnIGFzIHN0cmluZyB8IHVuZGVmaW5lZCB9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVtYXBDb2RleFJldmlld2VyTW9kZWwoSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ2NvZGV4LWF1dG8tcmV2aWV3JywgaW5wdXQ6IFtdIH0pLCBzdGF0ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVtYXBwZWRGcm9tOiByZXN1bHQucmVtYXBwZWRGcm9tLCByZW1hcHBlZFRvOiByZXN1bHQucmVtYXBwZWRUbywgbW9kZWw6IEpTT04ucGFyc2UocmVzdWx0LmJvZHkpLm1vZGVsIH0sIHsgcmVtYXBwZWRGcm9tOiAnY29kZXgtYXV0by1yZXZpZXcnLCByZW1hcHBlZFRvOiAnZ3B0LTUuNScsIG1vZGVsOiAnZ3B0LTUuNScgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRoZSBvcmlnaW5hbCBib2R5IGZvciB1bnBhcnNlYWJsZSBvciBtb2RlbC1sZXNzIHBheWxvYWRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB7IGxhc3RQcmltYXJ5TW9kZWw6ICdncHQtNS41JyBhcyBzdHJpbmcgfCB1bmRlZmluZWQgfTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR1bnBhcnNlYWJsZTogcmVtYXBDb2RleFJldmlld2VyTW9kZWwoJ25vdCBqc29uJywgc3RhdGUpLmJvZHksXG5cdFx0XHRcdG1vZGVsbGVzczogcmVtYXBDb2RleFJldmlld2VyTW9kZWwoSlNPTi5zdHJpbmdpZnkoeyBpbnB1dDogW10gfSksIHN0YXRlKS5ib2R5LFxuXHRcdFx0fSwge1xuXHRcdFx0XHR1bnBhcnNlYWJsZTogJ25vdCBqc29uJyxcblx0XHRcdFx0bW9kZWxsZXNzOiBKU09OLnN0cmluZ2lmeSh7IGlucHV0OiBbXSB9KSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBR25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CO0FBQUEsRUFDQztBQUFBLE9BR007QUFDUCxTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyxpQ0FBaUM7QUFVMUMsTUFBTSxzQkFBb0Q7QUFBQSxFQUExRDtBQU1DLFNBQVMsaUJBQW1DLENBQUM7QUFDN0MsU0FBUyxjQUFnRyxDQUFDO0FBRTFHLFNBQVMsZUFBZTtBQUFBLE1BQ3ZCLEVBQUUsSUFBSSxXQUFXLE1BQU0sV0FBVyxxQkFBcUIsQ0FBQyxZQUFZLEVBQUU7QUFBQSxNQUN0RSxFQUFFLElBQUksaUJBQWlCLE1BQU0saUJBQWlCLHFCQUFxQixDQUFDLGNBQWMsRUFBRTtBQUFBLElBQ3JGO0FBQUE7QUFBQSxFQVRBLE1BQU0sb0NBQW9DO0FBQUUsV0FBTyxFQUFFLDRCQUE0QixPQUFPLFlBQVksUUFBVyxtQkFBbUIsT0FBVTtBQUFBLEVBQUc7QUFBQSxFQUMvSSxNQUFNLHFCQUFxQjtBQUFFLFdBQU87QUFBQSxFQUFXO0FBQUEsRUFVL0MsV0FBa0I7QUFDakIsVUFBTSxJQUFJLE1BQU0sd0NBQXdDO0FBQUEsRUFDekQ7QUFBQSxFQUVBLE1BQU0sY0FBOEI7QUFDbkMsVUFBTSxJQUFJLE1BQU0sMkNBQTJDO0FBQUEsRUFDNUQ7QUFBQSxFQUVBLE1BQU0sT0FBTyxhQUFxQixTQUFp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
