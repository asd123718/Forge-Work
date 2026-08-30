import assert from "assert";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Event } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { Position } from "../../../../common/core/position.js";
import { Range } from "../../../../common/core/range.js";
import { ILanguageConfigurationService } from "../../../../common/languages/languageConfigurationRegistry.js";
import { IModelService } from "../../../../common/services/model.js";
import { BracketSelectionRangeProvider } from "../../browser/bracketSelections.js";
import { provideSelectionRanges } from "../../browser/smartSelect.js";
import { WordSelectionRangeProvider } from "../../browser/wordSelections.js";
import { createModelServices } from "../../../../test/common/testTextModel.js";
import { javascriptOnEnterRules } from "../../../../test/common/modes/supports/onEnterRules.js";
import { LanguageFeatureRegistry } from "../../../../common/languageFeatureRegistry.js";
import { ILanguageService } from "../../../../common/languages/language.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
class StaticLanguageSelector {
  constructor(languageId) {
    this.languageId = languageId;
    this.onDidChange = Event.None;
  }
}
suite("SmartSelect", () => {
  const OriginalBracketSelectionRangeProviderMaxDuration = BracketSelectionRangeProvider._maxDuration;
  suiteSetup(() => {
    BracketSelectionRangeProvider._maxDuration = 5e3;
  });
  suiteTeardown(() => {
    BracketSelectionRangeProvider._maxDuration = OriginalBracketSelectionRangeProviderMaxDuration;
  });
  const languageId = "mockJSMode";
  let disposables;
  let modelService;
  const providers = new LanguageFeatureRegistry();
  setup(() => {
    disposables = new DisposableStore();
    const instantiationService = createModelServices(disposables);
    modelService = instantiationService.get(IModelService);
    const languagConfigurationService = instantiationService.get(ILanguageConfigurationService);
    const languageService = instantiationService.get(ILanguageService);
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languagConfigurationService.register(languageId, {
      brackets: [
        ["(", ")"],
        ["{", "}"],
        ["[", "]"]
      ],
      onEnterRules: javascriptOnEnterRules,
      wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\$\%\^\&\*\(\)\=\+\[\{\]\}\\\;\:\'\"\,\.\<\>\/\?\s]+)/g
    }));
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  async function assertGetRangesToPosition(text, lineNumber, column, ranges, selectLeadingAndTrailingWhitespace = true) {
    const uri = URI.file("test.js");
    const model = modelService.createModel(text.join("\n"), new StaticLanguageSelector(languageId), uri);
    const [actual] = await provideSelectionRanges(providers, model, [new Position(lineNumber, column)], { selectLeadingAndTrailingWhitespace, selectSubwords: true }, CancellationToken.None);
    const actualStr = actual.map((r) => new Range(r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn).toString());
    const desiredStr = ranges.reverse().map((r) => String(r));
    assert.deepStrictEqual(actualStr, desiredStr, `
A: ${actualStr} VS 
E: ${desiredStr}`);
    modelService.destroyModel(uri);
  }
  test("getRangesToPosition #1", () => {
    return assertGetRangesToPosition([
      "function a(bar, foo){",
      "	if (bar) {",
      "		return (bar + (2 * foo))",
      "	}",
      "}"
    ], 3, 20, [
      new Range(1, 1, 5, 2),
      // all
      new Range(1, 21, 5, 2),
      // {} outside
      new Range(1, 22, 5, 1),
      // {} inside
      new Range(2, 1, 4, 3),
      // block
      new Range(2, 1, 4, 3),
      new Range(2, 2, 4, 3),
      new Range(2, 11, 4, 3),
      new Range(2, 12, 4, 2),
      new Range(3, 1, 3, 27),
      // line w/ triva
      new Range(3, 3, 3, 27),
      // line w/o triva
      new Range(3, 10, 3, 27),
      // () outside
      new Range(3, 11, 3, 26),
      // () inside
      new Range(3, 17, 3, 26),
      // () outside
      new Range(3, 18, 3, 25)
      // () inside
    ]);
  });
  test("config: selectLeadingAndTrailingWhitespace", async () => {
    await assertGetRangesToPosition([
      "aaa",
      "	bbb",
      ""
    ], 2, 3, [
      new Range(1, 1, 3, 1),
      // all
      new Range(2, 1, 2, 5),
      // line w/ triva
      new Range(2, 2, 2, 5)
      // bbb
    ], true);
    await assertGetRangesToPosition([
      "aaa",
      "	bbb",
      ""
    ], 2, 3, [
      new Range(1, 1, 3, 1),
      // all
      new Range(2, 2, 2, 5)
      // () inside
    ], false);
  });
  test("getRangesToPosition #56886. Skip empty lines correctly.", () => {
    return assertGetRangesToPosition([
      "function a(bar, foo){",
      "	if (bar) {",
      "",
      "	}",
      "}"
    ], 3, 1, [
      new Range(1, 1, 5, 2),
      new Range(1, 21, 5, 2),
      new Range(1, 22, 5, 1),
      new Range(2, 1, 4, 3),
      new Range(2, 1, 4, 3),
      new Range(2, 2, 4, 3),
      new Range(2, 11, 4, 3),
      new Range(2, 12, 4, 2)
    ]);
  });
  test("getRangesToPosition #56886. Do not skip lines with only whitespaces.", () => {
    return assertGetRangesToPosition([
      "function a(bar, foo){",
      "	if (bar) {",
      " ",
      "	}",
      "}"
    ], 3, 1, [
      new Range(1, 1, 5, 2),
      // all
      new Range(1, 21, 5, 2),
      // {} outside
      new Range(1, 22, 5, 1),
      // {} inside
      new Range(2, 1, 4, 3),
      new Range(2, 1, 4, 3),
      new Range(2, 2, 4, 3),
      new Range(2, 11, 4, 3),
      new Range(2, 12, 4, 2),
      new Range(3, 1, 3, 2),
      // block
      new Range(3, 1, 3, 2)
      // empty line
    ]);
  });
  test("getRangesToPosition #40658. Cursor at first position inside brackets should select line inside.", () => {
    return assertGetRangesToPosition([
      " [ ]",
      " { } ",
      "( ) "
    ], 2, 3, [
      new Range(1, 1, 3, 5),
      new Range(2, 1, 2, 6),
      // line w/ triava
      new Range(2, 2, 2, 5),
      // {} inside, line w/o triva
      new Range(2, 3, 2, 4)
      // {} inside
    ]);
  });
  test("getRangesToPosition #40658. Cursor in empty brackets should reveal brackets first.", () => {
    return assertGetRangesToPosition([
      " [] ",
      " { } ",
      "  ( ) "
    ], 1, 3, [
      new Range(1, 1, 3, 7),
      // all
      new Range(1, 1, 1, 5),
      // line w/ trival
      new Range(1, 2, 1, 4),
      // [] outside, line w/o trival
      new Range(1, 3, 1, 3)
      // [] inside
    ]);
  });
  test("getRangesToPosition #40658. Tokens before bracket will be revealed first.", () => {
    return assertGetRangesToPosition([
      "  [] ",
      " { } ",
      "selectthis( ) "
    ], 3, 11, [
      new Range(1, 1, 3, 15),
      // all
      new Range(3, 1, 3, 15),
      // line w/ trivia
      new Range(3, 1, 3, 14),
      // line w/o trivia
      new Range(3, 1, 3, 11)
      // word
    ]);
  });
  async function assertRanges(provider, value, ...expected) {
    const index = value.indexOf("|");
    value = value.replace("|", "");
    const model = modelService.createModel(value, new StaticLanguageSelector(languageId), URI.parse("fake:lang"));
    const pos = model.getPositionAt(index);
    const all = await provider.provideSelectionRanges(model, [pos], CancellationToken.None);
    const ranges = all[0];
    modelService.destroyModel(model.uri);
    assert.strictEqual(expected.length, ranges.length);
    for (const range of ranges) {
      const exp = expected.shift() || null;
      assert.ok(Range.equalsRange(range.range, exp), `A=${range.range} <> E=${exp}`);
    }
  }
  test("bracket selection", async () => {
    await assertRanges(
      new BracketSelectionRangeProvider(),
      "(|)",
      new Range(1, 2, 1, 2),
      new Range(1, 1, 1, 3)
    );
    await assertRanges(
      new BracketSelectionRangeProvider(),
      "[[[](|)]]",
      new Range(1, 6, 1, 6),
      new Range(1, 5, 1, 7),
      // ()
      new Range(1, 3, 1, 7),
      new Range(1, 2, 1, 8),
      // [[]()]
      new Range(1, 2, 1, 8),
      new Range(1, 1, 1, 9)
      // [[[]()]]
    );
    await assertRanges(
      new BracketSelectionRangeProvider(),
      "[a[](|)a]",
      new Range(1, 6, 1, 6),
      new Range(1, 5, 1, 7),
      new Range(1, 2, 1, 8),
      new Range(1, 1, 1, 9)
    );
    await assertRanges(new BracketSelectionRangeProvider(), "fofof|fofo");
    await assertRanges(new BracketSelectionRangeProvider(), "[[[]()]]|");
    await assertRanges(new BracketSelectionRangeProvider(), "|[[[]()]]");
    await assertRanges(new BracketSelectionRangeProvider(), "[|[[]()]]", new Range(1, 2, 1, 8), new Range(1, 1, 1, 9));
    await assertRanges(new BracketSelectionRangeProvider(), "[[[]()]|]", new Range(1, 2, 1, 8), new Range(1, 1, 1, 9));
    await assertRanges(new BracketSelectionRangeProvider(), "aaa(aaa)bbb(b|b)ccc(ccc)", new Range(1, 13, 1, 15), new Range(1, 12, 1, 16));
    await assertRanges(new BracketSelectionRangeProvider(), "(aaa(aaa)bbb(b|b)ccc(ccc))", new Range(1, 14, 1, 16), new Range(1, 13, 1, 17), new Range(1, 2, 1, 25), new Range(1, 1, 1, 26));
  });
  test("bracket with leading/trailing", async () => {
    await assertRanges(
      new BracketSelectionRangeProvider(),
      "for(a of b){\n  foo(|);\n}",
      new Range(2, 7, 2, 7),
      new Range(2, 6, 2, 8),
      new Range(1, 13, 3, 1),
      new Range(1, 12, 3, 2),
      new Range(1, 1, 3, 2),
      new Range(1, 1, 3, 2)
    );
    await assertRanges(
      new BracketSelectionRangeProvider(),
      "for(a of b)\n{\n  foo(|);\n}",
      new Range(3, 7, 3, 7),
      new Range(3, 6, 3, 8),
      new Range(2, 2, 4, 1),
      new Range(2, 1, 4, 2),
      new Range(1, 1, 4, 2),
      new Range(1, 1, 4, 2)
    );
  });
  test("in-word ranges", async () => {
    await assertRanges(
      new WordSelectionRangeProvider(),
      "f|ooBar",
      new Range(1, 1, 1, 4),
      // foo
      new Range(1, 1, 1, 7),
      // fooBar
      new Range(1, 1, 1, 7)
      // doc
    );
    await assertRanges(
      new WordSelectionRangeProvider(),
      "f|oo_Ba",
      new Range(1, 1, 1, 4),
      new Range(1, 1, 1, 7),
      new Range(1, 1, 1, 7)
    );
    await assertRanges(
      new WordSelectionRangeProvider(),
      "f|oo-Ba",
      new Range(1, 1, 1, 4),
      new Range(1, 1, 1, 7),
      new Range(1, 1, 1, 7)
    );
  });
  test("in-word ranges with selectSubwords=false", async () => {
    await assertRanges(
      new WordSelectionRangeProvider(false),
      "f|ooBar",
      new Range(1, 1, 1, 7),
      new Range(1, 1, 1, 7)
    );
    await assertRanges(
      new WordSelectionRangeProvider(false),
      "f|oo_Ba",
      new Range(1, 1, 1, 7),
      new Range(1, 1, 1, 7)
    );
    await assertRanges(
      new WordSelectionRangeProvider(false),
      "f|oo-Ba",
      new Range(1, 1, 1, 7),
      new Range(1, 1, 1, 7)
    );
  });
  test("Default selection should select current word/hump first in camelCase #67493", async function() {
    await assertRanges(
      new WordSelectionRangeProvider(),
      "Abs|tractSmartSelect",
      new Range(1, 1, 1, 9),
      new Range(1, 1, 1, 20),
      new Range(1, 1, 1, 20)
    );
    await assertRanges(
      new WordSelectionRangeProvider(),
      "AbstractSma|rtSelect",
      new Range(1, 9, 1, 14),
      new Range(1, 1, 1, 20),
      new Range(1, 1, 1, 20)
    );
    await assertRanges(
      new WordSelectionRangeProvider(),
      "Abstrac-Sma|rt-elect",
      new Range(1, 9, 1, 14),
      new Range(1, 1, 1, 20),
      new Range(1, 1, 1, 20)
    );
    await assertRanges(
      new WordSelectionRangeProvider(),
      "Abstrac_Sma|rt_elect",
      new Range(1, 9, 1, 14),
      new Range(1, 1, 1, 20),
      new Range(1, 1, 1, 20)
    );
    await assertRanges(
      new WordSelectionRangeProvider(),
      "Abstrac_Sma|rt-elect",
      new Range(1, 9, 1, 14),
      new Range(1, 1, 1, 20),
      new Range(1, 1, 1, 20)
    );
    await assertRanges(
      new WordSelectionRangeProvider(),
      "Abstrac_Sma|rtSelect",
      new Range(1, 9, 1, 14),
      new Range(1, 1, 1, 20),
      new Range(1, 1, 1, 20)
    );
  });
  test("Smart select: only add line ranges if they're contained by the next range #73850", async function() {
    const reg = providers.register("*", {
      provideSelectionRanges() {
        return [[
          { range: { startLineNumber: 1, startColumn: 10, endLineNumber: 1, endColumn: 11 } },
          { range: { startLineNumber: 1, startColumn: 10, endLineNumber: 3, endColumn: 2 } },
          { range: { startLineNumber: 1, startColumn: 1, endLineNumber: 3, endColumn: 2 } }
        ]];
      }
    });
    await assertGetRangesToPosition(["type T = {", "	x: number", "}"], 1, 10, [
      new Range(1, 1, 3, 2),
      // all
      new Range(1, 10, 3, 2),
      // { ... }
      new Range(1, 10, 1, 11)
      // {
    ]);
    reg.dispose();
  });
  test("Expand selection in words with underscores is inconsistent #90589", async function() {
    await assertRanges(
      new WordSelectionRangeProvider(),
      "Hel|lo_World",
      new Range(1, 1, 1, 6),
      new Range(1, 1, 1, 12),
      new Range(1, 1, 1, 12)
    );
    await assertRanges(
      new WordSelectionRangeProvider(),
      "Hello_Wo|rld",
      new Range(1, 7, 1, 12),
      new Range(1, 1, 1, 12),
      new Range(1, 1, 1, 12)
    );
    await assertRanges(
      new WordSelectionRangeProvider(),
      "Hello|_World",
      new Range(1, 1, 1, 6),
      new Range(1, 1, 1, 12),
      new Range(1, 1, 1, 12)
    );
    await assertRanges(
      new WordSelectionRangeProvider(),
      "Hello_|World",
      new Range(1, 7, 1, 12),
      new Range(1, 1, 1, 12),
      new Range(1, 1, 1, 12)
    );
    await assertRanges(
      new WordSelectionRangeProvider(),
      "Hello|-World",
      new Range(1, 1, 1, 6),
      new Range(1, 1, 1, 12),
      new Range(1, 1, 1, 12)
    );
    await assertRanges(
      new WordSelectionRangeProvider(),
      "Hello-|World",
      new Range(1, 7, 1, 12),
      new Range(1, 1, 1, 12),
      new Range(1, 1, 1, 12)
    );
    await assertRanges(
      new WordSelectionRangeProvider(),
      "Hello|World",
      new Range(1, 6, 1, 11),
      new Range(1, 1, 1, 11),
      new Range(1, 1, 1, 11)
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHNtYXJ0U2VsZWN0XFx0ZXN0XFxicm93c2VyXFxzbWFydFNlbGVjdC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElSYW5nZSwgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb25SYW5nZVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBCcmFja2V0U2VsZWN0aW9uUmFuZ2VQcm92aWRlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvYnJhY2tldFNlbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgcHJvdmlkZVNlbGVjdGlvblJhbmdlcyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc21hcnRTZWxlY3QuanMnO1xuaW1wb3J0IHsgV29yZFNlbGVjdGlvblJhbmdlUHJvdmlkZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL3dvcmRTZWxlY3Rpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZU1vZGVsU2VydmljZXMgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IGphdmFzY3JpcHRPbkVudGVyUnVsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi9tb2Rlcy9zdXBwb3J0cy9vbkVudGVyUnVsZXMuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VsZWN0aW9uLCBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuY2xhc3MgU3RhdGljTGFuZ3VhZ2VTZWxlY3RvciBpbXBsZW1lbnRzIElMYW5ndWFnZVNlbGVjdGlvbiB7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDxzdHJpbmc+ID0gRXZlbnQuTm9uZTtcblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IGxhbmd1YWdlSWQ6IHN0cmluZykgeyB9XG59XG5cbnN1aXRlKCdTbWFydFNlbGVjdCcsICgpID0+IHtcblxuXHRjb25zdCBPcmlnaW5hbEJyYWNrZXRTZWxlY3Rpb25SYW5nZVByb3ZpZGVyTWF4RHVyYXRpb24gPSBCcmFja2V0U2VsZWN0aW9uUmFuZ2VQcm92aWRlci5fbWF4RHVyYXRpb247XG5cblx0c3VpdGVTZXR1cCgoKSA9PiB7XG5cdFx0QnJhY2tldFNlbGVjdGlvblJhbmdlUHJvdmlkZXIuX21heER1cmF0aW9uID0gNTAwMDsgLy8gNSBzZWNvbmRzXG5cdH0pO1xuXG5cdHN1aXRlVGVhcmRvd24oKCkgPT4ge1xuXHRcdEJyYWNrZXRTZWxlY3Rpb25SYW5nZVByb3ZpZGVyLl9tYXhEdXJhdGlvbiA9IE9yaWdpbmFsQnJhY2tldFNlbGVjdGlvblJhbmdlUHJvdmlkZXJNYXhEdXJhdGlvbjtcblx0fSk7XG5cblx0Y29uc3QgbGFuZ3VhZ2VJZCA9ICdtb2NrSlNNb2RlJztcblx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGxldCBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2U7XG5cdGNvbnN0IHByb3ZpZGVycyA9IG5ldyBMYW5ndWFnZUZlYXR1cmVSZWdpc3RyeTxTZWxlY3Rpb25SYW5nZVByb3ZpZGVyPigpO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZU1vZGVsU2VydmljZXMoZGlzcG9zYWJsZXMpO1xuXHRcdG1vZGVsU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTW9kZWxTZXJ2aWNlKTtcblx0XHRjb25zdCBsYW5ndWFnQ29uZmlndXJhdGlvblNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogbGFuZ3VhZ2VJZCB9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihsYW5ndWFnZUlkLCB7XG5cdFx0XHRicmFja2V0czogW1xuXHRcdFx0XHRbJygnLCAnKSddLFxuXHRcdFx0XHRbJ3snLCAnfSddLFxuXHRcdFx0XHRbJ1snLCAnXSddXG5cdFx0XHRdLFxuXHRcdFx0b25FbnRlclJ1bGVzOiBqYXZhc2NyaXB0T25FbnRlclJ1bGVzLFxuXHRcdFx0d29yZFBhdHRlcm46IC8oLT9cXGQqXFwuXFxkXFx3Kil8KFteXFxgXFx+XFwhXFxAXFwjXFwkXFwlXFxeXFwmXFwqXFwoXFwpXFw9XFwrXFxbXFx7XFxdXFx9XFxcXFxcO1xcOlxcJ1xcXCJcXCxcXC5cXDxcXD5cXC9cXD9cXHNdKykvZ1xuXHRcdH0pKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0YXN5bmMgZnVuY3Rpb24gYXNzZXJ0R2V0UmFuZ2VzVG9Qb3NpdGlvbih0ZXh0OiBzdHJpbmdbXSwgbGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgcmFuZ2VzOiBSYW5nZVtdLCBzZWxlY3RMZWFkaW5nQW5kVHJhaWxpbmdXaGl0ZXNwYWNlID0gdHJ1ZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCd0ZXN0LmpzJyk7XG5cdFx0Y29uc3QgbW9kZWwgPSBtb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwodGV4dC5qb2luKCdcXG4nKSwgbmV3IFN0YXRpY0xhbmd1YWdlU2VsZWN0b3IobGFuZ3VhZ2VJZCksIHVyaSk7XG5cdFx0Y29uc3QgW2FjdHVhbF0gPSBhd2FpdCBwcm92aWRlU2VsZWN0aW9uUmFuZ2VzKHByb3ZpZGVycywgbW9kZWwsIFtuZXcgUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKV0sIHsgc2VsZWN0TGVhZGluZ0FuZFRyYWlsaW5nV2hpdGVzcGFjZSwgc2VsZWN0U3Vid29yZHM6IHRydWUgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgYWN0dWFsU3RyID0gYWN0dWFsLm1hcChyID0+IG5ldyBSYW5nZShyLnN0YXJ0TGluZU51bWJlciwgci5zdGFydENvbHVtbiwgci5lbmRMaW5lTnVtYmVyLCByLmVuZENvbHVtbikudG9TdHJpbmcoKSk7XG5cdFx0Y29uc3QgZGVzaXJlZFN0ciA9IHJhbmdlcy5yZXZlcnNlKCkubWFwKHIgPT4gU3RyaW5nKHIpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsU3RyLCBkZXNpcmVkU3RyLCBgXFxuQTogJHthY3R1YWxTdHJ9IFZTIFxcbkU6ICR7ZGVzaXJlZFN0cn1gKTtcblx0XHRtb2RlbFNlcnZpY2UuZGVzdHJveU1vZGVsKHVyaSk7XG5cdH1cblxuXHR0ZXN0KCdnZXRSYW5nZXNUb1Bvc2l0aW9uICMxJywgKCkgPT4ge1xuXG5cdFx0cmV0dXJuIGFzc2VydEdldFJhbmdlc1RvUG9zaXRpb24oW1xuXHRcdFx0J2Z1bmN0aW9uIGEoYmFyLCBmb28peycsXG5cdFx0XHQnXFx0aWYgKGJhcikgeycsXG5cdFx0XHQnXFx0XFx0cmV0dXJuIChiYXIgKyAoMiAqIGZvbykpJyxcblx0XHRcdCdcXHR9Jyxcblx0XHRcdCd9J1xuXHRcdF0sIDMsIDIwLCBbXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMSwgNSwgMiksIC8vIGFsbFxuXHRcdFx0bmV3IFJhbmdlKDEsIDIxLCA1LCAyKSwgLy8ge30gb3V0c2lkZVxuXHRcdFx0bmV3IFJhbmdlKDEsIDIyLCA1LCAxKSwgLy8ge30gaW5zaWRlXG5cdFx0XHRuZXcgUmFuZ2UoMiwgMSwgNCwgMyksIC8vIGJsb2NrXG5cdFx0XHRuZXcgUmFuZ2UoMiwgMSwgNCwgMyksXG5cdFx0XHRuZXcgUmFuZ2UoMiwgMiwgNCwgMyksXG5cdFx0XHRuZXcgUmFuZ2UoMiwgMTEsIDQsIDMpLFxuXHRcdFx0bmV3IFJhbmdlKDIsIDEyLCA0LCAyKSxcblx0XHRcdG5ldyBSYW5nZSgzLCAxLCAzLCAyNyksIC8vIGxpbmUgdy8gdHJpdmFcblx0XHRcdG5ldyBSYW5nZSgzLCAzLCAzLCAyNyksIC8vIGxpbmUgdy9vIHRyaXZhXG5cdFx0XHRuZXcgUmFuZ2UoMywgMTAsIDMsIDI3KSwgLy8gKCkgb3V0c2lkZVxuXHRcdFx0bmV3IFJhbmdlKDMsIDExLCAzLCAyNiksIC8vICgpIGluc2lkZVxuXHRcdFx0bmV3IFJhbmdlKDMsIDE3LCAzLCAyNiksIC8vICgpIG91dHNpZGVcblx0XHRcdG5ldyBSYW5nZSgzLCAxOCwgMywgMjUpLCAvLyAoKSBpbnNpZGVcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnY29uZmlnOiBzZWxlY3RMZWFkaW5nQW5kVHJhaWxpbmdXaGl0ZXNwYWNlJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0YXdhaXQgYXNzZXJ0R2V0UmFuZ2VzVG9Qb3NpdGlvbihbXG5cdFx0XHQnYWFhJyxcblx0XHRcdCdcXHRiYmInLFxuXHRcdFx0Jydcblx0XHRdLCAyLCAzLCBbXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMywgMSksIC8vIGFsbFxuXHRcdFx0bmV3IFJhbmdlKDIsIDEsIDIsIDUpLCAvLyBsaW5lIHcvIHRyaXZhXG5cdFx0XHRuZXcgUmFuZ2UoMiwgMiwgMiwgNSksIC8vIGJiYlxuXHRcdF0sIHRydWUpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0R2V0UmFuZ2VzVG9Qb3NpdGlvbihbXG5cdFx0XHQnYWFhJyxcblx0XHRcdCdcXHRiYmInLFxuXHRcdFx0Jydcblx0XHRdLCAyLCAzLCBbXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMywgMSksIC8vIGFsbFxuXHRcdFx0bmV3IFJhbmdlKDIsIDIsIDIsIDUpLCAvLyAoKSBpbnNpZGVcblx0XHRdLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFJhbmdlc1RvUG9zaXRpb24gIzU2ODg2LiBTa2lwIGVtcHR5IGxpbmVzIGNvcnJlY3RseS4nLCAoKSA9PiB7XG5cblx0XHRyZXR1cm4gYXNzZXJ0R2V0UmFuZ2VzVG9Qb3NpdGlvbihbXG5cdFx0XHQnZnVuY3Rpb24gYShiYXIsIGZvbyl7Jyxcblx0XHRcdCdcXHRpZiAoYmFyKSB7Jyxcblx0XHRcdCcnLFxuXHRcdFx0J1xcdH0nLFxuXHRcdFx0J30nXG5cdFx0XSwgMywgMSwgW1xuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDUsIDIpLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDIxLCA1LCAyKSxcblx0XHRcdG5ldyBSYW5nZSgxLCAyMiwgNSwgMSksXG5cdFx0XHRuZXcgUmFuZ2UoMiwgMSwgNCwgMyksXG5cdFx0XHRuZXcgUmFuZ2UoMiwgMSwgNCwgMyksXG5cdFx0XHRuZXcgUmFuZ2UoMiwgMiwgNCwgMyksXG5cdFx0XHRuZXcgUmFuZ2UoMiwgMTEsIDQsIDMpLFxuXHRcdFx0bmV3IFJhbmdlKDIsIDEyLCA0LCAyKSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0UmFuZ2VzVG9Qb3NpdGlvbiAjNTY4ODYuIERvIG5vdCBza2lwIGxpbmVzIHdpdGggb25seSB3aGl0ZXNwYWNlcy4nLCAoKSA9PiB7XG5cblx0XHRyZXR1cm4gYXNzZXJ0R2V0UmFuZ2VzVG9Qb3NpdGlvbihbXG5cdFx0XHQnZnVuY3Rpb24gYShiYXIsIGZvbyl7Jyxcblx0XHRcdCdcXHRpZiAoYmFyKSB7Jyxcblx0XHRcdCcgJyxcblx0XHRcdCdcXHR9Jyxcblx0XHRcdCd9J1xuXHRcdF0sIDMsIDEsIFtcblx0XHRcdG5ldyBSYW5nZSgxLCAxLCA1LCAyKSwgLy8gYWxsXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMjEsIDUsIDIpLCAvLyB7fSBvdXRzaWRlXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMjIsIDUsIDEpLCAvLyB7fSBpbnNpZGVcblx0XHRcdG5ldyBSYW5nZSgyLCAxLCA0LCAzKSxcblx0XHRcdG5ldyBSYW5nZSgyLCAxLCA0LCAzKSxcblx0XHRcdG5ldyBSYW5nZSgyLCAyLCA0LCAzKSxcblx0XHRcdG5ldyBSYW5nZSgyLCAxMSwgNCwgMyksXG5cdFx0XHRuZXcgUmFuZ2UoMiwgMTIsIDQsIDIpLFxuXHRcdFx0bmV3IFJhbmdlKDMsIDEsIDMsIDIpLCAvLyBibG9ja1xuXHRcdFx0bmV3IFJhbmdlKDMsIDEsIDMsIDIpIC8vIGVtcHR5IGxpbmVcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0UmFuZ2VzVG9Qb3NpdGlvbiAjNDA2NTguIEN1cnNvciBhdCBmaXJzdCBwb3NpdGlvbiBpbnNpZGUgYnJhY2tldHMgc2hvdWxkIHNlbGVjdCBsaW5lIGluc2lkZS4nLCAoKSA9PiB7XG5cblx0XHRyZXR1cm4gYXNzZXJ0R2V0UmFuZ2VzVG9Qb3NpdGlvbihbXG5cdFx0XHQnIFsgXScsXG5cdFx0XHQnIHsgfSAnLFxuXHRcdFx0JyggKSAnXG5cdFx0XSwgMiwgMywgW1xuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDMsIDUpLFxuXHRcdFx0bmV3IFJhbmdlKDIsIDEsIDIsIDYpLCAvLyBsaW5lIHcvIHRyaWF2YVxuXHRcdFx0bmV3IFJhbmdlKDIsIDIsIDIsIDUpLCAvLyB7fSBpbnNpZGUsIGxpbmUgdy9vIHRyaXZhXG5cdFx0XHRuZXcgUmFuZ2UoMiwgMywgMiwgNCkgLy8ge30gaW5zaWRlXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFJhbmdlc1RvUG9zaXRpb24gIzQwNjU4LiBDdXJzb3IgaW4gZW1wdHkgYnJhY2tldHMgc2hvdWxkIHJldmVhbCBicmFja2V0cyBmaXJzdC4nLCAoKSA9PiB7XG5cblx0XHRyZXR1cm4gYXNzZXJ0R2V0UmFuZ2VzVG9Qb3NpdGlvbihbXG5cdFx0XHQnIFtdICcsXG5cdFx0XHQnIHsgfSAnLFxuXHRcdFx0JyAgKCApICdcblx0XHRdLCAxLCAzLCBbXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMywgNyksIC8vIGFsbFxuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDUpLCAvLyBsaW5lIHcvIHRyaXZhbFxuXHRcdFx0bmV3IFJhbmdlKDEsIDIsIDEsIDQpLCAvLyBbXSBvdXRzaWRlLCBsaW5lIHcvbyB0cml2YWxcblx0XHRcdG5ldyBSYW5nZSgxLCAzLCAxLCAzKSwgLy8gW10gaW5zaWRlXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFJhbmdlc1RvUG9zaXRpb24gIzQwNjU4LiBUb2tlbnMgYmVmb3JlIGJyYWNrZXQgd2lsbCBiZSByZXZlYWxlZCBmaXJzdC4nLCAoKSA9PiB7XG5cblx0XHRyZXR1cm4gYXNzZXJ0R2V0UmFuZ2VzVG9Qb3NpdGlvbihbXG5cdFx0XHQnICBbXSAnLFxuXHRcdFx0JyB7IH0gJyxcblx0XHRcdCdzZWxlY3R0aGlzKCApICdcblx0XHRdLCAzLCAxMSwgW1xuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDMsIDE1KSwgLy8gYWxsXG5cdFx0XHRuZXcgUmFuZ2UoMywgMSwgMywgMTUpLCAvLyBsaW5lIHcvIHRyaXZpYVxuXHRcdFx0bmV3IFJhbmdlKDMsIDEsIDMsIDE0KSwgLy8gbGluZSB3L28gdHJpdmlhXG5cdFx0XHRuZXcgUmFuZ2UoMywgMSwgMywgMTEpIC8vIHdvcmRcblx0XHRdKTtcblx0fSk7XG5cblx0Ly8gLS0gYnJhY2tldCBzZWxlY3Rpb25zXG5cblx0YXN5bmMgZnVuY3Rpb24gYXNzZXJ0UmFuZ2VzKHByb3ZpZGVyOiBTZWxlY3Rpb25SYW5nZVByb3ZpZGVyLCB2YWx1ZTogc3RyaW5nLCAuLi5leHBlY3RlZDogSVJhbmdlW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBpbmRleCA9IHZhbHVlLmluZGV4T2YoJ3wnKTtcblx0XHR2YWx1ZSA9IHZhbHVlLnJlcGxhY2UoJ3wnLCAnJyk7IC8vIENvZGVRTCBbU00wMjM4M10ganMvaW5jb21wbGV0ZS1zYW5pdGl6YXRpb24gdGhpcyBpcyBwdXJwb3NlIG9ubHkgdGhlIGZpcnN0IHwgY2hhcmFjdGVyXG5cblx0XHRjb25zdCBtb2RlbCA9IG1vZGVsU2VydmljZS5jcmVhdGVNb2RlbCh2YWx1ZSwgbmV3IFN0YXRpY0xhbmd1YWdlU2VsZWN0b3IobGFuZ3VhZ2VJZCksIFVSSS5wYXJzZSgnZmFrZTpsYW5nJykpO1xuXHRcdGNvbnN0IHBvcyA9IG1vZGVsLmdldFBvc2l0aW9uQXQoaW5kZXgpO1xuXHRcdGNvbnN0IGFsbCA9IGF3YWl0IHByb3ZpZGVyLnByb3ZpZGVTZWxlY3Rpb25SYW5nZXMobW9kZWwsIFtwb3NdLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCByYW5nZXMgPSBhbGwhWzBdO1xuXG5cdFx0bW9kZWxTZXJ2aWNlLmRlc3Ryb3lNb2RlbChtb2RlbC51cmkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4cGVjdGVkLmxlbmd0aCwgcmFuZ2VzLmxlbmd0aCk7XG5cdFx0Zm9yIChjb25zdCByYW5nZSBvZiByYW5nZXMpIHtcblx0XHRcdGNvbnN0IGV4cCA9IGV4cGVjdGVkLnNoaWZ0KCkgfHwgbnVsbDtcblx0XHRcdGFzc2VydC5vayhSYW5nZS5lcXVhbHNSYW5nZShyYW5nZS5yYW5nZSwgZXhwKSwgYEE9JHtyYW5nZS5yYW5nZX0gPD4gRT0ke2V4cH1gKTtcblx0XHR9XG5cdH1cblxuXHR0ZXN0KCdicmFja2V0IHNlbGVjdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBhc3NlcnRSYW5nZXMobmV3IEJyYWNrZXRTZWxlY3Rpb25SYW5nZVByb3ZpZGVyKCksICcofCknLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDIsIDEsIDIpLCBuZXcgUmFuZ2UoMSwgMSwgMSwgMylcblx0XHQpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0UmFuZ2VzKG5ldyBCcmFja2V0U2VsZWN0aW9uUmFuZ2VQcm92aWRlcigpLCAnW1tbXSh8KV1dJyxcblx0XHRcdG5ldyBSYW5nZSgxLCA2LCAxLCA2KSwgbmV3IFJhbmdlKDEsIDUsIDEsIDcpLCAvLyAoKVxuXHRcdFx0bmV3IFJhbmdlKDEsIDMsIDEsIDcpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgOCksIC8vIFtbXSgpXVxuXHRcdFx0bmV3IFJhbmdlKDEsIDIsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgMSwgMSwgOSksIC8vIFtbW10oKV1dXG5cdFx0KTtcblxuXHRcdGF3YWl0IGFzc2VydFJhbmdlcyhuZXcgQnJhY2tldFNlbGVjdGlvblJhbmdlUHJvdmlkZXIoKSwgJ1thW10ofClhXScsXG5cdFx0XHRuZXcgUmFuZ2UoMSwgNiwgMSwgNiksIG5ldyBSYW5nZSgxLCA1LCAxLCA3KSxcblx0XHRcdG5ldyBSYW5nZSgxLCAyLCAxLCA4KSwgbmV3IFJhbmdlKDEsIDEsIDEsIDkpLFxuXHRcdCk7XG5cblx0XHQvLyBubyBicmFja2V0XG5cdFx0YXdhaXQgYXNzZXJ0UmFuZ2VzKG5ldyBCcmFja2V0U2VsZWN0aW9uUmFuZ2VQcm92aWRlcigpLCAnZm9mb2Z8Zm9mbycpO1xuXG5cdFx0Ly8gZW1wdHlcblx0XHRhd2FpdCBhc3NlcnRSYW5nZXMobmV3IEJyYWNrZXRTZWxlY3Rpb25SYW5nZVByb3ZpZGVyKCksICdbW1tdKCldXXwnKTtcblx0XHRhd2FpdCBhc3NlcnRSYW5nZXMobmV3IEJyYWNrZXRTZWxlY3Rpb25SYW5nZVByb3ZpZGVyKCksICd8W1tbXSgpXV0nKTtcblxuXHRcdC8vIGVkZ2Vcblx0XHRhd2FpdCBhc3NlcnRSYW5nZXMobmV3IEJyYWNrZXRTZWxlY3Rpb25SYW5nZVByb3ZpZGVyKCksICdbfFtbXSgpXV0nLCBuZXcgUmFuZ2UoMSwgMiwgMSwgOCksIG5ldyBSYW5nZSgxLCAxLCAxLCA5KSk7XG5cdFx0YXdhaXQgYXNzZXJ0UmFuZ2VzKG5ldyBCcmFja2V0U2VsZWN0aW9uUmFuZ2VQcm92aWRlcigpLCAnW1tbXSgpXXxdJywgbmV3IFJhbmdlKDEsIDIsIDEsIDgpLCBuZXcgUmFuZ2UoMSwgMSwgMSwgOSkpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0UmFuZ2VzKG5ldyBCcmFja2V0U2VsZWN0aW9uUmFuZ2VQcm92aWRlcigpLCAnYWFhKGFhYSliYmIoYnxiKWNjYyhjY2MpJywgbmV3IFJhbmdlKDEsIDEzLCAxLCAxNSksIG5ldyBSYW5nZSgxLCAxMiwgMSwgMTYpKTtcblx0XHRhd2FpdCBhc3NlcnRSYW5nZXMobmV3IEJyYWNrZXRTZWxlY3Rpb25SYW5nZVByb3ZpZGVyKCksICcoYWFhKGFhYSliYmIoYnxiKWNjYyhjY2MpKScsIG5ldyBSYW5nZSgxLCAxNCwgMSwgMTYpLCBuZXcgUmFuZ2UoMSwgMTMsIDEsIDE3KSwgbmV3IFJhbmdlKDEsIDIsIDEsIDI1KSwgbmV3IFJhbmdlKDEsIDEsIDEsIDI2KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JyYWNrZXQgd2l0aCBsZWFkaW5nL3RyYWlsaW5nJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0YXdhaXQgYXNzZXJ0UmFuZ2VzKG5ldyBCcmFja2V0U2VsZWN0aW9uUmFuZ2VQcm92aWRlcigpLCAnZm9yKGEgb2YgYil7XFxuICBmb28ofCk7XFxufScsXG5cdFx0XHRuZXcgUmFuZ2UoMiwgNywgMiwgNyksIG5ldyBSYW5nZSgyLCA2LCAyLCA4KSxcblx0XHRcdG5ldyBSYW5nZSgxLCAxMywgMywgMSksIG5ldyBSYW5nZSgxLCAxMiwgMywgMiksXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMywgMiksIG5ldyBSYW5nZSgxLCAxLCAzLCAyKSxcblx0XHQpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0UmFuZ2VzKG5ldyBCcmFja2V0U2VsZWN0aW9uUmFuZ2VQcm92aWRlcigpLCAnZm9yKGEgb2YgYilcXG57XFxuICBmb28ofCk7XFxufScsXG5cdFx0XHRuZXcgUmFuZ2UoMywgNywgMywgNyksIG5ldyBSYW5nZSgzLCA2LCAzLCA4KSxcblx0XHRcdG5ldyBSYW5nZSgyLCAyLCA0LCAxKSwgbmV3IFJhbmdlKDIsIDEsIDQsIDIpLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDQsIDIpLCBuZXcgUmFuZ2UoMSwgMSwgNCwgMiksXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaW4td29yZCByYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cblx0XHRhd2FpdCBhc3NlcnRSYW5nZXMobmV3IFdvcmRTZWxlY3Rpb25SYW5nZVByb3ZpZGVyKCksICdmfG9vQmFyJyxcblx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCA0KSwgLy8gZm9vXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgNyksIC8vIGZvb0JhclxuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDcpLCAvLyBkb2Ncblx0XHQpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0UmFuZ2VzKG5ldyBXb3JkU2VsZWN0aW9uUmFuZ2VQcm92aWRlcigpLCAnZnxvb19CYScsXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgNCksXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgNyksXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgNyksXG5cdFx0KTtcblxuXHRcdGF3YWl0IGFzc2VydFJhbmdlcyhuZXcgV29yZFNlbGVjdGlvblJhbmdlUHJvdmlkZXIoKSwgJ2Z8b28tQmEnLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDQpLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDcpLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDcpLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luLXdvcmQgcmFuZ2VzIHdpdGggc2VsZWN0U3Vid29yZHM9ZmFsc2UnLCBhc3luYyAoKSA9PiB7XG5cblx0XHRhd2FpdCBhc3NlcnRSYW5nZXMobmV3IFdvcmRTZWxlY3Rpb25SYW5nZVByb3ZpZGVyKGZhbHNlKSwgJ2Z8b29CYXInLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDcpLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDcpLFxuXHRcdCk7XG5cblx0XHRhd2FpdCBhc3NlcnRSYW5nZXMobmV3IFdvcmRTZWxlY3Rpb25SYW5nZVByb3ZpZGVyKGZhbHNlKSwgJ2Z8b29fQmEnLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDcpLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDcpLFxuXHRcdCk7XG5cblx0XHRhd2FpdCBhc3NlcnRSYW5nZXMobmV3IFdvcmRTZWxlY3Rpb25SYW5nZVByb3ZpZGVyKGZhbHNlKSwgJ2Z8b28tQmEnLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDcpLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDcpLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0RlZmF1bHQgc2VsZWN0aW9uIHNob3VsZCBzZWxlY3QgY3VycmVudCB3b3JkL2h1bXAgZmlyc3QgaW4gY2FtZWxDYXNlICM2NzQ5MycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGF3YWl0IGFzc2VydFJhbmdlcyhuZXcgV29yZFNlbGVjdGlvblJhbmdlUHJvdmlkZXIoKSwgJ0Fic3x0cmFjdFNtYXJ0U2VsZWN0Jyxcblx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCA5KSxcblx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCAyMCksXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgMjApLFxuXHRcdCk7XG5cblx0XHRhd2FpdCBhc3NlcnRSYW5nZXMobmV3IFdvcmRTZWxlY3Rpb25SYW5nZVByb3ZpZGVyKCksICdBYnN0cmFjdFNtYXxydFNlbGVjdCcsXG5cdFx0XHRuZXcgUmFuZ2UoMSwgOSwgMSwgMTQpLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDIwKSxcblx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCAyMCksXG5cdFx0KTtcblxuXHRcdGF3YWl0IGFzc2VydFJhbmdlcyhuZXcgV29yZFNlbGVjdGlvblJhbmdlUHJvdmlkZXIoKSwgJ0Fic3RyYWMtU21hfHJ0LWVsZWN0Jyxcblx0XHRcdG5ldyBSYW5nZSgxLCA5LCAxLCAxNCksXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgMjApLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDIwKSxcblx0XHQpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0UmFuZ2VzKG5ldyBXb3JkU2VsZWN0aW9uUmFuZ2VQcm92aWRlcigpLCAnQWJzdHJhY19TbWF8cnRfZWxlY3QnLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDksIDEsIDE0KSxcblx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCAyMCksXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgMjApLFxuXHRcdCk7XG5cblx0XHRhd2FpdCBhc3NlcnRSYW5nZXMobmV3IFdvcmRTZWxlY3Rpb25SYW5nZVByb3ZpZGVyKCksICdBYnN0cmFjX1NtYXxydC1lbGVjdCcsXG5cdFx0XHRuZXcgUmFuZ2UoMSwgOSwgMSwgMTQpLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDIwKSxcblx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCAyMCksXG5cdFx0KTtcblxuXHRcdGF3YWl0IGFzc2VydFJhbmdlcyhuZXcgV29yZFNlbGVjdGlvblJhbmdlUHJvdmlkZXIoKSwgJ0Fic3RyYWNfU21hfHJ0U2VsZWN0Jyxcblx0XHRcdG5ldyBSYW5nZSgxLCA5LCAxLCAxNCksXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgMjApLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDIwKSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdTbWFydCBzZWxlY3Q6IG9ubHkgYWRkIGxpbmUgcmFuZ2VzIGlmIHRoZXlcXCdyZSBjb250YWluZWQgYnkgdGhlIG5leHQgcmFuZ2UgIzczODUwJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgcmVnID0gcHJvdmlkZXJzLnJlZ2lzdGVyKCcqJywge1xuXHRcdFx0cHJvdmlkZVNlbGVjdGlvblJhbmdlcygpIHtcblx0XHRcdFx0cmV0dXJuIFtbXG5cdFx0XHRcdFx0eyByYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxMCwgZW5kTGluZU51bWJlcjogMSwgZW5kQ29sdW1uOiAxMSB9IH0sXG5cdFx0XHRcdFx0eyByYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxMCwgZW5kTGluZU51bWJlcjogMywgZW5kQ29sdW1uOiAyIH0gfSxcblx0XHRcdFx0XHR7IHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDMsIGVuZENvbHVtbjogMiB9IH0sXG5cdFx0XHRcdF1dO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgYXNzZXJ0R2V0UmFuZ2VzVG9Qb3NpdGlvbihbJ3R5cGUgVCA9IHsnLCAnXFx0eDogbnVtYmVyJywgJ30nXSwgMSwgMTAsIFtcblx0XHRcdG5ldyBSYW5nZSgxLCAxLCAzLCAyKSwgLy8gYWxsXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMTAsIDMsIDIpLCAvLyB7IC4uLiB9XG5cdFx0XHRuZXcgUmFuZ2UoMSwgMTAsIDEsIDExKSwgLy8ge1xuXHRcdF0pO1xuXG5cdFx0cmVnLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnRXhwYW5kIHNlbGVjdGlvbiBpbiB3b3JkcyB3aXRoIHVuZGVyc2NvcmVzIGlzIGluY29uc2lzdGVudCAjOTA1ODknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRhd2FpdCBhc3NlcnRSYW5nZXMobmV3IFdvcmRTZWxlY3Rpb25SYW5nZVByb3ZpZGVyKCksICdIZWx8bG9fV29ybGQnLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDYpLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDEyKSxcblx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCAxMiksXG5cdFx0KTtcblxuXHRcdGF3YWl0IGFzc2VydFJhbmdlcyhuZXcgV29yZFNlbGVjdGlvblJhbmdlUHJvdmlkZXIoKSwgJ0hlbGxvX1dvfHJsZCcsXG5cdFx0XHRuZXcgUmFuZ2UoMSwgNywgMSwgMTIpLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDEyKSxcblx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCAxMiksXG5cdFx0KTtcblxuXHRcdGF3YWl0IGFzc2VydFJhbmdlcyhuZXcgV29yZFNlbGVjdGlvblJhbmdlUHJvdmlkZXIoKSwgJ0hlbGxvfF9Xb3JsZCcsXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgNiksXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgMTIpLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDEyKSxcblx0XHQpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0UmFuZ2VzKG5ldyBXb3JkU2VsZWN0aW9uUmFuZ2VQcm92aWRlcigpLCAnSGVsbG9ffFdvcmxkJyxcblx0XHRcdG5ldyBSYW5nZSgxLCA3LCAxLCAxMiksXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgMTIpLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDEyKSxcblx0XHQpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0UmFuZ2VzKG5ldyBXb3JkU2VsZWN0aW9uUmFuZ2VQcm92aWRlcigpLCAnSGVsbG98LVdvcmxkJyxcblx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCA2KSxcblx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCAxMiksXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgMTIpLFxuXHRcdCk7XG5cblx0XHRhd2FpdCBhc3NlcnRSYW5nZXMobmV3IFdvcmRTZWxlY3Rpb25SYW5nZVByb3ZpZGVyKCksICdIZWxsby18V29ybGQnLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDcsIDEsIDEyKSxcblx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCAxMiksXG5cdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMSwgMTIpLFxuXHRcdCk7XG5cblx0XHRhd2FpdCBhc3NlcnRSYW5nZXMobmV3IFdvcmRTZWxlY3Rpb25SYW5nZVByb3ZpZGVyKCksICdIZWxsb3xXb3JsZCcsXG5cdFx0XHRuZXcgUmFuZ2UoMSwgNiwgMSwgMTEpLFxuXHRcdFx0bmV3IFJhbmdlKDEsIDEsIDEsIDExKSxcblx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCAxMSksXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQWlCLGFBQWE7QUFFOUIsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUywrQkFBK0I7QUFDeEMsU0FBNkIsd0JBQXdCO0FBQ3JELFNBQVMsK0NBQStDO0FBRXhELE1BQU0sdUJBQXFEO0FBQUEsRUFFMUQsWUFBNEIsWUFBb0I7QUFBcEI7QUFENUIsU0FBUyxjQUE2QixNQUFNO0FBQUEsRUFDTTtBQUNuRDtBQUVBLE1BQU0sZUFBZSxNQUFNO0FBRTFCLFFBQU0sbURBQW1ELDhCQUE4QjtBQUV2RixhQUFXLE1BQU07QUFDaEIsa0NBQThCLGVBQWU7QUFBQSxFQUM5QyxDQUFDO0FBRUQsZ0JBQWMsTUFBTTtBQUNuQixrQ0FBOEIsZUFBZTtBQUFBLEVBQzlDLENBQUM7QUFFRCxRQUFNLGFBQWE7QUFDbkIsTUFBSTtBQUNKLE1BQUk7QUFDSixRQUFNLFlBQVksSUFBSSx3QkFBZ0Q7QUFFdEUsUUFBTSxNQUFNO0FBQ1gsa0JBQWMsSUFBSSxnQkFBZ0I7QUFDbEMsVUFBTSx1QkFBdUIsb0JBQW9CLFdBQVc7QUFDNUQsbUJBQWUscUJBQXFCLElBQUksYUFBYTtBQUNyRCxVQUFNLDhCQUE4QixxQkFBcUIsSUFBSSw2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QUE7QUFBQSxNQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBO0FBQUEsTUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQTtBQUFBLElBQ3JCLEdBQUcsSUFBSTtBQUVQLFVBQU0sMEJBQTBCO0FBQUEsTUFDL0I7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxHQUFHLEdBQUc7QUFBQSxNQUNSLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUE7QUFBQSxNQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBO0FBQUEsSUFDckIsR0FBRyxLQUFLO0FBQUEsRUFDVCxDQUFDO0FBRUQsT0FBSywyREFBMkQsTUFBTTtBQUVyRSxXQUFPLDBCQUEwQjtBQUFBLE1BQ2hDO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxHQUFHLEdBQUc7QUFBQSxNQUNSLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDcEIsSUFBSSxNQUFNLEdBQUcsSUFBSSxHQUFHLENBQUM7QUFBQSxNQUNyQixJQUFJLE1BQU0sR0FBRyxJQUFJLEdBQUcsQ0FBQztBQUFBLE1BQ3JCLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDcEIsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUNwQixJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3BCLElBQUksTUFBTSxHQUFHLElBQUksR0FBRyxDQUFDO0FBQUEsTUFDckIsSUFBSSxNQUFNLEdBQUcsSUFBSSxHQUFHLENBQUM7QUFBQSxJQUN0QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx3RUFBd0UsTUFBTTtBQUVsRixXQUFPLDBCQUEwQjtBQUFBLE1BQ2hDO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxHQUFH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
