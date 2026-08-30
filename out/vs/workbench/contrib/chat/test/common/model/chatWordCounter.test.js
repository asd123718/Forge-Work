import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { getNWords } from "../../../common/model/chatWordCounter.js";
suite("ChatWordCounter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function doTest(str, nWords, resultStr) {
    const result = getNWords(str, nWords);
    assert.strictEqual(result.value, resultStr);
    assert.strictEqual(result.returnedWordCount, nWords);
  }
  suite("getNWords", () => {
    test("matching actualWordCount", () => {
      const cases = [
        ["hello world", 1, "hello"],
        ["hello", 1, "hello"],
        ["hello world", 0, ""],
        ["here's, some.   punctuation?", 3, "here's, some.   punctuation?"],
        ["| markdown | _table_ | header |", 3, "| markdown | _table_ | header |"],
        ["| --- | --- | --- |", 1, "| ---"],
        ["| --- | --- | --- |", 3, "| --- | --- | --- |"],
        [" 	 some \n whitespace     \n\n\nhere   ", 3, " 	 some \n whitespace     \n\n\nhere   "]
      ];
      cases.forEach(([str, nWords, result]) => doTest(str, nWords, result));
    });
    test("whitespace", () => {
      assert.deepStrictEqual(
        getNWords("hello ", 1),
        {
          value: "hello ",
          returnedWordCount: 1,
          isFullString: true,
          totalWordCount: 1
        }
      );
      assert.deepStrictEqual(
        getNWords("hello\n\n", 1),
        {
          value: "hello\n\n",
          returnedWordCount: 1,
          isFullString: true,
          totalWordCount: 1
        }
      );
      assert.deepStrictEqual(
        getNWords("\nhello", 1),
        {
          value: "\nhello",
          returnedWordCount: 1,
          isFullString: true,
          totalWordCount: 1
        }
      );
    });
    test("matching links", () => {
      const cases = [
        ["[hello](https://example.com) world", 1, "[hello](https://example.com)"],
        ["[hello](https://example.com) world", 2, "[hello](https://example.com) world"],
        ['oh [hello](https://example.com "title") world', 1, "oh"],
        ['oh [hello](https://example.com "title") world', 2, 'oh [hello](https://example.com "title")'],
        // Parens in link destination
        ["[hello](https://example.com?()) world", 1, "[hello](https://example.com?())"],
        // Escaped brackets in link text
        ["[he \\[l\\] \\]lo](https://example.com?()) world", 1, "[he \\[l\\] \\]lo](https://example.com?())"]
      ];
      cases.forEach(([str, nWords, result]) => doTest(str, nWords, result));
    });
    test("code", () => {
      const cases = [
        ["let a=1-2", 2, "let a"],
        ["let a=1-2", 3, "let a="],
        ["let a=1-2", 4, "let a=1"],
        ["const myVar = 1+2", 4, "const myVar = 1"],
        ['<div id="myDiv"></div>', 3, "<div id="],
        ['<div id="myDiv"></div>', 4, '<div id="myDiv"></div>']
      ];
      cases.forEach(([str, nWords, result]) => doTest(str, nWords, result));
    });
    test("codeblocks", () => {
      const cases = [
        ["hello\n\n```\n```\n\nworld foo", 2, "hello\n\n```\n```\n\nworld"]
      ];
      cases.forEach(([str, nWords, result]) => doTest(str, nWords, result));
    });
    test("chinese characters", () => {
      const cases = [
        ["\u6211\u559C\u6B22\u4E2D\u56FD\u83DC", 3, "\u6211\u559C\u6B22"]
      ];
      cases.forEach(([str, nWords, result]) => doTest(str, nWords, result));
    });
    test(`Inline math shouldn't be broken up`, () => {
      const cases = [
        ["a $x + y$ b", 3, "a $x + y$ b"],
        ["a $\\frac{1}{2} + \\sqrt{x^2 + y^2}$ b", 3, "a $\\frac{1}{2} + \\sqrt{x^2 + y^2}$ b"]
      ];
      cases.forEach(([str, nWords, result]) => doTest(str, nWords, result));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcbW9kZWxcXGNoYXRXb3JkQ291bnRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBnZXROV29yZHMsIElXb3JkQ291bnRSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFdvcmRDb3VudGVyLmpzJztcblxuc3VpdGUoJ0NoYXRXb3JkQ291bnRlcicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gZG9UZXN0KHN0cjogc3RyaW5nLCBuV29yZHM6IG51bWJlciwgcmVzdWx0U3RyOiBzdHJpbmcpIHtcblx0XHRjb25zdCByZXN1bHQgPSBnZXROV29yZHMoc3RyLCBuV29yZHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQudmFsdWUsIHJlc3VsdFN0cik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5yZXR1cm5lZFdvcmRDb3VudCwgbldvcmRzKTtcblx0fVxuXG5cdHN1aXRlKCdnZXROV29yZHMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnbWF0Y2hpbmcgYWN0dWFsV29yZENvdW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2FzZXM6IFtzdHJpbmcsIG51bWJlciwgc3RyaW5nXVtdID0gW1xuXHRcdFx0XHRbJ2hlbGxvIHdvcmxkJywgMSwgJ2hlbGxvJ10sXG5cdFx0XHRcdFsnaGVsbG8nLCAxLCAnaGVsbG8nXSxcblx0XHRcdFx0WydoZWxsbyB3b3JsZCcsIDAsICcnXSxcblx0XHRcdFx0WydoZXJlXFwncywgc29tZS4gICBwdW5jdHVhdGlvbj8nLCAzLCAnaGVyZVxcJ3MsIHNvbWUuICAgcHVuY3R1YXRpb24/J10sXG5cdFx0XHRcdFsnfCBtYXJrZG93biB8IF90YWJsZV8gfCBoZWFkZXIgfCcsIDMsICd8IG1hcmtkb3duIHwgX3RhYmxlXyB8IGhlYWRlciB8J10sXG5cdFx0XHRcdFsnfCAtLS0gfCAtLS0gfCAtLS0gfCcsIDEsICd8IC0tLSddLFxuXHRcdFx0XHRbJ3wgLS0tIHwgLS0tIHwgLS0tIHwnLCAzLCAnfCAtLS0gfCAtLS0gfCAtLS0gfCddLFxuXHRcdFx0XHRbJyBcXHQgc29tZSBcXG4gd2hpdGVzcGFjZSAgICAgXFxuXFxuXFxuaGVyZSAgICcsIDMsICcgXFx0IHNvbWUgXFxuIHdoaXRlc3BhY2UgICAgIFxcblxcblxcbmhlcmUgICAnXSxcblx0XHRcdF07XG5cblx0XHRcdGNhc2VzLmZvckVhY2goKFtzdHIsIG5Xb3JkcywgcmVzdWx0XSkgPT4gZG9UZXN0KHN0ciwgbldvcmRzLCByZXN1bHQpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3doaXRlc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXROV29yZHMoJ2hlbGxvICcsIDEpLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dmFsdWU6ICdoZWxsbyAnLFxuXHRcdFx0XHRcdHJldHVybmVkV29yZENvdW50OiAxLFxuXHRcdFx0XHRcdGlzRnVsbFN0cmluZzogdHJ1ZSxcblx0XHRcdFx0XHR0b3RhbFdvcmRDb3VudDogMSxcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSVdvcmRDb3VudFJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRnZXROV29yZHMoJ2hlbGxvXFxuXFxuJywgMSksXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR2YWx1ZTogJ2hlbGxvXFxuXFxuJyxcblx0XHRcdFx0XHRyZXR1cm5lZFdvcmRDb3VudDogMSxcblx0XHRcdFx0XHRpc0Z1bGxTdHJpbmc6IHRydWUsXG5cdFx0XHRcdFx0dG90YWxXb3JkQ291bnQ6IDEsXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElXb3JkQ291bnRSZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0Z2V0TldvcmRzKCdcXG5oZWxsbycsIDEpLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dmFsdWU6ICdcXG5oZWxsbycsXG5cdFx0XHRcdFx0cmV0dXJuZWRXb3JkQ291bnQ6IDEsXG5cdFx0XHRcdFx0aXNGdWxsU3RyaW5nOiB0cnVlLFxuXHRcdFx0XHRcdHRvdGFsV29yZENvdW50OiAxLFxuXHRcdFx0XHR9IHNhdGlzZmllcyBJV29yZENvdW50UmVzdWx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hdGNoaW5nIGxpbmtzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2FzZXM6IFtzdHJpbmcsIG51bWJlciwgc3RyaW5nXVtdID0gW1xuXHRcdFx0XHRbJ1toZWxsb10oaHR0cHM6Ly9leGFtcGxlLmNvbSkgd29ybGQnLCAxLCAnW2hlbGxvXShodHRwczovL2V4YW1wbGUuY29tKSddLFxuXHRcdFx0XHRbJ1toZWxsb10oaHR0cHM6Ly9leGFtcGxlLmNvbSkgd29ybGQnLCAyLCAnW2hlbGxvXShodHRwczovL2V4YW1wbGUuY29tKSB3b3JsZCddLFxuXHRcdFx0XHRbJ29oIFtoZWxsb10oaHR0cHM6Ly9leGFtcGxlLmNvbSBcInRpdGxlXCIpIHdvcmxkJywgMSwgJ29oJ10sXG5cdFx0XHRcdFsnb2ggW2hlbGxvXShodHRwczovL2V4YW1wbGUuY29tIFwidGl0bGVcIikgd29ybGQnLCAyLCAnb2ggW2hlbGxvXShodHRwczovL2V4YW1wbGUuY29tIFwidGl0bGVcIiknXSxcblx0XHRcdFx0Ly8gUGFyZW5zIGluIGxpbmsgZGVzdGluYXRpb25cblx0XHRcdFx0WydbaGVsbG9dKGh0dHBzOi8vZXhhbXBsZS5jb20/KCkpIHdvcmxkJywgMSwgJ1toZWxsb10oaHR0cHM6Ly9leGFtcGxlLmNvbT8oKSknXSxcblx0XHRcdFx0Ly8gRXNjYXBlZCBicmFja2V0cyBpbiBsaW5rIHRleHRcblx0XHRcdFx0WydbaGUgXFxcXFtsXFxcXF0gXFxcXF1sb10oaHR0cHM6Ly9leGFtcGxlLmNvbT8oKSkgd29ybGQnLCAxLCAnW2hlIFxcXFxbbFxcXFxdIFxcXFxdbG9dKGh0dHBzOi8vZXhhbXBsZS5jb20/KCkpJ10sXG5cdFx0XHRdO1xuXG5cdFx0XHRjYXNlcy5mb3JFYWNoKChbc3RyLCBuV29yZHMsIHJlc3VsdF0pID0+IGRvVGVzdChzdHIsIG5Xb3JkcywgcmVzdWx0KSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb2RlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2FzZXM6IFtzdHJpbmcsIG51bWJlciwgc3RyaW5nXVtdID0gW1xuXHRcdFx0XHRbJ2xldCBhPTEtMicsIDIsICdsZXQgYSddLFxuXHRcdFx0XHRbJ2xldCBhPTEtMicsIDMsICdsZXQgYT0nXSxcblx0XHRcdFx0WydsZXQgYT0xLTInLCA0LCAnbGV0IGE9MSddLFxuXHRcdFx0XHRbJ2NvbnN0IG15VmFyID0gMSsyJywgNCwgJ2NvbnN0IG15VmFyID0gMSddLFxuXHRcdFx0XHRbJzxkaXYgaWQ9XCJteURpdlwiPjwvZGl2PicsIDMsICc8ZGl2IGlkPSddLFxuXHRcdFx0XHRbJzxkaXYgaWQ9XCJteURpdlwiPjwvZGl2PicsIDQsICc8ZGl2IGlkPVwibXlEaXZcIj48L2Rpdj4nXSxcblx0XHRcdF07XG5cblx0XHRcdGNhc2VzLmZvckVhY2goKFtzdHIsIG5Xb3JkcywgcmVzdWx0XSkgPT4gZG9UZXN0KHN0ciwgbldvcmRzLCByZXN1bHQpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvZGVibG9ja3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXNlczogW3N0cmluZywgbnVtYmVyLCBzdHJpbmddW10gPSBbXG5cdFx0XHRcdFsnaGVsbG9cXG5cXG5gYGBcXG5gYGBcXG5cXG53b3JsZCBmb28nLCAyLCAnaGVsbG9cXG5cXG5gYGBcXG5gYGBcXG5cXG53b3JsZCddLFxuXHRcdFx0XTtcblxuXHRcdFx0Y2FzZXMuZm9yRWFjaCgoW3N0ciwgbldvcmRzLCByZXN1bHRdKSA9PiBkb1Rlc3Qoc3RyLCBuV29yZHMsIHJlc3VsdCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2hpbmVzZSBjaGFyYWN0ZXJzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2FzZXM6IFtzdHJpbmcsIG51bWJlciwgc3RyaW5nXVtdID0gW1xuXHRcdFx0XHRbJ1x1NjIxMVx1NTU5Q1x1NkIyMlx1NEUyRFx1NTZGRFx1ODNEQycsIDMsICdcdTYyMTFcdTU1OUNcdTZCMjInXSxcblx0XHRcdF07XG5cblx0XHRcdGNhc2VzLmZvckVhY2goKFtzdHIsIG5Xb3JkcywgcmVzdWx0XSkgPT4gZG9UZXN0KHN0ciwgbldvcmRzLCByZXN1bHQpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoYElubGluZSBtYXRoIHNob3VsZG4ndCBiZSBicm9rZW4gdXBgLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXNlczogW3N0cmluZywgbnVtYmVyLCBzdHJpbmddW10gPSBbXG5cdFx0XHRcdFsnYSAkeCArIHkkIGInLCAzLCAnYSAkeCArIHkkIGInXSxcblx0XHRcdFx0WydhICRcXFxcZnJhY3sxfXsyfSArIFxcXFxzcXJ0e3heMiArIHleMn0kIGInLCAzLCAnYSAkXFxcXGZyYWN7MX17Mn0gKyBcXFxcc3FydHt4XjIgKyB5XjJ9JCBiJ10sXG5cdFx0XHRdO1xuXG5cdFx0XHRjYXNlcy5mb3JFYWNoKChbc3RyLCBuV29yZHMsIHJlc3VsdF0pID0+IGRvVGVzdChzdHIsIG5Xb3JkcywgcmVzdWx0KSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxpQkFBbUM7QUFFNUMsTUFBTSxtQkFBbUIsTUFBTTtBQUM5QiwwQ0FBd0M7QUFFeEMsV0FBUyxPQUFPLEtBQWEsUUFBZ0IsV0FBbUI7QUFDL0QsVUFBTSxTQUFTLFVBQVUsS0FBSyxNQUFNO0FBQ3BDLFdBQU8sWUFBWSxPQUFPLE9BQU8sU0FBUztBQUMxQyxXQUFPLFlBQVksT0FBTyxtQkFBbUIsTUFBTTtBQUFBLEVBQ3BEO0FBRUEsUUFBTSxhQUFhLE1BQU07QUFDeEIsU0FBSyw0QkFBNEIsTUFBTTtBQUN0QyxZQUFNLFFBQW9DO0FBQUEsUUFDekMsQ0FBQyxlQUFlLEdBQUcsT0FBTztBQUFBLFFBQzFCLENBQUMsU0FBUyxHQUFHLE9BQU87QUFBQSxRQUNwQixDQUFDLGVBQWUsR0FBRyxFQUFFO0FBQUEsUUFDckIsQ0FBQyxnQ0FBaUMsR0FBRyw4QkFBK0I7QUFBQSxRQUNwRSxDQUFDLG1DQUFtQyxHQUFHLGlDQUFpQztBQUFBLFFBQ3hFLENBQUMsdUJBQXVCLEdBQUcsT0FBTztBQUFBLFFBQ2xDLENBQUMsdUJBQXVCLEdBQUcscUJBQXFCO0FBQUEsUUFDaEQsQ0FBQywyQ0FBNEMsR0FBRyx5Q0FBMEM7QUFBQSxNQUMzRjtBQUVBLFlBQU0sUUFBUSxDQUFDLENBQUMsS0FBSyxRQUFRLE1BQU0sTUFBTSxPQUFPLEtB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
