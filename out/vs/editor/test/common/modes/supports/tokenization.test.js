import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { FontStyle } from "../../../../common/encodedTokenAttributes.js";
import { ColorMap, ExternalThemeTrieElement, ParsedTokenThemeRule, ThemeTrieElementRule, TokenTheme, parseTokenTheme, strcmp } from "../../../../common/languages/supports/tokenization.js";
suite("Token theme matching", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("gives higher priority to deeper matches", () => {
    const theme = TokenTheme.createFromRawTokenTheme([
      { token: "", foreground: "100000", background: "200000" },
      { token: "punctuation.definition.string.begin.html", foreground: "300000" },
      { token: "punctuation.definition.string", foreground: "400000" }
    ], []);
    const colorMap = new ColorMap();
    colorMap.getId("100000");
    const _B = colorMap.getId("200000");
    colorMap.getId("400000");
    const _D = colorMap.getId("300000");
    const actual = theme._match("punctuation.definition.string.begin.html");
    assert.deepStrictEqual(actual, new ThemeTrieElementRule(FontStyle.None, _D, _B));
  });
  test("can match", () => {
    const theme = TokenTheme.createFromRawTokenTheme([
      { token: "", foreground: "F8F8F2", background: "272822" },
      { token: "source", background: "100000" },
      { token: "something", background: "100000" },
      { token: "bar", background: "200000" },
      { token: "baz", background: "200000" },
      { token: "bar", fontStyle: "bold" },
      { token: "constant", fontStyle: "italic", foreground: "300000" },
      { token: "constant.numeric", foreground: "400000" },
      { token: "constant.numeric.hex", fontStyle: "bold" },
      { token: "constant.numeric.oct", fontStyle: "bold italic underline" },
      { token: "constant.numeric.bin", fontStyle: "bold strikethrough" },
      { token: "constant.numeric.dec", fontStyle: "", foreground: "500000" },
      { token: "storage.object.bar", fontStyle: "", foreground: "600000" }
    ], []);
    const colorMap = new ColorMap();
    const _A = colorMap.getId("F8F8F2");
    const _B = colorMap.getId("272822");
    const _C = colorMap.getId("200000");
    const _D = colorMap.getId("300000");
    const _E = colorMap.getId("400000");
    const _F = colorMap.getId("500000");
    const _G = colorMap.getId("100000");
    const _H = colorMap.getId("600000");
    function assertMatch(scopeName, expected) {
      const actual = theme._match(scopeName);
      assert.deepStrictEqual(actual, expected, "when matching <<" + scopeName + ">>");
    }
    function assertSimpleMatch(scopeName, fontStyle, foreground, background) {
      assertMatch(scopeName, new ThemeTrieElementRule(fontStyle, foreground, background));
    }
    function assertNoMatch(scopeName) {
      assertMatch(scopeName, new ThemeTrieElementRule(FontStyle.None, _A, _B));
    }
    assertNoMatch("");
    assertNoMatch("bazz");
    assertNoMatch("asdfg");
    assertSimpleMatch("source", FontStyle.None, _A, _G);
    assertSimpleMatch("source.ts", FontStyle.None, _A, _G);
    assertSimpleMatch("source.tss", FontStyle.None, _A, _G);
    assertSimpleMatch("something", FontStyle.None, _A, _G);
    assertSimpleMatch("something.ts", FontStyle.None, _A, _G);
    assertSimpleMatch("something.tss", FontStyle.None, _A, _G);
    assertSimpleMatch("baz", FontStyle.None, _A, _C);
    assertSimpleMatch("baz.ts", FontStyle.None, _A, _C);
    assertSimpleMatch("baz.tss", FontStyle.None, _A, _C);
    assertSimpleMatch("constant", FontStyle.Italic, _D, _B);
    assertSimpleMatch("constant.string", FontStyle.Italic, _D, _B);
    assertSimpleMatch("constant.hex", FontStyle.Italic, _D, _B);
    assertSimpleMatch("constant.numeric", FontStyle.Italic, _E, _B);
    assertSimpleMatch("constant.numeric.baz", FontStyle.Italic, _E, _B);
    assertSimpleMatch("constant.numeric.hex", FontStyle.Bold, _E, _B);
    assertSimpleMatch("constant.numeric.hex.baz", FontStyle.Bold, _E, _B);
    assertSimpleMatch("constant.numeric.oct", FontStyle.Bold | FontStyle.Italic | FontStyle.Underline, _E, _B);
    assertSimpleMatch("constant.numeric.oct.baz", FontStyle.Bold | FontStyle.Italic | FontStyle.Underline, _E, _B);
    assertSimpleMatch("constant.numeric.bin", FontStyle.Bold | FontStyle.Strikethrough, _E, _B);
    assertSimpleMatch("constant.numeric.bin.baz", FontStyle.Bold | FontStyle.Strikethrough, _E, _B);
    assertSimpleMatch("constant.numeric.dec", FontStyle.None, _F, _B);
    assertSimpleMatch("constant.numeric.dec.baz", FontStyle.None, _F, _B);
    assertSimpleMatch("storage.object.bar", FontStyle.None, _H, _B);
    assertSimpleMatch("storage.object.bar.baz", FontStyle.None, _H, _B);
    assertSimpleMatch("storage.object.bart", FontStyle.None, _A, _B);
    assertSimpleMatch("storage.object", FontStyle.None, _A, _B);
    assertSimpleMatch("storage", FontStyle.None, _A, _B);
    assertSimpleMatch("bar", FontStyle.Bold, _A, _C);
  });
});
suite("Token theme parsing", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("can parse", () => {
    const actual = parseTokenTheme([
      { token: "", foreground: "F8F8F2", background: "272822" },
      { token: "source", background: "100000" },
      { token: "something", background: "100000" },
      { token: "bar", background: "010000" },
      { token: "baz", background: "010000" },
      { token: "bar", fontStyle: "bold" },
      { token: "constant", fontStyle: "italic", foreground: "ff0000" },
      { token: "constant.numeric", foreground: "00ff00" },
      { token: "constant.numeric.hex", fontStyle: "bold" },
      { token: "constant.numeric.oct", fontStyle: "bold italic underline" },
      { token: "constant.numeric.dec", fontStyle: "", foreground: "0000ff" }
    ]);
    const expected = [
      new ParsedTokenThemeRule("", 0, FontStyle.NotSet, "F8F8F2", "272822"),
      new ParsedTokenThemeRule("source", 1, FontStyle.NotSet, null, "100000"),
      new ParsedTokenThemeRule("something", 2, FontStyle.NotSet, null, "100000"),
      new ParsedTokenThemeRule("bar", 3, FontStyle.NotSet, null, "010000"),
      new ParsedTokenThemeRule("baz", 4, FontStyle.NotSet, null, "010000"),
      new ParsedTokenThemeRule("bar", 5, FontStyle.Bold, null, null),
      new ParsedTokenThemeRule("constant", 6, FontStyle.Italic, "ff0000", null),
      new ParsedTokenThemeRule("constant.numeric", 7, FontStyle.NotSet, "00ff00", null),
      new ParsedTokenThemeRule("constant.numeric.hex", 8, FontStyle.Bold, null, null),
      new ParsedTokenThemeRule("constant.numeric.oct", 9, FontStyle.Bold | FontStyle.Italic | FontStyle.Underline, null, null),
      new ParsedTokenThemeRule("constant.numeric.dec", 10, FontStyle.None, "0000ff", null)
    ];
    assert.deepStrictEqual(actual, expected);
  });
});
suite("Token theme resolving", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("strcmp works", () => {
    const actual = ["bar", "z", "zu", "a", "ab", ""].sort(strcmp);
    const expected = ["", "a", "ab", "bar", "z", "zu"];
    assert.deepStrictEqual(actual, expected);
  });
  test("always has defaults", () => {
    const actual = TokenTheme.createFromParsedTokenTheme([], []);
    const colorMap = new ColorMap();
    const _A = colorMap.getId("000000");
    const _B = colorMap.getId("ffffff");
    assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
    assert.deepStrictEqual(actual.getThemeTrieElement(), new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.None, _A, _B)));
  });
  test("respects incoming defaults 1", () => {
    const actual = TokenTheme.createFromParsedTokenTheme([
      new ParsedTokenThemeRule("", -1, FontStyle.NotSet, null, null)
    ], []);
    const colorMap = new ColorMap();
    const _A = colorMap.getId("000000");
    const _B = colorMap.getId("ffffff");
    assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
    assert.deepStrictEqual(actual.getThemeTrieElement(), new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.None, _A, _B)));
  });
  test("respects incoming defaults 2", () => {
    const actual = TokenTheme.createFromParsedTokenTheme([
      new ParsedTokenThemeRule("", -1, FontStyle.None, null, null)
    ], []);
    const colorMap = new ColorMap();
    const _A = colorMap.getId("000000");
    const _B = colorMap.getId("ffffff");
    assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
    assert.deepStrictEqual(actual.getThemeTrieElement(), new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.None, _A, _B)));
  });
  test("respects incoming defaults 3", () => {
    const actual = TokenTheme.createFromParsedTokenTheme([
      new ParsedTokenThemeRule("", -1, FontStyle.Bold, null, null)
    ], []);
    const colorMap = new ColorMap();
    const _A = colorMap.getId("000000");
    const _B = colorMap.getId("ffffff");
    assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
    assert.deepStrictEqual(actual.getThemeTrieElement(), new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.Bold, _A, _B)));
  });
  test("respects incoming defaults 4", () => {
    const actual = TokenTheme.createFromParsedTokenTheme([
      new ParsedTokenThemeRule("", -1, FontStyle.NotSet, "ff0000", null)
    ], []);
    const colorMap = new ColorMap();
    const _A = colorMap.getId("ff0000");
    const _B = colorMap.getId("ffffff");
    assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
    assert.deepStrictEqual(actual.getThemeTrieElement(), new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.None, _A, _B)));
  });
  test("respects incoming defaults 5", () => {
    const actual = TokenTheme.createFromParsedTokenTheme([
      new ParsedTokenThemeRule("", -1, FontStyle.NotSet, null, "ff0000")
    ], []);
    const colorMap = new ColorMap();
    const _A = colorMap.getId("000000");
    const _B = colorMap.getId("ff0000");
    assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
    assert.deepStrictEqual(actual.getThemeTrieElement(), new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.None, _A, _B)));
  });
  test("can merge incoming defaults", () => {
    const actual = TokenTheme.createFromParsedTokenTheme([
      new ParsedTokenThemeRule("", -1, FontStyle.NotSet, null, "ff0000"),
      new ParsedTokenThemeRule("", -1, FontStyle.NotSet, "00ff00", null),
      new ParsedTokenThemeRule("", -1, FontStyle.Bold, null, null)
    ], []);
    const colorMap = new ColorMap();
    const _A = colorMap.getId("00ff00");
    const _B = colorMap.getId("ff0000");
    assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
    assert.deepStrictEqual(actual.getThemeTrieElement(), new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.Bold, _A, _B)));
  });
  test("defaults are inherited", () => {
    const actual = TokenTheme.createFromParsedTokenTheme([
      new ParsedTokenThemeRule("", -1, FontStyle.NotSet, "F8F8F2", "272822"),
      new ParsedTokenThemeRule("var", -1, FontStyle.NotSet, "ff0000", null)
    ], []);
    const colorMap = new ColorMap();
    const _A = colorMap.getId("F8F8F2");
    const _B = colorMap.getId("272822");
    const _C = colorMap.getId("ff0000");
    assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
    const root = new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.None, _A, _B), {
      "var": new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.None, _C, _B))
    });
    assert.deepStrictEqual(actual.getThemeTrieElement(), root);
  });
  test("same rules get merged", () => {
    const actual = TokenTheme.createFromParsedTokenTheme([
      new ParsedTokenThemeRule("", -1, FontStyle.NotSet, "F8F8F2", "272822"),
      new ParsedTokenThemeRule("var", 1, FontStyle.Bold, null, null),
      new ParsedTokenThemeRule("var", 0, FontStyle.NotSet, "ff0000", null)
    ], []);
    const colorMap = new ColorMap();
    const _A = colorMap.getId("F8F8F2");
    const _B = colorMap.getId("272822");
    const _C = colorMap.getId("ff0000");
    assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
    const root = new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.None, _A, _B), {
      "var": new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.Bold, _C, _B))
    });
    assert.deepStrictEqual(actual.getThemeTrieElement(), root);
  });
  test("rules are inherited 1", () => {
    const actual = TokenTheme.createFromParsedTokenTheme([
      new ParsedTokenThemeRule("", -1, FontStyle.NotSet, "F8F8F2", "272822"),
      new ParsedTokenThemeRule("var", -1, FontStyle.Bold, "ff0000", null),
      new ParsedTokenThemeRule("var.identifier", -1, FontStyle.NotSet, "00ff00", null)
    ], []);
    const colorMap = new ColorMap();
    const _A = colorMap.getId("F8F8F2");
    const _B = colorMap.getId("272822");
    const _C = colorMap.getId("ff0000");
    const _D = colorMap.getId("00ff00");
    assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
    const root = new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.None, _A, _B), {
      "var": new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.Bold, _C, _B), {
        "identifier": new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.Bold, _D, _B))
      })
    });
    assert.deepStrictEqual(actual.getThemeTrieElement(), root);
  });
  test("rules are inherited 2", () => {
    const actual = TokenTheme.createFromParsedTokenTheme([
      new ParsedTokenThemeRule("", -1, FontStyle.NotSet, "F8F8F2", "272822"),
      new ParsedTokenThemeRule("var", -1, FontStyle.Bold, "ff0000", null),
      new ParsedTokenThemeRule("var.identifier", -1, FontStyle.NotSet, "00ff00", null),
      new ParsedTokenThemeRule("constant", 4, FontStyle.Italic, "100000", null),
      new ParsedTokenThemeRule("constant.numeric", 5, FontStyle.NotSet, "200000", null),
      new ParsedTokenThemeRule("constant.numeric.hex", 6, FontStyle.Bold, null, null),
      new ParsedTokenThemeRule("constant.numeric.oct", 7, FontStyle.Bold | FontStyle.Italic | FontStyle.Underline, null, null),
      new ParsedTokenThemeRule("constant.numeric.dec", 8, FontStyle.None, "300000", null)
    ], []);
    const colorMap = new ColorMap();
    const _A = colorMap.getId("F8F8F2");
    const _B = colorMap.getId("272822");
    const _C = colorMap.getId("100000");
    const _D = colorMap.getId("200000");
    const _E = colorMap.getId("300000");
    const _F = colorMap.getId("ff0000");
    const _G = colorMap.getId("00ff00");
    assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
    const root = new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.None, _A, _B), {
      "var": new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.Bold, _F, _B), {
        "identifier": new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.Bold, _G, _B))
      }),
      "constant": new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.Italic, _C, _B), {
        "numeric": new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.Italic, _D, _B), {
          "hex": new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.Bold, _D, _B)),
          "oct": new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.Bold | FontStyle.Italic | FontStyle.Underline, _D, _B)),
          "dec": new ExternalThemeTrieElement(new ThemeTrieElementRule(FontStyle.None, _E, _B))
        })
      })
    });
    assert.deepStrictEqual(actual.getThemeTrieElement(), root);
  });
  test("custom colors are first in color map", () => {
    const actual = TokenTheme.createFromParsedTokenTheme([
      new ParsedTokenThemeRule("var", -1, FontStyle.NotSet, "F8F8F2", null)
    ], [
      "000000",
      "FFFFFF",
      "0F0F0F"
    ]);
    const colorMap = new ColorMap();
    colorMap.getId("000000");
    colorMap.getId("FFFFFF");
    colorMap.getId("0F0F0F");
    colorMap.getId("F8F8F2");
    assert.deepStrictEqual(actual.getColorMap(), colorMap.getColorMap());
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZXNcXHN1cHBvcnRzXFx0b2tlbml6YXRpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRm9udFN0eWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VuY29kZWRUb2tlbkF0dHJpYnV0ZXMuanMnO1xuaW1wb3J0IHsgQ29sb3JNYXAsIEV4dGVybmFsVGhlbWVUcmllRWxlbWVudCwgUGFyc2VkVG9rZW5UaGVtZVJ1bGUsIFRoZW1lVHJpZUVsZW1lbnRSdWxlLCBUb2tlblRoZW1lLCBwYXJzZVRva2VuVGhlbWUsIHN0cmNtcCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvc3VwcG9ydHMvdG9rZW5pemF0aW9uLmpzJztcblxuc3VpdGUoJ1Rva2VuIHRoZW1lIG1hdGNoaW5nJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2dpdmVzIGhpZ2hlciBwcmlvcml0eSB0byBkZWVwZXIgbWF0Y2hlcycsICgpID0+IHtcblx0XHRjb25zdCB0aGVtZSA9IFRva2VuVGhlbWUuY3JlYXRlRnJvbVJhd1Rva2VuVGhlbWUoW1xuXHRcdFx0eyB0b2tlbjogJycsIGZvcmVncm91bmQ6ICcxMDAwMDAnLCBiYWNrZ3JvdW5kOiAnMjAwMDAwJyB9LFxuXHRcdFx0eyB0b2tlbjogJ3B1bmN0dWF0aW9uLmRlZmluaXRpb24uc3RyaW5nLmJlZ2luLmh0bWwnLCBmb3JlZ3JvdW5kOiAnMzAwMDAwJyB9LFxuXHRcdFx0eyB0b2tlbjogJ3B1bmN0dWF0aW9uLmRlZmluaXRpb24uc3RyaW5nJywgZm9yZWdyb3VuZDogJzQwMDAwMCcgfSxcblx0XHRdLCBbXSk7XG5cblx0XHRjb25zdCBjb2xvck1hcCA9IG5ldyBDb2xvck1hcCgpO1xuXHRcdGNvbG9yTWFwLmdldElkKCcxMDAwMDAnKTtcblx0XHRjb25zdCBfQiA9IGNvbG9yTWFwLmdldElkKCcyMDAwMDAnKTtcblx0XHRjb2xvck1hcC5nZXRJZCgnNDAwMDAwJyk7XG5cdFx0Y29uc3QgX0QgPSBjb2xvck1hcC5nZXRJZCgnMzAwMDAwJyk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSB0aGVtZS5fbWF0Y2goJ3B1bmN0dWF0aW9uLmRlZmluaXRpb24uc3RyaW5nLmJlZ2luLmh0bWwnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBuZXcgVGhlbWVUcmllRWxlbWVudFJ1bGUoRm9udFN0eWxlLk5vbmUsIF9ELCBfQikpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW4gbWF0Y2gnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGhlbWUgPSBUb2tlblRoZW1lLmNyZWF0ZUZyb21SYXdUb2tlblRoZW1lKFtcblx0XHRcdHsgdG9rZW46ICcnLCBmb3JlZ3JvdW5kOiAnRjhGOEYyJywgYmFja2dyb3VuZDogJzI3MjgyMicgfSxcblx0XHRcdHsgdG9rZW46ICdzb3VyY2UnLCBiYWNrZ3JvdW5kOiAnMTAwMDAwJyB9LFxuXHRcdFx0eyB0b2tlbjogJ3NvbWV0aGluZycsIGJhY2tncm91bmQ6ICcxMDAwMDAnIH0sXG5cdFx0XHR7IHRva2VuOiAnYmFyJywgYmFja2dyb3VuZDogJzIwMDAwMCcgfSxcblx0XHRcdHsgdG9rZW46ICdiYXonLCBiYWNrZ3JvdW5kOiAnMjAwMDAwJyB9LFxuXHRcdFx0eyB0b2tlbjogJ2JhcicsIGZvbnRTdHlsZTogJ2JvbGQnIH0sXG5cdFx0XHR7IHRva2VuOiAnY29uc3RhbnQnLCBmb250U3R5bGU6ICdpdGFsaWMnLCBmb3JlZ3JvdW5kOiAnMzAwMDAwJyB9LFxuXHRcdFx0eyB0b2tlbjogJ2NvbnN0YW50Lm51bWVyaWMnLCBmb3JlZ3JvdW5kOiAnNDAwMDAwJyB9LFxuXHRcdFx0eyB0b2tlbjogJ2NvbnN0YW50Lm51bWVyaWMuaGV4JywgZm9udFN0eWxlOiAnYm9sZCcgfSxcblx0XHRcdHsgdG9rZW46ICdjb25zdGFudC5udW1lcmljLm9jdCcsIGZvbnRTdHlsZTogJ2JvbGQgaXRhbGljIHVuZGVybGluZScgfSxcblx0XHRcdHsgdG9rZW46ICdjb25zdGFudC5udW1lcmljLmJpbicsIGZvbnRTdHlsZTogJ2JvbGQgc3RyaWtldGhyb3VnaCcgfSxcblx0XHRcdHsgdG9rZW46ICdjb25zdGFudC5udW1lcmljLmRlYycsIGZvbnRTdHlsZTogJycsIGZvcmVncm91bmQ6ICc1MDAwMDAnIH0sXG5cdFx0XHR7IHRva2VuOiAnc3RvcmFnZS5vYmplY3QuYmFyJywgZm9udFN0eWxlOiAnJywgZm9yZWdyb3VuZDogJzYwMDAwMCcgfSxcblx0XHRdLCBbXSk7XG5cblx0XHRjb25zdCBjb2xvck1hcCA9IG5ldyBDb2xvck1hcCgpO1xuXHRcdGNvbnN0IF9BID0gY29sb3JNYXAuZ2V0SWQoJ0Y4RjhGMicpO1xuXHRcdGNvbnN0IF9CID0gY29sb3JNYXAuZ2V0SWQoJzI3MjgyMicpO1xuXHRcdGNvbnN0IF9DID0gY29sb3JNYXAuZ2V0SWQoJzIwMDAwMCcpO1xuXHRcdGNvbnN0IF9EID0gY29sb3JNYXAuZ2V0SWQoJzMwMDAwMCcpO1xuXHRcdGNvbnN0IF9FID0gY29sb3JNYXAuZ2V0SWQoJzQwMDAwMCcpO1xuXHRcdGNvbnN0IF9GID0gY29sb3JNYXAuZ2V0SWQoJzUwMDAwMCcpO1xuXHRcdGNvbnN0IF9HID0gY29sb3JNYXAuZ2V0SWQoJzEwMDAwMCcpO1xuXHRcdGNvbnN0IF9IID0gY29sb3JNYXAuZ2V0SWQoJzYwMDAwMCcpO1xuXG5cdFx0ZnVuY3Rpb24gYXNzZXJ0TWF0Y2goc2NvcGVOYW1lOiBzdHJpbmcsIGV4cGVjdGVkOiBUaGVtZVRyaWVFbGVtZW50UnVsZSk6IHZvaWQge1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gdGhlbWUuX21hdGNoKHNjb3BlTmFtZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsICd3aGVuIG1hdGNoaW5nIDw8JyArIHNjb3BlTmFtZSArICc+PicpO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGFzc2VydFNpbXBsZU1hdGNoKHNjb3BlTmFtZTogc3RyaW5nLCBmb250U3R5bGU6IEZvbnRTdHlsZSwgZm9yZWdyb3VuZDogbnVtYmVyLCBiYWNrZ3JvdW5kOiBudW1iZXIpOiB2b2lkIHtcblx0XHRcdGFzc2VydE1hdGNoKHNjb3BlTmFtZSwgbmV3IFRoZW1lVHJpZUVsZW1lbnRSdWxlKGZvbnRTdHlsZSwgZm9yZWdyb3VuZCwgYmFja2dyb3VuZCkpO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGFzc2VydE5vTWF0Y2goc2NvcGVOYW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdGFzc2VydE1hdGNoKHNjb3BlTmFtZSwgbmV3IFRoZW1lVHJpZUVsZW1lbnRSdWxlKEZvbnRTdHlsZS5Ob25lLCBfQSwgX0IpKTtcblx0XHR9XG5cblx0XHQvLyBtYXRjaGVzIGRlZmF1bHRzXG5cdFx0YXNzZXJ0Tm9NYXRjaCgnJyk7XG5cdFx0YXNzZXJ0Tm9NYXRjaCgnYmF6eicpO1xuXHRcdGFzc2VydE5vTWF0Y2goJ2FzZGZnJyk7XG5cblx0XHQvLyBtYXRjaGVzIHNvdXJjZVxuXHRcdGFzc2VydFNpbXBsZU1hdGNoKCdzb3VyY2UnLCBGb250U3R5bGUuTm9uZSwgX0EsIF9HKTtcblx0XHRhc3NlcnRTaW1wbGVNYXRjaCgnc291cmNlLnRzJywgRm9udFN0eWxlLk5vbmUsIF9BLCBfRyk7XG5cdFx0YXNzZXJ0U2ltcGxlTWF0Y2goJ3NvdXJjZS50c3MnLCBGb250U3R5bGUuTm9uZSwgX0EsIF9HKTtcblxuXHRcdC8vIG1hdGNoZXMgc29tZXRoaW5nXG5cdFx0YXNzZXJ0U2ltcGxlTWF0Y2goJ3NvbWV0aGluZycsIEZvbnRTdHlsZS5Ob25lLCBfQSwgX0cpO1xuXHRcdGFzc2VydFNpbXBsZU1hdGNoKCdzb21ldGhpbmcudHMnLCBGb250U3R5bGUuTm9uZSwgX0EsIF9HKTtcblx0XHRhc3NlcnRTaW1wbGVNYXRjaCgnc29tZXRoaW5nLnRzcycsIEZvbnRTdHlsZS5Ob25lLCBfQSwgX0cpO1xuXG5cdFx0Ly8gbWF0Y2hlcyBiYXpcblx0XHRhc3NlcnRTaW1wbGVNYXRjaCgnYmF6JywgRm9udFN0eWxlLk5vbmUsIF9BLCBfQyk7XG5cdFx0YXNzZXJ0U2ltcGxlTWF0Y2goJ2Jhei50cycsIEZvbnRTdHlsZS5Ob25lLCBfQSwgX0MpO1xuXHRcdGFzc2VydFNpbXBsZU1hdGNoKCdiYXoudHNzJywgRm9udFN0eWxlLk5vbmUsIF9BLCBfQyk7XG5cblx0XHQvLyBtYXRjaGVzIGNvbnN0YW50XG5cdFx0YXNzZXJ0U2ltcGxlTWF0Y2goJ2NvbnN0YW50JywgRm9udFN0eWxlLkl0YWxpYywgX0QsIF9CKTtcblx0XHRhc3NlcnRTaW1wbGVNYXRjaCgnY29uc3RhbnQuc3RyaW5nJywgRm9udFN0eWxlLkl0YWxpYywgX0QsIF9CKTtcblx0XHRhc3NlcnRTaW1wbGVNYXRjaCgnY29uc3RhbnQuaGV4JywgRm9udFN0eWxlLkl0YWxpYywgX0QsIF9CKTtcblxuXHRcdC8vIG1hdGNoZXMgY29uc3RhbnQubnVtZXJpY1xuXHRcdGFzc2VydFNpbXBsZU1hdGNoKCdjb25zdGFudC5udW1lcmljJywgRm9udFN0eWxlLkl0YWxpYywgX0UsIF9CKTtcblx0XHRhc3NlcnRTaW1wbGVNYXRjaCgnY29uc3RhbnQubnVtZXJpYy5iYXonLCBGb250U3R5bGUuSXRhbGljLCBfRSwgX0IpO1xuXG5cdFx0Ly8gbWF0Y2hlcyBjb25zdGFudC5udW1lcmljLmhleFxuXHRcdGFzc2VydFNpbXBsZU1hdGNoKCdjb25zdGFudC5udW1lcmljLmhleCcsIEZvbnRTdHlsZS5Cb2xkLCBfRSwgX0IpO1xuXHRcdGFzc2VydFNpbXBsZU1hdGNoKCdjb25zdGFudC5udW1lcmljLmhleC5iYXonLCBGb250U3R5bGUuQm9sZCwgX0UsIF9CKTtcblxuXHRcdC8vIG1hdGNoZXMgY29uc3RhbnQubnVtZXJpYy5vY3Rcblx0XHRhc3NlcnRTaW1wbGVNYXRjaCgnY29uc3RhbnQubnVtZXJpYy5vY3QnLCBGb250U3R5bGUuQm9sZCB8IEZvbnRTdHlsZS5JdGFsaWMgfCBGb250U3R5bGUuVW5kZXJsaW5lLCBfRSwgX0IpO1xuXHRcdGFzc2VydFNpbXBsZU1hdGNoKCdjb25zdGFudC5udW1lcmljLm9jdC5iYXonLCBGb250U3R5bGUuQm9sZCB8IEZvbnRTdHlsZS5JdGFsaWMgfCBGb250U3R5bGUuVW5kZXJsaW5lLCBfRSwgX0IpO1xuXG5cdFx0Ly8gbWF0Y2hlcyBjb25zdGFudC5udW1lcmljLmJpblxuXHRcdGFzc2VydFNpbXBsZU1hdGNoKCdjb25zdGFudC5udW1lcmljLmJpbicsIEZvbnRTdHlsZS5Cb2xkIHwgRm9udFN0eWxlLlN0cmlrZXRocm91Z2gsIF9FLCBfQik7XG5cdFx0YXNzZXJ0U2ltcGxlTWF0Y2goJ2NvbnN0YW50Lm51bWVyaWMuYmluLmJheicsIEZvbnRTdHlsZS5Cb2xkIHwgRm9udFN0eWxlLlN0cmlrZXRocm91Z2gsIF9FLCBfQik7XG5cblx0XHQvLyBtYXRjaGVzIGNvbnN0YW50Lm51bWVyaWMuZGVjXG5cdFx0YXNzZXJ0U2ltcGxlTWF0Y2goJ2NvbnN0YW50Lm51bWVyaWMuZGVjJywgRm9udFN0eWxlLk5vbmUsIF9GLCBfQik7XG5cdFx0YXNzZXJ0U2ltcGxlTWF0Y2goJ2NvbnN0YW50Lm51bWVyaWMuZGVjLmJheicsIEZvbnRTdHlsZS5Ob25lLCBfRiwgX0IpO1xuXG5cdFx0Ly8gbWF0Y2hlcyBzdG9yYWdlLm9iamVjdC5iYXJcblx0XHRhc3NlcnRTaW1wbGVNYXRjaCgnc3RvcmFnZS5vYmplY3QuYmFyJywgRm9udFN0eWxlLk5vbmUsIF9ILCBfQik7XG5cdFx0YXNzZXJ0U2ltcGxlTWF0Y2goJ3N0b3JhZ2Uub2JqZWN0LmJhci5iYXonLCBGb250U3R5bGUuTm9uZSwgX0gsIF9CKTtcblxuXHRcdC8vIGRvZXMgbm90IG1hdGNoIHN0b3JhZ2Uub2JqZWN0LmJhclxuXHRcdGFzc2VydFNpbXBsZU1hdGNoKCdzdG9yYWdlLm9iamVjdC5iYXJ0JywgRm9udFN0eWxlLk5vbmUsIF9BLCBfQik7XG5cdFx0YXNzZXJ0U2ltcGxlTWF0Y2goJ3N0b3JhZ2Uub2JqZWN0JywgRm9udFN0eWxlLk5vbmUsIF9BLCBfQik7XG5cdFx0YXNzZXJ0U2ltcGxlTWF0Y2goJ3N0b3JhZ2UnLCBGb250U3R5bGUuTm9uZSwgX0EsIF9CKTtcblxuXHRcdGFzc2VydFNpbXBsZU1hdGNoKCdiYXInLCBGb250U3R5bGUuQm9sZCwgX0EsIF9DKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1Rva2VuIHRoZW1lIHBhcnNpbmcnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnY2FuIHBhcnNlJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gcGFyc2VUb2tlblRoZW1lKFtcblx0XHRcdHsgdG9rZW46ICcnLCBmb3JlZ3JvdW5kOiAnRjhGOEYyJywgYmFja2dyb3VuZDogJzI3MjgyMicgfSxcblx0XHRcdHsgdG9rZW46ICdzb3VyY2UnLCBiYWNrZ3JvdW5kOiAnMTAwMDAwJyB9LFxuXHRcdFx0eyB0b2tlbjogJ3NvbWV0aGluZycsIGJhY2tncm91bmQ6ICcxMDAwMDAnIH0sXG5cdFx0XHR7IHRva2VuOiAnYmFyJywgYmFja2dyb3VuZDogJzAxMDAwMCcgfSxcblx0XHRcdHsgdG9rZW46ICdiYXonLCBiYWNrZ3JvdW5kOiAnMDEwMDAwJyB9LFxuXHRcdFx0eyB0b2tlbjogJ2JhcicsIGZvbnRTdHlsZTogJ2JvbGQnIH0sXG5cdFx0XHR7IHRva2VuOiAnY29uc3RhbnQnLCBmb250U3R5bGU6ICdpdGFsaWMnLCBmb3JlZ3JvdW5kOiAnZmYwMDAwJyB9LFxuXHRcdFx0eyB0b2tlbjogJ2NvbnN0YW50Lm51bWVyaWMnLCBmb3JlZ3JvdW5kOiAnMDBmZjAwJyB9LFxuXHRcdFx0eyB0b2tlbjogJ2NvbnN0YW50Lm51bWVyaWMuaGV4JywgZm9udFN0eWxlOiAnYm9sZCcgfSxcblx0XHRcdHsgdG9rZW46ICdjb25zdGFudC5udW1lcmljLm9jdCcsIGZvbnRTdHlsZTogJ2JvbGQgaXRhbGljIHVuZGVybGluZScgfSxcblx0XHRcdHsgdG9rZW46ICdjb25zdGFudC5udW1lcmljLmRlYycsIGZvbnRTdHlsZTogJycsIGZvcmVncm91bmQ6ICcwMDAwZmYnIH0sXG5cdFx0XSk7XG5cblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdG5ldyBQYXJzZWRUb2tlblRoZW1lUnVsZSgnJywgMCwgRm9udFN0eWxlLk5vdFNldCwgJ0Y4RjhGMicsICcyNzI4MjInKSxcblx0XHRcdG5ldyBQYXJzZWRUb2tlblRoZW1lUnVsZSgnc291cmNlJywgMSwgRm9udFN0eWxlLk5vdFNldCwgbnVsbCwgJzEwMDAwMCcpLFxuXHRcdFx0bmV3IFBhcnNlZFRva2VuVGhlbWVSdWxlKCdzb21ldGhpbmcnLCAyLCBGb250U3R5bGUuTm90U2V0LCBudWxsLCAnMTAwMDAwJyksXG5cdFx0XHRuZXcgUGFyc2VkVG9rZW5UaGVtZVJ1bGUoJ2JhcicsIDMsIEZvbnRTdHlsZS5Ob3RTZXQsIG51bGwsICcwMTAwMDAnKSxcblx0XHRcdG5ldyBQYXJzZWRUb2tlblRoZW1lUnVsZSgnYmF6JywgNCwgRm9udFN0eWxlLk5vdFNldCwgbnVsbCwgJzAxMDAwMCcpLFxuXHRcdFx0bmV3IFBhcnNlZFRva2VuVGhlbWVSdWxlKCdiYXInLCA1LCBGb250U3R5bGUuQm9sZCwgbnVsbCwgbnVsbCksXG5cdFx0XHRuZXcgUGFyc2VkVG9rZW5UaGVtZVJ1bGUoJ2NvbnN0YW50JywgNiwgRm9udFN0eWxlLkl0YWxpYywgJ2ZmMDAwMCcsIG51bGwpLFxuXHRcdFx0bmV3IFBhcnNlZFRva2VuVGhlbWVSdWxlKCdjb25zdGFudC5udW1lcmljJywgNywgRm9udFN0eWxlLk5vdFNldCwgJzAwZmYwMCcsIG51bGwpLFxuXHRcdFx0bmV3IFBhcnNlZFRva2VuVGhlbWVSdWxlKCdjb25zdGFudC5udW1lcmljLmhleCcsIDgsIEZvbnRTdHlsZS5Cb2xkLCBudWxsLCBudWxsKSxcblx0XHRcdG5ldyBQYXJzZWRUb2tlblRoZW1lUnVsZSgnY29uc3RhbnQubnVtZXJpYy5vY3QnLCA5LCBGb250U3R5bGUuQm9sZCB8IEZvbnRTdHlsZS5JdGFsaWMgfCBGb250U3R5bGUuVW5kZXJsaW5lLCBudWxsLCBudWxsKSxcblx0XHRcdG5ldyBQYXJzZWRUb2tlblRoZW1lUnVsZSgnY29uc3RhbnQubnVtZXJpYy5kZWMnLCAxMCwgRm9udFN0eWxlLk5vbmUsICcwMDAwZmYnLCBudWxsKSxcblx0XHRdO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1Rva2VuIHRoZW1lIHJlc29sdmluZycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdzdHJjbXAgd29ya3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gWydiYXInLCAneicsICd6dScsICdhJywgJ2FiJywgJyddLnNvcnQoc3RyY21wKTtcblxuXHRcdGNvbnN0IGV4cGVjdGVkID0gWycnLCAnYScsICdhYicsICdiYXInLCAneicsICd6dSddO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Fsd2F5cyBoYXMgZGVmYXVsdHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gVG9rZW5UaGVtZS5jcmVhdGVGcm9tUGFyc2VkVG9rZW5UaGVtZShbXSwgW10pO1xuXHRcdGNvbnN0IGNvbG9yTWFwID0gbmV3IENvbG9yTWFwKCk7XG5cdFx0Y29uc3QgX0EgPSBjb2xvck1hcC5nZXRJZCgnMDAwMDAwJyk7XG5cdFx0Y29uc3QgX0IgPSBjb2xvck1hcC5nZXRJZCgnZmZmZmZmJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuZ2V0Q29sb3JNYXAoKSwgY29sb3JNYXAuZ2V0Q29sb3JNYXAoKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuZ2V0VGhlbWVUcmllRWxlbWVudCgpLCBuZXcgRXh0ZXJuYWxUaGVtZVRyaWVFbGVtZW50KG5ldyBUaGVtZVRyaWVFbGVtZW50UnVsZShGb250U3R5bGUuTm9uZSwgX0EsIF9CKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNwZWN0cyBpbmNvbWluZyBkZWZhdWx0cyAxJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IFRva2VuVGhlbWUuY3JlYXRlRnJvbVBhcnNlZFRva2VuVGhlbWUoW1xuXHRcdFx0bmV3IFBhcnNlZFRva2VuVGhlbWVSdWxlKCcnLCAtMSwgRm9udFN0eWxlLk5vdFNldCwgbnVsbCwgbnVsbClcblx0XHRdLCBbXSk7XG5cdFx0Y29uc3QgY29sb3JNYXAgPSBuZXcgQ29sb3JNYXAoKTtcblx0XHRjb25zdCBfQSA9IGNvbG9yTWFwLmdldElkKCcwMDAwMDAnKTtcblx0XHRjb25zdCBfQiA9IGNvbG9yTWFwLmdldElkKCdmZmZmZmYnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5nZXRDb2xvck1hcCgpLCBjb2xvck1hcC5nZXRDb2xvck1hcCgpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5nZXRUaGVtZVRyaWVFbGVtZW50KCksIG5ldyBFeHRlcm5hbFRoZW1lVHJpZUVsZW1lbnQobmV3IFRoZW1lVHJpZUVsZW1lbnRSdWxlKEZvbnRTdHlsZS5Ob25lLCBfQSwgX0IpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3BlY3RzIGluY29taW5nIGRlZmF1bHRzIDInLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gVG9rZW5UaGVtZS5jcmVhdGVGcm9tUGFyc2VkVG9rZW5UaGVtZShbXG5cdFx0XHRuZXcgUGFyc2VkVG9rZW5UaGVtZVJ1bGUoJycsIC0xLCBGb250U3R5bGUuTm9uZSwgbnVsbCwgbnVsbClcblx0XHRdLCBbXSk7XG5cdFx0Y29uc3QgY29sb3JNYXAgPSBuZXcgQ29sb3JNYXAoKTtcblx0XHRjb25zdCBfQSA9IGNvbG9yTWFwLmdldElkKCcwMDAwMDAnKTtcblx0XHRjb25zdCBfQiA9IGNvbG9yTWFwLmdldElkKCdmZmZmZmYnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5nZXRDb2xvck1hcCgpLCBjb2xvck1hcC5nZXRDb2xvck1hcCgpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5nZXRUaGVtZVRyaWVFbGVtZW50KCksIG5ldyBFeHRlcm5hbFRoZW1lVHJpZUVsZW1lbnQobmV3IFRoZW1lVHJpZUVsZW1lbnRSdWxlKEZvbnRTdHlsZS5Ob25lLCBfQSwgX0IpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3BlY3RzIGluY29taW5nIGRlZmF1bHRzIDMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gVG9rZW5UaGVtZS5jcmVhdGVGcm9tUGFyc2VkVG9rZW5UaGVtZShbXG5cdFx0XHRuZXcgUGFyc2VkVG9rZW5UaGVtZVJ1bGUoJycsIC0xLCBGb250U3R5bGUuQm9sZCwgbnVsbCwgbnVsbClcblx0XHRdLCBbXSk7XG5cdFx0Y29uc3QgY29sb3JNYXAgPSBuZXcgQ29sb3JNYXAoKTtcblx0XHRjb25zdCBfQSA9IGNvbG9yTWFwLmdldElkKCcwMDAwMDAnKTtcblx0XHRjb25zdCBfQiA9IGNvbG9yTWFwLmdldElkKCdmZmZmZmYnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5nZXRDb2xvck1hcCgpLCBjb2xvck1hcC5nZXRDb2xvck1hcCgpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5nZXRUaGVtZVRyaWVFbGVtZW50KCksIG5ldyBFeHRlcm5hbFRoZW1lVHJpZUVsZW1lbnQobmV3IFRoZW1lVHJpZUVsZW1lbnRSdWxlKEZvbnRTdHlsZS5Cb2xkLCBfQSwgX0IpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3BlY3RzIGluY29taW5nIGRlZmF1bHRzIDQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gVG9rZW5UaGVtZS5jcmVhdGVGcm9tUGFyc2VkVG9rZW5UaGVtZShbXG5cdFx0XHRuZXcgUGFyc2VkVG9rZW5UaGVtZVJ1bGUoJycsIC0xLCBGb250U3R5bGUuTm90U2V0LCAnZmYwMDAwJywgbnVsbClcblx0XHRdLCBbXSk7XG5cdFx0Y29uc3QgY29sb3JNYXAgPSBuZXcgQ29sb3JNYXAoKTtcblx0XHRjb25zdCBfQSA9IGNvbG9yTWFwLmdldElkKCdmZjAwMDAnKTtcblx0XHRjb25zdCBfQiA9IGNvbG9yTWFwLmdldElkKCdmZmZmZmYnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5nZXRDb2xvck1hcCgpLCBjb2xvck1hcC5nZXRDb2xvck1hcCgpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5nZXRUaGVtZVRyaWVFbGVtZW50KCksIG5ldyBFeHRlcm5hbFRoZW1lVHJpZUVsZW1lbnQobmV3IFRoZW1lVHJpZUVsZW1lbnRSdWxlKEZvbnRTdHlsZS5Ob25lLCBfQSwgX0IpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3BlY3RzIGluY29taW5nIGRlZmF1bHRzIDUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gVG9rZW5UaGVtZS5jcmVhdGVGcm9tUGFyc2VkVG9rZW5UaGVtZShbXG5cdFx0XHRuZXcgUGFyc2VkVG9rZW5UaGVtZVJ1bGUoJycsIC0xLCBGb250U3R5bGUuTm90U2V0LCBudWxsLCAnZmYwMDAwJylcblx0XHRdLCBbXSk7XG5cdFx0Y29uc3QgY29sb3JNYXAgPSBuZXcgQ29sb3JNYXAoKTtcblx0XHRjb25zdCBfQSA9IGNvbG9yTWFwLmdldElkKCcwMDAwMDAnKTtcblx0XHRjb25zdCBfQiA9IGNvbG9yTWFwLmdldElkKCdmZjAwMDAnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5nZXRDb2xvck1hcCgpLCBjb2xvck1hcC5nZXRDb2xvck1hcCgpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5nZXRUaGVtZVRyaWVFbGVtZW50KCksIG5ldyBFeHRlcm5hbFRoZW1lVHJpZUVsZW1lbnQobmV3IFRoZW1lVHJpZUVsZW1lbnRSdWxlKEZvbnRTdHlsZS5Ob25lLCBfQSwgX0IpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiBtZXJnZSBpbmNvbWluZyBkZWZhdWx0cycsICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSBUb2tlblRoZW1lLmNyZWF0ZUZyb21QYXJzZWRUb2tlblRoZW1lKFtcblx0XHRcdG5ldyBQYXJzZWRUb2tlblRoZW1lUnVsZSgnJywgLTEsIEZvbnRTdHlsZS5Ob3RTZXQsIG51bGwsICdmZjAwMDAnKSxcblx0XHRcdG5ldyBQYXJzZWRUb2tlblRoZW1lUnVsZSgnJywgLTEsIEZvbnRTdHlsZS5Ob3RTZXQsICcwMGZmMDAnLCBudWxsKSxcblx0XHRcdG5ldyBQYXJzZWRUb2tlblRoZW1lUnVsZSgnJywgLTEsIEZvbnRTdHlsZS5Cb2xkLCBudWxsLCBudWxsKSxcblx0XHRdLCBbXSk7XG5cdFx0Y29uc3QgY29sb3JNYXAgPSBuZXcgQ29sb3JNYXAoKTtcblx0XHRjb25zdCBfQSA9IGNvbG9yTWFwLmdldElkKCcwMGZmMDAnKTtcblx0XHRjb25zdCBfQiA9IGNvbG9yTWFwLmdldElkKCdmZjAwMDAnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5nZXRDb2xvck1hcCgpLCBjb2xvck1hcC5nZXRDb2xvck1hcCgpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5nZXRUaGVtZVRyaWVFbGVtZW50KCksIG5ldyBFeHRlcm5hbFRoZW1lVHJpZUVsZW1lbnQobmV3IFRoZW1lVHJpZUVsZW1lbnRSdWxlKEZvbnRTdHlsZS5Cb2xkLCBfQSwgX0IpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlZmF1bHRzIGFyZSBpbmhlcml0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gVG9rZW5UaGVtZS5jcmVhdGVGcm9tUGFyc2VkVG9rZW5UaGVtZShbXG5cdFx0XHRuZXcgUGFyc2VkVG9rZW5UaGVtZVJ1bGUoJycsIC0xLCBGb250U3R5bGUuTm90U2V0LCAnRjhGOEYyJywgJzI3MjgyMicpLFxuXHRcdFx0bmV3IFBhcnNlZFRva2VuVGhlbWVSdWxlKCd2YXInLCAtMSwgRm9udFN0eWxlLk5vdFNldCwgJ2ZmMDAwMCcsIG51bGwpXG5cdFx0XSwgW10pO1xuXHRcdGNvbnN0IGNvbG9yTWFwID0gbmV3IENvbG9yTWFwKCk7XG5cdFx0Y29uc3QgX0EgPSBjb2xvck1hcC5nZXRJZCgnRjhGOEYyJyk7XG5cdFx0Y29uc3QgX0IgPSBjb2xvck1hcC5nZXRJZCgnMjcyODIyJyk7XG5cdFx0Y29uc3QgX0MgPSBjb2xvck1hcC5nZXRJZCgnZmYwMDAwJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuZ2V0Q29sb3JNYXAoKSwgY29sb3JNYXAuZ2V0Q29sb3JNYXAoKSk7XG5cdFx0Y29uc3Qgcm9vdCA9IG5ldyBFeHRlcm5hbFRoZW1lVHJpZUVsZW1lbnQobmV3IFRoZW1lVHJpZUVsZW1lbnRSdWxlKEZvbnRTdHlsZS5Ob25lLCBfQSwgX0IpLCB7XG5cdFx0XHQndmFyJzogbmV3IEV4dGVybmFsVGhlbWVUcmllRWxlbWVudChuZXcgVGhlbWVUcmllRWxlbWVudFJ1bGUoRm9udFN0eWxlLk5vbmUsIF9DLCBfQikpXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuZ2V0VGhlbWVUcmllRWxlbWVudCgpLCByb290KTtcblx0fSk7XG5cblx0dGVzdCgnc2FtZSBydWxlcyBnZXQgbWVyZ2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IFRva2VuVGhlbWUuY3JlYXRlRnJvbVBhcnNlZFRva2VuVGhlbWUoW1xuXHRcdFx0bmV3IFBhcnNlZFRva2VuVGhlbWVSdWxlKCcnLCAtMSwgRm9udFN0eWxlLk5vdFNldCwgJ0Y4RjhGMicsICcyNzI4MjInKSxcblx0XHRcdG5ldyBQYXJzZWRUb2tlblRoZW1lUnVsZSgndmFyJywgMSwgRm9udFN0eWxlLkJvbGQsIG51bGwsIG51bGwpLFxuXHRcdFx0bmV3IFBhcnNlZFRva2VuVGhlbWVSdWxlKCd2YXInLCAwLCBGb250U3R5bGUuTm90U2V0LCAnZmYwMDAwJywgbnVsbCksXG5cdFx0XSwgW10pO1xuXHRcdGNvbnN0IGNvbG9yTWFwID0gbmV3IENvbG9yTWFwKCk7XG5cdFx0Y29uc3QgX0EgPSBjb2xvck1hcC5nZXRJZCgnRjhGOEYyJyk7XG5cdFx0Y29uc3QgX0IgPSBjb2xvck1hcC5nZXRJZCgnMjcyODIyJyk7XG5cdFx0Y29uc3QgX0MgPSBjb2xvck1hcC5nZXRJZCgnZmYwMDAwJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuZ2V0Q29sb3JNYXAoKSwgY29sb3JNYXAuZ2V0Q29sb3JNYXAoKSk7XG5cdFx0Y29uc3Qgcm9vdCA9IG5ldyBFeHRlcm5hbFRoZW1lVHJpZUVsZW1lbnQobmV3IFRoZW1lVHJpZUVsZW1lbnRSdWxlKEZvbnRTdHlsZS5Ob25lLCBfQSwgX0IpLCB7XG5cdFx0XHQndmFyJzogbmV3IEV4dGVybmFsVGhlbWVUcmllRWxlbWVudChuZXcgVGhlbWVUcmllRWxlbWVudFJ1bGUoRm9udFN0eWxlLkJvbGQsIF9DLCBfQikpXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuZ2V0VGhlbWVUcmllRWxlbWVudCgpLCByb290KTtcblx0fSk7XG5cblx0dGVzdCgncnVsZXMgYXJlIGluaGVyaXRlZCAxJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IFRva2VuVGhlbWUuY3JlYXRlRnJvbVBhcnNlZFRva2VuVGhlbWUoW1xuXHRcdFx0bmV3IFBhcnNlZFRva2VuVGhlbWVSdWxlKCcnLCAtMSwgRm9udFN0eWxlLk5vdFNldCwgJ0Y4RjhGMicsICcyNzI4MjInKSxcblx0XHRcdG5ldyBQYXJzZWRUb2tlblRoZW1lUnVsZSgndmFyJywgLTEsIEZvbnRTdHlsZS5Cb2xkLCAnZmYwMDAwJywgbnVsbCksXG5cdFx0XHRuZXcgUGFyc2VkVG9rZW5UaGVtZVJ1bGUoJ3Zhci5pZGVudGlmaWVyJywgLTEsIEZvbnRTdHlsZS5Ob3RTZXQsICcwMGZmMDAnLCBudWxsKSxcblx0XHRdLCBbXSk7XG5cdFx0Y29uc3QgY29sb3JNYXAgPSBuZXcgQ29sb3JNYXAoKTtcblx0XHRjb25zdCBfQSA9IGNvbG9yTWFwLmdldElkKCdGOEY4RjInKTtcblx0XHRjb25zdCBfQiA9IGNvbG9yTWFwLmdldElkKCcyNzI4MjInKTtcblx0XHRjb25zdCBfQyA9IGNvbG9yTWFwLmdldElkKCdmZjAwMDAnKTtcblx0XHRjb25zdCBfRCA9IGNvbG9yTWFwLmdldElkKCcwMGZmMDAnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5nZXRDb2xvck1hcCgpLCBjb2xvck1hcC5nZXRDb2xvck1hcCgpKTtcblx0XHRjb25zdCByb290ID0gbmV3IEV4dGVybmFsVGhlbWVUcmllRWxlbWVudChuZXcgVGhlbWVUcmllRWxlbWVudFJ1bGUoRm9udFN0eWxlLk5vbmUsIF9BLCBfQiksIHtcblx0XHRcdCd2YXInOiBuZXcgRXh0ZXJuYWxUaGVtZVRyaWVFbGVtZW50KG5ldyBUaGVtZVRyaWVFbGVtZW50UnVsZShGb250U3R5bGUuQm9sZCwgX0MsIF9CKSwge1xuXHRcdFx0XHQnaWRlbnRpZmllcic6IG5ldyBFeHRlcm5hbFRoZW1lVHJpZUVsZW1lbnQobmV3IFRoZW1lVHJpZUVsZW1lbnRSdWxlKEZvbnRTdHlsZS5Cb2xkLCBfRCwgX0IpKVxuXHRcdFx0fSlcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5nZXRUaGVtZVRyaWVFbGVtZW50KCksIHJvb3QpO1xuXHR9KTtcblxuXHR0ZXN0KCdydWxlcyBhcmUgaW5oZXJpdGVkIDInLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gVG9rZW5UaGVtZS5jcmVhdGVGcm9tUGFyc2VkVG9rZW5UaGVtZShbXG5cdFx0XHRuZXcgUGFyc2VkVG9rZW5UaGVtZVJ1bGUoJycsIC0xLCBGb250U3R5bGUuTm90U2V0LCAnRjhGOEYyJywgJzI3MjgyMicpLFxuXHRcdFx0bmV3IFBhcnNlZFRva2VuVGhlbWVSdWxlKCd2YXInLCAtMSwgRm9udFN0eWxlLkJvbGQsICdmZjAwMDAnLCBudWxsKSxcblx0XHRcdG5ldyBQYXJzZWRUb2tlblRoZW1lUnVsZSgndmFyLmlkZW50aWZpZXInLCAtMSwgRm9udFN0eWxlLk5vdFNldCwgJzAwZmYwMCcsIG51bGwpLFxuXHRcdFx0bmV3IFBhcnNlZFRva2VuVGhlbWVSdWxlKCdjb25zdGFudCcsIDQsIEZvbnRTdHlsZS5JdGFsaWMsICcxMDAwMDAnLCBudWxsKSxcblx0XHRcdG5ldyBQYXJzZWRUb2tlblRoZW1lUnVsZSgnY29uc3RhbnQubnVtZXJpYycsIDUsIEZvbnRTdHlsZS5Ob3RTZXQsICcyMDAwMDAnLCBudWxsKSxcblx0XHRcdG5ldyBQYXJzZWRUb2tlblRoZW1lUnVsZSgnY29uc3RhbnQubnVtZXJpYy5oZXgnLCA2LCBGb250U3R5bGUuQm9sZCwgbnVsbCwgbnVsbCksXG5cdFx0XHRuZXcgUGFyc2VkVG9rZW5UaGVtZVJ1bGUoJ2NvbnN0YW50Lm51bWVyaWMub2N0JywgNywgRm9udFN0eWxlLkJvbGQgfCBGb250U3R5bGUuSXRhbGljIHwgRm9udFN0eWxlLlVuZGVybGluZSwgbnVsbCwgbnVsbCksXG5cdFx0XHRuZXcgUGFyc2VkVG9rZW5UaGVtZVJ1bGUoJ2NvbnN0YW50Lm51bWVyaWMuZGVjJywgOCwgRm9udFN0eWxlLk5vbmUsICczMDAwMDAnLCBudWxsKSxcblx0XHRdLCBbXSk7XG5cdFx0Y29uc3QgY29sb3JNYXAgPSBuZXcgQ29sb3JNYXAoKTtcblx0XHRjb25zdCBfQSA9IGNvbG9yTWFwLmdldElkKCdGOEY4RjInKTtcblx0XHRjb25zdCBfQiA9IGNvbG9yTWFwLmdldElkKCcyNzI4MjInKTtcblx0XHRjb25zdCBfQyA9IGNvbG9yTWFwLmdldElkKCcxMDAwMDAnKTtcblx0XHRjb25zdCBfRCA9IGNvbG9yTWFwLmdldElkKCcyMDAwMDAnKTtcblx0XHRjb25zdCBfRSA9IGNvbG9yTWFwLmdldElkKCczMDAwMDAnKTtcblx0XHRjb25zdCBfRiA9IGNvbG9yTWFwLmdldElkKCdmZjAwMDAnKTtcblx0XHRjb25zdCBfRyA9IGNvbG9yTWFwLmdldElkKCcwMGZmMDAnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5nZXRDb2xvck1hcCgpLCBjb2xvck1hcC5nZXRDb2xvck1hcCgpKTtcblx0XHRjb25zdCByb290ID0gbmV3IEV4dGVybmFsVGhlbWVUcmllRWxlbWVudChuZXcgVGhlbWVUcmllRWxlbWVudFJ1bGUoRm9udFN0eWxlLk5vbmUsIF9BLCBfQiksIHtcblx0XHRcdCd2YXInOiBuZXcgRXh0ZXJuYWxUaGVtZVRyaWVFbGVtZW50KG5ldyBUaGVtZVRyaWVFbGVtZW50UnVsZShGb250U3R5bGUuQm9sZCwgX0YsIF9CKSwge1xuXHRcdFx0XHQnaWRlbnRpZmllcic6IG5ldyBFeHRlcm5hbFRoZW1lVHJpZUVsZW1lbnQobmV3IFRoZW1lVHJpZUVsZW1lbnRSdWxlKEZvbnRTdHlsZS5Cb2xkLCBfRywgX0IpKVxuXHRcdFx0fSksXG5cdFx0XHQnY29uc3RhbnQnOiBuZXcgRXh0ZXJuYWxUaGVtZVRyaWVFbGVtZW50KG5ldyBUaGVtZVRyaWVFbGVtZW50UnVsZShGb250U3R5bGUuSXRhbGljLCBfQywgX0IpLCB7XG5cdFx0XHRcdCdudW1lcmljJzogbmV3IEV4dGVybmFsVGhlbWVUcmllRWxlbWVudChuZXcgVGhlbWVUcmllRWxlbWVudFJ1bGUoRm9udFN0eWxlLkl0YWxpYywgX0QsIF9CKSwge1xuXHRcdFx0XHRcdCdoZXgnOiBuZXcgRXh0ZXJuYWxUaGVtZVRyaWVFbGVtZW50KG5ldyBUaGVtZVRyaWVFbGVtZW50UnVsZShGb250U3R5bGUuQm9sZCwgX0QsIF9CKSksXG5cdFx0XHRcdFx0J29jdCc6IG5ldyBFeHRlcm5hbFRoZW1lVHJpZUVsZW1lbnQobmV3IFRoZW1lVHJpZUVsZW1lbnRSdWxlKEZvbnRTdHlsZS5Cb2xkIHwgRm9udFN0eWxlLkl0YWxpYyB8IEZvbnRTdHlsZS5VbmRlcmxpbmUsIF9ELCBfQikpLFxuXHRcdFx0XHRcdCdkZWMnOiBuZXcgRXh0ZXJuYWxUaGVtZVRyaWVFbGVtZW50KG5ldyBUaGVtZVRyaWVFbGVtZW50UnVsZShGb250U3R5bGUuTm9uZSwgX0UsIF9CKSksXG5cdFx0XHRcdH0pXG5cdFx0XHR9KVxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmdldFRoZW1lVHJpZUVsZW1lbnQoKSwgcm9vdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2N1c3RvbSBjb2xvcnMgYXJlIGZpcnN0IGluIGNvbG9yIG1hcCcsICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSBUb2tlblRoZW1lLmNyZWF0ZUZyb21QYXJzZWRUb2tlblRoZW1lKFtcblx0XHRcdG5ldyBQYXJzZWRUb2tlblRoZW1lUnVsZSgndmFyJywgLTEsIEZvbnRTdHlsZS5Ob3RTZXQsICdGOEY4RjInLCBudWxsKVxuXHRcdF0sIFtcblx0XHRcdCcwMDAwMDAnLCAnRkZGRkZGJywgJzBGMEYwRidcblx0XHRdKTtcblx0XHRjb25zdCBjb2xvck1hcCA9IG5ldyBDb2xvck1hcCgpO1xuXHRcdGNvbG9yTWFwLmdldElkKCcwMDAwMDAnKTtcblx0XHRjb2xvck1hcC5nZXRJZCgnRkZGRkZGJyk7XG5cdFx0Y29sb3JNYXAuZ2V0SWQoJzBGMEYwRicpO1xuXHRcdGNvbG9yTWFwLmdldElkKCdGOEY4RjInKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5nZXRDb2xvck1hcCgpLCBjb2xvck1hcC5nZXRDb2xvck1hcCgpKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFVBQVUsMEJBQTBCLHNCQUFzQixzQkFBc0IsWUFBWSxpQkFBaUIsY0FBYztBQUVwSSxNQUFNLHdCQUF3QixNQUFNO0FBRW5DLDBDQUF3QztBQUV4QyxPQUFLLDJDQUEyQyxNQUFNO0FBQ3JELFVBQU0sUUFBUSxXQUFXLHdCQUF3QjtBQUFBLE1BQ2hELEVBQUUsT0FBTyxJQUFJLFlBQVksVUFBVSxZQUFZLFNBQVM7QUFBQSxNQUN4RCxFQUFFLE9BQU8sNENBQTRDLFlBQVksU0FBUztBQUFBLE1BQzFFLEVBQUUsT0FBTyxpQ0FBaUMsWUFBWSxTQUFTO0FBQUEsSUFDaEUsR0FBRyxDQUFDLENBQUM7QUFFTCxVQUFNLFdBQVcsSUFBSSxTQUFTO0FBQzlCLGFBQVMsTUFBTSxRQUFRO0FBQ3ZCLFVBQU0sS0FBSyxTQUFTLE1BQU0sUUFBUTtBQUNsQyxhQUFTLE1BQU0sUUFBUTtBQUN2QixVQUFNLEtBQUssU0FBUyxNQUFNLFFBQVE7QUFFbEMsVUFBTSxTQUFTLE1BQU0sT0FBTywwQ0FBMEM7QUFFdEUsV0FBTyxnQkFB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
