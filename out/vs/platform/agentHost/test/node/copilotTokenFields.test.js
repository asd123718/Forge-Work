import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { isRestrictedTelemetryEnabled, parseCopilotTokenFields } from "../../node/copilot/copilotTokenFields.js";
suite("copilotTokenFields", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("parseCopilotTokenFields", () => {
    test("returns empty map for undefined token", () => {
      assert.strictEqual(parseCopilotTokenFields(void 0).size, 0);
    });
    test("returns empty map for empty token", () => {
      assert.strictEqual(parseCopilotTokenFields("").size, 0);
    });
    test("parses fields from the leading colon-delimited segment", () => {
      const fields = parseCopilotTokenFields("tid=abc;exp=123;rt=1:HMACSIGNATURE");
      assert.strictEqual(fields.get("tid"), "abc");
      assert.strictEqual(fields.get("exp"), "123");
      assert.strictEqual(fields.get("rt"), "1");
    });
    test("parses fields when no colon separator is present", () => {
      const fields = parseCopilotTokenFields("tid=abc;rt=1");
      assert.strictEqual(fields.get("tid"), "abc");
      assert.strictEqual(fields.get("rt"), "1");
    });
    test("skips segments without a value separator", () => {
      const fields = parseCopilotTokenFields("tid=abc;rt;exp=123:HMAC");
      assert.strictEqual(fields.has("rt"), false);
      assert.strictEqual(fields.get("tid"), "abc");
      assert.strictEqual(fields.get("exp"), "123");
    });
  });
  suite("isRestrictedTelemetryEnabled", () => {
    test("false for undefined token", () => {
      assert.strictEqual(isRestrictedTelemetryEnabled(void 0), false);
    });
    test("false for empty token", () => {
      assert.strictEqual(isRestrictedTelemetryEnabled(""), false);
    });
    test("false when rt field is missing", () => {
      assert.strictEqual(isRestrictedTelemetryEnabled("tid=abc;exp=123:HMAC"), false);
    });
    test("false when rt=0", () => {
      assert.strictEqual(isRestrictedTelemetryEnabled("tid=abc;rt=0;exp=123:HMAC"), false);
    });
    test("true when rt=1 with other fields", () => {
      assert.strictEqual(isRestrictedTelemetryEnabled("tid=abc;rt=1;exp=123:HMAC"), true);
    });
    test("true when rt=1 is the first field", () => {
      assert.strictEqual(isRestrictedTelemetryEnabled("rt=1;tid=abc:HMAC"), true);
    });
    test("true when rt=1 is the last field", () => {
      assert.strictEqual(isRestrictedTelemetryEnabled("tid=abc;exp=123;rt=1:HMAC"), true);
    });
    test("true when token has no colon-delimited signature segment", () => {
      assert.strictEqual(isRestrictedTelemetryEnabled("tid=abc;rt=1"), true);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb3BpbG90VG9rZW5GaWVsZHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgaXNSZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZCwgcGFyc2VDb3BpbG90VG9rZW5GaWVsZHMgfSBmcm9tICcuLi8uLi9ub2RlL2NvcGlsb3QvY29waWxvdFRva2VuRmllbGRzLmpzJztcblxuc3VpdGUoJ2NvcGlsb3RUb2tlbkZpZWxkcycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgncGFyc2VDb3BpbG90VG9rZW5GaWVsZHMnLCAoKSA9PiB7XG5cdFx0dGVzdCgncmV0dXJucyBlbXB0eSBtYXAgZm9yIHVuZGVmaW5lZCB0b2tlbicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUNvcGlsb3RUb2tlbkZpZWxkcyh1bmRlZmluZWQpLnNpemUsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBlbXB0eSBtYXAgZm9yIGVtcHR5IHRva2VuJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlQ29waWxvdFRva2VuRmllbGRzKCcnKS5zaXplLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBmaWVsZHMgZnJvbSB0aGUgbGVhZGluZyBjb2xvbi1kZWxpbWl0ZWQgc2VnbWVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGZpZWxkcyA9IHBhcnNlQ29waWxvdFRva2VuRmllbGRzKCd0aWQ9YWJjO2V4cD0xMjM7cnQ9MTpITUFDU0lHTkFUVVJFJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmllbGRzLmdldCgndGlkJyksICdhYmMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWVsZHMuZ2V0KCdleHAnKSwgJzEyMycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpZWxkcy5nZXQoJ3J0JyksICcxJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJzZXMgZmllbGRzIHdoZW4gbm8gY29sb24gc2VwYXJhdG9yIGlzIHByZXNlbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWVsZHMgPSBwYXJzZUNvcGlsb3RUb2tlbkZpZWxkcygndGlkPWFiYztydD0xJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmllbGRzLmdldCgndGlkJyksICdhYmMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWVsZHMuZ2V0KCdydCcpLCAnMScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpcHMgc2VnbWVudHMgd2l0aG91dCBhIHZhbHVlIHNlcGFyYXRvcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGZpZWxkcyA9IHBhcnNlQ29waWxvdFRva2VuRmllbGRzKCd0aWQ9YWJjO3J0O2V4cD0xMjM6SE1BQycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpZWxkcy5oYXMoJ3J0JyksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWVsZHMuZ2V0KCd0aWQnKSwgJ2FiYycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpZWxkcy5nZXQoJ2V4cCcpLCAnMTIzJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpc1Jlc3RyaWN0ZWRUZWxlbWV0cnlFbmFibGVkJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2ZhbHNlIGZvciB1bmRlZmluZWQgdG9rZW4nLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNSZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZCh1bmRlZmluZWQpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxzZSBmb3IgZW1wdHkgdG9rZW4nLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNSZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZCgnJyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbHNlIHdoZW4gcnQgZmllbGQgaXMgbWlzc2luZycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1Jlc3RyaWN0ZWRUZWxlbWV0cnlFbmFibGVkKCd0aWQ9YWJjO2V4cD0xMjM6SE1BQycpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxzZSB3aGVuIHJ0PTAnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNSZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZCgndGlkPWFiYztydD0wO2V4cD0xMjM6SE1BQycpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cnVlIHdoZW4gcnQ9MSB3aXRoIG90aGVyIGZpZWxkcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1Jlc3RyaWN0ZWRUZWxlbWV0cnlFbmFibGVkKCd0aWQ9YWJjO3J0PTE7ZXhwPTEyMzpITUFDJyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJ1ZSB3aGVuIHJ0PTEgaXMgdGhlIGZpcnN0IGZpZWxkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzUmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQoJ3J0PTE7dGlkPWFiYzpITUFDJyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJ1ZSB3aGVuIHJ0PTEgaXMgdGhlIGxhc3QgZmllbGQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNSZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZCgndGlkPWFiYztleHA9MTIzO3J0PTE6SE1BQycpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RydWUgd2hlbiB0b2tlbiBoYXMgbm8gY29sb24tZGVsaW1pdGVkIHNpZ25hdHVyZSBzZWdtZW50JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzUmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQoJ3RpZD1hYmM7cnQ9MScpLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDhCQUE4QiwrQkFBK0I7QUFFdEUsTUFBTSxzQkFBc0IsTUFBTTtBQUVqQywwQ0FBd0M7QUFFeEMsUUFBTSwyQkFBMkIsTUFBTTtBQUN0QyxTQUFLLHlDQUF5QyxNQUFNO0FBQ25ELGFBQU8sWUFBWSx3QkFBd0IsTUFBUyxFQUFFLE1BQU0sQ0FBQztBQUFBLElBQzlELENBQUM7QUFFRCxTQUFLLHFDQUFxQyxNQUFNO0FBQy9DLGFBQU8sWUFBWSx3QkFBd0IsRUFBRSxFQUFFLE1BQU0sQ0FBQztBQUFBLElBQ3ZELENBQUM7QUFFRCxTQUFLLDBEQUEwRCxNQUFNO0FBQ3BFLFlBQU0sU0FBUyx3QkFBd0Isb0NBQW9DO0FBQzNFLGFBQU8sWUFBWSxPQUFPLElBQUksS0FBSyxHQUFHLEtBQUs7QUFDM0MsYUFBTyxZQUFZLE9BQU8sSUFBSSxLQUFLLEdBQUcsS0FBSztBQUMzQyxhQUFPLFlBQVksT0FBTyxJQUFJLElBQUksR0FBRyxHQUFHO0FBQUEsSUFDekMsQ0FBQztBQUVELFNBQUssb0RBQW9ELE1BQU07QUFDOUQsWUFBTSxTQUFTLHdCQUF3QixjQUFjO0FBQ3JELGFBQU8sWUFBWSxPQUFPLElBQUksS0FBSyxHQUFHLEtBQUs7QUFDM0MsYUFBTyxZQUFZLE9BQU8sSUFBSSxJQUFJLEdBQUcsR0FBRztBQUFBLElBQ3pDLENBQUM7QUFFRCxTQUFLLDRDQUE0QyxNQUFNO0FBQ3RELFlBQU0sU0FBUyx3QkFBd0IseUJBQXlCO0FBQ2hFLGFBQU8sWUFBWSxPQUFPLElBQUksSUFBSSxHQUFHLEtBQUs7QUFDMUMsYUFBTyxZQUFZLE9BQU8sSUFBSSxLQUFLLEdBQUcsS0FBSztBQUMzQyxhQUFPLFlBQVksT0FBTyxJQUFJLEtBQUssR0FBRyxLQUFLO0FBQUEsSUFDNUMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sZ0NBQWdDLE1BQU07QUFDM0MsU0FBSyw2QkFBNkIsTUFBTTtBQUN2QyxhQUFPLFlBQVksNkJBQTZCLE1BQVMsR0FBRyxLQUFLO0FBQUEsSUFDbEUsQ0FBQztBQUVELFNBQUsseUJBQXlCLE1BQU07QUFDbkMsYUFBTyxZQUFZLDZCQUE2QixFQUFFLEdBQUcsS0FBSztBQUFBLElBQzNELENBQUM7QUFFRCxTQUFLLGtDQUFrQyxNQUFNO0FBQzVDLGFBQU8sWUFBWSw2QkFBNkIsc0JBQXNCLEdBQUcsS0FBSztBQUFBLElBQy9FLENBQUM7QUFFRCxTQUFLLG1CQUFtQixNQUFNO0FBQzdCLGFBQU8sWUFBWSw2QkFBNkIsMkJBQTJCLEdBQUcsS0FBSztBQUFBLElBQ3BGLENBQUM7QUFFRCxTQUFLLG9DQUFvQyxNQUFNO0FBQzlDLGFBQU8sWUFBWSw2QkFBNkIsMkJBQTJCLEdBQUcsSUFBSTtBQUFBLElBQ25GLENBQUM7QUFFRCxTQUFLLHFDQUFxQyxNQUFNO0FBQy9DLGFBQU8sWUFBWSw2QkFBNkIsbUJBQW1CLEdBQUcsSUFBSTtBQUFBLElBQzNFLENBQUM7QUFFRCxTQUFLLG9DQUFvQyxNQUFNO0FBQzlDLGFBQU8sWUFBWSw2QkFBNkIsMkJBQTJCLEdBQUcsSUFBSTtBQUFBLElBQ25GLENBQUM7QUFFRCxTQUFLLDREQUE0RCxNQUFNO0FBQ3RFLGFBQU8sWUFBWSw2QkFBNkIsY0FBYyxHQUFHLElBQUk7QUFBQSxJQUN0RSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
