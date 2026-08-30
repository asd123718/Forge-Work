import assert from "assert";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Mimes } from "../../../../../base/common/mime.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Position } from "../../../../../editor/common/core/position.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { IUndoRedoService } from "../../../../../platform/undoRedo/common/undoRedo.js";
import { NotebookTextModel } from "../../common/model/notebookTextModel.js";
import { CellEditType, CellKind, MOVE_CURSOR_1_LINE_COMMAND, SelectionStateType } from "../../common/notebookCommon.js";
import { setupInstantiationService, TestCell, valueBytesFromString, withTestNotebook } from "./testNotebookEditor.js";
suite("NotebookTextModel", () => {
  let disposables;
  let instantiationService;
  let languageService;
  ensureNoDisposablesAreLeakedInTestSuite();
  suiteSetup(() => {
    disposables = new DisposableStore();
    instantiationService = setupInstantiationService(disposables);
    languageService = instantiationService.get(ILanguageService);
    instantiationService.spy(IUndoRedoService, "pushElement");
  });
  suiteTeardown(() => disposables.dispose());
  test("insert", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}],
        ["var d = 4;", "javascript", CellKind.Code, [], {}]
      ],
      (editor, _viewModel, ds) => {
        const textModel = editor.textModel;
        textModel.applyEdits([
          { editType: CellEditType.Replace, index: 1, count: 0, cells: [ds.add(new TestCell(textModel.viewType, 5, "var e = 5;", "javascript", CellKind.Code, [], languageService))] },
          { editType: CellEditType.Replace, index: 3, count: 0, cells: [ds.add(new TestCell(textModel.viewType, 6, "var f = 6;", "javascript", CellKind.Code, [], languageService))] }
        ], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(textModel.cells.length, 6);
        assert.strictEqual(textModel.cells[1].getValue(), "var e = 5;");
        assert.strictEqual(textModel.cells[4].getValue(), "var f = 6;");
      }
    );
  });
  test("multiple inserts at same position", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}],
        ["var d = 4;", "javascript", CellKind.Code, [], {}]
      ],
      (editor, _viewModel, ds) => {
        const textModel = editor.textModel;
        textModel.applyEdits([
          { editType: CellEditType.Replace, index: 1, count: 0, cells: [ds.add(new TestCell(textModel.viewType, 5, "var e = 5;", "javascript", CellKind.Code, [], languageService))] },
          { editType: CellEditType.Replace, index: 1, count: 0, cells: [ds.add(new TestCell(textModel.viewType, 6, "var f = 6;", "javascript", CellKind.Code, [], languageService))] }
        ], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(textModel.cells.length, 6);
        assert.strictEqual(textModel.cells[1].getValue(), "var e = 5;");
        assert.strictEqual(textModel.cells[2].getValue(), "var f = 6;");
      }
    );
  });
  test("delete", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}],
        ["var d = 4;", "javascript", CellKind.Code, [], {}]
      ],
      (editor) => {
        const textModel = editor.textModel;
        textModel.applyEdits([
          { editType: CellEditType.Replace, index: 1, count: 1, cells: [] },
          { editType: CellEditType.Replace, index: 3, count: 1, cells: [] }
        ], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(textModel.cells[0].getValue(), "var a = 1;");
        assert.strictEqual(textModel.cells[1].getValue(), "var c = 3;");
      }
    );
  });
  test("delete + insert", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}],
        ["var d = 4;", "javascript", CellKind.Code, [], {}]
      ],
      (editor, _viewModel, ds) => {
        const textModel = editor.textModel;
        textModel.applyEdits([
          { editType: CellEditType.Replace, index: 1, count: 1, cells: [] },
          { editType: CellEditType.Replace, index: 3, count: 0, cells: [ds.add(new TestCell(textModel.viewType, 5, "var e = 5;", "javascript", CellKind.Code, [], languageService))] }
        ], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(textModel.cells.length, 4);
        assert.strictEqual(textModel.cells[0].getValue(), "var a = 1;");
        assert.strictEqual(textModel.cells[2].getValue(), "var e = 5;");
      }
    );
  });
  test("delete + insert at same position", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}],
        ["var d = 4;", "javascript", CellKind.Code, [], {}]
      ],
      (editor, _viewModel, ds) => {
        const textModel = editor.textModel;
        textModel.applyEdits([
          { editType: CellEditType.Replace, index: 1, count: 1, cells: [] },
          { editType: CellEditType.Replace, index: 1, count: 0, cells: [ds.add(new TestCell(textModel.viewType, 5, "var e = 5;", "javascript", CellKind.Code, [], languageService))] }
        ], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(textModel.cells.length, 4);
        assert.strictEqual(textModel.cells[0].getValue(), "var a = 1;");
        assert.strictEqual(textModel.cells[1].getValue(), "var e = 5;");
        assert.strictEqual(textModel.cells[2].getValue(), "var c = 3;");
      }
    );
  });
  test("(replace) delete + insert at same position", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}],
        ["var d = 4;", "javascript", CellKind.Code, [], {}]
      ],
      (editor, _viewModel, ds) => {
        const textModel = editor.textModel;
        textModel.applyEdits([
          { editType: CellEditType.Replace, index: 1, count: 1, cells: [ds.add(new TestCell(textModel.viewType, 5, "var e = 5;", "javascript", CellKind.Code, [], languageService))] }
        ], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(textModel.cells.length, 4);
        assert.strictEqual(textModel.cells[0].getValue(), "var a = 1;");
        assert.strictEqual(textModel.cells[1].getValue(), "var e = 5;");
        assert.strictEqual(textModel.cells[2].getValue(), "var c = 3;");
      }
    );
  });
  test("output", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}]
      ],
      (editor) => {
        const textModel = editor.textModel;
        assert.throws(() => {
          textModel.applyEdits([{
            index: Number.MAX_VALUE,
            editType: CellEditType.Output,
            outputs: []
          }], true, void 0, () => void 0, void 0, true);
        });
        assert.throws(() => {
          textModel.applyEdits([{
            index: -1,
            editType: CellEditType.Output,
            outputs: []
          }], true, void 0, () => void 0, void 0, true);
        });
        textModel.applyEdits([{
          index: 0,
          editType: CellEditType.Output,
          outputs: [{
            outputId: "someId",
            outputs: [{ mime: Mimes.markdown, data: valueBytesFromString("_Hello_") }]
          }]
        }], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(textModel.cells.length, 1);
        assert.strictEqual(textModel.cells[0].outputs.length, 1);
        textModel.applyEdits([{
          index: 0,
          editType: CellEditType.Output,
          append: true,
          outputs: [{
            outputId: "someId2",
            outputs: [{ mime: Mimes.markdown, data: valueBytesFromString("_Hello2_") }]
          }]
        }], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(textModel.cells.length, 1);
        assert.strictEqual(textModel.cells[0].outputs.length, 2);
        let [first, second] = textModel.cells[0].outputs;
        assert.strictEqual(first.outputId, "someId");
        assert.strictEqual(second.outputId, "someId2");
        textModel.applyEdits([{
          index: 0,
          editType: CellEditType.Output,
          outputs: [{
            outputId: "someId3",
            outputs: [{ mime: Mimes.text, data: valueBytesFromString("Last, replaced output") }]
          }]
        }], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(textModel.cells.length, 1);
        assert.strictEqual(textModel.cells[0].outputs.length, 1);
        [first] = textModel.cells[0].outputs;
        assert.strictEqual(first.outputId, "someId3");
      }
    );
  });
  test("multiple append output in one position", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}]
      ],
      (editor) => {
        const textModel = editor.textModel;
        textModel.applyEdits([
          {
            index: 0,
            editType: CellEditType.Output,
            append: true,
            outputs: [{
              outputId: "append1",
              outputs: [{ mime: Mimes.markdown, data: valueBytesFromString("append 1") }]
            }]
          },
          {
            index: 0,
            editType: CellEditType.Output,
            append: true,
            outputs: [{
              outputId: "append2",
              outputs: [{ mime: Mimes.markdown, data: valueBytesFromString("append 2") }]
            }]
          }
        ], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(textModel.cells.length, 1);
        assert.strictEqual(textModel.cells[0].outputs.length, 2);
        const [first, second] = textModel.cells[0].outputs;
        assert.strictEqual(first.outputId, "append1");
        assert.strictEqual(second.outputId, "append2");
      }
    );
  });
  test("append to output created in same batch", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}]
      ],
      (editor) => {
        const textModel = editor.textModel;
        textModel.applyEdits([
          {
            index: 0,
            editType: CellEditType.Output,
            append: true,
            outputs: [{
              outputId: "append1",
              outputs: [{ mime: Mimes.markdown, data: valueBytesFromString("append 1") }]
            }]
          },
          {
            editType: CellEditType.OutputItems,
            append: true,
            outputId: "append1",
            items: [{
              mime: Mimes.markdown,
              data: valueBytesFromString("append 2")
            }]
          }
        ], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(textModel.cells.length, 1);
        assert.strictEqual(textModel.cells[0].outputs.length, 1, "has 1 output");
        const [first] = textModel.cells[0].outputs;
        assert.strictEqual(first.outputId, "append1");
        assert.strictEqual(first.outputs.length, 2, "has 2 items");
      }
    );
  });
  const stdOutMime = "application/vnd.code.notebook.stdout";
  const stdErrMime = "application/vnd.code.notebook.stderr";
  test("appending streaming outputs", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}]
      ],
      (editor) => {
        const textModel = editor.textModel;
        textModel.applyEdits([
          {
            index: 0,
            editType: CellEditType.Output,
            append: true,
            outputs: [{
              outputId: "append1",
              outputs: [{ mime: stdOutMime, data: valueBytesFromString("append 1") }]
            }]
          }
        ], true, void 0, () => void 0, void 0, true);
        const [output] = textModel.cells[0].outputs;
        assert.strictEqual(output.versionId, 0, "initial output version should be 0");
        textModel.applyEdits([
          {
            editType: CellEditType.OutputItems,
            append: true,
            outputId: "append1",
            items: [
              { mime: stdOutMime, data: valueBytesFromString("append 2") },
              { mime: stdOutMime, data: valueBytesFromString("append 3") }
            ]
          }
        ], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(output.versionId, 1, "version should bump per append");
        textModel.applyEdits([
          {
            editType: CellEditType.OutputItems,
            append: true,
            outputId: "append1",
            items: [
              { mime: stdOutMime, data: valueBytesFromString("append 4") },
              { mime: stdOutMime, data: valueBytesFromString("append 5") }
            ]
          }
        ], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(output.versionId, 2, "version should bump per append");
        assert.strictEqual(textModel.cells.length, 1);
        assert.strictEqual(textModel.cells[0].outputs.length, 1, "has 1 output");
        assert.strictEqual(output.outputId, "append1");
        assert.strictEqual(output.outputs.length, 1, "outputs are compressed");
        assert.strictEqual(output.outputs[0].data.toString(), "append 1append 2append 3append 4append 5");
        assert.strictEqual(output.appendedSinceVersion(0, stdOutMime)?.toString(), "append 2append 3append 4append 5");
        assert.strictEqual(output.appendedSinceVersion(1, stdOutMime)?.toString(), "append 4append 5");
        assert.strictEqual(output.appendedSinceVersion(2, stdOutMime), void 0);
        assert.strictEqual(output.appendedSinceVersion(2, stdErrMime), void 0);
      }
    );
  });
  test("replacing streaming outputs", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}]
      ],
      (editor) => {
        const textModel = editor.textModel;
        textModel.applyEdits([
          {
            index: 0,
            editType: CellEditType.Output,
            append: true,
            outputs: [{
              outputId: "append1",
              outputs: [{ mime: stdOutMime, data: valueBytesFromString("append 1") }]
            }]
          }
        ], true, void 0, () => void 0, void 0, true);
        const [output] = textModel.cells[0].outputs;
        assert.strictEqual(output.versionId, 0, "initial output version should be 0");
        textModel.applyEdits([
          {
            editType: CellEditType.OutputItems,
            append: true,
            outputId: "append1",
            items: [{
              mime: stdOutMime,
              data: valueBytesFromString("append 2")
            }]
          }
        ], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(output.versionId, 1, "version should bump per append");
        textModel.applyEdits([
          {
            editType: CellEditType.OutputItems,
            append: false,
            outputId: "append1",
            items: [{
              mime: stdOutMime,
              data: valueBytesFromString("replace 3")
            }]
          }
        ], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(output.versionId, 2, "version should bump per replace");
        textModel.applyEdits([
          {
            editType: CellEditType.OutputItems,
            append: true,
            outputId: "append1",
            items: [{
              mime: stdOutMime,
              data: valueBytesFromString("append 4")
            }]
          }
        ], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(output.versionId, 3, "version should bump per append");
        assert.strictEqual(output.outputs[0].data.toString(), "replace 3append 4");
        assert.strictEqual(
          output.appendedSinceVersion(0, stdOutMime),
          void 0,
          "replacing output should clear out previous versioned output buffers"
        );
        assert.strictEqual(
          output.appendedSinceVersion(1, stdOutMime),
          void 0,
          "replacing output should clear out previous versioned output buffers"
        );
        assert.strictEqual(output.appendedSinceVersion(2, stdOutMime)?.toString(), "append 4");
      }
    );
  });
  test("appending streaming outputs with move cursor compression", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}]
      ],
      (editor) => {
        const textModel = editor.textModel;
        textModel.applyEdits([
          {
            index: 0,
            editType: CellEditType.Output,
            append: true,
            outputs: [{
              outputId: "append1",
              outputs: [
                { mime: stdOutMime, data: valueBytesFromString("append 1") },
                { mime: stdOutMime, data: valueBytesFromString("\nappend 1") }
              ]
            }]
          }
        ], true, void 0, () => void 0, void 0, true);
        const [output] = textModel.cells[0].outputs;
        assert.strictEqual(output.versionId, 0, "initial output version should be 0");
        textModel.applyEdits([
          {
            editType: CellEditType.OutputItems,
            append: true,
            outputId: "append1",
            items: [{
              mime: stdOutMime,
              data: valueBytesFromString(MOVE_CURSOR_1_LINE_COMMAND + "\nappend 2")
            }]
          }
        ], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(output.versionId, 1, "version should bump per append");
        assert.strictEqual(output.outputs[0].data.toString(), "append 1\nappend 2");
        assert.strictEqual(
          output.appendedSinceVersion(0, stdOutMime),
          void 0,
          "compressing outputs should clear out previous versioned output buffers"
        );
      }
    );
  });
  test("appending streaming outputs with carraige return compression", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}]
      ],
      (editor) => {
        const textModel = editor.textModel;
        textModel.applyEdits([
          {
            index: 0,
            editType: CellEditType.Output,
            append: true,
            outputs: [{
              outputId: "append1",
              outputs: [
                { mime: stdOutMime, data: valueBytesFromString("append 1") },
                { mime: stdOutMime, data: valueBytesFromString("\nappend 1") }
              ]
            }]
          }
        ], true, void 0, () => void 0, void 0, true);
        const [output] = textModel.cells[0].outputs;
        assert.strictEqual(output.versionId, 0, "initial output version should be 0");
        textModel.applyEdits([
          {
            editType: CellEditType.OutputItems,
            append: true,
            outputId: "append1",
            items: [{
              mime: stdOutMime,
              data: valueBytesFromString("\rappend 2")
            }]
          }
        ], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(output.versionId, 1, "version should bump per append");
        assert.strictEqual(output.outputs[0].data.toString(), "append 1\nappend 2");
        assert.strictEqual(
          output.appendedSinceVersion(0, stdOutMime),
          void 0,
          "compressing outputs should clear out previous versioned output buffers"
        );
      }
    );
  });
  test("appending multiple different mime streaming outputs", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}]
      ],
      (editor) => {
        const textModel = editor.textModel;
        textModel.applyEdits([
          {
            index: 0,
            editType: CellEditType.Output,
            append: true,
            outputs: [{
              outputId: "append1",
              outputs: [
                { mime: stdOutMime, data: valueBytesFromString("stdout 1") },
                { mime: stdErrMime, data: valueBytesFromString("stderr 1") }
              ]
            }]
          }
        ], true, void 0, () => void 0, void 0, true);
        const [output] = textModel.cells[0].outputs;
        assert.strictEqual(output.versionId, 0, "initial output version should be 0");
        textModel.applyEdits([
          {
            editType: CellEditType.OutputItems,
            append: true,
            outputId: "append1",
            items: [
              { mime: stdOutMime, data: valueBytesFromString("stdout 2") },
              { mime: stdErrMime, data: valueBytesFromString("stderr 2") }
            ]
          }
        ], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(output.versionId, 1, "version should bump per replace");
        assert.strictEqual(output.appendedSinceVersion(0, stdErrMime)?.toString(), "stderr 2");
        assert.strictEqual(output.appendedSinceVersion(0, stdOutMime)?.toString(), "stdout 2");
      }
    );
  });
  test("metadata", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}]
      ],
      (editor) => {
        const textModel = editor.textModel;
        assert.throws(() => {
          textModel.applyEdits([{
            index: Number.MAX_VALUE,
            editType: CellEditType.Metadata,
            metadata: {}
          }], true, void 0, () => void 0, void 0, true);
        });
        assert.throws(() => {
          textModel.applyEdits([{
            index: -1,
            editType: CellEditType.Metadata,
            metadata: {}
          }], true, void 0, () => void 0, void 0, true);
        });
        textModel.applyEdits([{
          index: 0,
          editType: CellEditType.Metadata,
          metadata: { customProperty: 15 }
        }], true, void 0, () => void 0, void 0, true);
        textModel.applyEdits([{
          index: 0,
          editType: CellEditType.Metadata,
          metadata: {}
        }], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(textModel.cells.length, 1);
        assert.strictEqual(textModel.cells[0].metadata.customProperty, void 0);
      }
    );
  });
  test("partial metadata", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}]
      ],
      (editor) => {
        const textModel = editor.textModel;
        textModel.applyEdits([{
          index: 0,
          editType: CellEditType.PartialMetadata,
          metadata: { customProperty: 15 }
        }], true, void 0, () => void 0, void 0, true);
        textModel.applyEdits([{
          index: 0,
          editType: CellEditType.PartialMetadata,
          metadata: {}
        }], true, void 0, () => void 0, void 0, true);
        assert.strictEqual(textModel.cells.length, 1);
        assert.strictEqual(textModel.cells[0].metadata.customProperty, 15);
      }
    );
  });
  test("multiple inserts in one edit", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}],
        ["var d = 4;", "javascript", CellKind.Code, [], {}]
      ],
      (editor, _viewModel, ds) => {
        const textModel = editor.textModel;
        let changeEvent = void 0;
        const eventListener = textModel.onDidChangeContent((e) => {
          changeEvent = e;
        });
        const willChangeEvents = [];
        const willChangeListener = textModel.onWillAddRemoveCells((e) => {
          willChangeEvents.push(e);
        });
        const version = textModel.versionId;
        textModel.applyEdits([
          { editType: CellEditType.Replace, index: 1, count: 1, cells: [] },
          { editType: CellEditType.Replace, index: 1, count: 0, cells: [ds.add(new TestCell(textModel.viewType, 5, "var e = 5;", "javascript", CellKind.Code, [], languageService))] }
        ], true, void 0, () => ({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 1 }] }), void 0, true);
        assert.strictEqual(textModel.cells.length, 4);
        assert.strictEqual(textModel.cells[0].getValue(), "var a = 1;");
        assert.strictEqual(textModel.cells[1].getValue(), "var e = 5;");
        assert.strictEqual(textModel.cells[2].getValue(), "var c = 3;");
        assert.notStrictEqual(changeEvent, void 0);
        assert.strictEqual(changeEvent.rawEvents.length, 2);
        assert.deepStrictEqual(changeEvent.endSelectionState?.selections, [{ start: 0, end: 1 }]);
        assert.strictEqual(willChangeEvents.length, 2);
        assert.strictEqual(textModel.versionId, version + 1);
        eventListener.dispose();
        willChangeListener.dispose();
      }
    );
  });
  test("insert and metadata change in one edit", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}],
        ["var d = 4;", "javascript", CellKind.Code, [], {}]
      ],
      (editor) => {
        const textModel = editor.textModel;
        let changeEvent = void 0;
        const eventListener = textModel.onDidChangeContent((e) => {
          changeEvent = e;
        });
        const willChangeEvents = [];
        const willChangeListener = textModel.onWillAddRemoveCells((e) => {
          willChangeEvents.push(e);
        });
        const version = textModel.versionId;
        textModel.applyEdits([
          { editType: CellEditType.Replace, index: 1, count: 1, cells: [] },
          {
            index: 0,
            editType: CellEditType.Metadata,
            metadata: {}
          }
        ], true, void 0, () => ({ kind: SelectionStateType.Index, focus: { start: 0, end: 1 }, selections: [{ start: 0, end: 1 }] }), void 0, true);
        assert.notStrictEqual(changeEvent, void 0);
        assert.strictEqual(changeEvent.rawEvents.length, 2);
        assert.deepStrictEqual(changeEvent.endSelectionState?.selections, [{ start: 0, end: 1 }]);
        assert.strictEqual(willChangeEvents.length, 1);
        assert.strictEqual(textModel.versionId, version + 1);
        eventListener.dispose();
        willChangeListener.dispose();
      }
    );
  });
  test("Updating appending/updating output in Notebooks does not work as expected #117273", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [], {}]
    ], (editor) => {
      const model = editor.textModel;
      assert.strictEqual(model.cells.length, 1);
      assert.strictEqual(model.cells[0].outputs.length, 0);
      const success1 = model.applyEdits(
        [{
          editType: CellEditType.Output,
          index: 0,
          outputs: [
            { outputId: "out1", outputs: [{ mime: "application/x.notebook.stream", data: VSBuffer.wrap(new Uint8Array([1])) }] }
          ],
          append: false
        }],
        true,
        void 0,
        () => void 0,
        void 0,
        false
      );
      assert.ok(success1);
      assert.strictEqual(model.cells[0].outputs.length, 1);
      const success2 = model.applyEdits(
        [{
          editType: CellEditType.Output,
          index: 0,
          outputs: [
            { outputId: "out2", outputs: [{ mime: "application/x.notebook.stream", data: VSBuffer.wrap(new Uint8Array([1])) }] }
          ],
          append: true
        }],
        true,
        void 0,
        () => void 0,
        void 0,
        false
      );
      assert.ok(success2);
      assert.strictEqual(model.cells[0].outputs.length, 2);
    });
  });
  test("Clearing output of an empty notebook makes it dirty #119608", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 2;", "javascript", CellKind.Code, [], {}]
    ], (editor, _, ds) => {
      const model = editor.textModel;
      let event;
      ds.add(model.onDidChangeContent((e) => {
        event = e;
      }));
      {
        const success = model.applyEdits(
          [{
            editType: CellEditType.Output,
            index: 0,
            outputs: [
              { outputId: "out1", outputs: [{ mime: "application/x.notebook.stream", data: VSBuffer.wrap(new Uint8Array([1])) }] }
            ],
            append: false
          }],
          true,
          void 0,
          () => void 0,
          void 0,
          false
        );
        assert.ok(success);
        assert.strictEqual(model.cells[0].outputs.length, 1);
        assert.ok(event);
      }
      {
        event = void 0;
        const success = model.applyEdits(
          [{
            editType: CellEditType.Output,
            index: 0,
            outputs: [],
            append: false
          }, {
            editType: CellEditType.Output,
            index: 1,
            outputs: [],
            append: false
          }],
          true,
          void 0,
          () => void 0,
          void 0,
          false
        );
        assert.ok(success);
        assert.ok(event);
      }
      {
        event = void 0;
        const success = model.applyEdits(
          [{
            editType: CellEditType.Output,
            index: 0,
            outputs: [],
            append: false
          }, {
            editType: CellEditType.Output,
            index: 1,
            outputs: [],
            append: false
          }],
          true,
          void 0,
          () => void 0,
          void 0,
          false
        );
        assert.ok(success);
        assert.ok(event === void 0);
      }
    });
  });
  test("Cell metadata/output change should update version id and alternative id #121807", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 2;", "javascript", CellKind.Code, [], {}]
    ], async (editor, viewModel) => {
      assert.strictEqual(editor.textModel.versionId, 0);
      const firstAltVersion = "0_0,1;1,1";
      assert.strictEqual(editor.textModel.alternativeVersionId, firstAltVersion);
      editor.textModel.applyEdits([
        {
          index: 0,
          editType: CellEditType.Metadata,
          metadata: {
            inputCollapsed: true
          }
        }
      ], true, void 0, () => void 0, void 0, true);
      assert.strictEqual(editor.textModel.versionId, 1);
      assert.notStrictEqual(editor.textModel.alternativeVersionId, firstAltVersion);
      const secondAltVersion = "1_0,1;1,1";
      assert.strictEqual(editor.textModel.alternativeVersionId, secondAltVersion);
      await viewModel.undo();
      assert.strictEqual(editor.textModel.versionId, 2);
      assert.strictEqual(editor.textModel.alternativeVersionId, firstAltVersion);
      await viewModel.redo();
      assert.strictEqual(editor.textModel.versionId, 3);
      assert.notStrictEqual(editor.textModel.alternativeVersionId, firstAltVersion);
      assert.strictEqual(editor.textModel.alternativeVersionId, secondAltVersion);
      editor.textModel.applyEdits([
        {
          index: 1,
          editType: CellEditType.Metadata,
          metadata: {
            inputCollapsed: true
          }
        }
      ], true, void 0, () => void 0, void 0, true);
      assert.strictEqual(editor.textModel.versionId, 4);
      assert.strictEqual(editor.textModel.alternativeVersionId, "4_0,1;1,1");
      await viewModel.undo();
      assert.strictEqual(editor.textModel.versionId, 5);
      assert.strictEqual(editor.textModel.alternativeVersionId, secondAltVersion);
    });
  });
  test("metadata changes on newly added cells should combine their undo operations", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [], {}]
    ], async (editor, viewModel, ds) => {
      const textModel = editor.textModel;
      editor.textModel.applyEdits([
        {
          editType: CellEditType.Replace,
          index: 1,
          count: 0,
          cells: [
            ds.add(new TestCell(textModel.viewType, 1, "var e = 5;", "javascript", CellKind.Code, [], languageService)),
            ds.add(new TestCell(textModel.viewType, 2, "var f = 6;", "javascript", CellKind.Code, [], languageService))
          ]
        }
      ], true, void 0, () => void 0, void 0, true);
      assert.strictEqual(textModel.cells.length, 3);
      editor.textModel.applyEdits([
        { editType: CellEditType.Metadata, index: 1, metadata: { id: "123" } }
      ], true, void 0, () => void 0, void 0, true);
      assert.strictEqual(textModel.cells[1].metadata.id, "123");
      await viewModel.undo();
      assert.strictEqual(textModel.cells.length, 1);
      await viewModel.redo();
      assert.strictEqual(textModel.cells.length, 3);
    });
  });
  test("changes with non-metadata edit should not combine their undo operations", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [], {}]
    ], async (editor, viewModel, ds) => {
      const textModel = editor.textModel;
      editor.textModel.applyEdits([
        {
          editType: CellEditType.Replace,
          index: 1,
          count: 0,
          cells: [
            ds.add(new TestCell(textModel.viewType, 1, "var e = 5;", "javascript", CellKind.Code, [], languageService)),
            ds.add(new TestCell(textModel.viewType, 2, "var f = 6;", "javascript", CellKind.Code, [], languageService))
          ]
        }
      ], true, void 0, () => void 0, void 0, true);
      assert.strictEqual(textModel.cells.length, 3);
      editor.textModel.applyEdits([
        { editType: CellEditType.Metadata, index: 1, metadata: { id: "123" } },
        {
          editType: CellEditType.Output,
          handle: 0,
          append: true,
          outputs: [{
            outputId: "newOutput",
            outputs: [{ mime: Mimes.text, data: valueBytesFromString("cba") }, { mime: "application/foo", data: valueBytesFromString("cba") }]
          }]
        }
      ], true, void 0, () => void 0, void 0, true);
      assert.strictEqual(textModel.cells[1].metadata.id, "123");
      await viewModel.undo();
      assert.strictEqual(textModel.cells.length, 3);
      await viewModel.undo();
      assert.strictEqual(textModel.cells.length, 1);
    });
  });
  test("Destructive sorting in _doApplyEdits #121994", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [{ outputId: "i42", outputs: [{ mime: "m/ime", data: valueBytesFromString("test") }] }], {}]
    ], async (editor) => {
      const notebook = editor.textModel;
      assert.strictEqual(notebook.cells[0].outputs.length, 1);
      assert.strictEqual(notebook.cells[0].outputs[0].outputs.length, 1);
      assert.deepStrictEqual(notebook.cells[0].outputs[0].outputs[0].data, valueBytesFromString("test"));
      const edits = [
        {
          editType: CellEditType.Output,
          handle: 0,
          outputs: []
        },
        {
          editType: CellEditType.Output,
          handle: 0,
          append: true,
          outputs: [{
            outputId: "newOutput",
            outputs: [{ mime: Mimes.text, data: valueBytesFromString("cba") }, { mime: "application/foo", data: valueBytesFromString("cba") }]
          }]
        }
      ];
      editor.textModel.applyEdits(edits, true, void 0, () => void 0, void 0, true);
      assert.strictEqual(notebook.cells[0].outputs.length, 1);
      assert.strictEqual(notebook.cells[0].outputs[0].outputs.length, 2);
    });
  });
  test("Destructive sorting in _doApplyEdits #121994. cell splice between output changes", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [{ outputId: "i42", outputs: [{ mime: "m/ime", data: valueBytesFromString("test") }] }], {}],
      ["var b = 2;", "javascript", CellKind.Code, [{ outputId: "i43", outputs: [{ mime: "m/ime", data: valueBytesFromString("test") }] }], {}],
      ["var c = 3;", "javascript", CellKind.Code, [{ outputId: "i44", outputs: [{ mime: "m/ime", data: valueBytesFromString("test") }] }], {}]
    ], async (editor) => {
      const notebook = editor.textModel;
      const edits = [
        {
          editType: CellEditType.Output,
          index: 0,
          outputs: []
        },
        {
          editType: CellEditType.Replace,
          index: 1,
          count: 1,
          cells: []
        },
        {
          editType: CellEditType.Output,
          index: 2,
          append: true,
          outputs: [{
            outputId: "newOutput",
            outputs: [{ mime: Mimes.text, data: valueBytesFromString("cba") }, { mime: "application/foo", data: valueBytesFromString("cba") }]
          }]
        }
      ];
      editor.textModel.applyEdits(edits, true, void 0, () => void 0, void 0, true);
      assert.strictEqual(notebook.cells.length, 2);
      assert.strictEqual(notebook.cells[0].outputs.length, 0);
      assert.strictEqual(notebook.cells[1].outputs.length, 2);
      assert.strictEqual(notebook.cells[1].outputs[0].outputId, "i44");
      assert.strictEqual(notebook.cells[1].outputs[1].outputId, "newOutput");
    });
  });
  test("Destructive sorting in _doApplyEdits #121994. cell splice between output changes 2", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [{ outputId: "i42", outputs: [{ mime: "m/ime", data: valueBytesFromString("test") }] }], {}],
      ["var b = 2;", "javascript", CellKind.Code, [{ outputId: "i43", outputs: [{ mime: "m/ime", data: valueBytesFromString("test") }] }], {}],
      ["var c = 3;", "javascript", CellKind.Code, [{ outputId: "i44", outputs: [{ mime: "m/ime", data: valueBytesFromString("test") }] }], {}]
    ], async (editor) => {
      const notebook = editor.textModel;
      const edits = [
        {
          editType: CellEditType.Output,
          index: 1,
          append: true,
          outputs: [{
            outputId: "newOutput",
            outputs: [{ mime: Mimes.text, data: valueBytesFromString("cba") }, { mime: "application/foo", data: valueBytesFromString("cba") }]
          }]
        },
        {
          editType: CellEditType.Replace,
          index: 1,
          count: 1,
          cells: []
        },
        {
          editType: CellEditType.Output,
          index: 1,
          append: true,
          outputs: [{
            outputId: "newOutput2",
            outputs: [{ mime: Mimes.text, data: valueBytesFromString("cba") }, { mime: "application/foo", data: valueBytesFromString("cba") }]
          }]
        }
      ];
      editor.textModel.applyEdits(edits, true, void 0, () => void 0, void 0, true);
      assert.strictEqual(notebook.cells.length, 2);
      assert.strictEqual(notebook.cells[0].outputs.length, 1);
      assert.strictEqual(notebook.cells[1].outputs.length, 1);
      assert.strictEqual(notebook.cells[1].outputs[0].outputId, "i44");
    });
  });
  test("Output edits splice", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [], {}]
    ], (editor) => {
      const model = editor.textModel;
      assert.strictEqual(model.cells.length, 1);
      assert.strictEqual(model.cells[0].outputs.length, 0);
      const success1 = model.applyEdits(
        [{
          editType: CellEditType.Output,
          index: 0,
          outputs: [
            { outputId: "out1", outputs: [{ mime: "application/x.notebook.stream", data: valueBytesFromString("1") }] },
            { outputId: "out2", outputs: [{ mime: "application/x.notebook.stream", data: valueBytesFromString("2") }] },
            { outputId: "out3", outputs: [{ mime: "application/x.notebook.stream", data: valueBytesFromString("3") }] },
            { outputId: "out4", outputs: [{ mime: "application/x.notebook.stream", data: valueBytesFromString("4") }] }
          ],
          append: false
        }],
        true,
        void 0,
        () => void 0,
        void 0,
        false
      );
      assert.ok(success1);
      assert.strictEqual(model.cells[0].outputs.length, 4);
      const success2 = model.applyEdits(
        [{
          editType: CellEditType.Output,
          index: 0,
          outputs: [
            { outputId: "out1", outputs: [{ mime: "application/x.notebook.stream", data: valueBytesFromString("1") }] },
            { outputId: "out5", outputs: [{ mime: "application/x.notebook.stream", data: valueBytesFromString("5") }] },
            { outputId: "out3", outputs: [{ mime: "application/x.notebook.stream", data: valueBytesFromString("3") }] },
            { outputId: "out6", outputs: [{ mime: "application/x.notebook.stream", data: valueBytesFromString("6") }] }
          ],
          append: false
        }],
        true,
        void 0,
        () => void 0,
        void 0,
        false
      );
      assert.ok(success2);
      assert.strictEqual(model.cells[0].outputs.length, 4);
      assert.strictEqual(model.cells[0].outputs[0].outputId, "out1");
      assert.strictEqual(model.cells[0].outputs[1].outputId, "out5");
      assert.strictEqual(model.cells[0].outputs[2].outputId, "out3");
      assert.strictEqual(model.cells[0].outputs[3].outputId, "out6");
    });
  });
  test("computeEdits no insert", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [], {}]
    ], (editor) => {
      const model = editor.textModel;
      const edits = NotebookTextModel.computeEdits(model, [
        { source: "var a = 1;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: void 0 }
      ]);
      assert.deepStrictEqual(edits, [
        { editType: CellEditType.Metadata, index: 0, metadata: {} }
      ]);
    });
  });
  test("computeEdits cell content changed", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [], {}]
    ], (editor) => {
      const model = editor.textModel;
      const cells = [
        { source: "var a = 2;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: void 0 }
      ];
      const edits = NotebookTextModel.computeEdits(model, cells);
      assert.deepStrictEqual(edits, [
        { editType: CellEditType.Replace, index: 0, count: 1, cells }
      ]);
    });
  });
  test("computeEdits last cell content changed", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 1;", "javascript", CellKind.Code, [], {}]
    ], (editor) => {
      const model = editor.textModel;
      const cells = [
        { source: "var a = 1;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: void 0 },
        { source: "var b = 2;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: void 0 }
      ];
      const edits = NotebookTextModel.computeEdits(model, cells);
      assert.deepStrictEqual(edits, [
        { editType: CellEditType.Metadata, index: 0, metadata: {} },
        { editType: CellEditType.Replace, index: 1, count: 1, cells: cells.slice(1) }
      ]);
    });
  });
  test("computeEdits first cell content changed", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 1;", "javascript", CellKind.Code, [], {}]
    ], (editor) => {
      const model = editor.textModel;
      const cells = [
        { source: "var a = 2;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: void 0 },
        { source: "var b = 1;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: void 0 }
      ];
      const edits = NotebookTextModel.computeEdits(model, cells);
      assert.deepStrictEqual(edits, [
        { editType: CellEditType.Replace, index: 0, count: 1, cells: cells.slice(0, 1) },
        { editType: CellEditType.Metadata, index: 1, metadata: {} }
      ]);
    });
  });
  test("computeEdits middle cell content changed", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 1;", "javascript", CellKind.Code, [], {}],
      ["var c = 1;", "javascript", CellKind.Code, [], {}]
    ], (editor) => {
      const model = editor.textModel;
      const cells = [
        { source: "var a = 1;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: void 0 },
        { source: "var b = 2;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: void 0 },
        { source: "var c = 1;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: void 0 }
      ];
      const edits = NotebookTextModel.computeEdits(model, cells);
      assert.deepStrictEqual(edits, [
        { editType: CellEditType.Metadata, index: 0, metadata: {} },
        { editType: CellEditType.Replace, index: 1, count: 1, cells: cells.slice(1, 2) },
        { editType: CellEditType.Metadata, index: 2, metadata: {} }
      ]);
    });
  });
  test("computeEdits cell metadata changed", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 1;", "javascript", CellKind.Code, [], {}]
    ], (editor) => {
      const model = editor.textModel;
      const cells = [
        { source: "var a = 1;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: { name: "foo" } },
        { source: "var b = 1;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: void 0 }
      ];
      const edits = NotebookTextModel.computeEdits(model, cells);
      assert.deepStrictEqual(edits, [
        { editType: CellEditType.Metadata, index: 0, metadata: { name: "foo" } },
        { editType: CellEditType.Metadata, index: 1, metadata: {} }
      ]);
    });
  });
  test("computeEdits cell language changed", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 1;", "javascript", CellKind.Code, [], {}]
    ], (editor) => {
      const model = editor.textModel;
      const cells = [
        { source: "var a = 1;", language: "typescript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: void 0 },
        { source: "var b = 1;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: void 0 }
      ];
      const edits = NotebookTextModel.computeEdits(model, cells);
      assert.deepStrictEqual(edits, [
        { editType: CellEditType.Replace, index: 0, count: 1, cells: cells.slice(0, 1) },
        { editType: CellEditType.Metadata, index: 1, metadata: {} }
      ]);
    });
  });
  test("computeEdits cell kind changed", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 1;", "javascript", CellKind.Code, [], {}]
    ], (editor) => {
      const model = editor.textModel;
      const cells = [
        { source: "var a = 1;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: void 0 },
        { source: "var b = 1;", language: "javascript", cellKind: CellKind.Markup, mime: void 0, outputs: [], metadata: void 0 }
      ];
      const edits = NotebookTextModel.computeEdits(model, cells);
      assert.deepStrictEqual(edits, [
        { editType: CellEditType.Metadata, index: 0, metadata: {} },
        { editType: CellEditType.Replace, index: 1, count: 1, cells: cells.slice(1) }
      ]);
    });
  });
  test("computeEdits cell metadata & content changed", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 1;", "javascript", CellKind.Code, [], {}]
    ], (editor) => {
      const model = editor.textModel;
      const cells = [
        { source: "var a = 1;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: { name: "foo" } },
        { source: "var b = 2;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: { name: "bar" } }
      ];
      const edits = NotebookTextModel.computeEdits(model, cells);
      assert.deepStrictEqual(edits, [
        { editType: CellEditType.Metadata, index: 0, metadata: { name: "foo" } },
        { editType: CellEditType.Replace, index: 1, count: 1, cells: cells.slice(1) }
      ]);
    });
  });
  test("computeEdits cell content changed while executing", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 1;", "javascript", CellKind.Code, [], {}]
    ], (editor) => {
      const model = editor.textModel;
      const cells = [
        { source: "var a = 1;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: {} },
        { source: "var b = 2;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: {} }
      ];
      const edits = NotebookTextModel.computeEdits(model, cells, [model.cells[1].handle]);
      assert.deepStrictEqual(edits, [
        { editType: CellEditType.Metadata, index: 0, metadata: {} },
        { editType: CellEditType.Replace, index: 1, count: 1, cells: cells.slice(1) }
      ]);
    });
  });
  test("computeEdits cell internal metadata changed", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 1;", "javascript", CellKind.Code, [], {}]
    ], (editor) => {
      const model = editor.textModel;
      const cells = [
        { source: "var a = 1;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: void 0, internalMetadata: { executionOrder: 1 } },
        { source: "var b = 1;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: void 0 }
      ];
      const edits = NotebookTextModel.computeEdits(model, cells);
      assert.deepStrictEqual(edits, [
        { editType: CellEditType.Replace, index: 0, count: 1, cells: cells.slice(0, 1) },
        { editType: CellEditType.Metadata, index: 1, metadata: {} }
      ]);
    });
  });
  test("computeEdits cell internal metadata changed while executing", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 1;", "javascript", CellKind.Code, [], {}]
    ], (editor) => {
      const model = editor.textModel;
      const cells = [
        { source: "var a = 1;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: {} },
        { source: "var b = 1;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: {}, internalMetadata: { executionOrder: 1 } }
      ];
      const edits = NotebookTextModel.computeEdits(model, cells, [model.cells[1].handle]);
      assert.deepStrictEqual(edits, [
        { editType: CellEditType.Metadata, index: 0, metadata: {} },
        { editType: CellEditType.Metadata, index: 1, metadata: {} }
      ]);
    });
  });
  test("computeEdits cell insertion", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 1;", "javascript", CellKind.Code, [], {}]
    ], (editor) => {
      const model = editor.textModel;
      const cells = [
        { source: "var a = 1;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: void 0 },
        { source: "var c = 1;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: void 0 },
        { source: "var b = 1;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: { foo: "bar" } }
      ];
      const edits = NotebookTextModel.computeEdits(model, cells);
      assert.deepStrictEqual(edits, [
        { editType: CellEditType.Metadata, index: 0, metadata: {} },
        { editType: CellEditType.Replace, index: 1, count: 0, cells: cells.slice(1, 2) },
        { editType: CellEditType.Metadata, index: 1, metadata: { foo: "bar" } }
      ]);
      model.applyEdits(edits, true, void 0, () => void 0, void 0, true);
      assert.equal(model.cells.length, 3);
      assert.equal(model.cells[1].getValue(), "var c = 1;");
      assert.equal(model.cells[2].getValue(), "var b = 1;");
      assert.deepStrictEqual(model.cells[2].metadata, { foo: "bar" });
    });
  });
  test("computeEdits output changed", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [], {}],
      ["var b = 1;", "javascript", CellKind.Code, [], {}]
    ], (editor) => {
      const model = editor.textModel;
      const cells = [
        {
          source: "var a = 1;",
          language: "javascript",
          cellKind: CellKind.Code,
          mime: void 0,
          outputs: [{
            outputId: "someId",
            outputs: [{ mime: Mimes.markdown, data: valueBytesFromString("_World_") }]
          }],
          metadata: void 0
        },
        { source: "var b = 1;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: { foo: "bar" } }
      ];
      const edits = NotebookTextModel.computeEdits(model, cells);
      assert.deepStrictEqual(edits, [
        { editType: CellEditType.Metadata, index: 0, metadata: {} },
        {
          editType: CellEditType.Output,
          index: 0,
          outputs: [{
            outputId: "someId",
            outputs: [{ mime: Mimes.markdown, data: valueBytesFromString("_World_") }]
          }],
          append: false
        },
        { editType: CellEditType.Metadata, index: 1, metadata: { foo: "bar" } }
      ]);
      model.applyEdits(edits, true, void 0, () => void 0, void 0, true);
      assert.equal(model.cells.length, 2);
      assert.strictEqual(model.cells[0].outputs.length, 1);
      assert.equal(model.cells[0].outputs[0].outputId, "someId");
      assert.equal(model.cells[0].outputs[0].outputs[0].data.toString(), "_World_");
    });
  });
  test("computeEdits output items changed", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [{
        outputId: "someId",
        outputs: [{ mime: Mimes.markdown, data: valueBytesFromString("_Hello_") }]
      }], {}],
      ["var b = 1;", "javascript", CellKind.Code, [], {}]
    ], (editor) => {
      const model = editor.textModel;
      const cells = [
        {
          source: "var a = 1;",
          language: "javascript",
          cellKind: CellKind.Code,
          mime: void 0,
          outputs: [{
            outputId: "someId",
            outputs: [{ mime: Mimes.markdown, data: valueBytesFromString("_World_") }]
          }],
          metadata: void 0
        },
        { source: "var b = 1;", language: "javascript", cellKind: CellKind.Code, mime: void 0, outputs: [], metadata: { foo: "bar" } }
      ];
      const edits = NotebookTextModel.computeEdits(model, cells);
      assert.deepStrictEqual(edits, [
        { editType: CellEditType.Metadata, index: 0, metadata: {} },
        { editType: CellEditType.OutputItems, outputId: "someId", items: [{ mime: Mimes.markdown, data: valueBytesFromString("_World_") }], append: false },
        { editType: CellEditType.Metadata, index: 1, metadata: { foo: "bar" } }
      ]);
      model.applyEdits(edits, true, void 0, () => void 0, void 0, true);
      assert.equal(model.cells.length, 2);
      assert.strictEqual(model.cells[0].outputs.length, 1);
      assert.equal(model.cells[0].outputs[0].outputId, "someId");
      assert.equal(model.cells[0].outputs[0].outputs[0].data.toString(), "_World_");
    });
  });
  test("Append multiple text/plain output items", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [{
        outputId: "1",
        outputs: [{ mime: "text/plain", data: valueBytesFromString("foo") }]
      }], {}]
    ], (editor) => {
      const model = editor.textModel;
      const edits = [
        {
          editType: CellEditType.OutputItems,
          outputId: "1",
          append: true,
          items: [{ mime: "text/plain", data: VSBuffer.fromString("bar") }, { mime: "text/plain", data: VSBuffer.fromString("baz") }]
        }
      ];
      model.applyEdits(edits, true, void 0, () => void 0, void 0, true);
      assert.equal(model.cells.length, 1);
      assert.equal(model.cells[0].outputs.length, 1);
      assert.equal(model.cells[0].outputs[0].outputs.length, 3);
      assert.equal(model.cells[0].outputs[0].outputs[0].mime, "text/plain");
      assert.equal(model.cells[0].outputs[0].outputs[0].data.toString(), "foo");
      assert.equal(model.cells[0].outputs[0].outputs[1].mime, "text/plain");
      assert.equal(model.cells[0].outputs[0].outputs[1].data.toString(), "bar");
      assert.equal(model.cells[0].outputs[0].outputs[2].mime, "text/plain");
      assert.equal(model.cells[0].outputs[0].outputs[2].data.toString(), "baz");
    });
  });
  test("Append multiple stdout stream output items to an output with another mime", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [{
        outputId: "1",
        outputs: [{ mime: "text/plain", data: valueBytesFromString("foo") }]
      }], {}]
    ], (editor) => {
      const model = editor.textModel;
      const edits = [
        {
          editType: CellEditType.OutputItems,
          outputId: "1",
          append: true,
          items: [{ mime: "application/vnd.code.notebook.stdout", data: VSBuffer.fromString("bar") }, { mime: "application/vnd.code.notebook.stdout", data: VSBuffer.fromString("baz") }]
        }
      ];
      model.applyEdits(edits, true, void 0, () => void 0, void 0, true);
      assert.equal(model.cells.length, 1);
      assert.equal(model.cells[0].outputs.length, 1);
      assert.equal(model.cells[0].outputs[0].outputs.length, 3);
      assert.equal(model.cells[0].outputs[0].outputs[0].mime, "text/plain");
      assert.equal(model.cells[0].outputs[0].outputs[0].data.toString(), "foo");
      assert.equal(model.cells[0].outputs[0].outputs[1].mime, "application/vnd.code.notebook.stdout");
      assert.equal(model.cells[0].outputs[0].outputs[1].data.toString(), "bar");
      assert.equal(model.cells[0].outputs[0].outputs[2].mime, "application/vnd.code.notebook.stdout");
      assert.equal(model.cells[0].outputs[0].outputs[2].data.toString(), "baz");
    });
  });
  test("Compress multiple stdout stream output items", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [{
        outputId: "1",
        outputs: [{ mime: "application/vnd.code.notebook.stdout", data: valueBytesFromString("foo") }]
      }], {}]
    ], (editor) => {
      const model = editor.textModel;
      const edits = [
        {
          editType: CellEditType.OutputItems,
          outputId: "1",
          append: true,
          items: [{ mime: "application/vnd.code.notebook.stdout", data: VSBuffer.fromString("bar") }, { mime: "application/vnd.code.notebook.stdout", data: VSBuffer.fromString("baz") }]
        }
      ];
      model.applyEdits(edits, true, void 0, () => void 0, void 0, true);
      assert.equal(model.cells.length, 1);
      assert.equal(model.cells[0].outputs.length, 1);
      assert.equal(model.cells[0].outputs[0].outputs.length, 1);
      assert.equal(model.cells[0].outputs[0].outputs[0].mime, "application/vnd.code.notebook.stdout");
      assert.equal(model.cells[0].outputs[0].outputs[0].data.toString(), "foobarbaz");
    });
  });
  test("Compress multiple stderr stream output items", async function() {
    await withTestNotebook([
      ["var a = 1;", "javascript", CellKind.Code, [{
        outputId: "1",
        outputs: [{ mime: "application/vnd.code.notebook.stderr", data: valueBytesFromString("foo") }]
      }], {}]
    ], (editor) => {
      const model = editor.textModel;
      const edits = [
        {
          editType: CellEditType.OutputItems,
          outputId: "1",
          append: true,
          items: [{ mime: "application/vnd.code.notebook.stderr", data: VSBuffer.fromString("bar") }, { mime: "application/vnd.code.notebook.stderr", data: VSBuffer.fromString("baz") }]
        }
      ];
      model.applyEdits(edits, true, void 0, () => void 0, void 0, true);
      assert.equal(model.cells.length, 1);
      assert.equal(model.cells[0].outputs.length, 1);
      assert.equal(model.cells[0].outputs[0].outputs.length, 1);
      assert.equal(model.cells[0].outputs[0].outputs[0].mime, "application/vnd.code.notebook.stderr");
      assert.equal(model.cells[0].outputs[0].outputs[0].data.toString(), "foobarbaz");
    });
  });
  test("findNextMatch", async function() {
    await withTestNotebook(
      [
        ["var a = 1;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}],
        ["var d = 4;", "javascript", CellKind.Code, [], {}]
      ],
      (editor, viewModel) => {
        const notebookModel = viewModel.notebookDocument;
        let findMatch = notebookModel.findNextMatch("var", { cellIndex: 0, position: new Position(1, 1) }, false, false, null);
        assert.ok(findMatch);
        assert.strictEqual(findMatch.match.range.startLineNumber, 1);
        assert.strictEqual(findMatch.match.range.startColumn, 1);
        findMatch = notebookModel.findNextMatch("b", { cellIndex: 1, position: new Position(1, 1) }, false, false, null);
        assert.ok(findMatch);
        assert.strictEqual(findMatch.match.range.startLineNumber, 1);
        assert.strictEqual(findMatch.match.range.startColumn, 5);
        findMatch = notebookModel.findNextMatch("c", { cellIndex: 2, position: new Position(1, 1) }, false, false, null);
        assert.ok(findMatch);
        assert.strictEqual(findMatch.match.range.startLineNumber, 1);
        assert.strictEqual(findMatch.match.range.startColumn, 5);
        findMatch = notebookModel.findNextMatch("d", { cellIndex: 3, position: new Position(1, 1) }, false, false, null);
        assert.ok(findMatch);
        assert.strictEqual(findMatch.match.range.startLineNumber, 1);
        assert.strictEqual(findMatch.match.range.startColumn, 5);
        findMatch = notebookModel.findNextMatch("e", { cellIndex: 0, position: new Position(1, 1) }, false, false, null);
        assert.strictEqual(findMatch, null);
      }
    );
  });
  test("findNextMatch 2", async function() {
    await withTestNotebook(
      [
        ["var a = 1; var a = 2;", "javascript", CellKind.Code, [], {}],
        ["var b = 2;", "javascript", CellKind.Code, [], {}],
        ["var c = 3;", "javascript", CellKind.Code, [], {}],
        ["var d = 4;", "javascript", CellKind.Code, [], {}]
      ],
      (editor, viewModel) => {
        const notebookModel = viewModel.notebookDocument;
        let findMatch = notebookModel.findNextMatch("var", { cellIndex: 0, position: new Position(1, 1) }, false, false, null);
        assert.ok(findMatch);
        assert.strictEqual(findMatch.match.range.startLineNumber, 1);
        assert.strictEqual(findMatch.match.range.startColumn, 1);
        findMatch = notebookModel.findNextMatch("b", { cellIndex: 1, position: new Position(1, 1) }, false, false, null);
        assert.ok(findMatch);
        assert.strictEqual(findMatch.match.range.startLineNumber, 1);
        assert.strictEqual(findMatch.match.range.startColumn, 5);
        findMatch = notebookModel.findNextMatch("c", { cellIndex: 2, position: new Position(1, 1) }, false, false, null);
        assert.ok(findMatch);
        assert.strictEqual(findMatch.match.range.startLineNumber, 1);
        assert.strictEqual(findMatch.match.range.startColumn, 5);
        findMatch = notebookModel.findNextMatch("d", { cellIndex: 3, position: new Position(1, 1) }, false, false, null);
        assert.ok(findMatch);
        assert.strictEqual(findMatch.match.range.startLineNumber, 1);
        assert.strictEqual(findMatch.match.range.startColumn, 5);
        findMatch = notebookModel.findNextMatch("e", { cellIndex: 0, position: new Position(1, 1) }, false, false, null);
        assert.strictEqual(findMatch, null);
        findMatch = notebookModel.findNextMatch("var", { cellIndex: 0, position: new Position(1, 1) }, false, false, null);
        assert.ok(findMatch);
        assert.strictEqual(findMatch.match.range.startLineNumber, 1);
        assert.strictEqual(findMatch.match.range.startColumn, 1);
        findMatch = notebookModel.findNextMatch("var", { cellIndex: 0, position: new Position(1, 5) }, false, false, null);
        assert.ok(findMatch);
        assert.strictEqual(findMatch.match.range.startLineNumber, 1);
        assert.strictEqual(findMatch.match.range.startColumn, 12);
        findMatch = notebookModel.findNextMatch("a", { cellIndex: 0, position: new Position(1, 10) }, false, false, null);
        assert.ok(findMatch);
        assert.strictEqual(findMatch.match.range.startLineNumber, 1);
        assert.strictEqual(findMatch.match.range.startColumn, 13);
        findMatch = notebookModel.findNextMatch("var", { cellIndex: 0, position: new Position(1, 20) }, false, false, null);
        assert.ok(findMatch);
        assert.strictEqual(findMatch.match.range.startLineNumber, 1);
        assert.strictEqual(findMatch.match.range.startColumn, 1);
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFx0ZXN0XFxicm93c2VyXFxub3RlYm9va1RleHRNb2RlbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE1pbWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWltZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJVW5kb1JlZG9TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvLmpzJztcbmltcG9ydCB7IE5vdGVib29rVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL25vdGVib29rVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IENlbGxFZGl0VHlwZSwgQ2VsbEtpbmQsIElDZWxsRWRpdE9wZXJhdGlvbiwgTU9WRV9DVVJTT1JfMV9MSU5FX0NPTU1BTkQsIE5vdGVib29rVGV4dE1vZGVsQ2hhbmdlZEV2ZW50LCBOb3RlYm9va1RleHRNb2RlbFdpbGxBZGRSZW1vdmVFdmVudCwgU2VsZWN0aW9uU3RhdGVUeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IHNldHVwSW5zdGFudGlhdGlvblNlcnZpY2UsIFRlc3RDZWxsLCB2YWx1ZUJ5dGVzRnJvbVN0cmluZywgd2l0aFRlc3ROb3RlYm9vayB9IGZyb20gJy4vdGVzdE5vdGVib29rRWRpdG9yLmpzJztcblxuc3VpdGUoJ05vdGVib29rVGV4dE1vZGVsJywgKCkgPT4ge1xuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2U7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGVTZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBzZXR1cEluc3RhbnRpYXRpb25TZXJ2aWNlKGRpc3Bvc2FibGVzKTtcblx0XHRsYW5ndWFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3B5KElVbmRvUmVkb1NlcnZpY2UsICdwdXNoRWxlbWVudCcpO1xuXHR9KTtcblxuXHRzdWl0ZVRlYXJkb3duKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSk7XG5cblx0dGVzdCgnaW5zZXJ0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBjID0gMzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGQgPSA0OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdFx0XSxcblx0XHRcdChlZGl0b3IsIF92aWV3TW9kZWwsIGRzKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRleHRNb2RlbCA9IGVkaXRvci50ZXh0TW9kZWw7XG5cdFx0XHRcdHRleHRNb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDEsIGNvdW50OiAwLCBjZWxsczogW2RzLmFkZChuZXcgVGVzdENlbGwodGV4dE1vZGVsLnZpZXdUeXBlLCA1LCAndmFyIGUgPSA1OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIGxhbmd1YWdlU2VydmljZSkpXSB9LFxuXHRcdFx0XHRcdHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMywgY291bnQ6IDAsIGNlbGxzOiBbZHMuYWRkKG5ldyBUZXN0Q2VsbCh0ZXh0TW9kZWwudmlld1R5cGUsIDYsICd2YXIgZiA9IDY7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwgbGFuZ3VhZ2VTZXJ2aWNlKSldIH0sXG5cdFx0XHRcdF0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0TW9kZWwuY2VsbHMubGVuZ3RoLCA2KTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dE1vZGVsLmNlbGxzWzFdLmdldFZhbHVlKCksICd2YXIgZSA9IDU7Jyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0TW9kZWwuY2VsbHNbNF0uZ2V0VmFsdWUoKSwgJ3ZhciBmID0gNjsnKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aXBsZSBpbnNlcnRzIGF0IHNhbWUgcG9zaXRpb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGMgPSAzOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgZCA9IDQ7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XHRdLFxuXHRcdFx0KGVkaXRvciwgX3ZpZXdNb2RlbCwgZHMpID0+IHtcblx0XHRcdFx0Y29uc3QgdGV4dE1vZGVsID0gZWRpdG9yLnRleHRNb2RlbDtcblx0XHRcdFx0dGV4dE1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0XHRcdHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMSwgY291bnQ6IDAsIGNlbGxzOiBbZHMuYWRkKG5ldyBUZXN0Q2VsbCh0ZXh0TW9kZWwudmlld1R5cGUsIDUsICd2YXIgZSA9IDU7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwgbGFuZ3VhZ2VTZXJ2aWNlKSldIH0sXG5cdFx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAxLCBjb3VudDogMCwgY2VsbHM6IFtkcy5hZGQobmV3IFRlc3RDZWxsKHRleHRNb2RlbC52aWV3VHlwZSwgNiwgJ3ZhciBmID0gNjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCBsYW5ndWFnZVNlcnZpY2UpKV0gfSxcblx0XHRcdFx0XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRNb2RlbC5jZWxscy5sZW5ndGgsIDYpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0TW9kZWwuY2VsbHNbMV0uZ2V0VmFsdWUoKSwgJ3ZhciBlID0gNTsnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRNb2RlbC5jZWxsc1syXS5nZXRWYWx1ZSgpLCAndmFyIGYgPSA2OycpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYyA9IDM7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBkID0gNDsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHQoZWRpdG9yKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRleHRNb2RlbCA9IGVkaXRvci50ZXh0TW9kZWw7XG5cdFx0XHRcdHRleHRNb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDEsIGNvdW50OiAxLCBjZWxsczogW10gfSxcblx0XHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDMsIGNvdW50OiAxLCBjZWxsczogW10gfSxcblx0XHRcdFx0XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRNb2RlbC5jZWxsc1swXS5nZXRWYWx1ZSgpLCAndmFyIGEgPSAxOycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dE1vZGVsLmNlbGxzWzFdLmdldFZhbHVlKCksICd2YXIgYyA9IDM7Jyk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlICsgaW5zZXJ0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBjID0gMzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGQgPSA0OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdFx0XSxcblx0XHRcdChlZGl0b3IsIF92aWV3TW9kZWwsIGRzKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRleHRNb2RlbCA9IGVkaXRvci50ZXh0TW9kZWw7XG5cdFx0XHRcdHRleHRNb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDEsIGNvdW50OiAxLCBjZWxsczogW10gfSxcblx0XHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDMsIGNvdW50OiAwLCBjZWxsczogW2RzLmFkZChuZXcgVGVzdENlbGwodGV4dE1vZGVsLnZpZXdUeXBlLCA1LCAndmFyIGUgPSA1OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIGxhbmd1YWdlU2VydmljZSkpXSB9LFxuXHRcdFx0XHRdLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRNb2RlbC5jZWxscy5sZW5ndGgsIDQpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0TW9kZWwuY2VsbHNbMF0uZ2V0VmFsdWUoKSwgJ3ZhciBhID0gMTsnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRNb2RlbC5jZWxsc1syXS5nZXRWYWx1ZSgpLCAndmFyIGUgPSA1OycpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSArIGluc2VydCBhdCBzYW1lIHBvc2l0aW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBjID0gMzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGQgPSA0OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdFx0XSxcblx0XHRcdChlZGl0b3IsIF92aWV3TW9kZWwsIGRzKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRleHRNb2RlbCA9IGVkaXRvci50ZXh0TW9kZWw7XG5cdFx0XHRcdHRleHRNb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDEsIGNvdW50OiAxLCBjZWxsczogW10gfSxcblx0XHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDEsIGNvdW50OiAwLCBjZWxsczogW2RzLmFkZChuZXcgVGVzdENlbGwodGV4dE1vZGVsLnZpZXdUeXBlLCA1LCAndmFyIGUgPSA1OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIGxhbmd1YWdlU2VydmljZSkpXSB9LFxuXHRcdFx0XHRdLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dE1vZGVsLmNlbGxzLmxlbmd0aCwgNCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0TW9kZWwuY2VsbHNbMF0uZ2V0VmFsdWUoKSwgJ3ZhciBhID0gMTsnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRNb2RlbC5jZWxsc1sxXS5nZXRWYWx1ZSgpLCAndmFyIGUgPSA1OycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dE1vZGVsLmNlbGxzWzJdLmdldFZhbHVlKCksICd2YXIgYyA9IDM7Jyk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnKHJlcGxhY2UpIGRlbGV0ZSArIGluc2VydCBhdCBzYW1lIHBvc2l0aW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBjID0gMzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGQgPSA0OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdFx0XSxcblx0XHRcdChlZGl0b3IsIF92aWV3TW9kZWwsIGRzKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRleHRNb2RlbCA9IGVkaXRvci50ZXh0TW9kZWw7XG5cdFx0XHRcdHRleHRNb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDEsIGNvdW50OiAxLCBjZWxsczogW2RzLmFkZChuZXcgVGVzdENlbGwodGV4dE1vZGVsLnZpZXdUeXBlLCA1LCAndmFyIGUgPSA1OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIGxhbmd1YWdlU2VydmljZSkpXSB9LFxuXHRcdFx0XHRdLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dE1vZGVsLmNlbGxzLmxlbmd0aCwgNCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0TW9kZWwuY2VsbHNbMF0uZ2V0VmFsdWUoKSwgJ3ZhciBhID0gMTsnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRNb2RlbC5jZWxsc1sxXS5nZXRWYWx1ZSgpLCAndmFyIGUgPSA1OycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dE1vZGVsLmNlbGxzWzJdLmdldFZhbHVlKCksICd2YXIgYyA9IDM7Jyk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnb3V0cHV0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHQoZWRpdG9yKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRleHRNb2RlbCA9IGVkaXRvci50ZXh0TW9kZWw7XG5cblx0XHRcdFx0Ly8gaW52YWxpZCBpbmRleCAxXG5cdFx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4ge1xuXHRcdFx0XHRcdHRleHRNb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdFx0XHRpbmRleDogTnVtYmVyLk1BWF9WQUxVRSxcblx0XHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuT3V0cHV0LFxuXHRcdFx0XHRcdFx0b3V0cHV0czogW11cblx0XHRcdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIGludmFsaWQgaW5kZXggMlxuXHRcdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0XHR0ZXh0TW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRcdFx0aW5kZXg6IC0xLFxuXHRcdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5PdXRwdXQsXG5cdFx0XHRcdFx0XHRvdXRwdXRzOiBbXVxuXHRcdFx0XHRcdH1dLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGV4dE1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdFx0XHRpbmRleDogMCxcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dCxcblx0XHRcdFx0XHRvdXRwdXRzOiBbe1xuXHRcdFx0XHRcdFx0b3V0cHV0SWQ6ICdzb21lSWQnLFxuXHRcdFx0XHRcdFx0b3V0cHV0czogW3sgbWltZTogTWltZXMubWFya2Rvd24sIGRhdGE6IHZhbHVlQnl0ZXNGcm9tU3RyaW5nKCdfSGVsbG9fJykgfV1cblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRNb2RlbC5jZWxscy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dE1vZGVsLmNlbGxzWzBdLm91dHB1dHMubGVuZ3RoLCAxKTtcblxuXHRcdFx0XHQvLyBhcHBlbmRcblx0XHRcdFx0dGV4dE1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdFx0XHRpbmRleDogMCxcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dCxcblx0XHRcdFx0XHRhcHBlbmQ6IHRydWUsXG5cdFx0XHRcdFx0b3V0cHV0czogW3tcblx0XHRcdFx0XHRcdG91dHB1dElkOiAnc29tZUlkMicsXG5cdFx0XHRcdFx0XHRvdXRwdXRzOiBbeyBtaW1lOiBNaW1lcy5tYXJrZG93biwgZGF0YTogdmFsdWVCeXRlc0Zyb21TdHJpbmcoJ19IZWxsbzJfJykgfV1cblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRNb2RlbC5jZWxscy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dE1vZGVsLmNlbGxzWzBdLm91dHB1dHMubGVuZ3RoLCAyKTtcblx0XHRcdFx0bGV0IFtmaXJzdCwgc2Vjb25kXSA9IHRleHRNb2RlbC5jZWxsc1swXS5vdXRwdXRzO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3Qub3V0cHV0SWQsICdzb21lSWQnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC5vdXRwdXRJZCwgJ3NvbWVJZDInKTtcblxuXHRcdFx0XHQvLyByZXBsYWNlIGFsbFxuXHRcdFx0XHR0ZXh0TW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRcdGluZGV4OiAwLFxuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuT3V0cHV0LFxuXHRcdFx0XHRcdG91dHB1dHM6IFt7XG5cdFx0XHRcdFx0XHRvdXRwdXRJZDogJ3NvbWVJZDMnLFxuXHRcdFx0XHRcdFx0b3V0cHV0czogW3sgbWltZTogTWltZXMudGV4dCwgZGF0YTogdmFsdWVCeXRlc0Zyb21TdHJpbmcoJ0xhc3QsIHJlcGxhY2VkIG91dHB1dCcpIH1dXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0TW9kZWwuY2VsbHMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRNb2RlbC5jZWxsc1swXS5vdXRwdXRzLmxlbmd0aCwgMSk7XG5cdFx0XHRcdFtmaXJzdF0gPSB0ZXh0TW9kZWwuY2VsbHNbMF0ub3V0cHV0cztcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0Lm91dHB1dElkLCAnc29tZUlkMycpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpcGxlIGFwcGVuZCBvdXRwdXQgaW4gb25lIHBvc2l0aW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHQoZWRpdG9yKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRleHRNb2RlbCA9IGVkaXRvci50ZXh0TW9kZWw7XG5cblx0XHRcdFx0Ly8gYXBwZW5kXG5cdFx0XHRcdHRleHRNb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRpbmRleDogMCxcblx0XHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuT3V0cHV0LFxuXHRcdFx0XHRcdFx0YXBwZW5kOiB0cnVlLFxuXHRcdFx0XHRcdFx0b3V0cHV0czogW3tcblx0XHRcdFx0XHRcdFx0b3V0cHV0SWQ6ICdhcHBlbmQxJyxcblx0XHRcdFx0XHRcdFx0b3V0cHV0czogW3sgbWltZTogTWltZXMubWFya2Rvd24sIGRhdGE6IHZhbHVlQnl0ZXNGcm9tU3RyaW5nKCdhcHBlbmQgMScpIH1dXG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dCxcblx0XHRcdFx0XHRcdGFwcGVuZDogdHJ1ZSxcblx0XHRcdFx0XHRcdG91dHB1dHM6IFt7XG5cdFx0XHRcdFx0XHRcdG91dHB1dElkOiAnYXBwZW5kMicsXG5cdFx0XHRcdFx0XHRcdG91dHB1dHM6IFt7IG1pbWU6IE1pbWVzLm1hcmtkb3duLCBkYXRhOiB2YWx1ZUJ5dGVzRnJvbVN0cmluZygnYXBwZW5kIDInKSB9XVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0TW9kZWwuY2VsbHMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRNb2RlbC5jZWxsc1swXS5vdXRwdXRzLmxlbmd0aCwgMik7XG5cdFx0XHRcdGNvbnN0IFtmaXJzdCwgc2Vjb25kXSA9IHRleHRNb2RlbC5jZWxsc1swXS5vdXRwdXRzO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3Qub3V0cHV0SWQsICdhcHBlbmQxJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmQub3V0cHV0SWQsICdhcHBlbmQyJyk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYXBwZW5kIHRvIG91dHB1dCBjcmVhdGVkIGluIHNhbWUgYmF0Y2gnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdChlZGl0b3IpID0+IHtcblx0XHRcdFx0Y29uc3QgdGV4dE1vZGVsID0gZWRpdG9yLnRleHRNb2RlbDtcblxuXHRcdFx0XHR0ZXh0TW9kZWwuYXBwbHlFZGl0cyhbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dCxcblx0XHRcdFx0XHRcdGFwcGVuZDogdHJ1ZSxcblx0XHRcdFx0XHRcdG91dHB1dHM6IFt7XG5cdFx0XHRcdFx0XHRcdG91dHB1dElkOiAnYXBwZW5kMScsXG5cdFx0XHRcdFx0XHRcdG91dHB1dHM6IFt7IG1pbWU6IE1pbWVzLm1hcmtkb3duLCBkYXRhOiB2YWx1ZUJ5dGVzRnJvbVN0cmluZygnYXBwZW5kIDEnKSB9XVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuT3V0cHV0SXRlbXMsXG5cdFx0XHRcdFx0XHRhcHBlbmQ6IHRydWUsXG5cdFx0XHRcdFx0XHRvdXRwdXRJZDogJ2FwcGVuZDEnLFxuXHRcdFx0XHRcdFx0aXRlbXM6IFt7XG5cdFx0XHRcdFx0XHRcdG1pbWU6IE1pbWVzLm1hcmtkb3duLCBkYXRhOiB2YWx1ZUJ5dGVzRnJvbVN0cmluZygnYXBwZW5kIDInKVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0TW9kZWwuY2VsbHMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRNb2RlbC5jZWxsc1swXS5vdXRwdXRzLmxlbmd0aCwgMSwgJ2hhcyAxIG91dHB1dCcpO1xuXHRcdFx0XHRjb25zdCBbZmlyc3RdID0gdGV4dE1vZGVsLmNlbGxzWzBdLm91dHB1dHM7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5vdXRwdXRJZCwgJ2FwcGVuZDEnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0Lm91dHB1dHMubGVuZ3RoLCAyLCAnaGFzIDIgaXRlbXMnKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHRjb25zdCBzdGRPdXRNaW1lID0gJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLnN0ZG91dCc7XG5cdGNvbnN0IHN0ZEVyck1pbWUgPSAnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suc3RkZXJyJztcblxuXHR0ZXN0KCdhcHBlbmRpbmcgc3RyZWFtaW5nIG91dHB1dHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdChlZGl0b3IpID0+IHtcblx0XHRcdFx0Y29uc3QgdGV4dE1vZGVsID0gZWRpdG9yLnRleHRNb2RlbDtcblxuXHRcdFx0XHR0ZXh0TW9kZWwuYXBwbHlFZGl0cyhbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dCxcblx0XHRcdFx0XHRcdGFwcGVuZDogdHJ1ZSxcblx0XHRcdFx0XHRcdG91dHB1dHM6IFt7XG5cdFx0XHRcdFx0XHRcdG91dHB1dElkOiAnYXBwZW5kMScsXG5cdFx0XHRcdFx0XHRcdG91dHB1dHM6IFt7IG1pbWU6IHN0ZE91dE1pbWUsIGRhdGE6IHZhbHVlQnl0ZXNGcm9tU3RyaW5nKCdhcHBlbmQgMScpIH1dXG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH1dLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0Y29uc3QgW291dHB1dF0gPSB0ZXh0TW9kZWwuY2VsbHNbMF0ub3V0cHV0cztcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG91dHB1dC52ZXJzaW9uSWQsIDAsICdpbml0aWFsIG91dHB1dCB2ZXJzaW9uIHNob3VsZCBiZSAwJyk7XG5cblx0XHRcdFx0dGV4dE1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuT3V0cHV0SXRlbXMsXG5cdFx0XHRcdFx0XHRhcHBlbmQ6IHRydWUsXG5cdFx0XHRcdFx0XHRvdXRwdXRJZDogJ2FwcGVuZDEnLFxuXHRcdFx0XHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0XHRcdFx0eyBtaW1lOiBzdGRPdXRNaW1lLCBkYXRhOiB2YWx1ZUJ5dGVzRnJvbVN0cmluZygnYXBwZW5kIDInKSB9LFxuXHRcdFx0XHRcdFx0XHR7IG1pbWU6IHN0ZE91dE1pbWUsIGRhdGE6IHZhbHVlQnl0ZXNGcm9tU3RyaW5nKCdhcHBlbmQgMycpIH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdXRwdXQudmVyc2lvbklkLCAxLCAndmVyc2lvbiBzaG91bGQgYnVtcCBwZXIgYXBwZW5kJyk7XG5cblx0XHRcdFx0dGV4dE1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuT3V0cHV0SXRlbXMsXG5cdFx0XHRcdFx0XHRhcHBlbmQ6IHRydWUsXG5cdFx0XHRcdFx0XHRvdXRwdXRJZDogJ2FwcGVuZDEnLFxuXHRcdFx0XHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0XHRcdFx0eyBtaW1lOiBzdGRPdXRNaW1lLCBkYXRhOiB2YWx1ZUJ5dGVzRnJvbVN0cmluZygnYXBwZW5kIDQnKSB9LFxuXHRcdFx0XHRcdFx0XHR7IG1pbWU6IHN0ZE91dE1pbWUsIGRhdGE6IHZhbHVlQnl0ZXNGcm9tU3RyaW5nKCdhcHBlbmQgNScpIH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdXRwdXQudmVyc2lvbklkLCAyLCAndmVyc2lvbiBzaG91bGQgYnVtcCBwZXIgYXBwZW5kJyk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRNb2RlbC5jZWxscy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dE1vZGVsLmNlbGxzWzBdLm91dHB1dHMubGVuZ3RoLCAxLCAnaGFzIDEgb3V0cHV0Jyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdXRwdXQub3V0cHV0SWQsICdhcHBlbmQxJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdXRwdXQub3V0cHV0cy5sZW5ndGgsIDEsICdvdXRwdXRzIGFyZSBjb21wcmVzc2VkJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdXRwdXQub3V0cHV0c1swXS5kYXRhLnRvU3RyaW5nKCksICdhcHBlbmQgMWFwcGVuZCAyYXBwZW5kIDNhcHBlbmQgNGFwcGVuZCA1Jyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdXRwdXQuYXBwZW5kZWRTaW5jZVZlcnNpb24oMCwgc3RkT3V0TWltZSk/LnRvU3RyaW5nKCksICdhcHBlbmQgMmFwcGVuZCAzYXBwZW5kIDRhcHBlbmQgNScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3V0cHV0LmFwcGVuZGVkU2luY2VWZXJzaW9uKDEsIHN0ZE91dE1pbWUpPy50b1N0cmluZygpLCAnYXBwZW5kIDRhcHBlbmQgNScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3V0cHV0LmFwcGVuZGVkU2luY2VWZXJzaW9uKDIsIHN0ZE91dE1pbWUpLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3V0cHV0LmFwcGVuZGVkU2luY2VWZXJzaW9uKDIsIHN0ZEVyck1pbWUpLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGxhY2luZyBzdHJlYW1pbmcgb3V0cHV0cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0KGVkaXRvcikgPT4ge1xuXHRcdFx0XHRjb25zdCB0ZXh0TW9kZWwgPSBlZGl0b3IudGV4dE1vZGVsO1xuXG5cdFx0XHRcdHRleHRNb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRpbmRleDogMCxcblx0XHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuT3V0cHV0LFxuXHRcdFx0XHRcdFx0YXBwZW5kOiB0cnVlLFxuXHRcdFx0XHRcdFx0b3V0cHV0czogW3tcblx0XHRcdFx0XHRcdFx0b3V0cHV0SWQ6ICdhcHBlbmQxJyxcblx0XHRcdFx0XHRcdFx0b3V0cHV0czogW3sgbWltZTogc3RkT3V0TWltZSwgZGF0YTogdmFsdWVCeXRlc0Zyb21TdHJpbmcoJ2FwcGVuZCAxJykgfV1cblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0XHRjb25zdCBbb3V0cHV0XSA9IHRleHRNb2RlbC5jZWxsc1swXS5vdXRwdXRzO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3V0cHV0LnZlcnNpb25JZCwgMCwgJ2luaXRpYWwgb3V0cHV0IHZlcnNpb24gc2hvdWxkIGJlIDAnKTtcblxuXHRcdFx0XHR0ZXh0TW9kZWwuYXBwbHlFZGl0cyhbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5PdXRwdXRJdGVtcyxcblx0XHRcdFx0XHRcdGFwcGVuZDogdHJ1ZSxcblx0XHRcdFx0XHRcdG91dHB1dElkOiAnYXBwZW5kMScsXG5cdFx0XHRcdFx0XHRpdGVtczogW3tcblx0XHRcdFx0XHRcdFx0bWltZTogc3RkT3V0TWltZSwgZGF0YTogdmFsdWVCeXRlc0Zyb21TdHJpbmcoJ2FwcGVuZCAyJylcblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3V0cHV0LnZlcnNpb25JZCwgMSwgJ3ZlcnNpb24gc2hvdWxkIGJ1bXAgcGVyIGFwcGVuZCcpO1xuXG5cdFx0XHRcdHRleHRNb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dEl0ZW1zLFxuXHRcdFx0XHRcdFx0YXBwZW5kOiBmYWxzZSxcblx0XHRcdFx0XHRcdG91dHB1dElkOiAnYXBwZW5kMScsXG5cdFx0XHRcdFx0XHRpdGVtczogW3tcblx0XHRcdFx0XHRcdFx0bWltZTogc3RkT3V0TWltZSwgZGF0YTogdmFsdWVCeXRlc0Zyb21TdHJpbmcoJ3JlcGxhY2UgMycpXG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH1dLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG91dHB1dC52ZXJzaW9uSWQsIDIsICd2ZXJzaW9uIHNob3VsZCBidW1wIHBlciByZXBsYWNlJyk7XG5cblx0XHRcdFx0dGV4dE1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuT3V0cHV0SXRlbXMsXG5cdFx0XHRcdFx0XHRhcHBlbmQ6IHRydWUsXG5cdFx0XHRcdFx0XHRvdXRwdXRJZDogJ2FwcGVuZDEnLFxuXHRcdFx0XHRcdFx0aXRlbXM6IFt7XG5cdFx0XHRcdFx0XHRcdG1pbWU6IHN0ZE91dE1pbWUsIGRhdGE6IHZhbHVlQnl0ZXNGcm9tU3RyaW5nKCdhcHBlbmQgNCcpXG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH1dLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG91dHB1dC52ZXJzaW9uSWQsIDMsICd2ZXJzaW9uIHNob3VsZCBidW1wIHBlciBhcHBlbmQnKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3V0cHV0Lm91dHB1dHNbMF0uZGF0YS50b1N0cmluZygpLCAncmVwbGFjZSAzYXBwZW5kIDQnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG91dHB1dC5hcHBlbmRlZFNpbmNlVmVyc2lvbigwLCBzdGRPdXRNaW1lKSwgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCdyZXBsYWNpbmcgb3V0cHV0IHNob3VsZCBjbGVhciBvdXQgcHJldmlvdXMgdmVyc2lvbmVkIG91dHB1dCBidWZmZXJzJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdXRwdXQuYXBwZW5kZWRTaW5jZVZlcnNpb24oMSwgc3RkT3V0TWltZSksIHVuZGVmaW5lZCxcblx0XHRcdFx0XHQncmVwbGFjaW5nIG91dHB1dCBzaG91bGQgY2xlYXIgb3V0IHByZXZpb3VzIHZlcnNpb25lZCBvdXRwdXQgYnVmZmVycycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3V0cHV0LmFwcGVuZGVkU2luY2VWZXJzaW9uKDIsIHN0ZE91dE1pbWUpPy50b1N0cmluZygpLCAnYXBwZW5kIDQnKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBlbmRpbmcgc3RyZWFtaW5nIG91dHB1dHMgd2l0aCBtb3ZlIGN1cnNvciBjb21wcmVzc2lvbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHQoZWRpdG9yKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRleHRNb2RlbCA9IGVkaXRvci50ZXh0TW9kZWw7XG5cblx0XHRcdFx0dGV4dE1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGluZGV4OiAwLFxuXHRcdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5PdXRwdXQsXG5cdFx0XHRcdFx0XHRhcHBlbmQ6IHRydWUsXG5cdFx0XHRcdFx0XHRvdXRwdXRzOiBbe1xuXHRcdFx0XHRcdFx0XHRvdXRwdXRJZDogJ2FwcGVuZDEnLFxuXHRcdFx0XHRcdFx0XHRvdXRwdXRzOiBbXG5cdFx0XHRcdFx0XHRcdFx0eyBtaW1lOiBzdGRPdXRNaW1lLCBkYXRhOiB2YWx1ZUJ5dGVzRnJvbVN0cmluZygnYXBwZW5kIDEnKSB9LFxuXHRcdFx0XHRcdFx0XHRcdHsgbWltZTogc3RkT3V0TWltZSwgZGF0YTogdmFsdWVCeXRlc0Zyb21TdHJpbmcoJ1xcbmFwcGVuZCAxJykgfV1cblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0XHRjb25zdCBbb3V0cHV0XSA9IHRleHRNb2RlbC5jZWxsc1swXS5vdXRwdXRzO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3V0cHV0LnZlcnNpb25JZCwgMCwgJ2luaXRpYWwgb3V0cHV0IHZlcnNpb24gc2hvdWxkIGJlIDAnKTtcblxuXHRcdFx0XHR0ZXh0TW9kZWwuYXBwbHlFZGl0cyhbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5PdXRwdXRJdGVtcyxcblx0XHRcdFx0XHRcdGFwcGVuZDogdHJ1ZSxcblx0XHRcdFx0XHRcdG91dHB1dElkOiAnYXBwZW5kMScsXG5cdFx0XHRcdFx0XHRpdGVtczogW3tcblx0XHRcdFx0XHRcdFx0bWltZTogc3RkT3V0TWltZSwgZGF0YTogdmFsdWVCeXRlc0Zyb21TdHJpbmcoTU9WRV9DVVJTT1JfMV9MSU5FX0NPTU1BTkQgKyAnXFxuYXBwZW5kIDInKVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdXRwdXQudmVyc2lvbklkLCAxLCAndmVyc2lvbiBzaG91bGQgYnVtcCBwZXIgYXBwZW5kJyk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG91dHB1dC5vdXRwdXRzWzBdLmRhdGEudG9TdHJpbmcoKSwgJ2FwcGVuZCAxXFxuYXBwZW5kIDInKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG91dHB1dC5hcHBlbmRlZFNpbmNlVmVyc2lvbigwLCBzdGRPdXRNaW1lKSwgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCdjb21wcmVzc2luZyBvdXRwdXRzIHNob3VsZCBjbGVhciBvdXQgcHJldmlvdXMgdmVyc2lvbmVkIG91dHB1dCBidWZmZXJzJyk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYXBwZW5kaW5nIHN0cmVhbWluZyBvdXRwdXRzIHdpdGggY2FycmFpZ2UgcmV0dXJuIGNvbXByZXNzaW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdChlZGl0b3IpID0+IHtcblx0XHRcdFx0Y29uc3QgdGV4dE1vZGVsID0gZWRpdG9yLnRleHRNb2RlbDtcblxuXHRcdFx0XHR0ZXh0TW9kZWwuYXBwbHlFZGl0cyhbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dCxcblx0XHRcdFx0XHRcdGFwcGVuZDogdHJ1ZSxcblx0XHRcdFx0XHRcdG91dHB1dHM6IFt7XG5cdFx0XHRcdFx0XHRcdG91dHB1dElkOiAnYXBwZW5kMScsXG5cdFx0XHRcdFx0XHRcdG91dHB1dHM6IFtcblx0XHRcdFx0XHRcdFx0XHR7IG1pbWU6IHN0ZE91dE1pbWUsIGRhdGE6IHZhbHVlQnl0ZXNGcm9tU3RyaW5nKCdhcHBlbmQgMScpIH0sXG5cdFx0XHRcdFx0XHRcdFx0eyBtaW1lOiBzdGRPdXRNaW1lLCBkYXRhOiB2YWx1ZUJ5dGVzRnJvbVN0cmluZygnXFxuYXBwZW5kIDEnKSB9XVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRcdGNvbnN0IFtvdXRwdXRdID0gdGV4dE1vZGVsLmNlbGxzWzBdLm91dHB1dHM7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdXRwdXQudmVyc2lvbklkLCAwLCAnaW5pdGlhbCBvdXRwdXQgdmVyc2lvbiBzaG91bGQgYmUgMCcpO1xuXG5cdFx0XHRcdHRleHRNb2RlbC5hcHBseUVkaXRzKFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dEl0ZW1zLFxuXHRcdFx0XHRcdFx0YXBwZW5kOiB0cnVlLFxuXHRcdFx0XHRcdFx0b3V0cHV0SWQ6ICdhcHBlbmQxJyxcblx0XHRcdFx0XHRcdGl0ZW1zOiBbe1xuXHRcdFx0XHRcdFx0XHRtaW1lOiBzdGRPdXRNaW1lLCBkYXRhOiB2YWx1ZUJ5dGVzRnJvbVN0cmluZygnXFxyYXBwZW5kIDInKVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdXRwdXQudmVyc2lvbklkLCAxLCAndmVyc2lvbiBzaG91bGQgYnVtcCBwZXIgYXBwZW5kJyk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG91dHB1dC5vdXRwdXRzWzBdLmRhdGEudG9TdHJpbmcoKSwgJ2FwcGVuZCAxXFxuYXBwZW5kIDInKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG91dHB1dC5hcHBlbmRlZFNpbmNlVmVyc2lvbigwLCBzdGRPdXRNaW1lKSwgdW5kZWZpbmVkLFxuXHRcdFx0XHRcdCdjb21wcmVzc2luZyBvdXRwdXRzIHNob3VsZCBjbGVhciBvdXQgcHJldmlvdXMgdmVyc2lvbmVkIG91dHB1dCBidWZmZXJzJyk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnYXBwZW5kaW5nIG11bHRpcGxlIGRpZmZlcmVudCBtaW1lIHN0cmVhbWluZyBvdXRwdXRzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHQoZWRpdG9yKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRleHRNb2RlbCA9IGVkaXRvci50ZXh0TW9kZWw7XG5cblx0XHRcdFx0dGV4dE1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGluZGV4OiAwLFxuXHRcdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5PdXRwdXQsXG5cdFx0XHRcdFx0XHRhcHBlbmQ6IHRydWUsXG5cdFx0XHRcdFx0XHRvdXRwdXRzOiBbe1xuXHRcdFx0XHRcdFx0XHRvdXRwdXRJZDogJ2FwcGVuZDEnLFxuXHRcdFx0XHRcdFx0XHRvdXRwdXRzOiBbXG5cdFx0XHRcdFx0XHRcdFx0eyBtaW1lOiBzdGRPdXRNaW1lLCBkYXRhOiB2YWx1ZUJ5dGVzRnJvbVN0cmluZygnc3Rkb3V0IDEnKSB9LFxuXHRcdFx0XHRcdFx0XHRcdHsgbWltZTogc3RkRXJyTWltZSwgZGF0YTogdmFsdWVCeXRlc0Zyb21TdHJpbmcoJ3N0ZGVyciAxJykgfVxuXHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH1dLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0Y29uc3QgW291dHB1dF0gPSB0ZXh0TW9kZWwuY2VsbHNbMF0ub3V0cHV0cztcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG91dHB1dC52ZXJzaW9uSWQsIDAsICdpbml0aWFsIG91dHB1dCB2ZXJzaW9uIHNob3VsZCBiZSAwJyk7XG5cblx0XHRcdFx0dGV4dE1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuT3V0cHV0SXRlbXMsXG5cdFx0XHRcdFx0XHRhcHBlbmQ6IHRydWUsXG5cdFx0XHRcdFx0XHRvdXRwdXRJZDogJ2FwcGVuZDEnLFxuXHRcdFx0XHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0XHRcdFx0eyBtaW1lOiBzdGRPdXRNaW1lLCBkYXRhOiB2YWx1ZUJ5dGVzRnJvbVN0cmluZygnc3Rkb3V0IDInKSB9LFxuXHRcdFx0XHRcdFx0XHR7IG1pbWU6IHN0ZEVyck1pbWUsIGRhdGE6IHZhbHVlQnl0ZXNGcm9tU3RyaW5nKCdzdGRlcnIgMicpIH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdXRwdXQudmVyc2lvbklkLCAxLCAndmVyc2lvbiBzaG91bGQgYnVtcCBwZXIgcmVwbGFjZScpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdXRwdXQuYXBwZW5kZWRTaW5jZVZlcnNpb24oMCwgc3RkRXJyTWltZSk/LnRvU3RyaW5nKCksICdzdGRlcnIgMicpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3V0cHV0LmFwcGVuZGVkU2luY2VWZXJzaW9uKDAsIHN0ZE91dE1pbWUpPy50b1N0cmluZygpLCAnc3Rkb3V0IDInKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXRhZGF0YScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0KGVkaXRvcikgPT4ge1xuXHRcdFx0XHRjb25zdCB0ZXh0TW9kZWwgPSBlZGl0b3IudGV4dE1vZGVsO1xuXG5cdFx0XHRcdC8vIGludmFsaWQgaW5kZXggMVxuXHRcdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHtcblx0XHRcdFx0XHR0ZXh0TW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRcdFx0aW5kZXg6IE51bWJlci5NQVhfVkFMVUUsXG5cdFx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk1ldGFkYXRhLFxuXHRcdFx0XHRcdFx0bWV0YWRhdGE6IHt9XG5cdFx0XHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBpbnZhbGlkIGluZGV4IDJcblx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiB7XG5cdFx0XHRcdFx0dGV4dE1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdFx0XHRcdGluZGV4OiAtMSxcblx0XHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuTWV0YWRhdGEsXG5cdFx0XHRcdFx0XHRtZXRhZGF0YToge31cblx0XHRcdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRleHRNb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5NZXRhZGF0YSxcblx0XHRcdFx0XHRtZXRhZGF0YTogeyBjdXN0b21Qcm9wZXJ0eTogMTUgfSxcblx0XHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0XHRcdHRleHRNb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5NZXRhZGF0YSxcblx0XHRcdFx0XHRtZXRhZGF0YToge30sXG5cdFx0XHRcdH1dLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dE1vZGVsLmNlbGxzLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0TW9kZWwuY2VsbHNbMF0ubWV0YWRhdGEuY3VzdG9tUHJvcGVydHksIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncGFydGlhbCBtZXRhZGF0YScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0KGVkaXRvcikgPT4ge1xuXHRcdFx0XHRjb25zdCB0ZXh0TW9kZWwgPSBlZGl0b3IudGV4dE1vZGVsO1xuXG5cdFx0XHRcdHRleHRNb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5QYXJ0aWFsTWV0YWRhdGEsXG5cdFx0XHRcdFx0bWV0YWRhdGE6IHsgY3VzdG9tUHJvcGVydHk6IDE1IH0sXG5cdFx0XHRcdH1dLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdFx0XHR0ZXh0TW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRcdGluZGV4OiAwLFxuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUGFydGlhbE1ldGFkYXRhLFxuXHRcdFx0XHRcdG1ldGFkYXRhOiB7fSxcblx0XHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0TW9kZWwuY2VsbHMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRNb2RlbC5jZWxsc1swXS5tZXRhZGF0YS5jdXN0b21Qcm9wZXJ0eSwgMTUpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpcGxlIGluc2VydHMgaW4gb25lIGVkaXQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBiID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGMgPSAzOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgZCA9IDQ7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XHRdLFxuXHRcdFx0KGVkaXRvciwgX3ZpZXdNb2RlbCwgZHMpID0+IHtcblx0XHRcdFx0Y29uc3QgdGV4dE1vZGVsID0gZWRpdG9yLnRleHRNb2RlbDtcblx0XHRcdFx0bGV0IGNoYW5nZUV2ZW50OiBOb3RlYm9va1RleHRNb2RlbENoYW5nZWRFdmVudCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0Y29uc3QgZXZlbnRMaXN0ZW5lciA9IHRleHRNb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoZSA9PiB7XG5cdFx0XHRcdFx0Y2hhbmdlRXZlbnQgPSBlO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3Qgd2lsbENoYW5nZUV2ZW50czogTm90ZWJvb2tUZXh0TW9kZWxXaWxsQWRkUmVtb3ZlRXZlbnRbXSA9IFtdO1xuXHRcdFx0XHRjb25zdCB3aWxsQ2hhbmdlTGlzdGVuZXIgPSB0ZXh0TW9kZWwub25XaWxsQWRkUmVtb3ZlQ2VsbHMoZSA9PiB7XG5cdFx0XHRcdFx0d2lsbENoYW5nZUV2ZW50cy5wdXNoKGUpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgdmVyc2lvbiA9IHRleHRNb2RlbC52ZXJzaW9uSWQ7XG5cblx0XHRcdFx0dGV4dE1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0XHRcdHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMSwgY291bnQ6IDEsIGNlbGxzOiBbXSB9LFxuXHRcdFx0XHRcdHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMSwgY291bnQ6IDAsIGNlbGxzOiBbZHMuYWRkKG5ldyBUZXN0Q2VsbCh0ZXh0TW9kZWwudmlld1R5cGUsIDUsICd2YXIgZSA9IDU7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwgbGFuZ3VhZ2VTZXJ2aWNlKSldIH0sXG5cdFx0XHRcdF0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gKHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogeyBzdGFydDogMCwgZW5kOiAxIH0sIHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiAwLCBlbmQ6IDEgfV0gfSksIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRNb2RlbC5jZWxscy5sZW5ndGgsIDQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dE1vZGVsLmNlbGxzWzBdLmdldFZhbHVlKCksICd2YXIgYSA9IDE7Jyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0TW9kZWwuY2VsbHNbMV0uZ2V0VmFsdWUoKSwgJ3ZhciBlID0gNTsnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRNb2RlbC5jZWxsc1syXS5nZXRWYWx1ZSgpLCAndmFyIGMgPSAzOycpO1xuXG5cdFx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChjaGFuZ2VFdmVudCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUV2ZW50IS5yYXdFdmVudHMubGVuZ3RoLCAyKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGFuZ2VFdmVudCEuZW5kU2VsZWN0aW9uU3RhdGU/LnNlbGVjdGlvbnMsIFt7IHN0YXJ0OiAwLCBlbmQ6IDEgfV0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lsbENoYW5nZUV2ZW50cy5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dE1vZGVsLnZlcnNpb25JZCwgdmVyc2lvbiArIDEpO1xuXHRcdFx0XHRldmVudExpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdFx0d2lsbENoYW5nZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbnNlcnQgYW5kIG1ldGFkYXRhIGNoYW5nZSBpbiBvbmUgZWRpdCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYyA9IDM7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBkID0gNDsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHQoZWRpdG9yKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRleHRNb2RlbCA9IGVkaXRvci50ZXh0TW9kZWw7XG5cdFx0XHRcdGxldCBjaGFuZ2VFdmVudDogTm90ZWJvb2tUZXh0TW9kZWxDaGFuZ2VkRXZlbnQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IGV2ZW50TGlzdGVuZXIgPSB0ZXh0TW9kZWwub25EaWRDaGFuZ2VDb250ZW50KGUgPT4ge1xuXHRcdFx0XHRcdGNoYW5nZUV2ZW50ID0gZTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IHdpbGxDaGFuZ2VFdmVudHM6IE5vdGVib29rVGV4dE1vZGVsV2lsbEFkZFJlbW92ZUV2ZW50W10gPSBbXTtcblx0XHRcdFx0Y29uc3Qgd2lsbENoYW5nZUxpc3RlbmVyID0gdGV4dE1vZGVsLm9uV2lsbEFkZFJlbW92ZUNlbGxzKGUgPT4ge1xuXHRcdFx0XHRcdHdpbGxDaGFuZ2VFdmVudHMucHVzaChlKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Y29uc3QgdmVyc2lvbiA9IHRleHRNb2RlbC52ZXJzaW9uSWQ7XG5cblx0XHRcdFx0dGV4dE1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0XHRcdHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMSwgY291bnQ6IDEsIGNlbGxzOiBbXSB9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGluZGV4OiAwLFxuXHRcdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5NZXRhZGF0YSxcblx0XHRcdFx0XHRcdG1ldGFkYXRhOiB7fSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gKHsga2luZDogU2VsZWN0aW9uU3RhdGVUeXBlLkluZGV4LCBmb2N1czogeyBzdGFydDogMCwgZW5kOiAxIH0sIHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiAwLCBlbmQ6IDEgfV0gfSksIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGNoYW5nZUV2ZW50LCB1bmRlZmluZWQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlRXZlbnQhLnJhd0V2ZW50cy5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoYW5nZUV2ZW50IS5lbmRTZWxlY3Rpb25TdGF0ZT8uc2VsZWN0aW9ucywgW3sgc3RhcnQ6IDAsIGVuZDogMSB9XSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWxsQ2hhbmdlRXZlbnRzLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0TW9kZWwudmVyc2lvbklkLCB2ZXJzaW9uICsgMSk7XG5cdFx0XHRcdGV2ZW50TGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHR3aWxsQ2hhbmdlTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cblx0dGVzdCgnVXBkYXRpbmcgYXBwZW5kaW5nL3VwZGF0aW5nIG91dHB1dCBpbiBOb3RlYm9va3MgZG9lcyBub3Qgd29yayBhcyBleHBlY3RlZCAjMTE3MjczJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soW1xuXHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XSwgKGVkaXRvcikgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IudGV4dE1vZGVsO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY2VsbHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jZWxsc1swXS5vdXRwdXRzLmxlbmd0aCwgMCk7XG5cblx0XHRcdGNvbnN0IHN1Y2Nlc3MxID0gbW9kZWwuYXBwbHlFZGl0cyhcblx0XHRcdFx0W3tcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dCwgaW5kZXg6IDAsIG91dHB1dHM6IFtcblx0XHRcdFx0XHRcdHsgb3V0cHV0SWQ6ICdvdXQxJywgb3V0cHV0czogW3sgbWltZTogJ2FwcGxpY2F0aW9uL3gubm90ZWJvb2suc3RyZWFtJywgZGF0YTogVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShbMV0pKSB9XSB9XG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRhcHBlbmQ6IGZhbHNlXG5cdFx0XHRcdH1dLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBmYWxzZVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHN1Y2Nlc3MxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jZWxsc1swXS5vdXRwdXRzLmxlbmd0aCwgMSk7XG5cblx0XHRcdGNvbnN0IHN1Y2Nlc3MyID0gbW9kZWwuYXBwbHlFZGl0cyhcblx0XHRcdFx0W3tcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dCwgaW5kZXg6IDAsIG91dHB1dHM6IFtcblx0XHRcdFx0XHRcdHsgb3V0cHV0SWQ6ICdvdXQyJywgb3V0cHV0czogW3sgbWltZTogJ2FwcGxpY2F0aW9uL3gubm90ZWJvb2suc3RyZWFtJywgZGF0YTogVlNCdWZmZXIud3JhcChuZXcgVWludDhBcnJheShbMV0pKSB9XSB9XG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRhcHBlbmQ6IHRydWVcblx0XHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIGZhbHNlXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQub2soc3VjY2VzczIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmNlbGxzWzBdLm91dHB1dHMubGVuZ3RoLCAyKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQ2xlYXJpbmcgb3V0cHV0IG9mIGFuIGVtcHR5IG5vdGVib29rIG1ha2VzIGl0IGRpcnR5ICMxMTk2MDgnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhbXG5cdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRbJ3ZhciBiID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRdLCAoZWRpdG9yLCBfLCBkcykgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IudGV4dE1vZGVsO1xuXG5cdFx0XHRsZXQgZXZlbnQ6IE5vdGVib29rVGV4dE1vZGVsQ2hhbmdlZEV2ZW50IHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRkcy5hZGQobW9kZWwub25EaWRDaGFuZ2VDb250ZW50KGUgPT4geyBldmVudCA9IGU7IH0pKTtcblxuXHRcdFx0e1xuXHRcdFx0XHQvLyAxOiBhZGQgb3VwdXQgLT4gZXZlbnRcblx0XHRcdFx0Y29uc3Qgc3VjY2VzcyA9IG1vZGVsLmFwcGx5RWRpdHMoXG5cdFx0XHRcdFx0W3tcblx0XHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuT3V0cHV0LCBpbmRleDogMCwgb3V0cHV0czogW1xuXHRcdFx0XHRcdFx0XHR7IG91dHB1dElkOiAnb3V0MScsIG91dHB1dHM6IFt7IG1pbWU6ICdhcHBsaWNhdGlvbi94Lm5vdGVib29rLnN0cmVhbScsIGRhdGE6IFZTQnVmZmVyLndyYXAobmV3IFVpbnQ4QXJyYXkoWzFdKSkgfV0gfVxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdGFwcGVuZDogZmFsc2Vcblx0XHRcdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZmFsc2Vcblx0XHRcdFx0KTtcblxuXHRcdFx0XHRhc3NlcnQub2soc3VjY2Vzcyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jZWxsc1swXS5vdXRwdXRzLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5vayhldmVudCk7XG5cdFx0XHR9XG5cblx0XHRcdHtcblx0XHRcdFx0Ly8gMjogY2xlYXIgYWxsIG91dHB1dCB3LyBvdXRwdXQgLT4gZXZlbnRcblx0XHRcdFx0ZXZlbnQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGNvbnN0IHN1Y2Nlc3MgPSBtb2RlbC5hcHBseUVkaXRzKFxuXHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dCxcblx0XHRcdFx0XHRcdGluZGV4OiAwLFxuXHRcdFx0XHRcdFx0b3V0cHV0czogW10sXG5cdFx0XHRcdFx0XHRhcHBlbmQ6IGZhbHNlXG5cdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5PdXRwdXQsXG5cdFx0XHRcdFx0XHRpbmRleDogMSxcblx0XHRcdFx0XHRcdG91dHB1dHM6IFtdLFxuXHRcdFx0XHRcdFx0YXBwZW5kOiBmYWxzZVxuXHRcdFx0XHRcdH1dLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBmYWxzZVxuXHRcdFx0XHQpO1xuXHRcdFx0XHRhc3NlcnQub2soc3VjY2Vzcyk7XG5cdFx0XHRcdGFzc2VydC5vayhldmVudCk7XG5cdFx0XHR9XG5cblx0XHRcdHtcblx0XHRcdFx0Ly8gMjogY2xlYXIgYWxsIG91dHB1dCB3by8gb3V0cHV0IC0+IE5PIGV2ZW50XG5cdFx0XHRcdGV2ZW50ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBzdWNjZXNzID0gbW9kZWwuYXBwbHlFZGl0cyhcblx0XHRcdFx0XHRbe1xuXHRcdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5PdXRwdXQsXG5cdFx0XHRcdFx0XHRpbmRleDogMCxcblx0XHRcdFx0XHRcdG91dHB1dHM6IFtdLFxuXHRcdFx0XHRcdFx0YXBwZW5kOiBmYWxzZVxuXHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuT3V0cHV0LFxuXHRcdFx0XHRcdFx0aW5kZXg6IDEsXG5cdFx0XHRcdFx0XHRvdXRwdXRzOiBbXSxcblx0XHRcdFx0XHRcdGFwcGVuZDogZmFsc2Vcblx0XHRcdFx0XHR9XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgZmFsc2Vcblx0XHRcdFx0KTtcblxuXHRcdFx0XHRhc3NlcnQub2soc3VjY2Vzcyk7XG5cdFx0XHRcdGFzc2VydC5vayhldmVudCA9PT0gdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnQ2VsbCBtZXRhZGF0YS9vdXRwdXQgY2hhbmdlIHNob3VsZCB1cGRhdGUgdmVyc2lvbiBpZCBhbmQgYWx0ZXJuYXRpdmUgaWQgIzEyMTgwNycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFtcblx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdF0sIGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci50ZXh0TW9kZWwudmVyc2lvbklkLCAwKTtcblx0XHRcdGNvbnN0IGZpcnN0QWx0VmVyc2lvbiA9ICcwXzAsMTsxLDEnO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci50ZXh0TW9kZWwuYWx0ZXJuYXRpdmVWZXJzaW9uSWQsIGZpcnN0QWx0VmVyc2lvbik7XG5cdFx0XHRlZGl0b3IudGV4dE1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5NZXRhZGF0YSxcblx0XHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdFx0aW5wdXRDb2xsYXBzZWQ6IHRydWVcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdF0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci50ZXh0TW9kZWwudmVyc2lvbklkLCAxKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChlZGl0b3IudGV4dE1vZGVsLmFsdGVybmF0aXZlVmVyc2lvbklkLCBmaXJzdEFsdFZlcnNpb24pO1xuXHRcdFx0Y29uc3Qgc2Vjb25kQWx0VmVyc2lvbiA9ICcxXzAsMTsxLDEnO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci50ZXh0TW9kZWwuYWx0ZXJuYXRpdmVWZXJzaW9uSWQsIHNlY29uZEFsdFZlcnNpb24pO1xuXG5cdFx0XHRhd2FpdCB2aWV3TW9kZWwudW5kbygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci50ZXh0TW9kZWwudmVyc2lvbklkLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IudGV4dE1vZGVsLmFsdGVybmF0aXZlVmVyc2lvbklkLCBmaXJzdEFsdFZlcnNpb24pO1xuXG5cdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVkbygpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci50ZXh0TW9kZWwudmVyc2lvbklkLCAzKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChlZGl0b3IudGV4dE1vZGVsLmFsdGVybmF0aXZlVmVyc2lvbklkLCBmaXJzdEFsdFZlcnNpb24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci50ZXh0TW9kZWwuYWx0ZXJuYXRpdmVWZXJzaW9uSWQsIHNlY29uZEFsdFZlcnNpb24pO1xuXG5cdFx0XHRlZGl0b3IudGV4dE1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aW5kZXg6IDEsXG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5NZXRhZGF0YSxcblx0XHRcdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRcdFx0aW5wdXRDb2xsYXBzZWQ6IHRydWVcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdF0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci50ZXh0TW9kZWwudmVyc2lvbklkLCA0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0b3IudGV4dE1vZGVsLmFsdGVybmF0aXZlVmVyc2lvbklkLCAnNF8wLDE7MSwxJyk7XG5cblx0XHRcdGF3YWl0IHZpZXdNb2RlbC51bmRvKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLnRleHRNb2RlbC52ZXJzaW9uSWQsIDUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci50ZXh0TW9kZWwuYWx0ZXJuYXRpdmVWZXJzaW9uSWQsIHNlY29uZEFsdFZlcnNpb24pO1xuXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21ldGFkYXRhIGNoYW5nZXMgb24gbmV3bHkgYWRkZWQgY2VsbHMgc2hvdWxkIGNvbWJpbmUgdGhlaXIgdW5kbyBvcGVyYXRpb25zJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soW1xuXHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XSwgYXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBkcykgPT4ge1xuXHRcdFx0Y29uc3QgdGV4dE1vZGVsID0gZWRpdG9yLnRleHRNb2RlbDtcblx0XHRcdGVkaXRvci50ZXh0TW9kZWwuYXBwbHlFZGl0cyhbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAxLCBjb3VudDogMCwgY2VsbHM6IFtcblx0XHRcdFx0XHRcdGRzLmFkZChuZXcgVGVzdENlbGwodGV4dE1vZGVsLnZpZXdUeXBlLCAxLCAndmFyIGUgPSA1OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIGxhbmd1YWdlU2VydmljZSkpLFxuXHRcdFx0XHRcdFx0ZHMuYWRkKG5ldyBUZXN0Q2VsbCh0ZXh0TW9kZWwudmlld1R5cGUsIDIsICd2YXIgZiA9IDY7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwgbGFuZ3VhZ2VTZXJ2aWNlKSlcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRdLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRNb2RlbC5jZWxscy5sZW5ndGgsIDMpO1xuXG5cdFx0XHRlZGl0b3IudGV4dE1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuTWV0YWRhdGEsIGluZGV4OiAxLCBtZXRhZGF0YTogeyBpZDogJzEyMycgfSB9LFxuXHRcdFx0XSwgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0TW9kZWwuY2VsbHNbMV0ubWV0YWRhdGEuaWQsICcxMjMnKTtcblxuXHRcdFx0YXdhaXQgdmlld01vZGVsLnVuZG8oKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRNb2RlbC5jZWxscy5sZW5ndGgsIDEpO1xuXG5cdFx0XHRhd2FpdCB2aWV3TW9kZWwucmVkbygpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dE1vZGVsLmNlbGxzLmxlbmd0aCwgMyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoYW5nZXMgd2l0aCBub24tbWV0YWRhdGEgZWRpdCBzaG91bGQgbm90IGNvbWJpbmUgdGhlaXIgdW5kbyBvcGVyYXRpb25zJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soW1xuXHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XSwgYXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBkcykgPT4ge1xuXHRcdFx0Y29uc3QgdGV4dE1vZGVsID0gZWRpdG9yLnRleHRNb2RlbDtcblx0XHRcdGVkaXRvci50ZXh0TW9kZWwuYXBwbHlFZGl0cyhbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAxLCBjb3VudDogMCwgY2VsbHM6IFtcblx0XHRcdFx0XHRcdGRzLmFkZChuZXcgVGVzdENlbGwodGV4dE1vZGVsLnZpZXdUeXBlLCAxLCAndmFyIGUgPSA1OycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIGxhbmd1YWdlU2VydmljZSkpLFxuXHRcdFx0XHRcdFx0ZHMuYWRkKG5ldyBUZXN0Q2VsbCh0ZXh0TW9kZWwudmlld1R5cGUsIDIsICd2YXIgZiA9IDY7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwgbGFuZ3VhZ2VTZXJ2aWNlKSlcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRdLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRNb2RlbC5jZWxscy5sZW5ndGgsIDMpO1xuXG5cdFx0XHRlZGl0b3IudGV4dE1vZGVsLmFwcGx5RWRpdHMoW1xuXHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuTWV0YWRhdGEsIGluZGV4OiAxLCBtZXRhZGF0YTogeyBpZDogJzEyMycgfSB9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5PdXRwdXQsIGhhbmRsZTogMCwgYXBwZW5kOiB0cnVlLCBvdXRwdXRzOiBbe1xuXHRcdFx0XHRcdFx0b3V0cHV0SWQ6ICduZXdPdXRwdXQnLFxuXHRcdFx0XHRcdFx0b3V0cHV0czogW3sgbWltZTogTWltZXMudGV4dCwgZGF0YTogdmFsdWVCeXRlc0Zyb21TdHJpbmcoJ2NiYScpIH0sIHsgbWltZTogJ2FwcGxpY2F0aW9uL2ZvbycsIGRhdGE6IHZhbHVlQnl0ZXNGcm9tU3RyaW5nKCdjYmEnKSB9XVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH1cblx0XHRcdF0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGV4dE1vZGVsLmNlbGxzWzFdLm1ldGFkYXRhLmlkLCAnMTIzJyk7XG5cblx0XHRcdGF3YWl0IHZpZXdNb2RlbC51bmRvKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0TW9kZWwuY2VsbHMubGVuZ3RoLCAzKTtcblxuXHRcdFx0YXdhaXQgdmlld01vZGVsLnVuZG8oKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRNb2RlbC5jZWxscy5sZW5ndGgsIDEpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdEZXN0cnVjdGl2ZSBzb3J0aW5nIGluIF9kb0FwcGx5RWRpdHMgIzEyMTk5NCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFtcblx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW3sgb3V0cHV0SWQ6ICdpNDInLCBvdXRwdXRzOiBbeyBtaW1lOiAnbS9pbWUnLCBkYXRhOiB2YWx1ZUJ5dGVzRnJvbVN0cmluZygndGVzdCcpIH1dIH1dLCB7fV1cblx0XHRdLCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cblx0XHRcdGNvbnN0IG5vdGVib29rID0gZWRpdG9yLnRleHRNb2RlbDtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmNlbGxzWzBdLm91dHB1dHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5jZWxsc1swXS5vdXRwdXRzWzBdLm91dHB1dHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobm90ZWJvb2suY2VsbHNbMF0ub3V0cHV0c1swXS5vdXRwdXRzWzBdLmRhdGEsIHZhbHVlQnl0ZXNGcm9tU3RyaW5nKCd0ZXN0JykpO1xuXG5cdFx0XHRjb25zdCBlZGl0czogSUNlbGxFZGl0T3BlcmF0aW9uW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dCwgaGFuZGxlOiAwLCBvdXRwdXRzOiBbXVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5PdXRwdXQsIGhhbmRsZTogMCwgYXBwZW5kOiB0cnVlLCBvdXRwdXRzOiBbe1xuXHRcdFx0XHRcdFx0b3V0cHV0SWQ6ICduZXdPdXRwdXQnLFxuXHRcdFx0XHRcdFx0b3V0cHV0czogW3sgbWltZTogTWltZXMudGV4dCwgZGF0YTogdmFsdWVCeXRlc0Zyb21TdHJpbmcoJ2NiYScpIH0sIHsgbWltZTogJ2FwcGxpY2F0aW9uL2ZvbycsIGRhdGE6IHZhbHVlQnl0ZXNGcm9tU3RyaW5nKCdjYmEnKSB9XVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH1cblx0XHRcdF07XG5cblx0XHRcdGVkaXRvci50ZXh0TW9kZWwuYXBwbHlFZGl0cyhlZGl0cywgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5jZWxsc1swXS5vdXRwdXRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suY2VsbHNbMF0ub3V0cHV0c1swXS5vdXRwdXRzLmxlbmd0aCwgMik7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0Rlc3RydWN0aXZlIHNvcnRpbmcgaW4gX2RvQXBwbHlFZGl0cyAjMTIxOTk0LiBjZWxsIHNwbGljZSBiZXR3ZWVuIG91dHB1dCBjaGFuZ2VzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soW1xuXHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbeyBvdXRwdXRJZDogJ2k0MicsIG91dHB1dHM6IFt7IG1pbWU6ICdtL2ltZScsIGRhdGE6IHZhbHVlQnl0ZXNGcm9tU3RyaW5nKCd0ZXN0JykgfV0gfV0sIHt9XSxcblx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW3sgb3V0cHV0SWQ6ICdpNDMnLCBvdXRwdXRzOiBbeyBtaW1lOiAnbS9pbWUnLCBkYXRhOiB2YWx1ZUJ5dGVzRnJvbVN0cmluZygndGVzdCcpIH1dIH1dLCB7fV0sXG5cdFx0XHRbJ3ZhciBjID0gMzsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFt7IG91dHB1dElkOiAnaTQ0Jywgb3V0cHV0czogW3sgbWltZTogJ20vaW1lJywgZGF0YTogdmFsdWVCeXRlc0Zyb21TdHJpbmcoJ3Rlc3QnKSB9XSB9XSwge31dXG5cdFx0XSwgYXN5bmMgKGVkaXRvcikgPT4ge1xuXHRcdFx0Y29uc3Qgbm90ZWJvb2sgPSBlZGl0b3IudGV4dE1vZGVsO1xuXG5cdFx0XHRjb25zdCBlZGl0czogSUNlbGxFZGl0T3BlcmF0aW9uW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dCwgaW5kZXg6IDAsIG91dHB1dHM6IFtdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAxLCBjb3VudDogMSwgY2VsbHM6IFtdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dCwgaW5kZXg6IDIsIGFwcGVuZDogdHJ1ZSwgb3V0cHV0czogW3tcblx0XHRcdFx0XHRcdG91dHB1dElkOiAnbmV3T3V0cHV0Jyxcblx0XHRcdFx0XHRcdG91dHB1dHM6IFt7IG1pbWU6IE1pbWVzLnRleHQsIGRhdGE6IHZhbHVlQnl0ZXNGcm9tU3RyaW5nKCdjYmEnKSB9LCB7IG1pbWU6ICdhcHBsaWNhdGlvbi9mb28nLCBkYXRhOiB2YWx1ZUJ5dGVzRnJvbVN0cmluZygnY2JhJykgfV1cblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9XG5cdFx0XHRdO1xuXG5cdFx0XHRlZGl0b3IudGV4dE1vZGVsLmFwcGx5RWRpdHMoZWRpdHMsIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suY2VsbHMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5jZWxsc1swXS5vdXRwdXRzLmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suY2VsbHNbMV0ub3V0cHV0cy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmNlbGxzWzFdLm91dHB1dHNbMF0ub3V0cHV0SWQsICdpNDQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5jZWxsc1sxXS5vdXRwdXRzWzFdLm91dHB1dElkLCAnbmV3T3V0cHV0Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0Rlc3RydWN0aXZlIHNvcnRpbmcgaW4gX2RvQXBwbHlFZGl0cyAjMTIxOTk0LiBjZWxsIHNwbGljZSBiZXR3ZWVuIG91dHB1dCBjaGFuZ2VzIDInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhbXG5cdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFt7IG91dHB1dElkOiAnaTQyJywgb3V0cHV0czogW3sgbWltZTogJ20vaW1lJywgZGF0YTogdmFsdWVCeXRlc0Zyb21TdHJpbmcoJ3Rlc3QnKSB9XSB9XSwge31dLFxuXHRcdFx0Wyd2YXIgYiA9IDI7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbeyBvdXRwdXRJZDogJ2k0MycsIG91dHB1dHM6IFt7IG1pbWU6ICdtL2ltZScsIGRhdGE6IHZhbHVlQnl0ZXNGcm9tU3RyaW5nKCd0ZXN0JykgfV0gfV0sIHt9XSxcblx0XHRcdFsndmFyIGMgPSAzOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW3sgb3V0cHV0SWQ6ICdpNDQnLCBvdXRwdXRzOiBbeyBtaW1lOiAnbS9pbWUnLCBkYXRhOiB2YWx1ZUJ5dGVzRnJvbVN0cmluZygndGVzdCcpIH1dIH1dLCB7fV1cblx0XHRdLCBhc3luYyAoZWRpdG9yKSA9PiB7XG5cdFx0XHRjb25zdCBub3RlYm9vayA9IGVkaXRvci50ZXh0TW9kZWw7XG5cblx0XHRcdGNvbnN0IGVkaXRzOiBJQ2VsbEVkaXRPcGVyYXRpb25bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuT3V0cHV0LCBpbmRleDogMSwgYXBwZW5kOiB0cnVlLCBvdXRwdXRzOiBbe1xuXHRcdFx0XHRcdFx0b3V0cHV0SWQ6ICduZXdPdXRwdXQnLFxuXHRcdFx0XHRcdFx0b3V0cHV0czogW3sgbWltZTogTWltZXMudGV4dCwgZGF0YTogdmFsdWVCeXRlc0Zyb21TdHJpbmcoJ2NiYScpIH0sIHsgbWltZTogJ2FwcGxpY2F0aW9uL2ZvbycsIGRhdGE6IHZhbHVlQnl0ZXNGcm9tU3RyaW5nKCdjYmEnKSB9XVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAxLCBjb3VudDogMSwgY2VsbHM6IFtdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dCwgaW5kZXg6IDEsIGFwcGVuZDogdHJ1ZSwgb3V0cHV0czogW3tcblx0XHRcdFx0XHRcdG91dHB1dElkOiAnbmV3T3V0cHV0MicsXG5cdFx0XHRcdFx0XHRvdXRwdXRzOiBbeyBtaW1lOiBNaW1lcy50ZXh0LCBkYXRhOiB2YWx1ZUJ5dGVzRnJvbVN0cmluZygnY2JhJykgfSwgeyBtaW1lOiAnYXBwbGljYXRpb24vZm9vJywgZGF0YTogdmFsdWVCeXRlc0Zyb21TdHJpbmcoJ2NiYScpIH1dXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fVxuXHRcdFx0XTtcblxuXHRcdFx0ZWRpdG9yLnRleHRNb2RlbC5hcHBseUVkaXRzKGVkaXRzLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmNlbGxzLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suY2VsbHNbMF0ub3V0cHV0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmNlbGxzWzFdLm91dHB1dHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5jZWxsc1sxXS5vdXRwdXRzWzBdLm91dHB1dElkLCAnaTQ0Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ091dHB1dCBlZGl0cyBzcGxpY2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhbXG5cdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRdLCAoZWRpdG9yKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci50ZXh0TW9kZWw7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jZWxscy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmNlbGxzWzBdLm91dHB1dHMubGVuZ3RoLCAwKTtcblxuXHRcdFx0Y29uc3Qgc3VjY2VzczEgPSBtb2RlbC5hcHBseUVkaXRzKFxuXHRcdFx0XHRbe1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuT3V0cHV0LCBpbmRleDogMCwgb3V0cHV0czogW1xuXHRcdFx0XHRcdFx0eyBvdXRwdXRJZDogJ291dDEnLCBvdXRwdXRzOiBbeyBtaW1lOiAnYXBwbGljYXRpb24veC5ub3RlYm9vay5zdHJlYW0nLCBkYXRhOiB2YWx1ZUJ5dGVzRnJvbVN0cmluZygnMScpIH1dIH0sXG5cdFx0XHRcdFx0XHR7IG91dHB1dElkOiAnb3V0MicsIG91dHB1dHM6IFt7IG1pbWU6ICdhcHBsaWNhdGlvbi94Lm5vdGVib29rLnN0cmVhbScsIGRhdGE6IHZhbHVlQnl0ZXNGcm9tU3RyaW5nKCcyJykgfV0gfSxcblx0XHRcdFx0XHRcdHsgb3V0cHV0SWQ6ICdvdXQzJywgb3V0cHV0czogW3sgbWltZTogJ2FwcGxpY2F0aW9uL3gubm90ZWJvb2suc3RyZWFtJywgZGF0YTogdmFsdWVCeXRlc0Zyb21TdHJpbmcoJzMnKSB9XSB9LFxuXHRcdFx0XHRcdFx0eyBvdXRwdXRJZDogJ291dDQnLCBvdXRwdXRzOiBbeyBtaW1lOiAnYXBwbGljYXRpb24veC5ub3RlYm9vay5zdHJlYW0nLCBkYXRhOiB2YWx1ZUJ5dGVzRnJvbVN0cmluZygnNCcpIH1dIH1cblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGFwcGVuZDogZmFsc2Vcblx0XHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIGZhbHNlXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQub2soc3VjY2VzczEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmNlbGxzWzBdLm91dHB1dHMubGVuZ3RoLCA0KTtcblxuXHRcdFx0Y29uc3Qgc3VjY2VzczIgPSBtb2RlbC5hcHBseUVkaXRzKFxuXHRcdFx0XHRbe1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuT3V0cHV0LCBpbmRleDogMCwgb3V0cHV0czogW1xuXHRcdFx0XHRcdFx0eyBvdXRwdXRJZDogJ291dDEnLCBvdXRwdXRzOiBbeyBtaW1lOiAnYXBwbGljYXRpb24veC5ub3RlYm9vay5zdHJlYW0nLCBkYXRhOiB2YWx1ZUJ5dGVzRnJvbVN0cmluZygnMScpIH1dIH0sXG5cdFx0XHRcdFx0XHR7IG91dHB1dElkOiAnb3V0NScsIG91dHB1dHM6IFt7IG1pbWU6ICdhcHBsaWNhdGlvbi94Lm5vdGVib29rLnN0cmVhbScsIGRhdGE6IHZhbHVlQnl0ZXNGcm9tU3RyaW5nKCc1JykgfV0gfSxcblx0XHRcdFx0XHRcdHsgb3V0cHV0SWQ6ICdvdXQzJywgb3V0cHV0czogW3sgbWltZTogJ2FwcGxpY2F0aW9uL3gubm90ZWJvb2suc3RyZWFtJywgZGF0YTogdmFsdWVCeXRlc0Zyb21TdHJpbmcoJzMnKSB9XSB9LFxuXHRcdFx0XHRcdFx0eyBvdXRwdXRJZDogJ291dDYnLCBvdXRwdXRzOiBbeyBtaW1lOiAnYXBwbGljYXRpb24veC5ub3RlYm9vay5zdHJlYW0nLCBkYXRhOiB2YWx1ZUJ5dGVzRnJvbVN0cmluZygnNicpIH1dIH1cblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGFwcGVuZDogZmFsc2Vcblx0XHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIGZhbHNlXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQub2soc3VjY2VzczIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmNlbGxzWzBdLm91dHB1dHMubGVuZ3RoLCA0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jZWxsc1swXS5vdXRwdXRzWzBdLm91dHB1dElkLCAnb3V0MScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmNlbGxzWzBdLm91dHB1dHNbMV0ub3V0cHV0SWQsICdvdXQ1Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY2VsbHNbMF0ub3V0cHV0c1syXS5vdXRwdXRJZCwgJ291dDMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jZWxsc1swXS5vdXRwdXRzWzNdLm91dHB1dElkLCAnb3V0NicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wdXRlRWRpdHMgbm8gaW5zZXJ0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soW1xuXHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XSwgKGVkaXRvcikgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IudGV4dE1vZGVsO1xuXHRcdFx0Y29uc3QgZWRpdHMgPSBOb3RlYm9va1RleHRNb2RlbC5jb21wdXRlRWRpdHMobW9kZWwsIFtcblx0XHRcdFx0eyBzb3VyY2U6ICd2YXIgYSA9IDE7JywgbGFuZ3VhZ2U6ICdqYXZhc2NyaXB0JywgY2VsbEtpbmQ6IENlbGxLaW5kLkNvZGUsIG1pbWU6IHVuZGVmaW5lZCwgb3V0cHV0czogW10sIG1ldGFkYXRhOiB1bmRlZmluZWQgfVxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdHMsIFtcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk1ldGFkYXRhLCBpbmRleDogMCwgbWV0YWRhdGE6IHt9IH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wdXRlRWRpdHMgY2VsbCBjb250ZW50IGNoYW5nZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhbXG5cdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRdLCAoZWRpdG9yKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci50ZXh0TW9kZWw7XG5cdFx0XHRjb25zdCBjZWxscyA9IFtcblx0XHRcdFx0eyBzb3VyY2U6ICd2YXIgYSA9IDI7JywgbGFuZ3VhZ2U6ICdqYXZhc2NyaXB0JywgY2VsbEtpbmQ6IENlbGxLaW5kLkNvZGUsIG1pbWU6IHVuZGVmaW5lZCwgb3V0cHV0czogW10sIG1ldGFkYXRhOiB1bmRlZmluZWQgfVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGVkaXRzID0gTm90ZWJvb2tUZXh0TW9kZWwuY29tcHV0ZUVkaXRzKG1vZGVsLCBjZWxscyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdHMsIFtcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAwLCBjb3VudDogMSwgY2VsbHMgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wdXRlRWRpdHMgbGFzdCBjZWxsIGNvbnRlbnQgY2hhbmdlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFtcblx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdF0sIChlZGl0b3IpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLnRleHRNb2RlbDtcblx0XHRcdGNvbnN0IGNlbGxzID0gW1xuXHRcdFx0XHR7IHNvdXJjZTogJ3ZhciBhID0gMTsnLCBsYW5ndWFnZTogJ2phdmFzY3JpcHQnLCBjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSwgbWltZTogdW5kZWZpbmVkLCBvdXRwdXRzOiBbXSwgbWV0YWRhdGE6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR7IHNvdXJjZTogJ3ZhciBiID0gMjsnLCBsYW5ndWFnZTogJ2phdmFzY3JpcHQnLCBjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSwgbWltZTogdW5kZWZpbmVkLCBvdXRwdXRzOiBbXSwgbWV0YWRhdGE6IHVuZGVmaW5lZCB9XG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgZWRpdHMgPSBOb3RlYm9va1RleHRNb2RlbC5jb21wdXRlRWRpdHMobW9kZWwsIGNlbGxzKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0cywgW1xuXHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuTWV0YWRhdGEsIGluZGV4OiAwLCBtZXRhZGF0YToge30gfSxcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAxLCBjb3VudDogMSwgY2VsbHM6IGNlbGxzLnNsaWNlKDEpIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cdHRlc3QoJ2NvbXB1dGVFZGl0cyBmaXJzdCBjZWxsIGNvbnRlbnQgY2hhbmdlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFtcblx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdF0sIChlZGl0b3IpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLnRleHRNb2RlbDtcblx0XHRcdGNvbnN0IGNlbGxzID0gW1xuXHRcdFx0XHR7IHNvdXJjZTogJ3ZhciBhID0gMjsnLCBsYW5ndWFnZTogJ2phdmFzY3JpcHQnLCBjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSwgbWltZTogdW5kZWZpbmVkLCBvdXRwdXRzOiBbXSwgbWV0YWRhdGE6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR7IHNvdXJjZTogJ3ZhciBiID0gMTsnLCBsYW5ndWFnZTogJ2phdmFzY3JpcHQnLCBjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSwgbWltZTogdW5kZWZpbmVkLCBvdXRwdXRzOiBbXSwgbWV0YWRhdGE6IHVuZGVmaW5lZCB9XG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgZWRpdHMgPSBOb3RlYm9va1RleHRNb2RlbC5jb21wdXRlRWRpdHMobW9kZWwsIGNlbGxzKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0cywgW1xuXHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDAsIGNvdW50OiAxLCBjZWxsczogY2VsbHMuc2xpY2UoMCwgMSkgfSxcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk1ldGFkYXRhLCBpbmRleDogMSwgbWV0YWRhdGE6IHt9IH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29tcHV0ZUVkaXRzIG1pZGRsZSBjZWxsIGNvbnRlbnQgY2hhbmdlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFtcblx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGMgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRdLCAoZWRpdG9yKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci50ZXh0TW9kZWw7XG5cdFx0XHRjb25zdCBjZWxscyA9IFtcblx0XHRcdFx0eyBzb3VyY2U6ICd2YXIgYSA9IDE7JywgbGFuZ3VhZ2U6ICdqYXZhc2NyaXB0JywgY2VsbEtpbmQ6IENlbGxLaW5kLkNvZGUsIG1pbWU6IHVuZGVmaW5lZCwgb3V0cHV0czogW10sIG1ldGFkYXRhOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0eyBzb3VyY2U6ICd2YXIgYiA9IDI7JywgbGFuZ3VhZ2U6ICdqYXZhc2NyaXB0JywgY2VsbEtpbmQ6IENlbGxLaW5kLkNvZGUsIG1pbWU6IHVuZGVmaW5lZCwgb3V0cHV0czogW10sIG1ldGFkYXRhOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0eyBzb3VyY2U6ICd2YXIgYyA9IDE7JywgbGFuZ3VhZ2U6ICdqYXZhc2NyaXB0JywgY2VsbEtpbmQ6IENlbGxLaW5kLkNvZGUsIG1pbWU6IHVuZGVmaW5lZCwgb3V0cHV0czogW10sIG1ldGFkYXRhOiB1bmRlZmluZWQgfVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGVkaXRzID0gTm90ZWJvb2tUZXh0TW9kZWwuY29tcHV0ZUVkaXRzKG1vZGVsLCBjZWxscyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdHMsIFtcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk1ldGFkYXRhLCBpbmRleDogMCwgbWV0YWRhdGE6IHt9IH0sXG5cdFx0XHRcdHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMSwgY291bnQ6IDEsIGNlbGxzOiBjZWxscy5zbGljZSgxLCAyKSB9LFxuXHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuTWV0YWRhdGEsIGluZGV4OiAyLCBtZXRhZGF0YToge30gfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wdXRlRWRpdHMgY2VsbCBtZXRhZGF0YSBjaGFuZ2VkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soW1xuXHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XSwgKGVkaXRvcikgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IudGV4dE1vZGVsO1xuXHRcdFx0Y29uc3QgY2VsbHMgPSBbXG5cdFx0XHRcdHsgc291cmNlOiAndmFyIGEgPSAxOycsIGxhbmd1YWdlOiAnamF2YXNjcmlwdCcsIGNlbGxLaW5kOiBDZWxsS2luZC5Db2RlLCBtaW1lOiB1bmRlZmluZWQsIG91dHB1dHM6IFtdLCBtZXRhZGF0YTogeyBuYW1lOiAnZm9vJyB9IH0sXG5cdFx0XHRcdHsgc291cmNlOiAndmFyIGIgPSAxOycsIGxhbmd1YWdlOiAnamF2YXNjcmlwdCcsIGNlbGxLaW5kOiBDZWxsS2luZC5Db2RlLCBtaW1lOiB1bmRlZmluZWQsIG91dHB1dHM6IFtdLCBtZXRhZGF0YTogdW5kZWZpbmVkIH1cblx0XHRcdF07XG5cdFx0XHRjb25zdCBlZGl0cyA9IE5vdGVib29rVGV4dE1vZGVsLmNvbXB1dGVFZGl0cyhtb2RlbCwgY2VsbHMpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRzLCBbXG5cdFx0XHRcdHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5NZXRhZGF0YSwgaW5kZXg6IDAsIG1ldGFkYXRhOiB7IG5hbWU6ICdmb28nIH0gfSxcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk1ldGFkYXRhLCBpbmRleDogMSwgbWV0YWRhdGE6IHt9IH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29tcHV0ZUVkaXRzIGNlbGwgbGFuZ3VhZ2UgY2hhbmdlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFtcblx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdF0sIChlZGl0b3IpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLnRleHRNb2RlbDtcblx0XHRcdGNvbnN0IGNlbGxzID0gW1xuXHRcdFx0XHR7IHNvdXJjZTogJ3ZhciBhID0gMTsnLCBsYW5ndWFnZTogJ3R5cGVzY3JpcHQnLCBjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSwgbWltZTogdW5kZWZpbmVkLCBvdXRwdXRzOiBbXSwgbWV0YWRhdGE6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR7IHNvdXJjZTogJ3ZhciBiID0gMTsnLCBsYW5ndWFnZTogJ2phdmFzY3JpcHQnLCBjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSwgbWltZTogdW5kZWZpbmVkLCBvdXRwdXRzOiBbXSwgbWV0YWRhdGE6IHVuZGVmaW5lZCB9XG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgZWRpdHMgPSBOb3RlYm9va1RleHRNb2RlbC5jb21wdXRlRWRpdHMobW9kZWwsIGNlbGxzKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0cywgW1xuXHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDAsIGNvdW50OiAxLCBjZWxsczogY2VsbHMuc2xpY2UoMCwgMSkgfSxcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk1ldGFkYXRhLCBpbmRleDogMSwgbWV0YWRhdGE6IHt9IH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29tcHV0ZUVkaXRzIGNlbGwga2luZCBjaGFuZ2VkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soW1xuXHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XSwgKGVkaXRvcikgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IudGV4dE1vZGVsO1xuXHRcdFx0Y29uc3QgY2VsbHMgPSBbXG5cdFx0XHRcdHsgc291cmNlOiAndmFyIGEgPSAxOycsIGxhbmd1YWdlOiAnamF2YXNjcmlwdCcsIGNlbGxLaW5kOiBDZWxsS2luZC5Db2RlLCBtaW1lOiB1bmRlZmluZWQsIG91dHB1dHM6IFtdLCBtZXRhZGF0YTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdHsgc291cmNlOiAndmFyIGIgPSAxOycsIGxhbmd1YWdlOiAnamF2YXNjcmlwdCcsIGNlbGxLaW5kOiBDZWxsS2luZC5NYXJrdXAsIG1pbWU6IHVuZGVmaW5lZCwgb3V0cHV0czogW10sIG1ldGFkYXRhOiB1bmRlZmluZWQgfVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGVkaXRzID0gTm90ZWJvb2tUZXh0TW9kZWwuY29tcHV0ZUVkaXRzKG1vZGVsLCBjZWxscyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdHMsIFtcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk1ldGFkYXRhLCBpbmRleDogMCwgbWV0YWRhdGE6IHt9IH0sXG5cdFx0XHRcdHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMSwgY291bnQ6IDEsIGNlbGxzOiBjZWxscy5zbGljZSgxKSB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXB1dGVFZGl0cyBjZWxsIG1ldGFkYXRhICYgY29udGVudCBjaGFuZ2VkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soW1xuXHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XSwgKGVkaXRvcikgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IudGV4dE1vZGVsO1xuXHRcdFx0Y29uc3QgY2VsbHMgPSBbXG5cdFx0XHRcdHsgc291cmNlOiAndmFyIGEgPSAxOycsIGxhbmd1YWdlOiAnamF2YXNjcmlwdCcsIGNlbGxLaW5kOiBDZWxsS2luZC5Db2RlLCBtaW1lOiB1bmRlZmluZWQsIG91dHB1dHM6IFtdLCBtZXRhZGF0YTogeyBuYW1lOiAnZm9vJyB9IH0sXG5cdFx0XHRcdHsgc291cmNlOiAndmFyIGIgPSAyOycsIGxhbmd1YWdlOiAnamF2YXNjcmlwdCcsIGNlbGxLaW5kOiBDZWxsS2luZC5Db2RlLCBtaW1lOiB1bmRlZmluZWQsIG91dHB1dHM6IFtdLCBtZXRhZGF0YTogeyBuYW1lOiAnYmFyJyB9IH1cblx0XHRcdF07XG5cdFx0XHRjb25zdCBlZGl0cyA9IE5vdGVib29rVGV4dE1vZGVsLmNvbXB1dGVFZGl0cyhtb2RlbCwgY2VsbHMpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRzLCBbXG5cdFx0XHRcdHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5NZXRhZGF0YSwgaW5kZXg6IDAsIG1ldGFkYXRhOiB7IG5hbWU6ICdmb28nIH0gfSxcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAxLCBjb3VudDogMSwgY2VsbHM6IGNlbGxzLnNsaWNlKDEpIH1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wdXRlRWRpdHMgY2VsbCBjb250ZW50IGNoYW5nZWQgd2hpbGUgZXhlY3V0aW5nJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soW1xuXHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XSwgKGVkaXRvcikgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IudGV4dE1vZGVsO1xuXHRcdFx0Y29uc3QgY2VsbHMgPSBbXG5cdFx0XHRcdHsgc291cmNlOiAndmFyIGEgPSAxOycsIGxhbmd1YWdlOiAnamF2YXNjcmlwdCcsIGNlbGxLaW5kOiBDZWxsS2luZC5Db2RlLCBtaW1lOiB1bmRlZmluZWQsIG91dHB1dHM6IFtdLCBtZXRhZGF0YToge30gfSxcblx0XHRcdFx0eyBzb3VyY2U6ICd2YXIgYiA9IDI7JywgbGFuZ3VhZ2U6ICdqYXZhc2NyaXB0JywgY2VsbEtpbmQ6IENlbGxLaW5kLkNvZGUsIG1pbWU6IHVuZGVmaW5lZCwgb3V0cHV0czogW10sIG1ldGFkYXRhOiB7fSB9XG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgZWRpdHMgPSBOb3RlYm9va1RleHRNb2RlbC5jb21wdXRlRWRpdHMobW9kZWwsIGNlbGxzLCBbbW9kZWwuY2VsbHNbMV0uaGFuZGxlXSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdHMsIFtcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk1ldGFkYXRhLCBpbmRleDogMCwgbWV0YWRhdGE6IHt9IH0sXG5cdFx0XHRcdHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMSwgY291bnQ6IDEsIGNlbGxzOiBjZWxscy5zbGljZSgxKSB9XG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29tcHV0ZUVkaXRzIGNlbGwgaW50ZXJuYWwgbWV0YWRhdGEgY2hhbmdlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFtcblx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdF0sIChlZGl0b3IpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLnRleHRNb2RlbDtcblx0XHRcdGNvbnN0IGNlbGxzID0gW1xuXHRcdFx0XHR7IHNvdXJjZTogJ3ZhciBhID0gMTsnLCBsYW5ndWFnZTogJ2phdmFzY3JpcHQnLCBjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSwgbWltZTogdW5kZWZpbmVkLCBvdXRwdXRzOiBbXSwgbWV0YWRhdGE6IHVuZGVmaW5lZCwgaW50ZXJuYWxNZXRhZGF0YTogeyBleGVjdXRpb25PcmRlcjogMSB9IH0sXG5cdFx0XHRcdHsgc291cmNlOiAndmFyIGIgPSAxOycsIGxhbmd1YWdlOiAnamF2YXNjcmlwdCcsIGNlbGxLaW5kOiBDZWxsS2luZC5Db2RlLCBtaW1lOiB1bmRlZmluZWQsIG91dHB1dHM6IFtdLCBtZXRhZGF0YTogdW5kZWZpbmVkIH1cblx0XHRcdF07XG5cdFx0XHRjb25zdCBlZGl0cyA9IE5vdGVib29rVGV4dE1vZGVsLmNvbXB1dGVFZGl0cyhtb2RlbCwgY2VsbHMpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVkaXRzLCBbXG5cdFx0XHRcdHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMCwgY291bnQ6IDEsIGNlbGxzOiBjZWxscy5zbGljZSgwLCAxKSB9LFxuXHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuTWV0YWRhdGEsIGluZGV4OiAxLCBtZXRhZGF0YToge30gfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wdXRlRWRpdHMgY2VsbCBpbnRlcm5hbCBtZXRhZGF0YSBjaGFuZ2VkIHdoaWxlIGV4ZWN1dGluZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFtcblx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdF0sIChlZGl0b3IpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLnRleHRNb2RlbDtcblx0XHRcdGNvbnN0IGNlbGxzID0gW1xuXHRcdFx0XHR7IHNvdXJjZTogJ3ZhciBhID0gMTsnLCBsYW5ndWFnZTogJ2phdmFzY3JpcHQnLCBjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSwgbWltZTogdW5kZWZpbmVkLCBvdXRwdXRzOiBbXSwgbWV0YWRhdGE6IHt9IH0sXG5cdFx0XHRcdHsgc291cmNlOiAndmFyIGIgPSAxOycsIGxhbmd1YWdlOiAnamF2YXNjcmlwdCcsIGNlbGxLaW5kOiBDZWxsS2luZC5Db2RlLCBtaW1lOiB1bmRlZmluZWQsIG91dHB1dHM6IFtdLCBtZXRhZGF0YToge30sIGludGVybmFsTWV0YWRhdGE6IHsgZXhlY3V0aW9uT3JkZXI6IDEgfSB9XG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgZWRpdHMgPSBOb3RlYm9va1RleHRNb2RlbC5jb21wdXRlRWRpdHMobW9kZWwsIGNlbGxzLCBbbW9kZWwuY2VsbHNbMV0uaGFuZGxlXSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdHMsIFtcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk1ldGFkYXRhLCBpbmRleDogMCwgbWV0YWRhdGE6IHt9IH0sXG5cdFx0XHRcdHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5NZXRhZGF0YSwgaW5kZXg6IDEsIG1ldGFkYXRhOiB7fSB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXB1dGVFZGl0cyBjZWxsIGluc2VydGlvbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFtcblx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFsndmFyIGIgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XVxuXHRcdF0sIChlZGl0b3IpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLnRleHRNb2RlbDtcblx0XHRcdGNvbnN0IGNlbGxzID0gW1xuXHRcdFx0XHR7IHNvdXJjZTogJ3ZhciBhID0gMTsnLCBsYW5ndWFnZTogJ2phdmFzY3JpcHQnLCBjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSwgbWltZTogdW5kZWZpbmVkLCBvdXRwdXRzOiBbXSwgbWV0YWRhdGE6IHVuZGVmaW5lZCwgfSxcblx0XHRcdFx0eyBzb3VyY2U6ICd2YXIgYyA9IDE7JywgbGFuZ3VhZ2U6ICdqYXZhc2NyaXB0JywgY2VsbEtpbmQ6IENlbGxLaW5kLkNvZGUsIG1pbWU6IHVuZGVmaW5lZCwgb3V0cHV0czogW10sIG1ldGFkYXRhOiB1bmRlZmluZWQsIH0sXG5cdFx0XHRcdHsgc291cmNlOiAndmFyIGIgPSAxOycsIGxhbmd1YWdlOiAnamF2YXNjcmlwdCcsIGNlbGxLaW5kOiBDZWxsS2luZC5Db2RlLCBtaW1lOiB1bmRlZmluZWQsIG91dHB1dHM6IFtdLCBtZXRhZGF0YTogeyBmb286ICdiYXInIH0gfVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGVkaXRzID0gTm90ZWJvb2tUZXh0TW9kZWwuY29tcHV0ZUVkaXRzKG1vZGVsLCBjZWxscyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdHMsIFtcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk1ldGFkYXRhLCBpbmRleDogMCwgbWV0YWRhdGE6IHt9IH0sXG5cdFx0XHRcdHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMSwgY291bnQ6IDAsIGNlbGxzOiBjZWxscy5zbGljZSgxLCAyKSB9LFxuXHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuTWV0YWRhdGEsIGluZGV4OiAxLCBtZXRhZGF0YTogeyBmb286ICdiYXInIH0gfSxcblx0XHRcdF0pO1xuXG5cdFx0XHRtb2RlbC5hcHBseUVkaXRzKGVkaXRzLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5lcXVhbChtb2RlbC5jZWxscy5sZW5ndGgsIDMpO1xuXHRcdFx0YXNzZXJ0LmVxdWFsKG1vZGVsLmNlbGxzWzFdLmdldFZhbHVlKCksICd2YXIgYyA9IDE7Jyk7XG5cdFx0XHRhc3NlcnQuZXF1YWwobW9kZWwuY2VsbHNbMl0uZ2V0VmFsdWUoKSwgJ3ZhciBiID0gMTsnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuY2VsbHNbMl0ubWV0YWRhdGEsIHsgZm9vOiAnYmFyJyB9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29tcHV0ZUVkaXRzIG91dHB1dCBjaGFuZ2VkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soW1xuXHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dXG5cdFx0XSwgKGVkaXRvcikgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBlZGl0b3IudGV4dE1vZGVsO1xuXHRcdFx0Y29uc3QgY2VsbHMgPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzb3VyY2U6ICd2YXIgYSA9IDE7JywgbGFuZ3VhZ2U6ICdqYXZhc2NyaXB0JywgY2VsbEtpbmQ6IENlbGxLaW5kLkNvZGUsIG1pbWU6IHVuZGVmaW5lZCwgb3V0cHV0czogW3tcblx0XHRcdFx0XHRcdG91dHB1dElkOiAnc29tZUlkJyxcblx0XHRcdFx0XHRcdG91dHB1dHM6IFt7IG1pbWU6IE1pbWVzLm1hcmtkb3duLCBkYXRhOiB2YWx1ZUJ5dGVzRnJvbVN0cmluZygnX1dvcmxkXycpIH1dXG5cdFx0XHRcdFx0fV0sIG1ldGFkYXRhOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHsgc291cmNlOiAndmFyIGIgPSAxOycsIGxhbmd1YWdlOiAnamF2YXNjcmlwdCcsIGNlbGxLaW5kOiBDZWxsS2luZC5Db2RlLCBtaW1lOiB1bmRlZmluZWQsIG91dHB1dHM6IFtdLCBtZXRhZGF0YTogeyBmb286ICdiYXInIH0gfVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGVkaXRzID0gTm90ZWJvb2tUZXh0TW9kZWwuY29tcHV0ZUVkaXRzKG1vZGVsLCBjZWxscyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZWRpdHMsIFtcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk1ldGFkYXRhLCBpbmRleDogMCwgbWV0YWRhdGE6IHt9IH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dCwgaW5kZXg6IDAsIG91dHB1dHM6IFt7XG5cdFx0XHRcdFx0XHRvdXRwdXRJZDogJ3NvbWVJZCcsXG5cdFx0XHRcdFx0XHRvdXRwdXRzOiBbeyBtaW1lOiBNaW1lcy5tYXJrZG93biwgZGF0YTogdmFsdWVCeXRlc0Zyb21TdHJpbmcoJ19Xb3JsZF8nKSB9XVxuXHRcdFx0XHRcdH1dLCBhcHBlbmQ6IGZhbHNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHsgZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5NZXRhZGF0YSwgaW5kZXg6IDEsIG1ldGFkYXRhOiB7IGZvbzogJ2JhcicgfSB9LFxuXHRcdFx0XSk7XG5cblx0XHRcdG1vZGVsLmFwcGx5RWRpdHMoZWRpdHMsIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmVxdWFsKG1vZGVsLmNlbGxzLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY2VsbHNbMF0ub3V0cHV0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LmVxdWFsKG1vZGVsLmNlbGxzWzBdLm91dHB1dHNbMF0ub3V0cHV0SWQsICdzb21lSWQnKTtcblx0XHRcdGFzc2VydC5lcXVhbChtb2RlbC5jZWxsc1swXS5vdXRwdXRzWzBdLm91dHB1dHNbMF0uZGF0YS50b1N0cmluZygpLCAnX1dvcmxkXycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wdXRlRWRpdHMgb3V0cHV0IGl0ZW1zIGNoYW5nZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhbXG5cdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFt7XG5cdFx0XHRcdG91dHB1dElkOiAnc29tZUlkJyxcblx0XHRcdFx0b3V0cHV0czogW3sgbWltZTogTWltZXMubWFya2Rvd24sIGRhdGE6IHZhbHVlQnl0ZXNGcm9tU3RyaW5nKCdfSGVsbG9fJykgfV1cblx0XHRcdH1dLCB7fV0sXG5cdFx0XHRbJ3ZhciBiID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRdLCAoZWRpdG9yKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci50ZXh0TW9kZWw7XG5cdFx0XHRjb25zdCBjZWxscyA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHNvdXJjZTogJ3ZhciBhID0gMTsnLCBsYW5ndWFnZTogJ2phdmFzY3JpcHQnLCBjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSwgbWltZTogdW5kZWZpbmVkLCBvdXRwdXRzOiBbe1xuXHRcdFx0XHRcdFx0b3V0cHV0SWQ6ICdzb21lSWQnLFxuXHRcdFx0XHRcdFx0b3V0cHV0czogW3sgbWltZTogTWltZXMubWFya2Rvd24sIGRhdGE6IHZhbHVlQnl0ZXNGcm9tU3RyaW5nKCdfV29ybGRfJykgfV1cblx0XHRcdFx0XHR9XSwgbWV0YWRhdGE6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0eyBzb3VyY2U6ICd2YXIgYiA9IDE7JywgbGFuZ3VhZ2U6ICdqYXZhc2NyaXB0JywgY2VsbEtpbmQ6IENlbGxLaW5kLkNvZGUsIG1pbWU6IHVuZGVmaW5lZCwgb3V0cHV0czogW10sIG1ldGFkYXRhOiB7IGZvbzogJ2JhcicgfSB9XG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgZWRpdHMgPSBOb3RlYm9va1RleHRNb2RlbC5jb21wdXRlRWRpdHMobW9kZWwsIGNlbGxzKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlZGl0cywgW1xuXHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuTWV0YWRhdGEsIGluZGV4OiAwLCBtZXRhZGF0YToge30gfSxcblx0XHRcdFx0eyBlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dEl0ZW1zLCBvdXRwdXRJZDogJ3NvbWVJZCcsIGl0ZW1zOiBbeyBtaW1lOiBNaW1lcy5tYXJrZG93biwgZGF0YTogdmFsdWVCeXRlc0Zyb21TdHJpbmcoJ19Xb3JsZF8nKSB9XSwgYXBwZW5kOiBmYWxzZSB9LFxuXHRcdFx0XHR7IGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuTWV0YWRhdGEsIGluZGV4OiAxLCBtZXRhZGF0YTogeyBmb286ICdiYXInIH0gfSxcblx0XHRcdF0pO1xuXG5cdFx0XHRtb2RlbC5hcHBseUVkaXRzKGVkaXRzLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5lcXVhbChtb2RlbC5jZWxscy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmNlbGxzWzBdLm91dHB1dHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5lcXVhbChtb2RlbC5jZWxsc1swXS5vdXRwdXRzWzBdLm91dHB1dElkLCAnc29tZUlkJyk7XG5cdFx0XHRhc3NlcnQuZXF1YWwobW9kZWwuY2VsbHNbMF0ub3V0cHV0c1swXS5vdXRwdXRzWzBdLmRhdGEudG9TdHJpbmcoKSwgJ19Xb3JsZF8nKTtcblx0XHR9KTtcblx0fSk7XG5cdHRlc3QoJ0FwcGVuZCBtdWx0aXBsZSB0ZXh0L3BsYWluIG91dHB1dCBpdGVtcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFtcblx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW3tcblx0XHRcdFx0b3V0cHV0SWQ6ICcxJyxcblx0XHRcdFx0b3V0cHV0czogW3sgbWltZTogJ3RleHQvcGxhaW4nLCBkYXRhOiB2YWx1ZUJ5dGVzRnJvbVN0cmluZygnZm9vJykgfV1cblx0XHRcdH1dLCB7fV1cblx0XHRdLCAoZWRpdG9yKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci50ZXh0TW9kZWw7XG5cdFx0XHRjb25zdCBlZGl0czogSUNlbGxFZGl0T3BlcmF0aW9uW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dEl0ZW1zLFxuXHRcdFx0XHRcdG91dHB1dElkOiAnMScsXG5cdFx0XHRcdFx0YXBwZW5kOiB0cnVlLFxuXHRcdFx0XHRcdGl0ZW1zOiBbeyBtaW1lOiAndGV4dC9wbGFpbicsIGRhdGE6IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2JhcicpIH0sIHsgbWltZTogJ3RleHQvcGxhaW4nLCBkYXRhOiBWU0J1ZmZlci5mcm9tU3RyaW5nKCdiYXonKSB9XVxuXHRcdFx0XHR9XG5cdFx0XHRdO1xuXHRcdFx0bW9kZWwuYXBwbHlFZGl0cyhlZGl0cywgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZXF1YWwobW9kZWwuY2VsbHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5lcXVhbChtb2RlbC5jZWxsc1swXS5vdXRwdXRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuZXF1YWwobW9kZWwuY2VsbHNbMF0ub3V0cHV0c1swXS5vdXRwdXRzLmxlbmd0aCwgMyk7XG5cdFx0XHRhc3NlcnQuZXF1YWwobW9kZWwuY2VsbHNbMF0ub3V0cHV0c1swXS5vdXRwdXRzWzBdLm1pbWUsICd0ZXh0L3BsYWluJyk7XG5cdFx0XHRhc3NlcnQuZXF1YWwobW9kZWwuY2VsbHNbMF0ub3V0cHV0c1swXS5vdXRwdXRzWzBdLmRhdGEudG9TdHJpbmcoKSwgJ2ZvbycpO1xuXHRcdFx0YXNzZXJ0LmVxdWFsKG1vZGVsLmNlbGxzWzBdLm91dHB1dHNbMF0ub3V0cHV0c1sxXS5taW1lLCAndGV4dC9wbGFpbicpO1xuXHRcdFx0YXNzZXJ0LmVxdWFsKG1vZGVsLmNlbGxzWzBdLm91dHB1dHNbMF0ub3V0cHV0c1sxXS5kYXRhLnRvU3RyaW5nKCksICdiYXInKTtcblx0XHRcdGFzc2VydC5lcXVhbChtb2RlbC5jZWxsc1swXS5vdXRwdXRzWzBdLm91dHB1dHNbMl0ubWltZSwgJ3RleHQvcGxhaW4nKTtcblx0XHRcdGFzc2VydC5lcXVhbChtb2RlbC5jZWxsc1swXS5vdXRwdXRzWzBdLm91dHB1dHNbMl0uZGF0YS50b1N0cmluZygpLCAnYmF6Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXHR0ZXN0KCdBcHBlbmQgbXVsdGlwbGUgc3Rkb3V0IHN0cmVhbSBvdXRwdXQgaXRlbXMgdG8gYW4gb3V0cHV0IHdpdGggYW5vdGhlciBtaW1lJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soW1xuXHRcdFx0Wyd2YXIgYSA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbe1xuXHRcdFx0XHRvdXRwdXRJZDogJzEnLFxuXHRcdFx0XHRvdXRwdXRzOiBbeyBtaW1lOiAndGV4dC9wbGFpbicsIGRhdGE6IHZhbHVlQnl0ZXNGcm9tU3RyaW5nKCdmb28nKSB9XVxuXHRcdFx0fV0sIHt9XVxuXHRcdF0sIChlZGl0b3IpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLnRleHRNb2RlbDtcblx0XHRcdGNvbnN0IGVkaXRzOiBJQ2VsbEVkaXRPcGVyYXRpb25bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuT3V0cHV0SXRlbXMsXG5cdFx0XHRcdFx0b3V0cHV0SWQ6ICcxJyxcblx0XHRcdFx0XHRhcHBlbmQ6IHRydWUsXG5cdFx0XHRcdFx0aXRlbXM6IFt7IG1pbWU6ICdhcHBsaWNhdGlvbi92bmQuY29kZS5ub3RlYm9vay5zdGRvdXQnLCBkYXRhOiBWU0J1ZmZlci5mcm9tU3RyaW5nKCdiYXInKSB9LCB7IG1pbWU6ICdhcHBsaWNhdGlvbi92bmQuY29kZS5ub3RlYm9vay5zdGRvdXQnLCBkYXRhOiBWU0J1ZmZlci5mcm9tU3RyaW5nKCdiYXonKSB9XVxuXHRcdFx0XHR9XG5cdFx0XHRdO1xuXHRcdFx0bW9kZWwuYXBwbHlFZGl0cyhlZGl0cywgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZXF1YWwobW9kZWwuY2VsbHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5lcXVhbChtb2RlbC5jZWxsc1swXS5vdXRwdXRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuZXF1YWwobW9kZWwuY2VsbHNbMF0ub3V0cHV0c1swXS5vdXRwdXRzLmxlbmd0aCwgMyk7XG5cdFx0XHRhc3NlcnQuZXF1YWwobW9kZWwuY2VsbHNbMF0ub3V0cHV0c1swXS5vdXRwdXRzWzBdLm1pbWUsICd0ZXh0L3BsYWluJyk7XG5cdFx0XHRhc3NlcnQuZXF1YWwobW9kZWwuY2VsbHNbMF0ub3V0cHV0c1swXS5vdXRwdXRzWzBdLmRhdGEudG9TdHJpbmcoKSwgJ2ZvbycpO1xuXHRcdFx0YXNzZXJ0LmVxdWFsKG1vZGVsLmNlbGxzWzBdLm91dHB1dHNbMF0ub3V0cHV0c1sxXS5taW1lLCAnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suc3Rkb3V0Jyk7XG5cdFx0XHRhc3NlcnQuZXF1YWwobW9kZWwuY2VsbHNbMF0ub3V0cHV0c1swXS5vdXRwdXRzWzFdLmRhdGEudG9TdHJpbmcoKSwgJ2JhcicpO1xuXHRcdFx0YXNzZXJ0LmVxdWFsKG1vZGVsLmNlbGxzWzBdLm91dHB1dHNbMF0ub3V0cHV0c1syXS5taW1lLCAnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suc3Rkb3V0Jyk7XG5cdFx0XHRhc3NlcnQuZXF1YWwobW9kZWwuY2VsbHNbMF0ub3V0cHV0c1swXS5vdXRwdXRzWzJdLmRhdGEudG9TdHJpbmcoKSwgJ2JheicpO1xuXHRcdH0pO1xuXHR9KTtcblx0dGVzdCgnQ29tcHJlc3MgbXVsdGlwbGUgc3Rkb3V0IHN0cmVhbSBvdXRwdXQgaXRlbXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhbXG5cdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFt7XG5cdFx0XHRcdG91dHB1dElkOiAnMScsXG5cdFx0XHRcdG91dHB1dHM6IFt7IG1pbWU6ICdhcHBsaWNhdGlvbi92bmQuY29kZS5ub3RlYm9vay5zdGRvdXQnLCBkYXRhOiB2YWx1ZUJ5dGVzRnJvbVN0cmluZygnZm9vJykgfV1cblx0XHRcdH1dLCB7fV1cblx0XHRdLCAoZWRpdG9yKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci50ZXh0TW9kZWw7XG5cdFx0XHRjb25zdCBlZGl0czogSUNlbGxFZGl0T3BlcmF0aW9uW10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dEl0ZW1zLFxuXHRcdFx0XHRcdG91dHB1dElkOiAnMScsXG5cdFx0XHRcdFx0YXBwZW5kOiB0cnVlLFxuXHRcdFx0XHRcdGl0ZW1zOiBbeyBtaW1lOiAnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suc3Rkb3V0JywgZGF0YTogVlNCdWZmZXIuZnJvbVN0cmluZygnYmFyJykgfSwgeyBtaW1lOiAnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suc3Rkb3V0JywgZGF0YTogVlNCdWZmZXIuZnJvbVN0cmluZygnYmF6JykgfV1cblx0XHRcdFx0fVxuXHRcdFx0XTtcblx0XHRcdG1vZGVsLmFwcGx5RWRpdHMoZWRpdHMsIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmVxdWFsKG1vZGVsLmNlbGxzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuZXF1YWwobW9kZWwuY2VsbHNbMF0ub3V0cHV0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LmVxdWFsKG1vZGVsLmNlbGxzWzBdLm91dHB1dHNbMF0ub3V0cHV0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LmVxdWFsKG1vZGVsLmNlbGxzWzBdLm91dHB1dHNbMF0ub3V0cHV0c1swXS5taW1lLCAnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suc3Rkb3V0Jyk7XG5cdFx0XHRhc3NlcnQuZXF1YWwobW9kZWwuY2VsbHNbMF0ub3V0cHV0c1swXS5vdXRwdXRzWzBdLmRhdGEudG9TdHJpbmcoKSwgJ2Zvb2JhcmJheicpO1xuXHRcdH0pO1xuXG5cdH0pO1xuXHR0ZXN0KCdDb21wcmVzcyBtdWx0aXBsZSBzdGRlcnIgc3RyZWFtIG91dHB1dCBpdGVtcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFtcblx0XHRcdFsndmFyIGEgPSAxOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW3tcblx0XHRcdFx0b3V0cHV0SWQ6ICcxJyxcblx0XHRcdFx0b3V0cHV0czogW3sgbWltZTogJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLnN0ZGVycicsIGRhdGE6IHZhbHVlQnl0ZXNGcm9tU3RyaW5nKCdmb28nKSB9XVxuXHRcdFx0fV0sIHt9XVxuXHRcdF0sIChlZGl0b3IpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLnRleHRNb2RlbDtcblx0XHRcdGNvbnN0IGVkaXRzOiBJQ2VsbEVkaXRPcGVyYXRpb25bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuT3V0cHV0SXRlbXMsXG5cdFx0XHRcdFx0b3V0cHV0SWQ6ICcxJyxcblx0XHRcdFx0XHRhcHBlbmQ6IHRydWUsXG5cdFx0XHRcdFx0aXRlbXM6IFt7IG1pbWU6ICdhcHBsaWNhdGlvbi92bmQuY29kZS5ub3RlYm9vay5zdGRlcnInLCBkYXRhOiBWU0J1ZmZlci5mcm9tU3RyaW5nKCdiYXInKSB9LCB7IG1pbWU6ICdhcHBsaWNhdGlvbi92bmQuY29kZS5ub3RlYm9vay5zdGRlcnInLCBkYXRhOiBWU0J1ZmZlci5mcm9tU3RyaW5nKCdiYXonKSB9XVxuXHRcdFx0XHR9XG5cdFx0XHRdO1xuXHRcdFx0bW9kZWwuYXBwbHlFZGl0cyhlZGl0cywgdHJ1ZSwgdW5kZWZpbmVkLCAoKSA9PiB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZXF1YWwobW9kZWwuY2VsbHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5lcXVhbChtb2RlbC5jZWxsc1swXS5vdXRwdXRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuZXF1YWwobW9kZWwuY2VsbHNbMF0ub3V0cHV0c1swXS5vdXRwdXRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuZXF1YWwobW9kZWwuY2VsbHNbMF0ub3V0cHV0c1swXS5vdXRwdXRzWzBdLm1pbWUsICdhcHBsaWNhdGlvbi92bmQuY29kZS5ub3RlYm9vay5zdGRlcnInKTtcblx0XHRcdGFzc2VydC5lcXVhbChtb2RlbC5jZWxsc1swXS5vdXRwdXRzWzBdLm91dHB1dHNbMF0uZGF0YS50b1N0cmluZygpLCAnZm9vYmFyYmF6Jyk7XG5cdFx0fSk7XG5cblx0fSk7XG5cblx0dGVzdCgnZmluZE5leHRNYXRjaCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJ3ZhciBhID0gMTsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYyA9IDM7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBkID0gNDsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHQoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdFx0Y29uc3Qgbm90ZWJvb2tNb2RlbCA9IHZpZXdNb2RlbC5ub3RlYm9va0RvY3VtZW50O1xuXG5cdFx0XHRcdC8vIFRlc3QgY2FzZSAxOiBGaW5kICd2YXInIHN0YXJ0aW5nIGZyb20gdGhlIGZpcnN0IGNlbGxcblx0XHRcdFx0bGV0IGZpbmRNYXRjaCA9IG5vdGVib29rTW9kZWwuZmluZE5leHRNYXRjaCgndmFyJywgeyBjZWxsSW5kZXg6IDAsIHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oMSwgMSkgfSwgZmFsc2UsIGZhbHNlLCBudWxsKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGZpbmRNYXRjaCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTWF0Y2ghLm1hdGNoLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTWF0Y2ghLm1hdGNoLnJhbmdlLnN0YXJ0Q29sdW1uLCAxKTtcblxuXHRcdFx0XHQvLyBUZXN0IGNhc2UgMjogRmluZCAnYicgc3RhcnRpbmcgZnJvbSB0aGUgc2Vjb25kIGNlbGxcblx0XHRcdFx0ZmluZE1hdGNoID0gbm90ZWJvb2tNb2RlbC5maW5kTmV4dE1hdGNoKCdiJywgeyBjZWxsSW5kZXg6IDEsIHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oMSwgMSkgfSwgZmFsc2UsIGZhbHNlLCBudWxsKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGZpbmRNYXRjaCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTWF0Y2ghLm1hdGNoLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTWF0Y2ghLm1hdGNoLnJhbmdlLnN0YXJ0Q29sdW1uLCA1KTtcblxuXHRcdFx0XHQvLyBUZXN0IGNhc2UgMzogRmluZCAnYycgc3RhcnRpbmcgZnJvbSB0aGUgdGhpcmQgY2VsbFxuXHRcdFx0XHRmaW5kTWF0Y2ggPSBub3RlYm9va01vZGVsLmZpbmROZXh0TWF0Y2goJ2MnLCB7IGNlbGxJbmRleDogMiwgcG9zaXRpb246IG5ldyBQb3NpdGlvbigxLCAxKSB9LCBmYWxzZSwgZmFsc2UsIG51bGwpO1xuXHRcdFx0XHRhc3NlcnQub2soZmluZE1hdGNoKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRNYXRjaCEubWF0Y2gucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRNYXRjaCEubWF0Y2gucmFuZ2Uuc3RhcnRDb2x1bW4sIDUpO1xuXG5cdFx0XHRcdC8vIFRlc3QgY2FzZSA0OiBGaW5kICdkJyBzdGFydGluZyBmcm9tIHRoZSBmb3VydGggY2VsbFxuXHRcdFx0XHRmaW5kTWF0Y2ggPSBub3RlYm9va01vZGVsLmZpbmROZXh0TWF0Y2goJ2QnLCB7IGNlbGxJbmRleDogMywgcG9zaXRpb246IG5ldyBQb3NpdGlvbigxLCAxKSB9LCBmYWxzZSwgZmFsc2UsIG51bGwpO1xuXHRcdFx0XHRhc3NlcnQub2soZmluZE1hdGNoKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRNYXRjaCEubWF0Y2gucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRNYXRjaCEubWF0Y2gucmFuZ2Uuc3RhcnRDb2x1bW4sIDUpO1xuXG5cdFx0XHRcdC8vIFRlc3QgY2FzZSA1OiBObyBtYXRjaCBmb3VuZFxuXHRcdFx0XHRmaW5kTWF0Y2ggPSBub3RlYm9va01vZGVsLmZpbmROZXh0TWF0Y2goJ2UnLCB7IGNlbGxJbmRleDogMCwgcG9zaXRpb246IG5ldyBQb3NpdGlvbigxLCAxKSB9LCBmYWxzZSwgZmFsc2UsIG51bGwpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZE1hdGNoLCBudWxsKTtcblx0XHRcdH1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kTmV4dE1hdGNoIDInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0Wyd2YXIgYSA9IDE7IHZhciBhID0gMjsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRcdFsndmFyIGIgPSAyOycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwgW10sIHt9XSxcblx0XHRcdFx0Wyd2YXIgYyA9IDM7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJ3ZhciBkID0gNDsnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV1cblx0XHRcdF0sXG5cdFx0XHQoZWRpdG9yLCB2aWV3TW9kZWwpID0+IHtcblx0XHRcdFx0Y29uc3Qgbm90ZWJvb2tNb2RlbCA9IHZpZXdNb2RlbC5ub3RlYm9va0RvY3VtZW50O1xuXG5cdFx0XHRcdC8vIFRlc3QgY2FzZSAxOiBGaW5kICd2YXInIHN0YXJ0aW5nIGZyb20gdGhlIGZpcnN0IGNlbGxcblx0XHRcdFx0bGV0IGZpbmRNYXRjaCA9IG5vdGVib29rTW9kZWwuZmluZE5leHRNYXRjaCgndmFyJywgeyBjZWxsSW5kZXg6IDAsIHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oMSwgMSkgfSwgZmFsc2UsIGZhbHNlLCBudWxsKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGZpbmRNYXRjaCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTWF0Y2ghLm1hdGNoLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTWF0Y2ghLm1hdGNoLnJhbmdlLnN0YXJ0Q29sdW1uLCAxKTtcblxuXHRcdFx0XHQvLyBUZXN0IGNhc2UgMjogRmluZCAnYicgc3RhcnRpbmcgZnJvbSB0aGUgc2Vjb25kIGNlbGxcblx0XHRcdFx0ZmluZE1hdGNoID0gbm90ZWJvb2tNb2RlbC5maW5kTmV4dE1hdGNoKCdiJywgeyBjZWxsSW5kZXg6IDEsIHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oMSwgMSkgfSwgZmFsc2UsIGZhbHNlLCBudWxsKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGZpbmRNYXRjaCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTWF0Y2ghLm1hdGNoLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTWF0Y2ghLm1hdGNoLnJhbmdlLnN0YXJ0Q29sdW1uLCA1KTtcblxuXHRcdFx0XHQvLyBUZXN0IGNhc2UgMzogRmluZCAnYycgc3RhcnRpbmcgZnJvbSB0aGUgdGhpcmQgY2VsbFxuXHRcdFx0XHRmaW5kTWF0Y2ggPSBub3RlYm9va01vZGVsLmZpbmROZXh0TWF0Y2goJ2MnLCB7IGNlbGxJbmRleDogMiwgcG9zaXRpb246IG5ldyBQb3NpdGlvbigxLCAxKSB9LCBmYWxzZSwgZmFsc2UsIG51bGwpO1xuXHRcdFx0XHRhc3NlcnQub2soZmluZE1hdGNoKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRNYXRjaCEubWF0Y2gucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRNYXRjaCEubWF0Y2gucmFuZ2Uuc3RhcnRDb2x1bW4sIDUpO1xuXG5cdFx0XHRcdC8vIFRlc3QgY2FzZSA0OiBGaW5kICdkJyBzdGFydGluZyBmcm9tIHRoZSBmb3VydGggY2VsbFxuXHRcdFx0XHRmaW5kTWF0Y2ggPSBub3RlYm9va01vZGVsLmZpbmROZXh0TWF0Y2goJ2QnLCB7IGNlbGxJbmRleDogMywgcG9zaXRpb246IG5ldyBQb3NpdGlvbigxLCAxKSB9LCBmYWxzZSwgZmFsc2UsIG51bGwpO1xuXHRcdFx0XHRhc3NlcnQub2soZmluZE1hdGNoKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRNYXRjaCEubWF0Y2gucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbmRNYXRjaCEubWF0Y2gucmFuZ2Uuc3RhcnRDb2x1bW4sIDUpO1xuXG5cdFx0XHRcdC8vIFRlc3QgY2FzZSA1OiBObyBtYXRjaCBmb3VuZFxuXHRcdFx0XHRmaW5kTWF0Y2ggPSBub3RlYm9va01vZGVsLmZpbmROZXh0TWF0Y2goJ2UnLCB7IGNlbGxJbmRleDogMCwgcG9zaXRpb246IG5ldyBQb3NpdGlvbigxLCAxKSB9LCBmYWxzZSwgZmFsc2UsIG51bGwpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZE1hdGNoLCBudWxsKTtcblxuXHRcdFx0XHQvLyBUZXN0IGNhc2UgNjogU2FtZSBrZXl3b3JkcyBpbiB0aGUgc2FtZSBjZWxsXG5cdFx0XHRcdGZpbmRNYXRjaCA9IG5vdGVib29rTW9kZWwuZmluZE5leHRNYXRjaCgndmFyJywgeyBjZWxsSW5kZXg6IDAsIHBvc2l0aW9uOiBuZXcgUG9zaXRpb24oMSwgMSkgfSwgZmFsc2UsIGZhbHNlLCBudWxsKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGZpbmRNYXRjaCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTWF0Y2ghLm1hdGNoLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTWF0Y2ghLm1hdGNoLnJhbmdlLnN0YXJ0Q29sdW1uLCAxKTtcblxuXHRcdFx0XHRmaW5kTWF0Y2ggPSBub3RlYm9va01vZGVsLmZpbmROZXh0TWF0Y2goJ3ZhcicsIHsgY2VsbEluZGV4OiAwLCBwb3NpdGlvbjogbmV3IFBvc2l0aW9uKDEsIDUpIH0sIGZhbHNlLCBmYWxzZSwgbnVsbCk7XG5cdFx0XHRcdGFzc2VydC5vayhmaW5kTWF0Y2gpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZE1hdGNoIS5tYXRjaC5yYW5nZS5zdGFydExpbmVOdW1iZXIsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmluZE1hdGNoIS5tYXRjaC5yYW5nZS5zdGFydENvbHVtbiwgMTIpO1xuXG5cdFx0XHRcdC8vIFRlc3QgY2FzZSA3OiBTZWFyY2ggZnJvbSB0aGUgbWlkZGxlIG9mIGEgY2VsbCB3aXRoIGtleXdvcmQgYmVmb3JlIGFuZCBhZnRlclxuXHRcdFx0XHRmaW5kTWF0Y2ggPSBub3RlYm9va01vZGVsLmZpbmROZXh0TWF0Y2goJ2EnLCB7IGNlbGxJbmRleDogMCwgcG9zaXRpb246IG5ldyBQb3NpdGlvbigxLCAxMCkgfSwgZmFsc2UsIGZhbHNlLCBudWxsKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGZpbmRNYXRjaCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTWF0Y2ghLm1hdGNoLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTWF0Y2ghLm1hdGNoLnJhbmdlLnN0YXJ0Q29sdW1uLCAxMyk7XG5cblx0XHRcdFx0Ly8gVGVzdCBjYXNlIDg6IFNlYXJjaCBmcm9tIGEgY2VsbCBhbmQgbmV4dCBtYXRjaCBpcyBpbiBhbm90aGVyIGNlbGwgYmVsb3dcblx0XHRcdFx0ZmluZE1hdGNoID0gbm90ZWJvb2tNb2RlbC5maW5kTmV4dE1hdGNoKCd2YXInLCB7IGNlbGxJbmRleDogMCwgcG9zaXRpb246IG5ldyBQb3NpdGlvbigxLCAyMCkgfSwgZmFsc2UsIGZhbHNlLCBudWxsKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKGZpbmRNYXRjaCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTWF0Y2ghLm1hdGNoLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaW5kTWF0Y2ghLm1hdGNoLnJhbmdlLnN0YXJ0Q29sdW1uLCAxKTtcblx0XHRcdFx0Ly8gYXNzZXJ0LnN0cmljdEVxdWFsKG1hdGNoIS5jZWxsSW5kZXgsIDEpO1xuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsY0FBYyxVQUE4Qiw0QkFBZ0csMEJBQTBCO0FBQy9LLFNBQVMsMkJBQTJCLFVBQVUsc0JBQXNCLHdCQUF3QjtBQUU1RixNQUFNLHFCQUFxQixNQUFNO0FBQ2hDLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUVKLDBDQUF3QztBQUV4QyxhQUFXLE1BQU07QUFDaEIsa0JBQWMsSUFBSSxnQkFBZ0I7QUFDbEMsMkJBQXVCLDBCQUEwQixXQUFXO0FBQzVELHNCQUFrQixxQkFBcUIsSUFBSSxnQkFBZ0I7QUFDM0QseUJBQXFCLElBQUksa0JBQWtCLGFBQWE7QUFBQSxFQUN6RCxDQUFDO0FBRUQsZ0JBQWMsTUFBTSxZQUFZLFFBQVEsQ0FBQztBQUV6QyxPQUFLLFVBQVUsaUJBQWtCO0FBQ2hDLFVBQU07QUFBQSxNQUNMO0FBQUEsUUFDQyxDQUFDLGNBQWMsY0FBYyxTQUFTLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLFFBQ2xELENBQUMsY0FBYyxjQUFjLFNBQVMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsUUFDbEQs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
