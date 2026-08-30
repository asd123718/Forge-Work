import assert from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { IBulkEditService } from "../../../../../editor/browser/services/bulkEditService.js";
import { TrackedRangeStickiness } from "../../../../../editor/common/model.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { TestThemeService } from "../../../../../platform/theme/test/common/testThemeService.js";
import { IUndoRedoService } from "../../../../../platform/undoRedo/common/undoRedo.js";
import { insertCellAtIndex, runDeleteAction } from "../../browser/controller/cellOperations.js";
import { NotebookEventDispatcher } from "../../browser/viewModel/eventDispatcher.js";
import { NotebookViewModel } from "../../browser/viewModel/notebookViewModelImpl.js";
import { ViewContext } from "../../browser/viewModel/viewContext.js";
import { NotebookTextModel } from "../../common/model/notebookTextModel.js";
import { CellKind, diff } from "../../common/notebookCommon.js";
import { NotebookOptions } from "../../browser/notebookOptions.js";
import { NotebookEditorTestModel, setupInstantiationService, withTestNotebook } from "./testNotebookEditor.js";
import { INotebookExecutionStateService } from "../../common/notebookExecutionStateService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { mainWindow } from "../../../../../base/browser/window.js";
import { ICodeEditorService } from "../../../../../editor/browser/services/codeEditorService.js";
import { ILanguageDetectionService } from "../../../../services/languageDetection/common/languageDetectionWorkerService.js";
import { INotebookLoggingService } from "../../common/notebookLoggingService.js";
suite("NotebookViewModel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  let disposables;
  let instantiationService;
  let textModelService;
  let bulkEditService;
  let undoRedoService;
  let modelService;
  let languageService;
  let languageDetectionService;
  let notebookExecutionStateService;
  let notebookLogger;
  suiteSetup(() => {
    disposables = new DisposableStore();
    instantiationService = setupInstantiationService(disposables);
    textModelService = instantiationService.get(ITextModelService);
    bulkEditService = instantiationService.get(IBulkEditService);
    undoRedoService = instantiationService.get(IUndoRedoService);
    modelService = instantiationService.get(IModelService);
    languageService = instantiationService.get(ILanguageService);
    languageDetectionService = instantiationService.get(ILanguageDetectionService);
    notebookExecutionStateService = instantiationService.get(INotebookExecutionStateService);
    notebookLogger = instantiationService.get(INotebookLoggingService);
    instantiationService.stub(IConfigurationService, new TestConfigurationService());
    instantiationService.stub(IThemeService, new TestThemeService());
  });
  suiteTeardown(() => disposables.dispose());
  test("ctor", function() {
    const notebook = new NotebookTextModel("notebook", URI.parse("test"), [], {}, { transientCellMetadata: {}, transientDocumentMetadata: {}, transientOutputs: false, cellContentMetadata: {} }, undoRedoService, modelService, languageService, languageDetectionService, notebookExecutionStateService, notebookLogger);
    const model = new NotebookEditorTestModel(notebook);
    const options = new NotebookOptions(mainWindow, false, void 0, instantiationService.get(IConfigurationService), instantiationService.get(INotebookExecutionStateService), instantiationService.get(ICodeEditorService));
    const eventDispatcher = new NotebookEventDispatcher();
    const viewContext = new ViewContext(options, eventDispatcher, () => ({}));
    const viewModel = new NotebookViewModel("notebook", model.notebook, viewContext, null, { isReadOnly: false }, instantiationService, bulkEditService, undoRedoService, textModelService, notebookExecutionStateService);
    assert.strictEqual(viewModel.viewType, "notebook");
    notebook.dispose();
    model.dispose();
    options.dispose();
    eventDispatcher.dispose();
    viewModel.dispose();
  });
  test("insert/delete", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}]
      ],
      (editor, viewModel) => {
        const cell = insertCellAtIndex(viewModel, 1, "var c = 3", "javascript", CellKind.Code, {}, [], true, true);
        assert.strictEqual(viewModel.length, 3);
        assert.strictEqual(viewModel.notebookDocument.cells.length, 3);
        assert.strictEqual(viewModel.getCellIndex(cell), 1);
        runDeleteAction(editor, viewModel.cellAt(1));
        assert.strictEqual(viewModel.length, 2);
        assert.strictEqual(viewModel.notebookDocument.cells.length, 2);
        assert.strictEqual(viewModel.getCellIndex(cell), -1);
        cell.dispose();
        cell.model.dispose();
      }
    );
  });
  test("deleted cells are removed from the disposable store", async function() {
    const getDisposeCallCount = await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}]
      ],
      (editor, viewModel) => {
        const cell = insertCellAtIndex(viewModel, 1, "var c = 3", "javascript", CellKind.Code, {}, [], true, true);
        const originalDispose = cell.dispose.bind(cell);
        let disposeCallCount = 0;
        cell.dispose = () => {
          disposeCallCount++;
          originalDispose();
        };
        runDeleteAction(editor, cell);
        assert.strictEqual(disposeCallCount, 1);
        cell.model.dispose();
        return () => disposeCallCount;
      }
    );
    assert.strictEqual(getDisposeCallCount(), 1);
  });
  test("index", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}]
      ],
      (editor, viewModel) => {
        const firstViewCell = viewModel.cellAt(0);
        const lastViewCell = viewModel.cellAt(viewModel.length - 1);
        const insertIndex = viewModel.getCellIndex(firstViewCell) + 1;
        const cell = insertCellAtIndex(viewModel, insertIndex, "var c = 3;", "javascript", CellKind.Code, {}, [], true, true);
        const addedCellIndex = viewModel.getCellIndex(cell);
        runDeleteAction(editor, viewModel.cellAt(addedCellIndex));
        const secondInsertIndex = viewModel.getCellIndex(lastViewCell) + 1;
        const cell2 = insertCellAtIndex(viewModel, secondInsertIndex, "var d = 4;", "javascript", CellKind.Code, {}, [], true, true);
        assert.strictEqual(viewModel.length, 3);
        assert.strictEqual(viewModel.notebookDocument.cells.length, 3);
        assert.strictEqual(viewModel.getCellIndex(cell2), 2);
        cell.dispose();
        cell.model.dispose();
        cell2.dispose();
        cell2.model.dispose();
      }
    );
  });
});
function getVisibleCells(cells, hiddenRanges) {
  if (!hiddenRanges.length) {
    return cells;
  }
  let start = 0;
  let hiddenRangeIndex = 0;
  const result = [];
  while (start < cells.length && hiddenRangeIndex < hiddenRanges.length) {
    if (start < hiddenRanges[hiddenRangeIndex].start) {
      result.push(...cells.slice(start, hiddenRanges[hiddenRangeIndex].start));
    }
    start = hiddenRanges[hiddenRangeIndex].end + 1;
    hiddenRangeIndex++;
  }
  if (start < cells.length) {
    result.push(...cells.slice(start));
  }
  return result;
}
suite("NotebookViewModel Decorations", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("tracking range", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}],
        ["var d = 4;", "javascript", CellKind.Code, [], {}],
        ["var e = 5;", "javascript", CellKind.Code, [], {}]
      ],
      (editor, viewModel) => {
        const trackedId = viewModel.setTrackedRange("test", { start: 1, end: 2 }, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter);
        assert.deepStrictEqual(viewModel.getTrackedRange(trackedId), {
          start: 1,
          end: 2
        });
        const cell1 = insertCellAtIndex(viewModel, 0, "var d = 6;", "javascript", CellKind.Code, {}, [], true, true);
        assert.deepStrictEqual(viewModel.getTrackedRange(trackedId), {
          start: 2,
          end: 3
        });
        runDeleteAction(editor, viewModel.cellAt(0));
        assert.deepStrictEqual(viewModel.getTrackedRange(trackedId), {
          start: 1,
          end: 2
        });
        const cell2 = insertCellAtIndex(viewModel, 3, "var d = 7;", "javascript", CellKind.Code, {}, [], true, true);
        assert.deepStrictEqual(viewModel.getTrackedRange(trackedId), {
          start: 1,
          end: 3
        });
        runDeleteAction(editor, viewModel.cellAt(3));
        assert.deepStrictEqual(viewModel.getTrackedRange(trackedId), {
          start: 1,
          end: 2
        });
        runDeleteAction(editor, viewModel.cellAt(1));
        assert.deepStrictEqual(viewModel.getTrackedRange(trackedId), {
          start: 0,
          end: 1
        });
        cell1.dispose();
        cell1.model.dispose();
        cell2.dispose();
        cell2.model.dispose();
      }
    );
  });
  test("tracking range 2", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}],
        ["var d = 4;", "javascript", CellKind.Code, [], {}],
        ["var e = 5;", "javascript", CellKind.Code, [], {}],
        ["var e = 6;", "javascript", CellKind.Code, [], {}],
        ["var e = 7;", "javascript", CellKind.Code, [], {}]
      ],
      (editor, viewModel) => {
        const trackedId = viewModel.setTrackedRange("test", { start: 1, end: 3 }, TrackedRangeStickiness.GrowsOnlyWhenTypingAfter);
        assert.deepStrictEqual(viewModel.getTrackedRange(trackedId), {
          start: 1,
          end: 3
        });
        insertCellAtIndex(viewModel, 5, "var d = 9;", "javascript", CellKind.Code, {}, [], true, true);
        assert.deepStrictEqual(viewModel.getTrackedRange(trackedId), {
          start: 1,
          end: 3
        });
        insertCellAtIndex(viewModel, 4, "var d = 10;", "javascript", CellKind.Code, {}, [], true, true);
        assert.deepStrictEqual(viewModel.getTrackedRange(trackedId), {
          start: 1,
          end: 4
        });
      }
    );
  });
  test("diff hidden ranges", async function() {
    assert.deepStrictEqual(getVisibleCells([1, 2, 3, 4, 5], []), [1, 2, 3, 4, 5]);
    assert.deepStrictEqual(
      getVisibleCells(
        [1, 2, 3, 4, 5],
        [{ start: 1, end: 2 }]
      ),
      [1, 4, 5]
    );
    assert.deepStrictEqual(
      getVisibleCells(
        [1, 2, 3, 4, 5, 6, 7, 8, 9],
        [
          { start: 1, end: 2 },
          { start: 4, end: 5 }
        ]
      ),
      [1, 4, 7, 8, 9]
    );
    const original = getVisibleCells(
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      [
        { start: 1, end: 2 },
        { start: 4, end: 5 }
      ]
    );
    const modified = getVisibleCells(
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
      [
        { start: 2, end: 4 }
      ]
    );
    assert.deepStrictEqual(diff(original, modified, (a) => {
      return original.indexOf(a) >= 0;
    }), [{ start: 1, deleteCount: 1, toInsert: [2, 6] }]);
  });
});
suite("NotebookViewModel API", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("#115432, get nearest code cell", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["b = 2;", "python", CellKind.Code, [], {}],
        ["var c = 3", "javascript", CellKind.Code, [], {}],
        ["# header d", "markdown", CellKind.Markup, [], {}],
        ["var e = 4;", "TypeScript", CellKind.Code, [], {}],
        ["# header f", "markdown", CellKind.Markup, [], {}]
      ],
      (editor, viewModel) => {
        assert.strictEqual(viewModel.nearestCodeCellIndex(0), 1);
        assert.strictEqual(viewModel.nearestCodeCellIndex(2), 1);
        assert.strictEqual(viewModel.nearestCodeCellIndex(4), 3);
        assert.strictEqual(viewModel.nearestCodeCellIndex(5), 4);
        assert.strictEqual(viewModel.nearestCodeCellIndex(6), 4);
      }
    );
  });
  test("#108464, get nearest code cell", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}]
      ],
      (editor, viewModel) => {
        assert.strictEqual(viewModel.nearestCodeCellIndex(2), 1);
      }
    );
  });
  test("getCells", async () => {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}]
      ],
      (editor, viewModel) => {
        assert.strictEqual(viewModel.getCellsInRange().length, 3);
        assert.deepStrictEqual(viewModel.getCellsInRange({ start: 0, end: 1 }).map((cell) => cell.getText()), ["# header a"]);
        assert.deepStrictEqual(viewModel.getCellsInRange({ start: 0, end: 2 }).map((cell) => cell.getText()), ["# header a", "var b = 1;"]);
        assert.deepStrictEqual(viewModel.getCellsInRange({ start: 0, end: 3 }).map((cell) => cell.getText()), ["# header a", "var b = 1;", "# header b"]);
        assert.deepStrictEqual(viewModel.getCellsInRange({ start: 0, end: 4 }).map((cell) => cell.getText()), ["# header a", "var b = 1;", "# header b"]);
        assert.deepStrictEqual(viewModel.getCellsInRange({ start: 1, end: 4 }).map((cell) => cell.getText()), ["var b = 1;", "# header b"]);
        assert.deepStrictEqual(viewModel.getCellsInRange({ start: 2, end: 4 }).map((cell) => cell.getText()), ["# header b"]);
        assert.deepStrictEqual(viewModel.getCellsInRange({ start: 3, end: 4 }).map((cell) => cell.getText()), []);
        assert.deepStrictEqual(viewModel.getCellsInRange({ start: -1, end: 1 }).map((cell) => cell.getText()), ["# header a"]);
        assert.deepStrictEqual(viewModel.getCellsInRange({ start: 3, end: 0 }).map((cell) => cell.getText()), ["# header a", "var b = 1;", "# header b"]);
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFx0ZXN0XFxicm93c2VyXFxub3RlYm9va1ZpZXdNb2RlbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQnVsa0VkaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvc2VydmljZXMvYnVsa0VkaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdFRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL3Rlc3QvY29tbW9uL3Rlc3RUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVVuZG9SZWRvU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VuZG9SZWRvL2NvbW1vbi91bmRvUmVkby5qcyc7XG5pbXBvcnQgeyBpbnNlcnRDZWxsQXRJbmRleCwgcnVuRGVsZXRlQWN0aW9uIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9jb250cm9sbGVyL2NlbGxPcGVyYXRpb25zLmpzJztcbmltcG9ydCB7IE5vdGVib29rRXZlbnREaXNwYXRjaGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci92aWV3TW9kZWwvZXZlbnREaXNwYXRjaGVyLmpzJztcbmltcG9ydCB7IE5vdGVib29rVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci92aWV3TW9kZWwvbm90ZWJvb2tWaWV3TW9kZWxJbXBsLmpzJztcbmltcG9ydCB7IFZpZXdDb250ZXh0IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci92aWV3TW9kZWwvdmlld0NvbnRleHQuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvbm90ZWJvb2tUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbEtpbmQsIGRpZmYgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tPcHRpb25zIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9ub3RlYm9va09wdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNlbGxSYW5nZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va1JhbmdlLmpzJztcbmltcG9ydCB7IE5vdGVib29rRWRpdG9yVGVzdE1vZGVsLCBzZXR1cEluc3RhbnRpYXRpb25TZXJ2aWNlLCB3aXRoVGVzdE5vdGVib29rIH0gZnJvbSAnLi90ZXN0Tm90ZWJvb2tFZGl0b3IuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElCYXNlQ2VsbEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi9icm93c2VyL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZURldGVjdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9sYW5ndWFnZURldGVjdGlvbi9jb21tb24vbGFuZ3VhZ2VEZXRlY3Rpb25Xb3JrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0xvZ2dpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rTG9nZ2luZ1NlcnZpY2UuanMnO1xuXG5zdWl0ZSgnTm90ZWJvb2tWaWV3TW9kZWwnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlO1xuXHRsZXQgYnVsa0VkaXRTZXJ2aWNlOiBJQnVsa0VkaXRTZXJ2aWNlO1xuXHRsZXQgdW5kb1JlZG9TZXJ2aWNlOiBJVW5kb1JlZG9TZXJ2aWNlO1xuXHRsZXQgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlO1xuXHRsZXQgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlO1xuXHRsZXQgbGFuZ3VhZ2VEZXRlY3Rpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VEZXRlY3Rpb25TZXJ2aWNlO1xuXHRsZXQgbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2U6IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZTtcblx0bGV0IG5vdGVib29rTG9nZ2VyOiBJTm90ZWJvb2tMb2dnaW5nU2VydmljZTtcblxuXHRzdWl0ZVNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHNldHVwSW5zdGFudGlhdGlvblNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRcdHRleHRNb2RlbFNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVRleHRNb2RlbFNlcnZpY2UpO1xuXHRcdGJ1bGtFZGl0U2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJQnVsa0VkaXRTZXJ2aWNlKTtcblx0XHR1bmRvUmVkb1NlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVVuZG9SZWRvU2VydmljZSk7XG5cdFx0bW9kZWxTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElNb2RlbFNlcnZpY2UpO1xuXHRcdGxhbmd1YWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0XHRsYW5ndWFnZURldGVjdGlvblNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlRGV0ZWN0aW9uU2VydmljZSk7XG5cdFx0bm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlKTtcblx0XHRub3RlYm9va0xvZ2dlciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTm90ZWJvb2tMb2dnaW5nU2VydmljZSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUaGVtZVNlcnZpY2UsIG5ldyBUZXN0VGhlbWVTZXJ2aWNlKCkpO1xuXHR9KTtcblxuXHRzdWl0ZVRlYXJkb3duKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSk7XG5cblx0dGVzdCgnY3RvcicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBub3RlYm9vayA9IG5ldyBOb3RlYm9va1RleHRNb2RlbCgnbm90ZWJvb2snLCBVUkkucGFyc2UoJ3Rlc3QnKSwgW10sIHt9LCB7IHRyYW5zaWVudENlbGxNZXRhZGF0YToge30sIHRyYW5zaWVudERvY3VtZW50TWV0YWRhdGE6IHt9LCB0cmFuc2llbnRPdXRwdXRzOiBmYWxzZSwgY2VsbENvbnRlbnRNZXRhZGF0YToge30gfSwgdW5kb1JlZG9TZXJ2aWNlLCBtb2RlbFNlcnZpY2UsIGxhbmd1YWdlU2VydmljZSwgbGFuZ3VhZ2VEZXRlY3Rpb25TZXJ2aWNlLCBub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSwgbm90ZWJvb2tMb2dnZXIpO1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IE5vdGVib29rRWRpdG9yVGVzdE1vZGVsKG5vdGVib29rKTtcblx0XHRjb25zdCBvcHRpb25zID0gbmV3IE5vdGVib29rT3B0aW9ucyhtYWluV2luZG93LCBmYWxzZSwgdW5kZWZpbmVkLCBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSwgaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSksIGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJQ29kZUVkaXRvclNlcnZpY2UpKTtcblx0XHRjb25zdCBldmVudERpc3BhdGNoZXIgPSBuZXcgTm90ZWJvb2tFdmVudERpc3BhdGNoZXIoKTtcblx0XHRjb25zdCB2aWV3Q29udGV4dCA9IG5ldyBWaWV3Q29udGV4dChvcHRpb25zLCBldmVudERpc3BhdGNoZXIsICgpID0+ICh7fSBhcyBJQmFzZUNlbGxFZGl0b3JPcHRpb25zKSk7XG5cdFx0Y29uc3Qgdmlld01vZGVsID0gbmV3IE5vdGVib29rVmlld01vZGVsKCdub3RlYm9vaycsIG1vZGVsLm5vdGVib29rLCB2aWV3Q29udGV4dCwgbnVsbCwgeyBpc1JlYWRPbmx5OiBmYWxzZSB9LCBpbnN0YW50aWF0aW9uU2VydmljZSwgYnVsa0VkaXRTZXJ2aWNlLCB1bmRvUmVkb1NlcnZpY2UsIHRleHRNb2RlbFNlcnZpY2UsIG5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLnZpZXdUeXBlLCAnbm90ZWJvb2snKTtcblx0XHRub3RlYm9vay5kaXNwb3NlKCk7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdG9wdGlvbnMuZGlzcG9zZSgpO1xuXHRcdGV2ZW50RGlzcGF0Y2hlci5kaXNwb3NlKCk7XG5cdFx0dmlld01vZGVsLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0L2RlbGV0ZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdFx0XSxcblx0XHRcdChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjZWxsID0gaW5zZXJ0Q2VsbEF0SW5kZXgodmlld01vZGVsLCAxLCAndmFyIGMgPSAzJywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCB7fSwgW10sIHRydWUsIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgMyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwubm90ZWJvb2tEb2N1bWVudC5jZWxscy5sZW5ndGgsIDMpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldENlbGxJbmRleChjZWxsKSwgMSk7XG5cblx0XHRcdFx0cnVuRGVsZXRlQWN0aW9uKGVkaXRvciwgdmlld01vZGVsLmNlbGxBdCgxKSEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgMik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwubm90ZWJvb2tEb2N1bWVudC5jZWxscy5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldENlbGxJbmRleChjZWxsKSwgLTEpO1xuXG5cdFx0XHRcdGNlbGwuZGlzcG9zZSgpO1xuXHRcdFx0XHRjZWxsLm1vZGVsLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVkIGNlbGxzIGFyZSByZW1vdmVkIGZyb20gdGhlIGRpc3Bvc2FibGUgc3RvcmUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZ2V0RGlzcG9zZUNhbGxDb3VudCA9IGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XHRdLFxuXHRcdFx0KGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSBpbnNlcnRDZWxsQXRJbmRleCh2aWV3TW9kZWwsIDEsICd2YXIgYyA9IDMnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIHt9LCBbXSwgdHJ1ZSwgdHJ1ZSk7XG5cdFx0XHRcdGNvbnN0IG9yaWdpbmFsRGlzcG9zZSA9IGNlbGwuZGlzcG9zZS5iaW5kKGNlbGwpO1xuXHRcdFx0XHRsZXQgZGlzcG9zZUNhbGxDb3VudCA9IDA7XG5cdFx0XHRcdGNlbGwuZGlzcG9zZSA9ICgpID0+IHtcblx0XHRcdFx0XHRkaXNwb3NlQ2FsbENvdW50Kys7XG5cdFx0XHRcdFx0b3JpZ2luYWxEaXNwb3NlKCk7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0cnVuRGVsZXRlQWN0aW9uKGVkaXRvciwgY2VsbCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwb3NlQ2FsbENvdW50LCAxKTtcblx0XHRcdFx0Y2VsbC5tb2RlbC5kaXNwb3NlKCk7XG5cblx0XHRcdFx0cmV0dXJuICgpID0+IGRpc3Bvc2VDYWxsQ291bnQ7XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXREaXNwb3NlQ2FsbENvdW50KCksIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmRleCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdFx0XSxcblx0XHRcdChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0XHRjb25zdCBmaXJzdFZpZXdDZWxsID0gdmlld01vZGVsLmNlbGxBdCgwKSE7XG5cdFx0XHRcdGNvbnN0IGxhc3RWaWV3Q2VsbCA9IHZpZXdNb2RlbC5jZWxsQXQodmlld01vZGVsLmxlbmd0aCAtIDEpITtcblxuXHRcdFx0XHRjb25zdCBpbnNlcnRJbmRleCA9IHZpZXdNb2RlbC5nZXRDZWxsSW5kZXgoZmlyc3RWaWV3Q2VsbCkgKyAxO1xuXHRcdFx0XHRjb25zdCBjZWxsID0gaW5zZXJ0Q2VsbEF0SW5kZXgodmlld01vZGVsLCBpbnNlcnRJbmRleCwgJ3ZhciBjID0gMzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIHt9LCBbXSwgdHJ1ZSwgdHJ1ZSk7XG5cblx0XHRcdFx0Y29uc3QgYWRkZWRDZWxsSW5kZXggPSB2aWV3TW9kZWwuZ2V0Q2VsbEluZGV4KGNlbGwpO1xuXHRcdFx0XHRydW5EZWxldGVBY3Rpb24oZWRpdG9yLCB2aWV3TW9kZWwuY2VsbEF0KGFkZGVkQ2VsbEluZGV4KSEpO1xuXG5cdFx0XHRcdGNvbnN0IHNlY29uZEluc2VydEluZGV4ID0gdmlld01vZGVsLmdldENlbGxJbmRleChsYXN0Vmlld0NlbGwpICsgMTtcblx0XHRcdFx0Y29uc3QgY2VsbDIgPSBpbnNlcnRDZWxsQXRJbmRleCh2aWV3TW9kZWwsIHNlY29uZEluc2VydEluZGV4LCAndmFyIGQgPSA0OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwge30sIFtdLCB0cnVlLCB0cnVlKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgMyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwubm90ZWJvb2tEb2N1bWVudC5jZWxscy5sZW5ndGgsIDMpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldENlbGxJbmRleChjZWxsMiksIDIpO1xuXG5cdFx0XHRcdGNlbGwuZGlzcG9zZSgpO1xuXHRcdFx0XHRjZWxsLm1vZGVsLmRpc3Bvc2UoKTtcblx0XHRcdFx0Y2VsbDIuZGlzcG9zZSgpO1xuXHRcdFx0XHRjZWxsMi5tb2RlbC5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG59KTtcblxuZnVuY3Rpb24gZ2V0VmlzaWJsZUNlbGxzPFQ+KGNlbGxzOiBUW10sIGhpZGRlblJhbmdlczogSUNlbGxSYW5nZVtdKSB7XG5cdGlmICghaGlkZGVuUmFuZ2VzLmxlbmd0aCkge1xuXHRcdHJldHVybiBjZWxscztcblx0fVxuXG5cdGxldCBzdGFydCA9IDA7XG5cdGxldCBoaWRkZW5SYW5nZUluZGV4ID0gMDtcblx0Y29uc3QgcmVzdWx0OiBUW10gPSBbXTtcblxuXHR3aGlsZSAoc3RhcnQgPCBjZWxscy5sZW5ndGggJiYgaGlkZGVuUmFuZ2VJbmRleCA8IGhpZGRlblJhbmdlcy5sZW5ndGgpIHtcblx0XHRpZiAoc3RhcnQgPCBoaWRkZW5SYW5nZXNbaGlkZGVuUmFuZ2VJbmRleF0uc3RhcnQpIHtcblx0XHRcdHJlc3VsdC5wdXNoKC4uLmNlbGxzLnNsaWNlKHN0YXJ0LCBoaWRkZW5SYW5nZXNbaGlkZGVuUmFuZ2VJbmRleF0uc3RhcnQpKTtcblx0XHR9XG5cblx0XHRzdGFydCA9IGhpZGRlblJhbmdlc1toaWRkZW5SYW5nZUluZGV4XS5lbmQgKyAxO1xuXHRcdGhpZGRlblJhbmdlSW5kZXgrKztcblx0fVxuXG5cdGlmIChzdGFydCA8IGNlbGxzLmxlbmd0aCkge1xuXHRcdHJlc3VsdC5wdXNoKC4uLmNlbGxzLnNsaWNlKHN0YXJ0KSk7XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5zdWl0ZSgnTm90ZWJvb2tWaWV3TW9kZWwgRGVjb3JhdGlvbnMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3RyYWNraW5nIHJhbmdlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBjID0gMzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGQgPSA0OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgZSA9IDU7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0XHRjb25zdCB0cmFja2VkSWQgPSB2aWV3TW9kZWwuc2V0VHJhY2tlZFJhbmdlKCd0ZXN0JywgeyBzdGFydDogMSwgZW5kOiAyIH0sIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuR3Jvd3NPbmx5V2hlblR5cGluZ0FmdGVyKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0VHJhY2tlZFJhbmdlKHRyYWNrZWRJZCEpLCB7XG5cdFx0XHRcdFx0c3RhcnQ6IDEsXG5cblx0XHRcdFx0XHRlbmQ6IDIsXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IGNlbGwxID0gaW5zZXJ0Q2VsbEF0SW5kZXgodmlld01vZGVsLCAwLCAndmFyIGQgPSA2OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwge30sIFtdLCB0cnVlLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0VHJhY2tlZFJhbmdlKHRyYWNrZWRJZCEpLCB7XG5cdFx0XHRcdFx0c3RhcnQ6IDIsXG5cblx0XHRcdFx0XHRlbmQ6IDNcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0cnVuRGVsZXRlQWN0aW9uKGVkaXRvciwgdmlld01vZGVsLmNlbGxBdCgwKSEpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRUcmFja2VkUmFuZ2UodHJhY2tlZElkISksIHtcblx0XHRcdFx0XHRzdGFydDogMSxcblxuXHRcdFx0XHRcdGVuZDogMlxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCBjZWxsMiA9IGluc2VydENlbGxBdEluZGV4KHZpZXdNb2RlbCwgMywgJ3ZhciBkID0gNzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIHt9LCBbXSwgdHJ1ZSwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldFRyYWNrZWRSYW5nZSh0cmFja2VkSWQhKSwge1xuXHRcdFx0XHRcdHN0YXJ0OiAxLFxuXG5cdFx0XHRcdFx0ZW5kOiAzXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHJ1bkRlbGV0ZUFjdGlvbihlZGl0b3IsIHZpZXdNb2RlbC5jZWxsQXQoMykhKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0VHJhY2tlZFJhbmdlKHRyYWNrZWRJZCEpLCB7XG5cdFx0XHRcdFx0c3RhcnQ6IDEsXG5cblx0XHRcdFx0XHRlbmQ6IDJcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0cnVuRGVsZXRlQWN0aW9uKGVkaXRvciwgdmlld01vZGVsLmNlbGxBdCgxKSEpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRUcmFja2VkUmFuZ2UodHJhY2tlZElkISksIHtcblx0XHRcdFx0XHRzdGFydDogMCxcblxuXHRcdFx0XHRcdGVuZDogMVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjZWxsMS5kaXNwb3NlKCk7XG5cdFx0XHRcdGNlbGwxLm1vZGVsLmRpc3Bvc2UoKTtcblx0XHRcdFx0Y2VsbDIuZGlzcG9zZSgpO1xuXHRcdFx0XHRjZWxsMi5tb2RlbC5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgndHJhY2tpbmcgcmFuZ2UgMicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYyA9IDM7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBkID0gNDsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGUgPSA1OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgZSA9IDY7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBlID0gNzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0KGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRyYWNrZWRJZCA9IHZpZXdNb2RlbC5zZXRUcmFja2VkUmFuZ2UoJ3Rlc3QnLCB7IHN0YXJ0OiAxLCBlbmQ6IDMgfSwgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5Hcm93c09ubHlXaGVuVHlwaW5nQWZ0ZXIpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRUcmFja2VkUmFuZ2UodHJhY2tlZElkISksIHtcblx0XHRcdFx0XHRzdGFydDogMSxcblxuXHRcdFx0XHRcdGVuZDogM1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpbnNlcnRDZWxsQXRJbmRleCh2aWV3TW9kZWwsIDUsICd2YXIgZCA9IDk7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCB7fSwgW10sIHRydWUsIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRUcmFja2VkUmFuZ2UodHJhY2tlZElkISksIHtcblx0XHRcdFx0XHRzdGFydDogMSxcblxuXHRcdFx0XHRcdGVuZDogM1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRpbnNlcnRDZWxsQXRJbmRleCh2aWV3TW9kZWwsIDQsICd2YXIgZCA9IDEwOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwge30sIFtdLCB0cnVlLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0VHJhY2tlZFJhbmdlKHRyYWNrZWRJZCEpLCB7XG5cdFx0XHRcdFx0c3RhcnQ6IDEsXG5cblx0XHRcdFx0XHRlbmQ6IDRcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGlmZiBoaWRkZW4gcmFuZ2VzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0VmlzaWJsZUNlbGxzPG51bWJlcj4oWzEsIDIsIDMsIDQsIDVdLCBbXSksIFsxLCAyLCAzLCA0LCA1XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0Z2V0VmlzaWJsZUNlbGxzPG51bWJlcj4oXG5cdFx0XHRcdFsxLCAyLCAzLCA0LCA1XSxcblx0XHRcdFx0W3sgc3RhcnQ6IDEsIGVuZDogMiB9XVxuXHRcdFx0KSxcblx0XHRcdFsxLCA0LCA1XVxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0Z2V0VmlzaWJsZUNlbGxzPG51bWJlcj4oXG5cdFx0XHRcdFsxLCAyLCAzLCA0LCA1LCA2LCA3LCA4LCA5XSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgc3RhcnQ6IDEsIGVuZDogMiB9LFxuXHRcdFx0XHRcdHsgc3RhcnQ6IDQsIGVuZDogNSB9XG5cdFx0XHRcdF1cblx0XHRcdCksXG5cdFx0XHRbMSwgNCwgNywgOCwgOV1cblx0XHQpO1xuXG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSBnZXRWaXNpYmxlQ2VsbHM8bnVtYmVyPihcblx0XHRcdFsxLCAyLCAzLCA0LCA1LCA2LCA3LCA4LCA5XSxcblx0XHRcdFtcblx0XHRcdFx0eyBzdGFydDogMSwgZW5kOiAyIH0sXG5cdFx0XHRcdHsgc3RhcnQ6IDQsIGVuZDogNSB9XG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGNvbnN0IG1vZGlmaWVkID0gZ2V0VmlzaWJsZUNlbGxzPG51bWJlcj4oXG5cdFx0XHRbMSwgMiwgMywgNCwgNSwgNiwgNywgOCwgOV0sXG5cdFx0XHRbXG5cdFx0XHRcdHsgc3RhcnQ6IDIsIGVuZDogNCB9XG5cdFx0XHRdXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlmZjxudW1iZXI+KG9yaWdpbmFsLCBtb2RpZmllZCwgKGEpID0+IHtcblx0XHRcdHJldHVybiBvcmlnaW5hbC5pbmRleE9mKGEpID49IDA7XG5cdFx0fSksIFt7IHN0YXJ0OiAxLCBkZWxldGVDb3VudDogMSwgdG9JbnNlcnQ6IFsyLCA2XSB9XSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdOb3RlYm9va1ZpZXdNb2RlbCBBUEknLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJyMxMTU0MzIsIGdldCBuZWFyZXN0IGNvZGUgY2VsbCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIGEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciBiJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ2IgPSAyOycsICdweXRob24nLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBjID0gMycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciBkJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBlID0gNDsnLCAnVHlwZVNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgZicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XVxuXHRcdFx0XSxcblx0XHRcdChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLm5lYXJlc3RDb2RlQ2VsbEluZGV4KDApLCAxKTtcblx0XHRcdFx0Ly8gZmluZCB0aGUgbmVhcmVzdCBjb2RlIGNlbGwgZnJvbSBhYm92ZVxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLm5lYXJlc3RDb2RlQ2VsbEluZGV4KDIpLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5uZWFyZXN0Q29kZUNlbGxJbmRleCg0KSwgMyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwubmVhcmVzdENvZGVDZWxsSW5kZXgoNSksIDQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLm5lYXJlc3RDb2RlQ2VsbEluZGV4KDYpLCA0KTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCcjMTA4NDY0LCBnZXQgbmVhcmVzdCBjb2RlIGNlbGwnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciBhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgYicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XVxuXHRcdFx0XSxcblx0XHRcdChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLm5lYXJlc3RDb2RlQ2VsbEluZGV4KDIpLCAxKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRDZWxscycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIGEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciBiJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dXG5cdFx0XHRdLFxuXHRcdFx0KGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0Q2VsbHNJblJhbmdlKCkubGVuZ3RoLCAzKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0Q2VsbHNJblJhbmdlKHsgc3RhcnQ6IDAsIGVuZDogMSB9KS5tYXAoY2VsbCA9PiBjZWxsLmdldFRleHQoKSksIFsnIyBoZWFkZXIgYSddKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0Q2VsbHNJblJhbmdlKHsgc3RhcnQ6IDAsIGVuZDogMiB9KS5tYXAoY2VsbCA9PiBjZWxsLmdldFRleHQoKSksIFsnIyBoZWFkZXIgYScsICd2YXIgYiA9IDE7J10pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRDZWxsc0luUmFuZ2UoeyBzdGFydDogMCwgZW5kOiAzIH0pLm1hcChjZWxsID0+IGNlbGwuZ2V0VGV4dCgpKSwgWycjIGhlYWRlciBhJywgJ3ZhciBiID0gMTsnLCAnIyBoZWFkZXIgYiddKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0Q2VsbHNJblJhbmdlKHsgc3RhcnQ6IDAsIGVuZDogNCB9KS5tYXAoY2VsbCA9PiBjZWxsLmdldFRleHQoKSksIFsnIyBoZWFkZXIgYScsICd2YXIgYiA9IDE7JywgJyMgaGVhZGVyIGInXSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldENlbGxzSW5SYW5nZSh7IHN0YXJ0OiAxLCBlbmQ6IDQgfSkubWFwKGNlbGwgPT4gY2VsbC5nZXRUZXh0KCkpLCBbJ3ZhciBiID0gMTsnLCAnIyBoZWFkZXIgYiddKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0Q2VsbHNJblJhbmdlKHsgc3RhcnQ6IDIsIGVuZDogNCB9KS5tYXAoY2VsbCA9PiBjZWxsLmdldFRleHQoKSksIFsnIyBoZWFkZXIgYiddKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0Q2VsbHNJblJhbmdlKHsgc3RhcnQ6IDMsIGVuZDogNCB9KS5tYXAoY2VsbCA9PiBjZWxsLmdldFRleHQoKSksIFtdKTtcblxuXHRcdFx0XHQvLyBubyBvbmUgc2hvdWxkIHVzZSBhbiBpbnZhbGlkIHJhbmdlIGJ1dCBgZ2V0Q2VsbHNgIHNob3VsZCBiZSBhYmxlIHRvIGhhbmRsZSB0aGF0LlxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRDZWxsc0luUmFuZ2UoeyBzdGFydDogLTEsIGVuZDogMSB9KS5tYXAoY2VsbCA9PiBjZWxsLmdldFRleHQoKSksIFsnIyBoZWFkZXIgYSddKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0Q2VsbHNJblJhbmdlKHsgc3RhcnQ6IDMsIGVuZDogMCB9KS5tYXAoY2VsbCA9PiBjZWxsLmdldFRleHQoKSksIFsnIyBoZWFkZXIgYScsICd2YXIgYiA9IDE7JywgJyMgaGVhZGVyIGInXSk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8s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
