import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import {
  BrowserSearchEngineId,
  buildSearchUrl,
  getBrowserSearchEngineLabel,
  resolveAddressBarInputType
} from "../../common/browserSearch.js";
suite("BrowserSearch - resolveAddressBarInput", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("recognized schemes are URLs", () => {
    const inputs = [
      "https://example.com",
      "http://example.com/path?q=1",
      "file:///etc/passwd",
      "about:blank",
      "data:text/html,<h1>hi</h1>",
      "view-source:https://example.com",
      "ftp://files.example.com",
      "vscode://settings",
      "HTTP://EXAMPLE.COM",
      // case-insensitive scheme
      "https://m\xFCnchen.de/pfad?q=wert"
      // unicode after scheme
    ];
    const actual = inputs.map((i) => resolveAddressBarInputType(i));
    assert.deepStrictEqual(actual, inputs.map(() => "url"));
  });
  test("scheme-less hosts and IPs are URLs", () => {
    const inputs = [
      // Hostnames with a TLD
      "example.com",
      "sub.example.com:8080/path",
      "example.com?q=1",
      // Any 2+ letter last label is accepted as a TLD (covers new/brand
      // gTLDs without maintaining a list).
      "foo.bank",
      "acme.google",
      "foo.zzzznotatld",
      // IPv4 (navigable: first octet != 0, or exactly 0.0.0.0)
      "127.0.0.1",
      "127.0.0.1:8080",
      "192.168.1.1/admin",
      "0.0.0.0",
      "0.0.0.0:8080",
      // IPv6 (bracketed)
      "[::]",
      "[::]:8080",
      "[::1]",
      "[::1]:8080",
      "[0:0:0:0:0:0:0:0]",
      "[0:0:0:0:0:0:0:1]",
      "[2001:db8::1]/path",
      // localhost
      "localhost",
      "localhost:3000",
      "localhost/foo",
      "localhost?q=1",
      // Intranet shortcuts (bare host with a path ending in `/`)
      "go/",
      "intranet/",
      "go/there/",
      "wiki/page/sub/",
      // Absolute paths
      "/",
      "/usr/local/bin",
      "//example.com",
      // Internationalized domain names (IDN)
      "m\xFCnchen.de",
      "xn--mnchen-3ya.de",
      // punycode form
      "m\xFCnchen.de:8080/pfad",
      // Bracketed IPv6 literals (validated/canonicalized by URL parser)
      "[::1]",
      "[2001:0db8::0001]",
      // Subdomains of RFC 6761 special-cased TLDs require >= 1 subdomain
      "foo.test",
      "foo.local",
      "foo.example",
      "foo.internal"
    ];
    const actual = inputs.map((i) => resolveAddressBarInputType(i));
    assert.deepStrictEqual(actual, inputs.map(() => "url"));
  });
  test("queries (whitespace or invalid host chars) return query", () => {
    const inputs = [
      "hello world",
      "what is 2+2",
      "  spaced  query  ",
      "a&b?c=d",
      // invalid host char `&`
      "0.1.2.3",
      // IPv4 with first octet 0 (not 0.0.0.0)
      "[:::::::]",
      // malformed IPv6
      "foo bar/baz"
      // whitespace in the host, bare path
    ];
    const actual = inputs.map((i) => resolveAddressBarInputType(i));
    assert.deepStrictEqual(actual, inputs.map(() => "query"));
  });
  test("whitespace in the path/query/fragment is a URL (percent-encoded later)", () => {
    const inputs = [
      "http://localhost:8888/my file.php",
      // space in path, explicit scheme (issue #326784)
      "https://example.com/my file.php",
      "localhost:8888/my file.php",
      // scheme-less host:port
      "example.com/foo bar",
      // scheme-less host with known TLD
      "example.com?q=hello world",
      // space in the query
      "example.com/a#frag ment"
      // space in the fragment
    ];
    const actual = inputs.map((i) => resolveAddressBarInputType(i));
    assert.deepStrictEqual(actual, inputs.map(() => "url"));
  });
  test("whitespace in the userinfo is unknown (defaults to search)", () => {
    const inputs = [
      "user name@example.com",
      "user name@example.com/",
      "user name@localhost"
    ];
    const actual = inputs.map((i) => resolveAddressBarInputType(i));
    assert.deepStrictEqual(actual, inputs.map(() => "unknown"));
  });
  test("an explicit http(s) scheme keeps whitespace-userinfo input a URL", () => {
    const inputs = [
      "http://user name@example.com",
      "https://user name@example.com"
    ];
    const actual = inputs.map((i) => resolveAddressBarInputType(i));
    assert.deepStrictEqual(actual, inputs.map(() => "url"));
  });
  test("whitespace in the userinfo with an IP-literal host is still a URL", () => {
    const inputs = [
      "user name@127.0.0.1",
      "user name@[::1]"
    ];
    const actual = inputs.map((i) => resolveAddressBarInputType(i));
    assert.deepStrictEqual(actual, inputs.map(() => "url"));
  });
  test("ambiguous inputs return unknown", () => {
    const inputs = [
      "cats",
      // single word
      "intranet",
      // single word
      "wiki/page",
      // bare host + path, no trailing slash, no TLD
      "c#",
      // single token with fragment
      "\u65E5\u672C\u8A9E",
      // single Unicode word, no TLD
      "unknownscheme:foo",
      // unknown scheme that does not look like userinfo
      "foo.invalid"
      // RFC 6761 reserved as non-navigable
    ];
    const actual = inputs.map((i) => resolveAddressBarInputType(i));
    assert.deepStrictEqual(actual, inputs.map(() => "unknown"));
  });
  test("input is trimmed before classification", () => {
    assert.deepStrictEqual(
      [
        resolveAddressBarInputType("   example.com"),
        resolveAddressBarInputType("https://example.com   "),
        resolveAddressBarInputType("	localhost:3000\n")
      ],
      ["url", "url", "url"]
    );
  });
  test("empty / whitespace input returns empty", () => {
    assert.deepStrictEqual(
      [
        resolveAddressBarInputType(""),
        resolveAddressBarInputType("   "),
        resolveAddressBarInputType("	\n")
      ],
      ["empty", "empty", "empty"]
    );
  });
  test("unknown scheme that looks like user:password@host is a URL", () => {
    assert.strictEqual(
      resolveAddressBarInputType("user:pass@example.com"),
      "url"
    );
  });
  test("javascript: with non-code body is unknown", () => {
    assert.strictEqual(
      resolveAddressBarInputType("javascript:hello"),
      "unknown"
    );
    assert.strictEqual(
      resolveAddressBarInputType("javascript:alert(1)"),
      "url"
    );
  });
});
suite("BrowserSearch - buildSearchUrl", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("encodes queries for each engine", () => {
    const query = "hello world";
    const actual = [
      BrowserSearchEngineId.Bing,
      BrowserSearchEngineId.Yahoo,
      BrowserSearchEngineId.Google,
      BrowserSearchEngineId.DuckDuckGo
    ].map((engine) => buildSearchUrl(query, engine));
    assert.deepStrictEqual(actual, [
      "https://www.bing.com/search?q=hello+world",
      "https://search.yahoo.com/search?p=hello+world",
      "https://www.google.com/search?q=hello+world",
      "https://duckduckgo.com/?q=hello+world"
    ]);
  });
  test("trims and collapses internal whitespace", () => {
    assert.strictEqual(
      buildSearchUrl("  spaced  query  ", BrowserSearchEngineId.Bing),
      "https://www.bing.com/search?q=spaced+query"
    );
  });
  test("encodes special characters", () => {
    assert.deepStrictEqual(
      [
        buildSearchUrl("wiki/page", BrowserSearchEngineId.Bing),
        buildSearchUrl("what is 2+2", BrowserSearchEngineId.Bing),
        buildSearchUrl("c#", BrowserSearchEngineId.Bing),
        buildSearchUrl("\u65E5\u672C\u8A9E", BrowserSearchEngineId.Bing),
        buildSearchUrl("a&b?c=d", BrowserSearchEngineId.Bing),
        buildSearchUrl("unknownscheme:foo", BrowserSearchEngineId.Bing)
      ],
      [
        "https://www.bing.com/search?q=wiki%2Fpage",
        "https://www.bing.com/search?q=what+is+2%2B2",
        "https://www.bing.com/search?q=c%23",
        "https://www.bing.com/search?q=%E6%97%A5%E6%9C%AC%E8%AA%9E",
        "https://www.bing.com/search?q=a%26b%3Fc%3Dd",
        "https://www.bing.com/search?q=unknownscheme%3Afoo"
      ]
    );
  });
  test("unknown engine id falls back to default (Bing)", () => {
    assert.strictEqual(
      buildSearchUrl("cats", "nonexistent"),
      "https://www.bing.com/search?q=cats"
    );
  });
});
suite("BrowserSearch - getBrowserSearchEngineLabel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns the engine label, falling back to default for unknown ids", () => {
    assert.deepStrictEqual(
      [
        getBrowserSearchEngineLabel(BrowserSearchEngineId.Bing),
        getBrowserSearchEngineLabel(BrowserSearchEngineId.Google),
        getBrowserSearchEngineLabel(BrowserSearchEngineId.DuckDuckGo),
        getBrowserSearchEngineLabel("nonexistent")
      ],
      ["Bing", "Google", "DuckDuckGo", "Bing"]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFx0ZXN0XFxjb21tb25cXGJyb3dzZXJTZWFyY2gudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHtcblx0QnJvd3NlclNlYXJjaEVuZ2luZUlkLFxuXHRidWlsZFNlYXJjaFVybCxcblx0Z2V0QnJvd3NlclNlYXJjaEVuZ2luZUxhYmVsLFxuXHRyZXNvbHZlQWRkcmVzc0JhcklucHV0VHlwZSxcbn0gZnJvbSAnLi4vLi4vY29tbW9uL2Jyb3dzZXJTZWFyY2guanMnO1xuXG5zdWl0ZSgnQnJvd3NlclNlYXJjaCAtIHJlc29sdmVBZGRyZXNzQmFySW5wdXQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JlY29nbml6ZWQgc2NoZW1lcyBhcmUgVVJMcycsICgpID0+IHtcblx0XHRjb25zdCBpbnB1dHMgPSBbXG5cdFx0XHQnaHR0cHM6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHQnaHR0cDovL2V4YW1wbGUuY29tL3BhdGg/cT0xJyxcblx0XHRcdCdmaWxlOi8vL2V0Yy9wYXNzd2QnLFxuXHRcdFx0J2Fib3V0OmJsYW5rJyxcblx0XHRcdCdkYXRhOnRleHQvaHRtbCw8aDE+aGk8L2gxPicsXG5cdFx0XHQndmlldy1zb3VyY2U6aHR0cHM6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHQnZnRwOi8vZmlsZXMuZXhhbXBsZS5jb20nLFxuXHRcdFx0J3ZzY29kZTovL3NldHRpbmdzJyxcblx0XHRcdCdIVFRQOi8vRVhBTVBMRS5DT00nLCAvLyBjYXNlLWluc2Vuc2l0aXZlIHNjaGVtZVxuXHRcdFx0J2h0dHBzOi8vbVx1MDBGQ25jaGVuLmRlL3BmYWQ/cT13ZXJ0JywgLy8gdW5pY29kZSBhZnRlciBzY2hlbWVcblx0XHRdO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGlucHV0cy5tYXAoKGkpID0+IHJlc29sdmVBZGRyZXNzQmFySW5wdXRUeXBlKGkpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgaW5wdXRzLm1hcCgoKSA9PiAndXJsJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdzY2hlbWUtbGVzcyBob3N0cyBhbmQgSVBzIGFyZSBVUkxzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGlucHV0cyA9IFtcblx0XHRcdC8vIEhvc3RuYW1lcyB3aXRoIGEgVExEXG5cdFx0XHQnZXhhbXBsZS5jb20nLFxuXHRcdFx0J3N1Yi5leGFtcGxlLmNvbTo4MDgwL3BhdGgnLFxuXHRcdFx0J2V4YW1wbGUuY29tP3E9MScsXG5cdFx0XHQvLyBBbnkgMisgbGV0dGVyIGxhc3QgbGFiZWwgaXMgYWNjZXB0ZWQgYXMgYSBUTEQgKGNvdmVycyBuZXcvYnJhbmRcblx0XHRcdC8vIGdUTERzIHdpdGhvdXQgbWFpbnRhaW5pbmcgYSBsaXN0KS5cblx0XHRcdCdmb28uYmFuaycsXG5cdFx0XHQnYWNtZS5nb29nbGUnLFxuXHRcdFx0J2Zvby56enp6bm90YXRsZCcsXG5cdFx0XHQvLyBJUHY0IChuYXZpZ2FibGU6IGZpcnN0IG9jdGV0ICE9IDAsIG9yIGV4YWN0bHkgMC4wLjAuMClcblx0XHRcdCcxMjcuMC4wLjEnLFxuXHRcdFx0JzEyNy4wLjAuMTo4MDgwJyxcblx0XHRcdCcxOTIuMTY4LjEuMS9hZG1pbicsXG5cdFx0XHQnMC4wLjAuMCcsXG5cdFx0XHQnMC4wLjAuMDo4MDgwJyxcblx0XHRcdC8vIElQdjYgKGJyYWNrZXRlZClcblx0XHRcdCdbOjpdJyxcblx0XHRcdCdbOjpdOjgwODAnLFxuXHRcdFx0J1s6OjFdJyxcblx0XHRcdCdbOjoxXTo4MDgwJyxcblx0XHRcdCdbMDowOjA6MDowOjA6MDowXScsXG5cdFx0XHQnWzA6MDowOjA6MDowOjA6MV0nLFxuXHRcdFx0J1syMDAxOmRiODo6MV0vcGF0aCcsXG5cdFx0XHQvLyBsb2NhbGhvc3Rcblx0XHRcdCdsb2NhbGhvc3QnLFxuXHRcdFx0J2xvY2FsaG9zdDozMDAwJyxcblx0XHRcdCdsb2NhbGhvc3QvZm9vJyxcblx0XHRcdCdsb2NhbGhvc3Q/cT0xJyxcblx0XHRcdC8vIEludHJhbmV0IHNob3J0Y3V0cyAoYmFyZSBob3N0IHdpdGggYSBwYXRoIGVuZGluZyBpbiBgL2ApXG5cdFx0XHQnZ28vJyxcblx0XHRcdCdpbnRyYW5ldC8nLFxuXHRcdFx0J2dvL3RoZXJlLycsXG5cdFx0XHQnd2lraS9wYWdlL3N1Yi8nLFxuXHRcdFx0Ly8gQWJzb2x1dGUgcGF0aHNcblx0XHRcdCcvJyxcblx0XHRcdCcvdXNyL2xvY2FsL2JpbicsXG5cdFx0XHQnLy9leGFtcGxlLmNvbScsXG5cdFx0XHQvLyBJbnRlcm5hdGlvbmFsaXplZCBkb21haW4gbmFtZXMgKElETilcblx0XHRcdCdtXHUwMEZDbmNoZW4uZGUnLFxuXHRcdFx0J3huLS1tbmNoZW4tM3lhLmRlJywgLy8gcHVueWNvZGUgZm9ybVxuXHRcdFx0J21cdTAwRkNuY2hlbi5kZTo4MDgwL3BmYWQnLFxuXHRcdFx0Ly8gQnJhY2tldGVkIElQdjYgbGl0ZXJhbHMgKHZhbGlkYXRlZC9jYW5vbmljYWxpemVkIGJ5IFVSTCBwYXJzZXIpXG5cdFx0XHQnWzo6MV0nLFxuXHRcdFx0J1syMDAxOjBkYjg6OjAwMDFdJyxcblx0XHRcdC8vIFN1YmRvbWFpbnMgb2YgUkZDIDY3NjEgc3BlY2lhbC1jYXNlZCBUTERzIHJlcXVpcmUgPj0gMSBzdWJkb21haW5cblx0XHRcdCdmb28udGVzdCcsXG5cdFx0XHQnZm9vLmxvY2FsJyxcblx0XHRcdCdmb28uZXhhbXBsZScsXG5cdFx0XHQnZm9vLmludGVybmFsJyxcblx0XHRdO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGlucHV0cy5tYXAoKGkpID0+IHJlc29sdmVBZGRyZXNzQmFySW5wdXRUeXBlKGkpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgaW5wdXRzLm1hcCgoKSA9PiAndXJsJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdxdWVyaWVzICh3aGl0ZXNwYWNlIG9yIGludmFsaWQgaG9zdCBjaGFycykgcmV0dXJuIHF1ZXJ5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGlucHV0cyA9IFtcblx0XHRcdCdoZWxsbyB3b3JsZCcsXG5cdFx0XHQnd2hhdCBpcyAyKzInLFxuXHRcdFx0JyAgc3BhY2VkICBxdWVyeSAgJyxcblx0XHRcdCdhJmI/Yz1kJywgLy8gaW52YWxpZCBob3N0IGNoYXIgYCZgXG5cdFx0XHQnMC4xLjIuMycsIC8vIElQdjQgd2l0aCBmaXJzdCBvY3RldCAwIChub3QgMC4wLjAuMClcblx0XHRcdCdbOjo6Ojo6Ol0nLCAvLyBtYWxmb3JtZWQgSVB2NlxuXHRcdFx0J2ZvbyBiYXIvYmF6JywgLy8gd2hpdGVzcGFjZSBpbiB0aGUgaG9zdCwgYmFyZSBwYXRoXG5cdFx0XTtcblx0XHRjb25zdCBhY3R1YWwgPSBpbnB1dHMubWFwKChpKSA9PiByZXNvbHZlQWRkcmVzc0JhcklucHV0VHlwZShpKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGlucHV0cy5tYXAoKCkgPT4gJ3F1ZXJ5JykpO1xuXHR9KTtcblxuXHR0ZXN0KCd3aGl0ZXNwYWNlIGluIHRoZSBwYXRoL3F1ZXJ5L2ZyYWdtZW50IGlzIGEgVVJMIChwZXJjZW50LWVuY29kZWQgbGF0ZXIpJywgKCkgPT4ge1xuXHRcdGNvbnN0IGlucHV0cyA9IFtcblx0XHRcdCdodHRwOi8vbG9jYWxob3N0Ojg4ODgvbXkgZmlsZS5waHAnLCAvLyBzcGFjZSBpbiBwYXRoLCBleHBsaWNpdCBzY2hlbWUgKGlzc3VlICMzMjY3ODQpXG5cdFx0XHQnaHR0cHM6Ly9leGFtcGxlLmNvbS9teSBmaWxlLnBocCcsXG5cdFx0XHQnbG9jYWxob3N0Ojg4ODgvbXkgZmlsZS5waHAnLCAvLyBzY2hlbWUtbGVzcyBob3N0OnBvcnRcblx0XHRcdCdleGFtcGxlLmNvbS9mb28gYmFyJywgLy8gc2NoZW1lLWxlc3MgaG9zdCB3aXRoIGtub3duIFRMRFxuXHRcdFx0J2V4YW1wbGUuY29tP3E9aGVsbG8gd29ybGQnLCAvLyBzcGFjZSBpbiB0aGUgcXVlcnlcblx0XHRcdCdleGFtcGxlLmNvbS9hI2ZyYWcgbWVudCcsIC8vIHNwYWNlIGluIHRoZSBmcmFnbWVudFxuXHRcdF07XG5cdFx0Y29uc3QgYWN0dWFsID0gaW5wdXRzLm1hcCgoaSkgPT4gcmVzb2x2ZUFkZHJlc3NCYXJJbnB1dFR5cGUoaSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBpbnB1dHMubWFwKCgpID0+ICd1cmwnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3doaXRlc3BhY2UgaW4gdGhlIHVzZXJpbmZvIGlzIHVua25vd24gKGRlZmF1bHRzIHRvIHNlYXJjaCknLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5wdXRzID0gW1xuXHRcdFx0J3VzZXIgbmFtZUBleGFtcGxlLmNvbScsXG5cdFx0XHQndXNlciBuYW1lQGV4YW1wbGUuY29tLycsXG5cdFx0XHQndXNlciBuYW1lQGxvY2FsaG9zdCcsXG5cdFx0XTtcblx0XHRjb25zdCBhY3R1YWwgPSBpbnB1dHMubWFwKChpKSA9PiByZXNvbHZlQWRkcmVzc0JhcklucHV0VHlwZShpKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGlucHV0cy5tYXAoKCkgPT4gJ3Vua25vd24nKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FuIGV4cGxpY2l0IGh0dHAocykgc2NoZW1lIGtlZXBzIHdoaXRlc3BhY2UtdXNlcmluZm8gaW5wdXQgYSBVUkwnLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIHNjaGVtZS1sZXNzIGNhc2VzIGFib3ZlIGFyZSBgdW5rbm93bmAsIGJ1dCBhbiBleHBsaWNpdCBodHRwKHMpXG5cdFx0Ly8gc2NoZW1lIHdpbnMgKHRoZSBgIWlzSHR0cFNjaGVtZWAgZXhjZXB0aW9uIG9uIHRoZSB1c2VyaW5mbyBndWFyZCksXG5cdFx0Ly8gbWF0Y2hpbmcgQ2hyb21pdW0ncyBleHBsaWNpdC1zY2hlbWUgXHUyMTkyIFVSTCBydWxlLlxuXHRcdGNvbnN0IGlucHV0cyA9IFtcblx0XHRcdCdodHRwOi8vdXNlciBuYW1lQGV4YW1wbGUuY29tJyxcblx0XHRcdCdodHRwczovL3VzZXIgbmFtZUBleGFtcGxlLmNvbScsXG5cdFx0XTtcblx0XHRjb25zdCBhY3R1YWwgPSBpbnB1dHMubWFwKChpKSA9PiByZXNvbHZlQWRkcmVzc0JhcklucHV0VHlwZShpKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGlucHV0cy5tYXAoKCkgPT4gJ3VybCcpKTtcblx0fSk7XG5cblx0dGVzdCgnd2hpdGVzcGFjZSBpbiB0aGUgdXNlcmluZm8gd2l0aCBhbiBJUC1saXRlcmFsIGhvc3QgaXMgc3RpbGwgYSBVUkwnLCAoKSA9PiB7XG5cdFx0Ly8gQ2hyb21pdW0ncyBBdXRvY29tcGxldGVJbnB1dDo6UGFyc2UgY2xhc3NpZmllcyBJUHY0L0lQdjYgaG9zdHMgYXMgVVJMXG5cdFx0Ly8gYmVmb3JlIGl0IGFwcGxpZXMgdGhlIFwic3BhY2UgaW4gdGhlIHVzZXJuYW1lXCIgaGV1cmlzdGljLCBzbyB0aGVzZSBzdGF5XG5cdFx0Ly8gVVJMcyBldmVuIHRob3VnaCBhIGRvbWFpbiBob3N0IHdpdGggYSBzcGFjZSBpbiB0aGUgdXNlcmluZm8gaXMgYHVua25vd25gLlxuXHRcdGNvbnN0IGlucHV0cyA9IFtcblx0XHRcdCd1c2VyIG5hbWVAMTI3LjAuMC4xJyxcblx0XHRcdCd1c2VyIG5hbWVAWzo6MV0nLFxuXHRcdF07XG5cdFx0Y29uc3QgYWN0dWFsID0gaW5wdXRzLm1hcCgoaSkgPT4gcmVzb2x2ZUFkZHJlc3NCYXJJbnB1dFR5cGUoaSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBpbnB1dHMubWFwKCgpID0+ICd1cmwnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FtYmlndW91cyBpbnB1dHMgcmV0dXJuIHVua25vd24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5wdXRzID0gW1xuXHRcdFx0J2NhdHMnLCAvLyBzaW5nbGUgd29yZFxuXHRcdFx0J2ludHJhbmV0JywgLy8gc2luZ2xlIHdvcmRcblx0XHRcdCd3aWtpL3BhZ2UnLCAvLyBiYXJlIGhvc3QgKyBwYXRoLCBubyB0cmFpbGluZyBzbGFzaCwgbm8gVExEXG5cdFx0XHQnYyMnLCAvLyBzaW5nbGUgdG9rZW4gd2l0aCBmcmFnbWVudFxuXHRcdFx0J1x1NjVFNVx1NjcyQ1x1OEE5RScsIC8vIHNpbmdsZSBVbmljb2RlIHdvcmQsIG5vIFRMRFxuXHRcdFx0J3Vua25vd25zY2hlbWU6Zm9vJywgLy8gdW5rbm93biBzY2hlbWUgdGhhdCBkb2VzIG5vdCBsb29rIGxpa2UgdXNlcmluZm9cblx0XHRcdCdmb28uaW52YWxpZCcsIC8vIFJGQyA2NzYxIHJlc2VydmVkIGFzIG5vbi1uYXZpZ2FibGVcblx0XHRdO1xuXHRcdGNvbnN0IGFjdHVhbCA9IGlucHV0cy5tYXAoKGkpID0+IHJlc29sdmVBZGRyZXNzQmFySW5wdXRUeXBlKGkpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgaW5wdXRzLm1hcCgoKSA9PiAndW5rbm93bicpKTtcblx0fSk7XG5cblx0dGVzdCgnaW5wdXQgaXMgdHJpbW1lZCBiZWZvcmUgY2xhc3NpZmljYXRpb24nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFtcblx0XHRcdFx0cmVzb2x2ZUFkZHJlc3NCYXJJbnB1dFR5cGUoJyAgIGV4YW1wbGUuY29tJyksXG5cdFx0XHRcdHJlc29sdmVBZGRyZXNzQmFySW5wdXRUeXBlKCdodHRwczovL2V4YW1wbGUuY29tICAgJyksXG5cdFx0XHRcdHJlc29sdmVBZGRyZXNzQmFySW5wdXRUeXBlKCdcXHRsb2NhbGhvc3Q6MzAwMFxcbicpLFxuXHRcdFx0XSxcblx0XHRcdFsndXJsJywgJ3VybCcsICd1cmwnXSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbXB0eSAvIHdoaXRlc3BhY2UgaW5wdXQgcmV0dXJucyBlbXB0eScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0W1xuXHRcdFx0XHRyZXNvbHZlQWRkcmVzc0JhcklucHV0VHlwZSgnJyksXG5cdFx0XHRcdHJlc29sdmVBZGRyZXNzQmFySW5wdXRUeXBlKCcgICAnKSxcblx0XHRcdFx0cmVzb2x2ZUFkZHJlc3NCYXJJbnB1dFR5cGUoJ1xcdFxcbicpLFxuXHRcdFx0XSxcblx0XHRcdFsnZW1wdHknLCAnZW1wdHknLCAnZW1wdHknXSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bmtub3duIHNjaGVtZSB0aGF0IGxvb2tzIGxpa2UgdXNlcjpwYXNzd29yZEBob3N0IGlzIGEgVVJMJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHJlc29sdmVBZGRyZXNzQmFySW5wdXRUeXBlKCd1c2VyOnBhc3NAZXhhbXBsZS5jb20nKSxcblx0XHRcdCd1cmwnLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2phdmFzY3JpcHQ6IHdpdGggbm9uLWNvZGUgYm9keSBpcyB1bmtub3duJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHJlc29sdmVBZGRyZXNzQmFySW5wdXRUeXBlKCdqYXZhc2NyaXB0OmhlbGxvJyksXG5cdFx0XHQndW5rbm93bicsXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRyZXNvbHZlQWRkcmVzc0JhcklucHV0VHlwZSgnamF2YXNjcmlwdDphbGVydCgxKScpLFxuXHRcdFx0J3VybCcsXG5cdFx0KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0Jyb3dzZXJTZWFyY2ggLSBidWlsZFNlYXJjaFVybCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZW5jb2RlcyBxdWVyaWVzIGZvciBlYWNoIGVuZ2luZScsICgpID0+IHtcblx0XHRjb25zdCBxdWVyeSA9ICdoZWxsbyB3b3JsZCc7XG5cdFx0Y29uc3QgYWN0dWFsID0gW1xuXHRcdFx0QnJvd3NlclNlYXJjaEVuZ2luZUlkLkJpbmcsXG5cdFx0XHRCcm93c2VyU2VhcmNoRW5naW5lSWQuWWFob28sXG5cdFx0XHRCcm93c2VyU2VhcmNoRW5naW5lSWQuR29vZ2xlLFxuXHRcdFx0QnJvd3NlclNlYXJjaEVuZ2luZUlkLkR1Y2tEdWNrR28sXG5cdFx0XS5tYXAoKGVuZ2luZSkgPT4gYnVpbGRTZWFyY2hVcmwocXVlcnksIGVuZ2luZSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbXG5cdFx0XHQnaHR0cHM6Ly93d3cuYmluZy5jb20vc2VhcmNoP3E9aGVsbG8rd29ybGQnLFxuXHRcdFx0J2h0dHBzOi8vc2VhcmNoLnlhaG9vLmNvbS9zZWFyY2g/cD1oZWxsbyt3b3JsZCcsXG5cdFx0XHQnaHR0cHM6Ly93d3cuZ29vZ2xlLmNvbS9zZWFyY2g/cT1oZWxsbyt3b3JsZCcsXG5cdFx0XHQnaHR0cHM6Ly9kdWNrZHVja2dvLmNvbS8/cT1oZWxsbyt3b3JsZCcsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyaW1zIGFuZCBjb2xsYXBzZXMgaW50ZXJuYWwgd2hpdGVzcGFjZScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRidWlsZFNlYXJjaFVybCgnICBzcGFjZWQgIHF1ZXJ5ICAnLCBCcm93c2VyU2VhcmNoRW5naW5lSWQuQmluZyksXG5cdFx0XHQnaHR0cHM6Ly93d3cuYmluZy5jb20vc2VhcmNoP3E9c3BhY2VkK3F1ZXJ5Jyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbmNvZGVzIHNwZWNpYWwgY2hhcmFjdGVycycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0W1xuXHRcdFx0XHRidWlsZFNlYXJjaFVybCgnd2lraS9wYWdlJywgQnJvd3NlclNlYXJjaEVuZ2luZUlkLkJpbmcpLFxuXHRcdFx0XHRidWlsZFNlYXJjaFVybCgnd2hhdCBpcyAyKzInLCBCcm93c2VyU2VhcmNoRW5naW5lSWQuQmluZyksXG5cdFx0XHRcdGJ1aWxkU2VhcmNoVXJsKCdjIycsIEJyb3dzZXJTZWFyY2hFbmdpbmVJZC5CaW5nKSxcblx0XHRcdFx0YnVpbGRTZWFyY2hVcmwoJ1x1NjVFNVx1NjcyQ1x1OEE5RScsIEJyb3dzZXJTZWFyY2hFbmdpbmVJZC5CaW5nKSxcblx0XHRcdFx0YnVpbGRTZWFyY2hVcmwoJ2EmYj9jPWQnLCBCcm93c2VyU2VhcmNoRW5naW5lSWQuQmluZyksXG5cdFx0XHRcdGJ1aWxkU2VhcmNoVXJsKCd1bmtub3duc2NoZW1lOmZvbycsIEJyb3dzZXJTZWFyY2hFbmdpbmVJZC5CaW5nKSxcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdodHRwczovL3d3dy5iaW5nLmNvbS9zZWFyY2g/cT13aWtpJTJGcGFnZScsXG5cdFx0XHRcdCdodHRwczovL3d3dy5iaW5nLmNvbS9zZWFyY2g/cT13aGF0K2lzKzIlMkIyJyxcblx0XHRcdFx0J2h0dHBzOi8vd3d3LmJpbmcuY29tL3NlYXJjaD9xPWMlMjMnLFxuXHRcdFx0XHQnaHR0cHM6Ly93d3cuYmluZy5jb20vc2VhcmNoP3E9JUU2JTk3JUE1JUU2JTlDJUFDJUU4JUFBJTlFJyxcblx0XHRcdFx0J2h0dHBzOi8vd3d3LmJpbmcuY29tL3NlYXJjaD9xPWElMjZiJTNGYyUzRGQnLFxuXHRcdFx0XHQnaHR0cHM6Ly93d3cuYmluZy5jb20vc2VhcmNoP3E9dW5rbm93bnNjaGVtZSUzQWZvbycsXG5cdFx0XHRdLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Vua25vd24gZW5naW5lIGlkIGZhbGxzIGJhY2sgdG8gZGVmYXVsdCAoQmluZyknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0YnVpbGRTZWFyY2hVcmwoJ2NhdHMnLCAnbm9uZXhpc3RlbnQnIGFzIEJyb3dzZXJTZWFyY2hFbmdpbmVJZCksXG5cdFx0XHQnaHR0cHM6Ly93d3cuYmluZy5jb20vc2VhcmNoP3E9Y2F0cycsXG5cdFx0KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0Jyb3dzZXJTZWFyY2ggLSBnZXRCcm93c2VyU2VhcmNoRW5naW5lTGFiZWwnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JldHVybnMgdGhlIGVuZ2luZSBsYWJlbCwgZmFsbGluZyBiYWNrIHRvIGRlZmF1bHQgZm9yIHVua25vd24gaWRzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRbXG5cdFx0XHRcdGdldEJyb3dzZXJTZWFyY2hFbmdpbmVMYWJlbChCcm93c2VyU2VhcmNoRW5naW5lSWQuQmluZyksXG5cdFx0XHRcdGdldEJyb3dzZXJTZWFyY2hFbmdpbmVMYWJlbChCcm93c2VyU2VhcmNoRW5naW5lSWQuR29vZ2xlKSxcblx0XHRcdFx0Z2V0QnJvd3NlclNlYXJjaEVuZ2luZUxhYmVsKEJyb3dzZXJTZWFyY2hFbmdpbmVJZC5EdWNrRHVja0dvKSxcblx0XHRcdFx0Z2V0QnJvd3NlclNlYXJjaEVuZ2luZUxhYmVsKCdub25leGlzdGVudCcgYXMgQnJvd3NlclNlYXJjaEVuZ2luZUlkKSxcblx0XHRcdF0sXG5cdFx0XHRbJ0JpbmcnLCAnR29vZ2xlJywgJ0R1Y2tEdWNrR28nLCAnQmluZyddLFxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RDtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUNNO0FBRVAsTUFBTSwwQ0FBMEMsTUFBTTtBQUNyRCwwQ0FBd0M7QUFFeEMsT0FBSywrQkFBK0IsTUFBTTtBQUN6QyxVQUFNLFNBQVM7QUFBQSxNQUNkO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLElBQ0Q7QUFDQSxVQUFNLFNBQVMsT0FBTyxJQUFJLENBQUMsTUFBTSwyQkFBMkIsQ0FBQyxDQUFDO0FBQzlELFdBQU8sZ0JBQWdCLFFBQVEsT0FBTyxJQUFJLE1BQU0sS0FBSyxDQUFDO0FBQUEsRUFDdkQsQ0FBQztBQUVELE9BQUssc0NBQXNDLE1BQU07QUFDaEQsVUFBTSxTQUFTO0FBQUE7QUFBQSxNQUVkO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQTtBQUFBO0FBQUEsTUFHQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUE7QUFBQSxNQUVBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBO0FBQUEsTUFFQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBO0FBQUEsTUFFQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBO0FBQUEsTUFFQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBO0FBQUEsTUFFQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUE7QUFBQSxNQUVBO0FBQUEsTUFDQTtBQUFBO0FBQUEsTUFDQTtBQUFBO0FBQUEsTUFFQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BRUE7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQ0EsVUFBTSxTQUFTLE9BQU8sSUFBSSxDQUFDLE1BQU0sMkJBQTJCLENBQUMsQ0FBQztBQUM5RCxXQUFPLGdCQUFnQixRQUFRLE9BQU8sSUFBSSxNQUFNLEtBQUssQ0FBQztBQUFBLEVBQ3ZELENBQUM7QUFFRCxPQUFLLDJEQUEyRCxNQUFNO0FBQ3JFLFVBQU0sU0FBUztBQUFBLE1BQ2Q7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLElBQ0Q7QUFDQSxVQUFNLFNBQVMsT0FBTyxJQUFJLENBQUMsTUFBTSwyQkFBMkIsQ0FBQyxDQUFDO0FBQzlELFdBQU8sZ0JBQWdCLFFBQVEsT0FBTyxJQUFJLE1BQU0sT0FBTyxDQUFDO0FBQUEsRUFDekQsQ0FBQztBQUVELE9BQUssMEVBQTBFLE1BQU07QUFDcEYsVUFBTSxTQUFTO0FBQUEsTUFDZDtBQUFBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLElBQ0Q7QUFDQSxVQUFNLFNBQVMsT0FBTyxJQUFJLENBQUMsTUFBTSwyQkFBMkIsQ0FBQyxDQUFDO0FBQzlELFdBQU8sZ0JBQWdCLFFBQVEsT0FBTyxJQUFJLE1BQU0sS0FBSyxDQUFDO0FBQUEsRUFDdkQsQ0FBQztBQUVELE9BQUssOERBQThELE1BQU07QUFDeEUsVUFBTSxTQUFTO0FBQUEsTUFDZDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBLFVBQU0sU0FBUyxPQUFPLElBQUksQ0FBQyxNQUFNLDJCQUEyQixDQUFDLENBQUM7QUFDOUQsV0FBTyxnQkFBZ0IsUUFBUSxPQUFPLElBQUksTUFBTSxTQUFTLENBQUM7QUFBQSxFQUMzRCxDQUFDO0FBRUQsT0FBSyxvRUFBb0UsTUFBTTtBQUk5RSxVQUFNLFNBQVM7QUFBQSxNQUNkO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQSxVQUFNLFNBQVMsT0FBTyxJQUFJLENBQUMsTUFBTSwyQkFBMkIsQ0FBQyxDQUFDO0FBQzlELFdBQU8sZ0JBQWdCLFFBQVEsT0FBTyxJQUFJLE1BQU0sS0FBSyxDQUFDO0FBQUEsRUFDdkQsQ0FBQztBQUVELE9BQUsscUVBQXFFLE1BQU07QUFJL0UsVUFBTSxTQUFTO0FBQUEsTUFDZDtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBQ0EsVUFBTSxTQUFTLE9BQU8sSUFBSSxDQUFDLE1BQU0sMkJBQTJCLENBQUMsQ0FBQztBQUM5RCxXQUFPLGdCQUFnQixRQUFRLE9BQU8sSUFBSSxNQUFNLEtBQUssQ0FBQztBQUFBLEVBQ3ZELENBQUM7QUFFRCxPQUFLLG1DQUFtQyxNQUFNO0FBQzdDLFVBQU0sU0FBUztBQUFBLE1BQ2Q7QUFBQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLE1BQ0E7QUFBQTtBQUFBLElBQ0Q7QUFDQSxVQUFNLFNBQVMsT0FBTyxJQUFJLENBQUMsTUFBTSwyQkFBMkIsQ0FBQyxDQUFDO0FBQzlELFdBQU8sZ0JBQWdCLFFBQVEsT0FBTyxJQUFJLE1BQU0sU0FBUyxDQUFDO0FBQUEsRUFDM0QsQ0FBQztBQUVELE9BQUssMENBQTBDLE1BQU07QUFDcEQsV0FBTztBQUFBLE1BQ047QUFBQSxRQUNDLDJCQUEyQixnQkFBZ0I7QUFBQSxRQUMzQywyQkFBMkIsd0JBQXdCO0FBQUEsUUFDbkQsMkJBQTJCLG1CQUFvQjtBQUFBLE1BQ2hEO0FBQUEsTUFDQSxDQUFDLE9BQU8sT0FBTyxLQUFLO0FBQUEsSUFDckI7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDBDQUEwQyxNQUFNO0FBQ3BELFdBQU87QUFBQSxNQUNOO0FBQUEsUUFDQywyQkFBMkIsRUFBRTtBQUFBLFFBQzdCLDJCQUEyQixLQUFLO0FBQUEsUUFDaEMsMkJBQTJCLEtBQU07QUFBQSxNQUNsQztBQUFBLE1BQ0EsQ0FBQyxTQUFTLFNBQVMsT0FBTztBQUFBLElBQzNCO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyw4REFBOEQsTUFBTTtBQUN4RSxXQUFPO0FBQUEsTUFDTiwyQkFBMkIsdUJBQXVCO0FBQUEsTUFDbEQ7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyw2Q0FBNkMsTUFBTTtBQUN2RCxXQUFPO0FBQUEsTUFDTiwyQkFBMkIsa0JBQWtCO0FBQUEsTUFDN0M7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLE1BQ04sMkJBQTJCLHFCQUFxQjtBQUFBLE1BQ2hEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLGtDQUFrQyxNQUFNO0FBQzdDLDBDQUF3QztBQUV4QyxPQUFLLG1DQUFtQyxNQUFNO0FBQzdDLFVBQU0sUUFBUTtBQUNkLFVBQU0sU0FBUztBQUFBLE1BQ2Qsc0JBQXNCO0FBQUEsTUFDdEIsc0JBQXNCO0FBQUEsTUFDdEIsc0JBQXNCO0FBQUEsTUFDdEIsc0JBQXNCO0FBQUEsSUFDdkIsRUFBRSxJQUFJLENBQUMsV0FBVyxlQUFlLE9BQU8sTUFBTSxDQUFDO0FBQy9DLFdBQU8sZ0JBQWdCLFFBQVE7QUFBQSxNQUM5QjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMkNBQTJDLE1BQU07QUFDckQsV0FBTztBQUFBLE1BQ04sZUFBZSxxQkFBcUIsc0JBQXNCLElBQUk7QUFBQSxNQUM5RDtBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDhCQUE4QixNQUFNO0FBQ3hDLFdBQU87QUFBQSxNQUNOO0FBQUEsUUFDQyxlQUFlLGFBQWEsc0JBQXNCLElBQUk7QUFBQSxRQUN0RCxlQUFlLGVBQWUsc0JBQXNCLElBQUk7QUFBQSxRQUN4RCxlQUFlLE1BQU0sc0JBQXNCLElBQUk7QUFBQSxRQUMvQyxlQUFlLHNCQUFPLHNCQUFzQixJQUFJO0FBQUEsUUFDaEQsZUFBZSxXQUFXLHNCQUFzQixJQUFJO0FBQUEsUUFDcEQsZUFBZSxxQkFBcUIsc0JBQXNCLElBQUk7QUFBQSxNQUMvRDtBQUFBLE1BQ0E7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssa0RBQWtELE1BQU07QUFDNUQsV0FBTztBQUFBLE1BQ04sZUFBZSxRQUFRLGFBQXNDO0FBQUEsTUFDN0Q7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0sK0NBQStDLE1BQU07QUFDMUQsMENBQXdDO0FBRXhDLE9BQUsscUVBQXFFLE1BQU07QUFDL0UsV0FBTztBQUFBLE1BQ047QUFBQSxRQUNDLDRCQUE0QixzQkFBc0IsSUFBSTtBQUFBLFFBQ3RELDRCQUE0QixzQkFBc0IsTUFBTTtBQUFBLFFBQ3hELDRCQUE0QixzQkFBc0IsVUFBVTtBQUFBLFFBQzVELDRCQUE0QixhQUFzQztBQUFBLE1BQ25FO0FBQUEsTUFDQSxDQUFDLFFBQVEsVUFBVSxjQUFjLE1BQU07QUFBQSxJQUN4QztBQUFBLEVBQ0QsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
