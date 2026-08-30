import assert from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { NotebookCellsLayout } from "../../browser/view/notebookCellListView.js";
import { FoldingModel } from "../../browser/viewModel/foldingModel.js";
import { CellEditType, CellKind } from "../../common/notebookCommon.js";
import { createNotebookCellList, setupInstantiationService, withTestNotebook } from "./testNotebookEditor.js";
suite("NotebookRangeMap", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("empty", () => {
    const rangeMap = new NotebookCellsLayout();
    assert.strictEqual(rangeMap.size, 0);
    assert.strictEqual(rangeMap.count, 0);
  });
  const one = { size: 1 };
  const two = { size: 2 };
  const three = { size: 3 };
  const five = { size: 5 };
  const ten = { size: 10 };
  test("length & count", () => {
    const rangeMap = new NotebookCellsLayout();
    rangeMap.splice(0, 0, [one]);
    assert.strictEqual(rangeMap.size, 1);
    assert.strictEqual(rangeMap.count, 1);
  });
  test("length & count #2", () => {
    const rangeMap = new NotebookCellsLayout();
    rangeMap.splice(0, 0, [one, one, one, one, one]);
    assert.strictEqual(rangeMap.size, 5);
    assert.strictEqual(rangeMap.count, 5);
  });
  test("length & count #3", () => {
    const rangeMap = new NotebookCellsLayout();
    rangeMap.splice(0, 0, [five]);
    assert.strictEqual(rangeMap.size, 5);
    assert.strictEqual(rangeMap.count, 1);
  });
  test("length & count #4", () => {
    const rangeMap = new NotebookCellsLayout();
    rangeMap.splice(0, 0, [five, five, five, five, five]);
    assert.strictEqual(rangeMap.size, 25);
    assert.strictEqual(rangeMap.count, 5);
  });
  test("insert", () => {
    const rangeMap = new NotebookCellsLayout();
    rangeMap.splice(0, 0, [five, five, five, five, five]);
    assert.strictEqual(rangeMap.size, 25);
    assert.strictEqual(rangeMap.count, 5);
    rangeMap.splice(0, 0, [five, five, five, five, five]);
    assert.strictEqual(rangeMap.size, 50);
    assert.strictEqual(rangeMap.count, 10);
    rangeMap.splice(5, 0, [ten, ten]);
    assert.strictEqual(rangeMap.size, 70);
    assert.strictEqual(rangeMap.count, 12);
    rangeMap.splice(12, 0, [{ size: 200 }]);
    assert.strictEqual(rangeMap.size, 270);
    assert.strictEqual(rangeMap.count, 13);
  });
  test("delete", () => {
    const rangeMap = new NotebookCellsLayout();
    rangeMap.splice(0, 0, [
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five,
      five
    ]);
    assert.strictEqual(rangeMap.size, 100);
    assert.strictEqual(rangeMap.count, 20);
    rangeMap.splice(10, 5);
    assert.strictEqual(rangeMap.size, 75);
    assert.strictEqual(rangeMap.count, 15);
    rangeMap.splice(0, 1);
    assert.strictEqual(rangeMap.size, 70);
    assert.strictEqual(rangeMap.count, 14);
    rangeMap.splice(1, 13);
    assert.strictEqual(rangeMap.size, 5);
    assert.strictEqual(rangeMap.count, 1);
    rangeMap.splice(1, 1);
    assert.strictEqual(rangeMap.size, 5);
    assert.strictEqual(rangeMap.count, 1);
  });
  test("insert & delete", () => {
    const rangeMap = new NotebookCellsLayout();
    assert.strictEqual(rangeMap.size, 0);
    assert.strictEqual(rangeMap.count, 0);
    rangeMap.splice(0, 0, [one]);
    assert.strictEqual(rangeMap.size, 1);
    assert.strictEqual(rangeMap.count, 1);
    rangeMap.splice(0, 1);
    assert.strictEqual(rangeMap.size, 0);
    assert.strictEqual(rangeMap.count, 0);
  });
  test("insert & delete #2", () => {
    const rangeMap = new NotebookCellsLayout();
    rangeMap.splice(0, 0, [
      one,
      one,
      one,
      one,
      one,
      one,
      one,
      one,
      one,
      one
    ]);
    rangeMap.splice(2, 6);
    assert.strictEqual(rangeMap.count, 4);
    assert.strictEqual(rangeMap.size, 4);
  });
  test("insert & delete #3", () => {
    const rangeMap = new NotebookCellsLayout();
    rangeMap.splice(0, 0, [
      one,
      one,
      one,
      one,
      one,
      one,
      one,
      one,
      one,
      one,
      two,
      two,
      two,
      two,
      two,
      two,
      two,
      two,
      two,
      two
    ]);
    rangeMap.splice(8, 4);
    assert.strictEqual(rangeMap.count, 16);
    assert.strictEqual(rangeMap.size, 24);
  });
  test("insert & delete #4", () => {
    const rangeMap = new NotebookCellsLayout();
    rangeMap.splice(0, 0, [
      one,
      one,
      one,
      one,
      one,
      one,
      one,
      one,
      one,
      one,
      two,
      two,
      two,
      two,
      two,
      two,
      two,
      two,
      two,
      two
    ]);
    rangeMap.splice(5, 0, [three, three, three, three, three]);
    assert.strictEqual(rangeMap.count, 25);
    assert.strictEqual(rangeMap.size, 45);
    rangeMap.splice(4, 7);
    assert.strictEqual(rangeMap.count, 18);
    assert.strictEqual(rangeMap.size, 28);
  });
  suite("indexAt, positionAt", () => {
    test("empty", () => {
      const rangeMap = new NotebookCellsLayout();
      assert.strictEqual(rangeMap.indexAt(0), 0);
      assert.strictEqual(rangeMap.indexAt(10), 0);
      assert.strictEqual(rangeMap.indexAt(-1), -1);
      assert.strictEqual(rangeMap.positionAt(0), -1);
      assert.strictEqual(rangeMap.positionAt(10), -1);
      assert.strictEqual(rangeMap.positionAt(-1), -1);
    });
    test("simple", () => {
      const rangeMap = new NotebookCellsLayout();
      rangeMap.splice(0, 0, [one]);
      assert.strictEqual(rangeMap.indexAt(0), 0);
      assert.strictEqual(rangeMap.indexAt(1), 1);
      assert.strictEqual(rangeMap.positionAt(0), 0);
      assert.strictEqual(rangeMap.positionAt(1), -1);
    });
    test("simple #2", () => {
      const rangeMap = new NotebookCellsLayout();
      rangeMap.splice(0, 0, [ten]);
      assert.strictEqual(rangeMap.indexAt(0), 0);
      assert.strictEqual(rangeMap.indexAt(5), 0);
      assert.strictEqual(rangeMap.indexAt(9), 0);
      assert.strictEqual(rangeMap.indexAt(10), 1);
      assert.strictEqual(rangeMap.positionAt(0), 0);
      assert.strictEqual(rangeMap.positionAt(1), -1);
    });
    test("insert", () => {
      const rangeMap = new NotebookCellsLayout();
      rangeMap.splice(0, 0, [one, one, one, one, one, one, one, one, one, one]);
      assert.strictEqual(rangeMap.indexAt(0), 0);
      assert.strictEqual(rangeMap.indexAt(1), 1);
      assert.strictEqual(rangeMap.indexAt(5), 5);
      assert.strictEqual(rangeMap.indexAt(9), 9);
      assert.strictEqual(rangeMap.indexAt(10), 10);
      assert.strictEqual(rangeMap.indexAt(11), 10);
      rangeMap.splice(10, 0, [one, one, one, one, one, one, one, one, one, one]);
      assert.strictEqual(rangeMap.indexAt(10), 10);
      assert.strictEqual(rangeMap.indexAt(19), 19);
      assert.strictEqual(rangeMap.indexAt(20), 20);
      assert.strictEqual(rangeMap.indexAt(21), 20);
      assert.strictEqual(rangeMap.positionAt(0), 0);
      assert.strictEqual(rangeMap.positionAt(1), 1);
      assert.strictEqual(rangeMap.positionAt(19), 19);
      assert.strictEqual(rangeMap.positionAt(20), -1);
    });
    test("delete", () => {
      const rangeMap = new NotebookCellsLayout();
      rangeMap.splice(0, 0, [one, one, one, one, one, one, one, one, one, one]);
      rangeMap.splice(2, 6);
      assert.strictEqual(rangeMap.indexAt(0), 0);
      assert.strictEqual(rangeMap.indexAt(1), 1);
      assert.strictEqual(rangeMap.indexAt(3), 3);
      assert.strictEqual(rangeMap.indexAt(4), 4);
      assert.strictEqual(rangeMap.indexAt(5), 4);
      assert.strictEqual(rangeMap.positionAt(0), 0);
      assert.strictEqual(rangeMap.positionAt(1), 1);
      assert.strictEqual(rangeMap.positionAt(3), 3);
      assert.strictEqual(rangeMap.positionAt(4), -1);
    });
    test("delete #2", () => {
      const rangeMap = new NotebookCellsLayout();
      rangeMap.splice(0, 0, [ten, ten, ten, ten, ten, ten, ten, ten, ten, ten]);
      rangeMap.splice(2, 6);
      assert.strictEqual(rangeMap.indexAt(0), 0);
      assert.strictEqual(rangeMap.indexAt(1), 0);
      assert.strictEqual(rangeMap.indexAt(30), 3);
      assert.strictEqual(rangeMap.indexAt(40), 4);
      assert.strictEqual(rangeMap.indexAt(50), 4);
      assert.strictEqual(rangeMap.positionAt(0), 0);
      assert.strictEqual(rangeMap.positionAt(1), 10);
      assert.strictEqual(rangeMap.positionAt(2), 20);
      assert.strictEqual(rangeMap.positionAt(3), 30);
      assert.strictEqual(rangeMap.positionAt(4), -1);
    });
  });
});
suite("NotebookRangeMap with top padding", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("empty", () => {
    const rangeMap = new NotebookCellsLayout(10);
    assert.strictEqual(rangeMap.size, 10);
    assert.strictEqual(rangeMap.count, 0);
  });
  const one = { size: 1 };
  const five = { size: 5 };
  const ten = { size: 10 };
  test("length & count", () => {
    const rangeMap = new NotebookCellsLayout(10);
    rangeMap.splice(0, 0, [one]);
    assert.strictEqual(rangeMap.size, 11);
    assert.strictEqual(rangeMap.count, 1);
  });
  test("length & count #2", () => {
    const rangeMap = new NotebookCellsLayout(10);
    rangeMap.splice(0, 0, [one, one, one, one, one]);
    assert.strictEqual(rangeMap.size, 15);
    assert.strictEqual(rangeMap.count, 5);
  });
  test("length & count #3", () => {
    const rangeMap = new NotebookCellsLayout(10);
    rangeMap.splice(0, 0, [five]);
    assert.strictEqual(rangeMap.size, 15);
    assert.strictEqual(rangeMap.count, 1);
  });
  test("length & count #4", () => {
    const rangeMap = new NotebookCellsLayout(10);
    rangeMap.splice(0, 0, [five, five, five, five, five]);
    assert.strictEqual(rangeMap.size, 35);
    assert.strictEqual(rangeMap.count, 5);
  });
  test("insert", () => {
    const rangeMap = new NotebookCellsLayout(10);
    rangeMap.splice(0, 0, [five, five, five, five, five]);
    assert.strictEqual(rangeMap.size, 35);
    assert.strictEqual(rangeMap.count, 5);
    rangeMap.splice(0, 0, [five, five, five, five, five]);
    assert.strictEqual(rangeMap.size, 60);
    assert.strictEqual(rangeMap.count, 10);
    rangeMap.splice(5, 0, [ten, ten]);
    assert.strictEqual(rangeMap.size, 80);
    assert.strictEqual(rangeMap.count, 12);
    rangeMap.splice(12, 0, [{ size: 200 }]);
    assert.strictEqual(rangeMap.size, 280);
    assert.strictEqual(rangeMap.count, 13);
  });
  suite("indexAt, positionAt", () => {
    test("empty", () => {
      const rangeMap = new NotebookCellsLayout(10);
      assert.strictEqual(rangeMap.indexAt(0), 0);
      assert.strictEqual(rangeMap.indexAt(10), 0);
      assert.strictEqual(rangeMap.indexAt(-1), -1);
      assert.strictEqual(rangeMap.positionAt(0), -1);
      assert.strictEqual(rangeMap.positionAt(10), -1);
      assert.strictEqual(rangeMap.positionAt(-1), -1);
    });
    test("simple", () => {
      const rangeMap = new NotebookCellsLayout(10);
      rangeMap.splice(0, 0, [one]);
      assert.strictEqual(rangeMap.indexAt(0), 0);
      assert.strictEqual(rangeMap.indexAt(1), 0);
      assert.strictEqual(rangeMap.indexAt(10), 0);
      assert.strictEqual(rangeMap.indexAt(11), 1);
      assert.strictEqual(rangeMap.positionAt(0), 10);
      assert.strictEqual(rangeMap.positionAt(1), -1);
    });
  });
});
suite("NotebookRangeMap with whitesspaces", () => {
  let testDisposables;
  let instantiationService;
  let config;
  teardown(() => {
    testDisposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    testDisposables = new DisposableStore();
    instantiationService = setupInstantiationService(testDisposables);
    config = new TestConfigurationService();
    instantiationService.stub(IConfigurationService, config);
  });
  test("simple", () => {
    const rangeMap = new NotebookCellsLayout(0);
    rangeMap.splice(0, 0, [{ size: 479 }, { size: 163 }, { size: 182 }, { size: 106 }, { size: 106 }, { size: 106 }, { size: 87 }]);
    const start = rangeMap.indexAt(650);
    const end = rangeMap.indexAfter(650 + 890 - 1);
    assert.strictEqual(start, 2);
    assert.strictEqual(end, 7);
    rangeMap.insertWhitespace("1", 0, 18);
    assert.strictEqual(rangeMap.indexAt(650), 1);
  });
  test("Whitespace CRUD", async function() {
    const twenty = { size: 20 };
    const rangeMap = new NotebookCellsLayout(0);
    rangeMap.splice(0, 0, [twenty, twenty, twenty]);
    rangeMap.insertWhitespace("0", 0, 5);
    rangeMap.insertWhitespace("1", 0, 5);
    assert.strictEqual(rangeMap.indexAt(0), 0);
    assert.strictEqual(rangeMap.indexAt(1), 0);
    assert.strictEqual(rangeMap.indexAt(10), 0);
    assert.strictEqual(rangeMap.indexAt(11), 0);
    assert.strictEqual(rangeMap.indexAt(21), 0);
    assert.strictEqual(rangeMap.indexAt(31), 1);
    assert.strictEqual(rangeMap.positionAt(0), 10);
    assert.strictEqual(rangeMap.getWhitespacePosition("0"), 0);
    assert.strictEqual(rangeMap.getWhitespacePosition("1"), 5);
    assert.strictEqual(rangeMap.positionAt(0), 10);
    assert.strictEqual(rangeMap.positionAt(1), 30);
    rangeMap.changeOneWhitespace("0", 0, 10);
    assert.strictEqual(rangeMap.getWhitespacePosition("0"), 0);
    assert.strictEqual(rangeMap.getWhitespacePosition("1"), 10);
    assert.strictEqual(rangeMap.positionAt(0), 15);
    assert.strictEqual(rangeMap.positionAt(1), 35);
    rangeMap.removeWhitespace("1");
    assert.strictEqual(rangeMap.getWhitespacePosition("0"), 0);
    assert.strictEqual(rangeMap.positionAt(0), 10);
    assert.strictEqual(rangeMap.positionAt(1), 30);
  });
  test("Whitespace with editing", async function() {
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
        disposables.add(cellList);
        cellList.attachViewModel(viewModel);
        cellList.layout(210, 100);
        assert.strictEqual(cellList.scrollHeight, 350);
        cellList.changeViewZones((accessor) => {
          const id = accessor.addZone({
            afterModelPosition: 1,
            heightInPx: 20,
            domNode: document.createElement("div")
          });
          accessor.layoutZone(id);
          assert.strictEqual(cellList.scrollHeight, 370);
          assert.strictEqual(cellList.getElementTop(0), 0);
          assert.strictEqual(cellList.getElementTop(1), 70);
          assert.strictEqual(cellList.getElementTop(2), 170);
          const textModel = editor.textModel;
          textModel.applyEdits([
            { editType: CellEditType.Replace, index: 0, count: 1, cells: [] }
          ], true, void 0, () => void 0, void 0, true);
          assert.strictEqual(cellList.getElementTop(0), 20);
          assert.strictEqual(cellList.getElementTop(1), 120);
          assert.strictEqual(cellList.getElementTop(2), 170);
          accessor.removeZone(id);
        });
      }
    );
  });
  test("Multiple Whitespaces", async function() {
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
        disposables.add(cellList);
        cellList.attachViewModel(viewModel);
        cellList.layout(210, 100);
        assert.strictEqual(cellList.scrollHeight, 350);
        cellList.changeViewZones((accessor) => {
          const first = accessor.addZone({
            afterModelPosition: 0,
            heightInPx: 20,
            domNode: document.createElement("div")
          });
          accessor.layoutZone(first);
          const second = accessor.addZone({
            afterModelPosition: 3,
            heightInPx: 20,
            domNode: document.createElement("div")
          });
          accessor.layoutZone(second);
          assert.strictEqual(cellList.scrollHeight, 390);
          assert.strictEqual(cellList.getElementTop(0), 20);
          assert.strictEqual(cellList.getElementTop(1), 70);
          assert.strictEqual(cellList.getElementTop(2), 170);
          assert.strictEqual(cellList.getElementTop(3), 240);
          accessor.removeZone(first);
          assert.strictEqual(cellList.scrollHeight, 370);
          assert.strictEqual(cellList.getElementTop(0), 0);
          assert.strictEqual(cellList.getElementTop(1), 50);
          assert.strictEqual(cellList.getElementTop(2), 150);
          assert.strictEqual(cellList.getElementTop(3), 220);
          accessor.removeZone(second);
          assert.strictEqual(cellList.scrollHeight, 350);
          assert.strictEqual(cellList.getElementTop(3), 200);
        });
      }
    );
  });
  test("Multiple Whitespaces 2", async function() {
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
        disposables.add(cellList);
        cellList.attachViewModel(viewModel);
        cellList.layout(210, 100);
        assert.strictEqual(cellList.scrollHeight, 350);
        cellList.changeViewZones((accessor) => {
          const first = accessor.addZone({
            afterModelPosition: 0,
            heightInPx: 20,
            domNode: document.createElement("div")
          });
          accessor.layoutZone(first);
          const second = accessor.addZone({
            afterModelPosition: 1,
            heightInPx: 20,
            domNode: document.createElement("div")
          });
          accessor.layoutZone(second);
          assert.strictEqual(cellList.scrollHeight, 390);
          assert.strictEqual(cellList._getView().getWhitespacePosition(first), 0);
          assert.strictEqual(cellList._getView().getWhitespacePosition(second), 70);
          accessor.removeZone(first);
          accessor.removeZone(second);
        });
      }
    );
  });
  test("Multiple Whitespaces 3", async function() {
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
        disposables.add(cellList);
        cellList.attachViewModel(viewModel);
        cellList.layout(210, 100);
        assert.strictEqual(cellList.scrollHeight, 350);
        cellList.changeViewZones((accessor) => {
          const first = accessor.addZone({
            afterModelPosition: 1,
            heightInPx: 20,
            domNode: document.createElement("div")
          });
          accessor.layoutZone(first);
          const second = accessor.addZone({
            afterModelPosition: 2,
            heightInPx: 20,
            domNode: document.createElement("div")
          });
          accessor.layoutZone(second);
          assert.strictEqual(cellList.scrollHeight, 390);
          assert.strictEqual(cellList._getView().getWhitespacePosition(first), 50);
          assert.strictEqual(cellList._getView().getWhitespacePosition(second), 170);
          accessor.removeZone(first);
          accessor.removeZone(second);
        });
      }
    );
  });
  test("Whitespace with folding support", async function() {
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
        disposables.add(cellList);
        cellList.attachViewModel(viewModel);
        cellList.layout(210, 100);
        assert.strictEqual(cellList.scrollHeight, 350);
        cellList.changeViewZones((accessor) => {
          const id = accessor.addZone({
            afterModelPosition: 0,
            heightInPx: 20,
            domNode: document.createElement("div")
          });
          accessor.layoutZone(id);
          assert.strictEqual(cellList.scrollHeight, 370);
          assert.strictEqual(cellList.getElementTop(0), 20);
          assert.strictEqual(cellList.getElementTop(1), 70);
          assert.strictEqual(cellList.getElementTop(2), 170);
          assert.strictEqual(cellList.getElementTop(3), 220);
          assert.strictEqual(cellList.getElementTop(4), 320);
          accessor.removeZone(id);
          assert.strictEqual(cellList.scrollHeight, 350);
        });
        cellList.changeViewZones((accessor) => {
          const id = accessor.addZone({
            afterModelPosition: 1,
            heightInPx: 20,
            domNode: document.createElement("div")
          });
          accessor.layoutZone(id);
          assert.strictEqual(cellList.scrollHeight, 370);
          assert.strictEqual(cellList.getElementTop(0), 0);
          assert.strictEqual(cellList.getElementTop(1), 70);
          assert.strictEqual(cellList.getElementTop(2), 170);
          assert.strictEqual(cellList.getElementTop(3), 220);
          assert.strictEqual(cellList.getElementTop(4), 320);
          accessor.removeZone(id);
          assert.strictEqual(cellList.scrollHeight, 350);
        });
        cellList.changeViewZones((accessor) => {
          const id = accessor.addZone({
            afterModelPosition: 3,
            heightInPx: 20,
            domNode: document.createElement("div")
          });
          accessor.layoutZone(id);
          assert.strictEqual(cellList.scrollHeight, 370);
          const foldingModel = disposables.add(new FoldingModel());
          foldingModel.attachViewModel(viewModel);
          foldingModel.applyMemento([{ start: 2, end: 3 }]);
          viewModel.updateFoldingRanges(foldingModel.regions);
          assert.deepStrictEqual(viewModel.getHiddenRanges(), [
            { start: 3, end: 3 }
          ]);
          cellList.setHiddenAreas(viewModel.getHiddenRanges(), true);
          assert.strictEqual(cellList.scrollHeight, 250);
          assert.strictEqual(cellList.getElementTop(0), 0);
          assert.strictEqual(cellList.getElementTop(1), 50);
          assert.strictEqual(cellList.getElementTop(2), 150);
          assert.strictEqual(cellList.getElementTop(3), 200);
          cellList.setHiddenAreas([], true);
          assert.strictEqual(cellList.scrollHeight, 370);
          accessor.removeZone(id);
          assert.strictEqual(cellList.scrollHeight, 350);
        });
        cellList.changeViewZones((accessor) => {
          const id = accessor.addZone({
            afterModelPosition: 4,
            heightInPx: 20,
            domNode: document.createElement("div")
          });
          accessor.layoutZone(id);
          assert.strictEqual(cellList.scrollHeight, 370);
          const foldingModel = disposables.add(new FoldingModel());
          foldingModel.attachViewModel(viewModel);
          foldingModel.applyMemento([{ start: 2, end: 3 }]);
          viewModel.updateFoldingRanges(foldingModel.regions);
          assert.deepStrictEqual(viewModel.getHiddenRanges(), [
            { start: 3, end: 3 }
          ]);
          cellList.setHiddenAreas(viewModel.getHiddenRanges(), true);
          assert.strictEqual(cellList.scrollHeight, 270);
          assert.strictEqual(cellList.getElementTop(0), 0);
          assert.strictEqual(cellList.getElementTop(1), 50);
          assert.strictEqual(cellList.getElementTop(2), 150);
          assert.strictEqual(cellList.getElementTop(3), 220);
          cellList.setHiddenAreas([], true);
          assert.strictEqual(cellList.scrollHeight, 370);
          accessor.removeZone(id);
          assert.strictEqual(cellList.scrollHeight, 350);
        });
        cellList.changeViewZones((accessor) => {
          const id = accessor.addZone({
            afterModelPosition: 4,
            heightInPx: 20,
            domNode: document.createElement("div")
          });
          accessor.layoutZone(id);
          assert.strictEqual(cellList.scrollHeight, 370);
          const foldingModel = disposables.add(new FoldingModel());
          foldingModel.attachViewModel(viewModel);
          foldingModel.applyMemento([{ start: 0, end: 1 }]);
          viewModel.updateFoldingRanges(foldingModel.regions);
          assert.deepStrictEqual(viewModel.getHiddenRanges(), [
            { start: 1, end: 1 }
          ]);
          cellList.setHiddenAreas(viewModel.getHiddenRanges(), true);
          assert.strictEqual(cellList.scrollHeight, 270);
          assert.strictEqual(cellList.getElementTop(0), 0);
          assert.strictEqual(cellList.getElementTop(1), 50);
          assert.strictEqual(cellList.getElementTop(2), 100);
          assert.strictEqual(cellList.getElementTop(3), 220);
          cellList.setHiddenAreas([], true);
          assert.strictEqual(cellList.scrollHeight, 370);
          accessor.removeZone(id);
          assert.strictEqual(cellList.scrollHeight, 350);
        });
      }
    );
  });
  test("Whitespace with multiple viewzones at same position", async function() {
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
        disposables.add(cellList);
        cellList.attachViewModel(viewModel);
        cellList.layout(210, 100);
        assert.strictEqual(cellList.scrollHeight, 350);
        cellList.changeViewZones((accessor) => {
          const first = accessor.addZone({
            afterModelPosition: 0,
            heightInPx: 20,
            domNode: document.createElement("div")
          });
          accessor.layoutZone(first);
          assert.strictEqual(cellList.scrollHeight, 370);
          const second = accessor.addZone({
            afterModelPosition: 0,
            heightInPx: 20,
            domNode: document.createElement("div")
          });
          accessor.layoutZone(second);
          assert.strictEqual(cellList.scrollHeight, 390);
          assert.strictEqual(cellList.getElementTop(0), 40);
          assert.strictEqual(cellList.getElementTop(1), 90);
          assert.strictEqual(cellList.getElementTop(2), 190);
          assert.strictEqual(cellList.getElementTop(3), 240);
          assert.strictEqual(cellList.getElementTop(4), 340);
          accessor.removeZone(first);
          assert.strictEqual(cellList.scrollHeight, 370);
          accessor.removeZone(second);
          assert.strictEqual(cellList.scrollHeight, 350);
        });
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFx0ZXN0XFxicm93c2VyXFxub3RlYm9va1ZpZXdab25lcy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IE5vdGVib29rQ2VsbHNMYXlvdXQgfSBmcm9tICcuLi8uLi9icm93c2VyL3ZpZXcvbm90ZWJvb2tDZWxsTGlzdFZpZXcuanMnO1xuaW1wb3J0IHsgRm9sZGluZ01vZGVsIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci92aWV3TW9kZWwvZm9sZGluZ01vZGVsLmpzJztcbmltcG9ydCB7IENlbGxFZGl0VHlwZSwgQ2VsbEtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgY3JlYXRlTm90ZWJvb2tDZWxsTGlzdCwgc2V0dXBJbnN0YW50aWF0aW9uU2VydmljZSwgd2l0aFRlc3ROb3RlYm9vayB9IGZyb20gJy4vdGVzdE5vdGVib29rRWRpdG9yLmpzJztcblxuc3VpdGUoJ05vdGVib29rUmFuZ2VNYXAnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZW1wdHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmFuZ2VNYXAgPSBuZXcgTm90ZWJvb2tDZWxsc0xheW91dCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5zaXplLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDApO1xuXHR9KTtcblxuXHRjb25zdCBvbmUgPSB7IHNpemU6IDEgfTtcblx0Y29uc3QgdHdvID0geyBzaXplOiAyIH07XG5cdGNvbnN0IHRocmVlID0geyBzaXplOiAzIH07XG5cdGNvbnN0IGZpdmUgPSB7IHNpemU6IDUgfTtcblx0Y29uc3QgdGVuID0geyBzaXplOiAxMCB9O1xuXG5cdHRlc3QoJ2xlbmd0aCAmIGNvdW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJhbmdlTWFwID0gbmV3IE5vdGVib29rQ2VsbHNMYXlvdXQoKTtcblx0XHRyYW5nZU1hcC5zcGxpY2UoMCwgMCwgW29uZV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5zaXplLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdsZW5ndGggJiBjb3VudCAjMicsICgpID0+IHtcblx0XHRjb25zdCByYW5nZU1hcCA9IG5ldyBOb3RlYm9va0NlbGxzTGF5b3V0KCk7XG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDAsIFtvbmUsIG9uZSwgb25lLCBvbmUsIG9uZV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5zaXplLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDUpO1xuXHR9KTtcblxuXHR0ZXN0KCdsZW5ndGggJiBjb3VudCAjMycsICgpID0+IHtcblx0XHRjb25zdCByYW5nZU1hcCA9IG5ldyBOb3RlYm9va0NlbGxzTGF5b3V0KCk7XG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDAsIFtmaXZlXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnNpemUsIDUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5jb3VudCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xlbmd0aCAmIGNvdW50ICM0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJhbmdlTWFwID0gbmV3IE5vdGVib29rQ2VsbHNMYXlvdXQoKTtcblx0XHRyYW5nZU1hcC5zcGxpY2UoMCwgMCwgW2ZpdmUsIGZpdmUsIGZpdmUsIGZpdmUsIGZpdmVdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuc2l6ZSwgMjUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5jb3VudCwgNSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydCcsICgpID0+IHtcblx0XHRjb25zdCByYW5nZU1hcCA9IG5ldyBOb3RlYm9va0NlbGxzTGF5b3V0KCk7XG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDAsIFtmaXZlLCBmaXZlLCBmaXZlLCBmaXZlLCBmaXZlXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnNpemUsIDI1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDUpO1xuXG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDAsIFtmaXZlLCBmaXZlLCBmaXZlLCBmaXZlLCBmaXZlXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnNpemUsIDUwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDEwKTtcblxuXHRcdHJhbmdlTWFwLnNwbGljZSg1LCAwLCBbdGVuLCB0ZW5dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuc2l6ZSwgNzApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5jb3VudCwgMTIpO1xuXG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDEyLCAwLCBbeyBzaXplOiAyMDAgfV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5zaXplLCAyNzApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5jb3VudCwgMTMpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmFuZ2VNYXAgPSBuZXcgTm90ZWJvb2tDZWxsc0xheW91dCgpO1xuXHRcdHJhbmdlTWFwLnNwbGljZSgwLCAwLCBbZml2ZSwgZml2ZSwgZml2ZSwgZml2ZSwgZml2ZSxcblx0XHRcdGZpdmUsIGZpdmUsIGZpdmUsIGZpdmUsIGZpdmUsXG5cdFx0XHRmaXZlLCBmaXZlLCBmaXZlLCBmaXZlLCBmaXZlLFxuXHRcdFx0Zml2ZSwgZml2ZSwgZml2ZSwgZml2ZSwgZml2ZV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5zaXplLCAxMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5jb3VudCwgMjApO1xuXG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDEwLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuc2l6ZSwgNzUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5jb3VudCwgMTUpO1xuXG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5zaXplLCA3MCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmNvdW50LCAxNCk7XG5cblx0XHRyYW5nZU1hcC5zcGxpY2UoMSwgMTMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5zaXplLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDEpO1xuXG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDEsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5zaXplLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQgJiBkZWxldGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmFuZ2VNYXAgPSBuZXcgTm90ZWJvb2tDZWxsc0xheW91dCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5zaXplLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDApO1xuXG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDAsIFtvbmVdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuc2l6ZSwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmNvdW50LCAxKTtcblxuXHRcdHJhbmdlTWFwLnNwbGljZSgwLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuc2l6ZSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmNvdW50LCAwKTtcblx0fSk7XG5cblx0dGVzdCgnaW5zZXJ0ICYgZGVsZXRlICMyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJhbmdlTWFwID0gbmV3IE5vdGVib29rQ2VsbHNMYXlvdXQoKTtcblx0XHRyYW5nZU1hcC5zcGxpY2UoMCwgMCwgW29uZSwgb25lLCBvbmUsIG9uZSwgb25lLFxuXHRcdFx0b25lLCBvbmUsIG9uZSwgb25lLCBvbmVdKTtcblx0XHRyYW5nZU1hcC5zcGxpY2UoMiwgNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmNvdW50LCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuc2l6ZSwgNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydCAmIGRlbGV0ZSAjMycsICgpID0+IHtcblx0XHRjb25zdCByYW5nZU1hcCA9IG5ldyBOb3RlYm9va0NlbGxzTGF5b3V0KCk7XG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDAsIFtvbmUsIG9uZSwgb25lLCBvbmUsIG9uZSxcblx0XHRcdG9uZSwgb25lLCBvbmUsIG9uZSwgb25lLFxuXHRcdFx0dHdvLCB0d28sIHR3bywgdHdvLCB0d28sXG5cdFx0XHR0d28sIHR3bywgdHdvLCB0d28sIHR3b10pO1xuXHRcdHJhbmdlTWFwLnNwbGljZSg4LCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDE2KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuc2l6ZSwgMjQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQgJiBkZWxldGUgIzQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmFuZ2VNYXAgPSBuZXcgTm90ZWJvb2tDZWxsc0xheW91dCgpO1xuXHRcdHJhbmdlTWFwLnNwbGljZSgwLCAwLCBbb25lLCBvbmUsIG9uZSwgb25lLCBvbmUsXG5cdFx0XHRvbmUsIG9uZSwgb25lLCBvbmUsIG9uZSxcblx0XHRcdHR3bywgdHdvLCB0d28sIHR3bywgdHdvLFxuXHRcdFx0dHdvLCB0d28sIHR3bywgdHdvLCB0d29dKTtcblx0XHRyYW5nZU1hcC5zcGxpY2UoNSwgMCwgW3RocmVlLCB0aHJlZSwgdGhyZWUsIHRocmVlLCB0aHJlZV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5jb3VudCwgMjUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5zaXplLCA0NSk7XG5cblx0XHRyYW5nZU1hcC5zcGxpY2UoNCwgNyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmNvdW50LCAxOCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnNpemUsIDI4KTtcblx0fSk7XG5cblx0c3VpdGUoJ2luZGV4QXQsIHBvc2l0aW9uQXQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZW1wdHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByYW5nZU1hcCA9IG5ldyBOb3RlYm9va0NlbGxzTGF5b3V0KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuaW5kZXhBdCgwKSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuaW5kZXhBdCgxMCksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoLTEpLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAucG9zaXRpb25BdCgwKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnBvc2l0aW9uQXQoMTApLCAtMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAucG9zaXRpb25BdCgtMSksIC0xKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NpbXBsZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJhbmdlTWFwID0gbmV3IE5vdGVib29rQ2VsbHNMYXlvdXQoKTtcblx0XHRcdHJhbmdlTWFwLnNwbGljZSgwLCAwLCBbb25lXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuaW5kZXhBdCgwKSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuaW5kZXhBdCgxKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAucG9zaXRpb25BdCgwKSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAucG9zaXRpb25BdCgxKSwgLTEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2ltcGxlICMyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmFuZ2VNYXAgPSBuZXcgTm90ZWJvb2tDZWxsc0xheW91dCgpO1xuXHRcdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDAsIFt0ZW5dKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDApLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDUpLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDkpLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDEwKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAucG9zaXRpb25BdCgwKSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAucG9zaXRpb25BdCgxKSwgLTEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5zZXJ0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmFuZ2VNYXAgPSBuZXcgTm90ZWJvb2tDZWxsc0xheW91dCgpO1xuXHRcdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDAsIFtvbmUsIG9uZSwgb25lLCBvbmUsIG9uZSwgb25lLCBvbmUsIG9uZSwgb25lLCBvbmVdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDApLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDEpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDUpLCA1KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDkpLCA5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDEwKSwgMTApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoMTEpLCAxMCk7XG5cblx0XHRcdHJhbmdlTWFwLnNwbGljZSgxMCwgMCwgW29uZSwgb25lLCBvbmUsIG9uZSwgb25lLCBvbmUsIG9uZSwgb25lLCBvbmUsIG9uZV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoMTApLCAxMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuaW5kZXhBdCgxOSksIDE5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDIwKSwgMjApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoMjEpLCAyMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAucG9zaXRpb25BdCgwKSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAucG9zaXRpb25BdCgxKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAucG9zaXRpb25BdCgxOSksIDE5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5wb3NpdGlvbkF0KDIwKSwgLTEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVsZXRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmFuZ2VNYXAgPSBuZXcgTm90ZWJvb2tDZWxsc0xheW91dCgpO1xuXHRcdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDAsIFtvbmUsIG9uZSwgb25lLCBvbmUsIG9uZSwgb25lLCBvbmUsIG9uZSwgb25lLCBvbmVdKTtcblx0XHRcdHJhbmdlTWFwLnNwbGljZSgyLCA2KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoMCksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoMSksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoMyksIDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoNCksIDQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoNSksIDQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnBvc2l0aW9uQXQoMCksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnBvc2l0aW9uQXQoMSksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnBvc2l0aW9uQXQoMyksIDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnBvc2l0aW9uQXQoNCksIC0xKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlbGV0ZSAjMicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJhbmdlTWFwID0gbmV3IE5vdGVib29rQ2VsbHNMYXlvdXQoKTtcblx0XHRcdHJhbmdlTWFwLnNwbGljZSgwLCAwLCBbdGVuLCB0ZW4sIHRlbiwgdGVuLCB0ZW4sIHRlbiwgdGVuLCB0ZW4sIHRlbiwgdGVuXSk7XG5cdFx0XHRyYW5nZU1hcC5zcGxpY2UoMiwgNik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDApLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDEpLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDMwKSwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuaW5kZXhBdCg0MCksIDQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoNTApLCA0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5wb3NpdGlvbkF0KDApLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5wb3NpdGlvbkF0KDEpLCAxMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAucG9zaXRpb25BdCgyKSwgMjApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnBvc2l0aW9uQXQoMyksIDMwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5wb3NpdGlvbkF0KDQpLCAtMSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdOb3RlYm9va1JhbmdlTWFwIHdpdGggdG9wIHBhZGRpbmcnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZW1wdHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmFuZ2VNYXAgPSBuZXcgTm90ZWJvb2tDZWxsc0xheW91dCgxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnNpemUsIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDApO1xuXHR9KTtcblxuXHRjb25zdCBvbmUgPSB7IHNpemU6IDEgfTtcblx0Y29uc3QgZml2ZSA9IHsgc2l6ZTogNSB9O1xuXHRjb25zdCB0ZW4gPSB7IHNpemU6IDEwIH07XG5cblx0dGVzdCgnbGVuZ3RoICYgY291bnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmFuZ2VNYXAgPSBuZXcgTm90ZWJvb2tDZWxsc0xheW91dCgxMCk7XG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDAsIFtvbmVdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuc2l6ZSwgMTEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5jb3VudCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xlbmd0aCAmIGNvdW50ICMyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJhbmdlTWFwID0gbmV3IE5vdGVib29rQ2VsbHNMYXlvdXQoMTApO1xuXHRcdHJhbmdlTWFwLnNwbGljZSgwLCAwLCBbb25lLCBvbmUsIG9uZSwgb25lLCBvbmVdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuc2l6ZSwgMTUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5jb3VudCwgNSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xlbmd0aCAmIGNvdW50ICMzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJhbmdlTWFwID0gbmV3IE5vdGVib29rQ2VsbHNMYXlvdXQoMTApO1xuXHRcdHJhbmdlTWFwLnNwbGljZSgwLCAwLCBbZml2ZV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5zaXplLCAxNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmNvdW50LCAxKTtcblx0fSk7XG5cblx0dGVzdCgnbGVuZ3RoICYgY291bnQgIzQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmFuZ2VNYXAgPSBuZXcgTm90ZWJvb2tDZWxsc0xheW91dCgxMCk7XG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDAsIFtmaXZlLCBmaXZlLCBmaXZlLCBmaXZlLCBmaXZlXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnNpemUsIDM1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDUpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmFuZ2VNYXAgPSBuZXcgTm90ZWJvb2tDZWxsc0xheW91dCgxMCk7XG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDAsIFtmaXZlLCBmaXZlLCBmaXZlLCBmaXZlLCBmaXZlXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnNpemUsIDM1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDUpO1xuXG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDAsIFtmaXZlLCBmaXZlLCBmaXZlLCBmaXZlLCBmaXZlXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnNpemUsIDYwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuY291bnQsIDEwKTtcblxuXHRcdHJhbmdlTWFwLnNwbGljZSg1LCAwLCBbdGVuLCB0ZW5dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuc2l6ZSwgODApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5jb3VudCwgMTIpO1xuXG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDEyLCAwLCBbeyBzaXplOiAyMDAgfV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5zaXplLCAyODApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5jb3VudCwgMTMpO1xuXHR9KTtcblxuXHRzdWl0ZSgnaW5kZXhBdCwgcG9zaXRpb25BdCcsICgpID0+IHtcblx0XHR0ZXN0KCdlbXB0eScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJhbmdlTWFwID0gbmV3IE5vdGVib29rQ2VsbHNMYXlvdXQoMTApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoMCksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoMTApLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KC0xKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnBvc2l0aW9uQXQoMCksIC0xKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5wb3NpdGlvbkF0KDEwKSwgLTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnBvc2l0aW9uQXQoLTEpLCAtMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaW1wbGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByYW5nZU1hcCA9IG5ldyBOb3RlYm9va0NlbGxzTGF5b3V0KDEwKTtcblx0XHRcdHJhbmdlTWFwLnNwbGljZSgwLCAwLCBbb25lXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuaW5kZXhBdCgwKSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuaW5kZXhBdCgxKSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuaW5kZXhBdCgxMCksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoMTEpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5wb3NpdGlvbkF0KDApLCAxMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAucG9zaXRpb25BdCgxKSwgLTEpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnTm90ZWJvb2tSYW5nZU1hcCB3aXRoIHdoaXRlc3NwYWNlcycsICgpID0+IHtcblx0bGV0IHRlc3REaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGNvbmZpZzogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHR0ZXN0RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0dGVzdERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc2V0dXBJbnN0YW50aWF0aW9uU2VydmljZSh0ZXN0RGlzcG9zYWJsZXMpO1xuXHRcdGNvbmZpZyA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlnKTtcblx0fSk7XG5cblx0dGVzdCgnc2ltcGxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJhbmdlTWFwID0gbmV3IE5vdGVib29rQ2VsbHNMYXlvdXQoMCk7XG5cdFx0cmFuZ2VNYXAuc3BsaWNlKDAsIDAsIFt7IHNpemU6IDQ3OSB9LCB7IHNpemU6IDE2MyB9LCB7IHNpemU6IDE4MiB9LCB7IHNpemU6IDEwNiB9LCB7IHNpemU6IDEwNiB9LCB7IHNpemU6IDEwNiB9LCB7IHNpemU6IDg3IH1dKTtcblxuXHRcdGNvbnN0IHN0YXJ0ID0gcmFuZ2VNYXAuaW5kZXhBdCg2NTApO1xuXHRcdGNvbnN0IGVuZCA9IHJhbmdlTWFwLmluZGV4QWZ0ZXIoNjUwICsgODkwIC0gMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXJ0LCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5kLCA3KTtcblxuXHRcdHJhbmdlTWFwLmluc2VydFdoaXRlc3BhY2UoJzEnLCAwLCAxOCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoNjUwKSwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1doaXRlc3BhY2UgQ1JVRCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB0d2VudHkgPSB7IHNpemU6IDIwIH07XG5cblx0XHRjb25zdCByYW5nZU1hcCA9IG5ldyBOb3RlYm9va0NlbGxzTGF5b3V0KDApO1xuXHRcdHJhbmdlTWFwLnNwbGljZSgwLCAwLCBbdHdlbnR5LCB0d2VudHksIHR3ZW50eV0pO1xuXHRcdHJhbmdlTWFwLmluc2VydFdoaXRlc3BhY2UoJzAnLCAwLCA1KTtcblx0XHRyYW5nZU1hcC5pbnNlcnRXaGl0ZXNwYWNlKCcxJywgMCwgNSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoMCksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDEpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuaW5kZXhBdCgxMCksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5pbmRleEF0KDExKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmluZGV4QXQoMjEpLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuaW5kZXhBdCgzMSksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5wb3NpdGlvbkF0KDApLCAxMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAuZ2V0V2hpdGVzcGFjZVBvc2l0aW9uKCcwJyksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5nZXRXaGl0ZXNwYWNlUG9zaXRpb24oJzEnKSwgNSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAucG9zaXRpb25BdCgwKSwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5wb3NpdGlvbkF0KDEpLCAzMCk7XG5cblx0XHRyYW5nZU1hcC5jaGFuZ2VPbmVXaGl0ZXNwYWNlKCcwJywgMCwgMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5nZXRXaGl0ZXNwYWNlUG9zaXRpb24oJzAnKSwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmdldFdoaXRlc3BhY2VQb3NpdGlvbignMScpLCAxMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFuZ2VNYXAucG9zaXRpb25BdCgwKSwgMTUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5wb3NpdGlvbkF0KDEpLCAzNSk7XG5cblx0XHRyYW5nZU1hcC5yZW1vdmVXaGl0ZXNwYWNlKCcxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLmdldFdoaXRlc3BhY2VQb3NpdGlvbignMCcpLCAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYW5nZU1hcC5wb3NpdGlvbkF0KDApLCAxMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJhbmdlTWFwLnBvc2l0aW9uQXQoMSksIDMwKTtcblx0fSk7XG5cblx0dGVzdCgnV2hpdGVzcGFjZSB3aXRoIGVkaXRpbmcnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciBhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgYicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGMnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIGRpc3Bvc2FibGVzKSA9PiB7XG5cdFx0XHRcdHZpZXdNb2RlbC5yZXN0b3JlRWRpdG9yVmlld1N0YXRlKHtcblx0XHRcdFx0XHRlZGl0aW5nQ2VsbHM6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdLFxuXHRcdFx0XHRcdGNlbGxMaW5lTnVtYmVyU3RhdGVzOiB7fSxcblx0XHRcdFx0XHRlZGl0b3JWaWV3U3RhdGVzOiBbbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbF0sXG5cdFx0XHRcdFx0Y2VsbFRvdGFsSGVpZ2h0czogWzUwLCAxMDAsIDUwLCAxMDAsIDUwXSxcblx0XHRcdFx0XHRjb2xsYXBzZWRJbnB1dENlbGxzOiB7fSxcblx0XHRcdFx0XHRjb2xsYXBzZWRPdXRwdXRDZWxsczoge30sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IGNlbGxMaXN0ID0gY3JlYXRlTm90ZWJvb2tDZWxsTGlzdChpbnN0YW50aWF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoY2VsbExpc3QpO1xuXHRcdFx0XHRjZWxsTGlzdC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblxuXHRcdFx0XHQvLyByZW5kZXIgaGVpZ2h0IDIxMCwgaXQgY2FuIHJlbmRlciAzIGZ1bGwgY2VsbHMgYW5kIDEgcGFydGlhbCBjZWxsXG5cdFx0XHRcdGNlbGxMaXN0LmxheW91dCgyMTAsIDEwMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxIZWlnaHQsIDM1MCk7XG5cblx0XHRcdFx0Y2VsbExpc3QuY2hhbmdlVmlld1pvbmVzKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0XHRjb25zdCBpZCA9IGFjY2Vzc29yLmFkZFpvbmUoe1xuXHRcdFx0XHRcdFx0YWZ0ZXJNb2RlbFBvc2l0aW9uOiAxLFxuXHRcdFx0XHRcdFx0aGVpZ2h0SW5QeDogMjAsXG5cdFx0XHRcdFx0XHRkb21Ob2RlOiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKVxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0YWNjZXNzb3IubGF5b3V0Wm9uZShpZCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LnNjcm9sbEhlaWdodCwgMzcwKTtcblxuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRFbGVtZW50VG9wKDApLCAwKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0RWxlbWVudFRvcCgxKSwgNzApO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRFbGVtZW50VG9wKDIpLCAxNzApO1xuXG5cdFx0XHRcdFx0Y29uc3QgdGV4dE1vZGVsID0gZWRpdG9yLnRleHRNb2RlbDtcblx0XHRcdFx0XHR0ZXh0TW9kZWwuYXBwbHlFZGl0cyhbXG5cdFx0XHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDAsIGNvdW50OiAxLCBjZWxsczogW10gfSxcblx0XHRcdFx0XHRdLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRFbGVtZW50VG9wKDApLCAyMCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LmdldEVsZW1lbnRUb3AoMSksIDEyMCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LmdldEVsZW1lbnRUb3AoMiksIDE3MCk7XG5cblx0XHRcdFx0XHRhY2Nlc3Nvci5yZW1vdmVab25lKGlkKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnTXVsdGlwbGUgV2hpdGVzcGFjZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciBhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgYicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGMnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIGRpc3Bvc2FibGVzKSA9PiB7XG5cdFx0XHRcdHZpZXdNb2RlbC5yZXN0b3JlRWRpdG9yVmlld1N0YXRlKHtcblx0XHRcdFx0XHRlZGl0aW5nQ2VsbHM6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdLFxuXHRcdFx0XHRcdGNlbGxMaW5lTnVtYmVyU3RhdGVzOiB7fSxcblx0XHRcdFx0XHRlZGl0b3JWaWV3U3RhdGVzOiBbbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbF0sXG5cdFx0XHRcdFx0Y2VsbFRvdGFsSGVpZ2h0czogWzUwLCAxMDAsIDUwLCAxMDAsIDUwXSxcblx0XHRcdFx0XHRjb2xsYXBzZWRJbnB1dENlbGxzOiB7fSxcblx0XHRcdFx0XHRjb2xsYXBzZWRPdXRwdXRDZWxsczoge30sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IGNlbGxMaXN0ID0gY3JlYXRlTm90ZWJvb2tDZWxsTGlzdChpbnN0YW50aWF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoY2VsbExpc3QpO1xuXHRcdFx0XHRjZWxsTGlzdC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblxuXHRcdFx0XHQvLyByZW5kZXIgaGVpZ2h0IDIxMCwgaXQgY2FuIHJlbmRlciAzIGZ1bGwgY2VsbHMgYW5kIDEgcGFydGlhbCBjZWxsXG5cdFx0XHRcdGNlbGxMaXN0LmxheW91dCgyMTAsIDEwMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxIZWlnaHQsIDM1MCk7XG5cblx0XHRcdFx0Y2VsbExpc3QuY2hhbmdlVmlld1pvbmVzKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0XHRjb25zdCBmaXJzdCA9IGFjY2Vzc29yLmFkZFpvbmUoe1xuXHRcdFx0XHRcdFx0YWZ0ZXJNb2RlbFBvc2l0aW9uOiAwLFxuXHRcdFx0XHRcdFx0aGVpZ2h0SW5QeDogMjAsXG5cdFx0XHRcdFx0XHRkb21Ob2RlOiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGFjY2Vzc29yLmxheW91dFpvbmUoZmlyc3QpO1xuXG5cdFx0XHRcdFx0Y29uc3Qgc2Vjb25kID0gYWNjZXNzb3IuYWRkWm9uZSh7XG5cdFx0XHRcdFx0XHRhZnRlck1vZGVsUG9zaXRpb246IDMsXG5cdFx0XHRcdFx0XHRoZWlnaHRJblB4OiAyMCxcblx0XHRcdFx0XHRcdGRvbU5vZGU6IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0YWNjZXNzb3IubGF5b3V0Wm9uZShzZWNvbmQpO1xuXG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LnNjcm9sbEhlaWdodCwgMzkwKTtcblxuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRFbGVtZW50VG9wKDApLCAyMCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LmdldEVsZW1lbnRUb3AoMSksIDcwKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0RWxlbWVudFRvcCgyKSwgMTcwKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0RWxlbWVudFRvcCgzKSwgMjQwKTtcblxuXHRcdFx0XHRcdGFjY2Vzc29yLnJlbW92ZVpvbmUoZmlyc3QpO1xuXG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LnNjcm9sbEhlaWdodCwgMzcwKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0RWxlbWVudFRvcCgwKSwgMCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LmdldEVsZW1lbnRUb3AoMSksIDUwKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0RWxlbWVudFRvcCgyKSwgMTUwKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0RWxlbWVudFRvcCgzKSwgMjIwKTtcblxuXHRcdFx0XHRcdGFjY2Vzc29yLnJlbW92ZVpvbmUoc2Vjb25kKTtcblxuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxIZWlnaHQsIDM1MCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LmdldEVsZW1lbnRUb3AoMyksIDIwMCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ011bHRpcGxlIFdoaXRlc3BhY2VzIDInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciBhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgYicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGMnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIGRpc3Bvc2FibGVzKSA9PiB7XG5cdFx0XHRcdHZpZXdNb2RlbC5yZXN0b3JlRWRpdG9yVmlld1N0YXRlKHtcblx0XHRcdFx0XHRlZGl0aW5nQ2VsbHM6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdLFxuXHRcdFx0XHRcdGNlbGxMaW5lTnVtYmVyU3RhdGVzOiB7fSxcblx0XHRcdFx0XHRlZGl0b3JWaWV3U3RhdGVzOiBbbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbF0sXG5cdFx0XHRcdFx0Y2VsbFRvdGFsSGVpZ2h0czogWzUwLCAxMDAsIDUwLCAxMDAsIDUwXSxcblx0XHRcdFx0XHRjb2xsYXBzZWRJbnB1dENlbGxzOiB7fSxcblx0XHRcdFx0XHRjb2xsYXBzZWRPdXRwdXRDZWxsczoge30sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IGNlbGxMaXN0ID0gY3JlYXRlTm90ZWJvb2tDZWxsTGlzdChpbnN0YW50aWF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoY2VsbExpc3QpO1xuXHRcdFx0XHRjZWxsTGlzdC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblxuXHRcdFx0XHQvLyByZW5kZXIgaGVpZ2h0IDIxMCwgaXQgY2FuIHJlbmRlciAzIGZ1bGwgY2VsbHMgYW5kIDEgcGFydGlhbCBjZWxsXG5cdFx0XHRcdGNlbGxMaXN0LmxheW91dCgyMTAsIDEwMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxIZWlnaHQsIDM1MCk7XG5cblx0XHRcdFx0Y2VsbExpc3QuY2hhbmdlVmlld1pvbmVzKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0XHRjb25zdCBmaXJzdCA9IGFjY2Vzc29yLmFkZFpvbmUoe1xuXHRcdFx0XHRcdFx0YWZ0ZXJNb2RlbFBvc2l0aW9uOiAwLFxuXHRcdFx0XHRcdFx0aGVpZ2h0SW5QeDogMjAsXG5cdFx0XHRcdFx0XHRkb21Ob2RlOiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGFjY2Vzc29yLmxheW91dFpvbmUoZmlyc3QpO1xuXG5cdFx0XHRcdFx0Y29uc3Qgc2Vjb25kID0gYWNjZXNzb3IuYWRkWm9uZSh7XG5cdFx0XHRcdFx0XHRhZnRlck1vZGVsUG9zaXRpb246IDEsXG5cdFx0XHRcdFx0XHRoZWlnaHRJblB4OiAyMCxcblx0XHRcdFx0XHRcdGRvbU5vZGU6IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0YWNjZXNzb3IubGF5b3V0Wm9uZShzZWNvbmQpO1xuXG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LnNjcm9sbEhlaWdodCwgMzkwKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QuX2dldFZpZXcoKS5nZXRXaGl0ZXNwYWNlUG9zaXRpb24oZmlyc3QpLCAwKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QuX2dldFZpZXcoKS5nZXRXaGl0ZXNwYWNlUG9zaXRpb24oc2Vjb25kKSwgNzApO1xuXG5cdFx0XHRcdFx0YWNjZXNzb3IucmVtb3ZlWm9uZShmaXJzdCk7XG5cdFx0XHRcdFx0YWNjZXNzb3IucmVtb3ZlWm9uZShzZWNvbmQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdNdWx0aXBsZSBXaGl0ZXNwYWNlcyAzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgYScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciBjJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBkaXNwb3NhYmxlcykgPT4ge1xuXHRcdFx0XHR2aWV3TW9kZWwucmVzdG9yZUVkaXRvclZpZXdTdGF0ZSh7XG5cdFx0XHRcdFx0ZWRpdGluZ0NlbGxzOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXSxcblx0XHRcdFx0XHRjZWxsTGluZU51bWJlclN0YXRlczoge30sXG5cdFx0XHRcdFx0ZWRpdG9yVmlld1N0YXRlczogW251bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGxdLFxuXHRcdFx0XHRcdGNlbGxUb3RhbEhlaWdodHM6IFs1MCwgMTAwLCA1MCwgMTAwLCA1MF0sXG5cdFx0XHRcdFx0Y29sbGFwc2VkSW5wdXRDZWxsczoge30sXG5cdFx0XHRcdFx0Y29sbGFwc2VkT3V0cHV0Q2VsbHM6IHt9LFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCBjZWxsTGlzdCA9IGNyZWF0ZU5vdGVib29rQ2VsbExpc3QoaW5zdGFudGlhdGlvblNlcnZpY2UsIGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNlbGxMaXN0KTtcblx0XHRcdFx0Y2VsbExpc3QuYXR0YWNoVmlld01vZGVsKHZpZXdNb2RlbCk7XG5cblx0XHRcdFx0Ly8gcmVuZGVyIGhlaWdodCAyMTAsIGl0IGNhbiByZW5kZXIgMyBmdWxsIGNlbGxzIGFuZCAxIHBhcnRpYWwgY2VsbFxuXHRcdFx0XHRjZWxsTGlzdC5sYXlvdXQoMjEwLCAxMDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsSGVpZ2h0LCAzNTApO1xuXG5cdFx0XHRcdGNlbGxMaXN0LmNoYW5nZVZpZXdab25lcyhhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZmlyc3QgPSBhY2Nlc3Nvci5hZGRab25lKHtcblx0XHRcdFx0XHRcdGFmdGVyTW9kZWxQb3NpdGlvbjogMSxcblx0XHRcdFx0XHRcdGhlaWdodEluUHg6IDIwLFxuXHRcdFx0XHRcdFx0ZG9tTm9kZTogZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jylcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRhY2Nlc3Nvci5sYXlvdXRab25lKGZpcnN0KTtcblxuXHRcdFx0XHRcdGNvbnN0IHNlY29uZCA9IGFjY2Vzc29yLmFkZFpvbmUoe1xuXHRcdFx0XHRcdFx0YWZ0ZXJNb2RlbFBvc2l0aW9uOiAyLFxuXHRcdFx0XHRcdFx0aGVpZ2h0SW5QeDogMjAsXG5cdFx0XHRcdFx0XHRkb21Ob2RlOiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGFjY2Vzc29yLmxheW91dFpvbmUoc2Vjb25kKTtcblxuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxIZWlnaHQsIDM5MCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0Ll9nZXRWaWV3KCkuZ2V0V2hpdGVzcGFjZVBvc2l0aW9uKGZpcnN0KSwgNTApO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5fZ2V0VmlldygpLmdldFdoaXRlc3BhY2VQb3NpdGlvbihzZWNvbmQpLCAxNzApO1xuXG5cdFx0XHRcdFx0YWNjZXNzb3IucmVtb3ZlWm9uZShmaXJzdCk7XG5cdFx0XHRcdFx0YWNjZXNzb3IucmVtb3ZlWm9uZShzZWNvbmQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHQvLyB0ZXN0KCdNdWx0aXBsZSBXaGl0ZXNwYWNlcyA0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHQvLyBcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdC8vIFx0XHRbXG5cdC8vIFx0XHRcdFsnIyBoZWFkZXIgYScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0Ly8gXHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHQvLyBcdFx0XHRbJyMgaGVhZGVyIGInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdC8vIFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0Ly8gXHRcdFx0WycjIGhlYWRlciBjJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dXG5cdC8vIFx0XHRdLFxuXHQvLyBcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBkaXNwb3NhYmxlcykgPT4ge1xuXHQvLyBcdFx0XHR2aWV3TW9kZWwucmVzdG9yZUVkaXRvclZpZXdTdGF0ZSh7XG5cdC8vIFx0XHRcdFx0ZWRpdGluZ0NlbGxzOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXSxcblx0Ly8gXHRcdFx0XHRjZWxsTGluZU51bWJlclN0YXRlczoge30sXG5cdC8vIFx0XHRcdFx0ZWRpdG9yVmlld1N0YXRlczogW251bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGxdLFxuXHQvLyBcdFx0XHRcdGNlbGxUb3RhbEhlaWdodHM6IFs1MCwgMTAwLCA1MCwgMTAwLCA1MF0sXG5cdC8vIFx0XHRcdFx0Y29sbGFwc2VkSW5wdXRDZWxsczoge30sXG5cdC8vIFx0XHRcdFx0Y29sbGFwc2VkT3V0cHV0Q2VsbHM6IHt9LFxuXHQvLyBcdFx0XHR9KTtcblxuXHQvLyBcdFx0XHRjb25zdCBjZWxsTGlzdCA9IGNyZWF0ZU5vdGVib29rQ2VsbExpc3QoaW5zdGFudGlhdGlvblNlcnZpY2UsIGRpc3Bvc2FibGVzKTtcblx0Ly8gXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNlbGxMaXN0KTtcblx0Ly8gXHRcdFx0Y2VsbExpc3QuYXR0YWNoVmlld01vZGVsKHZpZXdNb2RlbCk7XG5cblx0Ly8gXHRcdFx0Ly8gcmVuZGVyIGhlaWdodCAyMTAsIGl0IGNhbiByZW5kZXIgMyBmdWxsIGNlbGxzIGFuZCAxIHBhcnRpYWwgY2VsbFxuXHQvLyBcdFx0XHRjZWxsTGlzdC5sYXlvdXQoMjEwLCAxMDApO1xuXHQvLyBcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsSGVpZ2h0LCAzNTApO1xuXG5cdC8vIFx0XHRcdGNlbGxMaXN0LmNoYW5nZVZpZXdab25lcyhhY2Nlc3NvciA9PiB7XG5cdC8vIFx0XHRcdFx0Y29uc3QgZmlyc3QgPSBhY2Nlc3Nvci5hZGRab25lKHtcblx0Ly8gXHRcdFx0XHRcdGFmdGVyTW9kZWxQb3NpdGlvbjogMSxcblx0Ly8gXHRcdFx0XHRcdGhlaWdodEluUHg6IDIwLFxuXHQvLyBcdFx0XHRcdFx0ZG9tTm9kZTogZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jylcblx0Ly8gXHRcdFx0XHR9KTtcblx0Ly8gXHRcdFx0XHRhY2Nlc3Nvci5sYXlvdXRab25lKGZpcnN0KTtcblxuXHQvLyBcdFx0XHRcdGNvbnN0IHNlY29uZCA9IGFjY2Vzc29yLmFkZFpvbmUoe1xuXHQvLyBcdFx0XHRcdFx0YWZ0ZXJNb2RlbFBvc2l0aW9uOiAxLFxuXHQvLyBcdFx0XHRcdFx0aGVpZ2h0SW5QeDogMjAsXG5cdC8vIFx0XHRcdFx0XHRkb21Ob2RlOiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKVxuXHQvLyBcdFx0XHRcdH0pO1xuXHQvLyBcdFx0XHRcdGFjY2Vzc29yLmxheW91dFpvbmUoc2Vjb25kKTtcblxuXHQvLyBcdFx0XHRcdGNvbnN0IHRoaXJkID0gYWNjZXNzb3IuYWRkWm9uZSh7XG5cdC8vIFx0XHRcdFx0XHRhZnRlck1vZGVsUG9zaXRpb246IDIsXG5cdC8vIFx0XHRcdFx0XHRoZWlnaHRJblB4OiAyMCxcblx0Ly8gXHRcdFx0XHRcdGRvbU5vZGU6IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpXG5cdC8vIFx0XHRcdFx0fSk7XG5cdC8vIFx0XHRcdFx0YWNjZXNzb3IubGF5b3V0Wm9uZShzZWNvbmQpO1xuXG5cdC8vIFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LnNjcm9sbEhlaWdodCwgNDEwKTtcblx0Ly8gXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QuX2dldFZpZXcoKS5nZXRXaGl0ZXNwYWNlUG9zaXRpb24oZmlyc3QpLCA1MCk7XG5cdC8vIFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0Ll9nZXRWaWV3KCkuZ2V0V2hpdGVzcGFjZVBvc2l0aW9uKHNlY29uZCksIDcwKTtcblx0Ly8gXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QuX2dldFZpZXcoKS5nZXRXaGl0ZXNwYWNlUG9zaXRpb24odGhpcmQpLCAxOTApO1xuXG5cdC8vIFx0XHRcdFx0YWNjZXNzb3IucmVtb3ZlWm9uZShmaXJzdCk7XG5cdC8vIFx0XHRcdFx0YWNjZXNzb3IucmVtb3ZlWm9uZShzZWNvbmQpO1xuXHQvLyBcdFx0XHRcdGFjY2Vzc29yLnJlbW92ZVpvbmUodGhpcmQpO1xuXHQvLyBcdFx0XHR9KTtcblx0Ly8gXHRcdH0pO1xuXHQvLyB9KTtcblxuXHR0ZXN0KCdXaGl0ZXNwYWNlIHdpdGggZm9sZGluZyBzdXBwb3J0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgYScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0WycjIGhlYWRlciBjJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBkaXNwb3NhYmxlcykgPT4ge1xuXHRcdFx0XHR2aWV3TW9kZWwucmVzdG9yZUVkaXRvclZpZXdTdGF0ZSh7XG5cdFx0XHRcdFx0ZWRpdGluZ0NlbGxzOiBbZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2UsIGZhbHNlXSxcblx0XHRcdFx0XHRjZWxsTGluZU51bWJlclN0YXRlczoge30sXG5cdFx0XHRcdFx0ZWRpdG9yVmlld1N0YXRlczogW251bGwsIG51bGwsIG51bGwsIG51bGwsIG51bGxdLFxuXHRcdFx0XHRcdGNlbGxUb3RhbEhlaWdodHM6IFs1MCwgMTAwLCA1MCwgMTAwLCA1MF0sXG5cdFx0XHRcdFx0Y29sbGFwc2VkSW5wdXRDZWxsczoge30sXG5cdFx0XHRcdFx0Y29sbGFwc2VkT3V0cHV0Q2VsbHM6IHt9LFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjb25zdCBjZWxsTGlzdCA9IGNyZWF0ZU5vdGVib29rQ2VsbExpc3QoaW5zdGFudGlhdGlvblNlcnZpY2UsIGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNlbGxMaXN0KTtcblx0XHRcdFx0Y2VsbExpc3QuYXR0YWNoVmlld01vZGVsKHZpZXdNb2RlbCk7XG5cblx0XHRcdFx0Ly8gcmVuZGVyIGhlaWdodCAyMTAsIGl0IGNhbiByZW5kZXIgMyBmdWxsIGNlbGxzIGFuZCAxIHBhcnRpYWwgY2VsbFxuXHRcdFx0XHRjZWxsTGlzdC5sYXlvdXQoMjEwLCAxMDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsSGVpZ2h0LCAzNTApO1xuXG5cdFx0XHRcdGNlbGxMaXN0LmNoYW5nZVZpZXdab25lcyhhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgaWQgPSBhY2Nlc3Nvci5hZGRab25lKHtcblx0XHRcdFx0XHRcdGFmdGVyTW9kZWxQb3NpdGlvbjogMCxcblx0XHRcdFx0XHRcdGhlaWdodEluUHg6IDIwLFxuXHRcdFx0XHRcdFx0ZG9tTm9kZTogZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jylcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGFjY2Vzc29yLmxheW91dFpvbmUoaWQpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxIZWlnaHQsIDM3MCk7XG5cblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0RWxlbWVudFRvcCgwKSwgMjApO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRFbGVtZW50VG9wKDEpLCA3MCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LmdldEVsZW1lbnRUb3AoMiksIDE3MCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LmdldEVsZW1lbnRUb3AoMyksIDIyMCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LmdldEVsZW1lbnRUb3AoNCksIDMyMCk7XG5cblx0XHRcdFx0XHRhY2Nlc3Nvci5yZW1vdmVab25lKGlkKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsSGVpZ2h0LCAzNTApO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRjZWxsTGlzdC5jaGFuZ2VWaWV3Wm9uZXMoYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGlkID0gYWNjZXNzb3IuYWRkWm9uZSh7XG5cdFx0XHRcdFx0XHRhZnRlck1vZGVsUG9zaXRpb246IDEsXG5cdFx0XHRcdFx0XHRoZWlnaHRJblB4OiAyMCxcblx0XHRcdFx0XHRcdGRvbU5vZGU6IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpXG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRhY2Nlc3Nvci5sYXlvdXRab25lKGlkKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsSGVpZ2h0LCAzNzApO1xuXG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LmdldEVsZW1lbnRUb3AoMCksIDApO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRFbGVtZW50VG9wKDEpLCA3MCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LmdldEVsZW1lbnRUb3AoMiksIDE3MCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LmdldEVsZW1lbnRUb3AoMyksIDIyMCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LmdldEVsZW1lbnRUb3AoNCksIDMyMCk7XG5cblx0XHRcdFx0XHRhY2Nlc3Nvci5yZW1vdmVab25lKGlkKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsSGVpZ2h0LCAzNTApO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBXaGl0ZXNwYWNlIHNob3VsZCBiZSBoaWRkZW4gaWYgaXQncyBhZnRlciB0aGUgaGVhZGVyIGluIGEgZm9sZGluZyByZWdpb25cblx0XHRcdFx0Y2VsbExpc3QuY2hhbmdlVmlld1pvbmVzKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0XHRjb25zdCBpZCA9IGFjY2Vzc29yLmFkZFpvbmUoe1xuXHRcdFx0XHRcdFx0YWZ0ZXJNb2RlbFBvc2l0aW9uOiAzLFxuXHRcdFx0XHRcdFx0aGVpZ2h0SW5QeDogMjAsXG5cdFx0XHRcdFx0XHRkb21Ob2RlOiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKVxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0YWNjZXNzb3IubGF5b3V0Wm9uZShpZCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LnNjcm9sbEhlaWdodCwgMzcwKTtcblxuXHRcdFx0XHRcdGNvbnN0IGZvbGRpbmdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRm9sZGluZ01vZGVsKCkpO1xuXHRcdFx0XHRcdGZvbGRpbmdNb2RlbC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblx0XHRcdFx0XHRmb2xkaW5nTW9kZWwuYXBwbHlNZW1lbnRvKFt7IHN0YXJ0OiAyLCBlbmQ6IDMgfV0pO1xuXHRcdFx0XHRcdHZpZXdNb2RlbC51cGRhdGVGb2xkaW5nUmFuZ2VzKGZvbGRpbmdNb2RlbC5yZWdpb25zKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRIaWRkZW5SYW5nZXMoKSwgW1xuXHRcdFx0XHRcdFx0eyBzdGFydDogMywgZW5kOiAzIH1cblx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRjZWxsTGlzdC5zZXRIaWRkZW5BcmVhcyh2aWV3TW9kZWwuZ2V0SGlkZGVuUmFuZ2VzKCksIHRydWUpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxIZWlnaHQsIDI1MCk7XG5cblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0RWxlbWVudFRvcCgwKSwgMCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LmdldEVsZW1lbnRUb3AoMSksIDUwKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0RWxlbWVudFRvcCgyKSwgMTUwKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0RWxlbWVudFRvcCgzKSwgMjAwKTtcblxuXHRcdFx0XHRcdGNlbGxMaXN0LnNldEhpZGRlbkFyZWFzKFtdLCB0cnVlKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsSGVpZ2h0LCAzNzApO1xuXHRcdFx0XHRcdGFjY2Vzc29yLnJlbW92ZVpvbmUoaWQpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxIZWlnaHQsIDM1MCk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIFdoaXRlc3BhY2Ugc2hvdWxkIG5vdCBiZSBoaWRkZW4gaWYgaXQncyBhZnRlciB0aGUgbGFzdCBjZWxsIGluIGEgZm9sZGluZyByZWdpb25cblx0XHRcdFx0Y2VsbExpc3QuY2hhbmdlVmlld1pvbmVzKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0XHRjb25zdCBpZCA9IGFjY2Vzc29yLmFkZFpvbmUoe1xuXHRcdFx0XHRcdFx0YWZ0ZXJNb2RlbFBvc2l0aW9uOiA0LFxuXHRcdFx0XHRcdFx0aGVpZ2h0SW5QeDogMjAsXG5cdFx0XHRcdFx0XHRkb21Ob2RlOiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKVxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0YWNjZXNzb3IubGF5b3V0Wm9uZShpZCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LnNjcm9sbEhlaWdodCwgMzcwKTtcblxuXHRcdFx0XHRcdGNvbnN0IGZvbGRpbmdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRm9sZGluZ01vZGVsKCkpO1xuXHRcdFx0XHRcdGZvbGRpbmdNb2RlbC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblx0XHRcdFx0XHRmb2xkaW5nTW9kZWwuYXBwbHlNZW1lbnRvKFt7IHN0YXJ0OiAyLCBlbmQ6IDMgfV0pO1xuXHRcdFx0XHRcdHZpZXdNb2RlbC51cGRhdGVGb2xkaW5nUmFuZ2VzKGZvbGRpbmdNb2RlbC5yZWdpb25zKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdNb2RlbC5nZXRIaWRkZW5SYW5nZXMoKSwgW1xuXHRcdFx0XHRcdFx0eyBzdGFydDogMywgZW5kOiAzIH1cblx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRjZWxsTGlzdC5zZXRIaWRkZW5BcmVhcyh2aWV3TW9kZWwuZ2V0SGlkZGVuUmFuZ2VzKCksIHRydWUpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxIZWlnaHQsIDI3MCk7XG5cblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0RWxlbWVudFRvcCgwKSwgMCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LmdldEVsZW1lbnRUb3AoMSksIDUwKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0RWxlbWVudFRvcCgyKSwgMTUwKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0RWxlbWVudFRvcCgzKSwgMjIwKTtcblxuXHRcdFx0XHRcdGNlbGxMaXN0LnNldEhpZGRlbkFyZWFzKFtdLCB0cnVlKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsSGVpZ2h0LCAzNzApO1xuXHRcdFx0XHRcdGFjY2Vzc29yLnJlbW92ZVpvbmUoaWQpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxIZWlnaHQsIDM1MCk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIFdoaXRlc3BhY2UgbW92ZSB3aGVuIHByZXZpb3VzIGZvbGRpbmcgcmVnaW9ucyBmb2xkXG5cdFx0XHRcdGNlbGxMaXN0LmNoYW5nZVZpZXdab25lcyhhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgaWQgPSBhY2Nlc3Nvci5hZGRab25lKHtcblx0XHRcdFx0XHRcdGFmdGVyTW9kZWxQb3NpdGlvbjogNCxcblx0XHRcdFx0XHRcdGhlaWdodEluUHg6IDIwLFxuXHRcdFx0XHRcdFx0ZG9tTm9kZTogZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jylcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGFjY2Vzc29yLmxheW91dFpvbmUoaWQpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxIZWlnaHQsIDM3MCk7XG5cblx0XHRcdFx0XHRjb25zdCBmb2xkaW5nTW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZvbGRpbmdNb2RlbCgpKTtcblx0XHRcdFx0XHRmb2xkaW5nTW9kZWwuYXR0YWNoVmlld01vZGVsKHZpZXdNb2RlbCk7XG5cdFx0XHRcdFx0Zm9sZGluZ01vZGVsLmFwcGx5TWVtZW50byhbeyBzdGFydDogMCwgZW5kOiAxIH1dKTtcblx0XHRcdFx0XHR2aWV3TW9kZWwudXBkYXRlRm9sZGluZ1Jhbmdlcyhmb2xkaW5nTW9kZWwucmVnaW9ucyk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3TW9kZWwuZ2V0SGlkZGVuUmFuZ2VzKCksIFtcblx0XHRcdFx0XHRcdHsgc3RhcnQ6IDEsIGVuZDogMSB9XG5cdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0Y2VsbExpc3Quc2V0SGlkZGVuQXJlYXModmlld01vZGVsLmdldEhpZGRlblJhbmdlcygpLCB0cnVlKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsSGVpZ2h0LCAyNzApO1xuXG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LmdldEVsZW1lbnRUb3AoMCksIDApO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRFbGVtZW50VG9wKDEpLCA1MCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LmdldEVsZW1lbnRUb3AoMiksIDEwMCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LmdldEVsZW1lbnRUb3AoMyksIDIyMCk7XG5cblx0XHRcdFx0XHRjZWxsTGlzdC5zZXRIaWRkZW5BcmVhcyhbXSwgdHJ1ZSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LnNjcm9sbEhlaWdodCwgMzcwKTtcblx0XHRcdFx0XHRhY2Nlc3Nvci5yZW1vdmVab25lKGlkKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsSGVpZ2h0LCAzNTApO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdXaGl0ZXNwYWNlIHdpdGggbXVsdGlwbGUgdmlld3pvbmVzIGF0IHNhbWUgcG9zaXRpb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciBhJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsnIyBoZWFkZXIgYicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGMnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIGRpc3Bvc2FibGVzKSA9PiB7XG5cdFx0XHRcdHZpZXdNb2RlbC5yZXN0b3JlRWRpdG9yVmlld1N0YXRlKHtcblx0XHRcdFx0XHRlZGl0aW5nQ2VsbHM6IFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdLFxuXHRcdFx0XHRcdGNlbGxMaW5lTnVtYmVyU3RhdGVzOiB7fSxcblx0XHRcdFx0XHRlZGl0b3JWaWV3U3RhdGVzOiBbbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbF0sXG5cdFx0XHRcdFx0Y2VsbFRvdGFsSGVpZ2h0czogWzUwLCAxMDAsIDUwLCAxMDAsIDUwXSxcblx0XHRcdFx0XHRjb2xsYXBzZWRJbnB1dENlbGxzOiB7fSxcblx0XHRcdFx0XHRjb2xsYXBzZWRPdXRwdXRDZWxsczoge30sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGNvbnN0IGNlbGxMaXN0ID0gY3JlYXRlTm90ZWJvb2tDZWxsTGlzdChpbnN0YW50aWF0aW9uU2VydmljZSwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoY2VsbExpc3QpO1xuXHRcdFx0XHRjZWxsTGlzdC5hdHRhY2hWaWV3TW9kZWwodmlld01vZGVsKTtcblxuXHRcdFx0XHQvLyByZW5kZXIgaGVpZ2h0IDIxMCwgaXQgY2FuIHJlbmRlciAzIGZ1bGwgY2VsbHMgYW5kIDEgcGFydGlhbCBjZWxsXG5cdFx0XHRcdGNlbGxMaXN0LmxheW91dCgyMTAsIDEwMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5zY3JvbGxIZWlnaHQsIDM1MCk7XG5cblx0XHRcdFx0Y2VsbExpc3QuY2hhbmdlVmlld1pvbmVzKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0XHRjb25zdCBmaXJzdCA9IGFjY2Vzc29yLmFkZFpvbmUoe1xuXHRcdFx0XHRcdFx0YWZ0ZXJNb2RlbFBvc2l0aW9uOiAwLFxuXHRcdFx0XHRcdFx0aGVpZ2h0SW5QeDogMjAsXG5cdFx0XHRcdFx0XHRkb21Ob2RlOiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKVxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0YWNjZXNzb3IubGF5b3V0Wm9uZShmaXJzdCk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LnNjcm9sbEhlaWdodCwgMzcwKTtcblxuXHRcdFx0XHRcdGNvbnN0IHNlY29uZCA9IGFjY2Vzc29yLmFkZFpvbmUoe1xuXHRcdFx0XHRcdFx0YWZ0ZXJNb2RlbFBvc2l0aW9uOiAwLFxuXHRcdFx0XHRcdFx0aGVpZ2h0SW5QeDogMjAsXG5cdFx0XHRcdFx0XHRkb21Ob2RlOiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGFjY2Vzc29yLmxheW91dFpvbmUoc2Vjb25kKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsSGVpZ2h0LCAzOTApO1xuXG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNlbGxMaXN0LmdldEVsZW1lbnRUb3AoMCksIDQwKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3QuZ2V0RWxlbWVudFRvcCgxKSwgOTApO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRFbGVtZW50VG9wKDIpLCAxOTApO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRFbGVtZW50VG9wKDMpLCAyNDApO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsTGlzdC5nZXRFbGVtZW50VG9wKDQpLCAzNDApO1xuXG5cblx0XHRcdFx0XHRhY2Nlc3Nvci5yZW1vdmVab25lKGZpcnN0KTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsSGVpZ2h0LCAzNzApO1xuXHRcdFx0XHRcdGFjY2Vzc29yLnJlbW92ZVpvbmUoc2Vjb25kKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbExpc3Quc2Nyb2xsSGVpZ2h0LCAzNTApO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsY0FBYyxnQkFBZ0I7QUFDdkMsU0FBUyx3QkFBd0IsMkJBQTJCLHdCQUF3QjtBQUVwRixNQUFNLG9CQUFvQixNQUFN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Z0I7QUFDekMsa0JBQVUsdUJBQXVCO0FBQUEsVUFDaEMsY0FBYyxDQUFDLE9BQU8sT0FBTyxPQUFPLE9BQU8sS0FBSztBQUFBLFVBQ2hELHNCQUFzQixDQUFDO0FBQUEsVUFDdkIsa0JBQWtCLENBQUMsTUFBTSxNQUFNLE1BQU0sTUFBTSxJQUFJO0FBQUEsVUFDL0Msa0JBQWtCLENBQUMsSUFBSSxLQUFLLElBQUksS0FBSyxFQUFFO0FBQUEsVUFDdkMscUJBQXFCLENBQUM7QUFBQSxVQUN0QixzQkFBc0IsQ0FBQztBQUFBLFFBQ3hCLENBQUM7QUFFRCxjQUFNLFdBQVcsdUJBQXVCLHNCQUFzQixXQUFXO0FBQ3pFLG9CQUFZLElBQUksUUFBUTtBQUN4QixpQkFBUyxnQkFBZ0IsU0FBUztBQUdsQyxpQkFBUyxPQUFPLEtBQUssR0FBRztBQUN4QixlQUFPLFlBQVksU0FBUyxjQUFjLEdBQUc7QUFFN0MsaUJBQVMsZ0JBQWdCLGNBQVk7QUFDcEMsZ0JBQU0sUUFBUSxTQUFTLFFBQVE7QUFBQSxZQUM5QixvQkFBb0I7QUFBQSxZQUNwQixZQUFZO0FBQUEsWUFDWixTQUFTLFNBQVMsY0FBYyxLQUFLO0FBQUEsVUFDdEMsQ0FBQztBQUVELG1CQUFTLFdBQVcsS0FBSztBQUN6QixpQkFBTyxZQUFZLFNBQVMsY0FBYyxHQUFHO0FBRTdDLGdCQUFNLFNBQVMsU0FBUyxRQUFRO0FBQUEsWUFDL0Isb0JBQW9CO0FBQUEsWUFDcEIsWUFBWTtBQUFBLFlBQ1osU0FBUyxTQUFTLGNBQWMsS0FBSztBQUFBLFVBQ3RDLENBQUM7QUFDRCxtQkFBUyxXQUFXLE1BQU07QUFDMUIsaUJBQU8sWUFBWSxTQUFTLGNBQWMsR0FBRztBQUU3QyxpQkFBTyxZQUFZLFNBQVMsY0FBYyxDQUFDLEdBQUcsRUFBRTtBQUNoRCxpQkFBTyxZQUFZLFNBQVMsY0FBYyxDQUFDLEdBQUcsRUFBRTtBQUNoRCxpQkFBTyxZQUFZLFNBQVMsY0FBYyxDQUFDLEdBQUcsR0FBRztBQUNqRCxpQkFBTyxZQUFZLFNBQVMsY0FBYyxDQUFDLEdBQUcsR0FBRztBQUNqRCxpQkFBTyxZQUFZLFNBQVMsY0FBYyxDQUFDLEdBQUcsR0FBRztBQUdqRCxtQkFBUyxXQUFXLEtBQUs7QUFDekIsaUJBQU8sWUFBWSxTQUFTLGNBQWMsR0FBRztBQUM3QyxtQkFBUyxXQUFXLE1BQU07QUFDMUIsaUJBQU8sWUFBWSxTQUFTLGNBQWMsR0FBRztBQUFBLFFBQzlDLENBQUM7QUFBQSxNQUNGO0FBQUEsSUFBQztBQUFBLEVBQ0gsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
