import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { score, selectLanguageIds } from "../../../common/languageSelector.js";
suite("LanguageSelector", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  const model = {
    language: "farboo",
    uri: URI.parse("file:///testbed/file.fb")
  };
  test("score, invalid selector", function() {
    assert.strictEqual(score({}, model.uri, model.language, true, void 0, void 0), 0);
    assert.strictEqual(score(void 0, model.uri, model.language, true, void 0, void 0), 0);
    assert.strictEqual(score(null, model.uri, model.language, true, void 0, void 0), 0);
    assert.strictEqual(score("", model.uri, model.language, true, void 0, void 0), 0);
  });
  test("score, any language", function() {
    assert.strictEqual(score({ language: "*" }, model.uri, model.language, true, void 0, void 0), 5);
    assert.strictEqual(score("*", model.uri, model.language, true, void 0, void 0), 5);
    assert.strictEqual(score("*", URI.parse("foo:bar"), model.language, true, void 0, void 0), 5);
    assert.strictEqual(score("farboo", URI.parse("foo:bar"), model.language, true, void 0, void 0), 10);
  });
  test("score, default schemes", function() {
    const uri = URI.parse("git:foo/file.txt");
    const language = "farboo";
    assert.strictEqual(score("*", uri, language, true, void 0, void 0), 5);
    assert.strictEqual(score("farboo", uri, language, true, void 0, void 0), 10);
    assert.strictEqual(score({ language: "farboo", scheme: "" }, uri, language, true, void 0, void 0), 10);
    assert.strictEqual(score({ language: "farboo", scheme: "git" }, uri, language, true, void 0, void 0), 10);
    assert.strictEqual(score({ language: "farboo", scheme: "*" }, uri, language, true, void 0, void 0), 10);
    assert.strictEqual(score({ language: "farboo" }, uri, language, true, void 0, void 0), 10);
    assert.strictEqual(score({ language: "*" }, uri, language, true, void 0, void 0), 5);
    assert.strictEqual(score({ scheme: "*" }, uri, language, true, void 0, void 0), 5);
    assert.strictEqual(score({ scheme: "git" }, uri, language, true, void 0, void 0), 10);
  });
  test("score, filter", function() {
    assert.strictEqual(score("farboo", model.uri, model.language, true, void 0, void 0), 10);
    assert.strictEqual(score({ language: "farboo" }, model.uri, model.language, true, void 0, void 0), 10);
    assert.strictEqual(score({ language: "farboo", scheme: "file" }, model.uri, model.language, true, void 0, void 0), 10);
    assert.strictEqual(score({ language: "farboo", scheme: "http" }, model.uri, model.language, true, void 0, void 0), 0);
    assert.strictEqual(score({ pattern: "**/*.fb" }, model.uri, model.language, true, void 0, void 0), 10);
    assert.strictEqual(score({ pattern: "**/*.fb", scheme: "file" }, model.uri, model.language, true, void 0, void 0), 10);
    assert.strictEqual(score({ pattern: "**/*.fb" }, URI.parse("foo:bar"), model.language, true, void 0, void 0), 0);
    assert.strictEqual(score({ pattern: "**/*.fb", scheme: "foo" }, URI.parse("foo:bar"), model.language, true, void 0, void 0), 0);
    const doc = {
      uri: URI.parse("git:/my/file.js"),
      langId: "javascript"
    };
    assert.strictEqual(score("javascript", doc.uri, doc.langId, true, void 0, void 0), 10);
    assert.strictEqual(score({ language: "javascript", scheme: "git" }, doc.uri, doc.langId, true, void 0, void 0), 10);
    assert.strictEqual(score("*", doc.uri, doc.langId, true, void 0, void 0), 5);
    assert.strictEqual(score("fooLang", doc.uri, doc.langId, true, void 0, void 0), 0);
    assert.strictEqual(score(["fooLang", "*"], doc.uri, doc.langId, true, void 0, void 0), 5);
  });
  test("score, max(filters)", function() {
    const match = { language: "farboo", scheme: "file" };
    const fail = { language: "farboo", scheme: "http" };
    assert.strictEqual(score(match, model.uri, model.language, true, void 0, void 0), 10);
    assert.strictEqual(score(fail, model.uri, model.language, true, void 0, void 0), 0);
    assert.strictEqual(score([match, fail], model.uri, model.language, true, void 0, void 0), 10);
    assert.strictEqual(score([fail, fail], model.uri, model.language, true, void 0, void 0), 0);
    assert.strictEqual(score(["farboo", "*"], model.uri, model.language, true, void 0, void 0), 10);
    assert.strictEqual(score(["*", "farboo"], model.uri, model.language, true, void 0, void 0), 10);
  });
  test("score hasAccessToAllModels", function() {
    const doc = {
      uri: URI.parse("file:/my/file.js"),
      langId: "javascript"
    };
    assert.strictEqual(score("javascript", doc.uri, doc.langId, false, void 0, void 0), 0);
    assert.strictEqual(score({ language: "javascript", scheme: "file" }, doc.uri, doc.langId, false, void 0, void 0), 0);
    assert.strictEqual(score("*", doc.uri, doc.langId, false, void 0, void 0), 0);
    assert.strictEqual(score("fooLang", doc.uri, doc.langId, false, void 0, void 0), 0);
    assert.strictEqual(score(["fooLang", "*"], doc.uri, doc.langId, false, void 0, void 0), 0);
    assert.strictEqual(score({ language: "javascript", scheme: "file", hasAccessToAllModels: true }, doc.uri, doc.langId, false, void 0, void 0), 10);
    assert.strictEqual(score(["fooLang", "*", { language: "*", hasAccessToAllModels: true }], doc.uri, doc.langId, false, void 0, void 0), 5);
  });
  test("score, notebookType", function() {
    const obj = {
      uri: URI.parse("vscode-notebook-cell:///my/file.js#blabla"),
      langId: "javascript",
      notebookType: "fooBook",
      notebookUri: URI.parse("file:///my/file.js")
    };
    assert.strictEqual(score("javascript", obj.uri, obj.langId, true, void 0, void 0), 10);
    assert.strictEqual(score("javascript", obj.uri, obj.langId, true, obj.notebookUri, obj.notebookType), 10);
    assert.strictEqual(score({ notebookType: "fooBook" }, obj.uri, obj.langId, true, obj.notebookUri, obj.notebookType), 10);
    assert.strictEqual(score({ notebookType: "fooBook", language: "javascript", scheme: "file" }, obj.uri, obj.langId, true, obj.notebookUri, obj.notebookType), 10);
    assert.strictEqual(score({ notebookType: "fooBook", language: "*" }, obj.uri, obj.langId, true, obj.notebookUri, obj.notebookType), 10);
    assert.strictEqual(score({ notebookType: "*", language: "*" }, obj.uri, obj.langId, true, obj.notebookUri, obj.notebookType), 5);
    assert.strictEqual(score({ notebookType: "*", language: "javascript" }, obj.uri, obj.langId, true, obj.notebookUri, obj.notebookType), 10);
  });
  test("Snippet choices lost #149363", function() {
    const selector = {
      scheme: "vscode-notebook-cell",
      pattern: "/some/path/file.py",
      language: "python"
    };
    const modelUri = URI.parse("vscode-notebook-cell:///some/path/file.py");
    const nbUri = URI.parse("file:///some/path/file.py");
    assert.strictEqual(score(selector, modelUri, "python", true, nbUri, "jupyter"), 10);
    const selector2 = {
      ...selector,
      notebookType: "jupyter"
    };
    assert.strictEqual(score(selector2, modelUri, "python", true, nbUri, "jupyter"), 0);
  });
  test("Document selector match - unexpected result value #60232", function() {
    const selector = {
      language: "json",
      scheme: "file",
      pattern: "**/*.interface.json"
    };
    const value = score(selector, URI.parse("file:///C:/Users/zlhe/Desktop/test.interface.json"), "json", true, void 0, void 0);
    assert.strictEqual(value, 10);
  });
  test("Document selector match - platform paths #99938", function() {
    const selector = {
      pattern: {
        base: "/home/user/Desktop",
        pattern: "*.json"
      }
    };
    const value = score(selector, URI.file("/home/user/Desktop/test.json"), "json", true, void 0, void 0);
    assert.strictEqual(value, 10);
  });
  test("NotebookType without notebook", function() {
    const obj = {
      uri: URI.parse("file:///my/file.bat"),
      langId: "bat"
    };
    let value = score({
      language: "bat",
      notebookType: "xxx"
    }, obj.uri, obj.langId, true, void 0, void 0);
    assert.strictEqual(value, 0);
    value = score({
      language: "bat",
      notebookType: "*"
    }, obj.uri, obj.langId, true, void 0, void 0);
    assert.strictEqual(value, 0);
  });
  test("selectLanguageIds", function() {
    const result = /* @__PURE__ */ new Set();
    selectLanguageIds("typescript", result);
    assert.deepStrictEqual([...result], ["typescript"]);
    result.clear();
    selectLanguageIds({ language: "python", scheme: "file" }, result);
    assert.deepStrictEqual([...result], ["python"]);
    result.clear();
    selectLanguageIds({ scheme: "file" }, result);
    assert.deepStrictEqual([...result], []);
    result.clear();
    selectLanguageIds(["javascript", { language: "css" }, { scheme: "untitled" }], result);
    assert.deepStrictEqual([...result].sort(), ["css", "javascript"]);
    result.clear();
    selectLanguageIds("*", result);
    assert.deepStrictEqual([...result], ["*"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZXNcXGxhbmd1YWdlU2VsZWN0b3IudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IExhbmd1YWdlU2VsZWN0b3IsIHNjb3JlLCBzZWxlY3RMYW5ndWFnZUlkcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZVNlbGVjdG9yLmpzJztcblxuc3VpdGUoJ0xhbmd1YWdlU2VsZWN0b3InLCBmdW5jdGlvbiAoKSB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgbW9kZWwgPSB7XG5cdFx0bGFuZ3VhZ2U6ICdmYXJib28nLFxuXHRcdHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3Rlc3RiZWQvZmlsZS5mYicpXG5cdH07XG5cblx0dGVzdCgnc2NvcmUsIGludmFsaWQgc2VsZWN0b3InLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKHt9LCBtb2RlbC51cmksIG1vZGVsLmxhbmd1YWdlLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSh1bmRlZmluZWQsIG1vZGVsLnVyaSwgbW9kZWwubGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKG51bGwhLCBtb2RlbC51cmksIG1vZGVsLmxhbmd1YWdlLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSgnJywgbW9kZWwudXJpLCBtb2RlbC5sYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnc2NvcmUsIGFueSBsYW5ndWFnZScsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoeyBsYW5ndWFnZTogJyonIH0sIG1vZGVsLnVyaSwgbW9kZWwubGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKCcqJywgbW9kZWwudXJpLCBtb2RlbC5sYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCA1KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSgnKicsIFVSSS5wYXJzZSgnZm9vOmJhcicpLCBtb2RlbC5sYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoJ2ZhcmJvbycsIFVSSS5wYXJzZSgnZm9vOmJhcicpLCBtb2RlbC5sYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCAxMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Njb3JlLCBkZWZhdWx0IHNjaGVtZXMnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2dpdDpmb28vZmlsZS50eHQnKTtcblx0XHRjb25zdCBsYW5ndWFnZSA9ICdmYXJib28nO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKCcqJywgdXJpLCBsYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoJ2ZhcmJvbycsIHVyaSwgbGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSh7IGxhbmd1YWdlOiAnZmFyYm9vJywgc2NoZW1lOiAnJyB9LCB1cmksIGxhbmd1YWdlLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoeyBsYW5ndWFnZTogJ2ZhcmJvbycsIHNjaGVtZTogJ2dpdCcgfSwgdXJpLCBsYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKHsgbGFuZ3VhZ2U6ICdmYXJib28nLCBzY2hlbWU6ICcqJyB9LCB1cmksIGxhbmd1YWdlLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoeyBsYW5ndWFnZTogJ2ZhcmJvbycgfSwgdXJpLCBsYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKHsgbGFuZ3VhZ2U6ICcqJyB9LCB1cmksIGxhbmd1YWdlLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKHsgc2NoZW1lOiAnKicgfSwgdXJpLCBsYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoeyBzY2hlbWU6ICdnaXQnIH0sIHVyaSwgbGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMTApO1xuXHR9KTtcblxuXHR0ZXN0KCdzY29yZSwgZmlsdGVyJywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSgnZmFyYm9vJywgbW9kZWwudXJpLCBtb2RlbC5sYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKHsgbGFuZ3VhZ2U6ICdmYXJib28nIH0sIG1vZGVsLnVyaSwgbW9kZWwubGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSh7IGxhbmd1YWdlOiAnZmFyYm9vJywgc2NoZW1lOiAnZmlsZScgfSwgbW9kZWwudXJpLCBtb2RlbC5sYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKHsgbGFuZ3VhZ2U6ICdmYXJib28nLCBzY2hlbWU6ICdodHRwJyB9LCBtb2RlbC51cmksIG1vZGVsLmxhbmd1YWdlLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKHsgcGF0dGVybjogJyoqLyouZmInIH0sIG1vZGVsLnVyaSwgbW9kZWwubGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSh7IHBhdHRlcm46ICcqKi8qLmZiJywgc2NoZW1lOiAnZmlsZScgfSwgbW9kZWwudXJpLCBtb2RlbC5sYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKHsgcGF0dGVybjogJyoqLyouZmInIH0sIFVSSS5wYXJzZSgnZm9vOmJhcicpLCBtb2RlbC5sYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoeyBwYXR0ZXJuOiAnKiovKi5mYicsIHNjaGVtZTogJ2ZvbycgfSwgVVJJLnBhcnNlKCdmb286YmFyJyksIG1vZGVsLmxhbmd1YWdlLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDApO1xuXG5cdFx0Y29uc3QgZG9jID0ge1xuXHRcdFx0dXJpOiBVUkkucGFyc2UoJ2dpdDovbXkvZmlsZS5qcycpLFxuXHRcdFx0bGFuZ0lkOiAnamF2YXNjcmlwdCdcblx0XHR9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSgnamF2YXNjcmlwdCcsIGRvYy51cmksIGRvYy5sYW5nSWQsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMTApOyAvLyAwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSh7IGxhbmd1YWdlOiAnamF2YXNjcmlwdCcsIHNjaGVtZTogJ2dpdCcgfSwgZG9jLnVyaSwgZG9jLmxhbmdJZCwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCAxMCk7IC8vIDEwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSgnKicsIGRvYy51cmksIGRvYy5sYW5nSWQsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgNSk7IC8vIDVcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoJ2Zvb0xhbmcnLCBkb2MudXJpLCBkb2MubGFuZ0lkLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDApOyAvLyAwXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKFsnZm9vTGFuZycsICcqJ10sIGRvYy51cmksIGRvYy5sYW5nSWQsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgNSk7IC8vIDVcblx0fSk7XG5cblx0dGVzdCgnc2NvcmUsIG1heChmaWx0ZXJzKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBtYXRjaCA9IHsgbGFuZ3VhZ2U6ICdmYXJib28nLCBzY2hlbWU6ICdmaWxlJyB9O1xuXHRcdGNvbnN0IGZhaWwgPSB7IGxhbmd1YWdlOiAnZmFyYm9vJywgc2NoZW1lOiAnaHR0cCcgfTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZShtYXRjaCwgbW9kZWwudXJpLCBtb2RlbC5sYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKGZhaWwsIG1vZGVsLnVyaSwgbW9kZWwubGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKFttYXRjaCwgZmFpbF0sIG1vZGVsLnVyaSwgbW9kZWwubGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZShbZmFpbCwgZmFpbF0sIG1vZGVsLnVyaSwgbW9kZWwubGFuZ3VhZ2UsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKFsnZmFyYm9vJywgJyonXSwgbW9kZWwudXJpLCBtb2RlbC5sYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKFsnKicsICdmYXJib28nXSwgbW9kZWwudXJpLCBtb2RlbC5sYW5ndWFnZSwgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCAxMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Njb3JlIGhhc0FjY2Vzc1RvQWxsTW9kZWxzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGRvYyA9IHtcblx0XHRcdHVyaTogVVJJLnBhcnNlKCdmaWxlOi9teS9maWxlLmpzJyksXG5cdFx0XHRsYW5nSWQ6ICdqYXZhc2NyaXB0J1xuXHRcdH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKCdqYXZhc2NyaXB0JywgZG9jLnVyaSwgZG9jLmxhbmdJZCwgZmFsc2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKHsgbGFuZ3VhZ2U6ICdqYXZhc2NyaXB0Jywgc2NoZW1lOiAnZmlsZScgfSwgZG9jLnVyaSwgZG9jLmxhbmdJZCwgZmFsc2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKCcqJywgZG9jLnVyaSwgZG9jLmxhbmdJZCwgZmFsc2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKCdmb29MYW5nJywgZG9jLnVyaSwgZG9jLmxhbmdJZCwgZmFsc2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKFsnZm9vTGFuZycsICcqJ10sIGRvYy51cmksIGRvYy5sYW5nSWQsIGZhbHNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKHsgbGFuZ3VhZ2U6ICdqYXZhc2NyaXB0Jywgc2NoZW1lOiAnZmlsZScsIGhhc0FjY2Vzc1RvQWxsTW9kZWxzOiB0cnVlIH0sIGRvYy51cmksIGRvYy5sYW5nSWQsIGZhbHNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoWydmb29MYW5nJywgJyonLCB7IGxhbmd1YWdlOiAnKicsIGhhc0FjY2Vzc1RvQWxsTW9kZWxzOiB0cnVlIH1dLCBkb2MudXJpLCBkb2MubGFuZ0lkLCBmYWxzZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCA1KTtcblx0fSk7XG5cblx0dGVzdCgnc2NvcmUsIG5vdGVib29rVHlwZScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBvYmogPSB7XG5cdFx0XHR1cmk6IFVSSS5wYXJzZSgndnNjb2RlLW5vdGVib29rLWNlbGw6Ly8vbXkvZmlsZS5qcyNibGFibGEnKSxcblx0XHRcdGxhbmdJZDogJ2phdmFzY3JpcHQnLFxuXHRcdFx0bm90ZWJvb2tUeXBlOiAnZm9vQm9vaycsXG5cdFx0XHRub3RlYm9va1VyaTogVVJJLnBhcnNlKCdmaWxlOi8vL215L2ZpbGUuanMnKVxuXHRcdH07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoJ2phdmFzY3JpcHQnLCBvYmoudXJpLCBvYmoubGFuZ0lkLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCksIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcmUoJ2phdmFzY3JpcHQnLCBvYmoudXJpLCBvYmoubGFuZ0lkLCB0cnVlLCBvYmoubm90ZWJvb2tVcmksIG9iai5ub3RlYm9va1R5cGUpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKHsgbm90ZWJvb2tUeXBlOiAnZm9vQm9vaycgfSwgb2JqLnVyaSwgb2JqLmxhbmdJZCwgdHJ1ZSwgb2JqLm5vdGVib29rVXJpLCBvYmoubm90ZWJvb2tUeXBlKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSh7IG5vdGVib29rVHlwZTogJ2Zvb0Jvb2snLCBsYW5ndWFnZTogJ2phdmFzY3JpcHQnLCBzY2hlbWU6ICdmaWxlJyB9LCBvYmoudXJpLCBvYmoubGFuZ0lkLCB0cnVlLCBvYmoubm90ZWJvb2tVcmksIG9iai5ub3RlYm9va1R5cGUpLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKHsgbm90ZWJvb2tUeXBlOiAnZm9vQm9vaycsIGxhbmd1YWdlOiAnKicgfSwgb2JqLnVyaSwgb2JqLmxhbmdJZCwgdHJ1ZSwgb2JqLm5vdGVib29rVXJpLCBvYmoubm90ZWJvb2tUeXBlKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSh7IG5vdGVib29rVHlwZTogJyonLCBsYW5ndWFnZTogJyonIH0sIG9iai51cmksIG9iai5sYW5nSWQsIHRydWUsIG9iai5ub3RlYm9va1VyaSwgb2JqLm5vdGVib29rVHlwZSksIDUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZSh7IG5vdGVib29rVHlwZTogJyonLCBsYW5ndWFnZTogJ2phdmFzY3JpcHQnIH0sIG9iai51cmksIG9iai5sYW5nSWQsIHRydWUsIG9iai5ub3RlYm9va1VyaSwgb2JqLm5vdGVib29rVHlwZSksIDEwKTtcblx0fSk7XG5cblx0dGVzdCgnU25pcHBldCBjaG9pY2VzIGxvc3QgIzE0OTM2MycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZWxlY3RvcjogTGFuZ3VhZ2VTZWxlY3RvciA9IHtcblx0XHRcdHNjaGVtZTogJ3ZzY29kZS1ub3RlYm9vay1jZWxsJyxcblx0XHRcdHBhdHRlcm46ICcvc29tZS9wYXRoL2ZpbGUucHknLFxuXHRcdFx0bGFuZ3VhZ2U6ICdweXRob24nXG5cdFx0fTtcblxuXHRcdGNvbnN0IG1vZGVsVXJpID0gVVJJLnBhcnNlKCd2c2NvZGUtbm90ZWJvb2stY2VsbDovLy9zb21lL3BhdGgvZmlsZS5weScpO1xuXHRcdGNvbnN0IG5iVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3NvbWUvcGF0aC9maWxlLnB5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3JlKHNlbGVjdG9yLCBtb2RlbFVyaSwgJ3B5dGhvbicsIHRydWUsIG5iVXJpLCAnanVweXRlcicpLCAxMCk7XG5cblx0XHRjb25zdCBzZWxlY3RvcjI6IExhbmd1YWdlU2VsZWN0b3IgPSB7XG5cdFx0XHQuLi5zZWxlY3Rvcixcblx0XHRcdG5vdGVib29rVHlwZTogJ2p1cHl0ZXInXG5cdFx0fTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29yZShzZWxlY3RvcjIsIG1vZGVsVXJpLCAncHl0aG9uJywgdHJ1ZSwgbmJVcmksICdqdXB5dGVyJyksIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdEb2N1bWVudCBzZWxlY3RvciBtYXRjaCAtIHVuZXhwZWN0ZWQgcmVzdWx0IHZhbHVlICM2MDIzMicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZWxlY3RvciA9IHtcblx0XHRcdGxhbmd1YWdlOiAnanNvbicsXG5cdFx0XHRzY2hlbWU6ICdmaWxlJyxcblx0XHRcdHBhdHRlcm46ICcqKi8qLmludGVyZmFjZS5qc29uJ1xuXHRcdH07XG5cdFx0Y29uc3QgdmFsdWUgPSBzY29yZShzZWxlY3RvciwgVVJJLnBhcnNlKCdmaWxlOi8vL0M6L1VzZXJzL3psaGUvRGVza3RvcC90ZXN0LmludGVyZmFjZS5qc29uJyksICdqc29uJywgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZSwgMTApO1xuXHR9KTtcblxuXHR0ZXN0KCdEb2N1bWVudCBzZWxlY3RvciBtYXRjaCAtIHBsYXRmb3JtIHBhdGhzICM5OTkzOCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZWxlY3RvciA9IHtcblx0XHRcdHBhdHRlcm46IHtcblx0XHRcdFx0YmFzZTogJy9ob21lL3VzZXIvRGVza3RvcCcsXG5cdFx0XHRcdHBhdHRlcm46ICcqLmpzb24nXG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCB2YWx1ZSA9IHNjb3JlKHNlbGVjdG9yLCBVUkkuZmlsZSgnL2hvbWUvdXNlci9EZXNrdG9wL3Rlc3QuanNvbicpLCAnanNvbicsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUsIDEwKTtcblx0fSk7XG5cblx0dGVzdCgnTm90ZWJvb2tUeXBlIHdpdGhvdXQgbm90ZWJvb2snLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgb2JqID0ge1xuXHRcdFx0dXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vbXkvZmlsZS5iYXQnKSxcblx0XHRcdGxhbmdJZDogJ2JhdCcsXG5cdFx0fTtcblxuXHRcdGxldCB2YWx1ZSA9IHNjb3JlKHtcblx0XHRcdGxhbmd1YWdlOiAnYmF0Jyxcblx0XHRcdG5vdGVib29rVHlwZTogJ3h4eCdcblx0XHR9LCBvYmoudXJpLCBvYmoubGFuZ0lkLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLCAwKTtcblxuXHRcdHZhbHVlID0gc2NvcmUoe1xuXHRcdFx0bGFuZ3VhZ2U6ICdiYXQnLFxuXHRcdFx0bm90ZWJvb2tUeXBlOiAnKidcblx0XHR9LCBvYmoudXJpLCBvYmoubGFuZ0lkLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnc2VsZWN0TGFuZ3VhZ2VJZHMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0XHRzZWxlY3RMYW5ndWFnZUlkcygndHlwZXNjcmlwdCcsIHJlc3VsdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4ucmVzdWx0XSwgWyd0eXBlc2NyaXB0J10pO1xuXG5cdFx0cmVzdWx0LmNsZWFyKCk7XG5cdFx0c2VsZWN0TGFuZ3VhZ2VJZHMoeyBsYW5ndWFnZTogJ3B5dGhvbicsIHNjaGVtZTogJ2ZpbGUnIH0sIHJlc3VsdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4ucmVzdWx0XSwgWydweXRob24nXSk7XG5cblx0XHRyZXN1bHQuY2xlYXIoKTtcblx0XHRzZWxlY3RMYW5ndWFnZUlkcyh7IHNjaGVtZTogJ2ZpbGUnIH0sIHJlc3VsdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4ucmVzdWx0XSwgW10pO1xuXG5cdFx0cmVzdWx0LmNsZWFyKCk7XG5cdFx0c2VsZWN0TGFuZ3VhZ2VJZHMoWydqYXZhc2NyaXB0JywgeyBsYW5ndWFnZTogJ2NzcycgfSwgeyBzY2hlbWU6ICd1bnRpdGxlZCcgfV0sIHJlc3VsdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4ucmVzdWx0XS5zb3J0KCksIFsnY3NzJywgJ2phdmFzY3JpcHQnXSk7XG5cblx0XHRyZXN1bHQuY2xlYXIoKTtcblx0XHRzZWxlY3RMYW5ndWFnZUlkcygnKicsIHJlc3VsdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4ucmVzdWx0XSwgWycqJ10pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUEyQixPQUFPLHlCQUF5QjtBQUUzRCxNQUFNLG9CQUFvQixXQUFZO0FBRXJDLDBDQUF3QztBQUV4QyxRQUFNLFFBQVE7QUFBQSxJQUNiLFVBQVU7QUFBQSxJQUNWLEtBQUssSUFBSSxNQUFNLHlCQUF5QjtBQUFBLEVBQ3pDO0FBRUEsT0FBSywyQkFBMkIsV0FBWTtBQUMzQyxXQUFPLFlBQVksTUFBTSxDQUFDLEdBQUcsTUFBTSxLQUFLLE1BQU0sVUFBVSxNQUFNLFFBQVcsTUFBUyxHQUFHLENBQUM7QUFDdEYsV0FBTyxZQUFZLE1BQU0sUUFBVyxNQUFNLEtBQUssTUFBTSxVQUFVLE1BQU0sUUFBVyxNQUFTLEdBQUcsQ0FBQztBQUM3RixXQUFPLFlBQVksTUFBTSxNQUFPLE1BQU0sS0FBSyxNQUFNLFVBQVUsTUFBTSxRQUFXLE1BQVMsR0FBRyxDQUFDO0FBQ3pGLFdBQU8sWUFBWSxNQUFNLElBQUksTUFBTSxLQUFLLE1BQU0sVUFBVSxNQUFNLFFBQVcsTUFBUyxHQUFHLENBQUM7QUFBQSxFQUN2RixDQUFDO0FBRUQsT0FBSyx1QkFB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
