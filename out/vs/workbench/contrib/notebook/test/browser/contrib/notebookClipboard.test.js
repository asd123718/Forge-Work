import assert from "assert";
import { mock } from "../../../../../../base/test/common/mock.js";
import { NotebookClipboardContribution, runCopyCells, runCutCells } from "../../../browser/contrib/clipboard/notebookClipboard.js";
import { CellKind, NOTEBOOK_EDITOR_ID, SelectionStateType } from "../../../common/notebookCommon.js";
import { withTestNotebook } from "../testNotebookEditor.js";
import { INotebookService } from "../../../common/notebookService.js";
import { FoldingModel, updateFoldingStateAtIndex } from "../../../browser/viewModel/foldingModel.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
suite("Notebook Clipboard", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const createEditorService = (editor) => {
    const visibleEditorPane = new class extends mock() {
      getId() {
        return NOTEBOOK_EDITOR_ID;
      }
      getControl() {
        return editor;
      }
    }();
    const editorService = new class extends mock() {
      get activeEditorPane() {
        return visibleEditorPane;
      }
    }();
    return editorService;
  };
  test.skip("Cut multiple selected cells", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        accessor.stub(INotebookService, new class extends mock() {
          setToCopy() {
          }
        }());
        const clipboardContrib = new NotebookClipboardContribution(createEditorService(editor));
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 2 }, selections: [{ start: 0, end: 2 }] }, "model");
        assert.ok(clipboardContrib.runCutAction(accessor));
        assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });
        assert.strictEqual(viewModel.length, 1);
        assert.strictEqual(viewModel.cellAt(0)?.getText(), "paragraph 2");
      }
    );
  });
  test.skip("Cut should take folding info into account", async function() {
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
      async (editor, viewModel, _ds, accessor) => {
        const foldingModel = new FoldingModel();
        foldingModel.attachViewModel(viewModel);
        updateFoldingStateAtIndex(foldingModel, 0, true);
        updateFoldingStateAtIndex(foldingModel, 2, true);
        viewModel.updateFoldingRanges(foldingModel.regions);
        editor.setHiddenAreas(viewModel.getHiddenRanges());
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 1 }] }, "model");
        accessor.stub(INotebookService, new class extends mock() {
          setToCopy() {
          }
        }());
        const clipboardContrib = new NotebookClipboardContribution(createEditorService(editor));
        clipboardContrib.runCutAction(accessor);
        assert.strictEqual(viewModel.length, 5);
        await viewModel.undo();
        assert.strictEqual(viewModel.length, 7);
      }
    );
  });
  test.skip("Copy should take folding info into account", async function() {
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
      async (editor, viewModel, _ds, accessor) => {
        const foldingModel = new FoldingModel();
        foldingModel.attachViewModel(viewModel);
        updateFoldingStateAtIndex(foldingModel, 0, true);
        updateFoldingStateAtIndex(foldingModel, 2, true);
        viewModel.updateFoldingRanges(foldingModel.regions);
        editor.setHiddenAreas(viewModel.getHiddenRanges());
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 1 }] }, "model");
        let _cells = [];
        accessor.stub(INotebookService, new class extends mock() {
          setToCopy(cells) {
            _cells = cells;
          }
          getToCopy() {
            return { items: _cells, isCopy: true };
          }
        }());
        const clipboardContrib = new NotebookClipboardContribution(createEditorService(editor));
        clipboardContrib.runCopyAction(accessor);
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 6, end: 7 }, selections: [{ start: 6, end: 7 }] }, "model");
        clipboardContrib.runPasteAction(accessor);
        assert.strictEqual(viewModel.length, 9);
        assert.strictEqual(viewModel.cellAt(8)?.getText(), "var b = 1;");
      }
    );
  });
  test.skip("#119773, cut last item should not focus on the top first cell", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        accessor.stub(INotebookService, new class extends mock() {
          setToCopy() {
          }
        }());
        const clipboardContrib = new NotebookClipboardContribution(createEditorService(editor));
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 2, end: 3 }, selections: [{ start: 2, end: 3 }] }, "model");
        assert.ok(clipboardContrib.runCutAction(accessor));
        assert.deepStrictEqual(viewModel.getFocus(), { start: 1, end: 2 });
      }
    );
  });
  test.skip("#119771, undo paste should restore selections", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        accessor.stub(INotebookService, new class extends mock() {
          setToCopy() {
          }
          getToCopy() {
            return {
              items: [
                viewModel.cellAt(0).model
              ],
              isCopy: true
            };
          }
        }());
        const clipboardContrib = new NotebookClipboardContribution(createEditorService(editor));
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 2, end: 3 }, selections: [{ start: 2, end: 3 }] }, "model");
        assert.ok(clipboardContrib.runPasteAction(accessor));
        assert.strictEqual(viewModel.length, 4);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 3, end: 4 });
        assert.strictEqual(viewModel.cellAt(3)?.getText(), "# header 1");
        await viewModel.undo();
        assert.strictEqual(viewModel.length, 3);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 2, end: 3 });
      }
    );
  });
  test("copy cell from ui still works if the target cell is not part of a selection", async () => {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        let _toCopy = [];
        accessor.stub(INotebookService, new class extends mock() {
          setToCopy(toCopy) {
            _toCopy = toCopy;
          }
          getToCopy() {
            return {
              items: _toCopy,
              isCopy: true
            };
          }
        }());
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 2 }] }, "model");
        assert.ok(runCopyCells(accessor, editor, viewModel.cellAt(0)));
        assert.deepStrictEqual(_toCopy, [viewModel.cellAt(0).model, viewModel.cellAt(1).model]);
        assert.ok(runCopyCells(accessor, editor, viewModel.cellAt(2)));
        assert.deepStrictEqual(_toCopy.length, 1);
        assert.deepStrictEqual(_toCopy, [viewModel.cellAt(2).model]);
      }
    );
  });
  test("cut cell from ui still works if the target cell is not part of a selection", async () => {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}],
        ["paragraph 3", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        accessor.stub(INotebookService, new class extends mock() {
          setToCopy() {
          }
          getToCopy() {
            return { items: [], isCopy: true };
          }
        }());
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 2 }] }, "model");
        assert.ok(runCutCells(accessor, editor, viewModel.cellAt(0)));
        assert.strictEqual(viewModel.length, 2);
        await viewModel.undo();
        assert.strictEqual(viewModel.length, 4);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 0, end: 2 }]);
        assert.ok(runCutCells(accessor, editor, viewModel.cellAt(2)));
        assert.strictEqual(viewModel.length, 3);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });
        assert.strictEqual(viewModel.cellAt(0)?.getText(), "# header 1");
        assert.strictEqual(viewModel.cellAt(1)?.getText(), "paragraph 1");
        assert.strictEqual(viewModel.cellAt(2)?.getText(), "paragraph 3");
        await viewModel.undo();
        assert.strictEqual(viewModel.length, 4);
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 2, end: 3 }, selections: [{ start: 2, end: 4 }] }, "model");
        assert.deepStrictEqual(viewModel.getFocus(), { start: 2, end: 3 });
        assert.ok(runCutCells(accessor, editor, viewModel.cellAt(0)));
        assert.deepStrictEqual(viewModel.getFocus(), { start: 1, end: 2 });
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 1, end: 3 }]);
      }
    );
  });
  test("cut focus cell still works if the focus is not part of any selection", async () => {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}],
        ["paragraph 3", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        accessor.stub(INotebookService, new class extends mock() {
          setToCopy() {
          }
          getToCopy() {
            return { items: [], isCopy: true };
          }
        }());
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 2, end: 4 }] }, "model");
        assert.ok(runCutCells(accessor, editor, void 0));
        assert.strictEqual(viewModel.length, 3);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 0, end: 1 });
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 1, end: 3 }]);
      }
    );
  });
  test("cut focus cell still works if the focus is not part of any selection 2", async () => {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}],
        ["paragraph 3", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        accessor.stub(INotebookService, new class extends mock() {
          setToCopy() {
          }
          getToCopy() {
            return { items: [], isCopy: true };
          }
        }());
        viewModel.updateSelectionsState({ kind: SelectionStateType.Index, focus: { start: 3, end: 4 }, selections: [{ start: 0, end: 2 }] }, "model");
        assert.ok(runCutCells(accessor, editor, void 0));
        assert.strictEqual(viewModel.length, 3);
        assert.deepStrictEqual(viewModel.getFocus(), { start: 2, end: 3 });
        assert.deepStrictEqual(viewModel.getSelections(), [{ start: 0, end: 2 }]);
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFx0ZXN0XFxicm93c2VyXFxjb250cmliXFxub3RlYm9va0NsaXBib2FyZC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0NsaXBib2FyZENvbnRyaWJ1dGlvbiwgcnVuQ29weUNlbGxzLCBydW5DdXRDZWxscyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY29udHJpYi9jbGlwYm9hcmQvbm90ZWJvb2tDbGlwYm9hcmQuanMnO1xuaW1wb3J0IHsgQ2VsbEtpbmQsIE5PVEVCT09LX0VESVRPUl9JRCwgU2VsZWN0aW9uU3RhdGVUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IHdpdGhUZXN0Tm90ZWJvb2sgfSBmcm9tICcuLi90ZXN0Tm90ZWJvb2tFZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZU5vdGVib29rRWRpdG9yLCBJTm90ZWJvb2tFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJVmlzaWJsZUVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZvbGRpbmdNb2RlbCwgdXBkYXRlRm9sZGluZ1N0YXRlQXRJbmRleCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvdmlld01vZGVsL2ZvbGRpbmdNb2RlbC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0NlbGxUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvbm90ZWJvb2tDZWxsVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5zdWl0ZSgnTm90ZWJvb2sgQ2xpcGJvYXJkJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBjcmVhdGVFZGl0b3JTZXJ2aWNlID0gKGVkaXRvcjogSUFjdGl2ZU5vdGVib29rRWRpdG9yKSA9PiB7XG5cdFx0Y29uc3QgdmlzaWJsZUVkaXRvclBhbmUgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElWaXNpYmxlRWRpdG9yUGFuZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXRJZCgpOiBzdHJpbmcge1xuXHRcdFx0XHRyZXR1cm4gTk9URUJPT0tfRURJVE9SX0lEO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgZ2V0Q29udHJvbCgpOiBJTm90ZWJvb2tFZGl0b3Ige1xuXHRcdFx0XHRyZXR1cm4gZWRpdG9yO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvclNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgZ2V0IGFjdGl2ZUVkaXRvclBhbmUoKTogSVZpc2libGVFZGl0b3JQYW5lIHwgdW5kZWZpbmVkIHtcblx0XHRcdFx0cmV0dXJuIHZpc2libGVFZGl0b3JQYW5lO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRyZXR1cm4gZWRpdG9yU2VydmljZTtcblx0fTtcblxuXHR0ZXN0LnNraXAoJ0N1dCBtdWx0aXBsZSBzZWxlY3RlZCBjZWxscycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsncGFyYWdyYXBoIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsncGFyYWdyYXBoIDInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBfZHMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGFjY2Vzc29yLnN0dWIoSU5vdGVib29rU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTm90ZWJvb2tTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgc2V0VG9Db3B5KCkgeyB9IH0pO1xuXG5cdFx0XHRcdGNvbnN0IGNsaXBib2FyZENvbnRyaWIgPSBuZXcgTm90ZWJvb2tDbGlwYm9hcmRDb250cmlidXRpb24oY3JlYXRlRWRpdG9yU2VydmljZShlZGl0b3IpKTtcblxuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlU2VsZWN0aW9uc1N0YXRlKHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogeyBzdGFydDogMCwgZW5kOiAyIH0sIHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiAwLCBlbmQ6IDIgfV0gfSwgJ21vZGVsJyk7XG5cdFx0XHRcdGFzc2VydC5vayhjbGlwYm9hcmRDb250cmliLnJ1bkN1dEFjdGlvbihhY2Nlc3NvcikpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRGb2N1cygpLCB7IHN0YXJ0OiAwLCBlbmQ6IDEgfSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5jZWxsQXQoMCk/LmdldFRleHQoKSwgJ3BhcmFncmFwaCAyJyk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdC5za2lwKCdDdXQgc2hvdWxkIHRha2UgZm9sZGluZyBpbmZvIGludG8gYWNjb3VudCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIGEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciBiJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGMgPSAzJywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgZCcsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgZSA9IDQ7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCwgX2RzLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRjb25zdCBmb2xkaW5nTW9kZWwgPSBuZXcgRm9sZGluZ01vZGVsKCk7XG5cdFx0XHRcdGZvbGRpbmdNb2RlbC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblxuXHRcdFx0XHR1cGRhdGVGb2xkaW5nU3RhdGVBdEluZGV4KGZvbGRpbmdNb2RlbCwgMCwgdHJ1ZSk7XG5cdFx0XHRcdHVwZGF0ZUZvbGRpbmdTdGF0ZUF0SW5kZXgoZm9sZGluZ01vZGVsLCAyLCB0cnVlKTtcblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZUZvbGRpbmdSYW5nZXMoZm9sZGluZ01vZGVsLnJlZ2lvbnMpO1xuXHRcdFx0XHRlZGl0b3Iuc2V0SGlkZGVuQXJlYXModmlld01vZGVsLmdldEhpZGRlblJhbmdlcygpKTtcblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZVNlbGVjdGlvbnNTdGF0ZSh7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IHsgc3RhcnQ6IDAsIGVuZDogMSB9LCBzZWxlY3Rpb25zOiBbeyBzdGFydDogMCwgZW5kOiAxIH1dIH0sICdtb2RlbCcpO1xuXG5cdFx0XHRcdGFjY2Vzc29yLnN0dWIoSU5vdGVib29rU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTm90ZWJvb2tTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgc2V0VG9Db3B5KCkgeyB9IH0pO1xuXG5cdFx0XHRcdGNvbnN0IGNsaXBib2FyZENvbnRyaWIgPSBuZXcgTm90ZWJvb2tDbGlwYm9hcmRDb250cmlidXRpb24oY3JlYXRlRWRpdG9yU2VydmljZShlZGl0b3IpKTtcblx0XHRcdFx0Y2xpcGJvYXJkQ29udHJpYi5ydW5DdXRBY3Rpb24oYWNjZXNzb3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgNSk7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC51bmRvKCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwubGVuZ3RoLCA3KTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0LnNraXAoJ0NvcHkgc2hvdWxkIHRha2UgZm9sZGluZyBpbmZvIGludG8gYWNjb3VudCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIGEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciBiJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGMgPSAzJywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgZCcsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgZSA9IDQ7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCwgX2RzLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRjb25zdCBmb2xkaW5nTW9kZWwgPSBuZXcgRm9sZGluZ01vZGVsKCk7XG5cdFx0XHRcdGZvbGRpbmdNb2RlbC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblxuXHRcdFx0XHR1cGRhdGVGb2xkaW5nU3RhdGVBdEluZGV4KGZvbGRpbmdNb2RlbCwgMCwgdHJ1ZSk7XG5cdFx0XHRcdHVwZGF0ZUZvbGRpbmdTdGF0ZUF0SW5kZXgoZm9sZGluZ01vZGVsLCAyLCB0cnVlKTtcblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZUZvbGRpbmdSYW5nZXMoZm9sZGluZ01vZGVsLnJlZ2lvbnMpO1xuXHRcdFx0XHRlZGl0b3Iuc2V0SGlkZGVuQXJlYXModmlld01vZGVsLmdldEhpZGRlblJhbmdlcygpKTtcblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZVNlbGVjdGlvbnNTdGF0ZSh7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IHsgc3RhcnQ6IDAsIGVuZDogMSB9LCBzZWxlY3Rpb25zOiBbeyBzdGFydDogMCwgZW5kOiAxIH1dIH0sICdtb2RlbCcpO1xuXG5cdFx0XHRcdGxldCBfY2VsbHM6IE5vdGVib29rQ2VsbFRleHRNb2RlbFtdID0gW107XG5cdFx0XHRcdGFjY2Vzc29yLnN0dWIoSU5vdGVib29rU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTm90ZWJvb2tTZXJ2aWNlPigpIHtcblx0XHRcdFx0XHRvdmVycmlkZSBzZXRUb0NvcHkoY2VsbHM6IE5vdGVib29rQ2VsbFRleHRNb2RlbFtdKSB7IF9jZWxscyA9IGNlbGxzOyB9XG5cdFx0XHRcdFx0b3ZlcnJpZGUgZ2V0VG9Db3B5KCkgeyByZXR1cm4geyBpdGVtczogX2NlbGxzLCBpc0NvcHk6IHRydWUgfTsgfVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCBjbGlwYm9hcmRDb250cmliID0gbmV3IE5vdGVib29rQ2xpcGJvYXJkQ29udHJpYnV0aW9uKGNyZWF0ZUVkaXRvclNlcnZpY2UoZWRpdG9yKSk7XG5cdFx0XHRcdGNsaXBib2FyZENvbnRyaWIucnVuQ29weUFjdGlvbihhY2Nlc3Nvcik7XG5cdFx0XHRcdHZpZXdNb2RlbC51cGRhdGVTZWxlY3Rpb25zU3RhdGUoeyBraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsIGZvY3VzOiB7IHN0YXJ0OiA2LCBlbmQ6IDcgfSwgc2VsZWN0aW9uczogW3sgc3RhcnQ6IDYsIGVuZDogNyB9XSB9LCAnbW9kZWwnKTtcblx0XHRcdFx0Y2xpcGJvYXJkQ29udHJpYi5ydW5QYXN0ZUFjdGlvbihhY2Nlc3Nvcik7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5sZW5ndGgsIDkpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmNlbGxBdCg4KT8uZ2V0VGV4dCgpLCAndmFyIGIgPSAxOycpO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3Quc2tpcCgnIzExOTc3MywgY3V0IGxhc3QgaXRlbSBzaG91bGQgbm90IGZvY3VzIG9uIHRoZSB0b3AgZmlyc3QgY2VsbCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsncGFyYWdyYXBoIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsncGFyYWdyYXBoIDInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBfZHMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGFjY2Vzc29yLnN0dWIoSU5vdGVib29rU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTm90ZWJvb2tTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgc2V0VG9Db3B5KCkgeyB9IH0pO1xuXHRcdFx0XHRjb25zdCBjbGlwYm9hcmRDb250cmliID0gbmV3IE5vdGVib29rQ2xpcGJvYXJkQ29udHJpYnV0aW9uKGNyZWF0ZUVkaXRvclNlcnZpY2UoZWRpdG9yKSk7XG5cblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZVNlbGVjdGlvbnNTdGF0ZSh7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IHsgc3RhcnQ6IDIsIGVuZDogMyB9LCBzZWxlY3Rpb25zOiBbeyBzdGFydDogMiwgZW5kOiAzIH1dIH0sICdtb2RlbCcpO1xuXHRcdFx0XHRhc3NlcnQub2soY2xpcGJvYXJkQ29udHJpYi5ydW5DdXRBY3Rpb24oYWNjZXNzb3IpKTtcblx0XHRcdFx0Ly8gaXQgc2hvdWxkIGJlIHRoZSBsYXN0IGNlbGwsIG90aGVyIHRoYW4gdGhlIGZpcnN0IG9uZS5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0Rm9jdXMoKSwgeyBzdGFydDogMSwgZW5kOiAyIH0pO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3Quc2tpcCgnIzExOTc3MSwgdW5kbyBwYXN0ZSBzaG91bGQgcmVzdG9yZSBzZWxlY3Rpb25zJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIF9kcywgYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0YWNjZXNzb3Iuc3R1YihJTm90ZWJvb2tTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va1NlcnZpY2U+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIHNldFRvQ29weSgpIHsgfVxuXHRcdFx0XHRcdG92ZXJyaWRlIGdldFRvQ29weSgpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGl0ZW1zOiBbXG5cdFx0XHRcdFx0XHRcdFx0dmlld01vZGVsLmNlbGxBdCgwKSEubW9kZWxcblx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0aXNDb3B5OiB0cnVlXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgY2xpcGJvYXJkQ29udHJpYiA9IG5ldyBOb3RlYm9va0NsaXBib2FyZENvbnRyaWJ1dGlvbihjcmVhdGVFZGl0b3JTZXJ2aWNlKGVkaXRvcikpO1xuXG5cdFx0XHRcdHZpZXdNb2RlbC51cGRhdGVTZWxlY3Rpb25zU3RhdGUoeyBraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsIGZvY3VzOiB7IHN0YXJ0OiAyLCBlbmQ6IDMgfSwgc2VsZWN0aW9uczogW3sgc3RhcnQ6IDIsIGVuZDogMyB9XSB9LCAnbW9kZWwnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGNsaXBib2FyZENvbnRyaWIucnVuUGFzdGVBY3Rpb24oYWNjZXNzb3IpKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgNCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldEZvY3VzKCksIHsgc3RhcnQ6IDMsIGVuZDogNCB9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5jZWxsQXQoMyk/LmdldFRleHQoKSwgJyMgaGVhZGVyIDEnKTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnVuZG8oKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5sZW5ndGgsIDMpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRGb2N1cygpLCB7IHN0YXJ0OiAyLCBlbmQ6IDMgfSk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29weSBjZWxsIGZyb20gdWkgc3RpbGwgd29ya3MgaWYgdGhlIHRhcmdldCBjZWxsIGlzIG5vdCBwYXJ0IG9mIGEgc2VsZWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIF9kcywgYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0bGV0IF90b0NvcHk6IE5vdGVib29rQ2VsbFRleHRNb2RlbFtdID0gW107XG5cdFx0XHRcdGFjY2Vzc29yLnN0dWIoSU5vdGVib29rU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTm90ZWJvb2tTZXJ2aWNlPigpIHtcblx0XHRcdFx0XHRvdmVycmlkZSBzZXRUb0NvcHkodG9Db3B5OiBOb3RlYm9va0NlbGxUZXh0TW9kZWxbXSkgeyBfdG9Db3B5ID0gdG9Db3B5OyB9XG5cdFx0XHRcdFx0b3ZlcnJpZGUgZ2V0VG9Db3B5KCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0aXRlbXM6IF90b0NvcHksXG5cdFx0XHRcdFx0XHRcdGlzQ29weTogdHJ1ZVxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHZpZXdNb2RlbC51cGRhdGVTZWxlY3Rpb25zU3RhdGUoeyBraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSW5kZXgsIGZvY3VzOiB7IHN0YXJ0OiAwLCBlbmQ6IDEgfSwgc2VsZWN0aW9uczogW3sgc3RhcnQ6IDAsIGVuZDogMiB9XSB9LCAnbW9kZWwnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJ1bkNvcHlDZWxscyhhY2Nlc3NvciwgZWRpdG9yLCB2aWV3TW9kZWwuY2VsbEF0KDApKSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoX3RvQ29weSwgW3ZpZXdNb2RlbC5jZWxsQXQoMCkhLm1vZGVsLCB2aWV3TW9kZWwuY2VsbEF0KDEpIS5tb2RlbF0pO1xuXG5cdFx0XHRcdGFzc2VydC5vayhydW5Db3B5Q2VsbHMoYWNjZXNzb3IsIGVkaXRvciwgdmlld01vZGVsLmNlbGxBdCgyKSkpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKF90b0NvcHkubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChfdG9Db3B5LCBbdmlld01vZGVsLmNlbGxBdCgyKSEubW9kZWxdKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjdXQgY2VsbCBmcm9tIHVpIHN0aWxsIHdvcmtzIGlmIHRoZSB0YXJnZXQgY2VsbCBpcyBub3QgcGFydCBvZiBhIHNlbGVjdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsncGFyYWdyYXBoIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsncGFyYWdyYXBoIDInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsncGFyYWdyYXBoIDMnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBfZHMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGFjY2Vzc29yLnN0dWIoSU5vdGVib29rU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTm90ZWJvb2tTZXJ2aWNlPigpIHtcblx0XHRcdFx0XHRvdmVycmlkZSBzZXRUb0NvcHkoKSB7IH1cblx0XHRcdFx0XHRvdmVycmlkZSBnZXRUb0NvcHkoKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBpdGVtczogW10sIGlzQ29weTogdHJ1ZSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZVNlbGVjdGlvbnNTdGF0ZSh7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IHsgc3RhcnQ6IDAsIGVuZDogMSB9LCBzZWxlY3Rpb25zOiBbeyBzdGFydDogMCwgZW5kOiAyIH1dIH0sICdtb2RlbCcpO1xuXHRcdFx0XHRhc3NlcnQub2socnVuQ3V0Q2VsbHMoYWNjZXNzb3IsIGVkaXRvciwgdmlld01vZGVsLmNlbGxBdCgwKSkpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgMik7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC51bmRvKCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwubGVuZ3RoLCA0KTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRGb2N1cygpLCB7IHN0YXJ0OiAwLCBlbmQ6IDEgfSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldFNlbGVjdGlvbnMoKSwgW3sgc3RhcnQ6IDAsIGVuZDogMiB9XSk7XG5cdFx0XHRcdGFzc2VydC5vayhydW5DdXRDZWxscyhhY2Nlc3NvciwgZWRpdG9yLCB2aWV3TW9kZWwuY2VsbEF0KDIpKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwubGVuZ3RoLCAzKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0Rm9jdXMoKSwgeyBzdGFydDogMCwgZW5kOiAxIH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmNlbGxBdCgwKT8uZ2V0VGV4dCgpLCAnIyBoZWFkZXIgMScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmNlbGxBdCgxKT8uZ2V0VGV4dCgpLCAncGFyYWdyYXBoIDEnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5jZWxsQXQoMik/LmdldFRleHQoKSwgJ3BhcmFncmFwaCAzJyk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnVuZG8oKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5sZW5ndGgsIDQpO1xuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlU2VsZWN0aW9uc1N0YXRlKHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogeyBzdGFydDogMiwgZW5kOiAzIH0sIHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiAyLCBlbmQ6IDQgfV0gfSwgJ21vZGVsJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldEZvY3VzKCksIHsgc3RhcnQ6IDIsIGVuZDogMyB9KTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJ1bkN1dENlbGxzKGFjY2Vzc29yLCBlZGl0b3IsIHZpZXdNb2RlbC5jZWxsQXQoMCkpKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0Rm9jdXMoKSwgeyBzdGFydDogMSwgZW5kOiAyIH0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb25zKCksIFt7IHN0YXJ0OiAxLCBlbmQ6IDMgfV0pO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2N1dCBmb2N1cyBjZWxsIHN0aWxsIHdvcmtzIGlmIHRoZSBmb2N1cyBpcyBub3QgcGFydCBvZiBhbnkgc2VsZWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMycsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIF9kcywgYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0YWNjZXNzb3Iuc3R1YihJTm90ZWJvb2tTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va1NlcnZpY2U+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIHNldFRvQ29weSgpIHsgfVxuXHRcdFx0XHRcdG92ZXJyaWRlIGdldFRvQ29weSgpIHtcblx0XHRcdFx0XHRcdHJldHVybiB7IGl0ZW1zOiBbXSwgaXNDb3B5OiB0cnVlIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlU2VsZWN0aW9uc1N0YXRlKHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogeyBzdGFydDogMCwgZW5kOiAxIH0sIHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiAyLCBlbmQ6IDQgfV0gfSwgJ21vZGVsJyk7XG5cdFx0XHRcdGFzc2VydC5vayhydW5DdXRDZWxscyhhY2Nlc3NvciwgZWRpdG9yLCB1bmRlZmluZWQpKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5sZW5ndGgsIDMpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRGb2N1cygpLCB7IHN0YXJ0OiAwLCBlbmQ6IDEgfSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmdldFNlbGVjdGlvbnMoKSwgW3sgc3RhcnQ6IDEsIGVuZDogMyB9XSk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY3V0IGZvY3VzIGNlbGwgc3RpbGwgd29ya3MgaWYgdGhlIGZvY3VzIGlzIG5vdCBwYXJ0IG9mIGFueSBzZWxlY3Rpb24gMicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsncGFyYWdyYXBoIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsncGFyYWdyYXBoIDInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsncGFyYWdyYXBoIDMnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBfZHMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGFjY2Vzc29yLnN0dWIoSU5vdGVib29rU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTm90ZWJvb2tTZXJ2aWNlPigpIHtcblx0XHRcdFx0XHRvdmVycmlkZSBzZXRUb0NvcHkoKSB7IH1cblx0XHRcdFx0XHRvdmVycmlkZSBnZXRUb0NvcHkoKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBpdGVtczogW10sIGlzQ29weTogdHJ1ZSB9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dmlld01vZGVsLnVwZGF0ZVNlbGVjdGlvbnNTdGF0ZSh7IGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCwgZm9jdXM6IHsgc3RhcnQ6IDMsIGVuZDogNCB9LCBzZWxlY3Rpb25zOiBbeyBzdGFydDogMCwgZW5kOiAyIH1dIH0sICdtb2RlbCcpO1xuXHRcdFx0XHRhc3NlcnQub2socnVuQ3V0Q2VsbHMoYWNjZXNzb3IsIGVkaXRvciwgdW5kZWZpbmVkKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwubGVuZ3RoLCAzKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0Rm9jdXMoKSwgeyBzdGFydDogMiwgZW5kOiAzIH0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRTZWxlY3Rpb25zKCksIFt7IHN0YXJ0OiAwLCBlbmQ6IDIgfV0pO1xuXHRcdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0JBQStCLGNBQWMsbUJBQW1CO0FBQ3pFLFNBQVMsVUFBVSxvQkFBb0IsMEJBQTBCO0FBQ2pFLFNBQVMsd0JBQXdCO0FBSWpDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsY0FBYyxpQ0FBaUM7QUFFeEQsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxzQkFBc0IsTUFBTTtBQUNqQywwQ0FBd0M7QUFFeEMsUUFBTSxzQkFBc0IsQ0FBQyxXQUFrQztBQUM5RCxVQUFNLG9CQUFvQixJQUFJLGNBQWMsS0FBeUIsRUFBRTtBQUFBLE1BQzdELFFBQWdCO0FBQ3hCLGVBQU87QUFBQSxNQUNSO0FBQUEsTUFDUyxhQUE4QjtBQUN0QyxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGdCQUFnQyxJQUFJLGNBQWMsS0FBcUIsRUFBRTtBQUFBLE1BQzlFLElBQWEsbUJBQW1EO0FBQy9ELGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFdBQU87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
