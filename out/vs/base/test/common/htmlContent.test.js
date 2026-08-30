import assert from "assert";
import { appendEscapedMarkdownInlineCode, escapeMarkdownLinkLabel, escapeMarkdownSyntaxTokens } from "../../common/htmlContent.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("htmlContent", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("appendEscapedMarkdownInlineCode", () => {
    test("wraps plain text in single backticks", () => {
      assert.strictEqual(appendEscapedMarkdownInlineCode("hello"), "`hello`");
      assert.strictEqual(appendEscapedMarkdownInlineCode(""), "``");
      assert.strictEqual(appendEscapedMarkdownInlineCode("foo bar"), "`foo bar`");
    });
    test("chooses a fence longer than any backtick run in the content", () => {
      assert.strictEqual(appendEscapedMarkdownInlineCode("a`b"), "``a`b``");
      assert.strictEqual(appendEscapedMarkdownInlineCode("a``b"), "```a``b```");
      assert.strictEqual(appendEscapedMarkdownInlineCode("a```b```c"), "````a```b```c````");
    });
    test("pads with spaces when the content begins or ends with a backtick", () => {
      assert.strictEqual(appendEscapedMarkdownInlineCode("`"), "`` ` ``");
      assert.strictEqual(appendEscapedMarkdownInlineCode("`hello"), "`` `hello ``");
      assert.strictEqual(appendEscapedMarkdownInlineCode("hello`"), "`` hello` ``");
      assert.strictEqual(appendEscapedMarkdownInlineCode("`a`b`"), "`` `a`b` ``");
    });
    test("does not pad when backticks are only in the interior", () => {
      assert.strictEqual(appendEscapedMarkdownInlineCode("a`b"), "``a`b``");
    });
    test("handles content composed entirely of backticks", () => {
      assert.strictEqual(appendEscapedMarkdownInlineCode("``"), "``` `` ```");
    });
  });
  suite("escapeMarkdownLinkLabel", () => {
    test("passes plain text through unchanged", () => {
      assert.strictEqual(escapeMarkdownLinkLabel("hello"), "hello");
      assert.strictEqual(escapeMarkdownLinkLabel(""), "");
      assert.strictEqual(escapeMarkdownLinkLabel("heap-snapshot-analysis"), "heap-snapshot-analysis");
      assert.strictEqual(escapeMarkdownLinkLabel("foo.bar_baz"), "foo.bar_baz");
    });
    test("escapes only `\\` and `]`", () => {
      assert.strictEqual(escapeMarkdownLinkLabel("a]b"), "a\\]b");
      assert.strictEqual(escapeMarkdownLinkLabel("a\\b"), "a\\\\b");
      assert.strictEqual(escapeMarkdownLinkLabel("]]"), "\\]\\]");
    });
    test("does not escape characters that are safe in link text", () => {
      assert.strictEqual(escapeMarkdownLinkLabel("a*b_c#d-e.f!g~h+i(j)k{l}m"), "a*b_c#d-e.f!g~h+i(j)k{l}m");
    });
  });
  suite("escapeMarkdownSyntaxTokens", () => {
    test("escapes inline syntax tokens anywhere", () => {
      assert.strictEqual(escapeMarkdownSyntaxTokens("a*b_c`d[e]f(g)h#i+j!k~l{m}"), "a\\*b\\_c\\`d\\[e\\]f\\(g\\)h\\#i\\+j\\!k\\~l\\{m\\}");
    });
    test("does not escape mid-line dashes", () => {
      assert.strictEqual(escapeMarkdownSyntaxTokens("heap-snapshot-analysis"), "heap-snapshot-analysis");
      assert.strictEqual(escapeMarkdownSyntaxTokens("npm run foo-bar"), "npm run foo-bar");
    });
    test("escapes dashes that start a line", () => {
      assert.strictEqual(escapeMarkdownSyntaxTokens("- item"), "\\- item");
      assert.strictEqual(escapeMarkdownSyntaxTokens("  - indented"), "  \\- indented");
      assert.strictEqual(escapeMarkdownSyntaxTokens("---"), "\\---");
      assert.strictEqual(escapeMarkdownSyntaxTokens("line one\n- item"), "line one\n\\- item");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGh0bWxDb250ZW50LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSwgZXNjYXBlTWFya2Rvd25MaW5rTGFiZWwsIGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zIH0gZnJvbSAnLi4vLi4vY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4vdXRpbHMuanMnO1xuXG5zdWl0ZSgnaHRtbENvbnRlbnQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3dyYXBzIHBsYWluIHRleHQgaW4gc2luZ2xlIGJhY2t0aWNrcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKCdoZWxsbycpLCAnYGhlbGxvYCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUoJycpLCAnYGAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKCdmb28gYmFyJyksICdgZm9vIGJhcmAnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Nob29zZXMgYSBmZW5jZSBsb25nZXIgdGhhbiBhbnkgYmFja3RpY2sgcnVuIGluIHRoZSBjb250ZW50JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUoJ2FgYicpLCAnYGBhYGJgYCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUoJ2FgYGInKSwgJ2BgYGFgYGJgYGAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKCdhYGBgYmBgYGMnKSwgJ2BgYGBhYGBgYmBgYGNgYGBgJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYWRzIHdpdGggc3BhY2VzIHdoZW4gdGhlIGNvbnRlbnQgYmVnaW5zIG9yIGVuZHMgd2l0aCBhIGJhY2t0aWNrJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUoJ2AnKSwgJ2BgIGAgYGAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKCdgaGVsbG8nKSwgJ2BgIGBoZWxsbyBgYCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUoJ2hlbGxvYCcpLCAnYGAgaGVsbG9gIGBgJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZSgnYGFgYmAnKSwgJ2BgIGBhYGJgIGBgJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBwYWQgd2hlbiBiYWNrdGlja3MgYXJlIG9ubHkgaW4gdGhlIGludGVyaW9yJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUoJ2FgYicpLCAnYGBhYGJgYCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBjb250ZW50IGNvbXBvc2VkIGVudGlyZWx5IG9mIGJhY2t0aWNrcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKCdgYCcpLCAnYGBgIGBgIGBgYCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZXNjYXBlTWFya2Rvd25MaW5rTGFiZWwnLCAoKSA9PiB7XG5cdFx0dGVzdCgncGFzc2VzIHBsYWluIHRleHQgdGhyb3VnaCB1bmNoYW5nZWQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXNjYXBlTWFya2Rvd25MaW5rTGFiZWwoJ2hlbGxvJyksICdoZWxsbycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVzY2FwZU1hcmtkb3duTGlua0xhYmVsKCcnKSwgJycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVzY2FwZU1hcmtkb3duTGlua0xhYmVsKCdoZWFwLXNuYXBzaG90LWFuYWx5c2lzJyksICdoZWFwLXNuYXBzaG90LWFuYWx5c2lzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXNjYXBlTWFya2Rvd25MaW5rTGFiZWwoJ2Zvby5iYXJfYmF6JyksICdmb28uYmFyX2JheicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXNjYXBlcyBvbmx5IGBcXFxcYCBhbmQgYF1gJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVzY2FwZU1hcmtkb3duTGlua0xhYmVsKCdhXWInKSwgJ2FcXFxcXWInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlc2NhcGVNYXJrZG93bkxpbmtMYWJlbCgnYVxcXFxiJyksICdhXFxcXFxcXFxiJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXNjYXBlTWFya2Rvd25MaW5rTGFiZWwoJ11dJyksICdcXFxcXVxcXFxdJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBlc2NhcGUgY2hhcmFjdGVycyB0aGF0IGFyZSBzYWZlIGluIGxpbmsgdGV4dCcsICgpID0+IHtcblx0XHRcdC8vIHRoZXNlIHdvdWxkIGJlIGVzY2FwZWQgYnkgZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMgYnV0IG11c3Rcblx0XHRcdC8vIHBhc3MgdGhyb3VnaCBoZXJlIHNpbmNlIHRoZXkgcmVuZGVyIGxpdGVyYWxseSBpbnNpZGUgYFsuLi5dYC5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlc2NhcGVNYXJrZG93bkxpbmtMYWJlbCgnYSpiX2MjZC1lLmYhZ35oK2koailre2x9bScpLCAnYSpiX2MjZC1lLmYhZ35oK2koailre2x9bScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZXNjYXBlcyBpbmxpbmUgc3ludGF4IHRva2VucyBhbnl3aGVyZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlc2NhcGVNYXJrZG93blN5bnRheFRva2VucygnYSpiX2NgZFtlXWYoZyloI2kraiFrfmx7bX0nKSwgJ2FcXFxcKmJcXFxcX2NcXFxcYGRcXFxcW2VcXFxcXWZcXFxcKGdcXFxcKWhcXFxcI2lcXFxcK2pcXFxcIWtcXFxcfmxcXFxce21cXFxcfScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgZXNjYXBlIG1pZC1saW5lIGRhc2hlcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlc2NhcGVNYXJrZG93blN5bnRheFRva2VucygnaGVhcC1zbmFwc2hvdC1hbmFseXNpcycpLCAnaGVhcC1zbmFwc2hvdC1hbmFseXNpcycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKCducG0gcnVuIGZvby1iYXInKSwgJ25wbSBydW4gZm9vLWJhcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXNjYXBlcyBkYXNoZXMgdGhhdCBzdGFydCBhIGxpbmUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMoJy0gaXRlbScpLCAnXFxcXC0gaXRlbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKCcgIC0gaW5kZW50ZWQnKSwgJyAgXFxcXC0gaW5kZW50ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlc2NhcGVNYXJrZG93blN5bnRheFRva2VucygnLS0tJyksICdcXFxcLS0tJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMoJ2xpbmUgb25lXFxuLSBpdGVtJyksICdsaW5lIG9uZVxcblxcXFwtIGl0ZW0nKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGlDQUFpQyx5QkFBeUIsa0NBQWtDO0FBQ3JHLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sZUFBZSxNQUFNO0FBQzFCLDBDQUF3QztBQUV4QyxRQUFNLG1DQUFtQyxNQUFNO0FBQzlDLFNBQUssd0NBQXdDLE1BQU07QUFDbEQsYUFBTyxZQUFZLGdDQUFnQyxPQUFPLEdBQUcsU0FBUztBQUN0RSxhQUFPLFlBQVksZ0NBQWdDLEVBQUUsR0FBRyxJQUFJO0FBQzVELGFBQU8sWUFBWSxnQ0FBZ0MsU0FBUyxHQUFHLFdBQVc7QUFBQSxJQUMzRSxDQUFDO0FBRUQsU0FBSywrREFBK0QsTUFBTTtBQUN6RSxhQUFPLFlBQVksZ0NBQWdDLEtBQUssR0FBRyxTQUFTO0FBQ3BFLGFBQU8sWUFBWSxnQ0FBZ0MsTUFBTSxHQUFHLFlBQVk7QUFDeEUsYUFBTyxZQUFZLGdDQUFnQyxXQUFXLEdBQUcsbUJBQW1CO0FBQUEsSUFDckYsQ0FBQztBQUVELFNBQUssb0VBQW9FLE1BQU07QUFDOUUsYUFBTyxZQUFZLGdDQUFnQyxHQUFHLEdBQUcsU0FBUztBQUNsRSxhQUFPLFlBQVksZ0NBQWdDLFFBQVEsR0FBRyxjQUFjO0FBQzVFLGFBQU8sWUFBWSxnQ0FBZ0MsUUFBUSxHQUFHLGNBQWM7QUFDNUUsYUFBTyxZQUFZLGdDQUFnQyxPQUFPLEdBQUcsYUFBYTtBQUFBLElBQzNFLENBQUM7QUFFRCxTQUFLLHdEQUF3RCxNQUFNO0FBQ2xFLGFBQU8sWUFBWSxnQ0FBZ0MsS0FBSyxHQUFHLFNBQVM7QUFBQSxJQUNyRSxDQUFDO0FBRUQsU0FBSyxrREFBa0QsTUFBTTtBQUM1RCxhQUFPLFlBQVksZ0NBQWdDLElBQUksR0FBRyxZQUFZO0FBQUEsSUFDdkUsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sMkJBQTJCLE1BQU07QUFDdEMsU0FBSyx1Q0FBdUMsTUFBTTtBQUNqRCxhQUFPLFlBQVksd0JBQXdCLE9BQU8sR0FBRyxPQUFPO0FBQzVELGFBQU8sWUFBWSx3QkFBd0IsRUFBRSxHQUFHLEVBQUU7QUFDbEQsYUFBTyxZQUFZLHdCQUF3Qix3QkFBd0IsR0FBRyx3QkFBd0I7QUFDOUYsYUFBTyxZQUFZLHdCQUF3QixhQUFhLEdBQUcsYUFBYTtBQUFBLElBQ3pFLENBQUM7QUFFRCxTQUFLLDZCQUE2QixNQUFNO0FBQ3ZDLGFBQU8sWUFBWSx3QkFBd0IsS0FBSyxHQUFHLE9BQU87QUFDMUQsYUFBTyxZQUFZLHdCQUF3QixNQUFNLEdBQUcsUUFBUTtBQUM1RCxhQUFPLFlBQVksd0JBQXdCLElBQUksR0FBRyxRQUFRO0FBQUEsSUFDM0QsQ0FBQztBQUVELFNBQUsseURBQXlELE1BQU07QUFHbkUsYUFBTyxZQUFZLHdCQUF3QiwyQkFBMkIsR0FBRywyQkFBMkI7QUFBQSxJQUNyRyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSw4QkFBOEIsTUFBTTtBQUN6QyxTQUFLLHlDQUF5QyxNQUFNO0FBQ25ELGFBQU8sWUFBWSwyQkFBMkIsNEJBQTRCLEdBQUcsc0RBQXNEO0FBQUEsSUFDcEksQ0FBQztBQUVELFNBQUssbUNBQW1DLE1BQU07QUFDN0MsYUFBTyxZQUFZLDJCQUEyQix3QkFBd0IsR0FBRyx3QkFBd0I7QUFDakcsYUFBTyxZQUFZLDJCQUEyQixpQkFBaUIsR0FBRyxpQkFBaUI7QUFBQSxJQUNwRixDQUFDO0FBRUQsU0FBSyxvQ0FBb0MsTUFBTTtBQUM5QyxhQUFPLFlBQVksMkJBQTJCLFFBQVEsR0FBRyxVQUFVO0FBQ25FLGFBQU8sWUFBWSwyQkFBMkIsY0FBYyxHQUFHLGdCQUFnQjtBQUMvRSxhQUFPLFlBQVksMkJBQTJCLEtBQUssR0FBRyxPQUFPO0FBQzdELGFBQU8sWUFBWSwyQkFBMkIsa0JBQWtCLEdBQUcsb0JBQW9CO0FBQUEsSUFDeEYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
