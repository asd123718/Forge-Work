import assert from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { CellKind, NotebookSetting } from "../../common/notebookCommon.js";
import { createNotebookCellList, setupInstantiationService, withTestNotebook } from "./testNotebookEditor.js";
suite("NotebookCellList", () => {
  let testDisposables;
  let instantiationService;
  teardown(() => {
    testDisposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  let config;
  setup(() => {
    testDisposables = new DisposableStore();
    instantiationService = setupInstantiationService(testDisposables);
    config = new TestConfigurationService();
    instantiationService.stub(IConfigurationService, config);
  });
  test("revealElementsInView: reveal fully visible cell should not scroll", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["# header c", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, disposables) => {
        viewModel.restoreEditorViewState({
          editingCells: [false, false, false, false, false],
          cellLineNumberStates: {},
          editorViewStates: [null, null, null, null, null],
          cellTotalHeights: [50, 100, 50, 100, 50],
          collapsedInputCells: {},
          collapsedOutputCells: {}
        });
        const cellList = createNotebookCellList(instantiationService, disposables);
        cellList.attachViewModel(viewModel);
        cellList.layout(210, 100);
        cellList.scrollTop = 5;
        assert.deepStrictEqual(cellList.scrollTop, 5);
        assert.deepStrictEqual(cellList.getViewScrollBottom(), 215);
        cellList.revealCells({ start: 1, end: 2 });
        assert.deepStrictEqual(cellList.scrollTop, 5);
        assert.deepStrictEqual(cellList.getViewScrollBottom(), 215);
        cellList.revealCells({ start: 2, end: 3 });
        assert.deepStrictEqual(cellList.scrollTop, 5);
        assert.deepStrictEqual(cellList.getViewScrollBottom(), 215);
        cellList.revealCells({ start: 3, end: 4 });
        assert.deepStrictEqual(cellList.scrollTop, 90);
      }
    );
  });
  test("revealElementsInView: reveal partially visible cell", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["# header c", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, disposables) => {
        viewModel.restoreEditorViewState({
          editingCells: [false, false, false, false, false],
          editorViewStates: [null, null, null, null, null],
          cellTotalHeights: [50, 100, 50, 100, 50],
          cellLineNumberStates: {},
          collapsedInputCells: {},
          collapsedOutputCells: {}
        });
        const cellList = createNotebookCellList(instantiationService, disposables);
        cellList.attachViewModel(viewModel);
        cellList.layout(210, 100);
        assert.deepStrictEqual(cellList.scrollTop, 0);
        assert.deepStrictEqual(cellList.getViewScrollBottom(), 210);
        cellList.revealCells({ start: 3, end: 4 });
        assert.deepStrictEqual(cellList.scrollTop, 90);
        cellList.scrollTop = 5;
        assert.deepStrictEqual(cellList.scrollTop, 5);
        assert.deepStrictEqual(cellList.getViewScrollBottom(), 215);
        cellList.revealCells({ start: 0, end: 1 });
        assert.deepStrictEqual(cellList.scrollTop, 0);
      }
    );
  });
  test("revealElementsInView: reveal cell out of viewport", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["# header c", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, disposables) => {
        viewModel.restoreEditorViewState({
          editingCells: [false, false, false, false, false],
          editorViewStates: [null, null, null, null, null],
          cellTotalHeights: [50, 100, 50, 100, 50],
          cellLineNumberStates: {},
          collapsedInputCells: {},
          collapsedOutputCells: {}
        });
        const cellList = createNotebookCellList(instantiationService, disposables);
        cellList.updateOptions({ paddingBottom: 100 });
        cellList.attachViewModel(viewModel);
        cellList.layout(210, 100);
        assert.deepStrictEqual(cellList.scrollTop, 0);
        assert.deepStrictEqual(cellList.getViewScrollBottom(), 210);
        cellList.revealCells({ start: 4, end: 5 });
        assert.deepStrictEqual(cellList.scrollTop, 140);
      }
    );
  });
  test("updateElementHeight", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["# header c", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, disposables) => {
        viewModel.restoreEditorViewState({
          editingCells: [false, false, false, false, false],
          editorViewStates: [null, null, null, null, null],
          cellTotalHeights: [50, 100, 50, 100, 50],
          cellLineNumberStates: {},
          collapsedInputCells: {},
          collapsedOutputCells: {}
        });
        const cellList = createNotebookCellList(instantiationService, disposables);
        cellList.attachViewModel(viewModel);
        cellList.layout(210, 100);
        assert.deepStrictEqual(cellList.scrollTop, 0);
        assert.deepStrictEqual(cellList.getViewScrollBottom(), 210);
        cellList.updateElementHeight(0, 60);
        assert.deepStrictEqual(cellList.scrollTop, 0);
        cellList.scrollTop = 5;
        assert.deepStrictEqual(cellList.scrollTop, 5);
        assert.deepStrictEqual(cellList.getViewScrollBottom(), 215);
        cellList.updateElementHeight(0, 80);
        assert.deepStrictEqual(cellList.scrollTop, 5);
      }
    );
  });
  test("updateElementHeight with anchor", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["# header c", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, disposables) => {
        viewModel.restoreEditorViewState({
          editingCells: [false, false, false, false, false],
          editorViewStates: [null, null, null, null, null],
          cellTotalHeights: [50, 100, 50, 100, 50],
          cellLineNumberStates: {},
          collapsedInputCells: {},
          collapsedOutputCells: {}
        });
        const cellList = createNotebookCellList(instantiationService, disposables);
        cellList.attachViewModel(viewModel);
        cellList.layout(210, 100);
        assert.deepStrictEqual(cellList.scrollTop, 0);
        assert.deepStrictEqual(cellList.getViewScrollBottom(), 210);
        cellList.updateElementHeight2(viewModel.cellAt(0), 50);
        cellList.scrollTop = 5;
        assert.deepStrictEqual(cellList.scrollTop, 5);
        assert.deepStrictEqual(cellList.getViewScrollBottom(), 215);
        cellList.setFocus([1]);
        cellList.updateElementHeight2(viewModel.cellAt(0), 100);
        assert.deepStrictEqual(cellList.scrollHeight, 400);
        assert.deepStrictEqual(cellList.scrollTop, 5);
        assert.deepStrictEqual(cellList.getViewScrollBottom(), 215);
        cellList.updateElementHeight2(viewModel.cellAt(0), 150);
        assert.deepStrictEqual(cellList.scrollTop, 55);
        assert.deepStrictEqual(cellList.getViewScrollBottom(), 265);
        cellList.updateElementHeight2(viewModel.cellAt(0), 50);
        assert.deepStrictEqual(cellList.scrollTop, 55);
        assert.deepStrictEqual(cellList.getViewScrollBottom(), 265);
        cellList.updateElementHeight2(viewModel.cellAt(0), 250);
        assert.deepStrictEqual(cellList.scrollTop, 250 + 100 - cellList.renderHeight);
        assert.deepStrictEqual(cellList.getViewScrollBottom(), 250 + 100 - cellList.renderHeight + 210);
      }
    );
  });
  test("updateElementHeight with no scrolling", async function() {
    config.setUserConfiguration(NotebookSetting.scrollToRevealCell, "none");
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["# header c", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, disposables) => {
        viewModel.restoreEditorViewState({
          editingCells: [false, false, false, false, false],
          editorViewStates: [null, null, null, null, null],
          cellTotalHeights: [50, 100, 50, 100, 50],
          cellLineNumberStates: {},
          collapsedInputCells: {},
          collapsedOutputCells: {}
        });
        const cellList = createNotebookCellList(instantiationService, disposables);
        cellList.attachViewModel(viewModel);
        cellList.layout(210, 100);
        assert.deepStrictEqual(cellList.scrollTop, 0);
        assert.deepStrictEqual(cellList.getViewScrollBottom(), 210);
        cellList.updateElementHeight2(viewModel.cellAt(0), 50);
        cellList.scrollTop = 5;
        assert.deepStrictEqual(cellList.scrollTop, 5);
        assert.deepStrictEqual(cellList.getViewScrollBottom(), 215);
        cellList.setFocus([1]);
        cellList.updateElementHeight2(viewModel.cellAt(0), 100);
        assert.deepStrictEqual(cellList.scrollHeight, 400);
        assert.deepStrictEqual(cellList.scrollTop, 5);
        cellList.updateElementHeight2(viewModel.cellAt(0), 50);
        assert.deepStrictEqual(cellList.scrollTop, 5);
        cellList.updateElementHeight2(viewModel.cellAt(0), 250);
        assert.deepStrictEqual(cellList.scrollTop, 5);
      }
    );
  });
  test("updateElementHeight with no scroll setting and cell editor focused", async function() {
    config.setUserConfiguration(NotebookSetting.scrollToRevealCell, "none");
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["# header c", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, disposables) => {
        viewModel.restoreEditorViewState({
          editingCells: [false, false, false, false, false],
          editorViewStates: [null, null, null, null, null],
          cellTotalHeights: [50, 100, 50, 100, 50],
          cellLineNumberStates: {},
          collapsedInputCells: {},
          collapsedOutputCells: {}
        });
        const cellList = createNotebookCellList(instantiationService, disposables);
        cellList.attachViewModel(viewModel);
        cellList.layout(210, 100);
        assert.deepStrictEqual(cellList.scrollTop, 0);
        assert.deepStrictEqual(cellList.getViewScrollBottom(), 210);
        cellList.setFocus([1]);
        editor.focusNotebookCell(cellList.viewModel?.cellAt(1), "editor");
        cellList.updateElementHeight2(viewModel.cellAt(0), 100);
        assert.deepStrictEqual(cellList.scrollHeight, 400);
        assert.deepStrictEqual(cellList.scrollTop, 50);
        cellList.updateElementHeight2(viewModel.cellAt(0), 50);
        assert.deepStrictEqual(cellList.scrollTop, 0);
        cellList.updateElementHeight2(viewModel.cellAt(0), 250);
        assert.deepStrictEqual(cellList.scrollTop, 250 + 100 - cellList.renderHeight);
      }
    );
  });
  test("updateElementHeight with focused element out of viewport", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["# header c", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, disposables) => {
        viewModel.restoreEditorViewState({
          editingCells: [false, false, false, false, false],
          editorViewStates: [null, null, null, null, null],
          cellTotalHeights: [50, 100, 50, 100, 50],
          cellLineNumberStates: {},
          collapsedInputCells: {},
          collapsedOutputCells: {}
        });
        const cellList = createNotebookCellList(instantiationService, disposables);
        cellList.attachViewModel(viewModel);
        cellList.layout(210, 100);
        assert.deepStrictEqual(cellList.scrollTop, 0);
        assert.deepStrictEqual(cellList.getViewScrollBottom(), 210);
        cellList.setFocus([4]);
        cellList.updateElementHeight2(viewModel.cellAt(1), 130);
        assert.deepStrictEqual(cellList.scrollTop, 0);
      }
    );
  });
  test("updateElementHeight of cells out of viewport should not trigger scroll #121140", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["# header c", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, disposables) => {
        viewModel.restoreEditorViewState({
          editingCells: [false, false, false, false, false],
          editorViewStates: [null, null, null, null, null],
          cellTotalHeights: [50, 100, 50, 100, 50],
          cellLineNumberStates: {},
          collapsedInputCells: {},
          collapsedOutputCells: {}
        });
        const cellList = createNotebookCellList(instantiationService, disposables);
        cellList.attachViewModel(viewModel);
        cellList.layout(210, 100);
        assert.deepStrictEqual(cellList.scrollTop, 0);
        assert.deepStrictEqual(cellList.getViewScrollBottom(), 210);
        cellList.setFocus([1]);
        cellList.scrollTop = 80;
        assert.deepStrictEqual(cellList.scrollTop, 80);
        cellList.updateElementHeight2(viewModel.cellAt(0), 30);
        assert.deepStrictEqual(cellList.scrollTop, 60);
      }
    );
  });
  test("visibleRanges should be exclusive of end", async function() {
    await withTestNotebook(
      [],
      async (editor, viewModel, disposables) => {
        const cellList = createNotebookCellList(instantiationService, disposables);
        cellList.attachViewModel(viewModel);
        cellList.layout(100, 100);
        assert.deepStrictEqual(cellList.visibleRanges, []);
      }
    );
  });
  test("visibleRanges should be exclusive of end 2", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, disposables) => {
        viewModel.restoreEditorViewState({
          editingCells: [false],
          editorViewStates: [null],
          cellTotalHeights: [50],
          cellLineNumberStates: {},
          collapsedInputCells: {},
          collapsedOutputCells: {}
        });
        const cellList = createNotebookCellList(instantiationService, disposables);
        cellList.attachViewModel(viewModel);
        cellList.layout(100, 100);
        assert.deepStrictEqual(cellList.visibleRanges, [{ start: 0, end: 1 }]);
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFx0ZXN0XFxicm93c2VyXFxub3RlYm9va0NlbGxMaXN0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IENlbGxLaW5kLCBOb3RlYm9va1NldHRpbmcgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgY3JlYXRlTm90ZWJvb2tDZWxsTGlzdCwgc2V0dXBJbnN0YW50aWF0aW9uU2VydmljZSwgd2l0aFRlc3ROb3RlYm9vayB9IGZyb20gJy4vdGVzdE5vdGVib29rRWRpdG9yLmpzJztcblxuc3VpdGUoJ05vdGVib29rQ2VsbExpc3QnLCAoKSA9PiB7XG5cdGxldCB0ZXN0RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHRlc3REaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBjb25maWc6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblx0c2V0dXAoKCkgPT4ge1xuXHRcdHRlc3REaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHNldHVwSW5zdGFudGlhdGlvblNlcnZpY2UodGVzdERpc3Bvc2FibGVzKTtcblx0XHRjb25maWcgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldmVhbEVsZW1lbnRzSW5WaWV3OiByZXZlYWwgZnVsbHkgdmlzaWJsZSBjZWxsIHNob3VsZCBub3Qgc2Nyb2xsJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgYScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciBjJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBkaXNwb3NhYmxlcykgPT4ge1xuXHRcdFx0XHR2aWV3TW9kZWwucmVzdG9yZUVkaXRvclZpZXdTdGF0ZSh7XG5cdFx0XHRcdFx0ZWRpdGluZ0NlbGxzOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXSxcblx0XHRcdFx0XHRjZWxsTGluZU51bWJlclN0YXRlczoge30sXG5cdFx0XHRcdFx0ZWRpdG9yVmlld1N0YXRlczogW251bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGxdLFxuXHRcdFx0XHRcdGNlbGxUb3RhbEhlaWdodHM6IFs1MCwgMTAwLCA1MCwgMTAwLCA1MF0sXG5cdFx0XHRcdFx0Y29sbGFwc2VkSW5wdXRDZWxsczoge30sXG5cdFx0XHRcdFx0Y29sbGFwc2VkT3V0cHV0Q2VsbHM6IHt9LFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCBjZWxsTGlzdCA9IGNyZWF0ZU5vdGVib29rQ2VsbExpc3QoaW5zdGFudGlhdGlvblNlcnZpY2UsIGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0Y2VsbExpc3QuYXR0YWNoVmlld01vZGVsKHZpZXdNb2RlbCk7XG5cblx0XHRcdFx0Ly8gcmVuZGVyIGhlaWdodCAyMTAsIGl0IGNhbiByZW5kZXIgMyBmdWxsIGNlbGxzIGFuZCAxIHBhcnRpYWwgY2VsbFxuXHRcdFx0XHRjZWxsTGlzdC5sYXlvdXQoMjEwLCAxMDApO1xuXHRcdFx0XHQvLyBzY3JvbGwgYSBiaXQsIHNjcm9sbFRvcCB0byBib3R0b206IDUsIDIxNVxuXHRcdFx0XHRjZWxsTGlzdC5zY3JvbGxUb3AgPSA1O1xuXG5cdFx0XHRcdC8vIGluaXQgc2Nyb2xsVG9wIGFuZCBzY3JvbGxCb3R0b21cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxUb3AsIDUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LmdldFZpZXdTY3JvbGxCb3R0b20oKSwgMjE1KTtcblxuXHRcdFx0XHQvLyByZXZlYWwgY2VsbCAxLCB0b3AgNTAsIGJvdHRvbSAxNTAsIHdoaWNoIGlzIGZ1bGx5IHZpc2libGUgaW4gdGhlIHZpZXdwb3J0XG5cdFx0XHRcdGNlbGxMaXN0LnJldmVhbENlbGxzKHsgc3RhcnQ6IDEsIGVuZDogMiB9KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxUb3AsIDUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LmdldFZpZXdTY3JvbGxCb3R0b20oKSwgMjE1KTtcblxuXHRcdFx0XHQvLyByZXZlYWwgY2VsbCAyLCB0b3AgMTUwLCBib3R0b20gMjAwLCB3aGljaCBpcyBmdWxseSB2aXNpYmxlIGluIHRoZSB2aWV3cG9ydFxuXHRcdFx0XHRjZWxsTGlzdC5yZXZlYWxDZWxscyh7IHN0YXJ0OiAyLCBlbmQ6IDMgfSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsVG9wLCA1KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRWaWV3U2Nyb2xsQm90dG9tKCksIDIxNSk7XG5cblx0XHRcdFx0Ly8gcmV2ZWFsIGNlbGwgMywgdG9wIDIwMCwgYm90dG9tIDMwMCwgd2hpY2ggaXMgcGFydGlhbGx5IHZpc2libGUgaW4gdGhlIHZpZXdwb3J0XG5cdFx0XHRcdGNlbGxMaXN0LnJldmVhbENlbGxzKHsgc3RhcnQ6IDMsIGVuZDogNCB9KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxUb3AsIDkwKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXZlYWxFbGVtZW50c0luVmlldzogcmV2ZWFsIHBhcnRpYWxseSB2aXNpYmxlIGNlbGwnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciBhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgYicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGMnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIGRpc3Bvc2FibGVzKSA9PiB7XG5cdFx0XHRcdHZpZXdNb2RlbC5yZXN0b3JlRWRpdG9yVmlld1N0YXRlKHtcblx0XHRcdFx0XHRlZGl0aW5nQ2VsbHM6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdLFxuXHRcdFx0XHRcdGVkaXRvclZpZXdTdGF0ZXM6IFtudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsXSxcblx0XHRcdFx0XHRjZWxsVG90YWxIZWlnaHRzOiBbNTAsIDEwMCwgNTAsIDEwMCwgNTBdLFxuXHRcdFx0XHRcdGNlbGxMaW5lTnVtYmVyU3RhdGVzOiB7fSxcblx0XHRcdFx0XHRjb2xsYXBzZWRJbnB1dENlbGxzOiB7fSxcblx0XHRcdFx0XHRjb2xsYXBzZWRPdXRwdXRDZWxsczoge30sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IGNlbGxMaXN0ID0gY3JlYXRlTm90ZWJvb2tDZWxsTGlzdChpbnN0YW50aWF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRjZWxsTGlzdC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblxuXHRcdFx0XHQvLyByZW5kZXIgaGVpZ2h0IDIxMCwgaXQgY2FuIHJlbmRlciAzIGZ1bGwgY2VsbHMgYW5kIDEgcGFydGlhbCBjZWxsXG5cdFx0XHRcdGNlbGxMaXN0LmxheW91dCgyMTAsIDEwMCk7XG5cblx0XHRcdFx0Ly8gaW5pdCBzY3JvbGxUb3AgYW5kIHNjcm9sbEJvdHRvbVxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LnNjcm9sbFRvcCwgMCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0Vmlld1Njcm9sbEJvdHRvbSgpLCAyMTApO1xuXG5cdFx0XHRcdC8vIHJldmVhbCBjZWxsIDMsIHRvcCAyMDAsIGJvdHRvbSAzMDAsIHdoaWNoIGlzIHBhcnRpYWxseSB2aXNpYmxlIGluIHRoZSB2aWV3cG9ydFxuXHRcdFx0XHRjZWxsTGlzdC5yZXZlYWxDZWxscyh7IHN0YXJ0OiAzLCBlbmQ6IDQgfSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsVG9wLCA5MCk7XG5cblx0XHRcdFx0Ly8gc2Nyb2xsIHRvIDVcblx0XHRcdFx0Y2VsbExpc3Quc2Nyb2xsVG9wID0gNTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxUb3AsIDUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LmdldFZpZXdTY3JvbGxCb3R0b20oKSwgMjE1KTtcblxuXHRcdFx0XHQvLyByZXZlYWwgY2VsbCAwLCB0b3AgMCwgYm90dG9tIDUwXG5cdFx0XHRcdGNlbGxMaXN0LnJldmVhbENlbGxzKHsgc3RhcnQ6IDAsIGVuZDogMSB9KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxUb3AsIDApO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldmVhbEVsZW1lbnRzSW5WaWV3OiByZXZlYWwgY2VsbCBvdXQgb2Ygdmlld3BvcnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciBhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgYicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGMnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIGRpc3Bvc2FibGVzKSA9PiB7XG5cdFx0XHRcdHZpZXdNb2RlbC5yZXN0b3JlRWRpdG9yVmlld1N0YXRlKHtcblx0XHRcdFx0XHRlZGl0aW5nQ2VsbHM6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdLFxuXHRcdFx0XHRcdGVkaXRvclZpZXdTdGF0ZXM6IFtudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsXSxcblx0XHRcdFx0XHRjZWxsVG90YWxIZWlnaHRzOiBbNTAsIDEwMCwgNTAsIDEwMCwgNTBdLFxuXHRcdFx0XHRcdGNlbGxMaW5lTnVtYmVyU3RhdGVzOiB7fSxcblx0XHRcdFx0XHRjb2xsYXBzZWRJbnB1dENlbGxzOiB7fSxcblx0XHRcdFx0XHRjb2xsYXBzZWRPdXRwdXRDZWxsczoge30sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IGNlbGxMaXN0ID0gY3JlYXRlTm90ZWJvb2tDZWxsTGlzdChpbnN0YW50aWF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHQvLyB3aXRob3V0IHBhZGRpbmdCb3R0b20sIHRoZSBsYXN0IDIwIHB4IHdpbGwgYWx3YXlzIGJlIGhpZGRlbiBkdWUgdG8gYHRvcEluc2VydFRvb2xiYXJIZWlnaHRgXG5cdFx0XHRcdGNlbGxMaXN0LnVwZGF0ZU9wdGlvbnMoeyBwYWRkaW5nQm90dG9tOiAxMDAgfSk7XG5cdFx0XHRcdGNlbGxMaXN0LmF0dGFjaFZpZXdNb2RlbCh2aWV3TW9kZWwpO1xuXG5cdFx0XHRcdC8vIHJlbmRlciBoZWlnaHQgMjEwLCBpdCBjYW4gcmVuZGVyIDMgZnVsbCBjZWxscyBhbmQgMSBwYXJ0aWFsIGNlbGxcblx0XHRcdFx0Y2VsbExpc3QubGF5b3V0KDIxMCwgMTAwKTtcblxuXHRcdFx0XHQvLyBpbml0IHNjcm9sbFRvcCBhbmQgc2Nyb2xsQm90dG9tXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsVG9wLCAwKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRWaWV3U2Nyb2xsQm90dG9tKCksIDIxMCk7XG5cblx0XHRcdFx0Y2VsbExpc3QucmV2ZWFsQ2VsbHMoeyBzdGFydDogNCwgZW5kOiA1IH0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LnNjcm9sbFRvcCwgMTQwKTtcblx0XHRcdFx0Ly8gYXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRWaWV3U2Nyb2xsQm90dG9tKCksIDMzMCk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlRWxlbWVudEhlaWdodCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIGEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciBiJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgYycsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XVxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCwgZGlzcG9zYWJsZXMpID0+IHtcblx0XHRcdFx0dmlld01vZGVsLnJlc3RvcmVFZGl0b3JWaWV3U3RhdGUoe1xuXHRcdFx0XHRcdGVkaXRpbmdDZWxsczogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV0sXG5cdFx0XHRcdFx0ZWRpdG9yVmlld1N0YXRlczogW251bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGxdLFxuXHRcdFx0XHRcdGNlbGxUb3RhbEhlaWdodHM6IFs1MCwgMTAwLCA1MCwgMTAwLCA1MF0sXG5cdFx0XHRcdFx0Y2VsbExpbmVOdW1iZXJTdGF0ZXM6IHt9LFxuXHRcdFx0XHRcdGNvbGxhcHNlZElucHV0Q2VsbHM6IHt9LFxuXHRcdFx0XHRcdGNvbGxhcHNlZE91dHB1dENlbGxzOiB7fSxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgY2VsbExpc3QgPSBjcmVhdGVOb3RlYm9va0NlbGxMaXN0KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHRcdGNlbGxMaXN0LmF0dGFjaFZpZXdNb2RlbCh2aWV3TW9kZWwpO1xuXG5cdFx0XHRcdC8vIHJlbmRlciBoZWlnaHQgMjEwLCBpdCBjYW4gcmVuZGVyIDMgZnVsbCBjZWxscyBhbmQgMSBwYXJ0aWFsIGNlbGxcblx0XHRcdFx0Y2VsbExpc3QubGF5b3V0KDIxMCwgMTAwKTtcblxuXHRcdFx0XHQvLyBpbml0IHNjcm9sbFRvcCBhbmQgc2Nyb2xsQm90dG9tXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsVG9wLCAwKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRWaWV3U2Nyb2xsQm90dG9tKCksIDIxMCk7XG5cblx0XHRcdFx0Y2VsbExpc3QudXBkYXRlRWxlbWVudEhlaWdodCgwLCA2MCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsVG9wLCAwKTtcblxuXHRcdFx0XHQvLyBzY3JvbGwgdG8gNVxuXHRcdFx0XHRjZWxsTGlzdC5zY3JvbGxUb3AgPSA1O1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LnNjcm9sbFRvcCwgNSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0Vmlld1Njcm9sbEJvdHRvbSgpLCAyMTUpO1xuXG5cdFx0XHRcdGNlbGxMaXN0LnVwZGF0ZUVsZW1lbnRIZWlnaHQoMCwgODApO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LnNjcm9sbFRvcCwgNSk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlRWxlbWVudEhlaWdodCB3aXRoIGFuY2hvcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIGEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciBiJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgYycsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XVxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCwgZGlzcG9zYWJsZXMpID0+IHtcblx0XHRcdFx0dmlld01vZGVsLnJlc3RvcmVFZGl0b3JWaWV3U3RhdGUoe1xuXHRcdFx0XHRcdGVkaXRpbmdDZWxsczogW2ZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV0sXG5cdFx0XHRcdFx0ZWRpdG9yVmlld1N0YXRlczogW251bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGxdLFxuXHRcdFx0XHRcdGNlbGxUb3RhbEhlaWdodHM6IFs1MCwgMTAwLCA1MCwgMTAwLCA1MF0sXG5cdFx0XHRcdFx0Y2VsbExpbmVOdW1iZXJTdGF0ZXM6IHt9LFxuXHRcdFx0XHRcdGNvbGxhcHNlZElucHV0Q2VsbHM6IHt9LFxuXHRcdFx0XHRcdGNvbGxhcHNlZE91dHB1dENlbGxzOiB7fSxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgY2VsbExpc3QgPSBjcmVhdGVOb3RlYm9va0NlbGxMaXN0KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHRcdGNlbGxMaXN0LmF0dGFjaFZpZXdNb2RlbCh2aWV3TW9kZWwpO1xuXG5cdFx0XHRcdC8vIHJlbmRlciBoZWlnaHQgMjEwLCBpdCBjYW4gcmVuZGVyIDMgZnVsbCBjZWxscyBhbmQgMSBwYXJ0aWFsIGNlbGxcblx0XHRcdFx0Y2VsbExpc3QubGF5b3V0KDIxMCwgMTAwKTtcblxuXHRcdFx0XHQvLyBpbml0IHNjcm9sbFRvcCBhbmQgc2Nyb2xsQm90dG9tXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsVG9wLCAwKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRWaWV3U2Nyb2xsQm90dG9tKCksIDIxMCk7XG5cblx0XHRcdFx0Ly8gc2Nyb2xsIHRvIDVcblx0XHRcdFx0Y2VsbExpc3QudXBkYXRlRWxlbWVudEhlaWdodDIodmlld01vZGVsLmNlbGxBdCgwKSEsIDUwKTtcblx0XHRcdFx0Y2VsbExpc3Quc2Nyb2xsVG9wID0gNTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxUb3AsIDUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LmdldFZpZXdTY3JvbGxCb3R0b20oKSwgMjE1KTtcblxuXHRcdFx0XHRjZWxsTGlzdC5zZXRGb2N1cyhbMV0pO1xuXHRcdFx0XHRjZWxsTGlzdC51cGRhdGVFbGVtZW50SGVpZ2h0Mih2aWV3TW9kZWwuY2VsbEF0KDApISwgMTAwKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxIZWlnaHQsIDQwMCk7XG5cblx0XHRcdFx0Ly8gdGhlIGZpcnN0IGNlbGwgZ3Jvd3MsIGFuZCB0aGUgZm9jdXNlZCBjZWxsIHdpbGwgcmVtYWluIGZ1bGx5IHZpc2libGUsIHNvIHdlIGRvbid0IHNjcm9sbFxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LnNjcm9sbFRvcCwgNSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0Vmlld1Njcm9sbEJvdHRvbSgpLCAyMTUpO1xuXG5cdFx0XHRcdGNlbGxMaXN0LnVwZGF0ZUVsZW1lbnRIZWlnaHQyKHZpZXdNb2RlbC5jZWxsQXQoMCkhLCAxNTApO1xuXHRcdFx0XHQvLyB0aGUgZmlyc3QgY2VsbCBncm93cywgYW5kIHRoZSBmb2N1c2VkIGNlbGwgd2lsbCBiZSBwdXNoZWQgb3V0IG9mIHZpZXcsIHNvIHdlIHNjcm9sbCBkb3duXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsVG9wLCA1NSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0Vmlld1Njcm9sbEJvdHRvbSgpLCAyNjUpO1xuXG5cdFx0XHRcdC8vIFdlIGRvbid0IGFuY2hvciB0byB0aGUgZm9jdXNlZCBjZWxsIHdoZW4gY2VsbHMgc2hyaW5rXG5cdFx0XHRcdGNlbGxMaXN0LnVwZGF0ZUVsZW1lbnRIZWlnaHQyKHZpZXdNb2RlbC5jZWxsQXQoMCkhLCA1MCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsVG9wLCA1NSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0Vmlld1Njcm9sbEJvdHRvbSgpLCAyNjUpO1xuXG5cdFx0XHRcdC8vIGZvY3VzIHdvbid0IGJlIHZpc2libGUgYWZ0ZXIgY2VsbCAwIGdyb3cgdG8gMjUwLCBzbyBsZXQncyB0cnkgdG8ga2VlcCB0aGUgZm9jdXNlZCBjZWxsIHZpc2libGVcblx0XHRcdFx0Y2VsbExpc3QudXBkYXRlRWxlbWVudEhlaWdodDIodmlld01vZGVsLmNlbGxBdCgwKSEsIDI1MCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsVG9wLCAyNTAgKyAxMDAgLSBjZWxsTGlzdC5yZW5kZXJIZWlnaHQpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LmdldFZpZXdTY3JvbGxCb3R0b20oKSwgMjUwICsgMTAwIC0gY2VsbExpc3QucmVuZGVySGVpZ2h0ICsgMjEwKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVFbGVtZW50SGVpZ2h0IHdpdGggbm8gc2Nyb2xsaW5nJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbmZpZy5zZXRVc2VyQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcuc2Nyb2xsVG9SZXZlYWxDZWxsLCAnbm9uZScpO1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgYScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciBjJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBkaXNwb3NhYmxlcykgPT4ge1xuXHRcdFx0XHR2aWV3TW9kZWwucmVzdG9yZUVkaXRvclZpZXdTdGF0ZSh7XG5cdFx0XHRcdFx0ZWRpdGluZ0NlbGxzOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXSxcblx0XHRcdFx0XHRlZGl0b3JWaWV3U3RhdGVzOiBbbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbF0sXG5cdFx0XHRcdFx0Y2VsbFRvdGFsSGVpZ2h0czogWzUwLCAxMDAsIDUwLCAxMDAsIDUwXSxcblx0XHRcdFx0XHRjZWxsTGluZU51bWJlclN0YXRlczoge30sXG5cdFx0XHRcdFx0Y29sbGFwc2VkSW5wdXRDZWxsczoge30sXG5cdFx0XHRcdFx0Y29sbGFwc2VkT3V0cHV0Q2VsbHM6IHt9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgY2VsbExpc3QgPSBjcmVhdGVOb3RlYm9va0NlbGxMaXN0KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHRcdGNlbGxMaXN0LmF0dGFjaFZpZXdNb2RlbCh2aWV3TW9kZWwpO1xuXG5cdFx0XHRcdC8vIHJlbmRlciBoZWlnaHQgMjEwLCBpdCBjYW4gcmVuZGVyIDMgZnVsbCBjZWxscyBhbmQgMSBwYXJ0aWFsIGNlbGxcblx0XHRcdFx0Y2VsbExpc3QubGF5b3V0KDIxMCwgMTAwKTtcblxuXHRcdFx0XHQvLyBpbml0IHNjcm9sbFRvcCBhbmQgc2Nyb2xsQm90dG9tXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsVG9wLCAwKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRWaWV3U2Nyb2xsQm90dG9tKCksIDIxMCk7XG5cblx0XHRcdFx0Ly8gc2Nyb2xsIHRvIDVcblx0XHRcdFx0Y2VsbExpc3QudXBkYXRlRWxlbWVudEhlaWdodDIodmlld01vZGVsLmNlbGxBdCgwKSEsIDUwKTtcblx0XHRcdFx0Y2VsbExpc3Quc2Nyb2xsVG9wID0gNTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxUb3AsIDUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LmdldFZpZXdTY3JvbGxCb3R0b20oKSwgMjE1KTtcblxuXHRcdFx0XHRjZWxsTGlzdC5zZXRGb2N1cyhbMV0pO1xuXHRcdFx0XHRjZWxsTGlzdC51cGRhdGVFbGVtZW50SGVpZ2h0Mih2aWV3TW9kZWwuY2VsbEF0KDApISwgMTAwKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxIZWlnaHQsIDQwMCk7XG5cblx0XHRcdFx0Ly8gQW55IGNoYW5nZSBpbiBjZWxsIHNpemUgc2hvdWxkIG5vdCBhZmZlY3QgdGhlIHNjcm9sbCBoZWlnaHQgd2l0aCBzY3JvbGxUb1JldmVhbCBzZXQgdG8gbm9uZVxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LnNjcm9sbFRvcCwgNSk7XG5cblx0XHRcdFx0Y2VsbExpc3QudXBkYXRlRWxlbWVudEhlaWdodDIodmlld01vZGVsLmNlbGxBdCgwKSEsIDUwKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxUb3AsIDUpO1xuXG5cdFx0XHRcdGNlbGxMaXN0LnVwZGF0ZUVsZW1lbnRIZWlnaHQyKHZpZXdNb2RlbC5jZWxsQXQoMCkhLCAyNTApO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LnNjcm9sbFRvcCwgNSk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlRWxlbWVudEhlaWdodCB3aXRoIG5vIHNjcm9sbCBzZXR0aW5nIGFuZCBjZWxsIGVkaXRvciBmb2N1c2VkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbmZpZy5zZXRVc2VyQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcuc2Nyb2xsVG9SZXZlYWxDZWxsLCAnbm9uZScpO1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgYScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciBjJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBkaXNwb3NhYmxlcykgPT4ge1xuXHRcdFx0XHR2aWV3TW9kZWwucmVzdG9yZUVkaXRvclZpZXdTdGF0ZSh7XG5cdFx0XHRcdFx0ZWRpdGluZ0NlbGxzOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXSxcblx0XHRcdFx0XHRlZGl0b3JWaWV3U3RhdGVzOiBbbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbF0sXG5cdFx0XHRcdFx0Y2VsbFRvdGFsSGVpZ2h0czogWzUwLCAxMDAsIDUwLCAxMDAsIDUwXSxcblx0XHRcdFx0XHRjZWxsTGluZU51bWJlclN0YXRlczoge30sXG5cdFx0XHRcdFx0Y29sbGFwc2VkSW5wdXRDZWxsczoge30sXG5cdFx0XHRcdFx0Y29sbGFwc2VkT3V0cHV0Q2VsbHM6IHt9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgY2VsbExpc3QgPSBjcmVhdGVOb3RlYm9va0NlbGxMaXN0KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHRcdGNlbGxMaXN0LmF0dGFjaFZpZXdNb2RlbCh2aWV3TW9kZWwpO1xuXG5cdFx0XHRcdC8vIHJlbmRlciBoZWlnaHQgMjEwLCBpdCBjYW4gcmVuZGVyIDMgZnVsbCBjZWxscyBhbmQgMSBwYXJ0aWFsIGNlbGxcblx0XHRcdFx0Y2VsbExpc3QubGF5b3V0KDIxMCwgMTAwKTtcblxuXHRcdFx0XHQvLyBpbml0IHNjcm9sbFRvcCBhbmQgc2Nyb2xsQm90dG9tXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsVG9wLCAwKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRWaWV3U2Nyb2xsQm90dG9tKCksIDIxMCk7XG5cblx0XHRcdFx0Y2VsbExpc3Quc2V0Rm9jdXMoWzFdKTtcblxuXHRcdFx0XHRlZGl0b3IuZm9jdXNOb3RlYm9va0NlbGwoY2VsbExpc3Qudmlld01vZGVsPy5jZWxsQXQoMSkhLCAnZWRpdG9yJyk7XG5cdFx0XHRcdGNlbGxMaXN0LnVwZGF0ZUVsZW1lbnRIZWlnaHQyKHZpZXdNb2RlbC5jZWxsQXQoMCkhLCAxMDApO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LnNjcm9sbEhlaWdodCwgNDAwKTtcblxuXHRcdFx0XHQvLyBXZSBoYXZlIHRoZSBjZWxsIGVkaXRvciBmb2N1c2VkLCBzbyB3ZSBzaG91bGQgYW5jaG9yIHRvIHRoYXQgY2VsbFxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LnNjcm9sbFRvcCwgNTApO1xuXG5cdFx0XHRcdGNlbGxMaXN0LnVwZGF0ZUVsZW1lbnRIZWlnaHQyKHZpZXdNb2RlbC5jZWxsQXQoMCkhLCA1MCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsVG9wLCAwKTtcblxuXHRcdFx0XHRjZWxsTGlzdC51cGRhdGVFbGVtZW50SGVpZ2h0Mih2aWV3TW9kZWwuY2VsbEF0KDApISwgMjUwKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxUb3AsIDI1MCArIDEwMCAtIGNlbGxMaXN0LnJlbmRlckhlaWdodCk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlRWxlbWVudEhlaWdodCB3aXRoIGZvY3VzZWQgZWxlbWVudCBvdXQgb2Ygdmlld3BvcnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciBhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgYicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGMnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIGRpc3Bvc2FibGVzKSA9PiB7XG5cdFx0XHRcdHZpZXdNb2RlbC5yZXN0b3JlRWRpdG9yVmlld1N0YXRlKHtcblx0XHRcdFx0XHRlZGl0aW5nQ2VsbHM6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdLFxuXHRcdFx0XHRcdGVkaXRvclZpZXdTdGF0ZXM6IFtudWxsLCBudWxsLCBudWxsLCBudWxsLCBudWxsXSxcblx0XHRcdFx0XHRjZWxsVG90YWxIZWlnaHRzOiBbNTAsIDEwMCwgNTAsIDEwMCwgNTBdLFxuXHRcdFx0XHRcdGNlbGxMaW5lTnVtYmVyU3RhdGVzOiB7fSxcblx0XHRcdFx0XHRjb2xsYXBzZWRJbnB1dENlbGxzOiB7fSxcblx0XHRcdFx0XHRjb2xsYXBzZWRPdXRwdXRDZWxsczoge30sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IGNlbGxMaXN0ID0gY3JlYXRlTm90ZWJvb2tDZWxsTGlzdChpbnN0YW50aWF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRjZWxsTGlzdC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblxuXHRcdFx0XHQvLyByZW5kZXIgaGVpZ2h0IDIxMCwgaXQgY2FuIHJlbmRlciAzIGZ1bGwgY2VsbHMgYW5kIDEgcGFydGlhbCBjZWxsXG5cdFx0XHRcdGNlbGxMaXN0LmxheW91dCgyMTAsIDEwMCk7XG5cblx0XHRcdFx0Ly8gaW5pdCBzY3JvbGxUb3AgYW5kIHNjcm9sbEJvdHRvbVxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LnNjcm9sbFRvcCwgMCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0Vmlld1Njcm9sbEJvdHRvbSgpLCAyMTApO1xuXG5cdFx0XHRcdGNlbGxMaXN0LnNldEZvY3VzKFs0XSk7XG5cdFx0XHRcdGNlbGxMaXN0LnVwZGF0ZUVsZW1lbnRIZWlnaHQyKHZpZXdNb2RlbC5jZWxsQXQoMSkhLCAxMzApO1xuXHRcdFx0XHQvLyB0aGUgZm9jdXMgY2VsbCBpcyBub3QgaW4gdGhlIHZpZXdwb3J0LCB0aGUgc2Nyb2xsdG9wIHNob3VsZCBub3QgY2hhbmdlIGF0IGFsbFxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LnNjcm9sbFRvcCwgMCk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlRWxlbWVudEhlaWdodCBvZiBjZWxscyBvdXQgb2Ygdmlld3BvcnQgc2hvdWxkIG5vdCB0cmlnZ2VyIHNjcm9sbCAjMTIxMTQwJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgYScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciBjJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBkaXNwb3NhYmxlcykgPT4ge1xuXHRcdFx0XHR2aWV3TW9kZWwucmVzdG9yZUVkaXRvclZpZXdTdGF0ZSh7XG5cdFx0XHRcdFx0ZWRpdGluZ0NlbGxzOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXSxcblx0XHRcdFx0XHRlZGl0b3JWaWV3U3RhdGVzOiBbbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbF0sXG5cdFx0XHRcdFx0Y2VsbFRvdGFsSGVpZ2h0czogWzUwLCAxMDAsIDUwLCAxMDAsIDUwXSxcblx0XHRcdFx0XHRjZWxsTGluZU51bWJlclN0YXRlczoge30sXG5cdFx0XHRcdFx0Y29sbGFwc2VkSW5wdXRDZWxsczoge30sXG5cdFx0XHRcdFx0Y29sbGFwc2VkT3V0cHV0Q2VsbHM6IHt9LFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCBjZWxsTGlzdCA9IGNyZWF0ZU5vdGVib29rQ2VsbExpc3QoaW5zdGFudGlhdGlvblNlcnZpY2UsIGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0Y2VsbExpc3QuYXR0YWNoVmlld01vZGVsKHZpZXdNb2RlbCk7XG5cblx0XHRcdFx0Ly8gcmVuZGVyIGhlaWdodCAyMTAsIGl0IGNhbiByZW5kZXIgMyBmdWxsIGNlbGxzIGFuZCAxIHBhcnRpYWwgY2VsbFxuXHRcdFx0XHRjZWxsTGlzdC5sYXlvdXQoMjEwLCAxMDApO1xuXG5cdFx0XHRcdC8vIGluaXQgc2Nyb2xsVG9wIGFuZCBzY3JvbGxCb3R0b21cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxUb3AsIDApO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LmdldFZpZXdTY3JvbGxCb3R0b20oKSwgMjEwKTtcblxuXHRcdFx0XHRjZWxsTGlzdC5zZXRGb2N1cyhbMV0pO1xuXHRcdFx0XHRjZWxsTGlzdC5zY3JvbGxUb3AgPSA4MDtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxUb3AsIDgwKTtcblxuXHRcdFx0XHRjZWxsTGlzdC51cGRhdGVFbGVtZW50SGVpZ2h0Mih2aWV3TW9kZWwuY2VsbEF0KDApISwgMzApO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LnNjcm9sbFRvcCwgNjApO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Zpc2libGVSYW5nZXMgc2hvdWxkIGJlIGV4Y2x1c2l2ZSBvZiBlbmQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIGRpc3Bvc2FibGVzKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNlbGxMaXN0ID0gY3JlYXRlTm90ZWJvb2tDZWxsTGlzdChpbnN0YW50aWF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRjZWxsTGlzdC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblxuXHRcdFx0XHQvLyByZW5kZXIgaGVpZ2h0IDIxMCwgaXQgY2FuIHJlbmRlciAzIGZ1bGwgY2VsbHMgYW5kIDEgcGFydGlhbCBjZWxsXG5cdFx0XHRcdGNlbGxMaXN0LmxheW91dCgxMDAsIDEwMCk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC52aXNpYmxlUmFuZ2VzLCBbXSk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndmlzaWJsZVJhbmdlcyBzaG91bGQgYmUgZXhjbHVzaXZlIG9mIGVuZCAyJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgYScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIGRpc3Bvc2FibGVzKSA9PiB7XG5cdFx0XHRcdHZpZXdNb2RlbC5yZXN0b3JlRWRpdG9yVmlld1N0YXRlKHtcblx0XHRcdFx0XHRlZGl0aW5nQ2VsbHM6IFtmYWxzZV0sXG5cdFx0XHRcdFx0ZWRpdG9yVmlld1N0YXRlczogW251bGxdLFxuXHRcdFx0XHRcdGNlbGxUb3RhbEhlaWdodHM6IFs1MF0sXG5cdFx0XHRcdFx0Y2VsbExpbmVOdW1iZXJTdGF0ZXM6IHt9LFxuXHRcdFx0XHRcdGNvbGxhcHNlZElucHV0Q2VsbHM6IHt9LFxuXHRcdFx0XHRcdGNvbGxhcHNlZE91dHB1dENlbGxzOiB7fSxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgY2VsbExpc3QgPSBjcmVhdGVOb3RlYm9va0NlbGxMaXN0KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHRcdGNlbGxMaXN0LmF0dGFjaFZpZXdNb2RlbCh2aWV3TW9kZWwpO1xuXG5cdFx0XHRcdC8vIHJlbmRlciBoZWlnaHQgMjEwLCBpdCBjYW4gcmVuZGVyIDMgZnVsbCBjZWxscyBhbmQgMSBwYXJ0aWFsIGNlbGxcblx0XHRcdFx0Y2VsbExpc3QubGF5b3V0KDEwMCwgMTAwKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LnZpc2libGVSYW5nZXMsIFt7IHN0YXJ0OiAwLCBlbmQ6IDEgfV0pO1xuXHRcdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyxVQUFVLHVCQUF1QjtBQUMxQyxTQUFTLHdCQUF3QiwyQkFBMkIsd0JBQXdCO0FBRXBGLE1BQU0sb0JBQW9CLE1BQU07QUFDL0IsTUFBSTtBQUNKLE1BQUk7QUFFSixXQUFTLE1BQU07QUFDZCxvQkFBZ0IsUUFBUTtBQUFBLEVBQ3pC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QUssR0FBRztBQUd4QixlQUFPLGdCQUFnQixTQUFTLFdBQVcsQ0FBQztBQUM1QyxlQUFPLGdCQUFnQixTQUFTLG9CQUFvQixHQUFHLEdBQUc7QUFFMUQsaUJBQVMsU0FBUyxDQUFDLENBQUMsQ0FBQztBQUNyQixpQkFBUyxZQUFZO0FBQ3JCLGVBQU8sZ0JBQWdCLFNBQVMsV0FBVyxFQUFFO0FBRTdDLGlCQUFTLHFCQUFxQixVQUFVLE9BQU8sQ0FBQyxHQUFJLEVBQUU7QUFDdEQsZUFBTyxnQkFBZ0IsU0FBUyxXQUFXLEVBQUU7QUFBQSxNQUM5QztBQUFBLElBQUM7QUFBQSxFQUNILENBQUM7QUFFRCxPQUFLLDRDQUE0QyxpQkFBa0I7QUFDbEUsVUFBTTtBQUFBLE1BQ0wsQ0FDQTtBQUFBLE1BQ0EsT0FBTyxRQUFRLFdBQVcsZ0JBQWdCO0FBQ3pDLGNBQU0sV0FBVyx1QkFBdUIsc0JBQXNCLFdBQVc7QUFDekUsaUJBQVMsZ0JBQWdCLFNBQVM7QUFHbEMsaUJBQVMsT0FBTyxLQUFLLEdBQUc7QUFFeEIsZUFBTyxnQkFBZ0IsU0FBUyxlQUFlLENBQUMsQ0FBQztBQUFBLE1BQ2xEO0FBQUEsSUFBQztBQUFBLEVBQ0gsQ0FBQztBQUVELE9BQUssOENBQThDLGlCQUFrQjtBQUNwRSxVQUFNO0FBQUEsTUFDTDtBQUFBLFFBQ0MsQ0FBQyxjQUFjLFlBQVksU0FBUyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUNuRDtBQUFBLE1BQ0EsT0FBTyxRQUFRLFdBQVcsZ0JBQWdCO0FBQ3pDLGtCQUFVLHVCQUF1QjtBQUFBLFVBQ2hDLGNBQWMsQ0FBQyxLQUFLO0FBQUEsVUFDcEIsa0JBQWtCLENBQUMsSUFBSTtBQUFBLFVBQ3ZCLGtCQUFrQixDQUFDLEVBQUU7QUFBQSxVQUNyQixzQkFBc0IsQ0FBQztBQUFBLFVBQ3ZCLHFCQUFxQixDQUFDO0FBQUEsVUFDdEIsc0JBQXNCLENBQUM7QUFBQSxRQUN4QixDQUFDO0FBRUQsY0FBTSxXQUFXLHVCQUF1QixzQkFBc0IsV0FBVztBQUN6RSxpQkFBUyxnQkFBZ0IsU0FBUztBQUdsQyxpQkFBUyxPQUFPLEtBQUssR0FBRztBQUV4QixlQUFPLGdCQUFnQixTQUFTLGVBQWUsQ0FBQyxFQUFFLE9BQU8sR0FBRyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0FBQUEsTUFDdEU7QUFBQSxJQUFDO0FBQUEsRUFDSCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
