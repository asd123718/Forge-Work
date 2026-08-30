import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { CoreEditingCommands } from "../../../../browser/coreCommands.js";
import { Position } from "../../../../common/core/position.js";
import { Selection } from "../../../../common/core/selection.js";
import { Handler } from "../../../../common/editorCommon.js";
import { CamelCaseAction, PascalCaseAction, DeleteAllLeftAction, DeleteAllRightAction, DeleteDuplicateLinesAction, DeleteLinesAction, IndentLinesAction, InsertLineAfterAction, InsertLineBeforeAction, JoinLinesAction, KebabCaseAction, LowerCaseAction, SnakeCaseAction, SortLinesAscendingAction, SortLinesDescendingAction, TitleCaseAction, TransposeAction, UpperCaseAction, ReverseLinesAction } from "../../browser/linesOperations.js";
import { withTestCodeEditor } from "../../../../test/browser/testCodeEditor.js";
import { createTextModel } from "../../../../test/common/testTextModel.js";
function assertSelection(editor, expected) {
  if (!Array.isArray(expected)) {
    expected = [expected];
  }
  assert.deepStrictEqual(editor.getSelections(), expected);
}
function executeAction(action, editor) {
  action.run(null, editor, void 0);
}
suite("Editor Contrib - Line Operations", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("SortLinesAscendingAction", () => {
    test("should sort selected lines in ascending order", function() {
      withTestCodeEditor(
        [
          "omicron",
          "beta",
          "alpha"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const sortLinesAscendingAction = new SortLinesAscendingAction();
          editor.setSelection(new Selection(1, 1, 3, 5));
          executeAction(sortLinesAscendingAction, editor);
          assert.deepStrictEqual(model.getLinesContent(), [
            "alpha",
            "beta",
            "omicron"
          ]);
          assertSelection(editor, new Selection(1, 1, 3, 7));
        }
      );
    });
    test("should sort lines in ascending order", function() {
      withTestCodeEditor(
        [
          "omicron",
          "beta",
          "alpha"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const sortLinesAscendingAction = new SortLinesAscendingAction();
          executeAction(sortLinesAscendingAction, editor);
          assert.deepStrictEqual(model.getLinesContent(), [
            "alpha",
            "beta",
            "omicron"
          ]);
        }
      );
    });
    test("should sort multiple selections in ascending order", function() {
      withTestCodeEditor(
        [
          "omicron",
          "beta",
          "alpha",
          "",
          "omicron",
          "beta",
          "alpha"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const sortLinesAscendingAction = new SortLinesAscendingAction();
          editor.setSelections([new Selection(1, 1, 3, 5), new Selection(5, 1, 7, 5)]);
          executeAction(sortLinesAscendingAction, editor);
          assert.deepStrictEqual(model.getLinesContent(), [
            "alpha",
            "beta",
            "omicron",
            "",
            "alpha",
            "beta",
            "omicron"
          ]);
          const expectedSelections = [
            new Selection(1, 1, 3, 7),
            new Selection(5, 1, 7, 7)
          ];
          editor.getSelections().forEach((actualSelection, index) => {
            assert.deepStrictEqual(actualSelection.toString(), expectedSelections[index].toString());
          });
        }
      );
    });
    test("applies to whole document when selection is single line", function() {
      withTestCodeEditor(
        [
          "omicron",
          "beta",
          "alpha"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const sortLinesAscendingAction = new SortLinesAscendingAction();
          editor.setSelection(new Selection(2, 1, 2, 4));
          executeAction(sortLinesAscendingAction, editor);
          assert.deepStrictEqual(model.getLinesContent(), [
            "alpha",
            "beta",
            "omicron"
          ]);
        }
      );
    });
  });
  suite("SortLinesDescendingAction", () => {
    test("should sort selected lines in descending order", function() {
      withTestCodeEditor(
        [
          "alpha",
          "beta",
          "omicron"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const sortLinesDescendingAction = new SortLinesDescendingAction();
          editor.setSelection(new Selection(1, 1, 3, 7));
          executeAction(sortLinesDescendingAction, editor);
          assert.deepStrictEqual(model.getLinesContent(), [
            "omicron",
            "beta",
            "alpha"
          ]);
          assertSelection(editor, new Selection(1, 1, 3, 5));
        }
      );
    });
    test("should sort multiple selections in descending order", function() {
      withTestCodeEditor(
        [
          "alpha",
          "beta",
          "omicron",
          "",
          "alpha",
          "beta",
          "omicron"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const sortLinesDescendingAction = new SortLinesDescendingAction();
          editor.setSelections([new Selection(1, 1, 3, 7), new Selection(5, 1, 7, 7)]);
          executeAction(sortLinesDescendingAction, editor);
          assert.deepStrictEqual(model.getLinesContent(), [
            "omicron",
            "beta",
            "alpha",
            "",
            "omicron",
            "beta",
            "alpha"
          ]);
          const expectedSelections = [
            new Selection(1, 1, 3, 5),
            new Selection(5, 1, 7, 5)
          ];
          editor.getSelections().forEach((actualSelection, index) => {
            assert.deepStrictEqual(actualSelection.toString(), expectedSelections[index].toString());
          });
        }
      );
    });
  });
  suite("DeleteDuplicateLinesAction", () => {
    test("should remove duplicate lines within selection", function() {
      withTestCodeEditor(
        [
          "alpha",
          "beta",
          "beta",
          "beta",
          "alpha",
          "omicron"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const deleteDuplicateLinesAction = new DeleteDuplicateLinesAction();
          editor.setSelection(new Selection(1, 3, 6, 4));
          executeAction(deleteDuplicateLinesAction, editor);
          assert.deepStrictEqual(model.getLinesContent(), [
            "alpha",
            "beta",
            "omicron"
          ]);
          assertSelection(editor, new Selection(1, 1, 3, 8));
        }
      );
    });
    test("should remove duplicate lines", function() {
      withTestCodeEditor(
        [
          "alpha",
          "beta",
          "beta",
          "beta",
          "alpha",
          "omicron"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const deleteDuplicateLinesAction = new DeleteDuplicateLinesAction();
          executeAction(deleteDuplicateLinesAction, editor);
          assert.deepStrictEqual(model.getLinesContent(), [
            "alpha",
            "beta",
            "omicron"
          ]);
          assert.ok(editor.getSelection().isEmpty());
        }
      );
    });
    test("should remove duplicate lines in multiple selections", function() {
      withTestCodeEditor(
        [
          "alpha",
          "beta",
          "beta",
          "omicron",
          "",
          "alpha",
          "alpha",
          "beta"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const deleteDuplicateLinesAction = new DeleteDuplicateLinesAction();
          editor.setSelections([new Selection(1, 2, 4, 3), new Selection(6, 2, 8, 3)]);
          executeAction(deleteDuplicateLinesAction, editor);
          assert.deepStrictEqual(model.getLinesContent(), [
            "alpha",
            "beta",
            "omicron",
            "",
            "alpha",
            "beta"
          ]);
          const expectedSelections = [
            new Selection(1, 1, 3, 8),
            new Selection(5, 1, 6, 5)
          ];
          editor.getSelections().forEach((actualSelection, index) => {
            assert.deepStrictEqual(actualSelection.toString(), expectedSelections[index].toString());
          });
        }
      );
    });
    test("applies to whole document when selection is single line", function() {
      withTestCodeEditor(
        [
          "alpha",
          "beta",
          "alpha",
          "omicron"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const deleteDuplicateLinesAction = new DeleteDuplicateLinesAction();
          editor.setSelection(new Selection(2, 1, 2, 2));
          executeAction(deleteDuplicateLinesAction, editor);
          assert.deepStrictEqual(model.getLinesContent(), ["alpha", "beta", "omicron"]);
        }
      );
    });
  });
  suite("DeleteAllLeftAction", () => {
    test("should delete to the left of the cursor", function() {
      withTestCodeEditor(
        [
          "one",
          "two",
          "three"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const deleteAllLeftAction = new DeleteAllLeftAction();
          editor.setSelection(new Selection(1, 2, 1, 2));
          executeAction(deleteAllLeftAction, editor);
          assert.strictEqual(model.getLineContent(1), "ne");
          editor.setSelections([new Selection(2, 2, 2, 2), new Selection(3, 2, 3, 2)]);
          executeAction(deleteAllLeftAction, editor);
          assert.strictEqual(model.getLineContent(2), "wo");
          assert.strictEqual(model.getLineContent(3), "hree");
        }
      );
    });
    test("should jump to the previous line when on first column", function() {
      withTestCodeEditor(
        [
          "one",
          "two",
          "three"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const deleteAllLeftAction = new DeleteAllLeftAction();
          editor.setSelection(new Selection(2, 1, 2, 1));
          executeAction(deleteAllLeftAction, editor);
          assert.strictEqual(model.getLineContent(1), "onetwo");
          editor.setSelections([new Selection(1, 1, 1, 1), new Selection(2, 1, 2, 1)]);
          executeAction(deleteAllLeftAction, editor);
          assert.strictEqual(model.getLinesContent()[0], "onetwothree");
          assert.strictEqual(model.getLinesContent().length, 1);
          editor.setSelection(new Selection(1, 1, 1, 1));
          executeAction(deleteAllLeftAction, editor);
          assert.strictEqual(model.getLinesContent()[0], "onetwothree");
        }
      );
    });
    test("should keep deleting lines in multi cursor mode", function() {
      withTestCodeEditor(
        [
          "hi my name is Carlos Matos",
          "BCC",
          "waso waso waso",
          "my wife doesnt believe in me",
          "nonononono",
          "bitconneeeect"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const deleteAllLeftAction = new DeleteAllLeftAction();
          const beforeSecondWasoSelection = new Selection(3, 5, 3, 5);
          const endOfBCCSelection = new Selection(2, 4, 2, 4);
          const endOfNonono = new Selection(5, 11, 5, 11);
          editor.setSelections([beforeSecondWasoSelection, endOfBCCSelection, endOfNonono]);
          executeAction(deleteAllLeftAction, editor);
          let selections = editor.getSelections();
          assert.strictEqual(model.getLineContent(2), "");
          assert.strictEqual(model.getLineContent(3), " waso waso");
          assert.strictEqual(model.getLineContent(5), "");
          assert.deepStrictEqual([
            selections[0].startLineNumber,
            selections[0].startColumn,
            selections[0].endLineNumber,
            selections[0].endColumn
          ], [3, 1, 3, 1]);
          assert.deepStrictEqual([
            selections[1].startLineNumber,
            selections[1].startColumn,
            selections[1].endLineNumber,
            selections[1].endColumn
          ], [2, 1, 2, 1]);
          assert.deepStrictEqual([
            selections[2].startLineNumber,
            selections[2].startColumn,
            selections[2].endLineNumber,
            selections[2].endColumn
          ], [5, 1, 5, 1]);
          executeAction(deleteAllLeftAction, editor);
          selections = editor.getSelections();
          assert.strictEqual(model.getLineContent(1), "hi my name is Carlos Matos waso waso");
          assert.strictEqual(selections.length, 2);
          assert.deepStrictEqual([
            selections[0].startLineNumber,
            selections[0].startColumn,
            selections[0].endLineNumber,
            selections[0].endColumn
          ], [1, 27, 1, 27]);
          assert.deepStrictEqual([
            selections[1].startLineNumber,
            selections[1].startColumn,
            selections[1].endLineNumber,
            selections[1].endColumn
          ], [2, 29, 2, 29]);
        }
      );
    });
    test("should work in multi cursor mode", function() {
      withTestCodeEditor(
        [
          "hello",
          "world",
          "hello world",
          "hello",
          "bonjour",
          "hola",
          "world",
          "hello world"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const deleteAllLeftAction = new DeleteAllLeftAction();
          editor.setSelections([new Selection(1, 2, 1, 2), new Selection(1, 4, 1, 4)]);
          executeAction(deleteAllLeftAction, editor);
          assert.strictEqual(model.getLineContent(1), "lo");
          editor.setSelections([new Selection(2, 2, 2, 2), new Selection(2, 4, 2, 5)]);
          executeAction(deleteAllLeftAction, editor);
          assert.strictEqual(model.getLineContent(2), "d");
          editor.setSelections([new Selection(3, 2, 3, 5), new Selection(3, 7, 3, 7)]);
          executeAction(deleteAllLeftAction, editor);
          assert.strictEqual(model.getLineContent(3), "world");
          editor.setSelections([new Selection(4, 3, 4, 3), new Selection(4, 5, 5, 4)]);
          executeAction(deleteAllLeftAction, editor);
          assert.strictEqual(model.getLineContent(4), "jour");
          editor.setSelections([new Selection(5, 3, 6, 3), new Selection(6, 5, 7, 5), new Selection(7, 7, 7, 7)]);
          executeAction(deleteAllLeftAction, editor);
          assert.strictEqual(model.getLineContent(5), "world");
        }
      );
    });
    test("issue #36234: should push undo stop", () => {
      withTestCodeEditor(
        [
          "one",
          "two",
          "three"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const deleteAllLeftAction = new DeleteAllLeftAction();
          editor.setSelection(new Selection(1, 1, 1, 1));
          editor.trigger("keyboard", Handler.Type, { text: "Typing some text here on line " });
          assert.strictEqual(model.getLineContent(1), "Typing some text here on line one");
          assert.deepStrictEqual(editor.getSelection(), new Selection(1, 31, 1, 31));
          executeAction(deleteAllLeftAction, editor);
          assert.strictEqual(model.getLineContent(1), "one");
          assert.deepStrictEqual(editor.getSelection(), new Selection(1, 1, 1, 1));
          editor.runCommand(CoreEditingCommands.Undo, null);
          assert.strictEqual(model.getLineContent(1), "Typing some text here on line one");
          assert.deepStrictEqual(editor.getSelection(), new Selection(1, 31, 1, 31));
        }
      );
    });
  });
  suite("JoinLinesAction", () => {
    test("should join lines and insert space if necessary", function() {
      withTestCodeEditor(
        [
          "hello",
          "world",
          "hello ",
          "world",
          "hello		",
          "	world",
          "hello   ",
          "	world",
          "",
          "",
          "hello world"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const joinLinesAction = new JoinLinesAction();
          editor.setSelection(new Selection(1, 2, 1, 2));
          executeAction(joinLinesAction, editor);
          assert.strictEqual(model.getLineContent(1), "hello world");
          assertSelection(editor, new Selection(1, 6, 1, 6));
          editor.setSelection(new Selection(2, 2, 2, 2));
          executeAction(joinLinesAction, editor);
          assert.strictEqual(model.getLineContent(2), "hello world");
          assertSelection(editor, new Selection(2, 7, 2, 7));
          editor.setSelection(new Selection(3, 2, 3, 2));
          executeAction(joinLinesAction, editor);
          assert.strictEqual(model.getLineContent(3), "hello world");
          assertSelection(editor, new Selection(3, 7, 3, 7));
          editor.setSelection(new Selection(4, 2, 5, 3));
          executeAction(joinLinesAction, editor);
          assert.strictEqual(model.getLineContent(4), "hello world");
          assertSelection(editor, new Selection(4, 2, 4, 8));
          editor.setSelection(new Selection(5, 1, 7, 3));
          executeAction(joinLinesAction, editor);
          assert.strictEqual(model.getLineContent(5), "hello world");
          assertSelection(editor, new Selection(5, 1, 5, 3));
        }
      );
    });
    test("#50471 Join lines at the end of document", function() {
      withTestCodeEditor(
        [
          "hello",
          "world"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const joinLinesAction = new JoinLinesAction();
          editor.setSelection(new Selection(2, 1, 2, 1));
          executeAction(joinLinesAction, editor);
          assert.strictEqual(model.getLineContent(1), "hello");
          assert.strictEqual(model.getLineContent(2), "world");
          assertSelection(editor, new Selection(2, 6, 2, 6));
        }
      );
    });
    test("should work in multi cursor mode", function() {
      withTestCodeEditor(
        [
          "hello",
          "world",
          "hello ",
          "world",
          "hello		",
          "	world",
          "hello   ",
          "	world",
          "",
          "",
          "hello world"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const joinLinesAction = new JoinLinesAction();
          editor.setSelections([
            /** primary cursor */
            new Selection(5, 2, 5, 2),
            new Selection(1, 2, 1, 2),
            new Selection(3, 2, 4, 2),
            new Selection(5, 4, 6, 3),
            new Selection(7, 5, 8, 4),
            new Selection(10, 1, 10, 1)
          ]);
          executeAction(joinLinesAction, editor);
          assert.strictEqual(model.getLinesContent().join("\n"), "hello world\nhello world\nhello world\nhello world\n\nhello world");
          assertSelection(editor, [
            /** primary cursor */
            new Selection(3, 4, 3, 8),
            new Selection(1, 6, 1, 6),
            new Selection(2, 2, 2, 8),
            new Selection(4, 5, 4, 9),
            new Selection(6, 1, 6, 1)
          ]);
        }
      );
    });
    test("should push undo stop", function() {
      withTestCodeEditor(
        [
          "hello",
          "world"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const joinLinesAction = new JoinLinesAction();
          editor.setSelection(new Selection(1, 6, 1, 6));
          editor.trigger("keyboard", Handler.Type, { text: " my dear" });
          assert.strictEqual(model.getLineContent(1), "hello my dear");
          assert.deepStrictEqual(editor.getSelection(), new Selection(1, 14, 1, 14));
          executeAction(joinLinesAction, editor);
          assert.strictEqual(model.getLineContent(1), "hello my dear world");
          assert.deepStrictEqual(editor.getSelection(), new Selection(1, 14, 1, 14));
          editor.runCommand(CoreEditingCommands.Undo, null);
          assert.strictEqual(model.getLineContent(1), "hello my dear");
          assert.deepStrictEqual(editor.getSelection(), new Selection(1, 14, 1, 14));
        }
      );
    });
  });
  suite("ReverseLinesAction", () => {
    test("reverses lines", function() {
      withTestCodeEditor(
        [
          "alice",
          "bob",
          "charlie"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const reverseLinesAction = new ReverseLinesAction();
          executeAction(reverseLinesAction, editor);
          assert.deepStrictEqual(model.getLinesContent(), ["charlie", "bob", "alice"]);
        }
      );
    });
    test("excludes empty last line", function() {
      withTestCodeEditor(
        [
          "alice",
          "bob",
          "charlie",
          ""
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const reverseLinesAction = new ReverseLinesAction();
          executeAction(reverseLinesAction, editor);
          assert.deepStrictEqual(model.getLinesContent(), ["charlie", "bob", "alice", ""]);
        }
      );
    });
    test("updates cursor", function() {
      withTestCodeEditor(
        [
          "alice",
          "bob",
          "charlie"
        ],
        {},
        (editor) => {
          const reverseLinesAction = new ReverseLinesAction();
          editor.setPosition(new Position(3, 3));
          executeAction(reverseLinesAction, editor);
          assert.deepStrictEqual(editor.getPosition(), new Position(1, 3));
        }
      );
    });
    test("preserves cursor on empty last line", function() {
      withTestCodeEditor(
        [
          "alice",
          "bob",
          "charlie",
          ""
        ],
        {},
        (editor) => {
          const reverseLinesAction = new ReverseLinesAction();
          editor.setPosition(new Position(4, 1));
          executeAction(reverseLinesAction, editor);
          assert.deepStrictEqual(editor.getPosition(), new Position(4, 1));
        }
      );
    });
    test("preserves selected text when selections do not span lines", function() {
      withTestCodeEditor(
        [
          "alice",
          "bob",
          "charlie",
          ""
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const reverseLinesAction = new ReverseLinesAction();
          editor.setSelections([new Selection(1, 1, 1, 3), new Selection(2, 1, 2, 4), new Selection(3, 1, 3, 5)]);
          const expectedSelectedText = ["al", "bob", "char"];
          assert.deepStrictEqual(editor.getSelections().map((s) => model.getValueInRange(s)), expectedSelectedText);
          executeAction(reverseLinesAction, editor);
          assert.deepStrictEqual(editor.getSelections().map((s) => model.getValueInRange(s)), expectedSelectedText);
        }
      );
    });
    test("reverses lines within selection", function() {
      withTestCodeEditor(
        [
          "line1",
          "line2",
          "line3",
          "line4",
          "line5"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const reverseLinesAction = new ReverseLinesAction();
          editor.setSelection(new Selection(2, 1, 4, 6));
          executeAction(reverseLinesAction, editor);
          assert.deepStrictEqual(model.getLinesContent(), ["line1", "line4", "line3", "line2", "line5"]);
        }
      );
    });
    test("reverses lines within partial selection", function() {
      withTestCodeEditor(
        [
          "line1",
          "line2",
          "line3",
          "line4",
          "line5"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const reverseLinesAction = new ReverseLinesAction();
          editor.setSelection(new Selection(2, 3, 4, 3));
          executeAction(reverseLinesAction, editor);
          assert.deepStrictEqual(model.getLinesContent(), ["line1", "line4", "line3", "line2", "line5"]);
        }
      );
    });
    test("reverses lines with multiple selections", function() {
      withTestCodeEditor(
        [
          "line1",
          "line2",
          "line3",
          "line4",
          "line5",
          "line6"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const reverseLinesAction = new ReverseLinesAction();
          editor.setSelections([new Selection(1, 1, 2, 6), new Selection(4, 1, 5, 6)]);
          executeAction(reverseLinesAction, editor);
          assert.deepStrictEqual(model.getLinesContent(), ["line2", "line1", "line3", "line5", "line4", "line6"]);
        }
      );
    });
    test("updates selection positions after reversal", function() {
      withTestCodeEditor(
        [
          "line1",
          "line2",
          "line3",
          "line4"
        ],
        {},
        (editor) => {
          const reverseLinesAction = new ReverseLinesAction();
          editor.setSelection(new Selection(1, 2, 3, 3));
          executeAction(reverseLinesAction, editor);
          const selection = editor.getSelection();
          assert.strictEqual(selection.startLineNumber, 1);
          assert.strictEqual(selection.startColumn, 3);
          assert.strictEqual(selection.endLineNumber, 3);
          assert.strictEqual(selection.endColumn, 2);
        }
      );
    });
    test("applies to whole document when selection is single line", function() {
      withTestCodeEditor(
        [
          "line1",
          "line2",
          "line3"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const reverseLinesAction = new ReverseLinesAction();
          editor.setSelection(new Selection(2, 1, 2, 6));
          executeAction(reverseLinesAction, editor);
          assert.deepStrictEqual(model.getLinesContent(), ["line3", "line2", "line1"]);
        }
      );
    });
    test("excludes end line when selection ends at column 1", function() {
      withTestCodeEditor(
        [
          "line1",
          "line2",
          "line3",
          "line4",
          "line5"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const reverseLinesAction = new ReverseLinesAction();
          editor.setSelection(new Selection(2, 1, 4, 1));
          executeAction(reverseLinesAction, editor);
          assert.deepStrictEqual(model.getLinesContent(), ["line1", "line3", "line2", "line4", "line5"]);
        }
      );
    });
    test("applies to whole document when selection is single line", function() {
      withTestCodeEditor(
        [
          "omicron",
          "beta",
          "alpha"
        ],
        {},
        (editor) => {
          const model = editor.getModel();
          const reverseLinesAction = new ReverseLinesAction();
          editor.setSelection(new Selection(2, 1, 2, 4));
          executeAction(reverseLinesAction, editor);
          assert.deepStrictEqual(model.getLinesContent(), [
            "alpha",
            "beta",
            "omicron"
          ]);
        }
      );
    });
  });
  test("transpose", () => {
    withTestCodeEditor(
      [
        "hello world",
        "",
        "",
        "   "
      ],
      {},
      (editor) => {
        const model = editor.getModel();
        const transposeAction = new TransposeAction();
        editor.setSelection(new Selection(1, 1, 1, 1));
        executeAction(transposeAction, editor);
        assert.strictEqual(model.getLineContent(1), "hello world");
        assertSelection(editor, new Selection(1, 2, 1, 2));
        editor.setSelection(new Selection(1, 6, 1, 6));
        executeAction(transposeAction, editor);
        assert.strictEqual(model.getLineContent(1), "hell oworld");
        assertSelection(editor, new Selection(1, 7, 1, 7));
        editor.setSelection(new Selection(1, 12, 1, 12));
        executeAction(transposeAction, editor);
        assert.strictEqual(model.getLineContent(1), "hell oworl");
        assertSelection(editor, new Selection(2, 2, 2, 2));
        editor.setSelection(new Selection(3, 1, 3, 1));
        executeAction(transposeAction, editor);
        assert.strictEqual(model.getLineContent(3), "");
        assertSelection(editor, new Selection(4, 1, 4, 1));
        editor.setSelection(new Selection(4, 2, 4, 2));
        executeAction(transposeAction, editor);
        assert.strictEqual(model.getLineContent(4), "   ");
        assertSelection(editor, new Selection(4, 3, 4, 3));
      }
    );
    withTestCodeEditor(
      [
        "",
        "",
        "hello",
        "world",
        "",
        "hello world",
        "",
        "hello world"
      ],
      {},
      (editor) => {
        const model = editor.getModel();
        const transposeAction = new TransposeAction();
        editor.setSelection(new Selection(1, 1, 1, 1));
        executeAction(transposeAction, editor);
        assert.strictEqual(model.getLineContent(2), "");
        assertSelection(editor, new Selection(2, 1, 2, 1));
        editor.setSelection(new Selection(3, 6, 3, 6));
        executeAction(transposeAction, editor);
        assert.strictEqual(model.getLineContent(4), "oworld");
        assertSelection(editor, new Selection(4, 2, 4, 2));
        editor.setSelection(new Selection(6, 12, 6, 12));
        executeAction(transposeAction, editor);
        assert.strictEqual(model.getLineContent(7), "d");
        assertSelection(editor, new Selection(7, 2, 7, 2));
        editor.setSelection(new Selection(8, 12, 8, 12));
        executeAction(transposeAction, editor);
        assert.strictEqual(model.getLineContent(8), "hello world");
        assertSelection(editor, new Selection(8, 12, 8, 12));
      }
    );
  });
  test("toggle case", function() {
    withTestCodeEditor(
      [
        "hello world",
        "\xF6\xE7\u015F\u011F\xFC",
        "parseHTMLString",
        "getElementById",
        "insertHTML",
        "PascalCase",
        "CSSSelectorsList",
        "iD",
        "tEST",
        "\xF6\xE7\u015F\xD6\xC7\u015E\u011F\xFC\u011E\xDC",
        "audioConverter.convertM4AToMP3();",
        "snake_case",
        "Capital_Snake_Case",
        `function helloWorld() {
				return someGlobalObject.printHelloWorld("en", "utf-8");
				}
				helloWorld();`.replace(/^\s+/gm, ""),
        `'JavaScript'`,
        "parseHTML4String",
        "_accessor: ServicesAccessor"
      ],
      {},
      (editor) => {
        const model = editor.getModel();
        const uppercaseAction = new UpperCaseAction();
        const lowercaseAction = new LowerCaseAction();
        const titlecaseAction = new TitleCaseAction();
        const snakecaseAction = new SnakeCaseAction();
        editor.setSelection(new Selection(1, 1, 1, 12));
        executeAction(uppercaseAction, editor);
        assert.strictEqual(model.getLineContent(1), "HELLO WORLD");
        assertSelection(editor, new Selection(1, 1, 1, 12));
        editor.setSelection(new Selection(1, 1, 1, 12));
        executeAction(lowercaseAction, editor);
        assert.strictEqual(model.getLineContent(1), "hello world");
        assertSelection(editor, new Selection(1, 1, 1, 12));
        editor.setSelection(new Selection(1, 3, 1, 3));
        executeAction(uppercaseAction, editor);
        assert.strictEqual(model.getLineContent(1), "HELLO world");
        assertSelection(editor, new Selection(1, 3, 1, 3));
        editor.setSelection(new Selection(1, 4, 1, 4));
        executeAction(lowercaseAction, editor);
        assert.strictEqual(model.getLineContent(1), "hello world");
        assertSelection(editor, new Selection(1, 4, 1, 4));
        editor.setSelection(new Selection(1, 1, 1, 12));
        executeAction(titlecaseAction, editor);
        assert.strictEqual(model.getLineContent(1), "Hello World");
        assertSelection(editor, new Selection(1, 1, 1, 12));
        editor.setSelection(new Selection(2, 1, 2, 6));
        executeAction(uppercaseAction, editor);
        assert.strictEqual(model.getLineContent(2), "\xD6\xC7\u015E\u011E\xDC");
        assertSelection(editor, new Selection(2, 1, 2, 6));
        editor.setSelection(new Selection(2, 1, 2, 6));
        executeAction(lowercaseAction, editor);
        assert.strictEqual(model.getLineContent(2), "\xF6\xE7\u015F\u011F\xFC");
        assertSelection(editor, new Selection(2, 1, 2, 6));
        editor.setSelection(new Selection(2, 1, 2, 6));
        executeAction(titlecaseAction, editor);
        assert.strictEqual(model.getLineContent(2), "\xD6\xE7\u015F\u011F\xFC");
        assertSelection(editor, new Selection(2, 1, 2, 6));
        editor.setSelection(new Selection(3, 1, 3, 16));
        executeAction(snakecaseAction, editor);
        assert.strictEqual(model.getLineContent(3), "parse_html_string");
        assertSelection(editor, new Selection(3, 1, 3, 18));
        editor.setSelection(new Selection(4, 1, 4, 15));
        executeAction(snakecaseAction, editor);
        assert.strictEqual(model.getLineContent(4), "get_element_by_id");
        assertSelection(editor, new Selection(4, 1, 4, 18));
        editor.setSelection(new Selection(5, 1, 5, 11));
        executeAction(snakecaseAction, editor);
        assert.strictEqual(model.getLineContent(5), "insert_html");
        assertSelection(editor, new Selection(5, 1, 5, 12));
        editor.setSelection(new Selection(6, 1, 6, 11));
        executeAction(snakecaseAction, editor);
        assert.strictEqual(model.getLineContent(6), "pascal_case");
        assertSelection(editor, new Selection(6, 1, 6, 12));
        editor.setSelection(new Selection(7, 1, 7, 17));
        executeAction(snakecaseAction, editor);
        assert.strictEqual(model.getLineContent(7), "css_selectors_list");
        assertSelection(editor, new Selection(7, 1, 7, 19));
        editor.setSelection(new Selection(8, 1, 8, 3));
        executeAction(snakecaseAction, editor);
        assert.strictEqual(model.getLineContent(8), "i_d");
        assertSelection(editor, new Selection(8, 1, 8, 4));
        editor.setSelection(new Selection(9, 1, 9, 5));
        executeAction(snakecaseAction, editor);
        assert.strictEqual(model.getLineContent(9), "t_est");
        assertSelection(editor, new Selection(9, 1, 9, 6));
        editor.setSelection(new Selection(10, 1, 10, 11));
        executeAction(snakecaseAction, editor);
        assert.strictEqual(model.getLineContent(10), "\xF6\xE7\u015F_\xF6\xE7_\u015F\u011F\xFC_\u011F\xFC");
        assertSelection(editor, new Selection(10, 1, 10, 14));
        editor.setSelection(new Selection(11, 1, 11, 34));
        executeAction(snakecaseAction, editor);
        assert.strictEqual(model.getLineContent(11), "audio_converter.convert_m4a_to_mp3();");
        assertSelection(editor, new Selection(11, 1, 11, 38));
        editor.setSelection(new Selection(12, 1, 12, 11));
        executeAction(snakecaseAction, editor);
        assert.strictEqual(model.getLineContent(12), "snake_case");
        assertSelection(editor, new Selection(12, 1, 12, 11));
        editor.setSelection(new Selection(13, 1, 13, 19));
        executeAction(snakecaseAction, editor);
        assert.strictEqual(model.getLineContent(13), "capital_snake_case");
        assertSelection(editor, new Selection(13, 1, 13, 19));
        editor.setSelection(new Selection(14, 1, 17, 14));
        executeAction(snakecaseAction, editor);
        assert.strictEqual(model.getValueInRange(new Selection(14, 1, 17, 15)), `function hello_world() {
					return some_global_object.print_hello_world("en", "utf-8");
				}
				hello_world();`.replace(/^\s+/gm, ""));
        assertSelection(editor, new Selection(14, 1, 17, 15));
        editor.setSelection(new Selection(18, 1, 18, 13));
        executeAction(snakecaseAction, editor);
        assert.strictEqual(model.getLineContent(18), `'java_script'`);
        assertSelection(editor, new Selection(18, 1, 18, 14));
        editor.setSelection(new Selection(19, 1, 19, 17));
        executeAction(snakecaseAction, editor);
        assert.strictEqual(model.getLineContent(19), "parse_html4_string");
        assertSelection(editor, new Selection(19, 1, 19, 19));
        editor.setSelection(new Selection(20, 1, 20, 28));
        executeAction(snakecaseAction, editor);
        assert.strictEqual(model.getLineContent(20), "_accessor: services_accessor");
        assertSelection(editor, new Selection(20, 1, 20, 29));
      }
    );
    withTestCodeEditor(
      [
        "foO baR BaZ",
        "foO'baR'BaZ",
        "foO[baR]BaZ",
        "foO`baR~BaZ",
        "foO^baR%BaZ",
        "foO$baR!BaZ",
        "'physician's assistant'"
      ],
      {},
      (editor) => {
        const model = editor.getModel();
        const titlecaseAction = new TitleCaseAction();
        editor.setSelection(new Selection(1, 1, 1, 12));
        executeAction(titlecaseAction, editor);
        assert.strictEqual(model.getLineContent(1), "Foo Bar Baz");
        editor.setSelection(new Selection(2, 1, 2, 12));
        executeAction(titlecaseAction, editor);
        assert.strictEqual(model.getLineContent(2), "Foo'bar'baz");
        editor.setSelection(new Selection(3, 1, 3, 12));
        executeAction(titlecaseAction, editor);
        assert.strictEqual(model.getLineContent(3), "Foo[Bar]Baz");
        editor.setSelection(new Selection(4, 1, 4, 12));
        executeAction(titlecaseAction, editor);
        assert.strictEqual(model.getLineContent(4), "Foo`Bar~Baz");
        editor.setSelection(new Selection(5, 1, 5, 12));
        executeAction(titlecaseAction, editor);
        assert.strictEqual(model.getLineContent(5), "Foo^Bar%Baz");
        editor.setSelection(new Selection(6, 1, 6, 12));
        executeAction(titlecaseAction, editor);
        assert.strictEqual(model.getLineContent(6), "Foo$Bar!Baz");
        editor.setSelection(new Selection(7, 1, 7, 23));
        executeAction(titlecaseAction, editor);
        assert.strictEqual(model.getLineContent(7), "'Physician's Assistant'");
      }
    );
    withTestCodeEditor(
      [
        "camel from words",
        "from_snake_case",
        "from-kebab-case",
        "alreadyCamel",
        "ReTain_some_CAPitalization",
        "my_var.test_function()",
        "\xF6\xE7\u015F_\xF6\xE7_\u015F\u011F\xFC_\u011F\xFC",
        "XMLHttpRequest",
        "	function hello_world() {",
        "		return some_global_object;",
        "	}"
      ],
      {},
      (editor) => {
        const model = editor.getModel();
        const camelcaseAction = new CamelCaseAction();
        editor.setSelection(new Selection(1, 1, 1, 18));
        executeAction(camelcaseAction, editor);
        assert.strictEqual(model.getLineContent(1), "camelFromWords");
        editor.setSelection(new Selection(2, 1, 2, 15));
        executeAction(camelcaseAction, editor);
        assert.strictEqual(model.getLineContent(2), "fromSnakeCase");
        editor.setSelection(new Selection(3, 1, 3, 15));
        executeAction(camelcaseAction, editor);
        assert.strictEqual(model.getLineContent(3), "fromKebabCase");
        editor.setSelection(new Selection(4, 1, 4, 12));
        executeAction(camelcaseAction, editor);
        assert.strictEqual(model.getLineContent(4), "alreadyCamel");
        editor.setSelection(new Selection(5, 1, 5, 26));
        executeAction(camelcaseAction, editor);
        assert.strictEqual(model.getLineContent(5), "reTainSomeCAPitalization");
        editor.setSelection(new Selection(6, 1, 6, 23));
        executeAction(camelcaseAction, editor);
        assert.strictEqual(model.getLineContent(6), "myVar.testFunction()");
        editor.setSelection(new Selection(7, 1, 7, 14));
        executeAction(camelcaseAction, editor);
        assert.strictEqual(model.getLineContent(7), "\xF6\xE7\u015F\xD6\xE7\u015E\u011F\xFC\u011E\xFC");
        editor.setSelection(new Selection(8, 1, 8, 14));
        executeAction(camelcaseAction, editor);
        assert.strictEqual(model.getLineContent(8), "XMLHttpRequest");
        editor.setSelection(new Selection(9, 1, 11, 2));
        executeAction(camelcaseAction, editor);
        assert.strictEqual(model.getValueInRange(new Selection(9, 1, 11, 3)), "	function helloWorld() {\n		return someGlobalObject;\n	}");
      }
    );
    withTestCodeEditor(
      [
        "",
        "   "
      ],
      {},
      (editor) => {
        const model = editor.getModel();
        const uppercaseAction = new UpperCaseAction();
        const lowercaseAction = new LowerCaseAction();
        editor.setSelection(new Selection(1, 1, 1, 1));
        executeAction(uppercaseAction, editor);
        assert.strictEqual(model.getLineContent(1), "");
        assertSelection(editor, new Selection(1, 1, 1, 1));
        editor.setSelection(new Selection(1, 1, 1, 1));
        executeAction(lowercaseAction, editor);
        assert.strictEqual(model.getLineContent(1), "");
        assertSelection(editor, new Selection(1, 1, 1, 1));
        editor.setSelection(new Selection(2, 2, 2, 2));
        executeAction(uppercaseAction, editor);
        assert.strictEqual(model.getLineContent(2), "   ");
        assertSelection(editor, new Selection(2, 2, 2, 2));
        editor.setSelection(new Selection(2, 2, 2, 2));
        executeAction(lowercaseAction, editor);
        assert.strictEqual(model.getLineContent(2), "   ");
        assertSelection(editor, new Selection(2, 2, 2, 2));
      }
    );
    withTestCodeEditor(
      [
        "hello world",
        "\xF6\xE7\u015F\u011F\xFC",
        "parseHTMLString",
        "getElementById",
        "PascalCase",
        "\xF6\xE7\u015F\xD6\xC7\u015E\u011F\xFC\u011E\xDC",
        "audioConverter.convertM4AToMP3();",
        "Capital_Snake_Case",
        "parseHTML4String",
        "_accessor: ServicesAccessor",
        "Kebab-Case"
      ],
      {},
      (editor) => {
        const model = editor.getModel();
        const kebabCaseAction = new KebabCaseAction();
        editor.setSelection(new Selection(1, 1, 1, 12));
        executeAction(kebabCaseAction, editor);
        assert.strictEqual(model.getLineContent(1), "hello world");
        assertSelection(editor, new Selection(1, 1, 1, 12));
        editor.setSelection(new Selection(2, 1, 2, 6));
        executeAction(kebabCaseAction, editor);
        assert.strictEqual(model.getLineContent(2), "\xF6\xE7\u015F\u011F\xFC");
        assertSelection(editor, new Selection(2, 1, 2, 6));
        editor.setSelection(new Selection(3, 1, 3, 16));
        executeAction(kebabCaseAction, editor);
        assert.strictEqual(model.getLineContent(3), "parse-html-string");
        assertSelection(editor, new Selection(3, 1, 3, 18));
        editor.setSelection(new Selection(4, 1, 4, 15));
        executeAction(kebabCaseAction, editor);
        assert.strictEqual(model.getLineContent(4), "get-element-by-id");
        assertSelection(editor, new Selection(4, 1, 4, 18));
        editor.setSelection(new Selection(5, 1, 5, 11));
        executeAction(kebabCaseAction, editor);
        assert.strictEqual(model.getLineContent(5), "pascal-case");
        assertSelection(editor, new Selection(5, 1, 5, 12));
        editor.setSelection(new Selection(6, 1, 6, 11));
        executeAction(kebabCaseAction, editor);
        assert.strictEqual(model.getLineContent(6), "\xF6\xE7\u015F-\xF6\xE7-\u015F\u011F\xFC-\u011F\xFC");
        assertSelection(editor, new Selection(6, 1, 6, 14));
        editor.setSelection(new Selection(7, 1, 7, 34));
        executeAction(kebabCaseAction, editor);
        assert.strictEqual(model.getLineContent(7), "audio-converter.convert-m4a-to-mp3();");
        assertSelection(editor, new Selection(7, 1, 7, 38));
        editor.setSelection(new Selection(8, 1, 8, 19));
        executeAction(kebabCaseAction, editor);
        assert.strictEqual(model.getLineContent(8), "capital-snake-case");
        assertSelection(editor, new Selection(8, 1, 8, 19));
        editor.setSelection(new Selection(9, 1, 9, 17));
        executeAction(kebabCaseAction, editor);
        assert.strictEqual(model.getLineContent(9), "parse-html4-string");
        assertSelection(editor, new Selection(9, 1, 9, 19));
        editor.setSelection(new Selection(10, 1, 10, 28));
        executeAction(kebabCaseAction, editor);
        assert.strictEqual(model.getLineContent(10), "_accessor: services-accessor");
        assertSelection(editor, new Selection(10, 1, 10, 29));
        editor.setSelection(new Selection(11, 1, 11, 11));
        executeAction(kebabCaseAction, editor);
        assert.strictEqual(model.getLineContent(11), "kebab-case");
        assertSelection(editor, new Selection(11, 1, 11, 11));
      }
    );
    withTestCodeEditor(
      [
        "hello world",
        "\xF6\xE7\u015F\u011F\xFC",
        "parseHTMLString",
        "getElementById",
        "PascalCase",
        "\xF6\xE7\u015F\xD6\xC7\u015E\u011F\xFC\u011E\xDC",
        "audioConverter.convertM4AToMP3();",
        "Capital_Snake_Case",
        "parseHTML4String",
        "Kebab-Case",
        "FOO_BAR",
        "FOO BAR A",
        "xML_HTTP-reQUEsT",
        "\xC9COLE",
        "\u03A9MEGA_CASE",
        "\u0414\u041E\u041C_\u0422\u0415\u0421\u0422"
      ],
      {},
      (editor) => {
        const model = editor.getModel();
        const pascalCaseAction = new PascalCaseAction();
        editor.setSelection(new Selection(1, 1, 1, 12));
        executeAction(pascalCaseAction, editor);
        assert.strictEqual(model.getLineContent(1), "HelloWorld");
        assertSelection(editor, new Selection(1, 1, 1, 11));
        editor.setSelection(new Selection(2, 1, 2, 6));
        executeAction(pascalCaseAction, editor);
        assert.strictEqual(model.getLineContent(2), "\xD6\xE7\u015F\u011F\xFC");
        assertSelection(editor, new Selection(2, 1, 2, 6));
        editor.setSelection(new Selection(3, 1, 3, 16));
        executeAction(pascalCaseAction, editor);
        assert.strictEqual(model.getLineContent(3), "ParseHTMLString");
        assertSelection(editor, new Selection(3, 1, 3, 16));
        editor.setSelection(new Selection(4, 1, 4, 15));
        executeAction(pascalCaseAction, editor);
        assert.strictEqual(model.getLineContent(4), "GetElementById");
        assertSelection(editor, new Selection(4, 1, 4, 15));
        editor.setSelection(new Selection(5, 1, 5, 11));
        executeAction(pascalCaseAction, editor);
        assert.strictEqual(model.getLineContent(5), "PascalCase");
        assertSelection(editor, new Selection(5, 1, 5, 11));
        editor.setSelection(new Selection(6, 1, 6, 11));
        executeAction(pascalCaseAction, editor);
        assert.strictEqual(model.getLineContent(6), "\xD6\xE7\u015F\xD6\xC7\u015E\u011F\xFC\u011E\xDC");
        assertSelection(editor, new Selection(6, 1, 6, 11));
        editor.setSelection(new Selection(7, 1, 7, 34));
        executeAction(pascalCaseAction, editor);
        assert.strictEqual(model.getLineContent(7), "AudioConverter.ConvertM4AToMP3();");
        assertSelection(editor, new Selection(7, 1, 7, 34));
        editor.setSelection(new Selection(8, 1, 8, 19));
        executeAction(pascalCaseAction, editor);
        assert.strictEqual(model.getLineContent(8), "CapitalSnakeCase");
        assertSelection(editor, new Selection(8, 1, 8, 17));
        editor.setSelection(new Selection(9, 1, 9, 17));
        executeAction(pascalCaseAction, editor);
        assert.strictEqual(model.getLineContent(9), "ParseHTML4String");
        assertSelection(editor, new Selection(9, 1, 9, 17));
        editor.setSelection(new Selection(10, 1, 10, 11));
        executeAction(pascalCaseAction, editor);
        assert.strictEqual(model.getLineContent(10), "KebabCase");
        assertSelection(editor, new Selection(10, 1, 10, 10));
        editor.setSelection(new Selection(9, 1, 10, 11));
        executeAction(pascalCaseAction, editor);
        assert.strictEqual(model.getValueInRange(new Selection(9, 1, 10, 11)), "ParseHTML4String\nKebabCase");
        assertSelection(editor, new Selection(9, 1, 10, 10));
        editor.setSelection(new Selection(11, 1, 11, 8));
        executeAction(pascalCaseAction, editor);
        assert.strictEqual(model.getLineContent(11), "FooBar");
        assertSelection(editor, new Selection(11, 1, 11, 7));
        editor.setSelection(new Selection(12, 1, 12, 10));
        executeAction(pascalCaseAction, editor);
        assert.strictEqual(model.getLineContent(12), "FooBarA");
        assertSelection(editor, new Selection(12, 1, 12, 8));
        editor.setSelection(new Selection(13, 1, 13, 17));
        executeAction(pascalCaseAction, editor);
        assert.strictEqual(model.getLineContent(13), "XmlHttpReQUEsT");
        assertSelection(editor, new Selection(13, 1, 13, 15));
        editor.setSelection(new Selection(14, 1, 14, 6));
        executeAction(pascalCaseAction, editor);
        assert.strictEqual(model.getLineContent(14), "\xC9cole");
        assertSelection(editor, new Selection(14, 1, 14, 6));
        editor.setSelection(new Selection(15, 1, 15, 11));
        executeAction(pascalCaseAction, editor);
        assert.strictEqual(model.getLineContent(15), "\u03A9megaCase");
        assertSelection(editor, new Selection(15, 1, 15, 10));
        editor.setSelection(new Selection(16, 1, 16, 9));
        executeAction(pascalCaseAction, editor);
        assert.strictEqual(model.getLineContent(16), "\u0414\u043E\u043C\u0422\u0435\u0441\u0442");
        assertSelection(editor, new Selection(16, 1, 16, 8));
      }
    );
  });
  suite("DeleteAllRightAction", () => {
    test("should be noop on empty", () => {
      withTestCodeEditor([""], {}, (editor) => {
        const model = editor.getModel();
        const action = new DeleteAllRightAction();
        executeAction(action, editor);
        assert.deepStrictEqual(model.getLinesContent(), [""]);
        assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 1, 1, 1)]);
        editor.setSelection(new Selection(1, 1, 1, 1));
        executeAction(action, editor);
        assert.deepStrictEqual(model.getLinesContent(), [""]);
        assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 1, 1, 1)]);
        editor.setSelections([new Selection(1, 1, 1, 1), new Selection(1, 1, 1, 1), new Selection(1, 1, 1, 1)]);
        executeAction(action, editor);
        assert.deepStrictEqual(model.getLinesContent(), [""]);
        assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 1, 1, 1)]);
      });
    });
    test("should delete selected range", () => {
      withTestCodeEditor([
        "hello",
        "world"
      ], {}, (editor) => {
        const model = editor.getModel();
        const action = new DeleteAllRightAction();
        editor.setSelection(new Selection(1, 2, 1, 5));
        executeAction(action, editor);
        assert.deepStrictEqual(model.getLinesContent(), ["ho", "world"]);
        assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 2, 1, 2)]);
        editor.setSelection(new Selection(1, 1, 2, 4));
        executeAction(action, editor);
        assert.deepStrictEqual(model.getLinesContent(), ["ld"]);
        assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 1, 1, 1)]);
        editor.setSelection(new Selection(1, 1, 1, 3));
        executeAction(action, editor);
        assert.deepStrictEqual(model.getLinesContent(), [""]);
        assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 1, 1, 1)]);
      });
    });
    test("should delete to the right of the cursor", () => {
      withTestCodeEditor([
        "hello",
        "world"
      ], {}, (editor) => {
        const model = editor.getModel();
        const action = new DeleteAllRightAction();
        editor.setSelection(new Selection(1, 3, 1, 3));
        executeAction(action, editor);
        assert.deepStrictEqual(model.getLinesContent(), ["he", "world"]);
        assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 3, 1, 3)]);
        editor.setSelection(new Selection(2, 1, 2, 1));
        executeAction(action, editor);
        assert.deepStrictEqual(model.getLinesContent(), ["he", ""]);
        assert.deepStrictEqual(editor.getSelections(), [new Selection(2, 1, 2, 1)]);
      });
    });
    test("should join two lines, if at the end of the line", () => {
      withTestCodeEditor([
        "hello",
        "world"
      ], {}, (editor) => {
        const model = editor.getModel();
        const action = new DeleteAllRightAction();
        editor.setSelection(new Selection(1, 6, 1, 6));
        executeAction(action, editor);
        assert.deepStrictEqual(model.getLinesContent(), ["helloworld"]);
        assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 6, 1, 6)]);
        editor.setSelection(new Selection(1, 6, 1, 6));
        executeAction(action, editor);
        assert.deepStrictEqual(model.getLinesContent(), ["hello"]);
        assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 6, 1, 6)]);
        editor.setSelection(new Selection(1, 6, 1, 6));
        executeAction(action, editor);
        assert.deepStrictEqual(model.getLinesContent(), ["hello"]);
        assert.deepStrictEqual(editor.getSelections(), [new Selection(1, 6, 1, 6)]);
      });
    });
    test("should work with multiple cursors", () => {
      withTestCodeEditor([
        "hello",
        "there",
        "world"
      ], {}, (editor) => {
        const model = editor.getModel();
        const action = new DeleteAllRightAction();
        editor.setSelections([
          new Selection(1, 3, 1, 3),
          new Selection(1, 6, 1, 6),
          new Selection(3, 4, 3, 4)
        ]);
        executeAction(action, editor);
        assert.deepStrictEqual(model.getLinesContent(), ["hethere", "wor"]);
        assert.deepStrictEqual(editor.getSelections(), [
          new Selection(1, 3, 1, 3),
          new Selection(2, 4, 2, 4)
        ]);
        executeAction(action, editor);
        assert.deepStrictEqual(model.getLinesContent(), ["he", "wor"]);
        assert.deepStrictEqual(editor.getSelections(), [
          new Selection(1, 3, 1, 3),
          new Selection(2, 4, 2, 4)
        ]);
        executeAction(action, editor);
        assert.deepStrictEqual(model.getLinesContent(), ["hewor"]);
        assert.deepStrictEqual(editor.getSelections(), [
          new Selection(1, 3, 1, 3),
          new Selection(1, 6, 1, 6)
        ]);
        executeAction(action, editor);
        assert.deepStrictEqual(model.getLinesContent(), ["he"]);
        assert.deepStrictEqual(editor.getSelections(), [
          new Selection(1, 3, 1, 3)
        ]);
        executeAction(action, editor);
        assert.deepStrictEqual(model.getLinesContent(), ["he"]);
        assert.deepStrictEqual(editor.getSelections(), [
          new Selection(1, 3, 1, 3)
        ]);
      });
    });
    test("should work with undo/redo", () => {
      withTestCodeEditor([
        "hello",
        "there",
        "world"
      ], {}, (editor) => {
        const model = editor.getModel();
        const action = new DeleteAllRightAction();
        editor.setSelections([
          new Selection(1, 3, 1, 3),
          new Selection(1, 6, 1, 6),
          new Selection(3, 4, 3, 4)
        ]);
        executeAction(action, editor);
        assert.deepStrictEqual(model.getLinesContent(), ["hethere", "wor"]);
        assert.deepStrictEqual(editor.getSelections(), [
          new Selection(1, 3, 1, 3),
          new Selection(2, 4, 2, 4)
        ]);
        editor.runCommand(CoreEditingCommands.Undo, null);
        assert.deepStrictEqual(editor.getSelections(), [
          new Selection(1, 3, 1, 3),
          new Selection(1, 6, 1, 6),
          new Selection(3, 4, 3, 4)
        ]);
        editor.runCommand(CoreEditingCommands.Redo, null);
        assert.deepStrictEqual(editor.getSelections(), [
          new Selection(1, 3, 1, 3),
          new Selection(2, 4, 2, 4)
        ]);
      });
    });
  });
  test("InsertLineBeforeAction", () => {
    function testInsertLineBefore(lineNumber, column, callback) {
      const TEXT = [
        "First line",
        "Second line",
        "Third line"
      ];
      withTestCodeEditor(TEXT, {}, (editor, viewModel) => {
        editor.setPosition(new Position(lineNumber, column));
        const insertLineBeforeAction = new InsertLineBeforeAction();
        executeAction(insertLineBeforeAction, editor);
        callback(editor.getModel(), viewModel);
      });
    }
    testInsertLineBefore(1, 3, (model, viewModel) => {
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(1, 1, 1, 1));
      assert.strictEqual(model.getLineContent(1), "");
      assert.strictEqual(model.getLineContent(2), "First line");
      assert.strictEqual(model.getLineContent(3), "Second line");
      assert.strictEqual(model.getLineContent(4), "Third line");
    });
    testInsertLineBefore(2, 3, (model, viewModel) => {
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(2, 1, 2, 1));
      assert.strictEqual(model.getLineContent(1), "First line");
      assert.strictEqual(model.getLineContent(2), "");
      assert.strictEqual(model.getLineContent(3), "Second line");
      assert.strictEqual(model.getLineContent(4), "Third line");
    });
    testInsertLineBefore(3, 3, (model, viewModel) => {
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(3, 1, 3, 1));
      assert.strictEqual(model.getLineContent(1), "First line");
      assert.strictEqual(model.getLineContent(2), "Second line");
      assert.strictEqual(model.getLineContent(3), "");
      assert.strictEqual(model.getLineContent(4), "Third line");
    });
  });
  test("InsertLineAfterAction", () => {
    function testInsertLineAfter(lineNumber, column, callback) {
      const TEXT = [
        "First line",
        "Second line",
        "Third line"
      ];
      withTestCodeEditor(TEXT, {}, (editor, viewModel) => {
        editor.setPosition(new Position(lineNumber, column));
        const insertLineAfterAction = new InsertLineAfterAction();
        executeAction(insertLineAfterAction, editor);
        callback(editor.getModel(), viewModel);
      });
    }
    testInsertLineAfter(1, 3, (model, viewModel) => {
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(2, 1, 2, 1));
      assert.strictEqual(model.getLineContent(1), "First line");
      assert.strictEqual(model.getLineContent(2), "");
      assert.strictEqual(model.getLineContent(3), "Second line");
      assert.strictEqual(model.getLineContent(4), "Third line");
    });
    testInsertLineAfter(2, 3, (model, viewModel) => {
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(3, 1, 3, 1));
      assert.strictEqual(model.getLineContent(1), "First line");
      assert.strictEqual(model.getLineContent(2), "Second line");
      assert.strictEqual(model.getLineContent(3), "");
      assert.strictEqual(model.getLineContent(4), "Third line");
    });
    testInsertLineAfter(3, 3, (model, viewModel) => {
      assert.deepStrictEqual(viewModel.getSelection(), new Selection(4, 1, 4, 1));
      assert.strictEqual(model.getLineContent(1), "First line");
      assert.strictEqual(model.getLineContent(2), "Second line");
      assert.strictEqual(model.getLineContent(3), "Third line");
      assert.strictEqual(model.getLineContent(4), "");
    });
  });
  test("Bug 18276:[editor] Indentation broken when selection is empty", () => {
    const model = createTextModel(
      [
        "function baz() {"
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor(model, {}, (editor) => {
      const indentLinesAction = new IndentLinesAction();
      editor.setPosition(new Position(1, 2));
      executeAction(indentLinesAction, editor);
      assert.strictEqual(model.getLineContent(1), "	function baz() {");
      assert.deepStrictEqual(editor.getSelection(), new Selection(1, 3, 1, 3));
      editor.runCommand(CoreEditingCommands.Tab, null);
      assert.strictEqual(model.getLineContent(1), "	f	unction baz() {");
    });
    model.dispose();
  });
  test("issue #80736: Indenting while the cursor is at the start of a line of text causes the added spaces or tab to be selected", () => {
    const model = createTextModel(
      [
        "Some text"
      ].join("\n"),
      void 0,
      {
        insertSpaces: false
      }
    );
    withTestCodeEditor(model, {}, (editor) => {
      const indentLinesAction = new IndentLinesAction();
      editor.setPosition(new Position(1, 1));
      executeAction(indentLinesAction, editor);
      assert.strictEqual(model.getLineContent(1), "	Some text");
      assert.deepStrictEqual(editor.getSelection(), new Selection(1, 2, 1, 2));
    });
    model.dispose();
  });
  test("Indenting on empty line should move cursor", () => {
    const model = createTextModel(
      [
        ""
      ].join("\n")
    );
    withTestCodeEditor(model, { useTabStops: false }, (editor) => {
      const indentLinesAction = new IndentLinesAction();
      editor.setPosition(new Position(1, 1));
      executeAction(indentLinesAction, editor);
      assert.strictEqual(model.getLineContent(1), "    ");
      assert.deepStrictEqual(editor.getSelection(), new Selection(1, 5, 1, 5));
    });
    model.dispose();
  });
  test("issue #62112: Delete line does not work properly when multiple cursors are on line", () => {
    const TEXT = [
      "a",
      "foo boo",
      "too",
      "c"
    ];
    withTestCodeEditor(TEXT, {}, (editor) => {
      editor.setSelections([
        new Selection(2, 4, 2, 4),
        new Selection(2, 8, 2, 8),
        new Selection(3, 4, 3, 4)
      ]);
      const deleteLinesAction = new DeleteLinesAction();
      executeAction(deleteLinesAction, editor);
      assert.strictEqual(editor.getValue(), "a\nc");
    });
  });
  function testDeleteLinesCommand(initialText, _initialSelections, resultingText, _resultingSelections) {
    const initialSelections = Array.isArray(_initialSelections) ? _initialSelections : [_initialSelections];
    const resultingSelections = Array.isArray(_resultingSelections) ? _resultingSelections : [_resultingSelections];
    withTestCodeEditor(initialText, {}, (editor) => {
      editor.setSelections(initialSelections);
      const deleteLinesAction = new DeleteLinesAction();
      executeAction(deleteLinesAction, editor);
      assert.strictEqual(editor.getValue(), resultingText.join("\n"));
      assert.deepStrictEqual(editor.getSelections(), resultingSelections);
    });
  }
  test("empty selection in middle of lines", function() {
    testDeleteLinesCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 3, 2, 3),
      [
        "first",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 3, 2, 3)
    );
  });
  test("empty selection at top of lines", function() {
    testDeleteLinesCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 5, 1, 5),
      [
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 5, 1, 5)
    );
  });
  test("empty selection at end of lines", function() {
    testDeleteLinesCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(5, 2, 5, 2),
      [
        "first",
        "second line",
        "third line",
        "fourth line"
      ],
      new Selection(4, 2, 4, 2)
    );
  });
  test("with selection in middle of lines", function() {
    testDeleteLinesCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(3, 3, 2, 2),
      [
        "first",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 2, 2, 2)
    );
  });
  test("with selection at top of lines", function() {
    testDeleteLinesCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 4, 1, 5),
      [
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 5, 1, 5)
    );
  });
  test("with selection at end of lines", function() {
    testDeleteLinesCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(5, 1, 5, 2),
      [
        "first",
        "second line",
        "third line",
        "fourth line"
      ],
      new Selection(4, 2, 4, 2)
    );
  });
  test("with full line selection in middle of lines", function() {
    testDeleteLinesCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(4, 1, 2, 1),
      [
        "first",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 1, 2, 1)
    );
  });
  test("with full line selection at top of lines", function() {
    testDeleteLinesCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(2, 1, 1, 5),
      [
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(1, 5, 1, 5)
    );
  });
  test("with full line selection at end of lines", function() {
    testDeleteLinesCommand(
      [
        "first",
        "second line",
        "third line",
        "fourth line",
        "fifth"
      ],
      new Selection(4, 1, 5, 2),
      [
        "first",
        "second line",
        "third line"
      ],
      new Selection(3, 2, 3, 2)
    );
  });
  test("multicursor 1", function() {
    testDeleteLinesCommand(
      [
        "class P {",
        "",
        "    getA() {",
        "        if (true) {",
        '            return "a";',
        "        }",
        "    }",
        "",
        "    getB() {",
        "        if (true) {",
        '            return "b";',
        "        }",
        "    }",
        "",
        "    getC() {",
        "        if (true) {",
        '            return "c";',
        "        }",
        "    }",
        "}"
      ],
      [
        new Selection(4, 1, 5, 1),
        new Selection(10, 1, 11, 1),
        new Selection(16, 1, 17, 1)
      ],
      [
        "class P {",
        "",
        "    getA() {",
        '            return "a";',
        "        }",
        "    }",
        "",
        "    getB() {",
        '            return "b";',
        "        }",
        "    }",
        "",
        "    getC() {",
        '            return "c";',
        "        }",
        "    }",
        "}"
      ],
      [
        new Selection(4, 1, 4, 1),
        new Selection(9, 1, 9, 1),
        new Selection(14, 1, 14, 1)
      ]
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXGxpbmVzT3BlcmF0aW9uc1xcdGVzdFxcYnJvd3NlclxcbGluZXNPcGVyYXRpb25zLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDb3JlRWRpdGluZ0NvbW1hbmRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9jb3JlQ29tbWFuZHMuanMnO1xuaW1wb3J0IHR5cGUgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSGFuZGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdmlld01vZGVsL3ZpZXdNb2RlbEltcGwuanMnO1xuaW1wb3J0IHsgQ2FtZWxDYXNlQWN0aW9uLCBQYXNjYWxDYXNlQWN0aW9uLCBEZWxldGVBbGxMZWZ0QWN0aW9uLCBEZWxldGVBbGxSaWdodEFjdGlvbiwgRGVsZXRlRHVwbGljYXRlTGluZXNBY3Rpb24sIERlbGV0ZUxpbmVzQWN0aW9uLCBJbmRlbnRMaW5lc0FjdGlvbiwgSW5zZXJ0TGluZUFmdGVyQWN0aW9uLCBJbnNlcnRMaW5lQmVmb3JlQWN0aW9uLCBKb2luTGluZXNBY3Rpb24sIEtlYmFiQ2FzZUFjdGlvbiwgTG93ZXJDYXNlQWN0aW9uLCBTbmFrZUNhc2VBY3Rpb24sIFNvcnRMaW5lc0FzY2VuZGluZ0FjdGlvbiwgU29ydExpbmVzRGVzY2VuZGluZ0FjdGlvbiwgVGl0bGVDYXNlQWN0aW9uLCBUcmFuc3Bvc2VBY3Rpb24sIFVwcGVyQ2FzZUFjdGlvbiwgUmV2ZXJzZUxpbmVzQWN0aW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9saW5lc09wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgd2l0aFRlc3RDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3Rlc3RDb2RlRWRpdG9yLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3Rlc3RUZXh0TW9kZWwuanMnO1xuXG5mdW5jdGlvbiBhc3NlcnRTZWxlY3Rpb24oZWRpdG9yOiBJQ29kZUVkaXRvciwgZXhwZWN0ZWQ6IFNlbGVjdGlvbiB8IFNlbGVjdGlvbltdKTogdm9pZCB7XG5cdGlmICghQXJyYXkuaXNBcnJheShleHBlY3RlZCkpIHtcblx0XHRleHBlY3RlZCA9IFtleHBlY3RlZF07XG5cdH1cblx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBleHBlY3RlZCk7XG59XG5cbmZ1bmN0aW9uIGV4ZWN1dGVBY3Rpb24oYWN0aW9uOiBFZGl0b3JBY3Rpb24sIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0YWN0aW9uLnJ1bihudWxsISwgZWRpdG9yLCB1bmRlZmluZWQpO1xufVxuXG5zdWl0ZSgnRWRpdG9yIENvbnRyaWIgLSBMaW5lIE9wZXJhdGlvbnMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ1NvcnRMaW5lc0FzY2VuZGluZ0FjdGlvbicsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgc29ydCBzZWxlY3RlZCBsaW5lcyBpbiBhc2NlbmRpbmcgb3JkZXInLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHR3aXRoVGVzdENvZGVFZGl0b3IoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnb21pY3JvbicsXG5cdFx0XHRcdFx0J2JldGEnLFxuXHRcdFx0XHRcdCdhbHBoYSdcblx0XHRcdFx0XSwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdFx0XHRjb25zdCBzb3J0TGluZXNBc2NlbmRpbmdBY3Rpb24gPSBuZXcgU29ydExpbmVzQXNjZW5kaW5nQWN0aW9uKCk7XG5cblx0XHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMywgNSkpO1xuXHRcdFx0XHRcdGV4ZWN1dGVBY3Rpb24oc29ydExpbmVzQXNjZW5kaW5nQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZXNDb250ZW50KCksIFtcblx0XHRcdFx0XHRcdCdhbHBoYScsXG5cdFx0XHRcdFx0XHQnYmV0YScsXG5cdFx0XHRcdFx0XHQnb21pY3Jvbidcblx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRhc3NlcnRTZWxlY3Rpb24oZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDMsIDcpKTtcblx0XHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc29ydCBsaW5lcyBpbiBhc2NlbmRpbmcgb3JkZXInLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHR3aXRoVGVzdENvZGVFZGl0b3IoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnb21pY3JvbicsXG5cdFx0XHRcdFx0J2JldGEnLFxuXHRcdFx0XHRcdCdhbHBoYSdcblx0XHRcdFx0XSwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdFx0XHRjb25zdCBzb3J0TGluZXNBc2NlbmRpbmdBY3Rpb24gPSBuZXcgU29ydExpbmVzQXNjZW5kaW5nQWN0aW9uKCk7XG5cblx0XHRcdFx0XHRleGVjdXRlQWN0aW9uKHNvcnRMaW5lc0FzY2VuZGluZ0FjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVzQ29udGVudCgpLCBbXG5cdFx0XHRcdFx0XHQnYWxwaGEnLFxuXHRcdFx0XHRcdFx0J2JldGEnLFxuXHRcdFx0XHRcdFx0J29taWNyb24nXG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHNvcnQgbXVsdGlwbGUgc2VsZWN0aW9ucyBpbiBhc2NlbmRpbmcgb3JkZXInLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHR3aXRoVGVzdENvZGVFZGl0b3IoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnb21pY3JvbicsXG5cdFx0XHRcdFx0J2JldGEnLFxuXHRcdFx0XHRcdCdhbHBoYScsXG5cdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0J29taWNyb24nLFxuXHRcdFx0XHRcdCdiZXRhJyxcblx0XHRcdFx0XHQnYWxwaGEnXG5cdFx0XHRcdF0sIHt9LCAoZWRpdG9yKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRcdFx0Y29uc3Qgc29ydExpbmVzQXNjZW5kaW5nQWN0aW9uID0gbmV3IFNvcnRMaW5lc0FzY2VuZGluZ0FjdGlvbigpO1xuXG5cdFx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW25ldyBTZWxlY3Rpb24oMSwgMSwgMywgNSksIG5ldyBTZWxlY3Rpb24oNSwgMSwgNywgNSldKTtcblx0XHRcdFx0XHRleGVjdXRlQWN0aW9uKHNvcnRMaW5lc0FzY2VuZGluZ0FjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVzQ29udGVudCgpLCBbXG5cdFx0XHRcdFx0XHQnYWxwaGEnLFxuXHRcdFx0XHRcdFx0J2JldGEnLFxuXHRcdFx0XHRcdFx0J29taWNyb24nLFxuXHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XHQnYWxwaGEnLFxuXHRcdFx0XHRcdFx0J2JldGEnLFxuXHRcdFx0XHRcdFx0J29taWNyb24nXG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0Y29uc3QgZXhwZWN0ZWRTZWxlY3Rpb25zID0gW1xuXHRcdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAxLCAzLCA3KSxcblx0XHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oNSwgMSwgNywgNylcblx0XHRcdFx0XHRdO1xuXHRcdFx0XHRcdGVkaXRvci5nZXRTZWxlY3Rpb25zKCkhLmZvckVhY2goKGFjdHVhbFNlbGVjdGlvbiwgaW5kZXgpID0+IHtcblx0XHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsU2VsZWN0aW9uLnRvU3RyaW5nKCksIGV4cGVjdGVkU2VsZWN0aW9uc1tpbmRleF0udG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXBwbGllcyB0byB3aG9sZSBkb2N1bWVudCB3aGVuIHNlbGVjdGlvbiBpcyBzaW5nbGUgbGluZScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdHdpdGhUZXN0Q29kZUVkaXRvcihcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdvbWljcm9uJyxcblx0XHRcdFx0XHQnYmV0YScsXG5cdFx0XHRcdFx0J2FscGhhJ1xuXHRcdFx0XHRdLCB7fSwgKGVkaXRvcikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdFx0XHRcdGNvbnN0IHNvcnRMaW5lc0FzY2VuZGluZ0FjdGlvbiA9IG5ldyBTb3J0TGluZXNBc2NlbmRpbmdBY3Rpb24oKTtcblxuXHRcdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigyLCAxLCAyLCA0KSk7XG5cdFx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihzb3J0TGluZXNBc2NlbmRpbmdBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lc0NvbnRlbnQoKSwgW1xuXHRcdFx0XHRcdFx0J2FscGhhJyxcblx0XHRcdFx0XHRcdCdiZXRhJyxcblx0XHRcdFx0XHRcdCdvbWljcm9uJ1xuXHRcdFx0XHRcdF0pO1xuXHRcdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1NvcnRMaW5lc0Rlc2NlbmRpbmdBY3Rpb24nLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHNvcnQgc2VsZWN0ZWQgbGluZXMgaW4gZGVzY2VuZGluZyBvcmRlcicsIGZ1bmN0aW9uICgpIHtcblx0XHRcdHdpdGhUZXN0Q29kZUVkaXRvcihcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdhbHBoYScsXG5cdFx0XHRcdFx0J2JldGEnLFxuXHRcdFx0XHRcdCdvbWljcm9uJ1xuXHRcdFx0XHRdLCB7fSwgKGVkaXRvcikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdFx0XHRcdGNvbnN0IHNvcnRMaW5lc0Rlc2NlbmRpbmdBY3Rpb24gPSBuZXcgU29ydExpbmVzRGVzY2VuZGluZ0FjdGlvbigpO1xuXG5cdFx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIDMsIDcpKTtcblx0XHRcdFx0XHRleGVjdXRlQWN0aW9uKHNvcnRMaW5lc0Rlc2NlbmRpbmdBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lc0NvbnRlbnQoKSwgW1xuXHRcdFx0XHRcdFx0J29taWNyb24nLFxuXHRcdFx0XHRcdFx0J2JldGEnLFxuXHRcdFx0XHRcdFx0J2FscGhhJ1xuXHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMSwgMywgNSkpO1xuXHRcdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzb3J0IG11bHRpcGxlIHNlbGVjdGlvbnMgaW4gZGVzY2VuZGluZyBvcmRlcicsIGZ1bmN0aW9uICgpIHtcblx0XHRcdHdpdGhUZXN0Q29kZUVkaXRvcihcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdhbHBoYScsXG5cdFx0XHRcdFx0J2JldGEnLFxuXHRcdFx0XHRcdCdvbWljcm9uJyxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnYWxwaGEnLFxuXHRcdFx0XHRcdCdiZXRhJyxcblx0XHRcdFx0XHQnb21pY3Jvbidcblx0XHRcdFx0XSwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdFx0XHRjb25zdCBzb3J0TGluZXNEZXNjZW5kaW5nQWN0aW9uID0gbmV3IFNvcnRMaW5lc0Rlc2NlbmRpbmdBY3Rpb24oKTtcblxuXHRcdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtuZXcgU2VsZWN0aW9uKDEsIDEsIDMsIDcpLCBuZXcgU2VsZWN0aW9uKDUsIDEsIDcsIDcpXSk7XG5cdFx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihzb3J0TGluZXNEZXNjZW5kaW5nQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZXNDb250ZW50KCksIFtcblx0XHRcdFx0XHRcdCdvbWljcm9uJyxcblx0XHRcdFx0XHRcdCdiZXRhJyxcblx0XHRcdFx0XHRcdCdhbHBoYScsXG5cdFx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHRcdCdvbWljcm9uJyxcblx0XHRcdFx0XHRcdCdiZXRhJyxcblx0XHRcdFx0XHRcdCdhbHBoYSdcblx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRjb25zdCBleHBlY3RlZFNlbGVjdGlvbnMgPSBbXG5cdFx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDMsIDUpLFxuXHRcdFx0XHRcdFx0bmV3IFNlbGVjdGlvbig1LCAxLCA3LCA1KVxuXHRcdFx0XHRcdF07XG5cdFx0XHRcdFx0ZWRpdG9yLmdldFNlbGVjdGlvbnMoKSEuZm9yRWFjaCgoYWN0dWFsU2VsZWN0aW9uLCBpbmRleCkgPT4ge1xuXHRcdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWxTZWxlY3Rpb24udG9TdHJpbmcoKSwgZXhwZWN0ZWRTZWxlY3Rpb25zW2luZGV4XS50b1N0cmluZygpKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdEZWxldGVEdXBsaWNhdGVMaW5lc0FjdGlvbicsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgcmVtb3ZlIGR1cGxpY2F0ZSBsaW5lcyB3aXRoaW4gc2VsZWN0aW9uJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0J2FscGhhJyxcblx0XHRcdFx0XHQnYmV0YScsXG5cdFx0XHRcdFx0J2JldGEnLFxuXHRcdFx0XHRcdCdiZXRhJyxcblx0XHRcdFx0XHQnYWxwaGEnLFxuXHRcdFx0XHRcdCdvbWljcm9uJyxcblx0XHRcdFx0XSwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdFx0XHRjb25zdCBkZWxldGVEdXBsaWNhdGVMaW5lc0FjdGlvbiA9IG5ldyBEZWxldGVEdXBsaWNhdGVMaW5lc0FjdGlvbigpO1xuXG5cdFx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDMsIDYsIDQpKTtcblx0XHRcdFx0XHRleGVjdXRlQWN0aW9uKGRlbGV0ZUR1cGxpY2F0ZUxpbmVzQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZXNDb250ZW50KCksIFtcblx0XHRcdFx0XHRcdCdhbHBoYScsXG5cdFx0XHRcdFx0XHQnYmV0YScsXG5cdFx0XHRcdFx0XHQnb21pY3JvbicsXG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAxLCAzLCA4KSk7XG5cdFx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlbW92ZSBkdXBsaWNhdGUgbGluZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHR3aXRoVGVzdENvZGVFZGl0b3IoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnYWxwaGEnLFxuXHRcdFx0XHRcdCdiZXRhJyxcblx0XHRcdFx0XHQnYmV0YScsXG5cdFx0XHRcdFx0J2JldGEnLFxuXHRcdFx0XHRcdCdhbHBoYScsXG5cdFx0XHRcdFx0J29taWNyb24nLFxuXHRcdFx0XHRdLCB7fSwgKGVkaXRvcikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdFx0XHRcdGNvbnN0IGRlbGV0ZUR1cGxpY2F0ZUxpbmVzQWN0aW9uID0gbmV3IERlbGV0ZUR1cGxpY2F0ZUxpbmVzQWN0aW9uKCk7XG5cblx0XHRcdFx0XHRleGVjdXRlQWN0aW9uKGRlbGV0ZUR1cGxpY2F0ZUxpbmVzQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZXNDb250ZW50KCksIFtcblx0XHRcdFx0XHRcdCdhbHBoYScsXG5cdFx0XHRcdFx0XHQnYmV0YScsXG5cdFx0XHRcdFx0XHQnb21pY3JvbicsXG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGVkaXRvci5nZXRTZWxlY3Rpb24oKS5pc0VtcHR5KCkpO1xuXHRcdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZW1vdmUgZHVwbGljYXRlIGxpbmVzIGluIG11bHRpcGxlIHNlbGVjdGlvbnMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHR3aXRoVGVzdENvZGVFZGl0b3IoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnYWxwaGEnLFxuXHRcdFx0XHRcdCdiZXRhJyxcblx0XHRcdFx0XHQnYmV0YScsXG5cdFx0XHRcdFx0J29taWNyb24nLFxuXHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdCdhbHBoYScsXG5cdFx0XHRcdFx0J2FscGhhJyxcblx0XHRcdFx0XHQnYmV0YSdcblx0XHRcdFx0XSwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdFx0XHRjb25zdCBkZWxldGVEdXBsaWNhdGVMaW5lc0FjdGlvbiA9IG5ldyBEZWxldGVEdXBsaWNhdGVMaW5lc0FjdGlvbigpO1xuXG5cdFx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW25ldyBTZWxlY3Rpb24oMSwgMiwgNCwgMyksIG5ldyBTZWxlY3Rpb24oNiwgMiwgOCwgMyldKTtcblx0XHRcdFx0XHRleGVjdXRlQWN0aW9uKGRlbGV0ZUR1cGxpY2F0ZUxpbmVzQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZXNDb250ZW50KCksIFtcblx0XHRcdFx0XHRcdCdhbHBoYScsXG5cdFx0XHRcdFx0XHQnYmV0YScsXG5cdFx0XHRcdFx0XHQnb21pY3JvbicsXG5cdFx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHRcdCdhbHBoYScsXG5cdFx0XHRcdFx0XHQnYmV0YSdcblx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRjb25zdCBleHBlY3RlZFNlbGVjdGlvbnMgPSBbXG5cdFx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDEsIDMsIDgpLFxuXHRcdFx0XHRcdFx0bmV3IFNlbGVjdGlvbig1LCAxLCA2LCA1KVxuXHRcdFx0XHRcdF07XG5cdFx0XHRcdFx0ZWRpdG9yLmdldFNlbGVjdGlvbnMoKSEuZm9yRWFjaCgoYWN0dWFsU2VsZWN0aW9uLCBpbmRleCkgPT4ge1xuXHRcdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWxTZWxlY3Rpb24udG9TdHJpbmcoKSwgZXhwZWN0ZWRTZWxlY3Rpb25zW2luZGV4XS50b1N0cmluZygpKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhcHBsaWVzIHRvIHdob2xlIGRvY3VtZW50IHdoZW4gc2VsZWN0aW9uIGlzIHNpbmdsZSBsaW5lJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0J2FscGhhJyxcblx0XHRcdFx0XHQnYmV0YScsXG5cdFx0XHRcdFx0J2FscGhhJyxcblx0XHRcdFx0XHQnb21pY3Jvbidcblx0XHRcdFx0XSwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdFx0XHRjb25zdCBkZWxldGVEdXBsaWNhdGVMaW5lc0FjdGlvbiA9IG5ldyBEZWxldGVEdXBsaWNhdGVMaW5lc0FjdGlvbigpO1xuXG5cdFx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDIpKTtcblx0XHRcdFx0XHRleGVjdXRlQWN0aW9uKGRlbGV0ZUR1cGxpY2F0ZUxpbmVzQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZXNDb250ZW50KCksIFsnYWxwaGEnLCAnYmV0YScsICdvbWljcm9uJ10pO1xuXHRcdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblxuXHRzdWl0ZSgnRGVsZXRlQWxsTGVmdEFjdGlvbicsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgZGVsZXRlIHRvIHRoZSBsZWZ0IG9mIHRoZSBjdXJzb3InLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHR3aXRoVGVzdENvZGVFZGl0b3IoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnb25lJyxcblx0XHRcdFx0XHQndHdvJyxcblx0XHRcdFx0XHQndGhyZWUnXG5cdFx0XHRcdF0sIHt9LCAoZWRpdG9yKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRcdFx0Y29uc3QgZGVsZXRlQWxsTGVmdEFjdGlvbiA9IG5ldyBEZWxldGVBbGxMZWZ0QWN0aW9uKCk7XG5cblx0XHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMiwgMSwgMikpO1xuXHRcdFx0XHRcdGV4ZWN1dGVBY3Rpb24oZGVsZXRlQWxsTGVmdEFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICduZScpO1xuXG5cdFx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW25ldyBTZWxlY3Rpb24oMiwgMiwgMiwgMiksIG5ldyBTZWxlY3Rpb24oMywgMiwgMywgMildKTtcblx0XHRcdFx0XHRleGVjdXRlQWN0aW9uKGRlbGV0ZUFsbExlZnRBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnd28nKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICdocmVlJyk7XG5cdFx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGp1bXAgdG8gdGhlIHByZXZpb3VzIGxpbmUgd2hlbiBvbiBmaXJzdCBjb2x1bW4nLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHR3aXRoVGVzdENvZGVFZGl0b3IoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnb25lJyxcblx0XHRcdFx0XHQndHdvJyxcblx0XHRcdFx0XHQndGhyZWUnXG5cdFx0XHRcdF0sIHt9LCAoZWRpdG9yKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRcdFx0Y29uc3QgZGVsZXRlQWxsTGVmdEFjdGlvbiA9IG5ldyBEZWxldGVBbGxMZWZ0QWN0aW9uKCk7XG5cblx0XHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSkpO1xuXHRcdFx0XHRcdGV4ZWN1dGVBY3Rpb24oZGVsZXRlQWxsTGVmdEFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdvbmV0d28nKTtcblxuXHRcdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLCBuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDEpXSk7XG5cdFx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihkZWxldGVBbGxMZWZ0QWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lc0NvbnRlbnQoKVswXSwgJ29uZXR3b3RocmVlJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVzQ29udGVudCgpLmxlbmd0aCwgMSk7XG5cblx0XHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSkpO1xuXHRcdFx0XHRcdGV4ZWN1dGVBY3Rpb24oZGVsZXRlQWxsTGVmdEFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZXNDb250ZW50KClbMF0sICdvbmV0d290aHJlZScpO1xuXHRcdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBrZWVwIGRlbGV0aW5nIGxpbmVzIGluIG11bHRpIGN1cnNvciBtb2RlJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0J2hpIG15IG5hbWUgaXMgQ2FybG9zIE1hdG9zJyxcblx0XHRcdFx0XHQnQkNDJyxcblx0XHRcdFx0XHQnd2FzbyB3YXNvIHdhc28nLFxuXHRcdFx0XHRcdCdteSB3aWZlIGRvZXNudCBiZWxpZXZlIGluIG1lJyxcblx0XHRcdFx0XHQnbm9ub25vbm9ubycsXG5cdFx0XHRcdFx0J2JpdGNvbm5lZWVlY3QnXG5cdFx0XHRcdF0sIHt9LCAoZWRpdG9yKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRcdFx0Y29uc3QgZGVsZXRlQWxsTGVmdEFjdGlvbiA9IG5ldyBEZWxldGVBbGxMZWZ0QWN0aW9uKCk7XG5cblx0XHRcdFx0XHRjb25zdCBiZWZvcmVTZWNvbmRXYXNvU2VsZWN0aW9uID0gbmV3IFNlbGVjdGlvbigzLCA1LCAzLCA1KTtcblx0XHRcdFx0XHRjb25zdCBlbmRPZkJDQ1NlbGVjdGlvbiA9IG5ldyBTZWxlY3Rpb24oMiwgNCwgMiwgNCk7XG5cdFx0XHRcdFx0Y29uc3QgZW5kT2ZOb25vbm8gPSBuZXcgU2VsZWN0aW9uKDUsIDExLCA1LCAxMSk7XG5cblx0XHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbYmVmb3JlU2Vjb25kV2Fzb1NlbGVjdGlvbiwgZW5kT2ZCQ0NTZWxlY3Rpb24sIGVuZE9mTm9ub25vXSk7XG5cblx0XHRcdFx0XHRleGVjdXRlQWN0aW9uKGRlbGV0ZUFsbExlZnRBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdFx0bGV0IHNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpITtcblxuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJycpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJyB3YXNvIHdhc28nKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNSksICcnKTtcblxuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0XHRcdFx0c2VsZWN0aW9uc1swXS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRzZWxlY3Rpb25zWzBdLnN0YXJ0Q29sdW1uLFxuXHRcdFx0XHRcdFx0c2VsZWN0aW9uc1swXS5lbmRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0c2VsZWN0aW9uc1swXS5lbmRDb2x1bW5cblx0XHRcdFx0XHRdLCBbMywgMSwgMywgMV0pO1xuXG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRcdFx0XHRzZWxlY3Rpb25zWzFdLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRcdHNlbGVjdGlvbnNbMV0uc3RhcnRDb2x1bW4sXG5cdFx0XHRcdFx0XHRzZWxlY3Rpb25zWzFdLmVuZExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRzZWxlY3Rpb25zWzFdLmVuZENvbHVtblxuXHRcdFx0XHRcdF0sIFsyLCAxLCAyLCAxXSk7XG5cblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0XHRcdHNlbGVjdGlvbnNbMl0uc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0c2VsZWN0aW9uc1syXS5zdGFydENvbHVtbixcblx0XHRcdFx0XHRcdHNlbGVjdGlvbnNbMl0uZW5kTGluZU51bWJlcixcblx0XHRcdFx0XHRcdHNlbGVjdGlvbnNbMl0uZW5kQ29sdW1uXG5cdFx0XHRcdFx0XSwgWzUsIDEsIDUsIDFdKTtcblxuXHRcdFx0XHRcdGV4ZWN1dGVBY3Rpb24oZGVsZXRlQWxsTGVmdEFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0XHRzZWxlY3Rpb25zID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKSE7XG5cblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdoaSBteSBuYW1lIGlzIENhcmxvcyBNYXRvcyB3YXNvIHdhc28nKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VsZWN0aW9ucy5sZW5ndGgsIDIpO1xuXG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRcdFx0XHRzZWxlY3Rpb25zWzBdLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRcdHNlbGVjdGlvbnNbMF0uc3RhcnRDb2x1bW4sXG5cdFx0XHRcdFx0XHRzZWxlY3Rpb25zWzBdLmVuZExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRzZWxlY3Rpb25zWzBdLmVuZENvbHVtblxuXHRcdFx0XHRcdF0sIFsxLCAyNywgMSwgMjddKTtcblxuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0XHRcdFx0c2VsZWN0aW9uc1sxXS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRzZWxlY3Rpb25zWzFdLnN0YXJ0Q29sdW1uLFxuXHRcdFx0XHRcdFx0c2VsZWN0aW9uc1sxXS5lbmRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0c2VsZWN0aW9uc1sxXS5lbmRDb2x1bW5cblx0XHRcdFx0XHRdLCBbMiwgMjksIDIsIDI5XSk7XG5cdFx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHdvcmsgaW4gbXVsdGkgY3Vyc29yIG1vZGUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHR3aXRoVGVzdENvZGVFZGl0b3IoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnaGVsbG8nLFxuXHRcdFx0XHRcdCd3b3JsZCcsXG5cdFx0XHRcdFx0J2hlbGxvIHdvcmxkJyxcblx0XHRcdFx0XHQnaGVsbG8nLFxuXHRcdFx0XHRcdCdib25qb3VyJyxcblx0XHRcdFx0XHQnaG9sYScsXG5cdFx0XHRcdFx0J3dvcmxkJyxcblx0XHRcdFx0XHQnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHRdLCB7fSwgKGVkaXRvcikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdFx0XHRcdGNvbnN0IGRlbGV0ZUFsbExlZnRBY3Rpb24gPSBuZXcgRGVsZXRlQWxsTGVmdEFjdGlvbigpO1xuXG5cdFx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW25ldyBTZWxlY3Rpb24oMSwgMiwgMSwgMiksIG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCldKTtcblx0XHRcdFx0XHRleGVjdXRlQWN0aW9uKGRlbGV0ZUFsbExlZnRBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnbG8nKTtcblxuXHRcdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtuZXcgU2VsZWN0aW9uKDIsIDIsIDIsIDIpLCBuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDUpXSk7XG5cdFx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihkZWxldGVBbGxMZWZ0QWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ2QnKTtcblxuXHRcdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtuZXcgU2VsZWN0aW9uKDMsIDIsIDMsIDUpLCBuZXcgU2VsZWN0aW9uKDMsIDcsIDMsIDcpXSk7XG5cdFx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihkZWxldGVBbGxMZWZ0QWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJ3dvcmxkJyk7XG5cblx0XHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbbmV3IFNlbGVjdGlvbig0LCAzLCA0LCAzKSwgbmV3IFNlbGVjdGlvbig0LCA1LCA1LCA0KV0pO1xuXHRcdFx0XHRcdGV4ZWN1dGVBY3Rpb24oZGVsZXRlQWxsTGVmdEFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICdqb3VyJyk7XG5cblx0XHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbbmV3IFNlbGVjdGlvbig1LCAzLCA2LCAzKSwgbmV3IFNlbGVjdGlvbig2LCA1LCA3LCA1KSwgbmV3IFNlbGVjdGlvbig3LCA3LCA3LCA3KV0pO1xuXHRcdFx0XHRcdGV4ZWN1dGVBY3Rpb24oZGVsZXRlQWxsTGVmdEFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNSksICd3b3JsZCcpO1xuXHRcdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzc3VlICMzNjIzNDogc2hvdWxkIHB1c2ggdW5kbyBzdG9wJywgKCkgPT4ge1xuXHRcdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0J29uZScsXG5cdFx0XHRcdFx0J3R3bycsXG5cdFx0XHRcdFx0J3RocmVlJ1xuXHRcdFx0XHRdLCB7fSwgKGVkaXRvcikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdFx0XHRcdGNvbnN0IGRlbGV0ZUFsbExlZnRBY3Rpb24gPSBuZXcgRGVsZXRlQWxsTGVmdEFjdGlvbigpO1xuXG5cdFx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpKTtcblxuXHRcdFx0XHRcdGVkaXRvci50cmlnZ2VyKCdrZXlib2FyZCcsIEhhbmRsZXIuVHlwZSwgeyB0ZXh0OiAnVHlwaW5nIHNvbWUgdGV4dCBoZXJlIG9uIGxpbmUgJyB9KTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdUeXBpbmcgc29tZSB0ZXh0IGhlcmUgb24gbGluZSBvbmUnKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb24oKSwgbmV3IFNlbGVjdGlvbigxLCAzMSwgMSwgMzEpKTtcblxuXHRcdFx0XHRcdGV4ZWN1dGVBY3Rpb24oZGVsZXRlQWxsTGVmdEFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdvbmUnKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb24oKSwgbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSk7XG5cblx0XHRcdFx0XHRlZGl0b3IucnVuQ29tbWFuZChDb3JlRWRpdGluZ0NvbW1hbmRzLlVuZG8sIG51bGwpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ1R5cGluZyBzb21lIHRleHQgaGVyZSBvbiBsaW5lIG9uZScpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbigpLCBuZXcgU2VsZWN0aW9uKDEsIDMxLCAxLCAzMSkpO1xuXHRcdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0pvaW5MaW5lc0FjdGlvbicsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgam9pbiBsaW5lcyBhbmQgaW5zZXJ0IHNwYWNlIGlmIG5lY2Vzc2FyeScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdHdpdGhUZXN0Q29kZUVkaXRvcihcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdoZWxsbycsXG5cdFx0XHRcdFx0J3dvcmxkJyxcblx0XHRcdFx0XHQnaGVsbG8gJyxcblx0XHRcdFx0XHQnd29ybGQnLFxuXHRcdFx0XHRcdCdoZWxsb1x0XHQnLFxuXHRcdFx0XHRcdCdcdHdvcmxkJyxcblx0XHRcdFx0XHQnaGVsbG8gICAnLFxuXHRcdFx0XHRcdCdcdHdvcmxkJyxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnaGVsbG8gd29ybGQnXG5cdFx0XHRcdF0sIHt9LCAoZWRpdG9yKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRcdFx0Y29uc3Qgam9pbkxpbmVzQWN0aW9uID0gbmV3IEpvaW5MaW5lc0FjdGlvbigpO1xuXG5cdFx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDIsIDEsIDIpKTtcblx0XHRcdFx0XHRleGVjdXRlQWN0aW9uKGpvaW5MaW5lc0FjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdoZWxsbyB3b3JsZCcpO1xuXHRcdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgNiwgMSwgNikpO1xuXG5cdFx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDIsIDIsIDIsIDIpKTtcblx0XHRcdFx0XHRleGVjdXRlQWN0aW9uKGpvaW5MaW5lc0FjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdoZWxsbyB3b3JsZCcpO1xuXHRcdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMiwgNywgMiwgNykpO1xuXG5cdFx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDMsIDIsIDMsIDIpKTtcblx0XHRcdFx0XHRleGVjdXRlQWN0aW9uKGpvaW5MaW5lc0FjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICdoZWxsbyB3b3JsZCcpO1xuXHRcdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMywgNywgMywgNykpO1xuXG5cdFx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDQsIDIsIDUsIDMpKTtcblx0XHRcdFx0XHRleGVjdXRlQWN0aW9uKGpvaW5MaW5lc0FjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICdoZWxsbyB3b3JsZCcpO1xuXHRcdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oNCwgMiwgNCwgOCkpO1xuXG5cdFx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDUsIDEsIDcsIDMpKTtcblx0XHRcdFx0XHRleGVjdXRlQWN0aW9uKGpvaW5MaW5lc0FjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNSksICdoZWxsbyB3b3JsZCcpO1xuXHRcdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oNSwgMSwgNSwgMykpO1xuXHRcdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJyM1MDQ3MSBKb2luIGxpbmVzIGF0IHRoZSBlbmQgb2YgZG9jdW1lbnQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHR3aXRoVGVzdENvZGVFZGl0b3IoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnaGVsbG8nLFxuXHRcdFx0XHRcdCd3b3JsZCdcblx0XHRcdFx0XSwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdFx0XHRjb25zdCBqb2luTGluZXNBY3Rpb24gPSBuZXcgSm9pbkxpbmVzQWN0aW9uKCk7XG5cblx0XHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSkpO1xuXHRcdFx0XHRcdGV4ZWN1dGVBY3Rpb24oam9pbkxpbmVzQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ2hlbGxvJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnd29ybGQnKTtcblx0XHRcdFx0XHRhc3NlcnRTZWxlY3Rpb24oZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDIsIDYsIDIsIDYpKTtcblx0XHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgd29yayBpbiBtdWx0aSBjdXJzb3IgbW9kZScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdHdpdGhUZXN0Q29kZUVkaXRvcihcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdoZWxsbycsXG5cdFx0XHRcdFx0J3dvcmxkJyxcblx0XHRcdFx0XHQnaGVsbG8gJyxcblx0XHRcdFx0XHQnd29ybGQnLFxuXHRcdFx0XHRcdCdoZWxsb1x0XHQnLFxuXHRcdFx0XHRcdCdcdHdvcmxkJyxcblx0XHRcdFx0XHQnaGVsbG8gICAnLFxuXHRcdFx0XHRcdCdcdHdvcmxkJyxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQnaGVsbG8gd29ybGQnXG5cdFx0XHRcdF0sIHt9LCAoZWRpdG9yKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRcdFx0Y29uc3Qgam9pbkxpbmVzQWN0aW9uID0gbmV3IEpvaW5MaW5lc0FjdGlvbigpO1xuXG5cdFx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW1xuXHRcdFx0XHRcdFx0LyoqIHByaW1hcnkgY3Vyc29yICovXG5cdFx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDIsIDUsIDIpLFxuXHRcdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAyLCAxLCAyKSxcblx0XHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgMiwgNCwgMiksXG5cdFx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDQsIDYsIDMpLFxuXHRcdFx0XHRcdFx0bmV3IFNlbGVjdGlvbig3LCA1LCA4LCA0KSxcblx0XHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMTAsIDEsIDEwLCAxKVxuXHRcdFx0XHRcdF0pO1xuXG5cdFx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihqb2luTGluZXNBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVzQ29udGVudCgpLmpvaW4oJ1xcbicpLCAnaGVsbG8gd29ybGRcXG5oZWxsbyB3b3JsZFxcbmhlbGxvIHdvcmxkXFxuaGVsbG8gd29ybGRcXG5cXG5oZWxsbyB3b3JsZCcpO1xuXHRcdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIFtcblx0XHRcdFx0XHRcdC8qKiBwcmltYXJ5IGN1cnNvciAqL1xuXHRcdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCA0LCAzLCA4KSxcblx0XHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNiwgMSwgNiksXG5cdFx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDIsIDIsIDgpLFxuXHRcdFx0XHRcdFx0bmV3IFNlbGVjdGlvbig0LCA1LCA0LCA5KSxcblx0XHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oNiwgMSwgNiwgMSlcblx0XHRcdFx0XHRdKTtcblx0XHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcHVzaCB1bmRvIHN0b3AnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHR3aXRoVGVzdENvZGVFZGl0b3IoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnaGVsbG8nLFxuXHRcdFx0XHRcdCd3b3JsZCdcblx0XHRcdFx0XSwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdFx0XHRjb25zdCBqb2luTGluZXNBY3Rpb24gPSBuZXcgSm9pbkxpbmVzQWN0aW9uKCk7XG5cblx0XHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgNiwgMSwgNikpO1xuXG5cdFx0XHRcdFx0ZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5UeXBlLCB7IHRleHQ6ICcgbXkgZGVhcicgfSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnaGVsbG8gbXkgZGVhcicpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbigpLCBuZXcgU2VsZWN0aW9uKDEsIDE0LCAxLCAxNCkpO1xuXG5cdFx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihqb2luTGluZXNBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnaGVsbG8gbXkgZGVhciB3b3JsZCcpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbigpLCBuZXcgU2VsZWN0aW9uKDEsIDE0LCAxLCAxNCkpO1xuXG5cdFx0XHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdoZWxsbyBteSBkZWFyJyk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9uKCksIG5ldyBTZWxlY3Rpb24oMSwgMTQsIDEsIDE0KSk7XG5cdFx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnUmV2ZXJzZUxpbmVzQWN0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldmVyc2VzIGxpbmVzJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0J2FsaWNlJyxcblx0XHRcdFx0XHQnYm9iJyxcblx0XHRcdFx0XHQnY2hhcmxpZScsXG5cdFx0XHRcdF0sIHt9LCAoZWRpdG9yKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRcdFx0Y29uc3QgcmV2ZXJzZUxpbmVzQWN0aW9uID0gbmV3IFJldmVyc2VMaW5lc0FjdGlvbigpO1xuXG5cdFx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihyZXZlcnNlTGluZXNBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lc0NvbnRlbnQoKSwgWydjaGFybGllJywgJ2JvYicsICdhbGljZSddKTtcblx0XHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleGNsdWRlcyBlbXB0eSBsYXN0IGxpbmUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHR3aXRoVGVzdENvZGVFZGl0b3IoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnYWxpY2UnLFxuXHRcdFx0XHRcdCdib2InLFxuXHRcdFx0XHRcdCdjaGFybGllJyxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XSwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdFx0XHRjb25zdCByZXZlcnNlTGluZXNBY3Rpb24gPSBuZXcgUmV2ZXJzZUxpbmVzQWN0aW9uKCk7XG5cblx0XHRcdFx0XHRleGVjdXRlQWN0aW9uKHJldmVyc2VMaW5lc0FjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVzQ29udGVudCgpLCBbJ2NoYXJsaWUnLCAnYm9iJywgJ2FsaWNlJywgJyddKTtcblx0XHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1cGRhdGVzIGN1cnNvcicsIGZ1bmN0aW9uICgpIHtcblx0XHRcdHdpdGhUZXN0Q29kZUVkaXRvcihcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdhbGljZScsXG5cdFx0XHRcdFx0J2JvYicsXG5cdFx0XHRcdFx0J2NoYXJsaWUnLFxuXHRcdFx0XHRdLCB7fSwgKGVkaXRvcikgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHJldmVyc2VMaW5lc0FjdGlvbiA9IG5ldyBSZXZlcnNlTGluZXNBY3Rpb24oKTtcblx0XHRcdFx0XHQvLyBjdXJzb3IgYXQgdGhpcmQgY29sdW1uIG9mIHRoaXJkIGxpbmUgJ2NoYXJsaWUnXG5cdFx0XHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKG5ldyBQb3NpdGlvbigzLCAzKSk7XG5cblx0XHRcdFx0XHRleGVjdXRlQWN0aW9uKHJldmVyc2VMaW5lc0FjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0XHQvLyBjdXJzb3IgYXQgdGhpcmQgY29sdW1uIG9mICpmaXJzdCogbGluZSAnY2hhcmxpZSdcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRQb3NpdGlvbigpLCBuZXcgUG9zaXRpb24oMSwgMykpO1xuXHRcdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyBjdXJzb3Igb24gZW1wdHkgbGFzdCBsaW5lJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0J2FsaWNlJyxcblx0XHRcdFx0XHQnYm9iJyxcblx0XHRcdFx0XHQnY2hhcmxpZScsXG5cdFx0XHRcdFx0JycsXG5cdFx0XHRcdF0sIHt9LCAoZWRpdG9yKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcmV2ZXJzZUxpbmVzQWN0aW9uID0gbmV3IFJldmVyc2VMaW5lc0FjdGlvbigpO1xuXHRcdFx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbihuZXcgUG9zaXRpb24oNCwgMSkpO1xuXG5cdFx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihyZXZlcnNlTGluZXNBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0UG9zaXRpb24oKSwgbmV3IFBvc2l0aW9uKDQsIDEpKTtcblx0XHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVzZXJ2ZXMgc2VsZWN0ZWQgdGV4dCB3aGVuIHNlbGVjdGlvbnMgZG8gbm90IHNwYW4gbGluZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHR3aXRoVGVzdENvZGVFZGl0b3IoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnYWxpY2UnLFxuXHRcdFx0XHRcdCdib2InLFxuXHRcdFx0XHRcdCdjaGFybGllJyxcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XSwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdFx0XHRjb25zdCByZXZlcnNlTGluZXNBY3Rpb24gPSBuZXcgUmV2ZXJzZUxpbmVzQWN0aW9uKCk7XG5cdFx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW25ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMyksIG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgNCksIG5ldyBTZWxlY3Rpb24oMywgMSwgMywgNSldKTtcblx0XHRcdFx0XHRjb25zdCBleHBlY3RlZFNlbGVjdGVkVGV4dDogc3RyaW5nW10gPSBbJ2FsJywgJ2JvYicsICdjaGFyJ107XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLm1hcChzID0+IG1vZGVsLmdldFZhbHVlSW5SYW5nZShzKSksIGV4cGVjdGVkU2VsZWN0ZWRUZXh0KTtcblxuXHRcdFx0XHRcdGV4ZWN1dGVBY3Rpb24ocmV2ZXJzZUxpbmVzQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKS5tYXAocyA9PiBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UocykpLCBleHBlY3RlZFNlbGVjdGVkVGV4dCk7XG5cdFx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV2ZXJzZXMgbGluZXMgd2l0aGluIHNlbGVjdGlvbicsIGZ1bmN0aW9uICgpIHtcblx0XHRcdHdpdGhUZXN0Q29kZUVkaXRvcihcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdsaW5lMScsXG5cdFx0XHRcdFx0J2xpbmUyJyxcblx0XHRcdFx0XHQnbGluZTMnLFxuXHRcdFx0XHRcdCdsaW5lNCcsXG5cdFx0XHRcdFx0J2xpbmU1Jyxcblx0XHRcdFx0XSwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdFx0XHRjb25zdCByZXZlcnNlTGluZXNBY3Rpb24gPSBuZXcgUmV2ZXJzZUxpbmVzQWN0aW9uKCk7XG5cblx0XHRcdFx0XHQvLyBTZWxlY3QgbGluZXMgMi00XG5cdFx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDIsIDEsIDQsIDYpKTtcblx0XHRcdFx0XHRleGVjdXRlQWN0aW9uKHJldmVyc2VMaW5lc0FjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVzQ29udGVudCgpLCBbJ2xpbmUxJywgJ2xpbmU0JywgJ2xpbmUzJywgJ2xpbmUyJywgJ2xpbmU1J10pO1xuXHRcdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldmVyc2VzIGxpbmVzIHdpdGhpbiBwYXJ0aWFsIHNlbGVjdGlvbicsIGZ1bmN0aW9uICgpIHtcblx0XHRcdHdpdGhUZXN0Q29kZUVkaXRvcihcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdsaW5lMScsXG5cdFx0XHRcdFx0J2xpbmUyJyxcblx0XHRcdFx0XHQnbGluZTMnLFxuXHRcdFx0XHRcdCdsaW5lNCcsXG5cdFx0XHRcdFx0J2xpbmU1Jyxcblx0XHRcdFx0XSwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdFx0XHRjb25zdCByZXZlcnNlTGluZXNBY3Rpb24gPSBuZXcgUmV2ZXJzZUxpbmVzQWN0aW9uKCk7XG5cblx0XHRcdFx0XHQvLyBTZWxlY3QgcGFydGlhbCBsaW5lcyAyLTQgKGZyb20gbWlkZGxlIG9mIGxpbmUyIHRvIG1pZGRsZSBvZiBsaW5lNClcblx0XHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgMywgNCwgMykpO1xuXHRcdFx0XHRcdGV4ZWN1dGVBY3Rpb24ocmV2ZXJzZUxpbmVzQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZXNDb250ZW50KCksIFsnbGluZTEnLCAnbGluZTQnLCAnbGluZTMnLCAnbGluZTInLCAnbGluZTUnXSk7XG5cdFx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV2ZXJzZXMgbGluZXMgd2l0aCBtdWx0aXBsZSBzZWxlY3Rpb25zJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0J2xpbmUxJyxcblx0XHRcdFx0XHQnbGluZTInLFxuXHRcdFx0XHRcdCdsaW5lMycsXG5cdFx0XHRcdFx0J2xpbmU0Jyxcblx0XHRcdFx0XHQnbGluZTUnLFxuXHRcdFx0XHRcdCdsaW5lNicsXG5cdFx0XHRcdF0sIHt9LCAoZWRpdG9yKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRcdFx0Y29uc3QgcmV2ZXJzZUxpbmVzQWN0aW9uID0gbmV3IFJldmVyc2VMaW5lc0FjdGlvbigpO1xuXG5cdFx0XHRcdFx0Ly8gU2VsZWN0IGxpbmVzIDEtMiBhbmQgbGluZXMgNC01XG5cdFx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW25ldyBTZWxlY3Rpb24oMSwgMSwgMiwgNiksIG5ldyBTZWxlY3Rpb24oNCwgMSwgNSwgNildKTtcblx0XHRcdFx0XHRleGVjdXRlQWN0aW9uKHJldmVyc2VMaW5lc0FjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVzQ29udGVudCgpLCBbJ2xpbmUyJywgJ2xpbmUxJywgJ2xpbmUzJywgJ2xpbmU1JywgJ2xpbmU0JywgJ2xpbmU2J10pO1xuXHRcdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VwZGF0ZXMgc2VsZWN0aW9uIHBvc2l0aW9ucyBhZnRlciByZXZlcnNhbCcsIGZ1bmN0aW9uICgpIHtcblx0XHRcdHdpdGhUZXN0Q29kZUVkaXRvcihcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdsaW5lMScsXG5cdFx0XHRcdFx0J2xpbmUyJyxcblx0XHRcdFx0XHQnbGluZTMnLFxuXHRcdFx0XHRcdCdsaW5lNCcsXG5cdFx0XHRcdF0sIHt9LCAoZWRpdG9yKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcmV2ZXJzZUxpbmVzQWN0aW9uID0gbmV3IFJldmVyc2VMaW5lc0FjdGlvbigpO1xuXG5cdFx0XHRcdFx0Ly8gU2VsZWN0IGxpbmVzIDEtM1xuXHRcdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAyLCAzLCAzKSk7XG5cdFx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihyZXZlcnNlTGluZXNBY3Rpb24sIGVkaXRvcik7XG5cblx0XHRcdFx0XHQvLyBBZnRlciByZXZlcnNhbCwgc2VsZWN0aW9uIHNob3VsZCBiZSB1cGRhdGVkIHRvIG1haW50YWluIHJlbGF0aXZlIHBvc2l0aW9uXG5cdFx0XHRcdFx0Ly8gT3JpZ2luYWxseSBsaW5lIDEgY29sIDIgLT4gbGluZSAzIGNvbCAzLCBzbyBhZnRlciByZXZlcnNhbCBzaG91bGQgYmUgbGluZSAzIGNvbCAyIC0+IGxpbmUgMSBjb2wgM1xuXHRcdFx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IGVkaXRvci5nZXRTZWxlY3Rpb24oKSE7XG5cdFx0XHRcdFx0Ly8gVGhlIHNlbGVjdGlvbiBzaG91bGQgY292ZXIgdGhlIHNhbWUgbG9naWNhbCB0ZXh0IGFmdGVyIHJldmVyc2FsXG5cdFx0XHRcdFx0Ly8gUmFuZ2Ugbm9ybWFsaXphdGlvbiBlbnN1cmVzIHN0YXJ0TGluZU51bWJlciA8PSBlbmRMaW5lTnVtYmVyXG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXIsIDEpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWxlY3Rpb24uc3RhcnRDb2x1bW4sIDMpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWxlY3Rpb24uZW5kTGluZU51bWJlciwgMyk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlbGVjdGlvbi5lbmRDb2x1bW4sIDIpO1xuXHRcdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FwcGxpZXMgdG8gd2hvbGUgZG9jdW1lbnQgd2hlbiBzZWxlY3Rpb24gaXMgc2luZ2xlIGxpbmUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHR3aXRoVGVzdENvZGVFZGl0b3IoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnbGluZTEnLFxuXHRcdFx0XHRcdCdsaW5lMicsXG5cdFx0XHRcdFx0J2xpbmUzJyxcblx0XHRcdFx0XSwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdFx0XHRjb25zdCByZXZlcnNlTGluZXNBY3Rpb24gPSBuZXcgUmV2ZXJzZUxpbmVzQWN0aW9uKCk7XG5cblx0XHRcdFx0XHQvLyBTZWxlY3Qgb25seSBsaW5lIDJcblx0XHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgNikpO1xuXHRcdFx0XHRcdGV4ZWN1dGVBY3Rpb24ocmV2ZXJzZUxpbmVzQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZXNDb250ZW50KCksIFsnbGluZTMnLCAnbGluZTInLCAnbGluZTEnXSk7XG5cdFx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhjbHVkZXMgZW5kIGxpbmUgd2hlbiBzZWxlY3Rpb24gZW5kcyBhdCBjb2x1bW4gMScsIGZ1bmN0aW9uICgpIHtcblx0XHRcdHdpdGhUZXN0Q29kZUVkaXRvcihcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCdsaW5lMScsXG5cdFx0XHRcdFx0J2xpbmUyJyxcblx0XHRcdFx0XHQnbGluZTMnLFxuXHRcdFx0XHRcdCdsaW5lNCcsXG5cdFx0XHRcdFx0J2xpbmU1Jyxcblx0XHRcdFx0XSwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdFx0XHRjb25zdCByZXZlcnNlTGluZXNBY3Rpb24gPSBuZXcgUmV2ZXJzZUxpbmVzQWN0aW9uKCk7XG5cblx0XHRcdFx0XHQvLyBTZWxlY3QgZnJvbSBsaW5lIDIgdG8gbGluZSA0IGNvbHVtbiAxIChzaG91bGQgZXhjbHVkZSBsaW5lIDQpXG5cdFx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDIsIDEsIDQsIDEpKTtcblx0XHRcdFx0XHRleGVjdXRlQWN0aW9uKHJldmVyc2VMaW5lc0FjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVzQ29udGVudCgpLCBbJ2xpbmUxJywgJ2xpbmUzJywgJ2xpbmUyJywgJ2xpbmU0JywgJ2xpbmU1J10pO1xuXHRcdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FwcGxpZXMgdG8gd2hvbGUgZG9jdW1lbnQgd2hlbiBzZWxlY3Rpb24gaXMgc2luZ2xlIGxpbmUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHR3aXRoVGVzdENvZGVFZGl0b3IoXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnb21pY3JvbicsXG5cdFx0XHRcdFx0J2JldGEnLFxuXHRcdFx0XHRcdCdhbHBoYSdcblx0XHRcdFx0XSwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdFx0XHRjb25zdCByZXZlcnNlTGluZXNBY3Rpb24gPSBuZXcgUmV2ZXJzZUxpbmVzQWN0aW9uKCk7XG5cblx0XHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgNCkpO1xuXHRcdFx0XHRcdGV4ZWN1dGVBY3Rpb24ocmV2ZXJzZUxpbmVzQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZXNDb250ZW50KCksIFtcblx0XHRcdFx0XHRcdCdhbHBoYScsXG5cdFx0XHRcdFx0XHQnYmV0YScsXG5cdFx0XHRcdFx0XHQnb21pY3Jvbidcblx0XHRcdFx0XHRdKTtcblx0XHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyYW5zcG9zZScsICgpID0+IHtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoXG5cdFx0XHRbXG5cdFx0XHRcdCdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JyAgICcsXG5cdFx0XHRdLCB7fSwgKGVkaXRvcikgPT4ge1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdFx0Y29uc3QgdHJhbnNwb3NlQWN0aW9uID0gbmV3IFRyYW5zcG9zZUFjdGlvbigpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24odHJhbnNwb3NlQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdoZWxsbyB3b3JsZCcpO1xuXHRcdFx0XHRhc3NlcnRTZWxlY3Rpb24oZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDIsIDEsIDIpKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgNiwgMSwgNikpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHRyYW5zcG9zZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnaGVsbCBvd29ybGQnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCA3LCAxLCA3KSk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEyLCAxLCAxMikpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHRyYW5zcG9zZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnaGVsbCBvd29ybCcpO1xuXHRcdFx0XHRhc3NlcnRTZWxlY3Rpb24oZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDIsIDIsIDIsIDIpKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMywgMSwgMywgMSkpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHRyYW5zcG9zZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAnJyk7XG5cdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oNCwgMSwgNCwgMSkpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbig0LCAyLCA0LCAyKSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24odHJhbnNwb3NlQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICcgICAnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbig0LCAzLCA0LCAzKSk7XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdC8vIGZpeCAjMTY2MzNcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoXG5cdFx0XHRbXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J2hlbGxvJyxcblx0XHRcdFx0J3dvcmxkJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdoZWxsbyB3b3JsZCcsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnaGVsbG8gd29ybGQnXG5cdFx0XHRdLCB7fSwgKGVkaXRvcikgPT4ge1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdFx0Y29uc3QgdHJhbnNwb3NlQWN0aW9uID0gbmV3IFRyYW5zcG9zZUFjdGlvbigpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24odHJhbnNwb3NlQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbigyLCAxLCAyLCAxKSk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDMsIDYsIDMsIDYpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbih0cmFuc3Bvc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJ293b3JsZCcpO1xuXHRcdFx0XHRhc3NlcnRTZWxlY3Rpb24oZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDQsIDIsIDQsIDIpKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oNiwgMTIsIDYsIDEyKSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24odHJhbnNwb3NlQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNyksICdkJyk7XG5cdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oNywgMiwgNywgMikpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbig4LCAxMiwgOCwgMTIpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbih0cmFuc3Bvc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg4KSwgJ2hlbGxvIHdvcmxkJyk7XG5cdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oOCwgMTIsIDgsIDEyKSk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndG9nZ2xlIGNhc2UnLCBmdW5jdGlvbiAoKSB7XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFxuXHRcdFx0W1xuXHRcdFx0XHQnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHQnXHUwMEY2XHUwMEU3XHUwMTVGXHUwMTFGXHUwMEZDJyxcblx0XHRcdFx0J3BhcnNlSFRNTFN0cmluZycsXG5cdFx0XHRcdCdnZXRFbGVtZW50QnlJZCcsXG5cdFx0XHRcdCdpbnNlcnRIVE1MJyxcblx0XHRcdFx0J1Bhc2NhbENhc2UnLFxuXHRcdFx0XHQnQ1NTU2VsZWN0b3JzTGlzdCcsXG5cdFx0XHRcdCdpRCcsXG5cdFx0XHRcdCd0RVNUJyxcblx0XHRcdFx0J1x1MDBGNlx1MDBFN1x1MDE1Rlx1MDBENlx1MDBDN1x1MDE1RVx1MDExRlx1MDBGQ1x1MDExRVx1MDBEQycsXG5cdFx0XHRcdCdhdWRpb0NvbnZlcnRlci5jb252ZXJ0TTRBVG9NUDMoKTsnLFxuXHRcdFx0XHQnc25ha2VfY2FzZScsXG5cdFx0XHRcdCdDYXBpdGFsX1NuYWtlX0Nhc2UnLFxuXHRcdFx0XHRgZnVuY3Rpb24gaGVsbG9Xb3JsZCgpIHtcblx0XHRcdFx0cmV0dXJuIHNvbWVHbG9iYWxPYmplY3QucHJpbnRIZWxsb1dvcmxkKFwiZW5cIiwgXCJ1dGYtOFwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRoZWxsb1dvcmxkKCk7YC5yZXBsYWNlKC9eXFxzKy9nbSwgJycpLFxuXHRcdFx0XHRgJ0phdmFTY3JpcHQnYCxcblx0XHRcdFx0J3BhcnNlSFRNTDRTdHJpbmcnLFxuXHRcdFx0XHQnX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yJ1xuXHRcdFx0XSwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRcdGNvbnN0IHVwcGVyY2FzZUFjdGlvbiA9IG5ldyBVcHBlckNhc2VBY3Rpb24oKTtcblx0XHRcdFx0Y29uc3QgbG93ZXJjYXNlQWN0aW9uID0gbmV3IExvd2VyQ2FzZUFjdGlvbigpO1xuXHRcdFx0XHRjb25zdCB0aXRsZWNhc2VBY3Rpb24gPSBuZXcgVGl0bGVDYXNlQWN0aW9uKCk7XG5cdFx0XHRcdGNvbnN0IHNuYWtlY2FzZUFjdGlvbiA9IG5ldyBTbmFrZUNhc2VBY3Rpb24oKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMTIpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbih1cHBlcmNhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ0hFTExPIFdPUkxEJyk7XG5cdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMTIpKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMTIpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihsb3dlcmNhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ2hlbGxvIHdvcmxkJyk7XG5cdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMTIpKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMywgMSwgMykpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHVwcGVyY2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnSEVMTE8gd29ybGQnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKSk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDQsIDEsIDQpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihsb3dlcmNhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ2hlbGxvIHdvcmxkJyk7XG5cdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNCkpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxMikpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHRpdGxlY2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnSGVsbG8gV29ybGQnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxMikpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigyLCAxLCAyLCA2KSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24odXBwZXJjYXNlQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdcdTAwRDZcdTAwQzdcdTAxNUVcdTAxMUVcdTAwREMnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbigyLCAxLCAyLCA2KSk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDYpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihsb3dlcmNhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ1x1MDBGNlx1MDBFN1x1MDE1Rlx1MDExRlx1MDBGQycpO1xuXHRcdFx0XHRhc3NlcnRTZWxlY3Rpb24oZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDYpKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgNikpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHRpdGxlY2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnXHUwMEQ2XHUwMEU3XHUwMTVGXHUwMTFGXHUwMEZDJyk7XG5cdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgNikpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigzLCAxLCAzLCAxNikpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHNuYWtlY2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAncGFyc2VfaHRtbF9zdHJpbmcnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbigzLCAxLCAzLCAxOCkpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbig0LCAxLCA0LCAxNSkpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHNuYWtlY2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDQpLCAnZ2V0X2VsZW1lbnRfYnlfaWQnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbig0LCAxLCA0LCAxOCkpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbig1LCAxLCA1LCAxMSkpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHNuYWtlY2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDUpLCAnaW5zZXJ0X2h0bWwnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbig1LCAxLCA1LCAxMikpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbig2LCAxLCA2LCAxMSkpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHNuYWtlY2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDYpLCAncGFzY2FsX2Nhc2UnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbig2LCAxLCA2LCAxMikpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbig3LCAxLCA3LCAxNykpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHNuYWtlY2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDcpLCAnY3NzX3NlbGVjdG9yc19saXN0Jyk7XG5cdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oNywgMSwgNywgMTkpKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oOCwgMSwgOCwgMykpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHNuYWtlY2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDgpLCAnaV9kJyk7XG5cdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oOCwgMSwgOCwgNCkpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbig5LCAxLCA5LCA1KSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24oc25ha2VjYXNlQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoOSksICd0X2VzdCcpO1xuXHRcdFx0XHRhc3NlcnRTZWxlY3Rpb24oZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDksIDEsIDksIDYpKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMTAsIDEsIDEwLCAxMSkpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHNuYWtlY2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEwKSwgJ1x1MDBGNlx1MDBFN1x1MDE1Rl9cdTAwRjZcdTAwRTdfXHUwMTVGXHUwMTFGXHUwMEZDX1x1MDExRlx1MDBGQycpO1xuXHRcdFx0XHRhc3NlcnRTZWxlY3Rpb24oZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEwLCAxLCAxMCwgMTQpKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMTEsIDEsIDExLCAzNCkpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHNuYWtlY2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDExKSwgJ2F1ZGlvX2NvbnZlcnRlci5jb252ZXJ0X200YV90b19tcDMoKTsnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxMSwgMSwgMTEsIDM4KSk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEyLCAxLCAxMiwgMTEpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihzbmFrZWNhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxMiksICdzbmFrZV9jYXNlJyk7XG5cdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMTIsIDEsIDEyLCAxMSkpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxMywgMSwgMTMsIDE5KSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24oc25ha2VjYXNlQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMTMpLCAnY2FwaXRhbF9zbmFrZV9jYXNlJyk7XG5cdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMTMsIDEsIDEzLCAxOSkpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxNCwgMSwgMTcsIDE0KSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24oc25ha2VjYXNlQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWVJblJhbmdlKG5ldyBTZWxlY3Rpb24oMTQsIDEsIDE3LCAxNSkpLCBgZnVuY3Rpb24gaGVsbG9fd29ybGQoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHNvbWVfZ2xvYmFsX29iamVjdC5wcmludF9oZWxsb193b3JsZChcImVuXCIsIFwidXRmLThcIik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aGVsbG9fd29ybGQoKTtgLnJlcGxhY2UoL15cXHMrL2dtLCAnJykpO1xuXHRcdFx0XHRhc3NlcnRTZWxlY3Rpb24oZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDE0LCAxLCAxNywgMTUpKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMTgsIDEsIDE4LCAxMykpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHNuYWtlY2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDE4KSwgYCdqYXZhX3NjcmlwdCdgKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxOCwgMSwgMTgsIDE0KSk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDE5LCAxLCAxOSwgMTcpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihzbmFrZWNhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxOSksICdwYXJzZV9odG1sNF9zdHJpbmcnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxOSwgMSwgMTksIDE5KSk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDIwLCAxLCAyMCwgMjgpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihzbmFrZWNhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyMCksICdfYWNjZXNzb3I6IHNlcnZpY2VzX2FjY2Vzc29yJyk7XG5cdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMjAsIDEsIDIwLCAyOSkpO1xuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoXG5cdFx0XHRbXG5cdFx0XHRcdCdmb08gYmFSIEJhWicsXG5cdFx0XHRcdCdmb09cXCdiYVJcXCdCYVonLFxuXHRcdFx0XHQnZm9PW2JhUl1CYVonLFxuXHRcdFx0XHQnZm9PYGJhUn5CYVonLFxuXHRcdFx0XHQnZm9PXmJhUiVCYVonLFxuXHRcdFx0XHQnZm9PJGJhUiFCYVonLFxuXHRcdFx0XHQnXFwncGh5c2ljaWFuXFwncyBhc3Npc3RhbnRcXCcnXG5cdFx0XHRdLCB7fSwgKGVkaXRvcikgPT4ge1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdFx0Y29uc3QgdGl0bGVjYXNlQWN0aW9uID0gbmV3IFRpdGxlQ2FzZUFjdGlvbigpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxMikpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHRpdGxlY2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnRm9vIEJhciBCYXonKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMTIpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbih0aXRsZWNhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ0Zvb1xcJ2JhclxcJ2JheicpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigzLCAxLCAzLCAxMikpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHRpdGxlY2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAnRm9vW0Jhcl1CYXonKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oNCwgMSwgNCwgMTIpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbih0aXRsZWNhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJ0Zvb2BCYXJ+QmF6Jyk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDUsIDEsIDUsIDEyKSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24odGl0bGVjYXNlQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNSksICdGb29eQmFyJUJheicpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbig2LCAxLCA2LCAxMikpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHRpdGxlY2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDYpLCAnRm9vJEJhciFCYXonKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oNywgMSwgNywgMjMpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbih0aXRsZWNhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg3KSwgJ1xcJ1BoeXNpY2lhblxcJ3MgQXNzaXN0YW50XFwnJyk7XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihcblx0XHRcdFtcblx0XHRcdFx0J2NhbWVsIGZyb20gd29yZHMnLFxuXHRcdFx0XHQnZnJvbV9zbmFrZV9jYXNlJyxcblx0XHRcdFx0J2Zyb20ta2ViYWItY2FzZScsXG5cdFx0XHRcdCdhbHJlYWR5Q2FtZWwnLFxuXHRcdFx0XHQnUmVUYWluX3NvbWVfQ0FQaXRhbGl6YXRpb24nLFxuXHRcdFx0XHQnbXlfdmFyLnRlc3RfZnVuY3Rpb24oKScsXG5cdFx0XHRcdCdcdTAwRjZcdTAwRTdcdTAxNUZfXHUwMEY2XHUwMEU3X1x1MDE1Rlx1MDExRlx1MDBGQ19cdTAxMUZcdTAwRkMnLFxuXHRcdFx0XHQnWE1MSHR0cFJlcXVlc3QnLFxuXHRcdFx0XHQnXFx0ZnVuY3Rpb24gaGVsbG9fd29ybGQoKSB7Jyxcblx0XHRcdFx0J1xcdFxcdHJldHVybiBzb21lX2dsb2JhbF9vYmplY3Q7Jyxcblx0XHRcdFx0J1xcdH0nLFxuXHRcdFx0XSwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRcdGNvbnN0IGNhbWVsY2FzZUFjdGlvbiA9IG5ldyBDYW1lbENhc2VBY3Rpb24oKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMTgpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihjYW1lbGNhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ2NhbWVsRnJvbVdvcmRzJyk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDE1KSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24oY2FtZWxjYXNlQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICdmcm9tU25ha2VDYXNlJyk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDMsIDEsIDMsIDE1KSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24oY2FtZWxjYXNlQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICdmcm9tS2ViYWJDYXNlJyk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDQsIDEsIDQsIDEyKSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24oY2FtZWxjYXNlQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICdhbHJlYWR5Q2FtZWwnKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oNSwgMSwgNSwgMjYpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihjYW1lbGNhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg1KSwgJ3JlVGFpblNvbWVDQVBpdGFsaXphdGlvbicpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbig2LCAxLCA2LCAyMykpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKGNhbWVsY2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDYpLCAnbXlWYXIudGVzdEZ1bmN0aW9uKCknKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oNywgMSwgNywgMTQpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihjYW1lbGNhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg3KSwgJ1x1MDBGNlx1MDBFN1x1MDE1Rlx1MDBENlx1MDBFN1x1MDE1RVx1MDExRlx1MDBGQ1x1MDExRVx1MDBGQycpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbig4LCAxLCA4LCAxNCkpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKGNhbWVsY2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDgpLCAnWE1MSHR0cFJlcXVlc3QnKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oOSwgMSwgMTEsIDIpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihjYW1lbGNhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZUluUmFuZ2UobmV3IFNlbGVjdGlvbig5LCAxLCAxMSwgMykpLCAnXFx0ZnVuY3Rpb24gaGVsbG9Xb3JsZCgpIHtcXG5cXHRcXHRyZXR1cm4gc29tZUdsb2JhbE9iamVjdDtcXG5cXHR9Jyk7XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihcblx0XHRcdFtcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcgICAnXG5cdFx0XHRdLCB7fSwgKGVkaXRvcikgPT4ge1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdFx0Y29uc3QgdXBwZXJjYXNlQWN0aW9uID0gbmV3IFVwcGVyQ2FzZUFjdGlvbigpO1xuXHRcdFx0XHRjb25zdCBsb3dlcmNhc2VBY3Rpb24gPSBuZXcgTG93ZXJDYXNlQWN0aW9uKCk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbih1cHBlcmNhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJycpO1xuXHRcdFx0XHRhc3NlcnRTZWxlY3Rpb24oZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSkpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKGxvd2VyY2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnJyk7XG5cdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSkpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigyLCAyLCAyLCAyKSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24odXBwZXJjYXNlQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcgICAnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbigyLCAyLCAyLCAyKSk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDIsIDIsIDIsIDIpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihsb3dlcmNhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJyAgICcpO1xuXHRcdFx0XHRhc3NlcnRTZWxlY3Rpb24oZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDIsIDIsIDIsIDIpKTtcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFxuXHRcdFx0W1xuXHRcdFx0XHQnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHQnXHUwMEY2XHUwMEU3XHUwMTVGXHUwMTFGXHUwMEZDJyxcblx0XHRcdFx0J3BhcnNlSFRNTFN0cmluZycsXG5cdFx0XHRcdCdnZXRFbGVtZW50QnlJZCcsXG5cdFx0XHRcdCdQYXNjYWxDYXNlJyxcblx0XHRcdFx0J1x1MDBGNlx1MDBFN1x1MDE1Rlx1MDBENlx1MDBDN1x1MDE1RVx1MDExRlx1MDBGQ1x1MDExRVx1MDBEQycsXG5cdFx0XHRcdCdhdWRpb0NvbnZlcnRlci5jb252ZXJ0TTRBVG9NUDMoKTsnLFxuXHRcdFx0XHQnQ2FwaXRhbF9TbmFrZV9DYXNlJyxcblx0XHRcdFx0J3BhcnNlSFRNTDRTdHJpbmcnLFxuXHRcdFx0XHQnX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yJyxcblx0XHRcdFx0J0tlYmFiLUNhc2UnLFxuXHRcdFx0XSwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRcdGNvbnN0IGtlYmFiQ2FzZUFjdGlvbiA9IG5ldyBLZWJhYkNhc2VBY3Rpb24oKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMTIpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihrZWJhYkNhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ2hlbGxvIHdvcmxkJyk7XG5cdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMTIpKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgNikpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKGtlYmFiQ2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnXHUwMEY2XHUwMEU3XHUwMTVGXHUwMTFGXHUwMEZDJyk7XG5cdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgNikpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigzLCAxLCAzLCAxNikpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKGtlYmFiQ2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAncGFyc2UtaHRtbC1zdHJpbmcnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbigzLCAxLCAzLCAxOCkpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbig0LCAxLCA0LCAxNSkpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKGtlYmFiQ2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDQpLCAnZ2V0LWVsZW1lbnQtYnktaWQnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbig0LCAxLCA0LCAxOCkpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbig1LCAxLCA1LCAxMSkpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKGtlYmFiQ2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDUpLCAncGFzY2FsLWNhc2UnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbig1LCAxLCA1LCAxMikpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbig2LCAxLCA2LCAxMSkpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKGtlYmFiQ2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDYpLCAnXHUwMEY2XHUwMEU3XHUwMTVGLVx1MDBGNlx1MDBFNy1cdTAxNUZcdTAxMUZcdTAwRkMtXHUwMTFGXHUwMEZDJyk7XG5cdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oNiwgMSwgNiwgMTQpKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oNywgMSwgNywgMzQpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihrZWJhYkNhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg3KSwgJ2F1ZGlvLWNvbnZlcnRlci5jb252ZXJ0LW00YS10by1tcDMoKTsnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbig3LCAxLCA3LCAzOCkpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbig4LCAxLCA4LCAxOSkpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKGtlYmFiQ2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDgpLCAnY2FwaXRhbC1zbmFrZS1jYXNlJyk7XG5cdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oOCwgMSwgOCwgMTkpKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oOSwgMSwgOSwgMTcpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihrZWJhYkNhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg5KSwgJ3BhcnNlLWh0bWw0LXN0cmluZycpO1xuXHRcdFx0XHRhc3NlcnRTZWxlY3Rpb24oZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDksIDEsIDksIDE5KSk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEwLCAxLCAxMCwgMjgpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihrZWJhYkNhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxMCksICdfYWNjZXNzb3I6IHNlcnZpY2VzLWFjY2Vzc29yJyk7XG5cdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMTAsIDEsIDEwLCAyOSkpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxMSwgMSwgMTEsIDExKSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24oa2ViYWJDYXNlQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMTEpLCAna2ViYWItY2FzZScpO1xuXHRcdFx0XHRhc3NlcnRTZWxlY3Rpb24oZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDExLCAxLCAxMSwgMTEpKTtcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFxuXHRcdFx0W1xuXHRcdFx0XHQnaGVsbG8gd29ybGQnLFxuXHRcdFx0XHQnXHUwMEY2XHUwMEU3XHUwMTVGXHUwMTFGXHUwMEZDJyxcblx0XHRcdFx0J3BhcnNlSFRNTFN0cmluZycsXG5cdFx0XHRcdCdnZXRFbGVtZW50QnlJZCcsXG5cdFx0XHRcdCdQYXNjYWxDYXNlJyxcblx0XHRcdFx0J1x1MDBGNlx1MDBFN1x1MDE1Rlx1MDBENlx1MDBDN1x1MDE1RVx1MDExRlx1MDBGQ1x1MDExRVx1MDBEQycsXG5cdFx0XHRcdCdhdWRpb0NvbnZlcnRlci5jb252ZXJ0TTRBVG9NUDMoKTsnLFxuXHRcdFx0XHQnQ2FwaXRhbF9TbmFrZV9DYXNlJyxcblx0XHRcdFx0J3BhcnNlSFRNTDRTdHJpbmcnLFxuXHRcdFx0XHQnS2ViYWItQ2FzZScsXG5cdFx0XHRcdCdGT09fQkFSJyxcblx0XHRcdFx0J0ZPTyBCQVIgQScsXG5cdFx0XHRcdCd4TUxfSFRUUC1yZVFVRXNUJyxcblx0XHRcdFx0J1x1MDBDOUNPTEUnLFxuXHRcdFx0XHQnXHUwM0E5TUVHQV9DQVNFJyxcblx0XHRcdFx0J1x1MDQxNFx1MDQxRVx1MDQxQ19cdTA0MjJcdTA0MTVcdTA0MjFcdTA0MjInLFxuXHRcdFx0XSwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRcdGNvbnN0IHBhc2NhbENhc2VBY3Rpb24gPSBuZXcgUGFzY2FsQ2FzZUFjdGlvbigpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxMikpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHBhc2NhbENhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ0hlbGxvV29ybGQnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxMSkpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigyLCAxLCAyLCA2KSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24ocGFzY2FsQ2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnXHUwMEQ2XHUwMEU3XHUwMTVGXHUwMTFGXHUwMEZDJyk7XG5cdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgNikpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigzLCAxLCAzLCAxNikpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHBhc2NhbENhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJ1BhcnNlSFRNTFN0cmluZycpO1xuXHRcdFx0XHRhc3NlcnRTZWxlY3Rpb24oZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDMsIDEsIDMsIDE2KSk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDQsIDEsIDQsIDE1KSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24ocGFzY2FsQ2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDQpLCAnR2V0RWxlbWVudEJ5SWQnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbig0LCAxLCA0LCAxNSkpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbig1LCAxLCA1LCAxMSkpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHBhc2NhbENhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg1KSwgJ1Bhc2NhbENhc2UnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbig1LCAxLCA1LCAxMSkpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbig2LCAxLCA2LCAxMSkpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHBhc2NhbENhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg2KSwgJ1x1MDBENlx1MDBFN1x1MDE1Rlx1MDBENlx1MDBDN1x1MDE1RVx1MDExRlx1MDBGQ1x1MDExRVx1MDBEQycpO1xuXHRcdFx0XHRhc3NlcnRTZWxlY3Rpb24oZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDYsIDEsIDYsIDExKSk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDcsIDEsIDcsIDM0KSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24ocGFzY2FsQ2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDcpLCAnQXVkaW9Db252ZXJ0ZXIuQ29udmVydE00QVRvTVAzKCk7Jyk7XG5cdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oNywgMSwgNywgMzQpKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oOCwgMSwgOCwgMTkpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihwYXNjYWxDYXNlQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoOCksICdDYXBpdGFsU25ha2VDYXNlJyk7XG5cdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oOCwgMSwgOCwgMTcpKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oOSwgMSwgOSwgMTcpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihwYXNjYWxDYXNlQWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoOSksICdQYXJzZUhUTUw0U3RyaW5nJyk7XG5cdFx0XHRcdGFzc2VydFNlbGVjdGlvbihlZGl0b3IsIG5ldyBTZWxlY3Rpb24oOSwgMSwgOSwgMTcpKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMTAsIDEsIDEwLCAxMSkpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHBhc2NhbENhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxMCksICdLZWJhYkNhc2UnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxMCwgMSwgMTAsIDEwKSk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDksIDEsIDEwLCAxMSkpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHBhc2NhbENhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZUluUmFuZ2UobmV3IFNlbGVjdGlvbig5LCAxLCAxMCwgMTEpKSwgJ1BhcnNlSFRNTDRTdHJpbmdcXG5LZWJhYkNhc2UnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbig5LCAxLCAxMCwgMTApKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMTEsIDEsIDExLCA4KSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24ocGFzY2FsQ2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDExKSwgJ0Zvb0JhcicpO1xuXHRcdFx0XHRhc3NlcnRTZWxlY3Rpb24oZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDExLCAxLCAxMSwgNykpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxMiwgMSwgMTIsIDEwKSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24ocGFzY2FsQ2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEyKSwgJ0Zvb0JhckEnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxMiwgMSwgMTIsIDgpKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMTMsIDEsIDEzLCAxNykpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHBhc2NhbENhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxMyksICdYbWxIdHRwUmVRVUVzVCcpO1xuXHRcdFx0XHRhc3NlcnRTZWxlY3Rpb24oZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDEzLCAxLCAxMywgMTUpKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMTQsIDEsIDE0LCA2KSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24ocGFzY2FsQ2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDE0KSwgJ1x1MDBDOWNvbGUnKTtcblx0XHRcdFx0YXNzZXJ0U2VsZWN0aW9uKGVkaXRvciwgbmV3IFNlbGVjdGlvbigxNCwgMSwgMTQsIDYpKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMTUsIDEsIDE1LCAxMSkpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKHBhc2NhbENhc2VBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxNSksICdcdTAzQTltZWdhQ2FzZScpO1xuXHRcdFx0XHRhc3NlcnRTZWxlY3Rpb24oZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDE1LCAxLCAxNSwgMTApKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMTYsIDEsIDE2LCA5KSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24ocGFzY2FsQ2FzZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDE2KSwgJ1x1MDQxNFx1MDQzRVx1MDQzQ1x1MDQyMlx1MDQzNVx1MDQ0MVx1MDQ0MicpO1xuXHRcdFx0XHRhc3NlcnRTZWxlY3Rpb24oZWRpdG9yLCBuZXcgU2VsZWN0aW9uKDE2LCAxLCAxNiwgOCkpO1xuXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0c3VpdGUoJ0RlbGV0ZUFsbFJpZ2h0QWN0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBiZSBub29wIG9uIGVtcHR5JywgKCkgPT4ge1xuXHRcdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFsnJ10sIHt9LCAoZWRpdG9yKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBuZXcgRGVsZXRlQWxsUmlnaHRBY3Rpb24oKTtcblxuXHRcdFx0XHRleGVjdXRlQWN0aW9uKGFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lc0NvbnRlbnQoKSwgWycnXSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSwgW25ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSldKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSkpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKGFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lc0NvbnRlbnQoKSwgWycnXSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSwgW25ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSldKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSwgbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKSwgbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKV0pO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKGFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lc0NvbnRlbnQoKSwgWycnXSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSwgW25ldyBTZWxlY3Rpb24oMSwgMSwgMSwgMSldKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRlbGV0ZSBzZWxlY3RlZCByYW5nZScsICgpID0+IHtcblx0XHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHRcdCdoZWxsbycsXG5cdFx0XHRcdCd3b3JsZCdcblx0XHRcdF0sIHt9LCAoZWRpdG9yKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBuZXcgRGVsZXRlQWxsUmlnaHRBY3Rpb24oKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgMiwgMSwgNSkpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKGFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lc0NvbnRlbnQoKSwgWydobycsICd3b3JsZCddKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbbmV3IFNlbGVjdGlvbigxLCAyLCAxLCAyKV0pO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCAxLCAyLCA0KSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24oYWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVzQ29udGVudCgpLCBbJ2xkJ10pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCksIFtuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpXSk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDMpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihhY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZXNDb250ZW50KCksIFsnJ10pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCksIFtuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpXSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBkZWxldGUgdG8gdGhlIHJpZ2h0IG9mIHRoZSBjdXJzb3InLCAoKSA9PiB7XG5cdFx0XHR3aXRoVGVzdENvZGVFZGl0b3IoW1xuXHRcdFx0XHQnaGVsbG8nLFxuXHRcdFx0XHQnd29ybGQnXG5cdFx0XHRdLCB7fSwgKGVkaXRvcikgPT4ge1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpITtcblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gbmV3IERlbGV0ZUFsbFJpZ2h0QWN0aW9uKCk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbihuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpKTtcblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihhY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZXNDb250ZW50KCksIFsnaGUnLCAnd29ybGQnXSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSwgW25ldyBTZWxlY3Rpb24oMSwgMywgMSwgMyldKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSkpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKGFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lc0NvbnRlbnQoKSwgWydoZScsICcnXSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSwgW25ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSldKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGpvaW4gdHdvIGxpbmVzLCBpZiBhdCB0aGUgZW5kIG9mIHRoZSBsaW5lJywgKCkgPT4ge1xuXHRcdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdFx0J2hlbGxvJyxcblx0XHRcdFx0J3dvcmxkJ1xuXHRcdFx0XSwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IG5ldyBEZWxldGVBbGxSaWdodEFjdGlvbigpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCA2LCAxLCA2KSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24oYWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVzQ29udGVudCgpLCBbJ2hlbGxvd29ybGQnXSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSwgW25ldyBTZWxlY3Rpb24oMSwgNiwgMSwgNildKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9uKG5ldyBTZWxlY3Rpb24oMSwgNiwgMSwgNikpO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKGFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lc0NvbnRlbnQoKSwgWydoZWxsbyddKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbbmV3IFNlbGVjdGlvbigxLCA2LCAxLCA2KV0pO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb24obmV3IFNlbGVjdGlvbigxLCA2LCAxLCA2KSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24oYWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVzQ29udGVudCgpLCBbJ2hlbGxvJ10pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCksIFtuZXcgU2VsZWN0aW9uKDEsIDYsIDEsIDYpXSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB3b3JrIHdpdGggbXVsdGlwbGUgY3Vyc29ycycsICgpID0+IHtcblx0XHRcdHdpdGhUZXN0Q29kZUVkaXRvcihbXG5cdFx0XHRcdCdoZWxsbycsXG5cdFx0XHRcdCd0aGVyZScsXG5cdFx0XHRcdCd3b3JsZCdcblx0XHRcdF0sIHt9LCAoZWRpdG9yKSA9PiB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCkhO1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBuZXcgRGVsZXRlQWxsUmlnaHRBY3Rpb24oKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKSxcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDYsIDEsIDYpLFxuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgNCwgMywgNCksXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRleGVjdXRlQWN0aW9uKGFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lc0NvbnRlbnQoKSwgWydoZXRoZXJlJywgJ3dvciddKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKSxcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDQpXG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24oYWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVzQ29udGVudCgpLCBbJ2hlJywgJ3dvciddKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKSxcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDQsIDIsIDQpXG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24oYWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVzQ29udGVudCgpLCBbJ2hld29yJ10pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCksIFtcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpLFxuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNiwgMSwgNilcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihhY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZXNDb250ZW50KCksIFsnaGUnXSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSwgW1xuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMywgMSwgMylcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihhY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZXNDb250ZW50KCksIFsnaGUnXSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSwgW1xuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMywgMSwgMylcblx0XHRcdFx0XSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCB3b3JrIHdpdGggdW5kby9yZWRvJywgKCkgPT4ge1xuXHRcdFx0d2l0aFRlc3RDb2RlRWRpdG9yKFtcblx0XHRcdFx0J2hlbGxvJyxcblx0XHRcdFx0J3RoZXJlJyxcblx0XHRcdFx0J3dvcmxkJ1xuXHRcdFx0XSwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKSE7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IG5ldyBEZWxldGVBbGxSaWdodEFjdGlvbigpO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpLFxuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNiwgMSwgNiksXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCA0LCAzLCA0KSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24oYWN0aW9uLCBlZGl0b3IpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVzQ29udGVudCgpLCBbJ2hldGhlcmUnLCAnd29yJ10pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCksIFtcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpLFxuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgNCwgMiwgNClcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5VbmRvLCBudWxsKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0U2VsZWN0aW9ucygpLCBbXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigxLCAzLCAxLCAzKSxcblx0XHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDYsIDEsIDYpLFxuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMywgNCwgMywgNClcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGVkaXRvci5ydW5Db21tYW5kKENvcmVFZGl0aW5nQ29tbWFuZHMuUmVkbywgbnVsbCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbnMoKSwgW1xuXHRcdFx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgMywgMSwgMyksXG5cdFx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCA0LCAyLCA0KVxuXHRcdFx0XHRdKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnNlcnRMaW5lQmVmb3JlQWN0aW9uJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIHRlc3RJbnNlcnRMaW5lQmVmb3JlKGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uOiBudW1iZXIsIGNhbGxiYWNrOiAobW9kZWw6IElUZXh0TW9kZWwsIHZpZXdNb2RlbDogVmlld01vZGVsKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0XHRjb25zdCBURVhUID0gW1xuXHRcdFx0XHQnRmlyc3QgbGluZScsXG5cdFx0XHRcdCdTZWNvbmQgbGluZScsXG5cdFx0XHRcdCdUaGlyZCBsaW5lJ1xuXHRcdFx0XTtcblx0XHRcdHdpdGhUZXN0Q29kZUVkaXRvcihURVhULCB7fSwgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRcdGVkaXRvci5zZXRQb3NpdGlvbihuZXcgUG9zaXRpb24obGluZU51bWJlciwgY29sdW1uKSk7XG5cdFx0XHRcdGNvbnN0IGluc2VydExpbmVCZWZvcmVBY3Rpb24gPSBuZXcgSW5zZXJ0TGluZUJlZm9yZUFjdGlvbigpO1xuXG5cdFx0XHRcdGV4ZWN1dGVBY3Rpb24oaW5zZXJ0TGluZUJlZm9yZUFjdGlvbiwgZWRpdG9yKTtcblx0XHRcdFx0Y2FsbGJhY2soZWRpdG9yLmdldE1vZGVsKCkhLCB2aWV3TW9kZWwpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGVzdEluc2VydExpbmVCZWZvcmUoMSwgMywgKG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldFNlbGVjdGlvbigpLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnRmlyc3QgbGluZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAnU2Vjb25kIGxpbmUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJ1RoaXJkIGxpbmUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3RJbnNlcnRMaW5lQmVmb3JlKDIsIDMsIChtb2RlbCwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb24oKSwgbmV3IFNlbGVjdGlvbigyLCAxLCAyLCAxKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdGaXJzdCBsaW5lJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMiksICcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJ1NlY29uZCBsaW5lJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICdUaGlyZCBsaW5lJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0SW5zZXJ0TGluZUJlZm9yZSgzLCAzLCAobW9kZWwsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0U2VsZWN0aW9uKCksIG5ldyBTZWxlY3Rpb24oMywgMSwgMywgMSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnRmlyc3QgbGluZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDIpLCAnU2Vjb25kIGxpbmUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgzKSwgJycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDQpLCAnVGhpcmQgbGluZScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnNlcnRMaW5lQWZ0ZXJBY3Rpb24nLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gdGVzdEluc2VydExpbmVBZnRlcihsaW5lTnVtYmVyOiBudW1iZXIsIGNvbHVtbjogbnVtYmVyLCBjYWxsYmFjazogKG1vZGVsOiBJVGV4dE1vZGVsLCB2aWV3TW9kZWw6IFZpZXdNb2RlbCkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdFx0Y29uc3QgVEVYVCA9IFtcblx0XHRcdFx0J0ZpcnN0IGxpbmUnLFxuXHRcdFx0XHQnU2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQnVGhpcmQgbGluZSdcblx0XHRcdF07XG5cdFx0XHR3aXRoVGVzdENvZGVFZGl0b3IoVEVYVCwge30sIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24obmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIGNvbHVtbikpO1xuXHRcdFx0XHRjb25zdCBpbnNlcnRMaW5lQWZ0ZXJBY3Rpb24gPSBuZXcgSW5zZXJ0TGluZUFmdGVyQWN0aW9uKCk7XG5cblx0XHRcdFx0ZXhlY3V0ZUFjdGlvbihpbnNlcnRMaW5lQWZ0ZXJBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRcdGNhbGxiYWNrKGVkaXRvci5nZXRNb2RlbCgpISwgdmlld01vZGVsKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRlc3RJbnNlcnRMaW5lQWZ0ZXIoMSwgMywgKG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldFNlbGVjdGlvbigpLCBuZXcgU2VsZWN0aW9uKDIsIDEsIDIsIDEpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ0ZpcnN0IGxpbmUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDMpLCAnU2Vjb25kIGxpbmUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJ1RoaXJkIGxpbmUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3RJbnNlcnRMaW5lQWZ0ZXIoMiwgMywgKG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldFNlbGVjdGlvbigpLCBuZXcgU2VsZWN0aW9uKDMsIDEsIDMsIDEpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ0ZpcnN0IGxpbmUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ1NlY29uZCBsaW5lJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCg0KSwgJ1RoaXJkIGxpbmUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3RJbnNlcnRMaW5lQWZ0ZXIoMywgMywgKG1vZGVsLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldFNlbGVjdGlvbigpLCBuZXcgU2VsZWN0aW9uKDQsIDEsIDQsIDEpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ0ZpcnN0IGxpbmUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgyKSwgJ1NlY29uZCBsaW5lJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMyksICdUaGlyZCBsaW5lJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoNCksICcnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQnVnIDE4Mjc2OltlZGl0b3JdIEluZGVudGF0aW9uIGJyb2tlbiB3aGVuIHNlbGVjdGlvbiBpcyBlbXB0eScsICgpID0+IHtcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnZnVuY3Rpb24gYmF6KCkgeydcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7XG5cdFx0XHRcdGluc2VydFNwYWNlczogZmFsc2UsXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdHdpdGhUZXN0Q29kZUVkaXRvcihtb2RlbCwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdGNvbnN0IGluZGVudExpbmVzQWN0aW9uID0gbmV3IEluZGVudExpbmVzQWN0aW9uKCk7XG5cdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDIpKTtcblxuXHRcdFx0ZXhlY3V0ZUFjdGlvbihpbmRlbnRMaW5lc0FjdGlvbiwgZWRpdG9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJ1xcdGZ1bmN0aW9uIGJheigpIHsnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbigpLCBuZXcgU2VsZWN0aW9uKDEsIDMsIDEsIDMpKTtcblxuXHRcdFx0ZWRpdG9yLnJ1bkNvbW1hbmQoQ29yZUVkaXRpbmdDb21tYW5kcy5UYWIsIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldExpbmVDb250ZW50KDEpLCAnXFx0ZlxcdHVuY3Rpb24gYmF6KCkgeycpO1xuXHRcdH0pO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjODA3MzY6IEluZGVudGluZyB3aGlsZSB0aGUgY3Vyc29yIGlzIGF0IHRoZSBzdGFydCBvZiBhIGxpbmUgb2YgdGV4dCBjYXVzZXMgdGhlIGFkZGVkIHNwYWNlcyBvciB0YWIgdG8gYmUgc2VsZWN0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoXG5cdFx0XHRbXG5cdFx0XHRcdCdTb21lIHRleHQnXG5cdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0e1xuXHRcdFx0XHRpbnNlcnRTcGFjZXM6IGZhbHNlLFxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHt9LCAoZWRpdG9yKSA9PiB7XG5cdFx0XHRjb25zdCBpbmRlbnRMaW5lc0FjdGlvbiA9IG5ldyBJbmRlbnRMaW5lc0FjdGlvbigpO1xuXHRcdFx0ZWRpdG9yLnNldFBvc2l0aW9uKG5ldyBQb3NpdGlvbigxLCAxKSk7XG5cblx0XHRcdGV4ZWN1dGVBY3Rpb24oaW5kZW50TGluZXNBY3Rpb24sIGVkaXRvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0TGluZUNvbnRlbnQoMSksICdcXHRTb21lIHRleHQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbigpLCBuZXcgU2VsZWN0aW9uKDEsIDIsIDEsIDIpKTtcblx0XHR9KTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnSW5kZW50aW5nIG9uIGVtcHR5IGxpbmUgc2hvdWxkIG1vdmUgY3Vyc29yJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFxuXHRcdFx0W1xuXHRcdFx0XHQnJ1xuXHRcdFx0XS5qb2luKCdcXG4nKVxuXHRcdCk7XG5cblx0XHR3aXRoVGVzdENvZGVFZGl0b3IobW9kZWwsIHsgdXNlVGFiU3RvcHM6IGZhbHNlIH0sIChlZGl0b3IpID0+IHtcblx0XHRcdGNvbnN0IGluZGVudExpbmVzQWN0aW9uID0gbmV3IEluZGVudExpbmVzQWN0aW9uKCk7XG5cdFx0XHRlZGl0b3Iuc2V0UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDEpKTtcblxuXHRcdFx0ZXhlY3V0ZUFjdGlvbihpbmRlbnRMaW5lc0FjdGlvbiwgZWRpdG9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRMaW5lQ29udGVudCgxKSwgJyAgICAnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldFNlbGVjdGlvbigpLCBuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDUpKTtcblx0XHR9KTtcblxuXHRcdG1vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzYyMTEyOiBEZWxldGUgbGluZSBkb2VzIG5vdCB3b3JrIHByb3Blcmx5IHdoZW4gbXVsdGlwbGUgY3Vyc29ycyBhcmUgb24gbGluZScsICgpID0+IHtcblx0XHRjb25zdCBURVhUID0gW1xuXHRcdFx0J2EnLFxuXHRcdFx0J2ZvbyBib28nLFxuXHRcdFx0J3RvbycsXG5cdFx0XHQnYycsXG5cdFx0XTtcblx0XHR3aXRoVGVzdENvZGVFZGl0b3IoVEVYVCwge30sIChlZGl0b3IpID0+IHtcblx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFtcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCA0LCAyLCA0KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigyLCA4LCAyLCA4KSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbigzLCA0LCAzLCA0KSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgZGVsZXRlTGluZXNBY3Rpb24gPSBuZXcgRGVsZXRlTGluZXNBY3Rpb24oKTtcblx0XHRcdGV4ZWN1dGVBY3Rpb24oZGVsZXRlTGluZXNBY3Rpb24sIGVkaXRvcik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0VmFsdWUoKSwgJ2FcXG5jJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHRlc3REZWxldGVMaW5lc0NvbW1hbmQoaW5pdGlhbFRleHQ6IHN0cmluZ1tdLCBfaW5pdGlhbFNlbGVjdGlvbnM6IFNlbGVjdGlvbiB8IFNlbGVjdGlvbltdLCByZXN1bHRpbmdUZXh0OiBzdHJpbmdbXSwgX3Jlc3VsdGluZ1NlbGVjdGlvbnM6IFNlbGVjdGlvbiB8IFNlbGVjdGlvbltdKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5pdGlhbFNlbGVjdGlvbnMgPSBBcnJheS5pc0FycmF5KF9pbml0aWFsU2VsZWN0aW9ucykgPyBfaW5pdGlhbFNlbGVjdGlvbnMgOiBbX2luaXRpYWxTZWxlY3Rpb25zXTtcblx0XHRjb25zdCByZXN1bHRpbmdTZWxlY3Rpb25zID0gQXJyYXkuaXNBcnJheShfcmVzdWx0aW5nU2VsZWN0aW9ucykgPyBfcmVzdWx0aW5nU2VsZWN0aW9ucyA6IFtfcmVzdWx0aW5nU2VsZWN0aW9uc107XG5cdFx0d2l0aFRlc3RDb2RlRWRpdG9yKGluaXRpYWxUZXh0LCB7fSwgKGVkaXRvcikgPT4ge1xuXHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoaW5pdGlhbFNlbGVjdGlvbnMpO1xuXHRcdFx0Y29uc3QgZGVsZXRlTGluZXNBY3Rpb24gPSBuZXcgRGVsZXRlTGluZXNBY3Rpb24oKTtcblx0XHRcdGV4ZWN1dGVBY3Rpb24oZGVsZXRlTGluZXNBY3Rpb24sIGVkaXRvcik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IuZ2V0VmFsdWUoKSwgcmVzdWx0aW5nVGV4dC5qb2luKCdcXG4nKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRTZWxlY3Rpb25zKCksIHJlc3VsdGluZ1NlbGVjdGlvbnMpO1xuXHRcdH0pO1xuXHR9XG5cblx0dGVzdCgnZW1wdHkgc2VsZWN0aW9uIGluIG1pZGRsZSBvZiBsaW5lcycsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0RGVsZXRlTGluZXNDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDMsIDIsIDMpLFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDMsIDIsIDMpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZW1wdHkgc2VsZWN0aW9uIGF0IHRvcCBvZiBsaW5lcycsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0RGVsZXRlTGluZXNDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDUpLFxuXHRcdFx0W1xuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDEsIDUsIDEsIDUpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZW1wdHkgc2VsZWN0aW9uIGF0IGVuZCBvZiBsaW5lcycsIGZ1bmN0aW9uICgpIHtcblx0XHR0ZXN0RGVsZXRlTGluZXNDb21tYW5kKFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDUsIDIsIDUsIDIpLFxuXHRcdFx0W1xuXHRcdFx0XHQnZmlyc3QnLFxuXHRcdFx0XHQnc2Vjb25kIGxpbmUnLFxuXHRcdFx0XHQndGhpcmQgbGluZScsXG5cdFx0XHRcdCdmb3VydGggbGluZSdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDIsIDQsIDIpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnd2l0aCBzZWxlY3Rpb24gaW4gbWlkZGxlIG9mIGxpbmVzJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3REZWxldGVMaW5lc0NvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMywgMywgMiwgMiksXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdmb3VydGggbGluZScsXG5cdFx0XHRcdCdmaWZ0aCdcblx0XHRcdF0sXG5cdFx0XHRuZXcgU2VsZWN0aW9uKDIsIDIsIDIsIDIpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnd2l0aCBzZWxlY3Rpb24gYXQgdG9wIG9mIGxpbmVzJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3REZWxldGVMaW5lc0NvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNCwgMSwgNSksXG5cdFx0XHRbXG5cdFx0XHRcdCdzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd3aXRoIHNlbGVjdGlvbiBhdCBlbmQgb2YgbGluZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdERlbGV0ZUxpbmVzQ29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbig1LCAxLCA1LCAyKSxcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbig0LCAyLCA0LCAyKVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dpdGggZnVsbCBsaW5lIHNlbGVjdGlvbiBpbiBtaWRkbGUgb2YgbGluZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0dGVzdERlbGV0ZUxpbmVzQ29tbWFuZChcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J3NlY29uZCBsaW5lJyxcblx0XHRcdFx0J3RoaXJkIGxpbmUnLFxuXHRcdFx0XHQnZm91cnRoIGxpbmUnLFxuXHRcdFx0XHQnZmlmdGgnXG5cdFx0XHRdLFxuXHRcdFx0bmV3IFNlbGVjdGlvbig0LCAxLCAyLCAxKSxcblx0XHRcdFtcblx0XHRcdFx0J2ZpcnN0Jyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMSwgMiwgMSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd3aXRoIGZ1bGwgbGluZSBzZWxlY3Rpb24gYXQgdG9wIG9mIGxpbmVzJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3REZWxldGVMaW5lc0NvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMiwgMSwgMSwgNSksXG5cdFx0XHRbXG5cdFx0XHRcdCdzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMSwgNSwgMSwgNSlcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd3aXRoIGZ1bGwgbGluZSBzZWxlY3Rpb24gYXQgZW5kIG9mIGxpbmVzJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3REZWxldGVMaW5lc0NvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJyxcblx0XHRcdFx0J2ZvdXJ0aCBsaW5lJyxcblx0XHRcdFx0J2ZpZnRoJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oNCwgMSwgNSwgMiksXG5cdFx0XHRbXG5cdFx0XHRcdCdmaXJzdCcsXG5cdFx0XHRcdCdzZWNvbmQgbGluZScsXG5cdFx0XHRcdCd0aGlyZCBsaW5lJ1xuXHRcdFx0XSxcblx0XHRcdG5ldyBTZWxlY3Rpb24oMywgMiwgMywgMilcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aWN1cnNvciAxJywgZnVuY3Rpb24gKCkge1xuXHRcdHRlc3REZWxldGVMaW5lc0NvbW1hbmQoXG5cdFx0XHRbXG5cdFx0XHRcdCdjbGFzcyBQIHsnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JyAgICBnZXRBKCkgeycsXG5cdFx0XHRcdCcgICAgICAgIGlmICh0cnVlKSB7Jyxcblx0XHRcdFx0JyAgICAgICAgICAgIHJldHVybiBcImFcIjsnLFxuXHRcdFx0XHQnICAgICAgICB9Jyxcblx0XHRcdFx0JyAgICB9Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcgICAgZ2V0QigpIHsnLFxuXHRcdFx0XHQnICAgICAgICBpZiAodHJ1ZSkgeycsXG5cdFx0XHRcdCcgICAgICAgICAgICByZXR1cm4gXCJiXCI7Jyxcblx0XHRcdFx0JyAgICAgICAgfScsXG5cdFx0XHRcdCcgICAgfScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnICAgIGdldEMoKSB7Jyxcblx0XHRcdFx0JyAgICAgICAgaWYgKHRydWUpIHsnLFxuXHRcdFx0XHQnICAgICAgICAgICAgcmV0dXJuIFwiY1wiOycsXG5cdFx0XHRcdCcgICAgICAgIH0nLFxuXHRcdFx0XHQnICAgIH0nLFxuXHRcdFx0XHQnfScsXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDEsIDUsIDEpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDEwLCAxLCAxMSwgMSksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb24oMTYsIDEsIDE3LCAxKSxcblx0XHRcdF0sXG5cdFx0XHRbXG5cdFx0XHRcdCdjbGFzcyBQIHsnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JyAgICBnZXRBKCkgeycsXG5cdFx0XHRcdCcgICAgICAgICAgICByZXR1cm4gXCJhXCI7Jyxcblx0XHRcdFx0JyAgICAgICAgfScsXG5cdFx0XHRcdCcgICAgfScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnICAgIGdldEIoKSB7Jyxcblx0XHRcdFx0JyAgICAgICAgICAgIHJldHVybiBcImJcIjsnLFxuXHRcdFx0XHQnICAgICAgICB9Jyxcblx0XHRcdFx0JyAgICB9Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcgICAgZ2V0QygpIHsnLFxuXHRcdFx0XHQnICAgICAgICAgICAgcmV0dXJuIFwiY1wiOycsXG5cdFx0XHRcdCcgICAgICAgIH0nLFxuXHRcdFx0XHQnICAgIH0nLFxuXHRcdFx0XHQnfScsXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDQsIDEsIDQsIDEpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDksIDEsIDksIDEpLFxuXHRcdFx0XHRuZXcgU2VsZWN0aW9uKDE0LCAxLCAxNCwgMSksXG5cdFx0XHRdXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDJCQUEyQjtBQUdwQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGVBQWU7QUFHeEIsU0FBUyxpQkFBaUIsa0JBQWtCLHFCQUFxQixzQkFBc0IsNEJBQTRCLG1CQUFtQixtQkFBbUIsdUJBQXVCLHdCQUF3QixpQkFBaUIsaUJBQWlCLGlCQUFpQixpQkFBaUIsMEJBQTBCLDJCQUEyQixpQkFBaUIsaUJBQWlCLGlCQUFpQiwwQkFBMEI7QUFDOVksU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxnQkFBZ0IsUUFBcUIsVUFBeUM7QUFDdEYsTUFBSSxDQUFDLE1BQU0sUUFBUSxRQUFRLEdBQUc7QUFDN0IsZUFBVyxDQUFDLFFBQVE7QUFBQSxFQUNyQjtBQUNBLFNBQU8sZ0JBQWdCLE9BQU8sY0FBYyxHQUFHLFFBQVE7QUFDeEQ7QUFFQSxTQUFTLGNBQWMsUUFBc0IsUUFBMkI7QUFDdkUsU0FBTyxJQUFJLE1BQU8sUUFBUSxNQUFTO0FBQ3BDO0FBRUEsTUFBTSxvQ0FBb0MsTUFBTTtBQUUvQywwQ0FBd0M7QUFFeEMsUUFBTSw0QkFBNEIsTUFBTTtBQUN2QyxTQUFLLGlEQUFpRCxXQUFZO0FBQ2pFO0FBQUEsUUFDQztBQUFBLFVBQ0M7QUFBQSxV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
