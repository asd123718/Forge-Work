import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { extractRangeFromFilter } from "../../common/search.js";
suite("extractRangeFromFilter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("basics", async function() {
    assert.ok(!extractRangeFromFilter(""));
    assert.ok(!extractRangeFromFilter("/some/path"));
    assert.ok(!extractRangeFromFilter("/some/path/file.txt"));
    for (const lineSep of [":", "#", "(", ":line "]) {
      for (const colSep of [":", "#", ","]) {
        const base = "/some/path/file.txt";
        let res = extractRangeFromFilter(`${base}${lineSep}20`);
        assert.strictEqual(res?.filter, base);
        assert.strictEqual(res?.range.startLineNumber, 20);
        assert.strictEqual(res?.range.startColumn, 1);
        res = extractRangeFromFilter(`${base}${lineSep}20${colSep}`);
        assert.strictEqual(res?.filter, base);
        assert.strictEqual(res?.range.startLineNumber, 20);
        assert.strictEqual(res?.range.startColumn, 1);
        res = extractRangeFromFilter(`${base}${lineSep}20${colSep}3`);
        assert.strictEqual(res?.filter, base);
        assert.strictEqual(res?.range.startLineNumber, 20);
        assert.strictEqual(res?.range.startColumn, 3);
      }
    }
  });
  test("allow space after path", async function() {
    const res = extractRangeFromFilter("/some/path/file.txt (19,20)");
    assert.strictEqual(res?.filter, "/some/path/file.txt");
    assert.strictEqual(res?.range.startLineNumber, 19);
    assert.strictEqual(res?.range.startColumn, 20);
  });
  suite("ranges", function() {
    const base = "/some/path/file.txt";
    const testSpecs = [
      // line range: "20-40"
      { filter: `${base}:20-40`, range: { startLineNumber: 20, startColumn: 1, endLineNumber: 40, endColumn: 1 } },
      // line and column range: "20:3-40:5"
      { filter: `${base}:20:3-40:5`, range: { startLineNumber: 20, startColumn: 3, endLineNumber: 40, endColumn: 5 } },
      // end column defaults to start of the end line: "20:3-40"
      { filter: `${base}:20:3-40`, range: { startLineNumber: 20, startColumn: 3, endLineNumber: 40, endColumn: 1 } },
      // mixed separators: "20#3-40,5"
      { filter: `${base}#20#3-40,5`, range: { startLineNumber: 20, startColumn: 3, endLineNumber: 40, endColumn: 5 } },
      // paren style: "(20,3-40,5)"
      { filter: `${base}(20,3-40,5)`, range: { startLineNumber: 20, startColumn: 3, endLineNumber: 40, endColumn: 5 } },
      // dangling separator falls back to single line: "20-"
      { filter: `${base}:20-`, range: { startLineNumber: 20, startColumn: 1, endLineNumber: 20, endColumn: 1 } }
    ];
    for (const { filter, range } of testSpecs) {
      test(filter, () => {
        assert.deepStrictEqual(extractRangeFromFilter(filter), { filter: base, range });
      });
    }
    test("hyphen in path is not treated as a range", () => {
      assert.ok(!extractRangeFromFilter("/some/path/my-file.txt"));
      assert.ok(!extractRangeFromFilter("/some/path/file-2.txt"));
    });
  });
  suite("unless", function() {
    const testSpecs = [
      // alpha-only symbol after unless
      { filter: "/some/path/file.txt@alphasymbol", unless: ["@"], result: void 0 },
      // unless as first char
      { filter: "@/some/path/file.txt (19,20)", unless: ["@"], result: void 0 },
      // unless as last char
      { filter: "/some/path/file.txt (19,20)@", unless: ["@"], result: void 0 },
      // unless before ,
      {
        filter: "/some/@path/file.txt (19,20)",
        unless: ["@"],
        result: {
          filter: "/some/@path/file.txt",
          range: {
            endColumn: 20,
            endLineNumber: 19,
            startColumn: 20,
            startLineNumber: 19
          }
        }
      },
      // unless before :
      {
        filter: "/some/@path/file.txt:19:20",
        unless: ["@"],
        result: {
          filter: "/some/@path/file.txt",
          range: {
            endColumn: 20,
            endLineNumber: 19,
            startColumn: 20,
            startLineNumber: 19
          }
        }
      },
      // unless before #
      {
        filter: "/some/@path/file.txt#19",
        unless: ["@"],
        result: {
          filter: "/some/@path/file.txt",
          range: {
            endColumn: 1,
            endLineNumber: 19,
            startColumn: 1,
            startLineNumber: 19
          }
        }
      }
    ];
    for (const { filter, unless, result } of testSpecs) {
      test(`${filter} - ${JSON.stringify(unless)}`, () => {
        assert.deepStrictEqual(extractRangeFromFilter(filter, unless), result);
      });
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaFxcdGVzdFxcY29tbW9uXFxleHRyYWN0UmFuZ2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgZXh0cmFjdFJhbmdlRnJvbUZpbHRlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZWFyY2guanMnO1xuXG5zdWl0ZSgnZXh0cmFjdFJhbmdlRnJvbUZpbHRlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdiYXNpY3MnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0Lm9rKCFleHRyYWN0UmFuZ2VGcm9tRmlsdGVyKCcnKSk7XG5cdFx0YXNzZXJ0Lm9rKCFleHRyYWN0UmFuZ2VGcm9tRmlsdGVyKCcvc29tZS9wYXRoJykpO1xuXHRcdGFzc2VydC5vayghZXh0cmFjdFJhbmdlRnJvbUZpbHRlcignL3NvbWUvcGF0aC9maWxlLnR4dCcpKTtcblxuXHRcdGZvciAoY29uc3QgbGluZVNlcCBvZiBbJzonLCAnIycsICcoJywgJzpsaW5lICddKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNvbFNlcCBvZiBbJzonLCAnIycsICcsJ10pIHtcblx0XHRcdFx0Y29uc3QgYmFzZSA9ICcvc29tZS9wYXRoL2ZpbGUudHh0JztcblxuXHRcdFx0XHRsZXQgcmVzID0gZXh0cmFjdFJhbmdlRnJvbUZpbHRlcihgJHtiYXNlfSR7bGluZVNlcH0yMGApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzPy5maWx0ZXIsIGJhc2UpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzPy5yYW5nZS5zdGFydExpbmVOdW1iZXIsIDIwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcz8ucmFuZ2Uuc3RhcnRDb2x1bW4sIDEpO1xuXG5cdFx0XHRcdHJlcyA9IGV4dHJhY3RSYW5nZUZyb21GaWx0ZXIoYCR7YmFzZX0ke2xpbmVTZXB9MjAke2NvbFNlcH1gKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcz8uZmlsdGVyLCBiYXNlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcz8ucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCAyMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXM/LnJhbmdlLnN0YXJ0Q29sdW1uLCAxKTtcblxuXHRcdFx0XHRyZXMgPSBleHRyYWN0UmFuZ2VGcm9tRmlsdGVyKGAke2Jhc2V9JHtsaW5lU2VwfTIwJHtjb2xTZXB9M2ApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzPy5maWx0ZXIsIGJhc2UpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzPy5yYW5nZS5zdGFydExpbmVOdW1iZXIsIDIwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcz8ucmFuZ2Uuc3RhcnRDb2x1bW4sIDMpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnYWxsb3cgc3BhY2UgYWZ0ZXIgcGF0aCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXMgPSBleHRyYWN0UmFuZ2VGcm9tRmlsdGVyKCcvc29tZS9wYXRoL2ZpbGUudHh0ICgxOSwyMCknKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXM/LmZpbHRlciwgJy9zb21lL3BhdGgvZmlsZS50eHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzPy5yYW5nZS5zdGFydExpbmVOdW1iZXIsIDE5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzPy5yYW5nZS5zdGFydENvbHVtbiwgMjApO1xuXHR9KTtcblxuXHRzdWl0ZSgncmFuZ2VzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGJhc2UgPSAnL3NvbWUvcGF0aC9maWxlLnR4dCc7XG5cdFx0Y29uc3QgdGVzdFNwZWNzID0gW1xuXHRcdFx0Ly8gbGluZSByYW5nZTogXCIyMC00MFwiXG5cdFx0XHR7IGZpbHRlcjogYCR7YmFzZX06MjAtNDBgLCByYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDIwLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogNDAsIGVuZENvbHVtbjogMSB9IH0sXG5cdFx0XHQvLyBsaW5lIGFuZCBjb2x1bW4gcmFuZ2U6IFwiMjA6My00MDo1XCJcblx0XHRcdHsgZmlsdGVyOiBgJHtiYXNlfToyMDozLTQwOjVgLCByYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDIwLCBzdGFydENvbHVtbjogMywgZW5kTGluZU51bWJlcjogNDAsIGVuZENvbHVtbjogNSB9IH0sXG5cdFx0XHQvLyBlbmQgY29sdW1uIGRlZmF1bHRzIHRvIHN0YXJ0IG9mIHRoZSBlbmQgbGluZTogXCIyMDozLTQwXCJcblx0XHRcdHsgZmlsdGVyOiBgJHtiYXNlfToyMDozLTQwYCwgcmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAyMCwgc3RhcnRDb2x1bW46IDMsIGVuZExpbmVOdW1iZXI6IDQwLCBlbmRDb2x1bW46IDEgfSB9LFxuXHRcdFx0Ly8gbWl4ZWQgc2VwYXJhdG9yczogXCIyMCMzLTQwLDVcIlxuXHRcdFx0eyBmaWx0ZXI6IGAke2Jhc2V9IzIwIzMtNDAsNWAsIHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMjAsIHN0YXJ0Q29sdW1uOiAzLCBlbmRMaW5lTnVtYmVyOiA0MCwgZW5kQ29sdW1uOiA1IH0gfSxcblx0XHRcdC8vIHBhcmVuIHN0eWxlOiBcIigyMCwzLTQwLDUpXCJcblx0XHRcdHsgZmlsdGVyOiBgJHtiYXNlfSgyMCwzLTQwLDUpYCwgcmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAyMCwgc3RhcnRDb2x1bW46IDMsIGVuZExpbmVOdW1iZXI6IDQwLCBlbmRDb2x1bW46IDUgfSB9LFxuXHRcdFx0Ly8gZGFuZ2xpbmcgc2VwYXJhdG9yIGZhbGxzIGJhY2sgdG8gc2luZ2xlIGxpbmU6IFwiMjAtXCJcblx0XHRcdHsgZmlsdGVyOiBgJHtiYXNlfToyMC1gLCByYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDIwLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMjAsIGVuZENvbHVtbjogMSB9IH0sXG5cdFx0XTtcblx0XHRmb3IgKGNvbnN0IHsgZmlsdGVyLCByYW5nZSB9IG9mIHRlc3RTcGVjcykge1xuXHRcdFx0dGVzdChmaWx0ZXIsICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHRyYWN0UmFuZ2VGcm9tRmlsdGVyKGZpbHRlciksIHsgZmlsdGVyOiBiYXNlLCByYW5nZSB9KTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRlc3QoJ2h5cGhlbiBpbiBwYXRoIGlzIG5vdCB0cmVhdGVkIGFzIGEgcmFuZ2UnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQub2soIWV4dHJhY3RSYW5nZUZyb21GaWx0ZXIoJy9zb21lL3BhdGgvbXktZmlsZS50eHQnKSk7XG5cdFx0XHRhc3NlcnQub2soIWV4dHJhY3RSYW5nZUZyb21GaWx0ZXIoJy9zb21lL3BhdGgvZmlsZS0yLnR4dCcpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3VubGVzcycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB0ZXN0U3BlY3MgPSBbXG5cdFx0XHQvLyBhbHBoYS1vbmx5IHN5bWJvbCBhZnRlciB1bmxlc3Ncblx0XHRcdHsgZmlsdGVyOiAnL3NvbWUvcGF0aC9maWxlLnR4dEBhbHBoYXN5bWJvbCcsIHVubGVzczogWydAJ10sIHJlc3VsdDogdW5kZWZpbmVkIH0sXG5cdFx0XHQvLyB1bmxlc3MgYXMgZmlyc3QgY2hhclxuXHRcdFx0eyBmaWx0ZXI6ICdAL3NvbWUvcGF0aC9maWxlLnR4dCAoMTksMjApJywgdW5sZXNzOiBbJ0AnXSwgcmVzdWx0OiB1bmRlZmluZWQgfSxcblx0XHRcdC8vIHVubGVzcyBhcyBsYXN0IGNoYXJcblx0XHRcdHsgZmlsdGVyOiAnL3NvbWUvcGF0aC9maWxlLnR4dCAoMTksMjApQCcsIHVubGVzczogWydAJ10sIHJlc3VsdDogdW5kZWZpbmVkIH0sXG5cdFx0XHQvLyB1bmxlc3MgYmVmb3JlICxcblx0XHRcdHtcblx0XHRcdFx0ZmlsdGVyOiAnL3NvbWUvQHBhdGgvZmlsZS50eHQgKDE5LDIwKScsIHVubGVzczogWydAJ10sIHJlc3VsdDoge1xuXHRcdFx0XHRcdGZpbHRlcjogJy9zb21lL0BwYXRoL2ZpbGUudHh0Jyxcblx0XHRcdFx0XHRyYW5nZToge1xuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiAyMCxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IDE5LFxuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IDIwLFxuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxOVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdC8vIHVubGVzcyBiZWZvcmUgOlxuXHRcdFx0e1xuXHRcdFx0XHRmaWx0ZXI6ICcvc29tZS9AcGF0aC9maWxlLnR4dDoxOToyMCcsIHVubGVzczogWydAJ10sIHJlc3VsdDoge1xuXHRcdFx0XHRcdGZpbHRlcjogJy9zb21lL0BwYXRoL2ZpbGUudHh0Jyxcblx0XHRcdFx0XHRyYW5nZToge1xuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiAyMCxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IDE5LFxuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IDIwLFxuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxOVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdC8vIHVubGVzcyBiZWZvcmUgI1xuXHRcdFx0e1xuXHRcdFx0XHRmaWx0ZXI6ICcvc29tZS9AcGF0aC9maWxlLnR4dCMxOScsIHVubGVzczogWydAJ10sIHJlc3VsdDoge1xuXHRcdFx0XHRcdGZpbHRlcjogJy9zb21lL0BwYXRoL2ZpbGUudHh0Jyxcblx0XHRcdFx0XHRyYW5nZToge1xuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiAxLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogMTksXG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTlcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XTtcblx0XHRmb3IgKGNvbnN0IHsgZmlsdGVyLCB1bmxlc3MsIHJlc3VsdCB9IG9mIHRlc3RTcGVjcykge1xuXHRcdFx0dGVzdChgJHtmaWx0ZXJ9IC0gJHtKU09OLnN0cmluZ2lmeSh1bmxlc3MpfWAsICgpID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHRyYWN0UmFuZ2VGcm9tRmlsdGVyKGZpbHRlciwgdW5sZXNzKSwgcmVzdWx0KTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtB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
