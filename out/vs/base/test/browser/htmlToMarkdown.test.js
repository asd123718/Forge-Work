import assert from "assert";
import { convertHtmlToMarkdown } from "../../browser/htmlToMarkdown.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../common/utils.js";
suite("htmlToMarkdown", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("converts headings", () => {
    assert.strictEqual(convertHtmlToMarkdown("<h1>Title</h1>"), "# Title");
    assert.strictEqual(convertHtmlToMarkdown("<h2>Subtitle</h2>"), "## Subtitle");
    assert.strictEqual(convertHtmlToMarkdown("<h3>Section</h3>"), "### Section");
    assert.strictEqual(convertHtmlToMarkdown("<h4>Sub-section</h4>"), "#### Sub-section");
    assert.strictEqual(convertHtmlToMarkdown("<h5>Minor</h5>"), "##### Minor");
    assert.strictEqual(convertHtmlToMarkdown("<h6>Smallest</h6>"), "###### Smallest");
  });
  test("converts links", () => {
    assert.strictEqual(
      convertHtmlToMarkdown('<a href="https://example.com">Example</a>'),
      "[Example](https://example.com)"
    );
  });
  test("strips dangerous schemes from links", () => {
    assert.strictEqual(
      convertHtmlToMarkdown('<a href="javascript:alert(1)">click</a>'),
      "click"
    );
    assert.strictEqual(
      convertHtmlToMarkdown('<a href="vbscript:run">run</a>'),
      "run"
    );
    assert.strictEqual(
      convertHtmlToMarkdown('<a href="data:text/html,<h1>hi</h1>">data</a>'),
      "data"
    );
  });
  suite("internal links", () => {
    test("converts targets that only resolve in this window to inline code", () => {
      assert.deepStrictEqual(
        [
          convertHtmlToMarkdown('<a href="vscode-file://vscode-app/c:/Users/user/AppData/Local/Programs/Microsoft%20VS%20Code/resources/app/out/vs/code/electron-browser/workbench/workbench.html">foo-bar.md</a>'),
          convertHtmlToMarkdown('<a href="file:///home/user/project/DefaultMeshInterpolator.java#46,62">mx:text</a>'),
          convertHtmlToMarkdown('<a href="code-oss://file/c:/repo/src/config.ts">src/config.ts</a>'),
          convertHtmlToMarkdown('<a href="http://_vscodecontentref_/0">index.ts</a>'),
          // The agent host prompt asks models for bare absolute paths.
          convertHtmlToMarkdown('<a href="/Users/me/repo/src/a.ts">a.ts</a>'),
          convertHtmlToMarkdown('<a href="command:workbench.action.files.save">Save</a>'),
          convertHtmlToMarkdown('<img src="/Users/me/shot.png" alt="screenshot">')
        ],
        ["`foo-bar.md`", "`mx:text`", "`src/config.ts`", "`index.ts`", "`a.ts`", "`Save`", "`screenshot`"]
      );
    });
    test("prefers data-href only when href cannot be shared", () => {
      assert.deepStrictEqual(
        [
          convertHtmlToMarkdown('<a href="" data-href="file:///home/user/project/a.ts">a.ts</a>'),
          convertHtmlToMarkdown('<a href="vscode-file://vscode-app/resources/app/out/workbench.html" data-href="https://example.com">Example</a>'),
          // A page of unknown origin must not redirect a link it displayed as safe.
          convertHtmlToMarkdown('<a href="https://real.example" data-href="https://evil.example">docs</a>')
        ],
        ["`a.ts`", "[Example](https://example.com)", "[docs](https://real.example)"]
      );
    });
    test("uses the plain label when the target cannot be shared", () => {
      assert.deepStrictEqual(
        [
          convertHtmlToMarkdown('<a href="file:///x"><strong>Foo</strong></a>'),
          convertHtmlToMarkdown('<a href="https://example.com"><strong>Kept</strong></a>')
        ],
        ["`Foo`", "[**Kept**](https://example.com)"]
      );
    });
    test("keeps internal links inside surrounding markdown formatting", () => {
      assert.strictEqual(
        convertHtmlToMarkdown('<p>This is <strong>inherited</strong> from the <a href="vscode-file://vscode-app/resources/app/out/workbench.html">FooBar</a> class.</p>'),
        "This is **inherited** from the `FooBar` class."
      );
    });
    test("keeps document-relative links", () => {
      assert.deepStrictEqual(
        [
          convertHtmlToMarkdown('<a href="#details">details</a>'),
          convertHtmlToMarkdown('<a href="../CONTRIBUTING.md">guide</a>')
        ],
        ["[details](#details)", "[guide](../CONTRIBUTING.md)"]
      );
    });
  });
  test("converts bold and italic", () => {
    assert.strictEqual(convertHtmlToMarkdown("<strong>bold</strong>"), "**bold**");
    assert.strictEqual(convertHtmlToMarkdown("<b>bold</b>"), "**bold**");
    assert.strictEqual(convertHtmlToMarkdown("<em>italic</em>"), "*italic*");
    assert.strictEqual(convertHtmlToMarkdown("<i>italic</i>"), "*italic*");
  });
  test("converts inline code", () => {
    assert.strictEqual(convertHtmlToMarkdown("<code>foo()</code>"), "`foo()`");
  });
  test("preserves HTML tag names inside inline code", () => {
    assert.strictEqual(convertHtmlToMarkdown("<code>&lt;aside&gt;</code>"), "`<aside>`");
    assert.strictEqual(convertHtmlToMarkdown("<code>&lt;details&gt;</code>"), "`<details>`");
  });
  test("preserves HTML tag names inside inline code with nested tags", () => {
    assert.strictEqual(
      convertHtmlToMarkdown('<code><span class="hl">&lt;aside&gt;</span></code>'),
      "`<aside>`"
    );
  });
  test("preserves HTML tag names inside code blocks", () => {
    assert.strictEqual(
      convertHtmlToMarkdown("<pre><code>&lt;aside&gt;</code></pre>"),
      "```\n<aside>\n```"
    );
  });
  test("converts code blocks", () => {
    assert.strictEqual(
      convertHtmlToMarkdown("<pre><code>const x = 1;</code></pre>"),
      "```\nconst x = 1;\n```"
    );
  });
  test("converts syntax-highlighted code blocks by stripping inner tags", () => {
    assert.strictEqual(
      convertHtmlToMarkdown('<pre><code><span class="kw">const</span> x = <span class="num">1</span>;</code></pre>'),
      "```\nconst x = 1;\n```"
    );
  });
  test("preserves indentation in code blocks", () => {
    assert.strictEqual(
      convertHtmlToMarkdown("<pre><code>function foo() {\n  return 1;\n}</code></pre>"),
      "```\nfunction foo() {\n  return 1;\n}\n```"
    );
  });
  test("converts unordered lists", () => {
    const html = "<ul><li>one</li><li>two</li><li>three</li></ul>";
    assert.strictEqual(convertHtmlToMarkdown(html), "- one\n- two\n- three");
  });
  test("converts ordered lists to numbered items", () => {
    const html = "<ol><li>first</li><li>second</li></ol>";
    assert.strictEqual(convertHtmlToMarkdown(html), "1. first\n2. second");
  });
  test("converts line breaks", () => {
    assert.strictEqual(convertHtmlToMarkdown("hello<br>world"), "hello\nworld");
    assert.strictEqual(convertHtmlToMarkdown("hello<br/>world"), "hello\nworld");
  });
  test("converts horizontal rules", () => {
    assert.strictEqual(convertHtmlToMarkdown("above<hr>below"), "above\n---\nbelow");
  });
  test("converts strikethrough", () => {
    assert.strictEqual(convertHtmlToMarkdown("<del>removed</del>"), "~~removed~~");
    assert.strictEqual(convertHtmlToMarkdown("<s>struck</s>"), "~~struck~~");
  });
  test("converts blockquotes", () => {
    assert.strictEqual(
      convertHtmlToMarkdown("<blockquote>quoted text</blockquote>"),
      "> quoted text"
    );
  });
  test("converts images", () => {
    assert.strictEqual(
      convertHtmlToMarkdown('<img src="https://example.com/img.png" alt="photo">'),
      "![photo](https://example.com/img.png)"
    );
  });
  test("decodes HTML entities", () => {
    assert.strictEqual(convertHtmlToMarkdown("&amp; &lt; &gt; &quot; &#39;"), `& < > " '`);
  });
  test("strips unknown tags", () => {
    assert.strictEqual(convertHtmlToMarkdown('<span class="x">hello</span>'), "hello");
  });
  test("handles nested inline elements", () => {
    assert.strictEqual(
      convertHtmlToMarkdown("<strong><em>bold italic</em></strong>"),
      "***bold italic***"
    );
  });
  test("handles link with bold text inside", () => {
    assert.strictEqual(
      convertHtmlToMarkdown('<a href="https://example.com"><strong>click here</strong></a>'),
      "[**click here**](https://example.com)"
    );
  });
  test("handles heading with link inside", () => {
    assert.strictEqual(
      convertHtmlToMarkdown('<h2><a href="https://example.com">Title</a></h2>'),
      "## [Title](https://example.com)"
    );
  });
  test("collapses excessive newlines", () => {
    const html = "<p>one</p><p></p><p></p><p>two</p>";
    const result = convertHtmlToMarkdown(html);
    assert.ok(!result.includes("\n\n\n"), "should not have 3+ consecutive newlines");
    assert.ok(result.includes("one"));
    assert.ok(result.includes("two"));
  });
  test("handles a realistic web page snippet", () => {
    const html = `
			<h1>Getting Started</h1>
			<p>Welcome to <strong>VS Code</strong>. Visit <a href="https://code.visualstudio.com">the website</a> for more info.</p>
			<ul>
				<li>Fast</li>
				<li>Extensible</li>
			</ul>
		`;
    const md = convertHtmlToMarkdown(html);
    assert.ok(md.includes("# Getting Started"));
    assert.ok(md.includes("**VS Code**"));
    assert.ok(md.includes("[the website](https://code.visualstudio.com)"));
    assert.ok(md.includes("- Fast"));
    assert.ok(md.includes("- Extensible"));
  });
  test("decodes numeric HTML entities", () => {
    assert.strictEqual(convertHtmlToMarkdown("&#60;tag&#62;"), "<tag>");
    assert.strictEqual(convertHtmlToMarkdown("&#x3C;tag&#x3E;"), "<tag>");
    assert.strictEqual(convertHtmlToMarkdown("&#8212;"), "\u2014");
    assert.strictEqual(convertHtmlToMarkdown("&#x2014;"), "\u2014");
  });
  test("falls back to tag-stripping for very large input", () => {
    const large = "<b>" + "x".repeat(200001) + "</b>";
    const result = convertHtmlToMarkdown(large);
    assert.ok(!result.includes("**"));
    assert.ok(!result.includes("<b>"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxicm93c2VyXFxodG1sVG9NYXJrZG93bi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGNvbnZlcnRIdG1sVG9NYXJrZG93biB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvaHRtbFRvTWFya2Rvd24uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ2h0bWxUb01hcmtkb3duJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdjb252ZXJ0cyBoZWFkaW5ncycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udmVydEh0bWxUb01hcmtkb3duKCc8aDE+VGl0bGU8L2gxPicpLCAnIyBUaXRsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxoMj5TdWJ0aXRsZTwvaDI+JyksICcjIyBTdWJ0aXRsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxoMz5TZWN0aW9uPC9oMz4nKSwgJyMjIyBTZWN0aW9uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnZlcnRIdG1sVG9NYXJrZG93bignPGg0PlN1Yi1zZWN0aW9uPC9oND4nKSwgJyMjIyMgU3ViLXNlY3Rpb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udmVydEh0bWxUb01hcmtkb3duKCc8aDU+TWlub3I8L2g1PicpLCAnIyMjIyMgTWlub3InKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udmVydEh0bWxUb01hcmtkb3duKCc8aDY+U21hbGxlc3Q8L2g2PicpLCAnIyMjIyMjIFNtYWxsZXN0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnZlcnRzIGxpbmtzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGNvbnZlcnRIdG1sVG9NYXJrZG93bignPGEgaHJlZj1cImh0dHBzOi8vZXhhbXBsZS5jb21cIj5FeGFtcGxlPC9hPicpLFxuXHRcdFx0J1tFeGFtcGxlXShodHRwczovL2V4YW1wbGUuY29tKSdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcHMgZGFuZ2Vyb3VzIHNjaGVtZXMgZnJvbSBsaW5rcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxhIGhyZWY9XCJqYXZhc2NyaXB0OmFsZXJ0KDEpXCI+Y2xpY2s8L2E+JyksXG5cdFx0XHQnY2xpY2snXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxhIGhyZWY9XCJ2YnNjcmlwdDpydW5cIj5ydW48L2E+JyksXG5cdFx0XHQncnVuJ1xuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Y29udmVydEh0bWxUb01hcmtkb3duKCc8YSBocmVmPVwiZGF0YTp0ZXh0L2h0bWwsPGgxPmhpPC9oMT5cIj5kYXRhPC9hPicpLFxuXHRcdFx0J2RhdGEnXG5cdFx0KTtcblx0fSk7XG5cblx0c3VpdGUoJ2ludGVybmFsIGxpbmtzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2NvbnZlcnRzIHRhcmdldHMgdGhhdCBvbmx5IHJlc29sdmUgaW4gdGhpcyB3aW5kb3cgdG8gaW5saW5lIGNvZGUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Y29udmVydEh0bWxUb01hcmtkb3duKCc8YSBocmVmPVwidnNjb2RlLWZpbGU6Ly92c2NvZGUtYXBwL2M6L1VzZXJzL3VzZXIvQXBwRGF0YS9Mb2NhbC9Qcm9ncmFtcy9NaWNyb3NvZnQlMjBWUyUyMENvZGUvcmVzb3VyY2VzL2FwcC9vdXQvdnMvY29kZS9lbGVjdHJvbi1icm93c2VyL3dvcmtiZW5jaC93b3JrYmVuY2guaHRtbFwiPmZvby1iYXIubWQ8L2E+JyksXG5cdFx0XHRcdFx0Y29udmVydEh0bWxUb01hcmtkb3duKCc8YSBocmVmPVwiZmlsZTovLy9ob21lL3VzZXIvcHJvamVjdC9EZWZhdWx0TWVzaEludGVycG9sYXRvci5qYXZhIzQ2LDYyXCI+bXg6dGV4dDwvYT4nKSxcblx0XHRcdFx0XHRjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxhIGhyZWY9XCJjb2RlLW9zczovL2ZpbGUvYzovcmVwby9zcmMvY29uZmlnLnRzXCI+c3JjL2NvbmZpZy50czwvYT4nKSxcblx0XHRcdFx0XHRjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxhIGhyZWY9XCJodHRwOi8vX3ZzY29kZWNvbnRlbnRyZWZfLzBcIj5pbmRleC50czwvYT4nKSxcblx0XHRcdFx0XHQvLyBUaGUgYWdlbnQgaG9zdCBwcm9tcHQgYXNrcyBtb2RlbHMgZm9yIGJhcmUgYWJzb2x1dGUgcGF0aHMuXG5cdFx0XHRcdFx0Y29udmVydEh0bWxUb01hcmtkb3duKCc8YSBocmVmPVwiL1VzZXJzL21lL3JlcG8vc3JjL2EudHNcIj5hLnRzPC9hPicpLFxuXHRcdFx0XHRcdGNvbnZlcnRIdG1sVG9NYXJrZG93bignPGEgaHJlZj1cImNvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5maWxlcy5zYXZlXCI+U2F2ZTwvYT4nKSxcblx0XHRcdFx0XHRjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxpbWcgc3JjPVwiL1VzZXJzL21lL3Nob3QucG5nXCIgYWx0PVwic2NyZWVuc2hvdFwiPicpLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbJ2Bmb28tYmFyLm1kYCcsICdgbXg6dGV4dGAnLCAnYHNyYy9jb25maWcudHNgJywgJ2BpbmRleC50c2AnLCAnYGEudHNgJywgJ2BTYXZlYCcsICdgc2NyZWVuc2hvdGAnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVmZXJzIGRhdGEtaHJlZiBvbmx5IHdoZW4gaHJlZiBjYW5ub3QgYmUgc2hhcmVkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0W1xuXHRcdFx0XHRcdGNvbnZlcnRIdG1sVG9NYXJrZG93bignPGEgaHJlZj1cIlwiIGRhdGEtaHJlZj1cImZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QvYS50c1wiPmEudHM8L2E+JyksXG5cdFx0XHRcdFx0Y29udmVydEh0bWxUb01hcmtkb3duKCc8YSBocmVmPVwidnNjb2RlLWZpbGU6Ly92c2NvZGUtYXBwL3Jlc291cmNlcy9hcHAvb3V0L3dvcmtiZW5jaC5odG1sXCIgZGF0YS1ocmVmPVwiaHR0cHM6Ly9leGFtcGxlLmNvbVwiPkV4YW1wbGU8L2E+JyksXG5cdFx0XHRcdFx0Ly8gQSBwYWdlIG9mIHVua25vd24gb3JpZ2luIG11c3Qgbm90IHJlZGlyZWN0IGEgbGluayBpdCBkaXNwbGF5ZWQgYXMgc2FmZS5cblx0XHRcdFx0XHRjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxhIGhyZWY9XCJodHRwczovL3JlYWwuZXhhbXBsZVwiIGRhdGEtaHJlZj1cImh0dHBzOi8vZXZpbC5leGFtcGxlXCI+ZG9jczwvYT4nKSxcblx0XHRcdFx0XSxcblx0XHRcdFx0WydgYS50c2AnLCAnW0V4YW1wbGVdKGh0dHBzOi8vZXhhbXBsZS5jb20pJywgJ1tkb2NzXShodHRwczovL3JlYWwuZXhhbXBsZSknXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIHRoZSBwbGFpbiBsYWJlbCB3aGVuIHRoZSB0YXJnZXQgY2Fubm90IGJlIHNoYXJlZCcsICgpID0+IHtcblx0XHRcdC8vIEVtcGhhc2lzIG1hcmtlcnMgd291bGQgYmUgcmVhZCBsaXRlcmFsbHkgaW5zaWRlIGEgY29kZSBzcGFuLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0W1xuXHRcdFx0XHRcdGNvbnZlcnRIdG1sVG9NYXJrZG93bignPGEgaHJlZj1cImZpbGU6Ly8veFwiPjxzdHJvbmc+Rm9vPC9zdHJvbmc+PC9hPicpLFxuXHRcdFx0XHRcdGNvbnZlcnRIdG1sVG9NYXJrZG93bignPGEgaHJlZj1cImh0dHBzOi8vZXhhbXBsZS5jb21cIj48c3Ryb25nPktlcHQ8L3N0cm9uZz48L2E+JyksXG5cdFx0XHRcdF0sXG5cdFx0XHRcdFsnYEZvb2AnLCAnWyoqS2VwdCoqXShodHRwczovL2V4YW1wbGUuY29tKSddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2tlZXBzIGludGVybmFsIGxpbmtzIGluc2lkZSBzdXJyb3VuZGluZyBtYXJrZG93biBmb3JtYXR0aW5nJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxwPlRoaXMgaXMgPHN0cm9uZz5pbmhlcml0ZWQ8L3N0cm9uZz4gZnJvbSB0aGUgPGEgaHJlZj1cInZzY29kZS1maWxlOi8vdnNjb2RlLWFwcC9yZXNvdXJjZXMvYXBwL291dC93b3JrYmVuY2guaHRtbFwiPkZvb0JhcjwvYT4gY2xhc3MuPC9wPicpLFxuXHRcdFx0XHQnVGhpcyBpcyAqKmluaGVyaXRlZCoqIGZyb20gdGhlIGBGb29CYXJgIGNsYXNzLidcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdrZWVwcyBkb2N1bWVudC1yZWxhdGl2ZSBsaW5rcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxhIGhyZWY9XCIjZGV0YWlsc1wiPmRldGFpbHM8L2E+JyksXG5cdFx0XHRcdFx0Y29udmVydEh0bWxUb01hcmtkb3duKCc8YSBocmVmPVwiLi4vQ09OVFJJQlVUSU5HLm1kXCI+Z3VpZGU8L2E+JyksXG5cdFx0XHRcdF0sXG5cdFx0XHRcdFsnW2RldGFpbHNdKCNkZXRhaWxzKScsICdbZ3VpZGVdKC4uL0NPTlRSSUJVVElORy5tZCknXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnZlcnRzIGJvbGQgYW5kIGl0YWxpYycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udmVydEh0bWxUb01hcmtkb3duKCc8c3Ryb25nPmJvbGQ8L3N0cm9uZz4nKSwgJyoqYm9sZCoqJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnZlcnRIdG1sVG9NYXJrZG93bignPGI+Ym9sZDwvYj4nKSwgJyoqYm9sZCoqJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnZlcnRIdG1sVG9NYXJrZG93bignPGVtPml0YWxpYzwvZW0+JyksICcqaXRhbGljKicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxpPml0YWxpYzwvaT4nKSwgJyppdGFsaWMqJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnZlcnRzIGlubGluZSBjb2RlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxjb2RlPmZvbygpPC9jb2RlPicpLCAnYGZvbygpYCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgSFRNTCB0YWcgbmFtZXMgaW5zaWRlIGlubGluZSBjb2RlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxjb2RlPiZsdDthc2lkZSZndDs8L2NvZGU+JyksICdgPGFzaWRlPmAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udmVydEh0bWxUb01hcmtkb3duKCc8Y29kZT4mbHQ7ZGV0YWlscyZndDs8L2NvZGU+JyksICdgPGRldGFpbHM+YCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgSFRNTCB0YWcgbmFtZXMgaW5zaWRlIGlubGluZSBjb2RlIHdpdGggbmVzdGVkIHRhZ3MnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Y29udmVydEh0bWxUb01hcmtkb3duKCc8Y29kZT48c3BhbiBjbGFzcz1cImhsXCI+Jmx0O2FzaWRlJmd0Ozwvc3Bhbj48L2NvZGU+JyksXG5cdFx0XHQnYDxhc2lkZT5gJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBIVE1MIHRhZyBuYW1lcyBpbnNpZGUgY29kZSBibG9ja3MnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Y29udmVydEh0bWxUb01hcmtkb3duKCc8cHJlPjxjb2RlPiZsdDthc2lkZSZndDs8L2NvZGU+PC9wcmU+JyksXG5cdFx0XHQnYGBgXFxuPGFzaWRlPlxcbmBgYCdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb252ZXJ0cyBjb2RlIGJsb2NrcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxwcmU+PGNvZGU+Y29uc3QgeCA9IDE7PC9jb2RlPjwvcHJlPicpLFxuXHRcdFx0J2BgYFxcbmNvbnN0IHggPSAxO1xcbmBgYCdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb252ZXJ0cyBzeW50YXgtaGlnaGxpZ2h0ZWQgY29kZSBibG9ja3MgYnkgc3RyaXBwaW5nIGlubmVyIHRhZ3MnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Y29udmVydEh0bWxUb01hcmtkb3duKCc8cHJlPjxjb2RlPjxzcGFuIGNsYXNzPVwia3dcIj5jb25zdDwvc3Bhbj4geCA9IDxzcGFuIGNsYXNzPVwibnVtXCI+MTwvc3Bhbj47PC9jb2RlPjwvcHJlPicpLFxuXHRcdFx0J2BgYFxcbmNvbnN0IHggPSAxO1xcbmBgYCdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgaW5kZW50YXRpb24gaW4gY29kZSBibG9ja3MnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Y29udmVydEh0bWxUb01hcmtkb3duKCc8cHJlPjxjb2RlPmZ1bmN0aW9uIGZvbygpIHtcXG4gIHJldHVybiAxO1xcbn08L2NvZGU+PC9wcmU+JyksXG5cdFx0XHQnYGBgXFxuZnVuY3Rpb24gZm9vKCkge1xcbiAgcmV0dXJuIDE7XFxufVxcbmBgYCdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb252ZXJ0cyB1bm9yZGVyZWQgbGlzdHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaHRtbCA9ICc8dWw+PGxpPm9uZTwvbGk+PGxpPnR3bzwvbGk+PGxpPnRocmVlPC9saT48L3VsPic7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnZlcnRIdG1sVG9NYXJrZG93bihodG1sKSwgJy0gb25lXFxuLSB0d29cXG4tIHRocmVlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnZlcnRzIG9yZGVyZWQgbGlzdHMgdG8gbnVtYmVyZWQgaXRlbXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaHRtbCA9ICc8b2w+PGxpPmZpcnN0PC9saT48bGk+c2Vjb25kPC9saT48L29sPic7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnZlcnRIdG1sVG9NYXJrZG93bihodG1sKSwgJzEuIGZpcnN0XFxuMi4gc2Vjb25kJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnZlcnRzIGxpbmUgYnJlYWtzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb252ZXJ0SHRtbFRvTWFya2Rvd24oJ2hlbGxvPGJyPndvcmxkJyksICdoZWxsb1xcbndvcmxkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnZlcnRIdG1sVG9NYXJrZG93bignaGVsbG88YnIvPndvcmxkJyksICdoZWxsb1xcbndvcmxkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnZlcnRzIGhvcml6b250YWwgcnVsZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnZlcnRIdG1sVG9NYXJrZG93bignYWJvdmU8aHI+YmVsb3cnKSwgJ2Fib3ZlXFxuLS0tXFxuYmVsb3cnKTtcblx0fSk7XG5cblx0dGVzdCgnY29udmVydHMgc3RyaWtldGhyb3VnaCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udmVydEh0bWxUb01hcmtkb3duKCc8ZGVsPnJlbW92ZWQ8L2RlbD4nKSwgJ35+cmVtb3ZlZH5+Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnZlcnRIdG1sVG9NYXJrZG93bignPHM+c3RydWNrPC9zPicpLCAnfn5zdHJ1Y2t+ficpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb252ZXJ0cyBibG9ja3F1b3RlcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxibG9ja3F1b3RlPnF1b3RlZCB0ZXh0PC9ibG9ja3F1b3RlPicpLFxuXHRcdFx0Jz4gcXVvdGVkIHRleHQnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY29udmVydHMgaW1hZ2VzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGNvbnZlcnRIdG1sVG9NYXJrZG93bignPGltZyBzcmM9XCJodHRwczovL2V4YW1wbGUuY29tL2ltZy5wbmdcIiBhbHQ9XCJwaG90b1wiPicpLFxuXHRcdFx0JyFbcGhvdG9dKGh0dHBzOi8vZXhhbXBsZS5jb20vaW1nLnBuZyknXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVjb2RlcyBIVE1MIGVudGl0aWVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb252ZXJ0SHRtbFRvTWFya2Rvd24oJyZhbXA7ICZsdDsgJmd0OyAmcXVvdDsgJiMzOTsnKSwgJyYgPCA+IFwiIFxcJycpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcHMgdW5rbm93biB0YWdzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb252ZXJ0SHRtbFRvTWFya2Rvd24oJzxzcGFuIGNsYXNzPVwieFwiPmhlbGxvPC9zcGFuPicpLCAnaGVsbG8nKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBuZXN0ZWQgaW5saW5lIGVsZW1lbnRzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGNvbnZlcnRIdG1sVG9NYXJrZG93bignPHN0cm9uZz48ZW0+Ym9sZCBpdGFsaWM8L2VtPjwvc3Ryb25nPicpLFxuXHRcdFx0JyoqKmJvbGQgaXRhbGljKioqJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgbGluayB3aXRoIGJvbGQgdGV4dCBpbnNpZGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Y29udmVydEh0bWxUb01hcmtkb3duKCc8YSBocmVmPVwiaHR0cHM6Ly9leGFtcGxlLmNvbVwiPjxzdHJvbmc+Y2xpY2sgaGVyZTwvc3Ryb25nPjwvYT4nKSxcblx0XHRcdCdbKipjbGljayBoZXJlKipdKGh0dHBzOi8vZXhhbXBsZS5jb20pJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgaGVhZGluZyB3aXRoIGxpbmsgaW5zaWRlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGNvbnZlcnRIdG1sVG9NYXJrZG93bignPGgyPjxhIGhyZWY9XCJodHRwczovL2V4YW1wbGUuY29tXCI+VGl0bGU8L2E+PC9oMj4nKSxcblx0XHRcdCcjIyBbVGl0bGVdKGh0dHBzOi8vZXhhbXBsZS5jb20pJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbGxhcHNlcyBleGNlc3NpdmUgbmV3bGluZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaHRtbCA9ICc8cD5vbmU8L3A+PHA+PC9wPjxwPjwvcD48cD50d288L3A+Jztcblx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0SHRtbFRvTWFya2Rvd24oaHRtbCk7XG5cdFx0YXNzZXJ0Lm9rKCFyZXN1bHQuaW5jbHVkZXMoJ1xcblxcblxcbicpLCAnc2hvdWxkIG5vdCBoYXZlIDMrIGNvbnNlY3V0aXZlIG5ld2xpbmVzJyk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnb25lJykpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ3R3bycpKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBhIHJlYWxpc3RpYyB3ZWIgcGFnZSBzbmlwcGV0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGh0bWwgPSBgXG5cdFx0XHQ8aDE+R2V0dGluZyBTdGFydGVkPC9oMT5cblx0XHRcdDxwPldlbGNvbWUgdG8gPHN0cm9uZz5WUyBDb2RlPC9zdHJvbmc+LiBWaXNpdCA8YSBocmVmPVwiaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb21cIj50aGUgd2Vic2l0ZTwvYT4gZm9yIG1vcmUgaW5mby48L3A+XG5cdFx0XHQ8dWw+XG5cdFx0XHRcdDxsaT5GYXN0PC9saT5cblx0XHRcdFx0PGxpPkV4dGVuc2libGU8L2xpPlxuXHRcdFx0PC91bD5cblx0XHRgO1xuXHRcdGNvbnN0IG1kID0gY29udmVydEh0bWxUb01hcmtkb3duKGh0bWwpO1xuXHRcdGFzc2VydC5vayhtZC5pbmNsdWRlcygnIyBHZXR0aW5nIFN0YXJ0ZWQnKSk7XG5cdFx0YXNzZXJ0Lm9rKG1kLmluY2x1ZGVzKCcqKlZTIENvZGUqKicpKTtcblx0XHRhc3NlcnQub2sobWQuaW5jbHVkZXMoJ1t0aGUgd2Vic2l0ZV0oaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20pJykpO1xuXHRcdGFzc2VydC5vayhtZC5pbmNsdWRlcygnLSBGYXN0JykpO1xuXHRcdGFzc2VydC5vayhtZC5pbmNsdWRlcygnLSBFeHRlbnNpYmxlJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWNvZGVzIG51bWVyaWMgSFRNTCBlbnRpdGllcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udmVydEh0bWxUb01hcmtkb3duKCcmIzYwO3RhZyYjNjI7JyksICc8dGFnPicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb252ZXJ0SHRtbFRvTWFya2Rvd24oJyYjeDNDO3RhZyYjeDNFOycpLCAnPHRhZz4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udmVydEh0bWxUb01hcmtkb3duKCcmIzgyMTI7JyksICdcdTIwMTQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udmVydEh0bWxUb01hcmtkb3duKCcmI3gyMDE0OycpLCAnXHUyMDE0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gdGFnLXN0cmlwcGluZyBmb3IgdmVyeSBsYXJnZSBpbnB1dCcsICgpID0+IHtcblx0XHRjb25zdCBsYXJnZSA9ICc8Yj4nICsgJ3gnLnJlcGVhdCgyMDBfMDAxKSArICc8L2I+Jztcblx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0SHRtbFRvTWFya2Rvd24obGFyZ2UpO1xuXHRcdC8vIFNob3VsZCBzdHJpcCB0YWdzIGJ1dCBOT1QgYXBwbHkgbWFya2Rvd24gYm9sZCBmb3JtYXR0aW5nXG5cdFx0YXNzZXJ0Lm9rKCFyZXN1bHQuaW5jbHVkZXMoJyoqJykpO1xuXHRcdGFzc2VydC5vayghcmVzdWx0LmluY2x1ZGVzKCc8Yj4nKSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGlu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
