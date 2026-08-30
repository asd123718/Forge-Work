import assert from "assert";
import { Event } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { assertSnapshot } from "../../../../../base/test/common/snapshot.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ILanguageFeaturesService } from "../../../../../editor/common/services/languageFeatures.js";
import { LanguageFeaturesService } from "../../../../../editor/common/services/languageFeaturesService.js";
import { NotebookCellOutline } from "../../browser/contrib/outline/notebookOutline.js";
import { computeContent } from "../../browser/viewParts/notebookEditorStickyScroll.js";
import { CellKind } from "../../common/notebookCommon.js";
import { createNotebookCellList, setupInstantiationService, withTestNotebook } from "./testNotebookEditor.js";
import { OutlineTarget } from "../../../../services/outline/browser/outline.js";
suite("NotebookEditorStickyScroll", () => {
  let disposables;
  let instantiationService;
  const domNode = document.createElement("div");
  teardown(() => {
    disposables.dispose();
  });
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    disposables = new DisposableStore();
    instantiationService = setupInstantiationService(disposables);
    instantiationService.set(ILanguageFeaturesService, new LanguageFeaturesService());
  });
  function getOutline(editor) {
    if (!editor.hasModel()) {
      assert.ok(false, "MUST have active text editor");
    }
    const outline = store.add(instantiationService.createInstance(NotebookCellOutline, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeModel = Event.None;
        this.onDidChangeSelection = Event.None;
      }
      getControl() {
        return editor;
      }
    }(), OutlineTarget.QuickPick));
    return outline;
  }
  function nbStickyTestHelper(domNode2, notebookEditor, notebookCellList, notebookOutlineEntries, disposables2) {
    const output = computeContent(notebookEditor, notebookCellList, notebookOutlineEntries, 0);
    for (const stickyLine of output.values()) {
      disposables2.add(stickyLine.line);
    }
    return createStickyTestElement(output.values());
  }
  function createStickyTestElement(stickyLines) {
    const outputElements = [];
    for (const stickyLine of stickyLines) {
      if (stickyLine.rendered) {
        outputElements.unshift(stickyLine.line.element.innerText);
      }
    }
    return outputElements;
  }
  test("test0: should render empty, 	scrollTop at 0", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["## header aa", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var c = 2;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel) => {
        viewModel.restoreEditorViewState({
          editingCells: Array.from({ length: 8 }, () => false),
          editorViewStates: Array.from({ length: 8 }, () => null),
          cellTotalHeights: Array.from({ length: 8 }, () => 50),
          cellLineNumberStates: {},
          collapsedInputCells: {},
          collapsedOutputCells: {}
        });
        const cellList = disposables.add(createNotebookCellList(instantiationService, disposables));
        cellList.attachViewModel(viewModel);
        cellList.layout(400, 100);
        editor.setScrollTop(0);
        editor.visibleRanges = [{ start: 0, end: 8 }];
        const outline = getOutline(editor);
        const notebookOutlineEntries = outline.entries;
        const resultingMap = nbStickyTestHelper(domNode, editor, cellList, notebookOutlineEntries, disposables);
        await assertSnapshot(resultingMap);
        outline.dispose();
      }
    );
  });
  test("test1: should render 0->1, 	visible range 3->8", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        // 0
        ["## header aa", "markdown", CellKind.Markup, [], {}],
        // 50
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        // 100
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        // 150
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        // 200
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        // 250
        ["# header b", "markdown", CellKind.Markup, [], {}],
        // 300
        ["var c = 2;", "javascript", CellKind.Code, [], {}]
        // 350
      ],
      async (editor, viewModel, ds) => {
        viewModel.restoreEditorViewState({
          editingCells: Array.from({ length: 8 }, () => false),
          editorViewStates: Array.from({ length: 8 }, () => null),
          cellTotalHeights: Array.from({ length: 8 }, () => 50),
          cellLineNumberStates: {},
          collapsedInputCells: {},
          collapsedOutputCells: {}
        });
        const cellList = ds.add(createNotebookCellList(instantiationService, ds));
        cellList.attachViewModel(viewModel);
        cellList.layout(400, 100);
        editor.setScrollTop(175);
        editor.visibleRanges = [{ start: 3, end: 8 }];
        const outline = getOutline(editor);
        const notebookOutlineEntries = outline.entries;
        const resultingMap = nbStickyTestHelper(domNode, editor, cellList, notebookOutlineEntries, ds);
        await assertSnapshot(resultingMap);
        outline.dispose();
      }
    );
  });
  test("test2: should render 0, 		visible range 6->9 so collapsing next 2 against following section", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        // 0
        ["## header aa", "markdown", CellKind.Markup, [], {}],
        // 50
        ["### header aaa", "markdown", CellKind.Markup, [], {}],
        // 100
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        // 150
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        // 200
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        // 250
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        // 300
        ["# header b", "markdown", CellKind.Markup, [], {}],
        // 350
        ["var c = 2;", "javascript", CellKind.Code, [], {}]
        // 400
      ],
      async (editor, viewModel, ds) => {
        viewModel.restoreEditorViewState({
          editingCells: Array.from({ length: 9 }, () => false),
          editorViewStates: Array.from({ length: 9 }, () => null),
          cellTotalHeights: Array.from({ length: 9 }, () => 50),
          cellLineNumberStates: {},
          collapsedInputCells: {},
          collapsedOutputCells: {}
        });
        const cellList = ds.add(createNotebookCellList(instantiationService, ds));
        cellList.attachViewModel(viewModel);
        cellList.layout(400, 100);
        editor.setScrollTop(325);
        editor.visibleRanges = [{ start: 6, end: 9 }];
        const outline = getOutline(editor);
        const notebookOutlineEntries = outline.entries;
        const resultingMap = nbStickyTestHelper(domNode, editor, cellList, notebookOutlineEntries, ds);
        await assertSnapshot(resultingMap);
        outline.dispose();
      }
    );
  });
  test("test3: should render 0->2, 	collapsing against equivalent level header", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        // 0
        ["## header aa", "markdown", CellKind.Markup, [], {}],
        // 50
        ["### header aaa", "markdown", CellKind.Markup, [], {}],
        // 100
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        // 150
        ["### header aab", "markdown", CellKind.Markup, [], {}],
        // 200
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        // 250
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        // 300
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        // 350
        ["# header b", "markdown", CellKind.Markup, [], {}],
        // 400
        ["var c = 2;", "javascript", CellKind.Code, [], {}]
        // 450
      ],
      async (editor, viewModel, ds) => {
        viewModel.restoreEditorViewState({
          editingCells: Array.from({ length: 10 }, () => false),
          editorViewStates: Array.from({ length: 10 }, () => null),
          cellTotalHeights: Array.from({ length: 10 }, () => 50),
          cellLineNumberStates: {},
          collapsedInputCells: {},
          collapsedOutputCells: {}
        });
        const cellList = ds.add(createNotebookCellList(instantiationService, ds));
        cellList.attachViewModel(viewModel);
        cellList.layout(400, 100);
        editor.setScrollTop(175);
        editor.visibleRanges = [{ start: 3, end: 10 }];
        const outline = getOutline(editor);
        const notebookOutlineEntries = outline.entries;
        const resultingMap = nbStickyTestHelper(domNode, editor, cellList, notebookOutlineEntries, ds);
        await assertSnapshot(resultingMap);
        outline.dispose();
      }
    );
  });
  test("test4: should render 0, 		scrolltop halfway through cell 0", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["## header aa", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var c = 2;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel, ds) => {
        viewModel.restoreEditorViewState({
          editingCells: Array.from({ length: 8 }, () => false),
          editorViewStates: Array.from({ length: 8 }, () => null),
          cellTotalHeights: Array.from({ length: 8 }, () => 50),
          cellLineNumberStates: {},
          collapsedInputCells: {},
          collapsedOutputCells: {}
        });
        const cellList = ds.add(createNotebookCellList(instantiationService, ds));
        cellList.attachViewModel(viewModel);
        cellList.layout(400, 100);
        editor.setScrollTop(50);
        editor.visibleRanges = [{ start: 0, end: 8 }];
        const outline = getOutline(editor);
        const notebookOutlineEntries = outline.entries;
        const resultingMap = nbStickyTestHelper(domNode, editor, cellList, notebookOutlineEntries, ds);
        await assertSnapshot(resultingMap);
        outline.dispose();
      }
    );
  });
  test("test5: should render 0->2, 	scrolltop halfway through cell 2", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["## header aa", "markdown", CellKind.Markup, [], {}],
        ["### header aaa", "markdown", CellKind.Markup, [], {}],
        ["#### header aaaa", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["var c = 2;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel, ds) => {
        viewModel.restoreEditorViewState({
          editingCells: Array.from({ length: 10 }, () => false),
          editorViewStates: Array.from({ length: 10 }, () => null),
          cellTotalHeights: Array.from({ length: 10 }, () => 50),
          cellLineNumberStates: {},
          collapsedInputCells: {},
          collapsedOutputCells: {}
        });
        const cellList = ds.add(createNotebookCellList(instantiationService, ds));
        cellList.attachViewModel(viewModel);
        cellList.layout(400, 100);
        editor.setScrollTop(125);
        editor.visibleRanges = [{ start: 2, end: 10 }];
        const outline = getOutline(editor);
        const notebookOutlineEntries = outline.entries;
        const resultingMap = nbStickyTestHelper(domNode, editor, cellList, notebookOutlineEntries, ds);
        await assertSnapshot(resultingMap);
        outline.dispose();
      }
    );
  });
  test("test6: should render 6->7, 	scrolltop halfway through cell 7", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        ["## header aa", "markdown", CellKind.Markup, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header b", "markdown", CellKind.Markup, [], {}],
        ["## header bb", "markdown", CellKind.Markup, [], {}],
        ["### header bbb", "markdown", CellKind.Markup, [], {}],
        ["var c = 2;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel, ds) => {
        viewModel.restoreEditorViewState({
          editingCells: Array.from({ length: 10 }, () => false),
          editorViewStates: Array.from({ length: 10 }, () => null),
          cellTotalHeights: Array.from({ length: 10 }, () => 50),
          cellLineNumberStates: {},
          collapsedInputCells: {},
          collapsedOutputCells: {}
        });
        const cellList = ds.add(createNotebookCellList(instantiationService, ds));
        cellList.attachViewModel(viewModel);
        cellList.layout(400, 100);
        editor.setScrollTop(375);
        editor.visibleRanges = [{ start: 7, end: 10 }];
        const outline = getOutline(editor);
        const notebookOutlineEntries = outline.entries;
        const resultingMap = nbStickyTestHelper(domNode, editor, cellList, notebookOutlineEntries, ds);
        await assertSnapshot(resultingMap);
        outline.dispose();
      }
    );
  });
  test("test7: should render 0->1, 	collapsing against next section", async function() {
    await withTestNotebook(
      [
        ["# header a", "markdown", CellKind.Markup, [], {}],
        //0
        ["## header aa", "markdown", CellKind.Markup, [], {}],
        //50
        ["### header aaa", "markdown", CellKind.Markup, [], {}],
        //100
        ["#### header aaaa", "markdown", CellKind.Markup, [], {}],
        //150
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        //200
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        //250
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        //300
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        //350
        ["# header b", "markdown", CellKind.Markup, [], {}],
        //400
        ["## header bb", "markdown", CellKind.Markup, [], {}],
        //450
        ["### header bbb", "markdown", CellKind.Markup, [], {}],
        ["var c = 2;", "javascript", CellKind.Code, [], {}]
      ],
      async (editor, viewModel, ds) => {
        viewModel.restoreEditorViewState({
          editingCells: Array.from({ length: 12 }, () => false),
          editorViewStates: Array.from({ length: 12 }, () => null),
          cellTotalHeights: Array.from({ length: 12 }, () => 50),
          cellLineNumberStates: {},
          collapsedInputCells: {},
          collapsedOutputCells: {}
        });
        const cellList = ds.add(createNotebookCellList(instantiationService, ds));
        cellList.attachViewModel(viewModel);
        cellList.layout(400, 100);
        editor.setScrollTop(350);
        editor.visibleRanges = [{ start: 7, end: 12 }];
        const outline = getOutline(editor);
        const notebookOutlineEntries = outline.entries;
        const resultingMap = nbStickyTestHelper(domNode, editor, cellList, notebookOutlineEntries, ds);
        await assertSnapshot(resultingMap);
        outline.dispose();
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFx0ZXN0XFxicm93c2VyXFxub3RlYm9va1N0aWNreVNjcm9sbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBhc3NlcnRTbmFwc2hvdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vc25hcHNob3QuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IE5vdGVib29rQ2VsbE91dGxpbmUgfSBmcm9tICcuLi8uLi9icm93c2VyL2NvbnRyaWIvb3V0bGluZS9ub3RlYm9va091dGxpbmUuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRWRpdG9yLCBJTm90ZWJvb2tFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rQ2VsbExpc3QgfSBmcm9tICcuLi8uLi9icm93c2VyL3ZpZXcvbm90ZWJvb2tSZW5kZXJpbmdDb21tb24uanMnO1xuaW1wb3J0IHsgT3V0bGluZUVudHJ5IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci92aWV3TW9kZWwvT3V0bGluZUVudHJ5LmpzJztcbmltcG9ydCB7IE5vdGVib29rU3RpY2t5TGluZSwgY29tcHV0ZUNvbnRlbnQgfSBmcm9tICcuLi8uLi9icm93c2VyL3ZpZXdQYXJ0cy9ub3RlYm9va0VkaXRvclN0aWNreVNjcm9sbC5qcyc7XG5pbXBvcnQgeyBDZWxsS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBjcmVhdGVOb3RlYm9va0NlbGxMaXN0LCBzZXR1cEluc3RhbnRpYXRpb25TZXJ2aWNlLCB3aXRoVGVzdE5vdGVib29rIH0gZnJvbSAnLi90ZXN0Tm90ZWJvb2tFZGl0b3IuanMnO1xuaW1wb3J0IHsgT3V0bGluZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL291dGxpbmUvYnJvd3Nlci9vdXRsaW5lLmpzJztcblxuc3VpdGUoJ05vdGVib29rRWRpdG9yU3RpY2t5U2Nyb2xsJywgKCkgPT4ge1xuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cblx0Y29uc3QgZG9tTm9kZTogSFRNTEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHNldHVwSW5zdGFudGlhdGlvblNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsIG5ldyBMYW5ndWFnZUZlYXR1cmVzU2VydmljZSgpKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gZ2V0T3V0bGluZShlZGl0b3I6IGFueSkge1xuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdGFzc2VydC5vayhmYWxzZSwgJ01VU1QgaGF2ZSBhY3RpdmUgdGV4dCBlZGl0b3InKTtcblx0XHR9XG5cdFx0Y29uc3Qgb3V0bGluZSA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9va0NlbGxPdXRsaW5lLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va0VkaXRvclBhbmU+KCkge1xuXHRcdFx0b3ZlcnJpZGUgZ2V0Q29udHJvbCgpIHtcblx0XHRcdFx0cmV0dXJuIGVkaXRvcjtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIG9uRGlkQ2hhbmdlTW9kZWw6IEV2ZW50PHZvaWQ+ID0gRXZlbnQuTm9uZTtcblx0XHRcdG92ZXJyaWRlIG9uRGlkQ2hhbmdlU2VsZWN0aW9uOiBFdmVudDxJRWRpdG9yUGFuZVNlbGVjdGlvbkNoYW5nZUV2ZW50PiA9IEV2ZW50Lk5vbmU7XG5cdFx0fSwgT3V0bGluZVRhcmdldC5RdWlja1BpY2spKTtcblx0XHRyZXR1cm4gb3V0bGluZTtcblx0fVxuXG5cdGZ1bmN0aW9uIG5iU3RpY2t5VGVzdEhlbHBlcihkb21Ob2RlOiBIVE1MRWxlbWVudCwgbm90ZWJvb2tFZGl0b3I6IElOb3RlYm9va0VkaXRvciwgbm90ZWJvb2tDZWxsTGlzdDogSU5vdGVib29rQ2VsbExpc3QsIG5vdGVib29rT3V0bGluZUVudHJpZXM6IE91dGxpbmVFbnRyeVtdLCBkaXNwb3NhYmxlczogUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPikge1xuXHRcdGNvbnN0IG91dHB1dCA9IGNvbXB1dGVDb250ZW50KG5vdGVib29rRWRpdG9yLCBub3RlYm9va0NlbGxMaXN0LCBub3RlYm9va091dGxpbmVFbnRyaWVzLCAwKTtcblx0XHRmb3IgKGNvbnN0IHN0aWNreUxpbmUgb2Ygb3V0cHV0LnZhbHVlcygpKSB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc3RpY2t5TGluZS5saW5lKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNyZWF0ZVN0aWNreVRlc3RFbGVtZW50KG91dHB1dC52YWx1ZXMoKSk7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVTdGlja3lUZXN0RWxlbWVudChzdGlja3lMaW5lczogSXRlcmFibGVJdGVyYXRvcjx7IGxpbmU6IE5vdGVib29rU3RpY2t5TGluZTsgcmVuZGVyZWQ6IGJvb2xlYW4gfT4pIHtcblx0XHRjb25zdCBvdXRwdXRFbGVtZW50cyA9IFtdO1xuXHRcdGZvciAoY29uc3Qgc3RpY2t5TGluZSBvZiBzdGlja3lMaW5lcykge1xuXHRcdFx0aWYgKHN0aWNreUxpbmUucmVuZGVyZWQpIHtcblx0XHRcdFx0b3V0cHV0RWxlbWVudHMudW5zaGlmdChzdGlja3lMaW5lLmxpbmUuZWxlbWVudC5pbm5lclRleHQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gb3V0cHV0RWxlbWVudHM7XG5cdH1cblxuXHR0ZXN0KCd0ZXN0MDogc2hvdWxkIHJlbmRlciBlbXB0eSwgXHRzY3JvbGxUb3AgYXQgMCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIGEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyMgaGVhZGVyIGFhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgYicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYyA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRcdHZpZXdNb2RlbC5yZXN0b3JlRWRpdG9yVmlld1N0YXRlKHtcblx0XHRcdFx0XHRlZGl0aW5nQ2VsbHM6IEFycmF5LmZyb20oeyBsZW5ndGg6IDggfSwgKCkgPT4gZmFsc2UpLFxuXHRcdFx0XHRcdGVkaXRvclZpZXdTdGF0ZXM6IEFycmF5LmZyb20oeyBsZW5ndGg6IDggfSwgKCkgPT4gbnVsbCksXG5cdFx0XHRcdFx0Y2VsbFRvdGFsSGVpZ2h0czogQXJyYXkuZnJvbSh7IGxlbmd0aDogOCB9LCAoKSA9PiA1MCksXG5cdFx0XHRcdFx0Y2VsbExpbmVOdW1iZXJTdGF0ZXM6IHt9LFxuXHRcdFx0XHRcdGNvbGxhcHNlZElucHV0Q2VsbHM6IHt9LFxuXHRcdFx0XHRcdGNvbGxhcHNlZE91dHB1dENlbGxzOiB7fSxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgY2VsbExpc3QgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlTm90ZWJvb2tDZWxsTGlzdChpbnN0YW50aWF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXMpKTtcblx0XHRcdFx0Y2VsbExpc3QuYXR0YWNoVmlld01vZGVsKHZpZXdNb2RlbCk7XG5cdFx0XHRcdGNlbGxMaXN0LmxheW91dCg0MDAsIDEwMCk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNjcm9sbFRvcCgwKTtcblx0XHRcdFx0ZWRpdG9yLnZpc2libGVSYW5nZXMgPSBbeyBzdGFydDogMCwgZW5kOiA4IH1dO1xuXG5cdFx0XHRcdGNvbnN0IG91dGxpbmUgPSBnZXRPdXRsaW5lKGVkaXRvcik7XG5cdFx0XHRcdGNvbnN0IG5vdGVib29rT3V0bGluZUVudHJpZXMgPSBvdXRsaW5lLmVudHJpZXM7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdGluZ01hcCA9IG5iU3RpY2t5VGVzdEhlbHBlcihkb21Ob2RlLCBlZGl0b3IsIGNlbGxMaXN0LCBub3RlYm9va091dGxpbmVFbnRyaWVzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydFNuYXBzaG90KHJlc3VsdGluZ01hcCk7XG5cdFx0XHRcdG91dGxpbmUuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rlc3QxOiBzaG91bGQgcmVuZGVyIDAtPjEsIFx0dmlzaWJsZSByYW5nZSAzLT44JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgYScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcdC8vIDBcblx0XHRcdFx0WycjIyBoZWFkZXIgYWEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXHQvLyA1MFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXHQvLyAxMDBcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFx0Ly8gMTUwXG5cdFx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcdC8vIDIwMFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXHQvLyAyNTBcblx0XHRcdFx0WycjIGhlYWRlciBiJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFx0Ly8gMzAwXG5cdFx0XHRcdFsndmFyIGMgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVx0XHQvLyAzNTBcblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIGRzKSA9PiB7XG5cdFx0XHRcdHZpZXdNb2RlbC5yZXN0b3JlRWRpdG9yVmlld1N0YXRlKHtcblx0XHRcdFx0XHRlZGl0aW5nQ2VsbHM6IEFycmF5LmZyb20oeyBsZW5ndGg6IDggfSwgKCkgPT4gZmFsc2UpLFxuXHRcdFx0XHRcdGVkaXRvclZpZXdTdGF0ZXM6IEFycmF5LmZyb20oeyBsZW5ndGg6IDggfSwgKCkgPT4gbnVsbCksXG5cdFx0XHRcdFx0Y2VsbFRvdGFsSGVpZ2h0czogQXJyYXkuZnJvbSh7IGxlbmd0aDogOCB9LCAoKSA9PiA1MCksXG5cdFx0XHRcdFx0Y2VsbExpbmVOdW1iZXJTdGF0ZXM6IHt9LFxuXHRcdFx0XHRcdGNvbGxhcHNlZElucHV0Q2VsbHM6IHt9LFxuXHRcdFx0XHRcdGNvbGxhcHNlZE91dHB1dENlbGxzOiB7fSxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgY2VsbExpc3QgPSBkcy5hZGQoY3JlYXRlTm90ZWJvb2tDZWxsTGlzdChpbnN0YW50aWF0aW9uU2VydmljZSwgZHMpKTtcblx0XHRcdFx0Y2VsbExpc3QuYXR0YWNoVmlld01vZGVsKHZpZXdNb2RlbCk7XG5cdFx0XHRcdGNlbGxMaXN0LmxheW91dCg0MDAsIDEwMCk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNjcm9sbFRvcCgxNzUpO1xuXHRcdFx0XHRlZGl0b3IudmlzaWJsZVJhbmdlcyA9IFt7IHN0YXJ0OiAzLCBlbmQ6IDggfV07XG5cblx0XHRcdFx0Y29uc3Qgb3V0bGluZSA9IGdldE91dGxpbmUoZWRpdG9yKTtcblx0XHRcdFx0Y29uc3Qgbm90ZWJvb2tPdXRsaW5lRW50cmllcyA9IG91dGxpbmUuZW50cmllcztcblx0XHRcdFx0Y29uc3QgcmVzdWx0aW5nTWFwID0gbmJTdGlja3lUZXN0SGVscGVyKGRvbU5vZGUsIGVkaXRvciwgY2VsbExpc3QsIG5vdGVib29rT3V0bGluZUVudHJpZXMsIGRzKTtcblxuXHRcdFx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHRpbmdNYXApO1xuXHRcdFx0XHRvdXRsaW5lLmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXN0Mjogc2hvdWxkIHJlbmRlciAwLCBcdFx0dmlzaWJsZSByYW5nZSA2LT45IHNvIGNvbGxhcHNpbmcgbmV4dCAyIGFnYWluc3QgZm9sbG93aW5nIHNlY3Rpb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciBhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFx0Ly8gMFxuXHRcdFx0XHRbJyMjIGhlYWRlciBhYScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcdC8vIDUwXG5cdFx0XHRcdFsnIyMjIGhlYWRlciBhYWEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sLy8gMTAwXG5cdFx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcdC8vIDE1MFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXHQvLyAyMDBcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFx0Ly8gMjUwXG5cdFx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcdC8vIDMwMFxuXHRcdFx0XHRbJyMgaGVhZGVyIGInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXHQvLyAzNTBcblx0XHRcdFx0Wyd2YXIgYyA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXHRcdC8vIDQwMFxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCwgZHMpID0+IHtcblx0XHRcdFx0dmlld01vZGVsLnJlc3RvcmVFZGl0b3JWaWV3U3RhdGUoe1xuXHRcdFx0XHRcdGVkaXRpbmdDZWxsczogQXJyYXkuZnJvbSh7IGxlbmd0aDogOSB9LCAoKSA9PiBmYWxzZSksXG5cdFx0XHRcdFx0ZWRpdG9yVmlld1N0YXRlczogQXJyYXkuZnJvbSh7IGxlbmd0aDogOSB9LCAoKSA9PiBudWxsKSxcblx0XHRcdFx0XHRjZWxsVG90YWxIZWlnaHRzOiBBcnJheS5mcm9tKHsgbGVuZ3RoOiA5IH0sICgpID0+IDUwKSxcblx0XHRcdFx0XHRjZWxsTGluZU51bWJlclN0YXRlczoge30sXG5cdFx0XHRcdFx0Y29sbGFwc2VkSW5wdXRDZWxsczoge30sXG5cdFx0XHRcdFx0Y29sbGFwc2VkT3V0cHV0Q2VsbHM6IHt9LFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCBjZWxsTGlzdCA9IGRzLmFkZChjcmVhdGVOb3RlYm9va0NlbGxMaXN0KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkcykpO1xuXHRcdFx0XHRjZWxsTGlzdC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblx0XHRcdFx0Y2VsbExpc3QubGF5b3V0KDQwMCwgMTAwKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2Nyb2xsVG9wKDMyNSk7IC8vIHJvb20gZm9yIGEgc2luZ2xlIGhlYWRlclxuXHRcdFx0XHRlZGl0b3IudmlzaWJsZVJhbmdlcyA9IFt7IHN0YXJ0OiA2LCBlbmQ6IDkgfV07XG5cblx0XHRcdFx0Y29uc3Qgb3V0bGluZSA9IGdldE91dGxpbmUoZWRpdG9yKTtcblx0XHRcdFx0Y29uc3Qgbm90ZWJvb2tPdXRsaW5lRW50cmllcyA9IG91dGxpbmUuZW50cmllcztcblx0XHRcdFx0Y29uc3QgcmVzdWx0aW5nTWFwID0gbmJTdGlja3lUZXN0SGVscGVyKGRvbU5vZGUsIGVkaXRvciwgY2VsbExpc3QsIG5vdGVib29rT3V0bGluZUVudHJpZXMsIGRzKTtcblxuXHRcdFx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHRpbmdNYXApO1xuXHRcdFx0XHRvdXRsaW5lLmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXN0Mzogc2hvdWxkIHJlbmRlciAwLT4yLCBcdGNvbGxhcHNpbmcgYWdhaW5zdCBlcXVpdmFsZW50IGxldmVsIGhlYWRlcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIGEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXHQvLyAwXG5cdFx0XHRcdFsnIyMgaGVhZGVyIGFhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFx0Ly8gNTBcblx0XHRcdFx0WycjIyMgaGVhZGVyIGFhYScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSwvLyAxMDBcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFx0Ly8gMTUwXG5cdFx0XHRcdFsnIyMjIGhlYWRlciBhYWInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sLy8gMjAwXG5cdFx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcdC8vIDI1MFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXHQvLyAzMDBcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFx0Ly8gMzUwXG5cdFx0XHRcdFsnIyBoZWFkZXIgYicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcdC8vIDQwMFxuXHRcdFx0XHRbJ3ZhciBjID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cdFx0Ly8gNDUwXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBkcykgPT4ge1xuXHRcdFx0XHR2aWV3TW9kZWwucmVzdG9yZUVkaXRvclZpZXdTdGF0ZSh7XG5cdFx0XHRcdFx0ZWRpdGluZ0NlbGxzOiBBcnJheS5mcm9tKHsgbGVuZ3RoOiAxMCB9LCAoKSA9PiBmYWxzZSksXG5cdFx0XHRcdFx0ZWRpdG9yVmlld1N0YXRlczogQXJyYXkuZnJvbSh7IGxlbmd0aDogMTAgfSwgKCkgPT4gbnVsbCksXG5cdFx0XHRcdFx0Y2VsbFRvdGFsSGVpZ2h0czogQXJyYXkuZnJvbSh7IGxlbmd0aDogMTAgfSwgKCkgPT4gNTApLFxuXHRcdFx0XHRcdGNlbGxMaW5lTnVtYmVyU3RhdGVzOiB7fSxcblx0XHRcdFx0XHRjb2xsYXBzZWRJbnB1dENlbGxzOiB7fSxcblx0XHRcdFx0XHRjb2xsYXBzZWRPdXRwdXRDZWxsczoge30sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IGNlbGxMaXN0ID0gZHMuYWRkKGNyZWF0ZU5vdGVib29rQ2VsbExpc3QoaW5zdGFudGlhdGlvblNlcnZpY2UsIGRzKSk7XG5cdFx0XHRcdGNlbGxMaXN0LmF0dGFjaFZpZXdNb2RlbCh2aWV3TW9kZWwpO1xuXHRcdFx0XHRjZWxsTGlzdC5sYXlvdXQoNDAwLCAxMDApO1xuXG5cdFx0XHRcdGVkaXRvci5zZXRTY3JvbGxUb3AoMTc1KTsgLy8gcm9vbSBmb3IgYSBzaW5nbGUgaGVhZGVyXG5cdFx0XHRcdGVkaXRvci52aXNpYmxlUmFuZ2VzID0gW3sgc3RhcnQ6IDMsIGVuZDogMTAgfV07XG5cblx0XHRcdFx0Y29uc3Qgb3V0bGluZSA9IGdldE91dGxpbmUoZWRpdG9yKTtcblx0XHRcdFx0Y29uc3Qgbm90ZWJvb2tPdXRsaW5lRW50cmllcyA9IG91dGxpbmUuZW50cmllcztcblx0XHRcdFx0Y29uc3QgcmVzdWx0aW5nTWFwID0gbmJTdGlja3lUZXN0SGVscGVyKGRvbU5vZGUsIGVkaXRvciwgY2VsbExpc3QsIG5vdGVib29rT3V0bGluZUVudHJpZXMsIGRzKTtcblxuXHRcdFx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHRpbmdNYXApO1xuXHRcdFx0XHRvdXRsaW5lLmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHQvLyBvdXRkYXRlZC9pbXByb3BlciBiZWhhdmlvclxuXHR0ZXN0KCd0ZXN0NDogc2hvdWxkIHJlbmRlciAwLCBcdFx0c2Nyb2xsdG9wIGhhbGZ3YXkgdGhyb3VnaCBjZWxsIDAnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciBhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJyMjIGhlYWRlciBhYScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGMgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCwgZHMpID0+IHtcblx0XHRcdFx0dmlld01vZGVsLnJlc3RvcmVFZGl0b3JWaWV3U3RhdGUoe1xuXHRcdFx0XHRcdGVkaXRpbmdDZWxsczogQXJyYXkuZnJvbSh7IGxlbmd0aDogOCB9LCAoKSA9PiBmYWxzZSksXG5cdFx0XHRcdFx0ZWRpdG9yVmlld1N0YXRlczogQXJyYXkuZnJvbSh7IGxlbmd0aDogOCB9LCAoKSA9PiBudWxsKSxcblx0XHRcdFx0XHRjZWxsVG90YWxIZWlnaHRzOiBBcnJheS5mcm9tKHsgbGVuZ3RoOiA4IH0sICgpID0+IDUwKSxcblx0XHRcdFx0XHRjZWxsTGluZU51bWJlclN0YXRlczoge30sXG5cdFx0XHRcdFx0Y29sbGFwc2VkSW5wdXRDZWxsczoge30sXG5cdFx0XHRcdFx0Y29sbGFwc2VkT3V0cHV0Q2VsbHM6IHt9LFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCBjZWxsTGlzdCA9IGRzLmFkZChjcmVhdGVOb3RlYm9va0NlbGxMaXN0KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkcykpO1xuXHRcdFx0XHRjZWxsTGlzdC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblx0XHRcdFx0Y2VsbExpc3QubGF5b3V0KDQwMCwgMTAwKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2Nyb2xsVG9wKDUwKTtcblx0XHRcdFx0ZWRpdG9yLnZpc2libGVSYW5nZXMgPSBbeyBzdGFydDogMCwgZW5kOiA4IH1dO1xuXG5cdFx0XHRcdGNvbnN0IG91dGxpbmUgPSBnZXRPdXRsaW5lKGVkaXRvcik7XG5cdFx0XHRcdGNvbnN0IG5vdGVib29rT3V0bGluZUVudHJpZXMgPSBvdXRsaW5lLmVudHJpZXM7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdGluZ01hcCA9IG5iU3RpY2t5VGVzdEhlbHBlcihkb21Ob2RlLCBlZGl0b3IsIGNlbGxMaXN0LCBub3RlYm9va091dGxpbmVFbnRyaWVzLCBkcyk7XG5cblx0XHRcdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0aW5nTWFwKTtcblx0XHRcdFx0b3V0bGluZS5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndGVzdDU6IHNob3VsZCByZW5kZXIgMC0+MiwgXHRzY3JvbGx0b3AgaGFsZndheSB0aHJvdWdoIGNlbGwgMicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIGEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyMgaGVhZGVyIGFhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJyMjIyBoZWFkZXIgYWFhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJyMjIyMgaGVhZGVyIGFhYWEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciBiJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBjID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIGRzKSA9PiB7XG5cdFx0XHRcdHZpZXdNb2RlbC5yZXN0b3JlRWRpdG9yVmlld1N0YXRlKHtcblx0XHRcdFx0XHRlZGl0aW5nQ2VsbHM6IEFycmF5LmZyb20oeyBsZW5ndGg6IDEwIH0sICgpID0+IGZhbHNlKSxcblx0XHRcdFx0XHRlZGl0b3JWaWV3U3RhdGVzOiBBcnJheS5mcm9tKHsgbGVuZ3RoOiAxMCB9LCAoKSA9PiBudWxsKSxcblx0XHRcdFx0XHRjZWxsVG90YWxIZWlnaHRzOiBBcnJheS5mcm9tKHsgbGVuZ3RoOiAxMCB9LCAoKSA9PiA1MCksXG5cdFx0XHRcdFx0Y2VsbExpbmVOdW1iZXJTdGF0ZXM6IHt9LFxuXHRcdFx0XHRcdGNvbGxhcHNlZElucHV0Q2VsbHM6IHt9LFxuXHRcdFx0XHRcdGNvbGxhcHNlZE91dHB1dENlbGxzOiB7fSxcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgY2VsbExpc3QgPSBkcy5hZGQoY3JlYXRlTm90ZWJvb2tDZWxsTGlzdChpbnN0YW50aWF0aW9uU2VydmljZSwgZHMpKTtcblx0XHRcdFx0Y2VsbExpc3QuYXR0YWNoVmlld01vZGVsKHZpZXdNb2RlbCk7XG5cdFx0XHRcdGNlbGxMaXN0LmxheW91dCg0MDAsIDEwMCk7XG5cblx0XHRcdFx0ZWRpdG9yLnNldFNjcm9sbFRvcCgxMjUpO1xuXHRcdFx0XHRlZGl0b3IudmlzaWJsZVJhbmdlcyA9IFt7IHN0YXJ0OiAyLCBlbmQ6IDEwIH1dO1xuXG5cdFx0XHRcdGNvbnN0IG91dGxpbmUgPSBnZXRPdXRsaW5lKGVkaXRvcik7XG5cdFx0XHRcdGNvbnN0IG5vdGVib29rT3V0bGluZUVudHJpZXMgPSBvdXRsaW5lLmVudHJpZXM7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdGluZ01hcCA9IG5iU3RpY2t5VGVzdEhlbHBlcihkb21Ob2RlLCBlZGl0b3IsIGNlbGxMaXN0LCBub3RlYm9va091dGxpbmVFbnRyaWVzLCBkcyk7XG5cblx0XHRcdFx0YXdhaXQgYXNzZXJ0U25hcHNob3QocmVzdWx0aW5nTWFwKTtcblx0XHRcdFx0b3V0bGluZS5kaXNwb3NlKCk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndGVzdDY6IHNob3VsZCByZW5kZXIgNi0+NywgXHRzY3JvbGx0b3AgaGFsZndheSB0aHJvdWdoIGNlbGwgNycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIGEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyMgaGVhZGVyIGFhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgYicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WycjIyBoZWFkZXIgYmInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyMjIGhlYWRlciBiYmInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGMgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCwgZHMpID0+IHtcblx0XHRcdFx0dmlld01vZGVsLnJlc3RvcmVFZGl0b3JWaWV3U3RhdGUoe1xuXHRcdFx0XHRcdGVkaXRpbmdDZWxsczogQXJyYXkuZnJvbSh7IGxlbmd0aDogMTAgfSwgKCkgPT4gZmFsc2UpLFxuXHRcdFx0XHRcdGVkaXRvclZpZXdTdGF0ZXM6IEFycmF5LmZyb20oeyBsZW5ndGg6IDEwIH0sICgpID0+IG51bGwpLFxuXHRcdFx0XHRcdGNlbGxUb3RhbEhlaWdodHM6IEFycmF5LmZyb20oeyBsZW5ndGg6IDEwIH0sICgpID0+IDUwKSxcblx0XHRcdFx0XHRjZWxsTGluZU51bWJlclN0YXRlczoge30sXG5cdFx0XHRcdFx0Y29sbGFwc2VkSW5wdXRDZWxsczoge30sXG5cdFx0XHRcdFx0Y29sbGFwc2VkT3V0cHV0Q2VsbHM6IHt9LFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCBjZWxsTGlzdCA9IGRzLmFkZChjcmVhdGVOb3RlYm9va0NlbGxMaXN0KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkcykpO1xuXHRcdFx0XHRjZWxsTGlzdC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblx0XHRcdFx0Y2VsbExpc3QubGF5b3V0KDQwMCwgMTAwKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2Nyb2xsVG9wKDM3NSk7XG5cdFx0XHRcdGVkaXRvci52aXNpYmxlUmFuZ2VzID0gW3sgc3RhcnQ6IDcsIGVuZDogMTAgfV07XG5cblx0XHRcdFx0Y29uc3Qgb3V0bGluZSA9IGdldE91dGxpbmUoZWRpdG9yKTtcblx0XHRcdFx0Y29uc3Qgbm90ZWJvb2tPdXRsaW5lRW50cmllcyA9IG91dGxpbmUuZW50cmllcztcblx0XHRcdFx0Y29uc3QgcmVzdWx0aW5nTWFwID0gbmJTdGlja3lUZXN0SGVscGVyKGRvbU5vZGUsIGVkaXRvciwgY2VsbExpc3QsIG5vdGVib29rT3V0bGluZUVudHJpZXMsIGRzKTtcblxuXHRcdFx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHRpbmdNYXApO1xuXHRcdFx0XHRvdXRsaW5lLmRpc3Bvc2UoKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXN0Nzogc2hvdWxkIHJlbmRlciAwLT4xLCBcdGNvbGxhcHNpbmcgYWdhaW5zdCBuZXh0IHNlY3Rpb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciBhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLCBcdFx0Ly8wXG5cdFx0XHRcdFsnIyMgaGVhZGVyIGFhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLCBcdFx0Ly81MFxuXHRcdFx0XHRbJyMjIyBoZWFkZXIgYWFhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLCBcdC8vMTAwXG5cdFx0XHRcdFsnIyMjIyBoZWFkZXIgYWFhYScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSwgXHQvLzE1MFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sIFx0XHQvLzIwMFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sIFx0XHQvLzI1MFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sIFx0XHQvLzMwMFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sIFx0XHQvLzM1MFxuXHRcdFx0XHRbJyMgaGVhZGVyIGInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sIFx0XHQvLzQwMFxuXHRcdFx0XHRbJyMjIGhlYWRlciBiYicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSwgXHRcdC8vNDUwXG5cdFx0XHRcdFsnIyMjIGhlYWRlciBiYmInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGMgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCwgZHMpID0+IHtcblx0XHRcdFx0dmlld01vZGVsLnJlc3RvcmVFZGl0b3JWaWV3U3RhdGUoe1xuXHRcdFx0XHRcdGVkaXRpbmdDZWxsczogQXJyYXkuZnJvbSh7IGxlbmd0aDogMTIgfSwgKCkgPT4gZmFsc2UpLFxuXHRcdFx0XHRcdGVkaXRvclZpZXdTdGF0ZXM6IEFycmF5LmZyb20oeyBsZW5ndGg6IDEyIH0sICgpID0+IG51bGwpLFxuXHRcdFx0XHRcdGNlbGxUb3RhbEhlaWdodHM6IEFycmF5LmZyb20oeyBsZW5ndGg6IDEyIH0sICgpID0+IDUwKSxcblx0XHRcdFx0XHRjZWxsTGluZU51bWJlclN0YXRlczoge30sXG5cdFx0XHRcdFx0Y29sbGFwc2VkSW5wdXRDZWxsczoge30sXG5cdFx0XHRcdFx0Y29sbGFwc2VkT3V0cHV0Q2VsbHM6IHt9LFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCBjZWxsTGlzdCA9IGRzLmFkZChjcmVhdGVOb3RlYm9va0NlbGxMaXN0KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkcykpO1xuXHRcdFx0XHRjZWxsTGlzdC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblx0XHRcdFx0Y2VsbExpc3QubGF5b3V0KDQwMCwgMTAwKTtcblxuXHRcdFx0XHRlZGl0b3Iuc2V0U2Nyb2xsVG9wKDM1MCk7XG5cdFx0XHRcdGVkaXRvci52aXNpYmxlUmFuZ2VzID0gW3sgc3RhcnQ6IDcsIGVuZDogMTIgfV07XG5cblx0XHRcdFx0Y29uc3Qgb3V0bGluZSA9IGdldE91dGxpbmUoZWRpdG9yKTtcblx0XHRcdFx0Y29uc3Qgbm90ZWJvb2tPdXRsaW5lRW50cmllcyA9IG91dGxpbmUuZW50cmllcztcblx0XHRcdFx0Y29uc3QgcmVzdWx0aW5nTWFwID0gbmJTdGlja3lUZXN0SGVscGVyKGRvbU5vZGUsIGVkaXRvciwgY2VsbExpc3QsIG5vdGVib29rT3V0bGluZUVudHJpZXMsIGRzKTtcblxuXHRcdFx0XHRhd2FpdCBhc3NlcnRTbmFwc2hvdChyZXN1bHRpbmdNYXApO1xuXHRcdFx0XHRvdXRsaW5lLmRpc3Bvc2UoKTtcblx0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
