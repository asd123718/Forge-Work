import assert from "assert";
import { MarkdownString } from "../../common/htmlContent.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
import { URI } from "../../common/uri.js";
suite("MarkdownString", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Escape leading whitespace", function() {
    const mds = new MarkdownString();
    mds.appendText("Hello\n    Not a code block");
    assert.strictEqual(mds.value, "Hello\n\n&nbsp;&nbsp;&nbsp;&nbsp;Not&nbsp;a&nbsp;code&nbsp;block");
  });
  test("MarkdownString.appendText doesn't escape quote #109040", function() {
    const mds = new MarkdownString();
    mds.appendText("> Text\n>More");
    assert.strictEqual(mds.value, "\\>&nbsp;Text\n\n\\>More");
  });
  test("appendText", () => {
    const mds = new MarkdownString();
    mds.appendText("# foo\n*bar*");
    assert.strictEqual(mds.value, "\\#&nbsp;foo\n\n\\*bar\\*");
  });
  test("appendLink", function() {
    function assertLink(target, label, title, expected) {
      const mds = new MarkdownString();
      mds.appendLink(target, label, title);
      assert.strictEqual(mds.value, expected);
    }
    assertLink(
      "https://example.com\\()![](file:///Users/jrieken/Code/_samples/devfest/foo/img.png)",
      "hello",
      void 0,
      "[hello](https://example.com\\(\\)![](file:///Users/jrieken/Code/_samples/devfest/foo/img.png\\))"
    );
    assertLink(
      "https://example.com",
      "hello",
      "title",
      '[hello](https://example.com "title")'
    );
    assertLink(
      "foo)",
      "hello]",
      void 0,
      "[hello\\]](foo\\))"
    );
    assertLink(
      "foo\\)",
      "hello]",
      void 0,
      "[hello\\]](foo\\))"
    );
    assertLink(
      "fo)o",
      "hell]o",
      void 0,
      "[hell\\]o](fo\\)o)"
    );
    assertLink(
      "foo)",
      "hello]",
      'title"',
      '[hello\\]](foo\\) "title\\"")'
    );
  });
  test("lift", () => {
    const dto = {
      value: "hello",
      baseUri: URI.file("/foo/bar"),
      supportThemeIcons: true,
      isTrusted: true,
      supportHtml: true,
      uris: {
        [URI.file("/foo/bar2").toString()]: URI.file("/foo/bar2"),
        [URI.file("/foo/bar3").toString()]: URI.file("/foo/bar3")
      }
    };
    const mds = MarkdownString.lift(dto);
    assert.strictEqual(mds.value, dto.value);
    assert.strictEqual(mds.baseUri?.toString(), dto.baseUri?.toString());
    assert.strictEqual(mds.supportThemeIcons, dto.supportThemeIcons);
    assert.strictEqual(mds.isTrusted, dto.isTrusted);
    assert.strictEqual(mds.supportHtml, dto.supportHtml);
    assert.deepStrictEqual(mds.uris, dto.uris);
  });
  test("lift returns new instance", () => {
    const instance = new MarkdownString("hello");
    const mds2 = MarkdownString.lift(instance).appendText("world");
    assert.strictEqual(mds2.value, "helloworld");
    assert.strictEqual(instance.value, "hello");
  });
  suite("appendCodeBlock", () => {
    function assertCodeBlock(lang, code, result) {
      const mds = new MarkdownString();
      mds.appendCodeblock(lang, code);
      assert.strictEqual(mds.value, result);
    }
    test("common cases", () => {
      assertCodeBlock("ts", "const a = 1;", `
${[
        "```ts",
        "const a = 1;",
        "```"
      ].join("\n")}
`);
      assertCodeBlock("ts", "const a = `1`;", `
${[
        "```ts",
        "const a = `1`;",
        "```"
      ].join("\n")}
`);
    });
    test("escape fence", () => {
      assertCodeBlock("md", "```\n```", `
${[
        "````md",
        "```\n```",
        "````"
      ].join("\n")}
`);
      assertCodeBlock("md", "\n\n```\n```", `
${[
        "````md",
        "\n\n```\n```",
        "````"
      ].join("\n")}
`);
      assertCodeBlock("md", "```\n```\n````\n````", `
${[
        "`````md",
        "```\n```\n````\n````",
        "`````"
      ].join("\n")}
`);
    });
  });
  suite("ThemeIcons", () => {
    suite("Support On", () => {
      test("appendText", () => {
        const mds = new MarkdownString(void 0, { supportThemeIcons: true });
        mds.appendText("$(zap) $(not a theme icon) $(add)");
        assert.strictEqual(mds.value, "\\\\$\\(zap\\)&nbsp;$\\(not&nbsp;a&nbsp;theme&nbsp;icon\\)&nbsp;\\\\$\\(add\\)");
      });
      test("appendMarkdown", () => {
        const mds = new MarkdownString(void 0, { supportThemeIcons: true });
        mds.appendMarkdown("$(zap) $(not a theme icon) $(add)");
        assert.strictEqual(mds.value, "$(zap) $(not a theme icon) $(add)");
      });
      test("appendMarkdown with escaped icon", () => {
        const mds = new MarkdownString(void 0, { supportThemeIcons: true });
        mds.appendMarkdown("\\$(zap) $(not a theme icon) $(add)");
        assert.strictEqual(mds.value, "\\$(zap) $(not a theme icon) $(add)");
      });
    });
    suite("Support Off", () => {
      test("appendText", () => {
        const mds = new MarkdownString(void 0, { supportThemeIcons: false });
        mds.appendText("$(zap) $(not a theme icon) $(add)");
        assert.strictEqual(mds.value, "$\\(zap\\)&nbsp;$\\(not&nbsp;a&nbsp;theme&nbsp;icon\\)&nbsp;$\\(add\\)");
      });
      test("appendMarkdown", () => {
        const mds = new MarkdownString(void 0, { supportThemeIcons: false });
        mds.appendMarkdown("$(zap) $(not a theme icon) $(add)");
        assert.strictEqual(mds.value, "$(zap) $(not a theme icon) $(add)");
      });
      test("appendMarkdown with escaped icon", () => {
        const mds = new MarkdownString(void 0, { supportThemeIcons: true });
        mds.appendMarkdown("\\$(zap) $(not a theme icon) $(add)");
        assert.strictEqual(mds.value, "\\$(zap) $(not a theme icon) $(add)");
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXG1hcmtkb3duU3RyaW5nLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4vdXRpbHMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VyaS5qcyc7XG5cbnN1aXRlKCdNYXJrZG93blN0cmluZycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdFc2NhcGUgbGVhZGluZyB3aGl0ZXNwYWNlJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG1kcyA9IG5ldyBNYXJrZG93blN0cmluZygpO1xuXHRcdG1kcy5hcHBlbmRUZXh0KCdIZWxsb1xcbiAgICBOb3QgYSBjb2RlIGJsb2NrJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1kcy52YWx1ZSwgJ0hlbGxvXFxuXFxuJm5ic3A7Jm5ic3A7Jm5ic3A7Jm5ic3A7Tm90Jm5ic3A7YSZuYnNwO2NvZGUmbmJzcDtibG9jaycpO1xuXHR9KTtcblxuXHR0ZXN0KCdNYXJrZG93blN0cmluZy5hcHBlbmRUZXh0IGRvZXNuXFwndCBlc2NhcGUgcXVvdGUgIzEwOTA0MCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtZHMgPSBuZXcgTWFya2Rvd25TdHJpbmcoKTtcblx0XHRtZHMuYXBwZW5kVGV4dCgnPiBUZXh0XFxuPk1vcmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWRzLnZhbHVlLCAnXFxcXD4mbmJzcDtUZXh0XFxuXFxuXFxcXD5Nb3JlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGVuZFRleHQnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBtZHMgPSBuZXcgTWFya2Rvd25TdHJpbmcoKTtcblx0XHRtZHMuYXBwZW5kVGV4dCgnIyBmb29cXG4qYmFyKicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1kcy52YWx1ZSwgJ1xcXFwjJm5ic3A7Zm9vXFxuXFxuXFxcXCpiYXJcXFxcKicpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBlbmRMaW5rJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0ZnVuY3Rpb24gYXNzZXJ0TGluayh0YXJnZXQ6IHN0cmluZywgbGFiZWw6IHN0cmluZywgdGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZCwgZXhwZWN0ZWQ6IHN0cmluZykge1xuXHRcdFx0Y29uc3QgbWRzID0gbmV3IE1hcmtkb3duU3RyaW5nKCk7XG5cdFx0XHRtZHMuYXBwZW5kTGluayh0YXJnZXQsIGxhYmVsLCB0aXRsZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWRzLnZhbHVlLCBleHBlY3RlZCk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCdodHRwczovL2V4YW1wbGUuY29tXFxcXCgpIVtdKGZpbGU6Ly8vVXNlcnMvanJpZWtlbi9Db2RlL19zYW1wbGVzL2RldmZlc3QvZm9vL2ltZy5wbmcpJywgJ2hlbGxvJywgdW5kZWZpbmVkLFxuXHRcdFx0J1toZWxsb10oaHR0cHM6Ly9leGFtcGxlLmNvbVxcXFwoXFxcXCkhW10oZmlsZTovLy9Vc2Vycy9qcmlla2VuL0NvZGUvX3NhbXBsZXMvZGV2ZmVzdC9mb28vaW1nLnBuZ1xcXFwpKSdcblx0XHQpO1xuXHRcdGFzc2VydExpbmsoXG5cdFx0XHQnaHR0cHM6Ly9leGFtcGxlLmNvbScsICdoZWxsbycsICd0aXRsZScsXG5cdFx0XHQnW2hlbGxvXShodHRwczovL2V4YW1wbGUuY29tIFwidGl0bGVcIiknXG5cdFx0KTtcblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0J2ZvbyknLCAnaGVsbG9dJywgdW5kZWZpbmVkLFxuXHRcdFx0J1toZWxsb1xcXFxdXShmb29cXFxcKSknXG5cdFx0KTtcblx0XHRhc3NlcnRMaW5rKFxuXHRcdFx0J2Zvb1xcXFwpJywgJ2hlbGxvXScsIHVuZGVmaW5lZCxcblx0XHRcdCdbaGVsbG9cXFxcXV0oZm9vXFxcXCkpJ1xuXHRcdCk7XG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCdmbylvJywgJ2hlbGxdbycsIHVuZGVmaW5lZCxcblx0XHRcdCdbaGVsbFxcXFxdb10oZm9cXFxcKW8pJ1xuXHRcdCk7XG5cdFx0YXNzZXJ0TGluayhcblx0XHRcdCdmb28pJywgJ2hlbGxvXScsICd0aXRsZVwiJyxcblx0XHRcdCdbaGVsbG9cXFxcXV0oZm9vXFxcXCkgXCJ0aXRsZVxcXFxcIlwiKSdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdsaWZ0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGR0bzogSU1hcmtkb3duU3RyaW5nID0ge1xuXHRcdFx0dmFsdWU6ICdoZWxsbycsXG5cdFx0XHRiYXNlVXJpOiBVUkkuZmlsZSgnL2Zvby9iYXInKSxcblx0XHRcdHN1cHBvcnRUaGVtZUljb25zOiB0cnVlLFxuXHRcdFx0aXNUcnVzdGVkOiB0cnVlLFxuXHRcdFx0c3VwcG9ydEh0bWw6IHRydWUsXG5cdFx0XHR1cmlzOiB7XG5cdFx0XHRcdFtVUkkuZmlsZSgnL2Zvby9iYXIyJykudG9TdHJpbmcoKV06IFVSSS5maWxlKCcvZm9vL2JhcjInKSxcblx0XHRcdFx0W1VSSS5maWxlKCcvZm9vL2JhcjMnKS50b1N0cmluZygpXTogVVJJLmZpbGUoJy9mb28vYmFyMycpXG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBtZHMgPSBNYXJrZG93blN0cmluZy5saWZ0KGR0byk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1kcy52YWx1ZSwgZHRvLnZhbHVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWRzLmJhc2VVcmk/LnRvU3RyaW5nKCksIGR0by5iYXNlVXJpPy50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWRzLnN1cHBvcnRUaGVtZUljb25zLCBkdG8uc3VwcG9ydFRoZW1lSWNvbnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZHMuaXNUcnVzdGVkLCBkdG8uaXNUcnVzdGVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWRzLnN1cHBvcnRIdG1sLCBkdG8uc3VwcG9ydEh0bWwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWRzLnVyaXMsIGR0by51cmlzKTtcblx0fSk7XG5cblx0dGVzdCgnbGlmdCByZXR1cm5zIG5ldyBpbnN0YW5jZScsICgpID0+IHtcblx0XHRjb25zdCBpbnN0YW5jZSA9IG5ldyBNYXJrZG93blN0cmluZygnaGVsbG8nKTtcblx0XHRjb25zdCBtZHMyID0gTWFya2Rvd25TdHJpbmcubGlmdChpbnN0YW5jZSkuYXBwZW5kVGV4dCgnd29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWRzMi52YWx1ZSwgJ2hlbGxvd29ybGQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5zdGFuY2UudmFsdWUsICdoZWxsbycpO1xuXHR9KTtcblxuXHRzdWl0ZSgnYXBwZW5kQ29kZUJsb2NrJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIGFzc2VydENvZGVCbG9jayhsYW5nOiBzdHJpbmcsIGNvZGU6IHN0cmluZywgcmVzdWx0OiBzdHJpbmcpIHtcblx0XHRcdGNvbnN0IG1kcyA9IG5ldyBNYXJrZG93blN0cmluZygpO1xuXHRcdFx0bWRzLmFwcGVuZENvZGVibG9jayhsYW5nLCBjb2RlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZHMudmFsdWUsIHJlc3VsdCk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnY29tbW9uIGNhc2VzJywgKCkgPT4ge1xuXHRcdFx0Ly8gbm8gYmFja3RpY2tzXG5cdFx0XHRhc3NlcnRDb2RlQmxvY2soJ3RzJywgJ2NvbnN0IGEgPSAxOycsIGBcXG4ke1tcblx0XHRcdFx0J2BgYHRzJyxcblx0XHRcdFx0J2NvbnN0IGEgPSAxOycsXG5cdFx0XHRcdCdgYGAnXG5cdFx0XHRdLmpvaW4oJ1xcbicpfVxcbmApO1xuXHRcdFx0Ly8gYmFja3RpY2tzXG5cdFx0XHRhc3NlcnRDb2RlQmxvY2soJ3RzJywgJ2NvbnN0IGEgPSBgMWA7JywgYFxcbiR7W1xuXHRcdFx0XHQnYGBgdHMnLFxuXHRcdFx0XHQnY29uc3QgYSA9IGAxYDsnLFxuXHRcdFx0XHQnYGBgJ1xuXHRcdFx0XS5qb2luKCdcXG4nKX1cXG5gKTtcblx0XHR9KTtcblxuXHRcdC8vIEBzZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE5Mzc0NlxuXHRcdHRlc3QoJ2VzY2FwZSBmZW5jZScsICgpID0+IHtcblx0XHRcdC8vIGZlbmNlIGluIHRoZSBmaXJzdCBsaW5lXG5cdFx0XHRhc3NlcnRDb2RlQmxvY2soJ21kJywgJ2BgYFxcbmBgYCcsIGBcXG4ke1tcblx0XHRcdFx0J2BgYGBtZCcsXG5cdFx0XHRcdCdgYGBcXG5gYGAnLFxuXHRcdFx0XHQnYGBgYCdcblx0XHRcdF0uam9pbignXFxuJyl9XFxuYCk7XG5cdFx0XHQvLyBmZW5jZSBpbiB0aGUgbWlkZGxlIG9mIGNvZGVcblx0XHRcdGFzc2VydENvZGVCbG9jaygnbWQnLCAnXFxuXFxuYGBgXFxuYGBgJywgYFxcbiR7W1xuXHRcdFx0XHQnYGBgYG1kJyxcblx0XHRcdFx0J1xcblxcbmBgYFxcbmBgYCcsXG5cdFx0XHRcdCdgYGBgJ1xuXHRcdFx0XS5qb2luKCdcXG4nKX1cXG5gKTtcblx0XHRcdC8vIGxvbmdlciBmZW5jZSBhdCB0aGUgZW5kIG9mIGNvZGVcblx0XHRcdGFzc2VydENvZGVCbG9jaygnbWQnLCAnYGBgXFxuYGBgXFxuYGBgYFxcbmBgYGAnLCBgXFxuJHtbXG5cdFx0XHRcdCdgYGBgYG1kJyxcblx0XHRcdFx0J2BgYFxcbmBgYFxcbmBgYGBcXG5gYGBgJyxcblx0XHRcdFx0J2BgYGBgJ1xuXHRcdFx0XS5qb2luKCdcXG4nKX1cXG5gKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1RoZW1lSWNvbnMnLCAoKSA9PiB7XG5cblx0XHRzdWl0ZSgnU3VwcG9ydCBPbicsICgpID0+IHtcblxuXHRcdFx0dGVzdCgnYXBwZW5kVGV4dCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgbWRzID0gbmV3IE1hcmtkb3duU3RyaW5nKHVuZGVmaW5lZCwgeyBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KTtcblx0XHRcdFx0bWRzLmFwcGVuZFRleHQoJyQoemFwKSAkKG5vdCBhIHRoZW1lIGljb24pICQoYWRkKScpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZHMudmFsdWUsICdcXFxcXFxcXCRcXFxcKHphcFxcXFwpJm5ic3A7JFxcXFwobm90Jm5ic3A7YSZuYnNwO3RoZW1lJm5ic3A7aWNvblxcXFwpJm5ic3A7XFxcXFxcXFwkXFxcXChhZGRcXFxcKScpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2FwcGVuZE1hcmtkb3duJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBtZHMgPSBuZXcgTWFya2Rvd25TdHJpbmcodW5kZWZpbmVkLCB7IHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHRcdFx0XHRtZHMuYXBwZW5kTWFya2Rvd24oJyQoemFwKSAkKG5vdCBhIHRoZW1lIGljb24pICQoYWRkKScpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZHMudmFsdWUsICckKHphcCkgJChub3QgYSB0aGVtZSBpY29uKSAkKGFkZCknKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdhcHBlbmRNYXJrZG93biB3aXRoIGVzY2FwZWQgaWNvbicsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgbWRzID0gbmV3IE1hcmtkb3duU3RyaW5nKHVuZGVmaW5lZCwgeyBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KTtcblx0XHRcdFx0bWRzLmFwcGVuZE1hcmtkb3duKCdcXFxcJCh6YXApICQobm90IGEgdGhlbWUgaWNvbikgJChhZGQpJyk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1kcy52YWx1ZSwgJ1xcXFwkKHphcCkgJChub3QgYSB0aGVtZSBpY29uKSAkKGFkZCknKTtcblx0XHRcdH0pO1xuXG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnU3VwcG9ydCBPZmYnLCAoKSA9PiB7XG5cblx0XHRcdHRlc3QoJ2FwcGVuZFRleHQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1kcyA9IG5ldyBNYXJrZG93blN0cmluZyh1bmRlZmluZWQsIHsgc3VwcG9ydFRoZW1lSWNvbnM6IGZhbHNlIH0pO1xuXHRcdFx0XHRtZHMuYXBwZW5kVGV4dCgnJCh6YXApICQobm90IGEgdGhlbWUgaWNvbikgJChhZGQpJyk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1kcy52YWx1ZSwgJyRcXFxcKHphcFxcXFwpJm5ic3A7JFxcXFwobm90Jm5ic3A7YSZuYnNwO3RoZW1lJm5ic3A7aWNvblxcXFwpJm5ic3A7JFxcXFwoYWRkXFxcXCknKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdhcHBlbmRNYXJrZG93bicsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgbWRzID0gbmV3IE1hcmtkb3duU3RyaW5nKHVuZGVmaW5lZCwgeyBzdXBwb3J0VGhlbWVJY29uczogZmFsc2UgfSk7XG5cdFx0XHRcdG1kcy5hcHBlbmRNYXJrZG93bignJCh6YXApICQobm90IGEgdGhlbWUgaWNvbikgJChhZGQpJyk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1kcy52YWx1ZSwgJyQoemFwKSAkKG5vdCBhIHRoZW1lIGljb24pICQoYWRkKScpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2FwcGVuZE1hcmtkb3duIHdpdGggZXNjYXBlZCBpY29uJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBtZHMgPSBuZXcgTWFya2Rvd25TdHJpbmcodW5kZWZpbmVkLCB7IHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHRcdFx0XHRtZHMuYXBwZW5kTWFya2Rvd24oJ1xcXFwkKHphcCkgJChub3QgYSB0aGVtZSBpY29uKSAkKGFkZCknKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWRzLnZhbHVlLCAnXFxcXCQoemFwKSAkKG5vdCBhIHRoZW1lIGljb24pICQoYWRkKScpO1xuXHRcdFx0fSk7XG5cblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUEwQixzQkFBc0I7QUFDaEQsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxXQUFXO0FBRXBCLE1BQU0sa0JBQWtCLE1BQU07QUFFN0IsMENBQXdDO0FBRXhDLE9BQUssNkJBQTZCLFdBQVk7QUFDN0MsVUFBTSxNQUFNLElBQUksZUFBZTtBQUMvQixRQUFJLFdBQVcsNkJBQTZCO0FBQzVDLFdBQU8sWUFBWSxJQUFJLE9BQU8sa0VBQWtFO0FBQUEsRUFDakcsQ0FBQztBQUVELE9BQUssMERBQTJELFdBQVk7QUFDM0UsVUFBTSxNQUFNLElBQUksZUFBZTtBQUMvQixRQUFJLFdBQVcsZUFBZTtBQUM5QixXQUFPLFlBQVksSUFBSSxPQUFP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
