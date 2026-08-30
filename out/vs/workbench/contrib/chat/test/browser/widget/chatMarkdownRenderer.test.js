import assert from "assert";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { assertSnapshot } from "../../../../../../base/test/common/snapshot.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ChatContentMarkdownRenderer } from "../../../browser/widget/chatContentMarkdownRenderer.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
suite("ChatMarkdownRenderer", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let testRenderer;
  setup(() => {
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    testRenderer = instantiationService.createInstance(ChatContentMarkdownRenderer);
  });
  test("simple", async () => {
    const md = new MarkdownString("a");
    const result = store.add(testRenderer.render(md));
    await assertSnapshot(result.element.textContent);
  });
  test("plain text fast path preserves rendered markdown shape and single tildes", () => {
    const md = new MarkdownString("Hello, ~world~. This is plain.", { isTrusted: true, supportHtml: true, supportThemeIcons: true });
    const result = store.add(testRenderer.render(md));
    assert.deepStrictEqual({
      outerHTML: result.element.outerHTML,
      textContent: result.element.textContent
    }, {
      outerHTML: '<div class="rendered-markdown"><p>Hello, ~world~. This is plain.</p></div>',
      textContent: "Hello, ~world~. This is plain."
    });
  });
  test("plain text fast path reuses target element", () => {
    const md = new MarkdownString("Hello, world.");
    const target = document.createElement("div");
    target.appendChild(document.createElement("span"));
    const result = store.add(testRenderer.render(md, void 0, target));
    assert.deepStrictEqual({
      sameElement: result.element === target,
      outerHTML: target.outerHTML
    }, {
      sameElement: true,
      outerHTML: '<div class="rendered-markdown"><p>Hello, world.</p></div>'
    });
  });
  test("only renders strikethrough with double tildes", () => {
    const md = new MarkdownString("Keep ~single tildes~ but strike ~~double tildes~~.");
    const result = store.add(testRenderer.render(md, { markedOptions: { gfm: true } }));
    assert.deepStrictEqual({
      outerHTML: result.element.outerHTML,
      textContent: result.element.textContent
    }, {
      outerHTML: '<div class="rendered-markdown"><p>Keep ~single tildes~ but strike <del>double tildes</del>.</p></div>',
      textContent: "Keep ~single tildes~ but strike double tildes."
    });
  });
  test("supportHtml with one-line markdown", async () => {
    const md = new MarkdownString("**hello**");
    md.supportHtml = true;
    const result = store.add(testRenderer.render(md));
    await assertSnapshot(result.element.outerHTML);
    const md2 = new MarkdownString("1. [_hello_](https://example.com) test **text**");
    md2.supportHtml = true;
    const result2 = store.add(testRenderer.render(md2));
    await assertSnapshot(result2.element.outerHTML);
  });
  test("invalid HTML", async () => {
    const md = new MarkdownString("1<canvas>2<details>3</details></canvas>4");
    md.supportHtml = true;
    const result = store.add(testRenderer.render(md));
    await assertSnapshot(result.element.outerHTML);
  });
  test("invalid HTML with attributes", async () => {
    const md = new MarkdownString('1<details id="id1" style="display: none">2<details id="my id 2">3</details></details>4');
    md.supportHtml = true;
    const result = store.add(testRenderer.render(md));
    await assertSnapshot(result.element.outerHTML);
  });
  test("valid HTML", async () => {
    const md = new MarkdownString(`
<h1>heading</h1>
<ul>
	<li>1</li>
	<li><b>hi</b></li>
</ul>
<pre><code>code here</code></pre>`);
    md.supportHtml = true;
    const result = store.add(testRenderer.render(md));
    await assertSnapshot(result.element.outerHTML);
  });
  test("mixed valid and invalid HTML", async () => {
    const md = new MarkdownString(`
<h1>heading</h1>
<details>
<ul>
	<li><span><details><i>1</i></details></span></li>
	<li><b>hi</b></li>
</ul>
</details>
<pre><canvas>canvas here</canvas></pre><details></details>`);
    md.supportHtml = true;
    const result = store.add(testRenderer.render(md));
    await assertSnapshot(result.element.outerHTML);
  });
  test("self-closing elements", async () => {
    {
      const md = new MarkdownString('<area><hr><br><input type="text" value="test">');
      md.supportHtml = true;
      const result = store.add(testRenderer.render(md));
      await assertSnapshot(result.element.outerHTML);
    }
    {
      const md = new MarkdownString('<area><hr><br><input type="checkbox">');
      md.supportHtml = true;
      const result = store.add(testRenderer.render(md));
      await assertSnapshot(result.element.outerHTML);
    }
  });
  test("html comments", async () => {
    const md = new MarkdownString("<!-- comment1 <div></div> --><div>content</div><!-- comment2 -->");
    md.supportHtml = true;
    const result = store.add(testRenderer.render(md));
    await assertSnapshot(result.element.outerHTML);
  });
  test("CDATA", async () => {
    const md = new MarkdownString("<![CDATA[<div>content</div>]]>");
    md.supportHtml = true;
    const result = store.add(testRenderer.render(md));
    await assertSnapshot(result.element.outerHTML);
  });
  test("remote images are disallowed", async () => {
    const md = new MarkdownString('<img src="http://disallowed.com/image.jpg">');
    md.supportHtml = true;
    const result = store.add(testRenderer.render(md));
    await assertSnapshot(result.element.outerHTML);
  });
  test("code block ending at end of content does not leak body tag", async () => {
    const md = new MarkdownString("text\n```ts\nconst x = 1;\n```");
    md.supportHtml = true;
    const result = store.add(testRenderer.render(md));
    const textContent = result.element.textContent;
    assert.ok(!textContent?.includes("</body>"), `Rendered text should not contain </body>, got: ${textContent}`);
  });
  test("fillInIncompleteTokens closes bare codespan when supportHtml is set", () => {
    const md = new MarkdownString("Created isolated worktree for branch `xyz", { supportHtml: true });
    const result = store.add(testRenderer.render(md, { fillInIncompleteTokens: true }));
    const codeEl = result.element.querySelector("code");
    assert.ok(codeEl, `Expected a <code> element in: ${result.element.outerHTML}`);
    assert.strictEqual(codeEl.textContent, "xyz");
    assert.ok(!result.element.textContent?.includes("`"), `Rendered text should not contain a bare backtick, got: ${result.element.textContent}`);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcY2hhdE1hcmtkb3duUmVuZGVyZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgYXNzZXJ0U25hcHNob3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3NuYXBzaG90LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5cbnN1aXRlKCdDaGF0TWFya2Rvd25SZW5kZXJlcicsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgdGVzdFJlbmRlcmVyOiBDaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXI7XG5cdHNldHVwKCgpID0+IHtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKSk7XG5cdFx0dGVzdFJlbmRlcmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyKTtcblx0fSk7XG5cblx0dGVzdCgnc2ltcGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1kID0gbmV3IE1hcmtkb3duU3RyaW5nKCdhJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHRlc3RSZW5kZXJlci5yZW5kZXIobWQpKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQuZWxlbWVudC50ZXh0Q29udGVudCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BsYWluIHRleHQgZmFzdCBwYXRoIHByZXNlcnZlcyByZW5kZXJlZCBtYXJrZG93biBzaGFwZSBhbmQgc2luZ2xlIHRpbGRlcycsICgpID0+IHtcblx0XHRjb25zdCBtZCA9IG5ldyBNYXJrZG93blN0cmluZygnSGVsbG8sIH53b3JsZH4uIFRoaXMgaXMgcGxhaW4uJywgeyBpc1RydXN0ZWQ6IHRydWUsIHN1cHBvcnRIdG1sOiB0cnVlLCBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KTtcblx0XHRjb25zdCByZXN1bHQgPSBzdG9yZS5hZGQodGVzdFJlbmRlcmVyLnJlbmRlcihtZCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRvdXRlckhUTUw6IHJlc3VsdC5lbGVtZW50Lm91dGVySFRNTCxcblx0XHRcdHRleHRDb250ZW50OiByZXN1bHQuZWxlbWVudC50ZXh0Q29udGVudCxcblx0XHR9LCB7XG5cdFx0XHRvdXRlckhUTUw6ICc8ZGl2IGNsYXNzPVwicmVuZGVyZWQtbWFya2Rvd25cIj48cD5IZWxsbywgfndvcmxkfi4gVGhpcyBpcyBwbGFpbi48L3A+PC9kaXY+Jyxcblx0XHRcdHRleHRDb250ZW50OiAnSGVsbG8sIH53b3JsZH4uIFRoaXMgaXMgcGxhaW4uJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncGxhaW4gdGV4dCBmYXN0IHBhdGggcmV1c2VzIHRhcmdldCBlbGVtZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1kID0gbmV3IE1hcmtkb3duU3RyaW5nKCdIZWxsbywgd29ybGQuJyk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGFyZ2V0LmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHRlc3RSZW5kZXJlci5yZW5kZXIobWQsIHVuZGVmaW5lZCwgdGFyZ2V0KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNhbWVFbGVtZW50OiByZXN1bHQuZWxlbWVudCA9PT0gdGFyZ2V0LFxuXHRcdFx0b3V0ZXJIVE1MOiB0YXJnZXQub3V0ZXJIVE1MLFxuXHRcdH0sIHtcblx0XHRcdHNhbWVFbGVtZW50OiB0cnVlLFxuXHRcdFx0b3V0ZXJIVE1MOiAnPGRpdiBjbGFzcz1cInJlbmRlcmVkLW1hcmtkb3duXCI+PHA+SGVsbG8sIHdvcmxkLjwvcD48L2Rpdj4nLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvbmx5IHJlbmRlcnMgc3RyaWtldGhyb3VnaCB3aXRoIGRvdWJsZSB0aWxkZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWQgPSBuZXcgTWFya2Rvd25TdHJpbmcoJ0tlZXAgfnNpbmdsZSB0aWxkZXN+IGJ1dCBzdHJpa2Ugfn5kb3VibGUgdGlsZGVzfn4uJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHRlc3RSZW5kZXJlci5yZW5kZXIobWQsIHsgbWFya2VkT3B0aW9uczogeyBnZm06IHRydWUgfSB9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG91dGVySFRNTDogcmVzdWx0LmVsZW1lbnQub3V0ZXJIVE1MLFxuXHRcdFx0dGV4dENvbnRlbnQ6IHJlc3VsdC5lbGVtZW50LnRleHRDb250ZW50LFxuXHRcdH0sIHtcblx0XHRcdG91dGVySFRNTDogJzxkaXYgY2xhc3M9XCJyZW5kZXJlZC1tYXJrZG93blwiPjxwPktlZXAgfnNpbmdsZSB0aWxkZXN+IGJ1dCBzdHJpa2UgPGRlbD5kb3VibGUgdGlsZGVzPC9kZWw+LjwvcD48L2Rpdj4nLFxuXHRcdFx0dGV4dENvbnRlbnQ6ICdLZWVwIH5zaW5nbGUgdGlsZGVzfiBidXQgc3RyaWtlIGRvdWJsZSB0aWxkZXMuJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3VwcG9ydEh0bWwgd2l0aCBvbmUtbGluZSBtYXJrZG93bicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtZCA9IG5ldyBNYXJrZG93blN0cmluZygnKipoZWxsbyoqJyk7XG5cdFx0bWQuc3VwcG9ydEh0bWwgPSB0cnVlO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHN0b3JlLmFkZCh0ZXN0UmVuZGVyZXIucmVuZGVyKG1kKSk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0LmVsZW1lbnQub3V0ZXJIVE1MKTtcblxuXHRcdGNvbnN0IG1kMiA9IG5ldyBNYXJrZG93blN0cmluZygnMS4gW19oZWxsb19dKGh0dHBzOi8vZXhhbXBsZS5jb20pIHRlc3QgKip0ZXh0KionKTtcblx0XHRtZDIuc3VwcG9ydEh0bWwgPSB0cnVlO1xuXHRcdGNvbnN0IHJlc3VsdDIgPSBzdG9yZS5hZGQodGVzdFJlbmRlcmVyLnJlbmRlcihtZDIpKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQyLmVsZW1lbnQub3V0ZXJIVE1MKTtcblx0fSk7XG5cblx0dGVzdCgnaW52YWxpZCBIVE1MJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1kID0gbmV3IE1hcmtkb3duU3RyaW5nKCcxPGNhbnZhcz4yPGRldGFpbHM+MzwvZGV0YWlscz48L2NhbnZhcz40Jyk7XG5cdFx0bWQuc3VwcG9ydEh0bWwgPSB0cnVlO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHN0b3JlLmFkZCh0ZXN0UmVuZGVyZXIucmVuZGVyKG1kKSk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0LmVsZW1lbnQub3V0ZXJIVE1MKTtcblx0fSk7XG5cblx0dGVzdCgnaW52YWxpZCBIVE1MIHdpdGggYXR0cmlidXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtZCA9IG5ldyBNYXJrZG93blN0cmluZygnMTxkZXRhaWxzIGlkPVwiaWQxXCIgc3R5bGU9XCJkaXNwbGF5OiBub25lXCI+MjxkZXRhaWxzIGlkPVwibXkgaWQgMlwiPjM8L2RldGFpbHM+PC9kZXRhaWxzPjQnKTtcblx0XHRtZC5zdXBwb3J0SHRtbCA9IHRydWU7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHRlc3RSZW5kZXJlci5yZW5kZXIobWQpKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQuZWxlbWVudC5vdXRlckhUTUwpO1xuXHR9KTtcblxuXHR0ZXN0KCd2YWxpZCBIVE1MJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1kID0gbmV3IE1hcmtkb3duU3RyaW5nKGBcbjxoMT5oZWFkaW5nPC9oMT5cbjx1bD5cblx0PGxpPjE8L2xpPlxuXHQ8bGk+PGI+aGk8L2I+PC9saT5cbjwvdWw+XG48cHJlPjxjb2RlPmNvZGUgaGVyZTwvY29kZT48L3ByZT5gKTtcblx0XHRtZC5zdXBwb3J0SHRtbCA9IHRydWU7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHRlc3RSZW5kZXJlci5yZW5kZXIobWQpKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQuZWxlbWVudC5vdXRlckhUTUwpO1xuXHR9KTtcblxuXHR0ZXN0KCdtaXhlZCB2YWxpZCBhbmQgaW52YWxpZCBIVE1MJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1kID0gbmV3IE1hcmtkb3duU3RyaW5nKGBcbjxoMT5oZWFkaW5nPC9oMT5cbjxkZXRhaWxzPlxuPHVsPlxuXHQ8bGk+PHNwYW4+PGRldGFpbHM+PGk+MTwvaT48L2RldGFpbHM+PC9zcGFuPjwvbGk+XG5cdDxsaT48Yj5oaTwvYj48L2xpPlxuPC91bD5cbjwvZGV0YWlscz5cbjxwcmU+PGNhbnZhcz5jYW52YXMgaGVyZTwvY2FudmFzPjwvcHJlPjxkZXRhaWxzPjwvZGV0YWlscz5gKTtcblx0XHRtZC5zdXBwb3J0SHRtbCA9IHRydWU7XG5cdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHRlc3RSZW5kZXJlci5yZW5kZXIobWQpKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHQuZWxlbWVudC5vdXRlckhUTUwpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZWxmLWNsb3NpbmcgZWxlbWVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0e1xuXHRcdFx0Y29uc3QgbWQgPSBuZXcgTWFya2Rvd25TdHJpbmcoJzxhcmVhPjxocj48YnI+PGlucHV0IHR5cGU9XCJ0ZXh0XCIgdmFsdWU9XCJ0ZXN0XCI+Jyk7XG5cdFx0XHRtZC5zdXBwb3J0SHRtbCA9IHRydWU7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBzdG9yZS5hZGQodGVzdFJlbmRlcmVyLnJlbmRlcihtZCkpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0LmVsZW1lbnQub3V0ZXJIVE1MKTtcblx0XHR9XG5cdFx0e1xuXHRcdFx0Y29uc3QgbWQgPSBuZXcgTWFya2Rvd25TdHJpbmcoJzxhcmVhPjxocj48YnI+PGlucHV0IHR5cGU9XCJjaGVja2JveFwiPicpO1xuXHRcdFx0bWQuc3VwcG9ydEh0bWwgPSB0cnVlO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHRlc3RSZW5kZXJlci5yZW5kZXIobWQpKTtcblx0XHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdC5lbGVtZW50Lm91dGVySFRNTCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdodG1sIGNvbW1lbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1kID0gbmV3IE1hcmtkb3duU3RyaW5nKCc8IS0tIGNvbW1lbnQxIDxkaXY+PC9kaXY+IC0tPjxkaXY+Y29udGVudDwvZGl2PjwhLS0gY29tbWVudDIgLS0+Jyk7XG5cdFx0bWQuc3VwcG9ydEh0bWwgPSB0cnVlO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHN0b3JlLmFkZCh0ZXN0UmVuZGVyZXIucmVuZGVyKG1kKSk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0LmVsZW1lbnQub3V0ZXJIVE1MKTtcblx0fSk7XG5cblx0dGVzdCgnQ0RBVEEnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWQgPSBuZXcgTWFya2Rvd25TdHJpbmcoJzwhW0NEQVRBWzxkaXY+Y29udGVudDwvZGl2Pl1dPicpO1xuXHRcdG1kLnN1cHBvcnRIdG1sID0gdHJ1ZTtcblx0XHRjb25zdCByZXN1bHQgPSBzdG9yZS5hZGQodGVzdFJlbmRlcmVyLnJlbmRlcihtZCkpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdC5lbGVtZW50Lm91dGVySFRNTCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW90ZSBpbWFnZXMgYXJlIGRpc2FsbG93ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWQgPSBuZXcgTWFya2Rvd25TdHJpbmcoJzxpbWcgc3JjPVwiaHR0cDovL2Rpc2FsbG93ZWQuY29tL2ltYWdlLmpwZ1wiPicpO1xuXHRcdG1kLnN1cHBvcnRIdG1sID0gdHJ1ZTtcblx0XHRjb25zdCByZXN1bHQgPSBzdG9yZS5hZGQodGVzdFJlbmRlcmVyLnJlbmRlcihtZCkpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdC5lbGVtZW50Lm91dGVySFRNTCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvZGUgYmxvY2sgZW5kaW5nIGF0IGVuZCBvZiBjb250ZW50IGRvZXMgbm90IGxlYWsgYm9keSB0YWcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWQgPSBuZXcgTWFya2Rvd25TdHJpbmcoJ3RleHRcXG5gYGB0c1xcbmNvbnN0IHggPSAxO1xcbmBgYCcpO1xuXHRcdG1kLnN1cHBvcnRIdG1sID0gdHJ1ZTtcblx0XHRjb25zdCByZXN1bHQgPSBzdG9yZS5hZGQodGVzdFJlbmRlcmVyLnJlbmRlcihtZCkpO1xuXHRcdGNvbnN0IHRleHRDb250ZW50ID0gcmVzdWx0LmVsZW1lbnQudGV4dENvbnRlbnQ7XG5cdFx0YXNzZXJ0Lm9rKCF0ZXh0Q29udGVudD8uaW5jbHVkZXMoJzwvYm9keT4nKSwgYFJlbmRlcmVkIHRleHQgc2hvdWxkIG5vdCBjb250YWluIDwvYm9keT4sIGdvdDogJHt0ZXh0Q29udGVudH1gKTtcblx0fSk7XG5cblx0dGVzdCgnZmlsbEluSW5jb21wbGV0ZVRva2VucyBjbG9zZXMgYmFyZSBjb2Rlc3BhbiB3aGVuIHN1cHBvcnRIdG1sIGlzIHNldCcsICgpID0+IHtcblx0XHQvLyBSZWdyZXNzaW9uOiB0aGUgY2hhdCBjb250ZW50IHJlbmRlcmVyIHdyYXBzIGBzdXBwb3J0SHRtbGAgbWFya2Rvd25cblx0XHQvLyBpbiBgPGJvZHk+Li4uPC9ib2R5PmAsIHdoaWNoIHByb2R1Y2VzIGEgdHJhaWxpbmcgaHRtbCB0b2tlbi4gVGhlXG5cdFx0Ly8gcGFyYWdyYXBoL2NvZGVzcGFuIGZpeHVwIGluIGBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zYCBtdXN0IHN0aWxsXG5cdFx0Ly8gZmlyZSBzbyBzdHJlYW1pbmcgYSBwYXJ0aWFsIGJhY2t0aWNrIChlLmcuIHRoZSBhZ2VudCBob3N0XG5cdFx0Ly8gXCJDcmVhdGVkIGlzb2xhdGVkIHdvcmt0cmVlIGZvciBicmFuY2ggYHh5elwiIGFubm91bmNlbWVudCkgZG9lc1xuXHRcdC8vIG5vdCBsZWF2ZSBhIGJhcmUgYCBpbiB0aGUgRE9NIHVudGlsIHRoZSBjbG9zaW5nIGJhY2t0aWNrIGFycml2ZXMuXG5cdFx0Y29uc3QgbWQgPSBuZXcgTWFya2Rvd25TdHJpbmcoJ0NyZWF0ZWQgaXNvbGF0ZWQgd29ya3RyZWUgZm9yIGJyYW5jaCBgeHl6JywgeyBzdXBwb3J0SHRtbDogdHJ1ZSB9KTtcblx0XHRjb25zdCByZXN1bHQgPSBzdG9yZS5hZGQodGVzdFJlbmRlcmVyLnJlbmRlcihtZCwgeyBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zOiB0cnVlIH0pKTtcblxuXHRcdGNvbnN0IGNvZGVFbCA9IHJlc3VsdC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2NvZGUnKTtcblx0XHRhc3NlcnQub2soY29kZUVsLCBgRXhwZWN0ZWQgYSA8Y29kZT4gZWxlbWVudCBpbjogJHtyZXN1bHQuZWxlbWVudC5vdXRlckhUTUx9YCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvZGVFbCEudGV4dENvbnRlbnQsICd4eXonKTtcblx0XHRhc3NlcnQub2soIXJlc3VsdC5lbGVtZW50LnRleHRDb250ZW50Py5pbmNsdWRlcygnYCcpLCBgUmVuZGVyZWQgdGV4dCBzaG91bGQgbm90IGNvbnRhaW4gYSBiYXJlIGJhY2t0aWNrLCBnb3Q6ICR7cmVzdWx0LmVsZW1lbnQudGV4dENvbnRlbnR9YCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywrQ0FBK0M7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
