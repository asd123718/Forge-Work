import assert from "assert";
import { escapeIcons, getCodiconAriaLabel, markdownEscapeEscapedIcons, matchesFuzzyIconAware, parseLabelWithIcons, stripIcons } from "../../common/iconLabels.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
function filterOk(filter, word, target, highlights) {
  const r = filter(word, target);
  assert(r);
  if (highlights) {
    assert.deepStrictEqual(r, highlights);
  }
}
suite("Icon Labels", () => {
  test("Can get proper aria labels", () => {
    const testCases = /* @__PURE__ */ new Map([
      ["", ""],
      ["asdf", "asdf"],
      ["asdf$(squirrel)asdf", "asdf squirrel asdf"],
      ["asdf $(squirrel) asdf", "asdf  squirrel  asdf"],
      ["$(rocket)asdf", "rocket asdf"],
      ["$(rocket) asdf", "rocket  asdf"],
      ["$(rocket)$(rocket)$(rocket)asdf", "rocket  rocket  rocket asdf"],
      ["$(rocket) asdf $(rocket)", "rocket  asdf  rocket"],
      ["$(rocket)asdf$(rocket)", "rocket asdf rocket"]
    ]);
    for (const [input, expected] of testCases) {
      assert.strictEqual(getCodiconAriaLabel(input), expected);
    }
  });
  test("matchesFuzzyIconAware", () => {
    filterOk(matchesFuzzyIconAware, "ccr", parseLabelWithIcons("$(codicon)CamelCaseRocks$(codicon)"), [
      { start: 10, end: 11 },
      { start: 15, end: 16 },
      { start: 19, end: 20 }
    ]);
    filterOk(matchesFuzzyIconAware, "ccr", parseLabelWithIcons("$(codicon) CamelCaseRocks $(codicon)"), [
      { start: 11, end: 12 },
      { start: 16, end: 17 },
      { start: 20, end: 21 }
    ]);
    filterOk(matchesFuzzyIconAware, "iut", parseLabelWithIcons("$(codicon) Indent $(octico) Using $(octic) Tpaces"), [
      { start: 11, end: 12 },
      { start: 28, end: 29 },
      { start: 43, end: 44 }
    ]);
    filterOk(matchesFuzzyIconAware, "using", parseLabelWithIcons("$(codicon) Indent Using Spaces"), [
      { start: 18, end: 23 }
    ]);
    filterOk(matchesFuzzyIconAware, "codicon", parseLabelWithIcons("This $(codicon Indent Using Spaces"), [
      { start: 7, end: 14 }
    ]);
    filterOk(matchesFuzzyIconAware, "indent", parseLabelWithIcons("This $codicon Indent Using Spaces"), [
      { start: 14, end: 20 }
    ]);
    filterOk(matchesFuzzyIconAware, "unt", parseLabelWithIcons("$(primitive-dot) $(file-text) Untitled-1"), [
      { start: 30, end: 33 }
    ]);
    filterOk(matchesFuzzyIconAware, "s", parseLabelWithIcons("$(loading~spin) start"), [
      { start: 16, end: 17 }
    ]);
  });
  test("stripIcons", () => {
    assert.strictEqual(stripIcons("Hello World"), "Hello World");
    assert.strictEqual(stripIcons("$(Hello World"), "$(Hello World");
    assert.strictEqual(stripIcons("$(Hello) World"), " World");
    assert.strictEqual(stripIcons("$(Hello) W$(oi)rld"), " Wrld");
  });
  test("escapeIcons", () => {
    assert.strictEqual(escapeIcons("Hello World"), "Hello World");
    assert.strictEqual(escapeIcons("$(Hello World"), "$(Hello World");
    assert.strictEqual(escapeIcons("$(Hello) World"), "\\$(Hello) World");
    assert.strictEqual(escapeIcons("\\$(Hello) W$(oi)rld"), "\\$(Hello) W\\$(oi)rld");
  });
  test("markdownEscapeEscapedIcons", () => {
    assert.strictEqual(markdownEscapeEscapedIcons("Hello World"), "Hello World");
    assert.strictEqual(markdownEscapeEscapedIcons("$(Hello) World"), "$(Hello) World");
    assert.strictEqual(markdownEscapeEscapedIcons("\\$(Hello) World"), "\\\\$(Hello) World");
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGljb25MYWJlbHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IElNYXRjaCB9IGZyb20gJy4uLy4uL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IGVzY2FwZUljb25zLCBnZXRDb2RpY29uQXJpYUxhYmVsLCBJUGFyc2VkTGFiZWxXaXRoSWNvbnMsIG1hcmtkb3duRXNjYXBlRXNjYXBlZEljb25zLCBtYXRjaGVzRnV6enlJY29uQXdhcmUsIHBhcnNlTGFiZWxXaXRoSWNvbnMsIHN0cmlwSWNvbnMgfSBmcm9tICcuLi8uLi9jb21tb24vaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuL3V0aWxzLmpzJztcblxuaW50ZXJmYWNlIElJY29uRmlsdGVyIHtcblx0Ly8gUmV0dXJucyBudWxsIGlmIHdvcmQgZG9lc24ndCBtYXRjaC5cblx0KHF1ZXJ5OiBzdHJpbmcsIHRhcmdldDogSVBhcnNlZExhYmVsV2l0aEljb25zKTogSU1hdGNoW10gfCBudWxsO1xufVxuXG5mdW5jdGlvbiBmaWx0ZXJPayhmaWx0ZXI6IElJY29uRmlsdGVyLCB3b3JkOiBzdHJpbmcsIHRhcmdldDogSVBhcnNlZExhYmVsV2l0aEljb25zLCBoaWdobGlnaHRzPzogeyBzdGFydDogbnVtYmVyOyBlbmQ6IG51bWJlciB9W10pIHtcblx0Y29uc3QgciA9IGZpbHRlcih3b3JkLCB0YXJnZXQpO1xuXHRhc3NlcnQocik7XG5cdGlmIChoaWdobGlnaHRzKSB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyLCBoaWdobGlnaHRzKTtcblx0fVxufVxuXG5zdWl0ZSgnSWNvbiBMYWJlbHMnLCAoKSA9PiB7XG5cdHRlc3QoJ0NhbiBnZXQgcHJvcGVyIGFyaWEgbGFiZWxzJywgKCkgPT4ge1xuXHRcdC8vIG5vdGUsIHRoZSBzcGFjZXMgaW4gdGhlIHJlc3VsdHMgYXJlIGltcG9ydGFudFxuXHRcdGNvbnN0IHRlc3RDYXNlcyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KFtcblx0XHRcdFsnJywgJyddLFxuXHRcdFx0Wydhc2RmJywgJ2FzZGYnXSxcblx0XHRcdFsnYXNkZiQoc3F1aXJyZWwpYXNkZicsICdhc2RmIHNxdWlycmVsIGFzZGYnXSxcblx0XHRcdFsnYXNkZiAkKHNxdWlycmVsKSBhc2RmJywgJ2FzZGYgIHNxdWlycmVsICBhc2RmJ10sXG5cdFx0XHRbJyQocm9ja2V0KWFzZGYnLCAncm9ja2V0IGFzZGYnXSxcblx0XHRcdFsnJChyb2NrZXQpIGFzZGYnLCAncm9ja2V0ICBhc2RmJ10sXG5cdFx0XHRbJyQocm9ja2V0KSQocm9ja2V0KSQocm9ja2V0KWFzZGYnLCAncm9ja2V0ICByb2NrZXQgIHJvY2tldCBhc2RmJ10sXG5cdFx0XHRbJyQocm9ja2V0KSBhc2RmICQocm9ja2V0KScsICdyb2NrZXQgIGFzZGYgIHJvY2tldCddLFxuXHRcdFx0WyckKHJvY2tldClhc2RmJChyb2NrZXQpJywgJ3JvY2tldCBhc2RmIHJvY2tldCddLFxuXHRcdF0pO1xuXG5cdFx0Zm9yIChjb25zdCBbaW5wdXQsIGV4cGVjdGVkXSBvZiB0ZXN0Q2FzZXMpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDb2RpY29uQXJpYUxhYmVsKGlucHV0KSwgZXhwZWN0ZWQpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnbWF0Y2hlc0Z1enp5SWNvbkF3YXJlJywgKCkgPT4ge1xuXG5cdFx0Ly8gQ2FtZWwgQ2FzZVxuXG5cdFx0ZmlsdGVyT2sobWF0Y2hlc0Z1enp5SWNvbkF3YXJlLCAnY2NyJywgcGFyc2VMYWJlbFdpdGhJY29ucygnJChjb2RpY29uKUNhbWVsQ2FzZVJvY2tzJChjb2RpY29uKScpLCBbXG5cdFx0XHR7IHN0YXJ0OiAxMCwgZW5kOiAxMSB9LFxuXHRcdFx0eyBzdGFydDogMTUsIGVuZDogMTYgfSxcblx0XHRcdHsgc3RhcnQ6IDE5LCBlbmQ6IDIwIH1cblx0XHRdKTtcblxuXHRcdGZpbHRlck9rKG1hdGNoZXNGdXp6eUljb25Bd2FyZSwgJ2NjcicsIHBhcnNlTGFiZWxXaXRoSWNvbnMoJyQoY29kaWNvbikgQ2FtZWxDYXNlUm9ja3MgJChjb2RpY29uKScpLCBbXG5cdFx0XHR7IHN0YXJ0OiAxMSwgZW5kOiAxMiB9LFxuXHRcdFx0eyBzdGFydDogMTYsIGVuZDogMTcgfSxcblx0XHRcdHsgc3RhcnQ6IDIwLCBlbmQ6IDIxIH1cblx0XHRdKTtcblxuXHRcdGZpbHRlck9rKG1hdGNoZXNGdXp6eUljb25Bd2FyZSwgJ2l1dCcsIHBhcnNlTGFiZWxXaXRoSWNvbnMoJyQoY29kaWNvbikgSW5kZW50ICQob2N0aWNvKSBVc2luZyAkKG9jdGljKSBUcGFjZXMnKSwgW1xuXHRcdFx0eyBzdGFydDogMTEsIGVuZDogMTIgfSxcblx0XHRcdHsgc3RhcnQ6IDI4LCBlbmQ6IDI5IH0sXG5cdFx0XHR7IHN0YXJ0OiA0MywgZW5kOiA0NCB9LFxuXHRcdF0pO1xuXG5cdFx0Ly8gUHJlZml4XG5cblx0XHRmaWx0ZXJPayhtYXRjaGVzRnV6enlJY29uQXdhcmUsICd1c2luZycsIHBhcnNlTGFiZWxXaXRoSWNvbnMoJyQoY29kaWNvbikgSW5kZW50IFVzaW5nIFNwYWNlcycpLCBbXG5cdFx0XHR7IHN0YXJ0OiAxOCwgZW5kOiAyMyB9LFxuXHRcdF0pO1xuXG5cdFx0Ly8gQnJva2VuIENvZGljb25cblxuXHRcdGZpbHRlck9rKG1hdGNoZXNGdXp6eUljb25Bd2FyZSwgJ2NvZGljb24nLCBwYXJzZUxhYmVsV2l0aEljb25zKCdUaGlzICQoY29kaWNvbiBJbmRlbnQgVXNpbmcgU3BhY2VzJyksIFtcblx0XHRcdHsgc3RhcnQ6IDcsIGVuZDogMTQgfSxcblx0XHRdKTtcblxuXHRcdGZpbHRlck9rKG1hdGNoZXNGdXp6eUljb25Bd2FyZSwgJ2luZGVudCcsIHBhcnNlTGFiZWxXaXRoSWNvbnMoJ1RoaXMgJGNvZGljb24gSW5kZW50IFVzaW5nIFNwYWNlcycpLCBbXG5cdFx0XHR7IHN0YXJ0OiAxNCwgZW5kOiAyMCB9LFxuXHRcdF0pO1xuXG5cdFx0Ly8gVGVzdGluZyAjNTkzNDNcblx0XHRmaWx0ZXJPayhtYXRjaGVzRnV6enlJY29uQXdhcmUsICd1bnQnLCBwYXJzZUxhYmVsV2l0aEljb25zKCckKHByaW1pdGl2ZS1kb3QpICQoZmlsZS10ZXh0KSBVbnRpdGxlZC0xJyksIFtcblx0XHRcdHsgc3RhcnQ6IDMwLCBlbmQ6IDMzIH0sXG5cdFx0XSk7XG5cblx0XHQvLyBUZXN0aW5nICMxMzYxNzJcblx0XHRmaWx0ZXJPayhtYXRjaGVzRnV6enlJY29uQXdhcmUsICdzJywgcGFyc2VMYWJlbFdpdGhJY29ucygnJChsb2FkaW5nfnNwaW4pIHN0YXJ0JyksIFtcblx0XHRcdHsgc3RhcnQ6IDE2LCBlbmQ6IDE3IH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmlwSWNvbnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmlwSWNvbnMoJ0hlbGxvIFdvcmxkJyksICdIZWxsbyBXb3JsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdHJpcEljb25zKCckKEhlbGxvIFdvcmxkJyksICckKEhlbGxvIFdvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmlwSWNvbnMoJyQoSGVsbG8pIFdvcmxkJyksICcgV29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyaXBJY29ucygnJChIZWxsbykgVyQob2kpcmxkJyksICcgV3JsZCcpO1xuXHR9KTtcblxuXG5cdHRlc3QoJ2VzY2FwZUljb25zJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlc2NhcGVJY29ucygnSGVsbG8gV29ybGQnKSwgJ0hlbGxvIFdvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVzY2FwZUljb25zKCckKEhlbGxvIFdvcmxkJyksICckKEhlbGxvIFdvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVzY2FwZUljb25zKCckKEhlbGxvKSBXb3JsZCcpLCAnXFxcXCQoSGVsbG8pIFdvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVzY2FwZUljb25zKCdcXFxcJChIZWxsbykgVyQob2kpcmxkJyksICdcXFxcJChIZWxsbykgV1xcXFwkKG9pKXJsZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXJrZG93bkVzY2FwZUVzY2FwZWRJY29ucycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Rvd25Fc2NhcGVFc2NhcGVkSWNvbnMoJ0hlbGxvIFdvcmxkJyksICdIZWxsbyBXb3JsZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZG93bkVzY2FwZUVzY2FwZWRJY29ucygnJChIZWxsbykgV29ybGQnKSwgJyQoSGVsbG8pIFdvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtkb3duRXNjYXBlRXNjYXBlZEljb25zKCdcXFxcJChIZWxsbykgV29ybGQnKSwgJ1xcXFxcXFxcJChIZWxsbykgV29ybGQnKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixTQUFTLGFBQWEscUJBQTRDLDRCQUE0Qix1QkFBdUIscUJBQXFCLGtCQUFrQjtBQUM1SixTQUFTLCtDQUErQztBQU94RCxTQUFTLFNBQVMsUUFBcUIsTUFBYyxRQUErQixZQUErQztBQUNsSSxRQUFNLElBQUksT0FBTyxNQUFNLE1BQU07QUFDN0IsU0FBTyxDQUFDO0FBQ1IsTUFBSSxZQUFZO0FBQ2YsV0FBTyxnQkFBZ0IsR0FBRyxVQUFVO0FBQUEsRUFDckM7QUFDRDtBQUVBLE1BQU0sZUFBZSxNQUFNO0FBQzFCLE9BQUssOEJBQThCLE1BQU07QUFFeEMsVUFBTSxZQUFZLG9CQUFJLElBQW9CO0FBQUEsTUFDekMsQ0FBQyxJQUFJLEVBQUU7QUFBQSxNQUNQLENBQUMsUUFBUSxNQUFNO0FBQUEsTUFDZixDQUFDLHVCQUF1QixvQkFBb0I7QUFBQSxNQUM1QyxDQUFDLHlCQUF5QixzQkFBc0I7QUFBQSxNQUNoRCxDQUFDLGlCQUFpQixhQUFhO0FBQUEsTUFDL0IsQ0FBQyxrQkFBa0IsY0FBYztBQUFBLE1BQ2pDLENBQUMsbUNBQW1DLDZCQUE2QjtBQUFBLE1BQ2pFLENBQUMsNEJBQTRCLHNCQUFzQjtBQUFBLE1BQ25ELENBQUMsMEJBQTBCLG9CQUFvQjtBQUFBLElBQ2hELENBQUM7QUFFRCxlQUFXLENBQUMsT0FBTyxRQUFRLEtBQUssV0FBVztBQUMxQyxhQUFPLFlBQVksb0JBQW9CLEtBQUssR0FBRyxRQUFRO0FBQUEsSUFDeEQ7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHlCQUF5QixNQUFNO0FBSW5DLGFBQVMsdUJBQXVCLE9BQU8sb0JBQW9CLG9DQUFvQyxHQUFHO0FBQUEsTUFDakcsRUFBRSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsTUFDckIsRUFBRSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsTUFDckIsRUFBRSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsSUFDdEIsQ0FBQztBQUVELGFBQVMsdUJBQXVCLE9BQU8sb0JBQW9CLHNDQUFzQyxHQUFHO0FBQUEsTUFDbkcsRUFBRSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsTUFDckIsRUFBRSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsTUFDckIsRUFBRSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsSUFDdEIsQ0FBQztBQUVELGFBQVMsdUJBQXVCLE9BQU8sb0JBQW9CLG1EQUFtRCxHQUFHO0FBQUEsTUFDaEgsRUFBRSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsTUFDckIsRUFBRSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsTUFDckIsRUFBRSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsSUFDdEIsQ0FBQztBQUlELGFBQVMsdUJBQXVCLFNBQVMsb0JBQW9CLGdDQUFnQyxHQUFHO0FBQUEsTUFDL0YsRUFBRSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsSUFDdEIsQ0FBQztBQUlELGFBQVMsdUJBQXVCLFdBQVcsb0JBQW9CLG9DQUFvQyxHQUFHO0FBQUEsTUFDckcsRUFBRSxPQUFPLEdBQUcsS0FBSyxHQUFHO0FBQUEsSUFDckIsQ0FBQztBQUVELGFBQVMsdUJBQXVCLFVBQVUsb0JBQW9CLG1DQUFtQyxHQUFHO0FBQUEsTUFDbkcsRUFBRSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsSUFDdEIsQ0FBQztBQUdELGFBQVMsdUJBQXVCLE9BQU8sb0JBQW9CLDBDQUEwQyxHQUFHO0FBQUEsTUFDdkcsRUFBRSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsSUFDdEIsQ0FBQztBQUdELGFBQVMsdUJBQXVCLEtBQUssb0JBQW9CLHVCQUF1QixHQUFHO0FBQUEsTUFDbEYsRUFBRSxPQUFPLElBQUksS0FBSyxHQUFHO0FBQUEsSUFDdEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssY0FBYyxNQUFNO0FBQ3hCLFdBQU8sWUFBWSxXQUFXLGFBQWEsR0FBRyxhQUFhO0FBQzNELFdBQU8sWUFBWSxXQUFXLGVBQWUsR0FBRyxlQUFlO0FBQy9ELFdBQU8sWUFBWSxXQUFXLGdCQUFnQixHQUFHLFFBQVE7QUFDekQsV0FBTyxZQUFZLFdBQVcsb0JBQW9CLEdBQUcsT0FBTztBQUFBLEVBQzdELENBQUM7QUFHRCxPQUFLLGVBQWUsTUFBTTtBQUN6QixXQUFPLFlBQVksWUFBWSxhQUFhLEdBQUcsYUFBYTtBQUM1RCxXQUFPLFlBQVksWUFBWSxlQUFlLEdBQUcsZUFBZTtBQUNoRSxXQUFPLFlBQVksWUFBWSxnQkFBZ0IsR0FBRyxrQkFBa0I7QUFDcEUsV0FBTyxZQUFZLFlBQVksc0JBQXNCLEdBQUcsd0JBQXdCO0FBQUEsRUFDakYsQ0FBQztBQUVELE9BQUssOEJBQThCLE1BQU07QUFDeEMsV0FBTyxZQUFZLDJCQUEyQixhQUFhLEdBQUcsYUFBYTtBQUMzRSxXQUFPLFlBQVksMkJBQTJCLGdCQUFnQixHQUFHLGdCQUFnQjtBQUNqRixXQUFPLFlBQVksMkJBQTJCLGtCQUFrQixHQUFHLG9CQUFvQjtBQUFBLEVBQ3hGLENBQUM7QUFFRCwwQ0FBd0M7QUFDekMsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
