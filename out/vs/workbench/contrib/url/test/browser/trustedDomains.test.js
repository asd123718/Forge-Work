import assert from "assert";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { isURLDomainTrusted } from "../../../../../platform/url/common/trustedDomains.js";
function linkAllowedByRules(link, rules) {
  assert.ok(isURLDomainTrusted(URI.parse(link), rules), `Link
${link}
 should be allowed by rules
${JSON.stringify(rules)}`);
}
function linkNotAllowedByRules(link, rules) {
  assert.ok(!isURLDomainTrusted(URI.parse(link), rules), `Link
${link}
 should NOT be allowed by rules
${JSON.stringify(rules)}`);
}
suite("Link protection domain matching", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("simple", () => {
    linkNotAllowedByRules("https://x.org", []);
    linkAllowedByRules("https://x.org", ["https://x.org"]);
    linkAllowedByRules("https://x.org/foo", ["https://x.org"]);
    linkNotAllowedByRules("https://x.org", ["http://x.org"]);
    linkNotAllowedByRules("http://x.org", ["https://x.org"]);
    linkNotAllowedByRules("https://www.x.org", ["https://x.org"]);
    linkAllowedByRules("https://www.x.org", ["https://www.x.org", "https://y.org"]);
  });
  test("localhost", () => {
    linkAllowedByRules("https://127.0.0.1", []);
    linkAllowedByRules("https://127.0.0.1:3000", []);
    linkAllowedByRules("https://localhost", []);
    linkAllowedByRules("https://localhost:3000", []);
    linkAllowedByRules("https://dev.localhost", []);
    linkAllowedByRules("https://dev.localhost:3000", []);
    linkAllowedByRules("https://app.localhost", []);
    linkAllowedByRules("https://api.localhost:8080", []);
    linkAllowedByRules("https://myapp.dev.localhost:8080", []);
  });
  test("* star", () => {
    linkAllowedByRules("https://a.x.org", ["https://*.x.org"]);
    linkAllowedByRules("https://a.b.x.org", ["https://*.x.org"]);
  });
  test("no scheme", () => {
    linkAllowedByRules("https://a.x.org", ["a.x.org"]);
    linkAllowedByRules("https://a.x.org", ["*.x.org"]);
    linkAllowedByRules("https://a.b.x.org", ["*.x.org"]);
    linkAllowedByRules("https://x.org", ["*.x.org"]);
    linkAllowedByRules("https://x.org:3000", ["*.x.org:3000"]);
  });
  test("sub paths", () => {
    linkAllowedByRules("https://x.org/foo", ["https://x.org/foo"]);
    linkAllowedByRules("https://x.org/foo/bar", ["https://x.org/foo"]);
    linkAllowedByRules("https://x.org/foo", ["https://x.org/foo/"]);
    linkAllowedByRules("https://x.org/foo/bar", ["https://x.org/foo/"]);
    linkAllowedByRules("https://x.org/foo", ["x.org/foo"]);
    linkAllowedByRules("https://x.org/foo", ["*.org/foo"]);
    linkNotAllowedByRules("https://x.org/bar", ["https://x.org/foo"]);
    linkNotAllowedByRules("https://x.org/bar", ["x.org/foo"]);
    linkNotAllowedByRules("https://x.org/bar", ["*.org/foo"]);
    linkAllowedByRules("https://x.org/foo/bar", ["https://x.org/foo"]);
    linkNotAllowedByRules("https://x.org/foo2", ["https://x.org/foo"]);
    linkNotAllowedByRules("https://www.x.org/foo", ["https://x.org/foo"]);
    linkNotAllowedByRules("https://a.x.org/bar", ["https://*.x.org/foo"]);
    linkNotAllowedByRules("https://a.b.x.org/bar", ["https://*.x.org/foo"]);
    linkAllowedByRules("https://github.com", ["https://github.com/foo/bar", "https://github.com"]);
  });
  test("ports", () => {
    linkNotAllowedByRules("https://x.org:8080/foo/bar", ["https://x.org:8081/foo"]);
    linkAllowedByRules("https://x.org:8080/foo/bar", ["https://x.org:*/foo"]);
    linkAllowedByRules("https://x.org/foo/bar", ["https://x.org:*/foo"]);
    linkAllowedByRules("https://x.org:8080/foo/bar", ["https://x.org:8080/foo"]);
  });
  test("ip addresses", () => {
    linkAllowedByRules("http://192.168.1.7/", ["http://192.168.1.7/"]);
    linkAllowedByRules("http://192.168.1.7/", ["http://192.168.1.7"]);
    linkAllowedByRules("http://192.168.1.7/", ["http://192.168.1.*"]);
    linkNotAllowedByRules("http://192.168.1.7:3000/", ["http://192.168.*.6:*"]);
    linkAllowedByRules("http://192.168.1.7:3000/", ["http://192.168.1.7:3000/"]);
    linkAllowedByRules("http://192.168.1.7:3000/", ["http://192.168.1.7:*"]);
    linkAllowedByRules("http://192.168.1.7:3000/", ["http://192.168.1.*:*"]);
    linkNotAllowedByRules("http://192.168.1.7:3000/", ["http://192.168.*.6:*"]);
  });
  test("scheme match", () => {
    linkAllowedByRules("http://192.168.1.7/", ["http://*"]);
    linkAllowedByRules("http://twitter.com", ["http://*"]);
    linkAllowedByRules("http://twitter.com/hello", ["http://*"]);
    linkNotAllowedByRules("https://192.168.1.7/", ["http://*"]);
    linkNotAllowedByRules("https://twitter.com/", ["http://*"]);
  });
  test("case normalization", () => {
    linkAllowedByRules("https://github.com/microsoft/vscode/issues/new", ["https://github.com/microsoft"]);
    linkAllowedByRules("https://github.com/microsoft/vscode/issues/new", ["https://github.com/microsoft"]);
  });
  test("ignore query & fragment - https://github.com/microsoft/vscode/issues/156839", () => {
    linkAllowedByRules("https://github.com/login/oauth/authorize?foo=4", ["https://github.com/login/oauth/authorize"]);
    linkAllowedByRules("https://github.com/login/oauth/authorize#foo", ["https://github.com/login/oauth/authorize"]);
  });
  test("ensure individual parts of url are compared and wildcard does not leak out", () => {
    linkNotAllowedByRules("https://x.org/github.com", ["https://*.github.com"]);
    linkNotAllowedByRules("https://x.org/y.github.com", ["https://*.github.com"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHVybFxcdGVzdFxcYnJvd3NlclxcdHJ1c3RlZERvbWFpbnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcblxuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgaXNVUkxEb21haW5UcnVzdGVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJsL2NvbW1vbi90cnVzdGVkRG9tYWlucy5qcyc7XG5cbmZ1bmN0aW9uIGxpbmtBbGxvd2VkQnlSdWxlcyhsaW5rOiBzdHJpbmcsIHJ1bGVzOiBzdHJpbmdbXSkge1xuXHRhc3NlcnQub2soaXNVUkxEb21haW5UcnVzdGVkKFVSSS5wYXJzZShsaW5rKSwgcnVsZXMpLCBgTGlua1xcbiR7bGlua31cXG4gc2hvdWxkIGJlIGFsbG93ZWQgYnkgcnVsZXNcXG4ke0pTT04uc3RyaW5naWZ5KHJ1bGVzKX1gKTtcbn1cbmZ1bmN0aW9uIGxpbmtOb3RBbGxvd2VkQnlSdWxlcyhsaW5rOiBzdHJpbmcsIHJ1bGVzOiBzdHJpbmdbXSkge1xuXHRhc3NlcnQub2soIWlzVVJMRG9tYWluVHJ1c3RlZChVUkkucGFyc2UobGluayksIHJ1bGVzKSwgYExpbmtcXG4ke2xpbmt9XFxuIHNob3VsZCBOT1QgYmUgYWxsb3dlZCBieSBydWxlc1xcbiR7SlNPTi5zdHJpbmdpZnkocnVsZXMpfWApO1xufVxuXG5zdWl0ZSgnTGluayBwcm90ZWN0aW9uIGRvbWFpbiBtYXRjaGluZycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdHRlc3QoJ3NpbXBsZScsICgpID0+IHtcblx0XHRsaW5rTm90QWxsb3dlZEJ5UnVsZXMoJ2h0dHBzOi8veC5vcmcnLCBbXSk7XG5cblx0XHRsaW5rQWxsb3dlZEJ5UnVsZXMoJ2h0dHBzOi8veC5vcmcnLCBbJ2h0dHBzOi8veC5vcmcnXSk7XG5cdFx0bGlua0FsbG93ZWRCeVJ1bGVzKCdodHRwczovL3gub3JnL2ZvbycsIFsnaHR0cHM6Ly94Lm9yZyddKTtcblxuXHRcdGxpbmtOb3RBbGxvd2VkQnlSdWxlcygnaHR0cHM6Ly94Lm9yZycsIFsnaHR0cDovL3gub3JnJ10pO1xuXHRcdGxpbmtOb3RBbGxvd2VkQnlSdWxlcygnaHR0cDovL3gub3JnJywgWydodHRwczovL3gub3JnJ10pO1xuXG5cdFx0bGlua05vdEFsbG93ZWRCeVJ1bGVzKCdodHRwczovL3d3dy54Lm9yZycsIFsnaHR0cHM6Ly94Lm9yZyddKTtcblxuXHRcdGxpbmtBbGxvd2VkQnlSdWxlcygnaHR0cHM6Ly93d3cueC5vcmcnLCBbJ2h0dHBzOi8vd3d3Lngub3JnJywgJ2h0dHBzOi8veS5vcmcnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvY2FsaG9zdCcsICgpID0+IHtcblx0XHRsaW5rQWxsb3dlZEJ5UnVsZXMoJ2h0dHBzOi8vMTI3LjAuMC4xJywgW10pO1xuXHRcdGxpbmtBbGxvd2VkQnlSdWxlcygnaHR0cHM6Ly8xMjcuMC4wLjE6MzAwMCcsIFtdKTtcblx0XHRsaW5rQWxsb3dlZEJ5UnVsZXMoJ2h0dHBzOi8vbG9jYWxob3N0JywgW10pO1xuXHRcdGxpbmtBbGxvd2VkQnlSdWxlcygnaHR0cHM6Ly9sb2NhbGhvc3Q6MzAwMCcsIFtdKTtcblx0XHRsaW5rQWxsb3dlZEJ5UnVsZXMoJ2h0dHBzOi8vZGV2LmxvY2FsaG9zdCcsIFtdKTtcblx0XHRsaW5rQWxsb3dlZEJ5UnVsZXMoJ2h0dHBzOi8vZGV2LmxvY2FsaG9zdDozMDAwJywgW10pO1xuXHRcdGxpbmtBbGxvd2VkQnlSdWxlcygnaHR0cHM6Ly9hcHAubG9jYWxob3N0JywgW10pO1xuXHRcdGxpbmtBbGxvd2VkQnlSdWxlcygnaHR0cHM6Ly9hcGkubG9jYWxob3N0OjgwODAnLCBbXSk7XG5cdFx0bGlua0FsbG93ZWRCeVJ1bGVzKCdodHRwczovL215YXBwLmRldi5sb2NhbGhvc3Q6ODA4MCcsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnKiBzdGFyJywgKCkgPT4ge1xuXHRcdGxpbmtBbGxvd2VkQnlSdWxlcygnaHR0cHM6Ly9hLngub3JnJywgWydodHRwczovLyoueC5vcmcnXSk7XG5cdFx0bGlua0FsbG93ZWRCeVJ1bGVzKCdodHRwczovL2EuYi54Lm9yZycsIFsnaHR0cHM6Ly8qLngub3JnJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdubyBzY2hlbWUnLCAoKSA9PiB7XG5cdFx0bGlua0FsbG93ZWRCeVJ1bGVzKCdodHRwczovL2EueC5vcmcnLCBbJ2EueC5vcmcnXSk7XG5cdFx0bGlua0FsbG93ZWRCeVJ1bGVzKCdodHRwczovL2EueC5vcmcnLCBbJyoueC5vcmcnXSk7XG5cdFx0bGlua0FsbG93ZWRCeVJ1bGVzKCdodHRwczovL2EuYi54Lm9yZycsIFsnKi54Lm9yZyddKTtcblx0XHRsaW5rQWxsb3dlZEJ5UnVsZXMoJ2h0dHBzOi8veC5vcmcnLCBbJyoueC5vcmcnXSk7XG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI0OTM1M1xuXHRcdGxpbmtBbGxvd2VkQnlSdWxlcygnaHR0cHM6Ly94Lm9yZzozMDAwJywgWycqLngub3JnOjMwMDAnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1YiBwYXRocycsICgpID0+IHtcblx0XHRsaW5rQWxsb3dlZEJ5UnVsZXMoJ2h0dHBzOi8veC5vcmcvZm9vJywgWydodHRwczovL3gub3JnL2ZvbyddKTtcblx0XHRsaW5rQWxsb3dlZEJ5UnVsZXMoJ2h0dHBzOi8veC5vcmcvZm9vL2JhcicsIFsnaHR0cHM6Ly94Lm9yZy9mb28nXSk7XG5cblx0XHRsaW5rQWxsb3dlZEJ5UnVsZXMoJ2h0dHBzOi8veC5vcmcvZm9vJywgWydodHRwczovL3gub3JnL2Zvby8nXSk7XG5cdFx0bGlua0FsbG93ZWRCeVJ1bGVzKCdodHRwczovL3gub3JnL2Zvby9iYXInLCBbJ2h0dHBzOi8veC5vcmcvZm9vLyddKTtcblxuXHRcdGxpbmtBbGxvd2VkQnlSdWxlcygnaHR0cHM6Ly94Lm9yZy9mb28nLCBbJ3gub3JnL2ZvbyddKTtcblx0XHRsaW5rQWxsb3dlZEJ5UnVsZXMoJ2h0dHBzOi8veC5vcmcvZm9vJywgWycqLm9yZy9mb28nXSk7XG5cblx0XHRsaW5rTm90QWxsb3dlZEJ5UnVsZXMoJ2h0dHBzOi8veC5vcmcvYmFyJywgWydodHRwczovL3gub3JnL2ZvbyddKTtcblx0XHRsaW5rTm90QWxsb3dlZEJ5UnVsZXMoJ2h0dHBzOi8veC5vcmcvYmFyJywgWyd4Lm9yZy9mb28nXSk7XG5cdFx0bGlua05vdEFsbG93ZWRCeVJ1bGVzKCdodHRwczovL3gub3JnL2JhcicsIFsnKi5vcmcvZm9vJ10pO1xuXG5cdFx0bGlua0FsbG93ZWRCeVJ1bGVzKCdodHRwczovL3gub3JnL2Zvby9iYXInLCBbJ2h0dHBzOi8veC5vcmcvZm9vJ10pO1xuXHRcdGxpbmtOb3RBbGxvd2VkQnlSdWxlcygnaHR0cHM6Ly94Lm9yZy9mb28yJywgWydodHRwczovL3gub3JnL2ZvbyddKTtcblxuXHRcdGxpbmtOb3RBbGxvd2VkQnlSdWxlcygnaHR0cHM6Ly93d3cueC5vcmcvZm9vJywgWydodHRwczovL3gub3JnL2ZvbyddKTtcblxuXHRcdGxpbmtOb3RBbGxvd2VkQnlSdWxlcygnaHR0cHM6Ly9hLngub3JnL2JhcicsIFsnaHR0cHM6Ly8qLngub3JnL2ZvbyddKTtcblx0XHRsaW5rTm90QWxsb3dlZEJ5UnVsZXMoJ2h0dHBzOi8vYS5iLngub3JnL2JhcicsIFsnaHR0cHM6Ly8qLngub3JnL2ZvbyddKTtcblxuXHRcdGxpbmtBbGxvd2VkQnlSdWxlcygnaHR0cHM6Ly9naXRodWIuY29tJywgWydodHRwczovL2dpdGh1Yi5jb20vZm9vL2JhcicsICdodHRwczovL2dpdGh1Yi5jb20nXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BvcnRzJywgKCkgPT4ge1xuXHRcdGxpbmtOb3RBbGxvd2VkQnlSdWxlcygnaHR0cHM6Ly94Lm9yZzo4MDgwL2Zvby9iYXInLCBbJ2h0dHBzOi8veC5vcmc6ODA4MS9mb28nXSk7XG5cdFx0bGlua0FsbG93ZWRCeVJ1bGVzKCdodHRwczovL3gub3JnOjgwODAvZm9vL2JhcicsIFsnaHR0cHM6Ly94Lm9yZzoqL2ZvbyddKTtcblx0XHRsaW5rQWxsb3dlZEJ5UnVsZXMoJ2h0dHBzOi8veC5vcmcvZm9vL2JhcicsIFsnaHR0cHM6Ly94Lm9yZzoqL2ZvbyddKTtcblx0XHRsaW5rQWxsb3dlZEJ5UnVsZXMoJ2h0dHBzOi8veC5vcmc6ODA4MC9mb28vYmFyJywgWydodHRwczovL3gub3JnOjgwODAvZm9vJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdpcCBhZGRyZXNzZXMnLCAoKSA9PiB7XG5cdFx0bGlua0FsbG93ZWRCeVJ1bGVzKCdodHRwOi8vMTkyLjE2OC4xLjcvJywgWydodHRwOi8vMTkyLjE2OC4xLjcvJ10pO1xuXHRcdGxpbmtBbGxvd2VkQnlSdWxlcygnaHR0cDovLzE5Mi4xNjguMS43LycsIFsnaHR0cDovLzE5Mi4xNjguMS43J10pO1xuXHRcdGxpbmtBbGxvd2VkQnlSdWxlcygnaHR0cDovLzE5Mi4xNjguMS43LycsIFsnaHR0cDovLzE5Mi4xNjguMS4qJ10pO1xuXG5cdFx0bGlua05vdEFsbG93ZWRCeVJ1bGVzKCdodHRwOi8vMTkyLjE2OC4xLjc6MzAwMC8nLCBbJ2h0dHA6Ly8xOTIuMTY4LiouNjoqJ10pO1xuXHRcdGxpbmtBbGxvd2VkQnlSdWxlcygnaHR0cDovLzE5Mi4xNjguMS43OjMwMDAvJywgWydodHRwOi8vMTkyLjE2OC4xLjc6MzAwMC8nXSk7XG5cdFx0bGlua0FsbG93ZWRCeVJ1bGVzKCdodHRwOi8vMTkyLjE2OC4xLjc6MzAwMC8nLCBbJ2h0dHA6Ly8xOTIuMTY4LjEuNzoqJ10pO1xuXHRcdGxpbmtBbGxvd2VkQnlSdWxlcygnaHR0cDovLzE5Mi4xNjguMS43OjMwMDAvJywgWydodHRwOi8vMTkyLjE2OC4xLio6KiddKTtcblx0XHRsaW5rTm90QWxsb3dlZEJ5UnVsZXMoJ2h0dHA6Ly8xOTIuMTY4LjEuNzozMDAwLycsIFsnaHR0cDovLzE5Mi4xNjguKi42OionXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NjaGVtZSBtYXRjaCcsICgpID0+IHtcblx0XHRsaW5rQWxsb3dlZEJ5UnVsZXMoJ2h0dHA6Ly8xOTIuMTY4LjEuNy8nLCBbJ2h0dHA6Ly8qJ10pO1xuXHRcdGxpbmtBbGxvd2VkQnlSdWxlcygnaHR0cDovL3R3aXR0ZXIuY29tJywgWydodHRwOi8vKiddKTtcblx0XHRsaW5rQWxsb3dlZEJ5UnVsZXMoJ2h0dHA6Ly90d2l0dGVyLmNvbS9oZWxsbycsIFsnaHR0cDovLyonXSk7XG5cdFx0bGlua05vdEFsbG93ZWRCeVJ1bGVzKCdodHRwczovLzE5Mi4xNjguMS43LycsIFsnaHR0cDovLyonXSk7XG5cdFx0bGlua05vdEFsbG93ZWRCeVJ1bGVzKCdodHRwczovL3R3aXR0ZXIuY29tLycsIFsnaHR0cDovLyonXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nhc2Ugbm9ybWFsaXphdGlvbicsICgpID0+IHtcblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvOTkyOTRcblx0XHRsaW5rQWxsb3dlZEJ5UnVsZXMoJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy9uZXcnLCBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQnXSk7XG5cdFx0bGlua0FsbG93ZWRCeVJ1bGVzKCdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvbmV3JywgWydodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0J10pO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmUgcXVlcnkgJiBmcmFnbWVudCAtIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNTY4MzknLCAoKSA9PiB7XG5cdFx0bGlua0FsbG93ZWRCeVJ1bGVzKCdodHRwczovL2dpdGh1Yi5jb20vbG9naW4vb2F1dGgvYXV0aG9yaXplP2Zvbz00JywgWydodHRwczovL2dpdGh1Yi5jb20vbG9naW4vb2F1dGgvYXV0aG9yaXplJ10pO1xuXHRcdGxpbmtBbGxvd2VkQnlSdWxlcygnaHR0cHM6Ly9naXRodWIuY29tL2xvZ2luL29hdXRoL2F1dGhvcml6ZSNmb28nLCBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9sb2dpbi9vYXV0aC9hdXRob3JpemUnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Vuc3VyZSBpbmRpdmlkdWFsIHBhcnRzIG9mIHVybCBhcmUgY29tcGFyZWQgYW5kIHdpbGRjYXJkIGRvZXMgbm90IGxlYWsgb3V0JywgKCkgPT4ge1xuXHRcdGxpbmtOb3RBbGxvd2VkQnlSdWxlcygnaHR0cHM6Ly94Lm9yZy9naXRodWIuY29tJywgWydodHRwczovLyouZ2l0aHViLmNvbSddKTtcblx0XHRsaW5rTm90QWxsb3dlZEJ5UnVsZXMoJ2h0dHBzOi8veC5vcmcveS5naXRodWIuY29tJywgWydodHRwczovLyouZ2l0aHViLmNvbSddKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywwQkFBMEI7QUFFbkMsU0FBUyxtQkFBbUIsTUFBYyxPQUFpQjtBQUMxRCxTQUFPLEdBQUcsbUJBQW1CLElBQUksTUFBTSxJQUFJLEdBQUcsS0FBSyxHQUFHO0FBQUEsRUFBUyxJQUFJO0FBQUE7QUFBQSxFQUFrQyxLQUFLLFVBQVUsS0FBSyxDQUFDLEVBQUU7QUFDN0g7QUFDQSxTQUFTLHNCQUFzQixNQUFjLE9BQWlCO0FBQzdELFNBQU8sR0FBRyxDQUFDLG1CQUFtQixJQUFJLE1BQU0sSUFBSSxHQUFHLEtBQUssR0FBRztBQUFBLEVBQVMsSUFBSTtBQUFBO0FBQUEsRUFBc0MsS0FBSyxVQUFVLEtBQUssQ0FBQyxFQUFFO0FBQ2xJO0FBRUEsTUFBTSxtQ0FBbUMsTUFBTTtBQUM5QywwQ0FBd0M7QUFDeEMsT0FBSyxVQUFVLE1BQU07QUFDcEIsMEJBQXNCLGlCQUFpQixDQUFDLENBQUM7QUFFekMsdUJBQW1CLGlCQUFpQixDQUFDLGVBQWUsQ0FBQztBQUNyRCx1QkFBbUIscUJBQXFCLENBQUMsZUFBZSxDQUFDO0FBRXpELDBCQUFzQixpQkFBaUIsQ0FBQyxjQUFjLENBQUM7QUFDdkQsMEJBQXNCLGdCQUFnQixDQUFDLGVBQWUsQ0FBQztBQUV2RCwwQkFBc0IscUJBQXFCLENBQUMsZUFBZSxDQUFDO0FBRTVELHVCQUFtQixxQkFBcUIsQ0FBQyxxQkFBcUIsZUFBZSxDQUFDO0FBQUEsRUFDL0UsQ0FBQztBQUVELE9BQUssYUFBYSxNQUFNO0FBQ3ZCLHVCQUFtQixxQkFBcUIsQ0FBQyxDQUFDO0FBQzFDLHVCQUFtQiwwQkFBMEIsQ0FBQyxDQUFDO0FBQy9DLHVCQUFtQixxQkFBcUIsQ0FBQyxDQUFDO0FBQzFDLHVCQUFtQiwwQkFBMEIsQ0FBQyxD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
