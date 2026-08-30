import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Range } from "../../../common/core/range.js";
import { MetadataConsts } from "../../../common/encodedTokenAttributes.js";
import { EncodedTokenizationResult, TokenizationRegistry } from "../../../common/languages.js";
import { computeIndentLevel } from "../../../common/model/utils.js";
import { ContiguousMultilineTokensBuilder } from "../../../common/tokens/contiguousMultilineTokensBuilder.js";
import { LineTokens } from "../../../common/tokens/lineTokens.js";
import { TestLineTokenFactory } from "../core/testLineToken.js";
import { createTextModel } from "../testTextModel.js";
function assertLineTokens(__actual, _expected) {
  const tmp = TestToken.toTokens(_expected);
  LineTokens.convertToEndOffset(tmp, __actual.getLineContent().length);
  const expected = TestLineTokenFactory.inflateArr(tmp);
  const _actual = __actual.inflate();
  const actual = [];
  for (let i = 0, len = _actual.getCount(); i < len; i++) {
    actual[i] = {
      endIndex: _actual.getEndOffset(i),
      type: _actual.getClassName(i)
    };
  }
  const decode = (token) => {
    return {
      endIndex: token.endIndex,
      type: token.getType()
    };
  };
  assert.deepStrictEqual(actual, expected.map(decode));
}
suite("ModelLine - getIndentLevel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function assertIndentLevel(text, expected, tabSize = 4) {
    const actual = computeIndentLevel(text, tabSize);
    assert.strictEqual(actual, expected, text);
  }
  test("getIndentLevel", () => {
    assertIndentLevel("", -1);
    assertIndentLevel(" ", -1);
    assertIndentLevel("   	", -1);
    assertIndentLevel("Hello", 0);
    assertIndentLevel(" Hello", 1);
    assertIndentLevel("   Hello", 3);
    assertIndentLevel("	Hello", 4);
    assertIndentLevel(" 	Hello", 4);
    assertIndentLevel("  	Hello", 4);
    assertIndentLevel("   	Hello", 4);
    assertIndentLevel("    	Hello", 8);
    assertIndentLevel("     	Hello", 8);
    assertIndentLevel("	 Hello", 5);
    assertIndentLevel("	 	Hello", 8);
  });
});
class TestToken {
  constructor(startOffset, color) {
    this.startOffset = startOffset;
    this.color = color;
  }
  static toTokens(tokens) {
    if (tokens === null) {
      return null;
    }
    const tokensLen = tokens.length;
    const result = new Uint32Array(tokensLen << 1);
    for (let i = 0; i < tokensLen; i++) {
      const token = tokens[i];
      result[i << 1] = token.startOffset;
      result[(i << 1) + 1] = token.color << MetadataConsts.FOREGROUND_OFFSET >>> 0;
    }
    return result;
  }
}
class ManualTokenizationSupport {
  constructor() {
    this.tokens = /* @__PURE__ */ new Map();
    this.stores = /* @__PURE__ */ new Set();
  }
  setLineTokens(lineNumber, tokens) {
    const b = new ContiguousMultilineTokensBuilder();
    b.add(lineNumber, tokens);
    for (const s of this.stores) {
      s.setTokens(b.finalize());
    }
  }
  getInitialState() {
    return new LineState(1);
  }
  tokenize(line, hasEOL, state) {
    throw new Error();
  }
  tokenizeEncoded(line, hasEOL, state) {
    const s = state;
    return new EncodedTokenizationResult(this.tokens.get(s.lineNumber), [], new LineState(s.lineNumber + 1));
  }
  /**
   * Can be/return undefined if default background tokenization should be used.
   */
  createBackgroundTokenizer(textModel, store) {
    this.stores.add(store);
    return {
      dispose: () => {
        this.stores.delete(store);
      },
      requestTokens(startLineNumber, endLineNumberExclusive) {
      }
    };
  }
}
class LineState {
  constructor(lineNumber) {
    this.lineNumber = lineNumber;
  }
  clone() {
    return this;
  }
  equals(other) {
    return other.lineNumber === this.lineNumber;
  }
}
suite("ModelLinesTokens", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function testApplyEdits(initial, edits, expected) {
    const initialText = initial.map((el) => el.text).join("\n");
    const s = new ManualTokenizationSupport();
    const d = TokenizationRegistry.register("test", s);
    const model = createTextModel(initialText, "test");
    model.onBeforeAttached();
    for (let lineIndex = 0; lineIndex < initial.length; lineIndex++) {
      const lineTokens = initial[lineIndex].tokens;
      const lineTextLength = model.getLineMaxColumn(lineIndex + 1) - 1;
      const tokens = TestToken.toTokens(lineTokens);
      LineTokens.convertToEndOffset(tokens, lineTextLength);
      s.setLineTokens(lineIndex + 1, tokens);
    }
    model.applyEdits(edits.map((ed) => ({
      identifier: null,
      range: ed.range,
      text: ed.text,
      forceMoveMarkers: false
    })));
    for (let lineIndex = 0; lineIndex < expected.length; lineIndex++) {
      const actualLine = model.getLineContent(lineIndex + 1);
      const actualTokens = model.tokenization.getLineTokens(lineIndex + 1);
      assert.strictEqual(actualLine, expected[lineIndex].text);
      assertLineTokens(actualTokens, expected[lineIndex].tokens);
    }
    model.dispose();
    d.dispose();
  }
  test("single delete 1", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 1, 1, 2), text: "" }],
      [{
        text: "ello world",
        tokens: [new TestToken(0, 1), new TestToken(4, 2), new TestToken(5, 3)]
      }]
    );
  });
  test("single delete 2", () => {
    testApplyEdits(
      [{
        text: "helloworld",
        tokens: [new TestToken(0, 1), new TestToken(5, 2)]
      }],
      [{ range: new Range(1, 3, 1, 8), text: "" }],
      [{
        text: "herld",
        tokens: [new TestToken(0, 1), new TestToken(2, 2)]
      }]
    );
  });
  test("single delete 3", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 1, 1, 6), text: "" }],
      [{
        text: " world",
        tokens: [new TestToken(0, 2), new TestToken(1, 3)]
      }]
    );
  });
  test("single delete 4", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 2, 1, 7), text: "" }],
      [{
        text: "hworld",
        tokens: [new TestToken(0, 1), new TestToken(1, 3)]
      }]
    );
  });
  test("single delete 5", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 1, 1, 12), text: "" }],
      [{
        text: "",
        tokens: [new TestToken(0, 1)]
      }]
    );
  });
  test("multi delete 6", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }, {
        text: "hello world",
        tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
      }, {
        text: "hello world",
        tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)]
      }],
      [{ range: new Range(1, 6, 3, 6), text: "" }],
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 8), new TestToken(6, 9)]
      }]
    );
  });
  test("multi delete 7", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }, {
        text: "hello world",
        tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
      }, {
        text: "hello world",
        tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)]
      }],
      [{ range: new Range(1, 12, 3, 12), text: "" }],
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }]
    );
  });
  test("multi delete 8", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }, {
        text: "hello world",
        tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
      }, {
        text: "hello world",
        tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)]
      }],
      [{ range: new Range(1, 1, 3, 1), text: "" }],
      [{
        text: "hello world",
        tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)]
      }]
    );
  });
  test("multi delete 9", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }, {
        text: "hello world",
        tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
      }, {
        text: "hello world",
        tokens: [new TestToken(0, 7), new TestToken(5, 8), new TestToken(6, 9)]
      }],
      [{ range: new Range(1, 12, 3, 1), text: "" }],
      [{
        text: "hello worldhello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3), new TestToken(11, 7), new TestToken(16, 8), new TestToken(17, 9)]
      }]
    );
  });
  test("single insert 1", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 1, 1, 1), text: "xx" }],
      [{
        text: "xxhello world",
        tokens: [new TestToken(0, 1), new TestToken(7, 2), new TestToken(8, 3)]
      }]
    );
  });
  test("single insert 2", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 2, 1, 2), text: "xx" }],
      [{
        text: "hxxello world",
        tokens: [new TestToken(0, 1), new TestToken(7, 2), new TestToken(8, 3)]
      }]
    );
  });
  test("single insert 3", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 6, 1, 6), text: "xx" }],
      [{
        text: "helloxx world",
        tokens: [new TestToken(0, 1), new TestToken(7, 2), new TestToken(8, 3)]
      }]
    );
  });
  test("single insert 4", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 7, 1, 7), text: "xx" }],
      [{
        text: "hello xxworld",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(8, 3)]
      }]
    );
  });
  test("single insert 5", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 12, 1, 12), text: "xx" }],
      [{
        text: "hello worldxx",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }]
    );
  });
  test("multi insert 6", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 1, 1, 1), text: "\n" }],
      [{
        text: "",
        tokens: [new TestToken(0, 1)]
      }, {
        text: "hello world",
        tokens: [new TestToken(0, 1)]
      }]
    );
  });
  test("multi insert 7", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 12, 1, 12), text: "\n" }],
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }, {
        text: "",
        tokens: [new TestToken(0, 1)]
      }]
    );
  });
  test("multi insert 8", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }],
      [{ range: new Range(1, 7, 1, 7), text: "\n" }],
      [{
        text: "hello ",
        tokens: [new TestToken(0, 1), new TestToken(5, 2)]
      }, {
        text: "world",
        tokens: [new TestToken(0, 1)]
      }]
    );
  });
  test("multi insert 9", () => {
    testApplyEdits(
      [{
        text: "hello world",
        tokens: [new TestToken(0, 1), new TestToken(5, 2), new TestToken(6, 3)]
      }, {
        text: "hello world",
        tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
      }],
      [{ range: new Range(1, 7, 1, 7), text: "xx\nyy" }],
      [{
        text: "hello xx",
        tokens: [new TestToken(0, 1), new TestToken(5, 2)]
      }, {
        text: "yyworld",
        tokens: [new TestToken(0, 1)]
      }, {
        text: "hello world",
        tokens: [new TestToken(0, 4), new TestToken(5, 5), new TestToken(6, 6)]
      }]
    );
  });
  function testLineEditTokens(initialText, initialTokens, edits, expectedText, expectedTokens) {
    testApplyEdits(
      [{
        text: initialText,
        tokens: initialTokens
      }],
      edits.map((ed) => ({
        range: new Range(1, ed.startColumn, 1, ed.endColumn),
        text: ed.text
      })),
      [{
        text: expectedText,
        tokens: expectedTokens
      }]
    );
  }
  test("insertion on empty line", () => {
    const s = new ManualTokenizationSupport();
    const d = TokenizationRegistry.register("test", s);
    const model = createTextModel("some text", "test");
    const tokens = TestToken.toTokens([new TestToken(0, 1)]);
    LineTokens.convertToEndOffset(tokens, model.getLineMaxColumn(1) - 1);
    s.setLineTokens(1, tokens);
    model.applyEdits([{
      range: new Range(1, 1, 1, 10),
      text: ""
    }]);
    s.setLineTokens(1, new Uint32Array(0));
    model.applyEdits([{
      range: new Range(1, 1, 1, 1),
      text: "a"
    }]);
    const actualTokens = model.tokenization.getLineTokens(1);
    assertLineTokens(actualTokens, [new TestToken(0, 1)]);
    model.dispose();
    d.dispose();
  });
  test("updates tokens on insertion 1", () => {
    testLineEditTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      [{
        startColumn: 1,
        endColumn: 1,
        text: "a"
      }],
      "aabcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(5, 2),
        new TestToken(6, 3)
      ]
    );
  });
  test("updates tokens on insertion 2", () => {
    testLineEditTokens(
      "aabcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(5, 2),
        new TestToken(6, 3)
      ],
      [{
        startColumn: 2,
        endColumn: 2,
        text: "x"
      }],
      "axabcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(6, 2),
        new TestToken(7, 3)
      ]
    );
  });
  test("updates tokens on insertion 3", () => {
    testLineEditTokens(
      "axabcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(6, 2),
        new TestToken(7, 3)
      ],
      [{
        startColumn: 3,
        endColumn: 3,
        text: "stu"
      }],
      "axstuabcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(9, 2),
        new TestToken(10, 3)
      ]
    );
  });
  test("updates tokens on insertion 4", () => {
    testLineEditTokens(
      "axstuabcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(9, 2),
        new TestToken(10, 3)
      ],
      [{
        startColumn: 10,
        endColumn: 10,
        text: "	"
      }],
      "axstuabcd	 efgh",
      [
        new TestToken(0, 1),
        new TestToken(10, 2),
        new TestToken(11, 3)
      ]
    );
  });
  test("updates tokens on insertion 5", () => {
    testLineEditTokens(
      "axstuabcd	 efgh",
      [
        new TestToken(0, 1),
        new TestToken(10, 2),
        new TestToken(11, 3)
      ],
      [{
        startColumn: 12,
        endColumn: 12,
        text: "dd"
      }],
      "axstuabcd	 ddefgh",
      [
        new TestToken(0, 1),
        new TestToken(10, 2),
        new TestToken(13, 3)
      ]
    );
  });
  test("updates tokens on insertion 6", () => {
    testLineEditTokens(
      "axstuabcd	 ddefgh",
      [
        new TestToken(0, 1),
        new TestToken(10, 2),
        new TestToken(13, 3)
      ],
      [{
        startColumn: 18,
        endColumn: 18,
        text: "xyz"
      }],
      "axstuabcd	 ddefghxyz",
      [
        new TestToken(0, 1),
        new TestToken(10, 2),
        new TestToken(13, 3)
      ]
    );
  });
  test("updates tokens on insertion 7", () => {
    testLineEditTokens(
      "axstuabcd	 ddefghxyz",
      [
        new TestToken(0, 1),
        new TestToken(10, 2),
        new TestToken(13, 3)
      ],
      [{
        startColumn: 1,
        endColumn: 1,
        text: "x"
      }],
      "xaxstuabcd	 ddefghxyz",
      [
        new TestToken(0, 1),
        new TestToken(11, 2),
        new TestToken(14, 3)
      ]
    );
  });
  test("updates tokens on insertion 8", () => {
    testLineEditTokens(
      "xaxstuabcd	 ddefghxyz",
      [
        new TestToken(0, 1),
        new TestToken(11, 2),
        new TestToken(14, 3)
      ],
      [{
        startColumn: 22,
        endColumn: 22,
        text: "x"
      }],
      "xaxstuabcd	 ddefghxyzx",
      [
        new TestToken(0, 1),
        new TestToken(11, 2),
        new TestToken(14, 3)
      ]
    );
  });
  test("updates tokens on insertion 9", () => {
    testLineEditTokens(
      "xaxstuabcd	 ddefghxyzx",
      [
        new TestToken(0, 1),
        new TestToken(11, 2),
        new TestToken(14, 3)
      ],
      [{
        startColumn: 2,
        endColumn: 2,
        text: ""
      }],
      "xaxstuabcd	 ddefghxyzx",
      [
        new TestToken(0, 1),
        new TestToken(11, 2),
        new TestToken(14, 3)
      ]
    );
  });
  test("updates tokens on insertion 10", () => {
    testLineEditTokens(
      "",
      [],
      [{
        startColumn: 1,
        endColumn: 1,
        text: "a"
      }],
      "a",
      [
        new TestToken(0, 1)
      ]
    );
  });
  test("delete second token 2", () => {
    testLineEditTokens(
      "abcdefghij",
      [
        new TestToken(0, 1),
        new TestToken(3, 2),
        new TestToken(6, 3)
      ],
      [{
        startColumn: 4,
        endColumn: 7,
        text: ""
      }],
      "abcghij",
      [
        new TestToken(0, 1),
        new TestToken(3, 3)
      ]
    );
  });
  test("insert right before second token", () => {
    testLineEditTokens(
      "abcdefghij",
      [
        new TestToken(0, 1),
        new TestToken(3, 2),
        new TestToken(6, 3)
      ],
      [{
        startColumn: 4,
        endColumn: 4,
        text: "hello"
      }],
      "abchellodefghij",
      [
        new TestToken(0, 1),
        new TestToken(8, 2),
        new TestToken(11, 3)
      ]
    );
  });
  test("delete first char", () => {
    testLineEditTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      [{
        startColumn: 1,
        endColumn: 2,
        text: ""
      }],
      "bcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(3, 2),
        new TestToken(4, 3)
      ]
    );
  });
  test("delete 2nd and 3rd chars", () => {
    testLineEditTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      [{
        startColumn: 2,
        endColumn: 4,
        text: ""
      }],
      "ad efgh",
      [
        new TestToken(0, 1),
        new TestToken(2, 2),
        new TestToken(3, 3)
      ]
    );
  });
  test("delete first token", () => {
    testLineEditTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      [{
        startColumn: 1,
        endColumn: 5,
        text: ""
      }],
      " efgh",
      [
        new TestToken(0, 2),
        new TestToken(1, 3)
      ]
    );
  });
  test("delete second token", () => {
    testLineEditTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      [{
        startColumn: 5,
        endColumn: 6,
        text: ""
      }],
      "abcdefgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 3)
      ]
    );
  });
  test("delete second token + a bit of the third one", () => {
    testLineEditTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      [{
        startColumn: 5,
        endColumn: 7,
        text: ""
      }],
      "abcdfgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 3)
      ]
    );
  });
  test("delete second and third token", () => {
    testLineEditTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      [{
        startColumn: 5,
        endColumn: 10,
        text: ""
      }],
      "abcd",
      [
        new TestToken(0, 1)
      ]
    );
  });
  test("delete everything", () => {
    testLineEditTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      [{
        startColumn: 1,
        endColumn: 10,
        text: ""
      }],
      "",
      [
        new TestToken(0, 1)
      ]
    );
  });
  test("noop", () => {
    testLineEditTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      [{
        startColumn: 1,
        endColumn: 1,
        text: ""
      }],
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ]
    );
  });
  test("equivalent to deleting first two chars", () => {
    testLineEditTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      [{
        startColumn: 1,
        endColumn: 3,
        text: ""
      }],
      "cd efgh",
      [
        new TestToken(0, 1),
        new TestToken(2, 2),
        new TestToken(3, 3)
      ]
    );
  });
  test("equivalent to deleting from 5 to the end", () => {
    testLineEditTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      [{
        startColumn: 5,
        endColumn: 10,
        text: ""
      }],
      "abcd",
      [
        new TestToken(0, 1)
      ]
    );
  });
  test("updates tokens on replace 1", () => {
    testLineEditTokens(
      "Hello world, ciao",
      [
        new TestToken(0, 1),
        new TestToken(5, 0),
        new TestToken(6, 2),
        new TestToken(11, 0),
        new TestToken(13, 0)
      ],
      [{
        startColumn: 1,
        endColumn: 6,
        text: "Hi"
      }],
      "Hi world, ciao",
      [
        new TestToken(0, 0),
        new TestToken(3, 2),
        new TestToken(8, 0),
        new TestToken(10, 0)
      ]
    );
  });
  test("updates tokens on replace 2", () => {
    testLineEditTokens(
      "Hello world, ciao",
      [
        new TestToken(0, 1),
        new TestToken(5, 0),
        new TestToken(6, 2),
        new TestToken(11, 0),
        new TestToken(13, 0)
      ],
      [{
        startColumn: 1,
        endColumn: 6,
        text: "Hi"
      }, {
        startColumn: 8,
        endColumn: 12,
        text: "my friends"
      }],
      "Hi wmy friends, ciao",
      [
        new TestToken(0, 0),
        new TestToken(3, 2),
        new TestToken(14, 0),
        new TestToken(16, 0)
      ]
    );
  });
  function testLineSplitTokens(initialText, initialTokens, splitColumn, expectedText1, expectedText2, expectedTokens) {
    testApplyEdits(
      [{
        text: initialText,
        tokens: initialTokens
      }],
      [{
        range: new Range(1, splitColumn, 1, splitColumn),
        text: "\n"
      }],
      [{
        text: expectedText1,
        tokens: expectedTokens
      }, {
        text: expectedText2,
        tokens: [new TestToken(0, 1)]
      }]
    );
  }
  test("split at the beginning", () => {
    testLineSplitTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      1,
      "",
      "abcd efgh",
      [
        new TestToken(0, 1)
      ]
    );
  });
  test("split at the end", () => {
    testLineSplitTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      10,
      "abcd efgh",
      "",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ]
    );
  });
  test("split inthe middle 1", () => {
    testLineSplitTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      5,
      "abcd",
      " efgh",
      [
        new TestToken(0, 1)
      ]
    );
  });
  test("split inthe middle 2", () => {
    testLineSplitTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      6,
      "abcd ",
      "efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2)
      ]
    );
  });
  function testLineAppendTokens(aText, aTokens, bText, bTokens, expectedText, expectedTokens) {
    testApplyEdits(
      [{
        text: aText,
        tokens: aTokens
      }, {
        text: bText,
        tokens: bTokens
      }],
      [{
        range: new Range(1, aText.length + 1, 2, 1),
        text: ""
      }],
      [{
        text: expectedText,
        tokens: expectedTokens
      }]
    );
  }
  test("append empty 1", () => {
    testLineAppendTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      "",
      [],
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ]
    );
  });
  test("append empty 2", () => {
    testLineAppendTokens(
      "",
      [],
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ]
    );
  });
  test("append 1", () => {
    testLineAppendTokens(
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ],
      "abcd efgh",
      [
        new TestToken(0, 4),
        new TestToken(4, 5),
        new TestToken(5, 6)
      ],
      "abcd efghabcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3),
        new TestToken(9, 4),
        new TestToken(13, 5),
        new TestToken(14, 6)
      ]
    );
  });
  test("append 2", () => {
    testLineAppendTokens(
      "abcd ",
      [
        new TestToken(0, 1),
        new TestToken(4, 2)
      ],
      "efgh",
      [
        new TestToken(0, 3)
      ],
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ]
    );
  });
  test("append 3", () => {
    testLineAppendTokens(
      "abcd",
      [
        new TestToken(0, 1)
      ],
      " efgh",
      [
        new TestToken(0, 2),
        new TestToken(1, 3)
      ],
      "abcd efgh",
      [
        new TestToken(0, 1),
        new TestToken(4, 2),
        new TestToken(5, 3)
      ]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZWxcXG1vZGVsLmxpbmUudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBNZXRhZGF0YUNvbnN0cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQsIElCYWNrZ3JvdW5kVG9rZW5pemF0aW9uU3RvcmUsIElCYWNrZ3JvdW5kVG9rZW5pemVyLCBJU3RhdGUsIElUb2tlbml6YXRpb25TdXBwb3J0LCBUb2tlbml6YXRpb25SZWdpc3RyeSwgVG9rZW5pemF0aW9uUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGNvbXB1dGVJbmRlbnRMZXZlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC91dGlscy5qcyc7XG5pbXBvcnQgeyBDb250aWd1b3VzTXVsdGlsaW5lVG9rZW5zQnVpbGRlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90b2tlbnMvY29udGlndW91c011bHRpbGluZVRva2Vuc0J1aWxkZXIuanMnO1xuaW1wb3J0IHsgTGluZVRva2VucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90b2tlbnMvbGluZVRva2Vucy5qcyc7XG5pbXBvcnQgeyBUZXN0TGluZVRva2VuLCBUZXN0TGluZVRva2VuRmFjdG9yeSB9IGZyb20gJy4uL2NvcmUvdGVzdExpbmVUb2tlbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi90ZXN0VGV4dE1vZGVsLmpzJztcblxuaW50ZXJmYWNlIElMaW5lRWRpdCB7XG5cdHN0YXJ0Q29sdW1uOiBudW1iZXI7XG5cdGVuZENvbHVtbjogbnVtYmVyO1xuXHR0ZXh0OiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGFzc2VydExpbmVUb2tlbnMoX19hY3R1YWw6IExpbmVUb2tlbnMsIF9leHBlY3RlZDogVGVzdFRva2VuW10pOiB2b2lkIHtcblx0Y29uc3QgdG1wID0gVGVzdFRva2VuLnRvVG9rZW5zKF9leHBlY3RlZCk7XG5cdExpbmVUb2tlbnMuY29udmVydFRvRW5kT2Zmc2V0KHRtcCwgX19hY3R1YWwuZ2V0TGluZUNvbnRlbnQoKS5sZW5ndGgpO1xuXHRjb25zdCBleHBlY3RlZCA9IFRlc3RMaW5lVG9rZW5GYWN0b3J5LmluZmxhdGVBcnIodG1wKTtcblx0Y29uc3QgX2FjdHVhbCA9IF9fYWN0dWFsLmluZmxhdGUoKTtcblx0aW50ZXJmYWNlIElUZXN0VG9rZW4ge1xuXHRcdGVuZEluZGV4OiBudW1iZXI7XG5cdFx0dHlwZTogc3RyaW5nO1xuXHR9XG5cdGNvbnN0IGFjdHVhbDogSVRlc3RUb2tlbltdID0gW107XG5cdGZvciAobGV0IGkgPSAwLCBsZW4gPSBfYWN0dWFsLmdldENvdW50KCk7IGkgPCBsZW47IGkrKykge1xuXHRcdGFjdHVhbFtpXSA9IHtcblx0XHRcdGVuZEluZGV4OiBfYWN0dWFsLmdldEVuZE9mZnNldChpKSxcblx0XHRcdHR5cGU6IF9hY3R1YWwuZ2V0Q2xhc3NOYW1lKGkpXG5cdFx0fTtcblx0fVxuXHRjb25zdCBkZWNvZGUgPSAodG9rZW46IFRlc3RMaW5lVG9rZW4pID0+IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZW5kSW5kZXg6IHRva2VuLmVuZEluZGV4LFxuXHRcdFx0dHlwZTogdG9rZW4uZ2V0VHlwZSgpXG5cdFx0fTtcblx0fTtcblx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkLm1hcChkZWNvZGUpKTtcbn1cblxuc3VpdGUoJ01vZGVsTGluZSAtIGdldEluZGVudExldmVsJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGFzc2VydEluZGVudExldmVsKHRleHQ6IHN0cmluZywgZXhwZWN0ZWQ6IG51bWJlciwgdGFiU2l6ZTogbnVtYmVyID0gNCk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdHVhbCA9IGNvbXB1dGVJbmRlbnRMZXZlbCh0ZXh0LCB0YWJTaXplKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgdGV4dCk7XG5cdH1cblxuXHR0ZXN0KCdnZXRJbmRlbnRMZXZlbCcsICgpID0+IHtcblx0XHRhc3NlcnRJbmRlbnRMZXZlbCgnJywgLTEpO1xuXHRcdGFzc2VydEluZGVudExldmVsKCcgJywgLTEpO1xuXHRcdGFzc2VydEluZGVudExldmVsKCcgICBcXHQnLCAtMSk7XG5cdFx0YXNzZXJ0SW5kZW50TGV2ZWwoJ0hlbGxvJywgMCk7XG5cdFx0YXNzZXJ0SW5kZW50TGV2ZWwoJyBIZWxsbycsIDEpO1xuXHRcdGFzc2VydEluZGVudExldmVsKCcgICBIZWxsbycsIDMpO1xuXHRcdGFzc2VydEluZGVudExldmVsKCdcXHRIZWxsbycsIDQpO1xuXHRcdGFzc2VydEluZGVudExldmVsKCcgXFx0SGVsbG8nLCA0KTtcblx0XHRhc3NlcnRJbmRlbnRMZXZlbCgnICBcXHRIZWxsbycsIDQpO1xuXHRcdGFzc2VydEluZGVudExldmVsKCcgICBcXHRIZWxsbycsIDQpO1xuXHRcdGFzc2VydEluZGVudExldmVsKCcgICAgXFx0SGVsbG8nLCA4KTtcblx0XHRhc3NlcnRJbmRlbnRMZXZlbCgnICAgICBcXHRIZWxsbycsIDgpO1xuXHRcdGFzc2VydEluZGVudExldmVsKCdcXHQgSGVsbG8nLCA1KTtcblx0XHRhc3NlcnRJbmRlbnRMZXZlbCgnXFx0IFxcdEhlbGxvJywgOCk7XG5cdH0pO1xufSk7XG5cbmNsYXNzIFRlc3RUb2tlbiB7XG5cdHB1YmxpYyByZWFkb25seSBzdGFydE9mZnNldDogbnVtYmVyO1xuXHRwdWJsaWMgcmVhZG9ubHkgY29sb3I6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcihzdGFydE9mZnNldDogbnVtYmVyLCBjb2xvcjogbnVtYmVyKSB7XG5cdFx0dGhpcy5zdGFydE9mZnNldCA9IHN0YXJ0T2Zmc2V0O1xuXHRcdHRoaXMuY29sb3IgPSBjb2xvcjtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgdG9Ub2tlbnModG9rZW5zOiBUZXN0VG9rZW5bXSk6IFVpbnQzMkFycmF5O1xuXHRwdWJsaWMgc3RhdGljIHRvVG9rZW5zKHRva2VuczogVGVzdFRva2VuW10gfCBudWxsKTogVWludDMyQXJyYXkgfCBudWxsIHtcblx0XHRpZiAodG9rZW5zID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgdG9rZW5zTGVuID0gdG9rZW5zLmxlbmd0aDtcblx0XHRjb25zdCByZXN1bHQgPSBuZXcgVWludDMyQXJyYXkoKHRva2Vuc0xlbiA8PCAxKSk7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnNMZW47IGkrKykge1xuXHRcdFx0Y29uc3QgdG9rZW4gPSB0b2tlbnNbaV07XG5cdFx0XHRyZXN1bHRbKGkgPDwgMSldID0gdG9rZW4uc3RhcnRPZmZzZXQ7XG5cdFx0XHRyZXN1bHRbKGkgPDwgMSkgKyAxXSA9IChcblx0XHRcdFx0dG9rZW4uY29sb3IgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVRcblx0XHRcdCkgPj4+IDA7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuY2xhc3MgTWFudWFsVG9rZW5pemF0aW9uU3VwcG9ydCBpbXBsZW1lbnRzIElUb2tlbml6YXRpb25TdXBwb3J0IHtcblx0cHJpdmF0ZSByZWFkb25seSB0b2tlbnMgPSBuZXcgTWFwPG51bWJlciwgVWludDMyQXJyYXk+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgc3RvcmVzID0gbmV3IFNldDxJQmFja2dyb3VuZFRva2VuaXphdGlvblN0b3JlPigpO1xuXG5cdHB1YmxpYyBzZXRMaW5lVG9rZW5zKGxpbmVOdW1iZXI6IG51bWJlciwgdG9rZW5zOiBVaW50MzJBcnJheSk6IHZvaWQge1xuXHRcdGNvbnN0IGIgPSBuZXcgQ29udGlndW91c011bHRpbGluZVRva2Vuc0J1aWxkZXIoKTtcblx0XHRiLmFkZChsaW5lTnVtYmVyLCB0b2tlbnMpO1xuXHRcdGZvciAoY29uc3QgcyBvZiB0aGlzLnN0b3Jlcykge1xuXHRcdFx0cy5zZXRUb2tlbnMoYi5maW5hbGl6ZSgpKTtcblx0XHR9XG5cdH1cblxuXHRnZXRJbml0aWFsU3RhdGUoKTogSVN0YXRlIHtcblx0XHRyZXR1cm4gbmV3IExpbmVTdGF0ZSgxKTtcblx0fVxuXG5cdHRva2VuaXplKGxpbmU6IHN0cmluZywgaGFzRU9MOiBib29sZWFuLCBzdGF0ZTogSVN0YXRlKTogVG9rZW5pemF0aW9uUmVzdWx0IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoKTtcblx0fVxuXG5cdHRva2VuaXplRW5jb2RlZChsaW5lOiBzdHJpbmcsIGhhc0VPTDogYm9vbGVhbiwgc3RhdGU6IElTdGF0ZSk6IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQge1xuXHRcdGNvbnN0IHMgPSBzdGF0ZSBhcyBMaW5lU3RhdGU7XG5cdFx0cmV0dXJuIG5ldyBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0KHRoaXMudG9rZW5zLmdldChzLmxpbmVOdW1iZXIpISwgW10sIG5ldyBMaW5lU3RhdGUocy5saW5lTnVtYmVyICsgMSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbiBiZS9yZXR1cm4gdW5kZWZpbmVkIGlmIGRlZmF1bHQgYmFja2dyb3VuZCB0b2tlbml6YXRpb24gc2hvdWxkIGJlIHVzZWQuXG5cdCAqL1xuXHRjcmVhdGVCYWNrZ3JvdW5kVG9rZW5pemVyPyh0ZXh0TW9kZWw6IElUZXh0TW9kZWwsIHN0b3JlOiBJQmFja2dyb3VuZFRva2VuaXphdGlvblN0b3JlKTogSUJhY2tncm91bmRUb2tlbml6ZXIgfCB1bmRlZmluZWQge1xuXHRcdHRoaXMuc3RvcmVzLmFkZChzdG9yZSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5zdG9yZXMuZGVsZXRlKHN0b3JlKTtcblx0XHRcdH0sXG5cdFx0XHRyZXF1ZXN0VG9rZW5zKHN0YXJ0TGluZU51bWJlciwgZW5kTGluZU51bWJlckV4Y2x1c2l2ZSkge1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG59XG5cbmNsYXNzIExpbmVTdGF0ZSBpbXBsZW1lbnRzIElTdGF0ZSB7XG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSBsaW5lTnVtYmVyOiBudW1iZXIpIHsgfVxuXHRjbG9uZSgpOiBJU3RhdGUge1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cdGVxdWFscyhvdGhlcjogSVN0YXRlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIChvdGhlciBhcyBMaW5lU3RhdGUpLmxpbmVOdW1iZXIgPT09IHRoaXMubGluZU51bWJlcjtcblx0fVxufVxuXG5zdWl0ZSgnTW9kZWxMaW5lc1Rva2VucycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRpbnRlcmZhY2UgSUJ1ZmZlckxpbmVTdGF0ZSB7XG5cdFx0dGV4dDogc3RyaW5nO1xuXHRcdHRva2VuczogVGVzdFRva2VuW107XG5cdH1cblxuXHRpbnRlcmZhY2UgSUVkaXQge1xuXHRcdHJhbmdlOiBSYW5nZTtcblx0XHR0ZXh0OiBzdHJpbmc7XG5cdH1cblxuXHRmdW5jdGlvbiB0ZXN0QXBwbHlFZGl0cyhpbml0aWFsOiBJQnVmZmVyTGluZVN0YXRlW10sIGVkaXRzOiBJRWRpdFtdLCBleHBlY3RlZDogSUJ1ZmZlckxpbmVTdGF0ZVtdKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5pdGlhbFRleHQgPSBpbml0aWFsLm1hcChlbCA9PiBlbC50ZXh0KS5qb2luKCdcXG4nKTtcblxuXHRcdGNvbnN0IHMgPSBuZXcgTWFudWFsVG9rZW5pemF0aW9uU3VwcG9ydCgpO1xuXHRcdGNvbnN0IGQgPSBUb2tlbml6YXRpb25SZWdpc3RyeS5yZWdpc3RlcigndGVzdCcsIHMpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoaW5pdGlhbFRleHQsICd0ZXN0Jyk7XG5cdFx0bW9kZWwub25CZWZvcmVBdHRhY2hlZCgpO1xuXHRcdGZvciAobGV0IGxpbmVJbmRleCA9IDA7IGxpbmVJbmRleCA8IGluaXRpYWwubGVuZ3RoOyBsaW5lSW5kZXgrKykge1xuXHRcdFx0Y29uc3QgbGluZVRva2VucyA9IGluaXRpYWxbbGluZUluZGV4XS50b2tlbnM7XG5cdFx0XHRjb25zdCBsaW5lVGV4dExlbmd0aCA9IG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZUluZGV4ICsgMSkgLSAxO1xuXHRcdFx0Y29uc3QgdG9rZW5zID0gVGVzdFRva2VuLnRvVG9rZW5zKGxpbmVUb2tlbnMpO1xuXHRcdFx0TGluZVRva2Vucy5jb252ZXJ0VG9FbmRPZmZzZXQodG9rZW5zLCBsaW5lVGV4dExlbmd0aCk7XG5cdFx0XHRzLnNldExpbmVUb2tlbnMobGluZUluZGV4ICsgMSwgdG9rZW5zKTtcblx0XHR9XG5cblx0XHRtb2RlbC5hcHBseUVkaXRzKGVkaXRzLm1hcCgoZWQpID0+ICh7XG5cdFx0XHRpZGVudGlmaWVyOiBudWxsLFxuXHRcdFx0cmFuZ2U6IGVkLnJhbmdlLFxuXHRcdFx0dGV4dDogZWQudGV4dCxcblx0XHRcdGZvcmNlTW92ZU1hcmtlcnM6IGZhbHNlXG5cdFx0fSkpKTtcblxuXHRcdGZvciAobGV0IGxpbmVJbmRleCA9IDA7IGxpbmVJbmRleCA8IGV4cGVjdGVkLmxlbmd0aDsgbGluZUluZGV4KyspIHtcblx0XHRcdGNvbnN0IGFjdHVhbExpbmUgPSBtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lSW5kZXggKyAxKTtcblx0XHRcdGNvbnN0IGFjdHVhbFRva2VucyA9IG1vZGVsLnRva2VuaXphdGlvbi5nZXRMaW5lVG9rZW5zKGxpbmVJbmRleCArIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbExpbmUsIGV4cGVjdGVkW2xpbmVJbmRleF0udGV4dCk7XG5cdFx0XHRhc3NlcnRMaW5lVG9rZW5zKGFjdHVhbFRva2VucywgZXhwZWN0ZWRbbGluZUluZGV4XS50b2tlbnMpO1xuXHRcdH1cblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHRkLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHRlc3QoJ3NpbmdsZSBkZWxldGUgMScsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0cyhcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oNSwgMiksIG5ldyBUZXN0VG9rZW4oNiwgMyldXG5cdFx0XHR9XSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMiksIHRleHQ6ICcnIH1dLFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogJ2VsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDQsIDIpLCBuZXcgVGVzdFRva2VuKDUsIDMpXVxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaW5nbGUgZGVsZXRlIDInLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG93b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oNSwgMildXG5cdFx0XHR9XSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMywgMSwgOCksIHRleHQ6ICcnIH1dLFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogJ2hlcmxkJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCAxKSwgbmV3IFRlc3RUb2tlbigyLCAyKV1cblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc2luZ2xlIGRlbGV0ZSAzJywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzKFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogJ2hlbGxvIHdvcmxkJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCAxKSwgbmV3IFRlc3RUb2tlbig1LCAyKSwgbmV3IFRlc3RUb2tlbig2LCAzKV1cblx0XHRcdH1dLFxuXHRcdFx0W3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA2KSwgdGV4dDogJycgfV0sXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnIHdvcmxkJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCAyKSwgbmV3IFRlc3RUb2tlbigxLCAzKV1cblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc2luZ2xlIGRlbGV0ZSA0JywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzKFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogJ2hlbGxvIHdvcmxkJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCAxKSwgbmV3IFRlc3RUb2tlbig1LCAyKSwgbmV3IFRlc3RUb2tlbig2LCAzKV1cblx0XHRcdH1dLFxuXHRcdFx0W3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAyLCAxLCA3KSwgdGV4dDogJycgfV0sXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaHdvcmxkJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCAxKSwgbmV3IFRlc3RUb2tlbigxLCAzKV1cblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc2luZ2xlIGRlbGV0ZSA1JywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzKFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogJ2hlbGxvIHdvcmxkJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCAxKSwgbmV3IFRlc3RUb2tlbig1LCAyKSwgbmV3IFRlc3RUb2tlbig2LCAzKV1cblx0XHRcdH1dLFxuXHRcdFx0W3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxMiksIHRleHQ6ICcnIH1dLFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogJycsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSldXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpIGRlbGV0ZSA2JywgKCkgPT4ge1xuXHRcdHRlc3RBcHBseUVkaXRzKFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogJ2hlbGxvIHdvcmxkJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCAxKSwgbmV3IFRlc3RUb2tlbig1LCAyKSwgbmV3IFRlc3RUb2tlbig2LCAzKV1cblx0XHRcdH0sIHtcblx0XHRcdFx0dGV4dDogJ2hlbGxvIHdvcmxkJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCA0KSwgbmV3IFRlc3RUb2tlbig1LCA1KSwgbmV3IFRlc3RUb2tlbig2LCA2KV1cblx0XHRcdH0sIHtcblx0XHRcdFx0dGV4dDogJ2hlbGxvIHdvcmxkJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCA3KSwgbmV3IFRlc3RUb2tlbig1LCA4KSwgbmV3IFRlc3RUb2tlbig2LCA5KV1cblx0XHRcdH1dLFxuXHRcdFx0W3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCA2LCAzLCA2KSwgdGV4dDogJycgfV0sXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDUsIDgpLCBuZXcgVGVzdFRva2VuKDYsIDkpXVxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aSBkZWxldGUgNycsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0cyhcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oNSwgMiksIG5ldyBUZXN0VG9rZW4oNiwgMyldXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgNCksIG5ldyBUZXN0VG9rZW4oNSwgNSksIG5ldyBUZXN0VG9rZW4oNiwgNildXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgNyksIG5ldyBUZXN0VG9rZW4oNSwgOCksIG5ldyBUZXN0VG9rZW4oNiwgOSldXG5cdFx0XHR9XSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMTIsIDMsIDEyKSwgdGV4dDogJycgfV0sXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDUsIDIpLCBuZXcgVGVzdFRva2VuKDYsIDMpXVxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aSBkZWxldGUgOCcsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0cyhcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oNSwgMiksIG5ldyBUZXN0VG9rZW4oNiwgMyldXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgNCksIG5ldyBUZXN0VG9rZW4oNSwgNSksIG5ldyBUZXN0VG9rZW4oNiwgNildXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgNyksIG5ldyBUZXN0VG9rZW4oNSwgOCksIG5ldyBUZXN0VG9rZW4oNiwgOSldXG5cdFx0XHR9XSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMywgMSksIHRleHQ6ICcnIH1dLFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogJ2hlbGxvIHdvcmxkJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCA3KSwgbmV3IFRlc3RUb2tlbig1LCA4KSwgbmV3IFRlc3RUb2tlbig2LCA5KV1cblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGkgZGVsZXRlIDknLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDUsIDIpLCBuZXcgVGVzdFRva2VuKDYsIDMpXVxuXHRcdFx0fSwge1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDQpLCBuZXcgVGVzdFRva2VuKDUsIDUpLCBuZXcgVGVzdFRva2VuKDYsIDYpXVxuXHRcdFx0fSwge1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDcpLCBuZXcgVGVzdFRva2VuKDUsIDgpLCBuZXcgVGVzdFRva2VuKDYsIDkpXVxuXHRcdFx0fV0sXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEyLCAzLCAxKSwgdGV4dDogJycgfV0sXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGRoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oNSwgMiksIG5ldyBUZXN0VG9rZW4oNiwgMyksIG5ldyBUZXN0VG9rZW4oMTEsIDcpLCBuZXcgVGVzdFRva2VuKDE2LCA4KSwgbmV3IFRlc3RUb2tlbigxNywgOSldXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZSBpbnNlcnQgMScsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0cyhcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oNSwgMiksIG5ldyBUZXN0VG9rZW4oNiwgMyldXG5cdFx0XHR9XSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIHRleHQ6ICd4eCcgfV0sXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAneHhoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oNywgMiksIG5ldyBUZXN0VG9rZW4oOCwgMyldXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZSBpbnNlcnQgMicsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0cyhcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oNSwgMiksIG5ldyBUZXN0VG9rZW4oNiwgMyldXG5cdFx0XHR9XSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMiwgMSwgMiksIHRleHQ6ICd4eCcgfV0sXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaHh4ZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oNywgMiksIG5ldyBUZXN0VG9rZW4oOCwgMyldXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZSBpbnNlcnQgMycsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0cyhcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oNSwgMiksIG5ldyBUZXN0VG9rZW4oNiwgMyldXG5cdFx0XHR9XSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgNiwgMSwgNiksIHRleHQ6ICd4eCcgfV0sXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG94eCB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oNywgMiksIG5ldyBUZXN0VG9rZW4oOCwgMyldXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZSBpbnNlcnQgNCcsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0cyhcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oNSwgMiksIG5ldyBUZXN0VG9rZW4oNiwgMyldXG5cdFx0XHR9XSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgNywgMSwgNyksIHRleHQ6ICd4eCcgfV0sXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8geHh3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oNSwgMiksIG5ldyBUZXN0VG9rZW4oOCwgMyldXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZSBpbnNlcnQgNScsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0cyhcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oNSwgMiksIG5ldyBUZXN0VG9rZW4oNiwgMyldXG5cdFx0XHR9XSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMTIsIDEsIDEyKSwgdGV4dDogJ3h4JyB9XSxcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZHh4Jyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCAxKSwgbmV3IFRlc3RUb2tlbig1LCAyKSwgbmV3IFRlc3RUb2tlbig2LCAzKV1cblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGkgaW5zZXJ0IDYnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDUsIDIpLCBuZXcgVGVzdFRva2VuKDYsIDMpXVxuXHRcdFx0fV0sXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLCB0ZXh0OiAnXFxuJyB9XSxcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6ICcnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpXVxuXHRcdFx0fSwge1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpXVxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aSBpbnNlcnQgNycsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0cyhcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oNSwgMiksIG5ldyBUZXN0VG9rZW4oNiwgMyldXG5cdFx0XHR9XSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMTIsIDEsIDEyKSwgdGV4dDogJ1xcbicgfV0sXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDUsIDIpLCBuZXcgVGVzdFRva2VuKDYsIDMpXVxuXHRcdFx0fSwge1xuXHRcdFx0XHR0ZXh0OiAnJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCAxKV1cblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGkgaW5zZXJ0IDgnLCAoKSA9PiB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiAnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDUsIDIpLCBuZXcgVGVzdFRva2VuKDYsIDMpXVxuXHRcdFx0fV0sXG5cdFx0XHRbeyByYW5nZTogbmV3IFJhbmdlKDEsIDcsIDEsIDcpLCB0ZXh0OiAnXFxuJyB9XSxcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyAnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpLCBuZXcgVGVzdFRva2VuKDUsIDIpXVxuXHRcdFx0fSwge1xuXHRcdFx0XHR0ZXh0OiAnd29ybGQnLFxuXHRcdFx0XHR0b2tlbnM6IFtuZXcgVGVzdFRva2VuKDAsIDEpXVxuXHRcdFx0fV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aSBpbnNlcnQgOScsICgpID0+IHtcblx0XHR0ZXN0QXBwbHlFZGl0cyhcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oNSwgMiksIG5ldyBUZXN0VG9rZW4oNiwgMyldXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgNCksIG5ldyBUZXN0VG9rZW4oNSwgNSksIG5ldyBUZXN0VG9rZW4oNiwgNildXG5cdFx0XHR9XSxcblx0XHRcdFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgNywgMSwgNyksIHRleHQ6ICd4eFxcbnl5JyB9XSxcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6ICdoZWxsbyB4eCcsXG5cdFx0XHRcdHRva2VuczogW25ldyBUZXN0VG9rZW4oMCwgMSksIG5ldyBUZXN0VG9rZW4oNSwgMildXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRleHQ6ICd5eXdvcmxkJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCAxKV1cblx0XHRcdH0sIHtcblx0XHRcdFx0dGV4dDogJ2hlbGxvIHdvcmxkJyxcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCA0KSwgbmV3IFRlc3RUb2tlbig1LCA1KSwgbmV3IFRlc3RUb2tlbig2LCA2KV1cblx0XHRcdH1dXG5cdFx0KTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gdGVzdExpbmVFZGl0VG9rZW5zKGluaXRpYWxUZXh0OiBzdHJpbmcsIGluaXRpYWxUb2tlbnM6IFRlc3RUb2tlbltdLCBlZGl0czogSUxpbmVFZGl0W10sIGV4cGVjdGVkVGV4dDogc3RyaW5nLCBleHBlY3RlZFRva2VuczogVGVzdFRva2VuW10pOiB2b2lkIHtcblx0XHR0ZXN0QXBwbHlFZGl0cyhcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6IGluaXRpYWxUZXh0LFxuXHRcdFx0XHR0b2tlbnM6IGluaXRpYWxUb2tlbnNcblx0XHRcdH1dLFxuXHRcdFx0ZWRpdHMubWFwKChlZCkgPT4gKHtcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCBlZC5zdGFydENvbHVtbiwgMSwgZWQuZW5kQ29sdW1uKSxcblx0XHRcdFx0dGV4dDogZWQudGV4dFxuXHRcdFx0fSkpLFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogZXhwZWN0ZWRUZXh0LFxuXHRcdFx0XHR0b2tlbnM6IGV4cGVjdGVkVG9rZW5zXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH1cblxuXHR0ZXN0KCdpbnNlcnRpb24gb24gZW1wdHkgbGluZScsICgpID0+IHtcblx0XHRjb25zdCBzID0gbmV3IE1hbnVhbFRva2VuaXphdGlvblN1cHBvcnQoKTtcblx0XHRjb25zdCBkID0gVG9rZW5pemF0aW9uUmVnaXN0cnkucmVnaXN0ZXIoJ3Rlc3QnLCBzKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdzb21lIHRleHQnLCAndGVzdCcpO1xuXHRcdGNvbnN0IHRva2VucyA9IFRlc3RUb2tlbi50b1Rva2VucyhbbmV3IFRlc3RUb2tlbigwLCAxKV0pO1xuXHRcdExpbmVUb2tlbnMuY29udmVydFRvRW5kT2Zmc2V0KHRva2VucywgbW9kZWwuZ2V0TGluZU1heENvbHVtbigxKSAtIDEpO1xuXHRcdHMuc2V0TGluZVRva2VucygxLCB0b2tlbnMpO1xuXG5cdFx0bW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxMCksXG5cdFx0XHR0ZXh0OiAnJ1xuXHRcdH1dKTtcblxuXHRcdHMuc2V0TGluZVRva2VucygxLCBuZXcgVWludDMyQXJyYXkoMCkpO1xuXG5cdFx0bW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSxcblx0XHRcdHRleHQ6ICdhJ1xuXHRcdH1dKTtcblxuXHRcdGNvbnN0IGFjdHVhbFRva2VucyA9IG1vZGVsLnRva2VuaXphdGlvbi5nZXRMaW5lVG9rZW5zKDEpO1xuXHRcdGFzc2VydExpbmVUb2tlbnMoYWN0dWFsVG9rZW5zLCBbbmV3IFRlc3RUb2tlbigwLCAxKV0pO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdGQuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVzIHRva2VucyBvbiBpbnNlcnRpb24gMScsICgpID0+IHtcblx0XHR0ZXN0TGluZUVkaXRUb2tlbnMoXG5cdFx0XHQnYWJjZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig0LCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig1LCAzKVxuXHRcdFx0XSxcblx0XHRcdFt7XG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRlbmRDb2x1bW46IDEsXG5cdFx0XHRcdHRleHQ6ICdhJyxcblx0XHRcdH1dLFxuXHRcdFx0J2FhYmNkIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDUsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDYsIDMpXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlcyB0b2tlbnMgb24gaW5zZXJ0aW9uIDInLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVFZGl0VG9rZW5zKFxuXHRcdFx0J2FhYmNkIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDUsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDYsIDMpXG5cdFx0XHRdLFxuXHRcdFx0W3tcblx0XHRcdFx0c3RhcnRDb2x1bW46IDIsXG5cdFx0XHRcdGVuZENvbHVtbjogMixcblx0XHRcdFx0dGV4dDogJ3gnLFxuXHRcdFx0fV0sXG5cdFx0XHQnYXhhYmNkIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDYsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDcsIDMpXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlcyB0b2tlbnMgb24gaW5zZXJ0aW9uIDMnLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVFZGl0VG9rZW5zKFxuXHRcdFx0J2F4YWJjZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig2LCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig3LCAzKVxuXHRcdFx0XSxcblx0XHRcdFt7XG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiAzLFxuXHRcdFx0XHRlbmRDb2x1bW46IDMsXG5cdFx0XHRcdHRleHQ6ICdzdHUnLFxuXHRcdFx0fV0sXG5cdFx0XHQnYXhzdHVhYmNkIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDksIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDEwLCAzKVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZXMgdG9rZW5zIG9uIGluc2VydGlvbiA0JywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lRWRpdFRva2Vucyhcblx0XHRcdCdheHN0dWFiY2QgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oOSwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTAsIDMpXG5cdFx0XHRdLFxuXHRcdFx0W3tcblx0XHRcdFx0c3RhcnRDb2x1bW46IDEwLFxuXHRcdFx0XHRlbmRDb2x1bW46IDEwLFxuXHRcdFx0XHR0ZXh0OiAnXFx0Jyxcblx0XHRcdH1dLFxuXHRcdFx0J2F4c3R1YWJjZFxcdCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxMCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTEsIDMpXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlcyB0b2tlbnMgb24gaW5zZXJ0aW9uIDUnLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVFZGl0VG9rZW5zKFxuXHRcdFx0J2F4c3R1YWJjZFxcdCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxMCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTEsIDMpXG5cdFx0XHRdLFxuXHRcdFx0W3tcblx0XHRcdFx0c3RhcnRDb2x1bW46IDEyLFxuXHRcdFx0XHRlbmRDb2x1bW46IDEyLFxuXHRcdFx0XHR0ZXh0OiAnZGQnLFxuXHRcdFx0fV0sXG5cdFx0XHQnYXhzdHVhYmNkXFx0IGRkZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTAsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDEzLCAzKVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZXMgdG9rZW5zIG9uIGluc2VydGlvbiA2JywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lRWRpdFRva2Vucyhcblx0XHRcdCdheHN0dWFiY2RcXHQgZGRlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxMCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTMsIDMpXG5cdFx0XHRdLFxuXHRcdFx0W3tcblx0XHRcdFx0c3RhcnRDb2x1bW46IDE4LFxuXHRcdFx0XHRlbmRDb2x1bW46IDE4LFxuXHRcdFx0XHR0ZXh0OiAneHl6Jyxcblx0XHRcdH1dLFxuXHRcdFx0J2F4c3R1YWJjZFxcdCBkZGVmZ2h4eXonLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDEwLCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxMywgMylcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVzIHRva2VucyBvbiBpbnNlcnRpb24gNycsICgpID0+IHtcblx0XHR0ZXN0TGluZUVkaXRUb2tlbnMoXG5cdFx0XHQnYXhzdHVhYmNkXFx0IGRkZWZnaHh5eicsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTAsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDEzLCAzKVxuXHRcdFx0XSxcblx0XHRcdFt7XG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRlbmRDb2x1bW46IDEsXG5cdFx0XHRcdHRleHQ6ICd4Jyxcblx0XHRcdH1dLFxuXHRcdFx0J3hheHN0dWFiY2RcXHQgZGRlZmdoeHl6Jyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxMSwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTQsIDMpXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlcyB0b2tlbnMgb24gaW5zZXJ0aW9uIDgnLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVFZGl0VG9rZW5zKFxuXHRcdFx0J3hheHN0dWFiY2RcXHQgZGRlZmdoeHl6Jyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxMSwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTQsIDMpXG5cdFx0XHRdLFxuXHRcdFx0W3tcblx0XHRcdFx0c3RhcnRDb2x1bW46IDIyLFxuXHRcdFx0XHRlbmRDb2x1bW46IDIyLFxuXHRcdFx0XHR0ZXh0OiAneCcsXG5cdFx0XHR9XSxcblx0XHRcdCd4YXhzdHVhYmNkXFx0IGRkZWZnaHh5engnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDExLCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxNCwgMylcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVzIHRva2VucyBvbiBpbnNlcnRpb24gOScsICgpID0+IHtcblx0XHR0ZXN0TGluZUVkaXRUb2tlbnMoXG5cdFx0XHQneGF4c3R1YWJjZFxcdCBkZGVmZ2h4eXp4Jyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxMSwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTQsIDMpXG5cdFx0XHRdLFxuXHRcdFx0W3tcblx0XHRcdFx0c3RhcnRDb2x1bW46IDIsXG5cdFx0XHRcdGVuZENvbHVtbjogMixcblx0XHRcdFx0dGV4dDogJycsXG5cdFx0XHR9XSxcblx0XHRcdCd4YXhzdHVhYmNkXFx0IGRkZWZnaHh5engnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDExLCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxNCwgMylcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVzIHRva2VucyBvbiBpbnNlcnRpb24gMTAnLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVFZGl0VG9rZW5zKFxuXHRcdFx0JycsXG5cdFx0XHRbXSxcblx0XHRcdFt7XG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRlbmRDb2x1bW46IDEsXG5cdFx0XHRcdHRleHQ6ICdhJyxcblx0XHRcdH1dLFxuXHRcdFx0J2EnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlIHNlY29uZCB0b2tlbiAyJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lRWRpdFRva2Vucyhcblx0XHRcdCdhYmNkZWZnaGlqJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigzLCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig2LCAzKVxuXHRcdFx0XSxcblx0XHRcdFt7XG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiA0LFxuXHRcdFx0XHRlbmRDb2x1bW46IDcsXG5cdFx0XHRcdHRleHQ6ICcnLFxuXHRcdFx0fV0sXG5cdFx0XHQnYWJjZ2hpaicsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMywgMylcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQgcmlnaHQgYmVmb3JlIHNlY29uZCB0b2tlbicsICgpID0+IHtcblx0XHR0ZXN0TGluZUVkaXRUb2tlbnMoXG5cdFx0XHQnYWJjZGVmZ2hpaicsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMywgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNiwgMylcblx0XHRcdF0sXG5cdFx0XHRbe1xuXHRcdFx0XHRzdGFydENvbHVtbjogNCxcblx0XHRcdFx0ZW5kQ29sdW1uOiA0LFxuXHRcdFx0XHR0ZXh0OiAnaGVsbG8nLFxuXHRcdFx0fV0sXG5cdFx0XHQnYWJjaGVsbG9kZWZnaGlqJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig4LCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxMSwgMylcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGUgZmlyc3QgY2hhcicsICgpID0+IHtcblx0XHR0ZXN0TGluZUVkaXRUb2tlbnMoXG5cdFx0XHQnYWJjZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig0LCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig1LCAzKVxuXHRcdFx0XSxcblx0XHRcdFt7XG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRlbmRDb2x1bW46IDIsXG5cdFx0XHRcdHRleHQ6ICcnLFxuXHRcdFx0fV0sXG5cdFx0XHQnYmNkIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDMsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDQsIDMpXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlIDJuZCBhbmQgM3JkIGNoYXJzJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lRWRpdFRva2Vucyhcblx0XHRcdCdhYmNkIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDQsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDUsIDMpXG5cdFx0XHRdLFxuXHRcdFx0W3tcblx0XHRcdFx0c3RhcnRDb2x1bW46IDIsXG5cdFx0XHRcdGVuZENvbHVtbjogNCxcblx0XHRcdFx0dGV4dDogJycsXG5cdFx0XHR9XSxcblx0XHRcdCdhZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigyLCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigzLCAzKVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSBmaXJzdCB0b2tlbicsICgpID0+IHtcblx0XHR0ZXN0TGluZUVkaXRUb2tlbnMoXG5cdFx0XHQnYWJjZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig0LCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig1LCAzKVxuXHRcdFx0XSxcblx0XHRcdFt7XG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRlbmRDb2x1bW46IDUsXG5cdFx0XHRcdHRleHQ6ICcnLFxuXHRcdFx0fV0sXG5cdFx0XHQnIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDEsIDMpXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlIHNlY29uZCB0b2tlbicsICgpID0+IHtcblx0XHR0ZXN0TGluZUVkaXRUb2tlbnMoXG5cdFx0XHQnYWJjZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig0LCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig1LCAzKVxuXHRcdFx0XSxcblx0XHRcdFt7XG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiA1LFxuXHRcdFx0XHRlbmRDb2x1bW46IDYsXG5cdFx0XHRcdHRleHQ6ICcnLFxuXHRcdFx0fV0sXG5cdFx0XHQnYWJjZGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDQsIDMpXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlIHNlY29uZCB0b2tlbiArIGEgYml0IG9mIHRoZSB0aGlyZCBvbmUnLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVFZGl0VG9rZW5zKFxuXHRcdFx0J2FiY2QgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNSwgMylcblx0XHRcdF0sXG5cdFx0XHRbe1xuXHRcdFx0XHRzdGFydENvbHVtbjogNSxcblx0XHRcdFx0ZW5kQ29sdW1uOiA3LFxuXHRcdFx0XHR0ZXh0OiAnJyxcblx0XHRcdH1dLFxuXHRcdFx0J2FiY2RmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDQsIDMpXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlIHNlY29uZCBhbmQgdGhpcmQgdG9rZW4nLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVFZGl0VG9rZW5zKFxuXHRcdFx0J2FiY2QgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNSwgMylcblx0XHRcdF0sXG5cdFx0XHRbe1xuXHRcdFx0XHRzdGFydENvbHVtbjogNSxcblx0XHRcdFx0ZW5kQ29sdW1uOiAxMCxcblx0XHRcdFx0dGV4dDogJycsXG5cdFx0XHR9XSxcblx0XHRcdCdhYmNkJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSBldmVyeXRoaW5nJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lRWRpdFRva2Vucyhcblx0XHRcdCdhYmNkIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDQsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDUsIDMpXG5cdFx0XHRdLFxuXHRcdFx0W3tcblx0XHRcdFx0c3RhcnRDb2x1bW46IDEsXG5cdFx0XHRcdGVuZENvbHVtbjogMTAsXG5cdFx0XHRcdHRleHQ6ICcnLFxuXHRcdFx0fV0sXG5cdFx0XHQnJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vb3AnLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVFZGl0VG9rZW5zKFxuXHRcdFx0J2FiY2QgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNSwgMylcblx0XHRcdF0sXG5cdFx0XHRbe1xuXHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0ZW5kQ29sdW1uOiAxLFxuXHRcdFx0XHR0ZXh0OiAnJyxcblx0XHRcdH1dLFxuXHRcdFx0J2FiY2QgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNSwgMylcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdlcXVpdmFsZW50IHRvIGRlbGV0aW5nIGZpcnN0IHR3byBjaGFycycsICgpID0+IHtcblx0XHR0ZXN0TGluZUVkaXRUb2tlbnMoXG5cdFx0XHQnYWJjZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig0LCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig1LCAzKVxuXHRcdFx0XSxcblx0XHRcdFt7XG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRlbmRDb2x1bW46IDMsXG5cdFx0XHRcdHRleHQ6ICcnLFxuXHRcdFx0fV0sXG5cdFx0XHQnY2QgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMiwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMywgMylcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdlcXVpdmFsZW50IHRvIGRlbGV0aW5nIGZyb20gNSB0byB0aGUgZW5kJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lRWRpdFRva2Vucyhcblx0XHRcdCdhYmNkIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDQsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDUsIDMpXG5cdFx0XHRdLFxuXHRcdFx0W3tcblx0XHRcdFx0c3RhcnRDb2x1bW46IDUsXG5cdFx0XHRcdGVuZENvbHVtbjogMTAsXG5cdFx0XHRcdHRleHQ6ICcnLFxuXHRcdFx0fV0sXG5cdFx0XHQnYWJjZCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSlcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVzIHRva2VucyBvbiByZXBsYWNlIDEnLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVFZGl0VG9rZW5zKFxuXHRcdFx0J0hlbGxvIHdvcmxkLCBjaWFvJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig1LCAwKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig2LCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxMSwgMCksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTMsIDApXG5cdFx0XHRdLFxuXHRcdFx0W3tcblx0XHRcdFx0c3RhcnRDb2x1bW46IDEsXG5cdFx0XHRcdGVuZENvbHVtbjogNixcblx0XHRcdFx0dGV4dDogJ0hpJyxcblx0XHRcdH1dLFxuXHRcdFx0J0hpIHdvcmxkLCBjaWFvJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAwKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigzLCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig4LCAwKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxMCwgMCksXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlcyB0b2tlbnMgb24gcmVwbGFjZSAyJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lRWRpdFRva2Vucyhcblx0XHRcdCdIZWxsbyB3b3JsZCwgY2lhbycsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNSwgMCksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNiwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMTEsIDApLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDEzLCAwKSxcblx0XHRcdF0sXG5cdFx0XHRbe1xuXHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0ZW5kQ29sdW1uOiA2LFxuXHRcdFx0XHR0ZXh0OiAnSGknLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzdGFydENvbHVtbjogOCxcblx0XHRcdFx0ZW5kQ29sdW1uOiAxMixcblx0XHRcdFx0dGV4dDogJ215IGZyaWVuZHMnLFxuXHRcdFx0fV0sXG5cdFx0XHQnSGkgd215IGZyaWVuZHMsIGNpYW8nLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDApLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDMsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDE0LCAwKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxNiwgMCksXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gdGVzdExpbmVTcGxpdFRva2Vucyhpbml0aWFsVGV4dDogc3RyaW5nLCBpbml0aWFsVG9rZW5zOiBUZXN0VG9rZW5bXSwgc3BsaXRDb2x1bW46IG51bWJlciwgZXhwZWN0ZWRUZXh0MTogc3RyaW5nLCBleHBlY3RlZFRleHQyOiBzdHJpbmcsIGV4cGVjdGVkVG9rZW5zOiBUZXN0VG9rZW5bXSk6IHZvaWQge1xuXHRcdHRlc3RBcHBseUVkaXRzKFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogaW5pdGlhbFRleHQsXG5cdFx0XHRcdHRva2VuczogaW5pdGlhbFRva2Vuc1xuXHRcdFx0fV0sXG5cdFx0XHRbe1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIHNwbGl0Q29sdW1uLCAxLCBzcGxpdENvbHVtbiksXG5cdFx0XHRcdHRleHQ6ICdcXG4nXG5cdFx0XHR9XSxcblx0XHRcdFt7XG5cdFx0XHRcdHRleHQ6IGV4cGVjdGVkVGV4dDEsXG5cdFx0XHRcdHRva2VuczogZXhwZWN0ZWRUb2tlbnNcblx0XHRcdH0sIHtcblx0XHRcdFx0dGV4dDogZXhwZWN0ZWRUZXh0Mixcblx0XHRcdFx0dG9rZW5zOiBbbmV3IFRlc3RUb2tlbigwLCAxKV1cblx0XHRcdH1dXG5cdFx0KTtcblx0fVxuXG5cdHRlc3QoJ3NwbGl0IGF0IHRoZSBiZWdpbm5pbmcnLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVTcGxpdFRva2Vucyhcblx0XHRcdCdhYmNkIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDQsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDUsIDMpXG5cdFx0XHRdLFxuXHRcdFx0MSxcblx0XHRcdCcnLFxuXHRcdFx0J2FiY2QgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc3BsaXQgYXQgdGhlIGVuZCcsICgpID0+IHtcblx0XHR0ZXN0TGluZVNwbGl0VG9rZW5zKFxuXHRcdFx0J2FiY2QgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNSwgMylcblx0XHRcdF0sXG5cdFx0XHQxMCxcblx0XHRcdCdhYmNkIGVmZ2gnLFxuXHRcdFx0JycsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNSwgMylcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzcGxpdCBpbnRoZSBtaWRkbGUgMScsICgpID0+IHtcblx0XHR0ZXN0TGluZVNwbGl0VG9rZW5zKFxuXHRcdFx0J2FiY2QgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNSwgMylcblx0XHRcdF0sXG5cdFx0XHQ1LFxuXHRcdFx0J2FiY2QnLFxuXHRcdFx0JyBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NwbGl0IGludGhlIG1pZGRsZSAyJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lU3BsaXRUb2tlbnMoXG5cdFx0XHQnYWJjZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig0LCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig1LCAzKVxuXHRcdFx0XSxcblx0XHRcdDYsXG5cdFx0XHQnYWJjZCAnLFxuXHRcdFx0J2VmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDQsIDIpXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gdGVzdExpbmVBcHBlbmRUb2tlbnMoYVRleHQ6IHN0cmluZywgYVRva2VuczogVGVzdFRva2VuW10sIGJUZXh0OiBzdHJpbmcsIGJUb2tlbnM6IFRlc3RUb2tlbltdLCBleHBlY3RlZFRleHQ6IHN0cmluZywgZXhwZWN0ZWRUb2tlbnM6IFRlc3RUb2tlbltdKTogdm9pZCB7XG5cdFx0dGVzdEFwcGx5RWRpdHMoXG5cdFx0XHRbe1xuXHRcdFx0XHR0ZXh0OiBhVGV4dCxcblx0XHRcdFx0dG9rZW5zOiBhVG9rZW5zXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRleHQ6IGJUZXh0LFxuXHRcdFx0XHR0b2tlbnM6IGJUb2tlbnNcblx0XHRcdH1dLFxuXHRcdFx0W3tcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCBhVGV4dC5sZW5ndGggKyAxLCAyLCAxKSxcblx0XHRcdFx0dGV4dDogJydcblx0XHRcdH1dLFxuXHRcdFx0W3tcblx0XHRcdFx0dGV4dDogZXhwZWN0ZWRUZXh0LFxuXHRcdFx0XHR0b2tlbnM6IGV4cGVjdGVkVG9rZW5zXG5cdFx0XHR9XVxuXHRcdCk7XG5cdH1cblxuXHR0ZXN0KCdhcHBlbmQgZW1wdHkgMScsICgpID0+IHtcblx0XHR0ZXN0TGluZUFwcGVuZFRva2Vucyhcblx0XHRcdCdhYmNkIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDQsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDUsIDMpXG5cdFx0XHRdLFxuXHRcdFx0JycsXG5cdFx0XHRbXSxcblx0XHRcdCdhYmNkIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDQsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDUsIDMpXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYXBwZW5kIGVtcHR5IDInLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVBcHBlbmRUb2tlbnMoXG5cdFx0XHQnJyxcblx0XHRcdFtdLFxuXHRcdFx0J2FiY2QgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNSwgMylcblx0XHRcdF0sXG5cdFx0XHQnYWJjZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig0LCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig1LCAzKVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGVuZCAxJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lQXBwZW5kVG9rZW5zKFxuXHRcdFx0J2FiY2QgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNSwgMylcblx0XHRcdF0sXG5cdFx0XHQnYWJjZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCA0KSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig0LCA1KSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig1LCA2KVxuXHRcdFx0XSxcblx0XHRcdCdhYmNkIGVmZ2hhYmNkIGVmZ2gnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDQsIDIpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDUsIDMpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDksIDQpLFxuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDEzLCA1KSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigxNCwgNilcblx0XHRcdF1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBlbmQgMicsICgpID0+IHtcblx0XHR0ZXN0TGluZUFwcGVuZFRva2Vucyhcblx0XHRcdCdhYmNkICcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMSksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oNCwgMilcblx0XHRcdF0sXG5cdFx0XHQnZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMylcblx0XHRcdF0sXG5cdFx0XHQnYWJjZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig0LCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig1LCAzKVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGVuZCAzJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lQXBwZW5kVG9rZW5zKFxuXHRcdFx0J2FiY2QnLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgVGVzdFRva2VuKDAsIDEpLFxuXHRcdFx0XSxcblx0XHRcdCcgZWZnaCcsXG5cdFx0XHRbXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMCwgMiksXG5cdFx0XHRcdG5ldyBUZXN0VG9rZW4oMSwgMylcblx0XHRcdF0sXG5cdFx0XHQnYWJjZCBlZmdoJyxcblx0XHRcdFtcblx0XHRcdFx0bmV3IFRlc3RUb2tlbigwLCAxKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig0LCAyKSxcblx0XHRcdFx0bmV3IFRlc3RUb2tlbig1LCAzKVxuXHRcdFx0XVxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMs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RyxDQUFDLENBQUM7QUFBQSxNQUN2RSxHQUFHO0FBQUEsUUFDRixNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUN2RSxDQUFDO0FBQUEsTUFDRCxDQUFDLEVBQUUsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQUEsTUFDM0MsQ0FBQztBQUFBLFFBQ0EsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDdkUsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGtCQUFrQixNQUFNO0FBQzVCO0FBQUEsTUFDQyxDQUFDO0FBQUEsUUFDQSxNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUN2RSxHQUFHO0FBQUEsUUFDRixNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUN2RSxHQUFHO0FBQUEsUUFDRixNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUN2RSxDQUFDO0FBQUEsTUFDRCxDQUFDLEVBQUUsT0FBTyxJQUFJLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBRSxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQUEsTUFDN0MsQ0FBQztBQUFBLFFBQ0EsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDdkUsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGtCQUFrQixNQUFNO0FBQzVCO0FBQUEsTUFDQyxDQUFDO0FBQUEsUUFDQSxNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUN2RSxHQUFHO0FBQUEsUUFDRixNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUN2RSxHQUFHO0FBQUEsUUFDRixNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUN2RSxDQUFDO0FBQUEsTUFDRCxDQUFDLEVBQUUsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQUEsTUFDM0MsQ0FBQztBQUFBLFFBQ0EsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDdkUsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGtCQUFrQixNQUFNO0FBQzVCO0FBQUEsTUFDQyxDQUFDO0FBQUEsUUFDQSxNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUN2RSxHQUFHO0FBQUEsUUFDRixNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUN2RSxHQUFHO0FBQUEsUUFDRixNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUN2RSxDQUFDO0FBQUEsTUFDRCxDQUFDLEVBQUUsT0FBTyxJQUFJLE1BQU0sR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLE1BQU0sR0FBRyxDQUFDO0FBQUEsTUFDNUMsQ0FBQztBQUFBLFFBQ0EsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxJQUFJLENBQUMsR0FBRyxJQUFJLFVBQVUsSUFBSSxDQUFDLEdBQUcsSUFBSSxVQUFVLElBQUksQ0FBQyxDQUFDO0FBQUEsTUFDekksQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLG1CQUFtQixNQUFNO0FBQzdCO0FBQUEsTUFDQyxDQUFDO0FBQUEsUUFDQSxNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUN2RSxDQUFDO0FBQUEsTUFDRCxDQUFDLEVBQUUsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLE1BQU0sS0FBSyxDQUFDO0FBQUEsTUFDN0MsQ0FBQztBQUFBLFFBQ0EsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDdkUsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLG1CQUFtQixNQUFNO0FBQzdCO0FBQUEsTUFDQyxDQUFDO0FBQUEsUUFDQSxNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUN2RSxDQUFDO0FBQUEsTUFDRCxDQUFDLEVBQUUsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLE1BQU0sS0FBSyxDQUFDO0FBQUEsTUFDN0MsQ0FBQztBQUFBLFFBQ0EsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDdkUsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLG1CQUFtQixNQUFNO0FBQzdCO0FBQUEsTUFDQyxDQUFDO0FBQUEsUUFDQSxNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUN2RSxDQUFDO0FBQUEsTUFDRCxDQUFDLEVBQUUsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLE1BQU0sS0FBSyxDQUFDO0FBQUEsTUFDN0MsQ0FBQztBQUFBLFFBQ0EsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDdkUsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLG1CQUFtQixNQUFNO0FBQzdCO0FBQUEsTUFDQyxDQUFDO0FBQUEsUUFDQSxNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUN2RSxDQUFDO0FBQUEsTUFDRCxDQUFDLEVBQUUsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLE1BQU0sS0FBSyxDQUFDO0FBQUEsTUFDN0MsQ0FBQztBQUFBLFFBQ0EsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDdkUsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLG1CQUFtQixNQUFNO0FBQzdCO0FBQUEsTUFDQyxDQUFDO0FBQUEsUUFDQSxNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUN2RSxDQUFDO0FBQUEsTUFDRCxDQUFDLEVBQUUsT0FBTyxJQUFJLE1BQU0sR0FBRyxJQUFJLEdBQUcsRUFBRSxHQUFHLE1BQU0sS0FBSyxDQUFDO0FBQUEsTUFDL0MsQ0FBQztBQUFBLFFBQ0EsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDdkUsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGtCQUFrQixNQUFNO0FBQzVCO0FBQUEsTUFDQyxDQUFDO0FBQUEsUUFDQSxNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUN2RSxDQUFDO0FBQUEsTUFDRCxDQUFDLEVBQUUsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLE1BQU0sS0FBSyxDQUFDO0FBQUEsTUFDN0MsQ0FBQztBQUFBLFFBQ0EsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQzdCLEdBQUc7QUFBQSxRQUNGLE1BQU07QUFBQSxRQUNOLFFBQVEsQ0FBQyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUM3QixDQUFDO0FBQUEsSUFDRjtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssa0JBQWtCLE1BQU07QUFDNUI7QUFBQSxNQUNDLENBQUM7QUFBQSxRQUNBLE1BQU07QUFBQSxRQUNOLFFBQVEsQ0FBQyxJQUFJLFVBQVUsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ3ZFLENBQUM7QUFBQSxNQUNELENBQUMsRUFBRSxPQUFPLElBQUksTUFBTSxHQUFHLElBQUksR0FBRyxFQUFFLEdBQUcsTUFBTSxLQUFLLENBQUM7QUFBQSxNQUMvQyxDQUFDO0FBQUEsUUFDQSxNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUN2RSxHQUFHO0FBQUEsUUFDRixNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDN0IsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGtCQUFrQixNQUFNO0FBQzVCO0FBQUEsTUFDQyxDQUFDO0FBQUEsUUFDQSxNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUN2RSxDQUFDO0FBQUEsTUFDRCxDQUFDLEVBQUUsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLE1BQU0sS0FBSyxDQUFDO0FBQUEsTUFDN0MsQ0FBQztBQUFBLFFBQ0EsTUFBTTtBQUFBLFFBQ04sUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNsRCxHQUFHO0FBQUEsUUFDRixNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDN0IsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGtCQUFrQixNQUFNO0FBQzVCO0FBQUEsTUFDQyxDQUFDO0FBQUEsUUFDQSxNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUN2RSxHQUFHO0FBQUEsUUFDRixNQUFNO0FBQUEsUUFDTixRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUN2RSxDQUFDO0FBQUEsTUFDRCxDQUFDLEVBQUUsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLE1BQU0sU0FBUyxDQUFDO0FBQUEsTUFDakQsQ0FBQztBQUFBLFFBQ0EsTUFB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LENBQUM7QUFBQSxRQUNsQixJQUFJLFVBQVUsR0FBRyxDQUFDO0FBQUEsTUFDbkI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLFFBQ0MsSUFBSSxVQUFVLEdBQUcsQ0FBQztBQUFBLFFBQ2xCLElBQUksVUFBVSxHQUFHLENBQUM7QUFBQSxRQUNsQixJQUFJLFVBQVUsR0FBRyxDQUFDO0FBQUEsTUFDbkI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLFFBQ0MsSUFBSSxVQUFVLEdBQUcsQ0FBQztBQUFBLFFBQ2xCLElBQUksVUFBVSxHQUFHLENBQUM7QUFBQSxRQUNsQixJQUFJLFVBQVUsR0FBRyxDQUFDO0FBQUEsUUFDbEIsSUFBSSxVQUFVLEdBQUcsQ0FBQztBQUFBLFFBQ2xCLElBQUksVUFBVSxJQUFJLENBQUM7QUFBQSxRQUNuQixJQUFJLFVBQVUsSUFBSSxDQUFDO0FBQUEsTUFDcEI7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxZQUFZLE1BQU07QUFDdEI7QUFBQSxNQUNDO0FBQUEsTUFDQTtBQUFBLFFBQ0MsSUFBSSxVQUFVLEdBQUcsQ0FBQztBQUFBLFFBQ2xCLElBQUksVUFBVSxHQUFHLENBQUM7QUFBQSxNQUNuQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsUUFDQyxJQUFJLFVBQVUsR0FBRyxDQUFDO0FBQUEsTUFDbkI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLFFBQ0MsSUFBSSxVQUFVLEdBQUcsQ0FBQztBQUFBLFFBQ2xCLElBQUksVUFBVSxHQUFHLENBQUM7QUFBQSxRQUNsQixJQUFJLFVBQVUsR0FBRyxDQUFDO0FBQUEsTUFDbkI7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxZQUFZLE1BQU07QUFDdEI7QUFBQSxNQUNDO0FBQUEsTUFDQTtBQUFBLFFBQ0MsSUFBSSxVQUFVLEdBQUcsQ0FBQztBQUFBLE1BQ25CO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxRQUNDLElBQUksVUFBVSxHQUFHLENBQUM7QUFBQSxRQUNsQixJQUFJLFVBQVUsR0FBRyxDQUFDO0FBQUEsTUFDbkI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLFFBQ0MsSUFBSSxVQUFVLEdBQUcsQ0FBQztBQUFBLFFBQ2xCLElBQUksVUFBVSxHQUFHLENBQUM7QUFBQSxRQUNsQixJQUFJLFVBQVUsR0FBRyxDQUFDO0FBQUEsTUFDbkI7QUFBQSxJQUNEO0FBQUEsRUFDRCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
