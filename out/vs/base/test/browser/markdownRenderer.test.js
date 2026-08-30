import assert from "assert";
import { fillInIncompleteTokens, renderMarkdown, renderAsPlaintext } from "../../browser/markdownRenderer.js";
import { MarkdownString } from "../../common/htmlContent.js";
import * as marked from "../../common/marked/marked.js";
import { parse } from "../../common/marshalling.js";
import { isWeb } from "../../common/platform.js";
import { URI } from "../../common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../common/utils.js";
function strToNode(str) {
  return new DOMParser().parseFromString(str, "text/html").body.firstChild;
}
function assertNodeEquals(actualNode, expectedHtml) {
  const expectedNode = strToNode(expectedHtml);
  assert.ok(
    actualNode.isEqualNode(expectedNode),
    `Expected: ${expectedNode.outerHTML}
Actual: ${actualNode.outerHTML}`
  );
}
suite("MarkdownRenderer", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  suite("Sanitization", () => {
    test("Should not render images with unknown schemes", () => {
      const markdown = { value: `![image](no-such://example.com/cat.gif)` };
      const result = store.add(renderMarkdown(markdown)).element;
      assert.strictEqual(result.innerHTML, '<p><img alt="image"></p>');
    });
    test("Strips links with disallowed schemes (default config)", () => {
      const markdown = { value: `Read [](vscode-agent-host://my-host/path/to/foo.ts?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0)` };
      const result = store.add(renderMarkdown(markdown)).element;
      assert.strictEqual(result.querySelector("a"), null);
    });
    test("Preserves link when scheme is allowed via allowedLinkSchemes.augment", () => {
      const markdown = { value: `Read [](vscode-agent-host://my-host/path/to/foo.ts?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0)` };
      const result = store.add(renderMarkdown(markdown, {
        sanitizerConfig: {
          allowedLinkSchemes: { augment: ["vscode-agent-host"] }
        }
      })).element;
      const anchor = result.querySelector("a");
      assert.ok(anchor, "expected <a> to be preserved when scheme is allowed");
      assert.strictEqual(anchor.dataset.href, "vscode-agent-host://my-host/path/to/foo.ts?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0");
    });
    test("Transforms parsed link targets without changing labels, titles, or code", () => {
      const markdown = { value: '`[same](file:///same)` [a[b].ts](file:///same "file:///same") ![image](file:///same|width=10,height=20)' };
      const result = store.add(renderMarkdown(markdown, {
        transformUri: (href) => href === "file:///same" ? "https://example.com/a.ts" : href
      })).element;
      const anchor = result.querySelector("a");
      assert.deepStrictEqual(
        {
          anchorCount: result.querySelectorAll("a").length,
          text: anchor?.textContent,
          href: anchor?.dataset.href,
          title: anchor?.title,
          image: result.querySelector("img")?.src,
          imageWidth: result.querySelector("img")?.getAttribute("width"),
          imageHeight: result.querySelector("img")?.getAttribute("height")
        },
        {
          anchorCount: 1,
          text: "a[b].ts",
          href: "https://example.com/a.ts",
          title: "file:///same",
          image: "https://example.com/a.ts",
          imageWidth: "10",
          imageHeight: "20"
        }
      );
    });
  });
  suite("Images", () => {
    test("image rendering conforms to default", () => {
      const markdown = { value: `![image](http://example.com/cat.gif 'caption')` };
      const result = store.add(renderMarkdown(markdown)).element;
      assertNodeEquals(result, '<div><p><img title="caption" alt="image" src="http://example.com/cat.gif"></p></div>');
    });
    test("image rendering conforms to default without title", () => {
      const markdown = { value: `![image](http://example.com/cat.gif)` };
      const result = store.add(renderMarkdown(markdown)).element;
      assertNodeEquals(result, '<div><p><img alt="image" src="http://example.com/cat.gif"></p></div>');
    });
    test("image width from title params", () => {
      const result = store.add(renderMarkdown({ value: `![image](http://example.com/cat.gif|width=100px 'caption')` })).element;
      assertNodeEquals(result, `<div><p><img width="100" title="caption" alt="image" src="http://example.com/cat.gif"></p></div>`);
    });
    test("image height from title params", () => {
      const result = store.add(renderMarkdown({ value: `![image](http://example.com/cat.gif|height=100 'caption')` })).element;
      assertNodeEquals(result, `<div><p><img height="100" title="caption" alt="image" src="http://example.com/cat.gif"></p></div>`);
    });
    test("image width and height from title params", () => {
      const result = store.add(renderMarkdown({ value: `![image](http://example.com/cat.gif|height=200,width=100 'caption')` })).element;
      assertNodeEquals(result, `<div><p><img height="200" width="100" title="caption" alt="image" src="http://example.com/cat.gif"></p></div>`);
    });
    test("image with file uri should render as same origin uri", () => {
      if (isWeb) {
        return;
      }
      const result = store.add(renderMarkdown({ value: `![image](file:///images/cat.gif)` })).element;
      assertNodeEquals(result, '<div><p><img src="vscode-file://vscode-app/images/cat.gif" alt="image"></p></div>');
    });
  });
  suite("Code block renderer", () => {
    const simpleCodeBlockRenderer = (lang, code) => {
      const element = document.createElement("code");
      element.textContent = code;
      return Promise.resolve(element);
    };
    test("asyncRenderCallback should be invoked for code blocks", () => {
      const markdown = { value: "```js\n1 + 1;\n```" };
      return new Promise((resolve) => {
        store.add(renderMarkdown(markdown, {
          asyncRenderCallback: resolve,
          codeBlockRenderer: simpleCodeBlockRenderer
        }));
      });
    });
    test("asyncRenderCallback should not be invoked if result is immediately disposed", () => {
      const markdown = { value: "```js\n1 + 1;\n```" };
      return new Promise((resolve, reject) => {
        const result = renderMarkdown(markdown, {
          asyncRenderCallback: reject,
          codeBlockRenderer: simpleCodeBlockRenderer
        });
        result.dispose();
        setTimeout(resolve, 10);
      });
    });
    test("asyncRenderCallback should not be invoked if dispose is called before code block is rendered", () => {
      const markdown = { value: "```js\n1 + 1;\n```" };
      return new Promise((resolve, reject) => {
        let resolveCodeBlockRendering;
        const result = renderMarkdown(markdown, {
          asyncRenderCallback: reject,
          codeBlockRenderer: () => {
            return new Promise((resolve2) => {
              resolveCodeBlockRendering = resolve2;
            });
          }
        });
        setTimeout(() => {
          result.dispose();
          resolveCodeBlockRendering(document.createElement("code"));
          setTimeout(resolve, 10);
        }, 10);
      });
    });
    test("Code blocks should use leading language id (#157793)", async () => {
      const markdown = { value: "```js some other stuff\n1 + 1;\n```" };
      const lang = await new Promise((resolve) => {
        store.add(renderMarkdown(markdown, {
          codeBlockRenderer: async (lang2, value) => {
            resolve(lang2);
            return simpleCodeBlockRenderer(lang2, value);
          }
        }));
      });
      assert.strictEqual(lang, "js");
    });
  });
  suite("ThemeIcons Support On", () => {
    test("render appendText", () => {
      const mds = new MarkdownString(void 0, { supportThemeIcons: true });
      mds.appendText("$(zap) $(not a theme icon) $(add)");
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p>$(zap)&nbsp;$(not&nbsp;a&nbsp;theme&nbsp;icon)&nbsp;$(add)</p>`);
    });
    test("render appendMarkdown", () => {
      const mds = new MarkdownString(void 0, { supportThemeIcons: true });
      mds.appendMarkdown("$(zap) $(not a theme icon) $(add)");
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p><span class="codicon codicon-zap"></span> $(not a theme icon) <span class="codicon codicon-add"></span></p>`);
    });
    test("render appendMarkdown with escaped icon", () => {
      const mds = new MarkdownString(void 0, { supportThemeIcons: true });
      mds.appendMarkdown("\\$(zap) $(not a theme icon) $(add)");
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p>$(zap) $(not a theme icon) <span class="codicon codicon-add"></span></p>`);
    });
    test("render icon in link", () => {
      const mds = new MarkdownString(void 0, { supportThemeIcons: true });
      mds.appendMarkdown(`[$(zap)-link](#link)`);
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p><a href="" title="#link" draggable="false" data-href="#link"><span class="codicon codicon-zap"></span>-link</a></p>`);
    });
    test("render icon in table", () => {
      const mds = new MarkdownString(void 0, { supportThemeIcons: true });
      mds.appendMarkdown(`
| text   | text                 |
|--------|----------------------|
| $(zap) | [$(zap)-link](#link) |`);
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<table>
<thead>
<tr>
<th>text</th>
<th>text</th>
</tr>
</thead>
<tbody><tr>
<td><span class="codicon codicon-zap"></span></td>
<td><a href="" title="#link" draggable="false" data-href="#link"><span class="codicon codicon-zap"></span>-link</a></td>
</tr>
</tbody></table>
`);
    });
    test("render icon in <a> without href (#152170)", () => {
      const mds = new MarkdownString(void 0, { supportThemeIcons: true, supportHtml: true });
      mds.appendMarkdown(`<a>$(sync)</a>`);
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p><span class="codicon codicon-sync"></span></p>`);
    });
  });
  suite("ThemeIcons Support Off", () => {
    test("render appendText", () => {
      const mds = new MarkdownString(void 0, { supportThemeIcons: false });
      mds.appendText("$(zap) $(not a theme icon) $(add)");
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p>$(zap)&nbsp;$(not&nbsp;a&nbsp;theme&nbsp;icon)&nbsp;$(add)</p>`);
    });
    test("render appendMarkdown with escaped icon", () => {
      const mds = new MarkdownString(void 0, { supportThemeIcons: false });
      mds.appendMarkdown("\\$(zap) $(not a theme icon) $(add)");
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p>$(zap) $(not a theme icon) $(add)</p>`);
    });
  });
  suite("Alerts", () => {
    test("Should render alert with data-severity attribute and icon", () => {
      const markdown = new MarkdownString("> [!NOTE]\n> This is a note alert", { supportAlertSyntax: true });
      const result = store.add(renderMarkdown(markdown)).element;
      const blockquote = result.querySelector('blockquote[data-severity="note"]');
      assert.ok(blockquote, 'Should have blockquote with data-severity="note"');
      assert.ok(result.innerHTML.includes("This is a note alert"), "Should contain alert text");
      assert.ok(result.innerHTML.includes("codicon-info"), "Should contain info icon");
    });
    test("Should render regular blockquote when supportAlertSyntax is disabled", () => {
      const markdown = new MarkdownString("> [!NOTE]\n> This should be a regular blockquote");
      const result = store.add(renderMarkdown(markdown)).element;
      const blockquote = result.querySelector("blockquote");
      assert.ok(blockquote, "Should have blockquote");
      assert.strictEqual(blockquote?.getAttribute("data-severity"), null, "Should not have data-severity attribute");
      assert.ok(result.innerHTML.includes("[!NOTE]"), "Should contain literal [!NOTE] text");
    });
    test("Should not transform blockquotes without alert syntax", () => {
      const markdown = new MarkdownString("> This is a regular blockquote", { supportAlertSyntax: true });
      const result = store.add(renderMarkdown(markdown)).element;
      const blockquote = result.querySelector("blockquote");
      assert.strictEqual(blockquote?.getAttribute("data-severity"), null, "Should not have data-severity attribute");
    });
  });
  test("npm Hover Run Script not working #90855", function() {
    const md = JSON.parse('{"value":"[Run Script](command:npm.runScriptFromHover?%7B%22documentUri%22%3A%7B%22%24mid%22%3A1%2C%22fsPath%22%3A%22c%3A%5C%5CUsers%5C%5Cjrieken%5C%5CCode%5C%5C_sample%5C%5Cfoo%5C%5Cpackage.json%22%2C%22_sep%22%3A1%2C%22external%22%3A%22file%3A%2F%2F%2Fc%253A%2FUsers%2Fjrieken%2FCode%2F_sample%2Ffoo%2Fpackage.json%22%2C%22path%22%3A%22%2Fc%3A%2FUsers%2Fjrieken%2FCode%2F_sample%2Ffoo%2Fpackage.json%22%2C%22scheme%22%3A%22file%22%7D%2C%22script%22%3A%22echo%22%7D \\"Run the script as a task\\")","supportThemeIcons":false,"isTrusted":true,"uris":{"__uri_e49443":{"$mid":1,"fsPath":"c:\\\\Users\\\\jrieken\\\\Code\\\\_sample\\\\foo\\\\package.json","_sep":1,"external":"file:///c%3A/Users/jrieken/Code/_sample/foo/package.json","path":"/c:/Users/jrieken/Code/_sample/foo/package.json","scheme":"file"},"command:npm.runScriptFromHover?%7B%22documentUri%22%3A%7B%22%24mid%22%3A1%2C%22fsPath%22%3A%22c%3A%5C%5CUsers%5C%5Cjrieken%5C%5CCode%5C%5C_sample%5C%5Cfoo%5C%5Cpackage.json%22%2C%22_sep%22%3A1%2C%22external%22%3A%22file%3A%2F%2F%2Fc%253A%2FUsers%2Fjrieken%2FCode%2F_sample%2Ffoo%2Fpackage.json%22%2C%22path%22%3A%22%2Fc%3A%2FUsers%2Fjrieken%2FCode%2F_sample%2Ffoo%2Fpackage.json%22%2C%22scheme%22%3A%22file%22%7D%2C%22script%22%3A%22echo%22%7D":{"$mid":1,"path":"npm.runScriptFromHover","scheme":"command","query":"{\\"documentUri\\":\\"__uri_e49443\\",\\"script\\":\\"echo\\"}"}}}');
    const element = store.add(renderMarkdown(md)).element;
    const anchor = element.querySelector("a");
    assert.ok(anchor);
    assert.ok(anchor.dataset["href"]);
    const uri = URI.parse(anchor.dataset["href"]);
    const data = parse(decodeURIComponent(uri.query));
    assert.ok(data);
    assert.strictEqual(data.script, "echo");
    assert.ok(data.documentUri.toString().startsWith("file:///c%3A/"));
  });
  test("Should not render command links by default", () => {
    const md = new MarkdownString(`[command1](command:doFoo) <a href="command:doFoo">command2</a>`, {
      supportHtml: true
    });
    const result = store.add(renderMarkdown(md)).element;
    assert.strictEqual(result.innerHTML, `<p>command1 command2</p>`);
  });
  test("Should render command links in trusted strings", () => {
    const md = new MarkdownString(`[command1](command:doFoo) <a href="command:doFoo">command2</a>`, {
      isTrusted: true,
      supportHtml: true
    });
    const result = store.add(renderMarkdown(md)).element;
    assert.strictEqual(result.innerHTML, `<p><a href="" title="" draggable="false" data-href="command:doFoo">command1</a> <a href="" data-href="command:doFoo">command2</a></p>`);
  });
  test("Should remove relative links if there is no base url", () => {
    const md = new MarkdownString(`[text](./foo) <a href="./bar">bar</a>`, {
      isTrusted: true,
      supportHtml: true
    });
    const result = store.add(renderMarkdown(md)).element;
    assert.strictEqual(result.innerHTML, `<p>text bar</p>`);
  });
  test("Should support relative links if baseurl is set", () => {
    const md = new MarkdownString(`[text](./foo) <a href="./bar">bar</a> <img src="cat.gif">`, {
      isTrusted: true,
      supportHtml: true
    });
    md.baseUri = URI.parse("https://example.com/path/");
    const result = store.add(renderMarkdown(md)).element;
    assert.strictEqual(result.innerHTML, `<p><a href="" title="./foo" draggable="false" data-href="https://example.com/path/foo">text</a> <a href="" data-href="https://example.com/path/bar">bar</a> <img src="https://example.com/path/cat.gif"></p>`);
  });
  suite("Copy-safe hrefs", () => {
    test("keeps the real href only for targets that resolve elsewhere", () => {
      const md = new MarkdownString(`[web](https://example.com/page) [mail](mailto:user@example.com) [run](command:doFoo) [file](file:///home/user/a.ts) [ref](http://_vscodecontentref_/0)`, { isTrusted: true });
      const result = store.add(renderMarkdown(md, { actionHandler: () => {
      } })).element;
      assert.deepStrictEqual(
        Array.from(result.querySelectorAll("a"), (a) => [a.getAttribute("href"), a.getAttribute("data-href"), a.getAttribute("draggable")]),
        [
          ["https://example.com/page", "https://example.com/page", "false"],
          ["mailto:user@example.com", "mailto:user@example.com", "false"],
          ["", "command:doFoo", "false"],
          ["", "file:///home/user/a.ts", "false"],
          ["", "http://_vscodecontentref_/0", "false"]
        ]
      );
    });
    test("leaves the href empty when nothing intercepts clicks", () => {
      const md = new MarkdownString(`[web](https://example.com/page)`, {});
      const anchor = store.add(renderMarkdown(md)).element.querySelector("a");
      assert.deepStrictEqual(
        [anchor.getAttribute("href"), anchor.getAttribute("data-href")],
        ["", "https://example.com/page"]
      );
    });
    test("keeps the resolved href for relative links against an https baseUri", () => {
      const md = new MarkdownString(`[text](./foo)`, { isTrusted: true });
      md.baseUri = URI.parse("https://example.com/path/");
      const anchor = store.add(renderMarkdown(md, { actionHandler: () => {
      } })).element.querySelector("a");
      assert.deepStrictEqual(
        [anchor.getAttribute("href"), anchor.getAttribute("data-href")],
        ["https://example.com/path/foo", "https://example.com/path/foo"]
      );
    });
  });
  test("Should use decoded file path as title for file:// links", () => {
    const fileUri = URI.file("/home/user/project/lib.d.ts");
    const md = new MarkdownString(`[log](${fileUri.toString()})`, {});
    const result = store.add(renderMarkdown(md)).element;
    const anchor = result.querySelector("a");
    assert.ok(anchor);
    assert.strictEqual(anchor.title, fileUri.fsPath);
  });
  test("Should include fragment in title for file:// links with line numbers", () => {
    const fileUri = URI.file("/home/user/project/lib.d.ts");
    const md = new MarkdownString(`[log](${fileUri.toString()}#L42)`, {});
    const result = store.add(renderMarkdown(md)).element;
    const anchor = result.querySelector("a");
    assert.ok(anchor);
    assert.strictEqual(anchor.title, `${fileUri.fsPath}#L42`);
  });
  test("Should not override explicit title for file:// links", () => {
    const fileUri = URI.file("/home/user/project/lib.d.ts");
    const md = new MarkdownString(`[log](${fileUri.toString()} "Go to definition")`, {});
    const result = store.add(renderMarkdown(md)).element;
    const anchor = result.querySelector("a");
    assert.ok(anchor);
    assert.strictEqual(anchor.title, "Go to definition");
  });
  suite("PlaintextMarkdownRender", () => {
    test("test code, blockquote, heading, list, listitem, paragraph, table, tablerow, tablecell, strong, em, br, del, text are rendered plaintext", () => {
      const markdown = { value: "`code`\n>quote\n# heading\n- list\n\ntable | table2\n--- | --- \none | two\n\n\nbo**ld**\n_italic_\n~~del~~\nsome text" };
      const expected = "code\nquote\nheading\nlist\n\ntable table2\none two\nbold\nitalic\ndel\nsome text";
      const result = renderAsPlaintext(markdown);
      assert.strictEqual(result, expected);
    });
    test("test html, hr, image, link are rendered plaintext", () => {
      const markdown = { value: "<div>html</div>\n\n---\n![image](imageLink)\n[text](textLink)" };
      const expected = "text";
      const result = renderAsPlaintext(markdown);
      assert.strictEqual(result, expected);
    });
    test(`Should not remove html inside of code blocks`, () => {
      const markdown = {
        value: [
          "```html",
          "<form>html</form>",
          "```"
        ].join("\n")
      };
      const expected = [
        "```",
        "<form>html</form>",
        "```"
      ].join("\n");
      const result = renderAsPlaintext(markdown, { includeCodeBlocksFences: true });
      assert.strictEqual(result, expected);
    });
    test("does not double-escape entities inside code spans", () => {
      assert.strictEqual(renderAsPlaintext({ value: "Run `tests & build`" }), "Run tests & build");
      assert.strictEqual(renderAsPlaintext({ value: "Use `<form>` tag" }), "Use <form> tag");
    });
  });
  suite("supportHtml", () => {
    test("supportHtml is disabled by default", () => {
      const mds = new MarkdownString(void 0, {});
      mds.appendMarkdown("a<b>b</b>c");
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p>abc</p>`);
    });
    test("Renders html when supportHtml=true", () => {
      const mds = new MarkdownString(void 0, { supportHtml: true });
      mds.appendMarkdown("a<b>b</b>c");
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p>a<b>b</b>c</p>`);
    });
    test("Should not include scripts even when supportHtml=true", () => {
      const mds = new MarkdownString(void 0, { supportHtml: true });
      mds.appendMarkdown('a<b onclick="alert(1)">b</b><script>alert(2)<\/script>c');
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p>a<b>b</b>c</p>`);
    });
    test("Should not render html appended as text", () => {
      const mds = new MarkdownString(void 0, { supportHtml: true });
      mds.appendText("a<b>b</b>c");
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p>a&lt;b&gt;b&lt;/b&gt;c</p>`);
    });
    test("Should render html images", () => {
      if (isWeb) {
        return;
      }
      const mds = new MarkdownString(void 0, { supportHtml: true });
      mds.appendMarkdown(`<img src="http://example.com/cat.gif">`);
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<img src="http://example.com/cat.gif">`);
    });
    test("Should render html images with file uri as same origin uri", () => {
      if (isWeb) {
        return;
      }
      const mds = new MarkdownString(void 0, { supportHtml: true });
      mds.appendMarkdown(`<img src="file:///images/cat.gif">`);
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<img src="vscode-file://vscode-app/images/cat.gif">`);
    });
    test("Should only allow checkbox inputs", () => {
      const mds = new MarkdownString(
        'text: <input type="text">\ncheckbox:<input type="checkbox">',
        { supportHtml: true }
      );
      const result = store.add(renderMarkdown(mds)).element;
      assert.strictEqual(result.innerHTML, `<p>text: 
checkbox:<input type="checkbox" disabled=""></p>`);
    });
  });
  suite("fillInIncompleteTokens", () => {
    function ignoreRaw(...tokenLists) {
      tokenLists.forEach((tokens) => {
        tokens.forEach((t) => t.raw = "");
      });
    }
    const completeTable = "| a | b |\n| --- | --- |";
    suite("table", () => {
      test("complete table", () => {
        const tokens = marked.marked.lexer(completeTable);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.equal(newTokens, tokens);
      });
      test("full header only", () => {
        const incompleteTable = "| a | b |";
        const tokens = marked.marked.lexer(incompleteTable);
        const completeTableTokens = marked.marked.lexer(completeTable);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, completeTableTokens);
      });
      test("full header only with trailing space", () => {
        const incompleteTable = "| a | b | ";
        const tokens = marked.marked.lexer(incompleteTable);
        const completeTableTokens = marked.marked.lexer(completeTable);
        const newTokens = fillInIncompleteTokens(tokens);
        if (newTokens) {
          ignoreRaw(newTokens, completeTableTokens);
        }
        assert.deepStrictEqual(newTokens, completeTableTokens);
      });
      test("incomplete header", () => {
        const incompleteTable = "| a | b";
        const tokens = marked.marked.lexer(incompleteTable);
        const completeTableTokens = marked.marked.lexer(completeTable);
        const newTokens = fillInIncompleteTokens(tokens);
        if (newTokens) {
          ignoreRaw(newTokens, completeTableTokens);
        }
        assert.deepStrictEqual(newTokens, completeTableTokens);
      });
      test("incomplete header one column", () => {
        const incompleteTable = "| a ";
        const tokens = marked.marked.lexer(incompleteTable);
        const completeTableTokens = marked.marked.lexer(incompleteTable + "|\n| --- |");
        const newTokens = fillInIncompleteTokens(tokens);
        if (newTokens) {
          ignoreRaw(newTokens, completeTableTokens);
        }
        assert.deepStrictEqual(newTokens, completeTableTokens);
      });
      test("full header with extras", () => {
        const incompleteTable = "| a **bold** | b _italics_ |";
        const tokens = marked.marked.lexer(incompleteTable);
        const completeTableTokens = marked.marked.lexer(incompleteTable + "\n| --- | --- |");
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, completeTableTokens);
      });
      test("full header with leading text", () => {
        const incompleteTable = "here is a table\n| a | b |";
        const tokens = marked.marked.lexer(incompleteTable);
        const completeTableTokens = marked.marked.lexer(incompleteTable + "\n| --- | --- |");
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, completeTableTokens);
      });
      test("full header with leading other stuff", () => {
        const incompleteTable = "```js\nconst xyz = 123;\n```\n| a | b |";
        const tokens = marked.marked.lexer(incompleteTable);
        const completeTableTokens = marked.marked.lexer(incompleteTable + "\n| --- | --- |");
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, completeTableTokens);
      });
      test("full header with incomplete separator", () => {
        const incompleteTable = "| a | b |\n| ---";
        const tokens = marked.marked.lexer(incompleteTable);
        const completeTableTokens = marked.marked.lexer(completeTable);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, completeTableTokens);
      });
      test("full header with incomplete separator 2", () => {
        const incompleteTable = "| a | b |\n| --- |";
        const tokens = marked.marked.lexer(incompleteTable);
        const completeTableTokens = marked.marked.lexer(completeTable);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, completeTableTokens);
      });
      test("full header with incomplete separator 3", () => {
        const incompleteTable = "| a | b |\n|";
        const tokens = marked.marked.lexer(incompleteTable);
        const completeTableTokens = marked.marked.lexer(completeTable);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, completeTableTokens);
      });
      test("not a table", () => {
        const incompleteTable = "| a | b |\nsome text";
        const tokens = marked.marked.lexer(incompleteTable);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
      test("not a table 2", () => {
        const incompleteTable = "| a | b |\n| --- |\nsome text";
        const tokens = marked.marked.lexer(incompleteTable);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
    });
    function simpleMarkdownTestSuite(name, delimiter) {
      test(`incomplete ${name}`, () => {
        const incomplete = `${delimiter}code`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + delimiter);
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test(`complete ${name}`, () => {
        const text = `leading text ${delimiter}code${delimiter} trailing text`;
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
      test(`${name} with leading text`, () => {
        const incomplete = `some text and ${delimiter}some code`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + delimiter);
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test(`${name} with trailing space`, () => {
        const incomplete = `some text and ${delimiter}some code `;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete.trimEnd() + delimiter);
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test(`single loose "${delimiter}"`, () => {
        const text = `some text and ${delimiter}by itself
more text here`;
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
      test(`incomplete ${name} after newline`, () => {
        const text = `some text
more text here and ${delimiter}text`;
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(text + delimiter);
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test(`incomplete after complete ${name}`, () => {
        const text = `leading text ${delimiter}code${delimiter} trailing text and ${delimiter}another`;
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(text + delimiter);
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test(`incomplete ${name} in list`, () => {
        const text = `- list item one
- list item two and ${delimiter}text`;
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(text + delimiter);
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test(`incomplete ${name} in asterisk list`, () => {
        const text = `* list item one
* list item two and ${delimiter}text`;
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(text + delimiter);
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test(`incomplete ${name} in numbered list`, () => {
        const text = `1. list item one
2. list item two and ${delimiter}text`;
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(text + delimiter);
        assert.deepStrictEqual(newTokens, completeTokens);
      });
    }
    suite("list", () => {
      test("list with complete codeblock", () => {
        const list = `-
	\`\`\`js
	let x = 1;
	\`\`\`
- list item two
`;
        const tokens = marked.marked.lexer(list);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
      test.skip("list with incomplete codeblock", () => {
        const incomplete = `- list item one

	\`\`\`js
	let x = 1;`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "\n	```");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("list with subitems", () => {
        const list = `- hello
	- sub item
- text
	newline for some reason
`;
        const tokens = marked.marked.lexer(list);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
      test("ordered list with subitems", () => {
        const list = `1. hello
	- sub item
2. text
	newline for some reason
`;
        const tokens = marked.marked.lexer(list);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
      test("list with stuff", () => {
        const list = `- list item one \`codespan\` **bold** [link](http://microsoft.com) more text`;
        const tokens = marked.marked.lexer(list);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
      test("list with incomplete link text", () => {
        const incomplete = `- list item one
- item two [link`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "](https://microsoft.com)");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("list with incomplete link target", () => {
        const incomplete = `- list item one
- item two [link](`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("ordered list with incomplete link target", () => {
        const incomplete = `1. list item one
2. item two [link](`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("ordered list with extra whitespace", () => {
        const incomplete = `1. list item one
2. item two [link](`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("list with extra whitespace", () => {
        const incomplete = `- list item one
- item two [link](`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("list with incomplete link with other stuff", () => {
        const incomplete = `- list item one
- item two [\`link`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "`](https://microsoft.com)");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("ordered list with incomplete link with other stuff", () => {
        const incomplete = `1. list item one
1. item two [\`link`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "`](https://microsoft.com)");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("list with bold incomplete link target", () => {
        const incomplete = `- list item one
- **[link](http://microsoft`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")**");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("ordered list with bold incomplete link target", () => {
        const incomplete = `1. list item one
2. **[link](http://microsoft`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")**");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("list with incomplete subitem", () => {
        const incomplete = `1. list item one
	- `;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "&nbsp;");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("list with incomplete nested subitem", () => {
        const incomplete = `1. list item one
	- item 2
		- `;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "&nbsp;");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("text with start of list is not a heading", () => {
        const incomplete = `hello
- `;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + " &nbsp;");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("even more text with start of list is not a heading", () => {
        const incomplete = `# hello

text
-`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + " &nbsp;");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
    });
    suite("blockquote", () => {
      test("incomplete double star", () => {
        const incomplete = "> **text";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "**");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete double star before trailing quote-only lines", () => {
        const incomplete = "> **text\n>\n>";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer("> **text**\n>\n>");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("preserves reference links when completing inline tokens", () => {
        const incomplete = "[id]: https://example.com\n\n> [label][id] **text";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "**");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
    });
    suite("codespan", () => {
      simpleMarkdownTestSuite("codespan", "`");
      test(`backtick between letters`, () => {
        const text = "a`b";
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeCodespanTokens = marked.marked.lexer(text + "`");
        assert.deepStrictEqual(newTokens, completeCodespanTokens);
      });
      test(`nested pattern`, () => {
        const text = "sldkfjsd `abc __def__ ghi";
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(text + "`");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("codespan inside <body> wrapped markdown", () => {
        const text = "<body>\n\nCreated isolated worktree for branch `xyz\n\n</body>";
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer("<body>\n\nCreated isolated worktree for branch `xyz`\n\n</body>");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
    });
    suite("star", () => {
      simpleMarkdownTestSuite("star", "*");
      test(`star between letters`, () => {
        const text = "sldkfjsd a*b";
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(text + "*");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test(`nested pattern`, () => {
        const text = "sldkfjsd *abc __def__ ghi";
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(text + "*");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
    });
    suite("double star", () => {
      simpleMarkdownTestSuite("double star", "**");
      test(`double star between letters`, () => {
        const text = "a**b";
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(text + "**");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test.skip(`ending in doublestar`, () => {
        const incomplete = `some text and **`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete.trimEnd() + "**");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
    });
    suite("underscore", () => {
      simpleMarkdownTestSuite("underscore", "_");
      test(`underscore between letters`, () => {
        const text = `this_not_italics`;
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
    });
    suite("double underscore", () => {
      simpleMarkdownTestSuite("double underscore", "__");
      test(`double underscore between letters`, () => {
        const text = `this__not__bold`;
        const tokens = marked.marked.lexer(text);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
    });
    suite("link", () => {
      test("incomplete link text", () => {
        const incomplete = "abc [text";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "](https://microsoft.com)");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete link target", () => {
        const incomplete = "foo [text](http://microsoft";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete link target 2", () => {
        const incomplete = "foo [text](http://microsoft.com";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete link target inside parentheses", () => {
        const incomplete = "([text](http://microsoft.com";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete link target with extra stuff", () => {
        const incomplete = "[before `text` after](http://microsoft.com";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete link target with extra stuff and incomplete arg", () => {
        const incomplete = '[before `text` after](http://microsoft.com "more text ';
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + '")');
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete link target with incomplete arg", () => {
        const incomplete = 'foo [text](http://microsoft.com "more text here ';
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + '")');
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete link target with incomplete arg 2", () => {
        const incomplete = '[text](command:vscode.openRelativePath "arg';
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + '")');
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete link target with complete arg", () => {
        const incomplete = 'foo [text](http://microsoft.com "more text here"';
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("link text with incomplete codespan", () => {
        const incomplete = `text [\`codespan`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "`](https://microsoft.com)");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("link text with incomplete stuff", () => {
        const incomplete = `text [more text \`codespan\` text **bold`;
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "**](https://microsoft.com)");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("Looks like incomplete link target but isn't", () => {
        const complete = "**bold** `codespan` text](";
        const tokens = marked.marked.lexer(complete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(complete);
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete link in list", () => {
        const incomplete = "- [text";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + "](https://microsoft.com)");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete link target inside bold", () => {
        const incomplete = "**[text](http://microsoft";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + ")**");
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("incomplete link target with arg inside bold", () => {
        const incomplete = '**[text](http://microsoft.com "more text ';
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        const completeTokens = marked.marked.lexer(incomplete + '")**');
        assert.deepStrictEqual(newTokens, completeTokens);
      });
      test("square brace between letters", () => {
        const incomplete = "a[b";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
      test("square brace on previous line", () => {
        const incomplete = "text[\nmore text";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
      test("square braces in text", () => {
        const incomplete = "hello [what] is going on";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
      test("complete link", () => {
        const incomplete = "text [link](http://microsoft.com)";
        const tokens = marked.marked.lexer(incomplete);
        const newTokens = fillInIncompleteTokens(tokens);
        assert.deepStrictEqual(newTokens, tokens);
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxicm93c2VyXFxtYXJrZG93blJlbmRlcmVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zLCByZW5kZXJNYXJrZG93biwgcmVuZGVyQXNQbGFpbnRleHQgfSBmcm9tICcuLi8uLi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgKiBhcyBtYXJrZWQgZnJvbSAnLi4vLi4vY29tbW9uL21hcmtlZC9tYXJrZWQuanMnO1xuaW1wb3J0IHsgcGFyc2UgfSBmcm9tICcuLi8uLi9jb21tb24vbWFyc2hhbGxpbmcuanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi9jb21tb24vdXRpbHMuanMnO1xuXG5mdW5jdGlvbiBzdHJUb05vZGUoc3RyOiBzdHJpbmcpOiBIVE1MRWxlbWVudCB7XG5cdHJldHVybiBuZXcgRE9NUGFyc2VyKCkucGFyc2VGcm9tU3RyaW5nKHN0ciwgJ3RleHQvaHRtbCcpLmJvZHkuZmlyc3RDaGlsZCBhcyBIVE1MRWxlbWVudDtcbn1cblxuZnVuY3Rpb24gYXNzZXJ0Tm9kZUVxdWFscyhhY3R1YWxOb2RlOiBIVE1MRWxlbWVudCwgZXhwZWN0ZWRIdG1sOiBzdHJpbmcpIHtcblx0Y29uc3QgZXhwZWN0ZWROb2RlID0gc3RyVG9Ob2RlKGV4cGVjdGVkSHRtbCk7XG5cdGFzc2VydC5vayhcblx0XHRhY3R1YWxOb2RlLmlzRXF1YWxOb2RlKGV4cGVjdGVkTm9kZSksXG5cdFx0YEV4cGVjdGVkOiAke2V4cGVjdGVkTm9kZS5vdXRlckhUTUx9XFxuQWN0dWFsOiAke2FjdHVhbE5vZGUub3V0ZXJIVE1MfWApO1xufVxuXG5zdWl0ZSgnTWFya2Rvd25SZW5kZXJlcicsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdTYW5pdGl6YXRpb24nLCAoKSA9PiB7XG5cdFx0dGVzdCgnU2hvdWxkIG5vdCByZW5kZXIgaW1hZ2VzIHdpdGggdW5rbm93biBzY2hlbWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSB7IHZhbHVlOiBgIVtpbWFnZV0obm8tc3VjaDovL2V4YW1wbGUuY29tL2NhdC5naWYpYCB9O1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBIVE1MRWxlbWVudCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtYXJrZG93bikpLmVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmlubmVySFRNTCwgJzxwPjxpbWcgYWx0PVwiaW1hZ2VcIj48L3A+Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdTdHJpcHMgbGlua3Mgd2l0aCBkaXNhbGxvd2VkIHNjaGVtZXMgKGRlZmF1bHQgY29uZmlnKScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hcmtkb3duID0geyB2YWx1ZTogYFJlYWQgW10odnNjb2RlLWFnZW50LWhvc3Q6Ly9teS1ob3N0L3BhdGgvdG8vZm9vLnRzP19haCUzRGV5SnpZMmhsYldVaU9pSm1hV3hsSW4wKWAgfTtcblx0XHRcdGNvbnN0IHJlc3VsdDogSFRNTEVsZW1lbnQgPSBzdG9yZS5hZGQocmVuZGVyTWFya2Rvd24obWFya2Rvd24pKS5lbGVtZW50O1xuXHRcdFx0Ly8gTm8gPGE+IGVsZW1lbnQgc2hvdWxkIHJlbWFpbiBiZWNhdXNlIHRoZSBzY2hlbWUgaXNuJ3QgYWxsb3dlZC5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucXVlcnlTZWxlY3RvcignYScpLCBudWxsKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1ByZXNlcnZlcyBsaW5rIHdoZW4gc2NoZW1lIGlzIGFsbG93ZWQgdmlhIGFsbG93ZWRMaW5rU2NoZW1lcy5hdWdtZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSB7IHZhbHVlOiBgUmVhZCBbXSh2c2NvZGUtYWdlbnQtaG9zdDovL215LWhvc3QvcGF0aC90by9mb28udHM/X2FoJTNEZXlKelkyaGxiV1VpT2lKbWFXeGxJbjApYCB9O1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBIVE1MRWxlbWVudCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtYXJrZG93biwge1xuXHRcdFx0XHRzYW5pdGl6ZXJDb25maWc6IHtcblx0XHRcdFx0XHRhbGxvd2VkTGlua1NjaGVtZXM6IHsgYXVnbWVudDogWyd2c2NvZGUtYWdlbnQtaG9zdCddIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSkuZWxlbWVudDtcblx0XHRcdGNvbnN0IGFuY2hvciA9IHJlc3VsdC5xdWVyeVNlbGVjdG9yKCdhJyk7XG5cdFx0XHRhc3NlcnQub2soYW5jaG9yLCAnZXhwZWN0ZWQgPGE+IHRvIGJlIHByZXNlcnZlZCB3aGVuIHNjaGVtZSBpcyBhbGxvd2VkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYW5jaG9yIS5kYXRhc2V0LmhyZWYsICd2c2NvZGUtYWdlbnQtaG9zdDovL215LWhvc3QvcGF0aC90by9mb28udHM/X2FoJTNEZXlKelkyaGxiV1VpT2lKbWFXeGxJbjAnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1RyYW5zZm9ybXMgcGFyc2VkIGxpbmsgdGFyZ2V0cyB3aXRob3V0IGNoYW5naW5nIGxhYmVscywgdGl0bGVzLCBvciBjb2RlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSB7IHZhbHVlOiAnYFtzYW1lXShmaWxlOi8vL3NhbWUpYCBbYVtiXS50c10oZmlsZTovLy9zYW1lIFwiZmlsZTovLy9zYW1lXCIpICFbaW1hZ2VdKGZpbGU6Ly8vc2FtZXx3aWR0aD0xMCxoZWlnaHQ9MjApJyB9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1hcmtkb3duLCB7XG5cdFx0XHRcdHRyYW5zZm9ybVVyaTogaHJlZiA9PiBocmVmID09PSAnZmlsZTovLy9zYW1lJyA/ICdodHRwczovL2V4YW1wbGUuY29tL2EudHMnIDogaHJlZixcblx0XHRcdH0pKS5lbGVtZW50O1xuXHRcdFx0Y29uc3QgYW5jaG9yID0gcmVzdWx0LnF1ZXJ5U2VsZWN0b3IoJ2EnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRhbmNob3JDb3VudDogcmVzdWx0LnF1ZXJ5U2VsZWN0b3JBbGwoJ2EnKS5sZW5ndGgsXG5cdFx0XHRcdFx0dGV4dDogYW5jaG9yPy50ZXh0Q29udGVudCxcblx0XHRcdFx0XHRocmVmOiBhbmNob3I/LmRhdGFzZXQuaHJlZixcblx0XHRcdFx0XHR0aXRsZTogYW5jaG9yPy50aXRsZSxcblx0XHRcdFx0XHRpbWFnZTogcmVzdWx0LnF1ZXJ5U2VsZWN0b3IoJ2ltZycpPy5zcmMsXG5cdFx0XHRcdFx0aW1hZ2VXaWR0aDogcmVzdWx0LnF1ZXJ5U2VsZWN0b3IoJ2ltZycpPy5nZXRBdHRyaWJ1dGUoJ3dpZHRoJyksXG5cdFx0XHRcdFx0aW1hZ2VIZWlnaHQ6IHJlc3VsdC5xdWVyeVNlbGVjdG9yKCdpbWcnKT8uZ2V0QXR0cmlidXRlKCdoZWlnaHQnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGFuY2hvckNvdW50OiAxLFxuXHRcdFx0XHRcdHRleHQ6ICdhW2JdLnRzJyxcblx0XHRcdFx0XHRocmVmOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9hLnRzJyxcblx0XHRcdFx0XHR0aXRsZTogJ2ZpbGU6Ly8vc2FtZScsXG5cdFx0XHRcdFx0aW1hZ2U6ICdodHRwczovL2V4YW1wbGUuY29tL2EudHMnLFxuXHRcdFx0XHRcdGltYWdlV2lkdGg6ICcxMCcsXG5cdFx0XHRcdFx0aW1hZ2VIZWlnaHQ6ICcyMCcsXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnSW1hZ2VzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2ltYWdlIHJlbmRlcmluZyBjb25mb3JtcyB0byBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSB7IHZhbHVlOiBgIVtpbWFnZV0oaHR0cDovL2V4YW1wbGUuY29tL2NhdC5naWYgJ2NhcHRpb24nKWAgfTtcblx0XHRcdGNvbnN0IHJlc3VsdDogSFRNTEVsZW1lbnQgPSBzdG9yZS5hZGQocmVuZGVyTWFya2Rvd24obWFya2Rvd24pKS5lbGVtZW50O1xuXHRcdFx0YXNzZXJ0Tm9kZUVxdWFscyhyZXN1bHQsICc8ZGl2PjxwPjxpbWcgdGl0bGU9XCJjYXB0aW9uXCIgYWx0PVwiaW1hZ2VcIiBzcmM9XCJodHRwOi8vZXhhbXBsZS5jb20vY2F0LmdpZlwiPjwvcD48L2Rpdj4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ltYWdlIHJlbmRlcmluZyBjb25mb3JtcyB0byBkZWZhdWx0IHdpdGhvdXQgdGl0bGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYXJrZG93biA9IHsgdmFsdWU6IGAhW2ltYWdlXShodHRwOi8vZXhhbXBsZS5jb20vY2F0LmdpZilgIH07XG5cdFx0XHRjb25zdCByZXN1bHQ6IEhUTUxFbGVtZW50ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1hcmtkb3duKSkuZWxlbWVudDtcblx0XHRcdGFzc2VydE5vZGVFcXVhbHMocmVzdWx0LCAnPGRpdj48cD48aW1nIGFsdD1cImltYWdlXCIgc3JjPVwiaHR0cDovL2V4YW1wbGUuY29tL2NhdC5naWZcIj48L3A+PC9kaXY+Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbWFnZSB3aWR0aCBmcm9tIHRpdGxlIHBhcmFtcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogSFRNTEVsZW1lbnQgPSBzdG9yZS5hZGQocmVuZGVyTWFya2Rvd24oeyB2YWx1ZTogYCFbaW1hZ2VdKGh0dHA6Ly9leGFtcGxlLmNvbS9jYXQuZ2lmfHdpZHRoPTEwMHB4ICdjYXB0aW9uJylgIH0pKS5lbGVtZW50O1xuXHRcdFx0YXNzZXJ0Tm9kZUVxdWFscyhyZXN1bHQsIGA8ZGl2PjxwPjxpbWcgd2lkdGg9XCIxMDBcIiB0aXRsZT1cImNhcHRpb25cIiBhbHQ9XCJpbWFnZVwiIHNyYz1cImh0dHA6Ly9leGFtcGxlLmNvbS9jYXQuZ2lmXCI+PC9wPjwvZGl2PmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW1hZ2UgaGVpZ2h0IGZyb20gdGl0bGUgcGFyYW1zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBIVE1MRWxlbWVudCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bih7IHZhbHVlOiBgIVtpbWFnZV0oaHR0cDovL2V4YW1wbGUuY29tL2NhdC5naWZ8aGVpZ2h0PTEwMCAnY2FwdGlvbicpYCB9KSkuZWxlbWVudDtcblx0XHRcdGFzc2VydE5vZGVFcXVhbHMocmVzdWx0LCBgPGRpdj48cD48aW1nIGhlaWdodD1cIjEwMFwiIHRpdGxlPVwiY2FwdGlvblwiIGFsdD1cImltYWdlXCIgc3JjPVwiaHR0cDovL2V4YW1wbGUuY29tL2NhdC5naWZcIj48L3A+PC9kaXY+YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbWFnZSB3aWR0aCBhbmQgaGVpZ2h0IGZyb20gdGl0bGUgcGFyYW1zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBIVE1MRWxlbWVudCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bih7IHZhbHVlOiBgIVtpbWFnZV0oaHR0cDovL2V4YW1wbGUuY29tL2NhdC5naWZ8aGVpZ2h0PTIwMCx3aWR0aD0xMDAgJ2NhcHRpb24nKWAgfSkpLmVsZW1lbnQ7XG5cdFx0XHRhc3NlcnROb2RlRXF1YWxzKHJlc3VsdCwgYDxkaXY+PHA+PGltZyBoZWlnaHQ9XCIyMDBcIiB3aWR0aD1cIjEwMFwiIHRpdGxlPVwiY2FwdGlvblwiIGFsdD1cImltYWdlXCIgc3JjPVwiaHR0cDovL2V4YW1wbGUuY29tL2NhdC5naWZcIj48L3A+PC9kaXY+YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbWFnZSB3aXRoIGZpbGUgdXJpIHNob3VsZCByZW5kZXIgYXMgc2FtZSBvcmlnaW4gdXJpJywgKCkgPT4ge1xuXHRcdFx0aWYgKGlzV2ViKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc3VsdDogSFRNTEVsZW1lbnQgPSBzdG9yZS5hZGQocmVuZGVyTWFya2Rvd24oeyB2YWx1ZTogYCFbaW1hZ2VdKGZpbGU6Ly8vaW1hZ2VzL2NhdC5naWYpYCB9KSkuZWxlbWVudDtcblx0XHRcdGFzc2VydE5vZGVFcXVhbHMocmVzdWx0LCAnPGRpdj48cD48aW1nIHNyYz1cInZzY29kZS1maWxlOi8vdnNjb2RlLWFwcC9pbWFnZXMvY2F0LmdpZlwiIGFsdD1cImltYWdlXCI+PC9wPjwvZGl2PicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQ29kZSBibG9jayByZW5kZXJlcicsICgpID0+IHtcblx0XHRjb25zdCBzaW1wbGVDb2RlQmxvY2tSZW5kZXJlciA9IChsYW5nOiBzdHJpbmcsIGNvZGU6IHN0cmluZyk6IFByb21pc2U8SFRNTEVsZW1lbnQ+ID0+IHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdjb2RlJyk7XG5cdFx0XHRlbGVtZW50LnRleHRDb250ZW50ID0gY29kZTtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZWxlbWVudCk7XG5cdFx0fTtcblxuXHRcdHRlc3QoJ2FzeW5jUmVuZGVyQ2FsbGJhY2sgc2hvdWxkIGJlIGludm9rZWQgZm9yIGNvZGUgYmxvY2tzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSB7IHZhbHVlOiAnYGBganNcXG4xICsgMTtcXG5gYGAnIH07XG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtYXJrZG93biwge1xuXHRcdFx0XHRcdGFzeW5jUmVuZGVyQ2FsbGJhY2s6IHJlc29sdmUsXG5cdFx0XHRcdFx0Y29kZUJsb2NrUmVuZGVyZXI6IHNpbXBsZUNvZGVCbG9ja1JlbmRlcmVyXG5cdFx0XHRcdH0pKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXN5bmNSZW5kZXJDYWxsYmFjayBzaG91bGQgbm90IGJlIGludm9rZWQgaWYgcmVzdWx0IGlzIGltbWVkaWF0ZWx5IGRpc3Bvc2VkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSB7IHZhbHVlOiAnYGBganNcXG4xICsgMTtcXG5gYGAnIH07XG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSByZW5kZXJNYXJrZG93bihtYXJrZG93biwge1xuXHRcdFx0XHRcdGFzeW5jUmVuZGVyQ2FsbGJhY2s6IHJlamVjdCxcblx0XHRcdFx0XHRjb2RlQmxvY2tSZW5kZXJlcjogc2ltcGxlQ29kZUJsb2NrUmVuZGVyZXJcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJlc3VsdC5kaXNwb3NlKCk7XG5cdFx0XHRcdHNldFRpbWVvdXQocmVzb2x2ZSwgMTApO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhc3luY1JlbmRlckNhbGxiYWNrIHNob3VsZCBub3QgYmUgaW52b2tlZCBpZiBkaXNwb3NlIGlzIGNhbGxlZCBiZWZvcmUgY29kZSBibG9jayBpcyByZW5kZXJlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hcmtkb3duID0geyB2YWx1ZTogJ2BgYGpzXFxuMSArIDE7XFxuYGBgJyB9O1xuXHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0bGV0IHJlc29sdmVDb2RlQmxvY2tSZW5kZXJpbmc6ICh4OiBIVE1MRWxlbWVudCkgPT4gdm9pZDtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVuZGVyTWFya2Rvd24obWFya2Rvd24sIHtcblx0XHRcdFx0XHRhc3luY1JlbmRlckNhbGxiYWNrOiByZWplY3QsXG5cdFx0XHRcdFx0Y29kZUJsb2NrUmVuZGVyZXI6ICgpID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcblx0XHRcdFx0XHRcdFx0cmVzb2x2ZUNvZGVCbG9ja1JlbmRlcmluZyA9IHJlc29sdmU7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRyZXN1bHQuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJlc29sdmVDb2RlQmxvY2tSZW5kZXJpbmcoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY29kZScpKTtcblx0XHRcdFx0XHRzZXRUaW1lb3V0KHJlc29sdmUsIDEwKTtcblx0XHRcdFx0fSwgMTApO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDb2RlIGJsb2NrcyBzaG91bGQgdXNlIGxlYWRpbmcgbGFuZ3VhZ2UgaWQgKCMxNTc3OTMpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSB7IHZhbHVlOiAnYGBganMgc29tZSBvdGhlciBzdHVmZlxcbjEgKyAxO1xcbmBgYCcgfTtcblx0XHRcdGNvbnN0IGxhbmcgPSBhd2FpdCBuZXcgUHJvbWlzZTxzdHJpbmc+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRzdG9yZS5hZGQocmVuZGVyTWFya2Rvd24obWFya2Rvd24sIHtcblx0XHRcdFx0XHRjb2RlQmxvY2tSZW5kZXJlcjogYXN5bmMgKGxhbmcsIHZhbHVlKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKGxhbmcpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHNpbXBsZUNvZGVCbG9ja1JlbmRlcmVyKGxhbmcsIHZhbHVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhbmcsICdqcycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnVGhlbWVJY29ucyBTdXBwb3J0IE9uJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmVuZGVyIGFwcGVuZFRleHQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtZHMgPSBuZXcgTWFya2Rvd25TdHJpbmcodW5kZWZpbmVkLCB7IHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHRcdFx0bWRzLmFwcGVuZFRleHQoJyQoemFwKSAkKG5vdCBhIHRoZW1lIGljb24pICQoYWRkKScpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQ6IEhUTUxFbGVtZW50ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1kcykpLmVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmlubmVySFRNTCwgYDxwPiQoemFwKSZuYnNwOyQobm90Jm5ic3A7YSZuYnNwO3RoZW1lJm5ic3A7aWNvbikmbmJzcDskKGFkZCk8L3A+YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW5kZXIgYXBwZW5kTWFya2Rvd24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtZHMgPSBuZXcgTWFya2Rvd25TdHJpbmcodW5kZWZpbmVkLCB7IHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHRcdFx0bWRzLmFwcGVuZE1hcmtkb3duKCckKHphcCkgJChub3QgYSB0aGVtZSBpY29uKSAkKGFkZCknKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBIVE1MRWxlbWVudCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtZHMpKS5lbGVtZW50O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbm5lckhUTUwsIGA8cD48c3BhbiBjbGFzcz1cImNvZGljb24gY29kaWNvbi16YXBcIj48L3NwYW4+ICQobm90IGEgdGhlbWUgaWNvbikgPHNwYW4gY2xhc3M9XCJjb2RpY29uIGNvZGljb24tYWRkXCI+PC9zcGFuPjwvcD5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlciBhcHBlbmRNYXJrZG93biB3aXRoIGVzY2FwZWQgaWNvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IG1kcyA9IG5ldyBNYXJrZG93blN0cmluZyh1bmRlZmluZWQsIHsgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSk7XG5cdFx0XHRtZHMuYXBwZW5kTWFya2Rvd24oJ1xcXFwkKHphcCkgJChub3QgYSB0aGVtZSBpY29uKSAkKGFkZCknKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBIVE1MRWxlbWVudCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtZHMpKS5lbGVtZW50O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbm5lckhUTUwsIGA8cD4kKHphcCkgJChub3QgYSB0aGVtZSBpY29uKSA8c3BhbiBjbGFzcz1cImNvZGljb24gY29kaWNvbi1hZGRcIj48L3NwYW4+PC9wPmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVuZGVyIGljb24gaW4gbGluaycsICgpID0+IHtcblx0XHRcdGNvbnN0IG1kcyA9IG5ldyBNYXJrZG93blN0cmluZyh1bmRlZmluZWQsIHsgc3VwcG9ydFRoZW1lSWNvbnM6IHRydWUgfSk7XG5cdFx0XHRtZHMuYXBwZW5kTWFya2Rvd24oYFskKHphcCktbGlua10oI2xpbmspYCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogSFRNTEVsZW1lbnQgPSBzdG9yZS5hZGQocmVuZGVyTWFya2Rvd24obWRzKSkuZWxlbWVudDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5uZXJIVE1MLCBgPHA+PGEgaHJlZj1cIlwiIHRpdGxlPVwiI2xpbmtcIiBkcmFnZ2FibGU9XCJmYWxzZVwiIGRhdGEtaHJlZj1cIiNsaW5rXCI+PHNwYW4gY2xhc3M9XCJjb2RpY29uIGNvZGljb24temFwXCI+PC9zcGFuPi1saW5rPC9hPjwvcD5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlciBpY29uIGluIHRhYmxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWRzID0gbmV3IE1hcmtkb3duU3RyaW5nKHVuZGVmaW5lZCwgeyBzdXBwb3J0VGhlbWVJY29uczogdHJ1ZSB9KTtcblx0XHRcdG1kcy5hcHBlbmRNYXJrZG93bihgXG58IHRleHQgICB8IHRleHQgICAgICAgICAgICAgICAgIHxcbnwtLS0tLS0tLXwtLS0tLS0tLS0tLS0tLS0tLS0tLS0tfFxufCAkKHphcCkgfCBbJCh6YXApLWxpbmtdKCNsaW5rKSB8YCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogSFRNTEVsZW1lbnQgPSBzdG9yZS5hZGQocmVuZGVyTWFya2Rvd24obWRzKSkuZWxlbWVudDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5uZXJIVE1MLCBgPHRhYmxlPlxuPHRoZWFkPlxuPHRyPlxuPHRoPnRleHQ8L3RoPlxuPHRoPnRleHQ8L3RoPlxuPC90cj5cbjwvdGhlYWQ+XG48dGJvZHk+PHRyPlxuPHRkPjxzcGFuIGNsYXNzPVwiY29kaWNvbiBjb2RpY29uLXphcFwiPjwvc3Bhbj48L3RkPlxuPHRkPjxhIGhyZWY9XCJcIiB0aXRsZT1cIiNsaW5rXCIgZHJhZ2dhYmxlPVwiZmFsc2VcIiBkYXRhLWhyZWY9XCIjbGlua1wiPjxzcGFuIGNsYXNzPVwiY29kaWNvbiBjb2RpY29uLXphcFwiPjwvc3Bhbj4tbGluazwvYT48L3RkPlxuPC90cj5cbjwvdGJvZHk+PC90YWJsZT5cbmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVuZGVyIGljb24gaW4gPGE+IHdpdGhvdXQgaHJlZiAoIzE1MjE3MCknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtZHMgPSBuZXcgTWFya2Rvd25TdHJpbmcodW5kZWZpbmVkLCB7IHN1cHBvcnRUaGVtZUljb25zOiB0cnVlLCBzdXBwb3J0SHRtbDogdHJ1ZSB9KTtcblx0XHRcdG1kcy5hcHBlbmRNYXJrZG93bihgPGE+JChzeW5jKTwvYT5gKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBIVE1MRWxlbWVudCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtZHMpKS5lbGVtZW50O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbm5lckhUTUwsIGA8cD48c3BhbiBjbGFzcz1cImNvZGljb24gY29kaWNvbi1zeW5jXCI+PC9zcGFuPjwvcD5gKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1RoZW1lSWNvbnMgU3VwcG9ydCBPZmYnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZW5kZXIgYXBwZW5kVGV4dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1kcyA9IG5ldyBNYXJrZG93blN0cmluZyh1bmRlZmluZWQsIHsgc3VwcG9ydFRoZW1lSWNvbnM6IGZhbHNlIH0pO1xuXHRcdFx0bWRzLmFwcGVuZFRleHQoJyQoemFwKSAkKG5vdCBhIHRoZW1lIGljb24pICQoYWRkKScpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQ6IEhUTUxFbGVtZW50ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1kcykpLmVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmlubmVySFRNTCwgYDxwPiQoemFwKSZuYnNwOyQobm90Jm5ic3A7YSZuYnNwO3RoZW1lJm5ic3A7aWNvbikmbmJzcDskKGFkZCk8L3A+YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW5kZXIgYXBwZW5kTWFya2Rvd24gd2l0aCBlc2NhcGVkIGljb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtZHMgPSBuZXcgTWFya2Rvd25TdHJpbmcodW5kZWZpbmVkLCB7IHN1cHBvcnRUaGVtZUljb25zOiBmYWxzZSB9KTtcblx0XHRcdG1kcy5hcHBlbmRNYXJrZG93bignXFxcXCQoemFwKSAkKG5vdCBhIHRoZW1lIGljb24pICQoYWRkKScpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQ6IEhUTUxFbGVtZW50ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1kcykpLmVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmlubmVySFRNTCwgYDxwPiQoemFwKSAkKG5vdCBhIHRoZW1lIGljb24pICQoYWRkKTwvcD5gKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0FsZXJ0cycsICgpID0+IHtcblx0XHR0ZXN0KCdTaG91bGQgcmVuZGVyIGFsZXJ0IHdpdGggZGF0YS1zZXZlcml0eSBhdHRyaWJ1dGUgYW5kIGljb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYXJrZG93biA9IG5ldyBNYXJrZG93blN0cmluZygnPiBbIU5PVEVdXFxuPiBUaGlzIGlzIGEgbm90ZSBhbGVydCcsIHsgc3VwcG9ydEFsZXJ0U3ludGF4OiB0cnVlIH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1hcmtkb3duKSkuZWxlbWVudDtcblxuXHRcdFx0Y29uc3QgYmxvY2txdW90ZSA9IHJlc3VsdC5xdWVyeVNlbGVjdG9yKCdibG9ja3F1b3RlW2RhdGEtc2V2ZXJpdHk9XCJub3RlXCJdJyk7XG5cdFx0XHRhc3NlcnQub2soYmxvY2txdW90ZSwgJ1Nob3VsZCBoYXZlIGJsb2NrcXVvdGUgd2l0aCBkYXRhLXNldmVyaXR5PVwibm90ZVwiJyk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmlubmVySFRNTC5pbmNsdWRlcygnVGhpcyBpcyBhIG5vdGUgYWxlcnQnKSwgJ1Nob3VsZCBjb250YWluIGFsZXJ0IHRleHQnKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5uZXJIVE1MLmluY2x1ZGVzKCdjb2RpY29uLWluZm8nKSwgJ1Nob3VsZCBjb250YWluIGluZm8gaWNvbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnU2hvdWxkIHJlbmRlciByZWd1bGFyIGJsb2NrcXVvdGUgd2hlbiBzdXBwb3J0QWxlcnRTeW50YXggaXMgZGlzYWJsZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYXJrZG93biA9IG5ldyBNYXJrZG93blN0cmluZygnPiBbIU5PVEVdXFxuPiBUaGlzIHNob3VsZCBiZSBhIHJlZ3VsYXIgYmxvY2txdW90ZScpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1hcmtkb3duKSkuZWxlbWVudDtcblxuXHRcdFx0Y29uc3QgYmxvY2txdW90ZSA9IHJlc3VsdC5xdWVyeVNlbGVjdG9yKCdibG9ja3F1b3RlJyk7XG5cdFx0XHRhc3NlcnQub2soYmxvY2txdW90ZSwgJ1Nob3VsZCBoYXZlIGJsb2NrcXVvdGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChibG9ja3F1b3RlPy5nZXRBdHRyaWJ1dGUoJ2RhdGEtc2V2ZXJpdHknKSwgbnVsbCwgJ1Nob3VsZCBub3QgaGF2ZSBkYXRhLXNldmVyaXR5IGF0dHJpYnV0ZScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbm5lckhUTUwuaW5jbHVkZXMoJ1shTk9URV0nKSwgJ1Nob3VsZCBjb250YWluIGxpdGVyYWwgWyFOT1RFXSB0ZXh0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdTaG91bGQgbm90IHRyYW5zZm9ybSBibG9ja3F1b3RlcyB3aXRob3V0IGFsZXJ0IHN5bnRheCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hcmtkb3duID0gbmV3IE1hcmtkb3duU3RyaW5nKCc+IFRoaXMgaXMgYSByZWd1bGFyIGJsb2NrcXVvdGUnLCB7IHN1cHBvcnRBbGVydFN5bnRheDogdHJ1ZSB9KTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtYXJrZG93bikpLmVsZW1lbnQ7XG5cblx0XHRcdGNvbnN0IGJsb2NrcXVvdGUgPSByZXN1bHQucXVlcnlTZWxlY3RvcignYmxvY2txdW90ZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJsb2NrcXVvdGU/LmdldEF0dHJpYnV0ZSgnZGF0YS1zZXZlcml0eScpLCBudWxsLCAnU2hvdWxkIG5vdCBoYXZlIGRhdGEtc2V2ZXJpdHkgYXR0cmlidXRlJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25wbSBIb3ZlciBSdW4gU2NyaXB0IG5vdCB3b3JraW5nICM5MDg1NScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IG1kOiBJTWFya2Rvd25TdHJpbmcgPSBKU09OLnBhcnNlKCd7XCJ2YWx1ZVwiOlwiW1J1biBTY3JpcHRdKGNvbW1hbmQ6bnBtLnJ1blNjcmlwdEZyb21Ib3Zlcj8lN0IlMjJkb2N1bWVudFVyaSUyMiUzQSU3QiUyMiUyNG1pZCUyMiUzQTElMkMlMjJmc1BhdGglMjIlM0ElMjJjJTNBJTVDJTVDVXNlcnMlNUMlNUNqcmlla2VuJTVDJTVDQ29kZSU1QyU1Q19zYW1wbGUlNUMlNUNmb28lNUMlNUNwYWNrYWdlLmpzb24lMjIlMkMlMjJfc2VwJTIyJTNBMSUyQyUyMmV4dGVybmFsJTIyJTNBJTIyZmlsZSUzQSUyRiUyRiUyRmMlMjUzQSUyRlVzZXJzJTJGanJpZWtlbiUyRkNvZGUlMkZfc2FtcGxlJTJGZm9vJTJGcGFja2FnZS5qc29uJTIyJTJDJTIycGF0aCUyMiUzQSUyMiUyRmMlM0ElMkZVc2VycyUyRmpyaWVrZW4lMkZDb2RlJTJGX3NhbXBsZSUyRmZvbyUyRnBhY2thZ2UuanNvbiUyMiUyQyUyMnNjaGVtZSUyMiUzQSUyMmZpbGUlMjIlN0QlMkMlMjJzY3JpcHQlMjIlM0ElMjJlY2hvJTIyJTdEIFxcXFxcIlJ1biB0aGUgc2NyaXB0IGFzIGEgdGFza1xcXFxcIilcIixcInN1cHBvcnRUaGVtZUljb25zXCI6ZmFsc2UsXCJpc1RydXN0ZWRcIjp0cnVlLFwidXJpc1wiOntcIl9fdXJpX2U0OTQ0M1wiOntcIiRtaWRcIjoxLFwiZnNQYXRoXCI6XCJjOlxcXFxcXFxcVXNlcnNcXFxcXFxcXGpyaWVrZW5cXFxcXFxcXENvZGVcXFxcXFxcXF9zYW1wbGVcXFxcXFxcXGZvb1xcXFxcXFxccGFja2FnZS5qc29uXCIsXCJfc2VwXCI6MSxcImV4dGVybmFsXCI6XCJmaWxlOi8vL2MlM0EvVXNlcnMvanJpZWtlbi9Db2RlL19zYW1wbGUvZm9vL3BhY2thZ2UuanNvblwiLFwicGF0aFwiOlwiL2M6L1VzZXJzL2pyaWVrZW4vQ29kZS9fc2FtcGxlL2Zvby9wYWNrYWdlLmpzb25cIixcInNjaGVtZVwiOlwiZmlsZVwifSxcImNvbW1hbmQ6bnBtLnJ1blNjcmlwdEZyb21Ib3Zlcj8lN0IlMjJkb2N1bWVudFVyaSUyMiUzQSU3QiUyMiUyNG1pZCUyMiUzQTElMkMlMjJmc1BhdGglMjIlM0ElMjJjJTNBJTVDJTVDVXNlcnMlNUMlNUNqcmlla2VuJTVDJTVDQ29kZSU1QyU1Q19zYW1wbGUlNUMlNUNmb28lNUMlNUNwYWNrYWdlLmpzb24lMjIlMkMlMjJfc2VwJTIyJTNBMSUyQyUyMmV4dGVybmFsJTIyJTNBJTIyZmlsZSUzQSUyRiUyRiUyRmMlMjUzQSUyRlVzZXJzJTJGanJpZWtlbiUyRkNvZGUlMkZfc2FtcGxlJTJGZm9vJTJGcGFja2FnZS5qc29uJTIyJTJDJTIycGF0aCUyMiUzQSUyMiUyRmMlM0ElMkZVc2VycyUyRmpyaWVrZW4lMkZDb2RlJTJGX3NhbXBsZSUyRmZvbyUyRnBhY2thZ2UuanNvbiUyMiUyQyUyMnNjaGVtZSUyMiUzQSUyMmZpbGUlMjIlN0QlMkMlMjJzY3JpcHQlMjIlM0ElMjJlY2hvJTIyJTdEXCI6e1wiJG1pZFwiOjEsXCJwYXRoXCI6XCJucG0ucnVuU2NyaXB0RnJvbUhvdmVyXCIsXCJzY2hlbWVcIjpcImNvbW1hbmRcIixcInF1ZXJ5XCI6XCJ7XFxcXFwiZG9jdW1lbnRVcmlcXFxcXCI6XFxcXFwiX191cmlfZTQ5NDQzXFxcXFwiLFxcXFxcInNjcmlwdFxcXFxcIjpcXFxcXCJlY2hvXFxcXFwifVwifX19Jyk7XG5cdFx0Y29uc3QgZWxlbWVudCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtZCkpLmVsZW1lbnQ7XG5cblx0XHRjb25zdCBhbmNob3IgPSBlbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2EnKSE7XG5cdFx0YXNzZXJ0Lm9rKGFuY2hvcik7XG5cdFx0YXNzZXJ0Lm9rKGFuY2hvci5kYXRhc2V0WydocmVmJ10pO1xuXG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKGFuY2hvci5kYXRhc2V0WydocmVmJ10hKTtcblxuXHRcdGNvbnN0IGRhdGEgPSA8eyBzY3JpcHQ6IHN0cmluZzsgZG9jdW1lbnRVcmk6IFVSSSB9PnBhcnNlKGRlY29kZVVSSUNvbXBvbmVudCh1cmkucXVlcnkpKTtcblx0XHRhc3NlcnQub2soZGF0YSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRhdGEuc2NyaXB0LCAnZWNobycpO1xuXHRcdGFzc2VydC5vayhkYXRhLmRvY3VtZW50VXJpLnRvU3RyaW5nKCkuc3RhcnRzV2l0aCgnZmlsZTovLy9jJTNBLycpKTtcblx0fSk7XG5cblx0dGVzdCgnU2hvdWxkIG5vdCByZW5kZXIgY29tbWFuZCBsaW5rcyBieSBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1kID0gbmV3IE1hcmtkb3duU3RyaW5nKGBbY29tbWFuZDFdKGNvbW1hbmQ6ZG9Gb28pIDxhIGhyZWY9XCJjb21tYW5kOmRvRm9vXCI+Y29tbWFuZDI8L2E+YCwge1xuXHRcdFx0c3VwcG9ydEh0bWw6IHRydWVcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdDogSFRNTEVsZW1lbnQgPSBzdG9yZS5hZGQocmVuZGVyTWFya2Rvd24obWQpKS5lbGVtZW50O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5uZXJIVE1MLCBgPHA+Y29tbWFuZDEgY29tbWFuZDI8L3A+YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Nob3VsZCByZW5kZXIgY29tbWFuZCBsaW5rcyBpbiB0cnVzdGVkIHN0cmluZ3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWQgPSBuZXcgTWFya2Rvd25TdHJpbmcoYFtjb21tYW5kMV0oY29tbWFuZDpkb0ZvbykgPGEgaHJlZj1cImNvbW1hbmQ6ZG9Gb29cIj5jb21tYW5kMjwvYT5gLCB7XG5cdFx0XHRpc1RydXN0ZWQ6IHRydWUsXG5cdFx0XHRzdXBwb3J0SHRtbDogdHJ1ZSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdDogSFRNTEVsZW1lbnQgPSBzdG9yZS5hZGQocmVuZGVyTWFya2Rvd24obWQpKS5lbGVtZW50O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5uZXJIVE1MLCBgPHA+PGEgaHJlZj1cIlwiIHRpdGxlPVwiXCIgZHJhZ2dhYmxlPVwiZmFsc2VcIiBkYXRhLWhyZWY9XCJjb21tYW5kOmRvRm9vXCI+Y29tbWFuZDE8L2E+IDxhIGhyZWY9XCJcIiBkYXRhLWhyZWY9XCJjb21tYW5kOmRvRm9vXCI+Y29tbWFuZDI8L2E+PC9wPmApO1xuXHR9KTtcblxuXHR0ZXN0KCdTaG91bGQgcmVtb3ZlIHJlbGF0aXZlIGxpbmtzIGlmIHRoZXJlIGlzIG5vIGJhc2UgdXJsJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1kID0gbmV3IE1hcmtkb3duU3RyaW5nKGBbdGV4dF0oLi9mb28pIDxhIGhyZWY9XCIuL2JhclwiPmJhcjwvYT5gLCB7XG5cdFx0XHRpc1RydXN0ZWQ6IHRydWUsXG5cdFx0XHRzdXBwb3J0SHRtbDogdHJ1ZSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtZCkpLmVsZW1lbnQ7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbm5lckhUTUwsIGA8cD50ZXh0IGJhcjwvcD5gKTtcblx0fSk7XG5cblx0dGVzdCgnU2hvdWxkIHN1cHBvcnQgcmVsYXRpdmUgbGlua3MgaWYgYmFzZXVybCBpcyBzZXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWQgPSBuZXcgTWFya2Rvd25TdHJpbmcoYFt0ZXh0XSguL2ZvbykgPGEgaHJlZj1cIi4vYmFyXCI+YmFyPC9hPiA8aW1nIHNyYz1cImNhdC5naWZcIj5gLCB7XG5cdFx0XHRpc1RydXN0ZWQ6IHRydWUsXG5cdFx0XHRzdXBwb3J0SHRtbDogdHJ1ZSxcblx0XHR9KTtcblx0XHRtZC5iYXNlVXJpID0gVVJJLnBhcnNlKCdodHRwczovL2V4YW1wbGUuY29tL3BhdGgvJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBzdG9yZS5hZGQocmVuZGVyTWFya2Rvd24obWQpKS5lbGVtZW50O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5uZXJIVE1MLCBgPHA+PGEgaHJlZj1cIlwiIHRpdGxlPVwiLi9mb29cIiBkcmFnZ2FibGU9XCJmYWxzZVwiIGRhdGEtaHJlZj1cImh0dHBzOi8vZXhhbXBsZS5jb20vcGF0aC9mb29cIj50ZXh0PC9hPiA8YSBocmVmPVwiXCIgZGF0YS1ocmVmPVwiaHR0cHM6Ly9leGFtcGxlLmNvbS9wYXRoL2JhclwiPmJhcjwvYT4gPGltZyBzcmM9XCJodHRwczovL2V4YW1wbGUuY29tL3BhdGgvY2F0LmdpZlwiPjwvcD5gKTtcblx0fSk7XG5cblx0c3VpdGUoJ0NvcHktc2FmZSBocmVmcycsICgpID0+IHtcblx0XHQvLyBSaWNoLXRleHQgY29weSByZXNvbHZlZCBlbXB0eSBocmVmcyBhZ2FpbnN0IHRoZSB3b3JrYmVuY2ggZG9jdW1lbnQsIHNvIGV2ZXJ5IHBhc3RlZFxuXHRcdC8vIGxpbmsgYmVjYW1lIGEgYHdvcmtiZW5jaC5odG1sYCBVUkwuIENsaWNrcyBzdGlsbCByb3V0ZSB0aHJvdWdoIGBkYXRhLWhyZWZgLlxuXHRcdHRlc3QoJ2tlZXBzIHRoZSByZWFsIGhyZWYgb25seSBmb3IgdGFyZ2V0cyB0aGF0IHJlc29sdmUgZWxzZXdoZXJlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWQgPSBuZXcgTWFya2Rvd25TdHJpbmcoYFt3ZWJdKGh0dHBzOi8vZXhhbXBsZS5jb20vcGFnZSkgW21haWxdKG1haWx0bzp1c2VyQGV4YW1wbGUuY29tKSBbcnVuXShjb21tYW5kOmRvRm9vKSBbZmlsZV0oZmlsZTovLy9ob21lL3VzZXIvYS50cykgW3JlZl0oaHR0cDovL192c2NvZGVjb250ZW50cmVmXy8wKWAsIHsgaXNUcnVzdGVkOiB0cnVlIH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzdG9yZS5hZGQocmVuZGVyTWFya2Rvd24obWQsIHsgYWN0aW9uSGFuZGxlcjogKCkgPT4geyB9IH0pKS5lbGVtZW50O1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0QXJyYXkuZnJvbShyZXN1bHQucXVlcnlTZWxlY3RvckFsbCgnYScpLCBhID0+IFthLmdldEF0dHJpYnV0ZSgnaHJlZicpLCBhLmdldEF0dHJpYnV0ZSgnZGF0YS1ocmVmJyksIGEuZ2V0QXR0cmlidXRlKCdkcmFnZ2FibGUnKV0pLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0WydodHRwczovL2V4YW1wbGUuY29tL3BhZ2UnLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlJywgJ2ZhbHNlJ10sXG5cdFx0XHRcdFx0WydtYWlsdG86dXNlckBleGFtcGxlLmNvbScsICdtYWlsdG86dXNlckBleGFtcGxlLmNvbScsICdmYWxzZSddLFxuXHRcdFx0XHRcdFsnJywgJ2NvbW1hbmQ6ZG9Gb28nLCAnZmFsc2UnXSxcblx0XHRcdFx0XHRbJycsICdmaWxlOi8vL2hvbWUvdXNlci9hLnRzJywgJ2ZhbHNlJ10sXG5cdFx0XHRcdFx0WycnLCAnaHR0cDovL192c2NvZGVjb250ZW50cmVmXy8wJywgJ2ZhbHNlJ10sXG5cdFx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGVhdmVzIHRoZSBocmVmIGVtcHR5IHdoZW4gbm90aGluZyBpbnRlcmNlcHRzIGNsaWNrcycsICgpID0+IHtcblx0XHRcdC8vIFdpdGhvdXQgYW4gYWN0aW9uIGhhbmRsZXIgdGhlIGFuY2hvciB3b3VsZCBuYXZpZ2F0ZSBuYXRpdmVseSwgYnlwYXNzaW5nIHRoZSBvcGVuZXIuXG5cdFx0XHRjb25zdCBtZCA9IG5ldyBNYXJrZG93blN0cmluZyhgW3dlYl0oaHR0cHM6Ly9leGFtcGxlLmNvbS9wYWdlKWAsIHt9KTtcblxuXHRcdFx0Y29uc3QgYW5jaG9yID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1kKSkuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdhJykhO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0W2FuY2hvci5nZXRBdHRyaWJ1dGUoJ2hyZWYnKSwgYW5jaG9yLmdldEF0dHJpYnV0ZSgnZGF0YS1ocmVmJyldLFxuXHRcdFx0XHRbJycsICdodHRwczovL2V4YW1wbGUuY29tL3BhZ2UnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdrZWVwcyB0aGUgcmVzb2x2ZWQgaHJlZiBmb3IgcmVsYXRpdmUgbGlua3MgYWdhaW5zdCBhbiBodHRwcyBiYXNlVXJpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWQgPSBuZXcgTWFya2Rvd25TdHJpbmcoYFt0ZXh0XSguL2ZvbylgLCB7IGlzVHJ1c3RlZDogdHJ1ZSB9KTtcblx0XHRcdG1kLmJhc2VVcmkgPSBVUkkucGFyc2UoJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGF0aC8nKTtcblxuXHRcdFx0Y29uc3QgYW5jaG9yID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1kLCB7IGFjdGlvbkhhbmRsZXI6ICgpID0+IHsgfSB9KSkuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdhJykhO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0W2FuY2hvci5nZXRBdHRyaWJ1dGUoJ2hyZWYnKSwgYW5jaG9yLmdldEF0dHJpYnV0ZSgnZGF0YS1ocmVmJyldLFxuXHRcdFx0XHRbJ2h0dHBzOi8vZXhhbXBsZS5jb20vcGF0aC9mb28nLCAnaHR0cHM6Ly9leGFtcGxlLmNvbS9wYXRoL2ZvbyddKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnU2hvdWxkIHVzZSBkZWNvZGVkIGZpbGUgcGF0aCBhcyB0aXRsZSBmb3IgZmlsZTovLyBsaW5rcycsICgpID0+IHtcblx0XHRjb25zdCBmaWxlVXJpID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvcHJvamVjdC9saWIuZC50cycpO1xuXHRcdGNvbnN0IG1kID0gbmV3IE1hcmtkb3duU3RyaW5nKGBbbG9nXSgke2ZpbGVVcmkudG9TdHJpbmcoKX0pYCwge30pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1kKSkuZWxlbWVudDtcblx0XHRjb25zdCBhbmNob3IgPSByZXN1bHQucXVlcnlTZWxlY3RvcignYScpITtcblx0XHRhc3NlcnQub2soYW5jaG9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYW5jaG9yLnRpdGxlLCBmaWxlVXJpLmZzUGF0aCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Nob3VsZCBpbmNsdWRlIGZyYWdtZW50IGluIHRpdGxlIGZvciBmaWxlOi8vIGxpbmtzIHdpdGggbGluZSBudW1iZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVVcmkgPSBVUkkuZmlsZSgnL2hvbWUvdXNlci9wcm9qZWN0L2xpYi5kLnRzJyk7XG5cdFx0Y29uc3QgbWQgPSBuZXcgTWFya2Rvd25TdHJpbmcoYFtsb2ddKCR7ZmlsZVVyaS50b1N0cmluZygpfSNMNDIpYCwge30pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1kKSkuZWxlbWVudDtcblx0XHRjb25zdCBhbmNob3IgPSByZXN1bHQucXVlcnlTZWxlY3RvcignYScpITtcblx0XHRhc3NlcnQub2soYW5jaG9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYW5jaG9yLnRpdGxlLCBgJHtmaWxlVXJpLmZzUGF0aH0jTDQyYCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Nob3VsZCBub3Qgb3ZlcnJpZGUgZXhwbGljaXQgdGl0bGUgZm9yIGZpbGU6Ly8gbGlua3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVVyaSA9IFVSSS5maWxlKCcvaG9tZS91c2VyL3Byb2plY3QvbGliLmQudHMnKTtcblx0XHRjb25zdCBtZCA9IG5ldyBNYXJrZG93blN0cmluZyhgW2xvZ10oJHtmaWxlVXJpLnRvU3RyaW5nKCl9IFwiR28gdG8gZGVmaW5pdGlvblwiKWAsIHt9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtZCkpLmVsZW1lbnQ7XG5cdFx0Y29uc3QgYW5jaG9yID0gcmVzdWx0LnF1ZXJ5U2VsZWN0b3IoJ2EnKSE7XG5cdFx0YXNzZXJ0Lm9rKGFuY2hvcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFuY2hvci50aXRsZSwgJ0dvIHRvIGRlZmluaXRpb24nKTtcblx0fSk7XG5cblx0c3VpdGUoJ1BsYWludGV4dE1hcmtkb3duUmVuZGVyJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgndGVzdCBjb2RlLCBibG9ja3F1b3RlLCBoZWFkaW5nLCBsaXN0LCBsaXN0aXRlbSwgcGFyYWdyYXBoLCB0YWJsZSwgdGFibGVyb3csIHRhYmxlY2VsbCwgc3Ryb25nLCBlbSwgYnIsIGRlbCwgdGV4dCBhcmUgcmVuZGVyZWQgcGxhaW50ZXh0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSB7IHZhbHVlOiAnYGNvZGVgXFxuPnF1b3RlXFxuIyBoZWFkaW5nXFxuLSBsaXN0XFxuXFxudGFibGUgfCB0YWJsZTJcXG4tLS0gfCAtLS0gXFxub25lIHwgdHdvXFxuXFxuXFxuYm8qKmxkKipcXG5faXRhbGljX1xcbn5+ZGVsfn5cXG5zb21lIHRleHQnIH07XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9ICdjb2RlXFxucXVvdGVcXG5oZWFkaW5nXFxubGlzdFxcblxcbnRhYmxlIHRhYmxlMlxcbm9uZSB0d29cXG5ib2xkXFxuaXRhbGljXFxuZGVsXFxuc29tZSB0ZXh0Jztcblx0XHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nID0gcmVuZGVyQXNQbGFpbnRleHQobWFya2Rvd24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgZXhwZWN0ZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGVzdCBodG1sLCBociwgaW1hZ2UsIGxpbmsgYXJlIHJlbmRlcmVkIHBsYWludGV4dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hcmtkb3duID0geyB2YWx1ZTogJzxkaXY+aHRtbDwvZGl2Plxcblxcbi0tLVxcbiFbaW1hZ2VdKGltYWdlTGluaylcXG5bdGV4dF0odGV4dExpbmspJyB9O1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWQgPSAndGV4dCc7XG5cdFx0XHRjb25zdCByZXN1bHQ6IHN0cmluZyA9IHJlbmRlckFzUGxhaW50ZXh0KG1hcmtkb3duKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGV4cGVjdGVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoYFNob3VsZCBub3QgcmVtb3ZlIGh0bWwgaW5zaWRlIG9mIGNvZGUgYmxvY2tzYCwgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSB7XG5cdFx0XHRcdHZhbHVlOiBbXG5cdFx0XHRcdFx0J2BgYGh0bWwnLFxuXHRcdFx0XHRcdCc8Zm9ybT5odG1sPC9mb3JtPicsXG5cdFx0XHRcdFx0J2BgYCcsXG5cdFx0XHRcdF0uam9pbignXFxuJylcblx0XHRcdH07XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdFx0J2BgYCcsXG5cdFx0XHRcdCc8Zm9ybT5odG1sPC9mb3JtPicsXG5cdFx0XHRcdCdgYGAnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IHJlc3VsdDogc3RyaW5nID0gcmVuZGVyQXNQbGFpbnRleHQobWFya2Rvd24sIHsgaW5jbHVkZUNvZGVCbG9ja3NGZW5jZXM6IHRydWUgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBleHBlY3RlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBkb3VibGUtZXNjYXBlIGVudGl0aWVzIGluc2lkZSBjb2RlIHNwYW5zJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbmRlckFzUGxhaW50ZXh0KHsgdmFsdWU6ICdSdW4gYHRlc3RzICYgYnVpbGRgJyB9KSwgJ1J1biB0ZXN0cyAmIGJ1aWxkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVuZGVyQXNQbGFpbnRleHQoeyB2YWx1ZTogJ1VzZSBgPGZvcm0+YCB0YWcnIH0pLCAnVXNlIDxmb3JtPiB0YWcnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3N1cHBvcnRIdG1sJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3N1cHBvcnRIdG1sIGlzIGRpc2FibGVkIGJ5IGRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtZHMgPSBuZXcgTWFya2Rvd25TdHJpbmcodW5kZWZpbmVkLCB7fSk7XG5cdFx0XHRtZHMuYXBwZW5kTWFya2Rvd24oJ2E8Yj5iPC9iPmMnKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc3RvcmUuYWRkKHJlbmRlck1hcmtkb3duKG1kcykpLmVsZW1lbnQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmlubmVySFRNTCwgYDxwPmFiYzwvcD5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1JlbmRlcnMgaHRtbCB3aGVuIHN1cHBvcnRIdG1sPXRydWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtZHMgPSBuZXcgTWFya2Rvd25TdHJpbmcodW5kZWZpbmVkLCB7IHN1cHBvcnRIdG1sOiB0cnVlIH0pO1xuXHRcdFx0bWRzLmFwcGVuZE1hcmtkb3duKCdhPGI+YjwvYj5jJyk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtZHMpKS5lbGVtZW50O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbm5lckhUTUwsIGA8cD5hPGI+YjwvYj5jPC9wPmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnU2hvdWxkIG5vdCBpbmNsdWRlIHNjcmlwdHMgZXZlbiB3aGVuIHN1cHBvcnRIdG1sPXRydWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtZHMgPSBuZXcgTWFya2Rvd25TdHJpbmcodW5kZWZpbmVkLCB7IHN1cHBvcnRIdG1sOiB0cnVlIH0pO1xuXHRcdFx0bWRzLmFwcGVuZE1hcmtkb3duKCdhPGIgb25jbGljaz1cImFsZXJ0KDEpXCI+YjwvYj48c2NyaXB0PmFsZXJ0KDIpPC9zY3JpcHQ+YycpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzdG9yZS5hZGQocmVuZGVyTWFya2Rvd24obWRzKSkuZWxlbWVudDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5uZXJIVE1MLCBgPHA+YTxiPmI8L2I+YzwvcD5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1Nob3VsZCBub3QgcmVuZGVyIGh0bWwgYXBwZW5kZWQgYXMgdGV4dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1kcyA9IG5ldyBNYXJrZG93blN0cmluZyh1bmRlZmluZWQsIHsgc3VwcG9ydEh0bWw6IHRydWUgfSk7XG5cdFx0XHRtZHMuYXBwZW5kVGV4dCgnYTxiPmI8L2I+YycpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzdG9yZS5hZGQocmVuZGVyTWFya2Rvd24obWRzKSkuZWxlbWVudDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5uZXJIVE1MLCBgPHA+YSZsdDtiJmd0O2ImbHQ7L2ImZ3Q7YzwvcD5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1Nob3VsZCByZW5kZXIgaHRtbCBpbWFnZXMnLCAoKSA9PiB7XG5cdFx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtZHMgPSBuZXcgTWFya2Rvd25TdHJpbmcodW5kZWZpbmVkLCB7IHN1cHBvcnRIdG1sOiB0cnVlIH0pO1xuXHRcdFx0bWRzLmFwcGVuZE1hcmtkb3duKGA8aW1nIHNyYz1cImh0dHA6Ly9leGFtcGxlLmNvbS9jYXQuZ2lmXCI+YCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtZHMpKS5lbGVtZW50O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbm5lckhUTUwsIGA8aW1nIHNyYz1cImh0dHA6Ly9leGFtcGxlLmNvbS9jYXQuZ2lmXCI+YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdTaG91bGQgcmVuZGVyIGh0bWwgaW1hZ2VzIHdpdGggZmlsZSB1cmkgYXMgc2FtZSBvcmlnaW4gdXJpJywgKCkgPT4ge1xuXHRcdFx0aWYgKGlzV2ViKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbWRzID0gbmV3IE1hcmtkb3duU3RyaW5nKHVuZGVmaW5lZCwgeyBzdXBwb3J0SHRtbDogdHJ1ZSB9KTtcblx0XHRcdG1kcy5hcHBlbmRNYXJrZG93bihgPGltZyBzcmM9XCJmaWxlOi8vL2ltYWdlcy9jYXQuZ2lmXCI+YCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtZHMpKS5lbGVtZW50O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbm5lckhUTUwsIGA8aW1nIHNyYz1cInZzY29kZS1maWxlOi8vdnNjb2RlLWFwcC9pbWFnZXMvY2F0LmdpZlwiPmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnU2hvdWxkIG9ubHkgYWxsb3cgY2hlY2tib3ggaW5wdXRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWRzID0gbmV3IE1hcmtkb3duU3RyaW5nKFxuXHRcdFx0XHQndGV4dDogPGlucHV0IHR5cGU9XCJ0ZXh0XCI+XFxuY2hlY2tib3g6PGlucHV0IHR5cGU9XCJjaGVja2JveFwiPicsXG5cdFx0XHRcdHsgc3VwcG9ydEh0bWw6IHRydWUgfSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHN0b3JlLmFkZChyZW5kZXJNYXJrZG93bihtZHMpKS5lbGVtZW50O1xuXG5cdFx0XHQvLyBJbnB1dHMgc2hvdWxkIGFsd2F5cyBiZSBkaXNhYmxlZCB0b29cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW5uZXJIVE1MLCBgPHA+dGV4dDogXFxuY2hlY2tib3g6PGlucHV0IHR5cGU9XCJjaGVja2JveFwiIGRpc2FibGVkPVwiXCI+PC9wPmApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZmlsbEluSW5jb21wbGV0ZVRva2VucycsICgpID0+IHtcblx0XHRmdW5jdGlvbiBpZ25vcmVSYXcoLi4udG9rZW5MaXN0czogbWFya2VkLlRva2VuW11bXSk6IHZvaWQge1xuXHRcdFx0dG9rZW5MaXN0cy5mb3JFYWNoKHRva2VucyA9PiB7XG5cdFx0XHRcdHRva2Vucy5mb3JFYWNoKHQgPT4gdC5yYXcgPSAnJyk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBjb21wbGV0ZVRhYmxlID0gJ3wgYSB8IGIgfFxcbnwgLS0tIHwgLS0tIHwnO1xuXG5cdFx0c3VpdGUoJ3RhYmxlJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnY29tcGxldGUgdGFibGUnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoY29tcGxldGVUYWJsZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblx0XHRcdFx0YXNzZXJ0LmVxdWFsKG5ld1Rva2VucywgdG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdmdWxsIGhlYWRlciBvbmx5JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlVGFibGUgPSAnfCBhIHwgYiB8Jztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlVGFibGUpO1xuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRhYmxlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihjb21wbGV0ZVRhYmxlKTtcblxuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRhYmxlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdmdWxsIGhlYWRlciBvbmx5IHdpdGggdHJhaWxpbmcgc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGVUYWJsZSA9ICd8IGEgfCBiIHwgJztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlVGFibGUpO1xuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRhYmxlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihjb21wbGV0ZVRhYmxlKTtcblxuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cdFx0XHRcdGlmIChuZXdUb2tlbnMpIHtcblx0XHRcdFx0XHRpZ25vcmVSYXcobmV3VG9rZW5zLCBjb21wbGV0ZVRhYmxlVG9rZW5zKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUYWJsZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnaW5jb21wbGV0ZSBoZWFkZXInLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGVUYWJsZSA9ICd8IGEgfCBiJztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlVGFibGUpO1xuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRhYmxlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihjb21wbGV0ZVRhYmxlKTtcblxuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0aWYgKG5ld1Rva2Vucykge1xuXHRcdFx0XHRcdGlnbm9yZVJhdyhuZXdUb2tlbnMsIGNvbXBsZXRlVGFibGVUb2tlbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRhYmxlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdpbmNvbXBsZXRlIGhlYWRlciBvbmUgY29sdW1uJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlVGFibGUgPSAnfCBhICc7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZVRhYmxlKTtcblx0XHRcdFx0Y29uc3QgY29tcGxldGVUYWJsZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZVRhYmxlICsgJ3xcXG58IC0tLSB8Jyk7XG5cblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGlmIChuZXdUb2tlbnMpIHtcblx0XHRcdFx0XHRpZ25vcmVSYXcobmV3VG9rZW5zLCBjb21wbGV0ZVRhYmxlVG9rZW5zKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUYWJsZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZnVsbCBoZWFkZXIgd2l0aCBleHRyYXMnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGVUYWJsZSA9ICd8IGEgKipib2xkKiogfCBiIF9pdGFsaWNzXyB8Jztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlVGFibGUpO1xuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRhYmxlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlVGFibGUgKyAnXFxufCAtLS0gfCAtLS0gfCcpO1xuXG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVGFibGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2Z1bGwgaGVhZGVyIHdpdGggbGVhZGluZyB0ZXh0JywgKCkgPT4ge1xuXHRcdFx0XHQvLyBQYXJzaW5nIHRoaXMgZ2l2ZXMgb25lIHRva2VuIGFuZCBvbmUgJ3RleHQnIHN1YnRva2VuXG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGVUYWJsZSA9ICdoZXJlIGlzIGEgdGFibGVcXG58IGEgfCBiIHwnO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGVUYWJsZSk7XG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVGFibGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGVUYWJsZSArICdcXG58IC0tLSB8IC0tLSB8Jyk7XG5cblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUYWJsZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZnVsbCBoZWFkZXIgd2l0aCBsZWFkaW5nIG90aGVyIHN0dWZmJywgKCkgPT4ge1xuXHRcdFx0XHQvLyBQYXJzaW5nIHRoaXMgZ2l2ZXMgb25lIHRva2VuIGFuZCBvbmUgJ3RleHQnIHN1YnRva2VuXG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGVUYWJsZSA9ICdgYGBqc1xcbmNvbnN0IHh5eiA9IDEyMztcXG5gYGBcXG58IGEgfCBiIHwnO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGVUYWJsZSk7XG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVGFibGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGVUYWJsZSArICdcXG58IC0tLSB8IC0tLSB8Jyk7XG5cblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUYWJsZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZnVsbCBoZWFkZXIgd2l0aCBpbmNvbXBsZXRlIHNlcGFyYXRvcicsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZVRhYmxlID0gJ3wgYSB8IGIgfFxcbnwgLS0tJztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlVGFibGUpO1xuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRhYmxlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihjb21wbGV0ZVRhYmxlKTtcblxuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRhYmxlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdmdWxsIGhlYWRlciB3aXRoIGluY29tcGxldGUgc2VwYXJhdG9yIDInLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGVUYWJsZSA9ICd8IGEgfCBiIHxcXG58IC0tLSB8Jztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlVGFibGUpO1xuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRhYmxlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihjb21wbGV0ZVRhYmxlKTtcblxuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRhYmxlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdmdWxsIGhlYWRlciB3aXRoIGluY29tcGxldGUgc2VwYXJhdG9yIDMnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGVUYWJsZSA9ICd8IGEgfCBiIHxcXG58Jztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlVGFibGUpO1xuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRhYmxlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihjb21wbGV0ZVRhYmxlKTtcblxuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRhYmxlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdub3QgYSB0YWJsZScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZVRhYmxlID0gJ3wgYSB8IGIgfFxcbnNvbWUgdGV4dCc7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZVRhYmxlKTtcblxuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCB0b2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ25vdCBhIHRhYmxlIDInLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGVUYWJsZSA9ICd8IGEgfCBiIHxcXG58IC0tLSB8XFxuc29tZSB0ZXh0Jztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlVGFibGUpO1xuXG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIHRva2Vucyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdGZ1bmN0aW9uIHNpbXBsZU1hcmtkb3duVGVzdFN1aXRlKG5hbWU6IHN0cmluZywgZGVsaW1pdGVyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdHRlc3QoYGluY29tcGxldGUgJHtuYW1lfWAsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9IGAke2RlbGltaXRlcn1jb2RlYDtcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlICsgZGVsaW1pdGVyKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KGBjb21wbGV0ZSAke25hbWV9YCwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gYGxlYWRpbmcgdGV4dCAke2RlbGltaXRlcn1jb2RlJHtkZWxpbWl0ZXJ9IHRyYWlsaW5nIHRleHRgO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKHRleHQpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIHRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdChgJHtuYW1lfSB3aXRoIGxlYWRpbmcgdGV4dGAsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9IGBzb21lIHRleHQgYW5kICR7ZGVsaW1pdGVyfXNvbWUgY29kZWA7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArIGRlbGltaXRlcik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdChgJHtuYW1lfSB3aXRoIHRyYWlsaW5nIHNwYWNlYCwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gYHNvbWUgdGV4dCBhbmQgJHtkZWxpbWl0ZXJ9c29tZSBjb2RlIGA7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZS50cmltRW5kKCkgKyBkZWxpbWl0ZXIpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoYHNpbmdsZSBsb29zZSBcIiR7ZGVsaW1pdGVyfVwiYCwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gYHNvbWUgdGV4dCBhbmQgJHtkZWxpbWl0ZXJ9YnkgaXRzZWxmXFxubW9yZSB0ZXh0IGhlcmVgO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKHRleHQpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIHRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdChgaW5jb21wbGV0ZSAke25hbWV9IGFmdGVyIG5ld2xpbmVgLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSBgc29tZSB0ZXh0XFxubW9yZSB0ZXh0IGhlcmUgYW5kICR7ZGVsaW1pdGVyfXRleHRgO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKHRleHQpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKHRleHQgKyBkZWxpbWl0ZXIpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoYGluY29tcGxldGUgYWZ0ZXIgY29tcGxldGUgJHtuYW1lfWAsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IGBsZWFkaW5nIHRleHQgJHtkZWxpbWl0ZXJ9Y29kZSR7ZGVsaW1pdGVyfSB0cmFpbGluZyB0ZXh0IGFuZCAke2RlbGltaXRlcn1hbm90aGVyYDtcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcih0ZXh0KTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcih0ZXh0ICsgZGVsaW1pdGVyKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KGBpbmNvbXBsZXRlICR7bmFtZX0gaW4gbGlzdGAsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IGAtIGxpc3QgaXRlbSBvbmVcXG4tIGxpc3QgaXRlbSB0d28gYW5kICR7ZGVsaW1pdGVyfXRleHRgO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKHRleHQpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKHRleHQgKyBkZWxpbWl0ZXIpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoYGluY29tcGxldGUgJHtuYW1lfSBpbiBhc3RlcmlzayBsaXN0YCwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gYCogbGlzdCBpdGVtIG9uZVxcbiogbGlzdCBpdGVtIHR3byBhbmQgJHtkZWxpbWl0ZXJ9dGV4dGA7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIodGV4dCk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIodGV4dCArIGRlbGltaXRlcik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdChgaW5jb21wbGV0ZSAke25hbWV9IGluIG51bWJlcmVkIGxpc3RgLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSBgMS4gbGlzdCBpdGVtIG9uZVxcbjIuIGxpc3QgaXRlbSB0d28gYW5kICR7ZGVsaW1pdGVyfXRleHRgO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKHRleHQpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKHRleHQgKyBkZWxpbWl0ZXIpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0c3VpdGUoJ2xpc3QnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdsaXN0IHdpdGggY29tcGxldGUgY29kZWJsb2NrJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBsaXN0ID0gYC1cblx0XFxgXFxgXFxganNcblx0bGV0IHggPSAxO1xuXHRcXGBcXGBcXGBcbi0gbGlzdCBpdGVtIHR3b1xuYDtcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihsaXN0KTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCB0b2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3Quc2tpcCgnbGlzdCB3aXRoIGluY29tcGxldGUgY29kZWJsb2NrJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gYC0gbGlzdCBpdGVtIG9uZVxuXG5cdFxcYFxcYFxcYGpzXG5cdGxldCB4ID0gMTtgO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUgKyAnXFxuXHRgYGAnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdsaXN0IHdpdGggc3ViaXRlbXMnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGxpc3QgPSBgLSBoZWxsb1xuXHQtIHN1YiBpdGVtXG4tIHRleHRcblx0bmV3bGluZSBmb3Igc29tZSByZWFzb25cbmA7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIobGlzdCk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgdG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdvcmRlcmVkIGxpc3Qgd2l0aCBzdWJpdGVtcycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgbGlzdCA9IGAxLiBoZWxsb1xuXHQtIHN1YiBpdGVtXG4yLiB0ZXh0XG5cdG5ld2xpbmUgZm9yIHNvbWUgcmVhc29uXG5gO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGxpc3QpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIHRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnbGlzdCB3aXRoIHN0dWZmJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBsaXN0ID0gYC0gbGlzdCBpdGVtIG9uZSBcXGBjb2Rlc3BhblxcYCAqKmJvbGQqKiBbbGlua10oaHR0cDovL21pY3Jvc29mdC5jb20pIG1vcmUgdGV4dGA7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIobGlzdCk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgdG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdsaXN0IHdpdGggaW5jb21wbGV0ZSBsaW5rIHRleHQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSBgLSBsaXN0IGl0ZW0gb25lXG4tIGl0ZW0gdHdvIFtsaW5rYDtcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlICsgJ10oaHR0cHM6Ly9taWNyb3NvZnQuY29tKScpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2xpc3Qgd2l0aCBpbmNvbXBsZXRlIGxpbmsgdGFyZ2V0JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gYC0gbGlzdCBpdGVtIG9uZVxuLSBpdGVtIHR3byBbbGlua10oYDtcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlICsgJyknKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdvcmRlcmVkIGxpc3Qgd2l0aCBpbmNvbXBsZXRlIGxpbmsgdGFyZ2V0JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gYDEuIGxpc3QgaXRlbSBvbmVcbjIuIGl0ZW0gdHdvIFtsaW5rXShgO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUgKyAnKScpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ29yZGVyZWQgbGlzdCB3aXRoIGV4dHJhIHdoaXRlc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSBgMS4gbGlzdCBpdGVtIG9uZVxuMi4gaXRlbSB0d28gW2xpbmtdKGA7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArICcpJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnbGlzdCB3aXRoIGV4dHJhIHdoaXRlc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSBgLSBsaXN0IGl0ZW0gb25lXG4tIGl0ZW0gdHdvIFtsaW5rXShgO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUgKyAnKScpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2xpc3Qgd2l0aCBpbmNvbXBsZXRlIGxpbmsgd2l0aCBvdGhlciBzdHVmZicsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9IGAtIGxpc3QgaXRlbSBvbmVcbi0gaXRlbSB0d28gW1xcYGxpbmtgO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUgKyAnXFxgXShodHRwczovL21pY3Jvc29mdC5jb20pJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnb3JkZXJlZCBsaXN0IHdpdGggaW5jb21wbGV0ZSBsaW5rIHdpdGggb3RoZXIgc3R1ZmYnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSBgMS4gbGlzdCBpdGVtIG9uZVxuMS4gaXRlbSB0d28gW1xcYGxpbmtgO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUgKyAnXFxgXShodHRwczovL21pY3Jvc29mdC5jb20pJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnbGlzdCB3aXRoIGJvbGQgaW5jb21wbGV0ZSBsaW5rIHRhcmdldCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9IGAtIGxpc3QgaXRlbSBvbmVcbi0gKipbbGlua10oaHR0cDovL21pY3Jvc29mdGA7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArICcpKionKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdvcmRlcmVkIGxpc3Qgd2l0aCBib2xkIGluY29tcGxldGUgbGluayB0YXJnZXQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSBgMS4gbGlzdCBpdGVtIG9uZVxuMi4gKipbbGlua10oaHR0cDovL21pY3Jvc29mdGA7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArICcpKionKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdsaXN0IHdpdGggaW5jb21wbGV0ZSBzdWJpdGVtJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gYDEuIGxpc3QgaXRlbSBvbmVcblx0LSBgO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUgKyAnJm5ic3A7Jyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnbGlzdCB3aXRoIGluY29tcGxldGUgbmVzdGVkIHN1Yml0ZW0nLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSBgMS4gbGlzdCBpdGVtIG9uZVxuXHQtIGl0ZW0gMlxuXHRcdC0gYDtcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlICsgJyZuYnNwOycpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3RleHQgd2l0aCBzdGFydCBvZiBsaXN0IGlzIG5vdCBhIGhlYWRpbmcnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSBgaGVsbG9cXG4tIGA7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArICcgJm5ic3A7Jyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZXZlbiBtb3JlIHRleHQgd2l0aCBzdGFydCBvZiBsaXN0IGlzIG5vdCBhIGhlYWRpbmcnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSBgIyBoZWxsb1xcblxcbnRleHRcXG4tYDtcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlICsgJyAmbmJzcDsnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ2Jsb2NrcXVvdGUnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdpbmNvbXBsZXRlIGRvdWJsZSBzdGFyJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gJz4gKip0ZXh0Jztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlICsgJyoqJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnaW5jb21wbGV0ZSBkb3VibGUgc3RhciBiZWZvcmUgdHJhaWxpbmcgcXVvdGUtb25seSBsaW5lcycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9ICc+ICoqdGV4dFxcbj5cXG4+Jztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcignPiAqKnRleHQqKlxcbj5cXG4+Jyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncHJlc2VydmVzIHJlZmVyZW5jZSBsaW5rcyB3aGVuIGNvbXBsZXRpbmcgaW5saW5lIHRva2VucycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9ICdbaWRdOiBodHRwczovL2V4YW1wbGUuY29tXFxuXFxuPiBbbGFiZWxdW2lkXSAqKnRleHQnO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUgKyAnKionKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ2NvZGVzcGFuJywgKCkgPT4ge1xuXHRcdFx0c2ltcGxlTWFya2Rvd25UZXN0U3VpdGUoJ2NvZGVzcGFuJywgJ2AnKTtcblxuXHRcdFx0dGVzdChgYmFja3RpY2sgYmV0d2VlbiBsZXR0ZXJzYCwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gJ2FgYic7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIodGV4dCk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZUNvZGVzcGFuVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcih0ZXh0ICsgJ2AnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlQ29kZXNwYW5Ub2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoYG5lc3RlZCBwYXR0ZXJuYCwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gJ3NsZGtmanNkIGBhYmMgX19kZWZfXyBnaGknO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKHRleHQpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKHRleHQgKyAnYCcpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2NvZGVzcGFuIGluc2lkZSA8Ym9keT4gd3JhcHBlZCBtYXJrZG93bicsICgpID0+IHtcblx0XHRcdFx0Ly8gVGhlIGNoYXQgY29udGVudCByZW5kZXJlciB3cmFwcyBgc3VwcG9ydEh0bWxgIG1hcmtkb3duIGluXG5cdFx0XHRcdC8vIGA8Ym9keT4uLi48L2JvZHk+YCBzbyBkb21wdXJpZnkga2VlcHMgbGVhZGluZyBjb21tZW50cy4gVGhhdFxuXHRcdFx0XHQvLyBtYWtlcyBgPC9ib2R5PmAgdGhlIGxpdGVyYWwgbGFzdCB0b2tlbiBcdTIwMTQgdGhlIHBhcmFncmFwaCB3aXRoXG5cdFx0XHRcdC8vIHRoZSBiYXJlIGJhY2t0aWNrIGlzIG5vIGxvbmdlciBhdCB0aGUgZW5kLiBUaGUgZml4dXAgbXVzdFxuXHRcdFx0XHQvLyBzdGlsbCBjbG9zZSB0aGUgY29kZXNwYW4gd2hpbGUgcHJlc2VydmluZyB0aGUgdHJhaWxpbmcgaHRtbC5cblx0XHRcdFx0Y29uc3QgdGV4dCA9ICc8Ym9keT5cXG5cXG5DcmVhdGVkIGlzb2xhdGVkIHdvcmt0cmVlIGZvciBicmFuY2ggYHh5elxcblxcbjwvYm9keT4nO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKHRleHQpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKCc8Ym9keT5cXG5cXG5DcmVhdGVkIGlzb2xhdGVkIHdvcmt0cmVlIGZvciBicmFuY2ggYHh5emBcXG5cXG48L2JvZHk+Jyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdzdGFyJywgKCkgPT4ge1xuXHRcdFx0c2ltcGxlTWFya2Rvd25UZXN0U3VpdGUoJ3N0YXInLCAnKicpO1xuXG5cdFx0XHR0ZXN0KGBzdGFyIGJldHdlZW4gbGV0dGVyc2AsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgdGV4dCA9ICdzbGRrZmpzZCBhKmInO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKHRleHQpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKHRleHQgKyAnKicpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoYG5lc3RlZCBwYXR0ZXJuYCwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gJ3NsZGtmanNkICphYmMgX19kZWZfXyBnaGknO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKHRleHQpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKHRleHQgKyAnKicpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnZG91YmxlIHN0YXInLCAoKSA9PiB7XG5cdFx0XHRzaW1wbGVNYXJrZG93blRlc3RTdWl0ZSgnZG91YmxlIHN0YXInLCAnKionKTtcblxuXHRcdFx0dGVzdChgZG91YmxlIHN0YXIgYmV0d2VlbiBsZXR0ZXJzYCwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gJ2EqKmInO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKHRleHQpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKHRleHQgKyAnKionKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBUT0RPIHRyaW0gdGhlc2UgcGF0dGVybnMgZnJvbSBlbmRcblx0XHRcdHRlc3Quc2tpcChgZW5kaW5nIGluIGRvdWJsZXN0YXJgLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSBgc29tZSB0ZXh0IGFuZCAqKmA7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZS50cmltRW5kKCkgKyAnKionKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ3VuZGVyc2NvcmUnLCAoKSA9PiB7XG5cdFx0XHRzaW1wbGVNYXJrZG93blRlc3RTdWl0ZSgndW5kZXJzY29yZScsICdfJyk7XG5cblx0XHRcdHRlc3QoYHVuZGVyc2NvcmUgYmV0d2VlbiBsZXR0ZXJzYCwgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB0ZXh0ID0gYHRoaXNfbm90X2l0YWxpY3NgO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKHRleHQpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIHRva2Vucyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdkb3VibGUgdW5kZXJzY29yZScsICgpID0+IHtcblx0XHRcdHNpbXBsZU1hcmtkb3duVGVzdFN1aXRlKCdkb3VibGUgdW5kZXJzY29yZScsICdfXycpO1xuXG5cdFx0XHR0ZXN0KGBkb3VibGUgdW5kZXJzY29yZSBiZXR3ZWVuIGxldHRlcnNgLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRleHQgPSBgdGhpc19fbm90X19ib2xkYDtcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcih0ZXh0KTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCB0b2tlbnMpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnbGluaycsICgpID0+IHtcblx0XHRcdHRlc3QoJ2luY29tcGxldGUgbGluayB0ZXh0JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gJ2FiYyBbdGV4dCc7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArICddKGh0dHBzOi8vbWljcm9zb2Z0LmNvbSknKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdpbmNvbXBsZXRlIGxpbmsgdGFyZ2V0JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gJ2ZvbyBbdGV4dF0oaHR0cDovL21pY3Jvc29mdCc7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArICcpJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnaW5jb21wbGV0ZSBsaW5rIHRhcmdldCAyJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gJ2ZvbyBbdGV4dF0oaHR0cDovL21pY3Jvc29mdC5jb20nO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUgKyAnKScpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2luY29tcGxldGUgbGluayB0YXJnZXQgaW5zaWRlIHBhcmVudGhlc2VzJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gJyhbdGV4dF0oaHR0cDovL21pY3Jvc29mdC5jb20nO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUgKyAnKScpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2luY29tcGxldGUgbGluayB0YXJnZXQgd2l0aCBleHRyYSBzdHVmZicsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9ICdbYmVmb3JlIGB0ZXh0YCBhZnRlcl0oaHR0cDovL21pY3Jvc29mdC5jb20nO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUgKyAnKScpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2luY29tcGxldGUgbGluayB0YXJnZXQgd2l0aCBleHRyYSBzdHVmZiBhbmQgaW5jb21wbGV0ZSBhcmcnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSAnW2JlZm9yZSBgdGV4dGAgYWZ0ZXJdKGh0dHA6Ly9taWNyb3NvZnQuY29tIFwibW9yZSB0ZXh0ICc7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArICdcIiknKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdpbmNvbXBsZXRlIGxpbmsgdGFyZ2V0IHdpdGggaW5jb21wbGV0ZSBhcmcnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSAnZm9vIFt0ZXh0XShodHRwOi8vbWljcm9zb2Z0LmNvbSBcIm1vcmUgdGV4dCBoZXJlICc7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArICdcIiknKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdpbmNvbXBsZXRlIGxpbmsgdGFyZ2V0IHdpdGggaW5jb21wbGV0ZSBhcmcgMicsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9ICdbdGV4dF0oY29tbWFuZDp2c2NvZGUub3BlblJlbGF0aXZlUGF0aCBcImFyZyc7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArICdcIiknKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdpbmNvbXBsZXRlIGxpbmsgdGFyZ2V0IHdpdGggY29tcGxldGUgYXJnJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gJ2ZvbyBbdGV4dF0oaHR0cDovL21pY3Jvc29mdC5jb20gXCJtb3JlIHRleHQgaGVyZVwiJztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlICsgJyknKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdsaW5rIHRleHQgd2l0aCBpbmNvbXBsZXRlIGNvZGVzcGFuJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gYHRleHQgW1xcYGNvZGVzcGFuYDtcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlICsgJ2BdKGh0dHBzOi8vbWljcm9zb2Z0LmNvbSknKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdsaW5rIHRleHQgd2l0aCBpbmNvbXBsZXRlIHN0dWZmJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gYHRleHQgW21vcmUgdGV4dCBcXGBjb2Rlc3BhblxcYCB0ZXh0ICoqYm9sZGA7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArICcqKl0oaHR0cHM6Ly9taWNyb3NvZnQuY29tKScpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgY29tcGxldGVUb2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ0xvb2tzIGxpa2UgaW5jb21wbGV0ZSBsaW5rIHRhcmdldCBidXQgaXNuXFwndCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29tcGxldGUgPSAnKipib2xkKiogYGNvZGVzcGFuYCB0ZXh0XSgnO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlVG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihjb21wbGV0ZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnaW5jb21wbGV0ZSBsaW5rIGluIGxpc3QnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSAnLSBbdGV4dCc7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRjb25zdCBjb21wbGV0ZVRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSArICddKGh0dHBzOi8vbWljcm9zb2Z0LmNvbSknKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdpbmNvbXBsZXRlIGxpbmsgdGFyZ2V0IGluc2lkZSBib2xkJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gJyoqW3RleHRdKGh0dHA6Ly9taWNyb3NvZnQnO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUgKyAnKSoqJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCBjb21wbGV0ZVRva2Vucyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnaW5jb21wbGV0ZSBsaW5rIHRhcmdldCB3aXRoIGFyZyBpbnNpZGUgYm9sZCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9ICcqKlt0ZXh0XShodHRwOi8vbWljcm9zb2Z0LmNvbSBcIm1vcmUgdGV4dCAnO1xuXHRcdFx0XHRjb25zdCB0b2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUpO1xuXHRcdFx0XHRjb25zdCBuZXdUb2tlbnMgPSBmaWxsSW5JbmNvbXBsZXRlVG9rZW5zKHRva2Vucyk7XG5cblx0XHRcdFx0Y29uc3QgY29tcGxldGVUb2tlbnMgPSBtYXJrZWQubWFya2VkLmxleGVyKGluY29tcGxldGUgKyAnXCIpKionKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXdUb2tlbnMsIGNvbXBsZXRlVG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdzcXVhcmUgYnJhY2UgYmV0d2VlbiBsZXR0ZXJzJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbmNvbXBsZXRlID0gJ2FbYic7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgdG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdzcXVhcmUgYnJhY2Ugb24gcHJldmlvdXMgbGluZScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgaW5jb21wbGV0ZSA9ICd0ZXh0W1xcbm1vcmUgdGV4dCc7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IG1hcmtlZC5tYXJrZWQubGV4ZXIoaW5jb21wbGV0ZSk7XG5cdFx0XHRcdGNvbnN0IG5ld1Rva2VucyA9IGZpbGxJbkluY29tcGxldGVUb2tlbnModG9rZW5zKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5ld1Rva2VucywgdG9rZW5zKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdzcXVhcmUgYnJhY2VzIGluIHRleHQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSAnaGVsbG8gW3doYXRdIGlzIGdvaW5nIG9uJztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCB0b2tlbnMpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2NvbXBsZXRlIGxpbmsnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGluY29tcGxldGUgPSAndGV4dCBbbGlua10oaHR0cDovL21pY3Jvc29mdC5jb20pJztcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbWFya2VkLm1hcmtlZC5sZXhlcihpbmNvbXBsZXRlKTtcblx0XHRcdFx0Y29uc3QgbmV3VG9rZW5zID0gZmlsbEluSW5jb21wbGV0ZVRva2Vucyh0b2tlbnMpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobmV3VG9rZW5zLCB0b2tlbnMpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx3QkFBd0IsZ0JBQWdCLHlCQUF5QjtBQUMxRSxTQUEwQixzQkFB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
