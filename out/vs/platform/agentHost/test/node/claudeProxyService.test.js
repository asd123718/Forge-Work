import assert from "assert";
import * as net from "net";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import {
  COPILOT_API_ERROR_STATUS_STREAMING,
  CopilotApiError
} from "../../node/shared/copilotApiService.js";
import { PROXY_ERROR_PREFIX, tryParseForwardedChatError } from "../../node/shared/proxyChatError.js";
import { ClaudeProxyService } from "../../node/claude/claudeProxyService.js";
function assertEnvelopeWithChatErrorMarker(actual, original, expectedFetchType) {
  assert.strictEqual(actual.type, "error");
  assert.strictEqual(actual.request_id, original.request_id);
  assert.strictEqual(actual.error.type, original.error.type);
  assert.ok(actual.error.message.startsWith(`${original.error.message} ${PROXY_ERROR_PREFIX}`), `expected marker-appended message, got: ${actual.error.message}`);
  const forwarded = tryParseForwardedChatError(actual.error.message);
  assert.ok(forwarded, "embedded marker should decode to a forwarded chat error");
  assert.strictEqual(forwarded.fetchError.type, expectedFetchType);
}
class FakeCopilotApiService {
  constructor() {
    this.messagesResult = { kind: "error", error: new Error("not configured") };
    this.modelsResult = { kind: "value", value: [] };
    this.messagesCalls = [];
    this.modelsCalls = [];
  }
  async resolveRestrictedTelemetryContext() {
    return { restrictedTelemetryEnabled: false, trackingId: void 0, telemetryEndpoint: void 0 };
  }
  async resolveApiEndpoint() {
    return void 0;
  }
  messages(githubToken, request, options) {
    this.messagesCalls.push({ githubToken, body: request, options });
    const result = this.messagesResult;
    if (request.stream) {
      return this._streamGen(result, options);
    }
    if (result.kind === "message") {
      return Promise.resolve(result.message);
    }
    if (result.kind === "error") {
      return Promise.reject(result.error);
    }
    return Promise.reject(new Error(`stream result configured but non-streaming request received`));
  }
  async *_streamGen(result, options) {
    if (result.kind === "error") {
      throw result.error;
    }
    if (result.kind !== "stream") {
      throw new Error(`non-stream result configured but streaming request received`);
    }
    let firstReadFired = false;
    for (const ev of result.events) {
      if (options?.signal?.aborted) {
        const e = new Error("Aborted");
        e.name = "AbortError";
        throw e;
      }
      if (!firstReadFired) {
        firstReadFired = true;
        this.onStreamFirstRead?.();
      }
      yield ev;
    }
    if (result.midStreamError) {
      throw result.midStreamError;
    }
  }
  async countTokens() {
    throw new Error("countTokens not supported");
  }
  async models(githubToken, options) {
    this.modelsCalls.push({ githubToken, options });
    if (this.modelsResult.kind === "error") {
      throw this.modelsResult.error;
    }
    return this.modelsResult.value;
  }
  async responses() {
    throw new Error("responses not used by Claude proxy tests");
  }
  async utilityChatCompletion() {
    throw new Error("utilityChatCompletion not used by Claude proxy tests");
  }
}
let _httpModule;
async function getHttp() {
  if (!_httpModule) {
    _httpModule = await import("http");
  }
  return _httpModule;
}
function fetchJson(url, init) {
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
    });
    req.on("error", reject);
    if (init?.body !== void 0) {
      req.write(init.body);
    }
    req.end();
  }));
}
function fetchSse(url, init, onResponse) {
  return getHttp().then((httpMod) => new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = httpMod.request({
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: init.method,
      headers: init.headers
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      res.on("end", () => {
        const rawBody = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          rawBody,
          events: parseSseFrames(rawBody)
        });
      });
      res.on("error", reject);
      onResponse?.(res, () => req.destroy());
    });
    req.on("error", (err) => {
      reject(err);
    });
    if (init.body !== void 0) {
      req.write(init.body);
    }
    req.end();
  }));
}
function parseSseFrames(raw) {
  const out = [];
  const blocks = raw.split("\n\n");
  for (const block of blocks) {
    if (!block.trim()) {
      continue;
    }
    let event = "";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) {
        event = line.slice("event: ".length).trim();
      } else if (line.startsWith("data: ")) {
        data = line.slice("data: ".length);
      }
    }
    if (event && data) {
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        parsed = data;
      }
      out.push({ type: event, data: parsed });
    }
  }
  return out;
}
const ANTHROPIC_MODEL = {
  id: "claude-opus-4.6",
  name: "Claude Opus 4.6",
  vendor: "Anthropic",
  supported_endpoints: ["/v1/messages"],
  object: "model",
  version: "4.6",
  is_chat_default: false,
  is_chat_fallback: false,
  model_picker_category: "",
  model_picker_enabled: true,
  preview: false,
  billing: { is_premium: false },
  capabilities: {},
  policy: {}
};
const NON_ANTHROPIC_MODEL = {
  ...ANTHROPIC_MODEL,
  id: "gpt-5",
  name: "GPT-5",
  vendor: "OpenAI",
  supported_endpoints: ["/v1/chat/completions"]
};
const NON_MESSAGES_ANTHROPIC = {
  ...ANTHROPIC_MODEL,
  id: "claude-instant-tokenizer",
  name: "Anthropic Tokenizer",
  supported_endpoints: ["/v1/tokenize"]
};
function makeMessage(model, text) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model,
    content: [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null
    }
  };
}
function makeStreamEvents(model) {
  const message = makeMessage(model, "");
  return [
    { type: "message_start", message },
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "", citations: [] } },
    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hello" } },
    { type: "content_block_stop", index: 0 },
    { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null } },
    { type: "message_stop" }
  ];
}
function createProxyService(fakeApi) {
  return new ClaudeProxyService(new NullLogService(), fakeApi);
}
const TOKEN = "gh-test-token";
suite("ClaudeProxyService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("Token slot", () => {
    test("start() updates token slot last-writer-wins", async () => {
      const fake = new FakeCopilotApiService();
      fake.modelsResult = { kind: "value", value: [] };
      const service = createProxyService(fake);
      const h1 = await service.start("token-A");
      const h2 = await service.start("token-B");
      try {
        await fetchJson(`${h2.baseUrl}/v1/models`, {
          headers: { "Authorization": `Bearer ${h2.nonce}.s1` }
        });
        assert.strictEqual(fake.modelsCalls.at(-1)?.githubToken, "token-B");
      } finally {
        h1.dispose();
        h2.dispose();
        service.dispose();
      }
    });
  });
  suite("Auth", () => {
    async function withProxy(fn) {
      const fake = new FakeCopilotApiService();
      fake.modelsResult = { kind: "value", value: [ANTHROPIC_MODEL] };
      fake.messagesResult = { kind: "message", message: makeMessage("claude-opus-4.6", "hi") };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        return await fn(handle, fake);
      } finally {
        handle.dispose();
        service.dispose();
      }
    }
    test("missing Authorization header \u2192 401", async () => {
      await withProxy(async (handle) => {
        const res = await fetchJson(`${handle.baseUrl}/v1/models`);
        assert.strictEqual(res.status, 401);
        assert.deepStrictEqual(res.parsed, {
          type: "error",
          error: { type: "authentication_error", message: "Invalid authentication" },
          request_id: null
        });
      });
    });
    test("Bearer wrong-nonce.x \u2192 401", async () => {
      await withProxy(async (handle) => {
        const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
          headers: { "Authorization": "Bearer wrong-nonce.session" }
        });
        assert.strictEqual(res.status, 401);
      });
    });
    test("Bearer <nonce> (no dot) \u2192 401", async () => {
      await withProxy(async (handle) => {
        const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
          headers: { "Authorization": `Bearer ${handle.nonce}` }
        });
        assert.strictEqual(res.status, 401);
      });
    });
    test("Bearer <nonce>. (empty sessionId) \u2192 401", async () => {
      await withProxy(async (handle) => {
        const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
          headers: { "Authorization": `Bearer ${handle.nonce}.` }
        });
        assert.strictEqual(res.status, 401);
      });
    });
    test("x-api-key alone \u2192 401", async () => {
      await withProxy(async (handle) => {
        const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
          headers: { "x-api-key": handle.nonce }
        });
        assert.strictEqual(res.status, 401);
      });
    });
    test("Bearer <nonce>.<sessionId> \u2192 request proceeds", async () => {
      await withProxy(async (handle, fake) => {
        const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
          headers: { "Authorization": `Bearer ${handle.nonce}.session-abc` }
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(fake.modelsCalls.length, 1);
      });
    });
    test("auth-first precedence: GET /v1/models with bad auth does not reach upstream", async () => {
      await withProxy(async (handle, fake) => {
        const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
          headers: { "Authorization": "Bearer wrong.s" }
        });
        assert.strictEqual(res.status, 401);
        assert.strictEqual(fake.modelsCalls.length, 0);
      });
    });
    test("auth-first precedence: POST /v1/messages with bad auth does not reach upstream", async () => {
      await withProxy(async (handle, fake) => {
        const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": "Bearer wrong.s",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8 })
        });
        assert.strictEqual(res.status, 401);
        assert.strictEqual(fake.messagesCalls.length, 0);
      });
    });
    test("auth-first precedence: POST /v1/messages/count_tokens with bad auth \u2192 401 (not 501)", async () => {
      await withProxy(async (handle) => {
        const res = await fetchJson(`${handle.baseUrl}/v1/messages/count_tokens`, {
          method: "POST",
          headers: { "Authorization": "Bearer wrong.s" },
          body: "{}"
        });
        assert.strictEqual(res.status, 401);
      });
    });
  });
  suite("Routes", () => {
    test("GET / \u2192 200 ok, no auth required", async () => {
      const fake = new FakeCopilotApiService();
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body, "ok");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("POST /v1/messages/count_tokens \u2192 501 api_error", async () => {
      const fake = new FakeCopilotApiService();
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v1/messages/count_tokens`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${handle.nonce}.s` },
          body: "{}"
        });
        assert.strictEqual(res.status, 501);
        assert.deepStrictEqual(res.parsed, {
          type: "error",
          error: { type: "api_error", message: "count_tokens not supported by CAPI" },
          request_id: null
        });
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("GET /something-else \u2192 404 not_found_error", async () => {
      const fake = new FakeCopilotApiService();
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v2/whatever`, {
          headers: { "Authorization": `Bearer ${handle.nonce}.s` }
        });
        assert.strictEqual(res.status, 404);
        const env = res.parsed;
        assert.strictEqual(env.type, "error");
        assert.strictEqual(env.error.type, "not_found_error");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
  });
  suite("GET /v1/models", () => {
    test("returns Page envelope with SDK-format IDs and filters by vendor + endpoint", async () => {
      const fake = new FakeCopilotApiService();
      fake.modelsResult = { kind: "value", value: [ANTHROPIC_MODEL, NON_ANTHROPIC_MODEL, NON_MESSAGES_ANTHROPIC] };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
          headers: { "Authorization": `Bearer ${handle.nonce}.s` }
        });
        assert.strictEqual(res.status, 200);
        const body = res.parsed;
        assert.deepStrictEqual(body, {
          data: [{
            id: "claude-opus-4-6",
            type: "model",
            display_name: "Claude Opus 4.6",
            created_at: "1970-01-01T00:00:00Z",
            capabilities: null,
            max_input_tokens: null,
            max_tokens: null
          }],
          has_more: false,
          first_id: "claude-opus-4-6",
          last_id: "claude-opus-4-6"
        });
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("upstream CopilotApiError is re-emitted verbatim with original status", async () => {
      const fake = new FakeCopilotApiService();
      const envelope = {
        type: "error",
        error: { type: "rate_limit_error", message: "slow down" },
        request_id: "req_123"
      };
      fake.modelsResult = { kind: "error", error: new CopilotApiError(429, envelope) };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
          headers: { "Authorization": `Bearer ${handle.nonce}.s` }
        });
        assert.strictEqual(res.status, 429);
        assert.deepStrictEqual(res.parsed, envelope);
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("non-CopilotApiError \u2192 502 api_error", async () => {
      const fake = new FakeCopilotApiService();
      fake.modelsResult = { kind: "error", error: new Error("ECONNRESET") };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v1/models`, {
          headers: { "Authorization": `Bearer ${handle.nonce}.s` }
        });
        assert.strictEqual(res.status, 502);
        const env = res.parsed;
        assert.strictEqual(env.error.type, "api_error");
        assert.strictEqual(env.error.message, "ECONNRESET");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
  });
  suite("POST /v1/messages model translation", () => {
    test("SDK ID inbound is translated to endpoint ID upstream", async () => {
      const fake = new FakeCopilotApiService();
      fake.messagesResult = { kind: "message", message: makeMessage("claude-opus-4.6", "hi") };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6-20251101", messages: [], max_tokens: 8 })
        });
        assert.strictEqual(fake.messagesCalls.length, 1);
        assert.strictEqual(fake.messagesCalls[0].body.model, "claude-opus-4.6");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("endpoint ID inbound is also accepted", async () => {
      const fake = new FakeCopilotApiService();
      fake.messagesResult = { kind: "message", message: makeMessage("claude-opus-4.6", "hi") };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4.6", messages: [], max_tokens: 8 })
        });
        assert.strictEqual(fake.messagesCalls[0].body.model, "claude-opus-4.6");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("unparseable model \u2192 404 with no upstream call", async () => {
      const fake = new FakeCopilotApiService();
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "gpt-4o", messages: [], max_tokens: 8 })
        });
        assert.strictEqual(res.status, 404);
        const env = res.parsed;
        assert.strictEqual(env.error.type, "not_found_error");
        assert.strictEqual(fake.messagesCalls.length, 0);
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("non-streaming response model is rewritten to SDK format", async () => {
      const fake = new FakeCopilotApiService();
      fake.messagesResult = { kind: "message", message: makeMessage("claude-opus-4.6", "hi") };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8 })
        });
        assert.strictEqual(res.status, 200);
        const msg = res.parsed;
        assert.strictEqual(msg.model, "claude-opus-4-6");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
  });
  suite("Credits reporting", () => {
    test("streaming: copilot_usage.total_nano_aiu fires onDidReportCredits with the session id", async () => {
      const fake = new FakeCopilotApiService();
      const events = makeStreamEvents("claude-opus-4.6");
      const delta = events.find((e) => e.type === "message_delta");
      delta.copilot_usage = { total_nano_aiu: 75e7 };
      fake.messagesResult = { kind: "stream", events };
      const service = createProxyService(fake);
      const reports = [];
      const sub = service.onDidReportCredits((e) => reports.push(e));
      const handle = await service.start(TOKEN);
      try {
        await fetchSse(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.sess-42`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8, stream: true })
        });
        assert.deepStrictEqual(reports, [{ sessionId: "sess-42", totalNanoAiu: 75e7 }]);
      } finally {
        sub.dispose();
        handle.dispose();
        service.dispose();
      }
    });
    test("non-streaming: copilot_usage.total_nano_aiu fires onDidReportCredits", async () => {
      const fake = new FakeCopilotApiService();
      const message = makeMessage("claude-opus-4.6", "hi");
      message.copilot_usage = { total_nano_aiu: 25e7 };
      fake.messagesResult = { kind: "message", message };
      const service = createProxyService(fake);
      const reports = [];
      const sub = service.onDidReportCredits((e) => reports.push(e));
      const handle = await service.start(TOKEN);
      try {
        await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.sess-7`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8 })
        });
        assert.deepStrictEqual(reports, [{ sessionId: "sess-7", totalNanoAiu: 25e7 }]);
      } finally {
        sub.dispose();
        handle.dispose();
        service.dispose();
      }
    });
    test("no copilot_usage in the response \u2192 no credits report", async () => {
      const fake = new FakeCopilotApiService();
      fake.messagesResult = { kind: "message", message: makeMessage("claude-opus-4.6", "hi") };
      const service = createProxyService(fake);
      const reports = [];
      const sub = service.onDidReportCredits((e) => reports.push(e));
      const handle = await service.start(TOKEN);
      try {
        await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.sess-9`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8 })
        });
        assert.deepStrictEqual(reports, []);
      } finally {
        sub.dispose();
        handle.dispose();
        service.dispose();
      }
    });
  });
  suite("Body validation", () => {
    test("non-JSON body \u2192 400", async () => {
      const fake = new FakeCopilotApiService();
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: "not-json"
        });
        assert.strictEqual(res.status, 400);
        const env = res.parsed;
        assert.strictEqual(env.error.type, "invalid_request_error");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("missing model field \u2192 400", async () => {
      const fake = new FakeCopilotApiService();
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ messages: [], max_tokens: 8 })
        });
        assert.strictEqual(res.status, 400);
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("missing messages field \u2192 400", async () => {
      const fake = new FakeCopilotApiService();
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", max_tokens: 8 })
        });
        assert.strictEqual(res.status, 400);
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
  });
  suite("Header passthrough", () => {
    async function postAndCaptureHeaders(beta, version) {
      const fake = new FakeCopilotApiService();
      fake.messagesResult = { kind: "message", message: makeMessage("claude-opus-4.6", "hi") };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      const headers = {
        "Authorization": `Bearer ${handle.nonce}.s`,
        "Content-Type": "application/json",
        "x-request-id": "caller-rid-123",
        "x-custom-thing": "should-drop"
      };
      if (beta !== void 0) {
        headers["anthropic-beta"] = beta;
      }
      if (version !== void 0) {
        headers["anthropic-version"] = version;
      }
      try {
        await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers,
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8 })
        });
        return fake.messagesCalls[0].options?.headers;
      } finally {
        handle.dispose();
        service.dispose();
      }
    }
    test("forwards anthropic-version verbatim", async () => {
      const headers = await postAndCaptureHeaders(void 0, "2023-06-01");
      assert.strictEqual(headers?.["anthropic-version"], "2023-06-01");
    });
    test("forwards supported anthropic-beta", async () => {
      const headers = await postAndCaptureHeaders("interleaved-thinking-2025-05-14", void 0);
      assert.strictEqual(headers?.["anthropic-beta"], "interleaved-thinking-2025-05-14");
    });
    test("filters out unsupported betas", async () => {
      const headers = await postAndCaptureHeaders("foo,bar,baz", void 0);
      assert.strictEqual(headers?.["anthropic-beta"], void 0);
    });
    test("drops supported family without date suffix", async () => {
      const headers = await postAndCaptureHeaders("interleaved-thinking", void 0);
      assert.strictEqual(headers?.["anthropic-beta"], void 0);
    });
    test("mixed beta list keeps supported entries only", async () => {
      const headers = await postAndCaptureHeaders("interleaved-thinking-2025-05-14,foo", void 0);
      assert.strictEqual(headers?.["anthropic-beta"], "interleaved-thinking-2025-05-14");
    });
    test("drops x-request-id and arbitrary headers", async () => {
      const headers = await postAndCaptureHeaders("interleaved-thinking-2025-05-14", "2023-06-01") ?? {};
      assert.deepStrictEqual(Object.keys(headers).sort(), ["anthropic-beta", "anthropic-version"]);
    });
  });
  suite("Streaming", () => {
    test("emits SSE frames in order with hand-rolled framing and rewrites message_start.message.model", async () => {
      const fake = new FakeCopilotApiService();
      fake.messagesResult = { kind: "stream", events: makeStreamEvents("claude-opus-4.6") };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchSse(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8, stream: true })
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.headers["content-type"], "text/event-stream");
        const types = res.events.map((e) => e.type);
        assert.deepStrictEqual(types, [
          "message_start",
          "content_block_start",
          "content_block_delta",
          "content_block_stop",
          "message_delta",
          "message_stop"
        ]);
        const start = res.events[0].data;
        assert.strictEqual(start.message.model, "claude-opus-4-6");
        assert.ok(!res.rawBody.includes("[DONE]"));
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("mid-stream CopilotApiError \u2192 SSE error frame, then end, no message_stop after", async () => {
      const fake = new FakeCopilotApiService();
      const events = [
        { type: "message_start", message: makeMessage("claude-opus-4.6", "") },
        { type: "content_block_start", index: 0, content_block: { type: "text", text: "", citations: [] } }
      ];
      const upstreamEnvelope = {
        type: "error",
        error: { type: "rate_limit_error", message: "slow down" },
        request_id: "req_xyz"
      };
      fake.messagesResult = {
        kind: "stream",
        events,
        midStreamError: new CopilotApiError(COPILOT_API_ERROR_STATUS_STREAMING, upstreamEnvelope)
      };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchSse(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8, stream: true })
        });
        assert.strictEqual(res.status, 200);
        const lastEvent = res.events.at(-1);
        assert.ok(lastEvent);
        assert.strictEqual(lastEvent.type, "error");
        assertEnvelopeWithChatErrorMarker(lastEvent.data, upstreamEnvelope, "failed");
        const types = res.events.map((e) => e.type);
        assert.ok(!types.includes("message_stop"), "no message_stop after error frame");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("pre-stream CopilotApiError \u2192 JSON error response with original status", async () => {
      const fake = new FakeCopilotApiService();
      const envelope = {
        type: "error",
        error: { type: "authentication_error", message: "token expired" },
        request_id: "req_pre"
      };
      fake.messagesResult = { kind: "error", error: new CopilotApiError(401, envelope) };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8, stream: true })
        });
        assert.strictEqual(res.status, 401);
        assertEnvelopeWithChatErrorMarker(res.parsed, envelope, "agent_unauthorized");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("pre-stream CopilotApiError with streaming sentinel coerces to 502 but preserves envelope", async () => {
      const fake = new FakeCopilotApiService();
      const envelope = {
        type: "error",
        error: { type: "overloaded_error", message: "capacity full" },
        request_id: "req_sentinel"
      };
      fake.messagesResult = { kind: "error", error: new CopilotApiError(COPILOT_API_ERROR_STATUS_STREAMING, envelope) };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchJson(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8, stream: true })
        });
        assert.strictEqual(res.status, 502);
        assertEnvelopeWithChatErrorMarker(res.parsed, envelope, "failed");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("mid-stream non-CopilotApiError \u2192 synthesized SSE error frame", async () => {
      const fake = new FakeCopilotApiService();
      const events = [
        { type: "message_start", message: makeMessage("claude-opus-4.6", "") }
      ];
      fake.messagesResult = { kind: "stream", events, midStreamError: new Error("socket hang up") };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchSse(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8, stream: true })
        });
        const lastEvent = res.events.at(-1);
        assert.strictEqual(lastEvent?.type, "error");
        const env = lastEvent.data;
        assert.strictEqual(env.error.type, "api_error");
        assert.strictEqual(env.error.message, "socket hang up");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("tool-use input_json_delta events pass through", async () => {
      const fake = new FakeCopilotApiService();
      const events = [
        { type: "message_start", message: makeMessage("claude-opus-4.6", "") },
        { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "do_thing", input: {} } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"a":' } },
        { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "1}" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_stop" }
      ];
      fake.messagesResult = { kind: "stream", events };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchSse(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8, stream: true })
        });
        const deltas = res.events.filter((e) => e.type === "content_block_delta").map((e) => e.data);
        assert.deepStrictEqual(deltas.map((d) => d.delta.type), ["input_json_delta", "input_json_delta"]);
        assert.deepStrictEqual(deltas.map((d) => d.delta.partial_json), ['{"a":', "1}"]);
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("thinking_delta events pass through", async () => {
      const fake = new FakeCopilotApiService();
      const events = [
        { type: "message_start", message: makeMessage("claude-opus-4.6", "") },
        { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
        { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "hmm" } },
        { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: " ok" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_stop" }
      ];
      fake.messagesResult = { kind: "stream", events };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      try {
        const res = await fetchSse(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8, stream: true })
        });
        const deltas = res.events.filter((e) => e.type === "content_block_delta").map((e) => e.data);
        assert.deepStrictEqual(deltas.map((d) => d.delta.type), ["thinking_delta", "thinking_delta"]);
        assert.deepStrictEqual(deltas.map((d) => d.delta.thinking), ["hmm", " ok"]);
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("socket.setNoDelay(true) is called on streaming responses", async () => {
      const fake = new FakeCopilotApiService();
      fake.messagesResult = { kind: "stream", events: makeStreamEvents("claude-opus-4.6") };
      const service = createProxyService(fake);
      const handle = await service.start(TOKEN);
      const original = net.Socket.prototype.setNoDelay;
      const calls = [];
      net.Socket.prototype.setNoDelay = function(enable) {
        calls.push(enable !== false);
        return original.call(this, enable);
      };
      try {
        await fetchSse(`${handle.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${handle.nonce}.s`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8, stream: true })
        });
        assert.ok(calls.some((c) => c === true), "expected setNoDelay(true) to have been called at least once");
      } finally {
        net.Socket.prototype.setNoDelay = original;
        handle.dispose();
        service.dispose();
      }
    });
  });
  suite("Abort", () => {
    test("client disconnect mid-stream propagates AbortSignal upstream and writes nothing else", async () => {
      let signalSeen;
      let resolveAborted;
      const abortObserved = new Promise((resolve) => {
        resolveAborted = resolve;
      });
      const wrapped = {
        _serviceBrand: void 0,
        // Custom stream: yield message_start, then wait until the
        // caller's AbortSignal fires (mimics a real long-running
        // upstream stream waiting for tokens to arrive). The test
        // client disconnects after receiving the first frame, and
        // we assert that the abort propagated.
        messages: ((_token, _body, options) => {
          signalSeen = options?.signal;
          async function* gen() {
            yield { type: "message_start", message: makeMessage("claude-opus-4.6", "") };
            await new Promise((_resolve, reject) => {
              const onAbort = () => {
                resolveAborted();
                const e = new Error("Aborted");
                e.name = "AbortError";
                reject(e);
              };
              if (options?.signal?.aborted) {
                onAbort();
                return;
              }
              options?.signal?.addEventListener("abort", onAbort);
            });
          }
          return gen();
        }),
        countTokens: () => Promise.reject(new Error("not used")),
        models: () => Promise.resolve([]),
        responses: () => Promise.reject(new Error("not used")),
        utilityChatCompletion: () => Promise.reject(new Error("not used")),
        resolveRestrictedTelemetryContext: () => Promise.resolve({ restrictedTelemetryEnabled: false, trackingId: void 0, telemetryEndpoint: void 0 }),
        resolveApiEndpoint: () => Promise.resolve(void 0)
      };
      const service = new ClaudeProxyService(new NullLogService(), wrapped);
      const handle = await service.start(TOKEN);
      try {
        const u = new URL(`${handle.baseUrl}/v1/messages`);
        const httpMod = await getHttp();
        const clientFinished = new Promise((resolve) => {
          const req = httpMod.request({
            hostname: u.hostname,
            port: u.port,
            path: u.pathname,
            method: "POST",
            headers: {
              "Authorization": `Bearer ${handle.nonce}.s`,
              "Content-Type": "application/json"
            }
          }, (res) => {
            let frames = 0;
            res.on("data", () => {
              frames++;
              if (frames >= 1) {
                req.destroy();
                resolve();
              }
            });
            res.on("error", () => resolve());
            res.on("close", () => resolve());
          });
          req.on("error", () => resolve());
          req.write(JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8, stream: true }));
          req.end();
        });
        await clientFinished;
        await Promise.race([
          abortObserved,
          new Promise((_resolve, reject) => setTimeout(() => reject(new Error("upstream did not observe abort within 2s")), 2e3))
        ]);
        assert.ok(signalSeen, "expected upstream signal");
        assert.ok(signalSeen.aborted, "expected abort to fire on client disconnect");
      } finally {
        handle.dispose();
        service.dispose();
      }
    });
    test("dispose() with in-flight non-streaming aborts the upstream call", async () => {
      const fake = new FakeCopilotApiService();
      let signalSeen;
      let releaseUpstream = () => {
      };
      const upstream = new Promise((_resolve, reject) => {
        releaseUpstream = () => reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
      });
      const wrapped = {
        _serviceBrand: void 0,
        messages: ((token, body, options) => {
          signalSeen = options?.signal;
          if (body.stream) {
            return fake.messages(token, body, options);
          }
          options?.signal?.addEventListener("abort", () => releaseUpstream());
          return upstream;
        }),
        countTokens: fake.countTokens.bind(fake),
        models: fake.models.bind(fake),
        responses: fake.responses.bind(fake),
        utilityChatCompletion: fake.utilityChatCompletion.bind(fake),
        resolveRestrictedTelemetryContext: fake.resolveRestrictedTelemetryContext.bind(fake),
        resolveApiEndpoint: fake.resolveApiEndpoint.bind(fake)
      };
      const service = new ClaudeProxyService(new NullLogService(), wrapped);
      const handle = await service.start(TOKEN);
      const inflight = fetchJson(`${handle.baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${handle.nonce}.s`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ model: "claude-opus-4-6", messages: [], max_tokens: 8 })
      }).catch((err) => ({ aborted: true, err }));
      await new Promise((resolve) => {
        const i = setInterval(() => {
          if (signalSeen) {
            clearInterval(i);
            resolve();
          }
        }, 10);
      });
      handle.dispose();
      service.dispose();
      const result = await inflight;
      assert.ok(signalSeen?.aborted, "expected abort to fire on dispose");
      void result;
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjbGF1ZGVQcm94eVNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB0eXBlIEFudGhyb3BpYyBmcm9tICdAYW50aHJvcGljLWFpL3Nkayc7XG5pbXBvcnQgdHlwZSB7IENDQU1vZGVsIH0gZnJvbSAnQHZzY29kZS9jb3BpbG90LWFwaSc7XG5pbXBvcnQgdHlwZSAqIGFzIGh0dHAgZnJvbSAnaHR0cCc7XG5pbXBvcnQgKiBhcyBuZXQgZnJvbSAnbmV0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQge1xuXHRDT1BJTE9UX0FQSV9FUlJPUl9TVEFUVVNfU1RSRUFNSU5HLFxuXHRDb3BpbG90QXBpRXJyb3IsXG5cdHR5cGUgSUNvcGlsb3RBcGlTZXJ2aWNlLFxuXHR0eXBlIElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zLFxufSBmcm9tICcuLi8uLi9ub2RlL3NoYXJlZC9jb3BpbG90QXBpU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQUk9YWV9FUlJPUl9QUkVGSVgsIHRyeVBhcnNlRm9yd2FyZGVkQ2hhdEVycm9yIH0gZnJvbSAnLi4vLi4vbm9kZS9zaGFyZWQvcHJveHlDaGF0RXJyb3IuanMnO1xuaW1wb3J0IHsgQ2xhdWRlUHJveHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9jbGF1ZGUvY2xhdWRlUHJveHlTZXJ2aWNlLmpzJztcblxuLyoqXG4gKiBBc3NlcnRzIGEgYC92MS9tZXNzYWdlc2AgZXJyb3IgZW52ZWxvcGUgd2FzIHJlLWVtaXR0ZWQgd2l0aCBhbGwgZmllbGRzXG4gKiB1bmNoYW5nZWQgZXhjZXB0IGBlcnJvci5tZXNzYWdlYCwgd2hpY2ggY2FycmllcyB0aGUgb3JpZ2luYWwgbWVzc2FnZSBwbHVzIGFuXG4gKiBhcHBlbmRlZCBgVlNDT0RFX1BST1hZX0VSUk9SYCBtYXJrZXIgdGhhdCBkZWNvZGVzIHRvIGEgZm9yd2FyZGVkIGNoYXQgZXJyb3JcbiAqIG9mIHRoZSBleHBlY3RlZCBmZXRjaCB0eXBlLiAoVGhlIGAvdjEvbW9kZWxzYCBwYXRoIHN0YXlzIHZlcmJhdGltLilcbiAqL1xuZnVuY3Rpb24gYXNzZXJ0RW52ZWxvcGVXaXRoQ2hhdEVycm9yTWFya2VyKGFjdHVhbDogQW50aHJvcGljLkVycm9yUmVzcG9uc2UsIG9yaWdpbmFsOiBBbnRocm9waWMuRXJyb3JSZXNwb25zZSwgZXhwZWN0ZWRGZXRjaFR5cGU6IHN0cmluZyk6IHZvaWQge1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnR5cGUsICdlcnJvcicpO1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLnJlcXVlc3RfaWQsIG9yaWdpbmFsLnJlcXVlc3RfaWQpO1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmVycm9yLnR5cGUsIG9yaWdpbmFsLmVycm9yLnR5cGUpO1xuXHRhc3NlcnQub2soYWN0dWFsLmVycm9yLm1lc3NhZ2Uuc3RhcnRzV2l0aChgJHtvcmlnaW5hbC5lcnJvci5tZXNzYWdlfSAke1BST1hZX0VSUk9SX1BSRUZJWH1gKSwgYGV4cGVjdGVkIG1hcmtlci1hcHBlbmRlZCBtZXNzYWdlLCBnb3Q6ICR7YWN0dWFsLmVycm9yLm1lc3NhZ2V9YCk7XG5cdGNvbnN0IGZvcndhcmRlZCA9IHRyeVBhcnNlRm9yd2FyZGVkQ2hhdEVycm9yKGFjdHVhbC5lcnJvci5tZXNzYWdlKTtcblx0YXNzZXJ0Lm9rKGZvcndhcmRlZCwgJ2VtYmVkZGVkIG1hcmtlciBzaG91bGQgZGVjb2RlIHRvIGEgZm9yd2FyZGVkIGNoYXQgZXJyb3InKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcndhcmRlZC5mZXRjaEVycm9yLnR5cGUsIGV4cGVjdGVkRmV0Y2hUeXBlKTtcbn1cblxuLy8gI3JlZ2lvbiBUZXN0IGZha2VzXG5cbmludGVyZmFjZSBJRmFrZUNhbGwge1xuXHRnaXRodWJUb2tlbjogc3RyaW5nO1xuXHRib2R5OiBBbnRocm9waWMuTWVzc2FnZUNyZWF0ZVBhcmFtcztcblx0b3B0aW9uczogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMgfCB1bmRlZmluZWQ7XG59XG5cbmludGVyZmFjZSBJTW9kZWxzQ2FsbCB7XG5cdGdpdGh1YlRva2VuOiBzdHJpbmc7XG5cdG9wdGlvbnM6IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zIHwgdW5kZWZpbmVkO1xufVxuXG50eXBlIE1lc3NhZ2VzUmVzdWx0ID1cblx0fCB7IGtpbmQ6ICdtZXNzYWdlJzsgbWVzc2FnZTogQW50aHJvcGljLk1lc3NhZ2UgfVxuXHR8IHsga2luZDogJ3N0cmVhbSc7IGV2ZW50czogQW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudFtdOyBtaWRTdHJlYW1FcnJvcj86IENvcGlsb3RBcGlFcnJvciB8IEVycm9yIH1cblx0fCB7IGtpbmQ6ICdlcnJvcic7IGVycm9yOiBFcnJvciB9O1xuXG5jbGFzcyBGYWtlQ29waWxvdEFwaVNlcnZpY2UgaW1wbGVtZW50cyBJQ29waWxvdEFwaVNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRhc3luYyByZXNvbHZlUmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQoKSB7IHJldHVybiB7IHJlc3RyaWN0ZWRUZWxlbWV0cnlFbmFibGVkOiBmYWxzZSwgdHJhY2tpbmdJZDogdW5kZWZpbmVkLCB0ZWxlbWV0cnlFbmRwb2ludDogdW5kZWZpbmVkIH07IH1cblx0YXN5bmMgcmVzb2x2ZUFwaUVuZHBvaW50KCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0bWVzc2FnZXNSZXN1bHQ6IE1lc3NhZ2VzUmVzdWx0ID0geyBraW5kOiAnZXJyb3InLCBlcnJvcjogbmV3IEVycm9yKCdub3QgY29uZmlndXJlZCcpIH07XG5cdG1vZGVsc1Jlc3VsdDogeyBraW5kOiAndmFsdWUnOyB2YWx1ZTogQ0NBTW9kZWxbXSB9IHwgeyBraW5kOiAnZXJyb3InOyBlcnJvcjogRXJyb3IgfSA9IHsga2luZDogJ3ZhbHVlJywgdmFsdWU6IFtdIH07XG5cblx0cmVhZG9ubHkgbWVzc2FnZXNDYWxsczogSUZha2VDYWxsW10gPSBbXTtcblx0cmVhZG9ubHkgbW9kZWxzQ2FsbHM6IElNb2RlbHNDYWxsW10gPSBbXTtcblxuXHQvKipcblx0ICogUmVzb2x2ZWQgd2hlbiB0aGUgbmV4dCBzdHJlYW1pbmcgY29uc3VtZXIgcmVhZHMgaXRzIGZpcnN0IGV2ZW50LFxuXHQgKiB1c2VmdWwgZm9yIHRlc3RzIHRoYXQgbmVlZCB0byBhc3NlcnQgb24gbWlkLXN0cmVhbSBiZWhhdmlvci5cblx0ICovXG5cdG9uU3RyZWFtRmlyc3RSZWFkPzogKCkgPT4gdm9pZDtcblxuXHRtZXNzYWdlcyhcblx0XHRnaXRodWJUb2tlbjogc3RyaW5nLFxuXHRcdHJlcXVlc3Q6IEFudGhyb3BpYy5NZXNzYWdlQ3JlYXRlUGFyYW1zU3RyZWFtaW5nLFxuXHRcdG9wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyxcblx0KTogQXN5bmNHZW5lcmF0b3I8QW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudD47XG5cdG1lc3NhZ2VzKFxuXHRcdGdpdGh1YlRva2VuOiBzdHJpbmcsXG5cdFx0cmVxdWVzdDogQW50aHJvcGljLk1lc3NhZ2VDcmVhdGVQYXJhbXNOb25TdHJlYW1pbmcsXG5cdFx0b3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zLFxuXHQpOiBQcm9taXNlPEFudGhyb3BpYy5NZXNzYWdlPjtcblx0bWVzc2FnZXMoXG5cdFx0Z2l0aHViVG9rZW46IHN0cmluZyxcblx0XHRyZXF1ZXN0OiBBbnRocm9waWMuTWVzc2FnZUNyZWF0ZVBhcmFtcyxcblx0XHRvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMsXG5cdCk6IEFzeW5jR2VuZXJhdG9yPEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQ+IHwgUHJvbWlzZTxBbnRocm9waWMuTWVzc2FnZT4ge1xuXHRcdHRoaXMubWVzc2FnZXNDYWxscy5wdXNoKHsgZ2l0aHViVG9rZW4sIGJvZHk6IHJlcXVlc3QsIG9wdGlvbnMgfSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5tZXNzYWdlc1Jlc3VsdDtcblx0XHRpZiAocmVxdWVzdC5zdHJlYW0pIHtcblx0XHRcdHJldHVybiB0aGlzLl9zdHJlYW1HZW4ocmVzdWx0LCBvcHRpb25zKTtcblx0XHR9XG5cdFx0aWYgKHJlc3VsdC5raW5kID09PSAnbWVzc2FnZScpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzdWx0Lm1lc3NhZ2UpO1xuXHRcdH1cblx0XHRpZiAocmVzdWx0LmtpbmQgPT09ICdlcnJvcicpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChyZXN1bHQuZXJyb3IpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKGBzdHJlYW0gcmVzdWx0IGNvbmZpZ3VyZWQgYnV0IG5vbi1zdHJlYW1pbmcgcmVxdWVzdCByZWNlaXZlZGApKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgKl9zdHJlYW1HZW4oXG5cdFx0cmVzdWx0OiBNZXNzYWdlc1Jlc3VsdCxcblx0XHRvcHRpb25zOiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyB8IHVuZGVmaW5lZCxcblx0KTogQXN5bmNHZW5lcmF0b3I8QW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudD4ge1xuXHRcdGlmIChyZXN1bHQua2luZCA9PT0gJ2Vycm9yJykge1xuXHRcdFx0dGhyb3cgcmVzdWx0LmVycm9yO1xuXHRcdH1cblx0XHRpZiAocmVzdWx0LmtpbmQgIT09ICdzdHJlYW0nKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYG5vbi1zdHJlYW0gcmVzdWx0IGNvbmZpZ3VyZWQgYnV0IHN0cmVhbWluZyByZXF1ZXN0IHJlY2VpdmVkYCk7XG5cdFx0fVxuXHRcdGxldCBmaXJzdFJlYWRGaXJlZCA9IGZhbHNlO1xuXHRcdGZvciAoY29uc3QgZXYgb2YgcmVzdWx0LmV2ZW50cykge1xuXHRcdFx0aWYgKG9wdGlvbnM/LnNpZ25hbD8uYWJvcnRlZCkge1xuXHRcdFx0XHRjb25zdCBlID0gbmV3IEVycm9yKCdBYm9ydGVkJyk7XG5cdFx0XHRcdChlIGFzIHsgbmFtZTogc3RyaW5nIH0pLm5hbWUgPSAnQWJvcnRFcnJvcic7XG5cdFx0XHRcdHRocm93IGU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWZpcnN0UmVhZEZpcmVkKSB7XG5cdFx0XHRcdGZpcnN0UmVhZEZpcmVkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5vblN0cmVhbUZpcnN0UmVhZD8uKCk7XG5cdFx0XHR9XG5cdFx0XHR5aWVsZCBldjtcblx0XHR9XG5cdFx0aWYgKHJlc3VsdC5taWRTdHJlYW1FcnJvcikge1xuXHRcdFx0dGhyb3cgcmVzdWx0Lm1pZFN0cmVhbUVycm9yO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNvdW50VG9rZW5zKCk6IFByb21pc2U8QW50aHJvcGljLk1lc3NhZ2VUb2tlbnNDb3VudD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignY291bnRUb2tlbnMgbm90IHN1cHBvcnRlZCcpO1xuXHR9XG5cblx0YXN5bmMgbW9kZWxzKGdpdGh1YlRva2VuOiBzdHJpbmcsIG9wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8Q0NBTW9kZWxbXT4ge1xuXHRcdHRoaXMubW9kZWxzQ2FsbHMucHVzaCh7IGdpdGh1YlRva2VuLCBvcHRpb25zIH0pO1xuXHRcdGlmICh0aGlzLm1vZGVsc1Jlc3VsdC5raW5kID09PSAnZXJyb3InKSB7XG5cdFx0XHR0aHJvdyB0aGlzLm1vZGVsc1Jlc3VsdC5lcnJvcjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubW9kZWxzUmVzdWx0LnZhbHVlO1xuXHR9XG5cblx0YXN5bmMgcmVzcG9uc2VzKCk6IFByb21pc2U8UmVzcG9uc2U+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ3Jlc3BvbnNlcyBub3QgdXNlZCBieSBDbGF1ZGUgcHJveHkgdGVzdHMnKTtcblx0fVxuXG5cdGFzeW5jIHV0aWxpdHlDaGF0Q29tcGxldGlvbigpOiBQcm9taXNlPG5ldmVyPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCd1dGlsaXR5Q2hhdENvbXBsZXRpb24gbm90IHVzZWQgYnkgQ2xhdWRlIHByb3h5IHRlc3RzJyk7XG5cdH1cbn1cblxuLy8gI2VuZHJlZ2lvblxuXG4vLyAjcmVnaW9uIEhUVFAgaGVscGVyc1xuXG5sZXQgX2h0dHBNb2R1bGU6IHR5cGVvZiBodHRwIHwgdW5kZWZpbmVkO1xuYXN5bmMgZnVuY3Rpb24gZ2V0SHR0cCgpOiBQcm9taXNlPHR5cGVvZiBodHRwPiB7XG5cdGlmICghX2h0dHBNb2R1bGUpIHtcblx0XHRfaHR0cE1vZHVsZSA9IGF3YWl0IGltcG9ydCgnaHR0cCcpO1xuXHR9XG5cdHJldHVybiBfaHR0cE1vZHVsZTtcbn1cblxuaW50ZXJmYWNlIElGZXRjaGVkSnNvbiB7XG5cdHN0YXR1czogbnVtYmVyO1xuXHRoZWFkZXJzOiBodHRwLkluY29taW5nSHR0cEhlYWRlcnM7XG5cdGJvZHk6IHN0cmluZztcblx0cGFyc2VkOiB1bmtub3duO1xufVxuXG5mdW5jdGlvbiBmZXRjaEpzb24odXJsOiBzdHJpbmcsIGluaXQ/OiB7IG1ldGhvZD86IHN0cmluZzsgaGVhZGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47IGJvZHk/OiBzdHJpbmcgfSk6IFByb21pc2U8SUZldGNoZWRKc29uPiB7XG5cdHJldHVybiBnZXRIdHRwKCkudGhlbihodHRwTW9kID0+IG5ldyBQcm9taXNlPElGZXRjaGVkSnNvbj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGNvbnN0IHUgPSBuZXcgVVJMKHVybCk7XG5cdFx0Y29uc3QgcmVxID0gaHR0cE1vZC5yZXF1ZXN0KHtcblx0XHRcdGhvc3RuYW1lOiB1Lmhvc3RuYW1lLFxuXHRcdFx0cG9ydDogdS5wb3J0LFxuXHRcdFx0cGF0aDogdS5wYXRobmFtZSArIHUuc2VhcmNoLFxuXHRcdFx0bWV0aG9kOiBpbml0Py5tZXRob2QgPz8gJ0dFVCcsXG5cdFx0XHRoZWFkZXJzOiBpbml0Py5oZWFkZXJzLFxuXHRcdH0sIHJlcyA9PiB7XG5cdFx0XHRjb25zdCBjaHVua3M6IEJ1ZmZlcltdID0gW107XG5cdFx0XHRyZXMub24oJ2RhdGEnLCBjID0+IGNodW5rcy5wdXNoKEJ1ZmZlci5pc0J1ZmZlcihjKSA/IGMgOiBCdWZmZXIuZnJvbShjKSkpO1xuXHRcdFx0cmVzLm9uKCdlbmQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGJvZHkgPSBCdWZmZXIuY29uY2F0KGNodW5rcykudG9TdHJpbmcoJ3V0ZjgnKTtcblx0XHRcdFx0bGV0IHBhcnNlZDogdW5rbm93bjtcblx0XHRcdFx0dHJ5IHsgcGFyc2VkID0gYm9keSA/IEpTT04ucGFyc2UoYm9keSkgOiB1bmRlZmluZWQ7IH0gY2F0Y2ggeyBwYXJzZWQgPSB1bmRlZmluZWQ7IH1cblx0XHRcdFx0cmVzb2x2ZSh7IHN0YXR1czogcmVzLnN0YXR1c0NvZGUgPz8gMCwgaGVhZGVyczogcmVzLmhlYWRlcnMsIGJvZHksIHBhcnNlZCB9KTtcblx0XHRcdH0pO1xuXHRcdFx0cmVzLm9uKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0fSk7XG5cdFx0cmVxLm9uKCdlcnJvcicsIHJlamVjdCk7XG5cdFx0aWYgKGluaXQ/LmJvZHkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmVxLndyaXRlKGluaXQuYm9keSk7XG5cdFx0fVxuXHRcdHJlcS5lbmQoKTtcblx0fSkpO1xufVxuXG5pbnRlcmZhY2UgSVNzZVJlc3VsdCB7XG5cdHN0YXR1czogbnVtYmVyO1xuXHRoZWFkZXJzOiBodHRwLkluY29taW5nSHR0cEhlYWRlcnM7XG5cdHJhd0JvZHk6IHN0cmluZztcblx0ZXZlbnRzOiB7IHR5cGU6IHN0cmluZzsgZGF0YTogdW5rbm93biB9W107XG59XG5cbmZ1bmN0aW9uIGZldGNoU3NlKFxuXHR1cmw6IHN0cmluZyxcblx0aW5pdDogeyBtZXRob2Q6IHN0cmluZzsgaGVhZGVycz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47IGJvZHk/OiBzdHJpbmcgfSxcblx0b25SZXNwb25zZT86IChyZXM6IGh0dHAuSW5jb21pbmdNZXNzYWdlLCBhYm9ydDogKCkgPT4gdm9pZCkgPT4gdm9pZCxcbik6IFByb21pc2U8SVNzZVJlc3VsdD4ge1xuXHRyZXR1cm4gZ2V0SHR0cCgpLnRoZW4oaHR0cE1vZCA9PiBuZXcgUHJvbWlzZTxJU3NlUmVzdWx0PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29uc3QgdSA9IG5ldyBVUkwodXJsKTtcblx0XHRjb25zdCByZXEgPSBodHRwTW9kLnJlcXVlc3Qoe1xuXHRcdFx0aG9zdG5hbWU6IHUuaG9zdG5hbWUsXG5cdFx0XHRwb3J0OiB1LnBvcnQsXG5cdFx0XHRwYXRoOiB1LnBhdGhuYW1lICsgdS5zZWFyY2gsXG5cdFx0XHRtZXRob2Q6IGluaXQubWV0aG9kLFxuXHRcdFx0aGVhZGVyczogaW5pdC5oZWFkZXJzLFxuXHRcdH0sIHJlcyA9PiB7XG5cdFx0XHRjb25zdCBjaHVua3M6IEJ1ZmZlcltdID0gW107XG5cdFx0XHRyZXMub24oJ2RhdGEnLCBjID0+IGNodW5rcy5wdXNoKEJ1ZmZlci5pc0J1ZmZlcihjKSA/IGMgOiBCdWZmZXIuZnJvbShjKSkpO1xuXHRcdFx0cmVzLm9uKCdlbmQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJhd0JvZHkgPSBCdWZmZXIuY29uY2F0KGNodW5rcykudG9TdHJpbmcoJ3V0ZjgnKTtcblx0XHRcdFx0cmVzb2x2ZSh7XG5cdFx0XHRcdFx0c3RhdHVzOiByZXMuc3RhdHVzQ29kZSA/PyAwLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHJlcy5oZWFkZXJzLFxuXHRcdFx0XHRcdHJhd0JvZHksXG5cdFx0XHRcdFx0ZXZlbnRzOiBwYXJzZVNzZUZyYW1lcyhyYXdCb2R5KSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHRcdHJlcy5vbignZXJyb3InLCByZWplY3QpO1xuXHRcdFx0b25SZXNwb25zZT8uKHJlcywgKCkgPT4gcmVxLmRlc3Ryb3koKSk7XG5cdFx0fSk7XG5cdFx0cmVxLm9uKCdlcnJvcicsIGVyciA9PiB7XG5cdFx0XHQvLyBBYm9ydGVkIHJlcXVlc3RzIHJlamVjdCBuYXR1cmFsbHkgXHUyMDE0IHN1cmZhY2UgYXMgcmVzb2x1dGlvblxuXHRcdFx0Ly8gd2l0aCB3aGF0ZXZlciB3ZSBnb3QgcmF0aGVyIHRoYW4gZmFpbGluZyB0aGUgdGVzdC5cblx0XHRcdHJlamVjdChlcnIpO1xuXHRcdH0pO1xuXHRcdGlmIChpbml0LmJvZHkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmVxLndyaXRlKGluaXQuYm9keSk7XG5cdFx0fVxuXHRcdHJlcS5lbmQoKTtcblx0fSkpO1xufVxuXG5mdW5jdGlvbiBwYXJzZVNzZUZyYW1lcyhyYXc6IHN0cmluZyk6IHsgdHlwZTogc3RyaW5nOyBkYXRhOiB1bmtub3duIH1bXSB7XG5cdGNvbnN0IG91dDogeyB0eXBlOiBzdHJpbmc7IGRhdGE6IHVua25vd24gfVtdID0gW107XG5cdGNvbnN0IGJsb2NrcyA9IHJhdy5zcGxpdCgnXFxuXFxuJyk7XG5cdGZvciAoY29uc3QgYmxvY2sgb2YgYmxvY2tzKSB7XG5cdFx0aWYgKCFibG9jay50cmltKCkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRsZXQgZXZlbnQgPSAnJztcblx0XHRsZXQgZGF0YSA9ICcnO1xuXHRcdGZvciAoY29uc3QgbGluZSBvZiBibG9jay5zcGxpdCgnXFxuJykpIHtcblx0XHRcdGlmIChsaW5lLnN0YXJ0c1dpdGgoJ2V2ZW50OiAnKSkge1xuXHRcdFx0XHRldmVudCA9IGxpbmUuc2xpY2UoJ2V2ZW50OiAnLmxlbmd0aCkudHJpbSgpO1xuXHRcdFx0fSBlbHNlIGlmIChsaW5lLnN0YXJ0c1dpdGgoJ2RhdGE6ICcpKSB7XG5cdFx0XHRcdGRhdGEgPSBsaW5lLnNsaWNlKCdkYXRhOiAnLmxlbmd0aCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChldmVudCAmJiBkYXRhKSB7XG5cdFx0XHRsZXQgcGFyc2VkOiB1bmtub3duO1xuXHRcdFx0dHJ5IHsgcGFyc2VkID0gSlNPTi5wYXJzZShkYXRhKTsgfSBjYXRjaCB7IHBhcnNlZCA9IGRhdGE7IH1cblx0XHRcdG91dC5wdXNoKHsgdHlwZTogZXZlbnQsIGRhdGE6IHBhcnNlZCB9KTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIG91dDtcbn1cblxuLy8gI2VuZHJlZ2lvblxuXG4vLyAjcmVnaW9uIEZpeHR1cmVzXG5cbmNvbnN0IEFOVEhST1BJQ19NT0RFTDogQ0NBTW9kZWwgPSB7XG5cdGlkOiAnY2xhdWRlLW9wdXMtNC42Jyxcblx0bmFtZTogJ0NsYXVkZSBPcHVzIDQuNicsXG5cdHZlbmRvcjogJ0FudGhyb3BpYycsXG5cdHN1cHBvcnRlZF9lbmRwb2ludHM6IFsnL3YxL21lc3NhZ2VzJ10sXG5cdG9iamVjdDogJ21vZGVsJyxcblx0dmVyc2lvbjogJzQuNicsXG5cdGlzX2NoYXRfZGVmYXVsdDogZmFsc2UsXG5cdGlzX2NoYXRfZmFsbGJhY2s6IGZhbHNlLFxuXHRtb2RlbF9waWNrZXJfY2F0ZWdvcnk6ICcnLFxuXHRtb2RlbF9waWNrZXJfZW5hYmxlZDogdHJ1ZSxcblx0cHJldmlldzogZmFsc2UsXG5cdGJpbGxpbmc6IHsgaXNfcHJlbWl1bTogZmFsc2UgfSBhcyB1bmtub3duIGFzIENDQU1vZGVsWydiaWxsaW5nJ10sXG5cdGNhcGFiaWxpdGllczoge30gYXMgQ0NBTW9kZWxbJ2NhcGFiaWxpdGllcyddLFxuXHRwb2xpY3k6IHt9IGFzIENDQU1vZGVsWydwb2xpY3knXSxcbn07XG5cbmNvbnN0IE5PTl9BTlRIUk9QSUNfTU9ERUw6IENDQU1vZGVsID0ge1xuXHQuLi5BTlRIUk9QSUNfTU9ERUwsXG5cdGlkOiAnZ3B0LTUnLFxuXHRuYW1lOiAnR1BULTUnLFxuXHR2ZW5kb3I6ICdPcGVuQUknLFxuXHRzdXBwb3J0ZWRfZW5kcG9pbnRzOiBbJy92MS9jaGF0L2NvbXBsZXRpb25zJ10sXG59O1xuXG5jb25zdCBOT05fTUVTU0FHRVNfQU5USFJPUElDOiBDQ0FNb2RlbCA9IHtcblx0Li4uQU5USFJPUElDX01PREVMLFxuXHRpZDogJ2NsYXVkZS1pbnN0YW50LXRva2VuaXplcicsXG5cdG5hbWU6ICdBbnRocm9waWMgVG9rZW5pemVyJyxcblx0c3VwcG9ydGVkX2VuZHBvaW50czogWycvdjEvdG9rZW5pemUnXSxcbn07XG5cbmZ1bmN0aW9uIG1ha2VNZXNzYWdlKG1vZGVsOiBzdHJpbmcsIHRleHQ6IHN0cmluZyk6IEFudGhyb3BpYy5NZXNzYWdlIHtcblx0cmV0dXJuIHtcblx0XHRpZDogJ21zZ190ZXN0Jyxcblx0XHR0eXBlOiAnbWVzc2FnZScsXG5cdFx0cm9sZTogJ2Fzc2lzdGFudCcsXG5cdFx0bW9kZWwsXG5cdFx0Y29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0LCBjaXRhdGlvbnM6IG51bGwgfV0sXG5cdFx0c3RvcF9yZWFzb246ICdlbmRfdHVybicsXG5cdFx0c3RvcF9zZXF1ZW5jZTogbnVsbCxcblx0XHR1c2FnZToge1xuXHRcdFx0aW5wdXRfdG9rZW5zOiAxLFxuXHRcdFx0b3V0cHV0X3Rva2VuczogMSxcblx0XHRcdGNhY2hlX2NyZWF0aW9uX2lucHV0X3Rva2VuczogbnVsbCxcblx0XHRcdGNhY2hlX3JlYWRfaW5wdXRfdG9rZW5zOiBudWxsLFxuXHRcdFx0c2VydmVyX3Rvb2xfdXNlOiBudWxsLFxuXHRcdFx0c2VydmljZV90aWVyOiBudWxsLFxuXHRcdH0sXG5cdH0gYXMgQW50aHJvcGljLk1lc3NhZ2U7XG59XG5cbmZ1bmN0aW9uIG1ha2VTdHJlYW1FdmVudHMobW9kZWw6IHN0cmluZyk6IEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnRbXSB7XG5cdGNvbnN0IG1lc3NhZ2UgPSBtYWtlTWVzc2FnZShtb2RlbCwgJycpO1xuXHRyZXR1cm4gW1xuXHRcdHsgdHlwZTogJ21lc3NhZ2Vfc3RhcnQnLCBtZXNzYWdlIH0sXG5cdFx0eyB0eXBlOiAnY29udGVudF9ibG9ja19zdGFydCcsIGluZGV4OiAwLCBjb250ZW50X2Jsb2NrOiB7IHR5cGU6ICd0ZXh0JywgdGV4dDogJycsIGNpdGF0aW9uczogW10gfSB9IGFzIEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQsXG5cdFx0eyB0eXBlOiAnY29udGVudF9ibG9ja19kZWx0YScsIGluZGV4OiAwLCBkZWx0YTogeyB0eXBlOiAndGV4dF9kZWx0YScsIHRleHQ6ICdoZWxsbycgfSB9IGFzIEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQsXG5cdFx0eyB0eXBlOiAnY29udGVudF9ibG9ja19zdG9wJywgaW5kZXg6IDAgfSxcblx0XHR7IHR5cGU6ICdtZXNzYWdlX2RlbHRhJywgZGVsdGE6IHsgc3RvcF9yZWFzb246ICdlbmRfdHVybicsIHN0b3Bfc2VxdWVuY2U6IG51bGwgfSwgdXNhZ2U6IHsgaW5wdXRfdG9rZW5zOiAxLCBvdXRwdXRfdG9rZW5zOiAxLCBjYWNoZV9jcmVhdGlvbl9pbnB1dF90b2tlbnM6IG51bGwsIGNhY2hlX3JlYWRfaW5wdXRfdG9rZW5zOiBudWxsLCBzZXJ2ZXJfdG9vbF91c2U6IG51bGwgfSBhcyBBbnRocm9waWMuTWVzc2FnZURlbHRhVXNhZ2UgfSBhcyBBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50LFxuXHRcdHsgdHlwZTogJ21lc3NhZ2Vfc3RvcCcgfSxcblx0XTtcbn1cblxuLy8gI2VuZHJlZ2lvblxuXG4vLyAjcmVnaW9uIFNlcnZpY2UgYnVpbGRlclxuXG5mdW5jdGlvbiBjcmVhdGVQcm94eVNlcnZpY2UoZmFrZUFwaTogRmFrZUNvcGlsb3RBcGlTZXJ2aWNlKTogQ2xhdWRlUHJveHlTZXJ2aWNlIHtcblx0cmV0dXJuIG5ldyBDbGF1ZGVQcm94eVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGZha2VBcGkpO1xufVxuXG5jb25zdCBUT0tFTiA9ICdnaC10ZXN0LXRva2VuJztcblxuLy8gI2VuZHJlZ2lvblxuXG5zdWl0ZSgnQ2xhdWRlUHJveHlTZXJ2aWNlJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vICNyZWdpb24gVG9rZW4gc2xvdFxuXG5cdHN1aXRlKCdUb2tlbiBzbG90JywgKCkgPT4ge1xuXG5cdFx0Ly8gQmFzZSBsaWZlY3ljbGUvYmluZCBiZWhhdmlvciAobm9uY2UgKyBsb29wYmFjayBiaW5kLCByZWZjb3VudGVkXG5cdFx0Ly8gaGFuZGxlcywgZGlzcG9zZS9yZWJpbmQsIGRpc3Bvc2UtZHVyaW5nLWJpbmQpIGlzIGNvdmVyZWQgYnlcblx0XHQvLyBsb29wYmFja1Byb3h5U2VydmVyLnRlc3QudHMuIFRoaXMgc3VpdGUgb25seSBjb3ZlcnMgQ2xhdWRlJ3Ncblx0XHQvLyBgc3RhcnQoKWAgb3ZlcnJpZGUgdGhhdCB3aXJlcyB0aGUgR2l0SHViIHRva2VuIGludG8gb3V0Ym91bmQgY2FsbHMuXG5cdFx0dGVzdCgnc3RhcnQoKSB1cGRhdGVzIHRva2VuIHNsb3QgbGFzdC13cml0ZXItd2lucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZha2UgPSBuZXcgRmFrZUNvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0XHRmYWtlLm1vZGVsc1Jlc3VsdCA9IHsga2luZDogJ3ZhbHVlJywgdmFsdWU6IFtdIH07XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlUHJveHlTZXJ2aWNlKGZha2UpO1xuXHRcdFx0Y29uc3QgaDEgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0KCd0b2tlbi1BJyk7XG5cdFx0XHRjb25zdCBoMiA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoJ3Rva2VuLUInKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGZldGNoSnNvbihgJHtoMi5iYXNlVXJsfS92MS9tb2RlbHNgLCB7XG5cdFx0XHRcdFx0aGVhZGVyczogeyAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtoMi5ub25jZX0uczFgIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFrZS5tb2RlbHNDYWxscy5hdCgtMSk/LmdpdGh1YlRva2VuLCAndG9rZW4tQicpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aDEuZGlzcG9zZSgpO1xuXHRcdFx0XHRoMi5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gQXV0aFxuXG5cdHN1aXRlKCdBdXRoJywgKCkgPT4ge1xuXG5cdFx0YXN5bmMgZnVuY3Rpb24gd2l0aFByb3h5PFQ+KGZuOiAoaGFuZGxlOiB7IGJhc2VVcmw6IHN0cmluZzsgbm9uY2U6IHN0cmluZyB9LCBmYWtlOiBGYWtlQ29waWxvdEFwaVNlcnZpY2UpID0+IFByb21pc2U8VD4pOiBQcm9taXNlPFQ+IHtcblx0XHRcdGNvbnN0IGZha2UgPSBuZXcgRmFrZUNvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0XHRmYWtlLm1vZGVsc1Jlc3VsdCA9IHsga2luZDogJ3ZhbHVlJywgdmFsdWU6IFtBTlRIUk9QSUNfTU9ERUxdIH07XG5cdFx0XHRmYWtlLm1lc3NhZ2VzUmVzdWx0ID0geyBraW5kOiAnbWVzc2FnZScsIG1lc3NhZ2U6IG1ha2VNZXNzYWdlKCdjbGF1ZGUtb3B1cy00LjYnLCAnaGknKSB9O1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVByb3h5U2VydmljZShmYWtlKTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoVE9LRU4pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IGZuKGhhbmRsZSwgZmFrZSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0ZXN0KCdtaXNzaW5nIEF1dGhvcml6YXRpb24gaGVhZGVyIFx1MjE5MiA0MDEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3aXRoUHJveHkoYXN5bmMgaGFuZGxlID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2hKc29uKGAke2hhbmRsZS5iYXNlVXJsfS92MS9tb2RlbHNgKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDQwMSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzLnBhcnNlZCwge1xuXHRcdFx0XHRcdHR5cGU6ICdlcnJvcicsXG5cdFx0XHRcdFx0ZXJyb3I6IHsgdHlwZTogJ2F1dGhlbnRpY2F0aW9uX2Vycm9yJywgbWVzc2FnZTogJ0ludmFsaWQgYXV0aGVudGljYXRpb24nIH0sXG5cdFx0XHRcdFx0cmVxdWVzdF9pZDogbnVsbCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0JlYXJlciB3cm9uZy1ub25jZS54IFx1MjE5MiA0MDEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3aXRoUHJveHkoYXN5bmMgaGFuZGxlID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2hKc29uKGAke2hhbmRsZS5iYXNlVXJsfS92MS9tb2RlbHNgLCB7XG5cdFx0XHRcdFx0aGVhZGVyczogeyAnQXV0aG9yaXphdGlvbic6ICdCZWFyZXIgd3Jvbmctbm9uY2Uuc2Vzc2lvbicgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc3RhdHVzLCA0MDEpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdCZWFyZXIgPG5vbmNlPiAobm8gZG90KSBcdTIxOTIgNDAxJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd2l0aFByb3h5KGFzeW5jIGhhbmRsZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoSnNvbihgJHtoYW5kbGUuYmFzZVVybH0vdjEvbW9kZWxzYCwge1xuXHRcdFx0XHRcdGhlYWRlcnM6IHsgJ0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfWAgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc3RhdHVzLCA0MDEpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdCZWFyZXIgPG5vbmNlPi4gKGVtcHR5IHNlc3Npb25JZCkgXHUyMTkyIDQwMScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdpdGhQcm94eShhc3luYyBoYW5kbGUgPT4ge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaEpzb24oYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21vZGVsc2AsIHtcblx0XHRcdFx0XHRoZWFkZXJzOiB7ICdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2hhbmRsZS5ub25jZX0uYCB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDQwMSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3gtYXBpLWtleSBhbG9uZSBcdTIxOTIgNDAxJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd2l0aFByb3h5KGFzeW5jIGhhbmRsZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoSnNvbihgJHtoYW5kbGUuYmFzZVVybH0vdjEvbW9kZWxzYCwge1xuXHRcdFx0XHRcdGhlYWRlcnM6IHsgJ3gtYXBpLWtleSc6IGhhbmRsZS5ub25jZSB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDQwMSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0JlYXJlciA8bm9uY2U+LjxzZXNzaW9uSWQ+IFx1MjE5MiByZXF1ZXN0IHByb2NlZWRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd2l0aFByb3h5KGFzeW5jIChoYW5kbGUsIGZha2UpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2hKc29uKGAke2hhbmRsZS5iYXNlVXJsfS92MS9tb2RlbHNgLCB7XG5cdFx0XHRcdFx0aGVhZGVyczogeyAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtoYW5kbGUubm9uY2V9LnNlc3Npb24tYWJjYCB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDIwMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYWtlLm1vZGVsc0NhbGxzLmxlbmd0aCwgMSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2F1dGgtZmlyc3QgcHJlY2VkZW5jZTogR0VUIC92MS9tb2RlbHMgd2l0aCBiYWQgYXV0aCBkb2VzIG5vdCByZWFjaCB1cHN0cmVhbScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHdpdGhQcm94eShhc3luYyAoaGFuZGxlLCBmYWtlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoSnNvbihgJHtoYW5kbGUuYmFzZVVybH0vdjEvbW9kZWxzYCwge1xuXHRcdFx0XHRcdGhlYWRlcnM6IHsgJ0F1dGhvcml6YXRpb24nOiAnQmVhcmVyIHdyb25nLnMnIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1cywgNDAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZha2UubW9kZWxzQ2FsbHMubGVuZ3RoLCAwKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXV0aC1maXJzdCBwcmVjZWRlbmNlOiBQT1NUIC92MS9tZXNzYWdlcyB3aXRoIGJhZCBhdXRoIGRvZXMgbm90IHJlYWNoIHVwc3RyZWFtJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgd2l0aFByb3h5KGFzeW5jIChoYW5kbGUsIGZha2UpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2hKc29uKGAke2hhbmRsZS5iYXNlVXJsfS92MS9tZXNzYWdlc2AsIHtcblx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0XHQnQXV0aG9yaXphdGlvbic6ICdCZWFyZXIgd3JvbmcucycsXG5cdFx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ2NsYXVkZS1vcHVzLTQtNicsIG1lc3NhZ2VzOiBbXSwgbWF4X3Rva2VuczogOCB9KSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc3RhdHVzLCA0MDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFrZS5tZXNzYWdlc0NhbGxzLmxlbmd0aCwgMCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2F1dGgtZmlyc3QgcHJlY2VkZW5jZTogUE9TVCAvdjEvbWVzc2FnZXMvY291bnRfdG9rZW5zIHdpdGggYmFkIGF1dGggXHUyMTkyIDQwMSAobm90IDUwMSknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCB3aXRoUHJveHkoYXN5bmMgaGFuZGxlID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2hKc29uKGAke2hhbmRsZS5iYXNlVXJsfS92MS9tZXNzYWdlcy9jb3VudF90b2tlbnNgLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczogeyAnQXV0aG9yaXphdGlvbic6ICdCZWFyZXIgd3JvbmcucycgfSxcblx0XHRcdFx0XHRib2R5OiAne30nLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDQwMSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gUm91dGVzXG5cblx0c3VpdGUoJ1JvdXRlcycsICgpID0+IHtcblxuXHRcdHRlc3QoJ0dFVCAvIFx1MjE5MiAyMDAgb2ssIG5vIGF1dGggcmVxdWlyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWtlID0gbmV3IEZha2VDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVByb3h5U2VydmljZShmYWtlKTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoVE9LRU4pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2hKc29uKGAke2hhbmRsZS5iYXNlVXJsfS9gKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDIwMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuYm9keSwgJ29rJyk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ1BPU1QgL3YxL21lc3NhZ2VzL2NvdW50X3Rva2VucyBcdTIxOTIgNTAxIGFwaV9lcnJvcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZha2UgPSBuZXcgRmFrZUNvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlUHJveHlTZXJ2aWNlKGZha2UpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydChUT0tFTik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaEpzb24oYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21lc3NhZ2VzL2NvdW50X3Rva2Vuc2AsIHtcblx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRoZWFkZXJzOiB7ICdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2hhbmRsZS5ub25jZX0uc2AgfSxcblx0XHRcdFx0XHRib2R5OiAne30nLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDUwMSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzLnBhcnNlZCwge1xuXHRcdFx0XHRcdHR5cGU6ICdlcnJvcicsXG5cdFx0XHRcdFx0ZXJyb3I6IHsgdHlwZTogJ2FwaV9lcnJvcicsIG1lc3NhZ2U6ICdjb3VudF90b2tlbnMgbm90IHN1cHBvcnRlZCBieSBDQVBJJyB9LFxuXHRcdFx0XHRcdHJlcXVlc3RfaWQ6IG51bGwsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdHRVQgL3NvbWV0aGluZy1lbHNlIFx1MjE5MiA0MDQgbm90X2ZvdW5kX2Vycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IG5ldyBGYWtlQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVQcm94eVNlcnZpY2UoZmFrZSk7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0KFRPS0VOKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoSnNvbihgJHtoYW5kbGUuYmFzZVVybH0vdjIvd2hhdGV2ZXJgLCB7XG5cdFx0XHRcdFx0aGVhZGVyczogeyAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtoYW5kbGUubm9uY2V9LnNgIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1cywgNDA0KTtcblx0XHRcdFx0Y29uc3QgZW52ID0gcmVzLnBhcnNlZCBhcyBBbnRocm9waWMuRXJyb3JSZXNwb25zZTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudi50eXBlLCAnZXJyb3InKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudi5lcnJvci50eXBlLCAnbm90X2ZvdW5kX2Vycm9yJyk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gTW9kZWxzIHJvdXRlXG5cblx0c3VpdGUoJ0dFVCAvdjEvbW9kZWxzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmV0dXJucyBQYWdlIGVudmVsb3BlIHdpdGggU0RLLWZvcm1hdCBJRHMgYW5kIGZpbHRlcnMgYnkgdmVuZG9yICsgZW5kcG9pbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWtlID0gbmV3IEZha2VDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdFx0ZmFrZS5tb2RlbHNSZXN1bHQgPSB7IGtpbmQ6ICd2YWx1ZScsIHZhbHVlOiBbQU5USFJPUElDX01PREVMLCBOT05fQU5USFJPUElDX01PREVMLCBOT05fTUVTU0FHRVNfQU5USFJPUElDXSB9O1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVByb3h5U2VydmljZShmYWtlKTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoVE9LRU4pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2hKc29uKGAke2hhbmRsZS5iYXNlVXJsfS92MS9tb2RlbHNgLCB7XG5cdFx0XHRcdFx0aGVhZGVyczogeyAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtoYW5kbGUubm9uY2V9LnNgIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1cywgMjAwKTtcblx0XHRcdFx0Y29uc3QgYm9keSA9IHJlcy5wYXJzZWQgYXMgeyBkYXRhOiBBbnRocm9waWMuTW9kZWxJbmZvW107IGhhc19tb3JlOiBib29sZWFuOyBmaXJzdF9pZDogc3RyaW5nIHwgbnVsbDsgbGFzdF9pZDogc3RyaW5nIHwgbnVsbCB9O1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJvZHksIHtcblx0XHRcdFx0XHRkYXRhOiBbe1xuXHRcdFx0XHRcdFx0aWQ6ICdjbGF1ZGUtb3B1cy00LTYnLFxuXHRcdFx0XHRcdFx0dHlwZTogJ21vZGVsJyxcblx0XHRcdFx0XHRcdGRpc3BsYXlfbmFtZTogJ0NsYXVkZSBPcHVzIDQuNicsXG5cdFx0XHRcdFx0XHRjcmVhdGVkX2F0OiAnMTk3MC0wMS0wMVQwMDowMDowMFonLFxuXHRcdFx0XHRcdFx0Y2FwYWJpbGl0aWVzOiBudWxsLFxuXHRcdFx0XHRcdFx0bWF4X2lucHV0X3Rva2VuczogbnVsbCxcblx0XHRcdFx0XHRcdG1heF90b2tlbnM6IG51bGwsXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0aGFzX21vcmU6IGZhbHNlLFxuXHRcdFx0XHRcdGZpcnN0X2lkOiAnY2xhdWRlLW9wdXMtNC02Jyxcblx0XHRcdFx0XHRsYXN0X2lkOiAnY2xhdWRlLW9wdXMtNC02Jyxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Vwc3RyZWFtIENvcGlsb3RBcGlFcnJvciBpcyByZS1lbWl0dGVkIHZlcmJhdGltIHdpdGggb3JpZ2luYWwgc3RhdHVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IG5ldyBGYWtlQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IGVudmVsb3BlOiBBbnRocm9waWMuRXJyb3JSZXNwb25zZSA9IHtcblx0XHRcdFx0dHlwZTogJ2Vycm9yJyxcblx0XHRcdFx0ZXJyb3I6IHsgdHlwZTogJ3JhdGVfbGltaXRfZXJyb3InLCBtZXNzYWdlOiAnc2xvdyBkb3duJyB9LFxuXHRcdFx0XHRyZXF1ZXN0X2lkOiAncmVxXzEyMycsXG5cdFx0XHR9O1xuXHRcdFx0ZmFrZS5tb2RlbHNSZXN1bHQgPSB7IGtpbmQ6ICdlcnJvcicsIGVycm9yOiBuZXcgQ29waWxvdEFwaUVycm9yKDQyOSwgZW52ZWxvcGUpIH07XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlUHJveHlTZXJ2aWNlKGZha2UpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydChUT0tFTik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaEpzb24oYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21vZGVsc2AsIHtcblx0XHRcdFx0XHRoZWFkZXJzOiB7ICdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2hhbmRsZS5ub25jZX0uc2AgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc3RhdHVzLCA0MjkpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlcy5wYXJzZWQsIGVudmVsb3BlKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm9uLUNvcGlsb3RBcGlFcnJvciBcdTIxOTIgNTAyIGFwaV9lcnJvcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZha2UgPSBuZXcgRmFrZUNvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0XHRmYWtlLm1vZGVsc1Jlc3VsdCA9IHsga2luZDogJ2Vycm9yJywgZXJyb3I6IG5ldyBFcnJvcignRUNPTk5SRVNFVCcpIH07XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlUHJveHlTZXJ2aWNlKGZha2UpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydChUT0tFTik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaEpzb24oYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21vZGVsc2AsIHtcblx0XHRcdFx0XHRoZWFkZXJzOiB7ICdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2hhbmRsZS5ub25jZX0uc2AgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc3RhdHVzLCA1MDIpO1xuXHRcdFx0XHRjb25zdCBlbnYgPSByZXMucGFyc2VkIGFzIEFudGhyb3BpYy5FcnJvclJlc3BvbnNlO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52LmVycm9yLnR5cGUsICdhcGlfZXJyb3InKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudi5lcnJvci5tZXNzYWdlLCAnRUNPTk5SRVNFVCcpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIE1lc3NhZ2VzIFx1MjAxNCBtb2RlbCB0cmFuc2xhdGlvblxuXG5cdHN1aXRlKCdQT1NUIC92MS9tZXNzYWdlcyBtb2RlbCB0cmFuc2xhdGlvbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ1NESyBJRCBpbmJvdW5kIGlzIHRyYW5zbGF0ZWQgdG8gZW5kcG9pbnQgSUQgdXBzdHJlYW0nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWtlID0gbmV3IEZha2VDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdFx0ZmFrZS5tZXNzYWdlc1Jlc3VsdCA9IHsga2luZDogJ21lc3NhZ2UnLCBtZXNzYWdlOiBtYWtlTWVzc2FnZSgnY2xhdWRlLW9wdXMtNC42JywgJ2hpJykgfTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVQcm94eVNlcnZpY2UoZmFrZSk7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0KFRPS0VOKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGZldGNoSnNvbihgJHtoYW5kbGUuYmFzZVVybH0vdjEvbWVzc2FnZXNgLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfS5zYCxcblx0XHRcdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnY2xhdWRlLW9wdXMtNC02LTIwMjUxMTAxJywgbWVzc2FnZXM6IFtdLCBtYXhfdG9rZW5zOiA4IH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZha2UubWVzc2FnZXNDYWxscy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmFrZS5tZXNzYWdlc0NhbGxzWzBdLmJvZHkubW9kZWwsICdjbGF1ZGUtb3B1cy00LjYnKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW5kcG9pbnQgSUQgaW5ib3VuZCBpcyBhbHNvIGFjY2VwdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IG5ldyBGYWtlQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRcdGZha2UubWVzc2FnZXNSZXN1bHQgPSB7IGtpbmQ6ICdtZXNzYWdlJywgbWVzc2FnZTogbWFrZU1lc3NhZ2UoJ2NsYXVkZS1vcHVzLTQuNicsICdoaScpIH07XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlUHJveHlTZXJ2aWNlKGZha2UpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydChUT0tFTik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBmZXRjaEpzb24oYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21lc3NhZ2VzYCwge1xuXHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2hhbmRsZS5ub25jZX0uc2AsXG5cdFx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ2NsYXVkZS1vcHVzLTQuNicsIG1lc3NhZ2VzOiBbXSwgbWF4X3Rva2VuczogOCB9KSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmYWtlLm1lc3NhZ2VzQ2FsbHNbMF0uYm9keS5tb2RlbCwgJ2NsYXVkZS1vcHVzLTQuNicpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1bnBhcnNlYWJsZSBtb2RlbCBcdTIxOTIgNDA0IHdpdGggbm8gdXBzdHJlYW0gY2FsbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZha2UgPSBuZXcgRmFrZUNvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlUHJveHlTZXJ2aWNlKGZha2UpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydChUT0tFTik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaEpzb24oYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21lc3NhZ2VzYCwge1xuXHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2hhbmRsZS5ub25jZX0uc2AsXG5cdFx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ2dwdC00bycsIG1lc3NhZ2VzOiBbXSwgbWF4X3Rva2VuczogOCB9KSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc3RhdHVzLCA0MDQpO1xuXHRcdFx0XHRjb25zdCBlbnYgPSByZXMucGFyc2VkIGFzIEFudGhyb3BpYy5FcnJvclJlc3BvbnNlO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52LmVycm9yLnR5cGUsICdub3RfZm91bmRfZXJyb3InKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZha2UubWVzc2FnZXNDYWxscy5sZW5ndGgsIDApO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdub24tc3RyZWFtaW5nIHJlc3BvbnNlIG1vZGVsIGlzIHJld3JpdHRlbiB0byBTREsgZm9ybWF0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IG5ldyBGYWtlQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRcdGZha2UubWVzc2FnZXNSZXN1bHQgPSB7IGtpbmQ6ICdtZXNzYWdlJywgbWVzc2FnZTogbWFrZU1lc3NhZ2UoJ2NsYXVkZS1vcHVzLTQuNicsICdoaScpIH07XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlUHJveHlTZXJ2aWNlKGZha2UpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydChUT0tFTik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaEpzb24oYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21lc3NhZ2VzYCwge1xuXHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2hhbmRsZS5ub25jZX0uc2AsXG5cdFx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ2NsYXVkZS1vcHVzLTQtNicsIG1lc3NhZ2VzOiBbXSwgbWF4X3Rva2VuczogOCB9KSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc3RhdHVzLCAyMDApO1xuXHRcdFx0XHRjb25zdCBtc2cgPSByZXMucGFyc2VkIGFzIEFudGhyb3BpYy5NZXNzYWdlO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobXNnLm1vZGVsLCAnY2xhdWRlLW9wdXMtNC02Jyk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gQ3JlZGl0cyByZXBvcnRpbmdcblxuXHRzdWl0ZSgnQ3JlZGl0cyByZXBvcnRpbmcnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdzdHJlYW1pbmc6IGNvcGlsb3RfdXNhZ2UudG90YWxfbmFub19haXUgZmlyZXMgb25EaWRSZXBvcnRDcmVkaXRzIHdpdGggdGhlIHNlc3Npb24gaWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWtlID0gbmV3IEZha2VDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgZXZlbnRzID0gbWFrZVN0cmVhbUV2ZW50cygnY2xhdWRlLW9wdXMtNC42Jyk7XG5cdFx0XHQvLyBBdHRhY2ggQ0FQSSBiaWxsaW5nIHRvIHRoZSBtZXNzYWdlX2RlbHRhLCBtaXJyb3JpbmcgdGhlIHJlYWxcblx0XHRcdC8vIGAvdjEvbWVzc2FnZXNgIFNTRSBzaGFwZSAodGhlIHB1Ymxpc2hlZCBBbnRocm9waWMgdHlwZXMgZG9uJ3Rcblx0XHRcdC8vIGRlY2xhcmUgYGNvcGlsb3RfdXNhZ2VgKS5cblx0XHRcdGNvbnN0IGRlbHRhID0gZXZlbnRzLmZpbmQoZSA9PiBlLnR5cGUgPT09ICdtZXNzYWdlX2RlbHRhJykhO1xuXHRcdFx0KGRlbHRhIGFzIHVua25vd24gYXMgeyBjb3BpbG90X3VzYWdlOiB7IHRvdGFsX25hbm9fYWl1OiBudW1iZXIgfSB9KS5jb3BpbG90X3VzYWdlID0geyB0b3RhbF9uYW5vX2FpdTogNzUwXzAwMF8wMDAgfTtcblx0XHRcdGZha2UubWVzc2FnZXNSZXN1bHQgPSB7IGtpbmQ6ICdzdHJlYW0nLCBldmVudHMgfTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVQcm94eVNlcnZpY2UoZmFrZSk7XG5cdFx0XHRjb25zdCByZXBvcnRzOiB7IHNlc3Npb25JZDogc3RyaW5nOyB0b3RhbE5hbm9BaXU6IG51bWJlciB9W10gPSBbXTtcblx0XHRcdGNvbnN0IHN1YiA9IHNlcnZpY2Uub25EaWRSZXBvcnRDcmVkaXRzKGUgPT4gcmVwb3J0cy5wdXNoKGUpKTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoVE9LRU4pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgZmV0Y2hTc2UoYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21lc3NhZ2VzYCwge1xuXHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2hhbmRsZS5ub25jZX0uc2Vzcy00MmAsXG5cdFx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ2NsYXVkZS1vcHVzLTQtNicsIG1lc3NhZ2VzOiBbXSwgbWF4X3Rva2VuczogOCwgc3RyZWFtOiB0cnVlIH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXBvcnRzLCBbeyBzZXNzaW9uSWQ6ICdzZXNzLTQyJywgdG90YWxOYW5vQWl1OiA3NTBfMDAwXzAwMCB9XSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vbi1zdHJlYW1pbmc6IGNvcGlsb3RfdXNhZ2UudG90YWxfbmFub19haXUgZmlyZXMgb25EaWRSZXBvcnRDcmVkaXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IG5ldyBGYWtlQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBtYWtlTWVzc2FnZSgnY2xhdWRlLW9wdXMtNC42JywgJ2hpJyk7XG5cdFx0XHQobWVzc2FnZSBhcyB1bmtub3duIGFzIHsgY29waWxvdF91c2FnZTogeyB0b3RhbF9uYW5vX2FpdTogbnVtYmVyIH0gfSkuY29waWxvdF91c2FnZSA9IHsgdG90YWxfbmFub19haXU6IDI1MF8wMDBfMDAwIH07XG5cdFx0XHRmYWtlLm1lc3NhZ2VzUmVzdWx0ID0geyBraW5kOiAnbWVzc2FnZScsIG1lc3NhZ2UgfTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVQcm94eVNlcnZpY2UoZmFrZSk7XG5cdFx0XHRjb25zdCByZXBvcnRzOiB7IHNlc3Npb25JZDogc3RyaW5nOyB0b3RhbE5hbm9BaXU6IG51bWJlciB9W10gPSBbXTtcblx0XHRcdGNvbnN0IHN1YiA9IHNlcnZpY2Uub25EaWRSZXBvcnRDcmVkaXRzKGUgPT4gcmVwb3J0cy5wdXNoKGUpKTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoVE9LRU4pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgZmV0Y2hKc29uKGAke2hhbmRsZS5iYXNlVXJsfS92MS9tZXNzYWdlc2AsIHtcblx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0XHQnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtoYW5kbGUubm9uY2V9LnNlc3MtN2AsXG5cdFx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ2NsYXVkZS1vcHVzLTQtNicsIG1lc3NhZ2VzOiBbXSwgbWF4X3Rva2VuczogOCB9KSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVwb3J0cywgW3sgc2Vzc2lvbklkOiAnc2Vzcy03JywgdG90YWxOYW5vQWl1OiAyNTBfMDAwXzAwMCB9XSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vIGNvcGlsb3RfdXNhZ2UgaW4gdGhlIHJlc3BvbnNlIFx1MjE5MiBubyBjcmVkaXRzIHJlcG9ydCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZha2UgPSBuZXcgRmFrZUNvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0XHRmYWtlLm1lc3NhZ2VzUmVzdWx0ID0geyBraW5kOiAnbWVzc2FnZScsIG1lc3NhZ2U6IG1ha2VNZXNzYWdlKCdjbGF1ZGUtb3B1cy00LjYnLCAnaGknKSB9O1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVByb3h5U2VydmljZShmYWtlKTtcblx0XHRcdGNvbnN0IHJlcG9ydHM6IHsgc2Vzc2lvbklkOiBzdHJpbmc7IHRvdGFsTmFub0FpdTogbnVtYmVyIH1bXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc3ViID0gc2VydmljZS5vbkRpZFJlcG9ydENyZWRpdHMoZSA9PiByZXBvcnRzLnB1c2goZSkpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydChUT0tFTik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBmZXRjaEpzb24oYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21lc3NhZ2VzYCwge1xuXHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2hhbmRsZS5ub25jZX0uc2Vzcy05YCxcblx0XHRcdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnY2xhdWRlLW9wdXMtNC02JywgbWVzc2FnZXM6IFtdLCBtYXhfdG9rZW5zOiA4IH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXBvcnRzLCBbXSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gQm9keSB2YWxpZGF0aW9uXG5cblx0c3VpdGUoJ0JvZHkgdmFsaWRhdGlvbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ25vbi1KU09OIGJvZHkgXHUyMTkyIDQwMCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZha2UgPSBuZXcgRmFrZUNvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlUHJveHlTZXJ2aWNlKGZha2UpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydChUT0tFTik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaEpzb24oYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21lc3NhZ2VzYCwge1xuXHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2hhbmRsZS5ub25jZX0uc2AsXG5cdFx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Ym9keTogJ25vdC1qc29uJyxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc3RhdHVzLCA0MDApO1xuXHRcdFx0XHRjb25zdCBlbnYgPSByZXMucGFyc2VkIGFzIEFudGhyb3BpYy5FcnJvclJlc3BvbnNlO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52LmVycm9yLnR5cGUsICdpbnZhbGlkX3JlcXVlc3RfZXJyb3InKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWlzc2luZyBtb2RlbCBmaWVsZCBcdTIxOTIgNDAwJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IG5ldyBGYWtlQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVQcm94eVNlcnZpY2UoZmFrZSk7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0KFRPS0VOKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoSnNvbihgJHtoYW5kbGUuYmFzZVVybH0vdjEvbWVzc2FnZXNgLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfS5zYCxcblx0XHRcdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1lc3NhZ2VzOiBbXSwgbWF4X3Rva2VuczogOCB9KSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc3RhdHVzLCA0MDApO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtaXNzaW5nIG1lc3NhZ2VzIGZpZWxkIFx1MjE5MiA0MDAnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWtlID0gbmV3IEZha2VDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVByb3h5U2VydmljZShmYWtlKTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoVE9LRU4pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2hKc29uKGAke2hhbmRsZS5iYXNlVXJsfS92MS9tZXNzYWdlc2AsIHtcblx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0XHQnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtoYW5kbGUubm9uY2V9LnNgLFxuXHRcdFx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6ICdjbGF1ZGUtb3B1cy00LTYnLCBtYXhfdG9rZW5zOiA4IH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDQwMCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gSGVhZGVyIHBhc3N0aHJvdWdoXG5cblx0c3VpdGUoJ0hlYWRlciBwYXNzdGhyb3VnaCcsICgpID0+IHtcblxuXHRcdGFzeW5jIGZ1bmN0aW9uIHBvc3RBbmRDYXB0dXJlSGVhZGVycyhiZXRhOiBzdHJpbmcgfCB1bmRlZmluZWQsIHZlcnNpb246IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8UmVjb3JkPHN0cmluZywgc3RyaW5nPiB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IG5ldyBGYWtlQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRcdGZha2UubWVzc2FnZXNSZXN1bHQgPSB7IGtpbmQ6ICdtZXNzYWdlJywgbWVzc2FnZTogbWFrZU1lc3NhZ2UoJ2NsYXVkZS1vcHVzLTQuNicsICdoaScpIH07XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlUHJveHlTZXJ2aWNlKGZha2UpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydChUT0tFTik7XG5cdFx0XHRjb25zdCBoZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHRcdFx0XHQnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtoYW5kbGUubm9uY2V9LnNgLFxuXHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHQneC1yZXF1ZXN0LWlkJzogJ2NhbGxlci1yaWQtMTIzJyxcblx0XHRcdFx0J3gtY3VzdG9tLXRoaW5nJzogJ3Nob3VsZC1kcm9wJyxcblx0XHRcdH07XG5cdFx0XHRpZiAoYmV0YSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGhlYWRlcnNbJ2FudGhyb3BpYy1iZXRhJ10gPSBiZXRhO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHZlcnNpb24gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRoZWFkZXJzWydhbnRocm9waWMtdmVyc2lvbiddID0gdmVyc2lvbjtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGZldGNoSnNvbihgJHtoYW5kbGUuYmFzZVVybH0vdjEvbWVzc2FnZXNgLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnY2xhdWRlLW9wdXMtNC02JywgbWVzc2FnZXM6IFtdLCBtYXhfdG9rZW5zOiA4IH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuIGZha2UubWVzc2FnZXNDYWxsc1swXS5vcHRpb25zPy5oZWFkZXJzIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0ZXN0KCdmb3J3YXJkcyBhbnRocm9waWMtdmVyc2lvbiB2ZXJiYXRpbScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGhlYWRlcnMgPSBhd2FpdCBwb3N0QW5kQ2FwdHVyZUhlYWRlcnModW5kZWZpbmVkLCAnMjAyMy0wNi0wMScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnM/LlsnYW50aHJvcGljLXZlcnNpb24nXSwgJzIwMjMtMDYtMDEnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZvcndhcmRzIHN1cHBvcnRlZCBhbnRocm9waWMtYmV0YScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGhlYWRlcnMgPSBhd2FpdCBwb3N0QW5kQ2FwdHVyZUhlYWRlcnMoJ2ludGVybGVhdmVkLXRoaW5raW5nLTIwMjUtMDUtMTQnLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnM/LlsnYW50aHJvcGljLWJldGEnXSwgJ2ludGVybGVhdmVkLXRoaW5raW5nLTIwMjUtMDUtMTQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbHRlcnMgb3V0IHVuc3VwcG9ydGVkIGJldGFzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaGVhZGVycyA9IGF3YWl0IHBvc3RBbmRDYXB0dXJlSGVhZGVycygnZm9vLGJhcixiYXonLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnM/LlsnYW50aHJvcGljLWJldGEnXSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Ryb3BzIHN1cHBvcnRlZCBmYW1pbHkgd2l0aG91dCBkYXRlIHN1ZmZpeCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGhlYWRlcnMgPSBhd2FpdCBwb3N0QW5kQ2FwdHVyZUhlYWRlcnMoJ2ludGVybGVhdmVkLXRoaW5raW5nJywgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzPy5bJ2FudGhyb3BpYy1iZXRhJ10sIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtaXhlZCBiZXRhIGxpc3Qga2VlcHMgc3VwcG9ydGVkIGVudHJpZXMgb25seScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGhlYWRlcnMgPSBhd2FpdCBwb3N0QW5kQ2FwdHVyZUhlYWRlcnMoJ2ludGVybGVhdmVkLXRoaW5raW5nLTIwMjUtMDUtMTQsZm9vJywgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzPy5bJ2FudGhyb3BpYy1iZXRhJ10sICdpbnRlcmxlYXZlZC10aGlua2luZy0yMDI1LTA1LTE0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkcm9wcyB4LXJlcXVlc3QtaWQgYW5kIGFyYml0cmFyeSBoZWFkZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaGVhZGVycyA9IGF3YWl0IHBvc3RBbmRDYXB0dXJlSGVhZGVycygnaW50ZXJsZWF2ZWQtdGhpbmtpbmctMjAyNS0wNS0xNCcsICcyMDIzLTA2LTAxJykgPz8ge307XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKE9iamVjdC5rZXlzKGhlYWRlcnMpLnNvcnQoKSwgWydhbnRocm9waWMtYmV0YScsICdhbnRocm9waWMtdmVyc2lvbiddKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gU3RyZWFtaW5nXG5cblx0c3VpdGUoJ1N0cmVhbWluZycsICgpID0+IHtcblxuXHRcdHRlc3QoJ2VtaXRzIFNTRSBmcmFtZXMgaW4gb3JkZXIgd2l0aCBoYW5kLXJvbGxlZCBmcmFtaW5nIGFuZCByZXdyaXRlcyBtZXNzYWdlX3N0YXJ0Lm1lc3NhZ2UubW9kZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWtlID0gbmV3IEZha2VDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdFx0ZmFrZS5tZXNzYWdlc1Jlc3VsdCA9IHsga2luZDogJ3N0cmVhbScsIGV2ZW50czogbWFrZVN0cmVhbUV2ZW50cygnY2xhdWRlLW9wdXMtNC42JykgfTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVQcm94eVNlcnZpY2UoZmFrZSk7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0KFRPS0VOKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoU3NlKGAke2hhbmRsZS5iYXNlVXJsfS92MS9tZXNzYWdlc2AsIHtcblx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0XHQnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtoYW5kbGUubm9uY2V9LnNgLFxuXHRcdFx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6ICdjbGF1ZGUtb3B1cy00LTYnLCBtZXNzYWdlczogW10sIG1heF90b2tlbnM6IDgsIHN0cmVhbTogdHJ1ZSB9KSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc3RhdHVzLCAyMDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddLCAndGV4dC9ldmVudC1zdHJlYW0nKTtcblx0XHRcdFx0Y29uc3QgdHlwZXMgPSByZXMuZXZlbnRzLm1hcChlID0+IGUudHlwZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHlwZXMsIFtcblx0XHRcdFx0XHQnbWVzc2FnZV9zdGFydCcsXG5cdFx0XHRcdFx0J2NvbnRlbnRfYmxvY2tfc3RhcnQnLFxuXHRcdFx0XHRcdCdjb250ZW50X2Jsb2NrX2RlbHRhJyxcblx0XHRcdFx0XHQnY29udGVudF9ibG9ja19zdG9wJyxcblx0XHRcdFx0XHQnbWVzc2FnZV9kZWx0YScsXG5cdFx0XHRcdFx0J21lc3NhZ2Vfc3RvcCcsXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRjb25zdCBzdGFydCA9IHJlcy5ldmVudHNbMF0uZGF0YSBhcyB7IHR5cGU6ICdtZXNzYWdlX3N0YXJ0JzsgbWVzc2FnZTogeyBtb2RlbDogc3RyaW5nIH0gfTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXJ0Lm1lc3NhZ2UubW9kZWwsICdjbGF1ZGUtb3B1cy00LTYnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKCFyZXMucmF3Qm9keS5pbmNsdWRlcygnW0RPTkVdJykpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtaWQtc3RyZWFtIENvcGlsb3RBcGlFcnJvciBcdTIxOTIgU1NFIGVycm9yIGZyYW1lLCB0aGVuIGVuZCwgbm8gbWVzc2FnZV9zdG9wIGFmdGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IG5ldyBGYWtlQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IGV2ZW50czogQW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudFtdID0gW1xuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlX3N0YXJ0JywgbWVzc2FnZTogbWFrZU1lc3NhZ2UoJ2NsYXVkZS1vcHVzLTQuNicsICcnKSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdjb250ZW50X2Jsb2NrX3N0YXJ0JywgaW5kZXg6IDAsIGNvbnRlbnRfYmxvY2s6IHsgdHlwZTogJ3RleHQnLCB0ZXh0OiAnJywgY2l0YXRpb25zOiBbXSB9IH0gYXMgQW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudCxcblx0XHRcdF07XG5cdFx0XHRjb25zdCB1cHN0cmVhbUVudmVsb3BlOiBBbnRocm9waWMuRXJyb3JSZXNwb25zZSA9IHtcblx0XHRcdFx0dHlwZTogJ2Vycm9yJyxcblx0XHRcdFx0ZXJyb3I6IHsgdHlwZTogJ3JhdGVfbGltaXRfZXJyb3InLCBtZXNzYWdlOiAnc2xvdyBkb3duJyB9LFxuXHRcdFx0XHRyZXF1ZXN0X2lkOiAncmVxX3h5eicsXG5cdFx0XHR9O1xuXHRcdFx0ZmFrZS5tZXNzYWdlc1Jlc3VsdCA9IHtcblx0XHRcdFx0a2luZDogJ3N0cmVhbScsXG5cdFx0XHRcdGV2ZW50cyxcblx0XHRcdFx0bWlkU3RyZWFtRXJyb3I6IG5ldyBDb3BpbG90QXBpRXJyb3IoQ09QSUxPVF9BUElfRVJST1JfU1RBVFVTX1NUUkVBTUlORywgdXBzdHJlYW1FbnZlbG9wZSksXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVByb3h5U2VydmljZShmYWtlKTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoVE9LRU4pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2hTc2UoYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21lc3NhZ2VzYCwge1xuXHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2hhbmRsZS5ub25jZX0uc2AsXG5cdFx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ2NsYXVkZS1vcHVzLTQtNicsIG1lc3NhZ2VzOiBbXSwgbWF4X3Rva2VuczogOCwgc3RyZWFtOiB0cnVlIH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcy5zdGF0dXMsIDIwMCk7XG5cdFx0XHRcdGNvbnN0IGxhc3RFdmVudCA9IHJlcy5ldmVudHMuYXQoLTEpO1xuXHRcdFx0XHRhc3NlcnQub2sobGFzdEV2ZW50KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RFdmVudC50eXBlLCAnZXJyb3InKTtcblx0XHRcdFx0YXNzZXJ0RW52ZWxvcGVXaXRoQ2hhdEVycm9yTWFya2VyKGxhc3RFdmVudC5kYXRhIGFzIEFudGhyb3BpYy5FcnJvclJlc3BvbnNlLCB1cHN0cmVhbUVudmVsb3BlLCAnZmFpbGVkJyk7XG5cdFx0XHRcdGNvbnN0IHR5cGVzID0gcmVzLmV2ZW50cy5tYXAoZSA9PiBlLnR5cGUpO1xuXHRcdFx0XHRhc3NlcnQub2soIXR5cGVzLmluY2x1ZGVzKCdtZXNzYWdlX3N0b3AnKSwgJ25vIG1lc3NhZ2Vfc3RvcCBhZnRlciBlcnJvciBmcmFtZScpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmUtc3RyZWFtIENvcGlsb3RBcGlFcnJvciBcdTIxOTIgSlNPTiBlcnJvciByZXNwb25zZSB3aXRoIG9yaWdpbmFsIHN0YXR1cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZha2UgPSBuZXcgRmFrZUNvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBlbnZlbG9wZTogQW50aHJvcGljLkVycm9yUmVzcG9uc2UgPSB7XG5cdFx0XHRcdHR5cGU6ICdlcnJvcicsXG5cdFx0XHRcdGVycm9yOiB7IHR5cGU6ICdhdXRoZW50aWNhdGlvbl9lcnJvcicsIG1lc3NhZ2U6ICd0b2tlbiBleHBpcmVkJyB9LFxuXHRcdFx0XHRyZXF1ZXN0X2lkOiAncmVxX3ByZScsXG5cdFx0XHR9O1xuXHRcdFx0ZmFrZS5tZXNzYWdlc1Jlc3VsdCA9IHsga2luZDogJ2Vycm9yJywgZXJyb3I6IG5ldyBDb3BpbG90QXBpRXJyb3IoNDAxLCBlbnZlbG9wZSkgfTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVQcm94eVNlcnZpY2UoZmFrZSk7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0KFRPS0VOKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoSnNvbihgJHtoYW5kbGUuYmFzZVVybH0vdjEvbWVzc2FnZXNgLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfS5zYCxcblx0XHRcdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnY2xhdWRlLW9wdXMtNC02JywgbWVzc2FnZXM6IFtdLCBtYXhfdG9rZW5zOiA4LCBzdHJlYW06IHRydWUgfSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzLnN0YXR1cywgNDAxKTtcblx0XHRcdFx0YXNzZXJ0RW52ZWxvcGVXaXRoQ2hhdEVycm9yTWFya2VyKHJlcy5wYXJzZWQgYXMgQW50aHJvcGljLkVycm9yUmVzcG9uc2UsIGVudmVsb3BlLCAnYWdlbnRfdW5hdXRob3JpemVkJyk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZS1zdHJlYW0gQ29waWxvdEFwaUVycm9yIHdpdGggc3RyZWFtaW5nIHNlbnRpbmVsIGNvZXJjZXMgdG8gNTAyIGJ1dCBwcmVzZXJ2ZXMgZW52ZWxvcGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBUaGUgNTIwIHNlbnRpbmVsIGlzIG1lYW5pbmdsZXNzIGFzIGFuIEhUVFAgc3RhdHVzIHByZS1cblx0XHRcdC8vIGhlYWRlcjsgdGhlIHByb3h5IG11c3QgY29lcmNlIHRvIDUwMiB3aGlsZSBrZWVwaW5nIHRoZVxuXHRcdFx0Ly8gdXBzdHJlYW0gZW52ZWxvcGUgdmVyYmF0aW0uIFNlZSBwbGFuIFx1MDBBNzEuNS5cblx0XHRcdGNvbnN0IGZha2UgPSBuZXcgRmFrZUNvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBlbnZlbG9wZTogQW50aHJvcGljLkVycm9yUmVzcG9uc2UgPSB7XG5cdFx0XHRcdHR5cGU6ICdlcnJvcicsXG5cdFx0XHRcdGVycm9yOiB7IHR5cGU6ICdvdmVybG9hZGVkX2Vycm9yJywgbWVzc2FnZTogJ2NhcGFjaXR5IGZ1bGwnIH0sXG5cdFx0XHRcdHJlcXVlc3RfaWQ6ICdyZXFfc2VudGluZWwnLFxuXHRcdFx0fTtcblx0XHRcdGZha2UubWVzc2FnZXNSZXN1bHQgPSB7IGtpbmQ6ICdlcnJvcicsIGVycm9yOiBuZXcgQ29waWxvdEFwaUVycm9yKENPUElMT1RfQVBJX0VSUk9SX1NUQVRVU19TVFJFQU1JTkcsIGVudmVsb3BlKSB9O1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVByb3h5U2VydmljZShmYWtlKTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoVE9LRU4pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2hKc29uKGAke2hhbmRsZS5iYXNlVXJsfS92MS9tZXNzYWdlc2AsIHtcblx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFx0XHQnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtoYW5kbGUubm9uY2V9LnNgLFxuXHRcdFx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6ICdjbGF1ZGUtb3B1cy00LTYnLCBtZXNzYWdlczogW10sIG1heF90b2tlbnM6IDgsIHN0cmVhbTogdHJ1ZSB9KSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXMuc3RhdHVzLCA1MDIpO1xuXHRcdFx0XHRhc3NlcnRFbnZlbG9wZVdpdGhDaGF0RXJyb3JNYXJrZXIocmVzLnBhcnNlZCBhcyBBbnRocm9waWMuRXJyb3JSZXNwb25zZSwgZW52ZWxvcGUsICdmYWlsZWQnKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWlkLXN0cmVhbSBub24tQ29waWxvdEFwaUVycm9yIFx1MjE5MiBzeW50aGVzaXplZCBTU0UgZXJyb3IgZnJhbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWtlID0gbmV3IEZha2VDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgZXZlbnRzOiBBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50W10gPSBbXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2Vfc3RhcnQnLCBtZXNzYWdlOiBtYWtlTWVzc2FnZSgnY2xhdWRlLW9wdXMtNC42JywgJycpIH0sXG5cdFx0XHRdO1xuXHRcdFx0ZmFrZS5tZXNzYWdlc1Jlc3VsdCA9IHsga2luZDogJ3N0cmVhbScsIGV2ZW50cywgbWlkU3RyZWFtRXJyb3I6IG5ldyBFcnJvcignc29ja2V0IGhhbmcgdXAnKSB9O1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVByb3h5U2VydmljZShmYWtlKTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoVE9LRU4pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2hTc2UoYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21lc3NhZ2VzYCwge1xuXHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2hhbmRsZS5ub25jZX0uc2AsXG5cdFx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ2NsYXVkZS1vcHVzLTQtNicsIG1lc3NhZ2VzOiBbXSwgbWF4X3Rva2VuczogOCwgc3RyZWFtOiB0cnVlIH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgbGFzdEV2ZW50ID0gcmVzLmV2ZW50cy5hdCgtMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0RXZlbnQ/LnR5cGUsICdlcnJvcicpO1xuXHRcdFx0XHRjb25zdCBlbnYgPSBsYXN0RXZlbnQuZGF0YSBhcyBBbnRocm9waWMuRXJyb3JSZXNwb25zZTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudi5lcnJvci50eXBlLCAnYXBpX2Vycm9yJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnYuZXJyb3IubWVzc2FnZSwgJ3NvY2tldCBoYW5nIHVwJyk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rvb2wtdXNlIGlucHV0X2pzb25fZGVsdGEgZXZlbnRzIHBhc3MgdGhyb3VnaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGZha2UgPSBuZXcgRmFrZUNvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBldmVudHM6IEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnRbXSA9IFtcblx0XHRcdFx0eyB0eXBlOiAnbWVzc2FnZV9zdGFydCcsIG1lc3NhZ2U6IG1ha2VNZXNzYWdlKCdjbGF1ZGUtb3B1cy00LjYnLCAnJykgfSxcblx0XHRcdFx0eyB0eXBlOiAnY29udGVudF9ibG9ja19zdGFydCcsIGluZGV4OiAwLCBjb250ZW50X2Jsb2NrOiB7IHR5cGU6ICd0b29sX3VzZScsIGlkOiAndG9vbHVfMScsIG5hbWU6ICdkb190aGluZycsIGlucHV0OiB7fSB9IH0gYXMgQW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudCxcblx0XHRcdFx0eyB0eXBlOiAnY29udGVudF9ibG9ja19kZWx0YScsIGluZGV4OiAwLCBkZWx0YTogeyB0eXBlOiAnaW5wdXRfanNvbl9kZWx0YScsIHBhcnRpYWxfanNvbjogJ3tcImFcIjonIH0gfSBhcyBBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50LFxuXHRcdFx0XHR7IHR5cGU6ICdjb250ZW50X2Jsb2NrX2RlbHRhJywgaW5kZXg6IDAsIGRlbHRhOiB7IHR5cGU6ICdpbnB1dF9qc29uX2RlbHRhJywgcGFydGlhbF9qc29uOiAnMX0nIH0gfSBhcyBBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50LFxuXHRcdFx0XHR7IHR5cGU6ICdjb250ZW50X2Jsb2NrX3N0b3AnLCBpbmRleDogMCB9LFxuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlX3N0b3AnIH0sXG5cdFx0XHRdO1xuXHRcdFx0ZmFrZS5tZXNzYWdlc1Jlc3VsdCA9IHsga2luZDogJ3N0cmVhbScsIGV2ZW50cyB9O1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVByb3h5U2VydmljZShmYWtlKTtcblx0XHRcdGNvbnN0IGhhbmRsZSA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoVE9LRU4pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVzID0gYXdhaXQgZmV0Y2hTc2UoYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21lc3NhZ2VzYCwge1xuXHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2hhbmRsZS5ub25jZX0uc2AsXG5cdFx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ2NsYXVkZS1vcHVzLTQtNicsIG1lc3NhZ2VzOiBbXSwgbWF4X3Rva2VuczogOCwgc3RyZWFtOiB0cnVlIH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgZGVsdGFzID0gcmVzLmV2ZW50cy5maWx0ZXIoZSA9PiBlLnR5cGUgPT09ICdjb250ZW50X2Jsb2NrX2RlbHRhJykubWFwKGUgPT4gZS5kYXRhIGFzIHsgZGVsdGE6IHsgdHlwZTogc3RyaW5nOyBwYXJ0aWFsX2pzb24/OiBzdHJpbmcgfSB9KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZWx0YXMubWFwKGQgPT4gZC5kZWx0YS50eXBlKSwgWydpbnB1dF9qc29uX2RlbHRhJywgJ2lucHV0X2pzb25fZGVsdGEnXSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVsdGFzLm1hcChkID0+IGQuZGVsdGEucGFydGlhbF9qc29uKSwgWyd7XCJhXCI6JywgJzF9J10pO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0aGlua2luZ19kZWx0YSBldmVudHMgcGFzcyB0aHJvdWdoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IG5ldyBGYWtlQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IGV2ZW50czogQW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudFtdID0gW1xuXHRcdFx0XHR7IHR5cGU6ICdtZXNzYWdlX3N0YXJ0JywgbWVzc2FnZTogbWFrZU1lc3NhZ2UoJ2NsYXVkZS1vcHVzLTQuNicsICcnKSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdjb250ZW50X2Jsb2NrX3N0YXJ0JywgaW5kZXg6IDAsIGNvbnRlbnRfYmxvY2s6IHsgdHlwZTogJ3RoaW5raW5nJywgdGhpbmtpbmc6ICcnIH0gfSBhcyBBbnRocm9waWMuTWVzc2FnZVN0cmVhbUV2ZW50LFxuXHRcdFx0XHR7IHR5cGU6ICdjb250ZW50X2Jsb2NrX2RlbHRhJywgaW5kZXg6IDAsIGRlbHRhOiB7IHR5cGU6ICd0aGlua2luZ19kZWx0YScsIHRoaW5raW5nOiAnaG1tJyB9IH0gYXMgQW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudCxcblx0XHRcdFx0eyB0eXBlOiAnY29udGVudF9ibG9ja19kZWx0YScsIGluZGV4OiAwLCBkZWx0YTogeyB0eXBlOiAndGhpbmtpbmdfZGVsdGEnLCB0aGlua2luZzogJyBvaycgfSB9IGFzIEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQsXG5cdFx0XHRcdHsgdHlwZTogJ2NvbnRlbnRfYmxvY2tfc3RvcCcsIGluZGV4OiAwIH0sXG5cdFx0XHRcdHsgdHlwZTogJ21lc3NhZ2Vfc3RvcCcgfSxcblx0XHRcdF07XG5cdFx0XHRmYWtlLm1lc3NhZ2VzUmVzdWx0ID0geyBraW5kOiAnc3RyZWFtJywgZXZlbnRzIH07XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlUHJveHlTZXJ2aWNlKGZha2UpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydChUT0tFTik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaFNzZShgJHtoYW5kbGUuYmFzZVVybH0vdjEvbWVzc2FnZXNgLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfS5zYCxcblx0XHRcdFx0XHRcdCdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnY2xhdWRlLW9wdXMtNC02JywgbWVzc2FnZXM6IFtdLCBtYXhfdG9rZW5zOiA4LCBzdHJlYW06IHRydWUgfSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBkZWx0YXMgPSByZXMuZXZlbnRzLmZpbHRlcihlID0+IGUudHlwZSA9PT0gJ2NvbnRlbnRfYmxvY2tfZGVsdGEnKS5tYXAoZSA9PiBlLmRhdGEgYXMgeyBkZWx0YTogeyB0eXBlOiBzdHJpbmc7IHRoaW5raW5nPzogc3RyaW5nIH0gfSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVsdGFzLm1hcChkID0+IGQuZGVsdGEudHlwZSksIFsndGhpbmtpbmdfZGVsdGEnLCAndGhpbmtpbmdfZGVsdGEnXSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVsdGFzLm1hcChkID0+IGQuZGVsdGEudGhpbmtpbmcpLCBbJ2htbScsICcgb2snXSk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NvY2tldC5zZXROb0RlbGF5KHRydWUpIGlzIGNhbGxlZCBvbiBzdHJlYW1pbmcgcmVzcG9uc2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IG5ldyBGYWtlQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRcdGZha2UubWVzc2FnZXNSZXN1bHQgPSB7IGtpbmQ6ICdzdHJlYW0nLCBldmVudHM6IG1ha2VTdHJlYW1FdmVudHMoJ2NsYXVkZS1vcHVzLTQuNicpIH07XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlUHJveHlTZXJ2aWNlKGZha2UpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydChUT0tFTik7XG5cblx0XHRcdC8vIFBhdGNoIG5ldC5Tb2NrZXQucHJvdG90eXBlLnNldE5vRGVsYXkgdG8gdHJhY2sgY2FsbHMgZHVyaW5nXG5cdFx0XHQvLyB0aGlzIHRlc3Qgb25seS5cblx0XHRcdGNvbnN0IG9yaWdpbmFsID0gbmV0LlNvY2tldC5wcm90b3R5cGUuc2V0Tm9EZWxheTtcblx0XHRcdGNvbnN0IGNhbGxzOiBib29sZWFuW10gPSBbXTtcblx0XHRcdG5ldC5Tb2NrZXQucHJvdG90eXBlLnNldE5vRGVsYXkgPSBmdW5jdGlvbiAodGhpczogbmV0LlNvY2tldCwgZW5hYmxlPzogYm9vbGVhbik6IG5ldC5Tb2NrZXQge1xuXHRcdFx0XHRjYWxscy5wdXNoKGVuYWJsZSAhPT0gZmFsc2UpO1xuXHRcdFx0XHRyZXR1cm4gb3JpZ2luYWwuY2FsbCh0aGlzLCBlbmFibGUgYXMgYm9vbGVhbik7XG5cdFx0XHR9O1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgZmV0Y2hTc2UoYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21lc3NhZ2VzYCwge1xuXHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2hhbmRsZS5ub25jZX0uc2AsXG5cdFx0XHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ2NsYXVkZS1vcHVzLTQtNicsIG1lc3NhZ2VzOiBbXSwgbWF4X3Rva2VuczogOCwgc3RyZWFtOiB0cnVlIH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGNhbGxzLnNvbWUoYyA9PiBjID09PSB0cnVlKSwgJ2V4cGVjdGVkIHNldE5vRGVsYXkodHJ1ZSkgdG8gaGF2ZSBiZWVuIGNhbGxlZCBhdCBsZWFzdCBvbmNlJyk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRuZXQuU29ja2V0LnByb3RvdHlwZS5zZXROb0RlbGF5ID0gb3JpZ2luYWw7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBBYm9ydFxuXG5cdHN1aXRlKCdBYm9ydCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ2NsaWVudCBkaXNjb25uZWN0IG1pZC1zdHJlYW0gcHJvcGFnYXRlcyBBYm9ydFNpZ25hbCB1cHN0cmVhbSBhbmQgd3JpdGVzIG5vdGhpbmcgZWxzZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBzaWduYWxTZWVuOiBBYm9ydFNpZ25hbCB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCByZXNvbHZlQWJvcnRlZCE6ICgpID0+IHZvaWQ7XG5cdFx0XHRjb25zdCBhYm9ydE9ic2VydmVkID0gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7IHJlc29sdmVBYm9ydGVkID0gcmVzb2x2ZTsgfSk7XG5cdFx0XHRjb25zdCB3cmFwcGVkOiBJQ29waWxvdEFwaVNlcnZpY2UgPSB7XG5cdFx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0Ly8gQ3VzdG9tIHN0cmVhbTogeWllbGQgbWVzc2FnZV9zdGFydCwgdGhlbiB3YWl0IHVudGlsIHRoZVxuXHRcdFx0XHQvLyBjYWxsZXIncyBBYm9ydFNpZ25hbCBmaXJlcyAobWltaWNzIGEgcmVhbCBsb25nLXJ1bm5pbmdcblx0XHRcdFx0Ly8gdXBzdHJlYW0gc3RyZWFtIHdhaXRpbmcgZm9yIHRva2VucyB0byBhcnJpdmUpLiBUaGUgdGVzdFxuXHRcdFx0XHQvLyBjbGllbnQgZGlzY29ubmVjdHMgYWZ0ZXIgcmVjZWl2aW5nIHRoZSBmaXJzdCBmcmFtZSwgYW5kXG5cdFx0XHRcdC8vIHdlIGFzc2VydCB0aGF0IHRoZSBhYm9ydCBwcm9wYWdhdGVkLlxuXHRcdFx0XHRtZXNzYWdlczogKChfdG9rZW46IHN0cmluZywgX2JvZHk6IEFudGhyb3BpYy5NZXNzYWdlQ3JlYXRlUGFyYW1zLCBvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMpID0+IHtcblx0XHRcdFx0XHRzaWduYWxTZWVuID0gb3B0aW9ucz8uc2lnbmFsO1xuXHRcdFx0XHRcdGFzeW5jIGZ1bmN0aW9uKiBnZW4oKTogQXN5bmNHZW5lcmF0b3I8QW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudD4ge1xuXHRcdFx0XHRcdFx0eWllbGQgeyB0eXBlOiAnbWVzc2FnZV9zdGFydCcsIG1lc3NhZ2U6IG1ha2VNZXNzYWdlKCdjbGF1ZGUtb3B1cy00LjYnLCAnJykgfTtcblx0XHRcdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChfcmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG9uQWJvcnQgPSAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0cmVzb2x2ZUFib3J0ZWQoKTtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBlID0gbmV3IEVycm9yKCdBYm9ydGVkJyk7XG5cdFx0XHRcdFx0XHRcdFx0KGUgYXMgeyBuYW1lOiBzdHJpbmcgfSkubmFtZSA9ICdBYm9ydEVycm9yJztcblx0XHRcdFx0XHRcdFx0XHRyZWplY3QoZSk7XG5cdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHRcdGlmIChvcHRpb25zPy5zaWduYWw/LmFib3J0ZWQpIHtcblx0XHRcdFx0XHRcdFx0XHRvbkFib3J0KCk7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdG9wdGlvbnM/LnNpZ25hbD8uYWRkRXZlbnRMaXN0ZW5lcignYWJvcnQnLCBvbkFib3J0KTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gZ2VuKCk7XG5cdFx0XHRcdH0pIGFzIElDb3BpbG90QXBpU2VydmljZVsnbWVzc2FnZXMnXSxcblx0XHRcdFx0Y291bnRUb2tlbnM6ICgpID0+IFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignbm90IHVzZWQnKSksXG5cdFx0XHRcdG1vZGVsczogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKFtdKSxcblx0XHRcdFx0cmVzcG9uc2VzOiAoKSA9PiBQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ25vdCB1c2VkJykpLFxuXHRcdFx0XHR1dGlsaXR5Q2hhdENvbXBsZXRpb246ICgpID0+IFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignbm90IHVzZWQnKSksXG5cdFx0XHRcdHJlc29sdmVSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dDogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHsgcmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQ6IGZhbHNlLCB0cmFja2luZ0lkOiB1bmRlZmluZWQsIHRlbGVtZXRyeUVuZHBvaW50OiB1bmRlZmluZWQgfSksXG5cdFx0XHRcdHJlc29sdmVBcGlFbmRwb2ludDogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCksXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBDbGF1ZGVQcm94eVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIHdyYXBwZWQpO1xuXHRcdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydChUT0tFTik7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHUgPSBuZXcgVVJMKGAke2hhbmRsZS5iYXNlVXJsfS92MS9tZXNzYWdlc2ApO1xuXHRcdFx0XHRjb25zdCBodHRwTW9kID0gYXdhaXQgZ2V0SHR0cCgpO1xuXHRcdFx0XHRjb25zdCBjbGllbnRGaW5pc2hlZCA9IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHJlcSA9IGh0dHBNb2QucmVxdWVzdCh7XG5cdFx0XHRcdFx0XHRob3N0bmFtZTogdS5ob3N0bmFtZSxcblx0XHRcdFx0XHRcdHBvcnQ6IHUucG9ydCxcblx0XHRcdFx0XHRcdHBhdGg6IHUucGF0aG5hbWUsXG5cdFx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XHRcdFx0J0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7aGFuZGxlLm5vbmNlfS5zYCxcblx0XHRcdFx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSwgcmVzID0+IHtcblx0XHRcdFx0XHRcdGxldCBmcmFtZXMgPSAwO1xuXHRcdFx0XHRcdFx0cmVzLm9uKCdkYXRhJywgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRmcmFtZXMrKztcblx0XHRcdFx0XHRcdFx0aWYgKGZyYW1lcyA+PSAxKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVxLmRlc3Ryb3koKTtcblx0XHRcdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0cmVzLm9uKCdlcnJvcicsICgpID0+IHJlc29sdmUoKSk7XG5cdFx0XHRcdFx0XHRyZXMub24oJ2Nsb3NlJywgKCkgPT4gcmVzb2x2ZSgpKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRyZXEub24oJ2Vycm9yJywgKCkgPT4gcmVzb2x2ZSgpKTtcblx0XHRcdFx0XHRyZXEud3JpdGUoSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ2NsYXVkZS1vcHVzLTQtNicsIG1lc3NhZ2VzOiBbXSwgbWF4X3Rva2VuczogOCwgc3RyZWFtOiB0cnVlIH0pKTtcblx0XHRcdFx0XHRyZXEuZW5kKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhd2FpdCBjbGllbnRGaW5pc2hlZDtcblx0XHRcdFx0Ly8gV2FpdCBmb3IgdGhlIHVwc3RyZWFtIGdlbmVyYXRvciB0byBvYnNlcnZlIHRoZSBhYm9ydC5cblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5yYWNlKFtcblx0XHRcdFx0XHRhYm9ydE9ic2VydmVkLFxuXHRcdFx0XHRcdG5ldyBQcm9taXNlPHZvaWQ+KChfcmVzb2x2ZSwgcmVqZWN0KSA9PiBzZXRUaW1lb3V0KCgpID0+IHJlamVjdChuZXcgRXJyb3IoJ3Vwc3RyZWFtIGRpZCBub3Qgb2JzZXJ2ZSBhYm9ydCB3aXRoaW4gMnMnKSksIDIwMDApKSxcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0YXNzZXJ0Lm9rKHNpZ25hbFNlZW4sICdleHBlY3RlZCB1cHN0cmVhbSBzaWduYWwnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHNpZ25hbFNlZW4uYWJvcnRlZCwgJ2V4cGVjdGVkIGFib3J0IHRvIGZpcmUgb24gY2xpZW50IGRpc2Nvbm5lY3QnKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzcG9zZSgpIHdpdGggaW4tZmxpZ2h0IG5vbi1zdHJlYW1pbmcgYWJvcnRzIHRoZSB1cHN0cmVhbSBjYWxsJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZSA9IG5ldyBGYWtlQ29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRcdGxldCBzaWduYWxTZWVuOiBBYm9ydFNpZ25hbCB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCByZWxlYXNlVXBzdHJlYW06ICgpID0+IHZvaWQgPSAoKSA9PiB7IH07XG5cdFx0XHRjb25zdCB1cHN0cmVhbSA9IG5ldyBQcm9taXNlPEFudGhyb3BpYy5NZXNzYWdlPigoX3Jlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHRyZWxlYXNlVXBzdHJlYW0gPSAoKSA9PiByZWplY3QoT2JqZWN0LmFzc2lnbihuZXcgRXJyb3IoJ0Fib3J0ZWQnKSwgeyBuYW1lOiAnQWJvcnRFcnJvcicgfSkpO1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB3cmFwcGVkOiBJQ29waWxvdEFwaVNlcnZpY2UgPSB7XG5cdFx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0bWVzc2FnZXM6ICgodG9rZW4sIGJvZHksIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0XHRzaWduYWxTZWVuID0gb3B0aW9ucz8uc2lnbmFsO1xuXHRcdFx0XHRcdGlmIChib2R5LnN0cmVhbSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZha2UubWVzc2FnZXModG9rZW4sIGJvZHkgYXMgQW50aHJvcGljLk1lc3NhZ2VDcmVhdGVQYXJhbXNTdHJlYW1pbmcsIG9wdGlvbnMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRvcHRpb25zPy5zaWduYWw/LmFkZEV2ZW50TGlzdGVuZXIoJ2Fib3J0JywgKCkgPT4gcmVsZWFzZVVwc3RyZWFtKCkpO1xuXHRcdFx0XHRcdHJldHVybiB1cHN0cmVhbTtcblx0XHRcdFx0fSkgYXMgSUNvcGlsb3RBcGlTZXJ2aWNlWydtZXNzYWdlcyddLFxuXHRcdFx0XHRjb3VudFRva2VuczogZmFrZS5jb3VudFRva2Vucy5iaW5kKGZha2UpLFxuXHRcdFx0XHRtb2RlbHM6IGZha2UubW9kZWxzLmJpbmQoZmFrZSksXG5cdFx0XHRcdHJlc3BvbnNlczogZmFrZS5yZXNwb25zZXMuYmluZChmYWtlKSxcblx0XHRcdFx0dXRpbGl0eUNoYXRDb21wbGV0aW9uOiBmYWtlLnV0aWxpdHlDaGF0Q29tcGxldGlvbi5iaW5kKGZha2UpLFxuXHRcdFx0XHRyZXNvbHZlUmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQ6IGZha2UucmVzb2x2ZVJlc3RyaWN0ZWRUZWxlbWV0cnlDb250ZXh0LmJpbmQoZmFrZSksXG5cdFx0XHRcdHJlc29sdmVBcGlFbmRwb2ludDogZmFrZS5yZXNvbHZlQXBpRW5kcG9pbnQuYmluZChmYWtlKSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IENsYXVkZVByb3h5U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgd3JhcHBlZCk7XG5cdFx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0KFRPS0VOKTtcblxuXHRcdFx0Y29uc3QgaW5mbGlnaHQgPSBmZXRjaEpzb24oYCR7aGFuZGxlLmJhc2VVcmx9L3YxL21lc3NhZ2VzYCwge1xuXHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdCdBdXRob3JpemF0aW9uJzogYEJlYXJlciAke2hhbmRsZS5ub25jZX0uc2AsXG5cdFx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ2NsYXVkZS1vcHVzLTQtNicsIG1lc3NhZ2VzOiBbXSwgbWF4X3Rva2VuczogOCB9KSxcblx0XHRcdH0pLmNhdGNoKGVyciA9PiAoeyBhYm9ydGVkOiB0cnVlLCBlcnI6IGVyciBhcyBFcnJvciB9KSk7XG5cblx0XHRcdC8vIFdhaXQgdW50aWwgdXBzdHJlYW0gaGFzIGJlZW4gY2FsbGVkLlxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGkgPSBzZXRJbnRlcnZhbCgoKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHNpZ25hbFNlZW4pIHsgY2xlYXJJbnRlcnZhbChpKTsgcmVzb2x2ZSgpOyB9XG5cdFx0XHRcdH0sIDEwKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRoYW5kbGUuZGlzcG9zZSgpO1xuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGluZmxpZ2h0O1xuXHRcdFx0YXNzZXJ0Lm9rKHNpZ25hbFNlZW4/LmFib3J0ZWQsICdleHBlY3RlZCBhYm9ydCB0byBmaXJlIG9uIGRpc3Bvc2UnKTtcblx0XHRcdC8vIGNvbm5lY3Rpb24gc2hvdWxkIGhhdmUgYmVlbiBkZXN0cm95ZWQ7IHJlc3VsdCBpcyBlaXRoZXIgYW5cblx0XHRcdC8vIGh0dHAgZXJyb3Igb3IgYSBwYXJ0aWFsIHJlc3BvbnNlIFx1MjAxNCBqdXN0IHZlcmlmeSB3ZSBkaWRuJ3QgZ2V0XG5cdFx0XHQvLyBhIDIwMCB3aXRoIGEgYm9keS5cblx0XHRcdHZvaWQgcmVzdWx0O1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUluQixZQUFZLFNBQVM7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0I7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLE9BR007QUFDUCxTQUFTLG9CQUFvQixrQ0FBa0M7QUFDL0QsU0FBUywwQkFBMEI7QUFRbkMsU0FBUyxrQ0FBa0MsUUFBaUMsVUFBbUMsbUJBQWlDO0FBQy9JLFNBQU8sWUFBWSxPQUFPLE1BQU0sT0FBTztBQUN2QyxTQUFPLFlBQVksT0FBTyxZQUFZLFNBQVMsVUFBVTtBQUN6RCxTQUFPLFlBQVksT0FBTyxNQUFNLE1BQU0sU0FBUyxNQUFNLElBQUk7QUFDekQsU0FBTyxHQUFHLE9BQU8sTUFBTSxRQUFRLFdBQVcsR0FBRyxTQUFTLE1BQU0sT0FBTyxJQUFJLGtCQUFrQixFQUFFLEdBQUcsMENBQTBDLE9BQU8sTUFBTSxPQUFPLEVBQUU7QUFDOUosUUFBTSxZQUFZLDJCQUEyQixPQUFPLE1BQU0sT0FBTztBQUNqRSxTQUFPLEdBQUcsV0FB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
