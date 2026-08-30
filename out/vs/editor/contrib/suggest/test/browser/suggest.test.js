import assert from "assert";
import { URI } from "../../../../../base/common/uri.js";
import { Position } from "../../../../common/core/position.js";
import { Range } from "../../../../common/core/range.js";
import { CompletionItemKind } from "../../../../common/languages.js";
import { CompletionOptions, provideSuggestionItems, SnippetSortOrder } from "../../browser/suggest.js";
import { createTextModel } from "../../../../test/common/testTextModel.js";
import { LanguageFeatureRegistry } from "../../../../common/languageFeatureRegistry.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
suite("Suggest", function() {
  let model;
  let registration;
  let registry;
  setup(function() {
    registry = new LanguageFeatureRegistry();
    model = createTextModel("FOO\nbarBAR\nfoo", void 0, void 0, URI.parse("foo:bar/path"));
    registration = registry.register({ pattern: "bar/path", scheme: "foo" }, {
      _debugDisplayName: "test",
      provideCompletionItems(_doc, pos) {
        return {
          incomplete: false,
          suggestions: [{
            label: "aaa",
            kind: CompletionItemKind.Snippet,
            insertText: "aaa",
            range: Range.fromPositions(pos)
          }, {
            label: "zzz",
            kind: CompletionItemKind.Snippet,
            insertText: "zzz",
            range: Range.fromPositions(pos)
          }, {
            label: "fff",
            kind: CompletionItemKind.Property,
            insertText: "fff",
            range: Range.fromPositions(pos)
          }]
        };
      }
    });
  });
  teardown(() => {
    registration.dispose();
    model.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("sort - snippet inline", async function() {
    const { items, disposable } = await provideSuggestionItems(registry, model, new Position(1, 1), new CompletionOptions(SnippetSortOrder.Inline));
    assert.strictEqual(items.length, 3);
    assert.strictEqual(items[0].completion.label, "aaa");
    assert.strictEqual(items[1].completion.label, "fff");
    assert.strictEqual(items[2].completion.label, "zzz");
    disposable.dispose();
  });
  test("sort - snippet top", async function() {
    const { items, disposable } = await provideSuggestionItems(registry, model, new Position(1, 1), new CompletionOptions(SnippetSortOrder.Top));
    assert.strictEqual(items.length, 3);
    assert.strictEqual(items[0].completion.label, "aaa");
    assert.strictEqual(items[1].completion.label, "zzz");
    assert.strictEqual(items[2].completion.label, "fff");
    disposable.dispose();
  });
  test("sort - snippet bottom", async function() {
    const { items, disposable } = await provideSuggestionItems(registry, model, new Position(1, 1), new CompletionOptions(SnippetSortOrder.Bottom));
    assert.strictEqual(items.length, 3);
    assert.strictEqual(items[0].completion.label, "fff");
    assert.strictEqual(items[1].completion.label, "aaa");
    assert.strictEqual(items[2].completion.label, "zzz");
    disposable.dispose();
  });
  test("sort - snippet none", async function() {
    const { items, disposable } = await provideSuggestionItems(registry, model, new Position(1, 1), new CompletionOptions(void 0, (/* @__PURE__ */ new Set()).add(CompletionItemKind.Snippet)));
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].completion.label, "fff");
    disposable.dispose();
  });
  test("only from", function(callback) {
    const foo = {
      triggerCharacters: [],
      provideCompletionItems() {
        return {
          currentWord: "",
          incomplete: false,
          suggestions: [{
            label: "jjj",
            type: "property",
            insertText: "jjj"
          }]
        };
      }
    };
    const registration2 = registry.register({ pattern: "bar/path", scheme: "foo" }, foo);
    provideSuggestionItems(registry, model, new Position(1, 1), new CompletionOptions(void 0, void 0, (/* @__PURE__ */ new Set()).add(foo))).then(({ items, disposable }) => {
      registration2.dispose();
      assert.strictEqual(items.length, 1);
      assert.ok(items[0].provider === foo);
      disposable.dispose();
      callback();
    });
  });
  test("Ctrl+space completions stopped working with the latest Insiders, #97650", async function() {
    const foo = new class {
      constructor() {
        this._debugDisplayName = "test";
        this.triggerCharacters = [];
      }
      provideCompletionItems() {
        return {
          suggestions: [{
            label: "one",
            kind: CompletionItemKind.Class,
            insertText: "one",
            range: {
              insert: new Range(0, 0, 0, 0),
              replace: new Range(0, 0, 0, 10)
            }
          }, {
            label: "two",
            kind: CompletionItemKind.Class,
            insertText: "two",
            range: {
              insert: new Range(0, 0, 0, 0),
              replace: new Range(0, 1, 0, 10)
            }
          }]
        };
      }
    }();
    const registration2 = registry.register({ pattern: "bar/path", scheme: "foo" }, foo);
    const { items, disposable } = await provideSuggestionItems(registry, model, new Position(0, 0), new CompletionOptions(void 0, void 0, (/* @__PURE__ */ new Set()).add(foo)));
    registration2.dispose();
    assert.strictEqual(items.length, 2);
    const [a, b] = items;
    assert.strictEqual(a.completion.label, "one");
    assert.strictEqual(a.isInvalid, false);
    assert.strictEqual(b.completion.label, "two");
    assert.strictEqual(b.isInvalid, true);
    disposable.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHN1Z2dlc3RcXHRlc3RcXGJyb3dzZXJcXHN1Z2dlc3QudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbkl0ZW1LaW5kLCBDb21wbGV0aW9uSXRlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uT3B0aW9ucywgcHJvdmlkZVN1Z2dlc3Rpb25JdGVtcywgU25pcHBldFNvcnRPcmRlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc3VnZ2VzdC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5cbnN1aXRlKCdTdWdnZXN0JywgZnVuY3Rpb24gKCkge1xuXHRsZXQgbW9kZWw6IFRleHRNb2RlbDtcblx0bGV0IHJlZ2lzdHJhdGlvbjogSURpc3Bvc2FibGU7XG5cdGxldCByZWdpc3RyeTogTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnk8Q29tcGxldGlvbkl0ZW1Qcm92aWRlcj47XG5cblx0c2V0dXAoZnVuY3Rpb24gKCkge1xuXHRcdHJlZ2lzdHJ5ID0gbmV3IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5KCk7XG5cdFx0bW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ0ZPT1xcbmJhclxcQkFSXFxuZm9vJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgnZm9vOmJhci9wYXRoJykpO1xuXHRcdHJlZ2lzdHJhdGlvbiA9IHJlZ2lzdHJ5LnJlZ2lzdGVyKHsgcGF0dGVybjogJ2Jhci9wYXRoJywgc2NoZW1lOiAnZm9vJyB9LCB7XG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogJ3Rlc3QnLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtcyhfZG9jLCBwb3MpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpbmNvbXBsZXRlOiBmYWxzZSxcblx0XHRcdFx0XHRzdWdnZXN0aW9uczogW3tcblx0XHRcdFx0XHRcdGxhYmVsOiAnYWFhJyxcblx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5TbmlwcGV0LFxuXHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogJ2FhYScsXG5cdFx0XHRcdFx0XHRyYW5nZTogUmFuZ2UuZnJvbVBvc2l0aW9ucyhwb3MpXG5cdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0bGFiZWw6ICd6enonLFxuXHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlNuaXBwZXQsXG5cdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnenp6Jyxcblx0XHRcdFx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKHBvcylcblx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ2ZmZicsXG5cdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuUHJvcGVydHksXG5cdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnZmZmJyxcblx0XHRcdFx0XHRcdHJhbmdlOiBSYW5nZS5mcm9tUG9zaXRpb25zKHBvcylcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0cmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3NvcnQgLSBzbmlwcGV0IGlubGluZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IGl0ZW1zLCBkaXNwb3NhYmxlIH0gPSBhd2FpdCBwcm92aWRlU3VnZ2VzdGlvbkl0ZW1zKHJlZ2lzdHJ5LCBtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpLCBuZXcgQ29tcGxldGlvbk9wdGlvbnMoU25pcHBldFNvcnRPcmRlci5JbmxpbmUpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXMubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXNbMF0uY29tcGxldGlvbi5sYWJlbCwgJ2FhYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtc1sxXS5jb21wbGV0aW9uLmxhYmVsLCAnZmZmJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zWzJdLmNvbXBsZXRpb24ubGFiZWwsICd6enonKTtcblx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnc29ydCAtIHNuaXBwZXQgdG9wJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgaXRlbXMsIGRpc3Bvc2FibGUgfSA9IGF3YWl0IHByb3ZpZGVTdWdnZXN0aW9uSXRlbXMocmVnaXN0cnksIG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSksIG5ldyBDb21wbGV0aW9uT3B0aW9ucyhTbmlwcGV0U29ydE9yZGVyLlRvcCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtcy5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtc1swXS5jb21wbGV0aW9uLmxhYmVsLCAnYWFhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zWzFdLmNvbXBsZXRpb24ubGFiZWwsICd6enonKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXNbMl0uY29tcGxldGlvbi5sYWJlbCwgJ2ZmZicpO1xuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzb3J0IC0gc25pcHBldCBib3R0b20nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBpdGVtcywgZGlzcG9zYWJsZSB9ID0gYXdhaXQgcHJvdmlkZVN1Z2dlc3Rpb25JdGVtcyhyZWdpc3RyeSwgbW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxKSwgbmV3IENvbXBsZXRpb25PcHRpb25zKFNuaXBwZXRTb3J0T3JkZXIuQm90dG9tKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zWzBdLmNvbXBsZXRpb24ubGFiZWwsICdmZmYnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXNbMV0uY29tcGxldGlvbi5sYWJlbCwgJ2FhYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtc1syXS5jb21wbGV0aW9uLmxhYmVsLCAnenp6Jyk7XG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NvcnQgLSBzbmlwcGV0IG5vbmUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBpdGVtcywgZGlzcG9zYWJsZSB9ID0gYXdhaXQgcHJvdmlkZVN1Z2dlc3Rpb25JdGVtcyhyZWdpc3RyeSwgbW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxKSwgbmV3IENvbXBsZXRpb25PcHRpb25zKHVuZGVmaW5lZCwgbmV3IFNldDxDb21wbGV0aW9uSXRlbUtpbmQ+KCkuYWRkKENvbXBsZXRpb25JdGVtS2luZC5TbmlwcGV0KSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtc1swXS5jb21wbGV0aW9uLmxhYmVsLCAnZmZmJyk7XG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29ubHkgZnJvbScsIGZ1bmN0aW9uIChjYWxsYmFjaykge1xuXG5cdFx0Y29uc3QgZm9vOiBhbnkgPSB7XG5cdFx0XHR0cmlnZ2VyQ2hhcmFjdGVyczogW10sXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zKCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGN1cnJlbnRXb3JkOiAnJyxcblx0XHRcdFx0XHRpbmNvbXBsZXRlOiBmYWxzZSxcblx0XHRcdFx0XHRzdWdnZXN0aW9uczogW3tcblx0XHRcdFx0XHRcdGxhYmVsOiAnampqJyxcblx0XHRcdFx0XHRcdHR5cGU6ICdwcm9wZXJ0eScsXG5cdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnampqJ1xuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCByZWdpc3RyYXRpb24gPSByZWdpc3RyeS5yZWdpc3Rlcih7IHBhdHRlcm46ICdiYXIvcGF0aCcsIHNjaGVtZTogJ2ZvbycgfSwgZm9vKTtcblxuXHRcdHByb3ZpZGVTdWdnZXN0aW9uSXRlbXMocmVnaXN0cnksIG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSksIG5ldyBDb21wbGV0aW9uT3B0aW9ucyh1bmRlZmluZWQsIHVuZGVmaW5lZCwgbmV3IFNldDxDb21wbGV0aW9uSXRlbVByb3ZpZGVyPigpLmFkZChmb28pKSkudGhlbigoeyBpdGVtcywgZGlzcG9zYWJsZSB9KSA9PiB7XG5cdFx0XHRyZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5vayhpdGVtc1swXS5wcm92aWRlciA9PT0gZm9vKTtcblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0Y2FsbGJhY2soKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQ3RybCtzcGFjZSBjb21wbGV0aW9ucyBzdG9wcGVkIHdvcmtpbmcgd2l0aCB0aGUgbGF0ZXN0IEluc2lkZXJzLCAjOTc2NTAnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblxuXHRcdGNvbnN0IGZvbyA9IG5ldyBjbGFzcyBpbXBsZW1lbnRzIENvbXBsZXRpb25JdGVtUHJvdmlkZXIge1xuXG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZSA9ICd0ZXN0Jztcblx0XHRcdHRyaWdnZXJDaGFyYWN0ZXJzID0gW107XG5cblx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXMoKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IFt7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ29uZScsXG5cdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuQ2xhc3MsXG5cdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiAnb25lJyxcblx0XHRcdFx0XHRcdHJhbmdlOiB7XG5cdFx0XHRcdFx0XHRcdGluc2VydDogbmV3IFJhbmdlKDAsIDAsIDAsIDApLFxuXHRcdFx0XHRcdFx0XHRyZXBsYWNlOiBuZXcgUmFuZ2UoMCwgMCwgMCwgMTApXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0bGFiZWw6ICd0d28nLFxuXHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLkNsYXNzLFxuXHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogJ3R3bycsXG5cdFx0XHRcdFx0XHRyYW5nZToge1xuXHRcdFx0XHRcdFx0XHRpbnNlcnQ6IG5ldyBSYW5nZSgwLCAwLCAwLCAwKSxcblx0XHRcdFx0XHRcdFx0cmVwbGFjZTogbmV3IFJhbmdlKDAsIDEsIDAsIDEwKVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbiA9IHJlZ2lzdHJ5LnJlZ2lzdGVyKHsgcGF0dGVybjogJ2Jhci9wYXRoJywgc2NoZW1lOiAnZm9vJyB9LCBmb28pO1xuXHRcdGNvbnN0IHsgaXRlbXMsIGRpc3Bvc2FibGUgfSA9IGF3YWl0IHByb3ZpZGVTdWdnZXN0aW9uSXRlbXMocmVnaXN0cnksIG1vZGVsLCBuZXcgUG9zaXRpb24oMCwgMCksIG5ldyBDb21wbGV0aW9uT3B0aW9ucyh1bmRlZmluZWQsIHVuZGVmaW5lZCwgbmV3IFNldDxDb21wbGV0aW9uSXRlbVByb3ZpZGVyPigpLmFkZChmb28pKSk7XG5cdFx0cmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtcy5sZW5ndGgsIDIpO1xuXHRcdGNvbnN0IFthLCBiXSA9IGl0ZW1zO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEuY29tcGxldGlvbi5sYWJlbCwgJ29uZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhLmlzSW52YWxpZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChiLmNvbXBsZXRpb24ubGFiZWwsICd0d28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYi5pc0ludmFsaWQsIHRydWUpO1xuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsT0FBTyxZQUFZO0FBRW5CLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFFdEIsU0FBUywwQkFBa0Q7QUFDM0QsU0FBUyxtQkFBbUIsd0JBQXdCLHdCQUF3QjtBQUM1RSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLCtDQUErQztBQUd4RCxNQUFNLFdBQVcsV0FBWTtBQUM1QixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLFdBQVk7QUFDakIsZUFBVyxJQUFJLHdCQUF3QjtBQUN2QyxZQUFRLGdCQUFnQixvQkFBcUIsUUFBVyxRQUFXLElBQUksTUFBTSxjQUFjLENBQUM7QUFDNUYsbUJBQWUsU0FBUyxTQUFTLEVBQUUsU0FBUyxZQUFZLFFBQVEsTUFBTSxHQUFHO0FBQUEsTUFDeEUsbUJBQW1CO0FBQUEsTUFDbkIsdUJBQXVCLE1BQU0sS0FBSztBQUNqQyxlQUFPO0FBQUEsVUFDTixZQUFZO0FBQUEsVUFDWixhQUFhLENBQUM7QUFBQSxZQUNiLE9BQU87QUFBQSxZQUNQLE1BQU0sbUJBQW1CO0FBQUEsWUFDekIsWUFBWTtBQUFBLFlBQ1osT0FBTyxNQUFNLGNBQWMsR0FBRztBQUFBLFVBQy9CLEdB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
