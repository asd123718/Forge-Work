import assert from "assert";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { FoldingModel, updateFoldingStateAtIndex } from "../../browser/viewModel/foldingModel.js";
import { runDeleteAction } from "../../browser/controller/cellOperations.js";
import { NotebookCellSelectionCollection } from "../../browser/viewModel/cellSelectionCollection.js";
import { CellEditType, CellKind, SelectionStateType } from "../../common/notebookCommon.js";
import { createNotebookCellList, setupInstantiationService, TestCell, withTestNotebook } from "./testNotebookEditor.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
suite("NotebookSelection", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("focus is never empty", function() {
    const selectionCollection = new NotebookCellSelectionCollection();
    assert.deepStrictEqual(selectionCollection.focus, { start: 0, end: 0 });
    selectionCollection.setState(null, [], true, "model");
    assert.deepStrictEqual(selectionCollection.focus, { start: 0, end: 0 });
    selectionCollection.dispose();
  });
  test("selection is never empty", function() {
    const selectionCollection = new NotebookCellSelectionCollection();
    assert.deepStrictEqual(selectionCollection.selections, [{ start: 0, end: 0 }]);
    selectionCollection.setState(null, [], true, "model");
    assert.deepStrictEqual(selectionCollection.selections, [{ start: 0, end: 0 }]);
    selectionCollection.dispose();
  });
  test("selections does not change when setting to empty", function() {
    const selectionCollection = new NotebookCellSelectionCollection();
    let changed = false;
    store.add(selectionCollection.onDidChangeSelection(() => {
      changed = true;
    }));
    selectionCollection.setState(null, [], false, "model");
    assert.strictEqual(changed, false);
    selectionCollection.setState({ start: 0, end: 0 }, [], false, "model");
    assert.strictEqual(changed, false);
    selectionCollection.setState({ start: 0, end: 0 }, [{ start: 0, end: 0 }], false, "model");
    assert.strictEqual(changed, false);
    selectionCollection.setState(null, [], false, "model");
    assert.strictEqual(changed, false);
    selectionCollection.dispose();
  });
  test("event fires when selection or focus changes", function() {
    const selectionCollection = new NotebookCellSelectionCollection();
    let eventCount = 0;
    store.add(selectionCollection.onDidChangeSelection(() => {
      eventCount++;
    }));
    selectionCollection.setState({ start: 1, end: 1 }, [{ start: 1, end: 2 }], false, "model");
    assert.strictEqual(eventCount, 1);
    selectionCollection.setState({ start: 1, end: 1 }, [{ start: 1, end: 2 }, { start: 2, end: 3 }], false, "model");
    assert.strictEqual(eventCount, 2);
    selectionCollection.setState({ start: 1, end: 1 }, [{ start: 1, end: 2 }, { start: 2, end: 3 }], false, "model");
    assert.strictEqual(eventCount, 2);
    selectionCollection.setState({ start: 0, end: 0 }, [{ start: 4, end: 5 }], false, "model");
    assert.strictEqual(eventCount, 3);
    selectionCollection.setState({ start: 0, end: 0 }, [], false, "model");
    assert.strictEqual(eventCount, 4);
    selectionCollection.dispose();
  });
});
suite("NotebookCellList focus/selection", () => {
  let disposables;
  let instantiationService;
  let languageService;
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    disposables = new DisposableStore();
    instantiationService = setupInstantiationService(disposables);
    languageService = instantiationService.get(ILanguageService);
  });
  test("notebook cell list setFocus", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}]
      ],
      (editor, viewModel, ds) => {
        const cellList = createNotebookCellList(instantiationService, ds);
        cellList.attachViewModel(viewModel);
        assert.strictEqual(cellList.length, 2);
        cellList.setFocus([0]);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });
        cellList.setFocus([1]);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 1, end: 2 });
        cellList.detachViewModel();
      }
    );
  });
  test("notebook cell list setSelections", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}]
      ],
      (editor, viewModel, ds) => {
        const cellList = createNotebookCellList(instantiationService, ds);
        cellList.attachViewModel(viewModel);
        assert.strictEqual(cellList.length, 2);
        cellList.setSelection([0]);
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 0, end: 1 }]);
        cellList.setSelection([1]);
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 1, end: 2 }]);
      }
    );
  });
  test("notebook cell list setFocus2", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}]
      ],
      (editor, viewModel, ds) => {
        const cellList = createNotebookCellList(instantiationService, ds);
        cellList.attachViewModel(viewModel);
        assert.strictEqual(cellList.length, 2);
        cellList.setFocus([0]);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });
        cellList.setFocus([1]);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 1, end: 2 });
        cellList.setSelection([1]);
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 1, end: 2 }]);
        cellList.detachViewModel();
      }
    );
  });
  test("notebook cell list focus/selection from UI", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["# header c", "markdown", CellKind.Markup, [], {}]
      ],
      (editor, viewModel, ds) => {
        const cellList = createNotebookCellList(instantiationService, ds);
        cellList.attachViewModel(viewModel);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 0, end: 1 }]);
        cellList.setFocus([1], new KeyboardEvent("keydown"), void 0);
        cellList.setSelection([1], new KeyboardEvent("keydown"), void 0);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 1, end: 2 });
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 1, end: 2 }]);
        cellList.setFocus([2], new KeyboardEvent("keydown"), void 0);
        cellList.setSelection([1, 2]);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 2, end: 3 });
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 1, end: 3 }]);
        cellList.setFocus([3], new KeyboardEvent("keydown"), void 0);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 3, end: 4 });
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 1, end: 3 }]);
      }
    );
  });
  test("notebook cell list focus/selection with folding regions", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["# header c", "markdown", CellKind.Markup, [], {}]
      ],
      (editor, viewModel, ds) => {
        const foldingModel = ds.add(new FoldingModel());
        foldingModel.attachViewModel(viewModel);
        const cellList = createNotebookCellList(instantiationService, ds);
        cellList.attachViewModel(viewModel);
        assert.strictEqual(cellList.length, 5);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 0, end: 1 }]);
        cellList.setFocus([0]);
        updateFoldingStateAtIndex(foldingModel, 0, true);
        updateFoldingStateAtIndex(foldingModel, 2, true);
        viewModel.updateFoldingRanges(foldingModel.regions);
        cellList.setHiddenAreas(viewModel.getHiddenRanges(), true);
        assert.strictEqual(cellList.length, 3);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 0, end: 1 }]);
        cellList.focusNext(1, false);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 2, end: 3 });
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 0, end: 1 }]);
        updateFoldingStateAtIndex(foldingModel, 2, false);
        viewModel.updateFoldingRanges(foldingModel.regions);
        cellList.setHiddenAreas(viewModel.getHiddenRanges(), true);
        assert.strictEqual(cellList.length, 4);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 2, end: 3 });
      }
    );
  });
  test("notebook cell list focus/selection with folding regions and applyEdits", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3", "javascript", CellKind.Markup, [], {}],
        ["# header d", "markdown", CellKind.Markup, [], {}],
        ["var e = 4;", "javascript", CellKind.Code, [], {}]
      ],
      (editor, viewModel, ds) => {
        const foldingModel = ds.add(new FoldingModel());
        foldingModel.attachViewModel(viewModel);
        const cellList = createNotebookCellList(instantiationService, ds);
        cellList.attachViewModel(viewModel);
        cellList.setFocus([0]);
        cellList.setSelection([0]);
        updateFoldingStateAtIndex(foldingModel, 0, true);
        updateFoldingStateAtIndex(foldingModel, 2, true);
        viewModel.updateFoldingRanges(foldingModel.regions);
        cellList.setHiddenAreas(viewModel.getHiddenRanges(), true);
        assert.strictEqual(cellList.getModelIndex2(0), 0);
        assert.strictEqual(cellList.getModelIndex2(1), 2);
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 0,
          count: 2,
          cells: []
        }], true, void 0, () => void 0, void 0, false);
        viewModel.updateFoldingRanges(foldingModel.regions);
        cellList.setHiddenAreas(viewModel.getHiddenRanges(), true);
        assert.strictEqual(cellList.getModelIndex2(0), 0);
        assert.strictEqual(cellList.getModelIndex2(1), 3);
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 0,
          count: 0,
          cells: [
            ds.add(new TestCell(viewModel.viewType, 7, "# header f", "markdown", CellKind.Code, [], languageService)),
            ds.add(new TestCell(viewModel.viewType, 8, "var g = 5;", "javascript", CellKind.Code, [], languageService))
          ]
        }], true, void 0, () => void 0, void 0, false);
        viewModel.updateFoldingRanges(foldingModel.regions);
        cellList.setHiddenAreas(viewModel.getHiddenRanges(), true);
        assert.strictEqual(cellList.getModelIndex2(0), 0);
        assert.strictEqual(cellList.getModelIndex2(1), 1);
        assert.strictEqual(cellList.getModelIndex2(2), 2);
      }
    );
  });
  test("notebook cell list getModelIndex", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["# header c", "markdown", CellKind.Markup, [], {}]
      ],
      (editor, viewModel, ds) => {
        const foldingModel = ds.add(new FoldingModel());
        foldingModel.attachViewModel(viewModel);
        const cellList = createNotebookCellList(instantiationService, ds);
        cellList.attachViewModel(viewModel);
        updateFoldingStateAtIndex(foldingModel, 0, true);
        updateFoldingStateAtIndex(foldingModel, 2, true);
        viewModel.updateFoldingRanges(foldingModel.regions);
        cellList.setHiddenAreas(viewModel.getHiddenRanges(), true);
        assert.deepStrictEqual(cellList.getModelIndex2(-1), 0);
        assert.deepStrictEqual(cellList.getModelIndex2(0), 0);
        assert.deepStrictEqual(cellList.getModelIndex2(1), 2);
        assert.deepStrictEqual(cellList.getModelIndex2(2), 4);
      }
    );
  });
  test("notebook validate range", async () => {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}]
      ],
      (editor, viewModel) => {
        assert.deepStrictEqual(viewModel.validateRange(null), null);
        assert.deepStrictEqual(viewModel.validateRange(void 0), null);
        assert.deepStrictEqual(viewModel.validateRange({ start: 0, end: 0 }), { start: 0, end: 0 });
        assert.deepStrictEqual(viewModel.validateRange({ start: 0, end: 2 }), { start: 0, end: 2 });
        assert.deepStrictEqual(viewModel.validateRange({ start: 0, end: 3 }), { start: 0, end: 2 });
        assert.deepStrictEqual(viewModel.validateRange({ start: -1, end: 3 }), { start: 0, end: 2 });
        assert.deepStrictEqual(viewModel.validateRange({ start: -1, end: 1 }), { start: 0, end: 1 });
        assert.deepStrictEqual(viewModel.validateRange({ start: 2, end: 1 }), { start: 1, end: 2 });
        assert.deepStrictEqual(viewModel.validateRange({ start: 2, end: -1 }), { start: 0, end: 2 });
      }
    );
  });
  test("notebook updateSelectionState", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}]
      ],
      (editor, viewModel) => {
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 1, end: 2 }, { start: -1, end: 0 }] });
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 1, end: 2 }]);
      }
    );
  });
  test("notebook cell selection w/ cell deletion", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}]
      ],
      (editor, viewModel) => {
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 1, end: 2 }] });
        runDeleteAction(editor, viewModel.cellAt(1));
        assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 0, end: 1 }]);
        runDeleteAction(editor, viewModel.cellAt(0));
        assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 0 });
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 0, end: 0 }]);
      }
    );
  });
  test("notebook cell selection w/ cell deletion from applyEdits", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["var c = 2;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel) => {
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 1, end: 2 }, selections: [{ start: 1, end: 2 }] });
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 1,
          count: 1,
          cells: []
        }], true, void 0, () => void 0, void 0, true);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 1, end: 2 });
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 1, end: 2 }]);
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFx0ZXN0XFxicm93c2VyXFxub3RlYm9va1NlbGVjdGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IEZvbGRpbmdNb2RlbCwgdXBkYXRlRm9sZGluZ1N0YXRlQXRJbmRleCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdmlld01vZGVsL2ZvbGRpbmdNb2RlbC5qcyc7XG5pbXBvcnQgeyBydW5EZWxldGVBY3Rpb24gfSBmcm9tICcuLi8uLi9icm93c2VyL2NvbnRyb2xsZXIvY2VsbE9wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tDZWxsU2VsZWN0aW9uQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdmlld01vZGVsL2NlbGxTZWxlY3Rpb25Db2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IENlbGxFZGl0VHlwZSwgQ2VsbEtpbmQsIFNlbGVjdGlvblN0YXRlVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVOb3RlYm9va0NlbGxMaXN0LCBzZXR1cEluc3RhbnRpYXRpb25TZXJ2aWNlLCBUZXN0Q2VsbCwgd2l0aFRlc3ROb3RlYm9vayB9IGZyb20gJy4vdGVzdE5vdGVib29rRWRpdG9yLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuc3VpdGUoJ05vdGVib29rU2VsZWN0aW9uJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2ZvY3VzIGlzIG5ldmVyIGVtcHR5JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNlbGVjdGlvbkNvbGxlY3Rpb24gPSBuZXcgTm90ZWJvb2tDZWxsU2VsZWN0aW9uQ29sbGVjdGlvbigpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VsZWN0aW9uQ29sbGVjdGlvbi5mb2N1cywgeyBzdGFydDogMCwgZW5kOiAwIH0pO1xuXG5cdFx0c2VsZWN0aW9uQ29sbGVjdGlvbi5zZXRTdGF0ZShudWxsLCBbXSwgdHJ1ZSwgJ21vZGVsJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWxlY3Rpb25Db2xsZWN0aW9uLmZvY3VzLCB7IHN0YXJ0OiAwLCBlbmQ6IDAgfSk7XG5cdFx0c2VsZWN0aW9uQ29sbGVjdGlvbi5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbGVjdGlvbiBpcyBuZXZlciBlbXB0eScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZWxlY3Rpb25Db2xsZWN0aW9uID0gbmV3IE5vdGVib29rQ2VsbFNlbGVjdGlvbkNvbGxlY3Rpb24oKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlbGVjdGlvbkNvbGxlY3Rpb24uc2VsZWN0aW9ucywgW3sgc3RhcnQ6IDAsIGVuZDogMCB9XSk7XG5cblx0XHRzZWxlY3Rpb25Db2xsZWN0aW9uLnNldFN0YXRlKG51bGwsIFtdLCB0cnVlLCAnbW9kZWwnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlbGVjdGlvbkNvbGxlY3Rpb24uc2VsZWN0aW9ucywgW3sgc3RhcnQ6IDAsIGVuZDogMCB9XSk7XG5cdFx0c2VsZWN0aW9uQ29sbGVjdGlvbi5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbGVjdGlvbnMgZG9lcyBub3QgY2hhbmdlIHdoZW4gc2V0dGluZyB0byBlbXB0eScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZWxlY3Rpb25Db2xsZWN0aW9uID0gbmV3IE5vdGVib29rQ2VsbFNlbGVjdGlvbkNvbGxlY3Rpb24oKTtcblx0XHRsZXQgY2hhbmdlZCA9IGZhbHNlO1xuXHRcdHN0b3JlLmFkZChzZWxlY3Rpb25Db2xsZWN0aW9uLm9uRGlkQ2hhbmdlU2VsZWN0aW9uKCgpID0+IHtcblx0XHRcdGNoYW5nZWQgPSB0cnVlO1xuXHRcdH0pKTtcblxuXHRcdHNlbGVjdGlvbkNvbGxlY3Rpb24uc2V0U3RhdGUobnVsbCwgW10sIGZhbHNlLCAnbW9kZWwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlZCwgZmFsc2UpO1xuXHRcdHNlbGVjdGlvbkNvbGxlY3Rpb24uc2V0U3RhdGUoeyBzdGFydDogMCwgZW5kOiAwIH0sIFtdLCBmYWxzZSwgJ21vZGVsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZWQsIGZhbHNlKTtcblx0XHRzZWxlY3Rpb25Db2xsZWN0aW9uLnNldFN0YXRlKHsgc3RhcnQ6IDAsIGVuZDogMCB9LCBbeyBzdGFydDogMCwgZW5kOiAwIH1dLCBmYWxzZSwgJ21vZGVsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZWQsIGZhbHNlKTtcblx0XHRzZWxlY3Rpb25Db2xsZWN0aW9uLnNldFN0YXRlKG51bGwsIFtdLCBmYWxzZSwgJ21vZGVsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZWQsIGZhbHNlKTtcblx0XHRzZWxlY3Rpb25Db2xsZWN0aW9uLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZXZlbnQgZmlyZXMgd2hlbiBzZWxlY3Rpb24gb3IgZm9jdXMgY2hhbmdlcycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzZWxlY3Rpb25Db2xsZWN0aW9uID0gbmV3IE5vdGVib29rQ2VsbFNlbGVjdGlvbkNvbGxlY3Rpb24oKTtcblx0XHRsZXQgZXZlbnRDb3VudCA9IDA7XG5cdFx0c3RvcmUuYWRkKHNlbGVjdGlvbkNvbGxlY3Rpb24ub25EaWRDaGFuZ2VTZWxlY3Rpb24oKCkgPT4ge1xuXHRcdFx0ZXZlbnRDb3VudCsrO1xuXHRcdH0pKTtcblxuXHRcdC8vIENoYW5nZSBmb2N1c1xuXHRcdHNlbGVjdGlvbkNvbGxlY3Rpb24uc2V0U3RhdGUoeyBzdGFydDogMSwgZW5kOiAxIH0sIFt7IHN0YXJ0OiAxLCBlbmQ6IDIgfV0sIGZhbHNlLCAnbW9kZWwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRDb3VudCwgMSk7XG5cblx0XHQvLyBDaGFuZ2Ugc2VsZWN0aW9uc1xuXHRcdHNlbGVjdGlvbkNvbGxlY3Rpb24uc2V0U3RhdGUoeyBzdGFydDogMSwgZW5kOiAxIH0sIFt7IHN0YXJ0OiAxLCBlbmQ6IDIgfSwgeyBzdGFydDogMiwgZW5kOiAzIH1dLCBmYWxzZSwgJ21vZGVsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Q291bnQsIDIpO1xuXG5cdFx0Ly8gbm8gY2hhbmdlXG5cdFx0c2VsZWN0aW9uQ29sbGVjdGlvbi5zZXRTdGF0ZSh7IHN0YXJ0OiAxLCBlbmQ6IDEgfSwgW3sgc3RhcnQ6IDEsIGVuZDogMiB9LCB7IHN0YXJ0OiAyLCBlbmQ6IDMgfV0sIGZhbHNlLCAnbW9kZWwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRDb3VudCwgMik7XG5cblx0XHQvLyBjaGFuZ2UgdG8gZW1wdHkgZm9jdXNcblx0XHRzZWxlY3Rpb25Db2xsZWN0aW9uLnNldFN0YXRlKHsgc3RhcnQ6IDAsIGVuZDogMCB9LCBbeyBzdGFydDogNCwgZW5kOiA1IH1dLCBmYWxzZSwgJ21vZGVsJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Q291bnQsIDMpO1xuXG5cdFx0Ly8gY2hhbmdlIHRvIGVtcHR5IHNlbGVjdGlvbnNcblx0XHRzZWxlY3Rpb25Db2xsZWN0aW9uLnNldFN0YXRlKHsgc3RhcnQ6IDAsIGVuZDogMCB9LCBbXSwgZmFsc2UsICdtb2RlbCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50LCA0KTtcblxuXHRcdHNlbGVjdGlvbkNvbGxlY3Rpb24uZGlzcG9zZSgpO1xuXHR9KTtcblxufSk7XG5cbnN1aXRlKCdOb3RlYm9va0NlbGxMaXN0IGZvY3VzL3NlbGVjdGlvbicsICgpID0+IHtcblx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHNldHVwSW5zdGFudGlhdGlvblNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRcdGxhbmd1YWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdub3RlYm9vayBjZWxsIGxpc3Qgc2V0Rm9jdXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHQoZWRpdG9yLCB2aWV3TW9kZWwsIGRzKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNlbGxMaXN0ID0gY3JlYXRlTm90ZWJvb2tDZWxsTGlzdChpbnN0YW50aWF0aW9uU2VydmljZSwgZHMpO1xuXHRcdFx0XHRjZWxsTGlzdC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QubGVuZ3RoLCAyKTtcblx0XHRcdFx0Y2VsbExpc3Quc2V0Rm9jdXMoWzBdKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0Rm9jdXMoKSwgeyBzdGFydDogMCwgZW5kOiAxIH0pO1xuXG5cdFx0XHRcdGNlbGxMaXN0LnNldEZvY3VzKFsxXSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldEZvY3VzKCksIHsgc3RhcnQ6IDEsIGVuZDogMiB9KTtcblx0XHRcdFx0Y2VsbExpc3QuZGV0YWNoVmlld01vZGVsKCk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbm90ZWJvb2sgY2VsbCBsaXN0IHNldFNlbGVjdGlvbnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHQoZWRpdG9yLCB2aWV3TW9kZWwsIGRzKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNlbGxMaXN0ID0gY3JlYXRlTm90ZWJvb2tDZWxsTGlzdChpbnN0YW50aWF0aW9uU2VydmljZSwgZHMpO1xuXHRcdFx0XHRjZWxsTGlzdC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QubGVuZ3RoLCAyKTtcblx0XHRcdFx0Y2VsbExpc3Quc2V0U2VsZWN0aW9uKFswXSk7XG5cdFx0XHRcdC8vIHRoZSBvbmx5IHNlbGVjdGlvbiBpcyBhbHNvIHRoZSBmb2N1c1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb25zKCksIFt7IHN0YXJ0OiAwLCBlbmQ6IDEgfV0pO1xuXG5cdFx0XHRcdC8vIHNldCBzZWxlY3Rpb24gZG9lcyBub3QgbW9kaWZ5IGZvY3VzXG5cdFx0XHRcdGNlbGxMaXN0LnNldFNlbGVjdGlvbihbMV0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb25zKCksIFt7IHN0YXJ0OiAxLCBlbmQ6IDIgfV0pO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vdGVib29rIGNlbGwgbGlzdCBzZXRGb2N1czInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHQoZWRpdG9yLCB2aWV3TW9kZWwsIGRzKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNlbGxMaXN0ID0gY3JlYXRlTm90ZWJvb2tDZWxsTGlzdChpbnN0YW50aWF0aW9uU2VydmljZSwgZHMpO1xuXHRcdFx0XHRjZWxsTGlzdC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QubGVuZ3RoLCAyKTtcblx0XHRcdFx0Y2VsbExpc3Quc2V0Rm9jdXMoWzBdKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0Rm9jdXMoKSwgeyBzdGFydDogMCwgZW5kOiAxIH0pO1xuXG5cdFx0XHRcdGNlbGxMaXN0LnNldEZvY3VzKFsxXSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldEZvY3VzKCksIHsgc3RhcnQ6IDEsIGVuZDogMiB9KTtcblxuXHRcdFx0XHRjZWxsTGlzdC5zZXRTZWxlY3Rpb24oWzFdKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0U2VsZWN0aW9ucygpLCBbeyBzdGFydDogMSwgZW5kOiAyIH1dKTtcblx0XHRcdFx0Y2VsbExpc3QuZGV0YWNoVmlld01vZGVsKCk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblxuXHR0ZXN0KCdub3RlYm9vayBjZWxsIGxpc3QgZm9jdXMvc2VsZWN0aW9uIGZyb20gVUknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciBhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgYicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGMnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHQoZWRpdG9yLCB2aWV3TW9kZWwsIGRzKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNlbGxMaXN0ID0gY3JlYXRlTm90ZWJvb2tDZWxsTGlzdChpbnN0YW50aWF0aW9uU2VydmljZSwgZHMpO1xuXHRcdFx0XHRjZWxsTGlzdC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0Rm9jdXMoKSwgeyBzdGFydDogMCwgZW5kOiAxIH0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb25zKCksIFt7IHN0YXJ0OiAwLCBlbmQ6IDEgfV0pO1xuXG5cdFx0XHRcdC8vIGFycm93IGRvd24sIG1vdmUgYm90aCBmb2N1cyBhbmQgc2VsZWN0aW9uc1xuXHRcdFx0XHRjZWxsTGlzdC5zZXRGb2N1cyhbMV0sIG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJyksIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGNlbGxMaXN0LnNldFNlbGVjdGlvbihbMV0sIG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJyksIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldEZvY3VzKCksIHsgc3RhcnQ6IDEsIGVuZDogMiB9KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0U2VsZWN0aW9ucygpLCBbeyBzdGFydDogMSwgZW5kOiAyIH1dKTtcblxuXHRcdFx0XHQvLyBzaGlmdCthcnJvdyBkb3duLCBleHBhbmRzIHNlbGVjdGlvblxuXHRcdFx0XHRjZWxsTGlzdC5zZXRGb2N1cyhbMl0sIG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJyksIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGNlbGxMaXN0LnNldFNlbGVjdGlvbihbMSwgMl0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRGb2N1cygpLCB7IHN0YXJ0OiAyLCBlbmQ6IDMgfSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldFNlbGVjdGlvbnMoKSwgW3sgc3RhcnQ6IDEsIGVuZDogMyB9XSk7XG5cblx0XHRcdFx0Ly8gYXJyb3cgZG93biwgd2lsbCBtb3ZlIGZvY3VzIGJ1dCBub3QgZXhwYW5kIHNlbGVjdGlvblxuXHRcdFx0XHRjZWxsTGlzdC5zZXRGb2N1cyhbM10sIG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJyksIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldEZvY3VzKCksIHsgc3RhcnQ6IDMsIGVuZDogNCB9KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0U2VsZWN0aW9ucygpLCBbeyBzdGFydDogMSwgZW5kOiAzIH1dKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXG5cdHRlc3QoJ25vdGVib29rIGNlbGwgbGlzdCBmb2N1cy9zZWxlY3Rpb24gd2l0aCBmb2xkaW5nIHJlZ2lvbnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciBhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgYicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGMnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHQoZWRpdG9yLCB2aWV3TW9kZWwsIGRzKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZvbGRpbmdNb2RlbCA9IGRzLmFkZChuZXcgRm9sZGluZ01vZGVsKCkpO1xuXHRcdFx0XHRmb2xkaW5nTW9kZWwuYXR0YWNoVmlld01vZGVsKHZpZXdNb2RlbCk7XG5cblx0XHRcdFx0Y29uc3QgY2VsbExpc3QgPSBjcmVhdGVOb3RlYm9va0NlbGxMaXN0KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkcyk7XG5cdFx0XHRcdGNlbGxMaXN0LmF0dGFjaFZpZXdNb2RlbCh2aWV3TW9kZWwpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QubGVuZ3RoLCA1KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0Rm9jdXMoKSwgeyBzdGFydDogMCwgZW5kOiAxIH0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb25zKCksIFt7IHN0YXJ0OiAwLCBlbmQ6IDEgfV0pO1xuXHRcdFx0XHRjZWxsTGlzdC5zZXRGb2N1cyhbMF0pO1xuXG5cdFx0XHRcdHVwZGF0ZUZvbGRpbmdTdGF0ZUF0SW5kZXgoZm9sZGluZ01vZGVsLCAwLCB0cnVlKTtcblx0XHRcdFx0dXBkYXRlRm9sZGluZ1N0YXRlQXRJbmRleChmb2xkaW5nTW9kZWwsIDIsIHRydWUpO1xuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlRm9sZGluZ1Jhbmdlcyhmb2xkaW5nTW9kZWwucmVnaW9ucyk7XG5cdFx0XHRcdGNlbGxMaXN0LnNldEhpZGRlbkFyZWFzKHZpZXdNb2RlbC5nZXRIaWRkZW5SYW5nZXMoKSwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5sZW5ndGgsIDMpO1xuXG5cdFx0XHRcdC8vIGN1cnJlbnRseSwgZm9jdXMgb24gYSBmb2xkZWQgY2VsbCB3aWxsIG9ubHkgZm9jdXMgdGhlIGNlbGwgaXRzZWxmLCBleGNsdWRpbmcgaXRzIFwiaW5uZXJcIiBjZWxsc1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRGb2N1cygpLCB7IHN0YXJ0OiAwLCBlbmQ6IDEgfSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldFNlbGVjdGlvbnMoKSwgW3sgc3RhcnQ6IDAsIGVuZDogMSB9XSk7XG5cblx0XHRcdFx0Y2VsbExpc3QuZm9jdXNOZXh0KDEsIGZhbHNlKTtcblx0XHRcdFx0Ly8gZm9jdXMgbmV4dCBzaG91bGQgc2tpcCB0aGUgZm9sZGVkIGl0ZW1zXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldEZvY3VzKCksIHsgc3RhcnQ6IDIsIGVuZDogMyB9KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0U2VsZWN0aW9ucygpLCBbeyBzdGFydDogMCwgZW5kOiAxIH1dKTtcblxuXHRcdFx0XHQvLyB1bmZvbGRcblx0XHRcdFx0dXBkYXRlRm9sZGluZ1N0YXRlQXRJbmRleChmb2xkaW5nTW9kZWwsIDIsIGZhbHNlKTtcblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZUZvbGRpbmdSYW5nZXMoZm9sZGluZ01vZGVsLnJlZ2lvbnMpO1xuXHRcdFx0XHRjZWxsTGlzdC5zZXRIaWRkZW5BcmVhcyh2aWV3TW9kZWwuZ2V0SGlkZGVuUmFuZ2VzKCksIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QubGVuZ3RoLCA0KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0Rm9jdXMoKSwgeyBzdGFydDogMiwgZW5kOiAzIH0pO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vdGVib29rIGNlbGwgbGlzdCBmb2N1cy9zZWxlY3Rpb24gd2l0aCBmb2xkaW5nIHJlZ2lvbnMgYW5kIGFwcGx5RWRpdHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciBhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgYicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBjID0gMycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGQnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGUgPSA0OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHQoZWRpdG9yLCB2aWV3TW9kZWwsIGRzKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZvbGRpbmdNb2RlbCA9IGRzLmFkZChuZXcgRm9sZGluZ01vZGVsKCkpO1xuXHRcdFx0XHRmb2xkaW5nTW9kZWwuYXR0YWNoVmlld01vZGVsKHZpZXdNb2RlbCk7XG5cblx0XHRcdFx0Y29uc3QgY2VsbExpc3QgPSBjcmVhdGVOb3RlYm9va0NlbGxMaXN0KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkcyk7XG5cdFx0XHRcdGNlbGxMaXN0LmF0dGFjaFZpZXdNb2RlbCh2aWV3TW9kZWwpO1xuXHRcdFx0XHRjZWxsTGlzdC5zZXRGb2N1cyhbMF0pO1xuXHRcdFx0XHRjZWxsTGlzdC5zZXRTZWxlY3Rpb24oWzBdKTtcblxuXHRcdFx0XHR1cGRhdGVGb2xkaW5nU3RhdGVBdEluZGV4KGZvbGRpbmdNb2RlbCwgMCwgdHJ1ZSk7XG5cdFx0XHRcdHVwZGF0ZUZvbGRpbmdTdGF0ZUF0SW5kZXgoZm9sZGluZ01vZGVsLCAyLCB0cnVlKTtcblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZUZvbGRpbmdSYW5nZXMoZm9sZGluZ01vZGVsLnJlZ2lvbnMpO1xuXHRcdFx0XHRjZWxsTGlzdC5zZXRIaWRkZW5BcmVhcyh2aWV3TW9kZWwuZ2V0SGlkZGVuUmFuZ2VzKCksIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0TW9kZWxJbmRleDIoMCksIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0TW9kZWxJbmRleDIoMSksIDIpO1xuXG5cdFx0XHRcdGVkaXRvci50ZXh0TW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDAsIGNvdW50OiAyLCBjZWxsczogW11cblx0XHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIGZhbHNlKTtcblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZUZvbGRpbmdSYW5nZXMoZm9sZGluZ01vZGVsLnJlZ2lvbnMpO1xuXHRcdFx0XHRjZWxsTGlzdC5zZXRIaWRkZW5BcmVhcyh2aWV3TW9kZWwuZ2V0SGlkZGVuUmFuZ2VzKCksIHRydWUpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRNb2RlbEluZGV4MigwKSwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRNb2RlbEluZGV4MigxKSwgMyk7XG5cblx0XHRcdFx0Ly8gbWltaWMgdW5kb1xuXHRcdFx0XHRlZGl0b3IudGV4dE1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAwLCBjb3VudDogMCwgY2VsbHM6IFtcblx0XHRcdFx0XHRcdGRzLmFkZChuZXcgVGVzdENlbGwodmlld01vZGVsLnZpZXdUeXBlLCA3LCAnIyBoZWFkZXIgZicsICdtYXJrZG93bicsIENlbGxLaW5kLkNvZGUsIFtdLCBsYW5ndWFnZVNlcnZpY2UpKSxcblx0XHRcdFx0XHRcdGRzLmFkZChuZXcgVGVzdENlbGwodmlld01vZGVsLnZpZXdUeXBlLCA4LCAndmFyIGcgPSA1OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIGxhbmd1YWdlU2VydmljZSkpXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZmFsc2UpO1xuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlRm9sZGluZ1Jhbmdlcyhmb2xkaW5nTW9kZWwucmVnaW9ucyk7XG5cdFx0XHRcdGNlbGxMaXN0LnNldEhpZGRlbkFyZWFzKHZpZXdNb2RlbC5nZXRIaWRkZW5SYW5nZXMoKSwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRNb2RlbEluZGV4MigwKSwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRNb2RlbEluZGV4MigxKSwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRNb2RlbEluZGV4MigyKSwgMik7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbm90ZWJvb2sgY2VsbCBsaXN0IGdldE1vZGVsSW5kZXgnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciBhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgYicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGMnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHQoZWRpdG9yLCB2aWV3TW9kZWwsIGRzKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZvbGRpbmdNb2RlbCA9IGRzLmFkZChuZXcgRm9sZGluZ01vZGVsKCkpO1xuXHRcdFx0XHRmb2xkaW5nTW9kZWwuYXR0YWNoVmlld01vZGVsKHZpZXdNb2RlbCk7XG5cblx0XHRcdFx0Y29uc3QgY2VsbExpc3QgPSBjcmVhdGVOb3RlYm9va0NlbGxMaXN0KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkcyk7XG5cdFx0XHRcdGNlbGxMaXN0LmF0dGFjaFZpZXdNb2RlbCh2aWV3TW9kZWwpO1xuXG5cdFx0XHRcdHVwZGF0ZUZvbGRpbmdTdGF0ZUF0SW5kZXgoZm9sZGluZ01vZGVsLCAwLCB0cnVlKTtcblx0XHRcdFx0dXBkYXRlRm9sZGluZ1N0YXRlQXRJbmRleChmb2xkaW5nTW9kZWwsIDIsIHRydWUpO1xuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlRm9sZGluZ1Jhbmdlcyhmb2xkaW5nTW9kZWwucmVnaW9ucyk7XG5cdFx0XHRcdGNlbGxMaXN0LnNldEhpZGRlbkFyZWFzKHZpZXdNb2RlbC5nZXRIaWRkZW5SYW5nZXMoKSwgdHJ1ZSk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRNb2RlbEluZGV4MigtMSksIDApO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LmdldE1vZGVsSW5kZXgyKDApLCAwKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRNb2RlbEluZGV4MigxKSwgMik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0TW9kZWxJbmRleDIoMiksIDQpO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cblx0dGVzdCgnbm90ZWJvb2sgdmFsaWRhdGUgcmFuZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciBhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHQoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwudmFsaWRhdGVSYW5nZShudWxsKSwgbnVsbCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLnZhbGlkYXRlUmFuZ2UodW5kZWZpbmVkKSwgbnVsbCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLnZhbGlkYXRlUmFuZ2UoeyBzdGFydDogMCwgZW5kOiAwIH0pLCB7IHN0YXJ0OiAwLCBlbmQ6IDAgfSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLnZhbGlkYXRlUmFuZ2UoeyBzdGFydDogMCwgZW5kOiAyIH0pLCB7IHN0YXJ0OiAwLCBlbmQ6IDIgfSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLnZhbGlkYXRlUmFuZ2UoeyBzdGFydDogMCwgZW5kOiAzIH0pLCB7IHN0YXJ0OiAwLCBlbmQ6IDIgfSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLnZhbGlkYXRlUmFuZ2UoeyBzdGFydDogLTEsIGVuZDogMyB9KSwgeyBzdGFydDogMCwgZW5kOiAyIH0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC52YWxpZGF0ZVJhbmdlKHsgc3RhcnQ6IC0xLCBlbmQ6IDEgfSksIHsgc3RhcnQ6IDAsIGVuZDogMSB9KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwudmFsaWRhdGVSYW5nZSh7IHN0YXJ0OiAyLCBlbmQ6IDEgfSksIHsgc3RhcnQ6IDEsIGVuZDogMiB9KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwudmFsaWRhdGVSYW5nZSh7IHN0YXJ0OiAyLCBlbmQ6IC0xIH0pLCB7IHN0YXJ0OiAwLCBlbmQ6IDIgfSk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbm90ZWJvb2sgdXBkYXRlU2VsZWN0aW9uU3RhdGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciBhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHQoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZVNlbGVjdGlvbnNTdGF0ZSh7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IHsgc3RhcnQ6IDEsIGVuZDogMiB9LCBzZWxlY3Rpb25zOiBbeyBzdGFydDogMSwgZW5kOiAyIH0sIHsgc3RhcnQ6IC0xLCBlbmQ6IDAgfV0gfSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldFNlbGVjdGlvbnMoKSwgW3sgc3RhcnQ6IDEsIGVuZDogMiB9XSk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbm90ZWJvb2sgY2VsbCBzZWxlY3Rpb24gdy8gY2VsbCBkZWxldGlvbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIGEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdFx0XSxcblx0XHRcdChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlU2VsZWN0aW9uc1N0YXRlKHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogeyBzdGFydDogMSwgZW5kOiAyIH0sIHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiAxLCBlbmQ6IDIgfV0gfSk7XG5cdFx0XHRcdHJ1bkRlbGV0ZUFjdGlvbihlZGl0b3IsIHZpZXdNb2RlbC5jZWxsQXQoMSkhKTtcblx0XHRcdFx0Ly8gdmlld01vZGVsLmRlbGV0ZUNlbGwoMSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRGb2N1cygpLCB7IHN0YXJ0OiAwLCBlbmQ6IDEgfSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldFNlbGVjdGlvbnMoKSwgW3sgc3RhcnQ6IDAsIGVuZDogMSB9XSk7XG5cdFx0XHRcdHJ1bkRlbGV0ZUFjdGlvbihlZGl0b3IsIHZpZXdNb2RlbC5jZWxsQXQoMCkhKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0Rm9jdXMoKSwgeyBzdGFydDogMCwgZW5kOiAwIH0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb25zKCksIFt7IHN0YXJ0OiAwLCBlbmQ6IDAgfV0pO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25vdGVib29rIGNlbGwgc2VsZWN0aW9uIHcvIGNlbGwgZGVsZXRpb24gZnJvbSBhcHBseUVkaXRzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgYScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBjID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZVNlbGVjdGlvbnNTdGF0ZSh7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IHsgc3RhcnQ6IDEsIGVuZDogMiB9LCBzZWxlY3Rpb25zOiBbeyBzdGFydDogMSwgZW5kOiAyIH1dIH0pO1xuXHRcdFx0XHRlZGl0b3IudGV4dE1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsXG5cdFx0XHRcdFx0aW5kZXg6IDEsXG5cdFx0XHRcdFx0Y291bnQ6IDEsXG5cdFx0XHRcdFx0Y2VsbHM6IFtdXG5cdFx0XHRcdH1dLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0Rm9jdXMoKSwgeyBzdGFydDogMSwgZW5kOiAyIH0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb25zKCksIFt7IHN0YXJ0OiAxLCBlbmQ6IDIgfV0pO1xuXHRcdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxjQUFjLGlDQUFpQztBQUN4RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLGNBQWMsVUFBVSwwQkFBMEI7QUFDM0QsU0FBUyx3QkFBd0IsMkJBQTJCLFVBQVUsd0JBQXdCO0FBQzlGLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsdUJBQXVCO0FBRWhDLE1BQU0scUJBQXFCLE1BQU07QUFDaEMsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxPQUFLLHdCQUF3QixXQUFZO0FBQ3hDLFVBQU0sc0JBQXNCLElBQUksZ0NBQWdDO0FBQ2hFLFdBQU8sZ0JBQWdCLG9CQUFvQixPQUFPLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxDQUFDO0FBRXRFLHdCQUFvQixTQUFTLE1BQU0sQ0FBQyxHQUFHLE1BQU0sT0FBTztBQUNwRCxXQUFPLGdCQUFnQixvQkFBb0IsT0FBTyxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsQ0FBQztBQUN0RSx3QkFBb0IsUUFBUTtBQUFBLEVBQzdCLENBQUM7QUFFRCxPQUFLLDRCQUE0QixXQUFZO0FBQzVDLFVBQU0sc0JBQXNCLElBQUksZ0NBQWdDO0FBQ2hFLFdBQU8sZ0JBQWdCLG9CQUFvQixZQUFZLENBQUMsRUFBRSxPQUFPLEdBQUcsS0FBSyxFQUFFLENBQUMsQ0FBQztBQUU3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
