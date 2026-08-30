import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { parsePartialToolInput, parsePartialToolInputForDisplay } from "../../common/partialToolInput.js";
suite("PartialToolInput", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns useful object fields from incomplete JSON", () => {
    assert.deepStrictEqual(parsePartialToolInputForDisplay('{"command":"npm test","description":"Run'), {
      command: "npm test",
      description: "Run"
    });
  });
  test("returns undefined when no object fields are parseable", () => {
    assert.deepStrictEqual([
      parsePartialToolInputForDisplay('{"comm'),
      parsePartialToolInputForDisplay("custom input"),
      parsePartialToolInputForDisplay('["item"]')
    ], [
      void 0,
      void 0,
      void 0
    ]);
  });
  test("returns a snapshot instead of the cached object", () => {
    const raw = '{"command":"npm test"}';
    const first = parsePartialToolInputForDisplay(raw);
    assert.ok(first);
    first["command"] = "modified";
    assert.deepStrictEqual(parsePartialToolInputForDisplay(raw), {
      command: "npm test"
    });
  });
  test("bounds generic display parsing", () => {
    const raw = `{"command":"npm test","content":"${"x".repeat(70 * 1024)}"}`;
    const parsed = parsePartialToolInputForDisplay(raw);
    assert.deepStrictEqual({
      command: parsed?.["command"],
      contentIsTruncated: typeof parsed?.["content"] === "string" && parsed["content"].length < raw.length
    }, {
      command: "npm test",
      contentIsTruncated: true
    });
  });
  test("supports uncapped provider parsing", () => {
    const content = "x".repeat(70 * 1024);
    assert.strictEqual(parsePartialToolInput(`{"content":"${content}"}`)?.["content"], content);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxjb21tb25cXHBhcnRpYWxUb29sSW5wdXQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgcGFyc2VQYXJ0aWFsVG9vbElucHV0LCBwYXJzZVBhcnRpYWxUb29sSW5wdXRGb3JEaXNwbGF5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3BhcnRpYWxUb29sSW5wdXQuanMnO1xuXG5zdWl0ZSgnUGFydGlhbFRvb2xJbnB1dCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmV0dXJucyB1c2VmdWwgb2JqZWN0IGZpZWxkcyBmcm9tIGluY29tcGxldGUgSlNPTicsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlUGFydGlhbFRvb2xJbnB1dEZvckRpc3BsYXkoJ3tcImNvbW1hbmRcIjpcIm5wbSB0ZXN0XCIsXCJkZXNjcmlwdGlvblwiOlwiUnVuJyksIHtcblx0XHRcdGNvbW1hbmQ6ICducG0gdGVzdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ1J1bicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gbm8gb2JqZWN0IGZpZWxkcyBhcmUgcGFyc2VhYmxlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0cGFyc2VQYXJ0aWFsVG9vbElucHV0Rm9yRGlzcGxheSgne1wiY29tbScpLFxuXHRcdFx0cGFyc2VQYXJ0aWFsVG9vbElucHV0Rm9yRGlzcGxheSgnY3VzdG9tIGlucHV0JyksXG5cdFx0XHRwYXJzZVBhcnRpYWxUb29sSW5wdXRGb3JEaXNwbGF5KCdbXCJpdGVtXCJdJyksXG5cdFx0XSwgW1xuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGEgc25hcHNob3QgaW5zdGVhZCBvZiB0aGUgY2FjaGVkIG9iamVjdCcsICgpID0+IHtcblx0XHRjb25zdCByYXcgPSAne1wiY29tbWFuZFwiOlwibnBtIHRlc3RcIn0nO1xuXHRcdGNvbnN0IGZpcnN0ID0gcGFyc2VQYXJ0aWFsVG9vbElucHV0Rm9yRGlzcGxheShyYXcpO1xuXHRcdGFzc2VydC5vayhmaXJzdCk7XG5cdFx0Zmlyc3RbJ2NvbW1hbmQnXSA9ICdtb2RpZmllZCc7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlUGFydGlhbFRvb2xJbnB1dEZvckRpc3BsYXkocmF3KSwge1xuXHRcdFx0Y29tbWFuZDogJ25wbSB0ZXN0Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYm91bmRzIGdlbmVyaWMgZGlzcGxheSBwYXJzaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJhdyA9IGB7XCJjb21tYW5kXCI6XCJucG0gdGVzdFwiLFwiY29udGVudFwiOlwiJHsneCcucmVwZWF0KDcwICogMTAyNCl9XCJ9YDtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZVBhcnRpYWxUb29sSW5wdXRGb3JEaXNwbGF5KHJhdyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb21tYW5kOiBwYXJzZWQ/LlsnY29tbWFuZCddLFxuXHRcdFx0Y29udGVudElzVHJ1bmNhdGVkOiB0eXBlb2YgcGFyc2VkPy5bJ2NvbnRlbnQnXSA9PT0gJ3N0cmluZycgJiYgcGFyc2VkWydjb250ZW50J10ubGVuZ3RoIDwgcmF3Lmxlbmd0aCxcblx0XHR9LCB7XG5cdFx0XHRjb21tYW5kOiAnbnBtIHRlc3QnLFxuXHRcdFx0Y29udGVudElzVHJ1bmNhdGVkOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdXBwb3J0cyB1bmNhcHBlZCBwcm92aWRlciBwYXJzaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAneCcucmVwZWF0KDcwICogMTAyNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlUGFydGlhbFRvb2xJbnB1dChge1wiY29udGVudFwiOlwiJHtjb250ZW50fVwifWApPy5bJ2NvbnRlbnQnXSwgY29udGVudCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx1QkFBdUIsdUNBQXVDO0FBRXZFLE1BQU0sb0JBQW9CLE1BQU07QUFDL0IsMENBQXdDO0FBRXhDLE9BQUsscURBQXFELE1BQU07QUFDL0QsV0FBTyxnQkFBZ0IsZ0NBQWdDLDBDQUEwQyxHQUFHO0FBQUEsTUFDbkcsU0FBUztBQUFBLE1BQ1QsYUFBYTtBQUFBLElBQ2QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsseURBQXlELE1BQU07QUFDbkUsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixnQ0FBZ0MsUUFBUTtBQUFBLE1BQ3hDLGdDQUFnQyxjQUFjO0FBQUEsTUFDOUMsZ0NBQWdDLFVBQVU7QUFBQSxJQUMzQyxHQUFHO0FBQUEsTUFDRjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxtREFBbUQsTUFBTTtBQUM3RCxVQUFNLE1BQU07QUFDWixVQUFNLFFBQVEsZ0NBQWdDLEdBQUc7QUFDakQsV0FBTyxHQUFHLEtBQUs7QUFDZixVQUFNLFNBQVMsSUFBSTtBQUVuQixXQUFPLGdCQUFnQixnQ0FBZ0MsR0FBRyxHQUFHO0FBQUEsTUFDNUQsU0FBUztBQUFBLElBQ1YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssa0NBQWtDLE1BQU07QUFDNUMsVUFBTSxNQUFNLG9DQUFvQyxJQUFJLE9BQU8sS0FBSyxJQUFJLENBQUM7QUFDckUsVUFBTSxTQUFTLGdDQUFnQyxHQUFHO0FBQ2xELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsU0FBUyxTQUFTLFNBQVM7QUFBQSxNQUMzQixvQkFBb0IsT0FBTyxTQUFTLFNBQVMsTUFBTSxZQUFZLE9BQU8sU0FBUyxFQUFFLFNBQVMsSUFBSTtBQUFBLElBQy9GLEdBQUc7QUFBQSxNQUNGLFNBQVM7QUFBQSxNQUNULG9CQUFvQjtBQUFBLElBQ3JCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHNDQUFzQyxNQUFNO0FBQ2hELFVBQU0sVUFBVSxJQUFJLE9BQU8sS0FBSyxJQUFJO0FBQ3BDLFdBQU8sWUFBWSxzQkFBc0IsZUFBZSxPQUFPLElBQUksSUFBSSxTQUFTLEdBQUcsT0FBTztBQUFBLEVBQzNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
