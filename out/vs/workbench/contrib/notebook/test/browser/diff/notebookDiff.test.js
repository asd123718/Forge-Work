import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { LcsDiff } from "../../../../../../base/common/diff/diff.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { Mimes } from "../../../../../../base/common/mime.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { NotebookDiffEditorEventDispatcher } from "../../../browser/diff/eventDispatcher.js";
import { NotebookDiffViewModel, prettyChanges } from "../../../browser/diff/notebookDiffViewModel.js";
import { CellKind } from "../../../common/notebookCommon.js";
import { INotebookService } from "../../../common/notebookService.js";
import { withTestNotebookDiffModel } from "../testNotebookEditor.js";
class CellSequence {
  constructor(textModel) {
    this.textModel = textModel;
  }
  getElements() {
    const hashValue = new Int32Array(this.textModel.cells.length);
    for (let i = 0; i < this.textModel.cells.length; i++) {
      hashValue[i] = this.textModel.cells[i].getHashValue();
    }
    return hashValue;
  }
}
suite("NotebookDiff", () => {
  let disposables;
  let token;
  let eventDispatcher;
  let diffViewModel;
  let diffResult;
  let notebookEditorWorkerService;
  let heightCalculator;
  teardown(() => disposables.dispose());
  const configurationService = new TestConfigurationService({ notebook: { diff: { ignoreMetadata: true } } });
  ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    disposables = new DisposableStore();
    const cancellation = disposables.add(new CancellationTokenSource());
    eventDispatcher = disposables.add(new NotebookDiffEditorEventDispatcher());
    token = cancellation.token;
    notebookEditorWorkerService = new class extends mock() {
      computeDiff() {
        return Promise.resolve({ cellsDiff: diffResult, metadataChanged: false });
      }
    }();
    heightCalculator = new class extends mock() {
      diffAndComputeHeight() {
        return Promise.resolve(0);
      }
      computeHeightFromLines(_lineCount) {
        return 0;
      }
    }();
  });
  async function verifyChangeEventIsNotFired(diffViewModel2) {
    let eventArgs = void 0;
    disposables.add(diffViewModel2.onDidChangeItems((e) => eventArgs = e));
    await diffViewModel2.computeDiff(token);
    assert.strictEqual(eventArgs, void 0);
  }
  test("diff different source", async () => {
    await withTestNotebookDiffModel([
      ["x", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }]
    ], [
      ["y", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }]
    ], async (model, disposables2, accessor) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      diffResult = diff.ComputeDiff(false);
      assert.strictEqual(diffResult.changes.length, 1);
      assert.deepStrictEqual(diffResult.changes.map((change) => ({
        originalStart: change.originalStart,
        originalLength: change.originalLength,
        modifiedStart: change.modifiedStart,
        modifiedLength: change.modifiedLength
      })), [{
        originalStart: 0,
        originalLength: 1,
        modifiedStart: 0,
        modifiedLength: 1
      }]);
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, void 0));
      await diffViewModel.computeDiff(token);
      assert.strictEqual(diffViewModel.items.length, 1);
      assert.strictEqual(diffViewModel.items[0].type, "modified");
    });
  });
  test("No changes when re-computing diff with the same source", async () => {
    await withTestNotebookDiffModel([
      ["x", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }]
    ], [
      ["y", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }]
    ], async (model, disposables2, accessor) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      diffResult = diff.ComputeDiff(false);
      assert.strictEqual(diffResult.changes.length, 1);
      assert.deepStrictEqual(diffResult.changes.map((change) => ({
        originalStart: change.originalStart,
        originalLength: change.originalLength,
        modifiedStart: change.modifiedStart,
        modifiedLength: change.modifiedLength
      })), [{
        originalStart: 0,
        originalLength: 1,
        modifiedStart: 0,
        modifiedLength: 1
      }]);
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, void 0));
      await diffViewModel.computeDiff(token);
      await verifyChangeEventIsNotFired(diffViewModel);
    });
  });
  test("diff different output", async () => {
    await withTestNotebookDiffModel([
      ["x", "javascript", CellKind.Code, [{ outputId: "someId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([5])) }] }], { metadata: { collapsed: false }, executionOrder: 5 }],
      ["", "javascript", CellKind.Code, [], {}]
    ], [
      ["x", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
      ["", "javascript", CellKind.Code, [], {}]
    ], async (model, disposables2, accessor) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      diffResult = diff.ComputeDiff(false);
      assert.strictEqual(diffResult.changes.length, 1);
      assert.deepStrictEqual(diffResult.changes.map((change) => ({
        originalStart: change.originalStart,
        originalLength: change.originalLength,
        modifiedStart: change.modifiedStart,
        modifiedLength: change.modifiedLength
      })), [{
        originalStart: 0,
        originalLength: 1,
        modifiedStart: 0,
        modifiedLength: 1
      }]);
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, void 0));
      let eventArgs = void 0;
      disposables2.add(diffViewModel.onDidChangeItems((e) => eventArgs = e));
      await diffViewModel.computeDiff(token);
      assert.strictEqual(diffViewModel.items.length, 2);
      assert.strictEqual(diffViewModel.items[0].type, "modified");
      assert.strictEqual(diffViewModel.items[1].type, "placeholder");
      diffViewModel.items[1].showHiddenCells();
      assert.strictEqual(diffViewModel.items.length, 2);
      assert.strictEqual(diffViewModel.items[0].type, "modified");
      assert.strictEqual(diffViewModel.items[1].type, "unchanged");
      assert.deepStrictEqual(eventArgs, { start: 1, deleteCount: 1, elements: [diffViewModel.items[1]] });
      diffViewModel.items[1].hideUnchangedCells();
      assert.strictEqual(diffViewModel.items.length, 2);
      assert.strictEqual(diffViewModel.items[0].type, "modified");
      assert.strictEqual(diffViewModel.items[1].type, "placeholder");
      assert.deepStrictEqual(eventArgs, { start: 1, deleteCount: 1, elements: [diffViewModel.items[1]] });
      await verifyChangeEventIsNotFired(diffViewModel);
    });
  });
  test("diff test small source", async () => {
    await withTestNotebookDiffModel([
      ["123456789", "javascript", CellKind.Code, [], {}]
    ], [
      ["987654321", "javascript", CellKind.Code, [], {}]
    ], async (model, disposables2, accessor) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      diffResult = diff.ComputeDiff(false);
      assert.strictEqual(diffResult.changes.length, 1);
      assert.deepStrictEqual(diffResult.changes.map((change) => ({
        originalStart: change.originalStart,
        originalLength: change.originalLength,
        modifiedStart: change.modifiedStart,
        modifiedLength: change.modifiedLength
      })), [{
        originalStart: 0,
        originalLength: 1,
        modifiedStart: 0,
        modifiedLength: 1
      }]);
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, void 0));
      await diffViewModel.computeDiff(token);
      assert.strictEqual(diffViewModel.items.length, 1);
      assert.strictEqual(diffViewModel.items[0].type, "modified");
      await verifyChangeEventIsNotFired(diffViewModel);
    });
  });
  test("diff test data single cell", async () => {
    await withTestNotebookDiffModel([
      [[
        "# This version has a bug\n",
        "def mult(a, b):\n",
        "    return a / b"
      ].join(""), "javascript", CellKind.Code, [], {}]
    ], [
      [[
        "def mult(a, b):\n",
        "    'This version is debugged.'\n",
        "    return a * b"
      ].join(""), "javascript", CellKind.Code, [], {}]
    ], async (model, disposables2, accessor) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      diffResult = diff.ComputeDiff(false);
      assert.strictEqual(diffResult.changes.length, 1);
      assert.deepStrictEqual(diffResult.changes.map((change) => ({
        originalStart: change.originalStart,
        originalLength: change.originalLength,
        modifiedStart: change.modifiedStart,
        modifiedLength: change.modifiedLength
      })), [{
        originalStart: 0,
        originalLength: 1,
        modifiedStart: 0,
        modifiedLength: 1
      }]);
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, void 0));
      await diffViewModel.computeDiff(token);
      assert.strictEqual(diffViewModel.items.length, 1);
      assert.strictEqual(diffViewModel.items[0].type, "modified");
      await verifyChangeEventIsNotFired(diffViewModel);
    });
  });
  test("diff foo/foe", async () => {
    await withTestNotebookDiffModel([
      [["def foe(x, y):\n", "    return x + y\n", "foe(3, 2)"].join(""), "javascript", CellKind.Code, [{ outputId: "someId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([6])) }] }], { metadata: { collapsed: false }, executionOrder: 5 }],
      [["def foo(x, y):\n", "    return x * y\n", "foo(1, 2)"].join(""), "javascript", CellKind.Code, [{ outputId: "someId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([2])) }] }], { metadata: { collapsed: false }, executionOrder: 6 }],
      ["", "javascript", CellKind.Code, [], {}]
    ], [
      [["def foo(x, y):\n", "    return x * y\n", "foo(1, 2)"].join(""), "javascript", CellKind.Code, [{ outputId: "someId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([6])) }] }], { metadata: { collapsed: false }, executionOrder: 5 }],
      [["def foe(x, y):\n", "    return x + y\n", "foe(3, 2)"].join(""), "javascript", CellKind.Code, [{ outputId: "someId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([2])) }] }], { metadata: { collapsed: false }, executionOrder: 6 }],
      ["", "javascript", CellKind.Code, [], {}]
    ], async (model, disposables2, accessor) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      diffResult = diff.ComputeDiff(false);
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, void 0));
      let eventArgs = void 0;
      disposables2.add(diffViewModel.onDidChangeItems((e) => eventArgs = e));
      await diffViewModel.computeDiff(token);
      assert.strictEqual(diffViewModel.items.length, 3);
      assert.strictEqual(diffViewModel.items[0].type, "modified");
      assert.strictEqual(diffViewModel.items[1].type, "modified");
      assert.strictEqual(diffViewModel.items[2].type, "placeholder");
      diffViewModel.items[2].showHiddenCells();
      assert.strictEqual(diffViewModel.items[2].type, "unchanged");
      assert.deepStrictEqual(eventArgs, { start: 2, deleteCount: 1, elements: [diffViewModel.items[2]] });
      await verifyChangeEventIsNotFired(diffViewModel);
    });
  });
  test("diff markdown", async () => {
    await withTestNotebookDiffModel([
      ["This is a test notebook with only markdown cells", "markdown", CellKind.Markup, [], {}],
      ["Lorem ipsum dolor sit amet", "markdown", CellKind.Markup, [], {}],
      ["In other news", "markdown", CellKind.Markup, [], {}]
    ], [
      ["This is a test notebook with markdown cells only", "markdown", CellKind.Markup, [], {}],
      ["Lorem ipsum dolor sit amet", "markdown", CellKind.Markup, [], {}],
      ["In the news", "markdown", CellKind.Markup, [], {}]
    ], async (model, disposables2, accessor) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      diffResult = diff.ComputeDiff(false);
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, void 0));
      let eventArgs = void 0;
      disposables2.add(diffViewModel.onDidChangeItems((e) => eventArgs = e));
      await diffViewModel.computeDiff(token);
      assert.strictEqual(diffViewModel.items.length, 3);
      assert.strictEqual(diffViewModel.items[0].type, "modified");
      assert.strictEqual(diffViewModel.items[1].type, "placeholder");
      assert.strictEqual(diffViewModel.items[2].type, "modified");
      diffViewModel.items[1].showHiddenCells();
      assert.strictEqual(diffViewModel.items[1].type, "unchanged");
      assert.deepStrictEqual(eventArgs, { start: 1, deleteCount: 1, elements: [diffViewModel.items[1]] });
      await verifyChangeEventIsNotFired(diffViewModel);
    });
  });
  test("diff insert", async () => {
    await withTestNotebookDiffModel([
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 2;", "javascript", CellKind.Code, [], {}]
    ], [
      ["var h = 8;", "javascript", CellKind.Code, [], {}],
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 2;", "javascript", CellKind.Code, [], {}]
    ], async (model, disposables2, accessor) => {
      diffResult = {
        changes: [{
          originalStart: 0,
          originalLength: 0,
          modifiedStart: 0,
          modifiedLength: 1
        }],
        quitEarly: false
      };
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, void 0));
      let eventArgs;
      disposables2.add(diffViewModel.onDidChangeItems((e) => eventArgs = e));
      await diffViewModel.computeDiff(token);
      assert.strictEqual(eventArgs?.firstChangeIndex, 0);
      assert.strictEqual(diffViewModel.items[0].type, "insert");
      assert.strictEqual(diffViewModel.items[1].type, "placeholder");
      diffViewModel.items[1].showHiddenCells();
      assert.strictEqual(diffViewModel.items[1].type, "unchanged");
      assert.strictEqual(diffViewModel.items[2].type, "unchanged");
      assert.deepStrictEqual(eventArgs, { start: 1, deleteCount: 1, elements: [diffViewModel.items[1], diffViewModel.items[2]] });
      await verifyChangeEventIsNotFired(diffViewModel);
    });
  });
  test("diff insert 2", async () => {
    await withTestNotebookDiffModel([
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 2;", "javascript", CellKind.Code, [], {}],
      ["var c = 3;", "javascript", CellKind.Code, [], {}],
      ["var d = 4;", "javascript", CellKind.Code, [], {}],
      ["var e = 5;", "javascript", CellKind.Code, [], {}],
      ["var f = 6;", "javascript", CellKind.Code, [], {}],
      ["var g = 7;", "javascript", CellKind.Code, [], {}]
    ], [
      ["var h = 8;", "javascript", CellKind.Code, [], {}],
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 2;", "javascript", CellKind.Code, [], {}],
      ["var c = 3;", "javascript", CellKind.Code, [], {}],
      ["var d = 4;", "javascript", CellKind.Code, [], {}],
      ["var e = 5;", "javascript", CellKind.Code, [], {}],
      ["var f = 6;", "javascript", CellKind.Code, [], {}],
      ["var g = 7;", "javascript", CellKind.Code, [], {}]
    ], async (model, disposables2, accessor) => {
      const eventDispatcher2 = disposables2.add(new NotebookDiffEditorEventDispatcher());
      diffResult = {
        changes: [{
          originalStart: 0,
          originalLength: 0,
          modifiedStart: 0,
          modifiedLength: 1
        }, {
          originalStart: 0,
          originalLength: 6,
          modifiedStart: 1,
          modifiedLength: 6
        }],
        quitEarly: false
      };
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher2, accessor.get(INotebookService), heightCalculator, void 0));
      let eventArgs;
      disposables2.add(diffViewModel.onDidChangeItems((e) => eventArgs = e));
      await diffViewModel.computeDiff(token);
      assert.strictEqual(eventArgs?.firstChangeIndex, 0);
      assert.strictEqual(diffViewModel.items.length, 2);
      assert.strictEqual(diffViewModel.items[0].type, "insert");
      assert.strictEqual(diffViewModel.items[1].type, "placeholder");
      diffViewModel.items[1].showHiddenCells();
      assert.strictEqual(diffViewModel.items[1].type, "unchanged");
      assert.strictEqual(diffViewModel.items[2].type, "unchanged");
      assert.strictEqual(diffViewModel.items[3].type, "unchanged");
      assert.strictEqual(diffViewModel.items[4].type, "unchanged");
      assert.strictEqual(diffViewModel.items[5].type, "unchanged");
      assert.strictEqual(diffViewModel.items[6].type, "unchanged");
      assert.strictEqual(diffViewModel.items[7].type, "unchanged");
      assert.deepStrictEqual(eventArgs, { start: 1, deleteCount: 1, elements: diffViewModel.items.slice(1) });
      diffViewModel.items[1].hideUnchangedCells();
      assert.strictEqual(diffViewModel.items.length, 2);
      assert.strictEqual(diffViewModel.items[0].type, "insert");
      assert.strictEqual(diffViewModel.items[1].type, "placeholder");
      assert.deepStrictEqual(eventArgs, { start: 1, deleteCount: 7, elements: [diffViewModel.items[1]] });
      await verifyChangeEventIsNotFired(diffViewModel);
    });
  });
  test("diff insert 3", async () => {
    await withTestNotebookDiffModel([
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 2;", "javascript", CellKind.Code, [], {}],
      ["var c = 3;", "javascript", CellKind.Code, [], {}],
      ["var d = 4;", "javascript", CellKind.Code, [], {}],
      ["var e = 5;", "javascript", CellKind.Code, [], {}],
      ["var f = 6;", "javascript", CellKind.Code, [], {}],
      ["var g = 7;", "javascript", CellKind.Code, [], {}]
    ], [
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 2;", "javascript", CellKind.Code, [], {}],
      ["var c = 3;", "javascript", CellKind.Code, [], {}],
      ["var d = 4;", "javascript", CellKind.Code, [], {}],
      ["var h = 8;", "javascript", CellKind.Code, [], {}],
      ["var e = 5;", "javascript", CellKind.Code, [], {}],
      ["var f = 6;", "javascript", CellKind.Code, [], {}],
      ["var g = 7;", "javascript", CellKind.Code, [], {}]
    ], async (model, disposables2, accessor) => {
      diffResult = {
        changes: [{
          originalStart: 4,
          originalLength: 0,
          modifiedStart: 4,
          modifiedLength: 1
        }],
        quitEarly: false
      };
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, void 0));
      let eventArgs = void 0;
      disposables2.add(diffViewModel.onDidChangeItems((e) => eventArgs = e));
      await diffViewModel.computeDiff(token);
      assert.strictEqual(diffViewModel.items[0].type, "placeholder");
      assert.strictEqual(diffViewModel.items[1].type, "insert");
      assert.strictEqual(diffViewModel.items[2].type, "placeholder");
      diffViewModel.items[0].showHiddenCells();
      assert.strictEqual(diffViewModel.items[0].type, "unchanged");
      assert.strictEqual(diffViewModel.items[1].type, "unchanged");
      assert.strictEqual(diffViewModel.items[2].type, "unchanged");
      assert.strictEqual(diffViewModel.items[3].type, "unchanged");
      assert.strictEqual(diffViewModel.items[4].type, "insert");
      assert.strictEqual(diffViewModel.items[5].type, "placeholder");
      assert.deepStrictEqual(eventArgs, { start: 0, deleteCount: 1, elements: diffViewModel.items.slice(0, 4) });
      diffViewModel.items[5].showHiddenCells();
      assert.strictEqual(diffViewModel.items[0].type, "unchanged");
      assert.strictEqual(diffViewModel.items[1].type, "unchanged");
      assert.strictEqual(diffViewModel.items[2].type, "unchanged");
      assert.strictEqual(diffViewModel.items[3].type, "unchanged");
      assert.strictEqual(diffViewModel.items[4].type, "insert");
      assert.strictEqual(diffViewModel.items[5].type, "unchanged");
      assert.deepStrictEqual(eventArgs, { start: 5, deleteCount: 1, elements: diffViewModel.items.slice(5) });
      diffViewModel.items[0].hideUnchangedCells();
      assert.strictEqual(diffViewModel.items[0].type, "placeholder");
      assert.strictEqual(diffViewModel.items[1].type, "insert");
      assert.strictEqual(diffViewModel.items[2].type, "unchanged");
      assert.deepStrictEqual(eventArgs, { start: 0, deleteCount: 4, elements: diffViewModel.items.slice(0, 1) });
      await verifyChangeEventIsNotFired(diffViewModel);
    });
  });
  test("LCS", async () => {
    await withTestNotebookDiffModel([
      ["# Description", "markdown", CellKind.Markup, [], { metadata: {} }],
      ["x = 3", "javascript", CellKind.Code, [], { metadata: { collapsed: true }, executionOrder: 1 }],
      ["x", "javascript", CellKind.Code, [{ outputId: "someId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 1 }],
      ["x", "javascript", CellKind.Code, [], { metadata: { collapsed: false } }]
    ], [
      ["# Description", "markdown", CellKind.Markup, [], { metadata: {} }],
      ["x = 3", "javascript", CellKind.Code, [], { metadata: { collapsed: true }, executionOrder: 1 }],
      ["x", "javascript", CellKind.Code, [], { metadata: { collapsed: false } }],
      ["x", "javascript", CellKind.Code, [{ outputId: "someId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 1 }]
    ], async (model) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      const diffResult2 = diff.ComputeDiff(false);
      assert.deepStrictEqual(diffResult2.changes.map((change) => ({
        originalStart: change.originalStart,
        originalLength: change.originalLength,
        modifiedStart: change.modifiedStart,
        modifiedLength: change.modifiedLength
      })), [{
        originalStart: 2,
        originalLength: 0,
        modifiedStart: 2,
        modifiedLength: 1
      }, {
        originalStart: 3,
        originalLength: 1,
        modifiedStart: 4,
        modifiedLength: 0
      }]);
    });
  });
  test("LCS 2", async () => {
    await withTestNotebookDiffModel([
      ["# Description", "markdown", CellKind.Markup, [], { metadata: {} }],
      ["x = 3", "javascript", CellKind.Code, [], { metadata: { collapsed: true }, executionOrder: 1 }],
      ["x", "javascript", CellKind.Code, [{ outputId: "someId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 1 }],
      ["x", "javascript", CellKind.Code, [], { metadata: { collapsed: false } }],
      ["x = 5", "javascript", CellKind.Code, [], {}],
      ["x", "javascript", CellKind.Code, [], {}],
      ["x", "javascript", CellKind.Code, [{ outputId: "someId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([5])) }] }], {}]
    ], [
      ["# Description", "markdown", CellKind.Markup, [], { metadata: {} }],
      ["x = 3", "javascript", CellKind.Code, [], { metadata: { collapsed: true }, executionOrder: 1 }],
      ["x", "javascript", CellKind.Code, [], { metadata: { collapsed: false } }],
      ["x", "javascript", CellKind.Code, [{ outputId: "someId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 1 }],
      ["x = 5", "javascript", CellKind.Code, [], {}],
      ["x", "javascript", CellKind.Code, [{ outputId: "someId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([5])) }] }], {}],
      ["x", "javascript", CellKind.Code, [], {}]
    ], async (model) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      const diffResult2 = diff.ComputeDiff(false);
      prettyChanges(model.original.notebook, model.modified.notebook, diffResult2);
      assert.deepStrictEqual(diffResult2.changes.map((change) => ({
        originalStart: change.originalStart,
        originalLength: change.originalLength,
        modifiedStart: change.modifiedStart,
        modifiedLength: change.modifiedLength
      })), [{
        originalStart: 2,
        originalLength: 0,
        modifiedStart: 2,
        modifiedLength: 1
      }, {
        originalStart: 3,
        originalLength: 1,
        modifiedStart: 4,
        modifiedLength: 0
      }, {
        originalStart: 5,
        originalLength: 0,
        modifiedStart: 5,
        modifiedLength: 1
      }, {
        originalStart: 6,
        originalLength: 1,
        modifiedStart: 7,
        modifiedLength: 0
      }]);
    });
  });
  test("LCS 3", async () => {
    await withTestNotebookDiffModel([
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 2;", "javascript", CellKind.Code, [], {}],
      ["var c = 3;", "javascript", CellKind.Code, [], {}],
      ["var d = 4;", "javascript", CellKind.Code, [], {}],
      ["var e = 5;", "javascript", CellKind.Code, [], {}],
      ["var f = 6;", "javascript", CellKind.Code, [], {}],
      ["var g = 7;", "javascript", CellKind.Code, [], {}]
    ], [
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 2;", "javascript", CellKind.Code, [], {}],
      ["var c = 3;", "javascript", CellKind.Code, [], {}],
      ["var d = 4;", "javascript", CellKind.Code, [], {}],
      ["var h = 8;", "javascript", CellKind.Code, [], {}],
      ["var e = 5;", "javascript", CellKind.Code, [], {}],
      ["var f = 6;", "javascript", CellKind.Code, [], {}],
      ["var g = 7;", "javascript", CellKind.Code, [], {}]
    ], async (model) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      const diffResult2 = diff.ComputeDiff(false);
      prettyChanges(model.original.notebook, model.modified.notebook, diffResult2);
      assert.deepStrictEqual(diffResult2.changes.map((change) => ({
        originalStart: change.originalStart,
        originalLength: change.originalLength,
        modifiedStart: change.modifiedStart,
        modifiedLength: change.modifiedLength
      })), [{
        originalStart: 4,
        originalLength: 0,
        modifiedStart: 4,
        modifiedLength: 1
      }]);
    });
  });
  test("diff output", async () => {
    await withTestNotebookDiffModel([
      ["x", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
      ["y", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([4])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }]
    ], [
      ["x", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
      ["y", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([5])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }]
    ], async (model, disposables2, accessor) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      diffResult = diff.ComputeDiff(false);
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, void 0));
      await diffViewModel.computeDiff(token);
      assert.strictEqual(diffViewModel.items.length, 2);
      assert.strictEqual(diffViewModel.items[0].type, "placeholder");
      diffViewModel.items[0].showHiddenCells();
      assert.strictEqual(diffViewModel.items[0].checkIfOutputsModified(), false);
      assert.strictEqual(diffViewModel.items[1].type, "modified");
      await verifyChangeEventIsNotFired(diffViewModel);
    });
  });
  test("diff output fast check", async () => {
    await withTestNotebookDiffModel([
      ["x", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
      ["y", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([4])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }]
    ], [
      ["x", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([3])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }],
      ["y", "javascript", CellKind.Code, [{ outputId: "someOtherId", outputs: [{ mime: Mimes.text, data: VSBuffer.wrap(new Uint8Array([5])) }] }], { metadata: { collapsed: false }, executionOrder: 3 }]
    ], async (model, disposables2, accessor) => {
      const diff = new LcsDiff(new CellSequence(model.original.notebook), new CellSequence(model.modified.notebook));
      diffResult = diff.ComputeDiff(false);
      diffViewModel = disposables2.add(new NotebookDiffViewModel(model, notebookEditorWorkerService, configurationService, eventDispatcher, accessor.get(INotebookService), heightCalculator, void 0));
      await diffViewModel.computeDiff(token);
      assert.strictEqual(diffViewModel.items.length, 2);
      assert.strictEqual(diffViewModel.items[0].type, "placeholder");
      diffViewModel.items[0].showHiddenCells();
      assert.strictEqual(diffViewModel.items[0].original.textModel.equal(diffViewModel.items[0].modified.textModel), true);
      assert.strictEqual(diffViewModel.items[1].original.textModel.equal(diffViewModel.items[1].modified.textModel), false);
      await verifyChangeEventIsNotFired(diffViewModel);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFx0ZXN0XFxicm93c2VyXFxkaWZmXFxub3RlYm9va0RpZmYudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlmZlJlc3VsdCwgSVNlcXVlbmNlLCBMY3NEaWZmIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGlmZi9kaWZmLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBNaW1lcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21pbWUuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEaWZmRWxlbWVudFZpZXdNb2RlbEJhc2UsIFNpZGVCeVNpZGVEaWZmRWxlbWVudFZpZXdNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZGlmZi9kaWZmRWxlbWVudFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0RpZmZFZGl0b3JFdmVudERpc3BhdGNoZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2RpZmYvZXZlbnREaXNwYXRjaGVyLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0RpZmZWaWV3TW9kZWwsIElOb3RlYm9va0RpZmZWaWV3TW9kZWxVcGRhdGVFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZGlmZi9ub3RlYm9va0RpZmZFZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IE5vdGVib29rRGlmZlZpZXdNb2RlbCwgcHJldHR5Q2hhbmdlcyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZGlmZi9ub3RlYm9va0RpZmZWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbEtpbmQsIElOb3RlYm9va1RleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL25vdGVib29rV29ya2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyB3aXRoVGVzdE5vdGVib29rRGlmZk1vZGVsIH0gZnJvbSAnLi4vdGVzdE5vdGVib29rRWRpdG9yLmpzJztcbmltcG9ydCB7IElEaWZmRWRpdG9ySGVpZ2h0Q2FsY3VsYXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2RpZmYvZWRpdG9ySGVpZ2h0Q2FsY3VsYXRvci5qcyc7XG5cbmNsYXNzIENlbGxTZXF1ZW5jZSBpbXBsZW1lbnRzIElTZXF1ZW5jZSB7XG5cblx0Y29uc3RydWN0b3IocmVhZG9ubHkgdGV4dE1vZGVsOiBJTm90ZWJvb2tUZXh0TW9kZWwpIHtcblx0fVxuXG5cdGdldEVsZW1lbnRzKCk6IHN0cmluZ1tdIHwgbnVtYmVyW10gfCBJbnQzMkFycmF5IHtcblx0XHRjb25zdCBoYXNoVmFsdWUgPSBuZXcgSW50MzJBcnJheSh0aGlzLnRleHRNb2RlbC5jZWxscy5sZW5ndGgpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy50ZXh0TW9kZWwuY2VsbHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGhhc2hWYWx1ZVtpXSA9IHRoaXMudGV4dE1vZGVsLmNlbGxzW2ldLmdldEhhc2hWYWx1ZSgpO1xuXHRcdH1cblxuXHRcdHJldHVybiBoYXNoVmFsdWU7XG5cdH1cbn1cblxuc3VpdGUoJ05vdGVib29rRGlmZicsICgpID0+IHtcblx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGxldCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW47XG5cdGxldCBldmVudERpc3BhdGNoZXI6IE5vdGVib29rRGlmZkVkaXRvckV2ZW50RGlzcGF0Y2hlcjtcblx0bGV0IGRpZmZWaWV3TW9kZWw6IE5vdGVib29rRGlmZlZpZXdNb2RlbDtcblx0bGV0IGRpZmZSZXN1bHQ6IElEaWZmUmVzdWx0O1xuXHRsZXQgbm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlOiBJTm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlO1xuXHRsZXQgaGVpZ2h0Q2FsY3VsYXRvcjogSURpZmZFZGl0b3JIZWlnaHRDYWxjdWxhdG9yU2VydmljZTtcblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKTtcblxuXHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyBub3RlYm9vazogeyBkaWZmOiB7IGlnbm9yZU1ldGFkYXRhOiB0cnVlIH0gfSB9KTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGNhbmNlbGxhdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdFx0ZXZlbnREaXNwYXRjaGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBOb3RlYm9va0RpZmZFZGl0b3JFdmVudERpc3BhdGNoZXIoKSk7XG5cdFx0dG9rZW4gPSBjYW5jZWxsYXRpb24udG9rZW47XG5cdFx0bm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGNvbXB1dGVEaWZmKCkgeyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgY2VsbHNEaWZmOiBkaWZmUmVzdWx0LCBtZXRhZGF0YUNoYW5nZWQ6IGZhbHNlIH0pOyB9XG5cdFx0fTtcblx0XHRoZWlnaHRDYWxjdWxhdG9yID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRGlmZkVkaXRvckhlaWdodENhbGN1bGF0b3JTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGRpZmZBbmRDb21wdXRlSGVpZ2h0KCkgeyByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKDApOyB9XG5cdFx0XHRvdmVycmlkZSBjb21wdXRlSGVpZ2h0RnJvbUxpbmVzKF9saW5lQ291bnQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0XHRcdHJldHVybiAwO1xuXHRcdFx0fVxuXHRcdH07XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHZlcmlmeUNoYW5nZUV2ZW50SXNOb3RGaXJlZChkaWZmVmlld01vZGVsOiBJTm90ZWJvb2tEaWZmVmlld01vZGVsKSB7XG5cdFx0bGV0IGV2ZW50QXJnczogSU5vdGVib29rRGlmZlZpZXdNb2RlbFVwZGF0ZUV2ZW50IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChkaWZmVmlld01vZGVsLm9uRGlkQ2hhbmdlSXRlbXMoZSA9PiBldmVudEFyZ3MgPSBlKSk7XG5cdFx0YXdhaXQgZGlmZlZpZXdNb2RlbC5jb21wdXRlRGlmZih0b2tlbik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRBcmdzLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0dGVzdCgnZGlmZiBkaWZmZXJlbnQgc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2tEaWZmTW9kZWwoW1xuXHRcdFx0Wyd4JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbeyBvdXRwdXRJZDogJ3NvbWVPdGhlcklkJywgb3V0cHV0czogW3sgbWltZTogTWltZXMudGV4dCwgZGF0YTogVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShbM10pKSB9XSB9XSwgeyBtZXRhZGF0YTogeyBjb2xsYXBzZWQ6IGZhbHNlIH0sIGV4ZWN1dGlvbk9yZGVyOiAzIH1dLFxuXHRcdF0sIFtcblx0XHRcdFsneScsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW3sgb3V0cHV0SWQ6ICdzb21lT3RoZXJJZCcsIG91dHB1dHM6IFt7IG1pbWU6IE1pbWVzLnRleHQsIGRhdGE6IFZTQnVmZmVyLndyYXAobmV3IFVpbnQ4QXJyYXkoWzNdKSkgfV0gfV0sIHsgbWV0YWRhdGE6IHsgY29sbGFwc2VkOiBmYWxzZSB9LCBleGVjdXRpb25PcmRlcjogMyB9XSxcblx0XHRdLCBhc3luYyAobW9kZWwsIGRpc3Bvc2FibGVzLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgZGlmZiA9IG5ldyBMY3NEaWZmKG5ldyBDZWxsU2VxdWVuY2UobW9kZWwub3JpZ2luYWwubm90ZWJvb2spLCBuZXcgQ2VsbFNlcXVlbmNlKG1vZGVsLm1vZGlmaWVkLm5vdGVib29rKSk7XG5cdFx0XHRkaWZmUmVzdWx0ID0gZGlmZi5Db21wdXRlRGlmZihmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlJlc3VsdC5jaGFuZ2VzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRpZmZSZXN1bHQuY2hhbmdlcy5tYXAoY2hhbmdlID0+ICh7XG5cdFx0XHRcdG9yaWdpbmFsU3RhcnQ6IGNoYW5nZS5vcmlnaW5hbFN0YXJ0LFxuXHRcdFx0XHRvcmlnaW5hbExlbmd0aDogY2hhbmdlLm9yaWdpbmFsTGVuZ3RoLFxuXHRcdFx0XHRtb2RpZmllZFN0YXJ0OiBjaGFuZ2UubW9kaWZpZWRTdGFydCxcblx0XHRcdFx0bW9kaWZpZWRMZW5ndGg6IGNoYW5nZS5tb2RpZmllZExlbmd0aFxuXHRcdFx0fSkpLCBbe1xuXHRcdFx0XHRvcmlnaW5hbFN0YXJ0OiAwLFxuXHRcdFx0XHRvcmlnaW5hbExlbmd0aDogMSxcblx0XHRcdFx0bW9kaWZpZWRTdGFydDogMCxcblx0XHRcdFx0bW9kaWZpZWRMZW5ndGg6IDFcblx0XHRcdH1dKTtcblxuXHRcdFx0ZGlmZlZpZXdNb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTm90ZWJvb2tEaWZmVmlld01vZGVsKG1vZGVsLCBub3RlYm9va0VkaXRvcldvcmtlclNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBldmVudERpc3BhdGNoZXIsIGFjY2Vzc29yLmdldDxJTm90ZWJvb2tTZXJ2aWNlPihJTm90ZWJvb2tTZXJ2aWNlKSwgaGVpZ2h0Q2FsY3VsYXRvciwgdW5kZWZpbmVkKSk7XG5cdFx0XHRhd2FpdCBkaWZmVmlld01vZGVsLmNvbXB1dGVEaWZmKHRva2VuKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzBdLnR5cGUsICdtb2RpZmllZCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdObyBjaGFuZ2VzIHdoZW4gcmUtY29tcHV0aW5nIGRpZmYgd2l0aCB0aGUgc2FtZSBzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9va0RpZmZNb2RlbChbXG5cdFx0XHRbJ3gnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFt7IG91dHB1dElkOiAnc29tZU90aGVySWQnLCBvdXRwdXRzOiBbeyBtaW1lOiBNaW1lcy50ZXh0LCBkYXRhOiBWU0J1ZmZlci53cmFwKG5ldyBVaW50OEFycmF5KFszXSkpIH1dIH1dLCB7IG1ldGFkYXRhOiB7IGNvbGxhcHNlZDogZmFsc2UgfSwgZXhlY3V0aW9uT3JkZXI6IDMgfV0sXG5cdFx0XSwgW1xuXHRcdFx0Wyd5JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbeyBvdXRwdXRJZDogJ3NvbWVPdGhlcklkJywgb3V0cHV0czogW3sgbWltZTogTWltZXMudGV4dCwgZGF0YTogVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShbM10pKSB9XSB9XSwgeyBtZXRhZGF0YTogeyBjb2xsYXBzZWQ6IGZhbHNlIH0sIGV4ZWN1dGlvbk9yZGVyOiAzIH1dLFxuXHRcdF0sIGFzeW5jIChtb2RlbCwgZGlzcG9zYWJsZXMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjb25zdCBkaWZmID0gbmV3IExjc0RpZmYobmV3IENlbGxTZXF1ZW5jZShtb2RlbC5vcmlnaW5hbC5ub3RlYm9vayksIG5ldyBDZWxsU2VxdWVuY2UobW9kZWwubW9kaWZpZWQubm90ZWJvb2spKTtcblx0XHRcdGRpZmZSZXN1bHQgPSBkaWZmLkNvbXB1dGVEaWZmKGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmUmVzdWx0LmNoYW5nZXMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlmZlJlc3VsdC5jaGFuZ2VzLm1hcChjaGFuZ2UgPT4gKHtcblx0XHRcdFx0b3JpZ2luYWxTdGFydDogY2hhbmdlLm9yaWdpbmFsU3RhcnQsXG5cdFx0XHRcdG9yaWdpbmFsTGVuZ3RoOiBjaGFuZ2Uub3JpZ2luYWxMZW5ndGgsXG5cdFx0XHRcdG1vZGlmaWVkU3RhcnQ6IGNoYW5nZS5tb2RpZmllZFN0YXJ0LFxuXHRcdFx0XHRtb2RpZmllZExlbmd0aDogY2hhbmdlLm1vZGlmaWVkTGVuZ3RoXG5cdFx0XHR9KSksIFt7XG5cdFx0XHRcdG9yaWdpbmFsU3RhcnQ6IDAsXG5cdFx0XHRcdG9yaWdpbmFsTGVuZ3RoOiAxLFxuXHRcdFx0XHRtb2RpZmllZFN0YXJ0OiAwLFxuXHRcdFx0XHRtb2RpZmllZExlbmd0aDogMVxuXHRcdFx0fV0pO1xuXG5cdFx0XHRkaWZmVmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBOb3RlYm9va0RpZmZWaWV3TW9kZWwobW9kZWwsIG5vdGVib29rRWRpdG9yV29ya2VyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGV2ZW50RGlzcGF0Y2hlciwgYWNjZXNzb3IuZ2V0PElOb3RlYm9va1NlcnZpY2U+KElOb3RlYm9va1NlcnZpY2UpLCBoZWlnaHRDYWxjdWxhdG9yLCB1bmRlZmluZWQpKTtcblx0XHRcdGF3YWl0IGRpZmZWaWV3TW9kZWwuY29tcHV0ZURpZmYodG9rZW4pO1xuXG5cdFx0XHRhd2FpdCB2ZXJpZnlDaGFuZ2VFdmVudElzTm90RmlyZWQoZGlmZlZpZXdNb2RlbCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RpZmYgZGlmZmVyZW50IG91dHB1dCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rRGlmZk1vZGVsKFtcblx0XHRcdFsneCcsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW3sgb3V0cHV0SWQ6ICdzb21lSWQnLCBvdXRwdXRzOiBbeyBtaW1lOiBNaW1lcy50ZXh0LCBkYXRhOiBWU0J1ZmZlci53cmFwKG5ldyBVaW50OEFycmF5KFs1XSkpIH1dIH1dLCB7IG1ldGFkYXRhOiB7IGNvbGxhcHNlZDogZmFsc2UgfSwgZXhlY3V0aW9uT3JkZXI6IDUgfV0sXG5cdFx0XHRbJycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdF0sIFtcblx0XHRcdFsneCcsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW3sgb3V0cHV0SWQ6ICdzb21lT3RoZXJJZCcsIG91dHB1dHM6IFt7IG1pbWU6IE1pbWVzLnRleHQsIGRhdGE6IFZTQnVmZmVyLndyYXAobmV3IFVpbnQ4QXJyYXkoWzNdKSkgfV0gfV0sIHsgbWV0YWRhdGE6IHsgY29sbGFwc2VkOiBmYWxzZSB9LCBleGVjdXRpb25PcmRlcjogMyB9XSxcblx0XHRcdFsnJywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XSwgYXN5bmMgKG1vZGVsLCBkaXNwb3NhYmxlcywgYWNjZXNzb3IpID0+IHtcblx0XHRcdGNvbnN0IGRpZmYgPSBuZXcgTGNzRGlmZihuZXcgQ2VsbFNlcXVlbmNlKG1vZGVsLm9yaWdpbmFsLm5vdGVib29rKSwgbmV3IENlbGxTZXF1ZW5jZShtb2RlbC5tb2RpZmllZC5ub3RlYm9vaykpO1xuXHRcdFx0ZGlmZlJlc3VsdCA9IGRpZmYuQ29tcHV0ZURpZmYoZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZSZXN1bHQuY2hhbmdlcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaWZmUmVzdWx0LmNoYW5nZXMubWFwKGNoYW5nZSA9PiAoe1xuXHRcdFx0XHRvcmlnaW5hbFN0YXJ0OiBjaGFuZ2Uub3JpZ2luYWxTdGFydCxcblx0XHRcdFx0b3JpZ2luYWxMZW5ndGg6IGNoYW5nZS5vcmlnaW5hbExlbmd0aCxcblx0XHRcdFx0bW9kaWZpZWRTdGFydDogY2hhbmdlLm1vZGlmaWVkU3RhcnQsXG5cdFx0XHRcdG1vZGlmaWVkTGVuZ3RoOiBjaGFuZ2UubW9kaWZpZWRMZW5ndGhcblx0XHRcdH0pKSwgW3tcblx0XHRcdFx0b3JpZ2luYWxTdGFydDogMCxcblx0XHRcdFx0b3JpZ2luYWxMZW5ndGg6IDEsXG5cdFx0XHRcdG1vZGlmaWVkU3RhcnQ6IDAsXG5cdFx0XHRcdG1vZGlmaWVkTGVuZ3RoOiAxXG5cdFx0XHR9XSk7XG5cblx0XHRcdGRpZmZWaWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE5vdGVib29rRGlmZlZpZXdNb2RlbChtb2RlbCwgbm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgZXZlbnREaXNwYXRjaGVyLCBhY2Nlc3Nvci5nZXQ8SU5vdGVib29rU2VydmljZT4oSU5vdGVib29rU2VydmljZSksIGhlaWdodENhbGN1bGF0b3IsIHVuZGVmaW5lZCkpO1xuXHRcdFx0bGV0IGV2ZW50QXJnczogSU5vdGVib29rRGlmZlZpZXdNb2RlbFVwZGF0ZUV2ZW50IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGRpZmZWaWV3TW9kZWwub25EaWRDaGFuZ2VJdGVtcyhlID0+IGV2ZW50QXJncyA9IGUpKTtcblx0XHRcdGF3YWl0IGRpZmZWaWV3TW9kZWwuY29tcHV0ZURpZmYodG9rZW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtcy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMF0udHlwZSwgJ21vZGlmaWVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1sxXS50eXBlLCAncGxhY2Vob2xkZXInKTtcblxuXG5cdFx0XHRkaWZmVmlld01vZGVsLml0ZW1zWzFdLnNob3dIaWRkZW5DZWxscygpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtcy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMF0udHlwZSwgJ21vZGlmaWVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1sxXS50eXBlLCAndW5jaGFuZ2VkJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50QXJncywgeyBzdGFydDogMSwgZGVsZXRlQ291bnQ6IDEsIGVsZW1lbnRzOiBbZGlmZlZpZXdNb2RlbC5pdGVtc1sxXV0gfSk7XG5cblx0XHRcdChkaWZmVmlld01vZGVsLml0ZW1zWzFdIGFzIHVua25vd24gYXMgU2lkZUJ5U2lkZURpZmZFbGVtZW50Vmlld01vZGVsKS5oaWRlVW5jaGFuZ2VkQ2VsbHMoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzBdLnR5cGUsICdtb2RpZmllZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChkaWZmVmlld01vZGVsLml0ZW1zWzFdIGFzIElEaWZmRWxlbWVudFZpZXdNb2RlbEJhc2UpLnR5cGUsICdwbGFjZWhvbGRlcicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudEFyZ3MsIHsgc3RhcnQ6IDEsIGRlbGV0ZUNvdW50OiAxLCBlbGVtZW50czogW2RpZmZWaWV3TW9kZWwuaXRlbXNbMV1dIH0pO1xuXG5cdFx0XHRhd2FpdCB2ZXJpZnlDaGFuZ2VFdmVudElzTm90RmlyZWQoZGlmZlZpZXdNb2RlbCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RpZmYgdGVzdCBzbWFsbCBzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9va0RpZmZNb2RlbChbXG5cdFx0XHRbJzEyMzQ1Njc4OScsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdF0sIFtcblx0XHRcdFsnOTg3NjU0MzIxJywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdF0sIGFzeW5jIChtb2RlbCwgZGlzcG9zYWJsZXMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjb25zdCBkaWZmID0gbmV3IExjc0RpZmYobmV3IENlbGxTZXF1ZW5jZShtb2RlbC5vcmlnaW5hbC5ub3RlYm9vayksIG5ldyBDZWxsU2VxdWVuY2UobW9kZWwubW9kaWZpZWQubm90ZWJvb2spKTtcblx0XHRcdGRpZmZSZXN1bHQgPSBkaWZmLkNvbXB1dGVEaWZmKGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmUmVzdWx0LmNoYW5nZXMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlmZlJlc3VsdC5jaGFuZ2VzLm1hcChjaGFuZ2UgPT4gKHtcblx0XHRcdFx0b3JpZ2luYWxTdGFydDogY2hhbmdlLm9yaWdpbmFsU3RhcnQsXG5cdFx0XHRcdG9yaWdpbmFsTGVuZ3RoOiBjaGFuZ2Uub3JpZ2luYWxMZW5ndGgsXG5cdFx0XHRcdG1vZGlmaWVkU3RhcnQ6IGNoYW5nZS5tb2RpZmllZFN0YXJ0LFxuXHRcdFx0XHRtb2RpZmllZExlbmd0aDogY2hhbmdlLm1vZGlmaWVkTGVuZ3RoXG5cdFx0XHR9KSksIFt7XG5cdFx0XHRcdG9yaWdpbmFsU3RhcnQ6IDAsXG5cdFx0XHRcdG9yaWdpbmFsTGVuZ3RoOiAxLFxuXHRcdFx0XHRtb2RpZmllZFN0YXJ0OiAwLFxuXHRcdFx0XHRtb2RpZmllZExlbmd0aDogMVxuXHRcdFx0fV0pO1xuXG5cdFx0XHRkaWZmVmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBOb3RlYm9va0RpZmZWaWV3TW9kZWwobW9kZWwsIG5vdGVib29rRWRpdG9yV29ya2VyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGV2ZW50RGlzcGF0Y2hlciwgYWNjZXNzb3IuZ2V0PElOb3RlYm9va1NlcnZpY2U+KElOb3RlYm9va1NlcnZpY2UpLCBoZWlnaHRDYWxjdWxhdG9yLCB1bmRlZmluZWQpKTtcblx0XHRcdGF3YWl0IGRpZmZWaWV3TW9kZWwuY29tcHV0ZURpZmYodG9rZW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMF0udHlwZSwgJ21vZGlmaWVkJyk7XG5cblx0XHRcdGF3YWl0IHZlcmlmeUNoYW5nZUV2ZW50SXNOb3RGaXJlZChkaWZmVmlld01vZGVsKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlmZiB0ZXN0IGRhdGEgc2luZ2xlIGNlbGwnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9va0RpZmZNb2RlbChbXG5cdFx0XHRbW1xuXHRcdFx0XHQnIyBUaGlzIHZlcnNpb24gaGFzIGEgYnVnXFxuJyxcblx0XHRcdFx0J2RlZiBtdWx0KGEsIGIpOlxcbicsXG5cdFx0XHRcdCcgICAgcmV0dXJuIGEgLyBiJ1xuXHRcdFx0XS5qb2luKCcnKSwgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XSwgW1xuXHRcdFx0W1tcblx0XHRcdFx0J2RlZiBtdWx0KGEsIGIpOlxcbicsXG5cdFx0XHRcdCcgICAgXFwnVGhpcyB2ZXJzaW9uIGlzIGRlYnVnZ2VkLlxcJ1xcbicsXG5cdFx0XHRcdCcgICAgcmV0dXJuIGEgKiBiJ1xuXHRcdFx0XS5qb2luKCcnKSwgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdF0sIGFzeW5jIChtb2RlbCwgZGlzcG9zYWJsZXMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjb25zdCBkaWZmID0gbmV3IExjc0RpZmYobmV3IENlbGxTZXF1ZW5jZShtb2RlbC5vcmlnaW5hbC5ub3RlYm9vayksIG5ldyBDZWxsU2VxdWVuY2UobW9kZWwubW9kaWZpZWQubm90ZWJvb2spKTtcblx0XHRcdGRpZmZSZXN1bHQgPSBkaWZmLkNvbXB1dGVEaWZmKGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmUmVzdWx0LmNoYW5nZXMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlmZlJlc3VsdC5jaGFuZ2VzLm1hcChjaGFuZ2UgPT4gKHtcblx0XHRcdFx0b3JpZ2luYWxTdGFydDogY2hhbmdlLm9yaWdpbmFsU3RhcnQsXG5cdFx0XHRcdG9yaWdpbmFsTGVuZ3RoOiBjaGFuZ2Uub3JpZ2luYWxMZW5ndGgsXG5cdFx0XHRcdG1vZGlmaWVkU3RhcnQ6IGNoYW5nZS5tb2RpZmllZFN0YXJ0LFxuXHRcdFx0XHRtb2RpZmllZExlbmd0aDogY2hhbmdlLm1vZGlmaWVkTGVuZ3RoXG5cdFx0XHR9KSksIFt7XG5cdFx0XHRcdG9yaWdpbmFsU3RhcnQ6IDAsXG5cdFx0XHRcdG9yaWdpbmFsTGVuZ3RoOiAxLFxuXHRcdFx0XHRtb2RpZmllZFN0YXJ0OiAwLFxuXHRcdFx0XHRtb2RpZmllZExlbmd0aDogMVxuXHRcdFx0fV0pO1xuXG5cdFx0XHRkaWZmVmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBOb3RlYm9va0RpZmZWaWV3TW9kZWwobW9kZWwsIG5vdGVib29rRWRpdG9yV29ya2VyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGV2ZW50RGlzcGF0Y2hlciwgYWNjZXNzb3IuZ2V0PElOb3RlYm9va1NlcnZpY2U+KElOb3RlYm9va1NlcnZpY2UpLCBoZWlnaHRDYWxjdWxhdG9yLCB1bmRlZmluZWQpKTtcblx0XHRcdGF3YWl0IGRpZmZWaWV3TW9kZWwuY29tcHV0ZURpZmYodG9rZW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMF0udHlwZSwgJ21vZGlmaWVkJyk7XG5cblx0XHRcdGF3YWl0IHZlcmlmeUNoYW5nZUV2ZW50SXNOb3RGaXJlZChkaWZmVmlld01vZGVsKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlmZiBmb28vZm9lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2tEaWZmTW9kZWwoW1xuXHRcdFx0W1snZGVmIGZvZSh4LCB5KTpcXG4nLCAnICAgIHJldHVybiB4ICsgeVxcbicsICdmb2UoMywgMiknXS5qb2luKCcnKSwgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbeyBvdXRwdXRJZDogJ3NvbWVJZCcsIG91dHB1dHM6IFt7IG1pbWU6IE1pbWVzLnRleHQsIGRhdGE6IFZTQnVmZmVyLndyYXAobmV3IFVpbnQ4QXJyYXkoWzZdKSkgfV0gfV0sIHsgbWV0YWRhdGE6IHsgY29sbGFwc2VkOiBmYWxzZSB9LCBleGVjdXRpb25PcmRlcjogNSB9XSxcblx0XHRcdFtbJ2RlZiBmb28oeCwgeSk6XFxuJywgJyAgICByZXR1cm4geCAqIHlcXG4nLCAnZm9vKDEsIDIpJ10uam9pbignJyksICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW3sgb3V0cHV0SWQ6ICdzb21lSWQnLCBvdXRwdXRzOiBbeyBtaW1lOiBNaW1lcy50ZXh0LCBkYXRhOiBWU0J1ZmZlci53cmFwKG5ldyBVaW50OEFycmF5KFsyXSkpIH1dIH1dLCB7IG1ldGFkYXRhOiB7IGNvbGxhcHNlZDogZmFsc2UgfSwgZXhlY3V0aW9uT3JkZXI6IDYgfV0sXG5cdFx0XHRbJycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdF0sIFtcblx0XHRcdFtbJ2RlZiBmb28oeCwgeSk6XFxuJywgJyAgICByZXR1cm4geCAqIHlcXG4nLCAnZm9vKDEsIDIpJ10uam9pbignJyksICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW3sgb3V0cHV0SWQ6ICdzb21lSWQnLCBvdXRwdXRzOiBbeyBtaW1lOiBNaW1lcy50ZXh0LCBkYXRhOiBWU0J1ZmZlci53cmFwKG5ldyBVaW50OEFycmF5KFs2XSkpIH1dIH1dLCB7IG1ldGFkYXRhOiB7IGNvbGxhcHNlZDogZmFsc2UgfSwgZXhlY3V0aW9uT3JkZXI6IDUgfV0sXG5cdFx0XHRbWydkZWYgZm9lKHgsIHkpOlxcbicsICcgICAgcmV0dXJuIHggKyB5XFxuJywgJ2ZvZSgzLCAyKSddLmpvaW4oJycpLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFt7IG91dHB1dElkOiAnc29tZUlkJywgb3V0cHV0czogW3sgbWltZTogTWltZXMudGV4dCwgZGF0YTogVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShbMl0pKSB9XSB9XSwgeyBtZXRhZGF0YTogeyBjb2xsYXBzZWQ6IGZhbHNlIH0sIGV4ZWN1dGlvbk9yZGVyOiA2IH1dLFxuXHRcdFx0WycnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRdLCBhc3luYyAobW9kZWwsIGRpc3Bvc2FibGVzLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgZGlmZiA9IG5ldyBMY3NEaWZmKG5ldyBDZWxsU2VxdWVuY2UobW9kZWwub3JpZ2luYWwubm90ZWJvb2spLCBuZXcgQ2VsbFNlcXVlbmNlKG1vZGVsLm1vZGlmaWVkLm5vdGVib29rKSk7XG5cdFx0XHRkaWZmUmVzdWx0ID0gZGlmZi5Db21wdXRlRGlmZihmYWxzZSk7XG5cblx0XHRcdGRpZmZWaWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE5vdGVib29rRGlmZlZpZXdNb2RlbChtb2RlbCwgbm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgZXZlbnREaXNwYXRjaGVyLCBhY2Nlc3Nvci5nZXQ8SU5vdGVib29rU2VydmljZT4oSU5vdGVib29rU2VydmljZSksIGhlaWdodENhbGN1bGF0b3IsIHVuZGVmaW5lZCkpO1xuXHRcdFx0bGV0IGV2ZW50QXJnczogSU5vdGVib29rRGlmZlZpZXdNb2RlbFVwZGF0ZUV2ZW50IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGRpZmZWaWV3TW9kZWwub25EaWRDaGFuZ2VJdGVtcyhlID0+IGV2ZW50QXJncyA9IGUpKTtcblx0XHRcdGF3YWl0IGRpZmZWaWV3TW9kZWwuY29tcHV0ZURpZmYodG9rZW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtcy5sZW5ndGgsIDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMF0udHlwZSwgJ21vZGlmaWVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1sxXS50eXBlLCAnbW9kaWZpZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzJdLnR5cGUsICdwbGFjZWhvbGRlcicpO1xuXHRcdFx0ZGlmZlZpZXdNb2RlbC5pdGVtc1syXS5zaG93SGlkZGVuQ2VsbHMoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzJdLnR5cGUsICd1bmNoYW5nZWQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRBcmdzLCB7IHN0YXJ0OiAyLCBkZWxldGVDb3VudDogMSwgZWxlbWVudHM6IFtkaWZmVmlld01vZGVsLml0ZW1zWzJdXSB9KTtcblxuXHRcdFx0YXdhaXQgdmVyaWZ5Q2hhbmdlRXZlbnRJc05vdEZpcmVkKGRpZmZWaWV3TW9kZWwpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaWZmIG1hcmtkb3duJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2tEaWZmTW9kZWwoW1xuXHRcdFx0WydUaGlzIGlzIGEgdGVzdCBub3RlYm9vayB3aXRoIG9ubHkgbWFya2Rvd24gY2VsbHMnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRbJ0xvcmVtIGlwc3VtIGRvbG9yIHNpdCBhbWV0JywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0WydJbiBvdGhlciBuZXdzJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdF0sIFtcblx0XHRcdFsnVGhpcyBpcyBhIHRlc3Qgbm90ZWJvb2sgd2l0aCBtYXJrZG93biBjZWxscyBvbmx5JywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0WydMb3JlbSBpcHN1bSBkb2xvciBzaXQgYW1ldCcsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFsnSW4gdGhlIG5ld3MnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XSwgYXN5bmMgKG1vZGVsLCBkaXNwb3NhYmxlcywgYWNjZXNzb3IpID0+IHtcblx0XHRcdGNvbnN0IGRpZmYgPSBuZXcgTGNzRGlmZihuZXcgQ2VsbFNlcXVlbmNlKG1vZGVsLm9yaWdpbmFsLm5vdGVib29rKSwgbmV3IENlbGxTZXF1ZW5jZShtb2RlbC5tb2RpZmllZC5ub3RlYm9vaykpO1xuXHRcdFx0ZGlmZlJlc3VsdCA9IGRpZmYuQ29tcHV0ZURpZmYoZmFsc2UpO1xuXG5cdFx0XHRkaWZmVmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBOb3RlYm9va0RpZmZWaWV3TW9kZWwobW9kZWwsIG5vdGVib29rRWRpdG9yV29ya2VyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGV2ZW50RGlzcGF0Y2hlciwgYWNjZXNzb3IuZ2V0PElOb3RlYm9va1NlcnZpY2U+KElOb3RlYm9va1NlcnZpY2UpLCBoZWlnaHRDYWxjdWxhdG9yLCB1bmRlZmluZWQpKTtcblx0XHRcdGxldCBldmVudEFyZ3M6IElOb3RlYm9va0RpZmZWaWV3TW9kZWxVcGRhdGVFdmVudCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChkaWZmVmlld01vZGVsLm9uRGlkQ2hhbmdlSXRlbXMoZSA9PiBldmVudEFyZ3MgPSBlKSk7XG5cdFx0XHRhd2FpdCBkaWZmVmlld01vZGVsLmNvbXB1dGVEaWZmKHRva2VuKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXMubGVuZ3RoLCAzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzBdLnR5cGUsICdtb2RpZmllZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMV0udHlwZSwgJ3BsYWNlaG9sZGVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1syXS50eXBlLCAnbW9kaWZpZWQnKTtcblxuXHRcdFx0ZGlmZlZpZXdNb2RlbC5pdGVtc1sxXS5zaG93SGlkZGVuQ2VsbHMoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzFdLnR5cGUsICd1bmNoYW5nZWQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRBcmdzLCB7IHN0YXJ0OiAxLCBkZWxldGVDb3VudDogMSwgZWxlbWVudHM6IFtkaWZmVmlld01vZGVsLml0ZW1zWzFdXSB9KTtcblxuXHRcdFx0YXdhaXQgdmVyaWZ5Q2hhbmdlRXZlbnRJc05vdEZpcmVkKGRpZmZWaWV3TW9kZWwpO1xuXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RpZmYgaW5zZXJ0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2tEaWZmTW9kZWwoW1xuXHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XSwgW1xuXHRcdFx0Wyd2YXIgaCA9IDg7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XSwgYXN5bmMgKG1vZGVsLCBkaXNwb3NhYmxlcywgYWNjZXNzb3IpID0+IHtcblx0XHRcdGRpZmZSZXN1bHQgPSB7XG5cdFx0XHRcdGNoYW5nZXM6IFt7XG5cdFx0XHRcdFx0b3JpZ2luYWxTdGFydDogMCxcblx0XHRcdFx0XHRvcmlnaW5hbExlbmd0aDogMCxcblx0XHRcdFx0XHRtb2RpZmllZFN0YXJ0OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkTGVuZ3RoOiAxXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRxdWl0RWFybHk6IGZhbHNlXG5cdFx0XHR9O1xuXG5cdFx0XHRkaWZmVmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBOb3RlYm9va0RpZmZWaWV3TW9kZWwobW9kZWwsIG5vdGVib29rRWRpdG9yV29ya2VyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGV2ZW50RGlzcGF0Y2hlciwgYWNjZXNzb3IuZ2V0PElOb3RlYm9va1NlcnZpY2U+KElOb3RlYm9va1NlcnZpY2UpLCBoZWlnaHRDYWxjdWxhdG9yLCB1bmRlZmluZWQpKTtcblx0XHRcdGxldCBldmVudEFyZ3M6IElOb3RlYm9va0RpZmZWaWV3TW9kZWxVcGRhdGVFdmVudCB8IHVuZGVmaW5lZDtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChkaWZmVmlld01vZGVsLm9uRGlkQ2hhbmdlSXRlbXMoZSA9PiBldmVudEFyZ3MgPSBlKSk7XG5cdFx0XHRhd2FpdCBkaWZmVmlld01vZGVsLmNvbXB1dGVEaWZmKHRva2VuKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50QXJncz8uZmlyc3RDaGFuZ2VJbmRleCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1swXS50eXBlLCAnaW5zZXJ0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1sxXS50eXBlLCAncGxhY2Vob2xkZXInKTtcblxuXHRcdFx0ZGlmZlZpZXdNb2RlbC5pdGVtc1sxXS5zaG93SGlkZGVuQ2VsbHMoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzFdLnR5cGUsICd1bmNoYW5nZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzJdLnR5cGUsICd1bmNoYW5nZWQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRBcmdzLCB7IHN0YXJ0OiAxLCBkZWxldGVDb3VudDogMSwgZWxlbWVudHM6IFtkaWZmVmlld01vZGVsLml0ZW1zWzFdLCBkaWZmVmlld01vZGVsLml0ZW1zWzJdXSB9KTtcblxuXHRcdFx0YXdhaXQgdmVyaWZ5Q2hhbmdlRXZlbnRJc05vdEZpcmVkKGRpZmZWaWV3TW9kZWwpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaWZmIGluc2VydCAyJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9va0RpZmZNb2RlbChbXG5cdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBiID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBjID0gMzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBkID0gNDsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBlID0gNTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBmID0gNjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBnID0gNzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XSwgW1xuXHRcdFx0Wyd2YXIgaCA9IDg7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgYyA9IDM7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgZCA9IDQ7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgZSA9IDU7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgZiA9IDY7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgZyA9IDc7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdF0sIGFzeW5jIChtb2RlbCwgZGlzcG9zYWJsZXMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRjb25zdCBldmVudERpc3BhdGNoZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE5vdGVib29rRGlmZkVkaXRvckV2ZW50RGlzcGF0Y2hlcigpKTtcblx0XHRcdGRpZmZSZXN1bHQgPSB7XG5cdFx0XHRcdGNoYW5nZXM6IFt7XG5cdFx0XHRcdFx0b3JpZ2luYWxTdGFydDogMCxcblx0XHRcdFx0XHRvcmlnaW5hbExlbmd0aDogMCxcblx0XHRcdFx0XHRtb2RpZmllZFN0YXJ0OiAwLFxuXHRcdFx0XHRcdG1vZGlmaWVkTGVuZ3RoOiAxXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRvcmlnaW5hbFN0YXJ0OiAwLFxuXHRcdFx0XHRcdG9yaWdpbmFsTGVuZ3RoOiA2LFxuXHRcdFx0XHRcdG1vZGlmaWVkU3RhcnQ6IDEsXG5cdFx0XHRcdFx0bW9kaWZpZWRMZW5ndGg6IDZcblx0XHRcdFx0fV0sXG5cdFx0XHRcdHF1aXRFYXJseTogZmFsc2Vcblx0XHRcdH07XG5cblx0XHRcdGRpZmZWaWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE5vdGVib29rRGlmZlZpZXdNb2RlbChtb2RlbCwgbm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgZXZlbnREaXNwYXRjaGVyLCBhY2Nlc3Nvci5nZXQ8SU5vdGVib29rU2VydmljZT4oSU5vdGVib29rU2VydmljZSksIGhlaWdodENhbGN1bGF0b3IsIHVuZGVmaW5lZCkpO1xuXHRcdFx0bGV0IGV2ZW50QXJnczogSU5vdGVib29rRGlmZlZpZXdNb2RlbFVwZGF0ZUV2ZW50IHwgdW5kZWZpbmVkO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGRpZmZWaWV3TW9kZWwub25EaWRDaGFuZ2VJdGVtcyhlID0+IGV2ZW50QXJncyA9IGUpKTtcblx0XHRcdGF3YWl0IGRpZmZWaWV3TW9kZWwuY29tcHV0ZURpZmYodG9rZW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRBcmdzPy5maXJzdENoYW5nZUluZGV4LCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1swXS50eXBlLCAnaW5zZXJ0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1sxXS50eXBlLCAncGxhY2Vob2xkZXInKTtcblxuXHRcdFx0ZGlmZlZpZXdNb2RlbC5pdGVtc1sxXS5zaG93SGlkZGVuQ2VsbHMoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzFdLnR5cGUsICd1bmNoYW5nZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzJdLnR5cGUsICd1bmNoYW5nZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzNdLnR5cGUsICd1bmNoYW5nZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzRdLnR5cGUsICd1bmNoYW5nZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzVdLnR5cGUsICd1bmNoYW5nZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzZdLnR5cGUsICd1bmNoYW5nZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzddLnR5cGUsICd1bmNoYW5nZWQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRBcmdzLCB7IHN0YXJ0OiAxLCBkZWxldGVDb3VudDogMSwgZWxlbWVudHM6IGRpZmZWaWV3TW9kZWwuaXRlbXMuc2xpY2UoMSkgfSk7XG5cblxuXHRcdFx0KGRpZmZWaWV3TW9kZWwuaXRlbXNbMV0gYXMgdW5rbm93biBhcyBTaWRlQnlTaWRlRGlmZkVsZW1lbnRWaWV3TW9kZWwpLmhpZGVVbmNoYW5nZWRDZWxscygpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtcy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMF0udHlwZSwgJ2luc2VydCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChkaWZmVmlld01vZGVsLml0ZW1zWzFdIGFzIElEaWZmRWxlbWVudFZpZXdNb2RlbEJhc2UpLnR5cGUsICdwbGFjZWhvbGRlcicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudEFyZ3MsIHsgc3RhcnQ6IDEsIGRlbGV0ZUNvdW50OiA3LCBlbGVtZW50czogW2RpZmZWaWV3TW9kZWwuaXRlbXNbMV1dIH0pO1xuXG5cdFx0XHRhd2FpdCB2ZXJpZnlDaGFuZ2VFdmVudElzTm90RmlyZWQoZGlmZlZpZXdNb2RlbCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RpZmYgaW5zZXJ0IDMnLCBhc3luYyAoKSA9PiB7XG5cblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rRGlmZk1vZGVsKFtcblx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGMgPSAzOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGQgPSA0OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGUgPSA1OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGYgPSA2OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGcgPSA3OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRdLCBbXG5cdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBiID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBjID0gMzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBkID0gNDsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBoID0gODsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBlID0gNTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBmID0gNjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBnID0gNzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XSwgYXN5bmMgKG1vZGVsLCBkaXNwb3NhYmxlcywgYWNjZXNzb3IpID0+IHtcblx0XHRcdGRpZmZSZXN1bHQgPSB7XG5cdFx0XHRcdGNoYW5nZXM6IFt7XG5cdFx0XHRcdFx0b3JpZ2luYWxTdGFydDogNCxcblx0XHRcdFx0XHRvcmlnaW5hbExlbmd0aDogMCxcblx0XHRcdFx0XHRtb2RpZmllZFN0YXJ0OiA0LFxuXHRcdFx0XHRcdG1vZGlmaWVkTGVuZ3RoOiAxXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRxdWl0RWFybHk6IGZhbHNlXG5cdFx0XHR9O1xuXG5cdFx0XHRkaWZmVmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBOb3RlYm9va0RpZmZWaWV3TW9kZWwobW9kZWwsIG5vdGVib29rRWRpdG9yV29ya2VyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGV2ZW50RGlzcGF0Y2hlciwgYWNjZXNzb3IuZ2V0PElOb3RlYm9va1NlcnZpY2U+KElOb3RlYm9va1NlcnZpY2UpLCBoZWlnaHRDYWxjdWxhdG9yLCB1bmRlZmluZWQpKTtcblx0XHRcdGxldCBldmVudEFyZ3M6IElOb3RlYm9va0RpZmZWaWV3TW9kZWxVcGRhdGVFdmVudCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChkaWZmVmlld01vZGVsLm9uRGlkQ2hhbmdlSXRlbXMoZSA9PiBldmVudEFyZ3MgPSBlKSk7XG5cdFx0XHRhd2FpdCBkaWZmVmlld01vZGVsLmNvbXB1dGVEaWZmKHRva2VuKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMF0udHlwZSwgJ3BsYWNlaG9sZGVyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1sxXS50eXBlLCAnaW5zZXJ0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1syXS50eXBlLCAncGxhY2Vob2xkZXInKTtcblxuXHRcdFx0ZGlmZlZpZXdNb2RlbC5pdGVtc1swXS5zaG93SGlkZGVuQ2VsbHMoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzBdLnR5cGUsICd1bmNoYW5nZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzFdLnR5cGUsICd1bmNoYW5nZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzJdLnR5cGUsICd1bmNoYW5nZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzNdLnR5cGUsICd1bmNoYW5nZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzRdLnR5cGUsICdpbnNlcnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzVdLnR5cGUsICdwbGFjZWhvbGRlcicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudEFyZ3MsIHsgc3RhcnQ6IDAsIGRlbGV0ZUNvdW50OiAxLCBlbGVtZW50czogZGlmZlZpZXdNb2RlbC5pdGVtcy5zbGljZSgwLCA0KSB9KTtcblxuXHRcdFx0ZGlmZlZpZXdNb2RlbC5pdGVtc1s1XS5zaG93SGlkZGVuQ2VsbHMoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZGlmZlZpZXdNb2RlbC5pdGVtc1swXSBhcyBJRGlmZkVsZW1lbnRWaWV3TW9kZWxCYXNlKS50eXBlLCAndW5jaGFuZ2VkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1sxXS50eXBlLCAndW5jaGFuZ2VkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGRpZmZWaWV3TW9kZWwuaXRlbXNbMl0gYXMgSURpZmZFbGVtZW50Vmlld01vZGVsQmFzZSkudHlwZSwgJ3VuY2hhbmdlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbM10udHlwZSwgJ3VuY2hhbmdlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbNF0udHlwZSwgJ2luc2VydCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbNV0udHlwZSwgJ3VuY2hhbmdlZCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudEFyZ3MsIHsgc3RhcnQ6IDUsIGRlbGV0ZUNvdW50OiAxLCBlbGVtZW50czogZGlmZlZpZXdNb2RlbC5pdGVtcy5zbGljZSg1KSB9KTtcblxuXHRcdFx0KGRpZmZWaWV3TW9kZWwuaXRlbXNbMF0gYXMgU2lkZUJ5U2lkZURpZmZFbGVtZW50Vmlld01vZGVsKS5oaWRlVW5jaGFuZ2VkQ2VsbHMoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZGlmZlZpZXdNb2RlbC5pdGVtc1swXSBhcyBJRGlmZkVsZW1lbnRWaWV3TW9kZWxCYXNlKS50eXBlLCAncGxhY2Vob2xkZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zWzFdLnR5cGUsICdpbnNlcnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoZGlmZlZpZXdNb2RlbC5pdGVtc1syXSBhcyBJRGlmZkVsZW1lbnRWaWV3TW9kZWxCYXNlKS50eXBlLCAndW5jaGFuZ2VkJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50QXJncywgeyBzdGFydDogMCwgZGVsZXRlQ291bnQ6IDQsIGVsZW1lbnRzOiBkaWZmVmlld01vZGVsLml0ZW1zLnNsaWNlKDAsIDEpIH0pO1xuXG5cdFx0XHRhd2FpdCB2ZXJpZnlDaGFuZ2VFdmVudElzTm90RmlyZWQoZGlmZlZpZXdNb2RlbCk7XG5cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnTENTJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2tEaWZmTW9kZWwoW1xuXHRcdFx0WycjIERlc2NyaXB0aW9uJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwgeyBtZXRhZGF0YToge30gfV0sXG5cdFx0XHRbJ3ggPSAzJywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwgeyBtZXRhZGF0YTogeyBjb2xsYXBzZWQ6IHRydWUgfSwgZXhlY3V0aW9uT3JkZXI6IDEgfV0sXG5cdFx0XHRbJ3gnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFt7IG91dHB1dElkOiAnc29tZUlkJywgb3V0cHV0czogW3sgbWltZTogTWltZXMudGV4dCwgZGF0YTogVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShbM10pKSB9XSB9XSwgeyBtZXRhZGF0YTogeyBjb2xsYXBzZWQ6IGZhbHNlIH0sIGV4ZWN1dGlvbk9yZGVyOiAxIH1dLFxuXHRcdFx0Wyd4JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwgeyBtZXRhZGF0YTogeyBjb2xsYXBzZWQ6IGZhbHNlIH0gfV1cblx0XHRdLCBbXG5cdFx0XHRbJyMgRGVzY3JpcHRpb24nLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7IG1ldGFkYXRhOiB7fSB9XSxcblx0XHRcdFsneCA9IDMnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7IG1ldGFkYXRhOiB7IGNvbGxhcHNlZDogdHJ1ZSB9LCBleGVjdXRpb25PcmRlcjogMSB9XSxcblx0XHRcdFsneCcsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHsgbWV0YWRhdGE6IHsgY29sbGFwc2VkOiBmYWxzZSB9IH1dLFxuXHRcdFx0Wyd4JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbeyBvdXRwdXRJZDogJ3NvbWVJZCcsIG91dHB1dHM6IFt7IG1pbWU6IE1pbWVzLnRleHQsIGRhdGE6IFZTQnVmZmVyLndyYXAobmV3IFVpbnQ4QXJyYXkoWzNdKSkgfV0gfV0sIHsgbWV0YWRhdGE6IHsgY29sbGFwc2VkOiBmYWxzZSB9LCBleGVjdXRpb25PcmRlcjogMSB9XVxuXHRcdF0sIGFzeW5jIChtb2RlbCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlmZiA9IG5ldyBMY3NEaWZmKG5ldyBDZWxsU2VxdWVuY2UobW9kZWwub3JpZ2luYWwubm90ZWJvb2spLCBuZXcgQ2VsbFNlcXVlbmNlKG1vZGVsLm1vZGlmaWVkLm5vdGVib29rKSk7XG5cdFx0XHRjb25zdCBkaWZmUmVzdWx0ID0gZGlmZi5Db21wdXRlRGlmZihmYWxzZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRpZmZSZXN1bHQuY2hhbmdlcy5tYXAoY2hhbmdlID0+ICh7XG5cdFx0XHRcdG9yaWdpbmFsU3RhcnQ6IGNoYW5nZS5vcmlnaW5hbFN0YXJ0LFxuXHRcdFx0XHRvcmlnaW5hbExlbmd0aDogY2hhbmdlLm9yaWdpbmFsTGVuZ3RoLFxuXHRcdFx0XHRtb2RpZmllZFN0YXJ0OiBjaGFuZ2UubW9kaWZpZWRTdGFydCxcblx0XHRcdFx0bW9kaWZpZWRMZW5ndGg6IGNoYW5nZS5tb2RpZmllZExlbmd0aFxuXHRcdFx0fSkpLCBbe1xuXHRcdFx0XHRvcmlnaW5hbFN0YXJ0OiAyLFxuXHRcdFx0XHRvcmlnaW5hbExlbmd0aDogMCxcblx0XHRcdFx0bW9kaWZpZWRTdGFydDogMixcblx0XHRcdFx0bW9kaWZpZWRMZW5ndGg6IDFcblx0XHRcdH0sIHtcblx0XHRcdFx0b3JpZ2luYWxTdGFydDogMyxcblx0XHRcdFx0b3JpZ2luYWxMZW5ndGg6IDEsXG5cdFx0XHRcdG1vZGlmaWVkU3RhcnQ6IDQsXG5cdFx0XHRcdG1vZGlmaWVkTGVuZ3RoOiAwXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0xDUyAyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2tEaWZmTW9kZWwoW1xuXHRcdFx0WycjIERlc2NyaXB0aW9uJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwgeyBtZXRhZGF0YToge30gfV0sXG5cdFx0XHRbJ3ggPSAzJywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwgeyBtZXRhZGF0YTogeyBjb2xsYXBzZWQ6IHRydWUgfSwgZXhlY3V0aW9uT3JkZXI6IDEgfV0sXG5cdFx0XHRbJ3gnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFt7IG91dHB1dElkOiAnc29tZUlkJywgb3V0cHV0czogW3sgbWltZTogTWltZXMudGV4dCwgZGF0YTogVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShbM10pKSB9XSB9XSwgeyBtZXRhZGF0YTogeyBjb2xsYXBzZWQ6IGZhbHNlIH0sIGV4ZWN1dGlvbk9yZGVyOiAxIH1dLFxuXHRcdFx0Wyd4JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwgeyBtZXRhZGF0YTogeyBjb2xsYXBzZWQ6IGZhbHNlIH0gfV0sXG5cdFx0XHRbJ3ggPSA1JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd4JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd4JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbeyBvdXRwdXRJZDogJ3NvbWVJZCcsIG91dHB1dHM6IFt7IG1pbWU6IE1pbWVzLnRleHQsIGRhdGE6IFZTQnVmZmVyLndyYXAobmV3IFVpbnQ4QXJyYXkoWzVdKSkgfV0gfV0sIHt9XSxcblx0XHRdLCBbXG5cdFx0XHRbJyMgRGVzY3JpcHRpb24nLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7IG1ldGFkYXRhOiB7fSB9XSxcblx0XHRcdFsneCA9IDMnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7IG1ldGFkYXRhOiB7IGNvbGxhcHNlZDogdHJ1ZSB9LCBleGVjdXRpb25PcmRlcjogMSB9XSxcblx0XHRcdFsneCcsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHsgbWV0YWRhdGE6IHsgY29sbGFwc2VkOiBmYWxzZSB9IH1dLFxuXHRcdFx0Wyd4JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbeyBvdXRwdXRJZDogJ3NvbWVJZCcsIG91dHB1dHM6IFt7IG1pbWU6IE1pbWVzLnRleHQsIGRhdGE6IFZTQnVmZmVyLndyYXAobmV3IFVpbnQ4QXJyYXkoWzNdKSkgfV0gfV0sIHsgbWV0YWRhdGE6IHsgY29sbGFwc2VkOiBmYWxzZSB9LCBleGVjdXRpb25PcmRlcjogMSB9XSxcblx0XHRcdFsneCA9IDUnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3gnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFt7IG91dHB1dElkOiAnc29tZUlkJywgb3V0cHV0czogW3sgbWltZTogTWltZXMudGV4dCwgZGF0YTogVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShbNV0pKSB9XSB9XSwge31dLFxuXHRcdFx0Wyd4JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdF0sIGFzeW5jIChtb2RlbCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlmZiA9IG5ldyBMY3NEaWZmKG5ldyBDZWxsU2VxdWVuY2UobW9kZWwub3JpZ2luYWwubm90ZWJvb2spLCBuZXcgQ2VsbFNlcXVlbmNlKG1vZGVsLm1vZGlmaWVkLm5vdGVib29rKSk7XG5cdFx0XHRjb25zdCBkaWZmUmVzdWx0ID0gZGlmZi5Db21wdXRlRGlmZihmYWxzZSk7XG5cdFx0XHRwcmV0dHlDaGFuZ2VzKG1vZGVsLm9yaWdpbmFsLm5vdGVib29rLCBtb2RlbC5tb2RpZmllZC5ub3RlYm9vaywgZGlmZlJlc3VsdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlmZlJlc3VsdC5jaGFuZ2VzLm1hcChjaGFuZ2UgPT4gKHtcblx0XHRcdFx0b3JpZ2luYWxTdGFydDogY2hhbmdlLm9yaWdpbmFsU3RhcnQsXG5cdFx0XHRcdG9yaWdpbmFsTGVuZ3RoOiBjaGFuZ2Uub3JpZ2luYWxMZW5ndGgsXG5cdFx0XHRcdG1vZGlmaWVkU3RhcnQ6IGNoYW5nZS5tb2RpZmllZFN0YXJ0LFxuXHRcdFx0XHRtb2RpZmllZExlbmd0aDogY2hhbmdlLm1vZGlmaWVkTGVuZ3RoXG5cdFx0XHR9KSksIFt7XG5cdFx0XHRcdG9yaWdpbmFsU3RhcnQ6IDIsXG5cdFx0XHRcdG9yaWdpbmFsTGVuZ3RoOiAwLFxuXHRcdFx0XHRtb2RpZmllZFN0YXJ0OiAyLFxuXHRcdFx0XHRtb2RpZmllZExlbmd0aDogMVxuXHRcdFx0fSwge1xuXHRcdFx0XHRvcmlnaW5hbFN0YXJ0OiAzLFxuXHRcdFx0XHRvcmlnaW5hbExlbmd0aDogMSxcblx0XHRcdFx0bW9kaWZpZWRTdGFydDogNCxcblx0XHRcdFx0bW9kaWZpZWRMZW5ndGg6IDBcblx0XHRcdH0sIHtcblx0XHRcdFx0b3JpZ2luYWxTdGFydDogNSxcblx0XHRcdFx0b3JpZ2luYWxMZW5ndGg6IDAsXG5cdFx0XHRcdG1vZGlmaWVkU3RhcnQ6IDUsXG5cdFx0XHRcdG1vZGlmaWVkTGVuZ3RoOiAxXG5cdFx0XHR9LCB7XG5cdFx0XHRcdG9yaWdpbmFsU3RhcnQ6IDYsXG5cdFx0XHRcdG9yaWdpbmFsTGVuZ3RoOiAxLFxuXHRcdFx0XHRtb2RpZmllZFN0YXJ0OiA3LFxuXHRcdFx0XHRtb2RpZmllZExlbmd0aDogMFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdMQ1MgMycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rRGlmZk1vZGVsKFtcblx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGMgPSAzOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGQgPSA0OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGUgPSA1OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGYgPSA2OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGcgPSA3OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRdLCBbXG5cdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBiID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBjID0gMzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBkID0gNDsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBoID0gODsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBlID0gNTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBmID0gNjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBnID0gNzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XSwgYXN5bmMgKG1vZGVsKSA9PiB7XG5cdFx0XHRjb25zdCBkaWZmID0gbmV3IExjc0RpZmYobmV3IENlbGxTZXF1ZW5jZShtb2RlbC5vcmlnaW5hbC5ub3RlYm9vayksIG5ldyBDZWxsU2VxdWVuY2UobW9kZWwubW9kaWZpZWQubm90ZWJvb2spKTtcblx0XHRcdGNvbnN0IGRpZmZSZXN1bHQgPSBkaWZmLkNvbXB1dGVEaWZmKGZhbHNlKTtcblx0XHRcdHByZXR0eUNoYW5nZXMobW9kZWwub3JpZ2luYWwubm90ZWJvb2ssIG1vZGVsLm1vZGlmaWVkLm5vdGVib29rLCBkaWZmUmVzdWx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaWZmUmVzdWx0LmNoYW5nZXMubWFwKGNoYW5nZSA9PiAoe1xuXHRcdFx0XHRvcmlnaW5hbFN0YXJ0OiBjaGFuZ2Uub3JpZ2luYWxTdGFydCxcblx0XHRcdFx0b3JpZ2luYWxMZW5ndGg6IGNoYW5nZS5vcmlnaW5hbExlbmd0aCxcblx0XHRcdFx0bW9kaWZpZWRTdGFydDogY2hhbmdlLm1vZGlmaWVkU3RhcnQsXG5cdFx0XHRcdG1vZGlmaWVkTGVuZ3RoOiBjaGFuZ2UubW9kaWZpZWRMZW5ndGhcblx0XHRcdH0pKSwgW3tcblx0XHRcdFx0b3JpZ2luYWxTdGFydDogNCxcblx0XHRcdFx0b3JpZ2luYWxMZW5ndGg6IDAsXG5cdFx0XHRcdG1vZGlmaWVkU3RhcnQ6IDQsXG5cdFx0XHRcdG1vZGlmaWVkTGVuZ3RoOiAxXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RpZmYgb3V0cHV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2tEaWZmTW9kZWwoW1xuXHRcdFx0Wyd4JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbeyBvdXRwdXRJZDogJ3NvbWVPdGhlcklkJywgb3V0cHV0czogW3sgbWltZTogTWltZXMudGV4dCwgZGF0YTogVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShbM10pKSB9XSB9XSwgeyBtZXRhZGF0YTogeyBjb2xsYXBzZWQ6IGZhbHNlIH0sIGV4ZWN1dGlvbk9yZGVyOiAzIH1dLFxuXHRcdFx0Wyd5JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbeyBvdXRwdXRJZDogJ3NvbWVPdGhlcklkJywgb3V0cHV0czogW3sgbWltZTogTWltZXMudGV4dCwgZGF0YTogVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShbNF0pKSB9XSB9XSwgeyBtZXRhZGF0YTogeyBjb2xsYXBzZWQ6IGZhbHNlIH0sIGV4ZWN1dGlvbk9yZGVyOiAzIH1dLFxuXHRcdF0sIFtcblx0XHRcdFsneCcsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW3sgb3V0cHV0SWQ6ICdzb21lT3RoZXJJZCcsIG91dHB1dHM6IFt7IG1pbWU6IE1pbWVzLnRleHQsIGRhdGE6IFZTQnVmZmVyLndyYXAobmV3IFVpbnQ4QXJyYXkoWzNdKSkgfV0gfV0sIHsgbWV0YWRhdGE6IHsgY29sbGFwc2VkOiBmYWxzZSB9LCBleGVjdXRpb25PcmRlcjogMyB9XSxcblx0XHRcdFsneScsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW3sgb3V0cHV0SWQ6ICdzb21lT3RoZXJJZCcsIG91dHB1dHM6IFt7IG1pbWU6IE1pbWVzLnRleHQsIGRhdGE6IFZTQnVmZmVyLndyYXAobmV3IFVpbnQ4QXJyYXkoWzVdKSkgfV0gfV0sIHsgbWV0YWRhdGE6IHsgY29sbGFwc2VkOiBmYWxzZSB9LCBleGVjdXRpb25PcmRlcjogMyB9XSxcblx0XHRdLCBhc3luYyAobW9kZWwsIGRpc3Bvc2FibGVzLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgZGlmZiA9IG5ldyBMY3NEaWZmKG5ldyBDZWxsU2VxdWVuY2UobW9kZWwub3JpZ2luYWwubm90ZWJvb2spLCBuZXcgQ2VsbFNlcXVlbmNlKG1vZGVsLm1vZGlmaWVkLm5vdGVib29rKSk7XG5cdFx0XHRkaWZmUmVzdWx0ID0gZGlmZi5Db21wdXRlRGlmZihmYWxzZSk7XG5cblx0XHRcdGRpZmZWaWV3TW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE5vdGVib29rRGlmZlZpZXdNb2RlbChtb2RlbCwgbm90ZWJvb2tFZGl0b3JXb3JrZXJTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgZXZlbnREaXNwYXRjaGVyLCBhY2Nlc3Nvci5nZXQ8SU5vdGVib29rU2VydmljZT4oSU5vdGVib29rU2VydmljZSksIGhlaWdodENhbGN1bGF0b3IsIHVuZGVmaW5lZCkpO1xuXHRcdFx0YXdhaXQgZGlmZlZpZXdNb2RlbC5jb21wdXRlRGlmZih0b2tlbik7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmVmlld01vZGVsLml0ZW1zLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtc1swXS50eXBlLCAncGxhY2Vob2xkZXInKTtcblx0XHRcdGRpZmZWaWV3TW9kZWwuaXRlbXNbMF0uc2hvd0hpZGRlbkNlbGxzKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGRpZmZWaWV3TW9kZWwuaXRlbXNbMF0gYXMgdW5rbm93biBhcyBTaWRlQnlTaWRlRGlmZkVsZW1lbnRWaWV3TW9kZWwpLmNoZWNrSWZPdXRwdXRzTW9kaWZpZWQoKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMV0udHlwZSwgJ21vZGlmaWVkJyk7XG5cblx0XHRcdGF3YWl0IHZlcmlmeUNoYW5nZUV2ZW50SXNOb3RGaXJlZChkaWZmVmlld01vZGVsKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlmZiBvdXRwdXQgZmFzdCBjaGVjaycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rRGlmZk1vZGVsKFtcblx0XHRcdFsneCcsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW3sgb3V0cHV0SWQ6ICdzb21lT3RoZXJJZCcsIG91dHB1dHM6IFt7IG1pbWU6IE1pbWVzLnRleHQsIGRhdGE6IFZTQnVmZmVyLndyYXAobmV3IFVpbnQ4QXJyYXkoWzNdKSkgfV0gfV0sIHsgbWV0YWRhdGE6IHsgY29sbGFwc2VkOiBmYWxzZSB9LCBleGVjdXRpb25PcmRlcjogMyB9XSxcblx0XHRcdFsneScsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW3sgb3V0cHV0SWQ6ICdzb21lT3RoZXJJZCcsIG91dHB1dHM6IFt7IG1pbWU6IE1pbWVzLnRleHQsIGRhdGE6IFZTQnVmZmVyLndyYXAobmV3IFVpbnQ4QXJyYXkoWzRdKSkgfV0gfV0sIHsgbWV0YWRhdGE6IHsgY29sbGFwc2VkOiBmYWxzZSB9LCBleGVjdXRpb25PcmRlcjogMyB9XSxcblx0XHRdLCBbXG5cdFx0XHRbJ3gnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFt7IG91dHB1dElkOiAnc29tZU90aGVySWQnLCBvdXRwdXRzOiBbeyBtaW1lOiBNaW1lcy50ZXh0LCBkYXRhOiBWU0J1ZmZlci53cmFwKG5ldyBVaW50OEFycmF5KFszXSkpIH1dIH1dLCB7IG1ldGFkYXRhOiB7IGNvbGxhcHNlZDogZmFsc2UgfSwgZXhlY3V0aW9uT3JkZXI6IDMgfV0sXG5cdFx0XHRbJ3knLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFt7IG91dHB1dElkOiAnc29tZU90aGVySWQnLCBvdXRwdXRzOiBbeyBtaW1lOiBNaW1lcy50ZXh0LCBkYXRhOiBWU0J1ZmZlci53cmFwKG5ldyBVaW50OEFycmF5KFs1XSkpIH1dIH1dLCB7IG1ldGFkYXRhOiB7IGNvbGxhcHNlZDogZmFsc2UgfSwgZXhlY3V0aW9uT3JkZXI6IDMgfV0sXG5cdFx0XSwgYXN5bmMgKG1vZGVsLCBkaXNwb3NhYmxlcywgYWNjZXNzb3IpID0+IHtcblx0XHRcdGNvbnN0IGRpZmYgPSBuZXcgTGNzRGlmZihuZXcgQ2VsbFNlcXVlbmNlKG1vZGVsLm9yaWdpbmFsLm5vdGVib29rKSwgbmV3IENlbGxTZXF1ZW5jZShtb2RlbC5tb2RpZmllZC5ub3RlYm9vaykpO1xuXHRcdFx0ZGlmZlJlc3VsdCA9IGRpZmYuQ29tcHV0ZURpZmYoZmFsc2UpO1xuXG5cdFx0XHRkaWZmVmlld01vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBOb3RlYm9va0RpZmZWaWV3TW9kZWwobW9kZWwsIG5vdGVib29rRWRpdG9yV29ya2VyU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGV2ZW50RGlzcGF0Y2hlciwgYWNjZXNzb3IuZ2V0PElOb3RlYm9va1NlcnZpY2U+KElOb3RlYm9va1NlcnZpY2UpLCBoZWlnaHRDYWxjdWxhdG9yLCB1bmRlZmluZWQpKTtcblx0XHRcdGF3YWl0IGRpZmZWaWV3TW9kZWwuY29tcHV0ZURpZmYodG9rZW4pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlZpZXdNb2RlbC5pdGVtcy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZWaWV3TW9kZWwuaXRlbXNbMF0udHlwZSwgJ3BsYWNlaG9sZGVyJyk7XG5cdFx0XHRkaWZmVmlld01vZGVsLml0ZW1zWzBdLnNob3dIaWRkZW5DZWxscygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChkaWZmVmlld01vZGVsLml0ZW1zWzBdIGFzIHVua25vd24gYXMgU2lkZUJ5U2lkZURpZmZFbGVtZW50Vmlld01vZGVsKS5vcmlnaW5hbCEudGV4dE1vZGVsLmVxdWFsKChkaWZmVmlld01vZGVsLml0ZW1zWzBdIGFzIHVua25vd24gYXMgU2lkZUJ5U2lkZURpZmZFbGVtZW50Vmlld01vZGVsKS5tb2RpZmllZCEudGV4dE1vZGVsKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGRpZmZWaWV3TW9kZWwuaXRlbXNbMV0gYXMgdW5rbm93biBhcyBTaWRlQnlTaWRlRGlmZkVsZW1lbnRWaWV3TW9kZWwpLm9yaWdpbmFsIS50ZXh0TW9kZWwuZXF1YWwoKGRpZmZWaWV3TW9kZWwuaXRlbXNbMV0gYXMgdW5rbm93biBhcyBTaWRlQnlTaWRlRGlmZkVsZW1lbnRWaWV3TW9kZWwpLm1vZGlmaWVkIS50ZXh0TW9kZWwpLCBmYWxzZSk7XG5cblx0XHRcdGF3YWl0IHZlcmlmeUNoYW5nZUV2ZW50SXNOb3RGaXJlZChkaWZmVmlld01vZGVsKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUN6QixTQUE0QiwrQkFBK0I7QUFDM0QsU0FBaUMsZUFBZTtBQUNoRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMseUNBQXlDO0FBRWxELFNBQVMsdUJBQXVCLHFCQUFxQjtBQUNyRCxTQUFTLGdCQUFvQztBQUM3QyxTQUFTLHdCQUF3QjtBQUVqQyxTQUFT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c0JBQXNCLGlCQUFpQixTQUFTLElBQXNCLGdCQUFnQixHQUFHLGtCQUFrQixNQUFTLENBQUM7QUFDbk4sWUFBTSxjQUFjLFlBQVksS0FBSztBQUVyQyxhQUFPLFlBQVksY0FBYyxNQUFNLFFBQVEsQ0FBQztBQUNoRCxhQUFPLFlBQVksY0FBYyxNQUFNLENBQUMsRUFBRSxNQUFNLGFBQWE7QUFDN0Qsb0JBQWMsTUFBTSxDQUFDLEVBQUUsZ0JBQWdCO0FBQ3ZDLGFBQU8sWUFBYSxjQUFjLE1BQU0sQ0FBQyxFQUFnRCxTQUFVLFVBQVUsTUFBTyxjQUFjLE1BQU0sQ0FBQyxFQUFnRCxTQUFVLFNBQVMsR0FBRyxJQUFJO0FBQ25OLGFBQU8sWUFBYSxjQUFjLE1BQU0sQ0FBQyxFQUFnRCxTQUFVLFVBQVUsTUFBTyxjQUFjLE1BQU0sQ0FBQyxFQUFnRCxTQUFVLFNBQVMsR0FBRyxLQUFLO0FBRXBOLFlBQU0sNEJBQTRCLGFBQWE7QUFBQSxJQUNoRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsiZGlmZlZpZXdNb2RlbCIsICJkaXNwb3NhYmxlcyIsICJldmVudERpc3BhdGNoZXIiLCAiZGlmZlJlc3VsdCJdCn0K
