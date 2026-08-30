import assert from "assert";
import { CharCode } from "../../../../base/common/charCode.js";
import * as strings from "../../../../base/common/strings.js";
import { assertSnapshot } from "../../../../base/test/common/snapshot.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { OffsetRange } from "../../../common/core/ranges/offsetRange.js";
import { MetadataConsts } from "../../../common/encodedTokenAttributes.js";
import { LineDecoration } from "../../../common/viewLayout/lineDecorations.js";
import { DomPosition, RenderLineInput, renderViewLine2 as renderViewLine } from "../../../common/viewLayout/viewLineRenderer.js";
import { InlineDecorationType } from "../../../common/viewModel/inlineDecorations.js";
import { TestLineToken, TestLineTokens } from "../core/testLineToken.js";
const HTML_EXTENSION = { extension: "html" };
function createViewLineTokens(viewLineTokens) {
  return new TestLineTokens(viewLineTokens);
}
function createPart(endIndex, foreground) {
  return new TestLineToken(endIndex, foreground << MetadataConsts.FOREGROUND_OFFSET >>> 0);
}
function inflateRenderLineOutput(renderLineOutput) {
  let html = renderLineOutput.html;
  if (html.startsWith("<span>")) {
    html = html.replace(/^<span>/, "");
  }
  html = html.replace(/<\/span>$/, "");
  const spans = [];
  let lastIndex = 0;
  do {
    const newIndex = html.indexOf("<span", lastIndex + 1);
    if (newIndex === -1) {
      break;
    }
    spans.push(html.substring(lastIndex, newIndex));
    lastIndex = newIndex;
  } while (true);
  spans.push(html.substring(lastIndex));
  return {
    html: spans,
    mapping: renderLineOutput.characterMapping.inflate()
  };
}
const defaultRenderLineInputOptions = {
  useMonospaceOptimizations: false,
  canUseHalfwidthRightwardsArrow: true,
  lineContent: "",
  continuesWithWrappedLine: false,
  isBasicASCII: true,
  containsRTL: false,
  fauxIndentLength: 0,
  lineTokens: createViewLineTokens([]),
  lineDecorations: [],
  tabSize: 4,
  startVisibleColumn: 0,
  spaceWidth: 10,
  middotWidth: 10,
  wsmiddotWidth: 10,
  stopRenderingLineAfter: -1,
  renderWhitespace: "none",
  renderControlCharacters: false,
  fontLigatures: false,
  selectionsOnLine: null,
  textDirection: null,
  verticalScrollbarSize: 14,
  renderNewLineWhenEmpty: false
};
function createRenderLineInputOptions(opts) {
  return {
    ...defaultRenderLineInputOptions,
    ...opts
  };
}
function createRenderLineInput(opts) {
  const options = createRenderLineInputOptions(opts);
  return new RenderLineInput(
    options.useMonospaceOptimizations,
    options.canUseHalfwidthRightwardsArrow,
    options.lineContent,
    options.continuesWithWrappedLine,
    options.isBasicASCII,
    options.containsRTL,
    options.fauxIndentLength,
    options.lineTokens,
    options.lineDecorations,
    options.tabSize,
    options.startVisibleColumn,
    options.spaceWidth,
    options.middotWidth,
    options.wsmiddotWidth,
    options.stopRenderingLineAfter,
    options.renderWhitespace,
    options.renderControlCharacters,
    options.fontLigatures,
    options.selectionsOnLine,
    options.textDirection,
    options.verticalScrollbarSize,
    options.renderNewLineWhenEmpty
  );
}
suite("renderViewLine", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function assertCharacterReplacement(lineContent, tabSize, expected, expectedCharOffsetInPart) {
    const _actual = renderViewLine(createRenderLineInput({
      lineContent,
      isBasicASCII: strings.isBasicASCII(lineContent),
      lineTokens: createViewLineTokens([new TestLineToken(lineContent.length, 0)]),
      tabSize,
      spaceWidth: 0,
      middotWidth: 0,
      wsmiddotWidth: 0
    }));
    assert.strictEqual(_actual.html, '<span><span class="mtk0">' + expected + "</span></span>");
    const info = expectedCharOffsetInPart.map((absoluteOffset) => [absoluteOffset, [0, absoluteOffset]]);
    assertCharacterMapping3(_actual.characterMapping, info);
  }
  test("replaces spaces", () => {
    assertCharacterReplacement(" ", 4, "\xA0", [0, 1]);
    assertCharacterReplacement("  ", 4, "\xA0\xA0", [0, 1, 2]);
    assertCharacterReplacement("a  b", 4, "a\xA0\xA0b", [0, 1, 2, 3, 4]);
  });
  test("escapes HTML markup", () => {
    assertCharacterReplacement("a<b", 4, "a&lt;b", [0, 1, 2, 3]);
    assertCharacterReplacement("a>b", 4, "a&gt;b", [0, 1, 2, 3]);
    assertCharacterReplacement("a&b", 4, "a&amp;b", [0, 1, 2, 3]);
  });
  test("replaces some bad characters", () => {
    assertCharacterReplacement("a\0b", 4, "a&#00;b", [0, 1, 2, 3]);
    assertCharacterReplacement("a" + String.fromCharCode(CharCode.UTF8_BOM) + "b", 4, "a\uFFFDb", [0, 1, 2, 3]);
    assertCharacterReplacement("a\u2028b", 4, "a\uFFFDb", [0, 1, 2, 3]);
  });
  test("handles tabs", () => {
    assertCharacterReplacement("	", 4, "\xA0\xA0\xA0\xA0", [0, 4]);
    assertCharacterReplacement("x	", 4, "x\xA0\xA0\xA0", [0, 1, 4]);
    assertCharacterReplacement("xx	", 4, "xx\xA0\xA0", [0, 1, 2, 4]);
    assertCharacterReplacement("xxx	", 4, "xxx\xA0", [0, 1, 2, 3, 4]);
    assertCharacterReplacement("xxxx	", 4, "xxxx\xA0\xA0\xA0\xA0", [0, 1, 2, 3, 4, 8]);
  });
  function assertParts(lineContent, tabSize, parts, expected, info) {
    const _actual = renderViewLine(createRenderLineInput({
      lineContent,
      lineTokens: createViewLineTokens(parts),
      tabSize,
      spaceWidth: 0,
      middotWidth: 0,
      wsmiddotWidth: 0
    }));
    assert.strictEqual(_actual.html, "<span>" + expected + "</span>");
    assertCharacterMapping3(_actual.characterMapping, info);
  }
  test("empty line", () => {
    assertParts("", 4, [], "<span></span>", []);
  });
  test("uses part type", () => {
    assertParts("x", 4, [createPart(1, 10)], '<span class="mtk10">x</span>', [[0, [0, 0]], [1, [0, 1]]]);
    assertParts("x", 4, [createPart(1, 20)], '<span class="mtk20">x</span>', [[0, [0, 0]], [1, [0, 1]]]);
    assertParts("x", 4, [createPart(1, 30)], '<span class="mtk30">x</span>', [[0, [0, 0]], [1, [0, 1]]]);
  });
  test("two parts", () => {
    assertParts("xy", 4, [createPart(1, 1), createPart(2, 2)], '<span class="mtk1">x</span><span class="mtk2">y</span>', [[0, [0, 0]], [1, [1, 0]], [2, [1, 1]]]);
    assertParts("xyz", 4, [createPart(1, 1), createPart(3, 2)], '<span class="mtk1">x</span><span class="mtk2">yz</span>', [[0, [0, 0]], [1, [1, 0]], [2, [1, 1]], [3, [1, 2]]]);
    assertParts("xyz", 4, [createPart(2, 1), createPart(3, 2)], '<span class="mtk1">xy</span><span class="mtk2">z</span>', [[0, [0, 0]], [1, [0, 1]], [2, [1, 0]], [3, [1, 1]]]);
  });
  test("overflow", async () => {
    const _actual = renderViewLine(createRenderLineInput({
      lineContent: "Hello world!",
      lineTokens: createViewLineTokens([
        createPart(1, 0),
        createPart(2, 1),
        createPart(3, 2),
        createPart(4, 3),
        createPart(5, 4),
        createPart(6, 5),
        createPart(7, 6),
        createPart(8, 7),
        createPart(9, 8),
        createPart(10, 9),
        createPart(11, 10),
        createPart(12, 11)
      ]),
      stopRenderingLineAfter: 6,
      renderWhitespace: "boundary"
    }));
    const inflated = inflateRenderLineOutput(_actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("typical", async () => {
    const lineContent = "	    export class Game { // http://test.com     ";
    const lineTokens = createViewLineTokens([
      createPart(5, 1),
      createPart(11, 2),
      createPart(12, 3),
      createPart(17, 4),
      createPart(18, 5),
      createPart(22, 6),
      createPart(23, 7),
      createPart(24, 8),
      createPart(25, 9),
      createPart(28, 10),
      createPart(43, 11),
      createPart(48, 12)
    ]);
    const _actual = renderViewLine(createRenderLineInput({
      lineContent,
      lineTokens,
      renderWhitespace: "boundary"
    }));
    const inflated = inflateRenderLineOutput(_actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-2255-1", async () => {
    const lineContent = "			cursorStyle:						(prevOpts.cursorStyle !== newOpts.cursorStyle),";
    const lineTokens = createViewLineTokens([
      createPart(3, 1),
      // 3 chars
      createPart(15, 2),
      // 12 chars
      createPart(21, 3),
      // 6 chars
      createPart(22, 4),
      // 1 char
      createPart(43, 5),
      // 21 chars
      createPart(45, 6),
      // 2 chars
      createPart(46, 7),
      // 1 char
      createPart(66, 8),
      // 20 chars
      createPart(67, 9),
      // 1 char
      createPart(68, 10)
      // 2 chars
    ]);
    const _actual = renderViewLine(createRenderLineInput({
      lineContent,
      lineTokens
    }));
    const inflated = inflateRenderLineOutput(_actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-2255-2", async () => {
    const lineContent = " 			cursorStyle:						(prevOpts.cursorStyle !== newOpts.cursorStyle),";
    const lineTokens = createViewLineTokens([
      createPart(4, 1),
      // 4 chars
      createPart(16, 2),
      // 12 chars
      createPart(22, 3),
      // 6 chars
      createPart(23, 4),
      // 1 char
      createPart(44, 5),
      // 21 chars
      createPart(46, 6),
      // 2 chars
      createPart(47, 7),
      // 1 char
      createPart(67, 8),
      // 20 chars
      createPart(68, 9),
      // 1 char
      createPart(69, 10)
      // 2 chars
    ]);
    const _actual = renderViewLine(createRenderLineInput({
      lineContent,
      lineTokens
    }));
    const inflated = inflateRenderLineOutput(_actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-91178", async () => {
    const lineContent = "//just a comment";
    const lineTokens = createViewLineTokens([
      createPart(16, 1)
    ]);
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      canUseHalfwidthRightwardsArrow: false,
      lineContent,
      lineTokens,
      lineDecorations: [
        new LineDecoration(13, 13, "dec1", InlineDecorationType.After),
        new LineDecoration(13, 13, "dec2", InlineDecorationType.Before)
      ]
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("monaco-280", async () => {
    const lineContent = `var \u05E7\u05D5\u05D3\u05DE\u05D5\u05EA = "\u05DE\u05D9\u05D5\u05EA\u05E8 \u05E7\u05D5\u05D3\u05DE\u05D5\u05EA \u05E6'\u05D8 \u05E9\u05DC, \u05D0\u05DD \u05DC\u05E9\u05D5\u05DF \u05D4\u05E2\u05D1\u05E8\u05D9\u05EA \u05E9\u05D9\u05E0\u05D5\u05D9\u05D9\u05DD \u05D5\u05D9\u05E9, \u05D0\u05DD";`;
    const lineTokens = createViewLineTokens([
      createPart(3, 6),
      createPart(13, 1),
      createPart(66, 20),
      createPart(67, 1)
    ]);
    const _actual = renderViewLine(createRenderLineInput({
      lineContent,
      isBasicASCII: false,
      containsRTL: true,
      lineTokens
    }));
    const inflated = inflateRenderLineOutput(_actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-137036", async () => {
    const lineContent = '<option value="\u0627\u0644\u0639\u0631\u0628\u064A\u0629">\u0627\u0644\u0639\u0631\u0628\u064A\u0629</option>';
    const lineTokens = createViewLineTokens([
      createPart(1, 2),
      createPart(7, 3),
      createPart(8, 4),
      createPart(13, 5),
      createPart(14, 4),
      createPart(23, 6),
      createPart(24, 2),
      createPart(31, 4),
      createPart(33, 2),
      createPart(39, 3),
      createPart(40, 2)
    ]);
    const _actual = renderViewLine(createRenderLineInput({
      lineContent,
      isBasicASCII: false,
      containsRTL: true,
      lineTokens
    }));
    const inflated = inflateRenderLineOutput(_actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-99589", async () => {
    const lineContent = '    ["\u{1F5A8}\uFE0F \u0686\u0627\u067E \u0641\u0627\u06A9\u062A\u0648\u0631","\u{1F3A8} \u062A\u0646\u0638\u06CC\u0645\u0627\u062A"]';
    const lineTokens = createViewLineTokens([
      createPart(5, 2),
      createPart(21, 3),
      createPart(22, 2),
      createPart(34, 3),
      createPart(35, 2)
    ]);
    const _actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent,
      isBasicASCII: false,
      containsRTL: true,
      lineTokens,
      renderWhitespace: "all"
    }));
    const inflated = inflateRenderLineOutput(_actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-260239", async () => {
    const lineContent = '<p class="myclass" title="\u0627\u0644\u0639\u0631\u0628\u064A">\u0646\u0634\u0627\u0637 \u0627\u0644\u062A\u062F\u0648\u064A\u0644!</p>';
    const lineTokens = createViewLineTokens([
      createPart(1, 1),
      // <
      createPart(2, 2),
      // p
      createPart(3, 3),
      // (space)
      createPart(8, 4),
      // class
      createPart(9, 5),
      // =
      createPart(10, 6),
      // "
      createPart(17, 7),
      // myclass
      createPart(18, 6),
      // "
      createPart(19, 3),
      // (space)
      createPart(24, 4),
      // title
      createPart(25, 5),
      // =
      createPart(26, 6),
      // "
      createPart(32, 8),
      // العربي (RTL text) - 6 Arabic characters from position 26-31
      createPart(33, 6),
      // " - closing quote at position 32
      createPart(34, 1),
      // >
      createPart(47, 9),
      // نشاط التدويل! (RTL text) - 13 characters from position 34-46
      createPart(48, 1),
      // <
      createPart(49, 2),
      // /
      createPart(50, 2),
      // p
      createPart(51, 1)
      // >
    ]);
    const _actual = renderViewLine(new RenderLineInput(
      false,
      true,
      lineContent,
      false,
      false,
      true,
      0,
      lineTokens,
      [],
      4,
      0,
      10,
      10,
      10,
      -1,
      "none",
      false,
      false,
      null,
      null,
      14
    ));
    const inflated = inflateRenderLineOutput(_actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-274604", async () => {
    const lineContent = "test.com##a:-abp-contains(\u0625)";
    const lineTokens = createViewLineTokens([
      createPart(lineContent.length, 1)
    ]);
    const actual = renderViewLine(createRenderLineInput({
      lineContent,
      isBasicASCII: false,
      containsRTL: true,
      lineTokens
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-277693", async () => {
    const lineContent = "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631: ${user.firstName}";
    const lineTokens = createViewLineTokens([
      createPart(9, 1),
      // نام کاربر (RTL string content)
      createPart(11, 1),
      // : (space)
      createPart(13, 2),
      // ${ (template expression punctuation)
      createPart(17, 3),
      // user (variable)
      createPart(18, 4),
      // . (punctuation)
      createPart(27, 3),
      // firstName (property)
      createPart(28, 2)
      // } (template expression punctuation)
    ]);
    const actual = renderViewLine(createRenderLineInput({
      lineContent,
      isBasicASCII: false,
      containsRTL: true,
      lineTokens
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-6885", async () => {
    const _lineText = "This is just a long line that contains very interesting text. This is just a long line that contains very interesting text.";
    function assertSplitsTokens(message, lineContent, expectedOutput) {
      const lineTokens = createViewLineTokens([createPart(lineContent.length, 1)]);
      const actual = renderViewLine(createRenderLineInput({
        lineContent,
        lineTokens
      }));
      assert.strictEqual(actual.html, "<span>" + expectedOutput.join("") + "</span>", message);
    }
    {
      assertSplitsTokens(
        "49 chars",
        _lineText.substr(0, 49),
        [
          '<span class="mtk1">This\xA0is\xA0just\xA0a\xA0long\xA0line\xA0that\xA0contains\xA0very\xA0inter</span>'
        ]
      );
    }
    {
      assertSplitsTokens(
        "50 chars",
        _lineText.substr(0, 50),
        [
          '<span class="mtk1">This\xA0is\xA0just\xA0a\xA0long\xA0line\xA0that\xA0contains\xA0very\xA0intere</span>'
        ]
      );
    }
    {
      assertSplitsTokens(
        "51 chars",
        _lineText.substr(0, 51),
        [
          '<span class="mtk1">This\xA0is\xA0just\xA0a\xA0long\xA0line\xA0that\xA0contains\xA0very\xA0intere</span>',
          '<span class="mtk1">s</span>'
        ]
      );
    }
    {
      assertSplitsTokens(
        "99 chars",
        _lineText.substr(0, 99),
        [
          '<span class="mtk1">This\xA0is\xA0just\xA0a\xA0long\xA0line\xA0that\xA0contains\xA0very\xA0intere</span>',
          '<span class="mtk1">sting\xA0text.\xA0This\xA0is\xA0just\xA0a\xA0long\xA0line\xA0that\xA0contain</span>'
        ]
      );
    }
    {
      assertSplitsTokens(
        "100 chars",
        _lineText.substr(0, 100),
        [
          '<span class="mtk1">This\xA0is\xA0just\xA0a\xA0long\xA0line\xA0that\xA0contains\xA0very\xA0intere</span>',
          '<span class="mtk1">sting\xA0text.\xA0This\xA0is\xA0just\xA0a\xA0long\xA0line\xA0that\xA0contains</span>'
        ]
      );
    }
    {
      assertSplitsTokens(
        "101 chars",
        _lineText.substr(0, 101),
        [
          '<span class="mtk1">This\xA0is\xA0just\xA0a\xA0long\xA0line\xA0that\xA0contains\xA0very\xA0intere</span>',
          '<span class="mtk1">sting\xA0text.\xA0This\xA0is\xA0just\xA0a\xA0long\xA0line\xA0that\xA0contains</span>',
          '<span class="mtk1">\xA0</span>'
        ]
      );
    }
  });
  test("issue-21476", async () => {
    const _lineText = "This is just a long line that contains very interesting text. This is just a long line that contains very interesting text.";
    function assertSplitsTokens(message, lineContent, expectedOutput) {
      const lineTokens = createViewLineTokens([createPart(lineContent.length, 1)]);
      const actual = renderViewLine(createRenderLineInput({
        lineContent,
        lineTokens,
        fontLigatures: true
      }));
      assert.strictEqual(actual.html, "<span>" + expectedOutput.join("") + "</span>", message);
    }
    {
      assertSplitsTokens(
        "101 chars",
        _lineText.substr(0, 101),
        [
          '<span class="mtk1">This\xA0is\xA0just\xA0a\xA0long\xA0line\xA0that\xA0contains\xA0very\xA0</span>',
          '<span class="mtk1">interesting\xA0text.\xA0This\xA0is\xA0just\xA0a\xA0long\xA0line\xA0that\xA0</span>',
          '<span class="mtk1">contains\xA0</span>'
        ]
      );
    }
  });
  test("issue-20624", async () => {
    const lineContent = "a\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}\u{20BB7}";
    const lineTokens = createViewLineTokens([createPart(lineContent.length, 1)]);
    const actual = renderViewLine(createRenderLineInput({
      lineContent,
      isBasicASCII: false,
      lineTokens
    }));
    await assertSnapshot(inflateRenderLineOutput(actual).html.join(""), HTML_EXTENSION);
  });
  test("issue-6885-rtl", async () => {
    const lineContent = "\u05D0\u05EA \u05D2\u05E8\u05DE\u05E0\u05D9\u05EA \u05D1\u05D4\u05EA\u05D9\u05D9\u05D7\u05E1\u05D5\u05EA \u05E9\u05DE\u05D5, \u05E9\u05E0\u05EA\u05D9 \u05D4\u05DE\u05E9\u05E4\u05D8 \u05D0\u05DC \u05D7\u05E4\u05E9, \u05D0\u05DD \u05DB\u05EA\u05D1 \u05D0\u05D7\u05E8\u05D9\u05DD \u05D5\u05DC\u05D7\u05D1\u05E8. \u05E9\u05DC \u05D4\u05EA\u05D5\u05DB\u05DF \u05D0\u05D5\u05D3\u05D5\u05EA \u05D1\u05D5\u05D9\u05E7\u05D9\u05E4\u05D3\u05D9\u05D4 \u05DB\u05DC\u05DC, \u05E9\u05DC \u05E2\u05D6\u05E8\u05D4 \u05DB\u05D9\u05DE\u05D9\u05D4 \u05D4\u05D9\u05D0. \u05E2\u05DC \u05E2\u05DE\u05D5\u05D3 \u05D9\u05D5\u05E6\u05E8\u05D9\u05DD \u05DE\u05D9\u05EA\u05D5\u05DC\u05D5\u05D2\u05D9\u05D4 \u05E1\u05D3\u05E8, \u05D0\u05DD \u05E9\u05DB\u05DC \u05E9\u05EA\u05E4\u05D5 \u05DC\u05E2\u05D1\u05E8\u05D9\u05EA \u05E9\u05D9\u05E0\u05D5\u05D9\u05D9\u05DD, \u05D0\u05DD \u05E9\u05D0\u05DC\u05D5\u05EA \u05D0\u05E0\u05D2\u05DC\u05D9\u05EA \u05E2\u05D6\u05D4. \u05E9\u05DE\u05D5\u05EA \u05D1\u05E7\u05DC\u05D5\u05EA \u05DE\u05D4 \u05E1\u05D3\u05E8.";
    const lineTokens = createViewLineTokens([createPart(lineContent.length, 1)]);
    const actual = renderViewLine(createRenderLineInput({
      lineContent,
      isBasicASCII: false,
      containsRTL: true,
      lineTokens
    }));
    await assertSnapshot(actual.html, HTML_EXTENSION);
  });
  test("issue-95685", async () => {
    const lineContent = 'var ftext = [\u2029"Und", "dann", "eines"];';
    const lineTokens = createViewLineTokens([createPart(lineContent.length, 1)]);
    const actual = renderViewLine(createRenderLineInput({
      lineContent,
      isBasicASCII: false,
      lineTokens
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-19673", async () => {
    const lineContent = "    MongoCallback<string>): void {";
    const lineTokens = createViewLineTokens([
      createPart(17, 1),
      createPart(18, 2),
      createPart(24, 3),
      createPart(26, 4),
      createPart(27, 5),
      createPart(28, 6),
      createPart(32, 7),
      createPart(34, 8)
    ]);
    const _actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent,
      fauxIndentLength: 4,
      lineTokens
    }));
    const inflated = inflateRenderLineOutput(_actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
});
function assertCharacterMapping3(actual, expectedInfo) {
  for (let i = 0; i < expectedInfo.length; i++) {
    const [horizontalOffset, [partIndex, charIndex]] = expectedInfo[i];
    const actualDomPosition = actual.getDomPosition(i + 1);
    assert.deepStrictEqual(actualDomPosition, new DomPosition(partIndex, charIndex), `getDomPosition(${i + 1})`);
    let partLength = charIndex + 1;
    for (let j = i + 1; j < expectedInfo.length; j++) {
      const [, [nextPartIndex, nextCharIndex]] = expectedInfo[j];
      if (nextPartIndex === partIndex) {
        partLength = nextCharIndex + 1;
      } else {
        break;
      }
    }
    const actualColumn = actual.getColumn(new DomPosition(partIndex, charIndex), partLength);
    assert.strictEqual(actualColumn, i + 1, `actual.getColumn(${partIndex}, ${charIndex})`);
    const actualHorizontalOffset = actual.getHorizontalOffset(i + 1);
    assert.strictEqual(actualHorizontalOffset, horizontalOffset, `actual.getHorizontalOffset(${i + 1})`);
  }
  assert.strictEqual(actual.length, expectedInfo.length, `length mismatch`);
}
suite("renderViewLine2", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function testCreateLineParts(fontIsMonospace, lineContent, tokens, fauxIndentLength, renderWhitespace, selections) {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: fontIsMonospace,
      lineContent,
      fauxIndentLength,
      lineTokens: createViewLineTokens(tokens),
      renderWhitespace,
      selectionsOnLine: selections
    }));
    return inflateRenderLineOutput(actual);
  }
  test("issue-18616", async () => {
    const lineContent = "https://microsoft.com";
    const actual = renderViewLine(createRenderLineInput({
      lineContent,
      lineTokens: createViewLineTokens([createPart(21, 3)]),
      lineDecorations: [new LineDecoration(1, 22, "link", InlineDecorationType.Regular)]
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-19207", async () => {
    const lineContent = "'let url = `http://***/_api/web/lists/GetByTitle(\\'Teambuildingaanvragen\\')/items`;'";
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent,
      lineTokens: createViewLineTokens([
        createPart(49, 6),
        createPart(51, 4),
        createPart(72, 6),
        createPart(74, 4),
        createPart(84, 6)
      ]),
      lineDecorations: [
        new LineDecoration(13, 51, "detected-link", InlineDecorationType.Regular)
      ]
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("simple", async () => {
    const actual = testCreateLineParts(
      false,
      "Hello world!",
      [
        createPart(12, 1)
      ],
      0,
      "none",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("two-tokens", async () => {
    const actual = testCreateLineParts(
      false,
      "Hello world!",
      [
        createPart(6, 1),
        createPart(12, 2)
      ],
      0,
      "none",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-4-leading", async () => {
    const actual = testCreateLineParts(
      false,
      "    Hello world!    ",
      [
        createPart(4, 1),
        createPart(6, 2),
        createPart(20, 3)
      ],
      0,
      "boundary",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-8-leading", async () => {
    const actual = testCreateLineParts(
      false,
      "        Hello world!        ",
      [
        createPart(8, 1),
        createPart(10, 2),
        createPart(28, 3)
      ],
      0,
      "boundary",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-2-tabs", async () => {
    const actual = testCreateLineParts(
      false,
      "		Hello world!	",
      [
        createPart(2, 1),
        createPart(4, 2),
        createPart(15, 3)
      ],
      0,
      "boundary",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-mixed", async () => {
    const actual = testCreateLineParts(
      false,
      "  		  Hello world! 	  	   	    ",
      [
        createPart(6, 1),
        createPart(8, 2),
        createPart(31, 3)
      ],
      0,
      "boundary",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-faux-indent", async () => {
    const actual = testCreateLineParts(
      false,
      "		  Hello world! 	  	   	    ",
      [
        createPart(4, 1),
        createPart(6, 2),
        createPart(29, 3)
      ],
      2,
      "boundary",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-monospace", async () => {
    const actual = testCreateLineParts(
      true,
      "		  Hello world! 	  	   	    ",
      [
        createPart(4, 1),
        createPart(6, 2),
        createPart(29, 3)
      ],
      2,
      "boundary",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-middle", async () => {
    const actual = testCreateLineParts(
      false,
      "it  it it  it",
      [
        createPart(6, 1),
        createPart(7, 2),
        createPart(13, 3)
      ],
      0,
      "boundary",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-all-middle", async () => {
    const actual = testCreateLineParts(
      false,
      " Hello world!	",
      [
        createPart(4, 0),
        createPart(6, 1),
        createPart(14, 2)
      ],
      0,
      "all",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-sel-none", async () => {
    const actual = testCreateLineParts(
      false,
      " Hello world!	",
      [
        createPart(4, 0),
        createPart(6, 1),
        createPart(14, 2)
      ],
      0,
      "selection",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-sel-whole", async () => {
    const actual = testCreateLineParts(
      false,
      " Hello world!	",
      [
        createPart(4, 0),
        createPart(6, 1),
        createPart(14, 2)
      ],
      0,
      "selection",
      [new OffsetRange(0, 14)]
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-sel-partial", async () => {
    const actual = testCreateLineParts(
      false,
      " Hello world!	",
      [
        createPart(4, 0),
        createPart(6, 1),
        createPart(14, 2)
      ],
      0,
      "selection",
      [new OffsetRange(0, 5)]
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-sel-multiple", async () => {
    const actual = testCreateLineParts(
      false,
      " Hello world!	",
      [
        createPart(4, 0),
        createPart(6, 1),
        createPart(14, 2)
      ],
      0,
      "selection",
      [new OffsetRange(0, 5), new OffsetRange(9, 14)]
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-sel-unsorted", async () => {
    const actual = testCreateLineParts(
      false,
      " Hello world!	",
      [
        createPart(4, 0),
        createPart(6, 1),
        createPart(14, 2)
      ],
      0,
      "selection",
      [new OffsetRange(9, 14), new OffsetRange(0, 5)]
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-sel-adjacent", async () => {
    const actual = testCreateLineParts(
      false,
      " * S",
      [
        createPart(4, 0)
      ],
      0,
      "selection",
      [new OffsetRange(0, 1), new OffsetRange(1, 2), new OffsetRange(2, 3)]
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-trail-no-trail", async () => {
    const actual = testCreateLineParts(
      false,
      " Hello world!",
      [
        createPart(4, 0),
        createPart(6, 1),
        createPart(14, 2)
      ],
      0,
      "trailing",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-trail-with-trail", async () => {
    const actual = testCreateLineParts(
      false,
      " Hello world! 	",
      [
        createPart(4, 0),
        createPart(6, 1),
        createPart(15, 2)
      ],
      0,
      "trailing",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-trail-8-8", async () => {
    const actual = testCreateLineParts(
      false,
      "        Hello world!        ",
      [
        createPart(8, 1),
        createPart(10, 2),
        createPart(28, 3)
      ],
      0,
      "trailing",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("ws-trail-only", async () => {
    const actual = testCreateLineParts(
      false,
      " 	 ",
      [
        createPart(2, 0),
        createPart(3, 1)
      ],
      0,
      "trailing",
      null
    );
    await assertSnapshot(actual.html.join(""), HTML_EXTENSION);
    await assertSnapshot(actual.mapping);
  });
  test("unsorted-deco", async () => {
    const actual = renderViewLine(createRenderLineInput({
      lineContent: "Hello world",
      lineTokens: createViewLineTokens([createPart(11, 0)]),
      lineDecorations: [
        new LineDecoration(5, 7, "a", InlineDecorationType.Regular),
        new LineDecoration(1, 3, "b", InlineDecorationType.Regular),
        new LineDecoration(2, 8, "c", InlineDecorationType.Regular)
      ]
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-11485", async () => {
    const lineContent = "	bla";
    const actual = renderViewLine(createRenderLineInput({
      lineContent,
      lineTokens: createViewLineTokens([createPart(4, 3)]),
      lineDecorations: [new LineDecoration(1, 2, "before", InlineDecorationType.Before)],
      renderWhitespace: "all",
      fontLigatures: true
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-32436", async () => {
    const lineContent = "	bla";
    const actual = renderViewLine(createRenderLineInput({
      lineContent,
      lineTokens: createViewLineTokens([createPart(4, 3)]),
      lineDecorations: [new LineDecoration(2, 3, "before", InlineDecorationType.Before)],
      renderWhitespace: "all",
      fontLigatures: true
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-30133", async () => {
    const lineContent = "";
    const actual = renderViewLine(createRenderLineInput({
      lineContent,
      lineTokens: createViewLineTokens([createPart(0, 3)]),
      lineDecorations: [new LineDecoration(1, 2, "before", InlineDecorationType.Before)],
      renderWhitespace: "all",
      fontLigatures: true
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-37208", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent: "  1. \u{1F64F}",
      isBasicASCII: false,
      lineTokens: createViewLineTokens([createPart(7, 3)]),
      lineDecorations: [new LineDecoration(7, 8, "inline-folded", InlineDecorationType.After)],
      tabSize: 2,
      stopRenderingLineAfter: 1e4
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-37401", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent: "",
      lineTokens: createViewLineTokens([createPart(0, 3)]),
      lineDecorations: [
        new LineDecoration(1, 1, "before", InlineDecorationType.Before),
        new LineDecoration(1, 1, "after", InlineDecorationType.After)
      ],
      tabSize: 2,
      stopRenderingLineAfter: 1e4
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-118759", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent: "",
      lineTokens: createViewLineTokens([createPart(0, 3)]),
      lineDecorations: [
        new LineDecoration(1, 1, "after1", InlineDecorationType.After),
        new LineDecoration(1, 1, "after2", InlineDecorationType.After),
        new LineDecoration(1, 1, "before1", InlineDecorationType.Before),
        new LineDecoration(1, 1, "before2", InlineDecorationType.Before)
      ],
      tabSize: 2,
      stopRenderingLineAfter: 1e4
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-38935", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent: "	}",
      lineTokens: createViewLineTokens([createPart(2, 3)]),
      lineDecorations: [
        new LineDecoration(3, 3, "ced-TextEditorDecorationType2-5e9b9b3f-3 ced-TextEditorDecorationType2-3", InlineDecorationType.Before),
        new LineDecoration(3, 3, "ced-TextEditorDecorationType2-5e9b9b3f-4 ced-TextEditorDecorationType2-4", InlineDecorationType.After)
      ],
      stopRenderingLineAfter: 1e4
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-136622", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent: "some text \xA3",
      isBasicASCII: false,
      lineTokens: createViewLineTokens([createPart(11, 3)]),
      lineDecorations: [
        new LineDecoration(5, 5, "inlineDec1", InlineDecorationType.After),
        new LineDecoration(6, 6, "inlineDec2", InlineDecorationType.Before)
      ],
      stopRenderingLineAfter: 1e4,
      renderControlCharacters: true
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-22832-1", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent: 'asd = "\u64E6"		#asd',
      isBasicASCII: false,
      lineTokens: createViewLineTokens([createPart(15, 3)]),
      stopRenderingLineAfter: 1e4
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-22832-2", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent: 'asd = "\u64E6"		#asd',
      isBasicASCII: false,
      lineTokens: createViewLineTokens([createPart(15, 3)]),
      stopRenderingLineAfter: 1e4,
      renderWhitespace: "all"
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-22352-1", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent: "12345689012345678901234568901234567890123456890aba\u0301ba",
      isBasicASCII: false,
      lineTokens: createViewLineTokens([createPart(53, 3)]),
      stopRenderingLineAfter: 1e4
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-22352-2", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent: " JoyShare\u0BB2\u0BCD \u0BAA\u0BBF\u0BA9\u0BCD\u0BA4\u0BCA\u0B9F\u0BB0\u0BCD\u0BA8\u0BCD\u0BA4\u0BC1, \u0BB5\u0BBF\u0B9F\u0BC0\u0BAF\u0BCB, \u0B9C\u0BCB\u0B95\u0BCD\u0B95\u0BC1\u0B95\u0BB3\u0BCD, \u0B85\u0BA9\u0BBF\u0BAE\u0BC7\u0B9A\u0BA9\u0BCD, \u0BA8\u0B95\u0BC8\u0B9A\u0BCD\u0B9A\u0BC1\u0BB5\u0BC8 \u0BAA\u0B9F\u0B99\u0BCD\u0B95\u0BB3\u0BCD \u0BAE\u0BB1\u0BCD\u0BB1\u0BC1\u0BAE\u0BCD \u0B9A\u0BC6\u0BAF\u0BCD\u0BA4\u0BBF\u0B95\u0BB3\u0BC8 \u0BAA\u0BC6\u0BB1\u0BC1\u0BB5\u0BC0\u0BB0\u0BCD",
      isBasicASCII: false,
      lineTokens: createViewLineTokens([createPart(100, 3)]),
      stopRenderingLineAfter: 1e4
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-42700", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent: " \u0935\u094B \u0910\u0938\u093E \u0915\u094D\u092F\u093E \u0939\u0948 \u091C\u094B \u0939\u092E\u093E\u0930\u0947 \u0905\u0902\u0926\u0930 \u092D\u0940 \u0939\u0948 \u0914\u0930 \u092C\u093E\u0939\u0930 \u092D\u0940 \u0939\u0948\u0964 \u091C\u093F\u0938\u0915\u0940 \u0935\u091C\u0939 \u0938\u0947 \u0939\u092E \u0938\u092C \u0939\u0948\u0902\u0964 \u091C\u093F\u0938\u0928\u0947 \u0907\u0938 \u0938\u0943\u0937\u094D\u091F\u093F \u0915\u0940 \u0930\u091A\u0928\u093E \u0915\u0940 \u0939\u0948\u0964",
      isBasicASCII: false,
      lineTokens: createViewLineTokens([createPart(105, 3)]),
      stopRenderingLineAfter: 1e4
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-38123", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      lineContent: "This is a long line which never uses more than two spaces. ",
      continuesWithWrappedLine: true,
      lineTokens: createViewLineTokens([createPart(59, 3)]),
      stopRenderingLineAfter: 1e4,
      renderWhitespace: "boundary"
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-33525-1", async () => {
    const actual = renderViewLine(createRenderLineInput({
      canUseHalfwidthRightwardsArrow: false,
      lineContent: "append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to append data to",
      lineTokens: createViewLineTokens([createPart(194, 3)]),
      stopRenderingLineAfter: 1e4,
      fontLigatures: true
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-33525-2", async () => {
    const actual = renderViewLine(createRenderLineInput({
      canUseHalfwidthRightwardsArrow: false,
      lineContent: "appenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatatoappenddatato",
      lineTokens: createViewLineTokens([createPart(194, 3)]),
      stopRenderingLineAfter: 1e4,
      fontLigatures: true
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-91936", async () => {
    const actual = renderViewLine(createRenderLineInput({
      lineContent: "                    else if ($s = 08) then '\\b'",
      lineTokens: createViewLineTokens([
        createPart(20, 1),
        createPart(24, 15),
        createPart(25, 1),
        createPart(27, 15),
        createPart(28, 1),
        createPart(29, 1),
        createPart(29, 1),
        createPart(31, 16),
        createPart(32, 1),
        createPart(33, 1),
        createPart(34, 1),
        createPart(36, 6),
        createPart(36, 1),
        createPart(37, 1),
        createPart(38, 1),
        createPart(42, 15),
        createPart(43, 1),
        createPart(47, 11)
      ]),
      stopRenderingLineAfter: 1e4,
      renderWhitespace: "selection",
      selectionsOnLine: [new OffsetRange(0, 47)],
      middotWidth: 11,
      wsmiddotWidth: 11
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-119416", async () => {
    const actual = renderViewLine(createRenderLineInput({
      canUseHalfwidthRightwardsArrow: false,
      lineContent: "[" + String.fromCharCode(127) + "] [" + String.fromCharCode(0) + "]",
      lineTokens: createViewLineTokens([createPart(7, 3)]),
      stopRenderingLineAfter: 1e4,
      renderControlCharacters: true,
      fontLigatures: true
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-116939", async () => {
    const actual = renderViewLine(createRenderLineInput({
      canUseHalfwidthRightwardsArrow: false,
      lineContent: `transferBalance(5678,${String.fromCharCode(8238)}6776,4321${String.fromCharCode(8236)},"USD");`,
      isBasicASCII: false,
      lineTokens: createViewLineTokens([createPart(42, 3)]),
      stopRenderingLineAfter: 1e4,
      renderControlCharacters: true
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  test("issue-124038", async () => {
    const actual = renderViewLine(createRenderLineInput({
      useMonospaceOptimizations: true,
      canUseHalfwidthRightwardsArrow: false,
      lineContent: "    if",
      lineTokens: createViewLineTokens([createPart(4, 1), createPart(6, 2)]),
      lineDecorations: [
        new LineDecoration(7, 7, "ced-1-TextEditorDecorationType2-17c14d98-3 ced-1-TextEditorDecorationType2-3", InlineDecorationType.Before),
        new LineDecoration(7, 7, "ced-1-TextEditorDecorationType2-17c14d98-4 ced-1-TextEditorDecorationType2-4", InlineDecorationType.After),
        new LineDecoration(7, 7, "ced-ghost-text-1-4", InlineDecorationType.After)
      ],
      stopRenderingLineAfter: 1e4,
      renderWhitespace: "all"
    }));
    const inflated = inflateRenderLineOutput(actual);
    await assertSnapshot(inflated.html.join(""), HTML_EXTENSION);
    await assertSnapshot(inflated.mapping);
  });
  function createTestGetColumnOfLinePartOffset(lineContent, tabSize, parts, expectedPartLengths) {
    const renderLineOutput = renderViewLine(createRenderLineInput({
      lineContent,
      tabSize,
      lineTokens: createViewLineTokens(parts)
    }));
    return (partIndex, partLength, offset, expected) => {
      const actualColumn = renderLineOutput.characterMapping.getColumn(new DomPosition(partIndex, offset), partLength);
      assert.strictEqual(actualColumn, expected, "getColumn for " + partIndex + ", " + offset);
    };
  }
  test("getColumnOfLinePartOffset 1 - simple text", () => {
    const testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset(
      "hello world",
      4,
      [
        createPart(11, 1)
      ],
      [11]
    );
    testGetColumnOfLinePartOffset(0, 11, 0, 1);
    testGetColumnOfLinePartOffset(0, 11, 1, 2);
    testGetColumnOfLinePartOffset(0, 11, 2, 3);
    testGetColumnOfLinePartOffset(0, 11, 3, 4);
    testGetColumnOfLinePartOffset(0, 11, 4, 5);
    testGetColumnOfLinePartOffset(0, 11, 5, 6);
    testGetColumnOfLinePartOffset(0, 11, 6, 7);
    testGetColumnOfLinePartOffset(0, 11, 7, 8);
    testGetColumnOfLinePartOffset(0, 11, 8, 9);
    testGetColumnOfLinePartOffset(0, 11, 9, 10);
    testGetColumnOfLinePartOffset(0, 11, 10, 11);
    testGetColumnOfLinePartOffset(0, 11, 11, 12);
  });
  test("getColumnOfLinePartOffset 2 - regular JS", () => {
    const testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset(
      "var x = 3;",
      4,
      [
        createPart(3, 1),
        createPart(4, 2),
        createPart(5, 3),
        createPart(8, 4),
        createPart(9, 5),
        createPart(10, 6)
      ],
      [3, 1, 1, 3, 1, 1]
    );
    testGetColumnOfLinePartOffset(0, 3, 0, 1);
    testGetColumnOfLinePartOffset(0, 3, 1, 2);
    testGetColumnOfLinePartOffset(0, 3, 2, 3);
    testGetColumnOfLinePartOffset(0, 3, 3, 4);
    testGetColumnOfLinePartOffset(1, 1, 0, 4);
    testGetColumnOfLinePartOffset(1, 1, 1, 5);
    testGetColumnOfLinePartOffset(2, 1, 0, 5);
    testGetColumnOfLinePartOffset(2, 1, 1, 6);
    testGetColumnOfLinePartOffset(3, 3, 0, 6);
    testGetColumnOfLinePartOffset(3, 3, 1, 7);
    testGetColumnOfLinePartOffset(3, 3, 2, 8);
    testGetColumnOfLinePartOffset(3, 3, 3, 9);
    testGetColumnOfLinePartOffset(4, 1, 0, 9);
    testGetColumnOfLinePartOffset(4, 1, 1, 10);
    testGetColumnOfLinePartOffset(5, 1, 0, 10);
    testGetColumnOfLinePartOffset(5, 1, 1, 11);
  });
  test("getColumnOfLinePartOffset 3 - tab with tab size 6", () => {
    const testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset(
      "	",
      6,
      [
        createPart(1, 1)
      ],
      [6]
    );
    testGetColumnOfLinePartOffset(0, 6, 0, 1);
    testGetColumnOfLinePartOffset(0, 6, 1, 1);
    testGetColumnOfLinePartOffset(0, 6, 2, 1);
    testGetColumnOfLinePartOffset(0, 6, 3, 1);
    testGetColumnOfLinePartOffset(0, 6, 4, 2);
    testGetColumnOfLinePartOffset(0, 6, 5, 2);
    testGetColumnOfLinePartOffset(0, 6, 6, 2);
  });
  test("getColumnOfLinePartOffset 4 - once indented line, tab size 4", () => {
    const testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset(
      "	function",
      4,
      [
        createPart(1, 1),
        createPart(9, 2)
      ],
      [4, 8]
    );
    testGetColumnOfLinePartOffset(0, 4, 0, 1);
    testGetColumnOfLinePartOffset(0, 4, 1, 1);
    testGetColumnOfLinePartOffset(0, 4, 2, 1);
    testGetColumnOfLinePartOffset(0, 4, 3, 2);
    testGetColumnOfLinePartOffset(0, 4, 4, 2);
    testGetColumnOfLinePartOffset(1, 8, 0, 2);
    testGetColumnOfLinePartOffset(1, 8, 1, 3);
    testGetColumnOfLinePartOffset(1, 8, 2, 4);
    testGetColumnOfLinePartOffset(1, 8, 3, 5);
    testGetColumnOfLinePartOffset(1, 8, 4, 6);
    testGetColumnOfLinePartOffset(1, 8, 5, 7);
    testGetColumnOfLinePartOffset(1, 8, 6, 8);
    testGetColumnOfLinePartOffset(1, 8, 7, 9);
    testGetColumnOfLinePartOffset(1, 8, 8, 10);
  });
  test("getColumnOfLinePartOffset 5 - twice indented line, tab size 4", () => {
    const testGetColumnOfLinePartOffset = createTestGetColumnOfLinePartOffset(
      "		function",
      4,
      [
        createPart(2, 1),
        createPart(10, 2)
      ],
      [8, 8]
    );
    testGetColumnOfLinePartOffset(0, 8, 0, 1);
    testGetColumnOfLinePartOffset(0, 8, 1, 1);
    testGetColumnOfLinePartOffset(0, 8, 2, 1);
    testGetColumnOfLinePartOffset(0, 8, 3, 2);
    testGetColumnOfLinePartOffset(0, 8, 4, 2);
    testGetColumnOfLinePartOffset(0, 8, 5, 2);
    testGetColumnOfLinePartOffset(0, 8, 6, 2);
    testGetColumnOfLinePartOffset(0, 8, 7, 3);
    testGetColumnOfLinePartOffset(0, 8, 8, 3);
    testGetColumnOfLinePartOffset(1, 8, 0, 3);
    testGetColumnOfLinePartOffset(1, 8, 1, 4);
    testGetColumnOfLinePartOffset(1, 8, 2, 5);
    testGetColumnOfLinePartOffset(1, 8, 3, 6);
    testGetColumnOfLinePartOffset(1, 8, 4, 7);
    testGetColumnOfLinePartOffset(1, 8, 5, 8);
    testGetColumnOfLinePartOffset(1, 8, 6, 9);
    testGetColumnOfLinePartOffset(1, 8, 7, 10);
    testGetColumnOfLinePartOffset(1, 8, 8, 11);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGNvbW1vblxcdmlld0xheW91dFxcdmlld0xpbmVSZW5kZXJlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgKiBhcyBzdHJpbmdzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgYXNzZXJ0U25hcHNob3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3NuYXBzaG90LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgTWV0YWRhdGFDb25zdHMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZW5jb2RlZFRva2VuQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBJVmlld0xpbmVUb2tlbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdG9rZW5zL2xpbmVUb2tlbnMuanMnO1xuaW1wb3J0IHsgTGluZURlY29yYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld0xheW91dC9saW5lRGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhcmFjdGVyTWFwcGluZywgRG9tUG9zaXRpb24sIElSZW5kZXJMaW5lSW5wdXRPcHRpb25zLCBSZW5kZXJMaW5lSW5wdXQsIFJlbmRlckxpbmVPdXRwdXQyLCByZW5kZXJWaWV3TGluZTIgYXMgcmVuZGVyVmlld0xpbmUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld0xheW91dC92aWV3TGluZVJlbmRlcmVyLmpzJztcbmltcG9ydCB7IElubGluZURlY29yYXRpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC9pbmxpbmVEZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBUZXN0TGluZVRva2VuLCBUZXN0TGluZVRva2VucyB9IGZyb20gJy4uL2NvcmUvdGVzdExpbmVUb2tlbi5qcyc7XG5cbmNvbnN0IEhUTUxfRVhURU5TSU9OID0geyBleHRlbnNpb246ICdodG1sJyB9O1xuXG5mdW5jdGlvbiBjcmVhdGVWaWV3TGluZVRva2Vucyh2aWV3TGluZVRva2VuczogVGVzdExpbmVUb2tlbltdKTogSVZpZXdMaW5lVG9rZW5zIHtcblx0cmV0dXJuIG5ldyBUZXN0TGluZVRva2Vucyh2aWV3TGluZVRva2Vucyk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVBhcnQoZW5kSW5kZXg6IG51bWJlciwgZm9yZWdyb3VuZDogbnVtYmVyKTogVGVzdExpbmVUb2tlbiB7XG5cdHJldHVybiBuZXcgVGVzdExpbmVUb2tlbihlbmRJbmRleCwgKFxuXHRcdGZvcmVncm91bmQgPDwgTWV0YWRhdGFDb25zdHMuRk9SRUdST1VORF9PRkZTRVRcblx0KSA+Pj4gMCk7XG59XG5cbmZ1bmN0aW9uIGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KHJlbmRlckxpbmVPdXRwdXQ6IFJlbmRlckxpbmVPdXRwdXQyKSB7XG5cdC8vIHJlbW92ZSBlbmNvbXBhc3NpbmcgPHNwYW4+IHRvIHNpbXBsaWZ5IHRlc3Qgd3JpdGluZy5cblx0bGV0IGh0bWwgPSByZW5kZXJMaW5lT3V0cHV0Lmh0bWw7XG5cdGlmIChodG1sLnN0YXJ0c1dpdGgoJzxzcGFuPicpKSB7XG5cdFx0aHRtbCA9IGh0bWwucmVwbGFjZSgvXjxzcGFuPi8sICcnKTtcblx0fVxuXHRodG1sID0gaHRtbC5yZXBsYWNlKC88XFwvc3Bhbj4kLywgJycpO1xuXHRjb25zdCBzcGFuczogc3RyaW5nW10gPSBbXTtcblx0bGV0IGxhc3RJbmRleCA9IDA7XG5cdGRvIHtcblx0XHRjb25zdCBuZXdJbmRleCA9IGh0bWwuaW5kZXhPZignPHNwYW4nLCBsYXN0SW5kZXggKyAxKTtcblx0XHRpZiAobmV3SW5kZXggPT09IC0xKSB7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdFx0c3BhbnMucHVzaChodG1sLnN1YnN0cmluZyhsYXN0SW5kZXgsIG5ld0luZGV4KSk7XG5cdFx0bGFzdEluZGV4ID0gbmV3SW5kZXg7XG5cdH0gd2hpbGUgKHRydWUpO1xuXHRzcGFucy5wdXNoKGh0bWwuc3Vic3RyaW5nKGxhc3RJbmRleCkpO1xuXG5cdHJldHVybiB7XG5cdFx0aHRtbDogc3BhbnMsXG5cdFx0bWFwcGluZzogcmVuZGVyTGluZU91dHB1dC5jaGFyYWN0ZXJNYXBwaW5nLmluZmxhdGUoKSxcblx0fTtcbn1cblxudHlwZSBJUmVsYXhlZFJlbmRlckxpbmVJbnB1dE9wdGlvbnMgPSBQYXJ0aWFsPElSZW5kZXJMaW5lSW5wdXRPcHRpb25zPjtcblxuY29uc3QgZGVmYXVsdFJlbmRlckxpbmVJbnB1dE9wdGlvbnM6IElSZW5kZXJMaW5lSW5wdXRPcHRpb25zID0ge1xuXHR1c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zOiBmYWxzZSxcblx0Y2FuVXNlSGFsZndpZHRoUmlnaHR3YXJkc0Fycm93OiB0cnVlLFxuXHRsaW5lQ29udGVudDogJycsXG5cdGNvbnRpbnVlc1dpdGhXcmFwcGVkTGluZTogZmFsc2UsXG5cdGlzQmFzaWNBU0NJSTogdHJ1ZSxcblx0Y29udGFpbnNSVEw6IGZhbHNlLFxuXHRmYXV4SW5kZW50TGVuZ3RoOiAwLFxuXHRsaW5lVG9rZW5zOiBjcmVhdGVWaWV3TGluZVRva2VucyhbXSksXG5cdGxpbmVEZWNvcmF0aW9uczogW10sXG5cdHRhYlNpemU6IDQsXG5cdHN0YXJ0VmlzaWJsZUNvbHVtbjogMCxcblx0c3BhY2VXaWR0aDogMTAsXG5cdG1pZGRvdFdpZHRoOiAxMCxcblx0d3NtaWRkb3RXaWR0aDogMTAsXG5cdHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXI6IC0xLFxuXHRyZW5kZXJXaGl0ZXNwYWNlOiAnbm9uZScsXG5cdHJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzOiBmYWxzZSxcblx0Zm9udExpZ2F0dXJlczogZmFsc2UsXG5cdHNlbGVjdGlvbnNPbkxpbmU6IG51bGwsXG5cdHRleHREaXJlY3Rpb246IG51bGwsXG5cdHZlcnRpY2FsU2Nyb2xsYmFyU2l6ZTogMTQsXG5cdHJlbmRlck5ld0xpbmVXaGVuRW1wdHk6IGZhbHNlXG59O1xuXG5mdW5jdGlvbiBjcmVhdGVSZW5kZXJMaW5lSW5wdXRPcHRpb25zKG9wdHM6IElSZWxheGVkUmVuZGVyTGluZUlucHV0T3B0aW9ucyk6IElSZW5kZXJMaW5lSW5wdXRPcHRpb25zIHtcblx0cmV0dXJuIHtcblx0XHQuLi5kZWZhdWx0UmVuZGVyTGluZUlucHV0T3B0aW9ucyxcblx0XHQuLi5vcHRzXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVJlbmRlckxpbmVJbnB1dChvcHRzOiBJUmVsYXhlZFJlbmRlckxpbmVJbnB1dE9wdGlvbnMpOiBSZW5kZXJMaW5lSW5wdXQge1xuXHRjb25zdCBvcHRpb25zID0gY3JlYXRlUmVuZGVyTGluZUlucHV0T3B0aW9ucyhvcHRzKTtcblx0cmV0dXJuIG5ldyBSZW5kZXJMaW5lSW5wdXQoXG5cdFx0b3B0aW9ucy51c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zLFxuXHRcdG9wdGlvbnMuY2FuVXNlSGFsZndpZHRoUmlnaHR3YXJkc0Fycm93LFxuXHRcdG9wdGlvbnMubGluZUNvbnRlbnQsXG5cdFx0b3B0aW9ucy5jb250aW51ZXNXaXRoV3JhcHBlZExpbmUsXG5cdFx0b3B0aW9ucy5pc0Jhc2ljQVNDSUksXG5cdFx0b3B0aW9ucy5jb250YWluc1JUTCxcblx0XHRvcHRpb25zLmZhdXhJbmRlbnRMZW5ndGgsXG5cdFx0b3B0aW9ucy5saW5lVG9rZW5zLFxuXHRcdG9wdGlvbnMubGluZURlY29yYXRpb25zLFxuXHRcdG9wdGlvbnMudGFiU2l6ZSxcblx0XHRvcHRpb25zLnN0YXJ0VmlzaWJsZUNvbHVtbixcblx0XHRvcHRpb25zLnNwYWNlV2lkdGgsXG5cdFx0b3B0aW9ucy5taWRkb3RXaWR0aCxcblx0XHRvcHRpb25zLndzbWlkZG90V2lkdGgsXG5cdFx0b3B0aW9ucy5zdG9wUmVuZGVyaW5nTGluZUFmdGVyLFxuXHRcdG9wdGlvbnMucmVuZGVyV2hpdGVzcGFjZSxcblx0XHRvcHRpb25zLnJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzLFxuXHRcdG9wdGlvbnMuZm9udExpZ2F0dXJlcyxcblx0XHRvcHRpb25zLnNlbGVjdGlvbnNPbkxpbmUsXG5cdFx0b3B0aW9ucy50ZXh0RGlyZWN0aW9uLFxuXHRcdG9wdGlvbnMudmVydGljYWxTY3JvbGxiYXJTaXplLFxuXHRcdG9wdGlvbnMucmVuZGVyTmV3TGluZVdoZW5FbXB0eVxuXHQpO1xufVxuXG5zdWl0ZSgncmVuZGVyVmlld0xpbmUnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gYXNzZXJ0Q2hhcmFjdGVyUmVwbGFjZW1lbnQobGluZUNvbnRlbnQ6IHN0cmluZywgdGFiU2l6ZTogbnVtYmVyLCBleHBlY3RlZDogc3RyaW5nLCBleHBlY3RlZENoYXJPZmZzZXRJblBhcnQ6IG51bWJlcltdKTogdm9pZCB7XG5cdFx0Y29uc3QgX2FjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHRsaW5lQ29udGVudCxcblx0XHRcdGlzQmFzaWNBU0NJSTogc3RyaW5ncy5pc0Jhc2ljQVNDSUkobGluZUNvbnRlbnQpLFxuXHRcdFx0bGluZVRva2VuczogY3JlYXRlVmlld0xpbmVUb2tlbnMoW25ldyBUZXN0TGluZVRva2VuKGxpbmVDb250ZW50Lmxlbmd0aCwgMCldKSxcblx0XHRcdHRhYlNpemUsXG5cdFx0XHRzcGFjZVdpZHRoOiAwLFxuXHRcdFx0bWlkZG90V2lkdGg6IDAsXG5cdFx0XHR3c21pZGRvdFdpZHRoOiAwXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKF9hY3R1YWwuaHRtbCwgJzxzcGFuPjxzcGFuIGNsYXNzPVwibXRrMFwiPicgKyBleHBlY3RlZCArICc8L3NwYW4+PC9zcGFuPicpO1xuXHRcdGNvbnN0IGluZm8gPSBleHBlY3RlZENoYXJPZmZzZXRJblBhcnQubWFwPENoYXJhY3Rlck1hcHBpbmdJbmZvPigoYWJzb2x1dGVPZmZzZXQpID0+IFthYnNvbHV0ZU9mZnNldCwgWzAsIGFic29sdXRlT2Zmc2V0XV0pO1xuXHRcdGFzc2VydENoYXJhY3Rlck1hcHBpbmczKF9hY3R1YWwuY2hhcmFjdGVyTWFwcGluZywgaW5mbyk7XG5cdH1cblxuXHR0ZXN0KCdyZXBsYWNlcyBzcGFjZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0Q2hhcmFjdGVyUmVwbGFjZW1lbnQoJyAnLCA0LCAnXFx1MDBhMCcsIFswLCAxXSk7XG5cdFx0YXNzZXJ0Q2hhcmFjdGVyUmVwbGFjZW1lbnQoJyAgJywgNCwgJ1xcdTAwYTBcXHUwMGEwJywgWzAsIDEsIDJdKTtcblx0XHRhc3NlcnRDaGFyYWN0ZXJSZXBsYWNlbWVudCgnYSAgYicsIDQsICdhXFx1MDBhMFxcdTAwYTBiJywgWzAsIDEsIDIsIDMsIDRdKTtcblx0fSk7XG5cblx0dGVzdCgnZXNjYXBlcyBIVE1MIG1hcmt1cCcsICgpID0+IHtcblx0XHRhc3NlcnRDaGFyYWN0ZXJSZXBsYWNlbWVudCgnYTxiJywgNCwgJ2EmbHQ7YicsIFswLCAxLCAyLCAzXSk7XG5cdFx0YXNzZXJ0Q2hhcmFjdGVyUmVwbGFjZW1lbnQoJ2E+YicsIDQsICdhJmd0O2InLCBbMCwgMSwgMiwgM10pO1xuXHRcdGFzc2VydENoYXJhY3RlclJlcGxhY2VtZW50KCdhJmInLCA0LCAnYSZhbXA7YicsIFswLCAxLCAyLCAzXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGxhY2VzIHNvbWUgYmFkIGNoYXJhY3RlcnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0Q2hhcmFjdGVyUmVwbGFjZW1lbnQoJ2FcXDBiJywgNCwgJ2EmIzAwO2InLCBbMCwgMSwgMiwgM10pO1xuXHRcdGFzc2VydENoYXJhY3RlclJlcGxhY2VtZW50KCdhJyArIFN0cmluZy5mcm9tQ2hhckNvZGUoQ2hhckNvZGUuVVRGOF9CT00pICsgJ2InLCA0LCAnYVxcdWZmZmRiJywgWzAsIDEsIDIsIDNdKTtcblx0XHRhc3NlcnRDaGFyYWN0ZXJSZXBsYWNlbWVudCgnYVxcdTIwMjhiJywgNCwgJ2FcXHVmZmZkYicsIFswLCAxLCAyLCAzXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZXMgdGFicycsICgpID0+IHtcblx0XHRhc3NlcnRDaGFyYWN0ZXJSZXBsYWNlbWVudCgnXFx0JywgNCwgJ1xcdTAwYTBcXHUwMGEwXFx1MDBhMFxcdTAwYTAnLCBbMCwgNF0pO1xuXHRcdGFzc2VydENoYXJhY3RlclJlcGxhY2VtZW50KCd4XFx0JywgNCwgJ3hcXHUwMGEwXFx1MDBhMFxcdTAwYTAnLCBbMCwgMSwgNF0pO1xuXHRcdGFzc2VydENoYXJhY3RlclJlcGxhY2VtZW50KCd4eFxcdCcsIDQsICd4eFxcdTAwYTBcXHUwMGEwJywgWzAsIDEsIDIsIDRdKTtcblx0XHRhc3NlcnRDaGFyYWN0ZXJSZXBsYWNlbWVudCgneHh4XFx0JywgNCwgJ3h4eFxcdTAwYTAnLCBbMCwgMSwgMiwgMywgNF0pO1xuXHRcdGFzc2VydENoYXJhY3RlclJlcGxhY2VtZW50KCd4eHh4XFx0JywgNCwgJ3h4eHhcXHUwMGEwXFx1MDBhMFxcdTAwYTBcXHUwMGEwJywgWzAsIDEsIDIsIDMsIDQsIDhdKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gYXNzZXJ0UGFydHMobGluZUNvbnRlbnQ6IHN0cmluZywgdGFiU2l6ZTogbnVtYmVyLCBwYXJ0czogVGVzdExpbmVUb2tlbltdLCBleHBlY3RlZDogc3RyaW5nLCBpbmZvOiBDaGFyYWN0ZXJNYXBwaW5nSW5mb1tdKTogdm9pZCB7XG5cdFx0Y29uc3QgX2FjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHRsaW5lQ29udGVudCxcblx0XHRcdGxpbmVUb2tlbnM6IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKHBhcnRzKSxcblx0XHRcdHRhYlNpemUsXG5cdFx0XHRzcGFjZVdpZHRoOiAwLFxuXHRcdFx0bWlkZG90V2lkdGg6IDAsXG5cdFx0XHR3c21pZGRvdFdpZHRoOiAwXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKF9hY3R1YWwuaHRtbCwgJzxzcGFuPicgKyBleHBlY3RlZCArICc8L3NwYW4+Jyk7XG5cdFx0YXNzZXJ0Q2hhcmFjdGVyTWFwcGluZzMoX2FjdHVhbC5jaGFyYWN0ZXJNYXBwaW5nLCBpbmZvKTtcblx0fVxuXG5cdHRlc3QoJ2VtcHR5IGxpbmUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UGFydHMoJycsIDQsIFtdLCAnPHNwYW4+PC9zcGFuPicsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBwYXJ0IHR5cGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0UGFydHMoJ3gnLCA0LCBbY3JlYXRlUGFydCgxLCAxMCldLCAnPHNwYW4gY2xhc3M9XCJtdGsxMFwiPng8L3NwYW4+JywgW1swLCBbMCwgMF1dLCBbMSwgWzAsIDFdXV0pO1xuXHRcdGFzc2VydFBhcnRzKCd4JywgNCwgW2NyZWF0ZVBhcnQoMSwgMjApXSwgJzxzcGFuIGNsYXNzPVwibXRrMjBcIj54PC9zcGFuPicsIFtbMCwgWzAsIDBdXSwgWzEsIFswLCAxXV1dKTtcblx0XHRhc3NlcnRQYXJ0cygneCcsIDQsIFtjcmVhdGVQYXJ0KDEsIDMwKV0sICc8c3BhbiBjbGFzcz1cIm10azMwXCI+eDwvc3Bhbj4nLCBbWzAsIFswLCAwXV0sIFsxLCBbMCwgMV1dXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R3byBwYXJ0cycsICgpID0+IHtcblx0XHRhc3NlcnRQYXJ0cygneHknLCA0LCBbY3JlYXRlUGFydCgxLCAxKSwgY3JlYXRlUGFydCgyLCAyKV0sICc8c3BhbiBjbGFzcz1cIm10azFcIj54PC9zcGFuPjxzcGFuIGNsYXNzPVwibXRrMlwiPnk8L3NwYW4+JywgW1swLCBbMCwgMF1dLCBbMSwgWzEsIDBdXSwgWzIsIFsxLCAxXV1dKTtcblx0XHRhc3NlcnRQYXJ0cygneHl6JywgNCwgW2NyZWF0ZVBhcnQoMSwgMSksIGNyZWF0ZVBhcnQoMywgMildLCAnPHNwYW4gY2xhc3M9XCJtdGsxXCI+eDwvc3Bhbj48c3BhbiBjbGFzcz1cIm10azJcIj55ejwvc3Bhbj4nLCBbWzAsIFswLCAwXV0sIFsxLCBbMSwgMF1dLCBbMiwgWzEsIDFdXSwgWzMsIFsxLCAyXV1dKTtcblx0XHRhc3NlcnRQYXJ0cygneHl6JywgNCwgW2NyZWF0ZVBhcnQoMiwgMSksIGNyZWF0ZVBhcnQoMywgMildLCAnPHNwYW4gY2xhc3M9XCJtdGsxXCI+eHk8L3NwYW4+PHNwYW4gY2xhc3M9XCJtdGsyXCI+ejwvc3Bhbj4nLCBbWzAsIFswLCAwXV0sIFsxLCBbMCwgMV1dLCBbMiwgWzEsIDBdXSwgWzMsIFsxLCAxXV1dKTtcblx0fSk7XG5cblx0Ly8gb3ZlcmZsb3dcblx0dGVzdCgnb3ZlcmZsb3cnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgX2FjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHRsaW5lQ29udGVudDogJ0hlbGxvIHdvcmxkIScsXG5cdFx0XHRsaW5lVG9rZW5zOiBjcmVhdGVWaWV3TGluZVRva2VucyhbXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMSwgMCksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMiwgMSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMywgMiksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNCwgMyksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNSwgNCksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNiwgNSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNywgNiksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoOCwgNyksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoOSwgOCksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMTAsIDkpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDExLCAxMCksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMTIsIDExKSxcblx0XHRcdF0pLFxuXHRcdFx0c3RvcFJlbmRlcmluZ0xpbmVBZnRlcjogNixcblx0XHRcdHJlbmRlcldoaXRlc3BhY2U6ICdib3VuZGFyeSdcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KF9hY3R1YWwpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gdHlwaWNhbCBsaW5lXG5cdHRlc3QoJ3R5cGljYWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSAnXFx0ICAgIGV4cG9ydCBjbGFzcyBHYW1lIHsgLy8gaHR0cDovL3Rlc3QuY29tICAgICAnO1xuXHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBjcmVhdGVWaWV3TGluZVRva2VucyhbXG5cdFx0XHRjcmVhdGVQYXJ0KDUsIDEpLFxuXHRcdFx0Y3JlYXRlUGFydCgxMSwgMiksXG5cdFx0XHRjcmVhdGVQYXJ0KDEyLCAzKSxcblx0XHRcdGNyZWF0ZVBhcnQoMTcsIDQpLFxuXHRcdFx0Y3JlYXRlUGFydCgxOCwgNSksXG5cdFx0XHRjcmVhdGVQYXJ0KDIyLCA2KSxcblx0XHRcdGNyZWF0ZVBhcnQoMjMsIDcpLFxuXHRcdFx0Y3JlYXRlUGFydCgyNCwgOCksXG5cdFx0XHRjcmVhdGVQYXJ0KDI1LCA5KSxcblx0XHRcdGNyZWF0ZVBhcnQoMjgsIDEwKSxcblx0XHRcdGNyZWF0ZVBhcnQoNDMsIDExKSxcblx0XHRcdGNyZWF0ZVBhcnQoNDgsIDEyKSxcblx0XHRdKTtcblx0XHRjb25zdCBfYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdGxpbmVDb250ZW50LFxuXHRcdFx0bGluZVRva2Vucyxcblx0XHRcdHJlbmRlcldoaXRlc3BhY2U6ICdib3VuZGFyeSdcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KF9hY3R1YWwpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gaXNzdWUgIzIyNTU6IFdlaXJkIGxpbmUgcmVuZGVyaW5nIHBhcnQgMVxuXHR0ZXN0KCdpc3N1ZS0yMjU1LTEnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSAnXFx0XFx0XFx0Y3Vyc29yU3R5bGU6XFx0XFx0XFx0XFx0XFx0XFx0KHByZXZPcHRzLmN1cnNvclN0eWxlICE9PSBuZXdPcHRzLmN1cnNvclN0eWxlKSwnO1xuXHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBjcmVhdGVWaWV3TGluZVRva2VucyhbXG5cdFx0XHRjcmVhdGVQYXJ0KDMsIDEpLCAvLyAzIGNoYXJzXG5cdFx0XHRjcmVhdGVQYXJ0KDE1LCAyKSwgLy8gMTIgY2hhcnNcblx0XHRcdGNyZWF0ZVBhcnQoMjEsIDMpLCAvLyA2IGNoYXJzXG5cdFx0XHRjcmVhdGVQYXJ0KDIyLCA0KSwgLy8gMSBjaGFyXG5cdFx0XHRjcmVhdGVQYXJ0KDQzLCA1KSwgLy8gMjEgY2hhcnNcblx0XHRcdGNyZWF0ZVBhcnQoNDUsIDYpLCAvLyAyIGNoYXJzXG5cdFx0XHRjcmVhdGVQYXJ0KDQ2LCA3KSwgLy8gMSBjaGFyXG5cdFx0XHRjcmVhdGVQYXJ0KDY2LCA4KSwgLy8gMjAgY2hhcnNcblx0XHRcdGNyZWF0ZVBhcnQoNjcsIDkpLCAvLyAxIGNoYXJcblx0XHRcdGNyZWF0ZVBhcnQoNjgsIDEwKSwgLy8gMiBjaGFyc1xuXHRcdF0pO1xuXHRcdGNvbnN0IF9hY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0bGluZUNvbnRlbnQsXG5cdFx0XHRsaW5lVG9rZW5zXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5mbGF0ZWQgPSBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChfYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGlzc3VlICMyMjU1OiBXZWlyZCBsaW5lIHJlbmRlcmluZyBwYXJ0IDJcblx0dGVzdCgnaXNzdWUtMjI1NS0yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gJyBcXHRcXHRcXHRjdXJzb3JTdHlsZTpcXHRcXHRcXHRcXHRcXHRcXHQocHJldk9wdHMuY3Vyc29yU3R5bGUgIT09IG5ld09wdHMuY3Vyc29yU3R5bGUpLCc7XG5cblx0XHRjb25zdCBsaW5lVG9rZW5zID0gY3JlYXRlVmlld0xpbmVUb2tlbnMoW1xuXHRcdFx0Y3JlYXRlUGFydCg0LCAxKSwgLy8gNCBjaGFyc1xuXHRcdFx0Y3JlYXRlUGFydCgxNiwgMiksIC8vIDEyIGNoYXJzXG5cdFx0XHRjcmVhdGVQYXJ0KDIyLCAzKSwgLy8gNiBjaGFyc1xuXHRcdFx0Y3JlYXRlUGFydCgyMywgNCksIC8vIDEgY2hhclxuXHRcdFx0Y3JlYXRlUGFydCg0NCwgNSksIC8vIDIxIGNoYXJzXG5cdFx0XHRjcmVhdGVQYXJ0KDQ2LCA2KSwgLy8gMiBjaGFyc1xuXHRcdFx0Y3JlYXRlUGFydCg0NywgNyksIC8vIDEgY2hhclxuXHRcdFx0Y3JlYXRlUGFydCg2NywgOCksIC8vIDIwIGNoYXJzXG5cdFx0XHRjcmVhdGVQYXJ0KDY4LCA5KSwgLy8gMSBjaGFyXG5cdFx0XHRjcmVhdGVQYXJ0KDY5LCAxMCksIC8vIDIgY2hhcnNcblx0XHRdKTtcblx0XHRjb25zdCBfYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdGxpbmVDb250ZW50LFxuXHRcdFx0bGluZVRva2Vuc1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGluZmxhdGVkID0gaW5mbGF0ZVJlbmRlckxpbmVPdXRwdXQoX2FjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjOTExNzg6IGFmdGVyIGRlY29yYXRpb24gdHlwZSBzaG93biBiZWZvcmUgY3Vyc29yXG5cdHRlc3QoJ2lzc3VlLTkxMTc4JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gJy8vanVzdCBhIGNvbW1lbnQnO1xuXHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBjcmVhdGVWaWV3TGluZVRva2VucyhbXG5cdFx0XHRjcmVhdGVQYXJ0KDE2LCAxKVxuXHRcdF0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHR1c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zOiB0cnVlLFxuXHRcdFx0Y2FuVXNlSGFsZndpZHRoUmlnaHR3YXJkc0Fycm93OiBmYWxzZSxcblx0XHRcdGxpbmVDb250ZW50LFxuXHRcdFx0bGluZVRva2Vucyxcblx0XHRcdGxpbmVEZWNvcmF0aW9uczogW1xuXHRcdFx0XHRuZXcgTGluZURlY29yYXRpb24oMTMsIDEzLCAnZGVjMScsIElubGluZURlY29yYXRpb25UeXBlLkFmdGVyKSxcblx0XHRcdFx0bmV3IExpbmVEZWNvcmF0aW9uKDEzLCAxMywgJ2RlYzInLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5CZWZvcmUpLFxuXHRcdFx0XVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGluZmxhdGVkID0gaW5mbGF0ZVJlbmRlckxpbmVPdXRwdXQoYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGlzc3VlIG1pY3Jvc29mdC9tb25hY28tZWRpdG9yIzI4MDogSW1wcm92ZWQgc291cmNlIGNvZGUgcmVuZGVyaW5nIGZvciBSVEwgbGFuZ3VhZ2VzXG5cdHRlc3QoJ21vbmFjby0yODAnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSAndmFyIFx1MDVFN1x1MDVENVx1MDVEM1x1MDVERVx1MDVENVx1MDVFQSA9IFxcXCJcdTA1REVcdTA1RDlcdTA1RDVcdTA1RUFcdTA1RTggXHUwNUU3XHUwNUQ1XHUwNUQzXHUwNURFXHUwNUQ1XHUwNUVBIFx1MDVFNlxcJ1x1MDVEOCBcdTA1RTlcdTA1REMsIFx1MDVEMFx1MDVERCBcdTA1RENcdTA1RTlcdTA1RDVcdTA1REYgXHUwNUQ0XHUwNUUyXHUwNUQxXHUwNUU4XHUwNUQ5XHUwNUVBIFx1MDVFOVx1MDVEOVx1MDVFMFx1MDVENVx1MDVEOVx1MDVEOVx1MDVERCBcdTA1RDVcdTA1RDlcdTA1RTksIFx1MDVEMFx1MDVERFxcXCI7Jztcblx0XHRjb25zdCBsaW5lVG9rZW5zID0gY3JlYXRlVmlld0xpbmVUb2tlbnMoW1xuXHRcdFx0Y3JlYXRlUGFydCgzLCA2KSxcblx0XHRcdGNyZWF0ZVBhcnQoMTMsIDEpLFxuXHRcdFx0Y3JlYXRlUGFydCg2NiwgMjApLFxuXHRcdFx0Y3JlYXRlUGFydCg2NywgMSksXG5cdFx0XSk7XG5cdFx0Y29uc3QgX2FjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHRsaW5lQ29udGVudCxcblx0XHRcdGlzQmFzaWNBU0NJSTogZmFsc2UsXG5cdFx0XHRjb250YWluc1JUTDogdHJ1ZSxcblx0XHRcdGxpbmVUb2tlbnNcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KF9hY3R1YWwpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gaXNzdWUgIzEzNzAzNjogSXNzdWUgaW4gUlRMIGxhbmd1YWdlcyBpbiByZWNlbnQgdmVyc2lvbnNcblx0dGVzdCgnaXNzdWUtMTM3MDM2JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gJzxvcHRpb24gdmFsdWU9XFxcIlx1MDYyN1x1MDY0NFx1MDYzOVx1MDYzMVx1MDYyOFx1MDY0QVx1MDYyOVxcXCI+XHUwNjI3XHUwNjQ0XHUwNjM5XHUwNjMxXHUwNjI4XHUwNjRBXHUwNjI5PC9vcHRpb24+Jztcblx0XHRjb25zdCBsaW5lVG9rZW5zID0gY3JlYXRlVmlld0xpbmVUb2tlbnMoW1xuXHRcdFx0Y3JlYXRlUGFydCgxLCAyKSxcblx0XHRcdGNyZWF0ZVBhcnQoNywgMyksXG5cdFx0XHRjcmVhdGVQYXJ0KDgsIDQpLFxuXHRcdFx0Y3JlYXRlUGFydCgxMywgNSksXG5cdFx0XHRjcmVhdGVQYXJ0KDE0LCA0KSxcblx0XHRcdGNyZWF0ZVBhcnQoMjMsIDYpLFxuXHRcdFx0Y3JlYXRlUGFydCgyNCwgMiksXG5cdFx0XHRjcmVhdGVQYXJ0KDMxLCA0KSxcblx0XHRcdGNyZWF0ZVBhcnQoMzMsIDIpLFxuXHRcdFx0Y3JlYXRlUGFydCgzOSwgMyksXG5cdFx0XHRjcmVhdGVQYXJ0KDQwLCAyKSxcblx0XHRdKTtcblx0XHRjb25zdCBfYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdGxpbmVDb250ZW50LFxuXHRcdFx0aXNCYXNpY0FTQ0lJOiBmYWxzZSxcblx0XHRcdGNvbnRhaW5zUlRMOiB0cnVlLFxuXHRcdFx0bGluZVRva2Vuc1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGluZmxhdGVkID0gaW5mbGF0ZVJlbmRlckxpbmVPdXRwdXQoX2FjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjOTk1ODk6IFJlbmRlcmluZyB3aGl0ZXNwYWNlIGluZmx1ZW5jZXMgYmlkaSBsYXlvdXRcblx0dGVzdCgnaXNzdWUtOTk1ODknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSAnICAgIFtcXFwiXHVEODNEXHVEREE4XHVGRTBGIFx1MDY4Nlx1MDYyN1x1MDY3RSBcdTA2NDFcdTA2MjdcdTA2QTlcdTA2MkFcdTA2NDhcdTA2MzFcXFwiLFxcXCJcdUQ4M0NcdURGQTggXHUwNjJBXHUwNjQ2XHUwNjM4XHUwNkNDXHUwNjQ1XHUwNjI3XHUwNjJBXFxcIl0nO1xuXHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBjcmVhdGVWaWV3TGluZVRva2VucyhbXG5cdFx0XHRjcmVhdGVQYXJ0KDUsIDIpLFxuXHRcdFx0Y3JlYXRlUGFydCgyMSwgMyksXG5cdFx0XHRjcmVhdGVQYXJ0KDIyLCAyKSxcblx0XHRcdGNyZWF0ZVBhcnQoMzQsIDMpLFxuXHRcdFx0Y3JlYXRlUGFydCgzNSwgMiksXG5cdFx0XSk7XG5cdFx0Y29uc3QgX2FjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHR1c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zOiB0cnVlLFxuXHRcdFx0bGluZUNvbnRlbnQsXG5cdFx0XHRpc0Jhc2ljQVNDSUk6IGZhbHNlLFxuXHRcdFx0Y29udGFpbnNSVEw6IHRydWUsXG5cdFx0XHRsaW5lVG9rZW5zLFxuXHRcdFx0cmVuZGVyV2hpdGVzcGFjZTogJ2FsbCdcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KF9hY3R1YWwpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gaXNzdWUgIzI2MDIzOTogSFRNTCBjb250YWluaW5nIGJpZGlyZWN0aW9uYWwgdGV4dCBpcyByZW5kZXJlZCBpbmNvcnJlY3RseVxuXHR0ZXN0KCdpc3N1ZS0yNjAyMzknLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2ltdWxhdGluZyBIVE1MIGxpa2U6IDxwIGNsYXNzPVwibXljbGFzc1wiIHRpdGxlPVwiXHUwNjI3XHUwNjQ0XHUwNjM5XHUwNjMxXHUwNjI4XHUwNjRBXCI+XHUwNjQ2XHUwNjM0XHUwNjI3XHUwNjM3IFx1MDYyN1x1MDY0NFx1MDYyQVx1MDYyRlx1MDY0OFx1MDY0QVx1MDY0NCE8L3A+XG5cdFx0Ly8gVGhlIGxpbmUgY29udGFpbnMgYm90aCBMVFIgKGNsYXNzPVwibXljbGFzc1wiKSBhbmQgUlRMICh0aXRsZT1cIlx1MDYyN1x1MDY0NFx1MDYzOVx1MDYzMVx1MDYyOFx1MDY0QVwiKSBhdHRyaWJ1dGUgdmFsdWVzXG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSAnPHAgY2xhc3M9XCJteWNsYXNzXCIgdGl0bGU9XCJcdTA2MjdcdTA2NDRcdTA2MzlcdTA2MzFcdTA2MjhcdTA2NEFcIj5cdTA2NDZcdTA2MzRcdTA2MjdcdTA2MzcgXHUwNjI3XHUwNjQ0XHUwNjJBXHUwNjJGXHUwNjQ4XHUwNjRBXHUwNjQ0ITwvcD4nO1xuXHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBjcmVhdGVWaWV3TGluZVRva2VucyhbXG5cdFx0XHRjcmVhdGVQYXJ0KDEsIDEpLCAgIC8vIDxcblx0XHRcdGNyZWF0ZVBhcnQoMiwgMiksICAgLy8gcFxuXHRcdFx0Y3JlYXRlUGFydCgzLCAzKSwgICAvLyAoc3BhY2UpXG5cdFx0XHRjcmVhdGVQYXJ0KDgsIDQpLCAgIC8vIGNsYXNzXG5cdFx0XHRjcmVhdGVQYXJ0KDksIDUpLCAgIC8vID1cblx0XHRcdGNyZWF0ZVBhcnQoMTAsIDYpLCAgLy8gXCJcblx0XHRcdGNyZWF0ZVBhcnQoMTcsIDcpLCAgLy8gbXljbGFzc1xuXHRcdFx0Y3JlYXRlUGFydCgxOCwgNiksICAvLyBcIlxuXHRcdFx0Y3JlYXRlUGFydCgxOSwgMyksICAvLyAoc3BhY2UpXG5cdFx0XHRjcmVhdGVQYXJ0KDI0LCA0KSwgIC8vIHRpdGxlXG5cdFx0XHRjcmVhdGVQYXJ0KDI1LCA1KSwgIC8vID1cblx0XHRcdGNyZWF0ZVBhcnQoMjYsIDYpLCAgLy8gXCJcblx0XHRcdGNyZWF0ZVBhcnQoMzIsIDgpLCAgLy8gXHUwNjI3XHUwNjQ0XHUwNjM5XHUwNjMxXHUwNjI4XHUwNjRBIChSVEwgdGV4dCkgLSA2IEFyYWJpYyBjaGFyYWN0ZXJzIGZyb20gcG9zaXRpb24gMjYtMzFcblx0XHRcdGNyZWF0ZVBhcnQoMzMsIDYpLCAgLy8gXCIgLSBjbG9zaW5nIHF1b3RlIGF0IHBvc2l0aW9uIDMyXG5cdFx0XHRjcmVhdGVQYXJ0KDM0LCAxKSwgIC8vID5cblx0XHRcdGNyZWF0ZVBhcnQoNDcsIDkpLCAgLy8gXHUwNjQ2XHUwNjM0XHUwNjI3XHUwNjM3IFx1MDYyN1x1MDY0NFx1MDYyQVx1MDYyRlx1MDY0OFx1MDY0QVx1MDY0NCEgKFJUTCB0ZXh0KSAtIDEzIGNoYXJhY3RlcnMgZnJvbSBwb3NpdGlvbiAzNC00NlxuXHRcdFx0Y3JlYXRlUGFydCg0OCwgMSksICAvLyA8XG5cdFx0XHRjcmVhdGVQYXJ0KDQ5LCAyKSwgIC8vIC9cblx0XHRcdGNyZWF0ZVBhcnQoNTAsIDIpLCAgLy8gcFxuXHRcdFx0Y3JlYXRlUGFydCg1MSwgMSksICAvLyA+XG5cdFx0XSk7XG5cdFx0Y29uc3QgX2FjdHVhbCA9IHJlbmRlclZpZXdMaW5lKG5ldyBSZW5kZXJMaW5lSW5wdXQoXG5cdFx0XHRmYWxzZSxcblx0XHRcdHRydWUsXG5cdFx0XHRsaW5lQ29udGVudCxcblx0XHRcdGZhbHNlLFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHR0cnVlLFxuXHRcdFx0MCxcblx0XHRcdGxpbmVUb2tlbnMsXG5cdFx0XHRbXSxcblx0XHRcdDQsXG5cdFx0XHQwLFxuXHRcdFx0MTAsXG5cdFx0XHQxMCxcblx0XHRcdDEwLFxuXHRcdFx0LTEsXG5cdFx0XHQnbm9uZScsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0bnVsbCxcblx0XHRcdG51bGwsXG5cdFx0XHQxNFxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgaW5mbGF0ZWQgPSBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChfYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGlzc3VlICMyNzQ2MDQ6IE1peGVkIExUUiBhbmQgUlRMIGluIGEgc2luZ2xlIHRva2VuXG5cdHRlc3QoJ2lzc3VlLTI3NDYwNCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsaW5lQ29udGVudCA9ICd0ZXN0LmNvbSMjYTotYWJwLWNvbnRhaW5zKFx1MDYyNSknO1xuXHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBjcmVhdGVWaWV3TGluZVRva2VucyhbXG5cdFx0XHRjcmVhdGVQYXJ0KGxpbmVDb250ZW50Lmxlbmd0aCwgMSlcblx0XHRdKTtcblx0XHRjb25zdCBhY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0bGluZUNvbnRlbnQsXG5cdFx0XHRpc0Jhc2ljQVNDSUk6IGZhbHNlLFxuXHRcdFx0Y29udGFpbnNSVEw6IHRydWUsXG5cdFx0XHRsaW5lVG9rZW5zXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5mbGF0ZWQgPSBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChhY3R1YWwpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gaXNzdWUgIzI3NzY5MzogTWl4ZWQgTFRSIGFuZCBSVEwgaW4gYSBzaW5nbGUgdG9rZW4gd2l0aCB0ZW1wbGF0ZSBsaXRlcmFsXG5cdHRlc3QoJ2lzc3VlLTI3NzY5MycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsaW5lQ29udGVudCA9ICdcdTA2NDZcdTA2MjdcdTA2NDUgXHUwNkE5XHUwNjI3XHUwNjMxXHUwNjI4XHUwNjMxOiAke3VzZXIuZmlyc3ROYW1lfSc7XG5cdFx0Y29uc3QgbGluZVRva2VucyA9IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtcblx0XHRcdGNyZWF0ZVBhcnQoOSwgMSksICAgLy8gXHUwNjQ2XHUwNjI3XHUwNjQ1IFx1MDZBOVx1MDYyN1x1MDYzMVx1MDYyOFx1MDYzMSAoUlRMIHN0cmluZyBjb250ZW50KVxuXHRcdFx0Y3JlYXRlUGFydCgxMSwgMSksICAvLyA6IChzcGFjZSlcblx0XHRcdGNyZWF0ZVBhcnQoMTMsIDIpLCAgLy8gJHsgKHRlbXBsYXRlIGV4cHJlc3Npb24gcHVuY3R1YXRpb24pXG5cdFx0XHRjcmVhdGVQYXJ0KDE3LCAzKSwgIC8vIHVzZXIgKHZhcmlhYmxlKVxuXHRcdFx0Y3JlYXRlUGFydCgxOCwgNCksICAvLyAuIChwdW5jdHVhdGlvbilcblx0XHRcdGNyZWF0ZVBhcnQoMjcsIDMpLCAgLy8gZmlyc3ROYW1lIChwcm9wZXJ0eSlcblx0XHRcdGNyZWF0ZVBhcnQoMjgsIDIpLCAgLy8gfSAodGVtcGxhdGUgZXhwcmVzc2lvbiBwdW5jdHVhdGlvbilcblx0XHRdKTtcblx0XHRjb25zdCBhY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0bGluZUNvbnRlbnQsXG5cdFx0XHRpc0Jhc2ljQVNDSUk6IGZhbHNlLFxuXHRcdFx0Y29udGFpbnNSVEw6IHRydWUsXG5cdFx0XHRsaW5lVG9rZW5zXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5mbGF0ZWQgPSBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChhY3R1YWwpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gaXNzdWUgIzY4ODU6IFNwbGl0cyBsYXJnZSB0b2tlbnNcblx0dGVzdCgnaXNzdWUtNjg4NScsIGFzeW5jICgpID0+IHtcblx0XHQvLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDEgICAgICAgICAxICAgICAgICAgMVxuXHRcdC8vICAgICAgICAgICAgICAgICAgICAgICAgMSAgICAgICAgIDIgICAgICAgICAzICAgICAgICAgNCAgICAgICAgIDUgICAgICAgICA2ICAgICAgICAgNyAgICAgICAgIDggICAgICAgICA5ICAgICAgICAgMCAgICAgICAgIDEgICAgICAgICAyXG5cdFx0Ly8gICAgICAgICAgICAgICAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0XG5cdFx0Y29uc3QgX2xpbmVUZXh0ID0gJ1RoaXMgaXMganVzdCBhIGxvbmcgbGluZSB0aGF0IGNvbnRhaW5zIHZlcnkgaW50ZXJlc3RpbmcgdGV4dC4gVGhpcyBpcyBqdXN0IGEgbG9uZyBsaW5lIHRoYXQgY29udGFpbnMgdmVyeSBpbnRlcmVzdGluZyB0ZXh0Lic7XG5cblx0XHRmdW5jdGlvbiBhc3NlcnRTcGxpdHNUb2tlbnMobWVzc2FnZTogc3RyaW5nLCBsaW5lQ29udGVudDogc3RyaW5nLCBleHBlY3RlZE91dHB1dDogc3RyaW5nW10pOiB2b2lkIHtcblx0XHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBjcmVhdGVWaWV3TGluZVRva2VucyhbY3JlYXRlUGFydChsaW5lQ29udGVudC5sZW5ndGgsIDEpXSk7XG5cdFx0XHRjb25zdCBhY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0XHRsaW5lQ29udGVudCxcblx0XHRcdFx0bGluZVRva2Vuc1xuXHRcdFx0fSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5odG1sLCAnPHNwYW4+JyArIGV4cGVjdGVkT3V0cHV0LmpvaW4oJycpICsgJzwvc3Bhbj4nLCBtZXNzYWdlKTtcblx0XHR9XG5cblx0XHQvLyBBIHRva2VuIHdpdGggNDkgY2hhcnNcblx0XHR7XG5cdFx0XHRhc3NlcnRTcGxpdHNUb2tlbnMoXG5cdFx0XHRcdCc0OSBjaGFycycsXG5cdFx0XHRcdF9saW5lVGV4dC5zdWJzdHIoMCwgNDkpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0JzxzcGFuIGNsYXNzPVwibXRrMVwiPlRoaXNcXHUwMGEwaXNcXHUwMGEwanVzdFxcdTAwYTBhXFx1MDBhMGxvbmdcXHUwMGEwbGluZVxcdTAwYTB0aGF0XFx1MDBhMGNvbnRhaW5zXFx1MDBhMHZlcnlcXHUwMGEwaW50ZXI8L3NwYW4+Jyxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHQvLyBBIHRva2VuIHdpdGggNTAgY2hhcnNcblx0XHR7XG5cdFx0XHRhc3NlcnRTcGxpdHNUb2tlbnMoXG5cdFx0XHRcdCc1MCBjaGFycycsXG5cdFx0XHRcdF9saW5lVGV4dC5zdWJzdHIoMCwgNTApLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0JzxzcGFuIGNsYXNzPVwibXRrMVwiPlRoaXNcXHUwMGEwaXNcXHUwMGEwanVzdFxcdTAwYTBhXFx1MDBhMGxvbmdcXHUwMGEwbGluZVxcdTAwYTB0aGF0XFx1MDBhMGNvbnRhaW5zXFx1MDBhMHZlcnlcXHUwMGEwaW50ZXJlPC9zcGFuPicsXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0Ly8gQSB0b2tlbiB3aXRoIDUxIGNoYXJzXG5cdFx0e1xuXHRcdFx0YXNzZXJ0U3BsaXRzVG9rZW5zKFxuXHRcdFx0XHQnNTEgY2hhcnMnLFxuXHRcdFx0XHRfbGluZVRleHQuc3Vic3RyKDAsIDUxKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCc8c3BhbiBjbGFzcz1cIm10azFcIj5UaGlzXFx1MDBhMGlzXFx1MDBhMGp1c3RcXHUwMGEwYVxcdTAwYTBsb25nXFx1MDBhMGxpbmVcXHUwMGEwdGhhdFxcdTAwYTBjb250YWluc1xcdTAwYTB2ZXJ5XFx1MDBhMGludGVyZTwvc3Bhbj4nLFxuXHRcdFx0XHRcdCc8c3BhbiBjbGFzcz1cIm10azFcIj5zPC9zcGFuPicsXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0Ly8gQSB0b2tlbiB3aXRoIDk5IGNoYXJzXG5cdFx0e1xuXHRcdFx0YXNzZXJ0U3BsaXRzVG9rZW5zKFxuXHRcdFx0XHQnOTkgY2hhcnMnLFxuXHRcdFx0XHRfbGluZVRleHQuc3Vic3RyKDAsIDk5KSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCc8c3BhbiBjbGFzcz1cIm10azFcIj5UaGlzXFx1MDBhMGlzXFx1MDBhMGp1c3RcXHUwMGEwYVxcdTAwYTBsb25nXFx1MDBhMGxpbmVcXHUwMGEwdGhhdFxcdTAwYTBjb250YWluc1xcdTAwYTB2ZXJ5XFx1MDBhMGludGVyZTwvc3Bhbj4nLFxuXHRcdFx0XHRcdCc8c3BhbiBjbGFzcz1cIm10azFcIj5zdGluZ1xcdTAwYTB0ZXh0LlxcdTAwYTBUaGlzXFx1MDBhMGlzXFx1MDBhMGp1c3RcXHUwMGEwYVxcdTAwYTBsb25nXFx1MDBhMGxpbmVcXHUwMGEwdGhhdFxcdTAwYTBjb250YWluPC9zcGFuPicsXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0Ly8gQSB0b2tlbiB3aXRoIDEwMCBjaGFyc1xuXHRcdHtcblx0XHRcdGFzc2VydFNwbGl0c1Rva2Vucyhcblx0XHRcdFx0JzEwMCBjaGFycycsXG5cdFx0XHRcdF9saW5lVGV4dC5zdWJzdHIoMCwgMTAwKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCc8c3BhbiBjbGFzcz1cIm10azFcIj5UaGlzXFx1MDBhMGlzXFx1MDBhMGp1c3RcXHUwMGEwYVxcdTAwYTBsb25nXFx1MDBhMGxpbmVcXHUwMGEwdGhhdFxcdTAwYTBjb250YWluc1xcdTAwYTB2ZXJ5XFx1MDBhMGludGVyZTwvc3Bhbj4nLFxuXHRcdFx0XHRcdCc8c3BhbiBjbGFzcz1cIm10azFcIj5zdGluZ1xcdTAwYTB0ZXh0LlxcdTAwYTBUaGlzXFx1MDBhMGlzXFx1MDBhMGp1c3RcXHUwMGEwYVxcdTAwYTBsb25nXFx1MDBhMGxpbmVcXHUwMGEwdGhhdFxcdTAwYTBjb250YWluczwvc3Bhbj4nLFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdC8vIEEgdG9rZW4gd2l0aCAxMDEgY2hhcnNcblx0XHR7XG5cdFx0XHRhc3NlcnRTcGxpdHNUb2tlbnMoXG5cdFx0XHRcdCcxMDEgY2hhcnMnLFxuXHRcdFx0XHRfbGluZVRleHQuc3Vic3RyKDAsIDEwMSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnPHNwYW4gY2xhc3M9XCJtdGsxXCI+VGhpc1xcdTAwYTBpc1xcdTAwYTBqdXN0XFx1MDBhMGFcXHUwMGEwbG9uZ1xcdTAwYTBsaW5lXFx1MDBhMHRoYXRcXHUwMGEwY29udGFpbnNcXHUwMGEwdmVyeVxcdTAwYTBpbnRlcmU8L3NwYW4+Jyxcblx0XHRcdFx0XHQnPHNwYW4gY2xhc3M9XCJtdGsxXCI+c3RpbmdcXHUwMGEwdGV4dC5cXHUwMGEwVGhpc1xcdTAwYTBpc1xcdTAwYTBqdXN0XFx1MDBhMGFcXHUwMGEwbG9uZ1xcdTAwYTBsaW5lXFx1MDBhMHRoYXRcXHUwMGEwY29udGFpbnM8L3NwYW4+Jyxcblx0XHRcdFx0XHQnPHNwYW4gY2xhc3M9XCJtdGsxXCI+XFx1MDBhMDwvc3Bhbj4nLFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gaXNzdWUgIzIxNDc2OiBEb2VzIG5vdCBzcGxpdCBsYXJnZSB0b2tlbnMgd2hlbiBsaWdhdHVyZXMgYXJlIG9uXG5cdHRlc3QoJ2lzc3VlLTIxNDc2JywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgMSAgICAgICAgIDEgICAgICAgICAxXG5cdFx0Ly8gICAgICAgICAgICAgICAgICAgICAgICAxICAgICAgICAgMiAgICAgICAgIDMgICAgICAgICA0ICAgICAgICAgNSAgICAgICAgIDYgICAgICAgICA3ICAgICAgICAgOCAgICAgICAgIDkgICAgICAgICAwICAgICAgICAgMSAgICAgICAgIDJcblx0XHQvLyAgICAgICAgICAgICAgIDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyMzRcblx0XHRjb25zdCBfbGluZVRleHQgPSAnVGhpcyBpcyBqdXN0IGEgbG9uZyBsaW5lIHRoYXQgY29udGFpbnMgdmVyeSBpbnRlcmVzdGluZyB0ZXh0LiBUaGlzIGlzIGp1c3QgYSBsb25nIGxpbmUgdGhhdCBjb250YWlucyB2ZXJ5IGludGVyZXN0aW5nIHRleHQuJztcblxuXHRcdGZ1bmN0aW9uIGFzc2VydFNwbGl0c1Rva2VucyhtZXNzYWdlOiBzdHJpbmcsIGxpbmVDb250ZW50OiBzdHJpbmcsIGV4cGVjdGVkT3V0cHV0OiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdFx0Y29uc3QgbGluZVRva2VucyA9IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtjcmVhdGVQYXJ0KGxpbmVDb250ZW50Lmxlbmd0aCwgMSldKTtcblx0XHRcdGNvbnN0IGFjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHRcdGxpbmVDb250ZW50LFxuXHRcdFx0XHRsaW5lVG9rZW5zLFxuXHRcdFx0XHRmb250TGlnYXR1cmVzOiB0cnVlXG5cdFx0XHR9KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmh0bWwsICc8c3Bhbj4nICsgZXhwZWN0ZWRPdXRwdXQuam9pbignJykgKyAnPC9zcGFuPicsIG1lc3NhZ2UpO1xuXHRcdH1cblxuXHRcdC8vIEEgdG9rZW4gd2l0aCAxMDEgY2hhcnNcblx0XHR7XG5cdFx0XHRhc3NlcnRTcGxpdHNUb2tlbnMoXG5cdFx0XHRcdCcxMDEgY2hhcnMnLFxuXHRcdFx0XHRfbGluZVRleHQuc3Vic3RyKDAsIDEwMSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnPHNwYW4gY2xhc3M9XCJtdGsxXCI+VGhpc1xcdTAwYTBpc1xcdTAwYTBqdXN0XFx1MDBhMGFcXHUwMGEwbG9uZ1xcdTAwYTBsaW5lXFx1MDBhMHRoYXRcXHUwMGEwY29udGFpbnNcXHUwMGEwdmVyeVxcdTAwYTA8L3NwYW4+Jyxcblx0XHRcdFx0XHQnPHNwYW4gY2xhc3M9XCJtdGsxXCI+aW50ZXJlc3RpbmdcXHUwMGEwdGV4dC5cXHUwMGEwVGhpc1xcdTAwYTBpc1xcdTAwYTBqdXN0XFx1MDBhMGFcXHUwMGEwbG9uZ1xcdTAwYTBsaW5lXFx1MDBhMHRoYXRcXHUwMGEwPC9zcGFuPicsXG5cdFx0XHRcdFx0JzxzcGFuIGNsYXNzPVwibXRrMVwiPmNvbnRhaW5zXFx1MDBhMDwvc3Bhbj4nLFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gaXNzdWUgIzIwNjI0OiBVbmFsaWduZWQgc3Vycm9nYXRlIHBhaXJzIGFyZSBjb3JydXB0ZWQgYXQgbXVsdGlwbGVzIG9mIDUwIGNvbHVtbnNcblx0dGVzdCgnaXNzdWUtMjA2MjQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSAnYVx1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCN1x1RDg0Mlx1REZCNyc7XG5cdFx0Y29uc3QgbGluZVRva2VucyA9IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtjcmVhdGVQYXJ0KGxpbmVDb250ZW50Lmxlbmd0aCwgMSldKTtcblx0XHRjb25zdCBhY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0bGluZUNvbnRlbnQsXG5cdFx0XHRpc0Jhc2ljQVNDSUk6IGZhbHNlLFxuXHRcdFx0bGluZVRva2Vuc1xuXHRcdH0pKTtcblxuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KGFjdHVhbCkuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjNjg4NTogRG9lcyBub3Qgc3BsaXQgbGFyZ2UgdG9rZW5zIGluIFJUTCB0ZXh0XG5cdHRlc3QoJ2lzc3VlLTY4ODUtcnRsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gJ1x1MDVEMFx1MDVFQSBcdTA1RDJcdTA1RThcdTA1REVcdTA1RTBcdTA1RDlcdTA1RUEgXHUwNUQxXHUwNUQ0XHUwNUVBXHUwNUQ5XHUwNUQ5XHUwNUQ3XHUwNUUxXHUwNUQ1XHUwNUVBIFx1MDVFOVx1MDVERVx1MDVENSwgXHUwNUU5XHUwNUUwXHUwNUVBXHUwNUQ5IFx1MDVENFx1MDVERVx1MDVFOVx1MDVFNFx1MDVEOCBcdTA1RDBcdTA1REMgXHUwNUQ3XHUwNUU0XHUwNUU5LCBcdTA1RDBcdTA1REQgXHUwNURCXHUwNUVBXHUwNUQxIFx1MDVEMFx1MDVEN1x1MDVFOFx1MDVEOVx1MDVERCBcdTA1RDVcdTA1RENcdTA1RDdcdTA1RDFcdTA1RTguIFx1MDVFOVx1MDVEQyBcdTA1RDRcdTA1RUFcdTA1RDVcdTA1REJcdTA1REYgXHUwNUQwXHUwNUQ1XHUwNUQzXHUwNUQ1XHUwNUVBIFx1MDVEMVx1MDVENVx1MDVEOVx1MDVFN1x1MDVEOVx1MDVFNFx1MDVEM1x1MDVEOVx1MDVENCBcdTA1REJcdTA1RENcdTA1REMsIFx1MDVFOVx1MDVEQyBcdTA1RTJcdTA1RDZcdTA1RThcdTA1RDQgXHUwNURCXHUwNUQ5XHUwNURFXHUwNUQ5XHUwNUQ0IFx1MDVENFx1MDVEOVx1MDVEMC4gXHUwNUUyXHUwNURDIFx1MDVFMlx1MDVERVx1MDVENVx1MDVEMyBcdTA1RDlcdTA1RDVcdTA1RTZcdTA1RThcdTA1RDlcdTA1REQgXHUwNURFXHUwNUQ5XHUwNUVBXHUwNUQ1XHUwNURDXHUwNUQ1XHUwNUQyXHUwNUQ5XHUwNUQ0IFx1MDVFMVx1MDVEM1x1MDVFOCwgXHUwNUQwXHUwNUREIFx1MDVFOVx1MDVEQlx1MDVEQyBcdTA1RTlcdTA1RUFcdTA1RTRcdTA1RDUgXHUwNURDXHUwNUUyXHUwNUQxXHUwNUU4XHUwNUQ5XHUwNUVBIFx1MDVFOVx1MDVEOVx1MDVFMFx1MDVENVx1MDVEOVx1MDVEOVx1MDVERCwgXHUwNUQwXHUwNUREIFx1MDVFOVx1MDVEMFx1MDVEQ1x1MDVENVx1MDVFQSBcdTA1RDBcdTA1RTBcdTA1RDJcdTA1RENcdTA1RDlcdTA1RUEgXHUwNUUyXHUwNUQ2XHUwNUQ0LiBcdTA1RTlcdTA1REVcdTA1RDVcdTA1RUEgXHUwNUQxXHUwNUU3XHUwNURDXHUwNUQ1XHUwNUVBIFx1MDVERVx1MDVENCBcdTA1RTFcdTA1RDNcdTA1RTguJztcblx0XHRjb25zdCBsaW5lVG9rZW5zID0gY3JlYXRlVmlld0xpbmVUb2tlbnMoW2NyZWF0ZVBhcnQobGluZUNvbnRlbnQubGVuZ3RoLCAxKV0pO1xuXHRcdGNvbnN0IGFjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHRsaW5lQ29udGVudCxcblx0XHRcdGlzQmFzaWNBU0NJSTogZmFsc2UsXG5cdFx0XHRjb250YWluc1JUTDogdHJ1ZSxcblx0XHRcdGxpbmVUb2tlbnNcblx0XHR9KSk7XG5cblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwuaHRtbCwgSFRNTF9FWFRFTlNJT04pO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjOTU2ODU6IFVzZXMgdW5pY29kZSByZXBsYWNlbWVudCBjaGFyYWN0ZXIgZm9yIFBhcmFncmFwaCBTZXBhcmF0b3Jcblx0dGVzdCgnaXNzdWUtOTU2ODUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSAndmFyIGZ0ZXh0ID0gW1xcdTIwMjlcIlVuZFwiLCBcImRhbm5cIiwgXCJlaW5lc1wiXTsnO1xuXHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBjcmVhdGVWaWV3TGluZVRva2VucyhbY3JlYXRlUGFydChsaW5lQ29udGVudC5sZW5ndGgsIDEpXSk7XG5cdFx0Y29uc3QgYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdGxpbmVDb250ZW50LFxuXHRcdFx0aXNCYXNpY0FTQ0lJOiBmYWxzZSxcblx0XHRcdGxpbmVUb2tlbnNcblx0XHR9KSk7XG5cdFx0Y29uc3QgaW5mbGF0ZWQgPSBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChhY3R1YWwpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gaXNzdWUgIzE5NjczOiBNb25va2FpIFRoZW1lIGJhZC1oaWdobGlnaHRpbmcgaW4gbGluZSB3cmFwXG5cdHRlc3QoJ2lzc3VlLTE5NjczJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gJyAgICBNb25nb0NhbGxiYWNrPHN0cmluZz4pOiB2b2lkIHsnO1xuXHRcdGNvbnN0IGxpbmVUb2tlbnMgPSBjcmVhdGVWaWV3TGluZVRva2VucyhbXG5cdFx0XHRjcmVhdGVQYXJ0KDE3LCAxKSxcblx0XHRcdGNyZWF0ZVBhcnQoMTgsIDIpLFxuXHRcdFx0Y3JlYXRlUGFydCgyNCwgMyksXG5cdFx0XHRjcmVhdGVQYXJ0KDI2LCA0KSxcblx0XHRcdGNyZWF0ZVBhcnQoMjcsIDUpLFxuXHRcdFx0Y3JlYXRlUGFydCgyOCwgNiksXG5cdFx0XHRjcmVhdGVQYXJ0KDMyLCA3KSxcblx0XHRcdGNyZWF0ZVBhcnQoMzQsIDgpLFxuXHRcdF0pO1xuXHRcdGNvbnN0IF9hY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0dXNlTW9ub3NwYWNlT3B0aW1pemF0aW9uczogdHJ1ZSxcblx0XHRcdGxpbmVDb250ZW50LFxuXHRcdFx0ZmF1eEluZGVudExlbmd0aDogNCxcblx0XHRcdGxpbmVUb2tlbnNcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KF9hY3R1YWwpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5tYXBwaW5nKTtcblx0fSk7XG59KTtcblxudHlwZSBDaGFyYWN0ZXJNYXBwaW5nSW5mbyA9IFtudW1iZXIsIFtudW1iZXIsIG51bWJlcl1dO1xuXG5mdW5jdGlvbiBhc3NlcnRDaGFyYWN0ZXJNYXBwaW5nMyhhY3R1YWw6IENoYXJhY3Rlck1hcHBpbmcsIGV4cGVjdGVkSW5mbzogQ2hhcmFjdGVyTWFwcGluZ0luZm9bXSk6IHZvaWQge1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IGV4cGVjdGVkSW5mby5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IFtob3Jpem9udGFsT2Zmc2V0LCBbcGFydEluZGV4LCBjaGFySW5kZXhdXSA9IGV4cGVjdGVkSW5mb1tpXTtcblxuXHRcdGNvbnN0IGFjdHVhbERvbVBvc2l0aW9uID0gYWN0dWFsLmdldERvbVBvc2l0aW9uKGkgKyAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbERvbVBvc2l0aW9uLCBuZXcgRG9tUG9zaXRpb24ocGFydEluZGV4LCBjaGFySW5kZXgpLCBgZ2V0RG9tUG9zaXRpb24oJHtpICsgMX0pYCk7XG5cblx0XHRsZXQgcGFydExlbmd0aCA9IGNoYXJJbmRleCArIDE7XG5cdFx0Zm9yIChsZXQgaiA9IGkgKyAxOyBqIDwgZXhwZWN0ZWRJbmZvLmxlbmd0aDsgaisrKSB7XG5cdFx0XHRjb25zdCBbLCBbbmV4dFBhcnRJbmRleCwgbmV4dENoYXJJbmRleF1dID0gZXhwZWN0ZWRJbmZvW2pdO1xuXHRcdFx0aWYgKG5leHRQYXJ0SW5kZXggPT09IHBhcnRJbmRleCkge1xuXHRcdFx0XHRwYXJ0TGVuZ3RoID0gbmV4dENoYXJJbmRleCArIDE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBhY3R1YWxDb2x1bW4gPSBhY3R1YWwuZ2V0Q29sdW1uKG5ldyBEb21Qb3NpdGlvbihwYXJ0SW5kZXgsIGNoYXJJbmRleCksIHBhcnRMZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxDb2x1bW4sIGkgKyAxLCBgYWN0dWFsLmdldENvbHVtbigke3BhcnRJbmRleH0sICR7Y2hhckluZGV4fSlgKTtcblxuXHRcdGNvbnN0IGFjdHVhbEhvcml6b250YWxPZmZzZXQgPSBhY3R1YWwuZ2V0SG9yaXpvbnRhbE9mZnNldChpICsgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbEhvcml6b250YWxPZmZzZXQsIGhvcml6b250YWxPZmZzZXQsIGBhY3R1YWwuZ2V0SG9yaXpvbnRhbE9mZnNldCgke2kgKyAxfSlgKTtcblx0fVxuXG5cdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwubGVuZ3RoLCBleHBlY3RlZEluZm8ubGVuZ3RoLCBgbGVuZ3RoIG1pc21hdGNoYCk7XG59XG5cbnN1aXRlKCdyZW5kZXJWaWV3TGluZTInLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gdGVzdENyZWF0ZUxpbmVQYXJ0cyhmb250SXNNb25vc3BhY2U6IGJvb2xlYW4sIGxpbmVDb250ZW50OiBzdHJpbmcsIHRva2VuczogVGVzdExpbmVUb2tlbltdLCBmYXV4SW5kZW50TGVuZ3RoOiBudW1iZXIsIHJlbmRlcldoaXRlc3BhY2U6ICdub25lJyB8ICdib3VuZGFyeScgfCAnc2VsZWN0aW9uJyB8ICd0cmFpbGluZycgfCAnYWxsJywgc2VsZWN0aW9uczogT2Zmc2V0UmFuZ2VbXSB8IG51bGwpIHtcblx0XHRjb25zdCBhY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0dXNlTW9ub3NwYWNlT3B0aW1pemF0aW9uczogZm9udElzTW9ub3NwYWNlLFxuXHRcdFx0bGluZUNvbnRlbnQsXG5cdFx0XHRmYXV4SW5kZW50TGVuZ3RoLFxuXHRcdFx0bGluZVRva2VuczogY3JlYXRlVmlld0xpbmVUb2tlbnModG9rZW5zKSxcblx0XHRcdHJlbmRlcldoaXRlc3BhY2UsXG5cdFx0XHRzZWxlY3Rpb25zT25MaW5lOiBzZWxlY3Rpb25zXG5cdFx0fSkpO1xuXHRcdHJldHVybiBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChhY3R1YWwpO1xuXHR9XG5cblx0Ly8gaXNzdWUgIzE4NjE2OiBJbmxpbmUgZGVjb3JhdGlvbnMgZW5kaW5nIGF0IHRoZSB0ZXh0IGxlbmd0aCBhcmUgbm8gbG9uZ2VyIHJlbmRlcmVkXG5cdHRlc3QoJ2lzc3VlLTE4NjE2JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gJ2h0dHBzOi8vbWljcm9zb2Z0LmNvbSc7XG5cdFx0Y29uc3QgYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdGxpbmVDb250ZW50LFxuXHRcdFx0bGluZVRva2VuczogY3JlYXRlVmlld0xpbmVUb2tlbnMoW2NyZWF0ZVBhcnQoMjEsIDMpXSksXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnM6IFtuZXcgTGluZURlY29yYXRpb24oMSwgMjIsICdsaW5rJywgSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhcildXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5mbGF0ZWQgPSBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChhY3R1YWwpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gaXNzdWUgIzE5MjA3OiBMaW5rIGluIE1vbm9rYWkgaXMgbm90IHJlbmRlcmVkIGNvcnJlY3RseVxuXHR0ZXN0KCdpc3N1ZS0xOTIwNycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsaW5lQ29udGVudCA9ICdcXCdsZXQgdXJsID0gYGh0dHA6Ly8qKiovX2FwaS93ZWIvbGlzdHMvR2V0QnlUaXRsZShcXFxcXFwnVGVhbWJ1aWxkaW5nYWFudnJhZ2VuXFxcXFxcJykvaXRlbXNgO1xcJyc7XG5cdFx0Y29uc3QgYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdHVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnM6IHRydWUsXG5cdFx0XHRsaW5lQ29udGVudCxcblx0XHRcdGxpbmVUb2tlbnM6IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtcblx0XHRcdFx0Y3JlYXRlUGFydCg0OSwgNiksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNTEsIDQpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDcyLCA2KSxcblx0XHRcdFx0Y3JlYXRlUGFydCg3NCwgNCksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoODQsIDYpLFxuXHRcdFx0XSksXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnM6IFtcblx0XHRcdFx0bmV3IExpbmVEZWNvcmF0aW9uKDEzLCA1MSwgJ2RldGVjdGVkLWxpbmsnLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5SZWd1bGFyKVxuXHRcdFx0XVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGluZmxhdGVkID0gaW5mbGF0ZVJlbmRlckxpbmVPdXRwdXQoYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGNyZWF0ZUxpbmVQYXJ0cyBzaW1wbGVcblx0dGVzdCgnc2ltcGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHRlc3RDcmVhdGVMaW5lUGFydHMoXG5cdFx0XHRmYWxzZSxcblx0XHRcdCdIZWxsbyB3b3JsZCEnLFxuXHRcdFx0W1xuXHRcdFx0XHRjcmVhdGVQYXJ0KDEyLCAxKVxuXHRcdFx0XSxcblx0XHRcdDAsXG5cdFx0XHQnbm9uZScsXG5cdFx0XHRudWxsXG5cdFx0KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gY3JlYXRlTGluZVBhcnRzIHNpbXBsZSB0d28gdG9rZW5zXG5cdHRlc3QoJ3R3by10b2tlbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gdGVzdENyZWF0ZUxpbmVQYXJ0cyhcblx0XHRcdGZhbHNlLFxuXHRcdFx0J0hlbGxvIHdvcmxkIScsXG5cdFx0XHRbXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNiwgMSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMTIsIDIpXG5cdFx0XHRdLFxuXHRcdFx0MCxcblx0XHRcdCdub25lJyxcblx0XHRcdG51bGxcblx0XHQpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBjcmVhdGVMaW5lUGFydHMgcmVuZGVyIHdoaXRlc3BhY2UgLSA0IGxlYWRpbmcgc3BhY2VzXG5cdHRlc3QoJ3dzLTQtbGVhZGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSB0ZXN0Q3JlYXRlTGluZVBhcnRzKFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHQnICAgIEhlbGxvIHdvcmxkISAgICAnLFxuXHRcdFx0W1xuXHRcdFx0XHRjcmVhdGVQYXJ0KDQsIDEpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDYsIDIpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDIwLCAzKVxuXHRcdFx0XSxcblx0XHRcdDAsXG5cdFx0XHQnYm91bmRhcnknLFxuXHRcdFx0bnVsbFxuXHRcdCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGNyZWF0ZUxpbmVQYXJ0cyByZW5kZXIgd2hpdGVzcGFjZSAtIDggbGVhZGluZyBzcGFjZXNcblx0dGVzdCgnd3MtOC1sZWFkaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHRlc3RDcmVhdGVMaW5lUGFydHMoXG5cdFx0XHRmYWxzZSxcblx0XHRcdCcgICAgICAgIEhlbGxvIHdvcmxkISAgICAgICAgJyxcblx0XHRcdFtcblx0XHRcdFx0Y3JlYXRlUGFydCg4LCAxKSxcblx0XHRcdFx0Y3JlYXRlUGFydCgxMCwgMiksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMjgsIDMpXG5cdFx0XHRdLFxuXHRcdFx0MCxcblx0XHRcdCdib3VuZGFyeScsXG5cdFx0XHRudWxsXG5cdFx0KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gY3JlYXRlTGluZVBhcnRzIHJlbmRlciB3aGl0ZXNwYWNlIC0gMiBsZWFkaW5nIHRhYnNcblx0dGVzdCgnd3MtMi10YWJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHRlc3RDcmVhdGVMaW5lUGFydHMoXG5cdFx0XHRmYWxzZSxcblx0XHRcdCdcXHRcXHRIZWxsbyB3b3JsZCFcXHQnLFxuXHRcdFx0W1xuXHRcdFx0XHRjcmVhdGVQYXJ0KDIsIDEpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDQsIDIpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDE1LCAzKVxuXHRcdFx0XSxcblx0XHRcdDAsXG5cdFx0XHQnYm91bmRhcnknLFxuXHRcdFx0bnVsbFxuXHRcdCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGNyZWF0ZUxpbmVQYXJ0cyByZW5kZXIgd2hpdGVzcGFjZSAtIG1peGVkIGxlYWRpbmcgc3BhY2VzIGFuZCB0YWJzXG5cdHRlc3QoJ3dzLW1peGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHRlc3RDcmVhdGVMaW5lUGFydHMoXG5cdFx0XHRmYWxzZSxcblx0XHRcdCcgIFxcdFxcdCAgSGVsbG8gd29ybGQhIFxcdCAgXFx0ICAgXFx0ICAgICcsXG5cdFx0XHRbXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNiwgMSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoOCwgMiksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMzEsIDMpXG5cdFx0XHRdLFxuXHRcdFx0MCxcblx0XHRcdCdib3VuZGFyeScsXG5cdFx0XHRudWxsXG5cdFx0KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gY3JlYXRlTGluZVBhcnRzIHJlbmRlciB3aGl0ZXNwYWNlIHNraXBzIGZhdXggaW5kZW50XG5cdHRlc3QoJ3dzLWZhdXgtaW5kZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHRlc3RDcmVhdGVMaW5lUGFydHMoXG5cdFx0XHRmYWxzZSxcblx0XHRcdCdcXHRcXHQgIEhlbGxvIHdvcmxkISBcXHQgIFxcdCAgIFxcdCAgICAnLFxuXHRcdFx0W1xuXHRcdFx0XHRjcmVhdGVQYXJ0KDQsIDEpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDYsIDIpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDI5LCAzKVxuXHRcdFx0XSxcblx0XHRcdDIsXG5cdFx0XHQnYm91bmRhcnknLFxuXHRcdFx0bnVsbFxuXHRcdCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGNyZWF0ZUxpbmVQYXJ0cyBkb2VzIG5vdCBlbWl0IHdpZHRoIGZvciBtb25vc3BhY2UgZm9udHNcblx0dGVzdCgnd3MtbW9ub3NwYWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHRlc3RDcmVhdGVMaW5lUGFydHMoXG5cdFx0XHR0cnVlLFxuXHRcdFx0J1xcdFxcdCAgSGVsbG8gd29ybGQhIFxcdCAgXFx0ICAgXFx0ICAgICcsXG5cdFx0XHRbXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNCwgMSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNiwgMiksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMjksIDMpXG5cdFx0XHRdLFxuXHRcdFx0Mixcblx0XHRcdCdib3VuZGFyeScsXG5cdFx0XHRudWxsXG5cdFx0KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gY3JlYXRlTGluZVBhcnRzIHJlbmRlciB3aGl0ZXNwYWNlIGluIG1pZGRsZSBidXQgbm90IGZvciBvbmUgc3BhY2Vcblx0dGVzdCgnd3MtbWlkZGxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHRlc3RDcmVhdGVMaW5lUGFydHMoXG5cdFx0XHRmYWxzZSxcblx0XHRcdCdpdCAgaXQgaXQgIGl0Jyxcblx0XHRcdFtcblx0XHRcdFx0Y3JlYXRlUGFydCg2LCAxKSxcblx0XHRcdFx0Y3JlYXRlUGFydCg3LCAyKSxcblx0XHRcdFx0Y3JlYXRlUGFydCgxMywgMylcblx0XHRcdF0sXG5cdFx0XHQwLFxuXHRcdFx0J2JvdW5kYXJ5Jyxcblx0XHRcdG51bGxcblx0XHQpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBjcmVhdGVMaW5lUGFydHMgcmVuZGVyIHdoaXRlc3BhY2UgZm9yIGFsbCBpbiBtaWRkbGVcblx0dGVzdCgnd3MtYWxsLW1pZGRsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSB0ZXN0Q3JlYXRlTGluZVBhcnRzKFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHQnIEhlbGxvIHdvcmxkIVxcdCcsXG5cdFx0XHRbXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNCwgMCksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNiwgMSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMTQsIDIpXG5cdFx0XHRdLFxuXHRcdFx0MCxcblx0XHRcdCdhbGwnLFxuXHRcdFx0bnVsbFxuXHRcdCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGNyZWF0ZUxpbmVQYXJ0cyByZW5kZXIgd2hpdGVzcGFjZSBmb3Igc2VsZWN0aW9uIHdpdGggbm8gc2VsZWN0aW9uc1xuXHR0ZXN0KCd3cy1zZWwtbm9uZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSB0ZXN0Q3JlYXRlTGluZVBhcnRzKFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHQnIEhlbGxvIHdvcmxkIVxcdCcsXG5cdFx0XHRbXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNCwgMCksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNiwgMSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMTQsIDIpXG5cdFx0XHRdLFxuXHRcdFx0MCxcblx0XHRcdCdzZWxlY3Rpb24nLFxuXHRcdFx0bnVsbFxuXHRcdCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGNyZWF0ZUxpbmVQYXJ0cyByZW5kZXIgd2hpdGVzcGFjZSBmb3Igc2VsZWN0aW9uIHdpdGggd2hvbGUgbGluZSBzZWxlY3Rpb25cblx0dGVzdCgnd3Mtc2VsLXdob2xlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHRlc3RDcmVhdGVMaW5lUGFydHMoXG5cdFx0XHRmYWxzZSxcblx0XHRcdCcgSGVsbG8gd29ybGQhXFx0Jyxcblx0XHRcdFtcblx0XHRcdFx0Y3JlYXRlUGFydCg0LCAwKSxcblx0XHRcdFx0Y3JlYXRlUGFydCg2LCAxKSxcblx0XHRcdFx0Y3JlYXRlUGFydCgxNCwgMilcblx0XHRcdF0sXG5cdFx0XHQwLFxuXHRcdFx0J3NlbGVjdGlvbicsXG5cdFx0XHRbbmV3IE9mZnNldFJhbmdlKDAsIDE0KV1cblx0XHQpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBjcmVhdGVMaW5lUGFydHMgcmVuZGVyIHdoaXRlc3BhY2UgZm9yIHNlbGVjdGlvbiB3aXRoIHNlbGVjdGlvbiBzcGFubmluZyBwYXJ0IG9mIHdoaXRlc3BhY2Vcblx0dGVzdCgnd3Mtc2VsLXBhcnRpYWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gdGVzdENyZWF0ZUxpbmVQYXJ0cyhcblx0XHRcdGZhbHNlLFxuXHRcdFx0JyBIZWxsbyB3b3JsZCFcXHQnLFxuXHRcdFx0W1xuXHRcdFx0XHRjcmVhdGVQYXJ0KDQsIDApLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDYsIDEpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDE0LCAyKVxuXHRcdFx0XSxcblx0XHRcdDAsXG5cdFx0XHQnc2VsZWN0aW9uJyxcblx0XHRcdFtuZXcgT2Zmc2V0UmFuZ2UoMCwgNSldXG5cdFx0KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gY3JlYXRlTGluZVBhcnRzIHJlbmRlciB3aGl0ZXNwYWNlIGZvciBzZWxlY3Rpb24gd2l0aCBtdWx0aXBsZSBzZWxlY3Rpb25zXG5cdHRlc3QoJ3dzLXNlbC1tdWx0aXBsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSB0ZXN0Q3JlYXRlTGluZVBhcnRzKFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHQnIEhlbGxvIHdvcmxkIVxcdCcsXG5cdFx0XHRbXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNCwgMCksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoNiwgMSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMTQsIDIpXG5cdFx0XHRdLFxuXHRcdFx0MCxcblx0XHRcdCdzZWxlY3Rpb24nLFxuXHRcdFx0W25ldyBPZmZzZXRSYW5nZSgwLCA1KSwgbmV3IE9mZnNldFJhbmdlKDksIDE0KV1cblx0XHQpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBjcmVhdGVMaW5lUGFydHMgcmVuZGVyIHdoaXRlc3BhY2UgZm9yIHNlbGVjdGlvbiB3aXRoIG11bHRpcGxlLCBpbml0aWFsbHkgdW5zb3J0ZWQgc2VsZWN0aW9uc1xuXHR0ZXN0KCd3cy1zZWwtdW5zb3J0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gdGVzdENyZWF0ZUxpbmVQYXJ0cyhcblx0XHRcdGZhbHNlLFxuXHRcdFx0JyBIZWxsbyB3b3JsZCFcXHQnLFxuXHRcdFx0W1xuXHRcdFx0XHRjcmVhdGVQYXJ0KDQsIDApLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDYsIDEpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDE0LCAyKVxuXHRcdFx0XSxcblx0XHRcdDAsXG5cdFx0XHQnc2VsZWN0aW9uJyxcblx0XHRcdFtuZXcgT2Zmc2V0UmFuZ2UoOSwgMTQpLCBuZXcgT2Zmc2V0UmFuZ2UoMCwgNSldXG5cdFx0KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gY3JlYXRlTGluZVBhcnRzIHJlbmRlciB3aGl0ZXNwYWNlIGZvciBzZWxlY3Rpb24gd2l0aCBzZWxlY3Rpb25zIG5leHQgdG8gZWFjaCBvdGhlclxuXHR0ZXN0KCd3cy1zZWwtYWRqYWNlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gdGVzdENyZWF0ZUxpbmVQYXJ0cyhcblx0XHRcdGZhbHNlLFxuXHRcdFx0JyAqIFMnLFxuXHRcdFx0W1xuXHRcdFx0XHRjcmVhdGVQYXJ0KDQsIDApXG5cdFx0XHRdLFxuXHRcdFx0MCxcblx0XHRcdCdzZWxlY3Rpb24nLFxuXHRcdFx0W25ldyBPZmZzZXRSYW5nZSgwLCAxKSwgbmV3IE9mZnNldFJhbmdlKDEsIDIpLCBuZXcgT2Zmc2V0UmFuZ2UoMiwgMyldXG5cdFx0KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gY3JlYXRlTGluZVBhcnRzIHJlbmRlciB3aGl0ZXNwYWNlIGZvciB0cmFpbGluZyB3aXRoIGxlYWRpbmcsIGlubmVyLCBhbmQgd2l0aG91dCB0cmFpbGluZyB3aGl0ZXNwYWNlXG5cdHRlc3QoJ3dzLXRyYWlsLW5vLXRyYWlsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHRlc3RDcmVhdGVMaW5lUGFydHMoXG5cdFx0XHRmYWxzZSxcblx0XHRcdCcgSGVsbG8gd29ybGQhJyxcblx0XHRcdFtcblx0XHRcdFx0Y3JlYXRlUGFydCg0LCAwKSxcblx0XHRcdFx0Y3JlYXRlUGFydCg2LCAxKSxcblx0XHRcdFx0Y3JlYXRlUGFydCgxNCwgMilcblx0XHRcdF0sXG5cdFx0XHQwLFxuXHRcdFx0J3RyYWlsaW5nJyxcblx0XHRcdG51bGxcblx0XHQpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBjcmVhdGVMaW5lUGFydHMgcmVuZGVyIHdoaXRlc3BhY2UgZm9yIHRyYWlsaW5nIHdpdGggbGVhZGluZywgaW5uZXIsIGFuZCB0cmFpbGluZyB3aGl0ZXNwYWNlXG5cdHRlc3QoJ3dzLXRyYWlsLXdpdGgtdHJhaWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gdGVzdENyZWF0ZUxpbmVQYXJ0cyhcblx0XHRcdGZhbHNlLFxuXHRcdFx0JyBIZWxsbyB3b3JsZCEgXFx0Jyxcblx0XHRcdFtcblx0XHRcdFx0Y3JlYXRlUGFydCg0LCAwKSxcblx0XHRcdFx0Y3JlYXRlUGFydCg2LCAxKSxcblx0XHRcdFx0Y3JlYXRlUGFydCgxNSwgMilcblx0XHRcdF0sXG5cdFx0XHQwLFxuXHRcdFx0J3RyYWlsaW5nJyxcblx0XHRcdG51bGxcblx0XHQpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBjcmVhdGVMaW5lUGFydHMgcmVuZGVyIHdoaXRlc3BhY2UgZm9yIHRyYWlsaW5nIHdpdGggOCBsZWFkaW5nIGFuZCA4IHRyYWlsaW5nIHdoaXRlc3BhY2VzXG5cdHRlc3QoJ3dzLXRyYWlsLTgtOCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSB0ZXN0Q3JlYXRlTGluZVBhcnRzKFxuXHRcdFx0ZmFsc2UsXG5cdFx0XHQnICAgICAgICBIZWxsbyB3b3JsZCEgICAgICAgICcsXG5cdFx0XHRbXG5cdFx0XHRcdGNyZWF0ZVBhcnQoOCwgMSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMTAsIDIpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDI4LCAzKVxuXHRcdFx0XSxcblx0XHRcdDAsXG5cdFx0XHQndHJhaWxpbmcnLFxuXHRcdFx0bnVsbFxuXHRcdCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoYWN0dWFsLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGNyZWF0ZUxpbmVQYXJ0cyByZW5kZXIgd2hpdGVzcGFjZSBmb3IgdHJhaWxpbmcgd2l0aCBsaW5lIGNvbnRhaW5pbmcgb25seSB3aGl0ZXNwYWNlc1xuXHR0ZXN0KCd3cy10cmFpbC1vbmx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHRlc3RDcmVhdGVMaW5lUGFydHMoXG5cdFx0XHRmYWxzZSxcblx0XHRcdCcgXFx0ICcsXG5cdFx0XHRbXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMiwgMCksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMywgMSksXG5cdFx0XHRdLFxuXHRcdFx0MCxcblx0XHRcdCd0cmFpbGluZycsXG5cdFx0XHRudWxsXG5cdFx0KTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChhY3R1YWwuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGFjdHVhbC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gY3JlYXRlTGluZVBhcnRzIGNhbiBoYW5kbGUgdW5zb3J0ZWQgaW5saW5lIGRlY29yYXRpb25zXG5cdHRlc3QoJ3Vuc29ydGVkLWRlY28nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdGxpbmVDb250ZW50OiAnSGVsbG8gd29ybGQnLFxuXHRcdFx0bGluZVRva2VuczogY3JlYXRlVmlld0xpbmVUb2tlbnMoW2NyZWF0ZVBhcnQoMTEsIDApXSksXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnM6IFtcblx0XHRcdFx0bmV3IExpbmVEZWNvcmF0aW9uKDUsIDcsICdhJywgSW5saW5lRGVjb3JhdGlvblR5cGUuUmVndWxhciksXG5cdFx0XHRcdG5ldyBMaW5lRGVjb3JhdGlvbigxLCAzLCAnYicsIElubGluZURlY29yYXRpb25UeXBlLlJlZ3VsYXIpLFxuXHRcdFx0XHRuZXcgTGluZURlY29yYXRpb24oMiwgOCwgJ2MnLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5SZWd1bGFyKSxcblx0XHRcdF1cblx0XHR9KSk7XG5cblx0XHQvLyAwMTIzNDU2Nzg5MFxuXHRcdC8vIEhlbGxvIHdvcmxkXG5cdFx0Ly8gLS0tLWFhLS0tLS1cblx0XHQvLyBiYi0tLS0tLS0tLVxuXHRcdC8vIC1jY2NjY2MtLS0tXG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KGFjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjMTE0ODU6IFZpc2libGUgd2hpdGVzcGFjZSBjb25mbGljdHMgd2l0aCBiZWZvcmUgZGVjb3JhdG9yIGF0dGFjaG1lbnRcblx0dGVzdCgnaXNzdWUtMTE0ODUnLCBhc3luYyAoKSA9PiB7XG5cblx0XHRjb25zdCBsaW5lQ29udGVudCA9ICdcXHRibGEnO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdGxpbmVDb250ZW50LFxuXHRcdFx0bGluZVRva2VuczogY3JlYXRlVmlld0xpbmVUb2tlbnMoW2NyZWF0ZVBhcnQoNCwgMyldKSxcblx0XHRcdGxpbmVEZWNvcmF0aW9uczogW25ldyBMaW5lRGVjb3JhdGlvbigxLCAyLCAnYmVmb3JlJywgSW5saW5lRGVjb3JhdGlvblR5cGUuQmVmb3JlKV0sXG5cdFx0XHRyZW5kZXJXaGl0ZXNwYWNlOiAnYWxsJyxcblx0XHRcdGZvbnRMaWdhdHVyZXM6IHRydWVcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KGFjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjMzI0MzY6IE5vbi1tb25vc3BhY2UgZm9udCArIHZpc2libGUgd2hpdGVzcGFjZSArIEFmdGVyIGRlY29yYXRvciBjYXVzZXMgbGluZSB0byBcImp1bXBcIlxuXHR0ZXN0KCdpc3N1ZS0zMjQzNicsIGFzeW5jICgpID0+IHtcblxuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gJ1xcdGJsYSc7XG5cblx0XHRjb25zdCBhY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0bGluZUNvbnRlbnQsXG5cdFx0XHRsaW5lVG9rZW5zOiBjcmVhdGVWaWV3TGluZVRva2VucyhbY3JlYXRlUGFydCg0LCAzKV0pLFxuXHRcdFx0bGluZURlY29yYXRpb25zOiBbbmV3IExpbmVEZWNvcmF0aW9uKDIsIDMsICdiZWZvcmUnLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5CZWZvcmUpXSxcblx0XHRcdHJlbmRlcldoaXRlc3BhY2U6ICdhbGwnLFxuXHRcdFx0Zm9udExpZ2F0dXJlczogdHJ1ZVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGluZmxhdGVkID0gaW5mbGF0ZVJlbmRlckxpbmVPdXRwdXQoYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGlzc3VlICMzMDEzMzogRW1wdHkgbGluZXMgZG9uJ3QgcmVuZGVyIGlubGluZSBkZWNvcmF0aW9uc1xuXHR0ZXN0KCdpc3N1ZS0zMDEzMycsIGFzeW5jICgpID0+IHtcblxuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gJyc7XG5cblx0XHRjb25zdCBhY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0bGluZUNvbnRlbnQsXG5cdFx0XHRsaW5lVG9rZW5zOiBjcmVhdGVWaWV3TGluZVRva2VucyhbY3JlYXRlUGFydCgwLCAzKV0pLFxuXHRcdFx0bGluZURlY29yYXRpb25zOiBbbmV3IExpbmVEZWNvcmF0aW9uKDEsIDIsICdiZWZvcmUnLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5CZWZvcmUpXSxcblx0XHRcdHJlbmRlcldoaXRlc3BhY2U6ICdhbGwnLFxuXHRcdFx0Zm9udExpZ2F0dXJlczogdHJ1ZVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGluZmxhdGVkID0gaW5mbGF0ZVJlbmRlckxpbmVPdXRwdXQoYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGlzc3VlICMzNzIwODogQ29sbGFwc2luZyBidWxsZXQgcG9pbnQgY29udGFpbmluZyBlbW9qaSBpbiBNYXJrZG93biBkb2N1bWVudCByZXN1bHRzIGluIFs/P10gY2hhcmFjdGVyXG5cdHRlc3QoJ2lzc3VlLTM3MjA4JywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdHVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnM6IHRydWUsXG5cdFx0XHRsaW5lQ29udGVudDogJyAgMS4gXHVEODNEXHVERTRGJyxcblx0XHRcdGlzQmFzaWNBU0NJSTogZmFsc2UsXG5cdFx0XHRsaW5lVG9rZW5zOiBjcmVhdGVWaWV3TGluZVRva2VucyhbY3JlYXRlUGFydCg3LCAzKV0pLFxuXHRcdFx0bGluZURlY29yYXRpb25zOiBbbmV3IExpbmVEZWNvcmF0aW9uKDcsIDgsICdpbmxpbmUtZm9sZGVkJywgSW5saW5lRGVjb3JhdGlvblR5cGUuQWZ0ZXIpXSxcblx0XHRcdHRhYlNpemU6IDIsXG5cdFx0XHRzdG9wUmVuZGVyaW5nTGluZUFmdGVyOiAxMDAwMFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGluZmxhdGVkID0gaW5mbGF0ZVJlbmRlckxpbmVPdXRwdXQoYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGlzc3VlICMzNzQwMSAjNDAxMjc6IEFsbG93IGJvdGggYmVmb3JlIGFuZCBhZnRlciBkZWNvcmF0aW9ucyBvbiBlbXB0eSBsaW5lXG5cdHRlc3QoJ2lzc3VlLTM3NDAxJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdHVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnM6IHRydWUsXG5cdFx0XHRsaW5lQ29udGVudDogJycsXG5cdFx0XHRsaW5lVG9rZW5zOiBjcmVhdGVWaWV3TGluZVRva2VucyhbY3JlYXRlUGFydCgwLCAzKV0pLFxuXHRcdFx0bGluZURlY29yYXRpb25zOiBbXG5cdFx0XHRcdG5ldyBMaW5lRGVjb3JhdGlvbigxLCAxLCAnYmVmb3JlJywgSW5saW5lRGVjb3JhdGlvblR5cGUuQmVmb3JlKSxcblx0XHRcdFx0bmV3IExpbmVEZWNvcmF0aW9uKDEsIDEsICdhZnRlcicsIElubGluZURlY29yYXRpb25UeXBlLkFmdGVyKSxcblx0XHRcdF0sXG5cdFx0XHR0YWJTaXplOiAyLFxuXHRcdFx0c3RvcFJlbmRlcmluZ0xpbmVBZnRlcjogMTAwMDBcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KGFjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjMTE4NzU5OiBlbmFibGUgbXVsdGlwbGUgdGV4dCBlZGl0b3IgZGVjb3JhdGlvbnMgaW4gZW1wdHkgbGluZXNcblx0dGVzdCgnaXNzdWUtMTE4NzU5JywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdHVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnM6IHRydWUsXG5cdFx0XHRsaW5lQ29udGVudDogJycsXG5cdFx0XHRsaW5lVG9rZW5zOiBjcmVhdGVWaWV3TGluZVRva2VucyhbY3JlYXRlUGFydCgwLCAzKV0pLFxuXHRcdFx0bGluZURlY29yYXRpb25zOiBbXG5cdFx0XHRcdG5ldyBMaW5lRGVjb3JhdGlvbigxLCAxLCAnYWZ0ZXIxJywgSW5saW5lRGVjb3JhdGlvblR5cGUuQWZ0ZXIpLFxuXHRcdFx0XHRuZXcgTGluZURlY29yYXRpb24oMSwgMSwgJ2FmdGVyMicsIElubGluZURlY29yYXRpb25UeXBlLkFmdGVyKSxcblx0XHRcdFx0bmV3IExpbmVEZWNvcmF0aW9uKDEsIDEsICdiZWZvcmUxJywgSW5saW5lRGVjb3JhdGlvblR5cGUuQmVmb3JlKSxcblx0XHRcdFx0bmV3IExpbmVEZWNvcmF0aW9uKDEsIDEsICdiZWZvcmUyJywgSW5saW5lRGVjb3JhdGlvblR5cGUuQmVmb3JlKSxcblx0XHRcdF0sXG5cdFx0XHR0YWJTaXplOiAyLFxuXHRcdFx0c3RvcFJlbmRlcmluZ0xpbmVBZnRlcjogMTAwMDBcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KGFjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjMzg5MzU6IEdpdExlbnMgZW5kLW9mLWxpbmUgYmxhbWUgbm8gbG9uZ2VyIHJlbmRlcmluZ1xuXHR0ZXN0KCdpc3N1ZS0zODkzNScsIGFzeW5jICgpID0+IHtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHR1c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zOiB0cnVlLFxuXHRcdFx0bGluZUNvbnRlbnQ6ICdcXHR9Jyxcblx0XHRcdGxpbmVUb2tlbnM6IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtjcmVhdGVQYXJ0KDIsIDMpXSksXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnM6IFtcblx0XHRcdFx0bmV3IExpbmVEZWNvcmF0aW9uKDMsIDMsICdjZWQtVGV4dEVkaXRvckRlY29yYXRpb25UeXBlMi01ZTliOWIzZi0zIGNlZC1UZXh0RWRpdG9yRGVjb3JhdGlvblR5cGUyLTMnLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5CZWZvcmUpLFxuXHRcdFx0XHRuZXcgTGluZURlY29yYXRpb24oMywgMywgJ2NlZC1UZXh0RWRpdG9yRGVjb3JhdGlvblR5cGUyLTVlOWI5YjNmLTQgY2VkLVRleHRFZGl0b3JEZWNvcmF0aW9uVHlwZTItNCcsIElubGluZURlY29yYXRpb25UeXBlLkFmdGVyKSxcblx0XHRcdF0sXG5cdFx0XHRzdG9wUmVuZGVyaW5nTGluZUFmdGVyOiAxMDAwMFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGluZmxhdGVkID0gaW5mbGF0ZVJlbmRlckxpbmVPdXRwdXQoYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGlzc3VlICMxMzY2MjI6IElubGluZSBkZWNvcmF0aW9ucyBhcmUgbm90IHJlbmRlcmluZyBvbiBub24tQVNDSUkgbGluZXMgd2hlbiByZW5kZXJDb250cm9sQ2hhcmFjdGVycyBpcyBvblxuXHR0ZXN0KCdpc3N1ZS0xMzY2MjInLCBhc3luYyAoKSA9PiB7XG5cblx0XHRjb25zdCBhY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0dXNlTW9ub3NwYWNlT3B0aW1pemF0aW9uczogdHJ1ZSxcblx0XHRcdGxpbmVDb250ZW50OiAnc29tZSB0ZXh0IFx1MDBBMycsXG5cdFx0XHRpc0Jhc2ljQVNDSUk6IGZhbHNlLFxuXHRcdFx0bGluZVRva2VuczogY3JlYXRlVmlld0xpbmVUb2tlbnMoW2NyZWF0ZVBhcnQoMTEsIDMpXSksXG5cdFx0XHRsaW5lRGVjb3JhdGlvbnM6IFtcblx0XHRcdFx0bmV3IExpbmVEZWNvcmF0aW9uKDUsIDUsICdpbmxpbmVEZWMxJywgSW5saW5lRGVjb3JhdGlvblR5cGUuQWZ0ZXIpLFxuXHRcdFx0XHRuZXcgTGluZURlY29yYXRpb24oNiwgNiwgJ2lubGluZURlYzInLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5CZWZvcmUpLFxuXHRcdFx0XSxcblx0XHRcdHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXI6IDEwMDAwLFxuXHRcdFx0cmVuZGVyQ29udHJvbENoYXJhY3RlcnM6IHRydWVcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KGFjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjMjI4MzI6IENvbnNpZGVyIGZ1bGx3aWR0aCBjaGFyYWN0ZXJzIHdoZW4gcmVuZGVyaW5nIHRhYnNcblx0dGVzdCgnaXNzdWUtMjI4MzItMScsIGFzeW5jICgpID0+IHtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHR1c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zOiB0cnVlLFxuXHRcdFx0bGluZUNvbnRlbnQ6ICdhc2QgPSBcIlx1NjRFNlwiXFx0XFx0I2FzZCcsXG5cdFx0XHRpc0Jhc2ljQVNDSUk6IGZhbHNlLFxuXHRcdFx0bGluZVRva2VuczogY3JlYXRlVmlld0xpbmVUb2tlbnMoW2NyZWF0ZVBhcnQoMTUsIDMpXSksXG5cdFx0XHRzdG9wUmVuZGVyaW5nTGluZUFmdGVyOiAxMDAwMFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGluZmxhdGVkID0gaW5mbGF0ZVJlbmRlckxpbmVPdXRwdXQoYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGlzc3VlICMyMjgzMjogQ29uc2lkZXIgZnVsbHdpZHRoIGNoYXJhY3RlcnMgd2hlbiByZW5kZXJpbmcgdGFicyAocmVuZGVyIHdoaXRlc3BhY2UpXG5cdHRlc3QoJ2lzc3VlLTIyODMyLTInLCBhc3luYyAoKSA9PiB7XG5cblx0XHRjb25zdCBhY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0dXNlTW9ub3NwYWNlT3B0aW1pemF0aW9uczogdHJ1ZSxcblx0XHRcdGxpbmVDb250ZW50OiAnYXNkID0gXCJcdTY0RTZcIlxcdFxcdCNhc2QnLFxuXHRcdFx0aXNCYXNpY0FTQ0lJOiBmYWxzZSxcblx0XHRcdGxpbmVUb2tlbnM6IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtjcmVhdGVQYXJ0KDE1LCAzKV0pLFxuXHRcdFx0c3RvcFJlbmRlcmluZ0xpbmVBZnRlcjogMTAwMDAsXG5cdFx0XHRyZW5kZXJXaGl0ZXNwYWNlOiAnYWxsJ1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGluZmxhdGVkID0gaW5mbGF0ZVJlbmRlckxpbmVPdXRwdXQoYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGlzc3VlICMyMjM1MjogQ09NQklOSU5HIEFDVVRFIEFDQ0VOVCAoVSswMzAxKVxuXHR0ZXN0KCdpc3N1ZS0yMjM1Mi0xJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdHVzZU1vbm9zcGFjZU9wdGltaXphdGlvbnM6IHRydWUsXG5cdFx0XHRsaW5lQ29udGVudDogJzEyMzQ1Njg5MDEyMzQ1Njc4OTAxMjM0NTY4OTAxMjM0NTY3ODkwMTIzNDU2ODkwYWJhXHUwMzAxYmEnLFxuXHRcdFx0aXNCYXNpY0FTQ0lJOiBmYWxzZSxcblx0XHRcdGxpbmVUb2tlbnM6IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtjcmVhdGVQYXJ0KDUzLCAzKV0pLFxuXHRcdFx0c3RvcFJlbmRlcmluZ0xpbmVBZnRlcjogMTAwMDBcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KGFjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjMjIzNTI6IFBhcnRpYWxseSBCcm9rZW4gQ29tcGxleCBTY3JpcHQgUmVuZGVyaW5nIG9mIFRhbWlsXG5cdHRlc3QoJ2lzc3VlLTIyMzUyLTInLCBhc3luYyAoKSA9PiB7XG5cblx0XHRjb25zdCBhY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0dXNlTW9ub3NwYWNlT3B0aW1pemF0aW9uczogdHJ1ZSxcblx0XHRcdGxpbmVDb250ZW50OiAnIEpveVNoYXJlXHUwQkIyXHUwQkNEIFx1MEJBQVx1MEJCRlx1MEJBOVx1MEJDRFx1MEJBNFx1MEJDQVx1MEI5Rlx1MEJCMFx1MEJDRFx1MEJBOFx1MEJDRFx1MEJBNFx1MEJDMSwgXHUwQkI1XHUwQkJGXHUwQjlGXHUwQkMwXHUwQkFGXHUwQkNCLCBcdTBCOUNcdTBCQ0JcdTBCOTVcdTBCQ0RcdTBCOTVcdTBCQzFcdTBCOTVcdTBCQjNcdTBCQ0QsIFx1MEI4NVx1MEJBOVx1MEJCRlx1MEJBRVx1MEJDN1x1MEI5QVx1MEJBOVx1MEJDRCwgXHUwQkE4XHUwQjk1XHUwQkM4XHUwQjlBXHUwQkNEXHUwQjlBXHUwQkMxXHUwQkI1XHUwQkM4IFx1MEJBQVx1MEI5Rlx1MEI5OVx1MEJDRFx1MEI5NVx1MEJCM1x1MEJDRCBcdTBCQUVcdTBCQjFcdTBCQ0RcdTBCQjFcdTBCQzFcdTBCQUVcdTBCQ0QgXHUwQjlBXHUwQkM2XHUwQkFGXHUwQkNEXHUwQkE0XHUwQkJGXHUwQjk1XHUwQkIzXHUwQkM4IFx1MEJBQVx1MEJDNlx1MEJCMVx1MEJDMVx1MEJCNVx1MEJDMFx1MEJCMFx1MEJDRCcsXG5cdFx0XHRpc0Jhc2ljQVNDSUk6IGZhbHNlLFxuXHRcdFx0bGluZVRva2VuczogY3JlYXRlVmlld0xpbmVUb2tlbnMoW2NyZWF0ZVBhcnQoMTAwLCAzKV0pLFxuXHRcdFx0c3RvcFJlbmRlcmluZ0xpbmVBZnRlcjogMTAwMDBcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KGFjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjNDI3MDA6IEhpbmRpIGNoYXJhY3RlcnMgYXJlIG5vdCBiZWluZyByZW5kZXJlZCBwcm9wZXJseVxuXHR0ZXN0KCdpc3N1ZS00MjcwMCcsIGFzeW5jICgpID0+IHtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHR1c2VNb25vc3BhY2VPcHRpbWl6YXRpb25zOiB0cnVlLFxuXHRcdFx0bGluZUNvbnRlbnQ6ICcgXHUwOTM1XHUwOTRCIFx1MDkxMFx1MDkzOFx1MDkzRSBcdTA5MTVcdTA5NERcdTA5MkZcdTA5M0UgXHUwOTM5XHUwOTQ4IFx1MDkxQ1x1MDk0QiBcdTA5MzlcdTA5MkVcdTA5M0VcdTA5MzBcdTA5NDcgXHUwOTA1XHUwOTAyXHUwOTI2XHUwOTMwIFx1MDkyRFx1MDk0MCBcdTA5MzlcdTA5NDggXHUwOTE0XHUwOTMwIFx1MDkyQ1x1MDkzRVx1MDkzOVx1MDkzMCBcdTA5MkRcdTA5NDAgXHUwOTM5XHUwOTQ4XHUwOTY0IFx1MDkxQ1x1MDkzRlx1MDkzOFx1MDkxNVx1MDk0MCBcdTA5MzVcdTA5MUNcdTA5MzkgXHUwOTM4XHUwOTQ3IFx1MDkzOVx1MDkyRSBcdTA5MzhcdTA5MkMgXHUwOTM5XHUwOTQ4XHUwOTAyXHUwOTY0IFx1MDkxQ1x1MDkzRlx1MDkzOFx1MDkyOFx1MDk0NyBcdTA5MDdcdTA5MzggXHUwOTM4XHUwOTQzXHUwOTM3XHUwOTREXHUwOTFGXHUwOTNGIFx1MDkxNVx1MDk0MCBcdTA5MzBcdTA5MUFcdTA5MjhcdTA5M0UgXHUwOTE1XHUwOTQwIFx1MDkzOVx1MDk0OFx1MDk2NCcsXG5cdFx0XHRpc0Jhc2ljQVNDSUk6IGZhbHNlLFxuXHRcdFx0bGluZVRva2VuczogY3JlYXRlVmlld0xpbmVUb2tlbnMoW2NyZWF0ZVBhcnQoMTA1LCAzKV0pLFxuXHRcdFx0c3RvcFJlbmRlcmluZ0xpbmVBZnRlcjogMTAwMDBcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KGFjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjMzgxMjM6IGVkaXRvci5yZW5kZXJXaGl0ZXNwYWNlOiBcImJvdW5kYXJ5XCIgcmVuZGVycyB3aGl0ZXNwYWNlIGF0IGxpbmUgd3JhcCBwb2ludCB3aGVuIGxpbmUgaXMgd3JhcHBlZFxuXHR0ZXN0KCdpc3N1ZS0zODEyMycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0dXNlTW9ub3NwYWNlT3B0aW1pemF0aW9uczogdHJ1ZSxcblx0XHRcdGxpbmVDb250ZW50OiAnVGhpcyBpcyBhIGxvbmcgbGluZSB3aGljaCBuZXZlciB1c2VzIG1vcmUgdGhhbiB0d28gc3BhY2VzLiAnLFxuXHRcdFx0Y29udGludWVzV2l0aFdyYXBwZWRMaW5lOiB0cnVlLFxuXHRcdFx0bGluZVRva2VuczogY3JlYXRlVmlld0xpbmVUb2tlbnMoW2NyZWF0ZVBhcnQoNTksIDMpXSksXG5cdFx0XHRzdG9wUmVuZGVyaW5nTGluZUFmdGVyOiAxMDAwMCxcblx0XHRcdHJlbmRlcldoaXRlc3BhY2U6ICdib3VuZGFyeSdcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KGFjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjMzM1MjU6IExvbmcgbGluZSB3aXRoIGxpZ2F0dXJlcyB0YWtlcyBhIGxvbmcgdGltZSB0byBwYWludCBkZWNvcmF0aW9uc1xuXHR0ZXN0KCdpc3N1ZS0zMzUyNS0xJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHRjYW5Vc2VIYWxmd2lkdGhSaWdodHdhcmRzQXJyb3c6IGZhbHNlLFxuXHRcdFx0bGluZUNvbnRlbnQ6ICdhcHBlbmQgZGF0YSB0byBhcHBlbmQgZGF0YSB0byBhcHBlbmQgZGF0YSB0byBhcHBlbmQgZGF0YSB0byBhcHBlbmQgZGF0YSB0byBhcHBlbmQgZGF0YSB0byBhcHBlbmQgZGF0YSB0byBhcHBlbmQgZGF0YSB0byBhcHBlbmQgZGF0YSB0byBhcHBlbmQgZGF0YSB0byBhcHBlbmQgZGF0YSB0byBhcHBlbmQgZGF0YSB0byBhcHBlbmQgZGF0YSB0bycsXG5cdFx0XHRsaW5lVG9rZW5zOiBjcmVhdGVWaWV3TGluZVRva2VucyhbY3JlYXRlUGFydCgxOTQsIDMpXSksXG5cdFx0XHRzdG9wUmVuZGVyaW5nTGluZUFmdGVyOiAxMDAwMCxcblx0XHRcdGZvbnRMaWdhdHVyZXM6IHRydWVcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpbmZsYXRlZCA9IGluZmxhdGVSZW5kZXJMaW5lT3V0cHV0KGFjdHVhbCk7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQuaHRtbC5qb2luKCcnKSwgSFRNTF9FWFRFTlNJT04pO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLm1hcHBpbmcpO1xuXHR9KTtcblxuXHQvLyBpc3N1ZSAjMzM1MjU6IExvbmcgbGluZSB3aXRoIGxpZ2F0dXJlcyB0YWtlcyBhIGxvbmcgdGltZSB0byBwYWludCBkZWNvcmF0aW9ucyAtIG5vdCBwb3NzaWJsZVxuXHR0ZXN0KCdpc3N1ZS0zMzUyNS0yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHRjYW5Vc2VIYWxmd2lkdGhSaWdodHdhcmRzQXJyb3c6IGZhbHNlLFxuXHRcdFx0bGluZUNvbnRlbnQ6ICdhcHBlbmRkYXRhdG9hcHBlbmRkYXRhdG9hcHBlbmRkYXRhdG9hcHBlbmRkYXRhdG9hcHBlbmRkYXRhdG9hcHBlbmRkYXRhdG9hcHBlbmRkYXRhdG9hcHBlbmRkYXRhdG9hcHBlbmRkYXRhdG9hcHBlbmRkYXRhdG9hcHBlbmRkYXRhdG9hcHBlbmRkYXRhdG9hcHBlbmRkYXRhdG8nLFxuXHRcdFx0bGluZVRva2VuczogY3JlYXRlVmlld0xpbmVUb2tlbnMoW2NyZWF0ZVBhcnQoMTk0LCAzKV0pLFxuXHRcdFx0c3RvcFJlbmRlcmluZ0xpbmVBZnRlcjogMTAwMDAsXG5cdFx0XHRmb250TGlnYXR1cmVzOiB0cnVlXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5mbGF0ZWQgPSBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChhY3R1YWwpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gaXNzdWUgIzkxOTM2OiBTZW1hbnRpYyB0b2tlbiBjb2xvciBoaWdobGlnaHRpbmcgZmFpbHMgb24gbGluZSB3aXRoIHNlbGVjdGVkIHRleHRcblx0dGVzdCgnaXNzdWUtOTE5MzYnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0dWFsID0gcmVuZGVyVmlld0xpbmUoY3JlYXRlUmVuZGVyTGluZUlucHV0KHtcblx0XHRcdGxpbmVDb250ZW50OiAnICAgICAgICAgICAgICAgICAgICBlbHNlIGlmICgkcyA9IDA4KSB0aGVuIFxcJ1xcXFxiXFwnJyxcblx0XHRcdGxpbmVUb2tlbnM6IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtcblx0XHRcdFx0Y3JlYXRlUGFydCgyMCwgMSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMjQsIDE1KSxcblx0XHRcdFx0Y3JlYXRlUGFydCgyNSwgMSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMjcsIDE1KSxcblx0XHRcdFx0Y3JlYXRlUGFydCgyOCwgMSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMjksIDEpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDI5LCAxKSxcblx0XHRcdFx0Y3JlYXRlUGFydCgzMSwgMTYpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDMyLCAxKSxcblx0XHRcdFx0Y3JlYXRlUGFydCgzMywgMSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMzQsIDEpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDM2LCA2KSxcblx0XHRcdFx0Y3JlYXRlUGFydCgzNiwgMSksXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMzcsIDEpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDM4LCAxKSxcblx0XHRcdFx0Y3JlYXRlUGFydCg0MiwgMTUpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDQzLCAxKSxcblx0XHRcdFx0Y3JlYXRlUGFydCg0NywgMTEpXG5cdFx0XHRdKSxcblx0XHRcdHN0b3BSZW5kZXJpbmdMaW5lQWZ0ZXI6IDEwMDAwLFxuXHRcdFx0cmVuZGVyV2hpdGVzcGFjZTogJ3NlbGVjdGlvbicsXG5cdFx0XHRzZWxlY3Rpb25zT25MaW5lOiBbbmV3IE9mZnNldFJhbmdlKDAsIDQ3KV0sXG5cdFx0XHRtaWRkb3RXaWR0aDogMTEsXG5cdFx0XHR3c21pZGRvdFdpZHRoOiAxMVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGluZmxhdGVkID0gaW5mbGF0ZVJlbmRlckxpbmVPdXRwdXQoYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGlzc3VlICMxMTk0MTY6IERlbGV0ZSBDb250cm9sIENoYXJhY3RlciAoVSswMDdGIC8gJiMxMjc7KSBkaXNwbGF5ZWQgYXMgc3BhY2Vcblx0dGVzdCgnaXNzdWUtMTE5NDE2JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbCA9IHJlbmRlclZpZXdMaW5lKGNyZWF0ZVJlbmRlckxpbmVJbnB1dCh7XG5cdFx0XHRjYW5Vc2VIYWxmd2lkdGhSaWdodHdhcmRzQXJyb3c6IGZhbHNlLFxuXHRcdFx0bGluZUNvbnRlbnQ6ICdbJyArIFN0cmluZy5mcm9tQ2hhckNvZGUoMTI3KSArICddIFsnICsgU3RyaW5nLmZyb21DaGFyQ29kZSgwKSArICddJyxcblx0XHRcdGxpbmVUb2tlbnM6IGNyZWF0ZVZpZXdMaW5lVG9rZW5zKFtjcmVhdGVQYXJ0KDcsIDMpXSksXG5cdFx0XHRzdG9wUmVuZGVyaW5nTGluZUFmdGVyOiAxMDAwMCxcblx0XHRcdHJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzOiB0cnVlLFxuXHRcdFx0Zm9udExpZ2F0dXJlczogdHJ1ZVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGluZmxhdGVkID0gaW5mbGF0ZVJlbmRlckxpbmVPdXRwdXQoYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xuXG5cdC8vIGlzc3VlICMxMTY5Mzk6IEltcG9ydGFudCBjb250cm9sIGNoYXJhY3RlcnMgYXJlbid0IHJlbmRlcmVkXG5cdHRlc3QoJ2lzc3VlLTExNjkzOScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0Y2FuVXNlSGFsZndpZHRoUmlnaHR3YXJkc0Fycm93OiBmYWxzZSxcblx0XHRcdGxpbmVDb250ZW50OiBgdHJhbnNmZXJCYWxhbmNlKDU2NzgsJHtTdHJpbmcuZnJvbUNoYXJDb2RlKDB4MjAyRSl9Njc3Niw0MzIxJHtTdHJpbmcuZnJvbUNoYXJDb2RlKDB4MjAyQyl9LFwiVVNEXCIpO2AsXG5cdFx0XHRpc0Jhc2ljQVNDSUk6IGZhbHNlLFxuXHRcdFx0bGluZVRva2VuczogY3JlYXRlVmlld0xpbmVUb2tlbnMoW2NyZWF0ZVBhcnQoNDIsIDMpXSksXG5cdFx0XHRzdG9wUmVuZGVyaW5nTGluZUFmdGVyOiAxMDAwMCxcblx0XHRcdHJlbmRlckNvbnRyb2xDaGFyYWN0ZXJzOiB0cnVlXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgaW5mbGF0ZWQgPSBpbmZsYXRlUmVuZGVyTGluZU91dHB1dChhY3R1YWwpO1xuXHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KGluZmxhdGVkLmh0bWwuam9pbignJyksIEhUTUxfRVhURU5TSU9OKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5tYXBwaW5nKTtcblx0fSk7XG5cblx0Ly8gaXNzdWUgIzEyNDAzODogTXVsdGlwbGUgZW5kLW9mLWxpbmUgdGV4dCBkZWNvcmF0aW9ucyBnZXQgbWVyZ2VkXG5cdHRlc3QoJ2lzc3VlLTEyNDAzOCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3R1YWwgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0dXNlTW9ub3NwYWNlT3B0aW1pemF0aW9uczogdHJ1ZSxcblx0XHRcdGNhblVzZUhhbGZ3aWR0aFJpZ2h0d2FyZHNBcnJvdzogZmFsc2UsXG5cdFx0XHRsaW5lQ29udGVudDogJyAgICBpZicsXG5cdFx0XHRsaW5lVG9rZW5zOiBjcmVhdGVWaWV3TGluZVRva2VucyhbY3JlYXRlUGFydCg0LCAxKSwgY3JlYXRlUGFydCg2LCAyKV0pLFxuXHRcdFx0bGluZURlY29yYXRpb25zOiBbXG5cdFx0XHRcdG5ldyBMaW5lRGVjb3JhdGlvbig3LCA3LCAnY2VkLTEtVGV4dEVkaXRvckRlY29yYXRpb25UeXBlMi0xN2MxNGQ5OC0zIGNlZC0xLVRleHRFZGl0b3JEZWNvcmF0aW9uVHlwZTItMycsIElubGluZURlY29yYXRpb25UeXBlLkJlZm9yZSksXG5cdFx0XHRcdG5ldyBMaW5lRGVjb3JhdGlvbig3LCA3LCAnY2VkLTEtVGV4dEVkaXRvckRlY29yYXRpb25UeXBlMi0xN2MxNGQ5OC00IGNlZC0xLVRleHRFZGl0b3JEZWNvcmF0aW9uVHlwZTItNCcsIElubGluZURlY29yYXRpb25UeXBlLkFmdGVyKSxcblx0XHRcdFx0bmV3IExpbmVEZWNvcmF0aW9uKDcsIDcsICdjZWQtZ2hvc3QtdGV4dC0xLTQnLCBJbmxpbmVEZWNvcmF0aW9uVHlwZS5BZnRlciksXG5cdFx0XHRdLFxuXHRcdFx0c3RvcFJlbmRlcmluZ0xpbmVBZnRlcjogMTAwMDAsXG5cdFx0XHRyZW5kZXJXaGl0ZXNwYWNlOiAnYWxsJ1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGluZmxhdGVkID0gaW5mbGF0ZVJlbmRlckxpbmVPdXRwdXQoYWN0dWFsKTtcblx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChpbmZsYXRlZC5odG1sLmpvaW4oJycpLCBIVE1MX0VYVEVOU0lPTik7XG5cdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QoaW5mbGF0ZWQubWFwcGluZyk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KGxpbmVDb250ZW50OiBzdHJpbmcsIHRhYlNpemU6IG51bWJlciwgcGFydHM6IFRlc3RMaW5lVG9rZW5bXSwgZXhwZWN0ZWRQYXJ0TGVuZ3RoczogbnVtYmVyW10pOiAocGFydEluZGV4OiBudW1iZXIsIHBhcnRMZW5ndGg6IG51bWJlciwgb2Zmc2V0OiBudW1iZXIsIGV4cGVjdGVkOiBudW1iZXIpID0+IHZvaWQge1xuXHRcdGNvbnN0IHJlbmRlckxpbmVPdXRwdXQgPSByZW5kZXJWaWV3TGluZShjcmVhdGVSZW5kZXJMaW5lSW5wdXQoe1xuXHRcdFx0bGluZUNvbnRlbnQsXG5cdFx0XHR0YWJTaXplLFxuXHRcdFx0bGluZVRva2VuczogY3JlYXRlVmlld0xpbmVUb2tlbnMocGFydHMpXG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIChwYXJ0SW5kZXg6IG51bWJlciwgcGFydExlbmd0aDogbnVtYmVyLCBvZmZzZXQ6IG51bWJlciwgZXhwZWN0ZWQ6IG51bWJlcikgPT4ge1xuXHRcdFx0Y29uc3QgYWN0dWFsQ29sdW1uID0gcmVuZGVyTGluZU91dHB1dC5jaGFyYWN0ZXJNYXBwaW5nLmdldENvbHVtbihuZXcgRG9tUG9zaXRpb24ocGFydEluZGV4LCBvZmZzZXQpLCBwYXJ0TGVuZ3RoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxDb2x1bW4sIGV4cGVjdGVkLCAnZ2V0Q29sdW1uIGZvciAnICsgcGFydEluZGV4ICsgJywgJyArIG9mZnNldCk7XG5cdFx0fTtcblx0fVxuXG5cdHRlc3QoJ2dldENvbHVtbk9mTGluZVBhcnRPZmZzZXQgMSAtIHNpbXBsZSB0ZXh0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0ID0gY3JlYXRlVGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoXG5cdFx0XHQnaGVsbG8gd29ybGQnLFxuXHRcdFx0NCxcblx0XHRcdFtcblx0XHRcdFx0Y3JlYXRlUGFydCgxMSwgMSlcblx0XHRcdF0sXG5cdFx0XHRbMTFdXG5cdFx0KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCAxMSwgMCwgMSk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMCwgMTEsIDEsIDIpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDExLCAyLCAzKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCAxMSwgMywgNCk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMCwgMTEsIDQsIDUpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDExLCA1LCA2KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCAxMSwgNiwgNyk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMCwgMTEsIDcsIDgpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDExLCA4LCA5KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCAxMSwgOSwgMTApO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDExLCAxMCwgMTEpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDExLCAxMSwgMTIpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0IDIgLSByZWd1bGFyIEpTJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0ID0gY3JlYXRlVGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoXG5cdFx0XHQndmFyIHggPSAzOycsXG5cdFx0XHQ0LFxuXHRcdFx0W1xuXHRcdFx0XHRjcmVhdGVQYXJ0KDMsIDEpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDQsIDIpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDUsIDMpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDgsIDQpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDksIDUpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDEwLCA2KSxcblx0XHRcdF0sXG5cdFx0XHRbMywgMSwgMSwgMywgMSwgMV1cblx0XHQpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDMsIDAsIDEpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDMsIDEsIDIpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDMsIDIsIDMpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDMsIDMsIDQpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDEsIDEsIDAsIDQpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDEsIDEsIDEsIDUpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDIsIDEsIDAsIDUpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDIsIDEsIDEsIDYpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDMsIDMsIDAsIDYpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDMsIDMsIDEsIDcpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDMsIDMsIDIsIDgpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDMsIDMsIDMsIDkpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDQsIDEsIDAsIDkpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDQsIDEsIDEsIDEwKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCg1LCAxLCAwLCAxMCk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoNSwgMSwgMSwgMTEpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0IDMgLSB0YWIgd2l0aCB0YWIgc2l6ZSA2JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0ID0gY3JlYXRlVGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoXG5cdFx0XHQnXFx0Jyxcblx0XHRcdDYsXG5cdFx0XHRbXG5cdFx0XHRcdGNyZWF0ZVBhcnQoMSwgMSlcblx0XHRcdF0sXG5cdFx0XHRbNl1cblx0XHQpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDYsIDAsIDEpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDYsIDEsIDEpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDYsIDIsIDEpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDYsIDMsIDEpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDYsIDQsIDIpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDYsIDUsIDIpO1xuXHRcdHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0KDAsIDYsIDYsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0IDQgLSBvbmNlIGluZGVudGVkIGxpbmUsIHRhYiBzaXplIDQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQgPSBjcmVhdGVUZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldChcblx0XHRcdCdcXHRmdW5jdGlvbicsXG5cdFx0XHQ0LFxuXHRcdFx0W1xuXHRcdFx0XHRjcmVhdGVQYXJ0KDEsIDEpLFxuXHRcdFx0XHRjcmVhdGVQYXJ0KDksIDIpLFxuXHRcdFx0XSxcblx0XHRcdFs0LCA4XVxuXHRcdCk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMCwgNCwgMCwgMSk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMCwgNCwgMSwgMSk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMCwgNCwgMiwgMSk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMCwgNCwgMywgMik7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMCwgNCwgNCwgMik7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMSwgOCwgMCwgMik7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMSwgOCwgMSwgMyk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMSwgOCwgMiwgNCk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMSwgOCwgMywgNSk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMSwgOCwgNCwgNik7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMSwgOCwgNSwgNyk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMSwgOCwgNiwgOCk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMSwgOCwgNywgOSk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMSwgOCwgOCwgMTApO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0IDUgLSB0d2ljZSBpbmRlbnRlZCBsaW5lLCB0YWIgc2l6ZSA0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RHZXRDb2x1bW5PZkxpbmVQYXJ0T2Zmc2V0ID0gY3JlYXRlVGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoXG5cdFx0XHQnXFx0XFx0ZnVuY3Rpb24nLFxuXHRcdFx0NCxcblx0XHRcdFtcblx0XHRcdFx0Y3JlYXRlUGFydCgyLCAxKSxcblx0XHRcdFx0Y3JlYXRlUGFydCgxMCwgMiksXG5cdFx0XHRdLFxuXHRcdFx0WzgsIDhdXG5cdFx0KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCA4LCAwLCAxKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCA4LCAxLCAxKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCA4LCAyLCAxKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCA4LCAzLCAyKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCA4LCA0LCAyKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCA4LCA1LCAyKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCA4LCA2LCAyKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCA4LCA3LCAzKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgwLCA4LCA4LCAzKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgxLCA4LCAwLCAzKTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgxLCA4LCAxLCA0KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgxLCA4LCAyLCA1KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgxLCA4LCAzLCA2KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgxLCA4LCA0LCA3KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgxLCA4LCA1LCA4KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgxLCA4LCA2LCA5KTtcblx0XHR0ZXN0R2V0Q29sdW1uT2ZMaW5lUGFydE9mZnNldCgxLCA4LCA3LCAxMCk7XG5cdFx0dGVzdEdldENvbHVtbk9mTGluZVBhcnRPZmZzZXQoMSwgOCwgOCwgMTEpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FB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QztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxrQ0FBOEIsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLEVBQzFDLENBQUM7QUFFRCxPQUFLLGlFQUFpRSxNQUFNO0FBQzNFLFVBQU0sZ0NBQWdDO0FBQUEsTUFDckM7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLFFBQ0MsV0FBVyxHQUFHLENBQUM7QUFBQSxRQUNmLFdBQVcsSUFBSSxDQUFDO0FBQUEsTUFDakI7QUFBQSxNQUNBLENBQUMsR0FBRyxDQUFDO0FBQUEsSUFDTjtBQUNBLGtDQUE4QixHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQ3hDLGtDQUE4QixHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQ3hDLGtDQUE4QixHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQ3hDLGtDQUE4QixHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQ3hDLGtDQUE4QixHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQ3hDLGtDQUE4QixHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQ3hDLGtDQUE4QixHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQ3hDLGtDQUE4QixHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQ3hDLGtDQUE4QixHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQ3hDLGtDQUE4QixHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQ3hDLGtDQUE4QixHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQ3hDLGtDQUE4QixHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQ3hDLGtDQUE4QixHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQ3hDLGtDQUE4QixHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQ3hDLGtDQUE4QixHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQ3hDLGtDQUE4QixHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQ3hDLGtDQUE4QixHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQ3pDLGtDQUE4QixHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsRUFDMUMsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
