import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { createArcTextEditFromDiff, extractArcTextEdit } from "../../../node/shared/arcToolEdit.js";
suite("Agent Host ARC Tool Edit", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("extracts verified single replacements", () => {
    assert.deepStrictEqual(extractArcTextEdit("Edit", {
      old_string: "before",
      new_string: "after"
    }, "const value = before;", "const value = after;"), {
      replacements: [{ start: 14, endExclusive: 20, text: "after" }]
    });
  });
  test("extracts verified full-file writes", () => {
    assert.deepStrictEqual(extractArcTextEdit("Write", {
      content: "new content"
    }, "old content", "new content"), {
      replacements: [{ start: 0, endExclusive: 11, text: "new content" }]
    });
  });
  test("rejects tool edits that do not reproduce the captured result", () => {
    assert.strictEqual(extractArcTextEdit("Edit", {
      old_string: "before",
      new_string: "after"
    }, "const value = before;", "formatter changed this"), void 0);
  });
  test("creates verified ARC edits from existing diff changes", () => {
    assert.deepStrictEqual(createArcTextEditFromDiff([{
      startOffset: 6,
      endOffsetExclusive: 12,
      newText: "after"
    }], "value=before", "value=after"), {
      replacements: [{ start: 6, endExclusive: 12, text: "after" }]
    });
  });
  test("falls back to a full replacement when diff changes do not reconstruct the result", () => {
    assert.deepStrictEqual(createArcTextEditFromDiff([], "first\r\nsecond", "first\nsecond"), {
      replacements: [{ start: 0, endExclusive: 13, text: "first\nsecond" }]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxzaGFyZWRcXGFyY1Rvb2xFZGl0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUFyY1RleHRFZGl0RnJvbURpZmYsIGV4dHJhY3RBcmNUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uL25vZGUvc2hhcmVkL2FyY1Rvb2xFZGl0LmpzJztcblxuc3VpdGUoJ0FnZW50IEhvc3QgQVJDIFRvb2wgRWRpdCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZXh0cmFjdHMgdmVyaWZpZWQgc2luZ2xlIHJlcGxhY2VtZW50cycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4dHJhY3RBcmNUZXh0RWRpdCgnRWRpdCcsIHtcblx0XHRcdG9sZF9zdHJpbmc6ICdiZWZvcmUnLFxuXHRcdFx0bmV3X3N0cmluZzogJ2FmdGVyJyxcblx0XHR9LCAnY29uc3QgdmFsdWUgPSBiZWZvcmU7JywgJ2NvbnN0IHZhbHVlID0gYWZ0ZXI7JyksIHtcblx0XHRcdHJlcGxhY2VtZW50czogW3sgc3RhcnQ6IDE0LCBlbmRFeGNsdXNpdmU6IDIwLCB0ZXh0OiAnYWZ0ZXInIH1dXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4dHJhY3RzIHZlcmlmaWVkIGZ1bGwtZmlsZSB3cml0ZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHRyYWN0QXJjVGV4dEVkaXQoJ1dyaXRlJywge1xuXHRcdFx0Y29udGVudDogJ25ldyBjb250ZW50Jyxcblx0XHR9LCAnb2xkIGNvbnRlbnQnLCAnbmV3IGNvbnRlbnQnKSwge1xuXHRcdFx0cmVwbGFjZW1lbnRzOiBbeyBzdGFydDogMCwgZW5kRXhjbHVzaXZlOiAxMSwgdGV4dDogJ25ldyBjb250ZW50JyB9XVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIHRvb2wgZWRpdHMgdGhhdCBkbyBub3QgcmVwcm9kdWNlIHRoZSBjYXB0dXJlZCByZXN1bHQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHJhY3RBcmNUZXh0RWRpdCgnRWRpdCcsIHtcblx0XHRcdG9sZF9zdHJpbmc6ICdiZWZvcmUnLFxuXHRcdFx0bmV3X3N0cmluZzogJ2FmdGVyJyxcblx0XHR9LCAnY29uc3QgdmFsdWUgPSBiZWZvcmU7JywgJ2Zvcm1hdHRlciBjaGFuZ2VkIHRoaXMnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlcyB2ZXJpZmllZCBBUkMgZWRpdHMgZnJvbSBleGlzdGluZyBkaWZmIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjcmVhdGVBcmNUZXh0RWRpdEZyb21EaWZmKFt7XG5cdFx0XHRzdGFydE9mZnNldDogNixcblx0XHRcdGVuZE9mZnNldEV4Y2x1c2l2ZTogMTIsXG5cdFx0XHRuZXdUZXh0OiAnYWZ0ZXInLFxuXHRcdH1dLCAndmFsdWU9YmVmb3JlJywgJ3ZhbHVlPWFmdGVyJyksIHtcblx0XHRcdHJlcGxhY2VtZW50czogW3sgc3RhcnQ6IDYsIGVuZEV4Y2x1c2l2ZTogMTIsIHRleHQ6ICdhZnRlcicgfV1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byBhIGZ1bGwgcmVwbGFjZW1lbnQgd2hlbiBkaWZmIGNoYW5nZXMgZG8gbm90IHJlY29uc3RydWN0IHRoZSByZXN1bHQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjcmVhdGVBcmNUZXh0RWRpdEZyb21EaWZmKFtdLCAnZmlyc3RcXHJcXG5zZWNvbmQnLCAnZmlyc3RcXG5zZWNvbmQnKSwge1xuXHRcdFx0cmVwbGFjZW1lbnRzOiBbeyBzdGFydDogMCwgZW5kRXhjbHVzaXZlOiAxMywgdGV4dDogJ2ZpcnN0XFxuc2Vjb25kJyB9XVxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMkJBQTJCLDBCQUEwQjtBQUU5RCxNQUFNLDRCQUE0QixNQUFNO0FBQ3ZDLDBDQUF3QztBQUV4QyxPQUFLLHlDQUF5QyxNQUFNO0FBQ25ELFdBQU8sZ0JBQWdCLG1CQUFtQixRQUFRO0FBQUEsTUFDakQsWUFBWTtBQUFBLE1BQ1osWUFBWTtBQUFBLElBQ2IsR0FBRyx5QkFBeUIsc0JBQXNCLEdBQUc7QUFBQSxNQUNwRCxjQUFjLENBQUMsRUFBRSxPQUFPLElBQUksY0FBYyxJQUFJLE1BQU0sUUFBUSxDQUFDO0FBQUEsSUFDOUQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssc0NBQXNDLE1BQU07QUFDaEQsV0FBTyxnQkFBZ0IsbUJBQW1CLFNBQVM7QUFBQSxNQUNsRCxTQUFTO0FBQUEsSUFDVixHQUFHLGVBQWUsYUFBYSxHQUFHO0FBQUEsTUFDakMsY0FBYyxDQUFDLEVBQUUsT0FBTyxHQUFHLGNBQWMsSUFBSSxNQUFNLGNBQWMsQ0FBQztBQUFBLElBQ25FLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGdFQUFnRSxNQUFNO0FBQzFFLFdBQU8sWUFBWSxtQkFBbUIsUUFBUTtBQUFBLE1BQzdDLFlBQVk7QUFBQSxNQUNaLFlBQVk7QUFBQSxJQUNiLEdBQUcseUJBQXlCLHdCQUF3QixHQUFHLE1BQVM7QUFBQSxFQUNqRSxDQUFDO0FBRUQsT0FBSyx5REFBeUQsTUFBTTtBQUNuRSxXQUFPLGdCQUFnQiwwQkFBMEIsQ0FBQztBQUFBLE1BQ2pELGFBQWE7QUFBQSxNQUNiLG9CQUFvQjtBQUFBLE1BQ3BCLFNBQVM7QUFBQSxJQUNWLENBQUMsR0FBRyxnQkFBZ0IsYUFBYSxHQUFHO0FBQUEsTUFDbkMsY0FBYyxDQUFDLEVBQUUsT0FBTyxHQUFHLGNBQWMsSUFBSSxNQUFNLFFBQVEsQ0FBQztBQUFBLElBQzdELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG9GQUFvRixNQUFNO0FBQzlGLFdBQU8sZ0JBQWdCLDBCQUEwQixDQUFDLEdBQUcsbUJBQW1CLGVBQWUsR0FBRztBQUFBLE1BQ3pGLGNBQWMsQ0FBQyxFQUFFLE9BQU8sR0FBRyxjQUFjLElBQUksTUFBTSxnQkFBZ0IsQ0FBQztBQUFBLElBQ3JFLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
