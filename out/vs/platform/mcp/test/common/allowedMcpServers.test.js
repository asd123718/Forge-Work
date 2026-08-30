import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { checkMcpServerAllowed, getMcpServerMatchers, isMcpServerMatched, McpServerAllowResult } from "../../common/allowedMcpServers.js";
suite("AllowedMcpServers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("getMcpServerMatchers", () => {
    test("coerces non-arrays to undefined", () => {
      assert.strictEqual(getMcpServerMatchers(null), void 0);
      assert.strictEqual(getMcpServerMatchers(void 0), void 0);
      assert.strictEqual(getMcpServerMatchers(true), void 0);
      assert.strictEqual(getMcpServerMatchers("[]"), void 0);
      assert.strictEqual(getMcpServerMatchers({ allowed: [] }), void 0);
    });
    test("empty array is preserved", () => {
      assert.deepStrictEqual(getMcpServerMatchers([]), []);
    });
    test("drops malformed and multi-field matcher entries", () => {
      const value = [
        { serverName: "github" },
        { serverUrl: "https://mcp.example.com/*" },
        { serverCommand: ["npx", "-y", "server"] },
        { serverName: "" },
        // empty string dropped
        { serverCommand: [] },
        // empty array dropped
        { serverCommand: ["ok", 5] },
        // non-string element dropped
        { serverName: "a", serverUrl: "b" },
        // more than one field dropped
        {},
        // no field dropped
        "string-entry"
        // non-object dropped
      ];
      assert.deepStrictEqual(getMcpServerMatchers(value), [
        { serverName: "github" },
        { serverUrl: "https://mcp.example.com/*" },
        { serverCommand: ["npx", "-y", "server"] }
      ]);
    });
  });
  suite("isMcpServerMatched", () => {
    test("undefined and empty match nothing", () => {
      assert.strictEqual(isMcpServerMatched(void 0, { name: "x" }), false);
      assert.strictEqual(isMcpServerMatched([], { name: "x" }), false);
    });
    test("matches by server name", () => {
      const matchers = [{ serverName: "github" }];
      assert.strictEqual(isMcpServerMatched(matchers, { name: "github" }), true);
      assert.strictEqual(isMcpServerMatched(matchers, { name: "gitlab" }), false);
    });
    test("matches by remote URL with wildcards, case-insensitively", () => {
      const matchers = [{ serverUrl: "https://*.example.com/*" }];
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", url: "https://mcp.example.com/api" }), true);
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", url: "https://MCP.EXAMPLE.COM/api" }), true);
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", url: "https://example.com/api" }), false);
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", url: "https://mcp.evil.com/api" }), false);
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", url: "https://evil.test/.example.com/tool" }), false);
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", command: ["node", "x.js"] }), false);
    });
    test("exact URL pattern matches only that URL", () => {
      const matchers = [{ serverUrl: "https://mcp.example.com/mcp" }];
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", url: "https://mcp.example.com/mcp" }), true);
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", url: "https://mcp.example.com/mcp/extra" }), false);
    });
    test("matches by local command as an ordered argument list", () => {
      const matchers = [{ serverCommand: ["npx", "-y", "server"] }];
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", command: ["npx", "-y", "server"] }), true);
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", command: ["npx", "server"] }), false);
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", command: ["npx", "-y", "server", "--flag"] }), false);
      assert.strictEqual(isMcpServerMatched(matchers, { name: "s", url: "https://mcp.example.com" }), false);
    });
  });
  suite("checkMcpServerAllowed", () => {
    test("no lists configured allows everything", () => {
      assert.strictEqual(checkMcpServerAllowed(void 0, void 0, { name: "x" }), McpServerAllowResult.Allowed);
    });
    test("empty allowlist blocks everything as NotAllowed", () => {
      assert.strictEqual(checkMcpServerAllowed([], void 0, { name: "x" }), McpServerAllowResult.NotAllowed);
    });
    test("allowlist permits only matching servers", () => {
      const allow = [{ serverName: "github" }];
      assert.strictEqual(checkMcpServerAllowed(allow, void 0, { name: "github" }), McpServerAllowResult.Allowed);
      assert.strictEqual(checkMcpServerAllowed(allow, void 0, { name: "other" }), McpServerAllowResult.NotAllowed);
    });
    test("deny takes precedence over allow", () => {
      const allow = [{ serverName: "github" }];
      const deny = [{ serverName: "github" }];
      assert.strictEqual(checkMcpServerAllowed(allow, deny, { name: "github" }), McpServerAllowResult.Denied);
    });
    test("deny blocks even when no allowlist is configured", () => {
      const deny = [{ serverUrl: "https://*.untrusted.example.com/*" }];
      assert.strictEqual(checkMcpServerAllowed(void 0, deny, { name: "s", url: "https://api.untrusted.example.com/mcp" }), McpServerAllowResult.Denied);
      assert.strictEqual(checkMcpServerAllowed(void 0, deny, { name: "s", url: "https://api.trusted.example.com/mcp" }), McpServerAllowResult.Allowed);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcbWNwXFx0ZXN0XFxjb21tb25cXGFsbG93ZWRNY3BTZXJ2ZXJzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGNoZWNrTWNwU2VydmVyQWxsb3dlZCwgZ2V0TWNwU2VydmVyTWF0Y2hlcnMsIElNY3BTZXJ2ZXJNYXRjaGVyLCBpc01jcFNlcnZlck1hdGNoZWQsIE1jcFNlcnZlckFsbG93UmVzdWx0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2FsbG93ZWRNY3BTZXJ2ZXJzLmpzJztcblxuc3VpdGUoJ0FsbG93ZWRNY3BTZXJ2ZXJzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdnZXRNY3BTZXJ2ZXJNYXRjaGVycycsICgpID0+IHtcblxuXHRcdHRlc3QoJ2NvZXJjZXMgbm9uLWFycmF5cyB0byB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TWNwU2VydmVyTWF0Y2hlcnMobnVsbCksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0TWNwU2VydmVyTWF0Y2hlcnModW5kZWZpbmVkKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRNY3BTZXJ2ZXJNYXRjaGVycyh0cnVlKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRNY3BTZXJ2ZXJNYXRjaGVycygnW10nKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRNY3BTZXJ2ZXJNYXRjaGVycyh7IGFsbG93ZWQ6IFtdIH0pLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW1wdHkgYXJyYXkgaXMgcHJlc2VydmVkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRNY3BTZXJ2ZXJNYXRjaGVycyhbXSksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Ryb3BzIG1hbGZvcm1lZCBhbmQgbXVsdGktZmllbGQgbWF0Y2hlciBlbnRyaWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdmFsdWUgPSBbXG5cdFx0XHRcdHsgc2VydmVyTmFtZTogJ2dpdGh1YicgfSxcblx0XHRcdFx0eyBzZXJ2ZXJVcmw6ICdodHRwczovL21jcC5leGFtcGxlLmNvbS8qJyB9LFxuXHRcdFx0XHR7IHNlcnZlckNvbW1hbmQ6IFsnbnB4JywgJy15JywgJ3NlcnZlciddIH0sXG5cdFx0XHRcdHsgc2VydmVyTmFtZTogJycgfSwgLy8gZW1wdHkgc3RyaW5nIGRyb3BwZWRcblx0XHRcdFx0eyBzZXJ2ZXJDb21tYW5kOiBbXSB9LCAvLyBlbXB0eSBhcnJheSBkcm9wcGVkXG5cdFx0XHRcdHsgc2VydmVyQ29tbWFuZDogWydvaycsIDVdIH0sIC8vIG5vbi1zdHJpbmcgZWxlbWVudCBkcm9wcGVkXG5cdFx0XHRcdHsgc2VydmVyTmFtZTogJ2EnLCBzZXJ2ZXJVcmw6ICdiJyB9LCAvLyBtb3JlIHRoYW4gb25lIGZpZWxkIGRyb3BwZWRcblx0XHRcdFx0e30sIC8vIG5vIGZpZWxkIGRyb3BwZWRcblx0XHRcdFx0J3N0cmluZy1lbnRyeScsIC8vIG5vbi1vYmplY3QgZHJvcHBlZFxuXHRcdFx0XTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0TWNwU2VydmVyTWF0Y2hlcnModmFsdWUpLCBbXG5cdFx0XHRcdHsgc2VydmVyTmFtZTogJ2dpdGh1YicgfSxcblx0XHRcdFx0eyBzZXJ2ZXJVcmw6ICdodHRwczovL21jcC5leGFtcGxlLmNvbS8qJyB9LFxuXHRcdFx0XHR7IHNlcnZlckNvbW1hbmQ6IFsnbnB4JywgJy15JywgJ3NlcnZlciddIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2lzTWNwU2VydmVyTWF0Y2hlZCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ3VuZGVmaW5lZCBhbmQgZW1wdHkgbWF0Y2ggbm90aGluZycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01jcFNlcnZlck1hdGNoZWQodW5kZWZpbmVkLCB7IG5hbWU6ICd4JyB9KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTWNwU2VydmVyTWF0Y2hlZChbXSwgeyBuYW1lOiAneCcgfSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGNoZXMgYnkgc2VydmVyIG5hbWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYXRjaGVyczogSU1jcFNlcnZlck1hdGNoZXJbXSA9IFt7IHNlcnZlck5hbWU6ICdnaXRodWInIH1dO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTWNwU2VydmVyTWF0Y2hlZChtYXRjaGVycywgeyBuYW1lOiAnZ2l0aHViJyB9KSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNY3BTZXJ2ZXJNYXRjaGVkKG1hdGNoZXJzLCB7IG5hbWU6ICdnaXRsYWInIH0pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXRjaGVzIGJ5IHJlbW90ZSBVUkwgd2l0aCB3aWxkY2FyZHMsIGNhc2UtaW5zZW5zaXRpdmVseScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hdGNoZXJzOiBJTWNwU2VydmVyTWF0Y2hlcltdID0gW3sgc2VydmVyVXJsOiAnaHR0cHM6Ly8qLmV4YW1wbGUuY29tLyonIH1dO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTWNwU2VydmVyTWF0Y2hlZChtYXRjaGVycywgeyBuYW1lOiAncycsIHVybDogJ2h0dHBzOi8vbWNwLmV4YW1wbGUuY29tL2FwaScgfSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTWNwU2VydmVyTWF0Y2hlZChtYXRjaGVycywgeyBuYW1lOiAncycsIHVybDogJ2h0dHBzOi8vTUNQLkVYQU1QTEUuQ09NL2FwaScgfSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTWNwU2VydmVyTWF0Y2hlZChtYXRjaGVycywgeyBuYW1lOiAncycsIHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpJyB9KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTWNwU2VydmVyTWF0Y2hlZChtYXRjaGVycywgeyBuYW1lOiAncycsIHVybDogJ2h0dHBzOi8vbWNwLmV2aWwuY29tL2FwaScgfSksIGZhbHNlKTtcblx0XHRcdC8vIEFuIGF1dGhvcml0eSB3aWxkY2FyZCBtdXN0IG5vdCBzd2FsbG93IHRoZSBwYXRoIHNlcGFyYXRvciBhbmQgbGV0IGFuIHVudHJ1c3RlZCBob3N0IHRocm91Z2guXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNY3BTZXJ2ZXJNYXRjaGVkKG1hdGNoZXJzLCB7IG5hbWU6ICdzJywgdXJsOiAnaHR0cHM6Ly9ldmlsLnRlc3QvLmV4YW1wbGUuY29tL3Rvb2wnIH0pLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNNY3BTZXJ2ZXJNYXRjaGVkKG1hdGNoZXJzLCB7IG5hbWU6ICdzJywgY29tbWFuZDogWydub2RlJywgJ3guanMnXSB9KSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhhY3QgVVJMIHBhdHRlcm4gbWF0Y2hlcyBvbmx5IHRoYXQgVVJMJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWF0Y2hlcnM6IElNY3BTZXJ2ZXJNYXRjaGVyW10gPSBbeyBzZXJ2ZXJVcmw6ICdodHRwczovL21jcC5leGFtcGxlLmNvbS9tY3AnIH1dO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTWNwU2VydmVyTWF0Y2hlZChtYXRjaGVycywgeyBuYW1lOiAncycsIHVybDogJ2h0dHBzOi8vbWNwLmV4YW1wbGUuY29tL21jcCcgfSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTWNwU2VydmVyTWF0Y2hlZChtYXRjaGVycywgeyBuYW1lOiAncycsIHVybDogJ2h0dHBzOi8vbWNwLmV4YW1wbGUuY29tL21jcC9leHRyYScgfSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGNoZXMgYnkgbG9jYWwgY29tbWFuZCBhcyBhbiBvcmRlcmVkIGFyZ3VtZW50IGxpc3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYXRjaGVyczogSU1jcFNlcnZlck1hdGNoZXJbXSA9IFt7IHNlcnZlckNvbW1hbmQ6IFsnbnB4JywgJy15JywgJ3NlcnZlciddIH1dO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTWNwU2VydmVyTWF0Y2hlZChtYXRjaGVycywgeyBuYW1lOiAncycsIGNvbW1hbmQ6IFsnbnB4JywgJy15JywgJ3NlcnZlciddIH0pLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc01jcFNlcnZlck1hdGNoZWQobWF0Y2hlcnMsIHsgbmFtZTogJ3MnLCBjb21tYW5kOiBbJ25weCcsICdzZXJ2ZXInXSB9KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTWNwU2VydmVyTWF0Y2hlZChtYXRjaGVycywgeyBuYW1lOiAncycsIGNvbW1hbmQ6IFsnbnB4JywgJy15JywgJ3NlcnZlcicsICctLWZsYWcnXSB9KSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTWNwU2VydmVyTWF0Y2hlZChtYXRjaGVycywgeyBuYW1lOiAncycsIHVybDogJ2h0dHBzOi8vbWNwLmV4YW1wbGUuY29tJyB9KSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY2hlY2tNY3BTZXJ2ZXJBbGxvd2VkJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnbm8gbGlzdHMgY29uZmlndXJlZCBhbGxvd3MgZXZlcnl0aGluZycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGVja01jcFNlcnZlckFsbG93ZWQodW5kZWZpbmVkLCB1bmRlZmluZWQsIHsgbmFtZTogJ3gnIH0pLCBNY3BTZXJ2ZXJBbGxvd1Jlc3VsdC5BbGxvd2VkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VtcHR5IGFsbG93bGlzdCBibG9ja3MgZXZlcnl0aGluZyBhcyBOb3RBbGxvd2VkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoZWNrTWNwU2VydmVyQWxsb3dlZChbXSwgdW5kZWZpbmVkLCB7IG5hbWU6ICd4JyB9KSwgTWNwU2VydmVyQWxsb3dSZXN1bHQuTm90QWxsb3dlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhbGxvd2xpc3QgcGVybWl0cyBvbmx5IG1hdGNoaW5nIHNlcnZlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBhbGxvdzogSU1jcFNlcnZlck1hdGNoZXJbXSA9IFt7IHNlcnZlck5hbWU6ICdnaXRodWInIH1dO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoZWNrTWNwU2VydmVyQWxsb3dlZChhbGxvdywgdW5kZWZpbmVkLCB7IG5hbWU6ICdnaXRodWInIH0pLCBNY3BTZXJ2ZXJBbGxvd1Jlc3VsdC5BbGxvd2VkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGVja01jcFNlcnZlckFsbG93ZWQoYWxsb3csIHVuZGVmaW5lZCwgeyBuYW1lOiAnb3RoZXInIH0pLCBNY3BTZXJ2ZXJBbGxvd1Jlc3VsdC5Ob3RBbGxvd2VkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlbnkgdGFrZXMgcHJlY2VkZW5jZSBvdmVyIGFsbG93JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWxsb3c6IElNY3BTZXJ2ZXJNYXRjaGVyW10gPSBbeyBzZXJ2ZXJOYW1lOiAnZ2l0aHViJyB9XTtcblx0XHRcdGNvbnN0IGRlbnk6IElNY3BTZXJ2ZXJNYXRjaGVyW10gPSBbeyBzZXJ2ZXJOYW1lOiAnZ2l0aHViJyB9XTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGVja01jcFNlcnZlckFsbG93ZWQoYWxsb3csIGRlbnksIHsgbmFtZTogJ2dpdGh1YicgfSksIE1jcFNlcnZlckFsbG93UmVzdWx0LkRlbmllZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZW55IGJsb2NrcyBldmVuIHdoZW4gbm8gYWxsb3dsaXN0IGlzIGNvbmZpZ3VyZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZW55OiBJTWNwU2VydmVyTWF0Y2hlcltdID0gW3sgc2VydmVyVXJsOiAnaHR0cHM6Ly8qLnVudHJ1c3RlZC5leGFtcGxlLmNvbS8qJyB9XTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGVja01jcFNlcnZlckFsbG93ZWQodW5kZWZpbmVkLCBkZW55LCB7IG5hbWU6ICdzJywgdXJsOiAnaHR0cHM6Ly9hcGkudW50cnVzdGVkLmV4YW1wbGUuY29tL21jcCcgfSksIE1jcFNlcnZlckFsbG93UmVzdWx0LkRlbmllZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hlY2tNY3BTZXJ2ZXJBbGxvd2VkKHVuZGVmaW5lZCwgZGVueSwgeyBuYW1lOiAncycsIHVybDogJ2h0dHBzOi8vYXBpLnRydXN0ZWQuZXhhbXBsZS5jb20vbWNwJyB9KSwgTWNwU2VydmVyQWxsb3dSZXN1bHQuQWxsb3dlZCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx1QkFBdUIsc0JBQXlDLG9CQUFvQiw0QkFBNEI7QUFFekgsTUFBTSxxQkFBcUIsTUFBTTtBQUVoQywwQ0FBd0M7QUFFeEMsUUFBTSx3QkFBd0IsTUFBTTtBQUVuQyxTQUFLLG1DQUFtQyxNQUFNO0FBQzdDLGFBQU8sWUFBWSxxQkFBcUIsSUFBSSxHQUFHLE1BQVM7QUFDeEQsYUFBTyxZQUFZLHFCQUFxQixNQUFTLEdBQUcsTUFBUztBQUM3RCxhQUFPLFlBQVkscUJBQXFCLElBQUksR0FBRyxNQUFTO0FBQ3hELGFBQU8sWUFBWSxxQkFBcUIsSUFBSSxHQUFHLE1BQVM7QUFDeEQsYUFBTyxZQUFZLHFCQUFxQixFQUFFLFNBQVMsQ0FBQyxFQUFFLENBQUMsR0FBRyxNQUFTO0FBQUEsSUFDcEUsQ0FBQztBQUVELFNBQUssNEJBQTRCLE1BQU07QUFDdEMsYUFBTyxnQkFBZ0IscUJBQXFCLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLElBQ3BELENBQUM7QUFFRCxTQUFLLG1EQUFtRCxNQUFNO0FBQzdELFlBQU0sUUFBUTtBQUFBLFFBQ2IsRUFBRSxZQUFZLFNBQVM7QUFBQSxRQUN2QixFQUFFLFdBQVcsNEJBQTRCO0FBQUEsUUFDekMsRUFBRSxlQUFlLENBQUMsT0FBTyxNQUFNLFFBQVEsRUFBRTtBQUFBLFFBQ3pDLEVBQUUsWUFBWSxHQUFHO0FBQUE7QUFBQSxRQUNqQixFQUFFLGVBQWUsQ0FBQyxFQUFFO0FBQUE7QUFBQSxRQUNwQixFQUFFLGVBQWUsQ0FBQyxNQUFNLENBQUMsRUFBRTtBQUFBO0FBQUEsUUFDM0IsRUFBRSxZQUFZ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
