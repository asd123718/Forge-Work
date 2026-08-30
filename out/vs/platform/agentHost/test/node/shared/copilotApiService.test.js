import assert from "assert";
import { Iterable } from "../../../../../base/common/iterator.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { COPILOT_API_ERROR_STATUS_STREAMING, CopilotApiError, CopilotApiService } from "../../../node/shared/copilotApiService.js";
import { createTestGitHubEndpointService } from "../testGitHubEndpointService.js";
import { NullLogService } from "../../../../log/common/log.js";
import product from "../../../../product/common/product.js";
const testProductService = { _serviceBrand: void 0, ...product };
function sseLines(...lines) {
  return new TextEncoder().encode(lines.join("\n") + "\n");
}
function makeSseBody(chunks) {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++]);
      } else {
        controller.close();
      }
    }
  });
}
const collect = Iterable.asyncToArray;
function getUrl(input) {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}
function getText(msg) {
  return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}
function tokenResponse(overrides) {
  return new Response(JSON.stringify({
    token: "copilot-tok-abc",
    expires_at: Date.now() / 1e3 + 3600,
    refresh_in: 1800,
    ...overrides
  }), { status: 200 });
}
function userResponse() {
  return new Response(JSON.stringify({
    endpoints: { api: "https://api.githubcopilot.com" }
  }), { status: 200 });
}
function anthropicResponse(content, stopReason = "end_turn") {
  return new Response(JSON.stringify({
    id: "msg_test",
    type: "message",
    role: "assistant",
    content,
    model: "claude-sonnet-4-5-20250514",
    stop_reason: stopReason,
    usage: { input_tokens: 10, output_tokens: 50 }
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}
function sseResponse(chunks) {
  return new Response(makeSseBody(chunks), {
    status: 200,
    headers: { "Content-Type": "text/event-stream" }
  });
}
function modelsResponse(models) {
  return new Response(JSON.stringify({ data: models }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
function createService(fetchImpl, enterpriseUri) {
  return new CopilotApiService(fetchImpl, new NullLogService(), testProductService, createTestGitHubEndpointService(enterpriseUri));
}
function routingFetch(messageResponse, tokenOverrides) {
  let lastCapture = { url: "", init: void 0 };
  const impl = async (input, init) => {
    const url = getUrl(input);
    if (url.includes("/token") || url.includes("/copilot_internal")) {
      return tokenResponse(tokenOverrides);
    }
    lastCapture = { url, init };
    return messageResponse(lastCapture);
  };
  return { fetch: impl, captured: () => lastCapture };
}
const userMsg = [{ role: "user", content: "hello" }];
const baseRequest = {
  model: "claude-sonnet-4-5",
  messages: userMsg,
  max_tokens: 8192,
  stream: false
};
function streamService(chunks, tokenOverrides) {
  const { fetch: fetchFn } = routingFetch(() => sseResponse(chunks), tokenOverrides);
  return createService(fetchFn);
}
suite("CopilotApiService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("combines internal organizations from the Copilot token with login from user discovery", async () => {
    const service = createService(async (input) => {
      const url = getUrl(input);
      if (url.endsWith("/copilot_internal/user")) {
        return new Response(JSON.stringify({
          login: "octocat",
          copilotignore_enabled: true,
          endpoints: { api: "https://api.githubcopilot.com", telemetry: "https://telemetry.example" }
        }), { status: 200 });
      }
      if (url.includes("/token")) {
        return tokenResponse({
          token: "rt=1;tid=tracking-id",
          organization_list: [
            "a5db0bcaae94032fe715fb34a5e4bce2",
            "551cca60ce19654d894e786220822482"
          ]
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    assert.deepStrictEqual(await service.resolveRestrictedTelemetryContext("gh-token"), {
      restrictedTelemetryEnabled: true,
      trackingId: "tracking-id",
      telemetryEndpoint: "https://telemetry.example",
      isInternal: true,
      userName: "octocat",
      isVscodeTeamMember: true,
      copilotIgnoreEnabled: true
    });
  });
  suite("Endpoint Discovery", () => {
    test("runs endpoint discovery on first request", async () => {
      let mintCount = 0;
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          mintCount++;
          return tokenResponse();
        }
        return anthropicResponse([{ type: "text", text: "hi" }]);
      });
      await service.messages("gh-tok", baseRequest);
      assert.strictEqual(mintCount, 1);
    });
    test("reuses cached endpoint discovery for consecutive calls with same github token", async () => {
      let mintCount = 0;
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          mintCount++;
          return tokenResponse();
        }
        return anthropicResponse([{ type: "text", text: "hi" }]);
      });
      await service.messages("gh-tok", baseRequest);
      await service.messages("gh-tok", baseRequest);
      await service.messages("gh-tok", baseRequest);
      assert.strictEqual(mintCount, 1);
    });
    test("re-discovers endpoints when the github token changes", async () => {
      let mintCount = 0;
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          mintCount++;
          return tokenResponse();
        }
        return anthropicResponse([{ type: "text", text: "hi" }]);
      });
      await service.messages("gh-tok-A", baseRequest);
      await service.messages("gh-tok-B", baseRequest);
      assert.strictEqual(mintCount, 2);
    });
    test("invalidates cached endpoint discovery on 401 from messages so the next call re-discovers", async () => {
      let mintCount = 0;
      let messageCallCount = 0;
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          mintCount++;
          return tokenResponse();
        }
        messageCallCount++;
        if (messageCallCount === 1) {
          return new Response("unauthorized", { status: 401, statusText: "Unauthorized" });
        }
        return anthropicResponse([{ type: "text", text: "ok" }]);
      });
      await assert.rejects(() => service.messages("gh-tok", baseRequest));
      await service.messages("gh-tok", baseRequest);
      assert.strictEqual(mintCount, 2);
    });
    test("invalidates cached endpoint discovery on 403 from models so the next call re-discovers", async () => {
      let mintCount = 0;
      let modelsCallCount = 0;
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          mintCount++;
          return tokenResponse();
        }
        modelsCallCount++;
        if (modelsCallCount === 1) {
          return new Response("forbidden", { status: 403, statusText: "Forbidden" });
        }
        return modelsResponse([]);
      });
      await assert.rejects(() => service.models("gh-tok"));
      await service.models("gh-tok");
      assert.strictEqual(mintCount, 2);
    });
    test("does not re-discover when the cache is still warm for the same token", async () => {
      let mintCount = 0;
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          mintCount++;
          return tokenResponse({ expires_at: Date.now() / 1e3 + 7200 });
        }
        return anthropicResponse([{ type: "text", text: "hi" }]);
      });
      await service.messages("gh-tok", baseRequest);
      await service.messages("gh-tok", baseRequest);
      assert.strictEqual(mintCount, 1);
    });
    test("uses endpoints.api from the /copilot_internal/user response as the CAPI base", async () => {
      const { fetch: fetchFn, captured } = routingFetch(
        () => anthropicResponse([{ type: "text", text: "ok" }]),
        { endpoints: { api: "https://custom.copilot.example.com" } }
      );
      const service = createService(fetchFn);
      await service.messages("gh-tok", baseRequest);
      assert.strictEqual(captured().url, "https://custom.copilot.example.com/v1/messages");
    });
    test("reuses endpoint discovery when resolving GitHub login and Copilot SKU", async () => {
      let discoveryCount = 0;
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal/user")) {
          discoveryCount++;
          return new Response(JSON.stringify({
            login: "octocat",
            access_type_sku: "copilot_for_business_seat",
            endpoints: { api: "https://custom.copilot.example.com" }
          }), { status: 200 });
        }
        throw new Error(`Unexpected URL: ${url}`);
      });
      const apiEndpoint = await service.resolveApiEndpoint("gh-tok");
      const login = await service.resolveUserLogin("gh-tok");
      const copilotSku = await service.resolveCopilotSku("gh-tok");
      assert.deepStrictEqual({ apiEndpoint, login, copilotSku, discoveryCount }, {
        apiEndpoint: "https://custom.copilot.example.com",
        login: "octocat",
        copilotSku: "copilot_for_business_seat",
        discoveryCount: 1
      });
    });
    test("falls back to default API base when endpoints.api is missing", async () => {
      const { fetch: fetchFn, captured } = routingFetch(
        () => anthropicResponse([{ type: "text", text: "ok" }])
      );
      const service = createService(fetchFn);
      await service.messages("gh-tok", baseRequest);
      assert.strictEqual(captured().url, "https://api.githubcopilot.com/v1/messages");
    });
    test("sends the github token as a Bearer Authorization header to the discovery endpoint", async () => {
      let capturedAuthHeader;
      const service = createService(async (input, init) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          const headers = init?.headers;
          capturedAuthHeader = headers?.["Authorization"];
          return tokenResponse();
        }
        return anthropicResponse([{ type: "text", text: "ok" }]);
      });
      await service.messages("my-secret-gh-token", baseRequest);
      assert.strictEqual(capturedAuthHeader, "Bearer my-secret-gh-token");
    });
    test("routes endpoint discovery to the GitHub Enterprise host when configured", async () => {
      let discoveryUrl;
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          discoveryUrl = url;
          return tokenResponse();
        }
        return anthropicResponse([{ type: "text", text: "ok" }]);
      }, "https://acme.ghe.com");
      await service.messages("gh-tok", baseRequest);
      assert.strictEqual(discoveryUrl, "https://api.acme.ghe.com/copilot_internal/user");
    });
    test("preserves authentication errors from endpoint discovery", async () => {
      const service = createService(async () => new Response('{"message":"Bad credentials"}', { status: 401, statusText: "Unauthorized" }));
      await assert.rejects(
        () => service.messages("bad-tok", baseRequest),
        (err) => {
          assert.deepStrictEqual({
            isCopilotApiError: err instanceof CopilotApiError,
            status: err instanceof CopilotApiError ? err.status : void 0,
            message: err.message,
            envelope: err instanceof CopilotApiError ? err.envelope : void 0
          }, {
            isCopilotApiError: true,
            status: 401,
            message: 'Copilot endpoint discovery failed: 401 Unauthorized \u2014 {"message":"Bad credentials"}',
            envelope: {
              type: "error",
              error: {
                type: "api_error",
                message: '{"message":"Bad credentials"}'
              },
              request_id: null
            }
          });
          return true;
        }
      );
    });
    test("throws on 500 from endpoint discovery", async () => {
      const service = createService(async () => new Response("internal error", { status: 500, statusText: "Internal Server Error" }));
      await assert.rejects(
        () => service.messages("gh-tok", baseRequest),
        (err) => err.message.includes("Copilot endpoint discovery failed: 500")
      );
    });
    test("does not double-discover when concurrent requests race on first call", async () => {
      let mintCount = 0;
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          mintCount++;
          await new Promise((r) => setTimeout(r, 10));
          return tokenResponse();
        }
        return anthropicResponse([{ type: "text", text: "ok" }]);
      });
      await Promise.all([
        service.messages("gh-tok", baseRequest),
        service.messages("gh-tok", baseRequest)
      ]);
      assert.strictEqual(mintCount, 1);
    });
    test("in-flight discovery dedup spans concurrent messages + models calls", async () => {
      let mintCount = 0;
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          mintCount++;
          await new Promise((r) => setTimeout(r, 10));
          return tokenResponse();
        }
        if (url.includes("/models")) {
          return modelsResponse([]);
        }
        return anthropicResponse([{ type: "text", text: "ok" }]);
      });
      await Promise.all([
        service.messages("gh-tok", baseRequest),
        service.models("gh-tok")
      ]);
      assert.strictEqual(mintCount, 1);
    });
    test("error from endpoint discovery does not include the github token", async () => {
      const service = createService(async () => new Response("forbidden", { status: 403, statusText: "Forbidden" }));
      await assert.rejects(
        () => service.messages("super-secret-gh-token-xyz", baseRequest),
        (err) => !err.message.includes("super-secret-gh-token-xyz")
      );
    });
    test("error from CAPI does not include the github token", async () => {
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          return tokenResponse({ token: "super-secret-copilot-token-xyz" });
        }
        return new Response("rate limited", { status: 429, statusText: "Too Many Requests" });
      });
      await assert.rejects(
        () => service.messages("super-secret-gh-token-xyz", baseRequest),
        (err) => !err.message.includes("super-secret-copilot-token-xyz") && !err.message.includes("super-secret-gh-token-xyz")
      );
    });
    test("discovers independently for concurrent requests with different github tokens", async () => {
      const minted = [];
      const service = createService(async (input, init) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          const auth = init?.headers?.["Authorization"] ?? "";
          minted.push(auth);
          await new Promise((r) => setTimeout(r, 10));
          return tokenResponse();
        }
        return anthropicResponse([{ type: "text", text: "ok" }]);
      });
      await Promise.all([
        service.messages("gh-tok-A", baseRequest),
        service.messages("gh-tok-B", baseRequest)
      ]);
      assert.strictEqual(minted.length, 2);
      assert.ok(minted.some((h) => h.includes("gh-tok-A")));
      assert.ok(minted.some((h) => h.includes("gh-tok-B")));
    });
    suite("CAPI URL override (VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE)", () => {
      const ENV = "VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE";
      const SMOKE_TEST_ENV = "VSCODE_SMOKE_TEST_PROXY_HEADER";
      let saved;
      let savedSmokeTestEnv;
      setup(() => {
        saved = process.env[ENV];
        savedSmokeTestEnv = process.env[SMOKE_TEST_ENV];
        delete process.env[SMOKE_TEST_ENV];
      });
      teardown(() => {
        if (saved === void 0) {
          delete process.env[ENV];
        } else {
          process.env[ENV] = saved;
        }
        if (savedSmokeTestEnv === void 0) {
          delete process.env[SMOKE_TEST_ENV];
        } else {
          process.env[SMOKE_TEST_ENV] = savedSmokeTestEnv;
        }
      });
      test("a loopback override skips discovery and routes CAPI at the override", async () => {
        process.env[ENV] = "http://127.0.0.1:12345";
        let discoveryHit = false;
        const service = createService(async (input) => {
          const url = getUrl(input);
          if (url.includes("/copilot_internal")) {
            discoveryHit = true;
            return tokenResponse();
          }
          return anthropicResponse([{ type: "text", text: "ok" }]);
        });
        await service.messages("gh-secret", baseRequest);
        assert.strictEqual(discoveryHit, false, "discovery must be skipped for a loopback override");
      });
      test("the reserved smoke-test host skips discovery only with the proxy marker", async () => {
        process.env[ENV] = "http://vscode-smoke.test:12345";
        process.env[SMOKE_TEST_ENV] = "test-marker";
        let discoveryHit = false;
        const service = createService(async (input) => {
          const url = getUrl(input);
          if (url.includes("/copilot_internal")) {
            discoveryHit = true;
            return tokenResponse();
          }
          return anthropicResponse([{ type: "text", text: "ok" }]);
        });
        await service.messages("gh-secret", baseRequest);
        assert.strictEqual(discoveryHit, false, "the smoke-test override must skip endpoint discovery");
      });
      test("a non-loopback override is ignored and normal discovery runs (no token leak)", async () => {
        process.env[ENV] = "https://evil.example.com";
        process.env[SMOKE_TEST_ENV] = "test-marker";
        let discoveryHit = false;
        const service = createService(async (input) => {
          const url = getUrl(input);
          if (url.includes("/copilot_internal")) {
            discoveryHit = true;
            return tokenResponse();
          }
          return anthropicResponse([{ type: "text", text: "ok" }]);
        });
        await service.messages("gh-secret", baseRequest);
        assert.strictEqual(discoveryHit, true, "a non-loopback override must be ignored so the token is never sent to it");
      });
    });
  });
  suite("Request Format", () => {
    test("sends system as a top-level text-block array", async () => {
      const { fetch: fetchFn, captured } = routingFetch(
        () => anthropicResponse([{ type: "text", text: "ok" }])
      );
      const service = createService(fetchFn);
      await service.messages("gh-tok", { ...baseRequest, system: "You are helpful." });
      const body = JSON.parse(captured().init?.body);
      assert.deepStrictEqual(body.system, [{ type: "text", text: "You are helpful." }]);
    });
    test("omits system field entirely when not provided", async () => {
      const { fetch: fetchFn, captured } = routingFetch(
        () => anthropicResponse([{ type: "text", text: "ok" }])
      );
      const service = createService(fetchFn);
      await service.messages("gh-tok", baseRequest);
      const body = JSON.parse(captured().init?.body);
      assert.strictEqual(body.system, void 0);
    });
    test("sends max_tokens in the body", async () => {
      const { fetch: fetchFn, captured } = routingFetch(
        () => anthropicResponse([{ type: "text", text: "ok" }])
      );
      const service = createService(fetchFn);
      await service.messages("gh-tok", { ...baseRequest, max_tokens: 8192 });
      const body = JSON.parse(captured().init?.body);
      assert.strictEqual(body.max_tokens, 8192);
    });
    test("sends utility maxTokens as max_tokens in the body", async () => {
      let capturedBody;
      const service = createService(async (input, init) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          return tokenResponse();
        }
        if (url.endsWith("/models")) {
          return modelsResponse([{ id: "gpt-4o-mini-model", capabilities: { family: "gpt-4o-mini" } }]);
        }
        capturedBody = init?.body;
        return new Response(JSON.stringify({ choices: [{ message: { content: "Generated title" } }] }), { status: 200 });
      });
      await service.utilityChatCompletion("gh-tok", {
        messages: [{ role: "user", content: "Generate a title" }],
        maxTokens: 32
      });
      assert.strictEqual(JSON.parse(capturedBody ?? "{}").max_tokens, 32);
    });
    test("uses the GitHub OAuth token directly for utility completions", async () => {
      const requests = [];
      const service = createService(async (input, init) => {
        const url = getUrl(input);
        requests.push({ url, authorization: init?.headers?.["Authorization"] });
        if (url.endsWith("/models")) {
          return modelsResponse([{ id: "gpt-4o-mini-model", capabilities: { family: "gpt-4o-mini" } }]);
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: "Generated title" } }] }), { status: 200 });
      });
      await service.utilityChatCompletion("gh-oauth-token", {
        messages: [{ role: "user", content: "Generate a title" }]
      });
      assert.deepStrictEqual(requests.map((request) => ({
        path: new URL(request.url).pathname,
        authorization: request.authorization
      })), [
        { path: "/copilot_internal/user", authorization: "Bearer gh-oauth-token" },
        { path: "/models", authorization: "Bearer gh-oauth-token" },
        { path: "/chat/completions", authorization: "Bearer gh-oauth-token" }
      ]);
    });
    test("utility auth failure rediscovers endpoints and utility model", async () => {
      let userCount = 0;
      let modelsCount = 0;
      let completionCount = 0;
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.endsWith("/copilot_internal/user")) {
          userCount++;
          return userResponse();
        }
        if (url.endsWith("/models")) {
          modelsCount++;
          return modelsResponse([{ id: "gpt-4o-mini-model", capabilities: { family: "gpt-4o-mini" } }]);
        }
        completionCount++;
        return completionCount === 1 ? new Response("Unauthorized", { status: 401, statusText: "Unauthorized" }) : new Response(JSON.stringify({ choices: [{ message: { content: "Generated title" } }] }), { status: 200 });
      });
      const request = { messages: [{ role: "user", content: "Generate a title" }] };
      await assert.rejects(() => service.utilityChatCompletion("gh-oauth-token", request));
      await service.utilityChatCompletion("gh-oauth-token", request);
      assert.deepStrictEqual({ userCount, modelsCount, completionCount }, {
        userCount: 2,
        modelsCount: 2,
        completionCount: 2
      });
    });
    test("non-streaming sends stream=false in the body", async () => {
      const { fetch: fetchFn, captured } = routingFetch(
        () => anthropicResponse([{ type: "text", text: "ok" }])
      );
      const service = createService(fetchFn);
      await service.messages("gh-tok", baseRequest);
      const body = JSON.parse(captured().init?.body);
      assert.strictEqual(body.stream, false);
    });
    test("defaults to non-streaming when stream is omitted", async () => {
      const { fetch: fetchFn, captured } = routingFetch(
        () => anthropicResponse([{ type: "text", text: "ok" }])
      );
      const service = createService(fetchFn);
      await service.messages("gh-tok", baseRequest);
      const body = JSON.parse(captured().init?.body);
      assert.strictEqual(body.stream, false);
    });
    test("streaming sends stream=true in the body", async () => {
      const { fetch: fetchFn, captured } = routingFetch(
        () => sseResponse([sseLines('data: {"type":"message_stop"}')])
      );
      const service = createService(fetchFn);
      await collect(service.messages("gh-tok", { ...baseRequest, stream: true }));
      const body = JSON.parse(captured().init?.body);
      assert.strictEqual(body.stream, true);
    });
    test("sends correct CAPI headers", async () => {
      const { fetch: fetchFn, captured } = routingFetch(
        () => anthropicResponse([{ type: "text", text: "ok" }])
      );
      const service = createService(fetchFn);
      await service.messages("gh-tok", baseRequest);
      const headers = captured().init?.headers;
      assert.strictEqual(headers["Content-Type"], "application/json");
      assert.strictEqual(headers["Authorization"], "Bearer gh-tok");
      assert.strictEqual(headers["OpenAI-Intent"], "messages-proxy");
      assert.strictEqual(headers["X-Interaction-Type"], "messages-proxy");
      assert.ok(headers["X-Request-Id"], "should have a request id");
      assert.ok(headers["X-GitHub-Api-Version"], "CAPIClient should inject API version");
      assert.ok(headers["VScode-SessionId"], "CAPIClient should inject session id");
    });
    test("passes messages through as-is", async () => {
      const { fetch: fetchFn, captured } = routingFetch(
        () => anthropicResponse([{ type: "text", text: "ok" }])
      );
      const service = createService(fetchFn);
      const messages = [
        { role: "user", content: "What is 2+2?" },
        { role: "assistant", content: "4" },
        { role: "user", content: "Thanks!" }
      ];
      await service.messages("gh-tok", { ...baseRequest, messages });
      const body = JSON.parse(captured().init?.body);
      assert.deepStrictEqual(body.messages, messages);
    });
    test("sends model in the body", async () => {
      const { fetch: fetchFn, captured } = routingFetch(
        () => anthropicResponse([{ type: "text", text: "ok" }])
      );
      const service = createService(fetchFn);
      await service.messages("gh-tok", { ...baseRequest, model: "claude-opus-4-1-20250805" });
      const body = JSON.parse(captured().init?.body);
      assert.strictEqual(body.model, "claude-opus-4-1-20250805");
    });
    test("merges caller-provided headers into the request", async () => {
      const { fetch: fetchFn, captured } = routingFetch(
        () => anthropicResponse([{ type: "text", text: "ok" }])
      );
      const service = createService(fetchFn);
      await service.messages("gh-tok", baseRequest, {
        headers: { "X-Custom-Trace": "abc-123", "X-Session-Id": "sess-456" }
      });
      const headers = captured().init?.headers;
      assert.strictEqual(headers["X-Custom-Trace"], "abc-123");
      assert.strictEqual(headers["X-Session-Id"], "sess-456");
      assert.strictEqual(headers["Authorization"], "Bearer gh-tok", "standard headers should not be overridden");
    });
    test("caller-supplied headers cannot override security-sensitive standard headers", async () => {
      const { fetch: fetchFn, captured } = routingFetch(
        () => anthropicResponse([{ type: "text", text: "ok" }])
      );
      const service = createService(fetchFn);
      await service.messages("gh-tok", baseRequest, {
        headers: {
          "Authorization": "Bearer attacker-token",
          "Content-Type": "text/plain",
          "X-Request-Id": "attacker-id",
          "OpenAI-Intent": "attacker-intent"
        }
      });
      const headers = captured().init?.headers;
      assert.strictEqual(headers["Authorization"], "Bearer gh-tok");
      assert.strictEqual(headers["Content-Type"], "application/json");
      assert.notStrictEqual(headers["X-Request-Id"], "attacker-id");
      assert.strictEqual(headers["OpenAI-Intent"], "messages-proxy");
    });
    test("suppressIntegrationId opt-in controls the Copilot-Integration-Id header", async () => {
      const { fetch: fetchFn, captured } = routingFetch(
        () => anthropicResponse([{ type: "text", text: "ok" }])
      );
      const service = createService(fetchFn);
      await service.messages("gh-tok", baseRequest);
      const withHeader = captured().init?.headers;
      await service.messages("gh-tok", baseRequest, { suppressIntegrationId: true });
      const suppressed = captured().init?.headers;
      assert.ok(withHeader["Copilot-Integration-Id"], "integration id should be present by default");
      assert.strictEqual(suppressed["Copilot-Integration-Id"], void 0, "integration id should be suppressed when opted in");
    });
  });
  suite("Non-Streaming Responses", () => {
    test("returns text content from a single text block", async () => {
      const { fetch: fetchFn } = routingFetch(
        () => anthropicResponse([{ type: "text", text: "The answer is 42." }])
      );
      const service = createService(fetchFn);
      const result = await service.messages("gh-tok", baseRequest);
      assert.strictEqual(getText(result), "The answer is 42.");
    });
    test("concatenates multiple text blocks", async () => {
      const { fetch: fetchFn } = routingFetch(
        () => anthropicResponse([
          { type: "text", text: "First part. " },
          { type: "text", text: "Second part." }
        ])
      );
      const service = createService(fetchFn);
      const result = await service.messages("gh-tok", baseRequest);
      assert.strictEqual(getText(result), "First part. Second part.");
    });
    test("skips non-text content blocks (tool_use, thinking)", async () => {
      const { fetch: fetchFn } = routingFetch(
        () => anthropicResponse([
          { type: "thinking", text: "let me think..." },
          { type: "text", text: "the answer" },
          { type: "tool_use" }
        ])
      );
      const service = createService(fetchFn);
      const result = await service.messages("gh-tok", baseRequest);
      assert.strictEqual(getText(result), "the answer");
    });
    test("returns empty string when no text blocks are present", async () => {
      const { fetch: fetchFn } = routingFetch(
        () => anthropicResponse([{ type: "tool_use" }])
      );
      const service = createService(fetchFn);
      const result = await service.messages("gh-tok", baseRequest);
      assert.strictEqual(getText(result), "");
    });
    test("returns the stop reason", async () => {
      const { fetch: fetchFn } = routingFetch(
        () => anthropicResponse([{ type: "text", text: "ok" }], "max_tokens")
      );
      const service = createService(fetchFn);
      const result = await service.messages("gh-tok", baseRequest);
      assert.strictEqual(result.stop_reason, "max_tokens");
    });
    test("stop_reason is null when missing from server response", async () => {
      const { fetch: fetchFn } = routingFetch(() => {
        return new Response(JSON.stringify({
          content: [{ type: "text", text: "ok" }]
        }), { status: 200 });
      });
      const service = createService(fetchFn);
      const result = await service.messages("gh-tok", baseRequest);
      assert.strictEqual(result.stop_reason ?? null, null);
    });
    test("throws on 429 rate limit", async () => {
      const { fetch: fetchFn } = routingFetch(
        () => new Response('{"error":"rate_limited"}', { status: 429, statusText: "Too Many Requests" })
      );
      const service = createService(fetchFn);
      await assert.rejects(
        () => service.messages("gh-tok", baseRequest),
        (err) => err instanceof CopilotApiError && err.status === 429 && err.message.includes("CAPI request failed: 429")
      );
    });
    test("throws on 500 server error", async () => {
      const { fetch: fetchFn } = routingFetch(
        () => new Response("internal server error", { status: 500, statusText: "Internal Server Error" })
      );
      const service = createService(fetchFn);
      await assert.rejects(
        () => service.messages("gh-tok", baseRequest),
        (err) => err instanceof CopilotApiError && err.status === 500 && err.message.includes("CAPI request failed: 500")
      );
    });
  });
  suite("Streaming Responses", () => {
    function collectTextDeltas(events) {
      return events.filter((e) => e.type === "content_block_delta" && e.delta.type === "text_delta").map((e) => e.delta.text);
    }
    test("yields text deltas from content_block_delta events", async () => {
      const service = streamService([
        sseLines(
          "event: content_block_delta",
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
          "",
          "event: content_block_delta",
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" world"}}'
        ),
        sseLines(
          "event: message_stop",
          'data: {"type":"message_stop"}'
        )
      ]);
      const events = await collect(service.messages("gh-tok", { ...baseRequest, stream: true }));
      assert.deepStrictEqual(collectTextDeltas(events), ["Hello", " world"]);
    });
    test("handles data split across multiple network chunks", async () => {
      const encoder = new TextEncoder();
      const service = streamService([
        encoder.encode('event: content_block_delta\ndata: {"type":"content_bl'),
        encoder.encode('ock_delta","index":0,"delta":{"type":"text_delta","text":"split"}}\n'),
        sseLines(
          "event: message_stop",
          'data: {"type":"message_stop"}'
        )
      ]);
      const events = await collect(service.messages("gh-tok", { ...baseRequest, stream: true }));
      assert.deepStrictEqual(collectTextDeltas(events), ["split"]);
    });
    test("handles a data line split right at the newline boundary", async () => {
      const encoder = new TextEncoder();
      const service = streamService([
        encoder.encode('data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"chunk1"}}'),
        encoder.encode('\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"chunk2"}}\n'),
        sseLines('data: {"type":"message_stop"}')
      ]);
      const events = await collect(service.messages("gh-tok", { ...baseRequest, stream: true }));
      assert.deepStrictEqual(collectTextDeltas(events), ["chunk1", "chunk2"]);
    });
    test("skips event: lines, comment lines, and blank lines", async () => {
      const service = streamService([
        sseLines(
          ": keep-alive comment",
          "event: content_block_delta",
          "",
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}',
          "",
          "event: message_stop",
          'data: {"type":"message_stop"}'
        )
      ]);
      const events = await collect(service.messages("gh-tok", { ...baseRequest, stream: true }));
      assert.deepStrictEqual(collectTextDeltas(events), ["ok"]);
    });
    test("handles many small deltas", async () => {
      const deltas = Array.from(
        { length: 100 },
        (_, i) => `data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"w${i}"}}`
      );
      const service = streamService([
        sseLines(...deltas),
        sseLines('data: {"type":"message_stop"}')
      ]);
      const texts = collectTextDeltas(await collect(service.messages("gh-tok", { ...baseRequest, stream: true })));
      assert.strictEqual(texts.length, 100);
      assert.strictEqual(texts[0], "w0");
      assert.strictEqual(texts[99], "w99");
    });
    test("throws on error event with message", async () => {
      const service = streamService([
        sseLines(
          "event: error",
          'data: {"type":"error","error":{"message":"overloaded"}}'
        )
      ]);
      await assert.rejects(
        () => collect(service.messages("gh-tok", { ...baseRequest, stream: true })),
        (err) => err instanceof CopilotApiError && err.status === COPILOT_API_ERROR_STATUS_STREAMING && err.message === "overloaded"
      );
    });
    test("throws on error event without message", async () => {
      const service = streamService([
        sseLines(
          "event: error",
          'data: {"type":"error","error":{}}'
        )
      ]);
      await assert.rejects(
        () => collect(service.messages("gh-tok", { ...baseRequest, stream: true })),
        (err) => err instanceof CopilotApiError && err.status === COPILOT_API_ERROR_STATUS_STREAMING && err.message === "Unknown streaming error"
      );
    });
    test("throws on non-200 CAPI response", async () => {
      const { fetch: fetchFn } = routingFetch(
        () => new Response("overloaded", { status: 529, statusText: "Overloaded" })
      );
      const service = createService(fetchFn);
      await assert.rejects(
        () => collect(service.messages("gh-tok", { ...baseRequest, stream: true })),
        (err) => err instanceof CopilotApiError && err.status === 529 && err.message.includes("CAPI request failed: 529")
      );
    });
    test("throws when response has no body", async () => {
      const { fetch: fetchFn } = routingFetch(
        () => new Response(null, { status: 200 })
      );
      const service = createService(fetchFn);
      await assert.rejects(
        () => collect(service.messages("gh-tok", { ...baseRequest, stream: true })),
        (err) => err.message.includes("no body")
      );
    });
    test("survives malformed JSON in the stream (skips the line)", async () => {
      const service = streamService([
        sseLines(
          "data: not-valid-json",
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}',
          'data: {"type":"message_stop"}'
        )
      ]);
      const events = await collect(service.messages("gh-tok", { ...baseRequest, stream: true }));
      assert.deepStrictEqual(collectTextDeltas(events), ["ok"]);
    });
  });
  suite("Raw Event Stream (messages())", () => {
    test("yields all six protocol event types in order", async () => {
      const service = streamService([
        sseLines(
          'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5","stop_reason":null,"usage":{"input_tokens":1,"output_tokens":1}}}',
          'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}',
          'data: {"type":"content_block_stop","index":0}',
          'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}',
          'data: {"type":"message_stop"}'
        )
      ]);
      const events = await collect(service.messages("gh-tok", { ...baseRequest, stream: true }));
      assert.deepStrictEqual(events.map((e) => e.type), [
        "message_start",
        "content_block_start",
        "content_block_delta",
        "content_block_stop",
        "message_delta",
        "message_stop"
      ]);
    });
    test("message_stop is the last yielded event", async () => {
      const service = streamService([
        sseLines(
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"a"}}',
          'data: {"type":"message_stop"}'
        )
      ]);
      const events = await collect(service.messages("gh-tok", { ...baseRequest, stream: true }));
      assert.strictEqual(events.length, 2);
      assert.strictEqual(events[events.length - 1].type, "message_stop");
    });
    test("stops after message_stop even if extra SSE data follows", async () => {
      const service = streamService([
        sseLines(
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"a"}}',
          'data: {"type":"message_stop"}',
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"SHOULD_NOT_APPEAR"}}'
        )
      ]);
      const events = await collect(service.messages("gh-tok", { ...baseRequest, stream: true }));
      const texts = events.filter((e) => e.type === "content_block_delta").map((e) => e.delta.type === "text_delta" ? e.delta.text : "");
      assert.deepStrictEqual(texts, ["a"]);
    });
    test("yields thinking_delta events (not filtered by messages())", async () => {
      const service = streamService([
        sseLines(
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"hmm"}}',
          'data: {"type":"message_stop"}'
        )
      ]);
      const events = await collect(service.messages("gh-tok", { ...baseRequest, stream: true }));
      const delta = events.find((e) => e.type === "content_block_delta");
      assert.ok(delta);
      assert.strictEqual(delta.delta.type, "thinking_delta");
    });
    test("yields input_json_delta events", async () => {
      const service = streamService([
        sseLines(
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"k\\":1}"}}',
          'data: {"type":"message_stop"}'
        )
      ]);
      const events = await collect(service.messages("gh-tok", { ...baseRequest, stream: true }));
      const delta = events.find((e) => e.type === "content_block_delta");
      assert.ok(delta);
      assert.strictEqual(delta.delta.type, "input_json_delta");
    });
    test("yields message_delta with stop_reason payload", async () => {
      const service = streamService([
        sseLines(
          'data: {"type":"message_delta","delta":{"stop_reason":"max_tokens","stop_sequence":null},"usage":{"output_tokens":7}}',
          'data: {"type":"message_stop"}'
        )
      ]);
      const events = await collect(service.messages("gh-tok", { ...baseRequest, stream: true }));
      const msgDelta = events.find((e) => e.type === "message_delta");
      assert.ok(msgDelta);
      assert.strictEqual(msgDelta.delta.stop_reason, "max_tokens");
    });
    test("tool_use block events round-trip through messages()", async () => {
      const service = streamService([
        sseLines(
          'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tu_1","name":"read_file","input":{}}}',
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":"}}',
          'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"/tmp/x\\"}"}}',
          'data: {"type":"content_block_stop","index":0}',
          'data: {"type":"message_stop"}'
        )
      ]);
      const events = await collect(service.messages("gh-tok", { ...baseRequest, stream: true }));
      const blockStart = events.find((e) => e.type === "content_block_start");
      assert.ok(blockStart, "expected content_block_start event");
      assert.strictEqual(blockStart.content_block.type, "tool_use");
      assert.strictEqual(blockStart.content_block.name, "read_file");
      const jsonDeltas = events.filter(
        (e) => e.type === "content_block_delta" && e.delta.type === "input_json_delta"
      );
      assert.strictEqual(jsonDeltas.length, 2);
      assert.strictEqual(events[events.length - 1].type, "message_stop");
    });
  });
  suite("countTokens", () => {
    test('throws "countTokens not supported by CAPI"', async () => {
      const service = createService(async () => new Response("{}", { status: 200 }));
      await assert.rejects(
        () => service.countTokens("gh-tok", { model: "claude-sonnet-4-5", messages: [{ role: "user", content: "hi" }] }),
        (err) => err.message.includes("countTokens not supported by CAPI")
      );
    });
    test("does not mint a token before throwing", async () => {
      let mintCount = 0;
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          mintCount++;
          return tokenResponse();
        }
        return new Response("{}", { status: 200 });
      });
      await assert.rejects(
        () => service.countTokens("gh-tok", { model: "claude-sonnet-4-5", messages: [{ role: "user", content: "hi" }] })
      );
      assert.strictEqual(mintCount, 0);
    });
  });
  suite("Shared Behavior", () => {
    test("streaming and non-streaming hit the same /v1/messages endpoint", async () => {
      const urls = [];
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          return tokenResponse();
        }
        urls.push(url);
        if (urls.length === 1) {
          return anthropicResponse([{ type: "text", text: "ok" }]);
        }
        return sseResponse([sseLines('data: {"type":"message_stop"}')]);
      });
      await service.messages("gh-tok", baseRequest);
      await collect(service.messages("gh-tok", { ...baseRequest, stream: true }));
      assert.strictEqual(urls.length, 2);
      assert.ok(urls[0].endsWith("/v1/messages"));
      assert.ok(urls[1].endsWith("/v1/messages"));
    });
    test("both modes share the same cached copilot token", async () => {
      let mintCount = 0;
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          mintCount++;
          return tokenResponse();
        }
        return anthropicResponse([{ type: "text", text: "ok" }]);
      });
      await service.messages("gh-tok", baseRequest);
      await service.messages("gh-tok", baseRequest);
      assert.strictEqual(mintCount, 1);
    });
  });
  suite("CopilotApiError contract", () => {
    async function captureCopilotApiError(promise) {
      try {
        await promise;
      } catch (err) {
        assert.ok(err instanceof CopilotApiError, `expected CopilotApiError, got: ${err instanceof Error ? err.message : String(err)}`);
        return err;
      }
      assert.fail("expected to throw CopilotApiError");
    }
    test("non-2xx with conforming Anthropic envelope: passthrough verbatim", async () => {
      const upstreamEnvelope = {
        type: "error",
        error: { type: "rate_limit_error", message: "You are sending requests too fast." },
        request_id: "req_abc"
      };
      const { fetch: fetchFn } = routingFetch(
        () => new Response(JSON.stringify(upstreamEnvelope), { status: 429, statusText: "Too Many Requests" })
      );
      const service = createService(fetchFn);
      const err = await captureCopilotApiError(service.messages("gh-tok", baseRequest));
      assert.deepStrictEqual(
        { status: err.status, envelope: err.envelope },
        { status: 429, envelope: upstreamEnvelope }
      );
    });
    test("non-2xx with non-Anthropic JSON body: synthesizes api_error envelope", async () => {
      const { fetch: fetchFn } = routingFetch(
        () => new Response('{"error":"rate_limited"}', { status: 429, statusText: "Too Many Requests" })
      );
      const service = createService(fetchFn);
      const err = await captureCopilotApiError(service.messages("gh-tok", baseRequest));
      assert.deepStrictEqual(
        { status: err.status, envelope: err.envelope },
        {
          status: 429,
          envelope: {
            type: "error",
            error: { type: "api_error", message: '{"error":"rate_limited"}' },
            request_id: null
          }
        }
      );
    });
    test("non-2xx with plain-text body: synthesizes api_error envelope using body", async () => {
      const { fetch: fetchFn } = routingFetch(
        () => new Response("internal server error", { status: 500, statusText: "Internal Server Error" })
      );
      const service = createService(fetchFn);
      const err = await captureCopilotApiError(service.messages("gh-tok", baseRequest));
      assert.deepStrictEqual(
        { status: err.status, envelope: err.envelope },
        {
          status: 500,
          envelope: {
            type: "error",
            error: { type: "api_error", message: "internal server error" },
            request_id: null
          }
        }
      );
    });
    test("non-2xx with empty body: synthesizes api_error envelope using status text", async () => {
      const { fetch: fetchFn } = routingFetch(
        () => new Response("", { status: 502, statusText: "Bad Gateway" })
      );
      const service = createService(fetchFn);
      const err = await captureCopilotApiError(service.messages("gh-tok", baseRequest));
      assert.deepStrictEqual(
        { status: err.status, envelope: err.envelope },
        {
          status: 502,
          envelope: {
            type: "error",
            error: { type: "api_error", message: "502 Bad Gateway" },
            request_id: null
          }
        }
      );
    });
    test("SSE error frame with full envelope: passthrough type and message", async () => {
      const service = streamService([
        sseLines(
          "event: error",
          'data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"},"request_id":"req_42"}'
        )
      ]);
      const err = await captureCopilotApiError(
        collect(service.messages("gh-tok", { ...baseRequest, stream: true }))
      );
      assert.deepStrictEqual(
        { status: err.status, envelope: err.envelope },
        {
          status: COPILOT_API_ERROR_STATUS_STREAMING,
          envelope: {
            type: "error",
            error: { type: "overloaded_error", message: "Overloaded" },
            request_id: "req_42"
          }
        }
      );
    });
    test("SSE error frame missing type: defaults to api_error", async () => {
      const service = streamService([
        sseLines(
          "event: error",
          'data: {"type":"error","error":{"message":"oh no"}}'
        )
      ]);
      const err = await captureCopilotApiError(
        collect(service.messages("gh-tok", { ...baseRequest, stream: true }))
      );
      assert.deepStrictEqual(err.envelope, {
        type: "error",
        error: { type: "api_error", message: "oh no" },
        request_id: null
      });
    });
    test('SSE error frame missing message: defaults to "Unknown streaming error"', async () => {
      const service = streamService([
        sseLines(
          "event: error",
          'data: {"type":"error","error":{"type":"api_error"}}'
        )
      ]);
      const err = await captureCopilotApiError(
        collect(service.messages("gh-tok", { ...baseRequest, stream: true }))
      );
      assert.deepStrictEqual(err.envelope, {
        type: "error",
        error: { type: "api_error", message: "Unknown streaming error" },
        request_id: null
      });
    });
    test("SSE error frame with conforming envelope is preserved verbatim (extra fields propagate)", async () => {
      const service = streamService([
        sseLines(
          "event: error",
          'data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded","request_id":"req_xyz"}}'
        )
      ]);
      const err = await captureCopilotApiError(
        collect(service.messages("gh-tok", { ...baseRequest, stream: true }))
      );
      assert.deepStrictEqual(err.envelope, {
        type: "error",
        error: { type: "overloaded_error", message: "Overloaded", request_id: "req_xyz" }
      });
    });
    test("SSE error frame with unstructured-string error: uses the string as message", async () => {
      const service = streamService([
        sseLines(
          "event: error",
          'data: {"type":"error","error":"rate_limited"}'
        )
      ]);
      const err = await captureCopilotApiError(
        collect(service.messages("gh-tok", { ...baseRequest, stream: true }))
      );
      assert.deepStrictEqual(err.envelope, {
        type: "error",
        error: { type: "api_error", message: "rate_limited" },
        request_id: null
      });
    });
    test("models() non-2xx throws typed error with synthesized envelope", async () => {
      const { fetch: fetchFn } = routingFetch(
        () => new Response("upstream down", { status: 503, statusText: "Service Unavailable" })
      );
      const service = createService(fetchFn);
      const err = await captureCopilotApiError(service.models("gh-tok"));
      assert.deepStrictEqual(
        { status: err.status, envelope: err.envelope },
        {
          status: 503,
          envelope: {
            type: "error",
            error: { type: "api_error", message: "upstream down" },
            request_id: null
          }
        }
      );
      assert.ok(err.message.includes("CAPI models request failed: 503"));
    });
    test("models() non-2xx with conforming Anthropic envelope: passthrough verbatim", async () => {
      const upstreamEnvelope = {
        type: "error",
        error: { type: "authentication_error", message: "Invalid token." },
        request_id: "req_def"
      };
      const { fetch: fetchFn } = routingFetch(
        () => new Response(JSON.stringify(upstreamEnvelope), { status: 401, statusText: "Unauthorized" })
      );
      const service = createService(fetchFn);
      const err = await captureCopilotApiError(service.models("gh-tok"));
      assert.deepStrictEqual(
        { status: err.status, envelope: err.envelope },
        { status: 401, envelope: upstreamEnvelope }
      );
    });
    test("error message never embeds auth tokens", async () => {
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          return tokenResponse({ token: "super-secret-copilot-token-xyz" });
        }
        return new Response("rate limited", { status: 429, statusText: "Too Many Requests" });
      });
      const err = await captureCopilotApiError(service.messages("super-secret-gh-token-xyz", baseRequest));
      const serialized = JSON.stringify({ message: err.message, envelope: err.envelope });
      assert.ok(!serialized.includes("super-secret-copilot-token-xyz"));
      assert.ok(!serialized.includes("super-secret-gh-token-xyz"));
    });
    test("401 still invalidates the cached token (regression)", async () => {
      let mintCount = 0;
      let next401 = true;
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          mintCount++;
          return tokenResponse();
        }
        if (next401) {
          next401 = false;
          return new Response("unauthorized", { status: 401, statusText: "Unauthorized" });
        }
        return anthropicResponse([{ type: "text", text: "ok" }]);
      });
      await captureCopilotApiError(service.messages("gh-tok", baseRequest));
      await service.messages("gh-tok", baseRequest);
      assert.strictEqual(mintCount, 2);
    });
  });
  suite("Cancellation", () => {
    test("forwards AbortSignal to fetch for messages", async () => {
      const controller = new AbortController();
      let capturedSignal;
      const service = createService(async (input, init) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          return tokenResponse();
        }
        capturedSignal = init?.signal;
        return anthropicResponse([{ type: "text", text: "ok" }]);
      });
      await service.messages("gh-tok", baseRequest, { signal: controller.signal });
      assert.strictEqual(capturedSignal, controller.signal);
    });
    test("forwards AbortSignal to fetch for models", async () => {
      const controller = new AbortController();
      let capturedSignal;
      const service = createService(async (input, init) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          return tokenResponse();
        }
        capturedSignal = init?.signal;
        return modelsResponse([]);
      });
      await service.models("gh-tok", { signal: controller.signal });
      assert.strictEqual(capturedSignal, controller.signal);
    });
    test("does not forward AbortSignal to the shared token mint fetch", async () => {
      const controller = new AbortController();
      let mintSignal;
      const service = createService(async (input, init) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          mintSignal = init?.signal;
          return tokenResponse();
        }
        return anthropicResponse([{ type: "text", text: "ok" }]);
      });
      await service.messages("gh-tok", baseRequest, { signal: controller.signal });
      assert.strictEqual(mintSignal, void 0);
    });
    test("cancels the underlying SSE stream when the consumer breaks early", async () => {
      let cancelled = false;
      const body = new ReadableStream({
        pull(controller) {
          controller.enqueue(sseLines(
            'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}'
          ));
        },
        cancel() {
          cancelled = true;
        }
      });
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          return tokenResponse();
        }
        return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
      });
      const iter = service.messages("gh-tok", { ...baseRequest, stream: true });
      for await (const _ of iter) {
        break;
      }
      assert.strictEqual(cancelled, true);
    });
    test("cancels the underlying SSE stream after message_stop terminates the generator", async () => {
      let cancelled = false;
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(sseLines(
            'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}',
            'data: {"type":"message_stop"}'
          ));
        },
        cancel() {
          cancelled = true;
        }
      });
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          return tokenResponse();
        }
        return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
      });
      await collect(service.messages("gh-tok", { ...baseRequest, stream: true }));
      assert.strictEqual(cancelled, true);
    });
    test("cancels the underlying SSE stream when the generator throws", async () => {
      let cancelled = false;
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(sseLines(
            'data: {"type":"error","error":{"message":"boom"}}'
          ));
        },
        cancel() {
          cancelled = true;
        }
      });
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          return tokenResponse();
        }
        return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
      });
      await assert.rejects(() => collect(service.messages("gh-tok", { ...baseRequest, stream: true })));
      assert.strictEqual(cancelled, true);
    });
  });
  suite("Models", () => {
    test("returns models from the data array", async () => {
      const fakeModels = [
        { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", vendor: "anthropic", supported_endpoints: ["chat/messages"] },
        { id: "claude-opus-4", name: "Claude Opus 4", vendor: "anthropic", supported_endpoints: ["chat/messages"] }
      ];
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          return tokenResponse();
        }
        return modelsResponse(fakeModels);
      });
      const result = await service.models("gh-tok");
      assert.deepStrictEqual(result, fakeModels);
    });
    test("returns empty array when data is missing", async () => {
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          return tokenResponse();
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });
      const result = await service.models("gh-tok");
      assert.deepStrictEqual(result, []);
    });
    test("sends Bearer token in Authorization header", async () => {
      let capturedAuthHeader;
      const service = createService(async (input, init) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          return tokenResponse();
        }
        capturedAuthHeader = init?.headers?.["Authorization"];
        return modelsResponse([]);
      });
      await service.models("gh-tok");
      assert.strictEqual(capturedAuthHeader, "Bearer gh-tok");
    });
    test("throws on non-200 response", async () => {
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          return tokenResponse();
        }
        return new Response("forbidden", { status: 403, statusText: "Forbidden" });
      });
      await assert.rejects(
        () => service.models("gh-tok"),
        (err) => err instanceof CopilotApiError && err.status === 403 && err.message.includes("CAPI models request failed: 403")
      );
    });
    test("reuses cached token across messages and models calls", async () => {
      let mintCount = 0;
      const service = createService(async (input) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          mintCount++;
          return tokenResponse();
        }
        if (url.includes("/models")) {
          return modelsResponse([]);
        }
        return anthropicResponse([{ type: "text", text: "ok" }]);
      });
      await service.messages("gh-tok", baseRequest);
      await service.models("gh-tok");
      assert.strictEqual(mintCount, 1);
    });
    test("routes to the models endpoint URL", async () => {
      const { fetch: fetchFn, captured } = routingFetch(() => modelsResponse([]));
      const service = createService(fetchFn);
      await service.models("gh-tok");
      assert.ok(captured().url.includes("/models"), `expected models URL, got: ${captured().url}`);
    });
    test("caller-supplied headers cannot override Authorization in models()", async () => {
      let capturedHeaders;
      const service = createService(async (input, init) => {
        const url = getUrl(input);
        if (url.includes("/copilot_internal")) {
          return tokenResponse();
        }
        capturedHeaders = init?.headers;
        return modelsResponse([]);
      });
      await service.models("gh-tok", {
        headers: { "Authorization": "Bearer attacker-token" }
      });
      assert.strictEqual(capturedHeaders?.["Authorization"], "Bearer gh-tok");
    });
    test("suppressIntegrationId opt-in controls the Copilot-Integration-Id header", async () => {
      const { fetch: fetchFn, captured } = routingFetch(() => modelsResponse([]));
      const service = createService(fetchFn);
      await service.models("gh-tok");
      const withHeader = captured().init?.headers;
      await service.models("gh-tok", { suppressIntegrationId: true });
      const suppressed = captured().init?.headers;
      assert.ok(withHeader["Copilot-Integration-Id"], "integration id should be present by default");
      assert.strictEqual(suppressed["Copilot-Integration-Id"], void 0, "integration id should be suppressed when opted in");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxzaGFyZWRcXGNvcGlsb3RBcGlTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgdHlwZSBBbnRocm9waWMgZnJvbSAnQGFudGhyb3BpYy1haS9zZGsnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENPUElMT1RfQVBJX0VSUk9SX1NUQVRVU19TVFJFQU1JTkcsIENvcGlsb3RBcGlFcnJvciwgQ29waWxvdEFwaVNlcnZpY2UsIHR5cGUgRmV0Y2hGdW5jdGlvbiB9IGZyb20gJy4uLy4uLy4uL25vZGUvc2hhcmVkL2NvcGlsb3RBcGlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UgfSBmcm9tICcuLi90ZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5cbi8vICNyZWdpb24gVGVzdCBIZWxwZXJzXG5cbmNvbnN0IHRlc3RQcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlID0geyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIC4uLnByb2R1Y3QgfTtcblxuZnVuY3Rpb24gc3NlTGluZXMoLi4ubGluZXM6IHN0cmluZ1tdKTogVWludDhBcnJheSB7XG5cdHJldHVybiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUobGluZXMuam9pbignXFxuJykgKyAnXFxuJyk7XG59XG5cbmZ1bmN0aW9uIG1ha2VTc2VCb2R5KGNodW5rczogVWludDhBcnJheVtdKTogUmVhZGFibGVTdHJlYW08VWludDhBcnJheT4ge1xuXHRsZXQgaW5kZXggPSAwO1xuXHRyZXR1cm4gbmV3IFJlYWRhYmxlU3RyZWFtKHtcblx0XHRwdWxsKGNvbnRyb2xsZXIpIHtcblx0XHRcdGlmIChpbmRleCA8IGNodW5rcy5sZW5ndGgpIHtcblx0XHRcdFx0Y29udHJvbGxlci5lbnF1ZXVlKGNodW5rc1tpbmRleCsrXSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb250cm9sbGVyLmNsb3NlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcbn1cblxuY29uc3QgY29sbGVjdCA9IEl0ZXJhYmxlLmFzeW5jVG9BcnJheTtcblxuZnVuY3Rpb24gZ2V0VXJsKGlucHV0OiBzdHJpbmcgfCBVUkwgfCBSZXF1ZXN0KTogc3RyaW5nIHtcblx0aWYgKHR5cGVvZiBpbnB1dCA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gaW5wdXQ7XG5cdH1cblx0cmV0dXJuIGlucHV0IGluc3RhbmNlb2YgVVJMID8gaW5wdXQuaHJlZiA6IGlucHV0LnVybDtcbn1cblxuZnVuY3Rpb24gZ2V0VGV4dChtc2c6IEFudGhyb3BpYy5NZXNzYWdlKTogc3RyaW5nIHtcblx0cmV0dXJuIG1zZy5jb250ZW50XG5cdFx0LmZpbHRlcigoYik6IGIgaXMgQW50aHJvcGljLlRleHRCbG9jayA9PiBiLnR5cGUgPT09ICd0ZXh0Jylcblx0XHQubWFwKGIgPT4gYi50ZXh0KVxuXHRcdC5qb2luKCcnKTtcbn1cblxuZnVuY3Rpb24gdG9rZW5SZXNwb25zZShvdmVycmlkZXM/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IFJlc3BvbnNlIHtcblx0cmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7XG5cdFx0dG9rZW46ICdjb3BpbG90LXRvay1hYmMnLFxuXHRcdGV4cGlyZXNfYXQ6IERhdGUubm93KCkgLyAxMDAwICsgMzYwMCxcblx0XHRyZWZyZXNoX2luOiAxODAwLFxuXHRcdC4uLm92ZXJyaWRlcyxcblx0fSksIHsgc3RhdHVzOiAyMDAgfSk7XG59XG5cbmZ1bmN0aW9uIHVzZXJSZXNwb25zZSgpOiBSZXNwb25zZSB7XG5cdHJldHVybiBuZXcgUmVzcG9uc2UoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdGVuZHBvaW50czogeyBhcGk6ICdodHRwczovL2FwaS5naXRodWJjb3BpbG90LmNvbScgfSxcblx0fSksIHsgc3RhdHVzOiAyMDAgfSk7XG59XG5cbmZ1bmN0aW9uIGFudGhyb3BpY1Jlc3BvbnNlKGNvbnRlbnQ6IEFycmF5PHsgdHlwZTogc3RyaW5nOyB0ZXh0Pzogc3RyaW5nIH0+LCBzdG9wUmVhc29uID0gJ2VuZF90dXJuJyk6IFJlc3BvbnNlIHtcblx0cmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7XG5cdFx0aWQ6ICdtc2dfdGVzdCcsXG5cdFx0dHlwZTogJ21lc3NhZ2UnLFxuXHRcdHJvbGU6ICdhc3Npc3RhbnQnLFxuXHRcdGNvbnRlbnQsXG5cdFx0bW9kZWw6ICdjbGF1ZGUtc29ubmV0LTQtNS0yMDI1MDUxNCcsXG5cdFx0c3RvcF9yZWFzb246IHN0b3BSZWFzb24sXG5cdFx0dXNhZ2U6IHsgaW5wdXRfdG9rZW5zOiAxMCwgb3V0cHV0X3Rva2VuczogNTAgfSxcblx0fSksIHsgc3RhdHVzOiAyMDAsIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9IH0pO1xufVxuXG5mdW5jdGlvbiBzc2VSZXNwb25zZShjaHVua3M6IFVpbnQ4QXJyYXlbXSk6IFJlc3BvbnNlIHtcblx0cmV0dXJuIG5ldyBSZXNwb25zZShtYWtlU3NlQm9keShjaHVua3MpLCB7XG5cdFx0c3RhdHVzOiAyMDAsXG5cdFx0aGVhZGVyczogeyAnQ29udGVudC1UeXBlJzogJ3RleHQvZXZlbnQtc3RyZWFtJyB9LFxuXHR9KTtcbn1cblxuZnVuY3Rpb24gbW9kZWxzUmVzcG9uc2UobW9kZWxzOiBvYmplY3RbXSk6IFJlc3BvbnNlIHtcblx0cmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7IGRhdGE6IG1vZGVscyB9KSwge1xuXHRcdHN0YXR1czogMjAwLFxuXHRcdGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9LFxuXHR9KTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlU2VydmljZShmZXRjaEltcGw6IEZldGNoRnVuY3Rpb24sIGVudGVycHJpc2VVcmk/OiBzdHJpbmcpOiBDb3BpbG90QXBpU2VydmljZSB7XG5cdHJldHVybiBuZXcgQ29waWxvdEFwaVNlcnZpY2UoZmV0Y2hJbXBsLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgdGVzdFByb2R1Y3RTZXJ2aWNlLCBjcmVhdGVUZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlKGVudGVycHJpc2VVcmkpKTtcbn1cblxudHlwZSBDYXB0dXJlZFJlcXVlc3QgPSB7IHVybDogc3RyaW5nOyBpbml0OiBSZXF1ZXN0SW5pdCB8IHVuZGVmaW5lZCB9O1xuXG5mdW5jdGlvbiByb3V0aW5nRmV0Y2goXG5cdG1lc3NhZ2VSZXNwb25zZTogKGNhcHR1cmVkOiBDYXB0dXJlZFJlcXVlc3QpID0+IFJlc3BvbnNlLFxuXHR0b2tlbk92ZXJyaWRlcz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+LFxuKTogeyBmZXRjaDogRmV0Y2hGdW5jdGlvbjsgY2FwdHVyZWQ6ICgpID0+IENhcHR1cmVkUmVxdWVzdCB9IHtcblx0bGV0IGxhc3RDYXB0dXJlOiBDYXB0dXJlZFJlcXVlc3QgPSB7IHVybDogJycsIGluaXQ6IHVuZGVmaW5lZCB9O1xuXHRjb25zdCBpbXBsOiBGZXRjaEZ1bmN0aW9uID0gYXN5bmMgKGlucHV0LCBpbml0KSA9PiB7XG5cdFx0Y29uc3QgdXJsID0gZ2V0VXJsKGlucHV0KTtcblx0XHRpZiAodXJsLmluY2x1ZGVzKCcvdG9rZW4nKSB8fCB1cmwuaW5jbHVkZXMoJy9jb3BpbG90X2ludGVybmFsJykpIHtcblx0XHRcdHJldHVybiB0b2tlblJlc3BvbnNlKHRva2VuT3ZlcnJpZGVzKTtcblx0XHR9XG5cdFx0bGFzdENhcHR1cmUgPSB7IHVybCwgaW5pdCB9O1xuXHRcdHJldHVybiBtZXNzYWdlUmVzcG9uc2UobGFzdENhcHR1cmUpO1xuXHR9O1xuXHRyZXR1cm4geyBmZXRjaDogaW1wbCwgY2FwdHVyZWQ6ICgpID0+IGxhc3RDYXB0dXJlIH07XG59XG5cbmNvbnN0IHVzZXJNc2c6IEFudGhyb3BpYy5NZXNzYWdlUGFyYW1bXSA9IFt7IHJvbGU6ICd1c2VyJywgY29udGVudDogJ2hlbGxvJyB9XTtcbmNvbnN0IGJhc2VSZXF1ZXN0ID0ge1xuXHRtb2RlbDogJ2NsYXVkZS1zb25uZXQtNC01Jyxcblx0bWVzc2FnZXM6IHVzZXJNc2csXG5cdG1heF90b2tlbnM6IDgxOTIsXG5cdHN0cmVhbTogZmFsc2UgYXMgY29uc3QsXG59O1xuXG5mdW5jdGlvbiBzdHJlYW1TZXJ2aWNlKGNodW5rczogVWludDhBcnJheVtdLCB0b2tlbk92ZXJyaWRlcz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogQ29waWxvdEFwaVNlcnZpY2Uge1xuXHRjb25zdCB7IGZldGNoOiBmZXRjaEZuIH0gPSByb3V0aW5nRmV0Y2goKCkgPT4gc3NlUmVzcG9uc2UoY2h1bmtzKSwgdG9rZW5PdmVycmlkZXMpO1xuXHRyZXR1cm4gY3JlYXRlU2VydmljZShmZXRjaEZuKTtcbn1cblxuLy8gI2VuZHJlZ2lvblxuXG5zdWl0ZSgnQ29waWxvdEFwaVNlcnZpY2UnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnY29tYmluZXMgaW50ZXJuYWwgb3JnYW5pemF0aW9ucyBmcm9tIHRoZSBDb3BpbG90IHRva2VuIHdpdGggbG9naW4gZnJvbSB1c2VyIGRpc2NvdmVyeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyBpbnB1dCA9PiB7XG5cdFx0XHRjb25zdCB1cmwgPSBnZXRVcmwoaW5wdXQpO1xuXHRcdFx0aWYgKHVybC5lbmRzV2l0aCgnL2NvcGlsb3RfaW50ZXJuYWwvdXNlcicpKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgUmVzcG9uc2UoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdGxvZ2luOiAnb2N0b2NhdCcsXG5cdFx0XHRcdFx0Y29waWxvdGlnbm9yZV9lbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdGVuZHBvaW50czogeyBhcGk6ICdodHRwczovL2FwaS5naXRodWJjb3BpbG90LmNvbScsIHRlbGVtZXRyeTogJ2h0dHBzOi8vdGVsZW1ldHJ5LmV4YW1wbGUnIH0sXG5cdFx0XHRcdH0pLCB7IHN0YXR1czogMjAwIH0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHVybC5pbmNsdWRlcygnL3Rva2VuJykpIHtcblx0XHRcdFx0cmV0dXJuIHRva2VuUmVzcG9uc2Uoe1xuXHRcdFx0XHRcdHRva2VuOiAncnQ9MTt0aWQ9dHJhY2tpbmctaWQnLFxuXHRcdFx0XHRcdG9yZ2FuaXphdGlvbl9saXN0OiBbXG5cdFx0XHRcdFx0XHQnYTVkYjBiY2FhZTk0MDMyZmU3MTVmYjM0YTVlNGJjZTInLFxuXHRcdFx0XHRcdFx0JzU1MWNjYTYwY2UxOTY1NGQ4OTRlNzg2MjIwODIyNDgyJyxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5leHBlY3RlZCByZXF1ZXN0OiAke3VybH1gKTtcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5yZXNvbHZlUmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQoJ2doLXRva2VuJyksIHtcblx0XHRcdHJlc3RyaWN0ZWRUZWxlbWV0cnlFbmFibGVkOiB0cnVlLFxuXHRcdFx0dHJhY2tpbmdJZDogJ3RyYWNraW5nLWlkJyxcblx0XHRcdHRlbGVtZXRyeUVuZHBvaW50OiAnaHR0cHM6Ly90ZWxlbWV0cnkuZXhhbXBsZScsXG5cdFx0XHRpc0ludGVybmFsOiB0cnVlLFxuXHRcdFx0dXNlck5hbWU6ICdvY3RvY2F0Jyxcblx0XHRcdGlzVnNjb2RlVGVhbU1lbWJlcjogdHJ1ZSxcblx0XHRcdGNvcGlsb3RJZ25vcmVFbmFibGVkOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAjcmVnaW9uIEVuZHBvaW50IERpc2NvdmVyeVxuXG5cdHN1aXRlKCdFbmRwb2ludCBEaXNjb3ZlcnknLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdydW5zIGVuZHBvaW50IGRpc2NvdmVyeSBvbiBmaXJzdCByZXF1ZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IG1pbnRDb3VudCA9IDA7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyAoaW5wdXQpID0+IHtcblx0XHRcdFx0Y29uc3QgdXJsID0gZ2V0VXJsKGlucHV0KTtcblx0XHRcdFx0aWYgKHVybC5pbmNsdWRlcygnL2NvcGlsb3RfaW50ZXJuYWwnKSkge1xuXHRcdFx0XHRcdG1pbnRDb3VudCsrO1xuXHRcdFx0XHRcdHJldHVybiB0b2tlblJlc3BvbnNlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGFudGhyb3BpY1Jlc3BvbnNlKFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2hpJyB9XSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgYmFzZVJlcXVlc3QpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pbnRDb3VudCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXVzZXMgY2FjaGVkIGVuZHBvaW50IGRpc2NvdmVyeSBmb3IgY29uc2VjdXRpdmUgY2FsbHMgd2l0aCBzYW1lIGdpdGh1YiB0b2tlbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBtaW50Q291bnQgPSAwO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoYXN5bmMgKGlucHV0KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHVybCA9IGdldFVybChpbnB1dCk7XG5cdFx0XHRcdGlmICh1cmwuaW5jbHVkZXMoJy9jb3BpbG90X2ludGVybmFsJykpIHtcblx0XHRcdFx0XHRtaW50Q291bnQrKztcblx0XHRcdFx0XHRyZXR1cm4gdG9rZW5SZXNwb25zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhbnRocm9waWNSZXNwb25zZShbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdoaScgfV0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIGJhc2VSZXF1ZXN0KTtcblx0XHRcdGF3YWl0IHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIGJhc2VSZXF1ZXN0KTtcblx0XHRcdGF3YWl0IHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIGJhc2VSZXF1ZXN0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaW50Q291bnQsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmUtZGlzY292ZXJzIGVuZHBvaW50cyB3aGVuIHRoZSBnaXRodWIgdG9rZW4gY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBtaW50Q291bnQgPSAwO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoYXN5bmMgKGlucHV0KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHVybCA9IGdldFVybChpbnB1dCk7XG5cdFx0XHRcdGlmICh1cmwuaW5jbHVkZXMoJy9jb3BpbG90X2ludGVybmFsJykpIHtcblx0XHRcdFx0XHRtaW50Q291bnQrKztcblx0XHRcdFx0XHRyZXR1cm4gdG9rZW5SZXNwb25zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhbnRocm9waWNSZXNwb25zZShbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdoaScgfV0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvay1BJywgYmFzZVJlcXVlc3QpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rLUInLCBiYXNlUmVxdWVzdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWludENvdW50LCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ludmFsaWRhdGVzIGNhY2hlZCBlbmRwb2ludCBkaXNjb3Zlcnkgb24gNDAxIGZyb20gbWVzc2FnZXMgc28gdGhlIG5leHQgY2FsbCByZS1kaXNjb3ZlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgbWludENvdW50ID0gMDtcblx0XHRcdGxldCBtZXNzYWdlQ2FsbENvdW50ID0gMDtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGFzeW5jIChpbnB1dCkgPT4ge1xuXHRcdFx0XHRjb25zdCB1cmwgPSBnZXRVcmwoaW5wdXQpO1xuXHRcdFx0XHRpZiAodXJsLmluY2x1ZGVzKCcvY29waWxvdF9pbnRlcm5hbCcpKSB7XG5cdFx0XHRcdFx0bWludENvdW50Kys7XG5cdFx0XHRcdFx0cmV0dXJuIHRva2VuUmVzcG9uc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRtZXNzYWdlQ2FsbENvdW50Kys7XG5cdFx0XHRcdGlmIChtZXNzYWdlQ2FsbENvdW50ID09PSAxKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBSZXNwb25zZSgndW5hdXRob3JpemVkJywgeyBzdGF0dXM6IDQwMSwgc3RhdHVzVGV4dDogJ1VuYXV0aG9yaXplZCcgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGFudGhyb3BpY1Jlc3BvbnNlKFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ29rJyB9XSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgYmFzZVJlcXVlc3QpKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIGJhc2VSZXF1ZXN0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaW50Q291bnQsIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW52YWxpZGF0ZXMgY2FjaGVkIGVuZHBvaW50IGRpc2NvdmVyeSBvbiA0MDMgZnJvbSBtb2RlbHMgc28gdGhlIG5leHQgY2FsbCByZS1kaXNjb3ZlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgbWludENvdW50ID0gMDtcblx0XHRcdGxldCBtb2RlbHNDYWxsQ291bnQgPSAwO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoYXN5bmMgKGlucHV0KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHVybCA9IGdldFVybChpbnB1dCk7XG5cdFx0XHRcdGlmICh1cmwuaW5jbHVkZXMoJy9jb3BpbG90X2ludGVybmFsJykpIHtcblx0XHRcdFx0XHRtaW50Q291bnQrKztcblx0XHRcdFx0XHRyZXR1cm4gdG9rZW5SZXNwb25zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG1vZGVsc0NhbGxDb3VudCsrO1xuXHRcdFx0XHRpZiAobW9kZWxzQ2FsbENvdW50ID09PSAxKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBSZXNwb25zZSgnZm9yYmlkZGVuJywgeyBzdGF0dXM6IDQwMywgc3RhdHVzVGV4dDogJ0ZvcmJpZGRlbicgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG1vZGVsc1Jlc3BvbnNlKFtdKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBzZXJ2aWNlLm1vZGVscygnZ2gtdG9rJykpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5tb2RlbHMoJ2doLXRvaycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pbnRDb3VudCwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCByZS1kaXNjb3ZlciB3aGVuIHRoZSBjYWNoZSBpcyBzdGlsbCB3YXJtIGZvciB0aGUgc2FtZSB0b2tlbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBtaW50Q291bnQgPSAwO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoYXN5bmMgKGlucHV0KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHVybCA9IGdldFVybChpbnB1dCk7XG5cdFx0XHRcdGlmICh1cmwuaW5jbHVkZXMoJy9jb3BpbG90X2ludGVybmFsJykpIHtcblx0XHRcdFx0XHRtaW50Q291bnQrKztcblx0XHRcdFx0XHRyZXR1cm4gdG9rZW5SZXNwb25zZSh7IGV4cGlyZXNfYXQ6IERhdGUubm93KCkgLyAxMDAwICsgNzIwMCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYW50aHJvcGljUmVzcG9uc2UoW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnaGknIH1dKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2snLCBiYXNlUmVxdWVzdCk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2snLCBiYXNlUmVxdWVzdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWludENvdW50LCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgZW5kcG9pbnRzLmFwaSBmcm9tIHRoZSAvY29waWxvdF9pbnRlcm5hbC91c2VyIHJlc3BvbnNlIGFzIHRoZSBDQVBJIGJhc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGZldGNoOiBmZXRjaEZuLCBjYXB0dXJlZCB9ID0gcm91dGluZ0ZldGNoKFxuXHRcdFx0XHQoKSA9PiBhbnRocm9waWNSZXNwb25zZShbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdvaycgfV0pLFxuXHRcdFx0XHR7IGVuZHBvaW50czogeyBhcGk6ICdodHRwczovL2N1c3RvbS5jb3BpbG90LmV4YW1wbGUuY29tJyB9IH0sXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZmV0Y2hGbik7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIGJhc2VSZXF1ZXN0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZCgpLnVybCwgJ2h0dHBzOi8vY3VzdG9tLmNvcGlsb3QuZXhhbXBsZS5jb20vdjEvbWVzc2FnZXMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldXNlcyBlbmRwb2ludCBkaXNjb3Zlcnkgd2hlbiByZXNvbHZpbmcgR2l0SHViIGxvZ2luIGFuZCBDb3BpbG90IFNLVScsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBkaXNjb3ZlcnlDb3VudCA9IDA7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyBpbnB1dCA9PiB7XG5cdFx0XHRcdGNvbnN0IHVybCA9IGdldFVybChpbnB1dCk7XG5cdFx0XHRcdGlmICh1cmwuaW5jbHVkZXMoJy9jb3BpbG90X2ludGVybmFsL3VzZXInKSkge1xuXHRcdFx0XHRcdGRpc2NvdmVyeUNvdW50Kys7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdFx0XHRsb2dpbjogJ29jdG9jYXQnLFxuXHRcdFx0XHRcdFx0YWNjZXNzX3R5cGVfc2t1OiAnY29waWxvdF9mb3JfYnVzaW5lc3Nfc2VhdCcsXG5cdFx0XHRcdFx0XHRlbmRwb2ludHM6IHsgYXBpOiAnaHR0cHM6Ly9jdXN0b20uY29waWxvdC5leGFtcGxlLmNvbScgfSxcblx0XHRcdFx0XHR9KSwgeyBzdGF0dXM6IDIwMCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVuZXhwZWN0ZWQgVVJMOiAke3VybH1gKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBhcGlFbmRwb2ludCA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUFwaUVuZHBvaW50KCdnaC10b2snKTtcblx0XHRcdGNvbnN0IGxvZ2luID0gYXdhaXQgc2VydmljZS5yZXNvbHZlVXNlckxvZ2luKCdnaC10b2snKTtcblx0XHRcdGNvbnN0IGNvcGlsb3RTa3UgPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVDb3BpbG90U2t1KCdnaC10b2snKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFwaUVuZHBvaW50LCBsb2dpbiwgY29waWxvdFNrdSwgZGlzY292ZXJ5Q291bnQgfSwge1xuXHRcdFx0XHRhcGlFbmRwb2ludDogJ2h0dHBzOi8vY3VzdG9tLmNvcGlsb3QuZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRsb2dpbjogJ29jdG9jYXQnLFxuXHRcdFx0XHRjb3BpbG90U2t1OiAnY29waWxvdF9mb3JfYnVzaW5lc3Nfc2VhdCcsXG5cdFx0XHRcdGRpc2NvdmVyeUNvdW50OiAxLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxscyBiYWNrIHRvIGRlZmF1bHQgQVBJIGJhc2Ugd2hlbiBlbmRwb2ludHMuYXBpIGlzIG1pc3NpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGZldGNoOiBmZXRjaEZuLCBjYXB0dXJlZCB9ID0gcm91dGluZ0ZldGNoKFxuXHRcdFx0XHQoKSA9PiBhbnRocm9waWNSZXNwb25zZShbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdvaycgfV0pLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGZldGNoRm4pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2snLCBiYXNlUmVxdWVzdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwdHVyZWQoKS51cmwsICdodHRwczovL2FwaS5naXRodWJjb3BpbG90LmNvbS92MS9tZXNzYWdlcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VuZHMgdGhlIGdpdGh1YiB0b2tlbiBhcyBhIEJlYXJlciBBdXRob3JpemF0aW9uIGhlYWRlciB0byB0aGUgZGlzY292ZXJ5IGVuZHBvaW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGNhcHR1cmVkQXV0aEhlYWRlcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoYXN5bmMgKGlucHV0LCBpbml0KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHVybCA9IGdldFVybChpbnB1dCk7XG5cdFx0XHRcdGlmICh1cmwuaW5jbHVkZXMoJy9jb3BpbG90X2ludGVybmFsJykpIHtcblx0XHRcdFx0XHRjb25zdCBoZWFkZXJzID0gaW5pdD8uaGVhZGVycyBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuXHRcdFx0XHRcdGNhcHR1cmVkQXV0aEhlYWRlciA9IGhlYWRlcnM/LlsnQXV0aG9yaXphdGlvbiddO1xuXHRcdFx0XHRcdHJldHVybiB0b2tlblJlc3BvbnNlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGFudGhyb3BpY1Jlc3BvbnNlKFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ29rJyB9XSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5tZXNzYWdlcygnbXktc2VjcmV0LWdoLXRva2VuJywgYmFzZVJlcXVlc3QpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcHR1cmVkQXV0aEhlYWRlciwgJ0JlYXJlciBteS1zZWNyZXQtZ2gtdG9rZW4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JvdXRlcyBlbmRwb2ludCBkaXNjb3ZlcnkgdG8gdGhlIEdpdEh1YiBFbnRlcnByaXNlIGhvc3Qgd2hlbiBjb25maWd1cmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGRpc2NvdmVyeVVybDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoYXN5bmMgKGlucHV0KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHVybCA9IGdldFVybChpbnB1dCk7XG5cdFx0XHRcdGlmICh1cmwuaW5jbHVkZXMoJy9jb3BpbG90X2ludGVybmFsJykpIHtcblx0XHRcdFx0XHRkaXNjb3ZlcnlVcmwgPSB1cmw7XG5cdFx0XHRcdFx0cmV0dXJuIHRva2VuUmVzcG9uc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYW50aHJvcGljUmVzcG9uc2UoW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnb2snIH1dKTtcblx0XHRcdH0sICdodHRwczovL2FjbWUuZ2hlLmNvbScpO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2snLCBiYXNlUmVxdWVzdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzY292ZXJ5VXJsLCAnaHR0cHM6Ly9hcGkuYWNtZS5naGUuY29tL2NvcGlsb3RfaW50ZXJuYWwvdXNlcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIGF1dGhlbnRpY2F0aW9uIGVycm9ycyBmcm9tIGVuZHBvaW50IGRpc2NvdmVyeScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGFzeW5jICgpID0+IG5ldyBSZXNwb25zZSgne1wibWVzc2FnZVwiOlwiQmFkIGNyZWRlbnRpYWxzXCJ9JywgeyBzdGF0dXM6IDQwMSwgc3RhdHVzVGV4dDogJ1VuYXV0aG9yaXplZCcgfSkpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdCgpID0+IHNlcnZpY2UubWVzc2FnZXMoJ2JhZC10b2snLCBiYXNlUmVxdWVzdCksXG5cdFx0XHRcdChlcnI6IEVycm9yKSA9PiB7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0XHRpc0NvcGlsb3RBcGlFcnJvcjogZXJyIGluc3RhbmNlb2YgQ29waWxvdEFwaUVycm9yLFxuXHRcdFx0XHRcdFx0c3RhdHVzOiBlcnIgaW5zdGFuY2VvZiBDb3BpbG90QXBpRXJyb3IgPyBlcnIuc3RhdHVzIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogZXJyLm1lc3NhZ2UsXG5cdFx0XHRcdFx0XHRlbnZlbG9wZTogZXJyIGluc3RhbmNlb2YgQ29waWxvdEFwaUVycm9yID8gZXJyLmVudmVsb3BlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdGlzQ29waWxvdEFwaUVycm9yOiB0cnVlLFxuXHRcdFx0XHRcdFx0c3RhdHVzOiA0MDEsXG5cdFx0XHRcdFx0XHRtZXNzYWdlOiAnQ29waWxvdCBlbmRwb2ludCBkaXNjb3ZlcnkgZmFpbGVkOiA0MDEgVW5hdXRob3JpemVkIFx1MjAxNCB7XCJtZXNzYWdlXCI6XCJCYWQgY3JlZGVudGlhbHNcIn0nLFxuXHRcdFx0XHRcdFx0ZW52ZWxvcGU6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2Vycm9yJyxcblx0XHRcdFx0XHRcdFx0ZXJyb3I6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYXBpX2Vycm9yJyxcblx0XHRcdFx0XHRcdFx0XHRtZXNzYWdlOiAne1wibWVzc2FnZVwiOlwiQmFkIGNyZWRlbnRpYWxzXCJ9Jyxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0cmVxdWVzdF9pZDogbnVsbCxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3dzIG9uIDUwMCBmcm9tIGVuZHBvaW50IGRpc2NvdmVyeScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGFzeW5jICgpID0+IG5ldyBSZXNwb25zZSgnaW50ZXJuYWwgZXJyb3InLCB7IHN0YXR1czogNTAwLCBzdGF0dXNUZXh0OiAnSW50ZXJuYWwgU2VydmVyIEVycm9yJyB9KSk7XG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0KCkgPT4gc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgYmFzZVJlcXVlc3QpLFxuXHRcdFx0XHQoZXJyOiBFcnJvcikgPT4gZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ0NvcGlsb3QgZW5kcG9pbnQgZGlzY292ZXJ5IGZhaWxlZDogNTAwJyksXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgZG91YmxlLWRpc2NvdmVyIHdoZW4gY29uY3VycmVudCByZXF1ZXN0cyByYWNlIG9uIGZpcnN0IGNhbGwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgbWludENvdW50ID0gMDtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGFzeW5jIChpbnB1dCkgPT4ge1xuXHRcdFx0XHRjb25zdCB1cmwgPSBnZXRVcmwoaW5wdXQpO1xuXHRcdFx0XHRpZiAodXJsLmluY2x1ZGVzKCcvY29waWxvdF9pbnRlcm5hbCcpKSB7XG5cdFx0XHRcdFx0bWludENvdW50Kys7XG5cdFx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwKSk7IC8vIGVuc3VyZSBvdmVybGFwXG5cdFx0XHRcdFx0cmV0dXJuIHRva2VuUmVzcG9uc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYW50aHJvcGljUmVzcG9uc2UoW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnb2snIH1dKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIGJhc2VSZXF1ZXN0KSxcblx0XHRcdFx0c2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgYmFzZVJlcXVlc3QpLFxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWludENvdW50LCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luLWZsaWdodCBkaXNjb3ZlcnkgZGVkdXAgc3BhbnMgY29uY3VycmVudCBtZXNzYWdlcyArIG1vZGVscyBjYWxscycsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBtaW50Q291bnQgPSAwO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoYXN5bmMgKGlucHV0KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHVybCA9IGdldFVybChpbnB1dCk7XG5cdFx0XHRcdGlmICh1cmwuaW5jbHVkZXMoJy9jb3BpbG90X2ludGVybmFsJykpIHtcblx0XHRcdFx0XHRtaW50Q291bnQrKztcblx0XHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTApKTtcblx0XHRcdFx0XHRyZXR1cm4gdG9rZW5SZXNwb25zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh1cmwuaW5jbHVkZXMoJy9tb2RlbHMnKSkge1xuXHRcdFx0XHRcdHJldHVybiBtb2RlbHNSZXNwb25zZShbXSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGFudGhyb3BpY1Jlc3BvbnNlKFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ29rJyB9XSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2snLCBiYXNlUmVxdWVzdCksXG5cdFx0XHRcdHNlcnZpY2UubW9kZWxzKCdnaC10b2snKSxcblx0XHRcdF0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pbnRDb3VudCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlcnJvciBmcm9tIGVuZHBvaW50IGRpc2NvdmVyeSBkb2VzIG5vdCBpbmNsdWRlIHRoZSBnaXRodWIgdG9rZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyAoKSA9PiBuZXcgUmVzcG9uc2UoJ2ZvcmJpZGRlbicsIHsgc3RhdHVzOiA0MDMsIHN0YXR1c1RleHQ6ICdGb3JiaWRkZW4nIH0pKTtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHQoKSA9PiBzZXJ2aWNlLm1lc3NhZ2VzKCdzdXBlci1zZWNyZXQtZ2gtdG9rZW4teHl6JywgYmFzZVJlcXVlc3QpLFxuXHRcdFx0XHQoZXJyOiBFcnJvcikgPT4gIWVyci5tZXNzYWdlLmluY2x1ZGVzKCdzdXBlci1zZWNyZXQtZ2gtdG9rZW4teHl6JyksXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXJyb3IgZnJvbSBDQVBJIGRvZXMgbm90IGluY2x1ZGUgdGhlIGdpdGh1YiB0b2tlbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGFzeW5jIChpbnB1dCkgPT4ge1xuXHRcdFx0XHRjb25zdCB1cmwgPSBnZXRVcmwoaW5wdXQpO1xuXHRcdFx0XHRpZiAodXJsLmluY2x1ZGVzKCcvY29waWxvdF9pbnRlcm5hbCcpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRva2VuUmVzcG9uc2UoeyB0b2tlbjogJ3N1cGVyLXNlY3JldC1jb3BpbG90LXRva2VuLXh5eicgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG5ldyBSZXNwb25zZSgncmF0ZSBsaW1pdGVkJywgeyBzdGF0dXM6IDQyOSwgc3RhdHVzVGV4dDogJ1RvbyBNYW55IFJlcXVlc3RzJyB9KTtcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdCgpID0+IHNlcnZpY2UubWVzc2FnZXMoJ3N1cGVyLXNlY3JldC1naC10b2tlbi14eXonLCBiYXNlUmVxdWVzdCksXG5cdFx0XHRcdChlcnI6IEVycm9yKSA9PiAhZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ3N1cGVyLXNlY3JldC1jb3BpbG90LXRva2VuLXh5eicpICYmICFlcnIubWVzc2FnZS5pbmNsdWRlcygnc3VwZXItc2VjcmV0LWdoLXRva2VuLXh5eicpLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc2NvdmVycyBpbmRlcGVuZGVudGx5IGZvciBjb25jdXJyZW50IHJlcXVlc3RzIHdpdGggZGlmZmVyZW50IGdpdGh1YiB0b2tlbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtaW50ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyAoaW5wdXQsIGluaXQpID0+IHtcblx0XHRcdFx0Y29uc3QgdXJsID0gZ2V0VXJsKGlucHV0KTtcblx0XHRcdFx0aWYgKHVybC5pbmNsdWRlcygnL2NvcGlsb3RfaW50ZXJuYWwnKSkge1xuXHRcdFx0XHRcdGNvbnN0IGF1dGggPSAoaW5pdD8uaGVhZGVycyBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KT8uWydBdXRob3JpemF0aW9uJ10gPz8gJyc7XG5cdFx0XHRcdFx0bWludGVkLnB1c2goYXV0aCk7XG5cdFx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDEwKSk7IC8vIGVuc3VyZSBvdmVybGFwXG5cdFx0XHRcdFx0cmV0dXJuIHRva2VuUmVzcG9uc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYW50aHJvcGljUmVzcG9uc2UoW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnb2snIH1dKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvay1BJywgYmFzZVJlcXVlc3QpLFxuXHRcdFx0XHRzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2stQicsIGJhc2VSZXF1ZXN0KSxcblx0XHRcdF0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pbnRlZC5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1pbnRlZC5zb21lKGggPT4gaC5pbmNsdWRlcygnZ2gtdG9rLUEnKSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1pbnRlZC5zb21lKGggPT4gaC5pbmNsdWRlcygnZ2gtdG9rLUInKSkpO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ0NBUEkgVVJMIG92ZXJyaWRlIChWU0NPREVfQUdFTlRfSE9TVF9DQVBJX1VSTF9PVkVSUklERSknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBFTlYgPSAnVlNDT0RFX0FHRU5UX0hPU1RfQ0FQSV9VUkxfT1ZFUlJJREUnO1xuXHRcdFx0Y29uc3QgU01PS0VfVEVTVF9FTlYgPSAnVlNDT0RFX1NNT0tFX1RFU1RfUFJPWFlfSEVBREVSJztcblx0XHRcdGxldCBzYXZlZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IHNhdmVkU21va2VUZXN0RW52OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0XHRcdHNldHVwKCgpID0+IHtcblx0XHRcdFx0c2F2ZWQgPSBwcm9jZXNzLmVudltFTlZdO1xuXHRcdFx0XHRzYXZlZFNtb2tlVGVzdEVudiA9IHByb2Nlc3MuZW52W1NNT0tFX1RFU1RfRU5WXTtcblx0XHRcdFx0ZGVsZXRlIHByb2Nlc3MuZW52W1NNT0tFX1RFU1RfRU5WXTtcblx0XHRcdH0pO1xuXHRcdFx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFx0XHRpZiAoc2F2ZWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGRlbGV0ZSBwcm9jZXNzLmVudltFTlZdO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHByb2Nlc3MuZW52W0VOVl0gPSBzYXZlZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc2F2ZWRTbW9rZVRlc3RFbnYgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGRlbGV0ZSBwcm9jZXNzLmVudltTTU9LRV9URVNUX0VOVl07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cHJvY2Vzcy5lbnZbU01PS0VfVEVTVF9FTlZdID0gc2F2ZWRTbW9rZVRlc3RFbnY7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdhIGxvb3BiYWNrIG92ZXJyaWRlIHNraXBzIGRpc2NvdmVyeSBhbmQgcm91dGVzIENBUEkgYXQgdGhlIG92ZXJyaWRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRwcm9jZXNzLmVudltFTlZdID0gJ2h0dHA6Ly8xMjcuMC4wLjE6MTIzNDUnO1xuXHRcdFx0XHRsZXQgZGlzY292ZXJ5SGl0ID0gZmFsc2U7XG5cdFx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGFzeW5jIChpbnB1dCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHVybCA9IGdldFVybChpbnB1dCk7XG5cdFx0XHRcdFx0aWYgKHVybC5pbmNsdWRlcygnL2NvcGlsb3RfaW50ZXJuYWwnKSkge1xuXHRcdFx0XHRcdFx0ZGlzY292ZXJ5SGl0ID0gdHJ1ZTtcblx0XHRcdFx0XHRcdHJldHVybiB0b2tlblJlc3BvbnNlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBhbnRocm9waWNSZXNwb25zZShbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdvaycgfV0pO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRhd2FpdCBzZXJ2aWNlLm1lc3NhZ2VzKCdnaC1zZWNyZXQnLCBiYXNlUmVxdWVzdCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc2NvdmVyeUhpdCwgZmFsc2UsICdkaXNjb3ZlcnkgbXVzdCBiZSBza2lwcGVkIGZvciBhIGxvb3BiYWNrIG92ZXJyaWRlJyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgndGhlIHJlc2VydmVkIHNtb2tlLXRlc3QgaG9zdCBza2lwcyBkaXNjb3Zlcnkgb25seSB3aXRoIHRoZSBwcm94eSBtYXJrZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHByb2Nlc3MuZW52W0VOVl0gPSAnaHR0cDovL3ZzY29kZS1zbW9rZS50ZXN0OjEyMzQ1Jztcblx0XHRcdFx0cHJvY2Vzcy5lbnZbU01PS0VfVEVTVF9FTlZdID0gJ3Rlc3QtbWFya2VyJztcblx0XHRcdFx0bGV0IGRpc2NvdmVyeUhpdCA9IGZhbHNlO1xuXHRcdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyAoaW5wdXQpID0+IHtcblx0XHRcdFx0XHRjb25zdCB1cmwgPSBnZXRVcmwoaW5wdXQpO1xuXHRcdFx0XHRcdGlmICh1cmwuaW5jbHVkZXMoJy9jb3BpbG90X2ludGVybmFsJykpIHtcblx0XHRcdFx0XHRcdGRpc2NvdmVyeUhpdCA9IHRydWU7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdG9rZW5SZXNwb25zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gYW50aHJvcGljUmVzcG9uc2UoW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnb2snIH1dKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0YXdhaXQgc2VydmljZS5tZXNzYWdlcygnZ2gtc2VjcmV0JywgYmFzZVJlcXVlc3QpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNjb3ZlcnlIaXQsIGZhbHNlLCAndGhlIHNtb2tlLXRlc3Qgb3ZlcnJpZGUgbXVzdCBza2lwIGVuZHBvaW50IGRpc2NvdmVyeScpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2Egbm9uLWxvb3BiYWNrIG92ZXJyaWRlIGlzIGlnbm9yZWQgYW5kIG5vcm1hbCBkaXNjb3ZlcnkgcnVucyAobm8gdG9rZW4gbGVhayknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHByb2Nlc3MuZW52W0VOVl0gPSAnaHR0cHM6Ly9ldmlsLmV4YW1wbGUuY29tJztcblx0XHRcdFx0cHJvY2Vzcy5lbnZbU01PS0VfVEVTVF9FTlZdID0gJ3Rlc3QtbWFya2VyJztcblx0XHRcdFx0bGV0IGRpc2NvdmVyeUhpdCA9IGZhbHNlO1xuXHRcdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyAoaW5wdXQpID0+IHtcblx0XHRcdFx0XHRjb25zdCB1cmwgPSBnZXRVcmwoaW5wdXQpO1xuXHRcdFx0XHRcdGlmICh1cmwuaW5jbHVkZXMoJy9jb3BpbG90X2ludGVybmFsJykpIHtcblx0XHRcdFx0XHRcdGRpc2NvdmVyeUhpdCA9IHRydWU7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdG9rZW5SZXNwb25zZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gYW50aHJvcGljUmVzcG9uc2UoW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnb2snIH1dKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0YXdhaXQgc2VydmljZS5tZXNzYWdlcygnZ2gtc2VjcmV0JywgYmFzZVJlcXVlc3QpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNjb3ZlcnlIaXQsIHRydWUsICdhIG5vbi1sb29wYmFjayBvdmVycmlkZSBtdXN0IGJlIGlnbm9yZWQgc28gdGhlIHRva2VuIGlzIG5ldmVyIHNlbnQgdG8gaXQnKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBSZXF1ZXN0IEZvcm1hdFxuXG5cdHN1aXRlKCdSZXF1ZXN0IEZvcm1hdCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ3NlbmRzIHN5c3RlbSBhcyBhIHRvcC1sZXZlbCB0ZXh0LWJsb2NrIGFycmF5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBmZXRjaDogZmV0Y2hGbiwgY2FwdHVyZWQgfSA9IHJvdXRpbmdGZXRjaChcblx0XHRcdFx0KCkgPT4gYW50aHJvcGljUmVzcG9uc2UoW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnb2snIH1dKSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShmZXRjaEZuKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgeyAuLi5iYXNlUmVxdWVzdCwgc3lzdGVtOiAnWW91IGFyZSBoZWxwZnVsLicgfSk7XG5cdFx0XHRjb25zdCBib2R5ID0gSlNPTi5wYXJzZShjYXB0dXJlZCgpLmluaXQ/LmJvZHkgYXMgc3RyaW5nKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChib2R5LnN5c3RlbSwgW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnWW91IGFyZSBoZWxwZnVsLicgfV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb21pdHMgc3lzdGVtIGZpZWxkIGVudGlyZWx5IHdoZW4gbm90IHByb3ZpZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBmZXRjaDogZmV0Y2hGbiwgY2FwdHVyZWQgfSA9IHJvdXRpbmdGZXRjaChcblx0XHRcdFx0KCkgPT4gYW50aHJvcGljUmVzcG9uc2UoW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnb2snIH1dKSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShmZXRjaEZuKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgYmFzZVJlcXVlc3QpO1xuXHRcdFx0Y29uc3QgYm9keSA9IEpTT04ucGFyc2UoY2FwdHVyZWQoKS5pbml0Py5ib2R5IGFzIHN0cmluZyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChib2R5LnN5c3RlbSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NlbmRzIG1heF90b2tlbnMgaW4gdGhlIGJvZHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGZldGNoOiBmZXRjaEZuLCBjYXB0dXJlZCB9ID0gcm91dGluZ0ZldGNoKFxuXHRcdFx0XHQoKSA9PiBhbnRocm9waWNSZXNwb25zZShbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdvaycgfV0pLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGZldGNoRm4pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2snLCB7IC4uLmJhc2VSZXF1ZXN0LCBtYXhfdG9rZW5zOiA4MTkyIH0pO1xuXHRcdFx0Y29uc3QgYm9keSA9IEpTT04ucGFyc2UoY2FwdHVyZWQoKS5pbml0Py5ib2R5IGFzIHN0cmluZyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChib2R5Lm1heF90b2tlbnMsIDgxOTIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VuZHMgdXRpbGl0eSBtYXhUb2tlbnMgYXMgbWF4X3Rva2VucyBpbiB0aGUgYm9keScsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBjYXB0dXJlZEJvZHk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGFzeW5jIChpbnB1dCwgaW5pdCkgPT4ge1xuXHRcdFx0XHRjb25zdCB1cmwgPSBnZXRVcmwoaW5wdXQpO1xuXHRcdFx0XHRpZiAodXJsLmluY2x1ZGVzKCcvY29waWxvdF9pbnRlcm5hbCcpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRva2VuUmVzcG9uc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodXJsLmVuZHNXaXRoKCcvbW9kZWxzJykpIHtcblx0XHRcdFx0XHRyZXR1cm4gbW9kZWxzUmVzcG9uc2UoW3sgaWQ6ICdncHQtNG8tbWluaS1tb2RlbCcsIGNhcGFiaWxpdGllczogeyBmYW1pbHk6ICdncHQtNG8tbWluaScgfSB9XSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FwdHVyZWRCb2R5ID0gaW5pdD8uYm9keSBhcyBzdHJpbmc7XG5cdFx0XHRcdHJldHVybiBuZXcgUmVzcG9uc2UoSlNPTi5zdHJpbmdpZnkoeyBjaG9pY2VzOiBbeyBtZXNzYWdlOiB7IGNvbnRlbnQ6ICdHZW5lcmF0ZWQgdGl0bGUnIH0gfV0gfSksIHsgc3RhdHVzOiAyMDAgfSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS51dGlsaXR5Q2hhdENvbXBsZXRpb24oJ2doLXRvaycsIHtcblx0XHRcdFx0bWVzc2FnZXM6IFt7IHJvbGU6ICd1c2VyJywgY29udGVudDogJ0dlbmVyYXRlIGEgdGl0bGUnIH1dLFxuXHRcdFx0XHRtYXhUb2tlbnM6IDMyLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChKU09OLnBhcnNlKGNhcHR1cmVkQm9keSA/PyAne30nKS5tYXhfdG9rZW5zLCAzMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIHRoZSBHaXRIdWIgT0F1dGggdG9rZW4gZGlyZWN0bHkgZm9yIHV0aWxpdHkgY29tcGxldGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXF1ZXN0czogQXJyYXk8eyB1cmw6IHN0cmluZzsgYXV0aG9yaXphdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkIH0+ID0gW107XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyAoaW5wdXQsIGluaXQpID0+IHtcblx0XHRcdFx0Y29uc3QgdXJsID0gZ2V0VXJsKGlucHV0KTtcblx0XHRcdFx0cmVxdWVzdHMucHVzaCh7IHVybCwgYXV0aG9yaXphdGlvbjogKGluaXQ/LmhlYWRlcnMgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPiB8IHVuZGVmaW5lZCk/LlsnQXV0aG9yaXphdGlvbiddIH0pO1xuXHRcdFx0XHRpZiAodXJsLmVuZHNXaXRoKCcvbW9kZWxzJykpIHtcblx0XHRcdFx0XHRyZXR1cm4gbW9kZWxzUmVzcG9uc2UoW3sgaWQ6ICdncHQtNG8tbWluaS1tb2RlbCcsIGNhcGFiaWxpdGllczogeyBmYW1pbHk6ICdncHQtNG8tbWluaScgfSB9XSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7IGNob2ljZXM6IFt7IG1lc3NhZ2U6IHsgY29udGVudDogJ0dlbmVyYXRlZCB0aXRsZScgfSB9XSB9KSwgeyBzdGF0dXM6IDIwMCB9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnV0aWxpdHlDaGF0Q29tcGxldGlvbignZ2gtb2F1dGgtdG9rZW4nLCB7XG5cdFx0XHRcdG1lc3NhZ2VzOiBbeyByb2xlOiAndXNlcicsIGNvbnRlbnQ6ICdHZW5lcmF0ZSBhIHRpdGxlJyB9XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlcXVlc3RzLm1hcChyZXF1ZXN0ID0+ICh7XG5cdFx0XHRcdHBhdGg6IG5ldyBVUkwocmVxdWVzdC51cmwpLnBhdGhuYW1lLFxuXHRcdFx0XHRhdXRob3JpemF0aW9uOiByZXF1ZXN0LmF1dGhvcml6YXRpb24sXG5cdFx0XHR9KSksIFtcblx0XHRcdFx0eyBwYXRoOiAnL2NvcGlsb3RfaW50ZXJuYWwvdXNlcicsIGF1dGhvcml6YXRpb246ICdCZWFyZXIgZ2gtb2F1dGgtdG9rZW4nIH0sXG5cdFx0XHRcdHsgcGF0aDogJy9tb2RlbHMnLCBhdXRob3JpemF0aW9uOiAnQmVhcmVyIGdoLW9hdXRoLXRva2VuJyB9LFxuXHRcdFx0XHR7IHBhdGg6ICcvY2hhdC9jb21wbGV0aW9ucycsIGF1dGhvcml6YXRpb246ICdCZWFyZXIgZ2gtb2F1dGgtdG9rZW4nIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3V0aWxpdHkgYXV0aCBmYWlsdXJlIHJlZGlzY292ZXJzIGVuZHBvaW50cyBhbmQgdXRpbGl0eSBtb2RlbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCB1c2VyQ291bnQgPSAwO1xuXHRcdFx0bGV0IG1vZGVsc0NvdW50ID0gMDtcblx0XHRcdGxldCBjb21wbGV0aW9uQ291bnQgPSAwO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoYXN5bmMgaW5wdXQgPT4ge1xuXHRcdFx0XHRjb25zdCB1cmwgPSBnZXRVcmwoaW5wdXQpO1xuXHRcdFx0XHRpZiAodXJsLmVuZHNXaXRoKCcvY29waWxvdF9pbnRlcm5hbC91c2VyJykpIHtcblx0XHRcdFx0XHR1c2VyQ291bnQrKztcblx0XHRcdFx0XHRyZXR1cm4gdXNlclJlc3BvbnNlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHVybC5lbmRzV2l0aCgnL21vZGVscycpKSB7XG5cdFx0XHRcdFx0bW9kZWxzQ291bnQrKztcblx0XHRcdFx0XHRyZXR1cm4gbW9kZWxzUmVzcG9uc2UoW3sgaWQ6ICdncHQtNG8tbWluaS1tb2RlbCcsIGNhcGFiaWxpdGllczogeyBmYW1pbHk6ICdncHQtNG8tbWluaScgfSB9XSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29tcGxldGlvbkNvdW50Kys7XG5cdFx0XHRcdHJldHVybiBjb21wbGV0aW9uQ291bnQgPT09IDFcblx0XHRcdFx0XHQ/IG5ldyBSZXNwb25zZSgnVW5hdXRob3JpemVkJywgeyBzdGF0dXM6IDQwMSwgc3RhdHVzVGV4dDogJ1VuYXV0aG9yaXplZCcgfSlcblx0XHRcdFx0XHQ6IG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7IGNob2ljZXM6IFt7IG1lc3NhZ2U6IHsgY29udGVudDogJ0dlbmVyYXRlZCB0aXRsZScgfSB9XSB9KSwgeyBzdGF0dXM6IDIwMCB9KTtcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IHsgbWVzc2FnZXM6IFt7IHJvbGU6ICd1c2VyJyBhcyBjb25zdCwgY29udGVudDogJ0dlbmVyYXRlIGEgdGl0bGUnIH1dIH07XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHNlcnZpY2UudXRpbGl0eUNoYXRDb21wbGV0aW9uKCdnaC1vYXV0aC10b2tlbicsIHJlcXVlc3QpKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UudXRpbGl0eUNoYXRDb21wbGV0aW9uKCdnaC1vYXV0aC10b2tlbicsIHJlcXVlc3QpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgdXNlckNvdW50LCBtb2RlbHNDb3VudCwgY29tcGxldGlvbkNvdW50IH0sIHtcblx0XHRcdFx0dXNlckNvdW50OiAyLFxuXHRcdFx0XHRtb2RlbHNDb3VudDogMixcblx0XHRcdFx0Y29tcGxldGlvbkNvdW50OiAyLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdub24tc3RyZWFtaW5nIHNlbmRzIHN0cmVhbT1mYWxzZSBpbiB0aGUgYm9keScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZmV0Y2g6IGZldGNoRm4sIGNhcHR1cmVkIH0gPSByb3V0aW5nRmV0Y2goXG5cdFx0XHRcdCgpID0+IGFudGhyb3BpY1Jlc3BvbnNlKFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ29rJyB9XSksXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZmV0Y2hGbik7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIGJhc2VSZXF1ZXN0KTtcblx0XHRcdGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKGNhcHR1cmVkKCkuaW5pdD8uYm9keSBhcyBzdHJpbmcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYm9keS5zdHJlYW0sIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlZmF1bHRzIHRvIG5vbi1zdHJlYW1pbmcgd2hlbiBzdHJlYW0gaXMgb21pdHRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZmV0Y2g6IGZldGNoRm4sIGNhcHR1cmVkIH0gPSByb3V0aW5nRmV0Y2goXG5cdFx0XHRcdCgpID0+IGFudGhyb3BpY1Jlc3BvbnNlKFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ29rJyB9XSksXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZmV0Y2hGbik7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIGJhc2VSZXF1ZXN0KTtcblx0XHRcdGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKGNhcHR1cmVkKCkuaW5pdD8uYm9keSBhcyBzdHJpbmcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYm9keS5zdHJlYW0sIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0cmVhbWluZyBzZW5kcyBzdHJlYW09dHJ1ZSBpbiB0aGUgYm9keScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZmV0Y2g6IGZldGNoRm4sIGNhcHR1cmVkIH0gPSByb3V0aW5nRmV0Y2goXG5cdFx0XHRcdCgpID0+IHNzZVJlc3BvbnNlKFtzc2VMaW5lcygnZGF0YToge1widHlwZVwiOlwibWVzc2FnZV9zdG9wXCJ9JyldKSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShmZXRjaEZuKTtcblxuXHRcdFx0YXdhaXQgY29sbGVjdChzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2snLCB7IC4uLmJhc2VSZXF1ZXN0LCBzdHJlYW06IHRydWUgYXMgY29uc3QgfSkpO1xuXHRcdFx0Y29uc3QgYm9keSA9IEpTT04ucGFyc2UoY2FwdHVyZWQoKS5pbml0Py5ib2R5IGFzIHN0cmluZyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChib2R5LnN0cmVhbSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZW5kcyBjb3JyZWN0IENBUEkgaGVhZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZmV0Y2g6IGZldGNoRm4sIGNhcHR1cmVkIH0gPSByb3V0aW5nRmV0Y2goXG5cdFx0XHRcdCgpID0+IGFudGhyb3BpY1Jlc3BvbnNlKFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ29rJyB9XSksXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZmV0Y2hGbik7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIGJhc2VSZXF1ZXN0KTtcblx0XHRcdGNvbnN0IGhlYWRlcnMgPSBjYXB0dXJlZCgpLmluaXQ/LmhlYWRlcnMgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbJ0NvbnRlbnQtVHlwZSddLCAnYXBwbGljYXRpb24vanNvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbJ0F1dGhvcml6YXRpb24nXSwgJ0JlYXJlciBnaC10b2snKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWydPcGVuQUktSW50ZW50J10sICdtZXNzYWdlcy1wcm94eScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbJ1gtSW50ZXJhY3Rpb24tVHlwZSddLCAnbWVzc2FnZXMtcHJveHknKTtcblx0XHRcdGFzc2VydC5vayhoZWFkZXJzWydYLVJlcXVlc3QtSWQnXSwgJ3Nob3VsZCBoYXZlIGEgcmVxdWVzdCBpZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGhlYWRlcnNbJ1gtR2l0SHViLUFwaS1WZXJzaW9uJ10sICdDQVBJQ2xpZW50IHNob3VsZCBpbmplY3QgQVBJIHZlcnNpb24nKTtcblx0XHRcdGFzc2VydC5vayhoZWFkZXJzWydWU2NvZGUtU2Vzc2lvbklkJ10sICdDQVBJQ2xpZW50IHNob3VsZCBpbmplY3Qgc2Vzc2lvbiBpZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFzc2VzIG1lc3NhZ2VzIHRocm91Z2ggYXMtaXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGZldGNoOiBmZXRjaEZuLCBjYXB0dXJlZCB9ID0gcm91dGluZ0ZldGNoKFxuXHRcdFx0XHQoKSA9PiBhbnRocm9waWNSZXNwb25zZShbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdvaycgfV0pLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGZldGNoRm4pO1xuXG5cdFx0XHRjb25zdCBtZXNzYWdlczogQW50aHJvcGljLk1lc3NhZ2VQYXJhbVtdID0gW1xuXHRcdFx0XHR7IHJvbGU6ICd1c2VyJywgY29udGVudDogJ1doYXQgaXMgMisyPycgfSxcblx0XHRcdFx0eyByb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogJzQnIH0sXG5cdFx0XHRcdHsgcm9sZTogJ3VzZXInLCBjb250ZW50OiAnVGhhbmtzIScgfSxcblx0XHRcdF07XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2snLCB7IC4uLmJhc2VSZXF1ZXN0LCBtZXNzYWdlcyB9KTtcblx0XHRcdGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKGNhcHR1cmVkKCkuaW5pdD8uYm9keSBhcyBzdHJpbmcpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJvZHkubWVzc2FnZXMsIG1lc3NhZ2VzKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NlbmRzIG1vZGVsIGluIHRoZSBib2R5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBmZXRjaDogZmV0Y2hGbiwgY2FwdHVyZWQgfSA9IHJvdXRpbmdGZXRjaChcblx0XHRcdFx0KCkgPT4gYW50aHJvcGljUmVzcG9uc2UoW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnb2snIH1dKSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShmZXRjaEZuKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgeyAuLi5iYXNlUmVxdWVzdCwgbW9kZWw6ICdjbGF1ZGUtb3B1cy00LTEtMjAyNTA4MDUnIH0pO1xuXHRcdFx0Y29uc3QgYm9keSA9IEpTT04ucGFyc2UoY2FwdHVyZWQoKS5pbml0Py5ib2R5IGFzIHN0cmluZyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChib2R5Lm1vZGVsLCAnY2xhdWRlLW9wdXMtNC0xLTIwMjUwODA1Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtZXJnZXMgY2FsbGVyLXByb3ZpZGVkIGhlYWRlcnMgaW50byB0aGUgcmVxdWVzdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZmV0Y2g6IGZldGNoRm4sIGNhcHR1cmVkIH0gPSByb3V0aW5nRmV0Y2goXG5cdFx0XHRcdCgpID0+IGFudGhyb3BpY1Jlc3BvbnNlKFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ29rJyB9XSksXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZmV0Y2hGbik7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIGJhc2VSZXF1ZXN0LCB7XG5cdFx0XHRcdGhlYWRlcnM6IHsgJ1gtQ3VzdG9tLVRyYWNlJzogJ2FiYy0xMjMnLCAnWC1TZXNzaW9uLUlkJzogJ3Nlc3MtNDU2JyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBoZWFkZXJzID0gY2FwdHVyZWQoKS5pbml0Py5oZWFkZXJzIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWydYLUN1c3RvbS1UcmFjZSddLCAnYWJjLTEyMycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbJ1gtU2Vzc2lvbi1JZCddLCAnc2Vzcy00NTYnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWydBdXRob3JpemF0aW9uJ10sICdCZWFyZXIgZ2gtdG9rJywgJ3N0YW5kYXJkIGhlYWRlcnMgc2hvdWxkIG5vdCBiZSBvdmVycmlkZGVuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYWxsZXItc3VwcGxpZWQgaGVhZGVycyBjYW5ub3Qgb3ZlcnJpZGUgc2VjdXJpdHktc2Vuc2l0aXZlIHN0YW5kYXJkIGhlYWRlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBEb2N1bWVudGVkIGludmFyaWFudDogQXV0aG9yaXphdGlvbiwgQ29udGVudC1UeXBlLCBYLVJlcXVlc3QtSWQsIE9wZW5BSS1JbnRlbnRcblx0XHRcdC8vIG11c3QgYWx3YXlzIHJlZmxlY3QgdGhlIHZhbHVlcyB0aGUgc2VydmljZSBjb21wdXRlcyBcdTIwMTQgbmV2ZXIgdGhlIGNhbGxlcidzLlxuXHRcdFx0Y29uc3QgeyBmZXRjaDogZmV0Y2hGbiwgY2FwdHVyZWQgfSA9IHJvdXRpbmdGZXRjaChcblx0XHRcdFx0KCkgPT4gYW50aHJvcGljUmVzcG9uc2UoW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnb2snIH1dKSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShmZXRjaEZuKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgYmFzZVJlcXVlc3QsIHtcblx0XHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcdCdBdXRob3JpemF0aW9uJzogJ0JlYXJlciBhdHRhY2tlci10b2tlbicsXG5cdFx0XHRcdFx0J0NvbnRlbnQtVHlwZSc6ICd0ZXh0L3BsYWluJyxcblx0XHRcdFx0XHQnWC1SZXF1ZXN0LUlkJzogJ2F0dGFja2VyLWlkJyxcblx0XHRcdFx0XHQnT3BlbkFJLUludGVudCc6ICdhdHRhY2tlci1pbnRlbnQnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBoZWFkZXJzID0gY2FwdHVyZWQoKS5pbml0Py5oZWFkZXJzIGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoZWFkZXJzWydBdXRob3JpemF0aW9uJ10sICdCZWFyZXIgZ2gtdG9rJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1snQ29udGVudC1UeXBlJ10sICdhcHBsaWNhdGlvbi9qc29uJyk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoaGVhZGVyc1snWC1SZXF1ZXN0LUlkJ10sICdhdHRhY2tlci1pZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbJ09wZW5BSS1JbnRlbnQnXSwgJ21lc3NhZ2VzLXByb3h5Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdXBwcmVzc0ludGVncmF0aW9uSWQgb3B0LWluIGNvbnRyb2xzIHRoZSBDb3BpbG90LUludGVncmF0aW9uLUlkIGhlYWRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZmV0Y2g6IGZldGNoRm4sIGNhcHR1cmVkIH0gPSByb3V0aW5nRmV0Y2goXG5cdFx0XHRcdCgpID0+IGFudGhyb3BpY1Jlc3BvbnNlKFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ29rJyB9XSksXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZmV0Y2hGbik7XG5cblx0XHRcdC8vIERlZmF1bHQgKG5vIG9wdC1pbik6IEB2c2NvZGUvY29waWxvdC1hcGkgZGVyaXZlcyBhbmQgc2VuZHMgdGhlIGhlYWRlci5cblx0XHRcdGF3YWl0IHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIGJhc2VSZXF1ZXN0KTtcblx0XHRcdGNvbnN0IHdpdGhIZWFkZXIgPSBjYXB0dXJlZCgpLmluaXQ/LmhlYWRlcnMgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcblxuXHRcdFx0Ly8gT3B0LWluOiB0aGUgaGVhZGVyIGlzIG9taXR0ZWQgZW50aXJlbHkgc28gQ0FQSSBhdXRob3JpemVzIGFnYWluc3Rcblx0XHRcdC8vIHRoZSB0b2tlbidzIHJlYWwgZW50aXRsZW1lbnQgaW5zdGVhZCBvZiB0aGUgZGVyaXZlZCBpbnRlZ3JhdGlvbiBpZC5cblx0XHRcdGF3YWl0IHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIGJhc2VSZXF1ZXN0LCB7IHN1cHByZXNzSW50ZWdyYXRpb25JZDogdHJ1ZSB9KTtcblx0XHRcdGNvbnN0IHN1cHByZXNzZWQgPSBjYXB0dXJlZCgpLmluaXQ/LmhlYWRlcnMgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcblxuXHRcdFx0YXNzZXJ0Lm9rKHdpdGhIZWFkZXJbJ0NvcGlsb3QtSW50ZWdyYXRpb24tSWQnXSwgJ2ludGVncmF0aW9uIGlkIHNob3VsZCBiZSBwcmVzZW50IGJ5IGRlZmF1bHQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdXBwcmVzc2VkWydDb3BpbG90LUludGVncmF0aW9uLUlkJ10sIHVuZGVmaW5lZCwgJ2ludGVncmF0aW9uIGlkIHNob3VsZCBiZSBzdXBwcmVzc2VkIHdoZW4gb3B0ZWQgaW4nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gTm9uLVN0cmVhbWluZyBSZXNwb25zZXNcblxuXHRzdWl0ZSgnTm9uLVN0cmVhbWluZyBSZXNwb25zZXMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRleHQgY29udGVudCBmcm9tIGEgc2luZ2xlIHRleHQgYmxvY2snLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGZldGNoOiBmZXRjaEZuIH0gPSByb3V0aW5nRmV0Y2goXG5cdFx0XHRcdCgpID0+IGFudGhyb3BpY1Jlc3BvbnNlKFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ1RoZSBhbnN3ZXIgaXMgNDIuJyB9XSksXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZmV0Y2hGbik7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIGJhc2VSZXF1ZXN0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUZXh0KHJlc3VsdCksICdUaGUgYW5zd2VyIGlzIDQyLicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29uY2F0ZW5hdGVzIG11bHRpcGxlIHRleHQgYmxvY2tzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBmZXRjaDogZmV0Y2hGbiB9ID0gcm91dGluZ0ZldGNoKFxuXHRcdFx0XHQoKSA9PiBhbnRocm9waWNSZXNwb25zZShbXG5cdFx0XHRcdFx0eyB0eXBlOiAndGV4dCcsIHRleHQ6ICdGaXJzdCBwYXJ0LiAnIH0sXG5cdFx0XHRcdFx0eyB0eXBlOiAndGV4dCcsIHRleHQ6ICdTZWNvbmQgcGFydC4nIH0sXG5cdFx0XHRcdF0pLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGZldGNoRm4pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2snLCBiYXNlUmVxdWVzdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGV4dChyZXN1bHQpLCAnRmlyc3QgcGFydC4gU2Vjb25kIHBhcnQuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lwcyBub24tdGV4dCBjb250ZW50IGJsb2NrcyAodG9vbF91c2UsIHRoaW5raW5nKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZmV0Y2g6IGZldGNoRm4gfSA9IHJvdXRpbmdGZXRjaChcblx0XHRcdFx0KCkgPT4gYW50aHJvcGljUmVzcG9uc2UoW1xuXHRcdFx0XHRcdHsgdHlwZTogJ3RoaW5raW5nJywgdGV4dDogJ2xldCBtZSB0aGluay4uLicgfSxcblx0XHRcdFx0XHR7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ3RoZSBhbnN3ZXInIH0sXG5cdFx0XHRcdFx0eyB0eXBlOiAndG9vbF91c2UnIH0sXG5cdFx0XHRcdF0pLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGZldGNoRm4pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2snLCBiYXNlUmVxdWVzdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0VGV4dChyZXN1bHQpLCAndGhlIGFuc3dlcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBlbXB0eSBzdHJpbmcgd2hlbiBubyB0ZXh0IGJsb2NrcyBhcmUgcHJlc2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZmV0Y2g6IGZldGNoRm4gfSA9IHJvdXRpbmdGZXRjaChcblx0XHRcdFx0KCkgPT4gYW50aHJvcGljUmVzcG9uc2UoW3sgdHlwZTogJ3Rvb2xfdXNlJyB9XSksXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZmV0Y2hGbik7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIGJhc2VSZXF1ZXN0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRUZXh0KHJlc3VsdCksICcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdGhlIHN0b3AgcmVhc29uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBmZXRjaDogZmV0Y2hGbiB9ID0gcm91dGluZ0ZldGNoKFxuXHRcdFx0XHQoKSA9PiBhbnRocm9waWNSZXNwb25zZShbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdvaycgfV0sICdtYXhfdG9rZW5zJyksXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZmV0Y2hGbik7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIGJhc2VSZXF1ZXN0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RvcF9yZWFzb24sICdtYXhfdG9rZW5zJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdG9wX3JlYXNvbiBpcyBudWxsIHdoZW4gbWlzc2luZyBmcm9tIHNlcnZlciByZXNwb25zZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgZmV0Y2g6IGZldGNoRm4gfSA9IHJvdXRpbmdGZXRjaCgoKSA9PiB7XG5cdFx0XHRcdHJldHVybiBuZXcgUmVzcG9uc2UoSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ29rJyB9XSxcblx0XHRcdFx0fSksIHsgc3RhdHVzOiAyMDAgfSk7XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGZldGNoRm4pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2snLCBiYXNlUmVxdWVzdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0b3BfcmVhc29uID8/IG51bGwsIG51bGwpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3dzIG9uIDQyOSByYXRlIGxpbWl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBmZXRjaDogZmV0Y2hGbiB9ID0gcm91dGluZ0ZldGNoKFxuXHRcdFx0XHQoKSA9PiBuZXcgUmVzcG9uc2UoJ3tcImVycm9yXCI6XCJyYXRlX2xpbWl0ZWRcIn0nLCB7IHN0YXR1czogNDI5LCBzdGF0dXNUZXh0OiAnVG9vIE1hbnkgUmVxdWVzdHMnIH0pLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGZldGNoRm4pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0KCkgPT4gc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgYmFzZVJlcXVlc3QpLFxuXHRcdFx0XHQoZXJyOiB1bmtub3duKSA9PiBlcnIgaW5zdGFuY2VvZiBDb3BpbG90QXBpRXJyb3Jcblx0XHRcdFx0XHQmJiBlcnIuc3RhdHVzID09PSA0Mjlcblx0XHRcdFx0XHQmJiBlcnIubWVzc2FnZS5pbmNsdWRlcygnQ0FQSSByZXF1ZXN0IGZhaWxlZDogNDI5JyksXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3dzIG9uIDUwMCBzZXJ2ZXIgZXJyb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGZldGNoOiBmZXRjaEZuIH0gPSByb3V0aW5nRmV0Y2goXG5cdFx0XHRcdCgpID0+IG5ldyBSZXNwb25zZSgnaW50ZXJuYWwgc2VydmVyIGVycm9yJywgeyBzdGF0dXM6IDUwMCwgc3RhdHVzVGV4dDogJ0ludGVybmFsIFNlcnZlciBFcnJvcicgfSksXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZmV0Y2hGbik7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHQoKSA9PiBzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2snLCBiYXNlUmVxdWVzdCksXG5cdFx0XHRcdChlcnI6IHVua25vd24pID0+IGVyciBpbnN0YW5jZW9mIENvcGlsb3RBcGlFcnJvclxuXHRcdFx0XHRcdCYmIGVyci5zdGF0dXMgPT09IDUwMFxuXHRcdFx0XHRcdCYmIGVyci5tZXNzYWdlLmluY2x1ZGVzKCdDQVBJIHJlcXVlc3QgZmFpbGVkOiA1MDAnKSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIFN0cmVhbWluZyBSZXNwb25zZXNcblxuXHRzdWl0ZSgnU3RyZWFtaW5nIFJlc3BvbnNlcycsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIGNvbGxlY3RUZXh0RGVsdGFzKGV2ZW50czogQW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudFtdKTogc3RyaW5nW10ge1xuXHRcdFx0cmV0dXJuIGV2ZW50c1xuXHRcdFx0XHQuZmlsdGVyKChlKTogZSBpcyBBbnRocm9waWMuUmF3Q29udGVudEJsb2NrRGVsdGFFdmVudCA9PlxuXHRcdFx0XHRcdGUudHlwZSA9PT0gJ2NvbnRlbnRfYmxvY2tfZGVsdGEnICYmIGUuZGVsdGEudHlwZSA9PT0gJ3RleHRfZGVsdGEnKVxuXHRcdFx0XHQubWFwKGUgPT4gKGUuZGVsdGEgYXMgQW50aHJvcGljLlRleHREZWx0YSkudGV4dCk7XG5cdFx0fVxuXG5cdFx0dGVzdCgneWllbGRzIHRleHQgZGVsdGFzIGZyb20gY29udGVudF9ibG9ja19kZWx0YSBldmVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gc3RyZWFtU2VydmljZShbXG5cdFx0XHRcdHNzZUxpbmVzKFxuXHRcdFx0XHRcdCdldmVudDogY29udGVudF9ibG9ja19kZWx0YScsXG5cdFx0XHRcdFx0J2RhdGE6IHtcInR5cGVcIjpcImNvbnRlbnRfYmxvY2tfZGVsdGFcIixcImluZGV4XCI6MCxcImRlbHRhXCI6e1widHlwZVwiOlwidGV4dF9kZWx0YVwiLFwidGV4dFwiOlwiSGVsbG9cIn19Jyxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnZXZlbnQ6IGNvbnRlbnRfYmxvY2tfZGVsdGEnLFxuXHRcdFx0XHRcdCdkYXRhOiB7XCJ0eXBlXCI6XCJjb250ZW50X2Jsb2NrX2RlbHRhXCIsXCJpbmRleFwiOjAsXCJkZWx0YVwiOntcInR5cGVcIjpcInRleHRfZGVsdGFcIixcInRleHRcIjpcIiB3b3JsZFwifX0nLFxuXHRcdFx0XHQpLFxuXHRcdFx0XHRzc2VMaW5lcyhcblx0XHRcdFx0XHQnZXZlbnQ6IG1lc3NhZ2Vfc3RvcCcsXG5cdFx0XHRcdFx0J2RhdGE6IHtcInR5cGVcIjpcIm1lc3NhZ2Vfc3RvcFwifScsXG5cdFx0XHRcdCksXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZXZlbnRzID0gYXdhaXQgY29sbGVjdChzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2snLCB7IC4uLmJhc2VSZXF1ZXN0LCBzdHJlYW06IHRydWUgYXMgY29uc3QgfSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2xsZWN0VGV4dERlbHRhcyhldmVudHMpLCBbJ0hlbGxvJywgJyB3b3JsZCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgZGF0YSBzcGxpdCBhY3Jvc3MgbXVsdGlwbGUgbmV0d29yayBjaHVua3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbmNvZGVyID0gbmV3IFRleHRFbmNvZGVyKCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gc3RyZWFtU2VydmljZShbXG5cdFx0XHRcdGVuY29kZXIuZW5jb2RlKCdldmVudDogY29udGVudF9ibG9ja19kZWx0YVxcbmRhdGE6IHtcInR5cGVcIjpcImNvbnRlbnRfYmwnKSxcblx0XHRcdFx0ZW5jb2Rlci5lbmNvZGUoJ29ja19kZWx0YVwiLFwiaW5kZXhcIjowLFwiZGVsdGFcIjp7XCJ0eXBlXCI6XCJ0ZXh0X2RlbHRhXCIsXCJ0ZXh0XCI6XCJzcGxpdFwifX1cXG4nKSxcblx0XHRcdFx0c3NlTGluZXMoXG5cdFx0XHRcdFx0J2V2ZW50OiBtZXNzYWdlX3N0b3AnLFxuXHRcdFx0XHRcdCdkYXRhOiB7XCJ0eXBlXCI6XCJtZXNzYWdlX3N0b3BcIn0nLFxuXHRcdFx0XHQpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGV2ZW50cyA9IGF3YWl0IGNvbGxlY3Qoc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgeyAuLi5iYXNlUmVxdWVzdCwgc3RyZWFtOiB0cnVlIGFzIGNvbnN0IH0pKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29sbGVjdFRleHREZWx0YXMoZXZlbnRzKSwgWydzcGxpdCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgYSBkYXRhIGxpbmUgc3BsaXQgcmlnaHQgYXQgdGhlIG5ld2xpbmUgYm91bmRhcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbmNvZGVyID0gbmV3IFRleHRFbmNvZGVyKCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gc3RyZWFtU2VydmljZShbXG5cdFx0XHRcdGVuY29kZXIuZW5jb2RlKCdkYXRhOiB7XCJ0eXBlXCI6XCJjb250ZW50X2Jsb2NrX2RlbHRhXCIsXCJpbmRleFwiOjAsXCJkZWx0YVwiOntcInR5cGVcIjpcInRleHRfZGVsdGFcIixcInRleHRcIjpcImNodW5rMVwifX0nKSxcblx0XHRcdFx0ZW5jb2Rlci5lbmNvZGUoJ1xcbmRhdGE6IHtcInR5cGVcIjpcImNvbnRlbnRfYmxvY2tfZGVsdGFcIixcImluZGV4XCI6MCxcImRlbHRhXCI6e1widHlwZVwiOlwidGV4dF9kZWx0YVwiLFwidGV4dFwiOlwiY2h1bmsyXCJ9fVxcbicpLFxuXHRcdFx0XHRzc2VMaW5lcygnZGF0YToge1widHlwZVwiOlwibWVzc2FnZV9zdG9wXCJ9JyksXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZXZlbnRzID0gYXdhaXQgY29sbGVjdChzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2snLCB7IC4uLmJhc2VSZXF1ZXN0LCBzdHJlYW06IHRydWUgYXMgY29uc3QgfSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2xsZWN0VGV4dERlbHRhcyhldmVudHMpLCBbJ2NodW5rMScsICdjaHVuazInXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lwcyBldmVudDogbGluZXMsIGNvbW1lbnQgbGluZXMsIGFuZCBibGFuayBsaW5lcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBzdHJlYW1TZXJ2aWNlKFtcblx0XHRcdFx0c3NlTGluZXMoXG5cdFx0XHRcdFx0Jzoga2VlcC1hbGl2ZSBjb21tZW50Jyxcblx0XHRcdFx0XHQnZXZlbnQ6IGNvbnRlbnRfYmxvY2tfZGVsdGEnLFxuXHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdCdkYXRhOiB7XCJ0eXBlXCI6XCJjb250ZW50X2Jsb2NrX2RlbHRhXCIsXCJpbmRleFwiOjAsXCJkZWx0YVwiOntcInR5cGVcIjpcInRleHRfZGVsdGFcIixcInRleHRcIjpcIm9rXCJ9fScsXG5cdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0J2V2ZW50OiBtZXNzYWdlX3N0b3AnLFxuXHRcdFx0XHRcdCdkYXRhOiB7XCJ0eXBlXCI6XCJtZXNzYWdlX3N0b3BcIn0nLFxuXHRcdFx0XHQpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGV2ZW50cyA9IGF3YWl0IGNvbGxlY3Qoc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgeyAuLi5iYXNlUmVxdWVzdCwgc3RyZWFtOiB0cnVlIGFzIGNvbnN0IH0pKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29sbGVjdFRleHREZWx0YXMoZXZlbnRzKSwgWydvayddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgbWFueSBzbWFsbCBkZWx0YXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWx0YXMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiAxMDAgfSwgKF8sIGkpID0+XG5cdFx0XHRcdGBkYXRhOiB7XCJ0eXBlXCI6XCJjb250ZW50X2Jsb2NrX2RlbHRhXCIsXCJpbmRleFwiOjAsXCJkZWx0YVwiOntcInR5cGVcIjpcInRleHRfZGVsdGFcIixcInRleHRcIjpcIncke2l9XCJ9fWBcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gc3RyZWFtU2VydmljZShbXG5cdFx0XHRcdHNzZUxpbmVzKC4uLmRlbHRhcyksXG5cdFx0XHRcdHNzZUxpbmVzKCdkYXRhOiB7XCJ0eXBlXCI6XCJtZXNzYWdlX3N0b3BcIn0nKSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCB0ZXh0cyA9IGNvbGxlY3RUZXh0RGVsdGFzKGF3YWl0IGNvbGxlY3Qoc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgeyAuLi5iYXNlUmVxdWVzdCwgc3RyZWFtOiB0cnVlIGFzIGNvbnN0IH0pKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dHMubGVuZ3RoLCAxMDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRzWzBdLCAndzAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0c1s5OV0sICd3OTknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rocm93cyBvbiBlcnJvciBldmVudCB3aXRoIG1lc3NhZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gc3RyZWFtU2VydmljZShbXG5cdFx0XHRcdHNzZUxpbmVzKFxuXHRcdFx0XHRcdCdldmVudDogZXJyb3InLFxuXHRcdFx0XHRcdCdkYXRhOiB7XCJ0eXBlXCI6XCJlcnJvclwiLFwiZXJyb3JcIjp7XCJtZXNzYWdlXCI6XCJvdmVybG9hZGVkXCJ9fScsXG5cdFx0XHRcdCksXG5cdFx0XHRdKTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdCgpID0+IGNvbGxlY3Qoc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgeyAuLi5iYXNlUmVxdWVzdCwgc3RyZWFtOiB0cnVlIGFzIGNvbnN0IH0pKSxcblx0XHRcdFx0KGVycjogdW5rbm93bikgPT4gZXJyIGluc3RhbmNlb2YgQ29waWxvdEFwaUVycm9yXG5cdFx0XHRcdFx0JiYgZXJyLnN0YXR1cyA9PT0gQ09QSUxPVF9BUElfRVJST1JfU1RBVFVTX1NUUkVBTUlOR1xuXHRcdFx0XHRcdCYmIGVyci5tZXNzYWdlID09PSAnb3ZlcmxvYWRlZCcsXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3dzIG9uIGVycm9yIGV2ZW50IHdpdGhvdXQgbWVzc2FnZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBzdHJlYW1TZXJ2aWNlKFtcblx0XHRcdFx0c3NlTGluZXMoXG5cdFx0XHRcdFx0J2V2ZW50OiBlcnJvcicsXG5cdFx0XHRcdFx0J2RhdGE6IHtcInR5cGVcIjpcImVycm9yXCIsXCJlcnJvclwiOnt9fScsXG5cdFx0XHRcdCksXG5cdFx0XHRdKTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdCgpID0+IGNvbGxlY3Qoc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgeyAuLi5iYXNlUmVxdWVzdCwgc3RyZWFtOiB0cnVlIGFzIGNvbnN0IH0pKSxcblx0XHRcdFx0KGVycjogdW5rbm93bikgPT4gZXJyIGluc3RhbmNlb2YgQ29waWxvdEFwaUVycm9yXG5cdFx0XHRcdFx0JiYgZXJyLnN0YXR1cyA9PT0gQ09QSUxPVF9BUElfRVJST1JfU1RBVFVTX1NUUkVBTUlOR1xuXHRcdFx0XHRcdCYmIGVyci5tZXNzYWdlID09PSAnVW5rbm93biBzdHJlYW1pbmcgZXJyb3InLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rocm93cyBvbiBub24tMjAwIENBUEkgcmVzcG9uc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGZldGNoOiBmZXRjaEZuIH0gPSByb3V0aW5nRmV0Y2goXG5cdFx0XHRcdCgpID0+IG5ldyBSZXNwb25zZSgnb3ZlcmxvYWRlZCcsIHsgc3RhdHVzOiA1MjksIHN0YXR1c1RleHQ6ICdPdmVybG9hZGVkJyB9KSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShmZXRjaEZuKTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdCgpID0+IGNvbGxlY3Qoc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgeyAuLi5iYXNlUmVxdWVzdCwgc3RyZWFtOiB0cnVlIGFzIGNvbnN0IH0pKSxcblx0XHRcdFx0KGVycjogdW5rbm93bikgPT4gZXJyIGluc3RhbmNlb2YgQ29waWxvdEFwaUVycm9yXG5cdFx0XHRcdFx0JiYgZXJyLnN0YXR1cyA9PT0gNTI5XG5cdFx0XHRcdFx0JiYgZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ0NBUEkgcmVxdWVzdCBmYWlsZWQ6IDUyOScpLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rocm93cyB3aGVuIHJlc3BvbnNlIGhhcyBubyBib2R5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBmZXRjaDogZmV0Y2hGbiB9ID0gcm91dGluZ0ZldGNoKFxuXHRcdFx0XHQoKSA9PiBuZXcgUmVzcG9uc2UobnVsbCwgeyBzdGF0dXM6IDIwMCB9KSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShmZXRjaEZuKTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdCgpID0+IGNvbGxlY3Qoc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgeyAuLi5iYXNlUmVxdWVzdCwgc3RyZWFtOiB0cnVlIGFzIGNvbnN0IH0pKSxcblx0XHRcdFx0KGVycjogRXJyb3IpID0+IGVyci5tZXNzYWdlLmluY2x1ZGVzKCdubyBib2R5JyksXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3Vydml2ZXMgbWFsZm9ybWVkIEpTT04gaW4gdGhlIHN0cmVhbSAoc2tpcHMgdGhlIGxpbmUpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IHN0cmVhbVNlcnZpY2UoW1xuXHRcdFx0XHRzc2VMaW5lcyhcblx0XHRcdFx0XHQnZGF0YTogbm90LXZhbGlkLWpzb24nLFxuXHRcdFx0XHRcdCdkYXRhOiB7XCJ0eXBlXCI6XCJjb250ZW50X2Jsb2NrX2RlbHRhXCIsXCJpbmRleFwiOjAsXCJkZWx0YVwiOntcInR5cGVcIjpcInRleHRfZGVsdGFcIixcInRleHRcIjpcIm9rXCJ9fScsXG5cdFx0XHRcdFx0J2RhdGE6IHtcInR5cGVcIjpcIm1lc3NhZ2Vfc3RvcFwifScsXG5cdFx0XHRcdCksXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZXZlbnRzID0gYXdhaXQgY29sbGVjdChzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2snLCB7IC4uLmJhc2VSZXF1ZXN0LCBzdHJlYW06IHRydWUgYXMgY29uc3QgfSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2xsZWN0VGV4dERlbHRhcyhldmVudHMpLCBbJ29rJ10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBSYXcgRXZlbnQgU3RyZWFtIChtZXNzYWdlcygpKVxuXG5cdHN1aXRlKCdSYXcgRXZlbnQgU3RyZWFtIChtZXNzYWdlcygpKScsICgpID0+IHtcblxuXHRcdHRlc3QoJ3lpZWxkcyBhbGwgc2l4IHByb3RvY29sIGV2ZW50IHR5cGVzIGluIG9yZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IHN0cmVhbVNlcnZpY2UoW1xuXHRcdFx0XHRzc2VMaW5lcyhcblx0XHRcdFx0XHQnZGF0YToge1widHlwZVwiOlwibWVzc2FnZV9zdGFydFwiLFwibWVzc2FnZVwiOntcImlkXCI6XCJtc2dfMVwiLFwidHlwZVwiOlwibWVzc2FnZVwiLFwicm9sZVwiOlwiYXNzaXN0YW50XCIsXCJjb250ZW50XCI6W10sXCJtb2RlbFwiOlwiY2xhdWRlLXNvbm5ldC00LTVcIixcInN0b3BfcmVhc29uXCI6bnVsbCxcInVzYWdlXCI6e1wiaW5wdXRfdG9rZW5zXCI6MSxcIm91dHB1dF90b2tlbnNcIjoxfX19Jyxcblx0XHRcdFx0XHQnZGF0YToge1widHlwZVwiOlwiY29udGVudF9ibG9ja19zdGFydFwiLFwiaW5kZXhcIjowLFwiY29udGVudF9ibG9ja1wiOntcInR5cGVcIjpcInRleHRcIixcInRleHRcIjpcIlwifX0nLFxuXHRcdFx0XHRcdCdkYXRhOiB7XCJ0eXBlXCI6XCJjb250ZW50X2Jsb2NrX2RlbHRhXCIsXCJpbmRleFwiOjAsXCJkZWx0YVwiOntcInR5cGVcIjpcInRleHRfZGVsdGFcIixcInRleHRcIjpcImhpXCJ9fScsXG5cdFx0XHRcdFx0J2RhdGE6IHtcInR5cGVcIjpcImNvbnRlbnRfYmxvY2tfc3RvcFwiLFwiaW5kZXhcIjowfScsXG5cdFx0XHRcdFx0J2RhdGE6IHtcInR5cGVcIjpcIm1lc3NhZ2VfZGVsdGFcIixcImRlbHRhXCI6e1wic3RvcF9yZWFzb25cIjpcImVuZF90dXJuXCJ9LFwidXNhZ2VcIjp7XCJvdXRwdXRfdG9rZW5zXCI6MX19Jyxcblx0XHRcdFx0XHQnZGF0YToge1widHlwZVwiOlwibWVzc2FnZV9zdG9wXCJ9Jyxcblx0XHRcdFx0KSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBldmVudHMgPSBhd2FpdCBjb2xsZWN0KHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIHsgLi4uYmFzZVJlcXVlc3QsIHN0cmVhbTogdHJ1ZSBhcyBjb25zdCB9KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cy5tYXAoZSA9PiBlLnR5cGUpLCBbXG5cdFx0XHRcdCdtZXNzYWdlX3N0YXJ0Jyxcblx0XHRcdFx0J2NvbnRlbnRfYmxvY2tfc3RhcnQnLFxuXHRcdFx0XHQnY29udGVudF9ibG9ja19kZWx0YScsXG5cdFx0XHRcdCdjb250ZW50X2Jsb2NrX3N0b3AnLFxuXHRcdFx0XHQnbWVzc2FnZV9kZWx0YScsXG5cdFx0XHRcdCdtZXNzYWdlX3N0b3AnLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtZXNzYWdlX3N0b3AgaXMgdGhlIGxhc3QgeWllbGRlZCBldmVudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBzdHJlYW1TZXJ2aWNlKFtcblx0XHRcdFx0c3NlTGluZXMoXG5cdFx0XHRcdFx0J2RhdGE6IHtcInR5cGVcIjpcImNvbnRlbnRfYmxvY2tfZGVsdGFcIixcImluZGV4XCI6MCxcImRlbHRhXCI6e1widHlwZVwiOlwidGV4dF9kZWx0YVwiLFwidGV4dFwiOlwiYVwifX0nLFxuXHRcdFx0XHRcdCdkYXRhOiB7XCJ0eXBlXCI6XCJtZXNzYWdlX3N0b3BcIn0nLFxuXHRcdFx0XHQpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGV2ZW50cyA9IGF3YWl0IGNvbGxlY3Qoc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgeyAuLi5iYXNlUmVxdWVzdCwgc3RyZWFtOiB0cnVlIGFzIGNvbnN0IH0pKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHNbZXZlbnRzLmxlbmd0aCAtIDFdLnR5cGUsICdtZXNzYWdlX3N0b3AnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0b3BzIGFmdGVyIG1lc3NhZ2Vfc3RvcCBldmVuIGlmIGV4dHJhIFNTRSBkYXRhIGZvbGxvd3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gc3RyZWFtU2VydmljZShbXG5cdFx0XHRcdHNzZUxpbmVzKFxuXHRcdFx0XHRcdCdkYXRhOiB7XCJ0eXBlXCI6XCJjb250ZW50X2Jsb2NrX2RlbHRhXCIsXCJpbmRleFwiOjAsXCJkZWx0YVwiOntcInR5cGVcIjpcInRleHRfZGVsdGFcIixcInRleHRcIjpcImFcIn19Jyxcblx0XHRcdFx0XHQnZGF0YToge1widHlwZVwiOlwibWVzc2FnZV9zdG9wXCJ9Jyxcblx0XHRcdFx0XHQnZGF0YToge1widHlwZVwiOlwiY29udGVudF9ibG9ja19kZWx0YVwiLFwiaW5kZXhcIjowLFwiZGVsdGFcIjp7XCJ0eXBlXCI6XCJ0ZXh0X2RlbHRhXCIsXCJ0ZXh0XCI6XCJTSE9VTERfTk9UX0FQUEVBUlwifX0nLFxuXHRcdFx0XHQpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGV2ZW50cyA9IGF3YWl0IGNvbGxlY3Qoc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgeyAuLi5iYXNlUmVxdWVzdCwgc3RyZWFtOiB0cnVlIGFzIGNvbnN0IH0pKTtcblx0XHRcdGNvbnN0IHRleHRzID0gZXZlbnRzXG5cdFx0XHRcdC5maWx0ZXIoKGUpOiBlIGlzIEFudGhyb3BpYy5SYXdDb250ZW50QmxvY2tEZWx0YUV2ZW50ID0+IGUudHlwZSA9PT0gJ2NvbnRlbnRfYmxvY2tfZGVsdGEnKVxuXHRcdFx0XHQubWFwKGUgPT4gZS5kZWx0YS50eXBlID09PSAndGV4dF9kZWx0YScgPyBlLmRlbHRhLnRleHQgOiAnJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRleHRzLCBbJ2EnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd5aWVsZHMgdGhpbmtpbmdfZGVsdGEgZXZlbnRzIChub3QgZmlsdGVyZWQgYnkgbWVzc2FnZXMoKSknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gc3RyZWFtU2VydmljZShbXG5cdFx0XHRcdHNzZUxpbmVzKFxuXHRcdFx0XHRcdCdkYXRhOiB7XCJ0eXBlXCI6XCJjb250ZW50X2Jsb2NrX2RlbHRhXCIsXCJpbmRleFwiOjAsXCJkZWx0YVwiOntcInR5cGVcIjpcInRoaW5raW5nX2RlbHRhXCIsXCJ0aGlua2luZ1wiOlwiaG1tXCJ9fScsXG5cdFx0XHRcdFx0J2RhdGE6IHtcInR5cGVcIjpcIm1lc3NhZ2Vfc3RvcFwifScsXG5cdFx0XHRcdCksXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZXZlbnRzID0gYXdhaXQgY29sbGVjdChzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2snLCB7IC4uLmJhc2VSZXF1ZXN0LCBzdHJlYW06IHRydWUgYXMgY29uc3QgfSkpO1xuXHRcdFx0Y29uc3QgZGVsdGEgPSBldmVudHMuZmluZCgoZSk6IGUgaXMgQW50aHJvcGljLlJhd0NvbnRlbnRCbG9ja0RlbHRhRXZlbnQgPT4gZS50eXBlID09PSAnY29udGVudF9ibG9ja19kZWx0YScpO1xuXHRcdFx0YXNzZXJ0Lm9rKGRlbHRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWx0YS5kZWx0YS50eXBlLCAndGhpbmtpbmdfZGVsdGEnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3lpZWxkcyBpbnB1dF9qc29uX2RlbHRhIGV2ZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBzdHJlYW1TZXJ2aWNlKFtcblx0XHRcdFx0c3NlTGluZXMoXG5cdFx0XHRcdFx0J2RhdGE6IHtcInR5cGVcIjpcImNvbnRlbnRfYmxvY2tfZGVsdGFcIixcImluZGV4XCI6MCxcImRlbHRhXCI6e1widHlwZVwiOlwiaW5wdXRfanNvbl9kZWx0YVwiLFwicGFydGlhbF9qc29uXCI6XCJ7XFxcXFwia1xcXFxcIjoxfVwifX0nLFxuXHRcdFx0XHRcdCdkYXRhOiB7XCJ0eXBlXCI6XCJtZXNzYWdlX3N0b3BcIn0nLFxuXHRcdFx0XHQpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGV2ZW50cyA9IGF3YWl0IGNvbGxlY3Qoc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgeyAuLi5iYXNlUmVxdWVzdCwgc3RyZWFtOiB0cnVlIGFzIGNvbnN0IH0pKTtcblx0XHRcdGNvbnN0IGRlbHRhID0gZXZlbnRzLmZpbmQoKGUpOiBlIGlzIEFudGhyb3BpYy5SYXdDb250ZW50QmxvY2tEZWx0YUV2ZW50ID0+IGUudHlwZSA9PT0gJ2NvbnRlbnRfYmxvY2tfZGVsdGEnKTtcblx0XHRcdGFzc2VydC5vayhkZWx0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVsdGEuZGVsdGEudHlwZSwgJ2lucHV0X2pzb25fZGVsdGEnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3lpZWxkcyBtZXNzYWdlX2RlbHRhIHdpdGggc3RvcF9yZWFzb24gcGF5bG9hZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBzdHJlYW1TZXJ2aWNlKFtcblx0XHRcdFx0c3NlTGluZXMoXG5cdFx0XHRcdFx0J2RhdGE6IHtcInR5cGVcIjpcIm1lc3NhZ2VfZGVsdGFcIixcImRlbHRhXCI6e1wic3RvcF9yZWFzb25cIjpcIm1heF90b2tlbnNcIixcInN0b3Bfc2VxdWVuY2VcIjpudWxsfSxcInVzYWdlXCI6e1wib3V0cHV0X3Rva2Vuc1wiOjd9fScsXG5cdFx0XHRcdFx0J2RhdGE6IHtcInR5cGVcIjpcIm1lc3NhZ2Vfc3RvcFwifScsXG5cdFx0XHRcdCksXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZXZlbnRzID0gYXdhaXQgY29sbGVjdChzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2snLCB7IC4uLmJhc2VSZXF1ZXN0LCBzdHJlYW06IHRydWUgYXMgY29uc3QgfSkpO1xuXHRcdFx0Y29uc3QgbXNnRGVsdGEgPSBldmVudHMuZmluZCgoZSk6IGUgaXMgQW50aHJvcGljLlJhd01lc3NhZ2VEZWx0YUV2ZW50ID0+IGUudHlwZSA9PT0gJ21lc3NhZ2VfZGVsdGEnKTtcblx0XHRcdGFzc2VydC5vayhtc2dEZWx0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobXNnRGVsdGEuZGVsdGEuc3RvcF9yZWFzb24sICdtYXhfdG9rZW5zJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0b29sX3VzZSBibG9jayBldmVudHMgcm91bmQtdHJpcCB0aHJvdWdoIG1lc3NhZ2VzKCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gc3RyZWFtU2VydmljZShbXG5cdFx0XHRcdHNzZUxpbmVzKFxuXHRcdFx0XHRcdCdkYXRhOiB7XCJ0eXBlXCI6XCJjb250ZW50X2Jsb2NrX3N0YXJ0XCIsXCJpbmRleFwiOjAsXCJjb250ZW50X2Jsb2NrXCI6e1widHlwZVwiOlwidG9vbF91c2VcIixcImlkXCI6XCJ0dV8xXCIsXCJuYW1lXCI6XCJyZWFkX2ZpbGVcIixcImlucHV0XCI6e319fScsXG5cdFx0XHRcdFx0J2RhdGE6IHtcInR5cGVcIjpcImNvbnRlbnRfYmxvY2tfZGVsdGFcIixcImluZGV4XCI6MCxcImRlbHRhXCI6e1widHlwZVwiOlwiaW5wdXRfanNvbl9kZWx0YVwiLFwicGFydGlhbF9qc29uXCI6XCJ7XFxcXFwicGF0aFxcXFxcIjpcIn19Jyxcblx0XHRcdFx0XHQnZGF0YToge1widHlwZVwiOlwiY29udGVudF9ibG9ja19kZWx0YVwiLFwiaW5kZXhcIjowLFwiZGVsdGFcIjp7XCJ0eXBlXCI6XCJpbnB1dF9qc29uX2RlbHRhXCIsXCJwYXJ0aWFsX2pzb25cIjpcIlxcXFxcIi90bXAveFxcXFxcIn1cIn19Jyxcblx0XHRcdFx0XHQnZGF0YToge1widHlwZVwiOlwiY29udGVudF9ibG9ja19zdG9wXCIsXCJpbmRleFwiOjB9Jyxcblx0XHRcdFx0XHQnZGF0YToge1widHlwZVwiOlwibWVzc2FnZV9zdG9wXCJ9Jyxcblx0XHRcdFx0KSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBldmVudHMgPSBhd2FpdCBjb2xsZWN0KHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIHsgLi4uYmFzZVJlcXVlc3QsIHN0cmVhbTogdHJ1ZSBhcyBjb25zdCB9KSk7XG5cdFx0XHRjb25zdCBibG9ja1N0YXJ0ID0gZXZlbnRzLmZpbmQoKGUpOiBlIGlzIEFudGhyb3BpYy5SYXdDb250ZW50QmxvY2tTdGFydEV2ZW50ID0+IGUudHlwZSA9PT0gJ2NvbnRlbnRfYmxvY2tfc3RhcnQnKTtcblx0XHRcdGFzc2VydC5vayhibG9ja1N0YXJ0LCAnZXhwZWN0ZWQgY29udGVudF9ibG9ja19zdGFydCBldmVudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJsb2NrU3RhcnQuY29udGVudF9ibG9jay50eXBlLCAndG9vbF91c2UnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYmxvY2tTdGFydC5jb250ZW50X2Jsb2NrIGFzIEFudGhyb3BpYy5Ub29sVXNlQmxvY2spLm5hbWUsICdyZWFkX2ZpbGUnKTtcblxuXHRcdFx0Y29uc3QganNvbkRlbHRhcyA9IGV2ZW50cy5maWx0ZXIoXG5cdFx0XHRcdChlKTogZSBpcyBBbnRocm9waWMuUmF3Q29udGVudEJsb2NrRGVsdGFFdmVudCA9PlxuXHRcdFx0XHRcdGUudHlwZSA9PT0gJ2NvbnRlbnRfYmxvY2tfZGVsdGEnICYmIGUuZGVsdGEudHlwZSA9PT0gJ2lucHV0X2pzb25fZGVsdGEnLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChqc29uRGVsdGFzLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzW2V2ZW50cy5sZW5ndGggLSAxXS50eXBlLCAnbWVzc2FnZV9zdG9wJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIGNvdW50VG9rZW5zXG5cblx0c3VpdGUoJ2NvdW50VG9rZW5zJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgndGhyb3dzIFwiY291bnRUb2tlbnMgbm90IHN1cHBvcnRlZCBieSBDQVBJXCInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyAoKSA9PiBuZXcgUmVzcG9uc2UoJ3t9JywgeyBzdGF0dXM6IDIwMCB9KSk7XG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0KCkgPT4gc2VydmljZS5jb3VudFRva2VucygnZ2gtdG9rJywgeyBtb2RlbDogJ2NsYXVkZS1zb25uZXQtNC01JywgbWVzc2FnZXM6IFt7IHJvbGU6ICd1c2VyJywgY29udGVudDogJ2hpJyB9XSB9KSxcblx0XHRcdFx0KGVycjogRXJyb3IpID0+IGVyci5tZXNzYWdlLmluY2x1ZGVzKCdjb3VudFRva2VucyBub3Qgc3VwcG9ydGVkIGJ5IENBUEknKSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBtaW50IGEgdG9rZW4gYmVmb3JlIHRocm93aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IG1pbnRDb3VudCA9IDA7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyAoaW5wdXQpID0+IHtcblx0XHRcdFx0Y29uc3QgdXJsID0gZ2V0VXJsKGlucHV0KTtcblx0XHRcdFx0aWYgKHVybC5pbmNsdWRlcygnL2NvcGlsb3RfaW50ZXJuYWwnKSkge1xuXHRcdFx0XHRcdG1pbnRDb3VudCsrO1xuXHRcdFx0XHRcdHJldHVybiB0b2tlblJlc3BvbnNlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG5ldyBSZXNwb25zZSgne30nLCB7IHN0YXR1czogMjAwIH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHQoKSA9PiBzZXJ2aWNlLmNvdW50VG9rZW5zKCdnaC10b2snLCB7IG1vZGVsOiAnY2xhdWRlLXNvbm5ldC00LTUnLCBtZXNzYWdlczogW3sgcm9sZTogJ3VzZXInLCBjb250ZW50OiAnaGknIH1dIH0pLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaW50Q291bnQsIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBTdHJlYW1pbmcgKyBOb24tU3RyZWFtaW5nIFNoYXJlZCBCZWhhdmlvclxuXG5cdHN1aXRlKCdTaGFyZWQgQmVoYXZpb3InLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdzdHJlYW1pbmcgYW5kIG5vbi1zdHJlYW1pbmcgaGl0IHRoZSBzYW1lIC92MS9tZXNzYWdlcyBlbmRwb2ludCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHVybHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyAoaW5wdXQpID0+IHtcblx0XHRcdFx0Y29uc3QgdXJsID0gZ2V0VXJsKGlucHV0KTtcblx0XHRcdFx0aWYgKHVybC5pbmNsdWRlcygnL2NvcGlsb3RfaW50ZXJuYWwnKSkge1xuXHRcdFx0XHRcdHJldHVybiB0b2tlblJlc3BvbnNlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dXJscy5wdXNoKHVybCk7XG5cdFx0XHRcdGlmICh1cmxzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRcdHJldHVybiBhbnRocm9waWNSZXNwb25zZShbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdvaycgfV0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBzc2VSZXNwb25zZShbc3NlTGluZXMoJ2RhdGE6IHtcInR5cGVcIjpcIm1lc3NhZ2Vfc3RvcFwifScpXSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgYmFzZVJlcXVlc3QpO1xuXHRcdFx0YXdhaXQgY29sbGVjdChzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2snLCB7IC4uLmJhc2VSZXF1ZXN0LCBzdHJlYW06IHRydWUgYXMgY29uc3QgfSkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXJscy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0Lm9rKHVybHNbMF0uZW5kc1dpdGgoJy92MS9tZXNzYWdlcycpKTtcblx0XHRcdGFzc2VydC5vayh1cmxzWzFdLmVuZHNXaXRoKCcvdjEvbWVzc2FnZXMnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdib3RoIG1vZGVzIHNoYXJlIHRoZSBzYW1lIGNhY2hlZCBjb3BpbG90IHRva2VuJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IG1pbnRDb3VudCA9IDA7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyAoaW5wdXQpID0+IHtcblx0XHRcdFx0Y29uc3QgdXJsID0gZ2V0VXJsKGlucHV0KTtcblx0XHRcdFx0aWYgKHVybC5pbmNsdWRlcygnL2NvcGlsb3RfaW50ZXJuYWwnKSkge1xuXHRcdFx0XHRcdG1pbnRDb3VudCsrO1xuXHRcdFx0XHRcdHJldHVybiB0b2tlblJlc3BvbnNlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGFudGhyb3BpY1Jlc3BvbnNlKFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ29rJyB9XSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgYmFzZVJlcXVlc3QpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgYmFzZVJlcXVlc3QpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pbnRDb3VudCwgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vICNlbmRyZWdpb25cblxuXHQvLyAjcmVnaW9uIENvcGlsb3RBcGlFcnJvciBjb250cmFjdFxuXG5cdHN1aXRlKCdDb3BpbG90QXBpRXJyb3IgY29udHJhY3QnLCAoKSA9PiB7XG5cblx0XHRhc3luYyBmdW5jdGlvbiBjYXB0dXJlQ29waWxvdEFwaUVycm9yKHByb21pc2U6IFByb21pc2U8dW5rbm93bj4pOiBQcm9taXNlPENvcGlsb3RBcGlFcnJvcj4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgcHJvbWlzZTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRhc3NlcnQub2soZXJyIGluc3RhbmNlb2YgQ29waWxvdEFwaUVycm9yLCBgZXhwZWN0ZWQgQ29waWxvdEFwaUVycm9yLCBnb3Q6ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0XHRyZXR1cm4gZXJyO1xuXHRcdFx0fVxuXHRcdFx0YXNzZXJ0LmZhaWwoJ2V4cGVjdGVkIHRvIHRocm93IENvcGlsb3RBcGlFcnJvcicpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ25vbi0yeHggd2l0aCBjb25mb3JtaW5nIEFudGhyb3BpYyBlbnZlbG9wZTogcGFzc3Rocm91Z2ggdmVyYmF0aW0nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cHN0cmVhbUVudmVsb3BlOiBBbnRocm9waWMuRXJyb3JSZXNwb25zZSA9IHtcblx0XHRcdFx0dHlwZTogJ2Vycm9yJyxcblx0XHRcdFx0ZXJyb3I6IHsgdHlwZTogJ3JhdGVfbGltaXRfZXJyb3InLCBtZXNzYWdlOiAnWW91IGFyZSBzZW5kaW5nIHJlcXVlc3RzIHRvbyBmYXN0LicgfSxcblx0XHRcdFx0cmVxdWVzdF9pZDogJ3JlcV9hYmMnLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHsgZmV0Y2g6IGZldGNoRm4gfSA9IHJvdXRpbmdGZXRjaChcblx0XHRcdFx0KCkgPT4gbmV3IFJlc3BvbnNlKEpTT04uc3RyaW5naWZ5KHVwc3RyZWFtRW52ZWxvcGUpLCB7IHN0YXR1czogNDI5LCBzdGF0dXNUZXh0OiAnVG9vIE1hbnkgUmVxdWVzdHMnIH0pLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGZldGNoRm4pO1xuXG5cdFx0XHRjb25zdCBlcnIgPSBhd2FpdCBjYXB0dXJlQ29waWxvdEFwaUVycm9yKHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIGJhc2VSZXF1ZXN0KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7IHN0YXR1czogZXJyLnN0YXR1cywgZW52ZWxvcGU6IGVyci5lbnZlbG9wZSB9LFxuXHRcdFx0XHR7IHN0YXR1czogNDI5LCBlbnZlbG9wZTogdXBzdHJlYW1FbnZlbG9wZSB9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vbi0yeHggd2l0aCBub24tQW50aHJvcGljIEpTT04gYm9keTogc3ludGhlc2l6ZXMgYXBpX2Vycm9yIGVudmVsb3BlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBmZXRjaDogZmV0Y2hGbiB9ID0gcm91dGluZ0ZldGNoKFxuXHRcdFx0XHQoKSA9PiBuZXcgUmVzcG9uc2UoJ3tcImVycm9yXCI6XCJyYXRlX2xpbWl0ZWRcIn0nLCB7IHN0YXR1czogNDI5LCBzdGF0dXNUZXh0OiAnVG9vIE1hbnkgUmVxdWVzdHMnIH0pLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGZldGNoRm4pO1xuXG5cdFx0XHRjb25zdCBlcnIgPSBhd2FpdCBjYXB0dXJlQ29waWxvdEFwaUVycm9yKHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIGJhc2VSZXF1ZXN0KSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7IHN0YXR1czogZXJyLnN0YXR1cywgZW52ZWxvcGU6IGVyci5lbnZlbG9wZSB9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c3RhdHVzOiA0MjksXG5cdFx0XHRcdFx0ZW52ZWxvcGU6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdlcnJvcicsXG5cdFx0XHRcdFx0XHRlcnJvcjogeyB0eXBlOiAnYXBpX2Vycm9yJywgbWVzc2FnZTogJ3tcImVycm9yXCI6XCJyYXRlX2xpbWl0ZWRcIn0nIH0sXG5cdFx0XHRcdFx0XHRyZXF1ZXN0X2lkOiBudWxsLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm9uLTJ4eCB3aXRoIHBsYWluLXRleHQgYm9keTogc3ludGhlc2l6ZXMgYXBpX2Vycm9yIGVudmVsb3BlIHVzaW5nIGJvZHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGZldGNoOiBmZXRjaEZuIH0gPSByb3V0aW5nRmV0Y2goXG5cdFx0XHRcdCgpID0+IG5ldyBSZXNwb25zZSgnaW50ZXJuYWwgc2VydmVyIGVycm9yJywgeyBzdGF0dXM6IDUwMCwgc3RhdHVzVGV4dDogJ0ludGVybmFsIFNlcnZlciBFcnJvcicgfSksXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZmV0Y2hGbik7XG5cblx0XHRcdGNvbnN0IGVyciA9IGF3YWl0IGNhcHR1cmVDb3BpbG90QXBpRXJyb3Ioc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgYmFzZVJlcXVlc3QpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgc3RhdHVzOiBlcnIuc3RhdHVzLCBlbnZlbG9wZTogZXJyLmVudmVsb3BlIH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzdGF0dXM6IDUwMCxcblx0XHRcdFx0XHRlbnZlbG9wZToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2Vycm9yJyxcblx0XHRcdFx0XHRcdGVycm9yOiB7IHR5cGU6ICdhcGlfZXJyb3InLCBtZXNzYWdlOiAnaW50ZXJuYWwgc2VydmVyIGVycm9yJyB9LFxuXHRcdFx0XHRcdFx0cmVxdWVzdF9pZDogbnVsbCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vbi0yeHggd2l0aCBlbXB0eSBib2R5OiBzeW50aGVzaXplcyBhcGlfZXJyb3IgZW52ZWxvcGUgdXNpbmcgc3RhdHVzIHRleHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGZldGNoOiBmZXRjaEZuIH0gPSByb3V0aW5nRmV0Y2goXG5cdFx0XHRcdCgpID0+IG5ldyBSZXNwb25zZSgnJywgeyBzdGF0dXM6IDUwMiwgc3RhdHVzVGV4dDogJ0JhZCBHYXRld2F5JyB9KSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShmZXRjaEZuKTtcblxuXHRcdFx0Y29uc3QgZXJyID0gYXdhaXQgY2FwdHVyZUNvcGlsb3RBcGlFcnJvcihzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2snLCBiYXNlUmVxdWVzdCkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0eyBzdGF0dXM6IGVyci5zdGF0dXMsIGVudmVsb3BlOiBlcnIuZW52ZWxvcGUgfSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHN0YXR1czogNTAyLFxuXHRcdFx0XHRcdGVudmVsb3BlOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnZXJyb3InLFxuXHRcdFx0XHRcdFx0ZXJyb3I6IHsgdHlwZTogJ2FwaV9lcnJvcicsIG1lc3NhZ2U6ICc1MDIgQmFkIEdhdGV3YXknIH0sXG5cdFx0XHRcdFx0XHRyZXF1ZXN0X2lkOiBudWxsLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnU1NFIGVycm9yIGZyYW1lIHdpdGggZnVsbCBlbnZlbG9wZTogcGFzc3Rocm91Z2ggdHlwZSBhbmQgbWVzc2FnZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBzdHJlYW1TZXJ2aWNlKFtcblx0XHRcdFx0c3NlTGluZXMoXG5cdFx0XHRcdFx0J2V2ZW50OiBlcnJvcicsXG5cdFx0XHRcdFx0J2RhdGE6IHtcInR5cGVcIjpcImVycm9yXCIsXCJlcnJvclwiOntcInR5cGVcIjpcIm92ZXJsb2FkZWRfZXJyb3JcIixcIm1lc3NhZ2VcIjpcIk92ZXJsb2FkZWRcIn0sXCJyZXF1ZXN0X2lkXCI6XCJyZXFfNDJcIn0nLFxuXHRcdFx0XHQpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGVyciA9IGF3YWl0IGNhcHR1cmVDb3BpbG90QXBpRXJyb3IoXG5cdFx0XHRcdGNvbGxlY3Qoc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgeyAuLi5iYXNlUmVxdWVzdCwgc3RyZWFtOiB0cnVlIGFzIGNvbnN0IH0pKSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7IHN0YXR1czogZXJyLnN0YXR1cywgZW52ZWxvcGU6IGVyci5lbnZlbG9wZSB9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c3RhdHVzOiBDT1BJTE9UX0FQSV9FUlJPUl9TVEFUVVNfU1RSRUFNSU5HLFxuXHRcdFx0XHRcdGVudmVsb3BlOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnZXJyb3InLFxuXHRcdFx0XHRcdFx0ZXJyb3I6IHsgdHlwZTogJ292ZXJsb2FkZWRfZXJyb3InLCBtZXNzYWdlOiAnT3ZlcmxvYWRlZCcgfSxcblx0XHRcdFx0XHRcdHJlcXVlc3RfaWQ6ICdyZXFfNDInLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnU1NFIGVycm9yIGZyYW1lIG1pc3NpbmcgdHlwZTogZGVmYXVsdHMgdG8gYXBpX2Vycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IHN0cmVhbVNlcnZpY2UoW1xuXHRcdFx0XHRzc2VMaW5lcyhcblx0XHRcdFx0XHQnZXZlbnQ6IGVycm9yJyxcblx0XHRcdFx0XHQnZGF0YToge1widHlwZVwiOlwiZXJyb3JcIixcImVycm9yXCI6e1wibWVzc2FnZVwiOlwib2ggbm9cIn19Jyxcblx0XHRcdFx0KSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBlcnIgPSBhd2FpdCBjYXB0dXJlQ29waWxvdEFwaUVycm9yKFxuXHRcdFx0XHRjb2xsZWN0KHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIHsgLi4uYmFzZVJlcXVlc3QsIHN0cmVhbTogdHJ1ZSBhcyBjb25zdCB9KSksXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlcnIuZW52ZWxvcGUsIHtcblx0XHRcdFx0dHlwZTogJ2Vycm9yJyxcblx0XHRcdFx0ZXJyb3I6IHsgdHlwZTogJ2FwaV9lcnJvcicsIG1lc3NhZ2U6ICdvaCBubycgfSxcblx0XHRcdFx0cmVxdWVzdF9pZDogbnVsbCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnU1NFIGVycm9yIGZyYW1lIG1pc3NpbmcgbWVzc2FnZTogZGVmYXVsdHMgdG8gXCJVbmtub3duIHN0cmVhbWluZyBlcnJvclwiJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IHN0cmVhbVNlcnZpY2UoW1xuXHRcdFx0XHRzc2VMaW5lcyhcblx0XHRcdFx0XHQnZXZlbnQ6IGVycm9yJyxcblx0XHRcdFx0XHQnZGF0YToge1widHlwZVwiOlwiZXJyb3JcIixcImVycm9yXCI6e1widHlwZVwiOlwiYXBpX2Vycm9yXCJ9fScsXG5cdFx0XHRcdCksXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZXJyID0gYXdhaXQgY2FwdHVyZUNvcGlsb3RBcGlFcnJvcihcblx0XHRcdFx0Y29sbGVjdChzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2snLCB7IC4uLmJhc2VSZXF1ZXN0LCBzdHJlYW06IHRydWUgYXMgY29uc3QgfSkpLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXJyLmVudmVsb3BlLCB7XG5cdFx0XHRcdHR5cGU6ICdlcnJvcicsXG5cdFx0XHRcdGVycm9yOiB7IHR5cGU6ICdhcGlfZXJyb3InLCBtZXNzYWdlOiAnVW5rbm93biBzdHJlYW1pbmcgZXJyb3InIH0sXG5cdFx0XHRcdHJlcXVlc3RfaWQ6IG51bGwsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1NTRSBlcnJvciBmcmFtZSB3aXRoIGNvbmZvcm1pbmcgZW52ZWxvcGUgaXMgcHJlc2VydmVkIHZlcmJhdGltIChleHRyYSBmaWVsZHMgcHJvcGFnYXRlKScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFRoZSBQaGFzZSAyIHByb3h5IG11c3QgYmUgYWJsZSB0byByZS1lbWl0IHRoZSBvcmlnaW5hbCBlcnJvciBmcmFtZVxuXHRcdFx0Ly8gd2l0aCBmdWxsIGZpZGVsaXR5IFx1MjAxNCBhbnkgZXh0cmEgZmllbGRzIHRoZSB1cHN0cmVhbSBlbWl0cyBzaG91bGRcblx0XHRcdC8vIHN1cnZpdmUgdGhlIHJvdW5kLXRyaXAgdGhyb3VnaCBDb3BpbG90QXBpRXJyb3IuZW52ZWxvcGUuXG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gc3RyZWFtU2VydmljZShbXG5cdFx0XHRcdHNzZUxpbmVzKFxuXHRcdFx0XHRcdCdldmVudDogZXJyb3InLFxuXHRcdFx0XHRcdCdkYXRhOiB7XCJ0eXBlXCI6XCJlcnJvclwiLFwiZXJyb3JcIjp7XCJ0eXBlXCI6XCJvdmVybG9hZGVkX2Vycm9yXCIsXCJtZXNzYWdlXCI6XCJPdmVybG9hZGVkXCIsXCJyZXF1ZXN0X2lkXCI6XCJyZXFfeHl6XCJ9fScsXG5cdFx0XHRcdCksXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZXJyID0gYXdhaXQgY2FwdHVyZUNvcGlsb3RBcGlFcnJvcihcblx0XHRcdFx0Y29sbGVjdChzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2snLCB7IC4uLmJhc2VSZXF1ZXN0LCBzdHJlYW06IHRydWUgYXMgY29uc3QgfSkpLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXJyLmVudmVsb3BlLCB7XG5cdFx0XHRcdHR5cGU6ICdlcnJvcicsXG5cdFx0XHRcdGVycm9yOiB7IHR5cGU6ICdvdmVybG9hZGVkX2Vycm9yJywgbWVzc2FnZTogJ092ZXJsb2FkZWQnLCByZXF1ZXN0X2lkOiAncmVxX3h5eicgfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnU1NFIGVycm9yIGZyYW1lIHdpdGggdW5zdHJ1Y3R1cmVkLXN0cmluZyBlcnJvcjogdXNlcyB0aGUgc3RyaW5nIGFzIG1lc3NhZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gc3RyZWFtU2VydmljZShbXG5cdFx0XHRcdHNzZUxpbmVzKFxuXHRcdFx0XHRcdCdldmVudDogZXJyb3InLFxuXHRcdFx0XHRcdCdkYXRhOiB7XCJ0eXBlXCI6XCJlcnJvclwiLFwiZXJyb3JcIjpcInJhdGVfbGltaXRlZFwifScsXG5cdFx0XHRcdCksXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZXJyID0gYXdhaXQgY2FwdHVyZUNvcGlsb3RBcGlFcnJvcihcblx0XHRcdFx0Y29sbGVjdChzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2snLCB7IC4uLmJhc2VSZXF1ZXN0LCBzdHJlYW06IHRydWUgYXMgY29uc3QgfSkpLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXJyLmVudmVsb3BlLCB7XG5cdFx0XHRcdHR5cGU6ICdlcnJvcicsXG5cdFx0XHRcdGVycm9yOiB7IHR5cGU6ICdhcGlfZXJyb3InLCBtZXNzYWdlOiAncmF0ZV9saW1pdGVkJyB9LFxuXHRcdFx0XHRyZXF1ZXN0X2lkOiBudWxsLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb2RlbHMoKSBub24tMnh4IHRocm93cyB0eXBlZCBlcnJvciB3aXRoIHN5bnRoZXNpemVkIGVudmVsb3BlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBmZXRjaDogZmV0Y2hGbiB9ID0gcm91dGluZ0ZldGNoKFxuXHRcdFx0XHQoKSA9PiBuZXcgUmVzcG9uc2UoJ3Vwc3RyZWFtIGRvd24nLCB7IHN0YXR1czogNTAzLCBzdGF0dXNUZXh0OiAnU2VydmljZSBVbmF2YWlsYWJsZScgfSksXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZmV0Y2hGbik7XG5cblx0XHRcdGNvbnN0IGVyciA9IGF3YWl0IGNhcHR1cmVDb3BpbG90QXBpRXJyb3Ioc2VydmljZS5tb2RlbHMoJ2doLXRvaycpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHsgc3RhdHVzOiBlcnIuc3RhdHVzLCBlbnZlbG9wZTogZXJyLmVudmVsb3BlIH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzdGF0dXM6IDUwMyxcblx0XHRcdFx0XHRlbnZlbG9wZToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2Vycm9yJyxcblx0XHRcdFx0XHRcdGVycm9yOiB7IHR5cGU6ICdhcGlfZXJyb3InLCBtZXNzYWdlOiAndXBzdHJlYW0gZG93bicgfSxcblx0XHRcdFx0XHRcdHJlcXVlc3RfaWQ6IG51bGwsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2soZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ0NBUEkgbW9kZWxzIHJlcXVlc3QgZmFpbGVkOiA1MDMnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb2RlbHMoKSBub24tMnh4IHdpdGggY29uZm9ybWluZyBBbnRocm9waWMgZW52ZWxvcGU6IHBhc3N0aHJvdWdoIHZlcmJhdGltJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXBzdHJlYW1FbnZlbG9wZTogQW50aHJvcGljLkVycm9yUmVzcG9uc2UgPSB7XG5cdFx0XHRcdHR5cGU6ICdlcnJvcicsXG5cdFx0XHRcdGVycm9yOiB7IHR5cGU6ICdhdXRoZW50aWNhdGlvbl9lcnJvcicsIG1lc3NhZ2U6ICdJbnZhbGlkIHRva2VuLicgfSxcblx0XHRcdFx0cmVxdWVzdF9pZDogJ3JlcV9kZWYnLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHsgZmV0Y2g6IGZldGNoRm4gfSA9IHJvdXRpbmdGZXRjaChcblx0XHRcdFx0KCkgPT4gbmV3IFJlc3BvbnNlKEpTT04uc3RyaW5naWZ5KHVwc3RyZWFtRW52ZWxvcGUpLCB7IHN0YXR1czogNDAxLCBzdGF0dXNUZXh0OiAnVW5hdXRob3JpemVkJyB9KSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShmZXRjaEZuKTtcblxuXHRcdFx0Y29uc3QgZXJyID0gYXdhaXQgY2FwdHVyZUNvcGlsb3RBcGlFcnJvcihzZXJ2aWNlLm1vZGVscygnZ2gtdG9rJykpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0eyBzdGF0dXM6IGVyci5zdGF0dXMsIGVudmVsb3BlOiBlcnIuZW52ZWxvcGUgfSxcblx0XHRcdFx0eyBzdGF0dXM6IDQwMSwgZW52ZWxvcGU6IHVwc3RyZWFtRW52ZWxvcGUgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlcnJvciBtZXNzYWdlIG5ldmVyIGVtYmVkcyBhdXRoIHRva2VucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGFzeW5jIChpbnB1dCkgPT4ge1xuXHRcdFx0XHRjb25zdCB1cmwgPSBnZXRVcmwoaW5wdXQpO1xuXHRcdFx0XHRpZiAodXJsLmluY2x1ZGVzKCcvY29waWxvdF9pbnRlcm5hbCcpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRva2VuUmVzcG9uc2UoeyB0b2tlbjogJ3N1cGVyLXNlY3JldC1jb3BpbG90LXRva2VuLXh5eicgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG5ldyBSZXNwb25zZSgncmF0ZSBsaW1pdGVkJywgeyBzdGF0dXM6IDQyOSwgc3RhdHVzVGV4dDogJ1RvbyBNYW55IFJlcXVlc3RzJyB9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBlcnIgPSBhd2FpdCBjYXB0dXJlQ29waWxvdEFwaUVycm9yKHNlcnZpY2UubWVzc2FnZXMoJ3N1cGVyLXNlY3JldC1naC10b2tlbi14eXonLCBiYXNlUmVxdWVzdCkpO1xuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZCA9IEpTT04uc3RyaW5naWZ5KHsgbWVzc2FnZTogZXJyLm1lc3NhZ2UsIGVudmVsb3BlOiBlcnIuZW52ZWxvcGUgfSk7XG5cdFx0XHRhc3NlcnQub2soIXNlcmlhbGl6ZWQuaW5jbHVkZXMoJ3N1cGVyLXNlY3JldC1jb3BpbG90LXRva2VuLXh5eicpKTtcblx0XHRcdGFzc2VydC5vayghc2VyaWFsaXplZC5pbmNsdWRlcygnc3VwZXItc2VjcmV0LWdoLXRva2VuLXh5eicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJzQwMSBzdGlsbCBpbnZhbGlkYXRlcyB0aGUgY2FjaGVkIHRva2VuIChyZWdyZXNzaW9uKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBtaW50Q291bnQgPSAwO1xuXHRcdFx0bGV0IG5leHQ0MDEgPSB0cnVlO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoYXN5bmMgKGlucHV0KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHVybCA9IGdldFVybChpbnB1dCk7XG5cdFx0XHRcdGlmICh1cmwuaW5jbHVkZXMoJy9jb3BpbG90X2ludGVybmFsJykpIHtcblx0XHRcdFx0XHRtaW50Q291bnQrKztcblx0XHRcdFx0XHRyZXR1cm4gdG9rZW5SZXNwb25zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChuZXh0NDAxKSB7XG5cdFx0XHRcdFx0bmV4dDQwMSA9IGZhbHNlO1xuXHRcdFx0XHRcdHJldHVybiBuZXcgUmVzcG9uc2UoJ3VuYXV0aG9yaXplZCcsIHsgc3RhdHVzOiA0MDEsIHN0YXR1c1RleHQ6ICdVbmF1dGhvcml6ZWQnIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhbnRocm9waWNSZXNwb25zZShbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdvaycgfV0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGNhcHR1cmVDb3BpbG90QXBpRXJyb3Ioc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgYmFzZVJlcXVlc3QpKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIGJhc2VSZXF1ZXN0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaW50Q291bnQsIDIpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBDYW5jZWxsYXRpb25cblxuXHRzdWl0ZSgnQ2FuY2VsbGF0aW9uJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZm9yd2FyZHMgQWJvcnRTaWduYWwgdG8gZmV0Y2ggZm9yIG1lc3NhZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcblx0XHRcdGxldCBjYXB0dXJlZFNpZ25hbDogQWJvcnRTaWduYWwgfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyAoaW5wdXQsIGluaXQpID0+IHtcblx0XHRcdFx0Y29uc3QgdXJsID0gZ2V0VXJsKGlucHV0KTtcblx0XHRcdFx0aWYgKHVybC5pbmNsdWRlcygnL2NvcGlsb3RfaW50ZXJuYWwnKSkge1xuXHRcdFx0XHRcdHJldHVybiB0b2tlblJlc3BvbnNlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FwdHVyZWRTaWduYWwgPSBpbml0Py5zaWduYWwgYXMgQWJvcnRTaWduYWw7XG5cdFx0XHRcdHJldHVybiBhbnRocm9waWNSZXNwb25zZShbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdvaycgfV0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIGJhc2VSZXF1ZXN0LCB7IHNpZ25hbDogY29udHJvbGxlci5zaWduYWwgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwdHVyZWRTaWduYWwsIGNvbnRyb2xsZXIuc2lnbmFsKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZvcndhcmRzIEFib3J0U2lnbmFsIHRvIGZldGNoIGZvciBtb2RlbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuXHRcdFx0bGV0IGNhcHR1cmVkU2lnbmFsOiBBYm9ydFNpZ25hbCB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGFzeW5jIChpbnB1dCwgaW5pdCkgPT4ge1xuXHRcdFx0XHRjb25zdCB1cmwgPSBnZXRVcmwoaW5wdXQpO1xuXHRcdFx0XHRpZiAodXJsLmluY2x1ZGVzKCcvY29waWxvdF9pbnRlcm5hbCcpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRva2VuUmVzcG9uc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXB0dXJlZFNpZ25hbCA9IGluaXQ/LnNpZ25hbCBhcyBBYm9ydFNpZ25hbDtcblx0XHRcdFx0cmV0dXJuIG1vZGVsc1Jlc3BvbnNlKFtdKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLm1vZGVscygnZ2gtdG9rJywgeyBzaWduYWw6IGNvbnRyb2xsZXIuc2lnbmFsIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcHR1cmVkU2lnbmFsLCBjb250cm9sbGVyLnNpZ25hbCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBmb3J3YXJkIEFib3J0U2lnbmFsIHRvIHRoZSBzaGFyZWQgdG9rZW4gbWludCBmZXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG5cdFx0XHRsZXQgbWludFNpZ25hbDogQWJvcnRTaWduYWwgfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyAoaW5wdXQsIGluaXQpID0+IHtcblx0XHRcdFx0Y29uc3QgdXJsID0gZ2V0VXJsKGlucHV0KTtcblx0XHRcdFx0aWYgKHVybC5pbmNsdWRlcygnL2NvcGlsb3RfaW50ZXJuYWwnKSkge1xuXHRcdFx0XHRcdG1pbnRTaWduYWwgPSBpbml0Py5zaWduYWwgYXMgQWJvcnRTaWduYWw7XG5cdFx0XHRcdFx0cmV0dXJuIHRva2VuUmVzcG9uc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYW50aHJvcGljUmVzcG9uc2UoW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnb2snIH1dKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLm1lc3NhZ2VzKCdnaC10b2snLCBiYXNlUmVxdWVzdCwgeyBzaWduYWw6IGNvbnRyb2xsZXIuc2lnbmFsIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pbnRTaWduYWwsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYW5jZWxzIHRoZSB1bmRlcmx5aW5nIFNTRSBzdHJlYW0gd2hlbiB0aGUgY29uc3VtZXIgYnJlYWtzIGVhcmx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGNhbmNlbGxlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgYm9keSA9IG5ldyBSZWFkYWJsZVN0cmVhbTxVaW50OEFycmF5Pih7XG5cdFx0XHRcdHB1bGwoY29udHJvbGxlcikge1xuXHRcdFx0XHRcdGNvbnRyb2xsZXIuZW5xdWV1ZShzc2VMaW5lcyhcblx0XHRcdFx0XHRcdCdkYXRhOiB7XCJ0eXBlXCI6XCJjb250ZW50X2Jsb2NrX2RlbHRhXCIsXCJkZWx0YVwiOntcInR5cGVcIjpcInRleHRfZGVsdGFcIixcInRleHRcIjpcIkhlbGxvXCJ9fScsXG5cdFx0XHRcdFx0KSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNhbmNlbCgpIHtcblx0XHRcdFx0XHRjYW5jZWxsZWQgPSB0cnVlO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyAoaW5wdXQpID0+IHtcblx0XHRcdFx0Y29uc3QgdXJsID0gZ2V0VXJsKGlucHV0KTtcblx0XHRcdFx0aWYgKHVybC5pbmNsdWRlcygnL2NvcGlsb3RfaW50ZXJuYWwnKSkge1xuXHRcdFx0XHRcdHJldHVybiB0b2tlblJlc3BvbnNlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG5ldyBSZXNwb25zZShib2R5LCB7IHN0YXR1czogMjAwLCBoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiAndGV4dC9ldmVudC1zdHJlYW0nIH0gfSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaXRlciA9IHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIHsgLi4uYmFzZVJlcXVlc3QsIHN0cmVhbTogdHJ1ZSB9KTtcblx0XHRcdGZvciBhd2FpdCAoY29uc3QgXyBvZiBpdGVyKSB7XG5cdFx0XHRcdGJyZWFrOyAvLyBhYmFuZG9uIGFmdGVyIGZpcnN0IGNodW5rXG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FuY2VsbGVkLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhbmNlbHMgdGhlIHVuZGVybHlpbmcgU1NFIHN0cmVhbSBhZnRlciBtZXNzYWdlX3N0b3AgdGVybWluYXRlcyB0aGUgZ2VuZXJhdG9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGNhbmNlbGxlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgYm9keSA9IG5ldyBSZWFkYWJsZVN0cmVhbTxVaW50OEFycmF5Pih7XG5cdFx0XHRcdHN0YXJ0KGNvbnRyb2xsZXIpIHtcblx0XHRcdFx0XHRjb250cm9sbGVyLmVucXVldWUoc3NlTGluZXMoXG5cdFx0XHRcdFx0XHQnZGF0YToge1widHlwZVwiOlwiY29udGVudF9ibG9ja19kZWx0YVwiLFwiZGVsdGFcIjp7XCJ0eXBlXCI6XCJ0ZXh0X2RlbHRhXCIsXCJ0ZXh0XCI6XCJIZWxsb1wifX0nLFxuXHRcdFx0XHRcdFx0J2RhdGE6IHtcInR5cGVcIjpcIm1lc3NhZ2Vfc3RvcFwifScsXG5cdFx0XHRcdFx0KSk7XG5cdFx0XHRcdFx0Ly8gU2VydmVyIGlzIHN0aWxsIGFsaXZlIFx1MjAxNCBjb25uZWN0aW9uIG11c3QgYmUgcmVsZWFzZWQgYnkgdGhlIGNsaWVudFxuXHRcdFx0XHRcdC8vIGV2ZW4gdGhvdWdoIHRoZSBwcm9kdWNlciBoYXNuJ3QgY2xvc2VkIHlldC5cblx0XHRcdFx0fSxcblx0XHRcdFx0Y2FuY2VsKCkge1xuXHRcdFx0XHRcdGNhbmNlbGxlZCA9IHRydWU7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGFzeW5jIChpbnB1dCkgPT4ge1xuXHRcdFx0XHRjb25zdCB1cmwgPSBnZXRVcmwoaW5wdXQpO1xuXHRcdFx0XHRpZiAodXJsLmluY2x1ZGVzKCcvY29waWxvdF9pbnRlcm5hbCcpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRva2VuUmVzcG9uc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbmV3IFJlc3BvbnNlKGJvZHksIHsgc3RhdHVzOiAyMDAsIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICd0ZXh0L2V2ZW50LXN0cmVhbScgfSB9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBjb2xsZWN0KHNlcnZpY2UubWVzc2FnZXMoJ2doLXRvaycsIHsgLi4uYmFzZVJlcXVlc3QsIHN0cmVhbTogdHJ1ZSB9KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FuY2VsbGVkLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhbmNlbHMgdGhlIHVuZGVybHlpbmcgU1NFIHN0cmVhbSB3aGVuIHRoZSBnZW5lcmF0b3IgdGhyb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGNhbmNlbGxlZCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgYm9keSA9IG5ldyBSZWFkYWJsZVN0cmVhbTxVaW50OEFycmF5Pih7XG5cdFx0XHRcdHN0YXJ0KGNvbnRyb2xsZXIpIHtcblx0XHRcdFx0XHRjb250cm9sbGVyLmVucXVldWUoc3NlTGluZXMoXG5cdFx0XHRcdFx0XHQnZGF0YToge1widHlwZVwiOlwiZXJyb3JcIixcImVycm9yXCI6e1wibWVzc2FnZVwiOlwiYm9vbVwifX0nLFxuXHRcdFx0XHRcdCkpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRjYW5jZWwoKSB7XG5cdFx0XHRcdFx0Y2FuY2VsbGVkID0gdHJ1ZTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoYXN5bmMgKGlucHV0KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHVybCA9IGdldFVybChpbnB1dCk7XG5cdFx0XHRcdGlmICh1cmwuaW5jbHVkZXMoJy9jb3BpbG90X2ludGVybmFsJykpIHtcblx0XHRcdFx0XHRyZXR1cm4gdG9rZW5SZXNwb25zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBuZXcgUmVzcG9uc2UoYm9keSwgeyBzdGF0dXM6IDIwMCwgaGVhZGVyczogeyAnQ29udGVudC1UeXBlJzogJ3RleHQvZXZlbnQtc3RyZWFtJyB9IH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IGNvbGxlY3Qoc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgeyAuLi5iYXNlUmVxdWVzdCwgc3RyZWFtOiB0cnVlIH0pKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FuY2VsbGVkLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gTW9kZWxzXG5cblx0c3VpdGUoJ01vZGVscycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JldHVybnMgbW9kZWxzIGZyb20gdGhlIGRhdGEgYXJyYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBmYWtlTW9kZWxzID0gW1xuXHRcdFx0XHR7IGlkOiAnY2xhdWRlLXNvbm5ldC00LTUnLCBuYW1lOiAnQ2xhdWRlIFNvbm5ldCA0LjUnLCB2ZW5kb3I6ICdhbnRocm9waWMnLCBzdXBwb3J0ZWRfZW5kcG9pbnRzOiBbJ2NoYXQvbWVzc2FnZXMnXSB9LFxuXHRcdFx0XHR7IGlkOiAnY2xhdWRlLW9wdXMtNCcsIG5hbWU6ICdDbGF1ZGUgT3B1cyA0JywgdmVuZG9yOiAnYW50aHJvcGljJywgc3VwcG9ydGVkX2VuZHBvaW50czogWydjaGF0L21lc3NhZ2VzJ10gfSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyAoaW5wdXQpID0+IHtcblx0XHRcdFx0Y29uc3QgdXJsID0gZ2V0VXJsKGlucHV0KTtcblx0XHRcdFx0aWYgKHVybC5pbmNsdWRlcygnL2NvcGlsb3RfaW50ZXJuYWwnKSkge1xuXHRcdFx0XHRcdHJldHVybiB0b2tlblJlc3BvbnNlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG1vZGVsc1Jlc3BvbnNlKGZha2VNb2RlbHMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UubW9kZWxzKCdnaC10b2snKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBmYWtlTW9kZWxzKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgYXJyYXkgd2hlbiBkYXRhIGlzIG1pc3NpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyAoaW5wdXQpID0+IHtcblx0XHRcdFx0Y29uc3QgdXJsID0gZ2V0VXJsKGlucHV0KTtcblx0XHRcdFx0aWYgKHVybC5pbmNsdWRlcygnL2NvcGlsb3RfaW50ZXJuYWwnKSkge1xuXHRcdFx0XHRcdHJldHVybiB0b2tlblJlc3BvbnNlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7fSksIHsgc3RhdHVzOiAyMDAgfSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5tb2RlbHMoJ2doLXRvaycpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NlbmRzIEJlYXJlciB0b2tlbiBpbiBBdXRob3JpemF0aW9uIGhlYWRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBjYXB0dXJlZEF1dGhIZWFkZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKGFzeW5jIChpbnB1dCwgaW5pdCkgPT4ge1xuXHRcdFx0XHRjb25zdCB1cmwgPSBnZXRVcmwoaW5wdXQpO1xuXHRcdFx0XHRpZiAodXJsLmluY2x1ZGVzKCcvY29waWxvdF9pbnRlcm5hbCcpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRva2VuUmVzcG9uc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXB0dXJlZEF1dGhIZWFkZXIgPSAoaW5pdD8uaGVhZGVycyBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KT8uWydBdXRob3JpemF0aW9uJ107XG5cdFx0XHRcdHJldHVybiBtb2RlbHNSZXNwb25zZShbXSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5tb2RlbHMoJ2doLXRvaycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcHR1cmVkQXV0aEhlYWRlciwgJ0JlYXJlciBnaC10b2snKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rocm93cyBvbiBub24tMjAwIHJlc3BvbnNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoYXN5bmMgKGlucHV0KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHVybCA9IGdldFVybChpbnB1dCk7XG5cdFx0XHRcdGlmICh1cmwuaW5jbHVkZXMoJy9jb3BpbG90X2ludGVybmFsJykpIHtcblx0XHRcdFx0XHRyZXR1cm4gdG9rZW5SZXNwb25zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBuZXcgUmVzcG9uc2UoJ2ZvcmJpZGRlbicsIHsgc3RhdHVzOiA0MDMsIHN0YXR1c1RleHQ6ICdGb3JiaWRkZW4nIH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHQoKSA9PiBzZXJ2aWNlLm1vZGVscygnZ2gtdG9rJyksXG5cdFx0XHRcdChlcnI6IHVua25vd24pID0+IGVyciBpbnN0YW5jZW9mIENvcGlsb3RBcGlFcnJvclxuXHRcdFx0XHRcdCYmIGVyci5zdGF0dXMgPT09IDQwM1xuXHRcdFx0XHRcdCYmIGVyci5tZXNzYWdlLmluY2x1ZGVzKCdDQVBJIG1vZGVscyByZXF1ZXN0IGZhaWxlZDogNDAzJyksXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV1c2VzIGNhY2hlZCB0b2tlbiBhY3Jvc3MgbWVzc2FnZXMgYW5kIG1vZGVscyBjYWxscycsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBtaW50Q291bnQgPSAwO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoYXN5bmMgKGlucHV0KSA9PiB7XG5cdFx0XHRcdGNvbnN0IHVybCA9IGdldFVybChpbnB1dCk7XG5cdFx0XHRcdGlmICh1cmwuaW5jbHVkZXMoJy9jb3BpbG90X2ludGVybmFsJykpIHtcblx0XHRcdFx0XHRtaW50Q291bnQrKztcblx0XHRcdFx0XHRyZXR1cm4gdG9rZW5SZXNwb25zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh1cmwuaW5jbHVkZXMoJy9tb2RlbHMnKSkge1xuXHRcdFx0XHRcdHJldHVybiBtb2RlbHNSZXNwb25zZShbXSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGFudGhyb3BpY1Jlc3BvbnNlKFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ29rJyB9XSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5tZXNzYWdlcygnZ2gtdG9rJywgYmFzZVJlcXVlc3QpO1xuXHRcdFx0YXdhaXQgc2VydmljZS5tb2RlbHMoJ2doLXRvaycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1pbnRDb3VudCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyb3V0ZXMgdG8gdGhlIG1vZGVscyBlbmRwb2ludCBVUkwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IGZldGNoOiBmZXRjaEZuLCBjYXB0dXJlZCB9ID0gcm91dGluZ0ZldGNoKCgpID0+IG1vZGVsc1Jlc3BvbnNlKFtdKSk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShmZXRjaEZuKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5tb2RlbHMoJ2doLXRvaycpO1xuXHRcdFx0YXNzZXJ0Lm9rKGNhcHR1cmVkKCkudXJsLmluY2x1ZGVzKCcvbW9kZWxzJyksIGBleHBlY3RlZCBtb2RlbHMgVVJMLCBnb3Q6ICR7Y2FwdHVyZWQoKS51cmx9YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYWxsZXItc3VwcGxpZWQgaGVhZGVycyBjYW5ub3Qgb3ZlcnJpZGUgQXV0aG9yaXphdGlvbiBpbiBtb2RlbHMoKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGxldCBjYXB0dXJlZEhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZShhc3luYyAoaW5wdXQsIGluaXQpID0+IHtcblx0XHRcdFx0Y29uc3QgdXJsID0gZ2V0VXJsKGlucHV0KTtcblx0XHRcdFx0aWYgKHVybC5pbmNsdWRlcygnL2NvcGlsb3RfaW50ZXJuYWwnKSkge1xuXHRcdFx0XHRcdHJldHVybiB0b2tlblJlc3BvbnNlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FwdHVyZWRIZWFkZXJzID0gaW5pdD8uaGVhZGVycyBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuXHRcdFx0XHRyZXR1cm4gbW9kZWxzUmVzcG9uc2UoW10pO1xuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IHNlcnZpY2UubW9kZWxzKCdnaC10b2snLCB7XG5cdFx0XHRcdGhlYWRlcnM6IHsgJ0F1dGhvcml6YXRpb24nOiAnQmVhcmVyIGF0dGFja2VyLXRva2VuJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwdHVyZWRIZWFkZXJzPy5bJ0F1dGhvcml6YXRpb24nXSwgJ0JlYXJlciBnaC10b2snKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N1cHByZXNzSW50ZWdyYXRpb25JZCBvcHQtaW4gY29udHJvbHMgdGhlIENvcGlsb3QtSW50ZWdyYXRpb24tSWQgaGVhZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBmZXRjaDogZmV0Y2hGbiwgY2FwdHVyZWQgfSA9IHJvdXRpbmdGZXRjaCgoKSA9PiBtb2RlbHNSZXNwb25zZShbXSkpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoZmV0Y2hGbik7XG5cblx0XHRcdC8vIERlZmF1bHQgKG5vIG9wdC1pbik6IEB2c2NvZGUvY29waWxvdC1hcGkgZGVyaXZlcyBhbmQgc2VuZHMgdGhlIGhlYWRlci5cblx0XHRcdGF3YWl0IHNlcnZpY2UubW9kZWxzKCdnaC10b2snKTtcblx0XHRcdGNvbnN0IHdpdGhIZWFkZXIgPSBjYXB0dXJlZCgpLmluaXQ/LmhlYWRlcnMgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcblxuXHRcdFx0Ly8gT3B0LWluOiB0aGUgaGVhZGVyIGlzIG9taXR0ZWQgZW50aXJlbHkgc28gQ0FQSSBhdXRob3JpemVzIGFnYWluc3Rcblx0XHRcdC8vIHRoZSB0b2tlbidzIHJlYWwgZW50aXRsZW1lbnQgaW5zdGVhZCBvZiB0aGUgZGVyaXZlZCBpbnRlZ3JhdGlvbiBpZC5cblx0XHRcdGF3YWl0IHNlcnZpY2UubW9kZWxzKCdnaC10b2snLCB7IHN1cHByZXNzSW50ZWdyYXRpb25JZDogdHJ1ZSB9KTtcblx0XHRcdGNvbnN0IHN1cHByZXNzZWQgPSBjYXB0dXJlZCgpLmluaXQ/LmhlYWRlcnMgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcblxuXHRcdFx0YXNzZXJ0Lm9rKHdpdGhIZWFkZXJbJ0NvcGlsb3QtSW50ZWdyYXRpb24tSWQnXSwgJ2ludGVncmF0aW9uIGlkIHNob3VsZCBiZSBwcmVzZW50IGJ5IGRlZmF1bHQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdXBwcmVzc2VkWydDb3BpbG90LUludGVncmF0aW9uLUlkJ10sIHVuZGVmaW5lZCwgJ2ludGVncmF0aW9uIGlkIHNob3VsZCBiZSBzdXBwcmVzc2VkIHdoZW4gb3B0ZWQgaW4nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0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
