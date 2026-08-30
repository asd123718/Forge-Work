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
import { ThrottledDelayer } from "../../../base/common/async.js";
import { Event } from "../../../base/common/event.js";
import { Iterable } from "../../../base/common/iterator.js";
import { isObject } from "../../../base/common/types.js";
import { FileOperationResult, IFileService } from "../../files/common/files.js";
import { ILogService } from "../../log/common/log.js";
import { AbstractPolicyService } from "./policy.js";
function keysDiff(a, b) {
  const result = [];
  for (const key of new Set(Iterable.concat(a.keys(), b.keys()))) {
    if (a.get(key) !== b.get(key)) {
      result.push(key);
    }
  }
  return result;
}
let FilePolicyService = class extends AbstractPolicyService {
  constructor(file, fileService, logService) {
    super();
    this.file = file;
    this.fileService = fileService;
    this.logService = logService;
    this.throttledDelayer = this._register(new ThrottledDelayer(500));
    const onDidChangePolicyFile = Event.filter(fileService.onDidFilesChange, (e) => e.affects(file));
    this._register(fileService.watch(file));
    this._register(onDidChangePolicyFile(() => this.throttledDelayer.trigger(() => this.refresh())));
  }
  async _updatePolicyDefinitions() {
    await this.refresh();
  }
  async read() {
    const policies = /* @__PURE__ */ new Map();
    try {
      const content = await this.fileService.readFile(this.file);
      const raw = JSON.parse(content.value.toString());
      if (!isObject(raw)) {
        throw new Error("Policy file isn't a JSON object");
      }
      for (const key of Object.keys(raw)) {
        if (this.policyDefinitions[key]) {
          policies.set(key, raw[key]);
        }
      }
    } catch (error) {
      if (error.fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
        this.logService.error(`[FilePolicyService] Failed to read policies`, error);
      }
    }
    return policies;
  }
  async refresh() {
    const policies = await this.read();
    const diff = keysDiff(this.policies, policies);
    this.policies = policies;
    if (diff.length > 0) {
      this._onDidChange.fire(diff);
    }
  }
};
FilePolicyService = __decorateClass([
  __decorateParam(1, IFileService),
  __decorateParam(2, ILogService)
], FilePolicyService);
export {
  FilePolicyService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxccG9saWN5XFxjb21tb25cXGZpbGVQb2xpY3lTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVGhyb3R0bGVkRGVsYXllciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBQb2xpY3lOYW1lIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcG9saWN5LmpzJztcbmltcG9ydCB7IGlzT2JqZWN0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb25FcnJvciwgRmlsZU9wZXJhdGlvblJlc3VsdCwgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RQb2xpY3lTZXJ2aWNlLCBJUG9saWN5U2VydmljZSwgUG9saWN5VmFsdWUgfSBmcm9tICcuL3BvbGljeS5qcyc7XG5cbmZ1bmN0aW9uIGtleXNEaWZmPFQ+KGE6IE1hcDxzdHJpbmcsIFQ+LCBiOiBNYXA8c3RyaW5nLCBUPik6IHN0cmluZ1tdIHtcblx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXG5cdGZvciAoY29uc3Qga2V5IG9mIG5ldyBTZXQoSXRlcmFibGUuY29uY2F0KGEua2V5cygpLCBiLmtleXMoKSkpKSB7XG5cdFx0aWYgKGEuZ2V0KGtleSkgIT09IGIuZ2V0KGtleSkpIHtcblx0XHRcdHJlc3VsdC5wdXNoKGtleSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGNsYXNzIEZpbGVQb2xpY3lTZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RQb2xpY3lTZXJ2aWNlIGltcGxlbWVudHMgSVBvbGljeVNlcnZpY2Uge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdGhyb3R0bGVkRGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaHJvdHRsZWREZWxheWVyKDUwMCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZmlsZTogVVJJLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBvbkRpZENoYW5nZVBvbGljeUZpbGUgPSBFdmVudC5maWx0ZXIoZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZSwgZSA9PiBlLmFmZmVjdHMoZmlsZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGZpbGVTZXJ2aWNlLndhdGNoKGZpbGUpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihvbkRpZENoYW5nZVBvbGljeUZpbGUoKCkgPT4gdGhpcy50aHJvdHRsZWREZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy5yZWZyZXNoKCkpKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgX3VwZGF0ZVBvbGljeURlZmluaXRpb25zKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMucmVmcmVzaCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWFkKCk6IFByb21pc2U8TWFwPFBvbGljeU5hbWUsIFBvbGljeVZhbHVlPj4ge1xuXHRcdGNvbnN0IHBvbGljaWVzID0gbmV3IE1hcDxQb2xpY3lOYW1lLCBQb2xpY3lWYWx1ZT4oKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh0aGlzLmZpbGUpO1xuXHRcdFx0Y29uc3QgcmF3ID0gSlNPTi5wYXJzZShjb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpO1xuXG5cdFx0XHRpZiAoIWlzT2JqZWN0KHJhdykpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdQb2xpY3kgZmlsZSBpc25cXCd0IGEgSlNPTiBvYmplY3QnKTtcblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMocmF3KSkge1xuXHRcdFx0XHRpZiAodGhpcy5wb2xpY3lEZWZpbml0aW9uc1trZXldKSB7XG5cdFx0XHRcdFx0cG9saWNpZXMuc2V0KGtleSwgcmF3W2tleV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICgoPEZpbGVPcGVyYXRpb25FcnJvcj5lcnJvcikuZmlsZU9wZXJhdGlvblJlc3VsdCAhPT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtGaWxlUG9saWN5U2VydmljZV0gRmFpbGVkIHRvIHJlYWQgcG9saWNpZXNgLCBlcnJvcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBvbGljaWVzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWZyZXNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHBvbGljaWVzID0gYXdhaXQgdGhpcy5yZWFkKCk7XG5cdFx0Y29uc3QgZGlmZiA9IGtleXNEaWZmKHRoaXMucG9saWNpZXMsIHBvbGljaWVzKTtcblx0XHR0aGlzLnBvbGljaWVzID0gcG9saWNpZXM7XG5cblx0XHRpZiAoZGlmZi5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKGRpZmYpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxnQkFBZ0I7QUFFekIsU0FBNkIscUJBQXFCLG9CQUFvQjtBQUN0RSxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDZCQUEwRDtBQUVuRSxTQUFTLFNBQVksR0FBbUIsR0FBNkI7QUFDcEUsUUFBTSxTQUFtQixDQUFDO0FBRTFCLGFBQVcsT0FBTyxJQUFJLElBQUksU0FBUyxPQUFPLEVBQUUsS0FBSyxHQUFHLEVBQUUsS0FBSyxDQUFDLENBQUMsR0FBRztBQUMvRCxRQUFJLEVBQUUsSUFBSSxHQUFHLE1BQU0sRUFBRSxJQUFJLEdBQUcsR0FBRztBQUM5QixhQUFPLEtBQUssR0FBRztBQUFBLElBQ2hCO0FBQUEsRUFDRDtBQUVBLFNBQU87QUFDUjtBQUVPLElBQU0sb0JBQU4sY0FBZ0Msc0JBQWdEO0FBQUEsRUFJdEYsWUFDa0IsTUFDYyxhQUNELFlBQzdCO0FBQ0QsVUFBTTtBQUpXO0FBQ2M7QUFDRDtBQUwvQixTQUFpQixtQkFBbUIsS0FBSyxVQUFVLElBQUksaUJBQWlCLEdBQUcsQ0FBQztBQVMzRSxVQUFNLHdCQUF3QixNQUFNLE9BQU8sWUFBWSxrQkFBa0IsT0FBSyxFQUFFLFFBQVEsSUFBSSxDQUFDO0FBQzdGLFNBQUssVUFBVSxZQUFZLE1BQU0sSUFBSSxDQUFDO0FBQ3RDLFNBQUssVUFBVSxzQkFBc0IsTUFBTSxLQUFLLGlCQUFpQixRQUFRLE1BQU0sS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDO0FBQUEsRUFDaEc7QUFBQSxFQUVBLE1BQWdCLDJCQUEwQztBQUN6RCxVQUFNLEtBQUssUUFBUTtBQUFBLEVBQ3BCO0FBQUEsRUFFQSxNQUFjLE9BQThDO0FBQzNELFVBQU0sV0FBVyxvQkFBSSxJQUE2QjtBQUVsRCxRQUFJO0FBQ0gsWUFBTSxVQUFVLE1BQU0sS0FBSyxZQUFZLFNBQVMsS0FBSyxJQUFJO0FBQ3pELFlBQU0sTUFBTSxLQUFLLE1BQU0sUUFBUSxNQUFNLFNBQVMsQ0FBQztBQUUvQyxVQUFJLENBQUMsU0FBUyxHQUFHLEdBQUc7QUFDbkIsY0FBTSxJQUFJLE1BQU0saUNBQWtDO0FBQUEsTUFDbkQ7QUFFQSxpQkFBVyxPQUFPLE9BQU8sS0FBSyxHQUFHLEdBQUc7QUFDbkMsWUFBSSxLQUFLLGtCQUFrQixHQUFHLEdBQUc7QUFDaEMsbUJBQVMsSUFBSSxLQUFLLElBQUksR0FBRyxDQUFDO0FBQUEsUUFDM0I7QUFBQSxNQUNEO0FBQUEsSUFDRCxTQUFTLE9BQU87QUFDZixVQUF5QixNQUFPLHdCQUF3QixvQkFBb0IsZ0JBQWdCO0FBQzNGLGFBQUssV0FBVyxNQUFNLCtDQUErQyxLQUFLO0FBQUEsTUFDM0U7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMsVUFBeUI7QUFDdEMsVUFBTSxXQUFXLE1BQU0sS0FBSyxLQUFLO0FBQ2pDLFVBQU0sT0FBTyxTQUFTLEtBQUssVUFBVSxRQUFRO0FBQzdDLFNBQUssV0FBVztBQUVoQixRQUFJLEtBQUssU0FBUyxHQUFHO0FBQ3BCLFdBQUssYUFBYSxLQUFLLElBQUk7QUFBQSxJQUM1QjtBQUFBLEVBQ0Q7QUFDRDtBQXREYSxvQkFBTjtBQUFBLEVBTUo7QUFBQSxFQUNBO0FBQUEsR0FQVTsiLAogICJuYW1lcyI6IFtdCn0K
