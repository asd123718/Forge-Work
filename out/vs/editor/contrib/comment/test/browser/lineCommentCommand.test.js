var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import assert from "assert";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Selection } from "../../../../common/core/selection.js";
import { ColorId, MetadataConsts } from "../../../../common/encodedTokenAttributes.js";
import { EncodedTokenizationResult, TokenizationRegistry } from "../../../../common/languages.js";
import { ILanguageService } from "../../../../common/languages/language.js";
import { ILanguageConfigurationService } from "../../../../common/languages/languageConfigurationRegistry.js";
import { NullState } from "../../../../common/languages/nullTokenize.js";
import { LineCommentCommand, Type } from "../../browser/lineCommentCommand.js";
import { testCommand } from "../../../../test/browser/testCommand.js";
import { TestLanguageConfigurationService } from "../../../../test/common/modes/testLanguageConfigurationService.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
function createTestCommandHelper(commentsConfig, commandFactory) {
  return (lines, selection, expectedLines, expectedSelection) => {
    const languageId = "commentMode";
    const prepare = (accessor, disposables) => {
      const languageConfigurationService = accessor.get(ILanguageConfigurationService);
      const languageService = accessor.get(ILanguageService);
      disposables.add(languageService.registerLanguage({ id: languageId }));
      disposables.add(languageConfigurationService.register(languageId, {
        comments: commentsConfig
      }));
    };
    testCommand(lines, languageId, selection, commandFactory, expectedLines, expectedSelection, false, prepare);
  };
}
suite("Editor Contrib - Line Comment Command", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const testLineCommentCommand = createTestCommandHelper(
    { lineComment: "!@#", blockComment: ["<!@#", "#@!>"] },
    (accessor, sel) => new LineCommentCommand(accessor.get(ILanguageConfigurationService), sel, 4, Type.Toggle, true, true)
  );
  const testAddLineCommentCommand = createTestCommandHelper(
    { lineComment: "!@#", blockComment: ["<!@#", "#@!>"] },
    (accessor, sel) => new LineCommentCommand(accessor.get(ILanguageConfigurationService), sel, 4, Type.ForceAdd, true, true)
  );
  const testLineCommentCommandTokenFirstColumn = createTestCommandHelper(
    { lineComment: { comment: "!@#", noIndent: true }, blockComment: ["<!@#", "#@!>"] },
    (accessor, sel) => new LineCommentCommand(accessor.get(ILanguageConfigurationService), sel, 4, Type.Toggle, true, true)
  );
  test("comment single line", function() {
    testLineCommentCommand(
      [
        "some text",
        "	some more text"
      ],
      new Selection(1, 1, 1, 1),
      [
        "!@# some text",
        "	some more text"
      ],
      new Selection(1, 5, 1, 5)
    );
  });
  test("case insensitive", function() {
    const testLineCommentCommand2 = createTestCommandHelper(
      { lineComment: "rem" },
      (accessor, sel) => new LineCommentCommand(accessor.get(ILanguageConfigurationService), sel, 4, Type.Toggle, true, true)
    );
    testLineCommentCommand2(
      [
        "REM some text"
      ],
      new Selection(1, 1, 1, 1),
      [
        "some text"
      ],
      new Selection(1, 1, 1, 1)
    );
  });
  test("comment with token column fixed", function() {
    testLineCommentCommandTokenFirstColumn(
      [
        "some text",
        "	some more text"
      ],
      new Selection(2, 1, 2, 1),
      [
        "some text",
        "!@# 	some more text"
      ],
      new Selection(2, 5, 2, 5)
    );
  });
  function createSimpleModel(lines) {
    return {
      getLineContent: (lineNumber) => {
        return lines[lineNumber - 1];
      }
    };
  }
  function createBasicLinePreflightData(commentTokens) {
    return commentTokens.map((commentString) => {
      const r = {
        ignore: false,
        commentStr: commentString,
        commentStrOffset: 0,
        commentStrLength: commentString.length
      };
      return r;
    });
  }
  test("_analyzeLines", () => {
    const disposable = new DisposableStore();
    let r;
    r = LineCommentCommand._analyzeLines(Type.Toggle, true, createSimpleModel([
      "		",
      "    ",
      "    c",
      "		d"
    ]), createBasicLinePreflightData(["//", "rem", "!@#", "!@#"]), 1, true, false, disposable.add(new TestLanguageConfigurationService()), "plaintext");
    if (!r.supported) {
      throw new Error(`unexpected`);
    }
    assert.strictEqual(r.shouldRemoveComments, false);
    assert.strictEqual(r.lines[0].commentStr, "//");
    assert.strictEqual(r.lines[1].commentStr, "rem");
    assert.strictEqual(r.lines[2].commentStr, "!@#");
    assert.strictEqual(r.lines[3].commentStr, "!@#");
    assert.strictEqual(r.lines[0].ignore, true);
    assert.strictEqual(r.lines[1].ignore, true);
    assert.strictEqual(r.lines[2].ignore, false);
    assert.strictEqual(r.lines[3].ignore, false);
    assert.strictEqual(r.lines[0].commentStrOffset, 2);
    assert.strictEqual(r.lines[1].commentStrOffset, 4);
    assert.strictEqual(r.lines[2].commentStrOffset, 4);
    assert.strictEqual(r.lines[3].commentStrOffset, 2);
    r = LineCommentCommand._analyzeLines(Type.Toggle, true, createSimpleModel([
      "		",
      "    rem ",
      "    !@# c",
      "		!@#d"
    ]), createBasicLinePreflightData(["//", "rem", "!@#", "!@#"]), 1, true, false, disposable.add(new TestLanguageConfigurationService()), "plaintext");
    if (!r.supported) {
      throw new Error(`unexpected`);
    }
    assert.strictEqual(r.shouldRemoveComments, true);
    assert.strictEqual(r.lines[0].commentStr, "//");
    assert.strictEqual(r.lines[1].commentStr, "rem");
    assert.strictEqual(r.lines[2].commentStr, "!@#");
    assert.strictEqual(r.lines[3].commentStr, "!@#");
    assert.strictEqual(r.lines[0].ignore, true);
    assert.strictEqual(r.lines[1].ignore, false);
    assert.strictEqual(r.lines[2].ignore, false);
    assert.strictEqual(r.lines[3].ignore, false);
    assert.strictEqual(r.lines[0].commentStrOffset, 2);
    assert.strictEqual(r.lines[1].commentStrOffset, 4);
    assert.strictEqual(r.lines[2].commentStrOffset, 4);
    assert.strictEqual(r.lines[3].commentStrOffset, 2);
    assert.strictEqual(r.lines[0].commentStrLength, 2);
    assert.strictEqual(r.lines[1].commentStrLength, 4);
    assert.strictEqual(r.lines[2].commentStrLength, 4);
    assert.strictEqual(r.lines[3].commentStrLength, 3);
    disposable.dispose();
  });
  test("_normalizeInsertionPoint", () => {
    const runTest = (mixedArr, tabSize, expected, testName) => {
      const model = createSimpleModel(mixedArr.filter((item, idx) => idx % 2 === 0));
      const offsets = mixedArr.filter((item, idx) => idx % 2 === 1).map((offset) => {
        return {
          commentStrOffset: offset,
          ignore: false
        };
      });
      LineCommentCommand._normalizeInsertionPoint(model, offsets, 1, tabSize);
      const actual = offsets.map((item) => item.commentStrOffset);
      assert.deepStrictEqual(actual, expected, testName);
    };
    runTest([
      "  XX",
      2,
      "    YY",
      4
    ], 4, [0, 0], "Bug 16696");
    runTest([
      "			XX",
      3,
      "    	YY",
      5,
      "        ZZ",
      8,
      "		TT",
      2
    ], 4, [2, 5, 8, 2], "Test1");
    runTest([
      "			   XX",
      6,
      "    				YY",
      8,
      "        ZZ",
      8,
      "		    TT",
      6
    ], 4, [2, 5, 8, 2], "Test2");
    runTest([
      "		",
      2,
      "			",
      3,
      "				",
      4,
      "			",
      3
    ], 4, [2, 2, 2, 2], "Test3");
    runTest([
      "		",
      2,
      "			",
      3,
      "				",
      4,
      "			",
      3,
      "    ",
      4
    ], 2, [2, 2, 2, 2, 4], "Test4");
    runTest([
      "		",
      2,
      "			",
      3,
      "				",
      4,
      "			",
      3,
      "    ",
      4
    ], 4, [1, 1, 1, 1, 4], "Test5");
    runTest([
      " 	",
      2,
      "  	",
      3,
      "   	",
      4,
      "    ",
      4,
      "	",
      1
    ], 4, [2, 3, 4, 4, 1], "Test6");
    runTest([
      " 		",
      3,
      "  		",
      4,
      "   		",
      5,
      "    	",
      5,
      "	",
      1
    ], 4, [2, 3, 4, 4, 1], "Test7");
    runTest([
      "	",
      1,
      "    ",
      4
    ], 4, [1, 4], "Test8:4");
    runTest([
      "	",
      1,
      "   ",
      3
    ], 4, [0, 0], "Test8:3");
    runTest([
      "	",
      1,
      "  ",
      2
    ], 4, [0, 0], "Test8:2");
    runTest([
      "	",
      1,
      " ",
      1
    ], 4, [0, 0], "Test8:1");
    runTest([
      "	",
      1,
      "",
      0
    ], 4, [0, 0], "Test8:0");
  });
  test("detects indentation", function() {
    testLineCommentCommand(
      [
        "	some text",
        "	some more text"
      ],
      new Selection(2, 2, 1, 1),
      [
        "	!@# some text",
        "	!@# some more text"
      ],
      new Selection(2, 2, 1, 1)
    );
  });
  test("detects mixed indentation", function() {
    testLineCommentCommand(
      [
        "	some text",
        "    some more text"
      ],
      new Selection(2, 2, 1, 1),
      [
        "	!@# some text",
        "    !@# some more text"
      ],
      new Selection(2, 2, 1, 1)
    );
  });
  test("ignores whitespace lines", function() {
    testLineCommentCommand(
      [
        "	some text",
        "	   ",
        "",
        "	some more text"
      ],
      new Selection(4, 2, 1, 1),
      [
        "	!@# some text",
        "	   ",
        "",
        "	!@# some more text"
      ],
      new Selection(4, 2, 1, 1)
    );
  });
  test("removes its own", function() {
    testLineCommentCommand(
      [
        "	!@# some text",
        "	   ",
        "		!@# some more text"
      ],
      new Selection(3, 2, 1, 1),
      [
        "	some text",
        "	   ",
        "		some more text"
      ],
      new Selection(3, 2, 1, 1)
    );
  });
  test("works in only whitespace", function() {
    testLineCommentCommand(
      [
        "	    ",
        "	",
        "		some more text"
      ],
      new Selection(3, 1, 1, 1),
      [
        "	!@#     ",
        "	!@# ",
        "		some more text"
      ],
      new Selection(3, 1, 1, 1)
    );
  });
  test("bug 9697 - whitespace before comment token", function() {
    testLineCommentCommand(
      [
        "	 !@#first",
        "	second line"
      ],
      new Selection(1, 1, 1, 1),
      [
        "	 first",
        "	second line"
      ],
      new Selection(1, 1, 1, 1)
    );
  });
  test("bug 10162 - line comment before caret", function() {
    testLineCommentCommand(
      [
        "first!@#",
        "	second line"
      ],
      new Selection(1, 1, 1, 1),
      [
        "!@# first!@#",
        "	second line"
      ],
      new Selection(1, 5, 1, 5)
    );
  });
  test("comment single line - leading whitespace", function() {
    testLineCommentCommand(
      [
        "first!@#",
        "	second line"
      ],
      new Selection(2, 3, 2, 1),
      [
        "first!@#",
        "	!@# second line"
      ],
      new Selection(2, 7, 2, 1)
    );
  });
  test("ignores invisible selection", function() {
    testLineCommentCommand(
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 1, 1, 1),
      [
        "!@# first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 1, 1, 5)
    );
  });
  test("multiple lines", function() {
    testLineCommentCommand(
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 4, 1, 1),
      [
        "!@# first",
        "!@# 	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 8, 1, 5)
    );
  });
  test("multiple modes on multiple lines", function() {
    testLineCommentCommand(
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(4, 4, 3, 1),
      [
        "first",
        "	second line",
        "!@# third line",
        "!@# fourth line",
        "fifth"
      ],
      new Selection(4, 8, 3, 5)
    );
  });
  test("toggle single line", function() {
    testLineCommentCommand(
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 1, 1, 1),
      [
        "!@# first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 5, 1, 5)
    );
    testLineCommentCommand(
      [
        "!@# first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 4, 1, 4),
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 1, 1, 1)
    );
  });
  test("toggle multiple lines", function() {
    testLineCommentCommand(
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 4, 1, 1),
      [
        "!@# first",
        "!@# 	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 8, 1, 5)
    );
    testLineCommentCommand(
      [
        "!@# first",
        "!@# 	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 7, 1, 4),
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 3, 1, 1)
    );
  });
  test("issue #5964: Ctrl+/ to create comment when cursor is at the beginning of the line puts the cursor in a strange position", () => {
    testLineCommentCommand(
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 1, 1, 1),
      [
        "!@# first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 5, 1, 5)
    );
  });
  test("issue #35673: Comment hotkeys throws the cursor before the comment", () => {
    testLineCommentCommand(
      [
        "first",
        "",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 1, 2, 1),
      [
        "first",
        "!@# ",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 5, 2, 5)
    );
    testLineCommentCommand(
      [
        "first",
        "	",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 2, 2, 2),
      [
        "first",
        "	!@# ",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 6, 2, 6)
    );
  });
  test('issue #2837 "Add Line Comment" fault when blank lines involved', function() {
    testAddLineCommentCommand(
      [
        '    if displayName == "":',
        "        displayName = groupName",
        '    description = getAttr(attributes, "description")',
        '    mailAddress = getAttr(attributes, "mail")',
        "",
        '    print "||Group name|%s|" % displayName',
        '    print "||Description|%s|" % description',
        '    print "||Email address|[mailto:%s]|" % mailAddress`'
      ],
      new Selection(1, 1, 8, 56),
      [
        '    !@# if displayName == "":',
        "    !@#     displayName = groupName",
        '    !@# description = getAttr(attributes, "description")',
        '    !@# mailAddress = getAttr(attributes, "mail")',
        "",
        '    !@# print "||Group name|%s|" % displayName',
        '    !@# print "||Description|%s|" % description',
        '    !@# print "||Email address|[mailto:%s]|" % mailAddress`'
      ],
      new Selection(1, 1, 8, 60)
    );
  });
  test("issue #47004: Toggle comments shouldn't move cursor", () => {
    testAddLineCommentCommand(
      [
        "    A line",
        "    Another line"
      ],
      new Selection(2, 7, 1, 1),
      [
        "    !@# A line",
        "    !@# Another line"
      ],
      new Selection(2, 11, 1, 1)
    );
  });
  test("insertSpace false", () => {
    const testLineCommentCommand2 = createTestCommandHelper(
      { lineComment: "!@#" },
      (accessor, sel) => new LineCommentCommand(accessor.get(ILanguageConfigurationService), sel, 4, Type.Toggle, false, true)
    );
    testLineCommentCommand2(
      [
        "some text"
      ],
      new Selection(1, 1, 1, 1),
      [
        "!@#some text"
      ],
      new Selection(1, 4, 1, 4)
    );
  });
  test("insertSpace false does not remove space", () => {
    const testLineCommentCommand2 = createTestCommandHelper(
      { lineComment: "!@#" },
      (accessor, sel) => new LineCommentCommand(accessor.get(ILanguageConfigurationService), sel, 4, Type.Toggle, false, true)
    );
    testLineCommentCommand2(
      [
        "!@#    some text"
      ],
      new Selection(1, 1, 1, 1),
      [
        "    some text"
      ],
      new Selection(1, 1, 1, 1)
    );
  });
});
suite("ignoreEmptyLines false", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const testLineCommentCommand = createTestCommandHelper(
    { lineComment: "!@#", blockComment: ["<!@#", "#@!>"] },
    (accessor, sel) => new LineCommentCommand(accessor.get(ILanguageConfigurationService), sel, 4, Type.Toggle, true, false)
  );
  test("does not ignore whitespace lines", () => {
    testLineCommentCommand(
      [
        "	some text",
        "	   ",
        "",
        "	some more text"
      ],
      new Selection(4, 2, 1, 1),
      [
        "!@# 	some text",
        "!@# 	   ",
        "!@# ",
        "!@# 	some more text"
      ],
      new Selection(4, 6, 1, 5)
    );
  });
  test("removes its own", function() {
    testLineCommentCommand(
      [
        "	!@# some text",
        "	   ",
        "		!@# some more text"
      ],
      new Selection(3, 2, 1, 1),
      [
        "	some text",
        "	   ",
        "		some more text"
      ],
      new Selection(3, 2, 1, 1)
    );
  });
  test("works in only whitespace", function() {
    testLineCommentCommand(
      [
        "	    ",
        "	",
        "		some more text"
      ],
      new Selection(3, 1, 1, 1),
      [
        "	!@#     ",
        "	!@# ",
        "		some more text"
      ],
      new Selection(3, 1, 1, 1)
    );
  });
  test("comments single line", function() {
    testLineCommentCommand(
      [
        "some text",
        "	some more text"
      ],
      new Selection(1, 1, 1, 1),
      [
        "!@# some text",
        "	some more text"
      ],
      new Selection(1, 5, 1, 5)
    );
  });
  test("detects indentation", function() {
    testLineCommentCommand(
      [
        "	some text",
        "	some more text"
      ],
      new Selection(2, 2, 1, 1),
      [
        "	!@# some text",
        "	!@# some more text"
      ],
      new Selection(2, 2, 1, 1)
    );
  });
});
suite("Editor Contrib - Line Comment As Block Comment", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const testLineCommentCommand = createTestCommandHelper(
    { lineComment: "", blockComment: ["(", ")"] },
    (accessor, sel) => new LineCommentCommand(accessor.get(ILanguageConfigurationService), sel, 4, Type.Toggle, true, true)
  );
  test("fall back to block comment command", function() {
    testLineCommentCommand(
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 1, 1, 1),
      [
        "( first )",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 3, 1, 3)
    );
  });
  test("fall back to block comment command - toggle", function() {
    testLineCommentCommand(
      [
        "(first)",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 7, 1, 2),
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 6, 1, 1)
    );
  });
  test("bug 9513 - expand single line to uncomment auto block", function() {
    testLineCommentCommand(
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 1, 1, 1),
      [
        "( first )",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 3, 1, 3)
    );
  });
  test("bug 9691 - always expand selection to line boundaries", function() {
    testLineCommentCommand(
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(3, 2, 1, 3),
      [
        "( first",
        "	second line",
        "third line )",
        "fourth line",
        "fifth"
      ],
      new Selection(3, 2, 1, 5)
    );
    testLineCommentCommand(
      [
        "(first",
        "	second line",
        "third line)",
        "fourth line",
        "fifth"
      ],
      new Selection(3, 11, 1, 2),
      [
        "first",
        "	second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(3, 11, 1, 1)
    );
  });
});
suite("Editor Contrib - Line Comment As Block Comment 2", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const testLineCommentCommand = createTestCommandHelper(
    { lineComment: null, blockComment: ["<!@#", "#@!>"] },
    (accessor, sel) => new LineCommentCommand(accessor.get(ILanguageConfigurationService), sel, 4, Type.Toggle, true, true)
  );
  test("no selection => uses indentation", function() {
    testLineCommentCommand(
      [
        "		first	    ",
        "		second line",
        "	third line",
        "fourth line",
        "		<!@#fifth#@!>		"
      ],
      new Selection(1, 1, 1, 1),
      [
        "		<!@# first	     #@!>",
        "		second line",
        "	third line",
        "fourth line",
        "		<!@#fifth#@!>		"
      ],
      new Selection(1, 1, 1, 1)
    );
    testLineCommentCommand(
      [
        "		<!@#first	    #@!>",
        "		second line",
        "	third line",
        "fourth line",
        "		<!@#fifth#@!>		"
      ],
      new Selection(1, 1, 1, 1),
      [
        "		first	   ",
        "		second line",
        "	third line",
        "fourth line",
        "		<!@#fifth#@!>		"
      ],
      new Selection(1, 1, 1, 1)
    );
  });
  test("can remove", function() {
    testLineCommentCommand(
      [
        "		first	    ",
        "		second line",
        "	third line",
        "fourth line",
        "		<!@#fifth#@!>		"
      ],
      new Selection(5, 1, 5, 1),
      [
        "		first	    ",
        "		second line",
        "	third line",
        "fourth line",
        "		fifth		"
      ],
      new Selection(5, 1, 5, 1)
    );
    testLineCommentCommand(
      [
        "		first	    ",
        "		second line",
        "	third line",
        "fourth line",
        "		<!@#fifth#@!>		"
      ],
      new Selection(5, 3, 5, 3),
      [
        "		first	    ",
        "		second line",
        "	third line",
        "fourth line",
        "		fifth		"
      ],
      new Selection(5, 3, 5, 3)
    );
    testLineCommentCommand(
      [
        "		first	    ",
        "		second line",
        "	third line",
        "fourth line",
        "		<!@#fifth#@!>		"
      ],
      new Selection(5, 4, 5, 4),
      [
        "		first	    ",
        "		second line",
        "	third line",
        "fourth line",
        "		fifth		"
      ],
      new Selection(5, 3, 5, 3)
    );
    testLineCommentCommand(
      [
        "		first	    ",
        "		second line",
        "	third line",
        "fourth line",
        "		<!@#fifth#@!>		"
      ],
      new Selection(5, 16, 5, 3),
      [
        "		first	    ",
        "		second line",
        "	third line",
        "fourth line",
        "		fifth		"
      ],
      new Selection(5, 8, 5, 3)
    );
    testLineCommentCommand(
      [
        "		first	    ",
        "		second line",
        "	third line",
        "fourth line",
        "		<!@#fifth#@!>		"
      ],
      new Selection(5, 12, 5, 7),
      [
        "		first	    ",
        "		second line",
        "	third line",
        "fourth line",
        "		fifth		"
      ],
      new Selection(5, 8, 5, 3)
    );
    testLineCommentCommand(
      [
        "		first	    ",
        "		second line",
        "	third line",
        "fourth line",
        "		<!@#fifth#@!>		"
      ],
      new Selection(5, 18, 5, 18),
      [
        "		first	    ",
        "		second line",
        "	third line",
        "fourth line",
        "		fifth		"
      ],
      new Selection(5, 10, 5, 10)
    );
  });
  test("issue #993: Remove comment does not work consistently in HTML", () => {
    testLineCommentCommand(
      [
        "     asd qwe",
        "     asd qwe",
        ""
      ],
      new Selection(1, 1, 3, 1),
      [
        "     <!@# asd qwe",
        "     asd qwe #@!>",
        ""
      ],
      new Selection(1, 1, 3, 1)
    );
    testLineCommentCommand(
      [
        "     <!@#asd qwe",
        "     asd qwe#@!>",
        ""
      ],
      new Selection(1, 1, 3, 1),
      [
        "     asd qwe",
        "     asd qwe",
        ""
      ],
      new Selection(1, 1, 3, 1)
    );
  });
});
suite("Editor Contrib - Line Comment in mixed modes", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const OUTER_LANGUAGE_ID = "outerMode";
  const INNER_LANGUAGE_ID = "innerMode";
  let OuterMode = class extends Disposable {
    constructor(commentsConfig, languageService, languageConfigurationService) {
      super();
      this.languageId = OUTER_LANGUAGE_ID;
      this._register(languageService.registerLanguage({ id: this.languageId }));
      this._register(languageConfigurationService.register(this.languageId, {
        comments: commentsConfig
      }));
      this._register(TokenizationRegistry.register(this.languageId, {
        getInitialState: () => NullState,
        tokenize: () => {
          throw new Error("not implemented");
        },
        tokenizeEncoded: (line, hasEOL, state) => {
          const languageId = /^  /.test(line) ? INNER_LANGUAGE_ID : OUTER_LANGUAGE_ID;
          const encodedLanguageId = languageService.languageIdCodec.encodeLanguageId(languageId);
          const tokens = new Uint32Array(1 << 1);
          tokens[0 << 1] = 0;
          tokens[(0 << 1) + 1] = ColorId.DefaultForeground << MetadataConsts.FOREGROUND_OFFSET | encodedLanguageId << MetadataConsts.LANGUAGEID_OFFSET;
          return new EncodedTokenizationResult(tokens, [], state);
        }
      }));
    }
  };
  OuterMode = __decorateClass([
    __decorateParam(1, ILanguageService),
    __decorateParam(2, ILanguageConfigurationService)
  ], OuterMode);
  let InnerMode = class extends Disposable {
    constructor(commentsConfig, languageService, languageConfigurationService) {
      super();
      this.languageId = INNER_LANGUAGE_ID;
      this._register(languageService.registerLanguage({ id: this.languageId }));
      this._register(languageConfigurationService.register(this.languageId, {
        comments: commentsConfig
      }));
    }
  };
  InnerMode = __decorateClass([
    __decorateParam(1, ILanguageService),
    __decorateParam(2, ILanguageConfigurationService)
  ], InnerMode);
  function testLineCommentCommand(lines, selection, expectedLines, expectedSelection) {
    const setup = (accessor, disposables) => {
      const instantiationService = accessor.get(IInstantiationService);
      disposables.add(instantiationService.createInstance(OuterMode, { lineComment: "//", blockComment: ["/*", "*/"] }));
      disposables.add(instantiationService.createInstance(InnerMode, { lineComment: null, blockComment: ["{/*", "*/}"] }));
    };
    testCommand(
      lines,
      OUTER_LANGUAGE_ID,
      selection,
      (accessor, sel) => new LineCommentCommand(accessor.get(ILanguageConfigurationService), sel, 4, Type.Toggle, true, true),
      expectedLines,
      expectedSelection,
      true,
      setup
    );
  }
  test("issue #24047 (part 1): Commenting code in JSX files", () => {
    testLineCommentCommand(
      [
        "import React from 'react';",
        "const Loader = () => (",
        "  <div>",
        "    Loading...",
        "  </div>",
        ");",
        "export default Loader;"
      ],
      new Selection(1, 1, 7, 22),
      [
        "// import React from 'react';",
        "// const Loader = () => (",
        "//   <div>",
        "//     Loading...",
        "//   </div>",
        "// );",
        "// export default Loader;"
      ],
      new Selection(1, 4, 7, 25)
    );
  });
  test("issue #24047 (part 2): Commenting code in JSX files", () => {
    testLineCommentCommand(
      [
        "import React from 'react';",
        "const Loader = () => (",
        "  <div>",
        "    Loading...",
        "  </div>",
        ");",
        "export default Loader;"
      ],
      new Selection(3, 4, 3, 4),
      [
        "import React from 'react';",
        "const Loader = () => (",
        "  {/* <div> */}",
        "    Loading...",
        "  </div>",
        ");",
        "export default Loader;"
      ],
      new Selection(3, 8, 3, 8)
    );
  });
  test("issue #36173: Commenting code in JSX tag body", () => {
    testLineCommentCommand(
      [
        "<div>",
        "  {123}",
        "</div>"
      ],
      new Selection(2, 4, 2, 4),
      [
        "<div>",
        "  {/* {123} */}",
        "</div>"
      ],
      new Selection(2, 8, 2, 8)
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGNvbW1lbnRcXHRlc3RcXGJyb3dzZXJcXGxpbmVDb21tZW50Q29tbWFuZC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IElDb21tYW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBDb2xvcklkLCBNZXRhZGF0YUNvbnN0cyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lbmNvZGVkVG9rZW5BdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQsIElTdGF0ZSwgVG9rZW5pemF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IENvbW1lbnRSdWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IE51bGxTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbnVsbFRva2VuaXplLmpzJztcbmltcG9ydCB7IElMaW5lUHJlZmxpZ2h0RGF0YSwgSVByZWZsaWdodERhdGEsIElTaW1wbGVNb2RlbCwgTGluZUNvbW1lbnRDb21tYW5kLCBUeXBlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9saW5lQ29tbWVudENvbW1hbmQuanMnO1xuaW1wb3J0IHsgdGVzdENvbW1hbmQgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvdGVzdENvbW1hbmQuanMnO1xuaW1wb3J0IHsgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi9tb2Rlcy90ZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcblxuZnVuY3Rpb24gY3JlYXRlVGVzdENvbW1hbmRIZWxwZXIoY29tbWVudHNDb25maWc6IENvbW1lbnRSdWxlLCBjb21tYW5kRmFjdG9yeTogKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBzZWxlY3Rpb246IFNlbGVjdGlvbikgPT4gSUNvbW1hbmQpOiAobGluZXM6IHN0cmluZ1tdLCBzZWxlY3Rpb246IFNlbGVjdGlvbiwgZXhwZWN0ZWRMaW5lczogc3RyaW5nW10sIGV4cGVjdGVkU2VsZWN0aW9uOiBTZWxlY3Rpb24pID0+IHZvaWQge1xuXHRyZXR1cm4gKGxpbmVzOiBzdHJpbmdbXSwgc2VsZWN0aW9uOiBTZWxlY3Rpb24sIGV4cGVjdGVkTGluZXM6IHN0cmluZ1tdLCBleHBlY3RlZFNlbGVjdGlvbjogU2VsZWN0aW9uKSA9PiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9ICdjb21tZW50TW9kZSc7XG5cdFx0Y29uc3QgcHJlcGFyZSA9IChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSkgPT4ge1xuXHRcdFx0Y29uc3QgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogbGFuZ3VhZ2VJZCB9KSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihsYW5ndWFnZUlkLCB7XG5cdFx0XHRcdGNvbW1lbnRzOiBjb21tZW50c0NvbmZpZ1xuXHRcdFx0fSkpO1xuXHRcdH07XG5cdFx0dGVzdENvbW1hbmQobGluZXMsIGxhbmd1YWdlSWQsIHNlbGVjdGlvbiwgY29tbWFuZEZhY3RvcnksIGV4cGVjdGVkTGluZXMsIGV4cGVjdGVkU2VsZWN0aW9uLCBmYWxzZSwgcHJlcGFyZSk7XG5cdH07XG59XG5cbnN1aXRlKCdFZGl0b3IgQ29udHJpYiAtIExpbmUgQ29tbWVudCBDb21tYW5kJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHRlc3RMaW5lQ29tbWVudENvbW1hbmQgPSBjcmVhdGVUZXN0Q29tbWFuZEhlbHBlcihcblx0XHR7IGxpbmVDb21tZW50OiAnIUAjJywgYmxvY2tDb21tZW50OiBbJzwhQCMnLCAnI0AhPiddIH0sXG5cdFx0KGFjY2Vzc29yLCBzZWwpID0+IG5ldyBMaW5lQ29tbWVudENvbW1hbmQoYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSwgc2VsLCA0LCBUeXBlLlRvZ2dsZSwgdHJ1ZSwgdHJ1ZSlcblx0KTtcblxuXHRjb25zdCB0ZXN0QWRkTGluZUNvbW1lbnRDb21tYW5kID0gY3JlYXRlVGVzdENvbW1hbmRIZWxwZXIoXG5cdFx0eyBsaW5lQ29tbWVudDogJyFAIycsIGJsb2NrQ29tbWVudDogWyc8IUAjJywgJyNAIT4nXSB9LFxuXHRcdChhY2Nlc3Nvciwgc2VsKSA9PiBuZXcgTGluZUNvbW1lbnRDb21tYW5kKGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSksIHNlbCwgNCwgVHlwZS5Gb3JjZUFkZCwgdHJ1ZSwgdHJ1ZSlcblx0KTtcblxuXHRjb25zdCB0ZXN0TGluZUNvbW1lbnRDb21tYW5kVG9rZW5GaXJzdENvbHVtbiA9IGNyZWF0ZVRlc3RDb21tYW5kSGVscGVyKFxuXHRcdHsgbGluZUNvbW1lbnQ6IHsgY29tbWVudDogJyFAIycsIG5vSW5kZW50OiB0cnVlIH0sIGJsb2NrQ29tbWVudDogWyc8IUAjJywgJyNAIT4nXSB9LFxuXHRcdChhY2Nlc3Nvciwgc2VsKSA9PiBuZXcgTGluZUNvbW1lbnRDb21tYW5kKGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSksIHNlbCwgNCwgVHlwZS5Ub2dnbGUsIHRydWUsIHRydWUpXG5cdCk7XG5cblx0dGVzdCgnY29tbWVudCBzaW5nbGUgbGluZScsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0TGluZUNvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnc29tZSB0ZXh0Jyxcblx0XHRcdFx0J1xcdHNvbWUgbW9yZSB0ZXh0J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCchQCMgc29tZSB0ZXh0Jyxcblx0XHRcdFx0J1xcdHNvbWUgbW9yZSB0ZXh0J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYXNlIGluc2Vuc2l0aXZlJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRlc3RMaW5lQ29tbWVudENvbW1hbmQgPSBjcmVhdGVUZXN0Q29tbWFuZEhlbHBlcihcblx0XHRcdHsgbGluZUNvbW1lbnQ6ICdyZW0nIH0sXG5cdFx0XHQoYWNjZXNzb3IsIHNlbCkgPT4gbmV3IExpbmVDb21tZW50Q29tbWFuZChhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpLCBzZWwsIDQsIFR5cGUuVG9nZ2xlLCB0cnVlLCB0cnVlKVxuXHRcdCk7XG5cblx0XHR0ZXN0TGluZUNvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnUkVNIHNvbWUgdGV4dCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnc29tZSB0ZXh0J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21tZW50IHdpdGggdG9rZW4gY29sdW1uIGZpeGVkJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3RMaW5lQ29tbWVudENvbW1hbmRUb2tlbkZpcnN0Q29sdW1uKFxuXHRcdFx0W1xuXHRcdFx0XHQnc29tZSB0ZXh0Jyxcblx0XHRcdFx0J1xcdHNvbWUgbW9yZSB0ZXh0J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCdzb21lIHRleHQnLFxuXHRcdFx0XHQnIUAjIFxcdHNvbWUgbW9yZSB0ZXh0J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNSwgMiwgNSlcblx0XHQpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBjcmVhdGVTaW1wbGVNb2RlbChsaW5lczogc3RyaW5nW10pOiBJU2ltcGxlTW9kZWwge1xuXHRcdHJldHVybiB7XG5cdFx0XHRnZXRMaW5lQ29udGVudDogKGxpbmVOdW1iZXI6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gbGluZXNbbGluZU51bWJlciAtIDFdO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVCYXNpY0xpbmVQcmVmbGlnaHREYXRhKGNvbW1lbnRUb2tlbnM6IHN0cmluZ1tdKTogSUxpbmVQcmVmbGlnaHREYXRhW10ge1xuXHRcdHJldHVybiBjb21tZW50VG9rZW5zLm1hcCgoY29tbWVudFN0cmluZykgPT4ge1xuXHRcdFx0Y29uc3QgcjogSUxpbmVQcmVmbGlnaHREYXRhID0ge1xuXHRcdFx0XHRpZ25vcmU6IGZhbHNlLFxuXHRcdFx0XHRjb21tZW50U3RyOiBjb21tZW50U3RyaW5nLFxuXHRcdFx0XHRjb21tZW50U3RyT2Zmc2V0OiAwLFxuXHRcdFx0XHRjb21tZW50U3RyTGVuZ3RoOiBjb21tZW50U3RyaW5nLmxlbmd0aFxuXHRcdFx0fTtcblx0XHRcdHJldHVybiByO1xuXHRcdH0pO1xuXHR9XG5cblx0dGVzdCgnX2FuYWx5emVMaW5lcycsICgpID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGxldCByOiBJUHJlZmxpZ2h0RGF0YTtcblxuXHRcdHIgPSBMaW5lQ29tbWVudENvbW1hbmQuX2FuYWx5emVMaW5lcyhUeXBlLlRvZ2dsZSwgdHJ1ZSwgY3JlYXRlU2ltcGxlTW9kZWwoW1xuXHRcdFx0J1xcdFxcdCcsXG5cdFx0XHQnICAgICcsXG5cdFx0XHQnICAgIGMnLFxuXHRcdFx0J1xcdFxcdGQnXG5cdFx0XSksIGNyZWF0ZUJhc2ljTGluZVByZWZsaWdodERhdGEoWycvLycsICdyZW0nLCAnIUAjJywgJyFAIyddKSwgMSwgdHJ1ZSwgZmFsc2UsIGRpc3Bvc2FibGUuYWRkKG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpKSwgJ3BsYWludGV4dCcpO1xuXHRcdGlmICghci5zdXBwb3J0ZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgdW5leHBlY3RlZGApO1xuXHRcdH1cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyLnNob3VsZFJlbW92ZUNvbW1lbnRzLCBmYWxzZSk7XG5cblx0XHQvLyBEb2VzIG5vdCBjaGFuZ2UgYGNvbW1lbnRTdHJgXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIubGluZXNbMF0uY29tbWVudFN0ciwgJy8vJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIubGluZXNbMV0uY29tbWVudFN0ciwgJ3JlbScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyLmxpbmVzWzJdLmNvbW1lbnRTdHIsICchQCMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoci5saW5lc1szXS5jb21tZW50U3RyLCAnIUAjJyk7XG5cblx0XHQvLyBGaWxscyBpbiBgaXNXaGl0ZXNwYWNlYFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyLmxpbmVzWzBdLmlnbm9yZSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIubGluZXNbMV0uaWdub3JlLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoci5saW5lc1syXS5pZ25vcmUsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoci5saW5lc1szXS5pZ25vcmUsIGZhbHNlKTtcblxuXHRcdC8vIEZpbGxzIGluIGBjb21tZW50U3RyT2Zmc2V0YFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyLmxpbmVzWzBdLmNvbW1lbnRTdHJPZmZzZXQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyLmxpbmVzWzFdLmNvbW1lbnRTdHJPZmZzZXQsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyLmxpbmVzWzJdLmNvbW1lbnRTdHJPZmZzZXQsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyLmxpbmVzWzNdLmNvbW1lbnRTdHJPZmZzZXQsIDIpO1xuXG5cblx0XHRyID0gTGluZUNvbW1lbnRDb21tYW5kLl9hbmFseXplTGluZXMoVHlwZS5Ub2dnbGUsIHRydWUsIGNyZWF0ZVNpbXBsZU1vZGVsKFtcblx0XHRcdCdcXHRcXHQnLFxuXHRcdFx0JyAgICByZW0gJyxcblx0XHRcdCcgICAgIUAjIGMnLFxuXHRcdFx0J1xcdFxcdCFAI2QnXG5cdFx0XSksIGNyZWF0ZUJhc2ljTGluZVByZWZsaWdodERhdGEoWycvLycsICdyZW0nLCAnIUAjJywgJyFAIyddKSwgMSwgdHJ1ZSwgZmFsc2UsIGRpc3Bvc2FibGUuYWRkKG5ldyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSgpKSwgJ3BsYWludGV4dCcpO1xuXHRcdGlmICghci5zdXBwb3J0ZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgdW5leHBlY3RlZGApO1xuXHRcdH1cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyLnNob3VsZFJlbW92ZUNvbW1lbnRzLCB0cnVlKTtcblxuXHRcdC8vIERvZXMgbm90IGNoYW5nZSBgY29tbWVudFN0cmBcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoci5saW5lc1swXS5jb21tZW50U3RyLCAnLy8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoci5saW5lc1sxXS5jb21tZW50U3RyLCAncmVtJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIubGluZXNbMl0uY29tbWVudFN0ciwgJyFAIycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyLmxpbmVzWzNdLmNvbW1lbnRTdHIsICchQCMnKTtcblxuXHRcdC8vIEZpbGxzIGluIGBpc1doaXRlc3BhY2VgXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIubGluZXNbMF0uaWdub3JlLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoci5saW5lc1sxXS5pZ25vcmUsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoci5saW5lc1syXS5pZ25vcmUsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoci5saW5lc1szXS5pZ25vcmUsIGZhbHNlKTtcblxuXHRcdC8vIEZpbGxzIGluIGBjb21tZW50U3RyT2Zmc2V0YFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyLmxpbmVzWzBdLmNvbW1lbnRTdHJPZmZzZXQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyLmxpbmVzWzFdLmNvbW1lbnRTdHJPZmZzZXQsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyLmxpbmVzWzJdLmNvbW1lbnRTdHJPZmZzZXQsIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyLmxpbmVzWzNdLmNvbW1lbnRTdHJPZmZzZXQsIDIpO1xuXG5cdFx0Ly8gRmlsbHMgaW4gYGNvbW1lbnRTdHJMZW5ndGhgXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIubGluZXNbMF0uY29tbWVudFN0ckxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIubGluZXNbMV0uY29tbWVudFN0ckxlbmd0aCwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIubGluZXNbMl0uY29tbWVudFN0ckxlbmd0aCwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIubGluZXNbM10uY29tbWVudFN0ckxlbmd0aCwgMyk7XG5cblx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnX25vcm1hbGl6ZUluc2VydGlvblBvaW50JywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgcnVuVGVzdCA9IChtaXhlZEFycjogYW55W10sIHRhYlNpemU6IG51bWJlciwgZXhwZWN0ZWQ6IG51bWJlcltdLCB0ZXN0TmFtZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVNpbXBsZU1vZGVsKG1peGVkQXJyLmZpbHRlcigoaXRlbSwgaWR4KSA9PiBpZHggJSAyID09PSAwKSk7XG5cdFx0XHRjb25zdCBvZmZzZXRzID0gbWl4ZWRBcnIuZmlsdGVyKChpdGVtLCBpZHgpID0+IGlkeCAlIDIgPT09IDEpLm1hcChvZmZzZXQgPT4ge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGNvbW1lbnRTdHJPZmZzZXQ6IG9mZnNldCxcblx0XHRcdFx0XHRpZ25vcmU6IGZhbHNlXG5cdFx0XHRcdH07XG5cdFx0XHR9KTtcblx0XHRcdExpbmVDb21tZW50Q29tbWFuZC5fbm9ybWFsaXplSW5zZXJ0aW9uUG9pbnQobW9kZWwsIG9mZnNldHMsIDEsIHRhYlNpemUpO1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gb2Zmc2V0cy5tYXAoaXRlbSA9PiBpdGVtLmNvbW1lbnRTdHJPZmZzZXQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCB0ZXN0TmFtZSk7XG5cdFx0fTtcblxuXHRcdC8vIEJ1ZyAxNjY5NjpbY29tbWVudF0gY29tbWVudHMgbm90IGFsaWduZWQgaW4gdGhpcyBjYXNlXG5cdFx0cnVuVGVzdChbXG5cdFx0XHQnICBYWCcsIDIsXG5cdFx0XHQnICAgIFlZJywgNFxuXHRcdF0sIDQsIFswLCAwXSwgJ0J1ZyAxNjY5NicpO1xuXG5cdFx0cnVuVGVzdChbXG5cdFx0XHQnXFx0XFx0XFx0WFgnLCAzLFxuXHRcdFx0JyAgICBcXHRZWScsIDUsXG5cdFx0XHQnICAgICAgICBaWicsIDgsXG5cdFx0XHQnXFx0XFx0VFQnLCAyXG5cdFx0XSwgNCwgWzIsIDUsIDgsIDJdLCAnVGVzdDEnKTtcblxuXHRcdHJ1blRlc3QoW1xuXHRcdFx0J1xcdFxcdFxcdCAgIFhYJywgNixcblx0XHRcdCcgICAgXFx0XFx0XFx0XFx0WVknLCA4LFxuXHRcdFx0JyAgICAgICAgWlonLCA4LFxuXHRcdFx0J1xcdFxcdCAgICBUVCcsIDZcblx0XHRdLCA0LCBbMiwgNSwgOCwgMl0sICdUZXN0MicpO1xuXG5cdFx0cnVuVGVzdChbXG5cdFx0XHQnXFx0XFx0JywgMixcblx0XHRcdCdcXHRcXHRcXHQnLCAzLFxuXHRcdFx0J1xcdFxcdFxcdFxcdCcsIDQsXG5cdFx0XHQnXFx0XFx0XFx0JywgM1xuXHRcdF0sIDQsIFsyLCAyLCAyLCAyXSwgJ1Rlc3QzJyk7XG5cblx0XHRydW5UZXN0KFtcblx0XHRcdCdcXHRcXHQnLCAyLFxuXHRcdFx0J1xcdFxcdFxcdCcsIDMsXG5cdFx0XHQnXFx0XFx0XFx0XFx0JywgNCxcblx0XHRcdCdcXHRcXHRcXHQnLCAzLFxuXHRcdFx0JyAgICAnLCA0XG5cdFx0XSwgMiwgWzIsIDIsIDIsIDIsIDRdLCAnVGVzdDQnKTtcblxuXHRcdHJ1blRlc3QoW1xuXHRcdFx0J1xcdFxcdCcsIDIsXG5cdFx0XHQnXFx0XFx0XFx0JywgMyxcblx0XHRcdCdcXHRcXHRcXHRcXHQnLCA0LFxuXHRcdFx0J1xcdFxcdFxcdCcsIDMsXG5cdFx0XHQnICAgICcsIDRcblx0XHRdLCA0LCBbMSwgMSwgMSwgMSwgNF0sICdUZXN0NScpO1xuXG5cdFx0cnVuVGVzdChbXG5cdFx0XHQnIFxcdCcsIDIsXG5cdFx0XHQnICBcXHQnLCAzLFxuXHRcdFx0JyAgIFxcdCcsIDQsXG5cdFx0XHQnICAgICcsIDQsXG5cdFx0XHQnXFx0JywgMVxuXHRcdF0sIDQsIFsyLCAzLCA0LCA0LCAxXSwgJ1Rlc3Q2Jyk7XG5cblx0XHRydW5UZXN0KFtcblx0XHRcdCcgXFx0XFx0JywgMyxcblx0XHRcdCcgIFxcdFxcdCcsIDQsXG5cdFx0XHQnICAgXFx0XFx0JywgNSxcblx0XHRcdCcgICAgXFx0JywgNSxcblx0XHRcdCdcXHQnLCAxXG5cdFx0XSwgNCwgWzIsIDMsIDQsIDQsIDFdLCAnVGVzdDcnKTtcblxuXHRcdHJ1blRlc3QoW1xuXHRcdFx0J1xcdCcsIDEsXG5cdFx0XHQnICAgICcsIDRcblx0XHRdLCA0LCBbMSwgNF0sICdUZXN0ODo0Jyk7XG5cdFx0cnVuVGVzdChbXG5cdFx0XHQnXFx0JywgMSxcblx0XHRcdCcgICAnLCAzXG5cdFx0XSwgNCwgWzAsIDBdLCAnVGVzdDg6MycpO1xuXHRcdHJ1blRlc3QoW1xuXHRcdFx0J1xcdCcsIDEsXG5cdFx0XHQnICAnLCAyXG5cdFx0XSwgNCwgWzAsIDBdLCAnVGVzdDg6MicpO1xuXHRcdHJ1blRlc3QoW1xuXHRcdFx0J1xcdCcsIDEsXG5cdFx0XHQnICcsIDFcblx0XHRdLCA0LCBbMCwgMF0sICdUZXN0ODoxJyk7XG5cdFx0cnVuVGVzdChbXG5cdFx0XHQnXFx0JywgMSxcblx0XHRcdCcnLCAwXG5cdFx0XSwgNCwgWzAsIDBdLCAnVGVzdDg6MCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXRlY3RzIGluZGVudGF0aW9uJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3RMaW5lQ29tbWVudENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHRzb21lIHRleHQnLFxuXHRcdFx0XHQnXFx0c29tZSBtb3JlIHRleHQnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCAyLCAxLCAxKSxcblx0XHRcdFtcblx0XHRcdFx0J1xcdCFAIyBzb21lIHRleHQnLFxuXHRcdFx0XHQnXFx0IUAjIHNvbWUgbW9yZSB0ZXh0J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMiwgMSwgMSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXRlY3RzIG1peGVkIGluZGVudGF0aW9uJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3RMaW5lQ29tbWVudENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHRzb21lIHRleHQnLFxuXHRcdFx0XHQnICAgIHNvbWUgbW9yZSB0ZXh0J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMiwgMSwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHQhQCMgc29tZSB0ZXh0Jyxcblx0XHRcdFx0JyAgICAhQCMgc29tZSBtb3JlIHRleHQnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCAyLCAxLCAxKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgd2hpdGVzcGFjZSBsaW5lcycsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0TGluZUNvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0c29tZSB0ZXh0Jyxcblx0XHRcdFx0J1xcdCAgICcsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnXFx0c29tZSBtb3JlIHRleHQnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbig0LCAyLCAxLCAxKSxcblx0XHRcdFtcblx0XHRcdFx0J1xcdCFAIyBzb21lIHRleHQnLFxuXHRcdFx0XHQnXFx0ICAgJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdcXHQhQCMgc29tZSBtb3JlIHRleHQnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbig0LCAyLCAxLCAxKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZXMgaXRzIG93bicsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0TGluZUNvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0IUAjIHNvbWUgdGV4dCcsXG5cdFx0XHRcdCdcXHQgICAnLFxuXHRcdFx0XHQnXFx0XFx0IUAjIHNvbWUgbW9yZSB0ZXh0J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMywgMiwgMSwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHRzb21lIHRleHQnLFxuXHRcdFx0XHQnXFx0ICAgJyxcblx0XHRcdFx0J1xcdFxcdHNvbWUgbW9yZSB0ZXh0J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMywgMiwgMSwgMSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd3b3JrcyBpbiBvbmx5IHdoaXRlc3BhY2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdExpbmVDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J1xcdCAgICAnLFxuXHRcdFx0XHQnXFx0Jyxcblx0XHRcdFx0J1xcdFxcdHNvbWUgbW9yZSB0ZXh0J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMywgMSwgMSwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHQhQCMgICAgICcsXG5cdFx0XHRcdCdcXHQhQCMgJyxcblx0XHRcdFx0J1xcdFxcdHNvbWUgbW9yZSB0ZXh0J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMywgMSwgMSwgMSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdidWcgOTY5NyAtIHdoaXRlc3BhY2UgYmVmb3JlIGNvbW1lbnQgdG9rZW4nLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdExpbmVDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J1xcdCAhQCNmaXJzdCcsXG5cdFx0XHRcdCdcXHRzZWNvbmQgbGluZSdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0IGZpcnN0Jyxcblx0XHRcdFx0J1xcdHNlY29uZCBsaW5lJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdidWcgMTAxNjIgLSBsaW5lIGNvbW1lbnQgYmVmb3JlIGNhcmV0JywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3RMaW5lQ29tbWVudENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCFAIycsXG5cdFx0XHRcdCdcXHRzZWNvbmQgbGluZSdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnIUAjIGZpcnN0IUAjJyxcblx0XHRcdFx0J1xcdHNlY29uZCBsaW5lJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21tZW50IHNpbmdsZSBsaW5lIC0gbGVhZGluZyB3aGl0ZXNwYWNlJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3RMaW5lQ29tbWVudENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCFAIycsXG5cdFx0XHRcdCdcXHRzZWNvbmQgbGluZSdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDMsIDIsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QhQCMnLFxuXHRcdFx0XHQnXFx0IUAjIHNlY29uZCBsaW5lJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNywgMiwgMSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIGludmlzaWJsZSBzZWxlY3Rpb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdExpbmVDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J1xcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxLCAxLCAxKSxcblx0XHRcdFtcblx0XHRcdFx0JyFAIyBmaXJzdCcsXG5cdFx0XHRcdCdcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMSwgMSwgNSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSBsaW5lcycsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0TGluZUNvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnXFx0c2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDQsIDEsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnIUAjIGZpcnN0Jyxcblx0XHRcdFx0JyFAIyBcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgOCwgMSwgNSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSBtb2RlcyBvbiBtdWx0aXBsZSBsaW5lcycsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0TGluZUNvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnXFx0c2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDQsIDMsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnXFx0c2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQnIUAjIHRoaXJkIGxpbmUnLFxuXHRcdFx0XHQnIUAjIGZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgOCwgMywgNSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b2dnbGUgc2luZ2xlIGxpbmUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdExpbmVDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J1xcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSxcblx0XHRcdFtcblx0XHRcdFx0JyFAIyBmaXJzdCcsXG5cdFx0XHRcdCdcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNSlcblx0XHQpO1xuXG5cdFx0dGVzdExpbmVDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0JyFAIyBmaXJzdCcsXG5cdFx0XHRcdCdcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCksXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b2dnbGUgbXVsdGlwbGUgbGluZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdExpbmVDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J1xcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCA0LCAxLCAxKSxcblx0XHRcdFtcblx0XHRcdFx0JyFAIyBmaXJzdCcsXG5cdFx0XHRcdCchQCMgXFx0c2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDgsIDEsIDUpXG5cdFx0KTtcblxuXHRcdHRlc3RMaW5lQ29tbWVudENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCchQCMgZmlyc3QnLFxuXHRcdFx0XHQnIUAjIFxcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCA3LCAxLCA0KSxcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J1xcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCAzLCAxLCAxKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM1OTY0OiBDdHJsKy8gdG8gY3JlYXRlIGNvbW1lbnQgd2hlbiBjdXJzb3IgaXMgYXQgdGhlIGJlZ2lubmluZyBvZiB0aGUgbGluZSBwdXRzIHRoZSBjdXJzb3IgaW4gYSBzdHJhbmdlIHBvc2l0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lQ29tbWVudENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCchQCMgZmlyc3QnLFxuXHRcdFx0XHQnXFx0c2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDUpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzM1NjczOiBDb21tZW50IGhvdGtleXMgdGhyb3dzIHRoZSBjdXJzb3IgYmVmb3JlIHRoZSBjb21tZW50JywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lQ29tbWVudENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnXFx0c2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnIUAjICcsXG5cdFx0XHRcdCdcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNSwgMiwgNSlcblx0XHQpO1xuXG5cdFx0dGVzdExpbmVDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J1xcdCcsXG5cdFx0XHRcdCdcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMiwgMiwgMiksXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdcXHQhQCMgJyxcblx0XHRcdFx0J1xcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCA2LCAyLCA2KVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyODM3IFwiQWRkIExpbmUgQ29tbWVudFwiIGZhdWx0IHdoZW4gYmxhbmsgbGluZXMgaW52b2x2ZWQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdEFkZExpbmVDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0JyAgICBpZiBkaXNwbGF5TmFtZSA9PSBcIlwiOicsXG5cdFx0XHRcdCcgICAgICAgIGRpc3BsYXlOYW1lID0gZ3JvdXBOYW1lJyxcblx0XHRcdFx0JyAgICBkZXNjcmlwdGlvbiA9IGdldEF0dHIoYXR0cmlidXRlcywgXCJkZXNjcmlwdGlvblwiKScsXG5cdFx0XHRcdCcgICAgbWFpbEFkZHJlc3MgPSBnZXRBdHRyKGF0dHJpYnV0ZXMsIFwibWFpbFwiKScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnICAgIHByaW50IFwifHxHcm91cCBuYW1lfCVzfFwiICUgZGlzcGxheU5hbWUnLFxuXHRcdFx0XHQnICAgIHByaW50IFwifHxEZXNjcmlwdGlvbnwlc3xcIiAlIGRlc2NyaXB0aW9uJyxcblx0XHRcdFx0JyAgICBwcmludCBcInx8RW1haWwgYWRkcmVzc3xbbWFpbHRvOiVzXXxcIiAlIG1haWxBZGRyZXNzYCcsXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCA4LCA1NiksXG5cdFx0XHRbXG5cdFx0XHRcdCcgICAgIUAjIGlmIGRpc3BsYXlOYW1lID09IFwiXCI6Jyxcblx0XHRcdFx0JyAgICAhQCMgICAgIGRpc3BsYXlOYW1lID0gZ3JvdXBOYW1lJyxcblx0XHRcdFx0JyAgICAhQCMgZGVzY3JpcHRpb24gPSBnZXRBdHRyKGF0dHJpYnV0ZXMsIFwiZGVzY3JpcHRpb25cIiknLFxuXHRcdFx0XHQnICAgICFAIyBtYWlsQWRkcmVzcyA9IGdldEF0dHIoYXR0cmlidXRlcywgXCJtYWlsXCIpJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcgICAgIUAjIHByaW50IFwifHxHcm91cCBuYW1lfCVzfFwiICUgZGlzcGxheU5hbWUnLFxuXHRcdFx0XHQnICAgICFAIyBwcmludCBcInx8RGVzY3JpcHRpb258JXN8XCIgJSBkZXNjcmlwdGlvbicsXG5cdFx0XHRcdCcgICAgIUAjIHByaW50IFwifHxFbWFpbCBhZGRyZXNzfFttYWlsdG86JXNdfFwiICUgbWFpbEFkZHJlc3NgJyxcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDgsIDYwKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM0NzAwNDogVG9nZ2xlIGNvbW1lbnRzIHNob3VsZG5cXCd0IG1vdmUgY3Vyc29yJywgKCkgPT4ge1xuXHRcdHRlc3RBZGRMaW5lQ29tbWVudENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCcgICAgQSBsaW5lJyxcblx0XHRcdFx0JyAgICBBbm90aGVyIGxpbmUnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCA3LCAxLCAxKSxcblx0XHRcdFtcblx0XHRcdFx0JyAgICAhQCMgQSBsaW5lJyxcblx0XHRcdFx0JyAgICAhQCMgQW5vdGhlciBsaW5lJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMTEsIDEsIDEpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0U3BhY2UgZmFsc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdExpbmVDb21tZW50Q29tbWFuZCA9IGNyZWF0ZVRlc3RDb21tYW5kSGVscGVyKFxuXHRcdFx0eyBsaW5lQ29tbWVudDogJyFAIycgfSxcblx0XHRcdChhY2Nlc3Nvciwgc2VsKSA9PiBuZXcgTGluZUNvbW1lbnRDb21tYW5kKGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSksIHNlbCwgNCwgVHlwZS5Ub2dnbGUsIGZhbHNlLCB0cnVlKVxuXHRcdCk7XG5cblx0XHR0ZXN0TGluZUNvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnc29tZSB0ZXh0J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCchQCNzb21lIHRleHQnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydFNwYWNlIGZhbHNlIGRvZXMgbm90IHJlbW92ZSBzcGFjZScsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0TGluZUNvbW1lbnRDb21tYW5kID0gY3JlYXRlVGVzdENvbW1hbmRIZWxwZXIoXG5cdFx0XHR7IGxpbmVDb21tZW50OiAnIUAjJyB9LFxuXHRcdFx0KGFjY2Vzc29yLCBzZWwpID0+IG5ldyBMaW5lQ29tbWVudENvbW1hbmQoYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSwgc2VsLCA0LCBUeXBlLlRvZ2dsZSwgZmFsc2UsIHRydWUpXG5cdFx0KTtcblxuXHRcdHRlc3RMaW5lQ29tbWVudENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCchQCMgICAgc29tZSB0ZXh0J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCcgICAgc29tZSB0ZXh0J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSlcblx0XHQpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnaWdub3JlRW1wdHlMaW5lcyBmYWxzZScsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCB0ZXN0TGluZUNvbW1lbnRDb21tYW5kID0gY3JlYXRlVGVzdENvbW1hbmRIZWxwZXIoXG5cdFx0eyBsaW5lQ29tbWVudDogJyFAIycsIGJsb2NrQ29tbWVudDogWyc8IUAjJywgJyNAIT4nXSB9LFxuXHRcdChhY2Nlc3Nvciwgc2VsKSA9PiBuZXcgTGluZUNvbW1lbnRDb21tYW5kKGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSksIHNlbCwgNCwgVHlwZS5Ub2dnbGUsIHRydWUsIGZhbHNlKVxuXHQpO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGlnbm9yZSB3aGl0ZXNwYWNlIGxpbmVzJywgKCkgPT4ge1xuXHRcdHRlc3RMaW5lQ29tbWVudENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHRzb21lIHRleHQnLFxuXHRcdFx0XHQnXFx0ICAgJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdcXHRzb21lIG1vcmUgdGV4dCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDIsIDEsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnIUAjIFxcdHNvbWUgdGV4dCcsXG5cdFx0XHRcdCchQCMgXFx0ICAgJyxcblx0XHRcdFx0JyFAIyAnLFxuXHRcdFx0XHQnIUAjIFxcdHNvbWUgbW9yZSB0ZXh0J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgNiwgMSwgNSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVzIGl0cyBvd24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdExpbmVDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J1xcdCFAIyBzb21lIHRleHQnLFxuXHRcdFx0XHQnXFx0ICAgJyxcblx0XHRcdFx0J1xcdFxcdCFAIyBzb21lIG1vcmUgdGV4dCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDIsIDEsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0c29tZSB0ZXh0Jyxcblx0XHRcdFx0J1xcdCAgICcsXG5cdFx0XHRcdCdcXHRcXHRzb21lIG1vcmUgdGV4dCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDIsIDEsIDEpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnd29ya3MgaW4gb25seSB3aGl0ZXNwYWNlJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3RMaW5lQ29tbWVudENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHQgICAgJyxcblx0XHRcdFx0J1xcdCcsXG5cdFx0XHRcdCdcXHRcXHRzb21lIG1vcmUgdGV4dCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDEsIDEsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0IUAjICAgICAnLFxuXHRcdFx0XHQnXFx0IUAjICcsXG5cdFx0XHRcdCdcXHRcXHRzb21lIG1vcmUgdGV4dCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDEsIDEsIDEpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY29tbWVudHMgc2luZ2xlIGxpbmUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdExpbmVDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J3NvbWUgdGV4dCcsXG5cdFx0XHRcdCdcXHRzb21lIG1vcmUgdGV4dCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnIUAjIHNvbWUgdGV4dCcsXG5cdFx0XHRcdCdcXHRzb21lIG1vcmUgdGV4dCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDUpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGV0ZWN0cyBpbmRlbnRhdGlvbicsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0TGluZUNvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0c29tZSB0ZXh0Jyxcblx0XHRcdFx0J1xcdHNvbWUgbW9yZSB0ZXh0J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMiwgMSwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHQhQCMgc29tZSB0ZXh0Jyxcblx0XHRcdFx0J1xcdCFAIyBzb21lIG1vcmUgdGV4dCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDIsIDEsIDEpXG5cdFx0KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0VkaXRvciBDb250cmliIC0gTGluZSBDb21tZW50IEFzIEJsb2NrIENvbW1lbnQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgdGVzdExpbmVDb21tZW50Q29tbWFuZCA9IGNyZWF0ZVRlc3RDb21tYW5kSGVscGVyKFxuXHRcdHsgbGluZUNvbW1lbnQ6ICcnLCBibG9ja0NvbW1lbnQ6IFsnKCcsICcpJ10gfSxcblx0XHQoYWNjZXNzb3IsIHNlbCkgPT4gbmV3IExpbmVDb21tZW50Q29tbWFuZChhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpLCBzZWwsIDQsIFR5cGUuVG9nZ2xlLCB0cnVlLCB0cnVlKVxuXHQpO1xuXG5cdHRlc3QoJ2ZhbGwgYmFjayB0byBibG9jayBjb21tZW50IGNvbW1hbmQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdExpbmVDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J1xcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSxcblx0XHRcdFtcblx0XHRcdFx0JyggZmlyc3QgKScsXG5cdFx0XHRcdCdcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMywgMSwgMylcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWxsIGJhY2sgdG8gYmxvY2sgY29tbWVudCBjb21tYW5kIC0gdG9nZ2xlJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3RMaW5lQ29tbWVudENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCcoZmlyc3QpJyxcblx0XHRcdFx0J1xcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCA3LCAxLCAyKSxcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J1xcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCA2LCAxLCAxKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1ZyA5NTEzIC0gZXhwYW5kIHNpbmdsZSBsaW5lIHRvIHVuY29tbWVudCBhdXRvIGJsb2NrJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3RMaW5lQ29tbWVudENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCcoIGZpcnN0ICknLFxuXHRcdFx0XHQnXFx0c2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYnVnIDk2OTEgLSBhbHdheXMgZXhwYW5kIHNlbGVjdGlvbiB0byBsaW5lIGJvdW5kYXJpZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdExpbmVDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J1xcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigzLCAyLCAxLCAzKSxcblx0XHRcdFtcblx0XHRcdFx0JyggZmlyc3QnLFxuXHRcdFx0XHQnXFx0c2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZSApJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMywgMiwgMSwgNSlcblx0XHQpO1xuXG5cdFx0dGVzdExpbmVDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0JyhmaXJzdCcsXG5cdFx0XHRcdCdcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lKScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDExLCAxLCAyKSxcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J1xcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigzLCAxMSwgMSwgMSlcblx0XHQpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnRWRpdG9yIENvbnRyaWIgLSBMaW5lIENvbW1lbnQgQXMgQmxvY2sgQ29tbWVudCAyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHRlc3RMaW5lQ29tbWVudENvbW1hbmQgPSBjcmVhdGVUZXN0Q29tbWFuZEhlbHBlcihcblx0XHR7IGxpbmVDb21tZW50OiBudWxsLCBibG9ja0NvbW1lbnQ6IFsnPCFAIycsICcjQCE+J10gfSxcblx0XHQoYWNjZXNzb3IsIHNlbCkgPT4gbmV3IExpbmVDb21tZW50Q29tbWFuZChhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpLCBzZWwsIDQsIFR5cGUuVG9nZ2xlLCB0cnVlLCB0cnVlKVxuXHQpO1xuXG5cdHRlc3QoJ25vIHNlbGVjdGlvbiA9PiB1c2VzIGluZGVudGF0aW9uJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3RMaW5lQ29tbWVudENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHRcXHRmaXJzdFxcdCAgICAnLFxuXHRcdFx0XHQnXFx0XFx0c2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQnXFx0dGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdcXHRcXHQ8IUAjZmlmdGgjQCE+XFx0XFx0J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHRcXHQ8IUAjIGZpcnN0XFx0ICAgICAjQCE+Jyxcblx0XHRcdFx0J1xcdFxcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J1xcdHRoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnXFx0XFx0PCFAI2ZpZnRoI0AhPlxcdFxcdCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpXG5cdFx0KTtcblxuXHRcdHRlc3RMaW5lQ29tbWVudENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHRcXHQ8IUAjZmlyc3RcXHQgICAgI0AhPicsXG5cdFx0XHRcdCdcXHRcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCdcXHR0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J1xcdFxcdDwhQCNmaWZ0aCNAIT5cXHRcXHQnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSxcblx0XHRcdFtcblx0XHRcdFx0J1xcdFxcdGZpcnN0XFx0ICAgJyxcblx0XHRcdFx0J1xcdFxcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J1xcdHRoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnXFx0XFx0PCFAI2ZpZnRoI0AhPlxcdFxcdCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIHJlbW92ZScsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0TGluZUNvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0XFx0Zmlyc3RcXHQgICAgJyxcblx0XHRcdFx0J1xcdFxcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J1xcdHRoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnXFx0XFx0PCFAI2ZpZnRoI0AhPlxcdFxcdCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDEsIDUsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0XFx0Zmlyc3RcXHQgICAgJyxcblx0XHRcdFx0J1xcdFxcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J1xcdHRoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnXFx0XFx0ZmlmdGhcXHRcXHQnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbig1LCAxLCA1LCAxKVxuXHRcdCk7XG5cblx0XHR0ZXN0TGluZUNvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0XFx0Zmlyc3RcXHQgICAgJyxcblx0XHRcdFx0J1xcdFxcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J1xcdHRoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnXFx0XFx0PCFAI2ZpZnRoI0AhPlxcdFxcdCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDMsIDUsIDMpLFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0XFx0Zmlyc3RcXHQgICAgJyxcblx0XHRcdFx0J1xcdFxcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J1xcdHRoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnXFx0XFx0ZmlmdGhcXHRcXHQnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbig1LCAzLCA1LCAzKVxuXHRcdCk7XG5cblx0XHR0ZXN0TGluZUNvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0XFx0Zmlyc3RcXHQgICAgJyxcblx0XHRcdFx0J1xcdFxcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J1xcdHRoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnXFx0XFx0PCFAI2ZpZnRoI0AhPlxcdFxcdCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDQsIDUsIDQpLFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0XFx0Zmlyc3RcXHQgICAgJyxcblx0XHRcdFx0J1xcdFxcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J1xcdHRoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnXFx0XFx0ZmlmdGhcXHRcXHQnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbig1LCAzLCA1LCAzKVxuXHRcdCk7XG5cblx0XHR0ZXN0TGluZUNvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0XFx0Zmlyc3RcXHQgICAgJyxcblx0XHRcdFx0J1xcdFxcdHNlY29uZCBsaW5lJyxcblx0XHRcdFx0J1xcdHRoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnXFx0XFx0PCFAI2ZpZnRoI0AhPlxcdFxcdCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDE2LCA1LCAzKSxcblx0XHRcdFtcblx0XHRcdFx0J1xcdFxcdGZpcnN0XFx0ICAgICcsXG5cdFx0XHRcdCdcXHRcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCdcXHR0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J1xcdFxcdGZpZnRoXFx0XFx0J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oNSwgOCwgNSwgMylcblx0XHQpO1xuXG5cdFx0dGVzdExpbmVDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J1xcdFxcdGZpcnN0XFx0ICAgICcsXG5cdFx0XHRcdCdcXHRcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCdcXHR0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J1xcdFxcdDwhQCNmaWZ0aCNAIT5cXHRcXHQnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbig1LCAxMiwgNSwgNyksXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHRcXHRmaXJzdFxcdCAgICAnLFxuXHRcdFx0XHQnXFx0XFx0c2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQnXFx0dGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdcXHRcXHRmaWZ0aFxcdFxcdCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDgsIDUsIDMpXG5cdFx0KTtcblxuXHRcdHRlc3RMaW5lQ29tbWVudENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHRcXHRmaXJzdFxcdCAgICAnLFxuXHRcdFx0XHQnXFx0XFx0c2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQnXFx0dGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdcXHRcXHQ8IUAjZmlmdGgjQCE+XFx0XFx0J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oNSwgMTgsIDUsIDE4KSxcblx0XHRcdFtcblx0XHRcdFx0J1xcdFxcdGZpcnN0XFx0ICAgICcsXG5cdFx0XHRcdCdcXHRcXHRzZWNvbmQgbGluZScsXG5cdFx0XHRcdCdcXHR0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J1xcdFxcdGZpZnRoXFx0XFx0J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oNSwgMTAsIDUsIDEwKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM5OTM6IFJlbW92ZSBjb21tZW50IGRvZXMgbm90IHdvcmsgY29uc2lzdGVudGx5IGluIEhUTUwnLCAoKSA9PiB7XG5cdFx0dGVzdExpbmVDb21tZW50Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0JyAgICAgYXNkIHF3ZScsXG5cdFx0XHRcdCcgICAgIGFzZCBxd2UnLFxuXHRcdFx0XHQnJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMywgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCcgICAgIDwhQCMgYXNkIHF3ZScsXG5cdFx0XHRcdCcgICAgIGFzZCBxd2UgI0AhPicsXG5cdFx0XHRcdCcnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAzLCAxKVxuXHRcdCk7XG5cblx0XHR0ZXN0TGluZUNvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnICAgICA8IUAjYXNkIHF3ZScsXG5cdFx0XHRcdCcgICAgIGFzZCBxd2UjQCE+Jyxcblx0XHRcdFx0Jydcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDMsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnICAgICBhc2QgcXdlJyxcblx0XHRcdFx0JyAgICAgYXNkIHF3ZScsXG5cdFx0XHRcdCcnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAzLCAxKVxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdFZGl0b3IgQ29udHJpYiAtIExpbmUgQ29tbWVudCBpbiBtaXhlZCBtb2RlcycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBPVVRFUl9MQU5HVUFHRV9JRCA9ICdvdXRlck1vZGUnO1xuXHRjb25zdCBJTk5FUl9MQU5HVUFHRV9JRCA9ICdpbm5lck1vZGUnO1xuXG5cdGNsYXNzIE91dGVyTW9kZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VJZCA9IE9VVEVSX0xBTkdVQUdFX0lEO1xuXHRcdGNvbnN0cnVjdG9yKFxuXHRcdFx0Y29tbWVudHNDb25maWc6IENvbW1lbnRSdWxlLFxuXHRcdFx0QElMYW5ndWFnZVNlcnZpY2UgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdFx0QElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0KSB7XG5cdFx0XHRzdXBlcigpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogdGhpcy5sYW5ndWFnZUlkIH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIodGhpcy5sYW5ndWFnZUlkLCB7XG5cdFx0XHRcdGNvbW1lbnRzOiBjb21tZW50c0NvbmZpZ1xuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihUb2tlbml6YXRpb25SZWdpc3RyeS5yZWdpc3Rlcih0aGlzLmxhbmd1YWdlSWQsIHtcblx0XHRcdFx0Z2V0SW5pdGlhbFN0YXRlOiAoKTogSVN0YXRlID0+IE51bGxTdGF0ZSxcblx0XHRcdFx0dG9rZW5pemU6ICgpID0+IHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR0b2tlbml6ZUVuY29kZWQ6IChsaW5lOiBzdHJpbmcsIGhhc0VPTDogYm9vbGVhbiwgc3RhdGU6IElTdGF0ZSk6IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGxhbmd1YWdlSWQgPSAoL14gIC8udGVzdChsaW5lKSA/IElOTkVSX0xBTkdVQUdFX0lEIDogT1VURVJfTEFOR1VBR0VfSUQpO1xuXHRcdFx0XHRcdGNvbnN0IGVuY29kZWRMYW5ndWFnZUlkID0gbGFuZ3VhZ2VTZXJ2aWNlLmxhbmd1YWdlSWRDb2RlYy5lbmNvZGVMYW5ndWFnZUlkKGxhbmd1YWdlSWQpO1xuXG5cdFx0XHRcdFx0Y29uc3QgdG9rZW5zID0gbmV3IFVpbnQzMkFycmF5KDEgPDwgMSk7XG5cdFx0XHRcdFx0dG9rZW5zWygwIDw8IDEpXSA9IDA7XG5cdFx0XHRcdFx0dG9rZW5zWygwIDw8IDEpICsgMV0gPSAoXG5cdFx0XHRcdFx0XHQoQ29sb3JJZC5EZWZhdWx0Rm9yZWdyb3VuZCA8PCBNZXRhZGF0YUNvbnN0cy5GT1JFR1JPVU5EX09GRlNFVClcblx0XHRcdFx0XHRcdHwgKGVuY29kZWRMYW5ndWFnZUlkIDw8IE1ldGFkYXRhQ29uc3RzLkxBTkdVQUdFSURfT0ZGU0VUKVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0KHRva2VucywgW10sIHN0YXRlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdGNsYXNzIElubmVyTW9kZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRcdHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VJZCA9IElOTkVSX0xBTkdVQUdFX0lEO1xuXHRcdGNvbnN0cnVjdG9yKFxuXHRcdFx0Y29tbWVudHNDb25maWc6IENvbW1lbnRSdWxlLFxuXHRcdFx0QElMYW5ndWFnZVNlcnZpY2UgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdFx0QElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdFx0KSB7XG5cdFx0XHRzdXBlcigpO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogdGhpcy5sYW5ndWFnZUlkIH0pKTtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIodGhpcy5sYW5ndWFnZUlkLCB7XG5cdFx0XHRcdGNvbW1lbnRzOiBjb21tZW50c0NvbmZpZ1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIHRlc3RMaW5lQ29tbWVudENvbW1hbmQobGluZXM6IHN0cmluZ1tdLCBzZWxlY3Rpb246IFNlbGVjdGlvbiwgZXhwZWN0ZWRMaW5lczogc3RyaW5nW10sIGV4cGVjdGVkU2VsZWN0aW9uOiBTZWxlY3Rpb24pOiB2b2lkIHtcblxuXHRcdGNvbnN0IHNldHVwID0gKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKSA9PiB7XG5cdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE91dGVyTW9kZSwgeyBsaW5lQ29tbWVudDogJy8vJywgYmxvY2tDb21tZW50OiBbJy8qJywgJyovJ10gfSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKElubmVyTW9kZSwgeyBsaW5lQ29tbWVudDogbnVsbCwgYmxvY2tDb21tZW50OiBbJ3svKicsICcqL30nXSB9KSk7XG5cdFx0fTtcblxuXHRcdHRlc3RDb21tYW5kKFxuXHRcdFx0bGluZXMsXG5cdFx0XHRPVVRFUl9MQU5HVUFHRV9JRCxcblx0XHRcdHNlbGVjdGlvbixcblx0XHRcdChhY2Nlc3Nvciwgc2VsKSA9PiBuZXcgTGluZUNvbW1lbnRDb21tYW5kKGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSksIHNlbCwgNCwgVHlwZS5Ub2dnbGUsIHRydWUsIHRydWUpLFxuXHRcdFx0ZXhwZWN0ZWRMaW5lcyxcblx0XHRcdGV4cGVjdGVkU2VsZWN0aW9uLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdHNldHVwXG5cdFx0KTtcblx0fVxuXG5cdHRlc3QoJ2lzc3VlICMyNDA0NyAocGFydCAxKTogQ29tbWVudGluZyBjb2RlIGluIEpTWCBmaWxlcycsICgpID0+IHtcblx0XHR0ZXN0TGluZUNvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnaW1wb3J0IFJlYWN0IGZyb20gXFwncmVhY3RcXCc7Jyxcblx0XHRcdFx0J2NvbnN0IExvYWRlciA9ICgpID0+ICgnLFxuXHRcdFx0XHQnICA8ZGl2PicsXG5cdFx0XHRcdCcgICAgTG9hZGluZy4uLicsXG5cdFx0XHRcdCcgIDwvZGl2PicsXG5cdFx0XHRcdCcpOycsXG5cdFx0XHRcdCdleHBvcnQgZGVmYXVsdCBMb2FkZXI7J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgNywgMjIpLFxuXHRcdFx0W1xuXHRcdFx0XHQnLy8gaW1wb3J0IFJlYWN0IGZyb20gXFwncmVhY3RcXCc7Jyxcblx0XHRcdFx0Jy8vIGNvbnN0IExvYWRlciA9ICgpID0+ICgnLFxuXHRcdFx0XHQnLy8gICA8ZGl2PicsXG5cdFx0XHRcdCcvLyAgICAgTG9hZGluZy4uLicsXG5cdFx0XHRcdCcvLyAgIDwvZGl2PicsXG5cdFx0XHRcdCcvLyApOycsXG5cdFx0XHRcdCcvLyBleHBvcnQgZGVmYXVsdCBMb2FkZXI7J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNCwgNywgMjUpLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyNDA0NyAocGFydCAyKTogQ29tbWVudGluZyBjb2RlIGluIEpTWCBmaWxlcycsICgpID0+IHtcblx0XHR0ZXN0TGluZUNvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnaW1wb3J0IFJlYWN0IGZyb20gXFwncmVhY3RcXCc7Jyxcblx0XHRcdFx0J2NvbnN0IExvYWRlciA9ICgpID0+ICgnLFxuXHRcdFx0XHQnICA8ZGl2PicsXG5cdFx0XHRcdCcgICAgTG9hZGluZy4uLicsXG5cdFx0XHRcdCcgIDwvZGl2PicsXG5cdFx0XHRcdCcpOycsXG5cdFx0XHRcdCdleHBvcnQgZGVmYXVsdCBMb2FkZXI7J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMywgNCwgMywgNCksXG5cdFx0XHRbXG5cdFx0XHRcdCdpbXBvcnQgUmVhY3QgZnJvbSBcXCdyZWFjdFxcJzsnLFxuXHRcdFx0XHQnY29uc3QgTG9hZGVyID0gKCkgPT4gKCcsXG5cdFx0XHRcdCcgIHsvKiA8ZGl2PiAqL30nLFxuXHRcdFx0XHQnICAgIExvYWRpbmcuLi4nLFxuXHRcdFx0XHQnICA8L2Rpdj4nLFxuXHRcdFx0XHQnKTsnLFxuXHRcdFx0XHQnZXhwb3J0IGRlZmF1bHQgTG9hZGVyOydcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDgsIDMsIDgpLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMzNjE3MzogQ29tbWVudGluZyBjb2RlIGluIEpTWCB0YWcgYm9keScsICgpID0+IHtcblx0XHR0ZXN0TGluZUNvbW1lbnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnPGRpdj4nLFxuXHRcdFx0XHQnICB7MTIzfScsXG5cdFx0XHRcdCc8L2Rpdj4nLFxuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNCwgMiwgNCksXG5cdFx0XHRbXG5cdFx0XHRcdCc8ZGl2PicsXG5cdFx0XHRcdCcgIHsvKiB7MTIzfSAqL30nLFxuXHRcdFx0XHQnPC9kaXY+Jyxcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDgsIDIsIDgpLFxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsU0FBUyxzQkFBc0I7QUFDeEMsU0FBUywyQkFBbUMsNEJBQTRCO0FBQ3hFLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQTJELG9CQUFvQixZQUFZO0FBQzNGLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsNkJBQStDO0FBRXhELFNBQVMsd0JBQXdCLGdCQUE2QixnQkFBd0w7QUFDclAsU0FBTyxDQUFDLE9BQWlCLFdBQXNCLGVBQXlCLHNCQUFpQztBQUN4RyxVQUFNLGFBQWE7QUFDbkIsVUFBTSxVQUFVLENBQUMsVUFBNEIsZ0JBQWlDO0FBQzdFLFlBQU0sK0JBQStCLFNBQVMsSUFBSSw2QkFBNkI7QUFDL0UsWUFBTSxrQkFBa0IsU0FBUyxJQUFJLGdCQUFnQjtBQUNyRCxrQkFBWSxJQUFJLGdCQUFnQixpQkFBaUIsRUFBRSxJQUFJLFdBQVcsQ0FBQyxDQUFDO0FBQ3BFLGtCQUFZLElBQUksNkJBQTZCLFNBQVMsWUFBWTtBQUFBLFFBQ2pFLFVBQVU7QUFBQSxNQUNYLENBQUMsQ0FBQztBQUFBLElBQ0g7QUFDQSxnQkFB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QUUzQixZQUFRO0FBQUEsTUFDUDtBQUFBLE1BQVE7QUFBQSxNQUNSO0FBQUEsTUFBVTtBQUFBLE1BQ1Y7QUFBQSxNQUFZO0FBQUEsTUFDWjtBQUFBLE1BQVU7QUFBQSxJQUNYLEdBQUcsR0FBRyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxPQUFPO0FBRTNCLFlBQVE7QUFBQSxNQUNQO0FBQUEsTUFBUTtBQUFBLE1BQ1I7QUFBQSxNQUFVO0FBQUEsTUFDVjtBQUFBLE1BQVk7QUFBQSxNQUNaO0FBQUEsTUFBVTtBQUFBLE1BQ1Y7QUFBQSxNQUFRO0FBQUEsSUFDVCxHQUFHLEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxPQUFPO0FBRTlCLFlBQVE7QUFBQSxNQUNQO0FBQUEsTUFBUTtBQUFBLE1BQ1I7QUFBQSxNQUFVO0FBQUEsTUFDVjtBQUFBLE1BQVk7QUFBQSxNQUNaO0FBQUEsTUFBVTtBQUFBLE1BQ1Y7QUFBQSxNQUFRO0FBQUEsSUFDVCxHQUFHLEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxPQUFPO0FBRTlCLFlBQVE7QUFBQSxNQUNQO0FBQUEsTUFBTztBQUFBLE1BQ1A7QUFBQSxNQUFRO0FBQUEsTUFDUjtBQUFBLE1BQVM7QUFBQSxNQUNUO0FBQUEsTUFBUTtBQUFBLE1BQ1I7QUFBQSxNQUFNO0FBQUEsSUFDUCxHQUFHLEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxPQUFPO0FBRTlCLFlBQVE7QUFBQSxNQUNQO0FBQUEsTUFBUztBQUFBLE1BQ1Q7QUFBQSxNQUFVO0FBQUEsTUFDVjtBQUFBLE1BQVc7QUFBQSxNQUNYO0FBQUEsTUFBVTtBQUFBLE1BQ1Y7QUFBQSxNQUFNO0FBQUEsSUFDUCxHQUFHLEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxPQUFPO0FBRTlCLFlBQVE7QUFBQSxNQUNQO0FBQUEsTUFBTTtBQUFBLE1BQ047QUFBQSxNQUFRO0FBQUEsSUFDVCxHQUFHLEdBQUcs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QUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDeEI7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDekI7QUFFQTtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDeEI7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDekI7QUFFQTtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDeEI7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDekI7QUFFQTtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDO0FBQUEsTUFDekI7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDekI7QUFFQTtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDO0FBQUEsTUFDekI7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDekI7QUFFQTtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDMUI7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsSUFDM0I7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLGlFQUFpRSxNQUFNO0FBQzNFO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDeEI7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLElBQ3pCO0FBRUE7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUN4QjtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDekI7QUFBQSxFQUNELENBQUM7QUFDRixDQUFDO0FBRUQsTUFB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
