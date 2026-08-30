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
import { mock } from "../../../../../base/test/common/mock.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { assertType } from "../../../../../base/common/types.js";
import { EditorWorker } from "../../../../../editor/common/services/editorWebWorker.js";
import { LineRange } from "../../../../../editor/common/core/ranges/lineRange.js";
import { MovedText } from "../../../../../editor/common/diff/linesDiffComputer.js";
import { LineRangeMapping, DetailedLineRangeMapping, RangeMapping } from "../../../../../editor/common/diff/rangeMapping.js";
import { disposableTimeout } from "../../../../../base/common/async.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
let TestWorkerService = class extends mock() {
  constructor(_modelService) {
    super();
    this._modelService = _modelService;
    this._store = new DisposableStore();
    this._worker = this._store.add(new EditorWorker());
  }
  dispose() {
    this._store.dispose();
  }
  async computeMoreMinimalEdits(resource, edits, pretty) {
    return void 0;
  }
  async computeDiff(original, modified, options, algorithm) {
    await new Promise((resolve) => disposableTimeout(() => resolve(), 0, this._store));
    if (this._store.isDisposed) {
      return null;
    }
    const originalModel = this._modelService.getModel(original);
    const modifiedModel = this._modelService.getModel(modified);
    assertType(originalModel);
    assertType(modifiedModel);
    this._worker.$acceptNewModel({
      url: originalModel.uri.toString(),
      versionId: originalModel.getVersionId(),
      lines: originalModel.getLinesContent(),
      EOL: originalModel.getEOL()
    });
    this._worker.$acceptNewModel({
      url: modifiedModel.uri.toString(),
      versionId: modifiedModel.getVersionId(),
      lines: modifiedModel.getLinesContent(),
      EOL: modifiedModel.getEOL()
    });
    const result = await this._worker.$computeDiff(originalModel.uri.toString(), modifiedModel.uri.toString(), options, algorithm);
    if (!result) {
      return result;
    }
    const diff = {
      identical: result.identical,
      quitEarly: result.quitEarly,
      changes: toLineRangeMappings(result.changes),
      moves: result.moves.map((m) => new MovedText(
        new LineRangeMapping(new LineRange(m[0], m[1]), new LineRange(m[2], m[3])),
        toLineRangeMappings(m[4])
      ))
    };
    return diff;
    function toLineRangeMappings(changes) {
      return changes.map(
        (c) => new DetailedLineRangeMapping(
          new LineRange(c[0], c[1]),
          new LineRange(c[2], c[3]),
          c[4]?.map(
            (c2) => new RangeMapping(
              new Range(c2[0], c2[1], c2[2], c2[3]),
              new Range(c2[4], c2[5], c2[6], c2[7])
            )
          )
        )
      );
    }
  }
};
TestWorkerService = __decorateClass([
  __decorateParam(0, IModelService)
], TestWorkerService);
export {
  TestWorkerService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGlubGluZUNoYXRcXHRlc3RcXGJyb3dzZXJcXHRlc3RXb3JrZXJTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IGFzc2VydFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBEaWZmQWxnb3JpdGhtTmFtZSwgSUVkaXRvcldvcmtlclNlcnZpY2UsIElMaW5lQ2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9lZGl0b3JXb3JrZXIuanMnO1xuaW1wb3J0IHsgSURvY3VtZW50RGlmZiwgSURvY3VtZW50RGlmZlByb3ZpZGVyT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZGlmZi9kb2N1bWVudERpZmZQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JXb3JrZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2VkaXRvcldlYldvcmtlci5qcyc7XG5pbXBvcnQgeyBMaW5lUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2VzL2xpbmVSYW5nZS5qcyc7XG5pbXBvcnQgeyBNb3ZlZFRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2RpZmYvbGluZXNEaWZmQ29tcHV0ZXIuanMnO1xuaW1wb3J0IHsgTGluZVJhbmdlTWFwcGluZywgRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nLCBSYW5nZU1hcHBpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2RpZmYvcmFuZ2VNYXBwaW5nLmpzJztcbmltcG9ydCB7IFRleHRFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuXG5leHBvcnQgY2xhc3MgVGVzdFdvcmtlclNlcnZpY2UgZXh0ZW5kcyBtb2NrPElFZGl0b3JXb3JrZXJTZXJ2aWNlPigpIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF93b3JrZXIgPSB0aGlzLl9zdG9yZS5hZGQobmV3IEVkaXRvcldvcmtlcigpKTtcblxuXHRjb25zdHJ1Y3RvcihASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdG9yZS5kaXNwb3NlKCk7XG5cdH1cblx0b3ZlcnJpZGUgYXN5bmMgY29tcHV0ZU1vcmVNaW5pbWFsRWRpdHMocmVzb3VyY2U6IFVSSSwgZWRpdHM6IFRleHRFZGl0W10gfCBudWxsIHwgdW5kZWZpbmVkLCBwcmV0dHk/OiBib29sZWFuIHwgdW5kZWZpbmVkKTogUHJvbWlzZTxUZXh0RWRpdFtdIHwgdW5kZWZpbmVkPiB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGNvbXB1dGVEaWZmKG9yaWdpbmFsOiBVUkksIG1vZGlmaWVkOiBVUkksIG9wdGlvbnM6IElEb2N1bWVudERpZmZQcm92aWRlck9wdGlvbnMsIGFsZ29yaXRobTogRGlmZkFsZ29yaXRobU5hbWUpOiBQcm9taXNlPElEb2N1bWVudERpZmYgfCBudWxsPiB7XG5cdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiByZXNvbHZlKCksIDAsIHRoaXMuX3N0b3JlKSk7XG5cdFx0aWYgKHRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9yaWdpbmFsTW9kZWwgPSB0aGlzLl9tb2RlbFNlcnZpY2UuZ2V0TW9kZWwob3JpZ2luYWwpO1xuXHRcdGNvbnN0IG1vZGlmaWVkTW9kZWwgPSB0aGlzLl9tb2RlbFNlcnZpY2UuZ2V0TW9kZWwobW9kaWZpZWQpO1xuXG5cdFx0YXNzZXJ0VHlwZShvcmlnaW5hbE1vZGVsKTtcblx0XHRhc3NlcnRUeXBlKG1vZGlmaWVkTW9kZWwpO1xuXG5cdFx0dGhpcy5fd29ya2VyLiRhY2NlcHROZXdNb2RlbCh7XG5cdFx0XHR1cmw6IG9yaWdpbmFsTW9kZWwudXJpLnRvU3RyaW5nKCksXG5cdFx0XHR2ZXJzaW9uSWQ6IG9yaWdpbmFsTW9kZWwuZ2V0VmVyc2lvbklkKCksXG5cdFx0XHRsaW5lczogb3JpZ2luYWxNb2RlbC5nZXRMaW5lc0NvbnRlbnQoKSxcblx0XHRcdEVPTDogb3JpZ2luYWxNb2RlbC5nZXRFT0woKSxcblx0XHR9KTtcblxuXHRcdHRoaXMuX3dvcmtlci4kYWNjZXB0TmV3TW9kZWwoe1xuXHRcdFx0dXJsOiBtb2RpZmllZE1vZGVsLnVyaS50b1N0cmluZygpLFxuXHRcdFx0dmVyc2lvbklkOiBtb2RpZmllZE1vZGVsLmdldFZlcnNpb25JZCgpLFxuXHRcdFx0bGluZXM6IG1vZGlmaWVkTW9kZWwuZ2V0TGluZXNDb250ZW50KCksXG5cdFx0XHRFT0w6IG1vZGlmaWVkTW9kZWwuZ2V0RU9MKCksXG5cdFx0fSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl93b3JrZXIuJGNvbXB1dGVEaWZmKG9yaWdpbmFsTW9kZWwudXJpLnRvU3RyaW5nKCksIG1vZGlmaWVkTW9kZWwudXJpLnRvU3RyaW5nKCksIG9wdGlvbnMsIGFsZ29yaXRobSk7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHRcdC8vIENvbnZlcnQgZnJvbSBzcGFjZSBlZmZpY2llbnQgSlNPTiBkYXRhIHRvIHJpY2ggb2JqZWN0cy5cblx0XHRjb25zdCBkaWZmOiBJRG9jdW1lbnREaWZmID0ge1xuXHRcdFx0aWRlbnRpY2FsOiByZXN1bHQuaWRlbnRpY2FsLFxuXHRcdFx0cXVpdEVhcmx5OiByZXN1bHQucXVpdEVhcmx5LFxuXHRcdFx0Y2hhbmdlczogdG9MaW5lUmFuZ2VNYXBwaW5ncyhyZXN1bHQuY2hhbmdlcyksXG5cdFx0XHRtb3ZlczogcmVzdWx0Lm1vdmVzLm1hcChtID0+IG5ldyBNb3ZlZFRleHQoXG5cdFx0XHRcdG5ldyBMaW5lUmFuZ2VNYXBwaW5nKG5ldyBMaW5lUmFuZ2UobVswXSwgbVsxXSksIG5ldyBMaW5lUmFuZ2UobVsyXSwgbVszXSkpLFxuXHRcdFx0XHR0b0xpbmVSYW5nZU1hcHBpbmdzKG1bNF0pXG5cdFx0XHQpKVxuXHRcdH07XG5cdFx0cmV0dXJuIGRpZmY7XG5cblx0XHRmdW5jdGlvbiB0b0xpbmVSYW5nZU1hcHBpbmdzKGNoYW5nZXM6IHJlYWRvbmx5IElMaW5lQ2hhbmdlW10pOiByZWFkb25seSBEZXRhaWxlZExpbmVSYW5nZU1hcHBpbmdbXSB7XG5cdFx0XHRyZXR1cm4gY2hhbmdlcy5tYXAoXG5cdFx0XHRcdChjKSA9PiBuZXcgRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nKFxuXHRcdFx0XHRcdG5ldyBMaW5lUmFuZ2UoY1swXSwgY1sxXSksXG5cdFx0XHRcdFx0bmV3IExpbmVSYW5nZShjWzJdLCBjWzNdKSxcblx0XHRcdFx0XHRjWzRdPy5tYXAoXG5cdFx0XHRcdFx0XHQoYykgPT4gbmV3IFJhbmdlTWFwcGluZyhcblx0XHRcdFx0XHRcdFx0bmV3IFJhbmdlKGNbMF0sIGNbMV0sIGNbMl0sIGNbM10pLFxuXHRcdFx0XHRcdFx0XHRuZXcgUmFuZ2UoY1s0XSwgY1s1XSwgY1s2XSwgY1s3XSlcblx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHQpXG5cdFx0XHRcdClcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWTtBQUNyQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxrQkFBa0I7QUFHM0IsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxp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
