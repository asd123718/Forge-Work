import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { FontStyle, MetadataConsts, TokenMetadata } from "../../../common/encodedTokenAttributes.js";
import { ILanguageConfigurationService, LanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { LanguageIdCodec } from "../../../common/services/languagesRegistry.js";
import { LineTokens } from "../../../common/tokens/lineTokens.js";
import { SparseMultilineTokens } from "../../../common/tokens/sparseMultilineTokens.js";
import { SparseTokensStore } from "../../../common/tokens/sparseTokensStore.js";
import { createModelServices, createTextModel, instantiateTextModel } from "../testTextModel.js";
suite("TokensStore", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const SEMANTIC_COLOR = 5;
  function parseTokensState(state) {
    const text = [];
    const tokens = [];
    let baseLine = 1;
    for (let i = 0; i < state.length; i++) {
      const line = state[i];
      let startOffset = 0;
      let lineText = "";
      while (true) {
        const firstPipeOffset = line.indexOf("|", startOffset);
        if (firstPipeOffset === -1) {
          break;
        }
        const secondPipeOffset = line.indexOf("|", firstPipeOffset + 1);
        if (secondPipeOffset === -1) {
          break;
        }
        if (firstPipeOffset + 1 === secondPipeOffset) {
          lineText += line.substring(startOffset, secondPipeOffset + 1);
          startOffset = secondPipeOffset + 1;
          continue;
        }
        lineText += line.substring(startOffset, firstPipeOffset);
        const tokenStartCharacter = lineText.length;
        const tokenLength = secondPipeOffset - firstPipeOffset - 1;
        const metadata = SEMANTIC_COLOR << MetadataConsts.FOREGROUND_OFFSET | MetadataConsts.SEMANTIC_USE_FOREGROUND;
        if (tokens.length === 0) {
          baseLine = i + 1;
        }
        tokens.push(i + 1 - baseLine, tokenStartCharacter, tokenStartCharacter + tokenLength, metadata);
        lineText += line.substr(firstPipeOffset + 1, tokenLength);
        startOffset = secondPipeOffset + 1;
      }
      lineText += line.substring(startOffset);
      text.push(lineText);
    }
    return {
      text: text.join("\n"),
      tokens: SparseMultilineTokens.create(baseLine, new Uint32Array(tokens))
    };
  }
  function extractState(model) {
    const result = [];
    for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
      const lineTokens = model.tokenization.getLineTokens(lineNumber);
      const lineContent = model.getLineContent(lineNumber);
      let lineText = "";
      for (let i = 0; i < lineTokens.getCount(); i++) {
        const tokenStartCharacter = lineTokens.getStartOffset(i);
        const tokenEndCharacter = lineTokens.getEndOffset(i);
        const metadata = lineTokens.getMetadata(i);
        const color = TokenMetadata.getForeground(metadata);
        const tokenText = lineContent.substring(tokenStartCharacter, tokenEndCharacter);
        if (color === SEMANTIC_COLOR) {
          lineText += `|${tokenText}|`;
        } else {
          lineText += tokenText;
        }
      }
      result.push(lineText);
    }
    return result;
  }
  function testTokensAdjustment(rawInitialState, edits, rawFinalState) {
    const initialState = parseTokensState(rawInitialState);
    const model = createTextModel(initialState.text);
    model.tokenization.setSemanticTokens([initialState.tokens], true);
    model.applyEdits(edits);
    const actualState = extractState(model);
    assert.deepStrictEqual(actualState, rawFinalState);
    model.dispose();
  }
  test("issue #86303 - color shifting between different tokens", () => {
    testTokensAdjustment(
      [
        `import { |URI| } from 'vs/base/common/uri';`,
        `const foo = |URI|.parse('hey');`
      ],
      [
        { range: new Range(2, 9, 2, 10), text: "" }
      ],
      [
        `import { |URI| } from 'vs/base/common/uri';`,
        `const fo = |URI|.parse('hey');`
      ]
    );
  });
  test("deleting a newline", () => {
    testTokensAdjustment(
      [
        `import { |URI| } from 'vs/base/common/uri';`,
        `const foo = |URI|.parse('hey');`
      ],
      [
        { range: new Range(1, 42, 2, 1), text: "" }
      ],
      [
        `import { |URI| } from 'vs/base/common/uri';const foo = |URI|.parse('hey');`
      ]
    );
  });
  test("inserting a newline", () => {
    testTokensAdjustment(
      [
        `import { |URI| } from 'vs/base/common/uri';const foo = |URI|.parse('hey');`
      ],
      [
        { range: new Range(1, 42, 1, 42), text: "\n" }
      ],
      [
        `import { |URI| } from 'vs/base/common/uri';`,
        `const foo = |URI|.parse('hey');`
      ]
    );
  });
  test("deleting a newline 2", () => {
    testTokensAdjustment(
      [
        `import { `,
        `    |URI| } from 'vs/base/common/uri';const foo = |URI|.parse('hey');`
      ],
      [
        { range: new Range(1, 10, 2, 5), text: "" }
      ],
      [
        `import { |URI| } from 'vs/base/common/uri';const foo = |URI|.parse('hey');`
      ]
    );
  });
  test("issue #179268: a complex edit", () => {
    testTokensAdjustment(
      [
        `|export| |'interior_material_selector.dart'|;`,
        `|export| |'mileage_selector.dart'|;`,
        `|export| |'owners_selector.dart'|;`,
        `|export| |'price_selector.dart'|;`,
        `|export| |'seat_count_selector.dart'|;`,
        `|export| |'year_selector.dart'|;`,
        `|export| |'winter_options_selector.dart'|;|export| |'camera_selector.dart'|;`
      ],
      [
        { range: new Range(1, 9, 1, 9), text: `camera_selector.dart';
export '` },
        { range: new Range(6, 9, 7, 9), text: `` },
        { range: new Range(7, 39, 7, 39), text: `
` },
        { range: new Range(7, 47, 7, 48), text: `ye` },
        { range: new Range(7, 49, 7, 51), text: `` },
        { range: new Range(7, 52, 7, 53), text: `` }
      ],
      [
        `|export| |'|camera_selector.dart';`,
        `export 'interior_material_selector.dart';`,
        `|export| |'mileage_selector.dart'|;`,
        `|export| |'owners_selector.dart'|;`,
        `|export| |'price_selector.dart'|;`,
        `|export| |'seat_count_selector.dart'|;`,
        `|export| |'||winter_options_selector.dart'|;`,
        `|export| |'year_selector.dart'|;`
      ]
    );
  });
  test("issue #91936: Semantic token color highlighting fails on line with selected text", () => {
    const model = createTextModel("                    else if ($s = 08) then '\\b'");
    model.tokenization.setSemanticTokens([
      SparseMultilineTokens.create(1, new Uint32Array([
        0,
        20,
        24,
        491536,
        0,
        25,
        27,
        491536,
        0,
        28,
        29,
        32784,
        0,
        29,
        31,
        524304,
        0,
        32,
        33,
        32784,
        0,
        34,
        36,
        196624,
        0,
        36,
        37,
        32784,
        0,
        38,
        42,
        491536,
        0,
        43,
        47,
        360464
      ]))
    ], true);
    const lineTokens = model.tokenization.getLineTokens(1);
    const decodedTokens = [];
    for (let i = 0, len = lineTokens.getCount(); i < len; i++) {
      decodedTokens.push(lineTokens.getEndOffset(i), lineTokens.getMetadata(i));
    }
    assert.deepStrictEqual(decodedTokens, [
      20,
      33588225,
      24,
      34046977,
      25,
      33588225,
      27,
      34046977,
      28,
      33588225,
      29,
      33588225,
      31,
      34079745,
      32,
      33588225,
      33,
      33588225,
      34,
      33588225,
      36,
      33752065,
      37,
      33588225,
      38,
      33588225,
      42,
      34046977,
      43,
      33588225,
      47,
      33915905
    ]);
    model.dispose();
  });
  test('issue #147944: Language id "vs.editor.nullLanguage" is not configured nor known', () => {
    const disposables = new DisposableStore();
    const instantiationService = createModelServices(disposables, [
      [ILanguageConfigurationService, LanguageConfigurationService]
    ]);
    const model = disposables.add(instantiateTextModel(instantiationService, "--[[\n\n]]"));
    model.tokenization.setSemanticTokens([
      SparseMultilineTokens.create(1, new Uint32Array([
        0,
        2,
        4,
        131088,
        1,
        0,
        0,
        131088,
        2,
        0,
        2,
        131088
      ]))
    ], true);
    assert.strictEqual(model.getWordAtPosition(new Position(2, 1)), null);
    disposables.dispose();
  });
  test("partial tokens 1", () => {
    const codec = new LanguageIdCodec();
    const store = new SparseTokensStore(codec);
    store.setPartial(new Range(1, 1, 31, 2), [
      SparseMultilineTokens.create(5, new Uint32Array([
        0,
        5,
        10,
        1,
        5,
        5,
        10,
        2,
        10,
        5,
        10,
        3,
        15,
        5,
        10,
        4,
        20,
        5,
        10,
        5,
        25,
        5,
        10,
        6
      ]))
    ]);
    store.setPartial(new Range(18, 1, 42, 1), [
      SparseMultilineTokens.create(20, new Uint32Array([
        0,
        5,
        10,
        4,
        5,
        5,
        10,
        5,
        10,
        5,
        10,
        6,
        15,
        5,
        10,
        7,
        20,
        5,
        10,
        8
      ]))
    ]);
    store.setPartial(new Range(1, 1, 31, 2), [
      SparseMultilineTokens.create(5, new Uint32Array([
        0,
        5,
        10,
        1,
        5,
        5,
        10,
        2,
        10,
        5,
        10,
        3,
        15,
        5,
        10,
        4,
        20,
        5,
        10,
        5,
        25,
        5,
        10,
        6
      ]))
    ]);
    const lineTokens = store.addSparseTokens(10, new LineTokens(new Uint32Array([12, 1]), `enum Enum1 {`, codec));
    assert.strictEqual(lineTokens.getCount(), 3);
  });
  test("partial tokens 2", () => {
    const codec = new LanguageIdCodec();
    const store = new SparseTokensStore(codec);
    store.setPartial(new Range(1, 1, 31, 2), [
      SparseMultilineTokens.create(5, new Uint32Array([
        0,
        5,
        10,
        1,
        5,
        5,
        10,
        2,
        10,
        5,
        10,
        3,
        15,
        5,
        10,
        4,
        20,
        5,
        10,
        5,
        25,
        5,
        10,
        6
      ]))
    ]);
    store.setPartial(new Range(6, 1, 36, 2), [
      SparseMultilineTokens.create(10, new Uint32Array([
        0,
        5,
        10,
        2,
        5,
        5,
        10,
        3,
        10,
        5,
        10,
        4,
        15,
        5,
        10,
        5,
        20,
        5,
        10,
        6
      ]))
    ]);
    store.setPartial(new Range(17, 1, 42, 1), [
      SparseMultilineTokens.create(20, new Uint32Array([
        0,
        5,
        10,
        4,
        5,
        5,
        10,
        5,
        10,
        5,
        10,
        6,
        15,
        5,
        10,
        7,
        20,
        5,
        10,
        8
      ]))
    ]);
    const lineTokens = store.addSparseTokens(20, new LineTokens(new Uint32Array([12, 1]), `enum Enum1 {`, codec));
    assert.strictEqual(lineTokens.getCount(), 3);
  });
  test("partial tokens 3", () => {
    const codec = new LanguageIdCodec();
    const store = new SparseTokensStore(codec);
    store.setPartial(new Range(1, 1, 31, 2), [
      SparseMultilineTokens.create(5, new Uint32Array([
        0,
        5,
        10,
        1,
        5,
        5,
        10,
        2,
        10,
        5,
        10,
        3,
        15,
        5,
        10,
        4,
        20,
        5,
        10,
        5,
        25,
        5,
        10,
        6
      ]))
    ]);
    store.setPartial(new Range(11, 1, 16, 2), [
      SparseMultilineTokens.create(10, new Uint32Array([
        0,
        5,
        10,
        3,
        5,
        5,
        10,
        4
      ]))
    ]);
    const lineTokens = store.addSparseTokens(5, new LineTokens(new Uint32Array([12, 1]), `enum Enum1 {`, codec));
    assert.strictEqual(lineTokens.getCount(), 3);
  });
  test("issue #94133: Semantic colors stick around when using (only) range provider", () => {
    const codec = new LanguageIdCodec();
    const store = new SparseTokensStore(codec);
    store.setPartial(new Range(1, 1, 1, 20), [
      SparseMultilineTokens.create(1, new Uint32Array([
        0,
        9,
        11,
        1
      ]))
    ]);
    store.setPartial(new Range(1, 1, 1, 20), []);
    const lineTokens = store.addSparseTokens(1, new LineTokens(new Uint32Array([12, 1]), `enum Enum1 {`, codec));
    assert.strictEqual(lineTokens.getCount(), 1);
  });
  test("bug", () => {
    function createTokens(str) {
      str = str.replace(/^\[\(/, "");
      str = str.replace(/\)\]$/, "");
      const strTokens = str.split("),(");
      const result = [];
      let firstLineNumber = 0;
      for (const strToken of strTokens) {
        const pieces = strToken.split(",");
        const chars = pieces[1].split("-");
        const lineNumber = parseInt(pieces[0], 10);
        const startChar = parseInt(chars[0], 10);
        const endChar = parseInt(chars[1], 10);
        if (firstLineNumber === 0) {
          firstLineNumber = lineNumber;
        }
        result.push(lineNumber - firstLineNumber, startChar, endChar, (lineNumber + startChar) % 13);
      }
      return SparseMultilineTokens.create(firstLineNumber, new Uint32Array(result));
    }
    const codec = new LanguageIdCodec();
    const store = new SparseTokensStore(codec);
    store.setPartial(
      new Range(36446, 1, 36475, 115),
      [createTokens("[(36448,24-29),(36448,33-46),(36448,47-54),(36450,25-35),(36450,36-50),(36451,28-33),(36451,36-49),(36451,50-57),(36452,35-53),(36452,54-62),(36454,33-38),(36454,41-54),(36454,55-60),(36455,35-53),(36455,54-62),(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62),(36466,33-71),(36466,72-76),(36467,35-53),(36467,54-62),(36469,24-29),(36469,33-46),(36469,47-54),(36470,24-35),(36470,38-46),(36473,25-35),(36473,36-51),(36474,28-33),(36474,36-49),(36474,50-58),(36475,35-53),(36475,54-62)]")]
    );
    store.setPartial(
      new Range(36436, 1, 36464, 142),
      [createTokens("[(36437,33-37),(36437,38-42),(36437,47-57),(36437,58-67),(36438,35-53),(36438,54-62),(36440,24-29),(36440,33-46),(36440,47-53),(36442,25-35),(36442,36-50),(36443,30-39),(36443,42-46),(36443,47-53),(36443,54-58),(36443,63-73),(36443,74-84),(36443,87-91),(36443,92-98),(36443,101-105),(36443,106-112),(36443,113-119),(36444,28-37),(36444,38-42),(36444,47-57),(36444,58-75),(36444,80-95),(36444,96-105),(36445,35-53),(36445,54-62),(36448,24-29),(36448,33-46),(36448,47-54),(36450,25-35),(36450,36-50),(36451,28-33),(36451,36-49),(36451,50-57),(36452,35-53),(36452,54-62),(36454,33-38),(36454,41-54),(36454,55-60),(36455,35-53),(36455,54-62),(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62)]")]
    );
    store.setPartial(
      new Range(36457, 1, 36485, 140),
      [createTokens("[(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62),(36466,33-71),(36466,72-76),(36467,35-53),(36467,54-62),(36469,24-29),(36469,33-46),(36469,47-54),(36470,24-35),(36470,38-46),(36473,25-35),(36473,36-51),(36474,28-33),(36474,36-49),(36474,50-58),(36475,35-53),(36475,54-62),(36477,28-32),(36477,33-37),(36477,42-52),(36477,53-69),(36478,32-36),(36478,37-41),(36478,46-56),(36478,57-74),(36479,32-36),(36479,37-41),(36479,46-56),(36479,57-76),(36480,32-36),(36480,37-41),(36480,46-56),(36480,57-68),(36481,32-36),(36481,37-41),(36481,46-56),(36481,57-68),(36482,39-57),(36482,58-66),(36484,34-38),(36484,39-45),(36484,46-50),(36484,55-65),(36484,66-82),(36484,86-97),(36484,98-102),(36484,103-109),(36484,111-124),(36484,125-133),(36485,39-57),(36485,58-66)]")]
    );
    store.setPartial(
      new Range(36441, 1, 36469, 56),
      [createTokens("[(36442,25-35),(36442,36-50),(36443,30-39),(36443,42-46),(36443,47-53),(36443,54-58),(36443,63-73),(36443,74-84),(36443,87-91),(36443,92-98),(36443,101-105),(36443,106-112),(36443,113-119),(36444,28-37),(36444,38-42),(36444,47-57),(36444,58-75),(36444,80-95),(36444,96-105),(36445,35-53),(36445,54-62),(36448,24-29),(36448,33-46),(36448,47-54),(36450,25-35),(36450,36-50),(36451,28-33),(36451,36-49),(36451,50-57),(36452,35-53),(36452,54-62),(36454,33-38),(36454,41-54),(36454,55-60),(36455,35-53),(36455,54-62),(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62),(36466,33-71),(36466,72-76),(36467,35-53),(36467,54-62),(36469,24-29),(36469,33-46),(36469,47-54),(36470,24-35)]")]
    );
    const lineTokens = store.addSparseTokens(36451, new LineTokens(new Uint32Array([60, 1]), `                        if (flags & ModifierFlags.Ambient) {`, codec));
    assert.strictEqual(lineTokens.getCount(), 7);
  });
  test("issue #95949: Identifiers are colored in bold when targetting keywords", () => {
    function createTMMetadata(foreground, fontStyle, languageId) {
      return (languageId << MetadataConsts.LANGUAGEID_OFFSET | fontStyle << MetadataConsts.FONT_STYLE_OFFSET | foreground << MetadataConsts.FOREGROUND_OFFSET) >>> 0;
    }
    function toArr(lineTokens2) {
      const r = [];
      for (let i = 0; i < lineTokens2.getCount(); i++) {
        r.push(lineTokens2.getEndOffset(i));
        r.push(lineTokens2.getMetadata(i));
      }
      return r;
    }
    const codec = new LanguageIdCodec();
    const store = new SparseTokensStore(codec);
    store.set([
      SparseMultilineTokens.create(1, new Uint32Array([
        0,
        6,
        11,
        1 << MetadataConsts.FOREGROUND_OFFSET | MetadataConsts.SEMANTIC_USE_FOREGROUND
      ]))
    ], true);
    const lineTokens = store.addSparseTokens(1, new LineTokens(new Uint32Array([
      5,
      createTMMetadata(5, FontStyle.Bold, 53),
      14,
      createTMMetadata(1, FontStyle.None, 53),
      17,
      createTMMetadata(6, FontStyle.None, 53),
      18,
      createTMMetadata(1, FontStyle.None, 53)
    ]), `const hello = 123;`, codec));
    const actual = toArr(lineTokens);
    assert.deepStrictEqual(actual, [
      5,
      createTMMetadata(5, FontStyle.Bold, 53),
      6,
      createTMMetadata(1, FontStyle.None, 53),
      11,
      createTMMetadata(1, FontStyle.None, 53),
      14,
      createTMMetadata(1, FontStyle.None, 53),
      17,
      createTMMetadata(6, FontStyle.None, 53),
      18,
      createTMMetadata(1, FontStyle.None, 53)
    ]);
  });
  test("BUG: setPartial with startLineNumber > 1 and token removal creates invalid state", () => {
    const codec = new LanguageIdCodec();
    const store = new SparseTokensStore(codec);
    store.set([
      SparseMultilineTokens.create(5, new Uint32Array([
        0,
        5,
        10,
        1
        // line 5, chars 5-10
      ]))
    ], false);
    assert.strictEqual(store.isEmpty(), false);
    store.setPartial(new Range(5, 1, 5, 20), []);
    assert.strictEqual(
      store.isEmpty(),
      true,
      "Store should be empty after setPartial removes all tokens"
    );
  });
  test("BUG: setPartial with split that creates empty first piece with invalid line numbers", () => {
    const codec = new LanguageIdCodec();
    const store = new SparseTokensStore(codec);
    store.set([
      SparseMultilineTokens.create(1, new Uint32Array([
        10,
        5,
        10,
        1
        // line 11 (deltaLine=10 from startLineNumber=1), chars 5-10
      ]))
    ], false);
    store.setPartial(new Range(1, 1, 5, 1), []);
    assert.strictEqual(store.isEmpty(), false, "Store should still have the token on line 11");
    const lineTokens = store.addSparseTokens(11, new LineTokens(new Uint32Array([22, 1]), `    test line text    `, codec));
    assert.strictEqual(lineTokens.getCount(), 3, "Should have 3 tokens: base token start + semantic token from line 11 + base token end");
    assert.strictEqual(lineTokens.getStartOffset(1), 5, "Semantic token should start at offset 5");
    assert.strictEqual(lineTokens.getEndOffset(1), 10, "Semantic token should end at offset 10");
  });
  test("addSparseTokens skips overlapping semantic tokens that produce backward endOffsets", () => {
    const codec = new LanguageIdCodec();
    const store = new SparseTokensStore(codec);
    const semanticMeta1 = 1 << MetadataConsts.FOREGROUND_OFFSET | MetadataConsts.SEMANTIC_USE_FOREGROUND;
    const semanticMeta2 = 2 << MetadataConsts.FOREGROUND_OFFSET | MetadataConsts.SEMANTIC_USE_FOREGROUND;
    store.set([
      SparseMultilineTokens.create(1, new Uint32Array([
        // deltaLine, startChar, endChar, metadata
        0,
        0,
        1,
        semanticMeta1,
        // 'f' at (0,1)
        0,
        1,
        2,
        semanticMeta2,
        // '=' at (1,2)
        0,
        2,
        3,
        semanticMeta1,
        // '1' at (2,3)
        0,
        3,
        5,
        semanticMeta2,
        // '+a' at (3,5) - expanded after edit
        0,
        4,
        5,
        semanticMeta1
        // overlapping: 'a' at (4,5) - stale position
      ]))
    ], true);
    const tmMeta = 3 << MetadataConsts.FOREGROUND_OFFSET >>> 0;
    const lineTokens = store.addSparseTokens(1, new LineTokens(new Uint32Array([
      6,
      tmMeta
      // entire line "f=1+a2" covered by one TM token
    ]), `f=1+a2`, codec));
    const endOffsets = [];
    for (let i = 0; i < lineTokens.getCount(); i++) {
      endOffsets.push(lineTokens.getEndOffset(i));
    }
    for (let i = 1; i < endOffsets.length; i++) {
      assert.ok(
        endOffsets[i] > endOffsets[i - 1],
        `endOffset[${i}]=${endOffsets[i]} should be > endOffset[${i - 1}]=${endOffsets[i - 1]}`
      );
    }
    const withInjected = lineTokens.withInserted([{ offset: 0, text: "  ", tokenMetadata: LineTokens.defaultTokenMetadata }]);
    assert.strictEqual(
      withInjected.getLineContent(),
      "  f=1+a2",
      "withInserted must not duplicate characters when semantic tokens overlap"
    );
  });
  test("piece with startLineNumber 0 and endLineNumber -1 after encompassing deletion", () => {
    const codec = new LanguageIdCodec();
    const store = new SparseTokensStore(codec);
    const piece = SparseMultilineTokens.create(5, new Uint32Array([
      0,
      0,
      5,
      1,
      // line 5, chars 0-5
      5,
      0,
      5,
      2
      // line 10, chars 0-5
    ]));
    store.set([piece], false);
    assert.strictEqual(piece.startLineNumber, 5);
    assert.strictEqual(piece.endLineNumber, 10);
    assert.strictEqual(piece.isEmpty(), false);
    store.acceptEdit(
      { startLineNumber: 1, startColumn: 1, endLineNumber: 20, endColumn: 1 },
      0,
      // eolCount - no new lines inserted
      0,
      // firstLineLength
      0,
      // lastLineLength
      0
      // firstCharCode
    );
    assert.strictEqual(piece.isEmpty(), true, "Piece should be empty after encompassing deletion");
    assert.strictEqual(store.isEmpty(), true, "Store should be empty after all tokens are deleted by encompassing edit");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZWxcXHRva2Vuc1N0b3JlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJU2luZ2xlRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IENvbG9ySWQsIEZvbnRTdHlsZSwgTWV0YWRhdGFDb25zdHMsIFRva2VuTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZW5jb2RlZFRva2VuQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZUlkQ29kZWMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgTGluZVRva2VucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90b2tlbnMvbGluZVRva2Vucy5qcyc7XG5pbXBvcnQgeyBTcGFyc2VNdWx0aWxpbmVUb2tlbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdG9rZW5zL3NwYXJzZU11bHRpbGluZVRva2Vucy5qcyc7XG5pbXBvcnQgeyBTcGFyc2VUb2tlbnNTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90b2tlbnMvc3BhcnNlVG9rZW5zU3RvcmUuanMnO1xuaW1wb3J0IHsgY3JlYXRlTW9kZWxTZXJ2aWNlcywgY3JlYXRlVGV4dE1vZGVsLCBpbnN0YW50aWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uL3Rlc3RUZXh0TW9kZWwuanMnO1xuXG5zdWl0ZSgnVG9rZW5zU3RvcmUnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgU0VNQU5USUNfQ09MT1IgPSA1IGFzIENvbG9ySWQ7XG5cblx0ZnVuY3Rpb24gcGFyc2VUb2tlbnNTdGF0ZShzdGF0ZTogc3RyaW5nW10pOiB7IHRleHQ6IHN0cmluZzsgdG9rZW5zOiBTcGFyc2VNdWx0aWxpbmVUb2tlbnMgfSB7XG5cdFx0Y29uc3QgdGV4dDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCB0b2tlbnM6IG51bWJlcltdID0gW107XG5cdFx0bGV0IGJhc2VMaW5lID0gMTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHN0YXRlLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBsaW5lID0gc3RhdGVbaV07XG5cblx0XHRcdGxldCBzdGFydE9mZnNldCA9IDA7XG5cdFx0XHRsZXQgbGluZVRleHQgPSAnJztcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGNvbnN0IGZpcnN0UGlwZU9mZnNldCA9IGxpbmUuaW5kZXhPZignfCcsIHN0YXJ0T2Zmc2V0KTtcblx0XHRcdFx0aWYgKGZpcnN0UGlwZU9mZnNldCA9PT0gLTEpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzZWNvbmRQaXBlT2Zmc2V0ID0gbGluZS5pbmRleE9mKCd8JywgZmlyc3RQaXBlT2Zmc2V0ICsgMSk7XG5cdFx0XHRcdGlmIChzZWNvbmRQaXBlT2Zmc2V0ID09PSAtMSkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChmaXJzdFBpcGVPZmZzZXQgKyAxID09PSBzZWNvbmRQaXBlT2Zmc2V0KSB7XG5cdFx0XHRcdFx0Ly8gc2tpcCB8fFxuXHRcdFx0XHRcdGxpbmVUZXh0ICs9IGxpbmUuc3Vic3RyaW5nKHN0YXJ0T2Zmc2V0LCBzZWNvbmRQaXBlT2Zmc2V0ICsgMSk7XG5cdFx0XHRcdFx0c3RhcnRPZmZzZXQgPSBzZWNvbmRQaXBlT2Zmc2V0ICsgMTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGxpbmVUZXh0ICs9IGxpbmUuc3Vic3RyaW5nKHN0YXJ0T2Zmc2V0LCBmaXJzdFBpcGVPZmZzZXQpO1xuXHRcdFx0XHRjb25zdCB0b2tlblN0YXJ0Q2hhcmFjdGVyID0gbGluZVRleHQubGVuZ3RoO1xuXHRcdFx0XHRjb25zdCB0b2tlbkxlbmd0aCA9IHNlY29uZFBpcGVPZmZzZXQgLSBmaXJzdFBpcGVPZmZzZXQgLSAxO1xuXHRcdFx0XHRjb25zdCBtZXRhZGF0YSA9IChcblx0XHRcdFx0XHRTRU1BTlRJQ19DT0xPUiA8PCBNZXRhZGF0YUNvbnN0cy5GT1JFR1JPVU5EX09GRlNFVFxuXHRcdFx0XHRcdHwgTWV0YWRhdGFDb25zdHMuU0VNQU5USUNfVVNFX0ZPUkVHUk9VTkRcblx0XHRcdFx0KTtcblxuXHRcdFx0XHRpZiAodG9rZW5zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdGJhc2VMaW5lID0gaSArIDE7XG5cdFx0XHRcdH1cblx0XHRcdFx0dG9rZW5zLnB1c2goaSArIDEgLSBiYXNlTGluZSwgdG9rZW5TdGFydENoYXJhY3RlciwgdG9rZW5TdGFydENoYXJhY3RlciArIHRva2VuTGVuZ3RoLCBtZXRhZGF0YSk7XG5cblx0XHRcdFx0bGluZVRleHQgKz0gbGluZS5zdWJzdHIoZmlyc3RQaXBlT2Zmc2V0ICsgMSwgdG9rZW5MZW5ndGgpO1xuXHRcdFx0XHRzdGFydE9mZnNldCA9IHNlY29uZFBpcGVPZmZzZXQgKyAxO1xuXHRcdFx0fVxuXG5cdFx0XHRsaW5lVGV4dCArPSBsaW5lLnN1YnN0cmluZyhzdGFydE9mZnNldCk7XG5cblx0XHRcdHRleHQucHVzaChsaW5lVGV4dCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHRleHQ6IHRleHQuam9pbignXFxuJyksXG5cdFx0XHR0b2tlbnM6IFNwYXJzZU11bHRpbGluZVRva2Vucy5jcmVhdGUoYmFzZUxpbmUsIG5ldyBVaW50MzJBcnJheSh0b2tlbnMpKVxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBleHRyYWN0U3RhdGUobW9kZWw6IFRleHRNb2RlbCk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IDE7IGxpbmVOdW1iZXIgPD0gbW9kZWwuZ2V0TGluZUNvdW50KCk7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0Y29uc3QgbGluZVRva2VucyA9IG1vZGVsLnRva2VuaXphdGlvbi5nZXRMaW5lVG9rZW5zKGxpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKTtcblxuXHRcdFx0bGV0IGxpbmVUZXh0ID0gJyc7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVUb2tlbnMuZ2V0Q291bnQoKTsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IHRva2VuU3RhcnRDaGFyYWN0ZXIgPSBsaW5lVG9rZW5zLmdldFN0YXJ0T2Zmc2V0KGkpO1xuXHRcdFx0XHRjb25zdCB0b2tlbkVuZENoYXJhY3RlciA9IGxpbmVUb2tlbnMuZ2V0RW5kT2Zmc2V0KGkpO1xuXHRcdFx0XHRjb25zdCBtZXRhZGF0YSA9IGxpbmVUb2tlbnMuZ2V0TWV0YWRhdGEoaSk7XG5cdFx0XHRcdGNvbnN0IGNvbG9yID0gVG9rZW5NZXRhZGF0YS5nZXRGb3JlZ3JvdW5kKG1ldGFkYXRhKTtcblx0XHRcdFx0Y29uc3QgdG9rZW5UZXh0ID0gbGluZUNvbnRlbnQuc3Vic3RyaW5nKHRva2VuU3RhcnRDaGFyYWN0ZXIsIHRva2VuRW5kQ2hhcmFjdGVyKTtcblx0XHRcdFx0aWYgKGNvbG9yID09PSBTRU1BTlRJQ19DT0xPUikge1xuXHRcdFx0XHRcdGxpbmVUZXh0ICs9IGB8JHt0b2tlblRleHR9fGA7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bGluZVRleHQgKz0gdG9rZW5UZXh0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJlc3VsdC5wdXNoKGxpbmVUZXh0KTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGZ1bmN0aW9uIHRlc3RUb2tlbnNBZGp1c3RtZW50KHJhd0luaXRpYWxTdGF0ZTogc3RyaW5nW10sIGVkaXRzOiBJU2luZ2xlRWRpdE9wZXJhdGlvbltdLCByYXdGaW5hbFN0YXRlOiBzdHJpbmdbXSkge1xuXHRcdGNvbnN0IGluaXRpYWxTdGF0ZSA9IHBhcnNlVG9rZW5zU3RhdGUocmF3SW5pdGlhbFN0YXRlKTtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChpbml0aWFsU3RhdGUudGV4dCk7XG5cdFx0bW9kZWwudG9rZW5pemF0aW9uLnNldFNlbWFudGljVG9rZW5zKFtpbml0aWFsU3RhdGUudG9rZW5zXSwgdHJ1ZSk7XG5cblx0XHRtb2RlbC5hcHBseUVkaXRzKGVkaXRzKTtcblxuXHRcdGNvbnN0IGFjdHVhbFN0YXRlID0gZXh0cmFjdFN0YXRlKG1vZGVsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbFN0YXRlLCByYXdGaW5hbFN0YXRlKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHRlc3QoJ2lzc3VlICM4NjMwMyAtIGNvbG9yIHNoaWZ0aW5nIGJldHdlZW4gZGlmZmVyZW50IHRva2VucycsICgpID0+IHtcblx0XHR0ZXN0VG9rZW5zQWRqdXN0bWVudChcblx0XHRcdFtcblx0XHRcdFx0YGltcG9ydCB7IHxVUkl8IH0gZnJvbSAndnMvYmFzZS9jb21tb24vdXJpJztgLFxuXHRcdFx0XHRgY29uc3QgZm9vID0gfFVSSXwucGFyc2UoJ2hleScpO2Bcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSgyLCA5LCAyLCAxMCksIHRleHQ6ICcnIH1cblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGBpbXBvcnQgeyB8VVJJfCB9IGZyb20gJ3ZzL2Jhc2UvY29tbW9uL3VyaSc7YCxcblx0XHRcdFx0YGNvbnN0IGZvID0gfFVSSXwucGFyc2UoJ2hleScpO2Bcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGluZyBhIG5ld2xpbmUnLCAoKSA9PiB7XG5cdFx0dGVzdFRva2Vuc0FkanVzdG1lbnQoXG5cdFx0XHRbXG5cdFx0XHRcdGBpbXBvcnQgeyB8VVJJfCB9IGZyb20gJ3ZzL2Jhc2UvY29tbW9uL3VyaSc7YCxcblx0XHRcdFx0YGNvbnN0IGZvbyA9IHxVUkl8LnBhcnNlKCdoZXknKTtgXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgNDIsIDIsIDEpLCB0ZXh0OiAnJyB9XG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRgaW1wb3J0IHsgfFVSSXwgfSBmcm9tICd2cy9iYXNlL2NvbW1vbi91cmknO2NvbnN0IGZvbyA9IHxVUkl8LnBhcnNlKCdoZXknKTtgXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0aW5nIGEgbmV3bGluZScsICgpID0+IHtcblx0XHR0ZXN0VG9rZW5zQWRqdXN0bWVudChcblx0XHRcdFtcblx0XHRcdFx0YGltcG9ydCB7IHxVUkl8IH0gZnJvbSAndnMvYmFzZS9jb21tb24vdXJpJztjb25zdCBmb28gPSB8VVJJfC5wYXJzZSgnaGV5Jyk7YFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDEsIDQyLCAxLCA0MiksIHRleHQ6ICdcXG4nIH1cblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGBpbXBvcnQgeyB8VVJJfCB9IGZyb20gJ3ZzL2Jhc2UvY29tbW9uL3VyaSc7YCxcblx0XHRcdFx0YGNvbnN0IGZvbyA9IHxVUkl8LnBhcnNlKCdoZXknKTtgXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRpbmcgYSBuZXdsaW5lIDInLCAoKSA9PiB7XG5cdFx0dGVzdFRva2Vuc0FkanVzdG1lbnQoXG5cdFx0XHRbXG5cdFx0XHRcdGBpbXBvcnQgeyBgLFxuXHRcdFx0XHRgICAgIHxVUkl8IH0gZnJvbSAndnMvYmFzZS9jb21tb24vdXJpJztjb25zdCBmb28gPSB8VVJJfC5wYXJzZSgnaGV5Jyk7YFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDEsIDEwLCAyLCA1KSwgdGV4dDogJycgfVxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0YGltcG9ydCB7IHxVUkl8IH0gZnJvbSAndnMvYmFzZS9jb21tb24vdXJpJztjb25zdCBmb28gPSB8VVJJfC5wYXJzZSgnaGV5Jyk7YFxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNzkyNjg6IGEgY29tcGxleCBlZGl0JywgKCkgPT4ge1xuXHRcdHRlc3RUb2tlbnNBZGp1c3RtZW50KFxuXHRcdFx0W1xuXHRcdFx0XHRgfGV4cG9ydHwgfCdpbnRlcmlvcl9tYXRlcmlhbF9zZWxlY3Rvci5kYXJ0J3w7YCxcblx0XHRcdFx0YHxleHBvcnR8IHwnbWlsZWFnZV9zZWxlY3Rvci5kYXJ0J3w7YCxcblx0XHRcdFx0YHxleHBvcnR8IHwnb3duZXJzX3NlbGVjdG9yLmRhcnQnfDtgLFxuXHRcdFx0XHRgfGV4cG9ydHwgfCdwcmljZV9zZWxlY3Rvci5kYXJ0J3w7YCxcblx0XHRcdFx0YHxleHBvcnR8IHwnc2VhdF9jb3VudF9zZWxlY3Rvci5kYXJ0J3w7YCxcblx0XHRcdFx0YHxleHBvcnR8IHwneWVhcl9zZWxlY3Rvci5kYXJ0J3w7YCxcblx0XHRcdFx0YHxleHBvcnR8IHwnd2ludGVyX29wdGlvbnNfc2VsZWN0b3IuZGFydCd8O3xleHBvcnR8IHwnY2FtZXJhX3NlbGVjdG9yLmRhcnQnfDtgXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgOSwgMSwgOSksIHRleHQ6IGBjYW1lcmFfc2VsZWN0b3IuZGFydCc7XFxuZXhwb3J0ICdgIH0sXG5cdFx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSg2LCA5LCA3LCA5KSwgdGV4dDogYGAgfSxcblx0XHRcdFx0eyByYW5nZTogbmV3IFJhbmdlKDcsIDM5LCA3LCAzOSksIHRleHQ6IGBcXG5gIH0sXG5cdFx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSg3LCA0NywgNywgNDgpLCB0ZXh0OiBgeWVgIH0sXG5cdFx0XHRcdHsgcmFuZ2U6IG5ldyBSYW5nZSg3LCA0OSwgNywgNTEpLCB0ZXh0OiBgYCB9LFxuXHRcdFx0XHR7IHJhbmdlOiBuZXcgUmFuZ2UoNywgNTIsIDcsIDUzKSwgdGV4dDogYGAgfSxcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdGB8ZXhwb3J0fCB8J3xjYW1lcmFfc2VsZWN0b3IuZGFydCc7YCxcblx0XHRcdFx0YGV4cG9ydCAnaW50ZXJpb3JfbWF0ZXJpYWxfc2VsZWN0b3IuZGFydCc7YCxcblx0XHRcdFx0YHxleHBvcnR8IHwnbWlsZWFnZV9zZWxlY3Rvci5kYXJ0J3w7YCxcblx0XHRcdFx0YHxleHBvcnR8IHwnb3duZXJzX3NlbGVjdG9yLmRhcnQnfDtgLFxuXHRcdFx0XHRgfGV4cG9ydHwgfCdwcmljZV9zZWxlY3Rvci5kYXJ0J3w7YCxcblx0XHRcdFx0YHxleHBvcnR8IHwnc2VhdF9jb3VudF9zZWxlY3Rvci5kYXJ0J3w7YCxcblx0XHRcdFx0YHxleHBvcnR8IHwnfHx3aW50ZXJfb3B0aW9uc19zZWxlY3Rvci5kYXJ0J3w7YCxcblx0XHRcdFx0YHxleHBvcnR8IHwneWVhcl9zZWxlY3Rvci5kYXJ0J3w7YFxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM5MTkzNjogU2VtYW50aWMgdG9rZW4gY29sb3IgaGlnaGxpZ2h0aW5nIGZhaWxzIG9uIGxpbmUgd2l0aCBzZWxlY3RlZCB0ZXh0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCcgICAgICAgICAgICAgICAgICAgIGVsc2UgaWYgKCRzID0gMDgpIHRoZW4gXFwnXFxcXGJcXCcnKTtcblx0XHRtb2RlbC50b2tlbml6YXRpb24uc2V0U2VtYW50aWNUb2tlbnMoW1xuXHRcdFx0U3BhcnNlTXVsdGlsaW5lVG9rZW5zLmNyZWF0ZSgxLCBuZXcgVWludDMyQXJyYXkoW1xuXHRcdFx0XHQwLCAyMCwgMjQsIDBiMDExMTEwMDAwMDAwMDAwMTAwMDAsXG5cdFx0XHRcdDAsIDI1LCAyNywgMGIwMTExMTAwMDAwMDAwMDAxMDAwMCxcblx0XHRcdFx0MCwgMjgsIDI5LCAwYjAwMDAxMDAwMDAwMDAwMDEwMDAwLFxuXHRcdFx0XHQwLCAyOSwgMzEsIDBiMTAwMDAwMDAwMDAwMDAwMTAwMDAsXG5cdFx0XHRcdDAsIDMyLCAzMywgMGIwMDAwMTAwMDAwMDAwMDAxMDAwMCxcblx0XHRcdFx0MCwgMzQsIDM2LCAwYjAwMTEwMDAwMDAwMDAwMDEwMDAwLFxuXHRcdFx0XHQwLCAzNiwgMzcsIDBiMDAwMDEwMDAwMDAwMDAwMTAwMDAsXG5cdFx0XHRcdDAsIDM4LCA0MiwgMGIwMTExMTAwMDAwMDAwMDAxMDAwMCxcblx0XHRcdFx0MCwgNDMsIDQ3LCAwYjAxMDExMDAwMDAwMDAwMDEwMDAwLFxuXHRcdFx0XSkpXG5cdFx0XSwgdHJ1ZSk7XG5cdFx0Y29uc3QgbGluZVRva2VucyA9IG1vZGVsLnRva2VuaXphdGlvbi5nZXRMaW5lVG9rZW5zKDEpO1xuXHRcdGNvbnN0IGRlY29kZWRUb2tlbnM6IG51bWJlcltdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGxpbmVUb2tlbnMuZ2V0Q291bnQoKTsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRkZWNvZGVkVG9rZW5zLnB1c2gobGluZVRva2Vucy5nZXRFbmRPZmZzZXQoaSksIGxpbmVUb2tlbnMuZ2V0TWV0YWRhdGEoaSkpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVjb2RlZFRva2VucywgW1xuXHRcdFx0MjAsIDBiMTAwMDAwMDAwMDEwMDAwMTAwMDAwMDAwMDEsXG5cdFx0XHQyNCwgMGIxMDAwMDAwMTExMTAwMDAxMDAwMDAwMDAwMSxcblx0XHRcdDI1LCAwYjEwMDAwMDAwMDAxMDAwMDEwMDAwMDAwMDAxLFxuXHRcdFx0MjcsIDBiMTAwMDAwMDExMTEwMDAwMTAwMDAwMDAwMDEsXG5cdFx0XHQyOCwgMGIxMDAwMDAwMDAwMTAwMDAxMDAwMDAwMDAwMSxcblx0XHRcdDI5LCAwYjEwMDAwMDAwMDAxMDAwMDEwMDAwMDAwMDAxLFxuXHRcdFx0MzEsIDBiMTAwMDAwMTAwMDAwMDAwMTAwMDAwMDAwMDEsXG5cdFx0XHQzMiwgMGIxMDAwMDAwMDAwMTAwMDAxMDAwMDAwMDAwMSxcblx0XHRcdDMzLCAwYjEwMDAwMDAwMDAxMDAwMDEwMDAwMDAwMDAxLFxuXHRcdFx0MzQsIDBiMTAwMDAwMDAwMDEwMDAwMTAwMDAwMDAwMDEsXG5cdFx0XHQzNiwgMGIxMDAwMDAwMDExMDAwMDAxMDAwMDAwMDAwMSxcblx0XHRcdDM3LCAwYjEwMDAwMDAwMDAxMDAwMDEwMDAwMDAwMDAxLFxuXHRcdFx0MzgsIDBiMTAwMDAwMDAwMDEwMDAwMTAwMDAwMDAwMDEsXG5cdFx0XHQ0MiwgMGIxMDAwMDAwMTExMTAwMDAxMDAwMDAwMDAwMSxcblx0XHRcdDQzLCAwYjEwMDAwMDAwMDAxMDAwMDEwMDAwMDAwMDAxLFxuXHRcdFx0NDcsIDBiMTAwMDAwMDEwMTEwMDAwMTAwMDAwMDAwMDFcblx0XHRdKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE0Nzk0NDogTGFuZ3VhZ2UgaWQgXCJ2cy5lZGl0b3IubnVsbExhbmd1YWdlXCIgaXMgbm90IGNvbmZpZ3VyZWQgbm9yIGtub3duJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlTW9kZWxTZXJ2aWNlcyhkaXNwb3NhYmxlcywgW1xuXHRcdFx0W0lMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXVxuXHRcdF0pO1xuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRlVGV4dE1vZGVsKGluc3RhbnRpYXRpb25TZXJ2aWNlLCAnLS1bW1xcblxcbl1dJykpO1xuXHRcdG1vZGVsLnRva2VuaXphdGlvbi5zZXRTZW1hbnRpY1Rva2VucyhbXG5cdFx0XHRTcGFyc2VNdWx0aWxpbmVUb2tlbnMuY3JlYXRlKDEsIG5ldyBVaW50MzJBcnJheShbXG5cdFx0XHRcdDAsIDIsIDQsIDBiMTAwMDAwMDAwMDAwMDEwMDAwLFxuXHRcdFx0XHQxLCAwLCAwLCAwYjEwMDAwMDAwMDAwMDAxMDAwMCxcblx0XHRcdFx0MiwgMCwgMiwgMGIxMDAwMDAwMDAwMDAwMTAwMDAsXG5cdFx0XHRdKSlcblx0XHRdLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0V29yZEF0UG9zaXRpb24obmV3IFBvc2l0aW9uKDIsIDEpKSwgbnVsbCk7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJ0aWFsIHRva2VucyAxJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvZGVjID0gbmV3IExhbmd1YWdlSWRDb2RlYygpO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFNwYXJzZVRva2Vuc1N0b3JlKGNvZGVjKTtcblxuXHRcdC8vIHNldFBhcnRpYWw6IFsxLDEgLT4gMzEsMl0sIFsoNSw1LTEwKSwoMTAsNS0xMCksKDE1LDUtMTApLCgyMCw1LTEwKSwoMjUsNS0xMCksKDMwLDUtMTApXVxuXHRcdHN0b3JlLnNldFBhcnRpYWwobmV3IFJhbmdlKDEsIDEsIDMxLCAyKSwgW1xuXHRcdFx0U3BhcnNlTXVsdGlsaW5lVG9rZW5zLmNyZWF0ZSg1LCBuZXcgVWludDMyQXJyYXkoW1xuXHRcdFx0XHQwLCA1LCAxMCwgMSxcblx0XHRcdFx0NSwgNSwgMTAsIDIsXG5cdFx0XHRcdDEwLCA1LCAxMCwgMyxcblx0XHRcdFx0MTUsIDUsIDEwLCA0LFxuXHRcdFx0XHQyMCwgNSwgMTAsIDUsXG5cdFx0XHRcdDI1LCA1LCAxMCwgNixcblx0XHRcdF0pKVxuXHRcdF0pO1xuXG5cdFx0Ly8gc2V0UGFydGlhbDogWzE4LDEgLT4gNDIsMV0sIFsoMjAsNS0xMCksKDI1LDUtMTApLCgzMCw1LTEwKSwoMzUsNS0xMCksKDQwLDUtMTApXVxuXHRcdHN0b3JlLnNldFBhcnRpYWwobmV3IFJhbmdlKDE4LCAxLCA0MiwgMSksIFtcblx0XHRcdFNwYXJzZU11bHRpbGluZVRva2Vucy5jcmVhdGUoMjAsIG5ldyBVaW50MzJBcnJheShbXG5cdFx0XHRcdDAsIDUsIDEwLCA0LFxuXHRcdFx0XHQ1LCA1LCAxMCwgNSxcblx0XHRcdFx0MTAsIDUsIDEwLCA2LFxuXHRcdFx0XHQxNSwgNSwgMTAsIDcsXG5cdFx0XHRcdDIwLCA1LCAxMCwgOCxcblx0XHRcdF0pKVxuXHRcdF0pO1xuXG5cdFx0Ly8gc2V0UGFydGlhbDogWzEsMSAtPiAzMSwyXSwgWyg1LDUtMTApLCgxMCw1LTEwKSwoMTUsNS0xMCksKDIwLDUtMTApLCgyNSw1LTEwKSwoMzAsNS0xMCldXG5cdFx0c3RvcmUuc2V0UGFydGlhbChuZXcgUmFuZ2UoMSwgMSwgMzEsIDIpLCBbXG5cdFx0XHRTcGFyc2VNdWx0aWxpbmVUb2tlbnMuY3JlYXRlKDUsIG5ldyBVaW50MzJBcnJheShbXG5cdFx0XHRcdDAsIDUsIDEwLCAxLFxuXHRcdFx0XHQ1LCA1LCAxMCwgMixcblx0XHRcdFx0MTAsIDUsIDEwLCAzLFxuXHRcdFx0XHQxNSwgNSwgMTAsIDQsXG5cdFx0XHRcdDIwLCA1LCAxMCwgNSxcblx0XHRcdFx0MjUsIDUsIDEwLCA2LFxuXHRcdFx0XSkpXG5cdFx0XSk7XG5cblx0XHRjb25zdCBsaW5lVG9rZW5zID0gc3RvcmUuYWRkU3BhcnNlVG9rZW5zKDEwLCBuZXcgTGluZVRva2VucyhuZXcgVWludDMyQXJyYXkoWzEyLCAxXSksIGBlbnVtIEVudW0xIHtgLCBjb2RlYykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lVG9rZW5zLmdldENvdW50KCksIDMpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJ0aWFsIHRva2VucyAyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvZGVjID0gbmV3IExhbmd1YWdlSWRDb2RlYygpO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFNwYXJzZVRva2Vuc1N0b3JlKGNvZGVjKTtcblxuXHRcdC8vIHNldFBhcnRpYWw6IFsxLDEgLT4gMzEsMl0sIFsoNSw1LTEwKSwoMTAsNS0xMCksKDE1LDUtMTApLCgyMCw1LTEwKSwoMjUsNS0xMCksKDMwLDUtMTApXVxuXHRcdHN0b3JlLnNldFBhcnRpYWwobmV3IFJhbmdlKDEsIDEsIDMxLCAyKSwgW1xuXHRcdFx0U3BhcnNlTXVsdGlsaW5lVG9rZW5zLmNyZWF0ZSg1LCBuZXcgVWludDMyQXJyYXkoW1xuXHRcdFx0XHQwLCA1LCAxMCwgMSxcblx0XHRcdFx0NSwgNSwgMTAsIDIsXG5cdFx0XHRcdDEwLCA1LCAxMCwgMyxcblx0XHRcdFx0MTUsIDUsIDEwLCA0LFxuXHRcdFx0XHQyMCwgNSwgMTAsIDUsXG5cdFx0XHRcdDI1LCA1LCAxMCwgNixcblx0XHRcdF0pKVxuXHRcdF0pO1xuXG5cdFx0Ly8gc2V0UGFydGlhbDogWzYsMSAtPiAzNiwyXSwgWygxMCw1LTEwKSwoMTUsNS0xMCksKDIwLDUtMTApLCgyNSw1LTEwKSwoMzAsNS0xMCksKDM1LDUtMTApXVxuXHRcdHN0b3JlLnNldFBhcnRpYWwobmV3IFJhbmdlKDYsIDEsIDM2LCAyKSwgW1xuXHRcdFx0U3BhcnNlTXVsdGlsaW5lVG9rZW5zLmNyZWF0ZSgxMCwgbmV3IFVpbnQzMkFycmF5KFtcblx0XHRcdFx0MCwgNSwgMTAsIDIsXG5cdFx0XHRcdDUsIDUsIDEwLCAzLFxuXHRcdFx0XHQxMCwgNSwgMTAsIDQsXG5cdFx0XHRcdDE1LCA1LCAxMCwgNSxcblx0XHRcdFx0MjAsIDUsIDEwLCA2LFxuXHRcdFx0XSkpXG5cdFx0XSk7XG5cblx0XHQvLyBzZXRQYXJ0aWFsOiBbMTcsMSAtPiA0MiwxXSwgWygyMCw1LTEwKSwoMjUsNS0xMCksKDMwLDUtMTApLCgzNSw1LTEwKSwoNDAsNS0xMCldXG5cdFx0c3RvcmUuc2V0UGFydGlhbChuZXcgUmFuZ2UoMTcsIDEsIDQyLCAxKSwgW1xuXHRcdFx0U3BhcnNlTXVsdGlsaW5lVG9rZW5zLmNyZWF0ZSgyMCwgbmV3IFVpbnQzMkFycmF5KFtcblx0XHRcdFx0MCwgNSwgMTAsIDQsXG5cdFx0XHRcdDUsIDUsIDEwLCA1LFxuXHRcdFx0XHQxMCwgNSwgMTAsIDYsXG5cdFx0XHRcdDE1LCA1LCAxMCwgNyxcblx0XHRcdFx0MjAsIDUsIDEwLCA4LFxuXHRcdFx0XSkpXG5cdFx0XSk7XG5cblx0XHRjb25zdCBsaW5lVG9rZW5zID0gc3RvcmUuYWRkU3BhcnNlVG9rZW5zKDIwLCBuZXcgTGluZVRva2VucyhuZXcgVWludDMyQXJyYXkoWzEyLCAxXSksIGBlbnVtIEVudW0xIHtgLCBjb2RlYykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lVG9rZW5zLmdldENvdW50KCksIDMpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJ0aWFsIHRva2VucyAzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvZGVjID0gbmV3IExhbmd1YWdlSWRDb2RlYygpO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFNwYXJzZVRva2Vuc1N0b3JlKGNvZGVjKTtcblxuXHRcdC8vIHNldFBhcnRpYWw6IFsxLDEgLT4gMzEsMl0sIFsoNSw1LTEwKSwoMTAsNS0xMCksKDE1LDUtMTApLCgyMCw1LTEwKSwoMjUsNS0xMCksKDMwLDUtMTApXVxuXHRcdHN0b3JlLnNldFBhcnRpYWwobmV3IFJhbmdlKDEsIDEsIDMxLCAyKSwgW1xuXHRcdFx0U3BhcnNlTXVsdGlsaW5lVG9rZW5zLmNyZWF0ZSg1LCBuZXcgVWludDMyQXJyYXkoW1xuXHRcdFx0XHQwLCA1LCAxMCwgMSxcblx0XHRcdFx0NSwgNSwgMTAsIDIsXG5cdFx0XHRcdDEwLCA1LCAxMCwgMyxcblx0XHRcdFx0MTUsIDUsIDEwLCA0LFxuXHRcdFx0XHQyMCwgNSwgMTAsIDUsXG5cdFx0XHRcdDI1LCA1LCAxMCwgNixcblx0XHRcdF0pKVxuXHRcdF0pO1xuXG5cdFx0Ly8gc2V0UGFydGlhbDogWzExLDEgLT4gMTYsMl0sIFsoMTUsNS0xMCksKDIwLDUtMTApXVxuXHRcdHN0b3JlLnNldFBhcnRpYWwobmV3IFJhbmdlKDExLCAxLCAxNiwgMiksIFtcblx0XHRcdFNwYXJzZU11bHRpbGluZVRva2Vucy5jcmVhdGUoMTAsIG5ldyBVaW50MzJBcnJheShbXG5cdFx0XHRcdDAsIDUsIDEwLCAzLFxuXHRcdFx0XHQ1LCA1LCAxMCwgNCxcblx0XHRcdF0pKVxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgbGluZVRva2VucyA9IHN0b3JlLmFkZFNwYXJzZVRva2Vucyg1LCBuZXcgTGluZVRva2VucyhuZXcgVWludDMyQXJyYXkoWzEyLCAxXSksIGBlbnVtIEVudW0xIHtgLCBjb2RlYykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lVG9rZW5zLmdldENvdW50KCksIDMpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjOTQxMzM6IFNlbWFudGljIGNvbG9ycyBzdGljayBhcm91bmQgd2hlbiB1c2luZyAob25seSkgcmFuZ2UgcHJvdmlkZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29kZWMgPSBuZXcgTGFuZ3VhZ2VJZENvZGVjKCk7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgU3BhcnNlVG9rZW5zU3RvcmUoY29kZWMpO1xuXG5cdFx0Ly8gc2V0UGFydGlhbDogWzEsMSAtPiAxLDIwXSBbKDEsOS0xMSldXG5cdFx0c3RvcmUuc2V0UGFydGlhbChuZXcgUmFuZ2UoMSwgMSwgMSwgMjApLCBbXG5cdFx0XHRTcGFyc2VNdWx0aWxpbmVUb2tlbnMuY3JlYXRlKDEsIG5ldyBVaW50MzJBcnJheShbXG5cdFx0XHRcdDAsIDksIDExLCAxLFxuXHRcdFx0XSkpXG5cdFx0XSk7XG5cblx0XHQvLyBzZXRQYXJ0aWFsOiBbMSwxIC0+IDEsMjBdLCBbXVxuXHRcdHN0b3JlLnNldFBhcnRpYWwobmV3IFJhbmdlKDEsIDEsIDEsIDIwKSwgW10pO1xuXG5cdFx0Y29uc3QgbGluZVRva2VucyA9IHN0b3JlLmFkZFNwYXJzZVRva2VucygxLCBuZXcgTGluZVRva2VucyhuZXcgVWludDMyQXJyYXkoWzEyLCAxXSksIGBlbnVtIEVudW0xIHtgLCBjb2RlYykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lVG9rZW5zLmdldENvdW50KCksIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdidWcnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gY3JlYXRlVG9rZW5zKHN0cjogc3RyaW5nKTogU3BhcnNlTXVsdGlsaW5lVG9rZW5zIHtcblx0XHRcdHN0ciA9IHN0ci5yZXBsYWNlKC9eXFxbXFwoLywgJycpO1xuXHRcdFx0c3RyID0gc3RyLnJlcGxhY2UoL1xcKVxcXSQvLCAnJyk7XG5cdFx0XHRjb25zdCBzdHJUb2tlbnMgPSBzdHIuc3BsaXQoJyksKCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0bGV0IGZpcnN0TGluZU51bWJlciA9IDA7XG5cdFx0XHRmb3IgKGNvbnN0IHN0clRva2VuIG9mIHN0clRva2Vucykge1xuXHRcdFx0XHRjb25zdCBwaWVjZXMgPSBzdHJUb2tlbi5zcGxpdCgnLCcpO1xuXHRcdFx0XHRjb25zdCBjaGFycyA9IHBpZWNlc1sxXS5zcGxpdCgnLScpO1xuXHRcdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gcGFyc2VJbnQocGllY2VzWzBdLCAxMCk7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0Q2hhciA9IHBhcnNlSW50KGNoYXJzWzBdLCAxMCk7XG5cdFx0XHRcdGNvbnN0IGVuZENoYXIgPSBwYXJzZUludChjaGFyc1sxXSwgMTApO1xuXHRcdFx0XHRpZiAoZmlyc3RMaW5lTnVtYmVyID09PSAwKSB7XG5cdFx0XHRcdFx0Ly8gdGhpcyBpcyB0aGUgZmlyc3QgbGluZVxuXHRcdFx0XHRcdGZpcnN0TGluZU51bWJlciA9IGxpbmVOdW1iZXI7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzdWx0LnB1c2gobGluZU51bWJlciAtIGZpcnN0TGluZU51bWJlciwgc3RhcnRDaGFyLCBlbmRDaGFyLCAobGluZU51bWJlciArIHN0YXJ0Q2hhcikgJSAxMyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gU3BhcnNlTXVsdGlsaW5lVG9rZW5zLmNyZWF0ZShmaXJzdExpbmVOdW1iZXIsIG5ldyBVaW50MzJBcnJheShyZXN1bHQpKTtcblx0XHR9XG5cblx0XHRjb25zdCBjb2RlYyA9IG5ldyBMYW5ndWFnZUlkQ29kZWMoKTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBTcGFyc2VUb2tlbnNTdG9yZShjb2RlYyk7XG5cdFx0Ly8gc2V0UGFydGlhbCBbMzY0NDYsMSAtPiAzNjQ3NSwxMTVdIFsoMzY0NDgsMjQtMjkpLCgzNjQ0OCwzMy00NiksKDM2NDQ4LDQ3LTU0KSwoMzY0NTAsMjUtMzUpLCgzNjQ1MCwzNi01MCksKDM2NDUxLDI4LTMzKSwoMzY0NTEsMzYtNDkpLCgzNjQ1MSw1MC01NyksKDM2NDUyLDM1LTUzKSwoMzY0NTIsNTQtNjIpLCgzNjQ1NCwzMy0zOCksKDM2NDU0LDQxLTU0KSwoMzY0NTQsNTUtNjApLCgzNjQ1NSwzNS01MyksKDM2NDU1LDU0LTYyKSwoMzY0NTcsMzMtNDQpLCgzNjQ1Nyw0NS00OSksKDM2NDU3LDUwLTU2KSwoMzY0NTcsNjItODMpLCgzNjQ1Nyw4NC04OCksKDM2NDU4LDM1LTUzKSwoMzY0NTgsNTQtNjIpLCgzNjQ2MCwzMy0zNyksKDM2NDYwLDM4LTQyKSwoMzY0NjAsNDctNTcpLCgzNjQ2MCw1OC02NyksKDM2NDYxLDM1LTUzKSwoMzY0NjEsNTQtNjIpLCgzNjQ2MywzNC0zOCksKDM2NDYzLDM5LTQ1KSwoMzY0NjMsNDYtNTEpLCgzNjQ2Myw1NC02MyksKDM2NDYzLDY0LTcxKSwoMzY0NjMsNzYtODApLCgzNjQ2Myw4MS04NyksKDM2NDYzLDg4LTkyKSwoMzY0NjMsOTctMTA3KSwoMzY0NjMsMTA4LTExOSksKDM2NDY0LDM1LTUzKSwoMzY0NjQsNTQtNjIpLCgzNjQ2NiwzMy03MSksKDM2NDY2LDcyLTc2KSwoMzY0NjcsMzUtNTMpLCgzNjQ2Nyw1NC02MiksKDM2NDY5LDI0LTI5KSwoMzY0NjksMzMtNDYpLCgzNjQ2OSw0Ny01NCksKDM2NDcwLDI0LTM1KSwoMzY0NzAsMzgtNDYpLCgzNjQ3MywyNS0zNSksKDM2NDczLDM2LTUxKSwoMzY0NzQsMjgtMzMpLCgzNjQ3NCwzNi00OSksKDM2NDc0LDUwLTU4KSwoMzY0NzUsMzUtNTMpLCgzNjQ3NSw1NC02MildXG5cdFx0c3RvcmUuc2V0UGFydGlhbChcblx0XHRcdG5ldyBSYW5nZSgzNjQ0NiwgMSwgMzY0NzUsIDExNSksXG5cdFx0XHRbY3JlYXRlVG9rZW5zKCdbKDM2NDQ4LDI0LTI5KSwoMzY0NDgsMzMtNDYpLCgzNjQ0OCw0Ny01NCksKDM2NDUwLDI1LTM1KSwoMzY0NTAsMzYtNTApLCgzNjQ1MSwyOC0zMyksKDM2NDUxLDM2LTQ5KSwoMzY0NTEsNTAtNTcpLCgzNjQ1MiwzNS01MyksKDM2NDUyLDU0LTYyKSwoMzY0NTQsMzMtMzgpLCgzNjQ1NCw0MS01NCksKDM2NDU0LDU1LTYwKSwoMzY0NTUsMzUtNTMpLCgzNjQ1NSw1NC02MiksKDM2NDU3LDMzLTQ0KSwoMzY0NTcsNDUtNDkpLCgzNjQ1Nyw1MC01NiksKDM2NDU3LDYyLTgzKSwoMzY0NTcsODQtODgpLCgzNjQ1OCwzNS01MyksKDM2NDU4LDU0LTYyKSwoMzY0NjAsMzMtMzcpLCgzNjQ2MCwzOC00MiksKDM2NDYwLDQ3LTU3KSwoMzY0NjAsNTgtNjcpLCgzNjQ2MSwzNS01MyksKDM2NDYxLDU0LTYyKSwoMzY0NjMsMzQtMzgpLCgzNjQ2MywzOS00NSksKDM2NDYzLDQ2LTUxKSwoMzY0NjMsNTQtNjMpLCgzNjQ2Myw2NC03MSksKDM2NDYzLDc2LTgwKSwoMzY0NjMsODEtODcpLCgzNjQ2Myw4OC05MiksKDM2NDYzLDk3LTEwNyksKDM2NDYzLDEwOC0xMTkpLCgzNjQ2NCwzNS01MyksKDM2NDY0LDU0LTYyKSwoMzY0NjYsMzMtNzEpLCgzNjQ2Niw3Mi03NiksKDM2NDY3LDM1LTUzKSwoMzY0NjcsNTQtNjIpLCgzNjQ2OSwyNC0yOSksKDM2NDY5LDMzLTQ2KSwoMzY0NjksNDctNTQpLCgzNjQ3MCwyNC0zNSksKDM2NDcwLDM4LTQ2KSwoMzY0NzMsMjUtMzUpLCgzNjQ3MywzNi01MSksKDM2NDc0LDI4LTMzKSwoMzY0NzQsMzYtNDkpLCgzNjQ3NCw1MC01OCksKDM2NDc1LDM1LTUzKSwoMzY0NzUsNTQtNjIpXScpXVxuXHRcdCk7XG5cdFx0Ly8gc2V0UGFydGlhbCBbMzY0MzYsMSAtPiAzNjQ2NCwxNDJdIFsoMzY0MzcsMzMtMzcpLCgzNjQzNywzOC00MiksKDM2NDM3LDQ3LTU3KSwoMzY0MzcsNTgtNjcpLCgzNjQzOCwzNS01MyksKDM2NDM4LDU0LTYyKSwoMzY0NDAsMjQtMjkpLCgzNjQ0MCwzMy00NiksKDM2NDQwLDQ3LTUzKSwoMzY0NDIsMjUtMzUpLCgzNjQ0MiwzNi01MCksKDM2NDQzLDMwLTM5KSwoMzY0NDMsNDItNDYpLCgzNjQ0Myw0Ny01MyksKDM2NDQzLDU0LTU4KSwoMzY0NDMsNjMtNzMpLCgzNjQ0Myw3NC04NCksKDM2NDQzLDg3LTkxKSwoMzY0NDMsOTItOTgpLCgzNjQ0MywxMDEtMTA1KSwoMzY0NDMsMTA2LTExMiksKDM2NDQzLDExMy0xMTkpLCgzNjQ0NCwyOC0zNyksKDM2NDQ0LDM4LTQyKSwoMzY0NDQsNDctNTcpLCgzNjQ0NCw1OC03NSksKDM2NDQ0LDgwLTk1KSwoMzY0NDQsOTYtMTA1KSwoMzY0NDUsMzUtNTMpLCgzNjQ0NSw1NC02MiksKDM2NDQ4LDI0LTI5KSwoMzY0NDgsMzMtNDYpLCgzNjQ0OCw0Ny01NCksKDM2NDUwLDI1LTM1KSwoMzY0NTAsMzYtNTApLCgzNjQ1MSwyOC0zMyksKDM2NDUxLDM2LTQ5KSwoMzY0NTEsNTAtNTcpLCgzNjQ1MiwzNS01MyksKDM2NDUyLDU0LTYyKSwoMzY0NTQsMzMtMzgpLCgzNjQ1NCw0MS01NCksKDM2NDU0LDU1LTYwKSwoMzY0NTUsMzUtNTMpLCgzNjQ1NSw1NC02MiksKDM2NDU3LDMzLTQ0KSwoMzY0NTcsNDUtNDkpLCgzNjQ1Nyw1MC01NiksKDM2NDU3LDYyLTgzKSwoMzY0NTcsODQtODgpLCgzNjQ1OCwzNS01MyksKDM2NDU4LDU0LTYyKSwoMzY0NjAsMzMtMzcpLCgzNjQ2MCwzOC00MiksKDM2NDYwLDQ3LTU3KSwoMzY0NjAsNTgtNjcpLCgzNjQ2MSwzNS01MyksKDM2NDYxLDU0LTYyKSwoMzY0NjMsMzQtMzgpLCgzNjQ2MywzOS00NSksKDM2NDYzLDQ2LTUxKSwoMzY0NjMsNTQtNjMpLCgzNjQ2Myw2NC03MSksKDM2NDYzLDc2LTgwKSwoMzY0NjMsODEtODcpLCgzNjQ2Myw4OC05MiksKDM2NDYzLDk3LTEwNyksKDM2NDYzLDEwOC0xMTkpLCgzNjQ2NCwzNS01MyksKDM2NDY0LDU0LTYyKV1cblx0XHRzdG9yZS5zZXRQYXJ0aWFsKFxuXHRcdFx0bmV3IFJhbmdlKDM2NDM2LCAxLCAzNjQ2NCwgMTQyKSxcblx0XHRcdFtjcmVhdGVUb2tlbnMoJ1soMzY0MzcsMzMtMzcpLCgzNjQzNywzOC00MiksKDM2NDM3LDQ3LTU3KSwoMzY0MzcsNTgtNjcpLCgzNjQzOCwzNS01MyksKDM2NDM4LDU0LTYyKSwoMzY0NDAsMjQtMjkpLCgzNjQ0MCwzMy00NiksKDM2NDQwLDQ3LTUzKSwoMzY0NDIsMjUtMzUpLCgzNjQ0MiwzNi01MCksKDM2NDQzLDMwLTM5KSwoMzY0NDMsNDItNDYpLCgzNjQ0Myw0Ny01MyksKDM2NDQzLDU0LTU4KSwoMzY0NDMsNjMtNzMpLCgzNjQ0Myw3NC04NCksKDM2NDQzLDg3LTkxKSwoMzY0NDMsOTItOTgpLCgzNjQ0MywxMDEtMTA1KSwoMzY0NDMsMTA2LTExMiksKDM2NDQzLDExMy0xMTkpLCgzNjQ0NCwyOC0zNyksKDM2NDQ0LDM4LTQyKSwoMzY0NDQsNDctNTcpLCgzNjQ0NCw1OC03NSksKDM2NDQ0LDgwLTk1KSwoMzY0NDQsOTYtMTA1KSwoMzY0NDUsMzUtNTMpLCgzNjQ0NSw1NC02MiksKDM2NDQ4LDI0LTI5KSwoMzY0NDgsMzMtNDYpLCgzNjQ0OCw0Ny01NCksKDM2NDUwLDI1LTM1KSwoMzY0NTAsMzYtNTApLCgzNjQ1MSwyOC0zMyksKDM2NDUxLDM2LTQ5KSwoMzY0NTEsNTAtNTcpLCgzNjQ1MiwzNS01MyksKDM2NDUyLDU0LTYyKSwoMzY0NTQsMzMtMzgpLCgzNjQ1NCw0MS01NCksKDM2NDU0LDU1LTYwKSwoMzY0NTUsMzUtNTMpLCgzNjQ1NSw1NC02MiksKDM2NDU3LDMzLTQ0KSwoMzY0NTcsNDUtNDkpLCgzNjQ1Nyw1MC01NiksKDM2NDU3LDYyLTgzKSwoMzY0NTcsODQtODgpLCgzNjQ1OCwzNS01MyksKDM2NDU4LDU0LTYyKSwoMzY0NjAsMzMtMzcpLCgzNjQ2MCwzOC00MiksKDM2NDYwLDQ3LTU3KSwoMzY0NjAsNTgtNjcpLCgzNjQ2MSwzNS01MyksKDM2NDYxLDU0LTYyKSwoMzY0NjMsMzQtMzgpLCgzNjQ2MywzOS00NSksKDM2NDYzLDQ2LTUxKSwoMzY0NjMsNTQtNjMpLCgzNjQ2Myw2NC03MSksKDM2NDYzLDc2LTgwKSwoMzY0NjMsODEtODcpLCgzNjQ2Myw4OC05MiksKDM2NDYzLDk3LTEwNyksKDM2NDYzLDEwOC0xMTkpLCgzNjQ2NCwzNS01MyksKDM2NDY0LDU0LTYyKV0nKV1cblx0XHQpO1xuXHRcdC8vIHNldFBhcnRpYWwgWzM2NDU3LDEgLT4gMzY0ODUsMTQwXSBbKDM2NDU3LDMzLTQ0KSwoMzY0NTcsNDUtNDkpLCgzNjQ1Nyw1MC01NiksKDM2NDU3LDYyLTgzKSwoMzY0NTcsODQtODgpLCgzNjQ1OCwzNS01MyksKDM2NDU4LDU0LTYyKSwoMzY0NjAsMzMtMzcpLCgzNjQ2MCwzOC00MiksKDM2NDYwLDQ3LTU3KSwoMzY0NjAsNTgtNjcpLCgzNjQ2MSwzNS01MyksKDM2NDYxLDU0LTYyKSwoMzY0NjMsMzQtMzgpLCgzNjQ2MywzOS00NSksKDM2NDYzLDQ2LTUxKSwoMzY0NjMsNTQtNjMpLCgzNjQ2Myw2NC03MSksKDM2NDYzLDc2LTgwKSwoMzY0NjMsODEtODcpLCgzNjQ2Myw4OC05MiksKDM2NDYzLDk3LTEwNyksKDM2NDYzLDEwOC0xMTkpLCgzNjQ2NCwzNS01MyksKDM2NDY0LDU0LTYyKSwoMzY0NjYsMzMtNzEpLCgzNjQ2Niw3Mi03NiksKDM2NDY3LDM1LTUzKSwoMzY0NjcsNTQtNjIpLCgzNjQ2OSwyNC0yOSksKDM2NDY5LDMzLTQ2KSwoMzY0NjksNDctNTQpLCgzNjQ3MCwyNC0zNSksKDM2NDcwLDM4LTQ2KSwoMzY0NzMsMjUtMzUpLCgzNjQ3MywzNi01MSksKDM2NDc0LDI4LTMzKSwoMzY0NzQsMzYtNDkpLCgzNjQ3NCw1MC01OCksKDM2NDc1LDM1LTUzKSwoMzY0NzUsNTQtNjIpLCgzNjQ3NywyOC0zMiksKDM2NDc3LDMzLTM3KSwoMzY0NzcsNDItNTIpLCgzNjQ3Nyw1My02OSksKDM2NDc4LDMyLTM2KSwoMzY0NzgsMzctNDEpLCgzNjQ3OCw0Ni01NiksKDM2NDc4LDU3LTc0KSwoMzY0NzksMzItMzYpLCgzNjQ3OSwzNy00MSksKDM2NDc5LDQ2LTU2KSwoMzY0NzksNTctNzYpLCgzNjQ4MCwzMi0zNiksKDM2NDgwLDM3LTQxKSwoMzY0ODAsNDYtNTYpLCgzNjQ4MCw1Ny02OCksKDM2NDgxLDMyLTM2KSwoMzY0ODEsMzctNDEpLCgzNjQ4MSw0Ni01NiksKDM2NDgxLDU3LTY4KSwoMzY0ODIsMzktNTcpLCgzNjQ4Miw1OC02NiksKDM2NDg0LDM0LTM4KSwoMzY0ODQsMzktNDUpLCgzNjQ4NCw0Ni01MCksKDM2NDg0LDU1LTY1KSwoMzY0ODQsNjYtODIpLCgzNjQ4NCw4Ni05NyksKDM2NDg0LDk4LTEwMiksKDM2NDg0LDEwMy0xMDkpLCgzNjQ4NCwxMTEtMTI0KSwoMzY0ODQsMTI1LTEzMyksKDM2NDg1LDM5LTU3KSwoMzY0ODUsNTgtNjYpXVxuXHRcdHN0b3JlLnNldFBhcnRpYWwoXG5cdFx0XHRuZXcgUmFuZ2UoMzY0NTcsIDEsIDM2NDg1LCAxNDApLFxuXHRcdFx0W2NyZWF0ZVRva2VucygnWygzNjQ1NywzMy00NCksKDM2NDU3LDQ1LTQ5KSwoMzY0NTcsNTAtNTYpLCgzNjQ1Nyw2Mi04MyksKDM2NDU3LDg0LTg4KSwoMzY0NTgsMzUtNTMpLCgzNjQ1OCw1NC02MiksKDM2NDYwLDMzLTM3KSwoMzY0NjAsMzgtNDIpLCgzNjQ2MCw0Ny01NyksKDM2NDYwLDU4LTY3KSwoMzY0NjEsMzUtNTMpLCgzNjQ2MSw1NC02MiksKDM2NDYzLDM0LTM4KSwoMzY0NjMsMzktNDUpLCgzNjQ2Myw0Ni01MSksKDM2NDYzLDU0LTYzKSwoMzY0NjMsNjQtNzEpLCgzNjQ2Myw3Ni04MCksKDM2NDYzLDgxLTg3KSwoMzY0NjMsODgtOTIpLCgzNjQ2Myw5Ny0xMDcpLCgzNjQ2MywxMDgtMTE5KSwoMzY0NjQsMzUtNTMpLCgzNjQ2NCw1NC02MiksKDM2NDY2LDMzLTcxKSwoMzY0NjYsNzItNzYpLCgzNjQ2NywzNS01MyksKDM2NDY3LDU0LTYyKSwoMzY0NjksMjQtMjkpLCgzNjQ2OSwzMy00NiksKDM2NDY5LDQ3LTU0KSwoMzY0NzAsMjQtMzUpLCgzNjQ3MCwzOC00NiksKDM2NDczLDI1LTM1KSwoMzY0NzMsMzYtNTEpLCgzNjQ3NCwyOC0zMyksKDM2NDc0LDM2LTQ5KSwoMzY0NzQsNTAtNTgpLCgzNjQ3NSwzNS01MyksKDM2NDc1LDU0LTYyKSwoMzY0NzcsMjgtMzIpLCgzNjQ3NywzMy0zNyksKDM2NDc3LDQyLTUyKSwoMzY0NzcsNTMtNjkpLCgzNjQ3OCwzMi0zNiksKDM2NDc4LDM3LTQxKSwoMzY0NzgsNDYtNTYpLCgzNjQ3OCw1Ny03NCksKDM2NDc5LDMyLTM2KSwoMzY0NzksMzctNDEpLCgzNjQ3OSw0Ni01NiksKDM2NDc5LDU3LTc2KSwoMzY0ODAsMzItMzYpLCgzNjQ4MCwzNy00MSksKDM2NDgwLDQ2LTU2KSwoMzY0ODAsNTctNjgpLCgzNjQ4MSwzMi0zNiksKDM2NDgxLDM3LTQxKSwoMzY0ODEsNDYtNTYpLCgzNjQ4MSw1Ny02OCksKDM2NDgyLDM5LTU3KSwoMzY0ODIsNTgtNjYpLCgzNjQ4NCwzNC0zOCksKDM2NDg0LDM5LTQ1KSwoMzY0ODQsNDYtNTApLCgzNjQ4NCw1NS02NSksKDM2NDg0LDY2LTgyKSwoMzY0ODQsODYtOTcpLCgzNjQ4NCw5OC0xMDIpLCgzNjQ4NCwxMDMtMTA5KSwoMzY0ODQsMTExLTEyNCksKDM2NDg0LDEyNS0xMzMpLCgzNjQ4NSwzOS01NyksKDM2NDg1LDU4LTY2KV0nKV1cblx0XHQpO1xuXHRcdC8vIHNldFBhcnRpYWwgWzM2NDQxLDEgLT4gMzY0NjksNTZdIFsoMzY0NDIsMjUtMzUpLCgzNjQ0MiwzNi01MCksKDM2NDQzLDMwLTM5KSwoMzY0NDMsNDItNDYpLCgzNjQ0Myw0Ny01MyksKDM2NDQzLDU0LTU4KSwoMzY0NDMsNjMtNzMpLCgzNjQ0Myw3NC04NCksKDM2NDQzLDg3LTkxKSwoMzY0NDMsOTItOTgpLCgzNjQ0MywxMDEtMTA1KSwoMzY0NDMsMTA2LTExMiksKDM2NDQzLDExMy0xMTkpLCgzNjQ0NCwyOC0zNyksKDM2NDQ0LDM4LTQyKSwoMzY0NDQsNDctNTcpLCgzNjQ0NCw1OC03NSksKDM2NDQ0LDgwLTk1KSwoMzY0NDQsOTYtMTA1KSwoMzY0NDUsMzUtNTMpLCgzNjQ0NSw1NC02MiksKDM2NDQ4LDI0LTI5KSwoMzY0NDgsMzMtNDYpLCgzNjQ0OCw0Ny01NCksKDM2NDUwLDI1LTM1KSwoMzY0NTAsMzYtNTApLCgzNjQ1MSwyOC0zMyksKDM2NDUxLDM2LTQ5KSwoMzY0NTEsNTAtNTcpLCgzNjQ1MiwzNS01MyksKDM2NDUyLDU0LTYyKSwoMzY0NTQsMzMtMzgpLCgzNjQ1NCw0MS01NCksKDM2NDU0LDU1LTYwKSwoMzY0NTUsMzUtNTMpLCgzNjQ1NSw1NC02MiksKDM2NDU3LDMzLTQ0KSwoMzY0NTcsNDUtNDkpLCgzNjQ1Nyw1MC01NiksKDM2NDU3LDYyLTgzKSwoMzY0NTcsODQtODgpLCgzNjQ1OCwzNS01MyksKDM2NDU4LDU0LTYyKSwoMzY0NjAsMzMtMzcpLCgzNjQ2MCwzOC00MiksKDM2NDYwLDQ3LTU3KSwoMzY0NjAsNTgtNjcpLCgzNjQ2MSwzNS01MyksKDM2NDYxLDU0LTYyKSwoMzY0NjMsMzQtMzgpLCgzNjQ2MywzOS00NSksKDM2NDYzLDQ2LTUxKSwoMzY0NjMsNTQtNjMpLCgzNjQ2Myw2NC03MSksKDM2NDYzLDc2LTgwKSwoMzY0NjMsODEtODcpLCgzNjQ2Myw4OC05MiksKDM2NDYzLDk3LTEwNyksKDM2NDYzLDEwOC0xMTkpLCgzNjQ2NCwzNS01MyksKDM2NDY0LDU0LTYyKSwoMzY0NjYsMzMtNzEpLCgzNjQ2Niw3Mi03NiksKDM2NDY3LDM1LTUzKSwoMzY0NjcsNTQtNjIpLCgzNjQ2OSwyNC0yOSksKDM2NDY5LDMzLTQ2KSwoMzY0NjksNDctNTQpLCgzNjQ3MCwyNC0zNSldXG5cdFx0c3RvcmUuc2V0UGFydGlhbChcblx0XHRcdG5ldyBSYW5nZSgzNjQ0MSwgMSwgMzY0NjksIDU2KSxcblx0XHRcdFtjcmVhdGVUb2tlbnMoJ1soMzY0NDIsMjUtMzUpLCgzNjQ0MiwzNi01MCksKDM2NDQzLDMwLTM5KSwoMzY0NDMsNDItNDYpLCgzNjQ0Myw0Ny01MyksKDM2NDQzLDU0LTU4KSwoMzY0NDMsNjMtNzMpLCgzNjQ0Myw3NC04NCksKDM2NDQzLDg3LTkxKSwoMzY0NDMsOTItOTgpLCgzNjQ0MywxMDEtMTA1KSwoMzY0NDMsMTA2LTExMiksKDM2NDQzLDExMy0xMTkpLCgzNjQ0NCwyOC0zNyksKDM2NDQ0LDM4LTQyKSwoMzY0NDQsNDctNTcpLCgzNjQ0NCw1OC03NSksKDM2NDQ0LDgwLTk1KSwoMzY0NDQsOTYtMTA1KSwoMzY0NDUsMzUtNTMpLCgzNjQ0NSw1NC02MiksKDM2NDQ4LDI0LTI5KSwoMzY0NDgsMzMtNDYpLCgzNjQ0OCw0Ny01NCksKDM2NDUwLDI1LTM1KSwoMzY0NTAsMzYtNTApLCgzNjQ1MSwyOC0zMyksKDM2NDUxLDM2LTQ5KSwoMzY0NTEsNTAtNTcpLCgzNjQ1MiwzNS01MyksKDM2NDUyLDU0LTYyKSwoMzY0NTQsMzMtMzgpLCgzNjQ1NCw0MS01NCksKDM2NDU0LDU1LTYwKSwoMzY0NTUsMzUtNTMpLCgzNjQ1NSw1NC02MiksKDM2NDU3LDMzLTQ0KSwoMzY0NTcsNDUtNDkpLCgzNjQ1Nyw1MC01NiksKDM2NDU3LDYyLTgzKSwoMzY0NTcsODQtODgpLCgzNjQ1OCwzNS01MyksKDM2NDU4LDU0LTYyKSwoMzY0NjAsMzMtMzcpLCgzNjQ2MCwzOC00MiksKDM2NDYwLDQ3LTU3KSwoMzY0NjAsNTgtNjcpLCgzNjQ2MSwzNS01MyksKDM2NDYxLDU0LTYyKSwoMzY0NjMsMzQtMzgpLCgzNjQ2MywzOS00NSksKDM2NDYzLDQ2LTUxKSwoMzY0NjMsNTQtNjMpLCgzNjQ2Myw2NC03MSksKDM2NDYzLDc2LTgwKSwoMzY0NjMsODEtODcpLCgzNjQ2Myw4OC05MiksKDM2NDYzLDk3LTEwNyksKDM2NDYzLDEwOC0xMTkpLCgzNjQ2NCwzNS01MyksKDM2NDY0LDU0LTYyKSwoMzY0NjYsMzMtNzEpLCgzNjQ2Niw3Mi03NiksKDM2NDY3LDM1LTUzKSwoMzY0NjcsNTQtNjIpLCgzNjQ2OSwyNC0yOSksKDM2NDY5LDMzLTQ2KSwoMzY0NjksNDctNTQpLCgzNjQ3MCwyNC0zNSldJyldXG5cdFx0KTtcblxuXHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBzdG9yZS5hZGRTcGFyc2VUb2tlbnMoMzY0NTEsIG5ldyBMaW5lVG9rZW5zKG5ldyBVaW50MzJBcnJheShbNjAsIDFdKSwgYCAgICAgICAgICAgICAgICAgICAgICAgIGlmIChmbGFncyAmIE1vZGlmaWVyRmxhZ3MuQW1iaWVudCkge2AsIGNvZGVjKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVUb2tlbnMuZ2V0Q291bnQoKSwgNyk7XG5cdH0pO1xuXG5cblx0dGVzdCgnaXNzdWUgIzk1OTQ5OiBJZGVudGlmaWVycyBhcmUgY29sb3JlZCBpbiBib2xkIHdoZW4gdGFyZ2V0dGluZyBrZXl3b3JkcycsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZVRNTWV0YWRhdGEoZm9yZWdyb3VuZDogbnVtYmVyLCBmb250U3R5bGU6IG51bWJlciwgbGFuZ3VhZ2VJZDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRcdHJldHVybiAoXG5cdFx0XHRcdChsYW5ndWFnZUlkIDw8IE1ldGFkYXRhQ29uc3RzLkxBTkdVQUdFSURfT0ZGU0VUKVxuXHRcdFx0XHR8IChmb250U3R5bGUgPDwgTWV0YWRhdGFDb25zdHMuRk9OVF9TVFlMRV9PRkZTRVQpXG5cdFx0XHRcdHwgKGZvcmVncm91bmQgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVQpXG5cdFx0XHQpID4+PiAwO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHRvQXJyKGxpbmVUb2tlbnM6IExpbmVUb2tlbnMpOiBudW1iZXJbXSB7XG5cdFx0XHRjb25zdCByOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lVG9rZW5zLmdldENvdW50KCk7IGkrKykge1xuXHRcdFx0XHRyLnB1c2gobGluZVRva2Vucy5nZXRFbmRPZmZzZXQoaSkpO1xuXHRcdFx0XHRyLnB1c2gobGluZVRva2Vucy5nZXRNZXRhZGF0YShpKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcjtcblx0XHR9XG5cblx0XHRjb25zdCBjb2RlYyA9IG5ldyBMYW5ndWFnZUlkQ29kZWMoKTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBTcGFyc2VUb2tlbnNTdG9yZShjb2RlYyk7XG5cblx0XHRzdG9yZS5zZXQoW1xuXHRcdFx0U3BhcnNlTXVsdGlsaW5lVG9rZW5zLmNyZWF0ZSgxLCBuZXcgVWludDMyQXJyYXkoW1xuXHRcdFx0XHQwLCA2LCAxMSwgKDEgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVQpIHwgTWV0YWRhdGFDb25zdHMuU0VNQU5USUNfVVNFX0ZPUkVHUk9VTkQsXG5cdFx0XHRdKSlcblx0XHRdLCB0cnVlKTtcblxuXHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBzdG9yZS5hZGRTcGFyc2VUb2tlbnMoMSwgbmV3IExpbmVUb2tlbnMobmV3IFVpbnQzMkFycmF5KFtcblx0XHRcdDUsIGNyZWF0ZVRNTWV0YWRhdGEoNSwgRm9udFN0eWxlLkJvbGQsIDUzKSxcblx0XHRcdDE0LCBjcmVhdGVUTU1ldGFkYXRhKDEsIEZvbnRTdHlsZS5Ob25lLCA1MyksXG5cdFx0XHQxNywgY3JlYXRlVE1NZXRhZGF0YSg2LCBGb250U3R5bGUuTm9uZSwgNTMpLFxuXHRcdFx0MTgsIGNyZWF0ZVRNTWV0YWRhdGEoMSwgRm9udFN0eWxlLk5vbmUsIDUzKSxcblx0XHRdKSwgYGNvbnN0IGhlbGxvID0gMTIzO2AsIGNvZGVjKSk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSB0b0FycihsaW5lVG9rZW5zKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgW1xuXHRcdFx0NSwgY3JlYXRlVE1NZXRhZGF0YSg1LCBGb250U3R5bGUuQm9sZCwgNTMpLFxuXHRcdFx0NiwgY3JlYXRlVE1NZXRhZGF0YSgxLCBGb250U3R5bGUuTm9uZSwgNTMpLFxuXHRcdFx0MTEsIGNyZWF0ZVRNTWV0YWRhdGEoMSwgRm9udFN0eWxlLk5vbmUsIDUzKSxcblx0XHRcdDE0LCBjcmVhdGVUTU1ldGFkYXRhKDEsIEZvbnRTdHlsZS5Ob25lLCA1MyksXG5cdFx0XHQxNywgY3JlYXRlVE1NZXRhZGF0YSg2LCBGb250U3R5bGUuTm9uZSwgNTMpLFxuXHRcdFx0MTgsIGNyZWF0ZVRNTWV0YWRhdGEoMSwgRm9udFN0eWxlLk5vbmUsIDUzKVxuXHRcdF0pO1xuXHR9KTtcblxuXG5cdHRlc3QoJ0JVRzogc2V0UGFydGlhbCB3aXRoIHN0YXJ0TGluZU51bWJlciA+IDEgYW5kIHRva2VuIHJlbW92YWwgY3JlYXRlcyBpbnZhbGlkIHN0YXRlJywgKCkgPT4ge1xuXHRcdC8qKlxuXHRcdCAqIFRoZSBidWcgaXMgdGhlIHNhbWUgcmVnYXJkbGVzcyBvZiB0aGUgc3RhcnRpbmcgbGluZSBudW1iZXIuXG5cdFx0ICogSWYgYSBwaWVjZSBzdGFydHMgYXQgbGluZSA1IGFuZCBhbGwgdG9rZW5zIGFyZSByZW1vdmVkIHZpYSBzZXRQYXJ0aWFsOlxuXHRcdCAqIC0gc3RhcnRMaW5lTnVtYmVyIHN0YXlzIGF0IDVcblx0XHQgKiAtIGVuZExpbmVOdW1iZXIgYmVjb21lcyA1ICsgKC0xKSA9IDRcblx0XHQgKi9cblx0XHRjb25zdCBjb2RlYyA9IG5ldyBMYW5ndWFnZUlkQ29kZWMoKTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBTcGFyc2VUb2tlbnNTdG9yZShjb2RlYyk7XG5cblx0XHQvLyBTZXQgaW5pdGlhbCB0b2tlbnMgb24gbGluZSA1XG5cdFx0c3RvcmUuc2V0KFtcblx0XHRcdFNwYXJzZU11bHRpbGluZVRva2Vucy5jcmVhdGUoNSwgbmV3IFVpbnQzMkFycmF5KFtcblx0XHRcdFx0MCwgNSwgMTAsIDEsICAvLyBsaW5lIDUsIGNoYXJzIDUtMTBcblx0XHRcdF0pKVxuXHRcdF0sIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5pc0VtcHR5KCksIGZhbHNlKTtcblxuXHRcdC8vIFJlbW92ZSBhbGwgdG9rZW5zIHZpYSBzZXRQYXJ0aWFsXG5cdFx0c3RvcmUuc2V0UGFydGlhbChuZXcgUmFuZ2UoNSwgMSwgNSwgMjApLCBbXSk7XG5cblx0XHQvLyBCVUc6IER1cmluZyBwcm9jZXNzaW5nLCBwaWVjZXMgY2FuIGhhdmUgaW52YWxpZCBsaW5lIG51bWJlcnNcblx0XHQvLyBUaGUgc3RvcmUgc2hvdWxkIHJlbW92ZSBlbXB0eSBwaWVjZXMgYW5kIHJlbWFpbiB2YWxpZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5pc0VtcHR5KCksIHRydWUsXG5cdFx0XHQnU3RvcmUgc2hvdWxkIGJlIGVtcHR5IGFmdGVyIHNldFBhcnRpYWwgcmVtb3ZlcyBhbGwgdG9rZW5zJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0JVRzogc2V0UGFydGlhbCB3aXRoIHNwbGl0IHRoYXQgY3JlYXRlcyBlbXB0eSBmaXJzdCBwaWVjZSB3aXRoIGludmFsaWQgbGluZSBudW1iZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvZGVjID0gbmV3IExhbmd1YWdlSWRDb2RlYygpO1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFNwYXJzZVRva2Vuc1N0b3JlKGNvZGVjKTtcblxuXHRcdC8vIFNldCBpbml0aWFsIHRva2VucyAtIHRva2VuIGlzIG9uIGxpbmUgMTFcblx0XHRzdG9yZS5zZXQoW1xuXHRcdFx0U3BhcnNlTXVsdGlsaW5lVG9rZW5zLmNyZWF0ZSgxLCBuZXcgVWludDMyQXJyYXkoW1xuXHRcdFx0XHQxMCwgNSwgMTAsIDEsICAvLyBsaW5lIDExIChkZWx0YUxpbmU9MTAgZnJvbSBzdGFydExpbmVOdW1iZXI9MSksIGNoYXJzIDUtMTBcblx0XHRcdF0pKVxuXHRcdF0sIGZhbHNlKTtcblxuXHRcdC8vIHNldFBhcnRpYWwgd2l0aCBhIHJhbmdlIFsxLDEgLT4gNSwxXSB0aGF0IHdpbGwgY2F1c2UgYSBzcGxpdCB3aGVyZSB0aGUgZmlyc3QgcGllY2UgaXMgZW1wdHlcblx0XHRzdG9yZS5zZXRQYXJ0aWFsKG5ldyBSYW5nZSgxLCAxLCA1LCAxKSwgW10pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLmlzRW1wdHkoKSwgZmFsc2UsICdTdG9yZSBzaG91bGQgc3RpbGwgaGF2ZSB0aGUgdG9rZW4gb24gbGluZSAxMScpO1xuXG5cdFx0Ly8gVGhlIHRva2VuIGF0IGxpbmUgMTEgc2hvdWxkIGJlIHJldHJpZXZhYmxlIGFmdGVyIHRoZSBzcGxpdFxuXHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBzdG9yZS5hZGRTcGFyc2VUb2tlbnMoMTEsIG5ldyBMaW5lVG9rZW5zKG5ldyBVaW50MzJBcnJheShbMjIsIDFdKSwgYCAgICB0ZXN0IGxpbmUgdGV4dCAgICBgLCBjb2RlYykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lVG9rZW5zLmdldENvdW50KCksIDMsICdTaG91bGQgaGF2ZSAzIHRva2VuczogYmFzZSB0b2tlbiBzdGFydCArIHNlbWFudGljIHRva2VuIGZyb20gbGluZSAxMSArIGJhc2UgdG9rZW4gZW5kJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVUb2tlbnMuZ2V0U3RhcnRPZmZzZXQoMSksIDUsICdTZW1hbnRpYyB0b2tlbiBzaG91bGQgc3RhcnQgYXQgb2Zmc2V0IDUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZVRva2Vucy5nZXRFbmRPZmZzZXQoMSksIDEwLCAnU2VtYW50aWMgdG9rZW4gc2hvdWxkIGVuZCBhdCBvZmZzZXQgMTAnKTtcblx0fSk7XG5cblx0dGVzdCgnYWRkU3BhcnNlVG9rZW5zIHNraXBzIG92ZXJsYXBwaW5nIHNlbWFudGljIHRva2VucyB0aGF0IHByb2R1Y2UgYmFja3dhcmQgZW5kT2Zmc2V0cycsICgpID0+IHtcblx0XHQvLyBUaGlzIHRlc3QgcmVwcm9kdWNlcyBhIHJlbmRlcmluZyBnbGl0Y2ggd2hlcmUgY2hhcmFjdGVycyBhcmUgZHVwbGljYXRlZCBpbiB0aGUgRE9NLlxuXHRcdC8vIFdoZW4gdHlwaW5nIGF0IGEgc2VtYW50aWMgdG9rZW4gYm91bmRhcnksIGBhY2NlcHRJbnNlcnRUZXh0YCBjYW4gZXhwYW5kIGEgdG9rZW5cblx0XHQvLyBhbmQgY3JlYXRlIG92ZXJsYXBwaW5nIHJhbmdlcyAoZS5nLiwgdG9rZW4gJysnIGF0ICgzLDUpIGFuZCB0b2tlbiAnMicgYXQgKDQsNSkpLlxuXHRcdC8vIFRoZSBtZXJnZSBpbiBgYWRkU3BhcnNlVG9rZW5zYCBtdXN0IG5vdCBwcm9kdWNlIGJhY2t3YXJkIGVuZE9mZnNldCBzZXF1ZW5jZXMsXG5cdFx0Ly8gb3RoZXJ3aXNlIGBMaW5lVG9rZW5zLndpdGhJbnNlcnRlZGAgcmUtY29waWVzIGNoYXJhY3RlcnMgY2F1c2luZyBkdXBsaWNhdGlvbi5cblx0XHRjb25zdCBjb2RlYyA9IG5ldyBMYW5ndWFnZUlkQ29kZWMoKTtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBTcGFyc2VUb2tlbnNTdG9yZShjb2RlYyk7XG5cblx0XHQvLyBTaW11bGF0ZSBvdmVybGFwcGluZyBzZW1hbnRpYyB0b2tlbnMgYWZ0ZXIgYW4gZWRpdDpcblx0XHQvLyBPcmlnaW5hbDogZj0xKzIgd2l0aCB0b2tlbnMgYXQgKDAsMSksICgxLDIpLCAoMiwzKSwgKDMsNCksICg0LDUpXG5cdFx0Ly8gQWZ0ZXIgaW5zZXJ0aW5nICdhJyBhdCBvZmZzZXQgNDogdG9rZW4gKDMsNCkgZXhwYW5kcyB0byAoMyw1KSwgdG9rZW4gKDQsNSkgc3RheXNcblx0XHQvLyBUaGlzIGNyZWF0ZXMgb3ZlcmxhcDogKDMsNSkgYW5kICg0LDUpXG5cdFx0Y29uc3Qgc2VtYW50aWNNZXRhMSA9ICgxIDw8IE1ldGFkYXRhQ29uc3RzLkZPUkVHUk9VTkRfT0ZGU0VUKSB8IE1ldGFkYXRhQ29uc3RzLlNFTUFOVElDX1VTRV9GT1JFR1JPVU5EO1xuXHRcdGNvbnN0IHNlbWFudGljTWV0YTIgPSAoMiA8PCBNZXRhZGF0YUNvbnN0cy5GT1JFR1JPVU5EX09GRlNFVCkgfCBNZXRhZGF0YUNvbnN0cy5TRU1BTlRJQ19VU0VfRk9SRUdST1VORDtcblx0XHRzdG9yZS5zZXQoW1xuXHRcdFx0U3BhcnNlTXVsdGlsaW5lVG9rZW5zLmNyZWF0ZSgxLCBuZXcgVWludDMyQXJyYXkoW1xuXHRcdFx0XHQvLyBkZWx0YUxpbmUsIHN0YXJ0Q2hhciwgZW5kQ2hhciwgbWV0YWRhdGFcblx0XHRcdFx0MCwgMCwgMSwgc2VtYW50aWNNZXRhMSwgIC8vICdmJyBhdCAoMCwxKVxuXHRcdFx0XHQwLCAxLCAyLCBzZW1hbnRpY01ldGEyLCAgLy8gJz0nIGF0ICgxLDIpXG5cdFx0XHRcdDAsIDIsIDMsIHNlbWFudGljTWV0YTEsICAvLyAnMScgYXQgKDIsMylcblx0XHRcdFx0MCwgMywgNSwgc2VtYW50aWNNZXRhMiwgIC8vICcrYScgYXQgKDMsNSkgLSBleHBhbmRlZCBhZnRlciBlZGl0XG5cdFx0XHRcdDAsIDQsIDUsIHNlbWFudGljTWV0YTEsICAvLyBvdmVybGFwcGluZzogJ2EnIGF0ICg0LDUpIC0gc3RhbGUgcG9zaXRpb25cblx0XHRcdF0pKVxuXHRcdF0sIHRydWUpO1xuXG5cdFx0Y29uc3QgdG1NZXRhID0gKDMgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVQpID4+PiAwO1xuXHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBzdG9yZS5hZGRTcGFyc2VUb2tlbnMoMSwgbmV3IExpbmVUb2tlbnMobmV3IFVpbnQzMkFycmF5KFtcblx0XHRcdDYsIHRtTWV0YSwgLy8gZW50aXJlIGxpbmUgXCJmPTErYTJcIiBjb3ZlcmVkIGJ5IG9uZSBUTSB0b2tlblxuXHRcdF0pLCBgZj0xK2EyYCwgY29kZWMpKTtcblxuXHRcdC8vIFZlcmlmeSBlbmRPZmZzZXRzIGFyZSBtb25vdG9uaWNhbGx5IGluY3JlYXNpbmcgKG5vIGJhY2t3YXJkIHNlcXVlbmNlcylcblx0XHRjb25zdCBlbmRPZmZzZXRzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGluZVRva2Vucy5nZXRDb3VudCgpOyBpKyspIHtcblx0XHRcdGVuZE9mZnNldHMucHVzaChsaW5lVG9rZW5zLmdldEVuZE9mZnNldChpKSk7XG5cdFx0fVxuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgZW5kT2Zmc2V0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0YXNzZXJ0Lm9rKGVuZE9mZnNldHNbaV0gPiBlbmRPZmZzZXRzW2kgLSAxXSxcblx0XHRcdFx0YGVuZE9mZnNldFske2l9XT0ke2VuZE9mZnNldHNbaV19IHNob3VsZCBiZSA+IGVuZE9mZnNldFske2kgLSAxfV09JHtlbmRPZmZzZXRzW2kgLSAxXX1gKTtcblx0XHR9XG5cblx0XHQvLyBXaGVuIHVzZWQgd2l0aCBpbmplY3RlZCB0ZXh0LCB0aGUgcmVzdWx0aW5nIExpbmVUb2tlbnMgbXVzdCBub3QgZHVwbGljYXRlIGNoYXJhY3RlcnMuXG5cdFx0Ly8gU2ltdWxhdGUgaW5qZWN0ZWQgdGV4dCBcIiAgXCIgYXQgb2Zmc2V0IDAgKGxpa2UgdGhlIHJlcHJvJ3MgYGJlZm9yZTogeyBjb250ZW50OiBcIiAgXCIgfWApXG5cdFx0Y29uc3Qgd2l0aEluamVjdGVkID0gbGluZVRva2Vucy53aXRoSW5zZXJ0ZWQoW3sgb2Zmc2V0OiAwLCB0ZXh0OiAnICAnLCB0b2tlbk1ldGFkYXRhOiBMaW5lVG9rZW5zLmRlZmF1bHRUb2tlbk1ldGFkYXRhIH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2l0aEluamVjdGVkLmdldExpbmVDb250ZW50KCksICcgIGY9MSthMicsXG5cdFx0XHQnd2l0aEluc2VydGVkIG11c3Qgbm90IGR1cGxpY2F0ZSBjaGFyYWN0ZXJzIHdoZW4gc2VtYW50aWMgdG9rZW5zIG92ZXJsYXAnKTtcblx0fSk7XG5cblx0dGVzdCgncGllY2Ugd2l0aCBzdGFydExpbmVOdW1iZXIgMCBhbmQgZW5kTGluZU51bWJlciAtMSBhZnRlciBlbmNvbXBhc3NpbmcgZGVsZXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29kZWMgPSBuZXcgTGFuZ3VhZ2VJZENvZGVjKCk7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgU3BhcnNlVG9rZW5zU3RvcmUoY29kZWMpO1xuXG5cdFx0Ly8gU2V0IGluaXRpYWwgdG9rZW5zIG9uIGxpbmVzIDUtMTBcblx0XHRjb25zdCBwaWVjZSA9IFNwYXJzZU11bHRpbGluZVRva2Vucy5jcmVhdGUoNSwgbmV3IFVpbnQzMkFycmF5KFtcblx0XHRcdDAsIDAsIDUsIDEsICAvLyBsaW5lIDUsIGNoYXJzIDAtNVxuXHRcdFx0NSwgMCwgNSwgMiwgIC8vIGxpbmUgMTAsIGNoYXJzIDAtNVxuXHRcdF0pKTtcblxuXHRcdHN0b3JlLnNldChbcGllY2VdLCBmYWxzZSk7XG5cblx0XHQvLyBWZXJpZnkgaW5pdGlhbCBzdGF0ZVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZS5zdGFydExpbmVOdW1iZXIsIDUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWVjZS5lbmRMaW5lTnVtYmVyLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpZWNlLmlzRW1wdHkoKSwgZmFsc2UpO1xuXG5cdFx0Ly8gUGVyZm9ybSBhbiBlZGl0IHRoYXQgY29tcGxldGVseSBlbmNvbXBhc3NlcyB0aGUgdG9rZW4gcmFuZ2Vcblx0XHQvLyBEZWxldGUgZnJvbSBsaW5lIDEgdG8gbGluZSAyMCAoZW5jb21wYXNzZXMgbGluZXMgNS0xMClcblx0XHQvLyBUaGlzIHRyaWdnZXJzIHRoZSBjYXNlIGluIF9hY2NlcHREZWxldGVSYW5nZSB3aGVyZTpcblx0XHQvLyBpZiAoZmlyc3RMaW5lSW5kZXggPCAwICYmIGxhc3RMaW5lSW5kZXggPj0gdG9rZW5NYXhEZWx0YUxpbmUgKyAxKVxuXHRcdC8vIFdoaWNoIHNldHMgdGhpcy5fc3RhcnRMaW5lTnVtYmVyID0gMCBhbmQgY2FsbHMgdGhpcy5fdG9rZW5zLmNsZWFyKClcblx0XHRzdG9yZS5hY2NlcHRFZGl0KFxuXHRcdFx0eyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAyMCwgZW5kQ29sdW1uOiAxIH0sXG5cdFx0XHQwLCAvLyBlb2xDb3VudCAtIG5vIG5ldyBsaW5lcyBpbnNlcnRlZFxuXHRcdFx0MCwgLy8gZmlyc3RMaW5lTGVuZ3RoXG5cdFx0XHQwLCAvLyBsYXN0TGluZUxlbmd0aFxuXHRcdFx0MCAgLy8gZmlyc3RDaGFyQ29kZVxuXHRcdCk7XG5cblx0XHQvLyBBZnRlciBhbiBlbmNvbXBhc3NpbmcgZGVsZXRpb24sIHRoZSBwaWVjZSBzaG91bGQgYmUgZW1wdHlcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGllY2UuaXNFbXB0eSgpLCB0cnVlLCAnUGllY2Ugc2hvdWxkIGJlIGVtcHR5IGFmdGVyIGVuY29tcGFzc2luZyBkZWxldGlvbicpO1xuXG5cdFx0Ly8gRVhQRUNURUQgQkVIQVZJT1I6IFRoZSBzdG9yZSBzaG91bGQgYmUgZW1wdHkgKG5vIHBpZWNlcyB3aXRoIGludmFsaWQgbGluZSBudW1iZXJzKVxuXHRcdC8vIEN1cnJlbnRseSBmYWlscyBiZWNhdXNlIHRoZSBwaWVjZSByZW1haW5zIHdpdGggc3RhcnRMaW5lTnVtYmVyPTAsIGVuZExpbmVOdW1iZXI9LTFcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUuaXNFbXB0eSgpLCB0cnVlLCAnU3RvcmUgc2hvdWxkIGJlIGVtcHR5IGFmdGVyIGFsbCB0b2tlbnMgYXJlIGRlbGV0ZWQgYnkgZW5jb21wYXNzaW5nIGVkaXQnKTtcblx0fSk7XG59KTtcblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUN0QixTQUFrQixXQUFXLGdC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LHNCQUF1QjtBQUMzRCxVQUFNLGFBQWEsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLFdBQVcsSUFBSSxZQUFZO0FBQUEsTUFDMUU7QUFBQSxNQUFHO0FBQUE7QUFBQSxJQUNKLENBQUMsR0FBRyxVQUFVLEtBQUssQ0FBQztBQUdwQixVQUFNLGFBQXVCLENBQUM7QUFDOUIsYUFBUyxJQUFJLEdBQUcsSUFBSSxXQUFXLFNBQVMsR0FBRyxLQUFLO0FBQy9DLGlCQUFXLEtBQUssV0FBVyxhQUFhLENBQUMsQ0FBQztBQUFBLElBQzNDO0FBQ0EsYUFBUyxJQUFJLEdBQUcsSUFBSSxXQUFXLFFBQVEsS0FBSztBQUMzQyxhQUFPO0FBQUEsUUFBRyxXQUFXLENBQUMsSUFBSSxXQUFXLElBQUksQ0FBQztBQUFBLFFBQ3pDLGFBQWEsQ0FBQyxLQUFLLFdBQVcsQ0FBQyxDQUFDLDBCQUEwQixJQUFJLENBQUMsS0FBSyxXQUFXLElBQUksQ0FBQyxDQUFDO0FBQUEsTUFBRTtBQUFBLElBQ3pGO0FBSUEsVUFBTSxlQUFlLFdBQVcsYUFBYSxDQUFDLEVBQUUsUUFBUSxHQUFHLE1BQU0sTUFBTSxlQUFlLFdBQVcscUJBQXFCLENBQUMsQ0FBQztBQUN4SCxXQUFPO0FBQUEsTUFBWSxhQUFhLGVBQWU7QUFBQSxNQUFHO0FBQUEsTUFDakQ7QUFBQSxJQUF5RTtBQUFBLEVBQzNFLENBQUM7QUFFRCxPQUFLLGlGQUFpRixNQUFNO0FBQzNGLFVBQU0sUUFBUSxJQUFJLGdCQUFnQjtBQUNsQyxVQUFNLFFBQVEsSUFBSSxrQkFBa0IsS0FBSztBQUd6QyxVQUFNLFFBQVEsc0JBQXNCLE9BQU8sR0FBRyxJQUFJLFlBQVk7QUFBQSxNQUM3RDtBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBO0FBQUEsTUFDVDtBQUFBLE1BQUc7QUFBQSxNQUFHO0FBQUEsTUFBRztBQUFBO0FBQUEsSUFDVixDQUFDLENBQUM7QUFFRixVQUFNLElBQUksQ0FBQyxLQUFLLEdBQUcsS0FBSztBQUd4QixXQUFPLFlBQVksTUFBTSxpQkFBaUIsQ0FBQztBQUMzQyxXQUFPLFlBQVksTUFBTSxlQUFlLEVBQUU7QUFDMUMsV0FBTyxZQUFZLE1BQU0sUUFBUSxHQUFHLEtBQUs7QUFPekMsVUFBTTtBQUFBLE1BQ0wsRUFBRSxpQkFBaUIsR0FBRyxhQUFhLEdBQUcsZUFBZSxJQUFJLFdBQVcsRUFBRTtBQUFBLE1BQ3RFO0FBQUE7QUFBQSxNQUNBO0FBQUE7QUFBQSxNQUNBO0FBQUE7QUFBQSxNQUNBO0FBQUE7QUFBQSxJQUNEO0FBR0EsV0FBTyxZQUFZLE1BQU0sUUFBUSxHQUFHLE1BQU0sbURBQW1EO0FBSTdGLFdBQU8sWUFBWSxNQUFNLFFBQVEsR0FBRyxNQUFNLHlFQUF5RTtBQUFBLEVBQ3BILENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJsaW5lVG9rZW5zIl0KfQo=
