import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { normalizeDomain, extractDomainPattern, matchesDomainPattern, extractDomainFromUri, isDomainAllowed } from "../../common/domainMatcher.js";
suite("domainMatcher", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("normalizeDomain", () => {
    test("returns undefined for empty/falsy input", () => {
      assert.deepStrictEqual(
        [normalizeDomain(void 0), normalizeDomain(""), normalizeDomain("  ")],
        [void 0, void 0, void 0]
      );
    });
    test("lowercases and trims", () => {
      assert.strictEqual(normalizeDomain("  Example.COM  "), "example.com");
    });
    test("strips user info", () => {
      assert.strictEqual(normalizeDomain("user@example.com"), "example.com");
    });
    test("strips port", () => {
      assert.strictEqual(normalizeDomain("example.com:8080"), "example.com");
    });
    test("strips trailing dots", () => {
      assert.strictEqual(normalizeDomain("example.com.."), "example.com");
    });
    test("rejects paths", () => {
      assert.strictEqual(normalizeDomain("example.com/path"), void 0);
    });
    test("rejects . and ..", () => {
      assert.deepStrictEqual(
        [normalizeDomain("."), normalizeDomain("..")],
        [void 0, void 0]
      );
    });
    test("accepts bare wildcard", () => {
      assert.strictEqual(normalizeDomain("*"), "*");
    });
    test("accepts wildcard prefix", () => {
      assert.strictEqual(normalizeDomain("*.example.com"), "*.example.com");
    });
    test("strips trailing punctuation", () => {
      assert.strictEqual(normalizeDomain("example.com,"), "example.com");
      assert.strictEqual(normalizeDomain("example.com;"), "example.com");
      assert.strictEqual(normalizeDomain("example.com)"), "example.com");
    });
    test("rejects file-extension-like TLDs when not from URL", () => {
      assert.strictEqual(normalizeDomain("foo.js"), void 0);
      assert.strictEqual(normalizeDomain("foo.json"), void 0);
      assert.strictEqual(normalizeDomain("foo.ts"), void 0);
    });
    test("allows file-extension-like TLDs when fromUrl is true", () => {
      assert.strictEqual(normalizeDomain("foo.js", true), "foo.js");
    });
    test("rejects invalid characters", () => {
      assert.strictEqual(normalizeDomain("exam ple.com"), void 0);
      assert.strictEqual(normalizeDomain("example!.com"), void 0);
    });
    test("handles complex valid domains", () => {
      assert.strictEqual(normalizeDomain("sub.domain.example.com"), "sub.domain.example.com");
    });
  });
  suite("extractDomainPattern", () => {
    test("returns trimmed input when no scheme", () => {
      assert.strictEqual(extractDomainPattern("  example.com  "), "example.com");
    });
    test("returns bare wildcard as-is", () => {
      assert.strictEqual(extractDomainPattern("*"), "*");
    });
    test("extracts authority from URL", () => {
      assert.strictEqual(extractDomainPattern("https://example.com/path"), "example.com");
    });
    test("extracts authority with port from URL", () => {
      assert.strictEqual(extractDomainPattern("http://example.com:8080/path"), "example.com:8080");
    });
  });
  suite("matchesDomainPattern", () => {
    test("exact match", () => {
      assert.strictEqual(matchesDomainPattern("example.com", "example.com"), true);
      assert.strictEqual(matchesDomainPattern("example.com", "other.com"), false);
    });
    test("case insensitive", () => {
      assert.strictEqual(matchesDomainPattern("example.com", "Example.COM"), true);
    });
    test("bare wildcard matches anything", () => {
      assert.strictEqual(matchesDomainPattern("example.com", "*"), true);
      assert.strictEqual(matchesDomainPattern("anything.test", "*"), true);
    });
    test("wildcard prefix matches subdomains", () => {
      assert.strictEqual(matchesDomainPattern("sub.example.com", "*.example.com"), true);
      assert.strictEqual(matchesDomainPattern("deep.sub.example.com", "*.example.com"), true);
      assert.strictEqual(matchesDomainPattern("example.com", "*.example.com"), true);
    });
    test("wildcard prefix does not match unrelated domains", () => {
      assert.strictEqual(matchesDomainPattern("notexample.com", "*.example.com"), false);
    });
    test("matches domain from URL pattern", () => {
      assert.strictEqual(matchesDomainPattern("example.com", "https://example.com/page"), true);
    });
    test("returns false for invalid pattern", () => {
      assert.strictEqual(matchesDomainPattern("example.com", ""), false);
    });
  });
  suite("extractDomainFromUri", () => {
    test("extracts domain from https URI", () => {
      assert.strictEqual(extractDomainFromUri(URI.parse("https://example.com/path")), "example.com");
    });
    test("strips port", () => {
      assert.strictEqual(extractDomainFromUri(URI.parse("https://example.com:443/path")), "example.com");
    });
    test("returns undefined for empty authority", () => {
      assert.strictEqual(extractDomainFromUri(URI.from({ scheme: "file", path: "/tmp/test" })), void 0);
    });
    test("extracts and canonicalizes IPv6 literals", () => {
      assert.deepStrictEqual([
        extractDomainFromUri(URI.parse("http://[::1]:3000/path")),
        extractDomainFromUri(URI.parse("http://[0:0:0:0:0:0:0:1]/path")),
        extractDomainFromUri(URI.parse("http://[::ffff:127.0.0.1]/path")),
        extractDomainFromUri(URI.parse("http://[::ffff:7f00:1]/path")),
        extractDomainFromUri(URI.parse("https://[2001:0db8:0:0:0:0:0:1]/path")),
        extractDomainFromUri(URI.parse("https://[fe80:0:0:0:0:0:0:1]/path"))
      ], [
        "[::1]",
        "[::1]",
        "[::ffff:7f00:1]",
        "[::ffff:7f00:1]",
        "[2001:db8::1]",
        "[fe80::1]"
      ]);
    });
    test("returns undefined for malformed IPv6 authorities", () => {
      assert.deepStrictEqual([
        extractDomainFromUri(URI.from({ scheme: "http", authority: "[::1", path: "/" })),
        extractDomainFromUri(URI.from({ scheme: "http", authority: "::1]", path: "/" })),
        extractDomainFromUri(URI.from({ scheme: "http", authority: "[::1]extra", path: "/" })),
        extractDomainFromUri(URI.from({ scheme: "http", authority: "[fe80::1%25eth0]", path: "/" }))
      ], [
        void 0,
        void 0,
        void 0,
        void 0
      ]);
    });
  });
  suite("isDomainAllowed", () => {
    test("denies everything when both lists empty", () => {
      assert.strictEqual(isDomainAllowed("example.com", [], []), false);
    });
    test("denied takes precedence over allowed", () => {
      assert.strictEqual(isDomainAllowed("evil.com", ["*.com"], ["evil.com"]), false);
    });
    test("allowed list restricts to matching domains", () => {
      assert.strictEqual(isDomainAllowed("example.com", ["example.com"], []), true);
      assert.strictEqual(isDomainAllowed("other.com", ["example.com"], []), false);
    });
    test("deny-only config allows non-denied domains", () => {
      assert.strictEqual(isDomainAllowed("good.com", [], ["evil.com"]), true);
      assert.strictEqual(isDomainAllowed("evil.com", [], ["evil.com"]), false);
    });
    test("wildcard allowed with specific deny", () => {
      assert.strictEqual(isDomainAllowed("safe.com", ["*"], ["evil.com"]), true);
      assert.strictEqual(isDomainAllowed("evil.com", ["*"], ["evil.com"]), false);
    });
    test("wildcard deny blocks everything", () => {
      assert.strictEqual(isDomainAllowed("example.com", ["example.com"], ["*"]), false);
    });
    test("subdomain matching in allow/deny", () => {
      assert.strictEqual(isDomainAllowed("api.example.com", ["*.example.com"], []), true);
      assert.strictEqual(isDomainAllowed("api.example.com", [], ["*.example.com"]), false);
    });
    test("matches canonical IPv6 literals against equivalent patterns", () => {
      assert.deepStrictEqual([
        matchesDomainPattern("[::1]", "[0:0:0:0:0:0:0:1]"),
        matchesDomainPattern("[::ffff:7f00:1]", "http://[::ffff:127.0.0.1]:3000/path"),
        matchesDomainPattern("[2001:db8::1]", "[2001:0db8:0:0:0:0:0:1]"),
        matchesDomainPattern("[2001:db8::1]", "[2001:db8::2]")
      ], [
        true,
        true,
        true,
        false
      ]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcbmV0d29ya0ZpbHRlclxcdGVzdFxcY29tbW9uXFxkb21haW5NYXRjaGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBub3JtYWxpemVEb21haW4sIGV4dHJhY3REb21haW5QYXR0ZXJuLCBtYXRjaGVzRG9tYWluUGF0dGVybiwgZXh0cmFjdERvbWFpbkZyb21VcmksIGlzRG9tYWluQWxsb3dlZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9kb21haW5NYXRjaGVyLmpzJztcblxuc3VpdGUoJ2RvbWFpbk1hdGNoZXInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ25vcm1hbGl6ZURvbWFpbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBlbXB0eS9mYWxzeSBpbnB1dCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFtub3JtYWxpemVEb21haW4odW5kZWZpbmVkKSwgbm9ybWFsaXplRG9tYWluKCcnKSwgbm9ybWFsaXplRG9tYWluKCcgICcpXSxcblx0XHRcdFx0W3VuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbG93ZXJjYXNlcyBhbmQgdHJpbXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9ybWFsaXplRG9tYWluKCcgIEV4YW1wbGUuQ09NICAnKSwgJ2V4YW1wbGUuY29tJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdHJpcHMgdXNlciBpbmZvJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vcm1hbGl6ZURvbWFpbigndXNlckBleGFtcGxlLmNvbScpLCAnZXhhbXBsZS5jb20nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0cmlwcyBwb3J0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vcm1hbGl6ZURvbWFpbignZXhhbXBsZS5jb206ODA4MCcpLCAnZXhhbXBsZS5jb20nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0cmlwcyB0cmFpbGluZyBkb3RzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vcm1hbGl6ZURvbWFpbignZXhhbXBsZS5jb20uLicpLCAnZXhhbXBsZS5jb20nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgcGF0aHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9ybWFsaXplRG9tYWluKCdleGFtcGxlLmNvbS9wYXRoJyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIC4gYW5kIC4uJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0W25vcm1hbGl6ZURvbWFpbignLicpLCBub3JtYWxpemVEb21haW4oJy4uJyldLFxuXHRcdFx0XHRbdW5kZWZpbmVkLCB1bmRlZmluZWRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWNjZXB0cyBiYXJlIHdpbGRjYXJkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vcm1hbGl6ZURvbWFpbignKicpLCAnKicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWNjZXB0cyB3aWxkY2FyZCBwcmVmaXgnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9ybWFsaXplRG9tYWluKCcqLmV4YW1wbGUuY29tJyksICcqLmV4YW1wbGUuY29tJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdHJpcHMgdHJhaWxpbmcgcHVuY3R1YXRpb24nLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9ybWFsaXplRG9tYWluKCdleGFtcGxlLmNvbSwnKSwgJ2V4YW1wbGUuY29tJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9ybWFsaXplRG9tYWluKCdleGFtcGxlLmNvbTsnKSwgJ2V4YW1wbGUuY29tJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm9ybWFsaXplRG9tYWluKCdleGFtcGxlLmNvbSknKSwgJ2V4YW1wbGUuY29tJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIGZpbGUtZXh0ZW5zaW9uLWxpa2UgVExEcyB3aGVuIG5vdCBmcm9tIFVSTCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3JtYWxpemVEb21haW4oJ2Zvby5qcycpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vcm1hbGl6ZURvbWFpbignZm9vLmpzb24nKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3JtYWxpemVEb21haW4oJ2Zvby50cycpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWxsb3dzIGZpbGUtZXh0ZW5zaW9uLWxpa2UgVExEcyB3aGVuIGZyb21VcmwgaXMgdHJ1ZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3JtYWxpemVEb21haW4oJ2Zvby5qcycsIHRydWUpLCAnZm9vLmpzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIGludmFsaWQgY2hhcmFjdGVycycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3JtYWxpemVEb21haW4oJ2V4YW0gcGxlLmNvbScpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vcm1hbGl6ZURvbWFpbignZXhhbXBsZSEuY29tJyksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIGNvbXBsZXggdmFsaWQgZG9tYWlucycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3JtYWxpemVEb21haW4oJ3N1Yi5kb21haW4uZXhhbXBsZS5jb20nKSwgJ3N1Yi5kb21haW4uZXhhbXBsZS5jb20nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2V4dHJhY3REb21haW5QYXR0ZXJuJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmV0dXJucyB0cmltbWVkIGlucHV0IHdoZW4gbm8gc2NoZW1lJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHJhY3REb21haW5QYXR0ZXJuKCcgIGV4YW1wbGUuY29tICAnKSwgJ2V4YW1wbGUuY29tJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGJhcmUgd2lsZGNhcmQgYXMtaXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cmFjdERvbWFpblBhdHRlcm4oJyonKSwgJyonKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4dHJhY3RzIGF1dGhvcml0eSBmcm9tIFVSTCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRyYWN0RG9tYWluUGF0dGVybignaHR0cHM6Ly9leGFtcGxlLmNvbS9wYXRoJyksICdleGFtcGxlLmNvbScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXh0cmFjdHMgYXV0aG9yaXR5IHdpdGggcG9ydCBmcm9tIFVSTCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRyYWN0RG9tYWluUGF0dGVybignaHR0cDovL2V4YW1wbGUuY29tOjgwODAvcGF0aCcpLCAnZXhhbXBsZS5jb206ODA4MCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnbWF0Y2hlc0RvbWFpblBhdHRlcm4nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdleGFjdCBtYXRjaCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXRjaGVzRG9tYWluUGF0dGVybignZXhhbXBsZS5jb20nLCAnZXhhbXBsZS5jb20nKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWF0Y2hlc0RvbWFpblBhdHRlcm4oJ2V4YW1wbGUuY29tJywgJ290aGVyLmNvbScpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjYXNlIGluc2Vuc2l0aXZlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hdGNoZXNEb21haW5QYXR0ZXJuKCdleGFtcGxlLmNvbScsICdFeGFtcGxlLkNPTScpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2JhcmUgd2lsZGNhcmQgbWF0Y2hlcyBhbnl0aGluZycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXRjaGVzRG9tYWluUGF0dGVybignZXhhbXBsZS5jb20nLCAnKicpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXRjaGVzRG9tYWluUGF0dGVybignYW55dGhpbmcudGVzdCcsICcqJyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2lsZGNhcmQgcHJlZml4IG1hdGNoZXMgc3ViZG9tYWlucycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXRjaGVzRG9tYWluUGF0dGVybignc3ViLmV4YW1wbGUuY29tJywgJyouZXhhbXBsZS5jb20nKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWF0Y2hlc0RvbWFpblBhdHRlcm4oJ2RlZXAuc3ViLmV4YW1wbGUuY29tJywgJyouZXhhbXBsZS5jb20nKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWF0Y2hlc0RvbWFpblBhdHRlcm4oJ2V4YW1wbGUuY29tJywgJyouZXhhbXBsZS5jb20nKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3aWxkY2FyZCBwcmVmaXggZG9lcyBub3QgbWF0Y2ggdW5yZWxhdGVkIGRvbWFpbnMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWF0Y2hlc0RvbWFpblBhdHRlcm4oJ25vdGV4YW1wbGUuY29tJywgJyouZXhhbXBsZS5jb20nKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0Y2hlcyBkb21haW4gZnJvbSBVUkwgcGF0dGVybicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXRjaGVzRG9tYWluUGF0dGVybignZXhhbXBsZS5jb20nLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBmYWxzZSBmb3IgaW52YWxpZCBwYXR0ZXJuJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hdGNoZXNEb21haW5QYXR0ZXJuKCdleGFtcGxlLmNvbScsICcnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZXh0cmFjdERvbWFpbkZyb21VcmknLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdleHRyYWN0cyBkb21haW4gZnJvbSBodHRwcyBVUkknLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cmFjdERvbWFpbkZyb21VcmkoVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3BhdGgnKSksICdleGFtcGxlLmNvbScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RyaXBzIHBvcnQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cmFjdERvbWFpbkZyb21VcmkoVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tOjQ0My9wYXRoJykpLCAnZXhhbXBsZS5jb20nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBlbXB0eSBhdXRob3JpdHknLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cmFjdERvbWFpbkZyb21VcmkoVVJJLmZyb20oeyBzY2hlbWU6ICdmaWxlJywgcGF0aDogJy90bXAvdGVzdCcgfSkpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXh0cmFjdHMgYW5kIGNhbm9uaWNhbGl6ZXMgSVB2NiBsaXRlcmFscycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0XHRleHRyYWN0RG9tYWluRnJvbVVyaShVUkkucGFyc2UoJ2h0dHA6Ly9bOjoxXTozMDAwL3BhdGgnKSksXG5cdFx0XHRcdGV4dHJhY3REb21haW5Gcm9tVXJpKFVSSS5wYXJzZSgnaHR0cDovL1swOjA6MDowOjA6MDowOjFdL3BhdGgnKSksXG5cdFx0XHRcdGV4dHJhY3REb21haW5Gcm9tVXJpKFVSSS5wYXJzZSgnaHR0cDovL1s6OmZmZmY6MTI3LjAuMC4xXS9wYXRoJykpLFxuXHRcdFx0XHRleHRyYWN0RG9tYWluRnJvbVVyaShVUkkucGFyc2UoJ2h0dHA6Ly9bOjpmZmZmOjdmMDA6MV0vcGF0aCcpKSxcblx0XHRcdFx0ZXh0cmFjdERvbWFpbkZyb21VcmkoVVJJLnBhcnNlKCdodHRwczovL1syMDAxOjBkYjg6MDowOjA6MDowOjFdL3BhdGgnKSksXG5cdFx0XHRcdGV4dHJhY3REb21haW5Gcm9tVXJpKFVSSS5wYXJzZSgnaHR0cHM6Ly9bZmU4MDowOjA6MDowOjA6MDoxXS9wYXRoJykpLFxuXHRcdFx0XSwgW1xuXHRcdFx0XHQnWzo6MV0nLFxuXHRcdFx0XHQnWzo6MV0nLFxuXHRcdFx0XHQnWzo6ZmZmZjo3ZjAwOjFdJyxcblx0XHRcdFx0J1s6OmZmZmY6N2YwMDoxXScsXG5cdFx0XHRcdCdbMjAwMTpkYjg6OjFdJyxcblx0XHRcdFx0J1tmZTgwOjoxXScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBtYWxmb3JtZWQgSVB2NiBhdXRob3JpdGllcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0XHRleHRyYWN0RG9tYWluRnJvbVVyaShVUkkuZnJvbSh7IHNjaGVtZTogJ2h0dHAnLCBhdXRob3JpdHk6ICdbOjoxJywgcGF0aDogJy8nIH0pKSxcblx0XHRcdFx0ZXh0cmFjdERvbWFpbkZyb21VcmkoVVJJLmZyb20oeyBzY2hlbWU6ICdodHRwJywgYXV0aG9yaXR5OiAnOjoxXScsIHBhdGg6ICcvJyB9KSksXG5cdFx0XHRcdGV4dHJhY3REb21haW5Gcm9tVXJpKFVSSS5mcm9tKHsgc2NoZW1lOiAnaHR0cCcsIGF1dGhvcml0eTogJ1s6OjFdZXh0cmEnLCBwYXRoOiAnLycgfSkpLFxuXHRcdFx0XHRleHRyYWN0RG9tYWluRnJvbVVyaShVUkkuZnJvbSh7IHNjaGVtZTogJ2h0dHAnLCBhdXRob3JpdHk6ICdbZmU4MDo6MSUyNWV0aDBdJywgcGF0aDogJy8nIH0pKSxcblx0XHRcdF0sIFtcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpc0RvbWFpbkFsbG93ZWQnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdkZW5pZXMgZXZlcnl0aGluZyB3aGVuIGJvdGggbGlzdHMgZW1wdHknLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNEb21haW5BbGxvd2VkKCdleGFtcGxlLmNvbScsIFtdLCBbXSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlbmllZCB0YWtlcyBwcmVjZWRlbmNlIG92ZXIgYWxsb3dlZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0RvbWFpbkFsbG93ZWQoJ2V2aWwuY29tJywgWycqLmNvbSddLCBbJ2V2aWwuY29tJ10pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhbGxvd2VkIGxpc3QgcmVzdHJpY3RzIHRvIG1hdGNoaW5nIGRvbWFpbnMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNEb21haW5BbGxvd2VkKCdleGFtcGxlLmNvbScsIFsnZXhhbXBsZS5jb20nXSwgW10pLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0RvbWFpbkFsbG93ZWQoJ290aGVyLmNvbScsIFsnZXhhbXBsZS5jb20nXSwgW10pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZW55LW9ubHkgY29uZmlnIGFsbG93cyBub24tZGVuaWVkIGRvbWFpbnMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNEb21haW5BbGxvd2VkKCdnb29kLmNvbScsIFtdLCBbJ2V2aWwuY29tJ10pLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0RvbWFpbkFsbG93ZWQoJ2V2aWwuY29tJywgW10sIFsnZXZpbC5jb20nXSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dpbGRjYXJkIGFsbG93ZWQgd2l0aCBzcGVjaWZpYyBkZW55JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRG9tYWluQWxsb3dlZCgnc2FmZS5jb20nLCBbJyonXSwgWydldmlsLmNvbSddKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNEb21haW5BbGxvd2VkKCdldmlsLmNvbScsIFsnKiddLCBbJ2V2aWwuY29tJ10pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3aWxkY2FyZCBkZW55IGJsb2NrcyBldmVyeXRoaW5nJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzRG9tYWluQWxsb3dlZCgnZXhhbXBsZS5jb20nLCBbJ2V4YW1wbGUuY29tJ10sIFsnKiddKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3ViZG9tYWluIG1hdGNoaW5nIGluIGFsbG93L2RlbnknLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNEb21haW5BbGxvd2VkKCdhcGkuZXhhbXBsZS5jb20nLCBbJyouZXhhbXBsZS5jb20nXSwgW10pLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc0RvbWFpbkFsbG93ZWQoJ2FwaS5leGFtcGxlLmNvbScsIFtdLCBbJyouZXhhbXBsZS5jb20nXSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGNoZXMgY2Fub25pY2FsIElQdjYgbGl0ZXJhbHMgYWdhaW5zdCBlcXVpdmFsZW50IHBhdHRlcm5zJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRcdG1hdGNoZXNEb21haW5QYXR0ZXJuKCdbOjoxXScsICdbMDowOjA6MDowOjA6MDoxXScpLFxuXHRcdFx0XHRtYXRjaGVzRG9tYWluUGF0dGVybignWzo6ZmZmZjo3ZjAwOjFdJywgJ2h0dHA6Ly9bOjpmZmZmOjEyNy4wLjAuMV06MzAwMC9wYXRoJyksXG5cdFx0XHRcdG1hdGNoZXNEb21haW5QYXR0ZXJuKCdbMjAwMTpkYjg6OjFdJywgJ1syMDAxOjBkYjg6MDowOjA6MDowOjFdJyksXG5cdFx0XHRcdG1hdGNoZXNEb21haW5QYXR0ZXJuKCdbMjAwMTpkYjg6OjFdJywgJ1syMDAxOmRiODo6Ml0nKSxcblx0XHRcdF0sIFtcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0dHJ1ZSxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxpQkFBaUIsc0JBQXNCLHNCQUFzQixzQkFBc0IsdUJBQXVCO0FBRW5ILE1BQU0saUJBQWlCLE1BQU07QUFFNUIsMENBQXdDO0FBRXhDLFFBQU0sbUJBQW1CLE1BQU07QUFFOUIsU0FBSywyQ0FBMkMsTUFBTTtBQUNyRCxhQUFPO0FBQUEsUUFDTixDQUFDLGdCQUFnQixNQUFTLEdBQUcsZ0JBQWdCLEVBQUUsR0FBRyxnQkFBZ0IsSUFBSSxDQUFDO0FBQUEsUUFDdkUsQ0FBQyxRQUFXLFFBQVcsTUFBUztBQUFBLE1BQ2pDO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyx3QkFBd0IsTUFBTTtBQUNsQyxhQUFPLFlBQVksZ0JBQWdCLGlCQUFpQixHQUFHLGFBQWE7QUFBQSxJQUNyRSxDQUFDO0FBRUQsU0FBSyxvQkFBb0IsTUFBTTtBQUM5QixhQUFPLFlBQVksZ0JBQWdCLGtCQUFrQixHQUFHLGFBQWE7QUFBQSxJQUN0RSxDQUFDO0FBRUQsU0FBSyxlQUFlLE1BQU07QUFDekIsYUFBTyxZQUFZLGdCQUFnQixrQkFBa0IsR0FBRyxhQUFhO0FBQUEsSUFDdEUsQ0FBQztBQUVELFNBQUssd0JBQXdCLE1BQU07QUFDbEMsYUFBTyxZQUFZLGdCQUFnQixlQUFlLEdBQUcsYUFBYTtBQUFBLElBQ25FLENBQUM7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
