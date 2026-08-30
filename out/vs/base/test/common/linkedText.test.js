import assert from "assert";
import { parseLinkedText } from "../../common/linkedText.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("LinkedText", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("parses correctly", () => {
    assert.deepStrictEqual(parseLinkedText("").nodes, []);
    assert.deepStrictEqual(parseLinkedText("hello").nodes, ["hello"]);
    assert.deepStrictEqual(parseLinkedText("hello there").nodes, ["hello there"]);
    assert.deepStrictEqual(parseLinkedText("Some message with [link text](http://link.href).").nodes, [
      "Some message with ",
      { label: "link text", href: "http://link.href" },
      "."
    ]);
    assert.deepStrictEqual(parseLinkedText('Some message with [link text](http://link.href "and a title").').nodes, [
      "Some message with ",
      { label: "link text", href: "http://link.href", title: "and a title" },
      "."
    ]);
    assert.deepStrictEqual(parseLinkedText("Some message with [link text](http://link.href 'and a title').").nodes, [
      "Some message with ",
      { label: "link text", href: "http://link.href", title: "and a title" },
      "."
    ]);
    assert.deepStrictEqual(parseLinkedText(`Some message with [link text](http://link.href "and a 'title'").`).nodes, [
      "Some message with ",
      { label: "link text", href: "http://link.href", title: "and a 'title'" },
      "."
    ]);
    assert.deepStrictEqual(parseLinkedText(`Some message with [link text](http://link.href 'and a "title"').`).nodes, [
      "Some message with ",
      { label: "link text", href: "http://link.href", title: 'and a "title"' },
      "."
    ]);
    assert.deepStrictEqual(parseLinkedText("Some message with [link text](random stuff).").nodes, [
      "Some message with [link text](random stuff)."
    ]);
    assert.deepStrictEqual(parseLinkedText("Some message with [https link](https://link.href).").nodes, [
      "Some message with ",
      { label: "https link", href: "https://link.href" },
      "."
    ]);
    assert.deepStrictEqual(parseLinkedText("Some message with [https link](https:).").nodes, [
      "Some message with [https link](https:)."
    ]);
    assert.deepStrictEqual(parseLinkedText("Some message with [a command](command:foobar).").nodes, [
      "Some message with ",
      { label: "a command", href: "command:foobar" },
      "."
    ]);
    assert.deepStrictEqual(parseLinkedText("Some message with [a command](command:).").nodes, [
      "Some message with [a command](command:)."
    ]);
    assert.deepStrictEqual(parseLinkedText('link [one](command:foo "nice") and link [two](http://foo)...').nodes, [
      "link ",
      { label: "one", href: "command:foo", title: "nice" },
      " and link ",
      { label: "two", href: "http://foo" },
      "..."
    ]);
    assert.deepStrictEqual(parseLinkedText('link\n[one](command:foo "nice")\nand link [two](http://foo)...').nodes, [
      "link\n",
      { label: "one", href: "command:foo", title: "nice" },
      "\nand link ",
      { label: "two", href: "http://foo" },
      "..."
    ]);
  });
  test("Should match non-greedily", () => {
    assert.deepStrictEqual(parseLinkedText('a [link text 1](http://link.href "title1") b [link text 2](http://link.href "title2") c').nodes, [
      "a ",
      { label: "link text 1", href: "http://link.href", title: "title1" },
      " b ",
      { label: "link text 2", href: "http://link.href", title: "title2" },
      " c"
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGxpbmtlZFRleHQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHBhcnNlTGlua2VkVGV4dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9saW5rZWRUZXh0LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4vdXRpbHMuanMnO1xuXG5zdWl0ZSgnTGlua2VkVGV4dCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncGFyc2VzIGNvcnJlY3RseScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGlua2VkVGV4dCgnJykubm9kZXMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGlua2VkVGV4dCgnaGVsbG8nKS5ub2RlcywgWydoZWxsbyddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGlua2VkVGV4dCgnaGVsbG8gdGhlcmUnKS5ub2RlcywgWydoZWxsbyB0aGVyZSddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGlua2VkVGV4dCgnU29tZSBtZXNzYWdlIHdpdGggW2xpbmsgdGV4dF0oaHR0cDovL2xpbmsuaHJlZikuJykubm9kZXMsIFtcblx0XHRcdCdTb21lIG1lc3NhZ2Ugd2l0aCAnLFxuXHRcdFx0eyBsYWJlbDogJ2xpbmsgdGV4dCcsIGhyZWY6ICdodHRwOi8vbGluay5ocmVmJyB9LFxuXHRcdFx0Jy4nXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZUxpbmtlZFRleHQoJ1NvbWUgbWVzc2FnZSB3aXRoIFtsaW5rIHRleHRdKGh0dHA6Ly9saW5rLmhyZWYgXCJhbmQgYSB0aXRsZVwiKS4nKS5ub2RlcywgW1xuXHRcdFx0J1NvbWUgbWVzc2FnZSB3aXRoICcsXG5cdFx0XHR7IGxhYmVsOiAnbGluayB0ZXh0JywgaHJlZjogJ2h0dHA6Ly9saW5rLmhyZWYnLCB0aXRsZTogJ2FuZCBhIHRpdGxlJyB9LFxuXHRcdFx0Jy4nXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZUxpbmtlZFRleHQoJ1NvbWUgbWVzc2FnZSB3aXRoIFtsaW5rIHRleHRdKGh0dHA6Ly9saW5rLmhyZWYgXFwnYW5kIGEgdGl0bGVcXCcpLicpLm5vZGVzLCBbXG5cdFx0XHQnU29tZSBtZXNzYWdlIHdpdGggJyxcblx0XHRcdHsgbGFiZWw6ICdsaW5rIHRleHQnLCBocmVmOiAnaHR0cDovL2xpbmsuaHJlZicsIHRpdGxlOiAnYW5kIGEgdGl0bGUnIH0sXG5cdFx0XHQnLidcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGlua2VkVGV4dCgnU29tZSBtZXNzYWdlIHdpdGggW2xpbmsgdGV4dF0oaHR0cDovL2xpbmsuaHJlZiBcImFuZCBhIFxcJ3RpdGxlXFwnXCIpLicpLm5vZGVzLCBbXG5cdFx0XHQnU29tZSBtZXNzYWdlIHdpdGggJyxcblx0XHRcdHsgbGFiZWw6ICdsaW5rIHRleHQnLCBocmVmOiAnaHR0cDovL2xpbmsuaHJlZicsIHRpdGxlOiAnYW5kIGEgXFwndGl0bGVcXCcnIH0sXG5cdFx0XHQnLidcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGlua2VkVGV4dCgnU29tZSBtZXNzYWdlIHdpdGggW2xpbmsgdGV4dF0oaHR0cDovL2xpbmsuaHJlZiBcXCdhbmQgYSBcInRpdGxlXCJcXCcpLicpLm5vZGVzLCBbXG5cdFx0XHQnU29tZSBtZXNzYWdlIHdpdGggJyxcblx0XHRcdHsgbGFiZWw6ICdsaW5rIHRleHQnLCBocmVmOiAnaHR0cDovL2xpbmsuaHJlZicsIHRpdGxlOiAnYW5kIGEgXCJ0aXRsZVwiJyB9LFxuXHRcdFx0Jy4nXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZUxpbmtlZFRleHQoJ1NvbWUgbWVzc2FnZSB3aXRoIFtsaW5rIHRleHRdKHJhbmRvbSBzdHVmZikuJykubm9kZXMsIFtcblx0XHRcdCdTb21lIG1lc3NhZ2Ugd2l0aCBbbGluayB0ZXh0XShyYW5kb20gc3R1ZmYpLidcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGlua2VkVGV4dCgnU29tZSBtZXNzYWdlIHdpdGggW2h0dHBzIGxpbmtdKGh0dHBzOi8vbGluay5ocmVmKS4nKS5ub2RlcywgW1xuXHRcdFx0J1NvbWUgbWVzc2FnZSB3aXRoICcsXG5cdFx0XHR7IGxhYmVsOiAnaHR0cHMgbGluaycsIGhyZWY6ICdodHRwczovL2xpbmsuaHJlZicgfSxcblx0XHRcdCcuJ1xuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMaW5rZWRUZXh0KCdTb21lIG1lc3NhZ2Ugd2l0aCBbaHR0cHMgbGlua10oaHR0cHM6KS4nKS5ub2RlcywgW1xuXHRcdFx0J1NvbWUgbWVzc2FnZSB3aXRoIFtodHRwcyBsaW5rXShodHRwczopLidcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGlua2VkVGV4dCgnU29tZSBtZXNzYWdlIHdpdGggW2EgY29tbWFuZF0oY29tbWFuZDpmb29iYXIpLicpLm5vZGVzLCBbXG5cdFx0XHQnU29tZSBtZXNzYWdlIHdpdGggJyxcblx0XHRcdHsgbGFiZWw6ICdhIGNvbW1hbmQnLCBocmVmOiAnY29tbWFuZDpmb29iYXInIH0sXG5cdFx0XHQnLidcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGlua2VkVGV4dCgnU29tZSBtZXNzYWdlIHdpdGggW2EgY29tbWFuZF0oY29tbWFuZDopLicpLm5vZGVzLCBbXG5cdFx0XHQnU29tZSBtZXNzYWdlIHdpdGggW2EgY29tbWFuZF0oY29tbWFuZDopLidcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGlua2VkVGV4dCgnbGluayBbb25lXShjb21tYW5kOmZvbyBcIm5pY2VcIikgYW5kIGxpbmsgW3R3b10oaHR0cDovL2ZvbykuLi4nKS5ub2RlcywgW1xuXHRcdFx0J2xpbmsgJyxcblx0XHRcdHsgbGFiZWw6ICdvbmUnLCBocmVmOiAnY29tbWFuZDpmb28nLCB0aXRsZTogJ25pY2UnIH0sXG5cdFx0XHQnIGFuZCBsaW5rICcsXG5cdFx0XHR7IGxhYmVsOiAndHdvJywgaHJlZjogJ2h0dHA6Ly9mb28nIH0sXG5cdFx0XHQnLi4uJ1xuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VMaW5rZWRUZXh0KCdsaW5rXFxuW29uZV0oY29tbWFuZDpmb28gXCJuaWNlXCIpXFxuYW5kIGxpbmsgW3R3b10oaHR0cDovL2ZvbykuLi4nKS5ub2RlcywgW1xuXHRcdFx0J2xpbmtcXG4nLFxuXHRcdFx0eyBsYWJlbDogJ29uZScsIGhyZWY6ICdjb21tYW5kOmZvbycsIHRpdGxlOiAnbmljZScgfSxcblx0XHRcdCdcXG5hbmQgbGluayAnLFxuXHRcdFx0eyBsYWJlbDogJ3R3bycsIGhyZWY6ICdodHRwOi8vZm9vJyB9LFxuXHRcdFx0Jy4uLidcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnU2hvdWxkIG1hdGNoIG5vbi1ncmVlZGlseScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlTGlua2VkVGV4dCgnYSBbbGluayB0ZXh0IDFdKGh0dHA6Ly9saW5rLmhyZWYgXCJ0aXRsZTFcIikgYiBbbGluayB0ZXh0IDJdKGh0dHA6Ly9saW5rLmhyZWYgXCJ0aXRsZTJcIikgYycpLm5vZGVzLCBbXG5cdFx0XHQnYSAnLFxuXHRcdFx0eyBsYWJlbDogJ2xpbmsgdGV4dCAxJywgaHJlZjogJ2h0dHA6Ly9saW5rLmhyZWYnLCB0aXRsZTogJ3RpdGxlMScgfSxcblx0XHRcdCcgYiAnLFxuXHRcdFx0eyBsYWJlbDogJ2xpbmsgdGV4dCAyJywgaHJlZjogJ2h0dHA6Ly9saW5rLmhyZWYnLCB0aXRsZTogJ3RpdGxlMicgfSxcblx0XHRcdCcgYycsXG5cdFx0XSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxjQUFjLE1BQU07QUFDekIsMENBQXdDO0FBRXhDLE9BQUssb0JBQW9CLE1BQU07QUFDOUIsV0FBTyxnQkFBZ0IsZ0JBQWdCLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQztBQUNwRCxXQUFPLGdCQUFnQixnQkFBZ0IsT0FBTyxFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUM7QUFDaEUsV0FBTyxnQkFBZ0IsZ0JBQWdCLGFBQWEsRUFBRSxPQUFPLENBQUMsYUFBYSxDQUFDO0FBQzVFLFdBQU8sZ0JBQWdCLGdCQUFnQixrREFBa0QsRUFBRSxPQUFPO0FBQUEsTUFDakc7QUFBQSxNQUNBLEVBQUUsT0FBTyxhQUFhLE1BQU0sbUJBQW1CO0FBQUEsTUFD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
