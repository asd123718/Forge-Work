import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { mergeSectionOrder, resolveSectionOrder, spliceSectionOrder } from "../../browser/sessionSectionOrderService.js";
suite("SessionSectionOrder Helpers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("resolveSectionOrder", () => {
    test("falls back to default order when nothing is persisted", () => {
      assert.deepStrictEqual(resolveSectionOrder([], ["a", "b", "c"]), ["a", "b", "c"]);
    });
    test("applies the persisted order for live ids", () => {
      assert.deepStrictEqual(resolveSectionOrder(["c", "a", "b"], ["a", "b", "c"]), ["c", "a", "b"]);
    });
    test("drops persisted ids that are no longer live", () => {
      assert.deepStrictEqual(resolveSectionOrder(["x", "c", "a"], ["a", "c"]), ["c", "a"]);
    });
    test("weaves not-yet-seen ids in at their default position", () => {
      assert.deepStrictEqual(resolveSectionOrder(["c", "a"], ["a", "b", "c"]), ["c", "a", "b"]);
    });
    test("inserts a new leading default before the persisted block", () => {
      assert.deepStrictEqual(resolveSectionOrder(["b", "c"], ["a", "b", "c"]), ["a", "b", "c"]);
    });
  });
  suite("spliceSectionOrder", () => {
    test("moves before the target", () => {
      assert.deepStrictEqual(spliceSectionOrder(["a", "b", "c"], "c", "a", "before"), ["c", "a", "b"]);
    });
    test("moves after the target", () => {
      assert.deepStrictEqual(spliceSectionOrder(["a", "b", "c"], "a", "c", "after"), ["b", "c", "a"]);
    });
    test("returns undefined when the target is missing", () => {
      assert.strictEqual(spliceSectionOrder(["a", "b"], "a", "z", "before"), void 0);
    });
  });
  suite("mergeSectionOrder", () => {
    test("uses the visible order directly when nothing else is persisted", () => {
      assert.deepStrictEqual(mergeSectionOrder([], ["b", "a"]), ["b", "a"]);
    });
    test("keeps out-of-scope ids anchored to their visible predecessor", () => {
      const persisted = ["g1", "w1", "g2"];
      const visibleAfter = ["g2", "g1"];
      assert.deepStrictEqual(mergeSectionOrder(persisted, visibleAfter), ["g2", "g1", "w1"]);
    });
    test("keeps out-of-scope ids that precede all visible ids at the head", () => {
      const persisted = ["w1", "g1", "g2"];
      const visibleAfter = ["g2", "g1"];
      assert.deepStrictEqual(mergeSectionOrder(persisted, visibleAfter), ["w1", "g2", "g1"]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcc2VydmljZXNcXHNlc3Npb25zXFx0ZXN0XFxicm93c2VyXFxzZXNzaW9uU2VjdGlvbk9yZGVyU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBtZXJnZVNlY3Rpb25PcmRlciwgcmVzb2x2ZVNlY3Rpb25PcmRlciwgc3BsaWNlU2VjdGlvbk9yZGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXNzaW9uU2VjdGlvbk9yZGVyU2VydmljZS5qcyc7XG5cbnN1aXRlKCdTZXNzaW9uU2VjdGlvbk9yZGVyIEhlbHBlcnMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ3Jlc29sdmVTZWN0aW9uT3JkZXInLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdmYWxscyBiYWNrIHRvIGRlZmF1bHQgb3JkZXIgd2hlbiBub3RoaW5nIGlzIHBlcnNpc3RlZCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb2x2ZVNlY3Rpb25PcmRlcihbXSwgWydhJywgJ2InLCAnYyddKSwgWydhJywgJ2InLCAnYyddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FwcGxpZXMgdGhlIHBlcnNpc3RlZCBvcmRlciBmb3IgbGl2ZSBpZHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc29sdmVTZWN0aW9uT3JkZXIoWydjJywgJ2EnLCAnYiddLCBbJ2EnLCAnYicsICdjJ10pLCBbJ2MnLCAnYScsICdiJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZHJvcHMgcGVyc2lzdGVkIGlkcyB0aGF0IGFyZSBubyBsb25nZXIgbGl2ZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb2x2ZVNlY3Rpb25PcmRlcihbJ3gnLCAnYycsICdhJ10sIFsnYScsICdjJ10pLCBbJ2MnLCAnYSddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dlYXZlcyBub3QteWV0LXNlZW4gaWRzIGluIGF0IHRoZWlyIGRlZmF1bHQgcG9zaXRpb24nLCAoKSA9PiB7XG5cdFx0XHQvLyAnYicgaXMgbmV3IGFuZCBkZWZhdWx0cyBiZXR3ZWVuICdhJyBhbmQgJ2MnOyBwZXJzaXN0ZWQgb3JkZXIgaXMgYyxhLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXNvbHZlU2VjdGlvbk9yZGVyKFsnYycsICdhJ10sIFsnYScsICdiJywgJ2MnXSksIFsnYycsICdhJywgJ2InXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbnNlcnRzIGEgbmV3IGxlYWRpbmcgZGVmYXVsdCBiZWZvcmUgdGhlIHBlcnNpc3RlZCBibG9jaycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb2x2ZVNlY3Rpb25PcmRlcihbJ2InLCAnYyddLCBbJ2EnLCAnYicsICdjJ10pLCBbJ2EnLCAnYicsICdjJ10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc3BsaWNlU2VjdGlvbk9yZGVyJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnbW92ZXMgYmVmb3JlIHRoZSB0YXJnZXQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNwbGljZVNlY3Rpb25PcmRlcihbJ2EnLCAnYicsICdjJ10sICdjJywgJ2EnLCAnYmVmb3JlJyksIFsnYycsICdhJywgJ2InXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb3ZlcyBhZnRlciB0aGUgdGFyZ2V0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzcGxpY2VTZWN0aW9uT3JkZXIoWydhJywgJ2InLCAnYyddLCAnYScsICdjJywgJ2FmdGVyJyksIFsnYicsICdjJywgJ2EnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIHRoZSB0YXJnZXQgaXMgbWlzc2luZycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpY2VTZWN0aW9uT3JkZXIoWydhJywgJ2InXSwgJ2EnLCAneicsICdiZWZvcmUnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ21lcmdlU2VjdGlvbk9yZGVyJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgndXNlcyB0aGUgdmlzaWJsZSBvcmRlciBkaXJlY3RseSB3aGVuIG5vdGhpbmcgZWxzZSBpcyBwZXJzaXN0ZWQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1lcmdlU2VjdGlvbk9yZGVyKFtdLCBbJ2InLCAnYSddKSwgWydiJywgJ2EnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdrZWVwcyBvdXQtb2Ytc2NvcGUgaWRzIGFuY2hvcmVkIHRvIHRoZWlyIHZpc2libGUgcHJlZGVjZXNzb3InLCAoKSA9PiB7XG5cdFx0XHQvLyAndzEnIChvdXQgb2Ygc2NvcGUpIGZvbGxvd2VkICdnMScgaW4gdGhlIHBlcnNpc3RlZCBvcmRlcjsgcmVvcmRlcmluZ1xuXHRcdFx0Ly8gdGhlIGdyb3VwcyBnMS9nMiBtdXN0IGtlZXAgJ3cxJyB0cmFpbGluZyBnMS5cblx0XHRcdGNvbnN0IHBlcnNpc3RlZCA9IFsnZzEnLCAndzEnLCAnZzInXTtcblx0XHRcdGNvbnN0IHZpc2libGVBZnRlciA9IFsnZzInLCAnZzEnXTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWVyZ2VTZWN0aW9uT3JkZXIocGVyc2lzdGVkLCB2aXNpYmxlQWZ0ZXIpLCBbJ2cyJywgJ2cxJywgJ3cxJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgna2VlcHMgb3V0LW9mLXNjb3BlIGlkcyB0aGF0IHByZWNlZGUgYWxsIHZpc2libGUgaWRzIGF0IHRoZSBoZWFkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGVyc2lzdGVkID0gWyd3MScsICdnMScsICdnMiddO1xuXHRcdFx0Y29uc3QgdmlzaWJsZUFmdGVyID0gWydnMicsICdnMSddO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZXJnZVNlY3Rpb25PcmRlcihwZXJzaXN0ZWQsIHZpc2libGVBZnRlciksIFsndzEnLCAnZzInLCAnZzEnXSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxtQkFBbUIscUJBQXFCLDBCQUEwQjtBQUUzRSxNQUFNLCtCQUErQixNQUFNO0FBRTFDLDBDQUF3QztBQUV4QyxRQUFNLHVCQUF1QixNQUFNO0FBRWxDLFNBQUsseURBQXlELE1BQU07QUFDbkUsYUFBTyxnQkFBZ0Isb0JBQW9CLENBQUMsR0FBRyxDQUFDLEtBQUssS0FBSyxHQUFHLENBQUMsR0FBRyxDQUFDLEtBQUss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
