var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { Disposable, DisposableStore, dispose, toDisposable } from "../../../../../base/common/lifecycle.js";
import { WebWorkerDescriptor } from "../../../../../platform/webWorker/browser/webWorkerDescriptor.js";
import { IWebWorkerService } from "../../../../../platform/webWorker/browser/webWorkerService.js";
import { CellUri, NotebookCellsChangeType } from "../../common/notebookCommon.js";
import { INotebookService } from "../../common/notebookService.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { TextModel } from "../../../../../editor/common/model/textModel.js";
import { FileAccess, Schemas } from "../../../../../base/common/network.js";
import { isEqual } from "../../../../../base/common/resources.js";
let NotebookEditorWorkerServiceImpl = class extends Disposable {
  constructor(notebookService, modelService, webWorkerService) {
    super();
    this._workerManager = this._register(new WorkerManager(notebookService, modelService, webWorkerService));
  }
  canComputeDiff(original, modified) {
    throw new Error("Method not implemented.");
  }
  computeDiff(original, modified) {
    return this._workerManager.withWorker().then((client) => {
      return client.computeDiff(original, modified);
    });
  }
  canPromptRecommendation(model) {
    return this._workerManager.withWorker().then((client) => {
      return client.canPromptRecommendation(model);
    });
  }
};
NotebookEditorWorkerServiceImpl = __decorateClass([
  __decorateParam(0, INotebookService),
  __decorateParam(1, IModelService),
  __decorateParam(2, IWebWorkerService)
], NotebookEditorWorkerServiceImpl);
class WorkerManager extends Disposable {
  // private _lastWorkerUsedTime: number;
  constructor(_notebookService, _modelService, _webWorkerService) {
    super();
    this._notebookService = _notebookService;
    this._modelService = _modelService;
    this._webWorkerService = _webWorkerService;
    this._editorWorkerClient = null;
  }
  withWorker() {
    if (!this._editorWorkerClient) {
      this._editorWorkerClient = new NotebookWorkerClient(this._notebookService, this._modelService, this._webWorkerService);
      this._register(this._editorWorkerClient);
    }
    return Promise.resolve(this._editorWorkerClient);
  }
}
class NotebookEditorModelManager extends Disposable {
  constructor(_proxy, _notebookService, _modelService) {
    super();
    this._proxy = _proxy;
    this._notebookService = _notebookService;
    this._modelService = _modelService;
    this._syncedModels = /* @__PURE__ */ Object.create(null);
    this._syncedModelsLastUsedTime = /* @__PURE__ */ Object.create(null);
  }
  ensureSyncedResources(resources) {
    for (const resource of resources) {
      const resourceStr = resource.toString();
      if (!this._syncedModels[resourceStr]) {
        this._beginModelSync(resource);
      }
      if (this._syncedModels[resourceStr]) {
        this._syncedModelsLastUsedTime[resourceStr] = (/* @__PURE__ */ new Date()).getTime();
      }
    }
  }
  _beginModelSync(resource) {
    const model = this._notebookService.listNotebookDocuments().find((document) => document.uri.toString() === resource.toString());
    if (!model) {
      return;
    }
    const modelUrl = resource.toString();
    this._proxy.$acceptNewModel(
      model.uri.toString(),
      model.metadata,
      model.transientOptions.transientDocumentMetadata,
      model.cells.map((cell) => ({
        handle: cell.handle,
        url: cell.uri.toString(),
        source: cell.textBuffer.getLinesContent(),
        eol: cell.textBuffer.getEOL(),
        versionId: cell.textModel?.getVersionId() ?? 0,
        language: cell.language,
        mime: cell.mime,
        cellKind: cell.cellKind,
        outputs: cell.outputs.map((op) => ({ outputId: op.outputId, outputs: op.outputs })),
        metadata: cell.metadata,
        internalMetadata: cell.internalMetadata
      }))
    );
    const toDispose = new DisposableStore();
    const cellToDto = (cell) => {
      return {
        handle: cell.handle,
        url: cell.uri.toString(),
        source: cell.textBuffer.getLinesContent(),
        eol: cell.textBuffer.getEOL(),
        versionId: 0,
        language: cell.language,
        cellKind: cell.cellKind,
        outputs: cell.outputs.map((op) => ({ outputId: op.outputId, outputs: op.outputs })),
        metadata: cell.metadata,
        internalMetadata: cell.internalMetadata
      };
    };
    const cellHandlers = /* @__PURE__ */ new Set();
    const addCellContentChangeHandler = (cell) => {
      cellHandlers.add(cell);
      toDispose.add(cell.onDidChangeContent((e) => {
        if (typeof e === "object" && e.type === "model") {
          this._proxy.$acceptCellModelChanged(modelUrl, cell.handle, e.event);
        }
      }));
    };
    model.cells.forEach((cell) => addCellContentChangeHandler(cell));
    if (model.cells.length !== cellHandlers.size) {
      toDispose.add(this._modelService.onModelAdded((textModel) => {
        if (textModel.uri.scheme !== Schemas.vscodeNotebookCell || !(textModel instanceof TextModel)) {
          return;
        }
        const cellUri = CellUri.parse(textModel.uri);
        if (!cellUri || !isEqual(cellUri.notebook, model.uri)) {
          return;
        }
        const cell = model.cells.find((cell2) => cell2.handle === cellUri.handle);
        if (cell) {
          addCellContentChangeHandler(cell);
        }
      }));
    }
    toDispose.add(model.onDidChangeContent((event) => {
      const dto = [];
      event.rawEvents.forEach((e) => {
        switch (e.kind) {
          case NotebookCellsChangeType.ModelChange:
          case NotebookCellsChangeType.Initialize: {
            dto.push({
              kind: e.kind,
              changes: e.changes.map((diff) => [diff[0], diff[1], diff[2].map((cell) => cellToDto(cell))])
            });
            for (const change of e.changes) {
              for (const cell of change[2]) {
                addCellContentChangeHandler(cell);
              }
            }
            break;
          }
          case NotebookCellsChangeType.Move: {
            dto.push({
              kind: NotebookCellsChangeType.Move,
              index: e.index,
              length: e.length,
              newIdx: e.newIdx,
              cells: e.cells.map((cell) => cellToDto(cell))
            });
            break;
          }
          case NotebookCellsChangeType.ChangeCellContent:
            break;
          case NotebookCellsChangeType.ChangeDocumentMetadata:
            dto.push({
              kind: e.kind,
              metadata: e.metadata
            });
          default:
            dto.push(e);
        }
      });
      this._proxy.$acceptModelChanged(modelUrl.toString(), {
        rawEvents: dto,
        versionId: event.versionId
      });
    }));
    toDispose.add(model.onWillDispose(() => {
      this._stopModelSync(modelUrl);
    }));
    toDispose.add(toDisposable(() => {
      this._proxy.$acceptRemovedModel(modelUrl);
    }));
    this._syncedModels[modelUrl] = toDispose;
  }
  _stopModelSync(modelUrl) {
    const toDispose = this._syncedModels[modelUrl];
    delete this._syncedModels[modelUrl];
    delete this._syncedModelsLastUsedTime[modelUrl];
    dispose(toDispose);
  }
}
class NotebookWorkerClient extends Disposable {
  constructor(_notebookService, _modelService, _webWorkerService) {
    super();
    this._notebookService = _notebookService;
    this._modelService = _modelService;
    this._webWorkerService = _webWorkerService;
    this._worker = null;
    this._modelManager = null;
  }
  computeDiff(original, modified) {
    const proxy = this._ensureSyncedResources([original, modified]);
    return proxy.$computeDiff(original.toString(), modified.toString());
  }
  canPromptRecommendation(modelUri) {
    const proxy = this._ensureSyncedResources([modelUri]);
    return proxy.$canPromptRecommendation(modelUri.toString());
  }
  _getOrCreateModelManager(proxy) {
    if (!this._modelManager) {
      this._modelManager = this._register(new NotebookEditorModelManager(proxy, this._notebookService, this._modelService));
    }
    return this._modelManager;
  }
  _ensureSyncedResources(resources) {
    const proxy = this._getOrCreateWorker().proxy;
    this._getOrCreateModelManager(proxy).ensureSyncedResources(resources);
    return proxy;
  }
  _getOrCreateWorker() {
    if (!this._worker) {
      try {
        this._worker = this._register(this._webWorkerService.createWorkerClient(
          new WebWorkerDescriptor({
            esmModuleLocation: FileAccess.asBrowserUri("vs/workbench/contrib/notebook/common/services/notebookWebWorkerMain.js"),
            label: "NotebookEditorWorker"
          })
        ));
      } catch (err) {
        throw err;
      }
    }
    return this._worker;
  }
}
export {
  NotebookEditorWorkerServiceImpl
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxzZXJ2aWNlc1xcbm90ZWJvb2tXb3JrZXJTZXJ2aWNlSW1wbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVdlYldvcmtlckNsaWVudCwgUHJveGllZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3dvcmtlci93ZWJXb3JrZXIuanMnO1xuaW1wb3J0IHsgV2ViV29ya2VyRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dlYldvcmtlci9icm93c2VyL3dlYldvcmtlckRlc2NyaXB0b3IuanMnO1xuaW1wb3J0IHsgSVdlYldvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93ZWJXb3JrZXIvYnJvd3Nlci93ZWJXb3JrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5vdGVib29rQ2VsbFRleHRNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9ub3RlYm9va0NlbGxUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2VsbFVyaSwgSU1haW5DZWxsRHRvLCBJTm90ZWJvb2tEaWZmUmVzdWx0LCBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZSwgTm90ZWJvb2tSYXdDb250ZW50RXZlbnREdG8gfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tXb3JrZXIgfSBmcm9tICcuLi8uLi9jb21tb24vc2VydmljZXMvbm90ZWJvb2tXZWJXb3JrZXIuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRWRpdG9yV29ya2VyU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9ub3RlYm9va1dvcmtlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcywgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va0VkaXRvcldvcmtlclNlcnZpY2VJbXBsIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElOb3RlYm9va0VkaXRvcldvcmtlclNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF93b3JrZXJNYW5hZ2VyOiBXb3JrZXJNYW5hZ2VyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTm90ZWJvb2tTZXJ2aWNlIG5vdGVib29rU2VydmljZTogSU5vdGVib29rU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElXZWJXb3JrZXJTZXJ2aWNlIHdlYldvcmtlclNlcnZpY2U6IElXZWJXb3JrZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fd29ya2VyTWFuYWdlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBXb3JrZXJNYW5hZ2VyKG5vdGVib29rU2VydmljZSwgbW9kZWxTZXJ2aWNlLCB3ZWJXb3JrZXJTZXJ2aWNlKSk7XG5cdH1cblx0Y2FuQ29tcHV0ZURpZmYob3JpZ2luYWw6IFVSSSwgbW9kaWZpZWQ6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignTWV0aG9kIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdGNvbXB1dGVEaWZmKG9yaWdpbmFsOiBVUkksIG1vZGlmaWVkOiBVUkkpOiBQcm9taXNlPElOb3RlYm9va0RpZmZSZXN1bHQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fd29ya2VyTWFuYWdlci53aXRoV29ya2VyKCkudGhlbihjbGllbnQgPT4ge1xuXHRcdFx0cmV0dXJuIGNsaWVudC5jb21wdXRlRGlmZihvcmlnaW5hbCwgbW9kaWZpZWQpO1xuXHRcdH0pO1xuXHR9XG5cblx0Y2FuUHJvbXB0UmVjb21tZW5kYXRpb24obW9kZWw6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiB0aGlzLl93b3JrZXJNYW5hZ2VyLndpdGhXb3JrZXIoKS50aGVuKGNsaWVudCA9PiB7XG5cdFx0XHRyZXR1cm4gY2xpZW50LmNhblByb21wdFJlY29tbWVuZGF0aW9uKG1vZGVsKTtcblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBXb3JrZXJNYW5hZ2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgX2VkaXRvcldvcmtlckNsaWVudDogTm90ZWJvb2tXb3JrZXJDbGllbnQgfCBudWxsO1xuXHQvLyBwcml2YXRlIF9sYXN0V29ya2VyVXNlZFRpbWU6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va1NlcnZpY2U6IElOb3RlYm9va1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3dlYldvcmtlclNlcnZpY2U6IElXZWJXb3JrZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2VkaXRvcldvcmtlckNsaWVudCA9IG51bGw7XG5cdFx0Ly8gdGhpcy5fbGFzdFdvcmtlclVzZWRUaW1lID0gKG5ldyBEYXRlKCkpLmdldFRpbWUoKTtcblx0fVxuXG5cdHdpdGhXb3JrZXIoKTogUHJvbWlzZTxOb3RlYm9va1dvcmtlckNsaWVudD4ge1xuXHRcdC8vIHRoaXMuX2xhc3RXb3JrZXJVc2VkVGltZSA9IChuZXcgRGF0ZSgpKS5nZXRUaW1lKCk7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3JXb3JrZXJDbGllbnQpIHtcblx0XHRcdHRoaXMuX2VkaXRvcldvcmtlckNsaWVudCA9IG5ldyBOb3RlYm9va1dvcmtlckNsaWVudCh0aGlzLl9ub3RlYm9va1NlcnZpY2UsIHRoaXMuX21vZGVsU2VydmljZSwgdGhpcy5fd2ViV29ya2VyU2VydmljZSk7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3JXb3JrZXJDbGllbnQpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuX2VkaXRvcldvcmtlckNsaWVudCk7XG5cdH1cbn1cblxuY2xhc3MgTm90ZWJvb2tFZGl0b3JNb2RlbE1hbmFnZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBfc3luY2VkTW9kZWxzOiB7IFttb2RlbFVybDogc3RyaW5nXTogSURpc3Bvc2FibGUgfSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdHByaXZhdGUgX3N5bmNlZE1vZGVsc0xhc3RVc2VkVGltZTogeyBbbW9kZWxVcmw6IHN0cmluZ106IG51bWJlciB9ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9wcm94eTogUHJveGllZDxOb3RlYm9va1dvcmtlcj4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbm90ZWJvb2tTZXJ2aWNlOiBJTm90ZWJvb2tTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHB1YmxpYyBlbnN1cmVTeW5jZWRSZXNvdXJjZXMocmVzb3VyY2VzOiBVUklbXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgcmVzb3VyY2VzKSB7XG5cdFx0XHRjb25zdCByZXNvdXJjZVN0ciA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cblx0XHRcdGlmICghdGhpcy5fc3luY2VkTW9kZWxzW3Jlc291cmNlU3RyXSkge1xuXHRcdFx0XHR0aGlzLl9iZWdpbk1vZGVsU3luYyhyZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5fc3luY2VkTW9kZWxzW3Jlc291cmNlU3RyXSkge1xuXHRcdFx0XHR0aGlzLl9zeW5jZWRNb2RlbHNMYXN0VXNlZFRpbWVbcmVzb3VyY2VTdHJdID0gKG5ldyBEYXRlKCkpLmdldFRpbWUoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9iZWdpbk1vZGVsU3luYyhyZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9ub3RlYm9va1NlcnZpY2UubGlzdE5vdGVib29rRG9jdW1lbnRzKCkuZmluZChkb2N1bWVudCA9PiBkb2N1bWVudC51cmkudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsVXJsID0gcmVzb3VyY2UudG9TdHJpbmcoKTtcblxuXHRcdHRoaXMuX3Byb3h5LiRhY2NlcHROZXdNb2RlbChcblx0XHRcdG1vZGVsLnVyaS50b1N0cmluZygpLFxuXHRcdFx0bW9kZWwubWV0YWRhdGEsXG5cdFx0XHRtb2RlbC50cmFuc2llbnRPcHRpb25zLnRyYW5zaWVudERvY3VtZW50TWV0YWRhdGEsXG5cdFx0XHRtb2RlbC5jZWxscy5tYXAoY2VsbCA9PiAoe1xuXHRcdFx0XHRoYW5kbGU6IGNlbGwuaGFuZGxlLFxuXHRcdFx0XHR1cmw6IGNlbGwudXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdHNvdXJjZTogY2VsbC50ZXh0QnVmZmVyLmdldExpbmVzQ29udGVudCgpLFxuXHRcdFx0XHRlb2w6IGNlbGwudGV4dEJ1ZmZlci5nZXRFT0woKSxcblx0XHRcdFx0dmVyc2lvbklkOiBjZWxsLnRleHRNb2RlbD8uZ2V0VmVyc2lvbklkKCkgPz8gMCxcblx0XHRcdFx0bGFuZ3VhZ2U6IGNlbGwubGFuZ3VhZ2UsXG5cdFx0XHRcdG1pbWU6IGNlbGwubWltZSxcblx0XHRcdFx0Y2VsbEtpbmQ6IGNlbGwuY2VsbEtpbmQsXG5cdFx0XHRcdG91dHB1dHM6IGNlbGwub3V0cHV0cy5tYXAob3AgPT4gKHsgb3V0cHV0SWQ6IG9wLm91dHB1dElkLCBvdXRwdXRzOiBvcC5vdXRwdXRzIH0pKSxcblx0XHRcdFx0bWV0YWRhdGE6IGNlbGwubWV0YWRhdGEsXG5cdFx0XHRcdGludGVybmFsTWV0YWRhdGE6IGNlbGwuaW50ZXJuYWxNZXRhZGF0YSxcblx0XHRcdH0pKVxuXHRcdCk7XG5cblx0XHRjb25zdCB0b0Rpc3Bvc2UgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBjZWxsVG9EdG8gPSAoY2VsbDogTm90ZWJvb2tDZWxsVGV4dE1vZGVsKTogSU1haW5DZWxsRHRvID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGhhbmRsZTogY2VsbC5oYW5kbGUsXG5cdFx0XHRcdHVybDogY2VsbC51cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0c291cmNlOiBjZWxsLnRleHRCdWZmZXIuZ2V0TGluZXNDb250ZW50KCksXG5cdFx0XHRcdGVvbDogY2VsbC50ZXh0QnVmZmVyLmdldEVPTCgpLFxuXHRcdFx0XHR2ZXJzaW9uSWQ6IDAsXG5cdFx0XHRcdGxhbmd1YWdlOiBjZWxsLmxhbmd1YWdlLFxuXHRcdFx0XHRjZWxsS2luZDogY2VsbC5jZWxsS2luZCxcblx0XHRcdFx0b3V0cHV0czogY2VsbC5vdXRwdXRzLm1hcChvcCA9PiAoeyBvdXRwdXRJZDogb3Aub3V0cHV0SWQsIG91dHB1dHM6IG9wLm91dHB1dHMgfSkpLFxuXHRcdFx0XHRtZXRhZGF0YTogY2VsbC5tZXRhZGF0YSxcblx0XHRcdFx0aW50ZXJuYWxNZXRhZGF0YTogY2VsbC5pbnRlcm5hbE1ldGFkYXRhLFxuXHRcdFx0fTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgY2VsbEhhbmRsZXJzID0gbmV3IFNldDxOb3RlYm9va0NlbGxUZXh0TW9kZWw+KCk7XG5cdFx0Y29uc3QgYWRkQ2VsbENvbnRlbnRDaGFuZ2VIYW5kbGVyID0gKGNlbGw6IE5vdGVib29rQ2VsbFRleHRNb2RlbCkgPT4ge1xuXHRcdFx0Y2VsbEhhbmRsZXJzLmFkZChjZWxsKTtcblx0XHRcdHRvRGlzcG9zZS5hZGQoY2VsbC5vbkRpZENoYW5nZUNvbnRlbnQoKGUpID0+IHtcblx0XHRcdFx0aWYgKHR5cGVvZiBlID09PSAnb2JqZWN0JyAmJiBlLnR5cGUgPT09ICdtb2RlbCcpIHtcblx0XHRcdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0Q2VsbE1vZGVsQ2hhbmdlZChtb2RlbFVybCwgY2VsbC5oYW5kbGUsIGUuZXZlbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fTtcblxuXHRcdG1vZGVsLmNlbGxzLmZvckVhY2goY2VsbCA9PiBhZGRDZWxsQ29udGVudENoYW5nZUhhbmRsZXIoY2VsbCkpO1xuXHRcdC8vIFBvc3NpYmxlIHNvbWUgb2YgdGhlIG1vZGVscyBoYXZlIG5vdCB5ZXQgYmVlbiBsb2FkZWQuXG5cdFx0Ly8gSWYgYWxsIGhhdmUgYmVlbiBsb2FkZWQsIGZvciBhbGwgY2VsbHMsIHRoZW4gbm8gbmVlZCB0byBsaXN0ZW4gdG8gbW9kZWwgYWRkIGV2ZW50cy5cblx0XHRpZiAobW9kZWwuY2VsbHMubGVuZ3RoICE9PSBjZWxsSGFuZGxlcnMuc2l6ZSkge1xuXHRcdFx0dG9EaXNwb3NlLmFkZCh0aGlzLl9tb2RlbFNlcnZpY2Uub25Nb2RlbEFkZGVkKCh0ZXh0TW9kZWw6IElUZXh0TW9kZWwpID0+IHtcblx0XHRcdFx0aWYgKHRleHRNb2RlbC51cmkuc2NoZW1lICE9PSBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbCB8fCAhKHRleHRNb2RlbCBpbnN0YW5jZW9mIFRleHRNb2RlbCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY2VsbFVyaSA9IENlbGxVcmkucGFyc2UodGV4dE1vZGVsLnVyaSk7XG5cdFx0XHRcdGlmICghY2VsbFVyaSB8fCAhaXNFcXVhbChjZWxsVXJpLm5vdGVib29rLCBtb2RlbC51cmkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSBtb2RlbC5jZWxscy5maW5kKGNlbGwgPT4gY2VsbC5oYW5kbGUgPT09IGNlbGxVcmkuaGFuZGxlKTtcblx0XHRcdFx0aWYgKGNlbGwpIHtcblx0XHRcdFx0XHRhZGRDZWxsQ29udGVudENoYW5nZUhhbmRsZXIoY2VsbCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0b0Rpc3Bvc2UuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudCgoZXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGR0bzogTm90ZWJvb2tSYXdDb250ZW50RXZlbnREdG9bXSA9IFtdO1xuXHRcdFx0ZXZlbnQucmF3RXZlbnRzXG5cdFx0XHRcdC5mb3JFYWNoKGUgPT4ge1xuXHRcdFx0XHRcdHN3aXRjaCAoZS5raW5kKSB7XG5cdFx0XHRcdFx0XHRjYXNlIE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk1vZGVsQ2hhbmdlOlxuXHRcdFx0XHRcdFx0Y2FzZSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Jbml0aWFsaXplOiB7XG5cdFx0XHRcdFx0XHRcdGR0by5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRraW5kOiBlLmtpbmQsXG5cdFx0XHRcdFx0XHRcdFx0Y2hhbmdlczogZS5jaGFuZ2VzLm1hcChkaWZmID0+IFtkaWZmWzBdLCBkaWZmWzFdLCBkaWZmWzJdLm1hcChjZWxsID0+IGNlbGxUb0R0byhjZWxsIGFzIE5vdGVib29rQ2VsbFRleHRNb2RlbCkpXSBhcyBbbnVtYmVyLCBudW1iZXIsIElNYWluQ2VsbER0b1tdXSlcblx0XHRcdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgZS5jaGFuZ2VzKSB7XG5cdFx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBjZWxsIG9mIGNoYW5nZVsyXSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0YWRkQ2VsbENvbnRlbnRDaGFuZ2VIYW5kbGVyKGNlbGwgYXMgTm90ZWJvb2tDZWxsVGV4dE1vZGVsKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjYXNlIE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk1vdmU6IHtcblx0XHRcdFx0XHRcdFx0ZHRvLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRcdGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk1vdmUsXG5cdFx0XHRcdFx0XHRcdFx0aW5kZXg6IGUuaW5kZXgsXG5cdFx0XHRcdFx0XHRcdFx0bGVuZ3RoOiBlLmxlbmd0aCxcblx0XHRcdFx0XHRcdFx0XHRuZXdJZHg6IGUubmV3SWR4LFxuXHRcdFx0XHRcdFx0XHRcdGNlbGxzOiBlLmNlbGxzLm1hcChjZWxsID0+IGNlbGxUb0R0byhjZWxsIGFzIE5vdGVib29rQ2VsbFRleHRNb2RlbCkpXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNhc2UgTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlQ2VsbENvbnRlbnQ6XG5cdFx0XHRcdFx0XHRcdC8vIENoYW5nZXMgdG8gY2VsbCBjb250ZW50IGFyZSBoYW5kbGVkIGJ5IHRoZSBjZWxsIG1vZGVsIGNoYW5nZSBsaXN0ZW5lci5cblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRjYXNlIE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkNoYW5nZURvY3VtZW50TWV0YWRhdGE6XG5cdFx0XHRcdFx0XHRcdGR0by5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRraW5kOiBlLmtpbmQsXG5cdFx0XHRcdFx0XHRcdFx0bWV0YWRhdGE6IGUubWV0YWRhdGFcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0XHRkdG8ucHVzaChlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzLl9wcm94eS4kYWNjZXB0TW9kZWxDaGFuZ2VkKG1vZGVsVXJsLnRvU3RyaW5nKCksIHtcblx0XHRcdFx0cmF3RXZlbnRzOiBkdG8sXG5cdFx0XHRcdHZlcnNpb25JZDogZXZlbnQudmVyc2lvbklkXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0b0Rpc3Bvc2UuYWRkKG1vZGVsLm9uV2lsbERpc3Bvc2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5fc3RvcE1vZGVsU3luYyhtb2RlbFVybCk7XG5cdFx0fSkpO1xuXHRcdHRvRGlzcG9zZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX3Byb3h5LiRhY2NlcHRSZW1vdmVkTW9kZWwobW9kZWxVcmwpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3N5bmNlZE1vZGVsc1ttb2RlbFVybF0gPSB0b0Rpc3Bvc2U7XG5cdH1cblxuXHRwcml2YXRlIF9zdG9wTW9kZWxTeW5jKG1vZGVsVXJsOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCB0b0Rpc3Bvc2UgPSB0aGlzLl9zeW5jZWRNb2RlbHNbbW9kZWxVcmxdO1xuXHRcdGRlbGV0ZSB0aGlzLl9zeW5jZWRNb2RlbHNbbW9kZWxVcmxdO1xuXHRcdGRlbGV0ZSB0aGlzLl9zeW5jZWRNb2RlbHNMYXN0VXNlZFRpbWVbbW9kZWxVcmxdO1xuXHRcdGRpc3Bvc2UodG9EaXNwb3NlKTtcblx0fVxufVxuXG5jbGFzcyBOb3RlYm9va1dvcmtlckNsaWVudCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIF93b3JrZXI6IElXZWJXb3JrZXJDbGllbnQ8Tm90ZWJvb2tXb3JrZXI+IHwgbnVsbDtcblx0cHJpdmF0ZSBfbW9kZWxNYW5hZ2VyOiBOb3RlYm9va0VkaXRvck1vZGVsTWFuYWdlciB8IG51bGw7XG5cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va1NlcnZpY2U6IElOb3RlYm9va1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3dlYldvcmtlclNlcnZpY2U6IElXZWJXb3JrZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3dvcmtlciA9IG51bGw7XG5cdFx0dGhpcy5fbW9kZWxNYW5hZ2VyID0gbnVsbDtcblxuXHR9XG5cblx0Y29tcHV0ZURpZmYob3JpZ2luYWw6IFVSSSwgbW9kaWZpZWQ6IFVSSSkge1xuXHRcdGNvbnN0IHByb3h5ID0gdGhpcy5fZW5zdXJlU3luY2VkUmVzb3VyY2VzKFtvcmlnaW5hbCwgbW9kaWZpZWRdKTtcblx0XHRyZXR1cm4gcHJveHkuJGNvbXB1dGVEaWZmKG9yaWdpbmFsLnRvU3RyaW5nKCksIG1vZGlmaWVkLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0Y2FuUHJvbXB0UmVjb21tZW5kYXRpb24obW9kZWxVcmk6IFVSSSkge1xuXHRcdGNvbnN0IHByb3h5ID0gdGhpcy5fZW5zdXJlU3luY2VkUmVzb3VyY2VzKFttb2RlbFVyaV0pO1xuXHRcdHJldHVybiBwcm94eS4kY2FuUHJvbXB0UmVjb21tZW5kYXRpb24obW9kZWxVcmkudG9TdHJpbmcoKSk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRPckNyZWF0ZU1vZGVsTWFuYWdlcihwcm94eTogUHJveGllZDxOb3RlYm9va1dvcmtlcj4pOiBOb3RlYm9va0VkaXRvck1vZGVsTWFuYWdlciB7XG5cdFx0aWYgKCF0aGlzLl9tb2RlbE1hbmFnZXIpIHtcblx0XHRcdHRoaXMuX21vZGVsTWFuYWdlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBOb3RlYm9va0VkaXRvck1vZGVsTWFuYWdlcihwcm94eSwgdGhpcy5fbm90ZWJvb2tTZXJ2aWNlLCB0aGlzLl9tb2RlbFNlcnZpY2UpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsTWFuYWdlcjtcblx0fVxuXG5cdHByb3RlY3RlZCBfZW5zdXJlU3luY2VkUmVzb3VyY2VzKHJlc291cmNlczogVVJJW10pOiBQcm94aWVkPE5vdGVib29rV29ya2VyPiB7XG5cdFx0Y29uc3QgcHJveHkgPSB0aGlzLl9nZXRPckNyZWF0ZVdvcmtlcigpLnByb3h5O1xuXHRcdHRoaXMuX2dldE9yQ3JlYXRlTW9kZWxNYW5hZ2VyKHByb3h5KS5lbnN1cmVTeW5jZWRSZXNvdXJjZXMocmVzb3VyY2VzKTtcblx0XHRyZXR1cm4gcHJveHk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRPckNyZWF0ZVdvcmtlcigpOiBJV2ViV29ya2VyQ2xpZW50PE5vdGVib29rV29ya2VyPiB7XG5cdFx0aWYgKCF0aGlzLl93b3JrZXIpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHRoaXMuX3dvcmtlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dlYldvcmtlclNlcnZpY2UuY3JlYXRlV29ya2VyQ2xpZW50PE5vdGVib29rV29ya2VyPihcblx0XHRcdFx0XHRuZXcgV2ViV29ya2VyRGVzY3JpcHRvcih7XG5cdFx0XHRcdFx0XHRlc21Nb2R1bGVMb2NhdGlvbjogRmlsZUFjY2Vzcy5hc0Jyb3dzZXJVcmkoJ3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2NvbW1vbi9zZXJ2aWNlcy9ub3RlYm9va1dlYldvcmtlck1haW4uanMnKSxcblx0XHRcdFx0XHRcdGxhYmVsOiAnTm90ZWJvb2tFZGl0b3JXb3JrZXInXG5cdFx0XHRcdFx0fSlcblx0XHRcdFx0KSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhyb3cgKGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl93b3JrZXI7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZLGlCQUFpQixTQUFzQixvQkFBb0I7QUFHaEYsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxTQUE0QywrQkFBMkQ7QUFDaEgsU0FBUyx3QkFBd0I7QUFHakMsU0FBUyxxQkFBcUI7QUFFOUIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxZQUFZLGVBQWU7QUFDcEMsU0FBUyxl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
