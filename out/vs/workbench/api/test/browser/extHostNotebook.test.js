import assert from "assert";
import { ExtHostDocumentsAndEditors } from "../../common/extHostDocumentsAndEditors.js";
import { TestRPCProtocol } from "../common/testRPCProtocol.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { mock } from "../../../../base/test/common/mock.js";
import { MainContext } from "../../common/extHost.protocol.js";
import { ExtHostNotebookController } from "../../common/extHostNotebook.js";
import { CellKind, CellUri, NotebookCellsChangeType } from "../../../contrib/notebook/common/notebookCommon.js";
import { URI } from "../../../../base/common/uri.js";
import { ExtHostDocuments } from "../../common/extHostDocuments.js";
import { ExtHostCommands } from "../../common/extHostCommands.js";
import { nullExtensionDescription } from "../../../services/extensions/common/extensions.js";
import { isEqual } from "../../../../base/common/resources.js";
import { Event } from "../../../../base/common/event.js";
import { ExtHostNotebookDocuments } from "../../common/extHostNotebookDocuments.js";
import { SerializableObjectWithBuffers } from "../../../services/extensions/common/proxyIdentifier.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { ExtHostConsumerFileSystem } from "../../common/extHostFileSystemConsumer.js";
import { ExtHostFileSystemInfo } from "../../common/extHostFileSystemInfo.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ExtHostSearch } from "../../common/extHostSearch.js";
import { URITransformerService } from "../../common/extHostUriTransformerService.js";
suite("NotebookCell#Document", function() {
  let rpcProtocol;
  let notebook;
  let extHostDocumentsAndEditors;
  let extHostDocuments;
  let extHostNotebooks;
  let extHostNotebookDocuments;
  let extHostConsumerFileSystem;
  let extHostSearch;
  const notebookUri = URI.parse("test:///notebook.file");
  const disposables = new DisposableStore();
  teardown(function() {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  setup(async function() {
    rpcProtocol = new TestRPCProtocol();
    rpcProtocol.set(MainContext.MainThreadCommands, new class extends mock() {
      $registerCommand() {
      }
    }());
    rpcProtocol.set(MainContext.MainThreadNotebook, new class extends mock() {
      async $registerNotebookSerializer() {
      }
      async $unregisterNotebookSerializer() {
      }
    }());
    extHostDocumentsAndEditors = new ExtHostDocumentsAndEditors(rpcProtocol, new NullLogService());
    extHostDocuments = new ExtHostDocuments(rpcProtocol, extHostDocumentsAndEditors);
    extHostConsumerFileSystem = new ExtHostConsumerFileSystem(rpcProtocol, new ExtHostFileSystemInfo());
    extHostSearch = new ExtHostSearch(rpcProtocol, new URITransformerService(null), new NullLogService());
    extHostNotebooks = new ExtHostNotebookController(rpcProtocol, new ExtHostCommands(rpcProtocol, new NullLogService(), new class extends mock() {
      onExtensionError() {
        return true;
      }
    }()), extHostDocumentsAndEditors, extHostDocuments, extHostConsumerFileSystem, extHostSearch, new NullLogService());
    extHostNotebookDocuments = new ExtHostNotebookDocuments(extHostNotebooks);
    const reg = extHostNotebooks.registerNotebookSerializer(nullExtensionDescription, "test", new class extends mock() {
    }());
    extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({
      addedDocuments: [{
        uri: notebookUri,
        viewType: "test",
        versionId: 0,
        cells: [{
          handle: 0,
          uri: CellUri.generate(notebookUri, 0),
          source: ["### Heading"],
          eol: "\n",
          language: "markdown",
          cellKind: CellKind.Markup,
          outputs: []
        }, {
          handle: 1,
          uri: CellUri.generate(notebookUri, 1),
          source: ['console.log("aaa")', 'console.log("bbb")'],
          eol: "\n",
          language: "javascript",
          cellKind: CellKind.Code,
          outputs: []
        }]
      }],
      addedEditors: [{
        documentUri: notebookUri,
        id: "_notebook_editor_0",
        selections: [{ start: 0, end: 1 }],
        visibleRanges: [],
        viewType: "test"
      }]
    }));
    extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({ newActiveEditor: "_notebook_editor_0" }));
    notebook = extHostNotebooks.notebookDocuments[0];
    disposables.add(reg);
    disposables.add(notebook);
    disposables.add(extHostDocuments);
  });
  test("cell document is vscode.TextDocument", async function() {
    assert.strictEqual(notebook.apiNotebook.cellCount, 2);
    const [c1, c2] = notebook.apiNotebook.getCells();
    const d1 = extHostDocuments.getDocument(c1.document.uri);
    assert.ok(d1);
    assert.strictEqual(d1.languageId, c1.document.languageId);
    assert.strictEqual(d1.version, 1);
    const d2 = extHostDocuments.getDocument(c2.document.uri);
    assert.ok(d2);
    assert.strictEqual(d2.languageId, c2.document.languageId);
    assert.strictEqual(d2.version, 1);
  });
  test("cell document goes when notebook closes", async function() {
    const cellUris = [];
    for (const cell of notebook.apiNotebook.getCells()) {
      assert.ok(extHostDocuments.getDocument(cell.document.uri));
      cellUris.push(cell.document.uri.toString());
    }
    const removedCellUris = [];
    const reg = extHostDocuments.onDidRemoveDocument((doc) => {
      removedCellUris.push(doc.uri.toString());
    });
    extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({ removedDocuments: [notebook.uri] }));
    reg.dispose();
    assert.strictEqual(removedCellUris.length, 2);
    assert.deepStrictEqual(removedCellUris.sort(), cellUris.sort());
  });
  test("cell document is vscode.TextDocument after changing it", async function() {
    const p = new Promise((resolve, reject) => {
      disposables.add(extHostNotebookDocuments.onDidChangeNotebookDocument((e) => {
        try {
          assert.strictEqual(e.contentChanges.length, 1);
          assert.strictEqual(e.contentChanges[0].addedCells.length, 2);
          const [first, second] = e.contentChanges[0].addedCells;
          const doc1 = extHostDocuments.getAllDocumentData().find((data) => isEqual(data.document.uri, first.document.uri));
          assert.ok(doc1);
          assert.strictEqual(doc1?.document === first.document, true);
          const doc2 = extHostDocuments.getAllDocumentData().find((data) => isEqual(data.document.uri, second.document.uri));
          assert.ok(doc2);
          assert.strictEqual(doc2?.document === second.document, true);
          resolve();
        } catch (err) {
          reject(err);
        }
      }));
    });
    extHostNotebookDocuments.$acceptModelChanged(notebookUri, new SerializableObjectWithBuffers({
      versionId: notebook.apiNotebook.version + 1,
      rawEvents: [
        {
          kind: NotebookCellsChangeType.ModelChange,
          changes: [[0, 0, [{
            handle: 2,
            uri: CellUri.generate(notebookUri, 2),
            source: ["Hello", "World", "Hello World!"],
            eol: "\n",
            language: "test",
            cellKind: CellKind.Code,
            outputs: []
          }, {
            handle: 3,
            uri: CellUri.generate(notebookUri, 3),
            source: ["Hallo", "Welt", "Hallo Welt!"],
            eol: "\n",
            language: "test",
            cellKind: CellKind.Code,
            outputs: []
          }]]]
        }
      ]
    }), false);
    await p;
  });
  test("cell document stays open when notebook is still open", async function() {
    const docs = [];
    const addData = [];
    for (const cell of notebook.apiNotebook.getCells()) {
      const doc = extHostDocuments.getDocument(cell.document.uri);
      assert.ok(doc);
      assert.strictEqual(extHostDocuments.getDocument(cell.document.uri).isClosed, false);
      docs.push(doc);
      addData.push({
        EOL: "\n",
        isDirty: doc.isDirty,
        lines: doc.getText().split("\n"),
        languageId: doc.languageId,
        uri: doc.uri,
        versionId: doc.version,
        encoding: "utf8"
      });
    }
    extHostDocumentsAndEditors.$acceptDocumentsAndEditorsDelta({ addedDocuments: addData });
    extHostDocumentsAndEditors.$acceptDocumentsAndEditorsDelta({ removedDocuments: docs.map((d) => d.uri) });
    for (const cell of notebook.apiNotebook.getCells()) {
      assert.ok(extHostDocuments.getDocument(cell.document.uri));
      assert.strictEqual(extHostDocuments.getDocument(cell.document.uri).isClosed, false);
    }
    extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({ removedDocuments: [notebook.uri] }));
    for (const cell of notebook.apiNotebook.getCells()) {
      assert.throws(() => extHostDocuments.getDocument(cell.document.uri));
    }
    for (const doc of docs) {
      assert.strictEqual(doc.isClosed, true);
    }
  });
  test("cell document goes when cell is removed", async function() {
    assert.strictEqual(notebook.apiNotebook.cellCount, 2);
    const [cell1, cell2] = notebook.apiNotebook.getCells();
    extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
      versionId: 2,
      rawEvents: [
        {
          kind: NotebookCellsChangeType.ModelChange,
          changes: [[0, 1, []]]
        }
      ]
    }), false);
    assert.strictEqual(notebook.apiNotebook.cellCount, 1);
    assert.strictEqual(cell1.document.isClosed, true);
    assert.strictEqual(cell2.document.isClosed, false);
    assert.throws(() => extHostDocuments.getDocument(cell1.document.uri));
  });
  test("cell#index", function() {
    assert.strictEqual(notebook.apiNotebook.cellCount, 2);
    const [first, second] = notebook.apiNotebook.getCells();
    assert.strictEqual(first.index, 0);
    assert.strictEqual(second.index, 1);
    extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
      versionId: notebook.apiNotebook.version + 1,
      rawEvents: [{
        kind: NotebookCellsChangeType.ModelChange,
        changes: [[0, 1, []]]
      }]
    }), false);
    assert.strictEqual(notebook.apiNotebook.cellCount, 1);
    assert.strictEqual(second.index, 0);
    extHostNotebookDocuments.$acceptModelChanged(notebookUri, new SerializableObjectWithBuffers({
      versionId: notebook.apiNotebook.version + 1,
      rawEvents: [{
        kind: NotebookCellsChangeType.ModelChange,
        changes: [[0, 0, [{
          handle: 2,
          uri: CellUri.generate(notebookUri, 2),
          source: ["Hello", "World", "Hello World!"],
          eol: "\n",
          language: "test",
          cellKind: CellKind.Code,
          outputs: []
        }, {
          handle: 3,
          uri: CellUri.generate(notebookUri, 3),
          source: ["Hallo", "Welt", "Hallo Welt!"],
          eol: "\n",
          language: "test",
          cellKind: CellKind.Code,
          outputs: []
        }]]]
      }]
    }), false);
    assert.strictEqual(notebook.apiNotebook.cellCount, 3);
    assert.strictEqual(second.index, 2);
  });
  test("ERR MISSING extHostDocument for notebook cell: #116711", async function() {
    const p = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);
    extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
      versionId: 100,
      rawEvents: [{
        kind: NotebookCellsChangeType.ModelChange,
        changes: [[0, 2, [{
          handle: 3,
          uri: CellUri.generate(notebookUri, 3),
          source: ["### Heading"],
          eol: "\n",
          language: "markdown",
          cellKind: CellKind.Markup,
          outputs: []
        }, {
          handle: 4,
          uri: CellUri.generate(notebookUri, 4),
          source: ['console.log("aaa")', 'console.log("bbb")'],
          eol: "\n",
          language: "javascript",
          cellKind: CellKind.Code,
          outputs: []
        }]]]
      }]
    }), false);
    assert.strictEqual(notebook.apiNotebook.cellCount, 2);
    const event = await p;
    assert.strictEqual(event.notebook === notebook.apiNotebook, true);
    assert.strictEqual(event.contentChanges.length, 1);
    assert.strictEqual(event.contentChanges[0].range.end - event.contentChanges[0].range.start, 2);
    assert.strictEqual(event.contentChanges[0].removedCells[0].document.isClosed, true);
    assert.strictEqual(event.contentChanges[0].removedCells[1].document.isClosed, true);
    assert.strictEqual(event.contentChanges[0].addedCells.length, 2);
    assert.strictEqual(event.contentChanges[0].addedCells[0].document.isClosed, false);
    assert.strictEqual(event.contentChanges[0].addedCells[1].document.isClosed, false);
  });
  test("Opening a notebook results in VS Code firing the event onDidChangeActiveNotebookEditor twice #118470", function() {
    let count = 0;
    disposables.add(extHostNotebooks.onDidChangeActiveNotebookEditor(() => count += 1));
    extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({
      addedEditors: [{
        documentUri: notebookUri,
        id: "_notebook_editor_2",
        selections: [{ start: 0, end: 1 }],
        visibleRanges: [],
        viewType: "test"
      }]
    }));
    extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({
      newActiveEditor: "_notebook_editor_2"
    }));
    assert.strictEqual(count, 1);
  });
  test("unset active notebook editor", function() {
    const editor = extHostNotebooks.activeNotebookEditor;
    assert.ok(editor !== void 0);
    extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({ newActiveEditor: void 0 }));
    assert.ok(extHostNotebooks.activeNotebookEditor === editor);
    extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({}));
    assert.ok(extHostNotebooks.activeNotebookEditor === editor);
    extHostNotebooks.$acceptDocumentAndEditorsDelta(new SerializableObjectWithBuffers({ newActiveEditor: null }));
    assert.ok(extHostNotebooks.activeNotebookEditor === void 0);
  });
  test("change cell language triggers onDidChange events", async function() {
    const first = notebook.apiNotebook.cellAt(0);
    assert.strictEqual(first.document.languageId, "markdown");
    const removed = Event.toPromise(extHostDocuments.onDidRemoveDocument);
    const added = Event.toPromise(extHostDocuments.onDidAddDocument);
    extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
      versionId: 12,
      rawEvents: [{
        kind: NotebookCellsChangeType.ChangeCellLanguage,
        index: 0,
        language: "fooLang"
      }]
    }), false);
    const removedDoc = await removed;
    const addedDoc = await added;
    assert.strictEqual(first.document.languageId, "fooLang");
    assert.ok(removedDoc === addedDoc);
  });
  test("onDidChangeNotebook-event, cell changes", async function() {
    const p = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);
    extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
      versionId: 12,
      rawEvents: [{
        kind: NotebookCellsChangeType.ChangeCellMetadata,
        index: 0,
        metadata: { foo: 1 }
      }, {
        kind: NotebookCellsChangeType.ChangeCellMetadata,
        index: 1,
        metadata: { foo: 2 }
      }, {
        kind: NotebookCellsChangeType.Output,
        index: 1,
        outputs: [
          {
            items: [{
              valueBytes: VSBuffer.fromByteArray([0, 2, 3]),
              mime: "text/plain"
            }],
            outputId: "1"
          }
        ]
      }]
    }), false, void 0);
    const event = await p;
    assert.strictEqual(event.notebook === notebook.apiNotebook, true);
    assert.strictEqual(event.contentChanges.length, 0);
    assert.strictEqual(event.cellChanges.length, 2);
    const [first, second] = event.cellChanges;
    assert.deepStrictEqual(first.metadata, first.cell.metadata);
    assert.deepStrictEqual(first.executionSummary, void 0);
    assert.deepStrictEqual(first.outputs, void 0);
    assert.deepStrictEqual(first.document, void 0);
    assert.deepStrictEqual(second.outputs, second.cell.outputs);
    assert.deepStrictEqual(second.metadata, second.cell.metadata);
    assert.deepStrictEqual(second.executionSummary, void 0);
    assert.deepStrictEqual(second.document, void 0);
  });
  test("onDidChangeNotebook-event, notebook metadata", async function() {
    const p = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);
    extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({ versionId: 12, rawEvents: [] }), false, { foo: 2 });
    const event = await p;
    assert.strictEqual(event.notebook === notebook.apiNotebook, true);
    assert.strictEqual(event.contentChanges.length, 0);
    assert.strictEqual(event.cellChanges.length, 0);
    assert.deepStrictEqual(event.metadata, { foo: 2 });
  });
  test("onDidChangeNotebook-event, froozen data", async function() {
    const p = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);
    extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({ versionId: 12, rawEvents: [] }), false, { foo: 2 });
    const event = await p;
    assert.ok(Object.isFrozen(event));
    assert.ok(Object.isFrozen(event.cellChanges));
    assert.ok(Object.isFrozen(event.contentChanges));
    assert.ok(Object.isFrozen(event.notebook));
    assert.ok(!Object.isFrozen(event.metadata));
  });
  test("change cell language and onDidChangeNotebookDocument", async function() {
    const p = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);
    const first = notebook.apiNotebook.cellAt(0);
    assert.strictEqual(first.document.languageId, "markdown");
    extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
      versionId: 12,
      rawEvents: [{
        kind: NotebookCellsChangeType.ChangeCellLanguage,
        index: 0,
        language: "fooLang"
      }]
    }), false);
    const event = await p;
    assert.strictEqual(event.notebook === notebook.apiNotebook, true);
    assert.strictEqual(event.contentChanges.length, 0);
    assert.strictEqual(event.cellChanges.length, 1);
    const [cellChange] = event.cellChanges;
    assert.strictEqual(cellChange.cell === first, true);
    assert.ok(cellChange.document === first.document);
    assert.ok(cellChange.executionSummary === void 0);
    assert.ok(cellChange.metadata === void 0);
    assert.ok(cellChange.outputs === void 0);
  });
  test("change notebook cell document and onDidChangeNotebookDocument", async function() {
    const p = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);
    const first = notebook.apiNotebook.cellAt(0);
    extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
      versionId: 12,
      rawEvents: [{
        kind: NotebookCellsChangeType.ChangeCellContent,
        index: 0
      }]
    }), false);
    const event = await p;
    assert.strictEqual(event.notebook === notebook.apiNotebook, true);
    assert.strictEqual(event.contentChanges.length, 0);
    assert.strictEqual(event.cellChanges.length, 1);
    const [cellChange] = event.cellChanges;
    assert.strictEqual(cellChange.cell === first, true);
    assert.ok(cellChange.document === first.document);
    assert.ok(cellChange.executionSummary === void 0);
    assert.ok(cellChange.metadata === void 0);
    assert.ok(cellChange.outputs === void 0);
  });
  async function replaceOutputs(cellIndex, outputId, outputItems) {
    const changeEvent = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);
    extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
      versionId: notebook.apiNotebook.version + 1,
      rawEvents: [{
        kind: NotebookCellsChangeType.Output,
        index: cellIndex,
        outputs: [{ outputId, items: outputItems }]
      }]
    }), false);
    await changeEvent;
  }
  async function appendOutputItem(cellIndex, outputId, outputItems) {
    const changeEvent = Event.toPromise(extHostNotebookDocuments.onDidChangeNotebookDocument);
    extHostNotebookDocuments.$acceptModelChanged(notebook.uri, new SerializableObjectWithBuffers({
      versionId: notebook.apiNotebook.version + 1,
      rawEvents: [{
        kind: NotebookCellsChangeType.OutputItem,
        index: cellIndex,
        append: true,
        outputId,
        outputItems
      }]
    }), false);
    await changeEvent;
  }
  test("Append multiple text/plain output items", async function() {
    await replaceOutputs(1, "1", [{ mime: "text/plain", valueBytes: VSBuffer.fromString("foo") }]);
    await appendOutputItem(1, "1", [{ mime: "text/plain", valueBytes: VSBuffer.fromString("bar") }]);
    await appendOutputItem(1, "1", [{ mime: "text/plain", valueBytes: VSBuffer.fromString("baz") }]);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs.length, 1);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items.length, 3);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[0].mime, "text/plain");
    assert.strictEqual(VSBuffer.wrap(notebook.apiNotebook.cellAt(1).outputs[0].items[0].data).toString(), "foo");
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[1].mime, "text/plain");
    assert.strictEqual(VSBuffer.wrap(notebook.apiNotebook.cellAt(1).outputs[0].items[1].data).toString(), "bar");
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[2].mime, "text/plain");
    assert.strictEqual(VSBuffer.wrap(notebook.apiNotebook.cellAt(1).outputs[0].items[2].data).toString(), "baz");
  });
  test("Append multiple stdout stream output items to an output with another mime", async function() {
    await replaceOutputs(1, "1", [{ mime: "text/plain", valueBytes: VSBuffer.fromString("foo") }]);
    await appendOutputItem(1, "1", [{ mime: "application/vnd.code.notebook.stdout", valueBytes: VSBuffer.fromString("bar") }]);
    await appendOutputItem(1, "1", [{ mime: "application/vnd.code.notebook.stdout", valueBytes: VSBuffer.fromString("baz") }]);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs.length, 1);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items.length, 3);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[0].mime, "text/plain");
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[1].mime, "application/vnd.code.notebook.stdout");
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[2].mime, "application/vnd.code.notebook.stdout");
  });
  test("Compress multiple stdout stream output items", async function() {
    await replaceOutputs(1, "1", [{ mime: "application/vnd.code.notebook.stdout", valueBytes: VSBuffer.fromString("foo") }]);
    await appendOutputItem(1, "1", [{ mime: "application/vnd.code.notebook.stdout", valueBytes: VSBuffer.fromString("bar") }]);
    await appendOutputItem(1, "1", [{ mime: "application/vnd.code.notebook.stdout", valueBytes: VSBuffer.fromString("baz") }]);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs.length, 1);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items.length, 1);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[0].mime, "application/vnd.code.notebook.stdout");
    assert.strictEqual(VSBuffer.wrap(notebook.apiNotebook.cellAt(1).outputs[0].items[0].data).toString(), "foobarbaz");
  });
  test("Compress multiple stdout stream output items (with support for terminal escape code -> \x1B[A)", async function() {
    await replaceOutputs(1, "1", [{ mime: "application/vnd.code.notebook.stdout", valueBytes: VSBuffer.fromString("\nfoo") }]);
    await appendOutputItem(1, "1", [{ mime: "application/vnd.code.notebook.stdout", valueBytes: VSBuffer.fromString(`${String.fromCharCode(27)}[Abar`) }]);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs.length, 1);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items.length, 1);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[0].mime, "application/vnd.code.notebook.stdout");
    assert.strictEqual(VSBuffer.wrap(notebook.apiNotebook.cellAt(1).outputs[0].items[0].data).toString(), "bar");
  });
  test("Compress multiple stdout stream output items (with support for terminal escape code -> \r character)", async function() {
    await replaceOutputs(1, "1", [{ mime: "application/vnd.code.notebook.stdout", valueBytes: VSBuffer.fromString("foo") }]);
    await appendOutputItem(1, "1", [{ mime: "application/vnd.code.notebook.stdout", valueBytes: VSBuffer.fromString(`\rbar`) }]);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs.length, 1);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items.length, 1);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[0].mime, "application/vnd.code.notebook.stdout");
    assert.strictEqual(VSBuffer.wrap(notebook.apiNotebook.cellAt(1).outputs[0].items[0].data).toString(), "bar");
  });
  test("Compress multiple stderr stream output items", async function() {
    await replaceOutputs(1, "1", [{ mime: "application/vnd.code.notebook.stderr", valueBytes: VSBuffer.fromString("foo") }]);
    await appendOutputItem(1, "1", [{ mime: "application/vnd.code.notebook.stderr", valueBytes: VSBuffer.fromString("bar") }]);
    await appendOutputItem(1, "1", [{ mime: "application/vnd.code.notebook.stderr", valueBytes: VSBuffer.fromString("baz") }]);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs.length, 1);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items.length, 1);
    assert.strictEqual(notebook.apiNotebook.cellAt(1).outputs[0].items[0].mime, "application/vnd.code.notebook.stderr");
    assert.strictEqual(VSBuffer.wrap(notebook.apiNotebook.cellAt(1).outputs[0].items[0].data).toString(), "foobarbaz");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcZXh0SG9zdE5vdGVib29rLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCB7IEV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzLmpzJztcbmltcG9ydCB7IFRlc3RSUENQcm90b2NvbCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UlBDUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBJTW9kZWxBZGRlZERhdGEsIE1haW5Db250ZXh0LCBNYWluVGhyZWFkQ29tbWFuZHNTaGFwZSwgTWFpblRocmVhZE5vdGVib29rU2hhcGUsIE5vdGVib29rQ2VsbHNDaGFuZ2VkRXZlbnREdG8sIE5vdGVib29rT3V0cHV0SXRlbUR0byB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IEV4dEhvc3ROb3RlYm9va0NvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdE5vdGVib29rLmpzJztcbmltcG9ydCB7IEV4dEhvc3ROb3RlYm9va0RvY3VtZW50IH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3ROb3RlYm9va0RvY3VtZW50LmpzJztcbmltcG9ydCB7IENlbGxLaW5kLCBDZWxsVXJpLCBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbnRyaWIvbm90ZWJvb2svY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RG9jdW1lbnRzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3REb2N1bWVudHMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENvbW1hbmRzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Tm90ZWJvb2tEb2N1bWVudHMgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLmpzJztcbmltcG9ydCB7IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IElFeHRIb3N0VGVsZW1ldHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENvbnN1bWVyRmlsZVN5c3RlbSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0RmlsZVN5c3RlbUNvbnN1bWVyLmpzJztcbmltcG9ydCB7IEV4dEhvc3RGaWxlU3lzdGVtSW5mbyB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0RmlsZVN5c3RlbUluZm8uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0U2VhcmNoIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RTZWFyY2guanMnO1xuaW1wb3J0IHsgVVJJVHJhbnNmb3JtZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RVcmlUcmFuc2Zvcm1lclNlcnZpY2UuanMnO1xuXG5zdWl0ZSgnTm90ZWJvb2tDZWxsI0RvY3VtZW50JywgZnVuY3Rpb24gKCkge1xuXHRsZXQgcnBjUHJvdG9jb2w6IFRlc3RSUENQcm90b2NvbDtcblx0bGV0IG5vdGVib29rOiBFeHRIb3N0Tm90ZWJvb2tEb2N1bWVudDtcblx0bGV0IGV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzOiBFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycztcblx0bGV0IGV4dEhvc3REb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHM7XG5cdGxldCBleHRIb3N0Tm90ZWJvb2tzOiBFeHRIb3N0Tm90ZWJvb2tDb250cm9sbGVyO1xuXHRsZXQgZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzOiBFeHRIb3N0Tm90ZWJvb2tEb2N1bWVudHM7XG5cdGxldCBleHRIb3N0Q29uc3VtZXJGaWxlU3lzdGVtOiBFeHRIb3N0Q29uc3VtZXJGaWxlU3lzdGVtO1xuXHRsZXQgZXh0SG9zdFNlYXJjaDogRXh0SG9zdFNlYXJjaDtcblxuXHRjb25zdCBub3RlYm9va1VyaSA9IFVSSS5wYXJzZSgndGVzdDovLy9ub3RlYm9vay5maWxlJyk7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHRlYXJkb3duKGZ1bmN0aW9uICgpIHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzZXR1cChhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0cnBjUHJvdG9jb2wgPSBuZXcgVGVzdFJQQ1Byb3RvY29sKCk7XG5cdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRDb21tYW5kcywgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkQ29tbWFuZHNTaGFwZT4oKSB7XG5cdFx0XHRvdmVycmlkZSAkcmVnaXN0ZXJDb21tYW5kKCkgeyB9XG5cdFx0fSk7XG5cdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWROb3RlYm9vaywgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkTm90ZWJvb2tTaGFwZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyAkcmVnaXN0ZXJOb3RlYm9va1NlcmlhbGl6ZXIoKSB7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jICR1bnJlZ2lzdGVyTm90ZWJvb2tTZXJpYWxpemVyKCkgeyB9XG5cdFx0fSk7XG5cdFx0ZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMgPSBuZXcgRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMocnBjUHJvdG9jb2wsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRleHRIb3N0RG9jdW1lbnRzID0gbmV3IEV4dEhvc3REb2N1bWVudHMocnBjUHJvdG9jb2wsIGV4dEhvc3REb2N1bWVudHNBbmRFZGl0b3JzKTtcblx0XHRleHRIb3N0Q29uc3VtZXJGaWxlU3lzdGVtID0gbmV3IEV4dEhvc3RDb25zdW1lckZpbGVTeXN0ZW0ocnBjUHJvdG9jb2wsIG5ldyBFeHRIb3N0RmlsZVN5c3RlbUluZm8oKSk7XG5cdFx0ZXh0SG9zdFNlYXJjaCA9IG5ldyBFeHRIb3N0U2VhcmNoKHJwY1Byb3RvY29sLCBuZXcgVVJJVHJhbnNmb3JtZXJTZXJ2aWNlKG51bGwpLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0ZXh0SG9zdE5vdGVib29rcyA9IG5ldyBFeHRIb3N0Tm90ZWJvb2tDb250cm9sbGVyKHJwY1Byb3RvY29sLCBuZXcgRXh0SG9zdENvbW1hbmRzKHJwY1Byb3RvY29sLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0SG9zdFRlbGVtZXRyeT4oKSB7XG5cdFx0XHRvdmVycmlkZSBvbkV4dGVuc2lvbkVycm9yKCk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9KSwgZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMsIGV4dEhvc3REb2N1bWVudHMsIGV4dEhvc3RDb25zdW1lckZpbGVTeXN0ZW0sIGV4dEhvc3RTZWFyY2gsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRleHRIb3N0Tm90ZWJvb2tEb2N1bWVudHMgPSBuZXcgRXh0SG9zdE5vdGVib29rRG9jdW1lbnRzKGV4dEhvc3ROb3RlYm9va3MpO1xuXG5cdFx0Y29uc3QgcmVnID0gZXh0SG9zdE5vdGVib29rcy5yZWdpc3Rlck5vdGVib29rU2VyaWFsaXplcihudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24sICd0ZXN0JywgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazx2c2NvZGUuTm90ZWJvb2tTZXJpYWxpemVyPigpIHsgfSk7XG5cdFx0ZXh0SG9zdE5vdGVib29rcy4kYWNjZXB0RG9jdW1lbnRBbmRFZGl0b3JzRGVsdGEobmV3IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzKHtcblx0XHRcdGFkZGVkRG9jdW1lbnRzOiBbe1xuXHRcdFx0XHR1cmk6IG5vdGVib29rVXJpLFxuXHRcdFx0XHR2aWV3VHlwZTogJ3Rlc3QnLFxuXHRcdFx0XHR2ZXJzaW9uSWQ6IDAsXG5cdFx0XHRcdGNlbGxzOiBbe1xuXHRcdFx0XHRcdGhhbmRsZTogMCxcblx0XHRcdFx0XHR1cmk6IENlbGxVcmkuZ2VuZXJhdGUobm90ZWJvb2tVcmksIDApLFxuXHRcdFx0XHRcdHNvdXJjZTogWycjIyMgSGVhZGluZyddLFxuXHRcdFx0XHRcdGVvbDogJ1xcbicsXG5cdFx0XHRcdFx0bGFuZ3VhZ2U6ICdtYXJrZG93bicsXG5cdFx0XHRcdFx0Y2VsbEtpbmQ6IENlbGxLaW5kLk1hcmt1cCxcblx0XHRcdFx0XHRvdXRwdXRzOiBbXSxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGhhbmRsZTogMSxcblx0XHRcdFx0XHR1cmk6IENlbGxVcmkuZ2VuZXJhdGUobm90ZWJvb2tVcmksIDEpLFxuXHRcdFx0XHRcdHNvdXJjZTogWydjb25zb2xlLmxvZyhcImFhYVwiKScsICdjb25zb2xlLmxvZyhcImJiYlwiKSddLFxuXHRcdFx0XHRcdGVvbDogJ1xcbicsXG5cdFx0XHRcdFx0bGFuZ3VhZ2U6ICdqYXZhc2NyaXB0Jyxcblx0XHRcdFx0XHRjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSxcblx0XHRcdFx0XHRvdXRwdXRzOiBbXSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9XSxcblx0XHRcdGFkZGVkRWRpdG9yczogW3tcblx0XHRcdFx0ZG9jdW1lbnRVcmk6IG5vdGVib29rVXJpLFxuXHRcdFx0XHRpZDogJ19ub3RlYm9va19lZGl0b3JfMCcsXG5cdFx0XHRcdHNlbGVjdGlvbnM6IFt7IHN0YXJ0OiAwLCBlbmQ6IDEgfV0sXG5cdFx0XHRcdHZpc2libGVSYW5nZXM6IFtdLFxuXHRcdFx0XHR2aWV3VHlwZTogJ3Rlc3QnXG5cdFx0XHR9XVxuXHRcdH0pKTtcblx0XHRleHRIb3N0Tm90ZWJvb2tzLiRhY2NlcHREb2N1bWVudEFuZEVkaXRvcnNEZWx0YShuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoeyBuZXdBY3RpdmVFZGl0b3I6ICdfbm90ZWJvb2tfZWRpdG9yXzAnIH0pKTtcblxuXHRcdG5vdGVib29rID0gZXh0SG9zdE5vdGVib29rcy5ub3RlYm9va0RvY3VtZW50c1swXSE7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQocmVnKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobm90ZWJvb2spO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChleHRIb3N0RG9jdW1lbnRzKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdjZWxsIGRvY3VtZW50IGlzIHZzY29kZS5UZXh0RG9jdW1lbnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbENvdW50LCAyKTtcblxuXHRcdGNvbnN0IFtjMSwgYzJdID0gbm90ZWJvb2suYXBpTm90ZWJvb2suZ2V0Q2VsbHMoKTtcblx0XHRjb25zdCBkMSA9IGV4dEhvc3REb2N1bWVudHMuZ2V0RG9jdW1lbnQoYzEuZG9jdW1lbnQudXJpKTtcblxuXHRcdGFzc2VydC5vayhkMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGQxLmxhbmd1YWdlSWQsIGMxLmRvY3VtZW50Lmxhbmd1YWdlSWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkMS52ZXJzaW9uLCAxKTtcblxuXHRcdGNvbnN0IGQyID0gZXh0SG9zdERvY3VtZW50cy5nZXREb2N1bWVudChjMi5kb2N1bWVudC51cmkpO1xuXHRcdGFzc2VydC5vayhkMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGQyLmxhbmd1YWdlSWQsIGMyLmRvY3VtZW50Lmxhbmd1YWdlSWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkMi52ZXJzaW9uLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnY2VsbCBkb2N1bWVudCBnb2VzIHdoZW4gbm90ZWJvb2sgY2xvc2VzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGNlbGxVcmlzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY2VsbCBvZiBub3RlYm9vay5hcGlOb3RlYm9vay5nZXRDZWxscygpKSB7XG5cdFx0XHRhc3NlcnQub2soZXh0SG9zdERvY3VtZW50cy5nZXREb2N1bWVudChjZWxsLmRvY3VtZW50LnVyaSkpO1xuXHRcdFx0Y2VsbFVyaXMucHVzaChjZWxsLmRvY3VtZW50LnVyaS50b1N0cmluZygpKTtcblx0XHR9XG5cblx0XHRjb25zdCByZW1vdmVkQ2VsbFVyaXM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcmVnID0gZXh0SG9zdERvY3VtZW50cy5vbkRpZFJlbW92ZURvY3VtZW50KGRvYyA9PiB7XG5cdFx0XHRyZW1vdmVkQ2VsbFVyaXMucHVzaChkb2MudXJpLnRvU3RyaW5nKCkpO1xuXHRcdH0pO1xuXG5cdFx0ZXh0SG9zdE5vdGVib29rcy4kYWNjZXB0RG9jdW1lbnRBbmRFZGl0b3JzRGVsdGEobmV3IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzKHsgcmVtb3ZlZERvY3VtZW50czogW25vdGVib29rLnVyaV0gfSkpO1xuXHRcdHJlZy5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtb3ZlZENlbGxVcmlzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZW1vdmVkQ2VsbFVyaXMuc29ydCgpLCBjZWxsVXJpcy5zb3J0KCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdjZWxsIGRvY3VtZW50IGlzIHZzY29kZS5UZXh0RG9jdW1lbnQgYWZ0ZXIgY2hhbmdpbmcgaXQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBwID0gbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLm9uRGlkQ2hhbmdlTm90ZWJvb2tEb2N1bWVudChlID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5jb250ZW50Q2hhbmdlcy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmNvbnRlbnRDaGFuZ2VzWzBdLmFkZGVkQ2VsbHMubGVuZ3RoLCAyKTtcblxuXHRcdFx0XHRcdGNvbnN0IFtmaXJzdCwgc2Vjb25kXSA9IGUuY29udGVudENoYW5nZXNbMF0uYWRkZWRDZWxscztcblxuXHRcdFx0XHRcdGNvbnN0IGRvYzEgPSBleHRIb3N0RG9jdW1lbnRzLmdldEFsbERvY3VtZW50RGF0YSgpLmZpbmQoZGF0YSA9PiBpc0VxdWFsKGRhdGEuZG9jdW1lbnQudXJpLCBmaXJzdC5kb2N1bWVudC51cmkpKTtcblx0XHRcdFx0XHRhc3NlcnQub2soZG9jMSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvYzE/LmRvY3VtZW50ID09PSBmaXJzdC5kb2N1bWVudCwgdHJ1ZSk7XG5cblx0XHRcdFx0XHRjb25zdCBkb2MyID0gZXh0SG9zdERvY3VtZW50cy5nZXRBbGxEb2N1bWVudERhdGEoKS5maW5kKGRhdGEgPT4gaXNFcXVhbChkYXRhLmRvY3VtZW50LnVyaSwgc2Vjb25kLmRvY3VtZW50LnVyaSkpO1xuXHRcdFx0XHRcdGFzc2VydC5vayhkb2MyKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZG9jMj8uZG9jdW1lbnQgPT09IHNlY29uZC5kb2N1bWVudCwgdHJ1ZSk7XG5cblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0cmVqZWN0KGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdH0pO1xuXG5cdFx0ZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLiRhY2NlcHRNb2RlbENoYW5nZWQobm90ZWJvb2tVcmksIG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyh7XG5cdFx0XHR2ZXJzaW9uSWQ6IG5vdGVib29rLmFwaU5vdGVib29rLnZlcnNpb24gKyAxLFxuXHRcdFx0cmF3RXZlbnRzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Nb2RlbENoYW5nZSxcblx0XHRcdFx0XHRjaGFuZ2VzOiBbWzAsIDAsIFt7XG5cdFx0XHRcdFx0XHRoYW5kbGU6IDIsXG5cdFx0XHRcdFx0XHR1cmk6IENlbGxVcmkuZ2VuZXJhdGUobm90ZWJvb2tVcmksIDIpLFxuXHRcdFx0XHRcdFx0c291cmNlOiBbJ0hlbGxvJywgJ1dvcmxkJywgJ0hlbGxvIFdvcmxkISddLFxuXHRcdFx0XHRcdFx0ZW9sOiAnXFxuJyxcblx0XHRcdFx0XHRcdGxhbmd1YWdlOiAndGVzdCcsXG5cdFx0XHRcdFx0XHRjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSxcblx0XHRcdFx0XHRcdG91dHB1dHM6IFtdLFxuXHRcdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRcdGhhbmRsZTogMyxcblx0XHRcdFx0XHRcdHVyaTogQ2VsbFVyaS5nZW5lcmF0ZShub3RlYm9va1VyaSwgMyksXG5cdFx0XHRcdFx0XHRzb3VyY2U6IFsnSGFsbG8nLCAnV2VsdCcsICdIYWxsbyBXZWx0ISddLFxuXHRcdFx0XHRcdFx0ZW9sOiAnXFxuJyxcblx0XHRcdFx0XHRcdGxhbmd1YWdlOiAndGVzdCcsXG5cdFx0XHRcdFx0XHRjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSxcblx0XHRcdFx0XHRcdG91dHB1dHM6IFtdLFxuXHRcdFx0XHRcdH1dXV1cblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH0pLCBmYWxzZSk7XG5cblx0XHRhd2FpdCBwO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ2NlbGwgZG9jdW1lbnQgc3RheXMgb3BlbiB3aGVuIG5vdGVib29rIGlzIHN0aWxsIG9wZW4nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBkb2NzOiB2c2NvZGUuVGV4dERvY3VtZW50W10gPSBbXTtcblx0XHRjb25zdCBhZGREYXRhOiBJTW9kZWxBZGRlZERhdGFbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY2VsbCBvZiBub3RlYm9vay5hcGlOb3RlYm9vay5nZXRDZWxscygpKSB7XG5cdFx0XHRjb25zdCBkb2MgPSBleHRIb3N0RG9jdW1lbnRzLmdldERvY3VtZW50KGNlbGwuZG9jdW1lbnQudXJpKTtcblx0XHRcdGFzc2VydC5vayhkb2MpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3REb2N1bWVudHMuZ2V0RG9jdW1lbnQoY2VsbC5kb2N1bWVudC51cmkpLmlzQ2xvc2VkLCBmYWxzZSk7XG5cdFx0XHRkb2NzLnB1c2goZG9jKTtcblx0XHRcdGFkZERhdGEucHVzaCh7XG5cdFx0XHRcdEVPTDogJ1xcbicsXG5cdFx0XHRcdGlzRGlydHk6IGRvYy5pc0RpcnR5LFxuXHRcdFx0XHRsaW5lczogZG9jLmdldFRleHQoKS5zcGxpdCgnXFxuJyksXG5cdFx0XHRcdGxhbmd1YWdlSWQ6IGRvYy5sYW5ndWFnZUlkLFxuXHRcdFx0XHR1cmk6IGRvYy51cmksXG5cdFx0XHRcdHZlcnNpb25JZDogZG9jLnZlcnNpb24sXG5cdFx0XHRcdGVuY29kaW5nOiAndXRmOCdcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIHRoaXMgY2FsbCBoYXBwZW5zIHdoZW4gb3BlbmluZyBhIGRvY3VtZW50IG9uIHRoZSBtYWluIHNpZGVcblx0XHRleHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycy4kYWNjZXB0RG9jdW1lbnRzQW5kRWRpdG9yc0RlbHRhKHsgYWRkZWREb2N1bWVudHM6IGFkZERhdGEgfSk7XG5cblx0XHQvLyB0aGlzIGNhbGwgaGFwcGVucyB3aGVuIGNsb3NpbmcgYSBkb2N1bWVudCBmcm9tIHRoZSBtYWluIHNpZGVcblx0XHRleHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycy4kYWNjZXB0RG9jdW1lbnRzQW5kRWRpdG9yc0RlbHRhKHsgcmVtb3ZlZERvY3VtZW50czogZG9jcy5tYXAoZCA9PiBkLnVyaSkgfSk7XG5cblx0XHQvLyBub3RlYm9vayBpcyBzdGlsbCBvcGVuIC0+IGNlbGwgZG9jdW1lbnRzIHN0YXkgb3BlblxuXHRcdGZvciAoY29uc3QgY2VsbCBvZiBub3RlYm9vay5hcGlOb3RlYm9vay5nZXRDZWxscygpKSB7XG5cdFx0XHRhc3NlcnQub2soZXh0SG9zdERvY3VtZW50cy5nZXREb2N1bWVudChjZWxsLmRvY3VtZW50LnVyaSkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dEhvc3REb2N1bWVudHMuZ2V0RG9jdW1lbnQoY2VsbC5kb2N1bWVudC51cmkpLmlzQ2xvc2VkLCBmYWxzZSk7XG5cdFx0fVxuXG5cdFx0Ly8gY2xvc2Ugbm90ZWJvb2sgLT4gZG9jcyBhcmUgY2xvc2VkXG5cdFx0ZXh0SG9zdE5vdGVib29rcy4kYWNjZXB0RG9jdW1lbnRBbmRFZGl0b3JzRGVsdGEobmV3IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzKHsgcmVtb3ZlZERvY3VtZW50czogW25vdGVib29rLnVyaV0gfSkpO1xuXHRcdGZvciAoY29uc3QgY2VsbCBvZiBub3RlYm9vay5hcGlOb3RlYm9vay5nZXRDZWxscygpKSB7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGV4dEhvc3REb2N1bWVudHMuZ2V0RG9jdW1lbnQoY2VsbC5kb2N1bWVudC51cmkpKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBkb2Mgb2YgZG9jcykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvYy5pc0Nsb3NlZCwgdHJ1ZSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdjZWxsIGRvY3VtZW50IGdvZXMgd2hlbiBjZWxsIGlzIHJlbW92ZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbENvdW50LCAyKTtcblx0XHRjb25zdCBbY2VsbDEsIGNlbGwyXSA9IG5vdGVib29rLmFwaU5vdGVib29rLmdldENlbGxzKCk7XG5cblx0XHRleHRIb3N0Tm90ZWJvb2tEb2N1bWVudHMuJGFjY2VwdE1vZGVsQ2hhbmdlZChub3RlYm9vay51cmksIG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyh7XG5cdFx0XHR2ZXJzaW9uSWQ6IDIsXG5cdFx0XHRyYXdFdmVudHM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk1vZGVsQ2hhbmdlLFxuXHRcdFx0XHRcdGNoYW5nZXM6IFtbMCwgMSwgW11dXVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSksIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQ291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjZWxsMS5kb2N1bWVudC5pc0Nsb3NlZCwgdHJ1ZSk7IC8vIHJlZiBzdGlsbCBhbGl2ZSFcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbDIuZG9jdW1lbnQuaXNDbG9zZWQsIGZhbHNlKTtcblxuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZXh0SG9zdERvY3VtZW50cy5nZXREb2N1bWVudChjZWxsMS5kb2N1bWVudC51cmkpKTtcblx0fSk7XG5cblx0dGVzdCgnY2VsbCNpbmRleCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQ291bnQsIDIpO1xuXHRcdGNvbnN0IFtmaXJzdCwgc2Vjb25kXSA9IG5vdGVib29rLmFwaU5vdGVib29rLmdldENlbGxzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmluZGV4LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLmluZGV4LCAxKTtcblxuXHRcdC8vIHJlbW92ZSBmaXJzdCBjZWxsXG5cdFx0ZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLiRhY2NlcHRNb2RlbENoYW5nZWQobm90ZWJvb2sudXJpLCBuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoe1xuXHRcdFx0dmVyc2lvbklkOiBub3RlYm9vay5hcGlOb3RlYm9vay52ZXJzaW9uICsgMSxcblx0XHRcdHJhd0V2ZW50czogW3tcblx0XHRcdFx0a2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuTW9kZWxDaGFuZ2UsXG5cdFx0XHRcdGNoYW5nZXM6IFtbMCwgMSwgW11dXVxuXHRcdFx0fV1cblx0XHR9KSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxDb3VudCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZC5pbmRleCwgMCk7XG5cblx0XHRleHRIb3N0Tm90ZWJvb2tEb2N1bWVudHMuJGFjY2VwdE1vZGVsQ2hhbmdlZChub3RlYm9va1VyaSwgbmV3IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzKHtcblx0XHRcdHZlcnNpb25JZDogbm90ZWJvb2suYXBpTm90ZWJvb2sudmVyc2lvbiArIDEsXG5cdFx0XHRyYXdFdmVudHM6IFt7XG5cdFx0XHRcdGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk1vZGVsQ2hhbmdlLFxuXHRcdFx0XHRjaGFuZ2VzOiBbWzAsIDAsIFt7XG5cdFx0XHRcdFx0aGFuZGxlOiAyLFxuXHRcdFx0XHRcdHVyaTogQ2VsbFVyaS5nZW5lcmF0ZShub3RlYm9va1VyaSwgMiksXG5cdFx0XHRcdFx0c291cmNlOiBbJ0hlbGxvJywgJ1dvcmxkJywgJ0hlbGxvIFdvcmxkISddLFxuXHRcdFx0XHRcdGVvbDogJ1xcbicsXG5cdFx0XHRcdFx0bGFuZ3VhZ2U6ICd0ZXN0Jyxcblx0XHRcdFx0XHRjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSxcblx0XHRcdFx0XHRvdXRwdXRzOiBbXSxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGhhbmRsZTogMyxcblx0XHRcdFx0XHR1cmk6IENlbGxVcmkuZ2VuZXJhdGUobm90ZWJvb2tVcmksIDMpLFxuXHRcdFx0XHRcdHNvdXJjZTogWydIYWxsbycsICdXZWx0JywgJ0hhbGxvIFdlbHQhJ10sXG5cdFx0XHRcdFx0ZW9sOiAnXFxuJyxcblx0XHRcdFx0XHRsYW5ndWFnZTogJ3Rlc3QnLFxuXHRcdFx0XHRcdGNlbGxLaW5kOiBDZWxsS2luZC5Db2RlLFxuXHRcdFx0XHRcdG91dHB1dHM6IFtdLFxuXHRcdFx0XHR9XV1dXG5cdFx0XHR9XVxuXHRcdH0pLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbENvdW50LCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kLmluZGV4LCAyKTtcblx0fSk7XG5cblx0dGVzdCgnRVJSIE1JU1NJTkcgZXh0SG9zdERvY3VtZW50IGZvciBub3RlYm9vayBjZWxsOiAjMTE2NzExJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgcCA9IEV2ZW50LnRvUHJvbWlzZShleHRIb3N0Tm90ZWJvb2tEb2N1bWVudHMub25EaWRDaGFuZ2VOb3RlYm9va0RvY3VtZW50KTtcblxuXHRcdC8vIERPTidUIGNhbGwgdGhpcywgbWFrZSBzdXJlIHRoZSBjZWxsLWRvY3VtZW50cyBoYXZlIG5vdCBiZWVuIGNyZWF0ZWQgeWV0XG5cdFx0Ly8gYXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLm5vdGVib29rRG9jdW1lbnQuY2VsbENvdW50LCAyKTtcblxuXHRcdGV4dEhvc3ROb3RlYm9va0RvY3VtZW50cy4kYWNjZXB0TW9kZWxDaGFuZ2VkKG5vdGVib29rLnVyaSwgbmV3IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzKHtcblx0XHRcdHZlcnNpb25JZDogMTAwLFxuXHRcdFx0cmF3RXZlbnRzOiBbe1xuXHRcdFx0XHRraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Nb2RlbENoYW5nZSxcblx0XHRcdFx0Y2hhbmdlczogW1swLCAyLCBbe1xuXHRcdFx0XHRcdGhhbmRsZTogMyxcblx0XHRcdFx0XHR1cmk6IENlbGxVcmkuZ2VuZXJhdGUobm90ZWJvb2tVcmksIDMpLFxuXHRcdFx0XHRcdHNvdXJjZTogWycjIyMgSGVhZGluZyddLFxuXHRcdFx0XHRcdGVvbDogJ1xcbicsXG5cdFx0XHRcdFx0bGFuZ3VhZ2U6ICdtYXJrZG93bicsXG5cdFx0XHRcdFx0Y2VsbEtpbmQ6IENlbGxLaW5kLk1hcmt1cCxcblx0XHRcdFx0XHRvdXRwdXRzOiBbXSxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGhhbmRsZTogNCxcblx0XHRcdFx0XHR1cmk6IENlbGxVcmkuZ2VuZXJhdGUobm90ZWJvb2tVcmksIDQpLFxuXHRcdFx0XHRcdHNvdXJjZTogWydjb25zb2xlLmxvZyhcImFhYVwiKScsICdjb25zb2xlLmxvZyhcImJiYlwiKSddLFxuXHRcdFx0XHRcdGVvbDogJ1xcbicsXG5cdFx0XHRcdFx0bGFuZ3VhZ2U6ICdqYXZhc2NyaXB0Jyxcblx0XHRcdFx0XHRjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSxcblx0XHRcdFx0XHRvdXRwdXRzOiBbXSxcblx0XHRcdFx0fV1dXVxuXHRcdFx0fV1cblx0XHR9KSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxDb3VudCwgMik7XG5cblx0XHRjb25zdCBldmVudCA9IGF3YWl0IHA7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQubm90ZWJvb2sgPT09IG5vdGVib29rLmFwaU5vdGVib29rLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29udGVudENoYW5nZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29udGVudENoYW5nZXNbMF0ucmFuZ2UuZW5kIC0gZXZlbnQuY29udGVudENoYW5nZXNbMF0ucmFuZ2Uuc3RhcnQsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb250ZW50Q2hhbmdlc1swXS5yZW1vdmVkQ2VsbHNbMF0uZG9jdW1lbnQuaXNDbG9zZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb250ZW50Q2hhbmdlc1swXS5yZW1vdmVkQ2VsbHNbMV0uZG9jdW1lbnQuaXNDbG9zZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb250ZW50Q2hhbmdlc1swXS5hZGRlZENlbGxzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbnRlbnRDaGFuZ2VzWzBdLmFkZGVkQ2VsbHNbMF0uZG9jdW1lbnQuaXNDbG9zZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuY29udGVudENoYW5nZXNbMF0uYWRkZWRDZWxsc1sxXS5kb2N1bWVudC5pc0Nsb3NlZCwgZmFsc2UpO1xuXHR9KTtcblxuXG5cdHRlc3QoJ09wZW5pbmcgYSBub3RlYm9vayByZXN1bHRzIGluIFZTIENvZGUgZmlyaW5nIHRoZSBldmVudCBvbkRpZENoYW5nZUFjdGl2ZU5vdGVib29rRWRpdG9yIHR3aWNlICMxMTg0NzAnLCBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IGNvdW50ID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdE5vdGVib29rcy5vbkRpZENoYW5nZUFjdGl2ZU5vdGVib29rRWRpdG9yKCgpID0+IGNvdW50ICs9IDEpKTtcblxuXHRcdGV4dEhvc3ROb3RlYm9va3MuJGFjY2VwdERvY3VtZW50QW5kRWRpdG9yc0RlbHRhKG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyh7XG5cdFx0XHRhZGRlZEVkaXRvcnM6IFt7XG5cdFx0XHRcdGRvY3VtZW50VXJpOiBub3RlYm9va1VyaSxcblx0XHRcdFx0aWQ6ICdfbm90ZWJvb2tfZWRpdG9yXzInLFxuXHRcdFx0XHRzZWxlY3Rpb25zOiBbeyBzdGFydDogMCwgZW5kOiAxIH1dLFxuXHRcdFx0XHR2aXNpYmxlUmFuZ2VzOiBbXSxcblx0XHRcdFx0dmlld1R5cGU6ICd0ZXN0J1xuXHRcdFx0fV1cblx0XHR9KSk7XG5cblx0XHRleHRIb3N0Tm90ZWJvb2tzLiRhY2NlcHREb2N1bWVudEFuZEVkaXRvcnNEZWx0YShuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoe1xuXHRcdFx0bmV3QWN0aXZlRWRpdG9yOiAnX25vdGVib29rX2VkaXRvcl8yJ1xuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Vuc2V0IGFjdGl2ZSBub3RlYm9vayBlZGl0b3InLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBlZGl0b3IgPSBleHRIb3N0Tm90ZWJvb2tzLmFjdGl2ZU5vdGVib29rRWRpdG9yO1xuXHRcdGFzc2VydC5vayhlZGl0b3IgIT09IHVuZGVmaW5lZCk7XG5cblx0XHRleHRIb3N0Tm90ZWJvb2tzLiRhY2NlcHREb2N1bWVudEFuZEVkaXRvcnNEZWx0YShuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoeyBuZXdBY3RpdmVFZGl0b3I6IHVuZGVmaW5lZCB9KSk7XG5cdFx0YXNzZXJ0Lm9rKGV4dEhvc3ROb3RlYm9va3MuYWN0aXZlTm90ZWJvb2tFZGl0b3IgPT09IGVkaXRvcik7XG5cblx0XHRleHRIb3N0Tm90ZWJvb2tzLiRhY2NlcHREb2N1bWVudEFuZEVkaXRvcnNEZWx0YShuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoe30pKTtcblx0XHRhc3NlcnQub2soZXh0SG9zdE5vdGVib29rcy5hY3RpdmVOb3RlYm9va0VkaXRvciA9PT0gZWRpdG9yKTtcblxuXHRcdGV4dEhvc3ROb3RlYm9va3MuJGFjY2VwdERvY3VtZW50QW5kRWRpdG9yc0RlbHRhKG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyh7IG5ld0FjdGl2ZUVkaXRvcjogbnVsbCB9KSk7XG5cdFx0YXNzZXJ0Lm9rKGV4dEhvc3ROb3RlYm9va3MuYWN0aXZlTm90ZWJvb2tFZGl0b3IgPT09IHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoYW5nZSBjZWxsIGxhbmd1YWdlIHRyaWdnZXJzIG9uRGlkQ2hhbmdlIGV2ZW50cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IGZpcnN0ID0gbm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbEF0KDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LmRvY3VtZW50Lmxhbmd1YWdlSWQsICdtYXJrZG93bicpO1xuXG5cdFx0Y29uc3QgcmVtb3ZlZCA9IEV2ZW50LnRvUHJvbWlzZShleHRIb3N0RG9jdW1lbnRzLm9uRGlkUmVtb3ZlRG9jdW1lbnQpO1xuXHRcdGNvbnN0IGFkZGVkID0gRXZlbnQudG9Qcm9taXNlKGV4dEhvc3REb2N1bWVudHMub25EaWRBZGREb2N1bWVudCk7XG5cblx0XHRleHRIb3N0Tm90ZWJvb2tEb2N1bWVudHMuJGFjY2VwdE1vZGVsQ2hhbmdlZChub3RlYm9vay51cmksIG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyh7XG5cdFx0XHR2ZXJzaW9uSWQ6IDEyLCByYXdFdmVudHM6IFt7XG5cdFx0XHRcdGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkNoYW5nZUNlbGxMYW5ndWFnZSxcblx0XHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRcdGxhbmd1YWdlOiAnZm9vTGFuZydcblx0XHRcdH1dXG5cdFx0fSksIGZhbHNlKTtcblxuXHRcdGNvbnN0IHJlbW92ZWREb2MgPSBhd2FpdCByZW1vdmVkO1xuXHRcdGNvbnN0IGFkZGVkRG9jID0gYXdhaXQgYWRkZWQ7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QuZG9jdW1lbnQubGFuZ3VhZ2VJZCwgJ2Zvb0xhbmcnKTtcblx0XHRhc3NlcnQub2socmVtb3ZlZERvYyA9PT0gYWRkZWREb2MpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZENoYW5nZU5vdGVib29rLWV2ZW50LCBjZWxsIGNoYW5nZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBwID0gRXZlbnQudG9Qcm9taXNlKGV4dEhvc3ROb3RlYm9va0RvY3VtZW50cy5vbkRpZENoYW5nZU5vdGVib29rRG9jdW1lbnQpO1xuXG5cdFx0ZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLiRhY2NlcHRNb2RlbENoYW5nZWQobm90ZWJvb2sudXJpLCBuZXcgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMoe1xuXHRcdFx0dmVyc2lvbklkOiAxMiwgcmF3RXZlbnRzOiBbe1xuXHRcdFx0XHRraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsTWV0YWRhdGEsXG5cdFx0XHRcdGluZGV4OiAwLFxuXHRcdFx0XHRtZXRhZGF0YTogeyBmb286IDEgfVxuXHRcdFx0fSwge1xuXHRcdFx0XHRraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsTWV0YWRhdGEsXG5cdFx0XHRcdGluZGV4OiAxLFxuXHRcdFx0XHRtZXRhZGF0YTogeyBmb286IDIgfSxcblx0XHRcdH0sIHtcblx0XHRcdFx0a2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuT3V0cHV0LFxuXHRcdFx0XHRpbmRleDogMSxcblx0XHRcdFx0b3V0cHV0czogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGl0ZW1zOiBbe1xuXHRcdFx0XHRcdFx0XHR2YWx1ZUJ5dGVzOiBWU0J1ZmZlci5mcm9tQnl0ZUFycmF5KFswLCAyLCAzXSksXG5cdFx0XHRcdFx0XHRcdG1pbWU6ICd0ZXh0L3BsYWluJ1xuXHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0XHRvdXRwdXRJZDogJzEnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9XVxuXHRcdH0pLCBmYWxzZSwgdW5kZWZpbmVkKTtcblxuXG5cdFx0Y29uc3QgZXZlbnQgPSBhd2FpdCBwO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Lm5vdGVib29rID09PSBub3RlYm9vay5hcGlOb3RlYm9vaywgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbnRlbnRDaGFuZ2VzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNlbGxDaGFuZ2VzLmxlbmd0aCwgMik7XG5cblx0XHRjb25zdCBbZmlyc3QsIHNlY29uZF0gPSBldmVudC5jZWxsQ2hhbmdlcztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpcnN0Lm1ldGFkYXRhLCBmaXJzdC5jZWxsLm1ldGFkYXRhKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpcnN0LmV4ZWN1dGlvblN1bW1hcnksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaXJzdC5vdXRwdXRzLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlyc3QuZG9jdW1lbnQsIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlY29uZC5vdXRwdXRzLCBzZWNvbmQuY2VsbC5vdXRwdXRzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlY29uZC5tZXRhZGF0YSwgc2Vjb25kLmNlbGwubWV0YWRhdGEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vjb25kLmV4ZWN1dGlvblN1bW1hcnksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWNvbmQuZG9jdW1lbnQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uRGlkQ2hhbmdlTm90ZWJvb2stZXZlbnQsIG5vdGVib29rIG1ldGFkYXRhJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgcCA9IEV2ZW50LnRvUHJvbWlzZShleHRIb3N0Tm90ZWJvb2tEb2N1bWVudHMub25EaWRDaGFuZ2VOb3RlYm9va0RvY3VtZW50KTtcblxuXHRcdGV4dEhvc3ROb3RlYm9va0RvY3VtZW50cy4kYWNjZXB0TW9kZWxDaGFuZ2VkKG5vdGVib29rLnVyaSwgbmV3IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzKHsgdmVyc2lvbklkOiAxMiwgcmF3RXZlbnRzOiBbXSB9KSwgZmFsc2UsIHsgZm9vOiAyIH0pO1xuXG5cdFx0Y29uc3QgZXZlbnQgPSBhd2FpdCBwO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50Lm5vdGVib29rID09PSBub3RlYm9vay5hcGlOb3RlYm9vaywgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNvbnRlbnRDaGFuZ2VzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV2ZW50LmNlbGxDaGFuZ2VzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudC5tZXRhZGF0YSwgeyBmb286IDIgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uRGlkQ2hhbmdlTm90ZWJvb2stZXZlbnQsIGZyb296ZW4gZGF0YScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IHAgPSBFdmVudC50b1Byb21pc2UoZXh0SG9zdE5vdGVib29rRG9jdW1lbnRzLm9uRGlkQ2hhbmdlTm90ZWJvb2tEb2N1bWVudCk7XG5cblx0XHRleHRIb3N0Tm90ZWJvb2tEb2N1bWVudHMuJGFjY2VwdE1vZGVsQ2hhbmdlZChub3RlYm9vay51cmksIG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyh7IHZlcnNpb25JZDogMTIsIHJhd0V2ZW50czogW10gfSksIGZhbHNlLCB7IGZvbzogMiB9KTtcblxuXHRcdGNvbnN0IGV2ZW50ID0gYXdhaXQgcDtcblxuXHRcdGFzc2VydC5vayhPYmplY3QuaXNGcm96ZW4oZXZlbnQpKTtcblx0XHRhc3NlcnQub2soT2JqZWN0LmlzRnJvemVuKGV2ZW50LmNlbGxDaGFuZ2VzKSk7XG5cdFx0YXNzZXJ0Lm9rKE9iamVjdC5pc0Zyb3plbihldmVudC5jb250ZW50Q2hhbmdlcykpO1xuXHRcdGFzc2VydC5vayhPYmplY3QuaXNGcm96ZW4oZXZlbnQubm90ZWJvb2spKTtcblx0XHRhc3NlcnQub2soIU9iamVjdC5pc0Zyb3plbihldmVudC5tZXRhZGF0YSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGFuZ2UgY2VsbCBsYW5ndWFnZSBhbmQgb25EaWRDaGFuZ2VOb3RlYm9va0RvY3VtZW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgcCA9IEV2ZW50LnRvUHJvbWlzZShleHRIb3N0Tm90ZWJvb2tEb2N1bWVudHMub25EaWRDaGFuZ2VOb3RlYm9va0RvY3VtZW50KTtcblxuXHRcdGNvbnN0IGZpcnN0ID0gbm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbEF0KDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdC5kb2N1bWVudC5sYW5ndWFnZUlkLCAnbWFya2Rvd24nKTtcblxuXHRcdGV4dEhvc3ROb3RlYm9va0RvY3VtZW50cy4kYWNjZXB0TW9kZWxDaGFuZ2VkKG5vdGVib29rLnVyaSwgbmV3IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzKHtcblx0XHRcdHZlcnNpb25JZDogMTIsXG5cdFx0XHRyYXdFdmVudHM6IFt7XG5cdFx0XHRcdGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkNoYW5nZUNlbGxMYW5ndWFnZSxcblx0XHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRcdGxhbmd1YWdlOiAnZm9vTGFuZydcblx0XHRcdH1dXG5cdFx0fSksIGZhbHNlKTtcblxuXHRcdGNvbnN0IGV2ZW50ID0gYXdhaXQgcDtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5ub3RlYm9vayA9PT0gbm90ZWJvb2suYXBpTm90ZWJvb2ssIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb250ZW50Q2hhbmdlcy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jZWxsQ2hhbmdlcy5sZW5ndGgsIDEpO1xuXG5cdFx0Y29uc3QgW2NlbGxDaGFuZ2VdID0gZXZlbnQuY2VsbENoYW5nZXM7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbENoYW5nZS5jZWxsID09PSBmaXJzdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0Lm9rKGNlbGxDaGFuZ2UuZG9jdW1lbnQgPT09IGZpcnN0LmRvY3VtZW50KTtcblx0XHRhc3NlcnQub2soY2VsbENoYW5nZS5leGVjdXRpb25TdW1tYXJ5ID09PSB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5vayhjZWxsQ2hhbmdlLm1ldGFkYXRhID09PSB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5vayhjZWxsQ2hhbmdlLm91dHB1dHMgPT09IHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoYW5nZSBub3RlYm9vayBjZWxsIGRvY3VtZW50IGFuZCBvbkRpZENoYW5nZU5vdGVib29rRG9jdW1lbnQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBwID0gRXZlbnQudG9Qcm9taXNlKGV4dEhvc3ROb3RlYm9va0RvY3VtZW50cy5vbkRpZENoYW5nZU5vdGVib29rRG9jdW1lbnQpO1xuXG5cdFx0Y29uc3QgZmlyc3QgPSBub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQXQoMCk7XG5cblx0XHRleHRIb3N0Tm90ZWJvb2tEb2N1bWVudHMuJGFjY2VwdE1vZGVsQ2hhbmdlZChub3RlYm9vay51cmksIG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVycyh7XG5cdFx0XHR2ZXJzaW9uSWQ6IDEyLFxuXHRcdFx0cmF3RXZlbnRzOiBbe1xuXHRcdFx0XHRraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsQ29udGVudCxcblx0XHRcdFx0aW5kZXg6IDBcblx0XHRcdH1dXG5cdFx0fSksIGZhbHNlKTtcblxuXHRcdGNvbnN0IGV2ZW50ID0gYXdhaXQgcDtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5ub3RlYm9vayA9PT0gbm90ZWJvb2suYXBpTm90ZWJvb2ssIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jb250ZW50Q2hhbmdlcy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5jZWxsQ2hhbmdlcy5sZW5ndGgsIDEpO1xuXG5cdFx0Y29uc3QgW2NlbGxDaGFuZ2VdID0gZXZlbnQuY2VsbENoYW5nZXM7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbENoYW5nZS5jZWxsID09PSBmaXJzdCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0Lm9rKGNlbGxDaGFuZ2UuZG9jdW1lbnQgPT09IGZpcnN0LmRvY3VtZW50KTtcblx0XHRhc3NlcnQub2soY2VsbENoYW5nZS5leGVjdXRpb25TdW1tYXJ5ID09PSB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5vayhjZWxsQ2hhbmdlLm1ldGFkYXRhID09PSB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5vayhjZWxsQ2hhbmdlLm91dHB1dHMgPT09IHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHJlcGxhY2VPdXRwdXRzKGNlbGxJbmRleDogbnVtYmVyLCBvdXRwdXRJZDogc3RyaW5nLCBvdXRwdXRJdGVtczogTm90ZWJvb2tPdXRwdXRJdGVtRHRvW10pIHtcblx0XHRjb25zdCBjaGFuZ2VFdmVudCA9IEV2ZW50LnRvUHJvbWlzZShleHRIb3N0Tm90ZWJvb2tEb2N1bWVudHMub25EaWRDaGFuZ2VOb3RlYm9va0RvY3VtZW50KTtcblx0XHRleHRIb3N0Tm90ZWJvb2tEb2N1bWVudHMuJGFjY2VwdE1vZGVsQ2hhbmdlZChub3RlYm9vay51cmksIG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVyczxOb3RlYm9va0NlbGxzQ2hhbmdlZEV2ZW50RHRvPih7XG5cdFx0XHR2ZXJzaW9uSWQ6IG5vdGVib29rLmFwaU5vdGVib29rLnZlcnNpb24gKyAxLFxuXHRcdFx0cmF3RXZlbnRzOiBbe1xuXHRcdFx0XHRraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5PdXRwdXQsXG5cdFx0XHRcdGluZGV4OiBjZWxsSW5kZXgsXG5cdFx0XHRcdG91dHB1dHM6IFt7IG91dHB1dElkLCBpdGVtczogb3V0cHV0SXRlbXMgfV1cblx0XHRcdH1dXG5cdFx0fSksIGZhbHNlKTtcblx0XHRhd2FpdCBjaGFuZ2VFdmVudDtcblx0fVxuXHRhc3luYyBmdW5jdGlvbiBhcHBlbmRPdXRwdXRJdGVtKGNlbGxJbmRleDogbnVtYmVyLCBvdXRwdXRJZDogc3RyaW5nLCBvdXRwdXRJdGVtczogTm90ZWJvb2tPdXRwdXRJdGVtRHRvW10pIHtcblx0XHRjb25zdCBjaGFuZ2VFdmVudCA9IEV2ZW50LnRvUHJvbWlzZShleHRIb3N0Tm90ZWJvb2tEb2N1bWVudHMub25EaWRDaGFuZ2VOb3RlYm9va0RvY3VtZW50KTtcblx0XHRleHRIb3N0Tm90ZWJvb2tEb2N1bWVudHMuJGFjY2VwdE1vZGVsQ2hhbmdlZChub3RlYm9vay51cmksIG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVyczxOb3RlYm9va0NlbGxzQ2hhbmdlZEV2ZW50RHRvPih7XG5cdFx0XHR2ZXJzaW9uSWQ6IG5vdGVib29rLmFwaU5vdGVib29rLnZlcnNpb24gKyAxLFxuXHRcdFx0cmF3RXZlbnRzOiBbe1xuXHRcdFx0XHRraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5PdXRwdXRJdGVtLFxuXHRcdFx0XHRpbmRleDogY2VsbEluZGV4LFxuXHRcdFx0XHRhcHBlbmQ6IHRydWUsXG5cdFx0XHRcdG91dHB1dElkLFxuXHRcdFx0XHRvdXRwdXRJdGVtc1xuXHRcdFx0fV1cblx0XHR9KSwgZmFsc2UpO1xuXHRcdGF3YWl0IGNoYW5nZUV2ZW50O1xuXHR9XG5cdHRlc3QoJ0FwcGVuZCBtdWx0aXBsZSB0ZXh0L3BsYWluIG91dHB1dCBpdGVtcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCByZXBsYWNlT3V0cHV0cygxLCAnMScsIFt7IG1pbWU6ICd0ZXh0L3BsYWluJywgdmFsdWVCeXRlczogVlNCdWZmZXIuZnJvbVN0cmluZygnZm9vJykgfV0pO1xuXHRcdGF3YWl0IGFwcGVuZE91dHB1dEl0ZW0oMSwgJzEnLCBbeyBtaW1lOiAndGV4dC9wbGFpbicsIHZhbHVlQnl0ZXM6IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2JhcicpIH1dKTtcblx0XHRhd2FpdCBhcHBlbmRPdXRwdXRJdGVtKDEsICcxJywgW3sgbWltZTogJ3RleHQvcGxhaW4nLCB2YWx1ZUJ5dGVzOiBWU0J1ZmZlci5mcm9tU3RyaW5nKCdiYXonKSB9XSk7XG5cblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQXQoMSkub3V0cHV0cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQXQoMSkub3V0cHV0c1swXS5pdGVtcy5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQXQoMSkub3V0cHV0c1swXS5pdGVtc1swXS5taW1lLCAndGV4dC9wbGFpbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChWU0J1ZmZlci53cmFwKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxBdCgxKS5vdXRwdXRzWzBdLml0ZW1zWzBdLmRhdGEpLnRvU3RyaW5nKCksICdmb28nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbEF0KDEpLm91dHB1dHNbMF0uaXRlbXNbMV0ubWltZSwgJ3RleHQvcGxhaW4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVlNCdWZmZXIud3JhcChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQXQoMSkub3V0cHV0c1swXS5pdGVtc1sxXS5kYXRhKS50b1N0cmluZygpLCAnYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxBdCgxKS5vdXRwdXRzWzBdLml0ZW1zWzJdLm1pbWUsICd0ZXh0L3BsYWluJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFZTQnVmZmVyLndyYXAobm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbEF0KDEpLm91dHB1dHNbMF0uaXRlbXNbMl0uZGF0YSkudG9TdHJpbmcoKSwgJ2JheicpO1xuXHR9KTtcblx0dGVzdCgnQXBwZW5kIG11bHRpcGxlIHN0ZG91dCBzdHJlYW0gb3V0cHV0IGl0ZW1zIHRvIGFuIG91dHB1dCB3aXRoIGFub3RoZXIgbWltZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCByZXBsYWNlT3V0cHV0cygxLCAnMScsIFt7IG1pbWU6ICd0ZXh0L3BsYWluJywgdmFsdWVCeXRlczogVlNCdWZmZXIuZnJvbVN0cmluZygnZm9vJykgfV0pO1xuXHRcdGF3YWl0IGFwcGVuZE91dHB1dEl0ZW0oMSwgJzEnLCBbeyBtaW1lOiAnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suc3Rkb3V0JywgdmFsdWVCeXRlczogVlNCdWZmZXIuZnJvbVN0cmluZygnYmFyJykgfV0pO1xuXHRcdGF3YWl0IGFwcGVuZE91dHB1dEl0ZW0oMSwgJzEnLCBbeyBtaW1lOiAnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suc3Rkb3V0JywgdmFsdWVCeXRlczogVlNCdWZmZXIuZnJvbVN0cmluZygnYmF6JykgfV0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxBdCgxKS5vdXRwdXRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxBdCgxKS5vdXRwdXRzWzBdLml0ZW1zLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxBdCgxKS5vdXRwdXRzWzBdLml0ZW1zWzBdLm1pbWUsICd0ZXh0L3BsYWluJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxBdCgxKS5vdXRwdXRzWzBdLml0ZW1zWzFdLm1pbWUsICdhcHBsaWNhdGlvbi92bmQuY29kZS5ub3RlYm9vay5zdGRvdXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbEF0KDEpLm91dHB1dHNbMF0uaXRlbXNbMl0ubWltZSwgJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLnN0ZG91dCcpO1xuXHR9KTtcblx0dGVzdCgnQ29tcHJlc3MgbXVsdGlwbGUgc3Rkb3V0IHN0cmVhbSBvdXRwdXQgaXRlbXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgcmVwbGFjZU91dHB1dHMoMSwgJzEnLCBbeyBtaW1lOiAnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suc3Rkb3V0JywgdmFsdWVCeXRlczogVlNCdWZmZXIuZnJvbVN0cmluZygnZm9vJykgfV0pO1xuXHRcdGF3YWl0IGFwcGVuZE91dHB1dEl0ZW0oMSwgJzEnLCBbeyBtaW1lOiAnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suc3Rkb3V0JywgdmFsdWVCeXRlczogVlNCdWZmZXIuZnJvbVN0cmluZygnYmFyJykgfV0pO1xuXHRcdGF3YWl0IGFwcGVuZE91dHB1dEl0ZW0oMSwgJzEnLCBbeyBtaW1lOiAnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suc3Rkb3V0JywgdmFsdWVCeXRlczogVlNCdWZmZXIuZnJvbVN0cmluZygnYmF6JykgfV0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxBdCgxKS5vdXRwdXRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxBdCgxKS5vdXRwdXRzWzBdLml0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxBdCgxKS5vdXRwdXRzWzBdLml0ZW1zWzBdLm1pbWUsICdhcHBsaWNhdGlvbi92bmQuY29kZS5ub3RlYm9vay5zdGRvdXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVlNCdWZmZXIud3JhcChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQXQoMSkub3V0cHV0c1swXS5pdGVtc1swXS5kYXRhKS50b1N0cmluZygpLCAnZm9vYmFyYmF6Jyk7XG5cdH0pO1xuXHR0ZXN0KCdDb21wcmVzcyBtdWx0aXBsZSBzdGRvdXQgc3RyZWFtIG91dHB1dCBpdGVtcyAod2l0aCBzdXBwb3J0IGZvciB0ZXJtaW5hbCBlc2NhcGUgY29kZSAtPiBcXHUwMDFiW0EpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHJlcGxhY2VPdXRwdXRzKDEsICcxJywgW3sgbWltZTogJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLnN0ZG91dCcsIHZhbHVlQnl0ZXM6IFZTQnVmZmVyLmZyb21TdHJpbmcoJ1xcbmZvbycpIH1dKTtcblx0XHRhd2FpdCBhcHBlbmRPdXRwdXRJdGVtKDEsICcxJywgW3sgbWltZTogJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLnN0ZG91dCcsIHZhbHVlQnl0ZXM6IFZTQnVmZmVyLmZyb21TdHJpbmcoYCR7U3RyaW5nLmZyb21DaGFyQ29kZSgyNyl9W0FiYXJgKSB9XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbEF0KDEpLm91dHB1dHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbEF0KDEpLm91dHB1dHNbMF0uaXRlbXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbEF0KDEpLm91dHB1dHNbMF0uaXRlbXNbMF0ubWltZSwgJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLnN0ZG91dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChWU0J1ZmZlci53cmFwKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxBdCgxKS5vdXRwdXRzWzBdLml0ZW1zWzBdLmRhdGEpLnRvU3RyaW5nKCksICdiYXInKTtcblx0fSk7XG5cdHRlc3QoJ0NvbXByZXNzIG11bHRpcGxlIHN0ZG91dCBzdHJlYW0gb3V0cHV0IGl0ZW1zICh3aXRoIHN1cHBvcnQgZm9yIHRlcm1pbmFsIGVzY2FwZSBjb2RlIC0+IFxcciBjaGFyYWN0ZXIpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHJlcGxhY2VPdXRwdXRzKDEsICcxJywgW3sgbWltZTogJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLnN0ZG91dCcsIHZhbHVlQnl0ZXM6IFZTQnVmZmVyLmZyb21TdHJpbmcoJ2ZvbycpIH1dKTtcblx0XHRhd2FpdCBhcHBlbmRPdXRwdXRJdGVtKDEsICcxJywgW3sgbWltZTogJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLnN0ZG91dCcsIHZhbHVlQnl0ZXM6IFZTQnVmZmVyLmZyb21TdHJpbmcoYFxccmJhcmApIH1dKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQXQoMSkub3V0cHV0cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQXQoMSkub3V0cHV0c1swXS5pdGVtcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQXQoMSkub3V0cHV0c1swXS5pdGVtc1swXS5taW1lLCAnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suc3Rkb3V0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFZTQnVmZmVyLndyYXAobm90ZWJvb2suYXBpTm90ZWJvb2suY2VsbEF0KDEpLm91dHB1dHNbMF0uaXRlbXNbMF0uZGF0YSkudG9TdHJpbmcoKSwgJ2JhcicpO1xuXHR9KTtcblx0dGVzdCgnQ29tcHJlc3MgbXVsdGlwbGUgc3RkZXJyIHN0cmVhbSBvdXRwdXQgaXRlbXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgcmVwbGFjZU91dHB1dHMoMSwgJzEnLCBbeyBtaW1lOiAnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suc3RkZXJyJywgdmFsdWVCeXRlczogVlNCdWZmZXIuZnJvbVN0cmluZygnZm9vJykgfV0pO1xuXHRcdGF3YWl0IGFwcGVuZE91dHB1dEl0ZW0oMSwgJzEnLCBbeyBtaW1lOiAnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suc3RkZXJyJywgdmFsdWVCeXRlczogVlNCdWZmZXIuZnJvbVN0cmluZygnYmFyJykgfV0pO1xuXHRcdGF3YWl0IGFwcGVuZE91dHB1dEl0ZW0oMSwgJzEnLCBbeyBtaW1lOiAnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suc3RkZXJyJywgdmFsdWVCeXRlczogVlNCdWZmZXIuZnJvbVN0cmluZygnYmF6JykgfV0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxBdCgxKS5vdXRwdXRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxBdCgxKS5vdXRwdXRzWzBdLml0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmFwaU5vdGVib29rLmNlbGxBdCgxKS5vdXRwdXRzWzBdLml0ZW1zWzBdLm1pbWUsICdhcHBsaWNhdGlvbi92bmQuY29kZS5ub3RlYm9vay5zdGRlcnInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoVlNCdWZmZXIud3JhcChub3RlYm9vay5hcGlOb3RlYm9vay5jZWxsQXQoMSkub3V0cHV0c1swXS5pdGVtc1swXS5kYXRhKS50b1N0cmluZygpLCAnZm9vYmFyYmF6Jyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFFbkIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxZQUFZO0FBQ3JCLFNBQTBCLG1CQUEwSDtBQUNwSixTQUFTLGlDQUFpQztBQUUxQyxTQUFTLFVBQVUsU0FBUywrQkFBK0I7QUFDM0QsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkI7QUFFdEMsTUFBTSx5QkFBeUIsV0FBWTtBQUMxQyxNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUVKLFFBQU0sY0FBYyxJQUFJLE1BQU0sdUJBQXVCO0FBQ3JELFFBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUV4QyxXQUFTLFdBQVk7QUFDcEIsZ0JBQVksTUFBTTtBQUFBLEVBQ25CLENBQUM7QUFFRCwwQ0FBd0M7QUFFeEMsUUFBTSxpQkFBa0I7QUFDdkIsa0JBQWMsSUFBSSxnQkFBZ0I7QUFDbEMsZ0JBQVksSUFBSSxZQUFZLG9CQUFvQixJQUFJLGNBQWMsS0FBOEIsRUFBRTtBQUFBLE1BQ3hGLG1CQUFtQjtBQUFBLE1BQUU7QUFBQSxJQUMvQixHQUFDO0FBQ0QsZ0JBQVksSUFBSSxZQUFZLG9CQUFvQixJQUFJLGNBQWMsS0FBOEIsRUFBRTtBQUFBLE1BQ2pHLE1BQWUsOEJBQThCO0FBQUEsTUFBRTtBQUFBLE1BQy9DLE1BQWUsZ0NBQWdDO0FBQUEsTUFBRTtBQUFBLElBQ2xELEdBQUM7QUFDRCxpQ0FBNkIsSUFBSSwyQkFBMkIsYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUM3Rix1QkFBbUIsSUFBSSxpQkFBaUIsYUFBYSwwQkFBMEI7QUFDL0UsZ0NBQTRCLElBQUksMEJBQTBCLGFBQWEsSUFBSSxzQkFBc0IsQ0FBQztBQUNsRyxvQkFBZ0IsSUFBSSxjQUFjLGFBQWEsSUFBSSxzQkFBc0IsSUFBSSxHQUFHLElBQUksZUFBZSxDQUFDO0FBQ3BHLHVCQUFtQixJQUFJLDBCQUEwQixhQUFhLElBQUksZ0JBQWdCLGFBQWEsSUFBSSxlQUFlLEdBQUcsSUFBSSxjQUFjLEtBQXdCLEVBQUU7QUFBQSxNQUN2SixtQkFBNEI7QUFDcEMsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNELEdBQUMsR0FBRyw0QkFBNEIsa0JBQWtCLDJCQUEyQixlQUFlLElBQUksZUFBZSxDQUFDO0FBQ2hILCtCQUEyQixJQUFJLHlCQUF5QixnQkFBZ0I7QUFFeEUsVUFBTSxNQUFNLGlCQUFpQiwyQkFBMkIsMEJBQTBCLFFBQVEsSUFBSSxjQUFjLEtBQWdDLEVBQUU7QUFBQSxJQUFFLEdBQUM7QUFDakoscUJBQWlCLCtCQUErQixJQUFJLDhCQUE4QjtBQUFBLE1BQ2pGLGdCQUFnQixDQUFDO0FBQUEsUUFDaEIsS0FBSztBQUFBLFFBQ0wsVUFBVTtBQUFBLFFBQ1YsV0FBVztBQUFBLFFBQ1gsT0FBTyxDQUFDO0FBQUEsVUFDUCxRQUFRO0FBQUEsVUFDUixLQUFLLFFBQVEsU0FBUyxhQUFhLENBQUM7QUFBQSxVQUNwQyxRQUFRLENBQUMsYUFBYTtBQUFBLFVBQ3RCLEtBQUs7QUFBQSxVQUNMLFVBQVU7QUFBQSxVQUNWLFVBQVUsU0FBUztBQUFBLFVBQ25CLFNBQVMsQ0FBQztBQUFBLFFBQ1gsR0FBRztBQUFBLFVBQ0YsUUFBUTtBQUFBLFVBQ1IsS0FBSyxRQUFRLFNBQVMsYUFBYSxDQUFDO0FBQUEsVUFDcEMsUUFBUSxDQUFDLHNCQUFzQixvQkFBb0I7QUFBQSxVQUNuRCxLQUFLO0FBQUEsVUFDTCxVQUFVO0FBQUEsVUFDVixVQUFVLFNBQVM7QUFBQSxVQUNuQixTQUFTLENBQUM7QUFBQSxRQUNYLENBQUM7QUFBQSxNQUNGLENBQUM7QUFBQSxNQUNELGNBQWMsQ0FBQztBQUFBLFFBQ2QsYUFBYTtBQUFBLFFBQ2IsSUFBSTtBQUFBLFFBQ0osWUFBWSxDQUFDLEVBQUUsT0FBTyxHQUFHLEtBQUssRUFBRSxDQUFDO0FBQUEsUUFDakMsZUFBZSxDQUFDO0FBQUEsUUFDaEIsVUFBVTtBQUFBLE1BQ1gsQ0FBQztBQUFBLElBQ0YsQ0FBQyxDQUFDO0FBQ0YscUJBQWlCLCtCQUErQixJQUFJLDhCQUE4QixFQUFFLGlCQUFpQixxQkFBcUIsQ0FBQyxDQUFDO0FBRTVILGVBQVcsaUJBQWlCLGtCQUFrQixDQUFDO0FBRS9DLGdCQUFZLElBQUksR0FBRztBQUNuQixnQkFBWSxJQUFJLFFBQVE7QUFDeEIsZ0JBQVksSUFBSSxnQkFBZ0I7QUFBQSxFQUNqQyxDQUFDO0FBR0QsT0FBSyx3Q0FBd0MsaUJBQWtCO0FBRTlELFdBQU8sWUFBWSxTQUFTLFlBQVksV0FBVyxDQUFDO0FBRXBELFVBQU0sQ0FBQyxJQUFJLEVBQUUsSUFBSSxTQUFTLFlBQVksU0FBUztBQUMvQyxVQUFNLEtBQUssaUJBQWlCLFlBQVksR0FBRyxTQUFTLEdBQUc7QUFFdkQsV0FBTyxHQUFHLEVBQUU7QUFDWixXQUFPLFlBQVksR0FBRyxZQUFZLEdBQUcsU0FBUyxVQUFVO0FBQ3hELFdBQU8sWUFBWSxHQUFHLFNBQVMsQ0FBQztBQUVoQyxVQUFNLEtBQUssaUJBQWlCLFlBQVksR0FBRyxTQUFTLEdBQUc7QUFDdkQsV0FBTyxHQUFHLEVBQUU7QUFDWixXQUFPLFlBQVksR0FBRyxZQUFZLEdBQUcsU0FBUyxVQUFVO0FBQ3hELFdBQU8sWUFBWSxHQUFHLFNBQVMsQ0FBQztBQUFBLEVBQ2pDLENBQUM7QUFFRCxPQUFLLDJDQUEyQyxpQkFBa0I7QUFDakUsVUFBTSxXQUFxQixDQUFDO0FBQzVCLGVBQVcsUUFBUSxTQUFTLFlBQVksU0FBUyxHQUFHO0FBQ25ELGFBQU8sR0FBRyxpQkFBaUIsWUFBWSxLQUFLLFNBQVMsR0FBRyxDQUFDO0FBQ3pELGVBQVMsS0FBSyxLQUFLLFNBQVMsSUFBSSxTQUFTLENBQUM7QUFBQSxJQUMzQztBQUVBLFVBQU0sa0JBQTRCLENBQUM7QUFDbkMsVUFBTSxNQUFNLGlCQUFpQixvQkFBb0IsU0FBTztBQUN2RCxzQkFBZ0IsS0FBSyxJQUFJLElBQUksU0FBUyxDQUFDO0FBQUEsSUFDeEMsQ0FBQztBQUVELHFCQUFpQiwrQkFBK0IsSUFBSSw4QkFBOEIsRUFBRSxrQkFBa0IsQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDLENBQUM7QUFDdkgsUUFBSSxRQUFRO0FBRVosV0FBTyxZQUFZLGdCQUFnQixRQUFRLENBQUM7QUFDNUMsV0FBTyxnQkFBZ0IsZ0JBQWdCLEtBQUssR0FBRyxTQUFTLEtBQUssQ0FBQztBQUFBLEVBQy9ELENBQUM7QUFFRCxPQUFLLDBEQUEwRCxpQkFBa0I7QUFFaEYsVUFBTSxJQUFJLElBQUksUUFBYyxDQUFDLFNBQVMsV0FBVztBQUVoRCxrQkFBWSxJQUFJLHlCQUF5Qiw0QkFBNEIsT0FBSztBQUN6RSxZQUFJO0FBQ0gsaUJBQU8sWUFBWSxFQUFFLGVBQWUsUUFBUSxDQUFDO0FBQzdDLGlCQUFPLFlBQVksRUFBRSxlQUFlLENBQUMsRUFBRSxXQUFXLFFBQVEsQ0FBQztBQUUzRCxnQkFBTSxDQUFDLE9BQU8sTUFBTSxJQUFJLEVBQUUsZUFBZSxDQUFDLEVBQUU7QUFFNUMsZ0JBQU0sT0FBTyxpQkFBaUIsbUJBQW1CLEVBQUUsS0FBSyxVQUFRLFFBQVEsS0FBSyxTQUFTLEtBQUssTUFBTSxTQUFTLEdBQUcsQ0FBQztBQUM5RyxpQkFBTyxHQUFHLElBQUk7QUFDZCxpQkFBTyxZQUFZLE1BQU0sYUFBYSxNQUFNLFVBQVUsSUFBSTtBQUUxRCxnQkFBTSxPQUFPLGlCQUFpQixtQkFBbUIsRUFBRSxLQUFLLFVBQVEsUUFBUSxLQUFLLFNBQVMsS0FBSyxPQUFPLFNBQVMsR0FBRyxDQUFDO0FBQy9HLGlCQUFPLEdBQUcsSUFBSTtBQUNkLGlCQUFPLFlBQVksTUFBTSxhQUFhLE9BQU8sVUFBVSxJQUFJO0FBRTNELGtCQUFRO0FBQUEsUUFFVCxTQUFTLEtBQUs7QUFDYixpQkFBTyxHQUFHO0FBQUEsUUFDWDtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQUEsSUFFSCxDQUFDO0FBRUQsNkJBQXlCLG9CQUFvQixhQUFhLElBQUksOEJBQThCO0FBQUEsTUFDM0YsV0FBVyxTQUFTLFlBQVksVUFBVTtBQUFBLE1BQzFDLFdBQVc7QUFBQSxRQUNWO0FBQUEsVUFDQyxNQUFNLHdCQUF3QjtBQUFBLFVBQzlCLFNBQVMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDO0FBQUEsWUFDakIsUUFBUTtBQUFBLFlBQ1IsS0FBSyxRQUFRLFNBQVMsYUFBYSxDQUFDO0FBQUEsWUFDcEMsUUFBUSxDQUFDLFNBQVMsU0FBUyxjQUFjO0FBQUEsWUFDekMsS0FBSztBQUFBLFlBQ0wsVUFBVTtBQUFBLFlBQ1YsVUFBVSxTQUFTO0FBQUEsWUFDbkIsU0FBUyxDQUFDO0FBQUEsVUFDWCxHQUFHO0FBQUEsWUFDRixRQUFRO0FBQUEsWUFDUixLQUFLLFFBQVEsU0FBUyxhQUFhLENBQUM7QUFBQSxZQUNwQyxRQUFRLENBQUMsU0FBUyxRQUFRLGFBQWE7QUFBQSxZQUN2QyxLQUFLO0FBQUEsWUFDTCxVQUFVO0FBQUEsWUFDVixVQUFVLFNBQVM7QUFBQSxZQUNuQixTQUFTLENBQUM7QUFBQSxVQUNYLENBQUMsQ0FBQyxDQUFDO0FBQUEsUUFDSjtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsR0FBRyxLQUFLO0FBRVQsVUFBTTtBQUFBLEVBRVAsQ0FBQztBQUVELE9BQUssd0RBQXdELGlCQUFrQjtBQUU5RSxVQUFNLE9BQThCLENBQUM7QUFDckMsVUFBTSxVQUE2QixDQUFDO0FBQ3BDLGVBQVcsUUFBUSxTQUFTLFlBQVksU0FBUyxHQUFHO0FBQ25ELFlBQU0sTUFBTSxpQkFBaUIsWUFBWSxLQUFLLFNBQVMsR0FBRztBQUMxRCxhQUFPLEdBQUcsR0FBRztBQUNiLGFBQU8sWUFBWSxpQkFBaUIsWUFBWSxLQUFLLFNBQVMsR0FBRyxFQUFFLFVBQVUsS0FBSztBQUNsRixXQUFLLEtBQUssR0FBRztBQUNiLGNBQVEsS0FBSztBQUFBLFFBQ1osS0FBSztBQUFBLFFBQ0wsU0FBUyxJQUFJO0FBQUEsUUFDYixPQUFPLElBQUksUUFBUSxFQUFFLE1BQU0sSUFBSTtBQUFBLFFBQy9CLFlBQVksSUFBSTtBQUFBLFFBQ2hCLEtBQUssSUFBSTtBQUFBLFFBQ1QsV0FBVyxJQUFJO0FBQUEsUUFDZixVQUFVO0FBQUEsTUFDWCxDQUFDO0FBQUEsSUFDRjtBQUdBLCtCQUEyQixnQ0FBZ0MsRUFBRSxnQkFBZ0IsUUFBUSxDQUFDO0FBR3RGLCtCQUEyQixnQ0FBZ0MsRUFBRSxrQkFBa0IsS0FBSyxJQUFJLE9BQUssRUFBRSxHQUFHLEVBQUUsQ0FBQztBQUdyRyxlQUFXLFFBQVEsU0FBUyxZQUFZLFNBQVMsR0FBRztBQUNuRCxhQUFPLEdBQUcsaUJBQWlCLFlBQVksS0FBSyxTQUFTLEdBQUcsQ0FBQztBQUN6RCxhQUFPLFlBQVksaUJBQWlCLFlBQVksS0FBSyxTQUFTLEdBQUcsRUFBRSxVQUFVLEtBQUs7QUFBQSxJQUNuRjtBQUdBLHFCQUFpQiwrQkFBK0IsSUFBSSw4QkFBOEIsRUFBRSxrQkFBa0IsQ0FBQyxTQUFTLEdBQUcsRUFBRSxDQUFDLENBQUM7QUFDdkgsZUFBVyxRQUFRLFNBQVMsWUFBWSxTQUFTLEdBQUc7QUFDbkQsYUFBTyxPQUFPLE1BQU0saUJBQWlCLFlBQVksS0FBSyxTQUFTLEdBQUcsQ0FBQztBQUFBLElBQ3BFO0FBQ0EsZUFBVyxPQUFPLE1BQU07QUFDdkIsYUFBTyxZQUFZLElBQUksVUFBVSxJQUFJO0FBQUEsSUFDdEM7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDJDQUEyQyxpQkFBa0I7QUFFakUsV0FBTyxZQUFZLFNBQVMsWUFBWSxXQUFXLENBQUM7QUFDcEQsVUFBTSxDQUFDLE9BQU8sS0FBSyxJQUFJLFNBQVMsWUFBWSxTQUFTO0FBRXJELDZCQUF5QixvQkFBb0IsU0FBUyxLQUFLLElBQUksOEJBQThCO0FBQUEsTUFDNUYsV0FBVztBQUFBLE1BQ1gsV0FBVztBQUFBLFFBQ1Y7QUFBQSxVQUNDLE1BQU0sd0JBQXdCO0FBQUEsVUFDOUIsU0FBUyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQUEsUUFDckI7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLEdBQUcsS0FBSztBQUVULFdBQU8sWUFBWSxTQUFTLFlBQVksV0FBVyxDQUFDO0FBQ3BELFdBQU8sWUFBWSxNQUFNLFNBQVMsVUFBVSxJQUFJO0FBQ2hELFdBQU8sWUFBWSxNQUFNLFNBQVMsVUFBVSxLQUFLO0FBRWpELFdBQU8sT0FBTyxNQUFNLGlCQUFpQixZQUFZLE1BQU0sU0FBUyxHQUFHLENBQUM7QUFBQSxFQUNyRSxDQUFDO0FBRUQsT0FBSyxjQUFjLFdBQVk7QUFFOUIsV0FBTyxZQUFZLFNBQVMsWUFBWSxXQUFXLENBQUM7QUFDcEQsVUFBTSxDQUFDLE9BQU8sTUFBTSxJQUFJLFNBQVMsWUFBWSxTQUFTO0FBQ3RELFdBQU8sWUFBWSxNQUFNLE9BQU8sQ0FBQztBQUNqQyxXQUFPLFlBQVksT0FBTyxPQUFPLENBQUM7QUFHbEMsNkJBQXlCLG9CQUFvQixTQUFTLEtBQUssSUFBSSw4QkFBOEI7QUFBQSxNQUM1RixXQUFXLFNBQVMsWUFBWSxVQUFVO0FBQUEsTUFDMUMsV0FBVyxDQUFDO0FBQUEsUUFDWCxNQUFNLHdCQUF3QjtBQUFBLFFBQzlCLFNBQVMsQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUFBLE1BQ3JCLENBQUM7QUFBQSxJQUNGLENBQUMsR0FBRyxLQUFLO0FBRVQsV0FBTyxZQUFZLFNBQVMsWUFBWSxXQUFXLENBQUM7QUFDcEQsV0FBTyxZQUFZLE9BQU8sT0FBTyxDQUFDO0FBRWxDLDZCQUF5QixvQkFBb0IsYUFBYSxJQUFJLDhCQUE4QjtBQUFBLE1BQzNGLFdBQVcsU0FBUyxZQUFZLFVBQVU7QUFBQSxNQUMxQyxXQUFXLENBQUM7QUFBQSxRQUNYLE1BQU0sd0JBQXdCO0FBQUEsUUFDOUIsU0FBUyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNqQixRQUFRO0FBQUEsVUFDUixLQUFLLFFBQVEsU0FBUyxhQUFhLENBQUM7QUFBQSxVQUNwQyxRQUFRLENBQUMsU0FBUyxTQUFTLGNBQWM7QUFBQSxVQUN6QyxLQUFLO0FBQUEsVUFDTCxVQUFVO0FBQUEsVUFDVixVQUFVLFNBQVM7QUFBQSxVQUNuQixTQUFTLENBQUM7QUFBQSxRQUNYLEdBQUc7QUFBQSxVQUNGLFFBQVE7QUFBQSxVQUNSLEtBQUssUUFBUSxTQUFTLGFBQWEsQ0FBQztBQUFBLFVBQ3BDLFFBQVEsQ0FBQyxTQUFTLFFBQVEsYUFBYTtBQUFBLFVBQ3ZDLEtBQUs7QUFBQSxVQUNMLFVBQVU7QUFBQSxVQUNWLFVBQVUsU0FBUztBQUFBLFVBQ25CLFNBQVMsQ0FBQztBQUFBLFFBQ1gsQ0FBQyxDQUFDLENBQUM7QUFBQSxNQUNKLENBQUM7QUFBQSxJQUNGLENBQUMsR0FBRyxLQUFLO0FBRVQsV0FBTyxZQUFZLFNBQVMsWUFBWSxXQUFXLENBQUM7QUFDcEQsV0FBTyxZQUFZLE9BQU8sT0FBTyxDQUFDO0FBQUEsRUFDbkMsQ0FBQztBQUVELE9BQUssMERBQTBELGlCQUFrQjtBQUVoRixVQUFNLElBQUksTUFBTSxVQUFVLHlCQUF5QiwyQkFBMkI7QUFLOUUsNkJBQXlCLG9CQUFvQixTQUFTLEtBQUssSUFBSSw4QkFBOEI7QUFBQSxNQUM1RixXQUFXO0FBQUEsTUFDWCxXQUFXLENBQUM7QUFBQSxRQUNYLE1BQU0sd0JBQXdCO0FBQUEsUUFDOUIsU0FBUyxDQUFDLENBQUMsR0FBRyxHQUFHLENBQUM7QUFBQSxVQUNqQixRQUFRO0FBQUEsVUFDUixLQUFLLFFBQVEsU0FBUyxhQUFhLENBQUM7QUFBQSxVQUNwQyxRQUFRLENBQUMsYUFBYTtBQUFBLFVBQ3RCLEtBQUs7QUFBQSxVQUNMLFVBQVU7QUFBQSxVQUNWLFVBQVUsU0FBUztBQUFBLFVBQ25CLFNBQVMsQ0FBQztBQUFBLFFBQ1gsR0FBRztBQUFBLFVBQ0YsUUFBUTtBQUFBLFVBQ1IsS0FBSyxRQUFRLFNBQVMsYUFBYSxDQUFDO0FBQUEsVUFDcEMsUUFBUSxDQUFDLHNCQUFzQixvQkFBb0I7QUFBQSxVQUNuRCxLQUFLO0FBQUEsVUFDTCxVQUFVO0FBQUEsVUFDVixVQUFVLFNBQVM7QUFBQSxVQUNuQixTQUFTLENBQUM7QUFBQSxRQUNYLENBQUMsQ0FBQyxDQUFDO0FBQUEsTUFDSixDQUFDO0FBQUEsSUFDRixDQUFDLEdBQUcsS0FBSztBQUVULFdBQU8sWUFBWSxTQUFTLFlBQVksV0FBVyxDQUFDO0FBRXBELFVBQU0sUUFBUSxNQUFNO0FBRXBCLFdBQU8sWUFBWSxNQUFNLGFBQWEsU0FBUyxhQUFhLElBQUk7QUFDaEUsV0FBTyxZQUFZLE1BQU0sZUFBZSxRQUFRLENBQUM7QUFDakQsV0FBTyxZQUFZLE1BQU0sZUFBZSxDQUFDLEVBQUUsTUFBTSxNQUFNLE1BQU0sZUFBZSxDQUFDLEVBQUUsTUFBTSxPQUFPLENBQUM7QUFDN0YsV0FBTyxZQUFZLE1BQU0sZUFBZSxDQUFDLEVBQUUsYUFBYSxDQUFDLEVBQUUsU0FBUyxVQUFVLElBQUk7QUFDbEYsV0FBTyxZQUFZLE1BQU0sZUFBZSxDQUFDLEVBQUUsYUFBYSxDQUFDLEVBQUUsU0FBUyxVQUFVLElBQUk7QUFDbEYsV0FBTyxZQUFZLE1BQU0sZUFBZSxDQUFDLEVBQUUsV0FBVyxRQUFRLENBQUM7QUFDL0QsV0FBTyxZQUFZLE1BQU0sZUFBZSxDQUFDLEVBQUUsV0FBVyxDQUFDLEVBQUUsU0FBUyxVQUFVLEtBQUs7QUFDakYsV0FBTyxZQUFZLE1BQU0sZUFBZSxDQUFDLEVBQUUsV0FBVyxDQUFDLEVBQUUsU0FBUyxVQUFVLEtBQUs7QUFBQSxFQUNsRixDQUFDO0FBR0QsT0FBSyx3R0FBd0csV0FBWTtBQUN4SCxRQUFJLFFBQVE7QUFDWixnQkFBWSxJQUFJLGlCQUFpQixnQ0FBZ0MsTUFBTSxTQUFTLENBQUMsQ0FBQztBQUVsRixxQkFBaUIsK0JBQStCLElBQUksOEJBQThCO0FBQUEsTUFDakYsY0FBYyxDQUFDO0FBQUEsUUFDZCxhQUFhO0FBQUEsUUFDYixJQUFJO0FBQUEsUUFDSixZQUFZLENBQUMsRUFBRSxPQUFPLEdBQUcsS0FBSyxFQUFFLENBQUM7QUFBQSxRQUNqQyxlQUFlLENBQUM7QUFBQSxRQUNoQixVQUFVO0FBQUEsTUFDWCxDQUFDO0FBQUEsSUFDRixDQUFDLENBQUM7QUFFRixxQkFBaUIsK0JBQStCLElBQUksOEJBQThCO0FBQUEsTUFDakYsaUJBQWlCO0FBQUEsSUFDbEIsQ0FBQyxDQUFDO0FBRUYsV0FBTyxZQUFZLE9BQU8sQ0FBQztBQUFBLEVBQzVCLENBQUM7QUFFRCxPQUFLLGdDQUFnQyxXQUFZO0FBRWhELFVBQU0sU0FBUyxpQkFBaUI7QUFDaEMsV0FBTyxHQUFHLFdBQVcsTUFBUztBQUU5QixxQkFBaUIsK0JBQStCLElBQUksOEJBQThCLEVBQUUsaUJBQWlCLE9BQVUsQ0FBQyxDQUFDO0FBQ2pILFdBQU8sR0FBRyxpQkFBaUIseUJBQXlCLE1BQU07QUFFMUQscUJBQWlCLCtCQUErQixJQUFJLDhCQUE4QixDQUFDLENBQUMsQ0FBQztBQUNyRixXQUFPLEdBQUcsaUJBQWlCLHlCQUF5QixNQUFNO0FBRTFELHFCQUFpQiwrQkFBK0IsSUFBSSw4QkFBOEIsRUFBRSxpQkFBaUIsS0FBSyxDQUFDLENBQUM7QUFDNUcsV0FBTyxHQUFHLGlCQUFpQix5QkFBeUIsTUFBUztBQUFBLEVBQzlELENBQUM7QUFFRCxPQUFLLG9EQUFvRCxpQkFBa0I7QUFFMUUsVUFBTSxRQUFRLFNBQVMsWUFBWSxPQUFPLENBQUM7QUFFM0MsV0FBTyxZQUFZLE1BQU0sU0FBUyxZQUFZLFVBQVU7QUFFeEQsVUFBTSxVQUFVLE1BQU0sVUFBVSxpQkFBaUIsbUJBQW1CO0FBQ3BFLFVBQU0sUUFBUSxNQUFNLFVBQVUsaUJBQWlCLGdCQUFnQjtBQUUvRCw2QkFBeUIsb0JBQW9CLFNBQVMsS0FBSyxJQUFJLDhCQUE4QjtBQUFBLE1BQzVGLFdBQVc7QUFBQSxNQUFJLFdBQVcsQ0FBQztBQUFBLFFBQzFCLE1BQU0sd0JBQXdCO0FBQUEsUUFDOUIsT0FBTztBQUFBLFFBQ1AsVUFBVTtBQUFBLE1BQ1gsQ0FBQztBQUFBLElBQ0YsQ0FBQyxHQUFHLEtBQUs7QUFFVCxVQUFNLGFBQWEsTUFBTTtBQUN6QixVQUFNLFdBQVcsTUFBTTtBQUV2QixXQUFPLFlBQVksTUFBTSxTQUFTLFlBQVksU0FBUztBQUN2RCxXQUFPLEdBQUcsZUFBZSxRQUFRO0FBQUEsRUFDbEMsQ0FBQztBQUVELE9BQUssMkNBQTJDLGlCQUFrQjtBQUVqRSxVQUFNLElBQUksTUFBTSxVQUFVLHlCQUF5QiwyQkFBMkI7QUFFOUUsNkJBQXlCLG9CQUFvQixTQUFTLEtBQUssSUFBSSw4QkFBOEI7QUFBQSxNQUM1RixXQUFXO0FBQUEsTUFBSSxXQUFXLENBQUM7QUFBQSxRQUMxQixNQUFNLHdCQUF3QjtBQUFBLFFBQzlCLE9BQU87QUFBQSxRQUNQLFVBQVUsRUFBRSxLQUFLLEVBQUU7QUFBQSxNQUNwQixHQUFHO0FBQUEsUUFDRixNQUFNLHdCQUF3QjtBQUFBLFFBQzlCLE9BQU87QUFBQSxRQUNQLFVBQVUsRUFBRSxLQUFLLEVBQUU7QUFBQSxNQUNwQixHQUFHO0FBQUEsUUFDRixNQUFNLHdCQUF3QjtBQUFBLFFBQzlCLE9BQU87QUFBQSxRQUNQLFNBQVM7QUFBQSxVQUNSO0FBQUEsWUFDQyxPQUFPLENBQUM7QUFBQSxjQUNQLFlBQVksU0FBUyxjQUFjLENBQUMsR0FBRyxHQUFHLENBQUMsQ0FBQztBQUFBLGNBQzVDLE1BQU07QUFBQSxZQUNQLENBQUM7QUFBQSxZQUNELFVBQVU7QUFBQSxVQUNYO0FBQUEsUUFDRDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQyxHQUFHLE9BQU8sTUFBUztBQUdwQixVQUFNLFFBQVEsTUFBTTtBQUVwQixXQUFPLFlBQVksTUFBTSxhQUFhLFNBQVMsYUFBYSxJQUFJO0FBQ2hFLFdBQU8sWUFBWSxNQUFNLGVBQWUsUUFBUSxDQUFDO0FBQ2pELFdBQU8sWUFBWSxNQUFNLFlBQVksUUFBUSxDQUFDO0FBRTlDLFVBQU0sQ0FBQyxPQUFPLE1BQU0sSUFBSSxNQUFNO0FBQzlCLFdBQU8sZ0JBQWdCLE1BQU0sVUFBVSxNQUFNLEtBQUssUUFBUTtBQUMxRCxXQUFPLGdCQUFnQixNQUFNLGtCQUFrQixNQUFTO0FBQ3hELFdBQU8sZ0JBQWdCLE1BQU0sU0FBUyxNQUFTO0FBQy9DLFdBQU8sZ0JBQWdCLE1BQU0sVUFBVSxNQUFTO0FBRWhELFdBQU8sZ0JBQWdCLE9BQU8sU0FBUyxPQUFPLEtBQUssT0FBTztBQUMxRCxXQUFPLGdCQUFnQixPQUFPLFVBQVUsT0FBTyxLQUFLLFFBQVE7QUFDNUQsV0FBTyxnQkFBZ0IsT0FBTyxrQkFBa0IsTUFBUztBQUN6RCxXQUFPLGdCQUFnQixPQUFPLFVBQVUsTUFBUztBQUFBLEVBQ2xELENBQUM7QUFFRCxPQUFLLGdEQUFnRCxpQkFBa0I7QUFFdEUsVUFBTSxJQUFJLE1BQU0sVUFBVSx5QkFBeUIsMkJBQTJCO0FBRTlFLDZCQUF5QixvQkFBb0IsU0FBUyxLQUFLLElBQUksOEJBQThCLEVBQUUsV0FBVyxJQUFJLFdBQVcsQ0FBQyxFQUFFLENBQUMsR0FBRyxPQUFPLEVBQUUsS0FBSyxFQUFFLENBQUM7QUFFakosVUFBTSxRQUFRLE1BQU07QUFFcEIsV0FBTyxZQUFZLE1BQU0sYUFBYSxTQUFTLGFBQWEsSUFBSTtBQUNoRSxXQUFPLFlBQVksTUFBTSxlQUFlLFFBQVEsQ0FBQztBQUNqRCxXQUFPLFlBQVksTUFBTSxZQUFZLFFBQVEsQ0FBQztBQUM5QyxXQUFPLGdCQUFnQixNQUFNLFVBQVUsRUFBRSxLQUFLLEVBQUUsQ0FBQztBQUFBLEVBQ2xELENBQUM7QUFFRCxPQUFLLDJDQUEyQyxpQkFBa0I7QUFFakUsVUFBTSxJQUFJLE1BQU0sVUFBVSx5QkFBeUIsMkJBQTJCO0FBRTlFLDZCQUF5QixvQkFBb0IsU0FBUyxLQUFLLElBQUksOEJBQThCLEVBQUUsV0FBVyxJQUFJLFdBQVcsQ0FBQyxFQUFFLENBQUMsR0FBRyxPQUFPLEVBQUUsS0FBSyxFQUFFLENBQUM7QUFFakosVUFBTSxRQUFRLE1BQU07QUFFcEIsV0FBTyxHQUFHLE9BQU8sU0FBUyxLQUFLLENBQUM7QUFDaEMsV0FBTyxHQUFHLE9BQU8sU0FBUyxNQUFNLFdBQVcsQ0FBQztBQUM1QyxXQUFPLEdBQUcsT0FBTyxTQUFTLE1BQU0sY0FBYyxDQUFDO0FBQy9DLFdBQU8sR0FBRyxPQUFPLFNBQVMsTUFBTSxRQUFRLENBQUM7QUFDekMsV0FBTyxHQUFHLENBQUMsT0FBTyxTQUFTLE1BQU0sUUFBUSxDQUFDO0FBQUEsRUFDM0MsQ0FBQztBQUVELE9BQUssd0RBQXdELGlCQUFrQjtBQUU5RSxVQUFNLElBQUksTUFBTSxVQUFVLHlCQUF5QiwyQkFBMkI7QUFFOUUsVUFBTSxRQUFRLFNBQVMsWUFBWSxPQUFPLENBQUM7QUFDM0MsV0FBTyxZQUFZLE1BQU0sU0FBUyxZQUFZLFVBQVU7QUFFeEQsNkJBQXlCLG9CQUFvQixTQUFTLEtBQUssSUFBSSw4QkFBOEI7QUFBQSxNQUM1RixXQUFXO0FBQUEsTUFDWCxXQUFXLENBQUM7QUFBQSxRQUNYLE1BQU0sd0JBQXdCO0FBQUEsUUFDOUIsT0FBTztBQUFBLFFBQ1AsVUFBVTtBQUFBLE1BQ1gsQ0FBQztBQUFBLElBQ0YsQ0FBQyxHQUFHLEtBQUs7QUFFVCxVQUFNLFFBQVEsTUFBTTtBQUVwQixXQUFPLFlBQVksTUFBTSxhQUFhLFNBQVMsYUFBYSxJQUFJO0FBQ2hFLFdBQU8sWUFBWSxNQUFNLGVBQWUsUUFBUSxDQUFDO0FBQ2pELFdBQU8sWUFBWSxNQUFNLFlBQVksUUFBUSxDQUFDO0FBRTlDLFVBQU0sQ0FBQyxVQUFVLElBQUksTUFBTTtBQUUzQixXQUFPLFlBQVksV0FBVyxTQUFTLE9BQU8sSUFBSTtBQUNsRCxXQUFPLEdBQUcsV0FBVyxhQUFhLE1BQU0sUUFBUTtBQUNoRCxXQUFPLEdBQUcsV0FBVyxxQkFBcUIsTUFBUztBQUNuRCxXQUFPLEdBQUcsV0FBVyxhQUFhLE1BQVM7QUFDM0MsV0FBTyxHQUFHLFdBQVcsWUFBWSxNQUFTO0FBQUEsRUFDM0MsQ0FBQztBQUVELE9BQUssaUVBQWlFLGlCQUFrQjtBQUV2RixVQUFNLElBQUksTUFBTSxVQUFVLHlCQUF5QiwyQkFBMkI7QUFFOUUsVUFBTSxRQUFRLFNBQVMsWUFBWSxPQUFPLENBQUM7QUFFM0MsNkJBQXlCLG9CQUFvQixTQUFTLEtBQUssSUFBSSw4QkFBOEI7QUFBQSxNQUM1RixXQUFXO0FBQUEsTUFDWCxXQUFXLENBQUM7QUFBQSxRQUNYLE1BQU0sd0JBQXdCO0FBQUEsUUFDOUIsT0FBTztBQUFBLE1BQ1IsQ0FBQztBQUFBLElBQ0YsQ0FBQyxHQUFHLEtBQUs7QUFFVCxVQUFNLFFBQVEsTUFBTTtBQUVwQixXQUFPLFlBQVksTUFBTSxhQUFhLFNBQVMsYUFBYSxJQUFJO0FBQ2hFLFdBQU8sWUFBWSxNQUFNLGVBQWUsUUFBUSxDQUFDO0FBQ2pELFdBQU8sWUFBWSxNQUFNLFlBQVksUUFBUSxDQUFDO0FBRTlDLFVBQU0sQ0FBQyxVQUFVLElBQUksTUFBTTtBQUUzQixXQUFPLFlBQVksV0FBVyxTQUFTLE9BQU8sSUFBSTtBQUNsRCxXQUFPLEdBQUcsV0FBVyxhQUFhLE1BQU0sUUFBUTtBQUNoRCxXQUFPLEdBQUcsV0FBVyxxQkFBcUIsTUFBUztBQUNuRCxXQUFPLEdBQUcsV0FBVyxhQUFhLE1BQVM7QUFDM0MsV0FBTyxHQUFHLFdBQVcsWUFBWSxNQUFTO0FBQUEsRUFDM0MsQ0FBQztBQUVELGlCQUFlLGVBQWUsV0FBbUIsVUFBa0IsYUFBc0M7QUFDeEcsVUFBTSxjQUFjLE1BQU0sVUFBVSx5QkFBeUIsMkJBQTJCO0FBQ3hGLDZCQUF5QixvQkFBb0IsU0FBUyxLQUFLLElBQUksOEJBQTREO0FBQUEsTUFDMUgsV0FBVyxTQUFTLFlBQVksVUFBVTtBQUFBLE1BQzFDLFdBQVcsQ0FBQztBQUFBLFFBQ1gsTUFBTSx3QkFBd0I7QUFBQSxRQUM5QixPQUFPO0FBQUEsUUFDUCxTQUFTLENBQUMsRUFBRSxVQUFVLE9BQU8sWUFBWSxDQUFDO0FBQUEsTUFDM0MsQ0FBQztBQUFBLElBQ0YsQ0FBQyxHQUFHLEtBQUs7QUFDVCxVQUFNO0FBQUEsRUFDUDtBQUNBLGlCQUFlLGlCQUFpQixXQUFtQixVQUFrQixhQUFzQztBQUMxRyxVQUFNLGNBQWMsTUFBTSxVQUFVLHlCQUF5QiwyQkFBMkI7QUFDeEYsNkJBQXlCLG9CQUFvQixTQUFTLEtBQUssSUFBSSw4QkFBNEQ7QUFBQSxNQUMxSCxXQUFXLFNBQVMsWUFBWSxVQUFVO0FBQUEsTUFDMUMsV0FBVyxDQUFDO0FBQUEsUUFDWCxNQUFNLHdCQUF3QjtBQUFBLFFBQzlCLE9BQU87QUFBQSxRQUNQLFFBQVE7QUFBQSxRQUNSO0FBQUEsUUFDQTtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQyxHQUFHLEtBQUs7QUFDVCxVQUFNO0FBQUEsRUFDUDtBQUNBLE9BQUssMkNBQTJDLGlCQUFrQjtBQUNqRSxVQUFNLGVBQWUsR0FBRyxLQUFLLENBQUMsRUFBRSxNQUFNLGNBQWMsWUFBWSxTQUFTLFdBQVcsS0FBSyxFQUFFLENBQUMsQ0FBQztBQUM3RixVQUFNLGlCQUFpQixHQUFHLEtBQUssQ0FBQyxFQUFFLE1BQU0sY0FBYyxZQUFZLFNBQVMsV0FBVyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0FBQy9GLFVBQU0saUJBQWlCLEdBQUcsS0FBSyxDQUFDLEVBQUUsTUFBTSxjQUFjLFlBQVksU0FBUyxXQUFXLEtBQUssRUFBRSxDQUFDLENBQUM7QUFHL0YsV0FBTyxZQUFZLFNBQVMsWUFBWSxPQUFPLENBQUMsRUFBRSxRQUFRLFFBQVEsQ0FBQztBQUNuRSxXQUFPLFlBQVksU0FBUyxZQUFZLE9BQU8sQ0FBQyxFQUFFLFFBQVEsQ0FBQyxFQUFFLE1BQU0sUUFBUSxDQUFDO0FBQzVFLFdBQU8sWUFBWSxTQUFTLFlBQVksT0FBTyxDQUFDLEVBQUUsUUFBUSxDQUFDLEVBQUUsTUFBTSxDQUFDLEVBQUUsTUFBTSxZQUFZO0FBQ3hGLFdBQU8sWUFBWSxTQUFTLEtBQUssU0FBUyxZQUFZLE9BQU8sQ0FBQyxFQUFFLFFBQVEsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxTQUFTLEdBQUcsS0FBSztBQUMzRyxXQUFPLFlBQVksU0FBUyxZQUFZLE9BQU8sQ0FBQyxFQUFFLFFBQVEsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxFQUFFLE1BQU0sWUFBWTtBQUN4RixXQUFPLFlBQVksU0FBUyxLQUFLLFNBQVMsWUFBWSxPQUFPLENBQUMsRUFBRSxRQUFRLENBQUMsRUFBRSxNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxHQUFHLEtBQUs7QUFDM0csV0FBTyxZQUFZLFNBQVMsWUFBWSxPQUFPLENBQUMsRUFBRSxRQUFRLENBQUMsRUFBRSxNQUFNLENBQUMsRUFBRSxNQUFNLFlBQVk7QUFDeEYsV0FBTyxZQUFZLFNBQVMsS0FBSyxTQUFTLFlBQVksT0FBTyxDQUFDLEVBQUUsUUFBUSxDQUFDLEVBQUUsTUFBTSxDQUFDLEVBQUUsSUFBSSxFQUFFLFNBQVMsR0FBRyxLQUFLO0FBQUEsRUFDNUcsQ0FBQztBQUNELE9BQUssNkVBQTZFLGlCQUFrQjtBQUNuRyxVQUFNLGVBQWUsR0FBRyxLQUFLLENBQUMsRUFBRSxNQUFNLGNBQWMsWUFBWSxTQUFTLFdBQVcsS0FBSyxFQUFFLENBQUMsQ0FBQztBQUM3RixVQUFNLGlCQUFpQixHQUFHLEtBQUssQ0FBQyxFQUFFLE1BQU0sd0NBQXdDLFlBQVksU0FBUyxXQUFXLEtBQUssRUFBRSxDQUFDLENBQUM7QUFDekgsVUFBTSxpQkFBaUIsR0FBRyxLQUFLLENBQUMsRUFBRSxNQUFNLHdDQUF3QyxZQUFZLFNBQVMsV0FBVyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0FBRXpILFdBQU8sWUFBWSxTQUFTLFlBQVksT0FBTyxDQUFDLEVBQUUsUUFBUSxRQUFRLENBQUM7QUFDbkUsV0FBTyxZQUFZLFNBQVMsWUFBWSxPQUFPLENBQUMsRUFBRSxRQUFRLENBQUMsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUM1RSxXQUFPLFlBQVksU0FBUyxZQUFZLE9BQU8sQ0FBQyxFQUFFLFFBQVEsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxFQUFFLE1BQU0sWUFBWTtBQUN4RixXQUFPLFlBQVksU0FBUyxZQUFZLE9BQU8sQ0FBQyxFQUFFLFFBQVEsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxFQUFFLE1BQU0sc0NBQXNDO0FBQ2xILFdBQU8sWUFBWSxTQUFTLFlBQVksT0FBTyxDQUFDLEVBQUUsUUFBUSxDQUFDLEVBQUUsTUFBTSxDQUFDLEVBQUUsTUFBTSxzQ0FBc0M7QUFBQSxFQUNuSCxDQUFDO0FBQ0QsT0FBSyxnREFBZ0QsaUJBQWtCO0FBQ3RFLFVBQU0sZUFBZSxHQUFHLEtBQUssQ0FBQyxFQUFFLE1BQU0sd0NBQXdDLFlBQVksU0FBUyxXQUFXLEtBQUssRUFBRSxDQUFDLENBQUM7QUFDdkgsVUFBTSxpQkFBaUIsR0FBRyxLQUFLLENBQUMsRUFBRSxNQUFNLHdDQUF3QyxZQUFZLFNBQVMsV0FBVyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0FBQ3pILFVBQU0saUJBQWlCLEdBQUcsS0FBSyxDQUFDLEVBQUUsTUFBTSx3Q0FBd0MsWUFBWSxTQUFTLFdBQVcsS0FBSyxFQUFFLENBQUMsQ0FBQztBQUV6SCxXQUFPLFlBQVksU0FBUyxZQUFZLE9BQU8sQ0FBQyxFQUFFLFFBQVEsUUFBUSxDQUFDO0FBQ25FLFdBQU8sWUFBWSxTQUFTLFlBQVksT0FBTyxDQUFDLEVBQUUsUUFBUSxDQUFDLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDNUUsV0FBTyxZQUFZLFNBQVMsWUFBWSxPQUFPLENBQUMsRUFBRSxRQUFRLENBQUMsRUFBRSxNQUFNLENBQUMsRUFBRSxNQUFNLHNDQUFzQztBQUNsSCxXQUFPLFlBQVksU0FBUyxLQUFLLFNBQVMsWUFBWSxPQUFPLENBQUMsRUFBRSxRQUFRLENBQUMsRUFBRSxNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxHQUFHLFdBQVc7QUFBQSxFQUNsSCxDQUFDO0FBQ0QsT0FBSyxrR0FBb0csaUJBQWtCO0FBQzFILFVBQU0sZUFBZSxHQUFHLEtBQUssQ0FBQyxFQUFFLE1BQU0sd0NBQXdDLFlBQVksU0FBUyxXQUFXLE9BQU8sRUFBRSxDQUFDLENBQUM7QUFDekgsVUFBTSxpQkFBaUIsR0FBRyxLQUFLLENBQUMsRUFBRSxNQUFNLHdDQUF3QyxZQUFZLFNBQVMsV0FBVyxHQUFHLE9BQU8sYUFBYSxFQUFFLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztBQUVySixXQUFPLFlBQVksU0FBUyxZQUFZLE9BQU8sQ0FBQyxFQUFFLFFBQVEsUUFBUSxDQUFDO0FBQ25FLFdBQU8sWUFBWSxTQUFTLFlBQVksT0FBTyxDQUFDLEVBQUUsUUFBUSxDQUFDLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDNUUsV0FBTyxZQUFZLFNBQVMsWUFBWSxPQUFPLENBQUMsRUFBRSxRQUFRLENBQUMsRUFBRSxNQUFNLENBQUMsRUFBRSxNQUFNLHNDQUFzQztBQUNsSCxXQUFPLFlBQVksU0FBUyxLQUFLLFNBQVMsWUFBWSxPQUFPLENBQUMsRUFBRSxRQUFRLENBQUMsRUFBRSxNQUFNLENBQUMsRUFBRSxJQUFJLEVBQUUsU0FBUyxHQUFHLEtBQUs7QUFBQSxFQUM1RyxDQUFDO0FBQ0QsT0FBSyx3R0FBd0csaUJBQWtCO0FBQzlILFVBQU0sZUFBZSxHQUFHLEtBQUssQ0FBQyxFQUFFLE1BQU0sd0NBQXdDLFlBQVksU0FBUyxXQUFXLEtBQUssRUFBRSxDQUFDLENBQUM7QUFDdkgsVUFBTSxpQkFBaUIsR0FBRyxLQUFLLENBQUMsRUFBRSxNQUFNLHdDQUF3QyxZQUFZLFNBQVMsV0FBVyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0FBRTNILFdBQU8sWUFBWSxTQUFTLFlBQVksT0FBTyxDQUFDLEVBQUUsUUFBUSxRQUFRLENBQUM7QUFDbkUsV0FBTyxZQUFZLFNBQVMsWUFBWSxPQUFPLENBQUMsRUFBRSxRQUFRLENBQUMsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUM1RSxXQUFPLFlBQVksU0FBUyxZQUFZLE9BQU8sQ0FBQyxFQUFFLFFBQVEsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxFQUFFLE1BQU0sc0NBQXNDO0FBQ2xILFdBQU8sWUFBWSxTQUFTLEtBQUssU0FBUyxZQUFZLE9BQU8sQ0FBQyxFQUFFLFFBQVEsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxTQUFTLEdBQUcsS0FBSztBQUFBLEVBQzVHLENBQUM7QUFDRCxPQUFLLGdEQUFnRCxpQkFBa0I7QUFDdEUsVUFBTSxlQUFlLEdBQUcsS0FBSyxDQUFDLEVBQUUsTUFBTSx3Q0FBd0MsWUFBWSxTQUFTLFdBQVcsS0FBSyxFQUFFLENBQUMsQ0FBQztBQUN2SCxVQUFNLGlCQUFpQixHQUFHLEtBQUssQ0FBQyxFQUFFLE1BQU0sd0NBQXdDLFlBQVksU0FBUyxXQUFXLEtBQUssRUFBRSxDQUFDLENBQUM7QUFDekgsVUFBTSxpQkFBaUIsR0FBRyxLQUFLLENBQUMsRUFBRSxNQUFNLHdDQUF3QyxZQUFZLFNBQVMsV0FBVyxLQUFLLEVBQUUsQ0FBQyxDQUFDO0FBRXpILFdBQU8sWUFBWSxTQUFTLFlBQVksT0FBTyxDQUFDLEVBQUUsUUFBUSxRQUFRLENBQUM7QUFDbkUsV0FBTyxZQUFZLFNBQVMsWUFBWSxPQUFPLENBQUMsRUFBRSxRQUFRLENBQUMsRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUM1RSxXQUFPLFlBQVksU0FBUyxZQUFZLE9BQU8sQ0FBQyxFQUFFLFFBQVEsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxFQUFFLE1BQU0sc0NBQXNDO0FBQ2xILFdBQU8sWUFBWSxTQUFTLEtBQUssU0FBUyxZQUFZLE9BQU8sQ0FBQyxFQUFFLFFBQVEsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxTQUFTLEdBQUcsV0FBVztBQUFBLEVBQ2xILENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
