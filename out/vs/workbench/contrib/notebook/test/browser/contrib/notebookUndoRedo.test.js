import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { CellEditType, CellKind, SelectionStateType } from "../../../common/notebookCommon.js";
import { createNotebookCellList, withTestNotebook } from "../testNotebookEditor.js";
suite("Notebook Undo/Redo", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("Basics", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, _accessor) => {
        assert.strictEqual(viewModel.length, 2);
        assert.strictEqual(viewModel.getVersionId(), 0);
        assert.strictEqual(viewModel.getAlternativeId(), "0_0,1;1,1");
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 0,
          count: 2,
          cells: []
        }], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(viewModel.length, 0);
        assert.strictEqual(viewModel.getVersionId(), 1);
        assert.strictEqual(viewModel.getAlternativeId(), "1_");
        await viewModel.undo();
        assert.strictEqual(viewModel.length, 2);
        assert.strictEqual(viewModel.getVersionId(), 2);
        assert.strictEqual(viewModel.getAlternativeId(), "0_0,1;1,1");
        await viewModel.redo();
        assert.strictEqual(viewModel.length, 0);
        assert.strictEqual(viewModel.getVersionId(), 3);
        assert.strictEqual(viewModel.getAlternativeId(), "1_");
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 0,
          count: 0,
          cells: [
            { source: "# header 3", language: "markdown", cellKind: CellKind.Markup, outputs: [], mime: void 0 }
          ]
        }], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(viewModel.getVersionId(), 4);
        assert.strictEqual(viewModel.getAlternativeId(), "4_2,1");
        await viewModel.undo();
        assert.strictEqual(viewModel.getVersionId(), 5);
        assert.strictEqual(viewModel.getAlternativeId(), "1_");
      }
    );
  });
  test("Invalid replace count should not throw", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, _viewModel, _ds, _accessor) => {
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 0,
          count: 2,
          cells: []
        }], true, void 0, () => void 0, void 0, true);
        assert.doesNotThrow(() => {
          editor.textModel.applyEdits([{
            editType: CellEditType.Replace,
            index: 0,
            count: 2,
            cells: [
              { source: "# header 2", language: "markdown", cellKind: CellKind.Markup, outputs: [], mime: void 0 }
            ]
          }], true, void 0, () => void 0, void 0, true);
        });
      }
    );
  });
  test("Replace beyond length", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel) => {
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 1,
          count: 2,
          cells: []
        }], true, void 0, () => void 0, void 0, true);
        assert.deepStrictEqual(viewModel.length, 1);
        await viewModel.undo();
        assert.deepStrictEqual(viewModel.length, 2);
      }
    );
  });
  test("Invalid replace count should not affect undo/redo", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, _accessor) => {
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 0,
          count: 2,
          cells: []
        }], true, void 0, () => void 0, void 0, true);
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 0,
          count: 2,
          cells: [
            { source: "# header 2", language: "markdown", cellKind: CellKind.Markup, outputs: [], mime: void 0 }
          ]
        }], true, void 0, () => void 0, void 0, true);
        assert.deepStrictEqual(viewModel.length, 1);
        await viewModel.undo();
        await viewModel.undo();
        assert.deepStrictEqual(viewModel.length, 2);
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 1,
          count: 2,
          cells: []
        }], true, void 0, () => void 0, void 0, true);
        assert.deepStrictEqual(viewModel.length, 1);
      }
    );
  });
  test("Focus/selection update", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        const cellList = createNotebookCellList(accessor, disposables);
        cellList.attachViewModel(viewModel);
        cellList.setFocus([1]);
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 2,
          count: 0,
          cells: [
            { source: "# header 2", language: "markdown", cellKind: CellKind.Markup, outputs: [], mime: void 0 }
          ]
        }], true, { focus: { start: 1, end: 2 }, selections: [{ start: 1, end: 2 }], kind: SelectionStateType.Index }, () => {
          return {
            focus: { start: 2, end: 3 },
            selections: [{ start: 2, end: 3 }],
            kind: SelectionStateType.Index
          };
        }, void 0, true);
        assert.strictEqual(viewModel.length, 3);
        assert.strictEqual(viewModel.getVersionId(), 1);
        assert.deepStrictEqual(cellList.getFocus(), [2]);
        assert.deepStrictEqual(cellList.getSelection(), [2]);
        await viewModel.undo();
        assert.strictEqual(viewModel.length, 2);
        assert.strictEqual(viewModel.getVersionId(), 2);
        assert.deepStrictEqual(cellList.getFocus(), [1]);
        assert.deepStrictEqual(cellList.getSelection(), [1]);
        await viewModel.redo();
        assert.strictEqual(viewModel.length, 3);
        assert.strictEqual(viewModel.getVersionId(), 3);
        assert.deepStrictEqual(cellList.getFocus(), [2]);
        assert.deepStrictEqual(cellList.getSelection(), [2]);
      }
    );
  });
  test("Batch edits", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["body", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 2,
          count: 0,
          cells: [
            { source: "# header 2", language: "markdown", cellKind: CellKind.Markup, outputs: [], mime: void 0 }
          ]
        }, {
          editType: CellEditType.Metadata,
          index: 0,
          metadata: { inputCollapsed: false }
        }], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(viewModel.getVersionId(), 1);
        assert.deepStrictEqual(viewModel.cellAt(0)?.metadata, { inputCollapsed: false });
        await viewModel.undo();
        assert.strictEqual(viewModel.length, 2);
        assert.strictEqual(viewModel.getVersionId(), 2);
        assert.deepStrictEqual(viewModel.cellAt(0)?.metadata, {});
        await viewModel.redo();
        assert.strictEqual(viewModel.length, 3);
        assert.strictEqual(viewModel.getVersionId(), 3);
        assert.deepStrictEqual(viewModel.cellAt(0)?.metadata, { inputCollapsed: false });
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFx0ZXN0XFxicm93c2VyXFxjb250cmliXFxub3RlYm9va1VuZG9SZWRvLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENlbGxFZGl0VHlwZSwgQ2VsbEtpbmQsIFNlbGVjdGlvblN0YXRlVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVOb3RlYm9va0NlbGxMaXN0LCB3aXRoVGVzdE5vdGVib29rIH0gZnJvbSAnLi4vdGVzdE5vdGVib29rRWRpdG9yLmpzJztcblxuc3VpdGUoJ05vdGVib29rIFVuZG8vUmVkbycsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdCYXNpY3MnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciAxJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ2JvZHknLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBfZHMsIF9hY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgMik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0VmVyc2lvbklkKCksIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldEFsdGVybmF0aXZlSWQoKSwgJzBfMCwxOzEsMScpO1xuXG5cdFx0XHRcdGVkaXRvci50ZXh0TW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDAsIGNvdW50OiAyLCBjZWxsczogW11cblx0XHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0VmVyc2lvbklkKCksIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldEFsdGVybmF0aXZlSWQoKSwgJzFfJyk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnVuZG8oKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldFZlcnNpb25JZCgpLCAyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRBbHRlcm5hdGl2ZUlkKCksICcwXzAsMTsxLDEnKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVkbygpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0VmVyc2lvbklkKCksIDMpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldEFsdGVybmF0aXZlSWQoKSwgJzFfJyk7XG5cblx0XHRcdFx0ZWRpdG9yLnRleHRNb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMCwgY291bnQ6IDAsIGNlbGxzOiBbXG5cdFx0XHRcdFx0XHR7IHNvdXJjZTogJyMgaGVhZGVyIDMnLCBsYW5ndWFnZTogJ21hcmtkb3duJywgY2VsbEtpbmQ6IENlbGxLaW5kLk1hcmt1cCwgb3V0cHV0czogW10sIG1pbWU6IHVuZGVmaW5lZCB9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0VmVyc2lvbklkKCksIDQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldEFsdGVybmF0aXZlSWQoKSwgJzRfMiwxJyk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnVuZG8oKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRWZXJzaW9uSWQoKSwgNSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0QWx0ZXJuYXRpdmVJZCgpLCAnMV8nKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdJbnZhbGlkIHJlcGxhY2UgY291bnQgc2hvdWxkIG5vdCB0aHJvdycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnYm9keScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCBfdmlld01vZGVsLCBfZHMsIF9hY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRlZGl0b3IudGV4dE1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAwLCBjb3VudDogMiwgY2VsbHM6IFtdXG5cdFx0XHRcdH1dLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdFx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IHtcblx0XHRcdFx0XHRlZGl0b3IudGV4dE1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDAsIGNvdW50OiAyLCBjZWxsczogW1xuXHRcdFx0XHRcdFx0XHR7IHNvdXJjZTogJyMgaGVhZGVyIDInLCBsYW5ndWFnZTogJ21hcmtkb3duJywgY2VsbEtpbmQ6IENlbGxLaW5kLk1hcmt1cCwgb3V0cHV0czogW10sIG1pbWU6IHVuZGVmaW5lZCB9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdSZXBsYWNlIGJleW9uZCBsZW5ndGgnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciAxJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ2JvZHknLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRcdGVkaXRvci50ZXh0TW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDEsIGNvdW50OiAyLCBjZWxsczogW11cblx0XHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC51bmRvKCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgMik7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnSW52YWxpZCByZXBsYWNlIGNvdW50IHNob3VsZCBub3QgYWZmZWN0IHVuZG8vcmVkbycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnYm9keScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIF9kcywgX2FjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGVkaXRvci50ZXh0TW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDAsIGNvdW50OiAyLCBjZWxsczogW11cblx0XHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0XHRcdGVkaXRvci50ZXh0TW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDAsIGNvdW50OiAyLCBjZWxsczogW1xuXHRcdFx0XHRcdFx0eyBzb3VyY2U6ICcjIGhlYWRlciAyJywgbGFuZ3VhZ2U6ICdtYXJrZG93bicsIGNlbGxLaW5kOiBDZWxsS2luZC5NYXJrdXAsIG91dHB1dHM6IFtdLCBtaW1lOiB1bmRlZmluZWQgfVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgMSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnVuZG8oKTtcblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnVuZG8oKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5sZW5ndGgsIDIpO1xuXHRcdFx0XHRlZGl0b3IudGV4dE1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAxLCBjb3VudDogMiwgY2VsbHM6IFtdXG5cdFx0XHRcdH1dLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwubGVuZ3RoLCAxKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdGb2N1cy9zZWxlY3Rpb24gdXBkYXRlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wydib2R5JywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCwgX2RzLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRjb25zdCBjZWxsTGlzdCA9IGNyZWF0ZU5vdGVib29rQ2VsbExpc3QoYWNjZXNzb3IsIGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0Y2VsbExpc3QuYXR0YWNoVmlld01vZGVsKHZpZXdNb2RlbCk7XG5cdFx0XHRcdGNlbGxMaXN0LnNldEZvY3VzKFsxXSk7XG5cblx0XHRcdFx0ZWRpdG9yLnRleHRNb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMiwgY291bnQ6IDAsIGNlbGxzOiBbXG5cdFx0XHRcdFx0XHR7IHNvdXJjZTogJyMgaGVhZGVyIDInLCBsYW5ndWFnZTogJ21hcmtkb3duJywgY2VsbEtpbmQ6IENlbGxLaW5kLk1hcmt1cCwgb3V0cHV0czogW10sIG1pbWU6IHVuZGVmaW5lZCB9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XSwgdHJ1ZSwgeyBmb2N1czogeyBzdGFydDogMSwgZW5kOiAyIH0sIHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiAxLCBlbmQ6IDIgfV0sIGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleCB9LCAoKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGZvY3VzOiB7IHN0YXJ0OiAyLCBlbmQ6IDMgfSwgc2VsZWN0aW9uczogW3sgc3RhcnQ6IDIsIGVuZDogMyB9XSwga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5sZW5ndGgsIDMpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldFZlcnNpb25JZCgpLCAxKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRGb2N1cygpLCBbMl0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LmdldFNlbGVjdGlvbigpLCBbMl0pO1xuXG5cdFx0XHRcdGF3YWl0IHZpZXdNb2RlbC51bmRvKCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwubGVuZ3RoLCAyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRWZXJzaW9uSWQoKSwgMik7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0Rm9jdXMoKSwgWzFdKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRTZWxlY3Rpb24oKSwgWzFdKTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVkbygpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgMyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0VmVyc2lvbklkKCksIDMpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNlbGxMaXN0LmdldEZvY3VzKCksIFsyXSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0U2VsZWN0aW9uKCksIFsyXSk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnQmF0Y2ggZWRpdHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciAxJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ2JvZHknLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBfZHMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGVkaXRvci50ZXh0TW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDIsIGNvdW50OiAwLCBjZWxsczogW1xuXHRcdFx0XHRcdFx0eyBzb3VyY2U6ICcjIGhlYWRlciAyJywgbGFuZ3VhZ2U6ICdtYXJrZG93bicsIGNlbGxLaW5kOiBDZWxsS2luZC5NYXJrdXAsIG91dHB1dHM6IFtdLCBtaW1lOiB1bmRlZmluZWQgfVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuTWV0YWRhdGEsIGluZGV4OiAwLCBtZXRhZGF0YTogeyBpbnB1dENvbGxhcHNlZDogZmFsc2UgfVxuXHRcdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0VmVyc2lvbklkKCksIDEpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5jZWxsQXQoMCk/Lm1ldGFkYXRhLCB7IGlucHV0Q29sbGFwc2VkOiBmYWxzZSB9KTtcblxuXHRcdFx0XHRhd2FpdCB2aWV3TW9kZWwudW5kbygpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmxlbmd0aCwgMik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0VmVyc2lvbklkKCksIDIpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5jZWxsQXQoMCk/Lm1ldGFkYXRhLCB7fSk7XG5cblx0XHRcdFx0YXdhaXQgdmlld01vZGVsLnJlZG8oKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdNb2RlbC5sZW5ndGgsIDMpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld01vZGVsLmdldFZlcnNpb25JZCgpLCAzKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuY2VsbEF0KDApPy5tZXRhZGF0YSwgeyBpbnB1dENvbGxhcHNlZDogZmFsc2UgfSk7XG5cblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsY0FBYyxVQUFVLDBCQUEwQjtBQUMzRCxTQUFTLHdCQUF3Qix3QkFBd0I7QUFFekQsTUFBTSxzQkFBc0IsTUFBTTtBQUNqQyxRQUFNLGNBQWMsd0NBQXdDO0FBRTVELE9BQUssVUFBVSxpQkFBa0I7QUFDaEMsVUFBTTtBQUFBLE1BQ0w7QUFBQSxRQUNDLENBQUMsY0FBYyxZQUFZLFNBQVMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsUUFDbEQsQ0FBQyxRQUFRLFlBQVksU0FBUyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxNQUM3QztBQUFBLE1BQ0EsT0FBTyxRQUFRLFdBQVcsS0FBSyxjQUFjO0FBQzVDLGVBQU8sWUFBWSxVQUFVLFFBQVEsQ0FBQztBQUN0QyxlQUFPLFlBQVksVUFBVSxhQUFhLEdBQUcsQ0FBQztBQUM5QyxlQUFPLFlBQVksVUFBVSxpQkFBaUIsR0FBRyxX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
