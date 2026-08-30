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
import * as fs from "fs";
import { Throttler } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { dirname } from "../../../base/common/path.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
const IAgentHostStorageService = createDecorator("agentHostStorageService");
const defaultStorageWriter = {
  mkdir: (path) => fs.promises.mkdir(path, { recursive: true }).then(() => void 0),
  writeFile: (path, contents) => fs.promises.writeFile(path, contents, "utf8")
};
let AgentHostStorageService = class extends Disposable {
  constructor(_resource, _logService, _writer = defaultStorageWriter) {
    super();
    this._resource = _resource;
    this._logService = _logService;
    this._writer = _writer;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._writeThrottler = this._register(new Throttler());
    this._pendingWrites = /* @__PURE__ */ new Set();
    this._data = this._load();
  }
  get(key) {
    return this._data[key];
  }
  set(key, value) {
    this._data[key] = value;
    this._onDidChange.fire(key);
    this._scheduleWrite();
  }
  delete(key) {
    if (!Object.hasOwn(this._data, key)) {
      return;
    }
    delete this._data[key];
    this._onDidChange.fire(key);
    this._scheduleWrite();
  }
  async whenIdle() {
    while (this._pendingWrites.size > 0) {
      await Promise.allSettled([...this._pendingWrites]);
    }
  }
  _load() {
    if (this._resource === void 0) {
      return {};
    }
    try {
      const value = JSON.parse(fs.readFileSync(this._resource.fsPath, "utf8"));
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value;
      }
      this._logService.warn(`[AgentHostStorageService] Ignoring non-object storage data: ${this._resource.toString()}`);
    } catch (err) {
      if (err.code !== "ENOENT") {
        this._logService.warn(`[AgentHostStorageService] Failed to read storage: ${this._resource.toString()}`, err);
      }
    }
    return {};
  }
  _scheduleWrite() {
    const resource = this._resource;
    if (resource === void 0) {
      return;
    }
    const write = this._writeThrottler.queue(async () => {
      try {
        await this._writer.mkdir(dirname(resource.fsPath));
        await this._writer.writeFile(resource.fsPath, JSON.stringify(this._data));
      } catch (err) {
        this._logService.error(`[AgentHostStorageService] Failed to write storage: ${resource.toString()}`, err);
      }
    });
    this._pendingWrites.add(write);
    const untrack = () => this._pendingWrites.delete(write);
    write.then(untrack, untrack);
  }
};
AgentHostStorageService = __decorateClass([
  __decorateParam(1, ILogService)
], AgentHostStorageService);
export {
  AgentHostStorageService,
  IAgentHostStorageService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxhZ2VudEhvc3RTdG9yYWdlU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCB7IFRocm90dGxlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcblxuZXhwb3J0IGNvbnN0IElBZ2VudEhvc3RTdG9yYWdlU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJQWdlbnRIb3N0U3RvcmFnZVNlcnZpY2U+KCdhZ2VudEhvc3RTdG9yYWdlU2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEhvc3RTdG9yYWdlU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHN0cmluZz47XG5cdGdldDxUPihrZXk6IHN0cmluZyk6IFQgfCB1bmRlZmluZWQ7XG5cdHNldDxUPihrZXk6IHN0cmluZywgdmFsdWU6IFQpOiB2b2lkO1xuXHRkZWxldGUoa2V5OiBzdHJpbmcpOiB2b2lkO1xuXHR3aGVuSWRsZSgpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBZ2VudEhvc3RTdG9yYWdlV3JpdGVyIHtcblx0bWtkaXIocGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcblx0d3JpdGVGaWxlKHBhdGg6IHN0cmluZywgY29udGVudHM6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG59XG5cbmNvbnN0IGRlZmF1bHRTdG9yYWdlV3JpdGVyOiBJQWdlbnRIb3N0U3RvcmFnZVdyaXRlciA9IHtcblx0bWtkaXI6IHBhdGggPT4gZnMucHJvbWlzZXMubWtkaXIocGF0aCwgeyByZWN1cnNpdmU6IHRydWUgfSkudGhlbigoKSA9PiB1bmRlZmluZWQpLFxuXHR3cml0ZUZpbGU6IChwYXRoLCBjb250ZW50cykgPT4gZnMucHJvbWlzZXMud3JpdGVGaWxlKHBhdGgsIGNvbnRlbnRzLCAndXRmOCcpLFxufTtcblxuLyoqXG4gKiBBIHNtYWxsIGhvc3Qtb3duZWQgcGVyc2lzdGVudCBzdG9yZS4gUmVhZHMgYXJlIHN5bmNocm9ub3VzbHkgYXZhaWxhYmxlIGFmdGVyXG4gKiBjb25zdHJ1Y3Rpb247IHdyaXRlcyBhcmUgY29hbGVzY2VkIHNvIGNhbGxlcnMgbmV2ZXIgd2FpdCBvbiBkaXNrIEkvTy5cbiAqL1xuZXhwb3J0IGNsYXNzIEFnZW50SG9zdFN0b3JhZ2VTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RTdG9yYWdlU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF93cml0ZVRocm90dGxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaHJvdHRsZXIoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdXcml0ZXMgPSBuZXcgU2V0PFByb21pc2U8dm9pZD4+KCk7XG5cdHByaXZhdGUgX2RhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Jlc291cmNlOiBVUkkgfCB1bmRlZmluZWQsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3dyaXRlcjogSUFnZW50SG9zdFN0b3JhZ2VXcml0ZXIgPSBkZWZhdWx0U3RvcmFnZVdyaXRlcixcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9kYXRhID0gdGhpcy5fbG9hZCgpO1xuXHR9XG5cblx0Z2V0PFQ+KGtleTogc3RyaW5nKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2RhdGFba2V5XSBhcyBUIHwgdW5kZWZpbmVkO1xuXHR9XG5cblx0c2V0PFQ+KGtleTogc3RyaW5nLCB2YWx1ZTogVCk6IHZvaWQge1xuXHRcdHRoaXMuX2RhdGFba2V5XSA9IHZhbHVlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoa2V5KTtcblx0XHR0aGlzLl9zY2hlZHVsZVdyaXRlKCk7XG5cdH1cblxuXHRkZWxldGUoa2V5OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIU9iamVjdC5oYXNPd24odGhpcy5fZGF0YSwga2V5KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRkZWxldGUgdGhpcy5fZGF0YVtrZXldO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoa2V5KTtcblx0XHR0aGlzLl9zY2hlZHVsZVdyaXRlKCk7XG5cdH1cblxuXHRhc3luYyB3aGVuSWRsZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR3aGlsZSAodGhpcy5fcGVuZGluZ1dyaXRlcy5zaXplID4gMCkge1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKFsuLi50aGlzLl9wZW5kaW5nV3JpdGVzXSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbG9hZCgpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XG5cdFx0aWYgKHRoaXMuX3Jlc291cmNlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgdmFsdWU6IHVua25vd24gPSBKU09OLnBhcnNlKGZzLnJlYWRGaWxlU3luYyh0aGlzLl9yZXNvdXJjZS5mc1BhdGgsICd1dGY4JykpO1xuXHRcdFx0aWYgKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0XHRcdHJldHVybiB2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFN0b3JhZ2VTZXJ2aWNlXSBJZ25vcmluZyBub24tb2JqZWN0IHN0b3JhZ2UgZGF0YTogJHt0aGlzLl9yZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKChlcnIgYXMgTm9kZUpTLkVycm5vRXhjZXB0aW9uKS5jb2RlICE9PSAnRU5PRU5UJykge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RTdG9yYWdlU2VydmljZV0gRmFpbGVkIHRvIHJlYWQgc3RvcmFnZTogJHt0aGlzLl9yZXNvdXJjZS50b1N0cmluZygpfWAsIGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7fTtcblx0fVxuXG5cdHByaXZhdGUgX3NjaGVkdWxlV3JpdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLl9yZXNvdXJjZTtcblx0XHRpZiAocmVzb3VyY2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdyaXRlID0gdGhpcy5fd3JpdGVUaHJvdHRsZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fd3JpdGVyLm1rZGlyKGRpcm5hbWUocmVzb3VyY2UuZnNQYXRoKSk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3dyaXRlci53cml0ZUZpbGUocmVzb3VyY2UuZnNQYXRoLCBKU09OLnN0cmluZ2lmeSh0aGlzLl9kYXRhKSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0FnZW50SG9zdFN0b3JhZ2VTZXJ2aWNlXSBGYWlsZWQgdG8gd3JpdGUgc3RvcmFnZTogJHtyZXNvdXJjZS50b1N0cmluZygpfWAsIGVycik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fcGVuZGluZ1dyaXRlcy5hZGQod3JpdGUpO1xuXHRcdGNvbnN0IHVudHJhY2sgPSAoKSA9PiB0aGlzLl9wZW5kaW5nV3JpdGVzLmRlbGV0ZSh3cml0ZSk7XG5cdFx0d3JpdGUudGhlbih1bnRyYWNrLCB1bnRyYWNrKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFFBQVE7QUFDcEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFFeEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQkFBbUI7QUFFckIsTUFBTSwyQkFBMkIsZ0JBQTBDLHlCQUF5QjtBQWdCM0csTUFBTSx1QkFBZ0Q7QUFBQSxFQUNyRCxPQUFPLFVBQVEsR0FBRyxTQUFTLE1BQU0sTUFBTSxFQUFFLFdBQVcsS0FBSyxDQUFDLEVBQUUsS0FBSyxNQUFNLE1BQVM7QUFBQSxFQUNoRixXQUFXLENBQUMsTUFBTSxhQUFhLEdBQUcsU0FBUyxVQUFVLE1BQU0sVUFBVSxNQUFNO0FBQzVFO0FBTU8sSUFBTSwwQkFBTixjQUFzQyxXQUErQztBQUFBLEVBVTNGLFlBQ2tCLFdBQ2EsYUFDYixVQUFtQyxzQkFDbkQ7QUFDRCxVQUFNO0FBSlc7QUFDYTtBQUNiO0FBVmxCLFNBQWlCLGVBQWUsS0FBSyxVQUFVLElBQUksUUFBZ0IsQ0FBQztBQUNwRSxTQUFTLGNBQWMsS0FBSyxhQUFhO0FBRXpDLFNBQWlCLGtCQUFrQixLQUFLLFVBQVUsSUFBSSxVQUFVLENBQUM7QUFDakUsU0FBaUIsaUJBQWlCLG9CQUFJLElBQW1CO0FBU3hELFNBQUssUUFBUSxLQUFLLE1BQU07QUFBQSxFQUN6QjtBQUFBLEVBRUEsSUFBTyxLQUE0QjtBQUNsQyxXQUFPLEtBQUssTUFBTSxHQUFHO0FBQUEsRUFDdEI7QUFBQSxFQUVBLElBQU8sS0FBYSxPQUFnQjtBQUNuQyxTQUFLLE1BQU0sR0FBRyxJQUFJO0FBQ2xCLFNBQUssYUFBYSxLQUFLLEdBQUc7QUFDMUIsU0FBSyxlQUFlO0FBQUEsRUFDckI7QUFBQSxFQUVBLE9BQU8sS0FBbUI7QUFDekIsUUFBSSxDQUFDLE9BQU8sT0FBTyxLQUFLLE9BQU8sR0FBRyxHQUFHO0FBQ3BDO0FBQUEsSUFDRDtBQUNBLFdBQU8sS0FBSyxNQUFNLEdBQUc7QUFDckIsU0FBSyxhQUFhLEtBQUssR0FBRztBQUMxQixTQUFLLGVBQWU7QUFBQSxFQUNyQjtBQUFBLEVBRUEsTUFBTSxXQUEwQjtBQUMvQixXQUFPLEtBQUssZUFBZSxPQUFPLEdBQUc7QUFDcEMsWUFBTSxRQUFRLFdBQVcsQ0FBQyxHQUFHLEtBQUssY0FBYyxDQUFDO0FBQUEsSUFDbEQ7QUFBQSxFQUNEO0FBQUEsRUFFUSxRQUFpQztBQUN4QyxRQUFJLEtBQUssY0FBYyxRQUFXO0FBQ2pDLGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFFQSxRQUFJO0FBQ0gsWUFBTSxRQUFpQixLQUFLLE1BQU0sR0FBRyxhQUFhLEtBQUssVUFBVSxRQUFRLE1BQU0sQ0FBQztBQUNoRixVQUFJLFNBQVMsT0FBTyxVQUFVLFlBQVksQ0FBQyxNQUFNLFFBQVEsS0FBSyxHQUFHO0FBQ2hFLGVBQU87QUFBQSxNQUNSO0FBQ0EsV0FBSyxZQUFZLEtBQUssK0RBQStELEtBQUssVUFBVSxTQUFTLENBQUMsRUFBRTtBQUFBLElBQ2pILFNBQVMsS0FBSztBQUNiLFVBQUssSUFBOEIsU0FBUyxVQUFVO0FBQ3JELGFBQUssWUFBWSxLQUFLLHFEQUFxRCxLQUFLLFVBQVUsU0FBUyxDQUFDLElBQUksR0FBRztBQUFBLE1BQzVHO0FBQUEsSUFDRDtBQUNBLFdBQU8sQ0FBQztBQUFBLEVBQ1Q7QUFBQSxFQUVRLGlCQUF1QjtBQUM5QixVQUFNLFdBQVcsS0FBSztBQUN0QixRQUFJLGFBQWEsUUFBVztBQUMzQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFFBQVEsS0FBSyxnQkFBZ0IsTUFBTSxZQUFZO0FBQ3BELFVBQUk7QUFDSCxjQUFNLEtBQUssUUFBUSxNQUFNLFFBQVEsU0FBUyxNQUFNLENBQUM7QUFDakQsY0FBTSxLQUFLLFFBQVEsVUFBVSxTQUFTLFFBQVEsS0FBSyxVQUFVLEtBQUssS0FBSyxDQUFDO0FBQUEsTUFDekUsU0FBUyxLQUFLO0FBQ2IsYUFBSyxZQUFZLE1BQU0sc0RBQXNELFNBQVMsU0FBUyxDQUFDLElBQUksR0FBRztBQUFBLE1BQ3hHO0FBQUEsSUFDRCxDQUFDO0FBQ0QsU0FBSyxlQUFlLElBQUksS0FBSztBQUM3QixVQUFNLFVBQVUsTUFBTSxLQUFLLGVBQWUsT0FBTyxLQUFLO0FBQ3RELFVBQU0sS0FBSyxTQUFTLE9BQU87QUFBQSxFQUM1QjtBQUNEO0FBakZhLDBCQUFOO0FBQUEsRUFZSjtBQUFBLEdBWlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
