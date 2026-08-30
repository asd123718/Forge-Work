import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { CoreEditingCommands, CoreNavigationCommands } from "../../../browser/coreCommands.js";
import { EditOperation } from "../../../common/core/editOperation.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { MetadataConsts, StandardTokenType } from "../../../common/encodedTokenAttributes.js";
import { EncodedTokenizationResult, TokenizationRegistry } from "../../../common/languages.js";
import { ILanguageService } from "../../../common/languages/language.js";
import { IndentAction } from "../../../common/languages/languageConfiguration.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { NullState } from "../../../common/languages/nullTokenize.js";
import { EndOfLinePreference, EndOfLineSequence } from "../../../common/model.js";
import { TextModel } from "../../../common/model/textModel.js";
import { OutgoingViewModelEventKind } from "../../../common/viewModelEventDispatcher.js";
import { createCodeEditorServices, instantiateTestCodeEditor, withTestCodeEditor } from "../testCodeEditor.js";
import { createTextModel, instantiateTextModel } from "../../common/testTextModel.js";
import { InputMode } from "../../../common/inputMode.js";
import { EditSources } from "../../../common/textModelEditSource.js";
function moveTo(editor, viewModel, lineNumber, column, inSelectionMode = false) {
  if (inSelectionMode) {
    CoreNavigationCommands.MoveToSelect.runCoreEditorCommand(viewModel, {
      position: new Position(lineNumber, column)
    });
  } else {
    CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, {
      position: new Position(lineNumber, column)
    });
  }
}
function moveLeft(editor, viewModel, inSelectionMode = false) {
  if (inSelectionMode) {
    CoreNavigationCommands.CursorLeftSelect.runCoreEditorCommand(viewModel, {});
  } else {
    CoreNavigationCommands.CursorLeft.runCoreEditorCommand(viewModel, {});
  }
}
function moveRight(editor, viewModel, inSelectionMode = false) {
  if (inSelectionMode) {
    CoreNavigationCommands.CursorRightSelect.runCoreEditorCommand(viewModel, {});
  } else {
    CoreNavigationCommands.CursorRight.runCoreEditorCommand(viewModel, {});
  }
}
function moveDown(editor, viewModel, inSelectionMode = false) {
  if (inSelectionMode) {
    CoreNavigationCommands.CursorDownSelect.runCoreEditorCommand(viewModel, {});
  } else {
    CoreNavigationCommands.CursorDown.runCoreEditorCommand(viewModel, {});
  }
}
function moveUp(editor, viewModel, inSelectionMode = false) {
  if (inSelectionMode) {
    CoreNavigationCommands.CursorUpSelect.runCoreEditorCommand(viewModel, {});
  } else {
    CoreNavigationCommands.CursorUp.runCoreEditorCommand(viewModel, {});
  }
}
function moveToBeginningOfLine(editor, viewModel, inSelectionMode = false) {
  if (inSelectionMode) {
    CoreNavigationCommands.CursorHomeSelect.runCoreEditorCommand(viewModel, {});
  } else {
    CoreNavigationCommands.CursorHome.runCoreEditorCommand(viewModel, {});
  }
}
function moveToEndOfLine(editor, viewModel, inSelectionMode = false) {
  if (inSelectionMode) {
    CoreNavigationCommands.CursorEndSelect.runCoreEditorCommand(viewModel, {});
  } else {
    CoreNavigationCommands.CursorEnd.runCoreEditorCommand(viewModel, {});
  }
}
function moveToBeginningOfBuffer(editor, viewModel, inSelectionMode = false) {
  if (inSelectionMode) {
    CoreNavigationCommands.CursorTopSelect.runCoreEditorCommand(viewModel, {});
  } else {
    CoreNavigationCommands.CursorTop.runCoreEditorCommand(viewModel, {});
  }
}
function moveToEndOfBuffer(editor, viewModel, inSelectionMode = false) {
  if (inSelectionMode) {
    CoreNavigationCommands.CursorBottomSelect.runCoreEditorCommand(viewModel, {});
  } else {
    CoreNavigationCommands.CursorBottom.runCoreEditorCommand(viewModel, {});
  }
}
function assertCursor(viewModel, what) {
  let selections;
  if (what instanceof Position) {
    selections = [new Selection(what.lineNumber, what.column, what.lineNumber, what.column)];
  } else if (what instanceof Selection) {
    selections = [what];
  } else {
    selections = what;
  }
  const actual = viewModel.getSelections().map((s) => s.toString());
  const expected = selections.map((s) => s.toString());
  assert.deepStrictEqual(actual, expected);
}
suite("Editor Controller - Cursor", () => {
  const LINE1 = "    	My First Line	 ";
  const LINE2 = "	My Second Line";
  const LINE3 = "    Third Line\u{1F436}";
  const LINE4 = "";
  const LINE5 = "1";
  const TEXT = LINE1 + "\r\n" + LINE2 + "\n" + LINE3 + "\n" + LINE4 + "\r\n" + LINE5;
  function runTest(callback) {
    withTestCodeEditor(TEXT, {}, (editor, viewModel) => {
      callback(editor, viewModel);
    });
  }
  ensureNoDisposablesAreLeakedInTestSuite();
  test("cursor initialized", () => {
    runTest((editor, viewModel) => {
      assertCursor(viewModel, new Position(1, 1));
    });
  });
  test("no move", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 1);
      assertCursor(viewModel, new Position(1, 1));
    });
  });
  test("move", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 2);
      assertCursor(viewModel, new Position(1, 2));
    });
  });
  test("move in selection mode", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 2, true);
      assertCursor(viewModel, new Selection(1, 1, 1, 2));
    });
  });
  test("move beyond line end", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 25);
      assertCursor(viewModel, new Position(1, LINE1.length + 1));
    });
  });
  test("move empty line", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 4, 20);
      assertCursor(viewModel, new Position(4, 1));
    });
  });
  test("move one char line", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 5, 20);
      assertCursor(viewModel, new Position(5, 2));
    });
  });
  test("selection down", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 2, 1, true);
      assertCursor(viewModel, new Selection(1, 1, 2, 1));
    });
  });
  test("move and then select", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 2, 3);
      assertCursor(viewModel, new Position(2, 3));
      moveTo(editor, viewModel, 2, 15, true);
      assertCursor(viewModel, new Selection(2, 3, 2, 15));
      moveTo(editor, viewModel, 1, 2, true);
      assertCursor(viewModel, new Selection(2, 3, 1, 2));
    });
  });
  test("move left on top left position", () => {
    runTest((editor, viewModel) => {
      moveLeft(editor, viewModel);
      assertCursor(viewModel, new Position(1, 1));
    });
  });
  test("move left", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 3);
      assertCursor(viewModel, new Position(1, 3));
      moveLeft(editor, viewModel);
      assertCursor(viewModel, new Position(1, 2));
    });
  });
  test("move left with surrogate pair", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 17);
      assertCursor(viewModel, new Position(3, 17));
      moveLeft(editor, viewModel);
      assertCursor(viewModel, new Position(3, 15));
    });
  });
  test("move left goes to previous row", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 2, 1);
      assertCursor(viewModel, new Position(2, 1));
      moveLeft(editor, viewModel);
      assertCursor(viewModel, new Position(1, 21));
    });
  });
  test("move left selection", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 2, 1);
      assertCursor(viewModel, new Position(2, 1));
      moveLeft(editor, viewModel, true);
      assertCursor(viewModel, new Selection(2, 1, 1, 21));
    });
  });
  test("move right on bottom right position", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 5, 2);
      assertCursor(viewModel, new Position(5, 2));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Position(5, 2));
    });
  });
  test("move right", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 3);
      assertCursor(viewModel, new Position(1, 3));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Position(1, 4));
    });
  });
  test("move right with surrogate pair", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 15);
      assertCursor(viewModel, new Position(3, 15));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Position(3, 17));
    });
  });
  test("move right goes to next row", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 21);
      assertCursor(viewModel, new Position(1, 21));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Position(2, 1));
    });
  });
  test("move right selection", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 21);
      assertCursor(viewModel, new Position(1, 21));
      moveRight(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 21, 2, 1));
    });
  });
  test("move down", () => {
    runTest((editor, viewModel) => {
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(2, 1));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(3, 1));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(4, 1));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(5, 1));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(5, 2));
    });
  });
  test("move down with selection", () => {
    runTest((editor, viewModel) => {
      moveDown(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 1, 2, 1));
      moveDown(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 1, 3, 1));
      moveDown(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 1, 4, 1));
      moveDown(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 1, 5, 1));
      moveDown(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 1, 5, 2));
    });
  });
  test("move down with tabs", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 5);
      assertCursor(viewModel, new Position(1, 5));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(2, 2));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(3, 5));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(4, 1));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(5, 2));
    });
  });
  test("move up", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 5);
      assertCursor(viewModel, new Position(3, 5));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(2, 2));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(1, 5));
    });
  });
  test("move up with selection", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 5);
      assertCursor(viewModel, new Position(3, 5));
      moveUp(editor, viewModel, true);
      assertCursor(viewModel, new Selection(3, 5, 2, 2));
      moveUp(editor, viewModel, true);
      assertCursor(viewModel, new Selection(3, 5, 1, 5));
    });
  });
  test("move up and down with tabs", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 5);
      assertCursor(viewModel, new Position(1, 5));
      moveDown(editor, viewModel);
      moveDown(editor, viewModel);
      moveDown(editor, viewModel);
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(5, 2));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(4, 1));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(3, 5));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(2, 2));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(1, 5));
    });
  });
  test("move up and down with end of lines starting from a long one", () => {
    runTest((editor, viewModel) => {
      moveToEndOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, LINE1.length + 1));
      moveToEndOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, LINE1.length + 1));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(2, LINE2.length + 1));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(3, LINE3.length + 1));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(4, LINE4.length + 1));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(5, LINE5.length + 1));
      moveUp(editor, viewModel);
      moveUp(editor, viewModel);
      moveUp(editor, viewModel);
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(1, LINE1.length + 1));
    });
  });
  test("issue #44465: cursor position not correct when move", () => {
    runTest((editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 5, 1, 5)]);
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(1, 1));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(2, 2));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(1, 5));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(1, 1));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(1, 1));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(2, 1));
    });
  });
  test("issue #144041: Cursor up/down works", () => {
    const model = createTextModel(
      [
        "Word1 Word2 Word3 Word4",
        "Word5 Word6 Word7 Word8"
      ].join("\n")
    );
    withTestCodeEditor(model, { wrappingIndent: "indent", wordWrap: "wordWrapColumn", wordWrapColumn: 20 }, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 1, 1, 1)]);
      const cursorPositions = [];
      function reportCursorPosition() {
        cursorPositions.push(viewModel.getCursorStates()[0].viewState.position.toString());
      }
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorDown, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorDown, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorDown, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorDown, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorUp, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorUp, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorUp, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorUp, null);
      reportCursorPosition();
      assert.deepStrictEqual(cursorPositions, [
        "(1,1)",
        "(2,5)",
        "(3,1)",
        "(4,5)",
        "(4,10)",
        "(3,1)",
        "(2,5)",
        "(1,1)",
        "(1,1)"
      ]);
    });
    model.dispose();
  });
  test("issue #140195: Cursor up/down makes progress", () => {
    const model = createTextModel(
      [
        "Word1 Word2 Word3 Word4",
        "Word5 Word6 Word7 Word8"
      ].join("\n")
    );
    withTestCodeEditor(model, { wrappingIndent: "indent", wordWrap: "wordWrapColumn", wordWrapColumn: 20 }, (editor, viewModel) => {
      editor.changeDecorations((changeAccessor) => {
        changeAccessor.deltaDecorations([], [
          {
            range: new Range(1, 22, 1, 22),
            options: {
              showIfCollapsed: true,
              description: "test",
              after: {
                content: "some very very very very very very very very long text"
              }
            }
          }
        ]);
      });
      viewModel.setSelections("test", [new Selection(1, 1, 1, 1)]);
      const cursorPositions = [];
      function reportCursorPosition() {
        cursorPositions.push(viewModel.getCursorStates()[0].viewState.position.toString());
      }
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorDown, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorDown, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorDown, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorDown, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorUp, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorUp, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorUp, null);
      reportCursorPosition();
      editor.runCommand(CoreNavigationCommands.CursorUp, null);
      reportCursorPosition();
      assert.deepStrictEqual(cursorPositions, [
        "(1,1)",
        "(2,5)",
        "(5,19)",
        "(6,1)",
        "(7,5)",
        "(6,1)",
        "(2,8)",
        "(1,1)",
        "(1,1)"
      ]);
    });
    model.dispose();
  });
  test("move to beginning of line", () => {
    runTest((editor, viewModel) => {
      moveToBeginningOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, 6));
      moveToBeginningOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, 1));
    });
  });
  test("move to beginning of line from within line", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 8);
      moveToBeginningOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, 6));
      moveToBeginningOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, 1));
    });
  });
  test("move to beginning of line from whitespace at beginning of line", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 2);
      moveToBeginningOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, 6));
      moveToBeginningOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, 1));
    });
  });
  test("move to beginning of line from within line selection", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 8);
      moveToBeginningOfLine(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 8, 1, 6));
      moveToBeginningOfLine(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 8, 1, 1));
    });
  });
  test("move to beginning of line with selection multiline forward", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 8);
      moveTo(editor, viewModel, 3, 9, true);
      moveToBeginningOfLine(editor, viewModel, false);
      assertCursor(viewModel, new Selection(3, 5, 3, 5));
    });
  });
  test("move to beginning of line with selection multiline backward", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 9);
      moveTo(editor, viewModel, 1, 8, true);
      moveToBeginningOfLine(editor, viewModel, false);
      assertCursor(viewModel, new Selection(1, 6, 1, 6));
    });
  });
  test("move to beginning of line with selection single line forward", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 2);
      moveTo(editor, viewModel, 3, 9, true);
      moveToBeginningOfLine(editor, viewModel, false);
      assertCursor(viewModel, new Selection(3, 5, 3, 5));
    });
  });
  test("move to beginning of line with selection single line backward", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 9);
      moveTo(editor, viewModel, 3, 2, true);
      moveToBeginningOfLine(editor, viewModel, false);
      assertCursor(viewModel, new Selection(3, 5, 3, 5));
    });
  });
  test('issue #15401: "End" key is behaving weird when text is selected part 1', () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 8);
      moveTo(editor, viewModel, 3, 9, true);
      moveToBeginningOfLine(editor, viewModel, false);
      assertCursor(viewModel, new Selection(3, 5, 3, 5));
    });
  });
  test("issue #17011: Shift+home/end now go to the end of the selection start's line, not the selection's end", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 8);
      moveTo(editor, viewModel, 3, 9, true);
      moveToBeginningOfLine(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 8, 3, 5));
    });
  });
  test("move to end of line", () => {
    runTest((editor, viewModel) => {
      moveToEndOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, LINE1.length + 1));
      moveToEndOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, LINE1.length + 1));
    });
  });
  test("move to end of line from within line", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 6);
      moveToEndOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, LINE1.length + 1));
      moveToEndOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, LINE1.length + 1));
    });
  });
  test("move to end of line from whitespace at end of line", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 20);
      moveToEndOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, LINE1.length + 1));
      moveToEndOfLine(editor, viewModel);
      assertCursor(viewModel, new Position(1, LINE1.length + 1));
    });
  });
  test("move to end of line from within line selection", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 6);
      moveToEndOfLine(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 6, 1, LINE1.length + 1));
      moveToEndOfLine(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 6, 1, LINE1.length + 1));
    });
  });
  test("move to end of line with selection multiline forward", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 1);
      moveTo(editor, viewModel, 3, 9, true);
      moveToEndOfLine(editor, viewModel, false);
      assertCursor(viewModel, new Selection(3, 17, 3, 17));
    });
  });
  test("move to end of line with selection multiline backward", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 9);
      moveTo(editor, viewModel, 1, 1, true);
      moveToEndOfLine(editor, viewModel, false);
      assertCursor(viewModel, new Selection(1, 21, 1, 21));
    });
  });
  test("move to end of line with selection single line forward", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 1);
      moveTo(editor, viewModel, 3, 9, true);
      moveToEndOfLine(editor, viewModel, false);
      assertCursor(viewModel, new Selection(3, 17, 3, 17));
    });
  });
  test("move to end of line with selection single line backward", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 9);
      moveTo(editor, viewModel, 3, 1, true);
      moveToEndOfLine(editor, viewModel, false);
      assertCursor(viewModel, new Selection(3, 17, 3, 17));
    });
  });
  test('issue #15401: "End" key is behaving weird when text is selected part 2', () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 1);
      moveTo(editor, viewModel, 3, 9, true);
      moveToEndOfLine(editor, viewModel, false);
      assertCursor(viewModel, new Selection(3, 17, 3, 17));
    });
  });
  test("move to beginning of buffer", () => {
    runTest((editor, viewModel) => {
      moveToBeginningOfBuffer(editor, viewModel);
      assertCursor(viewModel, new Position(1, 1));
    });
  });
  test("move to beginning of buffer from within first line", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 3);
      moveToBeginningOfBuffer(editor, viewModel);
      assertCursor(viewModel, new Position(1, 1));
    });
  });
  test("move to beginning of buffer from within another line", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 3);
      moveToBeginningOfBuffer(editor, viewModel);
      assertCursor(viewModel, new Position(1, 1));
    });
  });
  test("move to beginning of buffer from within first line selection", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 1, 3);
      moveToBeginningOfBuffer(editor, viewModel, true);
      assertCursor(viewModel, new Selection(1, 3, 1, 1));
    });
  });
  test("move to beginning of buffer from within another line selection", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 3);
      moveToBeginningOfBuffer(editor, viewModel, true);
      assertCursor(viewModel, new Selection(3, 3, 1, 1));
    });
  });
  test("move to end of buffer", () => {
    runTest((editor, viewModel) => {
      moveToEndOfBuffer(editor, viewModel);
      assertCursor(viewModel, new Position(5, LINE5.length + 1));
    });
  });
  test("move to end of buffer from within last line", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 5, 1);
      moveToEndOfBuffer(editor, viewModel);
      assertCursor(viewModel, new Position(5, LINE5.length + 1));
    });
  });
  test("move to end of buffer from within another line", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 3);
      moveToEndOfBuffer(editor, viewModel);
      assertCursor(viewModel, new Position(5, LINE5.length + 1));
    });
  });
  test("move to end of buffer from within last line selection", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 5, 1);
      moveToEndOfBuffer(editor, viewModel, true);
      assertCursor(viewModel, new Selection(5, 1, 5, LINE5.length + 1));
    });
  });
  test("move to end of buffer from within another line selection", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 3, 3);
      moveToEndOfBuffer(editor, viewModel, true);
      assertCursor(viewModel, new Selection(3, 3, 5, LINE5.length + 1));
    });
  });
  test("select all", () => {
    runTest((editor, viewModel) => {
      CoreNavigationCommands.SelectAll.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, new Selection(1, 1, 5, LINE5.length + 1));
    });
  });
  test("no move doesn't trigger event", () => {
    runTest((editor, viewModel) => {
      const disposable = viewModel.onEvent((e) => {
        assert.ok(false, "was not expecting event");
      });
      moveTo(editor, viewModel, 1, 1);
      disposable.dispose();
    });
  });
  test("move eventing", () => {
    runTest((editor, viewModel) => {
      let events = 0;
      const disposable = viewModel.onEvent((e) => {
        if (e.kind === OutgoingViewModelEventKind.CursorStateChanged) {
          events++;
          assert.deepStrictEqual(e.selections, [new Selection(1, 2, 1, 2)]);
        }
      });
      moveTo(editor, viewModel, 1, 2);
      assert.strictEqual(events, 1, "receives 1 event");
      disposable.dispose();
    });
  });
  test("move in selection mode eventing", () => {
    runTest((editor, viewModel) => {
      let events = 0;
      const disposable = viewModel.onEvent((e) => {
        if (e.kind === OutgoingViewModelEventKind.CursorStateChanged) {
          events++;
          assert.deepStrictEqual(e.selections, [new Selection(1, 1, 1, 2)]);
        }
      });
      moveTo(editor, viewModel, 1, 2, true);
      assert.strictEqual(events, 1, "receives 1 event");
      disposable.dispose();
    });
  });
  test("saveState & restoreState", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 2, 1, true);
      assertCursor(viewModel, new Selection(1, 1, 2, 1));
      const savedState = JSON.stringify(viewModel.saveCursorState());
      moveTo(editor, viewModel, 1, 1, false);
      assertCursor(viewModel, new Position(1, 1));
      viewModel.restoreCursorState(JSON.parse(savedState));
      assertCursor(viewModel, new Selection(1, 1, 2, 1));
    });
  });
  test("Independent model edit 1", () => {
    runTest((editor, viewModel) => {
      moveTo(editor, viewModel, 2, 16, true);
      editor.getModel().applyEdits([EditOperation.delete(new Range(2, 1, 2, 2))]);
      assertCursor(viewModel, new Selection(1, 1, 2, 15));
    });
  });
  test("column select 1", () => {
    withTestCodeEditor([
      "	private compute(a:number): boolean {",
      "		if (a + 3 === 0 || a + 5 === 0) {",
      "			return false;",
      "		}",
      "	}"
    ], {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, 7, false);
      assertCursor(viewModel, new Position(1, 7));
      CoreNavigationCommands.ColumnSelect.runCoreEditorCommand(viewModel, {
        position: new Position(4, 4),
        viewPosition: new Position(4, 4),
        mouseColumn: 15,
        doColumnSelect: true
      });
      const expectedSelections = [
        new Selection(1, 7, 1, 12),
        new Selection(2, 4, 2, 9),
        new Selection(3, 3, 3, 6),
        new Selection(4, 4, 4, 4)
      ];
      assertCursor(viewModel, expectedSelections);
    });
  });
  test("grapheme breaking", () => {
    withTestCodeEditor([
      "abcabc",
      "a\u0303a\u0303a\u0303a\u0303a\u0303a\u0303",
      "\u8FBB\u{E0100}\u8FBB\u{E0100}\u8FBB\u{E0100}",
      "\u0BAA\u0BC1"
    ], {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(2, 1, 2, 1)]);
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Position(2, 3));
      moveLeft(editor, viewModel);
      assertCursor(viewModel, new Position(2, 1));
      viewModel.setSelections("test", [new Selection(3, 1, 3, 1)]);
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Position(3, 4));
      moveLeft(editor, viewModel);
      assertCursor(viewModel, new Position(3, 1));
      viewModel.setSelections("test", [new Selection(4, 1, 4, 1)]);
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Position(4, 3));
      moveLeft(editor, viewModel);
      assertCursor(viewModel, new Position(4, 1));
      viewModel.setSelections("test", [new Selection(1, 3, 1, 3)]);
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(2, 5));
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Position(3, 4));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(2, 5));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Position(1, 3));
    });
  });
  test("issue #4905 - column select is biased to the right", () => {
    withTestCodeEditor([
      'var gulp = require("gulp");',
      'var path = require("path");',
      'var rimraf = require("rimraf");',
      'var isarray = require("isarray");',
      'var merge = require("merge-stream");',
      'var concat = require("gulp-concat");',
      'var newer = require("gulp-newer");'
    ].join("\n"), {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, 4, false);
      assertCursor(viewModel, new Position(1, 4));
      CoreNavigationCommands.ColumnSelect.runCoreEditorCommand(viewModel, {
        position: new Position(4, 1),
        viewPosition: new Position(4, 1),
        mouseColumn: 1,
        doColumnSelect: true
      });
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 1),
        new Selection(2, 4, 2, 1),
        new Selection(3, 4, 3, 1),
        new Selection(4, 4, 4, 1)
      ]);
    });
  });
  test("issue #20087: column select with mouse", () => {
    withTestCodeEditor([
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" Key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SoMEKEy" value="000"/>',
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SomeKey" valuE="000"/>',
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SomeKey" value="00X"/>'
    ].join("\n"), {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 10, 10, false);
      assertCursor(viewModel, new Position(10, 10));
      CoreNavigationCommands.ColumnSelect.runCoreEditorCommand(viewModel, {
        position: new Position(1, 1),
        viewPosition: new Position(1, 1),
        mouseColumn: 1,
        doColumnSelect: true
      });
      assertCursor(viewModel, [
        new Selection(10, 10, 10, 1),
        new Selection(9, 10, 9, 1),
        new Selection(8, 10, 8, 1),
        new Selection(7, 10, 7, 1),
        new Selection(6, 10, 6, 1),
        new Selection(5, 10, 5, 1),
        new Selection(4, 10, 4, 1),
        new Selection(3, 10, 3, 1),
        new Selection(2, 10, 2, 1),
        new Selection(1, 10, 1, 1)
      ]);
      CoreNavigationCommands.ColumnSelect.runCoreEditorCommand(viewModel, {
        position: new Position(1, 1),
        viewPosition: new Position(1, 1),
        mouseColumn: 1,
        doColumnSelect: true
      });
      assertCursor(viewModel, [
        new Selection(10, 10, 10, 1),
        new Selection(9, 10, 9, 1),
        new Selection(8, 10, 8, 1),
        new Selection(7, 10, 7, 1),
        new Selection(6, 10, 6, 1),
        new Selection(5, 10, 5, 1),
        new Selection(4, 10, 4, 1),
        new Selection(3, 10, 3, 1),
        new Selection(2, 10, 2, 1),
        new Selection(1, 10, 1, 1)
      ]);
    });
  });
  test("issue #20087: column select with keyboard", () => {
    withTestCodeEditor([
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" Key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SoMEKEy" value="000"/>',
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SomeKey" valuE="000"/>',
      '<property id="SomeThing" key="SomeKey" value="000"/>',
      '<property id="SomeThing" key="SomeKey" value="00X"/>'
    ].join("\n"), {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 10, 10, false);
      assertCursor(viewModel, new Position(10, 10));
      CoreNavigationCommands.CursorColumnSelectLeft.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(10, 10, 10, 9)
      ]);
      CoreNavigationCommands.CursorColumnSelectLeft.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(10, 10, 10, 8)
      ]);
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(10, 10, 10, 9)
      ]);
      CoreNavigationCommands.CursorColumnSelectUp.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(10, 10, 10, 9),
        new Selection(9, 10, 9, 9)
      ]);
      CoreNavigationCommands.CursorColumnSelectDown.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(10, 10, 10, 9)
      ]);
    });
  });
  test("issue #118062: Column selection cannot select first position of a line", () => {
    withTestCodeEditor([
      "hello world"
    ].join("\n"), {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, 2, false);
      assertCursor(viewModel, new Position(1, 2));
      CoreNavigationCommands.CursorColumnSelectLeft.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 2, 1, 1)
      ]);
    });
  });
  test("column select with keyboard", () => {
    withTestCodeEditor([
      'var gulp = require("gulp");',
      'var path = require("path");',
      'var rimraf = require("rimraf");',
      'var isarray = require("isarray");',
      'var merge = require("merge-stream");',
      'var concat = require("gulp-concat");',
      'var newer = require("gulp-newer");'
    ].join("\n"), {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, 4, false);
      assertCursor(viewModel, new Position(1, 4));
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 5)
      ]);
      CoreNavigationCommands.CursorColumnSelectDown.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 5),
        new Selection(2, 4, 2, 5)
      ]);
      CoreNavigationCommands.CursorColumnSelectDown.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 5),
        new Selection(2, 4, 2, 5),
        new Selection(3, 4, 3, 5)
      ]);
      CoreNavigationCommands.CursorColumnSelectDown.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectDown.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectDown.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectDown.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 5),
        new Selection(2, 4, 2, 5),
        new Selection(3, 4, 3, 5),
        new Selection(4, 4, 4, 5),
        new Selection(5, 4, 5, 5),
        new Selection(6, 4, 6, 5),
        new Selection(7, 4, 7, 5)
      ]);
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 6),
        new Selection(2, 4, 2, 6),
        new Selection(3, 4, 3, 6),
        new Selection(4, 4, 4, 6),
        new Selection(5, 4, 5, 6),
        new Selection(6, 4, 6, 6),
        new Selection(7, 4, 7, 6)
      ]);
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 16),
        new Selection(2, 4, 2, 16),
        new Selection(3, 4, 3, 16),
        new Selection(4, 4, 4, 16),
        new Selection(5, 4, 5, 16),
        new Selection(6, 4, 6, 16),
        new Selection(7, 4, 7, 16)
      ]);
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 26),
        new Selection(2, 4, 2, 26),
        new Selection(3, 4, 3, 26),
        new Selection(4, 4, 4, 26),
        new Selection(5, 4, 5, 26),
        new Selection(6, 4, 6, 26),
        new Selection(7, 4, 7, 26)
      ]);
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 28),
        new Selection(2, 4, 2, 28),
        new Selection(3, 4, 3, 28),
        new Selection(4, 4, 4, 28),
        new Selection(5, 4, 5, 28),
        new Selection(6, 4, 6, 28),
        new Selection(7, 4, 7, 28)
      ]);
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 28),
        new Selection(2, 4, 2, 28),
        new Selection(3, 4, 3, 32),
        new Selection(4, 4, 4, 32),
        new Selection(5, 4, 5, 32),
        new Selection(6, 4, 6, 32),
        new Selection(7, 4, 7, 32)
      ]);
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 28),
        new Selection(2, 4, 2, 28),
        new Selection(3, 4, 3, 32),
        new Selection(4, 4, 4, 34),
        new Selection(5, 4, 5, 34),
        new Selection(6, 4, 6, 34),
        new Selection(7, 4, 7, 34)
      ]);
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 28),
        new Selection(2, 4, 2, 28),
        new Selection(3, 4, 3, 32),
        new Selection(4, 4, 4, 34),
        new Selection(5, 4, 5, 35),
        new Selection(6, 4, 6, 35),
        new Selection(7, 4, 7, 35)
      ]);
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 28),
        new Selection(2, 4, 2, 28),
        new Selection(3, 4, 3, 32),
        new Selection(4, 4, 4, 34),
        new Selection(5, 4, 5, 37),
        new Selection(6, 4, 6, 37),
        new Selection(7, 4, 7, 35)
      ]);
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 28),
        new Selection(2, 4, 2, 28),
        new Selection(3, 4, 3, 32),
        new Selection(4, 4, 4, 34),
        new Selection(5, 4, 5, 37),
        new Selection(6, 4, 6, 37),
        new Selection(7, 4, 7, 35)
      ]);
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      CoreNavigationCommands.CursorColumnSelectRight.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 28),
        new Selection(2, 4, 2, 28),
        new Selection(3, 4, 3, 32),
        new Selection(4, 4, 4, 34),
        new Selection(5, 4, 5, 37),
        new Selection(6, 4, 6, 37),
        new Selection(7, 4, 7, 35)
      ]);
      CoreNavigationCommands.CursorColumnSelectLeft.runCoreEditorCommand(viewModel, {});
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 28),
        new Selection(2, 4, 2, 28),
        new Selection(3, 4, 3, 32),
        new Selection(4, 4, 4, 34),
        new Selection(5, 4, 5, 36),
        new Selection(6, 4, 6, 36),
        new Selection(7, 4, 7, 35)
      ]);
    });
  });
  test("setSelection / setPosition with source", () => {
    const tokenizationSupport = {
      getInitialState: () => NullState,
      tokenize: void 0,
      tokenizeEncoded: (line, hasEOL, state) => {
        return new EncodedTokenizationResult(new Uint32Array(0), [], state);
      }
    };
    const LANGUAGE_ID = "modelModeTest1";
    const languageRegistration = TokenizationRegistry.register(LANGUAGE_ID, tokenizationSupport);
    const model = createTextModel("Just text", LANGUAGE_ID);
    withTestCodeEditor(model, {}, (editor1, cursor1) => {
      let event = void 0;
      const disposable = editor1.onDidChangeCursorPosition((e) => {
        event = e;
      });
      editor1.setSelection(new Range(1, 2, 1, 3), "navigation");
      assert.strictEqual(event.source, "navigation");
      event = void 0;
      editor1.setPosition(new Position(1, 2), "navigation");
      assert.strictEqual(event.source, "navigation");
      disposable.dispose();
    });
    languageRegistration.dispose();
    model.dispose();
  });
});
suite("Editor Controller", () => {
  const surroundingLanguageId = "surroundingLanguage";
  const indentRulesLanguageId = "indentRulesLanguage";
  const electricCharLanguageId = "electricCharLanguage";
  const autoClosingLanguageId = "autoClosingLanguage";
  const emptyClosingSurroundLanguageId = "emptyClosingSurroundLanguage";
  let disposables;
  let instantiationService;
  let languageConfigurationService;
  let languageService;
  setup(() => {
    disposables = new DisposableStore();
    instantiationService = createCodeEditorServices(disposables);
    languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
    languageService = instantiationService.get(ILanguageService);
    disposables.add(languageService.registerLanguage({ id: surroundingLanguageId }));
    disposables.add(languageConfigurationService.register(surroundingLanguageId, {
      autoClosingPairs: [{ open: "(", close: ")" }]
    }));
    disposables.add(languageService.registerLanguage({ id: emptyClosingSurroundLanguageId }));
    disposables.add(languageConfigurationService.register(emptyClosingSurroundLanguageId, {
      surroundingPairs: [{ open: "<", close: "" }]
    }));
    setupIndentRulesLanguage(indentRulesLanguageId, {
      decreaseIndentPattern: /^\s*((?!\S.*\/[*]).*[*]\/\s*)?[})\]]|^\s*(case\b.*|default):\s*(\/\/.*|\/[*].*[*]\/\s*)?$/,
      increaseIndentPattern: /^((?!\/\/).)*(\{[^}"'`]*|\([^)"']*|\[[^\]"']*|^\s*(\{\}|\(\)|\[\]|(case\b.*|default):))\s*(\/\/.*|\/[*].*[*]\/\s*)?$/,
      indentNextLinePattern: /^\s*(for|while|if|else)\b(?!.*[;{}]\s*(\/\/.*|\/[*].*[*]\/\s*)?$)/,
      unIndentedLinePattern: /^(?!.*([;{}]|\S:)\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!.*(\{[^}"']*|\([^)"']*|\[[^\]"']*|^\s*(\{\}|\(\)|\[\]|(case\b.*|default):))\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!^\s*((?!\S.*\/[*]).*[*]\/\s*)?[})\]]|^\s*(case\b.*|default):\s*(\/\/.*|\/[*].*[*]\/\s*)?$)(?!^\s*(for|while|if|else)\b(?!.*[;{}]\s*(\/\/.*|\/[*].*[*]\/\s*)?$))/
    });
    disposables.add(languageService.registerLanguage({ id: electricCharLanguageId }));
    disposables.add(languageConfigurationService.register(electricCharLanguageId, {
      __electricCharacterSupport: {
        docComment: { open: "/**", close: " */" }
      },
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
      ]
    }));
    setupAutoClosingLanguage();
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function setupOnEnterLanguage(indentAction) {
    const onEnterLanguageId = "onEnterMode";
    disposables.add(languageService.registerLanguage({ id: onEnterLanguageId }));
    disposables.add(languageConfigurationService.register(onEnterLanguageId, {
      onEnterRules: [{
        beforeText: /.*/,
        action: {
          indentAction
        }
      }]
    }));
    return onEnterLanguageId;
  }
  function setupIndentRulesLanguage(languageId, indentationRules) {
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      indentationRules
    }));
    return languageId;
  }
  function setupAutoClosingLanguage() {
    disposables.add(languageService.registerLanguage({ id: autoClosingLanguageId }));
    disposables.add(languageConfigurationService.register(autoClosingLanguageId, {
      comments: {
        blockComment: ["/*", "*/"]
      },
      autoClosingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: "'", close: "'", notIn: ["string", "comment"] },
        { open: '"', close: '"', notIn: ["string"] },
        { open: "`", close: "`", notIn: ["string", "comment"] },
        { open: "/**", close: " */", notIn: ["string"] },
        { open: "begin", close: "end", notIn: ["string"] }
      ],
      __electricCharacterSupport: {
        docComment: { open: "/**", close: " */" }
      }
    }));
  }
  function setupAutoClosingLanguageTokenization() {
    class BaseState {
      constructor(parent = null) {
        this.parent = parent;
      }
      clone() {
        return this;
      }
      equals(other) {
        if (!(other instanceof BaseState)) {
          return false;
        }
        if (!this.parent && !other.parent) {
          return true;
        }
        if (!this.parent || !other.parent) {
          return false;
        }
        return this.parent.equals(other.parent);
      }
    }
    class StringState {
      constructor(char, parentState) {
        this.char = char;
        this.parentState = parentState;
      }
      clone() {
        return this;
      }
      equals(other) {
        return other instanceof StringState && this.char === other.char && this.parentState.equals(other.parentState);
      }
    }
    class BlockCommentState {
      constructor(parentState) {
        this.parentState = parentState;
      }
      clone() {
        return this;
      }
      equals(other) {
        return other instanceof StringState && this.parentState.equals(other.parentState);
      }
    }
    const encodedLanguageId = languageService.languageIdCodec.encodeLanguageId(autoClosingLanguageId);
    disposables.add(TokenizationRegistry.register(autoClosingLanguageId, {
      getInitialState: () => new BaseState(),
      tokenize: void 0,
      tokenizeEncoded: function(line, hasEOL, _state) {
        let state = _state;
        const tokens = [];
        const generateToken = (length, type, newState) => {
          if (tokens.length > 0 && tokens[tokens.length - 1].type === type) {
            tokens[tokens.length - 1].length += length;
          } else {
            tokens.push({ length, type });
          }
          line = line.substring(length);
          if (newState) {
            state = newState;
          }
        };
        while (line.length > 0) {
          advance();
        }
        const result = new Uint32Array(tokens.length * 2);
        let startIndex = 0;
        for (let i = 0; i < tokens.length; i++) {
          result[2 * i] = startIndex;
          result[2 * i + 1] = encodedLanguageId << MetadataConsts.LANGUAGEID_OFFSET | tokens[i].type << MetadataConsts.TOKEN_TYPE_OFFSET;
          startIndex += tokens[i].length;
        }
        return new EncodedTokenizationResult(result, [], state);
        function advance() {
          if (state instanceof BaseState) {
            const m1 = line.match(/^[^'"`{}/]+/g);
            if (m1) {
              return generateToken(m1[0].length, StandardTokenType.Other);
            }
            if (/^['"`]/.test(line)) {
              return generateToken(1, StandardTokenType.String, new StringState(line.charAt(0), state));
            }
            if (/^{/.test(line)) {
              return generateToken(1, StandardTokenType.Other, new BaseState(state));
            }
            if (/^}/.test(line)) {
              return generateToken(1, StandardTokenType.Other, state.parent || new BaseState());
            }
            if (/^\/\//.test(line)) {
              return generateToken(line.length, StandardTokenType.Comment, state);
            }
            if (/^\/\*/.test(line)) {
              return generateToken(2, StandardTokenType.Comment, new BlockCommentState(state));
            }
            return generateToken(1, StandardTokenType.Other, state);
          } else if (state instanceof StringState) {
            const m1 = line.match(/^[^\\'"`\$]+/g);
            if (m1) {
              return generateToken(m1[0].length, StandardTokenType.String);
            }
            if (/^\\/.test(line)) {
              return generateToken(2, StandardTokenType.String);
            }
            if (line.charAt(0) === state.char) {
              return generateToken(1, StandardTokenType.String, state.parentState);
            }
            if (/^\$\{/.test(line)) {
              return generateToken(2, StandardTokenType.Other, new BaseState(state));
            }
            return generateToken(1, StandardTokenType.Other, state);
          } else if (state instanceof BlockCommentState) {
            const m1 = line.match(/^[^*]+/g);
            if (m1) {
              return generateToken(m1[0].length, StandardTokenType.String);
            }
            if (/^\*\//.test(line)) {
              return generateToken(2, StandardTokenType.Comment, state.parentState);
            }
            return generateToken(1, StandardTokenType.Other, state);
          } else {
            throw new Error(`unknown state`);
          }
        }
      }
    }));
  }
  function setAutoClosingLanguageEnabledSet(chars) {
    disposables.add(languageConfigurationService.register(autoClosingLanguageId, {
      autoCloseBefore: chars,
      autoClosingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: "'", close: "'", notIn: ["string", "comment"] },
        { open: '"', close: '"', notIn: ["string"] },
        { open: "`", close: "`", notIn: ["string", "comment"] },
        { open: "/**", close: " */", notIn: ["string"] }
      ]
    }));
  }
  function createTextModel2(text, languageId = null, options = TextModel.DEFAULT_CREATION_OPTIONS, uri = null) {
    return disposables.add(instantiateTextModel(instantiationService, text, languageId, options, uri));
  }
  function withTestCodeEditor2(text, options, callback) {
    let model;
    if (typeof text === "string") {
      model = createTextModel2(text);
    } else if (Array.isArray(text)) {
      model = createTextModel2(text.join("\n"));
    } else {
      model = text;
    }
    const editor = disposables.add(instantiateTestCodeEditor(instantiationService, model, options));
    const viewModel = editor.getViewModel();
    viewModel.setHasFocus(true);
    callback(editor, viewModel);
  }
  function usingCursor(opts, callback) {
    const model = createTextModel2(opts.text.join("\n"), opts.languageId, opts.modelOpts);
    const editorOptions = opts.editorOpts || {};
    withTestCodeEditor2(model, editorOptions, (editor, viewModel) => {
      callback(editor, model, viewModel);
    });
  }
  let AutoClosingColumnType;
  ((AutoClosingColumnType2) => {
    AutoClosingColumnType2[AutoClosingColumnType2["Normal"] = 0] = "Normal";
    AutoClosingColumnType2[AutoClosingColumnType2["Special1"] = 1] = "Special1";
    AutoClosingColumnType2[AutoClosingColumnType2["Special2"] = 2] = "Special2";
  })(AutoClosingColumnType || (AutoClosingColumnType = {}));
  function extractAutoClosingSpecialColumns(maxColumn, annotatedLine) {
    const result = [];
    for (let j = 1; j <= maxColumn; j++) {
      result[j] = 0 /* Normal */;
    }
    let column = 1;
    for (let j = 0; j < annotatedLine.length; j++) {
      if (annotatedLine.charAt(j) === "|") {
        result[column] = 1 /* Special1 */;
      } else if (annotatedLine.charAt(j) === "!") {
        result[column] = 2 /* Special2 */;
      } else {
        column++;
      }
    }
    return result;
  }
  function assertType(editor, model, viewModel, lineNumber, column, chr, expectedInsert, message) {
    const lineContent = model.getLineContent(lineNumber);
    const expected = lineContent.substr(0, column - 1) + expectedInsert + lineContent.substr(column - 1);
    moveTo(editor, viewModel, lineNumber, column);
    viewModel.type(chr, "keyboard");
    assert.deepStrictEqual(model.getLineContent(lineNumber), expected, message);
    model.undo();
  }
  test("issue microsoft/monaco-editor#443: Indentation of a single row deletes selected text in some cases", () => {
    const model = createTextModel2(
      [
        "Hello world!",
        "another line"
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 1, 1, 13)]);
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 1, 1, 14));
    });
  });
  test("Bug 9121: Auto indent + undo + redo is funky", () => {
    const model = createTextModel2(
      [
        ""
      ].join("\n"),
      void 0,
      {
        insertSpaces: false,
        trimAutoWhitespace: false
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n", "assert1");
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	", "assert2");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	\n	", "assert3");
      viewModel.type("x");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	\n	x", "assert4");
      CoreNavigationCommands.CursorLeft.runCoreEditorCommand(viewModel, {});
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	\n	x", "assert5");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	\nx", "assert6");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	x", "assert7");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\nx", "assert8");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "x", "assert9");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\nx", "assert10");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	\nx", "assert11");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	\n	x", "assert12");
      editor.runCommand(CoreEditingCommands.Redo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	\nx", "assert13");
      editor.runCommand(CoreEditingCommands.Redo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\nx", "assert14");
      editor.runCommand(CoreEditingCommands.Redo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "x", "assert15");
    });
  });
  test("issue #23539: Setting model EOL isn't undoable", () => {
    withTestCodeEditor2([
      "Hello",
      "world"
    ], {}, (editor, viewModel) => {
      const model = editor.getModel();
      assertCursor(viewModel, new Position(1, 1));
      model.setEOL(EndOfLineSequence.LF);
      assert.strictEqual(model.getValue(), "Hello\nworld");
      model.pushEOL(EndOfLineSequence.CRLF);
      assert.strictEqual(model.getValue(), "Hello\r\nworld");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(), "Hello\nworld");
    });
  });
  test("issue #47733: Undo mangles unicode characters", () => {
    const languageId = "myMode";
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      surroundingPairs: [{ open: "%", close: "%" }]
    }));
    const model = createTextModel2("'\u{1F441}'", languageId);
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      editor.setSelection(new Selection(1, 1, 1, 2));
      viewModel.type("%", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "%'%\u{1F441}'", "assert1");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "'\u{1F441}'", "assert2");
    });
  });
  test("issue #46208: Allow empty selections in the undo/redo stack", () => {
    const model = createTextModel2("");
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      viewModel.type("Hello", "keyboard");
      viewModel.type(" ", "keyboard");
      viewModel.type("world", "keyboard");
      viewModel.type(" ", "keyboard");
      assert.strictEqual(model.getLineContent(1), "Hello world ");
      assertCursor(viewModel, new Position(1, 13));
      moveLeft(editor, viewModel);
      moveRight(editor, viewModel);
      model.pushEditOperations([], [EditOperation.replaceMove(new Range(1, 12, 1, 13), "")], () => []);
      assert.strictEqual(model.getLineContent(1), "Hello world");
      assertCursor(viewModel, new Position(1, 12));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "Hello world ");
      assertCursor(viewModel, new Selection(1, 13, 1, 13));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "Hello world");
      assertCursor(viewModel, new Position(1, 12));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "Hello");
      assertCursor(viewModel, new Position(1, 6));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "");
      assertCursor(viewModel, new Position(1, 1));
      editor.runCommand(CoreEditingCommands.Redo, null);
      assert.strictEqual(model.getLineContent(1), "Hello");
      assertCursor(viewModel, new Position(1, 6));
      editor.runCommand(CoreEditingCommands.Redo, null);
      assert.strictEqual(model.getLineContent(1), "Hello world");
      assertCursor(viewModel, new Position(1, 12));
      editor.runCommand(CoreEditingCommands.Redo, null);
      assert.strictEqual(model.getLineContent(1), "Hello world ");
      assertCursor(viewModel, new Position(1, 13));
      editor.runCommand(CoreEditingCommands.Redo, null);
      assert.strictEqual(model.getLineContent(1), "Hello world");
      assertCursor(viewModel, new Position(1, 12));
      editor.runCommand(CoreEditingCommands.Redo, null);
      assert.strictEqual(model.getLineContent(1), "Hello world");
      assertCursor(viewModel, new Position(1, 12));
    });
  });
  test("bug #16815:Shift+Tab doesn't go back to tabstop", () => {
    const languageId = setupOnEnterLanguage(IndentAction.IndentOutdent);
    const model = createTextModel2(
      [
        "     function baz() {"
      ].join("\n"),
      languageId
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, 6, false);
      assertCursor(viewModel, new Selection(1, 6, 1, 6));
      editor.runCommand(CoreEditingCommands.Outdent, null);
      assert.strictEqual(model.getLineContent(1), "    function baz() {");
      assertCursor(viewModel, new Selection(1, 5, 1, 5));
    });
  });
  test("Bug #18293:[regression][editor] Can't outdent whitespace line", () => {
    const model = createTextModel2(
      [
        "      "
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, 7, false);
      assertCursor(viewModel, new Selection(1, 7, 1, 7));
      editor.runCommand(CoreEditingCommands.Outdent, null);
      assert.strictEqual(model.getLineContent(1), "    ");
      assertCursor(viewModel, new Selection(1, 5, 1, 5));
    });
  });
  test("issue #95591: Unindenting moves cursor to beginning of line", () => {
    const model = createTextModel2(
      [
        "        "
      ].join("\n")
    );
    withTestCodeEditor2(model, { useTabStops: false }, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, 9, false);
      assertCursor(viewModel, new Selection(1, 9, 1, 9));
      editor.runCommand(CoreEditingCommands.Outdent, null);
      assert.strictEqual(model.getLineContent(1), "    ");
      assertCursor(viewModel, new Selection(1, 5, 1, 5));
    });
  });
  test("Bug #16657: [editor] Tab on empty line of zero indentation moves cursor to position (1,1)", () => {
    const model = createTextModel2(
      [
        "function baz() {",
        "	function hello() { // something here",
        "	",
        "",
        "	}",
        "}",
        ""
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 7, 1, false);
      assertCursor(viewModel, new Selection(7, 1, 7, 1));
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(7), "	");
      assertCursor(viewModel, new Selection(7, 2, 7, 2));
    });
  });
  test("bug #16740: [editor] Cut line doesn't quite cut the last line", () => {
    withTestCodeEditor2([
      "asdasd",
      "qwerty"
    ], {}, (editor, viewModel) => {
      const model = editor.getModel();
      moveTo(editor, viewModel, 2, 1, false);
      assertCursor(viewModel, new Selection(2, 1, 2, 1));
      viewModel.cut("keyboard");
      assert.strictEqual(model.getLineCount(), 1);
      assert.strictEqual(model.getLineContent(1), "asdasd");
    });
    withTestCodeEditor2([
      "asdasd",
      ""
    ], {}, (editor, viewModel) => {
      const model = editor.getModel();
      moveTo(editor, viewModel, 2, 1, false);
      assertCursor(viewModel, new Selection(2, 1, 2, 1));
      viewModel.cut("keyboard");
      assert.strictEqual(model.getLineCount(), 1);
      assert.strictEqual(model.getLineContent(1), "asdasd");
      viewModel.cut("keyboard");
      assert.strictEqual(model.getLineCount(), 1);
      assert.strictEqual(model.getLineContent(1), "");
    });
  });
  test("issue #128602: When cutting multiple lines (ctrl x), the last line will not be erased", () => {
    withTestCodeEditor2([
      "a1",
      "a2",
      "a3"
    ], {}, (editor, viewModel) => {
      const model = editor.getModel();
      viewModel.setSelections("test", [
        new Selection(1, 1, 1, 1),
        new Selection(2, 1, 2, 1),
        new Selection(3, 1, 3, 1)
      ]);
      viewModel.cut("keyboard");
      assert.strictEqual(model.getLineCount(), 1);
      assert.strictEqual(model.getLineContent(1), "");
    });
  });
  test("Bug #11476: Double bracket surrounding + undo is broken", () => {
    usingCursor({
      text: [
        "hello"
      ],
      languageId: surroundingLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 3, false);
      moveTo(editor, viewModel, 1, 5, true);
      assertCursor(viewModel, new Selection(1, 3, 1, 5));
      viewModel.type("(", "keyboard");
      assertCursor(viewModel, new Selection(1, 4, 1, 6));
      viewModel.type("(", "keyboard");
      assertCursor(viewModel, new Selection(1, 5, 1, 7));
    });
  });
  test("issue #206774: SurroundSelectionCommand with empty charAfterSelection should not throw", () => {
    usingCursor({
      text: [
        "hello world"
      ],
      languageId: emptyClosingSurroundLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 1, false);
      moveTo(editor, viewModel, 1, 6, true);
      assertCursor(viewModel, new Selection(1, 1, 1, 6));
      viewModel.type("<", "keyboard");
      assert.strictEqual(model.getValue(), "<hello world");
    });
  });
  test("issue #1140: Backspace stops prematurely", () => {
    const model = createTextModel2(
      [
        "function baz() {",
        "  return 1;",
        "};"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 3, 2, false);
      moveTo(editor, viewModel, 1, 14, true);
      assertCursor(viewModel, new Selection(3, 2, 1, 14));
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assertCursor(viewModel, new Selection(1, 14, 1, 14));
      assert.strictEqual(model.getLineCount(), 1);
      assert.strictEqual(model.getLineContent(1), "function baz(;");
    });
  });
  test("issue #10212: Pasting entire line does not replace selection", () => {
    usingCursor({
      text: [
        "line1",
        "line2"
      ]
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 1, false);
      moveTo(editor, viewModel, 2, 6, true);
      viewModel.paste("line1\n", true);
      assert.strictEqual(model.getLineContent(1), "line1");
      assert.strictEqual(model.getLineContent(2), "line1");
      assert.strictEqual(model.getLineContent(3), "");
    });
  });
  test("issue #74722: Pasting whole line does not replace selection", () => {
    usingCursor({
      text: [
        "line1",
        "line sel 2",
        "line3"
      ]
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(2, 6, 2, 9)]);
      viewModel.paste("line1\n", true);
      assert.strictEqual(model.getLineContent(1), "line1");
      assert.strictEqual(model.getLineContent(2), "line line1");
      assert.strictEqual(model.getLineContent(3), " 2");
      assert.strictEqual(model.getLineContent(4), "line3");
    });
  });
  test("issue #4996: Multiple cursor paste pastes contents of all cursors", () => {
    usingCursor({
      text: [
        "line1",
        "line2",
        "line3"
      ]
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 1, 1, 1), new Selection(2, 1, 2, 1)]);
      viewModel.paste(
        "a\nb\nc\nd",
        false,
        [
          "a\nb",
          "c\nd"
        ]
      );
      assert.strictEqual(model.getValue(), [
        "a",
        "bline1",
        "c",
        "dline2",
        "line3"
      ].join("\n"));
    });
  });
  test("issue #16155: Paste into multiple cursors has edge case when number of lines equals number of cursors - 1", () => {
    usingCursor({
      text: [
        "test",
        "test",
        "test",
        "test"
      ]
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(1, 1, 1, 5),
        new Selection(2, 1, 2, 5),
        new Selection(3, 1, 3, 5),
        new Selection(4, 1, 4, 5)
      ]);
      viewModel.paste(
        "aaa\nbbb\nccc\n",
        false,
        null
      );
      assert.strictEqual(model.getValue(), [
        "aaa",
        "bbb",
        "ccc",
        "",
        "aaa",
        "bbb",
        "ccc",
        "",
        "aaa",
        "bbb",
        "ccc",
        "",
        "aaa",
        "bbb",
        "ccc",
        ""
      ].join("\n"));
    });
  });
  test("issue #43722: Multiline paste doesn't work anymore", () => {
    usingCursor({
      text: [
        "test",
        "test",
        "test",
        "test"
      ]
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(1, 1, 1, 5),
        new Selection(2, 1, 2, 5),
        new Selection(3, 1, 3, 5),
        new Selection(4, 1, 4, 5)
      ]);
      viewModel.paste(
        "aaa\r\nbbb\r\nccc\r\nddd\r\n",
        false,
        null
      );
      assert.strictEqual(model.getValue(), [
        "aaa",
        "bbb",
        "ccc",
        "ddd"
      ].join("\n"));
    });
  });
  test("issue #46440: (1) Pasting a multi-line selection pastes entire selection into every insertion point", () => {
    usingCursor({
      text: [
        "line1",
        "line2",
        "line3"
      ]
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 1, 1, 1), new Selection(2, 1, 2, 1), new Selection(3, 1, 3, 1)]);
      viewModel.paste(
        "a\nb\nc",
        false,
        null
      );
      assert.strictEqual(model.getValue(), [
        "aline1",
        "bline2",
        "cline3"
      ].join("\n"));
    });
  });
  test("issue #46440: (2) Pasting a multi-line selection pastes entire selection into every insertion point", () => {
    usingCursor({
      text: [
        "line1",
        "line2",
        "line3"
      ]
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 1, 1, 1), new Selection(2, 1, 2, 1), new Selection(3, 1, 3, 1)]);
      viewModel.paste(
        "a\nb\nc\n",
        false,
        null
      );
      assert.strictEqual(model.getValue(), [
        "aline1",
        "bline2",
        "cline3"
      ].join("\n"));
    });
  });
  test("issue #256039: paste from multiple cursors with empty selections and multiCursorPaste full", () => {
    usingCursor({
      text: [
        "line1",
        "line2",
        "line3"
      ],
      editorOpts: {
        multiCursorPaste: "full"
      }
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 1, 1, 1), new Selection(2, 1, 2, 1)]);
      viewModel.paste(
        "line1\nline2\n",
        true,
        ["line1\n", "line2\n"]
      );
      assert.strictEqual(model.getValue(), [
        "line1",
        "line1",
        "line2",
        "line2",
        "line3"
      ].join("\n"));
    });
  });
  test("issue #3071: Investigate why undo stack gets corrupted", () => {
    const model = createTextModel2(
      [
        "some lines",
        "and more lines",
        "just some text"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, 1, false);
      moveTo(editor, viewModel, 3, 4, true);
      let isFirst = true;
      const disposable = model.onDidChangeContent(() => {
        if (isFirst) {
          isFirst = false;
          viewModel.type("	", "keyboard");
        }
      });
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getValue(), [
        "	 just some text"
      ].join("\n"), "001");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(), [
        "    some lines",
        "    and more lines",
        "    just some text"
      ].join("\n"), "002");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(), [
        "some lines",
        "and more lines",
        "just some text"
      ].join("\n"), "003");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(), [
        "some lines",
        "and more lines",
        "just some text"
      ].join("\n"), "004");
      disposable.dispose();
    });
  });
  test("issue #12950: Cannot Double Click To Insert Emoji Using OSX Emoji Panel", () => {
    usingCursor({
      text: [
        "some lines",
        "and more lines",
        "just some text"
      ],
      languageId: null
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 1, false);
      viewModel.type("\u{1F60D}", "keyboard");
      assert.strictEqual(model.getValue(), [
        "some lines",
        "and more lines",
        "\u{1F60D}just some text"
      ].join("\n"));
    });
  });
  test("issue #3463: pressing tab adds spaces, but not as many as for a tab", () => {
    const model = createTextModel2(
      [
        "function a() {",
        "	var a = {",
        "		x: 3",
        "	};",
        "}"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 3, 2, false);
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(3), "	    	x: 3");
    });
  });
  test("issue #4312: trying to type a tab character over a sequence of spaces results in unexpected behaviour", () => {
    const model = createTextModel2(
      [
        "var foo = 123;       // this is a comment",
        "var bar = 4;       // another comment"
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, 15, false);
      moveTo(editor, viewModel, 1, 22, true);
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(1), "var foo = 123;	// this is a comment");
    });
  });
  test("issue #832: word right", () => {
    usingCursor({
      text: [
        "   /* Just some   more   text a+= 3 +5-3 + 7 */  "
      ]
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 1, false);
      function assertWordRight(col, expectedCol) {
        const args = {
          position: {
            lineNumber: 1,
            column: col
          }
        };
        if (col === 1) {
          CoreNavigationCommands.WordSelect.runCoreEditorCommand(viewModel, args);
        } else {
          CoreNavigationCommands.WordSelectDrag.runCoreEditorCommand(viewModel, args);
        }
        assert.strictEqual(viewModel.getSelection().startColumn, 1, "TEST FOR " + col);
        assert.strictEqual(viewModel.getSelection().endColumn, expectedCol, "TEST FOR " + col);
      }
      assertWordRight(1, "   ".length + 1);
      assertWordRight(2, "   ".length + 1);
      assertWordRight(3, "   ".length + 1);
      assertWordRight(4, "   ".length + 1);
      assertWordRight(5, "   /".length + 1);
      assertWordRight(6, "   /*".length + 1);
      assertWordRight(7, "   /* ".length + 1);
      assertWordRight(8, "   /* Just".length + 1);
      assertWordRight(9, "   /* Just".length + 1);
      assertWordRight(10, "   /* Just".length + 1);
      assertWordRight(11, "   /* Just".length + 1);
      assertWordRight(12, "   /* Just ".length + 1);
      assertWordRight(13, "   /* Just some".length + 1);
      assertWordRight(14, "   /* Just some".length + 1);
      assertWordRight(15, "   /* Just some".length + 1);
      assertWordRight(16, "   /* Just some".length + 1);
      assertWordRight(17, "   /* Just some ".length + 1);
      assertWordRight(18, "   /* Just some  ".length + 1);
      assertWordRight(19, "   /* Just some   ".length + 1);
      assertWordRight(20, "   /* Just some   more".length + 1);
      assertWordRight(21, "   /* Just some   more".length + 1);
      assertWordRight(22, "   /* Just some   more".length + 1);
      assertWordRight(23, "   /* Just some   more".length + 1);
      assertWordRight(24, "   /* Just some   more ".length + 1);
      assertWordRight(25, "   /* Just some   more  ".length + 1);
      assertWordRight(26, "   /* Just some   more   ".length + 1);
      assertWordRight(27, "   /* Just some   more   text".length + 1);
      assertWordRight(28, "   /* Just some   more   text".length + 1);
      assertWordRight(29, "   /* Just some   more   text".length + 1);
      assertWordRight(30, "   /* Just some   more   text".length + 1);
      assertWordRight(31, "   /* Just some   more   text ".length + 1);
      assertWordRight(32, "   /* Just some   more   text a".length + 1);
      assertWordRight(33, "   /* Just some   more   text a+".length + 1);
      assertWordRight(34, "   /* Just some   more   text a+=".length + 1);
      assertWordRight(35, "   /* Just some   more   text a+= ".length + 1);
      assertWordRight(36, "   /* Just some   more   text a+= 3".length + 1);
      assertWordRight(37, "   /* Just some   more   text a+= 3 ".length + 1);
      assertWordRight(38, "   /* Just some   more   text a+= 3 +".length + 1);
      assertWordRight(39, "   /* Just some   more   text a+= 3 +5".length + 1);
      assertWordRight(40, "   /* Just some   more   text a+= 3 +5-".length + 1);
      assertWordRight(41, "   /* Just some   more   text a+= 3 +5-3".length + 1);
      assertWordRight(42, "   /* Just some   more   text a+= 3 +5-3 ".length + 1);
      assertWordRight(43, "   /* Just some   more   text a+= 3 +5-3 +".length + 1);
      assertWordRight(44, "   /* Just some   more   text a+= 3 +5-3 + ".length + 1);
      assertWordRight(45, "   /* Just some   more   text a+= 3 +5-3 + 7".length + 1);
      assertWordRight(46, "   /* Just some   more   text a+= 3 +5-3 + 7 ".length + 1);
      assertWordRight(47, "   /* Just some   more   text a+= 3 +5-3 + 7 *".length + 1);
      assertWordRight(48, "   /* Just some   more   text a+= 3 +5-3 + 7 */".length + 1);
      assertWordRight(49, "   /* Just some   more   text a+= 3 +5-3 + 7 */ ".length + 1);
      assertWordRight(50, "   /* Just some   more   text a+= 3 +5-3 + 7 */  ".length + 1);
    });
  });
  test("issue #33788: Wrong cursor position when double click to select a word", () => {
    const model = createTextModel2(
      [
        "Just some text"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      CoreNavigationCommands.WordSelect.runCoreEditorCommand(viewModel, { position: new Position(1, 8) });
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 6, 1, 10));
      CoreNavigationCommands.WordSelectDrag.runCoreEditorCommand(viewModel, { position: new Position(1, 8) });
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 6, 1, 10));
    });
  });
  test("issue #12887: Double-click highlighting separating white space", () => {
    const model = createTextModel2(
      [
        "abc def"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      CoreNavigationCommands.WordSelect.runCoreEditorCommand(viewModel, { position: new Position(1, 5) });
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 5, 1, 8));
    });
  });
  test("Double-click on punctuation should select the character, not adjacent space", () => {
    const model = createTextModel2(
      [
        "// a b c 1 2 3 ~ ! @ # $ % ^ & * ( ) _ + \\ /"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      CoreNavigationCommands.WordSelect.runCoreEditorCommand(viewModel, { position: new Position(1, 20) });
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 20, 1, 21), "Should select @ character");
      CoreNavigationCommands.WordSelect.runCoreEditorCommand(viewModel, { position: new Position(1, 22) });
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 22, 1, 23), "Should select # character");
      CoreNavigationCommands.WordSelect.runCoreEditorCommand(viewModel, { position: new Position(1, 18) });
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 18, 1, 19), "Should select ! character");
      CoreNavigationCommands.WordSelect.runCoreEditorCommand(viewModel, { position: new Position(1, 1) });
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 1, 1, 3), "Should select // token");
      CoreNavigationCommands.WordSelect.runCoreEditorCommand(viewModel, { position: new Position(1, 2) });
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 1, 1, 3), "Should select // token");
      CoreNavigationCommands.WordSelect.runCoreEditorCommand(viewModel, { position: new Position(1, 42) });
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 42, 1, 43), "Should select \\ character");
    });
  });
  test("issue #9675: Undo/Redo adds a stop in between CHN Characters", () => {
    withTestCodeEditor2([], {}, (editor, viewModel) => {
      const model = editor.getModel();
      assertCursor(viewModel, new Position(1, 1));
      viewModel.type("\uFF53", "keyboard");
      viewModel.compositionType("\u305B", 1, 0, 0);
      viewModel.compositionType("\u305B\uFF4E", 1, 0, 0);
      viewModel.compositionType("\u305B\u3093", 2, 0, 0);
      viewModel.compositionType("\u305B\u3093\uFF53", 2, 0, 0);
      viewModel.compositionType("\u305B\u3093\u305B", 3, 0, 0);
      viewModel.compositionType("\u305B\u3093\u305B", 3, 0, 0);
      viewModel.compositionType("\u305B\u3093\u305B\u3044", 3, 0, 0);
      viewModel.compositionType("\u305B\u3093\u305B\u3044", 4, 0, 0);
      viewModel.compositionType("\u305B\u3093\u305B\u3044", 4, 0, 0);
      viewModel.compositionType("\u305B\u3093\u305B\u3044", 4, 0, 0);
      assert.strictEqual(model.getLineContent(1), "\u305B\u3093\u305B\u3044");
      assertCursor(viewModel, new Position(1, 5));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "");
      assertCursor(viewModel, new Position(1, 1));
    });
  });
  test("issue #23983: Calling model.setEOL does not reset cursor position", () => {
    usingCursor({
      text: [
        "first line",
        "second line"
      ]
    }, (editor, model, viewModel) => {
      model.setEOL(EndOfLineSequence.CRLF);
      viewModel.setSelections("test", [new Selection(2, 2, 2, 2)]);
      model.setEOL(EndOfLineSequence.LF);
      assertCursor(viewModel, new Selection(2, 2, 2, 2));
    });
  });
  test("issue #23983: Calling model.setValue() resets cursor position", () => {
    usingCursor({
      text: [
        "first line",
        "second line"
      ]
    }, (editor, model, viewModel) => {
      model.setEOL(EndOfLineSequence.CRLF);
      viewModel.setSelections("test", [new Selection(2, 2, 2, 2)]);
      model.setValue([
        "different first line",
        "different second line",
        "new third line"
      ].join("\n"));
      assertCursor(viewModel, new Selection(1, 1, 1, 1));
    });
  });
  test("issue #36740: wordwrap creates an extra step / character at the wrapping point", () => {
    withTestCodeEditor2([
      [
        "Lorem ipsum ",
        "dolor sit amet ",
        "consectetur ",
        "adipiscing elit"
      ].join("")
    ], { wordWrap: "wordWrapColumn", wordWrapColumn: 16 }, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 7, 1, 7)]);
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Selection(1, 8, 1, 8));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Selection(1, 9, 1, 9));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Selection(1, 10, 1, 10));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Selection(1, 11, 1, 11));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Selection(1, 12, 1, 12));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Selection(1, 13, 1, 13));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Selection(1, 14, 1, 14));
      moveLeft(editor, viewModel);
      assertCursor(viewModel, new Selection(1, 13, 1, 13));
      moveLeft(editor, viewModel);
      assertCursor(viewModel, new Selection(1, 12, 1, 12));
    });
  });
  test("issue #110376: multiple selections with wordwrap behave differently", () => {
    withTestCodeEditor2([
      [
        "just a sentence. just a ",
        "sentence. just a sentence."
      ].join("")
    ], { wordWrap: "wordWrapColumn", wordWrapColumn: 25 }, (editor, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(1, 1, 1, 16),
        new Selection(1, 18, 1, 33),
        new Selection(1, 35, 1, 50)
      ]);
      moveLeft(editor, viewModel);
      assertCursor(viewModel, [
        new Selection(1, 1, 1, 1),
        new Selection(1, 18, 1, 18),
        new Selection(1, 35, 1, 35)
      ]);
      viewModel.setSelections("test", [
        new Selection(1, 1, 1, 16),
        new Selection(1, 18, 1, 33),
        new Selection(1, 35, 1, 50)
      ]);
      moveRight(editor, viewModel);
      assertCursor(viewModel, [
        new Selection(1, 16, 1, 16),
        new Selection(1, 33, 1, 33),
        new Selection(1, 50, 1, 50)
      ]);
    });
  });
  test("issue #98320: Multi-Cursor, Wrap lines and cursorSelectRight ==> cursors out of sync", () => {
    withTestCodeEditor2([
      [
        "lorem_ipsum-1993x11x13",
        "dolor_sit_amet-1998x04x27",
        "consectetur-2007x10x08",
        "adipiscing-2012x07x27",
        "elit-2015x02x27"
      ].join("\n")
    ], { wordWrap: "wordWrapColumn", wordWrapColumn: 16 }, (editor, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(1, 13, 1, 13),
        new Selection(2, 16, 2, 16),
        new Selection(3, 13, 3, 13),
        new Selection(4, 12, 4, 12),
        new Selection(5, 6, 5, 6)
      ]);
      assertCursor(viewModel, [
        new Selection(1, 13, 1, 13),
        new Selection(2, 16, 2, 16),
        new Selection(3, 13, 3, 13),
        new Selection(4, 12, 4, 12),
        new Selection(5, 6, 5, 6)
      ]);
      moveRight(editor, viewModel, true);
      assertCursor(viewModel, [
        new Selection(1, 13, 1, 14),
        new Selection(2, 16, 2, 17),
        new Selection(3, 13, 3, 14),
        new Selection(4, 12, 4, 13),
        new Selection(5, 6, 5, 7)
      ]);
      moveRight(editor, viewModel, true);
      assertCursor(viewModel, [
        new Selection(1, 13, 1, 15),
        new Selection(2, 16, 2, 18),
        new Selection(3, 13, 3, 15),
        new Selection(4, 12, 4, 14),
        new Selection(5, 6, 5, 8)
      ]);
      moveRight(editor, viewModel, true);
      assertCursor(viewModel, [
        new Selection(1, 13, 1, 16),
        new Selection(2, 16, 2, 19),
        new Selection(3, 13, 3, 16),
        new Selection(4, 12, 4, 15),
        new Selection(5, 6, 5, 9)
      ]);
      moveRight(editor, viewModel, true);
      assertCursor(viewModel, [
        new Selection(1, 13, 1, 17),
        new Selection(2, 16, 2, 20),
        new Selection(3, 13, 3, 17),
        new Selection(4, 12, 4, 16),
        new Selection(5, 6, 5, 10)
      ]);
    });
  });
  test("issue #41573 - delete across multiple lines does not shrink the selection when word wraps", () => {
    withTestCodeEditor2([
      "Authorization: 'Bearer pHKRfCTFSnGxs6akKlb9ddIXcca0sIUSZJutPHYqz7vEeHdMTMh0SGN0IGU3a0n59DXjTLRsj5EJ2u33qLNIFi9fk5XF8pK39PndLYUZhPt4QvHGLScgSkK0L4gwzkzMloTQPpKhqiikiIOvyNNSpd2o8j29NnOmdTUOKi9DVt74PD2ohKxyOrWZ6oZprTkb3eKajcpnS0LABKfaw2rmv4',"
    ].join("\n"), { wordWrap: "wordWrapColumn", wordWrapColumn: 100 }, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, 43, false);
      moveTo(editor, viewModel, 1, 147, true);
      assertCursor(viewModel, new Selection(1, 43, 1, 147));
      editor.getModel().applyEdits([{
        range: new Range(1, 1, 1, 43),
        text: ""
      }]);
      assertCursor(viewModel, new Selection(1, 1, 1, 105));
    });
  });
  test("issue #22717: Moving text cursor cause an incorrect position in Chinese", () => {
    withTestCodeEditor2([
      [
        "\u4E00\u4E8C\u4E09\u56DB\u4E94\u516D\u4E03\u516B\u4E5D\u5341",
        "12345678901234567890"
      ].join("\n")
    ], {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 5, 1, 5)]);
      moveDown(editor, viewModel);
      assertCursor(viewModel, new Selection(2, 9, 2, 9));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Selection(2, 10, 2, 10));
      moveRight(editor, viewModel);
      assertCursor(viewModel, new Selection(2, 11, 2, 11));
      moveUp(editor, viewModel);
      assertCursor(viewModel, new Selection(1, 6, 1, 6));
    });
  });
  test("issue #112301: new stickyTabStops feature interferes with word wrap", () => {
    withTestCodeEditor2([
      [
        "function hello() {",
        "        console.log(`this is a long console message`)",
        "}"
      ].join("\n")
    ], { wordWrap: "wordWrapColumn", wordWrapColumn: 32, stickyTabStops: true }, (editor, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(2, 31, 2, 31)
      ]);
      moveRight(editor, viewModel, false);
      assertCursor(viewModel, new Position(2, 32));
      moveRight(editor, viewModel, false);
      assertCursor(viewModel, new Position(2, 33));
      moveRight(editor, viewModel, false);
      assertCursor(viewModel, new Position(2, 34));
      moveLeft(editor, viewModel, false);
      assertCursor(viewModel, new Position(2, 33));
      moveLeft(editor, viewModel, false);
      assertCursor(viewModel, new Position(2, 32));
      moveLeft(editor, viewModel, false);
      assertCursor(viewModel, new Position(2, 31));
    });
  });
  test("issue #44805: Should not be able to undo in readonly editor", () => {
    const model = createTextModel2(
      [
        ""
      ].join("\n")
    );
    withTestCodeEditor2(model, { readOnly: true }, (editor, viewModel) => {
      model.pushEditOperations([new Selection(1, 1, 1, 1)], [{
        range: new Range(1, 1, 1, 1),
        text: "Hello world!"
      }], () => [new Selection(1, 1, 1, 1)]);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "Hello world!");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "Hello world!");
    });
  });
  test("issue #46314: ViewModel is out of sync with Model!", () => {
    const tokenizationSupport = {
      getInitialState: () => NullState,
      tokenize: void 0,
      tokenizeEncoded: (line, hasEOL, state) => {
        return new EncodedTokenizationResult(new Uint32Array(0), [], state);
      }
    };
    const LANGUAGE_ID = "modelModeTest1";
    const languageRegistration = TokenizationRegistry.register(LANGUAGE_ID, tokenizationSupport);
    const model = createTextModel2("Just text", LANGUAGE_ID);
    withTestCodeEditor2(model, {}, (editor1, cursor1) => {
      withTestCodeEditor2(model, {}, (editor2, cursor2) => {
        const disposable = editor1.onDidChangeCursorPosition(() => {
          model.tokenization.tokenizeIfCheap(1);
        });
        model.applyEdits([{ range: new Range(1, 1, 1, 1), text: "-" }]);
        disposable.dispose();
      });
    });
    languageRegistration.dispose();
    model.dispose();
  });
  test("issue #37967: problem replacing consecutive characters", () => {
    const model = createTextModel2(
      [
        'const a = "foo";',
        'const b = ""'
      ].join("\n")
    );
    withTestCodeEditor2(model, { multiCursorMergeOverlapping: false }, (editor, viewModel) => {
      editor.setSelections([
        new Selection(1, 12, 1, 12),
        new Selection(1, 16, 1, 16),
        new Selection(2, 12, 2, 12),
        new Selection(2, 13, 2, 13)
      ]);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assertCursor(viewModel, [
        new Selection(1, 11, 1, 11),
        new Selection(1, 14, 1, 14),
        new Selection(2, 11, 2, 11),
        new Selection(2, 11, 2, 11)
      ]);
      viewModel.type("'", "keyboard");
      assert.strictEqual(model.getLineContent(1), "const a = 'foo';");
      assert.strictEqual(model.getLineContent(2), "const b = ''");
    });
  });
  test("issue #15761: Cursor doesn't move in a redo operation", () => {
    const model = createTextModel2(
      [
        "hello"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      editor.setSelections([
        new Selection(1, 4, 1, 4)
      ]);
      editor.executeEdits("test", [{
        range: new Range(1, 1, 1, 1),
        text: "*",
        forceMoveMarkers: true
      }]);
      assertCursor(viewModel, [
        new Selection(1, 5, 1, 5)
      ]);
      editor.runCommand(CoreEditingCommands.Undo, null);
      assertCursor(viewModel, [
        new Selection(1, 4, 1, 4)
      ]);
      editor.runCommand(CoreEditingCommands.Redo, null);
      assertCursor(viewModel, [
        new Selection(1, 5, 1, 5)
      ]);
    });
  });
  test("issue #42783: API Calls with Undo Leave Cursor in Wrong Position", () => {
    const model = createTextModel2(
      [
        "ab"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      editor.setSelections([
        new Selection(1, 1, 1, 1)
      ]);
      editor.executeEdits("test", [{
        range: new Range(1, 1, 1, 3),
        text: ""
      }]);
      assertCursor(viewModel, [
        new Selection(1, 1, 1, 1)
      ]);
      editor.runCommand(CoreEditingCommands.Undo, null);
      assertCursor(viewModel, [
        new Selection(1, 1, 1, 1)
      ]);
      editor.executeEdits("test", [{
        range: new Range(1, 1, 1, 2),
        text: ""
      }]);
      assertCursor(viewModel, [
        new Selection(1, 1, 1, 1)
      ]);
    });
  });
  test("issue #85712: Paste line moves cursor to start of current line rather than start of next line", () => {
    const model = createTextModel2(
      [
        "abc123",
        ""
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      editor.setSelections([
        new Selection(2, 1, 2, 1)
      ]);
      viewModel.paste("something\n", true);
      assert.strictEqual(model.getValue(), [
        "abc123",
        "something",
        ""
      ].join("\n"));
      assertCursor(viewModel, new Position(3, 1));
    });
  });
  test("issue #84897: Left delete behavior in some languages is changed", () => {
    const model = createTextModel2(
      [
        "\u0E2A\u0E27\u0E31\u0E2A\u0E14\u0E35"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      editor.setSelections([
        new Selection(1, 7, 1, 7)
      ]);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u0E2A\u0E27\u0E31\u0E2A\u0E14");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u0E2A\u0E27\u0E31\u0E2A");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u0E2A\u0E27\u0E31");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u0E2A\u0E27");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u0E2A");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "");
    });
  });
  test("issue #122914: Left delete behavior in some languages is changed (useTabStops: false)", () => {
    const model = createTextModel2(
      [
        "\u0E2A\u0E27\u0E31\u0E2A\u0E14\u0E35"
      ].join("\n")
    );
    withTestCodeEditor2(model, { useTabStops: false }, (editor, viewModel) => {
      editor.setSelections([
        new Selection(1, 7, 1, 7)
      ]);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u0E2A\u0E27\u0E31\u0E2A\u0E14");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u0E2A\u0E27\u0E31\u0E2A");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u0E2A\u0E27\u0E31");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u0E2A\u0E27");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u0E2A");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "");
    });
  });
  test("issue #99629: Emoji modifiers in text treated separately when using backspace", () => {
    const model = createTextModel2(
      [
        "\u{1F476}\u{1F3FE}"
      ].join("\n")
    );
    withTestCodeEditor2(model, { useTabStops: false }, (editor, viewModel) => {
      const len = model.getValueLength();
      editor.setSelections([
        new Selection(1, 1 + len, 1, 1 + len)
      ]);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "");
    });
  });
  test("issue #99629: Emoji modifiers in text treated separately when using backspace (ZWJ sequence)", () => {
    const model = createTextModel2(
      [
        "\u{1F468}\u200D\u{1F469}\u{1F3FD}\u200D\u{1F467}\u200D\u{1F466}"
      ].join("\n")
    );
    withTestCodeEditor2(model, { useTabStops: false }, (editor, viewModel) => {
      const len = model.getValueLength();
      editor.setSelections([
        new Selection(1, 1 + len, 1, 1 + len)
      ]);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u{1F468}\u200D\u{1F469}\u{1F3FD}\u200D\u{1F467}");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u{1F468}\u200D\u{1F469}\u{1F3FD}");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\u{1F468}");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "");
    });
  });
  test("issue #105730: move left behaves differently for multiple cursors", () => {
    const model = createTextModel2("asdfghjkl, asdfghjkl, asdfghjkl, ");
    withTestCodeEditor2(
      model,
      {
        wordWrap: "wordWrapColumn",
        wordWrapColumn: 24
      },
      (editor, viewModel) => {
        viewModel.setSelections("test", [
          new Selection(1, 10, 1, 12),
          new Selection(1, 21, 1, 23),
          new Selection(1, 32, 1, 34)
        ]);
        moveLeft(editor, viewModel, false);
        assertCursor(viewModel, [
          new Selection(1, 10, 1, 10),
          new Selection(1, 21, 1, 21),
          new Selection(1, 32, 1, 32)
        ]);
        viewModel.setSelections("test", [
          new Selection(1, 10, 1, 12),
          new Selection(1, 21, 1, 23),
          new Selection(1, 32, 1, 34)
        ]);
        moveLeft(editor, viewModel, true);
        assertCursor(viewModel, [
          new Selection(1, 10, 1, 11),
          new Selection(1, 21, 1, 22),
          new Selection(1, 32, 1, 33)
        ]);
      }
    );
  });
  test("issue #105730: move right should always skip wrap point", () => {
    const model = createTextModel2("asdfghjkl, asdfghjkl, asdfghjkl, \nasdfghjkl,");
    withTestCodeEditor2(
      model,
      {
        wordWrap: "wordWrapColumn",
        wordWrapColumn: 24
      },
      (editor, viewModel) => {
        viewModel.setSelections("test", [
          new Selection(1, 22, 1, 22)
        ]);
        moveRight(editor, viewModel, false);
        moveRight(editor, viewModel, false);
        assertCursor(viewModel, [
          new Selection(1, 24, 1, 24)
        ]);
        viewModel.setSelections("test", [
          new Selection(1, 22, 1, 22)
        ]);
        moveRight(editor, viewModel, true);
        moveRight(editor, viewModel, true);
        assertCursor(viewModel, [
          new Selection(1, 22, 1, 24)
        ]);
      }
    );
  });
  test("issue #123178: sticky tab in consecutive wrapped lines", () => {
    const model = createTextModel2("    aaaa        aaaa", void 0, { tabSize: 4 });
    withTestCodeEditor2(
      model,
      {
        wordWrap: "wordWrapColumn",
        wordWrapColumn: 8,
        stickyTabStops: true
      },
      (editor, viewModel) => {
        viewModel.setSelections("test", [
          new Selection(1, 9, 1, 9)
        ]);
        moveRight(editor, viewModel, false);
        assertCursor(viewModel, [
          new Selection(1, 10, 1, 10)
        ]);
        moveLeft(editor, viewModel, false);
        assertCursor(viewModel, [
          new Selection(1, 9, 1, 9)
        ]);
      }
    );
  });
  test("Cursor honors insertSpaces configuration on new line", () => {
    usingCursor({
      text: [
        "    	My First Line	 ",
        "	My Second Line",
        "    Third Line",
        "",
        "1"
      ]
    }, (editor, model, viewModel) => {
      CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(1, 21), source: "keyboard" });
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "    	My First Line	 ");
      assert.strictEqual(model.getLineContent(2), "        ");
    });
  });
  test("Cursor honors insertSpaces configuration on tab", () => {
    const model = createTextModel2(
      [
        "    	My First Line	 ",
        "My Second Line123",
        "    Third Line",
        "",
        "1"
      ].join("\n"),
      void 0,
      {
        tabSize: 13,
        indentSize: 13
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 1) });
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(2), "             My Second Line123");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "My Second Line123");
      CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 2) });
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(2), "M            y Second Line123");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "My Second Line123");
      CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 3) });
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(2), "My            Second Line123");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "My Second Line123");
      CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 4) });
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(2), "My           Second Line123");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "My Second Line123");
      CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 5) });
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(2), "My S         econd Line123");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "My Second Line123");
      CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 5) });
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(2), "My S         econd Line123");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "My Second Line123");
      CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 13) });
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(2), "My Second Li ne123");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "My Second Line123");
      CoreNavigationCommands.MoveTo.runCoreEditorCommand(viewModel, { position: new Position(2, 14) });
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(2), "My Second Lin             e123");
    });
  });
  test("Enter auto-indents with insertSpaces setting 1", () => {
    const languageId = setupOnEnterLanguage(IndentAction.Indent);
    usingCursor({
      text: [
        "	hello"
      ],
      languageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 7, false);
      assertCursor(viewModel, new Selection(1, 7, 1, 7));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.CRLF), "	hello\r\n        ");
    });
  });
  test("Enter auto-indents with insertSpaces setting 2", () => {
    const languageId = setupOnEnterLanguage(IndentAction.None);
    usingCursor({
      text: [
        "	hello"
      ],
      languageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 7, false);
      assertCursor(viewModel, new Selection(1, 7, 1, 7));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.CRLF), "	hello\r\n    ");
    });
  });
  test("Enter auto-indents with insertSpaces setting 3", () => {
    const languageId = setupOnEnterLanguage(IndentAction.IndentOutdent);
    usingCursor({
      text: [
        "	hell()"
      ],
      languageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 7, false);
      assertCursor(viewModel, new Selection(1, 7, 1, 7));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.CRLF), "	hell(\r\n        \r\n    )");
    });
  });
  test("issue #148256: Pressing Enter creates line with bad indent with insertSpaces: true", () => {
    usingCursor({
      text: [
        "  	"
      ]
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 4, false);
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), "  	\n    ");
    });
  });
  test("issue #148256: Pressing Enter creates line with bad indent with insertSpaces: false", () => {
    usingCursor({
      text: [
        "  	"
      ]
    }, (editor, model, viewModel) => {
      model.updateOptions({
        insertSpaces: false
      });
      moveTo(editor, viewModel, 1, 4, false);
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), "  	\n	");
    });
  });
  test("removeAutoWhitespace off", () => {
    usingCursor({
      text: [
        "    some  line abc  "
      ],
      modelOpts: {
        trimAutoWhitespace: false
      }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, model.getLineContent(1).length + 1);
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "    some  line abc  ");
      assert.strictEqual(model.getLineContent(2), "    ");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "    some  line abc  ");
      assert.strictEqual(model.getLineContent(2), "    ");
      assert.strictEqual(model.getLineContent(3), "    ");
    });
  });
  test("removeAutoWhitespace on: removes only whitespace the cursor added 1", () => {
    usingCursor({
      text: [
        "    "
      ]
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, model.getLineContent(1).length + 1);
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "    ");
      assert.strictEqual(model.getLineContent(2), "    ");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "    ");
      assert.strictEqual(model.getLineContent(2), "");
      assert.strictEqual(model.getLineContent(3), "    ");
    });
  });
  test("issue #115033: indent and appendText", () => {
    const languageId = "onEnterMode";
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      onEnterRules: [{
        beforeText: /.*/,
        action: {
          indentAction: IndentAction.Indent,
          appendText: "x"
        }
      }]
    }));
    usingCursor({
      text: [
        "text"
      ],
      languageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 5);
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "text");
      assert.strictEqual(model.getLineContent(2), "    x");
      assertCursor(viewModel, new Position(2, 6));
    });
  });
  test("issue #6862: Editor removes auto inserted indentation when formatting on type", () => {
    const languageId = setupOnEnterLanguage(IndentAction.IndentOutdent);
    usingCursor({
      text: [
        "function foo (params: string) {}"
      ],
      languageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 32);
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "function foo (params: string) {");
      assert.strictEqual(model.getLineContent(2), "    ");
      assert.strictEqual(model.getLineContent(3), "}");
      class TestCommand {
        constructor() {
          this._selectionId = null;
        }
        getEditOperations(model2, builder) {
          builder.addEditOperation(new Range(1, 13, 1, 14), "");
          this._selectionId = builder.trackSelection(viewModel.getSelection());
        }
        computeCursorState(model2, helper) {
          return helper.getTrackedSelection(this._selectionId);
        }
      }
      viewModel.executeCommand(new TestCommand(), "autoFormat");
      assert.strictEqual(model.getLineContent(1), "function foo(params: string) {");
      assert.strictEqual(model.getLineContent(2), "    ");
      assert.strictEqual(model.getLineContent(3), "}");
    });
  });
  test("removeAutoWhitespace on: removes only whitespace the cursor added 2", () => {
    const languageId = "testLang";
    const registration = languageService.registerLanguage({ id: languageId });
    const model = createTextModel2(
      [
        "    if (a) {",
        "        ",
        "",
        "",
        "    }"
      ].join("\n"),
      languageId
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 3, 1);
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(1), "    if (a) {");
      assert.strictEqual(model.getLineContent(2), "        ");
      assert.strictEqual(model.getLineContent(3), "    ");
      assert.strictEqual(model.getLineContent(4), "");
      assert.strictEqual(model.getLineContent(5), "    }");
      moveTo(editor, viewModel, 4, 1);
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(1), "    if (a) {");
      assert.strictEqual(model.getLineContent(2), "        ");
      assert.strictEqual(model.getLineContent(3), "");
      assert.strictEqual(model.getLineContent(4), "    ");
      assert.strictEqual(model.getLineContent(5), "    }");
      moveTo(editor, viewModel, 5, model.getLineMaxColumn(5));
      viewModel.type("something", "keyboard");
      assert.strictEqual(model.getLineContent(1), "    if (a) {");
      assert.strictEqual(model.getLineContent(2), "        ");
      assert.strictEqual(model.getLineContent(3), "");
      assert.strictEqual(model.getLineContent(4), "");
      assert.strictEqual(model.getLineContent(5), "    }something");
    });
    registration.dispose();
  });
  test("removeAutoWhitespace on: test 1", () => {
    const model = createTextModel2(
      [
        "    some  line abc  "
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, model.getLineContent(1).length + 1);
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "    some  line abc  ");
      assert.strictEqual(model.getLineContent(2), "    ");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "    some  line abc  ");
      assert.strictEqual(model.getLineContent(2), "");
      assert.strictEqual(model.getLineContent(3), "    ");
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(1), "    some  line abc  ");
      assert.strictEqual(model.getLineContent(2), "");
      assert.strictEqual(model.getLineContent(3), "        ");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "    some  line abc  ");
      assert.strictEqual(model.getLineContent(2), "");
      assert.strictEqual(model.getLineContent(3), "");
      assert.strictEqual(model.getLineContent(4), "        ");
      moveTo(editor, viewModel, 1, 5);
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "    ");
      assert.strictEqual(model.getLineContent(2), "    some  line abc  ");
      assert.strictEqual(model.getLineContent(3), "");
      assert.strictEqual(model.getLineContent(4), "");
      assert.strictEqual(model.getLineContent(5), "");
      moveTo(editor, viewModel, 2, 5);
      moveTo(editor, viewModel, 3, 1, true);
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "    ");
      assert.strictEqual(model.getLineContent(2), "    ");
      assert.strictEqual(model.getLineContent(3), "    ");
      assert.strictEqual(model.getLineContent(4), "");
      assert.strictEqual(model.getLineContent(5), "");
    });
  });
  test("issue #15118: remove auto whitespace when pasting entire line", () => {
    const model = createTextModel2(
      [
        "    function f() {",
        "        // I'm gonna copy this line",
        "        return 3;",
        "    }"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 3, model.getLineMaxColumn(3));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), [
        "    function f() {",
        "        // I'm gonna copy this line",
        "        return 3;",
        "        ",
        "    }"
      ].join("\n"));
      assertCursor(viewModel, new Position(4, model.getLineMaxColumn(4)));
      viewModel.paste("        // I'm gonna copy this line\n", true);
      assert.strictEqual(model.getValue(), [
        "    function f() {",
        "        // I'm gonna copy this line",
        "        return 3;",
        "        // I'm gonna copy this line",
        "",
        "    }"
      ].join("\n"));
      assertCursor(viewModel, new Position(5, 1));
    });
  });
  test("issue #40695: maintain cursor position when copying lines using ctrl+c, ctrl+v", () => {
    const model = createTextModel2(
      [
        "    function f() {",
        "        // I'm gonna copy this line",
        "        // Another line",
        "        return 3;",
        "    }"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      editor.setSelections([new Selection(4, 10, 4, 10)]);
      viewModel.paste("        // I'm gonna copy this line\n", true);
      assert.strictEqual(model.getValue(), [
        "    function f() {",
        "        // I'm gonna copy this line",
        "        // Another line",
        "        // I'm gonna copy this line",
        "        return 3;",
        "    }"
      ].join("\n"));
      assertCursor(viewModel, new Position(5, 10));
    });
  });
  test("UseTabStops is off", () => {
    const model = createTextModel2(
      [
        "    x",
        "        a    ",
        "    "
      ].join("\n")
    );
    withTestCodeEditor2(model, { useTabStops: false }, (editor, viewModel) => {
      moveTo(editor, viewModel, 2, 9);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(2), "       a    ");
    });
  });
  test("Backspace removes whitespaces with tab size", () => {
    const model = createTextModel2(
      [
        " 	 	     x",
        "        a    ",
        "    "
      ].join("\n")
    );
    withTestCodeEditor2(model, { useTabStops: true }, (editor, viewModel) => {
      moveTo(editor, viewModel, 2, model.getLineContent(2).length + 1);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(2), "        a   ");
      moveTo(editor, viewModel, 2, 9);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(2), "    a   ");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(2), "a   ");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "        a   ");
      moveTo(editor, viewModel, 1, 1);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(1), " 	 	     x");
      moveTo(editor, viewModel, 1, 10);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(1), " 	 	    x");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(1), " 	 	x");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(1), " 	x");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(1), "x");
      moveTo(editor, viewModel, 3, model.getLineContent(3).length + 1);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(3), "");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "x\n        a   ");
      moveTo(editor, viewModel, 2, 3);
      moveTo(editor, viewModel, 2, 4, true);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(2), "       a   ");
    });
  });
  test("PR #5423: Auto indent + undo + redo is funky", () => {
    const model = createTextModel2(
      [
        ""
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n", "assert1");
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	", "assert2");
      viewModel.type("y", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	y", "assert2");
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	y\n	", "assert3");
      viewModel.type("x");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	y\n	x", "assert4");
      CoreNavigationCommands.CursorLeft.runCoreEditorCommand(viewModel, {});
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	y\n	x", "assert5");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	y\nx", "assert6");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	yx", "assert7");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	x", "assert8");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\nx", "assert9");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "x", "assert10");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\nx", "assert11");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	y\nx", "assert12");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	y\n	x", "assert13");
      editor.runCommand(CoreEditingCommands.Redo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\n	y\nx", "assert14");
      editor.runCommand(CoreEditingCommands.Redo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "\nx", "assert15");
      editor.runCommand(CoreEditingCommands.Redo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "x", "assert16");
    });
  });
  test("issue #90973: Undo brings back model alternative version", () => {
    const model = createTextModel2(
      [
        ""
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      const beforeVersion = model.getVersionId();
      const beforeAltVersion = model.getAlternativeVersionId();
      viewModel.type("Hello", "keyboard");
      editor.runCommand(CoreEditingCommands.Undo, null);
      const afterVersion = model.getVersionId();
      const afterAltVersion = model.getAlternativeVersionId();
      assert.notStrictEqual(beforeVersion, afterVersion);
      assert.strictEqual(beforeAltVersion, afterAltVersion);
    });
  });
  test("Enter honors increaseIndentPattern", () => {
    usingCursor({
      text: [
        "if (true) {",
        "	if (true) {"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { insertSpaces: false },
      editorOpts: { autoIndent: "full" }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 12, false);
      assertCursor(viewModel, new Selection(1, 12, 1, 12));
      viewModel.type("\n", "keyboard");
      model.tokenization.forceTokenization(model.getLineCount());
      assertCursor(viewModel, new Selection(2, 2, 2, 2));
      moveTo(editor, viewModel, 3, 13, false);
      assertCursor(viewModel, new Selection(3, 13, 3, 13));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 3, 4, 3));
    });
  });
  test("Type honors decreaseIndentPattern", () => {
    usingCursor({
      text: [
        "if (true) {",
        "	"
      ],
      languageId: indentRulesLanguageId,
      editorOpts: { autoIndent: "full" }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 2, false);
      assertCursor(viewModel, new Selection(2, 2, 2, 2));
      viewModel.type("}", "keyboard");
      assertCursor(viewModel, new Selection(2, 2, 2, 2));
      assert.strictEqual(model.getLineContent(2), "}", "001");
    });
  });
  test("Enter honors unIndentedLinePattern", () => {
    usingCursor({
      text: [
        "if (true) {",
        "			return true"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { insertSpaces: false },
      editorOpts: { autoIndent: "full" }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 15, false);
      assertCursor(viewModel, new Selection(2, 15, 2, 15));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(3, 2, 3, 2));
    });
  });
  test("Enter honors indentNextLinePattern", () => {
    usingCursor({
      text: [
        "if (true)",
        "	return true;",
        "if (true)",
        "				return true"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { insertSpaces: false },
      editorOpts: { autoIndent: "full" }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 14, false);
      assertCursor(viewModel, new Selection(2, 14, 2, 14));
      viewModel.type("\n", "keyboard");
      model.tokenization.forceTokenization(model.getLineCount());
      assertCursor(viewModel, new Selection(3, 1, 3, 1));
      moveTo(editor, viewModel, 5, 16, false);
      assertCursor(viewModel, new Selection(5, 16, 5, 16));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(6, 2, 6, 2));
    });
  });
  test("Enter honors indentNextLinePattern 2", () => {
    const model = createTextModel2(
      [
        "if (true)",
        "	if (true)"
      ].join("\n"),
      indentRulesLanguageId,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor2(model, { autoIndent: "full" }, (editor, viewModel) => {
      moveTo(editor, viewModel, 2, 11, false);
      assertCursor(viewModel, new Selection(2, 11, 2, 11));
      viewModel.type("\n", "keyboard");
      model.tokenization.forceTokenization(model.getLineCount());
      assertCursor(viewModel, new Selection(3, 3, 3, 3));
      viewModel.type("console.log();", "keyboard");
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 1, 4, 1));
    });
  });
  test("Enter honors intential indent", () => {
    usingCursor({
      text: [
        "if (true) {",
        "	if (true) {",
        "return true;",
        "}}"
      ],
      languageId: indentRulesLanguageId,
      editorOpts: { autoIndent: "full" }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 13, false);
      assertCursor(viewModel, new Selection(3, 13, 3, 13));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 1, 4, 1));
      assert.strictEqual(model.getLineContent(3), "return true;", "001");
    });
  });
  test("Enter supports selection 1", () => {
    usingCursor({
      text: [
        "if (true) {",
        "	if (true) {",
        "		return true;",
        "	}a}"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { insertSpaces: false }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 4, 3, false);
      moveTo(editor, viewModel, 4, 4, true);
      assertCursor(viewModel, new Selection(4, 3, 4, 4));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(5, 1, 5, 1));
      assert.strictEqual(model.getLineContent(4), "	}", "001");
    });
  });
  test("Enter supports selection 2", () => {
    usingCursor({
      text: [
        "if (true) {",
        "	if (true) {"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { insertSpaces: false }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 12, false);
      moveTo(editor, viewModel, 2, 13, true);
      assertCursor(viewModel, new Selection(2, 12, 2, 13));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(3, 3, 3, 3));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 3, 4, 3));
    });
  });
  test("Enter honors tabSize and insertSpaces 1", () => {
    usingCursor({
      text: [
        "if (true) {",
        "	if (true) {"
      ],
      languageId: indentRulesLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 12, false);
      assertCursor(viewModel, new Selection(1, 12, 1, 12));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(2, 5, 2, 5));
      model.tokenization.forceTokenization(model.getLineCount());
      moveTo(editor, viewModel, 3, 13, false);
      assertCursor(viewModel, new Selection(3, 13, 3, 13));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 9, 4, 9));
    });
  });
  test("Enter honors tabSize and insertSpaces 2", () => {
    usingCursor({
      text: [
        "if (true) {",
        "    if (true) {"
      ],
      languageId: indentRulesLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 12, false);
      assertCursor(viewModel, new Selection(1, 12, 1, 12));
      viewModel.type("\n", "keyboard");
      model.tokenization.forceTokenization(model.getLineCount());
      assertCursor(viewModel, new Selection(2, 5, 2, 5));
      moveTo(editor, viewModel, 3, 16, false);
      assertCursor(viewModel, new Selection(3, 16, 3, 16));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(3), "    if (true) {");
      assertCursor(viewModel, new Selection(4, 9, 4, 9));
    });
  });
  test("Enter honors tabSize and insertSpaces 3", () => {
    usingCursor({
      text: [
        "if (true) {",
        "    if (true) {"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { insertSpaces: false }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 12, false);
      assertCursor(viewModel, new Selection(1, 12, 1, 12));
      viewModel.type("\n", "keyboard");
      model.tokenization.forceTokenization(model.getLineCount());
      assertCursor(viewModel, new Selection(2, 2, 2, 2));
      moveTo(editor, viewModel, 3, 16, false);
      assertCursor(viewModel, new Selection(3, 16, 3, 16));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(3), "    if (true) {");
      assertCursor(viewModel, new Selection(4, 3, 4, 3));
    });
  });
  test("Enter supports intentional indentation", () => {
    usingCursor({
      text: [
        "	if (true) {",
        "		switch(true) {",
        "			case true:",
        "				break;",
        "		}",
        "	}"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { insertSpaces: false },
      editorOpts: { autoIndent: "full" }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 5, 4, false);
      assertCursor(viewModel, new Selection(5, 4, 5, 4));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(5), "		}");
      assertCursor(viewModel, new Selection(6, 3, 6, 3));
    });
  });
  test("Enter should not adjust cursor position when press enter in the middle of a line 1", () => {
    usingCursor({
      text: [
        "if (true) {",
        "	if (true) {",
        "		return true;",
        "	}a}"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { insertSpaces: false }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 9, false);
      assertCursor(viewModel, new Selection(3, 9, 3, 9));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 3, 4, 3));
      assert.strictEqual(model.getLineContent(4), "		 true;", "001");
    });
  });
  test("Enter should not adjust cursor position when press enter in the middle of a line 2", () => {
    usingCursor({
      text: [
        "if (true) {",
        "	if (true) {",
        "		return true;",
        "	}a}"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { insertSpaces: false }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 3, false);
      assertCursor(viewModel, new Selection(3, 3, 3, 3));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 3, 4, 3));
      assert.strictEqual(model.getLineContent(4), "		return true;", "001");
    });
  });
  test("Enter should not adjust cursor position when press enter in the middle of a line 3", () => {
    usingCursor({
      text: [
        "if (true) {",
        "  if (true) {",
        "    return true;",
        "  }a}"
      ],
      languageId: indentRulesLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 11, false);
      assertCursor(viewModel, new Selection(3, 11, 3, 11));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 5, 4, 5));
      assert.strictEqual(model.getLineContent(4), "     true;", "001");
    });
  });
  test("Enter should adjust cursor position when press enter in the middle of leading whitespaces 1", () => {
    usingCursor({
      text: [
        "if (true) {",
        "	if (true) {",
        "		return true;",
        "	}a}"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { insertSpaces: false }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 2, false);
      assertCursor(viewModel, new Selection(3, 2, 3, 2));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 2, 4, 2));
      assert.strictEqual(model.getLineContent(4), "		return true;", "001");
      moveTo(editor, viewModel, 4, 1, false);
      assertCursor(viewModel, new Selection(4, 1, 4, 1));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(5, 1, 5, 1));
      assert.strictEqual(model.getLineContent(5), "		return true;", "002");
    });
  });
  test("Enter should adjust cursor position when press enter in the middle of leading whitespaces 2", () => {
    usingCursor({
      text: [
        "	if (true) {",
        "		if (true) {",
        "	    	return true;",
        "		}a}"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { insertSpaces: false }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 4, false);
      assertCursor(viewModel, new Selection(3, 4, 3, 4));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 3, 4, 3));
      assert.strictEqual(model.getLineContent(4), "			return true;", "001");
      moveTo(editor, viewModel, 4, 1, false);
      assertCursor(viewModel, new Selection(4, 1, 4, 1));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(5, 1, 5, 1));
      assert.strictEqual(model.getLineContent(5), "			return true;", "002");
    });
  });
  test("Enter should adjust cursor position when press enter in the middle of leading whitespaces 3", () => {
    usingCursor({
      text: [
        "if (true) {",
        "  if (true) {",
        "    return true;",
        "}a}"
      ],
      languageId: indentRulesLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 2, false);
      assertCursor(viewModel, new Selection(3, 2, 3, 2));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 2, 4, 2));
      assert.strictEqual(model.getLineContent(4), "    return true;", "001");
      moveTo(editor, viewModel, 4, 3, false);
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(5, 3, 5, 3));
      assert.strictEqual(model.getLineContent(5), "    return true;", "002");
    });
  });
  test("Enter should adjust cursor position when press enter in the middle of leading whitespaces 4", () => {
    usingCursor({
      text: [
        "if (true) {",
        "  if (true) {",
        "	  return true;",
        "}a}",
        "",
        "if (true) {",
        "  if (true) {",
        "	  return true;",
        "}a}"
      ],
      languageId: indentRulesLanguageId,
      modelOpts: {
        tabSize: 2,
        indentSize: 2
      }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 3, false);
      assertCursor(viewModel, new Selection(3, 3, 3, 3));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 4, 4, 4));
      assert.strictEqual(model.getLineContent(4), "    return true;", "001");
      moveTo(editor, viewModel, 9, 4, false);
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(10, 5, 10, 5));
      assert.strictEqual(model.getLineContent(10), "    return true;", "001");
    });
  });
  test("Enter should adjust cursor position when press enter in the middle of leading whitespaces 5", () => {
    usingCursor({
      text: [
        "if (true) {",
        "  if (true) {",
        "    return true;",
        "    return true;",
        ""
      ],
      languageId: indentRulesLanguageId,
      modelOpts: { tabSize: 2 }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 5, false);
      moveTo(editor, viewModel, 4, 3, true);
      assertCursor(viewModel, new Selection(3, 5, 4, 3));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 3, 4, 3));
      assert.strictEqual(model.getLineContent(4), "    return true;", "001");
    });
  });
  test("issue microsoft/monaco-editor#108 part 1/2: Auto indentation on Enter with selection is half broken", () => {
    usingCursor({
      text: [
        "function baz() {",
        "	var x = 1;",
        "							return x;",
        "}"
      ],
      modelOpts: {
        insertSpaces: false
      },
      languageId: indentRulesLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 8, false);
      moveTo(editor, viewModel, 2, 12, true);
      assertCursor(viewModel, new Selection(3, 8, 2, 12));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(3), "	return x;");
      assertCursor(viewModel, new Position(3, 2));
    });
  });
  test("issue microsoft/monaco-editor#108 part 2/2: Auto indentation on Enter with selection is half broken", () => {
    usingCursor({
      text: [
        "function baz() {",
        "	var x = 1;",
        "							return x;",
        "}"
      ],
      modelOpts: {
        insertSpaces: false
      },
      languageId: indentRulesLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 12, false);
      moveTo(editor, viewModel, 3, 8, true);
      assertCursor(viewModel, new Selection(2, 12, 3, 8));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(3), "	return x;");
      assertCursor(viewModel, new Position(3, 2));
    });
  });
  test("onEnter works if there are no indentation rules", () => {
    usingCursor({
      text: [
        "<?",
        "	if (true) {",
        "		echo $hi;",
        "		echo $bye;",
        "	}",
        "?>"
      ],
      modelOpts: { insertSpaces: false }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 5, 3, false);
      assertCursor(viewModel, new Selection(5, 3, 5, 3));
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getLineContent(6), "	");
      assertCursor(viewModel, new Selection(6, 2, 6, 2));
      assert.strictEqual(model.getLineContent(5), "	}");
    });
  });
  test("onEnter works if there are no indentation rules 2", () => {
    usingCursor({
      text: [
        "	if (5)",
        "		return 5;",
        "	"
      ],
      modelOpts: { insertSpaces: false }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 2, false);
      assertCursor(viewModel, new Selection(3, 2, 3, 2));
      viewModel.type("\n", "keyboard");
      assertCursor(viewModel, new Selection(4, 2, 4, 2));
      assert.strictEqual(model.getLineContent(4), "	");
    });
  });
  test("bug #16543: Tab should indent to correct indentation spot immediately", () => {
    const model = createTextModel2(
      [
        "function baz() {",
        "	function hello() { // something here",
        "	",
        "",
        "	}",
        "}"
      ].join("\n"),
      indentRulesLanguageId,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 4, 1, false);
      assertCursor(viewModel, new Selection(4, 1, 4, 1));
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(4), "		");
    });
  });
  test("bug #2938 (1): When pressing Tab on white-space only lines, indent straight to the right spot (similar to empty lines)", () => {
    const model = createTextModel2(
      [
        "	function baz() {",
        "		function hello() { // something here",
        "		",
        "	",
        "		}",
        "	}"
      ].join("\n"),
      indentRulesLanguageId,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 4, 2, false);
      assertCursor(viewModel, new Selection(4, 2, 4, 2));
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(4), "			");
    });
  });
  test("bug #2938 (2): When pressing Tab on white-space only lines, indent straight to the right spot (similar to empty lines)", () => {
    const model = createTextModel2(
      [
        "	function baz() {",
        "		function hello() { // something here",
        "		",
        "    ",
        "		}",
        "	}"
      ].join("\n"),
      indentRulesLanguageId,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 4, 1, false);
      assertCursor(viewModel, new Selection(4, 1, 4, 1));
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(4), "			");
    });
  });
  test("bug #2938 (3): When pressing Tab on white-space only lines, indent straight to the right spot (similar to empty lines)", () => {
    const model = createTextModel2(
      [
        "	function baz() {",
        "		function hello() { // something here",
        "		",
        "			",
        "		}",
        "	}"
      ].join("\n"),
      indentRulesLanguageId,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 4, 3, false);
      assertCursor(viewModel, new Selection(4, 3, 4, 3));
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(4), "				");
    });
  });
  test("bug #2938 (4): When pressing Tab on white-space only lines, indent straight to the right spot (similar to empty lines)", () => {
    const model = createTextModel2(
      [
        "	function baz() {",
        "		function hello() { // something here",
        "		",
        "				",
        "		}",
        "	}"
      ].join("\n"),
      indentRulesLanguageId,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 4, 4, false);
      assertCursor(viewModel, new Selection(4, 4, 4, 4));
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(4), "					");
    });
  });
  test("bug #31015: When pressing Tab on lines and Enter rules are avail, indent straight to the right spotTab", () => {
    const onEnterLanguageId = setupOnEnterLanguage(IndentAction.Indent);
    const model = createTextModel2(
      [
        "    if (a) {",
        "        ",
        "",
        "",
        "    }"
      ].join("\n"),
      onEnterLanguageId
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      moveTo(editor, viewModel, 3, 1);
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(1), "    if (a) {");
      assert.strictEqual(model.getLineContent(2), "        ");
      assert.strictEqual(model.getLineContent(3), "        ");
      assert.strictEqual(model.getLineContent(4), "");
      assert.strictEqual(model.getLineContent(5), "    }");
    });
  });
  test("type honors indentation rules: ruby keywords", () => {
    const rubyLanguageId = setupIndentRulesLanguage("ruby", {
      increaseIndentPattern: /^\s*((begin|class|def|else|elsif|ensure|for|if|module|rescue|unless|until|when|while)|(.*\sdo\b))\b[^\{;]*$/,
      decreaseIndentPattern: /^\s*([}\]]([,)]?\s*(#|$)|\.[a-zA-Z_]\w*\b)|(end|rescue|ensure|else|elsif|when)\b)/
    });
    const model = createTextModel2(
      [
        "class Greeter",
        "  def initialize(name)",
        "    @name = name",
        "    en"
      ].join("\n"),
      rubyLanguageId
    );
    withTestCodeEditor2(model, { autoIndent: "full" }, (editor, viewModel) => {
      moveTo(editor, viewModel, 4, 7, false);
      assertCursor(viewModel, new Selection(4, 7, 4, 7));
      viewModel.type("d", "keyboard");
      assert.strictEqual(model.getLineContent(4), "  end");
    });
  });
  test("Auto indent on type: increaseIndentPattern has higher priority than decreaseIndent when inheriting", () => {
    usingCursor({
      text: [
        "	if (true) {",
        "		console.log();",
        "	} else if {",
        "		console.log()",
        "	}"
      ],
      languageId: indentRulesLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 5, 3, false);
      assertCursor(viewModel, new Selection(5, 3, 5, 3));
      viewModel.type("e", "keyboard");
      assertCursor(viewModel, new Selection(5, 4, 5, 4));
      assert.strictEqual(model.getLineContent(5), "	}e", "This line should not decrease indent");
    });
  });
  test("type honors users indentation adjustment", () => {
    usingCursor({
      text: [
        "	if (true ||",
        "	 ) {",
        "	}",
        "if (true ||",
        ") {",
        "}"
      ],
      languageId: indentRulesLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 3, false);
      assertCursor(viewModel, new Selection(2, 3, 2, 3));
      viewModel.type(" ", "keyboard");
      assertCursor(viewModel, new Selection(2, 4, 2, 4));
      assert.strictEqual(model.getLineContent(2), "	  ) {", "This line should not decrease indent");
    });
  });
  test("bug 29972: if a line is line comment, open bracket should not indent next line", () => {
    usingCursor({
      text: [
        "if (true) {",
        "	// {",
        "		"
      ],
      languageId: indentRulesLanguageId,
      editorOpts: { autoIndent: "full" }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 3, false);
      assertCursor(viewModel, new Selection(3, 3, 3, 3));
      viewModel.type("}", "keyboard");
      assertCursor(viewModel, new Selection(3, 2, 3, 2));
      assert.strictEqual(model.getLineContent(3), "}");
    });
  });
  test("issue #38261: TAB key results in bizarre indentation in C++ mode ", () => {
    const languageId = "indentRulesMode";
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
      ],
      indentationRules: {
        increaseIndentPattern: new RegExp("(^.*\\{[^}]*$)"),
        decreaseIndentPattern: new RegExp("^\\s*\\}")
      }
    }));
    const model = createTextModel2(
      [
        "int main() {",
        "  return 0;",
        "}",
        "",
        "bool Foo::bar(const string &a,",
        "              const string &b) {",
        "  foo();",
        "",
        ")"
      ].join("\n"),
      languageId,
      {
        tabSize: 2,
        indentSize: 2
      }
    );
    withTestCodeEditor2(model, { autoIndent: "advanced" }, (editor, viewModel) => {
      moveTo(editor, viewModel, 8, 1, false);
      assertCursor(viewModel, new Selection(8, 1, 8, 1));
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(
        model.getValue(),
        [
          "int main() {",
          "  return 0;",
          "}",
          "",
          "bool Foo::bar(const string &a,",
          "              const string &b) {",
          "  foo();",
          "  ",
          ")"
        ].join("\n")
      );
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(8, 3, 8, 3));
    });
  });
  test("issue #57197: indent rules regex should be stateless", () => {
    const languageId = setupIndentRulesLanguage("lang", {
      decreaseIndentPattern: /^\s*}$/gm,
      increaseIndentPattern: /^(?![^\S\n]*(?!--|––|——)(?:[-❍❑■⬜□☐▪▫–—≡→›✘xX✔✓☑+]|\[[ xX+-]?\])\s[^\n]*)[^\S\n]*(.+:)[^\S\n]*(?:(?=@[^\s*~(]+(?::\/\/[^\s*~(:]+)?(?:\([^)]*\))?)|$)/gm
    });
    usingCursor({
      text: [
        "Project:"
      ],
      languageId,
      modelOpts: { insertSpaces: false },
      editorOpts: { autoIndent: "full" }
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 9, false);
      assertCursor(viewModel, new Selection(1, 9, 1, 9));
      viewModel.type("\n", "keyboard");
      model.tokenization.forceTokenization(model.getLineCount());
      assertCursor(viewModel, new Selection(2, 2, 2, 2));
      moveTo(editor, viewModel, 1, 9, false);
      assertCursor(viewModel, new Selection(1, 9, 1, 9));
      viewModel.type("\n", "keyboard");
      model.tokenization.forceTokenization(model.getLineCount());
      assertCursor(viewModel, new Selection(2, 2, 2, 2));
    });
  });
  test("typing in json", () => {
    const languageId = "indentRulesMode";
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      brackets: [
        ["{", "}"],
        ["[", "]"],
        ["(", ")"]
      ],
      indentationRules: {
        increaseIndentPattern: new RegExp('({+(?=([^"]*"[^"]*")*[^"}]*$))|(\\[+(?=([^"]*"[^"]*")*[^"\\]]*$))'),
        decreaseIndentPattern: new RegExp("^\\s*[}\\]],?\\s*$")
      }
    }));
    const model = createTextModel2(
      [
        "{",
        '  "scripts: {"',
        '    "watch": "a {"',
        '    "build{": "b"',
        '    "tasks": []',
        '    "tasks": ["a"]',
        '  "}"',
        '"}"'
      ].join("\n"),
      languageId,
      {
        tabSize: 2,
        indentSize: 2
      }
    );
    withTestCodeEditor2(model, { autoIndent: "full" }, (editor, viewModel) => {
      moveTo(editor, viewModel, 3, 19, false);
      assertCursor(viewModel, new Selection(3, 19, 3, 19));
      viewModel.type("\n", "keyboard");
      assert.deepStrictEqual(model.getLineContent(4), "    ");
      moveTo(editor, viewModel, 5, 18, false);
      assertCursor(viewModel, new Selection(5, 18, 5, 18));
      viewModel.type("\n", "keyboard");
      assert.deepStrictEqual(model.getLineContent(6), "    ");
      moveTo(editor, viewModel, 7, 15, false);
      assertCursor(viewModel, new Selection(7, 15, 7, 15));
      viewModel.type("\n", "keyboard");
      assert.deepStrictEqual(model.getLineContent(8), "      ");
      assert.deepStrictEqual(model.getLineContent(9), "    ]");
      moveTo(editor, viewModel, 10, 18, false);
      assertCursor(viewModel, new Selection(10, 18, 10, 18));
      viewModel.type("\n", "keyboard");
      assert.deepStrictEqual(model.getLineContent(11), "    ]");
    });
  });
  test("issue #111128: Multicursor `Enter` issue with indentation", () => {
    const model = createTextModel2("    let a, b, c;", indentRulesLanguageId, { detectIndentation: false, insertSpaces: false, tabSize: 4 });
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      editor.setSelections([
        new Selection(1, 11, 1, 11),
        new Selection(1, 14, 1, 14)
      ]);
      viewModel.type("\n", "keyboard");
      assert.strictEqual(model.getValue(), "    let a,\n	 b,\n	 c;");
    });
  });
  test("issue #122714: tabSize=1 prevent typing a string matching decreaseIndentPattern in an empty file", () => {
    const latextLanguageId = setupIndentRulesLanguage("latex", {
      increaseIndentPattern: new RegExp("\\\\begin{(?!document)([^}]*)}(?!.*\\\\end{\\1})"),
      decreaseIndentPattern: new RegExp("^\\s*\\\\end{(?!document)")
    });
    const model = createTextModel2(
      "\\end",
      latextLanguageId,
      { tabSize: 1 }
    );
    withTestCodeEditor2(model, { autoIndent: "full" }, (editor, viewModel) => {
      moveTo(editor, viewModel, 1, 5, false);
      assertCursor(viewModel, new Selection(1, 5, 1, 5));
      viewModel.type("{", "keyboard");
      assert.strictEqual(model.getLineContent(1), "\\end{}");
    });
  });
  test("ElectricCharacter - does nothing if no electric char", () => {
    usingCursor({
      text: [
        "  if (a) {",
        ""
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 1);
      viewModel.type("*", "keyboard");
      assert.deepStrictEqual(model.getLineContent(2), "*");
    });
  });
  test("ElectricCharacter - indents in order to match bracket", () => {
    usingCursor({
      text: [
        "  if (a) {",
        ""
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 1);
      viewModel.type("}", "keyboard");
      assert.deepStrictEqual(model.getLineContent(2), "  }");
    });
  });
  test("ElectricCharacter - unindents in order to match bracket", () => {
    usingCursor({
      text: [
        "  if (a) {",
        "    "
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 5);
      viewModel.type("}", "keyboard");
      assert.deepStrictEqual(model.getLineContent(2), "  }");
    });
  });
  test("ElectricCharacter - matches with correct bracket", () => {
    usingCursor({
      text: [
        "  if (a) {",
        "    if (b) {",
        "    }",
        "    "
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 4, 1);
      viewModel.type("}", "keyboard");
      assert.deepStrictEqual(model.getLineContent(4), "  }    ");
    });
  });
  test("ElectricCharacter - does nothing if bracket does not match", () => {
    usingCursor({
      text: [
        "  if (a) {",
        "    if (b) {",
        "    }",
        "  }  "
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 4, 6);
      viewModel.type("}", "keyboard");
      assert.deepStrictEqual(model.getLineContent(4), "  }  }");
    });
  });
  test("ElectricCharacter - matches bracket even in line with content", () => {
    usingCursor({
      text: [
        "  if (a) {",
        "// hello"
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 1);
      viewModel.type("}", "keyboard");
      assert.deepStrictEqual(model.getLineContent(2), "  }// hello");
    });
  });
  test("ElectricCharacter - is no-op if bracket is lined up", () => {
    usingCursor({
      text: [
        "  if (a) {",
        "  "
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 3);
      viewModel.type("}", "keyboard");
      assert.deepStrictEqual(model.getLineContent(2), "  }");
    });
  });
  test("ElectricCharacter - is no-op if there is non-whitespace text before", () => {
    usingCursor({
      text: [
        "  if (a) {",
        "a"
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 2);
      viewModel.type("}", "keyboard");
      assert.deepStrictEqual(model.getLineContent(2), "a}");
    });
  });
  test("ElectricCharacter - is no-op if pairs are all matched before", () => {
    usingCursor({
      text: [
        "foo(() => {",
        "  ( 1 + 2 ) ",
        "})"
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 13);
      viewModel.type("*", "keyboard");
      assert.deepStrictEqual(model.getLineContent(2), "  ( 1 + 2 ) *");
    });
  });
  test("ElectricCharacter - is no-op if matching bracket is on the same line", () => {
    usingCursor({
      text: [
        "(div"
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 1, 5);
      let changeText = null;
      const disposable = model.onDidChangeContent((e) => {
        changeText = e.changes[0].text;
      });
      viewModel.type(")", "keyboard");
      assert.deepStrictEqual(model.getLineContent(1), "(div)");
      assert.deepStrictEqual(changeText, ")");
      disposable.dispose();
    });
  });
  test("ElectricCharacter - is no-op if the line has other content", () => {
    usingCursor({
      text: [
        "Math.max(",
        "	2",
        "	3"
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 3, 3);
      viewModel.type(")", "keyboard");
      assert.deepStrictEqual(model.getLineContent(3), "	3)");
    });
  });
  test("ElectricCharacter - appends text", () => {
    usingCursor({
      text: [
        "  if (a) {",
        "/*"
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 3);
      viewModel.type("*", "keyboard");
      assert.deepStrictEqual(model.getLineContent(2), "/** */");
    });
  });
  test("ElectricCharacter - appends text 2", () => {
    usingCursor({
      text: [
        "  if (a) {",
        "  /*"
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 5);
      viewModel.type("*", "keyboard");
      assert.deepStrictEqual(model.getLineContent(2), "  /** */");
    });
  });
  test("ElectricCharacter - issue #23711: Replacing selected text with )]} fails to delete old text with backwards-dragged selection", () => {
    usingCursor({
      text: [
        "{",
        "word"
      ],
      languageId: electricCharLanguageId
    }, (editor, model, viewModel) => {
      moveTo(editor, viewModel, 2, 5);
      moveTo(editor, viewModel, 2, 1, true);
      viewModel.type("}", "keyboard");
      assert.deepStrictEqual(model.getLineContent(2), "}");
    });
  });
  test("issue #61070: backtick (`) should auto-close after a word character", () => {
    usingCursor({
      text: ["const markup = highlight"],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      model.tokenization.forceTokenization(1);
      assertType(editor, model, viewModel, 1, 25, "`", "``", `auto closes \` @ (1, 25)`);
    });
  });
  test("issue #132912: quotes should not auto-close if they are closing a string", () => {
    setupAutoClosingLanguageTokenization();
    const model = createTextModel2("const t2 = `something ${t1}", autoClosingLanguageId);
    withTestCodeEditor2(
      model,
      {},
      (editor, viewModel) => {
        const model2 = viewModel.model;
        model2.tokenization.forceTokenization(1);
        assertType(editor, model2, viewModel, 1, 28, "`", "`", `does not auto close \` @ (1, 28)`);
      }
    );
  });
  test("autoClosingPairs - open parens: default", () => {
    usingCursor({
      text: [
        "var a = [];",
        "var b = `asd`;",
        "var c = 'asd';",
        'var d = "asd";',
        "var e = /*3*/	3;",
        "var f = /** 3 */3;",
        "var g = (3+5);",
        "var h = { a: 'value' };"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      const autoClosePositions = [
        "var| a| |=| [|]|;|",
        "var| b| |=| |`asd|`|;|",
        "var| c| |=| |'asd|'|;|",
        'var| d| |=| |"asd|"|;|',
        "var| e| |=| /*3*/|	3|;|",
        "var| f| |=| /**| 3| */3|;|",
        "var| g| |=| (3+5|)|;|",
        "var| h| |=| {| a|:| |'value|'| |}|;|"
      ];
      for (let i = 0, len = autoClosePositions.length; i < len; i++) {
        const lineNumber = i + 1;
        const autoCloseColumns = extractAutoClosingSpecialColumns(model.getLineMaxColumn(lineNumber), autoClosePositions[i]);
        for (let column = 1; column < autoCloseColumns.length; column++) {
          model.tokenization.forceTokenization(lineNumber);
          if (autoCloseColumns[column] === 1 /* Special1 */) {
            assertType(editor, model, viewModel, lineNumber, column, "(", "()", `auto closes @ (${lineNumber}, ${column})`);
          } else {
            assertType(editor, model, viewModel, lineNumber, column, "(", "(", `does not auto close @ (${lineNumber}, ${column})`);
          }
        }
      }
    });
  });
  test("autoClosingPairs - open parens: whitespace", () => {
    usingCursor({
      text: [
        "var a = [];",
        "var b = `asd`;",
        "var c = 'asd';",
        'var d = "asd";',
        "var e = /*3*/	3;",
        "var f = /** 3 */3;",
        "var g = (3+5);",
        "var h = { a: 'value' };"
      ],
      languageId: autoClosingLanguageId,
      editorOpts: {
        autoClosingBrackets: "beforeWhitespace"
      }
    }, (editor, model, viewModel) => {
      const autoClosePositions = [
        "var| a| =| [|];|",
        "var| b| =| `asd`;|",
        "var| c| =| 'asd';|",
        'var| d| =| "asd";|',
        "var| e| =| /*3*/|	3;|",
        "var| f| =| /**| 3| */3;|",
        "var| g| =| (3+5|);|",
        "var| h| =| {| a:| 'value'| |};|"
      ];
      for (let i = 0, len = autoClosePositions.length; i < len; i++) {
        const lineNumber = i + 1;
        const autoCloseColumns = extractAutoClosingSpecialColumns(model.getLineMaxColumn(lineNumber), autoClosePositions[i]);
        for (let column = 1; column < autoCloseColumns.length; column++) {
          model.tokenization.forceTokenization(lineNumber);
          if (autoCloseColumns[column] === 1 /* Special1 */) {
            assertType(editor, model, viewModel, lineNumber, column, "(", "()", `auto closes @ (${lineNumber}, ${column})`);
          } else {
            assertType(editor, model, viewModel, lineNumber, column, "(", "(", `does not auto close @ (${lineNumber}, ${column})`);
          }
        }
      }
    });
  });
  test("autoClosingPairs - open parens disabled/enabled open quotes enabled/disabled", () => {
    usingCursor({
      text: [
        "var a = [];"
      ],
      languageId: autoClosingLanguageId,
      editorOpts: {
        autoClosingBrackets: "beforeWhitespace",
        autoClosingQuotes: "never"
      }
    }, (editor, model, viewModel) => {
      const autoClosePositions = [
        "var| a| =| [|];|"
      ];
      for (let i = 0, len = autoClosePositions.length; i < len; i++) {
        const lineNumber = i + 1;
        const autoCloseColumns = extractAutoClosingSpecialColumns(model.getLineMaxColumn(lineNumber), autoClosePositions[i]);
        for (let column = 1; column < autoCloseColumns.length; column++) {
          model.tokenization.forceTokenization(lineNumber);
          if (autoCloseColumns[column] === 1 /* Special1 */) {
            assertType(editor, model, viewModel, lineNumber, column, "(", "()", `auto closes @ (${lineNumber}, ${column})`);
          } else {
            assertType(editor, model, viewModel, lineNumber, column, "(", "(", `does not auto close @ (${lineNumber}, ${column})`);
          }
          assertType(editor, model, viewModel, lineNumber, column, "'", "'", `does not auto close @ (${lineNumber}, ${column})`);
        }
      }
    });
    usingCursor({
      text: [
        "var b = [];"
      ],
      languageId: autoClosingLanguageId,
      editorOpts: {
        autoClosingBrackets: "never",
        autoClosingQuotes: "beforeWhitespace"
      }
    }, (editor, model, viewModel) => {
      const autoClosePositions = [
        "var b =| [|];|"
      ];
      for (let i = 0, len = autoClosePositions.length; i < len; i++) {
        const lineNumber = i + 1;
        const autoCloseColumns = extractAutoClosingSpecialColumns(model.getLineMaxColumn(lineNumber), autoClosePositions[i]);
        for (let column = 1; column < autoCloseColumns.length; column++) {
          model.tokenization.forceTokenization(lineNumber);
          if (autoCloseColumns[column] === 1 /* Special1 */) {
            assertType(editor, model, viewModel, lineNumber, column, "'", "''", `auto closes @ (${lineNumber}, ${column})`);
          } else {
            assertType(editor, model, viewModel, lineNumber, column, "'", "'", `does not auto close @ (${lineNumber}, ${column})`);
          }
          assertType(editor, model, viewModel, lineNumber, column, "(", "(", `does not auto close @ (${lineNumber}, ${column})`);
        }
      }
    });
  });
  test("autoClosingPairs - configurable open parens", () => {
    setAutoClosingLanguageEnabledSet("abc");
    usingCursor({
      text: [
        "var a = [];",
        "var b = `asd`;",
        "var c = 'asd';",
        'var d = "asd";',
        "var e = /*3*/	3;",
        "var f = /** 3 */3;",
        "var g = (3+5);",
        "var h = { a: 'value' };"
      ],
      languageId: autoClosingLanguageId,
      editorOpts: {
        autoClosingBrackets: "languageDefined"
      }
    }, (editor, model, viewModel) => {
      const autoClosePositions = [
        "v|ar |a = [|];|",
        "v|ar |b = `|asd`;|",
        "v|ar |c = '|asd';|",
        'v|ar d = "|asd";|',
        "v|ar e = /*3*/	3;|",
        "v|ar f = /** 3| */3;|",
        "v|ar g = (3+5|);|",
        "v|ar h = { |a: 'v|alue' |};|"
      ];
      for (let i = 0, len = autoClosePositions.length; i < len; i++) {
        const lineNumber = i + 1;
        const autoCloseColumns = extractAutoClosingSpecialColumns(model.getLineMaxColumn(lineNumber), autoClosePositions[i]);
        for (let column = 1; column < autoCloseColumns.length; column++) {
          model.tokenization.forceTokenization(lineNumber);
          if (autoCloseColumns[column] === 1 /* Special1 */) {
            assertType(editor, model, viewModel, lineNumber, column, "(", "()", `auto closes @ (${lineNumber}, ${column})`);
          } else {
            assertType(editor, model, viewModel, lineNumber, column, "(", "(", `does not auto close @ (${lineNumber}, ${column})`);
          }
        }
      }
    });
  });
  test("autoClosingPairs - auto-pairing can be disabled", () => {
    usingCursor({
      text: [
        "var a = [];",
        "var b = `asd`;",
        "var c = 'asd';",
        'var d = "asd";',
        "var e = /*3*/	3;",
        "var f = /** 3 */3;",
        "var g = (3+5);",
        "var h = { a: 'value' };"
      ],
      languageId: autoClosingLanguageId,
      editorOpts: {
        autoClosingBrackets: "never",
        autoClosingQuotes: "never"
      }
    }, (editor, model, viewModel) => {
      const autoClosePositions = [
        "var a = [];",
        "var b = `asd`;",
        "var c = 'asd';",
        'var d = "asd";',
        "var e = /*3*/	3;",
        "var f = /** 3 */3;",
        "var g = (3+5);",
        "var h = { a: 'value' };"
      ];
      for (let i = 0, len = autoClosePositions.length; i < len; i++) {
        const lineNumber = i + 1;
        const autoCloseColumns = extractAutoClosingSpecialColumns(model.getLineMaxColumn(lineNumber), autoClosePositions[i]);
        for (let column = 1; column < autoCloseColumns.length; column++) {
          model.tokenization.forceTokenization(lineNumber);
          if (autoCloseColumns[column] === 1 /* Special1 */) {
            assertType(editor, model, viewModel, lineNumber, column, "(", "()", `auto closes @ (${lineNumber}, ${column})`);
            assertType(editor, model, viewModel, lineNumber, column, '"', '""', `auto closes @ (${lineNumber}, ${column})`);
          } else {
            assertType(editor, model, viewModel, lineNumber, column, "(", "(", `does not auto close @ (${lineNumber}, ${column})`);
            assertType(editor, model, viewModel, lineNumber, column, '"', '"', `does not auto close @ (${lineNumber}, ${column})`);
          }
        }
      }
    });
  });
  test("autoClosingPairs - auto wrapping is configurable", () => {
    usingCursor({
      text: [
        "var a = asd"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(1, 1, 1, 4),
        new Selection(1, 9, 1, 12)
      ]);
      viewModel.type("`", "keyboard");
      assert.strictEqual(model.getValue(), "`var` a = `asd`");
      viewModel.type("(", "keyboard");
      assert.strictEqual(model.getValue(), "`(var)` a = `(asd)`");
    });
    usingCursor({
      text: [
        "var a = asd"
      ],
      languageId: autoClosingLanguageId,
      editorOpts: {
        autoSurround: "never"
      }
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(1, 1, 1, 4)
      ]);
      viewModel.type("`", "keyboard");
      assert.strictEqual(model.getValue(), "` a = asd");
    });
    usingCursor({
      text: [
        "var a = asd"
      ],
      languageId: autoClosingLanguageId,
      editorOpts: {
        autoSurround: "quotes"
      }
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(1, 1, 1, 4)
      ]);
      viewModel.type("`", "keyboard");
      assert.strictEqual(model.getValue(), "`var` a = asd");
      viewModel.type("(", "keyboard");
      assert.strictEqual(model.getValue(), "`(` a = asd");
    });
    usingCursor({
      text: [
        "var a = asd"
      ],
      languageId: autoClosingLanguageId,
      editorOpts: {
        autoSurround: "brackets"
      }
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(1, 1, 1, 4)
      ]);
      viewModel.type("(", "keyboard");
      assert.strictEqual(model.getValue(), "(var) a = asd");
      viewModel.type("`", "keyboard");
      assert.strictEqual(model.getValue(), "(`) a = asd");
    });
  });
  test("autoClosingPairs - quote", () => {
    usingCursor({
      text: [
        "var a = [];",
        "var b = `asd`;",
        "var c = 'asd';",
        'var d = "asd";',
        "var e = /*3*/	3;",
        "var f = /** 3 */3;",
        "var g = (3+5);",
        "var h = { a: 'value' };"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      const autoClosePositions = [
        "var a |=| [|]|;|",
        "var b |=| `asd`|;|",
        "var c |=| 'asd'|;|",
        'var d |=| "asd"|;|',
        "var e |=| /*3*/|	3;|",
        "var f |=| /**| 3 */3;|",
        "var g |=| (3+5)|;|",
        "var h |=| {| a:| 'value'| |}|;|"
      ];
      for (let i = 0, len = autoClosePositions.length; i < len; i++) {
        const lineNumber = i + 1;
        const autoCloseColumns = extractAutoClosingSpecialColumns(model.getLineMaxColumn(lineNumber), autoClosePositions[i]);
        for (let column = 1; column < autoCloseColumns.length; column++) {
          model.tokenization.forceTokenization(lineNumber);
          if (autoCloseColumns[column] === 1 /* Special1 */) {
            assertType(editor, model, viewModel, lineNumber, column, "'", "''", `auto closes @ (${lineNumber}, ${column})`);
          } else if (autoCloseColumns[column] === 2 /* Special2 */) {
            assertType(editor, model, viewModel, lineNumber, column, "'", "", `over types @ (${lineNumber}, ${column})`);
          } else {
            assertType(editor, model, viewModel, lineNumber, column, "'", "'", `does not auto close @ (${lineNumber}, ${column})`);
          }
        }
      }
    });
  });
  test("autoClosingPairs - multi-character autoclose", () => {
    usingCursor({
      text: [
        ""
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      model.setValue("begi");
      viewModel.setSelections("test", [new Selection(1, 5, 1, 5)]);
      viewModel.type("n", "keyboard");
      assert.strictEqual(model.getLineContent(1), "beginend");
      model.setValue("/*");
      viewModel.setSelections("test", [new Selection(1, 3, 1, 3)]);
      viewModel.type("*", "keyboard");
      assert.strictEqual(model.getLineContent(1), "/** */");
    });
  });
  test("autoClosingPairs - doc comments can be turned off", () => {
    usingCursor({
      text: [
        ""
      ],
      languageId: autoClosingLanguageId,
      editorOpts: {
        autoClosingComments: "never"
      }
    }, (editor, model, viewModel) => {
      model.setValue("/*");
      viewModel.setSelections("test", [new Selection(1, 3, 1, 3)]);
      viewModel.type("*", "keyboard");
      assert.strictEqual(model.getLineContent(1), "/**");
    });
  });
  test("issue #72177: multi-character autoclose with conflicting patterns", () => {
    const languageId = "autoClosingModeMultiChar";
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      autoClosingPairs: [
        { open: "(", close: ")" },
        { open: "(*", close: "*)" },
        { open: "<@", close: "@>" },
        { open: "<@@", close: "@@>" }
      ]
    }));
    usingCursor({
      text: [
        ""
      ],
      languageId
    }, (editor, model, viewModel) => {
      viewModel.type("(", "keyboard");
      assert.strictEqual(model.getLineContent(1), "()");
      viewModel.type("*", "keyboard");
      assert.strictEqual(model.getLineContent(1), "(**)", `doesn't add entire close when already closed substring is there`);
      model.setValue("(");
      viewModel.setSelections("test", [new Selection(1, 2, 1, 2)]);
      viewModel.type("*", "keyboard");
      assert.strictEqual(model.getLineContent(1), "(**)", `does add entire close if not already there`);
      model.setValue("");
      viewModel.type("<@", "keyboard");
      assert.strictEqual(model.getLineContent(1), "<@@>");
      viewModel.type("@", "keyboard");
      assert.strictEqual(model.getLineContent(1), "<@@@@>", `autocloses when before multi-character closing brace`);
      viewModel.type("(", "keyboard");
      assert.strictEqual(model.getLineContent(1), "<@@()@@>", `autocloses when before multi-character closing brace`);
    });
  });
  test("issue #55314: Do not auto-close when ending with open", () => {
    const languageId = "myElectricMode";
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      autoClosingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: "'", close: "'", notIn: ["string", "comment"] },
        { open: '"', close: '"', notIn: ["string"] },
        { open: 'B"', close: '"', notIn: ["string", "comment"] },
        { open: "`", close: "`", notIn: ["string", "comment"] },
        { open: "/**", close: " */", notIn: ["string"] }
      ]
    }));
    usingCursor({
      text: [
        "little goat",
        "little LAMB",
        "little sheep",
        "Big LAMB"
      ],
      languageId
    }, (editor, model, viewModel) => {
      model.tokenization.forceTokenization(model.getLineCount());
      assertType(editor, model, viewModel, 1, 4, '"', '"', `does not double quote when ending with open`);
      model.tokenization.forceTokenization(model.getLineCount());
      assertType(editor, model, viewModel, 2, 4, '"', '"', `does not double quote when ending with open`);
      model.tokenization.forceTokenization(model.getLineCount());
      assertType(editor, model, viewModel, 3, 4, '"', '"', `does not double quote when ending with open`);
      model.tokenization.forceTokenization(model.getLineCount());
      assertType(editor, model, viewModel, 4, 2, '"', '"', `does not double quote when ending with open`);
      model.tokenization.forceTokenization(model.getLineCount());
      assertType(editor, model, viewModel, 4, 3, '"', '"', `does not double quote when ending with open`);
    });
  });
  test("issue #27937: Trying to add an item to the front of a list is cumbersome", () => {
    usingCursor({
      text: [
        'var arr = ["b", "c"];'
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      assertType(editor, model, viewModel, 1, 12, '"', '"', `does not over type and will not auto close`);
    });
  });
  test("issue #25658 - Do not auto-close single/double quotes after word characters", () => {
    usingCursor({
      text: [
        ""
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      function typeCharacters(viewModel2, chars) {
        for (let i = 0, len = chars.length; i < len; i++) {
          viewModel2.type(chars[i], "keyboard");
        }
      }
      model.tokenization.forceTokenization(model.getLineCount());
      typeCharacters(viewModel, "teste1 = teste' ok");
      assert.strictEqual(model.getLineContent(1), "teste1 = teste' ok");
      viewModel.setSelections("test", [new Selection(1, 1e3, 1, 1e3)]);
      typeCharacters(viewModel, "\n");
      model.tokenization.forceTokenization(model.getLineCount());
      typeCharacters(viewModel, "teste2 = teste 'ok");
      assert.strictEqual(model.getLineContent(2), "teste2 = teste 'ok'");
      viewModel.setSelections("test", [new Selection(2, 1e3, 2, 1e3)]);
      typeCharacters(viewModel, "\n");
      model.tokenization.forceTokenization(model.getLineCount());
      typeCharacters(viewModel, 'teste3 = teste" ok');
      assert.strictEqual(model.getLineContent(3), 'teste3 = teste" ok');
      viewModel.setSelections("test", [new Selection(3, 1e3, 3, 1e3)]);
      typeCharacters(viewModel, "\n");
      model.tokenization.forceTokenization(model.getLineCount());
      typeCharacters(viewModel, 'teste4 = teste "ok');
      assert.strictEqual(model.getLineContent(4), 'teste4 = teste "ok"');
      viewModel.setSelections("test", [new Selection(4, 1e3, 4, 1e3)]);
      typeCharacters(viewModel, "\n");
      model.tokenization.forceTokenization(model.getLineCount());
      typeCharacters(viewModel, "teste '");
      assert.strictEqual(model.getLineContent(5), "teste ''");
      viewModel.setSelections("test", [new Selection(5, 1e3, 5, 1e3)]);
      typeCharacters(viewModel, "\n");
      model.tokenization.forceTokenization(model.getLineCount());
      typeCharacters(viewModel, 'teste "');
      assert.strictEqual(model.getLineContent(6), 'teste ""');
      viewModel.setSelections("test", [new Selection(6, 1e3, 6, 1e3)]);
      typeCharacters(viewModel, "\n");
      model.tokenization.forceTokenization(model.getLineCount());
      typeCharacters(viewModel, "teste'");
      assert.strictEqual(model.getLineContent(7), "teste'");
      viewModel.setSelections("test", [new Selection(7, 1e3, 7, 1e3)]);
      typeCharacters(viewModel, "\n");
      model.tokenization.forceTokenization(model.getLineCount());
      typeCharacters(viewModel, 'teste"');
      assert.strictEqual(model.getLineContent(8), 'teste"');
    });
  });
  test("issue #37315 - overtypes only those characters that it inserted", () => {
    usingCursor({
      text: [
        "",
        "y=();"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      assertCursor(viewModel, new Position(1, 1));
      viewModel.type("x=(", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=()");
      viewModel.type("asd", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=(asd)");
      viewModel.type(")", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=(asd)");
      viewModel.setSelections("test", [new Selection(2, 4, 2, 4)]);
      viewModel.type(")", "keyboard");
      assert.strictEqual(model.getLineContent(2), "y=());");
    });
  });
  test("issue #37315 - stops overtyping once cursor leaves area", () => {
    usingCursor({
      text: [
        "",
        "y=();"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      assertCursor(viewModel, new Position(1, 1));
      viewModel.type("x=(", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=()");
      viewModel.setSelections("test", [new Selection(1, 5, 1, 5)]);
      viewModel.type(")", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=())");
    });
  });
  test("issue #37315 - it overtypes only once", () => {
    usingCursor({
      text: [
        "",
        "y=();"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      assertCursor(viewModel, new Position(1, 1));
      viewModel.type("x=(", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=()");
      viewModel.type(")", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=()");
      viewModel.setSelections("test", [new Selection(1, 4, 1, 4)]);
      viewModel.type(")", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=())");
    });
  });
  test("issue #37315 - it can remember multiple auto-closed instances", () => {
    usingCursor({
      text: [
        "",
        "y=();"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      assertCursor(viewModel, new Position(1, 1));
      viewModel.type("x=(", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=()");
      viewModel.type("(", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=(())");
      viewModel.type(")", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=(())");
      viewModel.type(")", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=(())");
    });
  });
  test("issue #118270 - auto closing deletes only those characters that it inserted", () => {
    usingCursor({
      text: [
        "",
        "y=();"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      assertCursor(viewModel, new Position(1, 1));
      viewModel.type("x=(", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=()");
      viewModel.type("asd", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=(asd)");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(1), "x=()");
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(1), "x=");
      viewModel.setSelections("test", [new Selection(2, 4, 2, 4)]);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(2), "y=);");
    });
  });
  test("issue #78527 - does not close quote on odd count", () => {
    usingCursor({
      text: [
        `std::cout << '"' << entryMap`
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 29, 1, 29)]);
      viewModel.type("[", "keyboard");
      assert.strictEqual(model.getLineContent(1), `std::cout << '"' << entryMap[]`);
      viewModel.type('"', "keyboard");
      assert.strictEqual(model.getLineContent(1), `std::cout << '"' << entryMap[""]`);
      viewModel.type("a", "keyboard");
      assert.strictEqual(model.getLineContent(1), `std::cout << '"' << entryMap["a"]`);
      viewModel.type('"', "keyboard");
      assert.strictEqual(model.getLineContent(1), `std::cout << '"' << entryMap["a"]`);
      viewModel.type("]", "keyboard");
      assert.strictEqual(model.getLineContent(1), `std::cout << '"' << entryMap["a"]`);
    });
  });
  test("issue #85983 - editor.autoClosingBrackets: beforeWhitespace is incorrect for Python", () => {
    const languageId = "pythonMode";
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      autoClosingPairs: [
        { open: "{", close: "}" },
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: '"', close: '"', notIn: ["string"] },
        { open: 'r"', close: '"', notIn: ["string", "comment"] },
        { open: 'R"', close: '"', notIn: ["string", "comment"] },
        { open: 'u"', close: '"', notIn: ["string", "comment"] },
        { open: 'U"', close: '"', notIn: ["string", "comment"] },
        { open: 'f"', close: '"', notIn: ["string", "comment"] },
        { open: 'F"', close: '"', notIn: ["string", "comment"] },
        { open: 'b"', close: '"', notIn: ["string", "comment"] },
        { open: 'B"', close: '"', notIn: ["string", "comment"] },
        { open: "'", close: "'", notIn: ["string", "comment"] },
        { open: "r'", close: "'", notIn: ["string", "comment"] },
        { open: "R'", close: "'", notIn: ["string", "comment"] },
        { open: "u'", close: "'", notIn: ["string", "comment"] },
        { open: "U'", close: "'", notIn: ["string", "comment"] },
        { open: "f'", close: "'", notIn: ["string", "comment"] },
        { open: "F'", close: "'", notIn: ["string", "comment"] },
        { open: "b'", close: "'", notIn: ["string", "comment"] },
        { open: "B'", close: "'", notIn: ["string", "comment"] },
        { open: "`", close: "`", notIn: ["string"] }
      ]
    }));
    usingCursor({
      text: [
        "foo'hello'"
      ],
      editorOpts: {
        autoClosingBrackets: "beforeWhitespace"
      },
      languageId
    }, (editor, model, viewModel) => {
      assertType(editor, model, viewModel, 1, 4, "(", "(", `does not auto close @ (1, 4)`);
    });
  });
  test("issue #78975 - Parentheses swallowing does not work when parentheses are inserted by autocomplete", () => {
    usingCursor({
      text: [
        "<div id"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 8, 1, 8)]);
      viewModel.executeEdits("snippet", [{ range: new Range(1, 6, 1, 8), text: 'id=""' }], () => [new Selection(1, 10, 1, 10)], EditSources.unknown({}));
      assert.strictEqual(model.getLineContent(1), '<div id=""');
      viewModel.type("a", "keyboard");
      assert.strictEqual(model.getLineContent(1), '<div id="a"');
      viewModel.type('"', "keyboard");
      assert.strictEqual(model.getLineContent(1), '<div id="a"');
    });
  });
  test("issue #78833 - Add config to use old brackets/quotes overtyping", () => {
    usingCursor({
      text: [
        "",
        "y=();"
      ],
      languageId: autoClosingLanguageId,
      editorOpts: {
        autoClosingOvertype: "always"
      }
    }, (editor, model, viewModel) => {
      assertCursor(viewModel, new Position(1, 1));
      viewModel.type("x=(", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=()");
      viewModel.type(")", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=()");
      viewModel.setSelections("test", [new Selection(1, 4, 1, 4)]);
      viewModel.type(")", "keyboard");
      assert.strictEqual(model.getLineContent(1), "x=()");
      viewModel.setSelections("test", [new Selection(2, 4, 2, 4)]);
      viewModel.type(")", "keyboard");
      assert.strictEqual(model.getLineContent(2), "y=();");
    });
  });
  test("issue #15825: accents on mac US intl keyboard", () => {
    usingCursor({
      text: [],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      assertCursor(viewModel, new Position(1, 1));
      viewModel.startComposition();
      viewModel.type("`", "keyboard");
      viewModel.compositionType("\xE8", 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(), "\xE8");
    });
  });
  test("issue #90016: allow accents on mac US intl keyboard to surround selection", () => {
    usingCursor({
      text: [
        "test"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 1, 1, 5)]);
      viewModel.startComposition();
      viewModel.type("'", "keyboard");
      viewModel.compositionType("'", 1, 0, 0, "keyboard");
      viewModel.compositionType("'", 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(), "'test'");
    });
  });
  test("issue #53357: Over typing ignores characters after backslash", () => {
    usingCursor({
      text: [
        "console.log();"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 13, 1, 13)]);
      viewModel.type("'", "keyboard");
      assert.strictEqual(model.getValue(), "console.log('');");
      viewModel.type("it", "keyboard");
      assert.strictEqual(model.getValue(), "console.log('it');");
      viewModel.type("\\", "keyboard");
      assert.strictEqual(model.getValue(), "console.log('it\\');");
      viewModel.type("'", "keyboard");
      assert.strictEqual(model.getValue(), "console.log('it\\'');");
    });
  });
  test("issue #84998: Overtyping Brackets doesn't work after backslash", () => {
    usingCursor({
      text: [
        ""
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 1, 1, 1)]);
      viewModel.type("\\", "keyboard");
      assert.strictEqual(model.getValue(), "\\");
      viewModel.type("(", "keyboard");
      assert.strictEqual(model.getValue(), "\\()");
      viewModel.type("abc", "keyboard");
      assert.strictEqual(model.getValue(), "\\(abc)");
      viewModel.type("\\", "keyboard");
      assert.strictEqual(model.getValue(), "\\(abc\\)");
      viewModel.type(")", "keyboard");
      assert.strictEqual(model.getValue(), "\\(abc\\)");
    });
  });
  test("issue #2773: Accents (\xB4`\xA8^, others?) are inserted in the wrong position (Mac)", () => {
    usingCursor({
      text: [
        "hello",
        "world"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      assertCursor(viewModel, new Position(1, 1));
      viewModel.startComposition();
      viewModel.type("`", "keyboard");
      moveDown(editor, viewModel, true);
      viewModel.compositionType("`", 1, 0, 0, "keyboard");
      viewModel.compositionType("`", 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(), "`hello\nworld");
      assertCursor(viewModel, new Selection(1, 2, 2, 2));
    });
  });
  test("issue #26820: auto close quotes when not used as accents", () => {
    usingCursor({
      text: [
        ""
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      assertCursor(viewModel, new Position(1, 1));
      viewModel.startComposition();
      viewModel.type("'", "keyboard");
      viewModel.compositionType("'", 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(), "''");
      viewModel.startComposition();
      viewModel.type("'", "keyboard");
      viewModel.compositionType("'", 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(), "''");
      model.setValue("'abc");
      viewModel.setSelections("test", [new Selection(1, 5, 1, 5)]);
      viewModel.startComposition();
      viewModel.type("'", "keyboard");
      viewModel.compositionType("'", 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(), "'abc'");
      model.setValue("'abc'def ");
      viewModel.setSelections("test", [new Selection(1, 10, 1, 10)]);
      viewModel.startComposition();
      viewModel.type("'", "keyboard");
      viewModel.compositionType("'", 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(), "'abc'def ''");
      model.setValue("abc");
      viewModel.setSelections("test", [new Selection(1, 1, 1, 1)]);
      viewModel.startComposition();
      viewModel.type("'", "keyboard");
      viewModel.compositionType("'", 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      model.setValue("abc");
      viewModel.setSelections("test", [new Selection(1, 4, 1, 4)]);
      viewModel.startComposition();
      viewModel.type("'", "keyboard");
      viewModel.compositionType("'", 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(), "abc'");
    });
  });
  test("issue #144690: Quotes do not overtype when using US Intl PC keyboard layout", () => {
    usingCursor({
      text: [
        ""
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      assertCursor(viewModel, new Position(1, 1));
      viewModel.startComposition();
      viewModel.type(`'`, "keyboard");
      viewModel.compositionType(`'`, 1, 0, 0, "keyboard");
      viewModel.compositionType(`'`, 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      viewModel.startComposition();
      viewModel.type(`'`, "keyboard");
      viewModel.compositionType(`';`, 1, 0, 0, "keyboard");
      viewModel.compositionType(`';`, 2, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(), `'';`);
    });
  });
  test("issue #144693: Typing a quote using US Intl PC keyboard layout always surrounds words", () => {
    usingCursor({
      text: [
        "const hello = 3;"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 7, 1, 12)]);
      viewModel.startComposition();
      viewModel.type(`'`, "keyboard");
      viewModel.compositionType(`\xE9`, 1, 0, 0, "keyboard");
      viewModel.compositionType(`\xE9`, 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(), `const \xE9 = 3;`);
    });
  });
  test("issue #82701: auto close does not execute when IME is canceled via backspace", () => {
    usingCursor({
      text: [
        "{}"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 2, 1, 2)]);
      viewModel.startComposition();
      viewModel.type("a", "keyboard");
      viewModel.compositionType("", 1, 0, 0, "keyboard");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(), "{}");
    });
  });
  test("issue #20891: All cursors should do the same thing", () => {
    usingCursor({
      text: [
        "var a = asd"
      ],
      languageId: autoClosingLanguageId
    }, (editor, model, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(1, 9, 1, 9),
        new Selection(1, 12, 1, 12)
      ]);
      viewModel.type("`", "keyboard");
      assert.strictEqual(model.getValue(), "var a = `asd`");
    });
  });
  test("issue #41825: Special handling of quotes in surrounding pairs", () => {
    const languageId = "myMode";
    disposables.add(languageService.registerLanguage({ id: languageId }));
    disposables.add(languageConfigurationService.register(languageId, {
      surroundingPairs: [
        { open: '"', close: '"' },
        { open: "'", close: "'" }
      ]
    }));
    const model = createTextModel2("var x = 'hi';", languageId);
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      editor.setSelections([
        new Selection(1, 9, 1, 10),
        new Selection(1, 12, 1, 13)
      ]);
      viewModel.type('"', "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), 'var x = "hi";', "assert1");
      editor.setSelections([
        new Selection(1, 9, 1, 10),
        new Selection(1, 12, 1, 13)
      ]);
      viewModel.type("'", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "var x = 'hi';", "assert2");
    });
  });
  test("All cursors should do the same thing when deleting left", () => {
    const model = createTextModel2(
      [
        "var a = ()"
      ].join("\n"),
      autoClosingLanguageId
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(1, 4, 1, 4),
        new Selection(1, 10, 1, 10)
      ]);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getValue(), "va a = )");
    });
  });
  test("issue #7100: Mouse word selection is strange when non-word character is at the end of line", () => {
    const model = createTextModel2(
      [
        "before.a",
        "before",
        "hello:",
        "there:",
        "this is strange:",
        "here",
        "it",
        "is"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      editor.runCommand(CoreNavigationCommands.WordSelect, {
        position: new Position(3, 7)
      });
      assertCursor(viewModel, new Selection(3, 7, 3, 7));
      editor.runCommand(CoreNavigationCommands.WordSelectDrag, {
        position: new Position(4, 7)
      });
      assertCursor(viewModel, new Selection(3, 7, 4, 7));
    });
  });
  test("issue #112039: shift-continuing a double/triple-click and drag selection does not remember its starting mode", () => {
    const model = createTextModel2(
      [
        "just some text",
        "and another line",
        "and another one"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      editor.runCommand(CoreNavigationCommands.WordSelect, {
        position: new Position(2, 6)
      });
      editor.runCommand(CoreNavigationCommands.MoveToSelect, {
        position: new Position(1, 8)
      });
      assertCursor(viewModel, new Selection(2, 12, 1, 6));
    });
  });
  test("issue #158236: Shift click selection does not work on line number indicator", () => {
    const model = createTextModel2(
      [
        "just some text",
        "and another line",
        "and another one"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor, viewModel) => {
      editor.runCommand(CoreNavigationCommands.MoveTo, {
        position: new Position(3, 5)
      });
      editor.runCommand(CoreNavigationCommands.LineSelectDrag, {
        position: new Position(2, 1)
      });
      assertCursor(viewModel, new Selection(3, 5, 2, 1));
    });
  });
  test("issue #111513: Text gets automatically selected when typing at the same location in another editor", () => {
    const model = createTextModel2(
      [
        "just",
        "",
        "some text"
      ].join("\n")
    );
    withTestCodeEditor2(model, {}, (editor1, viewModel1) => {
      editor1.setSelections([
        new Selection(2, 1, 2, 1)
      ]);
      withTestCodeEditor2(model, {}, (editor2, viewModel2) => {
        editor2.setSelections([
          new Selection(2, 1, 2, 1)
        ]);
        viewModel2.type("e", "keyboard");
        assertCursor(viewModel2, new Position(2, 2));
        assertCursor(viewModel1, new Position(2, 2));
      });
    });
  });
});
suite("Undo stops", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("there is an undo stop between typing and deleting left", () => {
    const model = createTextModel(
      [
        "A  line",
        "Another line"
      ].join("\n")
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 3, 1, 3)]);
      viewModel.type("first", "keyboard");
      assert.strictEqual(model.getLineContent(1), "A first line");
      assertCursor(viewModel, new Selection(1, 8, 1, 8));
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(1), "A fir line");
      assertCursor(viewModel, new Selection(1, 6, 1, 6));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "A first line");
      assertCursor(viewModel, new Selection(1, 8, 1, 8));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "A  line");
      assertCursor(viewModel, new Selection(1, 3, 1, 3));
    });
    model.dispose();
  });
  test("there is an undo stop between typing and deleting right", () => {
    const model = createTextModel(
      [
        "A  line",
        "Another line"
      ].join("\n")
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 3, 1, 3)]);
      viewModel.type("first", "keyboard");
      assert.strictEqual(model.getLineContent(1), "A first line");
      assertCursor(viewModel, new Selection(1, 8, 1, 8));
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      assert.strictEqual(model.getLineContent(1), "A firstine");
      assertCursor(viewModel, new Selection(1, 8, 1, 8));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "A first line");
      assertCursor(viewModel, new Selection(1, 8, 1, 8));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "A  line");
      assertCursor(viewModel, new Selection(1, 3, 1, 3));
    });
    model.dispose();
  });
  test("there is an undo stop between deleting left and typing", () => {
    const model = createTextModel(
      [
        "A  line",
        "Another line"
      ].join("\n")
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(2, 8, 2, 8)]);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(2), " line");
      assertCursor(viewModel, new Selection(2, 1, 2, 1));
      viewModel.type("Second", "keyboard");
      assert.strictEqual(model.getLineContent(2), "Second line");
      assertCursor(viewModel, new Selection(2, 7, 2, 7));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), " line");
      assertCursor(viewModel, new Selection(2, 1, 2, 1));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "Another line");
      assertCursor(viewModel, new Selection(2, 8, 2, 8));
    });
    model.dispose();
  });
  test("there is an undo stop between deleting left and deleting right", () => {
    const model = createTextModel(
      [
        "A  line",
        "Another line"
      ].join("\n")
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(2, 8, 2, 8)]);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(2), " line");
      assertCursor(viewModel, new Selection(2, 1, 2, 1));
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      assert.strictEqual(model.getLineContent(2), "");
      assertCursor(viewModel, new Selection(2, 1, 2, 1));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), " line");
      assertCursor(viewModel, new Selection(2, 1, 2, 1));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "Another line");
      assertCursor(viewModel, new Selection(2, 8, 2, 8));
    });
    model.dispose();
  });
  test("there is an undo stop between deleting right and typing", () => {
    const model = createTextModel(
      [
        "A  line",
        "Another line"
      ].join("\n")
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(2, 9, 2, 9)]);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      assert.strictEqual(model.getLineContent(2), "Another ");
      assertCursor(viewModel, new Selection(2, 9, 2, 9));
      viewModel.type("text", "keyboard");
      assert.strictEqual(model.getLineContent(2), "Another text");
      assertCursor(viewModel, new Selection(2, 13, 2, 13));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "Another ");
      assertCursor(viewModel, new Selection(2, 9, 2, 9));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "Another line");
      assertCursor(viewModel, new Selection(2, 9, 2, 9));
    });
    model.dispose();
  });
  test("there is an undo stop between deleting right and deleting left", () => {
    const model = createTextModel(
      [
        "A  line",
        "Another line"
      ].join("\n")
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(2, 9, 2, 9)]);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      editor.runCommand(CoreEditingCommands.DeleteRight, null);
      assert.strictEqual(model.getLineContent(2), "Another ");
      assertCursor(viewModel, new Selection(2, 9, 2, 9));
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      editor.runCommand(CoreEditingCommands.DeleteLeft, null);
      assert.strictEqual(model.getLineContent(2), "An");
      assertCursor(viewModel, new Selection(2, 3, 2, 3));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "Another ");
      assertCursor(viewModel, new Selection(2, 9, 2, 9));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(2), "Another line");
      assertCursor(viewModel, new Selection(2, 9, 2, 9));
    });
    model.dispose();
  });
  test("inserts undo stop when typing space", () => {
    const model = createTextModel(
      [
        "A  line",
        "Another line"
      ].join("\n")
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 3, 1, 3)]);
      viewModel.type("first and interesting", "keyboard");
      assert.strictEqual(model.getLineContent(1), "A first and interesting line");
      assertCursor(viewModel, new Selection(1, 24, 1, 24));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "A first and line");
      assertCursor(viewModel, new Selection(1, 12, 1, 12));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "A first line");
      assertCursor(viewModel, new Selection(1, 8, 1, 8));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getLineContent(1), "A  line");
      assertCursor(viewModel, new Selection(1, 3, 1, 3));
    });
    model.dispose();
  });
  test("can undo typing and EOL change in one undo stop", () => {
    const model = createTextModel(
      [
        "A  line",
        "Another line"
      ].join("\n")
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 3, 1, 3)]);
      viewModel.type("first", "keyboard");
      assert.strictEqual(model.getValue(), "A first line\nAnother line");
      assertCursor(viewModel, new Selection(1, 8, 1, 8));
      model.pushEOL(EndOfLineSequence.CRLF);
      assert.strictEqual(model.getValue(), "A first line\r\nAnother line");
      assertCursor(viewModel, new Selection(1, 8, 1, 8));
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(), "A  line\nAnother line");
      assertCursor(viewModel, new Selection(1, 3, 1, 3));
    });
    model.dispose();
  });
  test("issue #93585: Undo multi cursor edit corrupts document", () => {
    const model = createTextModel(
      [
        "hello world",
        "hello world"
      ].join("\n")
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [
        new Selection(2, 7, 2, 12),
        new Selection(1, 7, 1, 12)
      ]);
      viewModel.type("no", "keyboard");
      assert.strictEqual(model.getValue(), "hello no\nhello no");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(), "hello world\nhello world");
    });
    model.dispose();
  });
  test("there is a single undo stop for consecutive whitespaces", () => {
    const model = createTextModel(
      [
        ""
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.type("a", "keyboard");
      viewModel.type("b", "keyboard");
      viewModel.type(" ", "keyboard");
      viewModel.type(" ", "keyboard");
      viewModel.type("c", "keyboard");
      viewModel.type("d", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "ab  cd", "assert1");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "ab  ", "assert2");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "ab", "assert3");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "", "assert4");
    });
    model.dispose();
  });
  test("there is no undo stop after a single whitespace", () => {
    const model = createTextModel(
      [
        ""
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.type("a", "keyboard");
      viewModel.type("b", "keyboard");
      viewModel.type(" ", "keyboard");
      viewModel.type("c", "keyboard");
      viewModel.type("d", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "ab cd", "assert1");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "ab", "assert3");
      editor.runCommand(CoreEditingCommands.Undo, null);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), "", "assert4");
    });
    model.dispose();
  });
});
suite("Overtype Mode", () => {
  setup(() => {
    InputMode.setInputMode("overtype");
  });
  teardown(() => {
    InputMode.setInputMode("insert");
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("simple type", () => {
    const model = createTextModel(
      [
        "123456789",
        "123456789"
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 3, 1, 3)]);
      viewModel.type("a", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), [
        "12a456789",
        "123456789"
      ].join("\n"), "assert1");
      viewModel.setSelections("test", [new Selection(1, 9, 1, 9)]);
      viewModel.type("bbb", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), [
        "12a45678bbb",
        "123456789"
      ].join("\n"), "assert2");
    });
    model.dispose();
  });
  test("multi-line selection type", () => {
    const model = createTextModel(
      [
        "123456789",
        "123456789"
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 5, 2, 3)]);
      viewModel.type("cc", "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), [
        "1234cc456789"
      ].join("\n"), "assert1");
    });
    model.dispose();
  });
  test("simple paste", () => {
    const model = createTextModel(
      [
        "123456789",
        "123456789"
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 5, 1, 5)]);
      viewModel.paste("cc", false);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), [
        "1234cc789",
        "123456789"
      ].join("\n"), "assert1");
      viewModel.setSelections("test", [new Selection(1, 5, 1, 5)]);
      viewModel.paste("dddddddd", false);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), [
        "1234dddddddd",
        "123456789"
      ].join("\n"), "assert2");
    });
    model.dispose();
  });
  test("multi-line selection paste", () => {
    const model = createTextModel(
      [
        "123456789",
        "123456789"
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 5, 2, 3)]);
      viewModel.paste("cc", false);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), [
        "1234cc456789"
      ].join("\n"), "assert1");
    });
    model.dispose();
  });
  test("paste multi-line text", () => {
    const model = createTextModel(
      [
        "123456789",
        "123456789"
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 5, 1, 5)]);
      viewModel.paste([
        "aaaaaaa",
        "bbbbbbb"
      ].join("\n"), false);
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), [
        "1234aaaaaaa",
        "bbbbbbb",
        "123456789"
      ].join("\n"), "assert1");
    });
    model.dispose();
  });
  test("composition type", () => {
    const model = createTextModel(
      [
        "123456789",
        "123456789"
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor(model, {}, (editor, viewModel) => {
      viewModel.setSelections("test", [new Selection(1, 5, 1, 5)]);
      viewModel.startComposition();
      viewModel.compositionType("\u30BB", 0, 0, 0, "keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), [
        "1234\u30BB56789",
        "123456789"
      ].join("\n"), "assert1");
      viewModel.endComposition("keyboard");
      assert.strictEqual(model.getValue(EndOfLinePreference.LF), [
        "1234\u30BB6789",
        "123456789"
      ].join("\n"), "assert1");
    });
    model.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGJyb3dzZXJcXGNvbnRyb2xsZXJcXGN1cnNvci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENvcmVFZGl0aW5nQ29tbWFuZHMsIENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NvcmVDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IElDdXJzb3JQb3NpdGlvbkNoYW5nZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jdXJzb3JFdmVudHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmQsIElDdXJzb3JTdGF0ZUNvbXB1dGVyRGF0YSwgSUVkaXRPcGVyYXRpb25CdWlsZGVyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBNZXRhZGF0YUNvbnN0cywgU3RhbmRhcmRUb2tlblR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZW5jb2RlZFRva2VuQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0LCBJU3RhdGUsIElUb2tlbml6YXRpb25TdXBwb3J0LCBUb2tlbml6YXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSW5kZW50QWN0aW9uLCBJbmRlbnRhdGlvblJ1bGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy9udWxsVG9rZW5pemUuanMnO1xuaW1wb3J0IHsgRW5kT2ZMaW5lUHJlZmVyZW5jZSwgRW5kT2ZMaW5lU2VxdWVuY2UsIElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsL3ZpZXdNb2RlbEltcGwuanMnO1xuaW1wb3J0IHsgT3V0Z29pbmdWaWV3TW9kZWxFdmVudEtpbmQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsRXZlbnREaXNwYXRjaGVyLmpzJztcbmltcG9ydCB7IElUZXN0Q29kZUVkaXRvciwgVGVzdENvZGVFZGl0b3JJbnN0YW50aWF0aW9uT3B0aW9ucywgY3JlYXRlQ29kZUVkaXRvclNlcnZpY2VzLCBpbnN0YW50aWF0ZVRlc3RDb2RlRWRpdG9yLCB3aXRoVGVzdENvZGVFZGl0b3IgfSBmcm9tICcuLi90ZXN0Q29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBJUmVsYXhlZFRleHRNb2RlbENyZWF0aW9uT3B0aW9ucywgY3JlYXRlVGV4dE1vZGVsLCBpbnN0YW50aWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElucHV0TW9kZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9pbnB1dE1vZGUuanMnO1xuaW1wb3J0IHsgRWRpdFNvdXJjZXMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGV4dE1vZGVsRWRpdFNvdXJjZS5qcyc7XG5cbi8vIC0tLS0tLS0tLSB1dGlsc1xuXG5mdW5jdGlvbiBtb3ZlVG8oZWRpdG9yOiBJVGVzdENvZGVFZGl0b3IsIHZpZXdNb2RlbDogVmlld01vZGVsLCBsaW5lTnVtYmVyOiBudW1iZXIsIGNvbHVtbjogbnVtYmVyLCBpblNlbGVjdGlvbk1vZGU6IGJvb2xlYW4gPSBmYWxzZSkge1xuXHRpZiAoaW5TZWxlY3Rpb25Nb2RlKSB7XG5cdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5Nb3ZlVG9TZWxlY3QucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7XG5cdFx0XHRwb3NpdGlvbjogbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbilcblx0XHR9KTtcblx0fSBlbHNlIHtcblx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLk1vdmVUby5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHtcblx0XHRcdHBvc2l0aW9uOiBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKVxuXHRcdH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG1vdmVMZWZ0KGVkaXRvcjogSVRlc3RDb2RlRWRpdG9yLCB2aWV3TW9kZWw6IFZpZXdNb2RlbCwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuID0gZmFsc2UpIHtcblx0aWYgKGluU2VsZWN0aW9uTW9kZSkge1xuXHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yTGVmdFNlbGVjdC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0fSBlbHNlIHtcblx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckxlZnQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gbW92ZVJpZ2h0KGVkaXRvcjogSVRlc3RDb2RlRWRpdG9yLCB2aWV3TW9kZWw6IFZpZXdNb2RlbCwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuID0gZmFsc2UpIHtcblx0aWYgKGluU2VsZWN0aW9uTW9kZSkge1xuXHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yUmlnaHRTZWxlY3QucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdH0gZWxzZSB7XG5cdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBtb3ZlRG93bihlZGl0b3I6IElUZXN0Q29kZUVkaXRvciwgdmlld01vZGVsOiBWaWV3TW9kZWwsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiA9IGZhbHNlKSB7XG5cdGlmIChpblNlbGVjdGlvbk1vZGUpIHtcblx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckRvd25TZWxlY3QucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdH0gZWxzZSB7XG5cdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JEb3duLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG1vdmVVcChlZGl0b3I6IElUZXN0Q29kZUVkaXRvciwgdmlld01vZGVsOiBWaWV3TW9kZWwsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiA9IGZhbHNlKSB7XG5cdGlmIChpblNlbGVjdGlvbk1vZGUpIHtcblx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvclVwU2VsZWN0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHR9IGVsc2Uge1xuXHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yVXAucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gbW92ZVRvQmVnaW5uaW5nT2ZMaW5lKGVkaXRvcjogSVRlc3RDb2RlRWRpdG9yLCB2aWV3TW9kZWw6IFZpZXdNb2RlbCwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuID0gZmFsc2UpIHtcblx0aWYgKGluU2VsZWN0aW9uTW9kZSkge1xuXHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29ySG9tZVNlbGVjdC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0fSBlbHNlIHtcblx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckhvbWUucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gbW92ZVRvRW5kT2ZMaW5lKGVkaXRvcjogSVRlc3RDb2RlRWRpdG9yLCB2aWV3TW9kZWw6IFZpZXdNb2RlbCwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuID0gZmFsc2UpIHtcblx0aWYgKGluU2VsZWN0aW9uTW9kZSkge1xuXHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yRW5kU2VsZWN0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHR9IGVsc2Uge1xuXHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yRW5kLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG1vdmVUb0JlZ2lubmluZ09mQnVmZmVyKGVkaXRvcjogSVRlc3RDb2RlRWRpdG9yLCB2aWV3TW9kZWw6IFZpZXdNb2RlbCwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuID0gZmFsc2UpIHtcblx0aWYgKGluU2VsZWN0aW9uTW9kZSkge1xuXHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yVG9wU2VsZWN0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHR9IGVsc2Uge1xuXHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yVG9wLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG1vdmVUb0VuZE9mQnVmZmVyKGVkaXRvcjogSVRlc3RDb2RlRWRpdG9yLCB2aWV3TW9kZWw6IFZpZXdNb2RlbCwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuID0gZmFsc2UpIHtcblx0aWYgKGluU2VsZWN0aW9uTW9kZSkge1xuXHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQm90dG9tU2VsZWN0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHR9IGVsc2Uge1xuXHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQm90dG9tLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGFzc2VydEN1cnNvcih2aWV3TW9kZWw6IFZpZXdNb2RlbCwgd2hhdDogUG9zaXRpb24gfCBTZWxlY3Rpb24gfCBTZWxlY3Rpb25bXSk6IHZvaWQge1xuXHRsZXQgc2VsZWN0aW9uczogU2VsZWN0aW9uW107XG5cdGlmICh3aGF0IGluc3RhbmNlb2YgUG9zaXRpb24pIHtcblx0XHRzZWxlY3Rpb25zID0gW25ldyBTZWxlY3Rpb24od2hhdC5saW5lTnVtYmVyLCB3aGF0LmNvbHVtbiwgd2hhdC5saW5lTnVtYmVyLCB3aGF0LmNvbHVtbildO1xuXHR9IGVsc2UgaWYgKHdoYXQgaW5zdGFuY2VvZiBTZWxlY3Rpb24pIHtcblx0XHRzZWxlY3Rpb25zID0gW3doYXRdO1xuXHR9IGVsc2Uge1xuXHRcdHNlbGVjdGlvbnMgPSB3aGF0O1xuXHR9XG5cdGNvbnN0IGFjdHVhbCA9IHZpZXdNb2RlbC5nZXRTZWxlY3Rpb25zKCkubWFwKHMgPT4gcy50b1N0cmluZygpKTtcblx0Y29uc3QgZXhwZWN0ZWQgPSBzZWxlY3Rpb25zLm1hcChzID0+IHMudG9TdHJpbmcoKSk7XG5cblx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkKTtcbn1cblxuc3VpdGUoJ0VkaXRvciBDb250cm9sbGVyIC0gQ3Vyc29yJywgKCkgPT4ge1xuXHRjb25zdCBMSU5FMSA9ICcgICAgXFx0TXkgRmlyc3QgTGluZVxcdCAnO1xuXHRjb25zdCBMSU5FMiA9ICdcXHRNeSBTZWNvbmQgTGluZSc7XG5cdGNvbnN0IExJTkUzID0gJyAgICBUaGlyZCBMaW5lXHVEODNEXHVEQzM2Jztcblx0Y29uc3QgTElORTQgPSAnJztcblx0Y29uc3QgTElORTUgPSAnMSc7XG5cblx0Y29uc3QgVEVYVCA9XG5cdFx0TElORTEgKyAnXFxyXFxuJyArXG5cdFx0TElORTIgKyAnXFxuJyArXG5cdFx0TElORTMgKyAnXFxuJyArXG5cdFx0TElORTQgKyAnXFxyXFxuJyArXG5cdFx0TElORTU7XG5cblx0ZnVuY3Rpb24gcnVuVGVzdChjYWxsYmFjazogKGVkaXRvcjogSVRlc3RDb2RlRWRpdG9yLCB2aWV3TW9kZWw6IFZpZXdNb2RlbCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihURVhULCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRjYWxsYmFjayhlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0fSk7XG5cdH1cblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdjdXJzb3IgaW5pdGlhbGl6ZWQnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0tLS0tLSBhYnNvbHV0ZSBtb3ZlXG5cblx0dGVzdCgnbm8gbW92ZScsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAxKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMik7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMikpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIGluIHNlbGVjdGlvbiBtb2RlJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDIsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAyKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgYmV5b25kIGxpbmUgZW5kJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDI1KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCBMSU5FMS5sZW5ndGggKyAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgZW1wdHkgbGluZScsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCA0LCAyMCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oNCwgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIG9uZSBjaGFyIGxpbmUnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgNSwgMjApO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDUsIDIpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VsZWN0aW9uIGRvd24nLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgMSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDIsIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSBhbmQgdGhlbiBzZWxlY3QnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgMyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMiwgMykpO1xuXG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDE1LCB0cnVlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgMywgMiwgMTUpKTtcblxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAyLCB0cnVlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgMywgMSwgMikpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tLS0tLS0gbW92ZSBsZWZ0XG5cblx0dGVzdCgnbW92ZSBsZWZ0IG9uIHRvcCBsZWZ0IHBvc2l0aW9uJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlTGVmdChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIGxlZnQnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMykpO1xuXHRcdFx0bW92ZUxlZnQoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDIpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSBsZWZ0IHdpdGggc3Vycm9nYXRlIHBhaXInLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgMTcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDMsIDE3KSk7XG5cdFx0XHRtb3ZlTGVmdChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMywgMTUpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSBsZWZ0IGdvZXMgdG8gcHJldmlvdXMgcm93JywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDEpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDIsIDEpKTtcblx0XHRcdG1vdmVMZWZ0KGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAyMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIGxlZnQgc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDEpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDIsIDEpKTtcblx0XHRcdG1vdmVMZWZ0KGVkaXRvciwgdmlld01vZGVsLCB0cnVlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgMSwgMSwgMjEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLS0tLS0tIG1vdmUgcmlnaHRcblxuXHR0ZXN0KCdtb3ZlIHJpZ2h0IG9uIGJvdHRvbSByaWdodCBwb3NpdGlvbicsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCA1LCAyKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbig1LCAyKSk7XG5cdFx0XHRtb3ZlUmlnaHQoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDUsIDIpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSByaWdodCcsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAzKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAzKSk7XG5cdFx0XHRtb3ZlUmlnaHQoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDQpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSByaWdodCB3aXRoIHN1cnJvZ2F0ZSBwYWlyJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDE1KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigzLCAxNSkpO1xuXHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigzLCAxNykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHJpZ2h0IGdvZXMgdG8gbmV4dCByb3cnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMjEpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDIxKSk7XG5cdFx0XHRtb3ZlUmlnaHQoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDIsIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSByaWdodCBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMjEpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDIxKSk7XG5cdFx0XHRtb3ZlUmlnaHQoZWRpdG9yLCB2aWV3TW9kZWwsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCAyMSwgMiwgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tLS0tLS0gbW92ZSBkb3duXG5cblx0dGVzdCgnbW92ZSBkb3duJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlRG93bihlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMiwgMSkpO1xuXHRcdFx0bW92ZURvd24oZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDMsIDEpKTtcblx0XHRcdG1vdmVEb3duKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbig0LCAxKSk7XG5cdFx0XHRtb3ZlRG93bihlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oNSwgMSkpO1xuXHRcdFx0bW92ZURvd24oZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDUsIDIpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSBkb3duIHdpdGggc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlRG93bihlZGl0b3IsIHZpZXdNb2RlbCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDIsIDEpKTtcblx0XHRcdG1vdmVEb3duKGVkaXRvciwgdmlld01vZGVsLCB0cnVlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMSwgMywgMSkpO1xuXHRcdFx0bW92ZURvd24oZWRpdG9yLCB2aWV3TW9kZWwsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCAxLCA0LCAxKSk7XG5cdFx0XHRtb3ZlRG93bihlZGl0b3IsIHZpZXdNb2RlbCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDUsIDEpKTtcblx0XHRcdG1vdmVEb3duKGVkaXRvciwgdmlld01vZGVsLCB0cnVlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMSwgNSwgMikpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIGRvd24gd2l0aCB0YWJzJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDUpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDUpKTtcblx0XHRcdG1vdmVEb3duKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigyLCAyKSk7XG5cdFx0XHRtb3ZlRG93bihlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMywgNSkpO1xuXHRcdFx0bW92ZURvd24oZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDQsIDEpKTtcblx0XHRcdG1vdmVEb3duKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbig1LCAyKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0tLS0tLSBtb3ZlIHVwXG5cblx0dGVzdCgnbW92ZSB1cCcsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCA1KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigzLCA1KSk7XG5cblx0XHRcdG1vdmVVcChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMiwgMikpO1xuXG5cdFx0XHRtb3ZlVXAoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDUpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB1cCB3aXRoIHNlbGVjdGlvbicsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCA1KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigzLCA1KSk7XG5cblx0XHRcdG1vdmVVcChlZGl0b3IsIHZpZXdNb2RlbCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDUsIDIsIDIpKTtcblxuXHRcdFx0bW92ZVVwKGVkaXRvciwgdmlld01vZGVsLCB0cnVlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMywgNSwgMSwgNSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHVwIGFuZCBkb3duIHdpdGggdGFicycsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCA1KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCA1KSk7XG5cdFx0XHRtb3ZlRG93bihlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRtb3ZlRG93bihlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRtb3ZlRG93bihlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRtb3ZlRG93bihlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oNSwgMikpO1xuXHRcdFx0bW92ZVVwKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbig0LCAxKSk7XG5cdFx0XHRtb3ZlVXAoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDMsIDUpKTtcblx0XHRcdG1vdmVVcChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMiwgMikpO1xuXHRcdFx0bW92ZVVwKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCA1KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdXAgYW5kIGRvd24gd2l0aCBlbmQgb2YgbGluZXMgc3RhcnRpbmcgZnJvbSBhIGxvbmcgb25lJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG9FbmRPZkxpbmUoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIExJTkUxLmxlbmd0aCArIDEpKTtcblx0XHRcdG1vdmVUb0VuZE9mTGluZShlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgTElORTEubGVuZ3RoICsgMSkpO1xuXHRcdFx0bW92ZURvd24oZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDIsIExJTkUyLmxlbmd0aCArIDEpKTtcblx0XHRcdG1vdmVEb3duKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigzLCBMSU5FMy5sZW5ndGggKyAxKSk7XG5cdFx0XHRtb3ZlRG93bihlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oNCwgTElORTQubGVuZ3RoICsgMSkpO1xuXHRcdFx0bW92ZURvd24oZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDUsIExJTkU1Lmxlbmd0aCArIDEpKTtcblx0XHRcdG1vdmVVcChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRtb3ZlVXAoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0bW92ZVVwKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdG1vdmVVcChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgTElORTEubGVuZ3RoICsgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDQ0NjU6IGN1cnNvciBwb3NpdGlvbiBub3QgY29ycmVjdCB3aGVuIG1vdmUnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNSldKTtcblx0XHRcdC8vIGdvaW5nIG9uY2UgdXAgb24gdGhlIGZpcnN0IGxpbmUgcmVtZW1iZXJzIHRoZSBvZmZzZXQgdmlzdWFsIGNvbHVtbnNcblx0XHRcdG1vdmVVcChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdFx0bW92ZURvd24oZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDIsIDIpKTtcblx0XHRcdG1vdmVVcChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgNSkpO1xuXG5cdFx0XHQvLyBnb2luZyB0d2ljZSB1cCBvbiB0aGUgZmlyc3QgbGluZSBkaXNjYXJkcyB0aGUgb2Zmc2V0IHZpc3VhbCBjb2x1bW5zXG5cdFx0XHRtb3ZlVXAoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRcdG1vdmVVcChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdFx0bW92ZURvd24oZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDIsIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE0NDA0MTogQ3Vyc29yIHVwL2Rvd24gd29ya3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdXb3JkMSBXb3JkMiBXb3JkMyBXb3JkNCcsXG5cdFx0XHRcdCdXb3JkNSBXb3JkNiBXb3JkNyBXb3JkOCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyB3cmFwcGluZ0luZGVudDogJ2luZGVudCcsIHdvcmRXcmFwOiAnd29yZFdyYXBDb2x1bW4nLCB3b3JkV3JhcENvbHVtbjogMjAgfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpXSk7XG5cblx0XHRcdGNvbnN0IGN1cnNvclBvc2l0aW9uczogYW55W10gPSBbXTtcblx0XHRcdGZ1bmN0aW9uIHJlcG9ydEN1cnNvclBvc2l0aW9uKCkge1xuXHRcdFx0XHRjdXJzb3JQb3NpdGlvbnMucHVzaCh2aWV3TW9kZWwuZ2V0Q3Vyc29yU3RhdGVzKClbMF0udmlld1N0YXRlLnBvc2l0aW9uLnRvU3RyaW5nKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXBvcnRDdXJzb3JQb3NpdGlvbigpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JEb3duLCBudWxsKTtcblx0XHRcdHJlcG9ydEN1cnNvclBvc2l0aW9uKCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckRvd24sIG51bGwpO1xuXHRcdFx0cmVwb3J0Q3Vyc29yUG9zaXRpb24oKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yRG93biwgbnVsbCk7XG5cdFx0XHRyZXBvcnRDdXJzb3JQb3NpdGlvbigpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JEb3duLCBudWxsKTtcblxuXHRcdFx0cmVwb3J0Q3Vyc29yUG9zaXRpb24oKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yVXAsIG51bGwpO1xuXHRcdFx0cmVwb3J0Q3Vyc29yUG9zaXRpb24oKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yVXAsIG51bGwpO1xuXHRcdFx0cmVwb3J0Q3Vyc29yUG9zaXRpb24oKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yVXAsIG51bGwpO1xuXHRcdFx0cmVwb3J0Q3Vyc29yUG9zaXRpb24oKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yVXAsIG51bGwpO1xuXHRcdFx0cmVwb3J0Q3Vyc29yUG9zaXRpb24oKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjdXJzb3JQb3NpdGlvbnMsIFtcblx0XHRcdFx0JygxLDEpJyxcblx0XHRcdFx0JygyLDUpJyxcblx0XHRcdFx0JygzLDEpJyxcblx0XHRcdFx0Jyg0LDUpJyxcblx0XHRcdFx0Jyg0LDEwKScsXG5cdFx0XHRcdCcoMywxKScsXG5cdFx0XHRcdCcoMiw1KScsXG5cdFx0XHRcdCcoMSwxKScsXG5cdFx0XHRcdCcoMSwxKScsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE0MDE5NTogQ3Vyc29yIHVwL2Rvd24gbWFrZXMgcHJvZ3Jlc3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdXb3JkMSBXb3JkMiBXb3JkMyBXb3JkNCcsXG5cdFx0XHRcdCdXb3JkNSBXb3JkNiBXb3JkNyBXb3JkOCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyB3cmFwcGluZ0luZGVudDogJ2luZGVudCcsIHdvcmRXcmFwOiAnd29yZFdyYXBDb2x1bW4nLCB3b3JkV3JhcENvbHVtbjogMjAgfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3IuY2hhbmdlRGVjb3JhdGlvbnMoKGNoYW5nZUFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGNoYW5nZUFjY2Vzc29yLmRlbHRhRGVjb3JhdGlvbnMoW10sIFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDIyLCAxLCAyMiksXG5cdFx0XHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdHNob3dJZkNvbGxhcHNlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0Jyxcblx0XHRcdFx0XHRcdFx0YWZ0ZXI6IHtcblx0XHRcdFx0XHRcdFx0XHRjb250ZW50OiAnc29tZSB2ZXJ5IHZlcnkgdmVyeSB2ZXJ5IHZlcnkgdmVyeSB2ZXJ5IHZlcnkgbG9uZyB0ZXh0Jyxcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSk7XG5cdFx0XHR9KTtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSldKTtcblxuXHRcdFx0Y29uc3QgY3Vyc29yUG9zaXRpb25zOiBhbnlbXSA9IFtdO1xuXHRcdFx0ZnVuY3Rpb24gcmVwb3J0Q3Vyc29yUG9zaXRpb24oKSB7XG5cdFx0XHRcdGN1cnNvclBvc2l0aW9ucy5wdXNoKHZpZXdNb2RlbC5nZXRDdXJzb3JTdGF0ZXMoKVswXS52aWV3U3RhdGUucG9zaXRpb24udG9TdHJpbmcoKSk7XG5cdFx0XHR9XG5cblx0XHRcdHJlcG9ydEN1cnNvclBvc2l0aW9uKCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckRvd24sIG51bGwpO1xuXHRcdFx0cmVwb3J0Q3Vyc29yUG9zaXRpb24oKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yRG93biwgbnVsbCk7XG5cdFx0XHRyZXBvcnRDdXJzb3JQb3NpdGlvbigpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JEb3duLCBudWxsKTtcblx0XHRcdHJlcG9ydEN1cnNvclBvc2l0aW9uKCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckRvd24sIG51bGwpO1xuXG5cdFx0XHRyZXBvcnRDdXJzb3JQb3NpdGlvbigpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JVcCwgbnVsbCk7XG5cdFx0XHRyZXBvcnRDdXJzb3JQb3NpdGlvbigpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JVcCwgbnVsbCk7XG5cdFx0XHRyZXBvcnRDdXJzb3JQb3NpdGlvbigpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JVcCwgbnVsbCk7XG5cdFx0XHRyZXBvcnRDdXJzb3JQb3NpdGlvbigpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JVcCwgbnVsbCk7XG5cdFx0XHRyZXBvcnRDdXJzb3JQb3NpdGlvbigpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGN1cnNvclBvc2l0aW9ucywgW1xuXHRcdFx0XHQnKDEsMSknLFxuXHRcdFx0XHQnKDIsNSknLFxuXHRcdFx0XHQnKDUsMTkpJyxcblx0XHRcdFx0Jyg2LDEpJyxcblx0XHRcdFx0Jyg3LDUpJyxcblx0XHRcdFx0Jyg2LDEpJyxcblx0XHRcdFx0JygyLDgpJyxcblx0XHRcdFx0JygxLDEpJyxcblx0XHRcdFx0JygxLDEpJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHQvLyAtLS0tLS0tLS0gbW92ZSB0byBiZWdpbm5pbmcgb2YgbGluZVxuXG5cdHRlc3QoJ21vdmUgdG8gYmVnaW5uaW5nIG9mIGxpbmUnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUb0JlZ2lubmluZ09mTGluZShlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgNikpO1xuXHRcdFx0bW92ZVRvQmVnaW5uaW5nT2ZMaW5lKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gYmVnaW5uaW5nIG9mIGxpbmUgZnJvbSB3aXRoaW4gbGluZScsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCA4KTtcblx0XHRcdG1vdmVUb0JlZ2lubmluZ09mTGluZShlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgNikpO1xuXHRcdFx0bW92ZVRvQmVnaW5uaW5nT2ZMaW5lKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gYmVnaW5uaW5nIG9mIGxpbmUgZnJvbSB3aGl0ZXNwYWNlIGF0IGJlZ2lubmluZyBvZiBsaW5lJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDIpO1xuXHRcdFx0bW92ZVRvQmVnaW5uaW5nT2ZMaW5lKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCA2KSk7XG5cdFx0XHRtb3ZlVG9CZWdpbm5pbmdPZkxpbmUoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBiZWdpbm5pbmcgb2YgbGluZSBmcm9tIHdpdGhpbiBsaW5lIHNlbGVjdGlvbicsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCA4KTtcblx0XHRcdG1vdmVUb0JlZ2lubmluZ09mTGluZShlZGl0b3IsIHZpZXdNb2RlbCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDgsIDEsIDYpKTtcblx0XHRcdG1vdmVUb0JlZ2lubmluZ09mTGluZShlZGl0b3IsIHZpZXdNb2RlbCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDgsIDEsIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBiZWdpbm5pbmcgb2YgbGluZSB3aXRoIHNlbGVjdGlvbiBtdWx0aWxpbmUgZm9yd2FyZCcsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCA4KTtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgOSwgdHJ1ZSk7XG5cdFx0XHRtb3ZlVG9CZWdpbm5pbmdPZkxpbmUoZWRpdG9yLCB2aWV3TW9kZWwsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMywgNSwgMywgNSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGJlZ2lubmluZyBvZiBsaW5lIHdpdGggc2VsZWN0aW9uIG11bHRpbGluZSBiYWNrd2FyZCcsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCA5KTtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgOCwgdHJ1ZSk7XG5cdFx0XHRtb3ZlVG9CZWdpbm5pbmdPZkxpbmUoZWRpdG9yLCB2aWV3TW9kZWwsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgNiwgMSwgNikpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGJlZ2lubmluZyBvZiBsaW5lIHdpdGggc2VsZWN0aW9uIHNpbmdsZSBsaW5lIGZvcndhcmQnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgMik7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDksIHRydWUpO1xuXHRcdFx0bW92ZVRvQmVnaW5uaW5nT2ZMaW5lKGVkaXRvciwgdmlld01vZGVsLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDUsIDMsIDUpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBiZWdpbm5pbmcgb2YgbGluZSB3aXRoIHNlbGVjdGlvbiBzaW5nbGUgbGluZSBiYWNrd2FyZCcsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCA5KTtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgMiwgdHJ1ZSk7XG5cdFx0XHRtb3ZlVG9CZWdpbm5pbmdPZkxpbmUoZWRpdG9yLCB2aWV3TW9kZWwsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMywgNSwgMywgNSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTU0MDE6IFwiRW5kXCIga2V5IGlzIGJlaGF2aW5nIHdlaXJkIHdoZW4gdGV4dCBpcyBzZWxlY3RlZCBwYXJ0IDEnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgOCk7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDksIHRydWUpO1xuXHRcdFx0bW92ZVRvQmVnaW5uaW5nT2ZMaW5lKGVkaXRvciwgdmlld01vZGVsLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDUsIDMsIDUpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE3MDExOiBTaGlmdCtob21lL2VuZCBub3cgZ28gdG8gdGhlIGVuZCBvZiB0aGUgc2VsZWN0aW9uIHN0YXJ0XFwncyBsaW5lLCBub3QgdGhlIHNlbGVjdGlvblxcJ3MgZW5kJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDgpO1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCA5LCB0cnVlKTtcblx0XHRcdG1vdmVUb0JlZ2lubmluZ09mTGluZShlZGl0b3IsIHZpZXdNb2RlbCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDgsIDMsIDUpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLS0tLS0tIG1vdmUgdG8gZW5kIG9mIGxpbmVcblxuXHR0ZXN0KCdtb3ZlIHRvIGVuZCBvZiBsaW5lJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG9FbmRPZkxpbmUoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIExJTkUxLmxlbmd0aCArIDEpKTtcblx0XHRcdG1vdmVUb0VuZE9mTGluZShlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgTElORTEubGVuZ3RoICsgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGVuZCBvZiBsaW5lIGZyb20gd2l0aGluIGxpbmUnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgNik7XG5cdFx0XHRtb3ZlVG9FbmRPZkxpbmUoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIExJTkUxLmxlbmd0aCArIDEpKTtcblx0XHRcdG1vdmVUb0VuZE9mTGluZShlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgTElORTEubGVuZ3RoICsgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGVuZCBvZiBsaW5lIGZyb20gd2hpdGVzcGFjZSBhdCBlbmQgb2YgbGluZScsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAyMCk7XG5cdFx0XHRtb3ZlVG9FbmRPZkxpbmUoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIExJTkUxLmxlbmd0aCArIDEpKTtcblx0XHRcdG1vdmVUb0VuZE9mTGluZShlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgTElORTEubGVuZ3RoICsgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGVuZCBvZiBsaW5lIGZyb20gd2l0aGluIGxpbmUgc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDYpO1xuXHRcdFx0bW92ZVRvRW5kT2ZMaW5lKGVkaXRvciwgdmlld01vZGVsLCB0cnVlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgNiwgMSwgTElORTEubGVuZ3RoICsgMSkpO1xuXHRcdFx0bW92ZVRvRW5kT2ZMaW5lKGVkaXRvciwgdmlld01vZGVsLCB0cnVlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgNiwgMSwgTElORTEubGVuZ3RoICsgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGVuZCBvZiBsaW5lIHdpdGggc2VsZWN0aW9uIG11bHRpbGluZSBmb3J3YXJkJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDEpO1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCA5LCB0cnVlKTtcblx0XHRcdG1vdmVUb0VuZE9mTGluZShlZGl0b3IsIHZpZXdNb2RlbCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCAxNywgMywgMTcpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBlbmQgb2YgbGluZSB3aXRoIHNlbGVjdGlvbiBtdWx0aWxpbmUgYmFja3dhcmQnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgOSk7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDEsIHRydWUpO1xuXHRcdFx0bW92ZVRvRW5kT2ZMaW5lKGVkaXRvciwgdmlld01vZGVsLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDIxLCAxLCAyMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGVuZCBvZiBsaW5lIHdpdGggc2VsZWN0aW9uIHNpbmdsZSBsaW5lIGZvcndhcmQnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgMSk7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDksIHRydWUpO1xuXHRcdFx0bW92ZVRvRW5kT2ZMaW5lKGVkaXRvciwgdmlld01vZGVsLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDE3LCAzLCAxNykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGVuZCBvZiBsaW5lIHdpdGggc2VsZWN0aW9uIHNpbmdsZSBsaW5lIGJhY2t3YXJkJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDkpO1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCAxLCB0cnVlKTtcblx0XHRcdG1vdmVUb0VuZE9mTGluZShlZGl0b3IsIHZpZXdNb2RlbCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCAxNywgMywgMTcpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE1NDAxOiBcIkVuZFwiIGtleSBpcyBiZWhhdmluZyB3ZWlyZCB3aGVuIHRleHQgaXMgc2VsZWN0ZWQgcGFydCAyJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDEpO1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCA5LCB0cnVlKTtcblx0XHRcdG1vdmVUb0VuZE9mTGluZShlZGl0b3IsIHZpZXdNb2RlbCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCAxNywgMywgMTcpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLS0tLS0tIG1vdmUgdG8gYmVnaW5uaW5nIG9mIGJ1ZmZlclxuXG5cdHRlc3QoJ21vdmUgdG8gYmVnaW5uaW5nIG9mIGJ1ZmZlcicsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvQmVnaW5uaW5nT2ZCdWZmZXIoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBiZWdpbm5pbmcgb2YgYnVmZmVyIGZyb20gd2l0aGluIGZpcnN0IGxpbmUnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMyk7XG5cdFx0XHRtb3ZlVG9CZWdpbm5pbmdPZkJ1ZmZlcihlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGJlZ2lubmluZyBvZiBidWZmZXIgZnJvbSB3aXRoaW4gYW5vdGhlciBsaW5lJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDMpO1xuXHRcdFx0bW92ZVRvQmVnaW5uaW5nT2ZCdWZmZXIoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBiZWdpbm5pbmcgb2YgYnVmZmVyIGZyb20gd2l0aGluIGZpcnN0IGxpbmUgc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDMpO1xuXHRcdFx0bW92ZVRvQmVnaW5uaW5nT2ZCdWZmZXIoZWRpdG9yLCB2aWV3TW9kZWwsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCAzLCAxLCAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gYmVnaW5uaW5nIG9mIGJ1ZmZlciBmcm9tIHdpdGhpbiBhbm90aGVyIGxpbmUgc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDMpO1xuXHRcdFx0bW92ZVRvQmVnaW5uaW5nT2ZCdWZmZXIoZWRpdG9yLCB2aWV3TW9kZWwsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCAzLCAxLCAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0tLS0tLSBtb3ZlIHRvIGVuZCBvZiBidWZmZXJcblxuXHR0ZXN0KCdtb3ZlIHRvIGVuZCBvZiBidWZmZXInLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUb0VuZE9mQnVmZmVyKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbig1LCBMSU5FNS5sZW5ndGggKyAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gZW5kIG9mIGJ1ZmZlciBmcm9tIHdpdGhpbiBsYXN0IGxpbmUnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgNSwgMSk7XG5cdFx0XHRtb3ZlVG9FbmRPZkJ1ZmZlcihlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oNSwgTElORTUubGVuZ3RoICsgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGVuZCBvZiBidWZmZXIgZnJvbSB3aXRoaW4gYW5vdGhlciBsaW5lJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDMpO1xuXHRcdFx0bW92ZVRvRW5kT2ZCdWZmZXIoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDUsIExJTkU1Lmxlbmd0aCArIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBlbmQgb2YgYnVmZmVyIGZyb20gd2l0aGluIGxhc3QgbGluZSBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgNSwgMSk7XG5cdFx0XHRtb3ZlVG9FbmRPZkJ1ZmZlcihlZGl0b3IsIHZpZXdNb2RlbCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDUsIDEsIDUsIExJTkU1Lmxlbmd0aCArIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBlbmQgb2YgYnVmZmVyIGZyb20gd2l0aGluIGFub3RoZXIgbGluZSBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgMyk7XG5cdFx0XHRtb3ZlVG9FbmRPZkJ1ZmZlcihlZGl0b3IsIHZpZXdNb2RlbCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDMsIDUsIExJTkU1Lmxlbmd0aCArIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLS0tLS0tIG1pc2NcblxuXHR0ZXN0KCdzZWxlY3QgYWxsJywgKCkgPT4ge1xuXHRcdHJ1blRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLlNlbGVjdEFsbC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMSwgNSwgTElORTUubGVuZ3RoICsgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tLS0tLS0gZXZlbnRpbmdcblxuXHR0ZXN0KCdubyBtb3ZlIGRvZXNuXFwndCB0cmlnZ2VyIGV2ZW50JywgKCkgPT4ge1xuXG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB2aWV3TW9kZWwub25FdmVudCgoZSkgPT4ge1xuXHRcdFx0XHRhc3NlcnQub2soZmFsc2UsICd3YXMgbm90IGV4cGVjdGluZyBldmVudCcpO1xuXHRcdFx0fSk7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDEpO1xuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgZXZlbnRpbmcnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGxldCBldmVudHMgPSAwO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHZpZXdNb2RlbC5vbkV2ZW50KChlKSA9PiB7XG5cdFx0XHRcdGlmIChlLmtpbmQgPT09IE91dGdvaW5nVmlld01vZGVsRXZlbnRLaW5kLkN1cnNvclN0YXRlQ2hhbmdlZCkge1xuXHRcdFx0XHRcdGV2ZW50cysrO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZS5zZWxlY3Rpb25zLCBbbmV3IFNlbGVjdGlvbigxLCAyLCAxLCAyKV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLCAxLCAncmVjZWl2ZXMgMSBldmVudCcpO1xuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgaW4gc2VsZWN0aW9uIG1vZGUgZXZlbnRpbmcnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGxldCBldmVudHMgPSAwO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHZpZXdNb2RlbC5vbkV2ZW50KChlKSA9PiB7XG5cdFx0XHRcdGlmIChlLmtpbmQgPT09IE91dGdvaW5nVmlld01vZGVsRXZlbnRLaW5kLkN1cnNvclN0YXRlQ2hhbmdlZCkge1xuXHRcdFx0XHRcdGV2ZW50cysrO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZS5zZWxlY3Rpb25zLCBbbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAyKV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMiwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzLCAxLCAncmVjZWl2ZXMgMSBldmVudCcpO1xuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0tLS0tLSBzdGF0ZSBzYXZlICYgcmVzdG9yZVxuXG5cdHRlc3QoJ3NhdmVTdGF0ZSAmIHJlc3RvcmVTdGF0ZScsICgpID0+IHtcblx0XHRydW5UZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCAxLCB0cnVlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMSwgMiwgMSkpO1xuXG5cdFx0XHRjb25zdCBzYXZlZFN0YXRlID0gSlNPTi5zdHJpbmdpZnkodmlld01vZGVsLnNhdmVDdXJzb3JTdGF0ZSgpKTtcblxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAxLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXG5cdFx0XHR2aWV3TW9kZWwucmVzdG9yZUN1cnNvclN0YXRlKEpTT04ucGFyc2Uoc2F2ZWRTdGF0ZSkpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCAxLCAyLCAxKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0tLS0tLSB1cGRhdGluZyBjdXJzb3JcblxuXHR0ZXN0KCdJbmRlcGVuZGVudCBtb2RlbCBlZGl0IDEnLCAoKSA9PiB7XG5cdFx0cnVuVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgMTYsIHRydWUpO1xuXG5cdFx0XHRlZGl0b3IuZ2V0TW9kZWwoKS5hcHBseUVkaXRzKFtFZGl0T3BlcmF0aW9uLmRlbGV0ZShuZXcgUmFuZ2UoMiwgMSwgMiwgMikpXSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDIsIDE1KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbHVtbiBzZWxlY3QgMScsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0J1xcdHByaXZhdGUgY29tcHV0ZShhOm51bWJlcik6IGJvb2xlYW4geycsXG5cdFx0XHQnXFx0XFx0aWYgKGEgKyAzID09PSAwIHx8IGEgKyA1ID09PSAwKSB7Jyxcblx0XHRcdCdcXHRcXHRcXHRyZXR1cm4gZmFsc2U7Jyxcblx0XHRcdCdcXHRcXHR9Jyxcblx0XHRcdCdcXHR9J1xuXHRcdF0sIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCA3LCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgNykpO1xuXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkNvbHVtblNlbGVjdC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHtcblx0XHRcdFx0cG9zaXRpb246IG5ldyBQb3NpdGlvbig0LCA0KSxcblx0XHRcdFx0dmlld1Bvc2l0aW9uOiBuZXcgUG9zaXRpb24oNCwgNCksXG5cdFx0XHRcdG1vdXNlQ29sdW1uOiAxNSxcblx0XHRcdFx0ZG9Db2x1bW5TZWxlY3Q6IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBleHBlY3RlZFNlbGVjdGlvbnMgPSBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNywgMSwgMTIpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDkpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDMsIDMsIDYpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDQsIDQsIDQpLFxuXHRcdFx0XTtcblxuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgZXhwZWN0ZWRTZWxlY3Rpb25zKTtcblxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdncmFwaGVtZSBicmVha2luZycsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0J2FiY2FiYycsXG5cdFx0XHQnYVx1MDMwM2FcdTAzMDNhXHUwMzAzYVx1MDMwM2FcdTAzMDNhXHUwMzAzJyxcblx0XHRcdCdcdThGQkJcdURCNDBcdUREMDBcdThGQkJcdURCNDBcdUREMDBcdThGQkJcdURCNDBcdUREMDAnLFxuXHRcdFx0J1x1MEJBQVx1MEJDMScsXG5cdFx0XSwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDEpXSk7XG5cdFx0XHRtb3ZlUmlnaHQoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDIsIDMpKTtcblx0XHRcdG1vdmVMZWZ0KGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigyLCAxKSk7XG5cblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMywgMSwgMywgMSldKTtcblx0XHRcdG1vdmVSaWdodChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMywgNCkpO1xuXHRcdFx0bW92ZUxlZnQoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDMsIDEpKTtcblxuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbig0LCAxLCA0LCAxKV0pO1xuXHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbig0LCAzKSk7XG5cdFx0XHRtb3ZlTGVmdChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oNCwgMSkpO1xuXG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpXSk7XG5cdFx0XHRtb3ZlRG93bihlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMiwgNSkpO1xuXHRcdFx0bW92ZURvd24oZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDMsIDQpKTtcblx0XHRcdG1vdmVVcChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMiwgNSkpO1xuXHRcdFx0bW92ZVVwKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAzKSk7XG5cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzQ5MDUgLSBjb2x1bW4gc2VsZWN0IGlzIGJpYXNlZCB0byB0aGUgcmlnaHQnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCd2YXIgZ3VscCA9IHJlcXVpcmUoXCJndWxwXCIpOycsXG5cdFx0XHQndmFyIHBhdGggPSByZXF1aXJlKFwicGF0aFwiKTsnLFxuXHRcdFx0J3ZhciByaW1yYWYgPSByZXF1aXJlKFwicmltcmFmXCIpOycsXG5cdFx0XHQndmFyIGlzYXJyYXkgPSByZXF1aXJlKFwiaXNhcnJheVwiKTsnLFxuXHRcdFx0J3ZhciBtZXJnZSA9IHJlcXVpcmUoXCJtZXJnZS1zdHJlYW1cIik7Jyxcblx0XHRcdCd2YXIgY29uY2F0ID0gcmVxdWlyZShcImd1bHAtY29uY2F0XCIpOycsXG5cdFx0XHQndmFyIG5ld2VyID0gcmVxdWlyZShcImd1bHAtbmV3ZXJcIik7Jyxcblx0XHRdLmpvaW4oJ1xcbicpLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDQsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCA0KSk7XG5cblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ29sdW1uU2VsZWN0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge1xuXHRcdFx0XHRwb3NpdGlvbjogbmV3IFBvc2l0aW9uKDQsIDEpLFxuXHRcdFx0XHR2aWV3UG9zaXRpb246IG5ldyBQb3NpdGlvbig0LCAxKSxcblx0XHRcdFx0bW91c2VDb2x1bW46IDEsXG5cdFx0XHRcdGRvQ29sdW1uU2VsZWN0OiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDEpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDEpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDQsIDMsIDEpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDQsIDQsIDEpLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyMDA4NzogY29sdW1uIHNlbGVjdCB3aXRoIG1vdXNlJywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQnPHByb3BlcnR5IGlkPVwiU29tZVRoaW5nXCIga2V5PVwiU29tZUtleVwiIHZhbHVlPVwiMDAwXCIvPicsXG5cdFx0XHQnPHByb3BlcnR5IGlkPVwiU29tZVRoaW5nXCIga2V5PVwiU29tZUtleVwiIHZhbHVlPVwiMDAwXCIvPicsXG5cdFx0XHQnPHByb3BlcnR5IGlkPVwiU29tZVRoaW5nXCIgS2V5PVwiU29tZUtleVwiIHZhbHVlPVwiMDAwXCIvPicsXG5cdFx0XHQnPHByb3BlcnR5IGlkPVwiU29tZVRoaW5nXCIga2V5PVwiU29tZUtleVwiIHZhbHVlPVwiMDAwXCIvPicsXG5cdFx0XHQnPHByb3BlcnR5IGlkPVwiU29tZVRoaW5nXCIga2V5PVwiU29NRUtFeVwiIHZhbHVlPVwiMDAwXCIvPicsXG5cdFx0XHQnPHByb3BlcnR5IGlkPVwiU29tZVRoaW5nXCIga2V5PVwiU29tZUtleVwiIHZhbHVlPVwiMDAwXCIvPicsXG5cdFx0XHQnPHByb3BlcnR5IGlkPVwiU29tZVRoaW5nXCIga2V5PVwiU29tZUtleVwiIHZhbHVlPVwiMDAwXCIvPicsXG5cdFx0XHQnPHByb3BlcnR5IGlkPVwiU29tZVRoaW5nXCIga2V5PVwiU29tZUtleVwiIHZhbHVFPVwiMDAwXCIvPicsXG5cdFx0XHQnPHByb3BlcnR5IGlkPVwiU29tZVRoaW5nXCIga2V5PVwiU29tZUtleVwiIHZhbHVlPVwiMDAwXCIvPicsXG5cdFx0XHQnPHByb3BlcnR5IGlkPVwiU29tZVRoaW5nXCIga2V5PVwiU29tZUtleVwiIHZhbHVlPVwiMDBYXCIvPicsXG5cdFx0XS5qb2luKCdcXG4nKSwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEwLCAxMCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEwLCAxMCkpO1xuXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkNvbHVtblNlbGVjdC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHtcblx0XHRcdFx0cG9zaXRpb246IG5ldyBQb3NpdGlvbigxLCAxKSxcblx0XHRcdFx0dmlld1Bvc2l0aW9uOiBuZXcgUG9zaXRpb24oMSwgMSksXG5cdFx0XHRcdG1vdXNlQ29sdW1uOiAxLFxuXHRcdFx0XHRkb0NvbHVtblNlbGVjdDogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMTAsIDEwLCAxMCwgMSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oOSwgMTAsIDksIDEpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDgsIDEwLCA4LCAxKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig3LCAxMCwgNywgMSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNiwgMTAsIDYsIDEpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDEwLCA1LCAxKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig0LCAxMCwgNCwgMSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgMTAsIDMsIDEpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDEwLCAyLCAxKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxMCwgMSwgMSksXG5cdFx0XHRdKTtcblxuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5Db2x1bW5TZWxlY3QucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7XG5cdFx0XHRcdHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oMSwgMSksXG5cdFx0XHRcdHZpZXdQb3NpdGlvbjogbmV3IFBvc2l0aW9uKDEsIDEpLFxuXHRcdFx0XHRtb3VzZUNvbHVtbjogMSxcblx0XHRcdFx0ZG9Db2x1bW5TZWxlY3Q6IHRydWVcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEwLCAxMCwgMTAsIDEpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDksIDEwLCA5LCAxKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig4LCAxMCwgOCwgMSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNywgMTAsIDcsIDEpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDYsIDEwLCA2LCAxKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig1LCAxMCwgNSwgMSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgMTAsIDQsIDEpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDEwLCAzLCAxKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxMCwgMiwgMSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMTAsIDEsIDEpLFxuXHRcdFx0XSk7XG5cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzIwMDg3OiBjb2x1bW4gc2VsZWN0IHdpdGgga2V5Ym9hcmQnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCc8cHJvcGVydHkgaWQ9XCJTb21lVGhpbmdcIiBrZXk9XCJTb21lS2V5XCIgdmFsdWU9XCIwMDBcIi8+Jyxcblx0XHRcdCc8cHJvcGVydHkgaWQ9XCJTb21lVGhpbmdcIiBrZXk9XCJTb21lS2V5XCIgdmFsdWU9XCIwMDBcIi8+Jyxcblx0XHRcdCc8cHJvcGVydHkgaWQ9XCJTb21lVGhpbmdcIiBLZXk9XCJTb21lS2V5XCIgdmFsdWU9XCIwMDBcIi8+Jyxcblx0XHRcdCc8cHJvcGVydHkgaWQ9XCJTb21lVGhpbmdcIiBrZXk9XCJTb21lS2V5XCIgdmFsdWU9XCIwMDBcIi8+Jyxcblx0XHRcdCc8cHJvcGVydHkgaWQ9XCJTb21lVGhpbmdcIiBrZXk9XCJTb01FS0V5XCIgdmFsdWU9XCIwMDBcIi8+Jyxcblx0XHRcdCc8cHJvcGVydHkgaWQ9XCJTb21lVGhpbmdcIiBrZXk9XCJTb21lS2V5XCIgdmFsdWU9XCIwMDBcIi8+Jyxcblx0XHRcdCc8cHJvcGVydHkgaWQ9XCJTb21lVGhpbmdcIiBrZXk9XCJTb21lS2V5XCIgdmFsdWU9XCIwMDBcIi8+Jyxcblx0XHRcdCc8cHJvcGVydHkgaWQ9XCJTb21lVGhpbmdcIiBrZXk9XCJTb21lS2V5XCIgdmFsdUU9XCIwMDBcIi8+Jyxcblx0XHRcdCc8cHJvcGVydHkgaWQ9XCJTb21lVGhpbmdcIiBrZXk9XCJTb21lS2V5XCIgdmFsdWU9XCIwMDBcIi8+Jyxcblx0XHRcdCc8cHJvcGVydHkgaWQ9XCJTb21lVGhpbmdcIiBrZXk9XCJTb21lS2V5XCIgdmFsdWU9XCIwMFhcIi8+Jyxcblx0XHRdLmpvaW4oJ1xcbicpLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMTAsIDEwLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMTAsIDEwKSk7XG5cblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0TGVmdC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxMCwgMTAsIDEwLCA5KVxuXHRcdFx0XSk7XG5cblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0TGVmdC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxMCwgMTAsIDEwLCA4KVxuXHRcdFx0XSk7XG5cblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMTAsIDEwLCAxMCwgOSlcblx0XHRcdF0pO1xuXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFVwLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEwLCAxMCwgMTAsIDkpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDksIDEwLCA5LCA5KSxcblx0XHRcdF0pO1xuXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdERvd24ucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMTAsIDEwLCAxMCwgOSlcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTE4MDYyOiBDb2x1bW4gc2VsZWN0aW9uIGNhbm5vdCBzZWxlY3QgZmlyc3QgcG9zaXRpb24gb2YgYSBsaW5lJywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQnaGVsbG8gd29ybGQnLFxuXHRcdF0uam9pbignXFxuJyksIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAyLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMikpO1xuXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdExlZnQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMiwgMSwgMSlcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2x1bW4gc2VsZWN0IHdpdGgga2V5Ym9hcmQnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCd2YXIgZ3VscCA9IHJlcXVpcmUoXCJndWxwXCIpOycsXG5cdFx0XHQndmFyIHBhdGggPSByZXF1aXJlKFwicGF0aFwiKTsnLFxuXHRcdFx0J3ZhciByaW1yYWYgPSByZXF1aXJlKFwicmltcmFmXCIpOycsXG5cdFx0XHQndmFyIGlzYXJyYXkgPSByZXF1aXJlKFwiaXNhcnJheVwiKTsnLFxuXHRcdFx0J3ZhciBtZXJnZSA9IHJlcXVpcmUoXCJtZXJnZS1zdHJlYW1cIik7Jyxcblx0XHRcdCd2YXIgY29uY2F0ID0gcmVxdWlyZShcImd1bHAtY29uY2F0XCIpOycsXG5cdFx0XHQndmFyIG5ld2VyID0gcmVxdWlyZShcImd1bHAtbmV3ZXJcIik7Jyxcblx0XHRdLmpvaW4oJ1xcbicpLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgNCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDQpKTtcblxuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA0LCAxLCA1KVxuXHRcdFx0XSk7XG5cblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0RG93bi5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA0LCAxLCA1KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCA0LCAyLCA1KVxuXHRcdFx0XSk7XG5cblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0RG93bi5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA0LCAxLCA1KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCA0LCAyLCA1KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCA0LCAzLCA1KSxcblx0XHRcdF0pO1xuXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdERvd24ucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdERvd24ucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdERvd24ucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdERvd24ucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNCwgMiwgNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgNCwgMywgNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgNCwgNCwgNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNSwgNCwgNSwgNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNiwgNCwgNiwgNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNywgNCwgNywgNSksXG5cdFx0XHRdKTtcblxuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA0LCAxLCA2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCA0LCAyLCA2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCA0LCAzLCA2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig0LCA0LCA0LCA2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig1LCA0LCA1LCA2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig2LCA0LCA2LCA2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig3LCA0LCA3LCA2KSxcblx0XHRcdF0pO1xuXG5cdFx0XHQvLyAxMCB0aW1lc1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFJpZ2h0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFJpZ2h0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFJpZ2h0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA0LCAxLCAxNiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNCwgMiwgMTYpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDQsIDMsIDE2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig0LCA0LCA0LCAxNiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNSwgNCwgNSwgMTYpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDYsIDQsIDYsIDE2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig3LCA0LCA3LCAxNiksXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gMTAgdGltZXNcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFJpZ2h0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFJpZ2h0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFJpZ2h0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgMjYpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDI2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCA0LCAzLCAyNiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgNCwgNCwgMjYpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDQsIDUsIDI2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig2LCA0LCA2LCAyNiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNywgNCwgNywgMjYpLFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIDIgdGltZXMgPT4gcmVhY2hpbmcgdGhlIGVuZGluZyBvZiBsaW5lcyAxIGFuZCAyXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFJpZ2h0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA0LCAxLCAyOCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNCwgMiwgMjgpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDQsIDMsIDI4KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig0LCA0LCA0LCAyOCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNSwgNCwgNSwgMjgpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDYsIDQsIDYsIDI4KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig3LCA0LCA3LCAyOCksXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gNCB0aW1lcyA9PiByZWFjaGluZyB0aGUgZW5kaW5nIG9mIGxpbmUgM1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFJpZ2h0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA0LCAxLCAyOCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNCwgMiwgMjgpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDQsIDMsIDMyKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig0LCA0LCA0LCAzMiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNSwgNCwgNSwgMzIpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDYsIDQsIDYsIDMyKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig3LCA0LCA3LCAzMiksXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gMiB0aW1lcyA9PiByZWFjaGluZyB0aGUgZW5kaW5nIG9mIGxpbmUgNFxuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgMjgpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDI4KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCA0LCAzLCAzMiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgNCwgNCwgMzQpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDQsIDUsIDM0KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig2LCA0LCA2LCAzNCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNywgNCwgNywgMzQpLFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIDEgdGltZSA9PiByZWFjaGluZyB0aGUgZW5kaW5nIG9mIGxpbmUgN1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA0LCAxLCAyOCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNCwgMiwgMjgpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDQsIDMsIDMyKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig0LCA0LCA0LCAzNCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNSwgNCwgNSwgMzUpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDYsIDQsIDYsIDM1KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig3LCA0LCA3LCAzNSksXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gMyB0aW1lcyA9PiByZWFjaGluZyB0aGUgZW5kaW5nIG9mIGxpbmVzIDUgJiA2XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFJpZ2h0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgMjgpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDI4KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCA0LCAzLCAzMiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgNCwgNCwgMzQpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDQsIDUsIDM3KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig2LCA0LCA2LCAzNyksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNywgNCwgNywgMzUpLFxuXHRcdFx0XSk7XG5cblx0XHRcdC8vIGNhbm5vdCBnbyBhbnl3aGVyZSBhbnltb3JlXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFJpZ2h0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDI4KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCA0LCAyLCAyOCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgNCwgMywgMzIpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDQsIDQsIDM0KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig1LCA0LCA1LCAzNyksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNiwgNCwgNiwgMzcpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDcsIDQsIDcsIDM1KSxcblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBjYW5ub3QgZ28gYW55d2hlcmUgYW55bW9yZSBldmVuIGlmIHdlIGluc2lzdFxuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yQ29sdW1uU2VsZWN0UmlnaHQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdFJpZ2h0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge30pO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5DdXJzb3JDb2x1bW5TZWxlY3RSaWdodC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA0LCAxLCAyOCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNCwgMiwgMjgpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDQsIDMsIDMyKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig0LCA0LCA0LCAzNCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNSwgNCwgNSwgMzcpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDYsIDQsIDYsIDM3KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig3LCA0LCA3LCAzNSksXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gY2FuIGVhc2lseSBnbyBiYWNrXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckNvbHVtblNlbGVjdExlZnQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgMjgpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDI4KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCA0LCAzLCAzMiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgNCwgNCwgMzQpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDQsIDUsIDM2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig2LCA0LCA2LCAzNiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNywgNCwgNywgMzUpLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldFNlbGVjdGlvbiAvIHNldFBvc2l0aW9uIHdpdGggc291cmNlJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgdG9rZW5pemF0aW9uU3VwcG9ydDogSVRva2VuaXphdGlvblN1cHBvcnQgPSB7XG5cdFx0XHRnZXRJbml0aWFsU3RhdGU6ICgpID0+IE51bGxTdGF0ZSxcblx0XHRcdHRva2VuaXplOiB1bmRlZmluZWQhLFxuXHRcdFx0dG9rZW5pemVFbmNvZGVkOiAobGluZTogc3RyaW5nLCBoYXNFT0w6IGJvb2xlYW4sIHN0YXRlOiBJU3RhdGUpOiBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0ID0+IHtcblx0XHRcdFx0cmV0dXJuIG5ldyBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0KG5ldyBVaW50MzJBcnJheSgwKSwgW10sIHN0YXRlKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgTEFOR1VBR0VfSUQgPSAnbW9kZWxNb2RlVGVzdDEnO1xuXHRcdGNvbnN0IGxhbmd1YWdlUmVnaXN0cmF0aW9uID0gVG9rZW5pemF0aW9uUmVnaXN0cnkucmVnaXN0ZXIoTEFOR1VBR0VfSUQsIHRva2VuaXphdGlvblN1cHBvcnQpO1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdKdXN0IHRleHQnLCBMQU5HVUFHRV9JRCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yMSwgY3Vyc29yMSkgPT4ge1xuXHRcdFx0bGV0IGV2ZW50OiBJQ3Vyc29yUG9zaXRpb25DaGFuZ2VkRXZlbnQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gZWRpdG9yMS5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKGUgPT4ge1xuXHRcdFx0XHRldmVudCA9IGU7XG5cdFx0XHR9KTtcblxuXHRcdFx0ZWRpdG9yMS5zZXRTZWxlY3Rpb24obmV3IFJhbmdlKDEsIDIsIDEsIDMpLCAnbmF2aWdhdGlvbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50IS5zb3VyY2UsICduYXZpZ2F0aW9uJyk7XG5cblx0XHRcdGV2ZW50ID0gdW5kZWZpbmVkO1xuXHRcdFx0ZWRpdG9yMS5zZXRQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMiksICduYXZpZ2F0aW9uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQhLnNvdXJjZSwgJ25hdmlnYXRpb24nKTtcblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0bGFuZ3VhZ2VSZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0VkaXRvciBDb250cm9sbGVyJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN1cnJvdW5kaW5nTGFuZ3VhZ2VJZCA9ICdzdXJyb3VuZGluZ0xhbmd1YWdlJztcblx0Y29uc3QgaW5kZW50UnVsZXNMYW5ndWFnZUlkID0gJ2luZGVudFJ1bGVzTGFuZ3VhZ2UnO1xuXHRjb25zdCBlbGVjdHJpY0NoYXJMYW5ndWFnZUlkID0gJ2VsZWN0cmljQ2hhckxhbmd1YWdlJztcblx0Y29uc3QgYXV0b0Nsb3NpbmdMYW5ndWFnZUlkID0gJ2F1dG9DbG9zaW5nTGFuZ3VhZ2UnO1xuXHRjb25zdCBlbXB0eUNsb3NpbmdTdXJyb3VuZExhbmd1YWdlSWQgPSAnZW1wdHlDbG9zaW5nU3Vycm91bmRMYW5ndWFnZSc7XG5cblx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2U7XG5cdGxldCBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlQ29kZUVkaXRvclNlcnZpY2VzKGRpc3Bvc2FibGVzKTtcblx0XHRsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRsYW5ndWFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogc3Vycm91bmRpbmdMYW5ndWFnZUlkIH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihzdXJyb3VuZGluZ0xhbmd1YWdlSWQsIHtcblx0XHRcdGF1dG9DbG9zaW5nUGFpcnM6IFt7IG9wZW46ICcoJywgY2xvc2U6ICcpJyB9XVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiBlbXB0eUNsb3NpbmdTdXJyb3VuZExhbmd1YWdlSWQgfSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKGVtcHR5Q2xvc2luZ1N1cnJvdW5kTGFuZ3VhZ2VJZCwge1xuXHRcdFx0c3Vycm91bmRpbmdQYWlyczogW3sgb3BlbjogJzwnLCBjbG9zZTogJycgfV1cblx0XHR9KSk7XG5cblx0XHRzZXR1cEluZGVudFJ1bGVzTGFuZ3VhZ2UoaW5kZW50UnVsZXNMYW5ndWFnZUlkLCB7XG5cdFx0XHRkZWNyZWFzZUluZGVudFBhdHRlcm46IC9eXFxzKigoPyFcXFMuKlxcL1sqXSkuKlsqXVxcL1xccyopP1t9KVxcXV18XlxccyooY2FzZVxcYi4qfGRlZmF1bHQpOlxccyooXFwvXFwvLip8XFwvWypdLipbKl1cXC9cXHMqKT8kLyxcblx0XHRcdGluY3JlYXNlSW5kZW50UGF0dGVybjogL14oKD8hXFwvXFwvKS4pKihcXHtbXn1cIidgXSp8XFwoW14pXCInXSp8XFxbW15cXF1cIiddKnxeXFxzKihcXHtcXH18XFwoXFwpfFxcW1xcXXwoY2FzZVxcYi4qfGRlZmF1bHQpOikpXFxzKihcXC9cXC8uKnxcXC9bKl0uKlsqXVxcL1xccyopPyQvLFxuXHRcdFx0aW5kZW50TmV4dExpbmVQYXR0ZXJuOiAvXlxccyooZm9yfHdoaWxlfGlmfGVsc2UpXFxiKD8hLipbO3t9XVxccyooXFwvXFwvLip8XFwvWypdLipbKl1cXC9cXHMqKT8kKS8sXG5cdFx0XHR1bkluZGVudGVkTGluZVBhdHRlcm46IC9eKD8hLiooWzt7fV18XFxTOilcXHMqKFxcL1xcLy4qfFxcL1sqXS4qWypdXFwvXFxzKik/JCkoPyEuKihcXHtbXn1cIiddKnxcXChbXilcIiddKnxcXFtbXlxcXVwiJ10qfF5cXHMqKFxce1xcfXxcXChcXCl8XFxbXFxdfChjYXNlXFxiLip8ZGVmYXVsdCk6KSlcXHMqKFxcL1xcLy4qfFxcL1sqXS4qWypdXFwvXFxzKik/JCkoPyFeXFxzKigoPyFcXFMuKlxcL1sqXSkuKlsqXVxcL1xccyopP1t9KVxcXV18XlxccyooY2FzZVxcYi4qfGRlZmF1bHQpOlxccyooXFwvXFwvLip8XFwvWypdLipbKl1cXC9cXHMqKT8kKSg/IV5cXHMqKGZvcnx3aGlsZXxpZnxlbHNlKVxcYig/IS4qWzt7fV1cXHMqKFxcL1xcLy4qfFxcL1sqXS4qWypdXFwvXFxzKik/JCkpL1xuXHRcdH0pO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6IGVsZWN0cmljQ2hhckxhbmd1YWdlSWQgfSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKGVsZWN0cmljQ2hhckxhbmd1YWdlSWQsIHtcblx0XHRcdF9fZWxlY3RyaWNDaGFyYWN0ZXJTdXBwb3J0OiB7XG5cdFx0XHRcdGRvY0NvbW1lbnQ6IHsgb3BlbjogJy8qKicsIGNsb3NlOiAnICovJyB9XG5cdFx0XHR9LFxuXHRcdFx0YnJhY2tldHM6IFtcblx0XHRcdFx0Wyd7JywgJ30nXSxcblx0XHRcdFx0WydbJywgJ10nXSxcblx0XHRcdFx0WycoJywgJyknXVxuXHRcdFx0XVxuXHRcdH0pKTtcblxuXHRcdHNldHVwQXV0b0Nsb3NpbmdMYW5ndWFnZSgpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBzZXR1cE9uRW50ZXJMYW5ndWFnZShpbmRlbnRBY3Rpb246IEluZGVudEFjdGlvbik6IHN0cmluZyB7XG5cdFx0Y29uc3Qgb25FbnRlckxhbmd1YWdlSWQgPSAnb25FbnRlck1vZGUnO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6IG9uRW50ZXJMYW5ndWFnZUlkIH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihvbkVudGVyTGFuZ3VhZ2VJZCwge1xuXHRcdFx0b25FbnRlclJ1bGVzOiBbe1xuXHRcdFx0XHRiZWZvcmVUZXh0OiAvLiovLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRpbmRlbnRBY3Rpb246IGluZGVudEFjdGlvblxuXHRcdFx0XHR9XG5cdFx0XHR9XVxuXHRcdH0pKTtcblx0XHRyZXR1cm4gb25FbnRlckxhbmd1YWdlSWQ7XG5cdH1cblxuXHRmdW5jdGlvbiBzZXR1cEluZGVudFJ1bGVzTGFuZ3VhZ2UobGFuZ3VhZ2VJZDogc3RyaW5nLCBpbmRlbnRhdGlvblJ1bGVzOiBJbmRlbnRhdGlvblJ1bGUpOiBzdHJpbmcge1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiBsYW5ndWFnZUlkIH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihsYW5ndWFnZUlkLCB7XG5cdFx0XHRpbmRlbnRhdGlvblJ1bGVzOiBpbmRlbnRhdGlvblJ1bGVzXG5cdFx0fSkpO1xuXHRcdHJldHVybiBsYW5ndWFnZUlkO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2V0dXBBdXRvQ2xvc2luZ0xhbmd1YWdlKCkge1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiBhdXRvQ2xvc2luZ0xhbmd1YWdlSWQgfSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZCwge1xuXHRcdFx0Y29tbWVudHM6IHtcblx0XHRcdFx0YmxvY2tDb21tZW50OiBbJy8qJywgJyovJ11cblx0XHRcdH0sXG5cdFx0XHRhdXRvQ2xvc2luZ1BhaXJzOiBbXG5cdFx0XHRcdHsgb3BlbjogJ3snLCBjbG9zZTogJ30nIH0sXG5cdFx0XHRcdHsgb3BlbjogJ1snLCBjbG9zZTogJ10nIH0sXG5cdFx0XHRcdHsgb3BlbjogJygnLCBjbG9zZTogJyknIH0sXG5cdFx0XHRcdHsgb3BlbjogJ1xcJycsIGNsb3NlOiAnXFwnJywgbm90SW46IFsnc3RyaW5nJywgJ2NvbW1lbnQnXSB9LFxuXHRcdFx0XHR7IG9wZW46ICdcXFwiJywgY2xvc2U6ICdcXFwiJywgbm90SW46IFsnc3RyaW5nJ10gfSxcblx0XHRcdFx0eyBvcGVuOiAnYCcsIGNsb3NlOiAnYCcsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcblx0XHRcdFx0eyBvcGVuOiAnLyoqJywgY2xvc2U6ICcgKi8nLCBub3RJbjogWydzdHJpbmcnXSB9LFxuXHRcdFx0XHR7IG9wZW46ICdiZWdpbicsIGNsb3NlOiAnZW5kJywgbm90SW46IFsnc3RyaW5nJ10gfVxuXHRcdFx0XSxcblx0XHRcdF9fZWxlY3RyaWNDaGFyYWN0ZXJTdXBwb3J0OiB7XG5cdFx0XHRcdGRvY0NvbW1lbnQ6IHsgb3BlbjogJy8qKicsIGNsb3NlOiAnICovJyB9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2V0dXBBdXRvQ2xvc2luZ0xhbmd1YWdlVG9rZW5pemF0aW9uKCkge1xuXHRcdGNsYXNzIEJhc2VTdGF0ZSBpbXBsZW1lbnRzIElTdGF0ZSB7XG5cdFx0XHRjb25zdHJ1Y3Rvcihcblx0XHRcdFx0cHVibGljIHJlYWRvbmx5IHBhcmVudDogU3RhdGUgfCBudWxsID0gbnVsbFxuXHRcdFx0KSB7IH1cblx0XHRcdGNsb25lKCk6IElTdGF0ZSB7IHJldHVybiB0aGlzOyB9XG5cdFx0XHRlcXVhbHMob3RoZXI6IElTdGF0ZSk6IGJvb2xlYW4ge1xuXHRcdFx0XHRpZiAoIShvdGhlciBpbnN0YW5jZW9mIEJhc2VTdGF0ZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCF0aGlzLnBhcmVudCAmJiAhb3RoZXIucGFyZW50KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCF0aGlzLnBhcmVudCB8fCAhb3RoZXIucGFyZW50KSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGlzLnBhcmVudC5lcXVhbHMob3RoZXIucGFyZW50KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y2xhc3MgU3RyaW5nU3RhdGUgaW1wbGVtZW50cyBJU3RhdGUge1xuXHRcdFx0Y29uc3RydWN0b3IoXG5cdFx0XHRcdHB1YmxpYyByZWFkb25seSBjaGFyOiBzdHJpbmcsXG5cdFx0XHRcdHB1YmxpYyByZWFkb25seSBwYXJlbnRTdGF0ZTogU3RhdGVcblx0XHRcdCkgeyB9XG5cdFx0XHRjbG9uZSgpOiBJU3RhdGUgeyByZXR1cm4gdGhpczsgfVxuXHRcdFx0ZXF1YWxzKG90aGVyOiBJU3RhdGUpOiBib29sZWFuIHsgcmV0dXJuIG90aGVyIGluc3RhbmNlb2YgU3RyaW5nU3RhdGUgJiYgdGhpcy5jaGFyID09PSBvdGhlci5jaGFyICYmIHRoaXMucGFyZW50U3RhdGUuZXF1YWxzKG90aGVyLnBhcmVudFN0YXRlKTsgfVxuXHRcdH1cblx0XHRjbGFzcyBCbG9ja0NvbW1lbnRTdGF0ZSBpbXBsZW1lbnRzIElTdGF0ZSB7XG5cdFx0XHRjb25zdHJ1Y3Rvcihcblx0XHRcdFx0cHVibGljIHJlYWRvbmx5IHBhcmVudFN0YXRlOiBTdGF0ZVxuXHRcdFx0KSB7IH1cblx0XHRcdGNsb25lKCk6IElTdGF0ZSB7IHJldHVybiB0aGlzOyB9XG5cdFx0XHRlcXVhbHMob3RoZXI6IElTdGF0ZSk6IGJvb2xlYW4geyByZXR1cm4gb3RoZXIgaW5zdGFuY2VvZiBTdHJpbmdTdGF0ZSAmJiB0aGlzLnBhcmVudFN0YXRlLmVxdWFscyhvdGhlci5wYXJlbnRTdGF0ZSk7IH1cblx0XHR9XG5cdFx0dHlwZSBTdGF0ZSA9IEJhc2VTdGF0ZSB8IFN0cmluZ1N0YXRlIHwgQmxvY2tDb21tZW50U3RhdGU7XG5cblx0XHRjb25zdCBlbmNvZGVkTGFuZ3VhZ2VJZCA9IGxhbmd1YWdlU2VydmljZS5sYW5ndWFnZUlkQ29kZWMuZW5jb2RlTGFuZ3VhZ2VJZChhdXRvQ2xvc2luZ0xhbmd1YWdlSWQpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChUb2tlbml6YXRpb25SZWdpc3RyeS5yZWdpc3RlcihhdXRvQ2xvc2luZ0xhbmd1YWdlSWQsIHtcblx0XHRcdGdldEluaXRpYWxTdGF0ZTogKCkgPT4gbmV3IEJhc2VTdGF0ZSgpLFxuXHRcdFx0dG9rZW5pemU6IHVuZGVmaW5lZCEsXG5cdFx0XHR0b2tlbml6ZUVuY29kZWQ6IGZ1bmN0aW9uIChsaW5lOiBzdHJpbmcsIGhhc0VPTDogYm9vbGVhbiwgX3N0YXRlOiBJU3RhdGUpOiBFbmNvZGVkVG9rZW5pemF0aW9uUmVzdWx0IHtcblx0XHRcdFx0bGV0IHN0YXRlID0gPFN0YXRlPl9zdGF0ZTtcblx0XHRcdFx0Y29uc3QgdG9rZW5zOiB7IGxlbmd0aDogbnVtYmVyOyB0eXBlOiBTdGFuZGFyZFRva2VuVHlwZSB9W10gPSBbXTtcblx0XHRcdFx0Y29uc3QgZ2VuZXJhdGVUb2tlbiA9IChsZW5ndGg6IG51bWJlciwgdHlwZTogU3RhbmRhcmRUb2tlblR5cGUsIG5ld1N0YXRlPzogU3RhdGUpID0+IHtcblx0XHRcdFx0XHRpZiAodG9rZW5zLmxlbmd0aCA+IDAgJiYgdG9rZW5zW3Rva2Vucy5sZW5ndGggLSAxXS50eXBlID09PSB0eXBlKSB7XG5cdFx0XHRcdFx0XHQvLyBncm93IGxhc3QgdG9rZW5zXG5cdFx0XHRcdFx0XHR0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDFdLmxlbmd0aCArPSBsZW5ndGg7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRva2Vucy5wdXNoKHsgbGVuZ3RoLCB0eXBlIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRsaW5lID0gbGluZS5zdWJzdHJpbmcobGVuZ3RoKTtcblx0XHRcdFx0XHRpZiAobmV3U3RhdGUpIHtcblx0XHRcdFx0XHRcdHN0YXRlID0gbmV3U3RhdGU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0XHR3aGlsZSAobGluZS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0YWR2YW5jZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBVaW50MzJBcnJheSh0b2tlbnMubGVuZ3RoICogMik7XG5cdFx0XHRcdGxldCBzdGFydEluZGV4ID0gMDtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0b2tlbnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRyZXN1bHRbMiAqIGldID0gc3RhcnRJbmRleDtcblx0XHRcdFx0XHRyZXN1bHRbMiAqIGkgKyAxXSA9IChcblx0XHRcdFx0XHRcdChlbmNvZGVkTGFuZ3VhZ2VJZCA8PCBNZXRhZGF0YUNvbnN0cy5MQU5HVUFHRUlEX09GRlNFVClcblx0XHRcdFx0XHRcdHwgKHRva2Vuc1tpXS50eXBlIDw8IE1ldGFkYXRhQ29uc3RzLlRPS0VOX1RZUEVfT0ZGU0VUKVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0c3RhcnRJbmRleCArPSB0b2tlbnNbaV0ubGVuZ3RoO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBuZXcgRW5jb2RlZFRva2VuaXphdGlvblJlc3VsdChyZXN1bHQsIFtdLCBzdGF0ZSk7XG5cblx0XHRcdFx0ZnVuY3Rpb24gYWR2YW5jZSgpOiB2b2lkIHtcblx0XHRcdFx0XHRpZiAoc3RhdGUgaW5zdGFuY2VvZiBCYXNlU3RhdGUpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG0xID0gbGluZS5tYXRjaCgvXlteJ1wiYHt9L10rL2cpO1xuXHRcdFx0XHRcdFx0aWYgKG0xKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBnZW5lcmF0ZVRva2VuKG0xWzBdLmxlbmd0aCwgU3RhbmRhcmRUb2tlblR5cGUuT3RoZXIpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKC9eWydcImBdLy50ZXN0KGxpbmUpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBnZW5lcmF0ZVRva2VuKDEsIFN0YW5kYXJkVG9rZW5UeXBlLlN0cmluZywgbmV3IFN0cmluZ1N0YXRlKGxpbmUuY2hhckF0KDApLCBzdGF0ZSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKC9eey8udGVzdChsaW5lKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZ2VuZXJhdGVUb2tlbigxLCBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciwgbmV3IEJhc2VTdGF0ZShzdGF0ZSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKC9efS8udGVzdChsaW5lKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZ2VuZXJhdGVUb2tlbigxLCBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciwgc3RhdGUucGFyZW50IHx8IG5ldyBCYXNlU3RhdGUoKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoL15cXC9cXC8vLnRlc3QobGluZSkpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGdlbmVyYXRlVG9rZW4obGluZS5sZW5ndGgsIFN0YW5kYXJkVG9rZW5UeXBlLkNvbW1lbnQsIHN0YXRlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmICgvXlxcL1xcKi8udGVzdChsaW5lKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZ2VuZXJhdGVUb2tlbigyLCBTdGFuZGFyZFRva2VuVHlwZS5Db21tZW50LCBuZXcgQmxvY2tDb21tZW50U3RhdGUoc3RhdGUpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBnZW5lcmF0ZVRva2VuKDEsIFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyLCBzdGF0ZSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChzdGF0ZSBpbnN0YW5jZW9mIFN0cmluZ1N0YXRlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBtMSA9IGxpbmUubWF0Y2goL15bXlxcXFwnXCJgXFwkXSsvZyk7XG5cdFx0XHRcdFx0XHRpZiAobTEpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGdlbmVyYXRlVG9rZW4obTFbMF0ubGVuZ3RoLCBTdGFuZGFyZFRva2VuVHlwZS5TdHJpbmcpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKC9eXFxcXC8udGVzdChsaW5lKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZ2VuZXJhdGVUb2tlbigyLCBTdGFuZGFyZFRva2VuVHlwZS5TdHJpbmcpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGxpbmUuY2hhckF0KDApID09PSBzdGF0ZS5jaGFyKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBnZW5lcmF0ZVRva2VuKDEsIFN0YW5kYXJkVG9rZW5UeXBlLlN0cmluZywgc3RhdGUucGFyZW50U3RhdGUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKC9eXFwkXFx7Ly50ZXN0KGxpbmUpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBnZW5lcmF0ZVRva2VuKDIsIFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyLCBuZXcgQmFzZVN0YXRlKHN0YXRlKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gZ2VuZXJhdGVUb2tlbigxLCBTdGFuZGFyZFRva2VuVHlwZS5PdGhlciwgc3RhdGUpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoc3RhdGUgaW5zdGFuY2VvZiBCbG9ja0NvbW1lbnRTdGF0ZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbTEgPSBsaW5lLm1hdGNoKC9eW14qXSsvZyk7XG5cdFx0XHRcdFx0XHRpZiAobTEpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGdlbmVyYXRlVG9rZW4obTFbMF0ubGVuZ3RoLCBTdGFuZGFyZFRva2VuVHlwZS5TdHJpbmcpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKC9eXFwqXFwvLy50ZXN0KGxpbmUpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBnZW5lcmF0ZVRva2VuKDIsIFN0YW5kYXJkVG9rZW5UeXBlLkNvbW1lbnQsIHN0YXRlLnBhcmVudFN0YXRlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBnZW5lcmF0ZVRva2VuKDEsIFN0YW5kYXJkVG9rZW5UeXBlLk90aGVyLCBzdGF0ZSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgdW5rbm93biBzdGF0ZWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHNldEF1dG9DbG9zaW5nTGFuZ3VhZ2VFbmFibGVkU2V0KGNoYXJzOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihhdXRvQ2xvc2luZ0xhbmd1YWdlSWQsIHtcblx0XHRcdGF1dG9DbG9zZUJlZm9yZTogY2hhcnMsXG5cdFx0XHRhdXRvQ2xvc2luZ1BhaXJzOiBbXG5cdFx0XHRcdHsgb3BlbjogJ3snLCBjbG9zZTogJ30nIH0sXG5cdFx0XHRcdHsgb3BlbjogJ1snLCBjbG9zZTogJ10nIH0sXG5cdFx0XHRcdHsgb3BlbjogJygnLCBjbG9zZTogJyknIH0sXG5cdFx0XHRcdHsgb3BlbjogJ1xcJycsIGNsb3NlOiAnXFwnJywgbm90SW46IFsnc3RyaW5nJywgJ2NvbW1lbnQnXSB9LFxuXHRcdFx0XHR7IG9wZW46ICdcXFwiJywgY2xvc2U6ICdcXFwiJywgbm90SW46IFsnc3RyaW5nJ10gfSxcblx0XHRcdFx0eyBvcGVuOiAnYCcsIGNsb3NlOiAnYCcsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcblx0XHRcdFx0eyBvcGVuOiAnLyoqJywgY2xvc2U6ICcgKi8nLCBub3RJbjogWydzdHJpbmcnXSB9XG5cdFx0XHRdLFxuXHRcdH0pKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVRleHRNb2RlbCh0ZXh0OiBzdHJpbmcsIGxhbmd1YWdlSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsLCBvcHRpb25zOiBJUmVsYXhlZFRleHRNb2RlbENyZWF0aW9uT3B0aW9ucyA9IFRleHRNb2RlbC5ERUZBVUxUX0NSRUFUSU9OX09QVElPTlMsIHVyaTogVVJJIHwgbnVsbCA9IG51bGwpOiBUZXh0TW9kZWwge1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsIHRleHQsIGxhbmd1YWdlSWQsIG9wdGlvbnMsIHVyaSkpO1xuXHR9XG5cblx0ZnVuY3Rpb24gd2l0aFRlc3RDb2RlRWRpdG9yKHRleHQ6IElUZXh0TW9kZWwgfCBzdHJpbmcgfCBzdHJpbmdbXSwgb3B0aW9uczogVGVzdENvZGVFZGl0b3JJbnN0YW50aWF0aW9uT3B0aW9ucywgY2FsbGJhY2s6IChlZGl0b3I6IElUZXN0Q29kZUVkaXRvciwgdmlld01vZGVsOiBWaWV3TW9kZWwpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRsZXQgbW9kZWw6IElUZXh0TW9kZWw7XG5cdFx0aWYgKHR5cGVvZiB0ZXh0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0bW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwodGV4dCk7XG5cdFx0fSBlbHNlIGlmIChBcnJheS5pc0FycmF5KHRleHQpKSB7XG5cdFx0XHRtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCh0ZXh0LmpvaW4oJ1xcbicpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bW9kZWwgPSB0ZXh0O1xuXHRcdH1cblx0XHRjb25zdCBlZGl0b3IgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXN0Q29kZUVkaXRvcihpbnN0YW50aWF0aW9uU2VydmljZSwgbW9kZWwsIG9wdGlvbnMpKTtcblx0XHRjb25zdCB2aWV3TW9kZWwgPSBlZGl0b3IuZ2V0Vmlld01vZGVsKCkhO1xuXHRcdHZpZXdNb2RlbC5zZXRIYXNGb2N1cyh0cnVlKTtcblx0XHRjYWxsYmFjayhlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdH1cblxuXHRpbnRlcmZhY2UgSUN1cnNvck9wdHMge1xuXHRcdHRleHQ6IHN0cmluZ1tdO1xuXHRcdGxhbmd1YWdlSWQ/OiBzdHJpbmcgfCBudWxsO1xuXHRcdG1vZGVsT3B0cz86IElSZWxheGVkVGV4dE1vZGVsQ3JlYXRpb25PcHRpb25zO1xuXHRcdGVkaXRvck9wdHM/OiBJRWRpdG9yT3B0aW9ucztcblx0fVxuXG5cdGZ1bmN0aW9uIHVzaW5nQ3Vyc29yKG9wdHM6IElDdXJzb3JPcHRzLCBjYWxsYmFjazogKGVkaXRvcjogSVRlc3RDb2RlRWRpdG9yLCBtb2RlbDogVGV4dE1vZGVsLCB2aWV3TW9kZWw6IFZpZXdNb2RlbCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKG9wdHMudGV4dC5qb2luKCdcXG4nKSwgb3B0cy5sYW5ndWFnZUlkLCBvcHRzLm1vZGVsT3B0cyk7XG5cdFx0Y29uc3QgZWRpdG9yT3B0aW9uczogVGVzdENvZGVFZGl0b3JJbnN0YW50aWF0aW9uT3B0aW9ucyA9IG9wdHMuZWRpdG9yT3B0cyB8fCB7fTtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIGVkaXRvck9wdGlvbnMsIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Y2FsbGJhY2soZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKTtcblx0XHR9KTtcblx0fVxuXG5cdGNvbnN0IGVudW0gQXV0b0Nsb3NpbmdDb2x1bW5UeXBlIHtcblx0XHROb3JtYWwgPSAwLFxuXHRcdFNwZWNpYWwxID0gMSxcblx0XHRTcGVjaWFsMiA9IDJcblx0fVxuXG5cdGZ1bmN0aW9uIGV4dHJhY3RBdXRvQ2xvc2luZ1NwZWNpYWxDb2x1bW5zKG1heENvbHVtbjogbnVtYmVyLCBhbm5vdGF0ZWRMaW5lOiBzdHJpbmcpOiBBdXRvQ2xvc2luZ0NvbHVtblR5cGVbXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBBdXRvQ2xvc2luZ0NvbHVtblR5cGVbXSA9IFtdO1xuXHRcdGZvciAobGV0IGogPSAxOyBqIDw9IG1heENvbHVtbjsgaisrKSB7XG5cdFx0XHRyZXN1bHRbal0gPSBBdXRvQ2xvc2luZ0NvbHVtblR5cGUuTm9ybWFsO1xuXHRcdH1cblx0XHRsZXQgY29sdW1uID0gMTtcblx0XHRmb3IgKGxldCBqID0gMDsgaiA8IGFubm90YXRlZExpbmUubGVuZ3RoOyBqKyspIHtcblx0XHRcdGlmIChhbm5vdGF0ZWRMaW5lLmNoYXJBdChqKSA9PT0gJ3wnKSB7XG5cdFx0XHRcdHJlc3VsdFtjb2x1bW5dID0gQXV0b0Nsb3NpbmdDb2x1bW5UeXBlLlNwZWNpYWwxO1xuXHRcdFx0fSBlbHNlIGlmIChhbm5vdGF0ZWRMaW5lLmNoYXJBdChqKSA9PT0gJyEnKSB7XG5cdFx0XHRcdHJlc3VsdFtjb2x1bW5dID0gQXV0b0Nsb3NpbmdDb2x1bW5UeXBlLlNwZWNpYWwyO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29sdW1uKys7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRmdW5jdGlvbiBhc3NlcnRUeXBlKGVkaXRvcjogSVRlc3RDb2RlRWRpdG9yLCBtb2RlbDogSVRleHRNb2RlbCwgdmlld01vZGVsOiBWaWV3TW9kZWwsIGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIGNocjogc3RyaW5nLCBleHBlY3RlZEluc2VydDogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBsaW5lQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0gbGluZUNvbnRlbnQuc3Vic3RyKDAsIGNvbHVtbiAtIDEpICsgZXhwZWN0ZWRJbnNlcnQgKyBsaW5lQ29udGVudC5zdWJzdHIoY29sdW1uIC0gMSk7XG5cdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCBsaW5lTnVtYmVyLCBjb2x1bW4pO1xuXHRcdHZpZXdNb2RlbC50eXBlKGNociwgJ2tleWJvYXJkJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudChsaW5lTnVtYmVyKSwgZXhwZWN0ZWQsIG1lc3NhZ2UpO1xuXHRcdG1vZGVsLnVuZG8oKTtcblx0fVxuXG5cdHRlc3QoJ2lzc3VlIG1pY3Jvc29mdC9tb25hY28tZWRpdG9yIzQ0MzogSW5kZW50YXRpb24gb2YgYSBzaW5nbGUgcm93IGRlbGV0ZXMgc2VsZWN0ZWQgdGV4dCBpbiBzb21lIGNhc2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnSGVsbG8gd29ybGQhJyxcblx0XHRcdFx0J2Fub3RoZXIgbGluZSdcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7XG5cdFx0XHRcdGluc2VydFNwYWNlczogZmFsc2Vcblx0XHRcdH0sXG5cdFx0KTtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMTMpXSk7XG5cblx0XHRcdC8vIENoZWNrIHRoYXQgaW5kZW50aW5nIG1haW50YWlucyB0aGUgc2VsZWN0aW9uIHN0YXJ0IGF0IGNvbHVtbiAxXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlRhYiwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb24oKSwgbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxNCkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdCdWcgOTEyMTogQXV0byBpbmRlbnQgKyB1bmRvICsgcmVkbyBpcyBmdW5reScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0Jydcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7XG5cdFx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHRcdHRyaW1BdXRvV2hpdGVzcGFjZTogZmFsc2Vcblx0XHRcdH0sXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXFxuJywgJ2Fzc2VydDEnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5UYWIsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXFxuXFx0JywgJ2Fzc2VydDInKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXFxuXFx0XFxuXFx0JywgJ2Fzc2VydDMnKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ3gnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1xcblxcdFxcblxcdHgnLCAnYXNzZXJ0NCcpO1xuXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckxlZnQucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcXG5cXHRcXG5cXHR4JywgJ2Fzc2VydDUnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1xcblxcdFxcbngnLCAnYXNzZXJ0NicpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXFxuXFx0eCcsICdhc3NlcnQ3Jyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcXG54JywgJ2Fzc2VydDgnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ3gnLCAnYXNzZXJ0OScpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXFxueCcsICdhc3NlcnQxMCcpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXFxuXFx0XFxueCcsICdhc3NlcnQxMScpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXFxuXFx0XFxuXFx0eCcsICdhc3NlcnQxMicpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlJlZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXFxuXFx0XFxueCcsICdhc3NlcnQxMycpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlJlZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXFxueCcsICdhc3NlcnQxNCcpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlJlZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAneCcsICdhc3NlcnQxNScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjM1Mzk6IFNldHRpbmcgbW9kZWwgRU9MIGlzblxcJ3QgdW5kb2FibGUnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCdIZWxsbycsXG5cdFx0XHQnd29ybGQnXG5cdFx0XSwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cdFx0XHRtb2RlbC5zZXRFT0woRW5kT2ZMaW5lU2VxdWVuY2UuTEYpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdIZWxsb1xcbndvcmxkJyk7XG5cblx0XHRcdG1vZGVsLnB1c2hFT0woRW5kT2ZMaW5lU2VxdWVuY2UuQ1JMRik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ0hlbGxvXFxyXFxud29ybGQnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnSGVsbG9cXG53b3JsZCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDc3MzM6IFVuZG8gbWFuZ2xlcyB1bmljb2RlIGNoYXJhY3RlcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9ICdteU1vZGUnO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6IGxhbmd1YWdlSWQgfSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKGxhbmd1YWdlSWQsIHtcblx0XHRcdHN1cnJvdW5kaW5nUGFpcnM6IFt7IG9wZW46ICclJywgY2xvc2U6ICclJyB9XVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCdcXCdcdUQ4M0RcdURDNDFcXCcnLCBsYW5ndWFnZUlkKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDIpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJyUnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJyVcXCclXHVEODNEXHVEQzQxXFwnJywgJ2Fzc2VydDEnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1xcJ1x1RDgzRFx1REM0MVxcJycsICdhc3NlcnQyJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM0NjIwODogQWxsb3cgZW1wdHkgc2VsZWN0aW9ucyBpbiB0aGUgdW5kby9yZWRvIHN0YWNrJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCcnKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ0hlbGxvJywgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnICcsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ3dvcmxkJywgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnICcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnSGVsbG8gd29ybGQgJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMTMpKTtcblxuXHRcdFx0bW92ZUxlZnQoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsKTtcblxuXHRcdFx0bW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKFtdLCBbRWRpdE9wZXJhdGlvbi5yZXBsYWNlTW92ZShuZXcgUmFuZ2UoMSwgMTIsIDEsIDEzKSwgJycpXSwgKCkgPT4gW10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnSGVsbG8gd29ybGQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxMikpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnSGVsbG8gd29ybGQgJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDEzLCAxLCAxMykpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnSGVsbG8gd29ybGQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxMikpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnSGVsbG8nKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCA2KSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuUmVkbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdIZWxsbycpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDYpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5SZWRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ0hlbGxvIHdvcmxkJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMTIpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5SZWRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ0hlbGxvIHdvcmxkICcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEzKSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuUmVkbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdIZWxsbyB3b3JsZCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEyKSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuUmVkbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdIZWxsbyB3b3JsZCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEyKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1ZyAjMTY4MTU6U2hpZnQrVGFiIGRvZXNuXFwndCBnbyBiYWNrIHRvIHRhYnN0b3AnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHNldHVwT25FbnRlckxhbmd1YWdlKEluZGVudEFjdGlvbi5JbmRlbnRPdXRkZW50KTtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0JyAgICAgZnVuY3Rpb24gYmF6KCkgeydcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHRsYW5ndWFnZUlkXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCA2LCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDYsIDEsIDYpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5PdXRkZW50LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJyAgICBmdW5jdGlvbiBiYXooKSB7Jyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDUpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQnVnICMxODI5MzpbcmVncmVzc2lvbl1bZWRpdG9yXSBDYW5cXCd0IG91dGRlbnQgd2hpdGVzcGFjZSBsaW5lJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnICAgICAgJ1xuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgNywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA3LCAxLCA3KSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuT3V0ZGVudCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcgICAgJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDUpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzk1NTkxOiBVbmluZGVudGluZyBtb3ZlcyBjdXJzb3IgdG8gYmVnaW5uaW5nIG9mIGxpbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCcgICAgICAgICdcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IHVzZVRhYlN0b3BzOiBmYWxzZSB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgOSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA5LCAxLCA5KSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuT3V0ZGVudCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcgICAgJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDUpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQnVnICMxNjY1NzogW2VkaXRvcl0gVGFiIG9uIGVtcHR5IGxpbmUgb2YgemVybyBpbmRlbnRhdGlvbiBtb3ZlcyBjdXJzb3IgdG8gcG9zaXRpb24gKDEsMSknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdmdW5jdGlvbiBiYXooKSB7Jyxcblx0XHRcdFx0J1xcdGZ1bmN0aW9uIGhlbGxvKCkgeyAvLyBzb21ldGhpbmcgaGVyZScsXG5cdFx0XHRcdCdcXHQnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J1xcdH0nLFxuXHRcdFx0XHQnfScsXG5cdFx0XHRcdCcnXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0e1xuXHRcdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0fSxcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDcsIDEsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNywgMSwgNywgMSkpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlRhYiwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNyksICdcXHQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNywgMiwgNywgMikpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdidWcgIzE2NzQwOiBbZWRpdG9yXSBDdXQgbGluZSBkb2VzblxcJ3QgcXVpdGUgY3V0IHRoZSBsYXN0IGxpbmUnLCAoKSA9PiB7XG5cblx0XHQvLyBQYXJ0IDEgPT4gdGhlcmUgaXMgdGV4dCBvbiB0aGUgbGFzdCBsaW5lXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCdhc2Rhc2QnLFxuXHRcdFx0J3F3ZXJ0eSdcblx0XHRdLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCAxLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDEpKTtcblxuXHRcdFx0dmlld01vZGVsLmN1dCgna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ291bnQoKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdhc2Rhc2QnKTtcblxuXHRcdH0pO1xuXG5cdFx0Ly8gUGFydCAyID0+IHRoZXJlIGlzIG5vIHRleHQgb24gdGhlIGxhc3QgbGluZVxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHQnYXNkYXNkJyxcblx0XHRcdCcnXG5cdFx0XSwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgMSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCAxLCAyLCAxKSk7XG5cblx0XHRcdHZpZXdNb2RlbC5jdXQoJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvdW50KCksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnYXNkYXNkJyk7XG5cblx0XHRcdHZpZXdNb2RlbC5jdXQoJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvdW50KCksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMjg2MDI6IFdoZW4gY3V0dGluZyBtdWx0aXBsZSBsaW5lcyAoY3RybCB4KSwgdGhlIGxhc3QgbGluZSB3aWxsIG5vdCBiZSBlcmFzZWQnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCdhMScsXG5cdFx0XHQnYTInLFxuXHRcdFx0J2EzJ1xuXHRcdF0sIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCkhO1xuXG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxLCAyLCAxKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCAxLCAzLCAxKSxcblx0XHRcdF0pO1xuXG5cdFx0XHR2aWV3TW9kZWwuY3V0KCdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb3VudCgpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdCdWcgIzExNDc2OiBEb3VibGUgYnJhY2tldCBzdXJyb3VuZGluZyArIHVuZG8gaXMgYnJva2VuJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J2hlbGxvJ1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IHN1cnJvdW5kaW5nTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMywgZmFsc2UpO1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCA1LCB0cnVlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMywgMSwgNSkpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnKCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA2KSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCcoJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDcpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzIwNjc3NDogU3Vycm91bmRTZWxlY3Rpb25Db21tYW5kIHdpdGggZW1wdHkgY2hhckFmdGVyU2VsZWN0aW9uIHNob3VsZCBub3QgdGhyb3cnLCAoKSA9PiB7XG5cdFx0Ly8gVGhpcyB0ZXN0IHJlcHJvZHVjZXMgdGhlIGlzc3VlIHdoZXJlIFN1cnJvdW5kU2VsZWN0aW9uQ29tbWFuZCB0aHJvd3Mgd2hlbiBjaGFyQWZ0ZXJTZWxlY3Rpb24gaXMgZW1wdHlcblx0XHQvLyBUaGUgcHJvYmxlbSBpcyB0aGF0IGFkZFRyYWNrZWRFZGl0T3BlcmF0aW9uIGlnbm9yZXMgZW1wdHkgc3RyaW5ncywgY2F1c2luZyBjb21wdXRlQ3Vyc29yU3RhdGUgdG8gZmFpbFxuXHRcdC8vIHdoZW4gdHJ5aW5nIHRvIGFjY2VzcyBpbnZlcnNlRWRpdE9wZXJhdGlvbnNbMV0ucmFuZ2UgKHdoaWNoIGlzIHVuZGVmaW5lZClcblxuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J2hlbGxvIHdvcmxkJ1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGVtcHR5Q2xvc2luZ1N1cnJvdW5kTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdC8vIFNlbGVjdCBcImhlbGxvXCJcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMSwgZmFsc2UpO1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCA2LCB0cnVlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgNikpO1xuXG5cdFx0XHQvLyBUeXBlIDwgd2hpY2ggc2hvdWxkIHN1cnJvdW5kIHdpdGggJzwnIGFuZCBlbXB0eSBzdHJpbmdcblx0XHRcdC8vIFRoaXMgcmVwcm9kdWNlcyB0aGUgY3Jhc2ggd2hlcmUgY2hhckFmdGVyU2VsZWN0aW9uIGlzIGVtcHR5XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnPCcsICdrZXlib2FyZCcpO1xuXG5cdFx0XHQvLyBUZXN0IHBhc3NlcyBpZiB3ZSBkb24ndCBjcmFzaCAtIHRoZSBleGFjdCBjdXJzb3IgcG9zaXRpb24gZGVwZW5kcyBvbiB0aGUgZml4XG5cdFx0XHQvLyBUaGUgbWFpbiBpc3N1ZSBpcyB0aGF0IGNvbXB1dGVDdXJzb3JTdGF0ZSBmYWlscyB3aGVuIGNoYXJBZnRlclNlbGVjdGlvbiBpcyBlbXB0eVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICc8aGVsbG8gd29ybGQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzExNDA6IEJhY2tzcGFjZSBzdG9wcyBwcmVtYXR1cmVseScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J2Z1bmN0aW9uIGJheigpIHsnLFxuXHRcdFx0XHQnICByZXR1cm4gMTsnLFxuXHRcdFx0XHQnfTsnXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCAyLCBmYWxzZSk7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDE0LCB0cnVlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMywgMiwgMSwgMTQpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMTQsIDEsIDE0KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvdW50KCksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnZnVuY3Rpb24gYmF6KDsnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEwMjEyOiBQYXN0aW5nIGVudGlyZSBsaW5lIGRvZXMgbm90IHJlcGxhY2Ugc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J2xpbmUxJyxcblx0XHRcdFx0J2xpbmUyJ1xuXHRcdFx0XSxcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDEsIGZhbHNlKTtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgNiwgdHJ1ZSk7XG5cblx0XHRcdHZpZXdNb2RlbC5wYXN0ZSgnbGluZTFcXG4nLCB0cnVlKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnbGluZTEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ2xpbmUxJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICcnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzc0NzIyOiBQYXN0aW5nIHdob2xlIGxpbmUgZG9lcyBub3QgcmVwbGFjZSBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnbGluZTEnLFxuXHRcdFx0XHQnbGluZSBzZWwgMicsXG5cdFx0XHRcdCdsaW5lMydcblx0XHRcdF0sXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigyLCA2LCAyLCA5KV0pO1xuXG5cdFx0XHR2aWV3TW9kZWwucGFzdGUoJ2xpbmUxXFxuJywgdHJ1ZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ2xpbmUxJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdsaW5lIGxpbmUxJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICcgMicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDQpLCAnbGluZTMnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzQ5OTY6IE11bHRpcGxlIGN1cnNvciBwYXN0ZSBwYXN0ZXMgY29udGVudHMgb2YgYWxsIGN1cnNvcnMnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnbGluZTEnLFxuXHRcdFx0XHQnbGluZTInLFxuXHRcdFx0XHQnbGluZTMnXG5cdFx0XHRdLFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksIG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSldKTtcblxuXHRcdFx0dmlld01vZGVsLnBhc3RlKFxuXHRcdFx0XHQnYVxcbmJcXG5jXFxuZCcsXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0J2FcXG5iJyxcblx0XHRcdFx0XHQnY1xcbmQnXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdhJyxcblx0XHRcdFx0J2JsaW5lMScsXG5cdFx0XHRcdCdjJyxcblx0XHRcdFx0J2RsaW5lMicsXG5cdFx0XHRcdCdsaW5lMydcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTYxNTU6IFBhc3RlIGludG8gbXVsdGlwbGUgY3Vyc29ycyBoYXMgZWRnZSBjYXNlIHdoZW4gbnVtYmVyIG9mIGxpbmVzIGVxdWFscyBudW1iZXIgb2YgY3Vyc29ycyAtIDEnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQndGVzdCcsXG5cdFx0XHRcdCd0ZXN0Jyxcblx0XHRcdFx0J3Rlc3QnLFxuXHRcdFx0XHQndGVzdCdcblx0XHRcdF0sXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgMSwgMywgNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgMSwgNCwgNSksXG5cdFx0XHRdKTtcblxuXHRcdFx0dmlld01vZGVsLnBhc3RlKFxuXHRcdFx0XHQnYWFhXFxuYmJiXFxuY2NjXFxuJyxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdG51bGxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdhYWEnLFxuXHRcdFx0XHQnYmJiJyxcblx0XHRcdFx0J2NjYycsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnYWFhJyxcblx0XHRcdFx0J2JiYicsXG5cdFx0XHRcdCdjY2MnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J2FhYScsXG5cdFx0XHRcdCdiYmInLFxuXHRcdFx0XHQnY2NjJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdhYWEnLFxuXHRcdFx0XHQnYmJiJyxcblx0XHRcdFx0J2NjYycsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM0MzcyMjogTXVsdGlsaW5lIHBhc3RlIGRvZXNuXFwndCB3b3JrIGFueW1vcmUnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQndGVzdCcsXG5cdFx0XHRcdCd0ZXN0Jyxcblx0XHRcdFx0J3Rlc3QnLFxuXHRcdFx0XHQndGVzdCdcblx0XHRcdF0sXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgMSwgMywgNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgMSwgNCwgNSksXG5cdFx0XHRdKTtcblxuXHRcdFx0dmlld01vZGVsLnBhc3RlKFxuXHRcdFx0XHQnYWFhXFxyXFxuYmJiXFxyXFxuY2NjXFxyXFxuZGRkXFxyXFxuJyxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRcdG51bGxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdhYWEnLFxuXHRcdFx0XHQnYmJiJyxcblx0XHRcdFx0J2NjYycsXG5cdFx0XHRcdCdkZGQnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM0NjQ0MDogKDEpIFBhc3RpbmcgYSBtdWx0aS1saW5lIHNlbGVjdGlvbiBwYXN0ZXMgZW50aXJlIHNlbGVjdGlvbiBpbnRvIGV2ZXJ5IGluc2VydGlvbiBwb2ludCcsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdsaW5lMScsXG5cdFx0XHRcdCdsaW5lMicsXG5cdFx0XHRcdCdsaW5lMydcblx0XHRcdF0sXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSwgbmV3IFNlbGVjdGlvbigyLCAxLCAyLCAxKSwgbmV3IFNlbGVjdGlvbigzLCAxLCAzLCAxKV0pO1xuXG5cdFx0XHR2aWV3TW9kZWwucGFzdGUoXG5cdFx0XHRcdCdhXFxuYlxcbmMnLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0bnVsbFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J2FsaW5lMScsXG5cdFx0XHRcdCdibGluZTInLFxuXHRcdFx0XHQnY2xpbmUzJ1xuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM0NjQ0MDogKDIpIFBhc3RpbmcgYSBtdWx0aS1saW5lIHNlbGVjdGlvbiBwYXN0ZXMgZW50aXJlIHNlbGVjdGlvbiBpbnRvIGV2ZXJ5IGluc2VydGlvbiBwb2ludCcsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdsaW5lMScsXG5cdFx0XHRcdCdsaW5lMicsXG5cdFx0XHRcdCdsaW5lMydcblx0XHRcdF0sXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSwgbmV3IFNlbGVjdGlvbigyLCAxLCAyLCAxKSwgbmV3IFNlbGVjdGlvbigzLCAxLCAzLCAxKV0pO1xuXG5cdFx0XHR2aWV3TW9kZWwucGFzdGUoXG5cdFx0XHRcdCdhXFxuYlxcbmNcXG4nLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0bnVsbFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J2FsaW5lMScsXG5cdFx0XHRcdCdibGluZTInLFxuXHRcdFx0XHQnY2xpbmUzJ1xuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyNTYwMzk6IHBhc3RlIGZyb20gbXVsdGlwbGUgY3Vyc29ycyB3aXRoIGVtcHR5IHNlbGVjdGlvbnMgYW5kIG11bHRpQ3Vyc29yUGFzdGUgZnVsbCcsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdsaW5lMScsXG5cdFx0XHRcdCdsaW5lMicsXG5cdFx0XHRcdCdsaW5lMydcblx0XHRcdF0sXG5cdFx0XHRlZGl0b3JPcHRzOiB7XG5cdFx0XHRcdG11bHRpQ3Vyc29yUGFzdGU6ICdmdWxsJ1xuXHRcdFx0fVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdC8vIDIgY3Vyc29ycyBvbiBsaW5lcyAxIGFuZCAyXG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLCBuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDEpXSk7XG5cblx0XHRcdHZpZXdNb2RlbC5wYXN0ZShcblx0XHRcdFx0J2xpbmUxXFxubGluZTJcXG4nLFxuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRbJ2xpbmUxXFxuJywgJ2xpbmUyXFxuJ11cblx0XHRcdCk7XG5cblx0XHRcdC8vIEVhY2ggY3Vyc29yIGdldHMgaXRzIHJlc3BlY3RpdmUgbGluZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J2xpbmUxJyxcblx0XHRcdFx0J2xpbmUxJyxcblx0XHRcdFx0J2xpbmUyJyxcblx0XHRcdFx0J2xpbmUyJyxcblx0XHRcdFx0J2xpbmUzJ1xuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMzMDcxOiBJbnZlc3RpZ2F0ZSB3aHkgdW5kbyBzdGFjayBnZXRzIGNvcnJ1cHRlZCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J3NvbWUgbGluZXMnLFxuXHRcdFx0XHQnYW5kIG1vcmUgbGluZXMnLFxuXHRcdFx0XHQnanVzdCBzb21lIHRleHQnLFxuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMSwgZmFsc2UpO1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCA0LCB0cnVlKTtcblxuXHRcdFx0bGV0IGlzRmlyc3QgPSB0cnVlO1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IG1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB7XG5cdFx0XHRcdGlmIChpc0ZpcnN0KSB7XG5cdFx0XHRcdFx0aXNGaXJzdCA9IGZhbHNlO1xuXHRcdFx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXHQnLCAna2V5Ym9hcmQnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVGFiLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdcXHQganVzdCBzb21lIHRleHQnXG5cdFx0XHRdLmpvaW4oJ1xcbicpLCAnMDAxJyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnICAgIHNvbWUgbGluZXMnLFxuXHRcdFx0XHQnICAgIGFuZCBtb3JlIGxpbmVzJyxcblx0XHRcdFx0JyAgICBqdXN0IHNvbWUgdGV4dCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLCAnMDAyJyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnc29tZSBsaW5lcycsXG5cdFx0XHRcdCdhbmQgbW9yZSBsaW5lcycsXG5cdFx0XHRcdCdqdXN0IHNvbWUgdGV4dCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLCAnMDAzJyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgW1xuXHRcdFx0XHQnc29tZSBsaW5lcycsXG5cdFx0XHRcdCdhbmQgbW9yZSBsaW5lcycsXG5cdFx0XHRcdCdqdXN0IHNvbWUgdGV4dCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLCAnMDA0Jyk7XG5cblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTI5NTA6IENhbm5vdCBEb3VibGUgQ2xpY2sgVG8gSW5zZXJ0IEVtb2ppIFVzaW5nIE9TWCBFbW9qaSBQYW5lbCcsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdzb21lIGxpbmVzJyxcblx0XHRcdFx0J2FuZCBtb3JlIGxpbmVzJyxcblx0XHRcdFx0J2p1c3Qgc29tZSB0ZXh0Jyxcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBudWxsXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCAxLCBmYWxzZSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcdUQ4M0RcdURFMEQnLCAna2V5Ym9hcmQnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0J3NvbWUgbGluZXMnLFxuXHRcdFx0XHQnYW5kIG1vcmUgbGluZXMnLFxuXHRcdFx0XHQnXHVEODNEXHVERTBEanVzdCBzb21lIHRleHQnLFxuXHRcdFx0XS5qb2luKCdcXG4nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMzNDYzOiBwcmVzc2luZyB0YWIgYWRkcyBzcGFjZXMsIGJ1dCBub3QgYXMgbWFueSBhcyBmb3IgYSB0YWInLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdmdW5jdGlvbiBhKCkgeycsXG5cdFx0XHRcdCdcXHR2YXIgYSA9IHsnLFxuXHRcdFx0XHQnXFx0XFx0eDogMycsXG5cdFx0XHRcdCdcXHR9OycsXG5cdFx0XHRcdCd9Jyxcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDIsIGZhbHNlKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVGFiLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJ1xcdCAgICBcXHR4OiAzJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM0MzEyOiB0cnlpbmcgdG8gdHlwZSBhIHRhYiBjaGFyYWN0ZXIgb3ZlciBhIHNlcXVlbmNlIG9mIHNwYWNlcyByZXN1bHRzIGluIHVuZXhwZWN0ZWQgYmVoYXZpb3VyJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQndmFyIGZvbyA9IDEyMzsgICAgICAgLy8gdGhpcyBpcyBhIGNvbW1lbnQnLFxuXHRcdFx0XHQndmFyIGJhciA9IDQ7ICAgICAgIC8vIGFub3RoZXIgY29tbWVudCdcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7XG5cdFx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAxNSwgZmFsc2UpO1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAyMiwgdHJ1ZSk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlRhYiwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICd2YXIgZm9vID0gMTIzO1xcdC8vIHRoaXMgaXMgYSBjb21tZW50Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM4MzI6IHdvcmQgcmlnaHQnLCAoKSA9PiB7XG5cblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCBhKz0gMyArNS0zICsgNyAqLyAgJ1xuXHRcdFx0XSxcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDEsIGZhbHNlKTtcblxuXHRcdFx0ZnVuY3Rpb24gYXNzZXJ0V29yZFJpZ2h0KGNvbDogbnVtYmVyLCBleHBlY3RlZENvbDogbnVtYmVyKSB7XG5cdFx0XHRcdGNvbnN0IGFyZ3MgPSB7XG5cdFx0XHRcdFx0cG9zaXRpb246IHtcblx0XHRcdFx0XHRcdGxpbmVOdW1iZXI6IDEsXG5cdFx0XHRcdFx0XHRjb2x1bW46IGNvbFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdFx0aWYgKGNvbCA9PT0gMSkge1xuXHRcdFx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuV29yZFNlbGVjdC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIGFyZ3MpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuV29yZFNlbGVjdERyYWcucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCBhcmdzKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0U2VsZWN0aW9uKCkuc3RhcnRDb2x1bW4sIDEsICdURVNUIEZPUiAnICsgY29sKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb24oKS5lbmRDb2x1bW4sIGV4cGVjdGVkQ29sLCAnVEVTVCBGT1IgJyArIGNvbCk7XG5cdFx0XHR9XG5cblx0XHRcdGFzc2VydFdvcmRSaWdodCgxLCAnICAgJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCgyLCAnICAgJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCgzLCAnICAgJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCg0LCAnICAgJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCg1LCAnICAgLycubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoNiwgJyAgIC8qJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCg3LCAnICAgLyogJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCg4LCAnICAgLyogSnVzdCcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoOSwgJyAgIC8qIEp1c3QnLmxlbmd0aCArIDEpO1xuXHRcdFx0YXNzZXJ0V29yZFJpZ2h0KDEwLCAnICAgLyogSnVzdCcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMTEsICcgICAvKiBKdXN0Jy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCgxMiwgJyAgIC8qIEp1c3QgJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCgxMywgJyAgIC8qIEp1c3Qgc29tZScubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMTQsICcgICAvKiBKdXN0IHNvbWUnLmxlbmd0aCArIDEpO1xuXHRcdFx0YXNzZXJ0V29yZFJpZ2h0KDE1LCAnICAgLyogSnVzdCBzb21lJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCgxNiwgJyAgIC8qIEp1c3Qgc29tZScubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMTcsICcgICAvKiBKdXN0IHNvbWUgJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCgxOCwgJyAgIC8qIEp1c3Qgc29tZSAgJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCgxOSwgJyAgIC8qIEp1c3Qgc29tZSAgICcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMjAsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCgyMSwgJyAgIC8qIEp1c3Qgc29tZSAgIG1vcmUnLmxlbmd0aCArIDEpO1xuXHRcdFx0YXNzZXJ0V29yZFJpZ2h0KDIyLCAnICAgLyogSnVzdCBzb21lICAgbW9yZScubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMjMsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCgyNCwgJyAgIC8qIEp1c3Qgc29tZSAgIG1vcmUgJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCgyNSwgJyAgIC8qIEp1c3Qgc29tZSAgIG1vcmUgICcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMjYsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCgyNywgJyAgIC8qIEp1c3Qgc29tZSAgIG1vcmUgICB0ZXh0Jy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCgyOCwgJyAgIC8qIEp1c3Qgc29tZSAgIG1vcmUgICB0ZXh0Jy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCgyOSwgJyAgIC8qIEp1c3Qgc29tZSAgIG1vcmUgICB0ZXh0Jy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCgzMCwgJyAgIC8qIEp1c3Qgc29tZSAgIG1vcmUgICB0ZXh0Jy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCgzMSwgJyAgIC8qIEp1c3Qgc29tZSAgIG1vcmUgICB0ZXh0ICcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMzIsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCBhJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCgzMywgJyAgIC8qIEp1c3Qgc29tZSAgIG1vcmUgICB0ZXh0IGErJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCgzNCwgJyAgIC8qIEp1c3Qgc29tZSAgIG1vcmUgICB0ZXh0IGErPScubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMzUsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCBhKz0gJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCgzNiwgJyAgIC8qIEp1c3Qgc29tZSAgIG1vcmUgICB0ZXh0IGErPSAzJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCgzNywgJyAgIC8qIEp1c3Qgc29tZSAgIG1vcmUgICB0ZXh0IGErPSAzICcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoMzgsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCBhKz0gMyArJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCgzOSwgJyAgIC8qIEp1c3Qgc29tZSAgIG1vcmUgICB0ZXh0IGErPSAzICs1Jy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCg0MCwgJyAgIC8qIEp1c3Qgc29tZSAgIG1vcmUgICB0ZXh0IGErPSAzICs1LScubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoNDEsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCBhKz0gMyArNS0zJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCg0MiwgJyAgIC8qIEp1c3Qgc29tZSAgIG1vcmUgICB0ZXh0IGErPSAzICs1LTMgJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCg0MywgJyAgIC8qIEp1c3Qgc29tZSAgIG1vcmUgICB0ZXh0IGErPSAzICs1LTMgKycubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoNDQsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCBhKz0gMyArNS0zICsgJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCg0NSwgJyAgIC8qIEp1c3Qgc29tZSAgIG1vcmUgICB0ZXh0IGErPSAzICs1LTMgKyA3Jy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCg0NiwgJyAgIC8qIEp1c3Qgc29tZSAgIG1vcmUgICB0ZXh0IGErPSAzICs1LTMgKyA3ICcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoNDcsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCBhKz0gMyArNS0zICsgNyAqJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCg0OCwgJyAgIC8qIEp1c3Qgc29tZSAgIG1vcmUgICB0ZXh0IGErPSAzICs1LTMgKyA3ICovJy5sZW5ndGggKyAxKTtcblx0XHRcdGFzc2VydFdvcmRSaWdodCg0OSwgJyAgIC8qIEp1c3Qgc29tZSAgIG1vcmUgICB0ZXh0IGErPSAzICs1LTMgKyA3ICovICcubGVuZ3RoICsgMSk7XG5cdFx0XHRhc3NlcnRXb3JkUmlnaHQoNTAsICcgICAvKiBKdXN0IHNvbWUgICBtb3JlICAgdGV4dCBhKz0gMyArNS0zICsgNyAqLyAgJy5sZW5ndGggKyAxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzMzNzg4OiBXcm9uZyBjdXJzb3IgcG9zaXRpb24gd2hlbiBkb3VibGUgY2xpY2sgdG8gc2VsZWN0IGEgd29yZCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J0p1c3Qgc29tZSB0ZXh0J1xuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuV29yZFNlbGVjdC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHsgcG9zaXRpb246IG5ldyBQb3NpdGlvbigxLCA4KSB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldFNlbGVjdGlvbigpLCBuZXcgU2VsZWN0aW9uKDEsIDYsIDEsIDEwKSk7XG5cblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuV29yZFNlbGVjdERyYWcucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7IHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oMSwgOCkgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb24oKSwgbmV3IFNlbGVjdGlvbigxLCA2LCAxLCAxMCkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTI4ODc6IERvdWJsZS1jbGljayBoaWdobGlnaHRpbmcgc2VwYXJhdGluZyB3aGl0ZSBzcGFjZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J2FiYyBkZWYnXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5Xb3JkU2VsZWN0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwgeyBwb3NpdGlvbjogbmV3IFBvc2l0aW9uKDEsIDUpIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0U2VsZWN0aW9uKCksIG5ldyBTZWxlY3Rpb24oMSwgNSwgMSwgOCkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdEb3VibGUtY2xpY2sgb24gcHVuY3R1YXRpb24gc2hvdWxkIHNlbGVjdCB0aGUgY2hhcmFjdGVyLCBub3QgYWRqYWNlbnQgc3BhY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCcvLyBhIGIgYyAxIDIgMyB+ICEgQCAjICQgJSBeICYgKiAoICkgXyArIFxcXFwgLydcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHQvLyBUZXN0IGRvdWJsZS1jbGljayBvbiAnQCcgYXQgcG9zaXRpb24gMjBcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuV29yZFNlbGVjdC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHsgcG9zaXRpb246IG5ldyBQb3NpdGlvbigxLCAyMCkgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb24oKSwgbmV3IFNlbGVjdGlvbigxLCAyMCwgMSwgMjEpLCAnU2hvdWxkIHNlbGVjdCBAIGNoYXJhY3RlcicpO1xuXG5cdFx0XHQvLyBUZXN0IGRvdWJsZS1jbGljayBvbiAnIycgYXQgcG9zaXRpb24gMjJcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuV29yZFNlbGVjdC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHsgcG9zaXRpb246IG5ldyBQb3NpdGlvbigxLCAyMikgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb24oKSwgbmV3IFNlbGVjdGlvbigxLCAyMiwgMSwgMjMpLCAnU2hvdWxkIHNlbGVjdCAjIGNoYXJhY3RlcicpO1xuXG5cdFx0XHQvLyBUZXN0IGRvdWJsZS1jbGljayBvbiAnIScgYXQgcG9zaXRpb24gMThcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuV29yZFNlbGVjdC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHsgcG9zaXRpb246IG5ldyBQb3NpdGlvbigxLCAxOCkgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb24oKSwgbmV3IFNlbGVjdGlvbigxLCAxOCwgMSwgMTkpLCAnU2hvdWxkIHNlbGVjdCAhIGNoYXJhY3RlcicpO1xuXG5cdFx0XHQvLyBUZXN0IGRvdWJsZS1jbGljayBvbiBmaXJzdCAnLycgaW4gJy8vJyBhdCBwb3NpdGlvbiAxXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLldvcmRTZWxlY3QucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7IHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oMSwgMSkgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb24oKSwgbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAzKSwgJ1Nob3VsZCBzZWxlY3QgLy8gdG9rZW4nKTtcblxuXHRcdFx0Ly8gVGVzdCBkb3VibGUtY2xpY2sgb24gc2Vjb25kICcvJyBpbiAnLy8nIGF0IHBvc2l0aW9uIDJcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuV29yZFNlbGVjdC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHsgcG9zaXRpb246IG5ldyBQb3NpdGlvbigxLCAyKSB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldFNlbGVjdGlvbigpLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDMpLCAnU2hvdWxkIHNlbGVjdCAvLyB0b2tlbicpO1xuXG5cdFx0XHQvLyBUZXN0IGRvdWJsZS1jbGljayBvbiAnXFwnIGF0IHBvc2l0aW9uIDQyXG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLldvcmRTZWxlY3QucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7IHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oMSwgNDIpIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0U2VsZWN0aW9uKCksIG5ldyBTZWxlY3Rpb24oMSwgNDIsIDEsIDQzKSwgJ1Nob3VsZCBzZWxlY3QgXFxcXCBjaGFyYWN0ZXInKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzk2NzU6IFVuZG8vUmVkbyBhZGRzIGEgc3RvcCBpbiBiZXR3ZWVuIENITiBDaGFyYWN0ZXJzJywgKCkgPT4ge1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXSwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXG5cdFx0XHQvLyBUeXBpbmcgc2VubnNlaSBpbiBKYXBhbmVzZSAtIEhpcmFnYW5hXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXHVGRjUzJywgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwuY29tcG9zaXRpb25UeXBlKCdcdTMwNUInLCAxLCAwLCAwKTtcblx0XHRcdHZpZXdNb2RlbC5jb21wb3NpdGlvblR5cGUoJ1x1MzA1Qlx1RkY0RScsIDEsIDAsIDApO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZSgnXHUzMDVCXHUzMDkzJywgMiwgMCwgMCk7XG5cdFx0XHR2aWV3TW9kZWwuY29tcG9zaXRpb25UeXBlKCdcdTMwNUJcdTMwOTNcdUZGNTMnLCAyLCAwLCAwKTtcblx0XHRcdHZpZXdNb2RlbC5jb21wb3NpdGlvblR5cGUoJ1x1MzA1Qlx1MzA5M1x1MzA1QicsIDMsIDAsIDApO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZSgnXHUzMDVCXHUzMDkzXHUzMDVCJywgMywgMCwgMCk7XG5cdFx0XHR2aWV3TW9kZWwuY29tcG9zaXRpb25UeXBlKCdcdTMwNUJcdTMwOTNcdTMwNUJcdTMwNDQnLCAzLCAwLCAwKTtcblx0XHRcdHZpZXdNb2RlbC5jb21wb3NpdGlvblR5cGUoJ1x1MzA1Qlx1MzA5M1x1MzA1Qlx1MzA0NCcsIDQsIDAsIDApO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZSgnXHUzMDVCXHUzMDkzXHUzMDVCXHUzMDQ0JywgNCwgMCwgMCk7XG5cdFx0XHR2aWV3TW9kZWwuY29tcG9zaXRpb25UeXBlKCdcdTMwNUJcdTMwOTNcdTMwNUJcdTMwNDQnLCA0LCAwLCAwKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnXHUzMDVCXHUzMDkzXHUzMDVCXHUzMDQ0Jyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgNSkpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjM5ODM6IENhbGxpbmcgbW9kZWwuc2V0RU9MIGRvZXMgbm90IHJlc2V0IGN1cnNvciBwb3NpdGlvbicsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdmaXJzdCBsaW5lJyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJ1xuXHRcdFx0XVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vZGVsLnNldEVPTChFbmRPZkxpbmVTZXF1ZW5jZS5DUkxGKTtcblxuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigyLCAyLCAyLCAyKV0pO1xuXHRcdFx0bW9kZWwuc2V0RU9MKEVuZE9mTGluZVNlcXVlbmNlLkxGKTtcblxuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCAyLCAyLCAyKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyMzk4MzogQ2FsbGluZyBtb2RlbC5zZXRWYWx1ZSgpIHJlc2V0cyBjdXJzb3IgcG9zaXRpb24nLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnZmlyc3QgbGluZScsXG5cdFx0XHRcdCdzZWNvbmQgbGluZSdcblx0XHRcdF1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb2RlbC5zZXRFT0woRW5kT2ZMaW5lU2VxdWVuY2UuQ1JMRik7XG5cblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMiwgMiwgMiwgMildKTtcblx0XHRcdG1vZGVsLnNldFZhbHVlKFtcblx0XHRcdFx0J2RpZmZlcmVudCBmaXJzdCBsaW5lJyxcblx0XHRcdFx0J2RpZmZlcmVudCBzZWNvbmQgbGluZScsXG5cdFx0XHRcdCduZXcgdGhpcmQgbGluZSdcblx0XHRcdF0uam9pbignXFxuJykpO1xuXG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzM2NzQwOiB3b3Jkd3JhcCBjcmVhdGVzIGFuIGV4dHJhIHN0ZXAgLyBjaGFyYWN0ZXIgYXQgdGhlIHdyYXBwaW5nIHBvaW50JywgKCkgPT4ge1xuXHRcdC8vIGEgc2luZ2xlIG1vZGVsIGxpbmUgPT4gNCB2aWV3IGxpbmVzXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdFtcblx0XHRcdFx0J0xvcmVtIGlwc3VtICcsXG5cdFx0XHRcdCdkb2xvciBzaXQgYW1ldCAnLFxuXHRcdFx0XHQnY29uc2VjdGV0dXIgJyxcblx0XHRcdFx0J2FkaXBpc2NpbmcgZWxpdCcsXG5cdFx0XHRdLmpvaW4oJycpXG5cdFx0XSwgeyB3b3JkV3JhcDogJ3dvcmRXcmFwQ29sdW1uJywgd29yZFdyYXBDb2x1bW46IDE2IH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCA3LCAxLCA3KV0pO1xuXG5cdFx0XHRtb3ZlUmlnaHQoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA4LCAxLCA4KSk7XG5cblx0XHRcdG1vdmVSaWdodChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDksIDEsIDkpKTtcblxuXHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMTAsIDEsIDEwKSk7XG5cblx0XHRcdG1vdmVSaWdodChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDExLCAxLCAxMSkpO1xuXG5cdFx0XHRtb3ZlUmlnaHQoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCAxMiwgMSwgMTIpKTtcblxuXHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMTMsIDEsIDEzKSk7XG5cblx0XHRcdC8vIG1vdmluZyB0byB2aWV3IGxpbmUgMlxuXHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMTQsIDEsIDE0KSk7XG5cblx0XHRcdG1vdmVMZWZ0KGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMTMsIDEsIDEzKSk7XG5cblx0XHRcdC8vIG1vdmluZyBiYWNrIHRvIHZpZXcgbGluZSAxXG5cdFx0XHRtb3ZlTGVmdChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDEyLCAxLCAxMikpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTEwMzc2OiBtdWx0aXBsZSBzZWxlY3Rpb25zIHdpdGggd29yZHdyYXAgYmVoYXZlIGRpZmZlcmVudGx5JywgKCkgPT4ge1xuXHRcdC8vIGEgc2luZ2xlIG1vZGVsIGxpbmUgPT4gNCB2aWV3IGxpbmVzXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdFtcblx0XHRcdFx0J2p1c3QgYSBzZW50ZW5jZS4ganVzdCBhICcsXG5cdFx0XHRcdCdzZW50ZW5jZS4ganVzdCBhIHNlbnRlbmNlLicsXG5cdFx0XHRdLmpvaW4oJycpXG5cdFx0XSwgeyB3b3JkV3JhcDogJ3dvcmRXcmFwQ29sdW1uJywgd29yZFdyYXBDb2x1bW46IDI1IH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMTYpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDE4LCAxLCAzMyksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMzUsIDEsIDUwKSxcblx0XHRcdF0pO1xuXG5cdFx0XHRtb3ZlTGVmdChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMTgsIDEsIDE4KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAzNSwgMSwgMzUpLFxuXHRcdFx0XSk7XG5cblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDE2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxOCwgMSwgMzMpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDM1LCAxLCA1MCksXG5cdFx0XHRdKTtcblxuXHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxNiwgMSwgMTYpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDMzLCAxLCAzMyksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNTAsIDEsIDUwKSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjOTgzMjA6IE11bHRpLUN1cnNvciwgV3JhcCBsaW5lcyBhbmQgY3Vyc29yU2VsZWN0UmlnaHQgPT0+IGN1cnNvcnMgb3V0IG9mIHN5bmMnLCAoKSA9PiB7XG5cdFx0Ly8gYSBzaW5nbGUgbW9kZWwgbGluZSA9PiA0IHZpZXcgbGluZXNcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0W1xuXHRcdFx0XHQnbG9yZW1faXBzdW0tMTk5M3gxMXgxMycsXG5cdFx0XHRcdCdkb2xvcl9zaXRfYW1ldC0xOTk4eDA0eDI3Jyxcblx0XHRcdFx0J2NvbnNlY3RldHVyLTIwMDd4MTB4MDgnLFxuXHRcdFx0XHQnYWRpcGlzY2luZy0yMDEyeDA3eDI3Jyxcblx0XHRcdFx0J2VsaXQtMjAxNXgwMngyNycsXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0XSwgeyB3b3JkV3JhcDogJ3dvcmRXcmFwQ29sdW1uJywgd29yZFdyYXBDb2x1bW46IDE2IH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMTMsIDEsIDEzKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxNiwgMiwgMTYpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDEzLCAzLCAxMyksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgMTIsIDQsIDEyKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig1LCA2LCA1LCA2KSxcblx0XHRcdF0pO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEzLCAxLCAxMyksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMTYsIDIsIDE2KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCAxMywgMywgMTMpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDEyLCA0LCAxMiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNSwgNiwgNSwgNiksXG5cdFx0XHRdKTtcblxuXHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsLCB0cnVlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxMywgMSwgMTQpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDE2LCAyLCAxNyksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgMTMsIDMsIDE0KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig0LCAxMiwgNCwgMTMpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDYsIDUsIDcpLFxuXHRcdFx0XSk7XG5cblx0XHRcdG1vdmVSaWdodChlZGl0b3IsIHZpZXdNb2RlbCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMTMsIDEsIDE1KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxNiwgMiwgMTgpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDMsIDEzLCAzLCAxNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgMTIsIDQsIDE0KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig1LCA2LCA1LCA4KSxcblx0XHRcdF0pO1xuXG5cdFx0XHRtb3ZlUmlnaHQoZWRpdG9yLCB2aWV3TW9kZWwsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEzLCAxLCAxNiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMTYsIDIsIDE5KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCAxMywgMywgMTYpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDEyLCA0LCAxNSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oNSwgNiwgNSwgOSksXG5cdFx0XHRdKTtcblxuXHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsLCB0cnVlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxMywgMSwgMTcpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDE2LCAyLCAyMCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgMTMsIDMsIDE3KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbig0LCAxMiwgNCwgMTYpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDYsIDUsIDEwKSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDE1NzMgLSBkZWxldGUgYWNyb3NzIG11bHRpcGxlIGxpbmVzIGRvZXMgbm90IHNocmluayB0aGUgc2VsZWN0aW9uIHdoZW4gd29yZCB3cmFwcycsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0J0F1dGhvcml6YXRpb246IFxcJ0JlYXJlciBwSEtSZkNURlNuR3hzNmFrS2xiOWRkSVhjY2Ewc0lVU1pKdXRQSFlxejd2RWVIZE1UTWgwU0dOMElHVTNhMG41OURYalRMUnNqNUVKMnUzM3FMTklGaTlmazVYRjhwSzM5UG5kTFlVWmhQdDRRdkhHTFNjZ1NrSzBMNGd3emt6TWxvVFFQcEtocWlpa2lJT3Z5Tk5TcGQybzhqMjlObk9tZFRVT0tpOURWdDc0UEQyb2hLeHlPcldaNm9acHJUa2IzZUthamNwblMwTEFCS2ZhdzJybXY0XFwnLCdcblx0XHRdLmpvaW4oJ1xcbicpLCB7IHdvcmRXcmFwOiAnd29yZFdyYXBDb2x1bW4nLCB3b3JkV3JhcENvbHVtbjogMTAwIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCA0MywgZmFsc2UpO1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAxNDcsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA0MywgMSwgMTQ3KSk7XG5cblx0XHRcdGVkaXRvci5nZXRNb2RlbCgpLmFwcGx5RWRpdHMoW3tcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCA0MyksXG5cdFx0XHRcdHRleHQ6ICcnXG5cdFx0XHR9XSk7XG5cblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMTA1KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyMjcxNzogTW92aW5nIHRleHQgY3Vyc29yIGNhdXNlIGFuIGluY29ycmVjdCBwb3NpdGlvbiBpbiBDaGluZXNlJywgKCkgPT4ge1xuXHRcdC8vIGEgc2luZ2xlIG1vZGVsIGxpbmUgPT4gNCB2aWV3IGxpbmVzXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdFtcblx0XHRcdFx0J1x1NEUwMFx1NEU4Q1x1NEUwOVx1NTZEQlx1NEU5NFx1NTE2RFx1NEUwM1x1NTE2Qlx1NEU1RFx1NTM0MScsXG5cdFx0XHRcdCcxMjM0NTY3ODkwMTIzNDU2Nzg5MCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0XSwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KV0pO1xuXG5cdFx0XHRtb3ZlRG93bihlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDksIDIsIDkpKTtcblxuXHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgMTAsIDIsIDEwKSk7XG5cblx0XHRcdG1vdmVSaWdodChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDExLCAyLCAxMSkpO1xuXG5cdFx0XHRtb3ZlVXAoZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA2LCAxLCA2KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTIzMDE6IG5ldyBzdGlja3lUYWJTdG9wcyBmZWF0dXJlIGludGVyZmVyZXMgd2l0aCB3b3JkIHdyYXAnLCAoKSA9PiB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdFtcblx0XHRcdFx0J2Z1bmN0aW9uIGhlbGxvKCkgeycsXG5cdFx0XHRcdCcgICAgICAgIGNvbnNvbGUubG9nKGB0aGlzIGlzIGEgbG9uZyBjb25zb2xlIG1lc3NhZ2VgKScsXG5cdFx0XHRcdCd9Jyxcblx0XHRcdF0uam9pbignXFxuJylcblx0XHRdLCB7IHdvcmRXcmFwOiAnd29yZFdyYXBDb2x1bW4nLCB3b3JkV3JhcENvbHVtbjogMzIsIHN0aWNreVRhYlN0b3BzOiB0cnVlIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMzEsIDIsIDMxKVxuXHRcdFx0XSk7XG5cdFx0XHRtb3ZlUmlnaHQoZWRpdG9yLCB2aWV3TW9kZWwsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigyLCAzMikpO1xuXG5cdFx0XHRtb3ZlUmlnaHQoZWRpdG9yLCB2aWV3TW9kZWwsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigyLCAzMykpO1xuXG5cdFx0XHRtb3ZlUmlnaHQoZWRpdG9yLCB2aWV3TW9kZWwsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigyLCAzNCkpO1xuXG5cdFx0XHRtb3ZlTGVmdChlZGl0b3IsIHZpZXdNb2RlbCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDIsIDMzKSk7XG5cblx0XHRcdG1vdmVMZWZ0KGVkaXRvciwgdmlld01vZGVsLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMiwgMzIpKTtcblxuXHRcdFx0bW92ZUxlZnQoZWRpdG9yLCB2aWV3TW9kZWwsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigyLCAzMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNDQ4MDU6IFNob3VsZCBub3QgYmUgYWJsZSB0byB1bmRvIGluIHJlYWRvbmx5IGVkaXRvcicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0Jydcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IHJlYWRPbmx5OiB0cnVlIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW9kZWwucHVzaEVkaXRPcGVyYXRpb25zKFtuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpXSwgW3tcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSxcblx0XHRcdFx0dGV4dDogJ0hlbGxvIHdvcmxkISdcblx0XHRcdH1dLCAoKSA9PiBbbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnSGVsbG8gd29ybGQhJyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdIZWxsbyB3b3JsZCEnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzQ2MzE0OiBWaWV3TW9kZWwgaXMgb3V0IG9mIHN5bmMgd2l0aCBNb2RlbCEnLCAoKSA9PiB7XG5cblx0XHRjb25zdCB0b2tlbml6YXRpb25TdXBwb3J0OiBJVG9rZW5pemF0aW9uU3VwcG9ydCA9IHtcblx0XHRcdGdldEluaXRpYWxTdGF0ZTogKCkgPT4gTnVsbFN0YXRlLFxuXHRcdFx0dG9rZW5pemU6IHVuZGVmaW5lZCEsXG5cdFx0XHR0b2tlbml6ZUVuY29kZWQ6IChsaW5lOiBzdHJpbmcsIGhhc0VPTDogYm9vbGVhbiwgc3RhdGU6IElTdGF0ZSk6IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQgPT4ge1xuXHRcdFx0XHRyZXR1cm4gbmV3IEVuY29kZWRUb2tlbml6YXRpb25SZXN1bHQobmV3IFVpbnQzMkFycmF5KDApLCBbXSwgc3RhdGUpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBMQU5HVUFHRV9JRCA9ICdtb2RlbE1vZGVUZXN0MSc7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VSZWdpc3RyYXRpb24gPSBUb2tlbml6YXRpb25SZWdpc3RyeS5yZWdpc3RlcihMQU5HVUFHRV9JRCwgdG9rZW5pemF0aW9uU3VwcG9ydCk7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ0p1c3QgdGV4dCcsIExBTkdVQUdFX0lEKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IxLCBjdXJzb3IxKSA9PiB7XG5cdFx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yMiwgY3Vyc29yMikgPT4ge1xuXG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBlZGl0b3IxLm9uRGlkQ2hhbmdlQ3Vyc29yUG9zaXRpb24oKCkgPT4ge1xuXHRcdFx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi50b2tlbml6ZUlmQ2hlYXAoMSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdG1vZGVsLmFwcGx5RWRpdHMoW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgdGV4dDogJy0nIH1dKTtcblxuXHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0bGFuZ3VhZ2VSZWdpc3RyYXRpb24uZGlzcG9zZSgpO1xuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzM3OTY3OiBwcm9ibGVtIHJlcGxhY2luZyBjb25zZWN1dGl2ZSBjaGFyYWN0ZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnY29uc3QgYSA9IFwiZm9vXCI7Jyxcblx0XHRcdFx0J2NvbnN0IGIgPSBcIlwiJ1xuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgbXVsdGlDdXJzb3JNZXJnZU92ZXJsYXBwaW5nOiBmYWxzZSB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxMiwgMSwgMTIpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDE2LCAxLCAxNiksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMTIsIDIsIDEyKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxMywgMiwgMTMpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxMSwgMSwgMTEpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDE0LCAxLCAxNCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMTEsIDIsIDExKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxMSwgMiwgMTEpLFxuXHRcdFx0XSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXCcnLCAna2V5Ym9hcmQnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnY29uc3QgYSA9IFxcJ2Zvb1xcJzsnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ2NvbnN0IGIgPSBcXCdcXCcnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE1NzYxOiBDdXJzb3IgZG9lc25cXCd0IG1vdmUgaW4gYSByZWRvIG9wZXJhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J2hlbGxvJ1xuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KVxuXHRcdFx0XSk7XG5cblx0XHRcdGVkaXRvci5leGVjdXRlRWRpdHMoJ3Rlc3QnLCBbe1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLFxuXHRcdFx0XHR0ZXh0OiAnKicsXG5cdFx0XHRcdGZvcmNlTW92ZU1hcmtlcnM6IHRydWVcblx0XHRcdH1dKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KSxcblx0XHRcdF0pO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDQpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuUmVkbywgbnVsbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNSksXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzQyNzgzOiBBUEkgQ2FsbHMgd2l0aCBVbmRvIExlYXZlIEN1cnNvciBpbiBXcm9uZyBQb3NpdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J2FiJ1xuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKVxuXHRcdFx0XSk7XG5cblx0XHRcdGVkaXRvci5leGVjdXRlRWRpdHMoJ3Rlc3QnLCBbe1xuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDMpLFxuXHRcdFx0XHR0ZXh0OiAnJ1xuXHRcdFx0fV0pO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksXG5cdFx0XHRdKTtcblxuXHRcdFx0ZWRpdG9yLmV4ZWN1dGVFZGl0cygndGVzdCcsIFt7XG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMiksXG5cdFx0XHRcdHRleHQ6ICcnXG5cdFx0XHR9XSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSksXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzg1NzEyOiBQYXN0ZSBsaW5lIG1vdmVzIGN1cnNvciB0byBzdGFydCBvZiBjdXJyZW50IGxpbmUgcmF0aGVyIHRoYW4gc3RhcnQgb2YgbmV4dCBsaW5lJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnYWJjMTIzJyxcblx0XHRcdFx0Jydcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSlcblx0XHRcdF0pO1xuXHRcdFx0dmlld01vZGVsLnBhc3RlKCdzb21ldGhpbmdcXG4nLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCdhYmMxMjMnLFxuXHRcdFx0XHQnc29tZXRoaW5nJyxcblx0XHRcdFx0Jydcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDMsIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzg0ODk3OiBMZWZ0IGRlbGV0ZSBiZWhhdmlvciBpbiBzb21lIGxhbmd1YWdlcyBpcyBjaGFuZ2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnXHUwRTJBXHUwRTI3XHUwRTMxXHUwRTJBXHUwRTE0XHUwRTM1J1xuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA3LCAxLCA3KVxuXHRcdFx0XSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcdTBFMkFcdTBFMjdcdTBFMzFcdTBFMkFcdTBFMTQnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1x1MEUyQVx1MEUyN1x1MEUzMVx1MEUyQScpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXHUwRTJBXHUwRTI3XHUwRTMxJyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcdTBFMkFcdTBFMjcnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1x1MEUyQScpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMjI5MTQ6IExlZnQgZGVsZXRlIGJlaGF2aW9yIGluIHNvbWUgbGFuZ3VhZ2VzIGlzIGNoYW5nZWQgKHVzZVRhYlN0b3BzOiBmYWxzZSknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdcdTBFMkFcdTBFMjdcdTBFMzFcdTBFMkFcdTBFMTRcdTBFMzUnXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyB1c2VUYWJTdG9wczogZmFsc2UgfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNywgMSwgNylcblx0XHRcdF0pO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXHUwRTJBXHUwRTI3XHUwRTMxXHUwRTJBXHUwRTE0Jyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcdTBFMkFcdTBFMjdcdTBFMzFcdTBFMkEnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1x1MEUyQVx1MEUyN1x1MEUzMScpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXHUwRTJBXHUwRTI3Jyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcdTBFMkEnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjOTk2Mjk6IEVtb2ppIG1vZGlmaWVycyBpbiB0ZXh0IHRyZWF0ZWQgc2VwYXJhdGVseSB3aGVuIHVzaW5nIGJhY2tzcGFjZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J1x1RDgzRFx1REM3Nlx1RDgzQ1x1REZGRSdcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IHVzZVRhYlN0b3BzOiBmYWxzZSB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGNvbnN0IGxlbiA9IG1vZGVsLmdldFZhbHVlTGVuZ3RoKCk7XG5cdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSArIGxlbiwgMSwgMSArIGxlbilcblx0XHRcdF0pO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM5OTYyOTogRW1vamkgbW9kaWZpZXJzIGluIHRleHQgdHJlYXRlZCBzZXBhcmF0ZWx5IHdoZW4gdXNpbmcgYmFja3NwYWNlIChaV0ogc2VxdWVuY2UpJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnXHVEODNEXHVEQzY4XHUyMDBEXHVEODNEXHVEQzY5XHVEODNDXHVERkZEXHUyMDBEXHVEODNEXHVEQzY3XHUyMDBEXHVEODNEXHVEQzY2J1xuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgdXNlVGFiU3RvcHM6IGZhbHNlIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Y29uc3QgbGVuID0gbW9kZWwuZ2V0VmFsdWVMZW5ndGgoKTtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxICsgbGVuLCAxLCAxICsgbGVuKVxuXHRcdFx0XSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcdUQ4M0RcdURDNjhcdTIwMERcdUQ4M0RcdURDNjlcdUQ4M0NcdURGRkRcdTIwMERcdUQ4M0RcdURDNjcnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1x1RDgzRFx1REM2OFx1MjAwRFx1RDgzRFx1REM2OVx1RDgzQ1x1REZGRCcpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXHVEODNEXHVEQzY4Jyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICcnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEwNTczMDogbW92ZSBsZWZ0IGJlaGF2ZXMgZGlmZmVyZW50bHkgZm9yIG11bHRpcGxlIGN1cnNvcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJ2FzZGZnaGprbCwgYXNkZmdoamtsLCBhc2RmZ2hqa2wsICcpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFxuXHRcdFx0bW9kZWwsXG5cdFx0XHR7XG5cdFx0XHRcdHdvcmRXcmFwOiAnd29yZFdyYXBDb2x1bW4nLFxuXHRcdFx0XHR3b3JkV3JhcENvbHVtbjogMjRcblx0XHRcdH0sXG5cdFx0XHQoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxMCwgMSwgMTIpLFxuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMjEsIDEsIDIzKSxcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDMyLCAxLCAzNClcblx0XHRcdFx0XSk7XG5cdFx0XHRcdG1vdmVMZWZ0KGVkaXRvciwgdmlld01vZGVsLCBmYWxzZSk7XG5cdFx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEwLCAxLCAxMCksXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAyMSwgMSwgMjEpLFxuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMzIsIDEsIDMyKVxuXHRcdFx0XHRdKTtcblxuXHRcdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEwLCAxLCAxMiksXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAyMSwgMSwgMjMpLFxuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMzIsIDEsIDM0KVxuXHRcdFx0XHRdKTtcblx0XHRcdFx0bW92ZUxlZnQoZWRpdG9yLCB2aWV3TW9kZWwsIHRydWUpO1xuXHRcdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxMCwgMSwgMTEpLFxuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMjEsIDEsIDIyKSxcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDMyLCAxLCAzMylcblx0XHRcdFx0XSk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEwNTczMDogbW92ZSByaWdodCBzaG91bGQgYWx3YXlzIHNraXAgd3JhcCBwb2ludCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnYXNkZmdoamtsLCBhc2RmZ2hqa2wsIGFzZGZnaGprbCwgXFxuYXNkZmdoamtsLCcpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFxuXHRcdFx0bW9kZWwsXG5cdFx0XHR7XG5cdFx0XHRcdHdvcmRXcmFwOiAnd29yZFdyYXBDb2x1bW4nLFxuXHRcdFx0XHR3b3JkV3JhcENvbHVtbjogMjRcblx0XHRcdH0sXG5cdFx0XHQoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAyMiwgMSwgMjIpXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRtb3ZlUmlnaHQoZWRpdG9yLCB2aWV3TW9kZWwsIGZhbHNlKTtcblx0XHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsLCBmYWxzZSk7XG5cdFx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIFtcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDI0LCAxLCAyNCksXG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW1xuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMjIsIDEsIDIyKVxuXHRcdFx0XHRdKTtcblx0XHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsLCB0cnVlKTtcblx0XHRcdFx0bW92ZVJpZ2h0KGVkaXRvciwgdmlld01vZGVsLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgW1xuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMjIsIDEsIDI0KSxcblx0XHRcdFx0XSk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzEyMzE3ODogc3RpY2t5IHRhYiBpbiBjb25zZWN1dGl2ZSB3cmFwcGVkIGxpbmVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKCcgICAgYWFhYSAgICAgICAgYWFhYScsIHVuZGVmaW5lZCwgeyB0YWJTaXplOiA0IH0pO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFxuXHRcdFx0bW9kZWwsXG5cdFx0XHR7XG5cdFx0XHRcdHdvcmRXcmFwOiAnd29yZFdyYXBDb2x1bW4nLFxuXHRcdFx0XHR3b3JkV3JhcENvbHVtbjogOCxcblx0XHRcdFx0c3RpY2t5VGFiU3RvcHM6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0KGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW1xuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgOSwgMSwgOSlcblx0XHRcdFx0XSk7XG5cdFx0XHRcdG1vdmVSaWdodChlZGl0b3IsIHZpZXdNb2RlbCwgZmFsc2UpO1xuXHRcdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxMCwgMSwgMTApLFxuXHRcdFx0XHRdKTtcblxuXHRcdFx0XHRtb3ZlTGVmdChlZGl0b3IsIHZpZXdNb2RlbCwgZmFsc2UpO1xuXHRcdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBbXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA5LCAxLCA5KSxcblx0XHRcdFx0XSk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnQ3Vyc29yIGhvbm9ycyBpbnNlcnRTcGFjZXMgY29uZmlndXJhdGlvbiBvbiBuZXcgbGluZScsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCcgICAgXFx0TXkgRmlyc3QgTGluZVxcdCAnLFxuXHRcdFx0XHQnXFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdFx0XHQnICAgIFRoaXJkIExpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JzEnXG5cdFx0XHRdXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5Nb3ZlVG8ucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7IHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oMSwgMjEpLCBzb3VyY2U6ICdrZXlib2FyZCcgfSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcgICAgXFx0TXkgRmlyc3QgTGluZVxcdCAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJyAgICAgICAgJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0N1cnNvciBob25vcnMgaW5zZXJ0U3BhY2VzIGNvbmZpZ3VyYXRpb24gb24gdGFiJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnICAgIFxcdE15IEZpcnN0IExpbmVcXHQgJyxcblx0XHRcdFx0J015IFNlY29uZCBMaW5lMTIzJyxcblx0XHRcdFx0JyAgICBUaGlyZCBMaW5lJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcxJ1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHtcblx0XHRcdFx0dGFiU2l6ZTogMTMsXG5cdFx0XHRcdGluZGVudFNpemU6IDEzLFxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdC8vIFRhYiBvbiBjb2x1bW4gMVxuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5Nb3ZlVG8ucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7IHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oMiwgMSkgfSk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlRhYiwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcgICAgICAgICAgICAgTXkgU2Vjb25kIExpbmUxMjMnKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cblx0XHRcdC8vIFRhYiBvbiBjb2x1bW4gMlxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnTXkgU2Vjb25kIExpbmUxMjMnKTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuTW92ZVRvLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwgeyBwb3NpdGlvbjogbmV3IFBvc2l0aW9uKDIsIDIpIH0pO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5UYWIsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnTSAgICAgICAgICAgIHkgU2Vjb25kIExpbmUxMjMnKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cblx0XHRcdC8vIFRhYiBvbiBjb2x1bW4gM1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnTXkgU2Vjb25kIExpbmUxMjMnKTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuTW92ZVRvLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwgeyBwb3NpdGlvbjogbmV3IFBvc2l0aW9uKDIsIDMpIH0pO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5UYWIsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnTXkgICAgICAgICAgICBTZWNvbmQgTGluZTEyMycpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblxuXHRcdFx0Ly8gVGFiIG9uIGNvbHVtbiA0XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdNeSBTZWNvbmQgTGluZTEyMycpO1xuXHRcdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5Nb3ZlVG8ucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7IHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oMiwgNCkgfSk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlRhYiwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdNeSAgICAgICAgICAgU2Vjb25kIExpbmUxMjMnKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cblx0XHRcdC8vIFRhYiBvbiBjb2x1bW4gNVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnTXkgU2Vjb25kIExpbmUxMjMnKTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuTW92ZVRvLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwgeyBwb3NpdGlvbjogbmV3IFBvc2l0aW9uKDIsIDUpIH0pO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5UYWIsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnTXkgUyAgICAgICAgIGVjb25kIExpbmUxMjMnKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cblx0XHRcdC8vIFRhYiBvbiBjb2x1bW4gNVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnTXkgU2Vjb25kIExpbmUxMjMnKTtcblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuTW92ZVRvLnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwgeyBwb3NpdGlvbjogbmV3IFBvc2l0aW9uKDIsIDUpIH0pO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5UYWIsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnTXkgUyAgICAgICAgIGVjb25kIExpbmUxMjMnKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cblx0XHRcdC8vIFRhYiBvbiBjb2x1bW4gMTNcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ015IFNlY29uZCBMaW5lMTIzJyk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLk1vdmVUby5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHsgcG9zaXRpb246IG5ldyBQb3NpdGlvbigyLCAxMykgfSk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlRhYiwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdNeSBTZWNvbmQgTGkgbmUxMjMnKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cblx0XHRcdC8vIFRhYiBvbiBjb2x1bW4gMTRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ015IFNlY29uZCBMaW5lMTIzJyk7XG5cdFx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLk1vdmVUby5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHsgcG9zaXRpb246IG5ldyBQb3NpdGlvbigyLCAxNCkgfSk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlRhYiwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdNeSBTZWNvbmQgTGluICAgICAgICAgICAgIGUxMjMnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRW50ZXIgYXV0by1pbmRlbnRzIHdpdGggaW5zZXJ0U3BhY2VzIHNldHRpbmcgMScsICgpID0+IHtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gc2V0dXBPbkVudGVyTGFuZ3VhZ2UoSW5kZW50QWN0aW9uLkluZGVudCk7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnXFx0aGVsbG8nXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogbGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgNywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA3LCAxLCA3KSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkNSTEYpLCAnXFx0aGVsbG9cXHJcXG4gICAgICAgICcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbnRlciBhdXRvLWluZGVudHMgd2l0aCBpbnNlcnRTcGFjZXMgc2V0dGluZyAyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSBzZXR1cE9uRW50ZXJMYW5ndWFnZShJbmRlbnRBY3Rpb24uTm9uZSk7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnXFx0aGVsbG8nXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogbGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgNywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA3LCAxLCA3KSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkNSTEYpLCAnXFx0aGVsbG9cXHJcXG4gICAgJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VudGVyIGF1dG8taW5kZW50cyB3aXRoIGluc2VydFNwYWNlcyBzZXR0aW5nIDMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IHNldHVwT25FbnRlckxhbmd1YWdlKEluZGVudEFjdGlvbi5JbmRlbnRPdXRkZW50KTtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdcXHRoZWxsKCknXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogbGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgNywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA3LCAxLCA3KSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkNSTEYpLCAnXFx0aGVsbChcXHJcXG4gICAgICAgIFxcclxcbiAgICApJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNDgyNTY6IFByZXNzaW5nIEVudGVyIGNyZWF0ZXMgbGluZSB3aXRoIGJhZCBpbmRlbnQgd2l0aCBpbnNlcnRTcGFjZXM6IHRydWUnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnICBcXHQnXG5cdFx0XHRdLFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgNCwgZmFsc2UpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICcgIFxcdFxcbiAgICAnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE0ODI1NjogUHJlc3NpbmcgRW50ZXIgY3JlYXRlcyBsaW5lIHdpdGggYmFkIGluZGVudCB3aXRoIGluc2VydFNwYWNlczogZmFsc2UnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnICBcXHQnXG5cdFx0XHRdXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW9kZWwudXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRcdGluc2VydFNwYWNlczogZmFsc2Vcblx0XHRcdH0pO1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCA0LCBmYWxzZSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJyAgXFx0XFxuXFx0Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZUF1dG9XaGl0ZXNwYWNlIG9mZicsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCcgICAgc29tZSAgbGluZSBhYmMgICdcblx0XHRcdF0sXG5cdFx0XHRtb2RlbE9wdHM6IHtcblx0XHRcdFx0dHJpbUF1dG9XaGl0ZXNwYWNlOiBmYWxzZVxuXHRcdFx0fVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblxuXHRcdFx0Ly8gTW92ZSBjdXJzb3IgdG8gdGhlIGVuZCwgdmVyaWZ5IHRoYXQgd2UgZG8gbm90IHRyaW0gd2hpdGVzcGFjZXMgaWYgbGluZSBoYXMgdmFsdWVzXG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIG1vZGVsLmdldExpbmVDb250ZW50KDEpLmxlbmd0aCArIDEpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnICAgIHNvbWUgIGxpbmUgYWJjICAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJyAgICAnKTtcblxuXHRcdFx0Ly8gVHJ5IHRvIGVudGVyIGFnYWluLCB3ZSBzaG91bGQgdHJpbW1lZCBwcmV2aW91cyBsaW5lXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcgICAgc29tZSAgbGluZSBhYmMgICcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnICAgICcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAnICAgICcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVBdXRvV2hpdGVzcGFjZSBvbjogcmVtb3ZlcyBvbmx5IHdoaXRlc3BhY2UgdGhlIGN1cnNvciBhZGRlZCAxJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0JyAgICAnXG5cdFx0XHRdXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCBtb2RlbC5nZXRMaW5lQ29udGVudCgxKS5sZW5ndGggKyAxKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJyAgICAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJyAgICAnKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnICAgICcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICcgICAgJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTUwMzM6IGluZGVudCBhbmQgYXBwZW5kVGV4dCcsICgpID0+IHtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gJ29uRW50ZXJNb2RlJztcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiBsYW5ndWFnZUlkIH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihsYW5ndWFnZUlkLCB7XG5cdFx0XHRvbkVudGVyUnVsZXM6IFt7XG5cdFx0XHRcdGJlZm9yZVRleHQ6IC8uKi8sXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdGluZGVudEFjdGlvbjogSW5kZW50QWN0aW9uLkluZGVudCxcblx0XHRcdFx0XHRhcHBlbmRUZXh0OiAneCdcblx0XHRcdFx0fVxuXHRcdFx0fV1cblx0XHR9KSk7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQndGV4dCdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBsYW5ndWFnZUlkLFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCA1KTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ3RleHQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJyAgICB4Jyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMiwgNikpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNjg2MjogRWRpdG9yIHJlbW92ZXMgYXV0byBpbnNlcnRlZCBpbmRlbnRhdGlvbiB3aGVuIGZvcm1hdHRpbmcgb24gdHlwZScsICgpID0+IHtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gc2V0dXBPbkVudGVyTGFuZ3VhZ2UoSW5kZW50QWN0aW9uLkluZGVudE91dGRlbnQpO1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J2Z1bmN0aW9uIGZvbyAocGFyYW1zOiBzdHJpbmcpIHt9J1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGxhbmd1YWdlSWQsXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDMyKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ2Z1bmN0aW9uIGZvbyAocGFyYW1zOiBzdHJpbmcpIHsnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJyAgICAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJ30nKTtcblxuXHRcdFx0Y2xhc3MgVGVzdENvbW1hbmQgaW1wbGVtZW50cyBJQ29tbWFuZCB7XG5cblx0XHRcdFx0cHJpdmF0ZSBfc2VsZWN0aW9uSWQ6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG5cdFx0XHRcdHB1YmxpYyBnZXRFZGl0T3BlcmF0aW9ucyhtb2RlbDogSVRleHRNb2RlbCwgYnVpbGRlcjogSUVkaXRPcGVyYXRpb25CdWlsZGVyKTogdm9pZCB7XG5cdFx0XHRcdFx0YnVpbGRlci5hZGRFZGl0T3BlcmF0aW9uKG5ldyBSYW5nZSgxLCAxMywgMSwgMTQpLCAnJyk7XG5cdFx0XHRcdFx0dGhpcy5fc2VsZWN0aW9uSWQgPSBidWlsZGVyLnRyYWNrU2VsZWN0aW9uKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb24oKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRwdWJsaWMgY29tcHV0ZUN1cnNvclN0YXRlKG1vZGVsOiBJVGV4dE1vZGVsLCBoZWxwZXI6IElDdXJzb3JTdGF0ZUNvbXB1dGVyRGF0YSk6IFNlbGVjdGlvbiB7XG5cdFx0XHRcdFx0cmV0dXJuIGhlbHBlci5nZXRUcmFja2VkU2VsZWN0aW9uKHRoaXMuX3NlbGVjdGlvbklkISk7XG5cdFx0XHRcdH1cblxuXHRcdFx0fVxuXG5cdFx0XHR2aWV3TW9kZWwuZXhlY3V0ZUNvbW1hbmQobmV3IFRlc3RDb21tYW5kKCksICdhdXRvRm9ybWF0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdmdW5jdGlvbiBmb28ocGFyYW1zOiBzdHJpbmcpIHsnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJyAgICAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJ30nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlQXV0b1doaXRlc3BhY2Ugb246IHJlbW92ZXMgb25seSB3aGl0ZXNwYWNlIHRoZSBjdXJzb3IgYWRkZWQgMicsICgpID0+IHtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gJ3Rlc3RMYW5nJztcblx0XHRjb25zdCByZWdpc3RyYXRpb24gPSBsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiBsYW5ndWFnZUlkIH0pO1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnICAgIGlmIChhKSB7Jyxcblx0XHRcdFx0JyAgICAgICAgJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnICAgIH0nXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0bGFuZ3VhZ2VJZFxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCAxKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVGFiLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJyAgICBpZiAoYSkgeycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnICAgICAgICAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJyAgICAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDUpLCAnICAgIH0nKTtcblxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCA0LCAxKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVGFiLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJyAgICBpZiAoYSkgeycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnICAgICAgICAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDQpLCAnICAgICcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDUpLCAnICAgIH0nKTtcblxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCA1LCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKDUpKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdzb21ldGhpbmcnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJyAgICBpZiAoYSkgeycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnICAgICAgICAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDQpLCAnJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNSksICcgICAgfXNvbWV0aGluZycpO1xuXHRcdH0pO1xuXG5cdFx0cmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlQXV0b1doaXRlc3BhY2Ugb246IHRlc3QgMScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0JyAgICBzb21lICBsaW5lIGFiYyAgJ1xuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblxuXHRcdFx0Ly8gTW92ZSBjdXJzb3IgdG8gdGhlIGVuZCwgdmVyaWZ5IHRoYXQgd2UgZG8gbm90IHRyaW0gd2hpdGVzcGFjZXMgaWYgbGluZSBoYXMgdmFsdWVzXG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIG1vZGVsLmdldExpbmVDb250ZW50KDEpLmxlbmd0aCArIDEpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnICAgIHNvbWUgIGxpbmUgYWJjICAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJyAgICAnKTtcblxuXHRcdFx0Ly8gVHJ5IHRvIGVudGVyIGFnYWluLCB3ZSBzaG91bGQgdHJpbW1lZCBwcmV2aW91cyBsaW5lXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcgICAgc29tZSAgbGluZSBhYmMgICcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICcgICAgJyk7XG5cblx0XHRcdC8vIE1vcmUgd2hpdGVzcGFjZXNcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVGFiLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJyAgICBzb21lICBsaW5lIGFiYyAgJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJyAgICAgICAgJyk7XG5cblx0XHRcdC8vIEVudGVyIGFuZCB2ZXJpZnkgdGhhdCB0cmltbWVkIGFnYWluXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcgICAgc29tZSAgbGluZSBhYmMgICcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJyAgICAgICAgJyk7XG5cblx0XHRcdC8vIFRyaW1tZWQgaWYgd2Ugd2lsbCBrZWVwIG9ubHkgdGV4dFxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCA1KTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJyAgICAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJyAgICBzb21lICBsaW5lIGFiYyAgJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDUpLCAnJyk7XG5cblx0XHRcdC8vIFRyaW1tZWQgaWYgd2Ugd2lsbCBrZWVwIG9ubHkgdGV4dCBieSBzZWxlY3Rpb25cblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgNSk7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDEsIHRydWUpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnICAgICcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnICAgICcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAnICAgICcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDQpLCAnJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNSksICcnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE1MTE4OiByZW1vdmUgYXV0byB3aGl0ZXNwYWNlIHdoZW4gcGFzdGluZyBlbnRpcmUgbGluZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0JyAgICBmdW5jdGlvbiBmKCkgeycsXG5cdFx0XHRcdCcgICAgICAgIC8vIElcXCdtIGdvbm5hIGNvcHkgdGhpcyBsaW5lJyxcblx0XHRcdFx0JyAgICAgICAgcmV0dXJuIDM7Jyxcblx0XHRcdFx0JyAgICB9Jyxcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgbW9kZWwuZ2V0TGluZU1heENvbHVtbigzKSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCcgICAgZnVuY3Rpb24gZigpIHsnLFxuXHRcdFx0XHQnICAgICAgICAvLyBJXFwnbSBnb25uYSBjb3B5IHRoaXMgbGluZScsXG5cdFx0XHRcdCcgICAgICAgIHJldHVybiAzOycsXG5cdFx0XHRcdCcgICAgICAgICcsXG5cdFx0XHRcdCcgICAgfScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbig0LCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKDQpKSk7XG5cblx0XHRcdHZpZXdNb2RlbC5wYXN0ZSgnICAgICAgICAvLyBJXFwnbSBnb25uYSBjb3B5IHRoaXMgbGluZVxcbicsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIFtcblx0XHRcdFx0JyAgICBmdW5jdGlvbiBmKCkgeycsXG5cdFx0XHRcdCcgICAgICAgIC8vIElcXCdtIGdvbm5hIGNvcHkgdGhpcyBsaW5lJyxcblx0XHRcdFx0JyAgICAgICAgcmV0dXJuIDM7Jyxcblx0XHRcdFx0JyAgICAgICAgLy8gSVxcJ20gZ29ubmEgY29weSB0aGlzIGxpbmUnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JyAgICB9Jyxcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDUsIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzQwNjk1OiBtYWludGFpbiBjdXJzb3IgcG9zaXRpb24gd2hlbiBjb3B5aW5nIGxpbmVzIHVzaW5nIGN0cmwrYywgY3RybCt2JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnICAgIGZ1bmN0aW9uIGYoKSB7Jyxcblx0XHRcdFx0JyAgICAgICAgLy8gSVxcJ20gZ29ubmEgY29weSB0aGlzIGxpbmUnLFxuXHRcdFx0XHQnICAgICAgICAvLyBBbm90aGVyIGxpbmUnLFxuXHRcdFx0XHQnICAgICAgICByZXR1cm4gMzsnLFxuXHRcdFx0XHQnICAgIH0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblxuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW25ldyBTZWxlY3Rpb24oNCwgMTAsIDQsIDEwKV0pO1xuXHRcdFx0dmlld01vZGVsLnBhc3RlKCcgICAgICAgIC8vIElcXCdtIGdvbm5hIGNvcHkgdGhpcyBsaW5lXFxuJywgdHJ1ZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCBbXG5cdFx0XHRcdCcgICAgZnVuY3Rpb24gZigpIHsnLFxuXHRcdFx0XHQnICAgICAgICAvLyBJXFwnbSBnb25uYSBjb3B5IHRoaXMgbGluZScsXG5cdFx0XHRcdCcgICAgICAgIC8vIEFub3RoZXIgbGluZScsXG5cdFx0XHRcdCcgICAgICAgIC8vIElcXCdtIGdvbm5hIGNvcHkgdGhpcyBsaW5lJyxcblx0XHRcdFx0JyAgICAgICAgcmV0dXJuIDM7Jyxcblx0XHRcdFx0JyAgICB9Jyxcblx0XHRcdF0uam9pbignXFxuJykpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDUsIDEwKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VzZVRhYlN0b3BzIGlzIG9mZicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0JyAgICB4Jyxcblx0XHRcdFx0JyAgICAgICAgYSAgICAnLFxuXHRcdFx0XHQnICAgICdcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IHVzZVRhYlN0b3BzOiBmYWxzZSB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdC8vIERlbGV0ZUxlZnQgcmVtb3ZlcyBqdXN0IG9uZSB3aGl0ZXNwYWNlXG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDkpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJyAgICAgICBhICAgICcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdCYWNrc3BhY2UgcmVtb3ZlcyB3aGl0ZXNwYWNlcyB3aXRoIHRhYiBzaXplJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnIFxcdCBcXHQgICAgIHgnLFxuXHRcdFx0XHQnICAgICAgICBhICAgICcsXG5cdFx0XHRcdCcgICAgJ1xuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgdXNlVGFiU3RvcHM6IHRydWUgfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHQvLyBEZWxldGVMZWZ0IGRvZXMgbm90IHJlbW92ZSB0YWIgc2l6ZSwgYmVjYXVzZSBzb21lIHRleHQgZXhpc3RzIGJlZm9yZVxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCBtb2RlbC5nZXRMaW5lQ29udGVudCgyKS5sZW5ndGggKyAxKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcgICAgICAgIGEgICAnKTtcblxuXHRcdFx0Ly8gRGVsZXRlTGVmdCByZW1vdmVzIHRhYiBzaXplID0gNFxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCA5KTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcgICAgYSAgICcpO1xuXG5cdFx0XHQvLyBEZWxldGVMZWZ0IHJlbW92ZXMgdGFiIHNpemUgPSA0XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnYSAgICcpO1xuXG5cdFx0XHQvLyBVbmRvIERlbGV0ZUxlZnQgLSBnZXQgdXMgYmFjayB0byBvcmlnaW5hbCBpbmRlbnRhdGlvblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJyAgICAgICAgYSAgICcpO1xuXG5cdFx0XHQvLyBOb3RoaW5nIGlzIGJyb2tlbiB3aGVuIGN1cnNvciBpcyBpbiAoMSwxKVxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAxKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcgXFx0IFxcdCAgICAgeCcpO1xuXG5cdFx0XHQvLyBEZWxldGVMZWZ0IHN0b3BzIGF0IHRhYiBzdG9wcyBldmVuIGluIG1peGVkIHdoaXRlc3BhY2UgY2FzZVxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAxMCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnIFxcdCBcXHQgICAgeCcpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnIFxcdCBcXHR4Jyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcgXFx0eCcpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAneCcpO1xuXG5cdFx0XHQvLyBEZWxldGVMZWZ0IG9uIGxhc3QgbGluZVxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCBtb2RlbC5nZXRMaW5lQ29udGVudCgzKS5sZW5ndGggKyAxKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICcnKTtcblxuXHRcdFx0Ly8gRGVsZXRlTGVmdCB3aXRoIHJlbW92aW5nIG5ldyBsaW5lIHN5bWJvbFxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ3hcXG4gICAgICAgIGEgICAnKTtcblxuXHRcdFx0Ly8gSW4gY2FzZSBvZiBzZWxlY3Rpb24gRGVsZXRlTGVmdCBvbmx5IGRlbGV0ZXMgc2VsZWN0ZWQgdGV4dFxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCAzKTtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgNCwgdHJ1ZSk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnICAgICAgIGEgICAnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnUFIgIzU0MjM6IEF1dG8gaW5kZW50ICsgdW5kbyArIHJlZG8gaXMgZnVua3knLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCcnXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0e1xuXHRcdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1xcbicsICdhc3NlcnQxJyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVGFiLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1xcblxcdCcsICdhc3NlcnQyJyk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCd5JywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcXG5cXHR5JywgJ2Fzc2VydDInKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXFxuXFx0eVxcblxcdCcsICdhc3NlcnQzJyk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCd4Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcXG5cXHR5XFxuXFx0eCcsICdhc3NlcnQ0Jyk7XG5cblx0XHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yTGVmdC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1xcblxcdHlcXG5cXHR4JywgJ2Fzc2VydDUnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1xcblxcdHlcXG54JywgJ2Fzc2VydDYnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1xcblxcdHl4JywgJ2Fzc2VydDcnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1xcblxcdHgnLCAnYXNzZXJ0OCcpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXFxueCcsICdhc3NlcnQ5Jyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICd4JywgJ2Fzc2VydDEwJyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcXG54JywgJ2Fzc2VydDExJyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcXG5cXHR5XFxueCcsICdhc3NlcnQxMicpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnXFxuXFx0eVxcblxcdHgnLCAnYXNzZXJ0MTMnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5SZWRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ1xcblxcdHlcXG54JywgJ2Fzc2VydDE0Jyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuUmVkbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdcXG54JywgJ2Fzc2VydDE1Jyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuUmVkbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICd4JywgJ2Fzc2VydDE2Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM5MDk3MzogVW5kbyBicmluZ3MgYmFjayBtb2RlbCBhbHRlcm5hdGl2ZSB2ZXJzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnJ1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHtcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRjb25zdCBiZWZvcmVWZXJzaW9uID0gbW9kZWwuZ2V0VmVyc2lvbklkKCk7XG5cdFx0XHRjb25zdCBiZWZvcmVBbHRWZXJzaW9uID0gbW9kZWwuZ2V0QWx0ZXJuYXRpdmVWZXJzaW9uSWQoKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdIZWxsbycsICdrZXlib2FyZCcpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGNvbnN0IGFmdGVyVmVyc2lvbiA9IG1vZGVsLmdldFZlcnNpb25JZCgpO1xuXHRcdFx0Y29uc3QgYWZ0ZXJBbHRWZXJzaW9uID0gbW9kZWwuZ2V0QWx0ZXJuYXRpdmVWZXJzaW9uSWQoKTtcblxuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGJlZm9yZVZlcnNpb24sIGFmdGVyVmVyc2lvbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmVmb3JlQWx0VmVyc2lvbiwgYWZ0ZXJBbHRWZXJzaW9uKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRW50ZXIgaG9ub3JzIGluY3JlYXNlSW5kZW50UGF0dGVybicsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdpZiAodHJ1ZSkgeycsXG5cdFx0XHRcdCdcXHRpZiAodHJ1ZSkgeydcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBpbmRlbnRSdWxlc0xhbmd1YWdlSWQsXG5cdFx0XHRtb2RlbE9wdHM6IHsgaW5zZXJ0U3BhY2VzOiBmYWxzZSB9LFxuXHRcdFx0ZWRpdG9yT3B0czogeyBhdXRvSW5kZW50OiAnZnVsbCcgfVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMTIsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMTIsIDEsIDEyKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDIsIDIsIDIpKTtcblxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCAxMywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCAxMywgMywgMTMpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig0LCAzLCA0LCAzKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1R5cGUgaG9ub3JzIGRlY3JlYXNlSW5kZW50UGF0dGVybicsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdpZiAodHJ1ZSkgeycsXG5cdFx0XHRcdCdcXHQnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogaW5kZW50UnVsZXNMYW5ndWFnZUlkLFxuXHRcdFx0ZWRpdG9yT3B0czogeyBhdXRvSW5kZW50OiAnZnVsbCcgfVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgMiwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCAyLCAyLCAyKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCd9JywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDIsIDIsIDIpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ30nLCAnMDAxJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VudGVyIGhvbm9ycyB1bkluZGVudGVkTGluZVBhdHRlcm4nLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnXFx0XFx0XFx0cmV0dXJuIHRydWUnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogaW5kZW50UnVsZXNMYW5ndWFnZUlkLFxuXHRcdFx0bW9kZWxPcHRzOiB7IGluc2VydFNwYWNlczogZmFsc2UgfSxcblx0XHRcdGVkaXRvck9wdHM6IHsgYXV0b0luZGVudDogJ2Z1bGwnIH1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDE1LCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDE1LCAyLCAxNSkpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDIsIDMsIDIpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRW50ZXIgaG9ub3JzIGluZGVudE5leHRMaW5lUGF0dGVybicsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdpZiAodHJ1ZSknLFxuXHRcdFx0XHQnXFx0cmV0dXJuIHRydWU7Jyxcblx0XHRcdFx0J2lmICh0cnVlKScsXG5cdFx0XHRcdCdcXHRcXHRcXHRcXHRyZXR1cm4gdHJ1ZSdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBpbmRlbnRSdWxlc0xhbmd1YWdlSWQsXG5cdFx0XHRtb2RlbE9wdHM6IHsgaW5zZXJ0U3BhY2VzOiBmYWxzZSB9LFxuXHRcdFx0ZWRpdG9yT3B0czogeyBhdXRvSW5kZW50OiAnZnVsbCcgfVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgMTQsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgMTQsIDIsIDE0KSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDEsIDMsIDEpKTtcblxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCA1LCAxNiwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig1LCAxNiwgNSwgMTYpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig2LCAyLCA2LCAyKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VudGVyIGhvbm9ycyBpbmRlbnROZXh0TGluZVBhdHRlcm4gMicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J2lmICh0cnVlKScsXG5cdFx0XHRcdCdcXHRpZiAodHJ1ZSknXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0aW5kZW50UnVsZXNMYW5ndWFnZUlkLFxuXHRcdFx0e1xuXHRcdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCAxMSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCAxMSwgMiwgMTEpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKG1vZGVsLmdldExpbmVDb3VudCgpKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMywgMywgMywgMykpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnY29uc29sZS5sb2coKTsnLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNCwgMSwgNCwgMSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbnRlciBob25vcnMgaW50ZW50aWFsIGluZGVudCcsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdpZiAodHJ1ZSkgeycsXG5cdFx0XHRcdCdcXHRpZiAodHJ1ZSkgeycsXG5cdFx0XHRcdCdyZXR1cm4gdHJ1ZTsnLFxuXHRcdFx0XHQnfX0nXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogaW5kZW50UnVsZXNMYW5ndWFnZUlkLFxuXHRcdFx0ZWRpdG9yT3B0czogeyBhdXRvSW5kZW50OiAnZnVsbCcgfVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgMTMsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMywgMTMsIDMsIDEzKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNCwgMSwgNCwgMSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAncmV0dXJuIHRydWU7JywgJzAwMScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbnRlciBzdXBwb3J0cyBzZWxlY3Rpb24gMScsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdpZiAodHJ1ZSkgeycsXG5cdFx0XHRcdCdcXHRpZiAodHJ1ZSkgeycsXG5cdFx0XHRcdCdcXHRcXHRyZXR1cm4gdHJ1ZTsnLFxuXHRcdFx0XHQnXFx0fWF9J1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGluZGVudFJ1bGVzTGFuZ3VhZ2VJZCxcblx0XHRcdG1vZGVsT3B0czogeyBpbnNlcnRTcGFjZXM6IGZhbHNlIH1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDQsIDMsIGZhbHNlKTtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgNCwgNCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDQsIDMsIDQsIDQpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig1LCAxLCA1LCAxKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICdcXHR9JywgJzAwMScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbnRlciBzdXBwb3J0cyBzZWxlY3Rpb24gMicsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdpZiAodHJ1ZSkgeycsXG5cdFx0XHRcdCdcXHRpZiAodHJ1ZSkgeydcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBpbmRlbnRSdWxlc0xhbmd1YWdlSWQsXG5cdFx0XHRtb2RlbE9wdHM6IHsgaW5zZXJ0U3BhY2VzOiBmYWxzZSB9XG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCAxMiwgZmFsc2UpO1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCAxMywgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDEyLCAyLCAxMykpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDMsIDMsIDMpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig0LCAzLCA0LCAzKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VudGVyIGhvbm9ycyB0YWJTaXplIGFuZCBpbnNlcnRTcGFjZXMgMScsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdpZiAodHJ1ZSkgeycsXG5cdFx0XHRcdCdcXHRpZiAodHJ1ZSkgeydcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBpbmRlbnRSdWxlc0xhbmd1YWdlSWQsXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCAxMiwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCAxMiwgMSwgMTIpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCA1LCAyLCA1KSk7XG5cblx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgMTMsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMywgMTMsIDMsIDEzKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNCwgOSwgNCwgOSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbnRlciBob25vcnMgdGFiU2l6ZSBhbmQgaW5zZXJ0U3BhY2VzIDInLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnICAgIGlmICh0cnVlKSB7J1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGluZGVudFJ1bGVzTGFuZ3VhZ2VJZCxcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDEyLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDEyLCAxLCAxMikpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24obW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCA1LCAyLCA1KSk7XG5cblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgMTYsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMywgMTYsIDMsIDE2KSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJyAgICBpZiAodHJ1ZSkgeycpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig0LCA5LCA0LCA5KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VudGVyIGhvbm9ycyB0YWJTaXplIGFuZCBpbnNlcnRTcGFjZXMgMycsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdpZiAodHJ1ZSkgeycsXG5cdFx0XHRcdCcgICAgaWYgKHRydWUpIHsnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogaW5kZW50UnVsZXNMYW5ndWFnZUlkLFxuXHRcdFx0bW9kZWxPcHRzOiB7IGluc2VydFNwYWNlczogZmFsc2UgfVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgMTIsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMTIsIDEsIDEyKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDIsIDIsIDIpKTtcblxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCAxNiwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCAxNiwgMywgMTYpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAnICAgIGlmICh0cnVlKSB7Jyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDQsIDMsIDQsIDMpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRW50ZXIgc3VwcG9ydHMgaW50ZW50aW9uYWwgaW5kZW50YXRpb24nLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnXFx0aWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnXFx0XFx0c3dpdGNoKHRydWUpIHsnLFxuXHRcdFx0XHQnXFx0XFx0XFx0Y2FzZSB0cnVlOicsXG5cdFx0XHRcdCdcXHRcXHRcXHRcXHRicmVhazsnLFxuXHRcdFx0XHQnXFx0XFx0fScsXG5cdFx0XHRcdCdcXHR9J1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGluZGVudFJ1bGVzTGFuZ3VhZ2VJZCxcblx0XHRcdG1vZGVsT3B0czogeyBpbnNlcnRTcGFjZXM6IGZhbHNlIH0sXG5cdFx0XHRlZGl0b3JPcHRzOiB7IGF1dG9JbmRlbnQ6ICdmdWxsJyB9XG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCA1LCA0LCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDUsIDQsIDUsIDQpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDUpLCAnXFx0XFx0fScpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig2LCAzLCA2LCAzKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VudGVyIHNob3VsZCBub3QgYWRqdXN0IGN1cnNvciBwb3NpdGlvbiB3aGVuIHByZXNzIGVudGVyIGluIHRoZSBtaWRkbGUgb2YgYSBsaW5lIDEnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnXFx0aWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnXFx0XFx0cmV0dXJuIHRydWU7Jyxcblx0XHRcdFx0J1xcdH1hfSdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBpbmRlbnRSdWxlc0xhbmd1YWdlSWQsXG5cdFx0XHRtb2RlbE9wdHM6IHsgaW5zZXJ0U3BhY2VzOiBmYWxzZSB9XG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCA5LCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDksIDMsIDkpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig0LCAzLCA0LCAzKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICdcXHRcXHQgdHJ1ZTsnLCAnMDAxJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VudGVyIHNob3VsZCBub3QgYWRqdXN0IGN1cnNvciBwb3NpdGlvbiB3aGVuIHByZXNzIGVudGVyIGluIHRoZSBtaWRkbGUgb2YgYSBsaW5lIDInLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnXFx0aWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnXFx0XFx0cmV0dXJuIHRydWU7Jyxcblx0XHRcdFx0J1xcdH1hfSdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBpbmRlbnRSdWxlc0xhbmd1YWdlSWQsXG5cdFx0XHRtb2RlbE9wdHM6IHsgaW5zZXJ0U3BhY2VzOiBmYWxzZSB9XG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCAzLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDMsIDMsIDMpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig0LCAzLCA0LCAzKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICdcXHRcXHRyZXR1cm4gdHJ1ZTsnLCAnMDAxJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VudGVyIHNob3VsZCBub3QgYWRqdXN0IGN1cnNvciBwb3NpdGlvbiB3aGVuIHByZXNzIGVudGVyIGluIHRoZSBtaWRkbGUgb2YgYSBsaW5lIDMnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnICBpZiAodHJ1ZSkgeycsXG5cdFx0XHRcdCcgICAgcmV0dXJuIHRydWU7Jyxcblx0XHRcdFx0JyAgfWF9J1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGluZGVudFJ1bGVzTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgMTEsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMywgMTEsIDMsIDExKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNCwgNSwgNCwgNSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDQpLCAnICAgICB0cnVlOycsICcwMDEnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRW50ZXIgc2hvdWxkIGFkanVzdCBjdXJzb3IgcG9zaXRpb24gd2hlbiBwcmVzcyBlbnRlciBpbiB0aGUgbWlkZGxlIG9mIGxlYWRpbmcgd2hpdGVzcGFjZXMgMScsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdpZiAodHJ1ZSkgeycsXG5cdFx0XHRcdCdcXHRpZiAodHJ1ZSkgeycsXG5cdFx0XHRcdCdcXHRcXHRyZXR1cm4gdHJ1ZTsnLFxuXHRcdFx0XHQnXFx0fWF9J1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGluZGVudFJ1bGVzTGFuZ3VhZ2VJZCxcblx0XHRcdG1vZGVsT3B0czogeyBpbnNlcnRTcGFjZXM6IGZhbHNlIH1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDIsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMywgMiwgMywgMikpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDQsIDIsIDQsIDIpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJ1xcdFxcdHJldHVybiB0cnVlOycsICcwMDEnKTtcblxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCA0LCAxLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDQsIDEsIDQsIDEpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig1LCAxLCA1LCAxKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNSksICdcXHRcXHRyZXR1cm4gdHJ1ZTsnLCAnMDAyJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VudGVyIHNob3VsZCBhZGp1c3QgY3Vyc29yIHBvc2l0aW9uIHdoZW4gcHJlc3MgZW50ZXIgaW4gdGhlIG1pZGRsZSBvZiBsZWFkaW5nIHdoaXRlc3BhY2VzIDInLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnXFx0aWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnXFx0XFx0aWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnXFx0ICAgIFxcdHJldHVybiB0cnVlOycsXG5cdFx0XHRcdCdcXHRcXHR9YX0nXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogaW5kZW50UnVsZXNMYW5ndWFnZUlkLFxuXHRcdFx0bW9kZWxPcHRzOiB7IGluc2VydFNwYWNlczogZmFsc2UgfVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgNCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCA0LCAzLCA0KSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNCwgMywgNCwgMykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDQpLCAnXFx0XFx0XFx0cmV0dXJuIHRydWU7JywgJzAwMScpO1xuXG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDQsIDEsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNCwgMSwgNCwgMSkpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDUsIDEsIDUsIDEpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg1KSwgJ1xcdFxcdFxcdHJldHVybiB0cnVlOycsICcwMDInKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRW50ZXIgc2hvdWxkIGFkanVzdCBjdXJzb3IgcG9zaXRpb24gd2hlbiBwcmVzcyBlbnRlciBpbiB0aGUgbWlkZGxlIG9mIGxlYWRpbmcgd2hpdGVzcGFjZXMgMycsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdpZiAodHJ1ZSkgeycsXG5cdFx0XHRcdCcgIGlmICh0cnVlKSB7Jyxcblx0XHRcdFx0JyAgICByZXR1cm4gdHJ1ZTsnLFxuXHRcdFx0XHQnfWF9J1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGluZGVudFJ1bGVzTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgMiwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCAyLCAzLCAyKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNCwgMiwgNCwgMikpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDQpLCAnICAgIHJldHVybiB0cnVlOycsICcwMDEnKTtcblxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCA0LCAzLCBmYWxzZSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDUsIDMsIDUsIDMpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg1KSwgJyAgICByZXR1cm4gdHJ1ZTsnLCAnMDAyJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VudGVyIHNob3VsZCBhZGp1c3QgY3Vyc29yIHBvc2l0aW9uIHdoZW4gcHJlc3MgZW50ZXIgaW4gdGhlIG1pZGRsZSBvZiBsZWFkaW5nIHdoaXRlc3BhY2VzIDQnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnICBpZiAodHJ1ZSkgeycsXG5cdFx0XHRcdCdcXHQgIHJldHVybiB0cnVlOycsXG5cdFx0XHRcdCd9YX0nLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J2lmICh0cnVlKSB7Jyxcblx0XHRcdFx0JyAgaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnXFx0ICByZXR1cm4gdHJ1ZTsnLFxuXHRcdFx0XHQnfWF9J1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGluZGVudFJ1bGVzTGFuZ3VhZ2VJZCxcblx0XHRcdG1vZGVsT3B0czoge1xuXHRcdFx0XHR0YWJTaXplOiAyLFxuXHRcdFx0XHRpbmRlbnRTaXplOiAyXG5cdFx0XHR9XG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCAzLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDMsIDMsIDMpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig0LCA0LCA0LCA0KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICcgICAgcmV0dXJuIHRydWU7JywgJzAwMScpO1xuXG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDksIDQsIGZhbHNlKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMTAsIDUsIDEwLCA1KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMTApLCAnICAgIHJldHVybiB0cnVlOycsICcwMDEnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRW50ZXIgc2hvdWxkIGFkanVzdCBjdXJzb3IgcG9zaXRpb24gd2hlbiBwcmVzcyBlbnRlciBpbiB0aGUgbWlkZGxlIG9mIGxlYWRpbmcgd2hpdGVzcGFjZXMgNScsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdpZiAodHJ1ZSkgeycsXG5cdFx0XHRcdCcgIGlmICh0cnVlKSB7Jyxcblx0XHRcdFx0JyAgICByZXR1cm4gdHJ1ZTsnLFxuXHRcdFx0XHQnICAgIHJldHVybiB0cnVlOycsXG5cdFx0XHRcdCcnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogaW5kZW50UnVsZXNMYW5ndWFnZUlkLFxuXHRcdFx0bW9kZWxPcHRzOiB7IHRhYlNpemU6IDIgfVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgNSwgZmFsc2UpO1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCA0LCAzLCB0cnVlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMywgNSwgNCwgMykpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDQsIDMsIDQsIDMpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJyAgICByZXR1cm4gdHJ1ZTsnLCAnMDAxJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlIG1pY3Jvc29mdC9tb25hY28tZWRpdG9yIzEwOCBwYXJ0IDEvMjogQXV0byBpbmRlbnRhdGlvbiBvbiBFbnRlciB3aXRoIHNlbGVjdGlvbiBpcyBoYWxmIGJyb2tlbicsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdmdW5jdGlvbiBiYXooKSB7Jyxcblx0XHRcdFx0J1xcdHZhciB4ID0gMTsnLFxuXHRcdFx0XHQnXFx0XFx0XFx0XFx0XFx0XFx0XFx0cmV0dXJuIHg7Jyxcblx0XHRcdFx0J30nXG5cdFx0XHRdLFxuXHRcdFx0bW9kZWxPcHRzOiB7XG5cdFx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdFx0bGFuZ3VhZ2VJZDogaW5kZW50UnVsZXNMYW5ndWFnZUlkLFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgOCwgZmFsc2UpO1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCAxMiwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDgsIDIsIDEyKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJ1xcdHJldHVybiB4OycpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDMsIDIpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgbWljcm9zb2Z0L21vbmFjby1lZGl0b3IjMTA4IHBhcnQgMi8yOiBBdXRvIGluZGVudGF0aW9uIG9uIEVudGVyIHdpdGggc2VsZWN0aW9uIGlzIGhhbGYgYnJva2VuJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J2Z1bmN0aW9uIGJheigpIHsnLFxuXHRcdFx0XHQnXFx0dmFyIHggPSAxOycsXG5cdFx0XHRcdCdcXHRcXHRcXHRcXHRcXHRcXHRcXHRyZXR1cm4geDsnLFxuXHRcdFx0XHQnfSdcblx0XHRcdF0sXG5cdFx0XHRtb2RlbE9wdHM6IHtcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0XHRsYW5ndWFnZUlkOiBpbmRlbnRSdWxlc0xhbmd1YWdlSWQsXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCAxMiwgZmFsc2UpO1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCA4LCB0cnVlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgMTIsIDMsIDgpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAnXFx0cmV0dXJuIHg7Jyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMywgMikpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkVudGVyIHdvcmtzIGlmIHRoZXJlIGFyZSBubyBpbmRlbnRhdGlvbiBydWxlcycsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCc8PycsXG5cdFx0XHRcdCdcXHRpZiAodHJ1ZSkgeycsXG5cdFx0XHRcdCdcXHRcXHRlY2hvICRoaTsnLFxuXHRcdFx0XHQnXFx0XFx0ZWNobyAkYnllOycsXG5cdFx0XHRcdCdcXHR9Jyxcblx0XHRcdFx0Jz8+J1xuXHRcdFx0XSxcblx0XHRcdG1vZGVsT3B0czogeyBpbnNlcnRTcGFjZXM6IGZhbHNlIH1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDUsIDMsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNSwgMywgNSwgMykpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNiksICdcXHQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNiwgMiwgNiwgMikpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDUpLCAnXFx0fScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkVudGVyIHdvcmtzIGlmIHRoZXJlIGFyZSBubyBpbmRlbnRhdGlvbiBydWxlcyAyJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J1x0aWYgKDUpJyxcblx0XHRcdFx0J1x0XHRyZXR1cm4gNTsnLFxuXHRcdFx0XHQnXHQnXG5cdFx0XHRdLFxuXHRcdFx0bW9kZWxPcHRzOiB7IGluc2VydFNwYWNlczogZmFsc2UgfVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgMiwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCAyLCAzLCAyKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXG4nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNCwgMiwgNCwgMikpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDQpLCAnXFx0Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1ZyAjMTY1NDM6IFRhYiBzaG91bGQgaW5kZW50IHRvIGNvcnJlY3QgaW5kZW50YXRpb24gc3BvdCBpbW1lZGlhdGVseScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J2Z1bmN0aW9uIGJheigpIHsnLFxuXHRcdFx0XHQnXFx0ZnVuY3Rpb24gaGVsbG8oKSB7IC8vIHNvbWV0aGluZyBoZXJlJyxcblx0XHRcdFx0J1xcdCcsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnXFx0fScsXG5cdFx0XHRcdCd9J1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdGluZGVudFJ1bGVzTGFuZ3VhZ2VJZCxcblx0XHRcdHtcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDQsIDEsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNCwgMSwgNCwgMSkpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlRhYiwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICdcXHRcXHQnKTtcblx0XHR9KTtcblx0fSk7XG5cblxuXHR0ZXN0KCdidWcgIzI5MzggKDEpOiBXaGVuIHByZXNzaW5nIFRhYiBvbiB3aGl0ZS1zcGFjZSBvbmx5IGxpbmVzLCBpbmRlbnQgc3RyYWlnaHQgdG8gdGhlIHJpZ2h0IHNwb3QgKHNpbWlsYXIgdG8gZW1wdHkgbGluZXMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0ZnVuY3Rpb24gYmF6KCkgeycsXG5cdFx0XHRcdCdcXHRcXHRmdW5jdGlvbiBoZWxsbygpIHsgLy8gc29tZXRoaW5nIGhlcmUnLFxuXHRcdFx0XHQnXFx0XFx0Jyxcblx0XHRcdFx0J1xcdCcsXG5cdFx0XHRcdCdcXHRcXHR9Jyxcblx0XHRcdFx0J1xcdH0nXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0aW5kZW50UnVsZXNMYW5ndWFnZUlkLFxuXHRcdFx0e1xuXHRcdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgNCwgMiwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig0LCAyLCA0LCAyKSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVGFiLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJ1xcdFxcdFxcdCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXG5cdHRlc3QoJ2J1ZyAjMjkzOCAoMik6IFdoZW4gcHJlc3NpbmcgVGFiIG9uIHdoaXRlLXNwYWNlIG9ubHkgbGluZXMsIGluZGVudCBzdHJhaWdodCB0byB0aGUgcmlnaHQgc3BvdCAoc2ltaWxhciB0byBlbXB0eSBsaW5lcyknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdcXHRmdW5jdGlvbiBiYXooKSB7Jyxcblx0XHRcdFx0J1xcdFxcdGZ1bmN0aW9uIGhlbGxvKCkgeyAvLyBzb21ldGhpbmcgaGVyZScsXG5cdFx0XHRcdCdcXHRcXHQnLFxuXHRcdFx0XHQnICAgICcsXG5cdFx0XHRcdCdcXHRcXHR9Jyxcblx0XHRcdFx0J1xcdH0nXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0aW5kZW50UnVsZXNMYW5ndWFnZUlkLFxuXHRcdFx0e1xuXHRcdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgNCwgMSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig0LCAxLCA0LCAxKSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVGFiLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJ1xcdFxcdFxcdCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdidWcgIzI5MzggKDMpOiBXaGVuIHByZXNzaW5nIFRhYiBvbiB3aGl0ZS1zcGFjZSBvbmx5IGxpbmVzLCBpbmRlbnQgc3RyYWlnaHQgdG8gdGhlIHJpZ2h0IHNwb3QgKHNpbWlsYXIgdG8gZW1wdHkgbGluZXMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0ZnVuY3Rpb24gYmF6KCkgeycsXG5cdFx0XHRcdCdcXHRcXHRmdW5jdGlvbiBoZWxsbygpIHsgLy8gc29tZXRoaW5nIGhlcmUnLFxuXHRcdFx0XHQnXFx0XFx0Jyxcblx0XHRcdFx0J1xcdFxcdFxcdCcsXG5cdFx0XHRcdCdcXHRcXHR9Jyxcblx0XHRcdFx0J1xcdH0nXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0aW5kZW50UnVsZXNMYW5ndWFnZUlkLFxuXHRcdFx0e1xuXHRcdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgNCwgMywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig0LCAzLCA0LCAzKSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVGFiLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJ1xcdFxcdFxcdFxcdCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdidWcgIzI5MzggKDQpOiBXaGVuIHByZXNzaW5nIFRhYiBvbiB3aGl0ZS1zcGFjZSBvbmx5IGxpbmVzLCBpbmRlbnQgc3RyYWlnaHQgdG8gdGhlIHJpZ2h0IHNwb3QgKHNpbWlsYXIgdG8gZW1wdHkgbGluZXMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnXFx0ZnVuY3Rpb24gYmF6KCkgeycsXG5cdFx0XHRcdCdcXHRcXHRmdW5jdGlvbiBoZWxsbygpIHsgLy8gc29tZXRoaW5nIGhlcmUnLFxuXHRcdFx0XHQnXFx0XFx0Jyxcblx0XHRcdFx0J1xcdFxcdFxcdFxcdCcsXG5cdFx0XHRcdCdcXHRcXHR9Jyxcblx0XHRcdFx0J1xcdH0nXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0aW5kZW50UnVsZXNMYW5ndWFnZUlkLFxuXHRcdFx0e1xuXHRcdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgNCwgNCwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig0LCA0LCA0LCA0KSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVGFiLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJ1xcdFxcdFxcdFxcdFxcdCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdidWcgIzMxMDE1OiBXaGVuIHByZXNzaW5nIFRhYiBvbiBsaW5lcyBhbmQgRW50ZXIgcnVsZXMgYXJlIGF2YWlsLCBpbmRlbnQgc3RyYWlnaHQgdG8gdGhlIHJpZ2h0IHNwb3RUYWInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb25FbnRlckxhbmd1YWdlSWQgPSBzZXR1cE9uRW50ZXJMYW5ndWFnZShJbmRlbnRBY3Rpb24uSW5kZW50KTtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0JyAgICBpZiAoYSkgeycsXG5cdFx0XHRcdCcgICAgICAgICcsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JyAgICB9J1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdG9uRW50ZXJMYW5ndWFnZUlkXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDEpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5UYWIsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnICAgIGlmIChhKSB7Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcgICAgICAgICcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAnICAgICAgICAnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDUpLCAnICAgIH0nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndHlwZSBob25vcnMgaW5kZW50YXRpb24gcnVsZXM6IHJ1Ynkga2V5d29yZHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcnVieUxhbmd1YWdlSWQgPSBzZXR1cEluZGVudFJ1bGVzTGFuZ3VhZ2UoJ3J1YnknLCB7XG5cdFx0XHRpbmNyZWFzZUluZGVudFBhdHRlcm46IC9eXFxzKigoYmVnaW58Y2xhc3N8ZGVmfGVsc2V8ZWxzaWZ8ZW5zdXJlfGZvcnxpZnxtb2R1bGV8cmVzY3VlfHVubGVzc3x1bnRpbHx3aGVufHdoaWxlKXwoLipcXHNkb1xcYikpXFxiW15cXHs7XSokLyxcblx0XHRcdGRlY3JlYXNlSW5kZW50UGF0dGVybjogL15cXHMqKFt9XFxdXShbLCldP1xccyooI3wkKXxcXC5bYS16QS1aX11cXHcqXFxiKXwoZW5kfHJlc2N1ZXxlbnN1cmV8ZWxzZXxlbHNpZnx3aGVuKVxcYikvXG5cdFx0fSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdjbGFzcyBHcmVldGVyJyxcblx0XHRcdFx0JyAgZGVmIGluaXRpYWxpemUobmFtZSknLFxuXHRcdFx0XHQnICAgIEBuYW1lID0gbmFtZScsXG5cdFx0XHRcdCcgICAgZW4nXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0cnVieUxhbmd1YWdlSWRcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdmdWxsJyB9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgNCwgNywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbig0LCA3LCA0LCA3KSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdkJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICcgIGVuZCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdBdXRvIGluZGVudCBvbiB0eXBlOiBpbmNyZWFzZUluZGVudFBhdHRlcm4gaGFzIGhpZ2hlciBwcmlvcml0eSB0aGFuIGRlY3JlYXNlSW5kZW50IHdoZW4gaW5oZXJpdGluZycsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdcXHRpZiAodHJ1ZSkgeycsXG5cdFx0XHRcdCdcXHRcXHRjb25zb2xlLmxvZygpOycsXG5cdFx0XHRcdCdcXHR9IGVsc2UgaWYgeycsXG5cdFx0XHRcdCdcXHRcXHRjb25zb2xlLmxvZygpJyxcblx0XHRcdFx0J1xcdH0nXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogaW5kZW50UnVsZXNMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCA1LCAzLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDUsIDMsIDUsIDMpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2UnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oNSwgNCwgNSwgNCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDUpLCAnXFx0fWUnLCAnVGhpcyBsaW5lIHNob3VsZCBub3QgZGVjcmVhc2UgaW5kZW50Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R5cGUgaG9ub3JzIHVzZXJzIGluZGVudGF0aW9uIGFkanVzdG1lbnQnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnXFx0aWYgKHRydWUgfHwnLFxuXHRcdFx0XHQnXFx0ICkgeycsXG5cdFx0XHRcdCdcXHR9Jyxcblx0XHRcdFx0J2lmICh0cnVlIHx8Jyxcblx0XHRcdFx0JykgeycsXG5cdFx0XHRcdCd9J1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGluZGVudFJ1bGVzTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgMywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCAzLCAyLCAzKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCcgJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDQpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ1xcdCAgKSB7JywgJ1RoaXMgbGluZSBzaG91bGQgbm90IGRlY3JlYXNlIGluZGVudCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdidWcgMjk5NzI6IGlmIGEgbGluZSBpcyBsaW5lIGNvbW1lbnQsIG9wZW4gYnJhY2tldCBzaG91bGQgbm90IGluZGVudCBuZXh0IGxpbmUnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnXFx0Ly8geycsXG5cdFx0XHRcdCdcXHRcXHQnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogaW5kZW50UnVsZXNMYW5ndWFnZUlkLFxuXHRcdFx0ZWRpdG9yT3B0czogeyBhdXRvSW5kZW50OiAnZnVsbCcgfVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMywgMywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCAzLCAzLCAzKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCd9JywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDIsIDMsIDIpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJ30nKTtcblx0XHR9KTtcblx0fSk7XG5cblxuXHR0ZXN0KCdpc3N1ZSAjMzgyNjE6IFRBQiBrZXkgcmVzdWx0cyBpbiBiaXphcnJlIGluZGVudGF0aW9uIGluIEMrKyBtb2RlICcsICgpID0+IHtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gJ2luZGVudFJ1bGVzTW9kZSc7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogbGFuZ3VhZ2VJZCB9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIobGFuZ3VhZ2VJZCwge1xuXHRcdFx0YnJhY2tldHM6IFtcblx0XHRcdFx0Wyd7JywgJ30nXSxcblx0XHRcdFx0WydbJywgJ10nXSxcblx0XHRcdFx0WycoJywgJyknXVxuXHRcdFx0XSxcblx0XHRcdGluZGVudGF0aW9uUnVsZXM6IHtcblx0XHRcdFx0aW5jcmVhc2VJbmRlbnRQYXR0ZXJuOiBuZXcgUmVnRXhwKCcoXi4qXFxcXHtbXn1dKiQpJyksXG5cdFx0XHRcdGRlY3JlYXNlSW5kZW50UGF0dGVybjogbmV3IFJlZ0V4cCgnXlxcXFxzKlxcXFx9Jylcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J2ludCBtYWluKCkgeycsXG5cdFx0XHRcdCcgIHJldHVybiAwOycsXG5cdFx0XHRcdCd9Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdib29sIEZvbzo6YmFyKGNvbnN0IHN0cmluZyAmYSwnLFxuXHRcdFx0XHQnICAgICAgICAgICAgICBjb25zdCBzdHJpbmcgJmIpIHsnLFxuXHRcdFx0XHQnICBmb28oKTsnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JyknLFxuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdGxhbmd1YWdlSWQsXG5cdFx0XHR7XG5cdFx0XHRcdHRhYlNpemU6IDIsXG5cdFx0XHRcdGluZGVudFNpemU6IDJcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7IGF1dG9JbmRlbnQ6ICdhZHZhbmNlZCcgfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDgsIDEsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oOCwgMSwgOCwgMSkpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlRhYiwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdpbnQgbWFpbigpIHsnLFxuXHRcdFx0XHRcdCcgIHJldHVybiAwOycsXG5cdFx0XHRcdFx0J30nLFxuXHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdCdib29sIEZvbzo6YmFyKGNvbnN0IHN0cmluZyAmYSwnLFxuXHRcdFx0XHRcdCcgICAgICAgICAgICAgIGNvbnN0IHN0cmluZyAmYikgeycsXG5cdFx0XHRcdFx0JyAgZm9vKCk7Jyxcblx0XHRcdFx0XHQnICAnLFxuXHRcdFx0XHRcdCcpJyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldFNlbGVjdGlvbigpLCBuZXcgU2VsZWN0aW9uKDgsIDMsIDgsIDMpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzU3MTk3OiBpbmRlbnQgcnVsZXMgcmVnZXggc2hvdWxkIGJlIHN0YXRlbGVzcycsICgpID0+IHtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gc2V0dXBJbmRlbnRSdWxlc0xhbmd1YWdlKCdsYW5nJywge1xuXHRcdFx0ZGVjcmVhc2VJbmRlbnRQYXR0ZXJuOiAvXlxccyp9JC9nbSxcblx0XHRcdGluY3JlYXNlSW5kZW50UGF0dGVybjogL14oPyFbXlxcU1xcbl0qKD8hLS18XHUyMDEzXHUyMDEzfFx1MjAxNFx1MjAxNCkoPzpbLVx1Mjc0RFx1Mjc1MVx1MjVBMFx1MkIxQ1x1MjVBMVx1MjYxMFx1MjVBQVx1MjVBQlx1MjAxM1x1MjAxNFx1MjI2MVx1MjE5Mlx1MjAzQVx1MjcxOHhYXHUyNzE0XHUyNzEzXHUyNjExK118XFxbWyB4WCstXT9cXF0pXFxzW15cXG5dKilbXlxcU1xcbl0qKC4rOilbXlxcU1xcbl0qKD86KD89QFteXFxzKn4oXSsoPzo6XFwvXFwvW15cXHMqfig6XSspPyg/OlxcKFteKV0qXFwpKT8pfCQpL2dtLFxuXHRcdH0pO1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J1Byb2plY3Q6Jyxcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBsYW5ndWFnZUlkLFxuXHRcdFx0bW9kZWxPcHRzOiB7IGluc2VydFNwYWNlczogZmFsc2UgfSxcblx0XHRcdGVkaXRvck9wdHM6IHsgYXV0b0luZGVudDogJ2Z1bGwnIH1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDEsIDksIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgOSwgMSwgOSkpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24obW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCAyLCAyLCAyKSk7XG5cblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMSwgOSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA5LCAxLCA5KSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24obW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCAyLCAyLCAyKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R5cGluZyBpbiBqc29uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSAnaW5kZW50UnVsZXNNb2RlJztcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZVNlcnZpY2UucmVnaXN0ZXJMYW5ndWFnZSh7IGlkOiBsYW5ndWFnZUlkIH0pKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5yZWdpc3RlcihsYW5ndWFnZUlkLCB7XG5cdFx0XHRicmFja2V0czogW1xuXHRcdFx0XHRbJ3snLCAnfSddLFxuXHRcdFx0XHRbJ1snLCAnXSddLFxuXHRcdFx0XHRbJygnLCAnKSddXG5cdFx0XHRdLFxuXHRcdFx0aW5kZW50YXRpb25SdWxlczoge1xuXHRcdFx0XHRpbmNyZWFzZUluZGVudFBhdHRlcm46IG5ldyBSZWdFeHAoJyh7Kyg/PShbXlwiXSpcIlteXCJdKlwiKSpbXlwifV0qJCkpfChcXFxcWysoPz0oW15cIl0qXCJbXlwiXSpcIikqW15cIlxcXFxdXSokKSknKSxcblx0XHRcdFx0ZGVjcmVhc2VJbmRlbnRQYXR0ZXJuOiBuZXcgUmVnRXhwKCdeXFxcXHMqW31cXFxcXV0sP1xcXFxzKiQnKVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQneycsXG5cdFx0XHRcdCcgIFwic2NyaXB0czoge1wiJyxcblx0XHRcdFx0JyAgICBcIndhdGNoXCI6IFwiYSB7XCInLFxuXHRcdFx0XHQnICAgIFwiYnVpbGR7XCI6IFwiYlwiJyxcblx0XHRcdFx0JyAgICBcInRhc2tzXCI6IFtdJyxcblx0XHRcdFx0JyAgICBcInRhc2tzXCI6IFtcImFcIl0nLFxuXHRcdFx0XHQnICBcIn1cIicsXG5cdFx0XHRcdCdcIn1cIidcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHRsYW5ndWFnZUlkLFxuXHRcdFx0e1xuXHRcdFx0XHR0YWJTaXplOiAyLFxuXHRcdFx0XHRpbmRlbnRTaXplOiAyXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwgeyBhdXRvSW5kZW50OiAnZnVsbCcgfSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDMsIDE5LCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDE5LCAzLCAxOSkpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDQpLCAnICAgICcpO1xuXG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDUsIDE4LCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDUsIDE4LCA1LCAxOCkpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDYpLCAnICAgICcpO1xuXG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDcsIDE1LCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDcsIDE1LCA3LCAxNSkpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFxuJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDgpLCAnICAgICAgJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDkpLCAnICAgIF0nKTtcblxuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxMCwgMTgsIGZhbHNlKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMTAsIDE4LCAxMCwgMTgpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxMSksICcgICAgXScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTExMTI4OiBNdWx0aWN1cnNvciBgRW50ZXJgIGlzc3VlIHdpdGggaW5kZW50YXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJyAgICBsZXQgYSwgYiwgYzsnLCBpbmRlbnRSdWxlc0xhbmd1YWdlSWQsIHsgZGV0ZWN0SW5kZW50YXRpb246IGZhbHNlLCBpbnNlcnRTcGFjZXM6IGZhbHNlLCB0YWJTaXplOiA0IH0pO1xuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDExLCAxLCAxMSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMTQsIDEsIDE0KSxcblx0XHRcdF0pO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICcgICAgbGV0IGEsXFxuXFx0IGIsXFxuXFx0IGM7Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMjI3MTQ6IHRhYlNpemU9MSBwcmV2ZW50IHR5cGluZyBhIHN0cmluZyBtYXRjaGluZyBkZWNyZWFzZUluZGVudFBhdHRlcm4gaW4gYW4gZW1wdHkgZmlsZScsICgpID0+IHtcblx0XHRjb25zdCBsYXRleHRMYW5ndWFnZUlkID0gc2V0dXBJbmRlbnRSdWxlc0xhbmd1YWdlKCdsYXRleCcsIHtcblx0XHRcdGluY3JlYXNlSW5kZW50UGF0dGVybjogbmV3IFJlZ0V4cCgnXFxcXFxcXFxiZWdpbnsoPyFkb2N1bWVudCkoW159XSopfSg/IS4qXFxcXFxcXFxlbmR7XFxcXDF9KScpLFxuXHRcdFx0ZGVjcmVhc2VJbmRlbnRQYXR0ZXJuOiBuZXcgUmVnRXhwKCdeXFxcXHMqXFxcXFxcXFxlbmR7KD8hZG9jdW1lbnQpJylcblx0XHR9KTtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdCdcXFxcZW5kJyxcblx0XHRcdGxhdGV4dExhbmd1YWdlSWQsXG5cdFx0XHR7IHRhYlNpemU6IDEgfVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgYXV0b0luZGVudDogJ2Z1bGwnIH0sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCA1LCBmYWxzZSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDUpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ3snLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ1xcXFxlbmR7fScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbGVjdHJpY0NoYXJhY3RlciAtIGRvZXMgbm90aGluZyBpZiBubyBlbGVjdHJpYyBjaGFyJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0JyAgaWYgKGEpIHsnLFxuXHRcdFx0XHQnJ1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGVsZWN0cmljQ2hhckxhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDEpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJyonLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcqJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VsZWN0cmljQ2hhcmFjdGVyIC0gaW5kZW50cyBpbiBvcmRlciB0byBtYXRjaCBicmFja2V0JywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0JyAgaWYgKGEpIHsnLFxuXHRcdFx0XHQnJ1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGVsZWN0cmljQ2hhckxhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDEpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ30nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcgIH0nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWxlY3RyaWNDaGFyYWN0ZXIgLSB1bmluZGVudHMgaW4gb3JkZXIgdG8gbWF0Y2ggYnJhY2tldCcsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCcgIGlmIChhKSB7Jyxcblx0XHRcdFx0JyAgICAnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogZWxlY3RyaWNDaGFyTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgNSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnfScsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJyAgfScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbGVjdHJpY0NoYXJhY3RlciAtIG1hdGNoZXMgd2l0aCBjb3JyZWN0IGJyYWNrZXQnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnICBpZiAoYSkgeycsXG5cdFx0XHRcdCcgICAgaWYgKGIpIHsnLFxuXHRcdFx0XHQnICAgIH0nLFxuXHRcdFx0XHQnICAgICdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBlbGVjdHJpY0NoYXJMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCA0LCAxKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCd9JywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDQpLCAnICB9ICAgICcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbGVjdHJpY0NoYXJhY3RlciAtIGRvZXMgbm90aGluZyBpZiBicmFja2V0IGRvZXMgbm90IG1hdGNoJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0JyAgaWYgKGEpIHsnLFxuXHRcdFx0XHQnICAgIGlmIChiKSB7Jyxcblx0XHRcdFx0JyAgICB9Jyxcblx0XHRcdFx0JyAgfSAgJ1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGVsZWN0cmljQ2hhckxhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDQsIDYpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ30nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICcgIH0gIH0nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWxlY3RyaWNDaGFyYWN0ZXIgLSBtYXRjaGVzIGJyYWNrZXQgZXZlbiBpbiBsaW5lIHdpdGggY29udGVudCcsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCcgIGlmIChhKSB7Jyxcblx0XHRcdFx0Jy8vIGhlbGxvJ1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGVsZWN0cmljQ2hhckxhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDEpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ30nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcgIH0vLyBoZWxsbycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbGVjdHJpY0NoYXJhY3RlciAtIGlzIG5vLW9wIGlmIGJyYWNrZXQgaXMgbGluZWQgdXAnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnICBpZiAoYSkgeycsXG5cdFx0XHRcdCcgICdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBlbGVjdHJpY0NoYXJMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCAzKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCd9JywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnICB9Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VsZWN0cmljQ2hhcmFjdGVyIC0gaXMgbm8tb3AgaWYgdGhlcmUgaXMgbm9uLXdoaXRlc3BhY2UgdGV4dCBiZWZvcmUnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnICBpZiAoYSkgeycsXG5cdFx0XHRcdCdhJ1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGVsZWN0cmljQ2hhckxhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDIpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ30nLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdhfScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbGVjdHJpY0NoYXJhY3RlciAtIGlzIG5vLW9wIGlmIHBhaXJzIGFyZSBhbGwgbWF0Y2hlZCBiZWZvcmUnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnZm9vKCgpID0+IHsnLFxuXHRcdFx0XHQnICAoIDEgKyAyICkgJyxcblx0XHRcdFx0J30pJ1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGVsZWN0cmljQ2hhckxhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDEzKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCcqJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnICAoIDEgKyAyICkgKicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbGVjdHJpY0NoYXJhY3RlciAtIGlzIG5vLW9wIGlmIG1hdGNoaW5nIGJyYWNrZXQgaXMgb24gdGhlIHNhbWUgbGluZScsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCcoZGl2Jyxcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBlbGVjdHJpY0NoYXJMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAxLCA1KTtcblx0XHRcdGxldCBjaGFuZ2VUZXh0OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBtb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoZSA9PiB7XG5cdFx0XHRcdGNoYW5nZVRleHQgPSBlLmNoYW5nZXNbMF0udGV4dDtcblx0XHRcdH0pO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJyknLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcoZGl2KScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGFuZ2VUZXh0LCAnKScpO1xuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VsZWN0cmljQ2hhcmFjdGVyIC0gaXMgbm8tb3AgaWYgdGhlIGxpbmUgaGFzIG90aGVyIGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnTWF0aC5tYXgoJyxcblx0XHRcdFx0J1xcdDInLFxuXHRcdFx0XHQnXFx0Mydcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBlbGVjdHJpY0NoYXJMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAzLCAzKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCcpJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAnXFx0MyknKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRWxlY3RyaWNDaGFyYWN0ZXIgLSBhcHBlbmRzIHRleHQnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnICBpZiAoYSkgeycsXG5cdFx0XHRcdCcvKidcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBlbGVjdHJpY0NoYXJMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCAzKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCcqJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnLyoqICovJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0VsZWN0cmljQ2hhcmFjdGVyIC0gYXBwZW5kcyB0ZXh0IDInLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnICBpZiAoYSkgeycsXG5cdFx0XHRcdCcgIC8qJ1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGVsZWN0cmljQ2hhckxhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8oZWRpdG9yLCB2aWV3TW9kZWwsIDIsIDUpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJyonLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcgIC8qKiAqLycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdFbGVjdHJpY0NoYXJhY3RlciAtIGlzc3VlICMyMzcxMTogUmVwbGFjaW5nIHNlbGVjdGVkIHRleHQgd2l0aCApXX0gZmFpbHMgdG8gZGVsZXRlIG9sZCB0ZXh0IHdpdGggYmFja3dhcmRzLWRyYWdnZWQgc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J3snLFxuXHRcdFx0XHQnd29yZCdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBlbGVjdHJpY0NoYXJMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKGVkaXRvciwgdmlld01vZGVsLCAyLCA1KTtcblx0XHRcdG1vdmVUbyhlZGl0b3IsIHZpZXdNb2RlbCwgMiwgMSwgdHJ1ZSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnfScsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ30nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzYxMDcwOiBiYWNrdGljayAoYCkgc2hvdWxkIGF1dG8tY2xvc2UgYWZ0ZXIgYSB3b3JkIGNoYXJhY3RlcicsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbJ2NvbnN0IG1hcmt1cCA9IGhpZ2hsaWdodCddLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKDEpO1xuXHRcdFx0YXNzZXJ0VHlwZShlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwsIDEsIDI1LCAnYCcsICdgYCcsIGBhdXRvIGNsb3NlcyBcXGAgQCAoMSwgMjUpYCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMzI5MTI6IHF1b3RlcyBzaG91bGQgbm90IGF1dG8tY2xvc2UgaWYgdGhleSBhcmUgY2xvc2luZyBhIHN0cmluZycsICgpID0+IHtcblx0XHRzZXR1cEF1dG9DbG9zaW5nTGFuZ3VhZ2VUb2tlbml6YXRpb24oKTtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnY29uc3QgdDIgPSBgc29tZXRoaW5nICR7dDF9JywgYXV0b0Nsb3NpbmdMYW5ndWFnZUlkKTtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoXG5cdFx0XHRtb2RlbCxcblx0XHRcdHt9LFxuXHRcdFx0KGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gdmlld01vZGVsLm1vZGVsO1xuXHRcdFx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24oMSk7XG5cdFx0XHRcdGFzc2VydFR5cGUoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsLCAxLCAyOCwgJ2AnLCAnYCcsIGBkb2VzIG5vdCBhdXRvIGNsb3NlIFxcYCBAICgxLCAyOClgKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvQ2xvc2luZ1BhaXJzIC0gb3BlbiBwYXJlbnM6IGRlZmF1bHQnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQndmFyIGEgPSBbXTsnLFxuXHRcdFx0XHQndmFyIGIgPSBgYXNkYDsnLFxuXHRcdFx0XHQndmFyIGMgPSBcXCdhc2RcXCc7Jyxcblx0XHRcdFx0J3ZhciBkID0gXCJhc2RcIjsnLFxuXHRcdFx0XHQndmFyIGUgPSAvKjMqL1x0MzsnLFxuXHRcdFx0XHQndmFyIGYgPSAvKiogMyAqLzM7Jyxcblx0XHRcdFx0J3ZhciBnID0gKDMrNSk7Jyxcblx0XHRcdFx0J3ZhciBoID0geyBhOiBcXCd2YWx1ZVxcJyB9OycsXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXG5cdFx0XHRjb25zdCBhdXRvQ2xvc2VQb3NpdGlvbnMgPSBbXG5cdFx0XHRcdCd2YXJ8IGF8IHw9fCBbfF18O3wnLFxuXHRcdFx0XHQndmFyfCBifCB8PXwgfGBhc2R8YHw7fCcsXG5cdFx0XHRcdCd2YXJ8IGN8IHw9fCB8XFwnYXNkfFxcJ3w7fCcsXG5cdFx0XHRcdCd2YXJ8IGR8IHw9fCB8XCJhc2R8XCJ8O3wnLFxuXHRcdFx0XHQndmFyfCBlfCB8PXwgLyozKi98XHQzfDt8Jyxcblx0XHRcdFx0J3ZhcnwgZnwgfD18IC8qKnwgM3wgKi8zfDt8Jyxcblx0XHRcdFx0J3ZhcnwgZ3wgfD18ICgzKzV8KXw7fCcsXG5cdFx0XHRcdCd2YXJ8IGh8IHw9fCB7fCBhfDp8IHxcXCd2YWx1ZXxcXCd8IHx9fDt8Jyxcblx0XHRcdF07XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gYXV0b0Nsb3NlUG9zaXRpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBpICsgMTtcblx0XHRcdFx0Y29uc3QgYXV0b0Nsb3NlQ29sdW1ucyA9IGV4dHJhY3RBdXRvQ2xvc2luZ1NwZWNpYWxDb2x1bW5zKG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlciksIGF1dG9DbG9zZVBvc2l0aW9uc1tpXSk7XG5cblx0XHRcdFx0Zm9yIChsZXQgY29sdW1uID0gMTsgY29sdW1uIDwgYXV0b0Nsb3NlQ29sdW1ucy5sZW5ndGg7IGNvbHVtbisrKSB7XG5cdFx0XHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdGlmIChhdXRvQ2xvc2VDb2x1bW5zW2NvbHVtbl0gPT09IEF1dG9DbG9zaW5nQ29sdW1uVHlwZS5TcGVjaWFsMSkge1xuXHRcdFx0XHRcdFx0YXNzZXJ0VHlwZShlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwsIGxpbmVOdW1iZXIsIGNvbHVtbiwgJygnLCAnKCknLCBgYXV0byBjbG9zZXMgQCAoJHtsaW5lTnVtYmVyfSwgJHtjb2x1bW59KWApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhc3NlcnRUeXBlKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCwgbGluZU51bWJlciwgY29sdW1uLCAnKCcsICcoJywgYGRvZXMgbm90IGF1dG8gY2xvc2UgQCAoJHtsaW5lTnVtYmVyfSwgJHtjb2x1bW59KWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvQ2xvc2luZ1BhaXJzIC0gb3BlbiBwYXJlbnM6IHdoaXRlc3BhY2UnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQndmFyIGEgPSBbXTsnLFxuXHRcdFx0XHQndmFyIGIgPSBgYXNkYDsnLFxuXHRcdFx0XHQndmFyIGMgPSBcXCdhc2RcXCc7Jyxcblx0XHRcdFx0J3ZhciBkID0gXCJhc2RcIjsnLFxuXHRcdFx0XHQndmFyIGUgPSAvKjMqL1x0MzsnLFxuXHRcdFx0XHQndmFyIGYgPSAvKiogMyAqLzM7Jyxcblx0XHRcdFx0J3ZhciBnID0gKDMrNSk7Jyxcblx0XHRcdFx0J3ZhciBoID0geyBhOiBcXCd2YWx1ZVxcJyB9OycsXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkLFxuXHRcdFx0ZWRpdG9yT3B0czoge1xuXHRcdFx0XHRhdXRvQ2xvc2luZ0JyYWNrZXRzOiAnYmVmb3JlV2hpdGVzcGFjZSdcblx0XHRcdH1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cblx0XHRcdGNvbnN0IGF1dG9DbG9zZVBvc2l0aW9ucyA9IFtcblx0XHRcdFx0J3ZhcnwgYXwgPXwgW3xdO3wnLFxuXHRcdFx0XHQndmFyfCBifCA9fCBgYXNkYDt8Jyxcblx0XHRcdFx0J3ZhcnwgY3wgPXwgXFwnYXNkXFwnO3wnLFxuXHRcdFx0XHQndmFyfCBkfCA9fCBcImFzZFwiO3wnLFxuXHRcdFx0XHQndmFyfCBlfCA9fCAvKjMqL3xcdDM7fCcsXG5cdFx0XHRcdCd2YXJ8IGZ8ID18IC8qKnwgM3wgKi8zO3wnLFxuXHRcdFx0XHQndmFyfCBnfCA9fCAoMys1fCk7fCcsXG5cdFx0XHRcdCd2YXJ8IGh8ID18IHt8IGE6fCBcXCd2YWx1ZVxcJ3wgfH07fCcsXG5cdFx0XHRdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGF1dG9DbG9zZVBvc2l0aW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gaSArIDE7XG5cdFx0XHRcdGNvbnN0IGF1dG9DbG9zZUNvbHVtbnMgPSBleHRyYWN0QXV0b0Nsb3NpbmdTcGVjaWFsQ29sdW1ucyhtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGxpbmVOdW1iZXIpLCBhdXRvQ2xvc2VQb3NpdGlvbnNbaV0pO1xuXG5cdFx0XHRcdGZvciAobGV0IGNvbHVtbiA9IDE7IGNvbHVtbiA8IGF1dG9DbG9zZUNvbHVtbnMubGVuZ3RoOyBjb2x1bW4rKykge1xuXHRcdFx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihsaW5lTnVtYmVyKTtcblx0XHRcdFx0XHRpZiAoYXV0b0Nsb3NlQ29sdW1uc1tjb2x1bW5dID09PSBBdXRvQ2xvc2luZ0NvbHVtblR5cGUuU3BlY2lhbDEpIHtcblx0XHRcdFx0XHRcdGFzc2VydFR5cGUoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsLCBsaW5lTnVtYmVyLCBjb2x1bW4sICcoJywgJygpJywgYGF1dG8gY2xvc2VzIEAgKCR7bGluZU51bWJlcn0sICR7Y29sdW1ufSlgKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YXNzZXJ0VHlwZShlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwsIGxpbmVOdW1iZXIsIGNvbHVtbiwgJygnLCAnKCcsIGBkb2VzIG5vdCBhdXRvIGNsb3NlIEAgKCR7bGluZU51bWJlcn0sICR7Y29sdW1ufSlgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYXV0b0Nsb3NpbmdQYWlycyAtIG9wZW4gcGFyZW5zIGRpc2FibGVkL2VuYWJsZWQgb3BlbiBxdW90ZXMgZW5hYmxlZC9kaXNhYmxlZCcsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCd2YXIgYSA9IFtdOycsXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkLFxuXHRcdFx0ZWRpdG9yT3B0czoge1xuXHRcdFx0XHRhdXRvQ2xvc2luZ0JyYWNrZXRzOiAnYmVmb3JlV2hpdGVzcGFjZScsXG5cdFx0XHRcdGF1dG9DbG9zaW5nUXVvdGVzOiAnbmV2ZXInXG5cdFx0XHR9XG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXG5cdFx0XHRjb25zdCBhdXRvQ2xvc2VQb3NpdGlvbnMgPSBbXG5cdFx0XHRcdCd2YXJ8IGF8ID18IFt8XTt8Jyxcblx0XHRcdF07XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gYXV0b0Nsb3NlUG9zaXRpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBpICsgMTtcblx0XHRcdFx0Y29uc3QgYXV0b0Nsb3NlQ29sdW1ucyA9IGV4dHJhY3RBdXRvQ2xvc2luZ1NwZWNpYWxDb2x1bW5zKG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlciksIGF1dG9DbG9zZVBvc2l0aW9uc1tpXSk7XG5cblx0XHRcdFx0Zm9yIChsZXQgY29sdW1uID0gMTsgY29sdW1uIDwgYXV0b0Nsb3NlQ29sdW1ucy5sZW5ndGg7IGNvbHVtbisrKSB7XG5cdFx0XHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdGlmIChhdXRvQ2xvc2VDb2x1bW5zW2NvbHVtbl0gPT09IEF1dG9DbG9zaW5nQ29sdW1uVHlwZS5TcGVjaWFsMSkge1xuXHRcdFx0XHRcdFx0YXNzZXJ0VHlwZShlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwsIGxpbmVOdW1iZXIsIGNvbHVtbiwgJygnLCAnKCknLCBgYXV0byBjbG9zZXMgQCAoJHtsaW5lTnVtYmVyfSwgJHtjb2x1bW59KWApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhc3NlcnRUeXBlKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCwgbGluZU51bWJlciwgY29sdW1uLCAnKCcsICcoJywgYGRvZXMgbm90IGF1dG8gY2xvc2UgQCAoJHtsaW5lTnVtYmVyfSwgJHtjb2x1bW59KWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhc3NlcnRUeXBlKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCwgbGluZU51bWJlciwgY29sdW1uLCAnXFwnJywgJ1xcJycsIGBkb2VzIG5vdCBhdXRvIGNsb3NlIEAgKCR7bGluZU51bWJlcn0sICR7Y29sdW1ufSlgKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQndmFyIGIgPSBbXTsnLFxuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZCxcblx0XHRcdGVkaXRvck9wdHM6IHtcblx0XHRcdFx0YXV0b0Nsb3NpbmdCcmFja2V0czogJ25ldmVyJyxcblx0XHRcdFx0YXV0b0Nsb3NpbmdRdW90ZXM6ICdiZWZvcmVXaGl0ZXNwYWNlJ1xuXHRcdFx0fVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblxuXHRcdFx0Y29uc3QgYXV0b0Nsb3NlUG9zaXRpb25zID0gW1xuXHRcdFx0XHQndmFyIGIgPXwgW3xdO3wnLFxuXHRcdFx0XTtcblx0XHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBhdXRvQ2xvc2VQb3NpdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgbGluZU51bWJlciA9IGkgKyAxO1xuXHRcdFx0XHRjb25zdCBhdXRvQ2xvc2VDb2x1bW5zID0gZXh0cmFjdEF1dG9DbG9zaW5nU3BlY2lhbENvbHVtbnMobW9kZWwuZ2V0TGluZU1heENvbHVtbihsaW5lTnVtYmVyKSwgYXV0b0Nsb3NlUG9zaXRpb25zW2ldKTtcblxuXHRcdFx0XHRmb3IgKGxldCBjb2x1bW4gPSAxOyBjb2x1bW4gPCBhdXRvQ2xvc2VDb2x1bW5zLmxlbmd0aDsgY29sdW1uKyspIHtcblx0XHRcdFx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24obGluZU51bWJlcik7XG5cdFx0XHRcdFx0aWYgKGF1dG9DbG9zZUNvbHVtbnNbY29sdW1uXSA9PT0gQXV0b0Nsb3NpbmdDb2x1bW5UeXBlLlNwZWNpYWwxKSB7XG5cdFx0XHRcdFx0XHRhc3NlcnRUeXBlKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCwgbGluZU51bWJlciwgY29sdW1uLCAnXFwnJywgJ1xcJ1xcJycsIGBhdXRvIGNsb3NlcyBAICgke2xpbmVOdW1iZXJ9LCAke2NvbHVtbn0pYCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGFzc2VydFR5cGUoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsLCBsaW5lTnVtYmVyLCBjb2x1bW4sICdcXCcnLCAnXFwnJywgYGRvZXMgbm90IGF1dG8gY2xvc2UgQCAoJHtsaW5lTnVtYmVyfSwgJHtjb2x1bW59KWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhc3NlcnRUeXBlKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCwgbGluZU51bWJlciwgY29sdW1uLCAnKCcsICcoJywgYGRvZXMgbm90IGF1dG8gY2xvc2UgQCAoJHtsaW5lTnVtYmVyfSwgJHtjb2x1bW59KWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG9DbG9zaW5nUGFpcnMgLSBjb25maWd1cmFibGUgb3BlbiBwYXJlbnMnLCAoKSA9PiB7XG5cdFx0c2V0QXV0b0Nsb3NpbmdMYW5ndWFnZUVuYWJsZWRTZXQoJ2FiYycpO1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J3ZhciBhID0gW107Jyxcblx0XHRcdFx0J3ZhciBiID0gYGFzZGA7Jyxcblx0XHRcdFx0J3ZhciBjID0gXFwnYXNkXFwnOycsXG5cdFx0XHRcdCd2YXIgZCA9IFwiYXNkXCI7Jyxcblx0XHRcdFx0J3ZhciBlID0gLyozKi9cdDM7Jyxcblx0XHRcdFx0J3ZhciBmID0gLyoqIDMgKi8zOycsXG5cdFx0XHRcdCd2YXIgZyA9ICgzKzUpOycsXG5cdFx0XHRcdCd2YXIgaCA9IHsgYTogXFwndmFsdWVcXCcgfTsnLFxuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZCxcblx0XHRcdGVkaXRvck9wdHM6IHtcblx0XHRcdFx0YXV0b0Nsb3NpbmdCcmFja2V0czogJ2xhbmd1YWdlRGVmaW5lZCdcblx0XHRcdH1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cblx0XHRcdGNvbnN0IGF1dG9DbG9zZVBvc2l0aW9ucyA9IFtcblx0XHRcdFx0J3Z8YXIgfGEgPSBbfF07fCcsXG5cdFx0XHRcdCd2fGFyIHxiID0gYHxhc2RgO3wnLFxuXHRcdFx0XHQndnxhciB8YyA9IFxcJ3xhc2RcXCc7fCcsXG5cdFx0XHRcdCd2fGFyIGQgPSBcInxhc2RcIjt8Jyxcblx0XHRcdFx0J3Z8YXIgZSA9IC8qMyovXHQzO3wnLFxuXHRcdFx0XHQndnxhciBmID0gLyoqIDN8ICovMzt8Jyxcblx0XHRcdFx0J3Z8YXIgZyA9ICgzKzV8KTt8Jyxcblx0XHRcdFx0J3Z8YXIgaCA9IHsgfGE6IFxcJ3Z8YWx1ZVxcJyB8fTt8Jyxcblx0XHRcdF07XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gYXV0b0Nsb3NlUG9zaXRpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBpICsgMTtcblx0XHRcdFx0Y29uc3QgYXV0b0Nsb3NlQ29sdW1ucyA9IGV4dHJhY3RBdXRvQ2xvc2luZ1NwZWNpYWxDb2x1bW5zKG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlciksIGF1dG9DbG9zZVBvc2l0aW9uc1tpXSk7XG5cblx0XHRcdFx0Zm9yIChsZXQgY29sdW1uID0gMTsgY29sdW1uIDwgYXV0b0Nsb3NlQ29sdW1ucy5sZW5ndGg7IGNvbHVtbisrKSB7XG5cdFx0XHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdGlmIChhdXRvQ2xvc2VDb2x1bW5zW2NvbHVtbl0gPT09IEF1dG9DbG9zaW5nQ29sdW1uVHlwZS5TcGVjaWFsMSkge1xuXHRcdFx0XHRcdFx0YXNzZXJ0VHlwZShlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwsIGxpbmVOdW1iZXIsIGNvbHVtbiwgJygnLCAnKCknLCBgYXV0byBjbG9zZXMgQCAoJHtsaW5lTnVtYmVyfSwgJHtjb2x1bW59KWApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhc3NlcnRUeXBlKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCwgbGluZU51bWJlciwgY29sdW1uLCAnKCcsICcoJywgYGRvZXMgbm90IGF1dG8gY2xvc2UgQCAoJHtsaW5lTnVtYmVyfSwgJHtjb2x1bW59KWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvQ2xvc2luZ1BhaXJzIC0gYXV0by1wYWlyaW5nIGNhbiBiZSBkaXNhYmxlZCcsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCd2YXIgYSA9IFtdOycsXG5cdFx0XHRcdCd2YXIgYiA9IGBhc2RgOycsXG5cdFx0XHRcdCd2YXIgYyA9IFxcJ2FzZFxcJzsnLFxuXHRcdFx0XHQndmFyIGQgPSBcImFzZFwiOycsXG5cdFx0XHRcdCd2YXIgZSA9IC8qMyovXHQzOycsXG5cdFx0XHRcdCd2YXIgZiA9IC8qKiAzICovMzsnLFxuXHRcdFx0XHQndmFyIGcgPSAoMys1KTsnLFxuXHRcdFx0XHQndmFyIGggPSB7IGE6IFxcJ3ZhbHVlXFwnIH07Jyxcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBhdXRvQ2xvc2luZ0xhbmd1YWdlSWQsXG5cdFx0XHRlZGl0b3JPcHRzOiB7XG5cdFx0XHRcdGF1dG9DbG9zaW5nQnJhY2tldHM6ICduZXZlcicsXG5cdFx0XHRcdGF1dG9DbG9zaW5nUXVvdGVzOiAnbmV2ZXInXG5cdFx0XHR9XG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXG5cdFx0XHRjb25zdCBhdXRvQ2xvc2VQb3NpdGlvbnMgPSBbXG5cdFx0XHRcdCd2YXIgYSA9IFtdOycsXG5cdFx0XHRcdCd2YXIgYiA9IGBhc2RgOycsXG5cdFx0XHRcdCd2YXIgYyA9IFxcJ2FzZFxcJzsnLFxuXHRcdFx0XHQndmFyIGQgPSBcImFzZFwiOycsXG5cdFx0XHRcdCd2YXIgZSA9IC8qMyovXHQzOycsXG5cdFx0XHRcdCd2YXIgZiA9IC8qKiAzICovMzsnLFxuXHRcdFx0XHQndmFyIGcgPSAoMys1KTsnLFxuXHRcdFx0XHQndmFyIGggPSB7IGE6IFxcJ3ZhbHVlXFwnIH07Jyxcblx0XHRcdF07XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gYXV0b0Nsb3NlUG9zaXRpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBpICsgMTtcblx0XHRcdFx0Y29uc3QgYXV0b0Nsb3NlQ29sdW1ucyA9IGV4dHJhY3RBdXRvQ2xvc2luZ1NwZWNpYWxDb2x1bW5zKG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlciksIGF1dG9DbG9zZVBvc2l0aW9uc1tpXSk7XG5cblx0XHRcdFx0Zm9yIChsZXQgY29sdW1uID0gMTsgY29sdW1uIDwgYXV0b0Nsb3NlQ29sdW1ucy5sZW5ndGg7IGNvbHVtbisrKSB7XG5cdFx0XHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdGlmIChhdXRvQ2xvc2VDb2x1bW5zW2NvbHVtbl0gPT09IEF1dG9DbG9zaW5nQ29sdW1uVHlwZS5TcGVjaWFsMSkge1xuXHRcdFx0XHRcdFx0YXNzZXJ0VHlwZShlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwsIGxpbmVOdW1iZXIsIGNvbHVtbiwgJygnLCAnKCknLCBgYXV0byBjbG9zZXMgQCAoJHtsaW5lTnVtYmVyfSwgJHtjb2x1bW59KWApO1xuXHRcdFx0XHRcdFx0YXNzZXJ0VHlwZShlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwsIGxpbmVOdW1iZXIsIGNvbHVtbiwgJ1wiJywgJ1wiXCInLCBgYXV0byBjbG9zZXMgQCAoJHtsaW5lTnVtYmVyfSwgJHtjb2x1bW59KWApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhc3NlcnRUeXBlKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCwgbGluZU51bWJlciwgY29sdW1uLCAnKCcsICcoJywgYGRvZXMgbm90IGF1dG8gY2xvc2UgQCAoJHtsaW5lTnVtYmVyfSwgJHtjb2x1bW59KWApO1xuXHRcdFx0XHRcdFx0YXNzZXJ0VHlwZShlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwsIGxpbmVOdW1iZXIsIGNvbHVtbiwgJ1wiJywgJ1wiJywgYGRvZXMgbm90IGF1dG8gY2xvc2UgQCAoJHtsaW5lTnVtYmVyfSwgJHtjb2x1bW59KWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvQ2xvc2luZ1BhaXJzIC0gYXV0byB3cmFwcGluZyBpcyBjb25maWd1cmFibGUnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQndmFyIGEgPSBhc2QnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCA0KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCA5LCAxLCAxMiksXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gdHlwZSBhIGBcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdgJywgJ2tleWJvYXJkJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnYHZhcmAgYSA9IGBhc2RgJyk7XG5cblx0XHRcdC8vIHR5cGUgYSAoXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnKCcsICdrZXlib2FyZCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ2AodmFyKWAgYSA9IGAoYXNkKWAnKTtcblx0XHR9KTtcblxuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J3ZhciBhID0gYXNkJ1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZCxcblx0XHRcdGVkaXRvck9wdHM6IHtcblx0XHRcdFx0YXV0b1N1cnJvdW5kOiAnbmV2ZXInXG5cdFx0XHR9XG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAxLCA0KSxcblx0XHRcdF0pO1xuXG5cdFx0XHQvLyB0eXBlIGEgYFxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2AnLCAna2V5Ym9hcmQnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdgIGEgPSBhc2QnKTtcblx0XHR9KTtcblxuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J3ZhciBhID0gYXNkJ1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZCxcblx0XHRcdGVkaXRvck9wdHM6IHtcblx0XHRcdFx0YXV0b1N1cnJvdW5kOiAncXVvdGVzJ1xuXHRcdFx0fVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblxuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgNCksXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gdHlwZSBhIGBcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdgJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ2B2YXJgIGEgPSBhc2QnKTtcblxuXHRcdFx0Ly8gdHlwZSBhIChcblx0XHRcdHZpZXdNb2RlbC50eXBlKCcoJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ2AoYCBhID0gYXNkJyk7XG5cdFx0fSk7XG5cblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCd2YXIgYSA9IGFzZCdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBhdXRvQ2xvc2luZ0xhbmd1YWdlSWQsXG5cdFx0XHRlZGl0b3JPcHRzOiB7XG5cdFx0XHRcdGF1dG9TdXJyb3VuZDogJ2JyYWNrZXRzJ1xuXHRcdFx0fVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblxuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgNCksXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gdHlwZSBhIChcblx0XHRcdHZpZXdNb2RlbC50eXBlKCcoJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJyh2YXIpIGEgPSBhc2QnKTtcblxuXHRcdFx0Ly8gdHlwZSBhIGBcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdgJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJyhgKSBhID0gYXNkJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG9DbG9zaW5nUGFpcnMgLSBxdW90ZScsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCd2YXIgYSA9IFtdOycsXG5cdFx0XHRcdCd2YXIgYiA9IGBhc2RgOycsXG5cdFx0XHRcdCd2YXIgYyA9IFxcJ2FzZFxcJzsnLFxuXHRcdFx0XHQndmFyIGQgPSBcImFzZFwiOycsXG5cdFx0XHRcdCd2YXIgZSA9IC8qMyovXHQzOycsXG5cdFx0XHRcdCd2YXIgZiA9IC8qKiAzICovMzsnLFxuXHRcdFx0XHQndmFyIGcgPSAoMys1KTsnLFxuXHRcdFx0XHQndmFyIGggPSB7IGE6IFxcJ3ZhbHVlXFwnIH07Jyxcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBhdXRvQ2xvc2luZ0xhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cblx0XHRcdGNvbnN0IGF1dG9DbG9zZVBvc2l0aW9ucyA9IFtcblx0XHRcdFx0J3ZhciBhIHw9fCBbfF18O3wnLFxuXHRcdFx0XHQndmFyIGIgfD18IGBhc2RgfDt8Jyxcblx0XHRcdFx0J3ZhciBjIHw9fCBcXCdhc2RcXCd8O3wnLFxuXHRcdFx0XHQndmFyIGQgfD18IFwiYXNkXCJ8O3wnLFxuXHRcdFx0XHQndmFyIGUgfD18IC8qMyovfFx0Mzt8Jyxcblx0XHRcdFx0J3ZhciBmIHw9fCAvKip8IDMgKi8zO3wnLFxuXHRcdFx0XHQndmFyIGcgfD18ICgzKzUpfDt8Jyxcblx0XHRcdFx0J3ZhciBoIHw9fCB7fCBhOnwgXFwndmFsdWVcXCd8IHx9fDt8Jyxcblx0XHRcdF07XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gYXV0b0Nsb3NlUG9zaXRpb25zLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBpICsgMTtcblx0XHRcdFx0Y29uc3QgYXV0b0Nsb3NlQ29sdW1ucyA9IGV4dHJhY3RBdXRvQ2xvc2luZ1NwZWNpYWxDb2x1bW5zKG1vZGVsLmdldExpbmVNYXhDb2x1bW4obGluZU51bWJlciksIGF1dG9DbG9zZVBvc2l0aW9uc1tpXSk7XG5cblx0XHRcdFx0Zm9yIChsZXQgY29sdW1uID0gMTsgY29sdW1uIDwgYXV0b0Nsb3NlQ29sdW1ucy5sZW5ndGg7IGNvbHVtbisrKSB7XG5cdFx0XHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdGlmIChhdXRvQ2xvc2VDb2x1bW5zW2NvbHVtbl0gPT09IEF1dG9DbG9zaW5nQ29sdW1uVHlwZS5TcGVjaWFsMSkge1xuXHRcdFx0XHRcdFx0YXNzZXJ0VHlwZShlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwsIGxpbmVOdW1iZXIsIGNvbHVtbiwgJ1xcJycsICdcXCdcXCcnLCBgYXV0byBjbG9zZXMgQCAoJHtsaW5lTnVtYmVyfSwgJHtjb2x1bW59KWApO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoYXV0b0Nsb3NlQ29sdW1uc1tjb2x1bW5dID09PSBBdXRvQ2xvc2luZ0NvbHVtblR5cGUuU3BlY2lhbDIpIHtcblx0XHRcdFx0XHRcdGFzc2VydFR5cGUoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsLCBsaW5lTnVtYmVyLCBjb2x1bW4sICdcXCcnLCAnJywgYG92ZXIgdHlwZXMgQCAoJHtsaW5lTnVtYmVyfSwgJHtjb2x1bW59KWApO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhc3NlcnRUeXBlKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCwgbGluZU51bWJlciwgY29sdW1uLCAnXFwnJywgJ1xcJycsIGBkb2VzIG5vdCBhdXRvIGNsb3NlIEAgKCR7bGluZU51bWJlcn0sICR7Y29sdW1ufSlgKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYXV0b0Nsb3NpbmdQYWlycyAtIG11bHRpLWNoYXJhY3RlciBhdXRvY2xvc2UnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnJyxcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBhdXRvQ2xvc2luZ0xhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cblx0XHRcdG1vZGVsLnNldFZhbHVlKCdiZWdpJyk7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDUpXSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnbicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnYmVnaW5lbmQnKTtcblxuXHRcdFx0bW9kZWwuc2V0VmFsdWUoJy8qJyk7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpXSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnKicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnLyoqICovJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG9DbG9zaW5nUGFpcnMgLSBkb2MgY29tbWVudHMgY2FuIGJlIHR1cm5lZCBvZmYnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnJyxcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBhdXRvQ2xvc2luZ0xhbmd1YWdlSWQsXG5cdFx0XHRlZGl0b3JPcHRzOiB7XG5cdFx0XHRcdGF1dG9DbG9zaW5nQ29tbWVudHM6ICduZXZlcidcblx0XHRcdH1cblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cblx0XHRcdG1vZGVsLnNldFZhbHVlKCcvKicpO1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKV0pO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJyonLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJy8qKicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNzIxNzc6IG11bHRpLWNoYXJhY3RlciBhdXRvY2xvc2Ugd2l0aCBjb25mbGljdGluZyBwYXR0ZXJucycsICgpID0+IHtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gJ2F1dG9DbG9zaW5nTW9kZU11bHRpQ2hhcic7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQobGFuZ3VhZ2VTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogbGFuZ3VhZ2VJZCB9KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UucmVnaXN0ZXIobGFuZ3VhZ2VJZCwge1xuXHRcdFx0YXV0b0Nsb3NpbmdQYWlyczogW1xuXHRcdFx0XHR7IG9wZW46ICcoJywgY2xvc2U6ICcpJyB9LFxuXHRcdFx0XHR7IG9wZW46ICcoKicsIGNsb3NlOiAnKiknIH0sXG5cdFx0XHRcdHsgb3BlbjogJzxAJywgY2xvc2U6ICdAPicgfSxcblx0XHRcdFx0eyBvcGVuOiAnPEBAJywgY2xvc2U6ICdAQD4nIH0sXG5cdFx0XHRdLFxuXHRcdH0pKTtcblxuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0JycsXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogbGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCcoJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICcoKScpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJyonLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJygqKiknLCBgZG9lc24ndCBhZGQgZW50aXJlIGNsb3NlIHdoZW4gYWxyZWFkeSBjbG9zZWQgc3Vic3RyaW5nIGlzIHRoZXJlYCk7XG5cblx0XHRcdG1vZGVsLnNldFZhbHVlKCcoJyk7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDIsIDEsIDIpXSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnKicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnKCoqKScsIGBkb2VzIGFkZCBlbnRpcmUgY2xvc2UgaWYgbm90IGFscmVhZHkgdGhlcmVgKTtcblxuXHRcdFx0bW9kZWwuc2V0VmFsdWUoJycpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJzxAJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICc8QEA+Jyk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnQCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnPEBAQEA+JywgYGF1dG9jbG9zZXMgd2hlbiBiZWZvcmUgbXVsdGktY2hhcmFjdGVyIGNsb3NpbmcgYnJhY2VgKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCcoJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICc8QEAoKUBAPicsIGBhdXRvY2xvc2VzIHdoZW4gYmVmb3JlIG11bHRpLWNoYXJhY3RlciBjbG9zaW5nIGJyYWNlYCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM1NTMxNDogRG8gbm90IGF1dG8tY2xvc2Ugd2hlbiBlbmRpbmcgd2l0aCBvcGVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxhbmd1YWdlSWQgPSAnbXlFbGVjdHJpY01vZGUnO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6IGxhbmd1YWdlSWQgfSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKGxhbmd1YWdlSWQsIHtcblx0XHRcdGF1dG9DbG9zaW5nUGFpcnM6IFtcblx0XHRcdFx0eyBvcGVuOiAneycsIGNsb3NlOiAnfScgfSxcblx0XHRcdFx0eyBvcGVuOiAnWycsIGNsb3NlOiAnXScgfSxcblx0XHRcdFx0eyBvcGVuOiAnKCcsIGNsb3NlOiAnKScgfSxcblx0XHRcdFx0eyBvcGVuOiAnXFwnJywgY2xvc2U6ICdcXCcnLCBub3RJbjogWydzdHJpbmcnLCAnY29tbWVudCddIH0sXG5cdFx0XHRcdHsgb3BlbjogJ1xcXCInLCBjbG9zZTogJ1xcXCInLCBub3RJbjogWydzdHJpbmcnXSB9LFxuXHRcdFx0XHR7IG9wZW46ICdCXFxcIicsIGNsb3NlOiAnXFxcIicsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcblx0XHRcdFx0eyBvcGVuOiAnYCcsIGNsb3NlOiAnYCcsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcblx0XHRcdFx0eyBvcGVuOiAnLyoqJywgY2xvc2U6ICcgKi8nLCBub3RJbjogWydzdHJpbmcnXSB9XG5cdFx0XHRdLFxuXHRcdH0pKTtcblxuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J2xpdHRsZSBnb2F0Jyxcblx0XHRcdFx0J2xpdHRsZSBMQU1CJyxcblx0XHRcdFx0J2xpdHRsZSBzaGVlcCcsXG5cdFx0XHRcdCdCaWcgTEFNQidcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBsYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKG1vZGVsLmdldExpbmVDb3VudCgpKTtcblx0XHRcdGFzc2VydFR5cGUoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsLCAxLCA0LCAnXCInLCAnXCInLCBgZG9lcyBub3QgZG91YmxlIHF1b3RlIHdoZW4gZW5kaW5nIHdpdGggb3BlbmApO1xuXHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKG1vZGVsLmdldExpbmVDb3VudCgpKTtcblx0XHRcdGFzc2VydFR5cGUoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsLCAyLCA0LCAnXCInLCAnXCInLCBgZG9lcyBub3QgZG91YmxlIHF1b3RlIHdoZW4gZW5kaW5nIHdpdGggb3BlbmApO1xuXHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKG1vZGVsLmdldExpbmVDb3VudCgpKTtcblx0XHRcdGFzc2VydFR5cGUoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsLCAzLCA0LCAnXCInLCAnXCInLCBgZG9lcyBub3QgZG91YmxlIHF1b3RlIHdoZW4gZW5kaW5nIHdpdGggb3BlbmApO1xuXHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKG1vZGVsLmdldExpbmVDb3VudCgpKTtcblx0XHRcdGFzc2VydFR5cGUoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsLCA0LCAyLCAnXCInLCAnXCInLCBgZG9lcyBub3QgZG91YmxlIHF1b3RlIHdoZW4gZW5kaW5nIHdpdGggb3BlbmApO1xuXHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKG1vZGVsLmdldExpbmVDb3VudCgpKTtcblx0XHRcdGFzc2VydFR5cGUoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsLCA0LCAzLCAnXCInLCAnXCInLCBgZG9lcyBub3QgZG91YmxlIHF1b3RlIHdoZW4gZW5kaW5nIHdpdGggb3BlbmApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjc5Mzc6IFRyeWluZyB0byBhZGQgYW4gaXRlbSB0byB0aGUgZnJvbnQgb2YgYSBsaXN0IGlzIGN1bWJlcnNvbWUnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQndmFyIGFyciA9IFtcImJcIiwgXCJjXCJdOydcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBhdXRvQ2xvc2luZ0xhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRhc3NlcnRUeXBlKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCwgMSwgMTIsICdcIicsICdcIicsIGBkb2VzIG5vdCBvdmVyIHR5cGUgYW5kIHdpbGwgbm90IGF1dG8gY2xvc2VgKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzI1NjU4IC0gRG8gbm90IGF1dG8tY2xvc2Ugc2luZ2xlL2RvdWJsZSBxdW90ZXMgYWZ0ZXIgd29yZCBjaGFyYWN0ZXJzJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0JycsXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXG5cdFx0XHRmdW5jdGlvbiB0eXBlQ2hhcmFjdGVycyh2aWV3TW9kZWw6IFZpZXdNb2RlbCwgY2hhcnM6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gY2hhcnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0XHR2aWV3TW9kZWwudHlwZShjaGFyc1tpXSwgJ2tleWJvYXJkJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gRmlyc3QgZ2lmXG5cdFx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24obW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdFx0dHlwZUNoYXJhY3RlcnModmlld01vZGVsLCAndGVzdGUxID0gdGVzdGVcXCcgb2snKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ3Rlc3RlMSA9IHRlc3RlXFwnIG9rJyk7XG5cblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgMTAwMCwgMSwgMTAwMCldKTtcblx0XHRcdHR5cGVDaGFyYWN0ZXJzKHZpZXdNb2RlbCwgJ1xcbicpO1xuXHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKG1vZGVsLmdldExpbmVDb3VudCgpKTtcblx0XHRcdHR5cGVDaGFyYWN0ZXJzKHZpZXdNb2RlbCwgJ3Rlc3RlMiA9IHRlc3RlIFxcJ29rJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICd0ZXN0ZTIgPSB0ZXN0ZSBcXCdva1xcJycpO1xuXG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDIsIDEwMDAsIDIsIDEwMDApXSk7XG5cdFx0XHR0eXBlQ2hhcmFjdGVycyh2aWV3TW9kZWwsICdcXG4nKTtcblx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0XHR0eXBlQ2hhcmFjdGVycyh2aWV3TW9kZWwsICd0ZXN0ZTMgPSB0ZXN0ZVwiIG9rJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICd0ZXN0ZTMgPSB0ZXN0ZVwiIG9rJyk7XG5cblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMywgMTAwMCwgMywgMTAwMCldKTtcblx0XHRcdHR5cGVDaGFyYWN0ZXJzKHZpZXdNb2RlbCwgJ1xcbicpO1xuXHRcdFx0bW9kZWwudG9rZW5pemF0aW9uLmZvcmNlVG9rZW5pemF0aW9uKG1vZGVsLmdldExpbmVDb3VudCgpKTtcblx0XHRcdHR5cGVDaGFyYWN0ZXJzKHZpZXdNb2RlbCwgJ3Rlc3RlNCA9IHRlc3RlIFwib2snKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJ3Rlc3RlNCA9IHRlc3RlIFwib2tcIicpO1xuXG5cdFx0XHQvLyBTZWNvbmQgZ2lmXG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDQsIDEwMDAsIDQsIDEwMDApXSk7XG5cdFx0XHR0eXBlQ2hhcmFjdGVycyh2aWV3TW9kZWwsICdcXG4nKTtcblx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0XHR0eXBlQ2hhcmFjdGVycyh2aWV3TW9kZWwsICd0ZXN0ZSBcXCcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg1KSwgJ3Rlc3RlIFxcJ1xcJycpO1xuXG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDUsIDEwMDAsIDUsIDEwMDApXSk7XG5cdFx0XHR0eXBlQ2hhcmFjdGVycyh2aWV3TW9kZWwsICdcXG4nKTtcblx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0XHR0eXBlQ2hhcmFjdGVycyh2aWV3TW9kZWwsICd0ZXN0ZSBcIicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDYpLCAndGVzdGUgXCJcIicpO1xuXG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDYsIDEwMDAsIDYsIDEwMDApXSk7XG5cdFx0XHR0eXBlQ2hhcmFjdGVycyh2aWV3TW9kZWwsICdcXG4nKTtcblx0XHRcdG1vZGVsLnRva2VuaXphdGlvbi5mb3JjZVRva2VuaXphdGlvbihtb2RlbC5nZXRMaW5lQ291bnQoKSk7XG5cdFx0XHR0eXBlQ2hhcmFjdGVycyh2aWV3TW9kZWwsICd0ZXN0ZVxcJycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDcpLCAndGVzdGVcXCcnKTtcblxuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbig3LCAxMDAwLCA3LCAxMDAwKV0pO1xuXHRcdFx0dHlwZUNoYXJhY3RlcnModmlld01vZGVsLCAnXFxuJyk7XG5cdFx0XHRtb2RlbC50b2tlbml6YXRpb24uZm9yY2VUb2tlbml6YXRpb24obW9kZWwuZ2V0TGluZUNvdW50KCkpO1xuXHRcdFx0dHlwZUNoYXJhY3RlcnModmlld01vZGVsLCAndGVzdGVcIicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDgpLCAndGVzdGVcIicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMzczMTUgLSBvdmVydHlwZXMgb25seSB0aG9zZSBjaGFyYWN0ZXJzIHRoYXQgaXQgaW5zZXJ0ZWQnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnJyxcblx0XHRcdFx0J3k9KCk7J1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCd4PSgnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ3g9KCknKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2FzZCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAneD0oYXNkKScpO1xuXG5cdFx0XHQvLyBvdmVydHlwZSFcblx0XHRcdHZpZXdNb2RlbC50eXBlKCcpJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICd4PShhc2QpJyk7XG5cblx0XHRcdC8vIGRvIG5vdCBvdmVydHlwZSFcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMiwgNCwgMiwgNCldKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCcpJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICd5PSgpKTsnKTtcblxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMzczMTUgLSBzdG9wcyBvdmVydHlwaW5nIG9uY2UgY3Vyc29yIGxlYXZlcyBhcmVhJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0JycsXG5cdFx0XHRcdCd5PSgpOydcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBhdXRvQ2xvc2luZ0xhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgneD0oJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICd4PSgpJyk7XG5cblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNSldKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCcpJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICd4PSgpKScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMzczMTUgLSBpdCBvdmVydHlwZXMgb25seSBvbmNlJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0JycsXG5cdFx0XHRcdCd5PSgpOydcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBhdXRvQ2xvc2luZ0xhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgneD0oJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICd4PSgpJyk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCcpJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICd4PSgpJyk7XG5cblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCldKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCcpJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICd4PSgpKScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMzczMTUgLSBpdCBjYW4gcmVtZW1iZXIgbXVsdGlwbGUgYXV0by1jbG9zZWQgaW5zdGFuY2VzJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0JycsXG5cdFx0XHRcdCd5PSgpOydcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBhdXRvQ2xvc2luZ0xhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgUG9zaXRpb24oMSwgMSkpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgneD0oJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICd4PSgpJyk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCcoJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICd4PSgoKSknKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJyknLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ3g9KCgpKScpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnKScsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAneD0oKCkpJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTgyNzAgLSBhdXRvIGNsb3NpbmcgZGVsZXRlcyBvbmx5IHRob3NlIGNoYXJhY3RlcnMgdGhhdCBpdCBpbnNlcnRlZCcsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQneT0oKTsnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ3g9KCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAneD0oKScpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnYXNkJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICd4PShhc2QpJyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ3g9KCknKTtcblxuXHRcdFx0Ly8gZGVsZXRlIGNsb3NpbmcgY2hhciFcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICd4PScpO1xuXG5cdFx0XHQvLyBkbyBub3QgZGVsZXRlIGNsb3NpbmcgY2hhciFcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMiwgNCwgMiwgNCldKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICd5PSk7Jyk7XG5cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzc4NTI3IC0gZG9lcyBub3QgY2xvc2UgcXVvdGUgb24gb2RkIGNvdW50JywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J3N0ZDo6Y291dCA8PCBcXCdcIlxcJyA8PCBlbnRyeU1hcCdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBhdXRvQ2xvc2luZ0xhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDI5LCAxLCAyOSldKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1snLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ3N0ZDo6Y291dCA8PCBcXCdcIlxcJyA8PCBlbnRyeU1hcFtdJyk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcIicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnc3RkOjpjb3V0IDw8IFxcJ1wiXFwnIDw8IGVudHJ5TWFwW1wiXCJdJyk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdhJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdzdGQ6OmNvdXQgPDwgXFwnXCJcXCcgPDwgZW50cnlNYXBbXCJhXCJdJyk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcIicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnc3RkOjpjb3V0IDw8IFxcJ1wiXFwnIDw8IGVudHJ5TWFwW1wiYVwiXScpO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXScsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnc3RkOjpjb3V0IDw8IFxcJ1wiXFwnIDw8IGVudHJ5TWFwW1wiYVwiXScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjODU5ODMgLSBlZGl0b3IuYXV0b0Nsb3NpbmdCcmFja2V0czogYmVmb3JlV2hpdGVzcGFjZSBpcyBpbmNvcnJlY3QgZm9yIFB5dGhvbicsICgpID0+IHtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gJ3B5dGhvbk1vZGUnO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6IGxhbmd1YWdlSWQgfSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKGxhbmd1YWdlSWQsIHtcblx0XHRcdGF1dG9DbG9zaW5nUGFpcnM6IFtcblx0XHRcdFx0eyBvcGVuOiAneycsIGNsb3NlOiAnfScgfSxcblx0XHRcdFx0eyBvcGVuOiAnWycsIGNsb3NlOiAnXScgfSxcblx0XHRcdFx0eyBvcGVuOiAnKCcsIGNsb3NlOiAnKScgfSxcblx0XHRcdFx0eyBvcGVuOiAnXFxcIicsIGNsb3NlOiAnXFxcIicsIG5vdEluOiBbJ3N0cmluZyddIH0sXG5cdFx0XHRcdHsgb3BlbjogJ3JcXFwiJywgY2xvc2U6ICdcXFwiJywgbm90SW46IFsnc3RyaW5nJywgJ2NvbW1lbnQnXSB9LFxuXHRcdFx0XHR7IG9wZW46ICdSXFxcIicsIGNsb3NlOiAnXFxcIicsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcblx0XHRcdFx0eyBvcGVuOiAndVxcXCInLCBjbG9zZTogJ1xcXCInLCBub3RJbjogWydzdHJpbmcnLCAnY29tbWVudCddIH0sXG5cdFx0XHRcdHsgb3BlbjogJ1VcXFwiJywgY2xvc2U6ICdcXFwiJywgbm90SW46IFsnc3RyaW5nJywgJ2NvbW1lbnQnXSB9LFxuXHRcdFx0XHR7IG9wZW46ICdmXFxcIicsIGNsb3NlOiAnXFxcIicsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcblx0XHRcdFx0eyBvcGVuOiAnRlxcXCInLCBjbG9zZTogJ1xcXCInLCBub3RJbjogWydzdHJpbmcnLCAnY29tbWVudCddIH0sXG5cdFx0XHRcdHsgb3BlbjogJ2JcXFwiJywgY2xvc2U6ICdcXFwiJywgbm90SW46IFsnc3RyaW5nJywgJ2NvbW1lbnQnXSB9LFxuXHRcdFx0XHR7IG9wZW46ICdCXFxcIicsIGNsb3NlOiAnXFxcIicsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcblx0XHRcdFx0eyBvcGVuOiAnXFwnJywgY2xvc2U6ICdcXCcnLCBub3RJbjogWydzdHJpbmcnLCAnY29tbWVudCddIH0sXG5cdFx0XHRcdHsgb3BlbjogJ3JcXCcnLCBjbG9zZTogJ1xcJycsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcblx0XHRcdFx0eyBvcGVuOiAnUlxcJycsIGNsb3NlOiAnXFwnJywgbm90SW46IFsnc3RyaW5nJywgJ2NvbW1lbnQnXSB9LFxuXHRcdFx0XHR7IG9wZW46ICd1XFwnJywgY2xvc2U6ICdcXCcnLCBub3RJbjogWydzdHJpbmcnLCAnY29tbWVudCddIH0sXG5cdFx0XHRcdHsgb3BlbjogJ1VcXCcnLCBjbG9zZTogJ1xcJycsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcblx0XHRcdFx0eyBvcGVuOiAnZlxcJycsIGNsb3NlOiAnXFwnJywgbm90SW46IFsnc3RyaW5nJywgJ2NvbW1lbnQnXSB9LFxuXHRcdFx0XHR7IG9wZW46ICdGXFwnJywgY2xvc2U6ICdcXCcnLCBub3RJbjogWydzdHJpbmcnLCAnY29tbWVudCddIH0sXG5cdFx0XHRcdHsgb3BlbjogJ2JcXCcnLCBjbG9zZTogJ1xcJycsIG5vdEluOiBbJ3N0cmluZycsICdjb21tZW50J10gfSxcblx0XHRcdFx0eyBvcGVuOiAnQlxcJycsIGNsb3NlOiAnXFwnJywgbm90SW46IFsnc3RyaW5nJywgJ2NvbW1lbnQnXSB9LFxuXHRcdFx0XHR7IG9wZW46ICdgJywgY2xvc2U6ICdgJywgbm90SW46IFsnc3RyaW5nJ10gfVxuXHRcdFx0XSxcblx0XHR9KSk7XG5cblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdmb29cXCdoZWxsb1xcJydcblx0XHRcdF0sXG5cdFx0XHRlZGl0b3JPcHRzOiB7XG5cdFx0XHRcdGF1dG9DbG9zaW5nQnJhY2tldHM6ICdiZWZvcmVXaGl0ZXNwYWNlJ1xuXHRcdFx0fSxcblx0XHRcdGxhbmd1YWdlSWQ6IGxhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRhc3NlcnRUeXBlKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCwgMSwgNCwgJygnLCAnKCcsIGBkb2VzIG5vdCBhdXRvIGNsb3NlIEAgKDEsIDQpYCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM3ODk3NSAtIFBhcmVudGhlc2VzIHN3YWxsb3dpbmcgZG9lcyBub3Qgd29yayB3aGVuIHBhcmVudGhlc2VzIGFyZSBpbnNlcnRlZCBieSBhdXRvY29tcGxldGUnLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnPGRpdiBpZCdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBhdXRvQ2xvc2luZ0xhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDgsIDEsIDgpXSk7XG5cblx0XHRcdHZpZXdNb2RlbC5leGVjdXRlRWRpdHMoJ3NuaXBwZXQnLCBbeyByYW5nZTogbmV3IFJhbmdlKDEsIDYsIDEsIDgpLCB0ZXh0OiAnaWQ9XCJcIicgfV0sICgpID0+IFtuZXcgU2VsZWN0aW9uKDEsIDEwLCAxLCAxMCldLCBFZGl0U291cmNlcy51bmtub3duKHt9KSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICc8ZGl2IGlkPVwiXCInKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2EnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJzxkaXYgaWQ9XCJhXCInKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1wiJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICc8ZGl2IGlkPVwiYVwiJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM3ODgzMyAtIEFkZCBjb25maWcgdG8gdXNlIG9sZCBicmFja2V0cy9xdW90ZXMgb3ZlcnR5cGluZycsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQneT0oKTsnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkLFxuXHRcdFx0ZWRpdG9yT3B0czoge1xuXHRcdFx0XHRhdXRvQ2xvc2luZ092ZXJ0eXBlOiAnYWx3YXlzJ1xuXHRcdFx0fVxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCd4PSgnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ3g9KCknKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJyknLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ3g9KCknKTtcblxuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCA0LCAxLCA0KV0pO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJyknLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ3g9KCknKTtcblxuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigyLCA0LCAyLCA0KV0pO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJyknLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ3k9KCk7Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNTgyNTogYWNjZW50cyBvbiBtYWMgVVMgaW50bCBrZXlib2FyZCcsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblxuXHRcdFx0Ly8gVHlwaW5nIGAgKyBlIG9uIHRoZSBtYWMgVVMgaW50bCBrYiBsYXlvdXRcblx0XHRcdHZpZXdNb2RlbC5zdGFydENvbXBvc2l0aW9uKCk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnYCcsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZSgnXHUwMEU4JywgMSwgMCwgMCwgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwuZW5kQ29tcG9zaXRpb24oJ2tleWJvYXJkJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnXHUwMEU4Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM5MDAxNjogYWxsb3cgYWNjZW50cyBvbiBtYWMgVVMgaW50bCBrZXlib2FyZCB0byBzdXJyb3VuZCBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQndGVzdCdcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBhdXRvQ2xvc2luZ0xhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDUpXSk7XG5cblx0XHRcdC8vIFR5cGluZyBgICsgZSBvbiB0aGUgbWFjIFVTIGludGwga2IgbGF5b3V0XG5cdFx0XHR2aWV3TW9kZWwuc3RhcnRDb21wb3NpdGlvbigpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcJycsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZSgnXFwnJywgMSwgMCwgMCwgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwuY29tcG9zaXRpb25UeXBlKCdcXCcnLCAxLCAwLCAwLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC5lbmRDb21wb3NpdGlvbigna2V5Ym9hcmQnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdcXCd0ZXN0XFwnJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM1MzM1NzogT3ZlciB0eXBpbmcgaWdub3JlcyBjaGFyYWN0ZXJzIGFmdGVyIGJhY2tzbGFzaCcsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdjb25zb2xlLmxvZygpOydcblx0XHRcdF0sXG5cdFx0XHRsYW5ndWFnZUlkOiBhdXRvQ2xvc2luZ0xhbmd1YWdlSWRcblx0XHR9LCAoZWRpdG9yLCBtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgMTMsIDEsIDEzKV0pO1xuXG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFwnJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ2NvbnNvbGUubG9nKFxcJ1xcJyk7Jyk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdpdCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdjb25zb2xlLmxvZyhcXCdpdFxcJyk7Jyk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXFxcJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ2NvbnNvbGUubG9nKFxcJ2l0XFxcXFxcJyk7Jyk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXCcnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnY29uc29sZS5sb2coXFwnaXRcXFxcXFwnXFwnKTsnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzg0OTk4OiBPdmVydHlwaW5nIEJyYWNrZXRzIGRvZXNuXFwndCB3b3JrIGFmdGVyIGJhY2tzbGFzaCcsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCcnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpXSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXFxcJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ1xcXFwnKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJygnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnXFxcXCgpJyk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdhYmMnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnXFxcXChhYmMpJyk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXFxcJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ1xcXFwoYWJjXFxcXCknKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJyknLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnXFxcXChhYmNcXFxcKScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjc3MzogQWNjZW50cyAoXHUwMEI0YFx1MDBBOF4sIG90aGVycz8pIGFyZSBpbnNlcnRlZCBpbiB0aGUgd3JvbmcgcG9zaXRpb24gKE1hYyknLCAoKSA9PiB7XG5cdFx0dXNpbmdDdXJzb3Ioe1xuXHRcdFx0dGV4dDogW1xuXHRcdFx0XHQnaGVsbG8nLFxuXHRcdFx0XHQnd29ybGQnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblxuXHRcdFx0Ly8gVHlwaW5nIGAgYW5kIHByZXNzaW5nIHNoaWZ0K2Rvd24gb24gdGhlIG1hYyBVUyBpbnRsIGtiIGxheW91dFxuXHRcdFx0Ly8gSGVyZSB3ZSdyZSBqdXN0IHJlcGxheWluZyB3aGF0IHRoZSBjdXJzb3IgZ2V0c1xuXHRcdFx0dmlld01vZGVsLnN0YXJ0Q29tcG9zaXRpb24oKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdgJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRtb3ZlRG93bihlZGl0b3IsIHZpZXdNb2RlbCwgdHJ1ZSk7XG5cdFx0XHR2aWV3TW9kZWwuY29tcG9zaXRpb25UeXBlKCdgJywgMSwgMCwgMCwgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwuY29tcG9zaXRpb25UeXBlKCdgJywgMSwgMCwgMCwgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwuZW5kQ29tcG9zaXRpb24oJ2tleWJvYXJkJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnYGhlbGxvXFxud29ybGQnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMiwgMiwgMikpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMjY4MjA6IGF1dG8gY2xvc2UgcXVvdGVzIHdoZW4gbm90IHVzZWQgYXMgYWNjZW50cycsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCcnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblxuXHRcdFx0Ly8gb24gdGhlIG1hYyBVUyBpbnRsIGtiIGxheW91dFxuXG5cdFx0XHQvLyBUeXBpbmcgJyArIHNwYWNlXG5cdFx0XHR2aWV3TW9kZWwuc3RhcnRDb21wb3NpdGlvbigpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcJycsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZSgnXFwnJywgMSwgMCwgMCwgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwuZW5kQ29tcG9zaXRpb24oJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ1xcJ1xcJycpO1xuXG5cdFx0XHQvLyBUeXBpbmcgb25lIG1vcmUgJyArIHNwYWNlXG5cdFx0XHR2aWV3TW9kZWwuc3RhcnRDb21wb3NpdGlvbigpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcJycsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZSgnXFwnJywgMSwgMCwgMCwgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwuZW5kQ29tcG9zaXRpb24oJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ1xcJ1xcJycpO1xuXG5cdFx0XHQvLyBUeXBpbmcgJyBhcyBhIGNsb3NpbmcgdGFnXG5cdFx0XHRtb2RlbC5zZXRWYWx1ZSgnXFwnYWJjJyk7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDUpXSk7XG5cdFx0XHR2aWV3TW9kZWwuc3RhcnRDb21wb3NpdGlvbigpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcJycsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZSgnXFwnJywgMSwgMCwgMCwgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwuZW5kQ29tcG9zaXRpb24oJ2tleWJvYXJkJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnXFwnYWJjXFwnJyk7XG5cblx0XHRcdC8vIHF1b3RlcyBiZWZvcmUgdGhlIG5ld2x5IGFkZGVkIGNoYXJhY3RlciBhcmUgYWxsIHBhaXJlZC5cblx0XHRcdG1vZGVsLnNldFZhbHVlKCdcXCdhYmNcXCdkZWYgJyk7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDEwLCAxLCAxMCldKTtcblx0XHRcdHZpZXdNb2RlbC5zdGFydENvbXBvc2l0aW9uKCk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnXFwnJywgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwuY29tcG9zaXRpb25UeXBlKCdcXCcnLCAxLCAwLCAwLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC5lbmRDb21wb3NpdGlvbigna2V5Ym9hcmQnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICdcXCdhYmNcXCdkZWYgXFwnXFwnJyk7XG5cblx0XHRcdC8vIE5vIGF1dG8gY2xvc2luZyBpZiB0aGVyZSBpcyBub24td2hpdGVzcGFjZSBjaGFyYWN0ZXIgYWZ0ZXIgdGhlIGN1cnNvclxuXHRcdFx0bW9kZWwuc2V0VmFsdWUoJ2FiYycpO1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKV0pO1xuXHRcdFx0dmlld01vZGVsLnN0YXJ0Q29tcG9zaXRpb24oKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXCcnLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC5jb21wb3NpdGlvblR5cGUoJ1xcJycsIDEsIDAsIDAsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmVuZENvbXBvc2l0aW9uKCdrZXlib2FyZCcpO1xuXG5cdFx0XHQvLyBObyBhdXRvIGNsb3NpbmcgaWYgaXQncyBhZnRlciBhIHdvcmQuXG5cdFx0XHRtb2RlbC5zZXRWYWx1ZSgnYWJjJyk7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDQpXSk7XG5cdFx0XHR2aWV3TW9kZWwuc3RhcnRDb21wb3NpdGlvbigpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ1xcJycsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZSgnXFwnJywgMSwgMCwgMCwgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwuZW5kQ29tcG9zaXRpb24oJ2tleWJvYXJkJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnYWJjXFwnJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNDQ2OTA6IFF1b3RlcyBkbyBub3Qgb3ZlcnR5cGUgd2hlbiB1c2luZyBVUyBJbnRsIFBDIGtleWJvYXJkIGxheW91dCcsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCcnXG5cdFx0XHRdLFxuXHRcdFx0bGFuZ3VhZ2VJZDogYXV0b0Nsb3NpbmdMYW5ndWFnZUlkXG5cdFx0fSwgKGVkaXRvciwgbW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFBvc2l0aW9uKDEsIDEpKTtcblxuXHRcdFx0Ly8gUHJlc3NpbmcgJyArICcgKyA7XG5cblx0XHRcdHZpZXdNb2RlbC5zdGFydENvbXBvc2l0aW9uKCk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZShgJ2AsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZShgJ2AsIDEsIDAsIDAsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZShgJ2AsIDEsIDAsIDAsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmVuZENvbXBvc2l0aW9uKCdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLnN0YXJ0Q29tcG9zaXRpb24oKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKGAnYCwgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwuY29tcG9zaXRpb25UeXBlKGAnO2AsIDEsIDAsIDAsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZShgJztgLCAyLCAwLCAwLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC5lbmRDb21wb3NpdGlvbigna2V5Ym9hcmQnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIGAnJztgKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzE0NDY5MzogVHlwaW5nIGEgcXVvdGUgdXNpbmcgVVMgSW50bCBQQyBrZXlib2FyZCBsYXlvdXQgYWx3YXlzIHN1cnJvdW5kcyB3b3JkcycsICgpID0+IHtcblx0XHR1c2luZ0N1cnNvcih7XG5cdFx0XHR0ZXh0OiBbXG5cdFx0XHRcdCdjb25zdCBoZWxsbyA9IDM7J1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgNywgMSwgMTIpXSk7XG5cblx0XHRcdC8vIFByZXNzaW5nICcgKyBlXG5cblx0XHRcdHZpZXdNb2RlbC5zdGFydENvbXBvc2l0aW9uKCk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZShgJ2AsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZShgXHUwMEU5YCwgMSwgMCwgMCwgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwuY29tcG9zaXRpb25UeXBlKGBcdTAwRTlgLCAxLCAwLCAwLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC5lbmRDb21wb3NpdGlvbigna2V5Ym9hcmQnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksIGBjb25zdCBcdTAwRTkgPSAzO2ApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjODI3MDE6IGF1dG8gY2xvc2UgZG9lcyBub3QgZXhlY3V0ZSB3aGVuIElNRSBpcyBjYW5jZWxlZCB2aWEgYmFja3NwYWNlJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J3t9J1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgMiwgMSwgMildKTtcblxuXHRcdFx0Ly8gVHlwaW5nIGEgKyBiYWNrc3BhY2Vcblx0XHRcdHZpZXdNb2RlbC5zdGFydENvbXBvc2l0aW9uKCk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnYScsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLmNvbXBvc2l0aW9uVHlwZSgnJywgMSwgMCwgMCwgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwuZW5kQ29tcG9zaXRpb24oJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ3t9Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMyMDg5MTogQWxsIGN1cnNvcnMgc2hvdWxkIGRvIHRoZSBzYW1lIHRoaW5nJywgKCkgPT4ge1xuXHRcdHVzaW5nQ3Vyc29yKHtcblx0XHRcdHRleHQ6IFtcblx0XHRcdFx0J3ZhciBhID0gYXNkJ1xuXHRcdFx0XSxcblx0XHRcdGxhbmd1YWdlSWQ6IGF1dG9DbG9zaW5nTGFuZ3VhZ2VJZFxuXHRcdH0sIChlZGl0b3IsIG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblxuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgOSwgMSwgOSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMTIsIDEsIDEyKSxcblx0XHRcdF0pO1xuXG5cdFx0XHQvLyB0eXBlIGEgYFxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2AnLCAna2V5Ym9hcmQnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICd2YXIgYSA9IGBhc2RgJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM0MTgyNTogU3BlY2lhbCBoYW5kbGluZyBvZiBxdW90ZXMgaW4gc3Vycm91bmRpbmcgcGFpcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9ICdteU1vZGUnO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmd1YWdlU2VydmljZS5yZWdpc3Rlckxhbmd1YWdlKHsgaWQ6IGxhbmd1YWdlSWQgfSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLnJlZ2lzdGVyKGxhbmd1YWdlSWQsIHtcblx0XHRcdHN1cnJvdW5kaW5nUGFpcnM6IFtcblx0XHRcdFx0eyBvcGVuOiAnXCInLCBjbG9zZTogJ1wiJyB9LFxuXHRcdFx0XHR7IG9wZW46ICdcXCcnLCBjbG9zZTogJ1xcJycgfSxcblx0XHRcdF1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgndmFyIHggPSBcXCdoaVxcJzsnLCBsYW5ndWFnZUlkKTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDksIDEsIDEwKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxMiwgMSwgMTMpXG5cdFx0XHRdKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcIicsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAndmFyIHggPSBcImhpXCI7JywgJ2Fzc2VydDEnKTtcblxuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDksIDEsIDEwKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxMiwgMSwgMTMpXG5cdFx0XHRdKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdcXCcnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ3ZhciB4ID0gXFwnaGlcXCc7JywgJ2Fzc2VydDInKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQWxsIGN1cnNvcnMgc2hvdWxkIGRvIHRoZSBzYW1lIHRoaW5nIHdoZW4gZGVsZXRpbmcgbGVmdCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J3ZhciBhID0gKCknXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0YXV0b0Nsb3NpbmdMYW5ndWFnZUlkXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMTAsIDEsIDEwKSxcblx0XHRcdF0pO1xuXG5cdFx0XHQvLyBkZWxldGUgbGVmdFxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICd2YSBhID0gKScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNzEwMDogTW91c2Ugd29yZCBzZWxlY3Rpb24gaXMgc3RyYW5nZSB3aGVuIG5vbi13b3JkIGNoYXJhY3RlciBpcyBhdCB0aGUgZW5kIG9mIGxpbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdiZWZvcmUuYScsXG5cdFx0XHRcdCdiZWZvcmUnLFxuXHRcdFx0XHQnaGVsbG86Jyxcblx0XHRcdFx0J3RoZXJlOicsXG5cdFx0XHRcdCd0aGlzIGlzIHN0cmFuZ2U6Jyxcblx0XHRcdFx0J2hlcmUnLFxuXHRcdFx0XHQnaXQnLFxuXHRcdFx0XHQnaXMnLFxuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuV29yZFNlbGVjdCwge1xuXHRcdFx0XHRwb3NpdGlvbjogbmV3IFBvc2l0aW9uKDMsIDcpXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMywgNywgMywgNykpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLldvcmRTZWxlY3REcmFnLCB7XG5cdFx0XHRcdHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oNCwgNylcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigzLCA3LCA0LCA3KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMTIwMzk6IHNoaWZ0LWNvbnRpbnVpbmcgYSBkb3VibGUvdHJpcGxlLWNsaWNrIGFuZCBkcmFnIHNlbGVjdGlvbiBkb2VzIG5vdCByZW1lbWJlciBpdHMgc3RhcnRpbmcgbW9kZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J2p1c3Qgc29tZSB0ZXh0Jyxcblx0XHRcdFx0J2FuZCBhbm90aGVyIGxpbmUnLFxuXHRcdFx0XHQnYW5kIGFub3RoZXIgb25lJyxcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLldvcmRTZWxlY3QsIHtcblx0XHRcdFx0cG9zaXRpb246IG5ldyBQb3NpdGlvbigyLCA2KVxuXHRcdFx0fSk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLk1vdmVUb1NlbGVjdCwge1xuXHRcdFx0XHRwb3NpdGlvbjogbmV3IFBvc2l0aW9uKDEsIDgpLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDEyLCAxLCA2KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxNTgyMzY6IFNoaWZ0IGNsaWNrIHNlbGVjdGlvbiBkb2VzIG5vdCB3b3JrIG9uIGxpbmUgbnVtYmVyIGluZGljYXRvcicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J2p1c3Qgc29tZSB0ZXh0Jyxcblx0XHRcdFx0J2FuZCBhbm90aGVyIGxpbmUnLFxuXHRcdFx0XHQnYW5kIGFub3RoZXIgb25lJyxcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLk1vdmVUbywge1xuXHRcdFx0XHRwb3NpdGlvbjogbmV3IFBvc2l0aW9uKDMsIDUpXG5cdFx0XHR9KTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuTGluZVNlbGVjdERyYWcsIHtcblx0XHRcdFx0cG9zaXRpb246IG5ldyBQb3NpdGlvbigyLCAxKVxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDUsIDIsIDEpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzExMTUxMzogVGV4dCBnZXRzIGF1dG9tYXRpY2FsbHkgc2VsZWN0ZWQgd2hlbiB0eXBpbmcgYXQgdGhlIHNhbWUgbG9jYXRpb24gaW4gYW5vdGhlciBlZGl0b3InLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdqdXN0Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdzb21lIHRleHQnLFxuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yMSwgdmlld01vZGVsMSkgPT4ge1xuXHRcdFx0ZWRpdG9yMS5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCAxLCAyLCAxKVxuXHRcdFx0XSk7XG5cdFx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yMiwgdmlld01vZGVsMikgPT4ge1xuXHRcdFx0XHRlZGl0b3IyLnNldFNlbGVjdGlvbnMoW1xuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSlcblx0XHRcdFx0XSk7XG5cdFx0XHRcdHZpZXdNb2RlbDIudHlwZSgnZScsICdrZXlib2FyZCcpO1xuXHRcdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsMiwgbmV3IFBvc2l0aW9uKDIsIDIpKTtcblx0XHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbDEsIG5ldyBQb3NpdGlvbigyLCAyKSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1VuZG8gc3RvcHMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgndGhlcmUgaXMgYW4gdW5kbyBzdG9wIGJldHdlZW4gdHlwaW5nIGFuZCBkZWxldGluZyBsZWZ0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnQSAgbGluZScsXG5cdFx0XHRcdCdBbm90aGVyIGxpbmUnLFxuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgMywgMSwgMyldKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdmaXJzdCcsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnQSBmaXJzdCBsaW5lJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDgsIDEsIDgpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdBIGZpciBsaW5lJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDYsIDEsIDYpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ0EgZmlyc3QgbGluZScpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA4LCAxLCA4KSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdBICBsaW5lJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpKTtcblx0XHR9KTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndGhlcmUgaXMgYW4gdW5kbyBzdG9wIGJldHdlZW4gdHlwaW5nIGFuZCBkZWxldGluZyByaWdodCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J0EgIGxpbmUnLFxuXHRcdFx0XHQnQW5vdGhlciBsaW5lJyxcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpXSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnZmlyc3QnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ0EgZmlyc3QgbGluZScpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA4LCAxLCA4KSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlUmlnaHQsIG51bGwpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVSaWdodCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdBIGZpcnN0aW5lJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDgsIDEsIDgpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ0EgZmlyc3QgbGluZScpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA4LCAxLCA4KSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdBICBsaW5lJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpKTtcblx0XHR9KTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndGhlcmUgaXMgYW4gdW5kbyBzdG9wIGJldHdlZW4gZGVsZXRpbmcgbGVmdCBhbmQgdHlwaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnQSAgbGluZScsXG5cdFx0XHRcdCdBbm90aGVyIGxpbmUnLFxuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMiwgOCwgMiwgOCldKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcgbGluZScpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCAxLCAyLCAxKSk7XG5cblx0XHRcdHZpZXdNb2RlbC50eXBlKCdTZWNvbmQnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ1NlY29uZCBsaW5lJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDcsIDIsIDcpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJyBsaW5lJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDEpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ0Fub3RoZXIgbGluZScpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCA4LCAyLCA4KSk7XG5cdFx0fSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RoZXJlIGlzIGFuIHVuZG8gc3RvcCBiZXR3ZWVuIGRlbGV0aW5nIGxlZnQgYW5kIGRlbGV0aW5nIHJpZ2h0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnQSAgbGluZScsXG5cdFx0XHRcdCdBbm90aGVyIGxpbmUnLFxuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMiwgOCwgMiwgOCldKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcgbGluZScpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCAxLCAyLCAxKSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlUmlnaHQsIG51bGwpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVSaWdodCwgbnVsbCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZVJpZ2h0LCBudWxsKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlUmlnaHQsIG51bGwpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVSaWdodCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSkpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnIGxpbmUnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSkpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnQW5vdGhlciBsaW5lJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDgsIDIsIDgpKTtcblx0XHR9KTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgndGhlcmUgaXMgYW4gdW5kbyBzdG9wIGJldHdlZW4gZGVsZXRpbmcgcmlnaHQgYW5kIHR5cGluZycsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J0EgIGxpbmUnLFxuXHRcdFx0XHQnQW5vdGhlciBsaW5lJyxcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDIsIDksIDIsIDkpXSk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZVJpZ2h0LCBudWxsKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlUmlnaHQsIG51bGwpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVSaWdodCwgbnVsbCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZVJpZ2h0LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ0Fub3RoZXIgJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDksIDIsIDkpKTtcblxuXHRcdFx0dmlld01vZGVsLnR5cGUoJ3RleHQnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ0Fub3RoZXIgdGV4dCcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCAxMywgMiwgMTMpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ0Fub3RoZXIgJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDIsIDksIDIsIDkpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ0Fub3RoZXIgbGluZScpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCA5LCAyLCA5KSk7XG5cdFx0fSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RoZXJlIGlzIGFuIHVuZG8gc3RvcCBiZXR3ZWVuIGRlbGV0aW5nIHJpZ2h0IGFuZCBkZWxldGluZyBsZWZ0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnQSAgbGluZScsXG5cdFx0XHRcdCdBbm90aGVyIGxpbmUnLFxuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMiwgOSwgMiwgOSldKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlUmlnaHQsIG51bGwpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVSaWdodCwgbnVsbCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZVJpZ2h0LCBudWxsKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlUmlnaHQsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnQW5vdGhlciAnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgOSwgMiwgOSkpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLkRlbGV0ZUxlZnQsIG51bGwpO1xuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5EZWxldGVMZWZ0LCBudWxsKTtcblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuRGVsZXRlTGVmdCwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdBbicpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCAzLCAyLCAzKSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdBbm90aGVyICcpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigyLCA5LCAyLCA5KSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdBbm90aGVyIGxpbmUnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMiwgOSwgMiwgOSkpO1xuXHRcdH0pO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnRzIHVuZG8gc3RvcCB3aGVuIHR5cGluZyBzcGFjZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0J0EgIGxpbmUnLFxuXHRcdFx0XHQnQW5vdGhlciBsaW5lJyxcblx0XHRcdF0uam9pbignXFxuJylcblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpXSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnZmlyc3QgYW5kIGludGVyZXN0aW5nJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdBIGZpcnN0IGFuZCBpbnRlcmVzdGluZyBsaW5lJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDI0LCAxLCAyNCkpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnQSBmaXJzdCBhbmQgbGluZScpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCAxMiwgMSwgMTIpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ0EgZmlyc3QgbGluZScpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA4LCAxLCA4KSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdBICBsaW5lJyk7XG5cdFx0XHRhc3NlcnRDdXJzb3Iodmlld01vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpKTtcblx0XHR9KTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuIHVuZG8gdHlwaW5nIGFuZCBFT0wgY2hhbmdlIGluIG9uZSB1bmRvIHN0b3AnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdBICBsaW5lJyxcblx0XHRcdFx0J0Fub3RoZXIgbGluZScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKV0pO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2ZpcnN0JywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ0EgZmlyc3QgbGluZVxcbkFub3RoZXIgbGluZScpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA4LCAxLCA4KSk7XG5cblx0XHRcdG1vZGVsLnB1c2hFT0woRW5kT2ZMaW5lU2VxdWVuY2UuQ1JMRik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ0EgZmlyc3QgbGluZVxcclxcbkFub3RoZXIgbGluZScpO1xuXHRcdFx0YXNzZXJ0Q3Vyc29yKHZpZXdNb2RlbCwgbmV3IFNlbGVjdGlvbigxLCA4LCAxLCA4KSk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ0EgIGxpbmVcXG5Bbm90aGVyIGxpbmUnKTtcblx0XHRcdGFzc2VydEN1cnNvcih2aWV3TW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMywgMSwgMykpO1xuXHRcdH0pO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjOTM1ODU6IFVuZG8gbXVsdGkgY3Vyc29yIGVkaXQgY29ycnVwdHMgZG9jdW1lbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdCdoZWxsbyB3b3JsZCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNywgMiwgMTIpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDcsIDEsIDEyKSxcblx0XHRcdF0pO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ25vJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJ2hlbGxvIG5vXFxuaGVsbG8gbm8nKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAnaGVsbG8gd29ybGRcXG5oZWxsbyB3b3JsZCcpO1xuXHRcdH0pO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCd0aGVyZSBpcyBhIHNpbmdsZSB1bmRvIHN0b3AgZm9yIGNvbnNlY3V0aXZlIHdoaXRlc3BhY2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnJ1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHtcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnYScsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2InLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCcgJywgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnICcsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2MnLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdkJywgJ2tleWJvYXJkJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ2FiICBjZCcsICdhc3NlcnQxJyk7XG5cblx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuVW5kbywgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksICdhYiAgJywgJ2Fzc2VydDInKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJ2FiJywgJ2Fzc2VydDMnKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgJycsICdhc3NlcnQ0Jyk7XG5cdFx0fSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RoZXJlIGlzIG5vIHVuZG8gc3RvcCBhZnRlciBhIHNpbmdsZSB3aGl0ZXNwYWNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnJ1xuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHtcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnYScsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2InLCAna2V5Ym9hcmQnKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCcgJywgJ2tleWJvYXJkJyk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnYycsICdrZXlib2FyZCcpO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2QnLCAna2V5Ym9hcmQnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnYWIgY2QnLCAnYXNzZXJ0MScpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnYWInLCAnYXNzZXJ0MycpO1xuXG5cdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCAnJywgJ2Fzc2VydDQnKTtcblx0XHR9KTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ092ZXJ0eXBlIE1vZGUnLCAoKSA9PiB7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdElucHV0TW9kZS5zZXRJbnB1dE1vZGUoJ292ZXJ0eXBlJyk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRJbnB1dE1vZGUuc2V0SW5wdXRNb2RlKCdpbnNlcnQnKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc2ltcGxlIHR5cGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCcxMjM0NTY3ODknLFxuXHRcdFx0XHQnMTIzNDU2Nzg5Jyxcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7XG5cdFx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKV0pO1xuXHRcdFx0dmlld01vZGVsLnR5cGUoJ2EnLCAna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgW1xuXHRcdFx0XHQnMTJhNDU2Nzg5Jyxcblx0XHRcdFx0JzEyMzQ1Njc4OScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLCAnYXNzZXJ0MScpO1xuXG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDksIDEsIDkpXSk7XG5cdFx0XHR2aWV3TW9kZWwudHlwZSgnYmJiJywgJ2tleWJvYXJkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksIFtcblx0XHRcdFx0JzEyYTQ1Njc4YmJiJyxcblx0XHRcdFx0JzEyMzQ1Njc4OScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLCAnYXNzZXJ0MicpO1xuXHRcdH0pO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aS1saW5lIHNlbGVjdGlvbiB0eXBlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnMTIzNDU2Nzg5Jyxcblx0XHRcdFx0JzEyMzQ1Njc4OScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0e1xuXHRcdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgNSwgMiwgMyldKTtcblx0XHRcdHZpZXdNb2RlbC50eXBlKCdjYycsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCBbXG5cdFx0XHRcdCcxMjM0Y2M0NTY3ODknLFxuXHRcdFx0XS5qb2luKCdcXG4nKSwgJ2Fzc2VydDEnKTtcblx0XHR9KTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnc2ltcGxlIHBhc3RlJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnMTIzNDU2Nzg5Jyxcblx0XHRcdFx0JzEyMzQ1Njc4OScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0e1xuXHRcdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNSldKTtcblx0XHRcdHZpZXdNb2RlbC5wYXN0ZSgnY2MnLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksIFtcblx0XHRcdFx0JzEyMzRjYzc4OScsXG5cdFx0XHRcdCcxMjM0NTY3ODknLFxuXHRcdFx0XS5qb2luKCdcXG4nKSwgJ2Fzc2VydDEnKTtcblxuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KV0pO1xuXHRcdFx0dmlld01vZGVsLnBhc3RlKCdkZGRkZGRkZCcsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgW1xuXHRcdFx0XHQnMTIzNGRkZGRkZGRkJyxcblx0XHRcdFx0JzEyMzQ1Njc4OScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLCAnYXNzZXJ0MicpO1xuXHRcdH0pO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aS1saW5lIHNlbGVjdGlvbiBwYXN0ZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbChcblx0XHRcdFtcblx0XHRcdFx0JzEyMzQ1Njc4OScsXG5cdFx0XHRcdCcxMjM0NTY3ODknLFxuXHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHtcblx0XHRcdFx0aW5zZXJ0U3BhY2VzOiBmYWxzZSxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKG1vZGVsLCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuc2V0U2VsZWN0aW9ucygndGVzdCcsIFtuZXcgU2VsZWN0aW9uKDEsIDUsIDIsIDMpXSk7XG5cdFx0XHR2aWV3TW9kZWwucGFzdGUoJ2NjJywgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCBbXG5cdFx0XHRcdCcxMjM0Y2M0NTY3ODknLFxuXHRcdFx0XS5qb2luKCdcXG4nKSwgJ2Fzc2VydDEnKTtcblx0XHR9KTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncGFzdGUgbXVsdGktbGluZSB0ZXh0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnMTIzNDU2Nzg5Jyxcblx0XHRcdFx0JzEyMzQ1Njc4OScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0e1xuXHRcdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5zZXRTZWxlY3Rpb25zKCd0ZXN0JywgW25ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNSldKTtcblx0XHRcdHZpZXdNb2RlbC5wYXN0ZShbXG5cdFx0XHRcdCdhYWFhYWFhJyxcblx0XHRcdFx0J2JiYmJiYmInXG5cdFx0XHRdLmpvaW4oJ1xcbicpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoRW5kT2ZMaW5lUHJlZmVyZW5jZS5MRiksIFtcblx0XHRcdFx0JzEyMzRhYWFhYWFhJyxcblx0XHRcdFx0J2JiYmJiYmInLFxuXHRcdFx0XHQnMTIzNDU2Nzg5Jyxcblx0XHRcdF0uam9pbignXFxuJyksICdhc3NlcnQxJyk7XG5cdFx0fSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBvc2l0aW9uIHR5cGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCcxMjM0NTY3ODknLFxuXHRcdFx0XHQnMTIzNDU2Nzg5Jyxcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7XG5cdFx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLnNldFNlbGVjdGlvbnMoJ3Rlc3QnLCBbbmV3IFNlbGVjdGlvbigxLCA1LCAxLCA1KV0pO1xuXHRcdFx0dmlld01vZGVsLnN0YXJ0Q29tcG9zaXRpb24oKTtcblx0XHRcdHZpZXdNb2RlbC5jb21wb3NpdGlvblR5cGUoJ1x1MzBCQicsIDAsIDAsIDAsICdrZXlib2FyZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKEVuZE9mTGluZVByZWZlcmVuY2UuTEYpLCBbXG5cdFx0XHRcdCcxMjM0XHUzMEJCNTY3ODknLFxuXHRcdFx0XHQnMTIzNDU2Nzg5Jyxcblx0XHRcdF0uam9pbignXFxuJyksICdhc3NlcnQxJyk7XG5cblx0XHRcdHZpZXdNb2RlbC5lbmRDb21wb3NpdGlvbigna2V5Ym9hcmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZShFbmRPZkxpbmVQcmVmZXJlbmNlLkxGKSwgW1xuXHRcdFx0XHQnMTIzNFx1MzBCQjY3ODknLFxuXHRcdFx0XHQnMTIzNDU2Nzg5Jyxcblx0XHRcdF0uam9pbignXFxuJyksICdhc3NlcnQxJyk7XG5cdFx0fSk7XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxxQkFBcUIsOEJBQThCO0FBRTVELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQjtBQUcxQixTQUFTLGdCQUFnQix5QkFBeUI7QUFDbEQsU0FBUywyQkFBeUQsNEJBQTRCO0FBQzlGLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsb0JBQXFDO0FBQzlDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMscUJBQXFCLHlCQUFxQztBQUNuRSxTQUFTLGlCQUFpQjtBQUUxQixTQUFTLGtDQUFrQztBQUMzQyxTQUE4RCwwQkFBMEIsMkJBQTJCLDBCQUEwQjtBQUM3SSxTQUEyQyxpQkFBaUIsNEJBQTRCO0FBRXhGLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsbUJBQW1CO0FBSTVCLFNBQVMsT0FBTyxRQUF5QixXQUFzQixZQUFvQixRQUFnQixrQkFBMkIsT0FBTztBQUNwSSxNQUFJLGlCQUFpQjtBQUNwQiwyQkFBdUIsYUFBYSxxQkFBcUIsV0FBVztBQUFBLE1BQ25FLFVBQVUsSUFBSSxTQUFTLFlBQVksTUFBTTtBQUFBLElBQzFDLENBQUM7QUFBQSxFQUNGLE9BQU87QUFDTiwyQkFBdUIsT0FBTyxxQkFBcUIsV0FBVztBQUFBLE1BQzdELFVBQVUsSUFBSSxTQUFTLFlBQVksTUFBTTtBQUFBLElBQzFDLENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUFFQSxTQUFTLFNBQVMsUUFBeUIsV0FBc0Isa0JBQTJCLE9BQU87QUFDbEcsTUFBSSxpQkFBaUI7QUFDcEIsMkJBQXVCLGlCQUFpQixxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFBQSxFQUMzRSxPQUFPO0FBQ04sMkJBQXVCLFdBQVcscUJBQXFCLFdBQVcsQ0FBQyxDQUFDO0FBQUEsRUFDckU7QUFDRDtBQUVBLFNBQVMsVUFBVSxRQUF5QixXQUFzQixrQkFBMkIsT0FBTztBQUNuRyxNQUFJLGlCQUFpQjtBQUNwQiwyQkFBdUIsa0JBQWtCLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUFBLEVBQzVFLE9BQU87QUFDTiwyQkFBdUIsWUFBWSxxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFBQSxFQUN0RTtBQUNEO0FBRUEsU0FBUyxTQUFTLFFBQXlCLFdBQXNCLGtCQUEyQixPQUFPO0FBQ2xHLE1BQUksaUJBQWlCO0FBQ3BCLDJCQUF1QixpQkFBaUIscUJBQXFCLFdBQVcsQ0FBQyxDQUFDO0FBQUEsRUFDM0UsT0FBTztBQUNOLDJCQUF1QixXQUFXLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUFBLEVBQ3JFO0FBQ0Q7QUFFQSxTQUFTLE9BQU8sUUFBeUIsV0FBc0Isa0JBQTJCLE9BQU87QUFDaEcsTUFBSSxpQkFBaUI7QUFDcEIsMkJBQXVCLGVBQWUscUJBQXFCLFdBQVcsQ0FBQyxDQUFDO0FBQUEsRUFDekUsT0FBTztBQUNOLDJCQUF1QixTQUFTLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUFBLEVBQ25FO0FBQ0Q7QUFFQSxTQUFTLHNCQUFzQixRQUF5QixXQUFzQixrQkFBMkIsT0FBTztBQUMvRyxNQUFJLGlCQUFpQjtBQUNwQiwyQkFBdUIsaUJBQWlCLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUFBLEVBQzNFLE9BQU87QUFDTiwyQkFBdUIsV0FBVyxxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFBQSxFQUNyRTtBQUNEO0FBRUEsU0FBUyxnQkFBZ0IsUUFBeUIsV0FBc0Isa0JBQTJCLE9BQU87QUFDekcsTUFBSSxpQkFBaUI7QUFDcEIsMkJBQXVCLGdCQUFnQixxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFBQSxFQUMxRSxPQUFPO0FBQ04sMkJBQXVCLFVBQVUscUJBQXFCLFdBQVcsQ0FBQyxDQUFDO0FBQUEsRUFDcEU7QUFDRDtBQUVBLFNBQVMsd0JBQXdCLFFBQXlCLFdBQXNCLGtCQUEyQixPQUFPO0FBQ2pILE1BQUksaUJBQWlCO0FBQ3BCLDJCQUF1QixnQkFBZ0IscUJBQXFCLFdBQVcsQ0FBQyxDQUFDO0FBQUEsRUFDMUUsT0FBTztBQUNOLDJCQUF1QixVQUFVLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUFBLEVBQ3BFO0FBQ0Q7QUFFQSxTQUFTLGtCQUFrQixRQUF5QixXQUFzQixrQkFBMkIsT0FBTztBQUMzRyxNQUFJLGlCQUFpQjtBQUNwQiwyQkFBdUIsbUJBQW1CLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUFBLEVBQzdFLE9BQU87QUFDTiwyQkFBdUIsYUFBYSxxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFBQSxFQUN2RTtBQUNEO0FBRUEsU0FBUyxhQUFhLFdBQXNCLE1BQWdEO0FBQzNGLE1BQUk7QUFDSixNQUFJLGdCQUFnQixVQUFVO0FBQzdCLGlCQUFhLENBQUMsSUFBSSxVQUFVLEtBQUssWUFBWSxLQUFLLFFBQVEsS0FBSyxZQUFZLEtBQUssTUFBTSxDQUFDO0FBQUEsRUFDeEYsV0FBVyxnQkFBZ0IsV0FBVztBQUNyQyxpQkFBYSxDQUFDLElBQUk7QUFBQSxFQUNuQixPQUFPO0FBQ04saUJBQWE7QUFBQSxFQUNkO0FBQ0EsUUFBTSxTQUFTLFVBQVUsY0FBYyxFQUFFLElBQUksT0FBSyxFQUFFLFNBQVMsQ0FBQztBQUM5RCxRQUFNLFdBQVcsV0FBVyxJQUFJLE9BQUssRUFBRSxTQUFTLENBQUM7QUFFakQsU0FBTyxnQkFBZ0IsUUFBUSxRQUFRO0FBQ3hDO0FBRUEsTUFBTSw4QkFBOEIsTUFBTTtBQUN6QyxRQUFNLFFBQVE7QUFDZCxRQUFNLFFBQVE7QUFDZCxRQUFNLFFBQVE7QUFDZCxRQUFNLFFBQVE7QUFDZCxRQUFNLFFBQVE7QUFFZCxRQUFNLE9BQ0wsUUFBUSxTQUNSLFFBQVEsT0FDUixRQUFRLE9BQ1IsUUFBUSxTQUNSO0FBRUQsV0FBUyxRQUFRLFVBQXlFO0FBQ3pGLHVCQUFtQixNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsY0FBYztBQUNuRCxlQUFTLFFBQVEsU0FBUztBQUFBLElBQzNCLENBQUM7QUFBQSxFQUNGO0FBRUEsMENBQXdDO0FBRXhDLE9BQUssc0JBQXNCLE1BQU07QUFDaEMsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixtQkFBYSxXQUFXLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztBQUFBLElBQzNDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFJRCxPQUFLLFdBQVcsTUFBTTtBQUNyQixZQUFRLENBQUMsUUFBUSxjQUFjO0FBQzlCLGFBQU8sUUFBUSxXQUFXLEdBQUcsQ0FBQztBQUM5QixtQkFBYSxXQUFXLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztBQUFBLElBQzNDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLFFBQVEsTUFBTTtBQUNsQixZQUFRLENBQUMsUUFBUSxjQUFjO0FBQzlCLGFBQU8sUUFBUSxXQUFXLEdBQUcsQ0FBQztBQUM5QixtQkFBYSxXQUFXLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztBQUFBLElBQzNDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDBCQUEwQixNQUFNO0FBQ3BDLFlBQVEsQ0FBQyxRQUFRLGNBQWM7QUFDOUIsYUFBTyxRQUFRLFdBQVcsR0FBRyxHQUFHLElBQUk7QUFDcEMsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDbEQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssd0JBQXdCLE1BQU07QUFDbEMsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLEVBQUU7QUFDL0IsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxNQUFNLFNBQVMsQ0FBQyxDQUFDO0FBQUEsSUFDMUQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssbUJBQW1CLE1BQU07QUFDN0IsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLEVBQUU7QUFDL0IsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFBQSxJQUMzQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxzQkFBc0IsTUFBTTtBQUNoQyxZQUFRLENBQUMsUUFBUSxjQUFjO0FBQzlCLGFBQU8sUUFBUSxXQUFXLEdBQUcsRUFBRTtBQUMvQixtQkFBYSxXQUFXLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztBQUFBLElBQzNDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGtCQUFrQixNQUFNO0FBQzVCLFlBQVEsQ0FBQyxRQUFRLGNBQWM7QUFDOUIsYUFBTyxRQUFRLFdBQVcsR0FBRyxHQUFHLElBQUk7QUFDcEMsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDbEQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssd0JBQXdCLE1BQU07QUFDbEMsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLENBQUM7QUFDOUIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFFMUMsYUFBTyxRQUFRLFdBQVcsR0FBRyxJQUFJLElBQUk7QUFDckMsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDO0FBRWxELGFBQU8sUUFBUSxXQUFXLEdBQUcsR0FBRyxJQUFJO0FBQ3BDLG1CQUFhLFdBQVcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLElBQ2xELENBQUM7QUFBQSxFQUNGLENBQUM7QUFJRCxPQUFLLGtDQUFrQyxNQUFNO0FBQzVDLFlBQVEsQ0FBQyxRQUFRLGNBQWM7QUFDOUIsZUFBUyxRQUFRLFNBQVM7QUFDMUIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFBQSxJQUMzQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxhQUFhLE1BQU07QUFDdkIsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLENBQUM7QUFDOUIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDMUMsZUFBUyxRQUFRLFNBQVM7QUFDMUIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFBQSxJQUMzQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxpQ0FBaUMsTUFBTTtBQUMzQyxZQUFRLENBQUMsUUFBUSxjQUFjO0FBQzlCLGFBQU8sUUFBUSxXQUFXLEdBQUcsRUFBRTtBQUMvQixtQkFBYSxXQUFXLElBQUksU0FBUyxHQUFHLEVBQUUsQ0FBQztBQUMzQyxlQUFTLFFBQVEsU0FBUztBQUMxQixtQkFBYSxXQUFXLElBQUksU0FBUyxHQUFHLEVBQUUsQ0FBQztBQUFBLElBQzVDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGtDQUFrQyxNQUFNO0FBQzVDLFlBQVEsQ0FBQyxRQUFRLGNBQWM7QUFDOUIsYUFBTyxRQUFRLFdBQVcsR0FBRyxDQUFDO0FBQzlCLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQzFDLGVBQVMsUUFBUSxTQUFTO0FBQzFCLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsRUFBRSxDQUFDO0FBQUEsSUFDNUMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssdUJBQXVCLE1BQU07QUFDakMsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLENBQUM7QUFDOUIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDMUMsZUFBUyxRQUFRLFdBQVcsSUFBSTtBQUNoQyxtQkFBYSxXQUFXLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUM7QUFBQSxJQUNuRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBSUQsT0FBSyx1Q0FBdUMsTUFBTTtBQUNqRCxZQUFRLENBQUMsUUFBUSxjQUFjO0FBQzlCLGFBQU8sUUFBUSxXQUFXLEdBQUcsQ0FBQztBQUM5QixtQkFBYSxXQUFXLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztBQUMxQyxnQkFBVSxRQUFRLFNBQVM7QUFDM0IsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFBQSxJQUMzQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxjQUFjLE1BQU07QUFDeEIsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLENBQUM7QUFDOUIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDMUMsZ0JBQVUsUUFBUSxTQUFTO0FBQzNCLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDM0MsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssa0NBQWtDLE1BQU07QUFDNUMsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLEVBQUU7QUFDL0IsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxFQUFFLENBQUM7QUFDM0MsZ0JBQVUsUUFBUSxTQUFTO0FBQzNCLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsRUFBRSxDQUFDO0FBQUEsSUFDNUMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssK0JBQStCLE1BQU07QUFDekMsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLEVBQUU7QUFDL0IsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxFQUFFLENBQUM7QUFDM0MsZ0JBQVUsUUFBUSxTQUFTO0FBQzNCLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDM0MsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssd0JBQXdCLE1BQU07QUFDbEMsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLEVBQUU7QUFDL0IsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxFQUFFLENBQUM7QUFDM0MsZ0JBQVUsUUFBUSxXQUFXLElBQUk7QUFDakMsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDbkQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUlELE9BQUssYUFBYSxNQUFNO0FBQ3ZCLFlBQVEsQ0FBQyxRQUFRLGNBQWM7QUFDOUIsZUFBUyxRQUFRLFNBQVM7QUFDMUIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDMUMsZUFBUyxRQUFRLFNBQVM7QUFDMUIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDMUMsZUFBUyxRQUFRLFNBQVM7QUFDMUIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDMUMsZUFBUyxRQUFRLFNBQVM7QUFDMUIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDMUMsZUFBUyxRQUFRLFNBQVM7QUFDMUIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFBQSxJQUMzQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw0QkFBNEIsTUFBTTtBQUN0QyxZQUFRLENBQUMsUUFBUSxjQUFjO0FBQzlCLGVBQVMsUUFBUSxXQUFXLElBQUk7QUFDaEMsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQ2pELGVBQVMsUUFBUSxXQUFXLElBQUk7QUFDaEMsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQ2pELGVBQVMsUUFBUSxXQUFXLElBQUk7QUFDaEMsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQ2pELGVBQVMsUUFBUSxXQUFXLElBQUk7QUFDaEMsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQ2pELGVBQVMsUUFBUSxXQUFXLElBQUk7QUFDaEMsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDbEQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssdUJBQXVCLE1BQU07QUFDakMsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLENBQUM7QUFDOUIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDMUMsZUFBUyxRQUFRLFNBQVM7QUFDMUIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDMUMsZUFBUyxRQUFRLFNBQVM7QUFDMUIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDMUMsZUFBUyxRQUFRLFNBQVM7QUFDMUIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDMUMsZUFBUyxRQUFRLFNBQVM7QUFDMUIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFBQSxJQUMzQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBSUQsT0FBSyxXQUFXLE1BQU07QUFDckIsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLENBQUM7QUFDOUIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFFMUMsYUFBTyxRQUFRLFNBQVM7QUFDeEIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFFMUMsYUFBTyxRQUFRLFNBQVM7QUFDeEIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFBQSxJQUMzQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywwQkFBMEIsTUFBTTtBQUNwQyxZQUFRLENBQUMsUUFBUSxjQUFjO0FBQzlCLGFBQU8sUUFBUSxXQUFXLEdBQUcsQ0FBQztBQUM5QixtQkFBYSxXQUFXLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztBQUUxQyxhQUFPLFFBQVEsV0FBVyxJQUFJO0FBQzlCLG1CQUFhLFdBQVcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUVqRCxhQUFPLFFBQVEsV0FBVyxJQUFJO0FBQzlCLG1CQUFhLFdBQVcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLElBQ2xELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDhCQUE4QixNQUFNO0FBQ3hDLFlBQVEsQ0FBQyxRQUFRLGNBQWM7QUFDOUIsYUFBTyxRQUFRLFdBQVcsR0FBRyxDQUFDO0FBQzlCLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQzFDLGVBQVMsUUFBUSxTQUFTO0FBQzFCLGVBQVMsUUFBUSxTQUFTO0FBQzFCLGVBQVMsUUFBUSxTQUFTO0FBQzFCLGVBQVMsUUFBUSxTQUFTO0FBQzFCLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQzFDLGFBQU8sUUFBUSxTQUFTO0FBQ3hCLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQzFDLGFBQU8sUUFBUSxTQUFTO0FBQ3hCLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQzFDLGFBQU8sUUFBUSxTQUFTO0FBQ3hCLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQzFDLGFBQU8sUUFBUSxTQUFTO0FBQ3hCLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDM0MsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssK0RBQStELE1BQU07QUFDekUsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixzQkFBZ0IsUUFBUSxTQUFTO0FBQ2pDLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsTUFBTSxTQUFTLENBQUMsQ0FBQztBQUN6RCxzQkFBZ0IsUUFBUSxTQUFTO0FBQ2pDLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsTUFBTSxTQUFTLENBQUMsQ0FBQztBQUN6RCxlQUFTLFFBQVEsU0FBUztBQUMxQixtQkFBYSxXQUFXLElBQUksU0FBUyxHQUFHLE1BQU0sU0FBUyxDQUFDLENBQUM7QUFDekQsZUFBUyxRQUFRLFNBQVM7QUFDMUIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxNQUFNLFNBQVMsQ0FBQyxDQUFDO0FBQ3pELGVBQVMsUUFBUSxTQUFTO0FBQzFCLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsTUFBTSxTQUFTLENBQUMsQ0FBQztBQUN6RCxlQUFTLFFBQVEsU0FBUztBQUMxQixtQkFBYSxXQUFXLElBQUksU0FBUyxHQUFHLE1BQU0sU0FBUyxDQUFDLENBQUM7QUFDekQsYUFBTyxRQUFRLFNBQVM7QUFDeEIsYUFBTyxRQUFRLFNBQVM7QUFDeEIsYUFBTyxRQUFRLFNBQVM7QUFDeEIsYUFBTyxRQUFRLFNBQVM7QUFDeEIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxNQUFNLFNBQVMsQ0FBQyxDQUFDO0FBQUEsSUFDMUQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssdURBQXVELE1BQU07QUFDakUsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixnQkFBVSxjQUFjLFFBQVEsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFFM0QsYUFBTyxRQUFRLFNBQVM7QUFDeEIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDMUMsZUFBUyxRQUFRLFNBQVM7QUFDMUIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDMUMsYUFBTyxRQUFRLFNBQVM7QUFDeEIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFHMUMsYUFBTyxRQUFRLFNBQVM7QUFDeEIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDMUMsYUFBTyxRQUFRLFNBQVM7QUFDeEIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDMUMsZUFBUyxRQUFRLFNBQVM7QUFDMUIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFBQSxJQUMzQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx1Q0FBdUMsTUFBTTtBQUNqRCxVQUFNLFFBQVE7QUFBQSxNQUNiO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxJQUFJO0FBQUEsSUFDWjtBQUVBLHVCQUFtQixPQUFPLEVBQUUsZ0JBQWdCLFVBQVUsVUFBVSxrQkFBa0IsZ0JBQWdCLEdBQUcsR0FBRyxDQUFDLFFBQVEsY0FBYztBQUM5SCxnQkFBVSxjQUFjLFFBQVEsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFFM0QsWUFBTSxrQkFBeUIsQ0FBQztBQUNoQyxlQUFTLHVCQUF1QjtBQUMvQix3QkFBZ0IsS0FBSyxVQUFVLGdCQUFnQixFQUFFLENBQUMsRUFBRSxVQUFVLFNBQVMsU0FBUyxDQUFDO0FBQUEsTUFDbEY7QUFFQSwyQkFBcUI7QUFDckIsYUFBTyxXQUFXLHVCQUF1QixZQUFZLElBQUk7QUFDekQsMkJBQXFCO0FBQ3JCLGFBQU8sV0FBVyx1QkFBdUIsWUFBWSxJQUFJO0FBQ3pELDJCQUFxQjtBQUNyQixhQUFPLFdBQVcsdUJBQXVCLFlBQVksSUFBSTtBQUN6RCwyQkFBcUI7QUFDckIsYUFBTyxXQUFXLHVCQUF1QixZQUFZLElBQUk7QUFFekQsMkJBQXFCO0FBQ3JCLGFBQU8sV0FBVyx1QkFBdUIsVUFBVSxJQUFJO0FBQ3ZELDJCQUFxQjtBQUNyQixhQUFPLFdBQVcsdUJBQXVCLFVBQVUsSUFBSTtBQUN2RCwyQkFBcUI7QUFDckIsYUFBTyxXQUFXLHVCQUF1QixVQUFVLElBQUk7QUFDdkQsMkJBQXFCO0FBQ3JCLGFBQU8sV0FBVyx1QkFBdUIsVUFBVSxJQUFJO0FBQ3ZELDJCQUFxQjtBQUVyQixhQUFPLGdCQUFnQixpQkFBaUI7QUFBQSxRQUN2QztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsVUFBTSxRQUFRO0FBQUEsRUFDZixDQUFDO0FBRUQsT0FBSyxnREFBZ0QsTUFBTTtBQUMxRCxVQUFNLFFBQVE7QUFBQSxNQUNiO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxJQUFJO0FBQUEsSUFDWjtBQUVBLHVCQUFtQixPQUFPLEVBQUUsZ0JBQWdCLFVBQVUsVUFBVSxrQkFBa0IsZ0JBQWdCLEdBQUcsR0FBRyxDQUFDLFFBQVEsY0FBYztBQUM5SCxhQUFPLGtCQUFrQixDQUFDLG1CQUFtQjtBQUM1Qyx1QkFBZSxpQkFBaUIsQ0FBQyxHQUFHO0FBQUEsVUFDbkM7QUFBQSxZQUNDLE9BQU8sSUFBSSxNQUFNLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxZQUM3QixTQUFTO0FBQUEsY0FDUixpQkFBaUI7QUFBQSxjQUNqQixhQUFhO0FBQUEsY0FDYixPQUFPO0FBQUEsZ0JBQ04sU0FBUztBQUFBLGNBQ1Y7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0YsQ0FBQztBQUNELGdCQUFVLGNBQWMsUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUUzRCxZQUFNLGtCQUF5QixDQUFDO0FBQ2hDLGVBQVMsdUJBQXVCO0FBQy9CLHdCQUFnQixLQUFLLFVBQVUsZ0JBQWdCLEVBQUUsQ0FBQyxFQUFFLFVBQVUsU0FBUyxTQUFTLENBQUM7QUFBQSxNQUNsRjtBQUVBLDJCQUFxQjtBQUNyQixhQUFPLFdBQVcsdUJBQXVCLFlBQVksSUFBSTtBQUN6RCwyQkFBcUI7QUFDckIsYUFBTyxXQUFXLHVCQUF1QixZQUFZLElBQUk7QUFDekQsMkJBQXFCO0FBQ3JCLGFBQU8sV0FBVyx1QkFBdUIsWUFBWSxJQUFJO0FBQ3pELDJCQUFxQjtBQUNyQixhQUFPLFdBQVcsdUJBQXVCLFlBQVksSUFBSTtBQUV6RCwyQkFBcUI7QUFDckIsYUFBTyxXQUFXLHVCQUF1QixVQUFVLElBQUk7QUFDdkQsMkJBQXFCO0FBQ3JCLGFBQU8sV0FBVyx1QkFBdUIsVUFBVSxJQUFJO0FBQ3ZELDJCQUFxQjtBQUNyQixhQUFPLFdBQVcsdUJBQXVCLFVBQVUsSUFBSTtBQUN2RCwyQkFBcUI7QUFDckIsYUFBTyxXQUFXLHVCQUF1QixVQUFVLElBQUk7QUFDdkQsMkJBQXFCO0FBRXJCLGFBQU8sZ0JBQWdCLGlCQUFpQjtBQUFBLFFBQ3ZDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxVQUFNLFFBQVE7QUFBQSxFQUNmLENBQUM7QUFJRCxPQUFLLDZCQUE2QixNQUFNO0FBQ3ZDLFlBQVEsQ0FBQyxRQUFRLGNBQWM7QUFDOUIsNEJBQXNCLFFBQVEsU0FBUztBQUN2QyxtQkFBYSxXQUFXLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztBQUMxQyw0QkFBc0IsUUFBUSxTQUFTO0FBQ3ZDLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDM0MsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssOENBQThDLE1BQU07QUFDeEQsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLENBQUM7QUFDOUIsNEJBQXNCLFFBQVEsU0FBUztBQUN2QyxtQkFBYSxXQUFXLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztBQUMxQyw0QkFBc0IsUUFBUSxTQUFTO0FBQ3ZDLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDM0MsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssa0VBQWtFLE1BQU07QUFDNUUsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLENBQUM7QUFDOUIsNEJBQXNCLFFBQVEsU0FBUztBQUN2QyxtQkFBYSxXQUFXLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztBQUMxQyw0QkFBc0IsUUFBUSxTQUFTO0FBQ3ZDLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDM0MsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssd0RBQXdELE1BQU07QUFDbEUsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLENBQUM7QUFDOUIsNEJBQXNCLFFBQVEsV0FBVyxJQUFJO0FBQzdDLG1CQUFhLFdBQVcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUNqRCw0QkFBc0IsUUFBUSxXQUFXLElBQUk7QUFDN0MsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDbEQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssOERBQThELE1BQU07QUFDeEUsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLENBQUM7QUFDOUIsYUFBTyxRQUFRLFdBQVcsR0FBRyxHQUFHLElBQUk7QUFDcEMsNEJBQXNCLFFBQVEsV0FBVyxLQUFLO0FBQzlDLG1CQUFhLFdBQVcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLElBQ2xELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLCtEQUErRCxNQUFNO0FBQ3pFLFlBQVEsQ0FBQyxRQUFRLGNBQWM7QUFDOUIsYUFBTyxRQUFRLFdBQVcsR0FBRyxDQUFDO0FBQzlCLGFBQU8sUUFBUSxXQUFXLEdBQUcsR0FBRyxJQUFJO0FBQ3BDLDRCQUFzQixRQUFRLFdBQVcsS0FBSztBQUM5QyxtQkFBYSxXQUFXLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxJQUNsRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxnRUFBZ0UsTUFBTTtBQUMxRSxZQUFRLENBQUMsUUFBUSxjQUFjO0FBQzlCLGFBQU8sUUFBUSxXQUFXLEdBQUcsQ0FBQztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLEdBQUcsSUFBSTtBQUNwQyw0QkFBc0IsUUFBUSxXQUFXLEtBQUs7QUFDOUMsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDbEQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssaUVBQWlFLE1BQU07QUFDM0UsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLENBQUM7QUFDOUIsYUFBTyxRQUFRLFdBQVcsR0FBRyxHQUFHLElBQUk7QUFDcEMsNEJBQXNCLFFBQVEsV0FBVyxLQUFLO0FBQzlDLG1CQUFhLFdBQVcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLElBQ2xELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDBFQUEwRSxNQUFNO0FBQ3BGLFlBQVEsQ0FBQyxRQUFRLGNBQWM7QUFDOUIsYUFBTyxRQUFRLFdBQVcsR0FBRyxDQUFDO0FBQzlCLGFBQU8sUUFBUSxXQUFXLEdBQUcsR0FBRyxJQUFJO0FBQ3BDLDRCQUFzQixRQUFRLFdBQVcsS0FBSztBQUM5QyxtQkFBYSxXQUFXLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxJQUNsRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx5R0FBMkcsTUFBTTtBQUNySCxZQUFRLENBQUMsUUFBUSxjQUFjO0FBQzlCLGFBQU8sUUFBUSxXQUFXLEdBQUcsQ0FBQztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLEdBQUcsSUFBSTtBQUNwQyw0QkFBc0IsUUFBUSxXQUFXLElBQUk7QUFDN0MsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDbEQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUlELE9BQUssdUJBQXVCLE1BQU07QUFDakMsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixzQkFBZ0IsUUFBUSxTQUFTO0FBQ2pDLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsTUFBTSxTQUFTLENBQUMsQ0FBQztBQUN6RCxzQkFBZ0IsUUFBUSxTQUFTO0FBQ2pDLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsTUFBTSxTQUFTLENBQUMsQ0FBQztBQUFBLElBQzFELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHdDQUF3QyxNQUFNO0FBQ2xELFlBQVEsQ0FBQyxRQUFRLGNBQWM7QUFDOUIsYUFBTyxRQUFRLFdBQVcsR0FBRyxDQUFDO0FBQzlCLHNCQUFnQixRQUFRLFNBQVM7QUFDakMsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxNQUFNLFNBQVMsQ0FBQyxDQUFDO0FBQ3pELHNCQUFnQixRQUFRLFNBQVM7QUFDakMsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxNQUFNLFNBQVMsQ0FBQyxDQUFDO0FBQUEsSUFDMUQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssc0RBQXNELE1BQU07QUFDaEUsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLEVBQUU7QUFDL0Isc0JBQWdCLFFBQVEsU0FBUztBQUNqQyxtQkFBYSxXQUFXLElBQUksU0FBUyxHQUFHLE1BQU0sU0FBUyxDQUFDLENBQUM7QUFDekQsc0JBQWdCLFFBQVEsU0FBUztBQUNqQyxtQkFBYSxXQUFXLElBQUksU0FBUyxHQUFHLE1BQU0sU0FBUyxDQUFDLENBQUM7QUFBQSxJQUMxRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxrREFBa0QsTUFBTTtBQUM1RCxZQUFRLENBQUMsUUFBUSxjQUFjO0FBQzlCLGFBQU8sUUFBUSxXQUFXLEdBQUcsQ0FBQztBQUM5QixzQkFBZ0IsUUFBUSxXQUFXLElBQUk7QUFDdkMsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsTUFBTSxTQUFTLENBQUMsQ0FBQztBQUNoRSxzQkFBZ0IsUUFBUSxXQUFXLElBQUk7QUFDdkMsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsTUFBTSxTQUFTLENBQUMsQ0FBQztBQUFBLElBQ2pFLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHdEQUF3RCxNQUFNO0FBQ2xFLFlBQVEsQ0FBQyxRQUFRLGNBQWM7QUFDOUIsYUFBTyxRQUFRLFdBQVcsR0FBRyxDQUFDO0FBQzlCLGFBQU8sUUFBUSxXQUFXLEdBQUcsR0FBRyxJQUFJO0FBQ3BDLHNCQUFnQixRQUFRLFdBQVcsS0FBSztBQUN4QyxtQkFBYSxXQUFXLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7QUFBQSxJQUNwRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx5REFBeUQsTUFBTTtBQUNuRSxZQUFRLENBQUMsUUFBUSxjQUFjO0FBQzlCLGFBQU8sUUFBUSxXQUFXLEdBQUcsQ0FBQztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLEdBQUcsSUFBSTtBQUNwQyxzQkFBZ0IsUUFBUSxXQUFXLEtBQUs7QUFDeEMsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO0FBQUEsSUFDcEQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMERBQTBELE1BQU07QUFDcEUsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLENBQUM7QUFDOUIsYUFBTyxRQUFRLFdBQVcsR0FBRyxHQUFHLElBQUk7QUFDcEMsc0JBQWdCLFFBQVEsV0FBVyxLQUFLO0FBQ3hDLG1CQUFhLFdBQVcsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztBQUFBLElBQ3BELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDJEQUEyRCxNQUFNO0FBQ3JFLFlBQVEsQ0FBQyxRQUFRLGNBQWM7QUFDOUIsYUFBTyxRQUFRLFdBQVcsR0FBRyxDQUFDO0FBQzlCLGFBQU8sUUFBUSxXQUFXLEdBQUcsR0FBRyxJQUFJO0FBQ3BDLHNCQUFnQixRQUFRLFdBQVcsS0FBSztBQUN4QyxtQkFBYSxXQUFXLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7QUFBQSxJQUNwRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywwRUFBMEUsTUFBTTtBQUNwRixZQUFRLENBQUMsUUFBUSxjQUFjO0FBQzlCLGFBQU8sUUFBUSxXQUFXLEdBQUcsQ0FBQztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLEdBQUcsSUFBSTtBQUNwQyxzQkFBZ0IsUUFBUSxXQUFXLEtBQUs7QUFDeEMsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO0FBQUEsSUFDcEQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUlELE9BQUssK0JBQStCLE1BQU07QUFDekMsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5Qiw4QkFBd0IsUUFBUSxTQUFTO0FBQ3pDLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDM0MsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssc0RBQXNELE1BQU07QUFDaEUsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLENBQUM7QUFDOUIsOEJBQXdCLFFBQVEsU0FBUztBQUN6QyxtQkFBYSxXQUFXLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztBQUFBLElBQzNDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHdEQUF3RCxNQUFNO0FBQ2xFLFlBQVEsQ0FBQyxRQUFRLGNBQWM7QUFDOUIsYUFBTyxRQUFRLFdBQVcsR0FBRyxDQUFDO0FBQzlCLDhCQUF3QixRQUFRLFNBQVM7QUFDekMsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFBQSxJQUMzQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxnRUFBZ0UsTUFBTTtBQUMxRSxZQUFRLENBQUMsUUFBUSxjQUFjO0FBQzlCLGFBQU8sUUFBUSxXQUFXLEdBQUcsQ0FBQztBQUM5Qiw4QkFBd0IsUUFBUSxXQUFXLElBQUk7QUFDL0MsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDbEQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssa0VBQWtFLE1BQU07QUFDNUUsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLENBQUM7QUFDOUIsOEJBQXdCLFFBQVEsV0FBVyxJQUFJO0FBQy9DLG1CQUFhLFdBQVcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLElBQ2xELENBQUM7QUFBQSxFQUNGLENBQUM7QUFJRCxPQUFLLHlCQUF5QixNQUFNO0FBQ25DLFlBQVEsQ0FBQyxRQUFRLGNBQWM7QUFDOUIsd0JBQWtCLFFBQVEsU0FBUztBQUNuQyxtQkFBYSxXQUFXLElBQUksU0FBUyxHQUFHLE1BQU0sU0FBUyxDQUFDLENBQUM7QUFBQSxJQUMxRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywrQ0FBK0MsTUFBTTtBQUN6RCxZQUFRLENBQUMsUUFBUSxjQUFjO0FBQzlCLGFBQU8sUUFBUSxXQUFXLEdBQUcsQ0FBQztBQUM5Qix3QkFBa0IsUUFBUSxTQUFTO0FBQ25DLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsTUFBTSxTQUFTLENBQUMsQ0FBQztBQUFBLElBQzFELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGtEQUFrRCxNQUFNO0FBQzVELFlBQVEsQ0FBQyxRQUFRLGNBQWM7QUFDOUIsYUFBTyxRQUFRLFdBQVcsR0FBRyxDQUFDO0FBQzlCLHdCQUFrQixRQUFRLFNBQVM7QUFDbkMsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxNQUFNLFNBQVMsQ0FBQyxDQUFDO0FBQUEsSUFDMUQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsseURBQXlELE1BQU07QUFDbkUsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLENBQUM7QUFDOUIsd0JBQWtCLFFBQVEsV0FBVyxJQUFJO0FBQ3pDLG1CQUFhLFdBQVcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLE1BQU0sU0FBUyxDQUFDLENBQUM7QUFBQSxJQUNqRSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw0REFBNEQsTUFBTTtBQUN0RSxZQUFRLENBQUMsUUFBUSxjQUFjO0FBQzlCLGFBQU8sUUFBUSxXQUFXLEdBQUcsQ0FBQztBQUM5Qix3QkFBa0IsUUFBUSxXQUFXLElBQUk7QUFDekMsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsTUFBTSxTQUFTLENBQUMsQ0FBQztBQUFBLElBQ2pFLENBQUM7QUFBQSxFQUNGLENBQUM7QUFJRCxPQUFLLGNBQWMsTUFBTTtBQUN4QixZQUFRLENBQUMsUUFBUSxjQUFjO0FBQzlCLDZCQUF1QixVQUFVLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUNuRSxtQkFBYSxXQUFXLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxNQUFNLFNBQVMsQ0FBQyxDQUFDO0FBQUEsSUFDakUsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUlELE9BQUssaUNBQWtDLE1BQU07QUFFNUMsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixZQUFNLGFBQWEsVUFBVSxRQUFRLENBQUMsTUFBTTtBQUMzQyxlQUFPLEdBQUcsT0FBTyx5QkFBeUI7QUFBQSxNQUMzQyxDQUFDO0FBQ0QsYUFBTyxRQUFRLFdBQVcsR0FBRyxDQUFDO0FBQzlCLGlCQUFXLFFBQVE7QUFBQSxJQUNwQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxpQkFBaUIsTUFBTTtBQUMzQixZQUFRLENBQUMsUUFBUSxjQUFjO0FBQzlCLFVBQUksU0FBUztBQUNiLFlBQU0sYUFBYSxVQUFVLFFBQVEsQ0FBQyxNQUFNO0FBQzNDLFlBQUksRUFBRSxTQUFTLDJCQUEyQixvQkFBb0I7QUFDN0Q7QUFDQSxpQkFBTyxnQkFBZ0IsRUFBRSxZQUFZLENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQUEsUUFDakU7QUFBQSxNQUNELENBQUM7QUFDRCxhQUFPLFFBQVEsV0FBVyxHQUFHLENBQUM7QUFDOUIsYUFBTyxZQUFZLFFBQVEsR0FBRyxrQkFBa0I7QUFDaEQsaUJBQVcsUUFBUTtBQUFBLElBQ3BCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG1DQUFtQyxNQUFNO0FBQzdDLFlBQVEsQ0FBQyxRQUFRLGNBQWM7QUFDOUIsVUFBSSxTQUFTO0FBQ2IsWUFBTSxhQUFhLFVBQVUsUUFBUSxDQUFDLE1BQU07QUFDM0MsWUFBSSxFQUFFLFNBQVMsMkJBQTJCLG9CQUFvQjtBQUM3RDtBQUNBLGlCQUFPLGdCQUFnQixFQUFFLFlBQVksQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFBQSxRQUNqRTtBQUFBLE1BQ0QsQ0FBQztBQUNELGFBQU8sUUFBUSxXQUFXLEdBQUcsR0FBRyxJQUFJO0FBQ3BDLGFBQU8sWUFBWSxRQUFRLEdBQUcsa0JBQWtCO0FBQ2hELGlCQUFXLFFBQVE7QUFBQSxJQUNwQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBSUQsT0FBSyw0QkFBNEIsTUFBTTtBQUN0QyxZQUFRLENBQUMsUUFBUSxjQUFjO0FBQzlCLGFBQU8sUUFBUSxXQUFXLEdBQUcsR0FBRyxJQUFJO0FBQ3BDLG1CQUFhLFdBQVcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUVqRCxZQUFNLGFBQWEsS0FBSyxVQUFVLFVBQVUsZ0JBQWdCLENBQUM7QUFFN0QsYUFBTyxRQUFRLFdBQVcsR0FBRyxHQUFHLEtBQUs7QUFDckMsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFFMUMsZ0JBQVUsbUJBQW1CLEtBQUssTUFBTSxVQUFVLENBQUM7QUFDbkQsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDbEQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUlELE9BQUssNEJBQTRCLE1BQU07QUFDdEMsWUFBUSxDQUFDLFFBQVEsY0FBYztBQUM5QixhQUFPLFFBQVEsV0FBVyxHQUFHLElBQUksSUFBSTtBQUVyQyxhQUFPLFNBQVMsRUFBRSxXQUFXLENBQUMsY0FBYyxPQUFPLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQzFFLG1CQUFhLFdBQVcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUUsQ0FBQztBQUFBLElBQ25ELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG1CQUFtQixNQUFNO0FBQzdCLHVCQUFtQjtBQUFBLE1BQ2xCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxDQUFDLEdBQUcsQ0FBQyxRQUFRLGNBQWM7QUFFN0IsYUFBTyxRQUFRLFdBQVcsR0FBRyxHQUFHLEtBQUs7QUFDckMsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFFMUMsNkJBQXVCLGFBQWEscUJBQXFCLFdBQVc7QUFBQSxRQUNuRSxVQUFVLElBQUksU0FBUyxHQUFHLENBQUM7QUFBQSxRQUMzQixjQUFjLElBQUksU0FBUyxHQUFHLENBQUM7QUFBQSxRQUMvQixhQUFhO0FBQUEsUUFDYixnQkFBZ0I7QUFBQSxNQUNqQixDQUFDO0FBRUQsWUFBTSxxQkFBcUI7QUFBQSxRQUMxQixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDeEIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUN4QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3pCO0FBRUEsbUJBQWEsV0FBVyxrQkFBa0I7QUFBQSxJQUUzQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxxQkFBcUIsTUFBTTtBQUMvQix1QkFBbUI7QUFBQSxNQUNsQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxDQUFDLEdBQUcsQ0FBQyxRQUFRLGNBQWM7QUFFN0IsZ0JBQVUsY0FBYyxRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQzNELGdCQUFVLFFBQVEsU0FBUztBQUMzQixtQkFBYSxXQUFXLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztBQUMxQyxlQUFTLFFBQVEsU0FBUztBQUMxQixtQkFBYSxXQUFXLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztBQUUxQyxnQkFBVSxjQUFjLFFBQVEsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDM0QsZ0JBQVUsUUFBUSxTQUFTO0FBQzNCLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQzFDLGVBQVMsUUFBUSxTQUFTO0FBQzFCLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBRTFDLGdCQUFVLGNBQWMsUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUMzRCxnQkFBVSxRQUFRLFNBQVM7QUFDM0IsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDMUMsZUFBUyxRQUFRLFNBQVM7QUFDMUIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFFMUMsZ0JBQVUsY0FBYyxRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQzNELGVBQVMsUUFBUSxTQUFTO0FBQzFCLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQzFDLGVBQVMsUUFBUSxTQUFTO0FBQzFCLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQzFDLGFBQU8sUUFBUSxTQUFTO0FBQ3hCLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQzFDLGFBQU8sUUFBUSxTQUFTO0FBQ3hCLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFFM0MsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssc0RBQXNELE1BQU07QUFDaEUsdUJBQW1CO0FBQUEsTUFDbEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEVBQUUsS0FBSyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsUUFBUSxjQUFjO0FBQ3hDLGFBQU8sUUFBUSxXQUFXLEdBQUcsR0FBRyxLQUFLO0FBQ3JDLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBRTFDLDZCQUF1QixhQUFhLHFCQUFxQixXQUFXO0FBQUEsUUFDbkUsVUFBVSxJQUFJLFNBQVMsR0FBRyxDQUFDO0FBQUEsUUFDM0IsY0FBYyxJQUFJLFNBQVMsR0FBRyxDQUFDO0FBQUEsUUFDL0IsYUFBYTtBQUFBLFFBQ2IsZ0JBQWdCO0FBQUEsTUFDakIsQ0FBQztBQUVELG1CQUFhLFdBQVc7QUFBQSxRQUN2QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ3hCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDeEIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUN4QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3pCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDBDQUEwQyxNQUFNO0FBQ3BELHVCQUFtQjtBQUFBLE1BQ2xCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxFQUFFLEtBQUssSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLFFBQVEsY0FBYztBQUV4QyxhQUFPLFFBQVEsV0FBVyxJQUFJLElBQUksS0FBSztBQUN2QyxtQkFBYSxXQUFXLElBQUksU0FBUyxJQUFJLEVBQUUsQ0FBQztBQUU1Qyw2QkFBdUIsYUFBYSxxQkFBcUIsV0FBVztBQUFBLFFBQ25FLFVBQVUsSUFBSSxTQUFTLEdBQUcsQ0FBQztBQUFBLFFBQzNCLGNBQWMsSUFBSSxTQUFTLEdBQUcsQ0FBQztBQUFBLFFBQy9CLGFBQWE7QUFBQSxRQUNiLGdCQUFnQjtBQUFBLE1BQ2pCLENBQUM7QUFDRCxtQkFBYSxXQUFXO0FBQUEsUUFDdkIsSUFBSSxVQUFVLElBQUksSUFBSSxJQUFJLENBQUM7QUFBQSxRQUMzQixJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQztBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLENBQUM7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQztBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLENBQUM7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQztBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLENBQUM7QUFBQSxNQUMxQixDQUFDO0FBRUQsNkJBQXVCLGFBQWEscUJBQXFCLFdBQVc7QUFBQSxRQUNuRSxVQUFVLElBQUksU0FBUyxHQUFHLENBQUM7QUFBQSxRQUMzQixjQUFjLElBQUksU0FBUyxHQUFHLENBQUM7QUFBQSxRQUMvQixhQUFhO0FBQUEsUUFDYixnQkFBZ0I7QUFBQSxNQUNqQixDQUFDO0FBQ0QsbUJBQWEsV0FBVztBQUFBLFFBQ3ZCLElBQUksVUFBVSxJQUFJLElBQUksSUFBSSxDQUFDO0FBQUEsUUFDM0IsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLENBQUM7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQztBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLENBQUM7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQztBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLENBQUM7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBQztBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDO0FBQUEsTUFDMUIsQ0FBQztBQUFBLElBRUYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNkNBQTZDLE1BQU07QUFDdkQsdUJBQW1CO0FBQUEsTUFDbEI7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEVBQUUsS0FBSyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsUUFBUSxjQUFjO0FBRXhDLGFBQU8sUUFBUSxXQUFXLElBQUksSUFBSSxLQUFLO0FBQ3ZDLG1CQUFhLFdBQVcsSUFBSSxTQUFTLElBQUksRUFBRSxDQUFDO0FBRTVDLDZCQUF1Qix1QkFBdUIscUJBQXFCLFdBQVcsQ0FBQyxDQUFDO0FBQ2hGLG1CQUFhLFdBQVc7QUFBQSxRQUN2QixJQUFJLFVBQVUsSUFBSSxJQUFJLElBQUksQ0FBQztBQUFBLE1BQzVCLENBQUM7QUFFRCw2QkFBdUIsdUJBQXVCLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUNoRixtQkFBYSxXQUFXO0FBQUEsUUFDdkIsSUFBSSxVQUFVLElBQUksSUFBSSxJQUFJLENBQUM7QUFBQSxNQUM1QixDQUFDO0FBRUQsNkJBQXVCLHdCQUF3QixxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFDakYsbUJBQWEsV0FBVztBQUFBLFFBQ3ZCLElBQUksVUFBVSxJQUFJLElBQUksSUFBSSxDQUFDO0FBQUEsTUFDNUIsQ0FBQztBQUVELDZCQUF1QixxQkFBcUIscUJBQXFCLFdBQVcsQ0FBQyxDQUFDO0FBQzlFLG1CQUFhLFdBQVc7QUFBQSxRQUN2QixJQUFJLFVBQVUsSUFBSSxJQUFJLElBQUksQ0FBQztBQUFBLFFBQzNCLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxDQUFDO0FBQUEsTUFDMUIsQ0FBQztBQUVELDZCQUF1Qix1QkFBdUIscUJBQXFCLFdBQVcsQ0FBQyxDQUFDO0FBQ2hGLG1CQUFhLFdBQVc7QUFBQSxRQUN2QixJQUFJLFVBQVUsSUFBSSxJQUFJLElBQUksQ0FBQztBQUFBLE1BQzVCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDBFQUEwRSxNQUFNO0FBQ3BGLHVCQUFtQjtBQUFBLE1BQ2xCO0FBQUEsSUFDRCxFQUFFLEtBQUssSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDLFFBQVEsY0FBYztBQUV4QyxhQUFPLFFBQVEsV0FBVyxHQUFHLEdBQUcsS0FBSztBQUNyQyxtQkFBYSxXQUFXLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztBQUUxQyw2QkFBdUIsdUJBQXVCLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUNoRixtQkFBYSxXQUFXO0FBQUEsUUFDdkIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUN6QixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywrQkFBK0IsTUFBTTtBQUN6Qyx1QkFBbUI7QUFBQSxNQUNsQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsRUFBRSxLQUFLLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQyxRQUFRLGNBQWM7QUFFeEMsYUFBTyxRQUFRLFdBQVcsR0FBRyxHQUFHLEtBQUs7QUFDckMsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFFMUMsNkJBQXVCLHdCQUF3QixxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFDakYsbUJBQWEsV0FBVztBQUFBLFFBQ3ZCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDekIsQ0FBQztBQUVELDZCQUF1Qix1QkFBdUIscUJBQXFCLFdBQVcsQ0FBQyxDQUFDO0FBQ2hGLG1CQUFhLFdBQVc7QUFBQSxRQUN2QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ3hCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDekIsQ0FBQztBQUVELDZCQUF1Qix1QkFBdUIscUJBQXFCLFdBQVcsQ0FBQyxDQUFDO0FBQ2hGLG1CQUFhLFdBQVc7QUFBQSxRQUN2QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ3hCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDeEIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUN6QixDQUFDO0FBRUQsNkJBQXVCLHVCQUF1QixxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFDaEYsNkJBQXVCLHVCQUF1QixxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFDaEYsNkJBQXVCLHVCQUF1QixxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFDaEYsNkJBQXVCLHVCQUF1QixxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFDaEYsbUJBQWEsV0FBVztBQUFBLFFBQ3ZCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDeEIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUN4QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ3hCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDeEIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUN4QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ3hCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDekIsQ0FBQztBQUVELDZCQUF1Qix3QkFBd0IscUJBQXFCLFdBQVcsQ0FBQyxDQUFDO0FBQ2pGLG1CQUFhLFdBQVc7QUFBQSxRQUN2QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ3hCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDeEIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUN4QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ3hCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDeEIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUN4QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3pCLENBQUM7QUFHRCw2QkFBdUIsd0JBQXdCLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUNqRiw2QkFBdUIsd0JBQXdCLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUNqRiw2QkFBdUIsd0JBQXdCLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUNqRiw2QkFBdUIsd0JBQXdCLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUNqRiw2QkFBdUIsd0JBQXdCLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUNqRiw2QkFBdUIsd0JBQXdCLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUNqRiw2QkFBdUIsd0JBQXdCLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUNqRiw2QkFBdUIsd0JBQXdCLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUNqRiw2QkFBdUIsd0JBQXdCLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUNqRiw2QkFBdUIsd0JBQXdCLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUNqRixtQkFBYSxXQUFXO0FBQUEsUUFDdkIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxNQUMxQixDQUFDO0FBR0QsNkJBQXVCLHdCQUF3QixxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFDakYsNkJBQXVCLHdCQUF3QixxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFDakYsNkJBQXVCLHdCQUF3QixxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFDakYsNkJBQXVCLHdCQUF3QixxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFDakYsNkJBQXVCLHdCQUF3QixxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFDakYsNkJBQXVCLHdCQUF3QixxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFDakYsNkJBQXVCLHdCQUF3QixxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFDakYsNkJBQXVCLHdCQUF3QixxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFDakYsNkJBQXVCLHdCQUF3QixxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFDakYsNkJBQXVCLHdCQUF3QixxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFDakYsbUJBQWEsV0FBVztBQUFBLFFBQ3ZCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsTUFDMUIsQ0FBQztBQUdELDZCQUF1Qix3QkFBd0IscUJBQXFCLFdBQVcsQ0FBQyxDQUFDO0FBQ2pGLDZCQUF1Qix3QkFBd0IscUJBQXFCLFdBQVcsQ0FBQyxDQUFDO0FBQ2pGLG1CQUFhLFdBQVc7QUFBQSxRQUN2QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLE1BQzFCLENBQUM7QUFHRCw2QkFBdUIsd0JBQXdCLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUNqRiw2QkFBdUIsd0JBQXdCLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUNqRiw2QkFBdUIsd0JBQXdCLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUNqRiw2QkFBdUIsd0JBQXdCLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUNqRixtQkFBYSxXQUFXO0FBQUEsUUFDdkIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxNQUMxQixDQUFDO0FBR0QsNkJBQXVCLHdCQUF3QixxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFDakYsNkJBQXVCLHdCQUF3QixxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFDakYsbUJBQWEsV0FBVztBQUFBLFFBQ3ZCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsTUFDMUIsQ0FBQztBQUdELDZCQUF1Qix3QkFBd0IscUJBQXFCLFdBQVcsQ0FBQyxDQUFDO0FBQ2pGLG1CQUFhLFdBQVc7QUFBQSxRQUN2QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLE1BQzFCLENBQUM7QUFHRCw2QkFBdUIsd0JBQXdCLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUNqRiw2QkFBdUIsd0JBQXdCLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUNqRiw2QkFBdUIsd0JBQXdCLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUNqRixtQkFBYSxXQUFXO0FBQUEsUUFDdkIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxNQUMxQixDQUFDO0FBR0QsNkJBQXVCLHdCQUF3QixxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFDakYsbUJBQWEsV0FBVztBQUFBLFFBQ3ZCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsTUFDMUIsQ0FBQztBQUdELDZCQUF1Qix3QkFBd0IscUJBQXFCLFdBQVcsQ0FBQyxDQUFDO0FBQ2pGLDZCQUF1Qix3QkFBd0IscUJBQXFCLFdBQVcsQ0FBQyxDQUFDO0FBQ2pGLDZCQUF1Qix3QkFBd0IscUJBQXFCLFdBQVcsQ0FBQyxDQUFDO0FBQ2pGLDZCQUF1Qix3QkFBd0IscUJBQXFCLFdBQVcsQ0FBQyxDQUFDO0FBQ2pGLG1CQUFhLFdBQVc7QUFBQSxRQUN2QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLE1BQzFCLENBQUM7QUFHRCw2QkFBdUIsdUJBQXVCLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUNoRixtQkFBYSxXQUFXO0FBQUEsUUFDdkIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUN6QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRTtBQUFBLFFBQ3pCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUU7QUFBQSxNQUMxQixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywwQ0FBMEMsTUFBTTtBQUVwRCxVQUFNLHNCQUE0QztBQUFBLE1BQ2pELGlCQUFpQixNQUFNO0FBQUEsTUFDdkIsVUFBVTtBQUFBLE1BQ1YsaUJBQWlCLENBQUMsTUFBYyxRQUFpQixVQUE2QztBQUM3RixlQUFPLElBQUksMEJBQTBCLElBQUksWUFBWSxDQUFDLEdBQUcsQ0FBQyxHQUFHLEtBQUs7QUFBQSxNQUNuRTtBQUFBLElBQ0Q7QUFFQSxVQUFNLGNBQWM7QUFDcEIsVUFBTSx1QkFBdUIscUJBQXFCLFNBQVMsYUFBYSxtQkFBbUI7QUFDM0YsVUFBTSxRQUFRLGdCQUFnQixhQUFhLFdBQVc7QUFFdEQsdUJBQW1CLE9BQU8sQ0FBQyxHQUFHLENBQUMsU0FBUyxZQUFZO0FBQ25ELFVBQUksUUFBaUQ7QUFDckQsWUFBTSxhQUFhLFFBQVEsMEJBQTBCLE9BQUs7QUFDekQsZ0JBQVE7QUFBQSxNQUNULENBQUM7QUFFRCxjQUFRLGFBQWEsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxZQUFZO0FBQ3hELGFBQU8sWUFBWSxNQUFPLFFBQVEsWUFBWTtBQUU5QyxjQUFRO0FBQ1IsY0FBUSxZQUFZLElBQUksU0FBUyxHQUFHLENBQUMsR0FBRyxZQUFZO0FBQ3BELGFBQU8sWUFBWSxNQUFPLFFBQVEsWUFBWTtBQUM5QyxpQkFBVyxRQUFRO0FBQUEsSUFDcEIsQ0FBQztBQUVELHlCQUFxQixRQUFRO0FBQzdCLFVBQU0sUUFBUTtBQUFBLEVBQ2YsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLHFCQUFxQixNQUFNO0FBRWhDLFFBQU0sd0JBQXdCO0FBQzlCLFFBQU0sd0JBQXdCO0FBQzlCLFFBQU0seUJBQXlCO0FBQy9CLFFBQU0sd0JBQXdCO0FBQzlCLFFBQU0saUNBQWlDO0FBRXZDLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCxrQkFBYyxJQUFJLGdCQUFnQjtBQUNsQywyQkFBdUIseUJBQXlCLFdBQVc7QUFDM0QsbUNBQStCLHFCQUFxQixJQUFJLDZCQUE2QjtBQUNyRixzQkFBa0IscUJBQXFCLElBQUksZ0JBQWdCO0FBRTNELGdCQUFZLElBQUksZ0JBQWdCLGlCQUFpQixFQUFFLElBQUksc0JBQXNCLENBQUMsQ0FBQztBQUMvRSxnQkFBWSxJQUFJLDZCQUE2QixTQUFTLHVCQUF1QjtBQUFBLE1BQzVFLGtCQUFrQixDQUFDLEVBQUUsTUFBTSxLQUFLLE9BQU8sSUFBSSxDQUFDO0FBQUEsSUFDN0MsQ0FBQyxDQUFDO0FBRUYsZ0JBQVksSUFBSSxnQkFBZ0IsaUJBQWlCLEVBQUUsSUFBSSwrQkFBK0IsQ0FBQyxDQUFDO0FBQ3hGLGdCQUFZLElBQUksNkJBQTZCLFNBQVMsZ0NBQWdDO0FBQUEsTUFDckYsa0JBQWtCLENBQUMsRUFBRSxNQUFNLEtBQUssT0FBTyxHQUFHLENBQUM7QUFBQSxJQUM1QyxDQUFDLENBQUM7QUFFRiw2QkFBeUIsdUJBQXVCO0FBQUEsTUFDL0MsdUJBQXVCO0FBQUEsTUFDdkIsdUJBQXVCO0FBQUEsTUFDdkIsdUJBQXVCO0FBQUEsTUFDdkIsdUJBQXVCO0FBQUEsSUFDeEIsQ0FBQztBQUVELGdCQUFZLElBQUksZ0JBQWdCLGlCQUFpQixFQUFFLElBQUksdUJBQXVCLENBQUMsQ0FBQztBQUNoRixnQkFBWSxJQUFJLDZCQUE2QixTQUFTLHdCQUF3QjtBQUFBLE1BQzdFLDRCQUE0QjtBQUFBLFFBQzNCLFlBQVksRUFBRSxNQUFNLE9BQU8sT0FBTyxNQUFNO0FBQUEsTUFDekM7QUFBQSxNQUNBLFVBQVU7QUFBQSxRQUNULENBQUMsS0FBSyxHQUFHO0FBQUEsUUFDVCxDQUFDLEtBQUssR0FBRztBQUFBLFFBQ1QsQ0FBQyxLQUFLLEdBQUc7QUFBQSxNQUNWO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRiw2QkFBeUI7QUFBQSxFQUMxQixDQUFDO0FBRUQsV0FBUyxNQUFNO0FBQ2QsZ0JBQVksUUFBUTtBQUFBLEVBQ3JCLENBQUM7QUFFRCwwQ0FBd0M7QUFFeEMsV0FBUyxxQkFBcUIsY0FBb0M7QUFDakUsVUFBTSxvQkFBb0I7QUFFMUIsZ0JBQVksSUFBSSxnQkFBZ0IsaUJBQWlCLEVBQUUsSUFBSSxrQkFBa0IsQ0FBQyxDQUFDO0FBQzNFLGdCQUFZLElBQUksNkJBQTZCLFNBQVMsbUJBQW1CO0FBQUEsTUFDeEUsY0FBYyxDQUFDO0FBQUEsUUFDZCxZQUFZO0FBQUEsUUFDWixRQUFRO0FBQUEsVUFDUDtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUMsQ0FBQztBQUNGLFdBQU87QUFBQSxFQUNSO0FBRUEsV0FBUyx5QkFBeUIsWUFBb0Isa0JBQTJDO0FBQ2hHLGdCQUFZLElBQUksZ0JBQWdCLGlCQUFpQixFQUFFLElBQUksV0FBVyxDQUFDLENBQUM7QUFDcEUsZ0JBQVksSUFBSSw2QkFBNkIsU0FBUyxZQUFZO0FBQUEsTUFDakU7QUFBQSxJQUNELENBQUMsQ0FBQztBQUNGLFdBQU87QUFBQSxFQUNSO0FBRUEsV0FBUywyQkFBMkI7QUFDbkMsZ0JBQVksSUFBSSxnQkFBZ0IsaUJBQWlCLEVBQUUsSUFBSSxzQkFBc0IsQ0FBQyxDQUFDO0FBQy9FLGdCQUFZLElBQUksNkJBQTZCLFNBQVMsdUJBQXVCO0FBQUEsTUFDNUUsVUFBVTtBQUFBLFFBQ1QsY0FBYyxDQUFDLE1BQU0sSUFBSTtBQUFBLE1BQzFCO0FBQUEsTUFDQSxrQkFBa0I7QUFBQSxRQUNqQixFQUFFLE1BQU0sS0FBSyxPQUFPLElBQUk7QUFBQSxRQUN4QixFQUFFLE1BQU0sS0FBSyxPQUFPLElBQUk7QUFBQSxRQUN4QixFQUFFLE1BQU0sS0FBSyxPQUFPLElBQUk7QUFBQSxRQUN4QixFQUFFLE1BQU0sS0FBTSxPQUFPLEtBQU0sT0FBTyxDQUFDLFVBQVUsU0FBUyxFQUFFO0FBQUEsUUFDeEQsRUFBRSxNQUFNLEtBQU0sT0FBTyxLQUFNLE9BQU8sQ0FBQyxRQUFRLEVBQUU7QUFBQSxRQUM3QyxFQUFFLE1BQU0sS0FBSyxPQUFPLEtBQUssT0FBTyxDQUFDLFVBQVUsU0FBUyxFQUFFO0FBQUEsUUFDdEQsRUFBRSxNQUFNLE9BQU8sT0FBTyxPQUFPLE9BQU8sQ0FBQyxRQUFRLEVBQUU7QUFBQSxRQUMvQyxFQUFFLE1BQU0sU0FBUyxPQUFPLE9BQU8sT0FBTyxDQUFDLFFBQVEsRUFBRTtBQUFBLE1BQ2xEO0FBQUEsTUFDQSw0QkFBNEI7QUFBQSxRQUMzQixZQUFZLEVBQUUsTUFBTSxPQUFPLE9BQU8sTUFBTTtBQUFBLE1BQ3pDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBRUEsV0FBUyx1Q0FBdUM7QUFBQSxJQUMvQyxNQUFNLFVBQTRCO0FBQUEsTUFDakMsWUFDaUIsU0FBdUIsTUFDdEM7QUFEZTtBQUFBLE1BQ2I7QUFBQSxNQUNKLFFBQWdCO0FBQUUsZUFBTztBQUFBLE1BQU07QUFBQSxNQUMvQixPQUFPLE9BQXdCO0FBQzlCLFlBQUksRUFBRSxpQkFBaUIsWUFBWTtBQUNsQyxpQkFBTztBQUFBLFFBQ1I7QUFDQSxZQUFJLENBQUMsS0FBSyxVQUFVLENBQUMsTUFBTSxRQUFRO0FBQ2xDLGlCQUFPO0FBQUEsUUFDUjtBQUNBLFlBQUksQ0FBQyxLQUFLLFVBQVUsQ0FBQyxNQUFNLFFBQVE7QUFDbEMsaUJBQU87QUFBQSxRQUNSO0FBQ0EsZUFBTyxLQUFLLE9BQU8sT0FBTyxNQUFNLE1BQU07QUFBQSxNQUN2QztBQUFBLElBQ0Q7QUFBQSxJQUNBLE1BQU0sWUFBOEI7QUFBQSxNQUNuQyxZQUNpQixNQUNBLGFBQ2Y7QUFGZTtBQUNBO0FBQUEsTUFDYjtBQUFBLE1BQ0osUUFBZ0I7QUFBRSxlQUFPO0FBQUEsTUFBTTtBQUFBLE1BQy9CLE9BQU8sT0FBd0I7QUFBRSxlQUFPLGlCQUFpQixlQUFlLEtBQUssU0FBUyxNQUFNLFFBQVEsS0FBSyxZQUFZLE9BQU8sTUFBTSxXQUFXO0FBQUEsTUFBRztBQUFBLElBQ2pKO0FBQUEsSUFDQSxNQUFNLGtCQUFvQztBQUFBLE1BQ3pDLFlBQ2lCLGFBQ2Y7QUFEZTtBQUFBLE1BQ2I7QUFBQSxNQUNKLFFBQWdCO0FBQUUsZUFBTztBQUFBLE1BQU07QUFBQSxNQUMvQixPQUFPLE9BQXdCO0FBQUUsZUFBTyxpQkFBaUIsZUFBZSxLQUFLLFlBQVksT0FBTyxNQUFNLFdBQVc7QUFBQSxNQUFHO0FBQUEsSUFDckg7QUFHQSxVQUFNLG9CQUFvQixnQkFBZ0IsZ0JBQWdCLGlCQUFpQixxQkFBcUI7QUFDaEcsZ0JBQVksSUFBSSxxQkFBcUIsU0FBUyx1QkFBdUI7QUFBQSxNQUNwRSxpQkFBaUIsTUFBTSxJQUFJLFVBQVU7QUFBQSxNQUNyQyxVQUFVO0FBQUEsTUFDVixpQkFBaUIsU0FBVSxNQUFjLFFBQWlCLFFBQTJDO0FBQ3BHLFlBQUksUUFBZTtBQUNuQixjQUFNLFNBQXdELENBQUM7QUFDL0QsY0FBTSxnQkFBZ0IsQ0FBQyxRQUFnQixNQUF5QixhQUFxQjtBQUNwRixjQUFJLE9BQU8sU0FBUyxLQUFLLE9BQU8sT0FBTyxTQUFTLENBQUMsRUFBRSxTQUFTLE1BQU07QUFFakUsbUJBQU8sT0FBTyxTQUFTLENBQUMsRUFBRSxVQUFVO0FBQUEsVUFDckMsT0FBTztBQUNOLG1CQUFPLEtBQUssRUFBRSxRQUFRLEtBQUssQ0FBQztBQUFBLFVBQzdCO0FBQ0EsaUJBQU8sS0FBSyxVQUFVLE1BQU07QUFDNUIsY0FBSSxVQUFVO0FBQ2Isb0JBQVE7QUFBQSxVQUNUO0FBQUEsUUFDRDtBQUNBLGVBQU8sS0FBSyxTQUFTLEdBQUc7QUFDdkIsa0JBQVE7QUFBQSxRQUNUO0FBQ0EsY0FBTSxTQUFTLElBQUksWUFBWSxPQUFPLFNBQVMsQ0FBQztBQUNoRCxZQUFJLGFBQWE7QUFDakIsaUJBQVMsSUFBSSxHQUFHLElBQUksT0FBTyxRQUFRLEtBQUs7QUFDdkMsaUJBQU8sSUFBSSxDQUFDLElBQUk7QUFDaEIsaUJBQU8sSUFBSSxJQUFJLENBQUMsSUFDZCxxQkFBcUIsZUFBZSxvQkFDbEMsT0FBTyxDQUFDLEVBQUUsUUFBUSxlQUFlO0FBRXJDLHdCQUFjLE9BQU8sQ0FBQyxFQUFFO0FBQUEsUUFDekI7QUFDQSxlQUFPLElBQUksMEJBQTBCLFFBQVEsQ0FBQyxHQUFHLEtBQUs7QUFFdEQsaUJBQVMsVUFBZ0I7QUFDeEIsY0FBSSxpQkFBaUIsV0FBVztBQUMvQixrQkFBTSxLQUFLLEtBQUssTUFBTSxjQUFjO0FBQ3BDLGdCQUFJLElBQUk7QUFDUCxxQkFBTyxjQUFjLEdBQUcsQ0FBQyxFQUFFLFFBQVEsa0JBQWtCLEtBQUs7QUFBQSxZQUMzRDtBQUNBLGdCQUFJLFNBQVMsS0FBSyxJQUFJLEdBQUc7QUFDeEIscUJBQU8sY0FBYyxHQUFHLGtCQUFrQixRQUFRLElBQUksWUFBWSxLQUFLLE9BQU8sQ0FBQyxHQUFHLEtBQUssQ0FBQztBQUFBLFlBQ3pGO0FBQ0EsZ0JBQUksS0FBSyxLQUFLLElBQUksR0FBRztBQUNwQixxQkFBTyxjQUFjLEdBQUcsa0JBQWtCLE9BQU8sSUFBSSxVQUFVLEtBQUssQ0FBQztBQUFBLFlBQ3RFO0FBQ0EsZ0JBQUksS0FBSyxLQUFLLElBQUksR0FBRztBQUNwQixxQkFBTyxjQUFjLEdBQUcsa0JBQWtCLE9BQU8sTUFBTSxVQUFVLElBQUksVUFBVSxDQUFDO0FBQUEsWUFDakY7QUFDQSxnQkFBSSxRQUFRLEtBQUssSUFBSSxHQUFHO0FBQ3ZCLHFCQUFPLGNBQWMsS0FBSyxRQUFRLGtCQUFrQixTQUFTLEtBQUs7QUFBQSxZQUNuRTtBQUNBLGdCQUFJLFFBQVEsS0FBSyxJQUFJLEdBQUc7QUFDdkIscUJBQU8sY0FBYyxHQUFHLGtCQUFrQixTQUFTLElBQUksa0JBQWtCLEtBQUssQ0FBQztBQUFBLFlBQ2hGO0FBQ0EsbUJBQU8sY0FBYyxHQUFHLGtCQUFrQixPQUFPLEtBQUs7QUFBQSxVQUN2RCxXQUFXLGlCQUFpQixhQUFhO0FBQ3hDLGtCQUFNLEtBQUssS0FBSyxNQUFNLGVBQWU7QUFDckMsZ0JBQUksSUFBSTtBQUNQLHFCQUFPLGNBQWMsR0FBRyxDQUFDLEVBQUUsUUFBUSxrQkFBa0IsTUFBTTtBQUFBLFlBQzVEO0FBQ0EsZ0JBQUksTUFBTSxLQUFLLElBQUksR0FBRztBQUNyQixxQkFBTyxjQUFjLEdBQUcsa0JBQWtCLE1BQU07QUFBQSxZQUNqRDtBQUNBLGdCQUFJLEtBQUssT0FBTyxDQUFDLE1BQU0sTUFBTSxNQUFNO0FBQ2xDLHFCQUFPLGNBQWMsR0FBRyxrQkFBa0IsUUFBUSxNQUFNLFdBQVc7QUFBQSxZQUNwRTtBQUNBLGdCQUFJLFFBQVEsS0FBSyxJQUFJLEdBQUc7QUFDdkIscUJBQU8sY0FBYyxHQUFHLGtCQUFrQixPQUFPLElBQUksVUFBVSxLQUFLLENBQUM7QUFBQSxZQUN0RTtBQUNBLG1CQUFPLGNBQWMsR0FBRyxrQkFBa0IsT0FBTyxLQUFLO0FBQUEsVUFDdkQsV0FBVyxpQkFBaUIsbUJBQW1CO0FBQzlDLGtCQUFNLEtBQUssS0FBSyxNQUFNLFNBQVM7QUFDL0IsZ0JBQUksSUFBSTtBQUNQLHFCQUFPLGNBQWMsR0FBRyxDQUFDLEVBQUUsUUFBUSxrQkFBa0IsTUFBTTtBQUFBLFlBQzVEO0FBQ0EsZ0JBQUksUUFBUSxLQUFLLElBQUksR0FBRztBQUN2QixxQkFBTyxjQUFjLEdBQUcsa0JBQWtCLFNBQVMsTUFBTSxXQUFXO0FBQUEsWUFDckU7QUFDQSxtQkFBTyxjQUFjLEdBQUcsa0JBQWtCLE9BQU8sS0FBSztBQUFBLFVBQ3ZELE9BQU87QUFDTixrQkFBTSxJQUFJLE1BQU0sZUFBZTtBQUFBLFVBQ2hDO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFFQSxXQUFTLGlDQUFpQyxPQUFxQjtBQUM5RCxnQkFBWSxJQUFJLDZCQUE2QixTQUFTLHVCQUF1QjtBQUFBLE1BQzVFLGlCQUFpQjtBQUFBLE1BQ2pCLGtCQUFrQjtBQUFBLFFBQ2pCLEVBQUUsTUFBTSxLQUFLLE9BQU8sSUFBSTtBQUFBLFFBQ3hCLEVBQUUsTUFBTSxLQUFLLE9BQU8sSUFBSTtBQUFBLFFBQ3hCLEVBQUUsTUFBTSxLQUFLLE9BQU8sSUFBSTtBQUFBLFFBQ3hCLEVBQUUsTUFBTSxLQUFNLE9BQU8sS0FBTSxPQUFPLENBQUMsVUFBVSxTQUFTLEVBQUU7QUFBQSxRQUN4RCxFQUFFLE1BQU0sS0FBTSxPQUFPLEtBQU0sT0FBTyxDQUFDLFFBQVEsRUFBRTtBQUFBLFFBQzdDLEVBQUUsTUFBTSxLQUFLLE9BQU8sS0FBSyxPQUFPLENBQUMsVUFBVSxTQUFTLEVBQUU7QUFBQSxRQUN0RCxFQUFFLE1BQU0sT0FBTyxPQUFPLE9BQU8sT0FBTyxDQUFDLFFBQVEsRUFBRTtBQUFBLE1BQ2hEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBRUEsV0FBU0EsaUJBQWdCLE1BQWMsYUFBNEIsTUFBTSxVQUE0QyxVQUFVLDBCQUEwQixNQUFrQixNQUFpQjtBQUMzTCxXQUFPLFlBQVksSUFBSSxxQkFBcUIsc0JBQXNCLE1BQU0sWUFBWSxTQUFTLEdBQUcsQ0FBQztBQUFBLEVBQ2xHO0FBRUEsV0FBU0Msb0JBQW1CLE1BQXNDLFNBQTZDLFVBQXlFO0FBQ3ZMLFFBQUk7QUFDSixRQUFJLE9BQU8sU0FBUyxVQUFVO0FBQzdCLGNBQVFELGlCQUFnQixJQUFJO0FBQUEsSUFDN0IsV0FBVyxNQUFNLFFBQVEsSUFBSSxHQUFHO0FBQy9CLGNBQVFBLGlCQUFnQixLQUFLLEtBQUssSUFBSSxDQUFDO0FBQUEsSUFDeEMsT0FBTztBQUNOLGNBQVE7QUFBQSxJQUNUO0FBQ0EsVUFBTSxTQUFTLFlBQVksSUFBSSwwQkFBMEIsc0JBQXNCLE9BQU8sT0FBTyxDQUFDO0FBQzlGLFVBQU0sWUFBWSxPQUFPLGFBQWE7QUFDdEMsY0FBVSxZQUFZLElBQUk7QUFDMUIsYUFBUyxRQUFRLFNBQVM7QUFBQSxFQUMzQjtBQVNBLFdBQVMsWUFBWSxNQUFtQixVQUEyRjtBQUNsSSxVQUFNLFFBQVFBLGlCQUFnQixLQUFLLEtBQUssS0FBSyxJQUFJLEdBQUcsS0FBSyxZQUFZLEtBQUssU0FBUztBQUNuRixVQUFNLGdCQUFvRCxLQUFLLGNBQWMsQ0FBQztBQUM5RSxJQUFBQyxvQkFBbUIsT0FBTyxlQUFlLENBQUMsUUFBUSxjQUFjO0FBQy9ELGVBQVMsUUFBUSxPQUFPLFNBQVM7QUFBQSxJQUNsQyxDQUFDO0FBQUEsRUFDRjtBQUVBLE1BQVc7QUFBWCxJQUFXQywyQkFBWDtBQUNDLElBQUFBLDhDQUFBLFlBQVMsS0FBVDtBQUNBLElBQUFBLDhDQUFBLGNBQVcsS0FBWDtBQUNBLElBQUFBLDhDQUFBLGNBQVcsS0FBWDtBQUFBLEtBSFU7QUFNWCxXQUFTLGlDQUFpQyxXQUFtQixlQUFnRDtBQUM1RyxVQUFNLFNBQWtDLENBQUM7QUFDekMsYUFBUyxJQUFJLEdBQUcsS0FBSyxXQUFXLEtBQUs7QUFDcEMsYUFBTyxDQUFDLElBQUk7QUFBQSxJQUNiO0FBQ0EsUUFBSSxTQUFTO0FBQ2IsYUFBUyxJQUFJLEdBQUcsSUFBSSxjQUFjLFFBQVEsS0FBSztBQUM5QyxVQUFJLGNBQWMsT0FBTyxDQUFDLE1BQU0sS0FBSztBQUNwQyxlQUFPLE1BQU0sSUFBSTtBQUFBLE1BQ2xCLFdBQVcsY0FBYyxPQUFPLENBQUMsTUFBTSxLQUFLO0FBQzNDLGVBQU8sTUFBTSxJQUFJO0FBQUEsTUFDbEIsT0FBTztBQUNOO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUVBLFdBQVMsV0FBVyxRQUF5QixPQUFtQixXQUFzQixZQUFvQixRQUFnQixLQUFhLGdCQUF3QixTQUF1QjtBQUNyTCxVQUFNLGNBQWMsTUFBTSxlQUFlLFVBQVU7QUFDbkQsVUFBTSxXQUFXLFlBQVksT0FBTyxHQUFHLFNBQVMsQ0FBQyxJQUFJLGlCQUFpQixZQUFZLE9BQU8sU0FBUyxDQUFDO0FBQ25HLFdBQU8sUUFBUSxXQUFXLFlBQVksTUFBTTtBQUM1QyxjQUFVLEtBQUssS0FBSyxVQUFVO0FBQzlCLFdBQU8sZ0JBQWdCLE1BQU0sZUFBZSxVQUFVLEdBQUcsVUFBVSxPQUFPO0FBQzFFLFVBQU0sS0FBSztBQUFBLEVBQ1o7QUFFQSxPQUFLLHNHQUFzRyxNQUFNO0FBQ2hILFVBQU0sUUFBUUY7QUFBQSxNQUNiO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxJQUFJO0FBQUEsTUFDWDtBQUFBLE1BQ0E7QUFBQSxRQUNDLGNBQWM7QUFBQSxNQUNmO0FBQUEsSUFDRDtBQUNBLElBQUFDLG9CQUFtQixPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsY0FBYztBQUNwRCxnQkFBVSxjQUFjLFFBQVEsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsRUFBRSxDQUFDLENBQUM7QUFHNUQsYUFBTyxXQUFXLG9CQUFvQixLQUFLLElBQUk7QUFDL0MsYUFBTyxnQkFBZ0IsVUFBVSxhQUFhLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUUsQ0FBQztBQUFBLElBQzVFLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGdEQUFnRCxNQUFNO0FBQzFELFVBQU0sUUFBUUQ7QUFBQSxNQUNiO0FBQUEsUUFDQztBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFBQSxNQUNYO0FBQUEsTUFDQTtBQUFBLFFBQ0MsY0FBYztBQUFBLFFBQ2Qsb0JBQW9CO0FBQUEsTUFDckI7QUFBQSxJQUNEO0FBRUEsSUFBQUMsb0JBQW1CLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxjQUFjO0FBQ3BELGdCQUFVLEtBQUssTUFBTSxVQUFVO0FBQy9CLGFBQU8sWUFBWSxNQUFNLFNBQVMsb0JBQW9CLEVBQUUsR0FBRyxNQUFNLFNBQVM7QUFFMUUsYUFBTyxXQUFXLG9CQUFvQixLQUFLLElBQUk7QUFDL0MsYUFBTyxZQUFZLE1BQU0sU0FBUyxvQkFBb0IsRUFBRSxHQUFHLE9BQVEsU0FBUztBQUU1RSxnQkFBVSxLQUFLLE1BQU0sVUFBVTtBQUMvQixhQUFPLFlBQVksTUFBTSxTQUFTLG9CQUFvQixFQUFFLEdBQUcsVUFBWSxTQUFTO0FBRWhGLGdCQUFVLEtBQUssR0FBRztBQUNsQixhQUFPLFlBQVksTUFBTSxTQUFTLG9CQUFvQixFQUFFLEdBQUcsV0FBYSxTQUFTO0FBRWpGLDZCQUF1QixXQUFXLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUNwRSxhQUFPLFlBQVksTUFBTSxTQUFTLG9CQUFvQixFQUFFLEdBQUcsV0FBYSxTQUFTO0FBRWpGLGFBQU8sV0FBVyxvQkFBb0IsWUFBWSxJQUFJO0FBQ3RELGFBQU8sWUFBWSxNQUFNLFNBQVMsb0JBQW9CLEVBQUUsR0FBRyxVQUFXLFNBQVM7QUFFL0UsYUFBTyxXQUFXLG9CQUFvQixZQUFZLElBQUk7QUFDdEQsYUFBTyxZQUFZLE1BQU0sU0FBUyxvQkFBb0IsRUFBRSxHQUFHLFFBQVMsU0FBUztBQUU3RSxhQUFPLFdBQVcsb0JBQW9CLFlBQVksSUFBSTtBQUN0RCxhQUFPLFlBQVksTUFBTSxTQUFTLG9CQUFvQixFQUFFLEdBQUcsT0FBTyxTQUFTO0FBRTNFLGFBQU8sV0FBVyxvQkFBb0IsWUFBWSxJQUFJO0FBQ3RELGFBQU8sWUFBWSxNQUFNLFNBQVMsb0JBQW9CLEVBQUUsR0FBRyxLQUFLLFNBQVM7QUFFekUsYUFBTyxXQUFXLG9CQUFvQixNQUFNLElBQUk7QUFDaEQsYUFBTyxZQUFZLE1BQU0sU0FBUyxvQkFBb0IsRUFBRSxHQUFHLE9BQU8sVUFBVTtBQUU1RSxhQUFPLFdBQVcsb0JBQW9CLE1BQU0sSUFBSTtBQUNoRCxhQUFPLFlBQVksTUFBTSxTQUFTLG9CQUFvQixFQUFFLEdBQUcsVUFBVyxVQUFVO0FBRWhGLGFBQU8sV0FBVyxvQkFBb0IsTUFBTSxJQUFJO0FBQ2hELGFBQU8sWUFBWSxNQUFNLFNBQVMsb0JBQW9CLEVBQUUsR0FBRyxXQUFhLFVBQVU7QUFFbEYsYUFBTyxXQUFXLG9CQUFvQixNQUFNLElBQUk7QUFDaEQsYUFBTyxZQUFZLE1BQU0sU0FBUyxvQkFBb0IsRUFBRSxHQUFHLFVBQVcsVUFBVTtBQUVoRixhQUFPLFdBQVcsb0JBQW9CLE1BQU0sSUFBSTtBQUNoRCxhQUFPLFlBQVksTUFBTSxTQUFTLG9CQUFvQixFQUFFLEdBQUcsT0FBTyxVQUFVO0FBRTVFLGFBQU8sV0FBVyxvQkFBb0IsTUFBTSxJQUFJO0FBQ2hELGFBQU8sWUFBWSxNQUFNLFNBQVMsb0JBQW9CLEVBQUUsR0FBRyxLQUFLLFVBQVU7QUFBQSxJQUMzRSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxrREFBbUQsTUFBTTtBQUM3RCxJQUFBQSxvQkFBbUI7QUFBQSxNQUNsQjtBQUFBLE1BQ0E7QUFBQSxJQUNELEdBQUcsQ0FBQyxHQUFHLENBQUMsUUFBUSxjQUFjO0FBQzdCLFlBQU0sUUFBUSxPQUFPLFNBQVM7QUFFOUIsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDMUMsWUFBTSxPQUFPLGtCQUFrQixFQUFFO0FBQ2pDLGFBQU8sWUFBWSxNQUFNLFNBQVMsR0FBRyxjQUFjO0FBRW5ELFlBQU0sUUFBUSxrQkFBa0IsSUFBSTtBQUNwQyxhQUFPLFlBQVksTUFBTSxTQUFTLEdBQUcsZ0JBQWdCO0FBRXJELGFBQU8sV0FBVyxvQkFBb0IsTUFBTSxJQUFJO0FBQ2hELGFBQU8sWUFBWSxNQUFNLFNBQVMsR0FBRyxjQUFjO0FBQUEsSUFDcEQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssaURBQWlELE1BQU07QUFDM0QsVUFBTSxhQUFhO0FBRW5CLGdCQUFZLElBQUksZ0JBQWdCLGlCQUFpQixFQUFFLElBQUksV0FBVyxDQUFDLENBQUM7QUFDcEUsZ0JBQVksSUFBSSw2QkFBNkIsU0FBUyxZQUFZO0FBQUEsTUFDakUsa0JBQWtCLENBQUMsRUFBRSxNQUFNLEtBQUssT0FBTyxJQUFJLENBQUM7QUFBQSxJQUM3QyxDQUFDLENBQUM7QUFFRixVQUFNLFFBQVFELGlCQUFnQixlQUFVLFVBQVU7QUFFbEQsSUFBQUMsb0JBQW1CLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxjQUFjO0FBQ3BELGFBQU8sYUFBYSxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBRTdDLGdCQUFVLEtBQUssS0FBSyxVQUFVO0FBQzlCLGFBQU8sWUFBWSxNQUFNLFNBQVMsb0JBQW9CLEVBQUUsR0FBRyxpQkFBWSxTQUFTO0FBRWhGLGFBQU8sV0FBVyxvQkFBb0IsTUFBTSxJQUFJO0FBQ2hELGFBQU8sWUFBWSxNQUFNLFNBQVMsb0JBQW9CLEVBQUUsR0FBRyxlQUFVLFNBQVM7QUFBQSxJQUMvRSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywrREFBK0QsTUFBTTtBQUN6RSxVQUFNLFFBQVFELGlCQUFnQixFQUFFO0FBRWhDLElBQUFDLG9CQUFtQixPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsY0FBYztBQUNwRCxnQkFBVSxLQUFLLFNBQVMsVUFBVTtBQUNsQyxnQkFBVSxLQUFLLEtBQUssVUFBVTtBQUM5QixnQkFBVSxLQUFLLFNBQVMsVUFBVTtBQUNsQyxnQkFBVSxLQUFLLEtBQUssVUFBVTtBQUM5QixhQUFPLFlBQVksTUFBTSxlQUFlLENBQUMsR0FBRyxjQUFjO0FBQzFELG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsRUFBRSxDQUFDO0FBRTNDLGVBQVMsUUFBUSxTQUFTO0FBQzFCLGdCQUFVLFFBQVEsU0FBUztBQUUzQixZQUFNLG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxjQUFjLFlBQVksSUFBSSxNQUFNLEdBQUcsSUFBSSxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQztBQUMvRixhQUFPLFlBQVksTUFBTSxlQUFlLENBQUMsR0FBRyxhQUFhO0FBQ3pELG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsRUFBRSxDQUFDO0FBRTNDLGFBQU8sV0FBVyxvQkFBb0IsTUFBTSxJQUFJO0FBQ2hELGFBQU8sWUFBWSxNQUFNLGVBQWUsQ0FBQyxHQUFHLGNBQWM7QUFDMUQsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO0FBRW5ELGFBQU8sV0FBVyxvQkFBb0IsTUFBTSxJQUFJO0FBQ2hELGFBQU8sWUFBWSxNQUFNLGVBQWUsQ0FBQyxHQUFHLGFBQWE7QUFDekQsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxFQUFFLENBQUM7QUFFM0MsYUFBTyxXQUFXLG9CQUFvQixNQUFNLElBQUk7QUFDaEQsYUFBTyxZQUFZLE1BQU0sZUFBZSxDQUFDLEdBQUcsT0FBTztBQUNuRCxtQkFBYSxXQUFXLElBQUksU0FBUyxHQUFHLENBQUMsQ0FBQztBQUUxQyxhQUFPLFdBQVcsb0JBQW9CLE1BQU0sSUFBSTtBQUNoRCxhQUFPLFlBQVksTUFBTSxlQUFlLENBQUMsR0FBRyxFQUFFO0FBQzlDLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBRTFDLGFBQU8sV0FBVyxvQkFBb0IsTUFBTSxJQUFJO0FBQ2hELGFBQU8sWUFBWSxNQUFNLGVBQWUsQ0FBQyxHQUFHLE9BQU87QUFDbkQsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFFMUMsYUFBTyxXQUFXLG9CQUFvQixNQUFNLElBQUk7QUFDaEQsYUFBTyxZQUFZLE1BQU0sZUFBZSxDQUFDLEdBQUcsYUFBYTtBQUN6RCxtQkFBYSxXQUFXLElBQUksU0FBUyxHQUFHLEVBQUUsQ0FBQztBQUUzQyxhQUFPLFdBQVcsb0JBQW9CLE1BQU0sSUFBSTtBQUNoRCxhQUFPLFlBQVksTUFBTSxlQUFlLENBQUMsR0FBRyxjQUFjO0FBQzFELG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsRUFBRSxDQUFDO0FBRTNDLGFBQU8sV0FBVyxvQkFBb0IsTUFBTSxJQUFJO0FBQ2hELGFBQU8sWUFBWSxNQUFNLGVBQWUsQ0FBQyxHQUFHLGFBQWE7QUFDekQsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxFQUFFLENBQUM7QUFFM0MsYUFBTyxXQUFXLG9CQUFvQixNQUFNLElBQUk7QUFDaEQsYUFBTyxZQUFZLE1BQU0sZUFBZSxDQUFDLEdBQUcsYUFBYTtBQUN6RCxtQkFBYSxXQUFXLElBQUksU0FBUyxHQUFHLEVBQUUsQ0FBQztBQUFBLElBQzVDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG1EQUFvRCxNQUFNO0FBQzlELFVBQU0sYUFBYSxxQkFBcUIsYUFBYSxhQUFhO0FBQ2xFLFVBQU0sUUFBUUQ7QUFBQSxNQUNiO0FBQUEsUUFDQztBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFBQSxNQUNYO0FBQUEsSUFDRDtBQUVBLElBQUFDLG9CQUFtQixPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsY0FBYztBQUNwRCxhQUFPLFFBQVEsV0FBVyxHQUFHLEdBQUcsS0FBSztBQUNyQyxtQkFBYSxXQUFXLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFFakQsYUFBTyxXQUFXLG9CQUFvQixTQUFTLElBQUk7QUFDbkQsYUFBTyxZQUFZLE1BQU0sZUFBZSxDQUFDLEdBQUcsc0JBQXNCO0FBQ2xFLG1CQUFhLFdBQVcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLElBQ2xELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGlFQUFrRSxNQUFNO0FBQzVFLFVBQU0sUUFBUUQ7QUFBQSxNQUNiO0FBQUEsUUFDQztBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFBQSxJQUNaO0FBRUEsSUFBQUMsb0JBQW1CLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxjQUFjO0FBQ3BELGFBQU8sUUFBUSxXQUFXLEdBQUcsR0FBRyxLQUFLO0FBQ3JDLG1CQUFhLFdBQVcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUVqRCxhQUFPLFdBQVcsb0JBQW9CLFNBQVMsSUFBSTtBQUNuRCxhQUFPLFlBQVksTUFBTSxlQUFlLENBQUMsR0FBRyxNQUFNO0FBQ2xELG1CQUFhLFdBQVcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLElBQ2xELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLCtEQUErRCxNQUFNO0FBQ3pFLFVBQU0sUUFBUUQ7QUFBQSxNQUNiO0FBQUEsUUFDQztBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFBQSxJQUNaO0FBRUEsSUFBQUMsb0JBQW1CLE9BQU8sRUFBRSxhQUFhLE1BQU0sR0FBRyxDQUFDLFFBQVEsY0FBYztBQUN4RSxhQUFPLFFBQVEsV0FBVyxHQUFHLEdBQUcsS0FBSztBQUNyQyxtQkFBYSxXQUFXLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFFakQsYUFBTyxXQUFXLG9CQUFvQixTQUFTLElBQUk7QUFDbkQsYUFBTyxZQUFZLE1BQU0sZUFBZSxDQUFDLEdBQUcsTUFBTTtBQUNsRCxtQkFBYSxXQUFXLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxJQUNsRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw2RkFBNkYsTUFBTTtBQUN2RyxVQUFNLFFBQVFEO0FBQUEsTUFDYjtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxJQUFJO0FBQUEsTUFDWDtBQUFBLE1BQ0E7QUFBQSxRQUNDLGNBQWM7QUFBQSxNQUNmO0FBQUEsSUFDRDtBQUVBLElBQUFDLG9CQUFtQixPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsY0FBYztBQUNwRCxhQUFPLFFBQVEsV0FBVyxHQUFHLEdBQUcsS0FBSztBQUNyQyxtQkFBYSxXQUFXLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFFakQsYUFBTyxXQUFXLG9CQUFvQixLQUFLLElBQUk7QUFDL0MsYUFBTyxZQUFZLE1BQU0sZUFBZSxDQUFDLEdBQUcsR0FBSTtBQUNoRCxtQkFBYSxXQUFXLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxJQUNsRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxpRUFBa0UsTUFBTTtBQUc1RSxJQUFBQSxvQkFBbUI7QUFBQSxNQUNsQjtBQUFBLE1BQ0E7QUFBQSxJQUNELEdBQUcsQ0FBQyxHQUFHLENBQUMsUUFBUSxjQUFjO0FBQzdCLFlBQU0sUUFBUSxPQUFPLFNBQVM7QUFFOUIsYUFBTyxRQUFRLFdBQVcsR0FBRyxHQUFHLEtBQUs7QUFDckMsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBRWpELGdCQUFVLElBQUksVUFBVTtBQUN4QixhQUFPLFlBQVksTUFBTSxhQUFhLEdBQUcsQ0FBQztBQUMxQyxhQUFPLFlBQVksTUFBTSxlQUFlLENBQUMsR0FBRyxRQUFRO0FBQUEsSUFFckQsQ0FBQztBQUdELElBQUFBLG9CQUFtQjtBQUFBLE1BQ2xCO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRyxDQUFDLEdBQUcsQ0FBQyxRQUFRLGNBQWM7QUFDN0IsWUFBTSxRQUFRLE9BQU8sU0FBUztBQUU5QixhQUFPLFFBQVEsV0FBVyxHQUFHLEdBQUcsS0FBSztBQUNyQyxtQkFBYSxXQUFXLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFFakQsZ0JBQVUsSUFBSSxVQUFVO0FBQ3hCLGFBQU8sWUFBWSxNQUFNLGFBQWEsR0FBRyxDQUFDO0FBQzFDLGFBQU8sWUFBWSxNQUFNLGVBQWUsQ0FBQyxHQUFHLFFBQVE7QUFFcEQsZ0JBQVUsSUFBSSxVQUFVO0FBQ3hCLGFBQU8sWUFBWSxNQUFNLGFBQWEsR0FBRyxDQUFDO0FBQzFDLGFBQU8sWUFBWSxNQUFNLGVBQWUsQ0FBQyxHQUFHLEVBQUU7QUFBQSxJQUMvQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx5RkFBeUYsTUFBTTtBQUNuRyxJQUFBQSxvQkFBbUI7QUFBQSxNQUNsQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxHQUFHLENBQUMsR0FBRyxDQUFDLFFBQVEsY0FBYztBQUM3QixZQUFNLFFBQVEsT0FBTyxTQUFTO0FBRTlCLGdCQUFVLGNBQWMsUUFBUTtBQUFBLFFBQy9CLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDeEIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUN4QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3pCLENBQUM7QUFFRCxnQkFBVSxJQUFJLFVBQVU7QUFDeEIsYUFBTyxZQUFZLE1BQU0sYUFBYSxHQUFHLENBQUM7QUFDMUMsYUFBTyxZQUFZLE1BQU0sZUFBZSxDQUFDLEdBQUcsRUFBRTtBQUFBLElBQy9DLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDJEQUEyRCxNQUFNO0FBQ3JFLGdCQUFZO0FBQUEsTUFDWCxNQUFNO0FBQUEsUUFDTDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFlBQVk7QUFBQSxJQUNiLEdBQUcsQ0FBQyxRQUFRLE9BQU8sY0FBYztBQUNoQyxhQUFPLFFBQVEsV0FBVyxHQUFHLEdBQUcsS0FBSztBQUNyQyxhQUFPLFFBQVEsV0FBVyxHQUFHLEdBQUcsSUFBSTtBQUNwQyxtQkFBYSxXQUFXLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFFakQsZ0JBQVUsS0FBSyxLQUFLLFVBQVU7QUFDOUIsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBRWpELGdCQUFVLEtBQUssS0FBSyxVQUFVO0FBQzlCLG1CQUFhLFdBQVcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLElBQ2xELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDBGQUEwRixNQUFNO0FBS3BHLGdCQUFZO0FBQUEsTUFDWCxNQUFNO0FBQUEsUUFDTDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFlBQVk7QUFBQSxJQUNiLEdBQUcsQ0FBQyxRQUFRLE9BQU8sY0FBYztBQUVoQyxhQUFPLFFBQVEsV0FBVyxHQUFHLEdBQUcsS0FBSztBQUNyQyxhQUFPLFFBQVEsV0FBVyxHQUFHLEdBQUcsSUFBSTtBQUNwQyxtQkFBYSxXQUFXLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFJakQsZ0JBQVUsS0FBSyxLQUFLLFVBQVU7QUFJOUIsYUFBTyxZQUFZLE1BQU0sU0FBUyxHQUFHLGNBQWM7QUFBQSxJQUNwRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw0Q0FBNEMsTUFBTTtBQUN0RCxVQUFNLFFBQVFEO0FBQUEsTUFDYjtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFBQSxJQUNaO0FBRUEsSUFBQUMsb0JBQW1CLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxjQUFjO0FBQ3BELGFBQU8sUUFBUSxXQUFXLEdBQUcsR0FBRyxLQUFLO0FBQ3JDLGFBQU8sUUFBUSxXQUFXLEdBQUcsSUFBSSxJQUFJO0FBQ3JDLG1CQUFhLFdBQVcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUUsQ0FBQztBQUVsRCxhQUFPLFdBQVcsb0JBQW9CLFlBQVksSUFBSTtBQUN0RCxtQkFBYSxXQUFXLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7QUFDbkQsYUFBTyxZQUFZLE1BQU0sYUFBYSxHQUFHLENBQUM7QUFDMUMsYUFBTyxZQUFZLE1BQU0sZUFBZSxDQUFDLEdBQUcsZ0JBQWdCO0FBQUEsSUFDN0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssZ0VBQWdFLE1BQU07QUFDMUUsZ0JBQVk7QUFBQSxNQUNYLE1BQU07QUFBQSxRQUNMO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNELEdBQUcsQ0FBQyxRQUFRLE9BQU8sY0FBYztBQUNoQyxhQUFPLFFBQVEsV0FBVyxHQUFHLEdBQUcsS0FBSztBQUNyQyxhQUFPLFFBQVEsV0FBVyxHQUFHLEdBQUcsSUFBSTtBQUVwQyxnQkFBVSxNQUFNLFdBQVcsSUFBSTtBQUUvQixhQUFPLFlBQVksTUFBTSxlQUFlLENBQUMsR0FBRyxPQUFPO0FBQ25ELGFBQU8sWUFBWSxNQUFNLGVBQWUsQ0FBQyxHQUFHLE9BQU87QUFDbkQsYUFBTyxZQUFZLE1BQU0sZUFBZSxDQUFDLEdBQUcsRUFBRTtBQUFBLElBQy9DLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLCtEQUErRCxNQUFNO0FBQ3pFLGdCQUFZO0FBQUEsTUFDWCxNQUFNO0FBQUEsUUFDTDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0QsR0FBRyxDQUFDLFFBQVEsT0FBTyxjQUFjO0FBQ2hDLGdCQUFVLGNBQWMsUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUUzRCxnQkFBVSxNQUFNLFdBQVcsSUFBSTtBQUUvQixhQUFPLFlBQVksTUFBTSxlQUFlLENBQUMsR0FBRyxPQUFPO0FBQ25ELGFBQU8sWUFBWSxNQUFNLGVBQWUsQ0FBQyxHQUFHLFlBQVk7QUFDeEQsYUFBTyxZQUFZLE1BQU0sZUFBZSxDQUFDLEdBQUcsSUFBSTtBQUNoRCxhQUFPLFlBQVksTUFBTSxlQUFlLENBQUMsR0FBRyxPQUFPO0FBQUEsSUFDcEQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsscUVBQXFFLE1BQU07QUFDL0UsZ0JBQVk7QUFBQSxNQUNYLE1BQU07QUFBQSxRQUNMO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRCxHQUFHLENBQUMsUUFBUSxPQUFPLGNBQWM7QUFDaEMsZ0JBQVUsY0FBYyxRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFFdEYsZ0JBQVU7QUFBQSxRQUNUO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxVQUNDO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsYUFBTyxZQUFZLE1BQU0sU0FBUyxHQUFHO0FBQUEsUUFDcEM7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxFQUFFLEtBQUssSUFBSSxDQUFDO0FBQUEsSUFDYixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw2R0FBNkcsTUFBTTtBQUN2SCxnQkFBWTtBQUFBLE1BQ1gsTUFBTTtBQUFBLFFBQ0w7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRCxHQUFHLENBQUMsUUFBUSxPQUFPLGNBQWM7QUFDaEMsZ0JBQVUsY0FBYyxRQUFRO0FBQUEsUUFDL0IsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUN4QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ3hCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDeEIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxNQUN6QixDQUFDO0FBRUQsZ0JBQVU7QUFBQSxRQUNUO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBRUEsYUFBTyxZQUFZLE1BQU0sU0FBUyxHQUFHO0FBQUEsUUFDcEM7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxJQUFJLENBQUM7QUFBQSxJQUNiLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHNEQUF1RCxNQUFNO0FBQ2pFLGdCQUFZO0FBQUEsTUFDWCxNQUFNO0FBQUEsUUFDTDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNELEdBQUcsQ0FBQyxRQUFRLE9BQU8sY0FBYztBQUNoQyxnQkFBVSxjQUFjLFFBQVE7QUFBQSxRQUMvQixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLFFBQ3hCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsUUFDeEIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUN4QixJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLE1BQ3pCLENBQUM7QUFFRCxnQkFBVTtBQUFBLFFBQ1Q7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFFQSxhQUFPLFlBQVksTUFBTSxTQUFTLEdBQUc7QUFBQSxRQUNwQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUksQ0FBQztBQUFBLElBQ2IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssdUdBQXVHLE1BQU07QUFDakgsZ0JBQVk7QUFBQSxNQUNYLE1BQU07QUFBQSxRQUNMO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRCxHQUFHLENBQUMsUUFBUSxPQUFPLGNBQWM7QUFDaEMsZ0JBQVUsY0FBYyxRQUFRLENBQUMsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUVqSCxnQkFBVTtBQUFBLFFBQ1Q7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFFQSxhQUFPLFlBQVksTUFBTSxTQUFTLEdBQUc7QUFBQSxRQUNwQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxFQUFFLEtBQUssSUFBSSxDQUFDO0FBQUEsSUFDYixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx1R0FBdUcsTUFBTTtBQUNqSCxnQkFBWTtBQUFBLE1BQ1gsTUFBTTtBQUFBLFFBQ0w7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxJQUNELEdBQUcsQ0FBQyxRQUFRLE9BQU8sY0FBYztBQUNoQyxnQkFBVSxjQUFjLFFBQVEsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBRWpILGdCQUFVO0FBQUEsUUFDVDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUVBLGFBQU8sWUFBWSxNQUFNLFNBQVMsR0FBRztBQUFBLFFBQ3BDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxJQUFJLENBQUM7QUFBQSxJQUNiLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDhGQUE4RixNQUFNO0FBQ3hHLGdCQUFZO0FBQUEsTUFDWCxNQUFNO0FBQUEsUUFDTDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsWUFBWTtBQUFBLFFBQ1gsa0JBQWtCO0FBQUEsTUFDbkI7QUFBQSxJQUNELEdBQUcsQ0FBQyxRQUFRLE9BQU8sY0FBYztBQUVoQyxnQkFBVSxjQUFjLFFBQVEsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUV0RixnQkFBVTtBQUFBLFFBQ1Q7QUFBQSxRQUNBO0FBQUEsUUFDQSxDQUFDLFdBQVcsU0FBUztBQUFBLE1BQ3RCO0FBR0EsYUFBTyxZQUFZLE1BQU0sU0FBUyxHQUFHO0FBQUEsUUFDcEM7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxFQUFFLEtBQUssSUFBSSxDQUFDO0FBQUEsSUFDYixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywwREFBMEQsTUFBTTtBQUNwRSxVQUFNLFFBQVFEO0FBQUEsTUFDYjtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFBQSxJQUNaO0FBRUEsSUFBQUMsb0JBQW1CLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxjQUFjO0FBQ3BELGFBQU8sUUFBUSxXQUFXLEdBQUcsR0FBRyxLQUFLO0FBQ3JDLGFBQU8sUUFBUSxXQUFXLEdBQUcsR0FBRyxJQUFJO0FBRXBDLFVBQUksVUFBVTtBQUNkLFlBQU0sYUFBYSxNQUFNLG1CQUFtQixNQUFNO0FBQ2pELFlBQUksU0FBUztBQUNaLG9CQUFVO0FBQ1Ysb0JBQVUsS0FBSyxLQUFNLFVBQVU7QUFBQSxRQUNoQztBQUFBLE1BQ0QsQ0FBQztBQUVELGFBQU8sV0FBVyxvQkFBb0IsS0FBSyxJQUFJO0FBQy9DLGFBQU8sWUFBWSxNQUFNLFNBQVMsR0FBRztBQUFBLFFBQ3BDO0FBQUEsTUFDRCxFQUFFLEtBQUssSUFBSSxHQUFHLEtBQUs7QUFFbkIsYUFBTyxXQUFXLG9CQUFvQixNQUFNLElBQUk7QUFDaEQsYUFBTyxZQUFZLE1BQU0sU0FBUyxHQUFHO0FBQUEsUUFDcEM7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUksR0FBRyxLQUFLO0FBRW5CLGFBQU8sV0FBVyxvQkFBb0IsTUFBTSxJQUFJO0FBQ2hELGFBQU8sWUFBWSxNQUFNLFNBQVMsR0FBRztBQUFBLFFBQ3BDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxJQUFJLEdBQUcsS0FBSztBQUVuQixhQUFPLFdBQVcsb0JBQW9CLE1BQU0sSUFBSTtBQUNoRCxhQUFPLFlBQVksTUFBTSxTQUFTLEdBQUc7QUFBQSxRQUNwQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRCxFQUFFLEtBQUssSUFBSSxHQUFHLEtBQUs7QUFFbkIsaUJBQVcsUUFBUTtBQUFBLElBQ3BCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDJFQUEyRSxNQUFNO0FBQ3JGLGdCQUFZO0FBQUEsTUFDWCxNQUFNO0FBQUEsUUFDTDtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsWUFBWTtBQUFBLElBQ2IsR0FBRyxDQUFDLFFBQVEsT0FBTyxjQUFjO0FBQ2hDLGFBQU8sUUFBUSxXQUFXLEdBQUcsR0FBRyxLQUFLO0FBRXJDLGdCQUFVLEtBQUssYUFBTSxVQUFVO0FBRS9CLGFBQU8sWUFBWSxNQUFNLFNBQVMsR0FBRztBQUFBLFFBQ3BDO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxJQUFJLENBQUM7QUFBQSxJQUNiLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHVFQUF1RSxNQUFNO0FBQ2pGLFVBQU0sUUFBUUQ7QUFBQSxNQUNiO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxJQUFJO0FBQUEsSUFDWjtBQUVBLElBQUFDLG9CQUFtQixPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsY0FBYztBQUNwRCxhQUFPLFFBQVEsV0FBVyxHQUFHLEdBQUcsS0FBSztBQUNyQyxhQUFPLFdBQVcsb0JBQW9CLEtBQUssSUFBSTtBQUMvQyxhQUFPLFlBQVksTUFBTSxlQUFlLENBQUMsR0FBRyxZQUFjO0FBQUEsSUFDM0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsseUdBQXlHLE1BQU07QUFDbkgsVUFBTSxRQUFRRDtBQUFBLE1BQ2I7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFBQSxNQUNYO0FBQUEsTUFDQTtBQUFBLFFBQ0MsY0FBYztBQUFBLE1BQ2Y7QUFBQSxJQUNEO0FBRUEsSUFBQUMsb0JBQW1CLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxjQUFjO0FBQ3BELGFBQU8sUUFBUSxXQUFXLEdBQUcsSUFBSSxLQUFLO0FBQ3RDLGFBQU8sUUFBUSxXQUFXLEdBQUcsSUFBSSxJQUFJO0FBQ3JDLGFBQU8sV0FBVyxvQkFBb0IsS0FBSyxJQUFJO0FBQy9DLGFBQU8sWUFBWSxNQUFNLGVBQWUsQ0FBQyxHQUFHLHFDQUFzQztBQUFBLElBQ25GLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDBCQUEwQixNQUFNO0FBRXBDLGdCQUFZO0FBQUEsTUFDWCxNQUFNO0FBQUEsUUFDTDtBQUFBLE1BQ0Q7QUFBQSxJQUNELEdBQUcsQ0FBQyxRQUFRLE9BQU8sY0FBYztBQUNoQyxhQUFPLFFBQVEsV0FBVyxHQUFHLEdBQUcsS0FBSztBQUVyQyxlQUFTLGdCQUFnQixLQUFhLGFBQXFCO0FBQzFELGNBQU0sT0FBTztBQUFBLFVBQ1osVUFBVTtBQUFBLFlBQ1QsWUFBWTtBQUFBLFlBQ1osUUFBUTtBQUFBLFVBQ1Q7QUFBQSxRQUNEO0FBQ0EsWUFBSSxRQUFRLEdBQUc7QUFDZCxpQ0FBdUIsV0FBVyxxQkFBcUIsV0FBVyxJQUFJO0FBQUEsUUFDdkUsT0FBTztBQUNOLGlDQUF1QixlQUFlLHFCQUFxQixXQUFXLElBQUk7QUFBQSxRQUMzRTtBQUVBLGVBQU8sWUFBWSxVQUFVLGFBQWEsRUFBRSxhQUFhLEdBQUcsY0FBYyxHQUFHO0FBQzdFLGVBQU8sWUFBWSxVQUFVLGFBQWEsRUFBRSxXQUFXLGFBQWEsY0FBYyxHQUFHO0FBQUEsTUFDdEY7QUFFQSxzQkFBZ0IsR0FBRyxNQUFNLFNBQVMsQ0FBQztBQUNuQyxzQkFBZ0IsR0FBRyxNQUFNLFNBQVMsQ0FBQztBQUNuQyxzQkFBZ0IsR0FBRyxNQUFNLFNBQVMsQ0FBQztBQUNuQyxzQkFBZ0IsR0FBRyxNQUFNLFNBQVMsQ0FBQztBQUNuQyxzQkFBZ0IsR0FBRyxPQUFPLFNBQVMsQ0FBQztBQUNwQyxzQkFBZ0IsR0FBRyxRQUFRLFNBQVMsQ0FBQztBQUNyQyxzQkFBZ0IsR0FBRyxTQUFTLFNBQVMsQ0FBQztBQUN0QyxzQkFBZ0IsR0FBRyxhQUFhLFNBQVMsQ0FBQztBQUMxQyxzQkFBZ0IsR0FBRyxhQUFhLFNBQVMsQ0FBQztBQUMxQyxzQkFBZ0IsSUFBSSxhQUFhLFNBQVMsQ0FBQztBQUMzQyxzQkFBZ0IsSUFBSSxhQUFhLFNBQVMsQ0FBQztBQUMzQyxzQkFBZ0IsSUFBSSxjQUFjLFNBQVMsQ0FBQztBQUM1QyxzQkFBZ0IsSUFBSSxrQkFBa0IsU0FBUyxDQUFDO0FBQ2hELHNCQUFnQixJQUFJLGtCQUFrQixTQUFTLENBQUM7QUFDaEQsc0JBQWdCLElBQUksa0JBQWtCLFNBQVMsQ0FBQztBQUNoRCxzQkFBZ0IsSUFBSSxrQkFBa0IsU0FBUyxDQUFDO0FBQ2hELHNCQUFnQixJQUFJLG1CQUFtQixTQUFTLENBQUM7QUFDakQsc0JBQWdCLElBQUksb0JBQW9CLFNBQVMsQ0FBQztBQUNsRCxzQkFBZ0IsSUFBSSxxQkFBcUIsU0FBUyxDQUFDO0FBQ25ELHNCQUFnQixJQUFJLHlCQUF5QixTQUFTLENBQUM7QUFDdkQsc0JBQWdCLElBQUkseUJBQXlCLFNBQVMsQ0FBQztBQUN2RCxzQkFBZ0IsSUFBSSx5QkFBeUIsU0FBUyxDQUFDO0FBQ3ZELHNCQUFnQixJQUFJLHlCQUF5QixTQUFTLENBQUM7QUFDdkQsc0JBQWdCLElBQUksMEJBQTBCLFNBQVMsQ0FBQztBQUN4RCxzQkFBZ0IsSUFBSSwyQkFBMkIsU0FBUyxDQUFDO0FBQ3pELHNCQUFnQixJQUFJLDRCQUE0QixTQUFTLENBQUM7QUFDMUQsc0JBQWdCLElBQUksZ0NBQWdDLFNBQVMsQ0FBQztBQUM5RCxzQkFBZ0IsSUFBSSxnQ0FBZ0MsU0FBUyxDQUFDO0FBQzlELHNCQUFnQixJQUFJLGdDQUFnQyxTQUFTLENBQUM7QUFDOUQsc0JBQWdCLElBQUksZ0NBQWdDLFNBQVMsQ0FBQztBQUM5RCxzQkFBZ0IsSUFBSSxpQ0FBaUMsU0FBUyxDQUFDO0FBQy9ELHNCQUFnQixJQUFJLGtDQUFrQyxTQUFTLENBQUM7QUFDaEUsc0JBQWdCLElBQUksbUNBQW1DLFNBQVMsQ0FBQztBQUNqRSxzQkFBZ0IsSUFBSSxvQ0FBb0MsU0FBUyxDQUFDO0FBQ2xFLHNCQUFnQixJQUFJLHFDQUFxQyxTQUFTLENBQUM7QUFDbkUsc0JBQWdCLElBQUksc0NBQXNDLFNBQVMsQ0FBQztBQUNwRSxzQkFBZ0IsSUFBSSx1Q0FBdUMsU0FBUyxDQUFDO0FBQ3JFLHNCQUFnQixJQUFJLHdDQUF3QyxTQUFTLENBQUM7QUFDdEUsc0JBQWdCLElBQUkseUNBQXlDLFNBQVMsQ0FBQztBQUN2RSxzQkFBZ0IsSUFBSSwwQ0FBMEMsU0FBUyxDQUFDO0FBQ3hFLHNCQUFnQixJQUFJLDJDQUEyQyxTQUFTLENBQUM7QUFDekUsc0JBQWdCLElBQUksNENBQTRDLFNBQVMsQ0FBQztBQUMxRSxzQkFBZ0IsSUFBSSw2Q0FBNkMsU0FBUyxDQUFDO0FBQzNFLHNCQUFnQixJQUFJLDhDQUE4QyxTQUFTLENBQUM7QUFDNUUsc0JBQWdCLElBQUksK0NBQStDLFNBQVMsQ0FBQztBQUM3RSxzQkFBZ0IsSUFBSSxnREFBZ0QsU0FBUyxDQUFDO0FBQzlFLHNCQUFnQixJQUFJLGlEQUFpRCxTQUFTLENBQUM7QUFDL0Usc0JBQWdCLElBQUksa0RBQWtELFNBQVMsQ0FBQztBQUNoRixzQkFBZ0IsSUFBSSxtREFBbUQsU0FBUyxDQUFDO0FBQ2pGLHNCQUFnQixJQUFJLG9EQUFvRCxTQUFTLENBQUM7QUFBQSxJQUNuRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywwRUFBMEUsTUFBTTtBQUNwRixVQUFNLFFBQVFEO0FBQUEsTUFDYjtBQUFBLFFBQ0M7QUFBQSxNQUNELEVBQUUsS0FBSyxJQUFJO0FBQUEsSUFDWjtBQUVBLElBQUFDLG9CQUFtQixPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsY0FBYztBQUNwRCw2QkFBdUIsV0FBVyxxQkFBcUIsV0FBVyxFQUFFLFVBQVUsSUFBSSxTQUFTLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFDbEcsYUFBTyxnQkFBZ0IsVUFBVSxhQUFhLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUUsQ0FBQztBQUUzRSw2QkFBdUIsZUFBZSxxQkFBcUIsV0FBVyxFQUFFLFVBQVUsSUFBSSxTQUFTLEdBQUcsQ0FBQyxFQUFFLENBQUM7QUFDdEcsYUFBTyxnQkFBZ0IsVUFBVSxhQUFhLEdBQUcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLEVBQUUsQ0FBQztBQUFBLElBQzVFLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGtFQUFrRSxNQUFNO0FBQzVFLFVBQU0sUUFBUUQ7QUFBQSxNQUNiO0FBQUEsUUFDQztBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFBQSxJQUNaO0FBRUEsSUFBQUMsb0JBQW1CLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxjQUFjO0FBQ3BELDZCQUF1QixXQUFXLHFCQUFxQixXQUFXLEVBQUUsVUFBVSxJQUFJLFNBQVMsR0FBRyxDQUFDLEVBQUUsQ0FBQztBQUNsRyxhQUFPLGdCQUFnQixVQUFVLGFBQWEsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDM0UsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssK0VBQStFLE1BQU07QUFDekYsVUFBTSxRQUFRRDtBQUFBLE1BQ2I7QUFBQSxRQUNDO0FBQUEsTUFDRCxFQUFFLEtBQUssSUFBSTtBQUFBLElBQ1o7QUFFQSxJQUFBQyxvQkFBbUIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxRQUFRLGNBQWM7QUFFcEQsNkJBQXVCLFdBQVcscUJBQXFCLFdBQVcsRUFBRSxVQUFVLElBQUksU0FBUyxHQUFHLEVBQUUsRUFBRSxDQUFDO0FBQ25HLGFBQU8sZ0JBQWdCLFVBQVUsYUFBYSxHQUFHLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxFQUFFLEdBQUcsMkJBQTJCO0FBR3pHLDZCQUF1QixXQUFXLHFCQUFxQixXQUFXLEVBQUUsVUFBVSxJQUFJLFNBQVMsR0FBRyxFQUFFLEVBQUUsQ0FBQztBQUNuRyxhQUFPLGdCQUFnQixVQUFVLGFBQWEsR0FBRyxJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRSxHQUFHLDJCQUEyQjtBQUd6Ryw2QkFBdUIsV0FBVyxxQkFBcUIsV0FBVyxFQUFFLFVBQVUsSUFBSSxTQUFTLEdBQUcsRUFBRSxFQUFFLENBQUM7QUFDbkcsYUFBTyxnQkFBZ0IsVUFBVSxhQUFhLEdBQUcsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUUsR0FBRywyQkFBMkI7QUFHekcsNkJBQXVCLFdBQVcscUJBQXFCLFdBQVcsRUFBRSxVQUFVLElBQUksU0FBUyxHQUFHLENBQUMsRUFBRSxDQUFDO0FBQ2xHLGFBQU8sZ0JBQWdCLFVBQVUsYUFBYSxHQUFHLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsd0JBQXdCO0FBR3BHLDZCQUF1QixXQUFXLHFCQUFxQixXQUFXLEVBQUUsVUFBVSxJQUFJLFNBQVMsR0FBRyxDQUFDLEVBQUUsQ0FBQztBQUNsRyxhQUFPLGdCQUFnQixVQUFVLGFBQWEsR0FBRyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLHdCQUF3QjtBQUdwRyw2QkFBdUIsV0FBVyxxQkFBcUIsV0FBVyxFQUFFLFVBQVUsSUFBSSxTQUFTLEdBQUcsRUFBRSxFQUFFLENBQUM7QUFDbkcsYUFBTyxnQkFBZ0IsVUFBVSxhQUFhLEdBQUcsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUUsR0FBRyw0QkFBNEI7QUFBQSxJQUMzRyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxnRUFBZ0UsTUFBTTtBQUMxRSxJQUFBQSxvQkFBbUIsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLFFBQVEsY0FBYztBQUNqRCxZQUFNLFFBQVEsT0FBTyxTQUFTO0FBQzlCLG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBRzFDLGdCQUFVLEtBQUssVUFBSyxVQUFVO0FBQzlCLGdCQUFVLGdCQUFnQixVQUFLLEdBQUcsR0FBRyxDQUFDO0FBQ3RDLGdCQUFVLGdCQUFnQixnQkFBTSxHQUFHLEdBQUcsQ0FBQztBQUN2QyxnQkFBVSxnQkFBZ0IsZ0JBQU0sR0FBRyxHQUFHLENBQUM7QUFDdkMsZ0JBQVUsZ0JBQWdCLHNCQUFPLEdBQUcsR0FBRyxDQUFDO0FBQ3hDLGdCQUFVLGdCQUFnQixzQkFBTyxHQUFHLEdBQUcsQ0FBQztBQUN4QyxnQkFBVSxnQkFBZ0Isc0JBQU8sR0FBRyxHQUFHLENBQUM7QUFDeEMsZ0JBQVUsZ0JBQWdCLDRCQUFRLEdBQUcsR0FBRyxDQUFDO0FBQ3pDLGdCQUFVLGdCQUFnQiw0QkFBUSxHQUFHLEdBQUcsQ0FBQztBQUN6QyxnQkFBVSxnQkFBZ0IsNEJBQVEsR0FBRyxHQUFHLENBQUM7QUFDekMsZ0JBQVUsZ0JBQWdCLDRCQUFRLEdBQUcsR0FBRyxDQUFDO0FBRXpDLGFBQU8sWUFBWSxNQUFNLGVBQWUsQ0FBQyxHQUFHLDBCQUFNO0FBQ2xELG1CQUFhLFdBQVcsSUFBSSxTQUFTLEdBQUcsQ0FBQyxDQUFDO0FBRTFDLGFBQU8sV0FBVyxvQkFBb0IsTUFBTSxJQUFJO0FBQ2hELGFBQU8sWUFBWSxNQUFNLGVBQWUsQ0FBQyxHQUFHLEVBQUU7QUFDOUMsbUJBQWEsV0FBVyxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFBQSxJQUMzQyxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxxRUFBcUUsTUFBTTtBQUMvRSxnQkFBWTtBQUFBLE1BQ1gsTUFBTTtBQUFBLFFBQ0w7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0QsR0FBRyxDQUFDLFFBQVEsT0FBTyxjQUFjO0FBQ2hDLFlBQU0sT0FBTyxrQkFBa0IsSUFBSTtBQUVuQyxnQkFBVSxjQUFjLFFBQVEsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDM0QsWUFBTSxPQUFPLGtCQUFrQixFQUFFO0FBRWpDLG1CQUFhLFdBQVcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLElBQ2xELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGlFQUFpRSxNQUFNO0FBQzNFLGdCQUFZO0FBQUEsTUFDWCxNQUFNO0FBQUEsUUFDTDtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRCxHQUFHLENBQUMsUUFBUSxPQUFPLGNBQWM7QUFDaEMsWUFBTSxPQUFPLGtCQUFrQixJQUFJO0FBRW5DLGdCQUFVLGNBQWMsUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUMzRCxZQUFNLFNBQVM7QUFBQSxRQUNkO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxJQUFJLENBQUM7QUFFWixtQkFBYSxXQUFXLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFBQSxJQUNsRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxrRkFBa0YsTUFBTTtBQUU1RixJQUFBQSxvQkFBbUI7QUFBQSxNQUNsQjtBQUFBLFFBQ0M7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxFQUFFO0FBQUEsSUFDVixHQUFHLEVBQUUsVUFBVSxrQkFBa0IsZ0JBQWdCLEdBQUcsR0FBRyxDQUFDLFFBQVEsY0FBYztBQUM3RSxnQkFBVSxjQUFjLFFBQVEsQ0FBQyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFFM0QsZ0JBQVUsUUFBUSxTQUFTO0FBQzNCLG1CQUFhLFdBQVcsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUVqRCxnQkFBVSxRQUFRLFNBQVM7QUFDM0IsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDO0FBRWpELGdCQUFVLFFBQVEsU0FBUztBQUMzQixtQkFBYSxXQUFXLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7QUFFbkQsZ0JBQVUsUUFBUSxTQUFTO0FBQzNCLG1CQUFhLFdBQVcsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztBQUVuRCxnQkFBVSxRQUFRLFNBQVM7QUFDM0IsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO0FBRW5ELGdCQUFVLFFBQVEsU0FBUztBQUMzQixtQkFBYSxXQUFXLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7QUFHbkQsZ0JBQVUsUUFBUSxTQUFTO0FBQzNCLG1CQUFhLFdBQVcsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUUsQ0FBQztBQUVuRCxlQUFTLFFBQVEsU0FBUztBQUMxQixtQkFBYSxXQUFXLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7QUFHbkQsZUFBUyxRQUFRLFNBQVM7QUFDMUIsbUJBQWEsV0FBVyxJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO0FBQUEsSUFDcEQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssdUVBQXVFLE1BQU07QUFFakYsSUFBQUEsb0JBQW1CO0FBQUEsTUFDbEI7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLEVBQUU7QUFBQSxJQUNWLEdBQUcsRUFBRSxVQUFVLGtCQUFrQixnQkFBZ0IsR0FBRyxHQUFHLENBQUMsUUFBUSxjQUFjO0FBQzdFLGdCQUFVLGNBQWMsUUFBUTtBQUFBLFFBQy9CLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUMxQixJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQzNCLENBQUM7QUFFRCxlQUFTLFFBQVEsU0FBUztBQUMxQixtQkFBYSxXQUFXO0FBQUEsUUFDdkIsSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFBQSxRQUN4QixJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQzFCLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsTUFDM0IsQ0FBQztBQUVELGdCQUFVLGNBQWMsUUFBUTtBQUFBLFFBQy9CLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxFQUFFO0FBQUEsUUFDekIsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUMxQixJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQzNCLENBQUM7QUFFRCxnQkFBVSxRQUFRLFNBQVM7QUFDM0IsbUJBQWEsV0FBVztBQUFBLFFBQ3ZCLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDMUIsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUMxQixJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLE1BQzNCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHdGQUF3RixNQUFNO0FBRWxHLElBQUFBLG9CQUFtQjtBQUFBLE1BQ2xCO0FBQUEsUUFDQztBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxJQUFJO0FBQUEsSUFDWixHQUFHLEVBQUUsVUFBVSxrQkFBa0IsZ0JBQWdCLEdBQUcsR0FBRyxDQUFDLFFBQVEsY0FBYztBQUM3RSxnQkFBVSxjQUFjLFFBQVE7QUFBQSxRQUMvQixJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQzFCLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDMUIsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUMxQixJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQzFCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDekIsQ0FBQztBQUNELG1CQUFhLFdBQVc7QUFBQSxRQUN2QixJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQzFCLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDMUIsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUMxQixJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQzFCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDekIsQ0FBQztBQUVELGdCQUFVLFFBQVEsV0FBVyxJQUFJO0FBQ2pDLG1CQUFhLFdBQVc7QUFBQSxRQUN2QixJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQzFCLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDMUIsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUMxQixJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQzFCLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsTUFDekIsQ0FBQztBQUVELGdCQUFVLFFBQVEsV0FBVyxJQUFJO0FBQ2pDLG1CQUFhLFdBQVc7QUFBQSxRQUN2QixJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFBLFFBQzFCLElBQUksVUFBVSxHQUFHLElBQUksR0FBRyxFQUFFO0FBQUEsUUFDMUIsSUFBSSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQUU7QUFBQSxRQUMxQixJQUFJLFVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRTtBQUFB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LFVBQU0sUUFBUTtBQUFBLE1BQ2I7QUFBQSxRQUNDO0FBQUEsUUFDQTtBQUFBLE1BQ0QsRUFBRSxLQUFLLElBQUk7QUFBQSxNQUNYO0FBQUEsTUFDQTtBQUFBLFFBQ0MsY0FBYztBQUFBLE1BQ2Y7QUFBQSxJQUNEO0FBRUEsdUJBQW1CLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxjQUFjO0FBQ3BELGdCQUFVLGNBQWMsUUFBUSxDQUFDLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUMzRCxnQkFBVSxpQkFBaUI7QUFDM0IsZ0JBQVUsZ0JBQWdCLFVBQUssR0FBRyxHQUFHLEdBQUcsVUFBVTtBQUNsRCxhQUFPLFlBQVksTUFBTSxTQUFTLG9CQUFvQixFQUFFLEdBQUc7QUFBQSxRQUMxRDtBQUFBLFFBQ0E7QUFBQSxNQUNELEVBQUUsS0FBSyxJQUFJLEdBQUcsU0FBUztBQUV2QixnQkFBVSxlQUFlLFVBQVU7QUFDbkMsYUFBTyxZQUFZLE1BQU0sU0FBUyxvQkFBb0IsRUFBRSxHQUFHO0FBQUEsUUFDMUQ7QUFBQSxRQUNBO0FBQUEsTUFDRCxFQUFFLEtBQUssSUFBSSxHQUFHLFNBQVM7QUFBQSxJQUN4QixDQUFDO0FBRUQsVUFBTSxRQUFRO0FBQUEsRUFDZixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsiY3JlYXRlVGV4dE1vZGVsIiwgIndpdGhUZXN0Q29kZUVkaXRvciIsICJBdXRvQ2xvc2luZ0NvbHVtblR5cGUiLCAibW9kZWwiLCAidmlld01vZGVsIl0KfQo=
