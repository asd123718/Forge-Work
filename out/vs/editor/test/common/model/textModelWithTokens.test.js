import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { TokenizationRegistry, EncodedTokenizationResult } from "../../../common/languages.js";
import { StandardTokenType, MetadataConsts } from "../../../common/encodedTokenAttributes.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { NullState } from "../../../common/languages/nullTokenize.js";
import { ILanguageService } from "../../../common/languages/language.js";
import { TestLineToken } from "../core/testLineToken.js";
import { createModelServices, createTextModel, instantiateTextModel } from "../testTextModel.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
function createTextModelWithBrackets(disposables, text, brackets) {
  const languageId = "bracketMode2";
  const instantiationService = createModelServices(disposables);
  const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
  const languageService = instantiationService.get(ILanguageService);
  disposables.add(languageService.registerLanguage({ id: languageId }));
  disposables.add(languageConfigurationService.register(languageId, { brackets }));
  return disposables.add(instantiateTextModel(instantiationService, text, languageId));
}
suite("TextModelWithTokens", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function testBrackets(contents, brackets) {
    const languageId = "testMode";
    const disposables = new DisposableStore();
    const instantiationService = createModelServices(disposables);
    const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
    const languageService = instantiationService.get(ILanguageService);
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      brackets
    }));
    function toRelaxedFoundBracket(a) {
      if (!a) {
        return null;
      }
      return {
        range: a.range.toString(),
        info: a.bracketInfo
      };
    }
    const charIsBracket = {};
    const charIsOpenBracket = {};
    const openForChar = {};
    const closeForChar = {};
    brackets.forEach((b) => {
      charIsBracket[b[0]] = true;
      charIsBracket[b[1]] = true;
      charIsOpenBracket[b[0]] = true;
      charIsOpenBracket[b[1]] = false;
      openForChar[b[0]] = b[0];
      closeForChar[b[0]] = b[1];
      openForChar[b[1]] = b[0];
      closeForChar[b[1]] = b[1];
    });
    const expectedBrackets = [];
    for (let lineIndex = 0; lineIndex < contents.length; lineIndex++) {
      const lineText = contents[lineIndex];
      for (let charIndex = 0; charIndex < lineText.length; charIndex++) {
        const ch = lineText.charAt(charIndex);
        if (charIsBracket[ch]) {
          expectedBrackets.push({
            bracketInfo: languageConfigurationService.getLanguageConfiguration(languageId).bracketsNew.getBracketInfo(ch),
            range: new Range(lineIndex + 1, charIndex + 1, lineIndex + 1, charIndex + 2)
          });
        }
      }
    }
    const model = disposables.add(instantiateTextModel(instantiationService, contents.join("\n"), languageId));
    {
      let expectedBracketIndex = expectedBrackets.length - 1;
      let currentExpectedBracket = expectedBracketIndex >= 0 ? expectedBrackets[expectedBracketIndex] : null;
      for (let lineNumber = contents.length; lineNumber >= 1; lineNumber--) {
        const lineText = contents[lineNumber - 1];
        for (let column = lineText.length + 1; column >= 1; column--) {
          if (currentExpectedBracket) {
            if (lineNumber === currentExpectedBracket.range.startLineNumber && column < currentExpectedBracket.range.endColumn) {
              expectedBracketIndex--;
              currentExpectedBracket = expectedBracketIndex >= 0 ? expectedBrackets[expectedBracketIndex] : null;
            }
          }
          const actual = model.bracketPairs.findPrevBracket({
            lineNumber,
            column
          });
          assert.deepStrictEqual(toRelaxedFoundBracket(actual), toRelaxedFoundBracket(currentExpectedBracket), "findPrevBracket of " + lineNumber + ", " + column);
        }
      }
    }
    {
      let expectedBracketIndex = 0;
      let currentExpectedBracket = expectedBracketIndex < expectedBrackets.length ? expectedBrackets[expectedBracketIndex] : null;
      for (let lineNumber = 1; lineNumber <= contents.length; lineNumber++) {
        const lineText = contents[lineNumber - 1];
        for (let column = 1; column <= lineText.length + 1; column++) {
          if (currentExpectedBracket) {
            if (lineNumber === currentExpectedBracket.range.startLineNumber && column > currentExpectedBracket.range.startColumn) {
              expectedBracketIndex++;
              currentExpectedBracket = expectedBracketIndex < expectedBrackets.length ? expectedBrackets[expectedBracketIndex] : null;
            }
          }
          const actual = model.bracketPairs.findNextBracket({
            lineNumber,
            column
          });
          assert.deepStrictEqual(toRelaxedFoundBracket(actual), toRelaxedFoundBracket(currentExpectedBracket), "findNextBracket of " + lineNumber + ", " + column);
        }
      }
    }
    disposables.dispose();
  }
  test("brackets1", () => {
    testBrackets([
      "if (a == 3) { return (7 * (a + 5)); }"
    ], [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"]
    ]);
  });
});
function assertIsNotBracket(model, lineNumber, column) {
  const match = model.bracketPairs.matchBracket(new Position(lineNumber, column));
  assert.strictEqual(match, null, "is not matching brackets at " + lineNumber + ", " + column);
}
function assertIsBracket(model, testPosition, expected) {
  expected.sort(Range.compareRangesUsingStarts);
  const actual = model.bracketPairs.matchBracket(testPosition);
  actual?.sort(Range.compareRangesUsingStarts);
  assert.deepStrictEqual(actual, expected, "matches brackets at " + testPosition);
}
suite("TextModelWithTokens - bracket matching", () => {
  const languageId = "bracketMode1";
  let disposables;
  let instantiationService;
  let languageConfigurationService;
  let languageService;
  setup(() => {
    disposables = new DisposableStore();
    instantiationService = createModelServices(disposables);
    languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
    languageService = instantiationService.get(ILanguageService);
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
      ]
    }));
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("bracket matching 1", () => {
    const text = ")]}{[(\n)]}{[(";
    const model = disposables.add(instantiateTextModel(instantiationService, text, languageId));
    assertIsNotBracket(model, 1, 1);
    assertIsNotBracket(model, 1, 2);
    assertIsNotBracket(model, 1, 3);
    assertIsBracket(model, new Position(1, 4), [new Range(1, 4, 1, 5), new Range(2, 3, 2, 4)]);
    assertIsBracket(model, new Position(1, 5), [new Range(1, 5, 1, 6), new Range(2, 2, 2, 3)]);
    assertIsBracket(model, new Position(1, 6), [new Range(1, 6, 1, 7), new Range(2, 1, 2, 2)]);
    assertIsBracket(model, new Position(1, 7), [new Range(1, 6, 1, 7), new Range(2, 1, 2, 2)]);
    assertIsBracket(model, new Position(2, 1), [new Range(2, 1, 2, 2), new Range(1, 6, 1, 7)]);
    assertIsBracket(model, new Position(2, 2), [new Range(2, 2, 2, 3), new Range(1, 5, 1, 6)]);
    assertIsBracket(model, new Position(2, 3), [new Range(2, 3, 2, 4), new Range(1, 4, 1, 5)]);
    assertIsBracket(model, new Position(2, 4), [new Range(2, 3, 2, 4), new Range(1, 4, 1, 5)]);
    assertIsNotBracket(model, 2, 5);
    assertIsNotBracket(model, 2, 6);
    assertIsNotBracket(model, 2, 7);
  });
  test("bracket matching 2", () => {
    const text = "var bar = {\nfoo: {\n}, bar: {hallo: [{\n}, {\n}]}}";
    const model = disposables.add(instantiateTextModel(instantiationService, text, languageId));
    const brackets = [
      [new Position(1, 11), new Range(1, 11, 1, 12), new Range(5, 4, 5, 5)],
      [new Position(1, 12), new Range(1, 11, 1, 12), new Range(5, 4, 5, 5)],
      [new Position(2, 6), new Range(2, 6, 2, 7), new Range(3, 1, 3, 2)],
      [new Position(2, 7), new Range(2, 6, 2, 7), new Range(3, 1, 3, 2)],
      [new Position(3, 1), new Range(3, 1, 3, 2), new Range(2, 6, 2, 7)],
      [new Position(3, 2), new Range(3, 1, 3, 2), new Range(2, 6, 2, 7)],
      [new Position(3, 9), new Range(3, 9, 3, 10), new Range(5, 3, 5, 4)],
      [new Position(3, 10), new Range(3, 9, 3, 10), new Range(5, 3, 5, 4)],
      [new Position(3, 17), new Range(3, 17, 3, 18), new Range(5, 2, 5, 3)],
      [new Position(3, 18), new Range(3, 18, 3, 19), new Range(4, 1, 4, 2)],
      [new Position(3, 19), new Range(3, 18, 3, 19), new Range(4, 1, 4, 2)],
      [new Position(4, 1), new Range(4, 1, 4, 2), new Range(3, 18, 3, 19)],
      [new Position(4, 2), new Range(4, 1, 4, 2), new Range(3, 18, 3, 19)],
      [new Position(4, 4), new Range(4, 4, 4, 5), new Range(5, 1, 5, 2)],
      [new Position(4, 5), new Range(4, 4, 4, 5), new Range(5, 1, 5, 2)],
      [new Position(5, 1), new Range(5, 1, 5, 2), new Range(4, 4, 4, 5)],
      [new Position(5, 2), new Range(5, 2, 5, 3), new Range(3, 17, 3, 18)],
      [new Position(5, 3), new Range(5, 3, 5, 4), new Range(3, 9, 3, 10)],
      [new Position(5, 4), new Range(5, 4, 5, 5), new Range(1, 11, 1, 12)],
      [new Position(5, 5), new Range(5, 4, 5, 5), new Range(1, 11, 1, 12)]
    ];
    const isABracket = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {} };
    for (let i = 0, len = brackets.length; i < len; i++) {
      const [testPos, b1, b2] = brackets[i];
      assertIsBracket(model, testPos, [b1, b2]);
      isABracket[testPos.lineNumber][testPos.column] = true;
    }
    for (let i = 1, len = model.getLineCount(); i <= len; i++) {
      const line = model.getLineContent(i);
      for (let j = 1, lenJ = line.length + 1; j <= lenJ; j++) {
        if (!isABracket[i].hasOwnProperty(j)) {
          assertIsNotBracket(model, i, j);
        }
      }
    }
  });
});
suite("TextModelWithTokens 2", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("bracket matching 3", () => {
    const text = [
      "begin",
      "    loop",
      "        if then",
      "        end if;",
      "    end loop;",
      "end;",
      "",
      "begin",
      "    loop",
      "        if then",
      "        end ifa;",
      "    end loop;",
      "end;"
    ].join("\n");
    const disposables = new DisposableStore();
    const model = createTextModelWithBrackets(disposables, text, [
      ["if", "end if"],
      ["loop", "end loop"],
      ["begin", "end"]
    ]);
    assertIsNotBracket(model, 10, 9);
    assertIsBracket(model, new Position(3, 9), [new Range(3, 9, 3, 11), new Range(4, 9, 4, 15)]);
    assertIsBracket(model, new Position(4, 9), [new Range(4, 9, 4, 15), new Range(3, 9, 3, 11)]);
    assertIsBracket(model, new Position(2, 5), [new Range(2, 5, 2, 9), new Range(5, 5, 5, 13)]);
    assertIsBracket(model, new Position(5, 5), [new Range(5, 5, 5, 13), new Range(2, 5, 2, 9)]);
    assertIsBracket(model, new Position(1, 1), [new Range(1, 1, 1, 6), new Range(6, 1, 6, 4)]);
    assertIsBracket(model, new Position(6, 1), [new Range(6, 1, 6, 4), new Range(1, 1, 1, 6)]);
    disposables.dispose();
  });
  test("bracket matching 4", () => {
    const text = [
      "recordbegin",
      "  simplerecordbegin",
      "  endrecord",
      "endrecord"
    ].join("\n");
    const disposables = new DisposableStore();
    const model = createTextModelWithBrackets(disposables, text, [
      ["recordbegin", "endrecord"],
      ["simplerecordbegin", "endrecord"]
    ]);
    assertIsBracket(model, new Position(1, 1), [new Range(1, 1, 1, 12), new Range(4, 1, 4, 10)]);
    assertIsBracket(model, new Position(4, 1), [new Range(4, 1, 4, 10), new Range(1, 1, 1, 12)]);
    assertIsBracket(model, new Position(2, 3), [new Range(2, 3, 2, 20), new Range(3, 3, 3, 12)]);
    assertIsBracket(model, new Position(3, 3), [new Range(3, 3, 3, 12), new Range(2, 3, 2, 20)]);
    disposables.dispose();
  });
  test("issue #95843: Highlighting of closing braces is indicating wrong brace when cursor is behind opening brace", () => {
    const disposables = new DisposableStore();
    const instantiationService = createModelServices(disposables);
    const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
    const languageService = instantiationService.get(ILanguageService);
    const mode1 = "testMode1";
    const mode2 = "testMode2";
    const languageIdCodec = languageService.languageIdCodec;
    disposables.add(languageService.registerLanguage({ id: mode1 }));
    disposables.add(languageService.registerLanguage({ id: mode2 }));
    const encodedMode1 = languageIdCodec.encodeLanguageId(mode1);
    const encodedMode2 = languageIdCodec.encodeLanguageId(mode2);
    const otherMetadata1 = (encodedMode1 << MetadataConsts.LANGUAGEID_OFFSET | StandardTokenType.Other << MetadataConsts.TOKEN_TYPE_OFFSET | MetadataConsts.BALANCED_BRACKETS_MASK) >>> 0;
    const otherMetadata2 = (encodedMode2 << MetadataConsts.LANGUAGEID_OFFSET | StandardTokenType.Other << MetadataConsts.TOKEN_TYPE_OFFSET | MetadataConsts.BALANCED_BRACKETS_MASK) >>> 0;
    const tokenizationSupport = {
      getInitialState: () => NullState,
      tokenize: void 0,
      tokenizeEncoded: (line, hasEOL, state) => {
        switch (line) {
          case "function f() {": {
            const tokens = new Uint32Array([
              0,
              otherMetadata1,
              8,
              otherMetadata1,
              9,
              otherMetadata1,
              10,
              otherMetadata1,
              11,
              otherMetadata1,
              12,
              otherMetadata1,
              13,
              otherMetadata1
            ]);
            return new EncodedTokenizationResult(tokens, [], state);
          }
          case "  return <p>{true}</p>;": {
            const tokens = new Uint32Array([
              0,
              otherMetadata1,
              2,
              otherMetadata1,
              8,
              otherMetadata1,
              9,
              otherMetadata2,
              10,
              otherMetadata2,
              11,
              otherMetadata2,
              12,
              otherMetadata2,
              13,
              otherMetadata1,
              17,
              otherMetadata2,
              18,
              otherMetadata2,
              20,
              otherMetadata2,
              21,
              otherMetadata2,
              22,
              otherMetadata2
            ]);
            return new EncodedTokenizationResult(tokens, [], state);
          }
          case "}": {
            const tokens = new Uint32Array([
              0,
              otherMetadata1
            ]);
            return new EncodedTokenizationResult(tokens, [], state);
          }
        }
        throw new Error(`Unexpected`);
      }
    };
    disposables.add(TokenizationRegistry.register(mode1, tokenizationSupport));
    disposables.add(languageConfigurationService.register(mode1, {
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
      ]
    }));
    disposables.add(languageConfigurationService.register(mode2, {
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
      ]
    }));
    const model = disposables.add(instantiateTextModel(
      instantiationService,
      [
        "function f() {",
        "  return <p>{true}</p>;",
        "}"
      ].join("\n"),
      mode1
    ));
    model.tokenization.forceTokenization(1);
    model.tokenization.forceTokenization(2);
    model.tokenization.forceTokenization(3);
    assert.deepStrictEqual(
      model.bracketPairs.matchBracket(new Position(2, 14)),
      [new Range(2, 13, 2, 14), new Range(2, 18, 2, 19)]
    );
    disposables.dispose();
  });
  test("issue #88075: TypeScript brace matching is incorrect in `${}` strings", () => {
    const disposables = new DisposableStore();
    const instantiationService = createModelServices(disposables);
    const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
    const mode = "testMode";
    const languageIdCodec = instantiationService.get(ILanguageService).languageIdCodec;
    const encodedMode = languageIdCodec.encodeLanguageId(mode);
    const otherMetadata = (encodedMode << MetadataConsts.LANGUAGEID_OFFSET | StandardTokenType.Other << MetadataConsts.TOKEN_TYPE_OFFSET) >>> 0;
    const stringMetadata = (encodedMode << MetadataConsts.LANGUAGEID_OFFSET | StandardTokenType.String << MetadataConsts.TOKEN_TYPE_OFFSET) >>> 0;
    const tokenizationSupport = {
      getInitialState: () => NullState,
      tokenize: void 0,
      tokenizeEncoded: (line, hasEOL, state) => {
        switch (line) {
          case "function hello() {": {
            const tokens = new Uint32Array([
              0,
              otherMetadata
            ]);
            return new EncodedTokenizationResult(tokens, [], state);
          }
          case "    console.log(`${100}`);": {
            const tokens = new Uint32Array([
              0,
              otherMetadata,
              16,
              stringMetadata,
              19,
              otherMetadata,
              22,
              stringMetadata,
              24,
              otherMetadata
            ]);
            return new EncodedTokenizationResult(tokens, [], state);
          }
          case "}": {
            const tokens = new Uint32Array([
              0,
              otherMetadata
            ]);
            return new EncodedTokenizationResult(tokens, [], state);
          }
        }
        throw new Error(`Unexpected`);
      }
    };
    disposables.add(TokenizationRegistry.register(mode, tokenizationSupport));
    disposables.add(languageConfigurationService.register(mode, {
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
      ]
    }));
    const model = disposables.add(instantiateTextModel(
      instantiationService,
      [
        "function hello() {",
        "    console.log(`${100}`);",
        "}"
      ].join("\n"),
      mode
    ));
    model.tokenization.forceTokenization(1);
    model.tokenization.forceTokenization(2);
    model.tokenization.forceTokenization(3);
    assert.deepStrictEqual(model.bracketPairs.matchBracket(new Position(2, 23)), null);
    assert.deepStrictEqual(model.bracketPairs.matchBracket(new Position(2, 20)), null);
    disposables.dispose();
  });
});
suite("TextModelWithTokens regression tests", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("microsoft/monaco-editor#122: Unhandled Exception: TypeError: Unable to get property 'replace' of undefined or null reference", () => {
    function assertViewLineTokens(model2, lineNumber, forceTokenization, expected) {
      if (forceTokenization) {
        model2.tokenization.forceTokenization(lineNumber);
      }
      const _actual = model2.tokenization.getLineTokens(lineNumber).inflate();
      const actual = [];
      for (let i = 0, len = _actual.getCount(); i < len; i++) {
        actual[i] = {
          endIndex: _actual.getEndOffset(i),
          foreground: _actual.getForeground(i)
        };
      }
      const decode = (token) => {
        return {
          endIndex: token.endIndex,
          foreground: token.getForeground()
        };
      };
      assert.deepStrictEqual(actual, expected.map(decode));
    }
    let _tokenId = 10;
    const LANG_ID1 = "indicisiveMode1";
    const LANG_ID2 = "indicisiveMode2";
    const tokenizationSupport = {
      getInitialState: () => NullState,
      tokenize: void 0,
      tokenizeEncoded: (line, hasEOL, state) => {
        const myId = ++_tokenId;
        const tokens = new Uint32Array(2);
        tokens[0] = 0;
        tokens[1] = myId << MetadataConsts.FOREGROUND_OFFSET >>> 0;
        return new EncodedTokenizationResult(tokens, [], state);
      }
    };
    const registration1 = TokenizationRegistry.register(LANG_ID1, tokenizationSupport);
    const registration2 = TokenizationRegistry.register(LANG_ID2, tokenizationSupport);
    const model = createTextModel("A model with\ntwo lines");
    assertViewLineTokens(model, 1, true, [createViewLineToken(12, 1)]);
    assertViewLineTokens(model, 2, true, [createViewLineToken(9, 1)]);
    model.setLanguage(LANG_ID1);
    assertViewLineTokens(model, 1, true, [createViewLineToken(12, 11)]);
    assertViewLineTokens(model, 2, true, [createViewLineToken(9, 12)]);
    model.setLanguage(LANG_ID2);
    assertViewLineTokens(model, 1, false, [createViewLineToken(12, 1)]);
    assertViewLineTokens(model, 2, false, [createViewLineToken(9, 1)]);
    model.dispose();
    registration1.dispose();
    registration2.dispose();
    function createViewLineToken(endIndex, foreground) {
      const metadata = foreground << MetadataConsts.FOREGROUND_OFFSET >>> 0;
      return new TestLineToken(endIndex, metadata);
    }
  });
  test("microsoft/monaco-editor#133: Error: Cannot read property 'modeId' of undefined", () => {
    const disposables = new DisposableStore();
    const model = createTextModelWithBrackets(
      disposables,
      [
        "Imports System",
        "Imports System.Collections.Generic",
        "",
        "Module m1",
        "",
        "	Sub Main()",
        "	End Sub",
        "",
        "End Module"
      ].join("\n"),
      [
        ["module", "end module"],
        ["sub", "end sub"]
      ]
    );
    const actual = model.bracketPairs.matchBracket(new Position(4, 1));
    assert.deepStrictEqual(actual, [new Range(4, 1, 4, 7), new Range(9, 1, 9, 11)]);
    disposables.dispose();
  });
  test("issue #11856: Bracket matching does not work as expected if the opening brace symbol is contained in the closing brace symbol", () => {
    const disposables = new DisposableStore();
    const model = createTextModelWithBrackets(
      disposables,
      [
        'sequence "outer"',
        '     sequence "inner"',
        "     endsequence",
        "endsequence"
      ].join("\n"),
      [
        ["sequence", "endsequence"],
        ["feature", "endfeature"]
      ]
    );
    const actual = model.bracketPairs.matchBracket(new Position(3, 9));
    assert.deepStrictEqual(actual, [new Range(2, 6, 2, 14), new Range(3, 6, 3, 17)]);
    disposables.dispose();
  });
  test("issue #63822: Wrong embedded language detected for empty lines", () => {
    const disposables = new DisposableStore();
    const instantiationService = createModelServices(disposables);
    const languageService = instantiationService.get(ILanguageService);
    const outerMode = "outerMode";
    const innerMode = "innerMode";
    disposables.add(languageService.registerLanguage({ id: outerMode }));
    disposables.add(languageService.registerLanguage({ id: innerMode }));
    const languageIdCodec = instantiationService.get(ILanguageService).languageIdCodec;
    const encodedInnerMode = languageIdCodec.encodeLanguageId(innerMode);
    const tokenizationSupport = {
      getInitialState: () => NullState,
      tokenize: void 0,
      tokenizeEncoded: (line, hasEOL, state) => {
        const tokens = new Uint32Array(2);
        tokens[0] = 0;
        tokens[1] = encodedInnerMode << MetadataConsts.LANGUAGEID_OFFSET >>> 0;
        return new EncodedTokenizationResult(tokens, [], state);
      }
    };
    disposables.add(TokenizationRegistry.register(outerMode, tokenizationSupport));
    const model = disposables.add(instantiateTextModel(instantiationService, "A model with one line", outerMode));
    model.tokenization.forceTokenization(1);
    assert.strictEqual(model.getLanguageIdAtPosition(1, 1), innerMode);
    disposables.dispose();
  });
});
suite("TextModel.getLineIndentGuide", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function assertIndentGuides(lines, indentSize) {
    const languageId = "testLang";
    const disposables = new DisposableStore();
    const instantiationService = createModelServices(disposables);
    const languageService = instantiationService.get(ILanguageService);
    disposables.add(languageService.registerLanguage({ id: languageId }));
    const text = lines.map((l) => l[4]).join("\n");
    const model = disposables.add(instantiateTextModel(instantiationService, text, languageId));
    model.updateOptions({ indentSize });
    const actualIndents = model.guides.getLinesIndentGuides(1, model.getLineCount());
    const actual = [];
    for (let line = 1; line <= model.getLineCount(); line++) {
      const activeIndentGuide = model.guides.getActiveIndentGuide(line, 1, model.getLineCount());
      actual[line - 1] = [actualIndents[line - 1], activeIndentGuide.startLineNumber, activeIndentGuide.endLineNumber, activeIndentGuide.indent, model.getLineContent(line)];
    }
    assert.deepStrictEqual(actual, lines);
    disposables.dispose();
  }
  test("getLineIndentGuide one level 2", () => {
    assertIndentGuides([
      [0, 2, 4, 1, "A"],
      [1, 2, 4, 1, "  A"],
      [1, 2, 4, 1, "  A"],
      [1, 2, 4, 1, "  A"]
    ], 2);
  });
  test("getLineIndentGuide two levels", () => {
    assertIndentGuides([
      [0, 2, 5, 1, "A"],
      [1, 2, 5, 1, "  A"],
      [1, 4, 5, 2, "  A"],
      [2, 4, 5, 2, "    A"],
      [2, 4, 5, 2, "    A"]
    ], 2);
  });
  test("getLineIndentGuide three levels", () => {
    assertIndentGuides([
      [0, 2, 4, 1, "A"],
      [1, 3, 4, 2, "  A"],
      [2, 4, 4, 3, "    A"],
      [3, 4, 4, 3, "      A"],
      [0, 5, 5, 0, "A"]
    ], 2);
  });
  test("getLineIndentGuide decreasing indent", () => {
    assertIndentGuides([
      [2, 1, 1, 2, "    A"],
      [1, 1, 1, 2, "  A"],
      [0, 1, 2, 1, "A"]
    ], 2);
  });
  test("getLineIndentGuide Java", () => {
    assertIndentGuides([
      /* 1*/
      [0, 2, 9, 1, "class A {"],
      /* 2*/
      [1, 3, 4, 2, "  void foo() {"],
      /* 3*/
      [2, 3, 4, 2, "    console.log(1);"],
      /* 4*/
      [2, 3, 4, 2, "    console.log(2);"],
      /* 5*/
      [1, 3, 4, 2, "  }"],
      /* 6*/
      [1, 2, 9, 1, ""],
      /* 7*/
      [1, 8, 8, 2, "  void bar() {"],
      /* 8*/
      [2, 8, 8, 2, "    console.log(3);"],
      /* 9*/
      [1, 8, 8, 2, "  }"],
      /*10*/
      [0, 2, 9, 1, "}"],
      /*11*/
      [0, 12, 12, 1, "interface B {"],
      /*12*/
      [1, 12, 12, 1, "  void bar();"],
      /*13*/
      [0, 12, 12, 1, "}"]
    ], 2);
  });
  test("getLineIndentGuide Javadoc", () => {
    assertIndentGuides([
      [0, 2, 3, 1, "/**"],
      [1, 2, 3, 1, " * Comment"],
      [1, 2, 3, 1, " */"],
      [0, 5, 6, 1, "class A {"],
      [1, 5, 6, 1, "  void foo() {"],
      [1, 5, 6, 1, "  }"],
      [0, 5, 6, 1, "}"]
    ], 2);
  });
  test("getLineIndentGuide Whitespace", () => {
    assertIndentGuides([
      [0, 2, 7, 1, "class A {"],
      [1, 2, 7, 1, ""],
      [1, 4, 5, 2, "  void foo() {"],
      [2, 4, 5, 2, "    "],
      [2, 4, 5, 2, "    return 1;"],
      [1, 4, 5, 2, "  }"],
      [1, 2, 7, 1, "      "],
      [0, 2, 7, 1, "}"]
    ], 2);
  });
  test("getLineIndentGuide Tabs", () => {
    assertIndentGuides([
      [0, 2, 7, 1, "class A {"],
      [1, 2, 7, 1, "		"],
      [1, 4, 5, 2, "	void foo() {"],
      [2, 4, 5, 2, "	 	//hello"],
      [2, 4, 5, 2, "	    return 2;"],
      [1, 4, 5, 2, "  	}"],
      [1, 2, 7, 1, "      "],
      [0, 2, 7, 1, "}"]
    ], 4);
  });
  test("getLineIndentGuide checker.ts", () => {
    assertIndentGuides([
      /* 1*/
      [0, 1, 1, 0, '/// <reference path="binder.ts"/>'],
      /* 2*/
      [0, 2, 2, 0, ""],
      /* 3*/
      [0, 3, 3, 0, "/* @internal */"],
      /* 4*/
      [0, 5, 16, 1, "namespace ts {"],
      /* 5*/
      [1, 5, 16, 1, "    let nextSymbolId = 1;"],
      /* 6*/
      [1, 5, 16, 1, "    let nextNodeId = 1;"],
      /* 7*/
      [1, 5, 16, 1, "    let nextMergeId = 1;"],
      /* 8*/
      [1, 5, 16, 1, "    let nextFlowId = 1;"],
      /* 9*/
      [1, 5, 16, 1, ""],
      /*10*/
      [1, 11, 15, 2, "    export function getNodeId(node: Node): number {"],
      /*11*/
      [2, 12, 13, 3, "        if (!node.id) {"],
      /*12*/
      [3, 12, 13, 3, "            node.id = nextNodeId;"],
      /*13*/
      [3, 12, 13, 3, "            nextNodeId++;"],
      /*14*/
      [2, 12, 13, 3, "        }"],
      /*15*/
      [2, 11, 15, 2, "        return node.id;"],
      /*16*/
      [1, 11, 15, 2, "    }"],
      /*17*/
      [0, 5, 16, 1, "}"]
    ], 4);
  });
  test("issue #8425 - Missing indentation lines for first level indentation", () => {
    assertIndentGuides([
      [1, 2, 3, 2, "	indent1"],
      [2, 2, 3, 2, "		indent2"],
      [2, 2, 3, 2, "		indent2"],
      [1, 2, 3, 2, "	indent1"]
    ], 4);
  });
  test("issue #8952 - Indentation guide lines going through text on .yml file", () => {
    assertIndentGuides([
      [0, 2, 5, 1, "properties:"],
      [1, 3, 5, 2, "    emailAddress:"],
      [2, 3, 5, 2, "        - bla"],
      [2, 5, 5, 3, "        - length:"],
      [3, 5, 5, 3, "            max: 255"],
      [0, 6, 6, 0, "getters:"]
    ], 4);
  });
  test("issue #11892 - Indent guides look funny", () => {
    assertIndentGuides([
      [0, 2, 7, 1, "function test(base) {"],
      [1, 3, 6, 2, "	switch (base) {"],
      [2, 4, 4, 3, "		case 1:"],
      [3, 4, 4, 3, "			return 1;"],
      [2, 6, 6, 3, "		case 2:"],
      [3, 6, 6, 3, "			return 2;"],
      [1, 2, 7, 1, "	}"],
      [0, 2, 7, 1, "}"]
    ], 4);
  });
  test("issue #12398 - Problem in indent guidelines", () => {
    assertIndentGuides([
      [2, 2, 2, 3, "		.bla"],
      [3, 2, 2, 3, "			label(for)"],
      [0, 3, 3, 0, "include script"]
    ], 4);
  });
  test("issue #49173", () => {
    const model = createTextModel([
      "class A {",
      "	public m1(): void {",
      "	}",
      "	public m2(): void {",
      "	}",
      "	public m3(): void {",
      "	}",
      "	public m4(): void {",
      "	}",
      "	public m5(): void {",
      "	}",
      "}"
    ].join("\n"));
    const actual = model.guides.getActiveIndentGuide(2, 4, 9);
    assert.deepStrictEqual(actual, { startLineNumber: 2, endLineNumber: 9, indent: 1 });
    model.dispose();
  });
  test("tweaks - no active", () => {
    assertIndentGuides([
      [0, 1, 1, 0, "A"],
      [0, 2, 2, 0, "A"]
    ], 2);
  });
  test("tweaks - inside scope", () => {
    assertIndentGuides([
      [0, 2, 2, 1, "A"],
      [1, 2, 2, 1, "  A"]
    ], 2);
  });
  test("tweaks - scope start", () => {
    assertIndentGuides([
      [0, 2, 2, 1, "A"],
      [1, 2, 2, 1, "  A"],
      [0, 2, 2, 1, "A"]
    ], 2);
  });
  test("tweaks - empty line", () => {
    assertIndentGuides([
      [0, 2, 4, 1, "A"],
      [1, 2, 4, 1, "  A"],
      [1, 2, 4, 1, ""],
      [1, 2, 4, 1, "  A"],
      [0, 2, 4, 1, "A"]
    ], 2);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZWxcXHRleHRNb2RlbFdpdGhUb2tlbnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUZvdW5kQnJhY2tldCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90ZXh0TW9kZWxCcmFja2V0UGFpcnMuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJVG9rZW5pemF0aW9uU3VwcG9ydCwgVG9rZW5pemF0aW9uUmVnaXN0cnksIEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkVG9rZW5UeXBlLCBNZXRhZGF0YUNvbnN0cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IENoYXJhY3RlclBhaXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9udWxsVG9rZW5pemUuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgVGVzdExpbmVUb2tlbiB9IGZyb20gJy4uL2NvcmUvdGVzdExpbmVUb2tlbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVNb2RlbFNlcnZpY2VzLCBjcmVhdGVUZXh0TW9kZWwsIGluc3RhbnRpYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuZnVuY3Rpb24gY3JlYXRlVGV4dE1vZGVsV2l0aEJyYWNrZXRzKGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIHRleHQ6IHN0cmluZywgYnJhY2tldHM6IENoYXJhY3RlclBhaXJbXSk6IFRleHRNb2RlbCB7XG5cdGNvbnN0IGxhbmd1YWdlSWQgPSAnYnJhY2tldE1vZGUyJztcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVNb2RlbFNlcnZpY2VzKGRpc3Bvc2FibGVzKTtcblx0Y29uc3QgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblxuXHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogbGFuZ3VhZ2VJZCB9KSk7XG5cdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKGxhbmd1YWdlSWQsIHsgYnJhY2tldHMgfSkpO1xuXG5cdHJldHVybiBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsIHRleHQsIGxhbmd1YWdlSWQpKTtcbn1cblxuc3VpdGUoJ1RleHRNb2RlbFdpdGhUb2tlbnMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gdGVzdEJyYWNrZXRzKGNvbnRlbnRzOiBzdHJpbmdbXSwgYnJhY2tldHM6IENoYXJhY3RlclBhaXJbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSAndGVzdE1vZGUnO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlTW9kZWxTZXJ2aWNlcyhkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiBsYW5ndWFnZUlkIH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihsYW5ndWFnZUlkLCB7XG5cdFx0XHRicmFja2V0czogYnJhY2tldHNcblx0XHR9KSk7XG5cblxuXHRcdGZ1bmN0aW9uIHRvUmVsYXhlZEZvdW5kQnJhY2tldChhOiBJRm91bmRCcmFja2V0IHwgbnVsbCkge1xuXHRcdFx0aWYgKCFhKSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmFuZ2U6IGEucmFuZ2UudG9TdHJpbmcoKSxcblx0XHRcdFx0aW5mbzogYS5icmFja2V0SW5mbyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhcklzQnJhY2tldDogeyBbY2hhcjogc3RyaW5nXTogYm9vbGVhbiB9ID0ge307XG5cdFx0Y29uc3QgY2hhcklzT3BlbkJyYWNrZXQ6IHsgW2NoYXI6IHN0cmluZ106IGJvb2xlYW4gfSA9IHt9O1xuXHRcdGNvbnN0IG9wZW5Gb3JDaGFyOiB7IFtjaGFyOiBzdHJpbmddOiBzdHJpbmcgfSA9IHt9O1xuXHRcdGNvbnN0IGNsb3NlRm9yQ2hhcjogeyBbY2hhcjogc3RyaW5nXTogc3RyaW5nIH0gPSB7fTtcblx0XHRicmFja2V0cy5mb3JFYWNoKChiKSA9PiB7XG5cdFx0XHRjaGFySXNCcmFja2V0W2JbMF1dID0gdHJ1ZTtcblx0XHRcdGNoYXJJc0JyYWNrZXRbYlsxXV0gPSB0cnVlO1xuXG5cdFx0XHRjaGFySXNPcGVuQnJhY2tldFtiWzBdXSA9IHRydWU7XG5cdFx0XHRjaGFySXNPcGVuQnJhY2tldFtiWzFdXSA9IGZhbHNlO1xuXG5cdFx0XHRvcGVuRm9yQ2hhcltiWzBdXSA9IGJbMF07XG5cdFx0XHRjbG9zZUZvckNoYXJbYlswXV0gPSBiWzFdO1xuXG5cdFx0XHRvcGVuRm9yQ2hhcltiWzFdXSA9IGJbMF07XG5cdFx0XHRjbG9zZUZvckNoYXJbYlsxXV0gPSBiWzFdO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWRCcmFja2V0czogSUZvdW5kQnJhY2tldFtdID0gW107XG5cdFx0Zm9yIChsZXQgbGluZUluZGV4ID0gMDsgbGluZUluZGV4IDwgY29udGVudHMubGVuZ3RoOyBsaW5lSW5kZXgrKykge1xuXHRcdFx0Y29uc3QgbGluZVRleHQgPSBjb250ZW50c1tsaW5lSW5kZXhdO1xuXG5cdFx0XHRmb3IgKGxldCBjaGFySW5kZXggPSAwOyBjaGFySW5kZXggPCBsaW5lVGV4dC5sZW5ndGg7IGNoYXJJbmRleCsrKSB7XG5cdFx0XHRcdGNvbnN0IGNoID0gbGluZVRleHQuY2hhckF0KGNoYXJJbmRleCk7XG5cdFx0XHRcdGlmIChjaGFySXNCcmFja2V0W2NoXSkge1xuXHRcdFx0XHRcdGV4cGVjdGVkQnJhY2tldHMucHVzaCh7XG5cdFx0XHRcdFx0XHRicmFja2V0SW5mbzogbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5nZXRMYW5ndWFnZUNvbmZpZ3VyYXRpb24obGFuZ3VhZ2VJZCkuYnJhY2tldHNOZXcuZ2V0QnJhY2tldEluZm8oY2gpISxcblx0XHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UobGluZUluZGV4ICsgMSwgY2hhckluZGV4ICsgMSwgbGluZUluZGV4ICsgMSwgY2hhckluZGV4ICsgMilcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb250ZW50cy5qb2luKCdcXG4nKSwgbGFuZ3VhZ2VJZCkpO1xuXG5cdFx0Ly8gZmluZFByZXZCcmFja2V0XG5cdFx0e1xuXHRcdFx0bGV0IGV4cGVjdGVkQnJhY2tldEluZGV4ID0gZXhwZWN0ZWRCcmFja2V0cy5sZW5ndGggLSAxO1xuXHRcdFx0bGV0IGN1cnJlbnRFeHBlY3RlZEJyYWNrZXQgPSBleHBlY3RlZEJyYWNrZXRJbmRleCA+PSAwID8gZXhwZWN0ZWRCcmFja2V0c1tleHBlY3RlZEJyYWNrZXRJbmRleF0gOiBudWxsO1xuXHRcdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IGNvbnRlbnRzLmxlbmd0aDsgbGluZU51bWJlciA+PSAxOyBsaW5lTnVtYmVyLS0pIHtcblx0XHRcdFx0Y29uc3QgbGluZVRleHQgPSBjb250ZW50c1tsaW5lTnVtYmVyIC0gMV07XG5cblx0XHRcdFx0Zm9yIChsZXQgY29sdW1uID0gbGluZVRleHQubGVuZ3RoICsgMTsgY29sdW1uID49IDE7IGNvbHVtbi0tKSB7XG5cblx0XHRcdFx0XHRpZiAoY3VycmVudEV4cGVjdGVkQnJhY2tldCkge1xuXHRcdFx0XHRcdFx0aWYgKGxpbmVOdW1iZXIgPT09IGN1cnJlbnRFeHBlY3RlZEJyYWNrZXQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICYmIGNvbHVtbiA8IGN1cnJlbnRFeHBlY3RlZEJyYWNrZXQucmFuZ2UuZW5kQ29sdW1uKSB7XG5cdFx0XHRcdFx0XHRcdGV4cGVjdGVkQnJhY2tldEluZGV4LS07XG5cdFx0XHRcdFx0XHRcdGN1cnJlbnRFeHBlY3RlZEJyYWNrZXQgPSBleHBlY3RlZEJyYWNrZXRJbmRleCA+PSAwID8gZXhwZWN0ZWRCcmFja2V0c1tleHBlY3RlZEJyYWNrZXRJbmRleF0gOiBudWxsO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGFjdHVhbCA9IG1vZGVsLmJyYWNrZXRQYWlycy5maW5kUHJldkJyYWNrZXQoe1xuXHRcdFx0XHRcdFx0bGluZU51bWJlcjogbGluZU51bWJlcixcblx0XHRcdFx0XHRcdGNvbHVtbjogY29sdW1uXG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvUmVsYXhlZEZvdW5kQnJhY2tldChhY3R1YWwpLCB0b1JlbGF4ZWRGb3VuZEJyYWNrZXQoY3VycmVudEV4cGVjdGVkQnJhY2tldCksICdmaW5kUHJldkJyYWNrZXQgb2YgJyArIGxpbmVOdW1iZXIgKyAnLCAnICsgY29sdW1uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIGZpbmROZXh0QnJhY2tldFxuXHRcdHtcblx0XHRcdGxldCBleHBlY3RlZEJyYWNrZXRJbmRleCA9IDA7XG5cdFx0XHRsZXQgY3VycmVudEV4cGVjdGVkQnJhY2tldCA9IGV4cGVjdGVkQnJhY2tldEluZGV4IDwgZXhwZWN0ZWRCcmFja2V0cy5sZW5ndGggPyBleHBlY3RlZEJyYWNrZXRzW2V4cGVjdGVkQnJhY2tldEluZGV4XSA6IG51bGw7XG5cdFx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gMTsgbGluZU51bWJlciA8PSBjb250ZW50cy5sZW5ndGg7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0XHRjb25zdCBsaW5lVGV4dCA9IGNvbnRlbnRzW2xpbmVOdW1iZXIgLSAxXTtcblxuXHRcdFx0XHRmb3IgKGxldCBjb2x1bW4gPSAxOyBjb2x1bW4gPD0gbGluZVRleHQubGVuZ3RoICsgMTsgY29sdW1uKyspIHtcblxuXHRcdFx0XHRcdGlmIChjdXJyZW50RXhwZWN0ZWRCcmFja2V0KSB7XG5cdFx0XHRcdFx0XHRpZiAobGluZU51bWJlciA9PT0gY3VycmVudEV4cGVjdGVkQnJhY2tldC5yYW5nZS5zdGFydExpbmVOdW1iZXIgJiYgY29sdW1uID4gY3VycmVudEV4cGVjdGVkQnJhY2tldC5yYW5nZS5zdGFydENvbHVtbikge1xuXHRcdFx0XHRcdFx0XHRleHBlY3RlZEJyYWNrZXRJbmRleCsrO1xuXHRcdFx0XHRcdFx0XHRjdXJyZW50RXhwZWN0ZWRCcmFja2V0ID0gZXhwZWN0ZWRCcmFja2V0SW5kZXggPCBleHBlY3RlZEJyYWNrZXRzLmxlbmd0aCA/IGV4cGVjdGVkQnJhY2tldHNbZXhwZWN0ZWRCcmFja2V0SW5kZXhdIDogbnVsbDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBhY3R1YWwgPSBtb2RlbC5icmFja2V0UGFpcnMuZmluZE5leHRCcmFja2V0KHtcblx0XHRcdFx0XHRcdGxpbmVOdW1iZXI6IGxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRjb2x1bW46IGNvbHVtblxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b1JlbGF4ZWRGb3VuZEJyYWNrZXQoYWN0dWFsKSwgdG9SZWxheGVkRm91bmRCcmFja2V0KGN1cnJlbnRFeHBlY3RlZEJyYWNrZXQpLCAnZmluZE5leHRCcmFja2V0IG9mICcgKyBsaW5lTnVtYmVyICsgJywgJyArIGNvbHVtbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHR0ZXN0KCdicmFja2V0czEnLCAoKSA9PiB7XG5cdFx0dGVzdEJyYWNrZXRzKFtcblx0XHRcdCdpZiAoYSA9PSAzKSB7IHJldHVybiAoNyAqIChhICsgNSkpOyB9J1xuXHRcdF0sIFtcblx0XHRcdFsneycsICd9J10sXG5cdFx0XHRbJ1snLCAnXSddLFxuXHRcdFx0WycoJywgJyknXVxuXHRcdF0pO1xuXHR9KTtcbn0pO1xuXG5mdW5jdGlvbiBhc3NlcnRJc05vdEJyYWNrZXQobW9kZWw6IFRleHRNb2RlbCwgbGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlcikge1xuXHRjb25zdCBtYXRjaCA9IG1vZGVsLmJyYWNrZXRQYWlycy5tYXRjaEJyYWNrZXQobmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbikpO1xuXHRhc3NlcnQuc3RyaWN0RXF1YWwobWF0Y2gsIG51bGwsICdpcyBub3QgbWF0Y2hpbmcgYnJhY2tldHMgYXQgJyArIGxpbmVOdW1iZXIgKyAnLCAnICsgY29sdW1uKTtcbn1cblxuZnVuY3Rpb24gYXNzZXJ0SXNCcmFja2V0KG1vZGVsOiBUZXh0TW9kZWwsIHRlc3RQb3NpdGlvbjogUG9zaXRpb24sIGV4cGVjdGVkOiBbUmFuZ2UsIFJhbmdlXSk6IHZvaWQge1xuXHRleHBlY3RlZC5zb3J0KFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyk7XG5cdGNvbnN0IGFjdHVhbCA9IG1vZGVsLmJyYWNrZXRQYWlycy5tYXRjaEJyYWNrZXQodGVzdFBvc2l0aW9uKTtcblx0YWN0dWFsPy5zb3J0KFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyk7XG5cdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgJ21hdGNoZXMgYnJhY2tldHMgYXQgJyArIHRlc3RQb3NpdGlvbik7XG59XG5cbnN1aXRlKCdUZXh0TW9kZWxXaXRoVG9rZW5zIC0gYnJhY2tldCBtYXRjaGluZycsICgpID0+IHtcblxuXHRjb25zdCBsYW5ndWFnZUlkID0gJ2JyYWNrZXRNb2RlMSc7XG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRsZXQgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZU1vZGVsU2VydmljZXMoZGlzcG9zYWJsZXMpO1xuXHRcdGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGxhbmd1YWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogbGFuZ3VhZ2VJZCB9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIobGFuZ3VhZ2VJZCwge1xuXHRcdFx0YnJhY2tldHM6IFtcblx0XHRcdFx0Wyd7JywgJ30nXSxcblx0XHRcdFx0WydbJywgJ10nXSxcblx0XHRcdFx0WycoJywgJyknXSxcblx0XHRcdF1cblx0XHR9KSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2JyYWNrZXQgbWF0Y2hpbmcgMScsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID1cblx0XHRcdCcpXX17WygnICsgJ1xcbicgK1xuXHRcdFx0JyldfXtbKCc7XG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsIHRleHQsIGxhbmd1YWdlSWQpKTtcblxuXHRcdGFzc2VydElzTm90QnJhY2tldChtb2RlbCwgMSwgMSk7XG5cdFx0YXNzZXJ0SXNOb3RCcmFja2V0KG1vZGVsLCAxLCAyKTtcblx0XHRhc3NlcnRJc05vdEJyYWNrZXQobW9kZWwsIDEsIDMpO1xuXHRcdGFzc2VydElzQnJhY2tldChtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDQpLCBbbmV3IFJhbmdlKDEsIDQsIDEsIDUpLCBuZXcgUmFuZ2UoMiwgMywgMiwgNCldKTtcblx0XHRhc3NlcnRJc0JyYWNrZXQobW9kZWwsIG5ldyBQb3NpdGlvbigxLCA1KSwgW25ldyBSYW5nZSgxLCA1LCAxLCA2KSwgbmV3IFJhbmdlKDIsIDIsIDIsIDMpXSk7XG5cdFx0YXNzZXJ0SXNCcmFja2V0KG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgNiksIFtuZXcgUmFuZ2UoMSwgNiwgMSwgNyksIG5ldyBSYW5nZSgyLCAxLCAyLCAyKV0pO1xuXHRcdGFzc2VydElzQnJhY2tldChtb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDcpLCBbbmV3IFJhbmdlKDEsIDYsIDEsIDcpLCBuZXcgUmFuZ2UoMiwgMSwgMiwgMildKTtcblxuXHRcdGFzc2VydElzQnJhY2tldChtb2RlbCwgbmV3IFBvc2l0aW9uKDIsIDEpLCBbbmV3IFJhbmdlKDIsIDEsIDIsIDIpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgNyldKTtcblx0XHRhc3NlcnRJc0JyYWNrZXQobW9kZWwsIG5ldyBQb3NpdGlvbigyLCAyKSwgW25ldyBSYW5nZSgyLCAyLCAyLCAzKSwgbmV3IFJhbmdlKDEsIDUsIDEsIDYpXSk7XG5cdFx0YXNzZXJ0SXNCcmFja2V0KG1vZGVsLCBuZXcgUG9zaXRpb24oMiwgMyksIFtuZXcgUmFuZ2UoMiwgMywgMiwgNCksIG5ldyBSYW5nZSgxLCA0LCAxLCA1KV0pO1xuXHRcdGFzc2VydElzQnJhY2tldChtb2RlbCwgbmV3IFBvc2l0aW9uKDIsIDQpLCBbbmV3IFJhbmdlKDIsIDMsIDIsIDQpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNSldKTtcblx0XHRhc3NlcnRJc05vdEJyYWNrZXQobW9kZWwsIDIsIDUpO1xuXHRcdGFzc2VydElzTm90QnJhY2tldChtb2RlbCwgMiwgNik7XG5cdFx0YXNzZXJ0SXNOb3RCcmFja2V0KG1vZGVsLCAyLCA3KTtcblx0fSk7XG5cblx0dGVzdCgnYnJhY2tldCBtYXRjaGluZyAyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPVxuXHRcdFx0J3ZhciBiYXIgPSB7JyArICdcXG4nICtcblx0XHRcdCdmb286IHsnICsgJ1xcbicgK1xuXHRcdFx0J30sIGJhcjoge2hhbGxvOiBbeycgKyAnXFxuJyArXG5cdFx0XHQnfSwgeycgKyAnXFxuJyArXG5cdFx0XHQnfV19fSc7XG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsIHRleHQsIGxhbmd1YWdlSWQpKTtcblxuXHRcdGNvbnN0IGJyYWNrZXRzOiBbUG9zaXRpb24sIFJhbmdlLCBSYW5nZV1bXSA9IFtcblx0XHRcdFtuZXcgUG9zaXRpb24oMSwgMTEpLCBuZXcgUmFuZ2UoMSwgMTEsIDEsIDEyKSwgbmV3IFJhbmdlKDUsIDQsIDUsIDUpXSxcblx0XHRcdFtuZXcgUG9zaXRpb24oMSwgMTIpLCBuZXcgUmFuZ2UoMSwgMTEsIDEsIDEyKSwgbmV3IFJhbmdlKDUsIDQsIDUsIDUpXSxcblxuXHRcdFx0W25ldyBQb3NpdGlvbigyLCA2KSwgbmV3IFJhbmdlKDIsIDYsIDIsIDcpLCBuZXcgUmFuZ2UoMywgMSwgMywgMildLFxuXHRcdFx0W25ldyBQb3NpdGlvbigyLCA3KSwgbmV3IFJhbmdlKDIsIDYsIDIsIDcpLCBuZXcgUmFuZ2UoMywgMSwgMywgMildLFxuXG5cdFx0XHRbbmV3IFBvc2l0aW9uKDMsIDEpLCBuZXcgUmFuZ2UoMywgMSwgMywgMiksIG5ldyBSYW5nZSgyLCA2LCAyLCA3KV0sXG5cdFx0XHRbbmV3IFBvc2l0aW9uKDMsIDIpLCBuZXcgUmFuZ2UoMywgMSwgMywgMiksIG5ldyBSYW5nZSgyLCA2LCAyLCA3KV0sXG5cdFx0XHRbbmV3IFBvc2l0aW9uKDMsIDkpLCBuZXcgUmFuZ2UoMywgOSwgMywgMTApLCBuZXcgUmFuZ2UoNSwgMywgNSwgNCldLFxuXHRcdFx0W25ldyBQb3NpdGlvbigzLCAxMCksIG5ldyBSYW5nZSgzLCA5LCAzLCAxMCksIG5ldyBSYW5nZSg1LCAzLCA1LCA0KV0sXG5cdFx0XHRbbmV3IFBvc2l0aW9uKDMsIDE3KSwgbmV3IFJhbmdlKDMsIDE3LCAzLCAxOCksIG5ldyBSYW5nZSg1LCAyLCA1LCAzKV0sXG5cdFx0XHRbbmV3IFBvc2l0aW9uKDMsIDE4KSwgbmV3IFJhbmdlKDMsIDE4LCAzLCAxOSksIG5ldyBSYW5nZSg0LCAxLCA0LCAyKV0sXG5cdFx0XHRbbmV3IFBvc2l0aW9uKDMsIDE5KSwgbmV3IFJhbmdlKDMsIDE4LCAzLCAxOSksIG5ldyBSYW5nZSg0LCAxLCA0LCAyKV0sXG5cblx0XHRcdFtuZXcgUG9zaXRpb24oNCwgMSksIG5ldyBSYW5nZSg0LCAxLCA0LCAyKSwgbmV3IFJhbmdlKDMsIDE4LCAzLCAxOSldLFxuXHRcdFx0W25ldyBQb3NpdGlvbig0LCAyKSwgbmV3IFJhbmdlKDQsIDEsIDQsIDIpLCBuZXcgUmFuZ2UoMywgMTgsIDMsIDE5KV0sXG5cdFx0XHRbbmV3IFBvc2l0aW9uKDQsIDQpLCBuZXcgUmFuZ2UoNCwgNCwgNCwgNSksIG5ldyBSYW5nZSg1LCAxLCA1LCAyKV0sXG5cdFx0XHRbbmV3IFBvc2l0aW9uKDQsIDUpLCBuZXcgUmFuZ2UoNCwgNCwgNCwgNSksIG5ldyBSYW5nZSg1LCAxLCA1LCAyKV0sXG5cblx0XHRcdFtuZXcgUG9zaXRpb24oNSwgMSksIG5ldyBSYW5nZSg1LCAxLCA1LCAyKSwgbmV3IFJhbmdlKDQsIDQsIDQsIDUpXSxcblx0XHRcdFtuZXcgUG9zaXRpb24oNSwgMiksIG5ldyBSYW5nZSg1LCAyLCA1LCAzKSwgbmV3IFJhbmdlKDMsIDE3LCAzLCAxOCldLFxuXHRcdFx0W25ldyBQb3NpdGlvbig1LCAzKSwgbmV3IFJhbmdlKDUsIDMsIDUsIDQpLCBuZXcgUmFuZ2UoMywgOSwgMywgMTApXSxcblx0XHRcdFtuZXcgUG9zaXRpb24oNSwgNCksIG5ldyBSYW5nZSg1LCA0LCA1LCA1KSwgbmV3IFJhbmdlKDEsIDExLCAxLCAxMildLFxuXHRcdFx0W25ldyBQb3NpdGlvbig1LCA1KSwgbmV3IFJhbmdlKDUsIDQsIDUsIDUpLCBuZXcgUmFuZ2UoMSwgMTEsIDEsIDEyKV0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IGlzQUJyYWNrZXQ6IHsgW2xpbmVOdW1iZXI6IG51bWJlcl06IHsgW2NvbDogbnVtYmVyXTogYm9vbGVhbiB9IH0gPSB7IDE6IHt9LCAyOiB7fSwgMzoge30sIDQ6IHt9LCA1OiB7fSB9O1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBicmFja2V0cy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgW3Rlc3RQb3MsIGIxLCBiMl0gPSBicmFja2V0c1tpXTtcblx0XHRcdGFzc2VydElzQnJhY2tldChtb2RlbCwgdGVzdFBvcywgW2IxLCBiMl0pO1xuXHRcdFx0aXNBQnJhY2tldFt0ZXN0UG9zLmxpbmVOdW1iZXJdW3Rlc3RQb3MuY29sdW1uXSA9IHRydWU7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IDEsIGxlbiA9IG1vZGVsLmdldExpbmVDb3VudCgpOyBpIDw9IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCBsaW5lID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoaSk7XG5cdFx0XHRmb3IgKGxldCBqID0gMSwgbGVuSiA9IGxpbmUubGVuZ3RoICsgMTsgaiA8PSBsZW5KOyBqKyspIHtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdGlmICghaXNBQnJhY2tldFtpXS5oYXNPd25Qcm9wZXJ0eSg8YW55PmopKSB7XG5cdFx0XHRcdFx0YXNzZXJ0SXNOb3RCcmFja2V0KG1vZGVsLCBpLCBqKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG59KTtcblxuc3VpdGUoJ1RleHRNb2RlbFdpdGhUb2tlbnMgMicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdicmFja2V0IG1hdGNoaW5nIDMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9IFtcblx0XHRcdCdiZWdpbicsXG5cdFx0XHQnICAgIGxvb3AnLFxuXHRcdFx0JyAgICAgICAgaWYgdGhlbicsXG5cdFx0XHQnICAgICAgICBlbmQgaWY7Jyxcblx0XHRcdCcgICAgZW5kIGxvb3A7Jyxcblx0XHRcdCdlbmQ7Jyxcblx0XHRcdCcnLFxuXHRcdFx0J2JlZ2luJyxcblx0XHRcdCcgICAgbG9vcCcsXG5cdFx0XHQnICAgICAgICBpZiB0aGVuJyxcblx0XHRcdCcgICAgICAgIGVuZCBpZmE7Jyxcblx0XHRcdCcgICAgZW5kIGxvb3A7Jyxcblx0XHRcdCdlbmQ7Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWxXaXRoQnJhY2tldHMoZGlzcG9zYWJsZXMsIHRleHQsIFtcblx0XHRcdFsnaWYnLCAnZW5kIGlmJ10sXG5cdFx0XHRbJ2xvb3AnLCAnZW5kIGxvb3AnXSxcblx0XHRcdFsnYmVnaW4nLCAnZW5kJ11cblx0XHRdKTtcblxuXHRcdC8vIDxpZj4gLi4uIDxlbmQgaWZhPiBpcyBub3QgbWF0Y2hlZFxuXHRcdGFzc2VydElzTm90QnJhY2tldChtb2RlbCwgMTAsIDkpO1xuXG5cdFx0Ly8gPGlmPiAuLi4gPGVuZCBpZj4gaXMgbWF0Y2hlZFxuXHRcdGFzc2VydElzQnJhY2tldChtb2RlbCwgbmV3IFBvc2l0aW9uKDMsIDkpLCBbbmV3IFJhbmdlKDMsIDksIDMsIDExKSwgbmV3IFJhbmdlKDQsIDksIDQsIDE1KV0pO1xuXHRcdGFzc2VydElzQnJhY2tldChtb2RlbCwgbmV3IFBvc2l0aW9uKDQsIDkpLCBbbmV3IFJhbmdlKDQsIDksIDQsIDE1KSwgbmV3IFJhbmdlKDMsIDksIDMsIDExKV0pO1xuXG5cdFx0Ly8gPGxvb3A+IC4uLiA8ZW5kIGxvb3A+IGlzIG1hdGNoZWRcblx0XHRhc3NlcnRJc0JyYWNrZXQobW9kZWwsIG5ldyBQb3NpdGlvbigyLCA1KSwgW25ldyBSYW5nZSgyLCA1LCAyLCA5KSwgbmV3IFJhbmdlKDUsIDUsIDUsIDEzKV0pO1xuXHRcdGFzc2VydElzQnJhY2tldChtb2RlbCwgbmV3IFBvc2l0aW9uKDUsIDUpLCBbbmV3IFJhbmdlKDUsIDUsIDUsIDEzKSwgbmV3IFJhbmdlKDIsIDUsIDIsIDkpXSk7XG5cblx0XHQvLyA8YmVnaW4+IC4uLiA8ZW5kPiBpcyBtYXRjaGVkXG5cdFx0YXNzZXJ0SXNCcmFja2V0KG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSksIFtuZXcgUmFuZ2UoMSwgMSwgMSwgNiksIG5ldyBSYW5nZSg2LCAxLCA2LCA0KV0pO1xuXHRcdGFzc2VydElzQnJhY2tldChtb2RlbCwgbmV3IFBvc2l0aW9uKDYsIDEpLCBbbmV3IFJhbmdlKDYsIDEsIDYsIDQpLCBuZXcgUmFuZ2UoMSwgMSwgMSwgNildKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnYnJhY2tldCBtYXRjaGluZyA0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSBbXG5cdFx0XHQncmVjb3JkYmVnaW4nLFxuXHRcdFx0JyAgc2ltcGxlcmVjb3JkYmVnaW4nLFxuXHRcdFx0JyAgZW5kcmVjb3JkJyxcblx0XHRcdCdlbmRyZWNvcmQnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbFdpdGhCcmFja2V0cyhkaXNwb3NhYmxlcywgdGV4dCwgW1xuXHRcdFx0WydyZWNvcmRiZWdpbicsICdlbmRyZWNvcmQnXSxcblx0XHRcdFsnc2ltcGxlcmVjb3JkYmVnaW4nLCAnZW5kcmVjb3JkJ10sXG5cdFx0XSk7XG5cblx0XHQvLyA8cmVjb3JkYmVnaW4+IC4uLiA8ZW5kcmVjb3JkPiBpcyBtYXRjaGVkXG5cdFx0YXNzZXJ0SXNCcmFja2V0KG1vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSksIFtuZXcgUmFuZ2UoMSwgMSwgMSwgMTIpLCBuZXcgUmFuZ2UoNCwgMSwgNCwgMTApXSk7XG5cdFx0YXNzZXJ0SXNCcmFja2V0KG1vZGVsLCBuZXcgUG9zaXRpb24oNCwgMSksIFtuZXcgUmFuZ2UoNCwgMSwgNCwgMTApLCBuZXcgUmFuZ2UoMSwgMSwgMSwgMTIpXSk7XG5cblx0XHQvLyA8c2ltcGxlcmVjb3JkYmVnaW4+IC4uLiA8ZW5kcmVjb3JkPiBpcyBtYXRjaGVkXG5cdFx0YXNzZXJ0SXNCcmFja2V0KG1vZGVsLCBuZXcgUG9zaXRpb24oMiwgMyksIFtuZXcgUmFuZ2UoMiwgMywgMiwgMjApLCBuZXcgUmFuZ2UoMywgMywgMywgMTIpXSk7XG5cdFx0YXNzZXJ0SXNCcmFja2V0KG1vZGVsLCBuZXcgUG9zaXRpb24oMywgMyksIFtuZXcgUmFuZ2UoMywgMywgMywgMTIpLCBuZXcgUmFuZ2UoMiwgMywgMiwgMjApXSk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM5NTg0MzogSGlnaGxpZ2h0aW5nIG9mIGNsb3NpbmcgYnJhY2VzIGlzIGluZGljYXRpbmcgd3JvbmcgYnJhY2Ugd2hlbiBjdXJzb3IgaXMgYmVoaW5kIG9wZW5pbmcgYnJhY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVNb2RlbFNlcnZpY2VzKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdFx0Y29uc3QgbW9kZTEgPSAndGVzdE1vZGUxJztcblx0XHRjb25zdCBtb2RlMiA9ICd0ZXN0TW9kZTInO1xuXG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZENvZGVjID0gbGFuZ3VhZ2VTZXJ2aWNlLmxhbmd1YWdlSWRDb2RlYztcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiBtb2RlMSB9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6IG1vZGUyIH0pKTtcblx0XHRjb25zdCBlbmNvZGVkTW9kZTEgPSBsYW5ndWFnZUlkQ29kZWMuZW5jb2RlTGFuZ3VhZ2VJZChtb2RlMSk7XG5cdFx0Y29uc3QgZW5jb2RlZE1vZGUyID0gbGFuZ3VhZ2VJZENvZGVjLmVuY29kZUxhbmd1YWdlSWQobW9kZTIpO1xuXG5cdFx0Y29uc3Qgb3RoZXJNZXRhZGF0YTEgPSAoXG5cdFx0XHQoZW5jb2RlZE1vZGUxIDw8IE1ldGFkYXRhQ29uc3RzLkxBTkdVQUdFSURfT0ZGU0VUKVxuXHRcdFx0fCAoU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgPDwgTWV0YWRhdGFDb25zdHMuVE9LRU5fVFlQRV9PRkZTRVQpXG5cdFx0XHR8IChNZXRhZGF0YUNvbnN0cy5CQUxBTkNFRF9CUkFDS0VUU19NQVNLKVxuXHRcdCkgPj4+IDA7XG5cdFx0Y29uc3Qgb3RoZXJNZXRhZGF0YTIgPSAoXG5cdFx0XHQoZW5jb2RlZE1vZGUyIDw8IE1ldGFkYXRhQ29uc3RzLkxBTkdVQUdFSURfT0ZGU0VUKVxuXHRcdFx0fCAoU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgPDwgTWV0YWRhdGFDb25zdHMuVE9LRU5fVFlQRV9PRkZTRVQpXG5cdFx0XHR8IChNZXRhZGF0YUNvbnN0cy5CQUxBTkNFRF9CUkFDS0VUU19NQVNLKVxuXHRcdCkgPj4+IDA7XG5cblx0XHRjb25zdCB0b2tlbml6YXRpb25TdXBwb3J0OiBJVG9rZW5pemF0aW9uU3VwcG9ydCA9IHtcblx0XHRcdGdldEluaXRpYWxTdGF0ZTogKCkgPT4gTnVsbFN0YXRlLFxuXHRcdFx0dG9rZW5pemU6IHVuZGVmaW5lZCEsXG5cdFx0XHR0b2tlbml6ZUVuY29kZWQ6IChsaW5lLCBoYXNFT0wsIHN0YXRlKSA9PiB7XG5cdFx0XHRcdHN3aXRjaCAobGluZSkge1xuXHRcdFx0XHRcdGNhc2UgJ2Z1bmN0aW9uIGYoKSB7Jzoge1xuXHRcdFx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbmV3IFVpbnQzMkFycmF5KFtcblx0XHRcdFx0XHRcdFx0MCwgb3RoZXJNZXRhZGF0YTEsXG5cdFx0XHRcdFx0XHRcdDgsIG90aGVyTWV0YWRhdGExLFxuXHRcdFx0XHRcdFx0XHQ5LCBvdGhlck1ldGFkYXRhMSxcblx0XHRcdFx0XHRcdFx0MTAsIG90aGVyTWV0YWRhdGExLFxuXHRcdFx0XHRcdFx0XHQxMSwgb3RoZXJNZXRhZGF0YTEsXG5cdFx0XHRcdFx0XHRcdDEyLCBvdGhlck1ldGFkYXRhMSxcblx0XHRcdFx0XHRcdFx0MTMsIG90aGVyTWV0YWRhdGExLFxuXHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQodG9rZW5zLCBbXSwgc3RhdGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICcgIHJldHVybiA8cD57dHJ1ZX08L3A+Oyc6IHtcblx0XHRcdFx0XHRcdGNvbnN0IHRva2VucyA9IG5ldyBVaW50MzJBcnJheShbXG5cdFx0XHRcdFx0XHRcdDAsIG90aGVyTWV0YWRhdGExLFxuXHRcdFx0XHRcdFx0XHQyLCBvdGhlck1ldGFkYXRhMSxcblx0XHRcdFx0XHRcdFx0OCwgb3RoZXJNZXRhZGF0YTEsXG5cdFx0XHRcdFx0XHRcdDksIG90aGVyTWV0YWRhdGEyLFxuXHRcdFx0XHRcdFx0XHQxMCwgb3RoZXJNZXRhZGF0YTIsXG5cdFx0XHRcdFx0XHRcdDExLCBvdGhlck1ldGFkYXRhMixcblx0XHRcdFx0XHRcdFx0MTIsIG90aGVyTWV0YWRhdGEyLFxuXHRcdFx0XHRcdFx0XHQxMywgb3RoZXJNZXRhZGF0YTEsXG5cdFx0XHRcdFx0XHRcdDE3LCBvdGhlck1ldGFkYXRhMixcblx0XHRcdFx0XHRcdFx0MTgsIG90aGVyTWV0YWRhdGEyLFxuXHRcdFx0XHRcdFx0XHQyMCwgb3RoZXJNZXRhZGF0YTIsXG5cdFx0XHRcdFx0XHRcdDIxLCBvdGhlck1ldGFkYXRhMixcblx0XHRcdFx0XHRcdFx0MjIsIG90aGVyTWV0YWRhdGEyLFxuXHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmV3IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQodG9rZW5zLCBbXSwgc3RhdGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXNlICd9Jzoge1xuXHRcdFx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbmV3IFVpbnQzMkFycmF5KFtcblx0XHRcdFx0XHRcdFx0MCwgb3RoZXJNZXRhZGF0YTFcblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0KHRva2VucywgW10sIHN0YXRlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmV4cGVjdGVkYCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChUb2tlbml6YXRpb25SZWdpc3RyeS5yZWdpc3Rlcihtb2RlMSwgdG9rZW5pemF0aW9uU3VwcG9ydCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKG1vZGUxLCB7XG5cdFx0XHRicmFja2V0czogW1xuXHRcdFx0XHRbJ3snLCAnfSddLFxuXHRcdFx0XHRbJ1snLCAnXSddLFxuXHRcdFx0XHRbJygnLCAnKSddXG5cdFx0XHRdLFxuXHRcdH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3Rlcihtb2RlMiwge1xuXHRcdFx0YnJhY2tldHM6IFtcblx0XHRcdFx0Wyd7JywgJ30nXSxcblx0XHRcdFx0WydbJywgJ10nXSxcblx0XHRcdFx0WycoJywgJyknXVxuXHRcdFx0XSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRleHRNb2RlbChcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0W1xuXHRcdFx0XHQnZnVuY3Rpb24gZigpIHsnLFxuXHRcdFx0XHQnICByZXR1cm4gPHA+e3RydWV9PC9wPjsnLFxuXHRcdFx0XHQnfScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0bW9kZTFcblx0XHQpKTtcblxuXHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbigxKTtcblx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24oMik7XG5cdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKDMpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdG1vZGVsLmJyYWNrZXRQYWlycy5tYXRjaEJyYWNrZXQobmV3IFBvc2l0aW9uKDIsIDE0KSksXG5cdFx0XHRbbmV3IFJhbmdlKDIsIDEzLCAyLCAxNCksIG5ldyBSYW5nZSgyLCAxOCwgMiwgMTkpXVxuXHRcdCk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM4ODA3NTogVHlwZVNjcmlwdCBicmFjZSBtYXRjaGluZyBpcyBpbmNvcnJlY3QgaW4gYCR7fWAgc3RyaW5ncycsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZU1vZGVsU2VydmljZXMoZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IG1vZGUgPSAndGVzdE1vZGUnO1xuXG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZENvZGVjID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZVNlcnZpY2UpLmxhbmd1YWdlSWRDb2RlYztcblxuXHRcdGNvbnN0IGVuY29kZWRNb2RlID0gbGFuZ3VhZ2VJZENvZGVjLmVuY29kZUxhbmd1YWdlSWQobW9kZSk7XG5cblx0XHRjb25zdCBvdGhlck1ldGFkYXRhID0gKFxuXHRcdFx0KGVuY29kZWRNb2RlIDw8IE1ldGFkYXRhQ29uc3RzLkxBTkdVQUdFSURfT0ZGU0VUKVxuXHRcdFx0fCAoU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIgPDwgTWV0YWRhdGFDb25zdHMuVE9LRU5fVFlQRV9PRkZTRVQpXG5cdFx0KSA+Pj4gMDtcblx0XHRjb25zdCBzdHJpbmdNZXRhZGF0YSA9IChcblx0XHRcdChlbmNvZGVkTW9kZSA8PCBNZXRhZGF0YUNvbnN0cy5MQU5HVUFHRUlEX09GRlNFVClcblx0XHRcdHwgKFN0YW5kYXJkVG9rZW5UeXBlLlN0cmluZyA8PCBNZXRhZGF0YUNvbnN0cy5UT0tFTl9UWVBFX09GRlNFVClcblx0XHQpID4+PiAwO1xuXG5cdFx0Y29uc3QgdG9rZW5pemF0aW9uU3VwcG9ydDogSVRva2VuaXphdGlvblN1cHBvcnQgPSB7XG5cdFx0XHRnZXRJbml0aWFsU3RhdGU6ICgpID0+IE51bGxTdGF0ZSxcblx0XHRcdHRva2VuaXplOiB1bmRlZmluZWQhLFxuXHRcdFx0dG9rZW5pemVFbmNvZGVkOiAobGluZSwgaGFzRU9MLCBzdGF0ZSkgPT4ge1xuXHRcdFx0XHRzd2l0Y2ggKGxpbmUpIHtcblx0XHRcdFx0XHRjYXNlICdmdW5jdGlvbiBoZWxsbygpIHsnOiB7XG5cdFx0XHRcdFx0XHRjb25zdCB0b2tlbnMgPSBuZXcgVWludDMyQXJyYXkoW1xuXHRcdFx0XHRcdFx0XHQwLCBvdGhlck1ldGFkYXRhXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdHJldHVybiBuZXcgRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCh0b2tlbnMsIFtdLCBzdGF0ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJyAgICBjb25zb2xlLmxvZyhgJHsxMDB9YCk7Jzoge1xuXHRcdFx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbmV3IFVpbnQzMkFycmF5KFtcblx0XHRcdFx0XHRcdFx0MCwgb3RoZXJNZXRhZGF0YSxcblx0XHRcdFx0XHRcdFx0MTYsIHN0cmluZ01ldGFkYXRhLFxuXHRcdFx0XHRcdFx0XHQxOSwgb3RoZXJNZXRhZGF0YSxcblx0XHRcdFx0XHRcdFx0MjIsIHN0cmluZ01ldGFkYXRhLFxuXHRcdFx0XHRcdFx0XHQyNCwgb3RoZXJNZXRhZGF0YSxcblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0KHRva2VucywgW10sIHN0YXRlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSAnfSc6IHtcblx0XHRcdFx0XHRcdGNvbnN0IHRva2VucyA9IG5ldyBVaW50MzJBcnJheShbXG5cdFx0XHRcdFx0XHRcdDAsIG90aGVyTWV0YWRhdGFcblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdFx0cmV0dXJuIG5ldyBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0KHRva2VucywgW10sIHN0YXRlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmV4cGVjdGVkYCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChUb2tlbml6YXRpb25SZWdpc3RyeS5yZWdpc3Rlcihtb2RlLCB0b2tlbml6YXRpb25TdXBwb3J0KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIobW9kZSwge1xuXHRcdFx0YnJhY2tldHM6IFtcblx0XHRcdFx0Wyd7JywgJ30nXSxcblx0XHRcdFx0WydbJywgJ10nXSxcblx0XHRcdFx0WycoJywgJyknXVxuXHRcdFx0XSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRleHRNb2RlbChcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0W1xuXHRcdFx0XHQnZnVuY3Rpb24gaGVsbG8oKSB7Jyxcblx0XHRcdFx0JyAgICBjb25zb2xlLmxvZyhgJHsxMDB9YCk7Jyxcblx0XHRcdFx0J30nXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0bW9kZVxuXHRcdCkpO1xuXG5cdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKDEpO1xuXHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbigyKTtcblx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24oMyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmJyYWNrZXRQYWlycy5tYXRjaEJyYWNrZXQobmV3IFBvc2l0aW9uKDIsIDIzKSksIG51bGwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuYnJhY2tldFBhaXJzLm1hdGNoQnJhY2tldChuZXcgUG9zaXRpb24oMiwgMjApKSwgbnVsbCk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG5cblxuc3VpdGUoJ1RleHRNb2RlbFdpdGhUb2tlbnMgcmVncmVzc2lvbiB0ZXN0cycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtaWNyb3NvZnQvbW9uYWNvLWVkaXRvciMxMjI6IFVuaGFuZGxlZCBFeGNlcHRpb246IFR5cGVFcnJvcjogVW5hYmxlIHRvIGdldCBwcm9wZXJ0eSBcXCdyZXBsYWNlXFwnIG9mIHVuZGVmaW5lZCBvciBudWxsIHJlZmVyZW5jZScsICgpID0+IHtcblx0XHRmdW5jdGlvbiBhc3NlcnRWaWV3TGluZVRva2Vucyhtb2RlbDogVGV4dE1vZGVsLCBsaW5lTnVtYmVyOiBudW1iZXIsIGZvcmNlVG9rZW5pemF0aW9uOiBib29sZWFuLCBleHBlY3RlZDogVGVzdExpbmVUb2tlbltdKTogdm9pZCB7XG5cdFx0XHRpZiAoZm9yY2VUb2tlbml6YXRpb24pIHtcblx0XHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKGxpbmVOdW1iZXIpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgX2FjdHVhbCA9IG1vZGVsLnRva2VuaXphdGlvbi5nZXRMaW5lVG9rZW5zKGxpbmVOdW1iZXIpLmluZmxhdGUoKTtcblx0XHRcdGludGVyZmFjZSBJU2ltcGxlVmlld1Rva2VuIHtcblx0XHRcdFx0ZW5kSW5kZXg6IG51bWJlcjtcblx0XHRcdFx0Zm9yZWdyb3VuZDogbnVtYmVyO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWN0dWFsOiBJU2ltcGxlVmlld1Rva2VuW10gPSBbXTtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBfYWN0dWFsLmdldENvdW50KCk7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRhY3R1YWxbaV0gPSB7XG5cdFx0XHRcdFx0ZW5kSW5kZXg6IF9hY3R1YWwuZ2V0RW5kT2Zmc2V0KGkpLFxuXHRcdFx0XHRcdGZvcmVncm91bmQ6IF9hY3R1YWwuZ2V0Rm9yZWdyb3VuZChpKVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGVjb2RlID0gKHRva2VuOiBUZXN0TGluZVRva2VuKSA9PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZW5kSW5kZXg6IHRva2VuLmVuZEluZGV4LFxuXHRcdFx0XHRcdGZvcmVncm91bmQ6IHRva2VuLmdldEZvcmVncm91bmQoKVxuXHRcdFx0XHR9O1xuXHRcdFx0fTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZC5tYXAoZGVjb2RlKSk7XG5cdFx0fVxuXG5cdFx0bGV0IF90b2tlbklkID0gMTA7XG5cdFx0Y29uc3QgTEFOR19JRDEgPSAnaW5kaWNpc2l2ZU1vZGUxJztcblx0XHRjb25zdCBMQU5HX0lEMiA9ICdpbmRpY2lzaXZlTW9kZTInO1xuXG5cdFx0Y29uc3QgdG9rZW5pemF0aW9uU3VwcG9ydDogSVRva2VuaXphdGlvblN1cHBvcnQgPSB7XG5cdFx0XHRnZXRJbml0aWFsU3RhdGU6ICgpID0+IE51bGxTdGF0ZSxcblx0XHRcdHRva2VuaXplOiB1bmRlZmluZWQhLFxuXHRcdFx0dG9rZW5pemVFbmNvZGVkOiAobGluZSwgaGFzRU9MLCBzdGF0ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBteUlkID0gKytfdG9rZW5JZDtcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbmV3IFVpbnQzMkFycmF5KDIpO1xuXHRcdFx0XHR0b2tlbnNbMF0gPSAwO1xuXHRcdFx0XHR0b2tlbnNbMV0gPSAoXG5cdFx0XHRcdFx0bXlJZCA8PCBNZXRhZGF0YUNvbnN0cy5GT1JFR1JPVU5EX09GRlNFVFxuXHRcdFx0XHQpID4+PiAwO1xuXHRcdFx0XHRyZXR1cm4gbmV3IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQodG9rZW5zLCBbXSwgc3RhdGUpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCByZWdpc3RyYXRpb24xID0gVG9rZW5pemF0aW9uUmVnaXN0cnkucmVnaXN0ZXIoTEFOR19JRDEsIHRva2VuaXphdGlvblN1cHBvcnQpO1xuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbjIgPSBUb2tlbml6YXRpb25SZWdpc3RyeS5yZWdpc3RlcihMQU5HX0lEMiwgdG9rZW5pemF0aW9uU3VwcG9ydCk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnQSBtb2RlbCB3aXRoXFxudHdvIGxpbmVzJyk7XG5cblx0XHRhc3NlcnRWaWV3TGluZVRva2Vucyhtb2RlbCwgMSwgdHJ1ZSwgW2NyZWF0ZVZpZXdMaW5lVG9rZW4oMTIsIDEpXSk7XG5cdFx0YXNzZXJ0Vmlld0xpbmVUb2tlbnMobW9kZWwsIDIsIHRydWUsIFtjcmVhdGVWaWV3TGluZVRva2VuKDksIDEpXSk7XG5cblx0XHRtb2RlbC5zZXRMYW5ndWFnZShMQU5HX0lEMSk7XG5cblx0XHRhc3NlcnRWaWV3TGluZVRva2Vucyhtb2RlbCwgMSwgdHJ1ZSwgW2NyZWF0ZVZpZXdMaW5lVG9rZW4oMTIsIDExKV0pO1xuXHRcdGFzc2VydFZpZXdMaW5lVG9rZW5zKG1vZGVsLCAyLCB0cnVlLCBbY3JlYXRlVmlld0xpbmVUb2tlbig5LCAxMildKTtcblxuXHRcdG1vZGVsLnNldExhbmd1YWdlKExBTkdfSUQyKTtcblxuXHRcdGFzc2VydFZpZXdMaW5lVG9rZW5zKG1vZGVsLCAxLCBmYWxzZSwgW2NyZWF0ZVZpZXdMaW5lVG9rZW4oMTIsIDEpXSk7XG5cdFx0YXNzZXJ0Vmlld0xpbmVUb2tlbnMobW9kZWwsIDIsIGZhbHNlLCBbY3JlYXRlVmlld0xpbmVUb2tlbig5LCAxKV0pO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdHJlZ2lzdHJhdGlvbjEuZGlzcG9zZSgpO1xuXHRcdHJlZ2lzdHJhdGlvbjIuZGlzcG9zZSgpO1xuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlVmlld0xpbmVUb2tlbihlbmRJbmRleDogbnVtYmVyLCBmb3JlZ3JvdW5kOiBudW1iZXIpOiBUZXN0TGluZVRva2VuIHtcblx0XHRcdGNvbnN0IG1ldGFkYXRhID0gKFxuXHRcdFx0XHQoZm9yZWdyb3VuZCA8PCBNZXRhZGF0YUNvbnN0cy5GT1JFR1JPVU5EX09GRlNFVClcblx0XHRcdCkgPj4+IDA7XG5cdFx0XHRyZXR1cm4gbmV3IFRlc3RMaW5lVG9rZW4oZW5kSW5kZXgsIG1ldGFkYXRhKTtcblx0XHR9XG5cdH0pO1xuXG5cblx0dGVzdCgnbWljcm9zb2Z0L21vbmFjby1lZGl0b3IjMTMzOiBFcnJvcjogQ2Fubm90IHJlYWQgcHJvcGVydHkgXFwnbW9kZUlkXFwnIG9mIHVuZGVmaW5lZCcsICgpID0+IHtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsV2l0aEJyYWNrZXRzKFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRbXG5cdFx0XHRcdCdJbXBvcnRzIFN5c3RlbScsXG5cdFx0XHRcdCdJbXBvcnRzIFN5c3RlbS5Db2xsZWN0aW9ucy5HZW5lcmljJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdNb2R1bGUgbTEnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J1xcdFN1YiBNYWluKCknLFxuXHRcdFx0XHQnXFx0RW5kIFN1YicsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnRW5kIE1vZHVsZScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0W1xuXHRcdFx0XHRbJ21vZHVsZScsICdlbmQgbW9kdWxlJ10sXG5cdFx0XHRcdFsnc3ViJywgJ2VuZCBzdWInXVxuXHRcdFx0XVxuXHRcdCk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBtb2RlbC5icmFja2V0UGFpcnMubWF0Y2hCcmFja2V0KG5ldyBQb3NpdGlvbig0LCAxKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFtuZXcgUmFuZ2UoNCwgMSwgNCwgNyksIG5ldyBSYW5nZSg5LCAxLCA5LCAxMSldKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzExODU2OiBCcmFja2V0IG1hdGNoaW5nIGRvZXMgbm90IHdvcmsgYXMgZXhwZWN0ZWQgaWYgdGhlIG9wZW5pbmcgYnJhY2Ugc3ltYm9sIGlzIGNvbnRhaW5lZCBpbiB0aGUgY2xvc2luZyBicmFjZSBzeW1ib2wnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbFdpdGhCcmFja2V0cyhcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0W1xuXHRcdFx0XHQnc2VxdWVuY2UgXCJvdXRlclwiJyxcblx0XHRcdFx0JyAgICAgc2VxdWVuY2UgXCJpbm5lclwiJyxcblx0XHRcdFx0JyAgICAgZW5kc2VxdWVuY2UnLFxuXHRcdFx0XHQnZW5kc2VxdWVuY2UnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdFtcblx0XHRcdFx0WydzZXF1ZW5jZScsICdlbmRzZXF1ZW5jZSddLFxuXHRcdFx0XHRbJ2ZlYXR1cmUnLCAnZW5kZmVhdHVyZSddXG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1vZGVsLmJyYWNrZXRQYWlycy5tYXRjaEJyYWNrZXQobmV3IFBvc2l0aW9uKDMsIDkpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW25ldyBSYW5nZSgyLCA2LCAyLCAxNCksIG5ldyBSYW5nZSgzLCA2LCAzLCAxNyldKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzYzODIyOiBXcm9uZyBlbWJlZGRlZCBsYW5ndWFnZSBkZXRlY3RlZCBmb3IgZW1wdHkgbGluZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVNb2RlbFNlcnZpY2VzKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cblx0XHRjb25zdCBvdXRlck1vZGUgPSAnb3V0ZXJNb2RlJztcblx0XHRjb25zdCBpbm5lck1vZGUgPSAnaW5uZXJNb2RlJztcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiBvdXRlck1vZGUgfSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiBpbm5lck1vZGUgfSkpO1xuXG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZENvZGVjID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZVNlcnZpY2UpLmxhbmd1YWdlSWRDb2RlYztcblx0XHRjb25zdCBlbmNvZGVkSW5uZXJNb2RlID0gbGFuZ3VhZ2VJZENvZGVjLmVuY29kZUxhbmd1YWdlSWQoaW5uZXJNb2RlKTtcblxuXHRcdGNvbnN0IHRva2VuaXphdGlvblN1cHBvcnQ6IElUb2tlbml6YXRpb25TdXBwb3J0ID0ge1xuXHRcdFx0Z2V0SW5pdGlhbFN0YXRlOiAoKSA9PiBOdWxsU3RhdGUsXG5cdFx0XHR0b2tlbml6ZTogdW5kZWZpbmVkISxcblx0XHRcdHRva2VuaXplRW5jb2RlZDogKGxpbmUsIGhhc0VPTCwgc3RhdGUpID0+IHtcblx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbmV3IFVpbnQzMkFycmF5KDIpO1xuXHRcdFx0XHR0b2tlbnNbMF0gPSAwO1xuXHRcdFx0XHR0b2tlbnNbMV0gPSAoXG5cdFx0XHRcdFx0ZW5jb2RlZElubmVyTW9kZSA8PCBNZXRhZGF0YUNvbnN0cy5MQU5HVUFHRUlEX09GRlNFVFxuXHRcdFx0XHQpID4+PiAwO1xuXHRcdFx0XHRyZXR1cm4gbmV3IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQodG9rZW5zLCBbXSwgc3RhdGUpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoVG9rZW5pemF0aW9uUmVnaXN0cnkucmVnaXN0ZXIob3V0ZXJNb2RlLCB0b2tlbml6YXRpb25TdXBwb3J0KSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgJ0EgbW9kZWwgd2l0aCBvbmUgbGluZScsIG91dGVyTW9kZSkpO1xuXG5cdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMYW5ndWFnZUlkQXRQb3NpdGlvbigxLCAxKSwgaW5uZXJNb2RlKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1RleHRNb2RlbC5nZXRMaW5lSW5kZW50R3VpZGUnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gYXNzZXJ0SW5kZW50R3VpZGVzKGxpbmVzOiBbbnVtYmVyLCBudW1iZXIsIG51bWJlciwgbnVtYmVyLCBzdHJpbmddW10sIGluZGVudFNpemU6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSAndGVzdExhbmcnO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlTW9kZWxTZXJ2aWNlcyhkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZVNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiBsYW5ndWFnZUlkIH0pKTtcblxuXHRcdGNvbnN0IHRleHQgPSBsaW5lcy5tYXAobCA9PiBsWzRdKS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0ZVRleHRNb2RlbChpbnN0YW50aWF0aW9uU2VydmljZSwgdGV4dCwgbGFuZ3VhZ2VJZCkpO1xuXHRcdG1vZGVsLnVwZGF0ZU9wdGlvbnMoeyBpbmRlbnRTaXplOiBpbmRlbnRTaXplIH0pO1xuXG5cdFx0Y29uc3QgYWN0dWFsSW5kZW50cyA9IG1vZGVsLmd1aWRlcy5nZXRMaW5lc0luZGVudEd1aWRlcygxLCBtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cblx0XHRjb25zdCBhY3R1YWw6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyLCBudW1iZXIsIHN0cmluZ11bXSA9IFtdO1xuXHRcdGZvciAobGV0IGxpbmUgPSAxOyBsaW5lIDw9IG1vZGVsLmdldExpbmVDb3VudCgpOyBsaW5lKyspIHtcblx0XHRcdGNvbnN0IGFjdGl2ZUluZGVudEd1aWRlID0gbW9kZWwuZ3VpZGVzLmdldEFjdGl2ZUluZGVudEd1aWRlKGxpbmUsIDEsIG1vZGVsLmdldExpbmVDb3VudCgpKTtcblx0XHRcdGFjdHVhbFtsaW5lIC0gMV0gPSBbYWN0dWFsSW5kZW50c1tsaW5lIC0gMV0sIGFjdGl2ZUluZGVudEd1aWRlLnN0YXJ0TGluZU51bWJlciwgYWN0aXZlSW5kZW50R3VpZGUuZW5kTGluZU51bWJlciwgYWN0aXZlSW5kZW50R3VpZGUuaW5kZW50LCBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lKV07XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGxpbmVzKTtcblxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHRlc3QoJ2dldExpbmVJbmRlbnRHdWlkZSBvbmUgbGV2ZWwgMicsICgpID0+IHtcblx0XHRhc3NlcnRJbmRlbnRHdWlkZXMoW1xuXHRcdFx0WzAsIDIsIDQsIDEsICdBJ10sXG5cdFx0XHRbMSwgMiwgNCwgMSwgJyAgQSddLFxuXHRcdFx0WzEsIDIsIDQsIDEsICcgIEEnXSxcblx0XHRcdFsxLCAyLCA0LCAxLCAnICBBJ10sXG5cdFx0XSwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldExpbmVJbmRlbnRHdWlkZSB0d28gbGV2ZWxzJywgKCkgPT4ge1xuXHRcdGFzc2VydEluZGVudEd1aWRlcyhbXG5cdFx0XHRbMCwgMiwgNSwgMSwgJ0EnXSxcblx0XHRcdFsxLCAyLCA1LCAxLCAnICBBJ10sXG5cdFx0XHRbMSwgNCwgNSwgMiwgJyAgQSddLFxuXHRcdFx0WzIsIDQsIDUsIDIsICcgICAgQSddLFxuXHRcdFx0WzIsIDQsIDUsIDIsICcgICAgQSddLFxuXHRcdF0sIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRMaW5lSW5kZW50R3VpZGUgdGhyZWUgbGV2ZWxzJywgKCkgPT4ge1xuXHRcdGFzc2VydEluZGVudEd1aWRlcyhbXG5cdFx0XHRbMCwgMiwgNCwgMSwgJ0EnXSxcblx0XHRcdFsxLCAzLCA0LCAyLCAnICBBJ10sXG5cdFx0XHRbMiwgNCwgNCwgMywgJyAgICBBJ10sXG5cdFx0XHRbMywgNCwgNCwgMywgJyAgICAgIEEnXSxcblx0XHRcdFswLCA1LCA1LCAwLCAnQSddLFxuXHRcdF0sIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRMaW5lSW5kZW50R3VpZGUgZGVjcmVhc2luZyBpbmRlbnQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0SW5kZW50R3VpZGVzKFtcblx0XHRcdFsyLCAxLCAxLCAyLCAnICAgIEEnXSxcblx0XHRcdFsxLCAxLCAxLCAyLCAnICBBJ10sXG5cdFx0XHRbMCwgMSwgMiwgMSwgJ0EnXSxcblx0XHRdLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0TGluZUluZGVudEd1aWRlIEphdmEnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0SW5kZW50R3VpZGVzKFtcblx0XHRcdC8qIDEqL1swLCAyLCA5LCAxLCAnY2xhc3MgQSB7J10sXG5cdFx0XHQvKiAyKi9bMSwgMywgNCwgMiwgJyAgdm9pZCBmb28oKSB7J10sXG5cdFx0XHQvKiAzKi9bMiwgMywgNCwgMiwgJyAgICBjb25zb2xlLmxvZygxKTsnXSxcblx0XHRcdC8qIDQqL1syLCAzLCA0LCAyLCAnICAgIGNvbnNvbGUubG9nKDIpOyddLFxuXHRcdFx0LyogNSovWzEsIDMsIDQsIDIsICcgIH0nXSxcblx0XHRcdC8qIDYqL1sxLCAyLCA5LCAxLCAnJ10sXG5cdFx0XHQvKiA3Ki9bMSwgOCwgOCwgMiwgJyAgdm9pZCBiYXIoKSB7J10sXG5cdFx0XHQvKiA4Ki9bMiwgOCwgOCwgMiwgJyAgICBjb25zb2xlLmxvZygzKTsnXSxcblx0XHRcdC8qIDkqL1sxLCA4LCA4LCAyLCAnICB9J10sXG5cdFx0XHQvKjEwKi9bMCwgMiwgOSwgMSwgJ30nXSxcblx0XHRcdC8qMTEqL1swLCAxMiwgMTIsIDEsICdpbnRlcmZhY2UgQiB7J10sXG5cdFx0XHQvKjEyKi9bMSwgMTIsIDEyLCAxLCAnICB2b2lkIGJhcigpOyddLFxuXHRcdFx0LyoxMyovWzAsIDEyLCAxMiwgMSwgJ30nXSxcblx0XHRdLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0TGluZUluZGVudEd1aWRlIEphdmFkb2MnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0SW5kZW50R3VpZGVzKFtcblx0XHRcdFswLCAyLCAzLCAxLCAnLyoqJ10sXG5cdFx0XHRbMSwgMiwgMywgMSwgJyAqIENvbW1lbnQnXSxcblx0XHRcdFsxLCAyLCAzLCAxLCAnICovJ10sXG5cdFx0XHRbMCwgNSwgNiwgMSwgJ2NsYXNzIEEgeyddLFxuXHRcdFx0WzEsIDUsIDYsIDEsICcgIHZvaWQgZm9vKCkgeyddLFxuXHRcdFx0WzEsIDUsIDYsIDEsICcgIH0nXSxcblx0XHRcdFswLCA1LCA2LCAxLCAnfSddLFxuXHRcdF0sIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRMaW5lSW5kZW50R3VpZGUgV2hpdGVzcGFjZScsICgpID0+IHtcblx0XHRhc3NlcnRJbmRlbnRHdWlkZXMoW1xuXHRcdFx0WzAsIDIsIDcsIDEsICdjbGFzcyBBIHsnXSxcblx0XHRcdFsxLCAyLCA3LCAxLCAnJ10sXG5cdFx0XHRbMSwgNCwgNSwgMiwgJyAgdm9pZCBmb28oKSB7J10sXG5cdFx0XHRbMiwgNCwgNSwgMiwgJyAgICAnXSxcblx0XHRcdFsyLCA0LCA1LCAyLCAnICAgIHJldHVybiAxOyddLFxuXHRcdFx0WzEsIDQsIDUsIDIsICcgIH0nXSxcblx0XHRcdFsxLCAyLCA3LCAxLCAnICAgICAgJ10sXG5cdFx0XHRbMCwgMiwgNywgMSwgJ30nXVxuXHRcdF0sIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRMaW5lSW5kZW50R3VpZGUgVGFicycsICgpID0+IHtcblx0XHRhc3NlcnRJbmRlbnRHdWlkZXMoW1xuXHRcdFx0WzAsIDIsIDcsIDEsICdjbGFzcyBBIHsnXSxcblx0XHRcdFsxLCAyLCA3LCAxLCAnXFx0XFx0J10sXG5cdFx0XHRbMSwgNCwgNSwgMiwgJ1xcdHZvaWQgZm9vKCkgeyddLFxuXHRcdFx0WzIsIDQsIDUsIDIsICdcXHQgXFx0Ly9oZWxsbyddLFxuXHRcdFx0WzIsIDQsIDUsIDIsICdcXHQgICAgcmV0dXJuIDI7J10sXG5cdFx0XHRbMSwgNCwgNSwgMiwgJyAgXFx0fSddLFxuXHRcdFx0WzEsIDIsIDcsIDEsICcgICAgICAnXSxcblx0XHRcdFswLCAyLCA3LCAxLCAnfSddXG5cdFx0XSwgNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldExpbmVJbmRlbnRHdWlkZSBjaGVja2VyLnRzJywgKCkgPT4ge1xuXHRcdGFzc2VydEluZGVudEd1aWRlcyhbXG5cdFx0XHQvKiAxKi9bMCwgMSwgMSwgMCwgJy8vLyA8cmVmZXJlbmNlIHBhdGg9XCJiaW5kZXIudHNcIi8+J10sXG5cdFx0XHQvKiAyKi9bMCwgMiwgMiwgMCwgJyddLFxuXHRcdFx0LyogMyovWzAsIDMsIDMsIDAsICcvKiBAaW50ZXJuYWwgKi8nXSxcblx0XHRcdC8qIDQqL1swLCA1LCAxNiwgMSwgJ25hbWVzcGFjZSB0cyB7J10sXG5cdFx0XHQvKiA1Ki9bMSwgNSwgMTYsIDEsICcgICAgbGV0IG5leHRTeW1ib2xJZCA9IDE7J10sXG5cdFx0XHQvKiA2Ki9bMSwgNSwgMTYsIDEsICcgICAgbGV0IG5leHROb2RlSWQgPSAxOyddLFxuXHRcdFx0LyogNyovWzEsIDUsIDE2LCAxLCAnICAgIGxldCBuZXh0TWVyZ2VJZCA9IDE7J10sXG5cdFx0XHQvKiA4Ki9bMSwgNSwgMTYsIDEsICcgICAgbGV0IG5leHRGbG93SWQgPSAxOyddLFxuXHRcdFx0LyogOSovWzEsIDUsIDE2LCAxLCAnJ10sXG5cdFx0XHQvKjEwKi9bMSwgMTEsIDE1LCAyLCAnICAgIGV4cG9ydCBmdW5jdGlvbiBnZXROb2RlSWQobm9kZTogTm9kZSk6IG51bWJlciB7J10sXG5cdFx0XHQvKjExKi9bMiwgMTIsIDEzLCAzLCAnICAgICAgICBpZiAoIW5vZGUuaWQpIHsnXSxcblx0XHRcdC8qMTIqL1szLCAxMiwgMTMsIDMsICcgICAgICAgICAgICBub2RlLmlkID0gbmV4dE5vZGVJZDsnXSxcblx0XHRcdC8qMTMqL1szLCAxMiwgMTMsIDMsICcgICAgICAgICAgICBuZXh0Tm9kZUlkKys7J10sXG5cdFx0XHQvKjE0Ki9bMiwgMTIsIDEzLCAzLCAnICAgICAgICB9J10sXG5cdFx0XHQvKjE1Ki9bMiwgMTEsIDE1LCAyLCAnICAgICAgICByZXR1cm4gbm9kZS5pZDsnXSxcblx0XHRcdC8qMTYqL1sxLCAxMSwgMTUsIDIsICcgICAgfSddLFxuXHRcdFx0LyoxNyovWzAsIDUsIDE2LCAxLCAnfSddXG5cdFx0XSwgNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM4NDI1IC0gTWlzc2luZyBpbmRlbnRhdGlvbiBsaW5lcyBmb3IgZmlyc3QgbGV2ZWwgaW5kZW50YXRpb24nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0SW5kZW50R3VpZGVzKFtcblx0XHRcdFsxLCAyLCAzLCAyLCAnXFx0aW5kZW50MSddLFxuXHRcdFx0WzIsIDIsIDMsIDIsICdcXHRcXHRpbmRlbnQyJ10sXG5cdFx0XHRbMiwgMiwgMywgMiwgJ1xcdFxcdGluZGVudDInXSxcblx0XHRcdFsxLCAyLCAzLCAyLCAnXFx0aW5kZW50MSddXG5cdFx0XSwgNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM4OTUyIC0gSW5kZW50YXRpb24gZ3VpZGUgbGluZXMgZ29pbmcgdGhyb3VnaCB0ZXh0IG9uIC55bWwgZmlsZScsICgpID0+IHtcblx0XHRhc3NlcnRJbmRlbnRHdWlkZXMoW1xuXHRcdFx0WzAsIDIsIDUsIDEsICdwcm9wZXJ0aWVzOiddLFxuXHRcdFx0WzEsIDMsIDUsIDIsICcgICAgZW1haWxBZGRyZXNzOiddLFxuXHRcdFx0WzIsIDMsIDUsIDIsICcgICAgICAgIC0gYmxhJ10sXG5cdFx0XHRbMiwgNSwgNSwgMywgJyAgICAgICAgLSBsZW5ndGg6J10sXG5cdFx0XHRbMywgNSwgNSwgMywgJyAgICAgICAgICAgIG1heDogMjU1J10sXG5cdFx0XHRbMCwgNiwgNiwgMCwgJ2dldHRlcnM6J11cblx0XHRdLCA0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzExODkyIC0gSW5kZW50IGd1aWRlcyBsb29rIGZ1bm55JywgKCkgPT4ge1xuXHRcdGFzc2VydEluZGVudEd1aWRlcyhbXG5cdFx0XHRbMCwgMiwgNywgMSwgJ2Z1bmN0aW9uIHRlc3QoYmFzZSkgeyddLFxuXHRcdFx0WzEsIDMsIDYsIDIsICdcXHRzd2l0Y2ggKGJhc2UpIHsnXSxcblx0XHRcdFsyLCA0LCA0LCAzLCAnXFx0XFx0Y2FzZSAxOiddLFxuXHRcdFx0WzMsIDQsIDQsIDMsICdcXHRcXHRcXHRyZXR1cm4gMTsnXSxcblx0XHRcdFsyLCA2LCA2LCAzLCAnXFx0XFx0Y2FzZSAyOiddLFxuXHRcdFx0WzMsIDYsIDYsIDMsICdcXHRcXHRcXHRyZXR1cm4gMjsnXSxcblx0XHRcdFsxLCAyLCA3LCAxLCAnXFx0fSddLFxuXHRcdFx0WzAsIDIsIDcsIDEsICd9J11cblx0XHRdLCA0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEyMzk4IC0gUHJvYmxlbSBpbiBpbmRlbnQgZ3VpZGVsaW5lcycsICgpID0+IHtcblx0XHRhc3NlcnRJbmRlbnRHdWlkZXMoW1xuXHRcdFx0WzIsIDIsIDIsIDMsICdcXHRcXHQuYmxhJ10sXG5cdFx0XHRbMywgMiwgMiwgMywgJ1xcdFxcdFxcdGxhYmVsKGZvciknXSxcblx0XHRcdFswLCAzLCAzLCAwLCAnaW5jbHVkZSBzY3JpcHQnXVxuXHRcdF0sIDQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDkxNzMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0J2NsYXNzIEEgeycsXG5cdFx0XHQnXHRwdWJsaWMgbTEoKTogdm9pZCB7Jyxcblx0XHRcdCdcdH0nLFxuXHRcdFx0J1x0cHVibGljIG0yKCk6IHZvaWQgeycsXG5cdFx0XHQnXHR9Jyxcblx0XHRcdCdcdHB1YmxpYyBtMygpOiB2b2lkIHsnLFxuXHRcdFx0J1x0fScsXG5cdFx0XHQnXHRwdWJsaWMgbTQoKTogdm9pZCB7Jyxcblx0XHRcdCdcdH0nLFxuXHRcdFx0J1x0cHVibGljIG01KCk6IHZvaWQgeycsXG5cdFx0XHQnXHR9Jyxcblx0XHRcdCd9Jyxcblx0XHRdLmpvaW4oJ1xcbicpKTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IG1vZGVsLmd1aWRlcy5nZXRBY3RpdmVJbmRlbnRHdWlkZSgyLCA0LCA5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgeyBzdGFydExpbmVOdW1iZXI6IDIsIGVuZExpbmVOdW1iZXI6IDksIGluZGVudDogMSB9KTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R3ZWFrcyAtIG5vIGFjdGl2ZScsICgpID0+IHtcblx0XHRhc3NlcnRJbmRlbnRHdWlkZXMoW1xuXHRcdFx0WzAsIDEsIDEsIDAsICdBJ10sXG5cdFx0XHRbMCwgMiwgMiwgMCwgJ0EnXVxuXHRcdF0sIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCd0d2Vha3MgLSBpbnNpZGUgc2NvcGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0SW5kZW50R3VpZGVzKFtcblx0XHRcdFswLCAyLCAyLCAxLCAnQSddLFxuXHRcdFx0WzEsIDIsIDIsIDEsICcgIEEnXVxuXHRcdF0sIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCd0d2Vha3MgLSBzY29wZSBzdGFydCcsICgpID0+IHtcblx0XHRhc3NlcnRJbmRlbnRHdWlkZXMoW1xuXHRcdFx0WzAsIDIsIDIsIDEsICdBJ10sXG5cdFx0XHRbMSwgMiwgMiwgMSwgJyAgQSddLFxuXHRcdFx0WzAsIDIsIDIsIDEsICdBJ11cblx0XHRdLCAyKTtcblx0fSk7XG5cblx0dGVzdCgndHdlYWtzIC0gZW1wdHkgbGluZScsICgpID0+IHtcblx0XHRhc3NlcnRJbmRlbnRHdWlkZXMoW1xuXHRcdFx0WzAsIDIsIDQsIDEsICdBJ10sXG5cdFx0XHRbMSwgMiwgNCwgMSwgJyAgQSddLFxuXHRcdFx0WzEsIDIsIDQsIDEsICcnXSxcblx0XHRcdFsxLCAyLCA0LCAxLCAnICBBJ10sXG5cdFx0XHRbMCwgMiwgNCwgMSwgJ0EnXVxuXHRcdF0sIDIpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUd0QixTQUErQixzQkFBc0IsaUNBQWlDO0FBQ3RGLFNBQVMsbUJBQW1CLHNCQUFzQjtBQUVsRCxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHFCQUFxQixpQkFBaUIsNEJBQTRCO0FBRTNFLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsNEJBQTRCLGFBQThCLE1BQWMsVUFBc0M7QUFDdEgsUUFBTSxhQUFhO0FBQ25CLFFBQU0sdUJBQXVCLG9CQUFvQixXQUFXO0FBQzVELFFBQU0sK0JBQStCLHFCQUFxQixJQUFJLDZCQUE2QjtBQUMzRixRQUFNLGtCQUFrQixxQkFBcUIsSUFBSSxnQkFBZ0I7QUFFakUsY0FBWSxJQUFJLGdCQUFnQixpQkFBaUIsRUFBRSxJQUFJLFdBQVcsQ0FBQyxDQUFDO0FBQ3BFLGNBQVksSUFBSSw2QkFBNkIsU0FBUyxZQUFZLEVBQUUsU0FBUyxDQUFDLENBQUM7QUFFL0UsU0FBTyxZQUFZLElBQUkscUJBQXFCLHNCQUFzQixNQUFNLFVBQVUsQ0FBQztBQUNwRjtBQUVBLE1BQU0sdUJBQXVCLE1BQU07QUFFbEMsMENBQXdDO0FBRXhDLFdBQVMsYUFBYSxVQUFv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LENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDekYsb0JBQWdCLE9BQU8sSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDekYsb0JBQWdCLE9BQU8sSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDekYsb0JBQWdCLE9BQU8sSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFFekYsb0JBQWdCLE9BQU8sSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDekYsb0JBQWdCLE9BQU8sSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDekYsb0JBQWdCLE9BQU8sSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDekYsb0JBQWdCLE9BQU8sSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDekYsdUJBQW1CLE9BQU8sR0FBRyxDQUFDO0FBQzlCLHVCQUFtQixPQUFPLEdBQUcsQ0FBQztBQUM5Qix1QkFBbUIsT0FBTyxHQUFHLENBQUM7QUFBQSxFQUMvQixDQUFDO0FBRUQsT0FBSyxzQkFBc0IsTUFBTTtBQUNoQyxVQUFNLE9BQ0w7QUFLRCxVQUFNLFFBQVEsWUFBWSxJQUFJLHFCQUFxQixzQkFBc0IsTUFBTSxVQUFVLENBQUM7QUFFMUYsVUFBTSxXQUF1QztBQUFBLE1BQzVDLENBQUMsSUFBSSxTQUFTLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ3BFLENBQUMsSUFBSSxTQUFTLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BRXBFLENBQUMsSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ2pFLENBQUMsSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BRWpFLENBQUMsSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ2pFLENBQUMsSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ2pFLENBQUMsSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ2xFLENBQUMsSUFBSSxTQUFTLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ25FLENBQUMsSUFBSSxTQUFTLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ3BFLENBQUMsSUFBSSxTQUFTLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ3BFLENBQUMsSUFBSSxTQUFTLEdBQUcsRUFBRSxHQUFHLElBQUksTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BRXBFLENBQUMsSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztBQUFBLE1BQ25FLENBQUMsSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztBQUFBLE1BQ25FLENBQUMsSUFBSSxTQUFTLEdBQUcsQ0FBQyxHQUFHLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ2pFLENBQUMsSUFBSSxTQUFT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
