import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { CoreNavigationCommands } from "../../../browser/coreCommands.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { CursorMove } from "../../../common/cursor/cursorMoveCommands.js";
import { withTestCodeEditor } from "../testCodeEditor.js";
suite("Cursor move command test", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const TEXT = [
    "    	My First Line	 ",
    "	My Second Line",
    "    Third Line\u{1F436}",
    "",
    "1"
  ].join("\n");
  function executeTest(callback) {
    withTestCodeEditor(TEXT, {}, (editor, viewModel) => {
      callback(editor, viewModel);
    });
  }
  test("move left should move to left character", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 8);
      moveLeft(viewModel);
      cursorEqual(viewModel, 1, 7);
    });
  });
  test("move left should move to left by n characters", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 8);
      moveLeft(viewModel, 3);
      cursorEqual(viewModel, 1, 5);
    });
  });
  test("move left should move to left by half line", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 8);
      moveLeft(viewModel, 1, CursorMove.RawUnit.HalfLine);
      cursorEqual(viewModel, 1, 1);
    });
  });
  test("move left moves to previous line", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 2, 3);
      moveLeft(viewModel, 10);
      cursorEqual(viewModel, 1, 21);
    });
  });
  test("move right should move to right character", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 5);
      moveRight(viewModel);
      cursorEqual(viewModel, 1, 6);
    });
  });
  test("move right should move to right by n characters", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 2);
      moveRight(viewModel, 6);
      cursorEqual(viewModel, 1, 8);
    });
  });
  test("move right should move to right by half line", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 4);
      moveRight(viewModel, 1, CursorMove.RawUnit.HalfLine);
      cursorEqual(viewModel, 1, 14);
    });
  });
  test("move right moves to next line", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 8);
      moveRight(viewModel, 100);
      cursorEqual(viewModel, 2, 1);
    });
  });
  test("move to first character of line from middle", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 8);
      moveToLineStart(viewModel);
      cursorEqual(viewModel, 1, 1);
    });
  });
  test("move to first character of line from first non white space character", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 6);
      moveToLineStart(viewModel);
      cursorEqual(viewModel, 1, 1);
    });
  });
  test("move to first character of line from first character", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 1);
      moveToLineStart(viewModel);
      cursorEqual(viewModel, 1, 1);
    });
  });
  test("move to first non white space character of line from middle", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 8);
      moveToLineFirstNonWhitespaceCharacter(viewModel);
      cursorEqual(viewModel, 1, 6);
    });
  });
  test("move to first non white space character of line from first non white space character", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 6);
      moveToLineFirstNonWhitespaceCharacter(viewModel);
      cursorEqual(viewModel, 1, 6);
    });
  });
  test("move to first non white space character of line from first character", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 1);
      moveToLineFirstNonWhitespaceCharacter(viewModel);
      cursorEqual(viewModel, 1, 6);
    });
  });
  test("move to end of line from middle", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 8);
      moveToLineEnd(viewModel);
      cursorEqual(viewModel, 1, 21);
    });
  });
  test("move to end of line from last non white space character", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 19);
      moveToLineEnd(viewModel);
      cursorEqual(viewModel, 1, 21);
    });
  });
  test("move to end of line from line end", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 21);
      moveToLineEnd(viewModel);
      cursorEqual(viewModel, 1, 21);
    });
  });
  test("move to last non white space character from middle", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 8);
      moveToLineLastNonWhitespaceCharacter(viewModel);
      cursorEqual(viewModel, 1, 19);
    });
  });
  test("move to last non white space character from last non white space character", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 19);
      moveToLineLastNonWhitespaceCharacter(viewModel);
      cursorEqual(viewModel, 1, 19);
    });
  });
  test("move to last non white space character from line end", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 21);
      moveToLineLastNonWhitespaceCharacter(viewModel);
      cursorEqual(viewModel, 1, 19);
    });
  });
  test("move to center of line not from center", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 8);
      moveToLineCenter(viewModel);
      cursorEqual(viewModel, 1, 11);
    });
  });
  test("move to center of line from center", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 11);
      moveToLineCenter(viewModel);
      cursorEqual(viewModel, 1, 11);
    });
  });
  test("move to center of line from start", () => {
    executeTest((editor, viewModel) => {
      moveToLineStart(viewModel);
      moveToLineCenter(viewModel);
      cursorEqual(viewModel, 1, 11);
    });
  });
  test("move to center of line from end", () => {
    executeTest((editor, viewModel) => {
      moveToLineEnd(viewModel);
      moveToLineCenter(viewModel);
      cursorEqual(viewModel, 1, 11);
    });
  });
  test("move up by cursor move command", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 3, 5);
      cursorEqual(viewModel, 3, 5);
      moveUp(viewModel, 2);
      cursorEqual(viewModel, 1, 5);
      moveUp(viewModel, 1);
      cursorEqual(viewModel, 1, 1);
    });
  });
  test("move up by model line cursor move command", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 3, 5);
      cursorEqual(viewModel, 3, 5);
      moveUpByModelLine(viewModel, 2);
      cursorEqual(viewModel, 1, 5);
      moveUpByModelLine(viewModel, 1);
      cursorEqual(viewModel, 1, 1);
    });
  });
  test("move down by model line cursor move command", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 3, 5);
      cursorEqual(viewModel, 3, 5);
      moveDownByModelLine(viewModel, 2);
      cursorEqual(viewModel, 5, 2);
      moveDownByModelLine(viewModel, 1);
      cursorEqual(viewModel, 5, 2);
    });
  });
  test("move up with selection by cursor move command", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 3, 5);
      cursorEqual(viewModel, 3, 5);
      moveUp(viewModel, 1, true);
      cursorEqual(viewModel, 2, 2, 3, 5);
      moveUp(viewModel, 1, true);
      cursorEqual(viewModel, 1, 5, 3, 5);
    });
  });
  test("move up and down with tabs by cursor move command", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 1, 5);
      cursorEqual(viewModel, 1, 5);
      moveDown(viewModel, 4);
      cursorEqual(viewModel, 5, 2);
      moveUp(viewModel, 1);
      cursorEqual(viewModel, 4, 1);
      moveUp(viewModel, 1);
      cursorEqual(viewModel, 3, 5);
      moveUp(viewModel, 1);
      cursorEqual(viewModel, 2, 2);
      moveUp(viewModel, 1);
      cursorEqual(viewModel, 1, 5);
    });
  });
  test("move up and down with end of lines starting from a long one by cursor move command", () => {
    executeTest((editor, viewModel) => {
      moveToEndOfLine(viewModel);
      cursorEqual(viewModel, 1, 21);
      moveToEndOfLine(viewModel);
      cursorEqual(viewModel, 1, 21);
      moveDown(viewModel, 2);
      cursorEqual(viewModel, 3, 17);
      moveDown(viewModel, 1);
      cursorEqual(viewModel, 4, 1);
      moveDown(viewModel, 1);
      cursorEqual(viewModel, 5, 2);
      moveUp(viewModel, 4);
      cursorEqual(viewModel, 1, 21);
    });
  });
  test("move to view top line moves to first visible line if it is first line", () => {
    executeTest((editor, viewModel) => {
      viewModel.getCompletelyVisibleViewRange = () => new Range(1, 1, 10, 1);
      moveTo(viewModel, 2, 2);
      moveToTop(viewModel);
      cursorEqual(viewModel, 1, 6);
    });
  });
  test("move to view top line moves to top visible line when first line is not visible", () => {
    executeTest((editor, viewModel) => {
      viewModel.getCompletelyVisibleViewRange = () => new Range(2, 1, 10, 1);
      moveTo(viewModel, 4, 1);
      moveToTop(viewModel);
      cursorEqual(viewModel, 2, 2);
    });
  });
  test("move to view top line moves to nth line from top", () => {
    executeTest((editor, viewModel) => {
      viewModel.getCompletelyVisibleViewRange = () => new Range(1, 1, 10, 1);
      moveTo(viewModel, 4, 1);
      moveToTop(viewModel, 3);
      cursorEqual(viewModel, 3, 5);
    });
  });
  test("move to view top line moves to last line if n is greater than last visible line number", () => {
    executeTest((editor, viewModel) => {
      viewModel.getCompletelyVisibleViewRange = () => new Range(1, 1, 3, 1);
      moveTo(viewModel, 2, 2);
      moveToTop(viewModel, 4);
      cursorEqual(viewModel, 3, 5);
    });
  });
  test("move to view center line moves to the center line", () => {
    executeTest((editor, viewModel) => {
      viewModel.getCompletelyVisibleViewRange = () => new Range(3, 1, 3, 1);
      moveTo(viewModel, 2, 2);
      moveToCenter(viewModel);
      cursorEqual(viewModel, 3, 5);
    });
  });
  test("move to view bottom line moves to last visible line if it is last line", () => {
    executeTest((editor, viewModel) => {
      viewModel.getCompletelyVisibleViewRange = () => new Range(1, 1, 5, 1);
      moveTo(viewModel, 2, 2);
      moveToBottom(viewModel);
      cursorEqual(viewModel, 5, 1);
    });
  });
  test("move to view bottom line moves to last visible line when last line is not visible", () => {
    executeTest((editor, viewModel) => {
      viewModel.getCompletelyVisibleViewRange = () => new Range(2, 1, 3, 1);
      moveTo(viewModel, 2, 2);
      moveToBottom(viewModel);
      cursorEqual(viewModel, 3, 5);
    });
  });
  test("move to view bottom line moves to nth line from bottom", () => {
    executeTest((editor, viewModel) => {
      viewModel.getCompletelyVisibleViewRange = () => new Range(1, 1, 5, 1);
      moveTo(viewModel, 4, 1);
      moveToBottom(viewModel, 3);
      cursorEqual(viewModel, 3, 5);
    });
  });
  test("move to view bottom line moves to first line if n is lesser than first visible line number", () => {
    executeTest((editor, viewModel) => {
      viewModel.getCompletelyVisibleViewRange = () => new Range(2, 1, 5, 1);
      moveTo(viewModel, 4, 1);
      moveToBottom(viewModel, 5);
      cursorEqual(viewModel, 2, 2);
    });
  });
});
suite("Cursor move by blankline test", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const TEXT = [
    "    	My First Line	 ",
    "	My Second Line",
    "    Third Line\u{1F436}",
    "",
    "1",
    "2",
    "3",
    "",
    "         ",
    "a",
    "b"
  ].join("\n");
  function executeTest(callback) {
    withTestCodeEditor(TEXT, {}, (editor, viewModel) => {
      callback(editor, viewModel);
    });
  }
  test("move down should move to start of next blank line", () => {
    executeTest((editor, viewModel) => {
      moveDownByBlankLine(viewModel, false);
      cursorEqual(viewModel, 4, 1);
    });
  });
  test("move up should move to start of previous blank line", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 7, 1);
      moveUpByBlankLine(viewModel, false);
      cursorEqual(viewModel, 4, 1);
    });
  });
  test("move down should skip over whitespace if already on blank line", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 8, 1);
      moveDownByBlankLine(viewModel, false);
      cursorEqual(viewModel, 11, 1);
    });
  });
  test("move up should skip over whitespace if already on blank line", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 9, 1);
      moveUpByBlankLine(viewModel, false);
      cursorEqual(viewModel, 4, 1);
    });
  });
  test("move up should go to first column of first line if not empty", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 2, 1);
      moveUpByBlankLine(viewModel, false);
      cursorEqual(viewModel, 1, 1);
    });
  });
  test("move down should go to first column of last line if not empty", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 10, 1);
      moveDownByBlankLine(viewModel, false);
      cursorEqual(viewModel, 11, 1);
    });
  });
  test("select down should select to start of next blank line", () => {
    executeTest((editor, viewModel) => {
      moveDownByBlankLine(viewModel, true);
      selectionEqual(viewModel.getSelection(), 4, 1, 1, 1);
    });
  });
  test("select up should select to start of previous blank line", () => {
    executeTest((editor, viewModel) => {
      moveTo(viewModel, 7, 1);
      moveUpByBlankLine(viewModel, true);
      selectionEqual(viewModel.getSelection(), 4, 1, 7, 1);
    });
  });
});
suite("Cursor move command - foldedLine unit", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function executeFoldTest(callback) {
    withTestCodeEditor([
      "line1",
      "line2",
      "line3",
      "line4",
      "line5"
    ].join("\n"), {}, (editor, viewModel) => {
      callback(editor, viewModel);
    });
  }
  test("move down by foldedLine skips a fold below the cursor", () => {
    executeFoldTest((editor, viewModel) => {
      viewModel.setHiddenAreas([new Range(4, 1, 4, 1)]);
      moveTo(viewModel, 2, 1);
      moveDownByFoldedLine(viewModel);
      cursorEqual(viewModel, 3, 1);
      moveDownByFoldedLine(viewModel);
      cursorEqual(viewModel, 5, 1);
    });
  });
  test("move up by foldedLine skips a fold above the cursor", () => {
    executeFoldTest((editor, viewModel) => {
      viewModel.setHiddenAreas([new Range(3, 1, 3, 1)]);
      moveTo(viewModel, 4, 1);
      moveUpByFoldedLine(viewModel);
      cursorEqual(viewModel, 2, 1);
      moveUpByFoldedLine(viewModel);
      cursorEqual(viewModel, 1, 1);
    });
  });
  test("move down by foldedLine with count treats each fold as one step", () => {
    executeFoldTest((editor, viewModel) => {
      viewModel.setHiddenAreas([new Range(3, 1, 3, 1)]);
      moveTo(viewModel, 1, 1);
      moveDownByFoldedLine(viewModel, 3);
      cursorEqual(viewModel, 5, 1);
    });
  });
  test("move down by foldedLine skips a multi-line fold as one step", () => {
    executeFoldTest((editor, viewModel) => {
      viewModel.setHiddenAreas([new Range(2, 1, 4, 1)]);
      moveTo(viewModel, 1, 1);
      moveDownByFoldedLine(viewModel);
      cursorEqual(viewModel, 5, 1);
    });
  });
  test("move down by foldedLine at last line stays at last line", () => {
    executeFoldTest((editor, viewModel) => {
      moveTo(viewModel, 5, 1);
      moveDownByFoldedLine(viewModel);
      cursorEqual(viewModel, 5, 1);
    });
  });
  test("move up by foldedLine at first line stays at first line", () => {
    executeFoldTest((editor, viewModel) => {
      moveTo(viewModel, 1, 1);
      moveUpByFoldedLine(viewModel);
      cursorEqual(viewModel, 1, 1);
    });
  });
  test("move down by foldedLine with count clamps to last visible line after fold", () => {
    executeFoldTest((editor, viewModel) => {
      viewModel.setHiddenAreas([new Range(2, 1, 4, 1)]);
      moveTo(viewModel, 1, 1);
      moveDownByFoldedLine(viewModel, 2);
      cursorEqual(viewModel, 5, 1);
    });
  });
  test("move up by foldedLine with count clamps to first visible line before fold", () => {
    executeFoldTest((editor, viewModel) => {
      viewModel.setHiddenAreas([new Range(2, 1, 4, 1)]);
      moveTo(viewModel, 5, 1);
      moveUpByFoldedLine(viewModel, 2);
      cursorEqual(viewModel, 1, 1);
    });
  });
});
function move(viewModel, args) {
  CoreNavigationCommands.CursorMove.runCoreEditorCommand(viewModel, args);
}
function moveToLineStart(viewModel) {
  move(viewModel, { to: CursorMove.RawDirection.WrappedLineStart });
}
function moveToLineFirstNonWhitespaceCharacter(viewModel) {
  move(viewModel, { to: CursorMove.RawDirection.WrappedLineFirstNonWhitespaceCharacter });
}
function moveToLineCenter(viewModel) {
  move(viewModel, { to: CursorMove.RawDirection.WrappedLineColumnCenter });
}
function moveToLineEnd(viewModel) {
  move(viewModel, { to: CursorMove.RawDirection.WrappedLineEnd });
}
function moveToLineLastNonWhitespaceCharacter(viewModel) {
  move(viewModel, { to: CursorMove.RawDirection.WrappedLineLastNonWhitespaceCharacter });
}
function moveLeft(viewModel, value, by, select) {
  move(viewModel, { to: CursorMove.RawDirection.Left, by, value, select });
}
function moveRight(viewModel, value, by, select) {
  move(viewModel, { to: CursorMove.RawDirection.Right, by, value, select });
}
function moveUp(viewModel, noOfLines = 1, select) {
  move(viewModel, { to: CursorMove.RawDirection.Up, by: CursorMove.RawUnit.WrappedLine, value: noOfLines, select });
}
function moveUpByBlankLine(viewModel, select) {
  move(viewModel, { to: CursorMove.RawDirection.PrevBlankLine, by: CursorMove.RawUnit.WrappedLine, select });
}
function moveUpByModelLine(viewModel, noOfLines = 1, select) {
  move(viewModel, { to: CursorMove.RawDirection.Up, value: noOfLines, select });
}
function moveDown(viewModel, noOfLines = 1, select) {
  move(viewModel, { to: CursorMove.RawDirection.Down, by: CursorMove.RawUnit.WrappedLine, value: noOfLines, select });
}
function moveDownByBlankLine(viewModel, select) {
  move(viewModel, { to: CursorMove.RawDirection.NextBlankLine, by: CursorMove.RawUnit.WrappedLine, select });
}
function moveDownByModelLine(viewModel, noOfLines = 1, select) {
  move(viewModel, { to: CursorMove.RawDirection.Down, value: noOfLines, select });
}
function moveDownByFoldedLine(viewModel, noOfLines = 1, select) {
  move(viewModel, { to: CursorMove.RawDirection.Down, by: CursorMove.RawUnit.FoldedLine, value: noOfLines, select });
}
function moveUpByFoldedLine(viewModel, noOfLines = 1, select) {
  move(viewModel, { to: CursorMove.RawDirection.Up, by: CursorMove.RawUnit.FoldedLine, value: noOfLines, select });
}
function moveToTop(viewModel, noOfLines = 1, select) {
  move(viewModel, { to: CursorMove.RawDirection.ViewPortTop, value: noOfLines, select });
}
function moveToCenter(viewModel, select) {
  move(viewModel, { to: CursorMove.RawDirection.ViewPortCenter, select });
}
function moveToBottom(viewModel, noOfLines = 1, select) {
  move(viewModel, { to: CursorMove.RawDirection.ViewPortBottom, value: noOfLines, select });
}
function cursorEqual(viewModel, posLineNumber, posColumn, selLineNumber = posLineNumber, selColumn = posColumn) {
  positionEqual(viewModel.getPosition(), posLineNumber, posColumn);
  selectionEqual(viewModel.getSelection(), posLineNumber, posColumn, selLineNumber, selColumn);
}
function positionEqual(position, lineNumber, column) {
  assert.deepStrictEqual(position, new Position(lineNumber, column), "position equal");
}
function selectionEqual(selection, posLineNumber, posColumn, selLineNumber, selColumn) {
  assert.deepStrictEqual({
    selectionStartLineNumber: selection.selectionStartLineNumber,
    selectionStartColumn: selection.selectionStartColumn,
    positionLineNumber: selection.positionLineNumber,
    positionColumn: selection.positionColumn
  }, {
    selectionStartLineNumber: selLineNumber,
    selectionStartColumn: selColumn,
    positionLineNumber: posLineNumber,
    positionColumn: posColumn
  }, "selection equal");
}
function moveTo(viewModel, lineNumber, column, inSelectionMode = false) {
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
function moveToEndOfLine(viewModel, inSelectionMode = false) {
  if (inSelectionMode) {
    CoreNavigationCommands.CursorEndSelect.runCoreEditorCommand(viewModel, {});
  } else {
    CoreNavigationCommands.CursorEnd.runCoreEditorCommand(viewModel, {});
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXHRlc3RcXGJyb3dzZXJcXGNvbnRyb2xsZXJcXGN1cnNvck1vdmVDb21tYW5kLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NvcmVDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IEN1cnNvck1vdmUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY3Vyc29yL2N1cnNvck1vdmVDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld01vZGVsL3ZpZXdNb2RlbEltcGwuanMnO1xuaW1wb3J0IHsgSVRlc3RDb2RlRWRpdG9yLCB3aXRoVGVzdENvZGVFZGl0b3IgfSBmcm9tICcuLi90ZXN0Q29kZUVkaXRvci5qcyc7XG5cbnN1aXRlKCdDdXJzb3IgbW92ZSBjb21tYW5kIHRlc3QnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgVEVYVCA9IFtcblx0XHQnICAgIFxcdE15IEZpcnN0IExpbmVcXHQgJyxcblx0XHQnXFx0TXkgU2Vjb25kIExpbmUnLFxuXHRcdCcgICAgVGhpcmQgTGluZVx1RDgzRFx1REMzNicsXG5cdFx0JycsXG5cdFx0JzEnXG5cdF0uam9pbignXFxuJyk7XG5cblx0ZnVuY3Rpb24gZXhlY3V0ZVRlc3QoY2FsbGJhY2s6IChlZGl0b3I6IElUZXN0Q29kZUVkaXRvciwgdmlld01vZGVsOiBWaWV3TW9kZWwpID0+IHZvaWQpOiB2b2lkIHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoVEVYVCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Y2FsbGJhY2soZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdH0pO1xuXHR9XG5cblx0dGVzdCgnbW92ZSBsZWZ0IHNob3VsZCBtb3ZlIHRvIGxlZnQgY2hhcmFjdGVyJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMSwgOCk7XG5cdFx0XHRtb3ZlTGVmdCh2aWV3TW9kZWwpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCA3KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSBsZWZ0IHNob3VsZCBtb3ZlIHRvIGxlZnQgYnkgbiBjaGFyYWN0ZXJzJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMSwgOCk7XG5cdFx0XHRtb3ZlTGVmdCh2aWV3TW9kZWwsIDMpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCA1KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSBsZWZ0IHNob3VsZCBtb3ZlIHRvIGxlZnQgYnkgaGFsZiBsaW5lJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMSwgOCk7XG5cdFx0XHRtb3ZlTGVmdCh2aWV3TW9kZWwsIDEsIEN1cnNvck1vdmUuUmF3VW5pdC5IYWxmTGluZSk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDEsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIGxlZnQgbW92ZXMgdG8gcHJldmlvdXMgbGluZScsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDIsIDMpO1xuXHRcdFx0bW92ZUxlZnQodmlld01vZGVsLCAxMCk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDEsIDIxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSByaWdodCBzaG91bGQgbW92ZSB0byByaWdodCBjaGFyYWN0ZXInLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCAxLCA1KTtcblx0XHRcdG1vdmVSaWdodCh2aWV3TW9kZWwpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCA2KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSByaWdodCBzaG91bGQgbW92ZSB0byByaWdodCBieSBuIGNoYXJhY3RlcnMnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCAxLCAyKTtcblx0XHRcdG1vdmVSaWdodCh2aWV3TW9kZWwsIDYpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCA4KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSByaWdodCBzaG91bGQgbW92ZSB0byByaWdodCBieSBoYWxmIGxpbmUnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCAxLCA0KTtcblx0XHRcdG1vdmVSaWdodCh2aWV3TW9kZWwsIDEsIEN1cnNvck1vdmUuUmF3VW5pdC5IYWxmTGluZSk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDEsIDE0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSByaWdodCBtb3ZlcyB0byBuZXh0IGxpbmUnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCAxLCA4KTtcblx0XHRcdG1vdmVSaWdodCh2aWV3TW9kZWwsIDEwMCk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDIsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGZpcnN0IGNoYXJhY3RlciBvZiBsaW5lIGZyb20gbWlkZGxlJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMSwgOCk7XG5cdFx0XHRtb3ZlVG9MaW5lU3RhcnQodmlld01vZGVsKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gZmlyc3QgY2hhcmFjdGVyIG9mIGxpbmUgZnJvbSBmaXJzdCBub24gd2hpdGUgc3BhY2UgY2hhcmFjdGVyJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMSwgNik7XG5cdFx0XHRtb3ZlVG9MaW5lU3RhcnQodmlld01vZGVsKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gZmlyc3QgY2hhcmFjdGVyIG9mIGxpbmUgZnJvbSBmaXJzdCBjaGFyYWN0ZXInLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCAxLCAxKTtcblx0XHRcdG1vdmVUb0xpbmVTdGFydCh2aWV3TW9kZWwpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCAxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBmaXJzdCBub24gd2hpdGUgc3BhY2UgY2hhcmFjdGVyIG9mIGxpbmUgZnJvbSBtaWRkbGUnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCAxLCA4KTtcblx0XHRcdG1vdmVUb0xpbmVGaXJzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXIodmlld01vZGVsKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgNik7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gZmlyc3Qgbm9uIHdoaXRlIHNwYWNlIGNoYXJhY3RlciBvZiBsaW5lIGZyb20gZmlyc3Qgbm9uIHdoaXRlIHNwYWNlIGNoYXJhY3RlcicsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDEsIDYpO1xuXHRcdFx0bW92ZVRvTGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNoYXJhY3Rlcih2aWV3TW9kZWwpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCA2KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBmaXJzdCBub24gd2hpdGUgc3BhY2UgY2hhcmFjdGVyIG9mIGxpbmUgZnJvbSBmaXJzdCBjaGFyYWN0ZXInLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCAxLCAxKTtcblx0XHRcdG1vdmVUb0xpbmVGaXJzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXIodmlld01vZGVsKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgNik7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gZW5kIG9mIGxpbmUgZnJvbSBtaWRkbGUnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCAxLCA4KTtcblx0XHRcdG1vdmVUb0xpbmVFbmQodmlld01vZGVsKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgMjEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGVuZCBvZiBsaW5lIGZyb20gbGFzdCBub24gd2hpdGUgc3BhY2UgY2hhcmFjdGVyJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMSwgMTkpO1xuXHRcdFx0bW92ZVRvTGluZUVuZCh2aWV3TW9kZWwpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCAyMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gZW5kIG9mIGxpbmUgZnJvbSBsaW5lIGVuZCcsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDEsIDIxKTtcblx0XHRcdG1vdmVUb0xpbmVFbmQodmlld01vZGVsKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgMjEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGxhc3Qgbm9uIHdoaXRlIHNwYWNlIGNoYXJhY3RlciBmcm9tIG1pZGRsZScsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDEsIDgpO1xuXHRcdFx0bW92ZVRvTGluZUxhc3ROb25XaGl0ZXNwYWNlQ2hhcmFjdGVyKHZpZXdNb2RlbCk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDEsIDE5KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBsYXN0IG5vbiB3aGl0ZSBzcGFjZSBjaGFyYWN0ZXIgZnJvbSBsYXN0IG5vbiB3aGl0ZSBzcGFjZSBjaGFyYWN0ZXInLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCAxLCAxOSk7XG5cdFx0XHRtb3ZlVG9MaW5lTGFzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXIodmlld01vZGVsKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgMTkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGxhc3Qgbm9uIHdoaXRlIHNwYWNlIGNoYXJhY3RlciBmcm9tIGxpbmUgZW5kJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMSwgMjEpO1xuXHRcdFx0bW92ZVRvTGluZUxhc3ROb25XaGl0ZXNwYWNlQ2hhcmFjdGVyKHZpZXdNb2RlbCk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDEsIDE5KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byBjZW50ZXIgb2YgbGluZSBub3QgZnJvbSBjZW50ZXInLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCAxLCA4KTtcblx0XHRcdG1vdmVUb0xpbmVDZW50ZXIodmlld01vZGVsKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgMTEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIGNlbnRlciBvZiBsaW5lIGZyb20gY2VudGVyJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMSwgMTEpO1xuXHRcdFx0bW92ZVRvTGluZUNlbnRlcih2aWV3TW9kZWwpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCAxMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gY2VudGVyIG9mIGxpbmUgZnJvbSBzdGFydCcsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUb0xpbmVTdGFydCh2aWV3TW9kZWwpO1xuXHRcdFx0bW92ZVRvTGluZUNlbnRlcih2aWV3TW9kZWwpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCAxMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gY2VudGVyIG9mIGxpbmUgZnJvbSBlbmQnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG9MaW5lRW5kKHZpZXdNb2RlbCk7XG5cdFx0XHRtb3ZlVG9MaW5lQ2VudGVyKHZpZXdNb2RlbCk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDEsIDExKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB1cCBieSBjdXJzb3IgbW92ZSBjb21tYW5kJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMywgNSk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDMsIDUpO1xuXG5cdFx0XHRtb3ZlVXAodmlld01vZGVsLCAyKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgNSk7XG5cblx0XHRcdG1vdmVVcCh2aWV3TW9kZWwsIDEpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCAxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB1cCBieSBtb2RlbCBsaW5lIGN1cnNvciBtb3ZlIGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCAzLCA1KTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMywgNSk7XG5cblx0XHRcdG1vdmVVcEJ5TW9kZWxMaW5lKHZpZXdNb2RlbCwgMik7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDEsIDUpO1xuXG5cdFx0XHRtb3ZlVXBCeU1vZGVsTGluZSh2aWV3TW9kZWwsIDEpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCAxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSBkb3duIGJ5IG1vZGVsIGxpbmUgY3Vyc29yIG1vdmUgY29tbWFuZCcsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDMsIDUpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAzLCA1KTtcblxuXHRcdFx0bW92ZURvd25CeU1vZGVsTGluZSh2aWV3TW9kZWwsIDIpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCA1LCAyKTtcblxuXHRcdFx0bW92ZURvd25CeU1vZGVsTGluZSh2aWV3TW9kZWwsIDEpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCA1LCAyKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB1cCB3aXRoIHNlbGVjdGlvbiBieSBjdXJzb3IgbW92ZSBjb21tYW5kJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMywgNSk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDMsIDUpO1xuXG5cdFx0XHRtb3ZlVXAodmlld01vZGVsLCAxLCB0cnVlKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMiwgMiwgMywgNSk7XG5cblx0XHRcdG1vdmVVcCh2aWV3TW9kZWwsIDEsIHRydWUpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCA1LCAzLCA1KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB1cCBhbmQgZG93biB3aXRoIHRhYnMgYnkgY3Vyc29yIG1vdmUgY29tbWFuZCcsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDEsIDUpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCA1KTtcblxuXHRcdFx0bW92ZURvd24odmlld01vZGVsLCA0KTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgNSwgMik7XG5cblx0XHRcdG1vdmVVcCh2aWV3TW9kZWwsIDEpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCA0LCAxKTtcblxuXHRcdFx0bW92ZVVwKHZpZXdNb2RlbCwgMSk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDMsIDUpO1xuXG5cdFx0XHRtb3ZlVXAodmlld01vZGVsLCAxKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMiwgMik7XG5cblx0XHRcdG1vdmVVcCh2aWV3TW9kZWwsIDEpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCA1KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB1cCBhbmQgZG93biB3aXRoIGVuZCBvZiBsaW5lcyBzdGFydGluZyBmcm9tIGEgbG9uZyBvbmUgYnkgY3Vyc29yIG1vdmUgY29tbWFuZCcsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUb0VuZE9mTGluZSh2aWV3TW9kZWwpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCAyMSk7XG5cblx0XHRcdG1vdmVUb0VuZE9mTGluZSh2aWV3TW9kZWwpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCAyMSk7XG5cblx0XHRcdG1vdmVEb3duKHZpZXdNb2RlbCwgMik7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDMsIDE3KTtcblxuXHRcdFx0bW92ZURvd24odmlld01vZGVsLCAxKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgNCwgMSk7XG5cblx0XHRcdG1vdmVEb3duKHZpZXdNb2RlbCwgMSk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDUsIDIpO1xuXG5cdFx0XHRtb3ZlVXAodmlld01vZGVsLCA0KTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgMjEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIHZpZXcgdG9wIGxpbmUgbW92ZXMgdG8gZmlyc3QgdmlzaWJsZSBsaW5lIGlmIGl0IGlzIGZpcnN0IGxpbmUnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuZ2V0Q29tcGxldGVseVZpc2libGVWaWV3UmFuZ2UgPSAoKSA9PiBuZXcgUmFuZ2UoMSwgMSwgMTAsIDEpO1xuXG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCAyLCAyKTtcblx0XHRcdG1vdmVUb1RvcCh2aWV3TW9kZWwpO1xuXG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDEsIDYpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIHZpZXcgdG9wIGxpbmUgbW92ZXMgdG8gdG9wIHZpc2libGUgbGluZSB3aGVuIGZpcnN0IGxpbmUgaXMgbm90IHZpc2libGUnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuZ2V0Q29tcGxldGVseVZpc2libGVWaWV3UmFuZ2UgPSAoKSA9PiBuZXcgUmFuZ2UoMiwgMSwgMTAsIDEpO1xuXG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCA0LCAxKTtcblx0XHRcdG1vdmVUb1RvcCh2aWV3TW9kZWwpO1xuXG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDIsIDIpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIHZpZXcgdG9wIGxpbmUgbW92ZXMgdG8gbnRoIGxpbmUgZnJvbSB0b3AnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuZ2V0Q29tcGxldGVseVZpc2libGVWaWV3UmFuZ2UgPSAoKSA9PiBuZXcgUmFuZ2UoMSwgMSwgMTAsIDEpO1xuXG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCA0LCAxKTtcblx0XHRcdG1vdmVUb1RvcCh2aWV3TW9kZWwsIDMpO1xuXG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDMsIDUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIHZpZXcgdG9wIGxpbmUgbW92ZXMgdG8gbGFzdCBsaW5lIGlmIG4gaXMgZ3JlYXRlciB0aGFuIGxhc3QgdmlzaWJsZSBsaW5lIG51bWJlcicsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5nZXRDb21wbGV0ZWx5VmlzaWJsZVZpZXdSYW5nZSA9ICgpID0+IG5ldyBSYW5nZSgxLCAxLCAzLCAxKTtcblxuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMiwgMik7XG5cdFx0XHRtb3ZlVG9Ub3Aodmlld01vZGVsLCA0KTtcblxuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAzLCA1KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byB2aWV3IGNlbnRlciBsaW5lIG1vdmVzIHRvIHRoZSBjZW50ZXIgbGluZScsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5nZXRDb21wbGV0ZWx5VmlzaWJsZVZpZXdSYW5nZSA9ICgpID0+IG5ldyBSYW5nZSgzLCAxLCAzLCAxKTtcblxuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMiwgMik7XG5cdFx0XHRtb3ZlVG9DZW50ZXIodmlld01vZGVsKTtcblxuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAzLCA1KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byB2aWV3IGJvdHRvbSBsaW5lIG1vdmVzIHRvIGxhc3QgdmlzaWJsZSBsaW5lIGlmIGl0IGlzIGxhc3QgbGluZScsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5nZXRDb21wbGV0ZWx5VmlzaWJsZVZpZXdSYW5nZSA9ICgpID0+IG5ldyBSYW5nZSgxLCAxLCA1LCAxKTtcblxuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMiwgMik7XG5cdFx0XHRtb3ZlVG9Cb3R0b20odmlld01vZGVsKTtcblxuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCA1LCAxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB0byB2aWV3IGJvdHRvbSBsaW5lIG1vdmVzIHRvIGxhc3QgdmlzaWJsZSBsaW5lIHdoZW4gbGFzdCBsaW5lIGlzIG5vdCB2aXNpYmxlJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0dmlld01vZGVsLmdldENvbXBsZXRlbHlWaXNpYmxlVmlld1JhbmdlID0gKCkgPT4gbmV3IFJhbmdlKDIsIDEsIDMsIDEpO1xuXG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCAyLCAyKTtcblx0XHRcdG1vdmVUb0JvdHRvbSh2aWV3TW9kZWwpO1xuXG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDMsIDUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHRvIHZpZXcgYm90dG9tIGxpbmUgbW92ZXMgdG8gbnRoIGxpbmUgZnJvbSBib3R0b20nLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHR2aWV3TW9kZWwuZ2V0Q29tcGxldGVseVZpc2libGVWaWV3UmFuZ2UgPSAoKSA9PiBuZXcgUmFuZ2UoMSwgMSwgNSwgMSk7XG5cblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDQsIDEpO1xuXHRcdFx0bW92ZVRvQm90dG9tKHZpZXdNb2RlbCwgMyk7XG5cblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMywgNSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdG8gdmlldyBib3R0b20gbGluZSBtb3ZlcyB0byBmaXJzdCBsaW5lIGlmIG4gaXMgbGVzc2VyIHRoYW4gZmlyc3QgdmlzaWJsZSBsaW5lIG51bWJlcicsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdHZpZXdNb2RlbC5nZXRDb21wbGV0ZWx5VmlzaWJsZVZpZXdSYW5nZSA9ICgpID0+IG5ldyBSYW5nZSgyLCAxLCA1LCAxKTtcblxuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgNCwgMSk7XG5cdFx0XHRtb3ZlVG9Cb3R0b20odmlld01vZGVsLCA1KTtcblxuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAyLCAyKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0N1cnNvciBtb3ZlIGJ5IGJsYW5rbGluZSB0ZXN0JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IFRFWFQgPSBbXG5cdFx0JyAgICBcXHRNeSBGaXJzdCBMaW5lXFx0ICcsXG5cdFx0J1xcdE15IFNlY29uZCBMaW5lJyxcblx0XHQnICAgIFRoaXJkIExpbmVcdUQ4M0RcdURDMzYnLFxuXHRcdCcnLFxuXHRcdCcxJyxcblx0XHQnMicsXG5cdFx0JzMnLFxuXHRcdCcnLFxuXHRcdCcgICAgICAgICAnLFxuXHRcdCdhJyxcblx0XHQnYicsXG5cdF0uam9pbignXFxuJyk7XG5cblx0ZnVuY3Rpb24gZXhlY3V0ZVRlc3QoY2FsbGJhY2s6IChlZGl0b3I6IElUZXN0Q29kZUVkaXRvciwgdmlld01vZGVsOiBWaWV3TW9kZWwpID0+IHZvaWQpOiB2b2lkIHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoVEVYVCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Y2FsbGJhY2soZWRpdG9yLCB2aWV3TW9kZWwpO1xuXHRcdH0pO1xuXHR9XG5cblx0dGVzdCgnbW92ZSBkb3duIHNob3VsZCBtb3ZlIHRvIHN0YXJ0IG9mIG5leHQgYmxhbmsgbGluZScsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVEb3duQnlCbGFua0xpbmUodmlld01vZGVsLCBmYWxzZSk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDQsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHVwIHNob3VsZCBtb3ZlIHRvIHN0YXJ0IG9mIHByZXZpb3VzIGJsYW5rIGxpbmUnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCA3LCAxKTtcblx0XHRcdG1vdmVVcEJ5QmxhbmtMaW5lKHZpZXdNb2RlbCwgZmFsc2UpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCA0LCAxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSBkb3duIHNob3VsZCBza2lwIG92ZXIgd2hpdGVzcGFjZSBpZiBhbHJlYWR5IG9uIGJsYW5rIGxpbmUnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCA4LCAxKTtcblx0XHRcdG1vdmVEb3duQnlCbGFua0xpbmUodmlld01vZGVsLCBmYWxzZSk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDExLCAxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSB1cCBzaG91bGQgc2tpcCBvdmVyIHdoaXRlc3BhY2UgaWYgYWxyZWFkeSBvbiBibGFuayBsaW5lJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgOSwgMSk7XG5cdFx0XHRtb3ZlVXBCeUJsYW5rTGluZSh2aWV3TW9kZWwsIGZhbHNlKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgNCwgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdXAgc2hvdWxkIGdvIHRvIGZpcnN0IGNvbHVtbiBvZiBmaXJzdCBsaW5lIGlmIG5vdCBlbXB0eScsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDIsIDEpO1xuXHRcdFx0bW92ZVVwQnlCbGFua0xpbmUodmlld01vZGVsLCBmYWxzZSk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDEsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIGRvd24gc2hvdWxkIGdvIHRvIGZpcnN0IGNvbHVtbiBvZiBsYXN0IGxpbmUgaWYgbm90IGVtcHR5JywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMTAsIDEpO1xuXHRcdFx0bW92ZURvd25CeUJsYW5rTGluZSh2aWV3TW9kZWwsIGZhbHNlKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMTEsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZWxlY3QgZG93biBzaG91bGQgc2VsZWN0IHRvIHN0YXJ0IG9mIG5leHQgYmxhbmsgbGluZScsICgpID0+IHtcblx0XHRleGVjdXRlVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVEb3duQnlCbGFua0xpbmUodmlld01vZGVsLCB0cnVlKTtcblx0XHRcdHNlbGVjdGlvbkVxdWFsKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb24oKSwgNCwgMSwgMSwgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbGVjdCB1cCBzaG91bGQgc2VsZWN0IHRvIHN0YXJ0IG9mIHByZXZpb3VzIGJsYW5rIGxpbmUnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZVRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCA3LCAxKTtcblx0XHRcdG1vdmVVcEJ5QmxhbmtMaW5lKHZpZXdNb2RlbCwgdHJ1ZSk7XG5cdFx0XHRzZWxlY3Rpb25FcXVhbCh2aWV3TW9kZWwuZ2V0U2VsZWN0aW9uKCksIDQsIDEsIDcsIDEpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG4vLyBUZXN0cyBmb3IgJ2ZvbGRlZExpbmUnIHVuaXQ6IG1vdmVzIGJ5IG1vZGVsIGxpbmVzIGJ1dCB0cmVhdHMgZWFjaCBmb2xkIGFzIGEgc2luZ2xlIHN0ZXAuXG4vLyBUaGlzIGlzIHRoZSBzZW1hbnRpY3MgcmVxdWlyZWQgYnkgdmltJ3Mgai9rOiBtb3ZlIHRocm91Z2ggdmlzaWJsZSBsaW5lcywgc2tpcCBoaWRkZW4gb25lcy5cblxuc3VpdGUoJ0N1cnNvciBtb3ZlIGNvbW1hbmQgLSBmb2xkZWRMaW5lIHVuaXQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gZXhlY3V0ZUZvbGRUZXN0KGNhbGxiYWNrOiAoZWRpdG9yOiBJVGVzdENvZGVFZGl0b3IsIHZpZXdNb2RlbDogVmlld01vZGVsKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdCdsaW5lMScsXG5cdFx0XHQnbGluZTInLFxuXHRcdFx0J2xpbmUzJyxcblx0XHRcdCdsaW5lNCcsXG5cdFx0XHQnbGluZTUnLFxuXHRcdF0uam9pbignXFxuJyksIHt9LCAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGNhbGxiYWNrKGVkaXRvciwgdmlld01vZGVsKTtcblx0XHR9KTtcblx0fVxuXG5cdHRlc3QoJ21vdmUgZG93biBieSBmb2xkZWRMaW5lIHNraXBzIGEgZm9sZCBiZWxvdyB0aGUgY3Vyc29yJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVGb2xkVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdC8vIExpbmUgNCBpcyBoaWRkZW4gKGZvbGRlZCB1bmRlciBsaW5lIDMgYXMgaGVhZGVyKVxuXHRcdFx0dmlld01vZGVsLnNldEhpZGRlbkFyZWFzKFtuZXcgUmFuZ2UoNCwgMSwgNCwgMSldKTtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDIsIDEpO1xuXHRcdFx0Ly8gaiBmcm9tIGxpbmUgMiBcdTIxOTIgbGluZSAzICh2aXNpYmxlIGZvbGQgaGVhZGVyKVxuXHRcdFx0bW92ZURvd25CeUZvbGRlZExpbmUodmlld01vZGVsKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMywgMSk7XG5cdFx0XHQvLyBqIGZyb20gbGluZSAzIChmb2xkIGhlYWRlcikgXHUyMTkyIGxpbmUgNCBpcyBoaWRkZW4sIGxhbmRzIG9uIGxpbmUgNVxuXHRcdFx0bW92ZURvd25CeUZvbGRlZExpbmUodmlld01vZGVsKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgNSwgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdXAgYnkgZm9sZGVkTGluZSBza2lwcyBhIGZvbGQgYWJvdmUgdGhlIGN1cnNvcicsICgpID0+IHtcblx0XHRleGVjdXRlRm9sZFRlc3QoKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHQvLyBMaW5lIDMgaXMgaGlkZGVuIChmb2xkZWQgdW5kZXIgbGluZSAyIGFzIGhlYWRlcilcblx0XHRcdHZpZXdNb2RlbC5zZXRIaWRkZW5BcmVhcyhbbmV3IFJhbmdlKDMsIDEsIDMsIDEpXSk7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCA0LCAxKTtcblx0XHRcdC8vIGsgZnJvbSBsaW5lIDQ6IGxpbmUgMyBpcyBoaWRkZW4sIGxhbmRzIG9uIGxpbmUgMiAoZm9sZCBoZWFkZXIpXG5cdFx0XHRtb3ZlVXBCeUZvbGRlZExpbmUodmlld01vZGVsKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMiwgMSk7XG5cdFx0XHQvLyBrIGZyb20gbGluZSAyIFx1MjE5MiBsaW5lIDFcblx0XHRcdG1vdmVVcEJ5Rm9sZGVkTGluZSh2aWV3TW9kZWwpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCAxLCAxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSBkb3duIGJ5IGZvbGRlZExpbmUgd2l0aCBjb3VudCB0cmVhdHMgZWFjaCBmb2xkIGFzIG9uZSBzdGVwJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVGb2xkVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdC8vIExpbmUgMyBpcyBoaWRkZW5cblx0XHRcdHZpZXdNb2RlbC5zZXRIaWRkZW5BcmVhcyhbbmV3IFJhbmdlKDMsIDEsIDMsIDEpXSk7XG5cdFx0XHRtb3ZlVG8odmlld01vZGVsLCAxLCAxKTtcblx0XHRcdC8vIDNqIGZyb20gbGluZSAxOiBzdGVwMVx1MjE5MjIsIHN0ZXAyXHUyMTkyMyhoaWRkZW4pXHUyMTkyNCwgc3RlcDNcdTIxOTI1XG5cdFx0XHRtb3ZlRG93bkJ5Rm9sZGVkTGluZSh2aWV3TW9kZWwsIDMpO1xuXHRcdFx0Y3Vyc29yRXF1YWwodmlld01vZGVsLCA1LCAxKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW92ZSBkb3duIGJ5IGZvbGRlZExpbmUgc2tpcHMgYSBtdWx0aS1saW5lIGZvbGQgYXMgb25lIHN0ZXAnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZUZvbGRUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Ly8gTGluZXMgMi00IGFyZSBoaWRkZW4gKGZvbGRlZCB1bmRlciBsaW5lIDEgYXMgaGVhZGVyKVxuXHRcdFx0dmlld01vZGVsLnNldEhpZGRlbkFyZWFzKFtuZXcgUmFuZ2UoMiwgMSwgNCwgMSldKTtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDEsIDEpO1xuXHRcdFx0Ly8gaiBmcm9tIGxpbmUgMTogbGluZXMgMi00IGFyZSBhbGwgaGlkZGVuLCBsYW5kcyBkaXJlY3RseSBvbiBsaW5lIDVcblx0XHRcdG1vdmVEb3duQnlGb2xkZWRMaW5lKHZpZXdNb2RlbCk7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDUsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIGRvd24gYnkgZm9sZGVkTGluZSBhdCBsYXN0IGxpbmUgc3RheXMgYXQgbGFzdCBsaW5lJywgKCkgPT4ge1xuXHRcdGV4ZWN1dGVGb2xkVGVzdCgoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdG1vdmVUbyh2aWV3TW9kZWwsIDUsIDEpO1xuXHRcdFx0bW92ZURvd25CeUZvbGRlZExpbmUodmlld01vZGVsKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgNSwgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdXAgYnkgZm9sZGVkTGluZSBhdCBmaXJzdCBsaW5lIHN0YXlzIGF0IGZpcnN0IGxpbmUnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZUZvbGRUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMSwgMSk7XG5cdFx0XHRtb3ZlVXBCeUZvbGRlZExpbmUodmlld01vZGVsKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgMSwgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgZG93biBieSBmb2xkZWRMaW5lIHdpdGggY291bnQgY2xhbXBzIHRvIGxhc3QgdmlzaWJsZSBsaW5lIGFmdGVyIGZvbGQnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZUZvbGRUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Ly8gTGluZXMgMi00IGFyZSBoaWRkZW4uIFZpc2libGUgbGluZXMgYXJlIDEgYW5kIDUuXG5cdFx0XHR2aWV3TW9kZWwuc2V0SGlkZGVuQXJlYXMoW25ldyBSYW5nZSgyLCAxLCA0LCAxKV0pO1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgMSwgMSk7XG5cdFx0XHQvLyAyaiBzaG91bGQgbGFuZCBvbiBsaW5lIDUgYW5kIGNsYW1wIHRoZXJlLlxuXHRcdFx0bW92ZURvd25CeUZvbGRlZExpbmUodmlld01vZGVsLCAyKTtcblx0XHRcdGN1cnNvckVxdWFsKHZpZXdNb2RlbCwgNSwgMSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdXAgYnkgZm9sZGVkTGluZSB3aXRoIGNvdW50IGNsYW1wcyB0byBmaXJzdCB2aXNpYmxlIGxpbmUgYmVmb3JlIGZvbGQnLCAoKSA9PiB7XG5cdFx0ZXhlY3V0ZUZvbGRUZXN0KChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0Ly8gTGluZXMgMi00IGFyZSBoaWRkZW4uIFZpc2libGUgbGluZXMgYXJlIDEgYW5kIDUuXG5cdFx0XHR2aWV3TW9kZWwuc2V0SGlkZGVuQXJlYXMoW25ldyBSYW5nZSgyLCAxLCA0LCAxKV0pO1xuXHRcdFx0bW92ZVRvKHZpZXdNb2RlbCwgNSwgMSk7XG5cdFx0XHQvLyAyayBzaG91bGQgbGFuZCBvbiBsaW5lIDEgYW5kIGNsYW1wIHRoZXJlLlxuXHRcdFx0bW92ZVVwQnlGb2xkZWRMaW5lKHZpZXdNb2RlbCwgMik7XG5cdFx0XHRjdXJzb3JFcXVhbCh2aWV3TW9kZWwsIDEsIDEpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG4vLyBNb3ZlIGNvbW1hbmRcblxuZnVuY3Rpb24gbW92ZSh2aWV3TW9kZWw6IFZpZXdNb2RlbCwgYXJnczogYW55KSB7XG5cdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuQ3Vyc29yTW92ZS5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIGFyZ3MpO1xufVxuXG5mdW5jdGlvbiBtb3ZlVG9MaW5lU3RhcnQodmlld01vZGVsOiBWaWV3TW9kZWwpIHtcblx0bW92ZSh2aWV3TW9kZWwsIHsgdG86IEN1cnNvck1vdmUuUmF3RGlyZWN0aW9uLldyYXBwZWRMaW5lU3RhcnQgfSk7XG59XG5cbmZ1bmN0aW9uIG1vdmVUb0xpbmVGaXJzdE5vbldoaXRlc3BhY2VDaGFyYWN0ZXIodmlld01vZGVsOiBWaWV3TW9kZWwpIHtcblx0bW92ZSh2aWV3TW9kZWwsIHsgdG86IEN1cnNvck1vdmUuUmF3RGlyZWN0aW9uLldyYXBwZWRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ2hhcmFjdGVyIH0pO1xufVxuXG5mdW5jdGlvbiBtb3ZlVG9MaW5lQ2VudGVyKHZpZXdNb2RlbDogVmlld01vZGVsKSB7XG5cdG1vdmUodmlld01vZGVsLCB7IHRvOiBDdXJzb3JNb3ZlLlJhd0RpcmVjdGlvbi5XcmFwcGVkTGluZUNvbHVtbkNlbnRlciB9KTtcbn1cblxuZnVuY3Rpb24gbW92ZVRvTGluZUVuZCh2aWV3TW9kZWw6IFZpZXdNb2RlbCkge1xuXHRtb3ZlKHZpZXdNb2RlbCwgeyB0bzogQ3Vyc29yTW92ZS5SYXdEaXJlY3Rpb24uV3JhcHBlZExpbmVFbmQgfSk7XG59XG5cbmZ1bmN0aW9uIG1vdmVUb0xpbmVMYXN0Tm9uV2hpdGVzcGFjZUNoYXJhY3Rlcih2aWV3TW9kZWw6IFZpZXdNb2RlbCkge1xuXHRtb3ZlKHZpZXdNb2RlbCwgeyB0bzogQ3Vyc29yTW92ZS5SYXdEaXJlY3Rpb24uV3JhcHBlZExpbmVMYXN0Tm9uV2hpdGVzcGFjZUNoYXJhY3RlciB9KTtcbn1cblxuZnVuY3Rpb24gbW92ZUxlZnQodmlld01vZGVsOiBWaWV3TW9kZWwsIHZhbHVlPzogbnVtYmVyLCBieT86IHN0cmluZywgc2VsZWN0PzogYm9vbGVhbikge1xuXHRtb3ZlKHZpZXdNb2RlbCwgeyB0bzogQ3Vyc29yTW92ZS5SYXdEaXJlY3Rpb24uTGVmdCwgYnk6IGJ5LCB2YWx1ZTogdmFsdWUsIHNlbGVjdDogc2VsZWN0IH0pO1xufVxuXG5mdW5jdGlvbiBtb3ZlUmlnaHQodmlld01vZGVsOiBWaWV3TW9kZWwsIHZhbHVlPzogbnVtYmVyLCBieT86IHN0cmluZywgc2VsZWN0PzogYm9vbGVhbikge1xuXHRtb3ZlKHZpZXdNb2RlbCwgeyB0bzogQ3Vyc29yTW92ZS5SYXdEaXJlY3Rpb24uUmlnaHQsIGJ5OiBieSwgdmFsdWU6IHZhbHVlLCBzZWxlY3Q6IHNlbGVjdCB9KTtcbn1cblxuZnVuY3Rpb24gbW92ZVVwKHZpZXdNb2RlbDogVmlld01vZGVsLCBub09mTGluZXM6IG51bWJlciA9IDEsIHNlbGVjdD86IGJvb2xlYW4pIHtcblx0bW92ZSh2aWV3TW9kZWwsIHsgdG86IEN1cnNvck1vdmUuUmF3RGlyZWN0aW9uLlVwLCBieTogQ3Vyc29yTW92ZS5SYXdVbml0LldyYXBwZWRMaW5lLCB2YWx1ZTogbm9PZkxpbmVzLCBzZWxlY3Q6IHNlbGVjdCB9KTtcbn1cblxuZnVuY3Rpb24gbW92ZVVwQnlCbGFua0xpbmUodmlld01vZGVsOiBWaWV3TW9kZWwsIHNlbGVjdD86IGJvb2xlYW4pIHtcblx0bW92ZSh2aWV3TW9kZWwsIHsgdG86IEN1cnNvck1vdmUuUmF3RGlyZWN0aW9uLlByZXZCbGFua0xpbmUsIGJ5OiBDdXJzb3JNb3ZlLlJhd1VuaXQuV3JhcHBlZExpbmUsIHNlbGVjdDogc2VsZWN0IH0pO1xufVxuXG5mdW5jdGlvbiBtb3ZlVXBCeU1vZGVsTGluZSh2aWV3TW9kZWw6IFZpZXdNb2RlbCwgbm9PZkxpbmVzOiBudW1iZXIgPSAxLCBzZWxlY3Q/OiBib29sZWFuKSB7XG5cdG1vdmUodmlld01vZGVsLCB7IHRvOiBDdXJzb3JNb3ZlLlJhd0RpcmVjdGlvbi5VcCwgdmFsdWU6IG5vT2ZMaW5lcywgc2VsZWN0OiBzZWxlY3QgfSk7XG59XG5cbmZ1bmN0aW9uIG1vdmVEb3duKHZpZXdNb2RlbDogVmlld01vZGVsLCBub09mTGluZXM6IG51bWJlciA9IDEsIHNlbGVjdD86IGJvb2xlYW4pIHtcblx0bW92ZSh2aWV3TW9kZWwsIHsgdG86IEN1cnNvck1vdmUuUmF3RGlyZWN0aW9uLkRvd24sIGJ5OiBDdXJzb3JNb3ZlLlJhd1VuaXQuV3JhcHBlZExpbmUsIHZhbHVlOiBub09mTGluZXMsIHNlbGVjdDogc2VsZWN0IH0pO1xufVxuXG5mdW5jdGlvbiBtb3ZlRG93bkJ5QmxhbmtMaW5lKHZpZXdNb2RlbDogVmlld01vZGVsLCBzZWxlY3Q/OiBib29sZWFuKSB7XG5cdG1vdmUodmlld01vZGVsLCB7IHRvOiBDdXJzb3JNb3ZlLlJhd0RpcmVjdGlvbi5OZXh0QmxhbmtMaW5lLCBieTogQ3Vyc29yTW92ZS5SYXdVbml0LldyYXBwZWRMaW5lLCBzZWxlY3Q6IHNlbGVjdCB9KTtcbn1cblxuZnVuY3Rpb24gbW92ZURvd25CeU1vZGVsTGluZSh2aWV3TW9kZWw6IFZpZXdNb2RlbCwgbm9PZkxpbmVzOiBudW1iZXIgPSAxLCBzZWxlY3Q/OiBib29sZWFuKSB7XG5cdG1vdmUodmlld01vZGVsLCB7IHRvOiBDdXJzb3JNb3ZlLlJhd0RpcmVjdGlvbi5Eb3duLCB2YWx1ZTogbm9PZkxpbmVzLCBzZWxlY3Q6IHNlbGVjdCB9KTtcbn1cblxuZnVuY3Rpb24gbW92ZURvd25CeUZvbGRlZExpbmUodmlld01vZGVsOiBWaWV3TW9kZWwsIG5vT2ZMaW5lczogbnVtYmVyID0gMSwgc2VsZWN0PzogYm9vbGVhbikge1xuXHRtb3ZlKHZpZXdNb2RlbCwgeyB0bzogQ3Vyc29yTW92ZS5SYXdEaXJlY3Rpb24uRG93biwgYnk6IEN1cnNvck1vdmUuUmF3VW5pdC5Gb2xkZWRMaW5lLCB2YWx1ZTogbm9PZkxpbmVzLCBzZWxlY3Q6IHNlbGVjdCB9KTtcbn1cblxuZnVuY3Rpb24gbW92ZVVwQnlGb2xkZWRMaW5lKHZpZXdNb2RlbDogVmlld01vZGVsLCBub09mTGluZXM6IG51bWJlciA9IDEsIHNlbGVjdD86IGJvb2xlYW4pIHtcblx0bW92ZSh2aWV3TW9kZWwsIHsgdG86IEN1cnNvck1vdmUuUmF3RGlyZWN0aW9uLlVwLCBieTogQ3Vyc29yTW92ZS5SYXdVbml0LkZvbGRlZExpbmUsIHZhbHVlOiBub09mTGluZXMsIHNlbGVjdDogc2VsZWN0IH0pO1xufVxuXG5mdW5jdGlvbiBtb3ZlVG9Ub3Aodmlld01vZGVsOiBWaWV3TW9kZWwsIG5vT2ZMaW5lczogbnVtYmVyID0gMSwgc2VsZWN0PzogYm9vbGVhbikge1xuXHRtb3ZlKHZpZXdNb2RlbCwgeyB0bzogQ3Vyc29yTW92ZS5SYXdEaXJlY3Rpb24uVmlld1BvcnRUb3AsIHZhbHVlOiBub09mTGluZXMsIHNlbGVjdDogc2VsZWN0IH0pO1xufVxuXG5mdW5jdGlvbiBtb3ZlVG9DZW50ZXIodmlld01vZGVsOiBWaWV3TW9kZWwsIHNlbGVjdD86IGJvb2xlYW4pIHtcblx0bW92ZSh2aWV3TW9kZWwsIHsgdG86IEN1cnNvck1vdmUuUmF3RGlyZWN0aW9uLlZpZXdQb3J0Q2VudGVyLCBzZWxlY3Q6IHNlbGVjdCB9KTtcbn1cblxuZnVuY3Rpb24gbW92ZVRvQm90dG9tKHZpZXdNb2RlbDogVmlld01vZGVsLCBub09mTGluZXM6IG51bWJlciA9IDEsIHNlbGVjdD86IGJvb2xlYW4pIHtcblx0bW92ZSh2aWV3TW9kZWwsIHsgdG86IEN1cnNvck1vdmUuUmF3RGlyZWN0aW9uLlZpZXdQb3J0Qm90dG9tLCB2YWx1ZTogbm9PZkxpbmVzLCBzZWxlY3Q6IHNlbGVjdCB9KTtcbn1cblxuZnVuY3Rpb24gY3Vyc29yRXF1YWwodmlld01vZGVsOiBWaWV3TW9kZWwsIHBvc0xpbmVOdW1iZXI6IG51bWJlciwgcG9zQ29sdW1uOiBudW1iZXIsIHNlbExpbmVOdW1iZXI6IG51bWJlciA9IHBvc0xpbmVOdW1iZXIsIHNlbENvbHVtbjogbnVtYmVyID0gcG9zQ29sdW1uKSB7XG5cdHBvc2l0aW9uRXF1YWwodmlld01vZGVsLmdldFBvc2l0aW9uKCksIHBvc0xpbmVOdW1iZXIsIHBvc0NvbHVtbik7XG5cdHNlbGVjdGlvbkVxdWFsKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb24oKSwgcG9zTGluZU51bWJlciwgcG9zQ29sdW1uLCBzZWxMaW5lTnVtYmVyLCBzZWxDb2x1bW4pO1xufVxuXG5mdW5jdGlvbiBwb3NpdGlvbkVxdWFsKHBvc2l0aW9uOiBQb3NpdGlvbiwgbGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlcikge1xuXHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBvc2l0aW9uLCBuZXcgUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKSwgJ3Bvc2l0aW9uIGVxdWFsJyk7XG59XG5cbmZ1bmN0aW9uIHNlbGVjdGlvbkVxdWFsKHNlbGVjdGlvbjogU2VsZWN0aW9uLCBwb3NMaW5lTnVtYmVyOiBudW1iZXIsIHBvc0NvbHVtbjogbnVtYmVyLCBzZWxMaW5lTnVtYmVyOiBudW1iZXIsIHNlbENvbHVtbjogbnVtYmVyKSB7XG5cdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdHNlbGVjdGlvblN0YXJ0TGluZU51bWJlcjogc2VsZWN0aW9uLnNlbGVjdGlvblN0YXJ0TGluZU51bWJlcixcblx0XHRzZWxlY3Rpb25TdGFydENvbHVtbjogc2VsZWN0aW9uLnNlbGVjdGlvblN0YXJ0Q29sdW1uLFxuXHRcdHBvc2l0aW9uTGluZU51bWJlcjogc2VsZWN0aW9uLnBvc2l0aW9uTGluZU51bWJlcixcblx0XHRwb3NpdGlvbkNvbHVtbjogc2VsZWN0aW9uLnBvc2l0aW9uQ29sdW1uXG5cdH0sIHtcblx0XHRzZWxlY3Rpb25TdGFydExpbmVOdW1iZXI6IHNlbExpbmVOdW1iZXIsXG5cdFx0c2VsZWN0aW9uU3RhcnRDb2x1bW46IHNlbENvbHVtbixcblx0XHRwb3NpdGlvbkxpbmVOdW1iZXI6IHBvc0xpbmVOdW1iZXIsXG5cdFx0cG9zaXRpb25Db2x1bW46IHBvc0NvbHVtblxuXHR9LCAnc2VsZWN0aW9uIGVxdWFsJyk7XG59XG5cbmZ1bmN0aW9uIG1vdmVUbyh2aWV3TW9kZWw6IFZpZXdNb2RlbCwgbGluZU51bWJlcjogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgaW5TZWxlY3Rpb25Nb2RlOiBib29sZWFuID0gZmFsc2UpIHtcblx0aWYgKGluU2VsZWN0aW9uTW9kZSkge1xuXHRcdENvcmVOYXZpZ2F0aW9uQ29tbWFuZHMuTW92ZVRvU2VsZWN0LnJ1bkNvcmVFZGl0b3JDb21tYW5kKHZpZXdNb2RlbCwge1xuXHRcdFx0cG9zaXRpb246IG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCBjb2x1bW4pXG5cdFx0fSk7XG5cdH0gZWxzZSB7XG5cdFx0Q29yZU5hdmlnYXRpb25Db21tYW5kcy5Nb3ZlVG8ucnVuQ29yZUVkaXRvckNvbW1hbmQodmlld01vZGVsLCB7XG5cdFx0XHRwb3NpdGlvbjogbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbilcblx0XHR9KTtcblx0fVxufVxuXG5mdW5jdGlvbiBtb3ZlVG9FbmRPZkxpbmUodmlld01vZGVsOiBWaWV3TW9kZWwsIGluU2VsZWN0aW9uTW9kZTogYm9vbGVhbiA9IGZhbHNlKSB7XG5cdGlmIChpblNlbGVjdGlvbk1vZGUpIHtcblx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckVuZFNlbGVjdC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0fSBlbHNlIHtcblx0XHRDb3JlTmF2aWdhdGlvbkNvbW1hbmRzLkN1cnNvckVuZC5ydW5Db3JlRWRpdG9yQ29tbWFuZCh2aWV3TW9kZWwsIHt9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUV0QixTQUFTLGtCQUFrQjtBQUUzQixTQUEwQiwwQkFBMEI7QUFFcEQsTUFBTSw0QkFBNEIsTUFBTTtBQUV2QywwQ0FBd0M7QUFFeEMsUUFBTSxPQUFPO0FBQUEsSUFDWjtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxFQUNELEVBQUUsS0FBSyxJQUFJO0FBRVgsV0FBUyxZQUFZLFVBQXlFO0FBQzdGLHVCQUFtQixNQUFNLENBQUMsR0FBRyxDQUFDLFFBQVEsY0FBYztBQUNuRCxlQUFTLFFBQVEsU0FBUztBQUFBLElBQzNCLENBQUM7QUFBQSxFQUNGO0FBRUEsT0FBSywyQ0FBMkMsTUFBTTtBQUNyRCxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLGVBQVMsU0FBUztBQUNsQixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGlEQUFpRCxNQUFNO0FBQzNELGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsZUFBUyxXQUFXLENBQUM7QUFDckIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw4Q0FBOEMsTUFBTTtBQUN4RCxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLGVBQVMsV0FBVyxHQUFHLFdBQVcsUUFBUSxRQUFRO0FBQ2xELGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssb0NBQW9DLE1BQU07QUFDOUMsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUN0QixlQUFTLFdBQVcsRUFBRTtBQUN0QixrQkFBWSxXQUFXLEdBQUcsRUFBRTtBQUFBLElBQzdCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDZDQUE2QyxNQUFNO0FBQ3ZELGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsZ0JBQVUsU0FBUztBQUNuQixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG1EQUFtRCxNQUFNO0FBQzdELGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsZ0JBQVUsV0FBVyxDQUFDO0FBQ3RCLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssZ0RBQWdELE1BQU07QUFDMUQsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUN0QixnQkFBVSxXQUFXLEdBQUcsV0FBVyxRQUFRLFFBQVE7QUFDbkQsa0JBQVksV0FBVyxHQUFHLEVBQUU7QUFBQSxJQUM3QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxpQ0FBaUMsTUFBTTtBQUMzQyxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLGdCQUFVLFdBQVcsR0FBRztBQUN4QixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLCtDQUErQyxNQUFNO0FBQ3pELGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsc0JBQWdCLFNBQVM7QUFDekIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx3RUFBd0UsTUFBTTtBQUNsRixnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLHNCQUFnQixTQUFTO0FBQ3pCLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssd0RBQXdELE1BQU07QUFDbEUsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUN0QixzQkFBZ0IsU0FBUztBQUN6QixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLCtEQUErRCxNQUFNO0FBQ3pFLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsNENBQXNDLFNBQVM7QUFDL0Msa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx3RkFBd0YsTUFBTTtBQUNsRyxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLDRDQUFzQyxTQUFTO0FBQy9DLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssd0VBQXdFLE1BQU07QUFDbEYsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUN0Qiw0Q0FBc0MsU0FBUztBQUMvQyxrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG1DQUFtQyxNQUFNO0FBQzdDLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsb0JBQWMsU0FBUztBQUN2QixrQkFBWSxXQUFXLEdBQUcsRUFBRTtBQUFBLElBQzdCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDJEQUEyRCxNQUFNO0FBQ3JFLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLEVBQUU7QUFDdkIsb0JBQWMsU0FBUztBQUN2QixrQkFBWSxXQUFXLEdBQUcsRUFBRTtBQUFBLElBQzdCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHFDQUFxQyxNQUFNO0FBQy9DLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLEVBQUU7QUFDdkIsb0JBQWMsU0FBUztBQUN2QixrQkFBWSxXQUFXLEdBQUcsRUFBRTtBQUFBLElBQzdCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHNEQUFzRCxNQUFNO0FBQ2hFLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsMkNBQXFDLFNBQVM7QUFDOUMsa0JBQVksV0FBVyxHQUFHLEVBQUU7QUFBQSxJQUM3QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw4RUFBOEUsTUFBTTtBQUN4RixnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxFQUFFO0FBQ3ZCLDJDQUFxQyxTQUFTO0FBQzlDLGtCQUFZLFdBQVcsR0FBRyxFQUFFO0FBQUEsSUFDN0IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssd0RBQXdELE1BQU07QUFDbEUsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsYUFBTyxXQUFXLEdBQUcsRUFBRTtBQUN2QiwyQ0FBcUMsU0FBUztBQUM5QyxrQkFBWSxXQUFXLEdBQUcsRUFBRTtBQUFBLElBQzdCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDBDQUEwQyxNQUFNO0FBQ3BELGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsdUJBQWlCLFNBQVM7QUFDMUIsa0JBQVksV0FBVyxHQUFHLEVBQUU7QUFBQSxJQUM3QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxzQ0FBc0MsTUFBTTtBQUNoRCxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxFQUFFO0FBQ3ZCLHVCQUFpQixTQUFTO0FBQzFCLGtCQUFZLFdBQVcsR0FBRyxFQUFFO0FBQUEsSUFDN0IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsscUNBQXFDLE1BQU07QUFDL0MsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsc0JBQWdCLFNBQVM7QUFDekIsdUJBQWlCLFNBQVM7QUFDMUIsa0JBQVksV0FBVyxHQUFHLEVBQUU7QUFBQSxJQUM3QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxtQ0FBbUMsTUFBTTtBQUM3QyxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxvQkFBYyxTQUFTO0FBQ3ZCLHVCQUFpQixTQUFTO0FBQzFCLGtCQUFZLFdBQVcsR0FBRyxFQUFFO0FBQUEsSUFDN0IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssa0NBQWtDLE1BQU07QUFDNUMsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUN0QixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUUzQixhQUFPLFdBQVcsQ0FBQztBQUNuQixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUUzQixhQUFPLFdBQVcsQ0FBQztBQUNuQixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDZDQUE2QyxNQUFNO0FBQ3ZELGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFFM0Isd0JBQWtCLFdBQVcsQ0FBQztBQUM5QixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUUzQix3QkFBa0IsV0FBVyxDQUFDO0FBQzlCLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssK0NBQStDLE1BQU07QUFDekQsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUN0QixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUUzQiwwQkFBb0IsV0FBVyxDQUFDO0FBQ2hDLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBRTNCLDBCQUFvQixXQUFXLENBQUM7QUFDaEMsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxpREFBaUQsTUFBTTtBQUMzRCxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBRTNCLGFBQU8sV0FBVyxHQUFHLElBQUk7QUFDekIsa0JBQVksV0FBVyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBRWpDLGFBQU8sV0FBVyxHQUFHLElBQUk7QUFDekIsa0JBQVksV0FBVyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDbEMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsscURBQXFELE1BQU07QUFDL0QsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUN0QixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUUzQixlQUFTLFdBQVcsQ0FBQztBQUNyQixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUUzQixhQUFPLFdBQVcsQ0FBQztBQUNuQixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUUzQixhQUFPLFdBQVcsQ0FBQztBQUNuQixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUUzQixhQUFPLFdBQVcsQ0FBQztBQUNuQixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUUzQixhQUFPLFdBQVcsQ0FBQztBQUNuQixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHNGQUFzRixNQUFNO0FBQ2hHLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLHNCQUFnQixTQUFTO0FBQ3pCLGtCQUFZLFdBQVcsR0FBRyxFQUFFO0FBRTVCLHNCQUFnQixTQUFTO0FBQ3pCLGtCQUFZLFdBQVcsR0FBRyxFQUFFO0FBRTVCLGVBQVMsV0FBVyxDQUFDO0FBQ3JCLGtCQUFZLFdBQVcsR0FBRyxFQUFFO0FBRTVCLGVBQVMsV0FBVyxDQUFDO0FBQ3JCLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBRTNCLGVBQVMsV0FBVyxDQUFDO0FBQ3JCLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBRTNCLGFBQU8sV0FBVyxDQUFDO0FBQ25CLGtCQUFZLFdBQVcsR0FBRyxFQUFFO0FBQUEsSUFDN0IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsseUVBQXlFLE1BQU07QUFDbkYsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsZ0JBQVUsZ0NBQWdDLE1BQU0sSUFBSSxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUM7QUFFckUsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUN0QixnQkFBVSxTQUFTO0FBRW5CLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssa0ZBQWtGLE1BQU07QUFDNUYsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsZ0JBQVUsZ0NBQWdDLE1BQU0sSUFBSSxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUM7QUFFckUsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUN0QixnQkFBVSxTQUFTO0FBRW5CLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssb0RBQW9ELE1BQU07QUFDOUQsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsZ0JBQVUsZ0NBQWdDLE1BQU0sSUFBSSxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUM7QUFFckUsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUN0QixnQkFBVSxXQUFXLENBQUM7QUFFdEIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywwRkFBMEYsTUFBTTtBQUNwRyxnQkFBWSxDQUFDLFFBQVEsY0FBYztBQUNsQyxnQkFBVSxnQ0FBZ0MsTUFBTSxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUVwRSxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLGdCQUFVLFdBQVcsQ0FBQztBQUV0QixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHFEQUFxRCxNQUFNO0FBQy9ELGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGdCQUFVLGdDQUFnQyxNQUFNLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBRXBFLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsbUJBQWEsU0FBUztBQUV0QixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDBFQUEwRSxNQUFNO0FBQ3BGLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGdCQUFVLGdDQUFnQyxNQUFNLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBRXBFLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsbUJBQWEsU0FBUztBQUV0QixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHFGQUFxRixNQUFNO0FBQy9GLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGdCQUFVLGdDQUFnQyxNQUFNLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBRXBFLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsbUJBQWEsU0FBUztBQUV0QixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDBEQUEwRCxNQUFNO0FBQ3BFLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGdCQUFVLGdDQUFnQyxNQUFNLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBRXBFLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsbUJBQWEsV0FBVyxDQUFDO0FBRXpCLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssOEZBQThGLE1BQU07QUFDeEcsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsZ0JBQVUsZ0NBQWdDLE1BQU0sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUM7QUFFcEUsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUN0QixtQkFBYSxXQUFXLENBQUM7QUFFekIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQztBQUVELE1BQU0saUNBQWlDLE1BQU07QUFFNUMsMENBQXdDO0FBRXhDLFFBQU0sT0FBTztBQUFBLElBQ1o7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsRUFDRCxFQUFFLEtBQUssSUFBSTtBQUVYLFdBQVMsWUFBWSxVQUF5RTtBQUM3Rix1QkFBbUIsTUFBTSxDQUFDLEdBQUcsQ0FBQyxRQUFRLGNBQWM7QUFDbkQsZUFBUyxRQUFRLFNBQVM7QUFBQSxJQUMzQixDQUFDO0FBQUEsRUFDRjtBQUVBLE9BQUsscURBQXFELE1BQU07QUFDL0QsZ0JBQVksQ0FBQyxRQUFRLGNBQWM7QUFDbEMsMEJBQW9CLFdBQVcsS0FBSztBQUNwQyxrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHVEQUF1RCxNQUFNO0FBQ2pFLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsd0JBQWtCLFdBQVcsS0FBSztBQUNsQyxrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGtFQUFrRSxNQUFNO0FBQzVFLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsMEJBQW9CLFdBQVcsS0FBSztBQUNwQyxrQkFBWSxXQUFXLElBQUksQ0FBQztBQUFBLElBQzdCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGdFQUFnRSxNQUFNO0FBQzFFLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsd0JBQWtCLFdBQVcsS0FBSztBQUNsQyxrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGdFQUFnRSxNQUFNO0FBQzFFLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsd0JBQWtCLFdBQVcsS0FBSztBQUNsQyxrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGlFQUFpRSxNQUFNO0FBQzNFLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxJQUFJLENBQUM7QUFDdkIsMEJBQW9CLFdBQVcsS0FBSztBQUNwQyxrQkFBWSxXQUFXLElBQUksQ0FBQztBQUFBLElBQzdCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHlEQUF5RCxNQUFNO0FBQ25FLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLDBCQUFvQixXQUFXLElBQUk7QUFDbkMscUJBQWUsVUFBVSxhQUFhLEdBQUcsR0FBRyxHQUFHLEdBQUcsQ0FBQztBQUFBLElBQ3BELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDJEQUEyRCxNQUFNO0FBQ3JFLGdCQUFZLENBQUMsUUFBUSxjQUFjO0FBQ2xDLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIsd0JBQWtCLFdBQVcsSUFBSTtBQUNqQyxxQkFBZSxVQUFVLGFBQWEsR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDO0FBQUEsSUFDcEQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7QUFLRCxNQUFNLHlDQUF5QyxNQUFNO0FBRXBELDBDQUF3QztBQUV4QyxXQUFTLGdCQUFnQixVQUF5RTtBQUNqRyx1QkFBbUI7QUFBQSxNQUNsQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELEVBQUUsS0FBSyxJQUFJLEdBQUcsQ0FBQyxHQUFHLENBQUMsUUFBUSxjQUFjO0FBQ3hDLGVBQVMsUUFBUSxTQUFTO0FBQUEsSUFDM0IsQ0FBQztBQUFBLEVBQ0Y7QUFFQSxPQUFLLHlEQUF5RCxNQUFNO0FBQ25FLG9CQUFnQixDQUFDLFFBQVEsY0FBYztBQUV0QyxnQkFBVSxlQUFlLENBQUMsSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ2hELGFBQU8sV0FBVyxHQUFHLENBQUM7QUFFdEIsMkJBQXFCLFNBQVM7QUFDOUIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFFM0IsMkJBQXFCLFNBQVM7QUFDOUIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx1REFBdUQsTUFBTTtBQUNqRSxvQkFBZ0IsQ0FBQyxRQUFRLGNBQWM7QUFFdEMsZ0JBQVUsZUFBZSxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNoRCxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBRXRCLHlCQUFtQixTQUFTO0FBQzVCLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBRTNCLHlCQUFtQixTQUFTO0FBQzVCLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssbUVBQW1FLE1BQU07QUFDN0Usb0JBQWdCLENBQUMsUUFBUSxjQUFjO0FBRXRDLGdCQUFVLGVBQWUsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDaEQsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUV0QiwyQkFBcUIsV0FBVyxDQUFDO0FBQ2pDLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssK0RBQStELE1BQU07QUFDekUsb0JBQWdCLENBQUMsUUFBUSxjQUFjO0FBRXRDLGdCQUFVLGVBQWUsQ0FBQyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDaEQsYUFBTyxXQUFXLEdBQUcsQ0FBQztBQUV0QiwyQkFBcUIsU0FBUztBQUM5QixrQkFBWSxXQUFXLEdBQUcsQ0FBQztBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDJEQUEyRCxNQUFNO0FBQ3JFLG9CQUFnQixDQUFDLFFBQVEsY0FBYztBQUN0QyxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBQ3RCLDJCQUFxQixTQUFTO0FBQzlCLGtCQUFZLFdBQVcsR0FBRyxDQUFDO0FBQUEsSUFDNUIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMkRBQTJELE1BQU07QUFDckUsb0JBQWdCLENBQUMsUUFBUSxjQUFjO0FBQ3RDLGFBQU8sV0FBVyxHQUFHLENBQUM7QUFDdEIseUJBQW1CLFNBQVM7QUFDNUIsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw2RUFBNkUsTUFBTTtBQUN2RixvQkFBZ0IsQ0FBQyxRQUFRLGNBQWM7QUFFdEMsZ0JBQVUsZUFBZSxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNoRCxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBRXRCLDJCQUFxQixXQUFXLENBQUM7QUFDakMsa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw2RUFBNkUsTUFBTTtBQUN2RixvQkFBZ0IsQ0FBQyxRQUFRLGNBQWM7QUFFdEMsZ0JBQVUsZUFBZSxDQUFDLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUNoRCxhQUFPLFdBQVcsR0FBRyxDQUFDO0FBRXRCLHlCQUFtQixXQUFXLENBQUM7QUFDL0Isa0JBQVksV0FBVyxHQUFHLENBQUM7QUFBQSxJQUM1QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQztBQUlELFNBQVMsS0FBSyxXQUFzQixNQUFXO0FBQzlDLHlCQUF1QixXQUFXLHFCQUFxQixXQUFXLElBQUk7QUFDdkU7QUFFQSxTQUFTLGdCQUFnQixXQUFzQjtBQUM5QyxPQUFLLFdBQVcsRUFBRSxJQUFJLFdBQVcsYUFBYSxpQkFBaUIsQ0FBQztBQUNqRTtBQUVBLFNBQVMsc0NBQXNDLFdBQXNCO0FBQ3BFLE9BQUssV0FBVyxFQUFFLElBQUksV0FBVyxhQUFhLHVDQUF1QyxDQUFDO0FBQ3ZGO0FBRUEsU0FBUyxpQkFBaUIsV0FBc0I7QUFDL0MsT0FBSyxXQUFXLEVBQUUsSUFBSSxXQUFXLGFBQWEsd0JBQXdCLENBQUM7QUFDeEU7QUFFQSxTQUFTLGNBQWMsV0FBc0I7QUFDNUMsT0FBSyxXQUFXLEVBQUUsSUFBSSxXQUFXLGFBQWEsZUFBZSxDQUFDO0FBQy9EO0FBRUEsU0FBUyxxQ0FBcUMsV0FBc0I7QUFDbkUsT0FBSyxXQUFXLEVBQUUsSUFBSSxXQUFXLGFBQWEsc0NBQXNDLENBQUM7QUFDdEY7QUFFQSxTQUFTLFNBQVMsV0FBc0IsT0FBZ0IsSUFBYSxRQUFrQjtBQUN0RixPQUFLLFdBQVcsRUFBRSxJQUFJLFdBQVcsYUFBYSxNQUFNLElBQVEsT0FBYyxPQUFlLENBQUM7QUFDM0Y7QUFFQSxTQUFTLFVBQVUsV0FBc0IsT0FBZ0IsSUFBYSxRQUFrQjtBQUN2RixPQUFLLFdBQVcsRUFBRSxJQUFJLFdBQVcsYUFBYSxPQUFPLElBQVEsT0FBYyxPQUFlLENBQUM7QUFDNUY7QUFFQSxTQUFTLE9BQU8sV0FBc0IsWUFBb0IsR0FBRyxRQUFrQjtBQUM5RSxPQUFLLFdBQVcsRUFBRSxJQUFJLFdBQVcsYUFBYSxJQUFJLElBQUksV0FBVyxRQUFRLGFBQWEsT0FBTyxXQUFXLE9BQWUsQ0FBQztBQUN6SDtBQUVBLFNBQVMsa0JBQWtCLFdBQXNCLFFBQWtCO0FBQ2xFLE9BQUssV0FBVyxFQUFFLElBQUksV0FBVyxhQUFhLGVBQWUsSUFBSSxXQUFXLFFBQVEsYUFBYSxPQUFlLENBQUM7QUFDbEg7QUFFQSxTQUFTLGtCQUFrQixXQUFzQixZQUFvQixHQUFHLFFBQWtCO0FBQ3pGLE9BQUssV0FBVyxFQUFFLElBQUksV0FBVyxhQUFhLElBQUksT0FBTyxXQUFXLE9BQWUsQ0FBQztBQUNyRjtBQUVBLFNBQVMsU0FBUyxXQUFzQixZQUFvQixHQUFHLFFBQWtCO0FBQ2hGLE9BQUssV0FBVyxFQUFFLElBQUksV0FBVyxhQUFhLE1BQU0sSUFBSSxXQUFXLFFBQVEsYUFBYSxPQUFPLFdBQVcsT0FBZSxDQUFDO0FBQzNIO0FBRUEsU0FBUyxvQkFBb0IsV0FBc0IsUUFBa0I7QUFDcEUsT0FBSyxXQUFXLEVBQUUsSUFBSSxXQUFXLGFBQWEsZUFBZSxJQUFJLFdBQVcsUUFBUSxhQUFhLE9BQWUsQ0FBQztBQUNsSDtBQUVBLFNBQVMsb0JBQW9CLFdBQXNCLFlBQW9CLEdBQUcsUUFBa0I7QUFDM0YsT0FBSyxXQUFXLEVBQUUsSUFBSSxXQUFXLGFBQWEsTUFBTSxPQUFPLFdBQVcsT0FBZSxDQUFDO0FBQ3ZGO0FBRUEsU0FBUyxxQkFBcUIsV0FBc0IsWUFBb0IsR0FBRyxRQUFrQjtBQUM1RixPQUFLLFdBQVcsRUFBRSxJQUFJLFdBQVcsYUFBYSxNQUFNLElBQUksV0FBVyxRQUFRLFlBQVksT0FBTyxXQUFXLE9BQWUsQ0FBQztBQUMxSDtBQUVBLFNBQVMsbUJBQW1CLFdBQXNCLFlBQW9CLEdBQUcsUUFBa0I7QUFDMUYsT0FBSyxXQUFXLEVBQUUsSUFBSSxXQUFXLGFBQWEsSUFBSSxJQUFJLFdBQVcsUUFBUSxZQUFZLE9BQU8sV0FBVyxPQUFlLENBQUM7QUFDeEg7QUFFQSxTQUFTLFVBQVUsV0FBc0IsWUFBb0IsR0FBRyxRQUFrQjtBQUNqRixPQUFLLFdBQVcsRUFBRSxJQUFJLFdBQVcsYUFBYSxhQUFhLE9BQU8sV0FBVyxPQUFlLENBQUM7QUFDOUY7QUFFQSxTQUFTLGFBQWEsV0FBc0IsUUFBa0I7QUFDN0QsT0FBSyxXQUFXLEVBQUUsSUFBSSxXQUFXLGFBQWEsZ0JBQWdCLE9BQWUsQ0FBQztBQUMvRTtBQUVBLFNBQVMsYUFBYSxXQUFzQixZQUFvQixHQUFHLFFBQWtCO0FBQ3BGLE9BQUssV0FBVyxFQUFFLElBQUksV0FBVyxhQUFhLGdCQUFnQixPQUFPLFdBQVcsT0FBZSxDQUFDO0FBQ2pHO0FBRUEsU0FBUyxZQUFZLFdBQXNCLGVBQXVCLFdBQW1CLGdCQUF3QixlQUFlLFlBQW9CLFdBQVc7QUFDMUosZ0JBQWMsVUFBVSxZQUFZLEdBQUcsZUFBZSxTQUFTO0FBQy9ELGlCQUFlLFVBQVUsYUFBYSxHQUFHLGVBQWUsV0FBVyxlQUFlLFNBQVM7QUFDNUY7QUFFQSxTQUFTLGNBQWMsVUFBb0IsWUFBb0IsUUFBZ0I7QUFDOUUsU0FBTyxnQkFBZ0IsVUFBVSxJQUFJLFNBQVMsWUFBWSxNQUFNLEdBQUcsZ0JBQWdCO0FBQ3BGO0FBRUEsU0FBUyxlQUFlLFdBQXNCLGVBQXVCLFdBQW1CLGVBQXVCLFdBQW1CO0FBQ2pJLFNBQU8sZ0JBQWdCO0FBQUEsSUFDdEIsMEJBQTBCLFVBQVU7QUFBQSxJQUNwQyxzQkFBc0IsVUFBVTtBQUFBLElBQ2hDLG9CQUFvQixVQUFVO0FBQUEsSUFDOUIsZ0JBQWdCLFVBQVU7QUFBQSxFQUMzQixHQUFHO0FBQUEsSUFDRiwwQkFBMEI7QUFBQSxJQUMxQixzQkFBc0I7QUFBQSxJQUN0QixvQkFBb0I7QUFBQSxJQUNwQixnQkFBZ0I7QUFBQSxFQUNqQixHQUFHLGlCQUFpQjtBQUNyQjtBQUVBLFNBQVMsT0FBTyxXQUFzQixZQUFvQixRQUFnQixrQkFBMkIsT0FBTztBQUMzRyxNQUFJLGlCQUFpQjtBQUNwQiwyQkFBdUIsYUFBYSxxQkFBcUIsV0FBVztBQUFBLE1BQ25FLFVBQVUsSUFBSSxTQUFTLFlBQVksTUFBTTtBQUFBLElBQzFDLENBQUM7QUFBQSxFQUNGLE9BQU87QUFDTiwyQkFBdUIsT0FBTyxxQkFBcUIsV0FBVztBQUFBLE1BQzdELFVBQVUsSUFBSSxTQUFTLFlBQVksTUFBTTtBQUFBLElBQzFDLENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUFFQSxTQUFTLGdCQUFnQixXQUFzQixrQkFBMkIsT0FBTztBQUNoRixNQUFJLGlCQUFpQjtBQUNwQiwyQkFBdUIsZ0JBQWdCLHFCQUFxQixXQUFXLENBQUMsQ0FBQztBQUFBLEVBQzFFLE9BQU87QUFDTiwyQkFBdUIsVUFBVSxxQkFBcUIsV0FBVyxDQUFDLENBQUM7QUFBQSxFQUNwRTtBQUNEOyIsCiAgIm5hbWVzIjogW10KfQo=
