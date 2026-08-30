import assert from "assert";
import { AsyncIterableProducer, DeferredPromise } from "../../../../../base/common/async.js";
import { Event } from "../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { PLAINTEXT_LANGUAGE_ID } from "../../../../../editor/common/languages/modesRegistry.js";
import { IMenuService } from "../../../../../platform/actions/common/actions.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { insertCellAtIndex } from "../../browser/controller/cellOperations.js";
import { NotebookExecutionService } from "../../browser/services/notebookExecutionServiceImpl.js";
import { NotebookExecutionStateService } from "../../browser/services/notebookExecutionStateServiceImpl.js";
import { NotebookKernelService } from "../../browser/services/notebookKernelServiceImpl.js";
import { CellEditType, CellKind, CellUri, NotebookExecutionState } from "../../common/notebookCommon.js";
import { CellExecutionUpdateType, INotebookExecutionService } from "../../common/notebookExecutionService.js";
import { INotebookExecutionStateService, NotebookExecutionType } from "../../common/notebookExecutionStateService.js";
import { INotebookKernelService } from "../../common/notebookKernelService.js";
import { INotebookLoggingService } from "../../common/notebookLoggingService.js";
import { INotebookService } from "../../common/notebookService.js";
import { setupInstantiationService, withTestNotebook as _withTestNotebook } from "./testNotebookEditor.js";
suite("NotebookExecutionStateService", () => {
  let instantiationService;
  let kernelService;
  let disposables;
  let testNotebookModel;
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  setup(function() {
    disposables = new DisposableStore();
    instantiationService = setupInstantiationService(disposables);
    instantiationService.stub(INotebookService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidAddNotebookDocument = Event.None;
        this.onWillRemoveNotebookDocument = Event.None;
      }
      getNotebookTextModels() {
        return [];
      }
      getNotebookTextModel(uri) {
        return testNotebookModel;
      }
    }());
    instantiationService.stub(IMenuService, new class extends mock() {
      createMenu() {
        return new class extends mock() {
          constructor() {
            super(...arguments);
            this.onDidChange = Event.None;
          }
          getActions() {
            return [];
          }
          dispose() {
          }
        }();
      }
    }());
    instantiationService.stub(INotebookLoggingService, new class extends mock() {
      debug(category, output) {
      }
    }());
    kernelService = disposables.add(instantiationService.createInstance(NotebookKernelService));
    instantiationService.set(INotebookKernelService, kernelService);
    instantiationService.set(INotebookExecutionService, disposables.add(instantiationService.createInstance(NotebookExecutionService)));
    instantiationService.set(INotebookExecutionStateService, disposables.add(instantiationService.createInstance(NotebookExecutionStateService)));
  });
  async function withTestNotebook(cells, callback) {
    return _withTestNotebook(cells, (editor, viewModel) => callback(viewModel, viewModel.notebookDocument, disposables));
  }
  function testCancelOnDelete(expectedCancels, implementsInterrupt) {
    return withTestNotebook([], async (viewModel, _document, disposables2) => {
      testNotebookModel = viewModel.notebookDocument;
      let cancels = 0;
      const kernel = new class extends TestNotebookKernel {
        constructor() {
          super({ languages: ["javascript"] });
          this.implementsInterrupt = implementsInterrupt;
        }
        async executeNotebookCellsRequest() {
        }
        async cancelNotebookCellExecution(_uri, handles) {
          cancels += handles.length;
        }
      }();
      disposables2.add(kernelService.registerKernel(kernel));
      kernelService.selectKernelForNotebook(kernel, viewModel.notebookDocument);
      const executionStateService = instantiationService.get(INotebookExecutionStateService);
      const cell = disposables2.add(insertCellAtIndex(viewModel, 0, "var c = 3", "javascript", CellKind.Code, {}, [], true, true));
      const cell2 = disposables2.add(insertCellAtIndex(viewModel, 1, "var c = 3", "javascript", CellKind.Code, {}, [], true, true));
      const cell3 = disposables2.add(insertCellAtIndex(viewModel, 2, "var c = 3", "javascript", CellKind.Code, {}, [], true, true));
      insertCellAtIndex(viewModel, 3, "var c = 3", "javascript", CellKind.Code, {}, [], true, true);
      const exe = executionStateService.createCellExecution(viewModel.uri, cell.handle);
      exe.confirm();
      exe.update([{ editType: CellExecutionUpdateType.ExecutionState, executionOrder: 1 }]);
      const exe2 = executionStateService.createCellExecution(viewModel.uri, cell2.handle);
      exe2.confirm();
      executionStateService.createCellExecution(viewModel.uri, cell3.handle);
      assert.strictEqual(cancels, 0);
      viewModel.notebookDocument.applyEdits([{
        editType: CellEditType.Replace,
        index: 0,
        count: 3,
        cells: []
      }], true, void 0, () => void 0, void 0, false);
      assert.strictEqual(cancels, expectedCancels);
    });
  }
  test("cancel execution when cell is deleted", async function() {
    return testCancelOnDelete(3, false);
  });
  test("cancel execution when cell is deleted in interrupt-type kernel", async function() {
    return testCancelOnDelete(1, true);
  });
  test("fires onDidChangeCellExecution when cell is completed while deleted", async function() {
    return withTestNotebook([], async (viewModel, _document, disposables2) => {
      testNotebookModel = viewModel.notebookDocument;
      const kernel = new TestNotebookKernel();
      disposables2.add(kernelService.registerKernel(kernel));
      kernelService.selectKernelForNotebook(kernel, viewModel.notebookDocument);
      const executionStateService = instantiationService.get(INotebookExecutionStateService);
      const cell = insertCellAtIndex(viewModel, 0, "var c = 3", "javascript", CellKind.Code, {}, [], true, true);
      const exe = executionStateService.createCellExecution(viewModel.uri, cell.handle);
      let didFire = false;
      disposables2.add(executionStateService.onDidChangeExecution((e) => {
        if (e.type === NotebookExecutionType.cell) {
          didFire = !e.changed;
        }
      }));
      viewModel.notebookDocument.applyEdits([{
        editType: CellEditType.Replace,
        index: 0,
        count: 1,
        cells: []
      }], true, void 0, () => void 0, void 0, false);
      exe.complete({});
      assert.strictEqual(didFire, true);
    });
  });
  test("does not fire onDidChangeCellExecution for output updates", async function() {
    return withTestNotebook([], async (viewModel, _document, disposables2) => {
      testNotebookModel = viewModel.notebookDocument;
      const kernel = new TestNotebookKernel();
      disposables2.add(kernelService.registerKernel(kernel));
      kernelService.selectKernelForNotebook(kernel, viewModel.notebookDocument);
      const executionStateService = instantiationService.get(INotebookExecutionStateService);
      const cell = disposables2.add(insertCellAtIndex(viewModel, 0, "var c = 3", "javascript", CellKind.Code, {}, [], true, true));
      const exe = executionStateService.createCellExecution(viewModel.uri, cell.handle);
      let didFire = false;
      disposables2.add(executionStateService.onDidChangeExecution((e) => {
        if (e.type === NotebookExecutionType.cell) {
          didFire = true;
        }
      }));
      exe.update([{ editType: CellExecutionUpdateType.OutputItems, items: [], outputId: "1" }]);
      assert.strictEqual(didFire, false);
      exe.update([{ editType: CellExecutionUpdateType.ExecutionState, executionOrder: 123 }]);
      assert.strictEqual(didFire, true);
      exe.complete({});
    });
  });
  test("getCellExecution and onDidChangeCellExecution", async function() {
    return withTestNotebook([], async (viewModel, _document, disposables2) => {
      testNotebookModel = viewModel.notebookDocument;
      const kernel = new TestNotebookKernel();
      disposables2.add(kernelService.registerKernel(kernel));
      kernelService.selectKernelForNotebook(kernel, viewModel.notebookDocument);
      const executionStateService = instantiationService.get(INotebookExecutionStateService);
      const cell = disposables2.add(insertCellAtIndex(viewModel, 0, "var c = 3", "javascript", CellKind.Code, {}, [], true, true));
      const deferred = new DeferredPromise();
      disposables2.add(executionStateService.onDidChangeExecution((e) => {
        if (e.type === NotebookExecutionType.cell) {
          const cellUri = CellUri.generate(e.notebook, e.cellHandle);
          const exe = executionStateService.getCellExecution(cellUri);
          assert.ok(exe);
          assert.strictEqual(e.notebook.toString(), exe.notebook.toString());
          assert.strictEqual(e.cellHandle, exe.cellHandle);
          assert.strictEqual(exe.notebook.toString(), e.changed?.notebook.toString());
          assert.strictEqual(exe.cellHandle, e.changed?.cellHandle);
          deferred.complete();
        }
      }));
      executionStateService.createCellExecution(viewModel.uri, cell.handle);
      return deferred.p;
    });
  });
  test("getExecution and onDidChangeExecution", async function() {
    return withTestNotebook([], async (viewModel, _document, disposables2) => {
      testNotebookModel = viewModel.notebookDocument;
      const kernel = new TestNotebookKernel();
      disposables2.add(kernelService.registerKernel(kernel));
      kernelService.selectKernelForNotebook(kernel, viewModel.notebookDocument);
      const eventRaisedWithExecution = [];
      const executionStateService = instantiationService.get(INotebookExecutionStateService);
      executionStateService.onDidChangeExecution((e) => eventRaisedWithExecution.push(e.type === NotebookExecutionType.notebook && !!e.changed), this, disposables2);
      const deferred = new DeferredPromise();
      disposables2.add(executionStateService.onDidChangeExecution((e) => {
        if (e.type === NotebookExecutionType.notebook) {
          const exe = executionStateService.getExecution(viewModel.uri);
          assert.ok(exe);
          assert.strictEqual(e.notebook.toString(), exe.notebook.toString());
          assert.ok(e.affectsNotebook(viewModel.uri));
          assert.deepStrictEqual(eventRaisedWithExecution, [true]);
          deferred.complete();
        }
      }));
      executionStateService.createExecution(viewModel.uri);
      return deferred.p;
    });
  });
  test("getExecution and onDidChangeExecution 2", async function() {
    return withTestNotebook([], async (viewModel, _document, disposables2) => {
      testNotebookModel = viewModel.notebookDocument;
      const kernel = new TestNotebookKernel();
      disposables2.add(kernelService.registerKernel(kernel));
      kernelService.selectKernelForNotebook(kernel, viewModel.notebookDocument);
      const executionStateService = instantiationService.get(INotebookExecutionStateService);
      const deferred = new DeferredPromise();
      const expectedNotebookEventStates = [NotebookExecutionState.Unconfirmed, NotebookExecutionState.Pending, NotebookExecutionState.Executing, void 0];
      executionStateService.onDidChangeExecution((e) => {
        if (e.type === NotebookExecutionType.notebook) {
          const expectedState = expectedNotebookEventStates.shift();
          if (typeof expectedState === "number") {
            const exe = executionStateService.getExecution(viewModel.uri);
            assert.ok(exe);
            assert.strictEqual(e.notebook.toString(), exe.notebook.toString());
            assert.strictEqual(e.changed?.state, expectedState);
          } else {
            assert.ok(e.changed === void 0);
          }
          assert.ok(e.affectsNotebook(viewModel.uri));
          if (expectedNotebookEventStates.length === 0) {
            deferred.complete();
          }
        }
      }, this, disposables2);
      const execution = executionStateService.createExecution(viewModel.uri);
      execution.confirm();
      execution.begin();
      execution.complete();
      return deferred.p;
    });
  });
  test("force-cancel works for Cell Execution", async function() {
    return withTestNotebook([], async (viewModel, _document, disposables2) => {
      testNotebookModel = viewModel.notebookDocument;
      const kernel = new TestNotebookKernel();
      disposables2.add(kernelService.registerKernel(kernel));
      kernelService.selectKernelForNotebook(kernel, viewModel.notebookDocument);
      const executionStateService = instantiationService.get(INotebookExecutionStateService);
      const cell = disposables2.add(insertCellAtIndex(viewModel, 0, "var c = 3", "javascript", CellKind.Code, {}, [], true, true));
      executionStateService.createCellExecution(viewModel.uri, cell.handle);
      const exe = executionStateService.getCellExecution(cell.uri);
      assert.ok(exe);
      executionStateService.forceCancelNotebookExecutions(viewModel.uri);
      const exe2 = executionStateService.getCellExecution(cell.uri);
      assert.strictEqual(exe2, void 0);
    });
  });
  test("force-cancel works for Notebook Execution", async function() {
    return withTestNotebook([], async (viewModel, _document, disposables2) => {
      testNotebookModel = viewModel.notebookDocument;
      const kernel = new TestNotebookKernel();
      disposables2.add(kernelService.registerKernel(kernel));
      kernelService.selectKernelForNotebook(kernel, viewModel.notebookDocument);
      const eventRaisedWithExecution = [];
      const executionStateService = instantiationService.get(INotebookExecutionStateService);
      executionStateService.onDidChangeExecution((e) => eventRaisedWithExecution.push(e.type === NotebookExecutionType.notebook && !!e.changed), this, disposables2);
      executionStateService.createExecution(viewModel.uri);
      const exe = executionStateService.getExecution(viewModel.uri);
      assert.ok(exe);
      assert.deepStrictEqual(eventRaisedWithExecution, [true]);
      executionStateService.forceCancelNotebookExecutions(viewModel.uri);
      const exe2 = executionStateService.getExecution(viewModel.uri);
      assert.deepStrictEqual(eventRaisedWithExecution, [true, false]);
      assert.strictEqual(exe2, void 0);
    });
  });
  test("force-cancel works for Cell and Notebook Execution", async function() {
    return withTestNotebook([], async (viewModel, _document, disposables2) => {
      testNotebookModel = viewModel.notebookDocument;
      const kernel = new TestNotebookKernel();
      disposables2.add(kernelService.registerKernel(kernel));
      kernelService.selectKernelForNotebook(kernel, viewModel.notebookDocument);
      const executionStateService = instantiationService.get(INotebookExecutionStateService);
      executionStateService.createExecution(viewModel.uri);
      executionStateService.createExecution(viewModel.uri);
      const cellExe = executionStateService.getExecution(viewModel.uri);
      const exe = executionStateService.getExecution(viewModel.uri);
      assert.ok(cellExe);
      assert.ok(exe);
      executionStateService.forceCancelNotebookExecutions(viewModel.uri);
      const cellExe2 = executionStateService.getExecution(viewModel.uri);
      const exe2 = executionStateService.getExecution(viewModel.uri);
      assert.strictEqual(cellExe2, void 0);
      assert.strictEqual(exe2, void 0);
    });
  });
});
class TestNotebookKernel {
  constructor(opts) {
    this.id = "test";
    this.label = "";
    this.viewType = "*";
    this.onDidChange = Event.None;
    this.extension = new ExtensionIdentifier("test");
    this.localResourceRoot = URI.file("/test");
    this.preloadUris = [];
    this.preloadProvides = [];
    this.supportedLanguages = [];
    this.supportedLanguages = opts?.languages ?? [PLAINTEXT_LANGUAGE_ID];
    if (opts?.id) {
      this.id = opts?.id;
    }
  }
  async executeNotebookCellsRequest() {
  }
  async cancelNotebookCellExecution(uri, cellHandles) {
  }
  provideVariables(notebookUri, parentId, kind, start, token) {
    return AsyncIterableProducer.EMPTY;
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFx0ZXN0XFxicm93c2VyXFxub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQXN5bmNJdGVyYWJsZVByb2R1Y2VyLCBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFBMQUlOVEVYVF9MQU5HVUFHRV9JRCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL21vZGVzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSU1lbnUsIElNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgaW5zZXJ0Q2VsbEF0SW5kZXggfSBmcm9tICcuLi8uLi9icm93c2VyL2NvbnRyb2xsZXIvY2VsbE9wZXJhdGlvbnMuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFeGVjdXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXJ2aWNlcy9ub3RlYm9va0V4ZWN1dGlvblNlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IE5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXJ2aWNlcy9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZUltcGwuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tLZXJuZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXJ2aWNlcy9ub3RlYm9va0tlcm5lbFNlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IE5vdGVib29rVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci92aWV3TW9kZWwvbm90ZWJvb2tWaWV3TW9kZWxJbXBsLmpzJztcbmltcG9ydCB7IE5vdGVib29rVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL25vdGVib29rVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IENlbGxFZGl0VHlwZSwgQ2VsbEtpbmQsIENlbGxVcmksIElPdXRwdXREdG8sIE5vdGVib29rQ2VsbE1ldGFkYXRhLCBOb3RlYm9va0V4ZWN1dGlvblN0YXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IENlbGxFeGVjdXRpb25VcGRhdGVUeXBlLCBJTm90ZWJvb2tFeGVjdXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rRXhlY3V0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UsIE5vdGVib29rRXhlY3V0aW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tLZXJuZWwsIElOb3RlYm9va0tlcm5lbFNlcnZpY2UsIFZhcmlhYmxlc1Jlc3VsdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va0tlcm5lbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rTG9nZ2luZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tMb2dnaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rU2VydmljZS5qcyc7XG5pbXBvcnQgeyBzZXR1cEluc3RhbnRpYXRpb25TZXJ2aWNlLCB3aXRoVGVzdE5vdGVib29rIGFzIF93aXRoVGVzdE5vdGVib29rIH0gZnJvbSAnLi90ZXN0Tm90ZWJvb2tFZGl0b3IuanMnO1xuXG5zdWl0ZSgnTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UnLCAoKSA9PiB7XG5cblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBrZXJuZWxTZXJ2aWNlOiBJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlO1xuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IHRlc3ROb3RlYm9va01vZGVsOiBOb3RlYm9va1RleHRNb2RlbCB8IHVuZGVmaW5lZDtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzZXR1cChmdW5jdGlvbiAoKSB7XG5cblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc2V0dXBJbnN0YW50aWF0aW9uU2VydmljZShkaXNwb3NhYmxlcyk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RlYm9va1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU5vdGVib29rU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBvbkRpZEFkZE5vdGVib29rRG9jdW1lbnQgPSBFdmVudC5Ob25lO1xuXHRcdFx0b3ZlcnJpZGUgb25XaWxsUmVtb3ZlTm90ZWJvb2tEb2N1bWVudCA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRvdmVycmlkZSBnZXROb3RlYm9va1RleHRNb2RlbHMoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0b3ZlcnJpZGUgZ2V0Tm90ZWJvb2tUZXh0TW9kZWwodXJpOiBVUkkpOiBOb3RlYm9va1RleHRNb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdHJldHVybiB0ZXN0Tm90ZWJvb2tNb2RlbDtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU1lbnVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNZW51U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBjcmVhdGVNZW51KCkge1xuXHRcdFx0XHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTWVudT4oKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgb25EaWRDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRcdG92ZXJyaWRlIGdldEFjdGlvbnMoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0XHRcdG92ZXJyaWRlIGRpc3Bvc2UoKSB7IH1cblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RlYm9va0xvZ2dpbmdTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va0xvZ2dpbmdTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGRlYnVnKGNhdGVnb3J5OiBzdHJpbmcsIG91dHB1dDogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHRcdC8vXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRrZXJuZWxTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rS2VybmVsU2VydmljZSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJTm90ZWJvb2tLZXJuZWxTZXJ2aWNlLCBrZXJuZWxTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSU5vdGVib29rRXhlY3V0aW9uU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rRXhlY3V0aW9uU2VydmljZSkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UpKSk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHdpdGhUZXN0Tm90ZWJvb2soY2VsbHM6IFtzdHJpbmcsIHN0cmluZywgQ2VsbEtpbmQsIElPdXRwdXREdG9bXSwgTm90ZWJvb2tDZWxsTWV0YWRhdGFdW10sIGNhbGxiYWNrOiAodmlld01vZGVsOiBOb3RlYm9va1ZpZXdNb2RlbCwgdGV4dE1vZGVsOiBOb3RlYm9va1RleHRNb2RlbCwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSkgPT4gdm9pZCB8IFByb21pc2U8dm9pZD4pIHtcblx0XHRyZXR1cm4gX3dpdGhUZXN0Tm90ZWJvb2soY2VsbHMsIChlZGl0b3IsIHZpZXdNb2RlbCkgPT4gY2FsbGJhY2sodmlld01vZGVsLCB2aWV3TW9kZWwubm90ZWJvb2tEb2N1bWVudCwgZGlzcG9zYWJsZXMpKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHRlc3RDYW5jZWxPbkRlbGV0ZShleHBlY3RlZENhbmNlbHM6IG51bWJlciwgaW1wbGVtZW50c0ludGVycnVwdDogYm9vbGVhbikge1xuXHRcdHJldHVybiB3aXRoVGVzdE5vdGVib29rKFtdLCBhc3luYyAodmlld01vZGVsLCBfZG9jdW1lbnQsIGRpc3Bvc2FibGVzKSA9PiB7XG5cdFx0XHR0ZXN0Tm90ZWJvb2tNb2RlbCA9IHZpZXdNb2RlbC5ub3RlYm9va0RvY3VtZW50O1xuXG5cdFx0XHRsZXQgY2FuY2VscyA9IDA7XG5cdFx0XHRjb25zdCBrZXJuZWwgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0Tm90ZWJvb2tLZXJuZWwge1xuXHRcdFx0XHRpbXBsZW1lbnRzSW50ZXJydXB0ID0gaW1wbGVtZW50c0ludGVycnVwdDtcblxuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0XHRzdXBlcih7IGxhbmd1YWdlczogWydqYXZhc2NyaXB0J10gfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBleGVjdXRlTm90ZWJvb2tDZWxsc1JlcXVlc3QoKTogUHJvbWlzZTx2b2lkPiB7IH1cblxuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBjYW5jZWxOb3RlYm9va0NlbGxFeGVjdXRpb24oX3VyaTogVVJJLCBoYW5kbGVzOiBudW1iZXJbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdGNhbmNlbHMgKz0gaGFuZGxlcy5sZW5ndGg7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoa2VybmVsU2VydmljZS5yZWdpc3Rlcktlcm5lbChrZXJuZWwpKTtcblx0XHRcdGtlcm5lbFNlcnZpY2Uuc2VsZWN0S2VybmVsRm9yTm90ZWJvb2soa2VybmVsLCB2aWV3TW9kZWwubm90ZWJvb2tEb2N1bWVudCk7XG5cblx0XHRcdGNvbnN0IGV4ZWN1dGlvblN0YXRlU2VydmljZTogSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSk7XG5cblx0XHRcdC8vIFNob3VsZCBjYW5jZWwgZXhlY3V0aW5nIGFuZCBwZW5kaW5nIGNlbGxzLCB3aGVuIGtlcm5lbCBkb2VzIG5vdCBpbXBsZW1lbnQgaW50ZXJydXB0XG5cdFx0XHRjb25zdCBjZWxsID0gZGlzcG9zYWJsZXMuYWRkKGluc2VydENlbGxBdEluZGV4KHZpZXdNb2RlbCwgMCwgJ3ZhciBjID0gMycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwge30sIFtdLCB0cnVlLCB0cnVlKSk7XG5cdFx0XHRjb25zdCBjZWxsMiA9IGRpc3Bvc2FibGVzLmFkZChpbnNlcnRDZWxsQXRJbmRleCh2aWV3TW9kZWwsIDEsICd2YXIgYyA9IDMnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIHt9LCBbXSwgdHJ1ZSwgdHJ1ZSkpO1xuXHRcdFx0Y29uc3QgY2VsbDMgPSBkaXNwb3NhYmxlcy5hZGQoaW5zZXJ0Q2VsbEF0SW5kZXgodmlld01vZGVsLCAyLCAndmFyIGMgPSAzJywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCB7fSwgW10sIHRydWUsIHRydWUpKTtcblx0XHRcdGluc2VydENlbGxBdEluZGV4KHZpZXdNb2RlbCwgMywgJ3ZhciBjID0gMycsICdqYXZhc2NyaXB0JywgQ2VsbEtpbmQuQ29kZSwge30sIFtdLCB0cnVlLCB0cnVlKTsgLy8gTm90IGRlbGV0ZWRcblx0XHRcdGNvbnN0IGV4ZSA9IGV4ZWN1dGlvblN0YXRlU2VydmljZS5jcmVhdGVDZWxsRXhlY3V0aW9uKHZpZXdNb2RlbC51cmksIGNlbGwuaGFuZGxlKTsgLy8gRXhlY3V0aW5nXG5cdFx0XHRleGUuY29uZmlybSgpO1xuXHRcdFx0ZXhlLnVwZGF0ZShbeyBlZGl0VHlwZTogQ2VsbEV4ZWN1dGlvblVwZGF0ZVR5cGUuRXhlY3V0aW9uU3RhdGUsIGV4ZWN1dGlvbk9yZGVyOiAxIH1dKTtcblx0XHRcdGNvbnN0IGV4ZTIgPSBleGVjdXRpb25TdGF0ZVNlcnZpY2UuY3JlYXRlQ2VsbEV4ZWN1dGlvbih2aWV3TW9kZWwudXJpLCBjZWxsMi5oYW5kbGUpOyAvLyBQZW5kaW5nXG5cdFx0XHRleGUyLmNvbmZpcm0oKTtcblx0XHRcdGV4ZWN1dGlvblN0YXRlU2VydmljZS5jcmVhdGVDZWxsRXhlY3V0aW9uKHZpZXdNb2RlbC51cmksIGNlbGwzLmhhbmRsZSk7IC8vIFVuY29uZmlybWVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FuY2VscywgMCk7XG5cdFx0XHR2aWV3TW9kZWwubm90ZWJvb2tEb2N1bWVudC5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDAsIGNvdW50OiAzLCBjZWxsczogW11cblx0XHRcdH1dLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FuY2VscywgZXhwZWN0ZWRDYW5jZWxzKTtcblx0XHR9KTtcblxuXHR9XG5cblx0Ly8gVE9ET0Byb2Jsb3UgQ291bGQgYmUgYSB0ZXN0IGp1c3QgZm9yIE5vdGVib29rRXhlY3V0aW9uTGlzdGVuZXJzLCB3aGljaCBjYW4gYmUgYSBzdGFuZGFsb25lIGNvbnRyaWJ1dGlvblxuXHR0ZXN0KCdjYW5jZWwgZXhlY3V0aW9uIHdoZW4gY2VsbCBpcyBkZWxldGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiB0ZXN0Q2FuY2VsT25EZWxldGUoMywgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWwgZXhlY3V0aW9uIHdoZW4gY2VsbCBpcyBkZWxldGVkIGluIGludGVycnVwdC10eXBlIGtlcm5lbCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gdGVzdENhbmNlbE9uRGVsZXRlKDEsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJlcyBvbkRpZENoYW5nZUNlbGxFeGVjdXRpb24gd2hlbiBjZWxsIGlzIGNvbXBsZXRlZCB3aGlsZSBkZWxldGVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiB3aXRoVGVzdE5vdGVib29rKFtdLCBhc3luYyAodmlld01vZGVsLCBfZG9jdW1lbnQsIGRpc3Bvc2FibGVzKSA9PiB7XG5cdFx0XHR0ZXN0Tm90ZWJvb2tNb2RlbCA9IHZpZXdNb2RlbC5ub3RlYm9va0RvY3VtZW50O1xuXG5cdFx0XHRjb25zdCBrZXJuZWwgPSBuZXcgVGVzdE5vdGVib29rS2VybmVsKCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoa2VybmVsU2VydmljZS5yZWdpc3Rlcktlcm5lbChrZXJuZWwpKTtcblx0XHRcdGtlcm5lbFNlcnZpY2Uuc2VsZWN0S2VybmVsRm9yTm90ZWJvb2soa2VybmVsLCB2aWV3TW9kZWwubm90ZWJvb2tEb2N1bWVudCk7XG5cblx0XHRcdGNvbnN0IGV4ZWN1dGlvblN0YXRlU2VydmljZTogSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSk7XG5cdFx0XHRjb25zdCBjZWxsID0gaW5zZXJ0Q2VsbEF0SW5kZXgodmlld01vZGVsLCAwLCAndmFyIGMgPSAzJywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCB7fSwgW10sIHRydWUsIHRydWUpO1xuXHRcdFx0Y29uc3QgZXhlID0gZXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmNyZWF0ZUNlbGxFeGVjdXRpb24odmlld01vZGVsLnVyaSwgY2VsbC5oYW5kbGUpO1xuXG5cdFx0XHRsZXQgZGlkRmlyZSA9IGZhbHNlO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGV4ZWN1dGlvblN0YXRlU2VydmljZS5vbkRpZENoYW5nZUV4ZWN1dGlvbihlID0+IHtcblx0XHRcdFx0aWYgKGUudHlwZSA9PT0gTm90ZWJvb2tFeGVjdXRpb25UeXBlLmNlbGwpIHtcblx0XHRcdFx0XHRkaWRGaXJlID0gIWUuY2hhbmdlZDtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHR2aWV3TW9kZWwubm90ZWJvb2tEb2N1bWVudC5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDAsIGNvdW50OiAxLCBjZWxsczogW11cblx0XHRcdH1dLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0XHRleGUuY29tcGxldGUoe30pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZEZpcmUsIHRydWUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBmaXJlIG9uRGlkQ2hhbmdlQ2VsbEV4ZWN1dGlvbiBmb3Igb3V0cHV0IHVwZGF0ZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHdpdGhUZXN0Tm90ZWJvb2soW10sIGFzeW5jICh2aWV3TW9kZWwsIF9kb2N1bWVudCwgZGlzcG9zYWJsZXMpID0+IHtcblx0XHRcdHRlc3ROb3RlYm9va01vZGVsID0gdmlld01vZGVsLm5vdGVib29rRG9jdW1lbnQ7XG5cblx0XHRcdGNvbnN0IGtlcm5lbCA9IG5ldyBUZXN0Tm90ZWJvb2tLZXJuZWwoKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChrZXJuZWxTZXJ2aWNlLnJlZ2lzdGVyS2VybmVsKGtlcm5lbCkpO1xuXHRcdFx0a2VybmVsU2VydmljZS5zZWxlY3RLZXJuZWxGb3JOb3RlYm9vayhrZXJuZWwsIHZpZXdNb2RlbC5ub3RlYm9va0RvY3VtZW50KTtcblxuXHRcdFx0Y29uc3QgZXhlY3V0aW9uU3RhdGVTZXJ2aWNlOiBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGNlbGwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zZXJ0Q2VsbEF0SW5kZXgodmlld01vZGVsLCAwLCAndmFyIGMgPSAzJywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCB7fSwgW10sIHRydWUsIHRydWUpKTtcblx0XHRcdGNvbnN0IGV4ZSA9IGV4ZWN1dGlvblN0YXRlU2VydmljZS5jcmVhdGVDZWxsRXhlY3V0aW9uKHZpZXdNb2RlbC51cmksIGNlbGwuaGFuZGxlKTtcblxuXHRcdFx0bGV0IGRpZEZpcmUgPSBmYWxzZTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChleGVjdXRpb25TdGF0ZVNlcnZpY2Uub25EaWRDaGFuZ2VFeGVjdXRpb24oZSA9PiB7XG5cdFx0XHRcdGlmIChlLnR5cGUgPT09IE5vdGVib29rRXhlY3V0aW9uVHlwZS5jZWxsKSB7XG5cdFx0XHRcdFx0ZGlkRmlyZSA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0ZXhlLnVwZGF0ZShbeyBlZGl0VHlwZTogQ2VsbEV4ZWN1dGlvblVwZGF0ZVR5cGUuT3V0cHV0SXRlbXMsIGl0ZW1zOiBbXSwgb3V0cHV0SWQ6ICcxJyB9XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlkRmlyZSwgZmFsc2UpO1xuXHRcdFx0ZXhlLnVwZGF0ZShbeyBlZGl0VHlwZTogQ2VsbEV4ZWN1dGlvblVwZGF0ZVR5cGUuRXhlY3V0aW9uU3RhdGUsIGV4ZWN1dGlvbk9yZGVyOiAxMjMgfV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZEZpcmUsIHRydWUpO1xuXHRcdFx0ZXhlLmNvbXBsZXRlKHt9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gIzE0MjQ2NlxuXHR0ZXN0KCdnZXRDZWxsRXhlY3V0aW9uIGFuZCBvbkRpZENoYW5nZUNlbGxFeGVjdXRpb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHdpdGhUZXN0Tm90ZWJvb2soW10sIGFzeW5jICh2aWV3TW9kZWwsIF9kb2N1bWVudCwgZGlzcG9zYWJsZXMpID0+IHtcblx0XHRcdHRlc3ROb3RlYm9va01vZGVsID0gdmlld01vZGVsLm5vdGVib29rRG9jdW1lbnQ7XG5cblx0XHRcdGNvbnN0IGtlcm5lbCA9IG5ldyBUZXN0Tm90ZWJvb2tLZXJuZWwoKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChrZXJuZWxTZXJ2aWNlLnJlZ2lzdGVyS2VybmVsKGtlcm5lbCkpO1xuXHRcdFx0a2VybmVsU2VydmljZS5zZWxlY3RLZXJuZWxGb3JOb3RlYm9vayhrZXJuZWwsIHZpZXdNb2RlbC5ub3RlYm9va0RvY3VtZW50KTtcblxuXHRcdFx0Y29uc3QgZXhlY3V0aW9uU3RhdGVTZXJ2aWNlOiBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGNlbGwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zZXJ0Q2VsbEF0SW5kZXgodmlld01vZGVsLCAwLCAndmFyIGMgPSAzJywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCB7fSwgW10sIHRydWUsIHRydWUpKTtcblxuXHRcdFx0Y29uc3QgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoZXhlY3V0aW9uU3RhdGVTZXJ2aWNlLm9uRGlkQ2hhbmdlRXhlY3V0aW9uKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS50eXBlID09PSBOb3RlYm9va0V4ZWN1dGlvblR5cGUuY2VsbCkge1xuXHRcdFx0XHRcdGNvbnN0IGNlbGxVcmkgPSBDZWxsVXJpLmdlbmVyYXRlKGUubm90ZWJvb2ssIGUuY2VsbEhhbmRsZSk7XG5cdFx0XHRcdFx0Y29uc3QgZXhlID0gZXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmdldENlbGxFeGVjdXRpb24oY2VsbFVyaSk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGV4ZSk7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGUubm90ZWJvb2sudG9TdHJpbmcoKSwgZXhlLm5vdGVib29rLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlLmNlbGxIYW5kbGUsIGV4ZS5jZWxsSGFuZGxlKTtcblxuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleGUubm90ZWJvb2sudG9TdHJpbmcoKSwgZS5jaGFuZ2VkPy5ub3RlYm9vay50b1N0cmluZygpKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhlLmNlbGxIYW5kbGUsIGUuY2hhbmdlZD8uY2VsbEhhbmRsZSk7XG5cblx0XHRcdFx0XHRkZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGV4ZWN1dGlvblN0YXRlU2VydmljZS5jcmVhdGVDZWxsRXhlY3V0aW9uKHZpZXdNb2RlbC51cmksIGNlbGwuaGFuZGxlKTtcblxuXHRcdFx0cmV0dXJuIGRlZmVycmVkLnA7XG5cdFx0fSk7XG5cdH0pO1xuXHR0ZXN0KCdnZXRFeGVjdXRpb24gYW5kIG9uRGlkQ2hhbmdlRXhlY3V0aW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiB3aXRoVGVzdE5vdGVib29rKFtdLCBhc3luYyAodmlld01vZGVsLCBfZG9jdW1lbnQsIGRpc3Bvc2FibGVzKSA9PiB7XG5cdFx0XHR0ZXN0Tm90ZWJvb2tNb2RlbCA9IHZpZXdNb2RlbC5ub3RlYm9va0RvY3VtZW50O1xuXG5cdFx0XHRjb25zdCBrZXJuZWwgPSBuZXcgVGVzdE5vdGVib29rS2VybmVsKCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoa2VybmVsU2VydmljZS5yZWdpc3Rlcktlcm5lbChrZXJuZWwpKTtcblx0XHRcdGtlcm5lbFNlcnZpY2Uuc2VsZWN0S2VybmVsRm9yTm90ZWJvb2soa2VybmVsLCB2aWV3TW9kZWwubm90ZWJvb2tEb2N1bWVudCk7XG5cblx0XHRcdGNvbnN0IGV2ZW50UmFpc2VkV2l0aEV4ZWN1dGlvbjogYm9vbGVhbltdID0gW107XG5cdFx0XHRjb25zdCBleGVjdXRpb25TdGF0ZVNlcnZpY2U6IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UpO1xuXHRcdFx0ZXhlY3V0aW9uU3RhdGVTZXJ2aWNlLm9uRGlkQ2hhbmdlRXhlY3V0aW9uKGUgPT4gZXZlbnRSYWlzZWRXaXRoRXhlY3V0aW9uLnB1c2goZS50eXBlID09PSBOb3RlYm9va0V4ZWN1dGlvblR5cGUubm90ZWJvb2sgJiYgISFlLmNoYW5nZWQpLCB0aGlzLCBkaXNwb3NhYmxlcyk7XG5cblx0XHRcdGNvbnN0IGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGV4ZWN1dGlvblN0YXRlU2VydmljZS5vbkRpZENoYW5nZUV4ZWN1dGlvbihlID0+IHtcblx0XHRcdFx0aWYgKGUudHlwZSA9PT0gTm90ZWJvb2tFeGVjdXRpb25UeXBlLm5vdGVib29rKSB7XG5cdFx0XHRcdFx0Y29uc3QgZXhlID0gZXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmdldEV4ZWN1dGlvbih2aWV3TW9kZWwudXJpKTtcblx0XHRcdFx0XHRhc3NlcnQub2soZXhlKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5ub3RlYm9vay50b1N0cmluZygpLCBleGUubm90ZWJvb2sudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGUuYWZmZWN0c05vdGVib29rKHZpZXdNb2RlbC51cmkpKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50UmFpc2VkV2l0aEV4ZWN1dGlvbiwgW3RydWVdKTtcblx0XHRcdFx0XHRkZWZlcnJlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGV4ZWN1dGlvblN0YXRlU2VydmljZS5jcmVhdGVFeGVjdXRpb24odmlld01vZGVsLnVyaSk7XG5cblx0XHRcdHJldHVybiBkZWZlcnJlZC5wO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRFeGVjdXRpb24gYW5kIG9uRGlkQ2hhbmdlRXhlY3V0aW9uIDInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHdpdGhUZXN0Tm90ZWJvb2soW10sIGFzeW5jICh2aWV3TW9kZWwsIF9kb2N1bWVudCwgZGlzcG9zYWJsZXMpID0+IHtcblx0XHRcdHRlc3ROb3RlYm9va01vZGVsID0gdmlld01vZGVsLm5vdGVib29rRG9jdW1lbnQ7XG5cblx0XHRcdGNvbnN0IGtlcm5lbCA9IG5ldyBUZXN0Tm90ZWJvb2tLZXJuZWwoKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChrZXJuZWxTZXJ2aWNlLnJlZ2lzdGVyS2VybmVsKGtlcm5lbCkpO1xuXHRcdFx0a2VybmVsU2VydmljZS5zZWxlY3RLZXJuZWxGb3JOb3RlYm9vayhrZXJuZWwsIHZpZXdNb2RlbC5ub3RlYm9va0RvY3VtZW50KTtcblxuXHRcdFx0Y29uc3QgZXhlY3V0aW9uU3RhdGVTZXJ2aWNlOiBJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3QgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRjb25zdCBleHBlY3RlZE5vdGVib29rRXZlbnRTdGF0ZXM6IChOb3RlYm9va0V4ZWN1dGlvblN0YXRlIHwgdW5kZWZpbmVkKVtdID0gW05vdGVib29rRXhlY3V0aW9uU3RhdGUuVW5jb25maXJtZWQsIE5vdGVib29rRXhlY3V0aW9uU3RhdGUuUGVuZGluZywgTm90ZWJvb2tFeGVjdXRpb25TdGF0ZS5FeGVjdXRpbmcsIHVuZGVmaW5lZF07XG5cdFx0XHRleGVjdXRpb25TdGF0ZVNlcnZpY2Uub25EaWRDaGFuZ2VFeGVjdXRpb24oZSA9PiB7XG5cdFx0XHRcdGlmIChlLnR5cGUgPT09IE5vdGVib29rRXhlY3V0aW9uVHlwZS5ub3RlYm9vaykge1xuXHRcdFx0XHRcdGNvbnN0IGV4cGVjdGVkU3RhdGUgPSBleHBlY3RlZE5vdGVib29rRXZlbnRTdGF0ZXMuc2hpZnQoKTtcblx0XHRcdFx0XHRpZiAodHlwZW9mIGV4cGVjdGVkU3RhdGUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBleGUgPSBleGVjdXRpb25TdGF0ZVNlcnZpY2UuZ2V0RXhlY3V0aW9uKHZpZXdNb2RlbC51cmkpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0Lm9rKGV4ZSk7XG5cdFx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5ub3RlYm9vay50b1N0cmluZygpLCBleGUubm90ZWJvb2sudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZS5jaGFuZ2VkPy5zdGF0ZSwgZXhwZWN0ZWRTdGF0ZSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGFzc2VydC5vayhlLmNoYW5nZWQgPT09IHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGUuYWZmZWN0c05vdGVib29rKHZpZXdNb2RlbC51cmkpKTtcblx0XHRcdFx0XHRpZiAoZXhwZWN0ZWROb3RlYm9va0V2ZW50U3RhdGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0ZGVmZXJyZWQuY29tcGxldGUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sIHRoaXMsIGRpc3Bvc2FibGVzKTtcblxuXHRcdFx0Y29uc3QgZXhlY3V0aW9uID0gZXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmNyZWF0ZUV4ZWN1dGlvbih2aWV3TW9kZWwudXJpKTtcblx0XHRcdGV4ZWN1dGlvbi5jb25maXJtKCk7XG5cdFx0XHRleGVjdXRpb24uYmVnaW4oKTtcblx0XHRcdGV4ZWN1dGlvbi5jb21wbGV0ZSgpO1xuXG5cdFx0XHRyZXR1cm4gZGVmZXJyZWQucDtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZm9yY2UtY2FuY2VsIHdvcmtzIGZvciBDZWxsIEV4ZWN1dGlvbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gd2l0aFRlc3ROb3RlYm9vayhbXSwgYXN5bmMgKHZpZXdNb2RlbCwgX2RvY3VtZW50LCBkaXNwb3NhYmxlcykgPT4ge1xuXHRcdFx0dGVzdE5vdGVib29rTW9kZWwgPSB2aWV3TW9kZWwubm90ZWJvb2tEb2N1bWVudDtcblxuXHRcdFx0Y29uc3Qga2VybmVsID0gbmV3IFRlc3ROb3RlYm9va0tlcm5lbCgpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGtlcm5lbFNlcnZpY2UucmVnaXN0ZXJLZXJuZWwoa2VybmVsKSk7XG5cdFx0XHRrZXJuZWxTZXJ2aWNlLnNlbGVjdEtlcm5lbEZvck5vdGVib29rKGtlcm5lbCwgdmlld01vZGVsLm5vdGVib29rRG9jdW1lbnQpO1xuXG5cdFx0XHRjb25zdCBleGVjdXRpb25TdGF0ZVNlcnZpY2U6IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UpO1xuXHRcdFx0Y29uc3QgY2VsbCA9IGRpc3Bvc2FibGVzLmFkZChpbnNlcnRDZWxsQXRJbmRleCh2aWV3TW9kZWwsIDAsICd2YXIgYyA9IDMnLCAnamF2YXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIHt9LCBbXSwgdHJ1ZSwgdHJ1ZSkpO1xuXHRcdFx0ZXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmNyZWF0ZUNlbGxFeGVjdXRpb24odmlld01vZGVsLnVyaSwgY2VsbC5oYW5kbGUpO1xuXHRcdFx0Y29uc3QgZXhlID0gZXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmdldENlbGxFeGVjdXRpb24oY2VsbC51cmkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGV4ZSk7XG5cblx0XHRcdGV4ZWN1dGlvblN0YXRlU2VydmljZS5mb3JjZUNhbmNlbE5vdGVib29rRXhlY3V0aW9ucyh2aWV3TW9kZWwudXJpKTtcblx0XHRcdGNvbnN0IGV4ZTIgPSBleGVjdXRpb25TdGF0ZVNlcnZpY2UuZ2V0Q2VsbEV4ZWN1dGlvbihjZWxsLnVyaSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhlMiwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cdHRlc3QoJ2ZvcmNlLWNhbmNlbCB3b3JrcyBmb3IgTm90ZWJvb2sgRXhlY3V0aW9uJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiB3aXRoVGVzdE5vdGVib29rKFtdLCBhc3luYyAodmlld01vZGVsLCBfZG9jdW1lbnQsIGRpc3Bvc2FibGVzKSA9PiB7XG5cdFx0XHR0ZXN0Tm90ZWJvb2tNb2RlbCA9IHZpZXdNb2RlbC5ub3RlYm9va0RvY3VtZW50O1xuXG5cdFx0XHRjb25zdCBrZXJuZWwgPSBuZXcgVGVzdE5vdGVib29rS2VybmVsKCk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoa2VybmVsU2VydmljZS5yZWdpc3Rlcktlcm5lbChrZXJuZWwpKTtcblx0XHRcdGtlcm5lbFNlcnZpY2Uuc2VsZWN0S2VybmVsRm9yTm90ZWJvb2soa2VybmVsLCB2aWV3TW9kZWwubm90ZWJvb2tEb2N1bWVudCk7XG5cdFx0XHRjb25zdCBldmVudFJhaXNlZFdpdGhFeGVjdXRpb246IGJvb2xlYW5bXSA9IFtdO1xuXG5cdFx0XHRjb25zdCBleGVjdXRpb25TdGF0ZVNlcnZpY2U6IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UpO1xuXHRcdFx0ZXhlY3V0aW9uU3RhdGVTZXJ2aWNlLm9uRGlkQ2hhbmdlRXhlY3V0aW9uKGUgPT4gZXZlbnRSYWlzZWRXaXRoRXhlY3V0aW9uLnB1c2goZS50eXBlID09PSBOb3RlYm9va0V4ZWN1dGlvblR5cGUubm90ZWJvb2sgJiYgISFlLmNoYW5nZWQpLCB0aGlzLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHRleGVjdXRpb25TdGF0ZVNlcnZpY2UuY3JlYXRlRXhlY3V0aW9uKHZpZXdNb2RlbC51cmkpO1xuXHRcdFx0Y29uc3QgZXhlID0gZXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmdldEV4ZWN1dGlvbih2aWV3TW9kZWwudXJpKTtcblx0XHRcdGFzc2VydC5vayhleGUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudFJhaXNlZFdpdGhFeGVjdXRpb24sIFt0cnVlXSk7XG5cblx0XHRcdGV4ZWN1dGlvblN0YXRlU2VydmljZS5mb3JjZUNhbmNlbE5vdGVib29rRXhlY3V0aW9ucyh2aWV3TW9kZWwudXJpKTtcblx0XHRcdGNvbnN0IGV4ZTIgPSBleGVjdXRpb25TdGF0ZVNlcnZpY2UuZ2V0RXhlY3V0aW9uKHZpZXdNb2RlbC51cmkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudFJhaXNlZFdpdGhFeGVjdXRpb24sIFt0cnVlLCBmYWxzZV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4ZTIsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXHR0ZXN0KCdmb3JjZS1jYW5jZWwgd29ya3MgZm9yIENlbGwgYW5kIE5vdGVib29rIEV4ZWN1dGlvbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gd2l0aFRlc3ROb3RlYm9vayhbXSwgYXN5bmMgKHZpZXdNb2RlbCwgX2RvY3VtZW50LCBkaXNwb3NhYmxlcykgPT4ge1xuXHRcdFx0dGVzdE5vdGVib29rTW9kZWwgPSB2aWV3TW9kZWwubm90ZWJvb2tEb2N1bWVudDtcblxuXHRcdFx0Y29uc3Qga2VybmVsID0gbmV3IFRlc3ROb3RlYm9va0tlcm5lbCgpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGtlcm5lbFNlcnZpY2UucmVnaXN0ZXJLZXJuZWwoa2VybmVsKSk7XG5cdFx0XHRrZXJuZWxTZXJ2aWNlLnNlbGVjdEtlcm5lbEZvck5vdGVib29rKGtlcm5lbCwgdmlld01vZGVsLm5vdGVib29rRG9jdW1lbnQpO1xuXG5cdFx0XHRjb25zdCBleGVjdXRpb25TdGF0ZVNlcnZpY2U6IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2UpO1xuXHRcdFx0ZXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmNyZWF0ZUV4ZWN1dGlvbih2aWV3TW9kZWwudXJpKTtcblx0XHRcdGV4ZWN1dGlvblN0YXRlU2VydmljZS5jcmVhdGVFeGVjdXRpb24odmlld01vZGVsLnVyaSk7XG5cdFx0XHRjb25zdCBjZWxsRXhlID0gZXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmdldEV4ZWN1dGlvbih2aWV3TW9kZWwudXJpKTtcblx0XHRcdGNvbnN0IGV4ZSA9IGV4ZWN1dGlvblN0YXRlU2VydmljZS5nZXRFeGVjdXRpb24odmlld01vZGVsLnVyaSk7XG5cdFx0XHRhc3NlcnQub2soY2VsbEV4ZSk7XG5cdFx0XHRhc3NlcnQub2soZXhlKTtcblxuXHRcdFx0ZXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmZvcmNlQ2FuY2VsTm90ZWJvb2tFeGVjdXRpb25zKHZpZXdNb2RlbC51cmkpO1xuXHRcdFx0Y29uc3QgY2VsbEV4ZTIgPSBleGVjdXRpb25TdGF0ZVNlcnZpY2UuZ2V0RXhlY3V0aW9uKHZpZXdNb2RlbC51cmkpO1xuXHRcdFx0Y29uc3QgZXhlMiA9IGV4ZWN1dGlvblN0YXRlU2VydmljZS5nZXRFeGVjdXRpb24odmlld01vZGVsLnVyaSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2VsbEV4ZTIsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhlMiwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuY2xhc3MgVGVzdE5vdGVib29rS2VybmVsIGltcGxlbWVudHMgSU5vdGVib29rS2VybmVsIHtcblx0aWQ6IHN0cmluZyA9ICd0ZXN0Jztcblx0bGFiZWw6IHN0cmluZyA9ICcnO1xuXHR2aWV3VHlwZSA9ICcqJztcblx0b25EaWRDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRleHRlbnNpb246IEV4dGVuc2lvbklkZW50aWZpZXIgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdCcpO1xuXHRsb2NhbFJlc291cmNlUm9vdDogVVJJID0gVVJJLmZpbGUoJy90ZXN0Jyk7XG5cdGRlc2NyaXB0aW9uPzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRkZXRhaWw/OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHByZWxvYWRVcmlzOiBVUklbXSA9IFtdO1xuXHRwcmVsb2FkUHJvdmlkZXM6IHN0cmluZ1tdID0gW107XG5cdHN1cHBvcnRlZExhbmd1YWdlczogc3RyaW5nW10gPSBbXTtcblx0YXN5bmMgZXhlY3V0ZU5vdGVib29rQ2VsbHNSZXF1ZXN0KCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGNhbmNlbE5vdGVib29rQ2VsbEV4ZWN1dGlvbih1cmk6IFVSSSwgY2VsbEhhbmRsZXM6IG51bWJlcltdKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0cHJvdmlkZVZhcmlhYmxlcyhub3RlYm9va1VyaTogVVJJLCBwYXJlbnRJZDogbnVtYmVyIHwgdW5kZWZpbmVkLCBraW5kOiAnbmFtZWQnIHwgJ2luZGV4ZWQnLCBzdGFydDogbnVtYmVyLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBBc3luY0l0ZXJhYmxlUHJvZHVjZXI8VmFyaWFibGVzUmVzdWx0PiB7XG5cdFx0cmV0dXJuIEFzeW5jSXRlcmFibGVQcm9kdWNlci5FTVBUWTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKG9wdHM/OiB7IGxhbmd1YWdlcz86IHN0cmluZ1tdOyBpZD86IHN0cmluZyB9KSB7XG5cdFx0dGhpcy5zdXBwb3J0ZWRMYW5ndWFnZXMgPSBvcHRzPy5sYW5ndWFnZXMgPz8gW1BMQUlOVEVYVF9MQU5HVUFHRV9JRF07XG5cdFx0aWYgKG9wdHM/LmlkKSB7XG5cdFx0XHR0aGlzLmlkID0gb3B0cz8uaWQ7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUIsdUJBQXVCO0FBRXZELFNBQVMsYUFBYTtBQUN0QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQWdCLG9CQUFvQjtBQUNwQyxTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLDZCQUE2QjtBQUd0QyxTQUFTLGNBQWMsVUFBVSxTQUEyQyw4QkFBOEI7QUFDMUcsU0FBUyx5QkFBeUIsaUNBQWlDO0FBQ25FLFNBQVMs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
