import assert from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { LanguageAgnosticBracketTokens } from "../../../../common/model/bracketPairsTextModelPart/bracketPairsTree/brackets.js";
import { SmallImmutableSet, DenseKeyProvider } from "../../../../common/model/bracketPairsTextModelPart/bracketPairsTree/smallImmutableSet.js";
import { TokenKind } from "../../../../common/model/bracketPairsTextModelPart/bracketPairsTree/tokenizer.js";
import { TestLanguageConfigurationService } from "../../modes/testLanguageConfigurationService.js";
suite("Bracket Pair Colorizer - Brackets", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Basic", () => {
    const languageId = "testMode1";
    const denseKeyProvider = new DenseKeyProvider();
    const getImmutableSet = (elements) => {
      let newSet = SmallImmutableSet.getEmpty();
      elements.forEach((x) => newSet = newSet.add(`${languageId}:::${x}`, denseKeyProvider));
      return newSet;
    };
    const getKey = (value) => {
      return denseKeyProvider.getKey(`${languageId}:::${value}`);
    };
    const disposableStore = new DisposableStore();
    const languageConfigService = disposableStore.add(new TestLanguageConfigurationService());
    disposableStore.add(languageConfigService.register(languageId, {
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"],
        ["begin", "end"],
        ["case", "endcase"],
        ["casez", "endcase"],
        // Verilog
        ["\\left(", "\\right)"],
        ["\\left(", "\\right."],
        ["\\left.", "\\right)"],
        // LaTeX Parentheses
        ["\\left[", "\\right]"],
        ["\\left[", "\\right."],
        ["\\left.", "\\right]"]
        // LaTeX Brackets
      ]
    }));
    const brackets = new LanguageAgnosticBracketTokens(denseKeyProvider, (l) => languageConfigService.getLanguageConfiguration(l));
    const bracketsExpected = [
      { text: "{", length: 1, kind: "OpeningBracket", bracketId: getKey("{"), bracketIds: getImmutableSet(["{"]) },
      { text: "[", length: 1, kind: "OpeningBracket", bracketId: getKey("["), bracketIds: getImmutableSet(["["]) },
      { text: "(", length: 1, kind: "OpeningBracket", bracketId: getKey("("), bracketIds: getImmutableSet(["("]) },
      { text: "begin", length: 5, kind: "OpeningBracket", bracketId: getKey("begin"), bracketIds: getImmutableSet(["begin"]) },
      { text: "case", length: 4, kind: "OpeningBracket", bracketId: getKey("case"), bracketIds: getImmutableSet(["case"]) },
      { text: "casez", length: 5, kind: "OpeningBracket", bracketId: getKey("casez"), bracketIds: getImmutableSet(["casez"]) },
      { text: "\\left(", length: 6, kind: "OpeningBracket", bracketId: getKey("\\left("), bracketIds: getImmutableSet(["\\left("]) },
      { text: "\\left.", length: 6, kind: "OpeningBracket", bracketId: getKey("\\left."), bracketIds: getImmutableSet(["\\left."]) },
      { text: "\\left[", length: 6, kind: "OpeningBracket", bracketId: getKey("\\left["), bracketIds: getImmutableSet(["\\left["]) },
      { text: "}", length: 1, kind: "ClosingBracket", bracketId: getKey("{"), bracketIds: getImmutableSet(["{"]) },
      { text: "]", length: 1, kind: "ClosingBracket", bracketId: getKey("["), bracketIds: getImmutableSet(["["]) },
      { text: ")", length: 1, kind: "ClosingBracket", bracketId: getKey("("), bracketIds: getImmutableSet(["("]) },
      { text: "end", length: 3, kind: "ClosingBracket", bracketId: getKey("begin"), bracketIds: getImmutableSet(["begin"]) },
      { text: "endcase", length: 7, kind: "ClosingBracket", bracketId: getKey("case"), bracketIds: getImmutableSet(["case", "casez"]) },
      { text: "\\right)", length: 7, kind: "ClosingBracket", bracketId: getKey("\\left("), bracketIds: getImmutableSet(["\\left(", "\\left."]) },
      { text: "\\right.", length: 7, kind: "ClosingBracket", bracketId: getKey("\\left("), bracketIds: getImmutableSet(["\\left(", "\\left["]) },
      { text: "\\right]", length: 7, kind: "ClosingBracket", bracketId: getKey("\\left["), bracketIds: getImmutableSet(["\\left[", "\\left."]) }
    ];
    const bracketsActual = bracketsExpected.map((x) => tokenToObject(brackets.getToken(x.text, languageId), x.text));
    assert.deepStrictEqual(bracketsActual, bracketsExpected);
    disposableStore.dispose();
  });
});
function tokenToObject(token, text) {
  if (token === void 0) {
    return void 0;
  }
  return {
    text,
    length: token.length,
    bracketId: token.bracketId,
    bracketIds: token.bracketIds,
    kind: {
      [TokenKind.ClosingBracket]: "ClosingBracket",
      [TokenKind.OpeningBracket]: "OpeningBracket",
      [TokenKind.Text]: "Text"
    }[token.kind]
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZWxcXGJyYWNrZXRQYWlyQ29sb3JpemVyXFxicmFja2V0cy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VBZ25vc3RpY0JyYWNrZXRUb2tlbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvYnJhY2tldFBhaXJzVGV4dE1vZGVsUGFydC9icmFja2V0UGFpcnNUcmVlL2JyYWNrZXRzLmpzJztcbmltcG9ydCB7IFNtYWxsSW1tdXRhYmxlU2V0LCBEZW5zZUtleVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL2JyYWNrZXRQYWlyc1RleHRNb2RlbFBhcnQvYnJhY2tldFBhaXJzVHJlZS9zbWFsbEltbXV0YWJsZVNldC5qcyc7XG5pbXBvcnQgeyBUb2tlbiwgVG9rZW5LaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL2JyYWNrZXRQYWlyc1RleHRNb2RlbFBhcnQvYnJhY2tldFBhaXJzVHJlZS90b2tlbml6ZXIuanMnO1xuaW1wb3J0IHsgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9tb2Rlcy90ZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5cbnN1aXRlKCdCcmFja2V0IFBhaXIgQ29sb3JpemVyIC0gQnJhY2tldHMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ0Jhc2ljJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSAndGVzdE1vZGUxJztcblx0XHRjb25zdCBkZW5zZUtleVByb3ZpZGVyID0gbmV3IERlbnNlS2V5UHJvdmlkZXI8c3RyaW5nPigpO1xuXHRcdGNvbnN0IGdldEltbXV0YWJsZVNldCA9IChlbGVtZW50czogc3RyaW5nW10pID0+IHtcblx0XHRcdGxldCBuZXdTZXQgPSBTbWFsbEltbXV0YWJsZVNldC5nZXRFbXB0eSgpO1xuXHRcdFx0ZWxlbWVudHMuZm9yRWFjaCh4ID0+IG5ld1NldCA9IG5ld1NldC5hZGQoYCR7bGFuZ3VhZ2VJZH06Ojoke3h9YCwgZGVuc2VLZXlQcm92aWRlcikpO1xuXHRcdFx0cmV0dXJuIG5ld1NldDtcblx0XHR9O1xuXHRcdGNvbnN0IGdldEtleSA9ICh2YWx1ZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRyZXR1cm4gZGVuc2VLZXlQcm92aWRlci5nZXRLZXkoYCR7bGFuZ3VhZ2VJZH06Ojoke3ZhbHVlfWApO1xuXHRcdH07XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VDb25maWdTZXJ2aWNlID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKSk7XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChsYW5ndWFnZUNvbmZpZ1NlcnZpY2UucmVnaXN0ZXIobGFuZ3VhZ2VJZCwge1xuXHRcdFx0YnJhY2tldHM6IFtcblx0XHRcdFx0Wyd7JywgJ30nXSwgWydbJywgJ10nXSwgWycoJywgJyknXSxcblx0XHRcdFx0WydiZWdpbicsICdlbmQnXSwgWydjYXNlJywgJ2VuZGNhc2UnXSwgWydjYXNleicsICdlbmRjYXNlJ10sXHRcdFx0XHRcdC8vIFZlcmlsb2dcblx0XHRcdFx0WydcXFxcbGVmdCgnLCAnXFxcXHJpZ2h0KSddLCBbJ1xcXFxsZWZ0KCcsICdcXFxccmlnaHQuJ10sIFsnXFxcXGxlZnQuJywgJ1xcXFxyaWdodCknXSxcdFx0Ly8gTGFUZVggUGFyZW50aGVzZXNcblx0XHRcdFx0WydcXFxcbGVmdFsnLCAnXFxcXHJpZ2h0XSddLCBbJ1xcXFxsZWZ0WycsICdcXFxccmlnaHQuJ10sIFsnXFxcXGxlZnQuJywgJ1xcXFxyaWdodF0nXVx0XHQvLyBMYVRlWCBCcmFja2V0c1xuXHRcdFx0XVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGJyYWNrZXRzID0gbmV3IExhbmd1YWdlQWdub3N0aWNCcmFja2V0VG9rZW5zKGRlbnNlS2V5UHJvdmlkZXIsIGwgPT4gbGFuZ3VhZ2VDb25maWdTZXJ2aWNlLmdldExhbmd1YWdlQ29uZmlndXJhdGlvbihsKSk7XG5cdFx0Y29uc3QgYnJhY2tldHNFeHBlY3RlZCA9IFtcblx0XHRcdHsgdGV4dDogJ3snLCBsZW5ndGg6IDEsIGtpbmQ6ICdPcGVuaW5nQnJhY2tldCcsIGJyYWNrZXRJZDogZ2V0S2V5KCd7JyksIGJyYWNrZXRJZHM6IGdldEltbXV0YWJsZVNldChbJ3snXSkgfSxcblx0XHRcdHsgdGV4dDogJ1snLCBsZW5ndGg6IDEsIGtpbmQ6ICdPcGVuaW5nQnJhY2tldCcsIGJyYWNrZXRJZDogZ2V0S2V5KCdbJyksIGJyYWNrZXRJZHM6IGdldEltbXV0YWJsZVNldChbJ1snXSkgfSxcblx0XHRcdHsgdGV4dDogJygnLCBsZW5ndGg6IDEsIGtpbmQ6ICdPcGVuaW5nQnJhY2tldCcsIGJyYWNrZXRJZDogZ2V0S2V5KCcoJyksIGJyYWNrZXRJZHM6IGdldEltbXV0YWJsZVNldChbJygnXSkgfSxcblx0XHRcdHsgdGV4dDogJ2JlZ2luJywgbGVuZ3RoOiA1LCBraW5kOiAnT3BlbmluZ0JyYWNrZXQnLCBicmFja2V0SWQ6IGdldEtleSgnYmVnaW4nKSwgYnJhY2tldElkczogZ2V0SW1tdXRhYmxlU2V0KFsnYmVnaW4nXSkgfSxcblx0XHRcdHsgdGV4dDogJ2Nhc2UnLCBsZW5ndGg6IDQsIGtpbmQ6ICdPcGVuaW5nQnJhY2tldCcsIGJyYWNrZXRJZDogZ2V0S2V5KCdjYXNlJyksIGJyYWNrZXRJZHM6IGdldEltbXV0YWJsZVNldChbJ2Nhc2UnXSkgfSxcblx0XHRcdHsgdGV4dDogJ2Nhc2V6JywgbGVuZ3RoOiA1LCBraW5kOiAnT3BlbmluZ0JyYWNrZXQnLCBicmFja2V0SWQ6IGdldEtleSgnY2FzZXonKSwgYnJhY2tldElkczogZ2V0SW1tdXRhYmxlU2V0KFsnY2FzZXonXSkgfSxcblx0XHRcdHsgdGV4dDogJ1xcXFxsZWZ0KCcsIGxlbmd0aDogNiwga2luZDogJ09wZW5pbmdCcmFja2V0JywgYnJhY2tldElkOiBnZXRLZXkoJ1xcXFxsZWZ0KCcpLCBicmFja2V0SWRzOiBnZXRJbW11dGFibGVTZXQoWydcXFxcbGVmdCgnXSkgfSxcblx0XHRcdHsgdGV4dDogJ1xcXFxsZWZ0LicsIGxlbmd0aDogNiwga2luZDogJ09wZW5pbmdCcmFja2V0JywgYnJhY2tldElkOiBnZXRLZXkoJ1xcXFxsZWZ0LicpLCBicmFja2V0SWRzOiBnZXRJbW11dGFibGVTZXQoWydcXFxcbGVmdC4nXSkgfSxcblx0XHRcdHsgdGV4dDogJ1xcXFxsZWZ0WycsIGxlbmd0aDogNiwga2luZDogJ09wZW5pbmdCcmFja2V0JywgYnJhY2tldElkOiBnZXRLZXkoJ1xcXFxsZWZ0WycpLCBicmFja2V0SWRzOiBnZXRJbW11dGFibGVTZXQoWydcXFxcbGVmdFsnXSkgfSxcblxuXHRcdFx0eyB0ZXh0OiAnfScsIGxlbmd0aDogMSwga2luZDogJ0Nsb3NpbmdCcmFja2V0JywgYnJhY2tldElkOiBnZXRLZXkoJ3snKSwgYnJhY2tldElkczogZ2V0SW1tdXRhYmxlU2V0KFsneyddKSB9LFxuXHRcdFx0eyB0ZXh0OiAnXScsIGxlbmd0aDogMSwga2luZDogJ0Nsb3NpbmdCcmFja2V0JywgYnJhY2tldElkOiBnZXRLZXkoJ1snKSwgYnJhY2tldElkczogZ2V0SW1tdXRhYmxlU2V0KFsnWyddKSB9LFxuXHRcdFx0eyB0ZXh0OiAnKScsIGxlbmd0aDogMSwga2luZDogJ0Nsb3NpbmdCcmFja2V0JywgYnJhY2tldElkOiBnZXRLZXkoJygnKSwgYnJhY2tldElkczogZ2V0SW1tdXRhYmxlU2V0KFsnKCddKSB9LFxuXHRcdFx0eyB0ZXh0OiAnZW5kJywgbGVuZ3RoOiAzLCBraW5kOiAnQ2xvc2luZ0JyYWNrZXQnLCBicmFja2V0SWQ6IGdldEtleSgnYmVnaW4nKSwgYnJhY2tldElkczogZ2V0SW1tdXRhYmxlU2V0KFsnYmVnaW4nXSkgfSxcblx0XHRcdHsgdGV4dDogJ2VuZGNhc2UnLCBsZW5ndGg6IDcsIGtpbmQ6ICdDbG9zaW5nQnJhY2tldCcsIGJyYWNrZXRJZDogZ2V0S2V5KCdjYXNlJyksIGJyYWNrZXRJZHM6IGdldEltbXV0YWJsZVNldChbJ2Nhc2UnLCAnY2FzZXonXSkgfSxcblx0XHRcdHsgdGV4dDogJ1xcXFxyaWdodCknLCBsZW5ndGg6IDcsIGtpbmQ6ICdDbG9zaW5nQnJhY2tldCcsIGJyYWNrZXRJZDogZ2V0S2V5KCdcXFxcbGVmdCgnKSwgYnJhY2tldElkczogZ2V0SW1tdXRhYmxlU2V0KFsnXFxcXGxlZnQoJywgJ1xcXFxsZWZ0LiddKSB9LFxuXHRcdFx0eyB0ZXh0OiAnXFxcXHJpZ2h0LicsIGxlbmd0aDogNywga2luZDogJ0Nsb3NpbmdCcmFja2V0JywgYnJhY2tldElkOiBnZXRLZXkoJ1xcXFxsZWZ0KCcpLCBicmFja2V0SWRzOiBnZXRJbW11dGFibGVTZXQoWydcXFxcbGVmdCgnLCAnXFxcXGxlZnRbJ10pIH0sXG5cdFx0XHR7IHRleHQ6ICdcXFxccmlnaHRdJywgbGVuZ3RoOiA3LCBraW5kOiAnQ2xvc2luZ0JyYWNrZXQnLCBicmFja2V0SWQ6IGdldEtleSgnXFxcXGxlZnRbJyksIGJyYWNrZXRJZHM6IGdldEltbXV0YWJsZVNldChbJ1xcXFxsZWZ0WycsICdcXFxcbGVmdC4nXSkgfVxuXHRcdF07XG5cdFx0Y29uc3QgYnJhY2tldHNBY3R1YWwgPSBicmFja2V0c0V4cGVjdGVkLm1hcCh4ID0+IHRva2VuVG9PYmplY3QoYnJhY2tldHMuZ2V0VG9rZW4oeC50ZXh0LCBsYW5ndWFnZUlkKSwgeC50ZXh0KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJyYWNrZXRzQWN0dWFsLCBicmFja2V0c0V4cGVjdGVkKTtcblxuXHRcdGRpc3Bvc2FibGVTdG9yZS5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG5cbmZ1bmN0aW9uIHRva2VuVG9PYmplY3QodG9rZW46IFRva2VuIHwgdW5kZWZpbmVkLCB0ZXh0OiBzdHJpbmcpOiBhbnkge1xuXHRpZiAodG9rZW4gPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHtcblx0XHR0ZXh0OiB0ZXh0LFxuXHRcdGxlbmd0aDogdG9rZW4ubGVuZ3RoLFxuXHRcdGJyYWNrZXRJZDogdG9rZW4uYnJhY2tldElkLFxuXHRcdGJyYWNrZXRJZHM6IHRva2VuLmJyYWNrZXRJZHMsXG5cdFx0a2luZDoge1xuXHRcdFx0W1Rva2VuS2luZC5DbG9zaW5nQnJhY2tldF06ICdDbG9zaW5nQnJhY2tldCcsXG5cdFx0XHRbVG9rZW5LaW5kLk9wZW5pbmdCcmFja2V0XTogJ09wZW5pbmdCcmFja2V0Jyxcblx0XHRcdFtUb2tlbktpbmQuVGV4dF06ICdUZXh0Jyxcblx0XHR9W3Rva2VuLmtpbmRdLFxuXHR9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsbUJBQW1CLHdCQUF3QjtBQUNwRCxTQUFnQixpQkFBaUI7QUFDakMsU0FBUyx3Q0FBd0M7QUFFakQsTUFBTSxxQ0FBcUMsTUFBTTtBQUNoRCwwQ0FBd0M7QUFFeEMsT0FBSyxTQUFTLE1BQU07QUFDbkIsVUFBTSxhQUFhO0FBQ25CLFVBQU0sbUJBQW1CLElBQUksaUJBQXlCO0FBQ3RELFVBQU0sa0JBQWtCLENBQUMsYUFBdUI7QUFDL0MsVUFBSSxTQUFTLGtCQUFrQixTQUFTO0FBQ3hDLGVBQVMsUUFBUSxPQUFLLFNBQVMsT0FBTyxJQUFJLEdBQUcsVUFBVSxNQUFNLENBQUMsSUFBSSxnQkFBZ0IsQ0FBQztBQUNuRixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sU0FBUyxDQUFDLFVBQWtCO0FBQ2pDLGFBQU8saUJBQWlCLE9BQU8sR0FBRyxVQUFVLE1BQU0sS0FBSyxFQUFFO0FBQUEsSUFDMUQ7QUFFQSxVQUFNLGtCQUFrQixJQUFJLGdCQUFnQjtBQUM1QyxVQUFNLHdCQUF3QixnQkFBZ0IsSUFBSSxJQUFJLGlDQUFpQyxDQUFDO0FBQ3hGLG9CQUFnQixJQUFJLHNCQUFzQixTQUFTLFlBQVk7QUFBQSxNQUM5RCxVQUFVO0FBQUEsUUFDVCxDQUFDLEtBQUssR0FBRztBQUFBLFFBQUcsQ0FBQyxLQUFLLEdBQUc7QUFBQSxRQUFHLENBQUMsS0FBSyxHQUFHO0FBQUEsUUFDakMsQ0FBQyxTQUFTLEtBQUs7QUFBQSxRQUFHLENBQUMsUUFBUSxTQUFTO0FBQUEsUUFBRyxDQUFDLFNBQVMsU0FBUztBQUFBO0FBQUEsUUFDMUQsQ0FBQyxXQUFX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
