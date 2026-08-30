import assert from "assert";
import { convertHtmlToMarkdown } from "../../../../../../base/browser/htmlToMarkdown.js";
import { toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { sanitizeChatClipboardFragment, toPortableMarkdown } from "../../../browser/widget/chatClipboard.js";
function toFragment(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content;
}
function sanitizeToHtml(html) {
  const fragment = toFragment(html);
  sanitizeChatClipboardFragment(fragment);
  const holder = document.createElement("div");
  holder.appendChild(fragment);
  return holder.innerHTML;
}
suite("ChatClipboard", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("reports whether the selection had to change", () => {
    assert.deepStrictEqual(
      [
        sanitizeChatClipboardFragment(toFragment('<a href="https://example.com">Example</a>')),
        sanitizeChatClipboardFragment(toFragment('<a href="" data-href="file:///repo/a.ts">a.ts</a>'))
      ],
      [false, true]
    );
  });
  test("replaces internal resource links with their visible label as code", () => {
    assert.strictEqual(
      sanitizeToHtml('<p>See <a href="" data-href="file:///repo/src/config.ts">config.ts</a> for details.</p>'),
      "<p>See <code>config.ts</code> for details.</p>"
    );
  });
  test("replaces images addressed by local paths", () => {
    assert.deepStrictEqual(
      [
        sanitizeToHtml('<p><img src="vscode-file://vscode-app/Users/me/shot.png" alt="screenshot"></p>'),
        sanitizeToHtml('<p><img src="https://example.com/a.png" alt="remote"></p>')
      ],
      [
        "<p><code>screenshot</code></p>",
        '<p><img src="https://example.com/a.png" alt="remote"></p>'
      ]
    );
  });
  test("keeps portable links and drops their routing metadata", () => {
    assert.strictEqual(
      sanitizeToHtml('<a href="https://example.com/page" data-href="https://example.com/page">Example</a>'),
      '<a href="https://example.com/page">Example</a>'
    );
  });
  test("uses the rendered label of an inline anchor widget", () => {
    assert.strictEqual(
      sanitizeToHtml('<a class="chat-inline-anchor-widget show-file-icons" href="" data-href="file:///repo/foo.js#42,1"><span class="icon"></span><span class="icon-label">foo.js<span class="label-suffix">:42</span></span></a>'),
      "<code>foo.js:42</code>"
    );
  });
  test("drops internal links that render no visible text", () => {
    assert.strictEqual(
      sanitizeToHtml('<p>before <a href="" data-href="file:///repo/a.ts"></a>after</p>'),
      "<p>before after</p>"
    );
  });
  test("sanitizes a fragment from an auxiliary window", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    disposables.add(toDisposable(() => iframe.remove()));
    const auxiliaryDocument = iframe.contentDocument;
    const fragment = auxiliaryDocument.createDocumentFragment();
    const anchor = auxiliaryDocument.createElement("a");
    anchor.setAttribute("data-href", "file:///repo/a.ts");
    anchor.textContent = "a.ts";
    fragment.appendChild(anchor);
    const createElement = auxiliaryDocument.createElement;
    auxiliaryDocument.createElement = () => {
      throw new Error("Not allowed to create elements in child window JavaScript context.");
    };
    disposables.add(toDisposable(() => auxiliaryDocument.createElement = createElement));
    sanitizeChatClipboardFragment(fragment);
    const replacement = fragment.firstElementChild;
    assert.deepStrictEqual({
      html: replacement?.outerHTML,
      ownerDocument: replacement?.ownerDocument === auxiliaryDocument,
      mainRealmElement: replacement instanceof HTMLElement
    }, {
      html: "<code>a.ts</code>",
      ownerDocument: true,
      mainRealmElement: true
    });
  });
  test("produces markdown without internal targets when pasted back into chat", () => {
    const copied = sanitizeToHtml(
      '<p>This is <strong>inherited</strong> from the <a href="" data-href="file:///repo/src/FooBar.ts">FooBar</a> class. See <a href="https://example.com/docs" data-href="https://example.com/docs">the docs</a>.</p>'
    );
    assert.strictEqual(
      convertHtmlToMarkdown(copied),
      "This is **inherited** from the `FooBar` class. See [the docs](https://example.com/docs)."
    );
  });
  suite("toPortableMarkdown", () => {
    test("reduces non-portable link targets to their label", () => {
      assert.deepStrictEqual(
        [
          // Agent host sessions are instructed to emit absolute filesystem targets.
          toPortableMarkdown("Updated [src/a.ts](/Users/me/repo/src/a.ts) and [b.ts](c:/repo/b.ts)."),
          toPortableMarkdown("See [config](file:///repo/config.json)."),
          toPortableMarkdown("See [index.ts](http://_vscodecontentref_/0)."),
          toPortableMarkdown("See [a.ts](code-oss://file/repo/a.ts).")
        ],
        ["Updated `src/a.ts` and `b.ts`.", "See `config`.", "See `index.ts`.", "See `a.ts`."]
      );
    });
    test("keeps links that stay meaningful wherever the markdown lands", () => {
      const markdown = "See [the docs](https://example.com/docs), [mail us](mailto:team@example.com), [details](#details) and [guide](../CONTRIBUTING.md).";
      assert.strictEqual(toPortableMarkdown(markdown), markdown);
    });
    test("scrubs the target of a link whose source cannot be located", () => {
      assert.deepStrictEqual(
        [
          toPortableMarkdown("> [foo\n> bar](/Users/alice/private/a.ts)\n"),
          toPortableMarkdown("- [foo\n  bar](/Users/alice/private/a.ts)\n")
        ],
        ["> [foo\n> bar]()\n", "- [foo\n  bar]()\n"]
      );
    });
    test("visits an image nested inside a link that is kept", () => {
      assert.strictEqual(
        toPortableMarkdown("[![diagram](/Users/me/private.png)](https://example.com)"),
        "[`diagram`](https://example.com)"
      );
    });
    test("removes a definition whose destination sits on the next line", () => {
      assert.strictEqual(
        toPortableMarkdown("See [d][r].\n\n[r]:\n  /Users/alice/a.ts\n"),
        "See `d`.\n\n"
      );
    });
    test("leaves content that merely follows a definition", () => {
      assert.strictEqual(
        toPortableMarkdown("See [d][r].\n\n[r]: /Users/alice/a.ts\n\n    indented code\n"),
        "See `d`.\n\n    indented code\n"
      );
    });
    test("takes a definition whole however it wraps", () => {
      assert.deepStrictEqual(
        [
          toPortableMarkdown('See [d][r].\n\n[r]: /Users/alice/a.ts "Title"\n'),
          toPortableMarkdown('See [d][r].\n\n[r]: /Users/alice/a.ts\n  "Title"\n')
        ],
        ["See `d`.\n\n", "See `d`.\n\n"]
      );
    });
    test("keeps a reference working by giving it its own target", () => {
      assert.deepStrictEqual(
        [
          toPortableMarkdown("A [x][1] B [y][2].\n\n[1]: /p/a.ts\n[2]: https://ok.com\n"),
          toPortableMarkdown("See [r].\n\n[r]: https://ok.com\n"),
          toPortableMarkdown("![alt][r]\n\n[r]: https://ok.com/x.png\n"),
          toPortableMarkdown('See [d][r].\n\n[r]: https://ok.com "T"\n')
        ],
        [
          "A `x` B [y](https://ok.com).\n\n",
          "See [r](https://ok.com).\n\n",
          "![alt](https://ok.com/x.png)\n\n",
          'See [d](https://ok.com "T").\n\n'
        ]
      );
    });
    test("drops a definition nothing refers to", () => {
      assert.strictEqual(toPortableMarkdown("Nothing here.\n\n[r]: /p/a.ts\n"), "Nothing here.\n\n");
    });
    test("leaves a definition the parser accounted for as content", () => {
      assert.deepStrictEqual(
        [
          toPortableMarkdown("```\n[r]: /Users/alice/a.ts\n```\n"),
          toPortableMarkdown("Text here.\n[r]: /Users/alice/a.ts\n")
        ],
        ["```\n[r]: /Users/alice/a.ts\n```\n", "Text here.\n[r]: /Users/alice/a.ts\n"]
      );
    });
    test("scrubs an unlocatable target without touching a sample of it in code", () => {
      assert.strictEqual(
        toPortableMarkdown("Example: `[x](/Users/alice/a.ts)` and\n\n> [foo\n> bar](/Users/alice/a.ts)\n"),
        "Example: `[x](/Users/alice/a.ts)` and\n\n> [foo\n> bar]()\n"
      );
    });
    test("rewrites the real link rather than a lookalike inside code", () => {
      assert.deepStrictEqual(
        [
          toPortableMarkdown("Use `[a.ts](/repo/a.ts)` and then [a.ts](/repo/a.ts) for real."),
          toPortableMarkdown("```\n[a.ts](/repo/a.ts)\n```\n\nSee [a.ts](/repo/a.ts).")
        ],
        [
          "Use `[a.ts](/repo/a.ts)` and then `a.ts` for real.",
          "```\n[a.ts](/repo/a.ts)\n```\n\nSee `a.ts`."
        ]
      );
    });
    test("leaves link syntax inside code spans and code blocks alone", () => {
      const markdown = "Use `[a.ts](/repo/a.ts)` here.\n\n```md\n[b.ts](/repo/b.ts)\n```";
      assert.strictEqual(toPortableMarkdown(markdown), markdown);
    });
    test("removes reference definitions that would strand the target", () => {
      assert.deepStrictEqual(
        [
          toPortableMarkdown("See [docs][ref].\n\n[ref]: /repo/a.ts\n"),
          // CommonMark allows the destination to continue on an indented line.
          toPortableMarkdown("See [docs][ref].\n\n[ref]:\n  /Users/alice/private/a.ts\n")
        ],
        ["See `docs`.\n\n", "See `docs`.\n\n"]
      );
    });
    test("keeps a definition line that only looks like one inside a code block", () => {
      const markdown = "See [docs][ref].\n\n```md\n[ref]: /repo/a.ts\n```\n\n[ref]: /repo/a.ts\n";
      assert.strictEqual(
        toPortableMarkdown(markdown),
        "See `docs`.\n\n```md\n[ref]: /repo/a.ts\n```\n\n"
      );
    });
    test("leaves raw html verbatim", () => {
      assert.deepStrictEqual(
        [
          toPortableMarkdown('<a href="file:///Users/alice/private/a.ts">a.ts</a>'),
          toPortableMarkdown('<div>\nhref="/Users/alice/a.ts" is the syntax\n</div>\n')
        ],
        [
          '<a href="file:///Users/alice/private/a.ts">a.ts</a>',
          '<div>\nhref="/Users/alice/a.ts" is the syntax\n</div>\n'
        ]
      );
    });
    test("reduces images addressed by local paths", () => {
      assert.deepStrictEqual(
        [
          toPortableMarkdown("![diagram](/Users/alice/private/diagram.png)"),
          toPortableMarkdown("[![img](/i.png)](/repo/a.ts)"),
          toPortableMarkdown("![remote](https://example.com/a.png)")
        ],
        [
          "`diagram`",
          "`img`",
          "![remote](https://example.com/a.png)"
        ]
      );
    });
    test("uses the text a reader saw as the label", () => {
      assert.deepStrictEqual(
        [toPortableMarkdown("[**Foo**](/repo/Foo.ts)"), toPortableMarkdown("See [`a.ts`](/repo/a.ts).")],
        ["`Foo`", "See `a.ts`."]
      );
    });
    test("preserves surrounding formatting and repeated labels", () => {
      assert.strictEqual(
        toPortableMarkdown("- **[a.ts](/repo/a.ts)** and [a.ts](/repo/other/a.ts)"),
        "- **`a.ts`** and `a.ts`"
      );
    });
    test("rewrites links inside lists, quotes, headings and tables", () => {
      assert.strictEqual(
        toPortableMarkdown("## [a.ts](/repo/a.ts)\n\n> see [b.ts](/repo/b.ts)\n\n| f |\n| - |\n| [c.ts](/repo/c.ts) |\n"),
        "## `a.ts`\n\n> see `b.ts`\n\n| f |\n| - |\n| `c.ts` |\n"
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHdpZGdldFxcY2hhdENsaXBib2FyZC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgY29udmVydEh0bWxUb01hcmtkb3duIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2h0bWxUb01hcmtkb3duLmpzJztcbmltcG9ydCB7IHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHNhbml0aXplQ2hhdENsaXBib2FyZEZyYWdtZW50LCB0b1BvcnRhYmxlTWFya2Rvd24gfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q2xpcGJvYXJkLmpzJztcblxuZnVuY3Rpb24gdG9GcmFnbWVudChodG1sOiBzdHJpbmcpOiBEb2N1bWVudEZyYWdtZW50IHtcblx0Y29uc3QgdGVtcGxhdGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCd0ZW1wbGF0ZScpO1xuXHR0ZW1wbGF0ZS5pbm5lckhUTUwgPSBodG1sO1xuXHRyZXR1cm4gdGVtcGxhdGUuY29udGVudDtcbn1cblxuZnVuY3Rpb24gc2FuaXRpemVUb0h0bWwoaHRtbDogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3QgZnJhZ21lbnQgPSB0b0ZyYWdtZW50KGh0bWwpO1xuXHRzYW5pdGl6ZUNoYXRDbGlwYm9hcmRGcmFnbWVudChmcmFnbWVudCk7XG5cdGNvbnN0IGhvbGRlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRob2xkZXIuYXBwZW5kQ2hpbGQoZnJhZ21lbnQpO1xuXHRyZXR1cm4gaG9sZGVyLmlubmVySFRNTDtcbn1cblxuc3VpdGUoJ0NoYXRDbGlwYm9hcmQnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmVwb3J0cyB3aGV0aGVyIHRoZSBzZWxlY3Rpb24gaGFkIHRvIGNoYW5nZScsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0W1xuXHRcdFx0XHRzYW5pdGl6ZUNoYXRDbGlwYm9hcmRGcmFnbWVudCh0b0ZyYWdtZW50KCc8YSBocmVmPVwiaHR0cHM6Ly9leGFtcGxlLmNvbVwiPkV4YW1wbGU8L2E+JykpLFxuXHRcdFx0XHRzYW5pdGl6ZUNoYXRDbGlwYm9hcmRGcmFnbWVudCh0b0ZyYWdtZW50KCc8YSBocmVmPVwiXCIgZGF0YS1ocmVmPVwiZmlsZTovLy9yZXBvL2EudHNcIj5hLnRzPC9hPicpKSxcblx0XHRcdF0sXG5cdFx0XHRbZmFsc2UsIHRydWVdKTtcblx0fSk7XG5cblx0dGVzdCgncmVwbGFjZXMgaW50ZXJuYWwgcmVzb3VyY2UgbGlua3Mgd2l0aCB0aGVpciB2aXNpYmxlIGxhYmVsIGFzIGNvZGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c2FuaXRpemVUb0h0bWwoJzxwPlNlZSA8YSBocmVmPVwiXCIgZGF0YS1ocmVmPVwiZmlsZTovLy9yZXBvL3NyYy9jb25maWcudHNcIj5jb25maWcudHM8L2E+IGZvciBkZXRhaWxzLjwvcD4nKSxcblx0XHRcdCc8cD5TZWUgPGNvZGU+Y29uZmlnLnRzPC9jb2RlPiBmb3IgZGV0YWlscy48L3A+Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGxhY2VzIGltYWdlcyBhZGRyZXNzZWQgYnkgbG9jYWwgcGF0aHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFtcblx0XHRcdFx0c2FuaXRpemVUb0h0bWwoJzxwPjxpbWcgc3JjPVwidnNjb2RlLWZpbGU6Ly92c2NvZGUtYXBwL1VzZXJzL21lL3Nob3QucG5nXCIgYWx0PVwic2NyZWVuc2hvdFwiPjwvcD4nKSxcblx0XHRcdFx0c2FuaXRpemVUb0h0bWwoJzxwPjxpbWcgc3JjPVwiaHR0cHM6Ly9leGFtcGxlLmNvbS9hLnBuZ1wiIGFsdD1cInJlbW90ZVwiPjwvcD4nKSxcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCc8cD48Y29kZT5zY3JlZW5zaG90PC9jb2RlPjwvcD4nLFxuXHRcdFx0XHQnPHA+PGltZyBzcmM9XCJodHRwczovL2V4YW1wbGUuY29tL2EucG5nXCIgYWx0PVwicmVtb3RlXCI+PC9wPicsXG5cdFx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgcG9ydGFibGUgbGlua3MgYW5kIGRyb3BzIHRoZWlyIHJvdXRpbmcgbWV0YWRhdGEnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c2FuaXRpemVUb0h0bWwoJzxhIGhyZWY9XCJodHRwczovL2V4YW1wbGUuY29tL3BhZ2VcIiBkYXRhLWhyZWY9XCJodHRwczovL2V4YW1wbGUuY29tL3BhZ2VcIj5FeGFtcGxlPC9hPicpLFxuXHRcdFx0JzxhIGhyZWY9XCJodHRwczovL2V4YW1wbGUuY29tL3BhZ2VcIj5FeGFtcGxlPC9hPicpO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIHRoZSByZW5kZXJlZCBsYWJlbCBvZiBhbiBpbmxpbmUgYW5jaG9yIHdpZGdldCcsICgpID0+IHtcblx0XHQvLyBUaGUgd2lkZ2V0IHJlbmRlcnMgYW4gaWNvbiBwbHVzIGEgbGFiZWwsIGFuZCBhcHBlbmRzIHRoZSBsaW5lIG51bWJlciBhcyBhIHN1ZmZpeFxuXHRcdC8vIHNwYW4uIEJvdGggcGFydHMgb2YgdGhlIGxhYmVsIGFyZSB3aGF0IHRoZSByZWFkZXIgc2F3LlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHNhbml0aXplVG9IdG1sKCc8YSBjbGFzcz1cImNoYXQtaW5saW5lLWFuY2hvci13aWRnZXQgc2hvdy1maWxlLWljb25zXCIgaHJlZj1cIlwiIGRhdGEtaHJlZj1cImZpbGU6Ly8vcmVwby9mb28uanMjNDIsMVwiPjxzcGFuIGNsYXNzPVwiaWNvblwiPjwvc3Bhbj48c3BhbiBjbGFzcz1cImljb24tbGFiZWxcIj5mb28uanM8c3BhbiBjbGFzcz1cImxhYmVsLXN1ZmZpeFwiPjo0Mjwvc3Bhbj48L3NwYW4+PC9hPicpLFxuXHRcdFx0Jzxjb2RlPmZvby5qczo0MjwvY29kZT4nKTtcblx0fSk7XG5cblx0dGVzdCgnZHJvcHMgaW50ZXJuYWwgbGlua3MgdGhhdCByZW5kZXIgbm8gdmlzaWJsZSB0ZXh0JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHNhbml0aXplVG9IdG1sKCc8cD5iZWZvcmUgPGEgaHJlZj1cIlwiIGRhdGEtaHJlZj1cImZpbGU6Ly8vcmVwby9hLnRzXCI+PC9hPmFmdGVyPC9wPicpLFxuXHRcdFx0JzxwPmJlZm9yZSBhZnRlcjwvcD4nKTtcblx0fSk7XG5cblx0dGVzdCgnc2FuaXRpemVzIGEgZnJhZ21lbnQgZnJvbSBhbiBhdXhpbGlhcnkgd2luZG93JywgKCkgPT4ge1xuXHRcdGNvbnN0IGlmcmFtZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2lmcmFtZScpO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoaWZyYW1lKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGlmcmFtZS5yZW1vdmUoKSkpO1xuXG5cdFx0Y29uc3QgYXV4aWxpYXJ5RG9jdW1lbnQgPSBpZnJhbWUuY29udGVudERvY3VtZW50ITtcblx0XHRjb25zdCBmcmFnbWVudCA9IGF1eGlsaWFyeURvY3VtZW50LmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcblx0XHRjb25zdCBhbmNob3IgPSBhdXhpbGlhcnlEb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhJyk7XG5cdFx0YW5jaG9yLnNldEF0dHJpYnV0ZSgnZGF0YS1ocmVmJywgJ2ZpbGU6Ly8vcmVwby9hLnRzJyk7XG5cdFx0YW5jaG9yLnRleHRDb250ZW50ID0gJ2EudHMnO1xuXHRcdGZyYWdtZW50LmFwcGVuZENoaWxkKGFuY2hvcik7XG5cdFx0Y29uc3QgY3JlYXRlRWxlbWVudCA9IGF1eGlsaWFyeURvY3VtZW50LmNyZWF0ZUVsZW1lbnQ7XG5cdFx0YXV4aWxpYXJ5RG9jdW1lbnQuY3JlYXRlRWxlbWVudCA9ICgpID0+IHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm90IGFsbG93ZWQgdG8gY3JlYXRlIGVsZW1lbnRzIGluIGNoaWxkIHdpbmRvdyBKYXZhU2NyaXB0IGNvbnRleHQuJyk7XG5cdFx0fTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGF1eGlsaWFyeURvY3VtZW50LmNyZWF0ZUVsZW1lbnQgPSBjcmVhdGVFbGVtZW50KSk7XG5cblx0XHRzYW5pdGl6ZUNoYXRDbGlwYm9hcmRGcmFnbWVudChmcmFnbWVudCk7XG5cdFx0Y29uc3QgcmVwbGFjZW1lbnQgPSBmcmFnbWVudC5maXJzdEVsZW1lbnRDaGlsZDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aHRtbDogcmVwbGFjZW1lbnQ/Lm91dGVySFRNTCxcblx0XHRcdG93bmVyRG9jdW1lbnQ6IHJlcGxhY2VtZW50Py5vd25lckRvY3VtZW50ID09PSBhdXhpbGlhcnlEb2N1bWVudCxcblx0XHRcdG1haW5SZWFsbUVsZW1lbnQ6IHJlcGxhY2VtZW50IGluc3RhbmNlb2YgSFRNTEVsZW1lbnQsXG5cdFx0fSwge1xuXHRcdFx0aHRtbDogJzxjb2RlPmEudHM8L2NvZGU+Jyxcblx0XHRcdG93bmVyRG9jdW1lbnQ6IHRydWUsXG5cdFx0XHRtYWluUmVhbG1FbGVtZW50OiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9kdWNlcyBtYXJrZG93biB3aXRob3V0IGludGVybmFsIHRhcmdldHMgd2hlbiBwYXN0ZWQgYmFjayBpbnRvIGNoYXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29waWVkID0gc2FuaXRpemVUb0h0bWwoXG5cdFx0XHQnPHA+VGhpcyBpcyA8c3Ryb25nPmluaGVyaXRlZDwvc3Ryb25nPiBmcm9tIHRoZSA8YSBocmVmPVwiXCIgZGF0YS1ocmVmPVwiZmlsZTovLy9yZXBvL3NyYy9Gb29CYXIudHNcIj5Gb29CYXI8L2E+IGNsYXNzLiAnXG5cdFx0XHQrICdTZWUgPGEgaHJlZj1cImh0dHBzOi8vZXhhbXBsZS5jb20vZG9jc1wiIGRhdGEtaHJlZj1cImh0dHBzOi8vZXhhbXBsZS5jb20vZG9jc1wiPnRoZSBkb2NzPC9hPi48L3A+Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRjb252ZXJ0SHRtbFRvTWFya2Rvd24oY29waWVkKSxcblx0XHRcdCdUaGlzIGlzICoqaW5oZXJpdGVkKiogZnJvbSB0aGUgYEZvb0JhcmAgY2xhc3MuIFNlZSBbdGhlIGRvY3NdKGh0dHBzOi8vZXhhbXBsZS5jb20vZG9jcykuJyk7XG5cdH0pO1xuXG5cdHN1aXRlKCd0b1BvcnRhYmxlTWFya2Rvd24nLCAoKSA9PiB7XG5cdFx0dGVzdCgncmVkdWNlcyBub24tcG9ydGFibGUgbGluayB0YXJnZXRzIHRvIHRoZWlyIGxhYmVsJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0W1xuXHRcdFx0XHRcdC8vIEFnZW50IGhvc3Qgc2Vzc2lvbnMgYXJlIGluc3RydWN0ZWQgdG8gZW1pdCBhYnNvbHV0ZSBmaWxlc3lzdGVtIHRhcmdldHMuXG5cdFx0XHRcdFx0dG9Qb3J0YWJsZU1hcmtkb3duKCdVcGRhdGVkIFtzcmMvYS50c10oL1VzZXJzL21lL3JlcG8vc3JjL2EudHMpIGFuZCBbYi50c10oYzovcmVwby9iLnRzKS4nKSxcblx0XHRcdFx0XHR0b1BvcnRhYmxlTWFya2Rvd24oJ1NlZSBbY29uZmlnXShmaWxlOi8vL3JlcG8vY29uZmlnLmpzb24pLicpLFxuXHRcdFx0XHRcdHRvUG9ydGFibGVNYXJrZG93bignU2VlIFtpbmRleC50c10oaHR0cDovL192c2NvZGVjb250ZW50cmVmXy8wKS4nKSxcblx0XHRcdFx0XHR0b1BvcnRhYmxlTWFya2Rvd24oJ1NlZSBbYS50c10oY29kZS1vc3M6Ly9maWxlL3JlcG8vYS50cykuJyksXG5cdFx0XHRcdF0sXG5cdFx0XHRcdFsnVXBkYXRlZCBgc3JjL2EudHNgIGFuZCBgYi50c2AuJywgJ1NlZSBgY29uZmlnYC4nLCAnU2VlIGBpbmRleC50c2AuJywgJ1NlZSBgYS50c2AuJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgna2VlcHMgbGlua3MgdGhhdCBzdGF5IG1lYW5pbmdmdWwgd2hlcmV2ZXIgdGhlIG1hcmtkb3duIGxhbmRzJywgKCkgPT4ge1xuXHRcdFx0Ly8gRG9jdW1lbnQtcmVsYXRpdmUgdGFyZ2V0cyBuYW1lIG5vIG1hY2hpbmUsIHNvIHNoYXJpbmcgdGhlbSBsb3NlcyBub3RoaW5nLlxuXHRcdFx0Y29uc3QgbWFya2Rvd24gPSAnU2VlIFt0aGUgZG9jc10oaHR0cHM6Ly9leGFtcGxlLmNvbS9kb2NzKSwgW21haWwgdXNdKG1haWx0bzp0ZWFtQGV4YW1wbGUuY29tKSwgJ1xuXHRcdFx0XHQrICdbZGV0YWlsc10oI2RldGFpbHMpIGFuZCBbZ3VpZGVdKC4uL0NPTlRSSUJVVElORy5tZCkuJztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b1BvcnRhYmxlTWFya2Rvd24obWFya2Rvd24pLCBtYXJrZG93bik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzY3J1YnMgdGhlIHRhcmdldCBvZiBhIGxpbmsgd2hvc2Ugc291cmNlIGNhbm5vdCBiZSBsb2NhdGVkJywgKCkgPT4ge1xuXHRcdFx0Ly8gQSBsYWJlbCBzcGFubmluZyBsaW5lcyBpbnNpZGUgYSBxdW90ZSBvciBsaXN0IGxvc2VzIGl0cyBibG9jayBwcmVmaXhlcyBpbiB0aGVcblx0XHRcdC8vIHRva2VuIHNvdXJjZSwgc28gdGhlIGxpbmsgY2Fubm90IGJlIHJld3JpdHRlbiBpbiBwbGFjZS5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR0b1BvcnRhYmxlTWFya2Rvd24oJz4gW2Zvb1xcbj4gYmFyXSgvVXNlcnMvYWxpY2UvcHJpdmF0ZS9hLnRzKVxcbicpLFxuXHRcdFx0XHRcdHRvUG9ydGFibGVNYXJrZG93bignLSBbZm9vXFxuICBiYXJdKC9Vc2Vycy9hbGljZS9wcml2YXRlL2EudHMpXFxuJyksXG5cdFx0XHRcdF0sXG5cdFx0XHRcdFsnPiBbZm9vXFxuPiBiYXJdKClcXG4nLCAnLSBbZm9vXFxuICBiYXJdKClcXG4nXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd2aXNpdHMgYW4gaW1hZ2UgbmVzdGVkIGluc2lkZSBhIGxpbmsgdGhhdCBpcyBrZXB0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHR0b1BvcnRhYmxlTWFya2Rvd24oJ1shW2RpYWdyYW1dKC9Vc2Vycy9tZS9wcml2YXRlLnBuZyldKGh0dHBzOi8vZXhhbXBsZS5jb20pJyksXG5cdFx0XHRcdCdbYGRpYWdyYW1gXShodHRwczovL2V4YW1wbGUuY29tKScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZlcyBhIGRlZmluaXRpb24gd2hvc2UgZGVzdGluYXRpb24gc2l0cyBvbiB0aGUgbmV4dCBsaW5lJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHR0b1BvcnRhYmxlTWFya2Rvd24oJ1NlZSBbZF1bcl0uXFxuXFxuW3JdOlxcbiAgL1VzZXJzL2FsaWNlL2EudHNcXG4nKSxcblx0XHRcdFx0J1NlZSBgZGAuXFxuXFxuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsZWF2ZXMgY29udGVudCB0aGF0IG1lcmVseSBmb2xsb3dzIGEgZGVmaW5pdGlvbicsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0dG9Qb3J0YWJsZU1hcmtkb3duKCdTZWUgW2RdW3JdLlxcblxcbltyXTogL1VzZXJzL2FsaWNlL2EudHNcXG5cXG4gICAgaW5kZW50ZWQgY29kZVxcbicpLFxuXHRcdFx0XHQnU2VlIGBkYC5cXG5cXG4gICAgaW5kZW50ZWQgY29kZVxcbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGFrZXMgYSBkZWZpbml0aW9uIHdob2xlIGhvd2V2ZXIgaXQgd3JhcHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0dG9Qb3J0YWJsZU1hcmtkb3duKCdTZWUgW2RdW3JdLlxcblxcbltyXTogL1VzZXJzL2FsaWNlL2EudHMgXCJUaXRsZVwiXFxuJyksXG5cdFx0XHRcdFx0dG9Qb3J0YWJsZU1hcmtkb3duKCdTZWUgW2RdW3JdLlxcblxcbltyXTogL1VzZXJzL2FsaWNlL2EudHNcXG4gIFwiVGl0bGVcIlxcbicpLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbJ1NlZSBgZGAuXFxuXFxuJywgJ1NlZSBgZGAuXFxuXFxuJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgna2VlcHMgYSByZWZlcmVuY2Ugd29ya2luZyBieSBnaXZpbmcgaXQgaXRzIG93biB0YXJnZXQnLCAoKSA9PiB7XG5cdFx0XHQvLyBEZWZpbml0aW9ucyBhcmUgZHJvcHBlZCB3aG9sZXNhbGUsIHNvIGEgc2hhcmVhYmxlIHJlZmVyZW5jZSBoYXMgdG8gY2FycnkgaXRzXG5cdFx0XHQvLyB0YXJnZXQgaW5saW5lIG9yIGl0IHdvdWxkIGRlY2F5IGludG8gbGl0ZXJhbCB0ZXh0LlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHRvUG9ydGFibGVNYXJrZG93bignQSBbeF1bMV0gQiBbeV1bMl0uXFxuXFxuWzFdOiAvcC9hLnRzXFxuWzJdOiBodHRwczovL29rLmNvbVxcbicpLFxuXHRcdFx0XHRcdHRvUG9ydGFibGVNYXJrZG93bignU2VlIFtyXS5cXG5cXG5bcl06IGh0dHBzOi8vb2suY29tXFxuJyksXG5cdFx0XHRcdFx0dG9Qb3J0YWJsZU1hcmtkb3duKCchW2FsdF1bcl1cXG5cXG5bcl06IGh0dHBzOi8vb2suY29tL3gucG5nXFxuJyksXG5cdFx0XHRcdFx0dG9Qb3J0YWJsZU1hcmtkb3duKCdTZWUgW2RdW3JdLlxcblxcbltyXTogaHR0cHM6Ly9vay5jb20gXCJUXCJcXG4nKSxcblx0XHRcdFx0XSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdBIGB4YCBCIFt5XShodHRwczovL29rLmNvbSkuXFxuXFxuJyxcblx0XHRcdFx0XHQnU2VlIFtyXShodHRwczovL29rLmNvbSkuXFxuXFxuJyxcblx0XHRcdFx0XHQnIVthbHRdKGh0dHBzOi8vb2suY29tL3gucG5nKVxcblxcbicsXG5cdFx0XHRcdFx0J1NlZSBbZF0oaHR0cHM6Ly9vay5jb20gXCJUXCIpLlxcblxcbicsXG5cdFx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZHJvcHMgYSBkZWZpbml0aW9uIG5vdGhpbmcgcmVmZXJzIHRvJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvUG9ydGFibGVNYXJrZG93bignTm90aGluZyBoZXJlLlxcblxcbltyXTogL3AvYS50c1xcbicpLCAnTm90aGluZyBoZXJlLlxcblxcbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGVhdmVzIGEgZGVmaW5pdGlvbiB0aGUgcGFyc2VyIGFjY291bnRlZCBmb3IgYXMgY29udGVudCcsICgpID0+IHtcblx0XHRcdC8vIEluc2lkZSBhIGZlbmNlIGl0IGlzIGEgc2FtcGxlLCBhbmQgZGlyZWN0bHkgdW5kZXIgYSBwYXJhZ3JhcGggaXQgaXMgbGl0ZXJhbCB0ZXh0LlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHRvUG9ydGFibGVNYXJrZG93bignYGBgXFxuW3JdOiAvVXNlcnMvYWxpY2UvYS50c1xcbmBgYFxcbicpLFxuXHRcdFx0XHRcdHRvUG9ydGFibGVNYXJrZG93bignVGV4dCBoZXJlLlxcbltyXTogL1VzZXJzL2FsaWNlL2EudHNcXG4nKSxcblx0XHRcdFx0XSxcblx0XHRcdFx0WydgYGBcXG5bcl06IC9Vc2Vycy9hbGljZS9hLnRzXFxuYGBgXFxuJywgJ1RleHQgaGVyZS5cXG5bcl06IC9Vc2Vycy9hbGljZS9hLnRzXFxuJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2NydWJzIGFuIHVubG9jYXRhYmxlIHRhcmdldCB3aXRob3V0IHRvdWNoaW5nIGEgc2FtcGxlIG9mIGl0IGluIGNvZGUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHRvUG9ydGFibGVNYXJrZG93bignRXhhbXBsZTogYFt4XSgvVXNlcnMvYWxpY2UvYS50cylgIGFuZFxcblxcbj4gW2Zvb1xcbj4gYmFyXSgvVXNlcnMvYWxpY2UvYS50cylcXG4nKSxcblx0XHRcdFx0J0V4YW1wbGU6IGBbeF0oL1VzZXJzL2FsaWNlL2EudHMpYCBhbmRcXG5cXG4+IFtmb29cXG4+IGJhcl0oKVxcbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV3cml0ZXMgdGhlIHJlYWwgbGluayByYXRoZXIgdGhhbiBhIGxvb2thbGlrZSBpbnNpZGUgY29kZScsICgpID0+IHtcblx0XHRcdC8vIFNlYXJjaGluZyBmb3IgdGhlIGxpbmsgc291cmNlIHdvdWxkIG1hdGNoIHRoZSBzYW1wbGUgaW4gdGhlIGNvZGUgc3BhbiBmaXJzdCxcblx0XHRcdC8vIGNvcnJ1cHRpbmcgaXQgYW5kIGxlYXZpbmcgdGhlIGFjdHVhbCB0YXJnZXQgYmVoaW5kLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHRvUG9ydGFibGVNYXJrZG93bignVXNlIGBbYS50c10oL3JlcG8vYS50cylgIGFuZCB0aGVuIFthLnRzXSgvcmVwby9hLnRzKSBmb3IgcmVhbC4nKSxcblx0XHRcdFx0XHR0b1BvcnRhYmxlTWFya2Rvd24oJ2BgYFxcblthLnRzXSgvcmVwby9hLnRzKVxcbmBgYFxcblxcblNlZSBbYS50c10oL3JlcG8vYS50cykuJyksXG5cdFx0XHRcdF0sXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnVXNlIGBbYS50c10oL3JlcG8vYS50cylgIGFuZCB0aGVuIGBhLnRzYCBmb3IgcmVhbC4nLFxuXHRcdFx0XHRcdCdgYGBcXG5bYS50c10oL3JlcG8vYS50cylcXG5gYGBcXG5cXG5TZWUgYGEudHNgLicsXG5cdFx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGVhdmVzIGxpbmsgc3ludGF4IGluc2lkZSBjb2RlIHNwYW5zIGFuZCBjb2RlIGJsb2NrcyBhbG9uZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hcmtkb3duID0gJ1VzZSBgW2EudHNdKC9yZXBvL2EudHMpYCBoZXJlLlxcblxcbmBgYG1kXFxuW2IudHNdKC9yZXBvL2IudHMpXFxuYGBgJztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b1BvcnRhYmxlTWFya2Rvd24obWFya2Rvd24pLCBtYXJrZG93bik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1vdmVzIHJlZmVyZW5jZSBkZWZpbml0aW9ucyB0aGF0IHdvdWxkIHN0cmFuZCB0aGUgdGFyZ2V0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHRvUG9ydGFibGVNYXJrZG93bignU2VlIFtkb2NzXVtyZWZdLlxcblxcbltyZWZdOiAvcmVwby9hLnRzXFxuJyksXG5cdFx0XHRcdFx0Ly8gQ29tbW9uTWFyayBhbGxvd3MgdGhlIGRlc3RpbmF0aW9uIHRvIGNvbnRpbnVlIG9uIGFuIGluZGVudGVkIGxpbmUuXG5cdFx0XHRcdFx0dG9Qb3J0YWJsZU1hcmtkb3duKCdTZWUgW2RvY3NdW3JlZl0uXFxuXFxuW3JlZl06XFxuICAvVXNlcnMvYWxpY2UvcHJpdmF0ZS9hLnRzXFxuJyksXG5cdFx0XHRcdF0sXG5cdFx0XHRcdFsnU2VlIGBkb2NzYC5cXG5cXG4nLCAnU2VlIGBkb2NzYC5cXG5cXG4nXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdrZWVwcyBhIGRlZmluaXRpb24gbGluZSB0aGF0IG9ubHkgbG9va3MgbGlrZSBvbmUgaW5zaWRlIGEgY29kZSBibG9jaycsICgpID0+IHtcblx0XHRcdGNvbnN0IG1hcmtkb3duID0gJ1NlZSBbZG9jc11bcmVmXS5cXG5cXG5gYGBtZFxcbltyZWZdOiAvcmVwby9hLnRzXFxuYGBgXFxuXFxuW3JlZl06IC9yZXBvL2EudHNcXG4nO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHR0b1BvcnRhYmxlTWFya2Rvd24obWFya2Rvd24pLFxuXHRcdFx0XHQnU2VlIGBkb2NzYC5cXG5cXG5gYGBtZFxcbltyZWZdOiAvcmVwby9hLnRzXFxuYGBgXFxuXFxuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsZWF2ZXMgcmF3IGh0bWwgdmVyYmF0aW0nLCAoKSA9PiB7XG5cdFx0XHQvLyBDaGF0IG1hcmtkb3duIHJlbmRlcnMgd2l0aG91dCBgc3VwcG9ydEh0bWxgLCBzbyBhIHRhZyB0aGUgbW9kZWwgd3JvdGUgd2FzIG5ldmVyIGFcblx0XHRcdC8vIGxpdmUgbGluay4gRWRpdGluZyBpdHMgYXR0cmlidXRlcyB3b3VsZCBvbmx5IGNvcnJ1cHQgdGV4dCB0aGUgcmVhZGVyIHdhcyBzaG93biBcdTIwMTRcblx0XHRcdC8vIHRoZSBzYW1lIHNwZWxsaW5nIGFwcGVhcnMgaW4gcHJvc2Ugd2hlbmV2ZXIgYSByZXNwb25zZSBleHBsYWlucyB0aGUgc3ludGF4LlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHRvUG9ydGFibGVNYXJrZG93bignPGEgaHJlZj1cImZpbGU6Ly8vVXNlcnMvYWxpY2UvcHJpdmF0ZS9hLnRzXCI+YS50czwvYT4nKSxcblx0XHRcdFx0XHR0b1BvcnRhYmxlTWFya2Rvd24oJzxkaXY+XFxuaHJlZj1cIi9Vc2Vycy9hbGljZS9hLnRzXCIgaXMgdGhlIHN5bnRheFxcbjwvZGl2PlxcbicpLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0JzxhIGhyZWY9XCJmaWxlOi8vL1VzZXJzL2FsaWNlL3ByaXZhdGUvYS50c1wiPmEudHM8L2E+Jyxcblx0XHRcdFx0XHQnPGRpdj5cXG5ocmVmPVwiL1VzZXJzL2FsaWNlL2EudHNcIiBpcyB0aGUgc3ludGF4XFxuPC9kaXY+XFxuJyxcblx0XHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWR1Y2VzIGltYWdlcyBhZGRyZXNzZWQgYnkgbG9jYWwgcGF0aHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0dG9Qb3J0YWJsZU1hcmtkb3duKCchW2RpYWdyYW1dKC9Vc2Vycy9hbGljZS9wcml2YXRlL2RpYWdyYW0ucG5nKScpLFxuXHRcdFx0XHRcdHRvUG9ydGFibGVNYXJrZG93bignWyFbaW1nXSgvaS5wbmcpXSgvcmVwby9hLnRzKScpLFxuXHRcdFx0XHRcdHRvUG9ydGFibGVNYXJrZG93bignIVtyZW1vdGVdKGh0dHBzOi8vZXhhbXBsZS5jb20vYS5wbmcpJyksXG5cdFx0XHRcdF0sXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnYGRpYWdyYW1gJyxcblx0XHRcdFx0XHQnYGltZ2AnLFxuXHRcdFx0XHRcdCchW3JlbW90ZV0oaHR0cHM6Ly9leGFtcGxlLmNvbS9hLnBuZyknLFxuXHRcdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgdGhlIHRleHQgYSByZWFkZXIgc2F3IGFzIHRoZSBsYWJlbCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFt0b1BvcnRhYmxlTWFya2Rvd24oJ1sqKkZvbyoqXSgvcmVwby9Gb28udHMpJyksIHRvUG9ydGFibGVNYXJrZG93bignU2VlIFtgYS50c2BdKC9yZXBvL2EudHMpLicpXSxcblx0XHRcdFx0WydgRm9vYCcsICdTZWUgYGEudHNgLiddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyBzdXJyb3VuZGluZyBmb3JtYXR0aW5nIGFuZCByZXBlYXRlZCBsYWJlbHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHRvUG9ydGFibGVNYXJrZG93bignLSAqKlthLnRzXSgvcmVwby9hLnRzKSoqIGFuZCBbYS50c10oL3JlcG8vb3RoZXIvYS50cyknKSxcblx0XHRcdFx0Jy0gKipgYS50c2AqKiBhbmQgYGEudHNgJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXdyaXRlcyBsaW5rcyBpbnNpZGUgbGlzdHMsIHF1b3RlcywgaGVhZGluZ3MgYW5kIHRhYmxlcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0dG9Qb3J0YWJsZU1hcmtkb3duKCcjIyBbYS50c10oL3JlcG8vYS50cylcXG5cXG4+IHNlZSBbYi50c10oL3JlcG8vYi50cylcXG5cXG58IGYgfFxcbnwgLSB8XFxufCBbYy50c10oL3JlcG8vYy50cykgfFxcbicpLFxuXHRcdFx0XHQnIyMgYGEudHNgXFxuXFxuPiBzZWUgYGIudHNgXFxuXFxufCBmIHxcXG58IC0gfFxcbnwgYGMudHNgIHxcXG4nKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLCtDQUErQztBQUN4RCxTQUFTLCtCQUErQiwwQkFBMEI7QUFFbEUsU0FBUyxXQUFXLE1BQWdDO0FBQ25ELFFBQU0sV0FBVyxTQUFTLGNBQWMsVUFBVTtBQUNsRCxXQUFTLFlBQVk7QUFDckIsU0FBTyxTQUFTO0FBQ2pCO0FBRUEsU0FBUyxlQUFlLE1BQXNCO0FBQzdDLFFBQU0sV0FBVyxXQUFXLElBQUk7QUFDaEMsZ0NBQThCLFFBQVE7QUFDdEMsUUFBTSxTQUFTLFNBQVMsY0FBYyxLQUFLO0FBQzNDLFNBQU8sWUFBWSxRQUFRO0FBQzNCLFNBQU8sT0FBTztBQUNmO0FBRUEsTUFBTSxpQkFBaUIsTUFBTTtBQUM1QixRQUFNLGNBQWMsd0NBQXdDO0FBRTVELE9BQUssK0NBQStDLE1BQU07QUFDekQsV0FBTztBQUFBLE1BQ047QUFBQSxRQUNDLDhCQUE4QixXQUFXLDJDQUEyQyxDQUFDO0FBQUEsUUFDckYsOEJBQThCLFdBQVcsbURBQW1ELENBQUM7QUFBQSxNQUM5RjtBQUFBLE1BQ0EsQ0FBQyxPQUFPLElBQUk7QUFBQSxJQUFDO0FBQUEsRUFDZixDQUFDO0FBRUQsT0FBSyxxRUFBcUUsTUFBTTtBQUMvRSxXQUFPO0FBQUEsTUFDTixlQUFlLHlGQUF5RjtBQUFBLE1BQ3hHO0FBQUEsSUFBZ0Q7QUFBQSxFQUNsRCxDQUFDO0FBRUQsT0FBSyw0Q0FBNEMsTUFBTTtBQUN0RCxXQUFPO0FBQUEsTUFDTjtBQUFBLFFBQ0MsZUFBZSxnRkFBZ0Y7QUFBQSxRQUMvRixlQUFlLDJEQUEyRDtBQUFBLE1BQzNFO0FBQUEsTUFDQTtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQUM7QUFB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
