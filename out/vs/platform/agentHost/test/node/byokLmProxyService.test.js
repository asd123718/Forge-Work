import assert from "assert";
import { Emitter, Event } from "../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { ByokLmBridgeRegistry } from "../../node/byokLmBridgeRegistry.js";
import { ByokLmProxyService } from "../../node/copilot/byokLmProxyService.js";
suite("ByokLmProxyService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const sessionId = "sess-1";
  function servingConnection(chat, models = []) {
    const emitter = store.add(new Emitter({
      onDidAddFirstListener: () => emitter.fire(models)
    }));
    return { chat, onDidChangeModels: emitter.event };
  }
  async function withProxy(chat, run) {
    const registry = new ByokLmBridgeRegistry();
    const registration = registry.register("client-1", servingConnection(chat));
    const service = new ByokLmProxyService(new NullLogService(), registry);
    const handle = await service.start();
    try {
      await run(handle);
    } finally {
      handle.dispose();
      registration.dispose();
      service.dispose();
    }
  }
  function responsesUrl(handle, vendor) {
    return `${handle.providerBaseUrl(vendor)}/responses`;
  }
  function authHeaders(handle) {
    return { "Content-Type": "application/json", "Authorization": `Bearer ${handle.nonce}.${sessionId}` };
  }
  test("serves the unauthenticated health check", async () => {
    await withProxy(
      async () => ({ output: [] }),
      async (handle) => {
        const response = await fetch(`${handle.baseUrl}/`);
        assert.strictEqual(response.status, 200);
        assert.strictEqual(await response.text(), "ok");
      }
    );
  });
  test("rejects requests without a valid bearer token", async () => {
    await withProxy(
      async () => ({ output: [] }),
      async (handle) => {
        const response = await fetch(responsesUrl(handle, "acme"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "m", input: [] })
        });
        assert.strictEqual(response.status, 401);
      }
    );
  });
  test("rejects a nonce-only bearer token (no session id)", async () => {
    await withProxy(
      async () => ({ output: [] }),
      async (handle) => {
        const response = await fetch(responsesUrl(handle, "acme"), {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${handle.nonce}` },
          body: JSON.stringify({ model: "m", input: [] })
        });
        assert.strictEqual(response.status, 401);
      }
    );
  });
  test("returns 404 for an authenticated but unknown route", async () => {
    await withProxy(
      async () => ({ output: [] }),
      async (handle) => {
        const response = await fetch(`${handle.baseUrl}/v/acme/chat/completions`, {
          method: "POST",
          headers: authHeaders(handle),
          body: "{}"
        });
        assert.strictEqual(response.status, 404);
      }
    );
  });
  test("forwards a Responses request to the bridge and returns JSON by default", async () => {
    let captured;
    await withProxy(
      async (request) => {
        captured = request;
        return { output: [{ type: "message", content: [{ type: "text", text: "hello from byok" }] }] };
      },
      async (handle) => {
        const response = await fetch(responsesUrl(handle, "acme"), {
          method: "POST",
          headers: authHeaders(handle),
          body: JSON.stringify({ model: "claude", input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hi" }] }] })
        });
        assert.strictEqual(response.status, 200);
        assert.strictEqual(response.headers.get("content-type"), "application/json");
        const body = await response.json();
        assert.strictEqual(body.output[0].content[0].text, "hello from byok");
      }
    );
    assert.strictEqual(captured?.vendor, "acme");
    assert.strictEqual(captured?.modelId, "claude");
    assert.deepStrictEqual(captured?.input, [{ type: "message", role: "user", content: [{ type: "text", text: "hi" }] }]);
  });
  test("forwards image input on the initial and subsequent turns", async () => {
    const captured = [];
    const statuses = [];
    const imageMessage = {
      type: "message",
      role: "user",
      content: [
        { type: "input_text", text: "What is in this image?" },
        { type: "input_image", image_url: "data:image/png;base64,iVBORw0KGgo=" }
      ]
    };
    await withProxy(
      async (request) => {
        captured.push(request);
        return { output: [] };
      },
      async (handle) => {
        for (const input of [
          [imageMessage],
          [imageMessage, { type: "message", role: "user", content: [{ type: "input_text", text: "Try again without a new image." }] }]
        ]) {
          const response = await fetch(responsesUrl(handle, "gemini"), {
            method: "POST",
            headers: authHeaders(handle),
            body: JSON.stringify({ model: "gemini-3.6-flash", input })
          });
          statuses.push(response.status);
          await response.text();
        }
      }
    );
    assert.deepStrictEqual({ statuses, input: captured.map((request) => request.input) }, {
      statuses: [200, 200],
      input: [
        [
          {
            type: "message",
            role: "user",
            content: [
              { type: "text", text: "What is in this image?" },
              { type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" }
            ]
          }
        ],
        [
          {
            type: "message",
            role: "user",
            content: [
              { type: "text", text: "What is in this image?" },
              { type: "image", mimeType: "image/png", data: "iVBORw0KGgo=" }
            ]
          },
          {
            type: "message",
            role: "user",
            content: [
              { type: "text", text: "Try again without a new image." }
            ]
          }
        ]
      ]
    });
  });
  test("rejects image URLs that cannot be forwarded as inline data", async () => {
    await withProxy(
      async () => ({ output: [] }),
      async (handle) => {
        const responses = [];
        for (const imageUrl of ["https://example.com/image.png", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,not valid"]) {
          const response = await fetch(responsesUrl(handle, "gemini"), {
            method: "POST",
            headers: authHeaders(handle),
            body: JSON.stringify({
              model: "gemini-3.6-flash",
              input: [{
                type: "message",
                role: "user",
                content: [{ type: "input_image", image_url: imageUrl }]
              }]
            })
          });
          responses.push({ status: response.status, body: await response.json() });
        }
        assert.deepStrictEqual(responses, [
          {
            status: 400,
            body: {
              error: {
                message: "Unsupported input[0].content[0].image_url",
                type: "invalid_request_error"
              }
            }
          },
          {
            status: 400,
            body: {
              error: {
                message: "Unsupported input[0].content[0].image_url MIME type 'image/svg+xml'",
                type: "invalid_request_error"
              }
            }
          },
          {
            status: 400,
            body: {
              error: {
                message: "Invalid input[0].content[0].image_url",
                type: "invalid_request_error"
              }
            }
          }
        ]);
      }
    );
  });
  test("forwards custom tool call history with freeform input", async () => {
    let captured;
    await withProxy(
      async (request) => {
        captured = request;
        return { output: [{ type: "message", content: [{ type: "text", text: "done" }] }] };
      },
      async (handle) => {
        const response = await fetch(responsesUrl(handle, "acme"), {
          method: "POST",
          headers: authHeaders(handle),
          body: JSON.stringify({
            model: "m",
            input: [
              {
                type: "custom_tool_call",
                call_id: "call_1",
                name: "apply_patch",
                input: "*** Begin Patch\n*** End Patch"
              },
              { type: "custom_tool_call_output", call_id: "call_1", output: "Done!" }
            ]
          })
        });
        assert.strictEqual(response.status, 200);
        await response.text();
      }
    );
    assert.deepStrictEqual(captured?.input, [
      {
        type: "custom_tool_call",
        callId: "call_1",
        name: "apply_patch",
        input: "*** Begin Patch\n*** End Patch"
      },
      { type: "custom_tool_call_output", callId: "call_1", output: "Done!" }
    ]);
  });
  test("decodes a url-encoded vendor path segment", async () => {
    let captured;
    await withProxy(
      async (request) => {
        captured = request;
        return { output: [{ type: "message", content: [{ type: "text", text: "ok" }] }] };
      },
      async (handle) => {
        const response = await fetch(responsesUrl(handle, "acme corp"), {
          method: "POST",
          headers: authHeaders(handle),
          body: JSON.stringify({ model: "m", input: [] })
        });
        assert.strictEqual(response.status, 200);
        await response.text();
      }
    );
    assert.strictEqual(captured?.vendor, "acme corp");
  });
  test("rejects a vendor that decodes to a multi-segment path (%2F)", async () => {
    await withProxy(
      async () => ({ output: [] }),
      async (handle) => {
        const response = await fetch(responsesUrl(handle, "a/b"), {
          method: "POST",
          headers: authHeaders(handle),
          body: JSON.stringify({ model: "m", input: [] })
        });
        assert.strictEqual(response.status, 404);
      }
    );
  });
  test("streams assistant tool calls as OpenAI tool_call deltas", async () => {
    await withProxy(
      async () => ({ output: [{ type: "function_call", callId: "call_1", name: "getWeather", argumentsJson: '{"city":"NYC"}' }] }),
      async (handle) => {
        const response = await fetch(responsesUrl(handle, "acme"), {
          method: "POST",
          headers: authHeaders(handle),
          body: JSON.stringify({ model: "m", input: "weather?", stream: true })
        });
        const text = await response.text();
        assert.ok(text.includes('"type":"function_call"'), `expected function_call in SSE: ${text}`);
        assert.ok(text.includes("event: response.completed"), `expected completed response: ${text}`);
        assert.ok(text.includes("getWeather"));
      }
    );
  });
  test("returns a 502 when the bridge reports an error", async () => {
    await withProxy(
      async () => ({ output: [], error: "model unavailable" }),
      async (handle) => {
        const response = await fetch(responsesUrl(handle, "acme"), {
          method: "POST",
          headers: authHeaders(handle),
          body: JSON.stringify({ model: "m", input: [] })
        });
        assert.strictEqual(response.status, 502);
        const body = await response.json();
        assert.strictEqual(body.error?.message, "model unavailable");
      }
    );
  });
  test("returns a 502 when the bridge throws", async () => {
    await withProxy(
      async () => {
        throw new Error("bridge exploded");
      },
      async (handle) => {
        const response = await fetch(responsesUrl(handle, "acme"), {
          method: "POST",
          headers: authHeaders(handle),
          body: JSON.stringify({ model: "m", input: [] })
        });
        assert.strictEqual(response.status, 502);
        const body = await response.json();
        assert.strictEqual(body.error?.message, "bridge exploded");
      }
    );
  });
  test("rejects a malformed JSON body with 400", async () => {
    await withProxy(
      async () => ({ output: [] }),
      async (handle) => {
        const response = await fetch(responsesUrl(handle, "acme"), {
          method: "POST",
          headers: authHeaders(handle),
          body: "not json"
        });
        assert.strictEqual(response.status, 400);
      }
    );
  });
  test("returns a 503 when no renderer bridge is connected", async () => {
    const registry = new ByokLmBridgeRegistry();
    const service = new ByokLmProxyService(new NullLogService(), registry);
    const handle = await service.start();
    try {
      const response = await fetch(responsesUrl(handle, "acme"), {
        method: "POST",
        headers: authHeaders(handle),
        body: JSON.stringify({ model: "m", input: [] })
      });
      assert.strictEqual(response.status, 503);
    } finally {
      handle.dispose();
      service.dispose();
    }
  });
  test("routes requests to a serving window and excludes a non-serving one", async () => {
    const registry = new ByokLmBridgeRegistry();
    const calls = [];
    const regServing = registry.register("editor", servingConnection(
      async () => {
        calls.push("serving");
        return { output: [{ type: "message", content: [{ type: "text", text: "from serving" }] }] };
      },
      [{ vendor: "acme", id: "claude" }]
    ));
    const regNonServing = registry.register("no-handler", {
      chat: async () => {
        calls.push("no-handler");
        return { output: [{ type: "message", content: [{ type: "text", text: "from non-serving" }] }] };
      },
      onDidChangeModels: Event.None
    });
    const service = new ByokLmProxyService(new NullLogService(), registry);
    const handle = await service.start();
    try {
      const res = await fetch(responsesUrl(handle, "acme"), {
        method: "POST",
        headers: authHeaders(handle),
        body: JSON.stringify({ model: "claude", input: [] })
      });
      assert.deepStrictEqual({
        routedToServing: (await res.text()).includes("from serving"),
        calls
      }, { routedToServing: true, calls: ["serving"] });
    } finally {
      handle.dispose();
      regServing.dispose();
      regNonServing.dispose();
      service.dispose();
    }
  });
  test("rebinds with a fresh nonce after every handle is disposed", async () => {
    const registry = new ByokLmBridgeRegistry();
    const registration = registry.register("client-1", servingConnection(async () => ({ output: [{ type: "message", content: [{ type: "text", text: "ok" }] }] })));
    const service = new ByokLmProxyService(new NullLogService(), registry);
    const first = await service.start();
    const firstNonce = first.nonce;
    first.dispose();
    const second = await service.start();
    try {
      assert.notStrictEqual(second.nonce, firstNonce);
    } finally {
      second.dispose();
      registration.dispose();
      service.dispose();
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxieW9rTG1Qcm94eVNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB0eXBlIHsgSUJ5b2tMbUJyaWRnZUNvbm5lY3Rpb24sIElCeW9rTG1DaGF0UmVxdWVzdCwgSUJ5b2tMbUNoYXRSZXN1bHQsIElCeW9rTG1Nb2RlbEluZm8gfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Qnlva0xtLmpzJztcbmltcG9ydCB7IEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vbm9kZS9ieW9rTG1CcmlkZ2VSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBCeW9rTG1Qcm94eVNlcnZpY2UsIHR5cGUgSUJ5b2tMbVByb3h5SGFuZGxlIH0gZnJvbSAnLi4vLi4vbm9kZS9jb3BpbG90L2J5b2tMbVByb3h5U2VydmljZS5qcyc7XG5cbi8qKlxuICogRXhlcmNpc2VzIHRoZSBpbmZlcmVuY2UgcGF0aCBlbmQtdG8tZW5kIHdpdGhvdXQgdGhlIENvcGlsb3QgU0RLIHJ1bnRpbWU6XG4gKiB0aGUgdGVzdCBwbGF5cyB0aGUgcnVudGltZSdzIHJvbGUgYnkgUE9TVGluZyBPcGVuQUkgUmVzcG9uc2VzXG4gKiByZXF1ZXN0cyBhdCB0aGUgbG9vcGJhY2sgcHJveHksIGFuZCBwbGF5cyB0aGUgcmVuZGVyZXIncyByb2xlIHdpdGggYSBmYWtlXG4gKiB7QGxpbmsgSUJ5b2tMbUNoYXRSZXF1ZXN0fSAtPiB7QGxpbmsgSUJ5b2tMbUNoYXRSZXN1bHR9IGJyaWRnZSBmdW5jdGlvbi4gVGhlXG4gKiBvbmx5IGNvbnRyYWN0IHVuZGVyIHRlc3QgaXMgdGhlIE9wZW5BSSB3aXJlIGZvcm1hdCBpbiwgdGhlIGJyaWRnZSBEVE8gb3V0LFxuICogYW5kIHRoZSBTU0Ugd2lyZSBmb3JtYXQgYmFjay5cbiAqL1xuc3VpdGUoJ0J5b2tMbVByb3h5U2VydmljZScsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHNlc3Npb25JZCA9ICdzZXNzLTEnO1xuXG5cdC8qKlxuXHQgKiBBIHNlcnZpbmcgYnJpZGdlIGNvbm5lY3Rpb246IGl0IHB1c2hlcyBpdHMgbW9kZWwgc25hcHNob3QgKGRlZmF1bHQgZW1wdHkpXG5cdCAqIHN5bmNocm9ub3VzbHkgd2hlbiB0aGUgcmVnaXN0cnkgc3Vic2NyaWJlcywgc28gaXQgaXMgYSB2YWxpZCByb3V0aW5nIHRhcmdldC5cblx0ICovXG5cdGZ1bmN0aW9uIHNlcnZpbmdDb25uZWN0aW9uKGNoYXQ6IElCeW9rTG1CcmlkZ2VDb25uZWN0aW9uWydjaGF0J10sIG1vZGVsczogSUJ5b2tMbU1vZGVsSW5mb1tdID0gW10pOiBJQnlva0xtQnJpZGdlQ29ubmVjdGlvbiB7XG5cdFx0Y29uc3QgZW1pdHRlciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxJQnlva0xtTW9kZWxJbmZvW10+KHtcblx0XHRcdG9uRGlkQWRkRmlyc3RMaXN0ZW5lcjogKCkgPT4gZW1pdHRlci5maXJlKG1vZGVscyksXG5cdFx0fSkpO1xuXHRcdHJldHVybiB7IGNoYXQsIG9uRGlkQ2hhbmdlTW9kZWxzOiBlbWl0dGVyLmV2ZW50IH07XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiB3aXRoUHJveHkoXG5cdFx0Y2hhdDogKHJlcXVlc3Q6IElCeW9rTG1DaGF0UmVxdWVzdCkgPT4gUHJvbWlzZTxJQnlva0xtQ2hhdFJlc3VsdD4sXG5cdFx0cnVuOiAoaGFuZGxlOiBJQnlva0xtUHJveHlIYW5kbGUpID0+IFByb21pc2U8dm9pZD4sXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5KCk7XG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gcmVnaXN0cnkucmVnaXN0ZXIoJ2NsaWVudC0xJywgc2VydmluZ0Nvbm5lY3Rpb24oY2hhdCkpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgQnlva0xtUHJveHlTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCByZWdpc3RyeSk7XG5cdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydCgpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBydW4oaGFuZGxlKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aGFuZGxlLmRpc3Bvc2UoKTtcblx0XHRcdHJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiByZXNwb25zZXNVcmwoaGFuZGxlOiBJQnlva0xtUHJveHlIYW5kbGUsIHZlbmRvcjogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7aGFuZGxlLnByb3ZpZGVyQmFzZVVybCh2ZW5kb3IpfS9yZXNwb25zZXNgO1xuXHR9XG5cblx0ZnVuY3Rpb24gYXV0aEhlYWRlcnMoaGFuZGxlOiBJQnlva0xtUHJveHlIYW5kbGUpOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IHtcblx0XHRyZXR1cm4geyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLCAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtoYW5kbGUubm9uY2V9LiR7c2Vzc2lvbklkfWAgfTtcblx0fVxuXG5cdHRlc3QoJ3NlcnZlcyB0aGUgdW5hdXRoZW50aWNhdGVkIGhlYWx0aCBjaGVjaycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoUHJveHkoXG5cdFx0XHRhc3luYyAoKSA9PiAoeyBvdXRwdXQ6IFtdIH0pLFxuXHRcdFx0YXN5bmMgKGhhbmRsZSkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke2hhbmRsZS5iYXNlVXJsfS9gKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnN0YXR1cywgMjAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlc3BvbnNlLnRleHQoKSwgJ29rJyk7XG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgcmVxdWVzdHMgd2l0aG91dCBhIHZhbGlkIGJlYXJlciB0b2tlbicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoUHJveHkoXG5cdFx0XHRhc3luYyAoKSA9PiAoeyBvdXRwdXQ6IFtdIH0pLFxuXHRcdFx0YXN5bmMgKGhhbmRsZSkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHJlc3BvbnNlc1VybChoYW5kbGUsICdhY21lJyksIHtcblx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicgfSxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnbScsIGlucHV0OiBbXSB9KSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5zdGF0dXMsIDQwMSk7XG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgYSBub25jZS1vbmx5IGJlYXJlciB0b2tlbiAobm8gc2Vzc2lvbiBpZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFByb3h5KFxuXHRcdFx0YXN5bmMgKCkgPT4gKHsgb3V0cHV0OiBbXSB9KSxcblx0XHRcdGFzeW5jIChoYW5kbGUpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChyZXNwb25zZXNVcmwoaGFuZGxlLCAnYWNtZScpLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczogeyAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLCAnQXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtoYW5kbGUubm9uY2V9YCB9LFxuXHRcdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6ICdtJywgaW5wdXQ6IFtdIH0pLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnN0YXR1cywgNDAxKTtcblx0XHRcdH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyA0MDQgZm9yIGFuIGF1dGhlbnRpY2F0ZWQgYnV0IHVua25vd24gcm91dGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFByb3h5KFxuXHRcdFx0YXN5bmMgKCkgPT4gKHsgb3V0cHV0OiBbXSB9KSxcblx0XHRcdGFzeW5jIChoYW5kbGUpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHtoYW5kbGUuYmFzZVVybH0vdi9hY21lL2NoYXQvY29tcGxldGlvbnNgLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczogYXV0aEhlYWRlcnMoaGFuZGxlKSxcblx0XHRcdFx0XHRib2R5OiAne30nLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnN0YXR1cywgNDA0KTtcblx0XHRcdH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZm9yd2FyZHMgYSBSZXNwb25zZXMgcmVxdWVzdCB0byB0aGUgYnJpZGdlIGFuZCByZXR1cm5zIEpTT04gYnkgZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgY2FwdHVyZWQ6IElCeW9rTG1DaGF0UmVxdWVzdCB8IHVuZGVmaW5lZDtcblx0XHRhd2FpdCB3aXRoUHJveHkoXG5cdFx0XHRhc3luYyAocmVxdWVzdCkgPT4ge1xuXHRcdFx0XHRjYXB0dXJlZCA9IHJlcXVlc3Q7XG5cdFx0XHRcdHJldHVybiB7IG91dHB1dDogW3sgdHlwZTogJ21lc3NhZ2UnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdoZWxsbyBmcm9tIGJ5b2snIH1dIH1dIH07XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgKGhhbmRsZSkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHJlc3BvbnNlc1VybChoYW5kbGUsICdhY21lJyksIHtcblx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRoZWFkZXJzOiBhdXRoSGVhZGVycyhoYW5kbGUpLFxuXHRcdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6ICdjbGF1ZGUnLCBpbnB1dDogW3sgdHlwZTogJ21lc3NhZ2UnLCByb2xlOiAndXNlcicsIGNvbnRlbnQ6IFt7IHR5cGU6ICdpbnB1dF90ZXh0JywgdGV4dDogJ2hpJyB9XSB9XSB9KSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5zdGF0dXMsIDIwMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5oZWFkZXJzLmdldCgnY29udGVudC10eXBlJyksICdhcHBsaWNhdGlvbi9qc29uJyk7XG5cdFx0XHRcdGNvbnN0IGJvZHkgPSBhd2FpdCByZXNwb25zZS5qc29uKCkgYXMgeyBvdXRwdXQ6IEFycmF5PHsgY29udGVudDogQXJyYXk8eyB0ZXh0OiBzdHJpbmcgfT4gfT4gfTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJvZHkub3V0cHV0WzBdLmNvbnRlbnRbMF0udGV4dCwgJ2hlbGxvIGZyb20gYnlvaycpO1xuXHRcdFx0fSxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZD8udmVuZG9yLCAnYWNtZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZD8ubW9kZWxJZCwgJ2NsYXVkZScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FwdHVyZWQ/LmlucHV0LCBbeyB0eXBlOiAnbWVzc2FnZScsIHJvbGU6ICd1c2VyJywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnaGknIH1dIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZm9yd2FyZHMgaW1hZ2UgaW5wdXQgb24gdGhlIGluaXRpYWwgYW5kIHN1YnNlcXVlbnQgdHVybnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2FwdHVyZWQ6IElCeW9rTG1DaGF0UmVxdWVzdFtdID0gW107XG5cdFx0Y29uc3Qgc3RhdHVzZXM6IG51bWJlcltdID0gW107XG5cdFx0Y29uc3QgaW1hZ2VNZXNzYWdlID0ge1xuXHRcdFx0dHlwZTogJ21lc3NhZ2UnLFxuXHRcdFx0cm9sZTogJ3VzZXInLFxuXHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHR7IHR5cGU6ICdpbnB1dF90ZXh0JywgdGV4dDogJ1doYXQgaXMgaW4gdGhpcyBpbWFnZT8nIH0sXG5cdFx0XHRcdHsgdHlwZTogJ2lucHV0X2ltYWdlJywgaW1hZ2VfdXJsOiAnZGF0YTppbWFnZS9wbmc7YmFzZTY0LGlWQk9SdzBLR2dvPScgfSxcblx0XHRcdF0sXG5cdFx0fTtcblxuXHRcdGF3YWl0IHdpdGhQcm94eShcblx0XHRcdGFzeW5jIHJlcXVlc3QgPT4ge1xuXHRcdFx0XHRjYXB0dXJlZC5wdXNoKHJlcXVlc3QpO1xuXHRcdFx0XHRyZXR1cm4geyBvdXRwdXQ6IFtdIH07XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgaGFuZGxlID0+IHtcblx0XHRcdFx0Zm9yIChjb25zdCBpbnB1dCBvZiBbXG5cdFx0XHRcdFx0W2ltYWdlTWVzc2FnZV0sXG5cdFx0XHRcdFx0W2ltYWdlTWVzc2FnZSwgeyB0eXBlOiAnbWVzc2FnZScsIHJvbGU6ICd1c2VyJywgY29udGVudDogW3sgdHlwZTogJ2lucHV0X3RleHQnLCB0ZXh0OiAnVHJ5IGFnYWluIHdpdGhvdXQgYSBuZXcgaW1hZ2UuJyB9XSB9XSxcblx0XHRcdFx0XSkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2gocmVzcG9uc2VzVXJsKGhhbmRsZSwgJ2dlbWluaScpLCB7XG5cdFx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRcdGhlYWRlcnM6IGF1dGhIZWFkZXJzKGhhbmRsZSksXG5cdFx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnZ2VtaW5pLTMuNi1mbGFzaCcsIGlucHV0IH0pLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHN0YXR1c2VzLnB1c2gocmVzcG9uc2Uuc3RhdHVzKTtcblx0XHRcdFx0XHRhd2FpdCByZXNwb25zZS50ZXh0KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBzdGF0dXNlcywgaW5wdXQ6IGNhcHR1cmVkLm1hcChyZXF1ZXN0ID0+IHJlcXVlc3QuaW5wdXQpIH0sIHtcblx0XHRcdHN0YXR1c2VzOiBbMjAwLCAyMDBdLFxuXHRcdFx0aW5wdXQ6IFtcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdtZXNzYWdlJyxcblx0XHRcdFx0XHRcdHJvbGU6ICd1c2VyJyxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAndGV4dCcsIHRleHQ6ICdXaGF0IGlzIGluIHRoaXMgaW1hZ2U/JyB9LFxuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdpbWFnZScsIG1pbWVUeXBlOiAnaW1hZ2UvcG5nJywgZGF0YTogJ2lWQk9SdzBLR2dvPScgfSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdtZXNzYWdlJyxcblx0XHRcdFx0XHRcdHJvbGU6ICd1c2VyJyxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAndGV4dCcsIHRleHQ6ICdXaGF0IGlzIGluIHRoaXMgaW1hZ2U/JyB9LFxuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdpbWFnZScsIG1pbWVUeXBlOiAnaW1hZ2UvcG5nJywgZGF0YTogJ2lWQk9SdzBLR2dvPScgfSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnbWVzc2FnZScsXG5cdFx0XHRcdFx0XHRyb2xlOiAndXNlcicsXG5cdFx0XHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ3RleHQnLCB0ZXh0OiAnVHJ5IGFnYWluIHdpdGhvdXQgYSBuZXcgaW1hZ2UuJyB9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBpbWFnZSBVUkxzIHRoYXQgY2Fubm90IGJlIGZvcndhcmRlZCBhcyBpbmxpbmUgZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoUHJveHkoXG5cdFx0XHRhc3luYyAoKSA9PiAoeyBvdXRwdXQ6IFtdIH0pLFxuXHRcdFx0YXN5bmMgaGFuZGxlID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzcG9uc2VzOiBBcnJheTx7IHN0YXR1czogbnVtYmVyOyBib2R5OiB1bmtub3duIH0+ID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgaW1hZ2VVcmwgb2YgWydodHRwczovL2V4YW1wbGUuY29tL2ltYWdlLnBuZycsICdkYXRhOmltYWdlL3N2Zyt4bWw7YmFzZTY0LFBITjJaejQ9JywgJ2RhdGE6aW1hZ2UvcG5nO2Jhc2U2NCxub3QgdmFsaWQnXSkge1xuXHRcdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2gocmVzcG9uc2VzVXJsKGhhbmRsZSwgJ2dlbWluaScpLCB7XG5cdFx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRcdGhlYWRlcnM6IGF1dGhIZWFkZXJzKGhhbmRsZSksXG5cdFx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdFx0XHRcdG1vZGVsOiAnZ2VtaW5pLTMuNi1mbGFzaCcsXG5cdFx0XHRcdFx0XHRcdGlucHV0OiBbe1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdtZXNzYWdlJyxcblx0XHRcdFx0XHRcdFx0XHRyb2xlOiAndXNlcicsXG5cdFx0XHRcdFx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogJ2lucHV0X2ltYWdlJywgaW1hZ2VfdXJsOiBpbWFnZVVybCB9XSxcblx0XHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRyZXNwb25zZXMucHVzaCh7IHN0YXR1czogcmVzcG9uc2Uuc3RhdHVzLCBib2R5OiBhd2FpdCByZXNwb25zZS5qc29uKCkgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3BvbnNlcywgW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHN0YXR1czogNDAwLFxuXHRcdFx0XHRcdFx0Ym9keToge1xuXHRcdFx0XHRcdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRcdFx0XHRcdG1lc3NhZ2U6ICdVbnN1cHBvcnRlZCBpbnB1dFswXS5jb250ZW50WzBdLmltYWdlX3VybCcsXG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2ludmFsaWRfcmVxdWVzdF9lcnJvcicsXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c3RhdHVzOiA0MDAsXG5cdFx0XHRcdFx0XHRib2R5OiB7XG5cdFx0XHRcdFx0XHRcdGVycm9yOiB7XG5cdFx0XHRcdFx0XHRcdFx0bWVzc2FnZTogJ1Vuc3VwcG9ydGVkIGlucHV0WzBdLmNvbnRlbnRbMF0uaW1hZ2VfdXJsIE1JTUUgdHlwZSBcXCdpbWFnZS9zdmcreG1sXFwnJyxcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnaW52YWxpZF9yZXF1ZXN0X2Vycm9yJyxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRzdGF0dXM6IDQwMCxcblx0XHRcdFx0XHRcdGJvZHk6IHtcblx0XHRcdFx0XHRcdFx0ZXJyb3I6IHtcblx0XHRcdFx0XHRcdFx0XHRtZXNzYWdlOiAnSW52YWxpZCBpbnB1dFswXS5jb250ZW50WzBdLmltYWdlX3VybCcsXG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2ludmFsaWRfcmVxdWVzdF9lcnJvcicsXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0pO1xuXHRcdFx0fSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3J3YXJkcyBjdXN0b20gdG9vbCBjYWxsIGhpc3Rvcnkgd2l0aCBmcmVlZm9ybSBpbnB1dCcsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgY2FwdHVyZWQ6IElCeW9rTG1DaGF0UmVxdWVzdCB8IHVuZGVmaW5lZDtcblx0XHRhd2FpdCB3aXRoUHJveHkoXG5cdFx0XHRhc3luYyAocmVxdWVzdCkgPT4ge1xuXHRcdFx0XHRjYXB0dXJlZCA9IHJlcXVlc3Q7XG5cdFx0XHRcdHJldHVybiB7IG91dHB1dDogW3sgdHlwZTogJ21lc3NhZ2UnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdkb25lJyB9XSB9XSB9O1xuXHRcdFx0fSxcblx0XHRcdGFzeW5jIChoYW5kbGUpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChyZXNwb25zZXNVcmwoaGFuZGxlLCAnYWNtZScpLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczogYXV0aEhlYWRlcnMoaGFuZGxlKSxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdFx0XHRtb2RlbDogJ20nLFxuXHRcdFx0XHRcdFx0aW5wdXQ6IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdjdXN0b21fdG9vbF9jYWxsJyxcblx0XHRcdFx0XHRcdFx0XHRjYWxsX2lkOiAnY2FsbF8xJyxcblx0XHRcdFx0XHRcdFx0XHRuYW1lOiAnYXBwbHlfcGF0Y2gnLFxuXHRcdFx0XHRcdFx0XHRcdGlucHV0OiAnKioqIEJlZ2luIFBhdGNoXFxuKioqIEVuZCBQYXRjaCcsXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2N1c3RvbV90b29sX2NhbGxfb3V0cHV0JywgY2FsbF9pZDogJ2NhbGxfMScsIG91dHB1dDogJ0RvbmUhJyB9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5zdGF0dXMsIDIwMCk7XG5cdFx0XHRcdGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcblx0XHRcdH0sXG5cdFx0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhcHR1cmVkPy5pbnB1dCwgW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnY3VzdG9tX3Rvb2xfY2FsbCcsXG5cdFx0XHRcdGNhbGxJZDogJ2NhbGxfMScsXG5cdFx0XHRcdG5hbWU6ICdhcHBseV9wYXRjaCcsXG5cdFx0XHRcdGlucHV0OiAnKioqIEJlZ2luIFBhdGNoXFxuKioqIEVuZCBQYXRjaCcsXG5cdFx0XHR9LFxuXHRcdFx0eyB0eXBlOiAnY3VzdG9tX3Rvb2xfY2FsbF9vdXRwdXQnLCBjYWxsSWQ6ICdjYWxsXzEnLCBvdXRwdXQ6ICdEb25lIScgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZGVjb2RlcyBhIHVybC1lbmNvZGVkIHZlbmRvciBwYXRoIHNlZ21lbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGNhcHR1cmVkOiBJQnlva0xtQ2hhdFJlcXVlc3QgfCB1bmRlZmluZWQ7XG5cdFx0YXdhaXQgd2l0aFByb3h5KFxuXHRcdFx0YXN5bmMgKHJlcXVlc3QpID0+IHsgY2FwdHVyZWQgPSByZXF1ZXN0OyByZXR1cm4geyBvdXRwdXQ6IFt7IHR5cGU6ICdtZXNzYWdlJywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnb2snIH1dIH1dIH07IH0sXG5cdFx0XHRhc3luYyAoaGFuZGxlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2gocmVzcG9uc2VzVXJsKGhhbmRsZSwgJ2FjbWUgY29ycCcpLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczogYXV0aEhlYWRlcnMoaGFuZGxlKSxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnbScsIGlucHV0OiBbXSB9KSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5zdGF0dXMsIDIwMCk7XG5cdFx0XHRcdGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcblx0XHRcdH0sXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwdHVyZWQ/LnZlbmRvciwgJ2FjbWUgY29ycCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIGEgdmVuZG9yIHRoYXQgZGVjb2RlcyB0byBhIG11bHRpLXNlZ21lbnQgcGF0aCAoJTJGKScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoUHJveHkoXG5cdFx0XHRhc3luYyAoKSA9PiAoeyBvdXRwdXQ6IFtdIH0pLFxuXHRcdFx0YXN5bmMgKGhhbmRsZSkgPT4ge1xuXHRcdFx0XHQvLyBgZW5jb2RlVVJJQ29tcG9uZW50KCdhL2InKWAgXHUyMTkyIGBhJTJGYmAsIHdoaWNoIHN1cnZpdmVzIHRoZVxuXHRcdFx0XHQvLyBwcmUtZGVjb2RlIHNlZ21lbnQgY2hlY2sgYnV0IGRlY29kZXMgYmFjayBpbnRvIGBhL2JgLlxuXHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHJlc3BvbnNlc1VybChoYW5kbGUsICdhL2InKSwge1xuXHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IGF1dGhIZWFkZXJzKGhhbmRsZSksXG5cdFx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ20nLCBpbnB1dDogW10gfSksXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2Uuc3RhdHVzLCA0MDQpO1xuXHRcdFx0fSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJlYW1zIGFzc2lzdGFudCB0b29sIGNhbGxzIGFzIE9wZW5BSSB0b29sX2NhbGwgZGVsdGFzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhQcm94eShcblx0XHRcdGFzeW5jICgpID0+ICh7IG91dHB1dDogW3sgdHlwZTogJ2Z1bmN0aW9uX2NhbGwnLCBjYWxsSWQ6ICdjYWxsXzEnLCBuYW1lOiAnZ2V0V2VhdGhlcicsIGFyZ3VtZW50c0pzb246ICd7XCJjaXR5XCI6XCJOWUNcIn0nIH1dIH0pLFxuXHRcdFx0YXN5bmMgKGhhbmRsZSkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKHJlc3BvbnNlc1VybChoYW5kbGUsICdhY21lJyksIHtcblx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRoZWFkZXJzOiBhdXRoSGVhZGVycyhoYW5kbGUpLFxuXHRcdFx0XHRcdGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbW9kZWw6ICdtJywgaW5wdXQ6ICd3ZWF0aGVyPycsIHN0cmVhbTogdHJ1ZSB9KSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG5cdFx0XHRcdGFzc2VydC5vayh0ZXh0LmluY2x1ZGVzKCdcInR5cGVcIjpcImZ1bmN0aW9uX2NhbGxcIicpLCBgZXhwZWN0ZWQgZnVuY3Rpb25fY2FsbCBpbiBTU0U6ICR7dGV4dH1gKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHRleHQuaW5jbHVkZXMoJ2V2ZW50OiByZXNwb25zZS5jb21wbGV0ZWQnKSwgYGV4cGVjdGVkIGNvbXBsZXRlZCByZXNwb25zZTogJHt0ZXh0fWApO1xuXHRcdFx0XHRhc3NlcnQub2sodGV4dC5pbmNsdWRlcygnZ2V0V2VhdGhlcicpKTtcblx0XHRcdH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBhIDUwMiB3aGVuIHRoZSBicmlkZ2UgcmVwb3J0cyBhbiBlcnJvcicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoUHJveHkoXG5cdFx0XHRhc3luYyAoKSA9PiAoeyBvdXRwdXQ6IFtdLCBlcnJvcjogJ21vZGVsIHVuYXZhaWxhYmxlJyB9KSxcblx0XHRcdGFzeW5jIChoYW5kbGUpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChyZXNwb25zZXNVcmwoaGFuZGxlLCAnYWNtZScpLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczogYXV0aEhlYWRlcnMoaGFuZGxlKSxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnbScsIGlucHV0OiBbXSB9KSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5zdGF0dXMsIDUwMik7XG5cdFx0XHRcdGNvbnN0IGJvZHkgPSBhd2FpdCByZXNwb25zZS5qc29uKCkgYXMgeyBlcnJvcj86IHsgbWVzc2FnZT86IHN0cmluZyB9IH07XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChib2R5LmVycm9yPy5tZXNzYWdlLCAnbW9kZWwgdW5hdmFpbGFibGUnKTtcblx0XHRcdH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBhIDUwMiB3aGVuIHRoZSBicmlkZ2UgdGhyb3dzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhQcm94eShcblx0XHRcdGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdicmlkZ2UgZXhwbG9kZWQnKTsgfSxcblx0XHRcdGFzeW5jIChoYW5kbGUpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChyZXNwb25zZXNVcmwoaGFuZGxlLCAnYWNtZScpLCB7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0aGVhZGVyczogYXV0aEhlYWRlcnMoaGFuZGxlKSxcblx0XHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnbScsIGlucHV0OiBbXSB9KSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5zdGF0dXMsIDUwMik7XG5cdFx0XHRcdGNvbnN0IGJvZHkgPSBhd2FpdCByZXNwb25zZS5qc29uKCkgYXMgeyBlcnJvcj86IHsgbWVzc2FnZT86IHN0cmluZyB9IH07XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChib2R5LmVycm9yPy5tZXNzYWdlLCAnYnJpZGdlIGV4cGxvZGVkJyk7XG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgYSBtYWxmb3JtZWQgSlNPTiBib2R5IHdpdGggNDAwJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhQcm94eShcblx0XHRcdGFzeW5jICgpID0+ICh7IG91dHB1dDogW10gfSksXG5cdFx0XHRhc3luYyAoaGFuZGxlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2gocmVzcG9uc2VzVXJsKGhhbmRsZSwgJ2FjbWUnKSwge1xuXHRcdFx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IGF1dGhIZWFkZXJzKGhhbmRsZSksXG5cdFx0XHRcdFx0Ym9keTogJ25vdCBqc29uJyxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5zdGF0dXMsIDQwMCk7XG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgYSA1MDMgd2hlbiBubyByZW5kZXJlciBicmlkZ2UgaXMgY29ubmVjdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gbmV3IEJ5b2tMbUJyaWRnZVJlZ2lzdHJ5KCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBCeW9rTG1Qcm94eVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIHJlZ2lzdHJ5KTtcblx0XHRjb25zdCBoYW5kbGUgPSBhd2FpdCBzZXJ2aWNlLnN0YXJ0KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2gocmVzcG9uc2VzVXJsKGhhbmRsZSwgJ2FjbWUnKSwge1xuXHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0aGVhZGVyczogYXV0aEhlYWRlcnMoaGFuZGxlKSxcblx0XHRcdFx0Ym9keTogSlNPTi5zdHJpbmdpZnkoeyBtb2RlbDogJ20nLCBpbnB1dDogW10gfSksXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5zdGF0dXMsIDUwMyk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRzZXJ2aWNlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JvdXRlcyByZXF1ZXN0cyB0byBhIHNlcnZpbmcgd2luZG93IGFuZCBleGNsdWRlcyBhIG5vbi1zZXJ2aW5nIG9uZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IG5ldyBCeW9rTG1CcmlkZ2VSZWdpc3RyeSgpO1xuXHRcdGNvbnN0IGNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdC8vIFRoZSBzZXJ2aW5nIHdpbmRvdyAoZWRpdG9yKTogcHVzaGVzIG1vZGVscyBhbmQgYW5zd2VycyBjaGF0LlxuXHRcdGNvbnN0IHJlZ1NlcnZpbmcgPSByZWdpc3RyeS5yZWdpc3RlcignZWRpdG9yJywgc2VydmluZ0Nvbm5lY3Rpb24oXG5cdFx0XHRhc3luYyAoKSA9PiB7IGNhbGxzLnB1c2goJ3NlcnZpbmcnKTsgcmV0dXJuIHsgb3V0cHV0OiBbeyB0eXBlOiAnbWVzc2FnZScsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2Zyb20gc2VydmluZycgfV0gfV0gfTsgfSxcblx0XHRcdFt7IHZlbmRvcjogJ2FjbWUnLCBpZDogJ2NsYXVkZScgfV0sXG5cdFx0KSk7XG5cdFx0Ly8gQSBub24tc2VydmluZyB3aW5kb3cgKGNvbm5lY3RlZCB3aXRob3V0IGEgQllPSyBoYW5kbGVyKTogaXQgbmV2ZXIgcHVzaGVzXG5cdFx0Ly8gYSBzbmFwc2hvdCwgc28gaXQgbXVzdCBuZXZlciBiZSBwaWNrZWQgZm9yIHJvdXRpbmcgZXZlbiB0aG91Z2ggY29ubmVjdGVkLlxuXHRcdGNvbnN0IHJlZ05vblNlcnZpbmcgPSByZWdpc3RyeS5yZWdpc3Rlcignbm8taGFuZGxlcicsIHtcblx0XHRcdGNoYXQ6IGFzeW5jICgpID0+IHsgY2FsbHMucHVzaCgnbm8taGFuZGxlcicpOyByZXR1cm4geyBvdXRwdXQ6IFt7IHR5cGU6ICdtZXNzYWdlJywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnZnJvbSBub24tc2VydmluZycgfV0gfV0gfTsgfSxcblx0XHRcdG9uRGlkQ2hhbmdlTW9kZWxzOiBFdmVudC5Ob25lLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgQnlva0xtUHJveHlTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCByZWdpc3RyeSk7XG5cdFx0Y29uc3QgaGFuZGxlID0gYXdhaXQgc2VydmljZS5zdGFydCgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXMgPSBhd2FpdCBmZXRjaChyZXNwb25zZXNVcmwoaGFuZGxlLCAnYWNtZScpLCB7XG5cdFx0XHRcdG1ldGhvZDogJ1BPU1QnLCBoZWFkZXJzOiBhdXRoSGVhZGVycyhoYW5kbGUpLFxuXHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1vZGVsOiAnY2xhdWRlJywgaW5wdXQ6IFtdIH0pLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cm91dGVkVG9TZXJ2aW5nOiAoYXdhaXQgcmVzLnRleHQoKSkuaW5jbHVkZXMoJ2Zyb20gc2VydmluZycpLFxuXHRcdFx0XHRjYWxscyxcblx0XHRcdH0sIHsgcm91dGVkVG9TZXJ2aW5nOiB0cnVlLCBjYWxsczogWydzZXJ2aW5nJ10gfSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGhhbmRsZS5kaXNwb3NlKCk7XG5cdFx0XHRyZWdTZXJ2aW5nLmRpc3Bvc2UoKTtcblx0XHRcdHJlZ05vblNlcnZpbmcuZGlzcG9zZSgpO1xuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZWJpbmRzIHdpdGggYSBmcmVzaCBub25jZSBhZnRlciBldmVyeSBoYW5kbGUgaXMgZGlzcG9zZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBuZXcgQnlva0xtQnJpZGdlUmVnaXN0cnkoKTtcblx0XHRjb25zdCByZWdpc3RyYXRpb24gPSByZWdpc3RyeS5yZWdpc3RlcignY2xpZW50LTEnLCBzZXJ2aW5nQ29ubmVjdGlvbihhc3luYyAoKSA9PiAoeyBvdXRwdXQ6IFt7IHR5cGU6ICdtZXNzYWdlJywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnb2snIH1dIH1dIH0pKSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBCeW9rTG1Qcm94eVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIHJlZ2lzdHJ5KTtcblx0XHRjb25zdCBmaXJzdCA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoKTtcblx0XHRjb25zdCBmaXJzdE5vbmNlID0gZmlyc3Qubm9uY2U7XG5cdFx0Zmlyc3QuZGlzcG9zZSgpO1xuXHRcdGNvbnN0IHNlY29uZCA9IGF3YWl0IHNlcnZpY2Uuc3RhcnQoKTtcblx0XHR0cnkge1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHNlY29uZC5ub25jZSwgZmlyc3ROb25jZSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHNlY29uZC5kaXNwb3NlKCk7XG5cdFx0XHRyZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXHRcdFx0c2VydmljZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMEJBQW1EO0FB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
