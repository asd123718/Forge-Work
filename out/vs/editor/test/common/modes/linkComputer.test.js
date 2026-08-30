import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { computeLinks } from "../../../common/languages/linkComputer.js";
class SimpleLinkComputerTarget {
  constructor(_lines) {
    this._lines = _lines;
  }
  getLineCount() {
    return this._lines.length;
  }
  getLineContent(lineNumber) {
    return this._lines[lineNumber - 1];
  }
}
function myComputeLinks(lines) {
  const target = new SimpleLinkComputerTarget(lines);
  return computeLinks(target);
}
function assertLink(text, extractedLink) {
  let startColumn = 0, endColumn = 0, chr, i = 0;
  for (i = 0; i < extractedLink.length; i++) {
    chr = extractedLink.charAt(i);
    if (chr !== " " && chr !== "	") {
      startColumn = i + 1;
      break;
    }
  }
  for (i = extractedLink.length - 1; i >= 0; i--) {
    chr = extractedLink.charAt(i);
    if (chr !== " " && chr !== "	") {
      endColumn = i + 2;
      break;
    }
  }
  const r = myComputeLinks([text]);
  assert.deepStrictEqual(r, [{
    range: {
      startLineNumber: 1,
      startColumn,
      endLineNumber: 1,
      endColumn
    },
    url: extractedLink.substring(startColumn - 1, endColumn - 1)
  }]);
}
suite("Editor Modes - Link Computer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Null model", () => {
    const r = computeLinks(null);
    assert.deepStrictEqual(r, []);
  });
  test("Parsing", () => {
    assertLink(
      'x = "http://foo.bar";',
      "     http://foo.bar  "
    );
    assertLink(
      "x = (http://foo.bar);",
      "     http://foo.bar  "
    );
    assertLink(
      "x = [http://foo.bar];",
      "     http://foo.bar  "
    );
    assertLink(
      "x = 'http://foo.bar';",
      "     http://foo.bar  "
    );
    assertLink(
      "x =  http://foo.bar ;",
      "     http://foo.bar  "
    );
    assertLink(
      "x = <http://foo.bar>;",
      "     http://foo.bar  "
    );
    assertLink(
      "x = {http://foo.bar};",
      "     http://foo.bar  "
    );
    assertLink(
      "(see http://foo.bar)",
      "     http://foo.bar  "
    );
    assertLink(
      "[see http://foo.bar]",
      "     http://foo.bar  "
    );
    assertLink(
      "{see http://foo.bar}",
      "     http://foo.bar  "
    );
    assertLink(
      "<see http://foo.bar>",
      "     http://foo.bar  "
    );
    assertLink(
      "<url>http://mylink.com</url>",
      "     http://mylink.com      "
    );
    assertLink(
      "// Click here to learn more. https://go.microsoft.com/fwlink/?LinkID=513275&clcid=0x409",
      "                             https://go.microsoft.com/fwlink/?LinkID=513275&clcid=0x409"
    );
    assertLink(
      "// Click here to learn more. https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx",
      "                             https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx"
    );
    assertLink(
      "// https://github.com/projectkudu/kudu/blob/master/Kudu.Core/Scripts/selectNodeVersion.js",
      "   https://github.com/projectkudu/kudu/blob/master/Kudu.Core/Scripts/selectNodeVersion.js"
    );
    assertLink(
      "<!-- !!! Do not remove !!!   WebContentRef(link:https://go.microsoft.com/fwlink/?LinkId=166007, area:Admin, updated:2015, nextUpdate:2016, tags:SqlServer)   !!! Do not remove !!! -->",
      "                                                https://go.microsoft.com/fwlink/?LinkId=166007                                                                                        "
    );
    assertLink(
      "For instructions, see https://go.microsoft.com/fwlink/?LinkId=166007.</value>",
      "                      https://go.microsoft.com/fwlink/?LinkId=166007         "
    );
    assertLink(
      "For instructions, see https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx.</value>",
      "                      https://msdn.microsoft.com/en-us/library/windows/desktop/aa365247(v=vs.85).aspx         "
    );
    assertLink(
      'x = "https://en.wikipedia.org/wiki/Z\xFCrich";',
      "     https://en.wikipedia.org/wiki/Z\xFCrich  "
    );
    assertLink(
      "\u8ACB\u53C3\u95B1 http://go.microsoft.com/fwlink/?LinkId=761051\u3002",
      "    http://go.microsoft.com/fwlink/?LinkId=761051 "
    );
    assertLink(
      "\uFF08\u8ACB\u53C3\u95B1 http://go.microsoft.com/fwlink/?LinkId=761051\uFF09",
      "     http://go.microsoft.com/fwlink/?LinkId=761051 "
    );
    assertLink(
      'x = "file:///foo.bar";',
      "     file:///foo.bar  "
    );
    assertLink(
      'x = "file://c:/foo.bar";',
      "     file://c:/foo.bar  "
    );
    assertLink(
      'x = "file://shares/foo.bar";',
      "     file://shares/foo.bar  "
    );
    assertLink(
      'x = "file://sh\xE4res/foo.bar";',
      "     file://sh\xE4res/foo.bar  "
    );
    assertLink(
      "Some text, then http://www.bing.com.",
      "                http://www.bing.com "
    );
    assertLink(
      "let url = `http://***/_api/web/lists/GetByTitle('Teambuildingaanvragen')/items`;",
      "           http://***/_api/web/lists/GetByTitle('Teambuildingaanvragen')/items  "
    );
  });
  test("issue #7855", () => {
    assertLink(
      "7. At this point, ServiceMain has been called.  There is no functionality presently in ServiceMain, but you can consult the [MSDN documentation](https://msdn.microsoft.com/en-us/library/windows/desktop/ms687414(v=vs.85).aspx) to add functionality as desired!",
      "                                                                                                                                                 https://msdn.microsoft.com/en-us/library/windows/desktop/ms687414(v=vs.85).aspx                                  "
    );
  });
  test('issue #62278: "Ctrl + click to follow link" for IPv6 URLs', () => {
    assertLink(
      'let x = "http://[::1]:5000/connect/token"',
      "         http://[::1]:5000/connect/token  "
    );
  });
  test("issue #70254: bold links dont open in markdown file using editor mode with ctrl + click", () => {
    assertLink(
      "2. Navigate to **https://portal.azure.com**",
      "                 https://portal.azure.com  "
    );
  });
  test("issue #86358: URL wrong recognition pattern", () => {
    assertLink(
      "POST|https://portal.azure.com|2019-12-05|",
      "     https://portal.azure.com            "
    );
  });
  test("issue #67022: Space as end of hyperlink isn't always good idea", () => {
    assertLink(
      "aa  https://foo.bar/[this is foo site]  aa",
      "    https://foo.bar/[this is foo site]    "
    );
  });
  test("issue #100353: Link detection stops at \uFF06(double-byte)", () => {
    assertLink(
      "aa  http://tree-mark.chips.jp/\u30EC\u30FC\u30BA\u30F3\uFF06\u30D9\u30EA\u30FC\u30DF\u30C3\u30AF\u30B9  aa",
      "    http://tree-mark.chips.jp/\u30EC\u30FC\u30BA\u30F3\uFF06\u30D9\u30EA\u30FC\u30DF\u30C3\u30AF\u30B9    "
    );
  });
  test("issue #121438: Link detection stops at\u3010...\u3011", () => {
    assertLink(
      "aa  https://zh.wikipedia.org/wiki/\u3010\u6211\u63A8\u7684\u5B69\u5B50\u3011 aa",
      "    https://zh.wikipedia.org/wiki/\u3010\u6211\u63A8\u7684\u5B69\u5B50\u3011   "
    );
  });
  test("issue #121438: Link detection stops at\u300A...\u300B", () => {
    assertLink(
      "aa  https://zh.wikipedia.org/wiki/\u300A\u65B0\u9752\u5E74\u300B\u7F16\u8F91\u90E8\u65E7\u5740 aa",
      "    https://zh.wikipedia.org/wiki/\u300A\u65B0\u9752\u5E74\u300B\u7F16\u8F91\u90E8\u65E7\u5740   "
    );
  });
  test("issue #121438: Link detection stops at \u201C...\u201D", () => {
    assertLink(
      "aa  https://zh.wikipedia.org/wiki/\u201C\u5E38\u51EF\u7533\u201D\u8BEF\u8BD1\u4E8B\u4EF6 aa",
      "    https://zh.wikipedia.org/wiki/\u201C\u5E38\u51EF\u7533\u201D\u8BEF\u8BD1\u4E8B\u4EF6   "
    );
  });
  test("issue #150905: Colon after bare hyperlink is treated as its part", () => {
    assertLink(
      "https://site.web/page.html: blah blah blah",
      "https://site.web/page.html                "
    );
  });
  test("issue #156875: Links include quotes ", () => {
    assertLink(
      `"This file has been converted from https://github.com/jeff-hykin/better-c-syntax/blob/master/autogenerated/c.tmLanguage.json",`,
      `                                   https://github.com/jeff-hykin/better-c-syntax/blob/master/autogenerated/c.tmLanguage.json  `
    );
  });
  test("issue #225513: Cmd-Click doesn't work on JSDoc {@link URL|LinkText} format ", () => {
    assertLink(
      ` * {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers|Promise.withResolvers}`,
      `          https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers                       `
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZXNcXGxpbmtDb21wdXRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUxpbmsgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElMaW5rQ29tcHV0ZXJUYXJnZXQsIGNvbXB1dGVMaW5rcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGlua0NvbXB1dGVyLmpzJztcblxuY2xhc3MgU2ltcGxlTGlua0NvbXB1dGVyVGFyZ2V0IGltcGxlbWVudHMgSUxpbmtDb21wdXRlclRhcmdldCB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBfbGluZXM6IHN0cmluZ1tdKSB7XG5cdFx0Ly8gSW50ZW50aW9uYWwgRW1wdHlcblx0fVxuXG5cdHB1YmxpYyBnZXRMaW5lQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZXMubGVuZ3RoO1xuXHR9XG5cblx0cHVibGljIGdldExpbmVDb250ZW50KGxpbmVOdW1iZXI6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzW2xpbmVOdW1iZXIgLSAxXTtcblx0fVxufVxuXG5mdW5jdGlvbiBteUNvbXB1dGVMaW5rcyhsaW5lczogc3RyaW5nW10pOiBJTGlua1tdIHtcblx0Y29uc3QgdGFyZ2V0ID0gbmV3IFNpbXBsZUxpbmtDb21wdXRlclRhcmdldChsaW5lcyk7XG5cdHJldHVybiBjb21wdXRlTGlua3ModGFyZ2V0KTtcbn1cblxuZnVuY3Rpb24gYXNzZXJ0TGluayh0ZXh0OiBzdHJpbmcsIGV4dHJhY3RlZExpbms6IHN0cmluZyk6IHZvaWQge1xuXHRsZXQgc3RhcnRDb2x1bW4gPSAwLFxuXHRcdGVuZENvbHVtbiA9IDAsXG5cdFx0Y2hyOiBzdHJpbmcsXG5cdFx0aSA9IDA7XG5cblx0Zm9yIChpID0gMDsgaSA8IGV4dHJhY3RlZExpbmsubGVuZ3RoOyBpKyspIHtcblx0XHRjaHIgPSBleHRyYWN0ZWRMaW5rLmNoYXJBdChpKTtcblx0XHRpZiAoY2hyICE9PSAnICcgJiYgY2hyICE9PSAnXFx0Jykge1xuXHRcdFx0c3RhcnRDb2x1bW4gPSBpICsgMTtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdGZvciAoaSA9IGV4dHJhY3RlZExpbmsubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRjaHIgPSBleHRyYWN0ZWRMaW5rLmNoYXJBdChpKTtcblx0XHRpZiAoY2hyICE9PSAnICcgJiYgY2hyICE9PSAnXFx0Jykge1xuXHRcdFx0ZW5kQ29sdW1uID0gaSArIDI7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRjb25zdCByID0gbXlDb21wdXRlTGlua3MoW3RleHRdKTtcblx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyLCBbe1xuXHRcdHJhbmdlOiB7XG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDEsXG5cdFx0XHRzdGFydENvbHVtbjogc3RhcnRDb2x1bW4sXG5cdFx0XHRlbmRMaW5lTnVtYmVyOiAxLFxuXHRcdFx0ZW5kQ29sdW1uOiBlbmRDb2x1bW5cblx0XHR9LFxuXHRcdHVybDogZXh0cmFjdGVkTGluay5zdWJzdHJpbmcoc3RhcnRDb2x1bW4gLSAxLCBlbmRDb2x1bW4gLSAxKVxuXHR9XSk7XG59XG5cbnN1aXRlKCdFZGl0b3IgTW9kZXMgLSBMaW5rIENvbXB1dGVyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ051bGwgbW9kZWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgciA9IGNvbXB1dGVMaW5rcyhudWxsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHIsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnUGFyc2luZycsICgpID0+IHtcblxuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQneCA9IFwiaHR0cDovL2Zvby5iYXJcIjsnLFxuXHRcdFx0JyAgICAgaHR0cDovL2Zvby5iYXIgICdcblx0XHQpO1xuXG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCd4ID0gKGh0dHA6Ly9mb28uYmFyKTsnLFxuXHRcdFx0JyAgICAgaHR0cDovL2Zvby5iYXIgICdcblx0XHQpO1xuXG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCd4ID0gW2h0dHA6Ly9mb28uYmFyXTsnLFxuXHRcdFx0JyAgICAgaHR0cDovL2Zvby5iYXIgICdcblx0XHQpO1xuXG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCd4ID0gXFwnaHR0cDovL2Zvby5iYXJcXCc7Jyxcblx0XHRcdCcgICAgIGh0dHA6Ly9mb28uYmFyICAnXG5cdFx0KTtcblxuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQneCA9ICBodHRwOi8vZm9vLmJhciA7Jyxcblx0XHRcdCcgICAgIGh0dHA6Ly9mb28uYmFyICAnXG5cdFx0KTtcblxuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQneCA9IDxodHRwOi8vZm9vLmJhcj47Jyxcblx0XHRcdCcgICAgIGh0dHA6Ly9mb28uYmFyICAnXG5cdFx0KTtcblxuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQneCA9IHtodHRwOi8vZm9vLmJhcn07Jyxcblx0XHRcdCcgICAgIGh0dHA6Ly9mb28uYmFyICAnXG5cdFx0KTtcblxuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQnKHNlZSBodHRwOi8vZm9vLmJhciknLFxuXHRcdFx0JyAgICAgaHR0cDovL2Zvby5iYXIgICdcblx0XHQpO1xuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQnW3NlZSBodHRwOi8vZm9vLmJhcl0nLFxuXHRcdFx0JyAgICAgaHR0cDovL2Zvby5iYXIgICdcblx0XHQpO1xuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQne3NlZSBodHRwOi8vZm9vLmJhcn0nLFxuXHRcdFx0JyAgICAgaHR0cDovL2Zvby5iYXIgICdcblx0XHQpO1xuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQnPHNlZSBodHRwOi8vZm9vLmJhcj4nLFxuXHRcdFx0JyAgICAgaHR0cDovL2Zvby5iYXIgICdcblx0XHQpO1xuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQnPHVybD5odHRwOi8vbXlsaW5rLmNvbTwvdXJsPicsXG5cdFx0XHQnICAgICBodHRwOi8vbXlsaW5rLmNvbSAgICAgICdcblx0XHQpO1xuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQnLy8gQ2xpY2sgaGVyZSB0byBsZWFybiBtb3JlLiBodHRwczovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9MaW5rSUQ9NTEzMjc1JmNsY2lkPTB4NDA5Jyxcblx0XHRcdCcgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGh0dHBzOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP0xpbmtJRD01MTMyNzUmY2xjaWQ9MHg0MDknXG5cdFx0KTtcblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0Jy8vIENsaWNrIGhlcmUgdG8gbGVhcm4gbW9yZS4gaHR0cHM6Ly9tc2RuLm1pY3Jvc29mdC5jb20vZW4tdXMvbGlicmFyeS93aW5kb3dzL2Rlc2t0b3AvYWEzNjUyNDcodj12cy44NSkuYXNweCcsXG5cdFx0XHQnICAgICAgICAgICAgICAgICAgICAgICAgICAgICBodHRwczovL21zZG4ubWljcm9zb2Z0LmNvbS9lbi11cy9saWJyYXJ5L3dpbmRvd3MvZGVza3RvcC9hYTM2NTI0Nyh2PXZzLjg1KS5hc3B4J1xuXHRcdCk7XG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCcvLyBodHRwczovL2dpdGh1Yi5jb20vcHJvamVjdGt1ZHUva3VkdS9ibG9iL21hc3Rlci9LdWR1LkNvcmUvU2NyaXB0cy9zZWxlY3ROb2RlVmVyc2lvbi5qcycsXG5cdFx0XHQnICAgaHR0cHM6Ly9naXRodWIuY29tL3Byb2plY3RrdWR1L2t1ZHUvYmxvYi9tYXN0ZXIvS3VkdS5Db3JlL1NjcmlwdHMvc2VsZWN0Tm9kZVZlcnNpb24uanMnXG5cdFx0KTtcblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0JzwhLS0gISEhIERvIG5vdCByZW1vdmUgISEhICAgV2ViQ29udGVudFJlZihsaW5rOmh0dHBzOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP0xpbmtJZD0xNjYwMDcsIGFyZWE6QWRtaW4sIHVwZGF0ZWQ6MjAxNSwgbmV4dFVwZGF0ZToyMDE2LCB0YWdzOlNxbFNlcnZlcikgICAhISEgRG8gbm90IHJlbW92ZSAhISEgLS0+Jyxcblx0XHRcdCcgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBodHRwczovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9MaW5rSWQ9MTY2MDA3ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdcblx0XHQpO1xuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQnRm9yIGluc3RydWN0aW9ucywgc2VlIGh0dHBzOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP0xpbmtJZD0xNjYwMDcuPC92YWx1ZT4nLFxuXHRcdFx0JyAgICAgICAgICAgICAgICAgICAgICBodHRwczovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9MaW5rSWQ9MTY2MDA3ICAgICAgICAgJ1xuXHRcdCk7XG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCdGb3IgaW5zdHJ1Y3Rpb25zLCBzZWUgaHR0cHM6Ly9tc2RuLm1pY3Jvc29mdC5jb20vZW4tdXMvbGlicmFyeS93aW5kb3dzL2Rlc2t0b3AvYWEzNjUyNDcodj12cy44NSkuYXNweC48L3ZhbHVlPicsXG5cdFx0XHQnICAgICAgICAgICAgICAgICAgICAgIGh0dHBzOi8vbXNkbi5taWNyb3NvZnQuY29tL2VuLXVzL2xpYnJhcnkvd2luZG93cy9kZXNrdG9wL2FhMzY1MjQ3KHY9dnMuODUpLmFzcHggICAgICAgICAnXG5cdFx0KTtcblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0J3ggPSBcImh0dHBzOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL1pcdTAwRkNyaWNoXCI7Jyxcblx0XHRcdCcgICAgIGh0dHBzOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL1pcdTAwRkNyaWNoICAnXG5cdFx0KTtcblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0J1x1OEFDQlx1NTNDM1x1OTVCMSBodHRwOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP0xpbmtJZD03NjEwNTFcdTMwMDInLFxuXHRcdFx0JyAgICBodHRwOi8vZ28ubWljcm9zb2Z0LmNvbS9md2xpbmsvP0xpbmtJZD03NjEwNTEgJ1xuXHRcdCk7XG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCdcdUZGMDhcdThBQ0JcdTUzQzNcdTk1QjEgaHR0cDovL2dvLm1pY3Jvc29mdC5jb20vZndsaW5rLz9MaW5rSWQ9NzYxMDUxXHVGRjA5Jyxcblx0XHRcdCcgICAgIGh0dHA6Ly9nby5taWNyb3NvZnQuY29tL2Z3bGluay8/TGlua0lkPTc2MTA1MSAnXG5cdFx0KTtcblxuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQneCA9IFwiZmlsZTovLy9mb28uYmFyXCI7Jyxcblx0XHRcdCcgICAgIGZpbGU6Ly8vZm9vLmJhciAgJ1xuXHRcdCk7XG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCd4ID0gXCJmaWxlOi8vYzovZm9vLmJhclwiOycsXG5cdFx0XHQnICAgICBmaWxlOi8vYzovZm9vLmJhciAgJ1xuXHRcdCk7XG5cblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0J3ggPSBcImZpbGU6Ly9zaGFyZXMvZm9vLmJhclwiOycsXG5cdFx0XHQnICAgICBmaWxlOi8vc2hhcmVzL2Zvby5iYXIgICdcblx0XHQpO1xuXG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCd4ID0gXCJmaWxlOi8vc2hcdTAwRTRyZXMvZm9vLmJhclwiOycsXG5cdFx0XHQnICAgICBmaWxlOi8vc2hcdTAwRTRyZXMvZm9vLmJhciAgJ1xuXHRcdCk7XG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCdTb21lIHRleHQsIHRoZW4gaHR0cDovL3d3dy5iaW5nLmNvbS4nLFxuXHRcdFx0JyAgICAgICAgICAgICAgICBodHRwOi8vd3d3LmJpbmcuY29tICdcblx0XHQpO1xuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQnbGV0IHVybCA9IGBodHRwOi8vKioqL19hcGkvd2ViL2xpc3RzL0dldEJ5VGl0bGUoXFwnVGVhbWJ1aWxkaW5nYWFudnJhZ2VuXFwnKS9pdGVtc2A7Jyxcblx0XHRcdCcgICAgICAgICAgIGh0dHA6Ly8qKiovX2FwaS93ZWIvbGlzdHMvR2V0QnlUaXRsZShcXCdUZWFtYnVpbGRpbmdhYW52cmFnZW5cXCcpL2l0ZW1zICAnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzc4NTUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCc3LiBBdCB0aGlzIHBvaW50LCBTZXJ2aWNlTWFpbiBoYXMgYmVlbiBjYWxsZWQuICBUaGVyZSBpcyBubyBmdW5jdGlvbmFsaXR5IHByZXNlbnRseSBpbiBTZXJ2aWNlTWFpbiwgYnV0IHlvdSBjYW4gY29uc3VsdCB0aGUgW01TRE4gZG9jdW1lbnRhdGlvbl0oaHR0cHM6Ly9tc2RuLm1pY3Jvc29mdC5jb20vZW4tdXMvbGlicmFyeS93aW5kb3dzL2Rlc2t0b3AvbXM2ODc0MTQodj12cy44NSkuYXNweCkgdG8gYWRkIGZ1bmN0aW9uYWxpdHkgYXMgZGVzaXJlZCEnLFxuXHRcdFx0JyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBodHRwczovL21zZG4ubWljcm9zb2Z0LmNvbS9lbi11cy9saWJyYXJ5L3dpbmRvd3MvZGVza3RvcC9tczY4NzQxNCh2PXZzLjg1KS5hc3B4ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNjIyNzg6IFwiQ3RybCArIGNsaWNrIHRvIGZvbGxvdyBsaW5rXCIgZm9yIElQdjYgVVJMcycsICgpID0+IHtcblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0J2xldCB4ID0gXCJodHRwOi8vWzo6MV06NTAwMC9jb25uZWN0L3Rva2VuXCInLFxuXHRcdFx0JyAgICAgICAgIGh0dHA6Ly9bOjoxXTo1MDAwL2Nvbm5lY3QvdG9rZW4gICdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNzAyNTQ6IGJvbGQgbGlua3MgZG9udCBvcGVuIGluIG1hcmtkb3duIGZpbGUgdXNpbmcgZWRpdG9yIG1vZGUgd2l0aCBjdHJsICsgY2xpY2snLCAoKSA9PiB7XG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCcyLiBOYXZpZ2F0ZSB0byAqKmh0dHBzOi8vcG9ydGFsLmF6dXJlLmNvbSoqJyxcblx0XHRcdCcgICAgICAgICAgICAgICAgIGh0dHBzOi8vcG9ydGFsLmF6dXJlLmNvbSAgJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM4NjM1ODogVVJMIHdyb25nIHJlY29nbml0aW9uIHBhdHRlcm4nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCdQT1NUfGh0dHBzOi8vcG9ydGFsLmF6dXJlLmNvbXwyMDE5LTEyLTA1fCcsXG5cdFx0XHQnICAgICBodHRwczovL3BvcnRhbC5henVyZS5jb20gICAgICAgICAgICAnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzY3MDIyOiBTcGFjZSBhcyBlbmQgb2YgaHlwZXJsaW5rIGlzblxcJ3QgYWx3YXlzIGdvb2QgaWRlYScsICgpID0+IHtcblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0J2FhICBodHRwczovL2Zvby5iYXIvW3RoaXMgaXMgZm9vIHNpdGVdICBhYScsXG5cdFx0XHQnICAgIGh0dHBzOi8vZm9vLmJhci9bdGhpcyBpcyBmb28gc2l0ZV0gICAgJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMDAzNTM6IExpbmsgZGV0ZWN0aW9uIHN0b3BzIGF0IFx1RkYwNihkb3VibGUtYnl0ZSknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCdhYSAgaHR0cDovL3RyZWUtbWFyay5jaGlwcy5qcC9cdTMwRUNcdTMwRkNcdTMwQkFcdTMwRjNcdUZGMDZcdTMwRDlcdTMwRUFcdTMwRkNcdTMwREZcdTMwQzNcdTMwQUZcdTMwQjkgIGFhJyxcblx0XHRcdCcgICAgaHR0cDovL3RyZWUtbWFyay5jaGlwcy5qcC9cdTMwRUNcdTMwRkNcdTMwQkFcdTMwRjNcdUZGMDZcdTMwRDlcdTMwRUFcdTMwRkNcdTMwREZcdTMwQzNcdTMwQUZcdTMwQjkgICAgJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMjE0Mzg6IExpbmsgZGV0ZWN0aW9uIHN0b3BzIGF0XHUzMDEwLi4uXHUzMDExJywgKCkgPT4ge1xuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQnYWEgIGh0dHBzOi8vemgud2lraXBlZGlhLm9yZy93aWtpL1x1MzAxMFx1NjIxMVx1NjNBOFx1NzY4NFx1NUI2OVx1NUI1MFx1MzAxMSBhYScsXG5cdFx0XHQnICAgIGh0dHBzOi8vemgud2lraXBlZGlhLm9yZy93aWtpL1x1MzAxMFx1NjIxMVx1NjNBOFx1NzY4NFx1NUI2OVx1NUI1MFx1MzAxMSAgICdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTIxNDM4OiBMaW5rIGRldGVjdGlvbiBzdG9wcyBhdFx1MzAwQS4uLlx1MzAwQicsICgpID0+IHtcblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0J2FhICBodHRwczovL3poLndpa2lwZWRpYS5vcmcvd2lraS9cdTMwMEFcdTY1QjBcdTk3NTJcdTVFNzRcdTMwMEJcdTdGMTZcdThGOTFcdTkwRThcdTY1RTdcdTU3NDAgYWEnLFxuXHRcdFx0JyAgICBodHRwczovL3poLndpa2lwZWRpYS5vcmcvd2lraS9cdTMwMEFcdTY1QjBcdTk3NTJcdTVFNzRcdTMwMEJcdTdGMTZcdThGOTFcdTkwRThcdTY1RTdcdTU3NDAgICAnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEyMTQzODogTGluayBkZXRlY3Rpb24gc3RvcHMgYXQgXHUyMDFDLi4uXHUyMDFEJywgKCkgPT4ge1xuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQnYWEgIGh0dHBzOi8vemgud2lraXBlZGlhLm9yZy93aWtpL1x1MjAxQ1x1NUUzOFx1NTFFRlx1NzUzM1x1MjAxRFx1OEJFRlx1OEJEMVx1NEU4Qlx1NEVGNiBhYScsXG5cdFx0XHQnICAgIGh0dHBzOi8vemgud2lraXBlZGlhLm9yZy93aWtpL1x1MjAxQ1x1NUUzOFx1NTFFRlx1NzUzM1x1MjAxRFx1OEJFRlx1OEJEMVx1NEU4Qlx1NEVGNiAgICdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTUwOTA1OiBDb2xvbiBhZnRlciBiYXJlIGh5cGVybGluayBpcyB0cmVhdGVkIGFzIGl0cyBwYXJ0JywgKCkgPT4ge1xuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQnaHR0cHM6Ly9zaXRlLndlYi9wYWdlLmh0bWw6IGJsYWggYmxhaCBibGFoJyxcblx0XHRcdCdodHRwczovL3NpdGUud2ViL3BhZ2UuaHRtbCAgICAgICAgICAgICAgICAnXG5cdFx0KTtcblx0fSk7XG5cblx0Ly8gUmVtb3ZlZCBiZWNhdXNlIG9mICMxNTY4NzVcblx0Ly8gdGVzdCgnaXNzdWUgIzE1MTYzMTogTGluayBwYXJzaW5nIHN0b3BlZCB3aGVyZSBjb21tZW50cyBpbmNsdWRlIGEgc2luZ2xlIHF1b3RlICcsICgpID0+IHtcblx0Ly8gXHRhc3NlcnRMaW5rKFxuXHQvLyBcdFx0YGFhIGh0dHBzOi8vcmVnZXhwZXIuY29tLyMlMkYnJyUyRiBhYWAsXG5cdC8vIFx0XHRgICAgaHR0cHM6Ly9yZWdleHBlci5jb20vIyUyRicnJTJGICAgYCxcblx0Ly8gXHQpO1xuXHQvLyB9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTU2ODc1OiBMaW5rcyBpbmNsdWRlIHF1b3RlcyAnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdGBcIlRoaXMgZmlsZSBoYXMgYmVlbiBjb252ZXJ0ZWQgZnJvbSBodHRwczovL2dpdGh1Yi5jb20vamVmZi1oeWtpbi9iZXR0ZXItYy1zeW50YXgvYmxvYi9tYXN0ZXIvYXV0b2dlbmVyYXRlZC9jLnRtTGFuZ3VhZ2UuanNvblwiLGAsXG5cdFx0XHRgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBodHRwczovL2dpdGh1Yi5jb20vamVmZi1oeWtpbi9iZXR0ZXItYy1zeW50YXgvYmxvYi9tYXN0ZXIvYXV0b2dlbmVyYXRlZC9jLnRtTGFuZ3VhZ2UuanNvbiAgYCxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjI1NTEzOiBDbWQtQ2xpY2sgZG9lc25cXCd0IHdvcmsgb24gSlNEb2Mge0BsaW5rIFVSTHxMaW5rVGV4dH0gZm9ybWF0ICcsICgpID0+IHtcblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0YCAqIHtAbGluayBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9Qcm9taXNlL3dpdGhSZXNvbHZlcnN8UHJvbWlzZS53aXRoUmVzb2x2ZXJzfWAsXG5cdFx0XHRgICAgICAgICAgIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL1Byb21pc2Uvd2l0aFJlc29sdmVycyAgICAgICAgICAgICAgICAgICAgICAgYCxcblx0XHQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBRXhELFNBQThCLG9CQUFvQjtBQUVsRCxNQUFNLHlCQUF3RDtBQUFBLEVBRTdELFlBQW9CLFFBQWtCO0FBQWxCO0FBQUEsRUFFcEI7QUFBQSxFQUVPLGVBQXVCO0FBQzdCLFdBQU8sS0FBSyxPQUFPO0FBQUEsRUFDcEI7QUFBQSxFQUVPLGVBQWUsWUFBNEI7QUFDakQsV0FBTyxLQUFLLE9BQU8sYUFBYSxDQUFDO0FBQUEsRUFDbEM7QUFDRDtBQUVBLFNBQVMsZUFBZSxPQUEwQjtBQUNqRCxRQUFNLFNBQVMsSUFBSSx5QkFBeUIsS0FBSztBQUNqRCxTQUFPLGFBQWEsTUFBTTtBQUMzQjtBQUVBLFNBQVMsV0FBVyxNQUFjLGVBQTZCO0FBQzlELE1BQUksY0FBYyxHQUNqQixZQUFZLEdBQ1osS0FDQSxJQUFJO0FBRUwsT0FBSyxJQUFJLEdBQUcsSUFBSSxjQUFjLFFBQVEsS0FBSztBQUMxQyxVQUFNLGNBQWMsT0FBTyxDQUFDO0FBQzVCLFFBQUksUUFBUSxPQUFPLFFBQVEsS0FBTTtBQUNoQyxvQkFBYyxJQUFJO0FBQ2xCO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFFQSxPQUFLLElBQUksY0FBYyxTQUFTLEdBQUcsS0FB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
