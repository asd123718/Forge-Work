import assert from "assert";
import { isAllInterfacesAuthority, isLocalhostAuthority, isURLDomainTrusted, normalizeURL } from "../../common/trustedDomains.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("trustedDomains", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("isURLDomainTrusted", () => {
    test("localhost is always trusted", () => {
      assert.strictEqual(isURLDomainTrusted(URI.parse("http://localhost:3000"), []), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("http://127.0.0.1:3000"), []), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("http://subdomain.localhost"), []), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://[::1]"), []), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("http://[::1]:3000"), []), true);
    });
    test("backslashes are treated as URL path separators", () => {
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://example.com\\.localhost"), []), false);
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://example.com\\.github.com"), ["https://*.github.com"]), false);
    });
    test("wildcard (*) matches everything", () => {
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://example.com"), ["*"]), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("http://anything.org"), ["*"]), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://github.com/microsoft"), ["*"]), true);
    });
    test("exact domain match", () => {
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://example.com"), ["https://example.com"]), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://example.com/path"), ["https://example.com"]), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("http://example.com"), ["https://example.com"]), false);
    });
    test("subdomain wildcard matching", () => {
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://api.github.com"), ["https://*.github.com"]), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://github.com"), ["https://*.github.com"]), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://sub.api.github.com"), ["https://*.github.com"]), true);
    });
    test("path matching", () => {
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://example.com/api/v1"), ["https://example.com/api/*"]), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://example.com/api"), ["https://example.com/api/*"]), false);
    });
    test("scheme must match", () => {
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://example.com"), ["http://example.com"]), false);
      assert.strictEqual(isURLDomainTrusted(URI.parse("http://example.com"), ["https://example.com"]), false);
    });
    test("not trusted when no match", () => {
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://example.com"), ["https://other.com"]), false);
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://example.com"), []), false);
    });
    test("multiple trusted domains", () => {
      const trusted = ["https://github.com", "https://microsoft.com"];
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://github.com"), trusted), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://microsoft.com"), trusted), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://google.com"), trusted), false);
    });
    test("case normalization for github", () => {
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://github.com/Microsoft/VSCode"), ["https://github.com/microsoft/vscode"]), true);
      assert.strictEqual(isURLDomainTrusted(URI.parse("https://github.com/microsoft/vscode"), ["https://github.com/Microsoft/VSCode"]), true);
    });
  });
  suite("normalizeURL", () => {
    test("normalizes github.com URLs to lowercase path", () => {
      assert.strictEqual(normalizeURL("https://github.com/Microsoft/VSCode"), "https://github.com/microsoft/vscode");
      assert.strictEqual(normalizeURL("https://github.com/OWNER/REPO"), "https://github.com/owner/repo");
    });
    test("does not normalize non-github URLs", () => {
      assert.strictEqual(normalizeURL("https://example.com/Path/To/Resource"), "https://example.com/Path/To/Resource");
      assert.strictEqual(normalizeURL("https://microsoft.com/Products"), "https://microsoft.com/Products");
    });
    test("handles URI objects", () => {
      const uri = URI.parse("https://github.com/Microsoft/VSCode");
      assert.strictEqual(normalizeURL(uri), "https://github.com/microsoft/vscode");
    });
    test("handles invalid URIs gracefully", () => {
      const result = normalizeURL("not-a-valid-uri");
      assert.strictEqual(typeof result, "string");
    });
  });
  suite("isLocalhostAuthority", () => {
    test("recognizes localhost", () => {
      assert.strictEqual(isLocalhostAuthority("localhost"), true);
      assert.strictEqual(isLocalhostAuthority("localhost:3000"), true);
      assert.strictEqual(isLocalhostAuthority("localhost:8080"), true);
    });
    test("recognizes subdomains of localhost", () => {
      assert.strictEqual(isLocalhostAuthority("subdomain.localhost"), true);
      assert.strictEqual(isLocalhostAuthority("api.localhost:3000"), true);
      assert.strictEqual(isLocalhostAuthority("a.b.c.localhost"), true);
    });
    test("recognizes 127.0.0.1", () => {
      assert.strictEqual(isLocalhostAuthority("127.0.0.1"), true);
      assert.strictEqual(isLocalhostAuthority("127.0.0.1:3000"), true);
      assert.strictEqual(isLocalhostAuthority("127.0.0.1:8080"), true);
    });
    test("case insensitive for localhost", () => {
      assert.strictEqual(isLocalhostAuthority("LOCALHOST"), true);
      assert.strictEqual(isLocalhostAuthority("LocalHost:3000"), true);
      assert.strictEqual(isLocalhostAuthority("SUB.LOCALHOST"), true);
    });
    test("recognizes IPv6 localhost [::1] and [0:0:0:0:0:0:0:1]", () => {
      assert.strictEqual(isLocalhostAuthority("[::1]"), true);
      assert.strictEqual(isLocalhostAuthority("[::1]:3000"), true);
      assert.strictEqual(isLocalhostAuthority("[::1]:8080"), true);
      assert.strictEqual(isLocalhostAuthority("[0:0:0:0:0:0:0:1]"), true);
      assert.strictEqual(isLocalhostAuthority("[0:0:0:0:0:0:0:1]:3000"), true);
      assert.strictEqual(isLocalhostAuthority("[0:0:0:0:0:0:0:1]:8080"), true);
    });
    test("does not match non-localhost authorities", () => {
      assert.strictEqual(isLocalhostAuthority("example.com"), false);
      assert.strictEqual(isLocalhostAuthority("notlocalhost.com"), false);
      assert.strictEqual(isLocalhostAuthority("127.0.0.2"), false);
      assert.strictEqual(isLocalhostAuthority("192.168.1.1"), false);
      assert.strictEqual(isLocalhostAuthority("[::]"), false);
      assert.strictEqual(isLocalhostAuthority("[::2]"), false);
      assert.strictEqual(isLocalhostAuthority("[::1"), false);
    });
  });
  suite("isAllInterfacesAuthority", () => {
    test("recognizes 0.0.0.0", () => {
      assert.strictEqual(isAllInterfacesAuthority("0.0.0.0"), true);
      assert.strictEqual(isAllInterfacesAuthority("0.0.0.0:3000"), true);
      assert.strictEqual(isAllInterfacesAuthority("0.0.0.0:8080"), true);
    });
    test("recognizes IPv6 all-interfaces [::]", () => {
      assert.strictEqual(isAllInterfacesAuthority("[::]"), true);
      assert.strictEqual(isAllInterfacesAuthority("[::]:3000"), true);
      assert.strictEqual(isAllInterfacesAuthority("[::]:8080"), true);
    });
    test("recognizes full-form IPv6 all-interfaces [0:0:0:0:0:0:0:0]", () => {
      assert.strictEqual(isAllInterfacesAuthority("[0:0:0:0:0:0:0:0]"), true);
      assert.strictEqual(isAllInterfacesAuthority("[0:0:0:0:0:0:0:0]:3000"), true);
    });
    test("does not match localhost or other non-all-interfaces authorities", () => {
      assert.strictEqual(isAllInterfacesAuthority("localhost"), false);
      assert.strictEqual(isAllInterfacesAuthority("127.0.0.1"), false);
      assert.strictEqual(isAllInterfacesAuthority("[::1]"), false);
      assert.strictEqual(isAllInterfacesAuthority("example.com"), false);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcdXJsXFx0ZXN0XFxjb21tb25cXHRydXN0ZWREb21haW5zLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBpc0FsbEludGVyZmFjZXNBdXRob3JpdHksIGlzTG9jYWxob3N0QXV0aG9yaXR5LCBpc1VSTERvbWFpblRydXN0ZWQsIG5vcm1hbGl6ZVVSTCB9IGZyb20gJy4uLy4uL2NvbW1vbi90cnVzdGVkRG9tYWlucy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCd0cnVzdGVkRG9tYWlucycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnaXNVUkxEb21haW5UcnVzdGVkJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnbG9jYWxob3N0IGlzIGFsd2F5cyB0cnVzdGVkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVVJMRG9tYWluVHJ1c3RlZChVUkkucGFyc2UoJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcpLCBbXSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVVJMRG9tYWluVHJ1c3RlZChVUkkucGFyc2UoJ2h0dHA6Ly8xMjcuMC4wLjE6MzAwMCcpLCBbXSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVVJMRG9tYWluVHJ1c3RlZChVUkkucGFyc2UoJ2h0dHA6Ly9zdWJkb21haW4ubG9jYWxob3N0JyksIFtdKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVUkxEb21haW5UcnVzdGVkKFVSSS5wYXJzZSgnaHR0cHM6Ly9bOjoxXScpLCBbXSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVVJMRG9tYWluVHJ1c3RlZChVUkkucGFyc2UoJ2h0dHA6Ly9bOjoxXTozMDAwJyksIFtdKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdiYWNrc2xhc2hlcyBhcmUgdHJlYXRlZCBhcyBVUkwgcGF0aCBzZXBhcmF0b3JzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVVJMRG9tYWluVHJ1c3RlZChVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb21cXFxcLmxvY2FsaG9zdCcpLCBbXSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VSTERvbWFpblRydXN0ZWQoVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tXFxcXC5naXRodWIuY29tJyksIFsnaHR0cHM6Ly8qLmdpdGh1Yi5jb20nXSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dpbGRjYXJkICgqKSBtYXRjaGVzIGV2ZXJ5dGhpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVUkxEb21haW5UcnVzdGVkKFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbScpLCBbJyonXSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVVJMRG9tYWluVHJ1c3RlZChVUkkucGFyc2UoJ2h0dHA6Ly9hbnl0aGluZy5vcmcnKSwgWycqJ10pLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VSTERvbWFpblRydXN0ZWQoVVJJLnBhcnNlKCdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0JyksIFsnKiddKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleGFjdCBkb21haW4gbWF0Y2gnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVUkxEb21haW5UcnVzdGVkKFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbScpLCBbJ2h0dHBzOi8vZXhhbXBsZS5jb20nXSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVVJMRG9tYWluVHJ1c3RlZChVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGF0aCcpLCBbJ2h0dHBzOi8vZXhhbXBsZS5jb20nXSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVVJMRG9tYWluVHJ1c3RlZChVUkkucGFyc2UoJ2h0dHA6Ly9leGFtcGxlLmNvbScpLCBbJ2h0dHBzOi8vZXhhbXBsZS5jb20nXSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N1YmRvbWFpbiB3aWxkY2FyZCBtYXRjaGluZycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VSTERvbWFpblRydXN0ZWQoVVJJLnBhcnNlKCdodHRwczovL2FwaS5naXRodWIuY29tJyksIFsnaHR0cHM6Ly8qLmdpdGh1Yi5jb20nXSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVVJMRG9tYWluVHJ1c3RlZChVUkkucGFyc2UoJ2h0dHBzOi8vZ2l0aHViLmNvbScpLCBbJ2h0dHBzOi8vKi5naXRodWIuY29tJ10pLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VSTERvbWFpblRydXN0ZWQoVVJJLnBhcnNlKCdodHRwczovL3N1Yi5hcGkuZ2l0aHViLmNvbScpLCBbJ2h0dHBzOi8vKi5naXRodWIuY29tJ10pLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhdGggbWF0Y2hpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVUkxEb21haW5UcnVzdGVkKFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvdjEnKSwgWydodHRwczovL2V4YW1wbGUuY29tL2FwaS8qJ10pLCB0cnVlKTtcblx0XHRcdC8vIFBhdGggd2l0aG91dCB0cmFpbGluZyBjb250ZW50IGRvZXNuJ3QgbWF0Y2ggYSB3aWxkY2FyZCBwYXR0ZXJuIHJlcXVpcmluZyBtb3JlIHBhdGggc2VnbWVudHNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VSTERvbWFpblRydXN0ZWQoVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL2FwaScpLCBbJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpLyonXSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NjaGVtZSBtdXN0IG1hdGNoJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVVJMRG9tYWluVHJ1c3RlZChVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20nKSwgWydodHRwOi8vZXhhbXBsZS5jb20nXSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VSTERvbWFpblRydXN0ZWQoVVJJLnBhcnNlKCdodHRwOi8vZXhhbXBsZS5jb20nKSwgWydodHRwczovL2V4YW1wbGUuY29tJ10pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdub3QgdHJ1c3RlZCB3aGVuIG5vIG1hdGNoJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVVJMRG9tYWluVHJ1c3RlZChVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20nKSwgWydodHRwczovL290aGVyLmNvbSddKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVVJMRG9tYWluVHJ1c3RlZChVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20nKSwgW10pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aXBsZSB0cnVzdGVkIGRvbWFpbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0cnVzdGVkID0gWydodHRwczovL2dpdGh1Yi5jb20nLCAnaHR0cHM6Ly9taWNyb3NvZnQuY29tJ107XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVUkxEb21haW5UcnVzdGVkKFVSSS5wYXJzZSgnaHR0cHM6Ly9naXRodWIuY29tJyksIHRydXN0ZWQpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VSTERvbWFpblRydXN0ZWQoVVJJLnBhcnNlKCdodHRwczovL21pY3Jvc29mdC5jb20nKSwgdHJ1c3RlZCksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVVJMRG9tYWluVHJ1c3RlZChVUkkucGFyc2UoJ2h0dHBzOi8vZ29vZ2xlLmNvbScpLCB0cnVzdGVkKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2FzZSBub3JtYWxpemF0aW9uIGZvciBnaXRodWInLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVUkxEb21haW5UcnVzdGVkKFVSSS5wYXJzZSgnaHR0cHM6Ly9naXRodWIuY29tL01pY3Jvc29mdC9WU0NvZGUnKSwgWydodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZSddKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVUkxEb21haW5UcnVzdGVkKFVSSS5wYXJzZSgnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUnKSwgWydodHRwczovL2dpdGh1Yi5jb20vTWljcm9zb2Z0L1ZTQ29kZSddKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdub3JtYWxpemVVUkwnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdub3JtYWxpemVzIGdpdGh1Yi5jb20gVVJMcyB0byBsb3dlcmNhc2UgcGF0aCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3JtYWxpemVVUkwoJ2h0dHBzOi8vZ2l0aHViLmNvbS9NaWNyb3NvZnQvVlNDb2RlJyksICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vcm1hbGl6ZVVSTCgnaHR0cHM6Ly9naXRodWIuY29tL09XTkVSL1JFUE8nKSwgJ2h0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBub3JtYWxpemUgbm9uLWdpdGh1YiBVUkxzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vcm1hbGl6ZVVSTCgnaHR0cHM6Ly9leGFtcGxlLmNvbS9QYXRoL1RvL1Jlc291cmNlJyksICdodHRwczovL2V4YW1wbGUuY29tL1BhdGgvVG8vUmVzb3VyY2UnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3JtYWxpemVVUkwoJ2h0dHBzOi8vbWljcm9zb2Z0LmNvbS9Qcm9kdWN0cycpLCAnaHR0cHM6Ly9taWNyb3NvZnQuY29tL1Byb2R1Y3RzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIFVSSSBvYmplY3RzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCdodHRwczovL2dpdGh1Yi5jb20vTWljcm9zb2Z0L1ZTQ29kZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vcm1hbGl6ZVVSTCh1cmkpLCAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgaW52YWxpZCBVUklzIGdyYWNlZnVsbHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBub3JtYWxpemVVUkwoJ25vdC1hLXZhbGlkLXVyaScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiByZXN1bHQsICdzdHJpbmcnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2lzTG9jYWxob3N0QXV0aG9yaXR5JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmVjb2duaXplcyBsb2NhbGhvc3QnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNMb2NhbGhvc3RBdXRob3JpdHkoJ2xvY2FsaG9zdCcpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0xvY2FsaG9zdEF1dGhvcml0eSgnbG9jYWxob3N0OjMwMDAnKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNMb2NhbGhvc3RBdXRob3JpdHkoJ2xvY2FsaG9zdDo4MDgwJyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVjb2duaXplcyBzdWJkb21haW5zIG9mIGxvY2FsaG9zdCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0xvY2FsaG9zdEF1dGhvcml0eSgnc3ViZG9tYWluLmxvY2FsaG9zdCcpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0xvY2FsaG9zdEF1dGhvcml0eSgnYXBpLmxvY2FsaG9zdDozMDAwJyksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTG9jYWxob3N0QXV0aG9yaXR5KCdhLmIuYy5sb2NhbGhvc3QnKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWNvZ25pemVzIDEyNy4wLjAuMScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0xvY2FsaG9zdEF1dGhvcml0eSgnMTI3LjAuMC4xJyksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTG9jYWxob3N0QXV0aG9yaXR5KCcxMjcuMC4wLjE6MzAwMCcpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0xvY2FsaG9zdEF1dGhvcml0eSgnMTI3LjAuMC4xOjgwODAnKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYXNlIGluc2Vuc2l0aXZlIGZvciBsb2NhbGhvc3QnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNMb2NhbGhvc3RBdXRob3JpdHkoJ0xPQ0FMSE9TVCcpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0xvY2FsaG9zdEF1dGhvcml0eSgnTG9jYWxIb3N0OjMwMDAnKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNMb2NhbGhvc3RBdXRob3JpdHkoJ1NVQi5MT0NBTEhPU1QnKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWNvZ25pemVzIElQdjYgbG9jYWxob3N0IFs6OjFdIGFuZCBbMDowOjA6MDowOjA6MDoxXScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0xvY2FsaG9zdEF1dGhvcml0eSgnWzo6MV0nKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNMb2NhbGhvc3RBdXRob3JpdHkoJ1s6OjFdOjMwMDAnKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNMb2NhbGhvc3RBdXRob3JpdHkoJ1s6OjFdOjgwODAnKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNMb2NhbGhvc3RBdXRob3JpdHkoJ1swOjA6MDowOjA6MDowOjFdJyksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTG9jYWxob3N0QXV0aG9yaXR5KCdbMDowOjA6MDowOjA6MDoxXTozMDAwJyksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTG9jYWxob3N0QXV0aG9yaXR5KCdbMDowOjA6MDowOjA6MDoxXTo4MDgwJyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgbWF0Y2ggbm9uLWxvY2FsaG9zdCBhdXRob3JpdGllcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0xvY2FsaG9zdEF1dGhvcml0eSgnZXhhbXBsZS5jb20nKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTG9jYWxob3N0QXV0aG9yaXR5KCdub3Rsb2NhbGhvc3QuY29tJyksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0xvY2FsaG9zdEF1dGhvcml0eSgnMTI3LjAuMC4yJyksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0xvY2FsaG9zdEF1dGhvcml0eSgnMTkyLjE2OC4xLjEnKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTG9jYWxob3N0QXV0aG9yaXR5KCdbOjpdJyksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0xvY2FsaG9zdEF1dGhvcml0eSgnWzo6Ml0nKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzTG9jYWxob3N0QXV0aG9yaXR5KCdbOjoxJyksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2lzQWxsSW50ZXJmYWNlc0F1dGhvcml0eScsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JlY29nbml6ZXMgMC4wLjAuMCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0FsbEludGVyZmFjZXNBdXRob3JpdHkoJzAuMC4wLjAnKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBbGxJbnRlcmZhY2VzQXV0aG9yaXR5KCcwLjAuMC4wOjMwMDAnKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBbGxJbnRlcmZhY2VzQXV0aG9yaXR5KCcwLjAuMC4wOjgwODAnKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWNvZ25pemVzIElQdjYgYWxsLWludGVyZmFjZXMgWzo6XScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0FsbEludGVyZmFjZXNBdXRob3JpdHkoJ1s6Ol0nKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBbGxJbnRlcmZhY2VzQXV0aG9yaXR5KCdbOjpdOjMwMDAnKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBbGxJbnRlcmZhY2VzQXV0aG9yaXR5KCdbOjpdOjgwODAnKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWNvZ25pemVzIGZ1bGwtZm9ybSBJUHY2IGFsbC1pbnRlcmZhY2VzIFswOjA6MDowOjA6MDowOjBdJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQWxsSW50ZXJmYWNlc0F1dGhvcml0eSgnWzA6MDowOjA6MDowOjA6MF0nKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBbGxJbnRlcmZhY2VzQXV0aG9yaXR5KCdbMDowOjA6MDowOjA6MDowXTozMDAwJyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgbWF0Y2ggbG9jYWxob3N0IG9yIG90aGVyIG5vbi1hbGwtaW50ZXJmYWNlcyBhdXRob3JpdGllcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0FsbEludGVyZmFjZXNBdXRob3JpdHkoJ2xvY2FsaG9zdCcpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNBbGxJbnRlcmZhY2VzQXV0aG9yaXR5KCcxMjcuMC4wLjEnKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQWxsSW50ZXJmYWNlc0F1dGhvcml0eSgnWzo6MV0nKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzQWxsSW50ZXJmYWNlc0F1dGhvcml0eSgnZXhhbXBsZS5jb20nKSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsMEJBQTBCLHNCQUFzQixvQkFBb0Isb0JBQW9CO0FBQ2pHLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUV4RCxNQUFNLGtCQUFrQixNQUFNO0FBRTdCLDBDQUF3QztBQUV4QyxRQUFNLHNCQUFzQixNQUFNO0FBRWpDLFNBQUssK0JBQStCLE1BQU07QUFDekMsYUFBTyxZQUFZLG1CQUFtQixJQUFJLE1BQU0sdUJBQXVCLEdBQUcsQ0FBQyxDQUFDLEdBQUcsSUFBSTtBQUNuRixhQUFPLFlBQVksbUJBQW1CLElBQUksTUFBTSx1QkFBdUIsR0FBRyxDQUFDLENBQUMsR0FBRyxJQUFJO0FBQ25GLGFBQU8sWUFBWSxtQkFBbUIsSUFBSSxNQUFNLDRCQUE0QixHQUFHLENBQUMsQ0FBQyxHQUFHLElBQUk7QUFDeEYsYUFBTyxZQUFZLG1CQUFtQixJQUFJLE1BQU0sZUFBZSxHQUFHLENBQUMsQ0FBQyxHQUFHLElBQUk7QUFDM0UsYUFBTyxZQUFZLG1CQUFtQixJQUFJLE1BQU0sbUJBQW1CLEdBQUcsQ0FBQyxDQUFDLEdBQUcsSUFBSTtBQUFBLElBQ2hGLENBQUM7QUFFRCxTQUFLLGtEQUFrRCxNQUFNO0FBQzVELGFBQU8sWUFBWSxtQkFBbUIsSUFBSSxNQUFNLGlDQUFpQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEtBQUs7QUFDOUYsYUFBTyxZQUFZLG1CQUFtQixJQUFJLE1BQU0sa0NBQWtDLEdBQUcsQ0FBQyxzQkFBc0IsQ0FBQyxHQUFHLEtBQUs7QUFBQSxJQUN0SCxDQUFDO0FBRUQsU0FBSyxtQ0FBbUMsTUFBTTtBQUM3QyxhQUFPLFlBQVksbUJBQW1C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
