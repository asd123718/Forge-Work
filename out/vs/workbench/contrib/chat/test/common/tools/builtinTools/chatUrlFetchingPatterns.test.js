import assert from "assert";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { extractUrlPatterns, getPatternLabel, isUrlApproved, getMatchingPattern } from "../../../../common/tools/builtinTools/chatUrlFetchingPatterns.js";
suite("ChatUrlFetchingPatterns", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("extractUrlPatterns", () => {
    test("simple domain", () => {
      const url = URI.parse("https://example.com");
      const patterns = extractUrlPatterns(url);
      assert.deepStrictEqual(patterns, [
        "https://example.com"
      ]);
    });
    test("subdomain", () => {
      const url = URI.parse("https://api.example.com");
      const patterns = extractUrlPatterns(url);
      assert.deepStrictEqual(patterns, [
        "https://api.example.com",
        "https://*.example.com"
      ]);
    });
    test("multiple subdomains", () => {
      const url = URI.parse("https://foo.bar.example.com/path");
      const patterns = extractUrlPatterns(url);
      assert.deepStrictEqual(patterns, [
        "https://foo.bar.example.com/path",
        "https://foo.bar.example.com",
        "https://*.bar.example.com",
        "https://*.example.com"
      ]);
    });
    test("with path", () => {
      const url = URI.parse("https://example.com/api/v1/users");
      const patterns = extractUrlPatterns(url);
      assert.deepStrictEqual(patterns, [
        "https://example.com/api/v1/users",
        "https://example.com",
        "https://example.com/api/v1",
        "https://example.com/api"
      ]);
    });
    test("IP address - no wildcard subdomain", () => {
      const url = URI.parse("https://192.168.1.1");
      const patterns = extractUrlPatterns(url);
      assert.strictEqual(patterns.filter((p) => p.includes("*")).length, 0);
    });
    test("with query and fragment", () => {
      const url = URI.parse("https://example.com/path?query=1#fragment");
      const patterns = extractUrlPatterns(url);
      assert.deepStrictEqual(patterns, [
        "https://example.com/path?query=1#fragment",
        "https://example.com"
      ]);
    });
  });
  suite("getPatternLabel", () => {
    test("removes https protocol", () => {
      const url = URI.parse("https://example.com");
      const label = getPatternLabel(url, "https://example.com");
      assert.strictEqual(label, "example.com");
    });
    test("removes http protocol", () => {
      const url = URI.parse("http://example.com");
      const label = getPatternLabel(url, "http://example.com");
      assert.strictEqual(label, "example.com");
    });
    test("removes trailing slashes", () => {
      const url = URI.parse("https://example.com/");
      const label = getPatternLabel(url, "https://example.com/");
      assert.strictEqual(label, "example.com");
    });
    test("preserves path", () => {
      const url = URI.parse("https://example.com/api/v1");
      const label = getPatternLabel(url, "https://example.com/api/v1");
      assert.strictEqual(label, "example.com/api/v1");
    });
  });
  suite("isUrlApproved", () => {
    test("exact match with boolean", () => {
      const url = URI.parse("https://example.com");
      const approved = { "https://example.com": true };
      assert.strictEqual(isUrlApproved(url, approved, true), true);
      assert.strictEqual(isUrlApproved(url, approved, false), true);
    });
    test("no match returns false", () => {
      const url = URI.parse("https://example.com");
      const approved = { "https://other.com": true };
      assert.strictEqual(isUrlApproved(url, approved, true), false);
    });
    test("wildcard subdomain match", () => {
      const url = URI.parse("https://api.example.com");
      const approved = { "https://*.example.com": true };
      assert.strictEqual(isUrlApproved(url, approved, true), true);
    });
    test("path wildcard match", () => {
      const url = URI.parse("https://example.com/api/users");
      const approved = { "https://example.com/api/*": true };
      assert.strictEqual(isUrlApproved(url, approved, true), true);
    });
    test("granular settings - request approved", () => {
      const url = URI.parse("https://example.com");
      const approved = {
        "https://example.com": { approveRequest: true, approveResponse: false }
      };
      assert.strictEqual(isUrlApproved(url, approved, true), true);
      assert.strictEqual(isUrlApproved(url, approved, false), false);
    });
    test("granular settings - response approved", () => {
      const url = URI.parse("https://example.com");
      const approved = {
        "https://example.com": { approveRequest: false, approveResponse: true }
      };
      assert.strictEqual(isUrlApproved(url, approved, true), false);
      assert.strictEqual(isUrlApproved(url, approved, false), true);
    });
    test("granular settings - both approved", () => {
      const url = URI.parse("https://example.com");
      const approved = {
        "https://example.com": { approveRequest: true, approveResponse: true }
      };
      assert.strictEqual(isUrlApproved(url, approved, true), true);
      assert.strictEqual(isUrlApproved(url, approved, false), true);
    });
    test("granular settings - missing property defaults to false", () => {
      const url = URI.parse("https://example.com");
      const approved = {
        "https://example.com": { approveRequest: true }
      };
      assert.strictEqual(isUrlApproved(url, approved, false), false);
    });
  });
  suite("getMatchingPattern", () => {
    test("exact match", () => {
      const url = URI.parse("https://example.com/path");
      const approved = { "https://example.com/path": true };
      const pattern = getMatchingPattern(url, approved);
      assert.strictEqual(pattern, "https://example.com/path");
    });
    test("wildcard match", () => {
      const url = URI.parse("https://api.example.com");
      const approved = { "https://*.example.com": true };
      const pattern = getMatchingPattern(url, approved);
      assert.strictEqual(pattern, "https://*.example.com");
    });
    test("no match returns undefined", () => {
      const url = URI.parse("https://example.com");
      const approved = { "https://other.com": true };
      const pattern = getMatchingPattern(url, approved);
      assert.strictEqual(pattern, void 0);
    });
    test("most specific match", () => {
      const url = URI.parse("https://api.example.com/v1/users");
      const approved = {
        "https://*.example.com": true,
        "https://api.example.com": true,
        "https://api.example.com/v1/*": true
      };
      const pattern = getMatchingPattern(url, approved);
      assert.ok(pattern !== void 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcdG9vbHNcXGJ1aWx0aW5Ub29sc1xcY2hhdFVybEZldGNoaW5nUGF0dGVybnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGV4dHJhY3RVcmxQYXR0ZXJucywgZ2V0UGF0dGVybkxhYmVsLCBpc1VybEFwcHJvdmVkLCBnZXRNYXRjaGluZ1BhdHRlcm4sIElVcmxBcHByb3ZhbFNldHRpbmdzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9jaGF0VXJsRmV0Y2hpbmdQYXR0ZXJucy5qcyc7XG5cbnN1aXRlKCdDaGF0VXJsRmV0Y2hpbmdQYXR0ZXJucycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2V4dHJhY3RVcmxQYXR0ZXJucycsICgpID0+IHtcblx0XHR0ZXN0KCdzaW1wbGUgZG9tYWluJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJsID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tJyk7XG5cdFx0XHRjb25zdCBwYXR0ZXJucyA9IGV4dHJhY3RVcmxQYXR0ZXJucyh1cmwpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXR0ZXJucywgW1xuXHRcdFx0XHQnaHR0cHM6Ly9leGFtcGxlLmNvbScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N1YmRvbWFpbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHVybCA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nKTtcblx0XHRcdGNvbnN0IHBhdHRlcm5zID0gZXh0cmFjdFVybFBhdHRlcm5zKHVybCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhdHRlcm5zLCBbXG5cdFx0XHRcdCdodHRwczovL2FwaS5leGFtcGxlLmNvbScsXG5cdFx0XHRcdCdodHRwczovLyouZXhhbXBsZS5jb20nXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpcGxlIHN1YmRvbWFpbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmwgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZm9vLmJhci5leGFtcGxlLmNvbS9wYXRoJyk7XG5cdFx0XHRjb25zdCBwYXR0ZXJucyA9IGV4dHJhY3RVcmxQYXR0ZXJucyh1cmwpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXR0ZXJucywgW1xuXHRcdFx0XHQnaHR0cHM6Ly9mb28uYmFyLmV4YW1wbGUuY29tL3BhdGgnLFxuXHRcdFx0XHQnaHR0cHM6Ly9mb28uYmFyLmV4YW1wbGUuY29tJyxcblx0XHRcdFx0J2h0dHBzOi8vKi5iYXIuZXhhbXBsZS5jb20nLFxuXHRcdFx0XHQnaHR0cHM6Ly8qLmV4YW1wbGUuY29tJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd2l0aCBwYXRoJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJsID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL2FwaS92MS91c2VycycpO1xuXHRcdFx0Y29uc3QgcGF0dGVybnMgPSBleHRyYWN0VXJsUGF0dGVybnModXJsKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGF0dGVybnMsIFtcblx0XHRcdFx0J2h0dHBzOi8vZXhhbXBsZS5jb20vYXBpL3YxL3VzZXJzJyxcblx0XHRcdFx0J2h0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHQnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvdjEnLFxuXHRcdFx0XHQnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGknLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdJUCBhZGRyZXNzIC0gbm8gd2lsZGNhcmQgc3ViZG9tYWluJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJsID0gVVJJLnBhcnNlKCdodHRwczovLzE5Mi4xNjguMS4xJyk7XG5cdFx0XHRjb25zdCBwYXR0ZXJucyA9IGV4dHJhY3RVcmxQYXR0ZXJucyh1cmwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdHRlcm5zLmZpbHRlcihwID0+IHAuaW5jbHVkZXMoJyonKSkubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dpdGggcXVlcnkgYW5kIGZyYWdtZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJsID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3BhdGg/cXVlcnk9MSNmcmFnbWVudCcpO1xuXHRcdFx0Y29uc3QgcGF0dGVybnMgPSBleHRyYWN0VXJsUGF0dGVybnModXJsKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGF0dGVybnMsIFtcblx0XHRcdFx0J2h0dHBzOi8vZXhhbXBsZS5jb20vcGF0aD9xdWVyeT0xI2ZyYWdtZW50Jyxcblx0XHRcdFx0J2h0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRQYXR0ZXJuTGFiZWwnLCAoKSA9PiB7XG5cdFx0dGVzdCgncmVtb3ZlcyBodHRwcyBwcm90b2NvbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVybCA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbScpO1xuXHRcdFx0Y29uc3QgbGFiZWwgPSBnZXRQYXR0ZXJuTGFiZWwodXJsLCAnaHR0cHM6Ly9leGFtcGxlLmNvbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhYmVsLCAnZXhhbXBsZS5jb20nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92ZXMgaHR0cCBwcm90b2NvbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVybCA9IFVSSS5wYXJzZSgnaHR0cDovL2V4YW1wbGUuY29tJyk7XG5cdFx0XHRjb25zdCBsYWJlbCA9IGdldFBhdHRlcm5MYWJlbCh1cmwsICdodHRwOi8vZXhhbXBsZS5jb20nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYWJlbCwgJ2V4YW1wbGUuY29tJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1vdmVzIHRyYWlsaW5nIHNsYXNoZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmwgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vJyk7XG5cdFx0XHRjb25zdCBsYWJlbCA9IGdldFBhdHRlcm5MYWJlbCh1cmwsICdodHRwczovL2V4YW1wbGUuY29tLycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhYmVsLCAnZXhhbXBsZS5jb20nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyBwYXRoJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJsID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL2FwaS92MScpO1xuXHRcdFx0Y29uc3QgbGFiZWwgPSBnZXRQYXR0ZXJuTGFiZWwodXJsLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvdjEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYWJlbCwgJ2V4YW1wbGUuY29tL2FwaS92MScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaXNVcmxBcHByb3ZlZCcsICgpID0+IHtcblx0XHR0ZXN0KCdleGFjdCBtYXRjaCB3aXRoIGJvb2xlYW4nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmwgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20nKTtcblx0XHRcdGNvbnN0IGFwcHJvdmVkID0geyAnaHR0cHM6Ly9leGFtcGxlLmNvbSc6IHRydWUgfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VybEFwcHJvdmVkKHVybCwgYXBwcm92ZWQsIHRydWUpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VybEFwcHJvdmVkKHVybCwgYXBwcm92ZWQsIGZhbHNlKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdubyBtYXRjaCByZXR1cm5zIGZhbHNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJsID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tJyk7XG5cdFx0XHRjb25zdCBhcHByb3ZlZCA9IHsgJ2h0dHBzOi8vb3RoZXIuY29tJzogdHJ1ZSB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVXJsQXBwcm92ZWQodXJsLCBhcHByb3ZlZCwgdHJ1ZSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dpbGRjYXJkIHN1YmRvbWFpbiBtYXRjaCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVybCA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nKTtcblx0XHRcdGNvbnN0IGFwcHJvdmVkID0geyAnaHR0cHM6Ly8qLmV4YW1wbGUuY29tJzogdHJ1ZSB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVXJsQXBwcm92ZWQodXJsLCBhcHByb3ZlZCwgdHJ1ZSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGF0aCB3aWxkY2FyZCBtYXRjaCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVybCA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvdXNlcnMnKTtcblx0XHRcdGNvbnN0IGFwcHJvdmVkID0geyAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hcGkvKic6IHRydWUgfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VybEFwcHJvdmVkKHVybCwgYXBwcm92ZWQsIHRydWUpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dyYW51bGFyIHNldHRpbmdzIC0gcmVxdWVzdCBhcHByb3ZlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVybCA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbScpO1xuXHRcdFx0Y29uc3QgYXBwcm92ZWQ6IFJlY29yZDxzdHJpbmcsIElVcmxBcHByb3ZhbFNldHRpbmdzPiA9IHtcblx0XHRcdFx0J2h0dHBzOi8vZXhhbXBsZS5jb20nOiB7IGFwcHJvdmVSZXF1ZXN0OiB0cnVlLCBhcHByb3ZlUmVzcG9uc2U6IGZhbHNlIH1cblx0XHRcdH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVcmxBcHByb3ZlZCh1cmwsIGFwcHJvdmVkLCB0cnVlKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVcmxBcHByb3ZlZCh1cmwsIGFwcHJvdmVkLCBmYWxzZSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dyYW51bGFyIHNldHRpbmdzIC0gcmVzcG9uc2UgYXBwcm92ZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmwgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20nKTtcblx0XHRcdGNvbnN0IGFwcHJvdmVkOiBSZWNvcmQ8c3RyaW5nLCBJVXJsQXBwcm92YWxTZXR0aW5ncz4gPSB7XG5cdFx0XHRcdCdodHRwczovL2V4YW1wbGUuY29tJzogeyBhcHByb3ZlUmVxdWVzdDogZmFsc2UsIGFwcHJvdmVSZXNwb25zZTogdHJ1ZSB9XG5cdFx0XHR9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzVXJsQXBwcm92ZWQodXJsLCBhcHByb3ZlZCwgdHJ1ZSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VybEFwcHJvdmVkKHVybCwgYXBwcm92ZWQsIGZhbHNlKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdncmFudWxhciBzZXR0aW5ncyAtIGJvdGggYXBwcm92ZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmwgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20nKTtcblx0XHRcdGNvbnN0IGFwcHJvdmVkOiBSZWNvcmQ8c3RyaW5nLCBJVXJsQXBwcm92YWxTZXR0aW5ncz4gPSB7XG5cdFx0XHRcdCdodHRwczovL2V4YW1wbGUuY29tJzogeyBhcHByb3ZlUmVxdWVzdDogdHJ1ZSwgYXBwcm92ZVJlc3BvbnNlOiB0cnVlIH1cblx0XHRcdH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVcmxBcHByb3ZlZCh1cmwsIGFwcHJvdmVkLCB0cnVlKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNVcmxBcHByb3ZlZCh1cmwsIGFwcHJvdmVkLCBmYWxzZSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ3JhbnVsYXIgc2V0dGluZ3MgLSBtaXNzaW5nIHByb3BlcnR5IGRlZmF1bHRzIHRvIGZhbHNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJsID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tJyk7XG5cdFx0XHRjb25zdCBhcHByb3ZlZDogUmVjb3JkPHN0cmluZywgSVVybEFwcHJvdmFsU2V0dGluZ3M+ID0ge1xuXHRcdFx0XHQnaHR0cHM6Ly9leGFtcGxlLmNvbSc6IHsgYXBwcm92ZVJlcXVlc3Q6IHRydWUgfVxuXHRcdFx0fTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1VybEFwcHJvdmVkKHVybCwgYXBwcm92ZWQsIGZhbHNlKSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0TWF0Y2hpbmdQYXR0ZXJuJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2V4YWN0IG1hdGNoJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJsID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3BhdGgnKTtcblx0XHRcdGNvbnN0IGFwcHJvdmVkID0geyAnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYXRoJzogdHJ1ZSB9O1xuXHRcdFx0Y29uc3QgcGF0dGVybiA9IGdldE1hdGNoaW5nUGF0dGVybih1cmwsIGFwcHJvdmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXR0ZXJuLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYXRoJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3aWxkY2FyZCBtYXRjaCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVybCA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9hcGkuZXhhbXBsZS5jb20nKTtcblx0XHRcdGNvbnN0IGFwcHJvdmVkID0geyAnaHR0cHM6Ly8qLmV4YW1wbGUuY29tJzogdHJ1ZSB9O1xuXHRcdFx0Y29uc3QgcGF0dGVybiA9IGdldE1hdGNoaW5nUGF0dGVybih1cmwsIGFwcHJvdmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXR0ZXJuLCAnaHR0cHM6Ly8qLmV4YW1wbGUuY29tJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdubyBtYXRjaCByZXR1cm5zIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVybCA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9leGFtcGxlLmNvbScpO1xuXHRcdFx0Y29uc3QgYXBwcm92ZWQgPSB7ICdodHRwczovL290aGVyLmNvbSc6IHRydWUgfTtcblx0XHRcdGNvbnN0IHBhdHRlcm4gPSBnZXRNYXRjaGluZ1BhdHRlcm4odXJsLCBhcHByb3ZlZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0dGVybiwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21vc3Qgc3BlY2lmaWMgbWF0Y2gnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmwgPSBVUkkucGFyc2UoJ2h0dHBzOi8vYXBpLmV4YW1wbGUuY29tL3YxL3VzZXJzJyk7XG5cdFx0XHRjb25zdCBhcHByb3ZlZCA9IHtcblx0XHRcdFx0J2h0dHBzOi8vKi5leGFtcGxlLmNvbSc6IHRydWUsXG5cdFx0XHRcdCdodHRwczovL2FwaS5leGFtcGxlLmNvbSc6IHRydWUsXG5cdFx0XHRcdCdodHRwczovL2FwaS5leGFtcGxlLmNvbS92MS8qJzogdHJ1ZVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHBhdHRlcm4gPSBnZXRNYXRjaGluZ1BhdHRlcm4odXJsLCBhcHByb3ZlZCk7XG5cdFx0XHRhc3NlcnQub2socGF0dGVybiAhPT0gdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxvQkFBb0IsaUJBQWlCLGVBQWUsMEJBQWdEO0FBRTdHLE1BQU0sMkJBQTJCLE1BQU07QUFDdEMsMENBQXdDO0FBRXhDLFFBQU0sc0JBQXNCLE1BQU07QUFDakMsU0FBSyxpQkFBaUIsTUFBTTtBQUMzQixZQUFNLE1BQU0sSUFBSSxNQUFNLHFCQUFxQjtBQUMzQyxZQUFNLFdBQVcsbUJBQW1CLEdBQUc7QUFDdkMsYUFBTyxnQkFBZ0IsVUFBVTtBQUFBLFFBQ2hDO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxhQUFhLE1BQU07QUFDdkIsWUFBTSxN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
