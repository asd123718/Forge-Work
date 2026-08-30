import assert from "assert";
import { bufferToStream, VSBuffer } from "../../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Mimes } from "../../../../../base/common/mime.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { NotebookTextModel } from "../../common/model/notebookTextModel.js";
import { CellKind, NotebookSetting } from "../../common/notebookCommon.js";
import { NotebookFileWorkingCopyModel } from "../../common/notebookEditorModel.js";
import { SimpleNotebookProviderInfo } from "../../common/notebookService.js";
import { setupInstantiationService } from "./testNotebookEditor.js";
import { SnapshotContext } from "../../../../services/workingCopy/common/fileWorkingCopy.js";
suite("NotebookFileWorkingCopyModel", function() {
  let disposables;
  let instantiationService;
  const configurationService = new TestConfigurationService();
  const telemetryService = new class extends mock() {
    publicLogError2() {
    }
  }();
  const logservice = new class extends mock() {
  }();
  teardown(() => disposables.dispose());
  ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    disposables = new DisposableStore();
    instantiationService = setupInstantiationService(disposables);
  });
  test("no transient output is send to serializer", async function() {
    const notebook = instantiationService.createInstance(
      NotebookTextModel,
      "notebook",
      URI.file("test"),
      [{ cellKind: CellKind.Code, language: "foo", mime: "foo", source: "foo", outputs: [{ outputId: "id", outputs: [{ mime: Mimes.text, data: VSBuffer.fromString("Hello Out") }] }] }],
      {},
      { transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {}, transientOutputs: false }
    );
    {
      let callCount = 0;
      const model = disposables.add(new NotebookFileWorkingCopyModel(
        notebook,
        mockNotebookService(
          notebook,
          new class extends mock() {
            constructor() {
              super(...arguments);
              this.options = { transientOutputs: true, transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {} };
            }
            async notebookToData(notebook2) {
              callCount += 1;
              assert.strictEqual(notebook2.cells.length, 1);
              assert.strictEqual(notebook2.cells[0].outputs.length, 0);
              return VSBuffer.fromString("");
            }
          }()
        ),
        configurationService,
        telemetryService,
        logservice
      ));
      await model.snapshot(SnapshotContext.Save, CancellationToken.None);
      assert.strictEqual(callCount, 1);
    }
    {
      let callCount = 0;
      const model = disposables.add(new NotebookFileWorkingCopyModel(
        notebook,
        mockNotebookService(
          notebook,
          new class extends mock() {
            constructor() {
              super(...arguments);
              this.options = { transientOutputs: false, transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {} };
            }
            async notebookToData(notebook2) {
              callCount += 1;
              assert.strictEqual(notebook2.cells.length, 1);
              assert.strictEqual(notebook2.cells[0].outputs.length, 1);
              return VSBuffer.fromString("");
            }
          }()
        ),
        configurationService,
        telemetryService,
        logservice
      ));
      await model.snapshot(SnapshotContext.Save, CancellationToken.None);
      assert.strictEqual(callCount, 1);
    }
  });
  test("no transient metadata is send to serializer", async function() {
    const notebook = instantiationService.createInstance(
      NotebookTextModel,
      "notebook",
      URI.file("test"),
      [{ cellKind: CellKind.Code, language: "foo", mime: "foo", source: "foo", outputs: [] }],
      { foo: 123, bar: 456 },
      { transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {}, transientOutputs: false }
    );
    disposables.add(notebook);
    {
      let callCount = 0;
      const model = disposables.add(new NotebookFileWorkingCopyModel(
        notebook,
        mockNotebookService(
          notebook,
          new class extends mock() {
            constructor() {
              super(...arguments);
              this.options = { transientOutputs: true, transientCellMetadata: {}, transientDocumentMetadata: { bar: true }, cellContentMetadata: {} };
            }
            async notebookToData(notebook2) {
              callCount += 1;
              assert.strictEqual(notebook2.metadata.foo, 123);
              assert.strictEqual(notebook2.metadata.bar, void 0);
              return VSBuffer.fromString("");
            }
          }()
        ),
        configurationService,
        telemetryService,
        logservice
      ));
      await model.snapshot(SnapshotContext.Save, CancellationToken.None);
      assert.strictEqual(callCount, 1);
    }
    {
      let callCount = 0;
      const model = disposables.add(new NotebookFileWorkingCopyModel(
        notebook,
        mockNotebookService(
          notebook,
          new class extends mock() {
            constructor() {
              super(...arguments);
              this.options = { transientOutputs: false, transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {} };
            }
            async notebookToData(notebook2) {
              callCount += 1;
              assert.strictEqual(notebook2.metadata.foo, 123);
              assert.strictEqual(notebook2.metadata.bar, 456);
              return VSBuffer.fromString("");
            }
          }()
        ),
        configurationService,
        telemetryService,
        logservice
      ));
      await model.snapshot(SnapshotContext.Save, CancellationToken.None);
      assert.strictEqual(callCount, 1);
    }
  });
  test("no transient cell metadata is send to serializer", async function() {
    const notebook = instantiationService.createInstance(
      NotebookTextModel,
      "notebook",
      URI.file("test"),
      [{ cellKind: CellKind.Code, language: "foo", mime: "foo", source: "foo", outputs: [], metadata: { foo: 123, bar: 456 } }],
      {},
      { transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {}, transientOutputs: false }
    );
    disposables.add(notebook);
    {
      let callCount = 0;
      const model = disposables.add(new NotebookFileWorkingCopyModel(
        notebook,
        mockNotebookService(
          notebook,
          new class extends mock() {
            constructor() {
              super(...arguments);
              this.options = { transientOutputs: true, transientDocumentMetadata: {}, transientCellMetadata: { bar: true }, cellContentMetadata: {} };
            }
            async notebookToData(notebook2) {
              callCount += 1;
              assert.strictEqual(notebook2.cells[0].metadata.foo, 123);
              assert.strictEqual(notebook2.cells[0].metadata.bar, void 0);
              return VSBuffer.fromString("");
            }
          }()
        ),
        configurationService,
        telemetryService,
        logservice
      ));
      await model.snapshot(SnapshotContext.Save, CancellationToken.None);
      assert.strictEqual(callCount, 1);
    }
    {
      let callCount = 0;
      const model = disposables.add(new NotebookFileWorkingCopyModel(
        notebook,
        mockNotebookService(
          notebook,
          new class extends mock() {
            constructor() {
              super(...arguments);
              this.options = { transientOutputs: false, transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {} };
            }
            async notebookToData(notebook2) {
              callCount += 1;
              assert.strictEqual(notebook2.cells[0].metadata.foo, 123);
              assert.strictEqual(notebook2.cells[0].metadata.bar, 456);
              return VSBuffer.fromString("");
            }
          }()
        ),
        configurationService,
        telemetryService,
        logservice
      ));
      await model.snapshot(SnapshotContext.Save, CancellationToken.None);
      assert.strictEqual(callCount, 1);
    }
  });
  test("Notebooks with outputs beyond the size threshold will throw for backup snapshots", async function() {
    const outputLimit = 100;
    await configurationService.setUserConfiguration(NotebookSetting.outputBackupSizeLimit, outputLimit * 1 / 1024);
    const largeOutput = { outputId: "123", outputs: [{ mime: Mimes.text, data: VSBuffer.fromString("a".repeat(outputLimit + 1)) }] };
    const notebook = instantiationService.createInstance(
      NotebookTextModel,
      "notebook",
      URI.file("test"),
      [{ cellKind: CellKind.Code, language: "foo", mime: "foo", source: "foo", outputs: [largeOutput], metadata: { foo: 123, bar: 456 } }],
      {},
      { transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {}, transientOutputs: false }
    );
    disposables.add(notebook);
    let callCount = 0;
    const model = disposables.add(new NotebookFileWorkingCopyModel(
      notebook,
      mockNotebookService(
        notebook,
        new class extends mock() {
          constructor() {
            super(...arguments);
            this.options = { transientOutputs: true, transientDocumentMetadata: {}, transientCellMetadata: { bar: true }, cellContentMetadata: {} };
          }
          async notebookToData(notebook2) {
            callCount += 1;
            assert.strictEqual(notebook2.cells[0].metadata.foo, 123);
            assert.strictEqual(notebook2.cells[0].metadata.bar, void 0);
            return VSBuffer.fromString("");
          }
        }(),
        configurationService
      ),
      configurationService,
      telemetryService,
      logservice
    ));
    try {
      await model.snapshot(SnapshotContext.Backup, CancellationToken.None);
      assert.fail("Expected snapshot to throw an error for large output");
    } catch (e) {
      assert.notEqual(e.code, "ERR_ASSERTION", e.message);
    }
    await model.snapshot(SnapshotContext.Save, CancellationToken.None);
    assert.strictEqual(callCount, 1);
  });
  test("Notebook model will not return a save delegate if the serializer has not been retreived", async function() {
    const notebook = instantiationService.createInstance(
      NotebookTextModel,
      "notebook",
      URI.file("test"),
      [{ cellKind: CellKind.Code, language: "foo", mime: "foo", source: "foo", outputs: [], metadata: { foo: 123, bar: 456 } }],
      {},
      { transientCellMetadata: {}, transientDocumentMetadata: {}, cellContentMetadata: {}, transientOutputs: false }
    );
    disposables.add(notebook);
    const serializer = new class extends mock() {
      save() {
        return Promise.resolve({ name: "savedFile" });
      }
    }();
    let resolveSerializer = () => {
    };
    const serializerPromise = new Promise((resolve) => {
      resolveSerializer = resolve;
    });
    const notebookService = mockNotebookService(notebook, serializerPromise);
    configurationService.setUserConfiguration(NotebookSetting.remoteSaving, true);
    const model = disposables.add(new NotebookFileWorkingCopyModel(
      notebook,
      notebookService,
      configurationService,
      telemetryService,
      logservice
    ));
    const notExist = model.save;
    assert.strictEqual(notExist, void 0);
    resolveSerializer(serializer);
    await model.getNotebookSerializer();
    const result = await model.save?.({}, {});
    assert.strictEqual(result.name, "savedFile");
  });
});
function mockNotebookService(notebook, notebookSerializer, configurationService = new TestConfigurationService()) {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.serializer = void 0;
    }
    async withNotebookDataProvider(viewType) {
      this.serializer = await notebookSerializer;
      return new SimpleNotebookProviderInfo(
        notebook.viewType,
        this.serializer,
        {
          id: new ExtensionIdentifier("test"),
          location: void 0
        }
      );
    }
    tryGetDataProviderSync(viewType) {
      if (!this.serializer) {
        return void 0;
      }
      return new SimpleNotebookProviderInfo(
        notebook.viewType,
        this.serializer,
        {
          id: new ExtensionIdentifier("test"),
          location: void 0
        }
      );
    }
    async createNotebookTextDocumentSnapshot(uri, context, token) {
      const info = await this.withNotebookDataProvider(notebook.viewType);
      const serializer = info.serializer;
      const outputSizeLimit = configurationService.getValue(NotebookSetting.outputBackupSizeLimit) ?? 1024;
      const data = notebook.createSnapshot({ context, outputSizeLimit, transientOptions: serializer.options });
      const bytes = await serializer.notebookToData(data);
      return bufferToStream(bytes);
    }
  }();
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFx0ZXN0XFxicm93c2VyXFxub3RlYm9va0VkaXRvck1vZGVsLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBidWZmZXJUb1N0cmVhbSwgVlNCdWZmZXIsIFZTQnVmZmVyUmVhZGFibGVTdHJlYW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE1pbWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWltZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElGaWxlU3RhdFdpdGhNZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvbm90ZWJvb2tUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbEtpbmQsIElPdXRwdXREdG8sIE5vdGVib29rRGF0YSwgTm90ZWJvb2tTZXR0aW5nLCBUcmFuc2llbnRPcHRpb25zIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IE5vdGVib29rRmlsZVdvcmtpbmdDb3B5TW9kZWwgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tFZGl0b3JNb2RlbC5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tTZXJpYWxpemVyLCBJTm90ZWJvb2tTZXJ2aWNlLCBTaW1wbGVOb3RlYm9va1Byb3ZpZGVySW5mbyB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgc2V0dXBJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4vdGVzdE5vdGVib29rRWRpdG9yLmpzJztcbmltcG9ydCB7IFNuYXBzaG90Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi9maWxlV29ya2luZ0NvcHkuanMnO1xuXG5zdWl0ZSgnTm90ZWJvb2tGaWxlV29ya2luZ0NvcHlNb2RlbCcsIGZ1bmN0aW9uICgpIHtcblxuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVGVsZW1ldHJ5U2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcHVibGljTG9nRXJyb3IyKCkgeyB9XG5cdH07XG5cdGNvbnN0IGxvZ3NlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMb2dTZXJ2aWNlPigpIHsgfTtcblxuXHR0ZWFyZG93bigoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkpO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHNldHVwSW5zdGFudGlhdGlvblNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHR9KTtcblxuXHR0ZXN0KCdubyB0cmFuc2llbnQgb3V0cHV0IGlzIHNlbmQgdG8gc2VyaWFsaXplcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IG5vdGVib29rID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tUZXh0TW9kZWwsXG5cdFx0XHQnbm90ZWJvb2snLFxuXHRcdFx0VVJJLmZpbGUoJ3Rlc3QnKSxcblx0XHRcdFt7IGNlbGxLaW5kOiBDZWxsS2luZC5Db2RlLCBsYW5ndWFnZTogJ2ZvbycsIG1pbWU6ICdmb28nLCBzb3VyY2U6ICdmb28nLCBvdXRwdXRzOiBbeyBvdXRwdXRJZDogJ2lkJywgb3V0cHV0czogW3sgbWltZTogTWltZXMudGV4dCwgZGF0YTogVlNCdWZmZXIuZnJvbVN0cmluZygnSGVsbG8gT3V0JykgfV0gfV0gfV0sXG5cdFx0XHR7fSxcblx0XHRcdHsgdHJhbnNpZW50Q2VsbE1ldGFkYXRhOiB7fSwgdHJhbnNpZW50RG9jdW1lbnRNZXRhZGF0YToge30sIGNlbGxDb250ZW50TWV0YWRhdGE6IHt9LCB0cmFuc2llbnRPdXRwdXRzOiBmYWxzZSB9XG5cdFx0KTtcblxuXHRcdHsgLy8gdHJhbnNpZW50IG91dHB1dFxuXHRcdFx0bGV0IGNhbGxDb3VudCA9IDA7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTm90ZWJvb2tGaWxlV29ya2luZ0NvcHlNb2RlbChcblx0XHRcdFx0bm90ZWJvb2ssXG5cdFx0XHRcdG1vY2tOb3RlYm9va1NlcnZpY2Uobm90ZWJvb2ssXG5cdFx0XHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTm90ZWJvb2tTZXJpYWxpemVyPigpIHtcblx0XHRcdFx0XHRcdG92ZXJyaWRlIG9wdGlvbnM6IFRyYW5zaWVudE9wdGlvbnMgPSB7IHRyYW5zaWVudE91dHB1dHM6IHRydWUsIHRyYW5zaWVudENlbGxNZXRhZGF0YToge30sIHRyYW5zaWVudERvY3VtZW50TWV0YWRhdGE6IHt9LCBjZWxsQ29udGVudE1ldGFkYXRhOiB7fSB9O1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgbm90ZWJvb2tUb0RhdGEobm90ZWJvb2s6IE5vdGVib29rRGF0YSkge1xuXHRcdFx0XHRcdFx0XHRjYWxsQ291bnQgKz0gMTtcblx0XHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmNlbGxzLmxlbmd0aCwgMSk7XG5cdFx0XHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5jZWxsc1swXS5vdXRwdXRzLmxlbmd0aCwgMCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBWU0J1ZmZlci5mcm9tU3RyaW5nKCcnKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdCksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0XHRsb2dzZXJ2aWNlXG5cdFx0XHQpKTtcblxuXHRcdFx0YXdhaXQgbW9kZWwuc25hcHNob3QoU25hcHNob3RDb250ZXh0LlNhdmUsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxDb3VudCwgMSk7XG5cdFx0fVxuXG5cdFx0eyAvLyBOT1QgdHJhbnNpZW50IG91dHB1dFxuXHRcdFx0bGV0IGNhbGxDb3VudCA9IDA7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTm90ZWJvb2tGaWxlV29ya2luZ0NvcHlNb2RlbChcblx0XHRcdFx0bm90ZWJvb2ssXG5cdFx0XHRcdG1vY2tOb3RlYm9va1NlcnZpY2Uobm90ZWJvb2ssXG5cdFx0XHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTm90ZWJvb2tTZXJpYWxpemVyPigpIHtcblx0XHRcdFx0XHRcdG92ZXJyaWRlIG9wdGlvbnM6IFRyYW5zaWVudE9wdGlvbnMgPSB7IHRyYW5zaWVudE91dHB1dHM6IGZhbHNlLCB0cmFuc2llbnRDZWxsTWV0YWRhdGE6IHt9LCB0cmFuc2llbnREb2N1bWVudE1ldGFkYXRhOiB7fSwgY2VsbENvbnRlbnRNZXRhZGF0YToge30gfTtcblx0XHRcdFx0XHRcdG92ZXJyaWRlIGFzeW5jIG5vdGVib29rVG9EYXRhKG5vdGVib29rOiBOb3RlYm9va0RhdGEpIHtcblx0XHRcdFx0XHRcdFx0Y2FsbENvdW50ICs9IDE7XG5cdFx0XHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5jZWxscy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suY2VsbHNbMF0ub3V0cHV0cy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gVlNCdWZmZXIuZnJvbVN0cmluZygnJyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRjb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdFx0dGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdFx0bG9nc2VydmljZVxuXHRcdFx0KSk7XG5cdFx0XHRhd2FpdCBtb2RlbC5zbmFwc2hvdChTbmFwc2hvdENvbnRleHQuU2F2ZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbENvdW50LCAxKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ25vIHRyYW5zaWVudCBtZXRhZGF0YSBpcyBzZW5kIHRvIHNlcmlhbGl6ZXInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBub3RlYm9vayA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rVGV4dE1vZGVsLFxuXHRcdFx0J25vdGVib29rJyxcblx0XHRcdFVSSS5maWxlKCd0ZXN0JyksXG5cdFx0XHRbeyBjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSwgbGFuZ3VhZ2U6ICdmb28nLCBtaW1lOiAnZm9vJywgc291cmNlOiAnZm9vJywgb3V0cHV0czogW10gfV0sXG5cdFx0XHR7IGZvbzogMTIzLCBiYXI6IDQ1NiB9LFxuXHRcdFx0eyB0cmFuc2llbnRDZWxsTWV0YWRhdGE6IHt9LCB0cmFuc2llbnREb2N1bWVudE1ldGFkYXRhOiB7fSwgY2VsbENvbnRlbnRNZXRhZGF0YToge30sIHRyYW5zaWVudE91dHB1dHM6IGZhbHNlIH1cblx0XHQpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG5vdGVib29rKTtcblxuXHRcdHsgLy8gdHJhbnNpZW50XG5cdFx0XHRsZXQgY2FsbENvdW50ID0gMDtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBOb3RlYm9va0ZpbGVXb3JraW5nQ29weU1vZGVsKFxuXHRcdFx0XHRub3RlYm9vayxcblx0XHRcdFx0bW9ja05vdGVib29rU2VydmljZShub3RlYm9vayxcblx0XHRcdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va1NlcmlhbGl6ZXI+KCkge1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgb3B0aW9uczogVHJhbnNpZW50T3B0aW9ucyA9IHsgdHJhbnNpZW50T3V0cHV0czogdHJ1ZSwgdHJhbnNpZW50Q2VsbE1ldGFkYXRhOiB7fSwgdHJhbnNpZW50RG9jdW1lbnRNZXRhZGF0YTogeyBiYXI6IHRydWUgfSwgY2VsbENvbnRlbnRNZXRhZGF0YToge30gfTtcblx0XHRcdFx0XHRcdG92ZXJyaWRlIGFzeW5jIG5vdGVib29rVG9EYXRhKG5vdGVib29rOiBOb3RlYm9va0RhdGEpIHtcblx0XHRcdFx0XHRcdFx0Y2FsbENvdW50ICs9IDE7XG5cdFx0XHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5tZXRhZGF0YS5mb28sIDEyMyk7XG5cdFx0XHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5tZXRhZGF0YS5iYXIsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBWU0J1ZmZlci5mcm9tU3RyaW5nKCcnKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdCksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0XHRsb2dzZXJ2aWNlXG5cdFx0XHQpKTtcblxuXHRcdFx0YXdhaXQgbW9kZWwuc25hcHNob3QoU25hcHNob3RDb250ZXh0LlNhdmUsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxDb3VudCwgMSk7XG5cdFx0fVxuXG5cdFx0eyAvLyBOT1QgdHJhbnNpZW50XG5cdFx0XHRsZXQgY2FsbENvdW50ID0gMDtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBOb3RlYm9va0ZpbGVXb3JraW5nQ29weU1vZGVsKFxuXHRcdFx0XHRub3RlYm9vayxcblx0XHRcdFx0bW9ja05vdGVib29rU2VydmljZShub3RlYm9vayxcblx0XHRcdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va1NlcmlhbGl6ZXI+KCkge1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgb3B0aW9uczogVHJhbnNpZW50T3B0aW9ucyA9IHsgdHJhbnNpZW50T3V0cHV0czogZmFsc2UsIHRyYW5zaWVudENlbGxNZXRhZGF0YToge30sIHRyYW5zaWVudERvY3VtZW50TWV0YWRhdGE6IHt9LCBjZWxsQ29udGVudE1ldGFkYXRhOiB7fSB9O1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgbm90ZWJvb2tUb0RhdGEobm90ZWJvb2s6IE5vdGVib29rRGF0YSkge1xuXHRcdFx0XHRcdFx0XHRjYWxsQ291bnQgKz0gMTtcblx0XHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLm1ldGFkYXRhLmZvbywgMTIzKTtcblx0XHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLm1ldGFkYXRhLmJhciwgNDU2KTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIFZTQnVmZmVyLmZyb21TdHJpbmcoJycpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0KSxcblx0XHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHRcdGxvZ3NlcnZpY2VcblxuXHRcdFx0KSk7XG5cdFx0XHRhd2FpdCBtb2RlbC5zbmFwc2hvdChTbmFwc2hvdENvbnRleHQuU2F2ZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbENvdW50LCAxKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ25vIHRyYW5zaWVudCBjZWxsIG1ldGFkYXRhIGlzIHNlbmQgdG8gc2VyaWFsaXplcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IG5vdGVib29rID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tUZXh0TW9kZWwsXG5cdFx0XHQnbm90ZWJvb2snLFxuXHRcdFx0VVJJLmZpbGUoJ3Rlc3QnKSxcblx0XHRcdFt7IGNlbGxLaW5kOiBDZWxsS2luZC5Db2RlLCBsYW5ndWFnZTogJ2ZvbycsIG1pbWU6ICdmb28nLCBzb3VyY2U6ICdmb28nLCBvdXRwdXRzOiBbXSwgbWV0YWRhdGE6IHsgZm9vOiAxMjMsIGJhcjogNDU2IH0gfV0sXG5cdFx0XHR7fSxcblx0XHRcdHsgdHJhbnNpZW50Q2VsbE1ldGFkYXRhOiB7fSwgdHJhbnNpZW50RG9jdW1lbnRNZXRhZGF0YToge30sIGNlbGxDb250ZW50TWV0YWRhdGE6IHt9LCB0cmFuc2llbnRPdXRwdXRzOiBmYWxzZSwgfVxuXHRcdCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG5vdGVib29rKTtcblxuXHRcdHsgLy8gdHJhbnNpZW50XG5cdFx0XHRsZXQgY2FsbENvdW50ID0gMDtcblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBOb3RlYm9va0ZpbGVXb3JraW5nQ29weU1vZGVsKFxuXHRcdFx0XHRub3RlYm9vayxcblx0XHRcdFx0bW9ja05vdGVib29rU2VydmljZShub3RlYm9vayxcblx0XHRcdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va1NlcmlhbGl6ZXI+KCkge1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgb3B0aW9uczogVHJhbnNpZW50T3B0aW9ucyA9IHsgdHJhbnNpZW50T3V0cHV0czogdHJ1ZSwgdHJhbnNpZW50RG9jdW1lbnRNZXRhZGF0YToge30sIHRyYW5zaWVudENlbGxNZXRhZGF0YTogeyBiYXI6IHRydWUgfSwgY2VsbENvbnRlbnRNZXRhZGF0YToge30gfTtcblx0XHRcdFx0XHRcdG92ZXJyaWRlIGFzeW5jIG5vdGVib29rVG9EYXRhKG5vdGVib29rOiBOb3RlYm9va0RhdGEpIHtcblx0XHRcdFx0XHRcdFx0Y2FsbENvdW50ICs9IDE7XG5cdFx0XHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5jZWxsc1swXS5tZXRhZGF0YSEuZm9vLCAxMjMpO1xuXHRcdFx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suY2VsbHNbMF0ubWV0YWRhdGEhLmJhciwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIFZTQnVmZmVyLmZyb21TdHJpbmcoJycpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0KSxcblx0XHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHRcdGxvZ3NlcnZpY2Vcblx0XHRcdCkpO1xuXG5cdFx0XHRhd2FpdCBtb2RlbC5zbmFwc2hvdChTbmFwc2hvdENvbnRleHQuU2F2ZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbENvdW50LCAxKTtcblx0XHR9XG5cblx0XHR7IC8vIE5PVCB0cmFuc2llbnRcblx0XHRcdGxldCBjYWxsQ291bnQgPSAwO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE5vdGVib29rRmlsZVdvcmtpbmdDb3B5TW9kZWwoXG5cdFx0XHRcdG5vdGVib29rLFxuXHRcdFx0XHRtb2NrTm90ZWJvb2tTZXJ2aWNlKG5vdGVib29rLFxuXHRcdFx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU5vdGVib29rU2VyaWFsaXplcj4oKSB7XG5cdFx0XHRcdFx0XHRvdmVycmlkZSBvcHRpb25zOiBUcmFuc2llbnRPcHRpb25zID0geyB0cmFuc2llbnRPdXRwdXRzOiBmYWxzZSwgdHJhbnNpZW50Q2VsbE1ldGFkYXRhOiB7fSwgdHJhbnNpZW50RG9jdW1lbnRNZXRhZGF0YToge30sIGNlbGxDb250ZW50TWV0YWRhdGE6IHt9IH07XG5cdFx0XHRcdFx0XHRvdmVycmlkZSBhc3luYyBub3RlYm9va1RvRGF0YShub3RlYm9vazogTm90ZWJvb2tEYXRhKSB7XG5cdFx0XHRcdFx0XHRcdGNhbGxDb3VudCArPSAxO1xuXHRcdFx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suY2VsbHNbMF0ubWV0YWRhdGEhLmZvbywgMTIzKTtcblx0XHRcdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGVib29rLmNlbGxzWzBdLm1ldGFkYXRhIS5iYXIsIDQ1Nik7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBWU0J1ZmZlci5mcm9tU3RyaW5nKCcnKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdCksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHR0ZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0XHRsb2dzZXJ2aWNlXG5cdFx0XHQpKTtcblx0XHRcdGF3YWl0IG1vZGVsLnNuYXBzaG90KFNuYXBzaG90Q29udGV4dC5TYXZlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsQ291bnQsIDEpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnTm90ZWJvb2tzIHdpdGggb3V0cHV0cyBiZXlvbmQgdGhlIHNpemUgdGhyZXNob2xkIHdpbGwgdGhyb3cgZm9yIGJhY2t1cCBzbmFwc2hvdHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgb3V0cHV0TGltaXQgPSAxMDA7XG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLm91dHB1dEJhY2t1cFNpemVMaW1pdCwgb3V0cHV0TGltaXQgKiAxLjAgLyAxMDI0KTtcblx0XHRjb25zdCBsYXJnZU91dHB1dDogSU91dHB1dER0byA9IHsgb3V0cHV0SWQ6ICcxMjMnLCBvdXRwdXRzOiBbeyBtaW1lOiBNaW1lcy50ZXh0LCBkYXRhOiBWU0J1ZmZlci5mcm9tU3RyaW5nKCdhJy5yZXBlYXQob3V0cHV0TGltaXQgKyAxKSkgfV0gfTtcblx0XHRjb25zdCBub3RlYm9vayA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rVGV4dE1vZGVsLFxuXHRcdFx0J25vdGVib29rJyxcblx0XHRcdFVSSS5maWxlKCd0ZXN0JyksXG5cdFx0XHRbeyBjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSwgbGFuZ3VhZ2U6ICdmb28nLCBtaW1lOiAnZm9vJywgc291cmNlOiAnZm9vJywgb3V0cHV0czogW2xhcmdlT3V0cHV0XSwgbWV0YWRhdGE6IHsgZm9vOiAxMjMsIGJhcjogNDU2IH0gfV0sXG5cdFx0XHR7fSxcblx0XHRcdHsgdHJhbnNpZW50Q2VsbE1ldGFkYXRhOiB7fSwgdHJhbnNpZW50RG9jdW1lbnRNZXRhZGF0YToge30sIGNlbGxDb250ZW50TWV0YWRhdGE6IHt9LCB0cmFuc2llbnRPdXRwdXRzOiBmYWxzZSwgfVxuXHRcdCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG5vdGVib29rKTtcblxuXHRcdGxldCBjYWxsQ291bnQgPSAwO1xuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBOb3RlYm9va0ZpbGVXb3JraW5nQ29weU1vZGVsKFxuXHRcdFx0bm90ZWJvb2ssXG5cdFx0XHRtb2NrTm90ZWJvb2tTZXJ2aWNlKG5vdGVib29rLFxuXHRcdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va1NlcmlhbGl6ZXI+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIG9wdGlvbnM6IFRyYW5zaWVudE9wdGlvbnMgPSB7IHRyYW5zaWVudE91dHB1dHM6IHRydWUsIHRyYW5zaWVudERvY3VtZW50TWV0YWRhdGE6IHt9LCB0cmFuc2llbnRDZWxsTWV0YWRhdGE6IHsgYmFyOiB0cnVlIH0sIGNlbGxDb250ZW50TWV0YWRhdGE6IHt9IH07XG5cdFx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgbm90ZWJvb2tUb0RhdGEobm90ZWJvb2s6IE5vdGVib29rRGF0YSkge1xuXHRcdFx0XHRcdFx0Y2FsbENvdW50ICs9IDE7XG5cdFx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90ZWJvb2suY2VsbHNbMF0ubWV0YWRhdGEhLmZvbywgMTIzKTtcblx0XHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RlYm9vay5jZWxsc1swXS5tZXRhZGF0YSEuYmFyLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIFZTQnVmZmVyLmZyb21TdHJpbmcoJycpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Vcblx0XHRcdCksXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRcdHRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHRsb2dzZXJ2aWNlXG5cdFx0KSk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgbW9kZWwuc25hcHNob3QoU25hcHNob3RDb250ZXh0LkJhY2t1cCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuZmFpbCgnRXhwZWN0ZWQgc25hcHNob3QgdG8gdGhyb3cgYW4gZXJyb3IgZm9yIGxhcmdlIG91dHB1dCcpO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGFzc2VydC5ub3RFcXVhbChlLmNvZGUsICdFUlJfQVNTRVJUSU9OJywgZS5tZXNzYWdlKTtcblx0XHR9XG5cblx0XHRhd2FpdCBtb2RlbC5zbmFwc2hvdChTbmFwc2hvdENvbnRleHQuU2F2ZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxDb3VudCwgMSk7XG5cblx0fSk7XG5cblx0dGVzdCgnTm90ZWJvb2sgbW9kZWwgd2lsbCBub3QgcmV0dXJuIGEgc2F2ZSBkZWxlZ2F0ZSBpZiB0aGUgc2VyaWFsaXplciBoYXMgbm90IGJlZW4gcmV0cmVpdmVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG5vdGVib29rID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tUZXh0TW9kZWwsXG5cdFx0XHQnbm90ZWJvb2snLFxuXHRcdFx0VVJJLmZpbGUoJ3Rlc3QnKSxcblx0XHRcdFt7IGNlbGxLaW5kOiBDZWxsS2luZC5Db2RlLCBsYW5ndWFnZTogJ2ZvbycsIG1pbWU6ICdmb28nLCBzb3VyY2U6ICdmb28nLCBvdXRwdXRzOiBbXSwgbWV0YWRhdGE6IHsgZm9vOiAxMjMsIGJhcjogNDU2IH0gfV0sXG5cdFx0XHR7fSxcblx0XHRcdHsgdHJhbnNpZW50Q2VsbE1ldGFkYXRhOiB7fSwgdHJhbnNpZW50RG9jdW1lbnRNZXRhZGF0YToge30sIGNlbGxDb250ZW50TWV0YWRhdGE6IHt9LCB0cmFuc2llbnRPdXRwdXRzOiBmYWxzZSwgfVxuXHRcdCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG5vdGVib29rKTtcblxuXHRcdGNvbnN0IHNlcmlhbGl6ZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va1NlcmlhbGl6ZXI+KCkge1xuXHRcdFx0b3ZlcnJpZGUgc2F2ZSgpOiBQcm9taXNlPElGaWxlU3RhdFdpdGhNZXRhZGF0YT4ge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHsgbmFtZTogJ3NhdmVkRmlsZScgfSBhcyBJRmlsZVN0YXRXaXRoTWV0YWRhdGEpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRsZXQgcmVzb2x2ZVNlcmlhbGl6ZXI6IChzZXJpYWxpemVyOiBJTm90ZWJvb2tTZXJpYWxpemVyKSA9PiB2b2lkID0gKCkgPT4geyB9O1xuXHRcdGNvbnN0IHNlcmlhbGl6ZXJQcm9taXNlID0gbmV3IFByb21pc2U8SU5vdGVib29rU2VyaWFsaXplcj4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRyZXNvbHZlU2VyaWFsaXplciA9IHJlc29sdmU7XG5cdFx0fSk7XG5cdFx0Y29uc3Qgbm90ZWJvb2tTZXJ2aWNlID0gbW9ja05vdGVib29rU2VydmljZShub3RlYm9vaywgc2VyaWFsaXplclByb21pc2UpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5yZW1vdGVTYXZpbmcsIHRydWUpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE5vdGVib29rRmlsZVdvcmtpbmdDb3B5TW9kZWwoXG5cdFx0XHRub3RlYm9vayxcblx0XHRcdG5vdGVib29rU2VydmljZSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdFx0dGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdGxvZ3NlcnZpY2Vcblx0XHQpKTtcblxuXHRcdC8vIHRoZSBzYXZlIG1ldGhvZCBzaG91bGQgbm90IGJlIHNldCBpZiB0aGUgc2VyaWFsaXplciBpcyBub3QgeWV0IHJlc29sdmVkXG5cdFx0Y29uc3Qgbm90RXhpc3QgPSBtb2RlbC5zYXZlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RFeGlzdCwgdW5kZWZpbmVkKTtcblxuXHRcdHJlc29sdmVTZXJpYWxpemVyKHNlcmlhbGl6ZXIpO1xuXHRcdGF3YWl0IG1vZGVsLmdldE5vdGVib29rU2VyaWFsaXplcigpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1vZGVsLnNhdmU/Lih7fSBhcyBJRmlsZVN0YXRXaXRoTWV0YWRhdGEsIHt9IGFzIENhbmNlbGxhdGlvblRva2VuKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQhLm5hbWUsICdzYXZlZEZpbGUnKTtcblx0fSk7XG59KTtcblxuZnVuY3Rpb24gbW9ja05vdGVib29rU2VydmljZShub3RlYm9vazogTm90ZWJvb2tUZXh0TW9kZWwsIG5vdGVib29rU2VyaWFsaXplcjogUHJvbWlzZTxJTm90ZWJvb2tTZXJpYWxpemVyPiB8IElOb3RlYm9va1NlcmlhbGl6ZXIsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpOiBJTm90ZWJvb2tTZXJ2aWNlIHtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU5vdGVib29rU2VydmljZT4oKSB7XG5cdFx0cHJpdmF0ZSBzZXJpYWxpemVyOiBJTm90ZWJvb2tTZXJpYWxpemVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdG92ZXJyaWRlIGFzeW5jIHdpdGhOb3RlYm9va0RhdGFQcm92aWRlcih2aWV3VHlwZTogc3RyaW5nKTogUHJvbWlzZTxTaW1wbGVOb3RlYm9va1Byb3ZpZGVySW5mbz4ge1xuXHRcdFx0dGhpcy5zZXJpYWxpemVyID0gYXdhaXQgbm90ZWJvb2tTZXJpYWxpemVyO1xuXHRcdFx0cmV0dXJuIG5ldyBTaW1wbGVOb3RlYm9va1Byb3ZpZGVySW5mbyhcblx0XHRcdFx0bm90ZWJvb2sudmlld1R5cGUsXG5cdFx0XHRcdHRoaXMuc2VyaWFsaXplcixcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdCcpLFxuXHRcdFx0XHRcdGxvY2F0aW9uOiB1bmRlZmluZWRcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgdHJ5R2V0RGF0YVByb3ZpZGVyU3luYyh2aWV3VHlwZTogc3RyaW5nKTogU2ltcGxlTm90ZWJvb2tQcm92aWRlckluZm8gfCB1bmRlZmluZWQge1xuXHRcdFx0aWYgKCF0aGlzLnNlcmlhbGl6ZXIpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXcgU2ltcGxlTm90ZWJvb2tQcm92aWRlckluZm8oXG5cdFx0XHRcdG5vdGVib29rLnZpZXdUeXBlLFxuXHRcdFx0XHR0aGlzLnNlcmlhbGl6ZXIsXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QnKSxcblx0XHRcdFx0XHRsb2NhdGlvbjogdW5kZWZpbmVkXG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGFzeW5jIGNyZWF0ZU5vdGVib29rVGV4dERvY3VtZW50U25hcHNob3QodXJpOiBVUkksIGNvbnRleHQ6IFNuYXBzaG90Q29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxWU0J1ZmZlclJlYWRhYmxlU3RyZWFtPiB7XG5cdFx0XHRjb25zdCBpbmZvID0gYXdhaXQgdGhpcy53aXRoTm90ZWJvb2tEYXRhUHJvdmlkZXIobm90ZWJvb2sudmlld1R5cGUpO1xuXHRcdFx0Y29uc3Qgc2VyaWFsaXplciA9IGluZm8uc2VyaWFsaXplcjtcblx0XHRcdGNvbnN0IG91dHB1dFNpemVMaW1pdCA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4oTm90ZWJvb2tTZXR0aW5nLm91dHB1dEJhY2t1cFNpemVMaW1pdCkgPz8gMTAyNDtcblx0XHRcdGNvbnN0IGRhdGE6IE5vdGVib29rRGF0YSA9IG5vdGVib29rLmNyZWF0ZVNuYXBzaG90KHsgY29udGV4dDogY29udGV4dCwgb3V0cHV0U2l6ZUxpbWl0OiBvdXRwdXRTaXplTGltaXQsIHRyYW5zaWVudE9wdGlvbnM6IHNlcmlhbGl6ZXIub3B0aW9ucyB9KTtcblx0XHRcdGNvbnN0IGJ5dGVzID0gYXdhaXQgc2VyaWFsaXplci5ub3RlYm9va1RvRGF0YShkYXRhKTtcblxuXHRcdFx0cmV0dXJuIGJ1ZmZlclRvU3RyZWFtKGJ5dGVzKTtcblx0XHR9XG5cdH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0IsZ0JBQXdDO0FBQ2pFLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsYUFBYTtBQUN0QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMkJBQTJCO0FBS3BDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsVUFBb0MsdUJBQXlDO0FBQ3RGLFNBQVMsb0NBQW9DO0FBQzdDLFNBQWdELGtDQUFrQztBQUNsRixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHVCQUF1QjtBQUVoQyxNQUFNLGdDQUFnQyxXQUFZO0FBRWpELE1BQUk7QUFDSixNQUFJO0FBQ0osUUFBTSx1QkFBdUIsSUFBSSx5QkFBeUI7QUFDMUQsUUFBTSxtQkFBbUIsSUFBSSxjQUFjLEtBQXdCLEVBQUU7QUFBQSxJQUMzRCxrQkFBa0I7QUFBQSxJQUFFO0FBQUEsRUFDOUI7QUFDQSxRQUFNLGFBQWEsSUFBSSxjQUFjLEtBQWtCLEVBQUU7QUFBQSxFQUFFO0FBRTNELFdBQVMsTUFBTSxZQUFZLFFBQVEsQ0FBQztBQUVwQywwQ0FBd0M7QUFFeEMsUUFBTSxNQUFNO0FBQ1gsa0JB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QUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFHRCxVQUFNLFdBQVcsTUFBTTtBQUN2QixXQUFPLFlBQVksVUFBVSxNQUFTO0FBRXRDLHNCQUFrQixVQUFVO0FBQzVCLFVBQU0sTUFBTSxzQkFBc0I7QUFDbEMsVUFBTSxTQUFTLE1BQU0sTUFBTSxPQUFPLENBQUMsR0FBNEIsQ0FBQyxDQUFzQjtBQUV0RixXQUFPLFlBQVksT0FBUSxNQUFNLFdBQVc7QUFBQSxFQUM3QyxDQUFDO0FBQ0YsQ0FBQztBQUVELFNBQVMsb0JBQW9CLFVBQTZCLG9CQUF3RSx1QkFBaUQsSUFBSSx5QkFBeUIsR0FBcUI7QUFDcE8sU0FBTyxJQUFJLGNBQWMsS0FBdUIsRUFBRTtBQUFBLElBQXZDO0FBQUE7QUFDVixXQUFRLGFBQThDO0FBQUE7QUFBQSxJQUN0RCxNQUFlLHlCQUF5QixVQUF1RDtBQUM5RixXQUFLLGFBQWEsTUFBTTtBQUN4QixhQUFPLElBQUk7QUFBQSxRQUNWLFNBQVM7QUFBQSxRQUNULEtBQUs7QUFBQSxRQUNMO0FBQUEsVUFDQyxJQUFJLElBQUksb0JBQW9CLE1BQU07QUFBQSxVQUNsQyxVQUFVO0FBQUEsUUFDWDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFDUyx1QkFBdUIsVUFBMEQ7QUFDekYsVUFBSSxDQUFDLEtBQUssWUFBWTtBQUNyQixlQUFPO0FBQUEsTUFDUjtBQUNBLGFBQU8sSUFBSTtBQUFBLFFBQ1YsU0FBUztBQUFBLFFBQ1QsS0FBSztBQUFBLFFBQ0w7QUFBQSxVQUNDLElBQUksSUFBSSxvQkFBb0IsTUFBTTtBQUFBLFVBQ2xDLFVBQVU7QUFBQSxRQUNYO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxJQUNBLE1BQWUsbUNBQW1DLEtBQVUsU0FBMEIsT0FBMkQ7QUFDaEosWUFBTSxPQUFPLE1BQU0sS0FBSyx5QkFBeUIsU0FBUyxRQUFRO0FBQ2xFLFlBQU0sYUFBYSxLQUFLO0FBQ3hCLFlBQU0sa0JBQWtCLHFCQUFxQixTQUFpQixnQkFBZ0IscUJBQXFCLEtBQUs7QUFDeEcsWUFBTSxPQUFxQixTQUFTLGVBQWUsRUFBRSxTQUFrQixpQkFBa0Msa0JBQWtCLFdBQVcsUUFBUSxDQUFDO0FBQy9JLFlBQU0sUUFBUSxNQUFNLFdBQVcsZUFBZSxJQUFJO0FBRWxELGFBQU8sZUFBZSxLQUFLO0FBQUEsSUFDNUI7QUFBQSxFQUNEO0FBQ0Q7IiwKICAibmFtZXMiOiBbIm5vdGVib29rIl0KfQo=
