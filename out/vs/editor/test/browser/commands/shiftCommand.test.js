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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ShiftCommand } from "../../../common/commands/shiftCommand.js";
import { EditorAutoIndentStrategy } from "../../../common/config/editorOptions.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { ILanguageService } from "../../../common/languages/language.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { getEditOperation, testCommand } from "../testCommand.js";
import { javascriptOnEnterRules } from "../../common/modes/supports/onEnterRules.js";
import { TestLanguageConfigurationService } from "../../common/modes/testLanguageConfigurationService.js";
import { withEditorModel } from "../../common/testTextModel.js";
function createSingleEditOp(text, positionLineNumber, positionColumn, selectionLineNumber = positionLineNumber, selectionColumn = positionColumn) {
  return {
    range: new Range(selectionLineNumber, selectionColumn, positionLineNumber, positionColumn),
    text,
    forceMoveMarkers: false
  };
}
let DocBlockCommentMode = class extends Disposable {
  constructor(languageService, languageConfigurationService) {
    super();
    this.languageId = DocBlockCommentMode.languageId;
    this._register(languageService.registerLanguage({ id: this.languageId }));
    this._register(languageConfigurationService.register(this.languageId, {
      brackets: [
        ["(", ")"],
        ["{", "}"],
        ["[", "]"]
      ],
      onEnterRules: javascriptOnEnterRules
    }));
  }
};
DocBlockCommentMode.languageId = "commentMode";
DocBlockCommentMode = __decorateClass([
  __decorateParam(0, ILanguageService),
  __decorateParam(1, ILanguageConfigurationService)
], DocBlockCommentMode);
function testShiftCommand(lines, languageId, useTabStops, selection, expectedLines, expectedSelection, prepare) {
  testCommand(lines, languageId, selection, (accessor, sel) => new ShiftCommand(sel, {
    isUnshift: false,
    tabSize: 4,
    indentSize: 4,
    insertSpaces: false,
    useTabStops,
    autoIndent: EditorAutoIndentStrategy.Full
  }, accessor.get(ILanguageConfigurationService)), expectedLines, expectedSelection, void 0, prepare);
}
function testUnshiftCommand(lines, languageId, useTabStops, selection, expectedLines, expectedSelection, prepare) {
  testCommand(lines, languageId, selection, (accessor, sel) => new ShiftCommand(sel, {
    isUnshift: true,
    tabSize: 4,
    indentSize: 4,
    insertSpaces: false,
    useTabStops,
    autoIndent: EditorAutoIndentStrategy.Full
  }, accessor.get(ILanguageConfigurationService)), expectedLines, expectedSelection, void 0, prepare);
}
function prepareDocBlockCommentLanguage(accessor, disposables) {
  const languageConfigurationService = accessor.get(ILanguageConfigurationService);
  const languageService = accessor.get(ILanguageService);
  disposables.add(new DocBlockCommentMode(languageService, languageConfigurationService));
}
suite("Editor Commands - ShiftCommand", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Bug 9503: Shifting without any selection", () => {
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 1, 1, 1),
      [
        "	My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(1, 2, 1, 2)
    );
  });
  test("shift on single line selection 1", () => {
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 3, 1, 1),
      [
        "	My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(1, 4, 1, 1)
    );
  });
  test("shift on single line selection 2", () => {
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 1, 1, 3),
      [
        "	My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(1, 1, 1, 4)
    );
  });
  test("simple shift", () => {
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 1, 2, 1),
      [
        "	My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(1, 1, 2, 1)
    );
  });
  test("shifting on two separate lines", () => {
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 1, 2, 1),
      [
        "	My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(1, 1, 2, 1)
    );
    testShiftCommand(
      [
        "	My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(2, 1, 3, 1),
      [
        "	My First Line",
        "			My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(2, 1, 3, 1)
    );
  });
  test("shifting on two lines", () => {
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 2, 2, 2),
      [
        "	My First Line",
        "			My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(1, 3, 2, 2)
    );
  });
  test("shifting on two lines again", () => {
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(2, 2, 1, 2),
      [
        "	My First Line",
        "			My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(2, 2, 1, 3)
    );
  });
  test("shifting at end of file", () => {
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(4, 1, 5, 2),
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "	123"
      ],
      new Selection(4, 1, 5, 3)
    );
  });
  test("issue #1120 TAB should not indent empty lines in a multi-line selection", () => {
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 1, 5, 2),
      [
        "	My First Line",
        "			My Second Line",
        "		Third Line",
        "",
        "	123"
      ],
      new Selection(1, 1, 5, 3)
    );
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(4, 1, 5, 1),
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "	",
        "123"
      ],
      new Selection(4, 1, 5, 1)
    );
  });
  test("unshift on single line selection 1", () => {
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(2, 3, 2, 1),
      [
        "My First Line",
        "			My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(2, 3, 2, 1)
    );
  });
  test("unshift on single line selection 2", () => {
    testShiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(2, 1, 2, 3),
      [
        "My First Line",
        "			My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(2, 1, 2, 3)
    );
  });
  test("simple unshift", () => {
    testUnshiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 1, 2, 1),
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(1, 1, 2, 1)
    );
  });
  test("unshifting on two lines 1", () => {
    testUnshiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 2, 2, 2),
      [
        "My First Line",
        "	My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(1, 2, 2, 2)
    );
  });
  test("unshifting on two lines 2", () => {
    testUnshiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(2, 3, 2, 1),
      [
        "My First Line",
        "	My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(2, 2, 2, 1)
    );
  });
  test("unshifting at the end of the file", () => {
    testUnshiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(4, 1, 5, 2),
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(4, 1, 5, 2)
    );
  });
  test("unshift many times + shift", () => {
    testUnshiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 1, 5, 4),
      [
        "My First Line",
        "	My Second Line",
        "Third Line",
        "",
        "123"
      ],
      new Selection(1, 1, 5, 4)
    );
    testUnshiftCommand(
      [
        "My First Line",
        "	My Second Line",
        "Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 1, 5, 4),
      [
        "My First Line",
        "My Second Line",
        "Third Line",
        "",
        "123"
      ],
      new Selection(1, 1, 5, 4)
    );
    testShiftCommand(
      [
        "My First Line",
        "My Second Line",
        "Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(1, 1, 5, 4),
      [
        "	My First Line",
        "	My Second Line",
        "	Third Line",
        "",
        "	123"
      ],
      new Selection(1, 1, 5, 5)
    );
  });
  test("Bug 9119: Unshift from first column doesn't work", () => {
    testUnshiftCommand(
      [
        "My First Line",
        "		My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      null,
      true,
      new Selection(2, 1, 2, 1),
      [
        "My First Line",
        "	My Second Line",
        "    Third Line",
        "",
        "123"
      ],
      new Selection(2, 1, 2, 1)
    );
  });
  test("issue #348: indenting around doc block comments", () => {
    testShiftCommand(
      [
        "",
        "/**",
        " * a doc comment",
        " */",
        "function hello() {}"
      ],
      DocBlockCommentMode.languageId,
      true,
      new Selection(1, 1, 5, 20),
      [
        "",
        "	/**",
        "	 * a doc comment",
        "	 */",
        "	function hello() {}"
      ],
      new Selection(1, 1, 5, 21),
      prepareDocBlockCommentLanguage
    );
    testUnshiftCommand(
      [
        "",
        "/**",
        " * a doc comment",
        " */",
        "function hello() {}"
      ],
      DocBlockCommentMode.languageId,
      true,
      new Selection(1, 1, 5, 20),
      [
        "",
        "/**",
        " * a doc comment",
        " */",
        "function hello() {}"
      ],
      new Selection(1, 1, 5, 20),
      prepareDocBlockCommentLanguage
    );
    testUnshiftCommand(
      [
        "	",
        "	/**",
        "	 * a doc comment",
        "	 */",
        "	function hello() {}"
      ],
      DocBlockCommentMode.languageId,
      true,
      new Selection(1, 1, 5, 21),
      [
        "",
        "/**",
        " * a doc comment",
        " */",
        "function hello() {}"
      ],
      new Selection(1, 1, 5, 20),
      prepareDocBlockCommentLanguage
    );
  });
  test("issue #1609: Wrong indentation of block comments", () => {
    testShiftCommand(
      [
        "",
        "/**",
        " * test",
        " *",
        " * @type {number}",
        " */",
        "var foo = 0;"
      ],
      DocBlockCommentMode.languageId,
      true,
      new Selection(1, 1, 7, 13),
      [
        "",
        "	/**",
        "	 * test",
        "	 *",
        "	 * @type {number}",
        "	 */",
        "	var foo = 0;"
      ],
      new Selection(1, 1, 7, 14),
      prepareDocBlockCommentLanguage
    );
  });
  test("issue #1620: a) Line indent doesn't handle leading whitespace properly", () => {
    testCommand(
      [
        "   Written | Numeric",
        "       one | 1",
        "       two | 2",
        "     three | 3",
        "      four | 4",
        "      five | 5",
        "       six | 6",
        "     seven | 7",
        "     eight | 8",
        "      nine | 9",
        "       ten | 10",
        "    eleven | 11",
        ""
      ],
      null,
      new Selection(1, 1, 13, 1),
      (accessor, sel) => new ShiftCommand(sel, {
        isUnshift: false,
        tabSize: 4,
        indentSize: 4,
        insertSpaces: true,
        useTabStops: false,
        autoIndent: EditorAutoIndentStrategy.Full
      }, accessor.get(ILanguageConfigurationService)),
      [
        "       Written | Numeric",
        "           one | 1",
        "           two | 2",
        "         three | 3",
        "          four | 4",
        "          five | 5",
        "           six | 6",
        "         seven | 7",
        "         eight | 8",
        "          nine | 9",
        "           ten | 10",
        "        eleven | 11",
        ""
      ],
      new Selection(1, 1, 13, 1)
    );
  });
  test("issue #1620: b) Line indent doesn't handle leading whitespace properly", () => {
    testCommand(
      [
        "       Written | Numeric",
        "           one | 1",
        "           two | 2",
        "         three | 3",
        "          four | 4",
        "          five | 5",
        "           six | 6",
        "         seven | 7",
        "         eight | 8",
        "          nine | 9",
        "           ten | 10",
        "        eleven | 11",
        ""
      ],
      null,
      new Selection(1, 1, 13, 1),
      (accessor, sel) => new ShiftCommand(sel, {
        isUnshift: true,
        tabSize: 4,
        indentSize: 4,
        insertSpaces: true,
        useTabStops: false,
        autoIndent: EditorAutoIndentStrategy.Full
      }, accessor.get(ILanguageConfigurationService)),
      [
        "   Written | Numeric",
        "       one | 1",
        "       two | 2",
        "     three | 3",
        "      four | 4",
        "      five | 5",
        "       six | 6",
        "     seven | 7",
        "     eight | 8",
        "      nine | 9",
        "       ten | 10",
        "    eleven | 11",
        ""
      ],
      new Selection(1, 1, 13, 1)
    );
  });
  test("issue #1620: c) Line indent doesn't handle leading whitespace properly", () => {
    testCommand(
      [
        "       Written | Numeric",
        "           one | 1",
        "           two | 2",
        "         three | 3",
        "          four | 4",
        "          five | 5",
        "           six | 6",
        "         seven | 7",
        "         eight | 8",
        "          nine | 9",
        "           ten | 10",
        "        eleven | 11",
        ""
      ],
      null,
      new Selection(1, 1, 13, 1),
      (accessor, sel) => new ShiftCommand(sel, {
        isUnshift: true,
        tabSize: 4,
        indentSize: 4,
        insertSpaces: false,
        useTabStops: false,
        autoIndent: EditorAutoIndentStrategy.Full
      }, accessor.get(ILanguageConfigurationService)),
      [
        "   Written | Numeric",
        "       one | 1",
        "       two | 2",
        "     three | 3",
        "      four | 4",
        "      five | 5",
        "       six | 6",
        "     seven | 7",
        "     eight | 8",
        "      nine | 9",
        "       ten | 10",
        "    eleven | 11",
        ""
      ],
      new Selection(1, 1, 13, 1)
    );
  });
  test("issue #1620: d) Line indent doesn't handle leading whitespace properly", () => {
    testCommand(
      [
        "	   Written | Numeric",
        "	       one | 1",
        "	       two | 2",
        "	     three | 3",
        "	      four | 4",
        "	      five | 5",
        "	       six | 6",
        "	     seven | 7",
        "	     eight | 8",
        "	      nine | 9",
        "	       ten | 10",
        "	    eleven | 11",
        ""
      ],
      null,
      new Selection(1, 1, 13, 1),
      (accessor, sel) => new ShiftCommand(sel, {
        isUnshift: true,
        tabSize: 4,
        indentSize: 4,
        insertSpaces: true,
        useTabStops: false,
        autoIndent: EditorAutoIndentStrategy.Full
      }, accessor.get(ILanguageConfigurationService)),
      [
        "   Written | Numeric",
        "       one | 1",
        "       two | 2",
        "     three | 3",
        "      four | 4",
        "      five | 5",
        "       six | 6",
        "     seven | 7",
        "     eight | 8",
        "      nine | 9",
        "       ten | 10",
        "    eleven | 11",
        ""
      ],
      new Selection(1, 1, 13, 1)
    );
  });
  test("issue microsoft/monaco-editor#443: Indentation of a single row deletes selected text in some cases", () => {
    testCommand(
      [
        "Hello world!",
        "another line"
      ],
      null,
      new Selection(1, 1, 1, 13),
      (accessor, sel) => new ShiftCommand(sel, {
        isUnshift: false,
        tabSize: 4,
        indentSize: 4,
        insertSpaces: false,
        useTabStops: true,
        autoIndent: EditorAutoIndentStrategy.Full
      }, accessor.get(ILanguageConfigurationService)),
      [
        "	Hello world!",
        "another line"
      ],
      new Selection(1, 1, 1, 14)
    );
  });
  test("bug #16815:Shift+Tab doesn't go back to tabstop", () => {
    const repeatStr = (str, cnt) => {
      let r = "";
      for (let i = 0; i < cnt; i++) {
        r += str;
      }
      return r;
    };
    const testOutdent = (tabSize, indentSize, insertSpaces, lineText, expectedIndents) => {
      const oneIndent = insertSpaces ? repeatStr(" ", indentSize) : "	";
      const expectedIndent = repeatStr(oneIndent, expectedIndents);
      if (lineText.length > 0) {
        _assertUnshiftCommand(tabSize, indentSize, insertSpaces, [lineText + "aaa"], [createSingleEditOp(expectedIndent, 1, 1, 1, lineText.length + 1)]);
      } else {
        _assertUnshiftCommand(tabSize, indentSize, insertSpaces, [lineText + "aaa"], []);
      }
    };
    const testIndent = (tabSize, indentSize, insertSpaces, lineText, expectedIndents) => {
      const oneIndent = insertSpaces ? repeatStr(" ", indentSize) : "	";
      const expectedIndent = repeatStr(oneIndent, expectedIndents);
      _assertShiftCommand(tabSize, indentSize, insertSpaces, [lineText + "aaa"], [createSingleEditOp(expectedIndent, 1, 1, 1, lineText.length + 1)]);
    };
    const testIndentation = (tabSize, indentSize, lineText, expectedOnOutdent, expectedOnIndent) => {
      testOutdent(tabSize, indentSize, true, lineText, expectedOnOutdent);
      testOutdent(tabSize, indentSize, false, lineText, expectedOnOutdent);
      testIndent(tabSize, indentSize, true, lineText, expectedOnIndent);
      testIndent(tabSize, indentSize, false, lineText, expectedOnIndent);
    };
    testIndentation(4, 4, "", 0, 1);
    testIndentation(4, 4, "	", 0, 2);
    testIndentation(4, 4, " ", 0, 1);
    testIndentation(4, 4, " 	", 0, 2);
    testIndentation(4, 4, "  ", 0, 1);
    testIndentation(4, 4, "  	", 0, 2);
    testIndentation(4, 4, "   ", 0, 1);
    testIndentation(4, 4, "   	", 0, 2);
    testIndentation(4, 4, "    ", 0, 2);
    testIndentation(4, 4, "		", 1, 3);
    testIndentation(4, 4, "	 ", 1, 2);
    testIndentation(4, 4, "	 	", 1, 3);
    testIndentation(4, 4, "	  ", 1, 2);
    testIndentation(4, 4, "	  	", 1, 3);
    testIndentation(4, 4, "	   ", 1, 2);
    testIndentation(4, 4, "	   	", 1, 3);
    testIndentation(4, 4, "	    ", 1, 3);
    testIndentation(4, 4, " 		", 1, 3);
    testIndentation(4, 4, " 	 ", 1, 2);
    testIndentation(4, 4, " 	 	", 1, 3);
    testIndentation(4, 4, " 	  ", 1, 2);
    testIndentation(4, 4, " 	  	", 1, 3);
    testIndentation(4, 4, " 	   ", 1, 2);
    testIndentation(4, 4, " 	   	", 1, 3);
    testIndentation(4, 4, " 	    ", 1, 3);
    testIndentation(4, 4, "  		", 1, 3);
    testIndentation(4, 4, "  	 ", 1, 2);
    testIndentation(4, 4, "  	 	", 1, 3);
    testIndentation(4, 4, "  	  ", 1, 2);
    testIndentation(4, 4, "  	  	", 1, 3);
    testIndentation(4, 4, "  	   ", 1, 2);
    testIndentation(4, 4, "  	   	", 1, 3);
    testIndentation(4, 4, "  	    ", 1, 3);
    testIndentation(4, 4, "   		", 1, 3);
    testIndentation(4, 4, "   	 ", 1, 2);
    testIndentation(4, 4, "   	 	", 1, 3);
    testIndentation(4, 4, "   	  ", 1, 2);
    testIndentation(4, 4, "   	  	", 1, 3);
    testIndentation(4, 4, "   	   ", 1, 2);
    testIndentation(4, 4, "   	   	", 1, 3);
    testIndentation(4, 4, "   	    ", 1, 3);
    testIndentation(4, 4, "    	", 1, 3);
    testIndentation(4, 4, "     ", 1, 2);
    testIndentation(4, 4, "     	", 1, 3);
    testIndentation(4, 4, "      ", 1, 2);
    testIndentation(4, 4, "      	", 1, 3);
    testIndentation(4, 4, "       ", 1, 2);
    testIndentation(4, 4, "       	", 1, 3);
    testIndentation(4, 4, "        ", 1, 3);
    testIndentation(4, 4, "         ", 2, 3);
    function _assertUnshiftCommand(tabSize, indentSize, insertSpaces, text, expected) {
      return withEditorModel(text, (model) => {
        const testLanguageConfigurationService = new TestLanguageConfigurationService();
        const op = new ShiftCommand(new Selection(1, 1, text.length + 1, 1), {
          isUnshift: true,
          tabSize,
          indentSize,
          insertSpaces,
          useTabStops: true,
          autoIndent: EditorAutoIndentStrategy.Full
        }, testLanguageConfigurationService);
        const actual = getEditOperation(model, op);
        assert.deepStrictEqual(actual, expected);
        testLanguageConfigurationService.dispose();
      });
    }
    function _assertShiftCommand(tabSize, indentSize, insertSpaces, text, expected) {
      return withEditorModel(text, (model) => {
        const testLanguageConfigurationService = new TestLanguageConfigurationService();
        const op = new ShiftCommand(new Selection(1, 1, text.length + 1, 1), {
          isUnshift: false,
          tabSize,
          indentSize,
          insertSpaces,
          useTabStops: true,
          autoIndent: EditorAutoIndentStrategy.Full
        }, testLanguageConfigurationService);
        const actual = getEditOperation(model, op);
        assert.deepStrictEqual(actual, expected);
        testLanguageConfigurationService.dispose();
      });
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGJyb3dzZXJcXGNvbW1hbmRzXFxzaGlmdENvbW1hbmQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFNoaWZ0Q29tbWFuZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb21tYW5kcy9zaGlmdENvbW1hbmQuanMnO1xuaW1wb3J0IHsgRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElTaW5nbGVFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgZ2V0RWRpdE9wZXJhdGlvbiwgdGVzdENvbW1hbmQgfSBmcm9tICcuLi90ZXN0Q29tbWFuZC5qcyc7XG5pbXBvcnQgeyBqYXZhc2NyaXB0T25FbnRlclJ1bGVzIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVzL3N1cHBvcnRzL29uRW50ZXJSdWxlcy5qcyc7XG5pbXBvcnQgeyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2Rlcy90ZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyB3aXRoRWRpdG9yTW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5cbi8qKlxuICogQ3JlYXRlIHNpbmdsZSBlZGl0IG9wZXJhdGlvblxuICovXG5mdW5jdGlvbiBjcmVhdGVTaW5nbGVFZGl0T3AodGV4dDogc3RyaW5nLCBwb3NpdGlvbkxpbmVOdW1iZXI6IG51bWJlciwgcG9zaXRpb25Db2x1bW46IG51bWJlciwgc2VsZWN0aW9uTGluZU51bWJlcjogbnVtYmVyID0gcG9zaXRpb25MaW5lTnVtYmVyLCBzZWxlY3Rpb25Db2x1bW46IG51bWJlciA9IHBvc2l0aW9uQ29sdW1uKTogSVNpbmdsZUVkaXRPcGVyYXRpb24ge1xuXHRyZXR1cm4ge1xuXHRcdHJhbmdlOiBuZXcgUmFuZ2Uoc2VsZWN0aW9uTGluZU51bWJlciwgc2VsZWN0aW9uQ29sdW1uLCBwb3NpdGlvbkxpbmVOdW1iZXIsIHBvc2l0aW9uQ29sdW1uKSxcblx0XHR0ZXh0OiB0ZXh0LFxuXHRcdGZvcmNlTW92ZU1hcmtlcnM6IGZhbHNlXG5cdH07XG59XG5cbmNsYXNzIERvY0Jsb2NrQ29tbWVudE1vZGUgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwdWJsaWMgc3RhdGljIGxhbmd1YWdlSWQgPSAnY29tbWVudE1vZGUnO1xuXHRwdWJsaWMgcmVhZG9ubHkgbGFuZ3VhZ2VJZCA9IERvY0Jsb2NrQ29tbWVudE1vZGUubGFuZ3VhZ2VJZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxhbmd1YWdlU2VydmljZSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogdGhpcy5sYW5ndWFnZUlkIH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKHRoaXMubGFuZ3VhZ2VJZCwge1xuXHRcdFx0YnJhY2tldHM6IFtcblx0XHRcdFx0WycoJywgJyknXSxcblx0XHRcdFx0Wyd7JywgJ30nXSxcblx0XHRcdFx0WydbJywgJ10nXVxuXHRcdFx0XSxcblxuXHRcdFx0b25FbnRlclJ1bGVzOiBqYXZhc2NyaXB0T25FbnRlclJ1bGVzXG5cdFx0fSkpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHRlc3RTaGlmdENvbW1hbmQobGluZXM6IHN0cmluZ1tdLCBsYW5ndWFnZUlkOiBzdHJpbmcgfCBudWxsLCB1c2VUYWJTdG9wczogYm9vbGVhbiwgc2VsZWN0aW9uOiBTZWxlY3Rpb24sIGV4cGVjdGVkTGluZXM6IHN0cmluZ1tdLCBleHBlY3RlZFNlbGVjdGlvbjogU2VsZWN0aW9uLCBwcmVwYXJlPzogKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKSA9PiB2b2lkKTogdm9pZCB7XG5cdHRlc3RDb21tYW5kKGxpbmVzLCBsYW5ndWFnZUlkLCBzZWxlY3Rpb24sIChhY2Nlc3Nvciwgc2VsKSA9PiBuZXcgU2hpZnRDb21tYW5kKHNlbCwge1xuXHRcdGlzVW5zaGlmdDogZmFsc2UsXG5cdFx0dGFiU2l6ZTogNCxcblx0XHRpbmRlbnRTaXplOiA0LFxuXHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0dXNlVGFiU3RvcHM6IHVzZVRhYlN0b3BzLFxuXHRcdGF1dG9JbmRlbnQ6IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneS5GdWxsLFxuXHR9LCBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpKSwgZXhwZWN0ZWRMaW5lcywgZXhwZWN0ZWRTZWxlY3Rpb24sIHVuZGVmaW5lZCwgcHJlcGFyZSk7XG59XG5cbmZ1bmN0aW9uIHRlc3RVbnNoaWZ0Q29tbWFuZChsaW5lczogc3RyaW5nW10sIGxhbmd1YWdlSWQ6IHN0cmluZyB8IG51bGwsIHVzZVRhYlN0b3BzOiBib29sZWFuLCBzZWxlY3Rpb246IFNlbGVjdGlvbiwgZXhwZWN0ZWRMaW5lczogc3RyaW5nW10sIGV4cGVjdGVkU2VsZWN0aW9uOiBTZWxlY3Rpb24sIHByZXBhcmU/OiAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpID0+IHZvaWQpOiB2b2lkIHtcblx0dGVzdENvbW1hbmQobGluZXMsIGxhbmd1YWdlSWQsIHNlbGVjdGlvbiwgKGFjY2Vzc29yLCBzZWwpID0+IG5ldyBTaGlmdENvbW1hbmQoc2VsLCB7XG5cdFx0aXNVbnNoaWZ0OiB0cnVlLFxuXHRcdHRhYlNpemU6IDQsXG5cdFx0aW5kZW50U2l6ZTogNCxcblx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdHVzZVRhYlN0b3BzOiB1c2VUYWJTdG9wcyxcblx0XHRhdXRvSW5kZW50OiBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kuRnVsbCxcblx0fSwgYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSksIGV4cGVjdGVkTGluZXMsIGV4cGVjdGVkU2VsZWN0aW9uLCB1bmRlZmluZWQsIHByZXBhcmUpO1xufVxuXG5mdW5jdGlvbiBwcmVwYXJlRG9jQmxvY2tDb21tZW50TGFuZ3VhZ2UoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpIHtcblx0Y29uc3QgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdGNvbnN0IGxhbmd1YWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBEb2NCbG9ja0NvbW1lbnRNb2RlKGxhbmd1YWdlU2VydmljZSwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSkpO1xufVxuXG5zdWl0ZSgnRWRpdG9yIENvbW1hbmRzIC0gU2hpZnRDb21tYW5kJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIC0tLS0tLS0tLSBzaGlmdFxuXG5cdHRlc3QoJ0J1ZyA5NTAzOiBTaGlmdGluZyB3aXRob3V0IGFueSBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0dGVzdFNoaWZ0Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRudWxsLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHRNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAyLCAxLCAyKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NoaWZ0IG9uIHNpbmdsZSBsaW5lIHNlbGVjdGlvbiAxJywgKCkgPT4ge1xuXHRcdHRlc3RTaGlmdENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bnVsbCxcblx0XHRcdHRydWUsXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0TXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgMSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaGlmdCBvbiBzaW5nbGUgbGluZSBzZWxlY3Rpb24gMicsICgpID0+IHtcblx0XHR0ZXN0U2hpZnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG51bGwsXG5cdFx0XHR0cnVlLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCAzKSxcblx0XHRcdFtcblx0XHRcdFx0J1xcdE15IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDQpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc2ltcGxlIHNoaWZ0JywgKCkgPT4ge1xuXHRcdHRlc3RTaGlmdENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bnVsbCxcblx0XHRcdHRydWUsXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDIsIDEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0TXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMiwgMSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaGlmdGluZyBvbiB0d28gc2VwYXJhdGUgbGluZXMnLCAoKSA9PiB7XG5cdFx0dGVzdFNoaWZ0Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRudWxsLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMiwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHRNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAyLCAxKVxuXHRcdCk7XG5cblx0XHR0ZXN0U2hpZnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0TXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG51bGwsXG5cdFx0XHR0cnVlLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxLCAzLCAxKSxcblx0XHRcdFtcblx0XHRcdFx0J1xcdE15IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEsIDMsIDEpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc2hpZnRpbmcgb24gdHdvIGxpbmVzJywgKCkgPT4ge1xuXHRcdHRlc3RTaGlmdENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bnVsbCxcblx0XHRcdHRydWUsXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDIsIDIsIDIpLFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0TXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMywgMiwgMilcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaGlmdGluZyBvbiB0d28gbGluZXMgYWdhaW4nLCAoKSA9PiB7XG5cdFx0dGVzdFNoaWZ0Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRudWxsLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMiwgMSwgMiksXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHRNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCAyLCAxLCAzKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NoaWZ0aW5nIGF0IGVuZCBvZiBmaWxlJywgKCkgPT4ge1xuXHRcdHRlc3RTaGlmdENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bnVsbCxcblx0XHRcdHRydWUsXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDEsIDUsIDIpLFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnXFx0MTIzJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgMSwgNSwgMylcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTEyMCBUQUIgc2hvdWxkIG5vdCBpbmRlbnQgZW1wdHkgbGluZXMgaW4gYSBtdWx0aS1saW5lIHNlbGVjdGlvbicsICgpID0+IHtcblx0XHR0ZXN0U2hpZnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG51bGwsXG5cdFx0XHR0cnVlLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCA1LCAyKSxcblx0XHRcdFtcblx0XHRcdFx0J1xcdE15IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0VGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnXFx0MTIzJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgNSwgMylcblx0XHQpO1xuXG5cdFx0dGVzdFNoaWZ0Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRudWxsLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgMSwgNSwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0J1xcdCcsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbig0LCAxLCA1LCAxKVxuXHRcdCk7XG5cdH0pO1xuXG5cdC8vIC0tLS0tLS0tLSB1bnNoaWZ0XG5cblx0dGVzdCgndW5zaGlmdCBvbiBzaW5nbGUgbGluZSBzZWxlY3Rpb24gMScsICgpID0+IHtcblx0XHR0ZXN0U2hpZnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG51bGwsXG5cdFx0XHR0cnVlLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCAzLCAyLCAxKSxcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDMsIDIsIDEpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndW5zaGlmdCBvbiBzaW5nbGUgbGluZSBzZWxlY3Rpb24gMicsICgpID0+IHtcblx0XHR0ZXN0U2hpZnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG51bGwsXG5cdFx0XHR0cnVlLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxLCAyLCAzKSxcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDMpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc2ltcGxlIHVuc2hpZnQnLCAoKSA9PiB7XG5cdFx0dGVzdFVuc2hpZnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG51bGwsXG5cdFx0XHR0cnVlLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAyLCAxKSxcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDIsIDEpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndW5zaGlmdGluZyBvbiB0d28gbGluZXMgMScsICgpID0+IHtcblx0XHR0ZXN0VW5zaGlmdENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bnVsbCxcblx0XHRcdHRydWUsXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDIsIDIsIDIpLFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMiwgMiwgMilcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bnNoaWZ0aW5nIG9uIHR3byBsaW5lcyAyJywgKCkgPT4ge1xuXHRcdHRlc3RVbnNoaWZ0Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0XFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRudWxsLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMywgMiwgMSksXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCAyLCAyLCAxKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Vuc2hpZnRpbmcgYXQgdGhlIGVuZCBvZiB0aGUgZmlsZScsICgpID0+IHtcblx0XHR0ZXN0VW5zaGlmdENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bnVsbCxcblx0XHRcdHRydWUsXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDEsIDUsIDIpLFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgMSwgNSwgMilcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bnNoaWZ0IG1hbnkgdGltZXMgKyBzaGlmdCcsICgpID0+IHtcblx0XHR0ZXN0VW5zaGlmdENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdFxcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bnVsbCxcblx0XHRcdHRydWUsXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDUsIDQpLFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCdUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxMjMnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCA1LCA0KVxuXHRcdCk7XG5cblx0XHR0ZXN0VW5zaGlmdENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0J1RoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRudWxsLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgNSwgNCksXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J015IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0J1RoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDUsIDQpXG5cdFx0KTtcblxuXHRcdHRlc3RTaGlmdENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J015IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0J1RoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRudWxsLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgNSwgNCksXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHRNeSBGaXJzdCBMaW5lJyxcblx0XHRcdFx0J1xcdE15IFNlY29uZCBMaW5lJyxcblx0XHRcdFx0J1xcdFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J1xcdDEyMydcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDUsIDUpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnQnVnIDkxMTk6IFVuc2hpZnQgZnJvbSBmaXJzdCBjb2x1bW4gZG9lc25cXCd0IHdvcmsnLCAoKSA9PiB7XG5cdFx0dGVzdFVuc2hpZnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnTXkgRmlyc3QgTGluZScsXG5cdFx0XHRcdCdcXHRcXHRNeSBTZWNvbmQgTGluZScsXG5cdFx0XHRcdCcgICAgVGhpcmQgTGluZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnMTIzJ1xuXHRcdFx0XSxcblx0XHRcdG51bGwsXG5cdFx0XHR0cnVlLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxLCAyLCAxKSxcblx0XHRcdFtcblx0XHRcdFx0J015IEZpcnN0IExpbmUnLFxuXHRcdFx0XHQnXFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEyMydcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDEpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzM0ODogaW5kZW50aW5nIGFyb3VuZCBkb2MgYmxvY2sgY29tbWVudHMnLCAoKSA9PiB7XG5cdFx0dGVzdFNoaWZ0Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcvKionLFxuXHRcdFx0XHQnICogYSBkb2MgY29tbWVudCcsXG5cdFx0XHRcdCcgKi8nLFxuXHRcdFx0XHQnZnVuY3Rpb24gaGVsbG8oKSB7fSdcblx0XHRcdF0sXG5cdFx0XHREb2NCbG9ja0NvbW1lbnRNb2RlLmxhbmd1YWdlSWQsXG5cdFx0XHR0cnVlLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCA1LCAyMCksXG5cdFx0XHRbXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnXFx0LyoqJyxcblx0XHRcdFx0J1xcdCAqIGEgZG9jIGNvbW1lbnQnLFxuXHRcdFx0XHQnXFx0ICovJyxcblx0XHRcdFx0J1xcdGZ1bmN0aW9uIGhlbGxvKCkge30nXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCA1LCAyMSksXG5cdFx0XHRwcmVwYXJlRG9jQmxvY2tDb21tZW50TGFuZ3VhZ2Vcblx0XHQpO1xuXG5cdFx0dGVzdFVuc2hpZnRDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnJyxcblx0XHRcdFx0Jy8qKicsXG5cdFx0XHRcdCcgKiBhIGRvYyBjb21tZW50Jyxcblx0XHRcdFx0JyAqLycsXG5cdFx0XHRcdCdmdW5jdGlvbiBoZWxsbygpIHt9J1xuXHRcdFx0XSxcblx0XHRcdERvY0Jsb2NrQ29tbWVudE1vZGUubGFuZ3VhZ2VJZCxcblx0XHRcdHRydWUsXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDUsIDIwKSxcblx0XHRcdFtcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcvKionLFxuXHRcdFx0XHQnICogYSBkb2MgY29tbWVudCcsXG5cdFx0XHRcdCcgKi8nLFxuXHRcdFx0XHQnZnVuY3Rpb24gaGVsbG8oKSB7fSdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDUsIDIwKSxcblx0XHRcdHByZXBhcmVEb2NCbG9ja0NvbW1lbnRMYW5ndWFnZVxuXHRcdCk7XG5cblx0XHR0ZXN0VW5zaGlmdENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHQnLFxuXHRcdFx0XHQnXFx0LyoqJyxcblx0XHRcdFx0J1xcdCAqIGEgZG9jIGNvbW1lbnQnLFxuXHRcdFx0XHQnXFx0ICovJyxcblx0XHRcdFx0J1xcdGZ1bmN0aW9uIGhlbGxvKCkge30nXG5cdFx0XHRdLFxuXHRcdFx0RG9jQmxvY2tDb21tZW50TW9kZS5sYW5ndWFnZUlkLFxuXHRcdFx0dHJ1ZSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgNSwgMjEpLFxuXHRcdFx0W1xuXHRcdFx0XHQnJyxcblx0XHRcdFx0Jy8qKicsXG5cdFx0XHRcdCcgKiBhIGRvYyBjb21tZW50Jyxcblx0XHRcdFx0JyAqLycsXG5cdFx0XHRcdCdmdW5jdGlvbiBoZWxsbygpIHt9J1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgNSwgMjApLFxuXHRcdFx0cHJlcGFyZURvY0Jsb2NrQ29tbWVudExhbmd1YWdlXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE2MDk6IFdyb25nIGluZGVudGF0aW9uIG9mIGJsb2NrIGNvbW1lbnRzJywgKCkgPT4ge1xuXHRcdHRlc3RTaGlmdENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnLyoqJyxcblx0XHRcdFx0JyAqIHRlc3QnLFxuXHRcdFx0XHQnIConLFxuXHRcdFx0XHQnICogQHR5cGUge251bWJlcn0nLFxuXHRcdFx0XHQnICovJyxcblx0XHRcdFx0J3ZhciBmb28gPSAwOydcblx0XHRcdF0sXG5cdFx0XHREb2NCbG9ja0NvbW1lbnRNb2RlLmxhbmd1YWdlSWQsXG5cdFx0XHR0cnVlLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCA3LCAxMyksXG5cdFx0XHRbXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnXFx0LyoqJyxcblx0XHRcdFx0J1xcdCAqIHRlc3QnLFxuXHRcdFx0XHQnXFx0IConLFxuXHRcdFx0XHQnXFx0ICogQHR5cGUge251bWJlcn0nLFxuXHRcdFx0XHQnXFx0ICovJyxcblx0XHRcdFx0J1xcdHZhciBmb28gPSAwOydcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDcsIDE0KSxcblx0XHRcdHByZXBhcmVEb2NCbG9ja0NvbW1lbnRMYW5ndWFnZVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNjIwOiBhKSBMaW5lIGluZGVudCBkb2VzblxcJ3QgaGFuZGxlIGxlYWRpbmcgd2hpdGVzcGFjZSBwcm9wZXJseScsICgpID0+IHtcblx0XHR0ZXN0Q29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0JyAgIFdyaXR0ZW4gfCBOdW1lcmljJyxcblx0XHRcdFx0JyAgICAgICBvbmUgfCAxJyxcblx0XHRcdFx0JyAgICAgICB0d28gfCAyJyxcblx0XHRcdFx0JyAgICAgdGhyZWUgfCAzJyxcblx0XHRcdFx0JyAgICAgIGZvdXIgfCA0Jyxcblx0XHRcdFx0JyAgICAgIGZpdmUgfCA1Jyxcblx0XHRcdFx0JyAgICAgICBzaXggfCA2Jyxcblx0XHRcdFx0JyAgICAgc2V2ZW4gfCA3Jyxcblx0XHRcdFx0JyAgICAgZWlnaHQgfCA4Jyxcblx0XHRcdFx0JyAgICAgIG5pbmUgfCA5Jyxcblx0XHRcdFx0JyAgICAgICB0ZW4gfCAxMCcsXG5cdFx0XHRcdCcgICAgZWxldmVuIHwgMTEnLFxuXHRcdFx0XHQnJyxcblx0XHRcdF0sXG5cdFx0XHRudWxsLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxMywgMSksXG5cdFx0XHQoYWNjZXNzb3IsIHNlbCkgPT4gbmV3IFNoaWZ0Q29tbWFuZChzZWwsIHtcblx0XHRcdFx0aXNVbnNoaWZ0OiBmYWxzZSxcblx0XHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdFx0aW5kZW50U2l6ZTogNCxcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiB0cnVlLFxuXHRcdFx0XHR1c2VUYWJTdG9wczogZmFsc2UsXG5cdFx0XHRcdGF1dG9JbmRlbnQ6IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneS5GdWxsLFxuXHRcdFx0fSwgYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSksXG5cdFx0XHRbXG5cdFx0XHRcdCcgICAgICAgV3JpdHRlbiB8IE51bWVyaWMnLFxuXHRcdFx0XHQnICAgICAgICAgICBvbmUgfCAxJyxcblx0XHRcdFx0JyAgICAgICAgICAgdHdvIHwgMicsXG5cdFx0XHRcdCcgICAgICAgICB0aHJlZSB8IDMnLFxuXHRcdFx0XHQnICAgICAgICAgIGZvdXIgfCA0Jyxcblx0XHRcdFx0JyAgICAgICAgICBmaXZlIHwgNScsXG5cdFx0XHRcdCcgICAgICAgICAgIHNpeCB8IDYnLFxuXHRcdFx0XHQnICAgICAgICAgc2V2ZW4gfCA3Jyxcblx0XHRcdFx0JyAgICAgICAgIGVpZ2h0IHwgOCcsXG5cdFx0XHRcdCcgICAgICAgICAgbmluZSB8IDknLFxuXHRcdFx0XHQnICAgICAgICAgICB0ZW4gfCAxMCcsXG5cdFx0XHRcdCcgICAgICAgIGVsZXZlbiB8IDExJyxcblx0XHRcdFx0JycsXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxMywgMSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTYyMDogYikgTGluZSBpbmRlbnQgZG9lc25cXCd0IGhhbmRsZSBsZWFkaW5nIHdoaXRlc3BhY2UgcHJvcGVybHknLCAoKSA9PiB7XG5cdFx0dGVzdENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCcgICAgICAgV3JpdHRlbiB8IE51bWVyaWMnLFxuXHRcdFx0XHQnICAgICAgICAgICBvbmUgfCAxJyxcblx0XHRcdFx0JyAgICAgICAgICAgdHdvIHwgMicsXG5cdFx0XHRcdCcgICAgICAgICB0aHJlZSB8IDMnLFxuXHRcdFx0XHQnICAgICAgICAgIGZvdXIgfCA0Jyxcblx0XHRcdFx0JyAgICAgICAgICBmaXZlIHwgNScsXG5cdFx0XHRcdCcgICAgICAgICAgIHNpeCB8IDYnLFxuXHRcdFx0XHQnICAgICAgICAgc2V2ZW4gfCA3Jyxcblx0XHRcdFx0JyAgICAgICAgIGVpZ2h0IHwgOCcsXG5cdFx0XHRcdCcgICAgICAgICAgbmluZSB8IDknLFxuXHRcdFx0XHQnICAgICAgICAgICB0ZW4gfCAxMCcsXG5cdFx0XHRcdCcgICAgICAgIGVsZXZlbiB8IDExJyxcblx0XHRcdFx0JycsXG5cdFx0XHRdLFxuXHRcdFx0bnVsbCxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMTMsIDEpLFxuXHRcdFx0KGFjY2Vzc29yLCBzZWwpID0+IG5ldyBTaGlmdENvbW1hbmQoc2VsLCB7XG5cdFx0XHRcdGlzVW5zaGlmdDogdHJ1ZSxcblx0XHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdFx0aW5kZW50U2l6ZTogNCxcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiB0cnVlLFxuXHRcdFx0XHR1c2VUYWJTdG9wczogZmFsc2UsXG5cdFx0XHRcdGF1dG9JbmRlbnQ6IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneS5GdWxsLFxuXHRcdFx0fSwgYWNjZXNzb3IuZ2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSksXG5cdFx0XHRbXG5cdFx0XHRcdCcgICBXcml0dGVuIHwgTnVtZXJpYycsXG5cdFx0XHRcdCcgICAgICAgb25lIHwgMScsXG5cdFx0XHRcdCcgICAgICAgdHdvIHwgMicsXG5cdFx0XHRcdCcgICAgIHRocmVlIHwgMycsXG5cdFx0XHRcdCcgICAgICBmb3VyIHwgNCcsXG5cdFx0XHRcdCcgICAgICBmaXZlIHwgNScsXG5cdFx0XHRcdCcgICAgICAgc2l4IHwgNicsXG5cdFx0XHRcdCcgICAgIHNldmVuIHwgNycsXG5cdFx0XHRcdCcgICAgIGVpZ2h0IHwgOCcsXG5cdFx0XHRcdCcgICAgICBuaW5lIHwgOScsXG5cdFx0XHRcdCcgICAgICAgdGVuIHwgMTAnLFxuXHRcdFx0XHQnICAgIGVsZXZlbiB8IDExJyxcblx0XHRcdFx0JycsXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxMywgMSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTYyMDogYykgTGluZSBpbmRlbnQgZG9lc25cXCd0IGhhbmRsZSBsZWFkaW5nIHdoaXRlc3BhY2UgcHJvcGVybHknLCAoKSA9PiB7XG5cdFx0dGVzdENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCcgICAgICAgV3JpdHRlbiB8IE51bWVyaWMnLFxuXHRcdFx0XHQnICAgICAgICAgICBvbmUgfCAxJyxcblx0XHRcdFx0JyAgICAgICAgICAgdHdvIHwgMicsXG5cdFx0XHRcdCcgICAgICAgICB0aHJlZSB8IDMnLFxuXHRcdFx0XHQnICAgICAgICAgIGZvdXIgfCA0Jyxcblx0XHRcdFx0JyAgICAgICAgICBmaXZlIHwgNScsXG5cdFx0XHRcdCcgICAgICAgICAgIHNpeCB8IDYnLFxuXHRcdFx0XHQnICAgICAgICAgc2V2ZW4gfCA3Jyxcblx0XHRcdFx0JyAgICAgICAgIGVpZ2h0IHwgOCcsXG5cdFx0XHRcdCcgICAgICAgICAgbmluZSB8IDknLFxuXHRcdFx0XHQnICAgICAgICAgICB0ZW4gfCAxMCcsXG5cdFx0XHRcdCcgICAgICAgIGVsZXZlbiB8IDExJyxcblx0XHRcdFx0JycsXG5cdFx0XHRdLFxuXHRcdFx0bnVsbCxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMTMsIDEpLFxuXHRcdFx0KGFjY2Vzc29yLCBzZWwpID0+IG5ldyBTaGlmdENvbW1hbmQoc2VsLCB7XG5cdFx0XHRcdGlzVW5zaGlmdDogdHJ1ZSxcblx0XHRcdFx0dGFiU2l6ZTogNCxcblx0XHRcdFx0aW5kZW50U2l6ZTogNCxcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdFx0dXNlVGFiU3RvcHM6IGZhbHNlLFxuXHRcdFx0XHRhdXRvSW5kZW50OiBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kuRnVsbCxcblx0XHRcdH0sIGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSkpLFxuXHRcdFx0W1xuXHRcdFx0XHQnICAgV3JpdHRlbiB8IE51bWVyaWMnLFxuXHRcdFx0XHQnICAgICAgIG9uZSB8IDEnLFxuXHRcdFx0XHQnICAgICAgIHR3byB8IDInLFxuXHRcdFx0XHQnICAgICB0aHJlZSB8IDMnLFxuXHRcdFx0XHQnICAgICAgZm91ciB8IDQnLFxuXHRcdFx0XHQnICAgICAgZml2ZSB8IDUnLFxuXHRcdFx0XHQnICAgICAgIHNpeCB8IDYnLFxuXHRcdFx0XHQnICAgICBzZXZlbiB8IDcnLFxuXHRcdFx0XHQnICAgICBlaWdodCB8IDgnLFxuXHRcdFx0XHQnICAgICAgbmluZSB8IDknLFxuXHRcdFx0XHQnICAgICAgIHRlbiB8IDEwJyxcblx0XHRcdFx0JyAgICBlbGV2ZW4gfCAxMScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMTMsIDEpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE2MjA6IGQpIExpbmUgaW5kZW50IGRvZXNuXFwndCBoYW5kbGUgbGVhZGluZyB3aGl0ZXNwYWNlIHByb3Blcmx5JywgKCkgPT4ge1xuXHRcdHRlc3RDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0ICAgV3JpdHRlbiB8IE51bWVyaWMnLFxuXHRcdFx0XHQnXFx0ICAgICAgIG9uZSB8IDEnLFxuXHRcdFx0XHQnXFx0ICAgICAgIHR3byB8IDInLFxuXHRcdFx0XHQnXFx0ICAgICB0aHJlZSB8IDMnLFxuXHRcdFx0XHQnXFx0ICAgICAgZm91ciB8IDQnLFxuXHRcdFx0XHQnXFx0ICAgICAgZml2ZSB8IDUnLFxuXHRcdFx0XHQnXFx0ICAgICAgIHNpeCB8IDYnLFxuXHRcdFx0XHQnXFx0ICAgICBzZXZlbiB8IDcnLFxuXHRcdFx0XHQnXFx0ICAgICBlaWdodCB8IDgnLFxuXHRcdFx0XHQnXFx0ICAgICAgbmluZSB8IDknLFxuXHRcdFx0XHQnXFx0ICAgICAgIHRlbiB8IDEwJyxcblx0XHRcdFx0J1xcdCAgICBlbGV2ZW4gfCAxMScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XSxcblx0XHRcdG51bGwsXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEzLCAxKSxcblx0XHRcdChhY2Nlc3Nvciwgc2VsKSA9PiBuZXcgU2hpZnRDb21tYW5kKHNlbCwge1xuXHRcdFx0XHRpc1Vuc2hpZnQ6IHRydWUsXG5cdFx0XHRcdHRhYlNpemU6IDQsXG5cdFx0XHRcdGluZGVudFNpemU6IDQsXG5cdFx0XHRcdGluc2VydFNwYWNlczogdHJ1ZSxcblx0XHRcdFx0dXNlVGFiU3RvcHM6IGZhbHNlLFxuXHRcdFx0XHRhdXRvSW5kZW50OiBFZGl0b3JBdXRvSW5kZW50U3RyYXRlZ3kuRnVsbCxcblx0XHRcdH0sIGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSkpLFxuXHRcdFx0W1xuXHRcdFx0XHQnICAgV3JpdHRlbiB8IE51bWVyaWMnLFxuXHRcdFx0XHQnICAgICAgIG9uZSB8IDEnLFxuXHRcdFx0XHQnICAgICAgIHR3byB8IDInLFxuXHRcdFx0XHQnICAgICB0aHJlZSB8IDMnLFxuXHRcdFx0XHQnICAgICAgZm91ciB8IDQnLFxuXHRcdFx0XHQnICAgICAgZml2ZSB8IDUnLFxuXHRcdFx0XHQnICAgICAgIHNpeCB8IDYnLFxuXHRcdFx0XHQnICAgICBzZXZlbiB8IDcnLFxuXHRcdFx0XHQnICAgICBlaWdodCB8IDgnLFxuXHRcdFx0XHQnICAgICAgbmluZSB8IDknLFxuXHRcdFx0XHQnICAgICAgIHRlbiB8IDEwJyxcblx0XHRcdFx0JyAgICBlbGV2ZW4gfCAxMScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMTMsIDEpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgbWljcm9zb2Z0L21vbmFjby1lZGl0b3IjNDQzOiBJbmRlbnRhdGlvbiBvZiBhIHNpbmdsZSByb3cgZGVsZXRlcyBzZWxlY3RlZCB0ZXh0IGluIHNvbWUgY2FzZXMnLCAoKSA9PiB7XG5cdFx0dGVzdENvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdIZWxsbyB3b3JsZCEnLFxuXHRcdFx0XHQnYW5vdGhlciBsaW5lJ1xuXHRcdFx0XSxcblx0XHRcdG51bGwsXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEzKSxcblx0XHRcdChhY2Nlc3Nvciwgc2VsKSA9PiBuZXcgU2hpZnRDb21tYW5kKHNlbCwge1xuXHRcdFx0XHRpc1Vuc2hpZnQ6IGZhbHNlLFxuXHRcdFx0XHR0YWJTaXplOiA0LFxuXHRcdFx0XHRpbmRlbnRTaXplOiA0LFxuXHRcdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0XHR1c2VUYWJTdG9wczogdHJ1ZSxcblx0XHRcdFx0YXV0b0luZGVudDogRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5LkZ1bGwsXG5cdFx0XHR9LCBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpKSxcblx0XHRcdFtcblx0XHRcdFx0J1xcdEhlbGxvIHdvcmxkIScsXG5cdFx0XHRcdCdhbm90aGVyIGxpbmUnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxNClcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdidWcgIzE2ODE1OlNoaWZ0K1RhYiBkb2VzblxcJ3QgZ28gYmFjayB0byB0YWJzdG9wJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgcmVwZWF0U3RyID0gKHN0cjogc3RyaW5nLCBjbnQ6IG51bWJlcik6IHN0cmluZyA9PiB7XG5cdFx0XHRsZXQgciA9ICcnO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjbnQ7IGkrKykge1xuXHRcdFx0XHRyICs9IHN0cjtcblx0XHRcdH1cblx0XHRcdHJldHVybiByO1xuXHRcdH07XG5cblx0XHRjb25zdCB0ZXN0T3V0ZGVudCA9ICh0YWJTaXplOiBudW1iZXIsIGluZGVudFNpemU6IG51bWJlciwgaW5zZXJ0U3BhY2VzOiBib29sZWFuLCBsaW5lVGV4dDogc3RyaW5nLCBleHBlY3RlZEluZGVudHM6IG51bWJlcikgPT4ge1xuXHRcdFx0Y29uc3Qgb25lSW5kZW50ID0gaW5zZXJ0U3BhY2VzID8gcmVwZWF0U3RyKCcgJywgaW5kZW50U2l6ZSkgOiAnXFx0Jztcblx0XHRcdGNvbnN0IGV4cGVjdGVkSW5kZW50ID0gcmVwZWF0U3RyKG9uZUluZGVudCwgZXhwZWN0ZWRJbmRlbnRzKTtcblx0XHRcdGlmIChsaW5lVGV4dC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdF9hc3NlcnRVbnNoaWZ0Q29tbWFuZCh0YWJTaXplLCBpbmRlbnRTaXplLCBpbnNlcnRTcGFjZXMsIFtsaW5lVGV4dCArICdhYWEnXSwgW2NyZWF0ZVNpbmdsZUVkaXRPcChleHBlY3RlZEluZGVudCwgMSwgMSwgMSwgbGluZVRleHQubGVuZ3RoICsgMSldKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdF9hc3NlcnRVbnNoaWZ0Q29tbWFuZCh0YWJTaXplLCBpbmRlbnRTaXplLCBpbnNlcnRTcGFjZXMsIFtsaW5lVGV4dCArICdhYWEnXSwgW10pO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCB0ZXN0SW5kZW50ID0gKHRhYlNpemU6IG51bWJlciwgaW5kZW50U2l6ZTogbnVtYmVyLCBpbnNlcnRTcGFjZXM6IGJvb2xlYW4sIGxpbmVUZXh0OiBzdHJpbmcsIGV4cGVjdGVkSW5kZW50czogbnVtYmVyKSA9PiB7XG5cdFx0XHRjb25zdCBvbmVJbmRlbnQgPSBpbnNlcnRTcGFjZXMgPyByZXBlYXRTdHIoJyAnLCBpbmRlbnRTaXplKSA6ICdcXHQnO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRJbmRlbnQgPSByZXBlYXRTdHIob25lSW5kZW50LCBleHBlY3RlZEluZGVudHMpO1xuXHRcdFx0X2Fzc2VydFNoaWZ0Q29tbWFuZCh0YWJTaXplLCBpbmRlbnRTaXplLCBpbnNlcnRTcGFjZXMsIFtsaW5lVGV4dCArICdhYWEnXSwgW2NyZWF0ZVNpbmdsZUVkaXRPcChleHBlY3RlZEluZGVudCwgMSwgMSwgMSwgbGluZVRleHQubGVuZ3RoICsgMSldKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgdGVzdEluZGVudGF0aW9uID0gKHRhYlNpemU6IG51bWJlciwgaW5kZW50U2l6ZTogbnVtYmVyLCBsaW5lVGV4dDogc3RyaW5nLCBleHBlY3RlZE9uT3V0ZGVudDogbnVtYmVyLCBleHBlY3RlZE9uSW5kZW50OiBudW1iZXIpID0+IHtcblx0XHRcdHRlc3RPdXRkZW50KHRhYlNpemUsIGluZGVudFNpemUsIHRydWUsIGxpbmVUZXh0LCBleHBlY3RlZE9uT3V0ZGVudCk7XG5cdFx0XHR0ZXN0T3V0ZGVudCh0YWJTaXplLCBpbmRlbnRTaXplLCBmYWxzZSwgbGluZVRleHQsIGV4cGVjdGVkT25PdXRkZW50KTtcblxuXHRcdFx0dGVzdEluZGVudCh0YWJTaXplLCBpbmRlbnRTaXplLCB0cnVlLCBsaW5lVGV4dCwgZXhwZWN0ZWRPbkluZGVudCk7XG5cdFx0XHR0ZXN0SW5kZW50KHRhYlNpemUsIGluZGVudFNpemUsIGZhbHNlLCBsaW5lVGV4dCwgZXhwZWN0ZWRPbkluZGVudCk7XG5cdFx0fTtcblxuXHRcdC8vIGluc2VydFNwYWNlczogdHJ1ZVxuXHRcdC8vIDAgPT4gMFxuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnJywgMCwgMSk7XG5cblx0XHQvLyAxID0+IDBcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJ1xcdCcsIDAsIDIpO1xuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnICcsIDAsIDEpO1xuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnIFxcdCcsIDAsIDIpO1xuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnICAnLCAwLCAxKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyAgXFx0JywgMCwgMik7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgICAnLCAwLCAxKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyAgIFxcdCcsIDAsIDIpO1xuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnICAgICcsIDAsIDIpO1xuXG5cdFx0Ly8gMiA9PiAxXG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICdcXHRcXHQnLCAxLCAzKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJ1xcdCAnLCAxLCAyKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJ1xcdCBcXHQnLCAxLCAzKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJ1xcdCAgJywgMSwgMik7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICdcXHQgIFxcdCcsIDEsIDMpO1xuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnXFx0ICAgJywgMSwgMik7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICdcXHQgICBcXHQnLCAxLCAzKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJ1xcdCAgICAnLCAxLCAzKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyBcXHRcXHQnLCAxLCAzKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyBcXHQgJywgMSwgMik7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgXFx0IFxcdCcsIDEsIDMpO1xuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnIFxcdCAgJywgMSwgMik7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgXFx0ICBcXHQnLCAxLCAzKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyBcXHQgICAnLCAxLCAyKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyBcXHQgICBcXHQnLCAxLCAzKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyBcXHQgICAgJywgMSwgMyk7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgIFxcdFxcdCcsIDEsIDMpO1xuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnICBcXHQgJywgMSwgMik7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgIFxcdCBcXHQnLCAxLCAzKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyAgXFx0ICAnLCAxLCAyKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyAgXFx0ICBcXHQnLCAxLCAzKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyAgXFx0ICAgJywgMSwgMik7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgIFxcdCAgIFxcdCcsIDEsIDMpO1xuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnICBcXHQgICAgJywgMSwgMyk7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgICBcXHRcXHQnLCAxLCAzKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyAgIFxcdCAnLCAxLCAyKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyAgIFxcdCBcXHQnLCAxLCAzKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyAgIFxcdCAgJywgMSwgMik7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgICBcXHQgIFxcdCcsIDEsIDMpO1xuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnICAgXFx0ICAgJywgMSwgMik7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgICBcXHQgICBcXHQnLCAxLCAzKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyAgIFxcdCAgICAnLCAxLCAzKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyAgICBcXHQnLCAxLCAzKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyAgICAgJywgMSwgMik7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgICAgIFxcdCcsIDEsIDMpO1xuXHRcdHRlc3RJbmRlbnRhdGlvbig0LCA0LCAnICAgICAgJywgMSwgMik7XG5cdFx0dGVzdEluZGVudGF0aW9uKDQsIDQsICcgICAgICBcXHQnLCAxLCAzKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyAgICAgICAnLCAxLCAyKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyAgICAgICBcXHQnLCAxLCAzKTtcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyAgICAgICAgJywgMSwgMyk7XG5cblx0XHQvLyAzID0+IDJcblx0XHR0ZXN0SW5kZW50YXRpb24oNCwgNCwgJyAgICAgICAgICcsIDIsIDMpO1xuXG5cdFx0ZnVuY3Rpb24gX2Fzc2VydFVuc2hpZnRDb21tYW5kKHRhYlNpemU6IG51bWJlciwgaW5kZW50U2l6ZTogbnVtYmVyLCBpbnNlcnRTcGFjZXM6IGJvb2xlYW4sIHRleHQ6IHN0cmluZ1tdLCBleHBlY3RlZDogSVNpbmdsZUVkaXRPcGVyYXRpb25bXSk6IHZvaWQge1xuXHRcdFx0cmV0dXJuIHdpdGhFZGl0b3JNb2RlbCh0ZXh0LCAobW9kZWwpID0+IHtcblx0XHRcdFx0Y29uc3QgdGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRcdFx0Y29uc3Qgb3AgPSBuZXcgU2hpZnRDb21tYW5kKG5ldyBTZWxlY3Rpb24oMSwgMSwgdGV4dC5sZW5ndGggKyAxLCAxKSwge1xuXHRcdFx0XHRcdGlzVW5zaGlmdDogdHJ1ZSxcblx0XHRcdFx0XHR0YWJTaXplOiB0YWJTaXplLFxuXHRcdFx0XHRcdGluZGVudFNpemU6IGluZGVudFNpemUsXG5cdFx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBpbnNlcnRTcGFjZXMsXG5cdFx0XHRcdFx0dXNlVGFiU3RvcHM6IHRydWUsXG5cdFx0XHRcdFx0YXV0b0luZGVudDogRWRpdG9yQXV0b0luZGVudFN0cmF0ZWd5LkZ1bGwsXG5cdFx0XHRcdH0sIHRlc3RMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgYWN0dWFsID0gZ2V0RWRpdE9wZXJhdGlvbihtb2RlbCwgb3ApO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpO1xuXHRcdFx0XHR0ZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBfYXNzZXJ0U2hpZnRDb21tYW5kKHRhYlNpemU6IG51bWJlciwgaW5kZW50U2l6ZTogbnVtYmVyLCBpbnNlcnRTcGFjZXM6IGJvb2xlYW4sIHRleHQ6IHN0cmluZ1tdLCBleHBlY3RlZDogSVNpbmdsZUVkaXRPcGVyYXRpb25bXSk6IHZvaWQge1xuXHRcdFx0cmV0dXJuIHdpdGhFZGl0b3JNb2RlbCh0ZXh0LCAobW9kZWwpID0+IHtcblx0XHRcdFx0Y29uc3QgdGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRcdFx0Y29uc3Qgb3AgPSBuZXcgU2hpZnRDb21tYW5kKG5ldyBTZWxlY3Rpb24oMSwgMSwgdGV4dC5sZW5ndGggKyAxLCAxKSwge1xuXHRcdFx0XHRcdGlzVW5zaGlmdDogZmFsc2UsXG5cdFx0XHRcdFx0dGFiU2l6ZTogdGFiU2l6ZSxcblx0XHRcdFx0XHRpbmRlbnRTaXplOiBpbmRlbnRTaXplLFxuXHRcdFx0XHRcdGluc2VydFNwYWNlczogaW5zZXJ0U3BhY2VzLFxuXHRcdFx0XHRcdHVzZVRhYlN0b3BzOiB0cnVlLFxuXHRcdFx0XHRcdGF1dG9JbmRlbnQ6IEVkaXRvckF1dG9JbmRlbnRTdHJhdGVneS5GdWxsLFxuXHRcdFx0XHR9LCB0ZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGFjdHVhbCA9IGdldEVkaXRPcGVyYXRpb24obW9kZWwsIG9wKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcblx0XHRcdFx0dGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9KTtcblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGtCQUFtQztBQUM1QyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdDQUFnQztBQUV6QyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxrQkFBa0IsbUJBQW1CO0FBQzlDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsdUJBQXVCO0FBTWhDLFNBQVMsbUJBQW1CLE1BQWMsb0JBQTRCLGdCQUF3QixzQkFBOEIsb0JBQW9CLGtCQUEwQixnQkFBc0M7QUFDL00sU0FBTztBQUFBLElBQ04sT0FBTyxJQUFJLE1BQU0scUJBQXFCLGlCQUFpQixvQkFBb0IsY0FBYztBQUFBLElBQ3pGO0FBQUEsSUFDQSxrQkFBa0I7QUFBQSxFQUNuQjtBQUNEO0FBRUEsSUFBTSxzQkFBTixjQUFrQyxXQUFXO0FBQUEsRUFLNUMsWUFDbUIsaUJBQ2EsOEJBQzlCO0FBQ0QsVUFBTTtBQU5QLFNBQWdCLGFBQWEsb0JBQW9CO0FBT2hELFNBQUssVUFBVSxnQkFBZ0IsaUJBQWlCLEVBQUUsSUFBSSxLQUFLLFdBQVcsQ0FBQyxDQUFDO0FBQ3hFLFNBQUssVUFBVSw2QkFBNkIsU0FBUyxLQUFLLFlBQVk7QUFBQSxNQUNyRSxVQUFVO0FBQUEsUUFD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QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLElBQ3pCO0FBRUE7QUFBQSxNQUNDO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDeEI7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDekI7QUFBQSxFQUNELENBQUM7QUFJRCxPQUFLLHNDQUFzQyxNQUFNO0FBQ2hEO0FBQUEsTUFDQztBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLElBQ3pCO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxzQ0FBc0MsTUFBTTtBQUNoRDtBQUFBLE1BQ0M7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFB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UUFBUyxHQUFHLENBQUM7QUFDbkMsb0JBQWdCLEdBQUcsR0FBRyxTQUFXLEdBQUcsQ0FBQztBQUNyQyxvQkFBZ0IsR0FBRyxHQUFHLFNBQVUsR0FBRyxDQUFDO0FBQ3BDLG9CQUFnQixHQUFHLEdBQUcsT0FBUyxHQUFHLENBQUM7QUFDbkMsb0JBQWdCLEdBQUcsR0FBRyxPQUFRLEdBQUcsQ0FBQztBQUNsQyxvQkFBZ0IsR0FBRyxHQUFHLFFBQVUsR0FBRyxDQUFDO0FBQ3BDLG9CQUFnQixHQUFHLEdBQUcsUUFBUyxHQUFHLENBQUM7QUFDbkMsb0JBQWdCLEdBQUcsR0FBRyxTQUFXLEdBQUcsQ0FBQztBQUNyQyxvQkFBZ0IsR0FBRyxHQUFHLFNBQVUsR0FBRyxDQUFDO0FBQ3BDLG9CQUFnQixHQUFHLEdBQUcsVUFBWSxHQUFHLENBQUM7QUFDdEMsb0JBQWdCLEdBQUcsR0FBRyxVQUFXLEdBQUcsQ0FBQztBQUNyQyxvQkFBZ0IsR0FBRyxHQUFHLFFBQVUsR0FBRyxDQUFDO0FBQ3BDLG9CQUFnQixHQUFHLEdBQUcsUUFBUyxHQUFHLENBQUM7QUFDbkMsb0JBQWdCLEdBQUcsR0FBRyxTQUFXLEdBQUcsQ0FBQztBQUNyQyxvQkFBZ0IsR0FBRyxHQUFHLFNBQVUsR0FBRyxDQUFDO0FBQ3BDLG9CQUFnQixHQUFHLEdBQUcsVUFBWSxHQUFHLENBQUM7QUFDdEMsb0JBQWdCLEdBQUcsR0FBRyxVQUFXLEdBQUcsQ0FBQztBQUNyQyxvQkFBZ0IsR0FBRyxHQUFHLFdBQWEsR0FBRyxDQUFDO0FBQ3ZDLG9CQUFnQixHQUFHLEdBQUcsV0FBWSxHQUFHLENBQUM7QUFDdEMsb0JBQWdCLEdBQUcsR0FBRyxTQUFXLEdBQUcsQ0FBQztBQUNyQyxvQkFBZ0IsR0FBRyxHQUFHLFNBQVUsR0FBRyxDQUFDO0FBQ3BDLG9CQUFnQixHQUFHLEdBQUcsVUFBWSxHQUFHLENBQUM7QUFDdEMsb0JBQWdCLEdBQUcsR0FBRyxVQUFXLEdBQUcsQ0FBQztBQUNyQyxvQkFBZ0IsR0FBRyxHQUFHLFdBQWEsR0FBRyxDQUFDO0FBQ3ZDLG9CQUFnQixHQUFHLEdBQUcsV0FBWSxHQUFHLENBQUM7QUFDdEMsb0JBQWdCLEdBQUcsR0FBRyxZQUFjLEdBQUcsQ0FBQztBQUN4QyxvQkFBZ0IsR0FBRyxHQUFHLFlBQWEsR0FBRyxDQUFDO0FBQ3ZDLG9CQUFnQixHQUFHLEdBQUcsU0FBVSxHQUFHLENBQUM7QUFDcEMsb0JBQWdCLEdBQUcsR0FBRyxTQUFTLEdBQUcsQ0FBQztBQUNuQyxvQkFBZ0IsR0FBRyxHQUFHLFVBQVcsR0FBRyxDQUFDO0FBQ3JDLG9CQUFnQixHQUFHLEdBQUcsVUFBVSxHQUFHLENBQUM7QUFDcEMsb0JBQWdCLEdBQUcsR0FBRyxXQUFZLEdBQUcsQ0FBQztBQUN0QyxvQkFBZ0IsR0FBRyxHQUFHLFdBQVcsR0FBRyxDQUFDO0FBQ3JDLG9CQUFnQixHQUFHLEdBQUcsWUFBYSxHQUFHLENBQUM7QUFDdkMsb0JBQWdCLEdBQUcsR0FBRyxZQUFZLEdBQUcsQ0FBQztBQUd0QyxvQkFBZ0IsR0FBRyxHQUFHLGFBQWEsR0FBRyxDQUFDO0FBRXZDLGFBQVMsc0JBQXNCLFNBQWlCLFlBQW9CLGNBQXVCLE1BQWdCLFVBQXdDO0FBQ2xKLGFBQU8sZ0JBQWdCLE1BQU0sQ0FBQyxVQUFVO0FBQ3ZDLGNBQU0sbUNBQW1DLElBQUksaUNBQWlDO0FBQzlFLGNBQU0sS0FBSyxJQUFJLGFBQWEsSUFBSSxVQUFVLEdBQUcsR0FBRyxLQUFLLFNBQVMsR0FBRyxDQUFDLEdBQUc7QUFBQSxVQUNwRSxXQUFXO0FBQUEsVUFDWDtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQSxhQUFhO0FBQUEsVUFDYixZQUFZLHlCQUF5QjtBQUFBLFFBQ3RDLEdBQUcsZ0NBQWdDO0FBQ25DLGNBQU0sU0FBUyxpQkFBaUIsT0FBTyxFQUFFO0FBQ3pDLGVBQU8sZ0JBQWdCLFFBQVEsUUFBUTtBQUN2Qyx5Q0FBaUMsUUFBUTtBQUFBLE1BQzFDLENBQUM7QUFBQSxJQUNGO0FBRUEsYUFBUyxvQkFBb0IsU0FBaUIsWUFBb0IsY0FBdUIsTUFBZ0IsVUFBd0M7QUFDaEosYUFBTyxnQkFBZ0IsTUFBTSxDQUFDLFVBQVU7QUFDdkMsY0FBTSxtQ0FBbUMsSUFBSSxpQ0FBaUM7QUFDOUUsY0FBTSxLQUFLLElBQUksYUFBYSxJQUFJLFVBQVUsR0FBRyxHQUFHLEtBQUssU0FBUyxHQUFHLENBQUMsR0FBRztBQUFBLFVBQ3BFLFdBQVc7QUFBQSxVQUNYO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBLGFBQWE7QUFBQSxVQUNiLFlBQVkseUJBQXlCO0FBQUEsUUFDdEMsR0FBRyxnQ0FBZ0M7QUFDbkMsY0FBTSxTQUFTLGlCQUFpQixPQUFPLEVBQUU7QUFDekMsZUFBTyxnQkFBZ0IsUUFBUSxRQUFRO0FBQ3ZDLHlDQUFpQyxRQUFRO0FBQUEsTUFDMUMsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNELENBQUM7QUFFRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
