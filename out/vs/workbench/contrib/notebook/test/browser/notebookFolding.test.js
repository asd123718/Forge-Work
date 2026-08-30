import assert from "assert";
import { CellKind } from "../../common/notebookCommon.js";
import { setupInstantiationService, withTestNotebook } from "./testNotebookEditor.js";
import { IUndoRedoService } from "../../../../../platform/undoRedo/common/undoRedo.js";
import { FoldingModel, updateFoldingStateAtIndex } from "../../browser/viewModel/foldingModel.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
suite("Notebook Folding", () => {
  let disposables;
  let instantiationService;
  teardown(() => disposables.dispose());
  ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    disposables = new DisposableStore();
    instantiationService = setupInstantiationService(disposables);
    instantiationService.spy(IUndoRedoService, "pushElement");
  });
  test("Folding based on markdown cells", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}],
        ["## header 2.1", "markdown", CellKind.Markup, [], {}],
        ["body 2", "markdown", CellKind.Markup, [], {}],
        ["body 3", "markdown", CellKind.Markup, [], {}],
        ["## header 2.2", "markdown", CellKind.Markup, [], {}],
        ["var e = 7;", "markdown", CellKind.Markup, [], {}]
      ],
      (editor, viewModel, ds) => {
        const foldingController = ds.add(new FoldingModel());
        foldingController.attachViewModel(viewModel);
        assert.strictEqual(foldingController.regions.findRange(1), 0);
        assert.strictEqual(foldingController.regions.findRange(2), 0);
        assert.strictEqual(foldingController.regions.findRange(3), 1);
        assert.strictEqual(foldingController.regions.findRange(4), 1);
        assert.strictEqual(foldingController.regions.findRange(5), 1);
        assert.strictEqual(foldingController.regions.findRange(6), 2);
        assert.strictEqual(foldingController.regions.findRange(7), 2);
      }
    );
  });
  test("Folding not based on code cells", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}],
        ["# comment 1", "python", CellKind.Code, [], {}],
        ["body 2", "markdown", CellKind.Markup, [], {}],
        ["body 3\n```\n## comment 2\n```", "markdown", CellKind.Markup, [], {}],
        ["body 4", "markdown", CellKind.Markup, [], {}],
        ["## header 2.1", "markdown", CellKind.Markup, [], {}],
        ["var e = 7;", "python", CellKind.Code, [], {}]
      ],
      (editor, viewModel, ds) => {
        const foldingController = ds.add(new FoldingModel());
        foldingController.attachViewModel(viewModel);
        assert.strictEqual(foldingController.regions.findRange(1), 0);
        assert.strictEqual(foldingController.regions.findRange(2), 0);
        assert.strictEqual(foldingController.regions.findRange(3), 0);
        assert.strictEqual(foldingController.regions.findRange(4), 0);
        assert.strictEqual(foldingController.regions.findRange(5), 0);
        assert.strictEqual(foldingController.regions.findRange(6), 0);
        assert.strictEqual(foldingController.regions.findRange(7), 1);
        assert.strictEqual(foldingController.regions.findRange(8), 1);
      }
    );
  });
  test("Top level header in a cell wins", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}],
        ["## header 2.1\n# header3", "markdown", CellKind.Markup, [], {}],
        ["body 2", "markdown", CellKind.Markup, [], {}],
        ["body 3", "markdown", CellKind.Markup, [], {}],
        ["## header 2.2", "markdown", CellKind.Markup, [], {}],
        ["var e = 7;", "markdown", CellKind.Markup, [], {}]
      ],
      (editor, viewModel, ds) => {
        const foldingController = ds.add(new FoldingModel());
        foldingController.attachViewModel(viewModel);
        assert.strictEqual(foldingController.regions.findRange(1), 0);
        assert.strictEqual(foldingController.regions.findRange(2), 0);
        assert.strictEqual(foldingController.regions.getEndLineNumber(0), 2);
        assert.strictEqual(foldingController.regions.findRange(3), 1);
        assert.strictEqual(foldingController.regions.findRange(4), 1);
        assert.strictEqual(foldingController.regions.findRange(5), 1);
        assert.strictEqual(foldingController.regions.getEndLineNumber(1), 7);
        assert.strictEqual(foldingController.regions.findRange(6), 2);
        assert.strictEqual(foldingController.regions.findRange(7), 2);
        assert.strictEqual(foldingController.regions.getEndLineNumber(2), 7);
      }
    );
  });
  test("Folding", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}],
        ["## header 2.1", "markdown", CellKind.Markup, [], {}],
        ["body 2", "markdown", CellKind.Markup, [], {}],
        ["body 3", "markdown", CellKind.Markup, [], {}],
        ["## header 2.2", "markdown", CellKind.Markup, [], {}],
        ["var e = 7;", "markdown", CellKind.Markup, [], {}]
      ],
      (editor, viewModel, ds) => {
        const foldingModel = ds.add(new FoldingModel());
        foldingModel.attachViewModel(viewModel);
        updateFoldingStateAtIndex(foldingModel, 0, true);
        viewModel.updateFoldingRanges(foldingModel.regions);
        assert.deepStrictEqual(viewModel.getHiddenRanges(), [
          { start: 1, end: 6 }
        ]);
      }
    );
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}],
        ["## header 2.1\n", "markdown", CellKind.Markup, [], {}],
        ["body 2", "markdown", CellKind.Markup, [], {}],
        ["body 3", "markdown", CellKind.Markup, [], {}],
        ["## header 2.2", "markdown", CellKind.Markup, [], {}],
        ["var e = 7;", "markdown", CellKind.Markup, [], {}]
      ],
      (editor, viewModel, ds) => {
        const foldingModel = ds.add(new FoldingModel());
        foldingModel.attachViewModel(viewModel);
        updateFoldingStateAtIndex(foldingModel, 2, true);
        viewModel.updateFoldingRanges(foldingModel.regions);
        assert.deepStrictEqual(viewModel.getHiddenRanges(), [
          { start: 3, end: 4 }
        ]);
      }
    );
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}],
        ["# header 2.1\n", "markdown", CellKind.Markup, [], {}],
        ["body 2", "markdown", CellKind.Markup, [], {}],
        ["body 3", "markdown", CellKind.Markup, [], {}],
        ["## header 2.2", "markdown", CellKind.Markup, [], {}],
        ["var e = 7;", "markdown", CellKind.Markup, [], {}]
      ],
      (editor, viewModel, ds) => {
        const foldingModel = ds.add(new FoldingModel());
        foldingModel.attachViewModel(viewModel);
        updateFoldingStateAtIndex(foldingModel, 2, true);
        viewModel.updateFoldingRanges(foldingModel.regions);
        assert.deepStrictEqual(viewModel.getHiddenRanges(), [
          { start: 3, end: 6 }
        ]);
      }
    );
  });
  test("Nested Folding", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}],
        ["# header 2.1\n", "markdown", CellKind.Markup, [], {}],
        ["body 2", "markdown", CellKind.Markup, [], {}],
        ["body 3", "markdown", CellKind.Markup, [], {}],
        ["## header 2.2", "markdown", CellKind.Markup, [], {}],
        ["var e = 7;", "markdown", CellKind.Markup, [], {}]
      ],
      (editor, viewModel, ds) => {
        const foldingModel = ds.add(new FoldingModel());
        foldingModel.attachViewModel(viewModel);
        updateFoldingStateAtIndex(foldingModel, 0, true);
        viewModel.updateFoldingRanges(foldingModel.regions);
        assert.deepStrictEqual(viewModel.getHiddenRanges(), [
          { start: 1, end: 1 }
        ]);
        updateFoldingStateAtIndex(foldingModel, 5, true);
        updateFoldingStateAtIndex(foldingModel, 2, true);
        viewModel.updateFoldingRanges(foldingModel.regions);
        assert.deepStrictEqual(viewModel.getHiddenRanges(), [
          { start: 1, end: 1 },
          { start: 3, end: 6 }
        ]);
        updateFoldingStateAtIndex(foldingModel, 2, false);
        viewModel.updateFoldingRanges(foldingModel.regions);
        assert.deepStrictEqual(viewModel.getHiddenRanges(), [
          { start: 1, end: 1 },
          { start: 6, end: 6 }
        ]);
      }
    );
  });
  test("Folding Memento", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}],
        ["# header 2.1\n", "markdown", CellKind.Markup, [], {}],
        ["body 2", "markdown", CellKind.Markup, [], {}],
        ["body 3", "markdown", CellKind.Markup, [], {}],
        ["## header 2.2", "markdown", CellKind.Markup, [], {}],
        ["var e = 7;", "markdown", CellKind.Markup, [], {}],
        ["# header 2.1\n", "markdown", CellKind.Markup, [], {}],
        ["body 2", "markdown", CellKind.Markup, [], {}],
        ["body 3", "markdown", CellKind.Markup, [], {}],
        ["## header 2.2", "markdown", CellKind.Markup, [], {}],
        ["var e = 7;", "markdown", CellKind.Markup, [], {}]
      ],
      (editor, viewModel, ds) => {
        const foldingModel = ds.add(new FoldingModel());
        foldingModel.attachViewModel(viewModel);
        foldingModel.applyMemento([{ start: 2, end: 6 }]);
        viewModel.updateFoldingRanges(foldingModel.regions);
        assert.deepStrictEqual(viewModel.getHiddenRanges(), [
          { start: 3, end: 6 }
        ]);
      }
    );
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}],
        ["# header 2.1\n", "markdown", CellKind.Markup, [], {}],
        ["body 2", "markdown", CellKind.Markup, [], {}],
        ["body 3", "markdown", CellKind.Markup, [], {}],
        ["## header 2.2", "markdown", CellKind.Markup, [], {}],
        ["var e = 7;", "markdown", CellKind.Markup, [], {}],
        ["# header 2.1\n", "markdown", CellKind.Markup, [], {}],
        ["body 2", "markdown", CellKind.Markup, [], {}],
        ["body 3", "markdown", CellKind.Markup, [], {}],
        ["## header 2.2", "markdown", CellKind.Markup, [], {}],
        ["var e = 7;", "markdown", CellKind.Markup, [], {}]
      ],
      (editor, viewModel, ds) => {
        const foldingModel = ds.add(new FoldingModel());
        foldingModel.attachViewModel(viewModel);
        foldingModel.applyMemento([
          { start: 5, end: 6 },
          { start: 10, end: 11 }
        ]);
        viewModel.updateFoldingRanges(foldingModel.regions);
        assert.deepStrictEqual(viewModel.getHiddenRanges(), [
          { start: 6, end: 6 },
          { start: 11, end: 11 }
        ]);
      }
    );
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}],
        ["# header 2.1\n", "markdown", CellKind.Markup, [], {}],
        ["body 2", "markdown", CellKind.Markup, [], {}],
        ["body 3", "markdown", CellKind.Markup, [], {}],
        ["## header 2.2", "markdown", CellKind.Markup, [], {}],
        ["var e = 7;", "markdown", CellKind.Markup, [], {}],
        ["# header 2.1\n", "markdown", CellKind.Markup, [], {}],
        ["body 2", "markdown", CellKind.Markup, [], {}],
        ["body 3", "markdown", CellKind.Markup, [], {}],
        ["## header 2.2", "markdown", CellKind.Markup, [], {}],
        ["var e = 7;", "markdown", CellKind.Markup, [], {}]
      ],
      (editor, viewModel, ds) => {
        const foldingModel = ds.add(new FoldingModel());
        foldingModel.attachViewModel(viewModel);
        foldingModel.applyMemento([
          { start: 5, end: 6 },
          { start: 7, end: 11 }
        ]);
        viewModel.updateFoldingRanges(foldingModel.regions);
        assert.deepStrictEqual(viewModel.getHiddenRanges(), [
          { start: 6, end: 6 },
          { start: 8, end: 11 }
        ]);
      }
    );
  });
  test("View Index", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}],
        ["# header 2.1\n", "markdown", CellKind.Markup, [], {}],
        ["body 2", "markdown", CellKind.Markup, [], {}],
        ["body 3", "markdown", CellKind.Markup, [], {}],
        ["## header 2.2", "markdown", CellKind.Markup, [], {}],
        ["var e = 7;", "markdown", CellKind.Markup, [], {}],
        ["# header 2.1\n", "markdown", CellKind.Markup, [], {}],
        ["body 2", "markdown", CellKind.Markup, [], {}],
        ["body 3", "markdown", CellKind.Markup, [], {}],
        ["## header 2.2", "markdown", CellKind.Markup, [], {}],
        ["var e = 7;", "markdown", CellKind.Markup, [], {}]
      ],
      (editor, viewModel, ds) => {
        const foldingModel = ds.add(new FoldingModel());
        foldingModel.attachViewModel(viewModel);
        foldingModel.applyMemento([{ start: 2, end: 6 }]);
        viewModel.updateFoldingRanges(foldingModel.regions);
        assert.deepStrictEqual(viewModel.getHiddenRanges(), [
          { start: 3, end: 6 }
        ]);
        assert.strictEqual(viewModel.getNextVisibleCellIndex(1), 2);
        assert.strictEqual(viewModel.getNextVisibleCellIndex(2), 7);
        assert.strictEqual(viewModel.getNextVisibleCellIndex(3), 7);
        assert.strictEqual(viewModel.getNextVisibleCellIndex(4), 7);
        assert.strictEqual(viewModel.getNextVisibleCellIndex(5), 7);
        assert.strictEqual(viewModel.getNextVisibleCellIndex(6), 7);
        assert.strictEqual(viewModel.getNextVisibleCellIndex(7), 8);
      }
    );
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}],
        ["# header 2.1\n", "markdown", CellKind.Markup, [], {}],
        ["body 2", "markdown", CellKind.Markup, [], {}],
        ["body 3", "markdown", CellKind.Markup, [], {}],
        ["## header 2.2", "markdown", CellKind.Markup, [], {}],
        ["var e = 7;", "markdown", CellKind.Markup, [], {}],
        ["# header 2.1\n", "markdown", CellKind.Markup, [], {}],
        ["body 2", "markdown", CellKind.Markup, [], {}],
        ["body 3", "markdown", CellKind.Markup, [], {}],
        ["## header 2.2", "markdown", CellKind.Markup, [], {}],
        ["var e = 7;", "markdown", CellKind.Markup, [], {}]
      ],
      (editor, viewModel, ds) => {
        const foldingModel = ds.add(new FoldingModel());
        foldingModel.attachViewModel(viewModel);
        foldingModel.applyMemento([
          { start: 5, end: 6 },
          { start: 10, end: 11 }
        ]);
        viewModel.updateFoldingRanges(foldingModel.regions);
        assert.deepStrictEqual(viewModel.getHiddenRanges(), [
          { start: 6, end: 6 },
          { start: 11, end: 11 }
        ]);
        assert.strictEqual(viewModel.getNextVisibleCellIndex(4), 5);
        assert.strictEqual(viewModel.getNextVisibleCellIndex(5), 7);
        assert.strictEqual(viewModel.getNextVisibleCellIndex(6), 7);
        assert.strictEqual(viewModel.getNextVisibleCellIndex(9), 10);
        assert.strictEqual(viewModel.getNextVisibleCellIndex(10), 12);
        assert.strictEqual(viewModel.getNextVisibleCellIndex(11), 12);
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFx0ZXN0XFxicm93c2VyXFxub3RlYm9va0ZvbGRpbmcudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENlbGxLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IHNldHVwSW5zdGFudGlhdGlvblNlcnZpY2UsIHdpdGhUZXN0Tm90ZWJvb2sgfSBmcm9tICcuL3Rlc3ROb3RlYm9va0VkaXRvci5qcyc7XG5pbXBvcnQgeyBJVW5kb1JlZG9TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvLmpzJztcbmltcG9ydCB7IEZvbGRpbmdNb2RlbCwgdXBkYXRlRm9sZGluZ1N0YXRlQXRJbmRleCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdmlld01vZGVsL2ZvbGRpbmdNb2RlbC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCdOb3RlYm9vayBGb2xkaW5nJywgKCkgPT4ge1xuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBzZXR1cEluc3RhbnRpYXRpb25TZXJ2aWNlKGRpc3Bvc2FibGVzKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zcHkoSVVuZG9SZWRvU2VydmljZSwgJ3B1c2hFbGVtZW50Jyk7XG5cdH0pO1xuXG5cblx0dGVzdCgnRm9sZGluZyBiYXNlZCBvbiBtYXJrZG93biBjZWxscycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnYm9keScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WycjIyBoZWFkZXIgMi4xJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ2JvZHkgMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wydib2R5IDMnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyMgaGVhZGVyIDIuMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgZSA9IDc7JywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdChlZGl0b3IsIHZpZXdNb2RlbCwgZHMpID0+IHtcblx0XHRcdFx0Y29uc3QgZm9sZGluZ0NvbnRyb2xsZXIgPSBkcy5hZGQobmV3IEZvbGRpbmdNb2RlbCgpKTtcblx0XHRcdFx0Zm9sZGluZ0NvbnRyb2xsZXIuYXR0YWNoVmlld01vZGVsKHZpZXdNb2RlbCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbGRpbmdDb250cm9sbGVyLnJlZ2lvbnMuZmluZFJhbmdlKDEpLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbGRpbmdDb250cm9sbGVyLnJlZ2lvbnMuZmluZFJhbmdlKDIpLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbGRpbmdDb250cm9sbGVyLnJlZ2lvbnMuZmluZFJhbmdlKDMpLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbGRpbmdDb250cm9sbGVyLnJlZ2lvbnMuZmluZFJhbmdlKDQpLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbGRpbmdDb250cm9sbGVyLnJlZ2lvbnMuZmluZFJhbmdlKDUpLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbGRpbmdDb250cm9sbGVyLnJlZ2lvbnMuZmluZFJhbmdlKDYpLCAyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvbGRpbmdDb250cm9sbGVyLnJlZ2lvbnMuZmluZFJhbmdlKDcpLCAyKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdGb2xkaW5nIG5vdCBiYXNlZCBvbiBjb2RlIGNlbGxzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wydib2R5JywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgY29tbWVudCAxJywgJ3B5dGhvbicsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsnYm9keSAyJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ2JvZHkgM1xcbmBgYFxcbiMjIGNvbW1lbnQgMlxcbmBgYCcsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wydib2R5IDQnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyMgaGVhZGVyIDIuMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgZSA9IDc7JywgJ3B5dGhvbicsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0KGVkaXRvciwgdmlld01vZGVsLCBkcykgPT4ge1xuXHRcdFx0XHRjb25zdCBmb2xkaW5nQ29udHJvbGxlciA9IGRzLmFkZChuZXcgRm9sZGluZ01vZGVsKCkpO1xuXHRcdFx0XHRmb2xkaW5nQ29udHJvbGxlci5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9sZGluZ0NvbnRyb2xsZXIucmVnaW9ucy5maW5kUmFuZ2UoMSksIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9sZGluZ0NvbnRyb2xsZXIucmVnaW9ucy5maW5kUmFuZ2UoMiksIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9sZGluZ0NvbnRyb2xsZXIucmVnaW9ucy5maW5kUmFuZ2UoMyksIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9sZGluZ0NvbnRyb2xsZXIucmVnaW9ucy5maW5kUmFuZ2UoNCksIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9sZGluZ0NvbnRyb2xsZXIucmVnaW9ucy5maW5kUmFuZ2UoNSksIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9sZGluZ0NvbnRyb2xsZXIucmVnaW9ucy5maW5kUmFuZ2UoNiksIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9sZGluZ0NvbnRyb2xsZXIucmVnaW9ucy5maW5kUmFuZ2UoNyksIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9sZGluZ0NvbnRyb2xsZXIucmVnaW9ucy5maW5kUmFuZ2UoOCksIDEpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1RvcCBsZXZlbCBoZWFkZXIgaW4gYSBjZWxsIHdpbnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciAxJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ2JvZHknLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyMgaGVhZGVyIDIuMVxcbiMgaGVhZGVyMycsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wydib2R5IDInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnYm9keSAzJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJyMjIGhlYWRlciAyLjInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGUgPSA3OycsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHQoZWRpdG9yLCB2aWV3TW9kZWwsIGRzKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZvbGRpbmdDb250cm9sbGVyID0gZHMuYWRkKG5ldyBGb2xkaW5nTW9kZWwoKSk7XG5cdFx0XHRcdGZvbGRpbmdDb250cm9sbGVyLmF0dGFjaFZpZXdNb2RlbCh2aWV3TW9kZWwpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb2xkaW5nQ29udHJvbGxlci5yZWdpb25zLmZpbmRSYW5nZSgxKSwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb2xkaW5nQ29udHJvbGxlci5yZWdpb25zLmZpbmRSYW5nZSgyKSwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb2xkaW5nQ29udHJvbGxlci5yZWdpb25zLmdldEVuZExpbmVOdW1iZXIoMCksIDIpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb2xkaW5nQ29udHJvbGxlci5yZWdpb25zLmZpbmRSYW5nZSgzKSwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb2xkaW5nQ29udHJvbGxlci5yZWdpb25zLmZpbmRSYW5nZSg0KSwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb2xkaW5nQ29udHJvbGxlci5yZWdpb25zLmZpbmRSYW5nZSg1KSwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb2xkaW5nQ29udHJvbGxlci5yZWdpb25zLmdldEVuZExpbmVOdW1iZXIoMSksIDcpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb2xkaW5nQ29udHJvbGxlci5yZWdpb25zLmZpbmRSYW5nZSg2KSwgMik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb2xkaW5nQ29udHJvbGxlci5yZWdpb25zLmZpbmRSYW5nZSg3KSwgMik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb2xkaW5nQ29udHJvbGxlci5yZWdpb25zLmdldEVuZExpbmVOdW1iZXIoMiksIDcpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZvbGRpbmcnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciAxJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ2JvZHknLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyMgaGVhZGVyIDIuMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wydib2R5IDInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnYm9keSAzJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJyMjIGhlYWRlciAyLjInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGUgPSA3OycsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHQoZWRpdG9yLCB2aWV3TW9kZWwsIGRzKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZvbGRpbmdNb2RlbCA9IGRzLmFkZChuZXcgRm9sZGluZ01vZGVsKCkpO1xuXHRcdFx0XHRmb2xkaW5nTW9kZWwuYXR0YWNoVmlld01vZGVsKHZpZXdNb2RlbCk7XG5cdFx0XHRcdHVwZGF0ZUZvbGRpbmdTdGF0ZUF0SW5kZXgoZm9sZGluZ01vZGVsLCAwLCB0cnVlKTtcblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZUZvbGRpbmdSYW5nZXMoZm9sZGluZ01vZGVsLnJlZ2lvbnMpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRIaWRkZW5SYW5nZXMoKSwgW1xuXHRcdFx0XHRcdHsgc3RhcnQ6IDEsIGVuZDogNiB9XG5cdFx0XHRcdF0pO1xuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnYm9keScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WycjIyBoZWFkZXIgMi4xXFxuJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ2JvZHkgMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wydib2R5IDMnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyMgaGVhZGVyIDIuMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgZSA9IDc7JywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdChlZGl0b3IsIHZpZXdNb2RlbCwgZHMpID0+IHtcblx0XHRcdFx0Y29uc3QgZm9sZGluZ01vZGVsID0gZHMuYWRkKG5ldyBGb2xkaW5nTW9kZWwoKSk7XG5cdFx0XHRcdGZvbGRpbmdNb2RlbC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblx0XHRcdFx0dXBkYXRlRm9sZGluZ1N0YXRlQXRJbmRleChmb2xkaW5nTW9kZWwsIDIsIHRydWUpO1xuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlRm9sZGluZ1Jhbmdlcyhmb2xkaW5nTW9kZWwucmVnaW9ucyk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0SGlkZGVuUmFuZ2VzKCksIFtcblx0XHRcdFx0XHR7IHN0YXJ0OiAzLCBlbmQ6IDQgfVxuXHRcdFx0XHRdKTtcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciAxJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ2JvZHknLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgMi4xXFxuJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ2JvZHkgMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wydib2R5IDMnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyMgaGVhZGVyIDIuMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgZSA9IDc7JywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdChlZGl0b3IsIHZpZXdNb2RlbCwgZHMpID0+IHtcblx0XHRcdFx0Y29uc3QgZm9sZGluZ01vZGVsID0gZHMuYWRkKG5ldyBGb2xkaW5nTW9kZWwoKSk7XG5cdFx0XHRcdGZvbGRpbmdNb2RlbC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblx0XHRcdFx0dXBkYXRlRm9sZGluZ1N0YXRlQXRJbmRleChmb2xkaW5nTW9kZWwsIDIsIHRydWUpO1xuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlRm9sZGluZ1Jhbmdlcyhmb2xkaW5nTW9kZWwucmVnaW9ucyk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0SGlkZGVuUmFuZ2VzKCksIFtcblx0XHRcdFx0XHR7IHN0YXJ0OiAzLCBlbmQ6IDYgfVxuXHRcdFx0XHRdKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdOZXN0ZWQgRm9sZGluZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnYm9keScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciAyLjFcXG4nLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnYm9keSAyJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ2JvZHkgMycsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WycjIyBoZWFkZXIgMi4yJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBlID0gNzsnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0KGVkaXRvciwgdmlld01vZGVsLCBkcykgPT4ge1xuXHRcdFx0XHRjb25zdCBmb2xkaW5nTW9kZWwgPSBkcy5hZGQobmV3IEZvbGRpbmdNb2RlbCgpKTtcblx0XHRcdFx0Zm9sZGluZ01vZGVsLmF0dGFjaFZpZXdNb2RlbCh2aWV3TW9kZWwpO1xuXHRcdFx0XHR1cGRhdGVGb2xkaW5nU3RhdGVBdEluZGV4KGZvbGRpbmdNb2RlbCwgMCwgdHJ1ZSk7XG5cdFx0XHRcdHZpZXdNb2RlbC51cGRhdGVGb2xkaW5nUmFuZ2VzKGZvbGRpbmdNb2RlbC5yZWdpb25zKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRIaWRkZW5SYW5nZXMoKSwgW1xuXHRcdFx0XHRcdHsgc3RhcnQ6IDEsIGVuZDogMSB9XG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdHVwZGF0ZUZvbGRpbmdTdGF0ZUF0SW5kZXgoZm9sZGluZ01vZGVsLCA1LCB0cnVlKTtcblx0XHRcdFx0dXBkYXRlRm9sZGluZ1N0YXRlQXRJbmRleChmb2xkaW5nTW9kZWwsIDIsIHRydWUpO1xuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlRm9sZGluZ1Jhbmdlcyhmb2xkaW5nTW9kZWwucmVnaW9ucyk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0SGlkZGVuUmFuZ2VzKCksIFtcblx0XHRcdFx0XHR7IHN0YXJ0OiAxLCBlbmQ6IDEgfSxcblx0XHRcdFx0XHR7IHN0YXJ0OiAzLCBlbmQ6IDYgfVxuXHRcdFx0XHRdKTtcblxuXHRcdFx0XHR1cGRhdGVGb2xkaW5nU3RhdGVBdEluZGV4KGZvbGRpbmdNb2RlbCwgMiwgZmFsc2UpO1xuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlRm9sZGluZ1Jhbmdlcyhmb2xkaW5nTW9kZWwucmVnaW9ucyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldEhpZGRlblJhbmdlcygpLCBbXG5cdFx0XHRcdFx0eyBzdGFydDogMSwgZW5kOiAxIH0sXG5cdFx0XHRcdFx0eyBzdGFydDogNiwgZW5kOiA2IH1cblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0Ly8gdmlld01vZGVsLmluc2VydENlbGwoNywgbmV3IFRlc3RDZWxsKHZpZXdNb2RlbC52aWV3VHlwZSwgNywgWyd2YXIgYyA9IDg7J10sICdtYXJrZG93bicsIENlbGxLaW5kLkNvZGUsIFtdKSwgdHJ1ZSk7XG5cblx0XHRcdFx0Ly8gYXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0SGlkZGVuUmFuZ2VzKCksIFtcblx0XHRcdFx0Ly8gXHR7IHN0YXJ0OiAxLCBlbmQ6IDEgfSxcblx0XHRcdFx0Ly8gXHR7IHN0YXJ0OiA2LCBlbmQ6IDcgfVxuXHRcdFx0XHQvLyBdKTtcblxuXHRcdFx0XHQvLyB2aWV3TW9kZWwuaW5zZXJ0Q2VsbCgxLCBuZXcgVGVzdENlbGwodmlld01vZGVsLnZpZXdUeXBlLCA4LCBbJ3ZhciBjID0gOTsnXSwgJ21hcmtkb3duJywgQ2VsbEtpbmQuQ29kZSwgW10pLCB0cnVlKTtcblx0XHRcdFx0Ly8gYXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0SGlkZGVuUmFuZ2VzKCksIFtcblx0XHRcdFx0Ly8gXHQvLyB0aGUgZmlyc3QgY29sbGFwc2VkIHJhbmdlIGlzIG5vdyBleHBhbmRlZCBhcyB3ZSBpbnNlcnQgY29udGVudCBpbnRvIGl0LlxuXHRcdFx0XHQvLyBcdC8vIHsgc3RhcnQ6IDEsfSxcblx0XHRcdFx0Ly8gXHR7IHN0YXJ0OiA3LCBlbmQ6IDggfVxuXHRcdFx0XHQvLyBdKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdGb2xkaW5nIE1lbWVudG8nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciAxJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ2JvZHknLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgMi4xXFxuJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ2JvZHkgMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wydib2R5IDMnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyMgaGVhZGVyIDIuMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgZSA9IDc7JywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIDIuMVxcbicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wydib2R5IDInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnYm9keSAzJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJyMjIGhlYWRlciAyLjInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGUgPSA3OycsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHQoZWRpdG9yLCB2aWV3TW9kZWwsIGRzKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZvbGRpbmdNb2RlbCA9IGRzLmFkZChuZXcgRm9sZGluZ01vZGVsKCkpO1xuXHRcdFx0XHRmb2xkaW5nTW9kZWwuYXR0YWNoVmlld01vZGVsKHZpZXdNb2RlbCk7XG5cdFx0XHRcdGZvbGRpbmdNb2RlbC5hcHBseU1lbWVudG8oW3sgc3RhcnQ6IDIsIGVuZDogNiB9XSk7XG5cdFx0XHRcdHZpZXdNb2RlbC51cGRhdGVGb2xkaW5nUmFuZ2VzKGZvbGRpbmdNb2RlbC5yZWdpb25zKTtcblxuXHRcdFx0XHQvLyBOb3RlIHRoYXQgaGlkZGVuIHJhbmdlcyAhPT0gZm9sZGluZyByYW5nZXNcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0SGlkZGVuUmFuZ2VzKCksIFtcblx0XHRcdFx0XHR7IHN0YXJ0OiAzLCBlbmQ6IDYgfVxuXHRcdFx0XHRdKTtcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciAxJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ2JvZHknLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgMi4xXFxuJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ2JvZHkgMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wydib2R5IDMnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyMgaGVhZGVyIDIuMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgZSA9IDc7JywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIDIuMVxcbicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wydib2R5IDInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnYm9keSAzJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJyMjIGhlYWRlciAyLjInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGUgPSA3OycsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHQoZWRpdG9yLCB2aWV3TW9kZWwsIGRzKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZvbGRpbmdNb2RlbCA9IGRzLmFkZChuZXcgRm9sZGluZ01vZGVsKCkpO1xuXHRcdFx0XHRmb2xkaW5nTW9kZWwuYXR0YWNoVmlld01vZGVsKHZpZXdNb2RlbCk7XG5cdFx0XHRcdGZvbGRpbmdNb2RlbC5hcHBseU1lbWVudG8oW1xuXHRcdFx0XHRcdHsgc3RhcnQ6IDUsIGVuZDogNiB9LFxuXHRcdFx0XHRcdHsgc3RhcnQ6IDEwLCBlbmQ6IDExIH0sXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlRm9sZGluZ1Jhbmdlcyhmb2xkaW5nTW9kZWwucmVnaW9ucyk7XG5cblx0XHRcdFx0Ly8gTm90ZSB0aGF0IGhpZGRlbiByYW5nZXMgIT09IGZvbGRpbmcgcmFuZ2VzXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldEhpZGRlblJhbmdlcygpLCBbXG5cdFx0XHRcdFx0eyBzdGFydDogNiwgZW5kOiA2IH0sXG5cdFx0XHRcdFx0eyBzdGFydDogMTEsIGVuZDogMTEgfVxuXHRcdFx0XHRdKTtcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciAxJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ2JvZHknLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgMi4xXFxuJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ2JvZHkgMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wydib2R5IDMnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyMgaGVhZGVyIDIuMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgZSA9IDc7JywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIDIuMVxcbicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wydib2R5IDInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnYm9keSAzJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJyMjIGhlYWRlciAyLjInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGUgPSA3OycsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHQoZWRpdG9yLCB2aWV3TW9kZWwsIGRzKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZvbGRpbmdNb2RlbCA9IGRzLmFkZChuZXcgRm9sZGluZ01vZGVsKCkpO1xuXHRcdFx0XHRmb2xkaW5nTW9kZWwuYXR0YWNoVmlld01vZGVsKHZpZXdNb2RlbCk7XG5cdFx0XHRcdGZvbGRpbmdNb2RlbC5hcHBseU1lbWVudG8oW1xuXHRcdFx0XHRcdHsgc3RhcnQ6IDUsIGVuZDogNiB9LFxuXHRcdFx0XHRcdHsgc3RhcnQ6IDcsIGVuZDogMTEgfSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdHZpZXdNb2RlbC51cGRhdGVGb2xkaW5nUmFuZ2VzKGZvbGRpbmdNb2RlbC5yZWdpb25zKTtcblxuXHRcdFx0XHQvLyBOb3RlIHRoYXQgaGlkZGVuIHJhbmdlcyAhPT0gZm9sZGluZyByYW5nZXNcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0SGlkZGVuUmFuZ2VzKCksIFtcblx0XHRcdFx0XHR7IHN0YXJ0OiA2LCBlbmQ6IDYgfSxcblx0XHRcdFx0XHR7IHN0YXJ0OiA4LCBlbmQ6IDExIH1cblx0XHRcdFx0XSk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnVmlldyBJbmRleCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnYm9keScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciAyLjFcXG4nLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnYm9keSAyJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ2JvZHkgMycsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WycjIyBoZWFkZXIgMi4yJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBlID0gNzsnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgMi4xXFxuJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ2JvZHkgMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wydib2R5IDMnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyMgaGVhZGVyIDIuMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgZSA9IDc7JywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdChlZGl0b3IsIHZpZXdNb2RlbCwgZHMpID0+IHtcblx0XHRcdFx0Y29uc3QgZm9sZGluZ01vZGVsID0gZHMuYWRkKG5ldyBGb2xkaW5nTW9kZWwoKSk7XG5cdFx0XHRcdGZvbGRpbmdNb2RlbC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblx0XHRcdFx0Zm9sZGluZ01vZGVsLmFwcGx5TWVtZW50byhbeyBzdGFydDogMiwgZW5kOiA2IH1dKTtcblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZUZvbGRpbmdSYW5nZXMoZm9sZGluZ01vZGVsLnJlZ2lvbnMpO1xuXG5cdFx0XHRcdC8vIE5vdGUgdGhhdCBoaWRkZW4gcmFuZ2VzICE9PSBmb2xkaW5nIHJhbmdlc1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRIaWRkZW5SYW5nZXMoKSwgW1xuXHRcdFx0XHRcdHsgc3RhcnQ6IDMsIGVuZDogNiB9XG5cdFx0XHRcdF0pO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0TmV4dFZpc2libGVDZWxsSW5kZXgoMSksIDIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldE5leHRWaXNpYmxlQ2VsbEluZGV4KDIpLCA3KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXROZXh0VmlzaWJsZUNlbGxJbmRleCgzKSwgNyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0TmV4dFZpc2libGVDZWxsSW5kZXgoNCksIDcpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldE5leHRWaXNpYmxlQ2VsbEluZGV4KDUpLCA3KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXROZXh0VmlzaWJsZUNlbGxJbmRleCg2KSwgNyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0TmV4dFZpc2libGVDZWxsSW5kZXgoNyksIDgpO1xuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnYm9keScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciAyLjFcXG4nLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnYm9keSAyJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ2JvZHkgMycsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WycjIyBoZWFkZXIgMi4yJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBlID0gNzsnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgMi4xXFxuJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ2JvZHkgMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wydib2R5IDMnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyMgaGVhZGVyIDIuMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgZSA9IDc7JywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdChlZGl0b3IsIHZpZXdNb2RlbCwgZHMpID0+IHtcblx0XHRcdFx0Y29uc3QgZm9sZGluZ01vZGVsID0gZHMuYWRkKG5ldyBGb2xkaW5nTW9kZWwoKSk7XG5cdFx0XHRcdGZvbGRpbmdNb2RlbC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblx0XHRcdFx0Zm9sZGluZ01vZGVsLmFwcGx5TWVtZW50byhbXG5cdFx0XHRcdFx0eyBzdGFydDogNSwgZW5kOiA2IH0sXG5cdFx0XHRcdFx0eyBzdGFydDogMTAsIGVuZDogMTEgfSxcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZUZvbGRpbmdSYW5nZXMoZm9sZGluZ01vZGVsLnJlZ2lvbnMpO1xuXG5cdFx0XHRcdC8vIE5vdGUgdGhhdCBoaWRkZW4gcmFuZ2VzICE9PSBmb2xkaW5nIHJhbmdlc1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRIaWRkZW5SYW5nZXMoKSwgW1xuXHRcdFx0XHRcdHsgc3RhcnQ6IDYsIGVuZDogNiB9LFxuXHRcdFx0XHRcdHsgc3RhcnQ6IDExLCBlbmQ6IDExIH1cblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0Ly8gZm9sZGluZyByYW5nZXNcblx0XHRcdFx0Ly8gWzUsIDZdXG5cdFx0XHRcdC8vIFsxMCwgMTFdXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0TmV4dFZpc2libGVDZWxsSW5kZXgoNCksIDUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldE5leHRWaXNpYmxlQ2VsbEluZGV4KDUpLCA3KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXROZXh0VmlzaWJsZUNlbGxJbmRleCg2KSwgNyk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXROZXh0VmlzaWJsZUNlbGxJbmRleCg5KSwgMTApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldE5leHRWaXNpYmxlQ2VsbEluZGV4KDEwKSwgMTIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldE5leHRWaXNpYmxlQ2VsbEluZGV4KDExKSwgMTIpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBMkIsd0JBQXdCO0FBQzVELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsY0FBYyxpQ0FBaUM7QUFDeEQsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxvQkFBb0IsTUFBTTtBQUMvQixNQUFJO0FBQ0osTUFBSTtBQUVKLFdBQVMsTUFBTSxZQUFZLFFBQVEsQ0FBQztBQUVwQywwQ0FBd0M7QUFFeEMsUUFBTSxNQUFNO0FBQ1gsa0JBQWMsSUFBSSxnQkFBZ0I7QUFDbEMsMkJBQXVCLDBCQUEwQixXQUFXO0FBQzVELHlCQUFxQixJQUFJLGtCQUFrQixhQUFhO0FBQUEsRUFDekQsQ0FBQztBQUdELE9BQUssbUNBQW1DLGlCQUFrQjtBQUN6RCxVQUFNO0FBQUEsTUFDTDtBQUFBLFFBQ0MsQ0FBQyxjQUFjLFlBQVksU0FBUyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxRQUNsRCxDQUFDLFFBQVEsWUFBWSxTQUFTLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLFFBQzVDLENBQUMsaUJBQWlCLFlBQVksU0FBUyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxRQUNyRCxDQUFDLFVBQVUsWUFBWSxTQUFTLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLFFBQzlDLENBQUMsVUFBVSxZQUFZLFNBQVMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsUUFDOUMsQ0FBQyxpQkFBaUIsWUFBWSxTQUFTLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLFFBQ3JELENBQUMsY0FBYyxZQUFZLFNBQVMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDbkQ7QUFBQSxNQUNBLENBQUMsUUFBUSxXQUFXLE9BQU87QUFDMUIs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
