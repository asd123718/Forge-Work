import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { McpServerStatus } from "../../../common/state/protocol/channels-session/state.js";
import { buildCodexMcpReadResult, codexMcpListToInventory, codexMcpServersFromConfig, codexMcpStatusToEntry, codexMcpToolsChanged, codexStartupErrorNeedsAuth, codexToolMapToArray, injectCodexMcpAuthTokens, inventoryToSdkServers, normalizeCodexMcpResourceUrl, translateCodexMcpStartupState } from "../../../node/codex/codexMcpServers.js";
suite("codexMcpServers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const tool = (name) => ({ name, inputSchema: { type: "object" } });
  const status = (name, tools) => ({
    name,
    serverInfo: null,
    tools: Object.fromEntries(tools.map((t) => [t.name, t])),
    resources: [{ name: `${name}-res`, uri: `mem://${name}/r` }],
    resourceTemplates: [{ name: `${name}-tpl`, uriTemplate: `mem://${name}/{id}` }],
    authStatus: "unsupported"
  });
  test("translateCodexMcpStartupState maps every lifecycle state", () => {
    assert.deepStrictEqual([
      translateCodexMcpStartupState("ready", null),
      translateCodexMcpStartupState("starting", null),
      translateCodexMcpStartupState("failed", "boom"),
      translateCodexMcpStartupState("failed", null),
      translateCodexMcpStartupState("cancelled", null)
    ], [
      { kind: McpServerStatus.Ready },
      { kind: McpServerStatus.Starting },
      { kind: McpServerStatus.Error, error: { errorType: "mcp-server-failed", message: "boom" } },
      { kind: McpServerStatus.Error, error: { errorType: "mcp-server-failed", message: "MCP server failed to start" } },
      { kind: McpServerStatus.Stopped }
    ]);
  });
  test("codexToolMapToArray flattens and name-sorts, dropping holes", () => {
    const tools = { beta: tool("beta"), alpha: tool("alpha"), gone: void 0 };
    assert.deepStrictEqual(codexToolMapToArray(tools).map((t) => t.name), ["alpha", "beta"]);
  });
  test("codexMcpListToInventory + inventoryToSdkServers build a Ready snapshot", () => {
    const inventory = codexMcpListToInventory([status("s1", [tool("t1")]), status("s2", [])]);
    assert.deepStrictEqual({
      s1: codexMcpStatusToEntry(status("s1", [tool("t1")])),
      sdk: inventoryToSdkServers(inventory)
    }, {
      s1: {
        state: { kind: McpServerStatus.Ready },
        tools: [tool("t1")],
        resources: [{ name: "s1-res", uri: "mem://s1/r" }],
        resourceTemplates: [{ name: "s1-tpl", uriTemplate: "mem://s1/{id}" }]
      },
      sdk: [
        { name: "s1", state: { kind: McpServerStatus.Ready } },
        { name: "s2", state: { kind: McpServerStatus.Ready } }
      ]
    });
  });
  test("buildCodexMcpReadResult answers read methods from cache and defers the rest", () => {
    const entry = codexMcpStatusToEntry(status("s1", [tool("t1")]));
    assert.deepStrictEqual({
      tools: buildCodexMcpReadResult("tools/list", entry),
      resources: buildCodexMcpReadResult("resources/list", entry),
      templates: buildCodexMcpReadResult("resources/templates/list", entry),
      call: buildCodexMcpReadResult("tools/call", entry)
    }, {
      tools: { handled: true, result: { tools: [tool("t1")] } },
      resources: { handled: true, result: { resources: [{ name: "s1-res", uri: "mem://s1/r" }] } },
      templates: { handled: true, result: { resourceTemplates: [{ name: "s1-tpl", uriTemplate: "mem://s1/{id}" }] } },
      call: { handled: false }
    });
  });
  test("codexMcpToolsChanged detects tool-set changes by name", () => {
    const a = codexMcpStatusToEntry(status("s", [tool("t1")]));
    const sameNames = codexMcpStatusToEntry(status("s", [tool("t1")]));
    const added = codexMcpStatusToEntry(status("s", [tool("t1"), tool("t2")]));
    assert.deepStrictEqual([
      codexMcpToolsChanged(a, sameNames),
      codexMcpToolsChanged(a, added),
      codexMcpToolsChanged(void 0, a)
    ], [false, true, true]);
  });
  suite("codexMcpServersFromConfig", () => {
    test("maps stdio + http servers, stringifies env, and maps headers to http_headers", () => {
      assert.deepStrictEqual(codexMcpServersFromConfig({
        local: { type: "stdio", command: "npx", args: ["-y", "pkg"], env: { KEY: "val", N: 3, DROP: null }, cwd: "/w" },
        remote: { type: "http", url: "https://x/mcp", headers: { Authorization: "token-value" } }
      }), {
        local: { command: "npx", args: ["-y", "pkg"], env: { KEY: "val", N: "3" }, cwd: "/w" },
        remote: { url: "https://x/mcp", http_headers: { Authorization: "token-value" } }
      });
    });
    test("omits empty args/env/headers and command-only stdio", () => {
      assert.deepStrictEqual(codexMcpServersFromConfig({
        bare: { type: "stdio", command: "run", args: [], env: {} },
        plain: { type: "http", url: "https://y" }
      }), {
        bare: { command: "run" },
        plain: { url: "https://y" }
      });
    });
    test("keeps server names with dots/spaces (per-thread JSON keys, not `-c` override keys)", () => {
      assert.deepStrictEqual(codexMcpServersFromConfig({
        "dotted.name": { type: "stdio", command: "ok" },
        " spaced ": { type: "http", url: "https://z" }
      }), {
        "dotted.name": { command: "ok" },
        " spaced ": { url: "https://z" }
      });
    });
    test("skips malformed / unsupported entries", () => {
      assert.deepStrictEqual(codexMcpServersFromConfig({
        noCommand: { type: "stdio" },
        noUrl: { type: "http" },
        unknownType: { type: "sse", url: "https://z" },
        notObject: 42,
        good: { type: "stdio", command: "ok" }
      }), {
        good: { command: "ok" }
      });
    });
    test("sanitizes non-string args/env/headers/cwd from untrusted config", () => {
      assert.deepStrictEqual(codexMcpServersFromConfig({
        local: { type: "stdio", command: "npx", args: [1, "a", null, true], env: { N: 3 }, cwd: 5 },
        remote: { type: "http", url: "https://x", headers: { Authorization: 1, "X-Ok": "s" } }
      }), {
        local: { command: "npx", args: ["1", "a", "true"], env: { N: "3" } },
        remote: { url: "https://x", http_headers: { Authorization: "1", "X-Ok": "s" } }
      });
    });
    test("returns empty for undefined / empty config", () => {
      assert.deepStrictEqual([
        codexMcpServersFromConfig(void 0),
        codexMcpServersFromConfig({})
      ], [{}, {}]);
    });
  });
  suite("MCP authentication helpers", () => {
    test("normalizeCodexMcpResourceUrl strips fragment + trailing slashes; undefined for non-URL", () => {
      assert.deepStrictEqual([
        normalizeCodexMcpResourceUrl("https://mcp.eng.ms/"),
        normalizeCodexMcpResourceUrl("https://mcp.eng.ms"),
        normalizeCodexMcpResourceUrl("https://mcp.eng.ms/mcp/#frag"),
        normalizeCodexMcpResourceUrl("not a url")
      ], [
        "https://mcp.eng.ms/",
        "https://mcp.eng.ms/",
        "https://mcp.eng.ms/mcp",
        void 0
      ]);
    });
    test("codexStartupErrorNeedsAuth matches login/auth phrasing, not generic failures", () => {
      assert.deepStrictEqual([
        codexStartupErrorNeedsAuth("The eng-hub-test MCP server is not logged in. Run `codex mcp login eng-hub-test`."),
        codexStartupErrorNeedsAuth("Unauthorized"),
        codexStartupErrorNeedsAuth("request failed with 401"),
        codexStartupErrorNeedsAuth("spawn ENOENT"),
        codexStartupErrorNeedsAuth(null),
        codexStartupErrorNeedsAuth(void 0)
      ], [true, true, true, false, false, false]);
    });
    test("injectCodexMcpAuthTokens adds a bearer header for http servers with a token, leaving others intact", () => {
      const tokens = /* @__PURE__ */ new Map([["https://mcp.eng.ms/", "tok-123"]]);
      assert.deepStrictEqual(injectCodexMcpAuthTokens({
        "eng-hub-test": { url: "https://mcp.eng.ms" },
        "with-headers": { url: "https://mcp.eng.ms/", http_headers: { "X-Test": "v1" } },
        "no-token": { url: "https://other.example/mcp" },
        "stdio": { command: "run" }
      }, tokens), {
        "eng-hub-test": { url: "https://mcp.eng.ms", http_headers: { Authorization: "Bearer tok-123" } },
        "with-headers": { url: "https://mcp.eng.ms/", http_headers: { "X-Test": "v1", Authorization: "Bearer tok-123" } },
        "no-token": { url: "https://other.example/mcp" },
        "stdio": { command: "run" }
      });
    });
    test("injectCodexMcpAuthTokens returns the input unchanged when there are no tokens", () => {
      const servers = { s: { url: "https://mcp.eng.ms" } };
      assert.strictEqual(injectCodexMcpAuthTokens(servers, /* @__PURE__ */ new Map()), servers);
    });
    test("injectCodexMcpAuthTokens strips a pre-existing case-insensitive authorization header", () => {
      const tokens = /* @__PURE__ */ new Map([["https://mcp.eng.ms/", "tok-123"]]);
      assert.deepStrictEqual(injectCodexMcpAuthTokens({
        s: { url: "https://mcp.eng.ms", http_headers: { authorization: "Bearer stale", "X-Test": "v1" } }
      }, tokens), {
        s: { url: "https://mcp.eng.ms", http_headers: { "X-Test": "v1", Authorization: "Bearer tok-123" } }
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb2RleFxcY29kZXhNY3BTZXJ2ZXJzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE1jcFNlcnZlclN0YXR1cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jaGFubmVscy1zZXNzaW9uL3N0YXRlLmpzJztcbmltcG9ydCB7IGJ1aWxkQ29kZXhNY3BSZWFkUmVzdWx0LCBjb2RleE1jcExpc3RUb0ludmVudG9yeSwgY29kZXhNY3BTZXJ2ZXJzRnJvbUNvbmZpZywgY29kZXhNY3BTdGF0dXNUb0VudHJ5LCBjb2RleE1jcFRvb2xzQ2hhbmdlZCwgY29kZXhTdGFydHVwRXJyb3JOZWVkc0F1dGgsIGNvZGV4VG9vbE1hcFRvQXJyYXksIGluamVjdENvZGV4TWNwQXV0aFRva2VucywgaW52ZW50b3J5VG9TZGtTZXJ2ZXJzLCBub3JtYWxpemVDb2RleE1jcFJlc291cmNlVXJsLCB0cmFuc2xhdGVDb2RleE1jcFN0YXJ0dXBTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL25vZGUvY29kZXgvY29kZXhNY3BTZXJ2ZXJzLmpzJztcbmltcG9ydCB0eXBlIHsgTWNwU2VydmVyU3RhdHVzIGFzIENvZGV4TWNwU2VydmVyU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9jb2RleC9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvTWNwU2VydmVyU3RhdHVzLmpzJztcbmltcG9ydCB0eXBlIHsgVG9vbCB9IGZyb20gJy4uLy4uLy4uL25vZGUvY29kZXgvcHJvdG9jb2wvZ2VuZXJhdGVkL1Rvb2wuanMnO1xuXG5zdWl0ZSgnY29kZXhNY3BTZXJ2ZXJzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHRvb2wgPSAobmFtZTogc3RyaW5nKTogVG9vbCA9PiAoeyBuYW1lLCBpbnB1dFNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JyB9IH0pO1xuXG5cdGNvbnN0IHN0YXR1cyA9IChuYW1lOiBzdHJpbmcsIHRvb2xzOiBUb29sW10pOiBDb2RleE1jcFNlcnZlclN0YXR1cyA9PiAoe1xuXHRcdG5hbWUsXG5cdFx0c2VydmVySW5mbzogbnVsbCxcblx0XHR0b29sczogT2JqZWN0LmZyb21FbnRyaWVzKHRvb2xzLm1hcCh0ID0+IFt0Lm5hbWUsIHRdKSksXG5cdFx0cmVzb3VyY2VzOiBbeyBuYW1lOiBgJHtuYW1lfS1yZXNgLCB1cmk6IGBtZW06Ly8ke25hbWV9L3JgIH1dLFxuXHRcdHJlc291cmNlVGVtcGxhdGVzOiBbeyBuYW1lOiBgJHtuYW1lfS10cGxgLCB1cmlUZW1wbGF0ZTogYG1lbTovLyR7bmFtZX0ve2lkfWAgfV0sXG5cdFx0YXV0aFN0YXR1czogJ3Vuc3VwcG9ydGVkJyxcblx0fSk7XG5cblx0dGVzdCgndHJhbnNsYXRlQ29kZXhNY3BTdGFydHVwU3RhdGUgbWFwcyBldmVyeSBsaWZlY3ljbGUgc3RhdGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHR0cmFuc2xhdGVDb2RleE1jcFN0YXJ0dXBTdGF0ZSgncmVhZHknLCBudWxsKSxcblx0XHRcdHRyYW5zbGF0ZUNvZGV4TWNwU3RhcnR1cFN0YXRlKCdzdGFydGluZycsIG51bGwpLFxuXHRcdFx0dHJhbnNsYXRlQ29kZXhNY3BTdGFydHVwU3RhdGUoJ2ZhaWxlZCcsICdib29tJyksXG5cdFx0XHR0cmFuc2xhdGVDb2RleE1jcFN0YXJ0dXBTdGF0ZSgnZmFpbGVkJywgbnVsbCksXG5cdFx0XHR0cmFuc2xhdGVDb2RleE1jcFN0YXJ0dXBTdGF0ZSgnY2FuY2VsbGVkJywgbnVsbCksXG5cdFx0XSwgW1xuXHRcdFx0eyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHkgfSxcblx0XHRcdHsga2luZDogTWNwU2VydmVyU3RhdHVzLlN0YXJ0aW5nIH0sXG5cdFx0XHR7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5FcnJvciwgZXJyb3I6IHsgZXJyb3JUeXBlOiAnbWNwLXNlcnZlci1mYWlsZWQnLCBtZXNzYWdlOiAnYm9vbScgfSB9LFxuXHRcdFx0eyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuRXJyb3IsIGVycm9yOiB7IGVycm9yVHlwZTogJ21jcC1zZXJ2ZXItZmFpbGVkJywgbWVzc2FnZTogJ01DUCBzZXJ2ZXIgZmFpbGVkIHRvIHN0YXJ0JyB9IH0sXG5cdFx0XHR7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5TdG9wcGVkIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvZGV4VG9vbE1hcFRvQXJyYXkgZmxhdHRlbnMgYW5kIG5hbWUtc29ydHMsIGRyb3BwaW5nIGhvbGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRvb2xzID0geyBiZXRhOiB0b29sKCdiZXRhJyksIGFscGhhOiB0b29sKCdhbHBoYScpLCBnb25lOiB1bmRlZmluZWQgfTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvZGV4VG9vbE1hcFRvQXJyYXkodG9vbHMpLm1hcCh0ID0+IHQubmFtZSksIFsnYWxwaGEnLCAnYmV0YSddKTtcblx0fSk7XG5cblx0dGVzdCgnY29kZXhNY3BMaXN0VG9JbnZlbnRvcnkgKyBpbnZlbnRvcnlUb1Nka1NlcnZlcnMgYnVpbGQgYSBSZWFkeSBzbmFwc2hvdCcsICgpID0+IHtcblx0XHRjb25zdCBpbnZlbnRvcnkgPSBjb2RleE1jcExpc3RUb0ludmVudG9yeShbc3RhdHVzKCdzMScsIFt0b29sKCd0MScpXSksIHN0YXR1cygnczInLCBbXSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHMxOiBjb2RleE1jcFN0YXR1c1RvRW50cnkoc3RhdHVzKCdzMScsIFt0b29sKCd0MScpXSkpLFxuXHRcdFx0c2RrOiBpbnZlbnRvcnlUb1Nka1NlcnZlcnMoaW52ZW50b3J5KSxcblx0XHR9LCB7XG5cdFx0XHRzMToge1xuXHRcdFx0XHRzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHkgfSxcblx0XHRcdFx0dG9vbHM6IFt0b29sKCd0MScpXSxcblx0XHRcdFx0cmVzb3VyY2VzOiBbeyBuYW1lOiAnczEtcmVzJywgdXJpOiAnbWVtOi8vczEvcicgfV0sXG5cdFx0XHRcdHJlc291cmNlVGVtcGxhdGVzOiBbeyBuYW1lOiAnczEtdHBsJywgdXJpVGVtcGxhdGU6ICdtZW06Ly9zMS97aWR9JyB9XSxcblx0XHRcdH0sXG5cdFx0XHRzZGs6IFtcblx0XHRcdFx0eyBuYW1lOiAnczEnLCBzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHkgfSB9LFxuXHRcdFx0XHR7IG5hbWU6ICdzMicsIHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5SZWFkeSB9IH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdidWlsZENvZGV4TWNwUmVhZFJlc3VsdCBhbnN3ZXJzIHJlYWQgbWV0aG9kcyBmcm9tIGNhY2hlIGFuZCBkZWZlcnMgdGhlIHJlc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZW50cnkgPSBjb2RleE1jcFN0YXR1c1RvRW50cnkoc3RhdHVzKCdzMScsIFt0b29sKCd0MScpXSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dG9vbHM6IGJ1aWxkQ29kZXhNY3BSZWFkUmVzdWx0KCd0b29scy9saXN0JywgZW50cnkpLFxuXHRcdFx0cmVzb3VyY2VzOiBidWlsZENvZGV4TWNwUmVhZFJlc3VsdCgncmVzb3VyY2VzL2xpc3QnLCBlbnRyeSksXG5cdFx0XHR0ZW1wbGF0ZXM6IGJ1aWxkQ29kZXhNY3BSZWFkUmVzdWx0KCdyZXNvdXJjZXMvdGVtcGxhdGVzL2xpc3QnLCBlbnRyeSksXG5cdFx0XHRjYWxsOiBidWlsZENvZGV4TWNwUmVhZFJlc3VsdCgndG9vbHMvY2FsbCcsIGVudHJ5KSxcblx0XHR9LCB7XG5cdFx0XHR0b29sczogeyBoYW5kbGVkOiB0cnVlLCByZXN1bHQ6IHsgdG9vbHM6IFt0b29sKCd0MScpXSB9IH0sXG5cdFx0XHRyZXNvdXJjZXM6IHsgaGFuZGxlZDogdHJ1ZSwgcmVzdWx0OiB7IHJlc291cmNlczogW3sgbmFtZTogJ3MxLXJlcycsIHVyaTogJ21lbTovL3MxL3InIH1dIH0gfSxcblx0XHRcdHRlbXBsYXRlczogeyBoYW5kbGVkOiB0cnVlLCByZXN1bHQ6IHsgcmVzb3VyY2VUZW1wbGF0ZXM6IFt7IG5hbWU6ICdzMS10cGwnLCB1cmlUZW1wbGF0ZTogJ21lbTovL3MxL3tpZH0nIH1dIH0gfSxcblx0XHRcdGNhbGw6IHsgaGFuZGxlZDogZmFsc2UgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29kZXhNY3BUb29sc0NoYW5nZWQgZGV0ZWN0cyB0b29sLXNldCBjaGFuZ2VzIGJ5IG5hbWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYSA9IGNvZGV4TWNwU3RhdHVzVG9FbnRyeShzdGF0dXMoJ3MnLCBbdG9vbCgndDEnKV0pKTtcblx0XHRjb25zdCBzYW1lTmFtZXMgPSBjb2RleE1jcFN0YXR1c1RvRW50cnkoc3RhdHVzKCdzJywgW3Rvb2woJ3QxJyldKSk7XG5cdFx0Y29uc3QgYWRkZWQgPSBjb2RleE1jcFN0YXR1c1RvRW50cnkoc3RhdHVzKCdzJywgW3Rvb2woJ3QxJyksIHRvb2woJ3QyJyldKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRjb2RleE1jcFRvb2xzQ2hhbmdlZChhLCBzYW1lTmFtZXMpLFxuXHRcdFx0Y29kZXhNY3BUb29sc0NoYW5nZWQoYSwgYWRkZWQpLFxuXHRcdFx0Y29kZXhNY3BUb29sc0NoYW5nZWQodW5kZWZpbmVkLCBhKSxcblx0XHRdLCBbZmFsc2UsIHRydWUsIHRydWVdKTtcblx0fSk7XG5cblx0c3VpdGUoJ2NvZGV4TWNwU2VydmVyc0Zyb21Db25maWcnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdtYXBzIHN0ZGlvICsgaHR0cCBzZXJ2ZXJzLCBzdHJpbmdpZmllcyBlbnYsIGFuZCBtYXBzIGhlYWRlcnMgdG8gaHR0cF9oZWFkZXJzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2RleE1jcFNlcnZlcnNGcm9tQ29uZmlnKHtcblx0XHRcdFx0bG9jYWw6IHsgdHlwZTogJ3N0ZGlvJywgY29tbWFuZDogJ25weCcsIGFyZ3M6IFsnLXknLCAncGtnJ10sIGVudjogeyBLRVk6ICd2YWwnLCBOOiAzLCBEUk9QOiBudWxsIH0sIGN3ZDogJy93JyB9LFxuXHRcdFx0XHRyZW1vdGU6IHsgdHlwZTogJ2h0dHAnLCB1cmw6ICdodHRwczovL3gvbWNwJywgaGVhZGVyczogeyBBdXRob3JpemF0aW9uOiAndG9rZW4tdmFsdWUnIH0gfSxcblx0XHRcdH0pLCB7XG5cdFx0XHRcdGxvY2FsOiB7IGNvbW1hbmQ6ICducHgnLCBhcmdzOiBbJy15JywgJ3BrZyddLCBlbnY6IHsgS0VZOiAndmFsJywgTjogJzMnIH0sIGN3ZDogJy93JyB9LFxuXHRcdFx0XHRyZW1vdGU6IHsgdXJsOiAnaHR0cHM6Ly94L21jcCcsIGh0dHBfaGVhZGVyczogeyBBdXRob3JpemF0aW9uOiAndG9rZW4tdmFsdWUnIH0gfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb21pdHMgZW1wdHkgYXJncy9lbnYvaGVhZGVycyBhbmQgY29tbWFuZC1vbmx5IHN0ZGlvJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2RleE1jcFNlcnZlcnNGcm9tQ29uZmlnKHtcblx0XHRcdFx0YmFyZTogeyB0eXBlOiAnc3RkaW8nLCBjb21tYW5kOiAncnVuJywgYXJnczogW10sIGVudjoge30gfSxcblx0XHRcdFx0cGxhaW46IHsgdHlwZTogJ2h0dHAnLCB1cmw6ICdodHRwczovL3knIH0sXG5cdFx0XHR9KSwge1xuXHRcdFx0XHRiYXJlOiB7IGNvbW1hbmQ6ICdydW4nIH0sXG5cdFx0XHRcdHBsYWluOiB7IHVybDogJ2h0dHBzOi8veScgfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgna2VlcHMgc2VydmVyIG5hbWVzIHdpdGggZG90cy9zcGFjZXMgKHBlci10aHJlYWQgSlNPTiBrZXlzLCBub3QgYC1jYCBvdmVycmlkZSBrZXlzKScsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29kZXhNY3BTZXJ2ZXJzRnJvbUNvbmZpZyh7XG5cdFx0XHRcdCdkb3R0ZWQubmFtZSc6IHsgdHlwZTogJ3N0ZGlvJywgY29tbWFuZDogJ29rJyB9LFxuXHRcdFx0XHQnIHNwYWNlZCAnOiB7IHR5cGU6ICdodHRwJywgdXJsOiAnaHR0cHM6Ly96JyB9LFxuXHRcdFx0fSksIHtcblx0XHRcdFx0J2RvdHRlZC5uYW1lJzogeyBjb21tYW5kOiAnb2snIH0sXG5cdFx0XHRcdCcgc3BhY2VkICc6IHsgdXJsOiAnaHR0cHM6Ly96JyB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lwcyBtYWxmb3JtZWQgLyB1bnN1cHBvcnRlZCBlbnRyaWVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb2RleE1jcFNlcnZlcnNGcm9tQ29uZmlnKHtcblx0XHRcdFx0bm9Db21tYW5kOiB7IHR5cGU6ICdzdGRpbycgfSxcblx0XHRcdFx0bm9Vcmw6IHsgdHlwZTogJ2h0dHAnIH0sXG5cdFx0XHRcdHVua25vd25UeXBlOiB7IHR5cGU6ICdzc2UnLCB1cmw6ICdodHRwczovL3onIH0sXG5cdFx0XHRcdG5vdE9iamVjdDogNDIsXG5cdFx0XHRcdGdvb2Q6IHsgdHlwZTogJ3N0ZGlvJywgY29tbWFuZDogJ29rJyB9LFxuXHRcdFx0fSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiksIHtcblx0XHRcdFx0Z29vZDogeyBjb21tYW5kOiAnb2snIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nhbml0aXplcyBub24tc3RyaW5nIGFyZ3MvZW52L2hlYWRlcnMvY3dkIGZyb20gdW50cnVzdGVkIGNvbmZpZycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29kZXhNY3BTZXJ2ZXJzRnJvbUNvbmZpZyh7XG5cdFx0XHRcdGxvY2FsOiB7IHR5cGU6ICdzdGRpbycsIGNvbW1hbmQ6ICducHgnLCBhcmdzOiBbMSwgJ2EnLCBudWxsLCB0cnVlXSwgZW52OiB7IE46IDMgfSwgY3dkOiA1IH0sXG5cdFx0XHRcdHJlbW90ZTogeyB0eXBlOiAnaHR0cCcsIHVybDogJ2h0dHBzOi8veCcsIGhlYWRlcnM6IHsgQXV0aG9yaXphdGlvbjogMSwgJ1gtT2snOiAncycgfSB9LFxuXHRcdFx0fSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiksIHtcblx0XHRcdFx0bG9jYWw6IHsgY29tbWFuZDogJ25weCcsIGFyZ3M6IFsnMScsICdhJywgJ3RydWUnXSwgZW52OiB7IE46ICczJyB9IH0sXG5cdFx0XHRcdHJlbW90ZTogeyB1cmw6ICdodHRwczovL3gnLCBodHRwX2hlYWRlcnM6IHsgQXV0aG9yaXphdGlvbjogJzEnLCAnWC1Payc6ICdzJyB9IH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgZm9yIHVuZGVmaW5lZCAvIGVtcHR5IGNvbmZpZycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0XHRjb2RleE1jcFNlcnZlcnNGcm9tQ29uZmlnKHVuZGVmaW5lZCksXG5cdFx0XHRcdGNvZGV4TWNwU2VydmVyc0Zyb21Db25maWcoe30pLFxuXHRcdFx0XSwgW3t9LCB7fV0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnTUNQIGF1dGhlbnRpY2F0aW9uIGhlbHBlcnMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdub3JtYWxpemVDb2RleE1jcFJlc291cmNlVXJsIHN0cmlwcyBmcmFnbWVudCArIHRyYWlsaW5nIHNsYXNoZXM7IHVuZGVmaW5lZCBmb3Igbm9uLVVSTCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0XHRub3JtYWxpemVDb2RleE1jcFJlc291cmNlVXJsKCdodHRwczovL21jcC5lbmcubXMvJyksXG5cdFx0XHRcdG5vcm1hbGl6ZUNvZGV4TWNwUmVzb3VyY2VVcmwoJ2h0dHBzOi8vbWNwLmVuZy5tcycpLFxuXHRcdFx0XHRub3JtYWxpemVDb2RleE1jcFJlc291cmNlVXJsKCdodHRwczovL21jcC5lbmcubXMvbWNwLyNmcmFnJyksXG5cdFx0XHRcdG5vcm1hbGl6ZUNvZGV4TWNwUmVzb3VyY2VVcmwoJ25vdCBhIHVybCcpLFxuXHRcdFx0XSwgW1xuXHRcdFx0XHQnaHR0cHM6Ly9tY3AuZW5nLm1zLycsXG5cdFx0XHRcdCdodHRwczovL21jcC5lbmcubXMvJyxcblx0XHRcdFx0J2h0dHBzOi8vbWNwLmVuZy5tcy9tY3AnLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvZGV4U3RhcnR1cEVycm9yTmVlZHNBdXRoIG1hdGNoZXMgbG9naW4vYXV0aCBwaHJhc2luZywgbm90IGdlbmVyaWMgZmFpbHVyZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0Y29kZXhTdGFydHVwRXJyb3JOZWVkc0F1dGgoJ1RoZSBlbmctaHViLXRlc3QgTUNQIHNlcnZlciBpcyBub3QgbG9nZ2VkIGluLiBSdW4gYGNvZGV4IG1jcCBsb2dpbiBlbmctaHViLXRlc3RgLicpLFxuXHRcdFx0XHRjb2RleFN0YXJ0dXBFcnJvck5lZWRzQXV0aCgnVW5hdXRob3JpemVkJyksXG5cdFx0XHRcdGNvZGV4U3RhcnR1cEVycm9yTmVlZHNBdXRoKCdyZXF1ZXN0IGZhaWxlZCB3aXRoIDQwMScpLFxuXHRcdFx0XHRjb2RleFN0YXJ0dXBFcnJvck5lZWRzQXV0aCgnc3Bhd24gRU5PRU5UJyksXG5cdFx0XHRcdGNvZGV4U3RhcnR1cEVycm9yTmVlZHNBdXRoKG51bGwpLFxuXHRcdFx0XHRjb2RleFN0YXJ0dXBFcnJvck5lZWRzQXV0aCh1bmRlZmluZWQpLFxuXHRcdFx0XSwgW3RydWUsIHRydWUsIHRydWUsIGZhbHNlLCBmYWxzZSwgZmFsc2VdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luamVjdENvZGV4TWNwQXV0aFRva2VucyBhZGRzIGEgYmVhcmVyIGhlYWRlciBmb3IgaHR0cCBzZXJ2ZXJzIHdpdGggYSB0b2tlbiwgbGVhdmluZyBvdGhlcnMgaW50YWN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG9rZW5zID0gbmV3IE1hcChbWydodHRwczovL21jcC5lbmcubXMvJywgJ3Rvay0xMjMnXV0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpbmplY3RDb2RleE1jcEF1dGhUb2tlbnMoe1xuXHRcdFx0XHQnZW5nLWh1Yi10ZXN0JzogeyB1cmw6ICdodHRwczovL21jcC5lbmcubXMnIH0sXG5cdFx0XHRcdCd3aXRoLWhlYWRlcnMnOiB7IHVybDogJ2h0dHBzOi8vbWNwLmVuZy5tcy8nLCBodHRwX2hlYWRlcnM6IHsgJ1gtVGVzdCc6ICd2MScgfSB9LFxuXHRcdFx0XHQnbm8tdG9rZW4nOiB7IHVybDogJ2h0dHBzOi8vb3RoZXIuZXhhbXBsZS9tY3AnIH0sXG5cdFx0XHRcdCdzdGRpbyc6IHsgY29tbWFuZDogJ3J1bicgfSxcblx0XHRcdH0sIHRva2VucyksIHtcblx0XHRcdFx0J2VuZy1odWItdGVzdCc6IHsgdXJsOiAnaHR0cHM6Ly9tY3AuZW5nLm1zJywgaHR0cF9oZWFkZXJzOiB7IEF1dGhvcml6YXRpb246ICdCZWFyZXIgdG9rLTEyMycgfSB9LFxuXHRcdFx0XHQnd2l0aC1oZWFkZXJzJzogeyB1cmw6ICdodHRwczovL21jcC5lbmcubXMvJywgaHR0cF9oZWFkZXJzOiB7ICdYLVRlc3QnOiAndjEnLCBBdXRob3JpemF0aW9uOiAnQmVhcmVyIHRvay0xMjMnIH0gfSxcblx0XHRcdFx0J25vLXRva2VuJzogeyB1cmw6ICdodHRwczovL290aGVyLmV4YW1wbGUvbWNwJyB9LFxuXHRcdFx0XHQnc3RkaW8nOiB7IGNvbW1hbmQ6ICdydW4nIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luamVjdENvZGV4TWNwQXV0aFRva2VucyByZXR1cm5zIHRoZSBpbnB1dCB1bmNoYW5nZWQgd2hlbiB0aGVyZSBhcmUgbm8gdG9rZW5zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmVycyA9IHsgczogeyB1cmw6ICdodHRwczovL21jcC5lbmcubXMnIH0gfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbmplY3RDb2RleE1jcEF1dGhUb2tlbnMoc2VydmVycywgbmV3IE1hcCgpKSwgc2VydmVycyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmplY3RDb2RleE1jcEF1dGhUb2tlbnMgc3RyaXBzIGEgcHJlLWV4aXN0aW5nIGNhc2UtaW5zZW5zaXRpdmUgYXV0aG9yaXphdGlvbiBoZWFkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b2tlbnMgPSBuZXcgTWFwKFtbJ2h0dHBzOi8vbWNwLmVuZy5tcy8nLCAndG9rLTEyMyddXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGluamVjdENvZGV4TWNwQXV0aFRva2Vucyh7XG5cdFx0XHRcdHM6IHsgdXJsOiAnaHR0cHM6Ly9tY3AuZW5nLm1zJywgaHR0cF9oZWFkZXJzOiB7IGF1dGhvcml6YXRpb246ICdCZWFyZXIgc3RhbGUnLCAnWC1UZXN0JzogJ3YxJyB9IH0sXG5cdFx0XHR9LCB0b2tlbnMpLCB7XG5cdFx0XHRcdHM6IHsgdXJsOiAnaHR0cHM6Ly9tY3AuZW5nLm1zJywgaHR0cF9oZWFkZXJzOiB7ICdYLVRlc3QnOiAndjEnLCBBdXRob3JpemF0aW9uOiAnQmVhcmVyIHRvay0xMjMnIH0gfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCLHlCQUF5QiwyQkFBMkIsdUJBQXVCLHNCQUFzQiw0QkFBNEIscUJBQXFCLDBCQUEwQix1QkFBdUIsOEJBQThCLHFDQUFxQztBQUl4UyxNQUFNLG1CQUFtQixNQUFNO0FBRTlCLDBDQUF3QztBQUV4QyxRQUFNLE9BQU8sQ0FBQyxVQUF3QixFQUFFLE1BQU0sYUFBYSxFQUFFLE1BQU0sU0FBUyxFQUFFO0FBRTlFLFFBQU0sU0FBUyxDQUFDLE1BQWMsV0FBeUM7QUFBQSxJQUN0RTtBQUFBLElBQ0EsWUFBWTtBQUFBLElBQ1osT0FBTyxPQUFPLFlBQVksTUFBTSxJQUFJLE9BQUssQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUM7QUFBQSxJQUNyRCxXQUFXLENBQUMsRUFBRSxNQUFNLEdBQUcsSUFBSSxRQUFRLEtBQUssU0FBUyxJQUFJLEtBQUssQ0FBQztBQUFBLElBQzNELG1CQUFtQixDQUFDLEVBQUUsTUFBTSxHQUFHLElBQUksUUFBUSxhQUFh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
