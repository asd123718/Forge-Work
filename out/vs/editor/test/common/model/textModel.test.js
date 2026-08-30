import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { UTF8_BOM_CHARACTER } from "../../../../base/common/strings.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../common/languages/modesRegistry.js";
import { EndOfLinePreference } from "../../../common/model.js";
import { TextModel, createTextBuffer } from "../../../common/model/textModel.js";
import { createModelServices, createTextModel } from "../testTextModel.js";
function testGuessIndentation(defaultInsertSpaces, defaultTabSize, expectedInsertSpaces, expectedTabSize, text, msg) {
  const m = createTextModel(
    text.join("\n"),
    void 0,
    {
      tabSize: defaultTabSize,
      insertSpaces: defaultInsertSpaces,
      detectIndentation: true
    }
  );
  const r = m.getOptions();
  m.dispose();
  assert.strictEqual(r.insertSpaces, expectedInsertSpaces, msg);
  assert.strictEqual(r.tabSize, expectedTabSize, msg);
}
function assertGuess(expectedInsertSpaces, expectedTabSize, text, msg) {
  if (typeof expectedInsertSpaces === "undefined") {
    if (typeof expectedTabSize === "undefined") {
      testGuessIndentation(true, 13370, true, 13370, text, msg);
      testGuessIndentation(false, 13371, false, 13371, text, msg);
    } else if (typeof expectedTabSize === "number") {
      testGuessIndentation(true, 13370, true, expectedTabSize, text, msg);
      testGuessIndentation(false, 13371, false, expectedTabSize, text, msg);
    } else {
      testGuessIndentation(true, 13370, true, expectedTabSize[0], text, msg);
      testGuessIndentation(false, 13371, false, 13371, text, msg);
    }
  } else {
    if (typeof expectedTabSize === "undefined") {
      testGuessIndentation(true, 13370, expectedInsertSpaces, 13370, text, msg);
      testGuessIndentation(false, 13371, expectedInsertSpaces, 13371, text, msg);
    } else if (typeof expectedTabSize === "number") {
      testGuessIndentation(true, 13370, expectedInsertSpaces, expectedTabSize, text, msg);
      testGuessIndentation(false, 13371, expectedInsertSpaces, expectedTabSize, text, msg);
    } else {
      if (expectedInsertSpaces === true) {
        testGuessIndentation(true, 13370, expectedInsertSpaces, expectedTabSize[0], text, msg);
        testGuessIndentation(false, 13371, expectedInsertSpaces, expectedTabSize[0], text, msg);
      } else {
        testGuessIndentation(true, 13370, expectedInsertSpaces, 13370, text, msg);
        testGuessIndentation(false, 13371, expectedInsertSpaces, 13371, text, msg);
      }
    }
  }
}
suite("TextModelData.fromString", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function testTextModelDataFromString(text, expected) {
    const { textBuffer, disposable } = createTextBuffer(text, TextModel.DEFAULT_CREATION_OPTIONS.defaultEOL);
    const actual = {
      EOL: textBuffer.getEOL(),
      lines: textBuffer.getLinesContent(),
      containsRTL: textBuffer.mightContainRTL(),
      isBasicASCII: !textBuffer.mightContainNonBasicASCII()
    };
    assert.deepStrictEqual(actual, expected);
    disposable.dispose();
  }
  test("one line text", () => {
    testTextModelDataFromString(
      "Hello world!",
      {
        EOL: "\n",
        lines: [
          "Hello world!"
        ],
        containsRTL: false,
        isBasicASCII: true
      }
    );
  });
  test("multiline text", () => {
    testTextModelDataFromString(
      "Hello,\r\ndear friend\nHow\rare\r\nyou?",
      {
        EOL: "\r\n",
        lines: [
          "Hello,",
          "dear friend",
          "How",
          "are",
          "you?"
        ],
        containsRTL: false,
        isBasicASCII: true
      }
    );
  });
  test("Non Basic ASCII 1", () => {
    testTextModelDataFromString(
      "Hello,\nZ\xFCrich",
      {
        EOL: "\n",
        lines: [
          "Hello,",
          "Z\xFCrich"
        ],
        containsRTL: false,
        isBasicASCII: false
      }
    );
  });
  test("containsRTL 1", () => {
    testTextModelDataFromString(
      "Hello,\n\u05D6\u05D5\u05D4\u05D9 \u05E2\u05D5\u05D1\u05D3\u05D4 \u05DE\u05D1\u05D5\u05E1\u05E1\u05EA \u05E9\u05D3\u05E2\u05EA\u05D5",
      {
        EOL: "\n",
        lines: [
          "Hello,",
          "\u05D6\u05D5\u05D4\u05D9 \u05E2\u05D5\u05D1\u05D3\u05D4 \u05DE\u05D1\u05D5\u05E1\u05E1\u05EA \u05E9\u05D3\u05E2\u05EA\u05D5"
        ],
        containsRTL: true,
        isBasicASCII: false
      }
    );
  });
  test("containsRTL 2", () => {
    testTextModelDataFromString(
      "Hello,\n\u0647\u0646\u0627\u0643 \u062D\u0642\u064A\u0642\u0629 \u0645\u062B\u0628\u062A\u0629 \u0645\u0646\u0630 \u0632\u0645\u0646 \u0637\u0648\u064A\u0644",
      {
        EOL: "\n",
        lines: [
          "Hello,",
          "\u0647\u0646\u0627\u0643 \u062D\u0642\u064A\u0642\u0629 \u0645\u062B\u0628\u062A\u0629 \u0645\u0646\u0630 \u0632\u0645\u0646 \u0637\u0648\u064A\u0644"
        ],
        containsRTL: true,
        isBasicASCII: false
      }
    );
  });
});
suite("Editor Model - TextModel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("TextModel does not use events internally", () => {
    const disposables = new DisposableStore();
    const instantiationService = createModelServices(disposables);
    const textModel = disposables.add(instantiationService.createInstance(TextModel, "", PLAINTEXT_LANGUAGE_ID, TextModel.DEFAULT_CREATION_OPTIONS, null));
    assert.strictEqual(textModel._hasListeners(), false);
    disposables.dispose();
  });
  test("getValueLengthInRange", () => {
    let m = createTextModel("My First Line\r\nMy Second Line\r\nMy Third Line");
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1, 1)), "".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1, 2)), "M".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 1, 3)), "y".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1, 14)), "My First Line".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 2, 1)), "My First Line\r\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 2, 1)), "y First Line\r\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 2, 2)), "y First Line\r\nM".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 2, 1e3)), "y First Line\r\nMy Second Line".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 3, 1)), "y First Line\r\nMy Second Line\r\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 3, 1e3)), "y First Line\r\nMy Second Line\r\nMy Third Line".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1e3, 1e3)), "My First Line\r\nMy Second Line\r\nMy Third Line".length);
    m.dispose();
    m = createTextModel("My First Line\nMy Second Line\nMy Third Line");
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1, 1)), "".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1, 2)), "M".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 1, 3)), "y".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1, 14)), "My First Line".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 2, 1)), "My First Line\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 2, 1)), "y First Line\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 2, 2)), "y First Line\nM".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 2, 1e3)), "y First Line\nMy Second Line".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 3, 1)), "y First Line\nMy Second Line\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 2, 3, 1e3)), "y First Line\nMy Second Line\nMy Third Line".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1e3, 1e3)), "My First Line\nMy Second Line\nMy Third Line".length);
    m.dispose();
  });
  test("getValueLengthInRange different EOL", () => {
    let m = createTextModel("My First Line\r\nMy Second Line\r\nMy Third Line");
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 2, 1), EndOfLinePreference.TextDefined), "My First Line\r\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 2, 1), EndOfLinePreference.CRLF), "My First Line\r\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 2, 1), EndOfLinePreference.LF), "My First Line\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1e3, 1e3), EndOfLinePreference.TextDefined), "My First Line\r\nMy Second Line\r\nMy Third Line".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1e3, 1e3), EndOfLinePreference.CRLF), "My First Line\r\nMy Second Line\r\nMy Third Line".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1e3, 1e3), EndOfLinePreference.LF), "My First Line\nMy Second Line\nMy Third Line".length);
    m.dispose();
    m = createTextModel("My First Line\nMy Second Line\nMy Third Line");
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 2, 1), EndOfLinePreference.TextDefined), "My First Line\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 2, 1), EndOfLinePreference.LF), "My First Line\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 2, 1), EndOfLinePreference.CRLF), "My First Line\r\n".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1e3, 1e3), EndOfLinePreference.TextDefined), "My First Line\nMy Second Line\nMy Third Line".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1e3, 1e3), EndOfLinePreference.LF), "My First Line\nMy Second Line\nMy Third Line".length);
    assert.strictEqual(m.getValueLengthInRange(new Range(1, 1, 1e3, 1e3), EndOfLinePreference.CRLF), "My First Line\r\nMy Second Line\r\nMy Third Line".length);
    m.dispose();
  });
  test("guess indentation 1", () => {
    assertGuess(void 0, void 0, [
      "x",
      "x",
      "x",
      "x",
      "x",
      "x",
      "x"
    ], "no clues");
    assertGuess(false, void 0, [
      "	x",
      "x",
      "x",
      "x",
      "x",
      "x",
      "x"
    ], "no spaces, 1xTAB");
    assertGuess(true, 2, [
      "  x",
      "x",
      "x",
      "x",
      "x",
      "x",
      "x"
    ], "1x2");
    assertGuess(false, void 0, [
      "	x",
      "	x",
      "	x",
      "	x",
      "	x",
      "	x",
      "	x"
    ], "7xTAB");
    assertGuess(void 0, [2], [
      "	x",
      "  x",
      "	x",
      "  x",
      "	x",
      "  x",
      "	x",
      "  x"
    ], "4x2, 4xTAB");
    assertGuess(false, void 0, [
      "	x",
      " x",
      "	x",
      " x",
      "	x",
      " x",
      "	x",
      " x"
    ], "4x1, 4xTAB");
    assertGuess(false, void 0, [
      "	x",
      "	x",
      "  x",
      "	x",
      "  x",
      "	x",
      "  x",
      "	x",
      "  x"
    ], "4x2, 5xTAB");
    assertGuess(false, void 0, [
      "	x",
      "	x",
      "x",
      "	x",
      "x",
      "	x",
      "x",
      "	x",
      "  x"
    ], "1x2, 5xTAB");
    assertGuess(false, void 0, [
      "	x",
      "	x",
      "x",
      "	x",
      "x",
      "	x",
      "x",
      "	x",
      "    x"
    ], "1x4, 5xTAB");
    assertGuess(false, void 0, [
      "	x",
      "	x",
      "x",
      "	x",
      "x",
      "	x",
      "  x",
      "	x",
      "    x"
    ], "1x2, 1x4, 5xTAB");
    assertGuess(void 0, void 0, [
      "x",
      " x",
      " x",
      " x",
      " x",
      " x",
      " x",
      " x"
    ], "7x1 - 1 space is never guessed as an indentation");
    assertGuess(true, void 0, [
      "x",
      "          x",
      " x",
      " x",
      " x",
      " x",
      " x",
      " x"
    ], "1x10, 6x1");
    assertGuess(void 0, void 0, [
      "",
      "  ",
      "    ",
      "      ",
      "        ",
      "          ",
      "            ",
      "              "
    ], "whitespace lines don't count");
    assertGuess(true, 3, [
      "x",
      "   x",
      "   x",
      "    x",
      "x",
      "   x",
      "   x",
      "    x",
      "x",
      "   x",
      "   x",
      "    x"
    ], "6x3, 3x4");
    assertGuess(true, 5, [
      "x",
      "     x",
      "     x",
      "    x",
      "x",
      "     x",
      "     x",
      "    x",
      "x",
      "     x",
      "     x",
      "    x"
    ], "6x5, 3x4");
    assertGuess(true, 7, [
      "x",
      "       x",
      "       x",
      "     x",
      "x",
      "       x",
      "       x",
      "    x",
      "x",
      "       x",
      "       x",
      "    x"
    ], "6x7, 1x5, 2x4");
    assertGuess(true, 2, [
      "x",
      "  x",
      "  x",
      "  x",
      "  x",
      "x",
      "  x",
      "  x",
      "  x",
      "  x"
    ], "8x2");
    assertGuess(true, 2, [
      "x",
      "  x",
      "  x",
      "x",
      "  x",
      "  x",
      "x",
      "  x",
      "  x",
      "x",
      "  x",
      "  x"
    ], "8x2");
    assertGuess(true, 2, [
      "x",
      "  x",
      "    x",
      "x",
      "  x",
      "    x",
      "x",
      "  x",
      "    x",
      "x",
      "  x",
      "    x"
    ], "4x2, 4x4");
    assertGuess(true, 2, [
      "x",
      "  x",
      "  x",
      "    x",
      "x",
      "  x",
      "  x",
      "    x",
      "x",
      "  x",
      "  x",
      "    x"
    ], "6x2, 3x4");
    assertGuess(true, 2, [
      "x",
      "  x",
      "  x",
      "    x",
      "    x",
      "x",
      "  x",
      "  x",
      "    x",
      "    x"
    ], "4x2, 4x4");
    assertGuess(true, 2, [
      "x",
      "  x",
      "    x",
      "    x",
      "x",
      "  x",
      "    x",
      "    x"
    ], "2x2, 4x4");
    assertGuess(true, 4, [
      "x",
      "    x",
      "    x",
      "x",
      "    x",
      "    x",
      "x",
      "    x",
      "    x",
      "x",
      "    x",
      "    x"
    ], "8x4");
    assertGuess(true, 2, [
      "x",
      "  x",
      "    x",
      "    x",
      "      x",
      "x",
      "  x",
      "    x",
      "    x",
      "      x"
    ], "2x2, 4x4, 2x6");
    assertGuess(true, 2, [
      "x",
      "  x",
      "    x",
      "    x",
      "      x",
      "      x",
      "        x"
    ], "1x2, 2x4, 2x6, 1x8");
    assertGuess(true, 4, [
      "x",
      "    x",
      "    x",
      "    x",
      "     x",
      "        x",
      "x",
      "    x",
      "    x",
      "    x",
      "     x",
      "        x"
    ], "6x4, 2x5, 2x8");
    assertGuess(true, 4, [
      "x",
      "    x",
      "    x",
      "    x",
      "     x",
      "        x",
      "        x"
    ], "3x4, 1x5, 2x8");
    assertGuess(true, 4, [
      "x",
      "x",
      "    x",
      "    x",
      "     x",
      "        x",
      "        x",
      "x",
      "x",
      "    x",
      "    x",
      "     x",
      "        x",
      "        x"
    ], "6x4, 2x5, 4x8");
    assertGuess(true, 3, [
      "x",
      " x",
      " x",
      " x",
      " x",
      " x",
      "x",
      "   x",
      "    x",
      "    x"
    ], "5x1, 2x0, 1x3, 2x4");
    assertGuess(false, void 0, [
      "	 x",
      " 	 x",
      "	x"
    ], "mixed whitespace 1");
    assertGuess(false, void 0, [
      "	x",
      "	    x"
    ], "mixed whitespace 2");
  });
  test("issue #44991: Wrong indentation size auto-detection", () => {
    assertGuess(true, 4, [
      "a = 10             # 0 space indent",
      "b = 5              # 0 space indent",
      "if a > 10:         # 0 space indent",
      "    a += 1         # 4 space indent      delta 4 spaces",
      "    if b > 5:      # 4 space indent",
      "        b += 1     # 8 space indent      delta 4 spaces",
      "        b += 1     # 8 space indent",
      "        b += 1     # 8 space indent",
      "# comment line 1   # 0 space indent      delta 8 spaces",
      "# comment line 2   # 0 space indent",
      "# comment line 3   # 0 space indent",
      "        b += 1     # 8 space indent      delta 8 spaces",
      "        b += 1     # 8 space indent",
      "        b += 1     # 8 space indent"
    ]);
  });
  test("issue #55818: Broken indentation detection", () => {
    assertGuess(true, 2, [
      "",
      "/* REQUIRE */",
      "",
      "const foo = require ( 'foo' ),",
      "      bar = require ( 'bar' );",
      "",
      "/* MY FN */",
      "",
      "function myFn () {",
      "",
      "  const asd = 1,",
      "        dsa = 2;",
      "",
      "  return bar ( foo ( asd ) );",
      "",
      "}",
      "",
      "/* EXPORT */",
      "",
      "module.exports = myFn;",
      ""
    ]);
  });
  test("issue #70832: Broken indentation detection", () => {
    assertGuess(false, void 0, [
      "x",
      "x",
      "x",
      "x",
      "	x",
      "		x",
      "    x",
      "		x",
      "	x",
      "		x",
      "	x",
      "	x",
      "	x",
      "	x",
      "x"
    ]);
  });
  test("issue #62143: Broken indentation detection", () => {
    assertGuess(true, 2, [
      "x",
      "x",
      "  x",
      "  x"
    ]);
    assertGuess(true, 2, [
      "x",
      "  - item2",
      "  - item3"
    ]);
    testGuessIndentation(true, 2, true, 2, [
      "x x",
      "  x",
      "  x"
    ]);
    testGuessIndentation(true, 2, true, 2, [
      "x x",
      "  x",
      "  x",
      "    x"
    ]);
    testGuessIndentation(true, 2, true, 2, [
      "<!--test1.md -->",
      "- item1",
      "  - item2",
      "    - item3"
    ]);
  });
  test("issue #84217: Broken indentation detection", () => {
    assertGuess(true, 4, [
      "def main():",
      "    print('hello')"
    ]);
    assertGuess(true, 4, [
      "def main():",
      "    with open('foo') as fp:",
      "        print(fp.read())"
    ]);
  });
  test("issue #65668: YAML file indented with 2 spaces", () => {
    assertGuess(true, 2, [
      "version: 2",
      "",
      "jobs:",
      "  build:",
      "    docker:",
      "      - circleci/golang:1.11",
      "",
      "  environment:",
      "    TEST_RESULTS: /tmp/test-results",
      "",
      "  steps:",
      "    - checkout",
      "    - run: mkdir -p $TEST_RESULTS",
      "",
      "    - restore_cache:",
      "        keys:",
      "          - v1-pkg-cache",
      "",
      "    - run:",
      "        name: dep ensure",
      "        command: dep ensure -v",
      "",
      "    - run:",
      "        name: Run unit tests",
      "        command: |",
      '          trap "go-junit-report <${TEST_RESULTS}/go-test.out > ${TEST_RESULTS}/go-test-report.xml" EXIT',
      "          go test -v ./... | tee ${TEST_RESULTS}/go-test.out",
      "",
      "    - run:",
      "        name: Build",
      "        command: go build -v",
      "",
      "    - save_cache:",
      "        key: v1-pkg-cache",
      "        paths:",
      '          - "/go/pkg"',
      "",
      "    - store_artifacts:",
      "        path: /tmp/test-results",
      "        destination: raw-test-output",
      "",
      "    - store_test_results:",
      "        path: /tmp/test-results"
    ]);
  });
  test("issue #249040: 4-space indent should win over 2-space when predominant", () => {
    assertGuess(true, 4, [
      "function foo() {",
      "    let a = 1;",
      "    let b = 2;",
      "    if (true) {",
      "        console.log(a);",
      "        console.log(b);",
      "    }",
      "    const obj = {",
      "      x: 1,",
      // 2-space indent here
      "      y: 2",
      // 2-space indent here
      "    };",
      "    return obj;",
      "}"
    ]);
  });
  test("validatePosition", () => {
    const m = createTextModel("line one\nline two");
    assert.deepStrictEqual(m.validatePosition(new Position(0, 0)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(0, 1)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 1)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 2)), new Position(1, 2));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 30)), new Position(1, 9));
    assert.deepStrictEqual(m.validatePosition(new Position(2, 0)), new Position(2, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(2, 1)), new Position(2, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(2, 2)), new Position(2, 2));
    assert.deepStrictEqual(m.validatePosition(new Position(2, 30)), new Position(2, 9));
    assert.deepStrictEqual(m.validatePosition(new Position(3, 0)), new Position(2, 9));
    assert.deepStrictEqual(m.validatePosition(new Position(3, 1)), new Position(2, 9));
    assert.deepStrictEqual(m.validatePosition(new Position(3, 30)), new Position(2, 9));
    assert.deepStrictEqual(m.validatePosition(new Position(30, 30)), new Position(2, 9));
    assert.deepStrictEqual(m.validatePosition(new Position(-123.123, -0.5)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(Number.MIN_VALUE, Number.MIN_VALUE)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(Number.MAX_VALUE, Number.MAX_VALUE)), new Position(2, 9));
    assert.deepStrictEqual(m.validatePosition(new Position(123.23, 47.5)), new Position(2, 9));
    m.dispose();
  });
  test("validatePosition around high-low surrogate pairs 1", () => {
    const m = createTextModel("a\u{1F4DA}b");
    assert.deepStrictEqual(m.validatePosition(new Position(0, 0)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(0, 1)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(0, 7)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 1)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 2)), new Position(1, 2));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 3)), new Position(1, 2));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 4)), new Position(1, 4));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 5)), new Position(1, 5));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 30)), new Position(1, 5));
    assert.deepStrictEqual(m.validatePosition(new Position(2, 0)), new Position(1, 5));
    assert.deepStrictEqual(m.validatePosition(new Position(2, 1)), new Position(1, 5));
    assert.deepStrictEqual(m.validatePosition(new Position(2, 2)), new Position(1, 5));
    assert.deepStrictEqual(m.validatePosition(new Position(2, 30)), new Position(1, 5));
    assert.deepStrictEqual(m.validatePosition(new Position(-123.123, -0.5)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(Number.MIN_VALUE, Number.MIN_VALUE)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(Number.MAX_VALUE, Number.MAX_VALUE)), new Position(1, 5));
    assert.deepStrictEqual(m.validatePosition(new Position(123.23, 47.5)), new Position(1, 5));
    m.dispose();
  });
  test("validatePosition around high-low surrogate pairs 2", () => {
    const m = createTextModel("a\u{1F4DA}\u{1F4DA}b");
    assert.deepStrictEqual(m.validatePosition(new Position(1, 1)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 2)), new Position(1, 2));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 3)), new Position(1, 2));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 4)), new Position(1, 4));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 5)), new Position(1, 4));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 6)), new Position(1, 6));
    assert.deepStrictEqual(m.validatePosition(new Position(1, 7)), new Position(1, 7));
    m.dispose();
  });
  test("validatePosition handle NaN.", () => {
    const m = createTextModel("line one\nline two");
    assert.deepStrictEqual(m.validatePosition(new Position(NaN, 1)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(1, NaN)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(NaN, NaN)), new Position(1, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(2, NaN)), new Position(2, 1));
    assert.deepStrictEqual(m.validatePosition(new Position(NaN, 3)), new Position(1, 3));
    m.dispose();
  });
  test("issue #71480: validatePosition handle floats", () => {
    const m = createTextModel("line one\nline two");
    assert.deepStrictEqual(m.validatePosition(new Position(0.2, 1)), new Position(1, 1), "a");
    assert.deepStrictEqual(m.validatePosition(new Position(1.2, 1)), new Position(1, 1), "b");
    assert.deepStrictEqual(m.validatePosition(new Position(1.5, 2)), new Position(1, 2), "c");
    assert.deepStrictEqual(m.validatePosition(new Position(1.8, 3)), new Position(1, 3), "d");
    assert.deepStrictEqual(m.validatePosition(new Position(1, 0.3)), new Position(1, 1), "e");
    assert.deepStrictEqual(m.validatePosition(new Position(2, 0.8)), new Position(2, 1), "f");
    assert.deepStrictEqual(m.validatePosition(new Position(1, 1.2)), new Position(1, 1), "g");
    assert.deepStrictEqual(m.validatePosition(new Position(2, 1.5)), new Position(2, 1), "h");
    m.dispose();
  });
  test("issue #71480: validateRange handle floats", () => {
    const m = createTextModel("line one\nline two");
    assert.deepStrictEqual(m.validateRange(new Range(0.2, 1.5, 0.8, 2.5)), new Range(1, 1, 1, 1));
    assert.deepStrictEqual(m.validateRange(new Range(1.2, 1.7, 1.8, 2.2)), new Range(1, 1, 1, 2));
    m.dispose();
  });
  test("validateRange around high-low surrogate pairs 1", () => {
    const m = createTextModel("a\u{1F4DA}b");
    assert.deepStrictEqual(m.validateRange(new Range(0, 0, 0, 1)), new Range(1, 1, 1, 1));
    assert.deepStrictEqual(m.validateRange(new Range(0, 0, 0, 7)), new Range(1, 1, 1, 1));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 1)), new Range(1, 1, 1, 1));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 2)), new Range(1, 1, 1, 2));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 3)), new Range(1, 1, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 4)), new Range(1, 1, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 5)), new Range(1, 1, 1, 5));
    assert.deepStrictEqual(m.validateRange(new Range(1, 2, 1, 2)), new Range(1, 2, 1, 2));
    assert.deepStrictEqual(m.validateRange(new Range(1, 2, 1, 3)), new Range(1, 2, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 2, 1, 4)), new Range(1, 2, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 2, 1, 5)), new Range(1, 2, 1, 5));
    assert.deepStrictEqual(m.validateRange(new Range(1, 3, 1, 3)), new Range(1, 2, 1, 2));
    assert.deepStrictEqual(m.validateRange(new Range(1, 3, 1, 4)), new Range(1, 2, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 3, 1, 5)), new Range(1, 2, 1, 5));
    assert.deepStrictEqual(m.validateRange(new Range(1, 4, 1, 4)), new Range(1, 4, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 4, 1, 5)), new Range(1, 4, 1, 5));
    assert.deepStrictEqual(m.validateRange(new Range(1, 5, 1, 5)), new Range(1, 5, 1, 5));
    m.dispose();
  });
  test("validateRange around high-low surrogate pairs 2", () => {
    const m = createTextModel("a\u{1F4DA}\u{1F4DA}b");
    assert.deepStrictEqual(m.validateRange(new Range(0, 0, 0, 1)), new Range(1, 1, 1, 1));
    assert.deepStrictEqual(m.validateRange(new Range(0, 0, 0, 7)), new Range(1, 1, 1, 1));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 1)), new Range(1, 1, 1, 1));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 2)), new Range(1, 1, 1, 2));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 3)), new Range(1, 1, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 4)), new Range(1, 1, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 5)), new Range(1, 1, 1, 6));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 6)), new Range(1, 1, 1, 6));
    assert.deepStrictEqual(m.validateRange(new Range(1, 1, 1, 7)), new Range(1, 1, 1, 7));
    assert.deepStrictEqual(m.validateRange(new Range(1, 2, 1, 2)), new Range(1, 2, 1, 2));
    assert.deepStrictEqual(m.validateRange(new Range(1, 2, 1, 3)), new Range(1, 2, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 2, 1, 4)), new Range(1, 2, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 2, 1, 5)), new Range(1, 2, 1, 6));
    assert.deepStrictEqual(m.validateRange(new Range(1, 2, 1, 6)), new Range(1, 2, 1, 6));
    assert.deepStrictEqual(m.validateRange(new Range(1, 2, 1, 7)), new Range(1, 2, 1, 7));
    assert.deepStrictEqual(m.validateRange(new Range(1, 3, 1, 3)), new Range(1, 2, 1, 2));
    assert.deepStrictEqual(m.validateRange(new Range(1, 3, 1, 4)), new Range(1, 2, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 3, 1, 5)), new Range(1, 2, 1, 6));
    assert.deepStrictEqual(m.validateRange(new Range(1, 3, 1, 6)), new Range(1, 2, 1, 6));
    assert.deepStrictEqual(m.validateRange(new Range(1, 3, 1, 7)), new Range(1, 2, 1, 7));
    assert.deepStrictEqual(m.validateRange(new Range(1, 4, 1, 4)), new Range(1, 4, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 4, 1, 5)), new Range(1, 4, 1, 6));
    assert.deepStrictEqual(m.validateRange(new Range(1, 4, 1, 6)), new Range(1, 4, 1, 6));
    assert.deepStrictEqual(m.validateRange(new Range(1, 4, 1, 7)), new Range(1, 4, 1, 7));
    assert.deepStrictEqual(m.validateRange(new Range(1, 5, 1, 5)), new Range(1, 4, 1, 4));
    assert.deepStrictEqual(m.validateRange(new Range(1, 5, 1, 6)), new Range(1, 4, 1, 6));
    assert.deepStrictEqual(m.validateRange(new Range(1, 5, 1, 7)), new Range(1, 4, 1, 7));
    assert.deepStrictEqual(m.validateRange(new Range(1, 6, 1, 6)), new Range(1, 6, 1, 6));
    assert.deepStrictEqual(m.validateRange(new Range(1, 6, 1, 7)), new Range(1, 6, 1, 7));
    assert.deepStrictEqual(m.validateRange(new Range(1, 7, 1, 7)), new Range(1, 7, 1, 7));
    m.dispose();
  });
  test("modifyPosition", () => {
    const m = createTextModel("line one\nline two");
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 1), 0), new Position(1, 1));
    assert.deepStrictEqual(m.modifyPosition(new Position(0, 0), 0), new Position(1, 1));
    assert.deepStrictEqual(m.modifyPosition(new Position(30, 1), 0), new Position(2, 9));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 1), 17), new Position(2, 9));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 1), 1), new Position(1, 2));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 1), 3), new Position(1, 4));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 2), 10), new Position(2, 3));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 5), 13), new Position(2, 9));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 2), 16), new Position(2, 9));
    assert.deepStrictEqual(m.modifyPosition(new Position(2, 9), -17), new Position(1, 1));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 2), -1), new Position(1, 1));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 4), -3), new Position(1, 1));
    assert.deepStrictEqual(m.modifyPosition(new Position(2, 3), -10), new Position(1, 2));
    assert.deepStrictEqual(m.modifyPosition(new Position(2, 9), -13), new Position(1, 5));
    assert.deepStrictEqual(m.modifyPosition(new Position(2, 9), -16), new Position(1, 2));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 2), 17), new Position(2, 9));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 2), 100), new Position(2, 9));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 2), -2), new Position(1, 1));
    assert.deepStrictEqual(m.modifyPosition(new Position(1, 2), -100), new Position(1, 1));
    assert.deepStrictEqual(m.modifyPosition(new Position(2, 2), -100), new Position(1, 1));
    assert.deepStrictEqual(m.modifyPosition(new Position(2, 9), -18), new Position(1, 1));
    m.dispose();
  });
  test("normalizeIndentation 1", () => {
    const model = createTextModel(
      "",
      void 0,
      {
        insertSpaces: false
      }
    );
    assert.strictEqual(model.normalizeIndentation("	"), "	");
    assert.strictEqual(model.normalizeIndentation("    "), "	");
    assert.strictEqual(model.normalizeIndentation("   "), "   ");
    assert.strictEqual(model.normalizeIndentation("  "), "  ");
    assert.strictEqual(model.normalizeIndentation(" "), " ");
    assert.strictEqual(model.normalizeIndentation(""), "");
    assert.strictEqual(model.normalizeIndentation(" 	    "), "		");
    assert.strictEqual(model.normalizeIndentation(" 	   "), "	   ");
    assert.strictEqual(model.normalizeIndentation(" 	  "), "	  ");
    assert.strictEqual(model.normalizeIndentation(" 	 "), "	 ");
    assert.strictEqual(model.normalizeIndentation(" 	"), "	");
    assert.strictEqual(model.normalizeIndentation("	a"), "	a");
    assert.strictEqual(model.normalizeIndentation("    a"), "	a");
    assert.strictEqual(model.normalizeIndentation("   a"), "   a");
    assert.strictEqual(model.normalizeIndentation("  a"), "  a");
    assert.strictEqual(model.normalizeIndentation(" a"), " a");
    assert.strictEqual(model.normalizeIndentation("a"), "a");
    assert.strictEqual(model.normalizeIndentation(" 	    a"), "		a");
    assert.strictEqual(model.normalizeIndentation(" 	   a"), "	   a");
    assert.strictEqual(model.normalizeIndentation(" 	  a"), "	  a");
    assert.strictEqual(model.normalizeIndentation(" 	 a"), "	 a");
    assert.strictEqual(model.normalizeIndentation(" 	a"), "	a");
    model.dispose();
  });
  test("normalizeIndentation 2", () => {
    const model = createTextModel("");
    assert.strictEqual(model.normalizeIndentation("	a"), "    a");
    assert.strictEqual(model.normalizeIndentation("    a"), "    a");
    assert.strictEqual(model.normalizeIndentation("   a"), "   a");
    assert.strictEqual(model.normalizeIndentation("  a"), "  a");
    assert.strictEqual(model.normalizeIndentation(" a"), " a");
    assert.strictEqual(model.normalizeIndentation("a"), "a");
    assert.strictEqual(model.normalizeIndentation(" 	    a"), "        a");
    assert.strictEqual(model.normalizeIndentation(" 	   a"), "       a");
    assert.strictEqual(model.normalizeIndentation(" 	  a"), "      a");
    assert.strictEqual(model.normalizeIndentation(" 	 a"), "     a");
    assert.strictEqual(model.normalizeIndentation(" 	a"), "    a");
    model.dispose();
  });
  test("getLineFirstNonWhitespaceColumn", () => {
    const model = createTextModel([
      "asd",
      " asd",
      "	asd",
      "  asd",
      "		asd",
      " ",
      "  ",
      "	",
      "		",
      "  	asd",
      "",
      ""
    ].join("\n"));
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(1), 1, "1");
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(2), 2, "2");
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(3), 2, "3");
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(4), 3, "4");
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(5), 3, "5");
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(6), 0, "6");
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(7), 0, "7");
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(8), 0, "8");
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(9), 0, "9");
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(10), 4, "10");
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(11), 0, "11");
    assert.strictEqual(model.getLineFirstNonWhitespaceColumn(12), 0, "12");
    model.dispose();
  });
  test("getLineLastNonWhitespaceColumn", () => {
    const model = createTextModel([
      "asd",
      "asd ",
      "asd	",
      "asd  ",
      "asd		",
      " ",
      "  ",
      "	",
      "		",
      "asd  	",
      "",
      ""
    ].join("\n"));
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(1), 4, "1");
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(2), 4, "2");
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(3), 4, "3");
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(4), 4, "4");
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(5), 4, "5");
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(6), 0, "6");
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(7), 0, "7");
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(8), 0, "8");
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(9), 0, "9");
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(10), 4, "10");
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(11), 0, "11");
    assert.strictEqual(model.getLineLastNonWhitespaceColumn(12), 0, "12");
    model.dispose();
  });
  test("#50471. getValueInRange with invalid range", () => {
    const m = createTextModel("My First Line\r\nMy Second Line\r\nMy Third Line");
    assert.strictEqual(m.getValueInRange(new Range(1, NaN, 1, 3)), "My");
    assert.strictEqual(m.getValueInRange(new Range(NaN, NaN, NaN, NaN)), "");
    m.dispose();
  });
  test('issue #168836: updating tabSize should also update indentSize when indentSize is set to "tabSize"', () => {
    const m = createTextModel("some text", null, {
      tabSize: 2,
      indentSize: "tabSize"
    });
    assert.strictEqual(m.getOptions().tabSize, 2);
    assert.strictEqual(m.getOptions().indentSize, 2);
    assert.strictEqual(m.getOptions().originalIndentSize, "tabSize");
    m.updateOptions({
      tabSize: 4
    });
    assert.strictEqual(m.getOptions().tabSize, 4);
    assert.strictEqual(m.getOptions().indentSize, 4);
    assert.strictEqual(m.getOptions().originalIndentSize, "tabSize");
    m.dispose();
  });
});
suite("TextModel.mightContainRTL", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("nope", () => {
    const model = createTextModel("hello world!");
    assert.strictEqual(model.mightContainRTL(), false);
    model.dispose();
  });
  test("yes", () => {
    const model = createTextModel("Hello,\n\u05D6\u05D5\u05D4\u05D9 \u05E2\u05D5\u05D1\u05D3\u05D4 \u05DE\u05D1\u05D5\u05E1\u05E1\u05EA \u05E9\u05D3\u05E2\u05EA\u05D5");
    assert.strictEqual(model.mightContainRTL(), true);
    model.dispose();
  });
  test("setValue resets 1", () => {
    const model = createTextModel("hello world!");
    assert.strictEqual(model.mightContainRTL(), false);
    model.setValue("Hello,\n\u05D6\u05D5\u05D4\u05D9 \u05E2\u05D5\u05D1\u05D3\u05D4 \u05DE\u05D1\u05D5\u05E1\u05E1\u05EA \u05E9\u05D3\u05E2\u05EA\u05D5");
    assert.strictEqual(model.mightContainRTL(), true);
    model.dispose();
  });
  test("setValue resets 2", () => {
    const model = createTextModel("Hello,\n\u0647\u0646\u0627\u0643 \u062D\u0642\u064A\u0642\u0629 \u0645\u062B\u0628\u062A\u0629 \u0645\u0646\u0630 \u0632\u0645\u0646 \u0637\u0648\u064A\u0644");
    assert.strictEqual(model.mightContainRTL(), true);
    model.setValue("hello world!");
    assert.strictEqual(model.mightContainRTL(), false);
    model.dispose();
  });
});
suite("TextModel.createSnapshot", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("empty file", () => {
    const model = createTextModel("");
    const snapshot = model.createSnapshot();
    assert.strictEqual(snapshot.read(), null);
    model.dispose();
  });
  test("file with BOM", () => {
    const model = createTextModel(UTF8_BOM_CHARACTER + "Hello");
    assert.strictEqual(model.getLineContent(1), "Hello");
    const snapshot = model.createSnapshot(true);
    assert.strictEqual(snapshot.read(), UTF8_BOM_CHARACTER + "Hello");
    assert.strictEqual(snapshot.read(), null);
    model.dispose();
  });
  test("regular file", () => {
    const model = createTextModel("My First Line\n		My Second Line\n    Third Line\n\n1");
    const snapshot = model.createSnapshot();
    assert.strictEqual(snapshot.read(), "My First Line\n		My Second Line\n    Third Line\n\n1");
    assert.strictEqual(snapshot.read(), null);
    model.dispose();
  });
  test("large file", () => {
    const lines = [];
    for (let i = 0; i < 1e3; i++) {
      lines[i] = "Just some text that is a bit long such that it can consume some memory";
    }
    const text = lines.join("\n");
    const model = createTextModel(text);
    const snapshot = model.createSnapshot();
    let actual = "";
    const tmp1 = snapshot.read();
    assert.ok(tmp1);
    actual += tmp1;
    const tmp2 = snapshot.read();
    if (tmp2 === null) {
    } else {
      actual += tmp2;
      assert.strictEqual(snapshot.read(), null);
    }
    assert.strictEqual(actual, text);
    model.dispose();
  });
  test("issue #119632: invalid range", () => {
    const model = createTextModel("hello world!");
    const actual = model._validateRangeRelaxedNoAllocations(new Range(void 0, 0, void 0, 1));
    assert.deepStrictEqual(actual, new Range(1, 1, 1, 1));
    model.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcbW9kZWxcXHRleHRNb2RlbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVURjhfQk9NX0NIQVJBQ1RFUiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgUExBSU5URVhUX0xBTkdVQUdFX0lEIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9tb2Rlc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEVuZE9mTGluZVByZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsLCBjcmVhdGVUZXh0QnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVNb2RlbFNlcnZpY2VzLCBjcmVhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuXG5mdW5jdGlvbiB0ZXN0R3Vlc3NJbmRlbnRhdGlvbihkZWZhdWx0SW5zZXJ0U3BhY2VzOiBib29sZWFuLCBkZWZhdWx0VGFiU2l6ZTogbnVtYmVyLCBleHBlY3RlZEluc2VydFNwYWNlczogYm9vbGVhbiwgZXhwZWN0ZWRUYWJTaXplOiBudW1iZXIsIHRleHQ6IHN0cmluZ1tdLCBtc2c/OiBzdHJpbmcpOiB2b2lkIHtcblx0Y29uc3QgbSA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHR0ZXh0LmpvaW4oJ1xcbicpLFxuXHRcdHVuZGVmaW5lZCxcblx0XHR7XG5cdFx0XHR0YWJTaXplOiBkZWZhdWx0VGFiU2l6ZSxcblx0XHRcdGluc2VydFNwYWNlczogZGVmYXVsdEluc2VydFNwYWNlcyxcblx0XHRcdGRldGVjdEluZGVudGF0aW9uOiB0cnVlXG5cdFx0fVxuXHQpO1xuXHRjb25zdCByID0gbS5nZXRPcHRpb25zKCk7XG5cdG0uZGlzcG9zZSgpO1xuXG5cdGFzc2VydC5zdHJpY3RFcXVhbChyLmluc2VydFNwYWNlcywgZXhwZWN0ZWRJbnNlcnRTcGFjZXMsIG1zZyk7XG5cdGFzc2VydC5zdHJpY3RFcXVhbChyLnRhYlNpemUsIGV4cGVjdGVkVGFiU2l6ZSwgbXNnKTtcbn1cblxuZnVuY3Rpb24gYXNzZXJ0R3Vlc3MoZXhwZWN0ZWRJbnNlcnRTcGFjZXM6IGJvb2xlYW4gfCB1bmRlZmluZWQsIGV4cGVjdGVkVGFiU2l6ZTogbnVtYmVyIHwgdW5kZWZpbmVkIHwgW251bWJlcl0sIHRleHQ6IHN0cmluZ1tdLCBtc2c/OiBzdHJpbmcpOiB2b2lkIHtcblx0aWYgKHR5cGVvZiBleHBlY3RlZEluc2VydFNwYWNlcyA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHQvLyBjYW5ub3QgZ3Vlc3MgaW5zZXJ0U3BhY2VzXG5cdFx0aWYgKHR5cGVvZiBleHBlY3RlZFRhYlNpemUgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHQvLyBjYW5ub3QgZ3Vlc3MgdGFiU2l6ZVxuXHRcdFx0dGVzdEd1ZXNzSW5kZW50YXRpb24odHJ1ZSwgMTMzNzAsIHRydWUsIDEzMzcwLCB0ZXh0LCBtc2cpO1xuXHRcdFx0dGVzdEd1ZXNzSW5kZW50YXRpb24oZmFsc2UsIDEzMzcxLCBmYWxzZSwgMTMzNzEsIHRleHQsIG1zZyk7XG5cdFx0fSBlbHNlIGlmICh0eXBlb2YgZXhwZWN0ZWRUYWJTaXplID09PSAnbnVtYmVyJykge1xuXHRcdFx0Ly8gY2FuIGd1ZXNzIHRhYlNpemVcblx0XHRcdHRlc3RHdWVzc0luZGVudGF0aW9uKHRydWUsIDEzMzcwLCB0cnVlLCBleHBlY3RlZFRhYlNpemUsIHRleHQsIG1zZyk7XG5cdFx0XHR0ZXN0R3Vlc3NJbmRlbnRhdGlvbihmYWxzZSwgMTMzNzEsIGZhbHNlLCBleHBlY3RlZFRhYlNpemUsIHRleHQsIG1zZyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGNhbiBvbmx5IGd1ZXNzIHRhYlNpemUgd2hlbiBpbnNlcnRTcGFjZXMgaXMgdHJ1ZVxuXHRcdFx0dGVzdEd1ZXNzSW5kZW50YXRpb24odHJ1ZSwgMTMzNzAsIHRydWUsIGV4cGVjdGVkVGFiU2l6ZVswXSwgdGV4dCwgbXNnKTtcblx0XHRcdHRlc3RHdWVzc0luZGVudGF0aW9uKGZhbHNlLCAxMzM3MSwgZmFsc2UsIDEzMzcxLCB0ZXh0LCBtc2cpO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHQvLyBjYW4gZ3Vlc3MgaW5zZXJ0U3BhY2VzXG5cdFx0aWYgKHR5cGVvZiBleHBlY3RlZFRhYlNpemUgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHQvLyBjYW5ub3QgZ3Vlc3MgdGFiU2l6ZVxuXHRcdFx0dGVzdEd1ZXNzSW5kZW50YXRpb24odHJ1ZSwgMTMzNzAsIGV4cGVjdGVkSW5zZXJ0U3BhY2VzLCAxMzM3MCwgdGV4dCwgbXNnKTtcblx0XHRcdHRlc3RHdWVzc0luZGVudGF0aW9uKGZhbHNlLCAxMzM3MSwgZXhwZWN0ZWRJbnNlcnRTcGFjZXMsIDEzMzcxLCB0ZXh0LCBtc2cpO1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIGV4cGVjdGVkVGFiU2l6ZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdC8vIGNhbiBndWVzcyB0YWJTaXplXG5cdFx0XHR0ZXN0R3Vlc3NJbmRlbnRhdGlvbih0cnVlLCAxMzM3MCwgZXhwZWN0ZWRJbnNlcnRTcGFjZXMsIGV4cGVjdGVkVGFiU2l6ZSwgdGV4dCwgbXNnKTtcblx0XHRcdHRlc3RHdWVzc0luZGVudGF0aW9uKGZhbHNlLCAxMzM3MSwgZXhwZWN0ZWRJbnNlcnRTcGFjZXMsIGV4cGVjdGVkVGFiU2l6ZSwgdGV4dCwgbXNnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gY2FuIG9ubHkgZ3Vlc3MgdGFiU2l6ZSB3aGVuIGluc2VydFNwYWNlcyBpcyB0cnVlXG5cdFx0XHRpZiAoZXhwZWN0ZWRJbnNlcnRTcGFjZXMgPT09IHRydWUpIHtcblx0XHRcdFx0dGVzdEd1ZXNzSW5kZW50YXRpb24odHJ1ZSwgMTMzNzAsIGV4cGVjdGVkSW5zZXJ0U3BhY2VzLCBleHBlY3RlZFRhYlNpemVbMF0sIHRleHQsIG1zZyk7XG5cdFx0XHRcdHRlc3RHdWVzc0luZGVudGF0aW9uKGZhbHNlLCAxMzM3MSwgZXhwZWN0ZWRJbnNlcnRTcGFjZXMsIGV4cGVjdGVkVGFiU2l6ZVswXSwgdGV4dCwgbXNnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRlc3RHdWVzc0luZGVudGF0aW9uKHRydWUsIDEzMzcwLCBleHBlY3RlZEluc2VydFNwYWNlcywgMTMzNzAsIHRleHQsIG1zZyk7XG5cdFx0XHRcdHRlc3RHdWVzc0luZGVudGF0aW9uKGZhbHNlLCAxMzM3MSwgZXhwZWN0ZWRJbnNlcnRTcGFjZXMsIDEzMzcxLCB0ZXh0LCBtc2cpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5zdWl0ZSgnVGV4dE1vZGVsRGF0YS5mcm9tU3RyaW5nJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGludGVyZmFjZSBJVGV4dEJ1ZmZlckRhdGEge1xuXHRcdEVPTDogc3RyaW5nO1xuXHRcdGxpbmVzOiBzdHJpbmdbXTtcblx0XHRjb250YWluc1JUTDogYm9vbGVhbjtcblx0XHRpc0Jhc2ljQVNDSUk6IGJvb2xlYW47XG5cdH1cblxuXHRmdW5jdGlvbiB0ZXN0VGV4dE1vZGVsRGF0YUZyb21TdHJpbmcodGV4dDogc3RyaW5nLCBleHBlY3RlZDogSVRleHRCdWZmZXJEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgeyB0ZXh0QnVmZmVyLCBkaXNwb3NhYmxlIH0gPSBjcmVhdGVUZXh0QnVmZmVyKHRleHQsIFRleHRNb2RlbC5ERUZBVUxUX0NSRUFUSU9OX09QVElPTlMuZGVmYXVsdEVPTCk7XG5cdFx0Y29uc3QgYWN0dWFsOiBJVGV4dEJ1ZmZlckRhdGEgPSB7XG5cdFx0XHRFT0w6IHRleHRCdWZmZXIuZ2V0RU9MKCksXG5cdFx0XHRsaW5lczogdGV4dEJ1ZmZlci5nZXRMaW5lc0NvbnRlbnQoKSxcblx0XHRcdGNvbnRhaW5zUlRMOiB0ZXh0QnVmZmVyLm1pZ2h0Q29udGFpblJUTCgpLFxuXHRcdFx0aXNCYXNpY0FTQ0lJOiAhdGV4dEJ1ZmZlci5taWdodENvbnRhaW5Ob25CYXNpY0FTQ0lJKClcblx0XHR9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH1cblxuXHR0ZXN0KCdvbmUgbGluZSB0ZXh0JywgKCkgPT4ge1xuXHRcdHRlc3RUZXh0TW9kZWxEYXRhRnJvbVN0cmluZygnSGVsbG8gd29ybGQhJyxcblx0XHRcdHtcblx0XHRcdFx0RU9MOiAnXFxuJyxcblx0XHRcdFx0bGluZXM6IFtcblx0XHRcdFx0XHQnSGVsbG8gd29ybGQhJ1xuXHRcdFx0XHRdLFxuXHRcdFx0XHRjb250YWluc1JUTDogZmFsc2UsXG5cdFx0XHRcdGlzQmFzaWNBU0NJSTogdHJ1ZVxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpbGluZSB0ZXh0JywgKCkgPT4ge1xuXHRcdHRlc3RUZXh0TW9kZWxEYXRhRnJvbVN0cmluZygnSGVsbG8sXFxyXFxuZGVhciBmcmllbmRcXG5Ib3dcXHJhcmVcXHJcXG55b3U/Jyxcblx0XHRcdHtcblx0XHRcdFx0RU9MOiAnXFxyXFxuJyxcblx0XHRcdFx0bGluZXM6IFtcblx0XHRcdFx0XHQnSGVsbG8sJyxcblx0XHRcdFx0XHQnZGVhciBmcmllbmQnLFxuXHRcdFx0XHRcdCdIb3cnLFxuXHRcdFx0XHRcdCdhcmUnLFxuXHRcdFx0XHRcdCd5b3U/J1xuXHRcdFx0XHRdLFxuXHRcdFx0XHRjb250YWluc1JUTDogZmFsc2UsXG5cdFx0XHRcdGlzQmFzaWNBU0NJSTogdHJ1ZVxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ05vbiBCYXNpYyBBU0NJSSAxJywgKCkgPT4ge1xuXHRcdHRlc3RUZXh0TW9kZWxEYXRhRnJvbVN0cmluZygnSGVsbG8sXFxuWlx1MDBGQ3JpY2gnLFxuXHRcdFx0e1xuXHRcdFx0XHRFT0w6ICdcXG4nLFxuXHRcdFx0XHRsaW5lczogW1xuXHRcdFx0XHRcdCdIZWxsbywnLFxuXHRcdFx0XHRcdCdaXHUwMEZDcmljaCdcblx0XHRcdFx0XSxcblx0XHRcdFx0Y29udGFpbnNSVEw6IGZhbHNlLFxuXHRcdFx0XHRpc0Jhc2ljQVNDSUk6IGZhbHNlXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY29udGFpbnNSVEwgMScsICgpID0+IHtcblx0XHR0ZXN0VGV4dE1vZGVsRGF0YUZyb21TdHJpbmcoJ0hlbGxvLFxcblx1MDVENlx1MDVENVx1MDVENFx1MDVEOSBcdTA1RTJcdTA1RDVcdTA1RDFcdTA1RDNcdTA1RDQgXHUwNURFXHUwNUQxXHUwNUQ1XHUwNUUxXHUwNUUxXHUwNUVBIFx1MDVFOVx1MDVEM1x1MDVFMlx1MDVFQVx1MDVENScsXG5cdFx0XHR7XG5cdFx0XHRcdEVPTDogJ1xcbicsXG5cdFx0XHRcdGxpbmVzOiBbXG5cdFx0XHRcdFx0J0hlbGxvLCcsXG5cdFx0XHRcdFx0J1x1MDVENlx1MDVENVx1MDVENFx1MDVEOSBcdTA1RTJcdTA1RDVcdTA1RDFcdTA1RDNcdTA1RDQgXHUwNURFXHUwNUQxXHUwNUQ1XHUwNUUxXHUwNUUxXHUwNUVBIFx1MDVFOVx1MDVEM1x1MDVFMlx1MDVFQVx1MDVENSdcblx0XHRcdFx0XSxcblx0XHRcdFx0Y29udGFpbnNSVEw6IHRydWUsXG5cdFx0XHRcdGlzQmFzaWNBU0NJSTogZmFsc2Vcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb250YWluc1JUTCAyJywgKCkgPT4ge1xuXHRcdHRlc3RUZXh0TW9kZWxEYXRhRnJvbVN0cmluZygnSGVsbG8sXFxuXHUwNjQ3XHUwNjQ2XHUwNjI3XHUwNjQzIFx1MDYyRFx1MDY0Mlx1MDY0QVx1MDY0Mlx1MDYyOSBcdTA2NDVcdTA2MkJcdTA2MjhcdTA2MkFcdTA2MjkgXHUwNjQ1XHUwNjQ2XHUwNjMwIFx1MDYzMlx1MDY0NVx1MDY0NiBcdTA2MzdcdTA2NDhcdTA2NEFcdTA2NDQnLFxuXHRcdFx0e1xuXHRcdFx0XHRFT0w6ICdcXG4nLFxuXHRcdFx0XHRsaW5lczogW1xuXHRcdFx0XHRcdCdIZWxsbywnLFxuXHRcdFx0XHRcdCdcdTA2NDdcdTA2NDZcdTA2MjdcdTA2NDMgXHUwNjJEXHUwNjQyXHUwNjRBXHUwNjQyXHUwNjI5IFx1MDY0NVx1MDYyQlx1MDYyOFx1MDYyQVx1MDYyOSBcdTA2NDVcdTA2NDZcdTA2MzAgXHUwNjMyXHUwNjQ1XHUwNjQ2IFx1MDYzN1x1MDY0OFx1MDY0QVx1MDY0NCdcblx0XHRcdFx0XSxcblx0XHRcdFx0Y29udGFpbnNSVEw6IHRydWUsXG5cdFx0XHRcdGlzQmFzaWNBU0NJSTogZmFsc2Vcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxufSk7XG5cbnN1aXRlKCdFZGl0b3IgTW9kZWwgLSBUZXh0TW9kZWwnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnVGV4dE1vZGVsIGRvZXMgbm90IHVzZSBldmVudHMgaW50ZXJuYWxseScsICgpID0+IHtcblx0XHQvLyBNYWtlIHN1cmUgdGhhdCBhbGwgbW9kZWwgcGFydHMgcmVjZWl2ZSB0ZXh0IG1vZGVsIGV2ZW50cyBleHBsaWNpdGx5XG5cdFx0Ly8gdG8gYXZvaWQgdGhhdCBieSBhbnkgY2hhbmNlIGFuIG91dHNpZGUgbGlzdGVuZXIgcmVjZWl2ZXMgZXZlbnRzIGJlZm9yZVxuXHRcdC8vIHRoZSBwYXJ0cyBhbmQgdGh1cyBhcmUgYWJsZSB0byBhY2Nlc3MgdGhlIHRleHQgbW9kZWwgaW4gYW4gaW5jb25zaXN0ZW50IHN0YXRlLlxuXHRcdC8vXG5cdFx0Ly8gV2Ugc2ltcGx5IGNoZWNrIHRoYXQgdGhlcmUgYXJlIG5vIGxpc3RlbmVycyBhdHRhY2hlZCB0byB0ZXh0IG1vZGVsXG5cdFx0Ly8gYWZ0ZXIgaW5zdGFudGlhdGlvblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVNb2RlbFNlcnZpY2VzKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCB0ZXh0TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGV4dE1vZGVsLCAnJywgUExBSU5URVhUX0xBTkdVQUdFX0lELCBUZXh0TW9kZWwuREVGQVVMVF9DUkVBVElPTl9PUFRJT05TLCBudWxsKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRNb2RlbC5faGFzTGlzdGVuZXJzKCksIGZhbHNlKTtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFZhbHVlTGVuZ3RoSW5SYW5nZScsICgpID0+IHtcblxuXHRcdGxldCBtID0gY3JlYXRlVGV4dE1vZGVsKCdNeSBGaXJzdCBMaW5lXFxyXFxuTXkgU2Vjb25kIExpbmVcXHJcXG5NeSBUaGlyZCBMaW5lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAxLCAxKSksICcnLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAxLCAyKSksICdNJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMiwgMSwgMykpLCAneScubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEsIDE0KSksICdNeSBGaXJzdCBMaW5lJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMiwgMSkpLCAnTXkgRmlyc3QgTGluZVxcclxcbicubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDIsIDIsIDEpKSwgJ3kgRmlyc3QgTGluZVxcclxcbicubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDIsIDIsIDIpKSwgJ3kgRmlyc3QgTGluZVxcclxcbk0nLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAyLCAyLCAxMDAwKSksICd5IEZpcnN0IExpbmVcXHJcXG5NeSBTZWNvbmQgTGluZScubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDIsIDMsIDEpKSwgJ3kgRmlyc3QgTGluZVxcclxcbk15IFNlY29uZCBMaW5lXFxyXFxuJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMiwgMywgMTAwMCkpLCAneSBGaXJzdCBMaW5lXFxyXFxuTXkgU2Vjb25kIExpbmVcXHJcXG5NeSBUaGlyZCBMaW5lJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMTAwMCwgMTAwMCkpLCAnTXkgRmlyc3QgTGluZVxcclxcbk15IFNlY29uZCBMaW5lXFxyXFxuTXkgVGhpcmQgTGluZScubGVuZ3RoKTtcblx0XHRtLmRpc3Bvc2UoKTtcblxuXHRcdG0gPSBjcmVhdGVUZXh0TW9kZWwoJ015IEZpcnN0IExpbmVcXG5NeSBTZWNvbmQgTGluZVxcbk15IFRoaXJkIExpbmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEsIDEpKSwgJycubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEsIDIpKSwgJ00nLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAyLCAxLCAzKSksICd5Jy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMSwgMTQpKSwgJ015IEZpcnN0IExpbmUnLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAyLCAxKSksICdNeSBGaXJzdCBMaW5lXFxuJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMiwgMiwgMSkpLCAneSBGaXJzdCBMaW5lXFxuJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMiwgMiwgMikpLCAneSBGaXJzdCBMaW5lXFxuTScubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDIsIDIsIDEwMDApKSwgJ3kgRmlyc3QgTGluZVxcbk15IFNlY29uZCBMaW5lJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMiwgMywgMSkpLCAneSBGaXJzdCBMaW5lXFxuTXkgU2Vjb25kIExpbmVcXG4nLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAyLCAzLCAxMDAwKSksICd5IEZpcnN0IExpbmVcXG5NeSBTZWNvbmQgTGluZVxcbk15IFRoaXJkIExpbmUnLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAxMDAwLCAxMDAwKSksICdNeSBGaXJzdCBMaW5lXFxuTXkgU2Vjb25kIExpbmVcXG5NeSBUaGlyZCBMaW5lJy5sZW5ndGgpO1xuXHRcdG0uZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRWYWx1ZUxlbmd0aEluUmFuZ2UgZGlmZmVyZW50IEVPTCcsICgpID0+IHtcblxuXHRcdGxldCBtID0gY3JlYXRlVGV4dE1vZGVsKCdNeSBGaXJzdCBMaW5lXFxyXFxuTXkgU2Vjb25kIExpbmVcXHJcXG5NeSBUaGlyZCBMaW5lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAyLCAxKSwgRW5kT2ZMaW5lUHJlZmVyZW5jZS5UZXh0RGVmaW5lZCksICdNeSBGaXJzdCBMaW5lXFxyXFxuJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMiwgMSksIEVuZE9mTGluZVByZWZlcmVuY2UuQ1JMRiksICdNeSBGaXJzdCBMaW5lXFxyXFxuJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMiwgMSksIEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnTXkgRmlyc3QgTGluZVxcbicubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEwMDAsIDEwMDApLCBFbmRPZkxpbmVQcmVmZXJlbmNlLlRleHREZWZpbmVkKSwgJ015IEZpcnN0IExpbmVcXHJcXG5NeSBTZWNvbmQgTGluZVxcclxcbk15IFRoaXJkIExpbmUnLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAxMDAwLCAxMDAwKSwgRW5kT2ZMaW5lUHJlZmVyZW5jZS5DUkxGKSwgJ015IEZpcnN0IExpbmVcXHJcXG5NeSBTZWNvbmQgTGluZVxcclxcbk15IFRoaXJkIExpbmUnLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAxMDAwLCAxMDAwKSwgRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdNeSBGaXJzdCBMaW5lXFxuTXkgU2Vjb25kIExpbmVcXG5NeSBUaGlyZCBMaW5lJy5sZW5ndGgpO1xuXHRcdG0uZGlzcG9zZSgpO1xuXG5cdFx0bSA9IGNyZWF0ZVRleHRNb2RlbCgnTXkgRmlyc3QgTGluZVxcbk15IFNlY29uZCBMaW5lXFxuTXkgVGhpcmQgTGluZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMiwgMSksIEVuZE9mTGluZVByZWZlcmVuY2UuVGV4dERlZmluZWQpLCAnTXkgRmlyc3QgTGluZVxcbicubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDIsIDEpLCBFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ015IEZpcnN0IExpbmVcXG4nLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAyLCAxKSwgRW5kT2ZMaW5lUHJlZmVyZW5jZS5DUkxGKSwgJ015IEZpcnN0IExpbmVcXHJcXG4nLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVMZW5ndGhJblJhbmdlKG5ldyBSYW5nZSgxLCAxLCAxMDAwLCAxMDAwKSwgRW5kT2ZMaW5lUHJlZmVyZW5jZS5UZXh0RGVmaW5lZCksICdNeSBGaXJzdCBMaW5lXFxuTXkgU2Vjb25kIExpbmVcXG5NeSBUaGlyZCBMaW5lJy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShuZXcgUmFuZ2UoMSwgMSwgMTAwMCwgMTAwMCksIEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnTXkgRmlyc3QgTGluZVxcbk15IFNlY29uZCBMaW5lXFxuTXkgVGhpcmQgTGluZScubGVuZ3RoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRWYWx1ZUxlbmd0aEluUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEwMDAsIDEwMDApLCBFbmRPZkxpbmVQcmVmZXJlbmNlLkNSTEYpLCAnTXkgRmlyc3QgTGluZVxcclxcbk15IFNlY29uZCBMaW5lXFxyXFxuTXkgVGhpcmQgTGluZScubGVuZ3RoKTtcblx0XHRtLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZ3Vlc3MgaW5kZW50YXRpb24gMScsICgpID0+IHtcblxuXHRcdGFzc2VydEd1ZXNzKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBbXG5cdFx0XHQneCcsXG5cdFx0XHQneCcsXG5cdFx0XHQneCcsXG5cdFx0XHQneCcsXG5cdFx0XHQneCcsXG5cdFx0XHQneCcsXG5cdFx0XHQneCdcblx0XHRdLCAnbm8gY2x1ZXMnKTtcblxuXHRcdGFzc2VydEd1ZXNzKGZhbHNlLCB1bmRlZmluZWQsIFtcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCd4J1xuXHRcdF0sICdubyBzcGFjZXMsIDF4VEFCJyk7XG5cblx0XHRhc3NlcnRHdWVzcyh0cnVlLCAyLCBbXG5cdFx0XHQnICB4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCd4J1xuXHRcdF0sICcxeDInKTtcblxuXHRcdGFzc2VydEd1ZXNzKGZhbHNlLCB1bmRlZmluZWQsIFtcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCdcXHR4J1xuXHRcdF0sICc3eFRBQicpO1xuXG5cdFx0YXNzZXJ0R3Vlc3ModW5kZWZpbmVkLCBbMl0sIFtcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0J1xcdHgnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdF0sICc0eDIsIDR4VEFCJyk7XG5cdFx0YXNzZXJ0R3Vlc3MoZmFsc2UsIHVuZGVmaW5lZCwgW1xuXHRcdFx0J1xcdHgnLFxuXHRcdFx0JyB4Jyxcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCcgeCcsXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQnIHgnLFxuXHRcdFx0J1xcdHgnLFxuXHRcdFx0JyB4J1xuXHRcdF0sICc0eDEsIDR4VEFCJyk7XG5cdFx0YXNzZXJ0R3Vlc3MoZmFsc2UsIHVuZGVmaW5lZCwgW1xuXHRcdFx0J1xcdHgnLFxuXHRcdFx0J1xcdHgnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0J1xcdHgnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XSwgJzR4MiwgNXhUQUInKTtcblx0XHRhc3NlcnRHdWVzcyhmYWxzZSwgdW5kZWZpbmVkLCBbXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQnICB4Jyxcblx0XHRdLCAnMXgyLCA1eFRBQicpO1xuXHRcdGFzc2VydEd1ZXNzKGZhbHNlLCB1bmRlZmluZWQsIFtcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XSwgJzF4NCwgNXhUQUInKTtcblx0XHRhc3NlcnRHdWVzcyhmYWxzZSwgdW5kZWZpbmVkLCBbXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnXFx0eCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCdcXHR4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XSwgJzF4MiwgMXg0LCA1eFRBQicpO1xuXG5cdFx0YXNzZXJ0R3Vlc3ModW5kZWZpbmVkLCB1bmRlZmluZWQsIFtcblx0XHRcdCd4Jyxcblx0XHRcdCcgeCcsXG5cdFx0XHQnIHgnLFxuXHRcdFx0JyB4Jyxcblx0XHRcdCcgeCcsXG5cdFx0XHQnIHgnLFxuXHRcdFx0JyB4Jyxcblx0XHRcdCcgeCdcblx0XHRdLCAnN3gxIC0gMSBzcGFjZSBpcyBuZXZlciBndWVzc2VkIGFzIGFuIGluZGVudGF0aW9uJyk7XG5cdFx0YXNzZXJ0R3Vlc3ModHJ1ZSwgdW5kZWZpbmVkLCBbXG5cdFx0XHQneCcsXG5cdFx0XHQnICAgICAgICAgIHgnLFxuXHRcdFx0JyB4Jyxcblx0XHRcdCcgeCcsXG5cdFx0XHQnIHgnLFxuXHRcdFx0JyB4Jyxcblx0XHRcdCcgeCcsXG5cdFx0XHQnIHgnXG5cdFx0XSwgJzF4MTAsIDZ4MScpO1xuXHRcdGFzc2VydEd1ZXNzKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBbXG5cdFx0XHQnJyxcblx0XHRcdCcgICcsXG5cdFx0XHQnICAgICcsXG5cdFx0XHQnICAgICAgJyxcblx0XHRcdCcgICAgICAgICcsXG5cdFx0XHQnICAgICAgICAgICcsXG5cdFx0XHQnICAgICAgICAgICAgJyxcblx0XHRcdCcgICAgICAgICAgICAgICcsXG5cdFx0XSwgJ3doaXRlc3BhY2UgbGluZXMgZG9uXFwndCBjb3VudCcpO1xuXHRcdGFzc2VydEd1ZXNzKHRydWUsIDMsIFtcblx0XHRcdCd4Jyxcblx0XHRcdCcgICB4Jyxcblx0XHRcdCcgICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnICAgeCcsXG5cdFx0XHQnICAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0J3gnLFxuXHRcdFx0JyAgIHgnLFxuXHRcdFx0JyAgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRdLCAnNngzLCAzeDQnKTtcblx0XHRhc3NlcnRHdWVzcyh0cnVlLCA1LCBbXG5cdFx0XHQneCcsXG5cdFx0XHQnICAgICB4Jyxcblx0XHRcdCcgICAgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCcgICAgIHgnLFxuXHRcdFx0JyAgICAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0J3gnLFxuXHRcdFx0JyAgICAgeCcsXG5cdFx0XHQnICAgICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XSwgJzZ4NSwgM3g0Jyk7XG5cdFx0YXNzZXJ0R3Vlc3ModHJ1ZSwgNywgW1xuXHRcdFx0J3gnLFxuXHRcdFx0JyAgICAgICB4Jyxcblx0XHRcdCcgICAgICAgeCcsXG5cdFx0XHQnICAgICB4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCcgICAgICAgeCcsXG5cdFx0XHQnICAgICAgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCcgICAgICAgeCcsXG5cdFx0XHQnICAgICAgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRdLCAnNng3LCAxeDUsIDJ4NCcpO1xuXHRcdGFzc2VydEd1ZXNzKHRydWUsIDIsIFtcblx0XHRcdCd4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0J3gnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XSwgJzh4MicpO1xuXG5cdFx0YXNzZXJ0R3Vlc3ModHJ1ZSwgMiwgW1xuXHRcdFx0J3gnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0J3gnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnICB4Jyxcblx0XHRdLCAnOHgyJyk7XG5cdFx0YXNzZXJ0R3Vlc3ModHJ1ZSwgMiwgW1xuXHRcdFx0J3gnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0J3gnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0J3gnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0J3gnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdF0sICc0eDIsIDR4NCcpO1xuXHRcdGFzc2VydEd1ZXNzKHRydWUsIDIsIFtcblx0XHRcdCd4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0J3gnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRdLCAnNngyLCAzeDQnKTtcblx0XHRhc3NlcnRHdWVzcyh0cnVlLCAyLCBbXG5cdFx0XHQneCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XSwgJzR4MiwgNHg0Jyk7XG5cdFx0YXNzZXJ0R3Vlc3ModHJ1ZSwgMiwgW1xuXHRcdFx0J3gnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XSwgJzJ4MiwgNHg0Jyk7XG5cdFx0YXNzZXJ0R3Vlc3ModHJ1ZSwgNCwgW1xuXHRcdFx0J3gnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0J3gnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XSwgJzh4NCcpO1xuXHRcdGFzc2VydEd1ZXNzKHRydWUsIDIsIFtcblx0XHRcdCd4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQnICAgICAgeCcsXG5cdFx0XHQneCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0JyAgICAgIHgnLFxuXHRcdF0sICcyeDIsIDR4NCwgMng2Jyk7XG5cdFx0YXNzZXJ0R3Vlc3ModHJ1ZSwgMiwgW1xuXHRcdFx0J3gnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCcgICAgICB4Jyxcblx0XHRcdCcgICAgICB4Jyxcblx0XHRcdCcgICAgICAgIHgnLFxuXHRcdF0sICcxeDIsIDJ4NCwgMng2LCAxeDgnKTtcblx0XHRhc3NlcnRHdWVzcyh0cnVlLCA0LCBbXG5cdFx0XHQneCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQnICAgICB4Jyxcblx0XHRcdCcgICAgICAgIHgnLFxuXHRcdFx0J3gnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0JyAgICAgeCcsXG5cdFx0XHQnICAgICAgICB4Jyxcblx0XHRdLCAnNng0LCAyeDUsIDJ4OCcpO1xuXHRcdGFzc2VydEd1ZXNzKHRydWUsIDQsIFtcblx0XHRcdCd4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCcgICAgIHgnLFxuXHRcdFx0JyAgICAgICAgeCcsXG5cdFx0XHQnICAgICAgICB4Jyxcblx0XHRdLCAnM3g0LCAxeDUsIDJ4OCcpO1xuXHRcdGFzc2VydEd1ZXNzKHRydWUsIDQsIFtcblx0XHRcdCd4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdFx0JyAgICAgeCcsXG5cdFx0XHQnICAgICAgICB4Jyxcblx0XHRcdCcgICAgICAgIHgnLFxuXHRcdFx0J3gnLFxuXHRcdFx0J3gnLFxuXHRcdFx0JyAgICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQnICAgICB4Jyxcblx0XHRcdCcgICAgICAgIHgnLFxuXHRcdFx0JyAgICAgICAgeCcsXG5cdFx0XSwgJzZ4NCwgMng1LCA0eDgnKTtcblx0XHRhc3NlcnRHdWVzcyh0cnVlLCAzLCBbXG5cdFx0XHQneCcsXG5cdFx0XHQnIHgnLFxuXHRcdFx0JyB4Jyxcblx0XHRcdCcgeCcsXG5cdFx0XHQnIHgnLFxuXHRcdFx0JyB4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCcgICB4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQnICAgIHgnLFxuXHRcdF0sICc1eDEsIDJ4MCwgMXgzLCAyeDQnKTtcblx0XHRhc3NlcnRHdWVzcyhmYWxzZSwgdW5kZWZpbmVkLCBbXG5cdFx0XHQnXFx0IHgnLFxuXHRcdFx0JyBcXHQgeCcsXG5cdFx0XHQnXFx0eCdcblx0XHRdLCAnbWl4ZWQgd2hpdGVzcGFjZSAxJyk7XG5cdFx0YXNzZXJ0R3Vlc3MoZmFsc2UsIHVuZGVmaW5lZCwgW1xuXHRcdFx0J1xcdHgnLFxuXHRcdFx0J1xcdCAgICB4J1xuXHRcdF0sICdtaXhlZCB3aGl0ZXNwYWNlIDInKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzQ0OTkxOiBXcm9uZyBpbmRlbnRhdGlvbiBzaXplIGF1dG8tZGV0ZWN0aW9uJywgKCkgPT4ge1xuXHRcdGFzc2VydEd1ZXNzKHRydWUsIDQsIFtcblx0XHRcdCdhID0gMTAgICAgICAgICAgICAgIyAwIHNwYWNlIGluZGVudCcsXG5cdFx0XHQnYiA9IDUgICAgICAgICAgICAgICMgMCBzcGFjZSBpbmRlbnQnLFxuXHRcdFx0J2lmIGEgPiAxMDogICAgICAgICAjIDAgc3BhY2UgaW5kZW50Jyxcblx0XHRcdCcgICAgYSArPSAxICAgICAgICAgIyA0IHNwYWNlIGluZGVudCAgICAgIGRlbHRhIDQgc3BhY2VzJyxcblx0XHRcdCcgICAgaWYgYiA+IDU6ICAgICAgIyA0IHNwYWNlIGluZGVudCcsXG5cdFx0XHQnICAgICAgICBiICs9IDEgICAgICMgOCBzcGFjZSBpbmRlbnQgICAgICBkZWx0YSA0IHNwYWNlcycsXG5cdFx0XHQnICAgICAgICBiICs9IDEgICAgICMgOCBzcGFjZSBpbmRlbnQnLFxuXHRcdFx0JyAgICAgICAgYiArPSAxICAgICAjIDggc3BhY2UgaW5kZW50Jyxcblx0XHRcdCcjIGNvbW1lbnQgbGluZSAxICAgIyAwIHNwYWNlIGluZGVudCAgICAgIGRlbHRhIDggc3BhY2VzJyxcblx0XHRcdCcjIGNvbW1lbnQgbGluZSAyICAgIyAwIHNwYWNlIGluZGVudCcsXG5cdFx0XHQnIyBjb21tZW50IGxpbmUgMyAgICMgMCBzcGFjZSBpbmRlbnQnLFxuXHRcdFx0JyAgICAgICAgYiArPSAxICAgICAjIDggc3BhY2UgaW5kZW50ICAgICAgZGVsdGEgOCBzcGFjZXMnLFxuXHRcdFx0JyAgICAgICAgYiArPSAxICAgICAjIDggc3BhY2UgaW5kZW50Jyxcblx0XHRcdCcgICAgICAgIGIgKz0gMSAgICAgIyA4IHNwYWNlIGluZGVudCcsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM1NTgxODogQnJva2VuIGluZGVudGF0aW9uIGRldGVjdGlvbicsICgpID0+IHtcblx0XHRhc3NlcnRHdWVzcyh0cnVlLCAyLCBbXG5cdFx0XHQnJyxcblx0XHRcdCcvKiBSRVFVSVJFICovJyxcblx0XHRcdCcnLFxuXHRcdFx0J2NvbnN0IGZvbyA9IHJlcXVpcmUgKCBcXCdmb29cXCcgKSwnLFxuXHRcdFx0JyAgICAgIGJhciA9IHJlcXVpcmUgKCBcXCdiYXJcXCcgKTsnLFxuXHRcdFx0JycsXG5cdFx0XHQnLyogTVkgRk4gKi8nLFxuXHRcdFx0JycsXG5cdFx0XHQnZnVuY3Rpb24gbXlGbiAoKSB7Jyxcblx0XHRcdCcnLFxuXHRcdFx0JyAgY29uc3QgYXNkID0gMSwnLFxuXHRcdFx0JyAgICAgICAgZHNhID0gMjsnLFxuXHRcdFx0JycsXG5cdFx0XHQnICByZXR1cm4gYmFyICggZm9vICggYXNkICkgKTsnLFxuXHRcdFx0JycsXG5cdFx0XHQnfScsXG5cdFx0XHQnJyxcblx0XHRcdCcvKiBFWFBPUlQgKi8nLFxuXHRcdFx0JycsXG5cdFx0XHQnbW9kdWxlLmV4cG9ydHMgPSBteUZuOycsXG5cdFx0XHQnJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzcwODMyOiBCcm9rZW4gaW5kZW50YXRpb24gZGV0ZWN0aW9uJywgKCkgPT4ge1xuXHRcdGFzc2VydEd1ZXNzKGZhbHNlLCB1bmRlZmluZWQsIFtcblx0XHRcdCd4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCdcdHgnLFxuXHRcdFx0J1x0XHR4Jyxcblx0XHRcdCcgICAgeCcsXG5cdFx0XHQnXHRcdHgnLFxuXHRcdFx0J1x0eCcsXG5cdFx0XHQnXHRcdHgnLFxuXHRcdFx0J1x0eCcsXG5cdFx0XHQnXHR4Jyxcblx0XHRcdCdcdHgnLFxuXHRcdFx0J1x0eCcsXG5cdFx0XHQneCcsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM2MjE0MzogQnJva2VuIGluZGVudGF0aW9uIGRldGVjdGlvbicsICgpID0+IHtcblx0XHQvLyB3b3JrcyBiZWZvcmUgdGhlIGZpeFxuXHRcdGFzc2VydEd1ZXNzKHRydWUsIDIsIFtcblx0XHRcdCd4Jyxcblx0XHRcdCd4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgeCdcblx0XHRdKTtcblxuXHRcdC8vIHdvcmtzIGJlZm9yZSB0aGUgZml4XG5cdFx0YXNzZXJ0R3Vlc3ModHJ1ZSwgMiwgW1xuXHRcdFx0J3gnLFxuXHRcdFx0JyAgLSBpdGVtMicsXG5cdFx0XHQnICAtIGl0ZW0zJ1xuXHRcdF0pO1xuXG5cdFx0Ly8gd29ya3MgYmVmb3JlIHRoZSBmaXhcblx0XHR0ZXN0R3Vlc3NJbmRlbnRhdGlvbih0cnVlLCAyLCB0cnVlLCAyLCBbXG5cdFx0XHQneCB4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgeCcsXG5cdFx0XSk7XG5cblx0XHQvLyBmYWlscyBiZWZvcmUgdGhlIGZpeFxuXHRcdC8vIGVtcHR5IHNwYWNlIGlubGluZSBicmVha3MgdGhlIGluZGVudGF0aW9uIGd1ZXNzXG5cdFx0dGVzdEd1ZXNzSW5kZW50YXRpb24odHJ1ZSwgMiwgdHJ1ZSwgMiwgW1xuXHRcdFx0J3ggeCcsXG5cdFx0XHQnICB4Jyxcblx0XHRcdCcgIHgnLFxuXHRcdFx0JyAgICB4J1xuXHRcdF0pO1xuXG5cdFx0dGVzdEd1ZXNzSW5kZW50YXRpb24odHJ1ZSwgMiwgdHJ1ZSwgMiwgW1xuXHRcdFx0JzwhLS10ZXN0MS5tZCAtLT4nLFxuXHRcdFx0Jy0gaXRlbTEnLFxuXHRcdFx0JyAgLSBpdGVtMicsXG5cdFx0XHQnICAgIC0gaXRlbTMnXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM4NDIxNzogQnJva2VuIGluZGVudGF0aW9uIGRldGVjdGlvbicsICgpID0+IHtcblx0XHRhc3NlcnRHdWVzcyh0cnVlLCA0LCBbXG5cdFx0XHQnZGVmIG1haW4oKTonLFxuXHRcdFx0JyAgICBwcmludChcXCdoZWxsb1xcJyknLFxuXHRcdF0pO1xuXHRcdGFzc2VydEd1ZXNzKHRydWUsIDQsIFtcblx0XHRcdCdkZWYgbWFpbigpOicsXG5cdFx0XHQnICAgIHdpdGggb3BlbihcXCdmb29cXCcpIGFzIGZwOicsXG5cdFx0XHQnICAgICAgICBwcmludChmcC5yZWFkKCkpJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzY1NjY4OiBZQU1MIGZpbGUgaW5kZW50ZWQgd2l0aCAyIHNwYWNlcycsICgpID0+IHtcblx0XHQvLyBGdWxsIFlBTUwgZmlsZSBmcm9tIHRoZSBpc3N1ZSAtIHNob3VsZCBkZXRlY3QgYXMgMiBzcGFjZXNcblx0XHRhc3NlcnRHdWVzcyh0cnVlLCAyLCBbXG5cdFx0XHQndmVyc2lvbjogMicsXG5cdFx0XHQnJyxcblx0XHRcdCdqb2JzOicsXG5cdFx0XHQnICBidWlsZDonLFxuXHRcdFx0JyAgICBkb2NrZXI6Jyxcblx0XHRcdCcgICAgICAtIGNpcmNsZWNpL2dvbGFuZzoxLjExJyxcblx0XHRcdCcnLFxuXHRcdFx0JyAgZW52aXJvbm1lbnQ6Jyxcblx0XHRcdCcgICAgVEVTVF9SRVNVTFRTOiAvdG1wL3Rlc3QtcmVzdWx0cycsXG5cdFx0XHQnJyxcblx0XHRcdCcgIHN0ZXBzOicsXG5cdFx0XHQnICAgIC0gY2hlY2tvdXQnLFxuXHRcdFx0JyAgICAtIHJ1bjogbWtkaXIgLXAgJFRFU1RfUkVTVUxUUycsXG5cdFx0XHQnJyxcblx0XHRcdCcgICAgLSByZXN0b3JlX2NhY2hlOicsXG5cdFx0XHQnICAgICAgICBrZXlzOicsXG5cdFx0XHQnICAgICAgICAgIC0gdjEtcGtnLWNhY2hlJyxcblx0XHRcdCcnLFxuXHRcdFx0JyAgICAtIHJ1bjonLFxuXHRcdFx0JyAgICAgICAgbmFtZTogZGVwIGVuc3VyZScsXG5cdFx0XHQnICAgICAgICBjb21tYW5kOiBkZXAgZW5zdXJlIC12Jyxcblx0XHRcdCcnLFxuXHRcdFx0JyAgICAtIHJ1bjonLFxuXHRcdFx0JyAgICAgICAgbmFtZTogUnVuIHVuaXQgdGVzdHMnLFxuXHRcdFx0JyAgICAgICAgY29tbWFuZDogfCcsXG5cdFx0XHQnICAgICAgICAgIHRyYXAgXCJnby1qdW5pdC1yZXBvcnQgPCR7VEVTVF9SRVNVTFRTfS9nby10ZXN0Lm91dCA+ICR7VEVTVF9SRVNVTFRTfS9nby10ZXN0LXJlcG9ydC54bWxcIiBFWElUJyxcblx0XHRcdCcgICAgICAgICAgZ28gdGVzdCAtdiAuLy4uLiB8IHRlZSAke1RFU1RfUkVTVUxUU30vZ28tdGVzdC5vdXQnLFxuXHRcdFx0JycsXG5cdFx0XHQnICAgIC0gcnVuOicsXG5cdFx0XHQnICAgICAgICBuYW1lOiBCdWlsZCcsXG5cdFx0XHQnICAgICAgICBjb21tYW5kOiBnbyBidWlsZCAtdicsXG5cdFx0XHQnJyxcblx0XHRcdCcgICAgLSBzYXZlX2NhY2hlOicsXG5cdFx0XHQnICAgICAgICBrZXk6IHYxLXBrZy1jYWNoZScsXG5cdFx0XHQnICAgICAgICBwYXRoczonLFxuXHRcdFx0JyAgICAgICAgICAtIFwiL2dvL3BrZ1wiJyxcblx0XHRcdCcnLFxuXHRcdFx0JyAgICAtIHN0b3JlX2FydGlmYWN0czonLFxuXHRcdFx0JyAgICAgICAgcGF0aDogL3RtcC90ZXN0LXJlc3VsdHMnLFxuXHRcdFx0JyAgICAgICAgZGVzdGluYXRpb246IHJhdy10ZXN0LW91dHB1dCcsXG5cdFx0XHQnJyxcblx0XHRcdCcgICAgLSBzdG9yZV90ZXN0X3Jlc3VsdHM6Jyxcblx0XHRcdCcgICAgICAgIHBhdGg6IC90bXAvdGVzdC1yZXN1bHRzJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzI0OTA0MDogNC1zcGFjZSBpbmRlbnQgc2hvdWxkIHdpbiBvdmVyIDItc3BhY2Ugd2hlbiBwcmVkb21pbmFudCcsICgpID0+IHtcblx0XHQvLyBGaWxlIHdpdGggbW9zdGx5IDQtc3BhY2UgaW5kZW50cyBidXQgc29tZSAyLXNwYWNlIGluZGVudHMgc2hvdWxkIGRldGVjdCBhcyA0IHNwYWNlc1xuXHRcdGFzc2VydEd1ZXNzKHRydWUsIDQsIFtcblx0XHRcdCdmdW5jdGlvbiBmb28oKSB7Jyxcblx0XHRcdCcgICAgbGV0IGEgPSAxOycsXG5cdFx0XHQnICAgIGxldCBiID0gMjsnLFxuXHRcdFx0JyAgICBpZiAodHJ1ZSkgeycsXG5cdFx0XHQnICAgICAgICBjb25zb2xlLmxvZyhhKTsnLFxuXHRcdFx0JyAgICAgICAgY29uc29sZS5sb2coYik7Jyxcblx0XHRcdCcgICAgfScsXG5cdFx0XHQnICAgIGNvbnN0IG9iaiA9IHsnLFxuXHRcdFx0JyAgICAgIHg6IDEsJywgIC8vIDItc3BhY2UgaW5kZW50IGhlcmVcblx0XHRcdCcgICAgICB5OiAyJywgICAvLyAyLXNwYWNlIGluZGVudCBoZXJlXG5cdFx0XHQnICAgIH07Jyxcblx0XHRcdCcgICAgcmV0dXJuIG9iajsnLFxuXHRcdFx0J30nLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCd2YWxpZGF0ZVBvc2l0aW9uJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgbSA9IGNyZWF0ZVRleHRNb2RlbCgnbGluZSBvbmVcXG5saW5lIHR3bycpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDAsIDApKSwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMCwgMSkpLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDEpKSwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMikpLCBuZXcgUG9zaXRpb24oMSwgMikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAzMCkpLCBuZXcgUG9zaXRpb24oMSwgOSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDIsIDApKSwgbmV3IFBvc2l0aW9uKDIsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMiwgMSkpLCBuZXcgUG9zaXRpb24oMiwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigyLCAyKSksIG5ldyBQb3NpdGlvbigyLCAyKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDIsIDMwKSksIG5ldyBQb3NpdGlvbigyLCA5KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMywgMCkpLCBuZXcgUG9zaXRpb24oMiwgOSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigzLCAxKSksIG5ldyBQb3NpdGlvbigyLCA5KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDMsIDMwKSksIG5ldyBQb3NpdGlvbigyLCA5KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMzAsIDMwKSksIG5ldyBQb3NpdGlvbigyLCA5KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oLTEyMy4xMjMsIC0wLjUpKSwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oTnVtYmVyLk1JTl9WQUxVRSwgTnVtYmVyLk1JTl9WQUxVRSkpLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKE51bWJlci5NQVhfVkFMVUUsIE51bWJlci5NQVhfVkFMVUUpKSwgbmV3IFBvc2l0aW9uKDIsIDkpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMTIzLjIzLCA0Ny41KSksIG5ldyBQb3NpdGlvbigyLCA5KSk7XG5cblx0XHRtLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndmFsaWRhdGVQb3NpdGlvbiBhcm91bmQgaGlnaC1sb3cgc3Vycm9nYXRlIHBhaXJzIDEnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBtID0gY3JlYXRlVGV4dE1vZGVsKCdhXHVEODNEXHVEQ0RBYicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDAsIDApKSwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMCwgMSkpLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigwLCA3KSksIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMSkpLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAyKSksIG5ldyBQb3NpdGlvbigxLCAyKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDMpKSwgbmV3IFBvc2l0aW9uKDEsIDIpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgNCkpLCBuZXcgUG9zaXRpb24oMSwgNCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA1KSksIG5ldyBQb3NpdGlvbigxLCA1KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDMwKSksIG5ldyBQb3NpdGlvbigxLCA1KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMiwgMCkpLCBuZXcgUG9zaXRpb24oMSwgNSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigyLCAxKSksIG5ldyBQb3NpdGlvbigxLCA1KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDIsIDIpKSwgbmV3IFBvc2l0aW9uKDEsIDUpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMiwgMzApKSwgbmV3IFBvc2l0aW9uKDEsIDUpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigtMTIzLjEyMywgLTAuNSkpLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbihOdW1iZXIuTUlOX1ZBTFVFLCBOdW1iZXIuTUlOX1ZBTFVFKSksIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oTnVtYmVyLk1BWF9WQUxVRSwgTnVtYmVyLk1BWF9WQUxVRSkpLCBuZXcgUG9zaXRpb24oMSwgNSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxMjMuMjMsIDQ3LjUpKSwgbmV3IFBvc2l0aW9uKDEsIDUpKTtcblxuXHRcdG0uZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd2YWxpZGF0ZVBvc2l0aW9uIGFyb3VuZCBoaWdoLWxvdyBzdXJyb2dhdGUgcGFpcnMgMicsICgpID0+IHtcblxuXHRcdGNvbnN0IG0gPSBjcmVhdGVUZXh0TW9kZWwoJ2FcdUQ4M0RcdURDREFcdUQ4M0RcdURDREFiJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMSkpLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAyKSksIG5ldyBQb3NpdGlvbigxLCAyKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDMpKSwgbmV3IFBvc2l0aW9uKDEsIDIpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgNCkpLCBuZXcgUG9zaXRpb24oMSwgNCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA1KSksIG5ldyBQb3NpdGlvbigxLCA0KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDYpKSwgbmV3IFBvc2l0aW9uKDEsIDYpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgNykpLCBuZXcgUG9zaXRpb24oMSwgNykpO1xuXG5cdFx0bS5kaXNwb3NlKCk7XG5cblx0fSk7XG5cblx0dGVzdCgndmFsaWRhdGVQb3NpdGlvbiBoYW5kbGUgTmFOLicsICgpID0+IHtcblxuXHRcdGNvbnN0IG0gPSBjcmVhdGVUZXh0TW9kZWwoJ2xpbmUgb25lXFxubGluZSB0d28nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbihOYU4sIDEpKSwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgTmFOKSksIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oTmFOLCBOYU4pKSwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVQb3NpdGlvbihuZXcgUG9zaXRpb24oMiwgTmFOKSksIG5ldyBQb3NpdGlvbigyLCAxKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUG9zaXRpb24obmV3IFBvc2l0aW9uKE5hTiwgMykpLCBuZXcgUG9zaXRpb24oMSwgMykpO1xuXG5cdFx0bS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM3MTQ4MDogdmFsaWRhdGVQb3NpdGlvbiBoYW5kbGUgZmxvYXRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG0gPSBjcmVhdGVUZXh0TW9kZWwoJ2xpbmUgb25lXFxubGluZSB0d28nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigwLjIsIDEpKSwgbmV3IFBvc2l0aW9uKDEsIDEpLCAnYScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLjIsIDEpKSwgbmV3IFBvc2l0aW9uKDEsIDEpLCAnYicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLjUsIDIpKSwgbmV3IFBvc2l0aW9uKDEsIDIpLCAnYycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLjgsIDMpKSwgbmV3IFBvc2l0aW9uKDEsIDMpLCAnZCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAwLjMpKSwgbmV3IFBvc2l0aW9uKDEsIDEpLCAnZScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigyLCAwLjgpKSwgbmV3IFBvc2l0aW9uKDIsIDEpLCAnZicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAxLjIpKSwgbmV3IFBvc2l0aW9uKDEsIDEpLCAnZycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVBvc2l0aW9uKG5ldyBQb3NpdGlvbigyLCAxLjUpKSwgbmV3IFBvc2l0aW9uKDIsIDEpLCAnaCcpO1xuXG5cdFx0bS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM3MTQ4MDogdmFsaWRhdGVSYW5nZSBoYW5kbGUgZmxvYXRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG0gPSBjcmVhdGVUZXh0TW9kZWwoJ2xpbmUgb25lXFxubGluZSB0d28nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgwLjIsIDEuNSwgMC44LCAyLjUpKSwgbmV3IFJhbmdlKDEsIDEsIDEsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMS4yLCAxLjcsIDEuOCwgMi4yKSksIG5ldyBSYW5nZSgxLCAxLCAxLCAyKSk7XG5cblx0XHRtLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndmFsaWRhdGVSYW5nZSBhcm91bmQgaGlnaC1sb3cgc3Vycm9nYXRlIHBhaXJzIDEnLCAoKSA9PiB7XG5cblx0XHRjb25zdCBtID0gY3JlYXRlVGV4dE1vZGVsKCdhXHVEODNEXHVEQ0RBYicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDAsIDAsIDAsIDEpKSwgbmV3IFJhbmdlKDEsIDEsIDEsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMCwgMCwgMCwgNykpLCBuZXcgUmFuZ2UoMSwgMSwgMSwgMSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEsIDEpKSwgbmV3IFJhbmdlKDEsIDEsIDEsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgMSwgMSwgMikpLCBuZXcgUmFuZ2UoMSwgMSwgMSwgMikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCAxLCAxLCAzKSksIG5ldyBSYW5nZSgxLCAxLCAxLCA0KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEsIDQpKSwgbmV3IFJhbmdlKDEsIDEsIDEsIDQpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgMSwgMSwgNSkpLCBuZXcgUmFuZ2UoMSwgMSwgMSwgNSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDIsIDEsIDIpKSwgbmV3IFJhbmdlKDEsIDIsIDEsIDIpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgMiwgMSwgMykpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgNCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCAyLCAxLCA0KSksIG5ldyBSYW5nZSgxLCAyLCAxLCA0KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDIsIDEsIDUpKSwgbmV3IFJhbmdlKDEsIDIsIDEsIDUpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCAzLCAxLCAzKSksIG5ldyBSYW5nZSgxLCAyLCAxLCAyKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDMsIDEsIDQpKSwgbmV3IFJhbmdlKDEsIDIsIDEsIDQpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgMywgMSwgNSkpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgNSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDQsIDEsIDQpKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgNCwgMSwgNSkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDUsIDEsIDUpKSwgbmV3IFJhbmdlKDEsIDUsIDEsIDUpKTtcblxuXHRcdG0uZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd2YWxpZGF0ZVJhbmdlIGFyb3VuZCBoaWdoLWxvdyBzdXJyb2dhdGUgcGFpcnMgMicsICgpID0+IHtcblxuXHRcdGNvbnN0IG0gPSBjcmVhdGVUZXh0TW9kZWwoJ2FcdUQ4M0RcdURDREFcdUQ4M0RcdURDREFiJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMCwgMCwgMCwgMSkpLCBuZXcgUmFuZ2UoMSwgMSwgMSwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgwLCAwLCAwLCA3KSksIG5ldyBSYW5nZSgxLCAxLCAxLCAxKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgMSwgMSwgMSkpLCBuZXcgUmFuZ2UoMSwgMSwgMSwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCAxLCAxLCAyKSksIG5ldyBSYW5nZSgxLCAxLCAxLCAyKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEsIDMpKSwgbmV3IFJhbmdlKDEsIDEsIDEsIDQpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgMSwgMSwgNCkpLCBuZXcgUmFuZ2UoMSwgMSwgMSwgNCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCAxLCAxLCA1KSksIG5ldyBSYW5nZSgxLCAxLCAxLCA2KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDEsIDEsIDYpKSwgbmV3IFJhbmdlKDEsIDEsIDEsIDYpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgMSwgMSwgNykpLCBuZXcgUmFuZ2UoMSwgMSwgMSwgNykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDIsIDEsIDIpKSwgbmV3IFJhbmdlKDEsIDIsIDEsIDIpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgMiwgMSwgMykpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgNCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCAyLCAxLCA0KSksIG5ldyBSYW5nZSgxLCAyLCAxLCA0KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDIsIDEsIDUpKSwgbmV3IFJhbmdlKDEsIDIsIDEsIDYpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgMiwgMSwgNikpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgNikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCAyLCAxLCA3KSksIG5ldyBSYW5nZSgxLCAyLCAxLCA3KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgMywgMSwgMykpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgMikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCAzLCAxLCA0KSksIG5ldyBSYW5nZSgxLCAyLCAxLCA0KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDMsIDEsIDUpKSwgbmV3IFJhbmdlKDEsIDIsIDEsIDYpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgMywgMSwgNikpLCBuZXcgUmFuZ2UoMSwgMiwgMSwgNikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCAzLCAxLCA3KSksIG5ldyBSYW5nZSgxLCAyLCAxLCA3KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgNCwgMSwgNCkpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCA0LCAxLCA1KSksIG5ldyBSYW5nZSgxLCA0LCAxLCA2KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDQsIDEsIDYpKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDYpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgNCwgMSwgNykpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLnZhbGlkYXRlUmFuZ2UobmV3IFJhbmdlKDEsIDUsIDEsIDUpKSwgbmV3IFJhbmdlKDEsIDQsIDEsIDQpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgNSwgMSwgNikpLCBuZXcgUmFuZ2UoMSwgNCwgMSwgNikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCA1LCAxLCA3KSksIG5ldyBSYW5nZSgxLCA0LCAxLCA3KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgNiwgMSwgNikpLCBuZXcgUmFuZ2UoMSwgNiwgMSwgNikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS52YWxpZGF0ZVJhbmdlKG5ldyBSYW5nZSgxLCA2LCAxLCA3KSksIG5ldyBSYW5nZSgxLCA2LCAxLCA3KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0udmFsaWRhdGVSYW5nZShuZXcgUmFuZ2UoMSwgNywgMSwgNykpLCBuZXcgUmFuZ2UoMSwgNywgMSwgNykpO1xuXG5cdFx0bS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vZGlmeVBvc2l0aW9uJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgbSA9IGNyZWF0ZVRleHRNb2RlbCgnbGluZSBvbmVcXG5saW5lIHR3bycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS5tb2RpZnlQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMSksIDApLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS5tb2RpZnlQb3NpdGlvbihuZXcgUG9zaXRpb24oMCwgMCksIDApLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS5tb2RpZnlQb3NpdGlvbihuZXcgUG9zaXRpb24oMzAsIDEpLCAwKSwgbmV3IFBvc2l0aW9uKDIsIDkpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS5tb2RpZnlQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMSksIDE3KSwgbmV3IFBvc2l0aW9uKDIsIDkpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0ubW9kaWZ5UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDEpLCAxKSwgbmV3IFBvc2l0aW9uKDEsIDIpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0ubW9kaWZ5UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDEpLCAzKSwgbmV3IFBvc2l0aW9uKDEsIDQpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0ubW9kaWZ5UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDIpLCAxMCksIG5ldyBQb3NpdGlvbigyLCAzKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLm1vZGlmeVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCA1KSwgMTMpLCBuZXcgUG9zaXRpb24oMiwgOSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS5tb2RpZnlQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMiksIDE2KSwgbmV3IFBvc2l0aW9uKDIsIDkpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS5tb2RpZnlQb3NpdGlvbihuZXcgUG9zaXRpb24oMiwgOSksIC0xNyksIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLm1vZGlmeVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAyKSwgLTEpLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS5tb2RpZnlQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgNCksIC0zKSwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0ubW9kaWZ5UG9zaXRpb24obmV3IFBvc2l0aW9uKDIsIDMpLCAtMTApLCBuZXcgUG9zaXRpb24oMSwgMikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS5tb2RpZnlQb3NpdGlvbihuZXcgUG9zaXRpb24oMiwgOSksIC0xMyksIG5ldyBQb3NpdGlvbigxLCA1KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLm1vZGlmeVBvc2l0aW9uKG5ldyBQb3NpdGlvbigyLCA5KSwgLTE2KSwgbmV3IFBvc2l0aW9uKDEsIDIpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS5tb2RpZnlQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMiksIDE3KSwgbmV3IFBvc2l0aW9uKDIsIDkpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG0ubW9kaWZ5UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDIpLCAxMDApLCBuZXcgUG9zaXRpb24oMiwgOSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtLm1vZGlmeVBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAyKSwgLTIpLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS5tb2RpZnlQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMiksIC0xMDApLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS5tb2RpZnlQb3NpdGlvbihuZXcgUG9zaXRpb24oMiwgMiksIC0xMDApLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobS5tb2RpZnlQb3NpdGlvbihuZXcgUG9zaXRpb24oMiwgOSksIC0xOCksIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cblx0XHRtLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnbm9ybWFsaXplSW5kZW50YXRpb24gMScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnJyxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHtcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24oJ1xcdCcpLCAnXFx0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcgICAgJyksICdcXHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24oJyAgICcpLCAnICAgJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcgICcpLCAnICAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24oJyAnKSwgJyAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24oJycpLCAnJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcgXFx0ICAgICcpLCAnXFx0XFx0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcgXFx0ICAgJyksICdcXHQgICAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24oJyBcXHQgICcpLCAnXFx0ICAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24oJyBcXHQgJyksICdcXHQgJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcgXFx0JyksICdcXHQnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5ub3JtYWxpemVJbmRlbnRhdGlvbignXFx0YScpLCAnXFx0YScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5ub3JtYWxpemVJbmRlbnRhdGlvbignICAgIGEnKSwgJ1xcdGEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24oJyAgIGEnKSwgJyAgIGEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24oJyAgYScpLCAnICBhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcgYScpLCAnIGEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24oJ2EnKSwgJ2EnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24oJyBcXHQgICAgYScpLCAnXFx0XFx0YScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5ub3JtYWxpemVJbmRlbnRhdGlvbignIFxcdCAgIGEnKSwgJ1xcdCAgIGEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24oJyBcXHQgIGEnKSwgJ1xcdCAgYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5ub3JtYWxpemVJbmRlbnRhdGlvbignIFxcdCBhJyksICdcXHQgYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5ub3JtYWxpemVJbmRlbnRhdGlvbignIFxcdGEnKSwgJ1xcdGEnKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnbm9ybWFsaXplSW5kZW50YXRpb24gMicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24oJ1xcdGEnKSwgJyAgICBhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcgICAgYScpLCAnICAgIGEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24oJyAgIGEnKSwgJyAgIGEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24oJyAgYScpLCAnICBhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcgYScpLCAnIGEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24oJ2EnKSwgJ2EnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24oJyBcXHQgICAgYScpLCAnICAgICAgICBhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcgXFx0ICAgYScpLCAnICAgICAgIGEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24oJyBcXHQgIGEnKSwgJyAgICAgIGEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24oJyBcXHQgYScpLCAnICAgICBhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKCcgXFx0YScpLCAnICAgIGEnKTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0TGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnYXNkJyxcblx0XHRcdCcgYXNkJyxcblx0XHRcdCdcXHRhc2QnLFxuXHRcdFx0JyAgYXNkJyxcblx0XHRcdCdcXHRcXHRhc2QnLFxuXHRcdFx0JyAnLFxuXHRcdFx0JyAgJyxcblx0XHRcdCdcXHQnLFxuXHRcdFx0J1xcdFxcdCcsXG5cdFx0XHQnICBcXHRhc2QnLFxuXHRcdFx0JycsXG5cdFx0XHQnJ1xuXHRcdF0uam9pbignXFxuJykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4oMSksIDEsICcxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4oMiksIDIsICcyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4oMyksIDIsICczJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4oNCksIDMsICc0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4oNSksIDMsICc1Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4oNiksIDAsICc2Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4oNyksIDAsICc3Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4oOCksIDAsICc4Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4oOSksIDAsICc5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVGaXJzdE5vbldoaXRlc3BhY2VDb2x1bW4oMTApLCA0LCAnMTAnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbigxMSksIDAsICcxMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKDEyKSwgMCwgJzEyJyk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNvbHVtbicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChbXG5cdFx0XHQnYXNkJyxcblx0XHRcdCdhc2QgJyxcblx0XHRcdCdhc2RcXHQnLFxuXHRcdFx0J2FzZCAgJyxcblx0XHRcdCdhc2RcXHRcXHQnLFxuXHRcdFx0JyAnLFxuXHRcdFx0JyAgJyxcblx0XHRcdCdcXHQnLFxuXHRcdFx0J1xcdFxcdCcsXG5cdFx0XHQnYXNkICBcXHQnLFxuXHRcdFx0JycsXG5cdFx0XHQnJ1xuXHRcdF0uam9pbignXFxuJykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNvbHVtbigxKSwgNCwgJzEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUxhc3ROb25XaGl0ZXNwYWNlQ29sdW1uKDIpLCA0LCAnMicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lTGFzdE5vbldoaXRlc3BhY2VDb2x1bW4oMyksIDQsICczJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNvbHVtbig0KSwgNCwgJzQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUxhc3ROb25XaGl0ZXNwYWNlQ29sdW1uKDUpLCA0LCAnNScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lTGFzdE5vbldoaXRlc3BhY2VDb2x1bW4oNiksIDAsICc2Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNvbHVtbig3KSwgMCwgJzcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUxhc3ROb25XaGl0ZXNwYWNlQ29sdW1uKDgpLCAwLCAnOCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lTGFzdE5vbldoaXRlc3BhY2VDb2x1bW4oOSksIDAsICc5Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNvbHVtbigxMCksIDQsICcxMCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lTGFzdE5vbldoaXRlc3BhY2VDb2x1bW4oMTEpLCAwLCAnMTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUxhc3ROb25XaGl0ZXNwYWNlQ29sdW1uKDEyKSwgMCwgJzEyJyk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJyM1MDQ3MS4gZ2V0VmFsdWVJblJhbmdlIHdpdGggaW52YWxpZCByYW5nZScsICgpID0+IHtcblx0XHRjb25zdCBtID0gY3JlYXRlVGV4dE1vZGVsKCdNeSBGaXJzdCBMaW5lXFxyXFxuTXkgU2Vjb25kIExpbmVcXHJcXG5NeSBUaGlyZCBMaW5lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZSgxLCBOYU4sIDEsIDMpKSwgJ015Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZShOYU4sIE5hTiwgTmFOLCBOYU4pKSwgJycpO1xuXHRcdG0uZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTY4ODM2OiB1cGRhdGluZyB0YWJTaXplIHNob3VsZCBhbHNvIHVwZGF0ZSBpbmRlbnRTaXplIHdoZW4gaW5kZW50U2l6ZSBpcyBzZXQgdG8gXCJ0YWJTaXplXCInLCAoKSA9PiB7XG5cdFx0Y29uc3QgbSA9IGNyZWF0ZVRleHRNb2RlbCgnc29tZSB0ZXh0JywgbnVsbCwge1xuXHRcdFx0dGFiU2l6ZTogMixcblx0XHRcdGluZGVudFNpemU6ICd0YWJTaXplJ1xuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldE9wdGlvbnMoKS50YWJTaXplLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRPcHRpb25zKCkuaW5kZW50U2l6ZSwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0T3B0aW9ucygpLm9yaWdpbmFsSW5kZW50U2l6ZSwgJ3RhYlNpemUnKTtcblx0XHRtLnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0dGFiU2l6ZTogNFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtLmdldE9wdGlvbnMoKS50YWJTaXplLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobS5nZXRPcHRpb25zKCkuaW5kZW50U2l6ZSwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG0uZ2V0T3B0aW9ucygpLm9yaWdpbmFsSW5kZW50U2l6ZSwgJ3RhYlNpemUnKTtcblx0XHRtLmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1RleHRNb2RlbC5taWdodENvbnRhaW5SVEwnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbm9wZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnaGVsbG8gd29ybGQhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm1pZ2h0Q29udGFpblJUTCgpLCBmYWxzZSk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd5ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ0hlbGxvLFxcblx1MDVENlx1MDVENVx1MDVENFx1MDVEOSBcdTA1RTJcdTA1RDVcdTA1RDFcdTA1RDNcdTA1RDQgXHUwNURFXHUwNUQxXHUwNUQ1XHUwNUUxXHUwNUUxXHUwNUVBIFx1MDVFOVx1MDVEM1x1MDVFMlx1MDVFQVx1MDVENScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5taWdodENvbnRhaW5SVEwoKSwgdHJ1ZSk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRWYWx1ZSByZXNldHMgMScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnaGVsbG8gd29ybGQhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm1pZ2h0Q29udGFpblJUTCgpLCBmYWxzZSk7XG5cdFx0bW9kZWwuc2V0VmFsdWUoJ0hlbGxvLFxcblx1MDVENlx1MDVENVx1MDVENFx1MDVEOSBcdTA1RTJcdTA1RDVcdTA1RDFcdTA1RDNcdTA1RDQgXHUwNURFXHUwNUQxXHUwNUQ1XHUwNUUxXHUwNUUxXHUwNUVBIFx1MDVFOVx1MDVEM1x1MDVFMlx1MDVFQVx1MDVENScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5taWdodENvbnRhaW5SVEwoKSwgdHJ1ZSk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRWYWx1ZSByZXNldHMgMicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnSGVsbG8sXFxuXHUwNjQ3XHUwNjQ2XHUwNjI3XHUwNjQzIFx1MDYyRFx1MDY0Mlx1MDY0QVx1MDY0Mlx1MDYyOSBcdTA2NDVcdTA2MkJcdTA2MjhcdTA2MkFcdTA2MjkgXHUwNjQ1XHUwNjQ2XHUwNjMwIFx1MDYzMlx1MDY0NVx1MDY0NiBcdTA2MzdcdTA2NDhcdTA2NEFcdTA2NDQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubWlnaHRDb250YWluUlRMKCksIHRydWUpO1xuXHRcdG1vZGVsLnNldFZhbHVlKCdoZWxsbyB3b3JsZCEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubWlnaHRDb250YWluUlRMKCksIGZhbHNlKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG59KTtcblxuc3VpdGUoJ1RleHRNb2RlbC5jcmVhdGVTbmFwc2hvdCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdlbXB0eSBmaWxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCcnKTtcblx0XHRjb25zdCBzbmFwc2hvdCA9IG1vZGVsLmNyZWF0ZVNuYXBzaG90KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuYXBzaG90LnJlYWQoKSwgbnVsbCk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWxlIHdpdGggQk9NJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFVURjhfQk9NX0NIQVJBQ1RFUiArICdIZWxsbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ0hlbGxvJyk7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSBtb2RlbC5jcmVhdGVTbmFwc2hvdCh0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25hcHNob3QucmVhZCgpLCBVVEY4X0JPTV9DSEFSQUNURVIgKyAnSGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25hcHNob3QucmVhZCgpLCBudWxsKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZ3VsYXIgZmlsZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnTXkgRmlyc3QgTGluZVxcblxcdFxcdE15IFNlY29uZCBMaW5lXFxuICAgIFRoaXJkIExpbmVcXG5cXG4xJyk7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSBtb2RlbC5jcmVhdGVTbmFwc2hvdCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmFwc2hvdC5yZWFkKCksICdNeSBGaXJzdCBMaW5lXFxuXFx0XFx0TXkgU2Vjb25kIExpbmVcXG4gICAgVGhpcmQgTGluZVxcblxcbjEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25hcHNob3QucmVhZCgpLCBudWxsKTtcblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xhcmdlIGZpbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAxMDAwOyBpKyspIHtcblx0XHRcdGxpbmVzW2ldID0gJ0p1c3Qgc29tZSB0ZXh0IHRoYXQgaXMgYSBiaXQgbG9uZyBzdWNoIHRoYXQgaXQgY2FuIGNvbnN1bWUgc29tZSBtZW1vcnknO1xuXHRcdH1cblx0XHRjb25zdCB0ZXh0ID0gbGluZXMuam9pbignXFxuJyk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCh0ZXh0KTtcblx0XHRjb25zdCBzbmFwc2hvdCA9IG1vZGVsLmNyZWF0ZVNuYXBzaG90KCk7XG5cdFx0bGV0IGFjdHVhbCA9ICcnO1xuXG5cdFx0Ly8gNzA5OTkgbGVuZ3RoID0+IGF0IG1vc3QgMiByZWFkIGNhbGxzIGFyZSBuZWNlc3Nhcnlcblx0XHRjb25zdCB0bXAxID0gc25hcHNob3QucmVhZCgpO1xuXHRcdGFzc2VydC5vayh0bXAxKTtcblx0XHRhY3R1YWwgKz0gdG1wMTtcblxuXHRcdGNvbnN0IHRtcDIgPSBzbmFwc2hvdC5yZWFkKCk7XG5cdFx0aWYgKHRtcDIgPT09IG51bGwpIHtcblx0XHRcdC8vIGFsbCBnb29kXG5cdFx0fSBlbHNlIHtcblx0XHRcdGFjdHVhbCArPSB0bXAyO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuYXBzaG90LnJlYWQoKSwgbnVsbCk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgdGV4dCk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTk2MzI6IGludmFsaWQgcmFuZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2hlbGxvIHdvcmxkIScpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnN0IGFjdHVhbCA9IG1vZGVsLl92YWxpZGF0ZVJhbmdlUmVsYXhlZE5vQWxsb2NhdGlvbnMobmV3IFJhbmdlKDxhbnk+dW5kZWZpbmVkLCAwLCA8YW55PnVuZGVmaW5lZCwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBuZXcgUmFuZ2UoMSwgMSwgMSwgMSkpO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUN0QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLFdBQVcsd0JBQXdCO0FBQzVDLFNBQVMscUJBQXFCLHVCQUF1QjtBQUdyRCxTQUFTLHFCQUFxQixxQkFBOEIsZ0JBQXdCLHNCQUErQixpQkFBeUIsTUFBZ0IsS0FBb0I7QUFDL0ssUUFBTSxJQUFJO0FBQUEsSUFDVCxLQUFLLEtBQUssSUFBSTtBQUFBLElBQ2Q7QUFBQSxJQUNBO0FBQUEsTUFDQyxTQUFTO0FBQUEsTUFDVCxjQUFjO0FBQUEsTUFDZCxtQkFBbUI7QUFBQSxJQUNwQjtBQUFBLEVBQ0Q7QUFDQSxRQUFNLElBQUksRUFBRSxXQUFXO0FBQ3ZCLElBQUUsUUFBUTtBQUVWLFNBQU8sWUFBWSxFQUFFLGNBQWMsc0JBQXNCLEdBQUc7QUFDNUQsU0FBTyxZQUFZLEVBQUUsU0FBUyxpQkFBaUIsR0FBRztBQUNuRDtBQUVBLFNBQVMsWUFBWSxzQkFBMkMsaUJBQWdELE1BQWdCLEtBQW9CO0FBQ25KLE1BQUksT0FBTyx5QkFBeUIsYUFBYTtBQUVoRCxRQUFJLE9BQU8sb0JBQW9CLGFBQWE7QUFFM0MsMkJBQXFCLE1BQU0sT0FBTyxNQUFNLE9BQU8sTUFBTSxHQUFHO0FBQ3hELDJCQUFxQixPQUFPLE9BQU8sT0FBTyxPQUFPLE1B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TSxHQUFHO0FBQUEsTUFDcEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxVQUFVO0FBQ2IsZ0JBQVksTUFBTSxHQUFHO0FBQUEsTUFDcEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxlQUFlO0FBQ2xCLGdCQUFZLE1BQU0sR0FBRztBQUFBLE1BQ3BCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxHQUFHLEtBQUs7QUFFUixnQkFBWSxNQUFNLEdBQUc7QUFBQSxNQUNwQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxHQUFHLEtBQUs7QUFDUixnQkFBWSxNQUFNLEdBQUc7QUFBQSxNQUNwQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxHQUFHLFVBQVU7QUFDYixnQkFBWSxNQUFNLEdBQUc7QUFBQSxNQUNwQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtB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bkUsV0FBTyxZQUFZLE1BQU0sZ0NBQWdDLENBQUMsR0FBRyxHQUFHLEdBQUc7QUFDbkUsV0FBTyxZQUFZLE1BQU0sZ0NBQWdDLENBQUMsR0FBRyxHQUFHLEdBQUc7QUFDbkUsV0FBTyxZQUFZLE1BQU0sZ0NBQWdDLEVBQUUsR0FBRyxHQUFHLElBQUk7QUFDckUsV0FBTyxZQUFZLE1BQU0sZ0NBQWdDLEVBQUUsR0FBRyxHQUFHLElBQUk7QUFDckUsV0FBTyxZQUFZLE1BQU0sZ0NBQWdDLEVBQUUsR0FBRyxHQUFHLElBQUk7QUFFckUsVUFBTSxRQUFRO0FBQUEsRUFDZixDQUFDO0FBRUQsT0FBSyxrQ0FBa0MsTUFBTTtBQUM1QyxVQUFNLFFBQVEsZ0JBQWdCO0FBQUEsTUFDN0I7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsRUFBRSxLQUFLLElBQUksQ0FBQztBQUVaLFdBQU8sWUFBWSxNQUFNLCtCQUErQixDQUFDLEdBQUcsR0FBRyxHQUFHO0FBQ2xFLFdBQU8sWUFBWSxNQUFNLCtCQUErQixDQUFDLEdBQUcsR0FBRyxHQUFHO0FBQ2xFLFdBQU8sWUFBWSxNQUFNLCtCQUErQixDQUFDLEdBQUcsR0FBRyxHQUFHO0FBQ2xFLFdBQU8sWUFBWSxNQUFNLCtCQUErQixDQUFDLEdBQUcsR0FBRyxHQUFHO0FBQ2xFLFdBQU8sWUFBWSxNQUFNLCtCQUErQixDQUFDLEdBQUcsR0FBRyxHQUFHO0FBQ2xFLFdBQU8sWUFBWSxNQUFNLCtCQUErQixDQUFDLEdBQUcsR0FBRyxHQUFHO0FBQ2xFLFdBQU8sWUFBWSxNQUFNLCtCQUErQixDQUFDLEdBQUcsR0FBRyxHQUFHO0FBQ2xFLFdBQU8sWUFBWSxNQUFNLCtCQUErQixDQUFDLEdBQUcsR0FBRyxHQUFHO0FBQ2xFLFdBQU8sWUFBWSxNQUFNLCtCQUErQixDQUFDLEdBQUcsR0FBRyxHQUFHO0FBQ2xF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
