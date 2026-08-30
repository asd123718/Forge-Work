import assert from "assert";
import { FoldingModel, updateFoldingStateAtIndex } from "../../browser/viewModel/foldingModel.js";
import { changeCellToKind, computeCellLinesContents, copyCellRange, insertCell, joinNotebookCells, moveCellRange, runDeleteAction } from "../../browser/controller/cellOperations.js";
import { CellEditType, CellKind, SelectionStateType } from "../../common/notebookCommon.js";
import { withTestNotebook } from "./testNotebookEditor.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { ResourceTextEdit } from "../../../../../editor/browser/services/bulkEditService.js";
import { ResourceNotebookCellEdit } from "../../../bulkEdit/browser/bulkCellEdits.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { ValidAnnotatedEditOperation } from "../../../../../editor/common/model.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
suite("CellOperations", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Move cells - single cell", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel) => {
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 1, end: 2 }] });
        const cell = viewModel.cellAt(1);
        assert.ok(cell);
        await moveCellRange({ notebookEditor: editor, cell }, "down");
        assert.strictEqual(viewModel.cellAt(2)?.getText(), "var b = 1;");
        assert.strictEqual(cell, viewModel.cellAt(2));
      }
    );
  });
  test("Move cells - multiple cells in a selection", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel) => {
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 0, end: 2 }] });
        await moveCellRange({ notebookEditor: editor }, "down");
        assert.strictEqual(viewModel.cellAt(0)?.getText(), "# header b");
        assert.strictEqual(viewModel.cellAt(1)?.getText(), "# header a");
        assert.strictEqual(viewModel.cellAt(2)?.getText(), "var b = 1;");
      }
    );
  });
  test("Move cells - move with folding ranges", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel, ds) => {
        const foldingModel = ds.add(new FoldingModel());
        foldingModel.attachViewModel(viewModel);
        updateFoldingStateAtIndex(foldingModel, 0, true);
        updateFoldingStateAtIndex(foldingModel, 1, true);
        viewModel.updateFoldingRanges(foldingModel.regions);
        editor.setHiddenAreas([{ start: 1, end: 2 }]);
        editor.setHiddenAreas(viewModel.getHiddenRanges());
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 1 }] });
        await moveCellRange({ notebookEditor: editor }, "down");
        assert.strictEqual(viewModel.cellAt(0)?.getText(), "# header b");
        assert.strictEqual(viewModel.cellAt(1)?.getText(), "# header a");
        assert.strictEqual(viewModel.cellAt(2)?.getText(), "var b = 1;");
      }
    );
  });
  test("Copy/duplicate cells - single cell", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel) => {
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 1, end: 2 }] });
        await copyCellRange({ notebookEditor: editor, cell: viewModel.cellAt(1) }, "down");
        assert.strictEqual(viewModel.length, 6);
        assert.strictEqual(viewModel.cellAt(1)?.getText(), "var b = 1;");
        assert.strictEqual(viewModel.cellAt(2)?.getText(), "var b = 1;");
      }
    );
  });
  test("Copy/duplicate cells - target and selection are different, #119769", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel) => {
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 1 }] });
        await copyCellRange({ notebookEditor: editor, cell: viewModel.cellAt(1), ui: true }, "down");
        assert.strictEqual(viewModel.length, 6);
        assert.strictEqual(viewModel.cellAt(1)?.getText(), "var b = 1;");
        assert.strictEqual(viewModel.cellAt(2)?.getText(), "var b = 1;");
      }
    );
  });
  test("Copy/duplicate cells - multiple cells in a selection", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel) => {
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 0, end: 2 }] });
        await copyCellRange({ notebookEditor: editor, cell: viewModel.cellAt(1) }, "down");
        assert.strictEqual(viewModel.length, 7);
        assert.strictEqual(viewModel.cellAt(0)?.getText(), "# header a");
        assert.strictEqual(viewModel.cellAt(1)?.getText(), "var b = 1;");
        assert.strictEqual(viewModel.cellAt(2)?.getText(), "# header a");
        assert.strictEqual(viewModel.cellAt(3)?.getText(), "var b = 1;");
      }
    );
  });
  test("Copy/duplicate cells - move with folding ranges", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel, ds) => {
        const foldingModel = ds.add(new FoldingModel());
        foldingModel.attachViewModel(viewModel);
        updateFoldingStateAtIndex(foldingModel, 0, true);
        updateFoldingStateAtIndex(foldingModel, 1, true);
        viewModel.updateFoldingRanges(foldingModel.regions);
        editor.setHiddenAreas([{ start: 1, end: 2 }]);
        editor.setHiddenAreas(viewModel.getHiddenRanges());
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 1 }] });
        await copyCellRange({ notebookEditor: editor, cell: viewModel.cellAt(1) }, "down");
        assert.strictEqual(viewModel.length, 7);
        assert.strictEqual(viewModel.cellAt(0)?.getText(), "# header a");
        assert.strictEqual(viewModel.cellAt(1)?.getText(), "var b = 1;");
        assert.strictEqual(viewModel.cellAt(2)?.getText(), "# header a");
        assert.strictEqual(viewModel.cellAt(3)?.getText(), "var b = 1;");
      }
    );
  });
  test("Copy/duplicate cells - should not share the same text buffer #102423", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel) => {
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 1, end: 2 }] });
        await copyCellRange({ notebookEditor: editor, cell: viewModel.cellAt(1) }, "down");
        assert.strictEqual(viewModel.length, 3);
        const cell1 = viewModel.cellAt(1);
        const cell2 = viewModel.cellAt(2);
        assert.ok(cell1);
        assert.ok(cell2);
        assert.strictEqual(cell1.getText(), "var b = 1;");
        assert.strictEqual(viewModel.cellAt(2)?.getText(), "var b = 1;");
        cell1.textBuffer.applyEdits([
          new ValidAnnotatedEditOperation(null, new Range(1, 1, 1, 4), "", false, false, false)
        ], false, true);
        assert.notStrictEqual(cell1.getText(), cell2.getText());
      }
    );
  });
  test("Join cell with below - single cell", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel, accessor) => {
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 3, end: 4 }, selections: [{ start: 3, end: 4 }] });
        const ret = await joinNotebookCells(editor, { start: 3, end: 4 }, "below");
        assert.strictEqual(ret?.edits.length, 2);
        assert.deepStrictEqual(ret?.edits[0], new ResourceTextEdit(viewModel.cellAt(3).uri, {
          range: new Range(1, 11, 1, 11),
          text: viewModel.cellAt(4).textBuffer.getEOL() + "var c = 3;"
        }));
        assert.deepStrictEqual(ret?.edits[1], new ResourceNotebookCellEdit(
          editor.textModel.uri,
          {
            editType: CellEditType.Replace,
            index: 4,
            count: 1,
            cells: []
          }
        ));
      }
    );
  });
  test("Join cell with above - single cell", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel, accessor) => {
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 3, end: 4 }, selections: [{ start: 3, end: 4 }] });
        const ret = await joinNotebookCells(editor, { start: 4, end: 5 }, "above");
        assert.strictEqual(ret?.edits.length, 2);
        assert.deepStrictEqual(ret?.edits[0], new ResourceTextEdit(viewModel.cellAt(3).uri, {
          range: new Range(1, 11, 1, 11),
          text: viewModel.cellAt(4).textBuffer.getEOL() + "var c = 3;"
        }));
        assert.deepStrictEqual(ret?.edits[1], new ResourceNotebookCellEdit(
          editor.textModel.uri,
          {
            editType: CellEditType.Replace,
            index: 4,
            count: 1,
            cells: []
          }
        ));
      }
    );
  });
  test("Join cell with below - multiple cells", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel, accessor) => {
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 0, end: 2 }] });
        const ret = await joinNotebookCells(editor, { start: 0, end: 2 }, "below");
        assert.strictEqual(ret?.edits.length, 2);
        assert.deepStrictEqual(ret?.edits[0], new ResourceTextEdit(viewModel.cellAt(0).uri, {
          range: new Range(1, 11, 1, 11),
          text: viewModel.cellAt(1).textBuffer.getEOL() + "var b = 2;" + viewModel.cellAt(2).textBuffer.getEOL() + "var c = 3;"
        }));
        assert.deepStrictEqual(ret?.edits[1], new ResourceNotebookCellEdit(
          editor.textModel.uri,
          {
            editType: CellEditType.Replace,
            index: 1,
            count: 2,
            cells: []
          }
        ));
      }
    );
  });
  test("Join cell with above - multiple cells", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel, accessor) => {
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 2, end: 3 }, selections: [{ start: 1, end: 3 }] });
        const ret = await joinNotebookCells(editor, { start: 1, end: 3 }, "above");
        assert.strictEqual(ret?.edits.length, 2);
        assert.deepStrictEqual(ret?.edits[0], new ResourceTextEdit(viewModel.cellAt(0).uri, {
          range: new Range(1, 11, 1, 11),
          text: viewModel.cellAt(1).textBuffer.getEOL() + "var b = 2;" + viewModel.cellAt(2).textBuffer.getEOL() + "var c = 3;"
        }));
        assert.deepStrictEqual(ret?.edits[1], new ResourceNotebookCellEdit(
          editor.textModel.uri,
          {
            editType: CellEditType.Replace,
            index: 1,
            count: 2,
            cells: []
          }
        ));
      }
    );
  });
  test("Delete focus cell", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel) => {
        editor.setFocus({ start: 0, end: 1 });
        editor.setSelections([{ start: 0, end: 1 }]);
        runDeleteAction(editor, viewModel.cellAt(0));
        assert.strictEqual(viewModel.length, 2);
      }
    );
  });
  test("Delete selected cells", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel) => {
        editor.setFocus({ start: 0, end: 1 });
        editor.setSelections([{ start: 0, end: 2 }]);
        runDeleteAction(editor, viewModel.cellAt(0));
        assert.strictEqual(viewModel.length, 1);
      }
    );
  });
  test("Delete focus cell out of a selection", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}],
        ["var d = 4;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel) => {
        editor.setFocus({ start: 0, end: 1 });
        editor.setSelections([{ start: 2, end: 4 }]);
        runDeleteAction(editor, viewModel.cellAt(0));
        assert.strictEqual(viewModel.length, 3);
      }
    );
  });
  test("Delete UI target", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel) => {
        editor.setFocus({ start: 0, end: 1 });
        editor.setSelections([{ start: 0, end: 1 }]);
        runDeleteAction(editor, viewModel.cellAt(2));
        assert.strictEqual(viewModel.length, 2);
        assert.strictEqual(viewModel.cellAt(0)?.getText(), "var a = 1;");
        assert.strictEqual(viewModel.cellAt(1)?.getText(), "var b = 2;");
      }
    );
  });
  test("Delete UI target 2", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}],
        ["var d = 4;", "javascript", CellKind.Code, [], {}],
        ["var e = 5;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel) => {
        editor.setFocus({ start: 0, end: 1 });
        editor.setSelections([{ start: 0, end: 1 }, { start: 3, end: 5 }]);
        runDeleteAction(editor, viewModel.cellAt(1));
        assert.strictEqual(viewModel.length, 4);
        assert.deepStrictEqual(editor.getFocus(), { start: 0, end: 1 });
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 0, end: 1 }, { start: 2, end: 4 }]);
      }
    );
  });
  test("Delete UI target 3", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}],
        ["var d = 4;", "javascript", CellKind.Code, [], {}],
        ["var e = 5;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel) => {
        editor.setFocus({ start: 0, end: 1 });
        editor.setSelections([{ start: 2, end: 3 }]);
        runDeleteAction(editor, viewModel.cellAt(0));
        assert.strictEqual(viewModel.length, 4);
        assert.deepStrictEqual(editor.getFocus(), { start: 0, end: 1 });
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 1, end: 2 }]);
      }
    );
  });
  test("Delete UI target 4", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}],
        ["var d = 4;", "javascript", CellKind.Code, [], {}],
        ["var e = 5;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel) => {
        editor.setFocus({ start: 2, end: 3 });
        editor.setSelections([{ start: 3, end: 5 }]);
        runDeleteAction(editor, viewModel.cellAt(0));
        assert.strictEqual(viewModel.length, 4);
        assert.deepStrictEqual(editor.getFocus(), { start: 1, end: 2 });
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 2, end: 4 }]);
      }
    );
  });
  test("Delete last cell sets selection correctly", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel) => {
        editor.setFocus({ start: 2, end: 3 });
        editor.setSelections([{ start: 2, end: 3 }]);
        runDeleteAction(editor, viewModel.cellAt(2));
        assert.strictEqual(viewModel.length, 2);
        assert.deepStrictEqual(editor.getFocus(), { start: 1, end: 2 });
      }
    );
  });
  test("#120187. Delete should work on multiple distinct selection", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}],
        ["var d = 4;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel) => {
        editor.setFocus({ start: 0, end: 1 });
        editor.setSelections([{ start: 0, end: 1 }, { start: 3, end: 4 }]);
        runDeleteAction(editor, viewModel.cellAt(0));
        assert.strictEqual(viewModel.length, 2);
        assert.deepStrictEqual(editor.getFocus(), { start: 0, end: 1 });
      }
    );
  });
  test("#120187. Delete should work on multiple distinct selection 2", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}],
        ["var d = 4;", "javascript", CellKind.Code, [], {}],
        ["var e = 5;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel) => {
        editor.setFocus({ start: 1, end: 2 });
        editor.setSelections([{ start: 1, end: 2 }, { start: 3, end: 5 }]);
        runDeleteAction(editor, viewModel.cellAt(1));
        assert.strictEqual(viewModel.length, 2);
        assert.deepStrictEqual(editor.getFocus(), { start: 1, end: 2 });
      }
    );
  });
  test("Change cell kind - single cell", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel) => {
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 1, end: 2 }] });
        await changeCellToKind(CellKind.Markup, { notebookEditor: editor, cell: viewModel.cellAt(1), ui: true });
        assert.strictEqual(viewModel.cellAt(1)?.cellKind, CellKind.Markup);
      }
    );
  });
  test("Change cell kind - multi cells", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel) => {
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 1, end: 2 }] });
        await changeCellToKind(CellKind.Markup, { notebookEditor: editor, selectedCells: [viewModel.cellAt(3), viewModel.cellAt(4)], ui: false });
        assert.strictEqual(viewModel.cellAt(3)?.cellKind, CellKind.Markup);
        assert.strictEqual(viewModel.cellAt(4)?.cellKind, CellKind.Markup);
      }
    );
  });
  test("split cell", async function() {
    await withTestNotebook(
      [
        ["var b = 1;", "javascript", CellKind.Code, [], {}]
      ],
      (editor, viewModel) => {
        assert.deepStrictEqual(computeCellLinesContents(viewModel.cellAt(0), [{ lineNumber: 1, column: 4 }]), [
          "var",
          " b = 1;"
        ]);
        assert.deepStrictEqual(computeCellLinesContents(viewModel.cellAt(0), [{ lineNumber: 1, column: 4 }, { lineNumber: 1, column: 6 }]), [
          "var",
          " b",
          " = 1;"
        ]);
        assert.deepStrictEqual(computeCellLinesContents(viewModel.cellAt(0), [{ lineNumber: 1, column: 1 }]), [
          "",
          "var b = 1;"
        ]);
        assert.deepStrictEqual(computeCellLinesContents(viewModel.cellAt(0), [{ lineNumber: 1, column: 11 }]), [
          "var b = 1;",
          ""
        ]);
      }
    );
  });
  test("Insert cell", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        const languageService = accessor.get(ILanguageService);
        const insertedCellAbove = insertCell(languageService, editor, 4, CellKind.Code, "above", "var a = 0;");
        assert.strictEqual(viewModel.length, 6);
        assert.strictEqual(viewModel.cellAt(4), insertedCellAbove);
        const insertedCellBelow = insertCell(languageService, editor, 1, CellKind.Code, "below", "var a = 0;");
        assert.strictEqual(viewModel.length, 7);
        assert.strictEqual(viewModel.cellAt(2), insertedCellBelow);
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFx0ZXN0XFxicm93c2VyXFxjZWxsT3BlcmF0aW9ucy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRm9sZGluZ01vZGVsLCB1cGRhdGVGb2xkaW5nU3RhdGVBdEluZGV4IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci92aWV3TW9kZWwvZm9sZGluZ01vZGVsLmpzJztcbmltcG9ydCB7IGNoYW5nZUNlbGxUb0tpbmQsIGNvbXB1dGVDZWxsTGluZXNDb250ZW50cywgY29weUNlbGxSYW5nZSwgaW5zZXJ0Q2VsbCwgam9pbk5vdGVib29rQ2VsbHMsIG1vdmVDZWxsUmFuZ2UsIHJ1bkRlbGV0ZUFjdGlvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvY29udHJvbGxlci9jZWxsT3BlcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBDZWxsRWRpdFR5cGUsIENlbGxLaW5kLCBTZWxlY3Rpb25TdGF0ZVR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgd2l0aFRlc3ROb3RlYm9vayB9IGZyb20gJy4vdGVzdE5vdGVib29rRWRpdG9yLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IFJlc291cmNlVGV4dEVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9idWxrRWRpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VOb3RlYm9va0NlbGxFZGl0IH0gZnJvbSAnLi4vLi4vLi4vYnVsa0VkaXQvYnJvd3Nlci9idWxrQ2VsbEVkaXRzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJVGV4dEJ1ZmZlciwgVmFsaWRBbm5vdGF0ZWRFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ0NlbGxPcGVyYXRpb25zJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdNb3ZlIGNlbGxzIC0gc2luZ2xlIGNlbGwnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciBhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgYicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBjID0gMzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZVNlbGVjdGlvbnNTdGF0ZSh7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IHsgc3RhcnQ6IDEsIGVuZDogMiB9LCBzZWxlY3Rpb25zOiBbeyBzdGFydDogMSwgZW5kOiAyIH1dIH0pO1xuXHRcdFx0XHRjb25zdCBjZWxsID0gdmlld01vZGVsLmNlbGxBdCgxKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGNlbGwpO1xuXHRcdFx0XHRhd2FpdCBtb3ZlQ2VsbFJhbmdlKHsgbm90ZWJvb2tFZGl0b3I6IGVkaXRvciwgY2VsbDogY2VsbCB9LCAnZG93bicpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmNlbGxBdCgyKT8uZ2V0VGV4dCgpLCAndmFyIGIgPSAxOycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbCwgdmlld01vZGVsLmNlbGxBdCgyKSk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnTW92ZSBjZWxscyAtIG11bHRpcGxlIGNlbGxzIGluIGEgc2VsZWN0aW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgYScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYyA9IDM7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRcdHZpZXdNb2RlbC51cGRhdGVTZWxlY3Rpb25zU3RhdGUoeyBraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsIGZvY3VzOiB7IHN0YXJ0OiAxLCBlbmQ6IDIgfSwgc2VsZWN0aW9uczogW3sgc3RhcnQ6IDAsIGVuZDogMiB9XSB9KTtcblx0XHRcdFx0YXdhaXQgbW92ZUNlbGxSYW5nZSh7IG5vdGVib29rRWRpdG9yOiBlZGl0b3IgfSwgJ2Rvd24nKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5jZWxsQXQoMCk/LmdldFRleHQoKSwgJyMgaGVhZGVyIGInKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5jZWxsQXQoMSk/LmdldFRleHQoKSwgJyMgaGVhZGVyIGEnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5jZWxsQXQoMik/LmdldFRleHQoKSwgJ3ZhciBiID0gMTsnKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdNb3ZlIGNlbGxzIC0gbW92ZSB3aXRoIGZvbGRpbmcgcmFuZ2VzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgYScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYyA9IDM7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBkcykgPT4ge1xuXHRcdFx0XHRjb25zdCBmb2xkaW5nTW9kZWwgPSBkcy5hZGQobmV3IEZvbGRpbmdNb2RlbCgpKTtcblx0XHRcdFx0Zm9sZGluZ01vZGVsLmF0dGFjaFZpZXdNb2RlbCh2aWV3TW9kZWwpO1xuXHRcdFx0XHR1cGRhdGVGb2xkaW5nU3RhdGVBdEluZGV4KGZvbGRpbmdNb2RlbCwgMCwgdHJ1ZSk7XG5cdFx0XHRcdHVwZGF0ZUZvbGRpbmdTdGF0ZUF0SW5kZXgoZm9sZGluZ01vZGVsLCAxLCB0cnVlKTtcblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZUZvbGRpbmdSYW5nZXMoZm9sZGluZ01vZGVsLnJlZ2lvbnMpO1xuXHRcdFx0XHRlZGl0b3Iuc2V0SGlkZGVuQXJlYXMoW3sgc3RhcnQ6IDEsIGVuZDogMiB9XSk7XG5cdFx0XHRcdGVkaXRvci5zZXRIaWRkZW5BcmVhcyh2aWV3TW9kZWwuZ2V0SGlkZGVuUmFuZ2VzKCkpO1xuXG5cdFx0XHRcdHZpZXdNb2RlbC51cGRhdGVTZWxlY3Rpb25zU3RhdGUoeyBraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsIGZvY3VzOiB7IHN0YXJ0OiAwLCBlbmQ6IDEgfSwgc2VsZWN0aW9uczogW3sgc3RhcnQ6IDAsIGVuZDogMSB9XSB9KTtcblx0XHRcdFx0YXdhaXQgbW92ZUNlbGxSYW5nZSh7IG5vdGVib29rRWRpdG9yOiBlZGl0b3IgfSwgJ2Rvd24nKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5jZWxsQXQoMCk/LmdldFRleHQoKSwgJyMgaGVhZGVyIGInKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5jZWxsQXQoMSk/LmdldFRleHQoKSwgJyMgaGVhZGVyIGEnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5jZWxsQXQoMik/LmdldFRleHQoKSwgJ3ZhciBiID0gMTsnKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXG5cdHRlc3QoJ0NvcHkvZHVwbGljYXRlIGNlbGxzIC0gc2luZ2xlIGNlbGwnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciBhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgYicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBjID0gMzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZVNlbGVjdGlvbnNTdGF0ZSh7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IHsgc3RhcnQ6IDEsIGVuZDogMiB9LCBzZWxlY3Rpb25zOiBbeyBzdGFydDogMSwgZW5kOiAyIH1dIH0pO1xuXHRcdFx0XHRhd2FpdCBjb3B5Q2VsbFJhbmdlKHsgbm90ZWJvb2tFZGl0b3I6IGVkaXRvciwgY2VsbDogdmlld01vZGVsLmNlbGxBdCgxKSEgfSwgJ2Rvd24nKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5sZW5ndGgsIDYpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmNlbGxBdCgxKT8uZ2V0VGV4dCgpLCAndmFyIGIgPSAxOycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmNlbGxBdCgyKT8uZ2V0VGV4dCgpLCAndmFyIGIgPSAxOycpO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NvcHkvZHVwbGljYXRlIGNlbGxzIC0gdGFyZ2V0IGFuZCBzZWxlY3Rpb24gYXJlIGRpZmZlcmVudCwgIzExOTc2OScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIGEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciBiJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGMgPSAzOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlU2VsZWN0aW9uc1N0YXRlKHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogeyBzdGFydDogMCwgZW5kOiAxIH0sIHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiAwLCBlbmQ6IDEgfV0gfSk7XG5cdFx0XHRcdGF3YWl0IGNvcHlDZWxsUmFuZ2UoeyBub3RlYm9va0VkaXRvcjogZWRpdG9yLCBjZWxsOiB2aWV3TW9kZWwuY2VsbEF0KDEpISwgdWk6IHRydWUgfSwgJ2Rvd24nKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5sZW5ndGgsIDYpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmNlbGxBdCgxKT8uZ2V0VGV4dCgpLCAndmFyIGIgPSAxOycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmNlbGxBdCgyKT8uZ2V0VGV4dCgpLCAndmFyIGIgPSAxOycpO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NvcHkvZHVwbGljYXRlIGNlbGxzIC0gbXVsdGlwbGUgY2VsbHMgaW4gYSBzZWxlY3Rpb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciBhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgYicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBjID0gMzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZVNlbGVjdGlvbnNTdGF0ZSh7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IHsgc3RhcnQ6IDEsIGVuZDogMiB9LCBzZWxlY3Rpb25zOiBbeyBzdGFydDogMCwgZW5kOiAyIH1dIH0pO1xuXHRcdFx0XHRhd2FpdCBjb3B5Q2VsbFJhbmdlKHsgbm90ZWJvb2tFZGl0b3I6IGVkaXRvciwgY2VsbDogdmlld01vZGVsLmNlbGxBdCgxKSEgfSwgJ2Rvd24nKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5sZW5ndGgsIDcpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmNlbGxBdCgwKT8uZ2V0VGV4dCgpLCAnIyBoZWFkZXIgYScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmNlbGxBdCgxKT8uZ2V0VGV4dCgpLCAndmFyIGIgPSAxOycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmNlbGxBdCgyKT8uZ2V0VGV4dCgpLCAnIyBoZWFkZXIgYScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmNlbGxBdCgzKT8uZ2V0VGV4dCgpLCAndmFyIGIgPSAxOycpO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NvcHkvZHVwbGljYXRlIGNlbGxzIC0gbW92ZSB3aXRoIGZvbGRpbmcgcmFuZ2VzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgYScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYyA9IDM7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBkcykgPT4ge1xuXHRcdFx0XHRjb25zdCBmb2xkaW5nTW9kZWwgPSBkcy5hZGQobmV3IEZvbGRpbmdNb2RlbCgpKTtcblx0XHRcdFx0Zm9sZGluZ01vZGVsLmF0dGFjaFZpZXdNb2RlbCh2aWV3TW9kZWwpO1xuXHRcdFx0XHR1cGRhdGVGb2xkaW5nU3RhdGVBdEluZGV4KGZvbGRpbmdNb2RlbCwgMCwgdHJ1ZSk7XG5cdFx0XHRcdHVwZGF0ZUZvbGRpbmdTdGF0ZUF0SW5kZXgoZm9sZGluZ01vZGVsLCAxLCB0cnVlKTtcblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZUZvbGRpbmdSYW5nZXMoZm9sZGluZ01vZGVsLnJlZ2lvbnMpO1xuXHRcdFx0XHRlZGl0b3Iuc2V0SGlkZGVuQXJlYXMoW3sgc3RhcnQ6IDEsIGVuZDogMiB9XSk7XG5cdFx0XHRcdGVkaXRvci5zZXRIaWRkZW5BcmVhcyh2aWV3TW9kZWwuZ2V0SGlkZGVuUmFuZ2VzKCkpO1xuXG5cdFx0XHRcdHZpZXdNb2RlbC51cGRhdGVTZWxlY3Rpb25zU3RhdGUoeyBraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsIGZvY3VzOiB7IHN0YXJ0OiAwLCBlbmQ6IDEgfSwgc2VsZWN0aW9uczogW3sgc3RhcnQ6IDAsIGVuZDogMSB9XSB9KTtcblx0XHRcdFx0YXdhaXQgY29weUNlbGxSYW5nZSh7IG5vdGVib29rRWRpdG9yOiBlZGl0b3IsIGNlbGw6IHZpZXdNb2RlbC5jZWxsQXQoMSkhIH0sICdkb3duJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwubGVuZ3RoLCA3KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5jZWxsQXQoMCk/LmdldFRleHQoKSwgJyMgaGVhZGVyIGEnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5jZWxsQXQoMSk/LmdldFRleHQoKSwgJ3ZhciBiID0gMTsnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5jZWxsQXQoMik/LmdldFRleHQoKSwgJyMgaGVhZGVyIGEnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5jZWxsQXQoMyk/LmdldFRleHQoKSwgJ3ZhciBiID0gMTsnKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDb3B5L2R1cGxpY2F0ZSBjZWxscyAtIHNob3VsZCBub3Qgc2hhcmUgdGhlIHNhbWUgdGV4dCBidWZmZXIgIzEwMjQyMycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIGEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlU2VsZWN0aW9uc1N0YXRlKHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogeyBzdGFydDogMSwgZW5kOiAyIH0sIHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiAxLCBlbmQ6IDIgfV0gfSk7XG5cdFx0XHRcdGF3YWl0IGNvcHlDZWxsUmFuZ2UoeyBub3RlYm9va0VkaXRvcjogZWRpdG9yLCBjZWxsOiB2aWV3TW9kZWwuY2VsbEF0KDEpISB9LCAnZG93bicpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgMyk7XG5cdFx0XHRcdGNvbnN0IGNlbGwxID0gdmlld01vZGVsLmNlbGxBdCgxKTtcblx0XHRcdFx0Y29uc3QgY2VsbDIgPSB2aWV3TW9kZWwuY2VsbEF0KDIpO1xuXHRcdFx0XHRhc3NlcnQub2soY2VsbDEpO1xuXHRcdFx0XHRhc3NlcnQub2soY2VsbDIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbDEuZ2V0VGV4dCgpLCAndmFyIGIgPSAxOycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmNlbGxBdCgyKT8uZ2V0VGV4dCgpLCAndmFyIGIgPSAxOycpO1xuXG5cdFx0XHRcdChjZWxsMS50ZXh0QnVmZmVyIGFzIElUZXh0QnVmZmVyKS5hcHBseUVkaXRzKFtcblx0XHRcdFx0XHRuZXcgVmFsaWRBbm5vdGF0ZWRFZGl0T3BlcmF0aW9uKG51bGwsIG5ldyBSYW5nZSgxLCAxLCAxLCA0KSwgJycsIGZhbHNlLCBmYWxzZSwgZmFsc2UpXG5cdFx0XHRcdF0sIGZhbHNlLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGNlbGwxLmdldFRleHQoKSwgY2VsbDIuZ2V0VGV4dCgpKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdKb2luIGNlbGwgd2l0aCBiZWxvdyAtIHNpbmdsZSBjZWxsJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgYScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYyA9IDM7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlU2VsZWN0aW9uc1N0YXRlKHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogeyBzdGFydDogMywgZW5kOiA0IH0sIHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiAzLCBlbmQ6IDQgfV0gfSk7XG5cdFx0XHRcdGNvbnN0IHJldCA9IGF3YWl0IGpvaW5Ob3RlYm9va0NlbGxzKGVkaXRvciwgeyBzdGFydDogMywgZW5kOiA0IH0sICdiZWxvdycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmV0Py5lZGl0cy5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJldD8uZWRpdHNbMF0sIG5ldyBSZXNvdXJjZVRleHRFZGl0KHZpZXdNb2RlbC5jZWxsQXQoMykhLnVyaSwge1xuXHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMTEsIDEsIDExKSwgdGV4dDogdmlld01vZGVsLmNlbGxBdCg0KSEudGV4dEJ1ZmZlci5nZXRFT0woKSArICd2YXIgYyA9IDM7J1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmV0Py5lZGl0c1sxXSwgbmV3IFJlc291cmNlTm90ZWJvb2tDZWxsRWRpdChlZGl0b3IudGV4dE1vZGVsLnVyaSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdFx0XHRpbmRleDogNCxcblx0XHRcdFx0XHRcdGNvdW50OiAxLFxuXHRcdFx0XHRcdFx0Y2VsbHM6IFtdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHQpKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdKb2luIGNlbGwgd2l0aCBhYm92ZSAtIHNpbmdsZSBjZWxsJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgYScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYyA9IDM7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlU2VsZWN0aW9uc1N0YXRlKHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogeyBzdGFydDogMywgZW5kOiA0IH0sIHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiAzLCBlbmQ6IDQgfV0gfSk7XG5cdFx0XHRcdGNvbnN0IHJldCA9IGF3YWl0IGpvaW5Ob3RlYm9va0NlbGxzKGVkaXRvciwgeyBzdGFydDogNCwgZW5kOiA1IH0sICdhYm92ZScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmV0Py5lZGl0cy5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJldD8uZWRpdHNbMF0sIG5ldyBSZXNvdXJjZVRleHRFZGl0KHZpZXdNb2RlbC5jZWxsQXQoMykhLnVyaSwge1xuXHRcdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMTEsIDEsIDExKSwgdGV4dDogdmlld01vZGVsLmNlbGxBdCg0KSEudGV4dEJ1ZmZlci5nZXRFT0woKSArICd2YXIgYyA9IDM7J1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmV0Py5lZGl0c1sxXSwgbmV3IFJlc291cmNlTm90ZWJvb2tDZWxsRWRpdChlZGl0b3IudGV4dE1vZGVsLnVyaSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdFx0XHRpbmRleDogNCxcblx0XHRcdFx0XHRcdGNvdW50OiAxLFxuXHRcdFx0XHRcdFx0Y2VsbHM6IFtdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHQpKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdKb2luIGNlbGwgd2l0aCBiZWxvdyAtIG11bHRpcGxlIGNlbGxzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBjID0gMzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdHZpZXdNb2RlbC51cGRhdGVTZWxlY3Rpb25zU3RhdGUoeyBraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsIGZvY3VzOiB7IHN0YXJ0OiAxLCBlbmQ6IDIgfSwgc2VsZWN0aW9uczogW3sgc3RhcnQ6IDAsIGVuZDogMiB9XSB9KTtcblx0XHRcdFx0Y29uc3QgcmV0ID0gYXdhaXQgam9pbk5vdGVib29rQ2VsbHMoZWRpdG9yLCB7IHN0YXJ0OiAwLCBlbmQ6IDIgfSwgJ2JlbG93Jyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXQ/LmVkaXRzLmxlbmd0aCwgMik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmV0Py5lZGl0c1swXSwgbmV3IFJlc291cmNlVGV4dEVkaXQodmlld01vZGVsLmNlbGxBdCgwKSEudXJpLCB7XG5cdFx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxMSwgMSwgMTEpLCB0ZXh0OiB2aWV3TW9kZWwuY2VsbEF0KDEpIS50ZXh0QnVmZmVyLmdldEVPTCgpICsgJ3ZhciBiID0gMjsnICsgdmlld01vZGVsLmNlbGxBdCgyKSEudGV4dEJ1ZmZlci5nZXRFT0woKSArICd2YXIgYyA9IDM7J1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmV0Py5lZGl0c1sxXSwgbmV3IFJlc291cmNlTm90ZWJvb2tDZWxsRWRpdChlZGl0b3IudGV4dE1vZGVsLnVyaSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdFx0XHRpbmRleDogMSxcblx0XHRcdFx0XHRcdGNvdW50OiAyLFxuXHRcdFx0XHRcdFx0Y2VsbHM6IFtdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHQpKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdKb2luIGNlbGwgd2l0aCBhYm92ZSAtIG11bHRpcGxlIGNlbGxzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBjID0gMzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdHZpZXdNb2RlbC51cGRhdGVTZWxlY3Rpb25zU3RhdGUoeyBraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsIGZvY3VzOiB7IHN0YXJ0OiAyLCBlbmQ6IDMgfSwgc2VsZWN0aW9uczogW3sgc3RhcnQ6IDEsIGVuZDogMyB9XSB9KTtcblx0XHRcdFx0Y29uc3QgcmV0ID0gYXdhaXQgam9pbk5vdGVib29rQ2VsbHMoZWRpdG9yLCB7IHN0YXJ0OiAxLCBlbmQ6IDMgfSwgJ2Fib3ZlJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXQ/LmVkaXRzLmxlbmd0aCwgMik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmV0Py5lZGl0c1swXSwgbmV3IFJlc291cmNlVGV4dEVkaXQodmlld01vZGVsLmNlbGxBdCgwKSEudXJpLCB7XG5cdFx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxMSwgMSwgMTEpLCB0ZXh0OiB2aWV3TW9kZWwuY2VsbEF0KDEpIS50ZXh0QnVmZmVyLmdldEVPTCgpICsgJ3ZhciBiID0gMjsnICsgdmlld01vZGVsLmNlbGxBdCgyKSEudGV4dEJ1ZmZlci5nZXRFT0woKSArICd2YXIgYyA9IDM7J1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmV0Py5lZGl0c1sxXSwgbmV3IFJlc291cmNlTm90ZWJvb2tDZWxsRWRpdChlZGl0b3IudGV4dE1vZGVsLnVyaSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdFx0XHRpbmRleDogMSxcblx0XHRcdFx0XHRcdGNvdW50OiAyLFxuXHRcdFx0XHRcdFx0Y2VsbHM6IFtdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHQpKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdEZWxldGUgZm9jdXMgY2VsbCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYyA9IDM7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRcdGVkaXRvci5zZXRGb2N1cyh7IHN0YXJ0OiAwLCBlbmQ6IDEgfSk7XG5cdFx0XHRcdGVkaXRvci5zZXRTZWxlY3Rpb25zKFt7IHN0YXJ0OiAwLCBlbmQ6IDEgfV0pO1xuXHRcdFx0XHRydW5EZWxldGVBY3Rpb24oZWRpdG9yLCB2aWV3TW9kZWwuY2VsbEF0KDApISk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwubGVuZ3RoLCAyKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdEZWxldGUgc2VsZWN0ZWQgY2VsbHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGMgPSAzOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0XHRlZGl0b3Iuc2V0Rm9jdXMoeyBzdGFydDogMCwgZW5kOiAxIH0pO1xuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbeyBzdGFydDogMCwgZW5kOiAyIH1dKTtcblx0XHRcdFx0cnVuRGVsZXRlQWN0aW9uKGVkaXRvciwgdmlld01vZGVsLmNlbGxBdCgwKSEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgMSk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRGVsZXRlIGZvY3VzIGNlbGwgb3V0IG9mIGEgc2VsZWN0aW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBjID0gMzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGQgPSA0OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdFx0ZWRpdG9yLnNldEZvY3VzKHsgc3RhcnQ6IDAsIGVuZDogMSB9KTtcblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW3sgc3RhcnQ6IDIsIGVuZDogNCB9XSk7XG5cdFx0XHRcdHJ1bkRlbGV0ZUFjdGlvbihlZGl0b3IsIHZpZXdNb2RlbC5jZWxsQXQoMCkhKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5sZW5ndGgsIDMpO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0RlbGV0ZSBVSSB0YXJnZXQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGMgPSAzOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0XHRlZGl0b3Iuc2V0Rm9jdXMoeyBzdGFydDogMCwgZW5kOiAxIH0pO1xuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbeyBzdGFydDogMCwgZW5kOiAxIH1dKTtcblx0XHRcdFx0cnVuRGVsZXRlQWN0aW9uKGVkaXRvciwgdmlld01vZGVsLmNlbGxBdCgyKSEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgMik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuY2VsbEF0KDApPy5nZXRUZXh0KCksICd2YXIgYSA9IDE7Jyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuY2VsbEF0KDEpPy5nZXRUZXh0KCksICd2YXIgYiA9IDI7Jyk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRGVsZXRlIFVJIHRhcmdldCAyJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBjID0gMzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGQgPSA0OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgZSA9IDU7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0XHRlZGl0b3Iuc2V0Rm9jdXMoeyBzdGFydDogMCwgZW5kOiAxIH0pO1xuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbeyBzdGFydDogMCwgZW5kOiAxIH0sIHsgc3RhcnQ6IDMsIGVuZDogNSB9XSk7XG5cdFx0XHRcdHJ1bkRlbGV0ZUFjdGlvbihlZGl0b3IsIHZpZXdNb2RlbC5jZWxsQXQoMSkhKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5sZW5ndGgsIDQpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRGb2N1cygpLCB7IHN0YXJ0OiAwLCBlbmQ6IDEgfSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldFNlbGVjdGlvbnMoKSwgW3sgc3RhcnQ6IDAsIGVuZDogMSB9LCB7IHN0YXJ0OiAyLCBlbmQ6IDQgfV0pO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0RlbGV0ZSBVSSB0YXJnZXQgMycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYyA9IDM7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBkID0gNDsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGUgPSA1OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdFx0ZWRpdG9yLnNldEZvY3VzKHsgc3RhcnQ6IDAsIGVuZDogMSB9KTtcblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW3sgc3RhcnQ6IDIsIGVuZDogMyB9XSk7XG5cdFx0XHRcdHJ1bkRlbGV0ZUFjdGlvbihlZGl0b3IsIHZpZXdNb2RlbC5jZWxsQXQoMCkhKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5sZW5ndGgsIDQpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRGb2N1cygpLCB7IHN0YXJ0OiAwLCBlbmQ6IDEgfSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldFNlbGVjdGlvbnMoKSwgW3sgc3RhcnQ6IDEsIGVuZDogMiB9XSk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnRGVsZXRlIFVJIHRhcmdldCA0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBjID0gMzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGQgPSA0OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgZSA9IDU7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0XHRlZGl0b3Iuc2V0Rm9jdXMoeyBzdGFydDogMiwgZW5kOiAzIH0pO1xuXHRcdFx0XHRlZGl0b3Iuc2V0U2VsZWN0aW9ucyhbeyBzdGFydDogMywgZW5kOiA1IH1dKTtcblx0XHRcdFx0cnVuRGVsZXRlQWN0aW9uKGVkaXRvciwgdmlld01vZGVsLmNlbGxBdCgwKSEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgNCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdG9yLmdldEZvY3VzKCksIHsgc3RhcnQ6IDEsIGVuZDogMiB9KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0U2VsZWN0aW9ucygpLCBbeyBzdGFydDogMiwgZW5kOiA0IH1dKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXG5cdHRlc3QoJ0RlbGV0ZSBsYXN0IGNlbGwgc2V0cyBzZWxlY3Rpb24gY29ycmVjdGx5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBjID0gMzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdFx0ZWRpdG9yLnNldEZvY3VzKHsgc3RhcnQ6IDIsIGVuZDogMyB9KTtcblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW3sgc3RhcnQ6IDIsIGVuZDogMyB9XSk7XG5cdFx0XHRcdHJ1bkRlbGV0ZUFjdGlvbihlZGl0b3IsIHZpZXdNb2RlbC5jZWxsQXQoMikhKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRvci5nZXRGb2N1cygpLCB7IHN0YXJ0OiAxLCBlbmQ6IDIgfSk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnIzEyMDE4Ny4gRGVsZXRlIHNob3VsZCB3b3JrIG9uIG11bHRpcGxlIGRpc3RpbmN0IHNlbGVjdGlvbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYyA9IDM7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBkID0gNDsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdFx0ZWRpdG9yLnNldEZvY3VzKHsgc3RhcnQ6IDAsIGVuZDogMSB9KTtcblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW3sgc3RhcnQ6IDAsIGVuZDogMSB9LCB7IHN0YXJ0OiAzLCBlbmQ6IDQgfV0pO1xuXHRcdFx0XHRydW5EZWxldGVBY3Rpb24oZWRpdG9yLCB2aWV3TW9kZWwuY2VsbEF0KDApISk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwubGVuZ3RoLCAyKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0Rm9jdXMoKSwgeyBzdGFydDogMCwgZW5kOiAxIH0pO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJyMxMjAxODcuIERlbGV0ZSBzaG91bGQgd29yayBvbiBtdWx0aXBsZSBkaXN0aW5jdCBzZWxlY3Rpb24gMicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYyA9IDM7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBkID0gNDsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGUgPSA1OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdFx0ZWRpdG9yLnNldEZvY3VzKHsgc3RhcnQ6IDEsIGVuZDogMiB9KTtcblx0XHRcdFx0ZWRpdG9yLnNldFNlbGVjdGlvbnMoW3sgc3RhcnQ6IDEsIGVuZDogMiB9LCB7IHN0YXJ0OiAzLCBlbmQ6IDUgfV0pO1xuXHRcdFx0XHRydW5EZWxldGVBY3Rpb24oZWRpdG9yLCB2aWV3TW9kZWwuY2VsbEF0KDEpISk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwubGVuZ3RoLCAyKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0b3IuZ2V0Rm9jdXMoKSwgeyBzdGFydDogMSwgZW5kOiAyIH0pO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NoYW5nZSBjZWxsIGtpbmQgLSBzaW5nbGUgY2VsbCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIGEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciBiJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGMgPSAzOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlU2VsZWN0aW9uc1N0YXRlKHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogeyBzdGFydDogMSwgZW5kOiAyIH0sIHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiAxLCBlbmQ6IDIgfV0gfSk7XG5cdFx0XHRcdGF3YWl0IGNoYW5nZUNlbGxUb0tpbmQoQ2VsbEtpbmQuTWFya3VwLCB7IG5vdGVib29rRWRpdG9yOiBlZGl0b3IsIGNlbGw6IHZpZXdNb2RlbC5jZWxsQXQoMSkhLCB1aTogdHJ1ZSB9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5jZWxsQXQoMSk/LmNlbGxLaW5kLCBDZWxsS2luZC5NYXJrdXApO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NoYW5nZSBjZWxsIGtpbmQgLSBtdWx0aSBjZWxscycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIGEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciBiJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGMgPSAzOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlU2VsZWN0aW9uc1N0YXRlKHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogeyBzdGFydDogMSwgZW5kOiAyIH0sIHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiAxLCBlbmQ6IDIgfV0gfSk7XG5cdFx0XHRcdGF3YWl0IGNoYW5nZUNlbGxUb0tpbmQoQ2VsbEtpbmQuTWFya3VwLCB7IG5vdGVib29rRWRpdG9yOiBlZGl0b3IsIHNlbGVjdGVkQ2VsbHM6IFt2aWV3TW9kZWwuY2VsbEF0KDMpISwgdmlld01vZGVsLmNlbGxBdCg0KSFdLCB1aTogZmFsc2UgfSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuY2VsbEF0KDMpPy5jZWxsS2luZCwgQ2VsbEtpbmQuTWFya3VwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5jZWxsQXQoNCk/LmNlbGxLaW5kLCBDZWxsS2luZC5NYXJrdXApO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cblx0dGVzdCgnc3BsaXQgY2VsbCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHQoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21wdXRlQ2VsbExpbmVzQ29udGVudHModmlld01vZGVsLmNlbGxBdCgwKSEsIFt7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogNCB9XSksIFtcblx0XHRcdFx0XHQndmFyJyxcblx0XHRcdFx0XHQnIGIgPSAxOydcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21wdXRlQ2VsbExpbmVzQ29udGVudHModmlld01vZGVsLmNlbGxBdCgwKSEsIFt7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogNCB9LCB7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogNiB9XSksIFtcblx0XHRcdFx0XHQndmFyJyxcblx0XHRcdFx0XHQnIGInLFxuXHRcdFx0XHRcdCcgPSAxOydcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21wdXRlQ2VsbExpbmVzQ29udGVudHModmlld01vZGVsLmNlbGxBdCgwKSEsIFt7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogMSB9XSksIFtcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHQndmFyIGIgPSAxOydcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21wdXRlQ2VsbExpbmVzQ29udGVudHModmlld01vZGVsLmNlbGxBdCgwKSEsIFt7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogMTEgfV0pLCBbXG5cdFx0XHRcdFx0J3ZhciBiID0gMTsnLFxuXHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRdKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnNlcnQgY2VsbCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIGEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciBiJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGMgPSAzOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCwgX2RzLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cblx0XHRcdFx0Y29uc3QgaW5zZXJ0ZWRDZWxsQWJvdmUgPSBpbnNlcnRDZWxsKGxhbmd1YWdlU2VydmljZSwgZWRpdG9yLCA0LCBDZWxsS2luZC5Db2RlLCAnYWJvdmUnLCAndmFyIGEgPSAwOycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgNik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuY2VsbEF0KDQpLCBpbnNlcnRlZENlbGxBYm92ZSk7XG5cblx0XHRcdFx0Y29uc3QgaW5zZXJ0ZWRDZWxsQmVsb3cgPSBpbnNlcnRDZWxsKGxhbmd1YWdlU2VydmljZSwgZWRpdG9yLCAxLCBDZWxsS2luZC5Db2RlLCAnYmVsb3cnLCAndmFyIGEgPSAwOycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgNyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuY2VsbEF0KDIpLCBpbnNlcnRlZENlbGxCZWxvdyk7XG5cdFx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGNBQWMsaUNBQWlDO0FB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
