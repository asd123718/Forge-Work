import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { parseProxyBearer } from "../../node/claude/claudeProxyAuth.js";
const NONCE = "test-nonce-deadbeef";
suite("parseProxyBearer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("accepts Bearer <nonce>.<sessionId> with non-empty sessionId", () => {
    assert.deepStrictEqual(
      parseProxyBearer({ "authorization": `Bearer ${NONCE}.session-abc` }, NONCE),
      { valid: true, sessionId: "session-abc" }
    );
  });
  test("preserves dots inside the sessionId portion", () => {
    assert.deepStrictEqual(
      parseProxyBearer({ "authorization": `Bearer ${NONCE}.session.with.dots` }, NONCE),
      { valid: true, sessionId: "session.with.dots" }
    );
  });
  test("rejects missing Authorization header", () => {
    assert.deepStrictEqual(
      parseProxyBearer({}, NONCE),
      { valid: false, sessionId: void 0 }
    );
  });
  test("rejects non-Bearer Authorization scheme", () => {
    assert.deepStrictEqual(
      parseProxyBearer({ "authorization": `Basic ${NONCE}.s` }, NONCE),
      { valid: false, sessionId: void 0 }
    );
  });
  test("rejects Bearer with wrong nonce", () => {
    assert.deepStrictEqual(
      parseProxyBearer({ "authorization": "Bearer wrong-nonce.session-abc" }, NONCE),
      { valid: false, sessionId: void 0 }
    );
  });
  test("rejects Bearer <nonce> with no dot (legacy format not supported)", () => {
    assert.deepStrictEqual(
      parseProxyBearer({ "authorization": `Bearer ${NONCE}` }, NONCE),
      { valid: false, sessionId: void 0 }
    );
  });
  test("rejects Bearer <nonce>. with empty sessionId", () => {
    assert.deepStrictEqual(
      parseProxyBearer({ "authorization": `Bearer ${NONCE}.` }, NONCE),
      { valid: false, sessionId: void 0 }
    );
  });
  test("ignores x-api-key when only x-api-key is present", () => {
    assert.deepStrictEqual(
      parseProxyBearer({ "x-api-key": NONCE }, NONCE),
      { valid: false, sessionId: void 0 }
    );
  });
  test("uses Authorization header when both x-api-key and Authorization are present", () => {
    assert.deepStrictEqual(
      parseProxyBearer({
        "x-api-key": "sk-ant-real-api-key",
        "authorization": `Bearer ${NONCE}.s`
      }, NONCE),
      { valid: true, sessionId: "s" }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjbGF1ZGVQcm94eUF1dGgudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgcGFyc2VQcm94eUJlYXJlciB9IGZyb20gJy4uLy4uL25vZGUvY2xhdWRlL2NsYXVkZVByb3h5QXV0aC5qcyc7XG5cbmNvbnN0IE5PTkNFID0gJ3Rlc3Qtbm9uY2UtZGVhZGJlZWYnO1xuXG5zdWl0ZSgncGFyc2VQcm94eUJlYXJlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdhY2NlcHRzIEJlYXJlciA8bm9uY2U+LjxzZXNzaW9uSWQ+IHdpdGggbm9uLWVtcHR5IHNlc3Npb25JZCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cGFyc2VQcm94eUJlYXJlcih7ICdhdXRob3JpemF0aW9uJzogYEJlYXJlciAke05PTkNFfS5zZXNzaW9uLWFiY2AgfSwgTk9OQ0UpLFxuXHRcdFx0eyB2YWxpZDogdHJ1ZSwgc2Vzc2lvbklkOiAnc2Vzc2lvbi1hYmMnIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIGRvdHMgaW5zaWRlIHRoZSBzZXNzaW9uSWQgcG9ydGlvbicsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cGFyc2VQcm94eUJlYXJlcih7ICdhdXRob3JpemF0aW9uJzogYEJlYXJlciAke05PTkNFfS5zZXNzaW9uLndpdGguZG90c2AgfSwgTk9OQ0UpLFxuXHRcdFx0eyB2YWxpZDogdHJ1ZSwgc2Vzc2lvbklkOiAnc2Vzc2lvbi53aXRoLmRvdHMnIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBtaXNzaW5nIEF1dGhvcml6YXRpb24gaGVhZGVyJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwYXJzZVByb3h5QmVhcmVyKHt9LCBOT05DRSksXG5cdFx0XHR7IHZhbGlkOiBmYWxzZSwgc2Vzc2lvbklkOiB1bmRlZmluZWQgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIG5vbi1CZWFyZXIgQXV0aG9yaXphdGlvbiBzY2hlbWUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHBhcnNlUHJveHlCZWFyZXIoeyAnYXV0aG9yaXphdGlvbic6IGBCYXNpYyAke05PTkNFfS5zYCB9LCBOT05DRSksXG5cdFx0XHR7IHZhbGlkOiBmYWxzZSwgc2Vzc2lvbklkOiB1bmRlZmluZWQgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIEJlYXJlciB3aXRoIHdyb25nIG5vbmNlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwYXJzZVByb3h5QmVhcmVyKHsgJ2F1dGhvcml6YXRpb24nOiAnQmVhcmVyIHdyb25nLW5vbmNlLnNlc3Npb24tYWJjJyB9LCBOT05DRSksXG5cdFx0XHR7IHZhbGlkOiBmYWxzZSwgc2Vzc2lvbklkOiB1bmRlZmluZWQgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIEJlYXJlciA8bm9uY2U+IHdpdGggbm8gZG90IChsZWdhY3kgZm9ybWF0IG5vdCBzdXBwb3J0ZWQpJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwYXJzZVByb3h5QmVhcmVyKHsgJ2F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7Tk9OQ0V9YCB9LCBOT05DRSksXG5cdFx0XHR7IHZhbGlkOiBmYWxzZSwgc2Vzc2lvbklkOiB1bmRlZmluZWQgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIEJlYXJlciA8bm9uY2U+LiB3aXRoIGVtcHR5IHNlc3Npb25JZCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cGFyc2VQcm94eUJlYXJlcih7ICdhdXRob3JpemF0aW9uJzogYEJlYXJlciAke05PTkNFfS5gIH0sIE5PTkNFKSxcblx0XHRcdHsgdmFsaWQ6IGZhbHNlLCBzZXNzaW9uSWQ6IHVuZGVmaW5lZCB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgeC1hcGkta2V5IHdoZW4gb25seSB4LWFwaS1rZXkgaXMgcHJlc2VudCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cGFyc2VQcm94eUJlYXJlcih7ICd4LWFwaS1rZXknOiBOT05DRSB9LCBOT05DRSksXG5cdFx0XHR7IHZhbGlkOiBmYWxzZSwgc2Vzc2lvbklkOiB1bmRlZmluZWQgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIEF1dGhvcml6YXRpb24gaGVhZGVyIHdoZW4gYm90aCB4LWFwaS1rZXkgYW5kIEF1dGhvcml6YXRpb24gYXJlIHByZXNlbnQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHBhcnNlUHJveHlCZWFyZXIoe1xuXHRcdFx0XHQneC1hcGkta2V5JzogJ3NrLWFudC1yZWFsLWFwaS1rZXknLFxuXHRcdFx0XHQnYXV0aG9yaXphdGlvbic6IGBCZWFyZXIgJHtOT05DRX0uc2AsXG5cdFx0XHR9LCBOT05DRSksXG5cdFx0XHR7IHZhbGlkOiB0cnVlLCBzZXNzaW9uSWQ6ICdzJyB9LFxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx3QkFBd0I7QUFFakMsTUFBTSxRQUFRO0FBRWQsTUFBTSxvQkFBb0IsTUFBTTtBQUUvQiwwQ0FBd0M7QUFFeEMsT0FBSywrREFBK0QsTUFBTTtBQUN6RSxXQUFPO0FBQUEsTUFDTixpQkFBaUIsRUFBRSxpQkFBaUIsVUFBVSxLQUFLLGVBQWUsR0FBRyxLQUFLO0FBQUEsTUFDMUUsRUFBRSxPQUFPLE1BQU0sV0FBVyxjQUFjO0FBQUEsSUFDekM7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLCtDQUErQyxNQUFNO0FBQ3pELFdBQU87QUFBQSxNQUNOLGlCQUFpQixFQUFFLGlCQUFpQixVQUFVLEtBQUsscUJBQXFCLEdBQUcsS0FBSztBQUFBLE1BQ2hGLEVBQUUsT0FBTyxNQUFNLFdBQVcsb0JBQW9CO0FBQUEsSUFDL0M7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHdDQUF3QyxNQUFNO0FBQ2xELFdBQU87QUFBQSxNQUNOLGlCQUFpQixDQUFDLEdBQUcsS0FBSztBQUFBLE1BQzFCLEVBQUUsT0FBTyxPQUFPLFdBQVcsT0FBVTtBQUFBLElBQ3RDO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSywyQ0FBMkMsTUFBTTtBQUNyRCxXQUFPO0FBQUEsTUFDTixpQkFBaUIsRUFBRSxpQkFBaUIsU0FBUyxLQUFLLEtBQUssR0FBRyxLQUFLO0FBQUEsTUFDL0QsRUFBRSxPQUFPLE9BQU8sV0FBVyxPQUFVO0FBQUEsSUFDdEM7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLG1DQUFtQyxNQUFNO0FBQzdDLFdBQU87QUFBQSxNQUNOLGlCQUFpQixFQUFFLGlCQUFpQixpQ0FBaUMsR0FBRyxLQUFLO0FBQUEsTUFDN0UsRUFBRSxPQUFPLE9BQU8sV0FBVyxPQUFVO0FBQUEsSUFDdEM7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLG9FQUFvRSxNQUFNO0FBQzlFLFdBQU87QUFBQSxNQUNOLGlCQUFpQixFQUFFLGlCQUFpQixVQUFVLEtBQUssR0FBRyxHQUFHLEtBQUs7QUFBQSxNQUM5RCxFQUFFLE9BQU8sT0FBTyxXQUFXLE9BQVU7QUFBQSxJQUN0QztBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssZ0RBQWdELE1BQU07QUFDMUQsV0FBTztBQUFBLE1BQ04saUJBQWlCLEVBQUUsaUJBQWlCLFVBQVUsS0FBSyxJQUFJLEdBQUcsS0FBSztBQUFBLE1BQy9ELEVBQUUsT0FBTyxPQUFPLFdBQVcsT0FBVTtBQUFBLElBQ3RDO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxvREFBb0QsTUFBTTtBQUM5RCxXQUFPO0FBQUEsTUFDTixpQkFBaUIsRUFBRSxhQUFhLE1BQU0sR0FBRyxLQUFLO0FBQUEsTUFDOUMsRUFBRSxPQUFPLE9BQU8sV0FBVyxPQUFVO0FBQUEsSUFDdEM7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLCtFQUErRSxNQUFNO0FBQ3pGLFdBQU87QUFBQSxNQUNOLGlCQUFpQjtBQUFBLFFBQ2hCLGFBQWE7QUFBQSxRQUNiLGlCQUFpQixVQUFVLEtBQUs7QUFBQSxNQUNqQyxHQUFHLEtBQUs7QUFBQSxNQUNSLEVBQUUsT0FBTyxNQUFNLFdBQVcsSUFBSTtBQUFBLElBQy9CO0FBQUEsRUFDRCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
