import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { MetadataConsts } from "../../../common/encodedTokenAttributes.js";
import * as languages from "../../../common/languages.js";
import { NullState } from "../../../common/languages/nullTokenize.js";
import { ModelLineProjectionData } from "../../../common/modelLineProjectionData.js";
import { createModelLineProjection } from "../../../common/viewModel/modelLineProjection.js";
import { MonospaceLineBreaksComputerFactory } from "../../../common/viewModel/monospaceLineBreaksComputer.js";
import { ViewModelLinesFromProjectedModel } from "../../../common/viewModel/viewModelLines.js";
import { TestConfiguration } from "../config/testConfiguration.js";
import { createTextModel } from "../../common/testTextModel.js";
suite("Editor ViewModel - SplitLinesCollection", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("SplitLine", () => {
    let model1 = createModel("My First LineMy Second LineAnd another one");
    let line1 = createSplitLine([13, 14, 15], [13, 13 + 14, 13 + 14 + 15], 0);
    assert.strictEqual(line1.getViewLineCount(), 3);
    assert.strictEqual(line1.getViewLineContent(model1, 1, 0), "My First Line");
    assert.strictEqual(line1.getViewLineContent(model1, 1, 1), "My Second Line");
    assert.strictEqual(line1.getViewLineContent(model1, 1, 2), "And another one");
    assert.strictEqual(line1.getViewLineMaxColumn(model1, 1, 0), 14);
    assert.strictEqual(line1.getViewLineMaxColumn(model1, 1, 1), 15);
    assert.strictEqual(line1.getViewLineMaxColumn(model1, 1, 2), 16);
    for (let col = 1; col <= 14; col++) {
      assert.strictEqual(line1.getModelColumnOfViewPosition(0, col), col, "getInputColumnOfOutputPosition(0, " + col + ")");
    }
    for (let col = 1; col <= 15; col++) {
      assert.strictEqual(line1.getModelColumnOfViewPosition(1, col), 13 + col, "getInputColumnOfOutputPosition(1, " + col + ")");
    }
    for (let col = 1; col <= 16; col++) {
      assert.strictEqual(line1.getModelColumnOfViewPosition(2, col), 13 + 14 + col, "getInputColumnOfOutputPosition(2, " + col + ")");
    }
    for (let col = 1; col <= 13; col++) {
      assert.deepStrictEqual(line1.getViewPositionOfModelPosition(0, col), pos(0, col), "getOutputPositionOfInputPosition(" + col + ")");
    }
    for (let col = 1 + 13; col <= 14 + 13; col++) {
      assert.deepStrictEqual(line1.getViewPositionOfModelPosition(0, col), pos(1, col - 13), "getOutputPositionOfInputPosition(" + col + ")");
    }
    for (let col = 1 + 13 + 14; col <= 15 + 14 + 13; col++) {
      assert.deepStrictEqual(line1.getViewPositionOfModelPosition(0, col), pos(2, col - 13 - 14), "getOutputPositionOfInputPosition(" + col + ")");
    }
    model1 = createModel("My First LineMy Second LineAnd another one");
    line1 = createSplitLine([13, 14, 15], [13, 13 + 14, 13 + 14 + 15], 4);
    assert.strictEqual(line1.getViewLineCount(), 3);
    assert.strictEqual(line1.getViewLineContent(model1, 1, 0), "My First Line");
    assert.strictEqual(line1.getViewLineContent(model1, 1, 1), "    My Second Line");
    assert.strictEqual(line1.getViewLineContent(model1, 1, 2), "    And another one");
    assert.strictEqual(line1.getViewLineMaxColumn(model1, 1, 0), 14);
    assert.strictEqual(line1.getViewLineMaxColumn(model1, 1, 1), 19);
    assert.strictEqual(line1.getViewLineMaxColumn(model1, 1, 2), 20);
    const actualViewColumnMapping = [];
    for (let lineIndex = 0; lineIndex < line1.getViewLineCount(); lineIndex++) {
      const actualLineViewColumnMapping = [];
      for (let col = 1; col <= line1.getViewLineMaxColumn(model1, 1, lineIndex); col++) {
        actualLineViewColumnMapping.push(line1.getModelColumnOfViewPosition(lineIndex, col));
      }
      actualViewColumnMapping.push(actualLineViewColumnMapping);
    }
    assert.deepStrictEqual(actualViewColumnMapping, [
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
      [14, 14, 14, 14, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28],
      [28, 28, 28, 28, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43]
    ]);
    for (let col = 1; col <= 13; col++) {
      assert.deepStrictEqual(line1.getViewPositionOfModelPosition(0, col), pos(0, col), "6.getOutputPositionOfInputPosition(" + col + ")");
    }
    for (let col = 1 + 13; col <= 14 + 13; col++) {
      assert.deepStrictEqual(line1.getViewPositionOfModelPosition(0, col), pos(1, 4 + col - 13), "7.getOutputPositionOfInputPosition(" + col + ")");
    }
    for (let col = 1 + 13 + 14; col <= 15 + 14 + 13; col++) {
      assert.deepStrictEqual(line1.getViewPositionOfModelPosition(0, col), pos(2, 4 + col - 13 - 14), "8.getOutputPositionOfInputPosition(" + col + ")");
    }
  });
  function withSplitLinesCollection(text, callback) {
    const config = new TestConfiguration({});
    const wrappingInfo = config.options.get(EditorOption.wrappingInfo);
    const fontInfo = config.options.get(EditorOption.fontInfo);
    const wordWrapBreakAfterCharacters = config.options.get(EditorOption.wordWrapBreakAfterCharacters);
    const wordWrapBreakBeforeCharacters = config.options.get(EditorOption.wordWrapBreakBeforeCharacters);
    const wrappingIndent = config.options.get(EditorOption.wrappingIndent);
    const wordBreak = config.options.get(EditorOption.wordBreak);
    const wrapOnEscapedLineFeeds = config.options.get(EditorOption.wrapOnEscapedLineFeeds);
    const lineBreaksComputerFactory = new MonospaceLineBreaksComputerFactory(wordWrapBreakBeforeCharacters, wordWrapBreakAfterCharacters);
    const model = createTextModel(text);
    const linesCollection = new ViewModelLinesFromProjectedModel(
      1,
      model,
      lineBreaksComputerFactory,
      lineBreaksComputerFactory,
      fontInfo,
      model.getOptions().tabSize,
      "simple",
      wrappingInfo.wrappingColumn,
      wrappingIndent,
      wordBreak,
      wrapOnEscapedLineFeeds
    );
    callback(model, linesCollection);
    linesCollection.dispose();
    model.dispose();
    config.dispose();
  }
  test("Invalid line numbers", () => {
    const text = [
      "int main() {",
      '	printf("Hello world!");',
      "}",
      "int main() {",
      '	printf("Hello world!");',
      "}"
    ].join("\n");
    withSplitLinesCollection(text, (model, linesCollection) => {
      assert.strictEqual(linesCollection.getViewLineCount(), 6);
      assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(-1, -1), [0]);
      assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(0, 0), [0]);
      assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(1, 1), [0]);
      assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(2, 2), [1]);
      assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(3, 3), [0]);
      assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(4, 4), [0]);
      assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(5, 5), [1]);
      assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(6, 6), [0]);
      assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(7, 7), [0]);
      assert.deepStrictEqual(linesCollection.getViewLinesIndentGuides(0, 7), [0, 1, 0, 0, 1, 0]);
      assert.strictEqual(linesCollection.getViewLineContent(-1), "int main() {");
      assert.strictEqual(linesCollection.getViewLineContent(0), "int main() {");
      assert.strictEqual(linesCollection.getViewLineContent(1), "int main() {");
      assert.strictEqual(linesCollection.getViewLineContent(2), '	printf("Hello world!");');
      assert.strictEqual(linesCollection.getViewLineContent(3), "}");
      assert.strictEqual(linesCollection.getViewLineContent(4), "int main() {");
      assert.strictEqual(linesCollection.getViewLineContent(5), '	printf("Hello world!");');
      assert.strictEqual(linesCollection.getViewLineContent(6), "}");
      assert.strictEqual(linesCollection.getViewLineContent(7), "}");
      assert.strictEqual(linesCollection.getViewLineMinColumn(-1), 1);
      assert.strictEqual(linesCollection.getViewLineMinColumn(0), 1);
      assert.strictEqual(linesCollection.getViewLineMinColumn(1), 1);
      assert.strictEqual(linesCollection.getViewLineMinColumn(2), 1);
      assert.strictEqual(linesCollection.getViewLineMinColumn(3), 1);
      assert.strictEqual(linesCollection.getViewLineMinColumn(4), 1);
      assert.strictEqual(linesCollection.getViewLineMinColumn(5), 1);
      assert.strictEqual(linesCollection.getViewLineMinColumn(6), 1);
      assert.strictEqual(linesCollection.getViewLineMinColumn(7), 1);
      assert.strictEqual(linesCollection.getViewLineMaxColumn(-1), 13);
      assert.strictEqual(linesCollection.getViewLineMaxColumn(0), 13);
      assert.strictEqual(linesCollection.getViewLineMaxColumn(1), 13);
      assert.strictEqual(linesCollection.getViewLineMaxColumn(2), 25);
      assert.strictEqual(linesCollection.getViewLineMaxColumn(3), 2);
      assert.strictEqual(linesCollection.getViewLineMaxColumn(4), 13);
      assert.strictEqual(linesCollection.getViewLineMaxColumn(5), 25);
      assert.strictEqual(linesCollection.getViewLineMaxColumn(6), 2);
      assert.strictEqual(linesCollection.getViewLineMaxColumn(7), 2);
      assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(-1, 1), new Position(1, 1));
      assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(0, 1), new Position(1, 1));
      assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(1, 1), new Position(1, 1));
      assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(2, 1), new Position(2, 1));
      assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(3, 1), new Position(3, 1));
      assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(4, 1), new Position(4, 1));
      assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(5, 1), new Position(5, 1));
      assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(6, 1), new Position(6, 1));
      assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(7, 1), new Position(6, 1));
      assert.deepStrictEqual(linesCollection.convertViewPositionToModelPosition(8, 1), new Position(6, 1));
    });
  });
  test("issue #3662", () => {
    const text = [
      "int main() {",
      '	printf("Hello world!");',
      "}",
      "int main() {",
      '	printf("Hello world!");',
      "}"
    ].join("\n");
    withSplitLinesCollection(text, (model, linesCollection) => {
      linesCollection.setHiddenAreas([
        new Range(1, 1, 3, 1),
        new Range(5, 1, 6, 1)
      ]);
      const viewLineCount = linesCollection.getViewLineCount();
      assert.strictEqual(viewLineCount, 1, "getOutputLineCount()");
      const modelLineCount = model.getLineCount();
      for (let lineNumber = 0; lineNumber <= modelLineCount + 1; lineNumber++) {
        const lineMinColumn = lineNumber >= 1 && lineNumber <= modelLineCount ? model.getLineMinColumn(lineNumber) : 1;
        const lineMaxColumn = lineNumber >= 1 && lineNumber <= modelLineCount ? model.getLineMaxColumn(lineNumber) : 1;
        for (let column = lineMinColumn - 1; column <= lineMaxColumn + 1; column++) {
          const viewPosition = linesCollection.convertModelPositionToViewPosition(lineNumber, column);
          let viewLineNumber = viewPosition.lineNumber;
          let viewColumn = viewPosition.column;
          if (viewLineNumber < 1) {
            viewLineNumber = 1;
          }
          const lineCount = linesCollection.getViewLineCount();
          if (viewLineNumber > lineCount) {
            viewLineNumber = lineCount;
          }
          const viewMinColumn = linesCollection.getViewLineMinColumn(viewLineNumber);
          const viewMaxColumn = linesCollection.getViewLineMaxColumn(viewLineNumber);
          if (viewColumn < viewMinColumn) {
            viewColumn = viewMinColumn;
          }
          if (viewColumn > viewMaxColumn) {
            viewColumn = viewMaxColumn;
          }
          const validViewPosition = new Position(viewLineNumber, viewColumn);
          assert.strictEqual(viewPosition.toString(), validViewPosition.toString(), "model->view for " + lineNumber + ", " + column);
        }
      }
      for (let lineNumber = 0; lineNumber <= viewLineCount + 1; lineNumber++) {
        const lineMinColumn = linesCollection.getViewLineMinColumn(lineNumber);
        const lineMaxColumn = linesCollection.getViewLineMaxColumn(lineNumber);
        for (let column = lineMinColumn - 1; column <= lineMaxColumn + 1; column++) {
          const modelPosition = linesCollection.convertViewPositionToModelPosition(lineNumber, column);
          const validModelPosition = model.validatePosition(modelPosition);
          assert.strictEqual(modelPosition.toString(), validModelPosition.toString(), "view->model for " + lineNumber + ", " + column);
        }
      }
    });
  });
});
suite("SplitLinesCollection", () => {
  const _text = [
    "class Nice {",
    "	function hi() {",
    '		console.log("Hello world");',
    "	}",
    "	function hello() {",
    '		console.log("Hello world, this is a somewhat longer line");',
    "	}",
    "}"
  ];
  const _tokens = [
    [
      { startIndex: 0, value: 1 },
      { startIndex: 5, value: 2 },
      { startIndex: 6, value: 3 },
      { startIndex: 10, value: 4 }
    ],
    [
      { startIndex: 0, value: 5 },
      { startIndex: 1, value: 6 },
      { startIndex: 9, value: 7 },
      { startIndex: 10, value: 8 },
      { startIndex: 12, value: 9 }
    ],
    [
      { startIndex: 0, value: 10 },
      { startIndex: 2, value: 11 },
      { startIndex: 9, value: 12 },
      { startIndex: 10, value: 13 },
      { startIndex: 13, value: 14 },
      { startIndex: 14, value: 15 },
      { startIndex: 27, value: 16 }
    ],
    [
      { startIndex: 0, value: 17 }
    ],
    [
      { startIndex: 0, value: 18 },
      { startIndex: 1, value: 19 },
      { startIndex: 9, value: 20 },
      { startIndex: 10, value: 21 },
      { startIndex: 15, value: 22 }
    ],
    [
      { startIndex: 0, value: 23 },
      { startIndex: 2, value: 24 },
      { startIndex: 9, value: 25 },
      { startIndex: 10, value: 26 },
      { startIndex: 13, value: 27 },
      { startIndex: 14, value: 28 },
      { startIndex: 59, value: 29 }
    ],
    [
      { startIndex: 0, value: 30 }
    ],
    [
      { startIndex: 0, value: 31 }
    ]
  ];
  let model;
  let languageRegistration;
  setup(() => {
    let _lineIndex = 0;
    const tokenizationSupport = {
      getInitialState: () => NullState,
      tokenize: void 0,
      tokenizeEncoded: (line, hasEOL, state) => {
        const tokens = _tokens[_lineIndex++];
        const result = new Uint32Array(2 * tokens.length);
        for (let i = 0; i < tokens.length; i++) {
          result[2 * i] = tokens[i].startIndex;
          result[2 * i + 1] = tokens[i].value << MetadataConsts.FOREGROUND_OFFSET;
        }
        return new languages.EncodedTokenizationResult(result, [], state);
      }
    };
    const LANGUAGE_ID = "modelModeTest1";
    languageRegistration = languages.TokenizationRegistry.register(LANGUAGE_ID, tokenizationSupport);
    model = createTextModel(_text.join("\n"), LANGUAGE_ID);
    model.tokenization.forceTokenization(model.getLineCount());
  });
  teardown(() => {
    model.dispose();
    languageRegistration.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function assertViewLineTokens(_actual, expected) {
    const actual = [];
    for (let i = 0, len = _actual.getCount(); i < len; i++) {
      actual[i] = {
        endIndex: _actual.getEndOffset(i),
        value: _actual.getForeground(i)
      };
    }
    assert.deepStrictEqual(actual, expected);
  }
  function assertMinimapLineRenderingData(actual, expected) {
    if (actual === null && expected === null) {
      assert.ok(true);
      return;
    }
    if (expected === null) {
      assert.ok(false);
    }
    assert.strictEqual(actual.content, expected.content);
    assert.strictEqual(actual.minColumn, expected.minColumn);
    assert.strictEqual(actual.maxColumn, expected.maxColumn);
    assertViewLineTokens(actual.tokens, expected.tokens);
  }
  function assertMinimapLinesRenderingData(actual, expected) {
    assert.strictEqual(actual.length, expected.length);
    for (let i = 0; i < expected.length; i++) {
      assertMinimapLineRenderingData(actual[i], expected[i]);
    }
  }
  function assertAllMinimapLinesRenderingData(splitLinesCollection, all) {
    const lineCount = all.length;
    for (let line = 1; line <= lineCount; line++) {
      assert.strictEqual(splitLinesCollection.getViewLineData(line).content, splitLinesCollection.getViewLineContent(line));
    }
    for (let start = 1; start <= lineCount; start++) {
      for (let end = start; end <= lineCount; end++) {
        const count = end - start + 1;
        for (let desired = Math.pow(2, count) - 1; desired >= 0; desired--) {
          const needed = [];
          const expected = [];
          for (let i = 0; i < count; i++) {
            needed[i] = desired & 1 << i ? true : false;
            expected[i] = needed[i] ? all[start - 1 + i] : null;
          }
          const actual = splitLinesCollection.getViewLinesData(start, end, needed);
          assertMinimapLinesRenderingData(actual, expected);
          break;
        }
      }
    }
  }
  test("getViewLinesData - no wrapping", () => {
    withSplitLinesCollection(model, "off", 0, false, (splitLinesCollection) => {
      assert.strictEqual(splitLinesCollection.getViewLineCount(), 8);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(1, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(2, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(3, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(4, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(5, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(6, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(7, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(8, 1), true);
      const _expected = [
        {
          content: "class Nice {",
          minColumn: 1,
          maxColumn: 13,
          tokens: [
            { endIndex: 5, value: 1 },
            { endIndex: 6, value: 2 },
            { endIndex: 10, value: 3 },
            { endIndex: 12, value: 4 }
          ]
        },
        {
          content: "	function hi() {",
          minColumn: 1,
          maxColumn: 17,
          tokens: [
            { endIndex: 1, value: 5 },
            { endIndex: 9, value: 6 },
            { endIndex: 10, value: 7 },
            { endIndex: 12, value: 8 },
            { endIndex: 16, value: 9 }
          ]
        },
        {
          content: '		console.log("Hello world");',
          minColumn: 1,
          maxColumn: 30,
          tokens: [
            { endIndex: 2, value: 10 },
            { endIndex: 9, value: 11 },
            { endIndex: 10, value: 12 },
            { endIndex: 13, value: 13 },
            { endIndex: 14, value: 14 },
            { endIndex: 27, value: 15 },
            { endIndex: 29, value: 16 }
          ]
        },
        {
          content: "	}",
          minColumn: 1,
          maxColumn: 3,
          tokens: [
            { endIndex: 2, value: 17 }
          ]
        },
        {
          content: "	function hello() {",
          minColumn: 1,
          maxColumn: 20,
          tokens: [
            { endIndex: 1, value: 18 },
            { endIndex: 9, value: 19 },
            { endIndex: 10, value: 20 },
            { endIndex: 15, value: 21 },
            { endIndex: 19, value: 22 }
          ]
        },
        {
          content: '		console.log("Hello world, this is a somewhat longer line");',
          minColumn: 1,
          maxColumn: 62,
          tokens: [
            { endIndex: 2, value: 23 },
            { endIndex: 9, value: 24 },
            { endIndex: 10, value: 25 },
            { endIndex: 13, value: 26 },
            { endIndex: 14, value: 27 },
            { endIndex: 59, value: 28 },
            { endIndex: 61, value: 29 }
          ]
        },
        {
          minColumn: 1,
          maxColumn: 3,
          content: "	}",
          tokens: [
            { endIndex: 2, value: 30 }
          ]
        },
        {
          minColumn: 1,
          maxColumn: 2,
          content: "}",
          tokens: [
            { endIndex: 1, value: 31 }
          ]
        }
      ];
      assertAllMinimapLinesRenderingData(splitLinesCollection, [
        _expected[0],
        _expected[1],
        _expected[2],
        _expected[3],
        _expected[4],
        _expected[5],
        _expected[6],
        _expected[7]
      ]);
      splitLinesCollection.setHiddenAreas([new Range(2, 1, 4, 1)]);
      assert.strictEqual(splitLinesCollection.getViewLineCount(), 5);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(1, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(2, 1), false);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(3, 1), false);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(4, 1), false);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(5, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(6, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(7, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(8, 1), true);
      assertAllMinimapLinesRenderingData(splitLinesCollection, [
        _expected[0],
        _expected[4],
        _expected[5],
        _expected[6],
        _expected[7]
      ]);
    });
  });
  test("getViewLinesData - with wrapping", () => {
    withSplitLinesCollection(model, "wordWrapColumn", 30, false, (splitLinesCollection) => {
      assert.strictEqual(splitLinesCollection.getViewLineCount(), 12);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(1, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(2, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(3, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(4, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(5, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(6, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(7, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(8, 1), true);
      const _expected = [
        {
          content: "class Nice {",
          minColumn: 1,
          maxColumn: 13,
          tokens: [
            { endIndex: 5, value: 1 },
            { endIndex: 6, value: 2 },
            { endIndex: 10, value: 3 },
            { endIndex: 12, value: 4 }
          ]
        },
        {
          content: "	function hi() {",
          minColumn: 1,
          maxColumn: 17,
          tokens: [
            { endIndex: 1, value: 5 },
            { endIndex: 9, value: 6 },
            { endIndex: 10, value: 7 },
            { endIndex: 12, value: 8 },
            { endIndex: 16, value: 9 }
          ]
        },
        {
          content: '		console.log("Hello ',
          minColumn: 1,
          maxColumn: 22,
          tokens: [
            { endIndex: 2, value: 10 },
            { endIndex: 9, value: 11 },
            { endIndex: 10, value: 12 },
            { endIndex: 13, value: 13 },
            { endIndex: 14, value: 14 },
            { endIndex: 21, value: 15 }
          ]
        },
        {
          content: '            world");',
          minColumn: 13,
          maxColumn: 21,
          tokens: [
            { endIndex: 18, value: 15 },
            { endIndex: 20, value: 16 }
          ]
        },
        {
          content: "	}",
          minColumn: 1,
          maxColumn: 3,
          tokens: [
            { endIndex: 2, value: 17 }
          ]
        },
        {
          content: "	function hello() {",
          minColumn: 1,
          maxColumn: 20,
          tokens: [
            { endIndex: 1, value: 18 },
            { endIndex: 9, value: 19 },
            { endIndex: 10, value: 20 },
            { endIndex: 15, value: 21 },
            { endIndex: 19, value: 22 }
          ]
        },
        {
          content: '		console.log("Hello ',
          minColumn: 1,
          maxColumn: 22,
          tokens: [
            { endIndex: 2, value: 23 },
            { endIndex: 9, value: 24 },
            { endIndex: 10, value: 25 },
            { endIndex: 13, value: 26 },
            { endIndex: 14, value: 27 },
            { endIndex: 21, value: 28 }
          ]
        },
        {
          content: "            world, this is a ",
          minColumn: 13,
          maxColumn: 30,
          tokens: [
            { endIndex: 29, value: 28 }
          ]
        },
        {
          content: "            somewhat longer ",
          minColumn: 13,
          maxColumn: 29,
          tokens: [
            { endIndex: 28, value: 28 }
          ]
        },
        {
          content: '            line");',
          minColumn: 13,
          maxColumn: 20,
          tokens: [
            { endIndex: 17, value: 28 },
            { endIndex: 19, value: 29 }
          ]
        },
        {
          content: "	}",
          minColumn: 1,
          maxColumn: 3,
          tokens: [
            { endIndex: 2, value: 30 }
          ]
        },
        {
          content: "}",
          minColumn: 1,
          maxColumn: 2,
          tokens: [
            { endIndex: 1, value: 31 }
          ]
        }
      ];
      assertAllMinimapLinesRenderingData(splitLinesCollection, [
        _expected[0],
        _expected[1],
        _expected[2],
        _expected[3],
        _expected[4],
        _expected[5],
        _expected[6],
        _expected[7],
        _expected[8],
        _expected[9],
        _expected[10],
        _expected[11]
      ]);
      splitLinesCollection.setHiddenAreas([new Range(2, 1, 4, 1)]);
      assert.strictEqual(splitLinesCollection.getViewLineCount(), 8);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(1, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(2, 1), false);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(3, 1), false);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(4, 1), false);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(5, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(6, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(7, 1), true);
      assert.strictEqual(splitLinesCollection.modelPositionIsVisible(8, 1), true);
      assertAllMinimapLinesRenderingData(splitLinesCollection, [
        _expected[0],
        _expected[5],
        _expected[6],
        _expected[7],
        _expected[8],
        _expected[9],
        _expected[10],
        _expected[11]
      ]);
    });
  });
  test("getViewLinesData - with wrapping and injected text", () => {
    model.deltaDecorations([], [{
      range: new Range(1, 9, 1, 9),
      options: {
        description: "example",
        after: {
          content: "very very long injected text that causes a line break",
          inlineClassName: "myClassName"
        },
        showIfCollapsed: true
      }
    }]);
    withSplitLinesCollection(model, "wordWrapColumn", 30, false, (splitLinesCollection) => {
      assert.strictEqual(splitLinesCollection.getViewLineCount(), 14);
      assert.strictEqual(splitLinesCollection.getViewLineMaxColumn(1), 24);
      const _expected = [
        {
          content: "class Nivery very long ",
          minColumn: 1,
          maxColumn: 24,
          tokens: [
            { endIndex: 5, value: 1 },
            { endIndex: 6, value: 2 },
            { endIndex: 8, value: 3 },
            { endIndex: 23, value: 1 }
          ]
        },
        {
          content: "    injected text that causes ",
          minColumn: 5,
          maxColumn: 31,
          tokens: [{ endIndex: 30, value: 1 }]
        },
        {
          content: "    a line breakce {",
          minColumn: 5,
          maxColumn: 21,
          tokens: [
            { endIndex: 16, value: 1 },
            { endIndex: 18, value: 3 },
            { endIndex: 20, value: 4 }
          ]
        },
        {
          content: "	function hi() {",
          minColumn: 1,
          maxColumn: 17,
          tokens: [
            { endIndex: 1, value: 5 },
            { endIndex: 9, value: 6 },
            { endIndex: 10, value: 7 },
            { endIndex: 12, value: 8 },
            { endIndex: 16, value: 9 }
          ]
        },
        {
          content: '		console.log("Hello ',
          minColumn: 1,
          maxColumn: 22,
          tokens: [
            { endIndex: 2, value: 10 },
            { endIndex: 9, value: 11 },
            { endIndex: 10, value: 12 },
            { endIndex: 13, value: 13 },
            { endIndex: 14, value: 14 },
            { endIndex: 21, value: 15 }
          ]
        },
        {
          content: '            world");',
          minColumn: 13,
          maxColumn: 21,
          tokens: [
            { endIndex: 18, value: 15 },
            { endIndex: 20, value: 16 }
          ]
        },
        {
          content: "	}",
          minColumn: 1,
          maxColumn: 3,
          tokens: [
            { endIndex: 2, value: 17 }
          ]
        },
        {
          content: "	function hello() {",
          minColumn: 1,
          maxColumn: 20,
          tokens: [
            { endIndex: 1, value: 18 },
            { endIndex: 9, value: 19 },
            { endIndex: 10, value: 20 },
            { endIndex: 15, value: 21 },
            { endIndex: 19, value: 22 }
          ]
        },
        {
          content: '		console.log("Hello ',
          minColumn: 1,
          maxColumn: 22,
          tokens: [
            { endIndex: 2, value: 23 },
            { endIndex: 9, value: 24 },
            { endIndex: 10, value: 25 },
            { endIndex: 13, value: 26 },
            { endIndex: 14, value: 27 },
            { endIndex: 21, value: 28 }
          ]
        },
        {
          content: "            world, this is a ",
          minColumn: 13,
          maxColumn: 30,
          tokens: [
            { endIndex: 29, value: 28 }
          ]
        },
        {
          content: "            somewhat longer ",
          minColumn: 13,
          maxColumn: 29,
          tokens: [
            { endIndex: 28, value: 28 }
          ]
        },
        {
          content: '            line");',
          minColumn: 13,
          maxColumn: 20,
          tokens: [
            { endIndex: 17, value: 28 },
            { endIndex: 19, value: 29 }
          ]
        },
        {
          content: "	}",
          minColumn: 1,
          maxColumn: 3,
          tokens: [
            { endIndex: 2, value: 30 }
          ]
        },
        {
          content: "}",
          minColumn: 1,
          maxColumn: 2,
          tokens: [
            { endIndex: 1, value: 31 }
          ]
        }
      ];
      assertAllMinimapLinesRenderingData(splitLinesCollection, [
        _expected[0],
        _expected[1],
        _expected[2],
        _expected[3],
        _expected[4],
        _expected[5],
        _expected[6],
        _expected[7],
        _expected[8],
        _expected[9],
        _expected[10],
        _expected[11]
      ]);
      const data = splitLinesCollection.getViewLinesData(1, 14, new Array(14).fill(true));
      assert.deepStrictEqual(
        data.map((d) => ({
          inlineDecorations: d.inlineDecorations?.map((d2) => ({
            startOffset: d2.range.startColumn - 1,
            endOffset: d2.range.endColumn - 1
          }))
        })),
        [
          { inlineDecorations: [{ startOffset: 8, endOffset: 23 }] },
          { inlineDecorations: [{ startOffset: 4, endOffset: 30 }] },
          { inlineDecorations: [{ startOffset: 4, endOffset: 16 }] },
          { inlineDecorations: void 0 },
          { inlineDecorations: void 0 },
          { inlineDecorations: void 0 },
          { inlineDecorations: void 0 },
          { inlineDecorations: void 0 },
          { inlineDecorations: void 0 },
          { inlineDecorations: void 0 },
          { inlineDecorations: void 0 },
          { inlineDecorations: void 0 },
          { inlineDecorations: void 0 },
          { inlineDecorations: void 0 }
        ]
      );
    });
  });
  function withSplitLinesCollection(model2, wordWrap, wordWrapColumn, wrapOnEscapedLineFeeds, callback) {
    const configuration = new TestConfiguration({
      wordWrap,
      wordWrapColumn,
      wrappingIndent: "indent"
    });
    const wrappingInfo = configuration.options.get(EditorOption.wrappingInfo);
    const fontInfo = configuration.options.get(EditorOption.fontInfo);
    const wordWrapBreakAfterCharacters = configuration.options.get(EditorOption.wordWrapBreakAfterCharacters);
    const wordWrapBreakBeforeCharacters = configuration.options.get(EditorOption.wordWrapBreakBeforeCharacters);
    const wrappingIndent = configuration.options.get(EditorOption.wrappingIndent);
    const wordBreak = configuration.options.get(EditorOption.wordBreak);
    const lineBreaksComputerFactory = new MonospaceLineBreaksComputerFactory(wordWrapBreakBeforeCharacters, wordWrapBreakAfterCharacters);
    const linesCollection = new ViewModelLinesFromProjectedModel(
      1,
      model2,
      lineBreaksComputerFactory,
      lineBreaksComputerFactory,
      fontInfo,
      model2.getOptions().tabSize,
      "simple",
      wrappingInfo.wrappingColumn,
      wrappingIndent,
      wordBreak,
      wrapOnEscapedLineFeeds
    );
    callback(linesCollection);
    configuration.dispose();
  }
});
function pos(lineNumber, column) {
  return new Position(lineNumber, column);
}
function createSplitLine(splitLengths, breakingOffsetsVisibleColumn, wrappedTextIndentWidth, isVisible = true) {
  return createModelLineProjection(createLineBreakData(splitLengths, breakingOffsetsVisibleColumn, wrappedTextIndentWidth), isVisible);
}
function createLineBreakData(breakingLengths, breakingOffsetsVisibleColumn, wrappedTextIndentWidth) {
  const sums = [];
  for (let i = 0; i < breakingLengths.length; i++) {
    sums[i] = (i > 0 ? sums[i - 1] : 0) + breakingLengths[i];
  }
  return new ModelLineProjectionData(null, null, sums, breakingOffsetsVisibleColumn, wrappedTextIndentWidth);
}
function createModel(text) {
  return {
    tokenization: {
      getLineTokens: (lineNumber) => {
        return null;
      }
    },
    getLineContent: (lineNumber) => {
      return text;
    },
    getLineLength: (lineNumber) => {
      return text.length;
    },
    getLineMinColumn: (lineNumber) => {
      return 1;
    },
    getLineMaxColumn: (lineNumber) => {
      return text.length + 1;
    },
    getValueInRange: (range, eol) => {
      return text.substring(range.startColumn - 1, range.endColumn - 1);
    }
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGJyb3dzZXJcXHZpZXdNb2RlbFxcbW9kZWxMaW5lUHJvamVjdGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgTWV0YWRhdGFDb25zdHMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZW5jb2RlZFRva2VuQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgKiBhcyBsYW5ndWFnZXMgZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBOdWxsU3RhdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL251bGxUb2tlbml6ZS5qcyc7XG5pbXBvcnQgeyBFbmRPZkxpbmVQcmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgTW9kZWxMaW5lUHJvamVjdGlvbkRhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWxMaW5lUHJvamVjdGlvbkRhdGEuanMnO1xuaW1wb3J0IHsgSVZpZXdMaW5lVG9rZW5zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rva2Vucy9saW5lVG9rZW5zLmpzJztcbmltcG9ydCB7IFZpZXdMaW5lRGF0YSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgSU1vZGVsTGluZVByb2plY3Rpb24sIElTaW1wbGVNb2RlbCwgY3JlYXRlTW9kZWxMaW5lUHJvamVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvbW9kZWxMaW5lUHJvamVjdGlvbi5qcyc7XG5pbXBvcnQgeyBNb25vc3BhY2VMaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC9tb25vc3BhY2VMaW5lQnJlYWtzQ29tcHV0ZXIuanMnO1xuaW1wb3J0IHsgVmlld01vZGVsTGluZXNGcm9tUHJvamVjdGVkTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsL3ZpZXdNb2RlbExpbmVzLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vY29uZmlnL3Rlc3RDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcblxuc3VpdGUoJ0VkaXRvciBWaWV3TW9kZWwgLSBTcGxpdExpbmVzQ29sbGVjdGlvbicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdTcGxpdExpbmUnLCAoKSA9PiB7XG5cdFx0bGV0IG1vZGVsMSA9IGNyZWF0ZU1vZGVsKCdNeSBGaXJzdCBMaW5lTXkgU2Vjb25kIExpbmVBbmQgYW5vdGhlciBvbmUnKTtcblx0XHRsZXQgbGluZTEgPSBjcmVhdGVTcGxpdExpbmUoWzEzLCAxNCwgMTVdLCBbMTMsIDEzICsgMTQsIDEzICsgMTQgKyAxNV0sIDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUxLmdldFZpZXdMaW5lQ291bnQoKSwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUxLmdldFZpZXdMaW5lQ29udGVudChtb2RlbDEsIDEsIDApLCAnTXkgRmlyc3QgTGluZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lMS5nZXRWaWV3TGluZUNvbnRlbnQobW9kZWwxLCAxLCAxKSwgJ015IFNlY29uZCBMaW5lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUxLmdldFZpZXdMaW5lQ29udGVudChtb2RlbDEsIDEsIDIpLCAnQW5kIGFub3RoZXIgb25lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUxLmdldFZpZXdMaW5lTWF4Q29sdW1uKG1vZGVsMSwgMSwgMCksIDE0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZTEuZ2V0Vmlld0xpbmVNYXhDb2x1bW4obW9kZWwxLCAxLCAxKSwgMTUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lMS5nZXRWaWV3TGluZU1heENvbHVtbihtb2RlbDEsIDEsIDIpLCAxNik7XG5cdFx0Zm9yIChsZXQgY29sID0gMTsgY29sIDw9IDE0OyBjb2wrKykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUxLmdldE1vZGVsQ29sdW1uT2ZWaWV3UG9zaXRpb24oMCwgY29sKSwgY29sLCAnZ2V0SW5wdXRDb2x1bW5PZk91dHB1dFBvc2l0aW9uKDAsICcgKyBjb2wgKyAnKScpO1xuXHRcdH1cblx0XHRmb3IgKGxldCBjb2wgPSAxOyBjb2wgPD0gMTU7IGNvbCsrKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZTEuZ2V0TW9kZWxDb2x1bW5PZlZpZXdQb3NpdGlvbigxLCBjb2wpLCAxMyArIGNvbCwgJ2dldElucHV0Q29sdW1uT2ZPdXRwdXRQb3NpdGlvbigxLCAnICsgY29sICsgJyknKTtcblx0XHR9XG5cdFx0Zm9yIChsZXQgY29sID0gMTsgY29sIDw9IDE2OyBjb2wrKykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUxLmdldE1vZGVsQ29sdW1uT2ZWaWV3UG9zaXRpb24oMiwgY29sKSwgMTMgKyAxNCArIGNvbCwgJ2dldElucHV0Q29sdW1uT2ZPdXRwdXRQb3NpdGlvbigyLCAnICsgY29sICsgJyknKTtcblx0XHR9XG5cdFx0Zm9yIChsZXQgY29sID0gMTsgY29sIDw9IDEzOyBjb2wrKykge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaW5lMS5nZXRWaWV3UG9zaXRpb25PZk1vZGVsUG9zaXRpb24oMCwgY29sKSwgcG9zKDAsIGNvbCksICdnZXRPdXRwdXRQb3NpdGlvbk9mSW5wdXRQb3NpdGlvbignICsgY29sICsgJyknKTtcblx0XHR9XG5cdFx0Zm9yIChsZXQgY29sID0gMSArIDEzOyBjb2wgPD0gMTQgKyAxMzsgY29sKyspIHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGluZTEuZ2V0Vmlld1Bvc2l0aW9uT2ZNb2RlbFBvc2l0aW9uKDAsIGNvbCksIHBvcygxLCBjb2wgLSAxMyksICdnZXRPdXRwdXRQb3NpdGlvbk9mSW5wdXRQb3NpdGlvbignICsgY29sICsgJyknKTtcblx0XHR9XG5cdFx0Zm9yIChsZXQgY29sID0gMSArIDEzICsgMTQ7IGNvbCA8PSAxNSArIDE0ICsgMTM7IGNvbCsrKSB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpbmUxLmdldFZpZXdQb3NpdGlvbk9mTW9kZWxQb3NpdGlvbigwLCBjb2wpLCBwb3MoMiwgY29sIC0gMTMgLSAxNCksICdnZXRPdXRwdXRQb3NpdGlvbk9mSW5wdXRQb3NpdGlvbignICsgY29sICsgJyknKTtcblx0XHR9XG5cblx0XHRtb2RlbDEgPSBjcmVhdGVNb2RlbCgnTXkgRmlyc3QgTGluZU15IFNlY29uZCBMaW5lQW5kIGFub3RoZXIgb25lJyk7XG5cdFx0bGluZTEgPSBjcmVhdGVTcGxpdExpbmUoWzEzLCAxNCwgMTVdLCBbMTMsIDEzICsgMTQsIDEzICsgMTQgKyAxNV0sIDQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUxLmdldFZpZXdMaW5lQ291bnQoKSwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUxLmdldFZpZXdMaW5lQ29udGVudChtb2RlbDEsIDEsIDApLCAnTXkgRmlyc3QgTGluZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lMS5nZXRWaWV3TGluZUNvbnRlbnQobW9kZWwxLCAxLCAxKSwgJyAgICBNeSBTZWNvbmQgTGluZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lMS5nZXRWaWV3TGluZUNvbnRlbnQobW9kZWwxLCAxLCAyKSwgJyAgICBBbmQgYW5vdGhlciBvbmUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZTEuZ2V0Vmlld0xpbmVNYXhDb2x1bW4obW9kZWwxLCAxLCAwKSwgMTQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lMS5nZXRWaWV3TGluZU1heENvbHVtbihtb2RlbDEsIDEsIDEpLCAxOSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmUxLmdldFZpZXdMaW5lTWF4Q29sdW1uKG1vZGVsMSwgMSwgMiksIDIwKTtcblxuXHRcdGNvbnN0IGFjdHVhbFZpZXdDb2x1bW5NYXBwaW5nOiBudW1iZXJbXVtdID0gW107XG5cdFx0Zm9yIChsZXQgbGluZUluZGV4ID0gMDsgbGluZUluZGV4IDwgbGluZTEuZ2V0Vmlld0xpbmVDb3VudCgpOyBsaW5lSW5kZXgrKykge1xuXHRcdFx0Y29uc3QgYWN0dWFsTGluZVZpZXdDb2x1bW5NYXBwaW5nOiBudW1iZXJbXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgY29sID0gMTsgY29sIDw9IGxpbmUxLmdldFZpZXdMaW5lTWF4Q29sdW1uKG1vZGVsMSwgMSwgbGluZUluZGV4KTsgY29sKyspIHtcblx0XHRcdFx0YWN0dWFsTGluZVZpZXdDb2x1bW5NYXBwaW5nLnB1c2gobGluZTEuZ2V0TW9kZWxDb2x1bW5PZlZpZXdQb3NpdGlvbihsaW5lSW5kZXgsIGNvbCkpO1xuXHRcdFx0fVxuXHRcdFx0YWN0dWFsVmlld0NvbHVtbk1hcHBpbmcucHVzaChhY3R1YWxMaW5lVmlld0NvbHVtbk1hcHBpbmcpO1xuXHRcdH1cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbFZpZXdDb2x1bW5NYXBwaW5nLCBbXG5cdFx0XHRbMSwgMiwgMywgNCwgNSwgNiwgNywgOCwgOSwgMTAsIDExLCAxMiwgMTMsIDE0XSxcblx0XHRcdFsxNCwgMTQsIDE0LCAxNCwgMTQsIDE1LCAxNiwgMTcsIDE4LCAxOSwgMjAsIDIxLCAyMiwgMjMsIDI0LCAyNSwgMjYsIDI3LCAyOF0sXG5cdFx0XHRbMjgsIDI4LCAyOCwgMjgsIDI4LCAyOSwgMzAsIDMxLCAzMiwgMzMsIDM0LCAzNSwgMzYsIDM3LCAzOCwgMzksIDQwLCA0MSwgNDIsIDQzXSxcblx0XHRdKTtcblxuXHRcdGZvciAobGV0IGNvbCA9IDE7IGNvbCA8PSAxMzsgY29sKyspIHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGluZTEuZ2V0Vmlld1Bvc2l0aW9uT2ZNb2RlbFBvc2l0aW9uKDAsIGNvbCksIHBvcygwLCBjb2wpLCAnNi5nZXRPdXRwdXRQb3NpdGlvbk9mSW5wdXRQb3NpdGlvbignICsgY29sICsgJyknKTtcblx0XHR9XG5cdFx0Zm9yIChsZXQgY29sID0gMSArIDEzOyBjb2wgPD0gMTQgKyAxMzsgY29sKyspIHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGluZTEuZ2V0Vmlld1Bvc2l0aW9uT2ZNb2RlbFBvc2l0aW9uKDAsIGNvbCksIHBvcygxLCA0ICsgY29sIC0gMTMpLCAnNy5nZXRPdXRwdXRQb3NpdGlvbk9mSW5wdXRQb3NpdGlvbignICsgY29sICsgJyknKTtcblx0XHR9XG5cdFx0Zm9yIChsZXQgY29sID0gMSArIDEzICsgMTQ7IGNvbCA8PSAxNSArIDE0ICsgMTM7IGNvbCsrKSB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpbmUxLmdldFZpZXdQb3NpdGlvbk9mTW9kZWxQb3NpdGlvbigwLCBjb2wpLCBwb3MoMiwgNCArIGNvbCAtIDEzIC0gMTQpLCAnOC5nZXRPdXRwdXRQb3NpdGlvbk9mSW5wdXRQb3NpdGlvbignICsgY29sICsgJyknKTtcblx0XHR9XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHdpdGhTcGxpdExpbmVzQ29sbGVjdGlvbih0ZXh0OiBzdHJpbmcsIGNhbGxiYWNrOiAobW9kZWw6IFRleHRNb2RlbCwgbGluZXNDb2xsZWN0aW9uOiBWaWV3TW9kZWxMaW5lc0Zyb21Qcm9qZWN0ZWRNb2RlbCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbmZpZyA9IG5ldyBUZXN0Q29uZmlndXJhdGlvbih7fSk7XG5cdFx0Y29uc3Qgd3JhcHBpbmdJbmZvID0gY29uZmlnLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi53cmFwcGluZ0luZm8pO1xuXHRcdGNvbnN0IGZvbnRJbmZvID0gY29uZmlnLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb250SW5mbyk7XG5cdFx0Y29uc3Qgd29yZFdyYXBCcmVha0FmdGVyQ2hhcmFjdGVycyA9IGNvbmZpZy5vcHRpb25zLmdldChFZGl0b3JPcHRpb24ud29yZFdyYXBCcmVha0FmdGVyQ2hhcmFjdGVycyk7XG5cdFx0Y29uc3Qgd29yZFdyYXBCcmVha0JlZm9yZUNoYXJhY3RlcnMgPSBjb25maWcub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLndvcmRXcmFwQnJlYWtCZWZvcmVDaGFyYWN0ZXJzKTtcblx0XHRjb25zdCB3cmFwcGluZ0luZGVudCA9IGNvbmZpZy5vcHRpb25zLmdldChFZGl0b3JPcHRpb24ud3JhcHBpbmdJbmRlbnQpO1xuXHRcdGNvbnN0IHdvcmRCcmVhayA9IGNvbmZpZy5vcHRpb25zLmdldChFZGl0b3JPcHRpb24ud29yZEJyZWFrKTtcblx0XHRjb25zdCB3cmFwT25Fc2NhcGVkTGluZUZlZWRzID0gY29uZmlnLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi53cmFwT25Fc2NhcGVkTGluZUZlZWRzKTtcblx0XHRjb25zdCBsaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5ID0gbmV3IE1vbm9zcGFjZUxpbmVCcmVha3NDb21wdXRlckZhY3Rvcnkod29yZFdyYXBCcmVha0JlZm9yZUNoYXJhY3RlcnMsIHdvcmRXcmFwQnJlYWtBZnRlckNoYXJhY3RlcnMpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwodGV4dCk7XG5cblx0XHRjb25zdCBsaW5lc0NvbGxlY3Rpb24gPSBuZXcgVmlld01vZGVsTGluZXNGcm9tUHJvamVjdGVkTW9kZWwoXG5cdFx0XHQxLFxuXHRcdFx0bW9kZWwsXG5cdFx0XHRsaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5LFxuXHRcdFx0bGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeSxcblx0XHRcdGZvbnRJbmZvLFxuXHRcdFx0bW9kZWwuZ2V0T3B0aW9ucygpLnRhYlNpemUsXG5cdFx0XHQnc2ltcGxlJyxcblx0XHRcdHdyYXBwaW5nSW5mby53cmFwcGluZ0NvbHVtbixcblx0XHRcdHdyYXBwaW5nSW5kZW50LFxuXHRcdFx0d29yZEJyZWFrLFxuXHRcdFx0d3JhcE9uRXNjYXBlZExpbmVGZWVkc1xuXHRcdCk7XG5cblx0XHRjYWxsYmFjayhtb2RlbCwgbGluZXNDb2xsZWN0aW9uKTtcblxuXHRcdGxpbmVzQ29sbGVjdGlvbi5kaXNwb3NlKCk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdGNvbmZpZy5kaXNwb3NlKCk7XG5cdH1cblxuXHR0ZXN0KCdJbnZhbGlkIGxpbmUgbnVtYmVycycsICgpID0+IHtcblxuXHRcdGNvbnN0IHRleHQgPSBbXG5cdFx0XHQnaW50IG1haW4oKSB7Jyxcblx0XHRcdCdcXHRwcmludGYoXCJIZWxsbyB3b3JsZCFcIik7Jyxcblx0XHRcdCd9Jyxcblx0XHRcdCdpbnQgbWFpbigpIHsnLFxuXHRcdFx0J1xcdHByaW50ZihcIkhlbGxvIHdvcmxkIVwiKTsnLFxuXHRcdFx0J30nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHR3aXRoU3BsaXRMaW5lc0NvbGxlY3Rpb24odGV4dCwgKG1vZGVsLCBsaW5lc0NvbGxlY3Rpb24pID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVDb3VudCgpLCA2KTtcblxuXHRcdFx0Ly8gZ2V0T3V0cHV0SW5kZW50R3VpZGVcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lc0luZGVudEd1aWRlcygtMSwgLTEpLCBbMF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVzSW5kZW50R3VpZGVzKDAsIDApLCBbMF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVzSW5kZW50R3VpZGVzKDEsIDEpLCBbMF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVzSW5kZW50R3VpZGVzKDIsIDIpLCBbMV0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVzSW5kZW50R3VpZGVzKDMsIDMpLCBbMF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVzSW5kZW50R3VpZGVzKDQsIDQpLCBbMF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVzSW5kZW50R3VpZGVzKDUsIDUpLCBbMV0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVzSW5kZW50R3VpZGVzKDYsIDYpLCBbMF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVzSW5kZW50R3VpZGVzKDcsIDcpLCBbMF0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZXNJbmRlbnRHdWlkZXMoMCwgNyksIFswLCAxLCAwLCAwLCAxLCAwXSk7XG5cblx0XHRcdC8vIGdldE91dHB1dExpbmVDb250ZW50XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lQ29udGVudCgtMSksICdpbnQgbWFpbigpIHsnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVDb250ZW50KDApLCAnaW50IG1haW4oKSB7Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lQ29udGVudCgxKSwgJ2ludCBtYWluKCkgeycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZUNvbnRlbnQoMiksICdcXHRwcmludGYoXCJIZWxsbyB3b3JsZCFcIik7Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lQ29udGVudCgzKSwgJ30nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVDb250ZW50KDQpLCAnaW50IG1haW4oKSB7Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lQ29udGVudCg1KSwgJ1xcdHByaW50ZihcIkhlbGxvIHdvcmxkIVwiKTsnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVDb250ZW50KDYpLCAnfScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZUNvbnRlbnQoNyksICd9Jyk7XG5cblx0XHRcdC8vIGdldE91dHB1dExpbmVNaW5Db2x1bW5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVNaW5Db2x1bW4oLTEpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVNaW5Db2x1bW4oMCksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZU1pbkNvbHVtbigxKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lTWluQ29sdW1uKDIpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVNaW5Db2x1bW4oMyksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZU1pbkNvbHVtbig0KSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lTWluQ29sdW1uKDUpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVNaW5Db2x1bW4oNiksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZU1pbkNvbHVtbig3KSwgMSk7XG5cblx0XHRcdC8vIGdldE91dHB1dExpbmVNYXhDb2x1bW5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVNYXhDb2x1bW4oLTEpLCAxMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lTWF4Q29sdW1uKDApLCAxMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lTWF4Q29sdW1uKDEpLCAxMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lTWF4Q29sdW1uKDIpLCAyNSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lTWF4Q29sdW1uKDMpLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVNYXhDb2x1bW4oNCksIDEzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVNYXhDb2x1bW4oNSksIDI1KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVNYXhDb2x1bW4oNiksIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZU1heENvbHVtbig3KSwgMik7XG5cblx0XHRcdC8vIGNvbnZlcnRPdXRwdXRQb3NpdGlvblRvSW5wdXRQb3NpdGlvblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbigtMSwgMSksIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKDAsIDEpLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbigxLCAxKSwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmNvbnZlcnRWaWV3UG9zaXRpb25Ub01vZGVsUG9zaXRpb24oMiwgMSksIG5ldyBQb3NpdGlvbigyLCAxKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKDMsIDEpLCBuZXcgUG9zaXRpb24oMywgMSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbig0LCAxKSwgbmV3IFBvc2l0aW9uKDQsIDEpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmNvbnZlcnRWaWV3UG9zaXRpb25Ub01vZGVsUG9zaXRpb24oNSwgMSksIG5ldyBQb3NpdGlvbig1LCAxKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpbmVzQ29sbGVjdGlvbi5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKDYsIDEpLCBuZXcgUG9zaXRpb24oNiwgMSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaW5lc0NvbGxlY3Rpb24uY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbig3LCAxKSwgbmV3IFBvc2l0aW9uKDYsIDEpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGluZXNDb2xsZWN0aW9uLmNvbnZlcnRWaWV3UG9zaXRpb25Ub01vZGVsUG9zaXRpb24oOCwgMSksIG5ldyBQb3NpdGlvbig2LCAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMzNjYyJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgdGV4dCA9IFtcblx0XHRcdCdpbnQgbWFpbigpIHsnLFxuXHRcdFx0J1xcdHByaW50ZihcIkhlbGxvIHdvcmxkIVwiKTsnLFxuXHRcdFx0J30nLFxuXHRcdFx0J2ludCBtYWluKCkgeycsXG5cdFx0XHQnXFx0cHJpbnRmKFwiSGVsbG8gd29ybGQhXCIpOycsXG5cdFx0XHQnfScsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdHdpdGhTcGxpdExpbmVzQ29sbGVjdGlvbih0ZXh0LCAobW9kZWwsIGxpbmVzQ29sbGVjdGlvbikgPT4ge1xuXHRcdFx0bGluZXNDb2xsZWN0aW9uLnNldEhpZGRlbkFyZWFzKFtcblx0XHRcdFx0bmV3IFJhbmdlKDEsIDEsIDMsIDEpLFxuXHRcdFx0XHRuZXcgUmFuZ2UoNSwgMSwgNiwgMSlcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCB2aWV3TGluZUNvdW50ID0gbGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lQ291bnQoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TGluZUNvdW50LCAxLCAnZ2V0T3V0cHV0TGluZUNvdW50KCknKTtcblxuXHRcdFx0Y29uc3QgbW9kZWxMaW5lQ291bnQgPSBtb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSAwOyBsaW5lTnVtYmVyIDw9IG1vZGVsTGluZUNvdW50ICsgMTsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVNaW5Db2x1bW4gPSAobGluZU51bWJlciA+PSAxICYmIGxpbmVOdW1iZXIgPD0gbW9kZWxMaW5lQ291bnQpID8gbW9kZWwuZ2V0TGluZU1pbkNvbHVtbihsaW5lTnVtYmVyKSA6IDE7XG5cdFx0XHRcdGNvbnN0IGxpbmVNYXhDb2x1bW4gPSAobGluZU51bWJlciA+PSAxICYmIGxpbmVOdW1iZXIgPD0gbW9kZWxMaW5lQ291bnQpID8gbW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKSA6IDE7XG5cdFx0XHRcdGZvciAobGV0IGNvbHVtbiA9IGxpbmVNaW5Db2x1bW4gLSAxOyBjb2x1bW4gPD0gbGluZU1heENvbHVtbiArIDE7IGNvbHVtbisrKSB7XG5cdFx0XHRcdFx0Y29uc3Qgdmlld1Bvc2l0aW9uID0gbGluZXNDb2xsZWN0aW9uLmNvbnZlcnRNb2RlbFBvc2l0aW9uVG9WaWV3UG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKTtcblxuXHRcdFx0XHRcdC8vIHZhbGlkYXRlIHZpZXcgcG9zaXRpb25cblx0XHRcdFx0XHRsZXQgdmlld0xpbmVOdW1iZXIgPSB2aWV3UG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRcdFx0XHRsZXQgdmlld0NvbHVtbiA9IHZpZXdQb3NpdGlvbi5jb2x1bW47XG5cdFx0XHRcdFx0aWYgKHZpZXdMaW5lTnVtYmVyIDwgMSkge1xuXHRcdFx0XHRcdFx0dmlld0xpbmVOdW1iZXIgPSAxO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBsaW5lQ291bnQgPSBsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVDb3VudCgpO1xuXHRcdFx0XHRcdGlmICh2aWV3TGluZU51bWJlciA+IGxpbmVDb3VudCkge1xuXHRcdFx0XHRcdFx0dmlld0xpbmVOdW1iZXIgPSBsaW5lQ291bnQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHZpZXdNaW5Db2x1bW4gPSBsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVNaW5Db2x1bW4odmlld0xpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdGNvbnN0IHZpZXdNYXhDb2x1bW4gPSBsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVNYXhDb2x1bW4odmlld0xpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdGlmICh2aWV3Q29sdW1uIDwgdmlld01pbkNvbHVtbikge1xuXHRcdFx0XHRcdFx0dmlld0NvbHVtbiA9IHZpZXdNaW5Db2x1bW47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmICh2aWV3Q29sdW1uID4gdmlld01heENvbHVtbikge1xuXHRcdFx0XHRcdFx0dmlld0NvbHVtbiA9IHZpZXdNYXhDb2x1bW47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHZhbGlkVmlld1Bvc2l0aW9uID0gbmV3IFBvc2l0aW9uKHZpZXdMaW5lTnVtYmVyLCB2aWV3Q29sdW1uKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld1Bvc2l0aW9uLnRvU3RyaW5nKCksIHZhbGlkVmlld1Bvc2l0aW9uLnRvU3RyaW5nKCksICdtb2RlbC0+dmlldyBmb3IgJyArIGxpbmVOdW1iZXIgKyAnLCAnICsgY29sdW1uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gMDsgbGluZU51bWJlciA8PSB2aWV3TGluZUNvdW50ICsgMTsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVNaW5Db2x1bW4gPSBsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVNaW5Db2x1bW4obGluZU51bWJlcik7XG5cdFx0XHRcdGNvbnN0IGxpbmVNYXhDb2x1bW4gPSBsaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVNYXhDb2x1bW4obGluZU51bWJlcik7XG5cdFx0XHRcdGZvciAobGV0IGNvbHVtbiA9IGxpbmVNaW5Db2x1bW4gLSAxOyBjb2x1bW4gPD0gbGluZU1heENvbHVtbiArIDE7IGNvbHVtbisrKSB7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWxQb3NpdGlvbiA9IGxpbmVzQ29sbGVjdGlvbi5jb252ZXJ0Vmlld1Bvc2l0aW9uVG9Nb2RlbFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbik7XG5cdFx0XHRcdFx0Y29uc3QgdmFsaWRNb2RlbFBvc2l0aW9uID0gbW9kZWwudmFsaWRhdGVQb3NpdGlvbihtb2RlbFBvc2l0aW9uKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWxQb3NpdGlvbi50b1N0cmluZygpLCB2YWxpZE1vZGVsUG9zaXRpb24udG9TdHJpbmcoKSwgJ3ZpZXctPm1vZGVsIGZvciAnICsgbGluZU51bWJlciArICcsICcgKyBjb2x1bW4pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG59KTtcblxuc3VpdGUoJ1NwbGl0TGluZXNDb2xsZWN0aW9uJywgKCkgPT4ge1xuXG5cdGNvbnN0IF90ZXh0ID0gW1xuXHRcdCdjbGFzcyBOaWNlIHsnLFxuXHRcdCdcdGZ1bmN0aW9uIGhpKCkgeycsXG5cdFx0J1x0XHRjb25zb2xlLmxvZyhcIkhlbGxvIHdvcmxkXCIpOycsXG5cdFx0J1x0fScsXG5cdFx0J1x0ZnVuY3Rpb24gaGVsbG8oKSB7Jyxcblx0XHQnXHRcdGNvbnNvbGUubG9nKFwiSGVsbG8gd29ybGQsIHRoaXMgaXMgYSBzb21ld2hhdCBsb25nZXIgbGluZVwiKTsnLFxuXHRcdCdcdH0nLFxuXHRcdCd9Jyxcblx0XTtcblxuXHRjb25zdCBfdG9rZW5zID0gW1xuXHRcdFtcblx0XHRcdHsgc3RhcnRJbmRleDogMCwgdmFsdWU6IDEgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogNSwgdmFsdWU6IDIgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogNiwgdmFsdWU6IDMgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogMTAsIHZhbHVlOiA0IH0sXG5cdFx0XSxcblx0XHRbXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDAsIHZhbHVlOiA1IH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDEsIHZhbHVlOiA2IH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDksIHZhbHVlOiA3IH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDEwLCB2YWx1ZTogOCB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiAxMiwgdmFsdWU6IDkgfSxcblx0XHRdLFxuXHRcdFtcblx0XHRcdHsgc3RhcnRJbmRleDogMCwgdmFsdWU6IDEwIH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDIsIHZhbHVlOiAxMSB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiA5LCB2YWx1ZTogMTIgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogMTAsIHZhbHVlOiAxMyB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiAxMywgdmFsdWU6IDE0IH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDE0LCB2YWx1ZTogMTUgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogMjcsIHZhbHVlOiAxNiB9LFxuXHRcdF0sXG5cdFx0W1xuXHRcdFx0eyBzdGFydEluZGV4OiAwLCB2YWx1ZTogMTcgfSxcblx0XHRdLFxuXHRcdFtcblx0XHRcdHsgc3RhcnRJbmRleDogMCwgdmFsdWU6IDE4IH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDEsIHZhbHVlOiAxOSB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiA5LCB2YWx1ZTogMjAgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogMTAsIHZhbHVlOiAyMSB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiAxNSwgdmFsdWU6IDIyIH0sXG5cdFx0XSxcblx0XHRbXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDAsIHZhbHVlOiAyMyB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiAyLCB2YWx1ZTogMjQgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogOSwgdmFsdWU6IDI1IH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDEwLCB2YWx1ZTogMjYgfSxcblx0XHRcdHsgc3RhcnRJbmRleDogMTMsIHZhbHVlOiAyNyB9LFxuXHRcdFx0eyBzdGFydEluZGV4OiAxNCwgdmFsdWU6IDI4IH0sXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDU5LCB2YWx1ZTogMjkgfSxcblx0XHRdLFxuXHRcdFtcblx0XHRcdHsgc3RhcnRJbmRleDogMCwgdmFsdWU6IDMwIH0sXG5cdFx0XSxcblx0XHRbXG5cdFx0XHR7IHN0YXJ0SW5kZXg6IDAsIHZhbHVlOiAzMSB9LFxuXHRcdF1cblx0XTtcblxuXHRsZXQgbW9kZWw6IFRleHRNb2RlbDtcblx0bGV0IGxhbmd1YWdlUmVnaXN0cmF0aW9uOiBJRGlzcG9zYWJsZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0bGV0IF9saW5lSW5kZXggPSAwO1xuXHRcdGNvbnN0IHRva2VuaXphdGlvblN1cHBvcnQ6IGxhbmd1YWdlcy5JVG9rZW5pemF0aW9uU3VwcG9ydCA9IHtcblx0XHRcdGdldEluaXRpYWxTdGF0ZTogKCkgPT4gTnVsbFN0YXRlLFxuXHRcdFx0dG9rZW5pemU6IHVuZGVmaW5lZCEsXG5cdFx0XHR0b2tlbml6ZUVuY29kZWQ6IChsaW5lOiBzdHJpbmcsIGhhc0VPTDogYm9vbGVhbiwgc3RhdGU6IGxhbmd1YWdlcy5JU3RhdGUpOiBsYW5ndWFnZXMuRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdCA9PiB7XG5cdFx0XHRcdGNvbnN0IHRva2VucyA9IF90b2tlbnNbX2xpbmVJbmRleCsrXTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBuZXcgVWludDMyQXJyYXkoMiAqIHRva2Vucy5sZW5ndGgpO1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdHJlc3VsdFsyICogaV0gPSB0b2tlbnNbaV0uc3RhcnRJbmRleDtcblx0XHRcdFx0XHRyZXN1bHRbMiAqIGkgKyAxXSA9IChcblx0XHRcdFx0XHRcdHRva2Vuc1tpXS52YWx1ZSA8PCBNZXRhZGF0YUNvbnN0cy5GT1JFR1JPVU5EX09GRlNFVFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG5ldyBsYW5ndWFnZXMuRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdChyZXN1bHQsIFtdLCBzdGF0ZSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBMQU5HVUFHRV9JRCA9ICdtb2RlbE1vZGVUZXN0MSc7XG5cdFx0bGFuZ3VhZ2VSZWdpc3RyYXRpb24gPSBsYW5ndWFnZXMuVG9rZW5pemF0aW9uUmVnaXN0cnkucmVnaXN0ZXIoTEFOR1VBR0VfSUQsIHRva2VuaXphdGlvblN1cHBvcnQpO1xuXHRcdG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKF90ZXh0LmpvaW4oJ1xcbicpLCBMQU5HVUFHRV9JRCk7XG5cdFx0Ly8gZm9yY2UgdG9rZW5pemF0aW9uXG5cdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKG1vZGVsLmdldExpbmVDb3VudCgpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0XHRsYW5ndWFnZVJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGludGVyZmFjZSBJVGVzdFZpZXdMaW5lVG9rZW4ge1xuXHRcdGVuZEluZGV4OiBudW1iZXI7XG5cdFx0dmFsdWU6IG51bWJlcjtcblx0fVxuXG5cdGZ1bmN0aW9uIGFzc2VydFZpZXdMaW5lVG9rZW5zKF9hY3R1YWw6IElWaWV3TGluZVRva2VucywgZXhwZWN0ZWQ6IElUZXN0Vmlld0xpbmVUb2tlbltdKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0dWFsOiBJVGVzdFZpZXdMaW5lVG9rZW5bXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBfYWN0dWFsLmdldENvdW50KCk7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0YWN0dWFsW2ldID0ge1xuXHRcdFx0XHRlbmRJbmRleDogX2FjdHVhbC5nZXRFbmRPZmZzZXQoaSksXG5cdFx0XHRcdHZhbHVlOiBfYWN0dWFsLmdldEZvcmVncm91bmQoaSlcblx0XHRcdH07XG5cdFx0fVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH1cblxuXHRpbnRlcmZhY2UgSVRlc3RNaW5pbWFwTGluZVJlbmRlcmluZ0RhdGEge1xuXHRcdGNvbnRlbnQ6IHN0cmluZztcblx0XHRtaW5Db2x1bW46IG51bWJlcjtcblx0XHRtYXhDb2x1bW46IG51bWJlcjtcblx0XHR0b2tlbnM6IElUZXN0Vmlld0xpbmVUb2tlbltdO1xuXHR9XG5cblx0ZnVuY3Rpb24gYXNzZXJ0TWluaW1hcExpbmVSZW5kZXJpbmdEYXRhKGFjdHVhbDogVmlld0xpbmVEYXRhLCBleHBlY3RlZDogSVRlc3RNaW5pbWFwTGluZVJlbmRlcmluZ0RhdGEgfCBudWxsKTogdm9pZCB7XG5cdFx0aWYgKGFjdHVhbCA9PT0gbnVsbCAmJiBleHBlY3RlZCA9PT0gbnVsbCkge1xuXHRcdFx0YXNzZXJ0Lm9rKHRydWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZXhwZWN0ZWQgPT09IG51bGwpIHtcblx0XHRcdGFzc2VydC5vayhmYWxzZSk7XG5cdFx0fVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuY29udGVudCwgZXhwZWN0ZWQuY29udGVudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5taW5Db2x1bW4sIGV4cGVjdGVkLm1pbkNvbHVtbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5tYXhDb2x1bW4sIGV4cGVjdGVkLm1heENvbHVtbik7XG5cdFx0YXNzZXJ0Vmlld0xpbmVUb2tlbnMoYWN0dWFsLnRva2VucywgZXhwZWN0ZWQudG9rZW5zKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGFzc2VydE1pbmltYXBMaW5lc1JlbmRlcmluZ0RhdGEoYWN0dWFsOiBWaWV3TGluZURhdGFbXSwgZXhwZWN0ZWQ6IEFycmF5PElUZXN0TWluaW1hcExpbmVSZW5kZXJpbmdEYXRhIHwgbnVsbD4pOiB2b2lkIHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxlbmd0aCwgZXhwZWN0ZWQubGVuZ3RoKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGV4cGVjdGVkLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRhc3NlcnRNaW5pbWFwTGluZVJlbmRlcmluZ0RhdGEoYWN0dWFsW2ldLCBleHBlY3RlZFtpXSk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gYXNzZXJ0QWxsTWluaW1hcExpbmVzUmVuZGVyaW5nRGF0YShzcGxpdExpbmVzQ29sbGVjdGlvbjogVmlld01vZGVsTGluZXNGcm9tUHJvamVjdGVkTW9kZWwsIGFsbDogSVRlc3RNaW5pbWFwTGluZVJlbmRlcmluZ0RhdGFbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGxpbmVDb3VudCA9IGFsbC5sZW5ndGg7XG5cdFx0Zm9yIChsZXQgbGluZSA9IDE7IGxpbmUgPD0gbGluZUNvdW50OyBsaW5lKyspIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZURhdGEobGluZSkuY29udGVudCwgc3BsaXRMaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVDb250ZW50KGxpbmUpKTtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBzdGFydCA9IDE7IHN0YXJ0IDw9IGxpbmVDb3VudDsgc3RhcnQrKykge1xuXHRcdFx0Zm9yIChsZXQgZW5kID0gc3RhcnQ7IGVuZCA8PSBsaW5lQ291bnQ7IGVuZCsrKSB7XG5cdFx0XHRcdGNvbnN0IGNvdW50ID0gZW5kIC0gc3RhcnQgKyAxO1xuXHRcdFx0XHRmb3IgKGxldCBkZXNpcmVkID0gTWF0aC5wb3coMiwgY291bnQpIC0gMTsgZGVzaXJlZCA+PSAwOyBkZXNpcmVkLS0pIHtcblx0XHRcdFx0XHRjb25zdCBuZWVkZWQ6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdFx0XHRcdGNvbnN0IGV4cGVjdGVkOiBBcnJheTxJVGVzdE1pbmltYXBMaW5lUmVuZGVyaW5nRGF0YSB8IG51bGw+ID0gW107XG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjb3VudDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRuZWVkZWRbaV0gPSAoZGVzaXJlZCAmICgxIDw8IGkpKSA/IHRydWUgOiBmYWxzZTtcblx0XHRcdFx0XHRcdGV4cGVjdGVkW2ldID0gKG5lZWRlZFtpXSA/IGFsbFtzdGFydCAtIDEgKyBpXSA6IG51bGwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBhY3R1YWwgPSBzcGxpdExpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZXNEYXRhKHN0YXJ0LCBlbmQsIG5lZWRlZCk7XG5cblx0XHRcdFx0XHRhc3NlcnRNaW5pbWFwTGluZXNSZW5kZXJpbmdEYXRhKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHRcdFx0XHRcdC8vIENvbW1lbnQgb3V0IG5leHQgbGluZSB0byB0ZXN0IGFsbCBwb3NzaWJsZSBjb21iaW5hdGlvbnNcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHRlc3QoJ2dldFZpZXdMaW5lc0RhdGEgLSBubyB3cmFwcGluZycsICgpID0+IHtcblx0XHR3aXRoU3BsaXRMaW5lc0NvbGxlY3Rpb24obW9kZWwsICdvZmYnLCAwLCBmYWxzZSwgKHNwbGl0TGluZXNDb2xsZWN0aW9uKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVDb3VudCgpLCA4KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDEsIDEpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDIsIDEpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDMsIDEpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDQsIDEpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDUsIDEpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDYsIDEpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDcsIDEpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDgsIDEpLCB0cnVlKTtcblxuXHRcdFx0Y29uc3QgX2V4cGVjdGVkOiBJVGVzdE1pbmltYXBMaW5lUmVuZGVyaW5nRGF0YVtdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29udGVudDogJ2NsYXNzIE5pY2UgeycsXG5cdFx0XHRcdFx0bWluQ29sdW1uOiAxLFxuXHRcdFx0XHRcdG1heENvbHVtbjogMTMsXG5cdFx0XHRcdFx0dG9rZW5zOiBbXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiA1LCB2YWx1ZTogMSB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogNiwgdmFsdWU6IDIgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDEwLCB2YWx1ZTogMyB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTIsIHZhbHVlOiA0IH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29udGVudDogJ1x0ZnVuY3Rpb24gaGkoKSB7Jyxcblx0XHRcdFx0XHRtaW5Db2x1bW46IDEsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAxNyxcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDEsIHZhbHVlOiA1IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiA5LCB2YWx1ZTogNiB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTAsIHZhbHVlOiA3IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxMiwgdmFsdWU6IDggfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDE2LCB2YWx1ZTogOSB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICdcdFx0Y29uc29sZS5sb2coXCJIZWxsbyB3b3JsZFwiKTsnLFxuXHRcdFx0XHRcdG1pbkNvbHVtbjogMSxcblx0XHRcdFx0XHRtYXhDb2x1bW46IDMwLFxuXHRcdFx0XHRcdHRva2VuczogW1xuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMiwgdmFsdWU6IDEwIH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiA5LCB2YWx1ZTogMTEgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDEwLCB2YWx1ZTogMTIgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDEzLCB2YWx1ZTogMTMgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDE0LCB2YWx1ZTogMTQgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDI3LCB2YWx1ZTogMTUgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDI5LCB2YWx1ZTogMTYgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb250ZW50OiAnXHR9Jyxcblx0XHRcdFx0XHRtaW5Db2x1bW46IDEsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAzLFxuXHRcdFx0XHRcdHRva2VuczogW1xuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMiwgdmFsdWU6IDE3IH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29udGVudDogJ1x0ZnVuY3Rpb24gaGVsbG8oKSB7Jyxcblx0XHRcdFx0XHRtaW5Db2x1bW46IDEsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAyMCxcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDEsIHZhbHVlOiAxOCB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogOSwgdmFsdWU6IDE5IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxMCwgdmFsdWU6IDIwIH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxNSwgdmFsdWU6IDIxIH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxOSwgdmFsdWU6IDIyIH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29udGVudDogJ1x0XHRjb25zb2xlLmxvZyhcIkhlbGxvIHdvcmxkLCB0aGlzIGlzIGEgc29tZXdoYXQgbG9uZ2VyIGxpbmVcIik7Jyxcblx0XHRcdFx0XHRtaW5Db2x1bW46IDEsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiA2Mixcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDIsIHZhbHVlOiAyMyB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogOSwgdmFsdWU6IDI0IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxMCwgdmFsdWU6IDI1IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxMywgdmFsdWU6IDI2IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxNCwgdmFsdWU6IDI3IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiA1OSwgdmFsdWU6IDI4IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiA2MSwgdmFsdWU6IDI5IH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bWluQ29sdW1uOiAxLFxuXHRcdFx0XHRcdG1heENvbHVtbjogMyxcblx0XHRcdFx0XHRjb250ZW50OiAnXHR9Jyxcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDIsIHZhbHVlOiAzMCB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG1pbkNvbHVtbjogMSxcblx0XHRcdFx0XHRtYXhDb2x1bW46IDIsXG5cdFx0XHRcdFx0Y29udGVudDogJ30nLFxuXHRcdFx0XHRcdHRva2VuczogW1xuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMSwgdmFsdWU6IDMxIH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHRdO1xuXG5cdFx0XHRhc3NlcnRBbGxNaW5pbWFwTGluZXNSZW5kZXJpbmdEYXRhKHNwbGl0TGluZXNDb2xsZWN0aW9uLCBbXG5cdFx0XHRcdF9leHBlY3RlZFswXSxcblx0XHRcdFx0X2V4cGVjdGVkWzFdLFxuXHRcdFx0XHRfZXhwZWN0ZWRbMl0sXG5cdFx0XHRcdF9leHBlY3RlZFszXSxcblx0XHRcdFx0X2V4cGVjdGVkWzRdLFxuXHRcdFx0XHRfZXhwZWN0ZWRbNV0sXG5cdFx0XHRcdF9leHBlY3RlZFs2XSxcblx0XHRcdFx0X2V4cGVjdGVkWzddLFxuXHRcdFx0XSk7XG5cblx0XHRcdHNwbGl0TGluZXNDb2xsZWN0aW9uLnNldEhpZGRlbkFyZWFzKFtuZXcgUmFuZ2UoMiwgMSwgNCwgMSldKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZUNvdW50KCksIDUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwbGl0TGluZXNDb2xsZWN0aW9uLm1vZGVsUG9zaXRpb25Jc1Zpc2libGUoMSwgMSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwbGl0TGluZXNDb2xsZWN0aW9uLm1vZGVsUG9zaXRpb25Jc1Zpc2libGUoMiwgMSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDMsIDEpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSg0LCAxKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwbGl0TGluZXNDb2xsZWN0aW9uLm1vZGVsUG9zaXRpb25Jc1Zpc2libGUoNSwgMSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwbGl0TGluZXNDb2xsZWN0aW9uLm1vZGVsUG9zaXRpb25Jc1Zpc2libGUoNiwgMSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwbGl0TGluZXNDb2xsZWN0aW9uLm1vZGVsUG9zaXRpb25Jc1Zpc2libGUoNywgMSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwbGl0TGluZXNDb2xsZWN0aW9uLm1vZGVsUG9zaXRpb25Jc1Zpc2libGUoOCwgMSksIHRydWUpO1xuXG5cdFx0XHRhc3NlcnRBbGxNaW5pbWFwTGluZXNSZW5kZXJpbmdEYXRhKHNwbGl0TGluZXNDb2xsZWN0aW9uLCBbXG5cdFx0XHRcdF9leHBlY3RlZFswXSxcblx0XHRcdFx0X2V4cGVjdGVkWzRdLFxuXHRcdFx0XHRfZXhwZWN0ZWRbNV0sXG5cdFx0XHRcdF9leHBlY3RlZFs2XSxcblx0XHRcdFx0X2V4cGVjdGVkWzddLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFZpZXdMaW5lc0RhdGEgLSB3aXRoIHdyYXBwaW5nJywgKCkgPT4ge1xuXHRcdHdpdGhTcGxpdExpbmVzQ29sbGVjdGlvbihtb2RlbCwgJ3dvcmRXcmFwQ29sdW1uJywgMzAsIGZhbHNlLCAoc3BsaXRMaW5lc0NvbGxlY3Rpb24pID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZUNvdW50KCksIDEyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDEsIDEpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDIsIDEpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDMsIDEpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDQsIDEpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDUsIDEpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDYsIDEpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDcsIDEpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDgsIDEpLCB0cnVlKTtcblxuXHRcdFx0Y29uc3QgX2V4cGVjdGVkOiBJVGVzdE1pbmltYXBMaW5lUmVuZGVyaW5nRGF0YVtdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29udGVudDogJ2NsYXNzIE5pY2UgeycsXG5cdFx0XHRcdFx0bWluQ29sdW1uOiAxLFxuXHRcdFx0XHRcdG1heENvbHVtbjogMTMsXG5cdFx0XHRcdFx0dG9rZW5zOiBbXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiA1LCB2YWx1ZTogMSB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogNiwgdmFsdWU6IDIgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDEwLCB2YWx1ZTogMyB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTIsIHZhbHVlOiA0IH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29udGVudDogJ1x0ZnVuY3Rpb24gaGkoKSB7Jyxcblx0XHRcdFx0XHRtaW5Db2x1bW46IDEsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAxNyxcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDEsIHZhbHVlOiA1IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiA5LCB2YWx1ZTogNiB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTAsIHZhbHVlOiA3IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxMiwgdmFsdWU6IDggfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDE2LCB2YWx1ZTogOSB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICdcdFx0Y29uc29sZS5sb2coXCJIZWxsbyAnLFxuXHRcdFx0XHRcdG1pbkNvbHVtbjogMSxcblx0XHRcdFx0XHRtYXhDb2x1bW46IDIyLFxuXHRcdFx0XHRcdHRva2VuczogW1xuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMiwgdmFsdWU6IDEwIH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiA5LCB2YWx1ZTogMTEgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDEwLCB2YWx1ZTogMTIgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDEzLCB2YWx1ZTogMTMgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDE0LCB2YWx1ZTogMTQgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDIxLCB2YWx1ZTogMTUgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb250ZW50OiAnICAgICAgICAgICAgd29ybGRcIik7Jyxcblx0XHRcdFx0XHRtaW5Db2x1bW46IDEzLFxuXHRcdFx0XHRcdG1heENvbHVtbjogMjEsXG5cdFx0XHRcdFx0dG9rZW5zOiBbXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxOCwgdmFsdWU6IDE1IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAyMCwgdmFsdWU6IDE2IH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29udGVudDogJ1x0fScsXG5cdFx0XHRcdFx0bWluQ29sdW1uOiAxLFxuXHRcdFx0XHRcdG1heENvbHVtbjogMyxcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDIsIHZhbHVlOiAxNyB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICdcdGZ1bmN0aW9uIGhlbGxvKCkgeycsXG5cdFx0XHRcdFx0bWluQ29sdW1uOiAxLFxuXHRcdFx0XHRcdG1heENvbHVtbjogMjAsXG5cdFx0XHRcdFx0dG9rZW5zOiBbXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxLCB2YWx1ZTogMTggfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDksIHZhbHVlOiAxOSB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTAsIHZhbHVlOiAyMCB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTUsIHZhbHVlOiAyMSB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTksIHZhbHVlOiAyMiB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICdcdFx0Y29uc29sZS5sb2coXCJIZWxsbyAnLFxuXHRcdFx0XHRcdG1pbkNvbHVtbjogMSxcblx0XHRcdFx0XHRtYXhDb2x1bW46IDIyLFxuXHRcdFx0XHRcdHRva2VuczogW1xuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMiwgdmFsdWU6IDIzIH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiA5LCB2YWx1ZTogMjQgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDEwLCB2YWx1ZTogMjUgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDEzLCB2YWx1ZTogMjYgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDE0LCB2YWx1ZTogMjcgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDIxLCB2YWx1ZTogMjggfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb250ZW50OiAnICAgICAgICAgICAgd29ybGQsIHRoaXMgaXMgYSAnLFxuXHRcdFx0XHRcdG1pbkNvbHVtbjogMTMsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAzMCxcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDI5LCB2YWx1ZTogMjggfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb250ZW50OiAnICAgICAgICAgICAgc29tZXdoYXQgbG9uZ2VyICcsXG5cdFx0XHRcdFx0bWluQ29sdW1uOiAxMyxcblx0XHRcdFx0XHRtYXhDb2x1bW46IDI5LFxuXHRcdFx0XHRcdHRva2VuczogW1xuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMjgsIHZhbHVlOiAyOCB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICcgICAgICAgICAgICBsaW5lXCIpOycsXG5cdFx0XHRcdFx0bWluQ29sdW1uOiAxMyxcblx0XHRcdFx0XHRtYXhDb2x1bW46IDIwLFxuXHRcdFx0XHRcdHRva2VuczogW1xuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTcsIHZhbHVlOiAyOCB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTksIHZhbHVlOiAyOSB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICdcdH0nLFxuXHRcdFx0XHRcdG1pbkNvbHVtbjogMSxcblx0XHRcdFx0XHRtYXhDb2x1bW46IDMsXG5cdFx0XHRcdFx0dG9rZW5zOiBbXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAyLCB2YWx1ZTogMzAgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb250ZW50OiAnfScsXG5cdFx0XHRcdFx0bWluQ29sdW1uOiAxLFxuXHRcdFx0XHRcdG1heENvbHVtbjogMixcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDEsIHZhbHVlOiAzMSB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0XTtcblxuXHRcdFx0YXNzZXJ0QWxsTWluaW1hcExpbmVzUmVuZGVyaW5nRGF0YShzcGxpdExpbmVzQ29sbGVjdGlvbiwgW1xuXHRcdFx0XHRfZXhwZWN0ZWRbMF0sXG5cdFx0XHRcdF9leHBlY3RlZFsxXSxcblx0XHRcdFx0X2V4cGVjdGVkWzJdLFxuXHRcdFx0XHRfZXhwZWN0ZWRbM10sXG5cdFx0XHRcdF9leHBlY3RlZFs0XSxcblx0XHRcdFx0X2V4cGVjdGVkWzVdLFxuXHRcdFx0XHRfZXhwZWN0ZWRbNl0sXG5cdFx0XHRcdF9leHBlY3RlZFs3XSxcblx0XHRcdFx0X2V4cGVjdGVkWzhdLFxuXHRcdFx0XHRfZXhwZWN0ZWRbOV0sXG5cdFx0XHRcdF9leHBlY3RlZFsxMF0sXG5cdFx0XHRcdF9leHBlY3RlZFsxMV0sXG5cdFx0XHRdKTtcblxuXHRcdFx0c3BsaXRMaW5lc0NvbGxlY3Rpb24uc2V0SGlkZGVuQXJlYXMoW25ldyBSYW5nZSgyLCAxLCA0LCAxKV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwbGl0TGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lQ291bnQoKSwgOCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSgxLCAxKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSgyLCAxKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwbGl0TGluZXNDb2xsZWN0aW9uLm1vZGVsUG9zaXRpb25Jc1Zpc2libGUoMywgMSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzcGxpdExpbmVzQ29sbGVjdGlvbi5tb2RlbFBvc2l0aW9uSXNWaXNpYmxlKDQsIDEpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSg1LCAxKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSg2LCAxKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSg3LCAxKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24ubW9kZWxQb3NpdGlvbklzVmlzaWJsZSg4LCAxKSwgdHJ1ZSk7XG5cblx0XHRcdGFzc2VydEFsbE1pbmltYXBMaW5lc1JlbmRlcmluZ0RhdGEoc3BsaXRMaW5lc0NvbGxlY3Rpb24sIFtcblx0XHRcdFx0X2V4cGVjdGVkWzBdLFxuXHRcdFx0XHRfZXhwZWN0ZWRbNV0sXG5cdFx0XHRcdF9leHBlY3RlZFs2XSxcblx0XHRcdFx0X2V4cGVjdGVkWzddLFxuXHRcdFx0XHRfZXhwZWN0ZWRbOF0sXG5cdFx0XHRcdF9leHBlY3RlZFs5XSxcblx0XHRcdFx0X2V4cGVjdGVkWzEwXSxcblx0XHRcdFx0X2V4cGVjdGVkWzExXSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRWaWV3TGluZXNEYXRhIC0gd2l0aCB3cmFwcGluZyBhbmQgaW5qZWN0ZWQgdGV4dCcsICgpID0+IHtcblx0XHRtb2RlbC5kZWx0YURlY29yYXRpb25zKFtdLCBbe1xuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCA5LCAxLCA5KSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdleGFtcGxlJyxcblx0XHRcdFx0YWZ0ZXI6IHtcblx0XHRcdFx0XHRjb250ZW50OiAndmVyeSB2ZXJ5IGxvbmcgaW5qZWN0ZWQgdGV4dCB0aGF0IGNhdXNlcyBhIGxpbmUgYnJlYWsnLFxuXHRcdFx0XHRcdGlubGluZUNsYXNzTmFtZTogJ215Q2xhc3NOYW1lJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRzaG93SWZDb2xsYXBzZWQ6IHRydWUsXG5cdFx0XHR9XG5cdFx0fV0pO1xuXG5cdFx0d2l0aFNwbGl0TGluZXNDb2xsZWN0aW9uKG1vZGVsLCAnd29yZFdyYXBDb2x1bW4nLCAzMCwgZmFsc2UsIChzcGxpdExpbmVzQ29sbGVjdGlvbikgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNwbGl0TGluZXNDb2xsZWN0aW9uLmdldFZpZXdMaW5lQ291bnQoKSwgMTQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3BsaXRMaW5lc0NvbGxlY3Rpb24uZ2V0Vmlld0xpbmVNYXhDb2x1bW4oMSksIDI0KTtcblxuXHRcdFx0Y29uc3QgX2V4cGVjdGVkOiBJVGVzdE1pbmltYXBMaW5lUmVuZGVyaW5nRGF0YVtdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29udGVudDogJ2NsYXNzIE5pdmVyeSB2ZXJ5IGxvbmcgJyxcblx0XHRcdFx0XHRtaW5Db2x1bW46IDEsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAyNCxcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDUsIHZhbHVlOiAxIH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiA2LCB2YWx1ZTogMiB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogOCwgdmFsdWU6IDMgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDIzLCB2YWx1ZTogMSB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICcgICAgaW5qZWN0ZWQgdGV4dCB0aGF0IGNhdXNlcyAnLFxuXHRcdFx0XHRcdG1pbkNvbHVtbjogNSxcblx0XHRcdFx0XHRtYXhDb2x1bW46IDMxLFxuXHRcdFx0XHRcdHRva2VuczogW3sgZW5kSW5kZXg6IDMwLCB2YWx1ZTogMSB9XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29udGVudDogJyAgICBhIGxpbmUgYnJlYWtjZSB7Jyxcblx0XHRcdFx0XHRtaW5Db2x1bW46IDUsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAyMSxcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDE2LCB2YWx1ZTogMSB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTgsIHZhbHVlOiAzIH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAyMCwgdmFsdWU6IDQgfVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICdcdGZ1bmN0aW9uIGhpKCkgeycsXG5cdFx0XHRcdFx0bWluQ29sdW1uOiAxLFxuXHRcdFx0XHRcdG1heENvbHVtbjogMTcsXG5cdFx0XHRcdFx0dG9rZW5zOiBbXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxLCB2YWx1ZTogNSB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogOSwgdmFsdWU6IDYgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDEwLCB2YWx1ZTogNyB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTIsIHZhbHVlOiA4IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxNiwgdmFsdWU6IDkgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb250ZW50OiAnXHRcdGNvbnNvbGUubG9nKFwiSGVsbG8gJyxcblx0XHRcdFx0XHRtaW5Db2x1bW46IDEsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAyMixcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDIsIHZhbHVlOiAxMCB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogOSwgdmFsdWU6IDExIH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxMCwgdmFsdWU6IDEyIH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxMywgdmFsdWU6IDEzIH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxNCwgdmFsdWU6IDE0IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAyMSwgdmFsdWU6IDE1IH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29udGVudDogJyAgICAgICAgICAgIHdvcmxkXCIpOycsXG5cdFx0XHRcdFx0bWluQ29sdW1uOiAxMyxcblx0XHRcdFx0XHRtYXhDb2x1bW46IDIxLFxuXHRcdFx0XHRcdHRva2VuczogW1xuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMTgsIHZhbHVlOiAxNSB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMjAsIHZhbHVlOiAxNiB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICdcdH0nLFxuXHRcdFx0XHRcdG1pbkNvbHVtbjogMSxcblx0XHRcdFx0XHRtYXhDb2x1bW46IDMsXG5cdFx0XHRcdFx0dG9rZW5zOiBbXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAyLCB2YWx1ZTogMTcgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb250ZW50OiAnXHRmdW5jdGlvbiBoZWxsbygpIHsnLFxuXHRcdFx0XHRcdG1pbkNvbHVtbjogMSxcblx0XHRcdFx0XHRtYXhDb2x1bW46IDIwLFxuXHRcdFx0XHRcdHRva2VuczogW1xuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMSwgdmFsdWU6IDE4IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiA5LCB2YWx1ZTogMTkgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDEwLCB2YWx1ZTogMjAgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDE1LCB2YWx1ZTogMjEgfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDE5LCB2YWx1ZTogMjIgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb250ZW50OiAnXHRcdGNvbnNvbGUubG9nKFwiSGVsbG8gJyxcblx0XHRcdFx0XHRtaW5Db2x1bW46IDEsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAyMixcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDIsIHZhbHVlOiAyMyB9LFxuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogOSwgdmFsdWU6IDI0IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxMCwgdmFsdWU6IDI1IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxMywgdmFsdWU6IDI2IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxNCwgdmFsdWU6IDI3IH0sXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAyMSwgdmFsdWU6IDI4IH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29udGVudDogJyAgICAgICAgICAgIHdvcmxkLCB0aGlzIGlzIGEgJyxcblx0XHRcdFx0XHRtaW5Db2x1bW46IDEzLFxuXHRcdFx0XHRcdG1heENvbHVtbjogMzAsXG5cdFx0XHRcdFx0dG9rZW5zOiBbXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAyOSwgdmFsdWU6IDI4IH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29udGVudDogJyAgICAgICAgICAgIHNvbWV3aGF0IGxvbmdlciAnLFxuXHRcdFx0XHRcdG1pbkNvbHVtbjogMTMsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAyOSxcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDI4LCB2YWx1ZTogMjggfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb250ZW50OiAnICAgICAgICAgICAgbGluZVwiKTsnLFxuXHRcdFx0XHRcdG1pbkNvbHVtbjogMTMsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAyMCxcblx0XHRcdFx0XHR0b2tlbnM6IFtcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDE3LCB2YWx1ZTogMjggfSxcblx0XHRcdFx0XHRcdHsgZW5kSW5kZXg6IDE5LCB2YWx1ZTogMjkgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjb250ZW50OiAnXHR9Jyxcblx0XHRcdFx0XHRtaW5Db2x1bW46IDEsXG5cdFx0XHRcdFx0bWF4Q29sdW1uOiAzLFxuXHRcdFx0XHRcdHRva2VuczogW1xuXHRcdFx0XHRcdFx0eyBlbmRJbmRleDogMiwgdmFsdWU6IDMwIH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y29udGVudDogJ30nLFxuXHRcdFx0XHRcdG1pbkNvbHVtbjogMSxcblx0XHRcdFx0XHRtYXhDb2x1bW46IDIsXG5cdFx0XHRcdFx0dG9rZW5zOiBbXG5cdFx0XHRcdFx0XHR7IGVuZEluZGV4OiAxLCB2YWx1ZTogMzEgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF07XG5cblx0XHRcdGFzc2VydEFsbE1pbmltYXBMaW5lc1JlbmRlcmluZ0RhdGEoc3BsaXRMaW5lc0NvbGxlY3Rpb24sIFtcblx0XHRcdFx0X2V4cGVjdGVkWzBdLFxuXHRcdFx0XHRfZXhwZWN0ZWRbMV0sXG5cdFx0XHRcdF9leHBlY3RlZFsyXSxcblx0XHRcdFx0X2V4cGVjdGVkWzNdLFxuXHRcdFx0XHRfZXhwZWN0ZWRbNF0sXG5cdFx0XHRcdF9leHBlY3RlZFs1XSxcblx0XHRcdFx0X2V4cGVjdGVkWzZdLFxuXHRcdFx0XHRfZXhwZWN0ZWRbN10sXG5cdFx0XHRcdF9leHBlY3RlZFs4XSxcblx0XHRcdFx0X2V4cGVjdGVkWzldLFxuXHRcdFx0XHRfZXhwZWN0ZWRbMTBdLFxuXHRcdFx0XHRfZXhwZWN0ZWRbMTFdLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGRhdGEgPSBzcGxpdExpbmVzQ29sbGVjdGlvbi5nZXRWaWV3TGluZXNEYXRhKDEsIDE0LCBuZXcgQXJyYXkoMTQpLmZpbGwodHJ1ZSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0ZGF0YS5tYXAoKGQpID0+ICh7XG5cdFx0XHRcdFx0aW5saW5lRGVjb3JhdGlvbnM6IGQuaW5saW5lRGVjb3JhdGlvbnM/Lm1hcCgoZCkgPT4gKHtcblx0XHRcdFx0XHRcdHN0YXJ0T2Zmc2V0OiBkLnJhbmdlLnN0YXJ0Q29sdW1uIC0gMSxcblx0XHRcdFx0XHRcdGVuZE9mZnNldDogZC5yYW5nZS5lbmRDb2x1bW4gLSAxLFxuXHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0fSkpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBpbmxpbmVEZWNvcmF0aW9uczogW3sgc3RhcnRPZmZzZXQ6IDgsIGVuZE9mZnNldDogMjMgfV0gfSxcblx0XHRcdFx0XHR7IGlubGluZURlY29yYXRpb25zOiBbeyBzdGFydE9mZnNldDogNCwgZW5kT2Zmc2V0OiAzMCB9XSB9LFxuXHRcdFx0XHRcdHsgaW5saW5lRGVjb3JhdGlvbnM6IFt7IHN0YXJ0T2Zmc2V0OiA0LCBlbmRPZmZzZXQ6IDE2IH1dIH0sXG5cdFx0XHRcdFx0eyBpbmxpbmVEZWNvcmF0aW9uczogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0eyBpbmxpbmVEZWNvcmF0aW9uczogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0eyBpbmxpbmVEZWNvcmF0aW9uczogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0eyBpbmxpbmVEZWNvcmF0aW9uczogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0eyBpbmxpbmVEZWNvcmF0aW9uczogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0eyBpbmxpbmVEZWNvcmF0aW9uczogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0eyBpbmxpbmVEZWNvcmF0aW9uczogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0eyBpbmxpbmVEZWNvcmF0aW9uczogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0eyBpbmxpbmVEZWNvcmF0aW9uczogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0eyBpbmxpbmVEZWNvcmF0aW9uczogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0eyBpbmxpbmVEZWNvcmF0aW9uczogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHdpdGhTcGxpdExpbmVzQ29sbGVjdGlvbihtb2RlbDogVGV4dE1vZGVsLCB3b3JkV3JhcDogJ29uJyB8ICdvZmYnIHwgJ3dvcmRXcmFwQ29sdW1uJyB8ICdib3VuZGVkJywgd29yZFdyYXBDb2x1bW46IG51bWJlciwgd3JhcE9uRXNjYXBlZExpbmVGZWVkczogYm9vbGVhbiwgY2FsbGJhY2s6IChzcGxpdExpbmVzQ29sbGVjdGlvbjogVmlld01vZGVsTGluZXNGcm9tUHJvamVjdGVkTW9kZWwpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gbmV3IFRlc3RDb25maWd1cmF0aW9uKHtcblx0XHRcdHdvcmRXcmFwOiB3b3JkV3JhcCxcblx0XHRcdHdvcmRXcmFwQ29sdW1uOiB3b3JkV3JhcENvbHVtbixcblx0XHRcdHdyYXBwaW5nSW5kZW50OiAnaW5kZW50J1xuXHRcdH0pO1xuXHRcdGNvbnN0IHdyYXBwaW5nSW5mbyA9IGNvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLndyYXBwaW5nSW5mbyk7XG5cdFx0Y29uc3QgZm9udEluZm8gPSBjb25maWd1cmF0aW9uLm9wdGlvbnMuZ2V0KEVkaXRvck9wdGlvbi5mb250SW5mbyk7XG5cdFx0Y29uc3Qgd29yZFdyYXBCcmVha0FmdGVyQ2hhcmFjdGVycyA9IGNvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLndvcmRXcmFwQnJlYWtBZnRlckNoYXJhY3RlcnMpO1xuXHRcdGNvbnN0IHdvcmRXcmFwQnJlYWtCZWZvcmVDaGFyYWN0ZXJzID0gY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24ud29yZFdyYXBCcmVha0JlZm9yZUNoYXJhY3RlcnMpO1xuXHRcdGNvbnN0IHdyYXBwaW5nSW5kZW50ID0gY29uZmlndXJhdGlvbi5vcHRpb25zLmdldChFZGl0b3JPcHRpb24ud3JhcHBpbmdJbmRlbnQpO1xuXHRcdGNvbnN0IHdvcmRCcmVhayA9IGNvbmZpZ3VyYXRpb24ub3B0aW9ucy5nZXQoRWRpdG9yT3B0aW9uLndvcmRCcmVhayk7XG5cblx0XHRjb25zdCBsaW5lQnJlYWtzQ29tcHV0ZXJGYWN0b3J5ID0gbmV3IE1vbm9zcGFjZUxpbmVCcmVha3NDb21wdXRlckZhY3Rvcnkod29yZFdyYXBCcmVha0JlZm9yZUNoYXJhY3RlcnMsIHdvcmRXcmFwQnJlYWtBZnRlckNoYXJhY3RlcnMpO1xuXG5cdFx0Y29uc3QgbGluZXNDb2xsZWN0aW9uID0gbmV3IFZpZXdNb2RlbExpbmVzRnJvbVByb2plY3RlZE1vZGVsKFxuXHRcdFx0MSxcblx0XHRcdG1vZGVsLFxuXHRcdFx0bGluZUJyZWFrc0NvbXB1dGVyRmFjdG9yeSxcblx0XHRcdGxpbmVCcmVha3NDb21wdXRlckZhY3RvcnksXG5cdFx0XHRmb250SW5mbyxcblx0XHRcdG1vZGVsLmdldE9wdGlvbnMoKS50YWJTaXplLFxuXHRcdFx0J3NpbXBsZScsXG5cdFx0XHR3cmFwcGluZ0luZm8ud3JhcHBpbmdDb2x1bW4sXG5cdFx0XHR3cmFwcGluZ0luZGVudCxcblx0XHRcdHdvcmRCcmVhayxcblx0XHRcdHdyYXBPbkVzY2FwZWRMaW5lRmVlZHNcblx0XHQpO1xuXG5cdFx0Y2FsbGJhY2sobGluZXNDb2xsZWN0aW9uKTtcblxuXHRcdGNvbmZpZ3VyYXRpb24uZGlzcG9zZSgpO1xuXHR9XG59KTtcblxuXG5mdW5jdGlvbiBwb3MobGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlcik6IFBvc2l0aW9uIHtcblx0cmV0dXJuIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVTcGxpdExpbmUoc3BsaXRMZW5ndGhzOiBudW1iZXJbXSwgYnJlYWtpbmdPZmZzZXRzVmlzaWJsZUNvbHVtbjogbnVtYmVyW10sIHdyYXBwZWRUZXh0SW5kZW50V2lkdGg6IG51bWJlciwgaXNWaXNpYmxlOiBib29sZWFuID0gdHJ1ZSk6IElNb2RlbExpbmVQcm9qZWN0aW9uIHtcblx0cmV0dXJuIGNyZWF0ZU1vZGVsTGluZVByb2plY3Rpb24oY3JlYXRlTGluZUJyZWFrRGF0YShzcGxpdExlbmd0aHMsIGJyZWFraW5nT2Zmc2V0c1Zpc2libGVDb2x1bW4sIHdyYXBwZWRUZXh0SW5kZW50V2lkdGgpLCBpc1Zpc2libGUpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVMaW5lQnJlYWtEYXRhKGJyZWFraW5nTGVuZ3RoczogbnVtYmVyW10sIGJyZWFraW5nT2Zmc2V0c1Zpc2libGVDb2x1bW46IG51bWJlcltdLCB3cmFwcGVkVGV4dEluZGVudFdpZHRoOiBudW1iZXIpOiBNb2RlbExpbmVQcm9qZWN0aW9uRGF0YSB7XG5cdGNvbnN0IHN1bXM6IG51bWJlcltdID0gW107XG5cdGZvciAobGV0IGkgPSAwOyBpIDwgYnJlYWtpbmdMZW5ndGhzLmxlbmd0aDsgaSsrKSB7XG5cdFx0c3Vtc1tpXSA9IChpID4gMCA/IHN1bXNbaSAtIDFdIDogMCkgKyBicmVha2luZ0xlbmd0aHNbaV07XG5cdH1cblx0cmV0dXJuIG5ldyBNb2RlbExpbmVQcm9qZWN0aW9uRGF0YShudWxsLCBudWxsLCBzdW1zLCBicmVha2luZ09mZnNldHNWaXNpYmxlQ29sdW1uLCB3cmFwcGVkVGV4dEluZGVudFdpZHRoKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTW9kZWwodGV4dDogc3RyaW5nKTogSVNpbXBsZU1vZGVsIHtcblx0cmV0dXJuIHtcblx0XHR0b2tlbml6YXRpb246IHtcblx0XHRcdGdldExpbmVUb2tlbnM6IChsaW5lTnVtYmVyOiBudW1iZXIpID0+IHtcblx0XHRcdFx0cmV0dXJuIG51bGwhO1xuXHRcdFx0fSxcblx0XHR9LFxuXHRcdGdldExpbmVDb250ZW50OiAobGluZU51bWJlcjogbnVtYmVyKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGV4dDtcblx0XHR9LFxuXHRcdGdldExpbmVMZW5ndGg6IChsaW5lTnVtYmVyOiBudW1iZXIpID0+IHtcblx0XHRcdHJldHVybiB0ZXh0Lmxlbmd0aDtcblx0XHR9LFxuXHRcdGdldExpbmVNaW5Db2x1bW46IChsaW5lTnVtYmVyOiBudW1iZXIpID0+IHtcblx0XHRcdHJldHVybiAxO1xuXHRcdH0sXG5cdFx0Z2V0TGluZU1heENvbHVtbjogKGxpbmVOdW1iZXI6IG51bWJlcikgPT4ge1xuXHRcdFx0cmV0dXJuIHRleHQubGVuZ3RoICsgMTtcblx0XHR9LFxuXHRcdGdldFZhbHVlSW5SYW5nZTogKHJhbmdlOiBJUmFuZ2UsIGVvbD86IEVuZE9mTGluZVByZWZlcmVuY2UpID0+IHtcblx0XHRcdHJldHVybiB0ZXh0LnN1YnN0cmluZyhyYW5nZS5zdGFydENvbHVtbiAtIDEsIHJhbmdlLmVuZENvbHVtbiAtIDEpO1xuXHRcdH1cblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLG9CQUFvQjtBQUM3QixT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RUFBRSxHQUFHLEVBQUU7QUFDL0QsYUFBTyxZQUFZLGdCQUFnQixxQkFBcUIsQ0FBQyxHQUFHLEVBQUU7QUFDOUQsYUFBTyxZQUFZLGdCQUFnQixxQkFBcUIsQ0FBQyxHQUFHLEVBQUU7QUFDOUQsYUFBTyxZQUFZLGdCQUFnQixxQkFBcUIsQ0FBQyxHQUFHLEVBQUU7QUFDOUQsYUFBTyxZQUFZLGdCQUFnQixxQkFBcUIsQ0FBQyxHQUFHLENBQUM7QUFDN0QsYUFBTyxZQUFZLGdCQUFnQixxQkFBcUIsQ0FBQyxHQUFHLEVBQUU7QUFDOUQsYUFBTyxZQUFZLGdCQUFnQixxQkFBcUIsQ0FBQyxHQUFHLEVBQUU7QUFDOUQsYUFBTyxZQUFZLGdCQUFnQixxQkFBcUIsQ0FBQyxHQUFHLENBQUM7QUFDN0QsYUFBTyxZQUFZLGdCQUFnQixxQkFBcUIsQ0FBQyxHQUFHLENBQUM7QUFHN0QsYUFBTyxnQkFBZ0IsZ0JBQWdCLG1DQUFtQyxJQUFJLENBQUMsR0FBRyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDcEcsYUFBTyxnQkFBZ0IsZ0JBQWdCLG1DQUFtQyxHQUFHLENBQUMsR0FBRyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDbkcsYUFBTyxnQkFBZ0IsZ0JBQWdCLG1DQUFtQyxHQUFHLENBQUMsR0FBRyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDbkcsYUFBTyxnQkFBZ0IsZ0JBQWdCLG1DQUFtQyxHQUFHLENBQUMsR0FBRyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDbkcsYUFBTyxnQkFBZ0IsZ0JBQWdCLG1DQUFtQyxHQUFHLENBQUMsR0FBRyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDbkcsYUFBTyxnQkFBZ0IsZ0JBQWdCLG1DQUFtQyxHQUFHLENBQUMsR0FBRyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDbkcsYUFBTyxnQkFBZ0IsZ0JBQWdCLG1DQUFtQyxHQUFHLENBQUMsR0FBRyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDbkcsYUFBTyxnQkFBZ0IsZ0JB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QUc7QUFBQSxZQUN6QixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxVQUMzQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsVUFDWCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsR0FBRyxPQUFPLEdBQUc7QUFBQSxVQUMxQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsVUFDWCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsR0FBRyxPQUFPLEdBQUc7QUFBQSxZQUN6QixFQUFFLFVBQVUsR0FBRyxPQUFPLEdBQUc7QUFBQSxZQUN6QixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxVQUMzQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsVUFDWCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsR0FBRyxPQUFPLEdBQUc7QUFBQSxZQUN6QixFQUFFLFVBQVUsR0FBRyxPQUFPLEdBQUc7QUFBQSxZQUN6QixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFF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QUFBLFlBQ3hCLEVBQUUsVUFBVSxHQUFHLE9BQU8sRUFBRTtBQUFBLFlBQ3hCLEVBQUUsVUFBVSxJQUFJLE9BQU8sRUFBRTtBQUFBLFlBQ3pCLEVBQUUsVUFBVSxJQUFJLE9BQU8sRUFBRTtBQUFBLFVBQzFCO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLFNBQVM7QUFBQSxVQUNULFdBQVc7QUFBQSxVQUNYLFdBQVc7QUFBQSxVQUNYLFFBQVE7QUFBQSxZQUNQLEVBQUUsVUFBVSxHQUFHLE9BQU8sRUFBRTtBQUFBLFlBQ3hCLEVBQUUsVUFBVSxHQUFHLE9BQU8sRUFBRTtBQUFBLFlBQ3hCLEVBQUUsVUFBVSxJQUFJLE9BQU8sRUFBRTtBQUFBLFlBQ3pCLEVBQUUsVUFBVSxJQUFJLE9BQU8sRUFBRTtBQUFBLFlBQ3pCLEVBQUUsVUFBVSxJQUFJLE9BQU8sRUFBRTtBQUFBLFVBQzFCO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLFNBQVM7QUFBQSxVQUNULFdBQVc7QUFBQSxVQUNYLFdBQVc7QUFBQSxVQUNYLFFBQVE7QUFBQSxZQUNQLEVBQUUsVUFBVSxHQUFHLE9BQU8sR0FBRztBQUFBLFlBQ3pCLEVBQUUsVUFBVSxHQUFHLE9BQU8sR0FBRztBQUFBLFlBQ3pCLEVBQUUsVUFBVSxJQUFJLE9BQU8sR0FBRztBQUFBLFlBQzFCLEVBQUUsVUFBVSxJQUFJLE9BQU8sR0FBRztBQUFBLFlBQzFCLEVBQUUsVUFBVSxJQUFJLE9BQU8sR0FBRztBQUFBLFlBQzFCLEVBQUUsVUFBVSxJQUFJLE9BQU8sR0FBRztBQUFBLFVBQzNCO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLFNBQVM7QUFBQSxVQUNULFdBQVc7QUFBQSxVQUNYLFdBQVc7QUFBQSxVQUNYLFFBQVE7QUFBQSxZQUNQLEVBQUUsVUFBVSxJQUFJLE9BQU8sR0FBRztBQUFBLFlBQzFCLEVBQUUsVUFBVSxJQUFJLE9BQU8sR0FBRztBQUFBLFVBQzNCO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLFNBQVM7QUFBQSxVQUNULFdBQVc7QUFBQSxVQUNYLFdBQVc7QUFBQSxVQUNYLFFBQVE7QUFBQSxZQUNQLEVBQUUsVUFBVSxHQUFHLE9BQU8sR0FBRztBQUFBLFVBQzFCO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLFNBQVM7QUFBQSxVQUNULFdBQVc7QUFBQSxVQUNYLFdBQVc7QUFBQSxVQUNYLFFBQVE7QUFBQSxZQUNQLEVBQUUsVUFBVSxHQUFHLE9BQU8sR0FBRztBQUFBLFlBQ3pCLEVBQUUsVUFBVSxHQUFHLE9BQU8sR0FBRztBQUFBLFlBQ3pCLEVBQUUsVUFBVSxJQUFJLE9BQU8sR0FBRztBQUFBLFlBQzFCLEVBQUUsVUFBVSxJQUFJLE9BQU8sR0FBRztBQUFBLFlBQzFCLEVBQUUsVUFBVSxJQUFJLE9BQU8sR0FBRztBQUFBLFVBQzNCO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLFNBQVM7QUFBQSxVQUNULFdBQVc7QUFBQSxVQUNYLFdBQVc7QUFBQSxVQUNYLFFBQVE7QUFBQSxZQUNQLEVBQUUsVUFBVSxHQUFHLE9BQU8sR0FBRztBQUFBLFlBQ3pCLEVBQUUsVUFBVSxHQUFHLE9BQU8sR0FBRztBQUFBLFlBQ3pCLEVBQUUsVUFBVSxJQUFJLE9BQU8sR0FBRztBQUFBLFlBQzFCLEVBQUUsVUFBVSxJQUFJLE9BQU8sR0FBRztBQUFBLFlBQzFCLEVBQUUsVUFBVSxJQUFJLE9BQU8sR0FBRztBQUFBLFlBQzFCLEVBQUUsVUFBVSxJQUFJLE9BQU8sR0FBRztBQUFBLFVBQzNCO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLFNBQVM7QUFBQSxVQUNULFdBQVc7QUFBQSxVQUNYLFdBQVc7QUFBQSxVQUNYLFFBQVE7QUFBQSxZQUNQLEVBQUUsVUFBVSxJQUFJLE9BQU8sR0FBRztBQUFBLFVBQzNCO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxVQUNDLFNBQVM7QUFBQSxVQUNULFdBQVc7QUFBQSxVQUNYLFdBQVc7QUFBQSxVQUNYLFFBQVE7QUFBQSxZQUNQLEVBQUUsVUFBVSxJQUFJLE9BQU8sR0FBRztB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WCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsR0FBRyxPQUFPLEdBQUc7QUFBQSxZQUN6QixFQUFFLFVBQVUsR0FBRyxPQUFPLEdBQUc7QUFBQSxZQUN6QixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxVQUMzQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsVUFDWCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxVQUMzQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsVUFDWCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsR0FBRyxPQUFPLEdBQUc7QUFBQSxVQUMxQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsVUFDWCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsR0FBRyxPQUFPLEdBQUc7QUFBQSxZQUN6QixFQUFFLFVBQVUsR0FBRyxPQUFPLEdBQUc7QUFBQSxZQUN6QixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxVQUMzQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsVUFDWCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsR0FBRyxPQUFPLEdBQUc7QUFBQSxZQUN6QixFQUFFLFVBQVUsR0FBRyxPQUFPLEdBQUc7QUFBQSxZQUN6QixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxVQUMzQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsVUFDWCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxVQUMzQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsVUFDWCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxVQUMzQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsVUFDWCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxZQUMxQixFQUFFLFVBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxVQUMzQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsVUFDWCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsR0FBRyxPQUFPLEdBQUc7QUFBQSxVQUMxQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFDVCxXQUFXO0FBQUEsVUFDWCxXQUFXO0FBQUEsVUFDWCxRQUFRO0FBQUEsWUFDUCxFQUFFLFVBQVUsR0FBRyxPQUFPLEdBQUc7QUFBQSxVQUMxQjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FB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
