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
import { Worker } from "worker_threads";
import { Disposable } from "../../../base/common/lifecycle.js";
import { FileAccess } from "../../../base/common/network.js";
import { ILogService } from "../../log/common/log.js";
import { DEFAULT_DIFF_TIMEOUT_MS } from "../common/diffComputeService.js";
let NodeWorkerDiffComputeService = class extends Disposable {
  constructor(_logService) {
    super();
    this._logService = _logService;
    this._workerFailures = 0;
    this._nextId = 1;
    this._pending = /* @__PURE__ */ new Map();
  }
  async computeDiffCounts(original, modified, timeoutMs = DEFAULT_DIFF_TIMEOUT_MS) {
    return this._callWorker("computeDiffCounts", original, modified, timeoutMs);
  }
  async computeDetailedDiff(original, modified, timeoutMs = DEFAULT_DIFF_TIMEOUT_MS) {
    return this._callWorker("computeDetailedDiff", original, modified, timeoutMs);
  }
  async _callWorker(functionName, original, modified, timeoutMs) {
    const worker = this._ensureWorker();
    const id = this._nextId++;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve: (value) => resolve(value), reject });
      try {
        worker.postMessage({ id, fn: functionName, args: [original, modified, timeoutMs] });
      } catch (err) {
        this._pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }
  _ensureWorker() {
    if (this._workerFailures >= 3) {
      throw new Error("Diff compute worker failed too many times");
    }
    if (!this._worker) {
      const workerPath = FileAccess.asFileUri("vs/platform/agentHost/node/diffWorkerMain.js").fsPath;
      const w = new Worker(workerPath, { name: "Diff compute worker" });
      w.on("message", (msg) => {
        const handler = this._pending.get(msg.id);
        if (!handler) {
          return;
        }
        this._pending.delete(msg.id);
        if (msg.err) {
          const error = new Error(msg.err.message);
          if (msg.err.stack) {
            error.stack = msg.err.stack;
          }
          handler.reject(error);
        } else {
          handler.resolve(msg.res);
        }
      });
      w.on("error", (err) => {
        this._logService.error("[DiffComputeService] Worker error", err);
        for (const [, handler] of this._pending) {
          handler.reject(err);
        }
        this._pending.clear();
        this._worker = void 0;
        this._workerFailures++;
      });
      this._worker = w;
    }
    return this._worker;
  }
  dispose() {
    if (this._worker) {
      this._worker.terminate();
      this._worker = void 0;
    }
    for (const [, handler] of this._pending) {
      handler.reject(new Error("DiffComputeService disposed"));
    }
    this._pending.clear();
    super.dispose();
  }
};
NodeWorkerDiffComputeService = __decorateClass([
  __decorateParam(0, ILogService)
], NodeWorkerDiffComputeService);
export {
  NodeWorkerDiffComputeService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxkaWZmQ29tcHV0ZVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBXb3JrZXIgfSBmcm9tICd3b3JrZXJfdGhyZWFkcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9ESUZGX1RJTUVPVVRfTVMsIElEaWZmQ29tcHV0ZVNlcnZpY2UsIHR5cGUgSURldGFpbGVkRGlmZlJlc3VsdCwgdHlwZSBJRGlmZkNvdW50UmVzdWx0IH0gZnJvbSAnLi4vY29tbW9uL2RpZmZDb21wdXRlU2VydmljZS5qcyc7XG5cbi8qKlxuICogTm9kZS5qcyBpbXBsZW1lbnRhdGlvbiBvZiB7QGxpbmsgSURpZmZDb21wdXRlU2VydmljZX0gdGhhdCBydW5zXG4gKiB7QGxpbmsgRGVmYXVsdExpbmVzRGlmZkNvbXB1dGVyfSBpbiBhIHdvcmtlciB0aHJlYWQgdG8gYXZvaWQgYmxvY2tpbmdcbiAqIHRoZSBtYWluIHRocmVhZC5cbiAqL1xuZXhwb3J0IGNsYXNzIE5vZGVXb3JrZXJEaWZmQ29tcHV0ZVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSURpZmZDb21wdXRlU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfd29ya2VyOiBXb3JrZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3dvcmtlckZhaWx1cmVzID0gMDtcblx0cHJpdmF0ZSBfbmV4dElkID0gMTtcblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZyA9IG5ldyBNYXA8bnVtYmVyLCB7IHJlc29sdmU6ICh2YWx1ZTogSURpZmZDb3VudFJlc3VsdCB8IElEZXRhaWxlZERpZmZSZXN1bHQpID0+IHZvaWQ7IHJlamVjdDogKGVycjogRXJyb3IpID0+IHZvaWQgfT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhc3luYyBjb21wdXRlRGlmZkNvdW50cyhvcmlnaW5hbDogc3RyaW5nLCBtb2RpZmllZDogc3RyaW5nLCB0aW1lb3V0TXM6IG51bWJlciA9IERFRkFVTFRfRElGRl9USU1FT1VUX01TKTogUHJvbWlzZTxJRGlmZkNvdW50UmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NhbGxXb3JrZXIoJ2NvbXB1dGVEaWZmQ291bnRzJywgb3JpZ2luYWwsIG1vZGlmaWVkLCB0aW1lb3V0TXMpO1xuXHR9XG5cblx0YXN5bmMgY29tcHV0ZURldGFpbGVkRGlmZihvcmlnaW5hbDogc3RyaW5nLCBtb2RpZmllZDogc3RyaW5nLCB0aW1lb3V0TXM6IG51bWJlciA9IERFRkFVTFRfRElGRl9USU1FT1VUX01TKTogUHJvbWlzZTxJRGV0YWlsZWREaWZmUmVzdWx0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NhbGxXb3JrZXIoJ2NvbXB1dGVEZXRhaWxlZERpZmYnLCBvcmlnaW5hbCwgbW9kaWZpZWQsIHRpbWVvdXRNcyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jYWxsV29ya2VyPFQgZXh0ZW5kcyBJRGlmZkNvdW50UmVzdWx0IHwgSURldGFpbGVkRGlmZlJlc3VsdD4oZnVuY3Rpb25OYW1lOiBzdHJpbmcsIG9yaWdpbmFsOiBzdHJpbmcsIG1vZGlmaWVkOiBzdHJpbmcsIHRpbWVvdXRNczogbnVtYmVyKTogUHJvbWlzZTxUPiB7XG5cdFx0Y29uc3Qgd29ya2VyID0gdGhpcy5fZW5zdXJlV29ya2VyKCk7XG5cdFx0Y29uc3QgaWQgPSB0aGlzLl9uZXh0SWQrKztcblx0XHRyZXR1cm4gbmV3IFByb21pc2U8VD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0dGhpcy5fcGVuZGluZy5zZXQoaWQsIHsgcmVzb2x2ZTogdmFsdWUgPT4gcmVzb2x2ZSh2YWx1ZSBhcyBUKSwgcmVqZWN0IH0pO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0d29ya2VyLnBvc3RNZXNzYWdlKHsgaWQsIGZuOiBmdW5jdGlvbk5hbWUsIGFyZ3M6IFtvcmlnaW5hbCwgbW9kaWZpZWQsIHRpbWVvdXRNc10gfSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fcGVuZGluZy5kZWxldGUoaWQpO1xuXHRcdFx0XHRyZWplY3QoZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIgOiBuZXcgRXJyb3IoU3RyaW5nKGVycikpKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2Vuc3VyZVdvcmtlcigpOiBXb3JrZXIge1xuXHRcdGlmICh0aGlzLl93b3JrZXJGYWlsdXJlcyA+PSAzKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0RpZmYgY29tcHV0ZSB3b3JrZXIgZmFpbGVkIHRvbyBtYW55IHRpbWVzJyk7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5fd29ya2VyKSB7XG5cdFx0XHRjb25zdCB3b3JrZXJQYXRoID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJ3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2RpZmZXb3JrZXJNYWluLmpzJykuZnNQYXRoO1xuXHRcdFx0Y29uc3QgdyA9IG5ldyBXb3JrZXIod29ya2VyUGF0aCwgeyBuYW1lOiAnRGlmZiBjb21wdXRlIHdvcmtlcicgfSk7XG5cdFx0XHR3Lm9uKCdtZXNzYWdlJywgKG1zZzogeyBpZDogbnVtYmVyOyByZXM/OiBJRGlmZkNvdW50UmVzdWx0IHwgSURldGFpbGVkRGlmZlJlc3VsdDsgZXJyPzogeyBtZXNzYWdlOiBzdHJpbmc7IHN0YWNrPzogc3RyaW5nIH0gfSkgPT4ge1xuXHRcdFx0XHRjb25zdCBoYW5kbGVyID0gdGhpcy5fcGVuZGluZy5nZXQobXNnLmlkKTtcblx0XHRcdFx0aWYgKCFoYW5kbGVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmcuZGVsZXRlKG1zZy5pZCk7XG5cdFx0XHRcdGlmIChtc2cuZXJyKSB7XG5cdFx0XHRcdFx0Y29uc3QgZXJyb3IgPSBuZXcgRXJyb3IobXNnLmVyci5tZXNzYWdlKTtcblx0XHRcdFx0XHRpZiAobXNnLmVyci5zdGFjaykge1xuXHRcdFx0XHRcdFx0ZXJyb3Iuc3RhY2sgPSBtc2cuZXJyLnN0YWNrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRoYW5kbGVyLnJlamVjdChlcnJvcik7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aGFuZGxlci5yZXNvbHZlKG1zZy5yZXMhKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHR3Lm9uKCdlcnJvcicsIGVyciA9PiB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoJ1tEaWZmQ29tcHV0ZVNlcnZpY2VdIFdvcmtlciBlcnJvcicsIGVycik7XG5cdFx0XHRcdGZvciAoY29uc3QgWywgaGFuZGxlcl0gb2YgdGhpcy5fcGVuZGluZykge1xuXHRcdFx0XHRcdGhhbmRsZXIucmVqZWN0KGVycik7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fcGVuZGluZy5jbGVhcigpO1xuXHRcdFx0XHR0aGlzLl93b3JrZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX3dvcmtlckZhaWx1cmVzKys7XG5cdFx0XHR9KTtcblx0XHRcdHRoaXMuX3dvcmtlciA9IHc7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl93b3JrZXI7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl93b3JrZXIpIHtcblx0XHRcdHRoaXMuX3dvcmtlci50ZXJtaW5hdGUoKTtcblx0XHRcdHRoaXMuX3dvcmtlciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBbLCBoYW5kbGVyXSBvZiB0aGlzLl9wZW5kaW5nKSB7XG5cdFx0XHRoYW5kbGVyLnJlamVjdChuZXcgRXJyb3IoJ0RpZmZDb21wdXRlU2VydmljZSBkaXNwb3NlZCcpKTtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGNBQWM7QUFDdkIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywrQkFBcUc7QUFPdkcsSUFBTSwrQkFBTixjQUEyQyxXQUEwQztBQUFBLEVBUzNGLFlBQytCLGFBQzdCO0FBQ0QsVUFBTTtBQUZ3QjtBQUwvQixTQUFRLGtCQUFrQjtBQUMxQixTQUFRLFVBQVU7QUFDbEIsU0FBaUIsV0FBVyxvQkFBSSxJQUFnSDtBQUFBLEVBTWhKO0FBQUEsRUFFQSxNQUFNLGtCQUFrQixVQUFrQixVQUFrQixZQUFvQix5QkFBb0Q7QUFDbkksV0FBTyxLQUFLLFlBQVkscUJBQXFCLFVBQVUsVUFBVSxTQUFTO0FBQUEsRUFDM0U7QUFBQSxFQUVBLE1BQU0sb0JBQW9CLFVBQWtCLFVBQWtCLFlBQW9CLHlCQUF1RDtBQUN4SSxXQUFPLEtBQUssWUFBWSx1QkFBdUIsVUFBVSxVQUFVLFNBQVM7QUFBQSxFQUM3RTtBQUFBLEVBRUEsTUFBYyxZQUE4RCxjQUFzQixVQUFrQixVQUFrQixXQUErQjtBQUNwSyxVQUFNLFNBQVMsS0FBSyxjQUFjO0FBQ2xDLFVBQU0sS0FBSyxLQUFLO0FBQ2hCLFdBQU8sSUFBSSxRQUFXLENBQUMsU0FBUyxXQUFXO0FBQzFDLFdBQUssU0FBUyxJQUFJLElBQUksRUFBRSxTQUFTLFdBQVMsUUFBUSxLQUFVLEdBQUcsT0FBTyxDQUFDO0FBQ3ZFLFVBQUk7QUFDSCxlQUFPLFlBQVksRUFBRSxJQUFJLElBQUksY0FBYyxNQUFNLENBQUMsVUFBVSxVQUFVLFNBQVMsRUFBRSxDQUFDO0FBQUEsTUFDbkYsU0FBUyxLQUFLO0FBQ2IsYUFBSyxTQUFTLE9BQU8sRUFBRTtBQUN2QixlQUFPLGVBQWUsUUFBUSxNQUFNLElBQUksTUFBTSxPQUFPLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDM0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSxnQkFBd0I7QUFDL0IsUUFBSSxLQUFLLG1CQUFtQixHQUFHO0FBQzlCLFlBQU0sSUFBSSxNQUFNLDJDQUEyQztBQUFBLElBQzVEO0FBQ0EsUUFBSSxDQUFDLEtBQUssU0FBUztBQUNsQixZQUFNLGFBQWEsV0FBVyxVQUFVLDhDQUE4QyxFQUFFO0FBQ3hGLFlBQU0sSUFBSSxJQUFJLE9BQU8sWUFBWSxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFDaEUsUUFBRSxHQUFHLFdBQVcsQ0FBQyxRQUFpSDtBQUNqSSxjQUFNLFVBQVUsS0FBSyxTQUFTLElBQUksSUFBSSxFQUFFO0FBQ3hDLFlBQUksQ0FBQyxTQUFTO0FBQ2I7QUFBQSxRQUNEO0FBQ0EsYUFBSyxTQUFTLE9BQU8sSUFBSSxFQUFFO0FBQzNCLFlBQUksSUFBSSxLQUFLO0FBQ1osZ0JBQU0sUUFBUSxJQUFJLE1BQU0sSUFBSSxJQUFJLE9BQU87QUFDdkMsY0FBSSxJQUFJLElBQUksT0FBTztBQUNsQixrQkFBTSxRQUFRLElBQUksSUFBSTtBQUFBLFVBQ3ZCO0FBQ0Esa0JBQVEsT0FBTyxLQUFLO0FBQUEsUUFDckIsT0FBTztBQUNOLGtCQUFRLFFBQVEsSUFBSSxHQUFJO0FBQUEsUUFDekI7QUFBQSxNQUNELENBQUM7QUFDRCxRQUFFLEdBQUcsU0FBUyxTQUFPO0FBQ3BCLGFBQUssWUFBWSxNQUFNLHFDQUFxQyxHQUFHO0FBQy9ELG1CQUFXLENBQUMsRUFBRSxPQUFPLEtBQUssS0FBSyxVQUFVO0FBQ3hDLGtCQUFRLE9BQU8sR0FBRztBQUFBLFFBQ25CO0FBQ0EsYUFBSyxTQUFTLE1BQU07QUFDcEIsYUFBSyxVQUFVO0FBQ2YsYUFBSztBQUFBLE1BQ04sQ0FBQztBQUNELFdBQUssVUFBVTtBQUFBLElBQ2hCO0FBQ0EsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRVMsVUFBZ0I7QUFDeEIsUUFBSSxLQUFLLFNBQVM7QUFDakIsV0FBSyxRQUFRLFVBQVU7QUFDdkIsV0FBSyxVQUFVO0FBQUEsSUFDaEI7QUFDQSxlQUFXLENBQUMsRUFBRSxPQUFPLEtBQUssS0FBSyxVQUFVO0FBQ3hDLGNBQVEsT0FBTyxJQUFJLE1BQU0sNkJBQTZCLENBQUM7QUFBQSxJQUN4RDtBQUNBLFNBQUssU0FBUyxNQUFNO0FBQ3BCLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFDRDtBQXJGYSwrQkFBTjtBQUFBLEVBVUo7QUFBQSxHQVZVOyIsCiAgIm5hbWVzIjogW10KfQo=
