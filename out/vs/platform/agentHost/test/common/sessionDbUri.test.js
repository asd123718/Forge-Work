import assert from "assert";
import { encodeHex, VSBuffer } from "../../../../base/common/buffer.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { buildSessionDbUri, canonicalizeSessionDbUri, parseSessionDbUri } from "../../common/sessionDbUri.js";
const hex = (value) => encodeHex(VSBuffer.fromString(value)).toString();
function legacyUri(sessionUri, toolCallId, filePath, part, name) {
  return URI.from({
    scheme: "session-db",
    authority: hex(sessionUri),
    path: `/${toolCallId}/${hex(filePath)}/${part}/${name}`
  });
}
suite("buildSessionDbUri / parseSessionDbUri", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("round-trips a simple URI", () => {
    const uri = buildSessionDbUri("copilot:/abc-123", "tc-1", "/workspace/file.ts", "before");
    const parsed = parseSessionDbUri(uri);
    assert.ok(parsed);
    assert.deepStrictEqual(parsed, {
      sessionUri: "copilot:/abc-123",
      toolCallId: "tc-1",
      filePath: "/workspace/file.ts",
      part: "before"
    });
  });
  test("round-trips with special characters in filePath", () => {
    const uri = buildSessionDbUri("copilot:/s1", "tc-2", "/work space/file (1).ts", "after");
    const parsed = parseSessionDbUri(uri);
    assert.ok(parsed);
    assert.strictEqual(parsed.filePath, "/work space/file (1).ts");
    assert.strictEqual(parsed.part, "after");
  });
  test("round-trips a streaming preview revision", () => {
    const parsed = parseSessionDbUri(buildSessionDbUri("codex:/s1", "tc-live", "/workspace/live.ts", "after", 7));
    assert.strictEqual(parsed?.revision, 7);
  });
  test("round-trips with special characters in toolCallId", () => {
    const uri = buildSessionDbUri("copilot:/s1", "call_abc=123&x", "/file.ts", "before");
    const parsed = parseSessionDbUri(uri);
    assert.ok(parsed);
    assert.strictEqual(parsed.toolCallId, "call_abc=123&x");
  });
  test("round-trips a backslashed Windows filePath, which the database lookup needs verbatim", () => {
    const filePath = "C:\\Code\\vscode\\src\\vs\\file.ts";
    const parsed = parseSessionDbUri(buildSessionDbUri("copilot:/s1", "tc-1", filePath, "before"));
    assert.ok(parsed);
    assert.strictEqual(parsed.filePath, filePath);
  });
  test("parseSessionDbUri returns undefined for non-session-db URIs", () => {
    assert.strictEqual(parseSessionDbUri("file:///foo/bar"), void 0);
    assert.strictEqual(parseSessionDbUri("https://example.com"), void 0);
  });
  test("parseSessionDbUri returns undefined for malformed session-db URIs", () => {
    assert.strictEqual(parseSessionDbUri("session-db:copilot:/s1"), void 0);
    assert.strictEqual(parseSessionDbUri("session-db:copilot:/s1?toolCallId=tc-1"), void 0);
    assert.strictEqual(parseSessionDbUri("session-db:copilot:/s1?toolCallId=tc-1&filePath=/f&part=middle"), void 0);
  });
  test("parseSessionDbUri returns undefined for JSON queries that are not objects", () => {
    const queries = ["null", "123", '"a string"', "true", "[]"];
    assert.deepStrictEqual(
      queries.map((query) => parseSessionDbUri(`session-db:/f.ts?${encodeURIComponent(query)}`)),
      queries.map(() => void 0)
    );
  });
  test("parseSessionDbUri rejects empty lookup keys, which would hit the database", () => {
    const withField = (field) => `session-db:/f.ts?${encodeURIComponent(JSON.stringify({ sessionUri: "s", toolCallId: "t", filePath: "/f.ts", part: "before", ...field }))}`;
    assert.deepStrictEqual([
      parseSessionDbUri(withField({ sessionUri: "" })),
      parseSessionDbUri(withField({ toolCallId: "" })),
      parseSessionDbUri(withField({ filePath: "" }))
    ], [void 0, void 0, void 0]);
  });
  test("URI path is the file path, so labels show a real path", () => {
    const uri = buildSessionDbUri("copilot:/s1", "tc-1", "/workspace/src/index.ts", "before");
    assert.strictEqual(URI.parse(uri).path, "/workspace/src/index.ts");
  });
  test("URI path is the file path for files with spaces and special chars", () => {
    const uri = buildSessionDbUri("copilot:/s1", "tc-1", "/work space/file (1).ts", "after");
    assert.strictEqual(URI.parse(uri).path, "/work space/file (1).ts");
  });
  test("parses the legacy hex-encoded layout", () => {
    const legacy = legacyUri("copilot:/abc-123", "tc-1", "/workspace/file.ts", "before", "file.ts").toString();
    assert.deepStrictEqual(parseSessionDbUri(legacy), {
      sessionUri: "copilot:/abc-123",
      toolCallId: "tc-1",
      filePath: "/workspace/file.ts",
      part: "before"
    });
  });
});
suite("canonicalizeSessionDbUri", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("rewrites a legacy URI into the current layout", () => {
    const legacy = legacyUri("copilot:/abc-123", "call_1", "/workspace/file.ts", "before", "file.ts");
    const canonical = canonicalizeSessionDbUri(legacy, URI.file("/workspace/file.ts"));
    assert.deepStrictEqual(
      [canonical.path, parseSessionDbUri(canonical.toString())],
      ["/workspace/file.ts", { sessionUri: "copilot:/abc-123", toolCallId: "call_1", filePath: "/workspace/file.ts", part: "before" }]
    );
  });
  test("takes the path from the file URI, so a Windows session canonicalizes the same way on any client", () => {
    const legacy = legacyUri("copilot:/abc-123", "call_1", "C:\\Code\\repo\\file.ts", "before", "file.ts");
    const canonical = canonicalizeSessionDbUri(legacy, URI.parse("file:///c%3A/Code/repo/file.ts"));
    assert.deepStrictEqual(
      [canonical.path, parseSessionDbUri(canonical.toString())?.filePath],
      ["/c:/Code/repo/file.ts", "C:\\Code\\repo\\file.ts"]
    );
  });
  test("leaves canonical, unparseable and foreign URIs untouched", () => {
    const canonical = URI.parse(buildSessionDbUri("copilot:/s1", "tc-1", "/workspace/file.ts", "before"));
    const unparseable = URI.from({ scheme: "session-db", path: "/nonsense" });
    const foreign = URI.file("/workspace/file.ts");
    const fileUri = URI.file("/workspace/file.ts");
    assert.deepStrictEqual(
      [canonical, unparseable, foreign].map((uri) => canonicalizeSessionDbUri(uri, fileUri).toString()),
      [canonical.toString(), unparseable.toString(), foreign.toString()]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxjb21tb25cXHNlc3Npb25EYlVyaS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5jb2RlSGV4LCBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBidWlsZFNlc3Npb25EYlVyaSwgY2Fub25pY2FsaXplU2Vzc2lvbkRiVXJpLCBwYXJzZVNlc3Npb25EYlVyaSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uRGJVcmkuanMnO1xuXG5jb25zdCBoZXggPSAodmFsdWU6IHN0cmluZykgPT4gZW5jb2RlSGV4KFZTQnVmZmVyLmZyb21TdHJpbmcodmFsdWUpKS50b1N0cmluZygpO1xuXG5mdW5jdGlvbiBsZWdhY3lVcmkoc2Vzc2lvblVyaTogc3RyaW5nLCB0b29sQ2FsbElkOiBzdHJpbmcsIGZpbGVQYXRoOiBzdHJpbmcsIHBhcnQ6IHN0cmluZywgbmFtZTogc3RyaW5nKTogVVJJIHtcblx0cmV0dXJuIFVSSS5mcm9tKHtcblx0XHRzY2hlbWU6ICdzZXNzaW9uLWRiJyxcblx0XHRhdXRob3JpdHk6IGhleChzZXNzaW9uVXJpKSxcblx0XHRwYXRoOiBgLyR7dG9vbENhbGxJZH0vJHtoZXgoZmlsZVBhdGgpfS8ke3BhcnR9LyR7bmFtZX1gLFxuXHR9KTtcbn1cblxuc3VpdGUoJ2J1aWxkU2Vzc2lvbkRiVXJpIC8gcGFyc2VTZXNzaW9uRGJVcmknLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncm91bmQtdHJpcHMgYSBzaW1wbGUgVVJJJywgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IGJ1aWxkU2Vzc2lvbkRiVXJpKCdjb3BpbG90Oi9hYmMtMTIzJywgJ3RjLTEnLCAnL3dvcmtzcGFjZS9maWxlLnRzJywgJ2JlZm9yZScpO1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlU2Vzc2lvbkRiVXJpKHVyaSk7XG5cdFx0YXNzZXJ0Lm9rKHBhcnNlZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQsIHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9hYmMtMTIzJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9maWxlLnRzJyxcblx0XHRcdHBhcnQ6ICdiZWZvcmUnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyb3VuZC10cmlwcyB3aXRoIHNwZWNpYWwgY2hhcmFjdGVycyBpbiBmaWxlUGF0aCcsICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBidWlsZFNlc3Npb25EYlVyaSgnY29waWxvdDovczEnLCAndGMtMicsICcvd29yayBzcGFjZS9maWxlICgxKS50cycsICdhZnRlcicpO1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlU2Vzc2lvbkRiVXJpKHVyaSk7XG5cdFx0YXNzZXJ0Lm9rKHBhcnNlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC5maWxlUGF0aCwgJy93b3JrIHNwYWNlL2ZpbGUgKDEpLnRzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC5wYXJ0LCAnYWZ0ZXInKTtcblx0fSk7XG5cblx0dGVzdCgncm91bmQtdHJpcHMgYSBzdHJlYW1pbmcgcHJldmlldyByZXZpc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZVNlc3Npb25EYlVyaShidWlsZFNlc3Npb25EYlVyaSgnY29kZXg6L3MxJywgJ3RjLWxpdmUnLCAnL3dvcmtzcGFjZS9saXZlLnRzJywgJ2FmdGVyJywgNykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWQ/LnJldmlzaW9uLCA3KTtcblx0fSk7XG5cblx0dGVzdCgncm91bmQtdHJpcHMgd2l0aCBzcGVjaWFsIGNoYXJhY3RlcnMgaW4gdG9vbENhbGxJZCcsICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBidWlsZFNlc3Npb25EYlVyaSgnY29waWxvdDovczEnLCAnY2FsbF9hYmM9MTIzJngnLCAnL2ZpbGUudHMnLCAnYmVmb3JlJyk7XG5cdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VTZXNzaW9uRGJVcmkodXJpKTtcblx0XHRhc3NlcnQub2socGFyc2VkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLnRvb2xDYWxsSWQsICdjYWxsX2FiYz0xMjMmeCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyb3VuZC10cmlwcyBhIGJhY2tzbGFzaGVkIFdpbmRvd3MgZmlsZVBhdGgsIHdoaWNoIHRoZSBkYXRhYmFzZSBsb29rdXAgbmVlZHMgdmVyYmF0aW0nLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVBhdGggPSAnQzpcXFxcQ29kZVxcXFx2c2NvZGVcXFxcc3JjXFxcXHZzXFxcXGZpbGUudHMnO1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlU2Vzc2lvbkRiVXJpKGJ1aWxkU2Vzc2lvbkRiVXJpKCdjb3BpbG90Oi9zMScsICd0Yy0xJywgZmlsZVBhdGgsICdiZWZvcmUnKSk7XG5cdFx0YXNzZXJ0Lm9rKHBhcnNlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC5maWxlUGF0aCwgZmlsZVBhdGgpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZVNlc3Npb25EYlVyaSByZXR1cm5zIHVuZGVmaW5lZCBmb3Igbm9uLXNlc3Npb24tZGIgVVJJcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VTZXNzaW9uRGJVcmkoJ2ZpbGU6Ly8vZm9vL2JhcicpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZVNlc3Npb25EYlVyaSgnaHR0cHM6Ly9leGFtcGxlLmNvbScpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZVNlc3Npb25EYlVyaSByZXR1cm5zIHVuZGVmaW5lZCBmb3IgbWFsZm9ybWVkIHNlc3Npb24tZGIgVVJJcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VTZXNzaW9uRGJVcmkoJ3Nlc3Npb24tZGI6Y29waWxvdDovczEnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VTZXNzaW9uRGJVcmkoJ3Nlc3Npb24tZGI6Y29waWxvdDovczE/dG9vbENhbGxJZD10Yy0xJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlU2Vzc2lvbkRiVXJpKCdzZXNzaW9uLWRiOmNvcGlsb3Q6L3MxP3Rvb2xDYWxsSWQ9dGMtMSZmaWxlUGF0aD0vZiZwYXJ0PW1pZGRsZScpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZVNlc3Npb25EYlVyaSByZXR1cm5zIHVuZGVmaW5lZCBmb3IgSlNPTiBxdWVyaWVzIHRoYXQgYXJlIG5vdCBvYmplY3RzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHF1ZXJpZXMgPSBbJ251bGwnLCAnMTIzJywgJ1wiYSBzdHJpbmdcIicsICd0cnVlJywgJ1tdJ107XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHF1ZXJpZXMubWFwKHF1ZXJ5ID0+IHBhcnNlU2Vzc2lvbkRiVXJpKGBzZXNzaW9uLWRiOi9mLnRzPyR7ZW5jb2RlVVJJQ29tcG9uZW50KHF1ZXJ5KX1gKSksXG5cdFx0XHRxdWVyaWVzLm1hcCgoKSA9PiB1bmRlZmluZWQpLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlU2Vzc2lvbkRiVXJpIHJlamVjdHMgZW1wdHkgbG9va3VwIGtleXMsIHdoaWNoIHdvdWxkIGhpdCB0aGUgZGF0YWJhc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd2l0aEZpZWxkID0gKGZpZWxkOiBQYXJ0aWFsPFJlY29yZDwnc2Vzc2lvblVyaScgfCAndG9vbENhbGxJZCcgfCAnZmlsZVBhdGgnLCBzdHJpbmc+PikgPT5cblx0XHRcdGBzZXNzaW9uLWRiOi9mLnRzPyR7ZW5jb2RlVVJJQ29tcG9uZW50KEpTT04uc3RyaW5naWZ5KHsgc2Vzc2lvblVyaTogJ3MnLCB0b29sQ2FsbElkOiAndCcsIGZpbGVQYXRoOiAnL2YudHMnLCBwYXJ0OiAnYmVmb3JlJywgLi4uZmllbGQgfSkpfWA7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdHBhcnNlU2Vzc2lvbkRiVXJpKHdpdGhGaWVsZCh7IHNlc3Npb25Vcmk6ICcnIH0pKSxcblx0XHRcdHBhcnNlU2Vzc2lvbkRiVXJpKHdpdGhGaWVsZCh7IHRvb2xDYWxsSWQ6ICcnIH0pKSxcblx0XHRcdHBhcnNlU2Vzc2lvbkRiVXJpKHdpdGhGaWVsZCh7IGZpbGVQYXRoOiAnJyB9KSksXG5cdFx0XSwgW3VuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWRdKTtcblx0fSk7XG5cblx0dGVzdCgnVVJJIHBhdGggaXMgdGhlIGZpbGUgcGF0aCwgc28gbGFiZWxzIHNob3cgYSByZWFsIHBhdGgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gYnVpbGRTZXNzaW9uRGJVcmkoJ2NvcGlsb3Q6L3MxJywgJ3RjLTEnLCAnL3dvcmtzcGFjZS9zcmMvaW5kZXgudHMnLCAnYmVmb3JlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5wYXJzZSh1cmkpLnBhdGgsICcvd29ya3NwYWNlL3NyYy9pbmRleC50cycpO1xuXHR9KTtcblxuXHR0ZXN0KCdVUkkgcGF0aCBpcyB0aGUgZmlsZSBwYXRoIGZvciBmaWxlcyB3aXRoIHNwYWNlcyBhbmQgc3BlY2lhbCBjaGFycycsICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBidWlsZFNlc3Npb25EYlVyaSgnY29waWxvdDovczEnLCAndGMtMScsICcvd29yayBzcGFjZS9maWxlICgxKS50cycsICdhZnRlcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkucGFyc2UodXJpKS5wYXRoLCAnL3dvcmsgc3BhY2UvZmlsZSAoMSkudHMnKTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VzIHRoZSBsZWdhY3kgaGV4LWVuY29kZWQgbGF5b3V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGxlZ2FjeSA9IGxlZ2FjeVVyaSgnY29waWxvdDovYWJjLTEyMycsICd0Yy0xJywgJy93b3Jrc3BhY2UvZmlsZS50cycsICdiZWZvcmUnLCAnZmlsZS50cycpLnRvU3RyaW5nKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlU2Vzc2lvbkRiVXJpKGxlZ2FjeSksIHtcblx0XHRcdHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9hYmMtMTIzJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9maWxlLnRzJyxcblx0XHRcdHBhcnQ6ICdiZWZvcmUnLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnY2Fub25pY2FsaXplU2Vzc2lvbkRiVXJpJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3Jld3JpdGVzIGEgbGVnYWN5IFVSSSBpbnRvIHRoZSBjdXJyZW50IGxheW91dCcsICgpID0+IHtcblx0XHRjb25zdCBsZWdhY3kgPSBsZWdhY3lVcmkoJ2NvcGlsb3Q6L2FiYy0xMjMnLCAnY2FsbF8xJywgJy93b3Jrc3BhY2UvZmlsZS50cycsICdiZWZvcmUnLCAnZmlsZS50cycpO1xuXHRcdGNvbnN0IGNhbm9uaWNhbCA9IGNhbm9uaWNhbGl6ZVNlc3Npb25EYlVyaShsZWdhY3ksIFVSSS5maWxlKCcvd29ya3NwYWNlL2ZpbGUudHMnKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0W2Nhbm9uaWNhbC5wYXRoLCBwYXJzZVNlc3Npb25EYlVyaShjYW5vbmljYWwudG9TdHJpbmcoKSldLFxuXHRcdFx0Wycvd29ya3NwYWNlL2ZpbGUudHMnLCB7IHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9hYmMtMTIzJywgdG9vbENhbGxJZDogJ2NhbGxfMScsIGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9maWxlLnRzJywgcGFydDogJ2JlZm9yZScgfV0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndGFrZXMgdGhlIHBhdGggZnJvbSB0aGUgZmlsZSBVUkksIHNvIGEgV2luZG93cyBzZXNzaW9uIGNhbm9uaWNhbGl6ZXMgdGhlIHNhbWUgd2F5IG9uIGFueSBjbGllbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGVnYWN5ID0gbGVnYWN5VXJpKCdjb3BpbG90Oi9hYmMtMTIzJywgJ2NhbGxfMScsICdDOlxcXFxDb2RlXFxcXHJlcG9cXFxcZmlsZS50cycsICdiZWZvcmUnLCAnZmlsZS50cycpO1xuXHRcdGNvbnN0IGNhbm9uaWNhbCA9IGNhbm9uaWNhbGl6ZVNlc3Npb25EYlVyaShsZWdhY3ksIFVSSS5wYXJzZSgnZmlsZTovLy9jJTNBL0NvZGUvcmVwby9maWxlLnRzJykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFtjYW5vbmljYWwucGF0aCwgcGFyc2VTZXNzaW9uRGJVcmkoY2Fub25pY2FsLnRvU3RyaW5nKCkpPy5maWxlUGF0aF0sXG5cdFx0XHRbJy9jOi9Db2RlL3JlcG8vZmlsZS50cycsICdDOlxcXFxDb2RlXFxcXHJlcG9cXFxcZmlsZS50cyddLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xlYXZlcyBjYW5vbmljYWwsIHVucGFyc2VhYmxlIGFuZCBmb3JlaWduIFVSSXMgdW50b3VjaGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNhbm9uaWNhbCA9IFVSSS5wYXJzZShidWlsZFNlc3Npb25EYlVyaSgnY29waWxvdDovczEnLCAndGMtMScsICcvd29ya3NwYWNlL2ZpbGUudHMnLCAnYmVmb3JlJykpO1xuXHRcdGNvbnN0IHVucGFyc2VhYmxlID0gVVJJLmZyb20oeyBzY2hlbWU6ICdzZXNzaW9uLWRiJywgcGF0aDogJy9ub25zZW5zZScgfSk7XG5cdFx0Y29uc3QgZm9yZWlnbiA9IFVSSS5maWxlKCcvd29ya3NwYWNlL2ZpbGUudHMnKTtcblx0XHRjb25zdCBmaWxlVXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvZmlsZS50cycpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFtjYW5vbmljYWwsIHVucGFyc2VhYmxlLCBmb3JlaWduXS5tYXAodXJpID0+IGNhbm9uaWNhbGl6ZVNlc3Npb25EYlVyaSh1cmksIGZpbGVVcmkpLnRvU3RyaW5nKCkpLFxuXHRcdFx0W2Nhbm9uaWNhbC50b1N0cmluZygpLCB1bnBhcnNlYWJsZS50b1N0cmluZygpLCBmb3JlaWduLnRvU3RyaW5nKCldLFxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFP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
